import St from 'gi://St';
import Shell from 'gi://Shell';
import Meta from 'gi://Meta';

import * as AppFavorites from 'resource:///org/gnome/shell/ui/appFavorites.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';

export class AppContextMenu {
    readonly menu: PopupMenu.PopupMenu;
    private _app: Shell.App;
    private _favorites: ReturnType<typeof AppFavorites.getAppFavorites>;

    constructor(source: St.Widget, app: Shell.App) {
        this._app = app;
        this._favorites = AppFavorites.getAppFavorites();
        this.menu = new PopupMenu.PopupMenu(source, 0.5, St.Side.BOTTOM);
        this.menu.actor.add_style_class_name('sheliak-menu');
        Main.uiGroup.add_child(this.menu.actor);
        this.menu.actor.hide();
    }

    rebuild(): void {
        this.menu.removeAll();

        if (this._app.can_open_new_window()) {
            this.menu.addAction(_('Open New Window'), () =>
                this._app.open_new_window(-1));
        }

        const id = this._app.get_id();
        if (id && !this._app.is_window_backed()) {
            const favorite = this._favorites.isFavorite(id);
            this.menu.addAction(
                favorite ? _('Remove from Favorites') : _('Add to Favorites'),
                () => favorite
                    ? this._favorites.removeFavorite(id)
                    : this._favorites.addFavorite(id),
            );
        }

        const windows = this._windows();
        if (windows.length > 1) {
            this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
            for (const window of windows) {
                const title = window.get_title() || this._app.get_name();
                this.menu.addAction(title, () =>
                    Main.activateWindow(window, global.get_current_time()));
            }
        }

        if (windows.length > 0) {
            this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
            this.menu.addAction(_('Quit'), () => {
                for (const window of this._windows())
                    window.delete(global.get_current_time());
            });
        }
    }

    toggle(): void {
        this.rebuild();
        this.menu.toggle();
    }

    close(): void {
        this.menu.close();
    }

    destroy(): void {
        this.menu.destroy();
    }

    private _windows(): Meta.Window[] {
        return this._app.get_windows()
            .filter(window => !window.skip_taskbar);
    }
}
