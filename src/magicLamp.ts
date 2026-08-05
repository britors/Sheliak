/*
 * Magic-lamp deformation adapted for Sheliak from
 * https://github.com/hermes83/compiz-alike-magic-lamp-effect
 * Copyright (C) 2020 Mauro Pepe
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import Meta from 'gi://Meta';
import Mtk from 'gi://Mtk';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const MINIMIZE_EFFECT = 'sheliak-minimize-magic-lamp';
const UNMINIMIZE_EFFECT = 'sheliak-unminimize-magic-lamp';
const DURATION = 380;
const ZOOM_DURATION = 260;
const FADE_DURATION = 200;
const EDGE_EPSILON = 48;
const RESTORE_SETTLE_POINT = 0.92;

type AnimationMode = 'magic-lamp' | 'zoom' | 'fade' | 'none';

type Completion = (actor: Meta.WindowActor) => void;

type EffectParams = {
    target: Mtk.Rectangle;
    minimizing: boolean;
    complete: Completion;
};

interface ActiveWindowAnimation {
    finish(): void;
}

type ActorState = {
    opacity: number;
    scaleX: number;
    scaleY: number;
    translationX: number;
    translationY: number;
    pivotX: number;
    pivotY: number;
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

        const timelineProgress = this._timeline.get_progress();
        // Reach the identity deformation a few frames before notifying Mutter.
        // This prevents a partially collapsed final frame from flashing beside
        // the dock when the effect is detached during window restoration.
        this._progress = this._minimizing
            ? timelineProgress
            : Math.min(1, timelineProgress / RESTORE_SETTLE_POINT);
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

class TransformAnimation implements ActiveWindowAnimation {
    private _timeline: Clutter.Timeline | null;
    private _timelineSignals: number[] = [];
    private _finished = false;
    private _state: ActorState;
    private _targetScale = 1;
    private _targetTranslationX = 0;
    private _targetTranslationY = 0;

    constructor(
        private _actor: Meta.WindowActor,
        target: Mtk.Rectangle,
        private _minimizing: boolean,
        private _mode: 'zoom' | 'fade',
        private _complete: Completion,
    ) {
        const [pivotX, pivotY] = _actor.get_pivot_point();
        this._state = {
            opacity: _actor.opacity,
            scaleX: _actor.scale_x,
            scaleY: _actor.scale_y,
            translationX: _actor.translation_x,
            translationY: _actor.translation_y,
            pivotX,
            pivotY,
        };

        if (_mode === 'zoom') {
            const [width, height] = _actor.get_size();
            const targetWidth = Math.max(1, target.width);
            const targetHeight = Math.max(1, target.height);
            this._targetScale = Math.max(0.04,
                Math.min(targetWidth / Math.max(1, width),
                    targetHeight / Math.max(1, height)));
            this._targetTranslationX = this._state.translationX +
                target.x + target.width / 2 - (_actor.x + width / 2);
            this._targetTranslationY = this._state.translationY +
                target.y + target.height / 2 - (_actor.y + height / 2);
        } else {
            this._targetScale = 0.92;
            this._targetTranslationX = this._state.translationX;
            this._targetTranslationY = this._state.translationY;
        }

        _actor.set_pivot_point(0.5, 0.5);
        this._apply(0);
        this._timeline = new Clutter.Timeline({
            actor: _actor,
            duration: _mode === 'zoom' ? ZOOM_DURATION : FADE_DURATION,
        });
        this._timelineSignals.push(this._timeline.connect('new-frame', () => {
            if (this._timeline)
                this._apply(this._timeline.get_progress());
        }));
        this._timelineSignals.push(this._timeline.connect('completed', () => this.finish()));
        this._timeline.start();
    }

    private _apply(progress: number): void {
        // Minimize accelerates into the icon; restore decelerates out of it.
        const collapsed = this._minimizing
            ? progress * progress * progress
            : Math.pow(1 - progress, 3);
        const scale = 1 + (this._targetScale - 1) * collapsed;
        const opacity = Math.round(this._state.opacity * (1 - collapsed));

        this._actor.scale_x = this._state.scaleX * scale;
        this._actor.scale_y = this._state.scaleY * scale;
        this._actor.translation_x = this._state.translationX +
            (this._targetTranslationX - this._state.translationX) * collapsed;
        this._actor.translation_y = this._state.translationY +
            (this._targetTranslationY - this._state.translationY) * collapsed;
        this._actor.opacity = opacity;
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

        this._actor.opacity = this._state.opacity;
        this._actor.scale_x = this._state.scaleX;
        this._actor.scale_y = this._state.scaleY;
        this._actor.translation_x = this._state.translationX;
        this._actor.translation_y = this._state.translationY;
        this._actor.set_pivot_point(this._state.pivotX, this._state.pivotY);
        this._complete(this._actor);
    }
}

export class WindowAnimationManager {
    private _shellwm = global.window_manager;
    private _originalCompletedMinimize = this._shellwm.completed_minimize;
    private _originalCompletedUnminimize = this._shellwm.completed_unminimize;
    private _nativeSignalIds: number[] = [];
    private _signalIds: number[] = [];
    private _activeAnimations = new Map<Meta.WindowActor, ActiveWindowAnimation>();

    constructor(private _settings: Gio.Settings) {
        // Main.wm connects its minimize handlers before extensions are loaded.
        // Block those exact handlers while Sheliak owns the animations; merely
        // replacing methods on Main.wm does not change callbacks that GObject
        // has already connected.
        for (const signalId of ['minimize', 'unminimize']) {
            const handlerId = Number(GObject.signal_handler_find(
                this._shellwm as never, {signalId} as never));
            if (!handlerId) {
                console.error(`Sheliak: manipulador nativo de ${signalId} não encontrado`);
                for (const id of this._nativeSignalIds)
                    this._shellwm.unblock_signal_handler(id);
                this._nativeSignalIds = [];
                return;
            }
            this._shellwm.block_signal_handler(handlerId);
            this._nativeSignalIds.push(handlerId);
        }

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
        const shellComplete = minimizing
            ? this._originalCompletedMinimize.bind(this._shellwm)
            : this._originalCompletedUnminimize.bind(this._shellwm);
        const complete = (completedActor: Meta.WindowActor) => {
            this._activeAnimations.delete(completedActor);
            shellComplete(completedActor);
        };

        if (Main.overview.visible || !St.Settings.get().enable_animations) {
            complete(actor);
            return;
        }

        this._destroyActorEffects(actor);
        const mode = this._animationMode();
        if (mode === 'none') {
            complete(actor);
            return;
        }

        const metaWindow = actor.meta_window;
        if (!metaWindow) {
            complete(actor);
            return;
        }
        const [hasGeometry, geometry] = metaWindow.get_icon_geometry();
        const target = hasGeometry ? geometry : this._fallbackTarget(actor);
        if (mode === 'magic-lamp') {
            const effect = new MagicLampEffect({target, minimizing, complete} as never);
            this._activeAnimations.set(actor, effect);
            actor.add_effect_with_name(minimizing ? MINIMIZE_EFFECT : UNMINIMIZE_EFFECT, effect);
        } else {
            const animation = new TransformAnimation(
                actor, target, minimizing, mode, complete);
            this._activeAnimations.set(actor, animation);
        }
    }

    private _animationMode(): AnimationMode {
        const mode = this._settings.get_string('minimize-animation');
        if (mode === 'zoom' || mode === 'fade' || mode === 'none')
            return mode;
        return 'magic-lamp';
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
        this._activeAnimations.get(actor)?.finish();
    }

    destroy(): void {
        for (const id of this._signalIds)
            this._shellwm.disconnect(id);
        this._signalIds = [];

        for (const actor of global.get_window_actors())
            this._destroyActorEffects(actor);
        this._activeAnimations.clear();

        for (const id of this._nativeSignalIds)
            this._shellwm.unblock_signal_handler(id);
        this._nativeSignalIds = [];
    }
}
