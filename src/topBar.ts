import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {SignalTracker} from './signals.js';

const SHELIAK_PANEL_INDICATOR = 'sheliak-panel-indicator';

type PanelInternals = {
    _rightBox: Clutter.Actor;
};

type VisibleActor = Clutter.Actor & {
    visible: boolean;
    hide: () => void;
    show: () => void;
};

/**
 * Applies the top-panel preferences while preserving every actor's previous
 * visibility. Sheliak's own panel menus are deliberately excluded so placing
 * them on the right remains useful even when GNOME's native indicators are
 * hidden.
 */
export class TopBarManager {
    private _settings: Gio.Settings;
    private _signals = new SignalTracker();
    private _dateMenu: VisibleActor | null;
    private _dateMenuWasVisible: boolean;
    private _rightBox: Clutter.Actor;
    private _nativeIndicators = new Map<VisibleActor, boolean>();

    constructor(settings: Gio.Settings) {
        this._settings = settings;
        const statusArea = Main.panel.statusArea as unknown as Record<string, VisibleActor>;
        this._dateMenu = statusArea.dateMenu ?? null;
        this._dateMenuWasVisible = this._dateMenu?.visible ?? false;
        this._rightBox = (Main.panel as unknown as PanelInternals)._rightBox;

        for (const actor of this._rightBox.get_children())
            this._trackNativeIndicator(actor);

        this._signals.connect(this._settings, 'changed::panel-height',
            () => this._syncHeight());
        this._signals.connect(this._settings, 'changed::show-clock',
            () => this._syncClock());
        this._signals.connect(this._settings, 'changed::show-panel-indicators',
            () => this._syncIndicators());
        this._signals.connect(this._rightBox, 'child-added',
            (_box: Clutter.Actor, actor: Clutter.Actor) => {
                this._trackNativeIndicator(actor);
                this._syncIndicator(actor as VisibleActor);
            });

        this._syncHeight();
        this._syncClock();
        this._syncIndicators();
    }

    destroy(): void {
        this._signals.destroy();
        Main.panel.set_height(-1);
        if (this._dateMenuWasVisible)
            this._dateMenu?.show();
        for (const [actor, wasVisible] of this._nativeIndicators) {
            if (wasVisible && actor.get_parent())
                actor.show();
        }
        this._nativeIndicators.clear();
        this._dateMenu = null;
    }

    private _trackNativeIndicator(actor: Clutter.Actor): void {
        if (actor instanceof St.Widget && actor.has_style_class_name(SHELIAK_PANEL_INDICATOR))
            return;
        const indicator = actor as VisibleActor;
        if (this._nativeIndicators.has(indicator))
            return;
        this._nativeIndicators.set(indicator, indicator.visible);
        // Alguns indicadores são inseridos ocultos e exibidos somente depois
        // de obterem estado (rede, bateria, acessibilidade etc.). Se a opção
        // estiver desligada, interceptamos essa exibição e lembramos que o
        // Shell queria mostrar o ator para restaurá-lo mais tarde.
        this._signals.connect(indicator, 'notify::visible', () => {
            if (this._settings.get_boolean('show-panel-indicators')) {
                this._nativeIndicators.set(indicator, indicator.visible);
            } else if (indicator.visible) {
                this._nativeIndicators.set(indicator, true);
                indicator.hide();
            }
        });
    }

    private _syncHeight(): void {
        Main.panel.set_height(Math.max(24, Math.min(64,
            this._settings.get_uint('panel-height'))));
    }

    private _syncClock(): void {
        if (this._settings.get_boolean('show-clock')) {
            if (this._dateMenuWasVisible)
                this._dateMenu?.show();
        } else {
            this._dateMenu?.hide();
        }
    }

    private _syncIndicators(): void {
        for (const actor of this._nativeIndicators.keys())
            this._syncIndicator(actor);
    }

    private _syncIndicator(actor: VisibleActor): void {
        if (this._settings.get_boolean('show-panel-indicators')) {
            if (this._nativeIndicators.get(actor) && actor.get_parent())
                actor.show();
        } else {
            actor.hide();
        }
    }
}
