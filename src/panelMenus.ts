import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';
import St from 'gi://St';
import Clutter from 'gi://Clutter';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {GrabHelper} from 'resource:///org/gnome/shell/ui/grabHelper.js';

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

type SearchItem = {
    name: string;
    icon: Gio.Icon | string;
    keywords: string;
    activate: () => void;
};

const APP_CATEGORIES = [
    {id: 'AudioVideo', label: 'Multimídia', icon: 'applications-multimedia-symbolic'},
    {id: 'Development', label: 'Desenvolvimento', icon: 'applications-development-symbolic'},
    {id: 'Education', label: 'Educação', icon: 'applications-education-symbolic'},
    {id: 'Game', label: 'Jogos', icon: 'applications-games-symbolic'},
    {id: 'Graphics', label: 'Gráficos', icon: 'applications-graphics-symbolic'},
    {id: 'Network', label: 'Internet', icon: 'web-browser-symbolic'},
    {id: 'Office', label: 'Escritório', icon: 'applications-office-symbolic'},
    {id: 'Science', label: 'Ciência', icon: 'applications-science-symbolic'},
    {id: 'Settings', label: 'Configurações', icon: 'preferences-system-symbolic'},
    {id: 'System', label: 'Sistema', icon: 'applications-system-symbolic'},
    {id: 'Utility', label: 'Acessórios', icon: 'applications-utilities-symbolic'},
] as const;

const SPECIAL_DIRECTORIES: Array<[GLib.UserDirectory, string, string]> = [
    [GLib.UserDirectory.DIRECTORY_DESKTOP, 'Área de trabalho', 'user-desktop-symbolic'],
    [GLib.UserDirectory.DIRECTORY_DOCUMENTS, 'Documentos', 'folder-documents-symbolic'],
    [GLib.UserDirectory.DIRECTORY_DOWNLOAD, 'Downloads', 'folder-download-symbolic'],
    [GLib.UserDirectory.DIRECTORY_MUSIC, 'Música', 'folder-music-symbolic'],
    [GLib.UserDirectory.DIRECTORY_PICTURES, 'Imagens', 'folder-pictures-symbolic'],
    [GLib.UserDirectory.DIRECTORY_VIDEOS, 'Vídeos', 'folder-videos-symbolic'],
];

function alphabeticalCompare(a: string, b: string): number {
    return a.localeCompare(b, undefined, {sensitivity: 'base'});
}

function launchApplication(appSystem: Shell.AppSystem, appInfo: ApplicationInfo): void {
    const id = appInfo.get_id();
    const app = id ? appSystem.lookup_app(id) : null;
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

function panelLabel(text: string, iconName: string): St.BoxLayout {
    const box = new St.BoxLayout({
        style_class: 'panel-status-menu-box',
        y_align: Clutter.ActorAlign.CENTER,
    });
    box.add_child(new St.Icon({
        icon_name: iconName,
        style_class: 'system-status-icon',
        y_align: Clutter.ActorAlign.CENTER,
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
    private _categoryMenus: PopupMenu.PopupMenu[] = [];
    private _openCategoryMenu: PopupMenu.PopupMenu | null = null;
    private _grabHelper: GrabHelper;
    private _icon: St.Icon;
    // See showAppsButton.ts: St.Icon's `gicon` type comes from a separately
    // versioned nested @girs/gio-2.0 package, structurally incompatible with
    // the top-level Gio.Icon type here.
    private _darkIcon: never | null = null;
    private _lightIcon: never | null = null;
    private _interfaceSettings = new Gio.Settings({schema_id: 'org.gnome.desktop.interface'});

    constructor(settings: Gio.Settings, extensionPath?: string) {
        this._settings = settings;
        this.button = new PanelMenu.Button(0.5, 'Aplicativos');
        (this.button.menu as PopupMenu.PopupMenu).actor
            .add_style_class_name('sheliak-panel-menu');
        this._grabHelper = new GrabHelper(this.button);

        if (extensionPath) {
            this._darkIcon = Gio.icon_new_for_string(GLib.build_filenamev(
                [extensionPath, 'icons', 'sheliak-logo-symbolic.svg'])) as never;
            this._lightIcon = Gio.icon_new_for_string(GLib.build_filenamev(
                [extensionPath, 'icons', 'sheliak-logo-symbolic-dark.svg'])) as never;
        }
        const box = new St.BoxLayout({
            style_class: 'panel-status-menu-box',
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._icon = this._darkIcon
            ? new St.Icon({
                gicon: this._darkIcon,
                style_class: 'system-status-icon',
                y_align: Clutter.ActorAlign.CENTER,
            })
            : new St.Icon({
                icon_name: 'view-app-grid-symbolic',
                style_class: 'system-status-icon',
                y_align: Clutter.ActorAlign.CENTER,
            });
        box.add_child(this._icon);
        box.add_child(new St.Label({
            text: 'Aplicativos',
            y_align: Clutter.ActorAlign.CENTER,
        }));
        this.button.add_child(box);

        this._signals.connect(this._appSystem, 'installed-changed', () => this._rebuild());
        for (const key of ['show-application-icons', 'sort-applications-menu',
            'open-application-submenus-sideways']) {
            this._signals.connect(this._settings, `changed::${key}`,
                () => this._rebuild());
        }
        this._signals.connect(this.button.menu, 'open-state-changed',
            (_menu, open: boolean) => {
                if (!open)
                    this._closeCategoryMenus();
            });
        this._signals.connect(this._interfaceSettings, 'changed::color-scheme',
            () => this._syncTheme());
        this._syncTheme();
        this._rebuild();
    }

    destroy(): void {
        this._signals.destroy();
        this._destroyCategoryMenus();
        this.button.destroy();
    }

    private _syncTheme(): void {
        const isLight = this._interfaceSettings.get_string('color-scheme') !== 'prefer-dark';
        const gicon = isLight ? this._lightIcon : this._darkIcon;
        if (gicon)
            this._icon.set_gicon(gicon);
    }

    private _rebuild(): void {
        const menu = this.button.menu as PopupMenu.PopupMenu;
        this._destroyCategoryMenus();
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
        const sortAlphabetically = this._settings.get_boolean('sort-applications-menu');
        const openSideways = this._settings.get_boolean(
            'open-application-submenus-sideways');
        const categories = [...APP_CATEGORIES,
            {id: 'Other', label: 'Outros', icon: 'applications-other-symbolic'}];
        if (sortAlphabetically)
            categories.sort((a, b) => alphabeticalCompare(a.label, b.label));
        let itemCount = 0;
        for (const category of categories) {
            const apps = groups.get(category.id) ?? [];
            if (apps.length === 0)
                continue;

            if (sortAlphabetically) {
                apps.sort((a, b) => alphabeticalCompare(
                    a.get_display_name(), b.get_display_name()));
            }

            if (!openSideways) {
                const submenu: PopupMenu.PopupSubMenuMenuItem & {icon?: St.Icon} =
                    new PopupMenu.PopupSubMenuMenuItem(category.label, true);
                if (submenu.icon)
                    submenu.icon.icon_name = category.icon;
                for (const appInfo of apps) {
                    submenu.menu.addMenuItem(this._applicationItem(appInfo, showIcons));
                    itemCount++;
                }
                menu.addMenuItem(submenu);
                continue;
            }

            const categoryItem = new PopupMenu.PopupImageMenuItem(category.label, category.icon, {
                activate: false,
            } as PopupMenu.PopupImageMenuItem.ConstructorProps);
            categoryItem.add_child(PopupMenu.arrowIcon(St.Side.RIGHT));
            const categoryMenu = this._createCategoryMenu(categoryItem);
            for (const appInfo of apps) {
                categoryMenu.addMenuItem(this._applicationItem(appInfo, showIcons));
                itemCount++;
            }
            categoryItem.connect('notify::active', () => {
                if (categoryItem.active)
                    this._openCategory(categoryMenu);
            });
            menu.addMenuItem(categoryItem);
        }

        if (itemCount === 0) {
            menu.addMenuItem(new PopupMenu.PopupMenuItem(
                'Nenhum aplicativo encontrado', {reactive: false}));
        }
    }

    private _applicationItem(appInfo: ApplicationInfo, showIcon: boolean):
    PopupMenu.PopupImageMenuItem | PopupMenu.PopupMenuItem {
        const icon = appInfo.get_icon()
            ? appInfo.get_icon() as Gio.Icon
            : 'application-x-executable-symbolic';
        const item = showIcon
            ? new PopupMenu.PopupImageMenuItem(appInfo.get_display_name(), icon)
            : new PopupMenu.PopupMenuItem(appInfo.get_display_name());
        item.connect('activate', () => {
            (this.button.menu as PopupMenu.PopupMenu).close();
            launchApplication(this._appSystem, appInfo);
        });
        return item;
    }

    private _createCategoryMenu(source: St.Widget): PopupMenu.PopupMenu {
        // A seta fica na borda esquerda do pop-up, fazendo-o abrir à direita
        // do item. O BoxPointer troca o lado automaticamente se faltar espaço.
        const menu = new PopupMenu.PopupMenu(source, 0.0, St.Side.LEFT);
        menu.actor.add_style_class_name('sheliak-panel-menu');
        Main.uiGroup.add_child(menu.actor);
        menu.actor.hide();
        this._categoryMenus.push(menu);
        return menu;
    }

    private _openCategory(menu: PopupMenu.PopupMenu): void {
        if (this._openCategoryMenu === menu)
            return;
        this._closeCategoryMenus();
        // O menu principal já mantém um grab modal próprio; sem estender
        // esse grab para o submenu flutuante, seus itens nunca recebem
        // eventos de ponteiro e não realçam ao passar o mouse.
        const grabbed = this._grabHelper.grab({
            actor: menu.actor,
            onUngrab: () => {
                menu.close();
                if (this._openCategoryMenu === menu)
                    this._openCategoryMenu = null;
            },
        });
        if (!grabbed)
            return;
        this._openCategoryMenu = menu;
        menu.open();
    }

    private _closeCategoryMenus(): void {
        if (this._openCategoryMenu)
            this._grabHelper.ungrab({actor: this._openCategoryMenu.actor});
        for (const menu of this._categoryMenus)
            menu.close();
    }

    private _destroyCategoryMenus(): void {
        this._closeCategoryMenus();
        for (const menu of this._categoryMenus.splice(0))
            menu.destroy();
    }

}

class PlacesIndicator {
    readonly button: PanelMenu.Button;
    private _settings: Gio.Settings;
    private _volumeMonitor = Gio.VolumeMonitor.get();
    private _signals = new SignalTracker();

    constructor(settings: Gio.Settings) {
        this._settings = settings;
        this.button = new PanelMenu.Button(0.5, 'Locais');
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

class SystemIndicator {
    readonly button: PanelMenu.Button;
    private _settings: Gio.Settings;
    private _appSystem = Shell.AppSystem.get_default();

    constructor(settings: Gio.Settings) {
        this._settings = settings;
        this.button = new PanelMenu.Button(0.5, 'Sistema');
        this.button.add_child(panelLabel('Sistema', 'preferences-system-symbolic'));
        const menu = this.button.menu as PopupMenu.PopupMenu;
        menu.actor.add_style_class_name('sheliak-panel-menu');

        const vegaIcon = (this._appSystem.lookup_app('vega.desktop')?.get_icon() as
            unknown as Gio.Icon | undefined) ?? 'preferences-other-symbolic';
        const settingsItem = new PopupMenu.PopupImageMenuItem('Vega', vegaIcon);
        settingsItem.connect('activate', () => {
            menu.close();
            this._openVega();
        });
        menu.addMenuItem(settingsItem);

        if (this._settings.get_boolean('show-system-about')) {
            const aboutItem = new PopupMenu.PopupImageMenuItem('Sobre', 'help-about-symbolic');
            aboutItem.connect('activate', () => {
                menu.close();
                this._openSystemAbout();
            });
            menu.addMenuItem(aboutItem);
        }
    }

    destroy(): void {
        this.button.destroy();
    }

    private _openVega(): void {
        const app = this._appSystem.lookup_app('vega.desktop');
        try {
            if (app)
                app.activate();
            else
                Gio.Subprocess.new(['vega-gtk'], Gio.SubprocessFlags.NONE);
        } catch (error) {
            console.error(`Sheliak: falha ao abrir o Vega: ${error}`);
            Main.notifyError('Não foi possível abrir o Vega', String(error));
        }
    }

    private _openSystemAbout(): void {
        try {
            Gio.Subprocess.new(['gnome-control-center', 'system'], Gio.SubprocessFlags.NONE);
        } catch (error) {
            console.error(`Sheliak: falha ao abrir as informações do sistema: ${error}`);
            Main.notifyError('Não foi possível abrir as informações do sistema', String(error));
        }
    }
}

class SearchIndicator {
    readonly button: PanelMenu.Button;
    private _appSystem = Shell.AppSystem.get_default();
    private _signals = new SignalTracker();
    private _entry: St.Entry;
    private _resultsMenu: PopupMenu.PopupMenu;
    private _index: SearchItem[] = [];
    private _topResult: SearchItem | null = null;
    private _stageClickId = 0;

    constructor() {
        this.button = new PanelMenu.Button(0.5, 'Buscar', true);

        const box = new St.BoxLayout({
            style_class: 'panel-status-menu-box',
            y_align: Clutter.ActorAlign.CENTER,
        });
        const iconButton = new St.Button({
            style_class: 'system-status-icon',
            child: new St.Icon({icon_name: 'edit-find-symbolic', y_align: Clutter.ActorAlign.CENTER}),
            can_focus: true,
            track_hover: true,
        });
        this._signals.connect(iconButton, 'clicked', () => this._toggleSearch());
        box.add_child(iconButton);

        this._entry = new St.Entry({
            style_class: 'search-entry sheliak-search-entry',
            hint_text: 'Buscar aplicativos e configurações…',
            can_focus: true,
            visible: false,
            y_align: Clutter.ActorAlign.CENTER,
        });
        box.add_child(this._entry);
        this.button.add_child(box);

        // Sem grab modal: o campo permanece fora do popup de resultados, e um
        // grab restringiria os eventos de teclado ao popup, bloqueando a
        // digitação. O fechamento ao clicar fora é feito manualmente.
        this._resultsMenu = new PopupMenu.PopupMenu(this._entry, 0.0, St.Side.TOP);
        this._resultsMenu.actor.add_style_class_name('sheliak-panel-menu');
        Main.uiGroup.add_child(this._resultsMenu.actor);
        this._resultsMenu.actor.hide();

        this._signals.connect(this._entry.clutter_text, 'text-changed', () => this._updateResults());
        this._signals.connect(this._entry.clutter_text, 'key-press-event',
            (_actor: unknown, event: Clutter.Event) => this._onEntryKeyPress(event));

        this._signals.connect(this._appSystem, 'installed-changed', () => this._rebuildIndex());
        this._rebuildIndex();
    }

    destroy(): void {
        this._signals.destroy();
        this._disconnectStageClick();
        this._resultsMenu.destroy();
        this.button.destroy();
    }

    private _toggleSearch(): void {
        if (this._entry.visible)
            this._closeSearch();
        else
            this._openSearch();
    }

    private _openSearch(): void {
        this._entry.visible = true;
        this._entry.set_text('');
        this._entry.clutter_text.grab_key_focus();
        this._connectStageClick();
    }

    private _closeSearch(): void {
        this._resultsMenu.close();
        this._entry.set_text('');
        this._entry.visible = false;
        this._disconnectStageClick();
    }

    private _connectStageClick(): void {
        if (this._stageClickId)
            return;
        this._stageClickId = global.stage.connect('button-press-event',
            (_actor: unknown, event: Clutter.Event) => this._onStageClick(event));
    }

    private _disconnectStageClick(): void {
        if (this._stageClickId) {
            global.stage.disconnect(this._stageClickId);
            this._stageClickId = 0;
        }
    }

    private _onStageClick(event: Clutter.Event): boolean {
        const target = event.get_source() as Clutter.Actor | null;
        const withinButton = target && this.button.contains(target);
        const withinResults = target && this._resultsMenu.actor.contains(target);
        if (!withinButton && !withinResults)
            this._closeSearch();
        return Clutter.EVENT_PROPAGATE;
    }

    private _onEntryKeyPress(event: Clutter.Event): boolean {
        const symbol = event.get_key_symbol();
        if (symbol === Clutter.KEY_Escape) {
            this._closeSearch();
            return Clutter.EVENT_STOP;
        }
        if (symbol === Clutter.KEY_Return || symbol === Clutter.KEY_KP_Enter) {
            if (this._topResult) {
                const item = this._topResult;
                this._closeSearch();
                item.activate();
            }
            return Clutter.EVENT_STOP;
        }
        return Clutter.EVENT_PROPAGATE;
    }

    private _updateResults(): void {
        const query = this._entry.get_text().trim().toLowerCase();
        this._resultsMenu.removeAll();
        this._topResult = null;

        if (!query) {
            this._resultsMenu.close();
            return;
        }

        const starts: SearchItem[] = [];
        const contains: SearchItem[] = [];
        for (const item of this._index) {
            if (item.keywords.startsWith(query))
                starts.push(item);
            else if (item.keywords.includes(query))
                contains.push(item);
        }
        const matches = [...starts, ...contains].slice(0, 8);
        this._topResult = matches[0] ?? null;

        if (matches.length === 0) {
            this._resultsMenu.addMenuItem(new PopupMenu.PopupMenuItem(
                'Nenhum resultado encontrado', {reactive: false}));
        } else {
            for (const item of matches) {
                const menuItem = new PopupMenu.PopupImageMenuItem(item.name, item.icon);
                menuItem.connect('activate', () => {
                    this._closeSearch();
                    item.activate();
                });
                this._resultsMenu.addMenuItem(menuItem);
            }
        }

        if (!this._resultsMenu.isOpen)
            this._resultsMenu.open();
    }

    private _rebuildIndex(): void {
        const index: SearchItem[] = [];
        const seen = new Set<string>();

        for (const appInfo of this._appSystem.get_installed() as unknown as ApplicationInfo[]) {
            const id = appInfo.get_id();
            if (!id || seen.has(id) || !appInfo.should_show())
                continue;
            seen.add(id);
            const name = appInfo.get_display_name();
            index.push({
                name,
                icon: appInfo.get_icon() ? appInfo.get_icon() as Gio.Icon
                    : 'application-x-executable-symbolic',
                keywords: name.toLowerCase(),
                activate: () => launchApplication(this._appSystem, appInfo),
            });
        }

        for (const appInfo of Gio.AppInfo.get_all() as unknown as ApplicationInfo[]) {
            const id = appInfo.get_id();
            if (!id || seen.has(id))
                continue;
            const categories = new Set((appInfo.get_categories?.() ?? '').split(';').filter(Boolean));
            if (!categories.has('X-GNOME-Settings-Panel'))
                continue;
            seen.add(id);
            const name = appInfo.get_display_name();
            index.push({
                name,
                icon: appInfo.get_icon() ? appInfo.get_icon() as Gio.Icon
                    : 'preferences-system-symbolic',
                keywords: name.toLowerCase(),
                activate: () => launchApplication(this._appSystem, appInfo),
            });
        }

        this._index = index;
    }
}

export class PanelMenus {
    private _settings: Gio.Settings;
    private _signals = new SignalTracker();
    private _applications: ApplicationsIndicator | null = null;
    private _places: PlacesIndicator | null = null;
    private _system: SystemIndicator | null = null;
    private _search: SearchIndicator | null = null;
    private _extensionPath?: string;

    constructor(settings: Gio.Settings, extensionPath?: string) {
        this._settings = settings;
        this._extensionPath = extensionPath;
        for (const key of ['show-applications-menu', 'show-places-menu',
            'show-system-menu', 'show-system-about', 'show-search-menu', 'panel-menu-position']) {
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
            this._applications = new ApplicationsIndicator(this._settings, this._extensionPath);
            Main.panel.addToStatusArea(
                'sheliak-applications', this._applications.button, position++, box);
        }
        if (this._settings.get_boolean('show-places-menu')) {
            this._places = new PlacesIndicator(this._settings);
            Main.panel.addToStatusArea(
                'sheliak-places', this._places.button, position++, box);
        }
        if (this._settings.get_boolean('show-system-menu')) {
            this._system = new SystemIndicator(this._settings);
            Main.panel.addToStatusArea(
                'sheliak-system', this._system.button, position++, box);
        }
        if (this._settings.get_boolean('show-search-menu')) {
            this._search = new SearchIndicator();
            Main.panel.addToStatusArea(
                'sheliak-search', this._search.button, position, box);
        }
    }

    private _destroyIndicators(): void {
        this._search?.destroy();
        this._search = null;
        this._system?.destroy();
        this._system = null;
        this._places?.destroy();
        this._places = null;
        this._applications?.destroy();
        this._applications = null;
    }
}
