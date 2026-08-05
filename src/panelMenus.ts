import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';
import St from 'gi://St';
import Clutter from 'gi://Clutter';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {SignalTracker} from './signals.js';

type ApplicationInfo = {
    get_id: () => string | null;
    get_display_name: () => string;
    get_icon: () => unknown;
    should_show: () => boolean;
    get_categories?: () => string | null;
    launch: (files?: unknown[] | null, context?: unknown | null) => boolean;
};

type Place = {
    name: string;
    uri: string;
    icon: Gio.Icon | string;
};

const APP_CATEGORIES = [
    {id: 'AudioVideo', label: 'Multimídia'},
    {id: 'Development', label: 'Desenvolvimento'},
    {id: 'Education', label: 'Educação'},
    {id: 'Game', label: 'Jogos'},
    {id: 'Graphics', label: 'Gráficos'},
    {id: 'Network', label: 'Internet'},
    {id: 'Office', label: 'Escritório'},
    {id: 'Science', label: 'Ciência'},
    {id: 'Settings', label: 'Configurações'},
    {id: 'System', label: 'Sistema'},
    {id: 'Utility', label: 'Acessórios'},
] as const;

const SPECIAL_DIRECTORIES: Array<[GLib.UserDirectory, string, string]> = [
    [GLib.UserDirectory.DIRECTORY_DESKTOP, 'Área de trabalho', 'user-desktop-symbolic'],
    [GLib.UserDirectory.DIRECTORY_DOCUMENTS, 'Documentos', 'folder-documents-symbolic'],
    [GLib.UserDirectory.DIRECTORY_DOWNLOAD, 'Downloads', 'folder-download-symbolic'],
    [GLib.UserDirectory.DIRECTORY_MUSIC, 'Música', 'folder-music-symbolic'],
    [GLib.UserDirectory.DIRECTORY_PICTURES, 'Imagens', 'folder-pictures-symbolic'],
    [GLib.UserDirectory.DIRECTORY_VIDEOS, 'Vídeos', 'folder-videos-symbolic'],
];

function panelLabel(text: string, iconName: string): St.BoxLayout {
    const box = new St.BoxLayout({style_class: 'panel-status-menu-box'});
    box.add_child(new St.Icon({
        icon_name: iconName,
        style_class: 'system-status-icon sheliak-panel-menu-icon',
    }));
    box.add_child(new St.Label({
        text,
        y_align: Clutter.ActorAlign.CENTER,
    }));
    return box;
}

function normalizedUri(uri: string): string {
    return uri === 'file:///' ? uri : uri.replace(/\/$/, '');
}

function openUri(uri: string): void {
    try {
        Gio.AppInfo.launch_default_for_uri(
            uri, null);
    } catch (error) {
        console.error(`Sheliak: não foi possível abrir ${uri}: ${error}`);
        Main.notifyError('Não foi possível abrir o local', String(error));
    }
}

class ApplicationsIndicator {
    readonly button: PanelMenu.Button;
    private _settings: Gio.Settings;
    private _appSystem = Shell.AppSystem.get_default();
    private _signals = new SignalTracker();

    constructor(settings: Gio.Settings) {
        this._settings = settings;
        this.button = new PanelMenu.Button(0.0, 'Aplicativos');
        this.button.add_child(panelLabel('Aplicativos', 'view-app-grid-symbolic'));
        (this.button.menu as PopupMenu.PopupMenu).actor
            .add_style_class_name('sheliak-panel-menu');

        this._signals.connect(this._appSystem, 'installed-changed', () => this._rebuild());
        this._signals.connect(this._settings, 'changed::show-application-icons',
            () => this._rebuild());
        this._rebuild();
    }

    destroy(): void {
        this._signals.destroy();
        this.button.destroy();
    }

    private _rebuild(): void {
        const menu = this.button.menu as PopupMenu.PopupMenu;
        menu.removeAll();

        const groups = new Map<string, ApplicationInfo[]>();
        for (const category of APP_CATEGORIES)
            groups.set(category.id, []);
        groups.set('Other', []);

        const seen = new Set<string>();
        for (const appInfo of this._appSystem.get_installed() as unknown as ApplicationInfo[]) {
            const id = appInfo.get_id();
            if (!id || seen.has(id) || !appInfo.should_show())
                continue;
            seen.add(id);

            const rawCategories = appInfo.get_categories?.() ?? '';
            const categories = new Set(rawCategories.split(';').filter(Boolean));
            const category = APP_CATEGORIES.find(item => categories.has(item.id));
            groups.get(category?.id ?? 'Other')?.push(appInfo);
        }

        const showIcons = this._settings.get_boolean('show-application-icons');
        let itemCount = 0;
        for (const category of [...APP_CATEGORIES, {id: 'Other', label: 'Outros'}]) {
            const apps = groups.get(category.id) ?? [];
            if (apps.length === 0)
                continue;

            apps.sort((a, b) => a.get_display_name().localeCompare(
                b.get_display_name(), undefined, {sensitivity: 'base'}));
            const submenu = new PopupMenu.PopupSubMenuMenuItem(category.label);
            for (const appInfo of apps) {
                const icon = appInfo.get_icon()
                    ? appInfo.get_icon() as Gio.Icon
                    : 'application-x-executable-symbolic';
                const item = showIcons
                    ? new PopupMenu.PopupImageMenuItem(appInfo.get_display_name(), icon)
                    : new PopupMenu.PopupMenuItem(appInfo.get_display_name());
                item.connect('activate', () => this._launch(appInfo));
                submenu.menu.addMenuItem(item);
                itemCount++;
            }
            menu.addMenuItem(submenu);
        }

        if (itemCount === 0) {
            menu.addMenuItem(new PopupMenu.PopupMenuItem(
                'Nenhum aplicativo encontrado', {reactive: false}));
        }
    }

    private _launch(appInfo: ApplicationInfo): void {
        const id = appInfo.get_id();
        const app = id ? this._appSystem.lookup_app(id) : null;
        try {
            if (app)
                app.activate();
            else
                appInfo.launch([], null);
        } catch (error) {
            console.error(`Sheliak: falha ao abrir ${appInfo.get_display_name()}: ${error}`);
            Main.notifyError('Não foi possível abrir o aplicativo', String(error));
        }
    }
}

class PlacesIndicator {
    readonly button: PanelMenu.Button;
    private _settings: Gio.Settings;
    private _volumeMonitor = Gio.VolumeMonitor.get();
    private _signals = new SignalTracker();

    constructor(settings: Gio.Settings) {
        this._settings = settings;
        this.button = new PanelMenu.Button(0.0, 'Locais');
        this.button.add_child(panelLabel('Locais', 'folder-symbolic'));
        (this.button.menu as PopupMenu.PopupMenu).actor
            .add_style_class_name('sheliak-panel-menu');

        for (const signal of ['mount-added', 'mount-changed', 'mount-removed',
            'volume-added', 'volume-changed', 'volume-removed']) {
            this._signals.connect(this._volumeMonitor, signal, () => this._rebuild());
        }
        for (const key of ['show-place-bookmarks', 'show-place-volumes']) {
            this._signals.connect(this._settings, `changed::${key}`, () => this._rebuild());
        }
        // Recarregar ao abrir também captura alterações no arquivo de marcadores
        // feitas pelo Nautilus sem manter monitores separados para GTK 3 e GTK 4.
        this._signals.connect(this.button.menu, 'open-state-changed',
            (_menu, open: boolean) => {
                if (open)
                    this._rebuild();
            });
        this._rebuild();
    }

    destroy(): void {
        this._signals.destroy();
        this.button.destroy();
    }

    private _rebuild(): void {
        const menu = this.button.menu as PopupMenu.PopupMenu;
        menu.removeAll();
        const seen = new Set<string>();

        const personal = this._personalPlaces(seen);
        if (personal.length > 0) {
            menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem('Pessoais'));
            for (const place of personal)
                menu.addMenuItem(this._placeItem(place));
        }

        if (this._settings.get_boolean('show-place-bookmarks')) {
            const bookmarks = this._bookmarks(seen);
            if (bookmarks.length > 0) {
                menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem('Marcadores'));
                for (const place of bookmarks)
                    menu.addMenuItem(this._placeItem(place));
            }
        }

        if (this._settings.get_boolean('show-place-volumes')) {
            const volumes = this._mountedVolumes(seen);
            if (volumes.length > 0) {
                menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem('Dispositivos'));
                for (const place of volumes)
                    menu.addMenuItem(this._placeItem(place));
            }
        }
    }

    private _placeItem(place: Place): PopupMenu.PopupImageMenuItem {
        const item = new PopupMenu.PopupImageMenuItem(place.name, place.icon);
        item.connect('activate', () => openUri(place.uri));
        return item;
    }

    private _personalPlaces(seen: Set<string>): Place[] {
        const places: Place[] = [];
        this._appendUnique(places, seen, {
            name: 'Pasta pessoal',
            uri: Gio.File.new_for_path(GLib.get_home_dir()).get_uri(),
            icon: 'user-home-symbolic',
        });

        for (const [directory, name, icon] of SPECIAL_DIRECTORIES) {
            const path = GLib.get_user_special_dir(directory);
            if (!path)
                continue;
            const file = Gio.File.new_for_path(path);
            if (file.query_exists(null))
                this._appendUnique(places, seen, {name, uri: file.get_uri(), icon});
        }
        return places;
    }

    private _bookmarks(seen: Set<string>): Place[] {
        const places: Place[] = [];
        const bookmarkFiles = [
            GLib.build_filenamev([GLib.get_user_config_dir(), 'gtk-3.0', 'bookmarks']),
            GLib.build_filenamev([GLib.get_user_config_dir(), 'gtk-4.0', 'bookmarks']),
            GLib.build_filenamev([GLib.get_home_dir(), '.gtk-bookmarks']),
        ];

        for (const path of bookmarkFiles) {
            const file = Gio.File.new_for_path(path);
            if (!file.query_exists(null))
                continue;
            try {
                const [ok, contents] = file.load_contents(null);
                if (!ok)
                    continue;
                for (const line of new TextDecoder().decode(contents).split('\n')) {
                    const match = line.trim().match(/^(\S+)(?:\s+(.+))?$/);
                    if (!match)
                        continue;
                    const uri = match[1];
                    const bookmark = Gio.File.new_for_uri(uri);
                    let name = match[2]?.trim();
                    if (!name) {
                        const basename = bookmark.get_basename() ?? uri;
                        try {
                            name = decodeURIComponent(basename);
                        } catch {
                            name = basename;
                        }
                    }
                    const icon = uri.startsWith('file:')
                        ? 'folder-symbolic'
                        : 'folder-remote-symbolic';
                    this._appendUnique(places, seen, {name, uri, icon});
                }
            } catch (error) {
                console.debug(`Sheliak: não foi possível ler ${path}: ${error}`);
            }
        }
        return places;
    }

    private _mountedVolumes(seen: Set<string>): Place[] {
        const places: Place[] = [];
        const mounts = this._volumeMonitor.get_mounts()
            .filter(mount => !mount.is_shadowed())
            .sort((a, b) => a.get_name().localeCompare(
                b.get_name(), undefined, {sensitivity: 'base'}));

        for (const mount of mounts) {
            const root = mount.get_root();
            const uri = root.get_uri();
            const path = root.get_path();
            const isRemote = !uri.startsWith('file:');
            const isUserVisibleLocal = mount.get_volume() !== null;
            const isDocumentPortal = path?.includes('/doc/') ?? false;
            if (uri === 'file:///' || isDocumentPortal || (!isRemote && !isUserVisibleLocal))
                continue;
            this._appendUnique(places, seen, {
                name: mount.get_name(),
                uri,
                icon: mount.get_symbolic_icon(),
            });
        }
        return places;
    }

    private _appendUnique(places: Place[], seen: Set<string>, place: Place): void {
        const uri = normalizedUri(place.uri);
        if (seen.has(uri))
            return;
        seen.add(uri);
        places.push({...place, uri});
    }
}

export class PanelMenus {
    private _settings: Gio.Settings;
    private _signals = new SignalTracker();
    private _applications: ApplicationsIndicator | null = null;
    private _places: PlacesIndicator | null = null;

    constructor(settings: Gio.Settings) {
        this._settings = settings;
        for (const key of ['show-applications-menu', 'show-places-menu',
            'panel-menu-position']) {
            this._signals.connect(this._settings, `changed::${key}`,
                () => this._recreate());
        }
        this._recreate();
    }

    destroy(): void {
        this._signals.destroy();
        this._destroyIndicators();
    }

    private _recreate(): void {
        this._destroyIndicators();

        const configuredBox = this._settings.get_string('panel-menu-position');
        const box = ['left', 'center', 'right'].includes(configuredBox)
            ? configuredBox
            : 'left';
        let position = box === 'left' ? 1 : 0;

        if (this._settings.get_boolean('show-applications-menu')) {
            this._applications = new ApplicationsIndicator(this._settings);
            Main.panel.addToStatusArea(
                'sheliak-applications', this._applications.button, position++, box);
        }
        if (this._settings.get_boolean('show-places-menu')) {
            this._places = new PlacesIndicator(this._settings);
            Main.panel.addToStatusArea(
                'sheliak-places', this._places.button, position, box);
        }
    }

    private _destroyIndicators(): void {
        this._places?.destroy();
        this._places = null;
        this._applications?.destroy();
        this._applications = null;
    }
}
