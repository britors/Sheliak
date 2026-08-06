// @girs doesn't ship type declarations for Tracker (libtracker-sparql-3.0),
// so this hand-written ambient module covers only the API surface Sheliak
// uses for file search — after Gio._promisify() rewrites the *_async
// methods below to return a Promise instead of taking a callback.
declare module 'gi://Tracker' {
    import Gio from 'gi://Gio';

    namespace Tracker {
        class SparqlCursor {
            next_async(cancellable: Gio.Cancellable | null): Promise<boolean>;
            get_string(column: number): [string, number];
            close(): void;
        }

        class SparqlConnection {
            static bus_new(
                serviceName: string,
                objectPath: string | null,
                connection: Gio.DBusConnection | null,
            ): SparqlConnection;
            query_async(sparql: string, cancellable: Gio.Cancellable | null): Promise<SparqlCursor>;
            close(): void;
        }
    }

    export default Tracker;
}
