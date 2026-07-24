import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

export class ShowAppsButton {
    readonly actor: St.Button;
    private _overviewHiddenId = 0;

    constructor() {
        this.actor = new St.Button({
            style_class: 'sheliak-system-button sheliak-show-apps-button',
            child: new St.Icon({
                icon_name: 'view-app-grid-symbolic',
                icon_size: 32,
            }),
            reactive: true,
            can_focus: true,
            track_hover: true,
            accessible_name: 'Mostrar aplicativos',
        });
        this.actor.connect('clicked', () => {
            // The extension supplies its own applications button; avoid showing
            // the duplicate default dash alongside the applications grid.
            Main.overview.dash?.hide();
            Main.overview.showApps();
        });
        this._overviewHiddenId = Main.overview.connect('hidden', () => Main.overview.dash?.show());
    }

    destroy(): void {
        if (this._overviewHiddenId)
            Main.overview.disconnect(this._overviewHiddenId);
        this.actor.destroy();
    }
}
