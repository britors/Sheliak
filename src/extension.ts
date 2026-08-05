import Gio from 'gi://Gio';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {Dock} from './dock.js';
import {WindowAnimationManager} from './windowAnimations.js';
import {PanelMenus} from './panelMenus.js';

type PanelActor = {
    visible: boolean;
    hide: () => void;
    show: () => void;
};

export default class SheliakExtension extends Extension {
    private _dock: Dock | null = null;
    private _windowAnimations: WindowAnimationManager | null = null;
    private _panelMenus: PanelMenus | null = null;
    private _settings: Gio.Settings | null = null;
    private _hideWorkspaceButtonSignal = 0;
    private _dashWasVisible = true;
    private _activitiesButton: PanelActor | null = null;
    private _activitiesButtonWasVisible = false;

    enable(): void {
        console.debug(`Sheliak: enable() em ${this.uuid}`);
        this._settings = this.getSettings('org.gnome.shell.extensions.sheliak');
        this._dock = new Dock(this._settings, this.path);
        this._windowAnimations = new WindowAnimationManager(this._settings);
        this._panelMenus = new PanelMenus(this._settings);
        // Sheliak substitui o dash padrão; mantê-lo visível duplicaria os
        // favoritos/apps em execução na Overview.
        this._dashWasVisible = Main.overview.dash.visible;
        Main.overview.dash.hide();

        // No GNOME Shell 48, o indicador de área de trabalho do painel é
        // registrado como "activities". Apenas ocultá-lo permite restaurar o
        // estado anterior sem recriar componentes internos do Shell.
        const statusArea = Main.panel.statusArea as unknown as Record<string, PanelActor>;
        this._activitiesButton = statusArea.activities ?? null;
        this._activitiesButtonWasVisible = this._activitiesButton?.visible ?? false;
        this._hideWorkspaceButtonSignal = this._settings.connect(
            'changed::hide-workspace-button', () => this._syncWorkspaceButton());
        this._syncWorkspaceButton();
        console.debug('Sheliak: dock criado e habilitado');
    }

    disable(): void {
        console.debug(`Sheliak: disable() em ${this.uuid}`);
        if (this._dashWasVisible)
            Main.overview.dash.show();
        if (this._settings && this._hideWorkspaceButtonSignal)
            this._settings.disconnect(this._hideWorkspaceButtonSignal);
        this._hideWorkspaceButtonSignal = 0;
        if (this._activitiesButtonWasVisible)
            this._activitiesButton?.show();
        this._activitiesButton = null;
        this._activitiesButtonWasVisible = false;
        this._panelMenus?.destroy();
        this._panelMenus = null;
        this._windowAnimations?.destroy();
        this._windowAnimations = null;
        this._dock?.destroy();
        this._dock = null;
        this._settings = null;
        console.debug('Sheliak: dock destruído');
    }

    private _syncWorkspaceButton(): void {
        if (this._settings?.get_boolean('hide-workspace-button'))
            this._activitiesButton?.hide();
        else if (this._activitiesButtonWasVisible)
            this._activitiesButton?.show();
    }
}
