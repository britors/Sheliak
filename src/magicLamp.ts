/*
 * Magic-lamp deformation adapted for Sheliak from
 * https://github.com/hermes83/compiz-alike-magic-lamp-effect
 * Copyright (C) 2020 Mauro Pepe
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import Meta from 'gi://Meta';
import Mtk from 'gi://Mtk';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const MINIMIZE_EFFECT = 'sheliak-minimize-magic-lamp';
const UNMINIMIZE_EFFECT = 'sheliak-unminimize-magic-lamp';
const DURATION = 380;
const EDGE_EPSILON = 48;

type Completion = (actor: Meta.WindowActor) => void;

type EffectParams = {
    target: Mtk.Rectangle;
    minimizing: boolean;
    complete: Completion;
};

const MagicLampEffect = GObject.registerClass(
class MagicLampEffect extends Clutter.DeformEffect {
    declare private _target: Mtk.Rectangle;
    declare private _minimizing: boolean;
    declare private _complete: Completion;
    declare private _timeline: Clutter.Timeline | null;
    declare private _timelineSignals: number[];
    declare private _windowActor: Meta.WindowActor | null;
    declare private _finished: boolean;
    declare private _progress: number;
    declare private _collapse: number;
    declare private _shrink: number;
    declare private _monitor: {x: number; y: number; width: number; height: number};
    declare private _window: {x: number; y: number; width: number; height: number};
    declare private _side: St.Side;

    _init(params: EffectParams): void {
        super._init();
        this._target = params.target;
        this._minimizing = params.minimizing;
        this._complete = params.complete;
        this._timeline = null;
        this._timelineSignals = [];
        this._windowActor = null;
        this._finished = false;
        this._progress = 0;
        this._collapse = params.minimizing ? 0 : 1;
        this._shrink = params.minimizing ? 0 : 1;
        this._monitor = {x: 0, y: 0, width: 1, height: 1};
        this._window = {x: 0, y: 0, width: 1, height: 1};
        this._side = St.Side.BOTTOM;
    }

    override vfunc_set_actor(actor: Clutter.Actor | null): void {
        super.vfunc_set_actor(actor);
        if (!actor || this._timeline)
            return;

        this._windowActor = actor as Meta.WindowActor;
        const metaWindow = this._windowActor.meta_window;
        if (!metaWindow) {
            this.finish();
            return;
        }
        const monitor = Main.layoutManager.monitors[metaWindow.get_monitor()];
        if (!monitor) {
            this.finish();
            return;
        }

        this._monitor = monitor;
        this._window.x = actor.x - monitor.x;
        this._window.y = actor.y - monitor.y;
        [this._window.width, this._window.height] = actor.get_size();

        this._target.x -= monitor.x;
        this._target.y -= monitor.y;
        this._side = this._targetSide();
        this.set_n_tiles(16, 16);

        this._timeline = new Clutter.Timeline({actor, duration: DURATION});
        this._timelineSignals.push(this._timeline.connect('new-frame', () => this._tick()));
        this._timelineSignals.push(this._timeline.connect('completed', () => this.finish()));
        this._timeline.start();
    }

    private _targetSide(): St.Side {
        const target = this._target;
        if (target.y + target.height >= this._monitor.height - EDGE_EPSILON) {
            target.y = this._monitor.height;
            target.height = 0;
            return St.Side.BOTTOM;
        }
        if (target.x <= EDGE_EPSILON) {
            target.x = 0;
            target.width = 0;
            return St.Side.LEFT;
        }
        if (target.x + target.width >= this._monitor.width - EDGE_EPSILON) {
            target.x = this._monitor.width;
            target.width = 0;
            return St.Side.RIGHT;
        }

        target.y = 0;
        target.height = 0;
        return St.Side.TOP;
    }

    private _tick(): void {
        if (!this._timeline)
            return;

        this._progress = this._timeline.get_progress();
        const split = 0.3;
        if (this._minimizing) {
            this._collapse = Math.min(1, this._progress / split);
            this._shrink = Math.max(0, (this._progress - split) / (1 - split));
        } else {
            this._collapse = Math.max(0, 1 - Math.max(0,
                (this._progress - (1 - split)) / split));
            this._shrink = Math.max(0, 1 - Math.min(1,
                this._progress / (1 - split)));
        }

        this._windowActor?.queue_redraw();
        this.invalidate();
    }

    override vfunc_deform_vertex(
        width: number,
        height: number,
        vertex: Clutter.TextureVertex,
    ): void {
        const win = this._window;
        const icon = this._target;
        const k = this._collapse;
        const j = this._shrink;
        const scaleX = width / Math.max(1, win.width);
        const scaleY = height / Math.max(1, win.height);
        let x = 0;
        let y = 0;
        let offsetX = 0;
        let offsetY = 0;
        let waveX = 0;
        let waveY = 0;

        if (this._side === St.Side.LEFT) {
            const fullWidth = Math.max(1, win.width - icon.width + win.x * k);
            x = (fullWidth - j * fullWidth) * vertex.tx;
            y = vertex.ty * win.height * (x + (fullWidth - x) * (1 - k)) / fullWidth +
                vertex.ty * icon.height * (fullWidth - x) / fullWidth;
            offsetX = icon.width - win.x * k;
            offsetY = (icon.y - win.y) * ((fullWidth - x) / fullWidth) * k;
            waveY = Math.sin((0.5 - (fullWidth - x) / fullWidth) * 2 * Math.PI) *
                (win.y + win.height * vertex.ty - (icon.y + icon.height * vertex.ty)) / 7 * k;
        } else if (this._side === St.Side.TOP) {
            const fullHeight = Math.max(1, win.height - icon.height + win.y * k);
            y = (fullHeight - j * fullHeight) * vertex.ty;
            x = vertex.tx * win.width * (y + (fullHeight - y) * (1 - k)) / fullHeight +
                vertex.tx * icon.width * (fullHeight - y) / fullHeight;
            offsetX = (icon.x - win.x) * ((fullHeight - y) / fullHeight) * k;
            offsetY = icon.height - win.y * k;
            waveX = Math.sin((0.5 - (fullHeight - y) / fullHeight) * 2 * Math.PI) *
                (win.x + win.width * vertex.tx - (icon.x + icon.width * vertex.tx)) / 7 * k;
        } else if (this._side === St.Side.RIGHT) {
            const expansion = this._monitor.width - icon.width - win.x - win.width;
            const fullWidth = Math.max(1,
                this._monitor.width - icon.width - win.x - expansion * (1 - k));
            const currentWidth = fullWidth * (1 - j);
            x = vertex.tx * currentWidth;
            y = vertex.ty * icon.height +
                vertex.ty * (win.height - icon.height) * (1 - j) * (1 - vertex.tx) +
                vertex.ty * (win.height - icon.height) * (1 - k) * vertex.tx;
            offsetY = (icon.y - win.y) * (x / fullWidth) * k + (icon.y - win.y) * j;
            offsetX = this._monitor.width - icon.width - win.x - currentWidth - expansion * (1 - k);
            waveY = Math.sin((fullWidth - x) / fullWidth * 2 * Math.PI + Math.PI) *
                (win.y + win.height * vertex.ty - (icon.y + icon.height * vertex.ty)) / 7 * k;
        } else {
            const expansion = this._monitor.height - icon.height - win.y - win.height;
            const fullHeight = Math.max(1,
                this._monitor.height - icon.height - win.y - expansion * (1 - k));
            const currentHeight = fullHeight * (1 - j);
            y = vertex.ty * currentHeight;
            x = vertex.tx * icon.width +
                vertex.tx * (win.width - icon.width) * (1 - j) * (1 - vertex.ty) +
                vertex.tx * (win.width - icon.width) * (1 - k) * vertex.ty;
            offsetX = (icon.x - win.x) * (y / fullHeight) * k + (icon.x - win.x) * j;
            offsetY = this._monitor.height - icon.height - win.y - currentHeight - expansion * (1 - k);
            waveX = Math.sin((fullHeight - y) / fullHeight * 2 * Math.PI + Math.PI) *
                (win.x + win.width * vertex.tx - (icon.x + icon.width * vertex.tx)) / 7 * k;
        }

        vertex.x = (x + offsetX + waveX) * scaleX;
        vertex.y = (y + offsetY + waveY) * scaleY;
    }

    override vfunc_modify_paint_volume(_volume: Clutter.PaintVolume): boolean {
        return false;
    }

    finish(): void {
        if (this._finished)
            return;
        this._finished = true;

        if (this._timeline) {
            for (const id of this._timelineSignals)
                this._timeline.disconnect(id);
            this._timelineSignals = [];
            this._timeline.stop();
            this._timeline = null;
        }

        const actor = this._windowActor;
        if (actor) {
            actor.remove_effect(this);
            this._windowActor = null;
            this._complete(actor);
        }
    }
});

type WindowManagerInternals = {
    _shouldAnimateActor(actor: Meta.WindowActor, types: Meta.WindowType[]): boolean;
};

export class MagicLampManager {
    private _wm = Main.wm as unknown as WindowManagerInternals;
    private _shellwm = global.window_manager;
    private _originalShouldAnimate = this._wm._shouldAnimateActor;
    private _originalCompletedMinimize = this._shellwm.completed_minimize;
    private _originalCompletedUnminimize = this._shellwm.completed_unminimize;
    private _patchedShouldAnimate: WindowManagerInternals['_shouldAnimateActor'];
    private _patchedCompletedMinimize = (_actor: Meta.WindowActor) => {};
    private _patchedCompletedUnminimize = (_actor: Meta.WindowActor) => {};
    private _signalIds: number[] = [];

    constructor() {
        this._patchedShouldAnimate = (actor, types) => {
            const stack = new Error().stack ?? '';
            if (stack.includes('_minimizeWindow') || stack.includes('_unminimizeWindow'))
                return false;
            return this._originalShouldAnimate.call(this._wm, actor, types);
        };

        this._wm._shouldAnimateActor = this._patchedShouldAnimate;
        this._shellwm.completed_minimize = this._patchedCompletedMinimize;
        this._shellwm.completed_unminimize = this._patchedCompletedUnminimize;

        this._signalIds.push(this._shellwm.connect('minimize', (_wm, actor) => {
            this._animate(actor, true);
        }));
        this._signalIds.push(this._shellwm.connect('unminimize', (_wm, actor) => {
            actor.show();
            this._animate(actor, false);
        }));
        this._signalIds.push(this._shellwm.connect('kill-window-effects', (_wm, actor) => {
            this._destroyActorEffects(actor);
        }));
    }

    private _animate(actor: Meta.WindowActor, minimizing: boolean): void {
        const complete = minimizing
            ? this._originalCompletedMinimize.bind(this._shellwm)
            : this._originalCompletedUnminimize.bind(this._shellwm);

        if (Main.overview.visible || !St.Settings.get().enable_animations) {
            complete(actor);
            return;
        }

        this._destroyActorEffects(actor);
        const metaWindow = actor.meta_window;
        if (!metaWindow) {
            complete(actor);
            return;
        }
        const [hasGeometry, geometry] = metaWindow.get_icon_geometry();
        const target = hasGeometry ? geometry : this._fallbackTarget(actor);
        const effect = new MagicLampEffect({target, minimizing, complete} as never);
        actor.add_effect_with_name(minimizing ? MINIMIZE_EFFECT : UNMINIMIZE_EFFECT, effect);
    }

    private _fallbackTarget(actor: Meta.WindowActor): Mtk.Rectangle {
        const metaWindow = actor.meta_window;
        const monitor = metaWindow
            ? Main.layoutManager.monitors[metaWindow.get_monitor()]
            : null;
        return new Mtk.Rectangle({
            x: monitor ? monitor.x + Math.floor(monitor.width / 2) : 0,
            y: monitor ? monitor.y + monitor.height : 0,
            width: 1,
            height: 1,
        });
    }

    private _destroyActorEffects(actor: Meta.WindowActor): void {
        for (const name of [MINIMIZE_EFFECT, UNMINIMIZE_EFFECT])
            (actor.get_effect(name) as InstanceType<typeof MagicLampEffect> | null)?.finish();
    }

    destroy(): void {
        for (const id of this._signalIds)
            this._shellwm.disconnect(id);
        this._signalIds = [];

        for (const actor of global.get_window_actors())
            this._destroyActorEffects(actor);

        if (this._wm._shouldAnimateActor === this._patchedShouldAnimate)
            this._wm._shouldAnimateActor = this._originalShouldAnimate;
        if (this._shellwm.completed_minimize === this._patchedCompletedMinimize)
            this._shellwm.completed_minimize = this._originalCompletedMinimize;
        if (this._shellwm.completed_unminimize === this._patchedCompletedUnminimize)
            this._shellwm.completed_unminimize = this._originalCompletedUnminimize;
    }
}
