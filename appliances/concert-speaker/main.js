import * as THREE from 'three';
import { BufferGeometryUtils } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createStage, addFloor, addStudioLights } from '../../src/engine/stage.js';
import { createParts } from '../../src/engine/parts.js';
import { createCallouts } from '../../src/engine/callouts.js';
import { createStoryUI, bindRange, showRange } from '../../src/engine/story-ui.js';
import { sound } from '../../src/engine/sound.js';
import { onThemeChange } from '../../src/site.js';
import { startLoop, reducedMotion as reduced } from '../../src/engine/loop.js';
import { box, cylinder, lathe, roundedRect } from '../../src/kit/shapes.js';
import { createMaterials, linear } from '../../src/kit/materials.js';
import { softDot, createParticles } from '../../src/kit/effects.js';
import { SPEAKER_STORY } from './story.js';
import { BOX, HANG, GUIDE, PITCHES, DRIVERS, CROSSOVER, travel, wavelength, hang, coverage, showHz, pitchText, lengthText, travelText } from './array.js';

// ---------- Layout ----------
// Scale: 1 unit = 10 cm. The floor is y = 0 and the crowd stands toward +z. The hang's top front
// edge is 9 m up, over z = 0; each box's own frame has its origin on its top front edge, x across,
// y up its front face and z out of its grille. The bottom box (the featured one) is built in full;
// for the close-ups it comes down to the floor in front of the hang.
const U = 10;
const v3 = (x, y, z) => new THREE.Vector3(x, y, z);
const zero = v3(0, 0, 0);
const deg = THREE.MathUtils.degToRad;
const clamp01 = v => Math.max(0, Math.min(1, v));
const smooth = t => t * t * (3 - 2 * t);

const W = BOX.width * U, HF = BOX.height * U, D = BOX.depth * U;  // 13 × 3.6 × 5
const LEAN = Math.tan(deg(BOX.taper)), TAPER = LEAN * D;           // the top and bottom lean in 0.44 at the back
const T = 0.18;                                                    // 18 mm birch plywood
const BAFFLE_Z = -0.35;                                            // the driver board, behind the grille
const WOOF = { x: 4.5, y: -HF / 2 };                               // 12-inch woofers, one each end
const PORT_X = [2.05, 2.5];                                        // the bass ports, 45 mm slots
const HORN_X = 1.7;                                                // the horn's mouth on the baffle
const GUIDE_Z = -1.75, THROAT_Z = -3.65;                           // waveguide mouth and throats
const THROATS = [-1.2, -2.4];                                      // two compression drivers, one above the other
const MOUTH = { top: -0.35, bottom: -0.35 - GUIDE.slot * U, half: GUIDE.width * U / 2 }; // the slot: 29 cm tall, 3 cm wide
MOUTH.mid = (MOUTH.top + MOUTH.bottom) / 2;
const THROAT_R = GUIDE.throat * U / 2;
const PLUG_X = 3.4;                                                // the connector panel, off to one side of the drivers
const FEAT = HANG.boxes - 1;
const EAR = HANG.ear * U;

// Where each box sits for a hang opened by `open` (0 straight, 1 the full J).
const poseOf = (b, out = new THREE.Object3D()) => { out.position.set(0, b.top[0] * U, b.top[1] * U); out.rotation.set(deg(b.aim), 0, 0); return out; };
const FULL = hang(1);
// On the floor 1.2 m in front of the hang, tipped back 5° so it sits flat on its tapered bottom face.
const benchPose = new THREE.Object3D();
benchPose.position.set(0, HF * Math.cos(deg(BOX.taper)), 12); benchPose.rotation.x = -deg(BOX.taper); benchPose.updateMatrixWorld();
const boxPoint = (local, pose = benchPose) => { pose.updateMatrixWorld(); return pose.localToWorld(v3(...local)); };

// A camera on the featured box on the floor: target and direction in the box's own frame.
function boxView(local, theta, phi, r) {
  const dir = v3(Math.sin(phi) * Math.sin(theta), Math.cos(phi), Math.sin(phi) * Math.cos(theta)).applyQuaternion(benchPose.quaternion);
  return { r, theta: Math.atan2(dir.x, dir.z), phi: Math.acos(dir.y), target: boxPoint(local).toArray() };
}
const VIEWS = {
  rig: { r: 190, theta: 1.2, phi: 1.42, target: [-6, 68, 6] },
  amps: { r: 60, theta: 0.95, phi: 1.34, target: [22, 10, -25] },
  woofer: boxView([WOOF.x - 0.6, WOOF.y, -0.8], 0.5, 1.28, 30),
  port: boxView([2.0, -1.8, -1.3], 0.78, 1.12, 27),
  driver: boxView([0.5, -1.8, -5], 2.5, 1.2, 22),
  guide: boxView([0, -1.8, -2.2], 1.25, 0.7, 21),
  line: { r: 330, theta: 1.02, phi: 1.36, target: [0, 52, 95] },
  crowd: { r: 560, theta: 1.3, phi: 1.24, target: [0, 30, 175] },
};

// ---------- Stage and light ----------
const stage = createStage(document.getElementById('c'), {
  fov: 36, pbr: true, camera: VIEWS.rig, zoom: [12, 900], phiLimit: 0.15,
});
const { scene, cam } = stage;
stage.camera.near = 0.5; stage.camera.far = 3000; stage.camera.updateProjectionMatrix();
// The key comes from the crowd's side, high and to the right, so the grilles facing down at the
// front rows still catch some of it.
addStudioLights(stage, { key: [150, 240, 230], extent: 130, far: 700, scale: 10, shadowMap: 2048 });
addFloor(stage, 0, { size: 1100, cell: 10, opacity: 0.1, center: [0, 160], height: 120, blur: 3, shadowSize: 420, darkness: 1.4 }); // 1 m grid

// ---------- Materials ----------
const M = createMaterials({
  ply: { color: 0x34383e, metalness: 0.05, roughness: 0.82 },          // birch ply in black textured paint
  grille: { color: 0xffffff, metalness: 0.55, roughness: 0.5, map: perforation() },
  paper: { color: 0x1f2226, roughness: 0.92, side: THREE.DoubleSide },    // woofer cones
  midPaper: { color: 0x4b5058, roughness: 0.85, side: THREE.DoubleSide },
  cap: { color: 0x2c3036, metalness: 0.3, roughness: 0.35 },
  rubber: 'rubber', copper: 'copper', steel: 'steel', brushed: 'brushed', iron: 'iron', dark: 'dark',
  basket: { color: 0x3d434b, metalness: 0.65, roughness: 0.4 },
  spider: { color: 0xc8b384, roughness: 0.9, side: THREE.DoubleSide },
  former: { color: 0xc58b2a, roughness: 0.5, side: THREE.DoubleSide },
  neo: { color: 0xc9ced4, metalness: 0.85, roughness: 0.25 },           // nickel-plated neodymium
  titanium: { color: 0xb7bcc2, metalness: 0.9, roughness: 0.22, side: THREE.DoubleSide },
  alu: { look: 'aluminium', color: 0xd0d5db },
  guide: { color: 0x5b626b, metalness: 0.25, roughness: 0.45, side: THREE.DoubleSide },
  horn: { color: 0x24272c, roughness: 0.6, side: THREE.DoubleSide },
  red: { color: 0xc8372d, roughness: 0.45 },
  motorBody: { color: 0x283442, metalness: 0.35, roughness: 0.5 },
  case: { color: 0x1b1d21, roughness: 0.7 },
  face: { color: 0x2a2e34, metalness: 0.5, roughness: 0.4 },
  person: { color: 0xffffff, roughness: 0.75 },
}, { pbr: true });

// The grille: perforated steel, a hole every 6 mm, over black foam.
function perforation() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#3a3e44'; g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#0d0e10';
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
    g.beginPath(); g.arc(8 + x * 16 + (y % 2) * 8, 8 + y * 16, 5, 0, Math.PI * 2); g.fill();
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(W / 0.6 / 4, HF / 0.6 / 4);
  t.encoding = THREE.sRGBEncoding; t.anisotropy = 4;
  return t;
}

// ---------- Helpers ----------
// Turns an object built along +y so that +y points along dir.
const Y = v3(0, 1, 0);
const toward = (object, dir) => { object.quaternion.setFromUnitVectors(Y, dir.clone().normalize()); return object; };
// Merges a group's meshes into one mesh per material, so a box of many panels is a few draw calls.
function merged(group) {
  group.updateMatrixWorld(true);
  const byMaterial = new Map();
  group.traverse(o => {
    if (!o.isMesh) return;
    const geo = (o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone()).applyMatrix4(o.matrixWorld);
    if (!byMaterial.has(o.material)) byMaterial.set(o.material, []);
    byMaterial.get(o.material).push(geo);
  });
  const out = new THREE.Group();
  byMaterial.forEach((geos, material) => out.add(new THREE.Mesh(BufferGeometryUtils.mergeBufferGeometries(geos), material)));
  return out;
}
const cutaway = g => { g.traverse(o => { if (o.isMesh) o.userData.cutaway = true; }); return g; };

// The side profile of a box in (z, y): a trapezoid, so neighbours can splay up to 10°.
function sideProfile() {
  const s = new THREE.Shape();
  s.moveTo(0, 0); s.lineTo(0, -HF); s.lineTo(-D, -HF + TAPER); s.lineTo(-D, -TAPER); s.closePath();
  return s;
}

// The plywood shell: two sides, top, bottom and back. The front is the grille.
function shell(mat = M.ply) {
  const g = new THREE.Group();
  [1, -1].forEach(s => {
    const geo = new THREE.ExtrudeGeometry(sideProfile(), { depth: T, bevelEnabled: false });
    geo.rotateY(-Math.PI / 2); // profile x -> z, extrusion -> -x
    geo.translate(s > 0 ? W / 2 : -W / 2 + T, 0, 0);
    g.add(new THREE.Mesh(geo, mat));
  });
  const slope = D / Math.cos(deg(BOX.taper));
  const top = box([W - 2 * T, T, slope], mat, [0, -TAPER / 2 - T / 2, -D / 2], 0); top.rotation.x = -deg(BOX.taper); g.add(top);
  const bottom = box([W - 2 * T, T, slope], mat, [0, -HF + TAPER / 2 + T / 2, -D / 2], 0); bottom.rotation.x = deg(BOX.taper); g.add(bottom);
  g.add(box([W - 2 * T, HF - 2 * TAPER - 0.2, T], mat, [0, -HF / 2, -D + T / 2], 0));
  return g;
}
const grilleMesh = () => box([W - 0.02, HF - 0.04, 0.06], M.grille, [0, -HF / 2, -0.03], 0.02);
// The input panel on the back: two 8-pin speaker connectors.
function connectors() {
  const g = new THREE.Group();
  g.add(box([2.4, 1.1, 0.1], M.dark, [PLUG_X, -HF / 2, -D - 0.02], 0.03));
  [-0.55, 0.55].forEach(x => g.add(alongZ(cylinder(0.3, 0.3, 0.22, M.dark, [PLUG_X + x, -HF / 2, -D - 0.1], { segments: 20 }))));
  return g;
}
const alongZ = mesh => { mesh.rotation.x = Math.PI / 2; return mesh; };
const alongX = mesh => { mesh.rotation.z = Math.PI / 2; return mesh; };

// The side links of one box: front plates with the hinge pins, rear plates with the angle bar
// and the pin that sets the splay to the box below.
function links() {
  const g = new THREE.Group();
  [1, -1].forEach(s => {
    const x = s * (W / 2 + 0.05);
    g.add(box([0.08, HF + 0.24, 0.8], M.iron, [x, -HF / 2, -0.5], 0.02));
    g.add(box([0.08, HF - 2 * TAPER - 0.1, 0.7], M.iron, [x, -HF / 2, -D + 0.45], 0.02));
    g.add(box([0.1, 1.5, 0.22], M.iron, [x + s * 0.08, -HF + TAPER + 0.15, -D + 0.45], 0.03));
    [0, -HF].forEach(y => {
      g.add(alongX(cylinder(0.09, 0.09, 0.32, M.steel, [x + s * 0.1, y, -0.35], { segments: 10 })));
      g.add(alongX(cylinder(0.16, 0.16, 0.06, M.red, [x + s * 0.27, y, -0.35], { segments: 14 })));
    });
    g.add(alongX(cylinder(0.16, 0.16, 0.06, M.red, [x + s * 0.27, -HF + TAPER - 0.32, -D + 0.45], { segments: 14 })));
  });
  return g;
}

// ---------- Parts ----------
const root = new THREE.Group(); scene.add(root);
const { parts, add, update } = createParts(root, { shadows: true, lively: true });
const featured = new THREE.Group(); root.add(featured); // follows the bottom box, or sits on the floor
const holders = Array.from({ length: HANG.boxes }, () => []); // objects that follow each box

// Array: the other eleven boxes, each a few merged meshes.
{
  const g = new THREE.Group();
  const template = new THREE.Group();
  template.add(shell(), grilleMesh(), connectors());
  const one = merged(template);
  for (let i = 0; i < FEAT; i++) { const b = one.clone(); g.add(b); holders[i].push(b); }
  g.userData.anchor = boxPoint([-W / 2, -HF / 2, 0], poseOf(FULL[5])).toArray();
  add('array', g, zero, zero);
}

// Rigging: the side links on every box, the flying frame on the top box, two chain motors and
// the truss they hang from.
const PICKS = [];
{
  const g = new THREE.Group();
  const one = merged(links());
  for (let i = 0; i < HANG.boxes; i++) { const b = one.clone(); g.add(b); holders[i].push(b); }
  // The flying frame sits on the top box, parallel to its top face, and reaches back for the rear pick.
  const frame = new THREE.Group(); frame.rotation.x = -deg(BOX.taper);
  [-1, 1].forEach(s => frame.add(box([0.35, 0.9, 7.4], M.iron, [s * 5.9, 0.45, -2.9], 0.08)));
  [0.35, -6.2].forEach(z => {
    frame.add(box([11.8, 0.5, 0.5], M.iron, [0, 0.55, z], 0.08));
    frame.add(box([0.25, 1.2, 0.9], M.iron, [0, 1.25, z], 0.04));
    const shackle = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.08, 8, 20), M.steel); shackle.position.set(0, 2.05, z); frame.add(shackle);
    PICKS.push(v3(0, 2.35, z));
  });
  const top = new THREE.Group(); top.add(merged(frame)); g.add(top); holders[0].push(top);
  // The picks do not move: the top box keeps its angle while the pins open the hang below it.
  const topPose = poseOf(FULL[0]); topPose.updateMatrixWorld();
  frame.updateMatrixWorld(true);
  PICKS.forEach(p => p.applyMatrix4(frame.matrix).applyMatrix4(topPose.matrixWorld));
  // Truss: a 29 cm box truss along z, 11 m up, with the motors under it.
  const TRUSS_Y = 112, TZ = [-34, 14], half = 1.45;
  const len = TZ[1] - TZ[0], mid = (TZ[0] + TZ[1]) / 2;
  [[-1, -1], [-1, 1], [1, -1], [1, 1]].forEach(([sx, sy]) => g.add(alongZ(cylinder(0.25, 0.25, len, M.brushed, [sx * half, TRUSS_Y + sy * half, mid], { segments: 12 }))));
  const bays = Math.round(len / (2 * half)), lacing = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.1, 0.1, 1, 6), M.brushed, bays * 4);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  let n = 0;
  for (let i = 0; i < bays; i++) {
    const z0 = TZ[0] + i * (len / bays), z1 = z0 + len / bays, flip = i % 2 ? 1 : -1;
    // One diagonal on each of the four faces of every bay.
    [[v3(-half, half * flip, z0), v3(-half, -half * flip, z1)], [v3(half, half * flip, z0), v3(half, -half * flip, z1)],
      [v3(half * flip, half, z0), v3(-half * flip, half, z1)], [v3(half * flip, -half, z0), v3(-half * flip, -half, z1)]].forEach(([a, b]) => {
      a.y += TRUSS_Y; b.y += TRUSS_Y;
      const dir = b.clone().sub(a);
      q.setFromUnitVectors(Y, dir.clone().normalize()); s.set(1, dir.length(), 1); p.copy(a).addScaledVector(dir, 0.5);
      lacing.setMatrixAt(n++, m.compose(p, q, s));
    });
  }
  g.add(lacing);
  // Chain motors: a body hung from the bottom chords, and the chain down to each pick.
  PICKS.forEach(pick => {
    const hook = TRUSS_Y - half - 0.3;
    g.add(box([0.3, 0.9, 0.3], M.steel, [pick.x, hook - 0.45, pick.z], 0.05));
    g.add(box([2.6, 3.4, 2.2], M.motorBody, [pick.x, hook - 2.6, pick.z], 0.4));
    g.add(alongX(cylinder(0.9, 0.9, 3, M.motorBody, [pick.x, hook - 2.3, pick.z], { segments: 20 })));
    const chainTop = hook - 4.3;
    g.add(cylinder(0.12, 0.12, chainTop - pick.y, M.steel, [pick.x, (chainTop + pick.y) / 2, pick.z], { segments: 8 }));
  });
  g.userData.anchor = PICKS[0].toArray();
  add('rigging', g, zero, zero);
}

// The featured box: shell and baffle (cut away to look inside) and its grille.
{
  const g = new THREE.Group();
  g.add(shell());
  // Baffle: the board the woofers and ports are cut into; the horn opens through the middle.
  const yTop = -T + BAFFLE_Z * LEAN, yBot = -HF + T - BAFFLE_Z * LEAN;
  const s = roundedRect(W - 2 * T, yTop - yBot, 0.01, 0, (yTop + yBot) / 2);
  s.holes.push(roundedRect(2 * HORN_X, MOUTH.top - MOUTH.bottom, 0.05, 0, (MOUTH.top + MOUTH.bottom) / 2, new THREE.Path()));
  [1, -1].forEach(k => {
    s.holes.push(roundedRect(PORT_X[1] - PORT_X[0], 2.8, 0.05, k * (PORT_X[0] + PORT_X[1]) / 2, -HF / 2, new THREE.Path()));
    s.holes.push(new THREE.Path().absarc(k * WOOF.x, WOOF.y, 1.4, 0, Math.PI * 2, true));
  });
  const baffle = new THREE.Mesh(new THREE.ExtrudeGeometry(s, { depth: T, bevelEnabled: false, curveSegments: 32 }), M.ply);
  baffle.position.z = BAFFLE_Z - T; g.add(baffle);
  g.add(connectors());
  cutaway(g);
  g.userData.anchor = [-W / 2, -0.4, -2.5];
  add('cabinet', g, zero, zero, featured);
}
{
  const g = cutaway(new THREE.Group().add(grilleMesh()));
  add('grille', g, zero, v3(0, 0, 5), featured);
}
holders[FEAT].push(featured);

// Woofers: a cast basket, a paper cone on a rubber surround, the voice coil and the magnet.
// Built along +y (the front) and turned to face +z.
const cones = [], coils = [];
{
  const woof = new THREE.Group(), coilG = new THREE.Group(), motor = new THREE.Group();
  [1, -1].forEach(k => {
    const at = v3(k * WOOF.x, WOOF.y, BAFFLE_Z);
    const g = toward(new THREE.Group(), v3(0, 0, 1)); g.position.copy(at); woof.add(g);
    g.add(lathe([[1.36, 0.07], [1.56, 0.07], [1.56, 0], [1.36, 0], [1.36, 0.07]], M.basket, { segments: 56 }));
    for (let i = 0; i < 6; i++) {
      const pivot = new THREE.Group(); pivot.rotation.y = i / 6 * Math.PI * 2 + 0.3;
      const spoke = box([0.14, 1.25, 0.06], M.basket, [1.1, -0.56, 0], 0.02); spoke.rotation.z = -0.5; pivot.add(spoke); g.add(pivot);
    }
    g.add(lathe([[0.85, -1.08], [0.92, -1.08], [0.92, -1.0], [0.85, -1.0], [0.85, -1.08]], M.basket, { segments: 40 }));
    const surround = new THREE.Mesh(new THREE.TorusGeometry(1.27, 0.09, 8, 64), M.rubber); surround.rotation.x = Math.PI / 2; surround.position.y = -0.02; g.add(surround);
    g.add(lathe([[0.5, -0.97], [0.6, -0.93], [0.7, -0.99], [0.8, -0.93], [0.9, -0.99], [0.99, -0.95]], M.spider, { segments: 48 }));
    const cone = new THREE.Group(); g.add(cone); cones.push(cone);
    cone.add(lathe([[0.52, -0.84], [0.8, -0.62], [1.03, -0.36], [1.18, -0.14], [1.24, -0.04]], M.paper, { segments: 56 }));
    cone.add(lathe([[0.001, -0.56], [0.24, -0.6], [0.42, -0.7], [0.54, -0.82]], M.cap, { segments: 40 }));
    // Voice coil on its former: it moves with the cone, so it is a part of its own.
    const c = toward(new THREE.Group(), v3(0, 0, 1)); c.position.copy(at); coilG.add(c);
    const moving = new THREE.Group(); c.add(moving); coils.push(moving);
    moving.add(cylinder(0.5, 0.5, 0.56, M.former, [0, -1.11, 0], { segments: 40, open: true }));
    moving.add(cylinder(0.515, 0.515, 0.3, M.copper, [0, -1.25, 0], { segments: 40, open: true }));
    // Magnet: a steel top plate, a neodymium ring and the back plate with its pole piece.
    const mg = toward(new THREE.Group(), v3(0, 0, 1)); mg.position.copy(at); motor.add(mg);
    mg.add(lathe([[0.54, -1.12], [0.92, -1.12], [0.92, -1.26], [0.54, -1.26], [0.54, -1.12]], M.steel, { segments: 48 }));
    mg.add(lathe([[0.6, -1.26], [0.9, -1.26], [0.9, -1.56], [0.6, -1.56], [0.6, -1.26]], M.neo, { segments: 48 }));
    mg.add(lathe([[0.001, -1.74], [0.92, -1.74], [0.92, -1.56], [0.47, -1.56], [0.47, -1.13], [0.001, -1.13]], M.iron, { segments: 48 }));
  });
  woof.userData.anchor = [WOOF.x, WOOF.y, BAFFLE_Z - 0.5];
  add('woofer', woof, zero, v3(0, 0, 2.4), featured);
  coilG.userData.anchor = [WOOF.x - 0.5, WOOF.y + 0.1, BAFFLE_Z - 1.25];
  add('coil', coilG, zero, v3(0, 0, 1), featured);
  motor.userData.anchor = [WOOF.x + 0.9, WOOF.y - 0.3, BAFFLE_Z - 1.45];
  add('motor', motor, zero, v3(0, 0, -1.2), featured);
}

// Ports: a 45 mm slot beside each woofer, 25 cm deep, joining its chamber to the outside.
{
  const g = new THREE.Group();
  [1, -1].forEach(k => {
    PORT_X.forEach((x, i) => g.add(box([0.05, 2.8, 2.5], M.ply, [k * (x + (i ? 0.025 : -0.025)), -HF / 2, BAFFLE_Z - 1.25], 0)));
    // Rounded lips at the mouth, like a real flared port.
    PORT_X.forEach((x, i) => g.add(cylinder(0.06, 0.06, 2.8, M.ply, [k * (x + (i ? 0.03 : -0.03)), -HF / 2, BAFFLE_Z - 0.02], { segments: 8 })));
  });
  g.userData.anchor = [(PORT_X[0] + PORT_X[1]) / 2, -0.7, BAFFLE_Z];
  add('ports', g, zero, zero, featured);
}

// Horn and mids: two walls flare from the waveguide's mouth out to the baffle, 90° apart; two
// 6.5-inch mids sit in each wall and fire into the horn. The left side is the right one mirrored.
// The walls belong to the waveguide's part (built below); the mids are a part of their own.
const midCones = [];
const hornWalls = new THREE.Group();
{
  const p0 = new THREE.Vector2(MOUTH.half, GUIDE_Z), p1 = new THREE.Vector2(HORN_X, BAFFLE_Z);
  const u = p1.clone().sub(p0), L = u.length(); u.normalize();
  const n = v3(-u.y, 0, u.x); // into the horn
  const MID_U = L / 2, MID_Y = [-1.04, -2.56];
  const wall = new THREE.Shape();
  wall.moveTo(0, -3.3); wall.lineTo(L, -3.3); wall.lineTo(L, -0.3); wall.lineTo(0, -0.3); wall.closePath();
  MID_Y.forEach(y => wall.holes.push(new THREE.Path().absarc(MID_U, y, 0.62, 0, Math.PI * 2, true)));
  const wallMesh = new THREE.Mesh(new THREE.ExtrudeGeometry(wall, { depth: 0.1, bevelEnabled: false, curveSegments: 24 }), M.horn);
  wallMesh.rotation.y = -Math.atan2(u.y, u.x);
  wallMesh.position.set(p0.x, 0, p0.y).addScaledVector(n, -0.1);
  const right = new THREE.Group().add(wallMesh), left = right.clone(); left.scale.x = -1;
  hornWalls.add(right, left);

  const side = new THREE.Group();
  MID_Y.forEach(y => {
    const m = toward(new THREE.Group(), n); m.position.set(p0.x + u.x * MID_U, y, p0.y + u.y * MID_U).addScaledVector(n, -0.1); side.add(m);
    m.add(lathe([[0.6, 0.06], [0.74, 0.06], [0.74, 0], [0.6, 0], [0.6, 0.06]], M.basket, { segments: 40 }));
    const s = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.045, 6, 40), M.rubber); s.rotation.x = Math.PI / 2; m.add(s);
    const cone = new THREE.Group(); cone.userData.cone = true; m.add(cone);
    cone.add(lathe([[0.2, -0.4], [0.38, -0.26], [0.53, -0.11], [0.58, -0.02]], M.midPaper, { segments: 40 }));
    cone.add(lathe([[0.001, -0.25], [0.12, -0.27], [0.21, -0.36]], M.cap, { segments: 24 }));
    m.add(cylinder(0.45, 0.25, 0.3, M.basket, [0, -0.32, 0], { segments: 24, open: true }));
    m.add(cylinder(0.33, 0.33, 0.24, M.neo, [0, -0.6, 0], { segments: 24 }));
  });
  const mirrored = side.clone(); mirrored.scale.x = -1;
  const g = new THREE.Group().add(side, mirrored);
  g.traverse(o => { if (o.userData.cone) midCones.push(o); });
  g.userData.anchor = [p0.x + u.x * MID_U - 0.1, MID_Y[0], p0.y + u.y * MID_U + 0.1];
  add('mids', g, zero, v3(0, 0, 0.6), featured);
}

// Waveguide: each throat is a 36 mm circle; the guide stretches it into half of a tall, narrow
// slot while keeping every path the same length. Drawn as a thin shell, open at both ends.
function guideHalf(throatY, top, bottom) {
  const N = 40, S = 18, pos = [], index = [];
  for (let j = 0; j <= S; j++) {
    const { a, b, cy, z, n } = guideAt(j / S, throatY, top, bottom);
    for (let i = 0; i <= N; i++) {
      const t = i / N * Math.PI * 2, c = Math.cos(t), s = Math.sin(t);
      pos.push(a * Math.sign(c) * Math.abs(c) ** (2 / n), cy + b * Math.sign(s) * Math.abs(s) ** (2 / n), z);
    }
  }
  for (let j = 0; j < S; j++) for (let i = 0; i < N; i++) {
    const k = j * (N + 1) + i;
    index.push(k, k + N + 1, k + 1, k + 1, k + N + 1, k + N + 2);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(index); geo.computeVertexNormals();
  return geo;
}
// The cross-section s of the way from throat (0) to mouth (1): half-width a, half-height b,
// centre height cy, depth z and how square it is (n = 2 is an ellipse).
function guideAt(s, throatY, top, bottom) {
  const e = smooth(s);
  return {
    a: THROAT_R + (MOUTH.half - THROAT_R) * s, b: THROAT_R + ((top - bottom) / 2 - THROAT_R) * e,
    cy: throatY + ((top + bottom) / 2 - throatY) * e, z: THROAT_Z + (GUIDE_Z - THROAT_Z) * s, n: 2 + 6 * s,
  };
}
{
  const g = new THREE.Group();
  g.add(new THREE.Mesh(guideHalf(THROATS[0], MOUTH.top, MOUTH.mid), M.guide));
  g.add(new THREE.Mesh(guideHalf(THROATS[1], MOUTH.mid, MOUTH.bottom), M.guide));
  // The mouth flange, and the round flange each driver bolts to.
  const f = roundedRect(0.9, MOUTH.top - MOUTH.bottom + 0.2, 0.06, 0, (MOUTH.top + MOUTH.bottom) / 2);
  f.holes.push(roundedRect(2 * MOUTH.half, MOUTH.top - MOUTH.bottom, 0.02, 0, (MOUTH.top + MOUTH.bottom) / 2, new THREE.Path()));
  const flange = new THREE.Mesh(new THREE.ExtrudeGeometry(f, { depth: 0.08, bevelEnabled: false }), M.guide); flange.position.z = GUIDE_Z - 0.08; g.add(flange);
  THROATS.forEach(y => g.add(alongZ(cylinder(0.5, 0.5, 0.1, M.guide, [0, y, THROAT_Z + 0.05], { segments: 32 }))));
  g.add(hornWalls);
  cutaway(g);
  g.userData.anchor = [0, MOUTH.mid, GUIDE_Z];
  add('waveguide', g, zero, zero, featured);
}

// Compression drivers: a phase plug at the front, the titanium dome and its coil, then the magnet.
const domes = [];
{
  const front = new THREE.Group(), dome = new THREE.Group(), motor = new THREE.Group();
  THROATS.forEach(y => {
    const at = v3(0, y, THROAT_Z);
    const f = toward(new THREE.Group(), v3(0, 0, -1)); f.position.copy(at); front.add(f);
    f.add(cylinder(0.58, 0.58, 0.12, M.alu, [0, 0.06, 0], { segments: 40 }));
    f.add(cylinder(0.42, 0.42, 0.1, M.dark, [0, 0.17, 0], { segments: 40 }));
    [0.13, 0.27].forEach(r => { const slot = new THREE.Mesh(new THREE.TorusGeometry(r, 0.025, 6, 40), M.steel); slot.rotation.x = Math.PI / 2; slot.position.y = 0.225; f.add(slot); });
    const d = toward(new THREE.Group(), v3(0, 0, -1)); d.position.copy(at); dome.add(d);
    const moving = new THREE.Group(); d.add(moving); domes.push(moving);
    moving.add(lathe([[0.001, 0.24], [0.2, 0.26], [0.33, 0.3], [0.38, 0.34]], M.titanium, { segments: 40 }));
    moving.add(lathe([[0.38, 0.34], [0.46, 0.33]], M.titanium, { segments: 40 }));
    moving.add(cylinder(0.38, 0.38, 0.13, M.copper, [0, 0.41, 0], { segments: 40, open: true }));
    const m = toward(new THREE.Group(), v3(0, 0, -1)); m.position.copy(at); motor.add(m);
    m.add(lathe([[0.42, 0.36], [0.58, 0.36], [0.58, 0.86], [0.42, 0.86], [0.42, 0.36]], M.neo, { segments: 40 }));
    m.add(lathe([[0.001, 0.44], [0.34, 0.44], [0.34, 0.86], [0.001, 0.86]], M.iron, { segments: 32 }));
    m.add(lathe([[0.001, 0.98], [0.42, 0.97], [0.56, 0.9], [0.59, 0.86], [0.001, 0.86]], M.alu, { segments: 40 }));
    m.add(box([0.4, 0.2, 0.22], M.dark, [0.45, 0.8, 0], 0.04));
  });
  front.userData.anchor = [0, THROATS[0] + 0.45, THROAT_Z - 0.1];
  add('driver', front, zero, v3(0, 0, -0.4), featured);
  dome.userData.anchor = [0, THROATS[0] + 0.3, THROAT_Z - 0.3];
  add('dome', dome, zero, v3(0, 0, -1.6), featured);
  motor.userData.anchor = [0, THROATS[1] - 0.5, THROAT_Z - 0.7];
  add('driverMotor', motor, zero, v3(0, 0, -3.2), featured);
}

// The amplifier rack, beside the stage on the floor: a processor with the crossover on its
// screen, three four-channel amplifiers (one for each band) and a power unit, in a road case on wheels.
const RACK = { x: 26, z: -24, turn: 0.95 };
const leds = { mesh: null, color: new THREE.Color() };
const screens = {};
const rackPose = new THREE.Object3D();
rackPose.position.set(RACK.x, 0, RACK.z); rackPose.rotation.y = RACK.turn; rackPose.updateMatrixWorld();
{
  const g = new THREE.Group(); g.position.copy(rackPose.position); g.rotation.copy(rackPose.rotation);
  const CW = 6.4, CH = 5.2, CD = 7;
  [-1, 1].forEach(s => g.add(box([0.25, CH, CD], M.case, [s * (CW / 2 - 0.125), CH / 2 + 0.6, 0], 0.03)));
  g.add(box([CW, 0.25, CD], M.case, [0, CH + 0.6 - 0.125, 0], 0.03));
  g.add(box([CW, 0.6, CD], M.case, [0, 0.9, 0], 0.03));
  g.add(box([CW - 0.5, CH - 0.5, 0.2], M.case, [0, CH / 2 + 0.6, -CD / 2 + 0.1], 0.02));
  [[-1, -1], [-1, 1], [1, -1], [1, 1]].forEach(([sx, sz]) => {
    g.add(box([0.3, CH, 0.3], M.brushed, [sx * CW / 2, CH / 2 + 0.6, sz * CD / 2], 0.04));
    g.add(alongX(cylinder(0.32, 0.32, 0.25, M.rubber, [sx * (CW / 2 - 0.6), 0.32, sz * (CD / 2 - 0.6)], { segments: 16 })));
  });
  // Units, top to bottom: processor, three amplifiers and power, 2U each. 1U = 4.45 cm.
  const unit = 0.445, faceZ = CD / 2 - 0.35;
  let y = CH + 0.6 - 0.5;
  const rows = [{ h: 2, kind: 'dsp' }, { h: 2, band: 'woofers' }, { h: 2, band: 'mids' }, { h: 2, band: 'highs' }, { h: 2, kind: 'power' }];
  const ledSpots = [];
  rows.forEach(r => {
    const h = r.h * unit; y -= h;
    g.add(box([CW - 0.6, h - 0.04, 0.12], M.face, [0, y + h / 2, faceZ], 0.02));
    g.add(box([CW - 1, h - 0.1, 5.4], M.dark, [0, y + h / 2, faceZ - 2.8], 0.02));
    [-1, 1].forEach(s => g.add(box([0.12, h * 0.7, 0.35], M.brushed, [s * (CW / 2 - 0.65), y + h / 2, faceZ + 0.2], 0.04)));
    if (r.band) for (let ch = 0; ch < 4; ch++) for (let k = 0; k < 5; k++) ledSpots.push({ band: r.band, k, p: v3(-1.6 + ch * 0.32, y + 0.17 + k * 0.12, faceZ + 0.07) });
    if (r.kind === 'dsp' || r.band) {
      const key = r.kind === 'dsp' ? 'dsp' : r.band;
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(r.kind === 'dsp' ? 2.2 : 1.0, h * 0.62), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }));
      screen.position.set(r.kind === 'dsp' ? 0.6 : 1.2, y + h / 2, faceZ + 0.065); screens[key] = screen;
    }
  });
  g.userData.anchor = [-1.2, CH, CD / 2]; // in the rack's own frame (the part object is the rack)
  add('amps', g, zero, zero);
  // LEDs and screens light themselves, so they stay out of the parts' focus styling.
  leds.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.2, 0.08, 0.03), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), ledSpots.length);
  ledSpots.forEach((l, i) => { leds.mesh.setMatrixAt(i, new THREE.Matrix4().makeTranslation(l.p.x, l.p.y, l.p.z)); leds.mesh.setColorAt(i, leds.color.setRGB(0, 0, 0)); });
  leds.spots = ledSpots; g.add(leds.mesh);
  Object.values(screens).forEach(sc => g.add(sc));
}

// The processor's screen: the three crossover filters, with the band now playing filled in.
const BAND_COLORS = { woofers: 0xd9783a, mids: 0xd6a44a, highs: 0x4fb3e6 };
const screenTex = {};
{
  const keys = ['woofers', 'mids', 'highs'];
  const fx = hz => 6 + 244 * Math.log(hz / 30) / Math.log(20000 / 30);
  const curve = (g, lo, hi, fill, stroke) => {
    g.beginPath();
    for (let x = 6; x <= 250; x++) {
      const hz = 30 * (20000 / 30) ** ((x - 6) / 244);
      const l = lo ? 1 / Math.sqrt(1 + (lo / hz) ** 8) : 1, h = hi ? 1 / Math.sqrt(1 + (hz / hi) ** 8) : 1;
      const yy = 86 - 66 * l * h;
      if (x === 6) g.moveTo(x, yy); else g.lineTo(x, yy);
    }
    if (fill) { g.lineTo(250, 86); g.lineTo(6, 86); g.closePath(); g.fillStyle = fill; g.fill(); }
    else { g.strokeStyle = stroke; g.lineWidth = 2.5; g.stroke(); }
  };
  const range = { woofers: [0, CROSSOVER.low], mids: [CROSSOVER.low, CROSSOVER.high], highs: [CROSSOVER.high, 0] };
  for (const on of keys) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 96;
    const g = c.getContext('2d');
    g.fillStyle = '#0c1620'; g.fillRect(0, 0, 256, 96);
    g.strokeStyle = 'rgba(124,200,242,.18)'; g.lineWidth = 1;
    [100, 1000, 10000].forEach(hz => { g.beginPath(); g.moveTo(fx(hz), 10); g.lineTo(fx(hz), 88); g.stroke(); });
    const hex = n => `#${n.toString(16).padStart(6, '0')}`;
    keys.forEach(k => { if (k === on) curve(g, ...range[k], hex(BAND_COLORS[k]) + '88'); curve(g, ...range[k], null, hex(BAND_COLORS[k])); });
    const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; screenTex[on] = t;
  }
}
// The amplifiers' small screens: their band's colour while it plays.
const ampScreen = key => screens[key]?.material;

// Cable: from the back of the rack along the floor, up a line 3 m behind the hang to the truss,
// along the truss and down past the rear motor to the flying frame, then down the back of the
// hang to the featured box. Rebuilt when the hang moves.
const cableMesh = new THREE.Mesh(new THREE.BufferGeometry(), M.rubber);
const CABLE_RUN = { x: 1.6, z: -30, y: 110 }; // the vertical run, and the height along the truss's bottom chords
const cable = { path: null };
{
  const g = new THREE.Group(); g.add(cableMesh);
  g.userData.anchor = [CABLE_RUN.x, 40, CABLE_RUN.z];
  add('cable', g, zero, zero);
}
function buildCable(poses, bench = 0) {
  const { x, z, y } = CABLE_RUN, drop = PICKS[1].z - 1.6; // behind the rear motor
  const pts = [
    rackPose.localToWorld(v3(0, 4.6, -3.6)), rackPose.localToWorld(v3(0, 3, -4.4)), rackPose.localToWorld(v3(0, 0.4, -5.4)),
    v3(x + 5, 0.4, z + 1), v3(x, 1.5, z), v3(x, 20, z), v3(x, y - 1.5, z), v3(x, y, z + 2),
    v3(x, y, drop - 2), v3(x, y - 1.5, drop), v3(x, PICKS[1].y + 2, drop), v3(x + 1, PICKS[1].y - 1, drop + 0.4),
  ];
  const o = new THREE.Object3D();
  poses.forEach((b, i) => {
    if (i === FEAT) { o.position.copy(featured.position); o.quaternion.copy(featured.quaternion); } else poseOf(b, o);
    o.updateMatrixWorld();
    const back = o.localToWorld(v3(PLUG_X + 0.6, -HF / 2, -D - 0.6));
    // With the featured box on the floor, the cable drops from the box above it and runs along the floor.
    if (i === FEAT && bench > 0) [v3(PLUG_X + 0.6, 0.4, -8), v3(PLUG_X + 0.6, 0.3, 2)].forEach(p => pts.push(p.lerp(back, 1 - bench)));
    if (i % 2 === 0 || i === FEAT) pts.push(back);
  });
  pts.push(o.localToWorld(v3(PLUG_X + 0.55, -HF / 2 - 0.2, -D - 0.25)));
  cable.path = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  cableMesh.geometry.dispose();
  cableMesh.geometry = new THREE.TubeGeometry(cable.path, 260, 0.22, 8, false);
}

// The crowd: about 460 people from 5 m to 40 m in front of the hang, 20 m wide. Their colour
// shows the level they hear in the last step.
const people = [];
{
  const body = new THREE.LatheGeometry([[0, 0], [1.5, 0], [1.75, 1], [1.95, 8], [2.15, 12.2], [1.7, 13.6], [0.75, 14.1], [0.8, 14.7], [1.1, 15.6], [1.0, 16.6], [0.45, 17], [0, 17.05]].map(([r, y]) => new THREE.Vector2(r, y)), 14);
  let seed = 7;
  const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let z = HANG.front * U; z <= HANG.back * U; z += 12) for (let x = -95; x <= 95; x += 12) {
    people.push({ x: x + (rand() - 0.5) * 7, z: z + (rand() - 0.5) * 7, s: 0.9 + rand() * 0.18, turn: rand() * 6.28 });
  }
  const mesh = new THREE.InstancedMesh(body, M.person, people.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), base = linear(0x737d88);
  people.forEach((p, i) => {
    q.setFromAxisAngle(Y, p.turn); s.setScalar(p.s);
    mesh.setMatrixAt(i, m.compose(v3(p.x, 0, p.z), q, s)); mesh.setColorAt(i, base);
  });
  const g = new THREE.Group(); g.add(mesh);
  g.userData.anchor = [-20, EAR, 140];
  add('crowd', g, zero, zero);
  people.mesh = mesh;
}

// ---------- Effects ----------
const dot = softDot();
// Signal: dots running up the cable in the colour of the band now playing.
const signal = createParticles(scene, 46, { size: 1.6, map: dot, seed: i => ({ u: i / 46 }) });
signal.points.frustumCulled = false;
// Port air: puffs in and out of both port mouths.
const air = createParticles(scene, 90, { color: linear(BAND_COLORS.woofers).getHex(), size: 0.22, map: dot, seed: i => ({ k: i % 2 ? 1 : -1, x: PORT_X[0] + 0.05 + Math.random() * 0.35, y: -3.1 + Math.random() * 2.6, z: BAFFLE_Z - 2.4 + Math.random() * 3.2 }) });
featured.add(air.points); air.points.frustumCulled = false;

// Wavefronts in the waveguide: two domes leave the throats, flatten and join at the mouth, then
// the horn spreads the flat strip 90° wide. Three ripples are in flight at once.
const waveMat = new THREE.MeshBasicMaterial({ color: linear(BAND_COLORS.highs), transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
const GRID = { across: 6, down: 12, arc: 18 };
const grid = (cols, rows) => {
  const geo = new THREE.PlaneGeometry(1, 1, cols, rows);
  const mesh = new THREE.Mesh(geo, waveMat.clone()); mesh.userData.noContactShadow = true; mesh.frustumCulled = false; mesh.visible = false;
  return mesh;
};
const guideWaves = Array.from({ length: 3 }, () => {
  const w = { halves: [grid(GRID.across, GRID.down), grid(GRID.across, GRID.down)], strip: grid(GRID.arc, GRID.down * 2) };
  w.halves.forEach(h => featured.add(h)); featured.add(w.strip);
  return w;
});
const GUIDE_LEN = GUIDE_Z - THROAT_Z, OUT_LEN = 11;
function placeGuideWave(w, d, alpha) {
  // d: path length from the throats. Inside the guide, each half is a dome that flattens;
  // past the mouth, one flat strip on an arc around the slot.
  const inside = d < GUIDE_LEN;
  w.halves.forEach((h, k) => {
    h.visible = inside && alpha > 0.01;
    if (!h.visible) return;
    const s = d / GUIDE_LEN, top = k ? MOUTH.mid : MOUTH.top, bottom = k ? MOUTH.bottom : MOUTH.mid;
    const { a, b, cy, z } = guideAt(s, THROATS[k], top, bottom);
    const bow = 0.55 * Math.sin(Math.PI * Math.min(1, s * 1.15)) * (1 - s) + 0.12 * (1 - s); // a dome that flattens to the mouth
    const p = h.geometry.attributes.position;
    for (let r = 0; r <= GRID.down; r++) for (let c = 0; c <= GRID.across; c++) {
      const vy = r / GRID.down * 2 - 1, vx = c / GRID.across * 2 - 1;
      p.setXYZ(r * (GRID.across + 1) + c, vx * a * 0.92, cy + vy * b * 0.96, z + bow * (1 - vy * vy) * Math.min(1, b));
    }
    p.needsUpdate = true; h.material.opacity = alpha;
  });
  const out = d - GUIDE_LEN;
  w.strip.visible = !inside && out < OUT_LEN && alpha > 0.01;
  if (!w.strip.visible) return;
  const p = w.strip.geometry.attributes.position, rows = GRID.down * 2;
  for (let r = 0; r <= rows; r++) for (let c = 0; c <= GRID.arc; c++) {
    const y = MOUTH.top + (MOUTH.bottom - MOUTH.top) * r / rows, phi = deg(45) * (c / GRID.arc * 2 - 1);
    p.setXYZ(r * (GRID.arc + 1) + c, MOUTH.half * Math.sign(phi) + out * Math.sin(phi), y, GUIDE_Z + out * Math.cos(phi));
  }
  p.needsUpdate = true; w.strip.material.opacity = alpha * (1 - out / OUT_LEN);
}

// Wavefronts from the whole hang: one sheet that leaves every box along its own aim and spreads
// 90° wide, so it is a curved, tall strip of a cylinder. Three are in flight; they meet the floor
// where the crowd stands.
const LINE_ROWS = HANG.boxes * 3, LINE_COLS = 28, LINE_RANGE = 470, LINE_SPEED = 62;
const lineWaves = Array.from({ length: 3 }, () => {
  const m = grid(LINE_COLS, LINE_ROWS); m.material.color.copy(linear(0xd9783a)); root.add(m); return m;
});
function placeLineWave(mesh, poses, rho, alpha) {
  mesh.visible = alpha > 0.01; if (!mesh.visible) return;
  const p = mesh.geometry.attributes.position, d = new THREE.Vector3(), e = new THREE.Euler();
  for (let r = 0; r <= LINE_ROWS; r++) {
    // Position down the front of the hang, and the aim there (blended between box centres).
    const f = r / LINE_ROWS * HANG.boxes, i = Math.min(HANG.boxes - 1, Math.floor(f)), t = f - i;
    const b = poses[i], a0 = deg(b.aim);
    const y0 = (b.top[0] - BOX.height * Math.cos(a0) * t) * U, z0 = (b.top[1] - BOX.height * Math.sin(a0) * t) * U;
    const nb = t < 0.5 ? poses[Math.max(0, i - 1)] : poses[Math.min(HANG.boxes - 1, i + 1)];
    const aim = a0 + (deg(nb.aim) - a0) * Math.abs(t - 0.5);
    e.set(aim, 0, 0);
    for (let c = 0; c <= LINE_COLS; c++) {
      const phi = deg(45) * (c / LINE_COLS * 2 - 1);
      d.set(Math.sin(phi), 0, Math.cos(phi)).applyEuler(e).multiplyScalar(rho);
      p.setXYZ(r * (LINE_COLS + 1) + c, d.x, Math.max(0.4, y0 + d.y), z0 + d.z);
    }
  }
  p.needsUpdate = true; mesh.material.opacity = alpha;
}

// Coverage beams: each box's 10° slice, from its grille down to ear height.
const beams = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
beams.userData.noContactShadow = true; beams.frustumCulled = false; root.add(beams);
{
  const pos = new Float32Array(HANG.boxes * 9), col = new Float32Array(HANG.boxes * 9);
  const a = linear(0xd9783a), b = linear(0xd6a44a);
  for (let i = 0; i < HANG.boxes; i++) for (let k = 0; k < 3; k++) {
    const c = i % 2 ? b : a, fade = k ? 0.35 : 1;
    col.set([c.r * fade, c.g * fade, c.b * fade], i * 9 + k * 3);
  }
  beams.geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  beams.geometry.setAttribute('color', new THREE.BufferAttribute(col, 3));
}
const BEAM_END = (HANG.back + 6) * U;
function placeBeams(poses) {
  const p = beams.geometry.attributes.position;
  poses.forEach((b, i) => {
    const y = b.center[0] * U, z = b.center[1] * U;
    p.setXYZ(i * 3, 0, y, z);
    // To ear height, or to just past the back of the crowd for the beams that aim further.
    [-5, 5].forEach((off, k) => {
      const a = deg(b.aim + off), reach = Math.min((y - EAR) / Math.tan(a), BEAM_END - z);
      p.setXYZ(i * 3 + 1 + k, 0, y - reach * Math.tan(a), z + reach);
    });
  });
  p.needsUpdate = true;
}

// Light that adds up glows on the dark theme but washes out to white on the light one, so there
// the waves and beams are tinted sheets, a little fainter.
const GLOW = { k: 1 };
onThemeChange(theme => {
  const dark = theme === 'dark';
  GLOW.k = dark ? 1 : 0.6;
  [beams, ...lineWaves, ...guideWaves.flatMap(w => [...w.halves, w.strip])].forEach(m => {
    m.material.blending = dark ? THREE.AdditiveBlending : THREE.NormalBlending; m.material.needsUpdate = true;
  });
});

// ---------- State and UI ----------
const state = { step: 0, explode: 0, targetExplode: 0, playing: true, focus: [], cut: false, bench: false, mode: 'hang', t: 0, pitch: 5, sweep: false, waves: false };
const shown = { open: 1, bench: 0, phase: 0, clock: 0, band: '', pitch: -1 };
let camGoal = null;
// The views are framed for a desktop stage (about 1.15 wide to 1 high). A narrower stage pulls
// the camera back; on phones the title and buttons cover the top and bottom, so the model sits lower.
function fit() {
  const c = stage.renderer.domElement, a = c.clientWidth / Math.max(1, c.clientHeight);
  const small = globalThis.matchMedia?.('(max-width: 800px)').matches;
  return { zoom: Math.min(1.8, Math.max(1, 1.15 / a)) * (small ? 1.2 : 1), lift: small ? 0.06 : 0 };
}
const pitchInput = document.getElementById('pitch');
function setPitch(i) {
  state.pitch = Math.max(0, Math.min(PITCHES.length - 1, Math.round(i)));
  pitchInput.value = String(state.pitch);
  showRange(pitchInput, pitchText(PITCHES[state.pitch]));
}
const story = createStoryUI({
  story: SPEAKER_STORY, state,
  onStep: s => {
    state.focus = s.focus; state.cut = s.cut; state.bench = s.cut === true; state.mode = s.mode; state.t = 0; state.waves = !!s.waves;
    state.sweep = s.mode === 'sweep';
    setPitch(s.pitch);
    const v = VIEWS[s.view], f = fit(), r = v.r * f.zoom;
    camGoal = { ...v, r, target: new THREE.Vector3(...v.target).add(v3(0, r * f.lift, 0)) };
    cam.theta = v.theta + THREE.MathUtils.euclideanModulo(cam.theta - v.theta + Math.PI, 2 * Math.PI) - Math.PI; // the short way round
  },
});
// Dragging the slider takes over from the sweep.
bindRange('pitch', v => { state.sweep = false; setPitch(v); });
createCallouts(stage, { parts, state, story: SPEAKER_STORY });

const clears = name => state.cut === true || (Array.isArray(state.cut) && state.cut.includes(name));
const focusStyle = {
  highlight: 0.16,
  opacity(name, mesh, hot) {
    if (name === 'crowd' && state.bench) return 0; // the close-ups on the floor box look past it
    let alpha = 1;
    if (mesh.userData.cutaway && clears(name)) alpha = hot ? 0.3 : 0.1;
    if (state.focus.length && !hot && (state.cut === true || state.explode > 0.12)) alpha = Math.min(alpha, 0.26);
    return alpha;
  },
};

// ---------- Readout ----------
const $ = id => document.getElementById(id);
const R = { box: $('readout'), pitch: $('r-pitch'), wave: $('r-wave'), driver: $('r-driver'), travel: $('r-travel') };
function showReadout(hz, t) {
  const d = DRIVERS[t.key], over = t.x * 1000 > d.xmax;
  R.pitch.textContent = pitchText(hz);
  R.wave.textContent = lengthText(wavelength(hz));
  R.driver.textContent = d.name;
  R.travel.textContent = travelText(t.x) + (over ? ` (limit ±${d.xmax})` : '');
  R.box.dataset.band = t.key;
  R.box.classList.toggle('over', over);
}

// ---------- Sound ----------
// The tone the hang is playing (a soft triangle wave, so low notes are still heard on a laptop),
// a click as each pin takes its angle, and a knock when the hang has opened.
const tone = sound.loop({ type: 'tone', wave: 'triangle', freq: 125 });
const was = { pins: 0, open: 1 };
function playSounds(hz, open) {
  tone.set(state.playing ? 0.026 * (hz > 2000 ? 0.45 : 1) : 0, hz);
  const pins = Math.floor(open * (HANG.boxes - 1) + 1e-6);
  if (state.playing && pins > was.pins && open > was.open) sound.click(0.12);
  if (open >= 1 && was.open < 1) sound.thunk(0.22);
  was.pins = pins; was.open = open;
}

// ---------- Frame ----------
const snap = reduced || stage.capture; // ?capture renders stills, so it skips every ease
const tmp = new THREE.Vector3(), color = new THREE.Color();
const COLD = linear(0x2c5a8c), WARM = linear(0xd9783a), MID = linear(0xd6a44a), BASE = linear(0x737d88);
// The loudest anyone hears with the full J: the top of the crowd's colour scale.
const COVER_TOP = Math.max(...people.map(p => coverage(p.z / U, p.x / U, FULL)));
const BAND_LINEAR = Object.fromEntries(Object.entries(BAND_COLORS).map(([k, hex]) => [k, linear(hex)]));
let poses = FULL, readoutTimer = 0, crowdLit = false;
const posed = { open: -1, bench: -1 }, inHang = new THREE.Object3D();
// Poses every box for a hang opened by `open`, with the featured box `bench` of the way to the
// floor. Returns whether the hang itself moved.
function poseHang(open, bench) {
  const opened = Math.abs(open - posed.open) > 1e-4;
  if (!opened && Math.abs(bench - posed.bench) < 1e-4) return false;
  if (opened) poses = hang(open);
  posed.open = open; posed.bench = bench;
  const k = smooth(bench);
  poseOf(poses[FEAT], inHang);
  holders.forEach((list, i) => list.forEach(o => {
    if (i !== FEAT) { poseOf(poses[i], o); return; }
    o.position.lerpVectors(inHang.position, benchPose.position, k);
    o.quaternion.slerpQuaternions(inHang.quaternion, benchPose.quaternion, k);
  }));
  buildCable(poses, k);
  return opened;
}
// How open the hang is in each mode: it opens once in the first step, and opens and closes
// on a loop in the last, so the crowd's colours show what the J does.
function openFor(mode, t) {
  if (snap) return 1;
  if (mode === 'hang') return smooth(clamp01((t - 0.6) / 3.2));
  if (mode === 'cover') { const c = t % 11; return c < 1.5 ? 0 : c < 4.5 ? smooth((c - 1.5) / 3) : c < 10 ? 1 : 1 - smooth(c - 10); }
  return 1;
}
startLoop(stage, dt => {
  update(state, focusStyle, snap ? 1 : 0.09, dt);
  people.mesh.visible = people.mesh.material.opacity > 0.01; // hidden, it casts no shadow either
  if (camGoal) { // ease to the step's view once; after that the reader's own zoom wins
    const k = snap ? 1 : Math.min(1, dt * 2.6);
    for (const a of ['r', 'theta', 'phi']) cam[a] += (camGoal[a] - cam[a]) * k;
    cam.target.lerp(camGoal.target, k);
    if (Math.abs(camGoal.r - cam.r) < 0.5 && Math.abs(camGoal.theta - cam.theta) < 0.01 && cam.target.distanceTo(camGoal.target) < 0.2) camGoal = null;
  }
  if (state.playing) { state.t += dt; shown.clock += dt; }
  // The sweep walks the pitch up and down the slider: 40 Hz to 16 kHz and back in 14 s.
  if (state.sweep && state.playing) { const c = (state.t / 14) % 1; setPitch((c < 0.5 ? c * 2 : 2 - c * 2) * (PITCHES.length - 1)); }
  const hz = PITCHES[state.pitch], t = travel(hz);

  // The hang: open toward the J, and everything that follows it.
  const target = openFor(state.mode, state.t);
  shown.open += (target - shown.open) * (snap || state.mode === 'hang' || state.mode === 'cover' ? 1 : Math.min(1, dt * 3));
  shown.bench += ((state.bench ? 1 : 0) - shown.bench) * (snap ? 1 : Math.min(1, dt * 1.6));
  const moved = poseHang(shown.open, shown.bench);

  // Drivers: the band now playing moves at a slowed-down stand-in for its pitch. The strokes are
  // drawn larger than life (about 60× for the woofers); the readout gives the real travel.
  if (state.playing) shown.phase += dt * showHz(hz) * Math.PI * 2;
  const wave = Math.sin(shown.phase);
  const woof = t.key === 'woofers' ? Math.min(t.x, DRIVERS.woofers.xmax / 1000) * 60 : 0;
  cones.forEach(c => { c.position.y = woof * wave; });
  coils.forEach(c => { c.position.y = woof * wave; });
  const mid = t.key === 'mids' ? Math.min(0.3, t.x * 300) : 0;
  midCones.forEach(c => { c.position.y = mid * wave; });
  const hi = t.key === 'highs' ? 0.035 : 0;
  domes.forEach(d => { d.position.y = hi * Math.sin(shown.phase * 3); });

  // Port air: in and out with the cone; the stroke follows the port's air speed.
  const portStroke = Math.min(1.1, t.port / 18);
  if (air.fade(t.port > 0.6 && !state.waves ? 0.9 : 0, Math.min(1, dt * 6))) {
    air.material.size = 0.22 + 0.1 * portStroke;
    air.seeds.forEach((s, i) => {
      const z = s.z + portStroke * wave * 1.1;
      air.place(i, s.k * s.x, s.y, Math.min(BAFFLE_Z + 1.6, Math.max(BAFFLE_Z - 2.5, z)));
    });
    air.commit();
  }

  // Wavefronts through the waveguide, while the highs play in the steps that look at them.
  const showGuide = state.waves && t.key === 'highs';
  guideWaves.forEach((w, i) => {
    const d = (shown.clock * 4.2 + i / 3 * (GUIDE_LEN + OUT_LEN)) % (GUIDE_LEN + OUT_LEN);
    placeGuideWave(w, d, showGuide && !reduced ? 0.55 * GLOW.k : 0);
  });

  // Wavefronts from the whole hang, in the last two steps.
  const showLine = (state.mode === 'line' || state.mode === 'cover') && !reduced;
  lineWaves.forEach((m, i) => {
    const rho = ((state.t * LINE_SPEED) + i * LINE_RANGE / 3) % LINE_RANGE;
    placeLineWave(m, poses, rho, showLine ? 0.32 * GLOW.k * Math.min(1, rho / 20) * (1 - rho / LINE_RANGE) : 0);
  });

  // Coverage: beams to ear height, and every listener tinted by the level they hear.
  const cover = state.mode === 'cover';
  beams.material.opacity += ((cover ? 0.5 * GLOW.k : 0) - beams.material.opacity) * (snap ? 1 : Math.min(1, dt * 4));
  beams.visible = beams.material.opacity > 0.01;
  if (beams.visible) placeBeams(poses);
  if (cover && (moved || !crowdLit)) {
    people.forEach((p, i) => {
      const k = clamp01(1 + (coverage(p.z / U, p.x / U, poses) - COVER_TOP) / 18);
      color.copy(COLD).lerp(MID, clamp01(k * 1.6)).lerp(WARM, clamp01(k * 1.6 - 0.6));
      people.mesh.setColorAt(i, color);
    });
    people.mesh.instanceColor.needsUpdate = true; crowdLit = true;
  } else if (!cover && crowdLit) {
    people.forEach((_, i) => people.mesh.setColorAt(i, BASE));
    people.mesh.instanceColor.needsUpdate = true; crowdLit = false;
  }

  // Signal on the cable: in the first two steps, in the colour of the band now playing.
  const showSignal = (state.mode === 'hang' || state.mode === 'sweep') && cable.path;
  if (signal.fade(showSignal ? 0.95 : 0, Math.min(1, dt * 5)) && cable.path) {
    signal.material.color.copy(BAND_LINEAR[t.key]);
    signal.seeds.forEach((s, i) => {
      if (state.playing) s.u = (s.u + dt * 0.07) % 1;
      cable.path.getPointAt(s.u, tmp); signal.place(i, tmp.x, tmp.y, tmp.z);
    });
    signal.commit();
  }

  // Amplifier LEDs: the band's channels light with the tone; the others idle.
  if (leds.mesh) {
    leds.spots.forEach((l, i) => {
      const on = l.band === t.key ? 0.55 + 0.45 * Math.abs(wave) : 0.06;
      const lit = (l.k + 0.5) / 5 < on;
      leds.mesh.setColorAt(i, lit ? color.setHex(l.k > 3 ? 0xffb340 : 0x46d17a) : color.setHex(0x14301f));
    });
    leds.mesh.instanceColor.needsUpdate = true;
  }
  if (shown.band !== t.key) {
    shown.band = t.key;
    screens.dsp.material.map = screenTex[t.key]; screens.dsp.material.needsUpdate = true;
    ['woofers', 'mids', 'highs'].forEach(k => ampScreen(k).color.setHex(k === t.key ? BAND_COLORS[k] : 0x18222c));
  }

  playSounds(hz, shown.open);
  readoutTimer -= dt;
  if (readoutTimer <= 0 || shown.pitch !== state.pitch) { showReadout(hz, t); readoutTimer = 0.25; shown.pitch = state.pitch; }
});
story.setStep(0, false);
