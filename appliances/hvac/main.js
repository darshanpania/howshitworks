import * as THREE from 'three';
import { BufferGeometryUtils } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createStage, addFloor, addStudioLights } from '../../src/engine/stage.js';
import { createParts, looksInside } from '../../src/engine/parts.js';
import { createCallouts } from '../../src/engine/callouts.js';
import { createStoryUI, showRange } from '../../src/engine/story-ui.js';
import { sound } from '../../src/engine/sound.js';
import { startLoop, reducedMotion as reduced } from '../../src/engine/loop.js';
import { onPalette } from '../../src/engine/studio.js';
import { track } from '../../src/analytics.js';
import { box, cylinder, roundedRect, extrudeUp } from '../../src/kit/shapes.js';
import { createMaterials, linear } from '../../src/kit/materials.js';
import { softDot, heatColor } from '../../src/kit/effects.js';
import { HVAC_STORY } from './story.js';
import { createSim, stepHvac, supplyTempC, statusText } from './hvac.js';
import {
  FLOOR, CEILING, CUT, FURNACE, COIL, BLOWER, RETURN_GRILLE, TRUNK, REGISTERS, OUTDOOR, THERMOSTAT,
  airLoop, AIR_KEYS, lineSet,
} from './layout.js';

// ---------- Stage and light ----------
// Scale: 1 unit = 1 m. A 9 × 6 m single-storey house, cut away like a floor plan: the back and
// left walls stand full height, the rest stop at 1.1 m. Ducts run in the attic above the ceiling.
const VIEWS = {
  house: { r: 17.5, theta: 0.62, phi: 1.02, target: [0.7, 1.15, 0] },
  thermostat: { r: 3.6, theta: 0.2, phi: 1.12, target: [0.1, 1.3, -1.75] },
  closet: { r: 4.8, theta: 0.22, phi: 1.08, target: [0.25, 0.85, -1.95] },
  furnace: { r: 3.8, theta: 0.25, phi: 1.18, target: [0.25, 1.0, -2.35] },
  burners: { r: 3.3, theta: 0.3, phi: 1.12, target: [0.25, 1.25, -2.35] },
  outdoor: { r: 11.5, theta: 0.85, phi: 1.08, target: [2.8, 1.5, -1.7] },
  coil: { r: 11, theta: 0.95, phi: 0.98, target: [3.0, 1.25, -1.9] },
};
const stage = createStage(document.getElementById('c'), {
  fov: 38, pbr: true, camera: VIEWS.house, zoom: [2.5, 30], phiLimit: 0.2,
});
const { scene, cam } = stage;
stage.camera.far = 200; stage.camera.updateProjectionMatrix();
addStudioLights(stage, { key: [6, 14, 9], extent: 9, far: 45, shadowMap: 2048 });
addFloor(stage, 0, { size: 30, opacity: 0.14, center: [0.6, 0], shadowSize: 15, height: 4.5, blur: 3, darkness: 1 }); // 1 m grid

// ---------- Textures ----------
// Fins, grilles and slots: a strip of light and dark lines, repeated `count` times across.
function stripes(count, { vertical = true, light = '#ffffff', dark = '#7e868f', duty = 0.4 } = {}) {
  const c = document.createElement('canvas'); c.width = vertical ? 32 : 2; c.height = vertical ? 2 : 32;
  const g = c.getContext('2d'); g.fillStyle = light; g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = dark; g.fillRect(0, 0, vertical ? 32 * duty : 2, vertical ? 2 : 32 * duty);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.encoding = THREE.sRGBEncoding;
  t.repeat.set(vertical ? count : 1, vertical ? 1 : count); t.anisotropy = 4;
  return t;
}

// ---------- Materials ----------
const M = createMaterials({
  floor: { color: 0xb3845a, roughness: 0.6 },
  slab: { color: 0xb5afa4, roughness: 0.95 },
  wall: { color: 0xece8e0, roughness: 0.92 },
  cap: { color: 0x2b3138, roughness: 0.7 },
  door: { color: 0xd9d1c1, roughness: 0.7 },
  frame: { color: 0xf7f6f2, roughness: 0.5 },
  glass: { color: 0xbfd9ea, roughness: 0.05 },
  sofa: { color: 0x7d8c70, roughness: 0.95 },
  rug: { color: 0x5d7896, roughness: 1 },
  wood: { color: 0x8b6a4c, roughness: 0.7 },
  linen: { color: 0xf1eee7, roughness: 0.9 },
  blanket: { color: 0x6f87a8, roughness: 0.95 },
  duct: { color: 0xaab2bb, metalness: 0.75, roughness: 0.32 },
  flex: { color: 0xb9bfc6, metalness: 0.6, roughness: 0.38 },
  register: { color: 0xf4f3ef, roughness: 0.5, map: stripes(9, { vertical: false, dark: '#9aa1a8' }) },
  grille: { color: 0xf4f3ef, roughness: 0.5, map: stripes(12, { vertical: false, dark: '#6b737b', duty: 0.5 }) },
  cabinet: { color: 0x9ba5af, metalness: 0.45, roughness: 0.42 },
  galv: { look: 'brushed', color: 0xc8ced5 },
  dark: 'dark', copper: 'copper', brass: 'brass',
  iron: { color: 0x3a3f45, metalness: 0.6, roughness: 0.5 },
  exchanger: { color: 0x737a82, metalness: 0.65, roughness: 0.45 },
  burner: { color: 0xa9afb6, metalness: 0.8, roughness: 0.3 },
  igniter: { color: 0x4a4440, roughness: 0.6 },
  pvc: { color: 0xefeee9, roughness: 0.45 },
  fins: { color: 0xd5dae0, metalness: 0.55, roughness: 0.35, map: stripes(30) },
  outFins: { color: 0xc9ced4, metalness: 0.55, roughness: 0.4, map: stripes(46) },
  pan: { color: 0x22272c, roughness: 0.6 },
  board: { color: 0x2f6b45, roughness: 0.6 },
  filter: { color: 0xf5f4ee, roughness: 0.95, side: THREE.DoubleSide },
  cardboard: { color: 0xc4a87a, roughness: 0.9 },
  outdoor: { color: 0x8f969d, metalness: 0.4, roughness: 0.45 },
  fan: { color: 0x22272c, roughness: 0.5, side: THREE.DoubleSide },
  compressor: { color: 0x2e3a35, metalness: 0.3, roughness: 0.5 },
  concrete: { color: 0xb8b2a7, roughness: 0.95 },
  foam: { color: 0x1c1f22, roughness: 0.9 },
  cable: { color: 0xc9b48f, roughness: 0.7 },
  body: { color: 0xf4f3ef, roughness: 0.4 },
}, { pbr: true });
const flameMat = new THREE.MeshBasicMaterial({ color: 0x3f7fff, transparent: true, depthWrite: false, side: THREE.DoubleSide }); // normal blending shows on the pale backdrop too

// ---------- Helpers ----------
const merge = geos => BufferGeometryUtils.mergeBufferGeometries(geos);
const V = (x, y, z) => new THREE.Vector3(x, y, z);

// A straight path through points with its corners rounded off: pipes, wires, flues.
function bentPath(points, bend = 0.1) {
  const p = points.map(q => V(...q)), path = new THREE.CurvePath();
  let start = p[0];
  for (let i = 1; i < p.length - 1; i++) {
    const [a, b, c] = [p[i - 1], p[i], p[i + 1]];
    const r = Math.min(bend, a.distanceTo(b) * 0.45, b.distanceTo(c) * 0.45);
    const enter = b.clone().addScaledVector(a.clone().sub(b).normalize(), r);
    const leave = b.clone().addScaledVector(c.clone().sub(b).normalize(), r);
    path.add(new THREE.LineCurve3(start, enter)); path.add(new THREE.QuadraticBezierCurve3(enter, b, leave));
    start = leave;
  }
  path.add(new THREE.LineCurve3(start, p.at(-1)));
  return path;
}
function pipe(points, radius, mat, bend = 0.1) {
  const path = bentPath(points, bend);
  return new THREE.Mesh(new THREE.TubeGeometry(path, Math.max(12, Math.ceil(path.getLength() / 0.04)), radius, 10, false), mat);
}
// Flexible duct: a tube with a rib every 4 cm, like the wire spiral under its foil.
function flexDuct(curve, radius, mat) {
  const rings = Math.ceil(curve.getLength() / 0.02), radial = 14;
  const geo = new THREE.TubeGeometry(curve, rings, radius, radial, false), p = geo.attributes.position, c = V(0, 0, 0), v = V(0, 0, 0);
  for (let i = 0; i <= rings; i++) {
    curve.getPointAt(i / rings, c);
    const k = i % 2 ? 1.07 : 0.96;
    for (let j = 0; j <= radial; j++) {
      const n = i * (radial + 1) + j;
      v.fromBufferAttribute(p, n).sub(c).multiplyScalar(k).add(c); p.setXYZ(n, v.x, v.y, v.z);
    }
  }
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, mat);
}
// A run of wall from (x0, z0) to (x1, z1), along x or z, `height` tall. holes: [from, to, bottom, top]
// in metres along the wall and up from the floor. Walls cut below full height get a dark top, like a plan.
function wall(g, [x0, z0], [x1, z1], height, { t = 0.12, holes = [], closet = false } = {}) {
  const alongX = z0 === z1, cap = height < 2;
  const piece = (a, b, y0, y1) => {
    if (b - a < 0.005 || y1 - y0 < 0.005) return;
    const mid = (a + b) / 2, size = alongX ? [b - a, y1 - y0, t] : [t, y1 - y0, b - a];
    const at = alongX ? [x0 + mid, FLOOR + (y0 + y1) / 2, z0] : [x0, FLOOR + (y0 + y1) / 2, z0 + mid];
    const m = box(size, M.wall, at, 0.004); m.userData.closet = closet; g.add(m);
    if (cap && y1 >= height) {
      const top = box(alongX ? [b - a, 0.012, t + 0.004] : [t + 0.004, 0.012, b - a], M.cap, [at[0], FLOOR + height + 0.006, at[2]], 0);
      g.add(top);
    }
  };
  let at = 0;
  [...holes].sort((p, q) => p[0] - q[0]).forEach(([a, b, y0, y1]) => { piece(at, a, 0, height); piece(a, b, 0, y0); piece(a, b, y1, height); at = b; });
  piece(at, alongX ? x1 - x0 : z1 - z0, 0, height);
}
// A window in a wall hole: a white frame, a mullion and a pane of glass.
function windowIn(g, alongX, at, a, b, y0, y1, t = 0.15) {
  const w = b - a, h = y1 - y0, mid = (a + b) / 2, y = FLOOR + (y0 + y1) / 2, f = 0.05;
  const put = (size, along, up) => g.add(box(alongX ? [size[0], size[1], t * 0.6] : [t * 0.6, size[1], size[0]], M.frame,
    alongX ? [along, y + up, at] : [at, y + up, along], 0.004));
  put([w, f], mid, h / 2 - f / 2); put([w, f], mid, -h / 2 + f / 2);
  put([f, h], a + f / 2, 0); put([f, h], b - f / 2, 0); put([f * 0.7, h], mid, 0);
  const pane = box(alongX ? [w - f, h - f, 0.01] : [0.01, h - f, w - f], M.glass, alongX ? [mid, y, at] : [at, y, mid], 0);
  pane.userData.glass = true; pane.userData.noShadow = true; g.add(pane);
}
function bed(g, { x, z, w, l, alongX }) {
  const size = (a, b, c) => (alongX ? [a, b, c] : [c, b, a]);
  const at = (along, up, across = 0) => (alongX ? [x + along, FLOOR + up, z + across] : [x + across, FLOOR + up, z - along]);
  g.add(box(size(l, 0.28, w), M.wood, at(0, 0.14), 0.02));
  g.add(box(size(l - 0.04, 0.18, w - 0.04), M.linen, at(0, 0.37), 0.05));
  g.add(box(size(l * 0.62, 0.05, w + 0.02), M.blanket, at(-l * 0.18, 0.47), 0.02));
  g.add(box(size(0.06, 0.9, w), M.wood, at(l / 2 - 0.03, 0.45), 0.015));
  const pillows = w > 1.2 ? [-w / 4, w / 4] : [0];
  pillows.forEach(c => g.add(box(size(0.32, 0.1, Math.min(0.6, w / pillows.length - 0.1)), M.linen, at(l / 2 - 0.25, 0.5, c), 0.04)));
}

// ---------- Parts ----------
const root = new THREE.Group(); scene.add(root);
const { parts, add, update } = createParts(root, { shadows: true, lively: true });
const NONE = V(0, 0, 0);

// The house: a floor slab, walls, windows, a closet for the furnace, and a little furniture.
{
  const g = new THREE.Group();
  const slab = new THREE.Mesh(new THREE.BoxGeometry(9.15, FLOOR, 6.15), [M.slab, M.slab, M.floor, M.slab, M.slab, M.slab]);
  slab.position.y = FLOOR / 2; g.add(slab);
  const H = CEILING - FLOOR;
  // Back and left walls stand full height with windows; the front and right walls are cut.
  wall(g, [-4.575, -3], [4.575, -3], H, { t: 0.15, holes: [[1.275, 2.675, 0.9, 2.15], [6.975, 8.175, 0.9, 2.15]] });
  windowIn(g, true, -3, -3.3, -1.9, 0.9, 2.15); windowIn(g, true, -3, 2.4, 3.6, 0.9, 2.15);
  wall(g, [-4.5, -2.925], [-4.5, 3.075], H, { t: 0.15, holes: [[2.425, 4.025, 1.0, 2.15]] });
  windowIn(g, false, -4.5, -0.5, 1.1, 1.0, 2.15);
  wall(g, [-4.425, 3], [4.575, 3], CUT, { t: 0.15, holes: [[4.175, 5.175, 0, H]] });
  wall(g, [4.5, -2.925], [4.5, 2.925], CUT, { t: 0.15 });
  // Inside: the hall between the living room and the bedrooms, and the furnace closet at its end.
  wall(g, [-0.5, -1.75], [-0.5, 2.925], CUT, { t: 0.1, holes: [[2.45, 3.45, 0, H]] });
  wall(g, [1, -1.75], [1, 2.925], CUT, { t: 0.1, holes: [[0.35, 1.25, 0, H], [2.35, 3.25, 0, H]] });
  wall(g, [1.05, 0], [4.425, 0], CUT, { t: 0.1 });
  wall(g, [-0.5, -2.925], [-0.5, -1.85], H, { t: 0.1, closet: true });
  wall(g, [1, -2.925], [1, -1.85], H, { t: 0.1, closet: true });
  wall(g, [-0.55, -1.8], [1.05, -1.8], H, { t: 0.1, closet: true, holes: [[0.49, 1.11, 0, 0.42]] });
  const door = box([0.84, 1.8, 0.035], M.door, [0.45, FLOOR + 1.4, -1.733], 0.01); door.userData.closet = true; g.add(door);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.03, 16, 12), M.brass); knob.position.set(0.8, FLOOR + 1.0, -1.7); knob.userData.closet = true; g.add(knob);
  // Living room: a sofa under the window, a rug and a low table. Two bedrooms.
  g.add(box([0.9, 0.42, 2.1], M.sofa, [-3.95, FLOOR + 0.21, 0.3], 0.08));
  g.add(box([0.24, 0.45, 2.1], M.sofa, [-4.3, FLOOR + 0.62, 0.3], 0.08));
  [-0.8, 1.4].forEach(z => g.add(box([0.9, 0.24, 0.2], M.sofa, [-3.95, FLOOR + 0.54, z], 0.07)));
  g.add(box([2.4, 0.012, 1.8], M.rug, [-2.6, FLOOR + 0.006, 0.3], 0));
  g.add(box([0.6, 0.36, 1.1], M.wood, [-2.75, FLOOR + 0.18, 0.3], 0.03));
  bed(g, { x: 3.38, z: 1.55, w: 1.6, l: 2.0, alongX: true });
  bed(g, { x: 3.1, z: -1.88, w: 1.0, l: 2.0, alongX: false });
  // The ceiling is left out so the rooms show; dashed lines mark where it meets the walls, the way
  // a plan draws things overhead. The registers sit in it and the ducts lie on top of it.
  const edges = [[-4.5, -3, 4.5, -3], [4.5, -3, 4.5, 3], [4.5, 3, -4.5, 3], [-4.5, 3, -4.5, -3], [-0.5, -1.8, -0.5, 3], [1, -1.8, 1, 3], [1, 0, 4.5, 0]];
  const ceiling = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(edges.flatMap(([x0, z0, x1, z1]) => [V(x0, CEILING, z0), V(x1, CEILING, z1)])),
    new THREE.LineDashedMaterial({ dashSize: 0.16, gapSize: 0.12, transparent: true, opacity: 0.75 }));
  ceiling.computeLineDistances(); g.add(ceiling);
  onPalette(p => ceiling.material.color.set(p.grid).convertSRGBToLinear());
  add('house', g, NONE, NONE);
}

// Thermostat on the hall wall, with its thin cable through the wall to the furnace's control board.
const screenCanvas = document.createElement('canvas'); screenCanvas.width = 256; screenCanvas.height = 160;
const screenTex = new THREE.CanvasTexture(screenCanvas); screenTex.encoding = THREE.sRGBEncoding;
let thermostatWire;
{
  const g = new THREE.Group();
  const { x, y, z } = THERMOSTAT;
  g.add(box([0.17, 0.11, 0.025], M.body, [x, y, z + 0.0125], 0.008));
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.125, 0.078), new THREE.MeshBasicMaterial({ map: screenTex, toneMapped: false }));
  screen.position.set(x, y + 0.004, z + 0.026); screen.userData.noShadow = true; g.add(screen);
  thermostatWire = pipe([[x, y, z], [x, y, -1.93], [x, 0.96, -1.93], [0.12, 0.96, -1.93], [0.12, 0.92, -2.02]], 0.005, M.cable, 0.08);
  g.add(thermostatWire);
  g.userData.anchor = [x, y, z + 0.03];
  add('thermostat', g, NONE, V(0, 0, 0.5));
}

// Return-air platform under the furnace, open to the hall through a grille.
{
  const g = new THREE.Group();
  const { x } = FURNACE, back = -2.8, front = -1.76, w = 0.6, h = 0.4, y = FLOOR + h / 2;
  [-1, 1].forEach(s => g.add(box([0.015, h, front - back], M.duct, [x + s * w / 2, y, (back + front) / 2], 0.003)));
  g.add(box([w, h, 0.015], M.duct, [x, y, back], 0.003));
  g.add(box([w, 0.015, 0.27], M.duct, [x, FLOOR + h, front - 0.135], 0.003));
  g.add(box([0.66, 0.42, 0.02], M.grille, [RETURN_GRILLE.x, RETURN_GRILLE.y, RETURN_GRILLE.z + 0.012], 0.006));
  g.userData.anchor = [RETURN_GRILLE.x, RETURN_GRILLE.y + 0.12, RETURN_GRILLE.z + 0.02];
  add('returnDuct', g, NONE, NONE);
}

// A 25 mm pleated filter behind the grille, in a cardboard frame.
{
  const g = new THREE.Group();
  const w = 0.58, h = 0.36, depth = 0.022, n = 28, pos = [], idx = [];
  for (let i = 0; i <= n * 2; i++) {
    const px = -w / 2 + i * w / (n * 2), pz = i % 2 ? depth / 2 : -depth / 2;
    pos.push(px, -h / 2, pz, px, h / 2, pz);
    if (i) { const a = (i - 1) * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  }
  const pleats = new THREE.BufferGeometry(); pleats.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  pleats.setIndex(idx); pleats.computeVertexNormals();
  const media = new THREE.Mesh(pleats, M.filter); media.position.set(RETURN_GRILLE.x, RETURN_GRILLE.y, -1.79); g.add(media);
  [[w + 0.04, 0.025, 0, h / 2 + 0.012], [w + 0.04, 0.025, 0, -h / 2 - 0.012], [0.025, h, -w / 2 - 0.012, 0], [0.025, h, w / 2 + 0.012, 0]]
    .forEach(([sx, sy, dx, dy]) => g.add(box([sx, sy, 0.028], M.cardboard, [RETURN_GRILLE.x + dx, RETURN_GRILLE.y + dy, -1.79], 0.002)));
  add('filter', g, NONE, V(0, 0, 0.9));
}

// Furnace cabinet: painted steel panels. The front doors lift off when the model is exploded.
const doors = new THREE.Group();
{
  const g = new THREE.Group();
  const { x, z, w, d, bottom, top } = FURNACE, h = top - bottom, t = 0.012, front = z + d / 2;
  const panel = (size, at, parent = g) => { const m = box(size, M.cabinet, at, 0.004); m.userData.casing = true; parent.add(m); return m; };
  panel([t, h, d], [x - w / 2 + t / 2, bottom + h / 2, z]);
  panel([t, h, d], [x + w / 2 - t / 2, bottom + h / 2, z]);
  panel([w, h, t], [x, bottom + h / 2, z - d / 2 + t / 2]);
  panel([w - 2 * t, 0.01, d - 2 * t], [x, 1.0, z]); // the deck between the blower and the burners
  panel([w, 0.47, t], [x, bottom + 0.235, front - t / 2], doors);
  panel([w, h - 0.49, t], [x, top - (h - 0.49) / 2, front - t / 2], doors);
  for (let i = 0; i < 5; i++) doors.add(box([0.3, 0.012, 0.006], M.dark, [x, 1.4 - i * 0.035, front + 0.002], 0.002)); // air louvres
  doors.add(box([0.12, 0.05, 0.004], M.body, [x + 0.12, 0.72, front + 0.002], 0.001)); // rating plate
  g.add(doors);
  g.add(box([0.13, 0.09, 0.012], M.board, [x - 0.13, 0.9, front - 0.03], 0.002)); // control board
  add('cabinet', g, NONE, NONE);
}

// The blower: a forward-curved squirrel-cage wheel in a scroll housing, driven by a motor in its middle.
// The scroll is built in the y-z plane around the wheel axis (x): it grows from 16 to 22 cm and
// ends in an outlet that faces up into the burner compartment.
let wheel;
{
  const g = new THREE.Group();
  const { x, y, z, r } = BLOWER, width = 0.32, N = 40;
  const spiral = [];
  for (let i = 0; i <= N; i++) {
    const k = i / N, a = Math.PI / 2 + 1.6 * Math.PI * (1 - k), rr = 0.16 + 0.06 * k;
    spiral.push(new THREE.Vector2(rr * Math.sin(a), rr * Math.cos(a)));
  }
  const outlet = 1.0 - y;
  const outer = [...spiral, new THREE.Vector2(0.22, outlet)];
  // The wall: the spiral and outlet, given 6 mm of thickness toward the inside.
  const inner = outer.map((p, i) => {
    const a = outer[Math.max(0, i - 1)], b = outer[Math.min(outer.length - 1, i + 1)];
    const n = new THREE.Vector2(-(b.y - a.y), b.x - a.x).normalize();
    if (n.dot(p.clone().negate()) < 0) n.negate();
    return p.clone().addScaledVector(n, 0.006);
  });
  const toX = geo => geo.rotateY(-Math.PI / 2).translate(width / 2, 0, 0);
  const wallShape = new THREE.Shape([...outer, ...inner.reverse()]);
  const scroll = new THREE.Mesh(toX(new THREE.ExtrudeGeometry(wallShape, { depth: width, bevelEnabled: false, curveSegments: 4 })), M.galv);
  const sideShape = new THREE.Shape([...outer, new THREE.Vector2(spiral[0].x, outlet)]);
  sideShape.holes.push(new THREE.Path().absarc(0, 0, 0.105, 0, Math.PI * 2, true));
  const sideGeo = new THREE.ExtrudeGeometry(sideShape, { depth: 0.006, bevelEnabled: false, curveSegments: 24 }).rotateY(-Math.PI / 2);
  const housing = new THREE.Group(); housing.position.set(x, y, z);
  housing.add(scroll);
  [width / 2, -width / 2 + 0.006].forEach(sx => { const side = new THREE.Mesh(sideGeo, M.galv); side.position.x = sx; housing.add(side); });
  housing.add(box([width, outlet - spiral[0].y, 0.006], M.galv, [0, (outlet + spiral[0].y) / 2, spiral[0].x], 0)); // cut-off wall
  housing.traverse(o => { if (o.isMesh) o.userData.casing = true; });
  g.add(housing);
  // Wheel: 40 shallow blades between two rings, all one geometry.
  const blades = [];
  for (let i = 0; i < 40; i++) {
    blades.push(new THREE.BoxGeometry(width - 0.04, 0.03, 0.004).rotateX(-0.6).translate(0, r - 0.012, 0).rotateX(i / 40 * Math.PI * 2));
  }
  [-1, 1].forEach(s => blades.push(new THREE.TorusGeometry(r - 0.006, 0.006, 6, 48).rotateY(Math.PI / 2).translate(s * (width / 2 - 0.022), 0, 0)));
  wheel = new THREE.Mesh(merge(blades), M.galv); wheel.position.set(x, y, z); g.add(wheel);
  const motor = cylinder(0.065, 0.065, 0.16, M.dark, [x, y, z], { segments: 24 }); motor.rotation.z = Math.PI / 2; g.add(motor);
  [0, 2.1, 4.2].forEach(a => { // three arms hold the motor to the side plate
    const arm = box([0.006, 0.1, 0.012], M.galv, [x + width / 2 - 0.005, y + Math.cos(a) * 0.08, z + Math.sin(a) * 0.08], 0); arm.rotation.x = -a; g.add(arm);
  });
  add('blower', g, NONE, V(0, 0, 0.6));
}

// Burners: four in-shot burners on a gas manifold, a gas valve, a hot-surface igniter, and the flames.
const flames = [];
let igniter;
const SECTIONS = [-0.18, -0.06, 0.06, 0.18].map(dx => FURNACE.x + dx);
{
  const g = new THREE.Group(), y = 1.12;
  const manifold = cylinder(0.012, 0.012, 0.46, M.iron, [FURNACE.x - 0.01, y, -2.06], { segments: 12 }); manifold.rotation.z = Math.PI / 2; g.add(manifold);
  const coneGeo = new THREE.ConeGeometry(0.022, 0.12, 12, 1, true).rotateX(-Math.PI / 2);
  SECTIONS.forEach(x => {
    const b = cylinder(0.022, 0.027, 0.1, M.burner, [x, y, -2.115], { segments: 16 }); b.rotation.x = Math.PI / 2; g.add(b);
    const flame = new THREE.Mesh(coneGeo, flameMat); flame.position.set(x, y, -2.225);
    flame.userData.flame = true; flame.userData.noShadow = true; g.add(flame); flames.push(flame);
  });
  g.add(box([0.08, 0.07, 0.06], M.dark, [FURNACE.x - 0.24, y, -2.07], 0.008)); // gas valve
  g.add(pipe([[FURNACE.x - 0.28, y, -2.07], [-0.11, y, -2.07], [-0.11, FLOOR, -2.07]], 0.013, M.iron, 0.05));
  const handle = box([0.09, 0.018, 0.02], M.brass, [-0.11, 0.85, -2.03], 0.004); g.add(handle); // gas shut-off
  igniter = box([0.012, 0.012, 0.05], M.igniter, [SECTIONS[0] + 0.045, y + 0.04, -2.16], 0.002);
  igniter.userData.noShadow = true; g.add(igniter);
  g.userData.anchor = [FURNACE.x + 0.12, y, -2.1];
  add('burners', g, NONE, V(0, 0, 0.45));
}

// Heat exchanger: four clamshell sections the flames fire into, a collector box, the inducer fan
// that pulls the exhaust through, and the white plastic flue up through the roof.
const exchangers = [];
{
  const g = new THREE.Group();
  const path = [[-2.18, 1.12], [-2.66, 1.13], [-2.71, 1.22], [-2.25, 1.27], [-2.2, 1.35], [-2.66, 1.39], [-2.69, 1.46], [-2.22, 1.48]];
  const curve = new THREE.CatmullRomCurve3(path.map(([z, y]) => V(0, y, z)), false, 'catmullrom', 0.3);
  const shell = new THREE.TubeGeometry(curve, 90, 0.034, 10, false).scale(0.75, 1, 1);
  SECTIONS.forEach(x => { const m = new THREE.Mesh(shell, M.exchanger); m.position.x = x; g.add(m); exchangers.push(m); });
  g.add(box([0.46, 0.07, 0.09], M.exchanger, [FURNACE.x, 1.48, -2.17], 0.01));
  const inducer = cylinder(0.06, 0.06, 0.05, M.dark, [0.09, 1.48, -2.1], { segments: 24 }); inducer.rotation.x = Math.PI / 2; g.add(inducer);
  g.add(pipe([[0.03, 1.48, -2.1], [-0.12, 1.48, -2.1], [-0.12, 3.95, -2.1]], 0.038, M.pvc, 0.1));
  g.add(cylinder(0.05, 0.05, 0.05, M.pvc, [-0.12, 3.95, -2.1], { segments: 20 }));
  g.userData.anchor = [FURNACE.x + 0.16, 1.3, -2.5];
  add('exchanger', g, NONE, NONE);
}

// The indoor coil (an "A" coil) in its own casing on top of the furnace, with a drain pan below it.
// It is the heat pump's indoor heat exchanger: hot in heating, cold in cooling.
const coilSlabs = [];
{
  const g = new THREE.Group();
  const { x, z } = FURNACE, { bottom, top } = COIL, h = top - bottom, cw = 0.53, cd = 0.6, t = 0.012;
  const panel = (size, at) => { const m = box(size, M.cabinet, at, 0.004); m.userData.casing = true; g.add(m); };
  panel([t, h, cd], [x - cw / 2 + t / 2, bottom + h / 2, z]); panel([t, h, cd], [x + cw / 2 - t / 2, bottom + h / 2, z]);
  panel([cw, h, t], [x, bottom + h / 2, z - cd / 2 + t / 2]); panel([cw, h, t], [x, bottom + h / 2, z + cd / 2 - t / 2]);
  const apex = 2.03, foot = 1.62, dz = 0.24, L = Math.hypot(dz, apex - foot), tilt = Math.atan2(dz, apex - foot);
  // Copper hairpin bends where the tubes leave the fins at each end of a slab.
  const bends = [];
  for (let i = 0; i < 6; i++) for (const row of [-0.015, 0.015]) for (const s of [-1, 1]) {
    bends.push(new THREE.TorusGeometry(0.018, 0.0045, 6, 10, Math.PI).rotateZ(-s * Math.PI / 2).translate(s * 0.222, -L / 2 + 0.06 + i * 0.075, row));
  }
  const bendGeo = merge(bends);
  [-1, 1].forEach(s => {
    const slab = box([0.44, L, 0.06], M.fins, [x, (apex + foot) / 2, z + s * dz / 2], 0); slab.rotation.x = -s * tilt;
    slab.add(new THREE.Mesh(bendGeo, M.copper)); g.add(slab); coilSlabs.push(slab);
  });
  g.add(box([0.5, 0.04, 0.58], M.pan, [x, foot - 0.03, z], 0.01));
  g.add(pipe([[x + 0.2, foot - 0.03, -2.2], [0.62, foot - 0.03, -2.2], [0.62, FLOOR + 0.01, -2.2]], 0.012, M.pvc, 0.06)); // condensate drain
  g.userData.anchor = [x, 1.85, z + 0.05];
  add('coil', g, NONE, V(0, 0.45, 0));
}

// Supply ducts: the plenum on the coil, a sheet-metal trunk in the attic, and a flexible branch
// down to a ceiling register in every room.
{
  const g = new THREE.Group();
  g.add(box([0.58, 3.2 - COIL.top, 0.64], M.duct, [FURNACE.x, (3.2 + COIL.top) / 2, FURNACE.z], 0.01));
  g.add(box([TRUNK.x[1] - TRUNK.x[0], TRUNK.h, TRUNK.w], M.duct, [0, TRUNK.y, TRUNK.z], 0.01));
  [-2.4, -1.2, 1.4, 2.6].forEach(x => g.add(box([0.03, TRUNK.h + 0.016, TRUNK.w + 0.016], M.duct, [x, TRUNK.y, TRUNK.z], 0.004))); // joints
  REGISTERS.forEach(({ x, z, from }) => {
    const curve = new THREE.CatmullRomCurve3([V(from, 3.0, TRUNK.z + TRUNK.w / 2 - 0.02), V(from, 3.02, -1.85), V(x, 3.0, z - 0.45), V(x, 2.97, z - 0.08), V(x, CEILING + 0.13, z)]);
    g.add(flexDuct(curve, 0.09, M.flex));
    g.add(box([0.3, 0.13, 0.3], M.duct, [x, CEILING + 0.065, z], 0.01)); // register boot
    g.add(box([0.38, 0.025, 0.38], M.register, [x, CEILING - 0.0125, z], 0.006));
  });
  g.userData.anchor = [-1.7, TRUNK.y + TRUNK.h / 2, TRUNK.z];
  add('supply', g, NONE, V(0, 0.9, 0));
}

// Refrigerant line set: a 22 mm vapour line in black foam and a bare 10 mm copper liquid line.
const LIQUID = [0, -0.06, 0.08]; // the liquid line runs just below and in front of the vapour line
{
  const g = new THREE.Group();
  g.add(pipe(lineSet(), 0.026, M.foam, 0.2));
  g.add(pipe(lineSet(LIQUID), 0.007, M.copper, 0.2));
  g.userData.anchor = [2.6, 3.32, -2.0];
  add('lines', g, NONE, NONE);
}

// Outdoor unit: a coil on four sides, a fan on top, and the compressor and reversing valve inside.
let fan;
const outdoorTop = new THREE.Group();
const outFins = [];
{
  const g = new THREE.Group();
  const { x, z, w, h } = OUTDOOR, coilH = h - 0.22, y0 = 0.15;
  g.add(box([1.05, 0.08, 1.05], M.concrete, [x, 0.04, z], 0.01));
  g.add(box([w + 0.02, 0.07, w + 0.02], M.outdoor, [x, 0.115, z], 0.01));
  [[0, 1], [0, -1], [1, 0], [-1, 0]].forEach(([sx, sz]) => {
    const fins = box(sx ? [0.025, coilH, w - 0.06] : [w - 0.06, coilH, 0.025], M.outFins, [x + sx * (w / 2 - 0.02), y0 + coilH / 2, z + sz * (w / 2 - 0.02)], 0.003);
    fins.userData.casing = true; g.add(fins); outFins.push(fins);
  });
  [[-1, -1], [-1, 1], [1, -1], [1, 1]].forEach(([sx, sz]) => g.add(box([0.05, coilH, 0.05], M.outdoor, [x + sx * (w / 2 - 0.02), y0 + coilH / 2, z + sz * (w / 2 - 0.02)], 0.01)));
  // Compressor: a sealed dome with the motor and pump inside. The reversing valve sits on its pipes.
  const dome = new THREE.Group();
  dome.add(cylinder(0.12, 0.12, 0.26, M.compressor, [0, 0, 0], { segments: 28 }));
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.12, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2), M.compressor); cap.position.y = 0.13; dome.add(cap);
  dome.position.set(x + 0.06, y0 + 0.17, z + 0.08); g.add(dome);
  g.add(pipe([[x + 0.06, y0 + 0.4, z + 0.08], [x + 0.06, y0 + 0.47, z - 0.1], [x - 0.2, y0 + 0.47, z - 0.1]], 0.01, M.copper, 0.05));
  const valve = cylinder(0.028, 0.028, 0.13, M.brass, [x - 0.2, y0 + 0.47, z - 0.1], { segments: 16 }); valve.rotation.z = Math.PI / 2; g.add(valve);
  g.add(pipe([[x - 0.2, y0 + 0.47, z - 0.1], [x - 0.2, y0 + 0.2, z - 0.1], [x - 0.2, y0 + 0.2, z + 0.1], [x - 0.02, y0 + 0.1, z + 0.1]], 0.008, M.copper, 0.05));
  [[0, 0, 0], LIQUID].forEach(([, dy, dz]) => g.add(box([0.06, 0.05, 0.05], M.brass, [x - w / 2 - 0.01, 0.28 + dy, -1.8 + dz], 0.006))); // service valves
  // Top: a lid with a round opening, a wire guard, and a three-blade fan underneath.
  const lid = roundedRect(w + 0.02, w + 0.02, 0.03);
  lid.holes.push(new THREE.Path().absarc(0, 0, 0.3, 0, Math.PI * 2, true));
  const top = extrudeUp(lid, 0.05, M.outdoor, y0 + coilH); top.position.set(x, 0, z); outdoorTop.add(top);
  [0.1, 0.2, 0.3].forEach(r => { const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.005, 6, 48), M.fan); ring.rotation.x = Math.PI / 2; ring.position.set(x, y0 + coilH + 0.07, z); outdoorTop.add(ring); });
  for (let i = 0; i < 4; i++) { const spoke = box([0.62, 0.01, 0.01], M.fan, [x, y0 + coilH + 0.07, z], 0); spoke.rotation.y = i * Math.PI / 4; outdoorTop.add(spoke); }
  fan = new THREE.Group(); fan.position.set(x, y0 + coilH + 0.0, z);
  for (let i = 0; i < 3; i++) {
    const blade = box([0.22, 0.008, 0.11], M.fan, [0.15, 0, 0], 0); blade.rotation.x = 0.4;
    const arm = new THREE.Group(); arm.rotation.y = i * Math.PI * 2 / 3; arm.add(blade); fan.add(arm);
  }
  fan.add(cylinder(0.06, 0.06, 0.08, M.fan, [0, 0.02, 0], { segments: 20 }));
  outdoorTop.add(fan);
  g.add(outdoorTop);
  add('outdoor', g, NONE, V(0.5, 0, 0));
}

// ---------- Air and refrigerant ----------
const dot = softDot();
const pixel = stage.renderer.getPixelRatio();
// A cloud of round dots, one colour each, drawn the same size at any distance.
function cloud(count, size) {
  const geometry = new THREE.BufferGeometry(), pos = new Float32Array(count * 3), col = new Float32Array(count * 3);
  geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const material = new THREE.PointsMaterial({ size: size * pixel, sizeAttenuation: false, map: dot, vertexColors: true, transparent: true, opacity: 0, depthWrite: false });
  const points = new THREE.Points(geometry, material); points.frustumCulled = false; points.renderOrder = 3; scene.add(points);
  const out = V(0, 0, 0);
  return {
    material, out,
    put(i, v, c) { pos[i * 3] = v.x; pos[i * 3 + 1] = v.y; pos[i * 3 + 2] = v.z; if (c) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; } },
    commit() { geometry.attributes.position.needsUpdate = true; geometry.attributes.color.needsUpdate = true; },
    fade(target, k) { material.opacity += (target - material.opacity) * k; return material.opacity > 0.01; },
  };
}
// A polyline the dots follow; at(u) gives the point a share u of the way along it.
function route(points) {
  const p = points.map(([x, y, z]) => V(x, y, z)), spread = points.map(q => q[3] ?? 0), d = [0];
  for (let i = 1; i < p.length; i++) d.push(d[i - 1] + p[i].distanceTo(p[i - 1]));
  const length = d.at(-1);
  return {
    length, key: i => d[i] / length,
    at(u, out) {
      const s = u * length; let i = 1;
      while (i < d.length - 1 && d[i] < s) i++;
      const k = Math.min(1, Math.max(0, (s - d[i - 1]) / (d[i] - d[i - 1] || 1)));
      out.lerpVectors(p[i - 1], p[i], k);
      return spread[i - 1] + (spread[i] - spread[i - 1]) * k;
    },
  };
}
const randomIn = () => { const v = V(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5); return v.length() > 0.5 ? randomIn() : v.multiplyScalar(2); };

const loops = REGISTERS.map(r => route(airLoop(r)));
const keys = loops.map(l => ({ heated: l.key(AIR_KEYS.heated), out: l.key(AIR_KEYS.register), mixed: l.key(AIR_KEYS.mixed) }));
const AIR_N = 720, totalLength = loops.reduce((s, l) => s + l.length, 0);
const air = cloud(AIR_N, 6);
const airSeeds = Array.from({ length: AIR_N }, (_, i) => {
  let pick = (i / AIR_N) * totalLength, loop = 0;
  while (pick > loops[loop].length) pick -= loops[loop++].length;
  return { loop, u: Math.random(), j: randomIn(), s: 0.8 + Math.random() * 0.4 };
});
const C = {
  neutral: linear(0x93a6ba), warm: linear(0xff7438), cool: linear(0x3d8eff),
  hotGas: linear(0xff8a4c), coldGas: linear(0x6fb6ff), liquid: linear(0xffc46b), plume: linear(0xb9c4cf), water: linear(0x7fc3ff),
};
const supplyTint = new THREE.Color(), tint = new THREE.Color();

const vapourPath = route(lineSet()), liquidPath = route(lineSet(LIQUID));
const REF_N = 90;
const vapour = cloud(REF_N, 7), liquid = cloud(REF_N, 5);
const refSeeds = Array.from({ length: REF_N }, () => ({ u: Math.random(), s: 0.85 + Math.random() * 0.3 }));
for (let i = 0; i < REF_N; i++) { vapour.put(i, NONE, C.hotGas); liquid.put(i, NONE, C.liquid); }

const PLUME_N = 40, plume = cloud(PLUME_N, 9);
const plumeSeeds = Array.from({ length: PLUME_N }, () => ({ t: Math.random(), a: Math.random() * Math.PI * 2, s: 0.6 + Math.random() * 0.8 }));
for (let i = 0; i < PLUME_N; i++) plume.put(i, NONE, C.plume);

const DROP_N = 36, drops = cloud(DROP_N, 4);
const dropSeeds = Array.from({ length: DROP_N }, (_, i) => ({ slab: i % 2 ? 1 : -1, x: (Math.random() - 0.5) * 0.38, t: Math.random(), s: 0.5 + Math.random() * 0.6 }));
for (let i = 0; i < DROP_N; i++) drops.put(i, NONE, C.water);

// ---------- State and UI ----------
const state = { step: 0, explode: 0, targetExplode: 0, playing: true, focus: [], cut: false, mode: 'heat', setpoint: 21, ducts: false, flow: false };
const sim = createSim();
if (stage.capture) window.__hswSim = sim; // ?capture: set the system running for a thumbnail
const setpoint = document.getElementById('setpoint');
function setSetpoint(v) { state.setpoint = v; setpoint.value = String(v); showRange(setpoint, `${v}°C`); }
setpoint.addEventListener('input', () => setSetpoint(Number(setpoint.value)));
setpoint.addEventListener('change', () => track('control_changed', { control: 'setpoint', value: Number(setpoint.value), step: state.step + 1 }));

let camGoal = null, lastIndex = -1;
const story = createStoryUI({
  story: HVAC_STORY, state,
  onStep: (s, index) => {
    // Going forward keeps the system running; jumping back, a new mode or a restart starts the step afresh.
    const fresh = index < lastIndex || lastIndex < 0 || s.restart || s.mode !== state.mode;
    lastIndex = index;
    if (fresh) Object.assign(sim, createSim({ T: s.startT }));
    else sim.T = s.mode === 'cool' ? Math.max(sim.T, s.startT) : Math.min(sim.T, s.startT);
    Object.assign(state, { focus: s.focus, cut: s.cut, mode: s.mode, ducts: !!s.ducts, flow: !!s.flow });
    setSetpoint(s.setpoint);
    const v = VIEWS[s.view]; camGoal = { ...v, target: V(...v.target) };
    cam.theta = v.theta + THREE.MathUtils.euclideanModulo(cam.theta - v.theta + Math.PI, 2 * Math.PI) - Math.PI; // the short way round
    if (stage.capture) { Object.assign(cam, { r: v.r, theta: v.theta, phi: v.phi }); cam.target.copy(camGoal.target); camGoal = null; }
  },
});
createCallouts(stage, { parts, state, story: HVAC_STORY });

// The camera holds on the whole house while the intro assembles it, then flies to the step.
let introLeft = stage.capture ? 0 : 2.4;
['pointerdown', 'keydown'].forEach(type => document.addEventListener(type, () => { introLeft = 0; }, { once: true, capture: true }));

const shown = { blower: 0, flame: 0, igniter: 0, fan: 0 };
const focusStyle = {
  highlight: 0.2,
  opacity(name, mesh, hot) {
    const u = mesh.userData, open = looksInside(state);
    let alpha = 1;
    if (u.closet && open) alpha = 0.1;                                     // the closet walls go glassy
    if (u.casing && (state.cut === 'deep' || (state.cut && hot))) alpha = hot ? 0.28 : 0.14; // and the cabinets
    if (name === 'supply' && state.ducts) alpha = 0.42;                    // see the air inside the ducts
    if (name === 'lines' && state.flow) alpha = 0.5;                       // and the refrigerant in its pipes
    if (state.focus.length && !hot && open && name !== 'house') alpha = Math.min(alpha, 0.3);
    if (u.glass) alpha *= 0.35;
    if (u.flame) alpha *= shown.flame;
    return alpha;
  },
};

// The thermostat's screen: the room temperature, and what it is asking for.
let screenText = '';
function drawScreen() {
  const call = sim.call, cool = state.mode === 'cool';
  const text = `${sim.T.toFixed(1)}|${state.setpoint}|${call}|${cool}`;
  if (text === screenText) return;
  screenText = text;
  const g = screenCanvas.getContext('2d');
  g.fillStyle = '#14181d'; g.fillRect(0, 0, 256, 160);
  g.textAlign = 'center'; g.fillStyle = '#e8edf2'; g.font = '500 74px "IBM Plex Mono", ui-monospace, monospace';
  g.fillText(`${sim.T.toFixed(1)}°`, 128, 92);
  g.font = '500 25px "IBM Plex Mono", ui-monospace, monospace';
  g.fillStyle = call ? (cool ? '#5aa8ff' : '#f39a52') : '#7d8893';
  g.fillText(`${cool ? 'COOL' : 'HEAT'} ${call ? 'ON' : 'SET'} · ${state.setpoint}°`, 128, 138);
  screenTex.needsUpdate = true;
}

const readout = { box: document.getElementById('readout'), room: document.getElementById('r-room'), supply: document.getElementById('r-supply'), system: document.getElementById('r-system') };
let readoutTimer = 0;
function showReadout() {
  const supply = supplyTempC(sim, state.mode);
  readout.room.textContent = `${sim.T.toFixed(1)}°C`;
  readout.supply.textContent = supply === null ? '—' : `${supply.toFixed(0)}°C`;
  readout.system.textContent = statusText(sim, state.mode);
  readout.box.classList.toggle('heating', state.mode !== 'cool' && sim.phase !== 'idle');
  readout.box.classList.toggle('cooling', state.mode === 'cool' && sim.compressor);
}

// ---------- Sound ----------
// A relay clicks when the thermostat calls. Then the inducer whirs, the gas lights with a soft
// whoomp, and the blower's low rumble takes over. A heat pump hums at 120 Hz under its fan.
const blowerNoise = sound.loop({ type: 'noise', filter: 'lowpass', freq: 260, q: 0.8 });
const burnerNoise = sound.loop({ type: 'noise', filter: 'bandpass', freq: 420, q: 0.9 });
const inducerNoise = sound.loop({ type: 'noise', filter: 'bandpass', freq: 1300, q: 4 });
const compressorHum = sound.loop({ type: 'tone', wave: 'triangle', freq: 120 });
const fanNoise = sound.loop({ type: 'noise', filter: 'lowpass', freq: 520, q: 0.7 });
const was = { call: false, flame: false, compressor: false };
function playSounds() {
  const on = state.playing ? 1 : 0;
  blowerNoise.set(0.2 * shown.blower * on, 180 + 160 * shown.blower);
  burnerNoise.set(0.1 * shown.flame * on);
  inducerNoise.set(sim.inducer ? 0.035 * on : 0);
  compressorHum.set(0.03 * shown.fan * on);
  fanNoise.set(0.1 * shown.fan * on);
  if (sim.call !== was.call) sound.click(0.25);
  if (sim.flame && !was.flame) { sound.whoosh(0.28, 450); sound.thunk(0.12); }
  if (sim.compressor && !was.compressor) { sound.thunk(0.2); if (state.mode === 'cool') sound.whoosh(0.2, 1800); } // the reversing valve shifts
  Object.assign(was, { call: sim.call, flame: sim.flame, compressor: sim.compressor });
}

// ---------- Frame ----------
const apex = V(FURNACE.x, 2.03, FURNACE.z), dropAt = V(0, 0, 0);
const feet = { [-1]: V(FURNACE.x, 1.62, FURNACE.z - 0.24), 1: V(FURNACE.x, 1.62, FURNACE.z + 0.24) };
startLoop(stage, (dt, now) => {
  update(state, focusStyle, reduced ? 1 : 0.09, dt);
  introLeft -= dt;
  if (camGoal && introLeft <= 0) { // ease to the step's view once; after that the reader's own zoom wins
    const k = reduced ? 1 : Math.min(1, dt * 2.5);
    for (const a of ['r', 'theta', 'phi']) cam[a] += (camGoal[a] - cam[a]) * k;
    cam.target.lerp(camGoal.target, k);
    if (Math.abs(camGoal.r - cam.r) < 0.03 && Math.abs(camGoal.theta - cam.theta) < 0.002 && cam.target.distanceTo(camGoal.target) < 0.01) camGoal = null;
  }

  const play = state.playing ? 1 : 0;
  if (play) stepHvac(sim, dt, state);
  const ease = rate => (reduced ? 1 : Math.min(1, dt * rate));
  shown.blower += ((sim.blower ? 1 : 0) - shown.blower) * ease(1.2);
  shown.flame += ((sim.flame ? 1 : 0) - shown.flame) * ease(6);
  shown.igniter += ((sim.igniter ? 1 : 0) - shown.igniter) * ease(1.5);
  shown.fan += ((sim.compressor ? 1 : 0) - shown.fan) * ease(1.5);

  wheel.rotation.x -= dt * 16 * shown.blower * play;
  fan.rotation.y -= dt * 14 * shown.fan * play;
  doors.position.z = state.explode * 0.5;
  outdoorTop.position.y = state.explode * 0.45;
  flames.forEach((f, i) => { f.scale.set(1, 1, 0.3 + 0.7 * shown.flame * (1 + Math.sin(now / 70 + i * 1.9) * 0.12)); });

  // Glow: the igniter, the heat exchanger, the coils, and the thermostat cable while it calls.
  const heatLevel = state.mode === 'heat' ? sim.h : 0, pump = state.mode === 'heat' ? 0 : sim.h;
  const glowAt = (mesh, color, amount) => { if (amount > 0.01) { mesh.material.emissive.copy(color); mesh.material.emissiveIntensity = amount; } };
  heatColor(shown.igniter, igniter.material.emissive); igniter.material.emissiveIntensity = 1.6;
  exchangers.forEach(m => glowAt(m, heatColor(0.42 * heatLevel, tint), 1));
  coilSlabs.forEach(m => glowAt(m, state.mode === 'cool' ? C.cool : C.warm, 0.3 * pump));
  outFins.forEach(m => glowAt(m, state.mode === 'cool' ? C.warm : C.cool, 0.22 * pump));
  if (sim.call) glowAt(thermostatWire, state.mode === 'cool' ? C.cool : C.warm, 0.5 + 0.3 * Math.sin(now / 160));

  // Air: neutral on its way back, warm or cool from the coil to the register, mixing in the room.
  const delta = state.mode === 'cool' ? C.cool : C.warm, level = Math.min(1, sim.h * 1.1);
  supplyTint.copy(C.neutral).lerp(delta, level);
  if (air.fade(0.9 * shown.blower, ease(3))) {
    airSeeds.forEach((p, i) => {
      const loop = loops[p.loop];
      p.u = (p.u + dt * p.s * shown.blower * play * 1.5 / loop.length) % 1;
      const r = loop.at(p.u, air.out);
      air.out.addScaledVector(p.j, r);
      const { heated, out, mixed } = keys[p.loop];
      if (p.u < heated) tint.copy(C.neutral).lerp(supplyTint, p.u / heated);
      else if (p.u < out) tint.copy(supplyTint);
      else if (p.u < mixed) tint.copy(supplyTint).lerp(C.neutral, (p.u - out) / (mixed - out));
      else tint.copy(C.neutral);
      air.put(i, air.out, tint);
    });
    air.commit();
  }

  // Refrigerant: hot gas runs to the house in heating; cold gas runs back to the compressor in cooling.
  const dir = state.mode === 'cool' ? 1 : -1; // along the vapour line, away from the house when cooling
  const flowOn = state.flow && state.mode !== 'heat' ? shown.fan : 0;
  const gas = state.mode === 'cool' ? C.coldGas : C.hotGas;
  if (vapour.fade(0.95 * flowOn, ease(3))) {
    refSeeds.forEach((p, i) => {
      p.u = THREE.MathUtils.euclideanModulo(p.u + dir * dt * p.s * shown.fan * play * 0.9 / vapourPath.length, 1);
      vapourPath.at(p.u, vapour.out); vapour.put(i, vapour.out, gas);
      liquidPath.at(1 - p.u, liquid.out); liquid.put(i, liquid.out);
    });
    vapour.commit(); liquid.commit();
  }
  liquid.material.opacity = vapour.material.opacity;

  // A plume of water vapour from the flue while the burners run.
  if (plume.fade(state.mode === 'heat' ? 0.55 * shown.flame : 0, ease(2))) {
    plumeSeeds.forEach((p, i) => {
      p.t = (p.t + dt * p.s * 0.45 * play) % 1;
      const spread = 0.04 + p.t * 0.35;
      plume.put(i, dropAt.set(-0.12 + Math.cos(p.a) * spread + p.t * 0.25, 4.0 + p.t * 1.3, -2.1 + Math.sin(p.a) * spread));
    });
    plume.commit();
  }
  // Condensate: in cooling, water beads on the inside of the cold coil and runs down into the pan.
  if (drops.fade(state.mode === 'cool' && state.cut === 'deep' ? 0.9 * Math.min(1, sim.h * 1.5) : 0, ease(2))) {
    dropSeeds.forEach((p, i) => {
      p.t = (p.t + dt * p.s * 0.25 * play) % 1;
      const s = p.slab;
      dropAt.lerpVectors(apex, feet[s], Math.min(1, p.t * 1.15));
      dropAt.x += p.x; dropAt.y -= 0.018; dropAt.z -= s * 0.03; // on the inner face of the slab
      if (p.t > 0.87) dropAt.y -= (p.t - 0.87) * 0.3;
      dropAt.y += parts.coil.group.position.y;
      drops.put(i, dropAt);
    });
    drops.commit();
  }

  drawScreen();
  playSounds();
  readoutTimer -= dt;
  if (readoutTimer <= 0) { showReadout(); readoutTimer = 0.15; }
});
story.setStep(0, false);
