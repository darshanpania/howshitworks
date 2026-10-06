import * as THREE from 'three';
import { createStage, addFloor, addStudioLights } from '../../src/engine/stage.js';
import { createParts, looksInside } from '../../src/engine/parts.js';
import { createCallouts } from '../../src/engine/callouts.js';
import { createStoryUI, bindRange } from '../../src/engine/story-ui.js';
import { sound } from '../../src/engine/sound.js';
import { startLoop, reducedMotion as reduced } from '../../src/engine/loop.js';
import { onThemeChange } from '../../src/site.js';
import { box, cylinder, lathe, roundedRect, extrudeUp } from '../../src/kit/shapes.js';
import { createMaterials } from '../../src/kit/materials.js';
import { softDot, createParticles, heatColor } from '../../src/kit/effects.js';
import { DISHWASHER_STORY } from './story.js';
import { DISHWASHER, armRpm, createSim, stepWasher } from './physics.js';

// ---------- Stage and light ----------
const stage = createStage(document.querySelector('#c'), {
  fov: 36, pbr: true, camera: { theta: 0.62, phi: 1.16, r: 17, target: [0, -0.3, 0] }, zoom: [8, 26], phiLimit: 0.25,
});
const { scene } = stage;
addStudioLights(stage, { key: [6, 10, 7], extent: 6, far: 32 });
const FLOOR_Y = -2.9;
addFloor(stage, FLOOR_Y, { size: 18, opacity: 0.16, height: 7 });

// ---------- Materials ----------
// A steel mesh: a light grid of round holes, for the filter.
function meshTexture(repeat) {
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const g = c.getContext('2d'); g.fillStyle = '#e8ecf0'; g.fillRect(0, 0, 32, 32);
  g.fillStyle = '#5a636c';
  for (const [x, y] of [[8, 8], [24, 8], [8, 24], [24, 24]]) { g.beginPath(); g.arc(x, y, 5, 0, Math.PI * 2); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); return t;
}
const M = createMaterials({
  shell: { look: 'brushed', color: 0xc9cfd6 },
  steel: 'steel', iron: 'iron', dark: 'dark', copper: 'copper', brass: 'brass',
  glass: { color: 0x161c22, metalness: 0.3, roughness: 0.12 },
  grey: { color: 0x9aa3ad, metalness: 0.05, roughness: 0.45 },              // spray arms, pipes, sump
  sump: { color: 0x7d8790, metalness: 0.05, roughness: 0.5, side: THREE.DoubleSide },
  rack: { color: 0xd5d9de, metalness: 0.05, roughness: 0.4 },               // vinyl-coated wire
  china: { color: 0xf6f4f0, metalness: 0, roughness: 0.2, side: THREE.DoubleSide },
  glaze: { color: 0x8fb0c4, metalness: 0, roughness: 0.22, side: THREE.DoubleSide },
  meshCup: { color: 0xd8dde2, metalness: 0.5, roughness: 0.35, map: meshTexture([12, 3]), side: THREE.DoubleSide },
  meshRing: { color: 0xd8dde2, metalness: 0.5, roughness: 0.35, map: meshTexture([9, 9]), side: THREE.DoubleSide },
  water: { color: 0x4f8fd0, metalness: 0, roughness: 0.3 },
  element: { color: 0x3c4249, metalness: 0.75, roughness: 0.35 },
  tablet: { color: 0xf4f6f8, roughness: 0.8 },
  tabletBlue: { color: 0x3d7fd6, roughness: 0.6 },
  hose: { color: 0x5d666f, roughness: 0.7 },
}, { pbr: true });

// ---------- Helpers ----------
const UP = new THREE.Vector3(0, 1, 0), ONE = new THREE.Vector3(1, 1, 1);
const v3 = p => new THREE.Vector3(...p);
// A thin cylinder from a to b, as geometry to merge (rack wires).
function rodGeometry(a, b, r = 0.022) {
  const A = v3(a), B = v3(b);
  const geo = new THREE.CylinderGeometry(r, r, A.distanceTo(B), 6, 1, true);
  const q = new THREE.Quaternion().setFromUnitVectors(UP, B.clone().sub(A).normalize());
  return geo.applyMatrix4(new THREE.Matrix4().compose(A.add(B).multiplyScalar(0.5), q, ONE));
}
// Indexed geometries (position, normal, uv) as one, so a rack or an arm is one draw call.
function merge(geos) {
  const out = { position: [], normal: [], uv: [] }, index = [];
  let offset = 0;
  geos.forEach(g => {
    for (const key in out) { const a = g.attributes[key].array; for (let i = 0; i < a.length; i++) out[key].push(a[i]); }
    const idx = g.index.array; for (let i = 0; i < idx.length; i++) index.push(idx[i] + offset);
    offset += g.attributes.position.count;
  });
  const geo = new THREE.BufferGeometry();
  for (const [key, a] of Object.entries(out)) geo.setAttribute(key, new THREE.Float32BufferAttribute(a, key === 'uv' ? 2 : 3));
  geo.setIndex(index); return geo;
}
// A rigid pipe through points: straight runs joined by round elbows.
function pipe(points, r, mat) {
  const g = new THREE.Group();
  for (let i = 0; i < points.length - 1; i++) {
    const a = v3(points[i]), b = v3(points[i + 1]);
    const run = new THREE.Mesh(new THREE.CylinderGeometry(r, r, a.distanceTo(b), 16, 1, true), mat);
    run.position.copy(a).add(b).multiplyScalar(0.5);
    run.quaternion.setFromUnitVectors(UP, b.clone().sub(a).normalize());
    g.add(run);
    const elbow = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 10), mat); elbow.position.copy(i ? a : b); g.add(elbow);
  }
  return g;
}
// A flexible hose along a smooth curve.
const hoseMesh = (curve, r, mat) => new THREE.Mesh(new THREE.TubeGeometry(curve, 160, r, 10, false), mat);
const along = (mesh, axis) => { if (axis === 'x') mesh.rotation.z = Math.PI / 2; else if (axis === 'z') mesh.rotation.x = Math.PI / 2; return mesh; };

// ---------- Parts ----------
// Scale: 1 unit ≈ 15 cm. The machine is 60 cm wide, 60 cm deep and 85 cm tall.
const W = 4, D = 4, TOP = 2.75, BASE = FLOOR_Y + 0.12;
const TUB = { x: 1.8, back: -1.75, front: 1.72, floor: -2.0, top: 2.45 };
const SUMP = { r: 0.55, bottom: -2.4 };
const LOWER_ARM_Y = -1.8, UPPER_ARM_Y = 0.38;
const root = new THREE.Group(); scene.add(root);
const { parts, add, update } = createParts(root, { shadows: true, lively: true });

// Cabinet and tub in one steel shell: side walls, top, back, a floor with the sump opening,
// and the base under it where the pumps live behind a kick plate.
{
  const shell = new THREE.Group();
  const h = TOP - BASE, y = (TOP + BASE) / 2;
  [-1, 1].forEach(s => shell.add(box([W / 2 - TUB.x, h, D], M.shell, [s * (W + 2 * TUB.x) / 4, y, 0], 0.03)));
  shell.add(box([W, TOP - TUB.top, D], M.shell, [0, (TOP + TUB.top) / 2, 0], 0.03));
  shell.add(box([2 * TUB.x, h, D / 2 + TUB.back], M.shell, [0, y, (TUB.back - D / 2) / 2], 0.02));
  const floor = roundedRect(2 * TUB.x, TUB.front - TUB.back, 0.04, 0, -(TUB.front + TUB.back) / 2);
  floor.holes.push(new THREE.Path().absarc(0, 0, SUMP.r, 0, Math.PI * 2, true));
  shell.add(extrudeUp(floor, 0.06, M.shell, TUB.floor - 0.06));
  shell.add(box([2 * TUB.x, TUB.floor - 0.06 - BASE, 0.05], M.dark, [0, (TUB.floor - 0.06 + BASE) / 2, D / 2 - 0.2], 0.01)); // kick plate
  [[-1, -1], [-1, 1], [1, -1], [1, 1]].forEach(([sx, sz]) => shell.add(cylinder(0.1, 0.12, 0.12, M.dark, [sx * 1.75, FLOOR_Y + 0.06, sz * 1.7], { segments: 16 })));
  add('shell', shell, new THREE.Vector3(), new THREE.Vector3(0, 0, -3.2));
}

// Door: steel front, a dark control strip along the top and a bar handle.
const DOOR_OUT = new THREE.Vector3(0, -0.2, 3.3);
{
  const door = new THREE.Group(), bottom = TUB.floor - 0.06, h = TOP - bottom;
  door.add(box([W, h, D / 2 - TUB.front], M.shell, [0, bottom + h / 2, (D / 2 + TUB.front) / 2], 0.05));
  door.add(box([W - 0.1, 0.3, 0.02], M.glass, [0, TOP - 0.2, D / 2 + 0.005], 0.008));
  [0.7, 1.0, 1.3, 1.6].forEach(x => door.add(along(cylinder(0.05, 0.05, 0.03, M.steel, [x, TOP - 0.2, D / 2 + 0.02], { segments: 16 }), 'z')));
  door.add(box([0.6, 0.12, 0.01], M.dark, [-1.2, TOP - 0.2, D / 2 + 0.02], 0.004));
  door.add(box([0.62, 0.46, 0.02], M.grey, [0.45, 0.9, TUB.front - 0.01], 0.008)); // back of the detergent cup
  door.add(box([1.8, 0.1, 0.09], M.steel, [0, TOP - 0.6, D / 2 + 0.13], 0.035));
  [-0.8, 0.8].forEach(x => door.add(box([0.07, 0.07, 0.12], M.steel, [x, TOP - 0.6, D / 2 + 0.05], 0.02)));
  add('door', door, new THREE.Vector3(), DOOR_OUT);
}

// Detergent dispenser on the inside of the door: an open cup, a sprung lid hinged at the
// bottom, and the tablet waiting inside. The back of the cup is the door panel, so with the
// door cut away you look straight into the cup.
const lidPivot = new THREE.Group(), tablet = new THREE.Group();
{
  const disp = new THREE.Group(); disp.position.set(0.45, 0.9, TUB.front - 0.06);
  [-1, 1].forEach(s => {
    disp.add(box([0.03, 0.46, 0.12], M.grey, [s * 0.295, 0, 0], 0.01));
    disp.add(box([0.62, 0.03, 0.12], M.grey, [0, s * 0.215, 0], 0.01));
  });
  disp.add(box([0.12, 0.05, 0.05], M.dark, [0, 0.245, -0.07], 0.01)); // latch
  lidPivot.position.set(0, -0.215, -0.075); disp.add(lidPivot);
  lidPivot.add(box([0.58, 0.43, 0.035], M.grey, [0, 0.215, 0], 0.012));
  tablet.add(box([0.36, 0.14, 0.09], M.tablet, [0, 0, 0], 0.02));
  tablet.add(box([0.362, 0.045, 0.092], M.tabletBlue, [0, 0.03, 0], 0.01));
  tablet.position.set(0, -0.12, -0.01); disp.add(tablet);
  add('dispenser', disp, new THREE.Vector3(), DOOR_OUT);
}
const TABLET_HOME = tablet.position.clone();

// Rinse aid: a twist cap on a small tank in the door.
{
  const rinse = new THREE.Group(); rinse.position.set(-0.45, 0.9, TUB.front - 0.03);
  rinse.add(along(cylinder(0.16, 0.16, 0.05, M.grey, [0, 0, 0], { segments: 32 }), 'z'));
  rinse.add(box([0.22, 0.05, 0.04], M.grey, [0, 0, -0.04], 0.015));
  rinse.add(along(cylinder(0.05, 0.05, 0.02, M.tabletBlue, [0.27, 0, 0], { segments: 16 }), 'z')); // level window
  add('rinseAid', rinse, new THREE.Vector3(), DOOR_OUT);
}

// The sump: a bowl under the tub floor that collects the water.
{
  const sump = new THREE.Group();
  sump.add(lathe([[0, SUMP.bottom], [0.45, SUMP.bottom], [0.51, SUMP.bottom + 0.06], [0.53, TUB.floor - 0.12], [SUMP.r + 0.04, TUB.floor - 0.04]], M.sump, { segments: 48 }));
  add('sump', sump, new THREE.Vector3(), new THREE.Vector3(0, -0.25, 0));
}

// Water: what fills the sump, and the thin layer over the tub floor. Scaled to the level each frame.
const pool = cylinder(0.52, 0.46, 1, M.water, [0, 0, 0], { segments: 40 });
const film = box([2 * TUB.x - 0.02, 1, TUB.front - TUB.back - 0.02], M.water, [0, 0, (TUB.front + TUB.back) / 2], 0);
{
  const water = new THREE.Group();
  [pool, film].forEach(m => { m.userData.water = m.userData.noGhost = m.userData.noShadow = true; water.add(m); });
  film.userData.film = true; // only a centimetre deep: keep it faint
  water.userData.anchor = [0.9, TUB.floor + 0.02, 0.6];
  add('water', water, new THREE.Vector3(), new THREE.Vector3(0, -0.25, 0));
}

// Filter: a coarse cup in the middle and a fine steel mesh around it.
{
  const filter = new THREE.Group();
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.18, 0.48, 32, 1, true), M.meshCup); cup.position.y = SUMP.bottom + 0.25; filter.add(cup);
  filter.add(along(cylinder(0.18, 0.18, 0.02, M.grey, [0, SUMP.bottom + 0.02, 0]), 'y'));
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.025, 8, 32), M.grey); rim.rotation.x = Math.PI / 2; rim.position.y = SUMP.bottom + 0.49; filter.add(rim);
  filter.add(box([0.34, 0.05, 0.06], M.grey, [0, SUMP.bottom + 0.52, 0], 0.02)); // twist handle
  const fine = new THREE.Mesh(new THREE.RingGeometry(0.2, SUMP.r - 0.01, 48), M.meshRing); fine.rotation.x = -Math.PI / 2; fine.position.y = TUB.floor - 0.035; filter.add(fine);
  const edge = new THREE.Mesh(new THREE.TorusGeometry(SUMP.r - 0.01, 0.02, 8, 48), M.grey); edge.rotation.x = Math.PI / 2; edge.position.y = TUB.floor - 0.035; filter.add(edge);
  add('filter', filter, new THREE.Vector3(), new THREE.Vector3(0, 1.75, 0));
}

// Spray arms: a hollow blade on a hub, nozzles along the top. The inner group spins.
const NOZZLES = { lower: [0.42, 0.72, 1.02, 1.36], upper: [0.38, 0.7, 1.1] };
function sprayArm(length, y, nozzles) {
  const arm = new THREE.Group(); arm.position.set(0, y, 0);
  const spin = new THREE.Group(); arm.add(spin);
  spin.add(cylinder(0.13, 0.15, 0.14, M.grey, [0, 0, 0], { segments: 24 }));
  spin.add(box([length, 0.08, 0.2], M.grey, [0, 0, 0], 0.035));
  spin.add(new THREE.Mesh(merge(nozzles.flatMap(r => [-1, 1].map(s => new THREE.CylinderGeometry(0.025, 0.03, 0.05, 10).translate(s * r, 0.06, 0)))), M.grey));
  arm.userData.anchor = [0, 0.08, 0];
  return { arm, spin };
}
const lowerArm = sprayArm(3.2, LOWER_ARM_Y, NOZZLES.lower);
add('lowerArm', lowerArm.arm, new THREE.Vector3(), new THREE.Vector3(0, 0.8, 0.9));
const upperArm = sprayArm(2.7, UPPER_ARM_Y, NOZZLES.upper);
add('upperArm', upperArm.arm, new THREE.Vector3(), new THREE.Vector3(0, 0.45, 0.8));

// Pipes: from the wash pump, under the floor, up the back wall to the upper arm.
{
  const feed = pipe([[0, -2.26, -0.75], [0, -2.26, -1.6], [0, UPPER_ARM_Y + 0.12, -1.6], [0, UPPER_ARM_Y + 0.12, 0]], 0.065, M.grey);
  feed.add(cylinder(0.09, 0.09, 0.1, M.grey, [0, UPPER_ARM_Y + 0.07, 0], { segments: 20 }));
  feed.userData.anchor = [0, -0.6, -1.6];
  add('pipes', feed, new THREE.Vector3(), new THREE.Vector3(0, 0, -0.8));
}

// Wash pump: an impeller housing (volute) behind the sump, driven by a motor on its right.
{
  const pump = new THREE.Group(), y = -2.48, z = -0.75;
  pump.add(along(cylinder(0.24, 0.24, 0.2, M.grey, [0, y, z], { segments: 32 }), 'x'));
  pump.add(along(cylinder(0.22, 0.22, 0.7, M.iron, [0.5, y, z], { segments: 32 }), 'x'));
  pump.add(along(cylinder(0.225, 0.225, 0.1, M.copper, [0.3, y, z], { segments: 32 }), 'x'));
  pump.add(along(cylinder(0.16, 0.2, 0.1, M.dark, [0.9, y, z], { segments: 32 }), 'x'));
  pump.add(pipe([[0, -2.38, -0.3], [0, -2.38, -0.55]], 0.08, M.grey));
  add('pump', pump, new THREE.Vector3(), new THREE.Vector3(0.5, -0.05, 1.5));
}

// Drain pump: smaller, on the right of the sump.
const DRAIN = [0.55, -2.52, 0.3];
{
  const drain = new THREE.Group(), [x, y, z] = DRAIN;
  drain.add(along(cylinder(0.17, 0.17, 0.14, M.grey, [x, y, z], { segments: 28 }), 'x'));
  drain.add(along(cylinder(0.15, 0.15, 0.5, M.iron, [x + 0.32, y, z], { segments: 28 }), 'x'));
  drain.add(along(cylinder(0.15, 0.11, 0.08, M.dark, [x + 0.6, y, z], { segments: 28 }), 'x'));
  drain.add(pipe([[0.25, -2.38, 0.15], [x - 0.07, y, z]], 0.06, M.grey));
  add('drainPump', drain, new THREE.Vector3(), new THREE.Vector3(1.4, -0.05, 1.0));
}

// Drain hose: out through the side of the base, up the outside into a high loop, and away
// along the floor to the sink drain.
const hoseCurve = new THREE.CatmullRomCurve3([
  [DRAIN[0], -2.36, DRAIN[2]], [0.9, -2.3, 0.1], [1.6, -2.35, -0.6], [2.0, -2.4, -1.2], [2.2, -2.3, -1.5],
  [2.2, -0.5, -1.62], [2.2, 1.4, -1.62], [2.22, 1.8, -1.35], [2.2, 1.4, -1.08], [2.2, -1.0, -1.0],
  [2.25, -2.5, -0.8], [2.7, -2.82, -0.5], [3.5, -2.84, -0.3],
].map(v3));
{
  const hose = new THREE.Group();
  hose.add(hoseMesh(hoseCurve, 0.07, M.hose));
  hose.add(along(cylinder(0.09, 0.09, 0.2, M.dark, [3.56, -2.84, -0.29]), 'x'));
  hose.userData.anchor = [2.22, 1.8, -1.35];
  add('hose', hose, new THREE.Vector3(), new THREE.Vector3(0.8, 0, -0.6));
}
const hosePoints = hoseCurve.getSpacedPoints(240);

// Inlet valve: a solenoid on the water supply, and a pipe up the side wall into the tub.
const INLET = new THREE.Vector3(-TUB.x + 0.06, -1.45, -1.3);
{
  const valve = new THREE.Group();
  valve.add(box([0.3, 0.24, 0.3], M.dark, [-1.45, -2.56, -1.45], 0.04));
  valve.add(cylinder(0.11, 0.11, 0.18, M.copper, [-1.45, -2.35, -1.45], { segments: 24 }));
  valve.add(cylinder(0.06, 0.06, 0.04, M.steel, [-1.45, -2.24, -1.45], { segments: 16 }));
  valve.add(along(cylinder(0.07, 0.07, 0.3, M.brass, [-1.45, -2.56, -1.72], { segments: 16 }), 'z'));
  valve.add(hoseMesh(new THREE.CatmullRomCurve3([[-1.45, -2.56, -1.86], [-1.48, -2.66, -2.5], [-1.62, -2.82, -3.3], [-1.8, -2.83, -3.9]].map(v3)), 0.06, M.hose));
  valve.add(pipe([[-1.45, -2.5, -1.3], [-1.9, -2.5, -1.3], [-1.9, INLET.y, -1.3], [INLET.x, INLET.y, -1.3]], 0.045, M.grey));
  valve.userData.anchor = [-1.45, -2.4, -1.45];
  add('valve', valve, new THREE.Vector3(), new THREE.Vector3(-1.2, 0, -1.2));
}

// Heater: a tubular element on the tub floor, looped around the sump under the lower arm.
{
  const heater = new THREE.Group(), ex = 1.25, ez = 1.05, y = TUB.floor + 0.06, a0 = 0.18;
  const pts = [new THREE.Vector3(ex * Math.sin(a0), TUB.floor - 0.28, ez * Math.cos(a0))];
  for (let i = 0; i <= 48; i++) { const a = a0 + (Math.PI * 2 - 2 * a0) * i / 48; pts.push(new THREE.Vector3(ex * Math.sin(a), y, ez * Math.cos(a))); }
  pts.push(new THREE.Vector3(-ex * Math.sin(a0), TUB.floor - 0.28, ez * Math.cos(a0)));
  const element = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'centripetal'), 240, 0.04, 10, false), M.element);
  element.userData.heater = true; heater.add(element);
  [-1, 1].forEach(s => heater.add(box([0.12, 0.1, 0.12], M.dark, [s * ex * Math.sin(a0), TUB.floor - 0.3, ez * Math.cos(a0)], 0.02)));
  heater.userData.anchor = [ex * 0.72, y, ez * 0.7];
  add('heater', heater, new THREE.Vector3(), new THREE.Vector3(0, 0.35, 0.3));
}

// Temperature sensor: a thermistor whose tip pokes through the floor into the water.
{
  const sensor = new THREE.Group(), x = -0.66, z = 0.38;
  sensor.add(cylinder(0.06, 0.06, 0.2, M.dark, [x, -2.2, z], { segments: 16 }));
  sensor.add(cylinder(0.065, 0.065, 0.05, M.brass, [x, -2.07, z], { segments: 16 }));
  sensor.add(pipe([[x, -2.3, z], [x - 0.3, -2.45, z + 0.15], [x - 0.75, -2.5, z + 0.2]], 0.015, M.copper));
  add('sensor', sensor, new THREE.Vector3(), new THREE.Vector3(-0.8, -0.1, 0.8));
}

// Racks: vinyl-coated wire baskets on wheels, merged into one mesh each.
function rack({ y0, y1, x = 1.62, z = 1.45, tines = [] }) {
  const g = new THREE.Group(), rods = [];
  for (let i = 0; i <= 12; i++) { const px = -x + i * 2 * x / 12; rods.push(rodGeometry([px, y0, -z], [px, y0, z])); }
  for (let i = 0; i <= 10; i++) { const pz = -z + i * 2 * z / 10; rods.push(rodGeometry([-x, y0, pz], [x, y0, pz])); }
  [[-x, -z, x, -z], [-x, z, x, z], [-x, -z, -x, z], [x, -z, x, z]].forEach(([ax, az, bx, bz]) => {
    rods.push(rodGeometry([ax, y1, az], [bx, y1, bz], 0.03));
    rods.push(rodGeometry([ax, (y0 + y1) / 2, az], [bx, (y0 + y1) / 2, bz]));
  });
  for (let i = 0; i <= 6; i++) { const px = -x + i * 2 * x / 6; [-z, z].forEach(pz => rods.push(rodGeometry([px, y0, pz], [px, y1, pz]))); }
  for (let i = 1; i < 5; i++) { const pz = -z + i * 2 * z / 5; [-x, x].forEach(px => rods.push(rodGeometry([px, y0, pz], [px, y1, pz]))); }
  tines.forEach(([px, pz, h]) => rods.push(rodGeometry([px, y0, pz], [px, y0 + h, pz], 0.018)));
  g.add(new THREE.Mesh(merge(rods), M.rack));
  const wheels = [];
  [-1, 1].forEach(sx => [-1, 1].forEach(sz => {
    const w = new THREE.CylinderGeometry(0.1, 0.1, 0.05, 16).rotateZ(Math.PI / 2).translate(sx * (x + 0.05), y0, sz * (z - 0.3));
    wheels.push(w);
  }));
  g.add(new THREE.Mesh(merge(wheels), M.dark));
  return g;
}

// Dishes. Plates are a lathe profile stood on edge; cups and bowls sit upside down.
function plateGeometry(R) {
  return new THREE.LatheGeometry([[0, 0], [R * 0.58, 0], [R * 0.86, R * 0.08], [R, R * 0.13], [R * 0.985, R * 0.155], [R * 0.85, R * 0.11], [R * 0.58, R * 0.035], [0, R * 0.035]]
    .map(([r, y]) => new THREE.Vector2(r, y)), 48).rotateX(Math.PI / 2);
}
function cupGeometry(r, h) {
  return new THREE.LatheGeometry([[0, h - 0.04], [r - 0.03, h - 0.05], [r - 0.03, 0], [r, 0], [r + 0.01, h - 0.03], [r - 0.03, h], [0, h]]
    .map(([a, b]) => new THREE.Vector2(a, b)), 32);
}
function bowlGeometry(r, h) {
  return new THREE.LatheGeometry([[0, h - 0.03], [r * 0.7, h - 0.06], [r - 0.03, 0], [r, 0], [r * 0.74, h], [0, h + 0.005]]
    .map(([a, b]) => new THREE.Vector2(a, b)), 40);
}

const LOWER = { y0: -1.6, y1: -1.0 };
const PLATES = [];
for (let i = 0; i < 6; i++) PLATES.push({ x: -0.82, z: -1.15 + i * 0.46, R: 0.75 }, { x: 0.86, z: -1.15 + i * 0.46, R: 0.6 });
{
  const tines = [];
  [-1.38, -0.92, -0.46, 0, 0.46, 0.92, 1.38].forEach(z => [-1.35, -0.3, 0.38, 1.32].forEach(x => tines.push([x, z, 0.42])));
  const g = rack({ ...LOWER, tines });
  const big = plateGeometry(0.75), small = plateGeometry(0.6);
  PLATES.forEach((p, i) => {
    const plate = new THREE.Mesh(p.R > 0.7 ? big : small, M.china);
    plate.position.set(p.x, LOWER.y0 + p.R + 0.04, p.z); plate.rotation.x = i % 4 < 2 ? 0.06 : -0.06; g.add(plate);
  });
  add('lowerRack', g, new THREE.Vector3(), new THREE.Vector3(0, 0.25, 2.5));
}

const UPPER = { y0: 0.62, y1: 1.1 };
{
  const tines = [];
  [-0.4, 0.5].forEach(z => [-1.56, -0.78, 0, 0.78, 1.56].forEach(x => tines.push([x, z, 0.3])));
  const g = rack({ ...UPPER, tines });
  const glass = cupGeometry(0.21, 0.78), cup = cupGeometry(0.25, 0.55), bowl = bowlGeometry(0.5, 0.3);
  [-1.17, -0.39, 0.39, 1.17].forEach((x, i) => {
    const tall = new THREE.Mesh(glass, M.glaze); tall.position.set(x, UPPER.y0 + 0.03, -0.9); g.add(tall);
    const mug = new THREE.Mesh(cup, i % 2 ? M.glaze : M.china); mug.position.set(x, UPPER.y0 + 0.03, 0.05); g.add(mug);
  });
  [-0.8, 0.8].forEach((x, i) => {
    const b = new THREE.Mesh(bowl, M.china); b.position.set(x, UPPER.y0 + 0.08, 0.95); b.rotation.x = 0.35; b.rotation.z = i ? -0.08 : 0.08; g.add(b);
  });
  add('upperRack', g, new THREE.Vector3(), new THREE.Vector3(0, 1.2, 1.8));
}

// Food on the plates: crumbs of rice, greens, curry and dal. The filter step washes them down.
const FOOD_COLORS = [0x8a5a2b, 0x6f8f3a, 0xb04a2e, 0xd9a93a];
const crumbGeo = new THREE.SphereGeometry(0.045, 10, 8);
const foodMats = FOOD_COLORS.map(c => createMaterials({ f: { color: c, roughness: 0.8, transparent: true } }, { pbr: true }).f);
const food = PLATES.slice(0, 10).flatMap((p, i) => [0, 1].map(k => {
  const a = Math.random() * Math.PI * 2, r = p.R * (0.25 + Math.random() * 0.4);
  const mesh = new THREE.Mesh(crumbGeo, foodMats[(i + k) % 4]); root.add(mesh);
  const plate = new THREE.Vector3(p.x + Math.cos(a) * r, LOWER.y0 + p.R + 0.04 + Math.sin(a) * r, p.z + 0.07);
  const ca = Math.random() * Math.PI * 2, cr = Math.random() * 0.12;
  return {
    mesh, plate, delay: (i * 2 + k) * 0.18,
    floor: new THREE.Vector3(plate.x * 0.85, TUB.floor + 0.04, plate.z * 0.85),
    cup: new THREE.Vector3(Math.cos(ca) * cr, SUMP.bottom + 0.08 + (i * 2 + k) * 0.012, Math.sin(ca) * cr),
  };
}));

// ---------- Water in motion ----------
const dot = softDot();
const lowerJets = createParticles(scene, 300, { size: 0.2, map: dot, seed: () => ({ k: Math.random() * 4 | 0, side: Math.random() < 0.5 ? -1 : 1, t: Math.random(), j: Math.random() - 0.5, s: 0.85 + Math.random() * 0.3 }) });
const upperJets = createParticles(scene, 190, { size: 0.19, map: dot, seed: () => ({ k: Math.random() * 3 | 0, side: Math.random() < 0.5 ? -1 : 1, down: Math.random() < 0.3, t: Math.random(), j: Math.random() - 0.5, s: 0.85 + Math.random() * 0.3 }) });
const rain = createParticles(scene, 170, { size: 0.15, map: dot, seed: () => ({ x: (Math.random() - 0.5) * 3.2, z: (Math.random() - 0.5) * 2.8, top: Math.random() < 0.6 ? -0.25 : UPPER.y1 + 0.2, t: Math.random(), s: 0.7 + Math.random() * 0.6 }) });
const inflow = createParticles(scene, 60, { size: 0.2, map: dot, seed: () => ({ t: Math.random(), j: Math.random() - 0.5, s: 0.8 + Math.random() * 0.4 }) });
const outflow = createParticles(scene, 110, { size: 0.24, map: dot, seed: () => ({ u: Math.random(), j: [Math.random() - 0.5, Math.random() - 0.5] }) });
const condense = createParticles(scene, 70, { size: 0.16, map: dot, seed: () => ({ wall: Math.random() * 3 | 0, u: (Math.random() - 0.5) * 2.6, y0: TUB.top - Math.random() * 1.2, t: Math.random(), s: 0.5 + Math.random() }) });
const fizz = createParticles(scene, 40, { size: 0.15, map: dot, seed: () => ({ a: Math.random() * Math.PI * 2, r: Math.random(), t: Math.random(), s: 0.6 + Math.random() * 0.8 }) });
fizz.material.color.set(0x5fc4d6).convertSRGBToLinear();
const steam = createParticles(scene, 110, {
  color: 0x9fb2c6, size: 0.7, map: dot, // grey-blue so it shows on a light page
  seed: () => ({ x: (Math.random() - 0.5) * 3, z: (Math.random() - 0.5) * 2.6, y0: Math.random() < 0.55 ? -0.4 : UPPER.y1 + 0.3, t: Math.random(), s: 0.4 + Math.random() * 0.5 }),
});
// Water reads blue on the pale paper and a lighter blue on blueprint navy.
const WATER_DOTS = [lowerJets, upperJets, rain, inflow, outflow, condense];
onThemeChange(theme => WATER_DOTS.forEach(p => p.material.color.set(theme === 'dark' ? 0x8cc8ff : 0x2f78c4).convertSRGBToLinear()));

// ---------- State and UI ----------
const state = {
  step: 0, explode: 0, targetExplode: 0, playing: true, focus: [], cut: false, mode: {},
  jetAngle: 10, run: 0, heat: 0, lid: 0, stepTime: 0, lowerAngle: 0, upperAngle: 0,
  tablet: { y: 0, v: 0, scale: 1, landed: false },
};
const sim = createSim();
const story = createStoryUI({
  story: DISHWASHER_STORY, state,
  onStep: (s, index) => {
    // Going forward keeps the water's heat; jumping back restarts the step from its own start.
    const back = index < (state.lastStep ?? -1); state.lastStep = index;
    sim.litres = s.litres; sim.T = back ? s.startT : Math.max(sim.T, s.startT);
    if (s.mode.dry || s.mode.drain) sim.T = s.startT;
    sim.heaterOn = false;
    state.focus = s.focus; state.cut = s.cut; state.mode = s.mode; state.index = index; state.stepTime = 0;
    // Before the main wash the tablet waits in its cup; after it, the cup is open and empty.
    state.dispense = index < 3 ? 'closed' : index === 3 ? 'drop' : 'gone';
    Object.assign(state.tablet, { y: 0, v: 0, scale: state.dispense === 'gone' ? 0 : 1, landed: false });
  },
});
bindRange('angle', v => { state.jetAngle = v; document.getElementById('angle-out').textContent = `${v}°`; });
createCallouts(stage, { parts, state, story: DISHWASHER_STORY });

const INSIDE = ['shell', 'door'];
const ON_DOOR = ['dispenser', 'rinseAid']; // cut away with the door unless they are in focus
const BLACK = new THREE.Color(0x000000), heaterGlow = new THREE.Color();
const focusStyle = {
  highlight: 0.15,
  opacity(name, mesh, hot) {
    if (mesh.userData.water) return mesh.userData.film ? 0.3 : 0.55;
    let alpha = 1;
    if (state.cut && INSIDE.includes(name)) alpha = hot ? 0.35 : 0.12; // cut away to show the inside
    if (state.cut && ON_DOOR.includes(name) && !hot) alpha = 0.12;
    if (state.focus.length && !hot && !INSIDE.includes(name) && looksInside(state)) alpha = Math.min(alpha, 0.3);
    return alpha;
  },
  decorate(material, { mesh }) {
    if (!material.emissive) return;
    if (mesh.userData.heater) { material.emissive.copy(heaterGlow); material.emissiveIntensity = 1; return; }
    const glow = mesh.userData.glow ?? 0;
    material.emissive.copy(glow > 0.001 ? material.color : BLACK); material.emissiveIntensity = glow;
  },
};

const readout = { box: document.getElementById('readout'), w: document.getElementById('r-water'), t: document.getElementById('r-temp'), a: document.getElementById('r-arms') };
let readoutTimer = 0, lowerRpm = 0;
function showReadout() {
  readout.w.textContent = `${sim.litres.toFixed(1)} L`;
  readout.t.textContent = `${sim.T.toFixed(0)}°C${sim.heaterOn ? ' · heating' : ''}`;
  readout.a.textContent = `${Math.round(lowerRpm * state.run)} rpm`;
  readout.box.classList.toggle('hot', sim.heaterOn);
}

// ---------- Sound ----------
// The inlet hiss, the wash motor's 100 Hz hum under a swish of spray that rises as an arm
// sweeps past, a relay click when the heater switches, the lid popping, the drain pump's buzz
// and gurgle, and drips while it dries.
const inletHiss = sound.loop({ type: 'noise', filter: 'bandpass', freq: 1400, q: 1.2 });
const motorHum = sound.loop({ type: 'tone', wave: 'sawtooth', freq: 100 });
const spraySwish = sound.loop({ type: 'noise', filter: 'bandpass', freq: 2600, q: 0.6 });
const drainHum = sound.loop({ type: 'tone', wave: 'triangle', freq: 100 });
const gurgle = sound.loop({ type: 'noise', filter: 'lowpass', freq: 450, q: 3 });
const was = { valve: false, heater: false, lid: 0, landed: false, drip: 1 };
function playSounds(now, dt) {
  const on = state.playing ? 1 : 0;
  inletHiss.set(sim.valveOpen ? 0.07 * on : 0);
  motorHum.set(0.01 * state.run * on);
  spraySwish.set(0.06 * state.run * on * (0.7 + 0.3 * Math.abs(Math.sin(state.lowerAngle))), 2400 + 400 * Math.sin(state.upperAngle * 2));
  drainHum.set(sim.draining ? 0.016 * on : 0);
  gurgle.set(sim.draining ? 0.08 * on * (0.55 + 0.45 * Math.sin(now / 90) * Math.sin(now / 37)) : 0);
  if (sim.valveOpen !== was.valve) sound.click(0.3); // the solenoid pulls in or lets go
  if (sim.heaterOn !== was.heater) sound.click(0.18); // the heater relay
  if (state.lid > 0.3 && was.lid <= 0.3) { sound.click(0.35); sound.thunk(0.12); }
  if (state.tablet.landed && !was.landed) sound.thunk(0.18);
  was.drip -= dt;
  if (state.mode.dry && state.playing && was.drip <= 0) { sound.tone({ freq: 1300 + Math.random() * 500, glide: 2600, gain: 0.05, release: 0.07 }); was.drip = 0.5 + Math.random() * 1.5; }
  was.valve = sim.valveOpen; was.heater = sim.heaterOn; was.lid = state.lid; was.landed = state.tablet.landed;
}

// ---------- Frame ----------
const hub = new THREE.Vector3(), p = new THREE.Vector3(), tmp = new THREE.Vector3();
const ease = (from, to, rate, dt) => from + (to - from) * Math.min(1, dt * (reduced ? 60 : rate));
// One jet of droplets from a spinning arm. The drop leaves the nozzle where the arm was
// `age` seconds ago and keeps that heading, so the spray trails the arm in a fan.
function placeJet(jets, i, d, center, nozzle, angle, omega, lean, height) {
  const age = d.t * 0.38, a = angle - age * omega;
  const rise = height * (1 - (1 - d.t) ** 2);
  const x = nozzle * d.side + d.j * 0.06 * d.t, z = d.side * lean * Math.abs(rise) * 0.7 + d.j * 0.08 * d.t;
  jets.place(i, center.x + x * Math.cos(a) + z * Math.sin(a), center.y + 0.06 + rise, center.z - x * Math.sin(a) + z * Math.cos(a));
}

startLoop(stage, (dt, now) => {
  dt = Math.max(0, dt); // the first frame's timestamp can come before the loop started
  heatColor(state.heat * 0.55, heaterGlow);
  update(state, focusStyle, reduced ? 1 : 0.09, dt);
  const playing = state.playing ? 1 : 0, mode = state.mode;
  if (state.playing) { state.stepTime += dt; stepWasher(sim, dt, mode); }

  // Wash pump and spray arms: the pump spins up and coasts down; the arms follow the jets.
  state.run = ease(state.run, mode.pump && sim.litres > 1 ? 1 : 0, 1.5, dt);
  lowerRpm = armRpm(state.jetAngle, DISHWASHER.lowerArmM);
  const upperRpm = armRpm(state.jetAngle, DISHWASHER.upperArmM);
  const wLow = lowerRpm * state.run * Math.PI / 30, wUp = -upperRpm * state.run * Math.PI / 30;
  state.lowerAngle += wLow * dt * playing; state.upperAngle += wUp * dt * playing;
  lowerArm.spin.rotation.y = state.lowerAngle; upperArm.spin.rotation.y = state.upperAngle;
  state.heat = ease(state.heat, sim.heaterOn ? 1 : 0, 1.2, dt);

  // Water level: the sump fills first, then a thin layer spreads over the floor. While the
  // pump runs, about 1.2 litres is up in the pipes, the arms and the air.
  const shown = Math.max(0, sim.litres - 1.2 * state.run);
  const depth = Math.min(1, shown / 0.9) * (TUB.floor - SUMP.bottom - 0.02), layer = Math.min(1, Math.max(0, shown - 0.9) / 2.6) * 0.05;
  pool.visible = depth > 0.004; pool.scale.y = Math.max(depth, 0.001); pool.position.y = SUMP.bottom + 0.01 + depth / 2;
  film.visible = layer > 0.002; film.scale.y = Math.max(layer, 0.001); film.position.y = TUB.floor + layer / 2;

  // Jets: straight up from the lower arm into the plates; up into the cups and down from the upper arm.
  const lean = Math.sin(state.jetAngle * Math.PI / 180);
  const spray = state.run > 0.15 ? Math.min(0.95, state.run) : 0;
  if (lowerJets.fade(spray, Math.min(1, dt * 4))) {
    hub.copy(parts.lowerArm.group.position).add(lowerArm.arm.position);
    lowerJets.seeds.forEach((d, i) => {
      d.t = (d.t + dt * d.s * 2.6 * playing) % 1;
      placeJet(lowerJets, i, d, hub, NOZZLES.lower[d.k], state.lowerAngle, wLow, lean, 1.5);
    });
    lowerJets.commit();
  }
  if (upperJets.fade(spray, Math.min(1, dt * 4))) {
    hub.copy(parts.upperArm.group.position).add(upperArm.arm.position);
    upperJets.seeds.forEach((d, i) => {
      d.t = (d.t + dt * d.s * 2.6 * playing) % 1;
      placeJet(upperJets, i, d, hub, NOZZLES.upper[d.k], state.upperAngle, wUp, -lean, d.down ? -0.9 : 0.85);
    });
    upperJets.commit();
  }
  // Water falls back off the racks to the floor.
  if (rain.fade(spray * 0.7, Math.min(1, dt * 3))) {
    rain.seeds.forEach((d, i) => {
      d.t = (d.t + dt * d.s * 1.3 * playing) % 1;
      rain.place(i, d.x, d.top - (d.top - TUB.floor) * d.t * d.t, d.z);
    });
    rain.commit();
  }
  // Tap water pours in from the inlet on the side wall.
  const valveAt = parts.valve.group.position;
  if (inflow.fade(sim.valveOpen ? 0.85 : 0, Math.min(1, dt * 6))) {
    inflow.seeds.forEach((d, i) => {
      d.t = (d.t + dt * d.s * 2.2 * playing) % 1;
      inflow.place(i, valveAt.x + INLET.x + 0.45 * d.t, valveAt.y + INLET.y - (INLET.y - TUB.floor) * d.t * d.t, valveAt.z + INLET.z + d.j * 0.08);
    });
    inflow.commit();
  }
  // Dirty water runs along the drain hose and over the high loop.
  const hoseAt = parts.hose.group.position;
  if (outflow.fade(sim.draining ? 0.9 : 0, Math.min(1, dt * 5))) {
    outflow.seeds.forEach((d, i) => {
      d.u = (d.u + dt * 0.32 * playing) % 1;
      p.copy(hosePoints[Math.floor(d.u * (hosePoints.length - 1))]).add(hoseAt);
      outflow.place(i, p.x + d.j[0] * 0.07, p.y + d.j[1] * 0.07, p.z);
    });
    outflow.commit();
  }

  // Detergent: the lid pops a second into the step, the tablet drops, lands and dissolves.
  const tab = state.tablet;
  const lidTarget = state.dispense === 'gone' || (state.dispense === 'drop' && state.stepTime > 1) ? 1 : 0;
  state.lid = ease(state.lid, lidTarget, lidTarget ? 9 : 4, dt);
  lidPivot.rotation.x = -state.lid * 1.75;
  const dropTo = TUB.floor + 0.08 - (0.9 + TABLET_HOME.y);
  if (state.dispense === 'drop' && state.lid > 0.6 && !tab.landed && state.playing) {
    tab.v -= 9 * dt; tab.y += tab.v * dt;
    if (tab.y <= dropTo) { tab.y = dropTo; tab.landed = true; }
  }
  if (tab.landed && state.playing) tab.scale = Math.max(0, tab.scale - dt / 7 * state.run);
  const fall = tab.y / dropTo || 0;
  tablet.position.set(TABLET_HOME.x, TABLET_HOME.y + tab.y, TABLET_HOME.z - 0.12 * Math.min(1, fall * 3));
  tablet.rotation.set(fall * 1.4, fall * 0.6, 0);
  tablet.scale.setScalar(Math.max(0.001, tab.scale)); tablet.visible = tab.scale > 0.01;
  tablet.getWorldPosition(p);
  if (fizz.fade(tab.landed && tab.scale > 0.05 ? 0.8 : 0, Math.min(1, dt * 4))) {
    fizz.seeds.forEach((d, i) => {
      d.t = (d.t + dt * d.s * 0.8 * playing) % 1;
      const r = 0.1 + d.r * 0.5 * d.t;
      fizz.place(i, p.x + Math.cos(d.a) * r, TUB.floor + 0.05 + d.t * 0.25, p.z + Math.sin(d.a) * r * 0.6);
    });
    fizz.commit();
  }

  // Food: on the plates until the filter step washes it down into the filter cup.
  const rackAt = parts.lowerRack.group.position, filterAt = parts.filter.group.position;
  const rackAlpha = parts.lowerRack.meshes[0].userData.alpha ?? 1;
  food.forEach(f => {
    const t = state.index < 5 ? 0 : state.index > 5 ? 1 : Math.min(1, Math.max(0, (state.stepTime - 0.8 - f.delay) / 1.6));
    if (t <= 0) p.copy(f.plate).add(rackAt);
    else if (t < 0.5) p.copy(f.plate).add(rackAt).lerp(f.floor, (t * 2) ** 2);
    else p.copy(f.floor).lerp(tmp.copy(f.cup).add(filterAt), (t - 0.5) * 2);
    f.mesh.position.copy(p);
    f.mesh.material.opacity = t > 0 ? 1 : Math.min(1, rackAlpha * 1.4);
  });

  // Drying: steam leaves the hot dishes, beads on the cooler walls and runs down.
  const drying = mode.dry ? Math.min(1, Math.max(0, (sim.T - 35) / 25)) : 0;
  if (steam.fade(drying * 0.32, Math.min(1, dt * 2))) {
    steam.seeds.forEach((d, i) => {
      d.t = (d.t + dt * d.s * 0.25 * playing) % 1;
      steam.place(i, d.x + Math.sin(d.t * 5 + i) * 0.12, d.y0 + d.t * 1.4, d.z + Math.cos(d.t * 4 + i) * 0.1);
    });
    steam.commit();
  }
  if (condense.fade(mode.dry ? 0.75 : 0, Math.min(1, dt * 2))) {
    const shellAt = parts.shell.group.position;
    condense.seeds.forEach((d, i) => {
      d.t = (d.t + dt * d.s * 0.12 * playing) % 1;
      const y = d.y0 - (d.y0 - TUB.floor) * d.t;
      const x = d.wall === 0 ? -TUB.x + 0.03 : d.wall === 1 ? TUB.x - 0.03 : d.u * 1.3;
      const z = d.wall === 2 ? TUB.back + 0.03 : d.u * 1.2;
      condense.place(i, shellAt.x + x, shellAt.y + y, shellAt.z + z);
    });
    condense.commit();
  }

  playSounds(now, dt);
  readoutTimer -= dt;
  if (readoutTimer <= 0) { showReadout(); readoutTimer = 0.15; }
});
story.setStep(0, false);
