import * as THREE from 'three';
import { trackOnce } from '../analytics.js';
import { reducedMotion } from './loop.js';
import { studioEnvironment, gridFloor, contactShadow } from './studio.js';

export { addStudioLights } from './studio.js';

// Renderer, scene, camera, orbit controls and resize for one appliance canvas.
// pbr: true turns on linear colour, tone mapping, soft shadows and studio reflections.
export function createStage(canvas, {
  fov = 38, pbr = false,
  camera: view = {}, zoom = [5, 16], phiLimit = 0.2,
} = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 2));
  const scene = new THREE.Scene();
  if (pbr) {
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMappingExposure = 1.05;
    scene.environment = studioEnvironment(renderer);
  }
  const camera = new THREE.PerspectiveCamera(fov, 1, 0.1, 100);
  const cam = {
    theta: view.theta ?? 0.6, phi: view.phi ?? 1.2, r: view.r ?? 11,
    target: new THREE.Vector3(...(view.target ?? [0, 0, 0])),
  };
  attachOrbit(canvas, cam, { zoom, phiLimit });

  // Intro: the camera swings in from further out while the parts come together.
  // Any touch or drag ends it at once, so it never fights the reader.
  // ?capture skips the intro and exposes the camera, for rendering the landing-page thumbnails.
  const capture = /[?&]capture\b/.test(globalThis.location?.search ?? '');
  if (capture) Object.assign(globalThis, { __hswCam: cam, __hswScene: scene });
  const intro = { t: reducedMotion || capture ? 1 : 0, start: performance.now() };
  canvas.addEventListener('pointerdown', () => { intro.t = 1; });
  const easeOut = t => 1 - (1 - t) ** 3;

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight, pr = renderer.getPixelRatio();
    // setSize() floors to whole pixels, so compare against the floored size.
    if (canvas.width !== Math.floor(w * pr) || canvas.height !== Math.floor(h * pr)) {
      renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
    }
  }
  // Hooks: extra passes before the frame (contact shadows) and overlays after it (callouts).
  const before = [], after = [];
  function render() {
    if (intro.t < 1) intro.t = Math.min(1, (performance.now() - intro.start) / 2200);
    const away = 1 - easeOut(intro.t);
    const r = cam.r * (1 + 0.45 * away), theta = cam.theta - 1.1 * away, phi = cam.phi - 0.25 * away;
    camera.position.set(
      cam.target.x + r * Math.sin(phi) * Math.sin(theta),
      cam.target.y + r * Math.cos(phi),
      cam.target.z + r * Math.sin(phi) * Math.cos(theta));
    camera.lookAt(cam.target);
    scene.updateMatrixWorld();
    before.forEach(fn => fn());
    renderer.render(scene, camera);
    after.forEach(fn => fn());
  }
  return {
    renderer, scene, camera, cam, resize, render, pbr, intro, capture,
    beforeRender: fn => before.push(fn), afterRender: fn => after.push(fn),
  };
}

// One-finger or mouse drag orbits; two-finger pinch or the wheel zooms.
export function attachOrbit(canvas, cam, { zoom: [minR, maxR] = [5, 16], phiLimit = 0.2 } = {}) {
  const pointers = new Map();
  let pinch = null;
  const clampR = r => Math.max(minR, Math.min(maxR, r));
  const spread = () => { const [a, b] = [...pointers.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
  canvas.style.touchAction = 'none';
  canvas.addEventListener('pointerdown', e => {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    canvas.setPointerCapture(e.pointerId);
    pinch = pointers.size === 2 ? { d: spread(), r: cam.r } : null;
  });
  canvas.addEventListener('pointermove', e => {
    const last = pointers.get(e.pointerId);
    if (!last) return;
    const now = { x: e.clientX, y: e.clientY };
    pointers.set(e.pointerId, now);
    if (pinch && pointers.size === 2) { cam.r = clampR(pinch.r * pinch.d / Math.max(1, spread())); trackOnce('model_zoomed', { input: 'pinch' }); return; }
    trackOnce('model_orbited', { input: e.pointerType });
    cam.theta -= (now.x - last.x) * 0.006;
    cam.phi = Math.max(phiLimit, Math.min(Math.PI - phiLimit, cam.phi - (now.y - last.y) * 0.006));
  });
  const end = e => { pointers.delete(e.pointerId); if (pointers.size < 2) pinch = null; };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('wheel', e => { e.preventDefault(); cam.r = clampR(cam.r + e.deltaY * 0.01); trackOnce('model_zoomed', { input: 'wheel' }); }, { passive: false });
}

// The studio floor: a grid that fades into the backdrop and a soft contact shadow.
// With shadow (on by default on PBR stages) a faint catcher also takes the key light's cast shadow.
// size is the grid's width, cell its spacing; center shifts both in x and z.
export function addFloor(stage, y, {
  size = 14, cell = 1, opacity = 0.18, center = [0, 0], shadow = stage.pbr,
  contact = true, shadowSize = size * 0.75, height = size * 0.5, blur = 3, darkness = 1.25,
} = {}) {
  const floor = new THREE.Group(); floor.position.y = y; stage.scene.add(floor);
  floor.add(gridFloor(size, { cell, opacity, center }));
  if (shadow) {
    const catcher = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.ShadowMaterial({ opacity: 0.07 }));
    catcher.rotation.x = -Math.PI / 2; catcher.position.set(center[0], 0.001, center[1]); catcher.receiveShadow = true;
    catcher.userData.noContactShadow = true;
    floor.add(catcher);
  }
  if (contact) contactShadow(stage, floor, { size: shadowSize, height, blur, darkness, center });
  return floor;
}
