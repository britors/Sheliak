import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {Dock} from './dock.js';

export default class SheliakExtension extends Extension {
    private _dock: Dock | null = null;
    private _dashWasVisible = true;

    enable(): void {
        console.debug(`Sheliak: enable() em ${this.uuid}`);
        this._dock = new Dock(this.getSettings('org.gnome.shell.extensions.sheliak'), this.path);
        // Sheliak substitui o dash padrão; mantê-lo visível duplicaria os
        // favoritos/apps em execução na Overview.
        this._dashWasVisible = Main.overview.dash.visible;
        Main.overview.dash.hide();
        console.debug('Sheliak: dock criado e habilitado');
    }

    disable(): void {
        console.debug(`Sheliak: disable() em ${this.uuid}`);
        if (this._dashWasVisible)
            Main.overview.dash.show();
        this._dock?.destroy();
        this._dock = null;
        console.debug('Sheliak: dock destruído');
    }
}
