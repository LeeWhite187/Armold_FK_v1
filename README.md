# Armold — Robot Arm Simulator

A browser-based 3D simulation of a 6-DOF articulated robot arm. It uses
**forward kinematics** for motion (you set joint angles; the tool pose follows
from the joint chain), and a **step-sequence** motion planner to pick up and
release parts on a planar work surface.

Built to run entirely **client-side** in a locked-down Chromebook browser:
the production build is self-contained static files (HTML/JS/CSS) with
Three.js bundled in — **no CDN, no backend, no runtime network calls**.

## Quick start (development)

```bash
npm install
npm run dev      # http://localhost:5173
```

## Build & deploy

```bash
npm run build    # outputs static files to dist/
npm run preview  # serve the production build locally to check it
```

Upload the entire contents of `dist/` to your hosting service. Because the
build uses a **relative base path**, it works from any folder — e.g.
`https://your-host/sims/armold/` — with no configuration. Students' browsers
just download the page and bundle; everything runs locally on the device.

## Using the simulator

**Jog joints** — drag the sliders to pose the arm live (forward kinematics).
The gripper slider opens/closes the jaws. *Home Pose* returns to the default.

**Program (step sequence)** — a motion plan is an ordered list of steps. Each
step is a target pose: joint angles + gripper state + a move duration + a dwell
time. The arm smoothly interpolates from its current pose to each step's pose.

- **+ Add (capture pose)** — adds a step using the arm's current joint angles
  and gripper state. This is the main authoring workflow: jog the arm where you
  want it, then capture.
- **Update** — overwrite the selected step with the current pose.
- **Preview Pose** — snap the arm to the selected step (without playing).
- **↑ / ↓ / Delete** — reorder or remove steps.
- The editor below the list tweaks a step's name, duration, dwell, and whether
  the gripper closes.

**Playback** — *Play* runs the whole program, *Step* runs one step then pauses,
*Pause* / *Stop* control the run, *Loop* repeats. *Reset Scene* returns the arm
home and the parts to their start positions.

**File** — *Save/Load* use the browser's local storage. *Export/Import JSON*
move a sequence to/from a file so it can be shared or version-controlled.

**Load Demo** loads a complete pick-and-place example that picks up the red
part and places it on the red target ring.

## How gripping works

Gripping is **kinematic**: when the gripper closes (slider > 0.6) within reach
of a part, the part attaches to the tool tip and rides along with the arm. When
the gripper opens (< 0.4) the part detaches and drops onto the surface. No
physics tuning required.

## Project layout

| File | Responsibility |
|------|----------------|
| `src/robot.js` | 6-DOF arm as a nested joint chain; forward kinematics |
| `src/scene.js` | Renderer, camera, lights, ground plane, orbit controls |
| `src/parts.js` | Pickable parts, drop zones, kinematic attach/detach |
| `src/sequencer.js` | Step model, pose interpolation, playback state machine |
| `src/ui.js` | Control panel + the pick-and-place demo program |
| `src/main.js` | Wiring and the animation loop |

The arm's joints (base → tool): base yaw, shoulder pitch, elbow pitch, wrist
pitch, wrist yaw, wrist roll — plus the gripper.

> A debug handle is exposed at `window.__armold` (robot, parts, sequencer, etc.)
> for inspecting the sim from the browser console.
