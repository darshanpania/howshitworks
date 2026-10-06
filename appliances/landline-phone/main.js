import * as THREE from 'three';
import { createStage, addFloor, addStudioLights } from '../../src/engine/stage.js';
import { createParts } from '../../src/engine/parts.js';
import { createCallouts } from '../../src/engine/callouts.js';
import { createStoryUI, bindRange, showRange } from '../../src/engine/story-ui.js';
import { sound } from '../../src/engine/sound.js';
import { startLoop, reducedMotion as reduced } from '../../src/engine/loop.js';
import { box, cylinder, lathe } from '../../src/kit/shapes.js';
import { createMaterials, linear } from '../../src/kit/materials.js';
import { softDot, createParticles } from '../../src/kit/effects.js';
import { PHONE_STORY } from './story.js';
import { LINE, DIAL, PERIOD, holeAngle, loopCurrent, ringPeakMA, voiceLevel, phone } from './line.js';

// ---------- Layout ----------
// Scale: 1 unit = 1 cm. The phone stands on the floor at y = 0 and faces +z. The base is 22 cm
// wide; the handset lies across the cradle along x, with its earpiece at -x and mouthpiece at +x.
// The line cord leaves the back of the base for a wall box at the right rear.
const v3 = (x, y, z) => new THREE.Vector3(x, y, z);
const zero = v3(0, 0, 0);
const deg = THREE.MathUtils.degToRad;
const clamp01 = v => Math.max(0, Math.min(1, v));

// Side profile of the base (z, y), extruded across the width with rounded edges.
const PROFILE = [[-9, 1.6], [9.3, 1.6], [9.9, 3.6], [1.6, 9.8], [-7, 10.3], [-9, 8.6]];
const WIDTH = 22, BEVEL = 1, CRADLE_Z = -3.5;
const topY = z => { const [[z1, y1], [z2, y2]] = [PROFILE[3], PROFILE[4]]; return y1 + (y2 - y1) * (z1 - z) / (z1 - z2) + BEVEL; };
const TOP = topY(CRADLE_Z);
// The dial sits on the sloping front face. n is that face's outward normal (z, y).
const SLOPE = new THREE.Vector2(PROFILE[3][0] - PROFILE[2][0], PROFILE[3][1] - PROFILE[2][1]).normalize();
const N = new THREE.Vector2(SLOPE.y, -SLOPE.x);
const DIAL_C = v3(0, (PROFILE[2][1] + PROFILE[3][1]) / 2 + N.y * (BEVEL + 0.05), (PROFILE[2][0] + PROFILE[3][0]) / 2 + N.x * (BEVEL + 0.05));
const DIAL_N = v3(0, N.y, N.x);
const DIAL_TILT = Math.atan2(-N.y, N.x); // turns the dial's +z onto the face normal
const PLATE_R = 4.4, WHEEL_R = 4.6, HOLE_R = 3.5, HOLE = 0.72;

// Handset poses: on the cradle, and held up with the cups facing the camera.
const ON = { pos: v3(0, 15.6, CRADLE_Z), rot: v3(0, 0, 0) };
const HELD = { pos: v3(-3, 27, 6), rot: v3(-1.15, 0, 0.1) };
const CUP_X = 9.4;
const held = new THREE.Object3D();
held.position.copy(HELD.pos); held.rotation.set(HELD.rot.x, HELD.rot.y, HELD.rot.z); held.updateMatrixWorld();
const MOUTH = held.localToWorld(v3(CUP_X, -2.6, 0)), EAR = held.localToWorld(v3(-CUP_X, -2.6, 0));

const VIEWS = {
  line: { r: 92, theta: 0.42, phi: 1.0, target: [13, 4, -14] },
  ringer: { r: 42, theta: 2.55, phi: 1.05, target: [-1, 4.5, -5.5] },
  hook: { r: 46, theta: 0.6, phi: 1.08, target: [0, 12, -3.5] },
  dial: { r: 36, theta: 1.15, phi: 1.0, target: DIAL_C.clone().addScaledVector(DIAL_N, 1.5).toArray() },
  mouth: { r: 26, theta: 1.45, phi: 1.2, target: MOUTH.toArray() },
  wide: { r: 104, theta: 0.8, phi: 1.02, target: [9, 9, -7] },
  network: { r: 44, theta: 0.95, phi: 0.98, target: [8, 4, 1.5] },
  ear: { r: 26, theta: -1.5, phi: 1.2, target: EAR.toArray() },
};

// ---------- Stage and light ----------
const stage = createStage(document.getElementById('c'), {
  fov: 36, pbr: true, camera: VIEWS.line, zoom: [18, 190], phiLimit: 0.25,
});
const { scene, cam } = stage;
stage.camera.far = 800; stage.camera.updateProjectionMatrix();
// The key light comes from the right, so its glare off the sloping dial face goes to the left,
// away from the camera angles the story uses.
addStudioLights(stage, { key: [40, 62, 28], extent: 48, far: 220, scale: 4 });
addFloor(stage, 0, { size: 150, cell: 2, opacity: 0.12, center: [8, -8], height: 40, blur: 3.5, shadowSize: 80 }); // 2 cm grid

// ---------- Materials ----------
const M = createMaterials({
  shell: { color: 0x8c1d17, metalness: 0, roughness: 0.42, side: THREE.DoubleSide }, // red phone plastic
  wheel: { color: 0x17191c, metalness: 0.1, roughness: 0.32 },
  plate: { color: 0xffffff, roughness: 0.55, map: dialFace() },
  steel: 'steel', brushed: 'brushed', iron: 'iron', copper: 'copper', brass: 'brass', rubber: 'rubber', dark: 'dark',
  gong: { look: 'steel', color: 0xe2e6ea, roughness: 0.14, side: THREE.DoubleSide },
  alu: { look: 'aluminium', color: 0xe4e8ec, side: THREE.DoubleSide },
  carbon: { color: 0x2b2b2e, metalness: 0.2, roughness: 0.75 },
  diaphragm: { color: 0x6b737c, metalness: 0.7, roughness: 0.35 },
  bakelite: { color: 0x3a2a22, roughness: 0.55 },
  ivory: { color: 0xece6da, roughness: 0.5, side: THREE.DoubleSide },
  can: { color: 0x55606b, metalness: 0.5, roughness: 0.45 },
  cap: { color: 0x3e5873, metalness: 0.2, roughness: 0.45 },
}, { pbr: true });

// The number plate under the finger wheel: a digit under each hole and the number card.
function dialFace() {
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const g = c.getContext('2d'), mid = 256, px = 256 / PLATE_R;
  g.fillStyle = '#f4efe4'; g.beginPath(); g.arc(mid, mid, 256, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#1b1a17'; g.font = '700 50px Arial, Helvetica, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  for (let d = 0; d < 10; d++) {
    const a = deg(holeAngle(d)), r = HOLE_R * px;
    g.fillText(String(d), mid + Math.cos(a) * r, mid - Math.sin(a) * r + 2);
  }
  g.fillStyle = '#fbf8f1'; g.beginPath(); g.arc(mid, mid, 1.7 * px, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#b5302a'; g.lineWidth = 7; g.stroke();
  g.fillStyle = '#b5302a'; g.font = '700 34px Arial, Helvetica, sans-serif';
  g.fillText('555', mid, mid - 20); g.fillText('0116', mid, mid + 22);
  const texture = new THREE.CanvasTexture(c); texture.encoding = THREE.sRGBEncoding; texture.anisotropy = 4;
  return texture;
}

// ---------- Helpers ----------
// A polygon with rounded corners, as a Shape.
function roundedPolygon(points, r) {
  const p = points.map(([x, y]) => new THREE.Vector2(x, y)), n = p.length, s = new THREE.Shape();
  const corner = i => {
    const a = p[(i + n - 1) % n], b = p[i], c = p[(i + 1) % n];
    return [b.clone().add(a.clone().sub(b).setLength(Math.min(r, a.distanceTo(b) / 2))), b, b.clone().add(c.clone().sub(b).setLength(Math.min(r, c.distanceTo(b) / 2)))];
  };
  p.forEach((_, i) => {
    const [from, ctl, to] = corner(i);
    if (i === 0) s.moveTo(from.x, from.y); else s.lineTo(from.x, from.y);
    s.quadraticCurveTo(ctl.x, ctl.y, to.x, to.y);
  });
  return s;
}
// A gear or cam outline: `teeth` lobes between radius r and r - depth.
function gearShape(r, teeth, depth) {
  const s = new THREE.Shape(), steps = teeth * 4;
  for (let i = 0; i <= steps; i++) {
    const a = i / steps * Math.PI * 2, rr = i % 4 < 2 ? r : r - depth;
    if (i === 0) s.moveTo(rr * Math.cos(a), rr * Math.sin(a)); else s.lineTo(rr * Math.cos(a), rr * Math.sin(a));
  }
  return s;
}
const flat = (shape, depth, mat, z = 0) => {
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 16 }); geo.translate(0, 0, z - depth / 2);
  return new THREE.Mesh(geo, mat);
};
const alongZ = mesh => { mesh.rotation.x = Math.PI / 2; return mesh; };
const alongX = mesh => { mesh.rotation.z = Math.PI / 2; return mesh; };
// Points on a curve with a wire wound round it: a coiled cord (radius = coil) or one wire of a twisted pair.
function wound(curve, { turns, radius, phase = 0, per = 10 }) {
  const n = Math.max(8, Math.round(turns * per)), frames = curve.computeFrenetFrames(n, false), pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, a = phase + t * turns * Math.PI * 2;
    pts.push(curve.getPointAt(t).addScaledVector(frames.normals[i], Math.cos(a) * radius).addScaledVector(frames.binormals[i], Math.sin(a) * radius));
  }
  return new THREE.CatmullRomCurve3(pts);
}

// ---------- Parts ----------
const root = new THREE.Group(); scene.add(root);
const rig = new THREE.Group(); root.add(rig); // the handset and everything in it
const { parts, add, update } = createParts(root, { shadows: true, lively: true });

// Chassis: the steel base plate everything inside is screwed to, on four rubber feet.
{
  const g = new THREE.Group();
  g.add(box([19.5, 0.25, 18], M.brushed, [0, 0.86, 0.3], 0.08));
  [[-8.6, -7.6], [8.6, -7.6], [-8.6, 8.4], [8.6, 8.4]].forEach(([x, z]) => g.add(cylinder(0.9, 1, 0.6, M.rubber, [x, 0.3, z], { segments: 20 })));
  add('chassis', g, zero, zero);
}

// Housing: the moulded red shell and the two cradle horns the handset rests on.
{
  const g = new THREE.Group();
  const geo = new THREE.ExtrudeGeometry(roundedPolygon(PROFILE, 1.4), {
    depth: WIDTH - 2 * BEVEL, bevelEnabled: true, bevelSize: BEVEL, bevelThickness: BEVEL, bevelSegments: 4, curveSegments: 10,
  });
  geo.rotateY(-Math.PI / 2); geo.translate(WIDTH / 2 - BEVEL, 0, 0); // profile x -> world z, extrusion -> world x
  const shell = new THREE.Mesh(geo, M.shell); shell.userData.cutaway = true; g.add(shell);
  // The cradle: a raised block the plungers come up through, with a horn at each end.
  const cradle = [box([11.6, 3.6, 3.4], M.shell, [0, TOP + 1.3, CRADLE_Z], 0.8)];
  [-1, 1].forEach(s => cradle.push(box([1.8, 4.8, 3.4], M.shell, [s * 5, TOP + 1.9, CRADLE_Z], 0.7)));
  cradle.forEach(m => { m.userData.cutaway = true; g.add(m); });
  g.add(alongX(cylinder(0.55, 0.55, 0.5, M.rubber, [WIDTH / 2 + 0.1, 2.6, -1.5], { segments: 16 }))); // cord grommet
  add('housing', g, zero, v3(0, 12, 0));
}

// Hookswitch: two plungers under the handset, and the contact springs they hold apart.
const plungers = new THREE.Group(), hookSpring = new THREE.Group();
const PL_DOWN = 15.7, HOOK_Y = 9;
{
  const g = new THREE.Group();
  [-1, 1].forEach(s => {
    plungers.add(cylinder(0.75, 0.75, 0.45, M.ivory, [s * 2.4, -0.22, 0], { segments: 24 }));
    plungers.add(cylinder(0.32, 0.32, 6.95, M.ivory, [s * 2.4, -3.47, 0], { segments: 16 }));
  });
  plungers.add(box([5.4, 0.3, 0.6], M.bakelite, [0, -6.2, 0]));
  plungers.position.set(0, PL_DOWN, CRADLE_Z); g.add(plungers);
  g.add(box([1.2, 1.4, 1.4], M.bakelite, [-2.3, HOOK_Y + 0.2, CRADLE_Z]));
  g.add(box([5, 0.1, 0.8], M.brass, [0.8, HOOK_Y + 0.55, CRADLE_Z], 0)); // fixed spring
  g.add(cylinder(0.2, 0.2, 0.12, M.steel, [3, HOOK_Y + 0.44, CRADLE_Z], { segments: 12 }));
  hookSpring.position.set(-1.7, HOOK_Y, CRADLE_Z);
  hookSpring.add(box([5, 0.1, 0.8], M.brass, [2.5, 0, 0], 0)); // moving spring
  hookSpring.add(cylinder(0.2, 0.2, 0.12, M.steel, [4.7, 0.11, 0], { segments: 12 }));
  g.add(hookSpring);
  add('hook', g, zero, v3(0, 6, 0));
}

// Ringer: two gongs, two coils on an iron yoke, and the rocking armature that swings the clapper.
const clapper = new THREE.Group();
{
  const g = new THREE.Group(), RX = -1, RZ = -5.8;
  const gong = [[0.01, 2.6], [0.7, 2.56], [1.6, 2.3], [2.25, 1.65], [2.55, 0.75], [2.62, 0]];
  [-3.4, 3.4].forEach(dx => {
    const bell = lathe(gong, M.gong, { segments: 48 }); bell.position.set(RX + dx, 2, RZ); g.add(bell);
    g.add(cylinder(0.22, 0.22, 4, M.steel, [RX + dx, 2.8, RZ], { segments: 12 }));
    g.add(cylinder(0.45, 0.45, 0.25, M.steel, [RX + dx, 4.75, RZ], { segments: 6 }));
  });
  g.add(box([0.9, 4.6, 0.2], M.iron, [RX, 3.2, RZ + 0.9], 0)); // bracket
  g.add(box([4.6, 0.4, 1.4], M.iron, [RX, 5.2, RZ])); // yoke
  [-1, 1].forEach(s => g.add(cylinder(0.8, 0.8, 2, M.copper, [RX + s * 1.1, 6.3, RZ], { segments: 24 })));
  clapper.add(box([3.4, 0.25, 0.9], M.iron, [0, 0, 0]));
  clapper.add(cylinder(0.09, 0.09, 4.7, M.steel, [0, -2.35, 0], { segments: 8 }));
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.42, 20, 14), M.steel); ball.position.y = -4.7; clapper.add(ball);
  clapper.position.set(RX, 7.6, RZ); g.add(clapper);
  // The capacitor that passes the ringing AC and blocks the DC.
  g.add(box([1.3, 2.6, 3.2], M.cap, [-8, 2.3, -1.6], 0.2));
  g.add(box([1.34, 0.6, 2.2], M.ivory, [-8, 2.5, -1.6], 0.05));
  g.userData.anchor = [RX, 4.2, RZ];
  add('ringer', g, zero, v3(-3, 1, -7));
}

// Network: the sealed can with the induction coil on top and its row of terminals.
{
  const g = new THREE.Group(), NX = 6.8, NZ = 1.2;
  g.add(box([4.6, 3.2, 5.4], M.can, [NX, 2.6, NZ], 0.3));
  g.add(box([1.1, 1.1, 4.4], M.iron, [NX, 4.9, NZ]));
  g.add(alongZ(cylinder(1.15, 1.15, 3, M.copper, [NX, 4.9, NZ], { segments: 32 })));
  for (let i = 0; i < 6; i++) g.add(cylinder(0.24, 0.24, 0.2, M.brass, [NX - 1.8 + i * 0.72, 4.3, NZ + 2.2], { segments: 12 }));
  add('network', g, zero, v3(7, 1, 4));
}

// Dial: the number plate, the finger wheel that turns over it, and the finger stop.
const wheel = new THREE.Group();
{
  const g = new THREE.Group(); g.position.copy(DIAL_C); g.rotation.x = DIAL_TILT;
  const plate = new THREE.Mesh(new THREE.CircleGeometry(PLATE_R, 64), M.plate); plate.position.z = 0.02; g.add(plate);
  const bezel = new THREE.Mesh(new THREE.TorusGeometry(WHEEL_R + 0.14, 0.14, 10, 72), M.steel); bezel.position.z = 0.12; g.add(bezel);
  const s = new THREE.Shape().absarc(0, 0, WHEEL_R, 0, Math.PI * 2, false);
  s.holes.push(new THREE.Path().absarc(0, 0, 1.85, 0, Math.PI * 2, true));
  for (let d = 0; d < 10; d++) {
    const a = deg(holeAngle(d));
    s.holes.push(new THREE.Path().absarc(Math.cos(a) * HOLE_R, Math.sin(a) * HOLE_R, HOLE, 0, Math.PI * 2, true));
  }
  const geo = new THREE.ExtrudeGeometry(s, { depth: 0.35, bevelEnabled: true, bevelSize: 0.06, bevelThickness: 0.06, bevelSegments: 2, curveSegments: 24 });
  geo.translate(0, 0, 0.14);
  wheel.add(new THREE.Mesh(geo, M.wheel)); g.add(wheel);
  const a = deg(DIAL.stop), stop = box([1.6, 0.35, 0.3], M.steel, [Math.cos(a) * 4.35, Math.sin(a) * 4.35, 0.78]);
  stop.rotation.z = a; g.add(stop);
  g.add(alongZ(cylinder(0.16, 0.16, 0.8, M.steel, [Math.cos(a) * 5.0, Math.sin(a) * 5.0, 0.4], { segments: 10 })));
  add('dial', g, zero, DIAL_N.clone().multiplyScalar(16));
}

// Dial works behind it: main gear, spring barrel, governor, pulse cam and pulse contacts.
const gear = new THREE.Group(), governor = new THREE.Group(), pulseCam = new THREE.Group(), pulseSpring = new THREE.Group();
{
  const g = new THREE.Group(); g.position.copy(DIAL_C); g.rotation.x = DIAL_TILT;
  gear.add(flat(gearShape(2.8, 40, 0.18), 0.25, M.brass)); gear.position.z = -1.3; g.add(gear);
  g.add(alongZ(cylinder(1.2, 1.2, 0.8, M.brass, [0, 0, -1.95], { segments: 32 })));
  // Governor: two fly weights on a fast shaft; they swing out and rub a drum to hold the speed.
  governor.add(alongX(cylinder(0.12, 0.12, 2.6, M.steel, [0, 0, 0], { segments: 8 })));
  [-1, 1].forEach(s => governor.add(box([0.5, 0.35, 0.35], M.brass, [0.6, s * 0.45, 0])));
  governor.position.set(1.6, -2.4, -2.6); g.add(governor);
  g.add(alongX(cylinder(0.75, 0.75, 1, M.steel, [2.2, -2.4, -2.6], { segments: 20, open: true })));
  pulseCam.add(flat(gearShape(0.8, 5, 0.25), 0.3, M.steel)); pulseCam.position.set(-2, -2.3, -2.5); g.add(pulseCam);
  // Pulse contacts: the cam pushes the moving spring away from the fixed one once per pulse.
  g.add(box([0.12, 2.2, 0.6], M.brass, [-3.25, -1.4, -2.5], 0));
  g.add(box([0.6, 0.6, 0.8], M.bakelite, [-3.1, -2.75, -2.5]));
  pulseSpring.position.set(-2.95, -2.5, -2.5);
  pulseSpring.add(box([0.12, 2.2, 0.6], M.brass, [0, 1.1, 0], 0));
  pulseSpring.add(alongX(cylinder(0.14, 0.14, 0.14, M.steel, [-0.12, 1.9, 0], { segments: 10 })));
  g.add(pulseSpring);
  add('dialMech', g, zero, DIAL_N.clone().multiplyScalar(2));
}

// Handset: a handle bent down into the earpiece (-x) and mouthpiece (+x) cups.
{
  const g = new THREE.Group();
  const spine = new THREE.CatmullRomCurve3([v3(-10.4, -1.9, 0), v3(-9, -0.1, 0), v3(-6.5, 1, 0), v3(0, 1.45, 0), v3(6.5, 1, 0), v3(9, -0.1, 0), v3(10.4, -1.9, 0)]);
  g.add(new THREE.Mesh(new THREE.TubeGeometry(spine, 80, 1.25, 24, false), M.shell));
  const cup = [[0.05, -0.35], [1.4, -0.45], [2.4, -0.9], [3, -1.7], [3.2, -2.6], [3.2, -3.3]];
  [-1, 1].forEach(s => { const c = lathe(cup, M.shell, { segments: 48 }); c.position.x = s * CUP_X; g.add(c); });
  g.add(alongX(cylinder(0.38, 0.38, 0.6, M.shell, [CUP_X + 3.1, -2.6, 0], { segments: 12 }))); // cord exit
  g.traverse(o => { if (o.isMesh) o.userData.cutaway = true; });
  g.userData.anchor = [0, 1.5, 0];
  add('handset', g, zero, zero, rig);
}
// Caps: the earpiece and mouthpiece covers screw onto the cups.
{
  const g = new THREE.Group();
  const ear = lathe([[3.2, -3.25], [3.18, -3.55], [2.7, -3.72], [0.01, -3.76]], M.shell, { segments: 48 }); ear.position.x = -CUP_X; g.add(ear);
  const mouth = lathe([[3.2, -3.25], [3.15, -3.6], [2.4, -3.95], [0.01, -4.05]], M.shell, { segments: 48 }); mouth.position.x = CUP_X; g.add(mouth);
  const ring = (n, r) => Array.from({ length: n }, (_, i) => [r * Math.cos(i / n * Math.PI * 2), r * Math.sin(i / n * Math.PI * 2)]);
  [[0, 0], ...ring(6, 0.95)].forEach(([x, z]) => g.add(cylinder(0.22, 0.22, 0.04, M.dark, [-CUP_X + x, -3.77, z], { segments: 12 })));
  [[0, 0], ...ring(6, 0.75), ...ring(12, 1.5)].forEach(([x, z]) => g.add(cylinder(0.15, 0.15, 0.04, M.dark, [CUP_X + x, -4.06 + 0.02 * (x * x + z * z), z], { segments: 10 })));
  g.traverse(o => { if (o.isMesh) o.userData.cutaway = true; });
  add('caps', g, zero, v3(0, -3.2, 0), rig);
}

// Transmitter: carbon granules in a cup between a fixed back electrode and a front electrode
// on the diaphragm. Pushing the diaphragm in squeezes the granules.
const txDia = new THREE.Group(), granules = new THREE.Group();
const TX_BACK = -1.98, TX_DEPTH = 0.85, TX_SQUEEZE = 0.17;
{
  const g = new THREE.Group();
  const capsule = cylinder(2.45, 2.45, 1.55, M.brushed, [CUP_X, -2.3, 0], { segments: 40 }); capsule.userData.cutaway = true; g.add(capsule);
  g.add(cylinder(1.25, 1.25, 0.12, M.brass, [CUP_X, TX_BACK + 0.06, 0], { segments: 32 }));
  const wall = cylinder(1.3, 1.3, TX_DEPTH + 0.05, M.ivory, [CUP_X, TX_BACK - TX_DEPTH / 2, 0], { segments: 32, open: true }); wall.userData.cutaway = true; g.add(wall);
  const grains = new THREE.InstancedMesh(new THREE.SphereGeometry(0.12, 8, 6), M.carbon, 260);
  const m = new THREE.Matrix4();
  for (let i = 0; i < 260; i++) {
    const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * 1.12;
    grains.setMatrixAt(i, m.makeTranslation(Math.cos(a) * r, -0.1 - Math.random() * (TX_DEPTH - 0.2), Math.sin(a) * r));
  }
  granules.add(grains); granules.position.set(CUP_X, TX_BACK, 0); g.add(granules);
  txDia.add(lathe([[0.01, -3.22], [1, -3.19], [2, -3.1], [2.42, -3.05]], M.alu, { segments: 48 }));
  txDia.add(cylinder(0.95, 0.95, 0.12, M.brass, [0, TX_BACK - TX_DEPTH - 0.06, 0], { segments: 32 }));
  txDia.add(cylinder(0.22, 0.22, 0.28, M.brass, [0, -3.03, 0], { segments: 12 }));
  txDia.position.x = CUP_X; g.add(txDia);
  g.userData.anchor = [CUP_X, -2.6, 0];
  add('transmitter', g, zero, v3(0, -1.6, 0), rig);
}

// Receiver: a ring magnet, two pole pieces wound with coils, and a thin iron diaphragm.
const rxDia = new THREE.Group();
{
  const g = new THREE.Group();
  const capsule = cylinder(2.45, 2.45, 1.7, M.brushed, [-CUP_X, -2.2, 0], { segments: 40 }); capsule.userData.cutaway = true; g.add(capsule);
  const magnet = lathe([[0.95, -1.45], [2, -1.45], [2, -1.95], [0.95, -1.95], [0.95, -1.45]], M.iron, { segments: 40 }); magnet.position.x = -CUP_X; g.add(magnet);
  [-1, 1].forEach(s => {
    g.add(box([0.4, 1.0, 0.9], M.iron, [-CUP_X + s * 0.65, -2.35, 0]));
    g.add(cylinder(0.5, 0.5, 0.75, M.copper, [-CUP_X + s * 0.65, -2.4, 0], { segments: 24 }));
  });
  rxDia.add(cylinder(2.35, 2.35, 0.05, M.diaphragm, [0, -3, 0], { segments: 48 }));
  rxDia.position.x = -CUP_X; g.add(rxDia);
  g.userData.anchor = [-CUP_X, -2.6, 0];
  add('receiver', g, zero, v3(0, -1.6, 0), rig);
}

// Line cord: a copper pair, twisted, in an ivory jacket, from the back of the phone to the wall box.
const LINE_PATH = new THREE.CatmullRomCurve3([v3(5.5, 2.2, -10.1), v3(5.7, 1.3, -12.4), v3(7.2, 0.45, -15.5), v3(12, 0.42, -19.5), v3(18.5, 0.42, -22.6), v3(24.8, 0.42, -24)]);
const PAIR = { turns: LINE_PATH.getLength() / 1.6, radius: 0.13, per: 16 };
const tipWire = wound(LINE_PATH, { ...PAIR }), ringWire = wound(LINE_PATH, { ...PAIR, phase: Math.PI });
{
  const g = new THREE.Group();
  const jacket = new THREE.Mesh(new THREE.TubeGeometry(LINE_PATH, 160, 0.36, 14, false), M.ivory); jacket.userData.cutaway = true; g.add(jacket);
  [tipWire, ringWire].forEach(w => g.add(new THREE.Mesh(new THREE.TubeGeometry(w, 900, 0.085, 6, false), M.copper)));
  g.add(alongZ(cylinder(0.55, 0.55, 0.5, M.rubber, [5.5, 2.2, -10.05], { segments: 16 })));
  g.userData.anchor = LINE_PATH.getPointAt(0.55).toArray();
  add('line', g, zero, zero);
}
// Wall box, and the street cable that runs on to the exchange and fades out.
{
  const g = new THREE.Group();
  g.add(box([6, 3.2, 7], M.ivory, [27.5, 1.6, -25.5], 0.5));
  g.add(box([5.2, 0.12, 6.2], M.ivory, [27.5, 3.25, -25.5], 0.04));
  g.add(cylinder(0.3, 0.3, 0.1, M.steel, [27.5, 3.33, -25.5], { segments: 12 }));
  add('jack', g, zero, zero);
  const c = document.createElement('canvas'); c.width = 256; c.height = 4;
  const ctx = c.getContext('2d'), grad = ctx.createLinearGradient(0, 0, 256, 0);
  grad.addColorStop(0, '#fff'); grad.addColorStop(0.2, '#fff'); grad.addColorStop(1, '#000');
  ctx.fillStyle = grad; ctx.fillRect(0, 0, 256, 4);
  const path = new THREE.CatmullRomCurve3([v3(28.5, 0.7, -28.9), v3(29.2, 0.7, -38), v3(31.5, 0.7, -52), v3(35.5, 0.7, -70)]);
  const street = new THREE.Mesh(new THREE.TubeGeometry(path, 80, 0.7, 12, false),
    new THREE.MeshStandardMaterial({ color: linear(0x2d3135), roughness: 0.6, alphaMap: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
  street.userData.noContactShadow = true; root.add(street);
}

// Handset cord: a coil wound round a sagging curve from the mouthpiece end to the side of the base.
// It is rebuilt whenever the handset moves.
const CORD_OUT = v3(CUP_X + 3.4, -2.6, 0), CORD_IN = v3(WIDTH / 2 + 0.35, 2.6, -1.5);
const cordMesh = new THREE.Mesh(new THREE.BufferGeometry(), M.shell);
add('cord', cordMesh, zero, zero);
const cord = { a: v3(Infinity, 0, 0), b: v3(), path: null };
function updateCord() {
  parts.handset.group.updateWorldMatrix(true, false); parts.housing.group.updateWorldMatrix(true, false);
  const a = parts.handset.group.localToWorld(CORD_OUT.clone()), b = parts.housing.group.localToWorld(CORD_IN.clone());
  if (a.distanceTo(cord.a) < 0.02 && b.distanceTo(cord.b) < 0.02) return;
  cord.a.copy(a); cord.b.copy(b);
  const c1 = a.clone().add(v3(2.5, -Math.max(5, a.distanceTo(b) * 0.35), 1.5)), c2 = b.clone().add(v3(3.5, 0, 1));
  c1.y = Math.max(1.2, c1.y); c2.y = Math.max(1.2, c2.y);
  cord.path = new THREE.CubicBezierCurve3(a, c1, c2, b);
  const coil = wound(cord.path, { turns: cord.path.getLength() * 1.2, radius: 0.42 });
  cordMesh.geometry.dispose();
  cordMesh.geometry = new THREE.TubeGeometry(coil, coil.points.length, 0.13, 5, false);
}

// ---------- Effects ----------
// Current: copper dots running along each wire of the pair and along the handset cord.
const dot = softDot(), dotColor = linear(0xd9783a).getHex();
const flow = n => createParticles(scene, n, { color: dotColor, size: 1.1, map: dot, seed: i => ({ u: (i + Math.random() * 0.6) / n }) });
const tipDots = flow(36), ringDots = flow(36), cordDots = flow(28);
// Sound: rings that travel into the mouthpiece as you talk, and out of the earpiece as you listen.
const waveColor = linear(0xc4703a);
const waves = { mouth: [], ear: [] };
for (const key of ['mouth', 'ear']) {
  for (let i = 0; i < 4; i++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.05, 6, 56), new THREE.MeshBasicMaterial({ color: waveColor, transparent: true, opacity: 0, depthWrite: false }));
    ring.rotation.x = Math.PI / 2; ring.userData.noContactShadow = true; ring.visible = false;
    rig.add(ring); waves[key].push(ring);
  }
}

// ---------- State and UI ----------
const state = { step: 0, explode: 0, targetExplode: 0, playing: true, focus: [], cut: false, mode: 'idle', t: 0, km: LINE.km };
const shown = { lift: 0, angle: 0, cam: 0, gov: 0, voice: 0, far: 0 };
let camGoal = null;
// The views are framed for a desktop stage (about 1.15 wide to 1 high). A narrower stage pulls the
// camera back; on phones the title and buttons cover the top and bottom, so the phone also sits lower.
function fit() {
  const c = stage.renderer.domElement, a = c.clientWidth / Math.max(1, c.clientHeight);
  const small = globalThis.matchMedia?.('(max-width: 800px)').matches;
  return { zoom: Math.min(1.7, Math.max(1, 1.15 / a)) * (small ? 1.25 : 1), lift: small ? 0.07 : 0 };
}
const story = createStoryUI({
  story: PHONE_STORY, state,
  onStep: s => {
    state.focus = s.focus; state.cut = s.cut; state.mode = s.mode; state.t = 0;
    const v = VIEWS[s.view], f = fit(), r = v.r * f.zoom;
    camGoal = { ...v, r, target: new THREE.Vector3(...v.target).add(v3(0, r * f.lift, 0)) };
    cam.theta = v.theta + THREE.MathUtils.euclideanModulo(cam.theta - v.theta + Math.PI, 2 * Math.PI) - Math.PI; // take the short way round
  },
});
bindRange('km', v => { state.km = v; showRange(document.getElementById('km'), `${v} km`); });
createCallouts(stage, { parts, state, story: PHONE_STORY });

// cut: true clears every cutaway shell; a list clears only those parts and keeps the rest solid.
const clears = name => state.cut === true || (Array.isArray(state.cut) && state.cut.includes(name));
const focusStyle = {
  highlight: 0.18,
  opacity(name, mesh, hot) {
    let alpha = 1;
    if (mesh.userData.cutaway && clears(name)) alpha = hot ? 0.3 : 0.14;
    if (state.focus.length && !hot && (state.cut === true || state.explode > 0.12)) alpha = Math.min(alpha, 0.3);
    return alpha;
  },
};

// ---------- Readout ----------
// Line volts, loop current, what the exchange makes of it, and the last 2 s of current.
const $ = id => document.getElementById(id);
const R = { box: $('readout'), volts: $('r-volts'), amps: $('r-amps'), ex: $('r-exchange'), range: $('r-range'), trace: document.querySelector('#r-trace polyline') };
const TRACE_N = 400, TRACE_S = 2;
const whole = v => String(Math.round(v) || 0).replace('-', '−');
function showReadout(p) {
  R.volts.textContent = p.ring ? `${LINE.ringV} V AC` : `${p.volts.toFixed(1)} V`;
  R.amps.textContent = p.ring ? `±${whole(ringPeakMA(state.km))} mA AC` : `${Math.abs(p.mA).toFixed(1)} mA`;
  R.ex.textContent = p.status;
  R.box.classList.toggle('live', p.off && !p.open);
  const period = PERIOD[state.mode], ys = [];
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i <= TRACE_N; i++) {
    const t = THREE.MathUtils.euclideanModulo(state.t - TRACE_S * (1 - i / TRACE_N), period);
    const mA = phone(state.mode, t, { km: state.km }).mA;
    ys.push(mA); lo = Math.min(lo, mA); hi = Math.max(hi, mA);
  }
  // Scaled to fit, like a scope on auto: a flat line sits in the middle.
  R.range.textContent = hi - lo < 0.05 ? `${whole(hi)} mA` : `${whole(lo)} to ${whole(hi)} mA`;
  if (hi - lo < 3) { const mid = (hi + lo) / 2; lo = mid - 1.5; hi = mid + 1.5; }
  R.trace.setAttribute('points', ys.map((mA, i) => `${i},${(30 - 26 * (2 * (mA - lo) / (hi - lo) - 1)).toFixed(1)}`).join(' '));
}

// ---------- Sound ----------
// The bell is struck on every swing of the clapper; the dial tone is 350 + 440 Hz; the dial
// clicks once per pulse and whirrs on its way back; voices are a soft hum and breath.
const dialTone = [350, 440].map(freq => sound.loop({ type: 'tone', wave: 'sine', freq }));
const whirr = sound.loop({ type: 'noise', filter: 'bandpass', freq: 1500, q: 3 });
const hum = sound.loop({ type: 'tone', wave: 'triangle', freq: 130 });
const breath = sound.loop({ type: 'noise', filter: 'bandpass', freq: 1200, q: 1.4 });
const was = { side: 0, open: false, off: false, notch: 0, lift: 0 };
function bell(side) {
  const f = side > 0 ? 1180 : 1050;
  sound.tone({ freq: f, gain: 0.06, release: 0.25 });
  sound.tone({ freq: f * 2.76, gain: 0.02, release: 0.12 });
}
function playSounds(p, now) {
  const on = state.playing ? 1 : 0;
  dialTone.forEach(l => l.set(p.tone ? 0.03 * on : 0));
  whirr.set(p.dial?.phase === 'return' ? 0.035 * on : 0, 1300 + 300 * Math.sin(now / 30));
  hum.set(0.03 * Math.max(shown.voice, shown.far) * on, (shown.far > shown.voice ? 185 : 125) * (1 + 0.06 * Math.sin(now / 170)));
  breath.set(0.045 * Math.max(shown.voice, shown.far) * on);
  const side = Math.abs(p.clap) >= 1 ? Math.sign(p.clap) : 0;
  if (on && side && side !== was.side) bell(side);
  if (side || !p.ring) was.side = side;
  if (on && p.open && !was.open) sound.click(0.12);
  const notch = p.dial?.phase === 'wind' ? Math.floor(p.dial.angle / DIAL.step) : 0;
  if (on && notch > was.notch) sound.click(0.05);
  if (p.off && !was.off) sound.click(0.25); // hookswitch closes
  if (shown.lift < 0.01 && was.lift >= 0.01) sound.thunk(0.35); // handset back on the cradle
  was.open = p.open; was.notch = notch; was.off = p.off; was.lift = shown.lift;
}

// ---------- Frame ----------
const tmp = new THREE.Vector3();
const snap = reduced || stage.capture; // ?capture renders stills, so it skips every ease
let readoutTimer = 0;
startLoop(stage, (dt, now) => {
  update(state, focusStyle, snap ? 1 : 0.09, dt);
  if (camGoal) { // ease to the step's view once; after that the reader's own zoom wins
    const k = snap ? 1 : Math.min(1, dt * 3);
    for (const a of ['r', 'theta', 'phi']) cam[a] += (camGoal[a] - cam[a]) * k;
    cam.target.lerp(camGoal.target, k);
    if (Math.abs(camGoal.r - cam.r) < 0.5 && Math.abs(camGoal.theta - cam.theta) < 0.01 && cam.target.distanceTo(camGoal.target) < 0.2) camGoal = null;
  }
  if (state.playing) state.t = (state.t + dt) % PERIOD[state.mode];
  const p = phone(state.mode, state.t, { km: state.km });

  // Handset: lifts in an arc, and the plungers follow it up as soon as it leaves the cradle.
  shown.lift += (p.lift - shown.lift) * (snap ? 1 : Math.min(1, dt * 5));
  const s = shown.lift;
  rig.position.lerpVectors(ON.pos, HELD.pos, s);
  rig.position.y += 4 * Math.sin(Math.PI * s) + 20 * Math.max(0, parts.housing.amount) * (1 - s);
  rig.rotation.set(HELD.rot.x * s, HELD.rot.y * s, HELD.rot.z * s);
  const rise = clamp01(s / 0.06);
  plungers.position.y = PL_DOWN + 1.2 * rise;
  hookSpring.rotation.z = Math.min(0.04, Math.asin((1.2 * rise - 0.29) / 4.1));

  // Ringer: the armature rocks and the clapper hits one gong, then the other.
  clapper.rotation.z = 0.1 * p.clap;

  // Dial: the finger wheel and main gear turn together; the governor and cam only on the way back.
  const angle = p.dial ? p.dial.angle : 0;
  if (state.playing && angle < shown.angle) { shown.cam += (shown.angle - angle) * 2.4; shown.gov += dt * 45; }
  shown.angle = angle;
  wheel.rotation.z = gear.rotation.z = -deg(angle);
  pulseCam.rotation.z = -deg(shown.cam); governor.rotation.x = shown.gov;
  pulseSpring.rotation.z = p.open ? -0.14 : 0;

  // Transmitter and receiver. The receiver also gets a little of your own voice: sidetone.
  txDia.position.y = TX_SQUEEZE * p.push;
  granules.scale.y = 1 - TX_SQUEEZE / TX_DEPTH * p.push;
  rxDia.position.y = 0.12 * (p.far + 0.15 * p.push);
  const k = Math.min(1, dt * 8);
  shown.voice += ((p.push ? voiceLevel(state.t) : 0) - shown.voice) * k;
  shown.far += ((p.far ? voiceLevel(state.t, 1.7) : 0) - shown.far) * k;
  waves.mouth.forEach((ring, i) => {
    const f = (now / 1000 * 0.9 + i / 4) % 1;
    ring.position.set(CUP_X, -8.4 + 4 * f, 0); ring.scale.set(2.8 - 1.2 * f, 2.8 - 1.2 * f, 1);
    ring.material.opacity = 0.65 * shown.voice * Math.sin(Math.PI * f) * s; ring.visible = !reduced && ring.material.opacity > 0.01;
  });
  waves.ear.forEach((ring, i) => {
    const f = (now / 1000 * 0.9 + i / 4) % 1;
    ring.position.set(-CUP_X, -4.2 - 4.5 * f, 0); ring.scale.set(1.6 + 1.6 * f, 1.6 + 1.6 * f, 1);
    ring.material.opacity = 0.65 * shown.far * Math.sin(Math.PI * f) * s; ring.visible = !reduced && ring.material.opacity > 0.01;
  });

  // Current dots: toward the phone on one wire, back on the other. Their speed follows the
  // current (the voice's share is drawn 8× larger); AC from the ringer only shakes them.
  updateCord();
  const live = p.off && !p.open, base = live ? loopCurrent(state.km) : 0, swing = live ? p.mA - base : 0;
  const speed = state.playing ? 0.0042 * (base + 8 * swing) : 0;
  const shake = p.ring ? 0.012 * Math.sin(2 * Math.PI * LINE.ringHz * state.t) : 0;
  const fade = Math.min(1, dt * 25);
  [[tipDots, tipWire, -1], [ringDots, ringWire, 1]].forEach(([dots, wire, dir]) => {
    if (!dots.fade(live || p.ring ? 0.95 : 0, fade)) return;
    dots.material.size = 1.1 * (1 + 0.28 * swing);
    dots.seeds.forEach((d, i) => {
      d.u = THREE.MathUtils.euclideanModulo(d.u + dir * speed * dt, 1);
      wire.getPointAt(THREE.MathUtils.euclideanModulo(d.u + dir * shake, 1), tmp); dots.place(i, tmp.x, tmp.y, tmp.z);
    });
    dots.commit();
  });
  if (cordDots.fade(live ? 0.95 : 0, fade) && cord.path) {
    cordDots.material.size = 1.1 * (1 + 0.28 * swing);
    cordDots.seeds.forEach((d, i) => {
      d.u = THREE.MathUtils.euclideanModulo(d.u - speed * 1.6 * dt, 1);
      cord.path.getPointAt(d.u, tmp); cordDots.place(i, tmp.x, tmp.y, tmp.z);
    });
    cordDots.commit();
  }

  playSounds(p, now);
  readoutTimer -= dt;
  if (readoutTimer <= 0) { showReadout(p); readoutTimer = 0.1; }
});
story.setStep(0, false);
