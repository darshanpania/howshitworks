import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { trackOnce } from '../analytics.js';

// Renderer, scene, camera, orbit controls and resize for one appliance canvas.
// pbr: true turns on linear colour, tone mapping, soft shadows and room reflections.
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
    scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
  }
  const camera = new THREE.PerspectiveCamera(fov, 1, 0.1, 100);
  const cam = {
    theta: view.theta ?? 0.6, phi: view.phi ?? 1.2, r: view.r ?? 11,
    target: new THREE.Vector3(...(view.target ?? [0, 0, 0])),
  };
  attachOrbit(canvas, cam, { zoom, phiLimit });

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight, pr = renderer.getPixelRatio();
    // setSize() floors to whole pixels, so compare against the floored size.
    if (canvas.width !== Math.floor(w * pr) || canvas.height !== Math.floor(h * pr)) {
      renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
    }
  }
  function render() {
    camera.position.set(
      cam.target.x + cam.r * Math.sin(cam.phi) * Math.sin(cam.theta),
      cam.target.y + cam.r * Math.cos(cam.phi),
      cam.target.z + cam.r * Math.sin(cam.phi) * Math.cos(cam.theta));
    camera.lookAt(cam.target);
    renderer.render(scene, camera);
  }
  return { renderer, scene, camera, cam, resize, render, pbr };
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

// Faint floor grid, plus a shadow catcher when the stage renders shadows.
export function addFloor(stage, y, { size = 14, opacity = 0.18, shadow = stage.pbr } = {}) {
  const grid = new THREE.GridHelper(size, size, 0x9aa5b1, 0x9aa5b1);
  grid.position.y = y; grid.material.transparent = true; grid.material.opacity = opacity;
  stage.scene.add(grid);
  if (shadow) {
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.ShadowMaterial({ opacity: 0.16 }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = y + 0.001; floor.receiveShadow = true;
    stage.scene.add(floor);
  }
  return grid;
}
