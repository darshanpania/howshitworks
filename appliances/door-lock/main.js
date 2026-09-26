import * as THREE from 'three';
import { createStage, addFloor, addStudioLights } from '../../src/engine/stage.js';
import { createParts, looksInside } from '../../src/engine/parts.js';
import { createCallouts } from '../../src/engine/callouts.js';
import { createStoryUI } from '../../src/engine/story-ui.js';
import { sound } from '../../src/engine/sound.js';
import { startLoop, reducedMotion as reduced } from '../../src/engine/loop.js';
import { box, cylinder, roundedRect, coilGeometry } from '../../src/kit/shapes.js';
import { createMaterials } from '../../src/kit/materials.js';
import { LOCK_STORY } from './story.js';
import { LOCK, RIGHT, WRONG, PIN_X, KEY_PIN, PERIOD, OUT, keyTop, stacks, pose } from './pins.js';

// ---------- Stage and light ----------
// Scale: 1 unit = 1 mm. The plug turns about the x axis, from its face at x = 0 to x = 30.
// Pins stand along +y. The deadbolt slides along -z toward the door frame, 60 mm away.
const VIEWS = {
  mid: { r: 95, theta: -0.5, phi: 1.2, target: [10, 3, 0] },
  pins: { r: 68, theta: -0.4, phi: 1.3, target: [13, 6, 0] },
  all: { r: 190, theta: -1.15, phi: 1.1, target: [22, 0, -30] },
};
const stage = createStage(document.getElementById('c'), {
  fov: 36, pbr: true, camera: VIEWS.mid, zoom: [30, 260], phiLimit: 0.25,
});
const { scene, cam } = stage;
stage.camera.far = 600; stage.camera.updateProjectionMatrix(); // the scene is in millimetres
addStudioLights(stage, { key: [-40, 80, 60], extent: 90, far: 300, scale: 10 });
addFloor(stage, -45, { size: 200, cell: 10, opacity: 0.12, shadow: false, center: [20, -30], height: 80, blur: 3.5 }); // 1 cm grid

// ---------- Materials ----------
const M = createMaterials({
  brass: { look: 'brass', side: THREE.DoubleSide },
  pin: { look: 'brass', color: 0xe0b45a },
  nickel: { look: 'brushed', color: 0xc9ccd1, side: THREE.DoubleSide },
  keyMetal: { color: 0xcfc8b2, metalness: 0.85, roughness: 0.3 },
  steel: 'steel', iron: 'iron', dark: 'dark',
  spring: { color: 0x7f9bb3, metalness: 0.8, roughness: 0.3 },
  jamb: { color: 0xb88a5e, roughness: 0.75 },
}, { pbr: true });

// ---------- Helpers ----------
// A plate in the XY plane with a rectangular hole, THICK along +z from z0.
function plateXY({ w, h, cx = 0, hole: [hw, hh], thick, z0, mat }) {
  const shape = roundedRect(w, h, 1.5, cx, 0);
  shape.holes.push(roundedRect(hw, hh, 1, cx, 0, new THREE.Path()));
  const geo = new THREE.ExtrudeGeometry(shape, { depth: thick, bevelEnabled: false });
  const mesh = new THREE.Mesh(geo, mat); mesh.position.z = z0; return mesh;
}
// Extrude a shape drawn in the (z, y) plane along +x from 0 to depth. The shapes here are symmetric in z.
function extrudeAlongX(shape, depth, mat) {
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 40 });
  geo.rotateY(Math.PI / 2);
  return new THREE.Mesh(geo, mat);
}
const alongX = mesh => { mesh.rotation.z = Math.PI / 2; return mesh; };

// ---------- Parts ----------
const root = new THREE.Group(); scene.add(root);
const turner = new THREE.Group(); root.add(turner); // plug, key pins, key and tailpiece turn together
const { parts, add, update } = createParts(root, { shadows: true, lively: true });

// Housing: the round shell plus the tower that holds the five pin chambers.
{
  const shape = new THREE.Shape();
  const a = Math.atan2(7.7, 3.6);
  shape.moveTo(3.6, 7.7); shape.lineTo(3.6, 20.2); shape.lineTo(-3.6, 20.2); shape.lineTo(-3.6, 7.7);
  shape.absarc(0, 0, 8.5, Math.PI - a, 2 * Math.PI + a, false);
  shape.holes.push(new THREE.Path().absarc(0, 0, LOCK.R + 0.05, 0, Math.PI * 2, true));
  const shell = extrudeAlongX(shape, 30, M.nickel); shell.userData.cutaway = true;
  add('housing', shell, new THREE.Vector3(), new THREE.Vector3());
}

// Plug with its keyway, and the flat tailpiece and lever on its back.
{
  const g = new THREE.Group();
  const plug = alongX(cylinder(LOCK.R - 0.05, LOCK.R - 0.05, 30, M.brass, [15, 0, 0], { segments: 48 })); plug.userData.cutaway = true; g.add(plug);
  const face = alongX(cylinder(7.4, 7.4, 1.2, M.brass, [-0.6, 0, 0], { segments: 48 })); face.userData.cutaway = true; g.add(face);
  g.add(box([0.4, 8, 2.4], M.dark, [-1.3, -0.7, 0])); // keyway opening
  add('plug', g, new THREE.Vector3(), new THREE.Vector3(-18, 0, 0), turner);
}
{
  const g = new THREE.Group();
  g.add(box([3, 7, 2], M.iron, [31.5, 0, 0]));
  const lever = new THREE.Group(); lever.position.x = 32.5; lever.rotation.x = Math.PI / 4;
  lever.add(box([1, LOCK.lever + 2, 4], M.iron, [0, LOCK.lever / 2, 0]));
  lever.add(alongX(cylinder(1, 1, 4, M.steel, [1.5, LOCK.lever, 0], { segments: 16 })));
  g.add(lever);
  add('cam', g, new THREE.Vector3(), new THREE.Vector3(12, 0, 0), turner);
}

// Key pins ride in the plug; driver pins and springs stay in the housing.
const keyPins = [], drivers = [], springs = [];
const SPRING_LEN = 7;
{
  const kp = new THREE.Group(), dp = new THREE.Group(), sp = new THREE.Group();
  PIN_X.forEach((x, i) => {
    const pin = new THREE.Group();
    const tip = new THREE.Mesh(new THREE.ConeGeometry(1.46, 0.8, 20), M.pin); tip.rotation.x = Math.PI; tip.position.y = 0.4; pin.add(tip);
    pin.add(cylinder(1.46, 1.46, KEY_PIN[i] - 0.8, M.pin, [0, 0.8 + (KEY_PIN[i] - 0.8) / 2, 0], { segments: 20 }));
    pin.position.x = x; kp.add(pin); keyPins.push(pin);
    const driver = cylinder(1.46, 1.46, LOCK.driver, M.steel, [x, 0, 0], { segments: 20 }); dp.add(driver); drivers.push(driver);
    const spring = new THREE.Mesh(coilGeometry({ length: SPRING_LEN, turns: 9, radius: 1.15, wire: 0.22, segmentsPerTurn: 16 }), M.spring);
    spring.position.x = x; sp.add(spring); springs.push(spring);
  });
  add('keyPins', kp, new THREE.Vector3(), new THREE.Vector3(-18, 0, 0), turner);
  add('drivers', dp, new THREE.Vector3(), new THREE.Vector3(0, 12, 0));
  add('springs', sp, new THREE.Vector3(), new THREE.Vector3(0, 22, 0));
}

// Keys: the right one and one with a single cut too deep. The blade outline follows keyTop().
function makeKey(bitting) {
  const g = new THREE.Group();
  const s = new THREE.Shape();
  s.moveTo(0, -4.5); s.lineTo(LOCK.tip - 1.5, -4.5);
  for (let x = LOCK.tip; x >= 0; x -= 0.1) s.lineTo(x, keyTop(x, bitting));
  s.lineTo(0, 5.5); s.lineTo(-3, 5.5); s.lineTo(-3, -5.5); s.lineTo(0, -5.5);
  const geo = new THREE.ExtrudeGeometry(s, { depth: 2, bevelEnabled: false }); geo.translate(0, 0, -1);
  g.add(new THREE.Mesh(geo, M.keyMetal));
  const bow = new THREE.Shape().absarc(-14, 0, 11, 0, Math.PI * 2, false);
  bow.holes.push(new THREE.Path().absarc(-19, 0, 2.5, 0, Math.PI * 2, true));
  const bowGeo = new THREE.ExtrudeGeometry(bow, { depth: 2.4, bevelEnabled: false, curveSegments: 40 }); bowGeo.translate(0, 0, -1.2);
  g.add(new THREE.Mesh(bowGeo, M.keyMetal));
  return g;
}
const keyShift = new THREE.Group(); // slides the key in and out
const rightKey = makeKey(RIGHT), wrongKey = makeKey(WRONG);
keyShift.add(rightKey, wrongKey);
add('key', keyShift, new THREE.Vector3(), new THREE.Vector3(-30, 0, 0), turner);

// Deadbolt: a yoke plate with a slot for the lever pin, and the bolt itself.
const bolt = new THREE.Group();
{
  const yoke = new THREE.Shape(); roundedRect(5, 31, 1, 0, 4.5, yoke);
  yoke.holes.push(roundedRect(2.6, 8.2, 1.2, 0, 15.1, new THREE.Path()));
  const plate = extrudeAlongX(yoke, 1.5, M.steel); plate.position.x = 34.2; bolt.add(plate);
  bolt.add(box([8, 22, 76.5], M.steel, [40, 0, -35.75], 1));
  add('bolt', bolt, new THREE.Vector3(), new THREE.Vector3(0, 0, -16));
}

// Door edge: the faceplate, and the jamb with its strike plate.
{
  const g = new THREE.Group();
  g.add(plateXY({ w: 26, h: 57, cx: 40, hole: [9, 23], thick: 1.5, z0: -61.5, mat: M.nickel }));
  g.add(plateXY({ w: 30, h: 64, cx: 40, hole: [10, 24], thick: 1.2, z0: -65.2, mat: M.nickel }));
  const jamb = box([40, 80, 32], M.jamb, [40, 0, -81]); jamb.userData.cutaway = true; g.add(jamb);
  add('frame', g, new THREE.Vector3(), new THREE.Vector3(0, 0, -30));
}

// ---------- State and UI ----------
const state = { step: 0, explode: 0, targetExplode: 0, playing: true, focus: [], cut: false, mode: 'rest', t: 0 };
const shown = { shift: -45, turn: 0 };
let camGoal = null;
const story = createStoryUI({
  story: LOCK_STORY, state,
  onStep: s => {
    state.focus = s.focus; state.cut = s.cut; state.mode = s.mode; state.t = 0;
    const v = VIEWS[s.view]; camGoal = { ...v, target: new THREE.Vector3(...v.target) };
    cam.theta = v.theta + THREE.MathUtils.euclideanModulo(cam.theta - v.theta + Math.PI, 2 * Math.PI) - Math.PI; // take the short way round
  },
});
createCallouts(stage, { parts, state, story: LOCK_STORY });

const focusStyle = {
  highlight: 0.18,
  opacity(name, mesh, hot) {
    let alpha = 1;
    if (mesh.userData.cutaway && state.cut) alpha = hot ? 0.3 : 0.14;
    if (state.focus.length && !hot && looksInside(state)) alpha = Math.min(alpha, 0.3);
    return alpha;
  },
};

const readout = { box: document.getElementById('readout'), pins: document.getElementById('r-pins'), plug: document.getElementById('r-plug'), bolt: document.getElementById('r-bolt') };
let readoutTimer = 0, lastStacks = [];
function showReadout(bolt) {
  const set = lastStacks.filter(s => s.atShear).length;
  const turned = shown.turn > 0.1;
  readout.pins.textContent = `${set} / 5 set`;
  readout.plug.textContent = turned ? `Turned ${Math.round(THREE.MathUtils.radToDeg(shown.turn))}°` : set === 5 ? 'Free to turn' : 'Blocked';
  readout.bolt.textContent = `${Math.round(bolt)} mm out`;
  readout.box.classList.toggle('open', set === 5);
}

// ---------- Frame ----------
startLoop(stage, dt => {
  update(state, focusStyle, reduced ? 1 : 0.09, dt);
  if (camGoal) { // ease to the step's view once; after that the reader's own zoom wins
    const k = reduced ? 1 : Math.min(1, dt * 3);
    for (const a of ['r', 'theta', 'phi']) cam[a] += (camGoal[a] - cam[a]) * k;
    cam.target.lerp(camGoal.target, k);
    if (Math.abs(camGoal.r - cam.r) < 0.5 && Math.abs(camGoal.theta - cam.theta) < 0.01 && cam.target.distanceTo(camGoal.target) < 0.2) camGoal = null;
  }
  if (state.playing) state.t = (state.t + dt) % PERIOD[state.mode];
  const p = pose(state.mode, state.t);
  const k = reduced ? 1 : Math.min(1, dt * 12);
  shown.shift += (p.shift - shown.shift) * k;
  shown.turn += (p.turn - shown.turn) * k;

  keyShift.position.x = shown.shift;
  rightKey.visible = p.key === RIGHT; wrongKey.visible = p.key === WRONG;
  turner.rotation.x = -shown.turn; // turning this way swings the lever toward -z
  lastStacks = stacks(shown.shift, p.key);
  lastStacks.forEach((s, i) => {
    keyPins[i].position.y = s.bottom;
    drivers[i].position.y = s.gap + LOCK.driver / 2;
    const len = LOCK.chamberTop - s.driverTop;
    springs[i].scale.y = len / SPRING_LEN; springs[i].position.y = s.driverTop + len / 2;
  });
  const out = Math.max(0, (Math.sin(shown.turn - Math.PI / 4) + Math.SQRT1_2) * LOCK.lever);
  bolt.position.z = LOCK.throw / 2 - out;

  playSounds(p, out);

  readoutTimer -= dt;
  if (readoutTimer <= 0) { showReadout(out); readoutTimer = 0.1; }
});

// ---------- Sound ----------
// Pins tick as they crest each ridge of the key; the plug and bolt knock at their stops.
const was = { pins: [], rise: [], shift: OUT, turn: 0, out: 0, rattle: 0 };
function playSounds(p, out) {
  lastStacks.forEach((st, i) => {
    const prev = was.pins[i] ?? st.bottom, d = st.bottom - prev;
    if (Math.abs(d) > 0.004) {
      const rising = d > 0;
      if (was.rise[i] && !rising) sound.click(0.08 + Math.random() * 0.05); // over the top of a ridge
      was.rise[i] = rising;
    }
    was.pins[i] = st.bottom;
  });
  if (shown.shift > -0.3 && was.shift <= -0.3) sound.thunk(0.25); // key shoulder meets the plug face
  if (shown.turn > 0.05 && was.turn <= 0.05) sound.click(0.3); // plug starts to turn
  const full = LOCK.throw - 0.5;
  if (out > full && was.out <= full) sound.thunk(0.55); // deadbolt fully thrown
  if (out < 0.5 && was.out >= 0.5) sound.thunk(0.35); // deadbolt back in
  const side = Math.sign(p.turn);
  if (state.mode === 'wrong' && side && side !== was.rattle) { sound.click(0.18); was.rattle = side; }
  was.shift = shown.shift; was.turn = shown.turn; was.out = out;
}
story.setStep(0, false);
