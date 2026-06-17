import * as THREE from 'three';

/**
 * Forward-kinematics articulated arm.
 *
 * The arm is a nested chain of THREE.Group "joint" nodes. Each joint rotates
 * about a single local axis; the links hang off the joints as child meshes.
 * Because Three.js composes parent transforms automatically, simply setting
 * each joint's rotation IS forward kinematics — the world pose of every link
 * (and the tool tip) falls out of the scene-graph traversal for free.
 *
 * Joint order (base -> tool):
 *   0  base    yaw    (Y)
 *   1  shoulder pitch (X)
 *   2  elbow    pitch (X)
 *   3  wrist    pitch (X)
 *   4  wrist    yaw   (Z)
 *   5  wrist    roll  (Y)  -- spins the gripper about the tool axis
 */

const DEG = Math.PI / 180;

// Joint definitions. Limits are in degrees (UI works in degrees, math in rad).
export const JOINTS = [
  { name: 'Base',        axis: 'y', min: -180, max: 180, home: 0 },
  { name: 'Shoulder',    axis: 'x', min:  -90, max:  90, home: -30 },
  { name: 'Elbow',       axis: 'x', min: -150, max: 150, home: 70 },
  { name: 'Wrist Pitch', axis: 'x', min: -120, max: 120, home: 50 },
  { name: 'Wrist Yaw',   axis: 'z', min:  -90, max:  90, home: 0 },
  { name: 'Wrist Roll',  axis: 'y', min: -180, max: 180, home: 0 },
];

// Link geometry (world units ~ meters).
const DIMS = {
  baseRadius: 0.45,
  baseHeight: 0.35,
  shoulderHeight: 0.55, // height of shoulder pivot above base top
  upperArm: 1.5,        // shoulder -> elbow
  foreArm: 1.25,        // elbow -> wrist
  wristLen: 0.35,       // wrist pitch -> tool flange
  toolLen: 0.45,        // flange -> tip (incl. gripper jaw reach)
};

const MATERIALS = {
  base:   () => new THREE.MeshStandardMaterial({ color: 0x37474f, roughness: 0.7, metalness: 0.3 }),
  link:   () => new THREE.MeshStandardMaterial({ color: 0xff9800, roughness: 0.5, metalness: 0.2 }),
  joint:  () => new THREE.MeshStandardMaterial({ color: 0x263238, roughness: 0.6, metalness: 0.4 }),
  gripper:() => new THREE.MeshStandardMaterial({ color: 0x90a4ae, roughness: 0.4, metalness: 0.6 }),
};

function jointBarrel(radius = 0.22, length = 0.34, axis = 'x') {
  // A short cylinder representing the motor housing at a joint, oriented
  // so its circular faces look down the rotation axis.
  const geo = new THREE.CylinderGeometry(radius, radius, length, 24);
  const mesh = new THREE.Mesh(geo, MATERIALS.joint());
  if (axis === 'x') mesh.rotation.z = Math.PI / 2;
  if (axis === 'z') mesh.rotation.x = Math.PI / 2;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function armSegment(length, thickness = 0.18) {
  // A link that runs from local origin up along +Y by `length`.
  const geo = new THREE.BoxGeometry(thickness, length, thickness);
  const mesh = new THREE.Mesh(geo, MATERIALS.link());
  mesh.position.y = length / 2;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export class RobotArm {
  constructor() {
    this.root = new THREE.Group();
    this.root.name = 'robot';

    this.joints = [];   // THREE.Group per joint, in order
    this.angles = JOINTS.map((j) => j.home * DEG); // radians
    this.gripper = 0;   // 0 = open, 1 = closed
    this._fingers = [];

    this._build();
    this.applyAngles();
    this.setGripper(0);
  }

  _build() {
    // --- Fixed pedestal -------------------------------------------------
    const pedestal = new THREE.Mesh(
      new THREE.CylinderGeometry(DIMS.baseRadius, DIMS.baseRadius * 1.15, DIMS.baseHeight, 32),
      MATERIALS.base()
    );
    pedestal.position.y = DIMS.baseHeight / 2;
    pedestal.castShadow = true;
    pedestal.receiveShadow = true;
    this.root.add(pedestal);

    // --- Joint 0: base yaw ---------------------------------------------
    const j0 = new THREE.Group();
    j0.position.y = DIMS.baseHeight;
    j0.add(jointBarrel(0.3, 0.3, 'y'));
    this.root.add(j0);
    this.joints.push(j0);

    // Riser up to the shoulder pivot.
    const riser = armSegment(DIMS.shoulderHeight, 0.34);
    j0.add(riser);

    // --- Joint 1: shoulder pitch ---------------------------------------
    const j1 = new THREE.Group();
    j1.position.y = DIMS.shoulderHeight;
    j1.add(jointBarrel(0.24, 0.4, 'x'));
    j0.add(j1);
    this.joints.push(j1);

    const upper = armSegment(DIMS.upperArm);
    j1.add(upper);

    // --- Joint 2: elbow pitch ------------------------------------------
    const j2 = new THREE.Group();
    j2.position.y = DIMS.upperArm;
    j2.add(jointBarrel(0.2, 0.34, 'x'));
    j1.add(j2);
    this.joints.push(j2);

    const fore = armSegment(DIMS.foreArm, 0.15);
    j2.add(fore);

    // --- Joint 3: wrist pitch ------------------------------------------
    const j3 = new THREE.Group();
    j3.position.y = DIMS.foreArm;
    j3.add(jointBarrel(0.16, 0.28, 'x'));
    j2.add(j3);
    this.joints.push(j3);

    const wrist = armSegment(DIMS.wristLen, 0.13);
    j3.add(wrist);

    // --- Joint 4: wrist yaw --------------------------------------------
    const j4 = new THREE.Group();
    j4.position.y = DIMS.wristLen;
    j4.add(jointBarrel(0.13, 0.22, 'z'));
    j3.add(j4);
    this.joints.push(j4);

    // --- Joint 5: wrist roll (tool axis) -------------------------------
    const j5 = new THREE.Group();
    j5.add(jointBarrel(0.12, 0.18, 'y'));
    j4.add(j5);
    this.joints.push(j5);

    // --- Gripper assembly ----------------------------------------------
    const flange = new THREE.Mesh(
      new THREE.BoxGeometry(0.34, 0.12, 0.22),
      MATERIALS.gripper()
    );
    flange.position.y = 0.12;
    flange.castShadow = true;
    j5.add(flange);

    // Two fingers that slide apart/together along local X.
    const fingerGeo = new THREE.BoxGeometry(0.06, DIMS.toolLen, 0.18);
    for (const sign of [-1, 1]) {
      const finger = new THREE.Mesh(fingerGeo, MATERIALS.gripper());
      finger.position.set(sign * 0.12, 0.12 + DIMS.toolLen / 2, 0);
      finger.castShadow = true;
      finger.userData.sign = sign;
      j5.add(finger);
      this._fingers.push(finger);
    }

    // Tool tip: an empty at the grasp center, used for pick/place attach.
    this.toolTip = new THREE.Object3D();
    this.toolTip.position.set(0, 0.12 + DIMS.toolLen, 0);
    j5.add(this.toolTip);
  }

  /** Set all joint angles from a radians array, respecting nothing (caller clamps). */
  setAngles(radArray) {
    for (let i = 0; i < this.joints.length; i++) {
      if (radArray[i] !== undefined) this.angles[i] = radArray[i];
    }
    this.applyAngles();
  }

  /** Set a single joint by index, value in radians. */
  setAngle(i, rad) {
    this.angles[i] = rad;
    this._applyOne(i);
  }

  _applyOne(i) {
    const joint = this.joints[i];
    const axis = JOINTS[i].axis;
    joint.rotation[axis] = this.angles[i];
  }

  applyAngles() {
    for (let i = 0; i < this.joints.length; i++) this._applyOne(i);
  }

  /** Gripper 0 (open) .. 1 (closed). */
  setGripper(value) {
    this.gripper = THREE.MathUtils.clamp(value, 0, 1);
    const openX = 0.22, closedX = 0.085;
    const x = THREE.MathUtils.lerp(openX, closedX, this.gripper);
    for (const finger of this._fingers) finger.position.x = finger.userData.sign * x;
  }

  /** Convenience: current angles in degrees. */
  getAnglesDeg() {
    return this.angles.map((r) => r / DEG);
  }

  /** World-space position of the tool tip. */
  getTipWorld(target = new THREE.Vector3()) {
    this.toolTip.getWorldPosition(target);
    return target;
  }

  /** Home pose. */
  home() {
    this.setAngles(JOINTS.map((j) => j.home * DEG));
    this.setGripper(0);
  }
}

export { DEG, DIMS };
