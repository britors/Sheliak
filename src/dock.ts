import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
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
    private _separator: St.Widget;
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
    private _redisplayTimeoutId = 0;
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

        this._separator = new St.Widget({style_class: 'sheliak-separator'});
        this.actor.add_child(this._separator);

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
            () => this._queueRedisplay());
        this._signals.connect(Main.layoutManager, 'monitors-changed',
            () => this._relayout());
        this._signals.connect(global.display, 'restacked',
            () => this._syncVisibility());
        this._signals.connect(global.display, 'window-created',
            (_display, window: Meta.Window) => {
                this._trackWindow(window);
                this._syncVisibility();
            });
        this._signals.connect(global.workspace_manager, 'active-workspace-changed',
            () => this._syncVisibility());
        for (const windowActor of global.get_window_actors()) {
            if (windowActor.meta_window)
                this._trackWindow(windowActor.meta_window);
        }
        for (const key of ['position', 'icon-size', 'edge-margin', 'animation',
            'hide-mode', 'hide-delay', 'show-running', 'show-trash',
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
        if (this._redisplayTimeoutId) {
            GLib.source_remove(this._redisplayTimeoutId);
            this._redisplayTimeoutId = 0;
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

    private _queueRedisplay(): void {
        if (this._redisplayTimeoutId)
            GLib.source_remove(this._redisplayTimeoutId);
        this._redisplayTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
            this._redisplayTimeoutId = 0;
            this._redisplay();
            return GLib.SOURCE_REMOVE;
        });
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

        const mode = this._settings.get_string('hide-mode');
        if (mode === 'always') {
            this._setHidden(false);
            return;
        }

        if (mode === 'intelligent' && !this._windowOverlapsDock()) {
            this._setHidden(false);
            return;
        }

        if (this._hidden)
            return;

        this._hideTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT,
            this._settings.get_uint('hide-delay'), () => {
                this._hideTimeoutId = 0;
                if (this._windowOverlapsDock())
                    this._setHidden(true);
                return GLib.SOURCE_REMOVE;
            });
    }

    private _trackWindow(window: Meta.Window): void {
        for (const signal of ['position-changed', 'size-changed',
            'workspace-changed', 'notify::minimized']) {
            this._signals.connect(window, signal, () => this._syncVisibility());
        }
    }

    private _windowOverlapsDock(): boolean {
        const monitor = Main.layoutManager.primaryMonitor;
        if (!monitor)
            return false;

        const [x, y, width, height] = this._shownGeometry();
        const workspace = global.workspace_manager.get_active_workspace();

        return global.get_window_actors().some(windowActor => {
            const window = windowActor.meta_window;
            if (!window || window.minimized || !window.showing_on_its_workspace()
                || window.get_workspace() !== workspace
                || window.get_monitor() !== Main.layoutManager.primaryIndex) {
                return false;
            }

            const type = window.get_window_type();
            if (type === Meta.WindowType.DESKTOP || type === Meta.WindowType.DOCK)
                return false;

            const rect = window.get_frame_rect();
            return rect.x < x + width && rect.x + rect.width > x
                && rect.y < y + height && rect.y + rect.height > y;
        });
    }

    private _shownGeometry(): [number, number, number, number] {
        const monitor = Main.layoutManager.primaryMonitor;
        if (!monitor)
            return [0, 0, 0, 0];

        const position = this._settings.get_string('position');
        const margin = this._settings.get_uint('edge-margin');
        const horizontal = position === 'top' || position === 'bottom';
        const [naturalWidth, naturalHeight] = this._naturalDockSize(horizontal);
        const width = horizontal
            ? Math.min(naturalWidth, Math.max(1, monitor.width - margin * 2))
            : naturalWidth;
        const height = horizontal
            ? naturalHeight
            : Math.min(naturalHeight, Math.max(1, monitor.height - margin * 2));

        let x = monitor.x + Math.floor((monitor.width - width) / 2);
        let y = monitor.y + monitor.height - margin - height;
        if (position === 'top') {
            y = monitor.y + margin;
        } else if (position === 'left') {
            x = monitor.x + margin;
            y = monitor.y + Math.floor((monitor.height - height) / 2);
        } else if (position === 'right') {
            x = monitor.x + monitor.width - margin - width;
            y = monitor.y + Math.floor((monitor.height - height) / 2);
        }

        return [x, y, width, height];
    }

    private _naturalDockSize(horizontal: boolean): [number, number] {
        const children = [this._appsBox, this._separator, this._trash.actor, this._showApps.actor]
            .filter(child => child.visible);
        const sizes = children.map(child => {
            const [, width] = child.get_preferred_width(-1);
            const [, height] = child.get_preferred_height(-1);
            return [width, height];
        });
        const spacing = this.actor.get_theme_node().get_length('spacing') ?? 0;
        const horizontalSize = horizontal
            ? sizes.reduce((total, [width]) => total + width, 0) + Math.max(0, sizes.length - 1) * spacing
            : Math.max(0, ...sizes.map(([width]) => width));
        const verticalSize = horizontal
            ? Math.max(0, ...sizes.map(([, height]) => height))
            : sizes.reduce((total, [, height]) => total + height, 0) + Math.max(0, sizes.length - 1) * spacing;
        const themeNode = this.actor.get_theme_node();
        return [horizontalSize + themeNode.get_horizontal_padding(),
            verticalSize + themeNode.get_vertical_padding()];
    }

    private _setHidden(hidden: boolean): void {
        if (this._hidden === hidden)
            return;
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
        this._separator.visible = this._trash.actor.visible || this._showApps.actor.visible;

        const [shownX, shownY, width, height] = this._shownGeometry();
        this.actor.set_size(width, height);

        let hiddenX = shownX;
        let hiddenY = monitor.y + monitor.height;
        if (position === 'top') {
            hiddenY = monitor.y - height;
        } else if (position === 'left') {
            hiddenX = monitor.x - width;
            hiddenY = shownY;
        } else if (position === 'right') {
            hiddenX = monitor.x + monitor.width;
            hiddenY = shownY;
        }

        const targetX = this._hidden ? hiddenX : shownX;
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
