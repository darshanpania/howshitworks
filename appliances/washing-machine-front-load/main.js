import * as THREE from 'three';
import { createStage, addFloor, addStudioLights } from '../../src/engine/stage.js';
import { createParts, looksInside } from '../../src/engine/parts.js';
import { createCallouts } from '../../src/engine/callouts.js';
import { createStoryUI, bindRange, showRange } from '../../src/engine/story-ui.js';
import { sound } from '../../src/engine/sound.js';
import { startLoop, reducedMotion as reduced } from '../../src/engine/loop.js';
import { box, cylinder, lathe, roundedRect, springGeometry } from '../../src/kit/shapes.js';
import { createMaterials } from '../../src/kit/materials.js';
import { softDot, speckleTexture, heatColor, createParticles } from '../../src/kit/effects.js';
import { WASHER_STORY } from './story.js';
import { WASHER, SHAKE_COAST, createSim, stepWasher, createGarment, stepGarment, gForce, levelFromLitres, swayMm, omega, motorRpm } from './washer.js';

// ---------- Stage and light ----------
// Scale: 1 unit = 10 cm. The drum turns about the z axis, which runs from the back (-z) to
// the door (+z) through the origin. The cabinet is 60 cm wide, 85 cm tall and 58 cm deep.
const VIEWS = {
  front: { r: 24, theta: 0.55, phi: 1.3, target: [0, 0.2, 0] },
  door: { r: 17, theta: 0.5, phi: 1.36, target: [0.5, 0.6, 1.8] },
  top: { r: 17, theta: -0.75, phi: 0.98, target: [-1.6, 2.3, -0.3] },
  low: { r: 19, theta: 0.95, phi: 1.36, target: [-0.5, -1.2, 1.0] },
  back: { r: 19, theta: 2.55, phi: 1.38, target: [0.3, -0.8, -2.0] },
  inside: { r: 16, theta: 0.14, phi: 1.42, target: [0, 0.3, 1] },
  side: { r: 22, theta: 0.95, phi: 1.36, target: [0, -0.2, 0] },
};
const stage = createStage(document.getElementById('c'), {
  fov: 36, pbr: true, camera: VIEWS.front, zoom: [8, 32], phiLimit: 0.25,
});
const { scene, cam } = stage;
addStudioLights(stage, { key: [7, 13, 9], extent: 8, far: 40 });
const FLOOR_Y = -4.8;
addFloor(stage, FLOOR_Y, { size: 24, opacity: 0.14, height: 10, blur: 3.5, shadowSize: 14 });

// ---------- Materials ----------
// The drum is stainless steel punched with small holes, drawn as a texture.
function holeTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, 256, 128); g.fillStyle = '#3b4148';
  for (let row = 0; row < 8; row++) for (let col = 0; col < 16; col++) {
    g.beginPath(); g.arc(col * 16 + (row % 2) * 8 + 4, row * 16 + 8, 3, 0, Math.PI * 2); g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(4, 3); t.anisotropy = 4; t.encoding = THREE.sRGBEncoding;
  return t;
}
const M = createMaterials({
  cabinet: { color: 0xf3f3f0, metalness: 0.1, roughness: 0.32 },
  panel: { look: 'brushed', color: 0xc9ced4 },
  trim: { look: 'aluminium', color: 0xd9dde2 },
  chrome: 'steel', plastic: 'plastic', dark: 'dark', rubber: 'rubber', iron: 'iron', alu: 'aluminium', copper: 'copper',
  tub: { color: 0xb6bcc4, metalness: 0.05, roughness: 0.55, side: THREE.DoubleSide },
  drum: { color: 0xe2e6ea, metalness: 0.8, roughness: 0.32, map: holeTexture(), side: THREE.DoubleSide },
  lifter: { look: 'brushed', color: 0xd4d9de },
  glass: { color: 0x9cc6dc, metalness: 0.1, roughness: 0.05, side: THREE.DoubleSide },
  gasket: { color: 0x3a3f45, roughness: 0.85, side: THREE.DoubleSide },
  water: { color: 0x4f8fd0, metalness: 0, roughness: 0.1 },
  concrete: { color: 0xa19c92, roughness: 0.95 },
  spring: { color: 0xc6ccd2, metalness: 0.9, roughness: 0.25 },
  heater: { color: 0x9aa1a8, metalness: 0.8, roughness: 0.35 },
  hose: { color: 0x4a5058, roughness: 0.7 },
  inlet: { color: 0x7d93a8, roughness: 0.6 },
  belt: { color: 0x23272c, roughness: 0.8 },
  drawer: { color: 0xeeeeea, roughness: 0.4 },
  hopper: { color: 0xcfd3d8, roughness: 0.5 },
  powder: { color: 0x8fc4e8, roughness: 0.95 },
}, { pbr: true });

// ---------- Helpers ----------
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const alongZ = mesh => { mesh.rotation.x = Math.PI / 2; return mesh; };
// Points about step apart along a profile, so a texture is not stretched on long segments.
function resample(profile, step) {
  const out = [profile[0]];
  for (let i = 1; i < profile.length; i++) {
    const [r0, z0] = profile[i - 1], [r1, z1] = profile[i];
    const n = Math.max(1, Math.round(Math.hypot(r1 - r0, z1 - z0) / step));
    for (let k = 1; k <= n; k++) out.push([r0 + (r1 - r0) * k / n, z0 + (z1 - z0) * k / n]);
  }
  return out;
}
// Spin a [radius, z] profile around the drum axis.
const ringZ = (profile, mat, { segments = 64, step = 0 } = {}) => alongZ(lathe(step ? resample(profile, step) : profile, mat, { segments }));
const tube = (points, radius, mat, segments = 64) =>
  new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p => V(...p))), segments, radius, 10, false), mat);
const curve = points => new THREE.CatmullRomCurve3(points.map(p => V(...p)));
const circle = (cx, cy, r, n) => Array.from({ length: n }, (_, i) => [cx + r * Math.cos(i / n * Math.PI * 2), cy + r * Math.sin(i / n * Math.PI * 2)]);
// Convex hull (counter-clockwise) of [x, y] points: the outline of a belt around two pulleys.
function hull(points) {
  const p = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = list => list.reduce((h, q) => { while (h.length >= 2 && cross(h.at(-2), h.at(-1), q) <= 0) h.pop(); h.push(q); return h; }, []);
  const lower = half(p), upper = half(p.slice().reverse());
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}
const noShadow = group => { group.traverse(o => { if (o.isMesh) o.userData.noShadow = true; }); return group; };
const cutaway = group => { group.traverse(o => { if (o.isMesh) o.userData.cutaway = true; }); return group; };

// ---------- Layout ----------
const CAB = { w: 6, d: 5.8, bottom: -4.65, top: 3.85, strip: 2.85 }; // the control strip runs from 2.85 to the top
const TUB = { r: 2.7, back: -2, front: 2 };
const DRUM = { r: 2.35, back: -1.6, front: 1.6 };
const DOOR = { r: 2.2, z: 2.95 };
const PULLEY = { r: 1.44, z: -2.45 };           // 288 mm drum pulley
const MOTOR = { x: 0.6, y: -3.35, pulley: 0.12 }; // 24 mm motor pulley: 12 times smaller
const SPRING_X = 1.55, SPRING_Z = 0.3, SPRING_TOP = 3.64;
const SPRING_BOTTOM = Math.sqrt(TUB.r ** 2 - SPRING_X ** 2);
const DAMPER_X = 1.25, DAMPER_Z = 0.8, DAMPER_TOP = -Math.sqrt(TUB.r ** 2 - DAMPER_X ** 2) - 0.06;
const HEAT_Y = -2.48;

// ---------- Parts ----------
const root = new THREE.Group(); scene.add(root);
const suspended = new THREE.Group(); root.add(suspended); // the tub and everything bolted to it, hung on springs
const spinner = new THREE.Group(); suspended.add(spinner); // drum, lifters and drum pulley turn together
const { parts, add, update } = createParts(root, { shadows: true, lively: true });

// Cabinet: white steel panels, a round opening for the door, and the control strip on top.
let lcdTexture;
{
  const g = new THREE.Group();
  const h = CAB.strip - CAB.bottom;
  const front = roundedRect(CAB.w, h, 0.1, 0, CAB.bottom + h / 2);
  front.holes.push(new THREE.Path().absarc(0, 0, 1.95, 0, Math.PI * 2, true));
  const frontMesh = new THREE.Mesh(new THREE.ExtrudeGeometry(front, { depth: 0.06, bevelEnabled: false, curveSegments: 48 }), M.cabinet);
  frontMesh.position.z = CAB.d / 2 - 0.06; g.add(frontMesh);
  g.add(box([CAB.w, 0.06, CAB.d], M.cabinet, [0, CAB.top - 0.03, 0], 0.02));
  [-1, 1].forEach(s => g.add(box([0.06, CAB.top - CAB.bottom, CAB.d], M.cabinet, [s * (CAB.w / 2 - 0.03), (CAB.top + CAB.bottom) / 2, 0], 0.02)));
  g.add(box([CAB.w - 0.12, CAB.top - CAB.bottom, 0.06], M.cabinet, [0, (CAB.top + CAB.bottom) / 2, -CAB.d / 2 + 0.03], 0.02));
  g.add(box([CAB.w, 0.12, CAB.d], M.dark, [0, CAB.bottom + 0.06, 0], 0.03));
  [[-2.6, -2.4], [2.6, -2.4], [-2.6, 2.4], [2.6, 2.4]].forEach(([x, z]) => g.add(cylinder(0.2, 0.22, 0.15, M.dark, [x, FLOOR_Y + 0.075, z], { segments: 20 })));
  // Control strip: a display, the program dial and two buttons. The drawer fills its left end.
  g.add(box([4.1, CAB.top - CAB.strip, 0.1], M.panel, [0.95, (CAB.top + CAB.strip) / 2, CAB.d / 2 - 0.04], 0.03));
  const lcd = document.createElement('canvas'); lcd.width = 256; lcd.height = 64;
  lcdTexture = new THREE.CanvasTexture(lcd); lcdTexture.encoding = THREE.sRGBEncoding; lcdTexture.userData = { canvas: lcd, text: '' };
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.375), new THREE.MeshBasicMaterial({ map: lcdTexture, toneMapped: false }));
  screen.position.set(0.15, 3.35, CAB.d / 2 + 0.015); g.add(screen);
  const dial = alongZ(cylinder(0.38, 0.42, 0.18, M.trim, [1.95, 3.35, CAB.d / 2 + 0.09], { segments: 40 })); g.add(dial);
  g.add(box([0.06, 0.26, 0.04], M.dark, [1.95, 3.5, CAB.d / 2 + 0.19]));
  [3.18, 3.52].forEach(y => g.add(alongZ(cylinder(0.1, 0.1, 0.08, M.trim, [1.1, y, CAB.d / 2 + 0.04], { segments: 20 }))));
  // The flap at the bottom right hides the pump filter.
  g.add(box([1.0, 0.55, 0.05], M.panel, [2.05, -4.15, CAB.d / 2 + 0.01], 0.02));
  add('cabinet', noShadow(cutaway(g)), V(0, 0, 0), V(0, 0, 0));
}

// Door: a chrome ring with a glass bowl, hinged on the left. The pivot sits on the hinge.
const doorPivot = new THREE.Group();
{
  const door = new THREE.Group(); door.position.x = DOOR.r; doorPivot.add(door);
  door.add(ringZ([[1.5, -0.05], [1.62, 0.22], [1.85, 0.34], [2.12, 0.3], [2.22, 0.16], [2.2, 0], [2.05, -0.06]], M.trim));
  const glass = ringZ([[0.01, -0.62], [0.7, -0.6], [1.25, -0.45], [1.55, -0.1], [1.6, 0.18], [1.5, 0.24]], M.glass);
  glass.userData.glass = true; glass.userData.noGhost = true; glass.userData.noShadow = true; door.add(glass);
  door.add(box([0.2, 0.9, 0.22], M.trim, [2.05, 0, 0.34]));     // handle
  door.add(box([0.12, 0.3, 0.42], M.chrome, [2.12, 0, -0.2])); // hook that the lock bolts through
  [-0.9, 0.9].forEach(y => door.add(box([0.3, 0.42, 0.2], M.trim, [-DOOR.r + 0.05, y, 0]))); // hinges
  doorPivot.userData.anchor = [3.7, 1.25, 0.32];
  add('door', doorPivot, V(-DOOR.r, 0, DOOR.z), V(0, 0, 4.5));
}

// Door lock: a bolt slides across the door's hook while the machine runs.
let lockBolt;
{
  const g = new THREE.Group();
  g.add(box([0.42, 0.75, 0.45], M.plastic, [2.38, 0, 2.55]));
  lockBolt = box([0.3, 0.1, 0.12], M.copper, [2.4, 0.05, 2.62]); g.add(lockBolt);
  add('lock', g, V(0, 0, 0), V(1.2, 0, 1.6));
}

// Bellows seal: a folded rubber sleeve from the mouth of the tub to the cabinet opening.
{
  const g = new THREE.Group();
  g.add(ringZ([[2.02, 2.0], [2.16, 2.1], [2.26, 2.28], [2.16, 2.45], [2.0, 2.55], [1.92, 2.7], [1.93, 2.86], [2.02, 2.92]], M.gasket));
  g.userData.anchor = [-1.45, -1.45, 2.5];
  add('gasket', g, V(0, 0, 0), V(0, 0, 3));
}

// Detergent drawer: a tray with three compartments; the main one holds powder.
let powder;
{
  const g = new THREE.Group();
  g.add(box([1.78, 0.8, 0.1], M.drawer, [-2.04, 3.35, CAB.d / 2 - 0.02], 0.03));
  g.add(box([0.8, 0.1, 0.04], M.dark, [-2.04, 3.1, CAB.d / 2 + 0.04], 0.02));
  g.add(box([1.55, 0.05, 1.65], M.drawer, [-2.0, 3.0, 2.0], 0.02));
  [-2.76, -1.24].forEach(x => g.add(box([0.05, 0.5, 1.65], M.drawer, [x, 3.23, 2.0], 0.02)));
  g.add(box([1.55, 0.5, 0.05], M.drawer, [-2.0, 3.23, 1.18], 0.02));
  [-2.2, -1.72].forEach(x => g.add(box([0.04, 0.42, 1.6], M.drawer, [x, 3.22, 2.0], 0.015)));
  powder = box([0.5, 0.26, 1.1], M.powder, [-2.47, 3.16, 2.05], 0.08); g.add(powder);
  add('drawer', g, V(0, 0, 0), V(0, 0.2, 2.6));
}

// Inlet valve at the back, the hose to the drawer housing, and the hose from there to the tub.
{
  const g = new THREE.Group();
  g.add(box([0.5, 0.36, 0.42], M.plastic, [-1.9, 3.3, -2.5]));
  [-2.02, -1.78].forEach(x => g.add(cylinder(0.12, 0.12, 0.24, M.copper, [x, 3.6, -2.5], { segments: 20 })));
  g.add(alongZ(cylinder(0.11, 0.11, 0.5, M.trim, [-1.9, 3.3, -2.85], { segments: 20 })));
  g.add(tube([[-1.9, 3.3, -3.1], [-1.9, 3.2, -3.4], [-1.9, 2.4, -3.55], [-1.9, 1.2, -3.6]], 0.1, M.inlet, 32)); // from the tap
  g.add(tube([[-1.9, 3.32, -2.28], [-2.05, 3.5, -1.2], [-2.05, 3.5, 0.4], [-2.0, 3.42, 1.05]], 0.07, M.hose));
  // The drawer housing: a tray with a funnel at the back that drains into the tub.
  g.add(box([1.75, 0.05, 1.85], M.hopper, [-2.0, 2.92, 1.95], 0.02));
  g.add(box([1.75, 0.82, 0.05], M.hopper, [-2.0, 3.31, 1.02], 0.02));
  [-2.9, -1.1].forEach(x => g.add(box([0.05, 0.82, 1.85], M.hopper, [x, 3.31, 1.95], 0.02)));
  g.add(tube([[-1.9, 2.92, 1.4], [-1.72, 2.62, 1.55], [-1.45, 2.3, 1.75]], 0.1, M.hose, 24));
  g.userData.anchor = [-1.9, 3.35, -2.5];
  add('valve', g, V(0, 0, 0), V(-0.6, 1.4, -1.2));
}

// Tub: the plastic drum that holds the water. It does not turn.
{
  const g = new THREE.Group();
  g.add(ringZ([[0.32, TUB.back], [2.5, TUB.back], [TUB.r, TUB.back + 0.2], [TUB.r, TUB.front - 0.15], [2.62, TUB.front], [2.05, TUB.front + 0.02]], M.tub));
  for (let i = 0; i < 6; i++) { // ribs moulded on the back
    const rib = box([0.12, 1.9, 0.16], M.tub, [0, 0, 0]); const a = i / 6 * Math.PI * 2;
    rib.position.set(Math.sin(a) * 1.4, Math.cos(a) * 1.4, TUB.back - 0.08); rib.rotation.z = -a; g.add(rib);
  }
  g.add(alongZ(cylinder(0.5, 0.5, 0.3, M.tub, [0, 0, TUB.back - 0.15], { segments: 32 }))); // bearing housing
  [-1, 1].forEach(s => g.add(box([0.3, 0.14, 0.3], M.tub, [s * SPRING_X, SPRING_BOTTOM - 0.02, SPRING_Z], 0.04))); // spring lugs
  g.userData.anchor = [-1.9, 1.9, 1.2];
  add('tub', noShadow(cutaway(g)), V(0, 0, 0), V(0, 0, 0), suspended);
}

// Drum: a stainless shell, punched with holes, on a three-arm spider and a shaft.
{
  const g = new THREE.Group();
  g.add(ringZ([[0.25, DRUM.back], [2.25, DRUM.back], [DRUM.r, DRUM.back + 0.1], [DRUM.r, DRUM.front - 0.15], [2.25, DRUM.front], [1.85, DRUM.front + 0.05], [1.8, DRUM.front]], M.drum, { step: 0.2, segments: 72 }));
  for (let i = 0; i < 3; i++) {
    const a = i / 3 * Math.PI * 2, arm = box([0.32, 2.1, 0.16], M.alu, [0, 0, 0]);
    arm.position.set(Math.sin(a) * 1.05, Math.cos(a) * 1.05, DRUM.back - 0.12); arm.rotation.z = -a; g.add(arm);
  }
  g.add(alongZ(cylinder(0.32, 0.32, 0.2, M.alu, [0, 0, DRUM.back - 0.12], { segments: 24 })));
  g.add(alongZ(cylinder(0.12, 0.12, 0.95, M.chrome, [0, 0, -2.2], { segments: 16 })));
  g.userData.anchor = [-1.66, 1.66, DRUM.front]; g.userData.anchorStatic = true;
  add('drum', noShadow(g), V(0, 0, 0), V(0, 0, 1.8), spinner);
}

// Lifters: three ridges inside the drum that carry the clothes up the side.
{
  const g = new THREE.Group();
  const s = new THREE.Shape(); s.moveTo(-0.26, 0); s.lineTo(0.26, 0); s.lineTo(0.12, 0.46); s.lineTo(-0.12, 0.46); s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, { depth: 2.9, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 2 });
  geo.translate(0, 0, -1.45);
  for (let i = 0; i < 3; i++) {
    const a = i / 3 * Math.PI * 2 + Math.PI / 2, lifter = new THREE.Mesh(geo, M.lifter);
    lifter.position.set(Math.sin(a) * (DRUM.r - 0.02), -Math.cos(a) * (DRUM.r - 0.02), 0); lifter.rotation.z = a; g.add(lifter);
  }
  g.userData.anchor = [2.0, -0.6, 0.9]; g.userData.anchorStatic = true;
  add('lifters', g, V(0, 0, 0), V(0, 0, 1.8), spinner);
}

// Drum pulley: 288 mm across, on the end of the drum shaft behind the tub.
{
  const g = new THREE.Group();
  g.add(ringZ([[1.3, -0.12], [PULLEY.r, -0.12], [PULLEY.r, 0.12], [1.3, 0.12]], M.alu));
  for (let i = 0; i < 3; i++) {
    const a = i / 3 * Math.PI * 2, spoke = box([0.2, 1.1, 0.12], M.alu, [0, 0, 0]);
    spoke.position.set(Math.sin(a) * 0.8, Math.cos(a) * 0.8, 0); spoke.rotation.z = -a; g.add(spoke);
  }
  g.add(alongZ(cylinder(0.3, 0.3, 0.26, M.alu, [0, 0, 0], { segments: 24 })));
  g.userData.anchor = [1.0, 1.04, 0]; g.userData.anchorStatic = true;
  add('pulley', g, V(0, 0, PULLEY.z), V(0, 0, -2.4), spinner);
}

// Motor: bolted under the tub, so the belt keeps its tension when the tub moves.
let motorPulley;
{
  const g = new THREE.Group();
  g.add(alongZ(cylinder(0.5, 0.5, 1.2, M.iron, [MOTOR.x, MOTOR.y, -1.35], { segments: 32 })));
  for (let i = 0; i < 5; i++) g.add(alongZ(cylinder(0.53, 0.53, 0.04, M.iron, [MOTOR.x, MOTOR.y, -1.8 + i * 0.22], { segments: 32 })));
  [-2.04, -0.66].forEach(z => g.add(alongZ(cylinder(0.46, 0.46, 0.18, M.alu, [MOTOR.x, MOTOR.y, z], { segments: 32 }))));
  g.add(alongZ(cylinder(0.05, 0.05, 0.6, M.chrome, [MOTOR.x, MOTOR.y, -2.25], { segments: 12 })));
  motorPulley = alongZ(cylinder(MOTOR.pulley, MOTOR.pulley, 0.26, M.alu, [MOTOR.x, MOTOR.y, PULLEY.z], { segments: 20 })); g.add(motorPulley);
  [-1.75, -0.95].forEach(z => g.add(box([0.26, 0.3, 0.26], M.iron, [MOTOR.x, -2.75, z], 0.04)));
  g.add(box([0.3, 0.22, 0.34], M.plastic, [MOTOR.x - 0.52, MOTOR.y + 0.18, -1.2], 0.04));
  add('motor', g, V(0, 0, 0), V(0, 0, -2.4), suspended);
}

// Belt: a flat ring around both pulleys.
{
  const g = new THREE.Group();
  const loop = grow => hull([...circle(0, 0, PULLEY.r + grow, 120), ...circle(MOTOR.x, MOTOR.y, MOTOR.pulley + grow, 24)]);
  const outer = loop(0.05), inner = loop(0);
  const shape = new THREE.Shape(outer.map(([x, y]) => new THREE.Vector2(x, y)));
  shape.holes.push(new THREE.Path(inner.reverse().map(([x, y]) => new THREE.Vector2(x, y))));
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.2, bevelEnabled: false, curveSegments: 1 });
  geo.translate(0, 0, PULLEY.z - 0.1);
  g.add(new THREE.Mesh(geo, M.belt));
  const side = outer.filter(([x]) => x > 0).reduce((a, b) => (Math.abs(b[1] + 1.8) < Math.abs(a[1] + 1.8) ? b : a));
  g.userData.anchor = [side[0], side[1], PULLEY.z + 0.1];
  add('belt', g, V(0, 0, 0), V(0, 0, -2.4), suspended);
}

// Heating element: a steel hairpin in the bottom of the tub, below the drum.
{
  const g = new THREE.Group();
  const path = new THREE.CurvePath(), back = -1.3, front = 1.85, w = 0.22;
  path.add(new THREE.LineCurve3(V(-w, HEAT_Y, front), V(-w, HEAT_Y, back)));
  for (let i = 0; i < 8; i++) {
    const a0 = Math.PI * i / 8, a1 = Math.PI * (i + 1) / 8;
    path.add(new THREE.LineCurve3(V(-w * Math.cos(a0), HEAT_Y, back - w * Math.sin(a0)), V(-w * Math.cos(a1), HEAT_Y, back - w * Math.sin(a1))));
  }
  path.add(new THREE.LineCurve3(V(w, HEAT_Y, back), V(w, HEAT_Y, front)));
  const element = new THREE.Mesh(new THREE.TubeGeometry(path, 120, 0.075, 10, false), M.heater);
  element.userData.heater = true; g.add(element);
  g.add(box([0.6, 0.36, 0.08], M.iron, [0, HEAT_Y, TUB.front + 0.02], 0.02));
  g.add(box([0.3, 0.22, 0.2], M.plastic, [0, HEAT_Y, TUB.front + 0.14], 0.04));
  g.add(alongZ(cylinder(0.035, 0.035, 0.5, M.copper, [0, HEAT_Y + 0.12, 1.65], { segments: 10 }))); // temperature sensor
  add('heater', g, V(0, 0, 0), V(0, -0.5, 3.2), suspended);
}

// Water in the tub: a slice of a cylinder lying on its side, rebuilt as the level changes.
const WATER_R = 2.64, WATER_DEPTH = 3.9;
let waterMesh;
{
  const g = new THREE.Group();
  waterMesh = new THREE.Mesh(new THREE.BufferGeometry(), M.water);
  Object.assign(waterMesh.userData, { water: true, noGhost: true, noShadow: true, level: null });
  g.add(waterMesh);
  g.userData.anchor = [-0.9, -2.0, 1.3];
  add('water', g, V(0, 0, 0), V(0, 0, 0), suspended);
}
function setWaterLevel(y) {
  waterMesh.visible = y > -TUB.r + 0.03;
  if (!waterMesh.visible || (waterMesh.userData.level !== null && Math.abs(y - waterMesh.userData.level) < 0.008)) return;
  const c = Math.sqrt(Math.max(0, WATER_R ** 2 - y * y)), a0 = Math.atan2(y, -c);
  let a1 = Math.atan2(y, c); if (a1 < a0) a1 += Math.PI * 2;
  const s = new THREE.Shape();
  for (let i = 0; i <= 40; i++) { const a = a0 + (a1 - a0) * i / 40; s[i ? 'lineTo' : 'moveTo'](WATER_R * Math.cos(a), WATER_R * Math.sin(a)); }
  const geo = new THREE.ExtrudeGeometry(s, { depth: WATER_DEPTH, bevelEnabled: false, curveSegments: 1 });
  geo.translate(0, 0, -WATER_DEPTH / 2);
  waterMesh.geometry.dispose(); waterMesh.geometry = geo; waterMesh.userData.level = y;
}

// Clothes: crumpled bundles of fabric. Folds are ridges cut into a squashed ball; the side
// that faces the drum wall is flatter. Each bundle runs on the garment physics in washer.js.
function garmentGeometry(size) {
  const geo = new THREE.SphereGeometry(1, 40, 28), p = geo.attributes.position, v = new THREE.Vector3();
  const folds = Array.from({ length: 6 }, (_, i) => ({
    d: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize(),
    k: 3 + Math.random() * 4, phase: Math.random() * 6, a: (i < 3 ? 0.13 : 0.07) * (0.7 + Math.random() * 0.6),
  }));
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    // |sin| makes rounded crests with sharp creases between them, like crushed cloth.
    let r = 1;
    for (const f of folds) r += f.a * (Math.abs(Math.sin(f.k * v.dot(f.d) + f.phase)) - 0.64);
    v.multiplyScalar(r).multiply(size);
    if (v.y < 0) v.y *= 0.55;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  geo.rotateY(Math.random() * Math.PI);
  geo.computeVertexNormals();
  // The sphere repeats vertices along its seam and at the poles: average their normals so no seam shows.
  const n = geo.attributes.normal, shared = new Map();
  for (let i = 0; i < p.count; i++) {
    const key = `${p.getX(i).toFixed(4)},${p.getY(i).toFixed(4)},${p.getZ(i).toFixed(4)}`;
    if (!shared.has(key)) shared.set(key, []);
    shared.get(key).push(i);
  }
  for (const list of shared.values()) {
    if (list.length < 2) continue;
    v.set(0, 0, 0); list.forEach(i => { v.x += n.getX(i); v.y += n.getY(i); v.z += n.getZ(i); });
    v.normalize(); list.forEach(i => n.setXYZ(i, v.x, v.y, v.z));
  }
  return geo;
}
// Knitted stripes for some of the clothes, so the bundles read as fabric and their turning shows.
function stripeTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#6d7480'; for (let y = 0; y < 64; y += 16) g.fillRect(0, y, 64, 7);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1, 3); return t;
}
const CLOTH = [0x3d5a80, 0xe9e5dc, 0xb5523b, 0x8d939b, 0x2b3a55, 0xd6a645, 0x6f8f72, 0xe9e5dc, 0xcf8a96, 0x46607e, 0xa8a196, 0x3a3735];
const fabric = speckleTexture({ repeat: 2 }), stripes = stripeTexture();
const garments = [];
{
  const g = new THREE.Group();
  CLOTH.forEach((color, i) => {
    const layer = i % 3, size = new THREE.Vector3(0.62 + Math.random() * 0.2, 0.34 + Math.random() * 0.08, 0.5 + Math.random() * 0.14);
    const material = new THREE.MeshStandardMaterial({ color: new THREE.Color(color).convertSRGBToLinear(), roughness: 0.95, map: i % 3 === 1 ? stripes : fabric });
    const mesh = new THREE.Mesh(garmentGeometry(size), material);
    mesh.position.z = -1.05 + (i % 6) * 0.42 + (Math.random() - 0.5) * 0.15;
    mesh.rotation.x = (Math.random() - 0.5) * 0.3;
    g.add(mesh);
    // Bundles pile up: the first layer lies on the wall, the next ones on top of it.
    const sim = createGarment({ r: (DRUM.r - 0.05 - size.y * 0.55 - 0.42 * layer) / 10, angle: (Math.random() - 0.5) * 1.4, grip: 0.84 + Math.random() * 0.16 });
    garments.push({ sim, mesh, rot: sim.angle, spin: (Math.random() - 0.5) * 9 });
  });
  g.userData.anchor = [0.7, -1.75, 0.8];
  add('clothes', g, V(0, 0, 0), V(0, 0, 1.8), suspended);
}

// Concrete counterweights on the front of the tub, above and below the door opening.
{
  const g = new THREE.Group();
  const sector = (a0, a1) => {
    const s = new THREE.Shape(); s.absarc(0, 0, 2.8, a0, a1, false); s.absarc(0, 0, 2.32, a1, a0, true);
    const geo = new THREE.ExtrudeGeometry(s, { depth: 0.5, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.04, bevelSegments: 2, curveSegments: 24 });
    const mesh = new THREE.Mesh(geo, M.concrete); mesh.position.z = TUB.front + 0.06; return mesh;
  };
  const rad = THREE.MathUtils.degToRad;
  g.add(sector(rad(40), rad(140)), sector(rad(222), rad(318)));
  [-1, 1].forEach(s => [rad(90 + s * 35), rad(270 + s * 33)].forEach(a => g.add(alongZ(cylinder(0.07, 0.07, 0.1, M.chrome, [Math.cos(a) * 2.56, Math.sin(a) * 2.56, TUB.front + 0.62], { segments: 12 })))));
  g.userData.anchor = [0, 2.55, TUB.front + 0.3];
  add('weight', g, V(0, 0, 0), V(0, 1.6, 1.4), suspended);
}

// Springs: the tub hangs from two coil springs under a rail at the top of the cabinet.
const springs = [];
const SPRING_LEN = SPRING_TOP - SPRING_BOTTOM;
{
  const g = new THREE.Group();
  g.add(box([4.4, 0.12, 0.3], M.iron, [0, SPRING_TOP + 0.08, SPRING_Z], 0.03));
  [-1, 1].forEach(s => {
    const spring = new THREE.Mesh(springGeometry(SPRING_LEN, { turns: 11, radius: 0.13, wire: 0.03 }), M.spring);
    spring.position.set(s * SPRING_X, SPRING_BOTTOM, SPRING_Z); g.add(spring); springs.push({ mesh: spring, x: s * SPRING_X });
  });
  g.userData.anchor = [SPRING_X, (SPRING_TOP + SPRING_BOTTOM) / 2, SPRING_Z];
  add('springs', g, V(0, 0, 0), V(0, 1.2, 0));
}

// Friction dampers: a rod slides in a tube lined with felt, between the floor of the cabinet and the tub.
const damperRods = [];
{
  const g = new THREE.Group();
  [-1, 1].forEach(s => {
    const x = s * DAMPER_X;
    g.add(cylinder(0.17, 0.17, 1.2, M.plastic, [x, -3.9, DAMPER_Z], { segments: 20 }));
    g.add(box([0.36, 0.12, 0.36], M.iron, [x, CAB.bottom + 0.16, DAMPER_Z], 0.03));
    const rod = new THREE.Group();
    rod.add(cylinder(0.07, 0.07, 1.15, M.chrome, [x, DAMPER_TOP - 0.55, DAMPER_Z], { segments: 12 }));
    rod.add(box([0.3, 0.12, 0.3], M.iron, [x, DAMPER_TOP + 0.02, DAMPER_Z], 0.03));
    g.add(rod); damperRods.push(rod);
  });
  g.userData.anchor = [DAMPER_X, -3.55, DAMPER_Z];
  add('dampers', g, V(0, 0, 0), V(0, -0.2, 1.8));
}

// Drain pump at the bottom front, behind the filter flap, with its hoses.
const DRAIN_IN = [[0.9, -2.58, 1.15], [1.1, -3.1, 1.4], [1.6, -3.6, 1.9], [1.9, -3.76, 2.2]];
const DRAIN_OUT = [[2.25, -4.1, 2.15], [2.5, -4.2, 1.2], [2.55, -4.2, -1.5], [2.55, -3.8, -2.45], [2.55, 0, -2.6], [2.55, 3.0, -2.6], [2.45, 3.45, -2.85], [2.4, 3.4, -3.2], [2.4, 2.9, -3.35]];
{
  const g = new THREE.Group();
  g.add(alongZ(cylinder(0.36, 0.36, 0.5, M.plastic, [1.9, -4.1, 2.15], { segments: 28 })));
  g.add(alongZ(cylinder(0.27, 0.27, 0.32, M.dark, [1.9, -4.1, 2.56], { segments: 24 })));
  g.add(box([0.42, 0.08, 0.08], M.dark, [1.9, -4.1, 2.74], 0.02));
  g.add(alongZ(cylinder(0.24, 0.24, 0.45, M.iron, [1.9, -4.1, 1.7], { segments: 24 })));
  g.add(tube(DRAIN_IN, 0.11, M.hose, 32));
  g.add(tube(DRAIN_OUT, 0.1, M.hose, 120));
  g.userData.anchor = [1.9, -4.1, 2.3];
  add('pump', g, V(0, 0, 0), V(1.2, 0, 2.4));
}

// ---------- Water and air effects ----------
const dot = softDot();
const FILL_PATH = curve([
  [-1.9, 3.32, -2.3], [-2.05, 3.5, -1.2], [-2.05, 3.5, 0.4], [-2.0, 3.42, 1.05],
  [-2.4, 3.3, 1.7], [-2.45, 3.12, 2.15], [-2.1, 2.97, 1.6], [-1.9, 2.9, 1.4], [-1.72, 2.62, 1.55], [-1.45, 2.3, 1.75],
]);
const DRAIN_PATH = curve([[0.2, -2.45, 0.6], ...DRAIN_IN, [1.9, -4.1, 2.15], ...DRAIN_OUT]);
const fillDrops = createParticles(scene, 90, { color: 0x2f7fd6, size: 0.7, map: dot, seed: () => ({ u: Math.random(), s: 0.8 + Math.random() * 0.4, j: Math.random() - 0.5, k: Math.random() - 0.5 }) });
const drainDrops = createParticles(scene, 110, { color: 0x2f7fd6, size: 0.7, map: dot, seed: () => ({ u: Math.random(), s: 0.8 + Math.random() * 0.4, j: Math.random() - 0.5, k: Math.random() - 0.5 }) });
const spray = createParticles(scene, 180, { color: 0x3a8ae0, size: 0.5, map: dot, seed: () => ({ a: Math.random() * Math.PI * 2, z: (Math.random() * 2 - 1) * 1.5, t: Math.random(), s: 0.7 + Math.random() * 0.6 }) });
const bubbles = createParticles(scene, 50, { color: 0xeaf4ff, size: 0.36, map: dot, seed: () => ({ t: Math.random(), z: -1.2 + Math.random() * 2.9, x: (Math.random() < 0.5 ? -1 : 1) * 0.22, s: 0.6 + Math.random() * 0.6 }) });

// The clouds start at the origin, so their bounds are wrong until they move: never cull them.
[fillDrops, drainDrops, spray, bubbles].forEach(c => { c.points.frustumCulled = false; });

// ---------- State and UI ----------
const sim = createSim();
const state = { step: 0, explode: 0, targetExplode: 0, playing: true, focus: [], cut: false, mode: 'idle', spinRpm: WASHER.spinRpm, sim };
let camGoal = null, lastStep = -1;
const story = createStoryUI({
  story: WASHER_STORY, state,
  onStep: (s, index) => {
    // Going on to the next step keeps the machine as it is; any other jump starts the step fresh.
    if (index !== lastStep + 1) Object.assign(sim, s.start);
    lastStep = index;
    // The shake step starts by slowing a spin that is still running, so it passes the resonance on the way.
    sim.t = s.mode === 'shake' && Math.abs(sim.rpm) > 300 ? SHAKE_COAST : 0;
    state.focus = s.focus; state.cut = s.cut; state.mode = s.mode;
    const v = VIEWS[s.view]; camGoal = { ...v, target: new THREE.Vector3(...v.target) };
    cam.theta = v.theta + THREE.MathUtils.euclideanModulo(cam.theta - v.theta + Math.PI, 2 * Math.PI) - Math.PI; // take the short way round
  },
});
const fmt = n => Math.round(n).toLocaleString('en-US');
const spinInput = document.getElementById('spin');
bindRange('spin', v => { state.spinRpm = v; showRange(spinInput, fmt(v)); spinInput.setAttribute('aria-valuetext', `${fmt(v)} rpm`); });
createCallouts(stage, { parts, state, story: WASHER_STORY });

const BLACK = new THREE.Color(0x000000), heaterColor = new THREE.Color();
const focusStyle = {
  highlight: 0.18,
  opacity(name, mesh, hot) {
    let alpha = 1;
    if (mesh.userData.cutaway && state.cut) alpha = hot ? 0.3 : 0.12;
    if (state.focus.length && !hot && looksInside(state)) alpha = Math.min(alpha, 0.3);
    if (mesh.userData.glass) alpha *= 0.3;
    if (mesh.userData.water) alpha *= 0.45;
    return alpha;
  },
  // The element glows a dull red while it heats; everything else gets the usual focus glow.
  decorate(material, { mesh }) {
    if (!material.emissive) return;
    if (mesh.userData.heater && fx.heat > 0.02) { material.emissive.copy(heaterColor); material.emissiveIntensity = 1; return; }
    const glow = mesh.userData.glow ?? 0;
    material.emissive.copy(glow > 0.001 ? material.color : BLACK); material.emissiveIntensity = glow;
  },
};

// The display on the control strip says what the program is doing.
function drawDisplay() {
  let text = sim.locked ? 'READY' : 'OPEN';
  const rpm = Math.abs(sim.rpm);
  if (sim.door > 0.02) text = 'OPEN';
  else if (sim.valve) text = 'FILL';
  else if (sim.heater) text = `HEAT ${Math.round(sim.temp)}°`;
  else if (sim.pump && sim.water > 0.3) text = 'DRAIN';
  else if (rpm > 100) text = `SPIN ${Math.round(rpm / 100) * 100}`;
  else if (rpm > 1) text = `WASH ${Math.round(sim.temp)}°`;
  if (text === lcdTexture.userData.text) return;
  const g = lcdTexture.userData.canvas.getContext('2d');
  g.fillStyle = '#0d1318'; g.fillRect(0, 0, 256, 64);
  g.fillStyle = '#7fdcff'; g.font = '500 30px "IBM Plex Mono", ui-monospace, monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 128, 34);
  lcdTexture.userData.text = text; lcdTexture.needsUpdate = true;
}

const readout = { box: document.getElementById('readout'), drum: document.getElementById('r-drum'), force: document.getElementById('r-force'), water: document.getElementById('r-water') };
let readoutTimer = 0;
function showReadout() {
  const rpm = Math.abs(sim.rpm), g = gForce(rpm);
  readout.drum.textContent = `${fmt(rpm)} rpm`;
  readout.force.textContent = `${g < 10 ? g.toFixed(1) : fmt(g)} g`;
  readout.water.textContent = sim.water >= 0.5 ? `${fmt(sim.water)} L · ${fmt(sim.temp)}°C`
    : sim.wet > 0.01 ? `${fmt(sim.wet * 100)}% in clothes` : '0 L';
  readout.box.classList.toggle('pinned', g >= 1);
}

// ---------- Sound ----------
// The motor whines up with the drum; a spin adds rushing air. Water hisses in through the
// valve, the pump hums and gurgles, and the clothes land with a soft, wet flop.
const motorHum = sound.loop({ type: 'tone', wave: 'sawtooth', freq: 80 });
const rush = sound.loop({ type: 'noise', filter: 'bandpass', freq: 300, q: 1.2 });
const inlet = sound.loop({ type: 'noise', filter: 'bandpass', freq: 1600, q: 0.7 });
const pumpHum = sound.loop({ type: 'tone', wave: 'triangle', freq: 100 });
const gurgle = sound.loop({ type: 'noise', filter: 'lowpass', freq: 500, q: 1 });
const was = { locked: sim.locked, door: sim.door, flop: 0 };
function playSounds(dt, landed) {
  const on = state.playing ? 1 : 0, rpm = Math.abs(sim.rpm), run = Math.min(1, rpm / 1400);
  motorHum.set(rpm > 1 ? (0.01 + 0.022 * run) * on : 0, 70 + motorRpm(rpm) / 60);
  rush.set(0.12 * run ** 1.5 * on, 200 + rpm * 0.5);
  inlet.set(sim.valve ? 0.07 * on : 0);
  const draining = sim.pump && (sim.water > 0.3 || sim.extract > 0.01);
  pumpHum.set(sim.pump ? 0.018 * on : 0);
  gurgle.set(draining ? 0.06 * on : 0, 380 + Math.random() * 200);
  was.flop -= dt;
  if (landed && was.flop <= 0) {
    const wet = sim.water > 2;
    sound.noise({ gain: 0.05 + Math.random() * 0.03, filter: 'lowpass', freq: wet ? 650 : 320, release: 0.14 });
    if (wet) sound.noise({ gain: 0.025, filter: 'bandpass', freq: 1300, q: 1.2, release: 0.2, delay: 0.02 });
    was.flop = 0.09;
  }
  if (sim.locked !== was.locked) sound.click(0.3);
  if (sim.door < 0.02 && was.door >= 0.02) sound.thunk(0.4);
  was.locked = sim.locked; was.door = sim.door;
}

// ---------- Frame ----------
const SHOWN_MAX = 150; // rpm: faster spins are drawn slowed down, or the drum would strobe
const shownRpm = rpm => {
  const a = Math.abs(rpm), s = a <= 100 ? a : 100 + (SHOWN_MAX - 100) * (1 - Math.exp(-(a - 100) / 300));
  return Math.sign(rpm) * s * (reduced ? 0.35 : 1);
};
const SWAY = 5 * 0.01; // units per mm of real movement, shown 5 times larger
const fx = { angle: 0, door: 0, bolt: 2.4, heat: 0, tilt: 0, sway: new THREE.Vector2() };
startLoop(stage, (dt, now) => {
  update(state, focusStyle, reduced ? 1 : 0.09, dt);
  if (camGoal) { // ease to the step's view once; after that the reader's own orbit and zoom win
    const k = reduced ? 1 : Math.min(1, dt * 3);
    for (const a of ['r', 'theta', 'phi']) cam[a] += (camGoal[a] - cam[a]) * k;
    cam.target.lerp(camGoal.target, k);
    if (Math.abs(camGoal.r - cam.r) < 0.05 && Math.abs(camGoal.theta - cam.theta) < 0.01 && cam.target.distanceTo(camGoal.target) < 0.05) camGoal = null;
  }

  const live = state.playing ? dt : 0;
  if (live) stepWasher(sim, live, state.mode, { top: state.spinRpm });

  // Drum, pulleys and the tub swaying on its springs.
  const shown = shownRpm(sim.rpm), w = omega(sim.rpm), ws = omega(shown);
  fx.angle += ws * live;
  spinner.rotation.z = fx.angle;
  motorPulley.rotation.y = fx.angle * WASHER.ratio;
  const amp = reduced ? 0 : swayMm(sim.rpm) * SWAY;
  fx.sway.lerp(new THREE.Vector2(amp * Math.sin(fx.angle), -amp * Math.cos(fx.angle)), Math.min(1, dt * 20));
  suspended.position.set(fx.sway.x, fx.sway.y, 0);
  springs.forEach(({ mesh, x }) => {
    const dx = -fx.sway.x, dy = SPRING_TOP - SPRING_BOTTOM - fx.sway.y;
    mesh.position.set(x + fx.sway.x, SPRING_BOTTOM + fx.sway.y, SPRING_Z);
    mesh.rotation.z = Math.atan2(-dx, dy); mesh.scale.y = Math.hypot(dx, dy) / SPRING_LEN;
  });
  damperRods.forEach(rod => rod.position.set(fx.sway.x, fx.sway.y, 0));

  // Clothes: lifted, dropped, or pressed flat on the wall.
  let landed = false;
  garments.forEach(item => {
    const g = item.sim;
    if (live && stepGarment(g, live, w, ws) === 'landed') landed = true;
    item.mesh.position.x = g.x * 10; item.mesh.position.y = g.y * 10;
    if (g.flying) item.rot += item.spin * live;
    else item.rot += Math.atan2(Math.sin(g.angle - item.rot), Math.cos(g.angle - item.rot)) * Math.min(1, dt * 10);
    item.mesh.rotation.z = item.rot;
  });

  // Door and lock.
  fx.door += (sim.door - fx.door) * Math.min(1, dt * (reduced ? 60 : 10));
  doorPivot.rotation.y = -fx.door * 1.75;
  fx.bolt += ((sim.locked ? 2.12 : 2.4) - fx.bolt) * Math.min(1, dt * 14);
  lockBolt.position.x = fx.bolt;

  // Water level, tilted a little by the turning drum.
  const waterY = -TUB.r + levelFromLitres(sim.water) * 10;
  setWaterLevel(waterY);
  fx.tilt += (THREE.MathUtils.clamp(shown * 0.003, -0.12, 0.12) * (sim.water > 0.5 ? 1 : 0) - fx.tilt) * Math.min(1, dt * 2);
  waterMesh.rotation.z = fx.tilt;
  powder.scale.y = Math.max(0.02, sim.powder); powder.position.y = 3.03 + 0.13 * powder.scale.y;
  fx.heat += ((sim.heater ? 1 : 0) - fx.heat) * Math.min(1, dt * (reduced ? 60 : 2));
  heatColor(0.72 * fx.heat, heaterColor);

  const t = now / 1000;
  // Mains water through the hose and the drawer, then down into the tub.
  if (fillDrops.fade(sim.valve ? 0.85 : 0, Math.min(1, dt * 6))) {
    fillDrops.seeds.forEach((d, i) => {
      d.u = (d.u + live * d.s * 0.45) % 1;
      if (d.u < 0.7) { const p = FILL_PATH.getPointAt(d.u / 0.7); fillDrops.place(i, p.x + d.j * 0.08, p.y + d.k * 0.06, p.z + d.k * 0.08); }
      else { const f = (d.u - 0.7) / 0.3; fillDrops.place(i, -1.45 + d.j * 0.12 * f, 2.25 - (2.25 - waterY) * f * f, 1.75 + d.k * 0.12 * f); }
    });
    fillDrops.commit();
  }
  // Out through the pump and up the drain hose.
  const draining = sim.pump && (sim.water > 0.3 || sim.extract > 0.01);
  if (drainDrops.fade(draining ? 0.85 : 0, Math.min(1, dt * 6))) {
    drainDrops.seeds.forEach((d, i) => {
      d.u = (d.u + live * d.s * 0.18) % 1;
      const p = DRAIN_PATH.getPointAt(d.u);
      drainDrops.place(i, p.x + d.j * 0.1, p.y + d.k * 0.1, p.z + d.j * 0.1);
    });
    drainDrops.commit();
  }
  // Spin: water flies out through the holes, hits the tub and runs down to the drain.
  if (spray.fade(THREE.MathUtils.clamp(sim.extract * 5, 0, 0.8), Math.min(1, dt * 4))) {
    spray.seeds.forEach((d, i) => {
      d.t = (d.t + live * d.s * 1.4) % 1;
      const b0 = d.a + fx.angle * 0.2;
      let r = WATER_R - 0.04, b = b0;
      if (d.t < 0.25) r = DRUM.r + (WATER_R - 0.04 - DRUM.r) * d.t / 0.25;
      else { const k = (d.t - 0.25) / 0.75, a = Math.atan2(Math.sin(b0), Math.cos(b0)); b = a * (1 - k) ** 1.5; }
      spray.place(i, fx.sway.x + r * Math.sin(b), fx.sway.y - r * Math.cos(b), d.z);
    });
    spray.commit();
  }
  // Bubbles rise off the hot element.
  if (bubbles.fade(fx.heat > 0.3 && sim.water > 3 ? 0.7 : 0, Math.min(1, dt * 3))) {
    bubbles.seeds.forEach((d, i) => {
      d.t = (d.t + live * d.s * 0.8) % 1;
      bubbles.place(i, fx.sway.x + d.x + Math.sin(t * 6 + i) * 0.03, fx.sway.y + HEAT_Y + 0.06 + (waterY - HEAT_Y - 0.06) * d.t, d.z);
    });
    bubbles.commit();
  }

  playSounds(dt, landed);
  readoutTimer -= dt;
  if (readoutTimer <= 0) { showReadout(); drawDisplay(); readoutTimer = 0.1; }
});
story.setStep(0, false);
