import * as THREE from 'three';
import { reducedMotion } from './loop.js';

// Where the camera goes for a step: closer to the parts in focus, and turned toward them.
// base is the page's own view { r, target: [x, y, z] }; center and radius are the sphere
// around the parts in focus. A step that focuses most of the appliance keeps the page's view.
// The camera never comes closer than 58% of the page's distance (or minR), so the reader
// still sees where the part sits in the appliance.
export function frameGoal({ base, center, radius, fov = 36, aspect = 1.5, minR = 0 }) {
  const half = THREE.MathUtils.degToRad(fov) / 2;
  const limit = Math.min(half, Math.atan(Math.tan(half) * aspect)); // the tighter of the two half-angles
  const near = Math.min(base.r, Math.max(minR, base.r * 0.58));
  const r = Math.min(base.r, Math.max(near, (radius / Math.sin(limit)) * 1.9));
  const zoomed = base.r > near ? (base.r - r) / (base.r - near) : 0;
  const pull = Math.min(0.75, zoomed * 1.5);
  return { r, target: base.target.map((b, i) => b + (center[i] - b) * pull) };
}

// Moves the camera to the parts in focus when the step changes. Pages without their own
// camera views per step use this. The angle stays the reader's; a drag, a pinch or the
// wheel ends the move at once, so it never fights the reader.
export function createFraming(stage, { parts, state }) {
  if (stage.capture) return null; // thumbnails keep the page's own view
  const { cam } = stage, canvas = stage.renderer.domElement;
  const base = { r: cam.r, target: cam.target.toArray() };
  const box = new THREE.Box3(), part = new THREE.Box3(), sphere = new THREE.Sphere();
  const a = new THREE.Vector3(), b = new THREE.Vector3(), to = new THREE.Vector3();
  let goal = null, shown = -1, reset = state.viewReset ?? 0, last = 0;
  const stop = () => { goal = null; };
  canvas.addEventListener('pointerdown', stop);
  canvas.addEventListener('wheel', stop, { passive: true });

  function aim() {
    box.makeEmpty();
    for (const name of state.focus ?? []) {
      const p = parts[name]; if (!p) continue;
      p.group.updateWorldMatrix(true, true);
      part.setFromObject(p.group);
      if (part.isEmpty()) continue;
      // The part may still be on its way: frame where it will rest at this step's explode amount.
      const parent = p.group.parent;
      parent.localToWorld(a.copy(p.home).addScaledVector(p.offset, state.targetExplode));
      parent.localToWorld(b.copy(p.group.position));
      box.union(part.translate(a.sub(b)));
    }
    if (box.isEmpty()) return { r: base.r, target: base.target };
    box.getBoundingSphere(sphere);
    const [minR] = stage.zoom ?? [0];
    return frameGoal({ base, center: sphere.center.toArray(), radius: sphere.radius, fov: stage.camera.fov, aspect: stage.camera.aspect, minR });
  }

  stage.beforeRender(() => {
    const now = performance.now(), dt = last ? Math.min(0.05, (now - last) / 1000) : 0; last = now;
    if (stage.intro.t < 1) return;
    if (state.step !== shown || (state.viewReset ?? 0) !== reset) { shown = state.step; reset = state.viewReset ?? 0; goal = aim(); }
    if (!goal) return;
    const k = reducedMotion ? 1 : Math.min(1, dt * 2.5);
    cam.r += (goal.r - cam.r) * k;
    cam.target.lerp(to.fromArray(goal.target), k);
    if (Math.abs(goal.r - cam.r) < 0.02 && cam.target.distanceTo(to) < 0.01) goal = null;
  });
  return { aim };
}
