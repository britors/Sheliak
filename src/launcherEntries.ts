import Gio from 'gi://Gio';

const INTERFACE = 'com.canonical.Unity.LauncherEntry';
const URI_PREFIX = 'application://';

export type LauncherEntryChanged = (desktopId: string, count: number) => void;

/**
 * Listens for the `com.canonical.Unity.LauncherEntry` `Update` signal that apps (e.g. Sulafat)
 * broadcast on the session bus to badge their dock icon with a count — such as the number of
 * active SSH sessions. Apps that never emit it simply never trigger `onChanged`.
 */
export class LauncherEntryTracker {
    private _counts = new Map<string, number>();
    private _connection = Gio.DBus.session;
    private _subscriptionId: number;

    constructor(onChanged: LauncherEntryChanged) {
        this._subscriptionId = this._connection.signal_subscribe(
            null, INTERFACE, 'Update', null, null, Gio.DBusSignalFlags.NONE,
            (_connection, _sender, _path, _iface, _signal, params) => {
                const [appUri, properties] = params.deep_unpack<[string, Record<string, unknown>]>();
                if (!appUri.startsWith(URI_PREFIX))
                    return;

                const desktopId = appUri.slice(URI_PREFIX.length);
                const visible = properties['count-visible'] !== false;
                const count = visible ? Number(properties['count'] ?? 0) : 0;
                if (this._counts.get(desktopId) === count)
                    return;

                this._counts.set(desktopId, count);
                onChanged(desktopId, count);
            });
    }

    countFor(desktopId: string): number {
        return this._counts.get(desktopId) ?? 0;
    }

    destroy(): void {
        this._connection.signal_unsubscribe(this._subscriptionId);
        this._counts.clear();
    }
}
