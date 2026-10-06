import * as THREE from 'three';
import { createStage, addFloor, addStudioLights } from '../../src/engine/stage.js';
import { createParts, looksInside } from '../../src/engine/parts.js';
import { createCallouts } from '../../src/engine/callouts.js';
import { createStoryUI, bindRange } from '../../src/engine/story-ui.js';
import { sound } from '../../src/engine/sound.js';
import { startLoop, reducedMotion as reduced } from '../../src/engine/loop.js';
import { box, cylinder, lathe, roundedRect, extrudeUp, coilGeometry } from '../../src/kit/shapes.js';
import { createMaterials, linear } from '../../src/kit/materials.js';
import { createParticles } from '../../src/kit/effects.js';
import { MIXER_STORY } from './story.js';
import { MIXER, motorRpm, tipSpeedKmh } from './motor.js';

// ---------- Stage and light ----------
// Scale: 1 unit = 10 cm. The base is 21 cm wide and 16 cm tall; the 1.5 litre jar stands on top.
// The motor shaft and the blade shaft share the y axis.
const VIEWS = {
  all: { r: 10.5, theta: 0.6, phi: 1.2, target: [0, 0.05, 0] },
  motor: { r: 5.8, theta: 0.5, phi: 1.2, target: [0, -1.0, 0] },
  coupler: { r: 8.2, theta: 0.55, phi: 1.55, target: [0, 0.5, 0] },
  blades: { r: 4.4, theta: 0.55, phi: 0.98, target: [0, 0.3, 0] },
  jar: { r: 6.4, theta: 0.55, phi: 1.05, target: [0, 0.75, 0] },
};
const stage = createStage(document.getElementById('c'), {
  fov: 36, pbr: true, camera: VIEWS.all, zoom: [4, 16], phiLimit: 0.25,
});
const { scene, cam } = stage;
addStudioLights(stage, { key: [4, 8, 5], extent: 5, far: 25 });
const FLOOR_Y = -2.0;
addFloor(stage, FLOOR_Y, { size: 13, opacity: 0.16, height: 6 });

// ---------- Materials ----------
const M = createMaterials({
  body: { color: 0x6a1f2b, metalness: 0.1, roughness: 0.36, side: THREE.DoubleSide }, // maroon ABS
  trim: { color: 0x2b3138, metalness: 0.2, roughness: 0.5, side: THREE.DoubleSide },
  jar: { look: 'steel', color: 0xdfe3e8, roughness: 0.16, side: THREE.DoubleSide },
  steel: 'steel', brushed: 'brushed', iron: 'iron', copper: 'copper', brass: 'brass', rubber: 'rubber', dark: 'dark',
  carbon: { color: 0x2a2a2c, metalness: 0.1, roughness: 0.85 },
  mica: { color: 0x5a3f2a, roughness: 0.6 },
  bakelite: { color: 0x4a3426, roughness: 0.75 },
  fan: { color: 0xe3ddd0, metalness: 0.05, roughness: 0.5 },
  red: { color: 0xc8372d, metalness: 0.1, roughness: 0.45 },
  spring: { color: 0x9aa7b4, metalness: 0.85, roughness: 0.3 },
}, { pbr: true });

// ---------- Helpers ----------
const BASE = { w: 2.1, d: 2.0, r: 0.5, bottom: -1.86, top: -0.32, taper: 0.86, wall: 0.05 };
// The base narrows toward the top: full size at the bottom, BASE.taper at the top.
const taperAt = y => 1 + (BASE.taper - 1) * THREE.MathUtils.clamp((y - BASE.bottom) / (BASE.top - BASE.bottom), 0, 1);
function tapered(mesh) {
  const p = mesh.geometry.attributes.position;
  for (let i = 0; i < p.count; i++) { const s = taperAt(p.getY(i)); p.setX(i, p.getX(i) * s); p.setZ(i, p.getZ(i) * s); }
  return mesh;
}
// A slice of a ring between radii r1 and r2 and angles a0..a1, extruded up from y.
// extrudeUp draws in the XZ plane with shape y = world -z, so angle a points along (cos a, -sin a).
function sector(r1, r2, a0, a1, height, mat, y) {
  const s = new THREE.Shape();
  s.moveTo(Math.cos(a0) * r1, Math.sin(a0) * r1);
  s.lineTo(Math.cos(a0) * r2, Math.sin(a0) * r2);
  s.absarc(0, 0, r2, a0, a1, false);
  s.lineTo(Math.cos(a1) * r1, Math.sin(a1) * r1);
  s.absarc(0, 0, r1, a1, a0, true);
  return extrudeUp(s, height, mat, y);
}
const ring = (r1, r2) => { const s = new THREE.Shape(); s.absarc(0, 0, r2, 0, Math.PI * 2, false); s.holes.push(new THREE.Path().absarc(0, 0, r1, 0, Math.PI * 2, true)); return s; };
const UP = new THREE.Vector3(0, 1, 0);
function rod(a, b, radius, mat) {
  const from = new THREE.Vector3(...a), dir = new THREE.Vector3(...b).sub(from);
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, dir.length(), 8), mat);
  mesh.position.copy(from).addScaledVector(dir, 0.5);
  mesh.quaternion.setFromUnitVectors(UP, dir.normalize());
  return mesh;
}
const tube = (points, radius, mat) => new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p))), 48, radius, 10, false), mat);
// Radial teeth around the y axis: couplers and the fan.
function spokes(n, size, r, y, mat, phase = 0) {
  const g = new THREE.Group();
  for (let i = 0; i < n; i++) {
    const a = phase + i / n * Math.PI * 2;
    const tooth = box(size, mat, [Math.cos(a) * r, y, Math.sin(a) * r]); tooth.rotation.y = -a; g.add(tooth);
  }
  return g;
}

// ---------- Parts ----------
const root = new THREE.Group(); scene.add(root);
const motorSpin = new THREE.Group(); root.add(motorSpin); // armature, commutator, fan and motor coupler
const bladeSpin = new THREE.Group(); root.add(bladeSpin); // blades and jar coupler
const { parts, add, update } = createParts(root, { shadows: true, lively: true });

// Heights along the shaft.
const Y = {
  stackTop: -0.62, stackBot: -1.02,          // stator lamination stack
  armTop: -0.64, armBot: -1.0,               // armature core
  comm: -1.2, brushPlate: -1.3, spiderTop: -0.5, spiderBot: -1.36, fan: -1.53,
  shaftTop: -0.2, shaftBot: -1.66,
};
const KNOB = { y: -1.0, angles: [-0.95, -0.35, 0.25, 0.85], pulse: -1.55 }; // off, 1, 2, 3 (clockwise from the top)

// Base: a maroon shell that narrows to the top, a dark bottom with rubber feet, and the cord.
{
  const g = new THREE.Group();
  const wall = roundedRect(BASE.w, BASE.d, BASE.r);
  wall.holes.push(roundedRect(BASE.w - BASE.wall * 2, BASE.d - BASE.wall * 2, BASE.r - BASE.wall, 0, 0, new THREE.Path()));
  const shell = tapered(extrudeUp(wall, BASE.top - 0.05 - BASE.bottom, M.body, BASE.bottom)); shell.userData.cutaway = 'base'; g.add(shell);
  const top = roundedRect(BASE.w, BASE.d, BASE.r); top.holes.push(new THREE.Path().absarc(0, 0, 0.22, 0, Math.PI * 2, true));
  const lid = tapered(extrudeUp(top, 0.035, M.body, BASE.top - 0.05, 0.015)); lid.userData.cutaway = 'base'; g.add(lid);
  // Jar seat: a dark collar the jar's foot turns into.
  const seat = extrudeUp(ring(0.71, 0.8), 0.07, M.trim, BASE.top, 0.01); seat.userData.cutaway = 'base'; g.add(seat);
  g.add(extrudeUp(roundedRect(BASE.w + 0.06, BASE.d + 0.06, BASE.r + 0.03), 0.07, M.trim, BASE.bottom - 0.07, 0.02));
  [[-0.75, -0.7], [0.75, -0.7], [-0.75, 0.7], [0.75, 0.7]].forEach(([x, z]) => g.add(cylinder(0.13, 0.15, 0.06, M.rubber, [x, FLOOR_Y + 0.03, z], { segments: 20 })));
  // Vent slots low on both sides.
  for (const side of [1, -1]) for (let i = 0; i < 6; i++) {
    const y = -1.66, s = taperAt(y), z = -0.5 + i * 0.2;
    const slot = box([0.03, 0.26, 0.07], M.dark, [side * (BASE.w / 2 * s + 0.003), y, z * s], 0.01); slot.userData.cutaway = 'base'; g.add(slot);
  }
  // Speed marks around the knob: off, 1, 2, 3 and pulse.
  const faceZ = BASE.d / 2 * taperAt(KNOB.y), tilt = Math.atan((1 - BASE.taper) * BASE.d / 2 / (BASE.top - BASE.bottom));
  const marks = new THREE.Group(); marks.position.set(0, KNOB.y, faceZ); marks.rotation.x = -tilt;
  [...KNOB.angles, KNOB.pulse].forEach((a, i) => {
    const dot = cylinder(i === 0 || i === 4 ? 0.022 : 0.03, i === 0 || i === 4 ? 0.022 : 0.03, 0.012, i === 4 ? M.red : M.brass, [Math.sin(a) * 0.36, Math.cos(a) * 0.36, 0.006], { segments: 12 });
    dot.rotation.x = Math.PI / 2; marks.add(dot);
  });
  g.add(marks);
  // The cord leaves the back and ends in a three-pin plug.
  const cord = tube([[0.45, -1.62, -0.92], [0.5, -1.7, -1.2], [0.7, -1.95, -1.5], [1.3, -1.95, -1.8], [1.9, -1.93, -1.75]], 0.045, M.dark);
  g.add(cord);
  const plug = box([0.42, 0.3, 0.38], M.dark, [2.15, -1.85, -1.72], 0.07); plug.rotation.y = 0.2; g.add(plug);
  add('base', g, new THREE.Vector3(), new THREE.Vector3(0, 0, -1.8));
}

// Speed knob and the rotary switch behind it.
let dial;
{
  const g = new THREE.Group();
  const faceZ = BASE.d / 2 * taperAt(KNOB.y), tilt = Math.atan((1 - BASE.taper) * BASE.d / 2 / (BASE.top - BASE.bottom));
  const knob = new THREE.Group(); knob.position.set(0, KNOB.y, faceZ); knob.rotation.x = -tilt; g.add(knob);
  dial = new THREE.Group(); dial.rotation.z = -KNOB.angles[3]; knob.add(dial);
  const cap = cylinder(0.25, 0.27, 0.14, M.trim, [0, 0, 0.07], { segments: 40 }); cap.rotation.x = Math.PI / 2; dial.add(cap);
  dial.add(box([0.09, 0.4, 0.1], M.trim, [0, 0, 0.17], 0.035)); // grip
  dial.add(box([0.025, 0.12, 0.012], M.brass, [0, 0.13, 0.225], 0.005)); // pointer
  // Switch body with its terminal tabs, inside the front wall.
  knob.add(box([0.38, 0.32, 0.24], M.dark, [0, 0, -0.17], 0.04));
  for (let i = 0; i < 5; i++) knob.add(box([0.04, 0.09, 0.06], M.brass, [-0.14 + i * 0.07, 0.19, -0.2], 0.008));
  g.userData.anchor = [0, KNOB.y, faceZ + 0.2];
  add('knob', g, new THREE.Vector3(), new THREE.Vector3(0, 0, 1.0));
}

// Stator: two halves of a lamination stack (so each can show its pole), two field coils,
// and the end brackets that hold the bearings.
const poleIron = { 1: [], [-1]: [] };
{
  const g = new THREE.Group();
  const W = 0.5, D = 0.4, R = 0.3, c = 0.08;
  for (const side of [1, -1]) {
    // Half the stack, x >= 0 for side 1: the outer rectangle minus the round bore.
    const s = new THREE.Shape();
    s.moveTo(0, D); s.lineTo(side * (W - c), D); s.quadraticCurveTo(side * W, D, side * W, D - c);
    s.lineTo(side * W, -D + c); s.quadraticCurveTo(side * W, -D, side * (W - c), -D);
    s.lineTo(0, -D); s.lineTo(0, -R);
    s.absarc(0, 0, R, -Math.PI / 2, Math.PI / 2, side < 0);
    for (let i = 0; i < 10; i++) {
      const plate = extrudeUp(s, 0.036, M.iron, Y.stackBot + i * 0.04);
      plate.userData.pole = side; poleIron[side].push(plate); g.add(plate);
    }
    // Field coil end turns curve over the top and bottom of the stack on its side.
    for (const y of [Y.stackTop + 0.05, Y.stackBot - 0.05]) {
      const arc = 1.6, geo = new THREE.TorusGeometry(0.37, 0.065, 10, 24, arc);
      geo.rotateX(-Math.PI / 2); geo.scale(1, 0.75, 1); geo.rotateY(-arc / 2 + (side < 0 ? Math.PI : 0));
      const coil = new THREE.Mesh(geo, M.copper); coil.position.y = y; g.add(coil);
    }
  }
  // Spider brackets above and below, bolted to the stack corners, with a bearing boss each.
  for (const [y, to] of [[Y.spiderTop, Y.stackTop], [Y.spiderBot, Y.stackBot]]) {
    for (const sz of [1, -1]) {
      const bar = box([1.12, 0.05, 0.07], M.brushed, [0, y, 0], 0.012); bar.rotation.y = sz * Math.atan2(0.34, 0.44); g.add(bar);
    }
    [[0.44, 0.34], [-0.44, 0.34], [0.44, -0.34], [-0.44, -0.34]].forEach(([x, z]) => g.add(box([0.06, Math.abs(to - y), 0.06], M.brushed, [x, (y + to) / 2, z], 0.01)));
    g.add(cylinder(0.075, 0.075, 0.1, M.brushed, [0, y, 0], { segments: 20 }));
  }
  add('stator', g, new THREE.Vector3(), new THREE.Vector3(-1.4, 0, 0));
}

// Armature: an iron hub, 12 teeth with copper in the slots between them, end windings,
// the shaft, and risers down to the commutator. It turns, so its parts sit in motorSpin.
const teeth = [];
{
  const g = new THREE.Group(), h = Y.armTop - Y.armBot, n = MIXER.bars, step = Math.PI * 2 / n;
  g.add(cylinder(0.165, 0.165, h, M.iron, [0, (Y.armTop + Y.armBot) / 2, 0], { segments: 24 }));
  for (let i = 0; i < n; i++) {
    const a = i * step;
    const tooth = sector(0.16, 0.28, a - step * 0.33, a + step * 0.33, h, M.iron, Y.armBot);
    tooth.userData.angle = a; teeth.push(tooth); g.add(tooth);
    g.add(sector(0.17, 0.262, a + step * 0.34, a + step * 0.66, h, M.copper, Y.armBot));
  }
  for (const y of [Y.armTop + 0.045, Y.armBot - 0.045]) {
    const turns = new THREE.Mesh(new THREE.TorusGeometry(0.205, 0.055, 10, 32), M.copper);
    turns.rotation.x = Math.PI / 2; turns.scale.set(1, 1, 0.8); turns.position.y = y; g.add(turns);
  }
  g.add(cylinder(0.035, 0.035, Y.shaftTop - Y.shaftBot, M.steel, [0, (Y.shaftTop + Y.shaftBot) / 2, 0], { segments: 16 }));
  for (let i = 0; i < n; i++) {
    const a = (i + 0.5) * step;
    g.add(rod([Math.cos(a) * 0.12, Y.comm + 0.07, Math.sin(a) * 0.12], [Math.cos(a) * 0.19, Y.armBot - 0.07, Math.sin(a) * 0.19], 0.008, M.copper));
  }
  g.userData.anchor = [0, (Y.armTop + Y.armBot) / 2 + 0.06, 0.28]; g.userData.anchorStatic = true;
  add('armature', g, new THREE.Vector3(), new THREE.Vector3(0, 0, 0), motorSpin);
}

// Commutator: copper bars on an insulating core, one bar per coil.
{
  const g = new THREE.Group();
  g.add(cylinder(0.1, 0.1, 0.15, M.mica, [0, Y.comm, 0], { segments: 24 }));
  g.add(spokes(MIXER.bars, [0.03, 0.14, 0.05], 0.113, Y.comm, M.copper, Math.PI / MIXER.bars));
  g.userData.anchor = [0, Y.comm, 0.13]; g.userData.anchorStatic = true;
  add('commutator', g, new THREE.Vector3(), new THREE.Vector3(0, 0, 0), motorSpin);
}

// Carbon brushes in brass holders, pressed onto the commutator by springs.
{
  const g = new THREE.Group();
  g.add(extrudeUp(ring(0.17, 0.44), 0.04, M.bakelite, Y.brushPlate - 0.02));
  for (const s of [1, -1]) {
    g.add(box([0.07, 0.07, 0.16], M.carbon, [0, Y.comm, s * 0.21]));
    g.add(box([0.1, 0.1, 0.16], M.brass, [0, Y.comm, s * 0.31], 0.015));
    g.add(box([0.06, 0.03, 0.1], M.brass, [0, Y.comm - 0.065, s * 0.31], 0.005));
    const spring = new THREE.Mesh(coilGeometry({ length: 0.08, turns: 5, radius: 0.028, wire: 0.007, axis: 'x', radial: 5 }), M.spring);
    spring.rotation.y = Math.PI / 2; spring.position.set(0, Y.comm, s * 0.43); g.add(spring);
    g.add(box([0.08, 0.08, 0.025], M.dark, [0, Y.comm, s * 0.48], 0.008));
    g.add(tube([[0, Y.comm + 0.035, s * 0.24], [0.02, Y.comm + 0.09, s * 0.27], [0.05, Y.comm + 0.07, s * 0.35]], 0.009, M.copper));
  }
  g.userData.anchor = [0, Y.comm, 0.3];
  add('brushes', g, new THREE.Vector3(), new THREE.Vector3(0, -0.1, 0));
}

// Cooling fan on the bottom of the shaft.
{
  const g = new THREE.Group();
  g.add(cylinder(0.4, 0.4, 0.025, M.fan, [0, Y.fan - 0.07, 0], { segments: 40 }));
  g.add(cylinder(0.07, 0.07, 0.14, M.fan, [0, Y.fan, 0], { segments: 16 }));
  g.add(spokes(8, [0.3, 0.12, 0.022], 0.25, Y.fan - 0.005, M.fan));
  g.userData.anchor = [0.3, Y.fan, 0.22]; g.userData.anchorStatic = true;
  add('fan', g, new THREE.Vector3(), new THREE.Vector3(0, -0.25, 0), motorSpin);
}

// Thermal cut-out with its red reset button through the floor of the base.
{
  const g = new THREE.Group();
  g.add(cylinder(0.1, 0.1, 0.14, M.brushed, [0.62, -1.73, 0.48], { segments: 20 }));
  g.add(cylinder(0.05, 0.05, 0.12, M.red, [0.62, -1.9, 0.48], { segments: 16 }));
  [-0.04, 0.04].forEach(dz => g.add(box([0.03, 0.08, 0.02], M.brass, [0.62, -1.62, 0.48 + dz], 0.005)));
  add('overload', g, new THREE.Vector3(), new THREE.Vector3(0.6, 0, 0.6));
}

// Motor coupler: a star of six teeth on top of the shaft.
{
  const g = new THREE.Group();
  g.add(cylinder(0.1, 0.11, 0.15, M.rubber, [0, -0.3, 0], { segments: 24 }));
  g.add(spokes(6, [0.1, 0.14, 0.04], 0.14, -0.23, M.rubber));
  g.add(cylinder(0.04, 0.04, 0.03, M.steel, [0, -0.215, 0], { segments: 6 }));
  g.userData.anchor = [0.15, -0.2, 0.08]; g.userData.anchorStatic = true;
  add('coupler', g, new THREE.Vector3(), new THREE.Vector3(0, 0.3, 0), motorSpin);
}

// ---------- Jar ----------
const JAR = { inner: 0.55, top: 1.8 };
const RIB0 = 0.55 + Math.PI / 4;
{
  const g = new THREE.Group();
  // Steel body: a domed floor, walls that flare out, and a rolled lip.
  const body = lathe([[0, 0.0], [0.48, 0.0], [0.55, 0.02], [0.58, 0.08], [0.66, 1.72], [0.685, 1.77], [0.69, JAR.top]], M.jar);
  body.userData.cutaway = 'jar'; g.add(body);
  // Plastic foot that locks into the seat on the base.
  const foot = lathe([[0.6, -0.3], [0.66, -0.3], [0.675, -0.26], [0.675, -0.06], [0.6, -0.01]], M.trim, { segments: 48 });
  foot.userData.cutaway = 'jar'; foot.userData.foot = true; g.add(foot);
  // Bearing boss in the floor, under the blades.
  g.add(cylinder(0.1, 0.11, 0.08, M.brushed, [0, 0.04, 0], { segments: 24 }));
  // Four flow-breaker ribs on the inside wall, leaning with it. None faces the camera head on,
  // so none reads as a rod up the middle.
  const slope = Math.atan(0.08 / 1.64);
  for (let i = 0; i < 4; i++) {
    const a = RIB0 + i * Math.PI / 2, rib = new THREE.Group();
    rib.position.set(Math.sin(a) * 0.6, 0.95, Math.cos(a) * 0.6); rib.rotation.y = a;
    const bar = box([0.08, 1.25, 0.035], M.jar); bar.rotation.x = slope; rib.add(bar); g.add(rib);
  }
  // Handle on the left.
  g.add(tube([[-0.64, 1.5, 0], [-0.95, 1.52, 0], [-1.08, 1.3, 0], [-1.1, 0.8, 0], [-1.04, 0.4, 0], [-0.61, 0.3, 0]], 0.075, M.trim));
  g.userData.anchor = [Math.sin(RIB0) * 0.6, 0.95, Math.cos(RIB0) * 0.6]; // the front-right rib
  add('jar', g, new THREE.Vector3(), new THREE.Vector3(0, 1.2, 0));
}
// Lid with a rubber gasket.
{
  const g = new THREE.Group();
  g.add(lathe([[0.72, 1.78], [0.725, 1.83], [0.62, 1.88], [0.3, 1.93], [0, 1.94]], M.trim, { segments: 48 }));
  g.add(cylinder(0.09, 0.1, 0.08, M.trim, [0, 1.97, 0], { segments: 24 }));
  const gasket = new THREE.Mesh(new THREE.TorusGeometry(0.675, 0.025, 8, 48), M.rubber); gasket.rotation.x = Math.PI / 2; gasket.position.y = 1.8; g.add(gasket);
  add('lid', g, new THREE.Vector3(), new THREE.Vector3(0, 1.7, 0));
}
// Blades: four stainless wings, two bent up and two bent down, on a short shaft. The faint
// disc is the blur they leave at speed.
{
  const g = new THREE.Group();
  const wing = new THREE.Shape();
  wing.moveTo(0.03, -0.045); wing.lineTo(0.31, -0.032); wing.quadraticCurveTo(0.38, -0.02, 0.37, 0.02);
  wing.lineTo(0.31, 0.034); wing.lineTo(0.03, 0.045); wing.lineTo(0.03, -0.045);
  const wingGeo = new THREE.ExtrudeGeometry(wing, { depth: 0.014, bevelEnabled: false });
  wingGeo.rotateX(-Math.PI / 2); wingGeo.translate(0, -0.007, 0);
  [0.38, -0.2, 0.38, -0.2].forEach((bend, i) => {
    const arm = new THREE.Group(); arm.rotation.y = i * Math.PI / 2; arm.position.y = 0.16;
    const w = new THREE.Mesh(wingGeo, M.steel); w.rotation.z = bend; w.rotation.x = 0.12; // bent, with a slight pitch
    arm.add(w); g.add(arm);
  });
  g.add(cylinder(0.055, 0.06, 0.1, M.steel, [0, 0.15, 0], { segments: 20 }));
  g.add(cylinder(0.045, 0.045, 0.05, M.brushed, [0, 0.22, 0], { segments: 6 }));
  g.add(cylinder(0.03, 0.03, 0.3, M.steel, [0, 0.0, 0], { segments: 12 }));
  const blur = new THREE.Mesh(new THREE.RingGeometry(0.07, 0.39, 48), new THREE.MeshBasicMaterial({ color: 0xb8c2cc, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
  blur.rotation.x = -Math.PI / 2; blur.position.y = 0.17; blur.userData = { blur: true, noGhost: true, noShadow: true, noContactShadow: true };
  g.add(blur);
  g.userData.anchor = [0.26, 0.22, 0.12]; g.userData.anchorStatic = true;
  add('blades', g, new THREE.Vector3(), new THREE.Vector3(0, 0.75, 0), bladeSpin);
}
// Jar coupler: six teeth under the jar that sit between the motor coupler's teeth.
{
  const g = new THREE.Group();
  g.add(cylinder(0.11, 0.1, 0.1, M.rubber, [0, -0.07, 0], { segments: 24 }));
  g.add(spokes(6, [0.1, 0.14, 0.04], 0.14, -0.14, M.rubber, Math.PI / 6));
  g.userData.anchor = [0.15, -0.1, 0.1]; g.userData.anchorStatic = true;
  add('jarCoupler', g, new THREE.Vector3(), new THREE.Vector3(0, 0.5, 0), bladeSpin);
}
const JAR_PARTS = ['jar', 'lid', 'blades', 'jarCoupler'];

// ---------- Particles ----------
// Food in the jar: small pieces loop down the middle, out along the blades, up the wall and
// back in at the top, while they swirl a little around the jar.
const FOOD = { top: 0.95, bottom: 0.14, wall: 0.52, n: 240 };
const food = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.036, 1), new THREE.MeshStandardMaterial({ roughness: 0.75 }), FOOD.n);
food.instanceMatrix.setUsage(THREE.DynamicDrawUsage); food.frustumCulled = false; food.visible = false;
food.userData.noContactShadow = true; scene.add(food);
const foodSeeds = Array.from({ length: FOOD.n }, () => ({ a: Math.random() * Math.PI * 2, u: Math.random(), s: 0.7 + Math.random() * 0.6, j: Math.random(), k: 0.6 + Math.random() * 0.7 }));
{
  const a = linear(0xe0aa3e), b = linear(0xb8692a), c = new THREE.Color();
  foodSeeds.forEach((p, i) => food.setColorAt(i, c.copy(a).lerp(b, Math.random())));
}
function foodPath(u, j) {
  const H = FOOD.top - FOOD.bottom, rIn = 0.04 + j * 0.12, rOut = FOOD.wall - 0.05 * j, Wd = rOut - rIn;
  let d = u * (2 * H + 2 * Wd);
  if (d < H) return [rIn, FOOD.top - d];
  d -= H; if (d < Wd) return [rIn + d, FOOD.bottom + 0.05 * j];
  d -= Wd; if (d < H) return [rOut + 0.05 * d / H, FOOD.bottom + d];
  d -= H; return [rOut + 0.05 - d, FOOD.top + 0.04 * j];
}
const piece = new THREE.Object3D();
// Cooling air: down through the motor, out past the fan, and out of the vents.
const air = createParticles(scene, 200, {
  color: 0x5e8dc4, size: 0.06,
  seed: () => ({ a: Math.random() * Math.PI * 2, u: Math.random(), s: 0.7 + Math.random() * 0.6, j: Math.random() }),
});
// Returns [x, y, z] for a particle at u (0..1 along its path) that started at angle a.
function airPath(u, j, a) {
  const c = Math.cos(a), s = Math.sin(a);
  if (u < 0.5) { const r = 0.4 + 0.3 * j; return [c * r, -0.42 - (u / 0.5) * 1.1, s * r]; }
  if (u < 0.75) { const k = (u - 0.5) / 0.25, r = 0.4 + 0.3 * j + k * 0.3; return [c * r, Y.fan - 0.04 - k * 0.1, s * r]; }
  // Out through the vent slots on the nearer side.
  const k = (u - 0.75) / 0.25, side = Math.sign(c) || 1;
  return [side * (0.9 + k * 0.8), -1.66 + (j - 0.5) * 0.2 - k * 0.1, s * 0.55 * (1 + k * 0.3)];
}

// ---------- State and UI ----------
const state = {
  step: 0, explode: 0, targetExplode: 0, playing: true, focus: [], cut: false,
  speed: 3, magnets: false, air: false, food: false, liftOn: false,
  rpm: 0, bladeRpm: 0, load: 0, lift: 0, liftV: 0, motorAngle: 0, bladeAngle: 0,
  field: 0, arm: 0, ac: 1, acClock: 0, blur: 0, foodShow: 0,
};
let camGoal = null;
const story = createStoryUI({
  story: MIXER_STORY, state,
  onStep: s => {
    state.focus = s.focus; state.cut = s.cut; state.magnets = s.magnets ?? false;
    state.air = !!s.air; state.food = !!s.food; state.liftOn = !!s.lift; state.acClock = 0;
    const v = VIEWS[s.view]; camGoal = { ...v, target: new THREE.Vector3(...v.target) };
    cam.theta = v.theta + THREE.MathUtils.euclideanModulo(cam.theta - v.theta + Math.PI, 2 * Math.PI) - Math.PI; // take the short way round
  },
});
const speedOut = document.getElementById('speed-out');
bindRange('speed', v => { state.speed = v; speedOut.textContent = v ? String(v) : 'Off'; });
createCallouts(stage, { parts, state, story: MIXER_STORY });

const focusStyle = {
  highlight: 0.16,
  opacity(name, mesh, hot) {
    if (mesh.userData.blur) return state.blur;
    if (mesh.userData.foot && state.liftOn) return 0.22; // see the jar coupler inside the foot
    let alpha = 1;
    if (mesh.userData.cutaway && mesh.userData.cutaway === state.cut) alpha = hot ? 0.3 : 0.14;
    else if (state.focus.length && !hot && looksInside(state)) alpha = 0.3;
    return alpha;
  },
};

// The magnets: the stator's halves and the armature's teeth tint north (red) and south (blue).
// The armature's poles stay put in space while it turns, because the commutator switches each
// coil's current as it passes the brushes. On AC both reverse together.
const IRON = linear(0x4a525b), NORTH = linear(0xd8453b), SOUTH = linear(0x3d7fd6);
const tint = (mesh, k) => mesh.material.color.copy(IRON).lerp(k > 0 ? NORTH : SOUTH, Math.min(1, Math.abs(k)));
function showMagnets() {
  for (const side of [1, -1]) poleIron[side].forEach(m => tint(m, side * state.ac * state.field * 0.85));
  teeth.forEach(m => tint(m, -Math.sin(m.userData.angle + state.motorAngle) * state.ac * state.arm * 0.85)); // its +z side is north
}

const readout = { box: document.getElementById('readout'), sw: document.getElementById('r-switch'), rpm: document.getElementById('r-rpm'), tip: document.getElementById('r-tip') };
const fmt = n => (Math.round(n / 100) * 100).toLocaleString('en-US');
let readoutTimer = 0;
function showReadout(coupled) {
  readout.sw.textContent = state.speed ? String(state.speed) : 'Off';
  readout.rpm.textContent = `${fmt(state.rpm)} rpm`;
  readout.tip.textContent = `${Math.round(tipSpeedKmh(state.bladeRpm))} km/h`;
  readout.box.classList.toggle('lifted', !coupled);
}

// ---------- Sound ----------
// The motor whines at its own turning speed (18,000 rpm is 300 turns a second), the brushes
// hiss at the rate the commutator bars pass them, and a full jar adds a low grinding rumble.
const whine = sound.loop({ type: 'tone', wave: 'sawtooth', freq: 100 });
const hiss = sound.loop({ type: 'noise', filter: 'bandpass', freq: 3000, q: 2 });
const grind = sound.loop({ type: 'noise', filter: 'lowpass', freq: 500, q: 0.8 });
const was = { speed: state.speed, lift: 0 };
function playSounds(now, coupled) {
  const run = state.rpm / MIXER.topRpm;
  whine.set(0.014 * Math.min(1, run * 3), Math.max(40, state.rpm / 60));
  hiss.set(0.035 * run, 400 + state.rpm / 60 * MIXER.bars);
  grind.set(state.food && coupled ? 0.09 * run * (0.75 + 0.25 * Math.sin(now / 70)) : 0, 260 + 420 * run);
  if (state.speed !== was.speed) { sound.click(0.3); was.speed = state.speed; } // the switch clicks to a new position
  if (state.lift < 0.02 && was.lift >= 0.02) sound.thunk(0.35); // the jar seats on the base
  was.lift = state.lift;
}

// ---------- Frame ----------
const VISUAL_TOP = 13; // rad/s on screen at 18,000 rpm; any faster and the 12 teeth would strobe backward
startLoop(stage, (dt, now) => {
  update(state, focusStyle, reduced ? 1 : 0.09, dt);
  if (camGoal) { // ease to the step's view once; after that the reader's own zoom wins
    const k = reduced ? 1 : Math.min(1, dt * 3);
    for (const a of ['r', 'theta', 'phi']) cam[a] += (camGoal[a] - cam[a]) * k;
    cam.target.lerp(camGoal.target, k);
    if (Math.abs(camGoal.r - cam.r) < 0.05 && Math.abs(camGoal.theta - cam.theta) < 0.01 && cam.target.distanceTo(camGoal.target) < 0.02) camGoal = null;
  }

  // The jar lifts off its seat for the coupler step.
  const liftTarget = state.liftOn ? 1.1 : 0;
  if (reduced) { state.lift = liftTarget; state.liftV = 0; }
  else { state.liftV += (90 * (liftTarget - state.lift) - 11 * state.liftV) * dt; state.lift += state.liftV * dt; }
  JAR_PARTS.forEach(name => { parts[name].group.position.y += state.lift; });
  const coupled = state.lift < 0.03 && state.explode < 0.04;

  // Motor: spins up and coasts down; a full jar slows it.
  state.load += ((state.food && coupled ? 1 : 0) - state.load) * Math.min(1, dt * 2);
  const rpmTarget = state.playing ? motorRpm(state.speed, state.load) : 0;
  state.rpm += (rpmTarget - state.rpm) * Math.min(1, dt * (reduced ? 60 : rpmTarget > state.rpm ? 2.5 : 1.2));
  state.bladeRpm = coupled ? state.rpm : state.bladeRpm * Math.max(0, 1 - dt * 3);
  if (state.bladeRpm < 5) state.bladeRpm = 0;
  state.motorAngle -= dt * state.rpm / MIXER.topRpm * VISUAL_TOP;
  state.bladeAngle -= dt * state.bladeRpm / MIXER.topRpm * VISUAL_TOP;
  motorSpin.rotation.y = state.motorAngle;
  bladeSpin.rotation.y = coupled ? state.motorAngle : state.bladeAngle;
  if (coupled) state.bladeAngle = state.motorAngle;
  state.blur = 0.45 * Math.min(1, state.bladeRpm / MIXER.topRpm);

  // Magnets: the field shows from the stator step on; on AC both flip once a second.
  const m = state.magnets;
  state.field += ((m ? 1 : 0) - state.field) * Math.min(1, dt * 4);
  state.arm += ((m === 'dc' || m === 'ac' ? 1 : 0) - state.arm) * Math.min(1, dt * 4);
  if (state.playing && m === 'ac') state.acClock += dt;
  const acTarget = m === 'ac' && Math.floor(state.acClock) % 2 ? -1 : 1;
  state.ac += (acTarget - state.ac) * Math.min(1, dt * (reduced ? 60 : 14));
  showMagnets();

  // Knob turns to the chosen speed.
  const knobTarget = -KNOB.angles[state.speed];
  dial.rotation.z += (knobTarget - dial.rotation.z) * Math.min(1, dt * (reduced ? 60 : 12));

  const run = state.rpm / MIXER.topRpm, playing = state.playing ? 1 : 0;
  // Cooling air through the base.
  if (air.fade(state.air ? 0.85 * Math.min(1, run * 2) : 0, Math.min(1, dt * 3))) {
    const base = parts.fan.group.position.y;
    air.seeds.forEach((p, i) => {
      p.u = (p.u + dt * p.s * 0.45 * run * playing) % 1;
      const [x, y, z] = airPath(p.u, p.j, p.a + Math.min(p.u, 0.75) * 1.5);
      air.place(i, x, y + (p.u > 0.5 ? base : 0), z);
    });
    air.commit();
  }
  // Food turning over in the jar.
  const bladeRun = state.bladeRpm / MIXER.topRpm;
  state.foodShow += ((state.food ? 1 : 0) - state.foodShow) * Math.min(1, dt * 3);
  food.visible = state.foodShow > 0.01;
  if (food.visible) {
    const lift = parts.jar.group.position.y;
    foodSeeds.forEach((p, i) => {
      p.u = (p.u + dt * p.s * 0.32 * bladeRun * playing) % 1;
      p.a -= dt * p.s * 1.4 * bladeRun * playing;
      const [r, y] = foodPath(p.u, p.j);
      piece.position.set(Math.cos(p.a) * r, y + lift, Math.sin(p.a) * r);
      piece.rotation.set(p.a * 3, p.u * 9, 0); piece.scale.setScalar(p.k * state.foodShow);
      piece.updateMatrix(); food.setMatrixAt(i, piece.matrix);
    });
    food.instanceMatrix.needsUpdate = true;
  }

  playSounds(now, coupled);
  readoutTimer -= dt;
  if (readoutTimer <= 0) { showReadout(coupled); readoutTimer = 0.12; }
});
story.setStep(0, false);
