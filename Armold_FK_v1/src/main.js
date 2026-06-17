import * as THREE from 'three';
import { createScene } from './scene.js';
import { RobotArm } from './robot.js';
import { PartsManager } from './parts.js';
import { Sequencer } from './sequencer.js';
import { UI } from './ui.js';
import './style.css';

const canvas = document.getElementById('scene');
const panel = document.getElementById('panel');
const hud = document.getElementById('hud');

const { renderer, scene, camera, controls, resize } = createScene(canvas);

// Robot
const robot = new RobotArm();
scene.add(robot.root);

// Parts + drop zones
const parts = new PartsManager(scene, robot);
parts.defaultLayout();
const partsLayout = parts.snapshot();

// Motion sequencer
const sequencer = new Sequencer(robot);

// UI / control panel
const ui = new UI({ panel, hud, robot, sequencer, parts, partsLayout });

// The panel can change size (responsive); keep the canvas in sync.
const ro = new ResizeObserver(() => resize());
ro.observe(canvas.parentElement);

// Debug handle: lets you inspect/drive the sim from the dev console, e.g.
//   __armold.robot.getTipWorld()  /  __armold.parts.parts[0].position
// (THREE itself is intentionally not exposed here — referencing the whole
// namespace from a global defeats Vite's tree-shaking and bloats the bundle.)
window.__armold = { scene, camera, robot, parts, sequencer, ui };

// --- Animation loop ---------------------------------------------------
const clock = new THREE.Clock();

function tick() {
  const dt = Math.min(clock.getDelta(), 0.05); // clamp big frame gaps

  sequencer.update(dt);
  parts.update();
  ui.syncFromRobot();
  controls.update();

  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}
tick();
