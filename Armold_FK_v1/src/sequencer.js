import { DEG } from './robot.js';

/**
 * Step-sequence motion planner (pure forward kinematics).
 *
 * A "program" is an ordered list of steps. Each step is a target pose:
 *   { name, angles: [deg x6], gripper: 0..1, duration: s, dwell: s }
 *
 * Playback is a small state machine advanced by dt each frame:
 *   move  -> interpolate joints + gripper from the current pose to the target
 *   dwell -> hold for `dwell` seconds (lets a grab/release settle)
 * then advance to the next step (optionally looping).
 */

function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function makeStep(robot, overrides = {}) {
  return {
    name: overrides.name ?? 'Step',
    angles: overrides.angles ?? robot.getAnglesDeg().map((d) => Math.round(d * 10) / 10),
    gripper: overrides.gripper ?? robot.gripper,
    duration: overrides.duration ?? 1.2,
    dwell: overrides.dwell ?? 0.3,
  };
}

export class Sequencer {
  constructor(robot) {
    this.robot = robot;
    this.steps = [];

    this.playing = false;
    this.loop = false;
    this.singleStep = false; // run exactly one step then pause

    this.index = 0;
    this.phase = 'move';
    this.t = 0;
    this._from = { angles: [], gripper: 0 };

    this.onChange = null;     // fired when step index/phase changes
    this.onComplete = null;   // fired when the program finishes (non-loop)
  }

  setSteps(steps) {
    this.steps = steps;
    this.stop();
  }

  _beginMove() {
    this._from.angles = this.robot.angles.slice();
    this._from.gripper = this.robot.gripper;
    this.phase = 'move';
    this.t = 0;
  }

  play() {
    if (this.steps.length === 0) return;
    if (this.index >= this.steps.length) this.index = 0;
    this.singleStep = false;
    this.playing = true;
    this._beginMove();
    this._emit();
  }

  /** Execute just the current step, then pause. */
  stepOnce() {
    if (this.steps.length === 0) return;
    if (this.index >= this.steps.length) this.index = 0;
    this.singleStep = true;
    this.playing = true;
    this._beginMove();
    this._emit();
  }

  pause() {
    this.playing = false;
    this._emit();
  }

  stop() {
    this.playing = false;
    this.index = 0;
    this.phase = 'move';
    this.t = 0;
    this._emit();
  }

  update(dt) {
    if (!this.playing || this.steps.length === 0) return;
    const step = this.steps[this.index];
    if (!step) {
      this.playing = false;
      return;
    }

    if (this.phase === 'move') {
      const dur = Math.max(0.0001, step.duration);
      this.t += dt;
      const u = Math.min(this.t / dur, 1);
      const e = easeInOut(u);

      const target = step.angles.map((d) => d * DEG);
      const out = this.robot.angles.slice();
      for (let i = 0; i < this._from.angles.length; i++) {
        out[i] = lerp(this._from.angles[i], target[i] ?? this._from.angles[i], e);
      }
      this.robot.setAngles(out);
      this.robot.setGripper(lerp(this._from.gripper, step.gripper, e));

      if (u >= 1) {
        this.phase = 'dwell';
        this.t = 0;
        this._emit();
      }
    } else {
      this.t += dt;
      if (this.t >= step.dwell) this._advance();
    }
  }

  _advance() {
    this.index += 1;
    if (this.singleStep) {
      this.playing = false;
      if (this.index >= this.steps.length) this.index = this.steps.length; // clamp
      this._emit();
      return;
    }
    if (this.index >= this.steps.length) {
      if (this.loop) {
        this.index = 0;
        this._beginMove();
        this._emit();
      } else {
        this.playing = false;
        this.index = this.steps.length - 1; // rest on last step
        this._emit();
        if (this.onComplete) this.onComplete();
      }
      return;
    }
    this._beginMove();
    this._emit();
  }

  _emit() {
    if (this.onChange) this.onChange();
  }

  toJSON() {
    return { version: 1, steps: this.steps };
  }

  loadJSON(data) {
    if (!data || !Array.isArray(data.steps)) throw new Error('Invalid sequence file');
    this.setSteps(data.steps);
  }
}
