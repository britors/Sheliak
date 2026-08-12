import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';

import {SignalTracker} from './signals.js';
import {gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';

const TRASH_URI = 'trash:///';
const ICON_SIZE = 32;

export class TrashIcon {
    readonly actor: St.Button;
    private _icon: St.Icon;
    private _trash = Gio.File.new_for_uri(TRASH_URI);
    private _monitor: Gio.FileMonitor | null = null;
    private _signals = new SignalTracker();
    private _destroyed = false;

    constructor() {
        this._icon = new St.Icon({
            icon_name: 'user-trash-symbolic',
            icon_size: ICON_SIZE,
        });
        this.actor = new St.Button({
            style_class: 'sheliak-system-button sheliak-trash-button',
            child: this._icon,
            reactive: true,
            can_focus: true,
            track_hover: true,
            accessible_name: _('Trash'),
        });

        this._signals.connect(this.actor, 'clicked', () => {
            Gio.AppInfo.launch_default_for_uri_async(
                TRASH_URI, null, null, (_source, result) => {
                    try {
                        Gio.AppInfo.launch_default_for_uri_finish(result);
                    } catch (error) {
                        console.error(`Sheliak: não foi possível abrir a lixeira: ${error}`);
                    }
                });
        });

        try {
            this._monitor = this._trash.monitor_directory(
                Gio.FileMonitorFlags.WATCH_MOVES, null);
            this._signals.connect(this._monitor, 'changed', () => this._refresh());
        } catch (error) {
            console.warn(`Sheliak: monitor da lixeira indisponível: ${error}`);
        }

        this._refresh();
    }

    destroy(): void {
        this._destroyed = true;
        this._signals.destroy();
        this._monitor?.cancel();
        this._monitor = null;
        this.actor.destroy();
    }

    private _refresh(): void {
        this._trash.enumerate_children_async(
            Gio.FILE_ATTRIBUTE_STANDARD_NAME,
            Gio.FileQueryInfoFlags.NONE,
            GLib.PRIORITY_DEFAULT,
            null,
            (file, result) => {
                if (this._destroyed)
                    return;

                try {
                    const enumerator = file!.enumerate_children_finish(result);
                    enumerator.next_files_async(
                        1, GLib.PRIORITY_DEFAULT, null,
                        (enumerator2, result2) => {
                            if (this._destroyed)
                                return;

                            try {
                                const infos = enumerator2!.next_files_finish(result2);
                                enumerator2!.close(null);
                                const hasItems = infos.length > 0;
                                this._icon.icon_name = hasItems
                                    ? 'user-trash-full-symbolic'
                                    : 'user-trash-symbolic';
                                if (hasItems)
                                    this.actor.add_style_class_name('full');
                                else
                                    this.actor.remove_style_class_name('full');
                            } catch (error) {
                                console.warn(`Sheliak: não foi possível consultar a lixeira: ${error}`);
                            }
                        },
                    );
                } catch (error) {
                    console.warn(`Sheliak: não foi possível consultar a lixeira: ${error}`);
                }
            },
        );
    }
}
