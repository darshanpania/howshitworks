import * as THREE from 'three';
import { createStage, addFloor, addStudioLights } from '../../src/engine/stage.js';
import { createParts } from '../../src/engine/parts.js';
import { createCallouts } from '../../src/engine/callouts.js';
import { createStoryUI, bindRange, showRange } from '../../src/engine/story-ui.js';
import { sound } from '../../src/engine/sound.js';
import { startLoop, reducedMotion as reduced } from '../../src/engine/loop.js';
import { onPalette } from '../../src/engine/studio.js';
import { box, cylinder, lathe, roundedRect, extrudeUp } from '../../src/kit/shapes.js';
import { createMaterials, linear } from '../../src/kit/materials.js';
import { softDot, createParticles } from '../../src/kit/effects.js';
import { GUITAR_STORY } from './story.js';
import { GUITAR, STRINGS, SWITCH, PERIOD, speaking, stringNote, stringHz, tensionKg, modes, signal, volts, play } from './guitar.js';

// ---------- Layout ----------
// Scale: 1 unit = 1 cm. The guitar lies on its back on the floor, face up, with the headstock to
// the left (-x). u runs along the strings from the saddles (u = 0) to the nut (u = 64.77, the
// scale length); v runs across them, positive toward the low E (the bass side, world -z).
const v3 = (x, y, z) => new THREE.Vector3(x, y, z);
const zero = v3(0, 0, 0);
const deg = THREE.MathUtils.degToRad;
const clamp01 = v => Math.max(0, Math.min(1, v));
const smooth = v => { v = clamp01(v); return v * v * (3 - 2 * v); };

const SCALE = GUITAR.scale, SADDLE = 34, TOP = 4.45;
const X = u => SADDLE - u, Z = v => -v;
const at = (u, y, v) => v3(X(u), y, Z(v));
const FB_TOP = 5.45, FB_T = 0.6, HEAD_TOP = FB_TOP - FB_T, FB_END = 18.7;
const Y_NUT = 5.66, Y_SADDLE = 5.95;
const stringY = u => Y_SADDLE + (Y_NUT - Y_SADDLE) * u / SCALE;
const stringV = (i, u) => { const s = 2.825 - 1.13 * i, n = 1.75 - 0.7 * i; return s + (n - s) * u / SCALE; };
const neckHalf = u => 2.1 + 0.75 * (SCALE - u) / (SCALE - FB_END);
const PICKUPS = { neck: { u: 16.2, angle: 0 }, middle: { u: 9.8, angle: 0 }, bridge: { u: 4.1, angle: 0.176 } };

// The body: a double-cutaway outline (u, v), drawn inside its 9 mm roundover. The bass horn
// reaches about the 13th fret; the neck meets the body at the 16th.
const BODY = [[-12.4, 0], [-11.8, 5.2], [-9.9, 10.2], [-6.4, 13.8], [-2, 15.3], [3, 15.1], [7.5, 13.6], [11.5, 12],
  [15, 11.8], [19, 12.4], [24, 12.4], [28, 11.4], [30.6, 10.1], [31.8, 8.8], [31.2, 7.6], [29.2, 6.5], [26.6, 5.6],
  [24.6, 4.7], [24, 3.4], [23.8, 1.5], [23.4, -1.6], [22.4, -3.4], [22.3, -5], [23.6, -7], [25.2, -8.6], [25.6, -9.8],
  [24.4, -11], [21.4, -11.7], [17, -11.5], [13, -11.9], [8.5, -13.4], [3, -15], [-2, -15.3], [-6.4, -13.8], [-9.9, -10.2],
  [-11.8, -5.2]];
// The pickguard: round the neck end, up into the bass horn, across in front of the bridge and
// down round the knobs.
const GUARD = [[18.4, 3], [22.4, 3.5], [24.8, 4.9], [25.7, 6.5], [25, 8], [22.5, 8.9], [16, 8.7], [10, 8.4], [5.5, 7.9],
  [2.4, 7], [1.7, 4.6], [1.6, -3.8], [-0.6, -4.4], [-3.6, -4.8], [-6.6, -5.8], [-8.6, -8], [-8.4, -10.4], [-6.4, -12],
  [-2.6, -12.4], [2.5, -11.6], [8, -10.4], [13, -9.7], [16.4, -9.4], [19.6, -8.7], [21, -7.2], [21.1, -5.3], [20.7, -3.4]];
// The headstock beyond the nut (du from the nut, v): a straight bass edge for the tuners.
const HEAD = [[-0.6, 2.15], [1.2, 2.25], [2.6, 2.7], [3.6, 3.5], [4.4, 4.2], [8, 4.45], [12, 4.5], [15.5, 4.55], [17.6, 4.45],
  [18.9, 3.9], [19.3, 2.9], [19, 1.9], [18, 1.1], [16.6, 0.65], [15.2, 0.3], [13.5, 0], [11, -0.4], [9, -1], [7.2, -1.9],
  [5.6, -2.65], [4, -2.95], [2.4, -2.8], [1, -2.35], [-0.6, -2.15]];
const TUNER = i => ({ du: 3.9 + 2.45 * i, v: 3 + 0.04 * i });
const KNOBS = { volume: [3.9, -8.1], tone1: [-0.6, -9.4], tone2: [-5.2, -10.5] };
const SWITCH_AT = [8, -6.4], JACK_AT = [-1, -13.95];

const VIEWS = {
  whole: { r: 128, theta: 0.5, phi: 0.85, target: [8, 2, 2] },
  frets: { r: 78, theta: 0.12, phi: 0.66, target: at(38, 4, -1).toArray() },
  pickup: { r: 30, theta: 0.85, phi: 1.0, target: at(15.5, 5.6, 1.2).toArray() },
  coil: { r: 26, theta: 0.5, phi: 0.95, target: at(16.2, 6.4, 0).toArray() },
  pickups: { r: 46, theta: 0.3, phi: 0.82, target: at(8, 5, -2).toArray() },
  hum: { r: 32, theta: 0.45, phi: 0.92, target: at(13, 5.5, 0).toArray() },
  controls: { r: 33, theta: 0.5, phi: 0.92, target: at(-0.5, 7.5, -9.5).toArray() },
  jack: { r: 62, theta: 0.6, phi: 0.95, target: at(3, 2, -8).toArray() },
};

// ---------- Stage and light ----------
const stage = createStage(document.getElementById('c'), {
  fov: 36, pbr: true, camera: VIEWS.whole, zoom: [10, 230], phiLimit: 0.22,
});
const { scene, cam } = stage;
stage.camera.far = 900; stage.camera.updateProjectionMatrix();
addStudioLights(stage, { key: [45, 75, 40], extent: 62, far: 240, scale: 4 });
addFloor(stage, 0, { size: 180, cell: 2, opacity: 0.12, center: [0, 4], height: 26, blur: 3.5, shadowSize: 125 }); // 2 cm grid

// ---------- Materials ----------
const M = createMaterials({
  body: { color: 0xe6e6e6, roughness: 0.16, envMapIntensity: 0.6, map: sunburst() }, // a tight gloss, so the burst shows
  edge: { color: 0x1f0c06, roughness: 0.26 },
  guard: { color: 0xffffff, roughness: 0.56, map: tortoise() }, // tortoiseshell pickguard
  guardPly: { color: 0xece6d8, roughness: 0.5 },
  maple: { color: 0xc98a3e, roughness: 0.42 },
  rosewood: { color: 0x3b2216, roughness: 0.62 },
  pearl: { color: 0xf3efe6, roughness: 0.25 },
  bone: { color: 0xeee6d2, roughness: 0.45 },
  fret: { look: 'steel', color: 0xe2e5e8, roughness: 0.16 },
  chrome: { look: 'steel', color: 0xf0f2f5, metalness: 1, roughness: 0.08 },
  plain: { look: 'steel', color: 0xe8ebee, roughness: 0.2 },    // plain steel strings
  wound: { look: 'brushed', color: 0xc6c9cd, roughness: 0.4 },  // nickel-wound strings
  cover: { color: 0xf1ecdf, roughness: 0.38 },    // pickup covers, knobs, switch tip
  fibre: { color: 0x2a2522, roughness: 0.8 },     // bobbin flatwork
  alnico: { color: 0x9ba2aa, metalness: 0.8, roughness: 0.34 },
  coil: { look: 'copper', color: 0xffffff, map: windings() },
  steel: 'steel', brushed: 'brushed', brass: 'brass', rubber: 'rubber', dark: 'dark',
  can: { look: 'brushed', color: 0xc8cdd2, side: THREE.DoubleSide },
  track: { color: 0x1a1a1a, roughness: 0.85, side: THREE.DoubleSide },
  cap: { color: 0xd8731e, roughness: 0.5 },      // the tone capacitor
  white: { color: 0xece4d2, roughness: 0.6 },     // cloth-covered wire
  black: { color: 0x1d1d1f, roughness: 0.6 },
}, { pbr: true });

// A three-tone sunburst over faint alder grain, laid on the body's front and back in shape units (cm).
function sunburst() {
  const W = 1024, H = 740, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'), px = W / 49;
  g.fillStyle = '#e7a237'; g.fillRect(0, 0, W, H);
  g.globalAlpha = 0.07; g.strokeStyle = '#6b3410';
  for (let i = 0; i < 90; i++) {
    const y = Math.random() * H, a = 4 + Math.random() * 10;
    g.lineWidth = 0.6 + Math.random() * 1.8; g.beginPath();
    for (let x = 0; x <= W; x += 16) g.lineTo(x, y + a * Math.sin(x / (90 + i) + i));
    g.stroke();
  }
  g.globalAlpha = 1;
  g.save(); g.translate((X(9.5) + 1) * px, H / 2); g.scale(1.42, 1);
  const r = 15.6 * px, grad = g.createRadialGradient(0, 0, 0, 0, 0, r);
  grad.addColorStop(0, 'rgba(244,184,64,0)'); grad.addColorStop(0.42, 'rgba(226,138,40,0.35)');
  grad.addColorStop(0.62, 'rgba(160,52,20,0.92)'); grad.addColorStop(0.8, 'rgba(70,24,10,1)'); grad.addColorStop(1, 'rgba(26,10,5,1)');
  g.fillStyle = grad; g.fillRect(-W, -H, 2 * W, 2 * H);
  g.restore();
  const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = 4;
  t.repeat.set(1 / 49, 1 / 36); t.offset.set(1 / 49, 0.5);
  return t;
}
// Tortoiseshell: dark amber with soft red-brown blotches.
function tortoise() {
  const S = 512, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = '#2a1209'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 260; i++) {
    const x = Math.random() * S, y = Math.random() * S, r = 6 + Math.random() * 34;
    const tone = ['#6e2a10', '#8c3c14', '#a85a1e', '#1a0905', '#54200c'][i % 5];
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, tone); grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.globalAlpha = 0.55; g.fillStyle = grad; g.beginPath(); g.ellipse(x, y, r * 1.6, r, Math.random() * Math.PI, 0, Math.PI * 2); g.fill();
  }
  const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1 / 18, 1 / 18);
  return t;
}
// Fine copper windings, as stripes round the coil.
function windings() {
  const c = document.createElement('canvas'); c.width = 8; c.height = 64;
  const g = c.getContext('2d');
  for (let y = 0; y < 64; y += 4) { g.fillStyle = '#e09a62'; g.fillRect(0, y, 8, 2); g.fillStyle = '#9c5a2e'; g.fillRect(0, y + 2, 8, 2); }
  const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1, 1.4);
  return t;
}

// ---------- Helpers ----------
// A closed outline through (u, v) points, smoothed, in the extrude plane (shape x = world x, shape y = v).
function outline(points, n = 260) {
  const curve = new THREE.CatmullRomCurve3(points.map(([u, v]) => v3(X(u), v, 0)), true, 'centripetal');
  return curve.getSpacedPoints(n).slice(0, -1).map(p => new THREE.Vector2(p.x, p.y));
}
const shapeOf = (pts, holes = []) => { const s = new THREE.Shape(pts); s.holes.push(...holes); return s; };
// A pickup-shaped opening (rounded ends), centred on (u, v) and turned by angle, as a hole Path.
function slot(u, v, w, h, angle = 0) {
  const p = new THREE.Path(), r = w / 2, s = Math.sin(angle), c = Math.cos(angle), n = 48;
  for (let k = 0; k <= n; k++) {
    const a = k / n * Math.PI * 2, end = Math.sin(a) > 0 ? 1 : -1;
    const lx = r * Math.cos(a), ly = (h / 2 - r) * end + r * Math.sin(a);
    const x = X(u) + lx * c + ly * s, y = v + ly * c - lx * s;
    if (k === 0) p.moveTo(x, y); else p.lineTo(x, y);
  }
  return p;
}
// A point on a pickup-shaped loop (half-width a across the strings, half-length b along them), t in 0..1.
function loopPoint(t, a, b, out) {
  const straight = 2 * (b - a), arc = Math.PI * a, total = 2 * straight + 2 * arc;
  let d = THREE.MathUtils.euclideanModulo(t, 1) * total;
  if (d < straight) return out.set(a, 0, -(b - a) + d);
  d -= straight;
  if (d < arc) { const q = d / a; return out.set(a * Math.cos(q), 0, (b - a) + a * Math.sin(q)); }
  d -= arc;
  if (d < straight) return out.set(-a, 0, (b - a) - d);
  d -= straight; const q = d / a;
  return out.set(-a * Math.cos(q), 0, -(b - a) - a * Math.sin(q));
}
const tube = (points, r, mat, segments = 64) => new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), segments, r, 8, false), mat);

// ---------- Parts ----------
const root = new THREE.Group(); scene.add(root);
const { parts, add, update } = createParts(root, { shadows: true, lively: true });

// Body: solid alder with a 9 mm roundover, sunburst on top, two strap buttons.
{
  const g = new THREE.Group();
  const geo = new THREE.ExtrudeGeometry(shapeOf(outline(BODY)), { depth: TOP - 1.8, bevelEnabled: true, bevelSize: 0.9, bevelThickness: 0.9, bevelSegments: 6, curveSegments: 12 });
  geo.rotateX(-Math.PI / 2); geo.translate(0, 0.9, 0);
  const body = new THREE.Mesh(geo, [M.body, M.edge]); body.userData.cutaway = true; g.add(body);
  const button = [[0.01, 0], [0.55, 0], [0.55, 0.5], [0.28, 0.62], [0.28, 0.95], [0.6, 1.05], [0.62, 1.2], [0.01, 1.28]];
  [[-13.3, 0, Math.PI], [32.6, 9.3, -1.1]].forEach(([u, v, a]) => {
    const b = lathe(button, M.chrome, { segments: 24 }); b.position.copy(at(u, 2.2, v)); b.rotation.set(0, a, Math.PI / 2); g.add(b);
  });
  g.userData.anchor = at(-6, TOP, 10).toArray();
  add('body', g, zero, zero);
}

// Neck: a maple neck with a rosewood fretboard, 21 nickel frets, pearl dots, a bone nut and the headstock.
{
  const g = new THREE.Group();
  const board = [[SCALE, 2.1], [FB_END, 2.85], [FB_END, -2.85], [SCALE, -2.1]].map(([u, v]) => new THREE.Vector2(X(u), v));
  g.add(extrudeUp(new THREE.Shape(board), FB_T - 0.06, M.rosewood, HEAD_TOP + 0.03, 0.03));
  const len = SCALE - FB_END, shaft = new THREE.CylinderGeometry(2.85, 2.1, len, 40, 1, false, 0, Math.PI);
  shaft.rotateZ(-Math.PI / 2); shaft.scale(1, 0.72, 1); shaft.translate((X(SCALE) + X(FB_END)) / 2, HEAD_TOP, 0);
  g.add(new THREE.Mesh(shaft, M.maple));
  g.add(extrudeUp(shapeOf(outline(HEAD.map(([du, v]) => [SCALE + du, v]), 160)), 1.1, M.maple, HEAD_TOP - 1.25, 0.15));
  const frets = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.5, 0.5, 1, 14).rotateX(Math.PI / 2), M.fret, GUITAR.frets);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion();
  for (let n = 1; n <= GUITAR.frets; n++) {
    const u = speaking(n);
    frets.setMatrixAt(n - 1, m.compose(at(u, FB_TOP, 0), q, v3(0.22, 0.26, 2 * neckHalf(u) - 0.04)));
  }
  g.add(frets);
  [3, 5, 7, 9, 12, 15, 17, 19, 21].forEach(n => {
    const u = (speaking(n - 1) + speaking(n)) / 2;
    (n === 12 ? [1.1, -1.1] : [0]).forEach(v => g.add(cylinder(0.3, 0.3, 0.02, M.pearl, at(u, FB_TOP + 0.005, v), { segments: 20 })));
  });
  g.add(box([0.5, 0.78, 4.3], M.bone, at(SCALE + 0.25, HEAD_TOP + 0.38, 0), 0.08));
  g.userData.anchor = at(speaking(12), FB_TOP, -2.4).toArray();
  add('neck', g, zero, v3(-6, 0, 0));
}

// Where a fingertip holds the string down: the fret it presses onto glows copper, with a dot on the
// string just behind it. Added after the parts are registered, so focus and x-ray leave them alone.
const pressMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
onPalette(p => pressMat.color.set(p.rim).convertSRGBToLinear());
const pressFret = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 1, 14).rotateX(Math.PI / 2), pressMat);
const pressDot = new THREE.Mesh(new THREE.SphereGeometry(0.26, 20, 12), pressMat);
[pressFret, pressDot].forEach(m => { m.visible = false; m.renderOrder = 2; m.userData.noContactShadow = true; });

// Tuners: six posts in a line on the headstock, gears under it and buttons out of the bass side.
{
  const g = new THREE.Group();
  const knob = [[0.01, -0.18], [0.5, -0.18], [0.78, -0.1], [0.82, 0], [0.78, 0.1], [0.5, 0.18], [0.01, 0.18]];
  STRINGS.forEach((_, i) => {
    const { du, v } = TUNER(i), u = SCALE + du;
    g.add(cylinder(0.45, 0.48, 0.16, M.chrome, at(u, HEAD_TOP + 0.08, v), { segments: 20 }));
    g.add(cylinder(0.27, 0.27, 1.3, M.chrome, at(u, HEAD_TOP + 0.7, v), { segments: 16 }));
    g.add(box([1.15, 0.95, 1.7], M.chrome, at(u, HEAD_TOP - 1.9, v + 0.3), 0.2));
    const shaft = cylinder(0.12, 0.12, 2.6, M.chrome, at(u, HEAD_TOP - 1.9, v + 2.2), { segments: 10 }); shaft.rotation.x = Math.PI / 2; g.add(shaft);
    const b = lathe(knob, M.chrome, { segments: 24 }); b.scale.set(1, 1, 0.55); b.rotation.x = Math.PI / 2; b.position.copy(at(u, HEAD_TOP - 1.9, v + 3.8)); g.add(b);
  });
  g.userData.anchor = at(SCALE + TUNER(2).du, HEAD_TOP + 1.3, TUNER(2).v).toArray();
  add('tuners', g, zero, v3(-6, 1.6, 0));
}

// Strings: the six speaking lengths from the nut to the saddles swing; the bits beyond stay put.
// Each is a fine tube whose rings are moved every frame. Shown about 1.4× thicker than life.
const SWING = v3(0, 0.35, 0.94).normalize(); // across the strings and a little up, toward the poles
const ROWS = 180;
const strings = [];
{
  const g = new THREE.Group();
  STRINGS.forEach((s, i) => {
    const a = at(0, Y_SADDLE, stringV(i, 0)), b = at(SCALE, Y_NUT, stringV(i, SCALE));
    const len = a.distanceTo(b), r = Math.max(0.032, s.gauge * 2.54 / 2 * 1.4);
    const geo = new THREE.CylinderGeometry(r, r, len, 6, ROWS, true); geo.translate(0, len / 2, 0);
    const mesh = new THREE.Mesh(geo, s.wound ? M.wound : M.plain);
    mesh.position.copy(a); mesh.quaternion.setFromUnitVectors(v3(0, 1, 0), b.clone().sub(a).normalize());
    mesh.userData.noShadow = true;
    g.add(mesh);
    const inv = mesh.quaternion.clone().invert();
    strings.push({
      i, mesh, len, r, rest: Float32Array.from(geo.attributes.position.array),
      swing: SWING.clone().applyQuaternion(inv), up: v3(0, 1, 0).applyQuaternion(inv),
      t0: -1e3, fret: 0, modes: [], vis: 1, press: 0, shown: 0, dirty: true,
    });
    // From the nut to the tuner post, and from the saddle down into the bridge.
    const { du, v } = TUNER(i);
    g.add(tube([at(SCALE, Y_NUT, stringV(i, SCALE)), at(SCALE + du, HEAD_TOP + 0.55, v - 0.3)], r, mesh.material, 8));
    const wrap = new THREE.Mesh(new THREE.TorusGeometry(0.32, r * 1.3, 6, 20), mesh.material);
    wrap.position.copy(at(SCALE + du, HEAD_TOP + 0.55, v)); wrap.rotation.x = Math.PI / 2; g.add(wrap);
    g.add(tube([a, at(-0.9, 5.2, stringV(i, 0)), at(-2.2, 4.7, stringV(i, 0))], r, mesh.material, 8));
  });
  g.userData.anchor = at(26, stringY(26), stringV(0, 26)).toArray();
  add('strings', g, zero, v3(0, 7, 0));
}
parts.neck.group.children[0].add(pressFret);
parts.strings.group.children[0].add(pressDot);

// Bridge: a steel plate, six bent-steel saddles and the tremolo arm.
{
  const g = new THREE.Group();
  g.add(box([4.3, 0.2, 7.2], M.chrome, at(-1.05, TOP + 0.1, 0), 0.06));
  STRINGS.forEach((_, i) => {
    const v = stringV(i, 0);
    g.add(box([2.8, Y_SADDLE - TOP - 0.3, 1.02], M.chrome, at(-1.15, (TOP + 0.2 + Y_SADDLE - 0.1) / 2, v), 0.12));
    g.add(cylinder(0.14, 0.14, 0.12, M.steel, at(-1.2, Y_SADDLE - 0.06, v + 0.3), { segments: 10 }));
    g.add(cylinder(0.16, 0.18, 0.12, M.chrome, at(0.75, TOP + 0.25, v), { segments: 12 }));
  });
  const arm = [at(-2.6, TOP + 0.2, -3.2), at(-2.6, 6.4, -3.2), at(-3.4, 6.9, -3.9), at(-6.2, 7.2, -5.6), at(-8.6, 7.1, -6.9)];
  g.add(tube(arm, 0.2, M.chrome, 48));
  const tip = cylinder(0.32, 0.3, 2.2, M.cover, zero, { segments: 16 });
  tip.position.copy(arm[4]).lerp(arm[3], 0.18); tip.lookAt(arm[3]); tip.rotateX(Math.PI / 2); g.add(tip);
  add('bridge', g, zero, v3(0, 2, 0));
}

// Pickguard: a white top ply over a black middle ply, with openings for the pickups and switch.
{
  const g = new THREE.Group(), pts = outline(GUARD, 220);
  const holes = () => [
    ...Object.values(PICKUPS).map(p => slot(p.u, 0, 2.05, 8.6, -p.angle)),
    slot(SWITCH_AT[0], SWITCH_AT[1], 0.42, 2.6, deg(25) - Math.PI / 2),
  ];
  g.add(extrudeUp(shapeOf(pts, holes()), 0.13, M.guardPly, TOP, 0));
  const inner = pts.map(p => p.clone());
  const c = inner.reduce((s, p) => s.add(p), new THREE.Vector2()).divideScalar(inner.length);
  inner.forEach(p => p.add(c.clone().sub(p).setLength(0.1)));
  const top = extrudeUp(shapeOf(inner, holes()), 0.06, M.guard, TOP + 0.14, 0.03); top.userData.cutaway = true; g.add(top);
  g.children[0].userData.cutaway = true;
  for (let k = 0; k < 11; k++) {
    const p = pts[Math.round(k / 11 * pts.length) % pts.length], q = p.clone().add(c.clone().sub(p).setLength(0.5));
    g.add(cylinder(0.2, 0.22, 0.08, M.chrome, v3(q.x, TOP + 0.26, -q.y), { segments: 12 }));
  }
  g.userData.anchor = at(22, TOP + 0.3, 7).toArray();
  add('pickguard', g, zero, v3(0, 2.2, 0));
}

// Pickups: six Alnico rods through two fibre plates, 8,000 turns of copper round them, and a cover.
// The middle pickup is wound the other way with its magnets flipped.
const POLE_TOP = FB_TOP + 0.04, COIL = { lo: 4.07, hi: 5.2, a: 0.69, b: 3.4 };
const coilDots = {}, polarity = {};
// Each pickup is a part of its own; the names are spelled out so the story test can find them.
const addPickup = {
  neck: g => add('neckPickup', g, at(PICKUPS.neck.u, 0, 0), v3(0, 4.4, 0)),
  middle: g => add('middlePickup', g, at(PICKUPS.middle.u, 0, 0), v3(0, 4.4, 0)),
  bridge: g => add('bridgePickup', g, at(PICKUPS.bridge.u, 0, 0), v3(0, 4.4, 0)),
};
const dot = softDot();
for (const [name, p] of Object.entries(PICKUPS)) {
  const g = new THREE.Group(); g.rotation.y = p.angle;
  const poles = STRINGS.map((_, i) => Z(stringV(i, p.u)) / Math.cos(p.angle));
  const stagger = [0.03, 0.06, 0.09, 0.09, 0, 0];
  const cover = new THREE.Shape(roundedRect(1.9, 8.4, 0.9).getPoints(40));
  poles.forEach(z => cover.holes.push(new THREE.Path().absarc(0, -z, 0.27, 0, Math.PI * 2, true)));
  const shell = extrudeUp(cover, 1.45, M.cover, 3.9, 0.1); shell.userData.cutaway = true; g.add(shell);
  [3.95, 5.2].forEach(y => g.add(extrudeUp(new THREE.Shape(roundedRect(1.55, 7.1, 0.7).getPoints(30)), 0.12, M.fibre, y, 0)));
  const ring = new THREE.Shape(roundedRect(COIL.a * 2, COIL.b * 2, COIL.a).getPoints(40));
  ring.holes.push(new THREE.Path(roundedRect(0.62, 6, 0.3).getPoints(24)));
  g.add(extrudeUp(ring, COIL.hi - COIL.lo, M.coil, COIL.lo, 0));
  poles.forEach((z, i) => g.add(cylinder(0.245, 0.245, POLE_TOP + stagger[i] - 3.85, M.alnico, v3(0, (POLE_TOP + stagger[i] + 3.85) / 2, z), { segments: 16 })));
  g.userData.anchor = [0, 5.4, 4.2];
  addPickup[name](g);
  // Added after the part is registered, so focus and x-ray leave them alone.
  // Current: copper dots running round the coil, at three heights.
  const dots = createParticles(g, 72, { color: linear(0xf08a3c).getHex(), size: 0.5, map: dot, seed: i => ({ t: (i % 24) / 24, y: COIL.lo + 0.2 + 0.36 * Math.floor(i / 24) }) });
  dots.points.frustumCulled = false; dots.points.renderOrder = 2;
  coilDots[name] = { dots, phase: 0 };
  // Magnet polarity: a coloured cap on each pole, shown for the hum step.
  const caps = STRINGS.map((_, i) => {
    const mat = new THREE.MeshBasicMaterial({ color: name === 'middle' ? linear(0x4aa3e0) : linear(0xe0603a), transparent: true, opacity: 0, depthWrite: false });
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.02, 16), mat);
    cap.position.set(0, POLE_TOP + stagger[i] + 0.012, poles[i]); cap.userData.noContactShadow = true; g.add(cap);
    return cap;
  });
  polarity[name] = caps;
}

// Field lines from the low E pole of the neck pickup, reaching up into the string.
const field = [], fieldMat = new THREE.LineBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
onPalette(p => fieldMat.color.set(p.ghost).convertSRGBToLinear());
{
  const g = parts.neckPickup.group.children[0], z0 = Z(stringV(0, PICKUPS.neck.u));
  const mat = fieldMat;
  [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dz]) => [0.55, 1.05, 1.6].forEach(s => {
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(32 * 3), 3));
    const line = new THREE.Line(geo, mat); line.frustumCulled = false; line.renderOrder = 3; g.add(line);
    field.push({ line, dx, dz, s, z0 });
  }));
}

// 5-way switch: a lever in a slot, with a white tip.
const lever = new THREE.Group();
{
  const g = new THREE.Group(); g.position.copy(at(SWITCH_AT[0], 0, SWITCH_AT[1])); g.rotation.y = -deg(25);
  g.add(box([5.2, 1.1, 1.4], M.dark, v3(0, TOP - 0.75, 0), 0.1));
  for (let k = 0; k < 8; k++) g.add(box([0.25, 0.5, 0.06], M.brass, v3(-2.1 + k * 0.6, TOP - 1.5, 0.75), 0));
  lever.add(box([0.3, 1.6, 0.08], M.steel, v3(0, 0.8, 0), 0));
  lever.add(box([0.62, 0.95, 0.62], M.cover, v3(0, 1.85, 0), 0.24));
  lever.position.y = TOP - 0.2; g.add(lever);
  g.userData.anchor = [0, TOP + 1.9, 0];
  add('switch', g, zero, v3(0, 3.6, 0));
}

// Controls: three 250 kΩ pots under the volume and two tone knobs, and the tone capacitor.
const knobs = {}, wipers = {};
{
  const g = new THREE.Group();
  const profile = [[0.01, 0], [1.08, 0], [1.1, 0.3], [0.98, 0.42], [0.93, 1.42], [0.84, 1.6], [0.01, 1.64]];
  for (const [name, [u, v]] of Object.entries(KNOBS)) {
    const can = cylinder(1.2, 1.2, 0.95, M.can, at(u, TOP - 0.55, v), { segments: 32 }); can.userData.cutaway = true; g.add(can);
    const track = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.95, 32, 1, deg(-30), deg(300)).rotateX(-Math.PI / 2), M.track);
    track.position.copy(at(u, TOP - 0.45, v)); g.add(track);
    const wiper = new THREE.Group(); wiper.position.copy(at(u, TOP - 0.4, v));
    wiper.add(box([0.75, 0.06, 0.2], M.brass, v3(0.38, 0, 0), 0)); g.add(wiper); wipers[name] = wiper;
    for (let k = -1; k <= 1; k++) g.add(box([0.32, 0.5, 0.06], M.brass, at(u + k * 0.55, TOP - 0.85, v + 1.35), 0));
    g.add(cylinder(0.3, 0.3, 0.9, M.brushed, at(u, TOP + 0.15, v), { segments: 16 }));
    const knob = new THREE.Group(); knob.position.copy(at(u, TOP + 0.21, v));
    knob.add(lathe(profile, M.cover, { segments: 48 }));
    knob.add(box([0.08, 0.04, 0.32], M.dark, v3(0, 0.44, 0.86), 0));
    g.add(knob); knobs[name] = knob;
  }
  g.add(box([1.3, 0.55, 0.85], M.cap, at(-3.3, TOP - 0.7, -10.6), 0.25));
  g.userData.anchor = at(KNOBS.tone1[0], TOP + 1.7, KNOBS.tone1[1]).toArray();
  add('controls', g, zero, v3(0, 7, 0));
}

// Wiring under the pickguard: each pickup to the switch, the switch to the volume pot, then to the jack.
{
  const g = new THREE.Group(), y = TOP - 1.4;
  const sw = at(SWITCH_AT[0], y, SWITCH_AT[1]);
  Object.values(PICKUPS).forEach((p, k) => {
    const from = at(p.u, 3.8, -3.6);
    g.add(tube([from, at(p.u, y, -4.6), sw.clone().add(v3(-1.5 + k * 1.2, 0, -0.6))], 0.08, M.white, 24));
    g.add(tube([at(p.u + 0.3, 3.8, -3.6), at(p.u + 0.3, y - 0.15, -4.8), at(KNOBS.volume[0] + 1, y - 0.3, -7.2)], 0.08, M.black, 24));
  });
  g.add(tube([sw, at(KNOBS.volume[0] + 0.6, y, KNOBS.volume[1] + 1.3)], 0.08, M.white, 16));
  g.add(tube([at(KNOBS.volume[0], y, KNOBS.volume[1] - 0.6), at(0, y - 0.4, -12.6), at(JACK_AT[0], 2.2, JACK_AT[1] + 0.6)], 0.08, M.white, 24));
  add('wiring', g, zero, v3(0, 2.2, 0));
}

// Output jack: a chrome cup set into the body's edge, and the plug and cable that go to the amp.
const PLUG_DIR = v3(0.25, 0.62, 0.74).normalize();
const JACK = at(JACK_AT[0], TOP - 0.2, JACK_AT[1]);
{
  const g = new THREE.Group();
  const cup = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), M.chrome);
  cup.scale.set(2.3, 0.18, 1.35); cup.position.copy(JACK).setY(TOP + 0.02); g.add(cup);
  const socket = cylinder(0.62, 0.62, 0.3, M.chrome, zero, { segments: 24 });
  socket.position.copy(JACK).addScaledVector(PLUG_DIR, 0.1); socket.quaternion.setFromUnitVectors(v3(0, 1, 0), PLUG_DIR); g.add(socket);
  g.userData.anchor = JACK.toArray();
  add('jack', g, zero, zero);
}
const PLUG_END = JACK.clone().addScaledVector(PLUG_DIR, 6.2);
const CABLE = new THREE.CatmullRomCurve3([PLUG_END, PLUG_END.clone().addScaledVector(PLUG_DIR, 2.5),
  v3(PLUG_END.x + 4, 2.6, PLUG_END.z + 7), v3(PLUG_END.x + 9, 0.55, PLUG_END.z + 12), v3(PLUG_END.x + 24, 0.55, PLUG_END.z + 17),
  v3(PLUG_END.x + 48, 0.55, PLUG_END.z + 20), v3(PLUG_END.x + 75, 0.55, PLUG_END.z + 21)]);
{
  const g = new THREE.Group();
  const barrel = cylinder(0.6, 0.6, 3.4, M.chrome, zero, { segments: 24 });
  barrel.position.copy(JACK).addScaledVector(PLUG_DIR, 1.9); barrel.quaternion.setFromUnitVectors(v3(0, 1, 0), PLUG_DIR); g.add(barrel);
  const boot = cylinder(0.52, 0.42, 2.6, M.rubber, zero, { segments: 20 });
  boot.position.copy(JACK).addScaledVector(PLUG_DIR, 4.9); boot.quaternion.copy(barrel.quaternion); g.add(boot);
  g.userData.anchor = PLUG_END.toArray();
  add('cable', g, zero, zero);
  // The cord runs off toward the amp and fades out. It is not a part, so its fade survives the focus pass.
  const c = document.createElement('canvas'); c.width = 256; c.height = 4;
  const ctx = c.getContext('2d'), grad = ctx.createLinearGradient(0, 0, 256, 0);
  grad.addColorStop(0, '#fff'); grad.addColorStop(0.45, '#fff'); grad.addColorStop(1, '#000');
  ctx.fillStyle = grad; ctx.fillRect(0, 0, 256, 4);
  const cord = new THREE.Mesh(new THREE.TubeGeometry(CABLE, 160, 0.34, 10, false),
    new THREE.MeshStandardMaterial({ color: linear(0x1d2024), roughness: 0.6, alphaMap: new THREE.CanvasTexture(c), transparent: true }));
  cord.castShadow = true; cord.userData.noContactShadow = true; root.add(cord);
  CABLE.cord = cord;
}

// The signal on its way down the cable: dots that run toward the amp, as bright as the note is loud.
const cableDots = createParticles(scene, 40, { color: linear(0xf08a3c).getHex(), size: 1.1, map: dot, seed: i => ({ u: i / 40 }) });
cableDots.points.frustumCulled = false;

// ---------- State and UI ----------
const state = { step: 0, explode: 0, targetExplode: 0, playing: true, focus: [], cut: false, mode: 'strum', t: 0, fret: 0 };
const shown = { pick: -1, mode: '', pos: 4, string: 0, clock: 0, lever: 0, sig: null, sigTone: 10, since: 0, finger: 0, press: 0 };
let camGoal = null;
function fit() {
  const c = stage.renderer.domElement, a = c.clientWidth / Math.max(1, c.clientHeight);
  const small = globalThis.matchMedia?.('(max-width: 800px)').matches;
  return { zoom: Math.min(1.8, Math.max(1, 1.2 / a)) * (small ? 1.2 : 1), lift: small ? 0.06 : 0 };
}
const fretInput = document.getElementById('fret');
const showFret = () => showRange(fretInput, state.fret ? `Fret ${state.fret}` : 'Open');
const story = createStoryUI({
  story: GUITAR_STORY, state,
  onStep: s => {
    state.focus = s.focus; state.cut = s.cut; state.mode = s.mode; state.t = 0; shown.pick = -1;
    if (s.fret !== undefined) { state.fret = s.fret; fretInput.value = String(s.fret); showFret(); }
    if (stage.capture) return;
    const v = VIEWS[s.view], f = fit(), r = v.r * f.zoom;
    camGoal = { ...v, r, target: new THREE.Vector3(...v.target).add(v3(0, r * f.lift, 0)) };
    cam.theta = v.theta + THREE.MathUtils.euclideanModulo(cam.theta - v.theta + Math.PI, 2 * Math.PI) - Math.PI; // take the short way round
  },
});
bindRange('fret', v => { state.fret = v; showFret(); });
createCallouts(stage, { parts, state, story: GUITAR_STORY });

// cut: true clears every cutaway shell; a list clears only those parts and keeps the rest solid.
const clears = name => state.cut === true || (Array.isArray(state.cut) && state.cut.includes(name));
const focusStyle = {
  highlight: 0.16,
  opacity(name, mesh, hot) {
    let alpha = 1;
    if (mesh.userData.cutaway && clears(name)) alpha = hot ? 0.28 : 0.12;
    if (state.focus.length && !hot && (state.cut === true || state.explode > 0.12)) alpha = Math.min(alpha, 0.3);
    return alpha;
  },
};

// ---------- Plucks ----------
// A pick sets one string swinging. The 3D string swings in slow motion (about 30× slower for the low
// E); the readout and the sound use the real frequencies.
const visHz = (i, fret) => 2.3 * Math.sqrt(stringHz(i, fret) / stringHz(0));
const PULL_S = 0.09; // the pick pushes the string aside, then lets go
function pluck(i, fret, pos, tone) {
  const s = strings[i];
  s.t0 = shown.clock; s.fret = fret; s.vis = visHz(i, fret); s.dirty = true;
  s.modes = modes(i, fret, { count: 9 }).map(m => ({ ...m, tau: 2.4 / (1 + 0.35 * (m.n - 1)) }));
  shown.sig = signal({ string: i, fret, pos, tone }); shown.sigTone = tone;
  if (state.playing) pluckSound(shown.sig);
}
// Displacement (cm) of string s at distance d from the saddle, and its speed there, at time tau after the pick.
function swing(s, d, tau) {
  const L = speaking(s.fret);
  if (d >= L || !s.modes.length) return [0, 0];
  let y = 0, vy = 0;
  if (tau < PULL_S) {
    for (const m of s.modes) y += m.amp * Math.sin(m.n * Math.PI * d / L);
    return [y * smooth(tau / PULL_S) * 3.2, 0];
  }
  const t = tau - PULL_S;
  for (const m of s.modes) {
    const w = 2 * Math.PI * m.n * s.vis, k = m.amp * Math.sin(m.n * Math.PI * d / L) * Math.exp(-t / m.tau);
    y += k * Math.cos(w * t); vy -= k * w * Math.sin(w * t);
  }
  return [y * 3.2, vy * 3.2];
}

// Moves each string's rings: the swing, plus the dip where a fret holds it down.
function drawString(s) {
  const tau = shown.clock - s.t0, alive = tau < 9;
  const press = s.i === shown.string && state.fret > 0 ? 1 : 0;
  s.press += (press - s.press) * 0.25;
  if (!alive && !s.dirty && Math.abs(s.press - s.shown) < 0.001) return;
  s.shown = s.press; s.dirty = alive;
  const pos = s.mesh.geometry.attributes.position, arr = pos.array, rest = s.rest;
  const pressU = speaking(state.fret);
  const dip = (FB_TOP + 0.13 + s.r - stringY(pressU)) * s.press;
  const per = 7; // 6 radial segments + the seam
  for (let row = 0; row <= ROWS; row++) {
    const k0 = row * per, d = rest[k0 * 3 + 1] / s.len * SCALE;
    const [y] = alive ? swing(s, d, tau) : [0];
    const p = clamp01(d <= pressU ? d / pressU : (SCALE - d) / Math.max(1e-6, SCALE - pressU));
    const lift = dip * p;
    const ox = s.swing.x * y + s.up.x * lift, oy = s.swing.y * y + s.up.y * lift, oz = s.swing.z * y + s.up.z * lift;
    for (let k = k0; k < k0 + per; k++) {
      arr[k * 3] = rest[k * 3] + ox; arr[k * 3 + 1] = rest[k * 3 + 1] + oy; arr[k * 3 + 2] = rest[k * 3 + 2] + oz;
    }
  }
  pos.needsUpdate = true;
}

// ---------- Readout ----------
const $ = id => document.getElementById(id);
const R = { note: $('r-note'), pull: $('r-pull'), pickup: $('r-pickup'), peak: $('r-peak'), trace: document.querySelector('#r-trace polyline') };
const TRACE_N = 400, TRACE_S = 0.025, FULL = 0.35;
function showReadout(p) {
  const sig = shown.sig; if (!sig) return;
  R.note.textContent = `${sig.note} · ${sig.hz.toFixed(1)} Hz`;
  R.pull.textContent = `${tensionKg(p.string).toFixed(1)} kg`;
  R.pickup.textContent = SWITCH[shown.pos].name;
  // Triggered on the note, like a scope: the window starts at the same point of each cycle.
  const start = Math.floor(shown.since * sig.hz) / sig.hz, pts = [];
  let hi = 0;
  for (let i = 0; i <= TRACE_N; i++) {
    const t = start + TRACE_S * i / TRACE_N, v = volts(sig, t, state.t + t - shown.since);
    hi = Math.max(hi, Math.abs(v));
    pts.push(`${i},${(30 - 28 * Math.max(-1, Math.min(1, v / FULL))).toFixed(1)}`);
  }
  R.trace.setAttribute('points', pts.join(' '));
  R.peak.textContent = `${Math.round(hi * 1000)} mV`;
}

// ---------- Sound ----------
// Each pick is built from the harmonics that reach the jack, so the switch and the tone knob are audible.
function pluckSound(sig) {
  const hs = sig.harmonics.filter(h => h.hz < 6000).slice(0, 18);
  const total = hs.reduce((s, h) => s + Math.abs(h.volts), 0) || 1;
  hs.forEach(h => {
    const g = 0.2 * Math.abs(h.volts) / total;
    if (g > 0.002) sound.tone({ freq: h.hz, gain: g, attack: 0.003, release: Math.min(4.5, h.tau * 1.4) });
  });
  sound.noise({ gain: 0.06, release: 0.025, filter: 'highpass', freq: 2500 });
}
const humSound = sound.loop({ type: 'tone', wave: 'sawtooth', freq: GUITAR.mains });

// ---------- Frame ----------
const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();
const snap = reduced || stage.capture; // ?capture renders stills, so it skips every ease
let readoutTimer = 0;
startLoop(stage, (dt, now) => {
  dt = Math.max(0, dt); // the first frame's timestamp can come before the loop started
  update(state, focusStyle, snap ? 1 : 0.09, dt);
  if (camGoal) { // ease to the step's view once; after that the reader's own zoom wins
    const k = snap ? 1 : Math.min(1, dt * 3);
    for (const a of ['r', 'theta', 'phi']) cam[a] += (camGoal[a] - cam[a]) * k;
    cam.target.lerp(camGoal.target, k);
    if (Math.abs(camGoal.r - cam.r) < 0.5 && Math.abs(camGoal.theta - cam.theta) < 0.01 && cam.target.distanceTo(camGoal.target) < 0.2) camGoal = null;
  }
  if (state.playing) { state.t = (state.t + dt) % PERIOD[state.mode]; shown.clock += dt; }
  const p = play(state.mode, state.t);
  shown.since = p.since;
  if (p.pos !== shown.pos && state.playing) sound.click(0.1);
  shown.pos = p.pos; shown.string = p.string;
  if (p.pick !== shown.pick || state.mode !== shown.mode || shown.fret !== state.fret) {
    pluck(p.string, state.fret, p.pos, p.tone);
    shown.pick = p.pick; shown.mode = state.mode; shown.fret = state.fret;
  } else if (Math.abs(shown.sigTone - p.tone) > 0.05) { // the tone knob turns while the note rings
    shown.sig = signal({ string: p.string, fret: state.fret, pos: p.pos, tone: p.tone }); shown.sigTone = p.tone;
  }

  strings.forEach(drawString);
  // The pressed fret glows, and a dot marks the fingertip just behind it.
  shown.finger += ((state.fret > 0 ? 1 : 0) - shown.finger) * (snap ? 1 : Math.min(1, dt * 6));
  if (state.fret > 0) shown.press = state.fret; // keep the last fret while the glow fades out
  pressFret.visible = pressDot.visible = shown.finger > 0.02 && shown.press > 0;
  pressMat.opacity = 0.9 * shown.finger;
  if (pressFret.visible) {
    const u = speaking(shown.press), gap = speaking(shown.press - 1) - u;
    pressFret.position.copy(at(u, FB_TOP, 0));
    pressFret.scale.set(0.3, 0.34, 2 * neckHalf(u) + 0.08);
    const d = u + Math.min(1.1, gap * 0.4);
    pressDot.position.copy(at(d, FB_TOP + 0.3, stringV(shown.string, d)));
  }

  // The switch lever leans toward the pickup it picks.
  shown.lever += (deg(13) * (p.pos - 2) - shown.lever) * (snap ? 1 : Math.min(1, dt * 14));
  lever.rotation.z = shown.lever;
  // Knobs: the volume stays on 10; both tone knobs follow the tone. 300° of travel, clockwise to turn up.
  knobs.volume.rotation.y = -deg(150);
  for (const name of ['tone1', 'tone2']) knobs[name].rotation.y = wipers[name].rotation.y = deg(150) - deg(300) * p.tone / 10;
  wipers.volume.rotation.y = -deg(150);

  // Coil current: dots slosh round each live coil with the string's speed over its poles.
  const s = strings[p.string], tau = shown.clock - s.t0;
  const live = new Set(SWITCH[p.pos].coils);
  const view = ['pickup', 'coil', 'hum', 'switch'].includes(state.mode) || state.cut === true;
  for (const [name, c] of Object.entries(coilDots)) {
    const on = live.has(name) && view ? 1 : 0;
    // Current follows the string's speed, so the charge it has moved follows the string's position.
    const [y] = swing(s, PICKUPS[name].u, tau);
    c.phase = 0.35 * y * (name === 'middle' ? -1 : 1);
    if (!c.dots.fade(on * 0.95, snap ? 1 : Math.min(1, dt * 6))) continue;
    c.dots.seeds.forEach((d, i) => { loopPoint(d.t + c.phase, COIL.a + 0.06, COIL.b + 0.06, tmp); c.dots.place(i, tmp.x, d.y, tmp.z); });
    c.dots.commit();
  }
  // Magnet polarity for the hum step: north poles warm, south poles cool.
  const showPoles = state.mode === 'hum' ? 1 : 0;
  for (const caps of Object.values(polarity)) caps.forEach(cap => {
    cap.material.opacity += (showPoles * 0.9 - cap.material.opacity) * (snap ? 1 : Math.min(1, dt * 5));
    cap.visible = cap.material.opacity > 0.01;
  });
  // Field lines over the neck pickup's low E pole bend toward the string as it swings.
  const showField = state.mode === 'pickup' || state.mode === 'coil' ? 0.75 : 0;
  fieldMat.opacity += (showField - fieldMat.opacity) * (snap ? 1 : Math.min(1, dt * 4));
  if (fieldMat.opacity > 0.01) {
    const [y] = swing(strings[0], PICKUPS.neck.u, shown.clock - strings[0].t0);
    const sy = stringY(PICKUPS.neck.u) + SWING.y * y, sz = SWING.z * y;
    for (const f of field) {
      const arr = f.line.geometry.attributes.position.array, reach = 0.7 + 1.2 * f.s, height = 0.35 + 0.9 * f.s;
      for (let k = 0; k < 32; k++) {
        const th = k / 31 * Math.PI, out = reach * (1 - Math.cos(th)) / 2;
        // Inner lines run up through the string and follow it.
        const pull = Math.max(0, 1.2 - f.s) * Math.sin(th) ** 2;
        arr[k * 3] = f.dx * out;
        arr[k * 3 + 1] = POLE_TOP + (TOP + 0.3 - POLE_TOP) * (1 - Math.cos(th)) / 2 + height * Math.sin(th) + pull * (sy - POLE_TOP - 0.2);
        arr[k * 3 + 2] = f.z0 + f.dz * out + pull * sz;
      }
      f.line.geometry.attributes.position.needsUpdate = true;
      f.line.visible = true;
    }
  } else field.forEach(f => { f.line.visible = false; });

  // Down the cable: the signal runs toward the amp.
  const loud = shown.sig ? Math.exp(-shown.since / GUITAR.sustain) : 0;
  if (cableDots.fade(state.mode === 'out' ? 0.95 * loud : 0, Math.min(1, dt * 6))) {
    cableDots.seeds.forEach((d, i) => {
      if (state.playing) d.u = (d.u + dt * 0.12) % 1;
      CABLE.getPointAt(d.u * 0.55, tmp);
      cableDots.place(i, tmp.x, tmp.y + 0.15, tmp.z);
    });
    cableDots.commit();
  }

  const ghosted = state.focus.length && !state.focus.includes('cable') && (state.cut === true || state.explode > 0.12);
  const cord = CABLE.cord.material;
  cord.opacity += ((ghosted ? 0.15 : 1) - cord.opacity) * (snap ? 1 : Math.min(1, dt * 6)); cord.depthWrite = cord.opacity > 0.9;

  humSound.set(state.playing && state.mode === 'hum' && shown.sig ? 0.012 * Math.abs(shown.sig.hum) / GUITAR.hum : 0);
  readoutTimer -= dt;
  if (readoutTimer <= 0) { showReadout(p); readoutTimer = 0.1; }
});
story.setStep(0, false);
