import * as THREE from 'three';
import { createStage, addFloor, addStudioLights } from '../../src/engine/stage.js';
import { createParts, looksInside } from '../../src/engine/parts.js';
import { createCallouts } from '../../src/engine/callouts.js';
import { createStoryUI, bindRange } from '../../src/engine/story-ui.js';
import { sound } from '../../src/engine/sound.js';
import { startLoop, reducedMotion as reduced } from '../../src/engine/loop.js';
import { box, cylinder, lathe, roundedRect, extrudeUp, coilGeometry } from '../../src/kit/shapes.js';
import { createMaterials } from '../../src/kit/materials.js';
import { softDot, createParticles } from '../../src/kit/effects.js';
import { WASHER_STORY } from './story.js';
import { washRpm, spinRpm, levelFor, litres, sensorKPa, createCycle, stepCycle } from './washer.js';

// ---------- Stage and light ----------
// Scale: 1 unit = 10 cm. The floor is at y = 0. The cabinet is 56 × 58 cm and 89 cm to the top deck.
const VIEWS = {
  front: { r: 23, theta: 0.5, phi: 1.2, target: [0, 4.7, 0] },
  valve: { r: 22, theta: 0.75, phi: 0.98, target: [0.3, 6.2, -0.8] },
  back: { r: 22, theta: -2.45, phi: 1.12, target: [-0.6, 5.4, -1] },
  top: { r: 19, theta: 0.3, phi: 0.56, target: [0, 4.3, 0.3] },
  low: { r: 15.5, theta: 0.9, phi: 1.5, target: [0.5, 2.3, -0.4] },
  side: { r: 22, theta: 0.65, phi: 1.0, target: [0, 5.6, 0] },
  lift: { r: 25, theta: 0.5, phi: 1.16, target: [0, 5.6, 0] },
};
const stage = createStage(document.getElementById('c'), {
  fov: 36, pbr: true, camera: VIEWS.front, zoom: [8, 42], phiLimit: 0.2,
});
const { scene, cam } = stage;
addStudioLights(stage, { key: [9, 20, 11], extent: 8, far: 50 });
addFloor(stage, 0, { size: 28, cell: 1, opacity: 0.13, height: 11, blur: 2.5, darkness: 1.3 }); // 10 cm grid

// ---------- Textures ----------
// Staggered round holes for the basket wall, used as an alpha map.
function holeTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, 64, 64); g.fillStyle = '#000';
  for (const [x, y] of [[16, 16], [48, 48]]) { g.beginPath(); g.arc(x, y, 9, 0, Math.PI * 2); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(60, 14); t.anisotropy = 4;
  return t;
}
// The little screen on the console: the program step and the load.
function screen() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 96;
  const g = c.getContext('2d'), tex = new THREE.CanvasTexture(c); tex.encoding = THREE.sRGBEncoding;
  let shown = '';
  return {
    tex,
    show(label, detail) {
      if (label + detail === shown) return; shown = label + detail;
      g.fillStyle = '#0c1613'; g.fillRect(0, 0, 256, 96);
      g.textBaseline = 'middle'; g.textAlign = 'left'; g.fillStyle = '#ff9d5c'; g.font = '700 46px "IBM Plex Mono", monospace'; g.fillText(label, 16, 50);
      g.textAlign = 'right'; g.fillStyle = '#7fd1b9'; g.font = '500 26px "IBM Plex Mono", monospace'; g.fillText(detail, 242, 52);
      tex.needsUpdate = true;
    },
  };
}
const display = screen();

// ---------- Materials ----------
const M = createMaterials({
  enamel: { color: 0xf2f0eb, metalness: 0.1, roughness: 0.32, side: THREE.DoubleSide },
  deck: { color: 0x3a4149, metalness: 0.25, roughness: 0.38 },
  glass: { color: 0x6f8799, metalness: 0.3, roughness: 0.05 },
  tub: { color: 0xd3d9e0, metalness: 0.05, roughness: 0.55, side: THREE.DoubleSide },
  basket: { look: 'steel', roughness: 0.28, side: THREE.DoubleSide, alphaMap: holeTexture(), alphaTest: 0.05 },
  sheet: { look: 'steel', roughness: 0.28, side: THREE.DoubleSide },
  white: { color: 0xeef1f4, metalness: 0.05, roughness: 0.45, side: THREE.DoubleSide },
  pulsator: { color: 0xa9b6c4, metalness: 0.15, roughness: 0.4 },
  agitator: { color: 0x56677a, metalness: 0.15, roughness: 0.42 },
  hose: { color: 0xe4e9ee, metalness: 0, roughness: 0.35 },
  drainHose: { color: 0x59616b, metalness: 0.05, roughness: 0.7 },
  motor: { color: 0x58606a, metalness: 0.6, roughness: 0.45 },
  water: { color: 0x4f8fd0, metalness: 0, roughness: 0.1, side: THREE.DoubleSide },
  brine: { color: 0x1f7fe0, metalness: 0, roughness: 0.15, side: THREE.DoubleSide },
  dark: 'dark', plastic: 'plastic', rubber: 'rubber', steel: 'steel', copper: 'copper', brass: 'brass', alu: 'aluminium', iron: 'iron',
}, { pbr: true });
const FABRIC = [0x3d5a80, 0xe9e4d8, 0xb5473a, 0xd1a23f, 0x5f8a6b, 0x8a9099, 0xd48a9a, 0x283c56, 0xc96f3b]
  .map(color => createMaterials({ f: { color, metalness: 0, roughness: 0.92 } }, { pbr: true }).f);

// ---------- Helpers ----------
const UP = new THREE.Vector3(0, 1, 0);
const vec = p => new THREE.Vector3(...p);
// A rod from a to b.
function between(a, b, radius, mat, segments = 10) {
  const A = vec(a), dir = vec(b).sub(A);
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, dir.length(), segments), mat);
  mesh.position.copy(A).addScaledVector(dir, 0.5); mesh.quaternion.setFromUnitVectors(UP, dir.normalize());
  return mesh;
}
const curve = points => new THREE.CatmullRomCurve3(points.map(vec));
const tube = (path, radius, mat, segments = 48) => new THREE.Mesh(new THREE.TubeGeometry(path, segments, radius, 10, false), mat);
// Convex hull of 2D points (monotone chain), counter-clockwise.
function hull(points) {
  points.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = list => list.reduce((out, p) => { while (out.length > 1 && cross(out.at(-2), out.at(-1), p) <= 0) out.pop(); out.push(p); return out; }, []);
  const lower = half(points), upper = half(points.slice().reverse());
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}
// A flat belt around circles [x, y, r] (drawn in the XZ plane, y = -z), thick across.
function beltShape(circles, thick) {
  const loop = grow => hull(circles.flatMap(([x, y, r]) => Array.from({ length: 64 }, (_, i) => {
    const a = i / 64 * Math.PI * 2; return [x + Math.cos(a) * (r + grow), y + Math.sin(a) * (r + grow)];
  })));
  const shape = new THREE.Shape(loop(thick / 2).map(([x, y]) => new THREE.Vector2(x, y)));
  shape.holes.push(new THREE.Path(loop(-thick / 2).reverse().map(([x, y]) => new THREE.Vector2(x, y))));
  return shape;
}
// Seeded random numbers, so the clothes land the same way on every visit.
function random(seed) {
  return () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
// A crumpled piece of cloth: a flattened, lumpy sphere.
function clothGeometry(seed) {
  const geo = new THREE.SphereGeometry(0.5, 18, 12), p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 1 + 0.16 * Math.sin(x * 7 + seed * 1.7) * Math.cos(z * 6 - seed) + 0.1 * Math.sin(y * 9 + z * 4 + seed * 3);
    p.setXYZ(i, x * k * 1.3, y * k * 0.48, z * k * 0.92);
  }
  geo.computeVertexNormals();
  return geo;
}

// ---------- Parts ----------
const CAB = { w: 5.6, d: 5.8, base: 0.25, top: 8.6, deck: 0.26, corner: 0.38 };
const DECK_Y = CAB.top + CAB.deck;
const TUB = { r: 2.6, bottom: 2.92, top: 8.3 };
const BASKET = { r: 2.45, bottom: 3.32, top: 7.74 };
const OPENING = 2.12, WATER_R = 2.57;
const MOTOR = [1.6, -1.0];       // x, z of the motor shaft
const PULLEY_Y = 1.3;            // height of the belt
const LUMP = 0.6;                // where the lump of clothes sits in the balance step (basket angle)

const root = new THREE.Group(); scene.add(root);
const hung = new THREE.Group(); root.add(hung);       // the tub and all fixed to it hang on four springs
const spinner = new THREE.Group(); hung.add(spinner); // the basket and what turns with it
const { parts, add, update } = createParts(root, { shadows: true, lively: true });

// Cabinet: painted steel walls on a plastic plinth and four feet.
{
  const g = new THREE.Group();
  const walls = roundedRect(CAB.w, CAB.d, CAB.corner);
  walls.holes.push(roundedRect(CAB.w - 0.12, CAB.d - 0.12, CAB.corner - 0.06, 0, 0, new THREE.Path()));
  g.add(extrudeUp(walls, CAB.top - CAB.base - 0.6, M.enamel, CAB.base + 0.6));
  g.add(extrudeUp(roundedRect(CAB.w - 0.04, CAB.d - 0.04, CAB.corner), 0.6, M.plastic, CAB.base));
  for (const x of [-2.35, 2.35]) for (const z of [-2.45, 2.45]) g.add(cylinder(0.22, 0.26, CAB.base, M.rubber, [x, CAB.base / 2, z], { segments: 20 }));
  g.userData.anchor = [2.2, 5.2, 2.9];
  add('cabinet', g, new THREE.Vector3(), new THREE.Vector3());
}

// Top deck with the round opening, and the console along the back with its screen and knob.
const FACE = Math.atan2(0.35, 1.2); // the console face leans back by this much
const onFace = (x, f, out = 0) => [x, DECK_Y + 1.2 - 1.2 * f + Math.sin(FACE) * out, -2.5 + 0.35 * f + Math.cos(FACE) * out];
{
  const g = new THREE.Group();
  const top = roundedRect(CAB.w, CAB.d, CAB.corner);
  top.holes.push(new THREE.Path().absarc(0, 0, OPENING, 0, Math.PI * 2, true));
  g.add(extrudeUp(top, CAB.deck, M.deck, CAB.top));
  const side = new THREE.Shape(); // drawn as (−z, y), extruded along x
  side.moveTo(2.9, DECK_Y); side.lineTo(2.9, DECK_Y + 1.15); side.lineTo(2.5, DECK_Y + 1.2); side.lineTo(2.15, DECK_Y); side.closePath();
  const geo = new THREE.ExtrudeGeometry(side, { depth: CAB.w - 0.3, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.04, bevelSegments: 2 });
  geo.rotateY(Math.PI / 2); geo.translate(-(CAB.w - 0.3) / 2, 0, 0);
  g.add(new THREE.Mesh(geo, M.deck));
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(1.25, 0.47), new THREE.MeshBasicMaterial({ map: display.tex, toneMapped: false }));
  panel.position.set(...onFace(0.55, 0.45, 0.05)); panel.rotation.x = -FACE; g.add(panel);
  const knob = cylinder(0.3, 0.33, 0.18, M.alu, onFace(-1.45, 0.5, 0.09), { segments: 40 }); knob.rotation.x = Math.PI / 2 - FACE; g.add(knob);
  for (const x of [1.6, 1.95, 2.3]) { const b = box([0.22, 0.12, 0.12], M.dark, onFace(x, 0.5, 0.05)); b.rotation.x = -FACE; g.add(b); }
  g.userData.anchor = [0.55, DECK_Y + 0.7, -2.3];
  add('deck', g, new THREE.Vector3(), new THREE.Vector3(0, 5.6, 0));
}

// Glass lid, hinged at the back of the opening.
{
  const lid = new THREE.Group();
  const frame = roundedRect(5.3, 4.85, 0.32, 0, -2.42);
  frame.holes.push(roundedRect(4.5, 4.05, 0.22, 0, -2.42, new THREE.Path()));
  lid.add(extrudeUp(frame, 0.1, M.deck, 0.02, 0.02));
  const glass = box([4.62, 0.04, 4.17], M.glass, [0, 0.08, 2.42], 0.01);
  glass.userData.glass = true; glass.userData.noGhost = true; lid.add(glass);
  lid.add(box([1.1, 0.08, 0.2], M.dark, [0, 0.15, 4.6]));
  add('lid', lid, new THREE.Vector3(0, DECK_Y, -2.12), new THREE.Vector3(0, 7, -1));
}

// Inlet valve in the console, with the tap hose behind and the hose to the detergent dispenser.
const OUTLET = [0.95, 8.42, -1.45];
{
  const g = new THREE.Group();
  const [vx, vy, vz] = [1.5, DECK_Y + 0.5, -2.6];
  g.add(box([0.62, 0.3, 0.36], M.dark, [vx, vy, vz]));
  for (const dx of [-0.16, 0.16]) {
    g.add(cylinder(0.12, 0.12, 0.26, M.copper, [vx + dx, vy + 0.28, vz], { segments: 20 }));
    g.add(cylinder(0.13, 0.13, 0.06, M.plastic, [vx + dx, vy + 0.43, vz], { segments: 20 }));
  }
  const fitting = cylinder(0.1, 0.1, 0.55, M.brass, [vx, vy, -3.0], { segments: 20 }); fitting.rotation.x = Math.PI / 2; g.add(fitting);
  g.add(tube(curve([[vx, vy, -3.25], [vx, vy + 0.15, -3.75], [vx + 0.15, vy - 0.6, -4.15], [vx + 0.25, vy - 2.2, -4.25]]), 0.11, M.hose, 40));
  g.add(tube(curve([[vx - 0.1, vy - 0.12, -2.42], [vx - 0.3, vy - 0.35, -2.1], [OUTLET[0] + 0.1, DECK_Y - 0.12, -1.85]]), 0.06, M.hose, 24));
  g.add(box([0.9, 0.28, 0.6], M.white, [OUTLET[0], DECK_Y - 0.28, -1.62]));
  g.userData.anchor = [vx, vy + 0.2, vz];
  add('inlet', g, new THREE.Vector3(), new THREE.Vector3(0, 5.6, -0.8));
}

// Water level sensor: an air chamber at the bottom of the tub, a hose, and a pressure switch.
const CHAMBER = (() => { const a = 5 * Math.PI / 4 + 0.36; return [Math.cos(a) * 2.82, Math.sin(a) * 2.82]; })();
const chamberWater = cylinder(0.12, 0.12, 1, M.water, [0, 0, 0], { segments: 16 });
{
  const g = new THREE.Group();
  const [sx, sy, sz] = [-1.6, DECK_Y + 0.45, -2.6], [cx, cz] = CHAMBER;
  g.add(cylinder(0.3, 0.3, 0.2, M.plastic, [sx, sy, sz], { segments: 28 }));
  g.add(cylinder(0.05, 0.05, 0.22, M.brass, [sx, sy - 0.2, sz], { segments: 12 }));
  g.add(cylinder(0.17, 0.17, 1.0, M.hose, [cx, 3.0, cz], { segments: 20 }));
  g.add(tube(curve([[cx * 0.84, TUB.bottom - 0.02, cz * 0.84], [cx * 0.95, 2.35, cz * 0.95], [cx, 2.5, cz]]), 0.07, M.hose, 16));
  g.add(tube(curve([[cx, 3.5, cz], [cx - 0.15, 5.4, cz - 0.15], [-2.0, 7.9, -2.55], [sx, sy - 0.3, sz]]), 0.05, M.hose, 60));
  chamberWater.position.set(cx, 0, cz); chamberWater.userData.water = true; chamberWater.userData.noGhost = true; g.add(chamberWater);
  g.userData.anchor = [sx, sy, sz];
  add('sensor', g, new THREE.Vector3(), new THREE.Vector3(-1.4, 1.2, -0.6));
}

// Outer tub: plastic, with ribs, a cover lip, and brackets for the suspension rods.
{
  const g = new THREE.Group();
  g.add(lathe([[0.62, TUB.bottom], [2.42, TUB.bottom], [2.58, TUB.bottom + 0.14], [TUB.r, TUB.bottom + 0.4], [TUB.r, TUB.top - 0.1],
    [2.63, TUB.top], [2.25, TUB.top + 0.1], [OPENING - 0.02, TUB.top + 0.1], [OPENING - 0.04, TUB.top + 0.02]], M.tub, { segments: 72 }));
  for (const y of [4.3, 6.4]) { const rib = new THREE.Mesh(new THREE.TorusGeometry(TUB.r + 0.02, 0.04, 8, 72), M.tub); rib.rotation.x = Math.PI / 2; rib.position.y = y; g.add(rib); }
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + i * Math.PI / 2, b = box([0.36, 0.26, 0.36], M.tub, [Math.cos(a) * 2.7, 3.05, Math.sin(a) * 2.7]);
    b.rotation.y = -a; g.add(b);
  }
  g.userData.anchor = [1.95, 6.6, 1.75];
  add('tub', g, new THREE.Vector3(), new THREE.Vector3(), hung);
}

// Basket: perforated stainless steel on a hub, open at the top.
{
  const g = new THREE.Group();
  g.add(cylinder(BASKET.r, BASKET.r, BASKET.top - BASKET.bottom, M.basket, [0, (BASKET.top + BASKET.bottom) / 2, 0], { segments: 96, open: true }));
  g.add(lathe([[0.5, BASKET.bottom - 0.05], [2.3, BASKET.bottom - 0.05], [BASKET.r, BASKET.bottom + 0.08]], M.sheet, { segments: 72 }));
  g.add(cylinder(0.5, 0.58, 0.24, M.alu, [0, BASKET.bottom - 0.18, 0], { segments: 32 }));
  const lip = new THREE.Mesh(new THREE.TorusGeometry(BASKET.r, 0.035, 8, 96), M.sheet); lip.rotation.x = Math.PI / 2; lip.position.y = BASKET.top; g.add(lip);
  g.userData.anchor = [1.75, 6.5, 1.7]; g.userData.anchorStatic = true;
  add('basket', g, new THREE.Vector3(), new THREE.Vector3(0, 3.8, 0), spinner);
}

// Balance ring: a hollow plastic ring on top of the basket, part filled with salt water.
// The water lies evenly at rest, and gathers opposite the lump at speed.
const brine = new THREE.Group();
{
  const g = new THREE.Group();
  g.add(lathe([[2.02, 7.78], [2.44, 7.78], [2.46, 8.1], [2.05, 8.16], [2.02, 7.78]], M.white, { segments: 72 }));
  const profile = (top, phi = Math.PI * 2) => new THREE.LatheGeometry([[2.07, 7.82], [2.4, 7.82], [2.41, top], [2.08, top], [2.07, 7.82]].map(([r, y]) => new THREE.Vector2(r, y)), 48, 0, phi);
  const even = new THREE.Mesh(profile(7.93), M.brine); even.userData.brineEven = true;
  const arc = new THREE.Mesh(profile(8.08, 2.4), M.brine); arc.userData.brineArc = true;
  for (const m of [even, arc]) { m.userData.water = true; m.userData.noGhost = true; m.userData.noShadow = true; brine.add(m); }
  g.add(brine);
  g.userData.anchor = [1.6, 8.0, 1.6]; g.userData.anchorStatic = true;
  add('ring', g, new THREE.Vector3(), new THREE.Vector3(0, 4.6, 0), spinner);
}

// Pulsator: a low finned disc on the bottom of the basket. It turns on its own in the wash.
const pulsatorTurn = new THREE.Group();
{
  const g = new THREE.Group(); g.add(pulsatorTurn);
  pulsatorTurn.add(lathe([[0, 3.68], [0.3, 3.67], [0.55, 3.6], [1.5, 3.44], [1.74, 3.38], [1.76, 3.33]], M.pulsator));
  for (let i = 0; i < 6; i++) {
    const arm = new THREE.Group(); arm.rotation.y = i / 6 * Math.PI * 2; pulsatorTurn.add(arm);
    const fin = box([1.05, 0.26, 0.1], M.pulsator, [1.0, 3.62, 0]); fin.rotation.set(0, 0.35, -0.16); arm.add(fin);
  }
  pulsatorTurn.add(cylinder(0.24, 0.3, 0.14, M.plastic, [0, 3.72, 0], { segments: 24 }));
  g.userData.anchor = [1.0, 3.62, 0.7]; g.userData.anchorStatic = true;
  add('pulsator', g, new THREE.Vector3(), new THREE.Vector3(0, 2.0, 0), spinner);
}

// Agitator: a tall finned post with an auger on top. Shown instead of the pulsator in one step.
const agitatorTurn = new THREE.Group();
{
  const g = new THREE.Group(); g.add(agitatorTurn); agitatorTurn.position.y = BASKET.bottom;
  agitatorTurn.add(lathe([[1.6, 0.02], [1.45, 0.12], [0.75, 0.45], [0.46, 0.75]], M.agitator));
  agitatorTurn.add(cylinder(0.3, 0.44, 3.2, M.agitator, [0, 2.3, 0], { segments: 32 }));
  for (let i = 0; i < 4; i++) {
    const arm = new THREE.Group(); arm.rotation.y = i / 4 * Math.PI * 2; agitatorTurn.add(arm);
    arm.add(box([0.5, 1.7, 0.08], M.agitator, [0.62, 1.4, 0]));
  }
  const auger = new THREE.Mesh(coilGeometry({ length: 1.3, turns: 2.25, radius: 0.36, wire: 0.075, segmentsPerTurn: 20 }), M.agitator);
  auger.position.y = 3.0; agitatorTurn.add(auger);
  agitatorTurn.add(cylinder(0.24, 0.3, 0.2, M.plastic, [0, 3.98, 0], { segments: 24 }));
  g.userData.anchor = [0.42, BASKET.bottom + 2.4, 0.2]; g.userData.anchorStatic = true;
  add('agitator', g, new THREE.Vector3(), new THREE.Vector3(0, 2.0, 0), spinner);
}

// Clothes: up to 18 pieces; the load control sets how many are in.
const MAX_CLOTHES = 18;
const clothes = [];
{
  const g = new THREE.Group(), rand = random(9);
  const shapes = [0, 1, 2, 3].map(clothGeometry);
  for (let i = 0; i < MAX_CLOTHES; i++) {
    const mesh = new THREE.Mesh(shapes[i % 4], FABRIC[(i * 5) % FABRIC.length]);
    const a = rand() * Math.PI * 2, r = 0.5 + Math.sqrt(rand()) * 1.35;
    const pile = new THREE.Vector3(Math.cos(a) * r, 3.95 + Math.floor(i / 6) * 0.34 + rand() * 0.1, Math.sin(a) * r);
    mesh.position.copy(pile); mesh.rotation.set(rand() * 0.6, rand() * 6.3, rand() * 0.6);
    g.add(mesh);
    clothes.push({ mesh, pile, a, u: rand(), j: rand(), s: 0.75 + rand() * 0.5, spin: (rand() - 0.5) * 3, wall: i * 2.39996, lumpy: i % 4 !== 3 });
  }
  g.userData.anchor = [1.1, 4.4, 0.9]; g.userData.anchorStatic = true;
  add('clothes', g, new THREE.Vector3(), new THREE.Vector3(0, 3.8, 0), spinner);
}

// Water in the tub: a side wall and a surface that dips into a vortex while the pulsator runs.
const waterSide = new THREE.Mesh(new THREE.CylinderGeometry(WATER_R, WATER_R, 1, 72, 1, true), M.water);
const waterTop = lathe(Array.from({ length: 13 }, (_, i) => { const r = i / 12 * WATER_R; return [r, (r / WATER_R) ** 2 - 1]; }), M.water, { segments: 72 });
{
  const g = new THREE.Group();
  for (const m of [waterSide, waterTop]) { m.userData.water = true; m.userData.noGhost = true; m.userData.noShadow = true; g.add(m); }
  g.userData.anchor = [1.4, 3.6, 1.6];
  add('water', g, new THREE.Vector3(), new THREE.Vector3(), hung);
}

// Motor under the tub, with its small pulley.
const motorPulley = new THREE.Group();
{
  const g = new THREE.Group(), [mx, mz] = MOTOR;
  g.add(cylinder(0.56, 0.56, 0.95, M.motor, [mx, 2.05, mz], { segments: 36 }));
  g.add(cylinder(0.48, 0.56, 0.14, M.alu, [mx, 2.6, mz], { segments: 36 }));
  g.add(cylinder(0.56, 0.46, 0.14, M.alu, [mx, 1.51, mz], { segments: 36 }));
  for (let i = 0; i < 14; i++) {
    const a = i / 14 * Math.PI * 2, rib = box([0.05, 0.78, 0.1], M.motor, [mx + Math.cos(a) * 0.58, 2.05, mz + Math.sin(a) * 0.58]);
    rib.rotation.y = -a; g.add(rib);
  }
  g.add(box([1.25, 0.1, 0.5], M.steel, [mx - 0.25, 2.8, mz]));
  g.add(cylinder(0.05, 0.05, 0.35, M.steel, [mx, 1.35, mz], { segments: 12 }));
  motorPulley.position.set(mx, PULLEY_Y, mz);
  motorPulley.add(lathe([[0.04, -0.1], [0.24, -0.1], [0.24, -0.06], [0.18, 0], [0.24, 0.06], [0.24, 0.1], [0.04, 0.1]], M.alu, { segments: 32 }));
  motorPulley.add(box([0.32, 0.03, 0.06], M.dark, [0, 0.11, 0]));
  g.add(motorPulley);
  g.add(cylinder(0.17, 0.17, 0.5, M.dark, [mx - 0.9, 2.45, mz - 0.5], { segments: 20 })); // run capacitor
  g.userData.anchor = [mx + 0.56, 2.1, mz + 0.1];
  add('motor', g, new THREE.Vector3(), new THREE.Vector3(1.6, 0, 0.5), hung);
}

// Belt from the motor pulley to the clutch pulley, twice its size.
{
  const belt = extrudeUp(beltShape([[0, 0, 0.9], [MOTOR[0], -MOTOR[1], 0.2]], 0.06), 0.12, M.rubber, PULLEY_Y - 0.06);
  belt.userData.anchor = [0.9, PULLEY_Y, 0.55];
  add('belt', belt, new THREE.Vector3(), new THREE.Vector3(0.8, 0, 0.25), hung);
}

// Clutch: the gear case on the tub, a brake drum and band, the spring collar, the lever, and the big pulley.
const clutchPulley = new THREE.Group(), clutchLever = new THREE.Group();
{
  const g = new THREE.Group();
  g.add(cylinder(1.0, 1.0, 0.08, M.steel, [0, TUB.bottom - 0.06, 0], { segments: 48 }));
  g.add(cylinder(0.46, 0.58, 0.64, M.alu, [0, 2.52, 0], { segments: 40 }));
  g.add(cylinder(0.72, 0.72, 0.35, M.iron, [0, 2.03, 0], { segments: 40 }));
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.035, 8, 48), M.dark); band.rotation.x = Math.PI / 2; band.position.y = 2.03; g.add(band);
  g.add(cylinder(0.3, 0.3, 0.32, M.steel, [0, 1.7, 0], { segments: 24 }));
  g.add(cylinder(0.08, 0.08, 0.5, M.steel, [0, 1.25, 0], { segments: 12 }));
  clutchPulley.position.y = PULLEY_Y;
  clutchPulley.add(lathe([[0.12, -0.09], [0.95, -0.09], [0.95, -0.05], [0.88, 0], [0.95, 0.05], [0.95, 0.09], [0.12, 0.09]], M.alu, { segments: 64 }));
  for (let i = 0; i < 4; i++) {
    const w = box([0.36, 0.02, 0.2], M.dark, [Math.cos(i * Math.PI / 2) * 0.55, 0.095, Math.sin(i * Math.PI / 2) * 0.55]);
    w.rotation.y = -i * Math.PI / 2; clutchPulley.add(w);
  }
  g.add(clutchPulley);
  clutchLever.position.set(-0.3, 1.7, 0);
  clutchLever.add(box([0.8, 0.08, 0.14], M.steel, [-0.4, 0, 0]));
  g.add(clutchLever);
  g.userData.anchor = [0.62, 2.1, 0.36];
  add('clutch', g, new THREE.Vector3(), new THREE.Vector3(0, 0, 0), hung);
}

// Drain: a valve under the tub, the hose out the back, and the drain motor whose cable
// opens the valve and shifts the clutch lever.
const DRAIN = [-1.4, -1.0];
const drainPath = curve([[DRAIN[0], 2.3, DRAIN[1]], [DRAIN[0], 1.85, DRAIN[1] - 0.45], [DRAIN[0] - 0.1, 1.15, -2.3], [DRAIN[0] - 0.1, 1.0, -2.95], [DRAIN[0] - 0.1, 0.95, -3.5], [DRAIN[0] - 0.1, 0.3, -4.2]]);
const drainArm = new THREE.Group();
{
  const g = new THREE.Group(), [dx, dz] = DRAIN, [ax, az] = [-1.0, 0.55];
  g.add(cylinder(0.32, 0.32, 0.46, M.white, [dx, 2.62, dz], { segments: 28 }));
  g.add(cylinder(0.2, 0.2, 0.22, M.white, [dx, 2.3, dz], { segments: 20 }));
  g.add(tube(drainPath, 0.14, M.drainHose, 64));
  g.add(box([0.55, 0.4, 0.42], M.plastic, [ax, 2.62, az]));
  drainArm.position.set(ax - 0.28, 2.5, az);
  drainArm.add(box([0.08, 0.06, 0.45], M.steel, [0, 0, -0.18]));
  g.add(drainArm);
  g.add(between([ax - 0.3, 2.48, az - 0.4], [dx + 0.25, 2.45, dz + 0.2], 0.022, M.steel, 6));
  g.add(between([ax - 0.3, 2.48, az - 0.4], [-1.1, 1.72, 0], 0.022, M.steel, 6));
  g.userData.anchor = [dx + 0.32, 2.6, dz];
  add('drain', g, new THREE.Vector3(), new THREE.Vector3(-1.2, 0, 0.5), hung);
}

// Suspension: four rods hang the tub from the top corners. A spring and a damper cup sit under each tub bracket.
const springs = [];
{
  const g = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + i * Math.PI / 2, sx = Math.sign(Math.cos(a)), sz = Math.sign(Math.sin(a));
    const top = [sx * 2.4, CAB.top - 0.14, sz * 2.5], bottom = [Math.cos(a) * 2.7, 2.2, Math.sin(a) * 2.7];
    g.add(between(top, bottom, 0.035, M.steel));
    const seat = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 12), M.plastic); seat.position.set(...top); g.add(seat);
    g.add(box([0.5, 0.12, 0.5], M.enamel, [sx * 2.5, CAB.top - 0.1, sz * 2.6]));
    const dir = vec(top).sub(vec(bottom)).normalize();
    const spring = new THREE.Mesh(coilGeometry({ length: 0.62, turns: 6, radius: 0.12, wire: 0.025, segmentsPerTurn: 16 }), M.steel);
    spring.quaternion.setFromUnitVectors(UP, dir); spring.position.copy(vec(bottom)).addScaledVector(dir, 0.46);
    g.add(spring); springs.push({ spring, a, base: spring.position.clone(), dir });
    const cup = cylinder(0.14, 0.12, 0.24, M.plastic, [0, 0, 0], { segments: 16 });
    cup.quaternion.copy(spring.quaternion); cup.position.copy(vec(bottom)).addScaledVector(dir, 0.08); g.add(cup);
  }
  g.userData.anchor = [2.12, 5.4, 2.18];
  add('springs', g, new THREE.Vector3(), new THREE.Vector3());
}

// ---------- Particles ----------
const dot = softDot();
// The clouds move far from where they start, so skip three.js's bounding-sphere culling.
// Colours are sRGB; the PBR stage works in linear light, so convert them as the materials do.
const cloud = (parent, count, { color, ...options }) => {
  const c = createParticles(parent, count, { color: new THREE.Color(color).convertSRGBToLinear(), ...options });
  c.points.frustumCulled = false; return c;
};
// Tap water falling from the dispenser.
const stream = cloud(root, 90, { color: 0x3f86d8, size: 0.55, map: dot, seed: () => ({ t: Math.random(), a: Math.random() * Math.PI * 2, r: Math.random() * 0.12 }) });
// The roll-over flow during the wash: down the middle, out along the bottom, up the wall.
const flow = cloud(hung, 240, { color: 0x2a6db8, size: 0.38, map: dot, seed: () => ({ a: Math.random() * Math.PI * 2, u: Math.random(), j: Math.random(), s: 0.7 + Math.random() * 0.6 }) });
// Spin: water thrown through the holes, onto the tub wall, and down.
const spray = cloud(hung, 200, { color: 0x3f86d8, size: 0.36, map: dot, seed: () => ({ a: Math.random() * Math.PI * 2, y: 3.6 + Math.random() * 3.9, t: Math.random(), s: 0.7 + Math.random() * 0.6 }) });
// Water running out through the drain hose.
const drainFlow = cloud(hung, 90, { color: 0x3f86d8, size: 0.42, map: dot, seed: () => ({ t: Math.random(), j: Math.random() }) });

// The roll-over loop, as an ellipse in (radius, height) inside the basket. u runs 0..1 around it.
function rollPoint(u, j, inner, top, out) {
  const rIn = inner, rOut = 2.1, yB = 3.9, yT = Math.max(yB + 0.5, top);
  const rc = (rIn + rOut) / 2, yc = (yB + yT) / 2, k = 0.55 + 0.45 * j, th = u * Math.PI * 2;
  out.r = rc - (rOut - rIn) / 2 * k * Math.cos(th); out.y = yc - (yT - yB) / 2 * k * Math.sin(th);
  return out;
}

// ---------- State and UI ----------
const state = { step: 0, explode: 0, targetExplode: 0, playing: true, focus: [], cut: false, xray: [], mode: 'fill', plate: 0, plateShown: 0, kg: 5 };
const cycle = createCycle();
const START = {
  empty: () => ({ level: 0 }),
  half: target => ({ level: target * 0.55 }),
  full: target => ({ level: target }),
  spin: () => ({ level: 0, basket: 240, wet: 0.2 }),
};
let camGoal = null;
const story = createStoryUI({
  story: WASHER_STORY, state,
  onStep: s => {
    state.focus = s.focus; state.cut = s.cut; state.xray = s.xray; state.mode = s.mode; state.plate = s.plate;
    Object.assign(cycle, createCycle(START[s.start](levelFor(state.kg))));
    const v = VIEWS[s.view]; camGoal = { ...v, target: new THREE.Vector3(...v.target) };
    cam.theta = v.theta + THREE.MathUtils.euclideanModulo(cam.theta - v.theta + Math.PI, 2 * Math.PI) - Math.PI; // take the short way round
  },
});
bindRange('load', v => { state.kg = v; document.getElementById('load-out').textContent = `${v} kg`; });
createCallouts(stage, { parts, state, story: WASHER_STORY });

// Water and clothes are the contents, not parts to look past: they stay as they are.
const focusStyle = {
  highlight: 0.16,
  opacity(name, mesh, hot) {
    let alpha = 1;
    if (state.cut && state.xray.includes(name)) alpha = hot ? 0.32 : 0.1;
    else if (state.focus.length && !hot && looksInside(state) && name !== 'clothes') alpha = 0.3;
    if (name === 'clothes' && !hot && state.xray.includes(name)) alpha = 0.3;
    if (mesh.userData.water) alpha = hot ? 0.55 : 0.38;
    if (mesh.userData.glass) alpha *= 0.4;
    if (mesh.userData.brineEven) alpha *= 1 - cycle.balance;
    if (mesh.userData.brineArc) alpha *= cycle.balance;
    if (name === 'pulsator') alpha *= 1 - state.plateShown;
    if (name === 'agitator') alpha *= state.plateShown;
    return alpha;
  },
};

const readout = { box: document.getElementById('readout'), water: document.getElementById('r-water'), sensor: document.getElementById('r-sensor'), drive: document.getElementById('r-drive') };
let readoutTimer = 0;
function phase() {
  if (cycle.valve) return 'fill';
  if (cycle.spin) return cycle.level > 0.002 ? 'drain' : 'spin';
  return state.mode === 'wash' ? 'wash' : 'soak';
}
function showReadout() {
  const p = phase();
  readout.water.textContent = `${Math.round(litres(cycle.level))} L · ${Math.round(cycle.level * 100)} cm`;
  readout.sensor.textContent = `${sensorKPa(cycle.level).toFixed(2)} kPa`;
  readout.drive.textContent = {
    fill: 'Valve open', soak: 'Stopped', drain: 'Draining',
    wash: `Wash · ${washRpm()} rpm`, spin: `Spin · ${Math.round(cycle.basket)} rpm`,
  }[p];
  readout.box.classList.toggle('spin', p === 'spin' && cycle.basket > spinRpm() * 0.9);
  display.show(p.toUpperCase(), p === 'spin' ? `${Math.round(cycle.basket)}` : `${state.kg} KG`);
}

// ---------- Sound ----------
// Tap water hisses into the tub, the pulsator swishes with a soft knock as it reverses,
// the drain gurgles, and the spin winds up to a whine.
const fillNoise = sound.loop({ type: 'noise', filter: 'bandpass', freq: 1400, q: 0.9 });
const swish = sound.loop({ type: 'noise', filter: 'lowpass', freq: 420, q: 0.8 });
const hum = sound.loop({ type: 'tone', wave: 'triangle', freq: 100 });
const gurgle = sound.loop({ type: 'noise', filter: 'lowpass', freq: 260, q: 3 });
const whine = sound.loop({ type: 'tone', wave: 'triangle', freq: 120 });
const rush = sound.loop({ type: 'noise', filter: 'bandpass', freq: 900, q: 0.7 });
const was = { valve: false, stroke: false, drain: false };
function playSounds(now, wobble) {
  const on = state.playing ? 1 : 0, drive = Math.abs(cycle.pulsator) / washRpm(), run = cycle.basket / spinRpm();
  const stroke = !cycle.spin && drive > 0.05;
  fillNoise.set(cycle.valve ? 0.07 * on : 0, 1700 - cycle.level * 2500);
  swish.set(stroke ? 0.12 * drive * on : 0, 300 + 250 * drive);
  hum.set((stroke ? 0.03 * drive : 0.035 * Math.min(1, run * 3)) * on);
  gurgle.set(cycle.drain && cycle.level > 0.002 ? 0.12 * on : 0, 220 + Math.sin(now / 90) * 60);
  whine.set(0.02 * run * on, 90 + 420 * run);
  rush.set(0.1 * run * (0.3 + cycle.wet) * on + wobble * 0.4 * on, 500 + 900 * run);
  if (cycle.valve !== was.valve) sound.click(0.25); // the valve's plunger
  if (stroke && !was.stroke) sound.thunk(0.08);     // the pulsator takes up the slack as it reverses
  if (cycle.drain && !was.drain) { sound.thunk(0.3); sound.click(0.2); } // drain motor pulls the cable
  was.valve = cycle.valve; was.stroke = stroke; was.drain = cycle.drain;
}

// ---------- Frame ----------
const visual = rpm => Math.sign(rpm) * 16 * (Math.abs(rpm) / spinRpm()) ** 0.6; // rad/s on screen: fast spins slowed so they read
const tmp = new THREE.Vector3(), roll = { r: 0, y: 0 }, look = new THREE.Quaternion(), radial = new THREE.Vector3();
let basketAngle = 0, vortex = 0, wobbleShown = 0;
startLoop(stage, (dt, now) => {
  update(state, focusStyle, reduced ? 1 : 0.09, dt);
  if (camGoal) { // ease to the step's view once; after that the reader's own orbit and zoom win
    const k = reduced ? 1 : Math.min(1, dt * 2.5);
    for (const a of ['r', 'theta', 'phi']) cam[a] += (camGoal[a] - cam[a]) * k;
    cam.target.lerp(camGoal.target, k);
    if (Math.abs(camGoal.r - cam.r) < 0.05 && Math.abs(camGoal.theta - cam.theta) < 0.005 && cam.target.distanceTo(camGoal.target) < 0.02) camGoal = null;
  }
  const target = levelFor(state.kg), playing = state.playing ? 1 : 0;
  if (state.playing) stepCycle(cycle, dt, state.mode, target);
  state.plateShown += (state.plate - state.plateShown) * (reduced ? 1 : Math.min(1, dt * 3));
  parts.pulsator.group.visible = state.plateShown < 0.98;
  parts.agitator.group.visible = state.plateShown > 0.02;
  agitatorTurn.scale.set(1, 0.15 + 0.85 * state.plateShown, 1);

  // Basket, pulsator and agitator. In wash only the pulsator (or agitator) turns; in spin they all turn together.
  const spinW = visual(cycle.basket) * playing, washW = cycle.spin ? 0 : visual(cycle.pulsator) * playing;
  basketAngle += spinW * dt; spinner.rotation.y = basketAngle;
  pulsatorTurn.rotation.y += washW * dt; agitatorTurn.rotation.y += washW * dt * 0.6;
  // Drive: the clutch pulley turns at the basket speed in spin and ten times the pulsator speed in wash.
  const pulleyW = cycle.spin ? spinW : washW * 2.2;
  clutchPulley.rotation.y += pulleyW * dt; motorPulley.rotation.y += pulleyW * 2 * dt;
  const shifted = cycle.spin ? 1 : 0;
  clutchLever.rotation.y += (shifted * 0.4 - clutchLever.rotation.y) * Math.min(1, dt * 8);
  drainArm.rotation.y += (shifted * 0.5 - drainArm.rotation.y) * Math.min(1, dt * 8);

  // Wobble: in the balance step a lump on one side swings the hanging tub until the ring's liquid evens it out.
  const run = cycle.basket / spinRpm();
  const wobble = state.mode === 'balance' ? 0.16 * (1 - cycle.balance) * Math.min(1, run * 2.5) : 0.012 * run;
  wobbleShown += (wobble - wobbleShown) * Math.min(1, dt * 4);
  const swing = LUMP - basketAngle;
  hung.position.set(Math.cos(swing) * wobbleShown, 0, Math.sin(swing) * wobbleShown);
  hung.rotation.set(Math.sin(swing) * wobbleShown * 0.05, 0, -Math.cos(swing) * wobbleShown * 0.05);
  springs.forEach(s => {
    const squeeze = 1 + Math.cos(swing - s.a) * wobbleShown * 1.6;
    s.spring.scale.y = squeeze; s.spring.position.copy(s.base).addScaledVector(s.dir, (squeeze - 1) * -0.3);
  });
  brine.rotation.y = 1.5 * Math.PI - LUMP - 1.2; // the arc's middle sits opposite the lump

  // Water: the level from the cycle, and a vortex while the pulsator runs.
  const depth = cycle.level * 10, bottom = TUB.bottom + 0.02, surface = bottom + depth;
  parts.water.group.visible = depth > 0.01;
  waterSide.scale.y = Math.max(0.001, depth); waterSide.position.y = bottom + depth / 2;
  vortex += ((cycle.spin ? 0 : Math.abs(cycle.pulsator) / washRpm() * 0.22) - vortex) * Math.min(1, dt * 3);
  waterTop.scale.y = Math.max(0.01, Math.min(vortex, depth * 0.5)); waterTop.position.y = surface;
  chamberWater.scale.y = 0.08 + sensorKPa(cycle.level) / 101.3 * 6; chamberWater.position.y = 2.5 + chamberWater.scale.y / 2;

  // Clothes: a heap at rest, rolling over in the wash, pressed to the wall in the spin.
  const count = Math.max(3, Math.min(MAX_CLOTHES, Math.round(state.kg * 2.6)));
  const wallMode = cycle.spin && (cycle.basket > 40 || cycle.level < 0.01);
  const washing = !cycle.spin && Math.abs(cycle.pulsator) > 0;
  const inner = state.plateShown > 0.5 ? 0.85 : 0.45, k = 1 - Math.exp(-dt * (wallMode ? 5 : 3.5));
  clothes.forEach((c, i) => {
    c.mesh.visible = i < count;
    if (!c.mesh.visible) return;
    if (wallMode) {
      const a = state.mode === 'balance' && c.lumpy ? LUMP + Math.sin(c.wall) * 0.55 : c.wall;
      const y = 3.95 + (i % 6) / 5 * (state.mode === 'balance' ? 1.6 : 2.9) + Math.floor(i / 6) * 0.12;
      tmp.set(Math.cos(a) * 2.12, y, Math.sin(a) * 2.12);
      radial.set(-Math.cos(a), 0, -Math.sin(a)); look.setFromUnitVectors(UP, radial);
      c.mesh.quaternion.slerp(look, k);
    } else if (state.mode === 'wash' && depth > 0.3) {
      if (washing) {
        const drive = cycle.pulsator / washRpm();
        c.u = (c.u + dt * Math.abs(drive) * c.s * 0.32 * playing) % 1;
        c.a += dt * drive * 1.1 * c.s * playing;
        c.mesh.rotation.x += dt * c.spin * Math.abs(drive) * playing; c.mesh.rotation.z += dt * c.spin * 0.6 * Math.abs(drive) * playing;
      }
      rollPoint(c.u, c.j, inner, surface - 0.35, roll);
      tmp.set(Math.cos(c.a) * roll.r, roll.y, Math.sin(c.a) * roll.r);
    } else {
      tmp.copy(c.pile); tmp.y += Math.min(depth * 0.35, 0.9);
    }
    c.mesh.position.lerp(tmp, k);
  });

  // Particles.
  const inside = state.cut ? 1 : 0;
  if (stream.fade(cycle.valve && !reduced ? 0.8 : 0, Math.min(1, dt * 8))) {
    stream.seeds.forEach((p, i) => {
      p.t = (p.t + dt * 1.6 * playing) % 1;
      stream.place(i, OUTLET[0] + Math.cos(p.a) * p.r, OUTLET[1] - p.t * p.t * (OUTLET[1] - surface), OUTLET[2] + Math.sin(p.a) * p.r);
    });
    stream.commit();
  }
  if (flow.fade(state.mode === 'wash' && !cycle.valve && inside && depth > 0.3 && !reduced ? 0.8 : 0, Math.min(1, dt * 3))) {
    const drive = cycle.pulsator / washRpm();
    flow.seeds.forEach((p, i) => {
      p.u = (p.u + dt * Math.abs(drive) * p.s * 0.45 * playing) % 1;
      p.a += dt * drive * 1.6 * p.s * playing;
      rollPoint(p.u, p.j, inner, surface - 0.1, roll);
      flow.place(i, Math.cos(p.a) * roll.r, roll.y, Math.sin(p.a) * roll.r);
    });
    flow.commit();
  }
  if (spray.fade(cycle.spin && run > 0.15 && !reduced ? Math.min(0.85, cycle.wet * 3) * inside : 0, Math.min(1, dt * 4))) {
    spray.seeds.forEach((p, i) => {
      p.t += dt * p.s * 1.4 * playing;
      if (p.t >= 1) { p.t -= 1; p.a = Math.random() * Math.PI * 2; p.y = 3.6 + Math.random() * 3.9; }
      // Out through the holes along the turn, then down the tub wall.
      const out = Math.min(1, p.t / 0.2), a = p.a - out * 0.5;
      const r = BASKET.r + (TUB.r - 0.04 - BASKET.r) * out, y = p.t < 0.2 ? p.y : p.y - (p.t - 0.2) / 0.8 * (p.y - TUB.bottom - 0.1);
      spray.place(i, Math.cos(a) * r, y, Math.sin(a) * r);
    });
    spray.commit();
  }
  const draining = cycle.drain && (cycle.level > 0.002 || cycle.wet > 0.05);
  if (drainFlow.fade(draining && !reduced ? 0.8 * inside : 0, Math.min(1, dt * 4))) {
    drainFlow.seeds.forEach((p, i) => {
      p.t = (p.t + dt * 0.5 * playing) % 1;
      drainPath.getPointAt(p.t, tmp);
      drainFlow.place(i, tmp.x + (p.j - 0.5) * 0.12, tmp.y + 0.02, tmp.z);
    });
    drainFlow.commit();
  }

  playSounds(now, wobbleShown);

  readoutTimer -= dt;
  if (readoutTimer <= 0) { showReadout(); readoutTimer = 0.12; }
});
story.setStep(0, false);
