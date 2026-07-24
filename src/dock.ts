import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import Shell from 'gi://Shell';
import St from 'gi://St';

import * as AppFavorites from 'resource:///org/gnome/shell/ui/appFavorites.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {AppIcon} from './appIcon.js';
import {ShowAppsButton} from './showAppsButton.js';
import {SignalTracker} from './signals.js';
import {TrashIcon} from './trashIcon.js';

const EDGE_MARGIN = 8;

export class Dock {
    readonly actor: St.BoxLayout;
    private _appsBox: St.BoxLayout;
    private _appSystem = Shell.AppSystem.get_default();
    private _favorites = AppFavorites.getAppFavorites();
    private _icons: AppIcon[] = [];
    private _menuManager: PopupMenu.PopupMenuManager;
    private _signals = new SignalTracker();
    private _trash: TrashIcon;
    private _showApps: ShowAppsButton;
    private _interfaceSettings: Gio.Settings;
    private _userThemeSettings: Gio.Settings | null = null;

    constructor() {
        this.actor = new St.BoxLayout({
            name: 'sheliakDock',
            style_class: 'sheliak-dock',
            vertical: true,
            reactive: true,
            can_focus: false,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._appsBox = new St.BoxLayout({
            style_class: 'sheliak-apps',
            vertical: true,
        });
        this.actor.add_child(this._appsBox);

        const separator = new St.Widget({style_class: 'sheliak-separator'});
        this.actor.add_child(separator);

        this._trash = new TrashIcon();
        this._showApps = new ShowAppsButton();
        this.actor.add_child(this._trash.actor);
        this.actor.add_child(this._showApps.actor);

        this._menuManager = new PopupMenu.PopupMenuManager(this.actor);
        this._interfaceSettings = new Gio.Settings({
            schema_id: 'org.gnome.desktop.interface',
        });
        if (Gio.SettingsSchemaSource.get_default()
            ?.lookup('org.gnome.shell.extensions.user-theme', true)) {
            this._userThemeSettings = new Gio.Settings({
                schema_id: 'org.gnome.shell.extensions.user-theme',
            });
        }

        Main.layoutManager.addChrome(this.actor, {
            affectsInputRegion: true,
            affectsStruts: true,
            trackFullscreen: true,
        });

        this._signals.connect(this._favorites, 'changed', () => this._redisplay());
        this._signals.connect(this._appSystem, 'app-state-changed',
            () => this._redisplay());
        this._signals.connect(Main.layoutManager, 'monitors-changed',
            () => this._relayout());
        this._signals.connect(this._interfaceSettings, 'changed::gtk-theme',
            () => this._syncTheme());
        if (this._userThemeSettings) {
            this._signals.connect(this._userThemeSettings, 'changed::name',
                () => this._syncTheme());
        }

        this._redisplay();
        this._syncTheme();
        this._relayout();
    }

    destroy(): void {
        this._signals.destroy();
        for (const icon of this._icons.splice(0))
            icon.destroy();
        this._trash.destroy();
        this._showApps.destroy();
        Main.layoutManager.removeChrome(this.actor);
        this.actor.destroy();
    }

    private _redisplay(): void {
        for (const icon of this._icons.splice(0))
            icon.destroy();

        const favorites = this._favorites.getFavorites();
        const favoriteIds = new Set(favorites.map(app => app.get_id()));
        const running = this._appSystem.get_running()
            .filter(app => !favoriteIds.has(app.get_id()));

        for (const app of [...favorites, ...running]) {
            const icon = new AppIcon(
                app, this._menuManager, favoriteIds.has(app.get_id()));
            this._icons.push(icon);
            this._appsBox.add_child(icon.actor);
        }
    }

    private _relayout(): void {
        const monitor = Main.layoutManager.primaryMonitor;
        if (!monitor)
            return;

        const [, naturalHeight] = this.actor.get_preferred_height(-1);
        const height = Math.min(
            naturalHeight,
            Math.max(1, monitor.height - EDGE_MARGIN * 2),
        );
        this.actor.set_height(height);
        this.actor.set_position(
            monitor.x + EDGE_MARGIN,
            monitor.y + Math.floor((monitor.height - height) / 2),
        );
    }

    private _syncTheme(): void {
        const gtkTheme = this._interfaceSettings.get_string('gtk-theme');
        const shellTheme = this._userThemeSettings?.get_string('name') ?? '';
        const isLyra = /lyra/i.test(`${gtkTheme} ${shellTheme}`);
        if (isLyra)
            this.actor.add_style_class_name('lyra-theme');
        else
            this.actor.remove_style_class_name('lyra-theme');
    }
}
