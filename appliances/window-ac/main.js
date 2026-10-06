import * as THREE from 'three';
import { BufferGeometryUtils } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createStage, addFloor, addStudioLights } from '../../src/engine/stage.js';
import { createParts, looksInside } from '../../src/engine/parts.js';
import { createCallouts } from '../../src/engine/callouts.js';
import { createStoryUI, bindRange, showRange } from '../../src/engine/story-ui.js';
import { sound } from '../../src/engine/sound.js';
import { startLoop, reducedMotion as reduced } from '../../src/engine/loop.js';
import { box, cylinder, lathe } from '../../src/kit/shapes.js';
import { createMaterials, linear } from '../../src/kit/materials.js';
import { softDot } from '../../src/kit/effects.js';
import { AC_STORY } from './story.js';
import { AC, createRoom, stepRoom, supplyAirC } from './physics.js';
import { BODY, PAN_Y, WALL, PARTITION_X, AXIS, EVAP, COND, BLOWER, FAN, WATER_Y, roomAir, outdoorAir, drip, spray } from './airflow.js';

// ---------- Stage and light ----------
// Scale: 1 unit = 10 cm. The room is at -x (the front grille), outside at +x (the hot coil).
const VIEWS = {
  all: { r: 19, theta: -0.62, phi: 1.13, target: [0.2, 0.3, 0] },
  out: { r: 14, theta: -0.3, phi: 1.05, target: [1.8, 0.3, 0.4] },
  shaft: { r: 16, theta: -0.42, phi: 0.92, target: [-0.2, 0.2, -0.4] },
  water: { r: 15.5, theta: -0.4, phi: 0.98, target: [0.2, -0.6, 0.4] },
  cap: { r: 9.5, theta: -0.25, phi: 1.12, target: [-0.8, -0.3, 1.8] },
  in: { r: 12.5, theta: -0.9, phi: 1.1, target: [-2.6, 0.4, -0.3] },
  front: { r: 12, theta: -1.1, phi: 1.2, target: [-3.4, 0.8, 0.9] },
};
const stage = createStage(document.getElementById('c'), {
  fov: 36, pbr: true, camera: VIEWS.all, zoom: [7, 27], phiLimit: 0.25,
});
const { scene, cam } = stage;
addStudioLights(stage, { key: [-6, 10, 7], extent: 8, far: 35 });
addFloor(stage, WALL.floor, { size: 22, opacity: 0.15, height: 7, shadowSize: 15, blur: 3.5 });

// ---------- Textures ----------
function canvasTexture(w, h, draw, srgb = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.encoding = THREE.sRGBEncoding;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
  return t;
}
// Fin edges: a thin dark line every 8 mm across the face of a coil.
const finTexture = canvasTexture(16, 4, (g, w, h) => { g.fillStyle = '#eef0f2'; g.fillRect(0, 0, w, h); g.fillStyle = '#7d868f'; g.fillRect(0, 0, 3, h); });
finTexture.repeat.set(1 / 0.08, 1);
// Brick in section for the cut faces of the wall: 23 × 7.5 cm bricks, 1 cm of mortar.
const brickTexture = canvasTexture(256, 128, (g, w, h) => {
  g.fillStyle = '#d9cfc1'; g.fillRect(0, 0, w, h);
  for (let row = 0; row < 2; row++) for (let i = -1; i < 3; i++) {
    const x = i * 128 + (row ? 64 : 0) + 3, y = row * 64 + 3;
    g.fillStyle = ['#b3613d', '#a95a39', '#bb6a44'][(i + row * 2 + 3) % 3]; g.fillRect(x, y, 122, 58);
  }
});
brickTexture.repeat.set(1 / 4.8, 1 / 1.7);
// The filter's nylon mesh, as an alpha map.
const meshTexture = canvasTexture(8, 8, (g, w, h) => { g.fillStyle = '#000'; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; g.fillRect(0, 0, w, 2); g.fillRect(0, 0, 2, h); }, false);
meshTexture.repeat.set(70, 45);
// A moving dash on the copper: the refrigerant flowing. One dash every DASH units.
const DASH = 0.34;
const dashTexture = canvasTexture(64, 4, (g, w, h) => { g.fillStyle = '#000'; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; g.fillRect(0, 0, 22, h); }, false);
// The control panel's display, redrawn when the setting or the compressor changes.
const lcd = document.createElement('canvas'); lcd.width = 256; lcd.height = 128;
const lcdTexture = new THREE.CanvasTexture(lcd); lcdTexture.encoding = THREE.sRGBEncoding;
function drawLcd(setC, on) {
  const g = lcd.getContext('2d'), font = '"IBM Plex Mono", ui-monospace, monospace';
  g.fillStyle = '#061019'; g.fillRect(0, 0, 256, 128);
  g.fillStyle = '#8fe3ff'; g.font = `600 88px ${font}`; g.fillText(String(setC), 16, 104);
  g.font = `500 30px ${font}`; g.fillText('°C', 136, 50);
  g.font = `600 22px ${font}`; g.fillStyle = on ? '#8fe3ff' : '#2f5468'; g.fillText(on ? 'COOL' : 'FAN', 140, 104);
  lcdTexture.needsUpdate = true;
}

// ---------- Materials ----------
const M = createMaterials({
  cabinet: { color: 0xe3e0d8, metalness: 0.35, roughness: 0.42, side: THREE.DoubleSide },
  plastic: { color: 0xf4f3ef, metalness: 0.05, roughness: 0.45 },
  slat: { color: 0xdedcd6, metalness: 0.05, roughness: 0.5 },
  dark: 'dark', iron: 'iron', steel: 'brushed',
  copper: { look: 'copper', roughness: 0.32 },
  fin: { color: 0xffffff, metalness: 0.6, roughness: 0.38, map: finTexture },
  plate: { color: 0xb9c0c7, metalness: 0.7, roughness: 0.35 },
  galv: { color: 0xb3bac1, metalness: 0.65, roughness: 0.42, side: THREE.DoubleSide },
  compressor: { color: 0x2b2f34, metalness: 0.45, roughness: 0.42 },
  motor: { color: 0x5c646e, metalness: 0.6, roughness: 0.4 },
  blade: { color: 0x3a4047, metalness: 0.1, roughness: 0.55, side: THREE.DoubleSide },
  wheel: { color: 0xa3abb4, metalness: 0.65, roughness: 0.38, side: THREE.DoubleSide },
  foam: { color: 0x8d949b, roughness: 0.95 },
  plaster: { color: 0xece6dc, roughness: 0.92 },
  brick: { color: 0xffffff, roughness: 0.9, map: brickTexture },
  water: { color: 0x4f8fd0, roughness: 0.1 },
  filter: { color: 0x7fa6c4, roughness: 0.8, alphaMap: meshTexture, side: THREE.DoubleSide },
  rubber: 'rubber',
  cable: { color: 0xf2f2ee, roughness: 0.6 },
  screen: { color: 0x05090d, roughness: 0.25, emissive: 0xffffff, emissiveMap: lcdTexture },
}, { pbr: true });

// Refrigerant colours, from hot gas leaving the compressor to cool gas coming back to it.
const HEAT = { gas: 0xff3a22, condensing: 0xff7a1a, liquid: 0xffa62a, cold: 0x2f7dff, cool: 0x34c6ff };
const mix = (a, b, t) => new THREE.Color(a).lerp(new THREE.Color(b), t).getHex();

// ---------- Helpers ----------
// UVs in world units, so a texture tiles at the same scale on every face of a box.
// pick(normal) names the two axes a face maps to.
const worldPick = n => (Math.abs(n.x) > 0.5 ? ['z', 'y'] : Math.abs(n.y) > 0.5 ? ['x', 'z'] : ['x', 'y']);
function worldUV(geo, pick = worldPick) {
  const pos = geo.attributes.position, nor = geo.attributes.normal, uv = geo.attributes.uv;
  const p = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i); n.fromBufferAttribute(nor, i);
    const [a, b] = pick(n); uv.setXY(i, p[a], p[b]);
  }
  uv.needsUpdate = true;
  return geo;
}
// A box given by its corners, with its geometry in world position (for worldUV).
function slab([x0, x1], [y0, y1], [z0, z1], mats, pick) {
  const geo = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0).translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  return new THREE.Mesh(pick === null ? geo : worldUV(geo, pick), mats);
}
// Many small meshes that share a material, merged into one to keep the draw calls down.
function merge(meshes, material) {
  const geos = meshes.map(m => { m.updateMatrix(); return m.geometry.clone().applyMatrix4(m.matrix); });
  return new THREE.Mesh(BufferGeometryUtils.mergeBufferGeometries(geos), material);
}
// A cylinder lying along x.
const alongX = mesh => { mesh.rotation.z = Math.PI / 2; return mesh; };
// A shape drawn in the (z, y) plane around the shaft, extruded THICK toward -x from x.
function plateZY(shape, x, thick, mat) {
  const geo = new THREE.ExtrudeGeometry(shape, { depth: thick, bevelEnabled: false, curveSegments: 48 });
  geo.rotateY(-Math.PI / 2); geo.translate(x, AXIS.y, AXIS.z);
  return new THREE.Mesh(geo, mat);
}
// A band through (u, v) points around the shaft, from x0 to x1: the curved wall of the blower scroll.
function ribbon(points, x0, x1, mat) {
  const pos = [], index = [];
  points.forEach(([u, v], i) => {
    pos.push(x0, AXIS.y + v, AXIS.z + u, x1, AXIS.y + v, AXIS.z + u);
    if (i) { const a = 2 * (i - 1); index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(index); geo.computeVertexNormals();
  return new THREE.Mesh(geo, mat);
}
// A pipe path through [x, y, z] points with its corners bent round (radius r), as copper is.
function bentPath(points, r = 0.25) {
  const P = points.map(p => new THREE.Vector3(...p)), path = new THREE.CurvePath();
  let last = P[0];
  for (let i = 1; i < P.length - 1; i++) {
    const [a, b, c] = [P[i - 1], P[i], P[i + 1]];
    const k = Math.min(r, a.distanceTo(b) * (i === 1 ? 1 : 0.5), c.distanceTo(b) * (i === P.length - 2 ? 1 : 0.5));
    const A = b.clone().addScaledVector(a.clone().sub(b).normalize(), k), B = b.clone().addScaledVector(c.clone().sub(b).normalize(), k);
    if (last.distanceTo(A) > 1e-4) path.add(new THREE.LineCurve3(last, A));
    path.add(new THREE.QuadraticBezierCurve3(A, b, B));
    last = B;
  }
  path.add(new THREE.LineCurve3(last, P[P.length - 1]));
  return path;
}
// A copper tube with refrigerant dashes moving along it. heat is the colour of the refrigerant
// inside; speed is how fast it moves (gas is fast, liquid is slow).
const flows = [];
function flowTube(path, { radius = 0.045, heat, speed = 1 }) {
  const curve = Array.isArray(path) ? bentPath(path) : path;
  const length = curve.getLength();
  const geo = new THREE.TubeGeometry(curve, Math.max(8, Math.ceil(length / 0.06)), radius, 8, false);
  const texture = dashTexture.clone(); texture.needsUpdate = true; texture.repeat.set(length / DASH, 1);
  const material = M.copper.clone(); material.emissive = new THREE.Color(0xffffff); material.emissiveMap = texture;
  const mesh = new THREE.Mesh(geo, material);
  mesh.userData.flow = linear(heat);
  flows.push({ texture, speed: speed * (0.9 + Math.random() * 0.2) });
  return mesh;
}
// The tube through a coil: back and forth along z, one pass per level, with a U-bend at each end.
// Each pass is its own tube so the colour can change along the coil.
function serpentine(group, x, levels, zNear, zFar, heat, speed) {
  const bend = Math.abs(levels[1] - levels[0]) / 2;
  levels.forEach((y, i) => {
    const from = i % 2 ? zFar : zNear, to = i % 2 ? zNear : zFar, out = to + Math.sign(to - from) * bend;
    const next = levels[i + 1];
    const pts = next === undefined ? [[x, y, from], [x, y, to]] : [[x, y, from], [x, y, out], [x, next, out], [x, next, to]];
    group.add(flowTube(bentPath(pts, bend), { heat: heat(i / (levels.length - 1)), speed }));
  });
}
// A finned coil: an aluminium fin pack with plain end plates, and its tube.
const finPick = n => (Math.abs(n.z) > 0.5 ? ['x', 'y'] : Math.abs(n.x) > 0.5 ? ['z', 'y'] : ['z', 'x']);
function finPack({ x0, x1, y0, y1, z0, z1 }, tint) {
  const mesh = slab([x0, x1], [y0, y1], [z0, z1], [M.fin, M.fin, M.fin, M.fin, M.plate, M.plate], finPick);
  mesh.userData.tint = linear(tint);
  return mesh;
}

// ---------- Parts ----------
const root = new THREE.Group(); scene.add(root);
const { parts, add, update } = createParts(root, { shadows: true, lively: true });
const ZERO = new THREE.Vector3();
const FRONT_BACK = BODY.front + 0.3; // the front panel is 3 cm deep
const H = BODY.top - BODY.bottom, MID_Y = (BODY.top + BODY.bottom) / 2;

// A slice of the 23 cm brick wall the AC sits in, and the bracket under the part outside.
{
  const g = new THREE.Group(), P = M.plaster, B = M.brick, X = [WALL.x0, WALL.x1];
  g.add(slab(X, [WALL.floor, BODY.bottom], [WALL.back, BODY.half], [P, P, P, B, B, B]));
  g.add(slab(X, [BODY.top, WALL.top], [WALL.back, BODY.half], [P, P, B, P, B, B]));
  g.add(slab(X, [BODY.bottom, BODY.top], [WALL.back, -BODY.half], [P, P, B, B, P, B]));
  const reach = BODY.back - 0.4 - WALL.x1, drop = 1.0, strut = Math.hypot(reach * 0.8, drop);
  [-2.5, 2.5].forEach(z => {
    g.add(box([reach, 0.1, 0.12], M.iron, [WALL.x1 + reach / 2, BODY.bottom - 0.05, z], 0.012));
    const s = box([strut, 0.09, 0.1], M.iron, [WALL.x1 + reach * 0.4, BODY.bottom - 0.1 - drop / 2, z], 0.012);
    s.rotation.z = Math.atan2(drop, reach * 0.8); g.add(s);
  });
  g.userData.anchor = [WALL.x1, WALL.top - 0.3, BODY.half];
  add('wall', g, ZERO, ZERO);
}

// Steel cabinet: top and sides, with vents in the sides of the part outside.
{
  const g = new THREE.Group(), len = BODY.back - FRONT_BACK, cx = (BODY.back + FRONT_BACK) / 2;
  g.add(box([len, 0.05, BODY.half * 2], M.cabinet, [cx, BODY.top - 0.025, 0], 0.012));
  const louvres = [], slots = [];
  [-1, 1].forEach(s => {
    g.add(box([len, H, 0.05], M.cabinet, [cx, MID_Y, s * (BODY.half - 0.025)], 0.012));
    for (let row = 0; row < 9; row++) for (const x of [0.45, 2.15]) {
      const y = BODY.bottom + 0.55 + row * 0.38;
      const l = box([1.45, 0.05, 0.07], M.cabinet, [x, y, s * (BODY.half + 0.02)], 0.01); l.rotation.x = s * 0.5; louvres.push(l);
      slots.push(box([1.45, 0.09, 0.02], M.dark, [x, y - 0.02, s * (BODY.half + 0.002)], 0));
    }
  });
  g.add(merge(louvres, M.cabinet), merge(slots, M.dark));
  g.add(box([0.08, 0.1, BODY.half * 2], M.cabinet, [BODY.back - 0.04, BODY.top - 0.08, 0], 0.012));
  g.userData.anchor = [1.2, BODY.top, BODY.half];
  add('case', g, ZERO, new THREE.Vector3(0, 3.4, 0));
}

// Base pan: the steel floor of the whole unit, with the drip tray under the cold coil and the
// sump at the back that holds the water.
{
  add('base', box([BODY.back - BODY.front - 0.08, 0.1, BODY.half * 2 - 0.06], M.galv, [0, PAN_Y - 0.05, 0], 0.02), ZERO, ZERO);
  const g = new THREE.Group();
  const trayX = (EVAP.x0 + EVAP.x1) / 2, trayW = EVAP.z1 - EVAP.z0 + 0.3, trayZ = (EVAP.z0 + EVAP.z1) / 2;
  g.add(box([0.75, 0.04, trayW], M.galv, [trayX, PAN_Y + 0.12, trayZ], 0.01));
  [-0.37, 0.37].forEach(dx => g.add(box([0.03, 0.16, trayW], M.galv, [trayX + dx, PAN_Y + 0.19, trayZ], 0.01)));
  const sump = 1.95;
  g.add(box([0.04, 0.42, BODY.half * 2 - 0.2], M.galv, [sump, PAN_Y + 0.21, 0], 0.01));
  const water = box([BODY.back - 0.1 - sump, WATER_Y - PAN_Y, BODY.half * 2 - 0.24], M.water, [(sump + BODY.back - 0.1) / 2, (WATER_Y + PAN_Y) / 2, 0], 0.01);
  water.userData.water = true; water.userData.noGhost = true; water.userData.noShadow = true; g.add(water);
  g.userData.anchor = [2.9, WATER_Y, 2.4];
  add('tray', g, ZERO, ZERO);
}

// Front panel on the room side: the intake grille, the louvres on top and the filter behind.
const GRILLE = { z0: BODY.half * -1 + 0.17, z1: 1.75 };
{
  const g = new THREE.Group(), fx = (BODY.front + FRONT_BACK) / 2, gz = (GRILLE.z0 + GRILLE.z1) / 2, gw = GRILLE.z1 - GRILLE.z0;
  g.add(box([0.3, H + 0.06, 0.2], M.plastic, [fx, MID_Y, -BODY.half + 0.07]));
  g.add(box([0.3, 0.2, BODY.half * 2], M.plastic, [fx, BODY.bottom + 0.07, 0]));
  g.add(box([0.3, 0.12, BODY.half * 2], M.plastic, [fx, BODY.top - 0.03, 0]));
  g.add(box([0.3, 0.14, gw], M.plastic, [fx, 1.75, gz]));
  g.add(box([0.32, H + 0.06, BODY.half - GRILLE.z1], M.plastic, [fx - 0.01, MID_Y, (GRILLE.z1 + BODY.half) / 2]));
  const slats = [];
  for (let y = EVAP.y0 - 0.16; y < 1.62; y += 0.15) slats.push(box([0.06, 0.045, gw], M.slat, [BODY.front + 0.06, y, gz]));
  [-1.9, 0.5].forEach(z => slats.push(box([0.07, 3.0, 0.06], M.slat, [BODY.front + 0.08, 0.2, z])));
  for (const y of [1.95, 2.17, 2.39]) { const v = box([0.3, 0.03, gw], M.slat, [fx, y, gz]); v.rotation.z = -0.45; slats.push(v); }
  g.add(merge(slats, M.slat));
  const filter = new THREE.Mesh(new THREE.PlaneGeometry(gw - 0.1, EVAP.y1 - EVAP.y0 + 0.1), M.filter);
  filter.rotation.y = -Math.PI / 2; filter.position.set(FRONT_BACK + 0.05, (EVAP.y0 + EVAP.y1) / 2, gz); filter.userData.noShadow = true; g.add(filter);
  // The floor of the duct that carries the blower's air over the cold coil to the louvres.
  g.add(box([BLOWER.x + BLOWER.w / 2 + 0.08 - EVAP.x0, 0.03, EVAP.z1 - EVAP.z0], M.galv, [(BLOWER.x + BLOWER.w / 2 + 0.08 + EVAP.x0) / 2, EVAP.y1 + 0.1, (EVAP.z0 + EVAP.z1) / 2], 0));
  g.userData.anchor = [BODY.front, 0.2, -1.5];
  add('front', g, ZERO, new THREE.Vector3(-2.4, 0, 0));
}

// Controls: the display and buttons, the control box behind them, the run capacitor, and the
// thermostat's sensor clipped in front of the cold coil.
{
  const g = new THREE.Group(), cz = (GRILLE.z1 + BODY.half) / 2;
  g.add(box([0.02, 0.56, 1.06], M.dark, [BODY.front - 0.02, 1.95, cz], 0.008));
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.92, 0.46), M.screen);
  screen.rotation.y = -Math.PI / 2; screen.position.set(BODY.front - 0.032, 1.95, cz); screen.userData.screen = true; g.add(screen);
  for (let i = 0; i < 4; i++) g.add(alongX(cylinder(0.075, 0.075, 0.05, M.slat, [BODY.front - 0.03, 1.32, cz - 0.42 + i * 0.28], { segments: 20 })));
  g.add(box([0.45, 0.85, 0.8], M.dark, [-3.25, 1.85, 2.75], 0.04));
  g.add(cylinder(0.15, 0.15, 0.5, M.steel, [-2.75, 2.0, 2.85], { segments: 24 }));
  g.add(cylinder(0.035, 0.035, 0.3, M.dark, [EVAP.x0 - 0.025, 0.1, 0.9], { segments: 12 }));
  const lead = new THREE.CatmullRomCurve3([[EVAP.x0 - 0.025, 0.25, 0.9], [EVAP.x0 - 0.03, 0.9, 1.3], [-3.3, 1.3, 1.95], [-3.25, 1.45, 2.36]].map(p => new THREE.Vector3(...p)));
  g.add(new THREE.Mesh(new THREE.TubeGeometry(lead, 32, 0.014, 6, false), M.cable));
  g.userData.anchor = [BODY.front - 0.04, 1.95, cz];
  add('controls', g, ZERO, new THREE.Vector3(-2.4, 0, 0));
}

// The insulated partition between the two sides.
{
  const g = new THREE.Group(), h = BODY.top - PAN_Y - 0.06, y = (BODY.top + PAN_Y) / 2;
  g.add(box([0.12, h, BODY.half * 2 - 0.1], M.foam, [PARTITION_X, y, 0], 0.02));
  g.add(box([0.02, h, BODY.half * 2 - 0.1], M.galv, [PARTITION_X + 0.07, y, 0], 0));
  g.userData.anchor = [PARTITION_X, 1.9, 2.2];
  add('partition', g, ZERO, ZERO);
}

// The cold coil (evaporator) behind the filter: 8 passes, cold liquid in at the bottom, cool gas out at the top.
const EVAP_X = (EVAP.x0 + EVAP.x1) / 2;
const EVAP_LEVELS = Array.from({ length: 8 }, (_, i) => EVAP.y0 + 0.2 + i * (EVAP.y1 - EVAP.y0 - 0.4) / 7);
{
  const g = new THREE.Group();
  g.add(finPack(EVAP, 0x2f7dff));
  serpentine(g, EVAP_X, EVAP_LEVELS, EVAP.z1, EVAP.z0, t => mix(HEAT.cold, HEAT.cool, t), 0.7);
  g.userData.anchor = [EVAP_X, 1.0, EVAP.z1 + 0.15];
  add('evaporator', g, ZERO, ZERO);
}

// The hot coil (condenser) across the back: 10 passes, hot gas in at the top, warm liquid out at the bottom.
const COND_X = (COND.x0 + COND.x1) / 2;
const COND_LEVELS = Array.from({ length: 10 }, (_, i) => COND.y1 - 0.19 - i * 0.375);
{
  const g = new THREE.Group();
  g.add(finPack(COND, 0xff5a1a));
  serpentine(g, COND_X, COND_LEVELS, COND.z1, COND.z0, t => (t < 0.5 ? mix(HEAT.gas, HEAT.condensing, t * 2) : mix(HEAT.condensing, HEAT.liquid, t * 2 - 1)), 0.6);
  g.userData.anchor = [COND_X, 1.7, COND.z1 + 0.15];
  add('condenser', g, ZERO, ZERO);
}

// Rotary compressor on rubber feet, with the suction accumulator on its side.
const COMP = { x: 1.3, z: 2.15 };
const ACC = { x: 0.45, z: 2.47 };
{
  const g = new THREE.Group();
  const shell = lathe([[0, -1.45], [0.42, -1.44], [0.56, -1.38], [0.6, -1.25], [0.6, 0.85], [0.57, 0.98], [0.45, 1.07], [0.2, 1.12], [0, 1.13]], M.compressor, { segments: 48 });
  shell.position.set(COMP.x, 0, COMP.z); g.add(shell);
  g.add(cylinder(0.615, 0.615, 0.05, M.compressor, [COMP.x, 0.62, COMP.z], { segments: 48 })); // weld seam
  g.add(box([0.32, 0.26, 0.12], M.dark, [COMP.x, 0.72, COMP.z + 0.62], 0.03)); // terminal cover
  [0, 2.1, 4.2].forEach(a => {
    const foot = box([0.34, 0.04, 0.2], M.compressor, [COMP.x + Math.cos(a) * 0.62, -1.42, COMP.z + Math.sin(a) * 0.62], 0.01); foot.rotation.y = -a; g.add(foot);
    g.add(cylinder(0.08, 0.09, 0.12, M.rubber, [COMP.x + Math.cos(a) * 0.68, PAN_Y + 0.06, COMP.z + Math.sin(a) * 0.68], { segments: 14 }));
  });
  const acc = lathe([[0, -0.42], [0.22, -0.4], [0.27, -0.32], [0.27, 0.86], [0.22, 0.94], [0.07, 0.97], [0, 0.97]], M.compressor, { segments: 32 });
  acc.position.set(ACC.x, 0, ACC.z); g.add(acc);
  const strap = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.025, 8, 32), M.steel); strap.rotation.x = Math.PI / 2; strap.position.set(ACC.x, 0.45, ACC.z); g.add(strap);
  g.add(flowTube([[ACC.x, -0.42, ACC.z], [ACC.x, -0.66, ACC.z], [COMP.x - 0.45, -0.66, COMP.z + 0.18], [COMP.x - 0.56, -0.66, COMP.z + 0.12]], { radius: 0.055, heat: HEAT.cool, speed: 1.2 }));
  g.userData.anchor = [COMP.x, 0.2, COMP.z + 0.6];
  add('compressor', g, ZERO, ZERO);
}

// The copper lines that join it all: discharge (hot gas), liquid (with a filter-drier) and suction (cool gas).
const LIQUID_END = [0.45, COND_LEVELS[9], 3.08];
{
  const g = new THREE.Group(), top = COND_LEVELS[0], bottom = COND_LEVELS[9];
  g.add(flowTube([[COMP.x, 1.1, COMP.z], [COMP.x, top, COMP.z], [COMP.x, top, 3.08], [COND_X, top, 3.08], [COND_X, top, COND.z1 - 0.05]], { heat: HEAT.gas, speed: 1.3 }));
  g.add(flowTube([[COND_X, bottom, COND.z1 - 0.05], [COND_X, bottom, 3.08], LIQUID_END], { radius: 0.035, heat: HEAT.liquid, speed: 0.45 }));
  g.add(alongX(cylinder(0.09, 0.09, 0.55, M.copper, [2.3, bottom, 3.08], { segments: 18 }))); // filter-drier
  const top2 = EVAP_LEVELS[7];
  g.add(flowTube([[EVAP_X, top2, EVAP.z1 - 0.05], [EVAP_X, top2, 1.85], [ACC.x, top2, 1.85], [ACC.x, top2, ACC.z], [ACC.x, 0.96, ACC.z]], { radius: 0.06, heat: HEAT.cool, speed: 1.2 }));
  add('pipes', g, ZERO, ZERO);
}

// Capillary: about 1 m of 1.5 mm bore tube, coiled, from the liquid line to the cold coil.
{
  const g = new THREE.Group(), c = { x: -0.2, z: 2.8, r: 0.22, y0: -1.0, y1: -0.25, turns: 5 };
  // Wound so the tube enters and leaves the coil heading toward -z.
  const helixPoint = t => [c.x + c.r * Math.cos(t * Math.PI * 2 * c.turns), c.y0 + (c.y1 - c.y0) * t, c.z - c.r * Math.sin(t * Math.PI * 2 * c.turns)];
  const start = helixPoint(0), end = helixPoint(1), outZ = end[2] - 0.25;
  g.add(flowTube([LIQUID_END, [start[0] + 0.2, LIQUID_END[1], LIQUID_END[2]], [start[0], start[1], start[2] + 0.28], start], { radius: 0.03, heat: HEAT.liquid, speed: 1.4 }));
  for (let k = 0; k < 4; k++) {
    const pts = Array.from({ length: 31 }, (_, i) => new THREE.Vector3(...helixPoint((k + i / 30) / 4)));
    g.add(flowTube(new THREE.CatmullRomCurve3(pts), { radius: 0.03, heat: mix(HEAT.liquid, HEAT.cold, (k + 0.5) / 4), speed: 1.6 }));
  }
  const inlet = EVAP_LEVELS[0];
  g.add(flowTube([end, [end[0], end[1], outZ], [-1.8, end[1], outZ], [-2.6, inlet, outZ], [EVAP_X, inlet, outZ], [EVAP_X, inlet, EVAP.z1 - 0.05]], { radius: 0.03, heat: HEAT.cold, speed: 1.6 }));
  g.userData.anchor = [c.x, (c.y0 + c.y1) / 2, c.z + c.r];
  add('capillary', g, ZERO, ZERO);
}

// One motor with a shaft out of each end, on a cradle behind the partition.
{
  const g = new THREE.Group(), mx = -0.6;
  g.add(alongX(cylinder(0.52, 0.52, 0.9, M.motor, [mx, AXIS.y, AXIS.z], { segments: 36 })));
  [-0.49, 0.49].forEach(dx => g.add(alongX(cylinder(0.44, 0.5, 0.08, M.steel, [mx + dx, AXIS.y, AXIS.z], { segments: 36 }))));
  const shaftX0 = BLOWER.x - 0.5, shaftX1 = FAN.x + 0.2;
  g.add(alongX(cylinder(0.045, 0.045, shaftX1 - shaftX0, M.steel, [(shaftX0 + shaftX1) / 2, AXIS.y, AXIS.z], { segments: 12 })));
  g.add(box([0.9, 0.06, 1.15], M.galv, [mx, AXIS.y - 0.55, AXIS.z], 0.01));
  g.add(box([0.06, AXIS.y - 0.58 - PAN_Y, 1.0], M.galv, [mx, (AXIS.y - 0.58 + PAN_Y) / 2, AXIS.z], 0.01));
  g.userData.anchor = [mx, AXIS.y + 0.52, AXIS.z + 0.2];
  add('motor', g, ZERO, new THREE.Vector3(0, 1.6, 0));
}

// Blower: a squirrel-cage wheel in a spiral scroll that opens upward into the duct over the cold coil.
const blowerWheel = new THREE.Group();
{
  const g = new THREE.Group(), x0 = BLOWER.x - BLOWER.w / 2, x1 = BLOWER.x + BLOWER.w / 2;
  blowerWheel.position.set(BLOWER.x, AXIS.y, AXIS.z); g.add(blowerWheel);
  const blades = [];
  for (let i = 0; i < 30; i++) {
    const a = i / 30 * Math.PI * 2;
    const b = box([BLOWER.w, 0.15, 0.016], M.wheel, [0, BLOWER.r * 0.92 * Math.cos(a), BLOWER.r * 0.92 * Math.sin(a)], 0);
    b.rotation.x = a + 0.55; blades.push(b);
  }
  blowerWheel.add(merge(blades, M.wheel));
  const ring = new THREE.Mesh(new THREE.TorusGeometry(BLOWER.r * 0.92, 0.03, 8, 48), M.wheel); ring.rotation.y = Math.PI / 2; ring.position.x = -BLOWER.w / 2; blowerWheel.add(ring);
  blowerWheel.add(alongX(cylinder(BLOWER.r, BLOWER.r, 0.03, M.wheel, [BLOWER.w / 2, 0, 0], { segments: 40 })));
  blowerWheel.add(alongX(cylinder(0.14, 0.14, 0.2, M.steel, [BLOWER.w / 2 - 0.1, 0, 0], { segments: 16 })));
  // The scroll: its radius grows from 1.0 to 1.3 around the wheel, then it rises into the duct.
  const outline = [];
  for (let i = 0; i <= 48; i++) { const t = 0.4 + (Math.PI * 2 - 0.4) * i / 48, r = 1 + 0.3 * i / 48; outline.push([r * Math.cos(t), r * Math.sin(t)]); }
  outline.push([1.3, 1.45], [0.95, 1.45], [0.95, 0.42]);
  const shape = () => new THREE.Shape(outline.map(([u, v]) => new THREE.Vector2(u, v)));
  const front = shape(); front.holes.push(new THREE.Path().absarc(0, 0, 0.62, 0, Math.PI * 2, true));
  const back = shape(); back.holes.push(new THREE.Path().absarc(0, 0, 0.08, 0, Math.PI * 2, true));
  g.add(plateZY(front, x0 - 0.05, 0.03, M.galv), plateZY(back, x1 + 0.08, 0.03, M.galv), ribbon(outline, x0 - 0.06, x1 + 0.07, M.galv));
  g.userData.anchor = [BLOWER.x, AXIS.y + 1.1, AXIS.z + 0.5];
  add('blower', g, ZERO, new THREE.Vector3(0, 1.6, 0));
}

// Outdoor fan: four swept blades, and the slinger ring round their tips.
function propBlade({ r0 = 0.25, r1 = FAN.r - 0.01, chord0 = 0.45, chord1 = 0.95, pitch0 = 0.8, pitch1 = 0.45, sweep = 0.3 } = {}) {
  const geo = new THREE.PlaneGeometry(1, 1, 12, 5), p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const s = p.getX(i) + 0.5, c = p.getY(i);
    const r = r0 + (r1 - r0) * s, w = chord0 + (chord1 - chord0) * s, pitch = pitch0 + (pitch1 - pitch0) * s;
    const t = (c * w * Math.cos(pitch) + sweep * s * s) / r;
    p.setXYZ(i, -c * w * Math.sin(pitch), r * Math.cos(t), r * Math.sin(t));
  }
  geo.computeVertexNormals();
  return geo;
}
const fanRotor = new THREE.Group();
{
  const g = new THREE.Group();
  fanRotor.position.set(FAN.x, AXIS.y, AXIS.z); g.add(fanRotor);
  const bladeGeo = propBlade();
  for (let i = 0; i < 4; i++) { const b = new THREE.Mesh(bladeGeo, M.blade); b.rotation.x = i * Math.PI / 2; fanRotor.add(b); }
  fanRotor.add(alongX(cylinder(0.24, 0.26, 0.34, M.blade, [0, 0, 0], { segments: 24 })));
  fanRotor.add(alongX(new THREE.Mesh(new THREE.CylinderGeometry(FAN.r + 0.03, FAN.r + 0.03, 0.26, 72, 1, true), M.blade)));
  g.userData.anchor = [FAN.x, AXIS.y + 1.0, AXIS.z + 1.1];
  add('fan', g, ZERO, new THREE.Vector3(0, 1.6, 0));
}
// The shroud round the fan: a plate with a round, flared opening, so the fan pulls air only through the coil.
{
  const g = new THREE.Group();
  const shroud = new THREE.Shape([[-2.3, PAN_Y - AXIS.y + 0.05], [2.15, PAN_Y - AXIS.y + 0.05], [2.15, BODY.top - AXIS.y - 0.08], [-2.3, BODY.top - AXIS.y - 0.08]].map(([u, v]) => new THREE.Vector2(u, v)));
  shroud.holes.push(new THREE.Path().absarc(0, 0, FAN.r + 0.17, 0, Math.PI * 2, true));
  g.add(plateZY(shroud, FAN.x + 0.42, 0.03, M.galv));
  const bell = alongX(new THREE.Mesh(new THREE.CylinderGeometry(FAN.r + 0.17, FAN.r + 0.17, 0.3, 72, 1, true), M.galv));
  bell.position.set(FAN.x + 0.26, AXIS.y, AXIS.z); g.add(bell);
  add('shroud', g, ZERO, new THREE.Vector3(0, 1.6, 0));
}

// ---------- Air and water ----------
const dot = softDot();
// A cloud of soft dots, each with its own colour and alpha.
function cloud(count, size, seeds = 5) {
  const geo = new THREE.BufferGeometry(), pos = new Float32Array(count * 3), tint = new Float32Array(count * 4);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('tint', new THREE.BufferAttribute(tint, 4));
  const material = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uMap: { value: dot }, uSize: { value: size }, uScale: { value: 400 }, uOpacity: { value: 0 } },
    vertexShader: /* glsl */`
      attribute vec4 tint; varying vec4 vTint; uniform float uSize, uScale;
      void main() {
        vTint = tint;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = uSize * uScale / -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D uMap; uniform float uOpacity; varying vec4 vTint;
      void main() {
        float a = texture2D(uMap, gl_PointCoord).a * vTint.a * uOpacity;
        if (a < 0.01) discard;
        gl_FragColor = vec4(vTint.rgb, a);
      }`,
  });
  const points = new THREE.Points(geo, material); points.frustumCulled = false; points.visible = false; scene.add(points);
  const list = Array.from({ length: count }, (_, i) => ({ u: (i + Math.random()) / count, speed: 0.85 + Math.random() * 0.3, r: Array.from({ length: seeds }, Math.random) }));
  return { points, material, pos, tint, list, geo };
}
const rgb = hex => new THREE.Color(hex).toArray(); // the dots draw in screen colour, so no linear conversion
const STREAMS = [
  { key: 'room', cloud: cloud(260, 0.3), path: roomAir, rate: 0.07, from: rgb(0xd99a52), to: rgb(0x2f8cff) },
  { key: 'out', cloud: cloud(260, 0.3), path: outdoorAir, rate: 0.075, from: rgb(0xd9a441), to: rgb(0xff4326) },
];
const WATER = [
  { cloud: cloud(90, 0.36), path: drip, rate: 0.12, color: rgb(0x2f86ff) },
  { cloud: cloud(220, 0.34), path: spray, rate: 0.5, color: rgb(0x3d8bff) },
];
const P = [0, 0, 0, 0, 0];
const bufferSize = new THREE.Vector2();

// ---------- State and UI ----------
const state = { step: 0, explode: 0, targetExplode: 0, playing: true, focus: [], cut: false, ghost: true, air: [], water: false, pace: 1, setC: AC.setC };
const room = createRoom();
const shown = { run: 1, fans: 0, angle: 0, water: 0 };
let camGoal = null;
const story = createStoryUI({
  story: AC_STORY, state,
  onStep: s => {
    state.focus = s.focus; state.cut = s.cut; state.ghost = s.ghost !== false;
    state.air = s.air; state.water = !!s.water; state.pace = s.pace ?? 1;
    // The thermostat step starts just above the setting, so the compressor stops soon.
    if (s.pace) room.T = Math.min(room.T, state.setC + AC.band - 0.2);
    const v = VIEWS[s.view]; camGoal = { ...v, target: new THREE.Vector3(...v.target) };
    cam.theta = v.theta + THREE.MathUtils.euclideanModulo(cam.theta - v.theta + Math.PI, 2 * Math.PI) - Math.PI; // take the short way round
  },
});
bindRange('set', v => { state.setC = v; showRange(document.getElementById('set'), `${v}°C`); });
createCallouts(stage, { parts, state, story: AC_STORY });

// Cutaway steps open the cabinet, the front panel and the wall. Parts out of focus fade to
// x-ray, except the copper loop, which the story follows the whole way round.
const CUT = new Set(['case', 'front', 'wall']);
// Big flat panels seen at a slant build up a dense x-ray, so they fade further.
const FLAT = { partition: 0.1, base: 0.12, shroud: 0.12, tray: 0.15 };
const BLACK = new THREE.Color(0), glowTint = new THREE.Color();
const focusStyle = {
  highlight: 0.18,
  opacity(name, mesh, hot) {
    let alpha = 1;
    if (state.cut && CUT.has(name)) alpha = hot ? 0.35 : name === 'wall' ? 0.15 : 0.08;
    else if (state.ghost && state.focus.length && !hot && name !== 'pipes' && looksInside(state)) alpha = FLAT[name] ?? 0.3;
    if (mesh.userData.water) alpha *= 0.6;
    return alpha;
  },
  // Pipes glow with the refrigerant's colour while it flows; the coils take a faint tint
  // (cold blue, hot orange) while the compressor runs; the display always shows.
  decorate(material, { mesh }) {
    const u = mesh.userData, glow = u.glow ?? 0;
    if (u.flow) { material.emissive.copy(u.flow); material.emissiveIntensity = 1.3 * shown.run; return; }
    if (u.screen) { material.emissive.setRGB(1, 1, 1); material.emissiveIntensity = 1; return; }
    material.emissive.copy(glow > 0.001 ? material.color : BLACK).multiplyScalar(glow);
    if (u.tint) material.emissive.add(glowTint.copy(u.tint).multiplyScalar(0.22 * shown.run));
    material.emissiveIntensity = 1;
  },
};

const readout = {
  box: document.getElementById('readout'), room: document.getElementById('r-room'),
  air: document.getElementById('r-air'), comp: document.getElementById('r-comp'),
};
function showReadout() {
  readout.room.textContent = `${room.T.toFixed(1)}°C`;
  readout.air.textContent = `${supplyAirC(room.T, shown.run).toFixed(1)}°C`;
  readout.comp.textContent = room.on ? 'On' : room.wait > 0 ? 'Off · wait' : 'Off';
  readout.box.classList.toggle('cold', room.on);
}

// ---------- Sound ----------
// Mains hum from the compressor motor (twice 50 Hz) over a low rumble, air through both fans,
// a faint hiss where the liquid squeezes through the capillary, and the relay's click.
const hum = sound.loop({ type: 'tone', wave: 'triangle', freq: 100 });
const rumble = sound.loop({ type: 'noise', filter: 'lowpass', freq: 180, q: 1.2 });
const whoosh = sound.loop({ type: 'noise', filter: 'lowpass', freq: 650, q: 0.7 });
const hiss = sound.loop({ type: 'noise', filter: 'highpass', freq: 5200, q: 0.7 });
let wasOn = room.on, splashIn = 0;
function playSounds(dt) {
  hum.set(0.03 * shown.run);
  rumble.set(0.1 * shown.run);
  whoosh.set(0.11 * shown.fans, 450 + 300 * shown.fans);
  hiss.set((state.focus.includes('capillary') ? 0.03 : 0.008) * shown.run);
  if (room.on !== wasOn) { sound.click(0.3); if (room.on) sound.thunk(0.22); }
  wasOn = room.on;
  splashIn -= dt;
  if (shown.water > 0.5 && shown.fans > 0.5 && splashIn <= 0) {
    splashIn = 0.06 + Math.random() * 0.2;
    sound.noise({ gain: 0.012 + Math.random() * 0.02, release: 0.05, freq: 2500 + Math.random() * 3000, q: 2 });
  }
}

// ---------- Frame ----------
let lcdShown = '', readoutIn = 0;
startLoop(stage, (dt, now) => {
  update(state, focusStyle, reduced ? 1 : 0.09, dt);
  if (camGoal) { // ease to the step's view once; after that the reader's own zoom wins
    const k = reduced ? 1 : Math.min(1, dt * 2.5);
    for (const a of ['r', 'theta', 'phi']) cam[a] += (camGoal[a] - cam[a]) * k;
    cam.target.lerp(camGoal.target, k);
    if (Math.abs(camGoal.r - cam.r) < 0.05 && Math.abs(camGoal.theta - cam.theta) < 0.005 && cam.target.distanceTo(camGoal.target) < 0.02) camGoal = null;
  }

  // The thermostat, then the compressor and fans easing toward what it asks for.
  if (state.playing) stepRoom(room, dt * state.pace, state.setC);
  const on = room.on && state.playing, ease = (v, target, rate) => v + (target - v) * Math.min(1, reduced ? 1 : dt * rate);
  shown.run = ease(shown.run, on ? 1 : 0, on ? 1.5 : 0.7);
  shown.fans = ease(shown.fans, state.playing ? 1 : 0, 1.2);
  shown.water = ease(shown.water, state.water ? 1 : 0, 3);
  shown.angle += dt * shown.fans * 9;
  blowerWheel.rotation.x = fanRotor.rotation.x = shown.angle;
  flows.forEach(f => { f.texture.offset.x -= dt * shown.run * f.speed / DASH; });
  if (!reduced) parts.compressor.group.position.x += Math.sin(now * 0.37) * 0.005 * shown.run; // it buzzes on its rubber feet

  // Air: warm room air turns blue past the cold coil; outside air turns red past the hot coil.
  stage.renderer.getDrawingBufferSize(bufferSize);
  const scale = bufferSize.y / 2;
  for (const s of STREAMS) {
    const { cloud: c } = s, u = c.material.uniforms;
    u.uOpacity.value = ease(u.uOpacity.value, state.air.includes(s.key) ? 0.9 * shown.fans : 0, 3);
    c.points.visible = u.uOpacity.value > 0.01;
    if (!c.points.visible) continue;
    u.uScale.value = scale;
    c.list.forEach((p, i) => {
      p.u = (p.u + dt * shown.fans * s.rate * p.speed) % 1;
      s.path(p.u, p.r, P);
      const k = P[3] * shown.run;
      for (let j = 0; j < 3; j++) { c.pos[i * 3 + j] = P[j]; c.tint[i * 4 + j] = s.from[j] + (s.to[j] - s.from[j]) * k; }
      c.tint[i * 4 + 3] = P[4];
    });
    c.geo.attributes.position.needsUpdate = c.geo.attributes.tint.needsUpdate = true;
  }
  // Water: drops off the cold coil, and spray off the slinger ring onto the hot coil.
  for (const w of WATER) {
    const { cloud: c } = w, u = c.material.uniforms;
    u.uOpacity.value = shown.water;
    c.points.visible = shown.water > 0.01;
    if (!c.points.visible) continue;
    u.uScale.value = scale;
    c.list.forEach((p, i) => {
      p.u = (p.u + dt * shown.fans * w.rate * p.speed) % 1;
      w.path(p.u, p.r, P);
      for (let j = 0; j < 3; j++) { c.pos[i * 3 + j] = P[j]; c.tint[i * 4 + j] = w.color[j]; }
      c.tint[i * 4 + 3] = P[3];
    });
    c.geo.attributes.position.needsUpdate = c.geo.attributes.tint.needsUpdate = true;
  }

  playSounds(dt);
  const lcdKey = `${state.setC}|${room.on}`;
  if (lcdKey !== lcdShown) { drawLcd(state.setC, room.on); lcdShown = lcdKey; }
  readoutIn -= dt;
  if (readoutIn <= 0) { showReadout(); readoutIn = 0.15; }
});
story.setStep(0, false);
// The display uses the page's mono font; draw it again once the font has loaded.
document.fonts?.ready.then(() => { lcdShown = ''; });
