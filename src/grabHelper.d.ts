// @girs/gnome-shell doesn't ship type declarations for grabHelper.js, so
// this hand-written ambient module covers only the API surface Sheliak uses.
declare module 'resource:///org/gnome/shell/ui/grabHelper.js' {
    import Clutter from 'gi://Clutter';

    export class GrabHelper {
        constructor(owner: Clutter.Actor, params?: object);
        grab(params: {
            actor?: Clutter.Actor;
            focus?: Clutter.Actor;
            onUngrab?: (isUser?: boolean) => void;
        }): boolean;
        ungrab(params?: {actor?: Clutter.Actor; isUser?: boolean}): void;
        isActorGrabbed(actor: Clutter.Actor): boolean;
    }
}
