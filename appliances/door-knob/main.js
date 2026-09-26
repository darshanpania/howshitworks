import * as THREE from 'three';
import { createStage, addFloor, addStudioLights } from '../../src/engine/stage.js';
import { createParts, looksInside } from '../../src/engine/parts.js';
import { createCallouts } from '../../src/engine/callouts.js';
import { createStoryUI } from '../../src/engine/story-ui.js';
import { sound } from '../../src/engine/sound.js';
import { startLoop, reducedMotion as reduced } from '../../src/engine/loop.js';
import { box, cylinder, lathe, roundedRect, coilGeometry } from '../../src/kit/shapes.js';
import { createMaterials } from '../../src/kit/materials.js';
import { KNOB_STORY } from './story.js';
import { LATCH, PERIOD, pose, status, camRetract, strikeRetract } from './latch.js';

// ---------- Stage and light ----------
// Scale: 1 unit = 1 cm. The door edge is at x = 0, the door is 4 cm thick (z = -2..2),
// and the outside face looks toward +z. The spindle runs along z at the backset.
const stage = createStage(document.getElementById('c'), {
  fov: 36, pbr: true, camera: { theta: 0.5, phi: 1.05, r: 44, target: [-3, -1, 0] }, zoom: [14, 70], phiLimit: 0.25,
});
const { scene } = stage;
addStudioLights(stage, { key: [10, 16, 14], extent: 20, far: 60, scale: 2.5 });
addFloor(stage, -10, { size: 40, opacity: 0.14, height: 22 });

// ---------- Materials ----------
const M = createMaterials({
  wood: { color: 0x9a6b44, roughness: 0.75 },
  jamb: { color: 0xb88a5e, roughness: 0.75 },
  brass: { look: 'brass', side: THREE.DoubleSide },
  steel: 'steel', brushed: 'brushed', iron: 'iron',
  spring: { color: 0x7f9bb3, metalness: 0.8, roughness: 0.3 },
  button: { color: 0xb8341f, metalness: 0.3, roughness: 0.4 },
}, { pbr: true });

// ---------- Helpers ----------
const X = LATCH.backset * -1; // spindle x
// A flat plate in the YZ plane with a rectangular hole, THICK along +x from x0.
function holedPlate({ z: [z0, z1], h, hole: [hz, hh], thick, x0, mat }) {
  const shape = roundedRect(z1 - z0, h, 0.4, -(z0 + z1) / 2, 0);
  shape.holes.push(roundedRect(hz, hh, 0.1, 0, 0, new THREE.Path()));
  const geo = new THREE.ExtrudeGeometry(shape, { depth: thick, bevelEnabled: false });
  geo.rotateY(Math.PI / 2); // shape x -> world -z, extrusion -> world +x
  const mesh = new THREE.Mesh(geo, mat); mesh.position.x = x0; return mesh;
}
// A shape drawn in the XZ plane (shape y = world z), extruded along y and centred on y = 0.
function extrudeXZ(points, height, mat) {
  const geo = new THREE.ExtrudeGeometry(new THREE.Shape(points.map(([x, z]) => new THREE.Vector2(x, z))), { depth: height, bevelEnabled: false });
  geo.rotateX(Math.PI / 2); geo.translate(0, height / 2, 0);
  return new THREE.Mesh(geo, mat);
}
// Turn a group built along +y so it points along +z (dir = 1) or -z (dir = -1).
const alongZ = (object, dir) => { object.rotation.x = dir * Math.PI / 2; return object; };

// ---------- Parts ----------
const root = new THREE.Group(); scene.add(root);
const door = new THREE.Group(); root.add(door); // everything that moves with the door
const { parts, add, update } = createParts(root, { shadows: true, lively: true });

// Door slab: a 16 × 16 cm piece near the edge, with the 54 mm cross bore.
{
  const shape = roundedRect(16, 16, 0.01, -8, 0);
  shape.holes.push(new THREE.Path().absarc(X, 0, 2.7, 0, Math.PI * 2, true));
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 4, bevelEnabled: false, curveSegments: 32 });
  geo.translate(0, 0, -2);
  const slab = new THREE.Mesh(geo, M.wood); slab.userData.cutaway = true;
  add('door', slab, new THREE.Vector3(), new THREE.Vector3(), door);
}

// Jamb with its door stop, and the strike plate screwed to its face.
{
  const g = new THREE.Group();
  const jamb = box([4, 16, 5.2], M.jamb, [LATCH.jambGap + 2, 0, -0.6]); jamb.userData.cutaway = true; g.add(jamb);
  const stop = box([1.2, 16, 1.2], M.jamb, [LATCH.jambGap - 0.6, 0, -2.6]); stop.userData.cutaway = true; g.add(stop);
  add('jamb', g, new THREE.Vector3(), new THREE.Vector3(9, 0, 0));
  const strike = new THREE.Group();
  strike.add(holedPlate({ z: [-1.4, 1.9], h: 5, hole: [2 * LATCH.hole, 1.8], thick: 0.15, x0: LATCH.jambGap - 0.02, mat: M.brushed }));
  add('strike', strike, new THREE.Vector3(), new THREE.Vector3(6, 0, 0));
}

// Tubular latch body: faceplate and tube, fixed in the door edge.
{
  const g = new THREE.Group();
  g.add(holedPlate({ z: [-1.25, 1.25], h: 5.7, hole: [1.1, 1.7], thick: 0.2, x0: -0.2, mat: M.brushed }));
  const tube = cylinder(1.0, 1.0, 3.7, M.steel, [-2.05, 0, 0], { open: true }); tube.rotation.z = Math.PI / 2;
  tube.userData.cutaway = true; g.add(tube);
  const washer = cylinder(0.95, 0.95, 0.12, M.steel, [-3.3, 0, 0]); washer.rotation.z = Math.PI / 2; g.add(washer);
  add('latch', g, new THREE.Vector3(), new THREE.Vector3(4, 0, 0), door);
}

// Latch bolt with its retractor frame. It slides along -x by the retract amount.
const bolt = new THREE.Group();
{
  // Bevel on the -z side: that side meets the jamb first as the door closes.
  const t = LATCH.throw, b = LATCH.boltHalf;
  bolt.add(extrudeXZ([[-1.2, -b], [t - 1.0, -b], [t, b], [-1.2, b]], 1.6, M.brass));
  const rod = cylinder(0.2, 0.2, 2.9, M.steel, [-2.65, 0, 0]); rod.rotation.z = Math.PI / 2; bolt.add(rod);
  // Frame around the spindle: front bar, two side rails, and two tabs the cam arms push.
  const tabX = X - LATCH.play - 0.15 - 0.125;
  bolt.add(box([0.25, 4.85, 0.4], M.steel, [-4.1, 0, 0]));
  [1, -1].forEach(s => {
    bolt.add(box([-4.1 - tabX, 0.25, 0.4], M.steel, [(tabX - 4.1) / 2, s * 2.3, 0]));
    bolt.add(box([0.25, 1.1, 0.4], M.steel, [tabX, s * 1.72, 0]));
  });
  add('bolt', bolt, new THREE.Vector3(), new THREE.Vector3(4, 0, 0), door);
}

// Spindle: an 8 mm square bar through both knobs.
const spindle = box([0.8, 0.8, 9], M.steel, [0, 0, 0]);
add('spindle', spindle, new THREE.Vector3(X, 0, 0), new THREE.Vector3(0, 6, 0), door);

// Retractor cam: a hub on the spindle with two arms.
const cam = new THREE.Group();
{
  const hub = cylinder(0.75, 0.75, 0.6, M.iron, [0, 0, 0]); hub.rotation.x = Math.PI / 2; cam.add(hub);
  cam.add(box([0.3, 2 * LATCH.arm, 0.4], M.iron, [0, 0, 0]));
  add('retractor', cam, new THREE.Vector3(X, 0, 0), new THREE.Vector3(0, -6, 0), door);
}

// Knobs: a fixed rose cup and a turning brass knob with grip ribs.
const KNOB = [[0, 0.9], [1.0, 0.9], [1.0, 1.75], [1.4, 2.4], [2.4, 3.2], [2.85, 4.2], [2.8, 5.0], [2.3, 5.7], [1.4, 6.1], [0, 6.2]];
function knobSide(dir) {
  const g = alongZ(new THREE.Group(), dir); // local +y points away from the door face
  const rose = lathe([[1.05, 0], [3.0, 0], [3.0, 0.5], [2.6, 0.9], [1.05, 0.9], [1.05, 0]], M.brass);
  rose.userData.cutaway = true; g.add(rose);
  const turn = new THREE.Group(); g.add(turn);
  turn.add(lathe(KNOB, M.brass));
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2;
    turn.add(box([0.3, 0.9, 0.3], M.brass, [Math.cos(a) * 2.8, 4.6, Math.sin(a) * 2.8], 0.1));
  }
  return { g, turn };
}
const outer = knobSide(1), inner = knobSide(-1);
// The catch on the outside rose that the lock bar drops into.
// Local y is world +z from the door face; local -z is world +y.
[-0.25, 0.25].forEach(dx => outer.g.add(box([0.2, 0.5, 0.55], M.steel, [dx, 1.0, -0.67])));
add('knobOut', outer.g, new THREE.Vector3(X, 0, 2), new THREE.Vector3(0, 0, 7), door);
add('knobIn', inner.g, new THREE.Vector3(X, 0, -2), new THREE.Vector3(0, 0, -7), door);

// Springs: the latch spring between the washer and the bolt, and a torsion spring in each rose.
const LATCH_SPRING = { from: -3.24, to: -1.2 };
const latchSpring = new THREE.Mesh(coilGeometry({ length: 1, turns: 6, radius: 0.5, wire: 0.06, axis: 'x', segmentsPerTurn: 20 }), M.spring);
{
  const g = new THREE.Group(); g.add(latchSpring);
  [1, -1].forEach(dir => {
    const coil = new THREE.Mesh(coilGeometry({ length: 0.5, turns: 3, radius: 1.7, wire: 0.08, segmentsPerTurn: 30 }), M.spring);
    alongZ(coil, 1); coil.position.set(X, 0, dir * 2.45); g.add(coil);
  });
  add('springs', g, new THREE.Vector3(), new THREE.Vector3(0, -12, 0), door);
}

// Privacy button in the inside knob, and the lock bar it pushes along the spindle.
const lockBar = new THREE.Group();
{
  const g = new THREE.Group();
  const button = cylinder(0.45, 0.45, 0.5, M.button, [0, 0, 0]); alongZ(button, 1); button.position.z = -8.35; lockBar.add(button);
  const bar = cylinder(0.12, 0.12, 10.4, M.button, [0, 0, 0]); alongZ(bar, 1); bar.position.set(0, 0.55, -3.0); lockBar.add(bar);
  lockBar.add(box([0.2, 0.55, 0.3], M.button, [0, 0.67, 2.2])); // lug: slides into the catch when locked
  g.add(lockBar);
  add('button', g, new THREE.Vector3(X, 0, 0), new THREE.Vector3(0, 5, -9), door);
}

// ---------- State and UI ----------
const state = { step: 0, explode: 0, targetExplode: 0, playing: true, focus: [], cut: false, mode: 'turn', t: 0 };
const shown = { knob: 0, outer: 0, door: 0, button: 0, bolt: 0 };
const story = createStoryUI({
  story: KNOB_STORY, state,
  onStep: s => { state.focus = s.focus; state.cut = s.cut; state.mode = s.mode; state.t = 0; },
});
createCallouts(stage, { parts, state, story: KNOB_STORY });

const focusStyle = {
  highlight: 0.18,
  opacity(name, mesh, hot) {
    let alpha = 1;
    if (mesh.userData.cutaway && state.cut) alpha = 0.16;
    if (state.focus.length && !hot && looksInside(state)) alpha = Math.min(alpha, 0.3);
    return alpha;
  },
};

const readout = { box: document.getElementById('readout'), knob: document.getElementById('r-knob'), bolt: document.getElementById('r-bolt'), door: document.getElementById('r-door') };
let readoutTimer = 0;
function showReadout() {
  readout.knob.textContent = `${Math.round(THREE.MathUtils.radToDeg(shown.outer))}°`;
  readout.bolt.textContent = `${Math.round((LATCH.throw - shown.bolt) * 10)} mm out`;
  const s = status(shown, state.mode === 'lock');
  readout.door.textContent = s;
  readout.box.classList.toggle('open', s === 'Open');
}

// ---------- Frame ----------
startLoop(stage, dt => {
  update(state, focusStyle, reduced ? 1 : 0.09, dt);
  if (state.playing) state.t = (state.t + dt) % PERIOD[state.mode];
  const target = pose(state.mode, state.t);
  // Ease toward the pose so a step change never jumps; the bolt follows the door exactly.
  const k = reduced ? 1 : Math.min(1, dt * 14);
  for (const key of ['knob', 'outer', 'door', 'button']) shown[key] += (target[key] - shown[key]) * k;
  shown.bolt = Math.max(camRetract(shown.knob), strikeRetract(shown.door));

  door.position.z = shown.door;
  outer.turn.rotation.y = shown.outer;
  inner.turn.rotation.y = -shown.knob;
  spindle.rotation.z = shown.knob;
  cam.rotation.z = shown.knob;
  bolt.children.forEach(c => { c.userData.home ??= c.position.x; c.position.x = c.userData.home - shown.bolt; });
  const springLen = LATCH_SPRING.to - shown.bolt - LATCH_SPRING.from;
  latchSpring.scale.x = springLen; latchSpring.position.x = LATCH_SPRING.from + springLen / 2;
  lockBar.position.z = shown.button * 0.8;

  playSounds(target);

  readoutTimer -= dt;
  if (readoutTimer <= 0) { showReadout(); readoutTimer = 0.1; }
});

// ---------- Sound ----------
// Each sound fires on an edge: the moment a value crosses a threshold.
const was = { knob: 0, bolt: 0, door: 0, button: 0, rattle: 0 };
function playSounds(target) {
  if (shown.knob > 0.08 && was.knob <= 0.08) sound.tone({ freq: 190, glide: 150, type: 'triangle', gain: 0.08, release: 0.25 }); // the spring winds up
  if (shown.bolt < 0.25 && was.bolt >= 0.25) { sound.click(0.45); sound.thunk(0.12); } // the latch snaps out
  if (shown.bolt > 0.9 && was.bolt <= 0.9) sound.click(0.15); // bolt hits its stop inside the door
  if (shown.door < 0.05 && was.door >= 0.05) sound.thunk(0.5); // the door meets the stop
  if (shown.button > 0.5 && was.button <= 0.5) sound.click(0.3);
  const side = Math.sign(target.outer);
  if (state.mode === 'lock' && side && side !== was.rattle) { sound.click(0.12); was.rattle = side; }
  was.knob = shown.knob; was.bolt = shown.bolt; was.door = shown.door; was.button = shown.button;
}
story.setStep(0, false);
