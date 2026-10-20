import * as THREE from 'three';
import { BufferGeometryUtils } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createStage, addFloor, addStudioLights } from '../../src/engine/stage.js';
import { createParts } from '../../src/engine/parts.js';
import { createCallouts } from '../../src/engine/callouts.js';
import { createStoryUI, bindRange, showRange } from '../../src/engine/story-ui.js';
import { sound } from '../../src/engine/sound.js';
import { startLoop, reducedMotion as reduced } from '../../src/engine/loop.js';
import { box, cylinder, lathe, roundedRect, extrudeUp, coilGeometry } from '../../src/kit/shapes.js';
import { createMaterials, linear } from '../../src/kit/materials.js';
import { softDot, createParticles } from '../../src/kit/effects.js';
import { BASS_STORY } from './story.js';
import {
  BASS, PERIOD, pluckModes, stringOffset, pulledOffset, fretDistance, stringHz, noteName, pickupVolts,
  coilFor, hum, response, trebleCutoff, totalTension, bass,
} from './bass.js';

// ---------- Layout ----------
// Scale: 1 unit = 1 cm. The bass lies on its back on the floor, face up, with the headstock at -x
// and the strap end at +x. The E string is on the far side (-z) and the G string nearest (+z),
// as in a photo of a bass held to play.
const v3 = (x, y, z) => new THREE.Vector3(x, y, z);
const zero = v3(0, 0, 0);
const lerp = THREE.MathUtils.lerp;
const clamp01 = v => Math.max(0, Math.min(1, v));
const merge = geos => BufferGeometryUtils.mergeBufferGeometries(geos);

const SCALE = BASS.scale * 100;                 // 86.4 cm from the nut to the saddles
const NUT_X = -56.4, SADDLE_X = NUT_X + SCALE;  // the saddles sit at x = 30
const fretX = n => NUT_X + fretDistance(n) * 100;
const LAST_FRET = fretX(BASS.frets);
const BODY_TOP = 4.4, FB = 5.2, NECK_TOP = FB - 0.6; // body top, fingerboard surface, maple under it
// The neck ends with the fingerboard; past its end the pickguard covers the body.
const FRET_H = 0.13, FB_END = LAST_FRET + 1, HEEL_X = FB_END;
// The body clamps the neck from here on; the strings' pull bows the neck in front of it.
const FIXED_X = -2;
const neckWidth = x => (x >= LAST_FRET ? 6.3 : lerp(4.4, 6.3, (x - NUT_X) / (LAST_FRET - NUT_X)));
// Strings: radius from the gauge, spacing 10.7 mm at the nut and 19 mm at the bridge. The saddles
// step back a little for the thicker strings (intonation), and the strings rise from 1.7 mm over
// the first fret to about 3 mm over the last.
const STR = BASS.strings.map((s, i) => {
  const r = s.gauge * 2.54 / 2;
  return { r, zNut: (i - 1.5) * 1.07, zSaddle: (i - 1.5) * 1.9, saddleX: SADDLE_X + [0.45, 0.35, 0.25, 0.15][i], yNut: 5.37 + r, ySaddle: 5.75 + r };
});
// Plucking: the finger draws the string out along this direction, mostly toward and away from the
// pickup. The real swing is about 2 mm; each view draws it larger by its own amount (see SWING_SHOW),
// so it reads from far away but stays clear of the pickup up close.
const SWING = v3(0, 0.92, 0.38).normalize();
// The pickup halves: E and A over one, D and G over the other, set back toward the bridge.
const COILS = BASS.coils.map((c, k) => ({ x: SADDLE_X - c.at * 100, z: k ? 1.77 : -1.75, strings: c.strings }));
const PLATE = { x: 27.4, z: 11.4, angle: -0.1 }; // the control plate on the lower treble side

// The body's outline (x, z): long upper horn on the bass side, offset waist, wide lower bout.
const BODY_OUTLINE = [
  [40.6, 0], [40.4, 5], [38.5, 11.2], [34, 15.3], [28, 16.6], [21, 15.8], [15, 13.3], [10, 11.4], [5, 11.3], [0.5, 11.6],
  [-3, 10.8], [-5.3, 9.2], [-5, 7.3], [-3.4, 5.2], [-1.7, 3.4], [-1.4, 0], [-1.7, -3.4], [-3.2, -4.9], [-6.6, -6.8],
  [-10.2, -8.7], [-12.4, -10], [-13, -11.6], [-11.8, -13.4], [-8.5, -14.3], [-4, -14.4], [1, -13.6], [6, -12.3],
  [10, -12], [15, -13.4], [21, -15.6], [28, -16.5], [34, -15.2], [38.5, -11.5], [40.4, -5],
];
const BODY_BOX = [-14, 41, -17.2, 17.2]; // x0, x1, shape y0, y1 (shape y = -z)

const VIEWS = {
  wide: { r: 172, theta: 0.12, phi: 0.92, target: [-18, 3, 1] },
  neck: { r: 60, theta: 0.25, phi: 1.2, target: [-40, 4.5, 0] },
  frets: { r: 64, theta: 0.42, phi: 1.0, target: [-35, 5.5, 0] },
  pluck: { r: 66, theta: 0.15, phi: 1.2, target: [8, 7, 0] },
  pickup: { r: 56, theta: 0.5, phi: 0.82, target: [15.4, 5.4, 0] },
  split: { r: 46, theta: -0.4, phi: 0.85, target: [15.6, 8.5, 0] },
  controls: { r: 48, theta: 0.8, phi: 0.95, target: [26, 8.5, 9] },
  jack: { r: 66, theta: 0.95, phi: 1.0, target: [36, 7, 17] },
};
const SWING_SHOW = { wide: 10, neck: 6, frets: 8, pluck: 18, pickup: 1.6, split: 1.6, controls: 3, jack: 4 };

// ---------- Stage and light ----------
const stage = createStage(document.getElementById('c'), {
  fov: 36, pbr: true, camera: VIEWS.wide, zoom: [14, 240], phiLimit: 0.25,
});
const { scene, cam } = stage;
stage.camera.far = 900; stage.camera.updateProjectionMatrix();
addStudioLights(stage, { key: [45, 95, 60], extent: 72, far: 280, scale: 4, shadowMap: 2048 });
addFloor(stage, 0, { size: 230, cell: 2, opacity: 0.12, center: [-16, 0], height: 30, blur: 3.5, shadowSize: 150 }); // 2 cm grid

// ---------- Materials ----------
const M = createMaterials({
  burst: { color: 0xffffff, roughness: 0.24, map: sunburst() },  // gloss three-tone sunburst
  edge: { color: 0x1a0b06, roughness: 0.28 },                       // the dark rim of the burst
  maple: { color: 0xb97b3f, roughness: 0.48, envMapIntensity: 0.55 },  // aged maple under amber lacquer
  rosewood: { color: 0x2e1a10, roughness: 0.66 },
  fret: { look: 'steel', color: 0xdfe2e5, roughness: 0.16 },
  pearl: { color: 0xf1ead8, roughness: 0.35 },
  bone: { color: 0xeee6d2, roughness: 0.5 },
  string: { look: 'steel', color: 0xaab0b8, roughness: 0.36, bumpMap: winding(), bumpScale: 0.015 },
  guard: { color: 0xffffff, roughness: 0.3, map: tortoise() },
  guardEdge: { color: 0xf1ece2, roughness: 0.45 },
  cover: { color: 0x141619, roughness: 0.5 },
  fiber: { color: 0x1d1e20, roughness: 0.85 },
  coil: { look: 'copper', color: 0xb8622e, roughness: 0.38 },
  alnico: { look: 'steel', color: 0xa7acb2, roughness: 0.32 },
  chrome: { look: 'steel', color: 0xe9ecef, roughness: 0.1 },
  steel: 'steel', brass: 'brass', dark: 'dark',
  rod: { look: 'steel', color: 0x59606a, roughness: 0.32 },
  pot: { look: 'brushed', color: 0x9aa1a9 },
  cap: { color: 0xd8641b, roughness: 0.42 },
  cavity: { color: 0x101113, roughness: 0.92 },                     // conductive shielding paint
  wireRed: { color: 0x9c2b22, roughness: 0.55 },
  wireBlack: { color: 0x1d1f22, roughness: 0.55 },
  skin: { color: 0xd8a78c, roughness: 0.6 },
}, { pbr: true });

// The burst follows the body's outline: amber in the middle, through red, to near black at the edge.
function sunburst() {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 640;
  const g = c.getContext('2d'), [x0, x1, y0, y1] = BODY_BOX;
  const px = x => (x - x0) / (x1 - x0) * c.width, py = y => (1 - (y - y0) / (y1 - y0)) * c.height;
  const ramp = [[0, [16, 6, 4]], [0.1, [42, 14, 7]], [0.22, [96, 30, 12]], [0.36, [168, 64, 20]], [0.5, [214, 120, 36]], [0.7, [236, 170, 62]], [1, [244, 192, 86]]];
  const colorAt = k => {
    let i = 0; while (i < ramp.length - 2 && k > ramp[i + 1][0]) i++;
    const [ka, a] = ramp[i], [kb, b] = ramp[i + 1], f = clamp01((k - ka) / (kb - ka));
    return `rgb(${a.map((v, j) => Math.round(v + (b[j] - v) * f)).join(',')})`;
  };
  g.fillStyle = colorAt(0); g.fillRect(0, 0, c.width, c.height);
  const pts = BODY_OUTLINE, [cx, cz] = [21, 0];
  for (let k = 0; k <= 64; k++) {
    const s = 1.04 - k / 64 * 0.86; // outline scaled toward the lower bout's middle
    g.fillStyle = colorAt(k / 64); g.beginPath();
    pts.forEach(([x, z], i) => { const X = px(cx + (x - cx) * s), Y = py(-(cz + (z - cz) * s)); if (i) g.lineTo(X, Y); else g.moveTo(X, Y); });
    g.closePath(); g.fill();
  }
  // Faint grain along the body.
  g.globalAlpha = 0.05;
  for (let i = 0; i < 90; i++) { g.fillStyle = i % 2 ? '#000' : '#fff'; g.fillRect(0, Math.random() * c.height, c.width, 1 + Math.random() * 2); }
  const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = 4;
  t.repeat.set(1 / (x1 - x0), 1 / (y1 - y0)); t.offset.set(-x0 / (x1 - x0), -y0 / (y1 - y0));
  return t;
}
// Tortoiseshell: dark red-brown with soft amber flecks and streaks.
function tortoise() {
  const c = document.createElement('canvas'); c.width = c.height = 1024;
  const g = c.getContext('2d');
  g.fillStyle = '#1c0703'; g.fillRect(0, 0, 1024, 1024);
  for (let i = 0; i < 3000; i++) {
    const x = Math.random() * 1024, y = Math.random() * 1024, r = 4 + Math.random() ** 2 * 30;
    const hue = Math.random(), col = hue < 0.55 ? '112,34,12' : hue < 0.85 ? '160,64,20' : '206,118,40';
    g.save(); g.translate(x, y); g.rotate(0.5 + Math.random() * 0.4); g.scale(1.8, 0.7);
    const grad = g.createRadialGradient(0, 0, 0, 0, 0, r);
    grad.addColorStop(0, `rgba(${col},${0.2 + Math.random() * 0.35})`); grad.addColorStop(1, `rgba(${col},0)`);
    g.fillStyle = grad; g.fillRect(-r, -r, 2 * r, 2 * r); g.restore();
  }
  const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1 / 24, 1 / 24); t.anisotropy = 4;
  return t;
}
// Roundwound strings: fine ridges of the wrap wire along the string.
function winding() {
  const c = document.createElement('canvas'); c.width = 4; c.height = 16;
  const g = c.getContext('2d'), grad = g.createLinearGradient(0, 0, 0, 16);
  grad.addColorStop(0, '#000'); grad.addColorStop(0.5, '#fff'); grad.addColorStop(1, '#000');
  g.fillStyle = grad; g.fillRect(0, 0, 4, 16);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1, 900);
  return t;
}

// ---------- Helpers ----------
// A smooth closed outline through [x, z] points, as a Shape in the kit's frame (shape y = -z).
function smoothPoints(points, samples = 240) {
  const curve = new THREE.CatmullRomCurve3(points.map(([x, z]) => v3(x, -z, 0)), true, 'centripetal');
  return curve.getSpacedPoints(samples).slice(0, -1).map(p => new THREE.Vector2(p.x, p.y));
}
const alongX = mesh => { mesh.rotation.z = Math.PI / 2; return mesh; };
const alongZ = mesh => { mesh.rotation.x = Math.PI / 2; return mesh; };
// A tube through points (world cm).
const tube = (points, r, mat, { segments = 48, radial = 8, tension = 0.5 } = {}) =>
  new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p => v3(...p)), false, 'catmullrom', tension), segments, r, radial, false), mat);

// The neck bows forward under the strings' pull. Bendable meshes have their transforms baked
// into the geometry, so each vertex can be lifted by bowAt(x); the headstock is past the nut and
// tilts as one piece, so it hangs from a pivot at the nut instead.
const bendables = [], pivots = [];
function bendable(mesh) {
  mesh.updateMatrix(); mesh.geometry = mesh.geometry.clone().applyMatrix4(mesh.matrix);
  mesh.position.set(0, 0, 0); mesh.rotation.set(0, 0, 0); mesh.scale.set(1, 1, 1);
  bendables.push({ mesh, base: mesh.geometry.attributes.position.array.slice() });
  return mesh;
}
function headPivot(parent) {
  const p = new THREE.Group(); p.position.set(NUT_X, NECK_TOP, 0);
  const inner = new THREE.Group(); inner.position.set(-NUT_X, -NECK_TOP, 0);
  p.add(inner); parent.add(p); pivots.push(p);
  return inner;
}
const SPAN = FIXED_X - NUT_X;
const bowAt = x => { if (x >= FIXED_X) return 0; const s = (FIXED_X - x) / SPAN; return s <= 1 ? s * s : 2 * s - 1; };
let shownBow = -1;
function bendNeck(lift) {
  if (Math.abs(lift - shownBow) < 1e-4) return;
  shownBow = lift;
  bendables.forEach(({ mesh, base }) => {
    const pos = mesh.geometry.attributes.position, a = pos.array;
    for (let i = 0; i < a.length; i += 3) a[i + 1] = base[i + 1] + lift * bowAt(base[i]);
    pos.needsUpdate = true;
  });
  pivots.forEach(p => { p.position.y = NECK_TOP + lift; p.rotation.z = -Math.atan(2 * lift / SPAN); });
}

// The maple neck: a C-shaped back that turns boxy at the heel, tapering from the heel to the nut.
function neckGeometry() {
  const N = 60, K = 16, pos = [], idx = [];
  const ring = [];
  for (let i = 0; i <= N; i++) {
    const x = lerp(HEEL_X, NUT_X - 0.4, i / N), w = neckWidth(Math.max(x, NUT_X)) / 2;
    const heel = clamp01((x - (FIXED_X - 1)) / 3);
    const depth = lerp(lerp(1.5, 1.75, clamp01((x - NUT_X) / 43)), 1.8, heel), e = lerp(2.3, 9, heel);
    const row = [];
    for (let k = 0; k <= K; k++) {
      const th = Math.PI + Math.PI * k / K, c = Math.cos(th), s = Math.sin(th);
      row.push(pos.length / 3); pos.push(x, NECK_TOP - depth * Math.abs(s) ** (2 / e), w * Math.sign(c) * Math.abs(c) ** (2 / e));
    }
    row.push(pos.length / 3); pos.push(x, NECK_TOP, w); // the flat top, with its own edge
    row.push(pos.length / 3); pos.push(x, NECK_TOP, -w);
    ring.push(row);
  }
  for (let i = 0; i < N; i++) for (let k = 0; k < K + 2; k++) {
    if (k === K) continue; // the corner between the back and the top
    const a = ring[i][k], b = ring[i + 1][k], c = ring[i + 1][k + 1], d = ring[i][k + 1];
    idx.push(a, d, b, b, d, c);
  }
  // End caps: fans from the middle of each end.
  [[0, 1], [N, -1]].forEach(([i, dir]) => {
    const r = ring[i], cx = pos[r[0] * 3], mid = pos.length / 3;
    pos.push(cx, NECK_TOP - 0.7, 0);
    const loop = r.slice(0, K + 1);
    for (let k = 0; k < loop.length; k++) {
      const p = loop[k], q = loop[(k + 1) % loop.length];
      if (dir > 0) idx.push(mid, q, p); else idx.push(mid, p, q);
    }
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
  return geo;
}

// ---------- Parts ----------
const root = new THREE.Group(); scene.add(root);
const { parts, add, update } = createParts(root, { shadows: true, lively: true });

// Body: a solid alder slab with rounded edges, in a three-tone sunburst.
const CAVITY = { x0: 12.4, x1: 18.6 }; // the pickup route, under the pickguard
{
  const g = new THREE.Group(), bevel = 0.6;
  const geo = new THREE.ExtrudeGeometry(new THREE.Shape(smoothPoints(BODY_OUTLINE)), {
    depth: BODY_TOP - 2 * bevel, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 5, curveSegments: 12,
  });
  geo.rotateX(-Math.PI / 2); geo.translate(0, bevel, 0);
  const body = new THREE.Mesh(geo, [M.burst, M.edge]); body.userData.cutaway = true; g.add(body);
  // The routed cavities show as dark shielding paint when the pickguard and plate come off.
  const flat = (shape, y) => { const m = new THREE.Mesh(new THREE.ShapeGeometry(shape, 12), M.cavity); m.rotation.x = -Math.PI / 2; m.position.y = y; m.userData.cutaway = true; return m; };
  g.add(flat(roundedRect(CAVITY.x1 - CAVITY.x0, 9.8, 1.2, (CAVITY.x0 + CAVITY.x1) / 2, 0), BODY_TOP + 0.015));
  const plateHole = flat(roundedRect(13.4, 3.2, 1.6, 0, 0), BODY_TOP + 0.015);
  plateHole.position.set(PLATE.x, BODY_TOP + 0.015, PLATE.z); plateHole.rotation.z = PLATE.angle; g.add(plateHole);
  // Strap buttons at the tail and on the horn.
  g.add(alongX(cylinder(0.45, 0.6, 0.9, M.chrome, [40.9, 2.2, 0], { segments: 20 })));
  const horn = alongX(cylinder(0.45, 0.6, 0.9, M.chrome, [-13.5, 2.2, -12.4], { segments: 20 })); horn.rotation.y = Math.PI; g.add(horn);
  g.userData.anchor = [33, BODY_TOP, -12];
  add('body', g, zero, zero);
}

// Neck: maple, with a rosewood fingerboard, pearl dots, a bone nut and the headstock.
{
  const g = new THREE.Group();
  const neck = bendable(new THREE.Mesh(neckGeometry(), M.maple)); neck.userData.cutaway = true; g.add(neck);
  const board = new THREE.Shape([
    new THREE.Vector2(NUT_X, -neckWidth(NUT_X) / 2 + 0.03), new THREE.Vector2(FB_END, -neckWidth(FB_END) / 2 + 0.03),
    new THREE.Vector2(FB_END, neckWidth(FB_END) / 2 - 0.03), new THREE.Vector2(NUT_X, neckWidth(NUT_X) / 2 - 0.03),
  ]);
  const fb = bendable(extrudeUp(board, FB - NECK_TOP, M.rosewood, NECK_TOP)); fb.userData.cutaway = true; g.add(fb);
  const dots = [];
  [3, 5, 7, 9, 15, 17, 19].forEach(n => dots.push(new THREE.CylinderGeometry(0.3, 0.3, 0.03, 20).translate((fretX(n - 1) + fretX(n)) / 2, FB + 0.005, 0)));
  [-1.15, 1.15].forEach(z => dots.push(new THREE.CylinderGeometry(0.3, 0.3, 0.03, 20).translate((fretX(11) + fretX(12)) / 2, FB + 0.005, z)));
  const inlays = bendable(new THREE.Mesh(merge(dots), M.pearl)); inlays.userData.cutaway = true; g.add(inlays);
  const nut = bendable(box([0.5, 0.92, neckWidth(NUT_X)], M.bone, [NUT_X - 0.25, NECK_TOP + 0.46, 0], 0.08)); g.add(nut);
  // Headstock: a flat paddle, 15 mm thick, flush with the top of the neck.
  const head = headPivot(g);
  const HEAD = [[0.4, 2.2], [-1.5, 2.3], [-5, 2.9], [-9.5, 3.5], [-14, 3.4], [-18, 2.7], [-20.6, 1.2], [-21.4, -1], [-20.6, -3.5],
    [-17, -5.1], [-10, -5.4], [-4.5, -4.8], [-1.6, -3.2], [0.4, -2.2]].map(([x, z]) => [NUT_X + x, z]);
  const plate = extrudeUp(new THREE.Shape(smoothPoints(HEAD, 160)), 1.5 - 0.3, M.maple, NECK_TOP - 1.5 + 0.15, 0.15);
  plate.userData.cutaway = true; head.add(plate);
  // The truss rod's access hole, just past the nut.
  const hole = new THREE.Mesh(new THREE.CircleGeometry(0.55, 24), M.cavity); hole.rotation.x = -Math.PI / 2;
  hole.position.set(NUT_X - 1.2, NECK_TOP + 0.01, 0); hole.userData.cutaway = true; head.add(hole);
  g.userData.anchor = [-30, NECK_TOP - 1.2, 2.2];
  add('neck', g, zero, zero);
}

// Frets: nickel-silver wire hammered into slots, 20 of them, closer together toward the body.
{
  const g = new THREE.Group(), wires = [];
  for (let n = 1; n <= BASS.frets; n++) {
    const x = fretX(n);
    wires.push(new THREE.CylinderGeometry(FRET_H, FRET_H, neckWidth(x) - 0.12, 10, 1).rotateX(Math.PI / 2).translate(x, FB, 0));
  }
  g.add(bendable(new THREE.Mesh(merge(wires), M.fret)));
  g.userData.anchor = [fretX(5), FB + FRET_H, -neckWidth(fretX(5)) / 2 + 0.2];
  add('frets', g, zero, zero);
}

// Truss rod: a steel rod in a curved channel under the fingerboard, with its adjusting nut at the headstock.
const rodNut = new THREE.Group();
{
  const g = new THREE.Group(), pts = [];
  for (let i = 0; i <= 24; i++) {
    const x = lerp(NUT_X - 0.6, HEEL_X - 1.5, i / 24), s = (x - NUT_X) / (HEEL_X - 1.5 - NUT_X);
    pts.push(v3(x, NECK_TOP - 0.42 - 0.62 * Math.sin(Math.PI * s), 0));
  }
  g.add(bendable(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 80, 0.4, 12, false), M.rod)));
  const head = headPivot(g);
  rodNut.add(alongX(cylinder(0.5, 0.5, 0.7, M.brass, [0, 0, 0], { segments: 6 })));
  rodNut.add(alongX(cylinder(0.18, 0.18, 0.75, M.dark, [-0.05, 0, 0], { segments: 6 }))); // hex key socket
  rodNut.position.set(NUT_X - 1.2, NECK_TOP - 0.42, 0); head.add(rodNut);
  g.userData.anchor = [-24, NECK_TOP - 1.0, 0];
  add('trussRod', g, zero, zero);
}

// Tuners: four big open-gear machines along the bass side of the headstock. The strings wind
// round the posts; turning a key turns the post through a worm gear.
const POSTS = [4.8, 9.3, 13.8, 18.3].map(d => ({ x: NUT_X - d, z: -3.6 }));
const keys = [];
{
  const g = new THREE.Group(), head = headPivot(g);
  POSTS.forEach(({ x, z }) => {
    head.add(cylinder(0.72, 0.72, 0.16, M.chrome, [x, NECK_TOP + 0.08, z], { segments: 28 }));
    head.add(cylinder(0.42, 0.42, 1.9, M.chrome, [x, NECK_TOP + 0.95, z], { segments: 24 }));
    head.add(box([2.0, 1.1, 2.0], M.chrome, [x, NECK_TOP - 1.5 - 0.55, z - 0.3], 0.25)); // gear housing on the back
    head.add(alongZ(cylinder(0.17, 0.17, 2.6, M.chrome, [x, NECK_TOP - 2.05, z - 2.4], { segments: 12 })));
    const key = new THREE.Group(); key.position.set(x, NECK_TOP - 2.05, z - 4.4);
    const ear = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 14), M.chrome); ear.scale.set(1.25, 0.32, 1.35); ear.position.z = -0.7; key.add(ear);
    key.add(alongZ(cylinder(0.32, 0.38, 0.5, M.chrome, [0, 0, 0.6], { segments: 16 })));
    head.add(key); keys.push(key);
  });
  // String tree: holds the D and G strings down onto the nut.
  head.add(alongZ(cylinder(0.22, 0.22, 2.2, M.chrome, [NUT_X - 8.2, NECK_TOP + 0.55, 1.6], { segments: 12 })));
  head.add(cylinder(0.14, 0.14, 0.55, M.chrome, [NUT_X - 8.2, NECK_TOP + 0.27, 1.6], { segments: 10 }));
  g.userData.anchor = [POSTS[1].x, NECK_TOP + 1.9, POSTS[1].z];
  add('tuners', g, zero, zero);
}

// Strings: the four speaking lengths are rebuilt every frame from the physics; the ends past the
// nut and the saddles are fixed.
const strings = [];
{
  const g = new THREE.Group(), head = headPivot(g);
  STR.forEach((s, i) => {
    const geo = new THREE.CylinderGeometry(s.r, s.r, 1, 7, 220, true);
    const base = geo.attributes.position.array.slice(), nrm = geo.attributes.normal.array;
    for (let v = 0; v < nrm.length; v += 3) { const nx = nrm[v], nz = nrm[v + 2]; nrm[v] = 0; nrm[v + 1] = nx; nrm[v + 2] = nz; }
    const mesh = new THREE.Mesh(geo, M.string); mesh.frustumCulled = false; g.add(mesh);
    strings.push({ mesh, base, cfg: s, i });
    // Past the saddle: down to the bridge's back wall, where the ball end holds it.
    g.add(tube([[s.saddleX, s.ySaddle, s.zSaddle], [s.saddleX + 0.9, s.ySaddle - 0.02, s.zSaddle], [35.1, 5.0, s.zSaddle]], s.r * 0.9, M.string, { segments: 12, radial: 7, tension: 0 }));
    g.add(alongX(cylinder(s.r * 1.7, s.r * 1.7, 0.3, M.brass, [35.35, 5.0, s.zSaddle], { segments: 14 })));
    // Past the nut: on to the post (under the tree for D and G), wound round it three times.
    const post = POSTS[i], via = i >= 2 ? [[NUT_X - 8.2, NECK_TOP + 0.3 + s.r, 1.6 + (i - 2.5) * 0.8]] : [];
    const end = [post.x + 0.1, NECK_TOP + 1.05, post.z + 0.42 + s.r];
    head.add(tube([[NUT_X - 0.05, s.yNut, s.zNut], ...via, end], s.r, M.string, { segments: 24, radial: 7, tension: 0 }));
    const wrap = new THREE.Mesh(coilGeometry({ length: 0.7, turns: 2.5, radius: 0.42 + s.r, wire: s.r, segmentsPerTurn: 20 }), M.string);
    wrap.position.set(post.x, NECK_TOP + 0.75, post.z); head.add(wrap);
  });
  g.userData.anchor = [-10, 5.7, -0.4];
  add('strings', g, zero, zero);
}

// Bridge: a bent steel plate with four saddles. Each saddle sets its string's height (two screws)
// and its length (the intonation screw through the back wall).
{
  const g = new THREE.Group();
  g.add(box([5.6, 0.18, 8.8], M.chrome, [32.4, BODY_TOP + 0.09, 0], 0.06));
  g.add(box([0.2, 1.9, 8.8], M.chrome, [35.1, BODY_TOP + 0.95, 0], 0.06));
  [-3.3, 0, 3.3].forEach(z => g.add(cylinder(0.3, 0.3, 0.1, M.steel, [30.5, BODY_TOP + 0.22, z], { segments: 16 })));
  STR.forEach(s => {
    const top = s.ySaddle - s.r, cx = s.saddleX + 0.55;
    g.add(box([1.6, top - BODY_TOP - 0.3, 1.15], M.chrome, [cx, (top + BODY_TOP + 0.3) / 2, s.zSaddle], 0.14));
    [-0.32, 0.32].forEach(dz => g.add(cylinder(0.13, 0.13, 0.22, M.steel, [cx, BODY_TOP + 0.29, s.zSaddle + dz], { segments: 8 })));
    g.add(alongX(cylinder(0.09, 0.09, 35.1 - cx - 0.8, M.steel, [(cx + 0.8 + 35.1) / 2, BODY_TOP + 0.75, s.zSaddle], { segments: 8 })));
    const spring = new THREE.Mesh(coilGeometry({ length: 35.0 - cx - 0.85, turns: 6, radius: 0.2, wire: 0.035, axis: 'x' }), M.steel);
    spring.position.set((cx + 0.85 + 35.0) / 2, BODY_TOP + 0.75, s.zSaddle); g.add(spring);
  });
  g.userData.anchor = [STR[1].saddleX + 0.5, 5.7, STR[1].zSaddle - 0.6];
  add('bridge', g, zero, zero);
}

// Pickguard: four-ply tortoiseshell, notched round the neck, with two windows for the pickup.
{
  const g = new THREE.Group(), bevel = 0.08;
  const s = new THREE.Shape();
  const P = ([x, z]) => new THREE.Vector2(x, -z);
  s.moveTo(...P([HEEL_X + 0.1, -3.4]).toArray()); s.lineTo(...P([HEEL_X + 0.1, 3.4]).toArray()); s.lineTo(...P([-1.0, 3.4]).toArray());
  s.splineThru([[-2.2, 5.0], [-3.6, 7.6], [-1.6, 9.9], [3, 10.4], [8.5, 10.1], [13.5, 10.9], [17.6, 9.4], [20.4, 6.4], [21.2, 2.6],
    [20.6, -1.0], [19.2, -4.0], [16.8, -7.4], [12.8, -10.0], [7, -10.7], [1, -12.0], [-4, -12.9], [-8.6, -12.6], [-11.4, -11.5],
    [-10.8, -9.9], [-7.4, -8.0], [-4.2, -5.8], [-2.0, -3.4]].map(P));
  s.lineTo(...P([HEEL_X + 0.1, -3.4]).toArray());
  COILS.forEach(c => s.holes.push(roundedRect(2.35, 5.65, 0.5, c.x, -c.z, new THREE.Path())));
  const geo = new THREE.ExtrudeGeometry(s, { depth: 0.25 - 2 * bevel, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 2, curveSegments: 10 });
  geo.rotateX(-Math.PI / 2); geo.translate(0, BODY_TOP + bevel, 0);
  const guard = new THREE.Mesh(geo, [M.guard, M.guardEdge]); guard.userData.cutaway = true; g.add(guard);
  [[-1.6, 8.9], [5.5, 9.6], [13.5, 10.0], [19.6, 5.6], [19.9, -1.4], [15.5, -7.6], [7.5, -9.9], [-3, -11.9], [-9.6, -11.3], [-4.4, -6.6], [-1.2, 4.9]]
    .forEach(([x, z]) => g.add(cylinder(0.22, 0.22, 0.06, M.chrome, [x, BODY_TOP + 0.27, z], { segments: 14 })));
  g.userData.anchor = [4, BODY_TOP + 0.25, -9];
  add('pickguard', g, zero, v3(0, 10, 0));
}

// Pickup: two halves, each a bobbin of copper wire round four alnico magnet pole pieces, two
// under each string. Their black covers sit in the pickguard's windows.
const POLE_TOP = 5.27;
const poles = []; // [x, z] of every pole piece, for the hum colours
{
  const g = new THREE.Group(), covers = new THREE.Group();
  COILS.forEach(c => {
    const zs = c.strings.flatMap(i => {
      const t = (c.x - NUT_X) / (STR[i].saddleX - NUT_X), z = lerp(STR[i].zNut, STR[i].zSaddle, t);
      return [z - 0.45, z + 0.45];
    });
    g.add(box([2.0, 0.14, 5.3], M.fiber, [c.x, 5.02, c.z], 0.05));
    g.add(box([2.0, 0.14, 5.3], M.fiber, [c.x, 2.95, c.z], 0.05));
    g.add(box([1.55, 1.9, 4.85], M.coil, [c.x, 3.98, c.z], 0.55));
    zs.forEach(z => { g.add(cylinder(0.24, 0.24, POLE_TOP - 2.85, M.alnico, [c.x, (POLE_TOP + 2.85) / 2, z], { segments: 16 })); poles.push([c.x, z, c]); });
    const cover = box([2.25, 1.38, 5.5], M.cover, [c.x, POLE_TOP - 0.69, c.z], 0.32); cover.userData.cutaway = true; covers.add(cover);
  });
  g.userData.anchor = [COILS[0].x, 4.6, COILS[0].z - 2.2];
  add('pickup', g, zero, zero);
  covers.userData.anchor = [COILS[1].x, POLE_TOP, COILS[1].z + 2.3];
  add('covers', covers, zero, v3(0, 17, 0));
}
// Hum step: north poles red on one half, south poles blue on the other. Not a part, so they keep
// their own colour; they ride on the pickup's group.
const humCaps = [];
poles.forEach(([x, z, c]) => {
  const mat = new THREE.MeshBasicMaterial({ color: linear(c === COILS[0] ? 0xd64a3a : 0x3f7fd6), transparent: true, opacity: 0, depthWrite: false });
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.04, 16), mat);
  disc.position.set(x, POLE_TOP + 0.03, z); disc.visible = false; disc.userData.noContactShadow = true;
  parts.pickup.group.add(disc); humCaps.push(disc);
});

// Control plate: chrome, with the volume and tone knobs and the output jack on top.
const plateGroup = (y = BODY_TOP) => { const p = new THREE.Group(); p.position.set(PLATE.x, y, PLATE.z); p.rotation.y = PLATE.angle; return p; };
const KNOB_X = { vol: -4.4, tone: 0.2 }, JACK_X = 4.7;
const knobs = {};
{
  const g = new THREE.Group(), p = plateGroup(); g.add(p);
  const plate = extrudeUp(roundedRect(14, 3.7, 1.85), 0.12, M.chrome, 0, 0.03); p.add(plate);
  ['vol', 'tone'].forEach(name => {
    const k = new THREE.Group(); k.position.set(KNOB_X[name], 0.15, 0);
    k.add(cylinder(0.95, 0.98, 1.25, M.chrome, [0, 0.62, 0], { segments: 40 }));
    const dome = lathe([[0.95, 0], [0.8, 0.2], [0.45, 0.32], [0.01, 0.35]], M.chrome, { segments: 40 }); dome.position.y = 1.25; k.add(dome);
    k.add(box([0.12, 0.05, 0.55], M.dark, [0, 1.58, 0.42], 0)); // pointer line
    p.add(k); knobs[name] = k;
  });
  [-6.2, 6.2].forEach(x => p.add(cylinder(0.2, 0.2, 0.05, M.steel, [x, 0.15, 0], { segments: 12 })));
  g.userData.anchor = [PLATE.x - 4.4, BODY_TOP + 1.6, PLATE.z];
  add('controls', g, zero, v3(0, 14, 0));
}
// Pots and capacitor: hung under the plate, inside the shielded cavity.
{
  const g = new THREE.Group(), p = plateGroup(); g.add(p);
  ['vol', 'tone'].forEach(name => {
    const x = KNOB_X[name];
    p.add(cylinder(1.2, 1.2, 0.9, M.pot, [x, -0.65, 0], { segments: 32 }));
    p.add(cylinder(0.32, 0.32, 0.25, M.brass, [x, -0.12, 0], { segments: 6 })); // mounting nut
    [-0.5, 0, 0.5].forEach(dz => p.add(box([0.2, 0.5, 0.1], M.brass, [x + 1.3, -0.8, dz], 0)));
  });
  // The tone capacitor, from the tone pot's lug to the pot casing (ground).
  p.add(box([0.75, 0.95, 0.5], M.cap, [-2.1, -1.0, 0.9], 0.22));
  p.add(tube([[-2.1, -0.55, 0.9], [-1.3, -0.35, 0.6], [1.5, -0.55, 0.5]], 0.04, M.steel, { segments: 12, radial: 5 }));
  p.add(tube([[-2.1, -1.45, 0.9], [-3.0, -1.4, 0.6], [-3.2, -0.9, 0.3]], 0.04, M.steel, { segments: 12, radial: 5 }));
  p.add(tube([[-3.1, -0.8, 0.5], [-1.5, -0.6, 0.9], [0.0, -0.7, 0.9]], 0.06, M.wireRed, { segments: 16, radial: 6 }));
  g.userData.anchor = [PLATE.x - 2.2, BODY_TOP - 1.0, PLATE.z + 0.9];
  add('pots', g, zero, v3(0, 8, 0));
}
// Output jack: a 6.35 mm socket in the plate, with the cable's plug in it.
const JACK_TOP = 6.6; // the plug's tip above the plate, where the cable starts
{
  const g = new THREE.Group(), p = plateGroup(); g.add(p);
  p.add(cylinder(0.62, 0.62, 0.22, M.chrome, [JACK_X, 0.2, 0], { segments: 28 }));
  p.add(cylinder(0.5, 0.5, 1.8, M.dark, [JACK_X, -0.9, 0], { segments: 20 }));
  p.add(box([0.25, 1.4, 0.7], M.brass, [JACK_X + 0.7, -1.0, 0], 0));
  p.add(cylinder(0.33, 0.33, 2.2, M.chrome, [JACK_X, 1.4, 0], { segments: 20 }));
  p.add(cylinder(0.48, 0.48, 1.8, M.chrome, [JACK_X, 3.0, 0], { segments: 24 }));
  const boot = lathe([[0.48, 0], [0.42, 0.8], [0.3, 1.8], [0.26, 2.7]], M.dark, { segments: 20 }); boot.position.set(JACK_X, 3.9, 0); p.add(boot);
  g.userData.anchor = [PLATE.x + JACK_X * Math.cos(PLATE.angle), BODY_TOP + 2.5, PLATE.z - JACK_X * Math.sin(PLATE.angle)];
  add('jack', g, zero, v3(0, 11, 0));
}
// Where the jack's plug ends, in world space, wherever the jack has moved to.
const jackEnd = () => parts.jack.group.localToWorld(v3(PLATE.x + JACK_X * Math.cos(PLATE.angle), BODY_TOP + JACK_TOP, PLATE.z - JACK_X * Math.sin(PLATE.angle)));
const potLug = () => parts.pots.group.localToWorld(v3(PLATE.x + (KNOB_X.vol + 1.3) * Math.cos(PLATE.angle), BODY_TOP - 0.9, PLATE.z - (KNOB_X.vol + 1.3) * Math.sin(PLATE.angle)));

// ---------- Cables and wires (rebuilt when their ends move) ----------
// The cable to the amplifier: from the plug up, over and down to the floor, then away, fading out.
const fadeMap = (() => {
  const c = document.createElement('canvas'); c.width = 256; c.height = 4;
  const ctx = c.getContext('2d'), grad = ctx.createLinearGradient(0, 0, 256, 0);
  grad.addColorStop(0, '#fff'); grad.addColorStop(0.55, '#fff'); grad.addColorStop(1, '#000');
  ctx.fillStyle = grad; ctx.fillRect(0, 0, 256, 4);
  return new THREE.CanvasTexture(c);
})();
const cableMesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial({ color: linear(0x1e2125), roughness: 0.62, alphaMap: fadeMap, transparent: true, depthWrite: false }));
cableMesh.userData.noContactShadow = true; root.add(cableMesh);
// Inside the body: the lead from the pickup to the volume pot, through a channel under the pickguard.
const leadMesh = new THREE.Mesh(new THREE.BufferGeometry(), M.wireBlack.clone());
root.add(leadMesh);
const wires = { jack: v3(Infinity, 0, 0), pot: v3(Infinity, 0, 0), cable: null, lead: null };
function updateWires() {
  const j = jackEnd(), p = potLug();
  if (j.distanceTo(wires.jack) > 0.02) {
    wires.jack.copy(j);
    // Up out of the jack, over toward the tail and down to the floor behind the bass, away from the camera.
    wires.cable = new THREE.CatmullRomCurve3([j, j.clone().add(v3(0, 3.5, 0)), j.clone().add(v3(4, 5, -1)), v3(j.x + 11, Math.max(3, j.y), j.z - 4), v3(j.x + 16, 0.45, j.z - 9),
      v3(j.x + 21, 0.45, j.z - 20), v3(j.x + 30, 0.45, j.z - 38), v3(j.x + 44, 0.45, j.z - 60)]);
    cableMesh.geometry.dispose(); cableMesh.geometry = new THREE.TubeGeometry(wires.cable, 160, 0.38, 12, false);
  }
  if (p.distanceTo(wires.pot) > 0.02) {
    wires.pot.copy(p);
    const a = v3(COILS[1].x + 1.0, 3.4, COILS[1].z + 2.0);
    wires.lead = new THREE.CatmullRomCurve3([v3(COILS[0].x + 0.9, 3.4, COILS[0].z + 2.0), a, v3(20.5, 3.3, 5.5), v3(22.5, Math.min(3.3, p.y), 9.0), p]);
    leadMesh.geometry.dispose(); leadMesh.geometry = new THREE.TubeGeometry(wires.lead, 60, 0.07, 6, false);
  }
}

// ---------- Fingers ----------
// One fingertip frets the string; another draws it aside and lets go.
const tipGeo = lathe([[0.01, -1.9], [0.5, -1.82], [0.72, -1.55], [0.8, -1.1], [0.82, 1.6]], M.skin, { segments: 24 }).geometry;
const fretTip = new THREE.Mesh(tipGeo, M.skin.clone()); fretTip.rotation.x = -0.55; fretTip.visible = false;
const pluckTip = new THREE.Mesh(tipGeo, M.skin.clone()); pluckTip.visible = false;
[fretTip, pluckTip].forEach(m => { m.material.transparent = true; m.userData.noContactShadow = true; root.add(m); });
// The plucking finger comes in from above and the player's side.
const pluckAxis = v3(0.25, 0.75, 0.6).normalize();
pluckTip.quaternion.setFromUnitVectors(v3(0, 1, 0), pluckAxis);

// ---------- Effects ----------
// Current: copper dots running round the coils, along the lead and out along the cable.
const dot = softDot(), dotColor = linear(0xd9783a).getHex();
const flow = (n, size = 0.7) => createParticles(scene, n, { color: dotColor, size, map: dot, seed: i => ({ u: (i + Math.random() * 0.6) / n }) });
const coilDots = COILS.map(() => flow(26, 0.55)), leadDots = flow(30, 0.6), cableDots = flow(40, 1.1);
[...coilDots, leadDots, cableDots].forEach(d => { d.points.frustumCulled = false; });
// A loop just outside each coil's winding, at mid height.
const coilLoops = COILS.map(c => new THREE.CatmullRomCurve3([[0.92, 2.55], [-0.92, 2.55], [-0.92, -2.55], [0.92, -2.55]]
  .flatMap(([dx, dz], i, all) => { const [nx, nz] = all[(i + 1) % 4]; return [v3(c.x + dx, 3.98, c.z + dz), v3(c.x + (dx + nx) / 2, 3.98, c.z + (dz + nz) / 2)]; }), true));

// ---------- State and UI ----------
const state = { step: 0, explode: 0, targetExplode: 0, playing: true, focus: [], cut: false, mode: 'tune', t: 0, fret: 0, tone: 1, ownFret: false, ownTone: false, show: SWING_SHOW.wide };
let camGoal = null;
// The views are framed for a desktop stage (about 1.15 wide to 1 high). A narrower stage pulls the
// camera back; on phones the title and buttons cover the top and bottom, so the bass also sits lower.
function fit() {
  const c = stage.renderer.domElement, a = c.clientWidth / Math.max(1, c.clientHeight);
  const small = globalThis.matchMedia?.('(max-width: 800px)').matches;
  return { zoom: Math.min(1.7, Math.max(1, 1.15 / a)) * (small ? 1.25 : 1), lift: small ? 0.07 : 0 };
}
const $ = id => document.getElementById(id);
const fretInput = $('fret'), toneInput = $('tone');
const showFret = n => { showRange(fretInput, n ? `Fret ${n}` : 'Open'); fretInput.setAttribute('aria-valuetext', n ? `Fret ${n}` : 'Open string'); };
const showTone = v => showRange(toneInput, String(v));
const story = createStoryUI({
  story: BASS_STORY, state,
  onStep: s => {
    state.focus = s.focus; state.cut = s.cut; state.mode = s.mode; state.t = 0; state.show = SWING_SHOW[s.view];
    // A step sets the fret (null: the story walks up the neck) and turns the tone back up;
    // moving a slider then hands it to the reader until the next step.
    state.ownFret = s.fret != null; state.fret = s.fret ?? 0; state.ownTone = s.mode !== 'tone'; state.tone = 1;
    fretInput.value = String(state.fret); showFret(state.fret);
    toneInput.value = '10'; showTone(10);
    const v = VIEWS[s.view], f = fit(), r = v.r * f.zoom;
    camGoal = { ...v, r, target: new THREE.Vector3(...v.target).add(v3(0, r * f.lift, 0)) };
    cam.theta = v.theta + THREE.MathUtils.euclideanModulo(cam.theta - v.theta + Math.PI, 2 * Math.PI) - Math.PI; // take the short way round
  },
});
bindRange('fret', v => { state.fret = v; state.ownFret = true; showFret(v); });
bindRange('tone', v => { state.tone = v / 10; state.ownTone = true; showTone(v); });
createCallouts(stage, { parts, state, story: BASS_STORY });

// cut: true clears every cutaway shell; a list clears only those parts and keeps the rest solid.
const clears = name => state.cut === true || (Array.isArray(state.cut) && state.cut.includes(name));
const focusStyle = {
  highlight: 0.16,
  opacity(name, mesh, hot) {
    let alpha = 1;
    if (mesh.userData.cutaway && clears(name)) alpha = hot ? 0.3 : 0.14;
    if (state.focus.length && !hot && (state.cut === true || state.explode > 0.12)) alpha = Math.min(alpha, 0.3);
    return alpha;
  },
};

// ---------- Strings ----------
const modes = pluckModes();
// Where string i is at share u of its speaking length (from the saddle), in cm across its rest line.
function swing(i, s, u) {
  if (s.age == null && !s.pull) return 0;
  const f = stringHz(i, s.fret), phase = s.age == null ? 0 : 2 * Math.PI * f * s.age / BASS.slow;
  const ringing = s.age == null ? 0 : stringOffset(modes, u, phase, s.age);
  return 100 * shown.swing * ((1 - s.pull) * ringing + pulledOffset(u, s.pull));
}
const tmp = new THREE.Vector3();
function drawString(str, s, lift) {
  const { cfg, i, base, mesh } = str, a = mesh.geometry.attributes.position.array;
  const xf = fretX(s.fret), len = cfg.saddleX - NUT_X;
  // Rest line: from the nut (raised by the neck's bow) or, when fretted, from the fret's crown.
  const y0 = s.fret ? FB + FRET_H + cfg.r : cfg.yNut + lift * bowAt(NUT_X);
  for (let v = 0; v < a.length; v += 3) {
    const along = 0.5 - base[v + 1], x = NUT_X + along * len; // 0 at the nut, 1 at the saddle
    const z0 = lerp(cfg.zNut, cfg.zSaddle, along);
    let y, z = z0, off = 0;
    if (x < xf) y = lerp(cfg.yNut + lift * bowAt(NUT_X), y0, (x - NUT_X) / Math.max(1e-6, xf - NUT_X)); // pressed against the fret
    else {
      const u = (cfg.saddleX - x) / (cfg.saddleX - xf);
      y = lerp(cfg.ySaddle, y0, u);
      off = swing(i, s, u);
    }
    a[v] = x; a[v + 1] = y + off * SWING.y + base[v]; a[v + 2] = z + off * SWING.z + base[v + 2];
  }
  mesh.geometry.attributes.position.needsUpdate = true;
  return { xf, y0 };
}

// ---------- Readout ----------
const R = { box: $('readout'), k: [1, 2, 3].map(n => $(`r-k${n}`)), v: [1, 2, 3].map(n => $(`r-v${n}`)), range: $('r-range'),
  a: document.querySelector('#r-trace .a'), b: document.querySelector('#r-trace .b'), out: document.querySelector('#r-trace .out') };
const TRACE_N = 240;
const rows = list => list.forEach(([k, v], j) => { R.k[j].textContent = k; R.v[j].textContent = v; });
const mv = v => `${Math.round(v * 1000)} mV`;
const toPoints = (ys, lo, hi) => ys.map((y, k) => `${(k / (ys.length - 1) * 400).toFixed(1)},${(30 - 26 * (2 * (y - lo) / (hi - lo) - 1)).toFixed(1)}`).join(' ');
function showReadout(p) {
  R.a.setAttribute('points', ''); R.b.setAttribute('points', '');
  if (state.mode === 'truss') {
    // The neck's side view: its bow along the fingerboard, from the nut to the body.
    rows([['Pull', `${Math.round(totalTension() * p.pull)} N`], ['Relief', `${Math.max(0, p.relief).toFixed(2)} mm`], ['Rod', p.turns < 0.02 ? 'Loose' : `${(p.turns * 4).toFixed(1)} × ¼ turn`]]);
    R.range.textContent = 'Neck';
    const ys = Array.from({ length: TRACE_N }, (_, k) => p.relief / RELIEF_SHARE * bowAt(lerp(NUT_X, FIXED_X + 6, k / (TRACE_N - 1))));
    R.out.setAttribute('points', toPoints(ys, -0.5, 6));
    R.box.classList.remove('live');
    return;
  }
  const i = Math.max(0, p.last), s = p.strings[i], f = stringHz(i, s.fret), name = noteName(BASS.strings[i].midi + s.fret);
  const opts = { tone: state.tone, cfg: BASS };
  // 50 ms of the real waveform, as it is now, with the pluck's decay at this moment.
  const span = 0.05, age = s.age ?? 0, live = s.age != null && !s.pull;
  const ys = Array.from({ length: TRACE_N }, (_, k) => (live ? pickupVolts(i, s.fret, modes, k / (TRACE_N - 1) * span, age, opts) : 0));
  const peak = Math.max(...ys.map(Math.abs));
  R.box.classList.toggle('live', live);
  if (state.mode === 'hum') {
    // Each half carries the same hum with opposite signs; only the string signal survives the sum.
    const hums = ys.map((_, k) => hum(k / (TRACE_N - 1) * span));
    const onA = coilFor(i) === BASS.coils[0];
    const a = ys.map((y, k) => (onA ? y : 0) + hums[k].a), b = ys.map((y, k) => (onA ? 0 : y) + hums[k].b);
    rows([['Note', name], ['Hum', `±${BASS.humMV} mV each half`], ['Out', `${mv(peak)} · no hum`]]);
    R.range.textContent = '50 ms';
    const lim = Math.max(0.05, peak + BASS.humMV / 1000);
    R.a.setAttribute('points', toPoints(a, -lim, lim)); R.b.setAttribute('points', toPoints(b, -lim, lim)); R.out.setAttribute('points', toPoints(ys, -lim, lim));
    return;
  }
  const third = state.mode === 'tone' ? ['Tone', `${Math.round(state.tone * 10)} · cut ${(trebleCutoff(state.tone) / 1000).toFixed(1)} kHz`] : ['Pickup', mv(peak)];
  rows([['Note', `${name} · ${s.fret ? `fret ${s.fret}` : 'open'}`], ['Pitch', `${f.toFixed(1)} Hz`], third]);
  R.range.textContent = '50 ms';
  const lim = Math.max(0.05, peak);
  R.out.setAttribute('points', toPoints(ys, -lim, lim));
}

// ---------- Sound ----------
// Each release plays the note at its real pitch: the first harmonics of the pluck as seen by the
// pickup, through the tone circuit. The tuners click while the strings come up to pitch, and the
// rod nut clicks at each quarter turn.
const was = { ages: [null, null, null, null], quarter: 0, key: 0 };
function pluckSound(i, fret) {
  const f = stringHz(i, fret), u = coilFor(i).at / (BASS.scale * 2 ** (-fret / 12));
  const amps = modes.slice(0, 8).map((b, k) => Math.abs(b * Math.sin((k + 1) * Math.PI * u) * (k + 1) * response((k + 1) * f, state.tone)));
  const top = Math.max(...amps);
  amps.forEach((a, k) => sound.tone({ freq: f * (k + 1), type: k ? 'sine' : 'triangle', gain: 0.1 * a / top, attack: 0.004, release: 1.6 / Math.sqrt(k + 1) }));
  sound.noise({ gain: 0.05, release: 0.03, freq: 1800, q: 1.2 });
}
function playSounds(p) {
  if (!state.playing) { was.ages = p.strings.map(s => s.age); return; }
  p.strings.forEach((s, i) => {
    if (s.age != null && (was.ages[i] == null || s.age < was.ages[i])) pluckSound(i, s.fret);
  });
  was.ages = p.strings.map(s => s.age);
  const quarter = Math.floor(p.turns * 4 + 0.5);
  if (state.mode === 'truss' && quarter > was.quarter) sound.click(0.2);
  was.quarter = quarter;
  const key = Math.floor(p.pull * 24);
  if (state.mode === 'truss' && key > was.key) sound.click(0.05);
  was.key = key;
}

// ---------- Frame ----------
const snap = reduced || stage.capture; // ?capture renders stills, so it skips every ease
const shown = { bow: 0, hum: 0, swing: SWING_SHOW.wide };
// The bow is a fraction of a millimetre; draw it 6 times larger. Relief is the gap at the 8th fret
// under a straight edge from the nut to the body, which is 0.24 of the lift at the nut.
const BOW_SHOW = 6, RELIEF_SHARE = 0.24;
let readoutTimer = 0, signal = 0;
startLoop(stage, (dt, now) => {
  update(state, focusStyle, snap ? 1 : 0.09, dt);
  if (camGoal) { // ease to the step's view once; after that the reader's own zoom wins
    const k = snap ? 1 : Math.min(1, dt * 3);
    for (const a of ['r', 'theta', 'phi']) cam[a] += (camGoal[a] - cam[a]) * k;
    cam.target.lerp(camGoal.target, k);
    if (Math.abs(camGoal.r - cam.r) < 0.5 && Math.abs(camGoal.theta - cam.theta) < 0.01 && cam.target.distanceTo(camGoal.target) < 0.2) camGoal = null;
  }
  if (state.playing) state.t += dt;
  const p = bass(state.mode, state.t, { fret: state.ownFret ? state.fret : null });
  if (!state.ownTone) {
    state.tone = p.tone;
    const v = Math.round(p.tone * 10);
    if (Number(toneInput.value) !== v) { toneInput.value = String(v); showTone(v); }
  }
  if (!state.ownFret && state.mode === 'fret') {
    const n = p.strings[0].fret;
    if (Number(fretInput.value) !== n) { fretInput.value = String(n); showFret(n); }
  }

  // Neck: the bow (in cm at the nut) from the relief at the 8th fret, drawn larger.
  const k = snap ? 1 : Math.min(1, dt * 6);
  shown.swing += (state.show - shown.swing) * k;
  const bowGoal = state.mode === 'truss' ? p.relief / 10 * BOW_SHOW / RELIEF_SHARE : 0;
  shown.bow += (bowGoal - shown.bow) * k;
  bendNeck(shown.bow);
  const lift = shownBow;
  keys.forEach((key, i) => { key.rotation.z = state.mode === 'truss' ? p.pull * (14 + i) : 0; });
  rodNut.rotation.x = state.mode === 'truss' ? -p.turns * 2 * Math.PI : 0;

  // Strings, and the fingers that fret and pluck them.
  let tipShown = false, pluckShown = false;
  strings.forEach(str => {
    const s = p.strings[str.i], { xf } = drawString(str, s, lift);
    if (str.i === 0 && s.fret > 0 && state.mode !== 'tune' && state.mode !== 'truss') {
      tipShown = true;
      const x = xf - 0.38 * (xf - fretX(s.fret - 1));
      fretTip.position.set(x, FB + FRET_H + 2 * str.cfg.r + 1.9 * Math.cos(0.55), lerp(str.cfg.zNut, str.cfg.zSaddle, (x - NUT_X) / (str.cfg.saddleX - NUT_X)) - 1.9 * Math.sin(0.55));
    }
    if (s.pull > 0 || (s.age != null && s.age < 0.35)) {
      // The tip rides the V out, then lifts clear once the string slips off it.
      pluckShown = true;
      const L = str.cfg.saddleX - xf, x = str.cfg.saddleX - BASS.pluckAt * L;
      const yRest = lerp(str.cfg.ySaddle, s.fret ? FB + FRET_H + str.cfg.r : str.cfg.yNut, BASS.pluckAt);
      const out = 100 * shown.swing * (s.pull > 0 ? pulledOffset(BASS.pluckAt, s.pull) : BASS.depth) + (s.pull > 0 ? 0 : 3 * s.age);
      tmp.set(x, yRest, lerp(str.cfg.zNut, str.cfg.zSaddle, (x - NUT_X) / (str.cfg.saddleX - NUT_X))).addScaledVector(SWING, out + str.cfg.r + 0.05);
      pluckTip.position.copy(tmp).addScaledVector(pluckAxis, 1.9);
      pluckTip.material.opacity = s.pull > 0 ? Math.min(1, s.pull * 3) : 1 - s.age / 0.35;
    }
  });
  fretTip.visible = tipShown && !reduced; pluckTip.visible = pluckShown && !reduced && !stage.capture;
  if (stage.capture) fretTip.visible = false;

  // Hum colours on the pole pieces, only in the hum step.
  shown.hum += ((state.mode === 'hum' ? 1 : 0) - shown.hum) * (snap ? 1 : Math.min(1, dt * 4));
  humCaps.forEach(c => { c.material.opacity = 0.9 * shown.hum; c.visible = shown.hum > 0.01; });

  // The knobs follow the volume (always full here) and the tone.
  knobs.tone.rotation.y = -(1 - state.tone) * 4.7;

  // Current: the string's signal on the slowed clock moves the dots back and forth (it is AC),
  // round the coils, along the lead to the controls and out along the cable.
  updateWires();
  const i = Math.max(0, p.last), s = p.strings[i];
  signal = s.age != null && !s.pull ? pickupVolts(i, s.fret, modes, s.age / BASS.slow, s.age, { tone: state.tone }) : 0;
  const showCoils = state.step === 4 || state.step === 5;
  const showLead = state.step >= 6, showCable = state.step === 7 || state.step === 6;
  const fade = Math.min(1, dt * 6), speed = state.playing ? signal * 1.4 * dt : 0;
  coilDots.forEach((dots, k) => {
    const on = showCoils && COILS[k].strings.includes(i);
    if (!dots.fade(on ? 0.95 : 0, fade)) return;
    dots.seeds.forEach((d, j) => { d.u = THREE.MathUtils.euclideanModulo(d.u + speed * (k ? -1 : 1), 1); coilLoops[k].getPointAt(d.u, tmp); dots.place(j, tmp.x, tmp.y, tmp.z); });
    dots.commit();
  });
  if (leadDots.fade(showLead && wires.lead ? 0.95 : 0, fade)) {
    leadDots.seeds.forEach((d, j) => { d.u = THREE.MathUtils.euclideanModulo(d.u + speed * 0.5, 1); wires.lead.getPointAt(d.u, tmp); leadDots.place(j, tmp.x, tmp.y, tmp.z); });
    leadDots.commit();
  }
  if (cableDots.fade(showCable && wires.cable ? 0.95 : 0, fade)) {
    cableDots.seeds.forEach((d, j) => { d.u = THREE.MathUtils.euclideanModulo(d.u + speed * 0.25, 1); wires.cable.getPointAt(d.u * 0.7, tmp); cableDots.place(j, tmp.x, tmp.y, tmp.z); });
    cableDots.commit();
  }

  playSounds(p);
  readoutTimer -= dt;
  if (readoutTimer <= 0) { showReadout(p); readoutTimer = 0.1; }
});
story.setStep(0, false);
