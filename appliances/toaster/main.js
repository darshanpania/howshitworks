import * as THREE from 'three';
import { TOASTER_STORY } from './story.js';

const canvas = document.querySelector('#c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
const cam = { theta: 0.7, phi: 1.15, r: 10, target: new THREE.Vector3(0, 0, 0) };

scene.add(new THREE.HemisphereLight(0xffffff, 0x27313a, 1.1));
const key = new THREE.DirectionalLight(0xfff3df, 1.3); key.position.set(5, 7, 5); scene.add(key);
const rim = new THREE.DirectionalLight(0x8db4e5, 0.5); rim.position.set(-5, 3, -4); scene.add(rim);
const grid = new THREE.GridHelper(13, 13, 0x9aa5b1, 0x9aa5b1); grid.position.y = -2.65; grid.material.transparent = true; grid.material.opacity = 0.16; scene.add(grid);

const M = {
  steel: new THREE.MeshStandardMaterial({ color: 0xbac0c7, metalness: 0.72, roughness: 0.32 }),
  dark: new THREE.MeshStandardMaterial({ color: 0x303943, metalness: 0.4, roughness: 0.55 }),
  wire: new THREE.MeshStandardMaterial({ color: 0xc43a2d, metalness: 0.25, roughness: 0.42, emissive: 0x000000 }),
  mica: new THREE.MeshStandardMaterial({ color: 0xd9bf85, roughness: 0.8 }),
  bread: new THREE.MeshStandardMaterial({ color: 0xe4b874, roughness: 0.78 }),
  brass: new THREE.MeshStandardMaterial({ color: 0xd6a44a, metalness: 0.8, roughness: 0.25 }),
  spring: new THREE.MeshStandardMaterial({ color: 0xc6ccd2, metalness: 0.85, roughness: 0.25 }),
};

const parts = {};
const root = new THREE.Group(); scene.add(root);
function add(name, object, home, offset) {
  const group = new THREE.Group(); group.add(object); group.position.copy(home); root.add(group);
  const meshes = []; object.traverse(item => { if (item.isMesh) meshes.push(item); });
  parts[name] = { group, home: home.clone(), offset: offset.clone(), meshes };
  return group;
}
function box(size, mat, pos) { const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), mat); mesh.position.copy(pos); return mesh; }

// Steel shell and slots.
{
  const shell = new THREE.Group();
  shell.add(box([4.8, 2.5, 2.7], M.steel, new THREE.Vector3(0, 0, 0)));
  const darkFace = box([4.82, 2.1, 2.2], M.dark, new THREE.Vector3(0, 0.05, 1.36)); shell.add(darkFace);
  [-1.18, 1.18].forEach(x => {
    const slot = box([1.15, 0.17, 2.05], M.dark, new THREE.Vector3(x, 1.34, 0)); shell.add(slot);
  });
  add('shell', shell, new THREE.Vector3(0, -0.75, 0), new THREE.Vector3(0, 0.2, -1.6));
}
// Cord enters the rear and brings power in.
{
  const cord = new THREE.Group();
  const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 2.8, 12), M.dark); cable.rotation.z = Math.PI / 2; cable.position.set(-3.3, -0.8, -0.6); cord.add(cable);
  const plug = box([0.55, 0.45, 0.35], M.dark, new THREE.Vector3(-4.7, -0.8, -0.6)); cord.add(plug);
  add('cord', cord, new THREE.Vector3(), new THREE.Vector3(-1.2, -0.2, -0.8));
}
// Carriage carries bread down between elements.
const carriage = new THREE.Group();
{
  [-1.18, 1.18].forEach(x => {
    const cradle = box([1.12, 0.14, 1.9], M.brass, new THREE.Vector3(x, 0.28, 0)); carriage.add(cradle);
    const slice = box([0.95, 1.35, 0.22], M.bread, new THREE.Vector3(x, 1.0, 0));
    slice.rotation.z = x < 0 ? 0.05 : -0.04; carriage.add(slice);
  });
  carriage.add(box([3.35, 0.12, 0.2], M.brass, new THREE.Vector3(0, -0.02, -0.86)));
  add('carriage', carriage, new THREE.Vector3(0, 0.05, 0), new THREE.Vector3(0, 1.7, 0));
  parts.bread = parts.carriage;
}
// Zig-zag nichrome elements sit either side of each slice.
{
  const elements = new THREE.Group();
  [-1.78, -0.58, 0.58, 1.78].forEach(x => {
    const board = box([0.12, 1.65, 1.8], M.mica, new THREE.Vector3(x, 0.05, 0)); elements.add(board);
    for (let y = -0.55; y <= 0.62; y += 0.29) {
      const wire = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.036, 8, 14), M.wire);
      wire.userData.isHeatingWire = true;
      wire.rotation.y = Math.PI / 2; wire.position.set(x + (x < 0 ? 0.08 : -0.08), y, 0); elements.add(wire);
    }
  });
  add('elements', elements, new THREE.Vector3(0, -0.1, 0), new THREE.Vector3(0, -1.6, 0));
  parts.heat = parts.elements;
}
// Lever, latch and electromagnet.
{
  const lever = new THREE.Group();
  lever.add(box([0.15, 1.45, 0.15], M.dark, new THREE.Vector3(2.65, -0.55, 0.85)));
  lever.add(box([0.35, 0.28, 0.35], M.dark, new THREE.Vector3(2.65, -1.3, 0.85)));
  add('lever', lever, new THREE.Vector3(), new THREE.Vector3(1, -0.5, 0.6));
}
{
  const magnet = new THREE.Group();
  const coil = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.62, 20), M.wire); coil.rotation.z = Math.PI / 2; magnet.add(coil);
  magnet.add(box([0.78, 0.2, 0.25], M.dark, new THREE.Vector3(0, -0.38, 0)));
  add('magnet', magnet, new THREE.Vector3(0.85, -1.55, -0.65), new THREE.Vector3(1.4, -1, -1.1));
}
// Bimetal strip and compressed spring below the carriage.
{
  const thermostat = new THREE.Group();
  thermostat.add(box([0.16, 1.1, 0.12], M.brass, new THREE.Vector3(0, 0, 0)));
  thermostat.add(box([0.17, 0.92, 0.08], M.steel, new THREE.Vector3(0.08, 0, 0.08)));
  add('thermostat', thermostat, new THREE.Vector3(-1.35, -1.55, -0.65), new THREE.Vector3(-1.5, -0.8, -1));
}
{
  const spring = new THREE.Mesh(new THREE.TorusKnotGeometry(0.28, 0.06, 40, 8, 2, 5), M.spring); spring.scale.y = 1.8;
  add('spring', spring, new THREE.Vector3(0, -1.48, 0.6), new THREE.Vector3(0, -1.1, 1.3));
}

const state = { step: 0, explode: 0, targetExplode: 0, playing: true, browning: 3, toast: 0, focus: [], heat: false, down: false };
const ui = { play: document.querySelector('#play'), explode: document.querySelector('#explode'), browning: document.querySelector('#browning'), steps: document.querySelector('#steps'), prev: document.querySelector('#prev'), next: document.querySelector('#next') };

TOASTER_STORY.forEach((story, index) => {
  const button = document.createElement('button'); button.className = 'step'; button.id = `step-${index}`;
  button.innerHTML = `<span class="n">0${index + 1}</span><span><div class="t">${story.t}</div><div class="d">${story.d}</div><div class="part">${story.part}</div></span>`;
  button.addEventListener('click', () => setStep(index)); ui.steps.append(button);
});
function setStep(index) {
  state.step = (index + TOASTER_STORY.length) % TOASTER_STORY.length;
  const story = TOASTER_STORY[state.step]; state.targetExplode = story.explode; state.focus = story.focus; state.heat = story.heat; state.down = story.down;
  ui.explode.value = String(Math.round(story.explode * 100));
  document.querySelectorAll('.step').forEach((item, i) => item.classList.toggle('active', i === state.step));
  document.querySelector(`#step-${state.step}`).scrollIntoView({ block: 'nearest', behavior: 'smooth' }); applyFocus();
}
function applyFocus() {
  Object.entries(parts).forEach(([name, part]) => part.meshes.forEach(mesh => {
    if (!mesh.userData.material) mesh.userData.material = mesh.material.clone();
    const material = mesh.userData.material; mesh.material = material; material.transparent = true;
    const hot = state.focus.includes(name); material.opacity = state.focus.length && !hot ? 0.28 : 1; material.depthWrite = material.opacity > 0.9;
    if (mesh.userData.isHeatingWire) material.emissive = new THREE.Color(state.heat ? 0xff4d18 : 0x000000);
    material.emissiveIntensity = state.heat && hot ? 1.25 : hot ? 0.18 : 0;
  }));
}
ui.play.addEventListener('click', () => { state.playing = !state.playing; ui.play.textContent = state.playing ? 'Pause' : 'Play'; });
ui.explode.addEventListener('input', event => { state.targetExplode = event.target.value / 100; });
ui.browning.addEventListener('input', event => { state.browning = Number(event.target.value); });
ui.prev.addEventListener('click', () => setStep(state.step - 1)); ui.next.addEventListener('click', () => setStep(state.step + 1));
let drag;
canvas.addEventListener('pointerdown', event => { drag = { x: event.clientX, y: event.clientY }; canvas.setPointerCapture(event.pointerId); });
canvas.addEventListener('pointermove', event => { if (!drag) return; cam.theta -= (event.clientX - drag.x) * 0.006; cam.phi = THREE.MathUtils.clamp(cam.phi - (event.clientY - drag.y) * 0.006, 0.25, Math.PI - 0.25); drag = { x: event.clientX, y: event.clientY }; });
canvas.addEventListener('pointerup', () => { drag = null; });
canvas.addEventListener('pointercancel', () => { drag = null; });
canvas.addEventListener('wheel', event => { event.preventDefault(); cam.r = THREE.MathUtils.clamp(cam.r + event.deltaY * 0.01, 5.5, 15); }, { passive: false });
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches; let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  const width = canvas.clientWidth, height = canvas.clientHeight; if (canvas.width !== width * renderer.getPixelRatio() || canvas.height !== height * renderer.getPixelRatio()) { renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix(); }
  state.explode += (state.targetExplode - state.explode) * (reduced ? 1 : 0.09);
  Object.entries(parts).forEach(([name, part]) => { const carriageLift = name === 'carriage' || name === 'bread' ? (state.down ? -1.25 : 0.35) : 0; part.group.position.copy(part.home).addScaledVector(part.offset, state.explode); part.group.position.y += carriageLift; });
  if (state.playing) state.toast += dt * (state.heat ? 0.24 + state.browning * 0.035 : -0.08); state.toast = THREE.MathUtils.clamp(state.toast, 0, 1);
  const breadColor = new THREE.Color(0xe4b874).lerp(new THREE.Color(0x754023), state.toast); parts.bread.meshes.filter(mesh => mesh.material.color).forEach(mesh => mesh.material.color.copy(breadColor));
  camera.position.set(cam.target.x + cam.r * Math.sin(cam.phi) * Math.sin(cam.theta), cam.target.y + cam.r * Math.cos(cam.phi), cam.target.z + cam.r * Math.sin(cam.phi) * Math.cos(cam.theta)); camera.lookAt(cam.target); renderer.render(scene, camera); requestAnimationFrame(frame);
}
setStep(0); requestAnimationFrame(frame);
