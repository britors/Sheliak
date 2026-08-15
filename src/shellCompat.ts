import Clutter from 'gi://Clutter';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

export class UnsupportedShellFeature extends Error {}

export function shellIsStartingUp(): boolean {
    const layout = Main.layoutManager as unknown as Record<string, unknown>;
    return typeof layout._startingUp === 'boolean' ? layout._startingUp : false;
}

export function panelRightBox(): Clutter.Actor {
    const panel = Main.panel as unknown as Record<string, unknown>;
    const box = panel._rightBox;
    if (!box || typeof (box as Clutter.Actor).get_children !== 'function')
        throw new UnsupportedShellFeature('Main.panel._rightBox não está disponível');
    return box as Clutter.Actor;
}
