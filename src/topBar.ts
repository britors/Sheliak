import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import Meta from 'gi://Meta';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {SignalTracker} from './signals.js';

const SHELIAK_PANEL_INDICATOR = 'sheliak-panel-indicator';
const FLOATING_PANEL_CLASS = 'sheliak-panel-floating';
const FLUSH_PANEL_CLASS = 'sheliak-panel-flush';
const LIGHT_THEME_CLASS = 'light-theme';
const MAX_PANEL_MARGIN = 32;

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
    private _interfaceSettings = new Gio.Settings({schema_id: 'org.gnome.desktop.interface'});
    private _signals = new SignalTracker();
    private _dateMenu: VisibleActor | null;
    private _dateMenuWasVisible: boolean;
    private _rightBox: Clutter.Actor;
    private _nativeIndicators = new Map<VisibleActor, boolean>();
    private _trackedWindows = new Set<Meta.Window>();
    private _flush = false;

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
        this._signals.connect(this._settings, 'changed::floating-panel',
            () => this._syncFloating());
        this._signals.connect(this._settings, 'changed::panel-margin',
            () => this._syncFloating());
        this._signals.connect(this._interfaceSettings, 'changed::color-scheme',
            () => this._syncFloating());
        this._signals.connect(this._rightBox, 'child-added',
            (_box: Clutter.Actor, actor: Clutter.Actor) => {
                this._trackNativeIndicator(actor);
                this._syncIndicator(actor as VisibleActor);
            });
        this._signals.connect(global.display, 'window-created',
            (_display: unknown, window: Meta.Window) => {
                this._trackWindow(window);
                this._syncFloating();
            });
        this._signals.connect(global.workspace_manager, 'active-workspace-changed',
            () => this._syncFloating());
        for (const windowActor of global.get_window_actors()) {
            if (windowActor.meta_window)
                this._trackWindow(windowActor.meta_window);
        }

        this._syncHeight();
        this._syncClock();
        this._syncIndicators();
        this._syncFloating();
    }

    destroy(): void {
        this._signals.destroy();
        this._resetFloating();
        Main.panel.set_height(-1);
        if (this._dateMenuWasVisible)
            this._dateMenu?.show();
        for (const [actor, wasVisible] of this._nativeIndicators) {
            if (wasVisible && actor.get_parent())
                actor.show();
        }
        this._nativeIndicators.clear();
        this._trackedWindows.clear();
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

    /**
     * Destaca a barra das bordas da tela. A margem usa as propriedades de
     * margem do Clutter em vez de CSS porque quem aloca a barra é o
     * `panelBox` (um St.BoxLayout vertical com a largura do monitor): ele
     * encolhe a barra pela margem e cresce em altura junto, então o strut —
     * e portanto a área de trabalho das janelas — já considera o vão.
     *
     * Enquanto houver uma janela maximizada no espaço de trabalho ativo, a
     * barra "cola" nas bordas (sem margens nem cantos arredondados) para não
     * destoar da janela colada nela — mesma lógica de sobreposição usada pelo
     * dock (`dock.ts` `_windowOverlapsDock`), mas restrita a maximização em
     * vez de qualquer sobreposição de retângulo.
     */
    private _syncFloating(): void {
        const floating = this._settings.get_boolean('floating-panel');
        if (!floating) {
            this._resetFloating();
            return;
        }

        const panel = Main.panel;
        const flush = this._hasMaximizedWindow();
        const margin = flush ? 0 : Math.min(MAX_PANEL_MARGIN, this._settings.get_uint('panel-margin'));
        panel.margin_top = margin;
        panel.margin_bottom = margin;
        panel.margin_left = margin;
        panel.margin_right = margin;
        panel.add_style_class_name(FLOATING_PANEL_CLASS);
        if (flush)
            panel.add_style_class_name(FLUSH_PANEL_CLASS);
        else
            panel.remove_style_class_name(FLUSH_PANEL_CLASS);
        if (flush !== this._flush) {
            this._flush = flush;
            console.debug(`Sheliak: barra ${flush ? 'colada (janela maximizada)' : 'flutuante'}`);
        }

        // A paleta Lyra tem variantes clara e escura; o resto do visual (raio,
        // borda, sombra) é o mesmo do dock, para as duas superfícies
        // combinarem na tela.
        if (this._interfaceSettings.get_string('color-scheme') === 'prefer-dark')
            panel.remove_style_class_name(LIGHT_THEME_CLASS);
        else
            panel.add_style_class_name(LIGHT_THEME_CLASS);
    }

    private _resetFloating(): void {
        const panel = Main.panel;
        panel.margin_top = 0;
        panel.margin_bottom = 0;
        panel.margin_left = 0;
        panel.margin_right = 0;
        panel.remove_style_class_name(FLOATING_PANEL_CLASS);
        panel.remove_style_class_name(FLUSH_PANEL_CLASS);
        panel.remove_style_class_name(LIGHT_THEME_CLASS);
    }

    private _trackWindow(window: Meta.Window): void {
        if (this._trackedWindows.has(window))
            return;
        this._trackedWindows.add(window);
        for (const signal of ['notify::maximized-horizontally',
            'notify::maximized-vertically', 'workspace-changed', 'notify::minimized']) {
            this._signals.connect(window, signal, () => this._syncFloating());
        }
    }

    private _hasMaximizedWindow(): boolean {
        const workspace = global.workspace_manager.get_active_workspace();
        return global.get_window_actors().some(windowActor => {
            const window = windowActor.meta_window;
            return !!window && !window.minimized && window.showing_on_its_workspace()
                && window.get_workspace() === workspace
                && window.get_monitor() === Main.layoutManager.primaryIndex
                && window.get_maximized() === Meta.MaximizeFlags.BOTH;
        });
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
