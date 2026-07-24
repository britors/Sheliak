import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';
import St from 'gi://St';

import * as AppFavorites from 'resource:///org/gnome/shell/ui/appFavorites.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {AppIcon} from './appIcon.js';
import {ShowAppsButton} from './showAppsButton.js';
import {SignalTracker} from './signals.js';
import {TrashIcon} from './trashIcon.js';

const TRIGGER_HEIGHT = 2;
const SETTINGS_SCHEMA = 'org.gnome.shell.extensions.sheliak';

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
    private _revealTrigger: St.Widget;
    private _pointerOverDock = false;
    private _pointerOverTrigger = false;
    private _openMenuCount = 0;
    private _hidden = false;
    private _hideTimeoutId = 0;
    private _laidOutOnce = false;
    private _settings: Gio.Settings;

    constructor(settings?: Gio.Settings) {
        this._settings = settings ?? new Gio.Settings({schema_id: SETTINGS_SCHEMA});
        this.actor = new St.BoxLayout({
            name: 'sheliakDock',
            style_class: 'sheliak-dock',
            vertical: false,
            reactive: true,
            can_focus: false,
            x_align: Clutter.ActorAlign.CENTER,
        });
        this._appsBox = new St.BoxLayout({
            style_class: 'sheliak-apps',
            vertical: false,
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

        this._revealTrigger = new St.Widget({
            name: 'sheliakDockTrigger',
            reactive: true,
            can_focus: false,
            opacity: 0,
        });

        this._syncChrome();

        this._signals.connect(this.actor, 'enter-event', () => {
            this._pointerOverDock = true;
            this._syncVisibility();
            return Clutter.EVENT_PROPAGATE;
        });
        this._signals.connect(this.actor, 'leave-event', () => {
            this._pointerOverDock = false;
            this._syncVisibility();
            return Clutter.EVENT_PROPAGATE;
        });
        this._signals.connect(this._revealTrigger, 'enter-event', () => {
            this._pointerOverTrigger = true;
            this._syncVisibility();
            return Clutter.EVENT_PROPAGATE;
        });
        this._signals.connect(this._revealTrigger, 'leave-event', () => {
            this._pointerOverTrigger = false;
            this._syncVisibility();
            return Clutter.EVENT_PROPAGATE;
        });

        this._signals.connect(this._favorites, 'changed', () => this._redisplay());
        this._signals.connect(this._appSystem, 'app-state-changed',
            () => this._redisplay());
        this._signals.connect(Main.layoutManager, 'monitors-changed',
            () => this._relayout());
        for (const key of ['position', 'icon-size', 'edge-margin', 'animation',
            'autohide', 'hide-delay', 'show-running', 'show-trash',
            'show-apps-button', 'fullscreen-hide']) {
            this._signals.connect(this._settings, `changed::${key}`,
                () => this._applySettings());
        }
        this._signals.connect(this._interfaceSettings, 'changed::gtk-theme',
            () => this._syncTheme());
        if (this._userThemeSettings) {
            this._signals.connect(this._userThemeSettings, 'changed::name',
                () => this._syncTheme());
        }

        this._redisplay();
        this._applySettings();
        this._syncTheme();
        this._syncVisibility();
    }

    destroy(): void {
        if (this._hideTimeoutId) {
            GLib.source_remove(this._hideTimeoutId);
            this._hideTimeoutId = 0;
        }
        this._signals.destroy();
        for (const icon of this._icons.splice(0))
            icon.destroy();
        this._trash.destroy();
        this._showApps.destroy();
        Main.layoutManager.removeChrome(this.actor);
        Main.layoutManager.removeChrome(this._revealTrigger);
        this.actor.destroy();
        this._revealTrigger.destroy();
    }

    private _redisplay(): void {
        for (const icon of this._icons.splice(0))
            icon.destroy();

        const favorites = this._favorites.getFavorites();
        const favoriteIds = new Set(favorites.map(app => app.get_id()));
        const running = this._settings.get_boolean('show-running')
            ? this._appSystem.get_running().filter(app => !favoriteIds.has(app.get_id()))
            : [];

        for (const app of [...favorites, ...running]) {
            const icon = new AppIcon(
                app, this._menuManager, favoriteIds.has(app.get_id()),
                open => this._onMenuStateChanged(open),
                this._settings.get_uint('icon-size'));
            this._icons.push(icon);
            this._appsBox.add_child(icon.actor);
        }

        this._relayout();
    }

    private _onMenuStateChanged(open: boolean): void {
        this._openMenuCount += open ? 1 : -1;
        this._syncVisibility();
    }

    private _syncVisibility(): void {
        if (this._hideTimeoutId) {
            GLib.source_remove(this._hideTimeoutId);
            this._hideTimeoutId = 0;
        }

        const shouldShow = this._pointerOverDock || this._pointerOverTrigger
            || this._openMenuCount > 0;
        if (shouldShow) {
            this._setHidden(false);
            return;
        }

        if (!this._settings.get_boolean('autohide')) {
            this._setHidden(false);
            return;
        }
        this._hideTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT,
            this._settings.get_uint('hide-delay'), () => {
                this._hideTimeoutId = 0;
                this._setHidden(true);
                return GLib.SOURCE_REMOVE;
            });
    }

    private _setHidden(hidden: boolean): void {
        this._hidden = hidden;
        this._relayout();
    }

    private _relayout(): void {
        const monitor = Main.layoutManager.primaryMonitor;
        if (!monitor)
            return;

        const position = this._settings.get_string('position');
        const margin = this._settings.get_uint('edge-margin');
        const horizontal = position === 'top' || position === 'bottom';
        this.actor.vertical = !horizontal;
        this._appsBox.vertical = !horizontal;
        if (!horizontal) {
            this.actor.add_style_class_name('vertical');
            this.actor.remove_style_class_name('horizontal');
        } else {
            this.actor.add_style_class_name('horizontal');
            this.actor.remove_style_class_name('vertical');
        }
        this._trash.actor.visible = this._settings.get_boolean('show-trash');
        this._showApps.actor.visible = this._settings.get_boolean('show-apps-button');

        const [, naturalWidth] = this.actor.get_preferred_width(-1);
        const [, naturalHeight] = this.actor.get_preferred_height(-1);
        const width = horizontal ? Math.min(naturalWidth, Math.max(1, monitor.width - margin * 2)) : naturalWidth;
        const height = horizontal ? naturalHeight : Math.min(naturalHeight, Math.max(1, monitor.height - margin * 2));
        this.actor.set_size(width, height);

        let x = monitor.x + Math.floor((monitor.width - width) / 2);
        let shownY = monitor.y + monitor.height - margin - height;
        let hiddenX = x;
        let hiddenY = monitor.y + monitor.height;
        if (position === 'top') {
            shownY = monitor.y + margin;
            hiddenY = monitor.y - height;
        } else if (position === 'left') {
            x = monitor.x + margin;
            shownY = monitor.y + Math.floor((monitor.height - height) / 2);
            hiddenX = monitor.x - width;
            hiddenY = shownY;
        } else if (position === 'right') {
            x = monitor.x + monitor.width - margin - width;
            shownY = monitor.y + Math.floor((monitor.height - height) / 2);
            hiddenX = monitor.x + monitor.width;
            hiddenY = shownY;
        }

        const targetX = this._hidden ? hiddenX : x;
        const y = this._hidden ? hiddenY : shownY;
        if (this._laidOutOnce) {
            this.actor.save_easing_state();
            this.actor.set_easing_duration(this._settings.get_boolean('animation') ? 200 : 0);
            this.actor.set_easing_mode(Clutter.AnimationMode.EASE_OUT_QUAD);
            this.actor.set_position(targetX, y);
            this.actor.restore_easing_state();
        } else {
            this.actor.set_position(targetX, y);
            this._laidOutOnce = true;
        }

        if (position === 'top') {
            this._revealTrigger.set_position(monitor.x, monitor.y);
            this._revealTrigger.set_size(monitor.width, TRIGGER_HEIGHT);
        } else if (position === 'left') {
            this._revealTrigger.set_position(monitor.x, monitor.y);
            this._revealTrigger.set_size(TRIGGER_HEIGHT, monitor.height);
        } else if (position === 'right') {
            this._revealTrigger.set_position(monitor.x + monitor.width - TRIGGER_HEIGHT, monitor.y);
            this._revealTrigger.set_size(TRIGGER_HEIGHT, monitor.height);
        } else {
            this._revealTrigger.set_position(monitor.x, monitor.y + monitor.height - TRIGGER_HEIGHT);
            this._revealTrigger.set_size(monitor.width, TRIGGER_HEIGHT);
        }
    }

    private _applySettings(): void {
        this._syncChrome();
        this._redisplay();
        this._syncVisibility();
    }

    private _syncChrome(): void {
        Main.layoutManager.removeChrome(this.actor);
        Main.layoutManager.removeChrome(this._revealTrigger);
        const trackFullscreen = this._settings.get_boolean('fullscreen-hide');
        Main.layoutManager.addChrome(this.actor, {
            affectsInputRegion: true,
            affectsStruts: false,
            trackFullscreen,
        });
        Main.layoutManager.addChrome(this._revealTrigger, {
            affectsInputRegion: true,
            affectsStruts: false,
            trackFullscreen,
        });
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
