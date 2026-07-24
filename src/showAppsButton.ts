import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

export class ShowAppsButton {
    readonly actor: St.Button;

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
        this.actor.connect('clicked', () => Main.overview.showApps());
    }

    destroy(): void {
        this.actor.destroy();
    }
}
