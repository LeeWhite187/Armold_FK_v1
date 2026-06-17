import { JOINTS, DEG } from './robot.js';
import { makeStep } from './sequencer.js';

/**
 * Builds the control panel DOM and wires it to the robot + sequencer.
 *
 * Two-way binding:
 *  - dragging a jog slider drives the robot directly (live forward kinematics)
 *  - while a program plays, syncFromRobot() pushes joint values back to the
 *    sliders/readouts so the panel mirrors the motion.
 */

const LS_KEY = 'armold.sequence.v1';

export class UI {
  constructor({ panel, hud, robot, sequencer, parts, partsLayout }) {
    this.panel = panel;
    this.hud = hud;
    this.robot = robot;
    this.seq = sequencer;
    this.parts = parts;
    this.partsLayout = partsLayout;

    this.selected = -1; // selected step index
    this._sliders = [];
    this._readouts = [];

    this._build();
    this.seq.onChange = () => this.refreshSteps();
    this.refreshSteps();
  }

  _build() {
    this.panel.innerHTML = `
      <header class="brand">
        <h1>Armold</h1>
        <span class="sub">FK Arm Simulator</span>
      </header>

      <section class="card">
        <h2>Jog Joints</h2>
        <div id="jog"></div>
        <div class="grip-row">
          <label>Gripper</label>
          <input id="grip" type="range" min="0" max="1" step="0.01" value="0" />
          <span id="grip-val" class="val">open</span>
        </div>
        <div class="btn-row">
          <button id="home">Home Pose</button>
        </div>
      </section>

      <section class="card">
        <h2>Program</h2>
        <ol id="steps" class="steps"></ol>
        <div class="btn-row">
          <button id="add">+ Add (capture pose)</button>
          <button id="update" disabled>Update</button>
          <button id="del" disabled>Delete</button>
        </div>
        <div class="btn-row">
          <button id="up" disabled>&uarr;</button>
          <button id="down" disabled>&darr;</button>
          <button id="goto" disabled>Preview Pose</button>
        </div>
        <div id="editor" class="editor hidden">
          <label>Name <input id="s-name" type="text" /></label>
          <label>Duration (s) <input id="s-dur" type="number" min="0.1" step="0.1" /></label>
          <label>Dwell (s) <input id="s-dwell" type="number" min="0" step="0.1" /></label>
          <label class="chk"><input id="s-grip" type="checkbox" /> Close gripper</label>
        </div>
      </section>

      <section class="card">
        <h2>Playback</h2>
        <div class="btn-row">
          <button id="play" class="primary">&#9654; Play</button>
          <button id="pause">&#10073;&#10073; Pause</button>
          <button id="stepBtn">Step</button>
          <button id="stop">&#9632; Stop</button>
        </div>
        <div class="btn-row">
          <label class="chk"><input id="loop" type="checkbox" /> Loop</label>
          <button id="reset">Reset Scene</button>
        </div>
      </section>

      <section class="card">
        <h2>File</h2>
        <div class="btn-row">
          <button id="save">Save</button>
          <button id="load">Load</button>
          <button id="demo">Load Demo</button>
        </div>
        <div class="btn-row">
          <button id="export">Export JSON</button>
          <button id="import">Import JSON</button>
          <input id="file" type="file" accept="application/json" hidden />
        </div>
      </section>
    `;

    // --- Jog sliders ---------------------------------------------------
    const jog = this.panel.querySelector('#jog');
    JOINTS.forEach((j, i) => {
      const row = document.createElement('div');
      row.className = 'jog-row';
      row.innerHTML = `
        <label>${j.name}</label>
        <input type="range" min="${j.min}" max="${j.max}" step="0.5" value="${j.home}" />
        <span class="val">${j.home}&deg;</span>
      `;
      const slider = row.querySelector('input');
      const val = row.querySelector('.val');
      slider.addEventListener('input', () => {
        const deg = parseFloat(slider.value);
        this.robot.setAngle(i, deg * DEG);
        val.textContent = `${deg.toFixed(0)}°`;
        this.seq.pause();
      });
      jog.appendChild(row);
      this._sliders.push(slider);
      this._readouts.push(val);
    });

    // --- Gripper slider ------------------------------------------------
    this._grip = this.panel.querySelector('#grip');
    this._gripVal = this.panel.querySelector('#grip-val');
    this._grip.addEventListener('input', () => {
      const v = parseFloat(this._grip.value);
      this.robot.setGripper(v);
      this._gripVal.textContent = v > 0.5 ? 'closed' : 'open';
    });

    // --- Buttons -------------------------------------------------------
    const $ = (id) => this.panel.querySelector(id);
    $('#home').onclick = () => { this.robot.home(); this.seq.pause(); this.syncFromRobot(true); };

    $('#add').onclick = () => this._addStep();
    $('#update').onclick = () => this._updateStep();
    $('#del').onclick = () => this._deleteStep();
    $('#up').onclick = () => this._move(-1);
    $('#down').onclick = () => this._move(1);
    $('#goto').onclick = () => this._previewPose();

    $('#play').onclick = () => this.seq.play();
    $('#pause').onclick = () => this.seq.pause();
    $('#stepBtn').onclick = () => this.seq.stepOnce();
    $('#stop').onclick = () => { this.seq.stop(); };
    $('#loop').onchange = (e) => { this.seq.loop = e.target.checked; };
    $('#reset').onclick = () => this._resetScene();

    $('#save').onclick = () => this._save();
    $('#load').onclick = () => this._load();
    $('#demo').onclick = () => { this.seq.setSteps(demoProgram(this.robot)); this.refreshSteps(); };
    $('#export').onclick = () => this._export();
    $('#import').onclick = () => $('#file').click();
    $('#file').onchange = (e) => this._import(e);

    // --- Step editor live edits ---------------------------------------
    this._eName = $('#s-name');
    this._eDur = $('#s-dur');
    this._eDwell = $('#s-dwell');
    this._eGrip = $('#s-grip');
    for (const el of [this._eName, this._eDur, this._eDwell, this._eGrip]) {
      el.addEventListener('change', () => this._applyEditor());
    }
  }

  // ---- Jog sync -------------------------------------------------------
  syncFromRobot(force = false) {
    if (!force && !this.seq.playing) return;
    const deg = this.robot.getAnglesDeg();
    for (let i = 0; i < this._sliders.length; i++) {
      this._sliders[i].value = deg[i].toFixed(1);
      this._readouts[i].textContent = `${deg[i].toFixed(0)}°`;
    }
    this._grip.value = this.robot.gripper.toFixed(2);
    this._gripVal.textContent = this.robot.gripper > 0.5 ? 'closed' : 'open';
  }

  // ---- Step list ------------------------------------------------------
  refreshSteps() {
    const list = this.panel.querySelector('#steps');
    list.innerHTML = '';
    this.seq.steps.forEach((step, i) => {
      const li = document.createElement('li');
      li.className = 'step' +
        (i === this.selected ? ' selected' : '') +
        (i === this.seq.index && this.seq.playing ? ' active' : '');
      li.innerHTML = `
        <span class="step-name">${i + 1}. ${escapeHtml(step.name)}</span>
        <span class="step-meta">${step.gripper > 0.5 ? '✊' : '✋'} ${step.duration}s</span>
      `;
      li.onclick = () => this._select(i);
      list.appendChild(li);
    });
    this._updateButtons();
  }

  _select(i) {
    this.selected = i;
    this.refreshSteps();
    const step = this.seq.steps[i];
    const editor = this.panel.querySelector('#editor');
    if (!step) { editor.classList.add('hidden'); return; }
    editor.classList.remove('hidden');
    this._eName.value = step.name;
    this._eDur.value = step.duration;
    this._eDwell.value = step.dwell;
    this._eGrip.checked = step.gripper > 0.5;
  }

  _updateButtons() {
    const has = this.selected >= 0 && this.selected < this.seq.steps.length;
    for (const id of ['#update', '#del', '#up', '#down', '#goto']) {
      this.panel.querySelector(id).disabled = !has;
    }
  }

  _addStep() {
    const step = makeStep(this.robot, { name: `Step ${this.seq.steps.length + 1}` });
    const at = this.selected >= 0 ? this.selected + 1 : this.seq.steps.length;
    this.seq.steps.splice(at, 0, step);
    this.selected = at;
    this.refreshSteps();
    this._select(at);
  }

  _updateStep() {
    const step = this.seq.steps[this.selected];
    if (!step) return;
    step.angles = this.robot.getAnglesDeg().map((d) => Math.round(d * 10) / 10);
    step.gripper = this.robot.gripper;
    this._eGrip.checked = step.gripper > 0.5;
    this.refreshSteps();
    this._select(this.selected);
  }

  _deleteStep() {
    if (this.selected < 0) return;
    this.seq.steps.splice(this.selected, 1);
    this.selected = Math.min(this.selected, this.seq.steps.length - 1);
    this.refreshSteps();
    if (this.selected >= 0) this._select(this.selected);
    else this.panel.querySelector('#editor').classList.add('hidden');
  }

  _move(dir) {
    const i = this.selected;
    const j = i + dir;
    if (i < 0 || j < 0 || j >= this.seq.steps.length) return;
    const arr = this.seq.steps;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    this.selected = j;
    this.refreshSteps();
    this._select(j);
  }

  _previewPose() {
    const step = this.seq.steps[this.selected];
    if (!step) return;
    this.seq.pause();
    this.robot.setAngles(step.angles.map((d) => d * DEG));
    this.robot.setGripper(step.gripper);
    this.syncFromRobot(true);
  }

  _applyEditor() {
    const step = this.seq.steps[this.selected];
    if (!step) return;
    step.name = this._eName.value || 'Step';
    step.duration = Math.max(0.1, parseFloat(this._eDur.value) || 1);
    step.dwell = Math.max(0, parseFloat(this._eDwell.value) || 0);
    step.gripper = this._eGrip.checked ? 1 : 0;
    this.refreshSteps();
  }

  // ---- Scene reset ----------------------------------------------------
  _resetScene() {
    this.seq.stop();
    this.robot.home();
    this.parts.reset(this.partsLayout);
    this.syncFromRobot(true);
  }

  // ---- Persistence ----------------------------------------------------
  _save() {
    localStorage.setItem(LS_KEY, JSON.stringify(this.seq.toJSON()));
    this._flash('Saved to browser');
  }

  _load() {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) { this._flash('Nothing saved'); return; }
    try {
      this.seq.loadJSON(JSON.parse(raw));
      this.selected = -1;
      this.refreshSteps();
      this._flash('Loaded');
    } catch (e) {
      this._flash('Load failed');
    }
  }

  _export() {
    const blob = new Blob([JSON.stringify(this.seq.toJSON(), null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'armold-sequence.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  async _import(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      this.seq.loadJSON(JSON.parse(text));
      this.selected = -1;
      this.refreshSteps();
      this._flash('Imported');
    } catch (err) {
      this._flash('Import failed');
    }
    e.target.value = '';
  }

  _flash(msg) {
    this.hud.textContent = msg;
    this.hud.classList.add('show');
    clearTimeout(this._flashT);
    this._flashT = setTimeout(() => this.hud.classList.remove('show'), 1600);
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])
  );
}

/**
 * A starter pick-and-place demo. Angles are hand-tuned approximations; use
 * jog + "Update" to refine them against your own part layout.
 */
export function demoProgram(robot) {
  const S = (name, angles, gripper, duration = 1.2, dwell = 0.3) => ({
    name, angles, gripper, duration, dwell,
  });
  // Poses tuned so the tool tip lands on the red part (2.2, 0.6) and the
  // matching drop zone (-2.2, 0.8). Refine with jog + "Update" for your layout.
  const ABOVE_PART = [80, 41.2, 75.7, 52.1, 21.5, 0];
  const GRASP_PART = [80, 57.8, 63, 63.9, 21.4, 0];
  const ABOVE_ZONE = [-70, 44.9, 66.2, 61.6, 0.1, 0];
  const GRASP_ZONE = [-70, 49.8, 77.2, 40.6, 0.1, 0];
  return [
    S('Home',          [0, -30, 70, 50, 0, 0], 0, 1.0, 0.2),
    S('Above part',    ABOVE_PART, 0, 1.6, 0.2),
    S('Lower to part', GRASP_PART, 0, 1.0, 0.3),
    S('Grip',          GRASP_PART, 1, 0.6, 0.4),
    S('Lift',          ABOVE_PART, 1, 1.0, 0.2),
    S('Above zone',    ABOVE_ZONE, 1, 1.8, 0.2),
    S('Lower to zone', GRASP_ZONE, 1, 1.0, 0.3),
    S('Release',       GRASP_ZONE, 0, 0.6, 0.4),
    S('Retract',       ABOVE_ZONE, 0, 1.0, 0.2),
    S('Home',          [0, -30, 70, 50, 0, 0], 0, 1.6, 0.2),
  ];
}
