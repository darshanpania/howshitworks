import * as THREE from 'three';
import { createStage, addFloor, addStudioLights } from '../../src/engine/stage.js';
import { createParts, looksInside } from '../../src/engine/parts.js';
import { createCallouts } from '../../src/engine/callouts.js';
import { createStoryUI, bindRange, showRange } from '../../src/engine/story-ui.js';
import { sound } from '../../src/engine/sound.js';
import { startLoop, reducedMotion as reduced } from '../../src/engine/loop.js';
import { box, cylinder, lathe, roundedRect, coilGeometry } from '../../src/kit/shapes.js';
import { createMaterials } from '../../src/kit/materials.js';
import { softDot, createParticles } from '../../src/kit/effects.js';
import { MICROWAVE_STORY } from './story.js';
import { OVEN, createSim, stepOven, clock, wavelengthM, bouncePath, pathLength } from './physics.js';

// ---------- Stage and light ----------
// Scale: 1 unit = 10 cm. The oven is 48 cm wide, 28 cm tall and 38 cm deep with its door.
// The turntable turns about the y axis; the door is at +z, the electronics bay at +x.
const VIEWS = {
  front: { r: 10.4, theta: 0.75, phi: 1.12, target: [0.6, -0.4, 0] },
  bay: { r: 8, theta: 0.95, phi: 1.05, target: [1.4, -0.45, -0.3] },
  magnetron: { r: 6.6, theta: 0.85, phi: 1.2, target: [2.2, 0.35, 0.2] },
  guide: { r: 6.6, theta: 0.22, phi: 1.12, target: [0.85, 0.15, -0.3] },
  cavity: { r: 9.5, theta: -0.35, phi: 0.95, target: [-0.7, -0.5, 0.1] },
  mug: { r: 5.8, theta: -0.3, phi: 1.08, target: [-0.7, -0.1, 0] },
  door: { r: 12, theta: 0.62, phi: 1.12, target: [0.1, -0.2, 0.5] },
};
const stage = createStage(document.getElementById('c'), {
  fov: 36, pbr: true, camera: VIEWS.front, zoom: [4.5, 17], phiLimit: 0.25,
});
const { scene, cam } = stage;
addStudioLights(stage, { key: [4, 8, 6], extent: 5, far: 25 });
const FLOOR_Y = -1.46;
addFloor(stage, FLOOR_Y, { size: 14, opacity: 0.16, height: 4 });

// ---------- Materials ----------
const M = createMaterials({
  body: { look: 'brushed', color: 0xc8cdd3 },
  enamel: { color: 0xe8e5de, metalness: 0.1, roughness: 0.55 },
  face: { color: 0x16191d, metalness: 0.35, roughness: 0.28 },
  key: { color: 0x2b3138, metalness: 0.2, roughness: 0.5 },
  start: { color: 0xc4703a, metalness: 0.3, roughness: 0.4 },
  plastic: 'plastic', dark: 'dark', steel: 'steel', brushed: 'brushed', alu: 'aluminium',
  iron: 'iron', copper: 'copper', brass: 'brass', wire: 'wire',
  enamelWire: { color: 0x8a3b1e, metalness: 0.5, roughness: 0.45 },
  ferrite: { color: 0x5d6168, metalness: 0.2, roughness: 0.8 },
  mica: { color: 0xc9a46a, metalness: 0, roughness: 0.4 },
  cream: { color: 0xece6d8, roughness: 0.6 },
  glass: { color: 0xcfe6e0, metalness: 0, roughness: 0.05 },
  mug: { color: 0x2f7d7a, roughness: 0.3 },
  mugIn: { color: 0xf1ede5, roughness: 0.35 },
  water: { color: 0x4f8fd0, metalness: 0, roughness: 0.1 },
  oxygen: { color: 0xd8483a, roughness: 0.4 },
  hydrogen: { color: 0xf2f2ef, roughness: 0.4 },
  arrow: { color: 0xc4703a, metalness: 0.3, roughness: 0.4 },
}, { pbr: true });

// ---------- Parts ----------
const CAV = { x0: -1.5, x1: 1.5, y0: -1.15, y1: 0.95, z0: -1.6, z1: 1.6 }; // the cooking cavity, 30 × 21 × 32 cm
const CASE = { x0: -1.7, x1: 3.1, y0: -1.4, y1: 1.4, z0: -1.85, z1: 1.65 };
const TT_TOP = -1.0125; // top of the glass tray
const MAG = new THREE.Vector3(1.96, 0, -0.35); // where the magnetron meets the waveguide
const root = new THREE.Group(); root.position.x = -0.7; scene.add(root); // centre the oven on the turntable stage
const spin = new THREE.Group(); root.add(spin); // the tray and everything on it
const rollerSpin = new THREE.Group(); root.add(rollerSpin); // the roller ring turns at half the tray's speed
const doorPivot = new THREE.Group(); doorPivot.position.set(CASE.x0, 0, CASE.z1 + 0.125); root.add(doorPivot);
const { parts, add, update } = createParts(root, { shadows: true, lively: true });
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const cutaway = mesh => { mesh.userData.cutaway = true; return mesh; };

// Outer shell (lifts off) and the base plate it sits on.
{
  const g = new THREE.Group(), t = 0.05;
  const W = CASE.x1 - CASE.x0, H = CASE.y1 - CASE.y0, D = CASE.z1 - CASE.z0;
  const cx = (CASE.x0 + CASE.x1) / 2, cz = (CASE.z0 + CASE.z1) / 2;
  g.add(cutaway(box([W, t, D], M.body, [cx, CASE.y1 - t / 2, cz], 0.02)));
  g.add(cutaway(box([t, H - t, D], M.body, [CASE.x0 + t / 2, -t / 2, cz], 0.02)));
  g.add(cutaway(box([t, H - t, D], M.body, [CASE.x1 - t / 2, -t / 2, cz], 0.02)));
  g.add(cutaway(box([W, H - t, t], M.body, [cx, -t / 2, CASE.z0 + t / 2], 0.02)));
  for (let i = 0; i < 9; i++) g.add(cutaway(box([0.012, 0.55, 0.06], M.dark, [CASE.x1 + 0.002, 0.55, -1.45 + i * 0.13], 0))); // vent slots
  add('case', g, V(), V(0, 2.6, -0.3));

  const base = new THREE.Group();
  base.add(box([W, t, D], M.dark, [cx, CASE.y0 + t / 2, cz], 0.015));
  for (const [x, z] of [[CASE.x0 + 0.3, CASE.z0 + 0.3], [CASE.x1 - 0.3, CASE.z0 + 0.3], [CASE.x0 + 0.3, CASE.z1 - 0.3], [CASE.x1 - 0.3, CASE.z1 - 0.3]]) {
    base.add(cylinder(0.12, 0.14, 0.06, M.dark, [x, CASE.y0 - 0.03, z], { segments: 20 }));
  }
  add('base', base, V(), V());
}

// The cooking cavity: an open-fronted steel box, painted inside, with a flange around the opening.
{
  const g = new THREE.Group(), t = 0.03;
  const W = CAV.x1 - CAV.x0, H = CAV.y1 - CAV.y0, D = CAV.z1 - CAV.z0, cy = (CAV.y0 + CAV.y1) / 2;
  g.add(cutaway(box([W + 2 * t, t, D], M.enamel, [0, CAV.y0 - t / 2, 0], 0)));
  g.add(cutaway(box([W + 2 * t, t, D], M.enamel, [0, CAV.y1 + t / 2, 0], 0)));
  g.add(cutaway(box([t, H, D], M.enamel, [CAV.x0 - t / 2, cy, 0], 0)));
  g.add(cutaway(box([t, H, D], M.enamel, [CAV.x1 + t / 2, cy, 0], 0)));
  g.add(cutaway(box([W + 2 * t, H, t], M.enamel, [0, cy, CAV.z0 - t / 2], 0)));
  const f = 0.15, fz = CAV.z1 + 0.02;
  g.add(cutaway(box([W + 2 * f, f, 0.04], M.enamel, [0, CAV.y1 + f / 2, fz], 0.01)));
  g.add(cutaway(box([W + 2 * f, f, 0.04], M.enamel, [0, CAV.y0 - f / 2, fz], 0.01)));
  g.add(cutaway(box([f, H, 0.04], M.enamel, [CAV.x0 - f / 2, cy, fz], 0.01)));
  g.add(cutaway(box([f, H, 0.04], M.enamel, [CAV.x1 + f / 2, cy, fz], 0.01)));
  g.userData.anchor = [CAV.x0 + 0.02, cy + 0.3, -0.2]; // on the left wall, which faces the reader
  add('cavity', g, V(), V());
}

// The door: a dark frame round a window, with a perforated metal screen behind the glass.
// It hangs on a hinge at the left edge; the latch hooks on its right edge reach into the case.
function perforation(pitch, w, h) {
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, 32, 32);
  g.fillStyle = '#000'; // black in the alpha map = a hole
  for (const [x, y] of [[16, 16], [0, 0], [32, 0], [0, 32], [32, 32]]) { g.beginPath(); g.arc(x, y, 10, 0, Math.PI * 2); g.fill(); }
  const tex = new THREE.CanvasTexture(c); tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(w / pitch, h / pitch); tex.anisotropy = 4;
  return tex;
}
const DOOR = { w: 3.35, h: 2.8, d: 0.25, win: { cx: 1.45, w: 2.45, h: 1.9 } };
{
  const g = new THREE.Group();
  const shape = roundedRect(DOOR.w, DOOR.h, 0.06, DOOR.w / 2, 0);
  shape.holes.push(roundedRect(DOOR.win.w, DOOR.win.h, 0.08, DOOR.win.cx, 0, new THREE.Path()));
  const frame = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: DOOR.d, bevelEnabled: false, curveSegments: 6 }).translate(0, 0, -DOOR.d / 2), M.face);
  g.add(cutaway(frame));
  const glass = box([DOOR.win.w, DOOR.win.h, 0.01], M.glass, [DOOR.win.cx, 0, DOOR.d / 2 - 0.03], 0);
  glass.userData.glass = true; glass.userData.noGhost = true; glass.userData.noShadow = true; g.add(glass);
  // A real screen has holes about 1 mm across; these are drawn 2 mm so they show up close.
  const screenMat = new THREE.MeshStandardMaterial({ color: 0x1b1f24, metalness: 0.55, roughness: 0.45, side: THREE.DoubleSide, transparent: true });
  screenMat.color.convertSRGBToLinear();
  screenMat.alphaMap = perforation(0.03, DOOR.win.w, DOOR.win.h);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(DOOR.win.w, DOOR.win.h), screenMat);
  screen.position.set(DOOR.win.cx, 0, -DOOR.d / 2 + 0.04); screen.userData.screen = true; screen.userData.noShadow = true; g.add(cutaway(screen));
  const handle = box([0.09, 1.7, 0.08], M.brushed, [DOOR.w - 0.28, 0, DOOR.d / 2 + 0.16], 0.03);
  g.add(cutaway(handle));
  for (const y of [-0.7, 0.7]) g.add(cutaway(box([0.07, 0.1, 0.16], M.brushed, [DOOR.w - 0.28, y, DOOR.d / 2 + 0.07], 0.02)));
  g.userData.anchor = [DOOR.win.cx - 0.5, 0.45, -DOOR.d / 2 + 0.04];
  add('door', g, V(), V(0, 0, 1.6), doorPivot);

  const latch = new THREE.Group();
  for (const y of [0.75, -0.75]) {
    latch.add(cutaway(box([0.05, 0.12, 0.34], M.cream, [DOOR.w - 0.12, y, -DOOR.d / 2 - 0.15], 0.015)));
    latch.add(cutaway(box([0.05, 0.08, 0.08], M.cream, [DOOR.w - 0.12, y - 0.07, -DOOR.d / 2 - 0.28], 0.015)));
  }
  latch.userData.anchor = [DOOR.w - 0.12, 0.75, -DOOR.d / 2 - 0.2];
  add('latch', latch, V(), V(0, 0, 1.6), doorPivot);
}

// Interlock switches behind the flange, pressed by the latch hooks. The third one is the monitor switch.
{
  const g = new THREE.Group();
  for (const y of [0.78, 0.5, -0.72]) {
    g.add(cutaway(box([0.12, 0.2, 0.24], M.dark, [1.62, y, 1.36], 0)));
    g.add(cutaway(box([0.05, 0.05, 0.06], M.cream, [1.62, y, 1.5], 0)));
  }
  add('switches', g, V(), V(0.5, 0, 0.6));
}

// Control panel: a timer display, a keypad and a Start button.
const display = { canvas: document.createElement('canvas'), text: '' };
display.canvas.width = 256; display.canvas.height = 96;
const displayTex = new THREE.CanvasTexture(display.canvas); displayTex.encoding = THREE.sRGBEncoding;
function drawDisplay(text, lit) {
  if (`${text}|${lit}` === display.text) return;
  display.text = `${text}|${lit}`;
  const g = display.canvas.getContext('2d');
  g.fillStyle = '#0c1411'; g.fillRect(0, 0, 256, 96);
  g.fillStyle = lit ? '#7ff0c4' : '#2c5a4a'; g.font = '600 64px ui-monospace, Menlo, Consolas, monospace';
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 128, 52);
  displayTex.needsUpdate = true;
}
{
  const g = new THREE.Group(), cx = (1.65 + CASE.x1) / 2, front = CASE.z1 + DOOR.d;
  g.add(cutaway(box([CASE.x1 - 1.65, CASE.y1 - CASE.y0, DOOR.d], M.face, [cx, 0, front - DOOR.d / 2], 0.05)));
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.375), new THREE.MeshBasicMaterial({ map: displayTex, toneMapped: false }));
  screen.position.set(cx, 0.92, front + 0.003); screen.userData.noShadow = true; screen.userData.display = true; g.add(cutaway(screen));
  for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) g.add(cutaway(box([0.27, 0.16, 0.04], M.key, [cx + (c - 1) * 0.35, 0.42 - r * 0.24, front + 0.02], 0.02)));
  g.add(cutaway(box([0.97, 0.26, 0.05], M.start, [cx, -0.68, front + 0.02], 0.03)));
  add('panel', g, V(), V(0.6, 0, 1.2));
}

// High-voltage transformer: a stack of iron laminations with a copper primary and a thinner,
// many-turn secondary. Real ones weigh about 3 kg.
{
  const g = new THREE.Group();
  for (let i = 0; i < 9; i++) g.add(box([0.95, 0.75, 0.056], M.iron, [0, 0, -0.25 + i * 0.0625], 0));
  g.add(box([0.5, 0.25, 0.85], M.copper, [0, -0.15, 0], 0.06));
  g.add(box([0.5, 0.25, 0.85], M.enamelWire, [0, 0.15, 0], 0.06));
  g.add(box([0.52, 0.035, 0.6], M.steel, [0, 0, 0], 0)); // magnetic shunt between the coils
  g.add(box([1.15, 0.03, 0.62], M.steel, [0, -0.39, 0], 0.01)); // mounting feet
  for (const x of [-0.12, 0.12]) g.add(box([0.05, 0.08, 0.015], M.brass, [x, -0.2, 0.44], 0));
  add('transformer', g, V(2.37, -0.97, -1.0), V(1.0, 0, -0.4));
}

// High-voltage capacitor (about 1 µF, oval can) and diode: together they double the voltage.
{
  const g = new THREE.Group();
  const can = cylinder(0.2, 0.2, 0.85, M.brushed, [0, 0, 0], { segments: 32 });
  can.scale.z = 0.7; can.rotation.z = Math.PI / 2; g.add(can);
  for (const z of [-0.06, 0.06]) g.add(box([0.06, 0.07, 0.02], M.brass, [0.46, 0.04, z], 0));
  add('capacitor', g, V(2.37, -1.15, 0.55), V(1.0, 0, 0.7));

  const diode = new THREE.Group();
  const body = cylinder(0.045, 0.045, 0.26, M.dark, [0, 0, 0], { segments: 16 }); body.rotation.z = Math.PI / 2; diode.add(body);
  const band = cylinder(0.047, 0.047, 0.04, M.steel, [0, 0, 0], { segments: 16 }); band.rotation.z = Math.PI / 2; band.position.x = 0.09; diode.add(band);
  const lead = cylinder(0.008, 0.008, 0.5, M.steel, [0, 0, 0], { segments: 6 }); lead.rotation.z = Math.PI / 2; diode.add(lead);
  add('diode', diode, V(1.75, -1.1, 0.55), V(0.6, 0.4, 0.9));
}

// Wires: mains to the transformer, high voltage on to the capacitor and the magnetron.
{
  const g = new THREE.Group();
  const tube = (pts, mat, r = 0.018) => g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(p => V(...p))), 40, r, 6), mat));
  tube([[2.2, 0.4, 1.4], [2.6, -0.2, 1.0], [2.15, -0.5, -0.4], [2.25, -0.75, -0.55]], M.dark);
  tube([[2.5, -0.6, -0.75], [2.75, -0.45, -0.2], [2.9, -0.9, 0.3], [2.83, -1.1, 0.55]], M.wire);
  tube([[2.84, -1.05, 0.5], [2.98, -0.5, 0.1], [2.95, 0.05, -0.3], [2.92, 0.1, -0.33]], M.wire);
  add('wires', g, V(), V());
}

// The waveguide: a rectangular duct (86 × 43 mm inside) on the cavity wall, with a mica cover over its outlet.
{
  const g = new THREE.Group();
  const wall = (size, pos) => box(size, M.brushed, pos, 0);
  g.add(wall([0.02, 1.42, 0.86], [1.95, 0.21, MAG.z])); // the magnetron side
  g.add(wall([0.43, 0.02, 0.86], [1.745, 0.91, MAG.z]));
  g.add(wall([0.43, 0.02, 0.86], [1.745, -0.49, MAG.z]));
  g.add(wall([0.43, 1.42, 0.02], [1.745, 0.21, MAG.z - 0.42]));
  g.add(cutaway(wall([0.43, 1.42, 0.02], [1.745, 0.21, MAG.z + 0.42]))); // the side toward the reader opens in a cutaway
  g.userData.anchor = [1.85, 0.45, MAG.z + 0.42];
  g.add(box([0.015, 0.38, 0.62], M.mica, [CAV.x1 - 0.008, 0.66, MAG.z], 0));
  add('waveguide', g, V(), V(0.35, 0, 0));
}

// The magnetron, along +x from the waveguide: a steel yoke round a stack of aluminium fins,
// two ferrite ring magnets, the copper anode inside the fins, and the antenna dome.
const anodeAxis = Math.PI / 2; // rotates a y-axis lathe to run along x
{
  const g = new THREE.Group();
  g.add(box([0.04, 1.05, 1.05], M.steel, [0.02, 0, 0], 0));
  g.add(box([0.04, 0.9, 0.9], M.steel, [0.66, 0, 0], 0));
  for (const y of [-0.43, 0.43]) g.add(box([0.64, 0.04, 0.9], M.steel, [0.34, y, 0], 0));
  for (let i = 0; i < 7; i++) g.add(box([0.012, 0.8, 0.8], M.alu, [0.2 + i * 0.05, 0, 0], 0));
  g.add(box([0.25, 0.5, 0.45], M.steel, [0.82, 0, 0], 0.02)); // filter box
  for (const z of [-0.1, 0.1]) { const t = cylinder(0.03, 0.03, 0.08, M.brass, [0.98, 0.1, z], { segments: 10 }); t.rotation.z = anodeAxis; g.add(t); }
  g.userData.anchor = [0.35, 0.1, 0.4];
  add('magnetron', g, MAG.clone(), V(1.4, 0.2, 0));

  const magnets = new THREE.Group();
  for (const x of [0.11, 0.58]) {
    const ring = lathe([[0.15, -0.045], [0.33, -0.045], [0.33, 0.045], [0.15, 0.045], [0.15, -0.045]], M.ferrite, { segments: 48 });
    ring.rotation.z = anodeAxis; ring.position.x = x; magnets.add(ring);
  }
  magnets.userData.anchor = [0.11, 0.3, 0.12];
  add('magnets', magnets, MAG.clone(), V(1.4, 1.7, 0));

  const antenna = new THREE.Group();
  const stem = cylinder(0.07, 0.07, 0.16, M.steel, [-0.08, 0, 0], { segments: 20 }); stem.rotation.z = anodeAxis; antenna.add(stem);
  const cap = cylinder(0.09, 0.085, 0.06, M.steel, [-0.19, 0, 0], { segments: 20 }); cap.rotation.z = anodeAxis; antenna.add(cap);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.06, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), M.steel);
  dome.rotation.z = anodeAxis; dome.position.x = -0.22; antenna.add(dome);
  add('antenna', antenna, MAG.clone(), V(0.9, 0.2, 0));
}

// The anode: a copper ring with ten vanes pointing in, and the cathode coil on the axis.
// Pulled out of the magnetron it turns toward the reader and grows, like a part under a lens.
const vanes = [];
let cathode;
const anode = new THREE.Group();
{
  const ring = lathe([[0.13, -0.15], [0.2, -0.15], [0.2, 0.15], [0.13, 0.15], [0.13, -0.15]], M.copper, { segments: 48 });
  ring.rotation.z = anodeAxis; anode.add(ring);
  for (let i = 0; i < 10; i++) {
    const a = i / 10 * Math.PI * 2;
    const vane = box([0.3, 0.065, 0.022], M.copper, [0, Math.cos(a) * 0.1, Math.sin(a) * 0.1], 0);
    vane.rotation.x = a; anode.add(vane); vanes.push(vane);
  }
  cathode = new THREE.Mesh(coilGeometry({ length: 0.3, turns: 9, radius: 0.026, wire: 0.007, axis: 'x' }), new THREE.MeshBasicMaterial({ color: 0x3a3d42 }));
  cathode.userData.noShadow = true; anode.add(cathode);
  add('anode', anode, V(MAG.x + 0.35, MAG.y, MAG.z), V(1.4, 0.35, 2.0));
}

// Cooling fan behind the magnetron, blowing forward through its fins.
const fanBlades = new THREE.Group();
{
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.03, 8, 40), M.plastic));
  const hub = cylinder(0.09, 0.09, 0.12, M.plastic, [0, 0, 0], { segments: 20 }); hub.rotation.x = Math.PI / 2; fanBlades.add(hub);
  for (let i = 0; i < 5; i++) {
    const blade = box([0.28, 0.13, 0.012], M.plastic, [0, 0, 0], 0);
    const arm = new THREE.Group(); arm.rotation.z = i / 5 * Math.PI * 2;
    blade.position.x = 0.23; blade.rotation.x = 0.5; arm.add(blade); fanBlades.add(arm);
  }
  g.add(fanBlades);
  const motor = cylinder(0.15, 0.15, 0.18, M.steel, [0, 0, -0.16], { segments: 24 }); motor.rotation.x = Math.PI / 2; g.add(motor);
  g.add(box([0.06, 0.06, 0.25], M.steel, [0, -0.3, -0.18], 0.01));
  g.userData.anchor = [0.22, 0.22, 0.02];
  add('fan', g, V(2.31, 0, -1.42), V(0.8, 0.3, -0.6));
}

// Turntable motor under the floor (about 3 W, 5 rpm) and the coupler it drives.
{
  const g = new THREE.Group();
  g.add(cylinder(0.22, 0.22, 0.12, M.steel, [0, -0.02, 0], { segments: 28 }));
  g.add(cylinder(0.17, 0.17, 0.05, M.dark, [0, 0.06, 0], { segments: 28 }));
  g.add(cylinder(0.025, 0.025, 0.2, M.steel, [0, 0.16, 0], { segments: 8 }));
  add('motor', g, V(0, -1.27, 0), V(0, 0, 1.2));
}

// Glass tray on a roller ring. The coupler on its underside keys onto the motor shaft.
{
  const plate = new THREE.Group();
  const glass = cylinder(1.35, 1.35, 0.035, M.glass, [0, TT_TOP - 0.0175, 0], { segments: 72 });
  glass.userData.glass = true; glass.userData.noGhost = true; plate.add(glass);
  for (let i = 0; i < 3; i++) {
    const lobe = box([0.24, 0.05, 0.07], M.cream, [0, TT_TOP - 0.06, 0], 0.015);
    lobe.rotation.y = i / 3 * Math.PI; plate.add(lobe);
  }
  plate.userData.anchor = [-0.9, TT_TOP, 0.75];
  add('turntable', plate, V(), V(0, 0.45, 0), spin);

  const rollers = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.015, 6, 64), M.plastic); ring.rotation.x = Math.PI / 2; ring.position.y = -1.1; rollers.add(ring);
  for (let i = 0; i < 3; i++) {
    const a = i / 3 * Math.PI * 2;
    const wheel = cylinder(0.05, 0.05, 0.04, M.plastic, [Math.cos(a) * 0.75, -1.1, Math.sin(a) * 0.75], { segments: 16 });
    wheel.rotation.order = 'YXZ'; wheel.rotation.y = -a; wheel.rotation.z = Math.PI / 2; rollers.add(wheel);
  }
  add('rollers', rollers, V(), V(0, 0.2, 0), rollerSpin);
}

// A 250 ml mug of water near the edge of the tray, so the turntable carries it through the pattern.
const MUG_AT = V(0.55, TT_TOP, 0);
{
  const mug = new THREE.Group();
  mug.add(lathe([[0, 0], [0.33, 0], [0.37, 0.03], [0.38, 0.1], [0.38, 0.93], [0.365, 0.96]], M.mug, { segments: 40 }));
  mug.add(lathe([[0.365, 0.96], [0.345, 0.94], [0.345, 0.1], [0.3, 0.08], [0, 0.08]], M.mugIn, { segments: 40 }));
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.045, 10, 24, Math.PI), M.mug);
  handle.rotation.z = -Math.PI / 2; handle.position.set(0.36, 0.5, 0); mug.add(handle);
  add('mug', mug, MUG_AT.clone(), V(0, 1.0, 0), spin);

  const water = new THREE.Group();
  const body = cylinder(0.343, 0.343, 0.62, M.water, [0, 0.09 + 0.31, 0], { segments: 40 });
  body.userData.water = true; body.userData.noGhost = true; water.add(body);
  add('water', water, MUG_AT.clone(), V(0, 1.0, 0), spin);
}

// Water molecules, drawn about 300 million times life size, and an arrow for the electric field.
// The positive end of each molecule (the two hydrogens) swings to point along the field.
const molecules = [];
const fieldArrow = new THREE.Group();
{
  const g = new THREE.Group();
  const HOH = THREE.MathUtils.degToRad(104.5) / 2;
  const O = new THREE.SphereGeometry(0.075, 18, 12), H = new THREE.SphereGeometry(0.045, 14, 10);
  const spots = [[0, 0, 0], [0.24, 0.1, 0.05], [-0.22, 0.06, -0.08], [0.06, 0.24, -0.12], [-0.05, -0.2, 0.1], [0.2, -0.16, -0.1], [-0.2, 0.26, 0.12]];
  for (const [x, y, z] of spots) {
    const m = new THREE.Group();
    m.add(new THREE.Mesh(O, M.oxygen));
    for (const s of [-1, 1]) { const h = new THREE.Mesh(H, M.hydrogen); h.position.set(Math.sin(HOH) * 0.1 * s, Math.cos(HOH) * 0.1, 0); m.add(h); }
    m.position.set(x, y, z);
    m.userData.home = m.position.clone(); m.userData.lag = Math.random() * 0.6 - 0.3; m.userData.seed = Math.random() * 10;
    molecules.push(m); g.add(m);
  }
  fieldArrow.add(cylinder(0.018, 0.018, 0.42, M.arrow, [0, -0.04, 0], { segments: 10 }));
  fieldArrow.add(new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.13, 16), M.arrow).translateY(0.22));
  fieldArrow.position.set(0.48, 0.04, 0); g.add(fieldArrow);
  g.scale.setScalar(1.25);
  add('molecules', g, V(MUG_AT.x, TT_TOP + 1.3, 0), V(0, 0.6, 0), spin);
}

// ---------- Effects ----------
const dot = softDot();

// Waves: bright dots that trace a travelling sine wave along a path, 12.2 cm per wavelength,
// fading at the head and the tail. A short shader gives each dot its own alpha.
// continuous: the wave fills the whole path and flows along it, instead of a packet that runs along it.
function createWave(points, { color = 0xff7a2f, size = 0.13, count = 170, tail = 3.2, amp = 0.14, continuous = false } = {}) {
  const pos = new Float32Array(count * 3), alpha = new Float32Array(count);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geometry.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1));
  const material = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uColor: { value: new THREE.Color(color) }, uOpacity: { value: 0 }, uSize: { value: size }, uScale: { value: 400 }, uMap: { value: dot } },
    vertexShader: /* glsl */`
      attribute float aAlpha; varying float vAlpha; uniform float uSize, uScale;
      void main() {
        vAlpha = aAlpha;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = uSize * uScale / -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor; uniform float uOpacity; uniform sampler2D uMap; varying float vAlpha;
      void main() {
        float a = texture2D(uMap, gl_PointCoord).a * vAlpha * uOpacity;
        if (a < 0.01) discard;
        gl_FragColor = vec4(uColor, a);
      }`,
  });
  const cloud = new THREE.Points(geometry, material); cloud.frustumCulled = false; cloud.renderOrder = 2; root.add(cloud);
  // Corner points, the length up to each corner, and a sideways direction for the wiggle on each leg.
  const legs = [], total = pathLength(points);
  let run = 0;
  for (let i = 1; i < points.length; i++) {
    const a = V(...points[i - 1]), b = V(...points[i]), dir = b.clone().sub(a), len = dir.length();
    if (len < 1e-6) continue;
    dir.divideScalar(len);
    const side = Math.abs(dir.y) > 0.9 ? new THREE.Vector3().crossVectors(dir, V(1, 0, 0)) : new THREE.Vector3().crossVectors(dir, V(0, 1, 0));
    legs.push({ a, dir, len, start: run, side: side.normalize() }); run += len;
  }
  const k = Math.PI * 2 / (wavelengthM() * 10), at = new THREE.Vector3();
  const speed = 2.4, cycle = (total + tail) / speed, gap = tail / count;
  let opacity = 0;
  return {
    material,
    update(time, target, dt) {
      opacity += (target - opacity) * Math.min(1, dt * 6);
      material.uniforms.uOpacity.value = opacity;
      material.uniforms.uScale.value = stage.renderer.domElement.height / 2; // as PointsMaterial does
      cloud.visible = opacity > 0.01;
      if (!cloud.visible) return;
      const head = continuous ? total : (time % cycle) * speed, flow = time * speed;
      let leg = legs.length - 1;
      for (let i = 0; i < count; i++) {
        const s = continuous ? total * (1 - i / (count - 1)) : head - i * gap;
        if (s < 0 || s > total) { alpha[i] = 0; continue; }
        while (leg > 0 && legs[leg].start > s) leg--;
        while (leg < legs.length - 1 && legs[leg].start + legs[leg].len < s) leg++;
        const L = legs[leg];
        at.copy(L.a).addScaledVector(L.dir, s - L.start).addScaledVector(L.side, Math.sin(k * (s - (continuous ? flow : head))) * amp);
        pos[i * 3] = at.x; pos[i * 3 + 1] = at.y; pos[i * 3 + 2] = at.z;
        alpha[i] = continuous ? Math.min(1, (total - s) / 0.6, s / 0.15) : Math.min(1, i / 12) * (1 - i / count);
      }
      geometry.attributes.position.needsUpdate = true; geometry.attributes.aAlpha.needsUpdate = true;
    },
  };
}
// The waves leave the antenna, run up the waveguide, pass the mica and bounce around the cavity.
const ROOM = { min: [CAV.x0 + 0.05, TT_TOP + 0.04, CAV.z0 + 0.05], max: [CAV.x1 - 0.05, CAV.y1 - 0.05, CAV.z1 - 0.05] };
const OUTLET = [CAV.x1 - 0.05, 0.66, MAG.z];
const guidePath = [[1.73, 0.02, MAG.z], [1.73, 0.66, MAG.z], OUTLET, [0.2, 0.3, MAG.z + 0.35]];
const ray = (dir, len = 11, from = OUTLET) => bouncePath(from, dir, ROOM, len);
const waves = {
  guide: createWave(guidePath, { continuous: true, count: 150 }),
  a: createWave(ray([-1, 0.25, -0.5]), { tail: 2.8 }),
  b: createWave(ray([-0.8, -0.6, 0.3]), { tail: 2.8 }),
  c: createWave(ray([-0.5, -0.3, -0.9]), { tail: 2.8 }),
  doorA: createWave(ray([-0.45, -0.15, 1], 8), { tail: 2.8 }),
  doorB: createWave(ray([-0.95, 0.12, 1], 8), { tail: 2.8 }),
};
const WAVE_SETS = { guide: ['guide'], all: ['guide', 'a', 'b', 'c'], door: ['guide', 'doorA', 'doorB'] };

// The standing-wave pattern over the tray: strong every half wavelength (6.1 cm), zero at the walls.
const heatMap = new THREE.Mesh(
  new THREE.PlaneGeometry(CAV.x1 - CAV.x0, CAV.z1 - CAV.z0).rotateX(-Math.PI / 2),
  new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uOpacity: { value: 0 }, uTime: { value: 0 }, uK: { value: Math.PI / (wavelengthM() * 5) }, uColor: { value: new THREE.Color(0xff6a1a) } },
    vertexShader: /* glsl */`varying vec2 vXZ; void main() { vXZ = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      uniform float uOpacity, uTime, uK; uniform vec3 uColor; varying vec2 vXZ;
      void main() {
        float sx = sin(uK * (vXZ.x + ${(-CAV.x0).toFixed(2)})), sz = sin(uK * (vXZ.y + ${(-CAV.z0).toFixed(2)}));
        float e = sx * sx * sz * sz;
        float a = pow(e, 1.4) * uOpacity * (0.85 + 0.15 * sin(uTime * 4.0));
        if (a < 0.01) discard;
        gl_FragColor = vec4(uColor, a * 0.8);
      }`,
  }));
heatMap.position.y = TT_TOP + 0.006; heatMap.renderOrder = 1; root.add(heatMap);

// Electrons swirling in five spokes between the cathode and the vanes (the magnetron's "π mode").
const electrons = createParticles(scene, 160, {
  color: 0x1ea7ff, size: 0.12, map: dot,
  seed: i => ({ spoke: i % 5, f: Math.random(), x: 0.09 + Math.random() * 0.06, j: (Math.random() - 0.5) * 0.25, s: 0.7 + Math.random() * 0.6 }),
});
anode.add(electrons.points);

// Cooling air from the fan through the fins, and steam from the hot water.
const air = createParticles(scene, 70, {
  color: 0x9fb2c6, size: 0.07, map: dot,
  seed: () => ({ t: Math.random(), a: Math.random() * Math.PI * 2, r: Math.sqrt(Math.random()) * 0.36, s: 0.7 + Math.random() * 0.6 }),
});
air.points.position.copy(root.position);
const steam = createParticles(scene, 30, {
  color: 0xb8c4d0, size: 0.12, map: dot,
  seed: () => ({ t: Math.random(), a: Math.random() * Math.PI * 2, r: Math.random() * 0.25, s: 0.5 + Math.random() * 0.5 }),
});
spin.add(steam.points);

// The oven lamp: on while the oven runs, whatever the magnetron is doing, and while the door is open.
const lamp = new THREE.PointLight(0xffd59a, 0, 4.5, 2);
lamp.position.set(1.2, 0.8, 1.0); root.add(lamp);

// ---------- State and UI ----------
const state = { step: 0, explode: 0, targetExplode: 0, playing: true, focus: [], cut: false, level: 10, view: {}, door: 0, doorT: 0, clock: 0 };
const show = { molecules: 0, map: 0, electrons: 0, air: 0 };
const sim = createSim();
let camGoal = null, endHold = 0;
const story = createStoryUI({
  story: MICROWAVE_STORY, state,
  onStep: s => {
    state.focus = s.focus; state.cut = s.cut; state.view = s; state.doorT = 0;
    // A narrow stage (phones) steps back a little so the parts in focus stay in frame.
    const canvas = stage.renderer.domElement, aspect = canvas.clientWidth / Math.max(1, canvas.clientHeight);
    const v = VIEWS[s.view]; camGoal = { ...v, r: v.r * Math.max(1, Math.min(1.3, 1.2 / aspect)), target: new THREE.Vector3(...v.target) };
    cam.theta = v.theta + THREE.MathUtils.euclideanModulo(cam.theta - v.theta + Math.PI, 2 * Math.PI) - Math.PI; // take the short way round
  },
});
bindRange('power', v => { state.level = v; showRange(document.getElementById('power'), `${v * 10}%`); });
createCallouts(stage, { parts, state, story: MICROWAVE_STORY });

const focusStyle = {
  highlight: 0.16,
  opacity(name, mesh, hot) {
    let alpha = 1;
    if (mesh.userData.cutaway && state.cut) alpha = hot ? 0.35 : 0.14;
    if (state.focus.length && !hot && !mesh.userData.cutaway && looksInside(state)) alpha = Math.min(alpha, 0.3);
    if (mesh.userData.glass) alpha *= 0.32;
    if (mesh.userData.water) alpha *= 0.72;
    if (mesh.userData.screen) alpha = Math.min(alpha, 0.96); // keep blending on so the holes show
    if (mesh.userData.display && alpha < 0.9) alpha *= 0.3; // unlit, so it has no x-ray look of its own
    if (name === 'molecules') alpha *= show.molecules;
    if (name === 'wires') alpha *= Math.min(1, Math.max(0, 1 - (state.explode - 0.05) * 7)); // wires only make sense in place
    if (name === 'base') alpha = 1;
    return alpha;
  },
};
const allMeshes = Object.values(parts).flatMap(p => p.meshes);

const readout = { box: document.getElementById('readout'), timer: document.getElementById('r-timer'), mag: document.getElementById('r-magnetron'), water: document.getElementById('r-water') };
let readoutTimer = 0;
function showReadout(doorOpen) {
  readout.timer.textContent = sim.done ? 'Done' : clock(sim.left);
  readout.mag.textContent = doorOpen ? 'Off · door open' : sim.on ? `On · ${OVEN.outputW} W` : 'Off';
  readout.water.textContent = `${sim.T.toFixed(0)}°C`;
  readout.box.classList.toggle('on', sim.on);
}

// ---------- Sound ----------
// The fan whooshes while the oven runs; the transformer hums at 100 Hz (twice the 50 Hz mains)
// while the magnetron is on. A relay clicks at each on/off at low power, and it beeps three times at the end.
const fanNoise = sound.loop({ type: 'noise', filter: 'lowpass', freq: 520, q: 0.7 });
const hum = sound.loop({ type: 'tone', wave: 'sawtooth', freq: 100 });
const was = { on: false, done: false, door: false, running: false };
const beep = (delay = 0) => sound.tone({ freq: 2000, type: 'square', gain: 0.05, release: 0.13, delay });
function playSounds(running, doorOpen) {
  const live = state.playing ? 1 : 0;
  fanNoise.set(running ? 0.07 * live : 0);
  hum.set(sim.on ? 0.018 * live : 0);
  if (sim.on !== was.on && running && state.level < 10) sound.click(0.12); // the power relay
  if (sim.done && !was.done) { beep(); beep(0.35); beep(0.7); }
  if (running && !was.running && !sim.done) beep();
  if (doorOpen && !was.door) sound.click(0.3); // the latch lets go of the switches
  if (!doorOpen && was.door) sound.thunk(0.3);
  Object.assign(was, { on: sim.on, done: sim.done, door: doorOpen, running });
}

// ---------- Frame ----------
const tmp = new THREE.Vector3(), warm = new THREE.Color(0xe0784a).convertSRGBToLinear(), cool = M.water.color.clone();
const clamp01 = x => Math.min(1, Math.max(0, x));
startLoop(stage, (dt, now) => {
  update(state, focusStyle, reduced ? 1 : 0.09, dt);
  if (camGoal && !stage.capture) { // ease to the step's view once; after that the reader's own zoom wins
    const k = reduced ? 1 : Math.min(1, dt * 2.5);
    for (const a of ['r', 'theta', 'phi']) cam[a] += (camGoal[a] - cam[a]) * k;
    cam.target.lerp(camGoal.target, k);
    if (Math.abs(camGoal.r - cam.r) < 0.05 && Math.abs(camGoal.theta - cam.theta) < 0.005 && cam.target.distanceTo(camGoal.target) < 0.02) camGoal = null;
  }
  const s = state.view, live = state.playing ? dt : 0;
  state.clock += live;

  // Step 8 opens the door for a moment: the interlock switches cut the power before it moves far.
  if (s.doorCycle) state.doorT = (state.doorT + live) % 9;
  const t8 = state.doorT;
  const doorTarget = s.doorCycle && t8 > 3.5 && t8 < 6.6 ? 0.75 : 0;
  state.door += (doorTarget - state.door) * Math.min(1, dt * (reduced ? 60 : 3.5));
  doorPivot.rotation.y = -state.door;
  const doorOpen = state.door > 0.02;

  // The oven: a 2:00 run at the chosen power level, then three beeps and a fresh mug.
  if (state.playing) {
    stepOven(sim, dt * OVEN.speed, { level: state.level, doorOpen }, OVEN);
    if (sim.done && (endHold += dt) > 2.5) { Object.assign(sim, createSim()); endHold = 0; }
  }
  const running = !doorOpen && !sim.done;

  // Turntable at 5 rpm, the roller ring at half that; the fan while the oven runs.
  const turn = OVEN.turntableRpm / 60 * Math.PI * 2;
  if (running) { spin.rotation.y += turn * live; rollerSpin.rotation.y += turn / 2 * live; fanBlades.rotation.z += 24 * live; }

  // The anode slides out, turns to the reader and grows; the cathode glows while the magnetron is on.
  const out = clamp01(parts.anode.amount / 0.55);
  parts.anode.group.rotation.y = -0.75 * out;
  parts.anode.group.scale.setScalar(1 + 1.6 * out);
  cathode.material.color.setHex(sim.on ? 0xffa45c : 0x3a3d42);

  // Waves only while the magnetron is on.
  const set = WAVE_SETS[s.waves] ?? [];
  for (const [name, wave] of Object.entries(waves)) wave.update(state.clock, set.includes(name) && sim.on && !reduced ? 1 : 0, dt);
  show.map += ((s.map && sim.on ? 1 : 0) - show.map) * Math.min(1, dt * 5);
  heatMap.material.uniforms.uOpacity.value = show.map; heatMap.material.uniforms.uTime.value = now / 1000;
  heatMap.visible = show.map > 0.01;

  // Molecules: the field flips (slowed down about five billion times) and each molecule swings after it.
  show.molecules += ((s.molecules ? 1 : 0) - show.molecules) * Math.min(1, dt * 5);
  parts.molecules.group.visible = s.molecules ? show.molecules > 0.01 : show.molecules > 0.4; // leave quickly, without an x-ray fade
  if (parts.molecules.group.visible) {
    const flip = Math.sin(state.clock * Math.PI * 1.4) >= 0 ? 0 : Math.PI;
    const field = sim.on ? flip : fieldArrow.rotation.z;
    fieldArrow.rotation.z += (field - fieldArrow.rotation.z) * Math.min(1, dt * 14);
    fieldArrow.visible = sim.on;
    const jiggle = 0.004 + 0.016 * clamp01((sim.T - 20) / 80);
    molecules.forEach(m => {
      const goal = sim.on ? fieldArrow.rotation.z + m.userData.lag : m.rotation.z;
      m.rotation.z += (goal - m.rotation.z) * Math.min(1, dt * 7);
      const t = state.clock * 9 + m.userData.seed;
      m.rotation.y = Math.sin(t * 0.3) * 0.5;
      m.position.copy(m.userData.home).add(tmp.set(Math.sin(t * 1.3), Math.sin(t * 1.7), Math.cos(t * 1.1)).multiplyScalar(jiggle));
    });
  }

  // Electron spokes in the anode, while the magnetron runs and the step looks at it.
  show.electrons += ((s.electrons && sim.on ? 1 : 0) - show.electrons) * Math.min(1, dt * 6);
  if (electrons.fade(show.electrons, 1)) {
    const turnA = state.clock * 1.6;
    electrons.seeds.forEach((e, i) => {
      e.f = (e.f + live * 0.5 * e.s) % 1;
      const r = 0.03 + e.f * 0.04, a = e.spoke / 5 * Math.PI * 2 + turnA + e.f * 0.9 + e.j * (1 - e.f);
      electrons.place(i, e.x, Math.cos(a) * r, Math.sin(a) * r);
    });
    electrons.commit();
  }

  // Cooling air: in at the back, through the fan and the fins, on toward the front of the bay.
  show.air += ((s.air && running ? 0.75 : 0) - show.air) * Math.min(1, dt * 4);
  if (air.fade(show.air, 1)) {
    air.seeds.forEach((p, i) => {
      p.t = (p.t + live * 0.45 * p.s) % 1;
      const z = -1.75 + p.t * 2.2, spread = 1 + Math.max(0, z + 0.3) * 0.5;
      air.place(i, 2.31 + Math.cos(p.a) * p.r * spread, Math.sin(p.a) * p.r * spread, z);
    });
    air.commit();
  }

  // The water warms (tinted toward orange as it heats) and steams once it passes 70 °C.
  const heat = clamp01((sim.T - 20) / 80);
  parts.water.meshes[0].material.color.copy(cool).lerp(warm, heat * 0.5);
  if (steam.fade(sim.T > 70 && !reduced ? (sim.T - 70) / 40 : 0, Math.min(1, dt * 2))) {
    steam.seeds.forEach((p, i) => {
      p.t = (p.t + live * 0.35 * p.s) % 1;
      const r = p.r + p.t * 0.12;
      steam.place(i, MUG_AT.x + Math.cos(p.a) * r, TT_TOP + 0.75 + p.t * 0.9, Math.sin(p.a) * r);
    });
    steam.commit();
  }

  // Lamp, display and the timer's beeps.
  lamp.intensity += ((running || doorOpen ? 0.9 : 0) - lamp.intensity) * Math.min(1, dt * 8); // the lamp also lights with the door open
  drawDisplay(sim.done ? 'End' : clock(sim.left), running);

  // A part faded to x-ray stops casting a shadow, so the inside of the oven stays lit.
  allMeshes.forEach(m => { if (!m.userData.noShadow) m.castShadow = (m.userData.alpha ?? 1) > 0.5; });

  playSounds(running, doorOpen);

  readoutTimer -= dt;
  if (readoutTimer <= 0) { showReadout(doorOpen); readoutTimer = 0.15; }
});
story.setStep(0, false);
