import Gio from 'gi://Gio';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

export class ShowAppsButton {
    readonly actor: St.Button;

    constructor(iconPath: string | null) {
        // St.Icon's `gicon` type comes from a separately-versioned nested
        // @girs/gio-2.0 package (pulled in via St -> Meta), which is
        // structurally incompatible with the top-level Gio.Icon type here.
        const icon = iconPath
            ? new St.Icon({gicon: Gio.icon_new_for_string(iconPath) as never, icon_size: 32})
            : new St.Icon({icon_name: 'view-app-grid-symbolic', icon_size: 32});
        this.actor = new St.Button({
            style_class: 'sheliak-system-button sheliak-show-apps-button',
            child: icon,
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
