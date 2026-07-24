type SignalObject = {
    connect(signal: string, callback: (...args: any[]) => unknown): number;
    disconnect(id: number): void;
};

export class SignalTracker {
    private _signals: Array<[SignalObject, number]> = [];

    connect(
        object: SignalObject,
        signal: string,
        callback: (...args: any[]) => unknown,
    ): number {
        const id = object.connect(signal, callback);
        this._signals.push([object, id]);
        return id;
    }

    destroy(): void {
        for (const [object, id] of this._signals.splice(0)) {
            try {
                object.disconnect(id);
            } catch {
                // The owner may already have destroyed the signal source.
            }
        }
    }
}
