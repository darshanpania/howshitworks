import * as THREE from 'three';
import { createStage, addFloor, addStudioLights } from '../../src/engine/stage.js';
import { createParts } from '../../src/engine/parts.js';
import { createCallouts } from '../../src/engine/callouts.js';
import { createStoryUI, bindRange, showRange } from '../../src/engine/story-ui.js';
import { onPalette } from '../../src/engine/studio.js';
import { sound } from '../../src/engine/sound.js';
import { onThemeChange } from '../../src/site.js';
import { startLoop, reducedMotion as reduced } from '../../src/engine/loop.js';
import { box, cylinder } from '../../src/kit/shapes.js';
import { createMaterials, linear } from '../../src/kit/materials.js';
import { softDot, createParticles } from '../../src/kit/effects.js';
import { EARPHONE_STORY } from './story.js';
import { PITCHES, CHIP, passive, active, antiGain, lag, share, showHz, showLength, pitchText, lossText } from './anc.js';

// ---------- Layout ----------
// Scale: 1 unit = 1 mm. The floor is y = 0. The bud's own frame has its origin in the middle of
// its body: x runs along the ear canal (the eardrum toward -x, the outside world toward +x), and
// the stem hangs down -y. The ear model is the far half (z < 0) of a canal, so the near half of
// the bud is in plain view.
const v3 = (x, y, z) => new THREE.Vector3(x, y, z);
const zero = v3(0, 0, 0);
const clamp01 = v => Math.max(0, Math.min(1, v));
const smooth = t => t * t * (3 - 2 * t);
const TAU = Math.PI * 2;

const CY = 52;                            // height of the canal's axis above the floor
const DRUM_X = -36.4;                     // the eardrum
const CANAL = { from: -16.6, to: -35.4 }; // open air between the tip and the eardrum
const OUTSIDE = { from: 12, to: 66 };     // the noise on its way in
const SPLIT = -26.5;                      // left of this, the canal shows what is left of the noise
const WAVE = 3;                           // drawn height of the noise outside, mm

const VIEWS = {
  whole: { r: 235, theta: 0.36, phi: 1.24, target: [26, 38, 0] },
  tip: { r: 82, theta: 0.2, phi: 1.3, target: [-17, CY - 1, 0] },
  outer: { r: 78, theta: 0.95, phi: 1.2, target: [9, CY + 1, 0] },
  chip: { r: 70, theta: 1.05, phi: 1.3, target: [3, CY, 0] },
  driver: { r: 70, theta: 0.5, phi: 1.12, target: [-11, CY, 0] },
  inner: { r: 74, theta: 0.22, phi: 1.22, target: [-15, CY, 0] },
  timing: { r: 128, theta: 0.3, phi: 1.3, target: [4, CY - 3, 0] },
  power: { r: 235, theta: 0.4, phi: 1.2, target: [30, 44, 0] },
};

// ---------- Stage and light ----------
const stage = createStage(document.getElementById('c'), {
  fov: 36, pbr: true, camera: VIEWS.whole, zoom: [28, 460], phiLimit: 0.15,
});
const { scene, cam } = stage;
stage.camera.near = 1; stage.camera.far = 2400; stage.camera.updateProjectionMatrix();
// The key comes from the front left, so it does not sit behind the camera and wash out the white shell.
addStudioLights(stage, { key: [-90, 170, 120], extent: 110, far: 520, scale: 6, shadowMap: 2048 });
addFloor(stage, 0, { size: 620, cell: 10, opacity: 0.12, center: [30, 0], height: 90, blur: 3, shadowSize: 240, darkness: 1.3 }); // 1 cm grid

// ---------- Materials ----------
const M = createMaterials({
  shell: { color: 0xeeeeea, roughness: 0.2, envMapIntensity: 0.7 },                 // glossy white plastic
  silicone: { color: 0xd9dde0, roughness: 0.72, side: THREE.DoubleSide },
  skin: { color: 0xd8a78f, roughness: 0.74, side: THREE.DoubleSide },
  drum: { color: 0xf0ddd2, roughness: 0.45, side: THREE.DoubleSide },
  glass: { color: 0x1a1d22, metalness: 0.3, roughness: 0.18 },
  mesh: { color: 0x101215, metalness: 0.4, roughness: 0.6 },
  film: { color: 0xcfd6dc, metalness: 0.35, roughness: 0.3, side: THREE.DoubleSide }, // the diaphragm
  basket: { color: 0x3d434b, metalness: 0.65, roughness: 0.4, side: THREE.DoubleSide },
  former: { color: 0xc58b2a, roughness: 0.5, side: THREE.DoubleSide },
  copper: { look: 'copper', side: THREE.DoubleSide },
  neo: { color: 0xc9ced4, metalness: 0.85, roughness: 0.25, side: THREE.DoubleSide },
  iron: { look: 'iron', side: THREE.DoubleSide },
  plate: { look: 'steel', side: THREE.DoubleSide },
  steel: 'steel', brushed: 'brushed', dark: 'dark',
  cell: { color: 0xbfc5cc, metalness: 0.85, roughness: 0.32 },
  gasket: { color: 0x2b3f6b, roughness: 0.6 },
  pcb: { color: 0x1f5a45, roughness: 0.55 },
  chip: { color: 0x17191c, metalness: 0.2, roughness: 0.4 },
  mark: { color: 0x6c737c, metalness: 0.4, roughness: 0.4 },
  can: { color: 0xd9c48f, metalness: 0.8, roughness: 0.3 },                           // MEMS microphone cans
  gold: { color: 0xe0b85a, metalness: 0.9, roughness: 0.25 },
  flex: { color: 0xc9812c, roughness: 0.5 },
  caseShell: { color: 0xeeeeea, roughness: 0.24, envMapIntensity: 0.7 },
  caseInner: { color: 0x2a2d32, roughness: 0.6 },
}, { pbr: true });

// ---------- Helpers ----------
const alongX = mesh => { mesh.rotation.z = Math.PI / 2; return mesh; };
const cutaway = g => { g.traverse(o => { if (o.isMesh) o.userData.cutaway = true; }); return g; };

// Spins a profile of [x, radius] points around the x axis. An outer wall listed toward +x faces
// out. from/sweep (radians) spin only part of the way round: the angle 0 points toward +z, a
// quarter turn toward -y. With caps, the two cut faces of a closed profile are filled in.
function spin(profile, mat, { from = 0, sweep = TAU, caps = false, segments = 56 } = {}) {
  const pts = profile.map(([x, r]) => new THREE.Vector2(Math.max(r, 0.001), x));
  const geo = new THREE.LatheGeometry(pts, Math.max(8, Math.round(segments * sweep / TAU)), from, sweep);
  geo.rotateZ(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, mat);
  if (!caps || sweep >= TAU) return mesh;
  const g = new THREE.Group(); g.add(mesh);
  const face = new THREE.ShapeGeometry(new THREE.Shape(profile.map(([x, r]) => new THREE.Vector2(x, r))));
  [from, from + sweep].forEach(phi => { const cap = new THREE.Mesh(face, mat); cap.rotation.x = phi + Math.PI / 2; g.add(cap); });
  return g;
}
// A smooth curve through [x, r] points, as n + 1 points.
function curve(points, n = 40) {
  const c = new THREE.CatmullRomCurve3(points.map(([x, r]) => v3(x, r, 0)), false, 'centripetal');
  return c.getPoints(n).map(p => [p.x, p.y]);
}
// The speaker parts are spun three quarters of the way, so the quarter toward the reader
// (+y, +z) is open and shows the coil in the magnet's gap.
const wedge = (profile, mat) => spin(profile, mat, { from: 0, sweep: Math.PI * 1.5, caps: true });
const path = points => new THREE.CatmullRomCurve3(points.map(p => v3(...p)), false, 'centripetal');
const tube = (points, mat, r = 0.2) => new THREE.Mesh(new THREE.TubeGeometry(path(points), 48, r, 8, false), mat);

// ---------- Parts ----------
const root = new THREE.Group(); scene.add(root);
const { parts, add, update } = createParts(root, { shadows: true, lively: true });
const bud = new THREE.Group(); bud.position.set(0, CY, 0); root.add(bud);

// The outside of a bud: the body with its nozzle, the stem, and the dark details. The second
// bud in the case is a copy of this.
const BODY = [[-13.2, 1.9], [-13.2, 2.6], [-7.3, 2.6],
  ...curve([[-7.3, 2.6], [-6.7, 3.5], [-5.6, 5.6], [-4.2, 7.1], [-2, 8.2], [1.5, 8.7], [5, 8.3], [7.5, 6.9], [9, 4.6], [9.7, 2.4], [9.9, 0.001]], 44).slice(1)];
const STEM = { x: 4.4, lean: 0.07 };
function budShell() {
  const g = new THREE.Group();
  g.add(spin(BODY, M.shell, { segments: 72 }));
  // Stem: a round bar that leans out a little, with the charging contact at its foot.
  const stem = new THREE.Group(); stem.position.x = STEM.x; stem.rotation.z = STEM.lean;
  const bar = new THREE.Mesh(new THREE.LatheGeometry([[0.001, -25.6], [1.5, -25.4], [2.5, -24.6], [3, -23.2], [3, -3]].map(([r, y]) => new THREE.Vector2(r, y)), 40), M.shell);
  stem.add(bar);
  stem.add(cylinder(3.04, 3.04, 0.9, M.steel, [0, -23.4, 0], { segments: 40 }));
  stem.add(cylinder(1.3, 1.3, 0.3, M.mesh, [0, -25.5, 0], { segments: 24 }));      // the voice microphone's port
  stem.add(box([0.5, 9, 2.1], M.glass, [2.82, -13.5, 0], 0.2));                    // the press strip
  g.add(stem);
  // Nozzle mesh, the touch face, the outer microphone's mesh and a pressure vent.
  g.add(alongX(cylinder(1.95, 1.95, 0.3, M.mesh, [-12.9, 0, 0], { segments: 28 })));
  g.add(alongX(cylinder(2.5, 2.5, 0.3, M.glass, [9.72, 0, 0], { segments: 36 })));
  const grille = cylinder(1.25, 1.25, 0.3, M.mesh, [8.25, 5.6, 0], { segments: 24 }); grille.rotation.z = -0.9; g.add(grille);
  const vent = cylinder(0.7, 0.7, 0.3, M.mesh, [-3.4, 7.6, 0], { segments: 16 }); vent.rotation.z = 0.75; g.add(vent);
  return g;
}
// Tip: a soft dome on a sleeve that pushes over the nozzle.
function budTip() {
  const g = new THREE.Group();
  g.add(spin(curve([[-15.3, 2.1], [-14.7, 3.25], [-13, 4.45], [-10.6, 4.85], [-8, 4.75]], 24), M.silicone));
  g.add(spin([[-15.3, 2.95], [-8.7, 2.95], [-8.7, 2.66], [-15.3, 2.66], [-15.3, 2.95]], M.silicone, { segments: 40 }));
  return g;
}

{
  const g = cutaway(budShell());
  g.userData.anchor = [1.5, 8.7, 0];
  add('shell', g, zero, v3(8, 31, 0), bud);
}
{
  const g = budTip();
  g.userData.anchor = [-11, 0, 4.8];
  add('tip', g, zero, zero, bud);
}

// Speaker: the diaphragm in its frame, the coil on its back, and the magnet with its steel cup.
// The diaphragm and the coil move together.
const moving = [];
{
  const g = new THREE.Group();
  g.add(wedge([[-3.8, 5.5], [-2, 5.5], [-2, 5.15], [-3.8, 5.15]], M.basket));
  g.add(wedge([[-2.25, 5.2], [-2, 5.2], [-2, 4.45], [-2.25, 4.45]], M.basket));
  const film = new THREE.Group(); moving.push(film); g.add(film);
  film.add(spin(curve([[-4.3, 0.001], [-4.22, 1.2], [-3.96, 2.4], [-3.6, 3.3], [-3.4, 3.6]], 16), M.film, { sweep: Math.PI * 1.5 }));
  film.add(spin(curve([[-3.4, 3.6], [-3.4, 3.9], [-3.66, 4.2], [-3.76, 4.5], [-3.66, 4.8], [-3.4, 5.1], [-3.4, 5.15]], 16), M.film, { sweep: Math.PI * 1.5 }));
  g.userData.anchor = [-3.8, -2.2, 4.6];
  add('driver', g, zero, v3(13, 0, 0), bud);
}
{
  const g = new THREE.Group();
  const coil = new THREE.Group(); moving.push(coil); g.add(coil);
  coil.add(spin([[-3.4, 3.6], [-1.75, 3.6]], M.former, { sweep: Math.PI * 1.5 }));
  coil.add(wedge([[-2.6, 3.8], [-1.75, 3.8], [-1.75, 3.61], [-2.6, 3.61]], M.copper));
  g.userData.anchor = [-2.2, 3.72, 0];
  add('coil', g, zero, v3(20, 0, 0), bud);
}
{
  const g = new THREE.Group();
  g.add(wedge([[-2.4, 0], [-2.4, 3.2], [-0.8, 3.2], [-0.8, 0]], M.neo));
  g.add(wedge([[-2.8, 0], [-2.8, 3.35], [-2.4, 3.35], [-2.4, 0]], M.plate));
  g.add(wedge([[-2.7, 3.98], [-2.7, 4.4], [-0.4, 4.4], [-0.4, 0], [-0.8, 0], [-0.8, 3.98]], M.iron));
  g.userData.anchor = [-1.6, 1.8, 0];
  add('magnet', g, zero, v3(27, 0, 0), bud);
}

// Battery: a button cell behind the speaker.
{
  const g = new THREE.Group();
  g.add(spin([[0.4, 0.001], [0.4, 4.8], [0.75, 5.2], [3.95, 5.2], [4.3, 4.8], [4.3, 0.001]], M.cell));
  g.add(spin([[3.7, 5.24], [4.1, 5.24], [4.34, 4.9], [4.34, 4.4]], M.gasket, { segments: 48 }));
  g.userData.anchor = [2.3, 0, 5.2];
  add('battery', g, zero, v3(36, 0, 0), bud);
}

// Chip: the main board, with the chip that does the noise cancelling and a few smaller parts.
{
  const g = new THREE.Group();
  g.add(alongX(cylinder(6.2, 6.2, 0.5, M.pcb, [5.25, 0, 0], { segments: 48 })));
  g.add(box([0.8, 3.6, 3.6], M.chip, [5.9, -0.9, 0], 0.08));
  g.add(box([0.06, 1.2, 1.2], M.mark, [6.31, -1.7, -0.8], 0));
  g.add(box([0.45, 0.9, 1.7], M.steel, [5.72, -4.3, 1.6], 0.05));
  g.add(box([0.5, 1.3, 1.3], M.chip, [5.75, -3.6, -2.6], 0.05));
  g.add(box([0.4, 0.7, 1.2], M.gold, [5.7, 1.6, -3.9], 0.05));
  g.add(box([0.4, 0.7, 1.2], M.gold, [5.7, 0.2, 4.4], 0.05));
  g.userData.anchor = [6.3, -0.9, 1];
  add('chip', g, zero, v3(45, 0, 0), bud);
}

// Microphones: a metal can 2.7 mm long with a sound port, one on the board behind the outer mesh
// and one in the nozzle.
function micCan(size, pos, port) {
  const g = new THREE.Group();
  g.add(box(size, M.can, pos, 0.12));
  const hole = cylinder(0.28, 0.28, 0.08, M.mesh, port, { segments: 16 });
  g.add(hole);
  return { g, hole };
}
{
  const { g, hole } = micCan([0.9, 1.9, 2.7], [5.95, 3.9, 0], [6.42, 3.9, 0]); alongX(hole);
  g.userData.anchor = [6.4, 4.6, 0.6];
  add('outerMic', g, zero, v3(54, 2, 0), bud);
}
{
  const { g } = micCan([1.9, 0.8, 1.5], [-9.6, 1.35, 0], [-9.6, 0.93, 0]);
  g.userData.anchor = [-9.6, 1.4, 0.75];
  add('innerMic', g, zero, v3(6, 0, 0), bud);
}

// Flex cables: from the inner microphone round the speaker to the board, from the board to the
// coil, and down the stem to the voice microphone and the charging contact. Signals run on them.
const WIRE = {
  check: [[-8.7, 1.5, -0.4], [-7, 2.3, -0.9], [-5.6, 4.6, -1.2], [-4.2, 6.3, -1.2], [-1, 6.9, -1.2], [2.4, 6.7, -1.2], [4.4, 6.3, -0.8], [5, 5.4, -0.4]],
  out: [[5, -4.8, 1], [4.5, -6.1, 1], [2.3, -6.4, 1], [-0.4, -6.2, 1], [-1.6, -5.4, 1], [-2.1, -4.3, 1]],
  mic: [[6.45, 3.4, 0.9], [6.45, 2.2, 0.9], [6.35, 0.9, 0.5]],
};
{
  const g = new THREE.Group();
  g.add(tube(WIRE.check, M.flex, 0.2), tube(WIRE.out, M.flex, 0.2));
  g.add(tube([[5.3, -5.9, 0], [5.1, -8, 0], [5.4, -14, 0], [5.95, -21.5, 0]], M.flex, 0.26));
  g.add(box([1, 2, 1.6], M.can, [5.95, -22.4, 0], 0.1));
  g.add(box([0.3, 1.2, 1.2], M.gold, [6.9, -23.2, 1.2], 0.05), box([0.3, 1.2, 1.2], M.gold, [6.9, -23.2, -1.2], 0.05));
  add('flex', g, zero, v3(8, 31, 0), bud); // stays in the shell
}

// The ear: a model of the ear canal on a stand, cut in half lengthways. The canal is 7 to 9 mm
// wide and ends at the eardrum.
const drum = alongX(cylinder(3.75, 3.75, 0.22, M.drum, [DRUM_X, 0, 0], { segments: 40 }));
{
  const g = new THREE.Group(); g.position.y = CY;
  const inner = curve([[-37.4, 3.6], [-30, 3.8], [-20, 4.2], [-12, 4.6], [-8.4, 5.1], [-6.4, 6.3], [-4.6, 9], [-3.6, 13], [-3.4, 19]], 40);
  const outer = curve([[-3.4, 19], [-7.5, 19], [-10.5, 12], [-15, 8.3], [-24, 7.6], [-37.4, 7.4]], 30);
  g.add(spin([...inner, ...outer.slice(1), [-37.4, 3.6]], M.skin, { from: Math.PI / 2, sweep: Math.PI, caps: true, segments: 72 }));
  g.add(drum);
  g.add(cylinder(1.5, 1.5, CY - 9, M.brushed, [-25, -CY + (CY - 9) / 2 + 1.5, -4.2], { segments: 20 }));
  g.add(cylinder(12, 13, 1.8, M.dark, [-25, -CY + 0.9, -4.2], { segments: 48 }));
  add('ear', g, zero, zero);
}

// The case: a cell ten times the size of a bud's, two wells, and a lid on a hinge. The second bud
// stands in its well.
const led = new THREE.Mesh(new THREE.SphereGeometry(0.7, 12, 8), new THREE.MeshBasicMaterial({ color: 0x46d17a, toneMapped: false }));
{
  const g = new THREE.Group(); g.position.set(92, 0, -8); g.rotation.y = -0.35;
  const W = 58, H = 27, D = 25;
  g.add(box([W, H, D], M.caseShell, [0, H / 2, 0], 5.5));
  g.add(box([W - 5, 0.8, D - 5], M.caseInner, [0, H - 0.1, 0], 0.3));
  [-13.5, 13.5].forEach(x => g.add(cylinder(8.6, 8.6, 0.5, M.dark, [x, H + 0.25, 0], { segments: 40 })));
  const lid = new THREE.Group(); lid.position.set(0, H, -D / 2); lid.rotation.x = -1.85;
  lid.add(box([W, 13, D], M.caseShell, [0, 6.5, D / 2], 5.5));
  lid.add(box([W - 5, 0.8, D - 5], M.caseInner, [0, 0.2, D / 2], 0.3));
  g.add(lid);
  g.add(alongX(cylinder(1.1, 1.1, 22, M.steel, [0, H + 0.4, -D / 2 - 0.3], { segments: 12 })));
  // The second bud, upright in the left well with its stem in the case.
  const second = new THREE.Group(); second.add(budShell(), budTip());
  const turn = 2.6;
  second.position.set(-13.5 - STEM.x * Math.cos(turn), H + 9.5, STEM.x * Math.sin(turn)); second.rotation.y = turn;
  g.add(second);
  g.userData.anchor = [W / 2 - 6, H - 4, D / 2];
  add('case', g, zero, zero);
  led.position.set(0, H - 9, D / 2 + 0.25); g.add(led); // lights itself, so it stays out of the focus styling
}

// ---------- Waves ----------
// A wave is drawn as a flat ribbon in the plane of the cut. The noise comes in from the right
// in copper; in the canal, the anti-noise is its mirror image in blue; what is left of the two
// runs on to the eardrum in the ink colour.
const waves = new THREE.Group(); waves.position.set(0, CY, 0); root.add(waves);
function ribbon(hex, n = 120) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 6), 3));
  const index = [];
  for (let i = 0; i < n - 1; i++) { const a = i * 2; index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  geo.setIndex(index);
  const material = new THREE.MeshBasicMaterial({ color: linear(hex), transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false });
  const mesh = new THREE.Mesh(geo, material);
  mesh.frustumCulled = false; mesh.visible = false; mesh.userData.noContactShadow = true; waves.add(mesh);
  return { mesh, material, n };
}
// Draws y = fn(x) from x0 to x1 as a ribbon `width` wide that thins to a point at both ends.
function draw(rb, x0, x1, fn, width, alpha, z = 0.5) {
  rb.mesh.visible = alpha > 0.01 && Math.abs(x1 - x0) > 0.5;
  if (!rb.mesh.visible) return;
  rb.material.opacity = alpha;
  const p = rb.mesh.geometry.attributes.position, n = rb.n, h = (x1 - x0) / (n - 1);
  for (let i = 0; i < n; i++) {
    const x = x0 + h * i, y = fn(x), slope = (fn(x + h * 0.5) - fn(x - h * 0.5)) / h;
    const len = Math.hypot(1, slope), u = i / (n - 1);
    const w = width * 0.5 * smooth(clamp01(Math.min(u, 1 - u) / 0.1));
    p.setXYZ(i * 2, x + slope / len * w, y - w / len, z);
    p.setXYZ(i * 2 + 1, x - slope / len * w, y + w / len, z);
  }
  p.needsUpdate = true;
}
const R = { outside: ribbon(0xd9783a, 200), noise: ribbon(0xd9783a), anti: ribbon(0x2c5a8c), left: ribbon(0x1b1a17) };
onPalette(p => R.anti.material.color.set(p.ghost).convertSRGBToLinear());
onThemeChange(theme => R.left.material.color.copy(linear(theme === 'dark' ? 0xe6edf5 : 0x1b1a17)));

// Signals on the wires: the noise the outer microphone hears (copper), the anti-noise on its way
// to the coil (blue), and what the inner microphone hears (brass).
const dot = softDot();
const signal = (hex, count, wire) => {
  const cloud = createParticles(bud, count, { color: linear(hex).getHex(), size: 1, map: dot, seed: i => ({ u: i / count }) });
  cloud.points.frustumCulled = false; cloud.material.depthTest = false; cloud.points.renderOrder = 5;
  cloud.curve = path(wire);
  return cloud;
};
const signals = { mic: signal(0xd9783a, 4, WIRE.mic), out: signal(0x2c5a8c, 9, WIRE.out), check: signal(0xd6a44a, 12, WIRE.check) };
onPalette(p => signals.out.material.color.set(p.ghost).convertSRGBToLinear());

// ---------- State and UI ----------
const state = { step: 0, explode: 0, targetExplode: 0, playing: true, focus: [], cut: false, t: 0, pitch: 5, sweep: false, anc: true, adapt: false, signals: [] };
const shown = { phase: 0, anc: 1, match: CHIP.match, pitch: -1, text: '' };
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
  story: EARPHONE_STORY, state,
  onStep: s => {
    state.focus = s.focus; state.cut = s.cut; state.t = 0;
    state.anc = !!s.anc; state.adapt = !!s.adapt; state.sweep = !!s.sweep; state.signals = s.signals ?? [];
    setPitch(s.pitch);
    const v = VIEWS[s.view], f = fit(), r = v.r * f.zoom;
    camGoal = { ...v, r, target: new THREE.Vector3(...v.target).add(v3(0, r * f.lift, 0)) };
    cam.theta = v.theta + THREE.MathUtils.euclideanModulo(cam.theta - v.theta + Math.PI, TAU) - Math.PI; // the short way round
  },
});
// Dragging the slider takes over from the sweep.
bindRange('pitch', v => { state.sweep = false; setPitch(v); });
createCallouts(stage, { parts, state, story: EARPHONE_STORY });

const focusStyle = {
  highlight: 0.16,
  opacity(name, mesh, hot) {
    if (name === 'ear' || name === 'case') return 1; // the ear model and the case are never in the way
    let alpha = 1;
    if (mesh.userData.cutaway && state.cut) alpha = hot ? 0.3 : 0.1;
    if (state.cut && state.focus.length && !hot) alpha = Math.min(alpha, 0.26);
    return alpha;
  },
};

// ---------- Readout ----------
const $ = id => document.getElementById(id);
const OUT = { box: $('readout'), pitch: $('r-pitch'), tip: $('r-tip'), anti: $('r-anti'), ear: $('r-ear') };
function showReadout(hz, on, match) {
  const tip = passive(hz), anti = on ? active(hz, match) : 0;
  const text = [pitchText(hz), lossText(tip), on ? lossText(anti) : 'Off', lossText(tip + anti)];
  if (text.join() === shown.text) return;
  shown.text = text.join();
  [OUT.pitch.textContent, OUT.tip.textContent, OUT.anti.textContent, OUT.ear.textContent] = text;
  OUT.box.classList.toggle('anc', on);
}

// ---------- Sound ----------
// The noise as the eardrum hears it: a rumble or a hiss at the slider's pitch that gets quieter
// as the tip and the anti-noise take it away. A soft click marks the anti-noise going on or off.
const noise = sound.loop({ type: 'noise', filter: 'bandpass', freq: 200, q: 1.1 });
let wasAnc = true;
function playSounds(hz, heard) {
  noise.set(state.playing ? 0.3 * heard ** 0.7 : 0, Math.max(90, Math.min(6000, hz)));
  if (state.anc !== wasAnc) { sound.click(0.1); wasAnc = state.anc; }
}

// ---------- Frame ----------
const snap = reduced || stage.capture; // ?capture renders stills, so it skips every ease
const tmp = new THREE.Vector3();
let readoutTimer = 0;
// In the step about the inner microphone the fit comes loose every 8 s, and the chip trims the
// anti-noise back: the level match goes from 30% off to within 3%.
function matchFor(t) {
  if (!state.adapt || snap) return CHIP.match;
  const c = t % 8;
  return CHIP.loose + (CHIP.match - CHIP.loose) * smooth(clamp01((c - 1.6) / 3));
}
startLoop(stage, dt => {
  dt = Math.max(0, dt); // the first frame can come with a time before the loop started
  update(state, focusStyle, snap ? 1 : 0.09, dt);
  if (camGoal) { // ease to the step's view once; after that the reader's own zoom wins
    const k = snap ? 1 : Math.min(1, dt * 2.6);
    for (const a of ['r', 'theta', 'phi']) cam[a] += (camGoal[a] - cam[a]) * k;
    cam.target.lerp(camGoal.target, k);
    if (Math.abs(camGoal.r - cam.r) < 0.5 && Math.abs(camGoal.theta - cam.theta) < 0.01 && cam.target.distanceTo(camGoal.target) < 0.2) camGoal = null;
  }
  if (state.playing) state.t += dt;
  // The sweep walks the pitch up and down the slider: 40 Hz to 8 kHz and back in 16 s.
  if (state.sweep && state.playing && !snap) { const c = (state.t / 16 + 0.5) % 1; setPitch((c < 0.5 ? c * 2 : 2 - c * 2) * (PITCHES.length - 1)); }
  const hz = PITCHES[state.pitch];

  // How much of the noise gets past the tip, and what the anti-noise does to the rest.
  shown.anc += ((state.anc ? 1 : 0) - shown.anc) * (snap ? 1 : Math.min(1, dt * 3));
  shown.match = matchFor(state.t);
  const past = share(passive(hz));                       // as a share of the pressure outside
  const gain = antiGain(hz, shown.match) * shown.anc;    // the anti-noise, as a share of that
  const late = TAU * hz * lag();                         // and how late it is, in radians
  const left = Math.sqrt(1 + gain * gain - 2 * gain * Math.cos(late));

  // The waves. They are drawn far shorter and slower than they are, so they can be followed.
  if (state.playing) shown.phase += dt * showHz(hz) * TAU;
  const k = TAU / showLength(hz), ph = shown.phase;
  const wave = x => Math.sin(k * x + ph);
  // In an exploded view the parts are not where the waves are, and during the intro the model
  // is still coming together.
  const calm = clamp01(1 - state.explode * 8) * (stage.intro.t >= 1 ? 1 : 0);
  const see = reduced && !stage.capture ? 0 : calm;
  draw(R.outside, OUTSIDE.to, OUTSIDE.from, x => WAVE * wave(x), 0.7, 0.95 * see);
  const split = CANAL.to + (SPLIT - CANAL.to) * shown.anc;
  draw(R.noise, CANAL.from, split, x => WAVE * past * wave(x), 0.6, 0.95 * see);
  draw(R.anti, CANAL.from, split, x => -WAVE * past * gain * Math.sin(k * x + ph - late), 0.6, 0.95 * see * clamp01(shown.anc * 1.5));
  draw(R.left, split - 0.4, CANAL.to, x => WAVE * past * (wave(x) - gain * Math.sin(k * x + ph - late)), 0.6, 0.95 * see * clamp01(shown.anc * 1.5));

  // The diaphragm and its coil play the anti-noise; the eardrum moves with what is left. Both
  // strokes are drawn very much larger than life.
  const push = -0.3 * gain * Math.sin(k * -4 + ph - late);
  moving.forEach(m => { m.position.x = see ? push : 0; });
  drum.position.x = DRUM_X + (see ? 0.45 * past * left * wave(DRUM_X) : 0);

  // Signals on the wires, while the shell is clear.
  const size = Math.max(0.8, Math.min(2.4, cam.r / 62));
  for (const [key, cloud] of Object.entries(signals)) {
    const on = state.cut && state.signals.includes(key) && calm > 0.5 && !reduced;
    if (!cloud.fade(on ? 0.95 : 0, snap ? 1 : Math.min(1, dt * 5))) { cloud.points.visible = false; continue; }
    cloud.points.visible = true; cloud.material.size = size;
    cloud.seeds.forEach((s, i) => {
      if (state.playing) s.u = THREE.MathUtils.euclideanModulo(s.u + dt * (key === 'mic' ? 0.5 : 0.22), 1);
      cloud.curve.getPointAt(s.u, tmp); cloud.place(i, tmp.x, tmp.y, tmp.z);
    });
    cloud.commit();
  }

  // The case's light breathes while it charges the second bud.
  led.material.color.setHex(0x46d17a).multiplyScalar(0.55 + 0.45 * Math.sin(state.t * 2.2));

  playSounds(hz, past * left);
  readoutTimer -= dt;
  if (readoutTimer <= 0 || shown.pitch !== state.pitch) { showReadout(hz, state.anc, shown.match); readoutTimer = 0.2; shown.pitch = state.pitch; }
});
story.setStep(0, false);
