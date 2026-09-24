import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { TOASTER_STORY } from './story.js';
import { partOpacity } from './visual-state.js';
import { TOASTER_LAYOUT } from './layout.js';

// ---------- Renderer, camera, light ----------
const canvas = document.querySelector('#c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
const cam = { theta: 0.75, phi: 1.12, r: 11.5, target: new THREE.Vector3(0, -0.35, 0) };

scene.add(new THREE.HemisphereLight(0xffffff, 0x27313a, 0.45));
const key = new THREE.DirectionalLight(0xfff3df, 1.6); key.position.set(5, 8, 5);
key.castShadow = true; key.shadow.mapSize.set(1024, 1024); key.shadow.radius = 4; key.shadow.bias = -0.0005;
Object.assign(key.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 1, far: 25 });
scene.add(key);
const rim = new THREE.DirectionalLight(0x8db4e5, 0.6); rim.position.set(-5, 3, -4); scene.add(rim);

const FLOOR_Y = -2.2;
const grid = new THREE.GridHelper(13, 13, 0x9aa5b1, 0x9aa5b1); grid.position.y = FLOOR_Y; grid.material.transparent = true; grid.material.opacity = 0.16; scene.add(grid);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), new THREE.ShadowMaterial({ opacity: 0.16 }));
floor.rotation.x = -Math.PI / 2; floor.position.y = FLOOR_Y + 0.001; floor.receiveShadow = true; scene.add(floor);

// ---------- Materials ----------
// A soft, speckled crumb texture so the bread reads as bread, not as a yellow box.
function crumbTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 420; i++) {
    const shade = 200 + Math.random() * 45 | 0; g.fillStyle = `rgb(${shade},${shade},${shade})`;
    g.beginPath(); g.ellipse(Math.random() * 128, Math.random() * 128, 1 + Math.random() * 2.5, 0.8 + Math.random() * 1.6, Math.random() * 3, 0, Math.PI * 2); g.fill();
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(0.9, 0.9); return t;
}
function softDot() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'); const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c);
}

const M = {
  steel: new THREE.MeshStandardMaterial({ color: 0xd4d9de, metalness: 0.9, roughness: 0.22 }),
  plastic: new THREE.MeshStandardMaterial({ color: 0x252c33, metalness: 0.1, roughness: 0.55 }),
  dark: new THREE.MeshStandardMaterial({ color: 0x14181c, metalness: 0.2, roughness: 0.7 }),
  wire: new THREE.MeshStandardMaterial({ color: 0x6a5a50, metalness: 0.6, roughness: 0.4, emissive: 0x000000 }),
  mica: new THREE.MeshStandardMaterial({ color: 0xd9bf85, metalness: 0.1, roughness: 0.55 }),
  crumb: new THREE.MeshStandardMaterial({ color: 0xf1d9a6, roughness: 0.9, map: crumbTexture() }),
  crust: new THREE.MeshStandardMaterial({ color: 0xc98a4a, roughness: 0.8 }),
  brass: new THREE.MeshStandardMaterial({ color: 0xd6a44a, metalness: 0.85, roughness: 0.3 }),
  copper: new THREE.MeshStandardMaterial({ color: 0xc4703a, metalness: 0.85, roughness: 0.3 }),
  iron: new THREE.MeshStandardMaterial({ color: 0x4a525b, metalness: 0.6, roughness: 0.5 }),
  spring: new THREE.MeshStandardMaterial({ color: 0xc6ccd2, metalness: 0.9, roughness: 0.2 }),
  cable: new THREE.MeshStandardMaterial({ color: 0xf2f2ee, roughness: 0.6 }),
};
// Hex colours are sRGB; the renderer works in linear light with an sRGB output.
const linear = hex => new THREE.Color(hex).convertSRGBToLinear();
Object.values(M).forEach(material => material.color.convertSRGBToLinear());

// ---------- Parts ----------
const parts = {};
const root = new THREE.Group(); scene.add(root);
function add(name, object, home, offset) {
  const group = new THREE.Group(); group.add(object); group.position.copy(home); root.add(group);
  const meshes = []; object.traverse(item => { if (item.isMesh) { meshes.push(item); item.castShadow = !item.userData.noShadow; item.receiveShadow = !item.userData.noShadow; } });
  parts[name] = { group, home: home.clone(), offset: offset.clone(), meshes };
  return group;
}
function box(size, mat, pos, radius = 0) {
  const geo = radius > 0 ? new RoundedBoxGeometry(...size, 3, radius) : new THREE.BoxGeometry(...size);
  const mesh = new THREE.Mesh(geo, mat); mesh.position.copy(pos); return mesh;
}
function roundedRect(w, h, r, cx = 0, cy = 0, path = new THREE.Shape()) {
  const x = cx - w / 2, y = cy - h / 2;
  path.moveTo(x + r, y); path.lineTo(x + w - r, y); path.quadraticCurveTo(x + w, y, x + w, y + r);
  path.lineTo(x + w, y + h - r); path.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  path.lineTo(x + r, y + h); path.quadraticCurveTo(x, y + h, x, y + h - r);
  path.lineTo(x, y + r); path.quadraticCurveTo(x, y, x + r, y); return path;
}
// Extrude a shape drawn in the XZ plane (shape y = world -z) upward along +Y.
function extrudeUp(shape, height, mat, y, bevel = 0) {
  const geo = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 3, curveSegments: 12 });
  geo.rotateX(-Math.PI / 2); geo.translate(0, y, 0);
  return new THREE.Mesh(geo, mat);
}

const BODY = { w: 5.0, d: 2.9, r: 0.55, bottom: -1.95, top: 0.4 };
const HEAT_Y = -0.62;               // centre of the heating elements and of the lowered bread
const LIFT = 1.47;                  // carriage travel from "down" to "up"
const [breadW, breadH, breadT] = TOASTER_LAYOUT.breadSize;

let knob;
// Steel shell: a rounded wall, a top plate with two slots, and a dark base.
{
  const shell = new THREE.Group();
  const wall = roundedRect(BODY.w, BODY.d, BODY.r);
  wall.holes.push(roundedRect(BODY.w - 0.12, BODY.d - 0.12, BODY.r - 0.06, 0, 0, new THREE.Path()));
  shell.add(extrudeUp(wall, BODY.top - BODY.bottom, M.steel, BODY.bottom));
  const top = roundedRect(BODY.w, BODY.d, BODY.r);
  TOASTER_LAYOUT.slotZ.forEach(z => top.holes.push(roundedRect(TOASTER_LAYOUT.slotSize[0], TOASTER_LAYOUT.slotSize[1], 0.2, 0, -z, new THREE.Path())));
  shell.add(extrudeUp(top, 0.04, M.steel, BODY.top, 0.04));
  shell.add(extrudeUp(roundedRect(BODY.w + 0.16, BODY.d + 0.16, BODY.r + 0.08), 0.16, M.plastic, BODY.bottom - 0.12, 0.03));
  [[-2, -1.1], [2, -1.1], [-2, 1.1], [2, 1.1]].forEach(([x, z]) => {
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.08, 16), M.dark); foot.position.set(x, FLOOR_Y + 0.04, z); shell.add(foot);
  });
  // Lever groove, browning knob and cancel button on the right end.
  shell.add(box([0.05, 1.75, 0.16], M.dark, new THREE.Vector3(BODY.w / 2 + 0.005, -0.7, 0.45), 0.02));
  knob = new THREE.Group(); knob.position.set(BODY.w / 2 + 0.02, -1.25, -0.55);
  const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.32, 0.18, 32), M.plastic); dial.rotation.z = Math.PI / 2; dial.position.x = 0.09; knob.add(dial);
  const mark = box([0.03, 0.2, 0.05], M.brass, new THREE.Vector3(0.19, 0.12, 0)); knob.add(mark);
  shell.add(knob);
  const cancel = box([0.12, 0.26, 0.4], M.plastic, new THREE.Vector3(BODY.w / 2 + 0.06, -0.45, -0.55), 0.05); shell.add(cancel);
  // Crumb tray handle on the left end.
  shell.add(box([0.1, 0.12, 1.4], M.plastic, new THREE.Vector3(-BODY.w / 2 - 0.05, -1.82, 0), 0.04));
  add('shell', shell, new THREE.Vector3(), new THREE.Vector3(0, 0.25, -1.9));
}

// Cord leaves the left end and ends in a three-pin plug.
{
  const cord = new THREE.Group();
  const path = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-2.5, -1.55, -0.8), new THREE.Vector3(-3.1, -1.75, -1.0),
    new THREE.Vector3(-3.6, -2.12, -0.3), new THREE.Vector3(-4.2, -2.12, 0.5), new THREE.Vector3(-4.75, -2.05, 0.9),
  ]);
  cord.add(new THREE.Mesh(new THREE.TubeGeometry(path, 64, 0.06, 10, false), M.cable));
  const plug = box([0.55, 0.38, 0.5], M.cable, new THREE.Vector3(-5.05, -1.98, 1.05), 0.08); plug.rotation.y = -0.5; cord.add(plug);
  [[0.13, 0.14], [0.13, -0.14], [-0.09, 0]].forEach(([dy, dz]) => {
    const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.3, 10), M.brass); pin.rotation.z = Math.PI / 2;
    pin.position.set(-0.4, dy, dz); plug.add(pin);
  });
  add('cord', cord, new THREE.Vector3(), new THREE.Vector3(-1.2, -0.1, -0.6));
}

// Bread slices: a crumb face with a darker crust edge.
const bread = new THREE.Group();
{
  const s = new THREE.Shape(), w = breadW / 2, h = breadH / 2, r = 0.14;
  s.moveTo(-w + r, -h); s.lineTo(w - r, -h); s.quadraticCurveTo(w, -h, w, -h + r);
  s.lineTo(w, h - 0.28); s.quadraticCurveTo(w + 0.02, h, w - 0.4, h); // domed top with rounded shoulders
  s.quadraticCurveTo(0, h + 0.14, -w + 0.4, h); s.quadraticCurveTo(-w - 0.02, h, -w, h - 0.28);
  s.lineTo(-w, -h + r); s.quadraticCurveTo(-w, -h, -w + r, -h);
  const bevel = 0.035;
  const geo = new THREE.ExtrudeGeometry(s, { depth: breadT - bevel * 2, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 2, curveSegments: 16 });
  geo.translate(0, 0, -(breadT - bevel * 2) / 2);
  TOASTER_LAYOUT.slotZ.forEach(z => {
    const slice = new THREE.Mesh(geo, [M.crumb, M.crust]); slice.position.set(0, 0, z);
    slice.rotation.z = z < 0 ? 0.012 : -0.012; bread.add(slice);
  });
  add('bread', bread, new THREE.Vector3(0, HEAT_Y, 0), new THREE.Vector3(0, 1.9, 0));
}

// Carriage: cradles under each slice, wire guards either side, and a frame out to the lever.
const carriage = new THREE.Group();
{
  const cradleY = -breadH / 2 - 0.05;
  TOASTER_LAYOUT.slotZ.forEach(z => {
    carriage.add(box([3.1, 0.06, 0.5], M.brass, new THREE.Vector3(0, cradleY, z), 0.02));
    [-0.19, 0.19].forEach(dz => {
      for (let x = -1.2; x <= 1.21; x += 0.6) {
        const guard = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 1.25, 6), M.spring);
        guard.position.set(x, cradleY + 0.62, z + dz); guard.userData.noShadow = true; carriage.add(guard);
      }
    });
  });
  carriage.add(box([0.08, 1.0, 1.7], M.brass, new THREE.Vector3(1.7, cradleY + 0.45, 0), 0.02));
  carriage.add(box([0.75, 0.08, 0.14], M.brass, new THREE.Vector3(2.08, cradleY + 0.2, 0.45)));
  carriage.add(box([0.35, 0.05, 0.3], M.iron, new THREE.Vector3(2.0, cradleY - 0.02, -0.05))); // latch plate for the magnet
  add('carriage', carriage, new THREE.Vector3(0, HEAT_Y, 0), new THREE.Vector3(0, 1.9, 0));
}

// Mica cards with coiled nichrome strung across them, on both sides of each slice.
const heatingWires = [];
const irPlanes = [];
{
  const elements = new THREE.Group();
  const helix = new (class extends THREE.Curve {
    getPoint(t, target = new THREE.Vector3()) {
      const a = t * Math.PI * 2 * 52;
      return target.set(-1.55 + t * 3.1, Math.sin(a) * 0.055, Math.cos(a) * 0.055);
    }
  })();
  const coilGeo = new THREE.TubeGeometry(helix, 620, 0.014, 5, false);
  TOASTER_LAYOUT.elementZ.forEach(z => {
    const card = box([3.4, 1.6, 0.04], M.mica, new THREE.Vector3(0, 0, z)); card.userData.translucent = true; elements.add(card);
    const face = z + (z < 0 ? 0.09 : -0.09);
    TOASTER_LAYOUT.heatingY.forEach(y => {
      const coil = new THREE.Mesh(coilGeo, M.wire); coil.position.set(0, y, face);
      coil.userData.isHeatingWire = true; coil.userData.noShadow = true; elements.add(coil); heatingWires.push(coil);
    });
    [-1.62, 1.62].forEach(x => elements.add(box([0.06, 1.3, 0.05], M.brass, new THREE.Vector3(x, 0, face))));
  });
  add('elements', elements, new THREE.Vector3(0, HEAT_Y, 0), new THREE.Vector3(0, -1.5, 0));
  // Infrared glow between each element and the bread (not a focusable part).
  const irMat = new THREE.MeshBasicMaterial({ color: 0xff6a2a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  TOASTER_LAYOUT.elementZ.forEach((z, i) => {
    const slot = TOASTER_LAYOUT.slotZ[i < 2 ? 0 : 1];
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(3.1, 1.3), irMat); plane.position.set(0, 0, (z + slot) / 2);
    parts.elements.group.add(plane); irPlanes.push(plane);
  });
}
// Slot glow lights up the bread and the inside of the shell while heating.
const slotLights = TOASTER_LAYOUT.slotZ.map(z => {
  const light = new THREE.PointLight(0xff6a2a, 0, 4.5, 2); light.position.set(0, HEAT_Y, z); parts.elements.group.add(light); return light;
});

// Lever: a handle that rides the carriage down the groove.
{
  const lever = new THREE.Group();
  lever.add(box([0.5, 0.08, 0.1], M.steel, new THREE.Vector3(BODY.w / 2 + 0.05, 0, 0.45)));
  lever.add(box([0.42, 0.26, 0.5], M.plastic, new THREE.Vector3(BODY.w / 2 + 0.38, 0, 0.45), 0.1));
  add('lever', lever, new THREE.Vector3(0, -0.02, 0), new THREE.Vector3(0.9, 0, 0.5));
}
// Electromagnet at the bottom of the lever travel.
{
  const magnet = new THREE.Group();
  const coil = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.42, 24), M.copper); magnet.add(coil);
  [-0.24, 0.24].forEach(y => { const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.06, 24), M.iron); cap.position.y = y; magnet.add(cap); });
  magnet.add(box([0.12, 0.4, 0.12], M.iron, new THREE.Vector3(0, 0.1, 0)));
  add('magnet', magnet, new THREE.Vector3(2.0, -1.62, -0.05), new THREE.Vector3(1.5, -0.6, -1.0));
}
// Bimetal strip: brass bonded to steel. It bends as it warms.
const bimetal = new THREE.Group();
{
  const thermostat = new THREE.Group();
  bimetal.add(box([0.07, 1.1, 0.2], M.brass, new THREE.Vector3(-0.035, 0.55, 0)));
  bimetal.add(box([0.07, 1.1, 0.2], M.steel, new THREE.Vector3(0.035, 0.55, 0)));
  thermostat.add(bimetal);
  thermostat.add(box([0.3, 0.14, 0.34], M.plastic, new THREE.Vector3(0, -0.05, 0), 0.04));
  thermostat.add(box([0.14, 0.1, 0.14], M.brass, new THREE.Vector3(0.28, 1.0, 0)));
  add('thermostat', thermostat, new THREE.Vector3(-1.95, -1.75, 0), new THREE.Vector3(-1.5, -0.5, -1.0));
}
// Compression spring between the base and the carriage.
const springBase = BODY.bottom + 0.1;
function springGeometry(length) {
  const points = [];
  for (let i = 0; i <= 64; i++) {
    const angle = i / 64 * Math.PI * 14;
    points.push(new THREE.Vector3(Math.cos(angle) * 0.16, i / 64 * length, Math.sin(angle) * 0.16));
  }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 160, 0.035, 6, false);
}
const spring = new THREE.Mesh(springGeometry(1), M.spring); spring.userData.length = 1;
add('spring', spring, new THREE.Vector3(1.3, springBase, 0.95), new THREE.Vector3(0, -0.6, 1.2));

// Steam and heat haze rising from the slots.
const STEAM_N = 90;
const steamSeed = Array.from({ length: STEAM_N }, () => ({ x: (Math.random() - 0.5) * 2.6, z: TOASTER_LAYOUT.slotZ[Math.random() < 0.5 ? 0 : 1] + (Math.random() - 0.5) * 0.3, t: Math.random(), s: 0.5 + Math.random() * 0.6 }));
const steamPos = new Float32Array(STEAM_N * 3);
const steamGeo = new THREE.BufferGeometry(); steamGeo.setAttribute('position', new THREE.BufferAttribute(steamPos, 3));
const steam = new THREE.Points(steamGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.28, map: softDot(), transparent: true, opacity: 0, depthWrite: false }));
scene.add(steam);

// ---------- State and UI ----------
const state = { step: 0, explode: 0, targetExplode: 0, playing: true, browning: 3, toast: 0, focus: [], heat: false, down: false, glow: 0, lift: 0, liftV: 0 };
const ui = { play: document.querySelector('#play'), explode: document.querySelector('#explode'), browning: document.querySelector('#browning'), steps: document.querySelector('#steps'), prev: document.querySelector('#prev'), next: document.querySelector('#next') };

TOASTER_STORY.forEach((story, index) => {
  const button = document.createElement('button'); button.className = 'step'; button.id = `step-${index}`;
  button.innerHTML = `<span class="n">0${index + 1}</span><span><div class="t">${story.t}</div><div class="d">${story.d}</div><div class="part">${story.part}</div></span>`;
  button.addEventListener('click', () => setStep(index)); ui.steps.append(button);
});
function setStep(index, scroll = true) {
  state.step = (index + TOASTER_STORY.length) % TOASTER_STORY.length;
  const story = TOASTER_STORY[state.step]; state.targetExplode = story.explode; state.focus = story.focus; state.heat = story.heat; state.down = story.down;
  ui.explode.value = String(Math.round(story.explode * 100));
  document.querySelectorAll('.step').forEach((item, i) => item.classList.toggle('active', i === state.step));
  if (scroll) document.querySelector(`#step-${state.step}`).scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  applyFocus();
}
// "heat" in the story is the radiant heat of the elements, so it focuses the same meshes.
const ALIAS = { heat: 'elements' };
const warmWire = linear(0x8a1a05), hotWire = linear(0xff6a1a), coolWire = new THREE.Color(0x000000), wireColor = new THREE.Color();
function applyFocus() {
  const focus = state.focus.map(name => ALIAS[name] || name);
  if (state.glow < 0.5) wireColor.copy(coolWire).lerp(warmWire, state.glow * 2); else wireColor.copy(warmWire).lerp(hotWire, state.glow * 2 - 1);
  Object.entries(parts).forEach(([name, part]) => {
    const hot = focus.includes(name), partAlpha = partOpacity(name, { explode: state.explode, focus });
    part.meshes.forEach(mesh => {
      const opacity = mesh.userData.translucent ? partAlpha * 0.45 : partAlpha; // mica lets you see the coils behind it
      if (!mesh.userData.ownMaterial) { mesh.material = Array.isArray(mesh.material) ? mesh.material.map(m => m.clone()) : mesh.material.clone(); mesh.userData.ownMaterial = true; }
      [].concat(mesh.material).forEach(material => {
        material.transparent = opacity < 0.99; material.opacity = opacity; material.depthWrite = opacity > 0.9;
        if (mesh.userData.isHeatingWire) { material.emissive.copy(wireColor); material.emissiveIntensity = 1 + state.glow * 0.6; }
        else { material.emissive.copy(hot ? material.color : coolWire); material.emissiveIntensity = hot ? 0.12 : 0; }
      });
    });
  });
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
canvas.addEventListener('wheel', event => { event.preventDefault(); cam.r = THREE.MathUtils.clamp(cam.r + event.deltaY * 0.01, 6, 16); }, { passive: false });

// ---------- Frame ----------
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches; let last = performance.now();
const rawCrumb = linear(0xf1d9a6), toastCrumb = linear(0x8a4a22), rawCrust = linear(0xc98a4a), toastCrust = linear(0x3e1f0e);
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  const width = canvas.clientWidth, height = canvas.clientHeight, pr = renderer.getPixelRatio();
  if (canvas.width !== Math.floor(width * pr) || canvas.height !== Math.floor(height * pr)) { renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix(); }
  state.explode += (state.targetExplode - state.explode) * (reduced ? 1 : 0.09);
  applyFocus();

  // Carriage: eases down against the spring, then springs up with a small bounce.
  const liftTarget = state.down ? -LIFT : 0;
  if (reduced) { state.lift = liftTarget; state.liftV = 0; }
  else if (state.down) { state.lift += (liftTarget - state.lift) * Math.min(1, dt * 6); state.liftV = 0; }
  else { state.liftV += (140 * (liftTarget - state.lift) - 9 * state.liftV) * dt; state.lift += state.liftV * dt; }
  const liftUp = state.lift + LIFT; // 0 when down, LIFT when up
  Object.entries(parts).forEach(([name, part]) => {
    part.group.position.copy(part.home).addScaledVector(part.offset, state.explode);
    if (name === 'carriage' || name === 'bread') part.group.position.y += liftUp;
    if (name === 'lever') part.group.position.y += state.lift;
  });
  const springLength = Math.max(0.2, HEAT_Y + liftUp - breadH / 2 - 0.08 - springBase);
  if (Math.abs(springLength - spring.userData.length) > 0.01) { spring.geometry.dispose(); spring.geometry = springGeometry(springLength); spring.userData.length = springLength; }

  // Heat: the wires take a moment to glow and to cool.
  const glowTarget = state.heat && state.playing ? 1 : 0;
  state.glow += (glowTarget - state.glow) * Math.min(1, dt * (reduced ? 60 : glowTarget ? 1.8 : 1.2));
  slotLights.forEach(light => { light.intensity = state.glow * 2.2; });
  const irFocus = state.focus.includes('heat') ? 0.32 : 0.1;
  irPlanes.forEach(plane => { plane.material.opacity = state.glow * irFocus * (0.85 + Math.sin(now / 140) * 0.15); });

  if (state.playing) state.toast += dt * (state.heat ? 0.1 + state.browning * 0.03 : 0); state.toast = THREE.MathUtils.clamp(state.toast, 0, state.browning / 5);
  if (state.step === 0) state.toast = 0; // a fresh slice at the start of the story
  const crumb = rawCrumb.clone().lerp(toastCrumb, state.toast), crust = rawCrust.clone().lerp(toastCrust, state.toast);
  parts.bread.meshes.forEach(mesh => { mesh.material[0].color.copy(crumb); mesh.material[1].color.copy(crust); });
  bimetal.rotation.z = -state.glow * state.toast * 0.35;
  knob.rotation.x = -0.6 + state.browning * 0.45;

  // Steam rises once the bread is warm.
  const steamTarget = state.toast > 0.15 && !reduced ? 0.35 * Math.min(1, state.glow + (state.down ? 0 : 0.5)) : 0;
  steam.material.opacity += (steamTarget - steam.material.opacity) * Math.min(1, dt * 2);
  if (steam.material.opacity > 0.01) {
    const topY = BODY.top + parts.shell.group.position.y;
    steamSeed.forEach((p, i) => {
      if (state.playing) p.t = (p.t + dt * p.s * 0.35) % 1;
      steamPos[i * 3] = parts.bread.group.position.x + p.x + Math.sin(p.t * 6 + i) * 0.12;
      steamPos[i * 3 + 1] = topY + p.t * 2.2;
      steamPos[i * 3 + 2] = p.z + Math.cos(p.t * 5 + i) * 0.08;
    });
    steamGeo.attributes.position.needsUpdate = true;
  }

  camera.position.set(cam.target.x + cam.r * Math.sin(cam.phi) * Math.sin(cam.theta), cam.target.y + cam.r * Math.cos(cam.phi), cam.target.z + cam.r * Math.sin(cam.phi) * Math.cos(cam.theta)); camera.lookAt(cam.target); renderer.render(scene, camera); requestAnimationFrame(frame);
}
setStep(0, false); requestAnimationFrame(frame);
