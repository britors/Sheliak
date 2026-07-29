import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';

import * as AppFavorites from 'resource:///org/gnome/shell/ui/appFavorites.js';
import * as DND from 'resource:///org/gnome/shell/ui/dnd.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {AppIcon} from './appIcon.js';
import {LauncherEntryTracker} from './launcherEntries.js';
import {ShowAppsButton} from './showAppsButton.js';
import {SignalTracker} from './signals.js';
import {TrashIcon} from './trashIcon.js';

const TRIGGER_HEIGHT = 2;
const SETTINGS_SCHEMA = 'org.gnome.shell.extensions.sheliak';

export class Dock {
    readonly actor: St.BoxLayout;
    private _appsBox: St.BoxLayout;
    private _separator: St.Widget;
    private _leadingSpacer: St.Widget;
    private _trailingSpacer: St.Widget;
    private _appSystem = Shell.AppSystem.get_default();
    private _favorites = AppFavorites.getAppFavorites();
    private _icons: AppIcon[] = [];
    private _menuManager: PopupMenu.PopupMenuManager;
    private _signals = new SignalTracker();
    private _trash: TrashIcon;
    private _showApps: ShowAppsButton;
    private _launcherEntries: LauncherEntryTracker;
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
    private _chromeAdded = false;
    private _settings: Gio.Settings;
    private _startupCompleteId = 0;
    private _dragPlaceholder: St.Widget | null = null;
    private _dragPlaceholderPos = -1;

    constructor(settings?: Gio.Settings, extensionPath?: string) {
        console.debug('Sheliak: construindo dock');
        this._settings = settings ?? new Gio.Settings({schema_id: SETTINGS_SCHEMA});
        const logoPath = extensionPath
            ? GLib.build_filenamev([extensionPath, 'icons', 'sheliak-logo-symbolic.svg'])
            : null;
        const logoPathLight = extensionPath
            ? GLib.build_filenamev([extensionPath, 'icons', 'sheliak-logo-symbolic-dark.svg'])
            : null;
        this.actor = new St.BoxLayout({
            name: 'sheliakDock',
            style_class: 'sheliak-dock',
            orientation: Clutter.Orientation.HORIZONTAL,
            reactive: true,
            can_focus: false,
            x_align: Clutter.ActorAlign.CENTER,
        });
        this._appsBox = new St.BoxLayout({
            style_class: 'sheliak-apps',
            orientation: Clutter.Orientation.HORIZONTAL,
        });
        (this._appsBox as unknown as {_delegate?: unknown})._delegate = this;

        this._leadingSpacer = new St.Widget({visible: false});
        this._trailingSpacer = new St.Widget({visible: false});
        this.actor.add_child(this._leadingSpacer);
        this.actor.add_child(this._appsBox);

        this._separator = new St.Widget({style_class: 'sheliak-separator'});
        this.actor.add_child(this._separator);

        this._trash = new TrashIcon();
        this._showApps = new ShowAppsButton(logoPath, logoPathLight);
        this.actor.add_child(this._trash.actor);
        this.actor.add_child(this._showApps.actor);
        this.actor.add_child(this._trailingSpacer);

        this._menuManager = new PopupMenu.PopupMenuManager(this.actor);
        this._launcherEntries = new LauncherEntryTracker(
            (desktopId, count) => this._onLauncherEntryChanged(desktopId, count));
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
        this._signals.connect(this._appSystem, 'installed-changed', () => {
            console.debug('Sheliak: lista de apps instalados atualizada');
            this._favorites.reload();
            this._queueRedisplay();
        });
        this._signals.connect(Main.layoutManager, 'monitors-changed',
            () => this._relayout());
        if (Main.layoutManager._startingUp) {
            this._startupCompleteId = Main.layoutManager.connect('startup-complete', () => {
                console.debug('Sheliak: startup-complete, atualizando lançadores');
                Main.layoutManager.disconnect(this._startupCompleteId);
                this._startupCompleteId = 0;
                this._favorites.reload();
                this._redisplay();
            });
        }
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
            'extend-to-edges', 'content-alignment', 'hide-mode', 'hide-delay',
            'show-running', 'running-apps-position', 'show-trash',
            'show-apps-button', 'fullscreen-hide']) {
            this._signals.connect(this._settings, `changed::${key}`,
                () => {
                    console.debug(`Sheliak: configuração alterada: ${key}`);
                    this._applySettings();
                });
        }
        this._signals.connect(this._interfaceSettings, 'changed::gtk-theme',
            () => this._syncTheme());
        this._signals.connect(this._interfaceSettings, 'changed::color-scheme',
            () => this._syncTheme());
        if (this._userThemeSettings) {
            this._signals.connect(this._userThemeSettings, 'changed::name',
                () => this._syncTheme());
        }

        this._redisplay();
        this._applySettings();
        this._syncTheme();
        this._syncVisibility();
        console.debug('Sheliak: dock construído e sinais conectados');
    }

    destroy(): void {
        console.debug('Sheliak: destruindo dock');
        if (this._hideTimeoutId) {
            GLib.source_remove(this._hideTimeoutId);
            this._hideTimeoutId = 0;
        }
        if (this._redisplayTimeoutId) {
            GLib.source_remove(this._redisplayTimeoutId);
            this._redisplayTimeoutId = 0;
        }
        if (this._startupCompleteId) {
            Main.layoutManager.disconnect(this._startupCompleteId);
            this._startupCompleteId = 0;
        }
        this._signals.destroy();
        this._launcherEntries.destroy();
        this._clearDragPlaceholder();
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

        const apps = this._settings.get_string('running-apps-position') === 'start'
            ? [...running, ...favorites]
            : [...favorites, ...running];

        for (const app of apps) {
            const icon = new AppIcon(
                app, this._menuManager, favoriteIds.has(app.get_id()),
                open => this._onMenuStateChanged(open),
                this._settings.get_uint('icon-size'),
                () => this._clearDragPlaceholder());
            icon.setBadge(this._launcherEntries.countFor(icon.appId));
            this._icons.push(icon);
            this._appsBox.add_child(icon.actor);
        }
        console.debug(`Sheliak: redisplay concluído (${favorites.length} favoritos, ${running.length} em execução)`);

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

    private _onLauncherEntryChanged(desktopId: string, count: number): void {
        for (const icon of this._icons) {
            if (icon.appId === desktopId)
                icon.setBadge(count);
        }
    }

    private _onMenuStateChanged(open: boolean): void {
        this._openMenuCount += open ? 1 : -1;
        this._syncVisibility();
    }

    private _favoritesBounds(): {start: number; count: number} {
        let start = -1;
        let count = 0;
        for (let i = 0; i < this._icons.length; i++) {
            if (this._icons[i].favorite) {
                if (start === -1)
                    start = i;
                count++;
            }
        }
        return {start: start === -1 ? 0 : start, count};
    }

    private _clearDragPlaceholder(): void {
        if (!this._dragPlaceholder)
            return;
        this._dragPlaceholder.destroy();
        this._dragPlaceholder = null;
        this._dragPlaceholderPos = -1;
        this._relayout();
    }

    // DND drop-target interface, invoked by GNOME Shell's dnd.js on the
    // _appsBox delegate while an AppIcon is being dragged over the dock.
    handleDragOver(source: unknown, _actor: Clutter.Actor, x: number, y: number, _time: number): DND.DragMotionResult {
        const app = (source as {app?: Shell.App} | null)?.app;
        if (!app || !this._favorites.isFavorite(app.get_id()))
            return DND.DragMotionResult.NO_DROP;

        const {start, count} = this._favoritesBounds();
        if (count === 0)
            return DND.DragMotionResult.NO_DROP;

        const horizontal = this._appsBox.orientation === Clutter.Orientation.HORIZONTAL;
        const coord = horizontal ? x : y;

        let numChildren = this._appsBox.get_n_children();
        let boxSize = horizontal ? this._appsBox.width : this._appsBox.height;
        if (this._dragPlaceholder) {
            boxSize -= horizontal ? this._dragPlaceholder.width : this._dragPlaceholder.height;
            numChildren--;
        }

        const rawIndex = boxSize > 0
            ? Math.floor(Math.clamp(coord * numChildren / boxSize, 0, numChildren))
            : 0;
        const pos = Math.clamp(rawIndex - start, 0, count);

        if (pos !== this._dragPlaceholderPos) {
            this._dragPlaceholderPos = pos;

            const favorites = this._favorites.getFavorites();
            const favPos = favorites.findIndex(favorite => favorite.get_id() === app.get_id());
            if (favPos !== -1 && (pos === favPos || pos === favPos + 1)) {
                this._clearDragPlaceholder();
                return DND.DragMotionResult.CONTINUE;
            }

            this._dragPlaceholder?.destroy();
            const iconSize = this._settings.get_uint('icon-size');
            this._dragPlaceholder = new St.Widget({
                style_class: 'sheliak-drag-placeholder',
                width: horizontal ? iconSize : 1,
                height: horizontal ? 1 : iconSize,
            });
            this._appsBox.insert_child_at_index(this._dragPlaceholder, start + pos);
            this._relayout();
        }

        return this._dragPlaceholder ? DND.DragMotionResult.MOVE_DROP : DND.DragMotionResult.NO_DROP;
    }

    // DND drop-target interface: commits the reorder chosen during handleDragOver.
    acceptDrop(source: unknown): boolean {
        const app = (source as {app?: Shell.App} | null)?.app;
        if (!app || !this._favorites.isFavorite(app.get_id()))
            return false;

        if (!this._dragPlaceholder) {
            this._dragPlaceholderPos = -1;
            return true;
        }

        const id = app.get_id();
        const pos = this._dragPlaceholderPos;
        this._clearDragPlaceholder();

        const laters = global.compositor.get_laters();
        laters.add(Meta.LaterType.BEFORE_REDRAW, () => {
            this._favorites.moveFavoriteToPos(id, pos);
            return GLib.SOURCE_REMOVE;
        });

        return true;
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

    private _alignedOffset(monitorStart: number, monitorSize: number, size: number, margin: number): number {
        const alignment = this._settings.get_string('content-alignment');
        if (alignment === 'start')
            return monitorStart + margin;
        if (alignment === 'end')
            return monitorStart + monitorSize - margin - size;
        return monitorStart + Math.floor((monitorSize - size) / 2);
    }

    private _shownGeometry(): [number, number, number, number] {
        const monitor = Main.layoutManager.primaryMonitor;
        if (!monitor)
            return [0, 0, 0, 0];

        const position = this._settings.get_string('position');
        const margin = this._settings.get_uint('edge-margin');
        const extend = this._settings.get_boolean('extend-to-edges');
        const horizontal = position === 'top' || position === 'bottom';
        const [naturalWidth, naturalHeight] = this._naturalDockSize(horizontal);
        const width = horizontal
            ? (extend ? Math.max(1, monitor.width - margin * 2) : Math.min(naturalWidth, Math.max(1, monitor.width - margin * 2)))
            : naturalWidth;
        const height = horizontal
            ? naturalHeight
            : (extend ? Math.max(1, monitor.height - margin * 2) : Math.min(naturalHeight, Math.max(1, monitor.height - margin * 2)));

        let x = this._alignedOffset(monitor.x, monitor.width, width, margin);
        let y = monitor.y + monitor.height - margin - height;
        if (position === 'top') {
            y = monitor.y + margin;
        } else if (position === 'left') {
            x = monitor.x + margin;
            y = this._alignedOffset(monitor.y, monitor.height, height, margin);
        } else if (position === 'right') {
            x = monitor.x + monitor.width - margin - width;
            y = this._alignedOffset(monitor.y, monitor.height, height, margin);
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
        console.debug(`Sheliak: dock ${hidden ? 'ocultado' : 'exibido'}`);
        this._hidden = hidden;
        this._relayout();
    }

    private _relayout(): void {
        const monitor = Main.layoutManager.primaryMonitor;
        if (!monitor)
            return;

        const position = this._settings.get_string('position');
        const margin = this._settings.get_uint('edge-margin');
        const extend = this._settings.get_boolean('extend-to-edges');
        const alignment = this._settings.get_string('content-alignment');
        const horizontal = position === 'top' || position === 'bottom';
        const orientation = horizontal
            ? Clutter.Orientation.HORIZONTAL
            : Clutter.Orientation.VERTICAL;
        this.actor.orientation = orientation;
        this._appsBox.orientation = orientation;
        if (!horizontal) {
            this.actor.add_style_class_name('vertical');
            this.actor.remove_style_class_name('horizontal');
        } else {
            this.actor.add_style_class_name('horizontal');
            this.actor.remove_style_class_name('vertical');
        }
        if (extend && margin === 0)
            this.actor.add_style_class_name('squared');
        else
            this.actor.remove_style_class_name('squared');
        this._trash.actor.visible = this._settings.get_boolean('show-trash');
        this._showApps.actor.visible = this._settings.get_boolean('show-apps-button');
        this._separator.visible = this._trash.actor.visible || this._showApps.actor.visible;

        this._leadingSpacer.visible = extend;
        this._trailingSpacer.visible = extend;
        this._leadingSpacer.x_expand = extend && horizontal && alignment !== 'start';
        this._leadingSpacer.y_expand = extend && !horizontal && alignment !== 'start';
        this._trailingSpacer.x_expand = extend && horizontal && alignment !== 'end';
        this._trailingSpacer.y_expand = extend && !horizontal && alignment !== 'end';

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
        if (this._chromeAdded) {
            Main.layoutManager.removeChrome(this.actor);
            Main.layoutManager.removeChrome(this._revealTrigger);
        }
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
        this._chromeAdded = true;
    }

    private _syncTheme(): void {
        const gtkTheme = this._interfaceSettings.get_string('gtk-theme');
        const shellTheme = this._userThemeSettings?.get_string('name') ?? '';
        const isLyra = /lyra/i.test(`${gtkTheme} ${shellTheme}`);
        const colorScheme = this._interfaceSettings.get_string('color-scheme');
        const isLight = colorScheme !== 'prefer-dark';
        console.debug(`Sheliak: sincronização de tema (gtk=${gtkTheme}, shell=${shellTheme}, ` +
            `lyra=${isLyra}, color-scheme=${colorScheme}, light=${isLight})`);
        if (isLyra)
            this.actor.add_style_class_name('lyra-theme');
        else
            this.actor.remove_style_class_name('lyra-theme');
        if (isLight)
            this.actor.add_style_class_name('light-theme');
        else
            this.actor.remove_style_class_name('light-theme');
        this._showApps.setLightTheme(isLight);
    }
}
