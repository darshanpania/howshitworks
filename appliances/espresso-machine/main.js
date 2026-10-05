import * as THREE from 'three';
import { createStage, addFloor, addStudioLights } from '../../src/engine/stage.js';
import { createParts, looksInside } from '../../src/engine/parts.js';
import { createCallouts } from '../../src/engine/callouts.js';
import { createStoryUI, bindRange } from '../../src/engine/story-ui.js';
import { sound } from '../../src/engine/sound.js';
import { startLoop, reducedMotion as reduced } from '../../src/engine/loop.js';
import { box, cylinder, lathe, coilGeometry } from '../../src/kit/shapes.js';
import { createMaterials, linear } from '../../src/kit/materials.js';
import { softDot, speckleTexture, heatColor, createParticles } from '../../src/kit/effects.js';
import { ESPRESSO_STORY } from './story.js';
import { ESPRESSO, createSim, stepMachine, startShot, grindAt } from './physics.js';

// ---------- Stage and light ----------
const stage = createStage(document.querySelector('#c'), {
  fov: 36, pbr: true, camera: { theta: 0.62, phi: 1.2, r: 10.5, target: [0.3, -0.15, 0.2] }, zoom: [5, 16], phiLimit: 0.25,
});
const { scene } = stage;
addStudioLights(stage, { key: [4, 8, 5], extent: 5, far: 25 });
const FLOOR_Y = -1.9;
addFloor(stage, FLOOR_Y, { size: 13, opacity: 0.16, height: 5 });

// ---------- Textures ----------
// Pressure gauge dial: 0 to 16 bar over 270°, with the espresso range (8 to 10 bar) in green.
const GAUGE_MAX = 16;
const gaugeAngle = bar => (-135 + bar / GAUGE_MAX * 270) * Math.PI / 180; // from straight up, clockwise
function gaugeTexture(size = 256) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'), h = size / 2;
  g.fillStyle = '#f6f3ea'; g.fillRect(0, 0, size, size);
  g.lineCap = 'butt'; g.lineWidth = 16; g.strokeStyle = '#4c9a5c';
  g.beginPath(); g.arc(h, h, 94, gaugeAngle(8) - Math.PI / 2, gaugeAngle(10) - Math.PI / 2); g.stroke();
  g.strokeStyle = '#1d1f22'; g.fillStyle = '#1d1f22';
  for (let bar = 0; bar <= GAUGE_MAX; bar++) {
    const a = gaugeAngle(bar), long = bar % 4 === 0, r0 = long ? 80 : 90;
    g.lineWidth = long ? 5 : 3;
    g.beginPath(); g.moveTo(h + Math.sin(a) * r0, h - Math.cos(a) * r0); g.lineTo(h + Math.sin(a) * 104, h - Math.cos(a) * 104); g.stroke();
    if (long) {
      g.font = '600 26px "IBM Plex Mono", ui-monospace, monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(String(bar), h + Math.sin(a) * 58, h - Math.cos(a) * 58);
    }
  }
  g.font = '500 20px "IBM Plex Mono", ui-monospace, monospace'; g.fillText('BAR', h, h + 62);
  const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = 4;
  return t;
}
// Shower screen: a steel disc punched with hundreds of tiny holes.
function screenTexture(size = 128) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'), h = size / 2;
  g.fillStyle = '#d8dce1'; g.fillRect(0, 0, size, size); g.fillStyle = '#41464c';
  for (let row = 0, y = 3; y < size; y += 6, row++) {
    for (let x = 3 + (row % 2) * 3; x < size; x += 6) {
      if (Math.hypot(x - h, y - h) < h * 0.9) { g.beginPath(); g.arc(x, y, 1.5, 0, Math.PI * 2); g.fill(); }
    }
  }
  const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding;
  return t;
}

// ---------- Materials ----------
const M = createMaterials({
  body: { look: 'brushed', color: 0xc8cdd3 },
  steel: 'steel', plastic: 'plastic', dark: 'dark', rubber: 'rubber', brass: { look: 'brass', side: THREE.DoubleSide },
  chrome: { look: 'steel', roughness: 0.12, side: THREE.DoubleSide },
  basket: { look: 'steel', roughness: 0.3, side: THREE.DoubleSide },
  coil: { look: 'copper', roughness: 0.35 },
  copper: 'copper',
  tank: { color: 0xe4ecf1, metalness: 0, roughness: 0.12 },   // clear plastic
  water: { color: 0x4f8fd0, metalness: 0, roughness: 0.1 },
  silicone: { color: 0xeeeae2, roughness: 0.45 },
  element: { color: 0x5a5049, metalness: 0.6, roughness: 0.45 },
  grounds: { color: 0x7a5232, roughness: 0.95, map: speckleTexture({ repeat: 0.5 }) },
  espresso: { color: 0x2b150b, roughness: 0.2 },
  crema: { color: 0xb5753f, roughness: 0.5 },
  glass: { color: 0xeef4f7, metalness: 0, roughness: 0.04 },
  wood: { color: 0x7a4b2a, roughness: 0.6 },
  face: { color: 0xffffff, roughness: 0.45, map: gaugeTexture() },
  needle: { color: 0xc8402a, roughness: 0.4 },
  lamp: { color: 0x5a3018, roughness: 0.3 },
  screen: { look: 'steel', roughness: 0.35, map: screenTexture() },
}, { pbr: true });

// ---------- Helpers ----------
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);
// A round rod from a to b; r2 is the radius at b.
function rod(a, b, r, mat, r2 = r) {
  const from = V(...a), to = V(...b), length = from.distanceTo(to);
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r2, r, length, 16), mat);
  mesh.position.copy(from).lerp(to, 0.5);
  mesh.quaternion.setFromUnitVectors(UP, to.clone().sub(from).normalize());
  return mesh;
}
// A pipe along a smooth curve through points. Returns the mesh and the curve for the water.
function pipe(points, r, mat) {
  const curve = new THREE.CatmullRomCurve3(points.map(p => V(...p)), false, 'centripetal');
  const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(24, points.length * 14), r, 8, false), mat);
  return { mesh, curve };
}
// A polygon in the (z, y) side view with rounded corners.
function roundedOutline(points, r) {
  const shape = new THREE.Shape(), n = points.length;
  points.forEach(([x, y], i) => {
    const [px, py] = points[(i + n - 1) % n], [nx, ny] = points[(i + 1) % n];
    const lp = Math.hypot(px - x, py - y), ln = Math.hypot(nx - x, ny - y), rr = Math.min(r, lp / 2, ln / 2);
    const sx = x + (px - x) / lp * rr, sy = y + (py - y) / lp * rr, ex = x + (nx - x) / ln * rr, ey = y + (ny - y) / ln * rr;
    if (i === 0) shape.moveTo(sx, sy); else shape.lineTo(sx, sy);
    shape.quadraticCurveTo(x, y, ex, ey);
  });
  shape.closePath();
  return shape;
}

// ---------- Parts ----------
// Scale: 1 unit ≈ 10 cm. The machine is 24 cm wide, 26 cm deep and 36 cm tall, like a
// classic single-boiler home machine. The front faces +z.
const W = 2.4;
const AXIS = V(0, 0.3, 0.62);      // group head axis, at the gasket face
const root = new THREE.Group(); scene.add(root);
const { parts, add, update } = createParts(root, { shadows: true, lively: true });

// Brushed steel case: a tower at the back, a hood over the group head, and a base under the
// drip tray, cut from one side profile. Switches, lamps and a cup-warmer rail sit on it.
{
  const body = new THREE.Group(), bev = 0.05;
  // Profile corners as (z, y), before the 5 cm bevel grows them outward.
  const outline = roundedOutline([[-1.3, -1.85], [1.2, -1.85], [1.2, -1.62], [0.1, -1.62], [0.1, 0.6], [1.15, 0.6], [1.15, 1.7], [-1.3, 1.7]], 0.14);
  const geo = new THREE.ExtrudeGeometry(outline, { depth: W - 2 * bev, bevelEnabled: true, bevelSize: bev, bevelThickness: bev, bevelSegments: 3, curveSegments: 8 });
  geo.rotateY(-Math.PI / 2); geo.translate(W / 2 - bev, 0, 0);
  body.add(new THREE.Mesh(geo, M.body));
  // Three rocker switches (power, brew, steam) with a lamp over each.
  ['power', 'pump', 'heat'].forEach((name, i) => {
    const x = 0.22 + i * 0.3;
    const rocker = box([0.17, 0.24, 0.07], M.dark, V(x, 1.08, 1.22), 0.03); rocker.rotation.x = -0.12; body.add(rocker);
    const lamp = cylinder(0.04, 0.04, 0.04, M.lamp, [x, 1.4, 1.21], { segments: 16 }); lamp.rotation.x = Math.PI / 2;
    lamp.userData.lamp = name; body.add(lamp);
  });
  // Cup-warmer rail on top.
  body.add(box([2.1, 0.04, 0.04], M.steel, V(0, 1.82, 1.08), 0.015));
  [-1.03, 1.03].forEach(x => body.add(box([0.04, 0.06, 1.0], M.steel, V(x, 1.8, 0.6), 0.015)));
  add('case', body, V(0, 0, 0), V(0, 0, 0));
}

// Water tank: a clear 2 litre box at the back, filled from the top.
const TANK = { z: -0.92 };
{
  const tank = new THREE.Group();
  const shell = box([1.7, 1.85, 0.62], M.tank, V(0, 0.72, TANK.z), 0.04); shell.userData.clear = true; tank.add(shell);
  const water = box([1.6, 1.4, 0.54], M.water, V(0, 0.52, TANK.z), 0.03); water.userData.water = true; water.userData.noGhost = true; tank.add(water);
  tank.add(box([1.76, 0.06, 0.68], M.plastic, V(0, 1.79, TANK.z), 0.02)); // lid, flush with the top
  [0.55, -0.45].forEach(x => tank.add(cylinder(0.06, 0.06, 0.08, M.plastic, [x, -0.24, TANK.z], { segments: 12 })));
  add('tank', tank, V(0, 0, 0), V(0, 1.0, -0.7));
}

// Vibratory pump: a copper coil around a steel tube, lying on the base.
{
  const pump = new THREE.Group();
  const tube = cylinder(0.09, 0.09, 1.12, M.steel, [0, 0, 0], { segments: 20 }); tube.rotation.z = Math.PI / 2; pump.add(tube);
  pump.add(new THREE.Mesh(coilGeometry({ length: 0.48, turns: 9, radius: 0.19, wire: 0.035, axis: 'x' }), M.coil));
  [-0.27, 0.27].forEach(x => { const cap = cylinder(0.24, 0.24, 0.05, M.dark, [x, 0, 0], { segments: 28 }); cap.rotation.z = Math.PI / 2; pump.add(cap); });
  [-0.6, 0.6].forEach(x => { const port = cylinder(0.05, 0.05, 0.12, M.brass, [x, 0, 0], { segments: 12 }); port.rotation.z = Math.PI / 2; pump.add(port); });
  [-0.2, 0.2].forEach(x => pump.add(box([0.14, 0.12, 0.3], M.rubber, V(x, -0.27, 0), 0.03)));
  pump.userData.anchor = [0, 0.22, 0];
  add('pump', pump, V(0.15, -1.2, -0.55), V(-1.6, -0.2, 0.2));
}

// Over-pressure valve: a spring-loaded brass valve on the pump outlet, set to 9 bar.
{
  const opv = new THREE.Group();
  opv.add(cylinder(0.08, 0.08, 0.26, M.brass, [0, 0, 0], { segments: 16 }));
  opv.add(cylinder(0.075, 0.075, 0.06, M.brass, [0, 0.16, 0], { segments: 6 }));
  opv.add(cylinder(0.025, 0.025, 0.12, M.steel, [0, 0.24, 0], { segments: 10 }));
  const side = cylinder(0.035, 0.035, 0.12, M.brass, [0.1, 0.08, 0], { segments: 10 }); side.rotation.z = Math.PI / 2; opv.add(side);
  add('opv', opv, V(-0.72, -1.2, -0.3), V(-1.3, 0.3, 0.3));
}

// Boiler: a small brass boiler bolted on top of the group head, with a thermostat on top.
const BOILER_Y = 0.6;
{
  const boiler = new THREE.Group();
  boiler.add(lathe([[0, 0], [0.4, 0], [0.42, 0.03], [0.42, 0.42], [0.38, 0.5], [0.2, 0.55], [0, 0.56]], M.brass, { segments: 48 }));
  boiler.add(cylinder(0.46, 0.46, 0.05, M.brass, [0, 0.025, 0], { segments: 48 }));
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * Math.PI * 2 + 0.3;
    boiler.add(cylinder(0.025, 0.025, 0.04, M.steel, [Math.cos(a) * 0.44, 0.06, Math.sin(a) * 0.44], { segments: 8 }));
  }
  boiler.add(cylinder(0.08, 0.08, 0.06, M.steel, [0.2, 0.52, 0], { segments: 16 })); // thermostat
  const inlet = cylinder(0.04, 0.04, 0.12, M.brass, [-0.45, 0.15, -0.1], { segments: 10 }); inlet.rotation.z = Math.PI / 2; boiler.add(inlet);
  const water = cylinder(0.39, 0.39, 0.46, M.water, [0, 0.25, 0], { segments: 40 }); water.userData.water = true; water.userData.noGhost = true; boiler.add(water);
  boiler.userData.anchor = [0.42, 0.38, 0];
  add('boiler', boiler, V(0, BOILER_Y, AXIS.z), V(0, 1.2, 0.2));
}

// Heating element: a ring cast low in the boiler, wired out through the back wall.
{
  const element = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.035, 10, 48), M.element); ring.rotation.x = Math.PI / 2; ring.position.y = 0.14;
  ring.userData.element = true; element.add(ring);
  [-0.12, 0.12].forEach(x => { const lead = rod([x, 0.14, -0.24], [x, 0.14, -0.52], 0.03, M.element); lead.userData.element = true; element.add(lead); });
  element.userData.anchor = [0.27, 0.14, 0];
  add('element', element, V(0, 0, 0), V(0, 0.55, 0), parts.boiler.group);
}

// Group head: the chrome block under the boiler that the portafilter locks into.
{
  const group = new THREE.Group();
  group.add(cylinder(0.42, 0.42, 0.22, M.chrome, [0, 0.14, 0], { segments: 48 }));
  group.add(cylinder(0.46, 0.46, 0.07, M.chrome, [0, 0.035, 0], { segments: 48 }));
  [-1, 1].forEach(s => group.add(box([0.07, 0.05, 0.22], M.dark, V(s * 0.45, 0.02, 0), 0.01))); // ramps for the lugs
  const gasket = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.028, 10, 48), M.rubber); gasket.rotation.x = Math.PI / 2; gasket.position.y = 0.01;
  group.add(gasket);
  group.userData.anchor = [0.44, 0.1, 0];
  add('group', group, AXIS.clone(), V(0, 0.45, 0.9));
}
// Shower screen: recessed inside the gasket, it spreads the water over the whole puck.
{
  const screen = cylinder(0.3, 0.3, 0.012, M.screen, [0, 0, 0], { segments: 48 });
  add('screen', screen, V(0, 0.014, 0), V(0, -0.15, 0), parts.group.group);
}

// Portafilter: a chrome holder with two lugs, a black handle and two spouts. It is built
// around the group head axis, so it can twist into place.
const PUCK = { floor: -0.235, h: 0.12 };
const SPOUTS = [V(-0.11, -0.47, 0), V(0.11, -0.47, 0)];
{
  const pf = new THREE.Group();
  pf.add(lathe([[0.37, 0], [0.375, -0.04], [0.35, -0.12], [0.3, -0.22], [0.2, -0.3], [0.09, -0.33], [0, -0.335]], M.chrome, { segments: 48 }));
  pf.add(lathe([[0.3, 0.012], [0.312, 0], [0.297, -0.02], [0.285, -0.2], [0.25, -0.245], [0, -0.25]], M.basket, { segments: 48 }));
  [-1, 1].forEach(s => pf.add(box([0.14, 0.06, 0.16], M.chrome, V(s * 0.42, -0.035, 0), 0.02)));
  pf.add(rod([0, -0.1, 0.32], [0, -0.17, 0.62], 0.055, M.chrome, 0.06));
  pf.add(rod([0, -0.17, 0.6], [0, -0.31, 1.45], 0.075, M.plastic, 0.09));
  pf.add(box([0.3, 0.08, 0.12], M.chrome, V(0, -0.36, 0), 0.03));
  SPOUTS.forEach(tip => pf.add(rod([tip.x * 0.6, -0.38, 0], [tip.x, tip.y, 0], 0.03, M.chrome, 0.024)));
  pf.userData.anchor = [0, -0.14, 0.5];
  add('portafilter', pf, AXIS.clone(), V(0, -0.85, 0.9));
}
// Puck: 18 g of ground coffee, pressed flat in the basket. Its origin is at its bottom, so it
// can be squashed by the tamper.
const puck = cylinder(0.282, 0.266, PUCK.h, M.grounds, [0, 0, 0], { segments: 40 });
puck.geometry.translate(0, PUCK.h / 2, 0);
puck.userData.anchor = [0.28, PUCK.h, 0];
add('puck', puck, V(0, PUCK.floor, 0), V(0, 0, 0), parts.portafilter.group);
// Tamper: a 58 mm steel base on a wooden handle. Only on stage while the coffee is tamped.
{
  const tamper = new THREE.Group();
  tamper.add(cylinder(0.283, 0.283, 0.09, M.steel, [0, 0.045, 0], { segments: 40 }));
  tamper.add(cylinder(0.06, 0.07, 0.1, M.steel, [0, 0.14, 0], { segments: 16 }));
  tamper.add(cylinder(0.1, 0.12, 0.28, M.wood, [0, 0.33, 0], { segments: 24 }));
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.12, 20, 14), M.wood); knob.position.y = 0.48; tamper.add(knob);
  tamper.userData.anchor = [0.12, 0.35, 0];
  add('tamper', tamper, V(0, PUCK.floor + PUCK.h, 0), V(0, 0.4, 0), parts.portafilter.group);
}

// Three-way solenoid valve beside the boiler, with its drain pipe to the drip tray.
{
  const valve = new THREE.Group();
  valve.add(box([0.26, 0.26, 0.26], M.dark, V(0, 0.12, 0), 0.03));
  valve.add(box([0.22, 0.16, 0.2], M.brass, V(0, -0.09, 0), 0.03));
  [-0.05, 0.05].forEach(x => valve.add(box([0.03, 0.06, 0.012], M.brass, V(x, 0.28, 0.06))));
  add('valve', valve, V(0.72, 0.85, 0.52), V(1.4, 0.4, 0.3));
}

// Pressure gauge on the front of the hood.
let needle;
{
  const gauge = new THREE.Group();
  const bezel = cylinder(0.3, 0.3, 0.08, M.chrome, [0, 0, 0.04], { segments: 40 }); bezel.rotation.x = Math.PI / 2; gauge.add(bezel);
  const face = new THREE.Mesh(new THREE.CircleGeometry(0.26, 40), M.face); face.position.z = 0.082; gauge.add(face);
  needle = new THREE.Group(); needle.position.z = 0.09; gauge.add(needle);
  needle.add(box([0.024, 0.24, 0.01], M.needle, V(0, 0.08, 0), 0));
  const hub = cylinder(0.03, 0.03, 0.02, M.dark, [0, 0, 0.005], { segments: 16 }); hub.rotation.x = Math.PI / 2; needle.add(hub);
  gauge.userData.anchor = [-0.3, 0, 0.04];
  add('gauge', gauge, V(-0.62, 1.12, 1.2), V(-0.3, 0.2, 0.9));
}

// Drip tray with a slotted steel grille.
{
  const tray = new THREE.Group();
  tray.add(box([2.2, 0.15, 1.1], M.dark, V(0, -1.5, 0.7), 0.03));
  for (let i = 0; i < 9; i++) tray.add(box([2.05, 0.025, 0.06], M.steel, V(0, -1.41, 0.26 + i * 0.11), 0.008));
  tray.userData.anchor = [0.9, -1.45, 1.2];
  add('tray', tray, V(0, 0, 0), V(0, -0.28, 0.9));
}

// A 90 ml shot glass right under the spouts, so the espresso and its crema show through.
// Its origin is on the grille.
const CUP = { floor: 0.08, r: 0.248, mlPerUnit: Math.PI * 2.5 ** 2 * 10 }; // ml per unit of height
let coffee, crema;
{
  const cup = new THREE.Group();
  const glass = lathe([[0, 0], [0.25, 0], [0.27, 0.015], [0.272, 0.52], [0.262, 0.528], [0.252, 0.518], [0.25, 0.1], [0.235, 0.08], [0, 0.08]], M.glass, { segments: 48 });
  glass.userData.glass = true; cup.add(glass);
  coffee = cylinder(CUP.r, CUP.r, 1, M.espresso, [0, 0, 0], { segments: 40 }); coffee.geometry.translate(0, 0.5, 0);
  coffee.position.y = CUP.floor; coffee.visible = false; coffee.userData.noGhost = true; cup.add(coffee);
  crema = cylinder(CUP.r, CUP.r, 1, M.crema, [0, 0, 0], { segments: 40 }); crema.geometry.translate(0, 0.5, 0);
  crema.visible = false; crema.userData.noGhost = true; cup.add(crema);
  cup.userData.anchor = [0.27, 0.4, 0];
  add('cup', cup, V(0, -1.3975, AXIS.z), V(0, -0.25, 0.9));
}

// Pipes: tank → pump → over-pressure valve → boiler, the valve's return to the tank, the
// three-way valve's drain to the tray, and the steam wand on the right.
const PATH = {};
{
  const pipes = new THREE.Group();
  const lay = (name, points, r, mat) => { const p = pipe(points, r, mat); pipes.add(p.mesh); PATH[name] = p.curve; };
  lay('intake', [[0.55, -0.27, TANK.z], [0.6, -0.6, -0.88], [0.86, -0.95, -0.72], [0.97, -1.15, -0.6], [0.8, -1.2, -0.55]], 0.035, M.silicone);
  lay('supply', [[-0.5, -1.2, -0.55], [-0.66, -1.22, -0.45], [-0.72, -1.3, -0.3], [-0.86, -1.08, -0.15], [-0.9, -0.4, -0.02], [-0.88, 0.3, 0.02], [-0.8, 0.66, 0.08], [-0.62, 0.74, 0.36], [-0.48, 0.75, 0.52]], 0.032, M.copper);
  lay('back', [[-0.62, -1.12, -0.3], [-0.5, -0.92, -0.5], [-0.45, -0.6, -0.8], [-0.45, -0.27, TANK.z]], 0.03, M.silicone);
  lay('tovalve', [[0.36, 0.68, 0.6], [0.5, 0.7, 0.56], [0.62, 0.76, 0.52]], 0.03, M.copper);
  lay('drain', [[0.76, 0.75, 0.52], [0.86, 0.66, 0.3], [0.94, 0.45, 0.05], [0.96, -0.9, 0.0], [0.95, -1.47, 0.05], [0.9, -1.48, 0.32]], 0.03, M.silicone);
  add('pipes', pipes, V(0, 0, 0), V(0, 0, 0));
}
{
  const wand = new THREE.Group();
  const p = pipe([[0.15, 1.13, 0.62], [0.6, 1.3, 0.8], [1.1, 1.36, 0.86], [1.32, 1.3, 0.9], [1.43, 1.12, 0.93], [1.46, 0.6, 0.96], [1.46, -0.25, 0.98]], 0.035, M.steel);
  wand.add(p.mesh);
  wand.add(rod([1.46, 0.95, 0.955], [1.46, 0.45, 0.965], 0.07, M.rubber));
  wand.add(rod([1.46, -0.25, 0.98], [1.46, -0.36, 0.98], 0.035, M.steel, 0.02));
  wand.add(cylinder(0.12, 0.13, 0.12, M.dark, [0.85, 1.82, 0.8], { segments: 24 }));
  add('wand', wand, V(0, 0, 0), V(0.8, 0, 0.2));
}

// Espresso streams from the two spouts: thin columns that thicken with the flow.
const streams = SPOUTS.map(() => {
  const mesh = cylinder(1, 1, 1, new THREE.MeshStandardMaterial({ color: linear(0x3e1e0c), roughness: 0.55 }), [0, 0, 0], { segments: 10 });
  mesh.geometry.translate(0, -0.5, 0); mesh.visible = false; scene.add(mesh);
  return mesh;
});

// Particles: water along the pipes, the over-pressure valve's return, the shower over the puck,
// drops of espresso, and the drain from the three-way valve. Colours are linear, like the materials.
const dot = softDot(), WATER = linear(0x2f80dc);
const flow = createParticles(scene, 70, { color: WATER, size: 0.26, map: dot, seed: i => ({ path: i % 3 ? 'supply' : 'intake', t: Math.random() }) });
const giveBack = createParticles(scene, 26, { color: WATER, size: 0.26, map: dot, seed: () => ({ t: Math.random() }) });
const drain = createParticles(scene, 34, { color: linear(0x7a5032), size: 0.26, map: dot, seed: () => ({ t: Math.random() }) });
const shower = createParticles(scene, 70, {
  color: WATER, size: 0.16, map: dot,
  seed: () => ({ a: Math.random() * Math.PI * 2, r: Math.sqrt(Math.random()) * 0.27, t: Math.random(), s: 0.7 + Math.random() * 0.6 }),
});
const drops = createParticles(scene, 40, { color: linear(0x4a2410), size: 0.12, map: dot, seed: i => ({ side: i % 2, t: Math.random(), s: 0.8 + Math.random() * 0.4 }) });

// ---------- State and UI ----------
const TAMP_STEP = ESPRESSO_STORY.findIndex(s => s.focus.includes('tamper'));
const state = {
  step: 0, explode: 0, targetExplode: 0, playing: true, focus: [], cut: false, mode: {},
  grind: 3, glow: 0, gauge: 0, wet: 0, twist: 0, stepTime: 0, lock: false,
};
const sim = createSim();
const story = createStoryUI({
  story: ESPRESSO_STORY, state,
  onStep: (s, index) => {
    // Going forward keeps the machine as it is; jumping back starts the step from its own start.
    const back = index < (state.lastStep ?? -1); state.lastStep = index;
    sim.T = s.heat ? (back ? s.startT : Math.max(sim.T, s.startT)) : s.startT;
    state.focus = s.focus; state.cut = s.cut; state.lock = !!s.lock; state.stepTime = 0;
    state.mode = { heat: s.heat, brew: s.brew, from: s.from ?? 0 };
    if (!s.brew) Object.assign(sim, { phase: 'idle', cup: 0, soaked: 0, t: 0, p: 0 });
    else if (back || sim.phase === 'idle' || sim.cup < (s.from ?? 0)) startShot(sim, { grind: state.grind, from: s.from ?? 0 });
  },
});
// The Grind slider names its setting instead of showing a number.
const grindInput = document.getElementById('grind'), grindOut = document.getElementById('grind-out');
bindRange('grind', v => {
  state.grind = v;
  grindOut.textContent = grindAt(v).label;
  grindInput.setAttribute('aria-valuetext', grindAt(v).label);
});
createCallouts(stage, { parts, state, story: ESPRESSO_STORY });
// ?capture: expose the simulation too, so a thumbnail can be framed in the middle of a shot.
if (stage.capture) globalThis.__hswSim = { sim, run(seconds) { for (let t = 0; t < seconds; t += 0.02) stepMachine(sim, 0.02, { ...state.mode, grind: state.grind }); } };

const BLACK = new THREE.Color(0x000000), elementColor = new THREE.Color(), lampColor = linear(0xff8a2a);
const lampOn = { power: () => true, pump: () => sim.pumpQ > 0, heat: () => sim.element };
const focusStyle = {
  highlight: 0.15,
  opacity(name, mesh, hot) {
    if (name === 'tamper') return state.step === TAMP_STEP ? 1 : 0;
    const cut = !!state.cut && state.cut.includes(name);
    let alpha = 1;
    if (cut && !mesh.userData.water) alpha = hot ? 0.35 : 0.16; // cut away to show the inside
    if (state.focus.length && !hot && !cut && looksInside(state)) alpha = Math.min(alpha, 0.3);
    if (mesh.userData.clear) alpha = Math.min(alpha, 0.32);
    if (mesh.userData.glass) alpha = Math.min(alpha, 0.34);
    if (mesh.userData.water) alpha *= 0.6;
    return alpha;
  },
  decorate(material, { mesh }) {
    const { element, lamp, glow = 0 } = mesh.userData;
    if (element) { material.emissive.copy(elementColor); material.emissiveIntensity = 1 + state.glow * 0.6; return; }
    if (lamp) { material.emissive.copy(lampColor); material.emissiveIntensity = lampOn[lamp]() ? 2.4 : 0.05; return; }
    material.emissive.copy(glow > 0.001 ? material.color : BLACK); material.emissiveIntensity = glow;
  },
};

const readout = { box: document.getElementById('readout'), p: document.getElementById('r-pressure'), t: document.getElementById('r-temp'), s: document.getElementById('r-shot') };
let readoutTimer = 0;
function showReadout() {
  readout.p.textContent = `${sim.p.toFixed(1)} bar`;
  readout.t.textContent = `${sim.T.toFixed(0)}°C`;
  readout.s.textContent = `${sim.t.toFixed(0)} s · ${sim.cup.toFixed(0)} g`;
  readout.box.classList.toggle('brewing', sim.p > 8.5);
}

// ---------- Sound ----------
// The pump's buzz (50 strokes a second), espresso trickling into the cup, the thermostat's
// click, the portafilter seating, and the three-way valve's hiss into the drip tray.
const pumpBuzz = sound.loop({ type: 'tone', wave: 'sawtooth', freq: 100 });
const pumpRattle = sound.loop({ type: 'noise', filter: 'bandpass', freq: 420, q: 2 });
const trickle = sound.loop({ type: 'noise', filter: 'bandpass', freq: 2600, q: 1.4 });
const ventHiss = sound.loop({ type: 'noise', filter: 'highpass', freq: 2600, q: 0.7 });
const was = { element: false, phase: 'idle', locked: false, pressed: false };
function playSounds(now) {
  const on = state.playing ? 1 : 0, load = sim.p / ESPRESSO.pumpBar;
  pumpBuzz.set(sim.pumpQ > 0 ? 0.03 * on : 0, 100 - load * 12); // the buzz drops a little as the load rises
  pumpRattle.set(sim.pumpQ > 0 ? 0.05 * on : 0, 420 - load * 80);
  trickle.set(sim.puckQ > 0.05 ? Math.min(0.06, 0.02 + sim.puckQ * 0.012) * on : 0, 2400 + Math.sin(now / 90) * 300);
  ventHiss.set(sim.phase === 'vent' ? 0.12 * Math.min(1, sim.p / 3 + 0.2) * on : 0);
  if (sim.element !== was.element) sound.click(0.12); // thermostat
  if (sim.phase === 'brew' && was.phase !== 'brew') sound.click(0.25); // brew switch
  if (sim.phase === 'vent' && was.phase !== 'vent') sound.whoosh(0.25, 1600);
  was.element = sim.element; was.phase = sim.phase;
}

// ---------- Step animations ----------
const ease = t => t * t * (3 - 2 * t);
const clamp01 = t => Math.min(1, Math.max(0, t));
// Step 4: the portafilter swings in from the left, then a quarter turn locks it. Repeats.
function lockTwist() {
  if (!state.lock || reduced) return 0;
  const t = state.stepTime % 5;
  if (t < 0.8) return -0.75;
  if (t < 1.9) return -0.75 * (1 - ease((t - 0.8) / 1.1));
  if (t < 4.4) return 0;
  return -0.75 * ease((t - 4.4) / 0.6);
}
// Step 3: loose grounds, the tamper comes down, presses, and lifts again. Repeats.
function tampPose() {
  if (reduced) return { loose: 0, lift: 0.3 };
  const t = state.stepTime % 4.4;
  if (t < 0.8) return { loose: 1, lift: 0.4 * (1 - ease(t / 0.8)) };
  if (t < 1.5) return { loose: 1 - ease((t - 0.8) / 0.7), lift: 0 };
  if (t < 2.3) return { loose: 0, lift: 0 };
  if (t < 3.1) return { loose: 0, lift: 0.4 * ease((t - 2.3) / 0.8) };
  return { loose: t < 4.2 ? 0 : 1, lift: 0.4 };
}

// ---------- Frame ----------
const dryGrounds = linear(0x8a5c38), wetGrounds = linear(0x2e1a0e), blonde = linear(0xa8743c), dark = linear(0x2e160a);
const tmp = V(0, 0, 0), spout = V(0, 0, 0);
startLoop(stage, (dt, now) => {
  if (state.playing) {
    stepMachine(sim, dt, { ...state.mode, grind: state.grind });
    state.stepTime += dt;
  }
  heatColor(state.glow, elementColor);
  update(state, focusStyle, reduced ? 1 : 0.09, dt);

  // The element glows while the thermostat has it on, and takes a moment to warm and cool.
  const glowTarget = sim.element ? 1 : 0;
  state.glow += (glowTarget - state.glow) * Math.min(1, dt * (reduced ? 60 : glowTarget ? 1.6 : 0.8));

  // Portafilter: the lock twist in step 4, a slight drop while it is unlocked.
  state.twist += (lockTwist() - state.twist) * Math.min(1, dt * (reduced ? 60 : 10));
  const pf = parts.portafilter.group;
  pf.rotation.y = state.twist;
  pf.position.y += state.twist * 0.08;
  const locked = state.lock && state.twist > -0.02;
  if (locked && !was.locked && state.stepTime > 1) sound.thunk(0.35);
  was.locked = locked;

  // Puck and tamper: loose grounds are 35% taller until the tamper presses them flat.
  const pose = state.step === TAMP_STEP ? tampPose() : { loose: 0, lift: 0 };
  parts.puck.meshes[0].scale.y = 1 + 0.35 * pose.loose;
  parts.tamper.group.position.y = PUCK.floor + PUCK.h * (1 + 0.35 * pose.loose) + pose.lift;
  parts.tamper.group.visible = (parts.tamper.meshes[0].userData.alpha ?? 0) > 0.01;
  const pressed = state.step === TAMP_STEP && pose.loose < 0.05 && pose.lift < 0.01;
  if (pressed && !was.pressed) sound.thunk(0.3);
  was.pressed = pressed;

  // The puck darkens as it soaks up water.
  const wetTarget = sim.phase === 'idle' ? 0 : Math.min(1, sim.soaked / ESPRESSO.soakMl);
  state.wet += (wetTarget - state.wet) * Math.min(1, dt * 3);
  parts.puck.meshes[0].material.color.copy(dryGrounds).lerp(wetGrounds, state.wet);

  // The pump shakes while it runs; the gauge needle follows the pressure.
  if (sim.pumpQ > 0 && !reduced && state.playing) parts.pump.group.position.x += Math.sin(now * 0.31) * 0.006;
  state.gauge += (sim.p - state.gauge) * Math.min(1, dt * (reduced ? 60 : 8));
  needle.rotation.z = -gaugeAngle(state.gauge);

  // Espresso in the glass. The top fifth is crema: a foam of coffee oils and the CO2 that
  // fresh coffee gives off, whipped up as the water leaves the puck at 9 bar.
  const fill = sim.cup / CUP.mlPerUnit;
  coffee.visible = crema.visible = fill > 0.002;
  coffee.scale.y = Math.max(0.001, fill * 0.8);
  crema.scale.y = Math.max(0.001, fill * 0.2);
  crema.position.y = CUP.floor + fill * 0.8;

  // Streams from the spouts down to the coffee in the cup. Coarse coffee runs pale and fast.
  const playing = state.playing ? 1 : 0;
  pf.updateMatrixWorld(true); parts.cup.group.updateMatrixWorld(true);
  const surface = parts.cup.group.localToWorld(tmp.set(0, CUP.floor + fill, 0)).y;
  const q = sim.puckQ;
  const tint = clamp01((grindAt(state.grind).r - 1.2) / 4);
  streams.forEach((mesh, i) => {
    pf.localToWorld(spout.copy(SPOUTS[i]));
    const length = spout.y - surface;
    mesh.visible = q > 0.3 && length > 0.05;
    if (!mesh.visible) return;
    const r = 0.01 + 0.012 * Math.sqrt(q);
    mesh.position.copy(spout); mesh.scale.set(r, length, r);
    mesh.material.color.copy(blonde).lerp(dark, tint);
  });
  // Drops run down the streams, and are all there is when a choked shot only drips.
  if (drops.fade(q > 0.05 ? (q < 0.8 ? 0.95 : 0.4) : 0, Math.min(1, dt * 6))) {
    drops.material.color.copy(blonde).lerp(dark, tint);
    drops.seeds.forEach((d, i) => {
      d.t = (d.t + dt * d.s * (0.9 + q * 0.25) * playing) % 1;
      pf.localToWorld(spout.copy(SPOUTS[d.side]));
      drops.place(i, spout.x, spout.y - d.t * d.t * (spout.y - surface), spout.z);
    });
    drops.commit();
  }

  // Water along the pipes: tank → pump → boiler while the pump runs, and back to the tank
  // through the over-pressure valve once it opens.
  if (flow.fade(sim.pumpQ > 0 ? 0.85 : 0, Math.min(1, dt * 5))) {
    flow.seeds.forEach((f, i) => {
      f.t = (f.t + dt * sim.pumpQ * (f.path === 'intake' ? 0.09 : 0.05) * playing) % 1;
      PATH[f.path].getPointAt(f.t, tmp); flow.place(i, tmp.x, tmp.y, tmp.z);
    });
    flow.commit();
  }
  if (giveBack.fade(sim.opvQ > 0.05 ? 0.85 : 0, Math.min(1, dt * 5))) {
    giveBack.seeds.forEach((b, i) => {
      b.t = (b.t + dt * (0.15 + sim.opvQ * 0.12) * playing) % 1;
      PATH.back.getPointAt(b.t, tmp); giveBack.place(i, tmp.x, tmp.y, tmp.z);
    });
    giveBack.commit();
  }
  if (drain.fade(sim.phase === 'vent' && !reduced ? 0.9 : 0, Math.min(1, dt * 8))) {
    drain.seeds.forEach((d, i) => {
      d.t = (d.t + dt * 0.9 * playing) % 1;
      PATH.drain.getPointAt(d.t, tmp); drain.place(i, tmp.x, tmp.y, tmp.z);
    });
    drain.commit();
  }
  // The shower: water falls from the screen over the whole puck.
  const showing = sim.pumpQ > 0 && !!state.cut && state.cut.includes('group');
  if (shower.fade(showing && !reduced ? 0.8 : 0, Math.min(1, dt * 5))) {
    const top = parts.screen.group.getWorldPosition(tmp).y - 0.01;
    const center = parts.puck.group.getWorldPosition(spout);
    const bottom = center.y + PUCK.h;
    shower.seeds.forEach((s, i) => {
      s.t = (s.t + dt * s.s * 1.4 * playing) % 1;
      shower.place(i, center.x + Math.cos(s.a) * s.r, top - s.t * s.t * (top - bottom), center.z + Math.sin(s.a) * s.r);
    });
    shower.commit();
  }

  playSounds(now);

  readoutTimer -= dt;
  if (readoutTimer <= 0) { showReadout(); readoutTimer = 0.15; }
});
story.setStep(0, false);
