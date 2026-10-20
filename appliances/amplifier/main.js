import * as THREE from 'three';
import { createStage, addFloor, addStudioLights } from '../../src/engine/stage.js';
import { createParts } from '../../src/engine/parts.js';
import { createCallouts } from '../../src/engine/callouts.js';
import { createStoryUI, bindRange, showRange } from '../../src/engine/story-ui.js';
import { sound } from '../../src/engine/sound.js';
import { startLoop, reducedMotion as reduced } from '../../src/engine/loop.js';
import { onPalette } from '../../src/engine/studio.js';
import { box, cylinder, lathe, helixCurve } from '../../src/kit/shapes.js';
import { createMaterials, linear } from '../../src/kit/materials.js';
import { softDot, createParticles, speckleTexture } from '../../src/kit/effects.js';
import { AMP_STORY } from './story.js';
import { AMP, KNOBS, chain, toneResponse, outputWatts, overdrive, headroom, strum, bPlus, bPlusAverage } from './amp.js';

// ---------- Layout ----------
// Scale: 1 unit = 1 cm. A 1×12 combo, 60 cm wide, stands on the floor at y = 0 and faces +z.
// As in most combos, the chassis hangs upside down from the cabinet top: the control panel is its
// front wall, and the tubes and transformers hang under it, where the open back shows them.
const v3 = (x, y, z) => new THREE.Vector3(x, y, z);
const zero = v3(0, 0, 0);
const deg = THREE.MathUtils.degToRad;
const clamp01 = v => Math.max(0, Math.min(1, v));
const wrap = v => THREE.MathUtils.euclideanModulo(v, 1);
const W = 60, D = 25, T = 1.8, Y0 = 1.5, Y1 = 52.5; // cabinet: x ±30, z ±12.5
const IX = W / 2 - T;                                // inside half width
const CH = 43;                                       // underside of the chassis plate
const PANEL_TOP = 50.6, PANEL_Z = 12.2, KNOB_Y = 46.4;
const SPK_Y = 20.5, BAFFLE_Z = 10.4;                 // speaker centre; the back of the baffle
const TUBE_Z = -3.5;
const X = { input: -24, gain: -16.5, treble: -10, middle: -3.5, bass: 3, master: 9.5, power: 18.5, pilot: 24 };
const TUBES = { v1: -22, v2: -17.5, pi: -13, a: -6, b: 0, rect: 8 };
// The knobs turn through 300°: 1 at seven o'clock, 10 at five o'clock. Degrees clockwise from 12.
const knobAngle = v => -150 + (v - 1) * 300 / 9;

const VIEWS = {
  input: { r: 124, theta: -0.5, phi: 1.22, target: [-12, 30, 10] },
  v1: { r: 15, theta: -2.6, phi: 1.62, target: [TUBES.v1, 40.4, TUBE_Z] },
  tone: { r: 52, theta: 0.35, phi: 0.85, target: [-4, 47, 9] },
  gain: { r: 34, theta: -0.28, phi: 1.5, target: [-16, 42.5, 4] },
  supply: { r: 62, theta: -2.7, phi: 1.5, target: [15.5, 39, -2] },
  power: { r: 52, theta: -2.85, phi: 1.5, target: [-7, 38.5, TUBE_Z] },
  ot: { r: 58, theta: -1.0, phi: 1.55, target: [-3, 37, 5] },
  speaker: { r: 75, theta: 2.5, phi: 1.5, target: [0, SPK_Y, 3] },
};

// ---------- Stage and light ----------
const stage = createStage(document.getElementById('c'), {
  fov: 36, pbr: true, camera: VIEWS.input, zoom: [12, 360], phiLimit: 0.2,
});
const { scene, cam } = stage;
stage.camera.far = 1200; stage.camera.near = 0.5; stage.camera.updateProjectionMatrix();
addStudioLights(stage, { key: [90, 150, 100], extent: 70, far: 420, scale: 5 });
addFloor(stage, 0, { size: 260, cell: 5, opacity: 0.12, center: [0, 4], height: 70, blur: 3.5, shadowSize: 120 }); // 5 cm grid

// ---------- Textures ----------
// The control panel: white print on black, a label over each knob and a ring of numbers round it.
function panelFace() {
  const w = 2048, px = w / (2 * IX), h = Math.round((PANEL_TOP - CH) * px);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'), cx = x => (x + IX) * px, cy = y => (PANEL_TOP - y) * px;
  g.fillStyle = '#161719'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#ece7dc'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `700 ${0.6 * px}px Arial, Helvetica, sans-serif`;
  for (const [k, text] of [['input', 'INPUT'], ['gain', 'GAIN'], ['treble', 'TREBLE'], ['middle', 'MIDDLE'], ['bass', 'BASS'], ['master', 'MASTER'], ['power', 'POWER']]) g.fillText(text, cx(X[k]), cy(PANEL_TOP - 0.85));
  g.font = `500 ${0.42 * px}px Arial, Helvetica, sans-serif`;
  for (const k of ['gain', 'treble', 'middle', 'bass', 'master']) {
    for (let v = 1; v <= 10; v++) {
      const a = deg(knobAngle(v)), r = 2.3 * px;
      g.fillText(String(v), cx(X[k]) + Math.sin(a) * r, cy(KNOB_Y) - Math.cos(a) * r);
    }
  }
  g.font = `500 ${0.42 * px}px Arial, Helvetica, sans-serif`;
  g.fillText('ON', cx(X.power), cy(KNOB_Y + 1.6)); g.fillText('OFF', cx(X.power), cy(KNOB_Y - 1.7));
  g.fillStyle = '#d98b52'; g.font = `800 ${1.05 * px}px Arial, Helvetica, sans-serif`;
  g.fillText('HSW', cx(14), cy(KNOB_Y + 0.35));
  g.fillStyle = '#ece7dc'; g.font = `500 ${0.38 * px}px Arial, Helvetica, sans-serif`;
  g.fillText('THIRTY  ·  NO. 18', cx(14), cy(KNOB_Y - 0.9));
  const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = 8;
  return t;
}
// The knob cap: black with a white pointer line to 12 o'clock.
function knobFace() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#121314'; g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#f2eee6'; g.fillRect(60, 6, 8, 52);
  const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; return t;
}
// Grille cloth: silver threads woven with black ones.
function grilleCloth() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#26282b'; g.fillRect(0, 0, 64, 64);
  for (let i = 0; i < 64; i += 4) {
    g.fillStyle = '#aeb3b8'; g.fillRect(i, 0, 2, 64);
    g.fillStyle = (i / 4) % 2 ? '#8d9298' : '#c7cbcf'; g.fillRect(0, i + 1, 64, 2);
  }
  const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8; t.repeat.set(2 * IX / 4.8, (CH - Y0 - T) / 4.8);
  return t;
}
// Fine stripes: the edges of a laminated iron core, or the turns of a winding.
function stripes(base, line, step, width, { repeat = [1, 1], size = 128 } = {}) {
  const c = document.createElement('canvas'); c.width = 8; c.height = size;
  const g = c.getContext('2d'); g.fillStyle = base; g.fillRect(0, 0, 8, size);
  g.fillStyle = line; for (let y = 0; y < size; y += step) g.fillRect(0, y, 8, width);
  const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat);
  return t;
}

// ---------- Materials ----------
const M = createMaterials({
  tolex: { color: 0x1d1d1f, roughness: 0.72, metalness: 0.05, bumpMap: speckleTexture({ count: 900, repeat: 10 }), bumpScale: 0.02 },
  grille: { color: 0xffffff, roughness: 0.92, map: grilleCloth() },
  piping: { color: 0xe9e4d8, roughness: 0.45 },
  face: { color: 0xffffff, roughness: 0.4, metalness: 0.2, map: panelFace() },
  knob: { color: 0x141516, roughness: 0.3, metalness: 0.1 },
  knobTop: { color: 0xffffff, roughness: 0.35, map: knobFace() },
  chrome: { look: 'steel', color: 0xeef1f4, roughness: 0.1 },
  chassis: { look: 'aluminium', color: 0xc6ccd2, roughness: 0.34, side: THREE.DoubleSide },
  steel: 'steel', brushed: 'brushed', iron: 'iron', copper: 'copper', brass: 'brass', rubber: 'rubber', dark: 'dark',
  board: { color: 0x6e4a2c, roughness: 0.8 },
  resistor: { color: 0xc9a77a, roughness: 0.6 },
  yellow: { color: 0xd8b13a, roughness: 0.5 },
  orange: { color: 0xd4601c, roughness: 0.45 },
  blue: { color: 0x2c4f86, metalness: 0.2, roughness: 0.45 },
  black: { color: 0x0f1011, roughness: 0.5, metalness: 0.3 },
  bakelite: { color: 0x2a221c, roughness: 0.5 },
  glass: { color: 0xe6eff2, metalness: 0, roughness: 0.03, side: THREE.DoubleSide, envMapIntensity: 1.6 },
  getter: { color: 0x9aa1a8, metalness: 1, roughness: 0.16 },
  plate: { color: 0x5d636a, metalness: 0.6, roughness: 0.5 },
  cathode: { color: 0xdcd9d2, roughness: 0.75 },
  mica: { color: 0xeee6d2, roughness: 0.4, side: THREE.DoubleSide },
  wire: { color: 0x9aa0a6, metalness: 0.8, roughness: 0.3 },
  core: { color: 0xffffff, metalness: 0.5, roughness: 0.5, map: stripes('#4a5058', '#2c3035', 4, 1, { size: 32 }) },
  bell: { color: 0x17181a, metalness: 0.4, roughness: 0.42 },
  primary: { color: 0xffffff, metalness: 0.7, roughness: 0.35, map: stripes('#c87a3e', '#7a3f18', 4, 1, { size: 32, repeat: [1, 4] }) },
  secondary: { color: 0xffffff, metalness: 0.7, roughness: 0.35, map: stripes('#d98c4a', '#6b3412', 8, 2, { size: 32 }) },
  cone: { color: 0x2f2b27, roughness: 0.92, side: THREE.DoubleSide },
  spider: { color: 0xc9a552, roughness: 0.85, side: THREE.DoubleSide },
  basket: { color: 0x3a3f45, metalness: 0.6, roughness: 0.42, side: THREE.DoubleSide },
  ferrite: { color: 0x34373b, metalness: 0.1, roughness: 0.78 },
  former: { color: 0xc8b48a, roughness: 0.6, side: THREE.DoubleSide },
  cable: { color: 0x1a1b1c, roughness: 0.55 },
  red: { color: 0xa8241c, roughness: 0.5 },
}, { pbr: true });
const glow = (hex, opacity = 1) => new THREE.MeshBasicMaterial({ color: linear(hex), transparent: true, opacity, toneMapped: false });
const dot = softDot();
const sprite = (hex, scale, opacity) => {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: dot, color: linear(hex), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity }));
  s.scale.set(scale, scale, 1); s.userData.base = opacity; return s;
};

// ---------- Helpers ----------
const alongZ = mesh => { mesh.rotation.x = Math.PI / 2; return mesh; };
const alongX = mesh => { mesh.rotation.z = Math.PI / 2; return mesh; };
const flag = (mesh, data) => { Object.assign(mesh.userData, data); return mesh; };
// A flat ring in the xy plane, `depth` deep along +z from z.
function ring(rOut, rIn, depth, mat, z = 0) {
  const s = new THREE.Shape().absarc(0, 0, rOut, 0, Math.PI * 2, false);
  s.holes.push(new THREE.Path().absarc(0, 0, rIn, 0, Math.PI * 2, true));
  const geo = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 48 }); geo.translate(0, 0, z);
  return new THREE.Mesh(geo, mat);
}
// A lathe turned to face +z instead of +y.
const latheZ = (profile, mat, segments = 64) => { const m = lathe(profile, mat, { segments }); m.rotation.x = Math.PI / 2; return m; };
// A tube along a curve that rebuilds itself when its end points move.
function liveTube(mat, radius, radial = 8) {
  const mesh = new THREE.Mesh(new THREE.BufferGeometry(), mat);
  let key = '';
  mesh.userData.set = points => {
    const k = points.map(p => p.toArray().map(n => n.toFixed(2)).join(',')).join(';');
    if (k === key) return false;
    key = k; mesh.userData.curve = new THREE.CatmullRomCurve3(points);
    mesh.geometry.dispose(); mesh.geometry = new THREE.TubeGeometry(mesh.userData.curve, 48, radius, radial, false);
    return true;
  };
  return mesh;
}

// ---------- Parts ----------
const root = new THREE.Group(); scene.add(root);
const { parts, add, update } = createParts(root, { shadows: true, lively: true });

// Cabinet: a plywood box in black tolex with metal corners, open at the back between two panels.
{
  const g = new THREE.Group(), cut = m => { m.userData.cutaway = true; g.add(m); return m; };
  cut(box([W, T, D], M.tolex, [0, Y1 - T / 2, 0], 0.6));
  cut(box([W, T, D], M.tolex, [0, Y0 + T / 2, 0], 0.6));
  [-1, 1].forEach(s => cut(box([T, Y1 - Y0 - 0.02, D - 0.02], M.tolex, [s * (W / 2 - T / 2), (Y0 + Y1) / 2, 0], 0.6)));
  cut(box([2 * IX, PANEL_TOP + 0.1 - CH, 1.2], M.tolex, [0, (CH + PANEL_TOP) / 2, -D / 2 + 0.6], 0.3)); // behind the chassis
  cut(box([2 * IX, 9, 1.2], M.tolex, [0, Y0 + T + 4.5, -D / 2 + 0.6], 0.3));
  // Chrome corners and rubber feet.
  for (const x of [-1, 1]) for (const y of [Y0 + 1.6, Y1 - 1.6]) for (const z of [-1, 1]) {
    const c = box([3.4, 3.4, 3.4], M.chrome, [x * (W / 2 - 1.5), y, z * (D / 2 - 1.5)], 0.9); c.scale.set(1.04, 1.04, 1.04); g.add(c);
  }
  [[-24, -8.5], [24, -8.5], [-24, 8.5], [24, 8.5]].forEach(([x, z]) => g.add(cylinder(1.6, 1.8, Y0, M.rubber, [x, Y0 / 2, z], { segments: 20 })));
  // Strap handle on top.
  const strap = new THREE.CatmullRomCurve3([v3(-9, Y1, 0), v3(-7.5, Y1 + 2.8, 0), v3(0, Y1 + 3.6, 0), v3(7.5, Y1 + 2.8, 0), v3(9, Y1, 0)]);
  const handle = new THREE.Mesh(new THREE.TubeGeometry(strap, 40, 0.55, 10, false), M.rubber); handle.scale.z = 2.6; g.add(handle);
  [-1, 1].forEach(s2 => g.add(box([3, 0.7, 3.2], M.chrome, [s2 * 9.6, Y1 + 0.3, 0], 0.25)));
  g.userData.anchor = [0, Y1, D / 2];
  add('cabinet', g, zero, zero);
}

// The front: the baffle board the speaker hangs behind, the grille cloth over it and white piping.
{
  const g = new THREE.Group(), h = CH - Y0 - T - 0.4;
  const s = new THREE.Shape();
  s.moveTo(-IX, Y0 + T); s.lineTo(IX, Y0 + T); s.lineTo(IX, CH); s.lineTo(-IX, CH); s.lineTo(-IX, Y0 + T);
  s.holes.push(new THREE.Path().absarc(0, SPK_Y, 14, 0, Math.PI * 2, true));
  const baffle = new THREE.Mesh(new THREE.ExtrudeGeometry(s, { depth: T, bevelEnabled: false, curveSegments: 48 }), M.dark);
  baffle.position.z = BAFFLE_Z; g.add(flag(baffle, { cutaway: true }));
  const cloth = flag(new THREE.Mesh(new THREE.PlaneGeometry(2 * IX - 0.3, h), M.grille), { cutaway: true });
  cloth.position.set(0, Y0 + T + 0.2 + h / 2, BAFFLE_Z + T + 0.25); g.add(cloth);
  // Seen from inside the cabinet, the cloth is a dark backing.
  const backing = flag(new THREE.Mesh(cloth.geometry, M.dark), { cutaway: true });
  backing.position.copy(cloth.position); backing.position.z -= 0.05; backing.rotation.y = Math.PI; g.add(backing);
  const y0 = Y0 + T + 0.25, y1 = CH - 0.25;
  [y0, y1].forEach(y => g.add(flag(alongX(cylinder(0.22, 0.22, 2 * IX - 0.6, M.piping, [0, y, BAFFLE_Z + T + 0.35], { segments: 8 })), { cutaway: true })));
  [-1, 1].forEach(s => g.add(flag(cylinder(0.22, 0.22, y1 - y0, M.piping, [s * (IX - 0.3), (y0 + y1) / 2, BAFFLE_Z + T + 0.35], { segments: 8 }), { cutaway: true })));
  g.userData.anchor = [IX * 0.5, SPK_Y, BAFFLE_Z + T];
  add('grille', g, zero, v3(0, 0, 30));
}

// Chassis: a folded steel tray, hung upside down. Tube sockets on its underside.
const SOCKETS = [];
{
  const g = new THREE.Group(), depth = PANEL_Z - (-9);
  g.add(box([54, 0.2, depth], M.chassis, [0, CH + 0.1, (PANEL_Z - 9) / 2], 0));
  g.add(flag(box([54, PANEL_TOP - CH, 0.2], M.chassis, [0, (CH + PANEL_TOP) / 2, -9], 0), { cutaway: true }));
  [-1, 1].forEach(s => g.add(box([0.2, PANEL_TOP - CH, depth], M.chassis, [s * 27, (CH + PANEL_TOP) / 2, (PANEL_Z - 9) / 2], 0)));
  for (const [key, x] of Object.entries(TUBES)) {
    const octal = key === 'a' || key === 'b' || key === 'rect';
    g.add(cylinder(octal ? 1.9 : 1.35, octal ? 1.9 : 1.35, 0.4, M.black, [x, CH - 0.2, TUBE_Z], { segments: 28 }));
    g.add(cylinder(octal ? 2.3 : 1.7, octal ? 2.3 : 1.7, 0.08, M.steel, [x, CH - 0.04, TUBE_Z], { segments: 28 }));
    SOCKETS.push([x, TUBE_Z]);
  }
  g.userData.anchor = [-20, CH, 6];
  add('chassis', g, zero, v3(0, 26, 0));
}

// Control panel: the chassis front wall, with the input jack, the master knob, the power switch
// and the red pilot jewel. The gain and tone knobs are parts of their own.
const knobs = {};
function knob(x) {
  const g = new THREE.Group(); g.position.set(x, KNOB_Y, PANEL_Z);
  g.add(alongZ(cylinder(1.55, 1.55, 0.45, M.knob, [0, 0, 0.3], { segments: 40 })));
  g.add(alongZ(cylinder(1.0, 1.12, 1.0, M.knob, [0, 0, 0.95], { segments: 40 })));
  const cap = new THREE.Mesh(new THREE.CircleGeometry(1.0, 40), M.knobTop); cap.position.z = 1.46; g.add(cap);
  return g;
}
function pot(x) {
  const g = new THREE.Group();
  g.add(alongZ(cylinder(1.2, 1.2, 0.9, M.brushed, [x, KNOB_Y, PANEL_Z - 0.75], { segments: 28 })));
  g.add(alongZ(cylinder(0.45, 0.45, 0.4, M.brass, [x, KNOB_Y, PANEL_Z - 0.1], { segments: 12 })));
  [-0.7, 0, 0.7].forEach(dx => g.add(box([0.25, 0.9, 0.06], M.brass, [x + dx, KNOB_Y + 1.5, PANEL_Z - 0.9], 0)));
  return g;
}
{
  const g = new THREE.Group();
  g.add(flag(box([2 * IX, PANEL_TOP - CH, 0.25], M.chassis, [0, (CH + PANEL_TOP) / 2, PANEL_Z - 0.12], 0), { cutaway: true }));
  const face = new THREE.Mesh(new THREE.PlaneGeometry(2 * IX, PANEL_TOP - CH), M.face); face.position.set(0, (CH + PANEL_TOP) / 2, PANEL_Z + 0.02); g.add(flag(face, { cutaway: true }));
  // Input jack: a chrome nut round the socket, and the jack's body behind the panel.
  g.add(alongZ(cylinder(0.95, 0.95, 0.35, M.chrome, [X.input, KNOB_Y, PANEL_Z + 0.2], { segments: 6 })));
  g.add(alongZ(cylinder(0.75, 0.75, 2.6, M.black, [X.input, KNOB_Y, PANEL_Z - 1.4], { segments: 16 })));
  // Master, fixed at 6.
  const master = knob(X.master); master.rotation.z = -deg(knobAngle(6)); g.add(master);
  g.add(pot(X.master));
  // Power switch and pilot jewel.
  g.add(alongZ(cylinder(0.7, 0.7, 0.3, M.chrome, [X.power, KNOB_Y, PANEL_Z + 0.17], { segments: 6 })));
  const lever = cylinder(0.16, 0.22, 1.7, M.chrome, [X.power, KNOB_Y + 0.55, PANEL_Z + 0.9], { segments: 12 }); lever.rotation.x = deg(55); g.add(lever);
  g.add(alongZ(cylinder(1.05, 1.15, 0.6, M.chrome, [X.pilot, KNOB_Y, PANEL_Z + 0.3], { segments: 12 })));
  const jewel = new THREE.Mesh(new THREE.IcosahedronGeometry(0.8, 1), glow(0xff3b24)); jewel.position.set(X.pilot, KNOB_Y, PANEL_Z + 0.75); jewel.scale.z = 0.7; g.add(jewel);
  const halo = sprite(0xff4a2a, 5, 0.45); halo.position.set(X.pilot, KNOB_Y, PANEL_Z + 1.2); g.add(halo);
  g.userData.anchor = [X.input, KNOB_Y, PANEL_Z];
  add('panel', g, zero, v3(0, 26, 0));
}

// Gain knob and its pot. Its turn comes from the Gain slider.
const gainKnob = knob(X.gain);
{
  const g = new THREE.Group(); g.add(gainKnob, pot(X.gain));
  g.userData.anchor = [X.gain, KNOB_Y, PANEL_Z + 1.4];
  add('gain', g, zero, v3(0, 26, 0));
}

// Tone stack: treble, middle and bass knobs and pots, with the three tone capacitors and the
// slope resistor soldered across the pot lugs.
{
  const g = new THREE.Group();
  for (const [k, v] of [['treble', KNOBS.treble], ['middle', KNOBS.middle], ['bass', KNOBS.bass]]) {
    const kn = knob(X[k]); kn.rotation.z = -deg(knobAngle(v)); g.add(kn, pot(X[k]));
  }
  const top = KNOB_Y + 2.3, z = PANEL_Z - 1.4;
  g.add(alongZ(cylinder(0.5, 0.5, 0.18, M.orange, [X.treble - 0.4, top + 0.4, z], { segments: 20 }))); // 250 pF disc
  const drop = (x, y) => { const m = box([1.6, 1.2, 0.65], M.orange, [x, y, z], 0.3); return m; };
  g.add(drop((X.treble + X.middle) / 2, top + 0.3), drop((X.middle + X.bass) / 2, top + 0.3)); // 20 nF orange drops
  g.add(alongX(cylinder(0.22, 0.22, 1.6, M.resistor, [X.treble - 2.6, top - 0.3, z], { segments: 10 }))); // 56 kΩ slope
  const lead = (a, b) => {
    const c = new THREE.LineCurve3(v3(...a), v3(...b));
    g.add(new THREE.Mesh(new THREE.TubeGeometry(c, 2, 0.05, 5, false), M.wire));
  };
  lead([X.treble - 0.4, top + 0.4, z], [X.treble - 0.7, KNOB_Y + 1.95, z + 0.5]);
  lead([(X.treble + X.middle) / 2 - 0.8, top + 0.3, z], [X.treble + 0.7, KNOB_Y + 1.95, z + 0.5]);
  lead([(X.treble + X.middle) / 2 + 0.8, top + 0.3, z], [X.middle - 0.7, KNOB_Y + 1.95, z + 0.5]);
  lead([(X.middle + X.bass) / 2 - 0.8, top + 0.3, z], [X.middle + 0.7, KNOB_Y + 1.95, z + 0.5]);
  lead([(X.middle + X.bass) / 2 + 0.8, top + 0.3, z], [X.bass - 0.7, KNOB_Y + 1.95, z + 0.5]);
  g.userData.anchor = [(X.treble + X.middle) / 2, top + 0.3, z];
  add('tone', g, zero, v3(0, 26, 0));
}

// Eyelet board inside the chassis: rows of resistors and capacitors on brown fibre board.
{
  const g = new THREE.Group(), y = CH + 1.2, z0 = -2.6;
  g.add(box([44, 0.25, 11], M.board, [-4, y, z0], 0.05));
  [-1, 1].forEach(s => [-24, -4, 16].forEach(x => g.add(cylinder(0.25, 0.25, 1.0, M.brass, [x, CH + 0.6, z0 + s * 4.5], { segments: 8 }))));
  const rng = (i => () => (i = (i * 16807) % 2147483647) / 2147483647)(7);
  for (let i = 0; i < 26; i++) {
    const x = -24.5 + i * 1.65, row = i % 2 ? -5.4 : 0.6;
    g.add(alongZ(cylinder(0.24, 0.24, 1.3, M.resistor, [x, y + 0.36, z0 + row], { segments: 10 })));
    const kind = rng();
    if (kind > 0.55) g.add(alongZ(cylinder(0.42, 0.42, 2.0, kind > 0.8 ? M.yellow : M.orange, [x + 0.8, y + 0.55, z0 + row + 3.2], { segments: 14 })));
  }
  [[12, -5.5], [14, -5.5], [16, -5.5]].forEach(([x, z]) => g.add(cylinder(0.6, 0.6, 2.4, M.blue, [x, y + 1.3, z0 + z + 6], { segments: 16 })));
  g.userData.anchor = [-10, y + 0.4, z0];
  add('board', g, zero, v3(0, 32, 0));
}

// ---------- Tubes ----------
// Glass, with a silvered getter flash on the dome. Profiles run from the dome tip up to the socket,
// as [radius, y] with y down from the socket.
const NOVAL = [[0.01, -5.2], [0.13, -5.14], [0.18, -4.98], [0.6, -4.9], [0.92, -4.65], [1.07, -4.25], [1.1, -3.9], [1.1, -0.65], [1.04, -0.42], [0.96, -0.4]];
const OCTAL = [[0.01, -11.3], [0.55, -11.18], [1.15, -10.85], [1.55, -10.35], [1.65, -9.9], [1.65, -2.75], [1.55, -2.6], [1.45, -2.58]];
function glassFor(profile) {
  const g = new THREE.Group();
  g.add(flag(lathe(profile, M.glass, { segments: 40 }), { glass: true, alpha0: 0.17, noGhost: true }));
  const dome = profile.filter(([, y]) => y < profile[0][1] + 1.25).map(([r, y]) => [r * 0.97, y + 0.02]);
  g.add(lathe(dome, M.getter, { segments: 40 }));
  return g;
}
const heaterGlows = [], blueGlows = [];
// A 12AX7: two triodes side by side, each a cathode sleeve, a fine grid coil and two plates.
const ELECTRODE_Y = -2.6;
function noval(x, { cutPlates = false } = {}) {
  const g = new THREE.Group(); g.position.set(x, CH, TUBE_Z);
  g.add(glassFor(NOVAL));
  [-1, 1].forEach(s => {
    const u = new THREE.Group(); u.position.set(s * 0.5, ELECTRODE_Y, 0); g.add(u);
    [-1, 1].forEach(side => u.add(flag(box([0.72, 1.7, 0.035], M.plate, [0, 0, side * 0.3], 0), { cutaway: cutPlates })));
    u.add(cylinder(0.055, 0.055, 1.95, M.cathode, [0, 0, 0], { segments: 10 }));
    u.add(new THREE.Mesh(new THREE.TubeGeometry(helixCurve(1.55, 15, 0.15), 180, 0.009, 4, false), M.wire));
    [-1, 1].forEach(r => u.add(cylinder(0.018, 0.018, 2.0, M.wire, [r * 0.15, 0, 0], { segments: 6 })));
    [-1, 1].forEach(e => u.add(cylinder(0.05, 0.05, 0.12, glow(0xff8a3a), [0, e * 1.03, 0], { segments: 8 })));
    const h = sprite(0xff6a1e, 1.1, 0.32); u.add(h); heaterGlows.push(h);
  });
  [-1, 1].forEach(e => g.add(flag(cylinder(1.0, 1.0, 0.04, M.mica, [0, ELECTRODE_Y + e * 1.0, 0], { segments: 24 }), { alpha0: 0.7 })));
  g.userData.anchor = [0, -2.6, 0];
  return g;
}
// A 6L6 (and the GZ34 rectifier, which is built much the same): an octal base and a big plate.
function octal(x, { rectifier = false } = {}) {
  const g = new THREE.Group(); g.position.set(x, CH, TUBE_Z);
  g.add(cylinder(1.5, 1.5, 2.2, M.bakelite, [0, -1.5, 0], { segments: 28 }));
  g.add(glassFor(rectifier ? OCTAL.map(([r, y]) => [r * 0.96, y]) : OCTAL));
  if (rectifier) [-1, 1].forEach(s => g.add(box([0.9, 3.6, 0.9], M.plate, [s * 0.58, -6.5, 0], 0.08)));
  else {
    g.add(box([2.0, 3.9, 1.1], M.plate, [0, -6.4, 0], 0.1));
    [-1, 1].forEach(s => g.add(box([0.12, 3.9, 1.5], M.plate, [s * 1.05, -6.4, 0], 0)));
  }
  [-1, 1].forEach(e => g.add(flag(cylinder(1.5, 1.5, 0.05, M.mica, [0, -6.4 + e * 2.15, 0], { segments: 24 }), { alpha0: 0.7 })));
  [-1, 1].forEach(e => g.add(cylinder(0.16, 0.16, 0.14, glow(0xff8a3a), [0, -6.4 + e * 2.05, 0], { segments: 10 })));
  const h = sprite(0xff7a2e, rectifier ? 4 : 3.2, rectifier ? 0.6 : 0.42); h.position.y = -6.4; g.add(h); heaterGlows.push(h);
  if (!rectifier) { const b = sprite(0x6aa8ff, 4.2, 0); b.position.set(0, -6.4, 0.9); g.add(b); blueGlows.push(b); }
  g.userData.anchor = [0, -7, 0];
  return g;
}
const v1 = noval(TUBES.v1, { cutPlates: true });
add('v1', v1, zero, v3(0, 19, 0));
add('v2', noval(TUBES.v2), zero, v3(0, 19, 0));
add('pi', noval(TUBES.pi), zero, v3(0, 19, 0));
{
  const g = new THREE.Group(); g.add(octal(TUBES.a), octal(TUBES.b));
  g.userData.anchor = [(TUBES.a + TUBES.b) / 2, CH - 7, TUBE_Z];
  add('power', g, zero, v3(0, 19, 0));
}
add('rectifier', octal(TUBES.rect, { rectifier: true }), zero, v3(0, 19, 0));

// Filter capacitors: two cans clamped under the chassis.
{
  const g = new THREE.Group();
  [-4.4, 0.6].forEach(z => {
    g.add(cylinder(1.75, 1.75, 7.4, M.blue, [13.5, CH - 3.9, z], { segments: 28 }));
    g.add(cylinder(1.62, 1.62, 0.1, M.brushed, [13.5, CH - 7.65, z], { segments: 28 }));
    g.add(cylinder(1.77, 1.77, 0.7, M.piping, [13.5, CH - 5.8, z], { segments: 28 }));
    g.add(cylinder(1.9, 1.9, 0.9, M.steel, [13.5, CH - 0.6, z], { segments: 28 }));
  });
  g.userData.anchor = [13.5, CH - 4, -1.9];
  add('caps', g, zero, v3(0, 22, 0));
}

// A transformer: a laminated iron core with the windings coming out each side under black end bells.
function transformer({ size: [w, h, d], bell, coil, at: [x, z], cutBells = false }) {
  const g = new THREE.Group(), y = CH - h / 2 - 0.1;
  const coreMat = M.core.clone(); coreMat.map = M.core.map.clone(); coreMat.map.repeat.set(1, h / 1.2); coreMat.map.needsUpdate = true;
  g.add(box([w, h, d], coreMat, [x, y, z], 0.05));
  [-1, 1].forEach(s => g.add(flag(box([bell[0], bell[1], bell[2]], M.bell, [x, y, z + s * (d / 2 + bell[2] / 2)], 0.45), { cutaway: cutBells })));
  if (coil) {
    const len = d + 2 * bell[2] - 0.6;
    g.add(box([coil[0], coil[1] * 0.68, len], M.primary, [x, y + coil[1] * 0.16, z], 0.15));
    g.add(box([coil[0], coil[1] * 0.3, len], M.secondary, [x, y - coil[1] * 0.35, z], 0.12));
  }
  [-1, 1].forEach(sx => [-1, 1].forEach(sz => g.add(cylinder(0.28, 0.28, h + 0.6, M.steel, [x + sx * (w / 2 - 0.6), y, z + sz * (d / 2 - 0.5)], { segments: 8 }))));
  return g;
}
{
  const g = transformer({ size: [7.6, 6.4, 4.4], bell: [6.2, 6.0, 2.0], coil: [5, 5.4], at: [21.5, -0.8] });
  [[0xa8241c, -1.6], [0xd8b13a, -0.6], [0x2f7d3b, 0.4], [0x111111, 1.4]].forEach(([hex, dx]) => {
    const c = new THREE.CatmullRomCurve3([v3(21.5 + dx, CH - 1.5, -4.4), v3(21.5 + dx, CH - 0.6, -5.4), v3(20 + dx, CH - 0.1, -6.2)]);
    g.add(new THREE.Mesh(new THREE.TubeGeometry(c, 8, 0.12, 6, false), new THREE.MeshStandardMaterial({ color: linear(hex), roughness: 0.5 })));
  });
  g.userData.anchor = [21.5, CH - 3.3, 3.2];
  add('pt', g, zero, v3(0, 22, 0));
}
const OT = { x: -3, z: 5.2 };
{
  const g = transformer({ size: [6, 5.4, 3.4], bell: [4.8, 4.8, 1.7], coil: [3.8, 4.4], at: [OT.x, OT.z], cutBells: true });
  g.userData.anchor = [OT.x, CH - 2.8, OT.z + 3.4];
  add('ot', g, zero, v3(0, 22, 0));
}

// Speaker: a 12-inch driver mounted behind the baffle. The cone, dust cap, voice coil and the
// inner edge of the spider move together.
const coneGroup = new THREE.Group();
const CONE_Z = { coil: 1.6, apex: 4.6, rim: 10.0 };
{
  const g = new THREE.Group(); g.position.set(0, SPK_Y, 0);
  g.add(ring(15.4, 13.5, 0.3, M.basket, BAFFLE_Z - 0.3));
  for (let i = 0; i < 6; i++) {
    const a = (i + 0.5) / 6 * Math.PI * 2, from = v3(Math.cos(a) * 13.6, Math.sin(a) * 13.6, BAFFLE_Z - 0.2), to = v3(Math.cos(a) * 6.3, Math.sin(a) * 6.3, 2.3);
    const along = to.clone().sub(from).normalize(), across = v3(-Math.sin(a), Math.cos(a), 0);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.18, from.distanceTo(to)), M.basket);
    arm.position.copy(from).add(to).multiplyScalar(0.5);
    arm.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(across, along.clone().cross(across), along));
    g.add(arm);
  }
  g.add(ring(6.6, 5.6, 0.25, M.basket, 2.2));
  // Magnet: a ferrite ring between a steel top plate and a back plate with a centre pole.
  g.add(flag(ring(5.8, 2.15, 0.6, M.steel, 1.6), { cutaway: true }));
  g.add(flag(ring(6.5, 2.9, 2.0, M.ferrite, -0.4), { cutaway: true }));
  g.add(flag(ring(6.0, 0.01, 0.6, M.steel, -1.0), { cutaway: true }));
  g.add(flag(alongZ(cylinder(1.85, 1.85, 2.6, M.steel, [0, 0, 0.9], { segments: 32 })), { cutaway: true }));
  // Terminals on one arm, at the top.
  [-0.8, 0.8].forEach(dx => g.add(box([0.6, 0.9, 0.1], M.brass, [dx, 9.6, 5.6], 0)));
  // The moving parts.
  coneGroup.add(latheZ([[2.05, CONE_Z.apex], [5, 6.2], [9, 8.25], [12.9, CONE_Z.rim]], M.cone));
  const surround = new THREE.Mesh(new THREE.TorusGeometry(13.25, 0.42, 8, 72), M.cone); surround.position.z = CONE_Z.rim + 0.05; coneGroup.add(surround);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(2.5, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2), M.cone);
  cap.rotation.x = Math.PI / 2; cap.scale.set(1, 0.42, 1); cap.position.z = CONE_Z.apex; flag(cap, { cutaway: true }); coneGroup.add(cap);
  coneGroup.add(alongZ(cylinder(2.02, 2.02, 3.3, M.former, [0, 0, (CONE_Z.coil + CONE_Z.apex) / 2 + 0.15], { segments: 32, open: true })));
  coneGroup.add(alongZ(cylinder(2.06, 2.06, 1.1, M.copper, [0, 0, CONE_Z.coil + 0.5], { segments: 32, open: true })));
  const spider = [];
  for (let i = 0; i <= 10; i++) spider.push([2.1 + i * 0.36, 3.4 + (i % 2 ? 0.18 : -0.18) * (i > 0 && i < 10 ? 1 : 0)]);
  coneGroup.add(latheZ(spider, M.spider));
  g.add(coneGroup);
  g.userData.anchor = [0, 0, 0.6];
  add('speaker', g, zero, v3(0, 0, -26));
}

// Guitar cable: a chrome jack plug in the input, and the cable away along the floor to the guitar.
const CABLE_PATH = new THREE.CatmullRomCurve3([v3(X.input, KNOB_Y, 21.3), v3(X.input - 1.2, KNOB_Y - 2.2, 25.5), v3(-33, 34, 27), v3(-37, 12, 27), v3(-39, 0.65, 28), v3(-46, 0.65, 33)]);
const CABLE_TAIL = new THREE.CatmullRomCurve3([v3(-46, 0.65, 33), v3(-56, 0.65, 38), v3(-90, 0.65, 50)]);
{
  const g = new THREE.Group();
  g.add(alongZ(cylinder(0.64, 0.64, 4.4, M.chrome, [X.input, KNOB_Y, PANEL_Z + 2.4], { segments: 24 })));
  g.add(alongZ(cylinder(0.7, 0.7, 0.6, M.black, [X.input, KNOB_Y, PANEL_Z + 3.9], { segments: 24 })));
  g.add(alongZ(cylinder(0.62, 0.42, 4.6, M.rubber, [X.input, KNOB_Y, PANEL_Z + 6.9], { segments: 20 })));
  g.add(new THREE.Mesh(new THREE.TubeGeometry(CABLE_PATH, 80, 0.33, 10, false), M.cable));
  g.userData.anchor = [X.input, KNOB_Y, PANEL_Z + 4.5];
  add('cable', g, zero, zero);
}
// Mains cord out of the back, to the floor.
const MAINS_PATH = new THREE.CatmullRomCurve3([v3(25.5, 46.5, -D / 2 - 0.2), v3(26.5, 45, -15), v3(29, 28, -17), v3(31, 4, -18.5), v3(33, 0.65, -21), v3(38, 0.65, -28)]);
const MAINS_TAIL = new THREE.CatmullRomCurve3([v3(38, 0.65, -28), v3(46, 0.65, -37), v3(70, 0.65, -62)]);
{
  const g = new THREE.Group();
  g.add(alongZ(cylinder(0.8, 0.9, 1.4, M.rubber, [25.5, 46.5, -D / 2 - 0.5], { segments: 16 })));
  g.add(new THREE.Mesh(new THREE.TubeGeometry(MAINS_PATH, 60, 0.38, 10, false), M.cable));
  g.userData.anchor = MAINS_PATH.getPointAt(0.3).toArray();
  add('mains', g, zero, zero);
}
// The far ends of both cables fade out (they are not parts, so focus never makes them solid).
function fadingTail(curve, radius) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 4;
  const ctx = c.getContext('2d'), grad = ctx.createLinearGradient(0, 0, 256, 0);
  grad.addColorStop(0, '#fff'); grad.addColorStop(0.15, '#fff'); grad.addColorStop(1, '#000');
  ctx.fillStyle = grad; ctx.fillRect(0, 0, 256, 4);
  const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 60, radius, 10, false),
    new THREE.MeshStandardMaterial({ color: linear(0x1a1b1c), roughness: 0.55, alphaMap: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
  mesh.userData.noContactShadow = true; root.add(mesh);
}
fadingTail(CABLE_TAIL, 0.33); fadingTail(MAINS_TAIL, 0.38);

// Speaker wire from the output transformer down to the speaker's terminals. It follows both when
// they move apart.
const speakerWire = liveTube(M.red, 0.22);
add('speakerWire', speakerWire, zero, zero);
const OT_OUT = v3(OT.x + 1, CH - 5.6, OT.z + 1), SPK_TERM = v3(0, SPK_Y + 9.6, 5.8);
function wireEnds() {
  const a = OT_OUT.clone().add(parts.ot.group.position), b = SPK_TERM.clone().add(parts.speaker.group.position);
  return [a, a.clone().add(v3(0.5, -2.2, 0.8)), b.clone().add(v3(0.4, 2.2, 0.6)), b];
}
speakerWire.userData.set(wireEnds());
speakerWire.userData.anchor = speakerWire.userData.curve.getPointAt(0.5).toArray();

// ---------- Signal path ----------
// The signal as copper dots, one stretch per stage. Each waypoint belongs to a part, so the path
// follows the parts when they explode apart. Bigger dots carry a bigger signal.
const at = (part, x, y, z) => ({ part, p: v3(x, y, z) });
const sock = (x, part) => [at('chassis', x, CH + 0.2, TUBE_Z + 0.4), at(part, x, CH - 2.6, TUBE_Z)];
const cableIn = Array.from({ length: 9 }, (_, i) => CABLE_TAIL.getPointAt(0.45 - i * 0.05)).concat(
  Array.from({ length: 11 }, (_, i) => CABLE_PATH.getPointAt(1 - i / 10))).map(p => at('cable', p.x, p.y, p.z));
const STAGES = [
  { size: 0.9, way: [...cableIn, at('panel', X.input, KNOB_Y, PANEL_Z - 1), at('board', X.input + 1, CH + 1.6, 1), ...sock(TUBES.v1, 'v1')] },
  { size: 1.3, way: [at('v1', TUBES.v1 + 0.5, CH - 2.6, TUBE_Z), at('chassis', TUBES.v1 + 0.4, CH + 0.2, TUBE_Z - 0.3), at('board', -16, CH + 1.7, 3), at('tone', X.treble - 0.4, KNOB_Y + 2.7, PANEL_Z - 1.4), at('tone', X.middle, KNOB_Y + 2.6, PANEL_Z - 1.4)] },
  { size: 1.1, way: [at('tone', X.middle, KNOB_Y + 2.6, PANEL_Z - 1.4), at('tone', X.bass, KNOB_Y + 2.2, PANEL_Z - 1.6), at('board', -6, CH + 1.8, 6.5), at('gain', X.gain, KNOB_Y + 1.6, PANEL_Z - 1), at('board', -17, CH + 1.6, 1), ...sock(TUBES.v2, 'v2')] },
  { size: 1.6, way: [at('v2', TUBES.v2 + 0.5, CH - 2.6, TUBE_Z), at('chassis', TUBES.v2 + 0.5, CH + 0.2, TUBE_Z - 0.3), at('board', -15.2, CH + 1.6, -1), ...sock(TUBES.pi, 'pi')] },
  { size: 1.8, way: [at('pi', TUBES.pi - 0.5, CH - 2.6, TUBE_Z), at('chassis', TUBES.pi, CH + 0.2, TUBE_Z - 0.4), at('board', -9.5, CH + 1.6, -4.5), at('chassis', TUBES.a, CH + 0.2, TUBE_Z - 0.6), at('power', TUBES.a, CH - 6, TUBE_Z)] },
  { size: 1.8, way: [at('pi', TUBES.pi + 0.5, CH - 2.6, TUBE_Z), at('chassis', TUBES.pi + 0.6, CH + 0.2, TUBE_Z + 0.4), at('board', -6.5, CH + 1.6, 0.5), at('chassis', TUBES.b, CH + 0.2, TUBE_Z + 0.6), at('power', TUBES.b, CH - 6, TUBE_Z)] },
  { size: 2.1, way: [at('power', TUBES.a, CH - 6.4, TUBE_Z + 1.2), at('power', TUBES.a + 0.8, CH - 4, 0.6), at('ot', OT.x - 0.6, CH - 2.4, OT.z - 1.5)] },
  { size: 2.1, way: [at('power', TUBES.b, CH - 6.4, TUBE_Z + 1.2), at('power', TUBES.b - 0.8, CH - 4, 0.6), at('ot', OT.x + 0.6, CH - 2.4, OT.z - 1.5)] },
  { size: 2.4, wire: true, way: [at('ot', OT.x, CH - 3, OT.z), at('speaker', 0.6, SPK_Y + 3, 4), at('speaker', 0, SPK_Y, 2.2)] },
];
// Which stretches each step's reach lights: the two plate stretches join the inverter's two.
const STAGE_REACH = [0, 1, 2, 3, 4, 4, 5, 5, 6];
const signalColor = linear(0xd9783a).getHex();
STAGES.forEach(s => {
  s.dots = createParticles(scene, 26, { color: signalColor, size: s.size, map: dot, seed: i => ({ u: (i + Math.random() * 0.7) / 26 }) });
  s.dots.points.frustumCulled = false; s.dots.points.renderOrder = 3;
});
function stageCurve(s) {
  const pts = s.way.map(w => w.p.clone().add(parts[w.part].group.position));
  if (s.wire && speakerWire.userData.curve) {
    const c = speakerWire.userData.curve;
    pts.splice(1, 0, ...[0.05, 0.3, 0.55, 0.8, 1].map(t => c.getPointAt(t)));
  }
  return new THREE.CatmullRomCurve3(pts);
}

// Power from the wall: blue dots down the mains cord, through the transformer and rectifier
// to the filter caps and on to the power tubes.
const POWER_WAY = [...[0.95, 0.75, 0.5, 0.25, 0].map(t => at('mains', ...MAINS_PATH.getPointAt(t).toArray())),
  at('chassis', 24.5, CH + 2, -8), at('pt', 21.5, CH - 1, -4), at('pt', 21.5, CH - 3.2, -0.8), at('chassis', 15, CH + 0.4, -3), at('rectifier', TUBES.rect, CH - 6.4, TUBE_Z),
  at('chassis', 11, CH + 0.4, -2), at('caps', 13.5, CH - 4, -1.9), at('chassis', 5, CH + 0.4, -1), at('power', TUBES.b, CH - 6.4, TUBE_Z + 0.8), at('power', TUBES.a, CH - 6.4, TUBE_Z + 0.8)];
const powerDots = createParticles(scene, 60, { size: 1.6, map: dot, seed: i => ({ u: (i + Math.random() * 0.7) / 60 }) });
powerDots.points.frustumCulled = false; powerDots.points.renderOrder = 3;
const powerCurve = () => new THREE.CatmullRomCurve3(POWER_WAY.map(w => w.p.clone().add(parts[w.part].group.position)));

// Electrons in V1: from each cathode out to the plates on both sides, thicker when the grid lets more through.
const electrons = createParticles(v1, 240, {
  size: 0.2, map: dot,
  seed: () => ({ unit: Math.random() < 0.5 ? -1 : 1, side: Math.random() < 0.5 ? -1 : 1, h: Math.random() * 2 - 1, j: Math.random() * 2 - 1, p: Math.random(), v: 0.7 + Math.random() * 0.6 }),
});
electrons.points.frustumCulled = false; electrons.points.renderOrder = 4;
// Electrons and power are drawn in the blueprint colour of the theme: ink blue on paper, pale blue on navy.
onPalette(p => { electrons.material.color.set(p.ghost).convertSRGBToLinear(); powerDots.material.color.set(p.ghost).convertSRGBToLinear(); });

// ---------- State and UI ----------
const state = { step: 0, explode: 0, targetExplode: 0, playing: true, focus: [], cut: false, probe: 'input', reach: 0, t: 0, u: 0, gain: KNOBS.gain };
const shown = { gain: KNOBS.gain, reach: -1, explode: -1, wave: 0 };
const tones = toneResponse(KNOBS);
let knobsNow = { ...KNOBS }, drive = overdrive(knobsNow, AMP, tones);
const gainInput = document.getElementById('gain');
function setGain(v) {
  state.gain = v; knobsNow = { ...KNOBS, gain: v }; drive = overdrive(knobsNow, AMP, tones);
  gainInput.value = String(v); showRange(gainInput, String(v));
}
let camGoal = null;
// The views are framed for a desktop stage (about 1.15 wide to 1 high). A narrower stage pulls the
// camera back; on phones the title and buttons cover the top and bottom, so the amp also sits lower.
function fit() {
  const c = stage.renderer.domElement, a = c.clientWidth / Math.max(1, c.clientHeight);
  const small = globalThis.matchMedia?.('(max-width: 800px)').matches;
  return { zoom: Math.min(1.7, Math.max(1, 1.15 / a)) * (small ? 1.25 : 1), lift: small ? 0.07 : 0 };
}
const story = createStoryUI({
  story: AMP_STORY, state,
  onStep: s => {
    state.focus = s.focus; state.cut = s.cut; state.hide = s.hide ?? []; state.probe = s.probe; state.reach = s.reach;
    if (s.gain) setGain(s.gain);
    const v = VIEWS[s.view], f = fit(), r = v.r * f.zoom;
    camGoal = { ...v, r, target: new THREE.Vector3(...v.target).add(v3(0, r * f.lift, 0)) };
    cam.theta = v.theta + THREE.MathUtils.euclideanModulo(cam.theta - v.theta + Math.PI, 2 * Math.PI) - Math.PI; // take the short way round
  },
});
bindRange('gain', v => setGain(v));
createCallouts(stage, { parts, state, story: AMP_STORY });

// cut: true clears every cutaway shell and fades the parts out of focus; a list clears only those
// parts and keeps the rest of the amp solid. hide leaves parts out of a close-up altogether.
const clears = name => state.cut === true || (Array.isArray(state.cut) && state.cut.includes(name));
const focusStyle = {
  highlight: 0.16,
  opacity(name, mesh, hot) {
    if (state.hide?.includes(name)) return 0;
    let alpha = mesh.userData.alpha0 ?? 1;
    if (mesh.userData.cutaway && clears(name)) alpha = Math.min(alpha, hot ? 0.3 : name === 'cabinet' ? 0.07 : 0.12);
    if (state.focus.length && !hot && (state.cut === true || state.explode > 0.12) && !mesh.userData.glass) alpha = Math.min(alpha, 0.3);
    return alpha;
  },
};

// ---------- Readout ----------
// Where the scope is clipped on, the signal there, the power reaching the speaker, and two cycles
// of the wave at that point. Each probe has a fixed scale, so a strum can be seen fading.
const $ = id => document.getElementById(id);
const R = { box: $('readout'), probe: $('r-probe'), level: $('r-level'), watts: $('r-watts'), range: $('r-range'), a: document.querySelector('#r-trace .a'), b: document.querySelector('#r-trace .b') };
const fmt = (v, unit) => `${v >= 100 ? Math.round(v) : v >= 10 ? v.toFixed(0) : v >= 1 ? v.toFixed(1) : v.toFixed(2)} ${unit}`;
const PROBES = {
  input: { name: 'Input jack', lo: -0.4, hi: 0.4, unit: 'V', range: '±0.4 V', read: c => c.input },
  v1: { name: 'V1 plate', lo: -25, hi: 25, unit: 'V', range: '±25 V', read: c => c.v1 },
  tone: { name: 'Tone stack', lo: -12, hi: 12, unit: 'V', range: '±12 V', read: c => c.tone },
  v2: { name: 'V2 plate', lo: -110, hi: 110, unit: 'V', range: '±110 V', read: c => c.v2 },
  supply: { name: 'B+ rail', lo: 420, hi: 460, unit: 'V DC', range: '420 to 460 V' },
  plates: { name: '6L6 plates', lo: 0, hi: 0.25, unit: 'mA', range: '0 to 250 mA', read: c => c.ia, readB: c => c.ib },
  ot: { name: 'Speaker wires', lo: -24, hi: 24, unit: 'V', range: '±24 V', read: c => c.vs },
  speaker: { name: 'Voice coil', lo: -3, hi: 3, unit: 'A', range: '±3 A', read: c => c.is },
};
const TRACE_N = 200;
const y = (v, p) => (54 - 48 * clamp01((v - p.lo) / (p.hi - p.lo))).toFixed(1);
function showReadout(level, watts) {
  const p = PROBES[state.probe], a = [], b = [];
  let peak = 0, grid = 0;
  if (state.probe === 'supply') {
    const amps = AMP.idleA + 0.12 * watts / AMP.power.ratedW;
    for (let i = 0; i <= TRACE_N; i++) a.push(`${i * 2},${y(bPlus(0.03 * i / TRACE_N, amps), p)}`);
    R.level.textContent = `${Math.round(bPlusAverage(amps))} V DC`;
  } else {
    for (let i = 0; i <= TRACE_N; i++) {
      const c = chain(2 * i / TRACE_N, level, knobsNow, AMP, tones), v = p.read(c);
      peak = Math.max(peak, Math.abs(v), p.readB ? p.readB(c) : 0); grid = Math.max(grid, Math.abs(c.grid2));
      a.push(`${i * 2},${y(v, p)}`);
      if (p.readB) b.push(`${i * 2},${y(p.readB(c), p)}`);
    }
    R.level.textContent = p.unit === 'mA' ? `${Math.round(peak * 1000)} mA` : fmt(peak, p.unit);
  }
  R.probe.textContent = p.name; R.range.textContent = p.range;
  R.watts.textContent = `${watts < 10 ? watts.toFixed(1) : Math.round(watts)} W`;
  R.a.setAttribute('points', a.join(' ')); R.b.setAttribute('points', b.join(' '));
  R.box.classList.toggle('hot', state.probe === 'v2' && grid > headroom()); // V2 is clipping
}

// ---------- Sound ----------
// Each strum plays an A power chord. The cleaner the amp, the softer the wave: a triangle when
// clean, a sawtooth when it starts to break up, a square when it is clipping hard.
const hum = sound.loop({ type: 'tone', wave: 'sine', freq: 100 });
const was = { count: -1 };
function chord() {
  const type = drive < 0.8 ? 'triangle' : drive < 1.6 ? 'sawtooth' : 'square';
  const gain = type === 'triangle' ? 0.09 : type === 'sawtooth' ? 0.045 : 0.03;
  [110, 164.81, 220].forEach((freq, i) => {
    sound.tone({ freq, type, gain, attack: 0.006, release: 1.8, delay: i * 0.014 });
    sound.tone({ freq: freq * 1.003, type, gain: gain * 0.5, attack: 0.006, release: 1.4, delay: i * 0.014 + 0.004 });
  });
  sound.noise({ gain: 0.05, release: 0.03, freq: 3200, q: 1.2 }); // the pick
}

// ---------- Frame ----------
const tmp = new THREE.Vector3();
const snap = reduced || stage.capture; // ?capture renders stills, so it skips every ease
const VIS_HZ = 1.6; // the wave on screen, slowed down from 110 Hz so the eye can follow it
let readoutTimer = 0;
const curves = [];
let power = null;
startLoop(stage, (dt, now) => {
  update(state, focusStyle, snap ? 1 : 0.09, dt);
  if (camGoal) { // ease to the step's view once; after that the reader's own zoom wins
    const k = snap ? 1 : Math.min(1, dt * 3);
    for (const a of ['r', 'theta', 'phi']) cam[a] += (camGoal[a] - cam[a]) * k;
    cam.target.lerp(camGoal.target, k);
    if (Math.abs(camGoal.r - cam.r) < 0.5 && Math.abs(camGoal.theta - cam.theta) < 0.01 && cam.target.distanceTo(camGoal.target) < 0.2) camGoal = null;
  }
  if (state.playing) { state.t = Math.max(0, state.t + dt); state.u = wrap(state.u + dt * VIS_HZ); }
  const s = strum(state.t), level = s.level;
  const c = chain(state.u, level, knobsNow, AMP, tones);

  // Knobs and the cone.
  shown.gain += (state.gain - shown.gain) * (snap ? 1 : Math.min(1, dt * 6));
  gainKnob.rotation.z = -deg(knobAngle(shown.gain));
  coneGroup.position.z = 0.9 * c.vs / 22;

  // Wires and paths follow the parts as they explode apart.
  const moved = Math.abs(state.explode - shown.explode) > 0.002 || parts.speaker.group.position.z !== shown.spkZ;
  if (moved) {
    shown.explode = state.explode; shown.spkZ = parts.speaker.group.position.z;
    speakerWire.userData.set(wireEnds());
    STAGES.forEach((st, i) => { curves[i] = stageCurve(st); });
    power = powerCurve();
  }

  // Signal dots: each stretch lights up as the story reaches it, and swells with each strum.
  // They keep about the same size on screen however close the camera is.
  const fade = Math.min(1, dt * 6), scale = cam.r / 80;
  STAGES.forEach((st, i) => {
    const on = STAGE_REACH[i] <= state.reach && state.probe !== 'supply' || (state.probe === 'supply' && STAGE_REACH[i] <= 3);
    const target = on ? (state.probe === 'supply' ? 0.35 : 0.95) * (0.5 + 0.5 * level) : 0;
    if (!st.dots.fade(target, snap ? 1 : fade)) return;
    st.dots.material.size = st.size * scale * (0.75 + 0.45 * level);
    const len = curves[i].getLength();
    st.dots.seeds.forEach((d, j) => {
      if (state.playing && !reduced) d.u = wrap(d.u + dt * 12 / len);
      curves[i].getPointAt(d.u, tmp); st.dots.place(j, tmp.x, tmp.y, tmp.z);
    });
    st.dots.commit();
  });
  if (powerDots.fade(state.probe === 'supply' ? 0.9 : 0, snap ? 1 : fade)) {
    const len = power.getLength();
    powerDots.material.size = 1.6 * scale;
    powerDots.seeds.forEach((d, j) => {
      if (state.playing && !reduced) d.u = wrap(d.u + dt * 16 / len);
      power.getPointAt(d.u, tmp); powerDots.place(j, tmp.x, tmp.y, tmp.z);
    });
    powerDots.commit();
  }

  // Electrons in V1, while the step looks inside it. The grid's signal speeds them up and slows them down.
  const flow = clamp01((1 + 1.78 * c.input) / 1.6); // plate current against its peak: 1.6 mA/V on 0.9 mA idle
  if (electrons.fade(state.focus.includes('v1') ? 0.85 * (0.55 + 0.45 * flow) : 0, snap ? 1 : fade)) {
    electrons.seeds.forEach((d, j) => {
      if (state.playing && !reduced) { d.p = Math.max(0, d.p + dt * d.v * (0.35 + 0.65 * flow) * 0.9); if (d.p > 1) { d.p -= 1; d.h = Math.random() * 2 - 1; d.j = Math.random() * 2 - 1; } }
      electrons.place(j, d.unit * 0.5 + d.j * 0.3, ELECTRODE_Y + d.h * 0.78, d.side * (0.07 + 0.22 * d.p));
    });
    electrons.commit();
  }

  // The power tubes glow faintly blue as they work hard: the plate current makes the glass fluoresce.
  blueGlows[0].material.opacity = 0.55 * clamp01((c.ia - 0.05) / 0.17);
  blueGlows[1].material.opacity = 0.55 * clamp01((c.ib - 0.05) / 0.17);
  heaterGlows.forEach((h, i) => { h.material.opacity = h.userData.base * (0.92 + 0.08 * Math.sin(now / 900 + i)); });

  // Sound: a chord on every strum, and mains hum while the step is on the power supply.
  const on = state.playing ? 1 : 0;
  if (s.count !== was.count) { if (on && was.count >= 0) chord(); was.count = s.count; }
  hum.set(state.probe === 'supply' ? 0.02 * on : 0);

  readoutTimer -= dt;
  if (readoutTimer <= 0) { showReadout(level, outputWatts(level, knobsNow, AMP, tones, 60)); readoutTimer = 0.1; }
});
story.setStep(0, false);
