import Clutter from 'gi://Clutter';
import Shell from 'gi://Shell';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {AppContextMenu} from './contextMenu.js';
import {SignalTracker} from './signals.js';

const DEFAULT_ICON_SIZE = 40;

function toggleStyle(actor: St.Widget, name: string, enabled: boolean): void {
    if (enabled)
        actor.add_style_class_name(name);
    else
        actor.remove_style_class_name(name);
}

export class AppIcon {
    readonly actor: St.Button;
    readonly menu: AppContextMenu;
    readonly appId: string;
    private _app: Shell.App;
    private _signals = new SignalTracker();
    private _badge: St.Label;

    constructor(
        app: Shell.App,
        menuManager: PopupMenu.PopupMenuManager,
        favorite: boolean,
        onMenuStateChanged?: (open: boolean) => void,
        iconSize = DEFAULT_ICON_SIZE,
    ) {
        this._app = app;
        this.appId = app.get_id();
        this.actor = new St.Button({
            style_class: 'sheliak-app-button',
            reactive: true,
            can_focus: true,
            track_hover: true,
            accessible_name: app.get_name(),
        });

        const iconContainer = new St.Widget({layout_manager: new Clutter.BinLayout()});
        iconContainer.add_child(app.create_icon_texture(iconSize));
        this._badge = new St.Label({
            style_class: 'sheliak-app-badge',
            text: '',
            visible: false,
            x_align: Clutter.ActorAlign.END,
            y_align: Clutter.ActorAlign.START,
        });
        iconContainer.add_child(this._badge);
        this.actor.set_child(iconContainer);

        this.menu = new AppContextMenu(this.actor, app);
        menuManager.addMenu(this.menu.menu);
        if (onMenuStateChanged) {
            this._signals.connect(this.menu.menu, 'open-state-changed',
                (_menu: unknown, open: boolean) => onMenuStateChanged(open));
        }

        this._signals.connect(this.actor, 'button-release-event',
            (_actor, event: Clutter.Event) => {
                const button = event.get_button();
                if (button === Clutter.BUTTON_SECONDARY) {
                    this.menu.toggle();
                    return Clutter.EVENT_STOP;
                }
                if (button === Clutter.BUTTON_PRIMARY) {
                    this.activate();
                    return Clutter.EVENT_STOP;
                }
                return Clutter.EVENT_PROPAGATE;
            });

        this.setState(favorite);
    }

    setState(favorite: boolean): void {
        const running = this._app.get_state() !== Shell.AppState.STOPPED;
        toggleStyle(this.actor, 'running', running);
        toggleStyle(this.actor, 'favorite', favorite);
        toggleStyle(this.actor, 'running-only', running && !favorite);
    }

    setBadge(count: number): void {
        this._badge.visible = count > 0;
        this._badge.text = count > 99 ? '99+' : String(count);
    }

    activate(): void {
        this.menu.close();
        const windows = this._app.get_windows()
            .filter(window => !window.skip_taskbar);

        if (windows.length === 0) {
            this._app.activate();
            return;
        }

        const focused = global.display.focus_window;
        const index = windows.indexOf(focused);
        const next = windows.length > 1
            ? windows[(index + 1 + windows.length) % windows.length]
            : windows[0];
        Main.activateWindow(next, global.get_current_time());
    }

    destroy(): void {
        this._signals.destroy();
        this.menu.destroy();
        this.actor.destroy();
    }
}
