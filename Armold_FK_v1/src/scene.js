import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

/**
 * Sets up renderer, camera, lights, ground plane and orbit controls.
 * Returns the handles the rest of the app needs.
 */
export function createScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1b2733);

  // Orbit pivot stays on the robot's vertical axis (the base). The robot is
  // visually centered in the open area left of the floating panels via a
  // horizontal lens shift (camera.setViewOffset) computed in resize().
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  camera.position.set(4.5, 3.8, 5.5);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.target.set(0, 1.2, 0);
  controls.maxPolarAngle = Math.PI / 2 - 0.02; // don't go under the floor
  controls.minDistance = 2;
  controls.maxDistance = 25;

  // --- Lighting --------------------------------------------------------
  const hemi = new THREE.HemisphereLight(0xbcd4ff, 0x32281e, 0.7);
  scene.add(hemi);

  const key = new THREE.DirectionalLight(0xffffff, 1.6);
  key.position.set(6, 10, 6);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  const s = 8;
  key.shadow.camera.left = -s;
  key.shadow.camera.right = s;
  key.shadow.camera.top = s;
  key.shadow.camera.bottom = -s;
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 30;
  key.shadow.bias = -0.0004;
  scene.add(key);

  const fill = new THREE.DirectionalLight(0xa0c4ff, 0.4);
  fill.position.set(-5, 4, -3);
  scene.add(fill);

  // --- Ground / work surface ------------------------------------------
  const groundSize = 16;
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(groundSize, groundSize),
    new THREE.MeshStandardMaterial({ color: 0x2e3b47, roughness: 0.95, metalness: 0 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const grid = new THREE.GridHelper(groundSize, groundSize, 0x547089, 0x3a4b5a);
  grid.position.y = 0.001;
  scene.add(grid);

  // Subtle origin axes for orientation while learning.
  const axes = new THREE.AxesHelper(0.8);
  axes.position.y = 0.002;
  scene.add(axes);

  function resize() {
    const parent = canvas.parentElement;
    const w = parent.clientWidth;
    const h = parent.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;

    // Horizontal lens shift: center the orbit target (robot base) within the
    // open area between the window's left edge and the left edge of the
    // right-hand control column (the main panel). setViewOffset with
    // width == fullWidth keeps the zoom unchanged and only skews the frustum
    // sideways, so the robot shifts left without distortion.
    const panel = document.getElementById('panel');
    const panelLeft = panel ? panel.getBoundingClientRect().left : w;
    if (w > 760 && panelLeft > 0 && panelLeft < w) {
      const offsetX = (w - panelLeft) / 2; // push content left by half the panel band
      camera.setViewOffset(w, h, offsetX, 0, w, h);
    } else {
      camera.clearViewOffset();
    }
    camera.updateProjectionMatrix();
  }
  resize();
  window.addEventListener('resize', resize);

  return { renderer, scene, camera, controls, ground, resize };
}
