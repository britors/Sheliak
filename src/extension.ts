import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

import {Dock} from './dock.js';

export default class SheliakExtension extends Extension {
    private _dock: Dock | null = null;

    enable(): void {
        this._dock = new Dock();
    }

    disable(): void {
        this._dock?.destroy();
        this._dock = null;
    }
}
