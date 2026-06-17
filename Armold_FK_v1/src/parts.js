import * as THREE from 'three';

/**
 * Pickable parts + target drop zones on the planar work surface.
 *
 * Gripping is *kinematic*: when the gripper closes within reach of a part,
 * the part is re-parented onto the robot's tool tip (preserving its world
 * transform via Object3D.attach) so it rides along with the arm. On release
 * it is re-parented back to the scene and dropped onto the ground.
 */

const PART_SIZE = 0.22;
const GRAB_RADIUS = 0.32;     // how close the tip must be to grab
const CLOSE_THRESHOLD = 0.6;  // gripper value above which we consider it "closing"
const OPEN_THRESHOLD = 0.4;   // gripper value below which we consider it "opening"

const PART_COLORS = [0xe53935, 0x1e88e5, 0x43a047, 0xfdd835, 0x8e24aa, 0xfb8c00];

export class PartsManager {
  constructor(scene, robot) {
    this.scene = scene;
    this.robot = robot;
    this.parts = [];
    this.zones = [];
    this.held = null;            // currently grasped part
    this._tip = new THREE.Vector3();
    this._partPos = new THREE.Vector3();
  }

  addPart(x, z, colorIndex = 0) {
    const mat = new THREE.MeshStandardMaterial({
      color: PART_COLORS[colorIndex % PART_COLORS.length],
      roughness: 0.4,
      metalness: 0.1,
    });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(PART_SIZE, PART_SIZE, PART_SIZE), mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.position.set(x, PART_SIZE / 2, z);
    mesh.userData.isPart = true;
    mesh.userData.restY = PART_SIZE / 2;
    this.scene.add(mesh);
    this.parts.push(mesh);
    return mesh;
  }

  addZone(x, z, colorIndex = 0) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(PART_SIZE * 0.7, PART_SIZE * 1.1, 32),
      new THREE.MeshBasicMaterial({
        color: PART_COLORS[colorIndex % PART_COLORS.length],
        transparent: true,
        opacity: 0.55,
        side: THREE.DoubleSide,
      })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, 0.01, z);
    this.scene.add(ring);
    this.zones.push(ring);
    return ring;
  }

  /** Build a default demonstration layout. */
  defaultLayout() {
    this.addPart(2.2, 0.6, 0);
    this.addPart(2.4, -0.9, 1);
    this.addPart(1.6, 1.6, 2);

    this.addZone(-2.2, 0.8, 0);
    this.addZone(-2.4, -0.9, 1);
    this.addZone(-1.6, 1.6, 2);
  }

  /**
   * Called every frame. Decides whether to grab or release based on the
   * gripper value and the tool-tip proximity to parts.
   */
  update() {
    const g = this.robot.gripper;
    this.robot.getTipWorld(this._tip);

    if (!this.held && g > CLOSE_THRESHOLD) {
      // Try to grab the nearest in-range part.
      let nearest = null;
      let nearestDist = GRAB_RADIUS;
      for (const part of this.parts) {
        part.getWorldPosition(this._partPos);
        const d = this._partPos.distanceTo(this._tip);
        if (d < nearestDist) {
          nearest = part;
          nearestDist = d;
        }
      }
      if (nearest) this._grab(nearest);
    } else if (this.held && g < OPEN_THRESHOLD) {
      this._release();
    }
  }

  _grab(part) {
    this.robot.toolTip.attach(part); // preserves world transform
    this.held = part;
  }

  _release() {
    const part = this.held;
    this.scene.attach(part); // back to world space, keeps world transform
    // Drop straight down onto the surface.
    part.position.y = part.userData.restY;
    part.rotation.set(0, part.rotation.y, 0);
    this.held = null;
  }

  /** Reset every part to its spawn position and drop anything held. */
  reset(layout) {
    for (const p of this.parts) {
      if (p.parent !== this.scene) this.scene.attach(p);
    }
    this.held = null;
    // Re-place from stored spawn data if provided.
    if (layout) {
      layout.forEach((l, i) => {
        const p = this.parts[i];
        if (p) {
          p.position.set(l.x, p.userData.restY, l.z);
          p.rotation.set(0, 0, 0);
        }
      });
    }
  }

  /** Capture current spawn layout for reset. */
  snapshot() {
    return this.parts.map((p) => ({ x: p.position.x, z: p.position.z }));
  }
}
