import * as THREE from 'three';
import { createStage, addFloor, addStudioLights } from '../../src/engine/stage.js';
import { createParts, looksInside } from '../../src/engine/parts.js';
import { createCallouts } from '../../src/engine/callouts.js';
import { createStoryUI, bindRange } from '../../src/engine/story-ui.js';
import { sound } from '../../src/engine/sound.js';
import { startLoop, reducedMotion } from '../../src/engine/loop.js';
import { createMaterials } from '../../src/kit/materials.js';
import { createParticles } from '../../src/kit/effects.js';
import { box, lathe } from '../../src/kit/shapes.js';
import { FAN_STORY } from './story.js';

// ---------- Stage ----------
const stage = createStage(document.getElementById('c'), {
  fov: 38, pbr: true, camera: { theta: 0.6, phi: 1.2, r: 11, target: [0, -0.2, 0] }, zoom: [5, 16],
});
const { scene } = stage;
addStudioLights(stage, { key: [4, 9, 5], extent: 7, far: 30 });
// The fan hangs high above the floor, so its contact shadow is a wide, faint pool.
addFloor(stage, -3.2, { height: 7.5, blur: 5, darkness: 1.1, shadowSize: 12 });

// ---------- Materials ----------
const M = createMaterials({
  steel: 'brushed',
  canopy: { look: 'brushed', side: THREE.DoubleSide },
  housing: { color: 0x8E97A2, metalness: 0.6, roughness: 0.4, transparent: true, side: THREE.DoubleSide },
  copper: { color: 0xC4703A, metalness: 0.8, roughness: 0.35 },
  iron: { color: 0x4A525B, metalness: 0.5, roughness: 0.7 },
  alu: 'aluminium',
  blade: { color: 0x6B4E36, metalness: 0.1, roughness: 0.6, side: THREE.DoubleSide },
  cap: { color: 0x2B3138, metalness: 0.2, roughness: 0.6 },
  cover: { color: 0x8E97A2, metalness: 0.6, roughness: 0.4, side: THREE.DoubleSide },
  bearing: { color: 0xD4A64A, metalness: 0.9, roughness: 0.25 },
  wire: 'wire',
}, { pbr: true });

// ---------- Parts ----------
const root = new THREE.Group(); scene.add(root);
const spinner = new THREE.Group(); root.add(spinner); // everything that rotates
const { parts, add, update } = createParts(root, { shadows: true, lively: true });

// Canopy + downrod (fixed)
{
  const g = new THREE.Group();
  const canopy = new THREE.Mesh(new THREE.ConeGeometry(0.9, 0.5, 32, 1, true), M.canopy);
  canopy.position.y = 3.0; canopy.rotation.x = Math.PI; g.add(canopy);
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 2.2, 24), M.steel);
  rod.position.y = 1.8; g.add(rod);
  const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.2, 8), M.wire);
  wire.position.set(0.05, 1.8, 0.02); g.add(wire);
  add('rod', g, new THREE.Vector3(0,0,0), new THREE.Vector3(0,1.2,0));
}
// Fixed shaft
{
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 1.9, 24), M.steel);
  add('shaft', shaft, new THREE.Vector3(0,0,0), new THREE.Vector3(0,0.6,0));
}
// Stator: iron core + copper coils (fixed)
{
  const g = new THREE.Group();
  const core = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.7, 24), M.iron); g.add(core);
  const N = 16; // poles
  for (let i=0;i<N;i++){
    const a = i/N*Math.PI*2;
    const coil = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.06, 10, 20), M.copper);
    coil.position.set(Math.cos(a)*0.62, 0, Math.sin(a)*0.62);
    coil.lookAt(0,0,0); g.add(coil);
  }
  add('stator', g, new THREE.Vector3(0,0,0), new THREE.Vector3(0,0,0));
}
// Capacitor (fixed). It sits in the top cover above the motor, clear of the spinning casing.
// The cover's skirt comes down to just above the casing, so nothing inside shows through.
{
  const g = new THREE.Group();
  const cover = lathe([[0.9, 0.49], [0.86, 0.6], [0.5, 1.05], [0.26, 1.12]], M.cover, { segments: 48 });
  cover.userData.cutaway = true; g.add(cover);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.46, 20), M.cap);
  body.rotation.z = Math.PI/2; body.position.set(0.38, 0.72, 0); g.add(body);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.145, 0.145, 0.06, 20), M.copper);
  band.rotation.z = Math.PI/2; band.position.set(0.38, 0.72, 0); g.add(band);
  [-0.05, 0.05].forEach(z => {
    const lead = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.3, 8), M.wire);
    lead.position.set(0.1, 0.6, z); lead.rotation.z = 0.9; g.add(lead);
  });
  add('cap', g, new THREE.Vector3(0,0,0), new THREE.Vector3(1.6,1.0,1.0));
}
// Bearings (fixed inner race; drawn as brass rings)
{
  const top = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.07, 12, 32), M.bearing); top.rotation.x = Math.PI/2;
  add('bearTop', top, new THREE.Vector3(0,0.52,0), new THREE.Vector3(0,1.0,0));
  const bot = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.07, 12, 32), M.bearing); bot.rotation.x = Math.PI/2;
  add('bearBot', bot, new THREE.Vector3(0,-0.52,0), new THREE.Vector3(0,-1.0,0));
}
// Rotor: aluminium bar ring + outer housing (spins)
{
  const g = new THREE.Group();
  const N = 24;
  for (let i=0;i<N;i++){
    const a = i/N*Math.PI*2;
    const bar = box([0.08, 0.7, 0.08], M.alu, [Math.cos(a)*0.95, 0, Math.sin(a)*0.95]);
    bar.rotation.y = -a; g.add(bar);
  }
  const ringT = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.05, 8, 48), M.alu); ringT.rotation.x = Math.PI/2; ringT.position.y = 0.35; g.add(ringT);
  const ringB = ringT.clone(); ringB.position.y = -0.35; g.add(ringB);
  // Die-cast casing: one lathe profile with rounded shoulders, open around the shaft on top.
  g.add(lathe([[0, -0.59], [0.95, -0.59], [1.08, -0.55], [1.14, -0.47], [1.15, -0.38], [1.15, 0.38],
    [1.14, 0.44], [1.1, 0.47], [1.02, 0.48], [0.3, 0.48]], M.housing, { segments: 64 }));
  add('rotor', g, new THREE.Vector3(0,0,0), new THREE.Vector3(0,-2.2,0), spinner);
}
// A pressed blade: narrow at the root, widening outward, round at the tip, with a shallow
// curve across the chord and 6° of twist (steeper near the hub, where the blade moves slower).
function bladeGeometry({ span = 2.7, root = 0.3, chord = 0.44, camber = 0.024, twist = 6 } = {}) {
  const geo = new THREE.PlaneGeometry(1, 1, 36, 6);
  const p = geo.attributes.position, tip = chord / 2;
  for (let i = 0; i < p.count; i++) {
    const u = p.getX(i) + 0.5, v = p.getY(i); // u: 0 at the root to 1 at the tip; v: across the chord
    const x = -span / 2 + u * span, fromTip = span / 2 - x;
    let w = root + (chord - root) * Math.min(1, u / 0.7);
    if (fromTip < tip) w *= Math.sqrt(Math.max(0, 1 - ((tip - fromTip) / tip) ** 2));
    const z = v * w, y = camber * (1 - (2 * v) ** 2) * (w / chord);
    const a = THREE.MathUtils.degToRad(twist) * (0.5 - u);
    p.setXYZ(i, x, y * Math.cos(a) - z * Math.sin(a), y * Math.sin(a) + z * Math.cos(a));
  }
  geo.computeVertexNormals();
  return geo;
}

// Blades (spin)
{
  const g = new THREE.Group();
  const bladeGeo = bladeGeometry(), bolt = new THREE.CylinderGeometry(0.028, 0.028, 0.03, 12);
  for (let i=0;i<3;i++){
    const a = i/3*Math.PI*2;
    const arm = box([0.5, 0.06, 0.16], M.steel, [1.3, 0, 0]);
    const blade = new THREE.Mesh(bladeGeo, M.blade); blade.position.x = 2.85;
    const pivot = new THREE.Group(); pivot.add(arm); pivot.add(blade);
    [-0.045, 0.045].forEach(z => { const b = new THREE.Mesh(bolt, M.steel); b.position.set(1.48, 0.04, z); pivot.add(b); });
    blade.rotation.x = THREE.MathUtils.degToRad(11); // pitch
    pivot.rotation.y = a; pivot.position.y = -0.05; g.add(pivot);
  }
  g.userData.anchor = [2.3, -0.05, 1.1]; g.userData.anchorStatic = true; // a point on the blade disc, not the hub

  add('blades', g, new THREE.Vector3(0,0,0), new THREE.Vector3(0,-3.4,0), spinner);
}

// Airflow particles: down under the blades, out along the floor, up the walls, back in near the ceiling.
const AIR_N = 320, FLOOR = -3.1, CEIL = -0.3, R_IN = 3.0, R_OUT = 6.2;
const air = createParticles(stage.scene, AIR_N, {
  color: 0x5E8DC4, size: 0.07,
  seed: () => ({a: Math.random()*Math.PI*2, u: Math.random(), s: 0.7+Math.random()*0.6, j: Math.random()}),
});
// u runs 0..1 around one loop of the room; returns [radius, y].
const DOWN = CEIL-FLOOR, OUT = R_OUT-R_IN, LOOP = 2*DOWN + 2*OUT;
function airPath(u, j){
  let d = u*LOOP;
  const rIn = j*R_IN;
  if (d < DOWN) return [rIn, CEIL - d];
  d -= DOWN; if (d < OUT) return [rIn + (R_OUT-rIn)*d/OUT, FLOOR + 0.15*j];
  d -= OUT; if (d < DOWN) return [R_OUT - 0.3*j, FLOOR + d];
  d -= DOWN; return [R_OUT - (R_OUT-rIn)*d/OUT, CEIL + 0.4 + 0.2*j];
}

// ---------- State ----------
const state = {step:0, explode:0, targetExplode:0, playing:true, speed:3, angle:0, airOn:false, cut:false, focus:[]};
const story = createStoryUI({
  story: FAN_STORY, state,
  onStep: s => { state.airOn = !!s.air; state.cut = s.cut; state.focus = s.focus; },
});
bindRange('speed', v => { state.speed = v; });
createCallouts(stage, { parts, state, story: FAN_STORY });

// When a step looks inside, unfocused parts fade; in cutaway steps the rotor casing and top cover go glassy.
const focusStyle = {
  highlight: 0.25,
  opacity(name, mesh, hot) {
    let op = 1;
    if (name==='rotor' && state.cut && !hot) op = 0.22;
    if (mesh.userData.cutaway && (state.cut || hot)) op = 0.2;
    if (state.focus.length && !hot && looksInside(state)) op = Math.min(op, 0.35);
    return op;
  },
};

// ---------- Sound ----------
// A 50 Hz induction motor hums at twice the mains frequency; the blades add a soft whoosh
// that pulses three times per turn, once for each blade.
const hum = sound.loop({ type: 'tone', wave: 'triangle', freq: 100 });
const wind = sound.loop({ type: 'noise', filter: 'lowpass', freq: 300, q: 0.7 });

// ---------- Frame ----------
let spin = 0;
startLoop(stage, dt => {
  update(state, focusStyle, reducedMotion ? 1 : 0.08, dt);
  // spin: the casing spins up and coasts down instead of jumping
  const targetSpin = state.playing ? state.speed * 2.2 : 0;
  spin += (targetSpin - spin) * Math.min(1, dt * (reducedMotion ? 60 : 1.5));
  state.angle += dt * spin;
  spinner.rotation.y = state.angle;
  const run = Math.min(1, spin / 11); // 0 at rest, 1 at top speed
  hum.set(0.035 * Math.min(1, spin / 2) * (0.4 + 0.6 * state.speed / 5));
  wind.set(0.22 * run * (0.75 + 0.25 * Math.sin(state.angle * 3)), 250 + 650 * run);
  // air
  const targetOp = state.airOn ? 0.85 * Math.min(1, spin / 4) : 0;
  if (air.fade(targetOp, 0.05)){
    air.seeds.forEach((s, i) => {
      s.u = (s.u + dt * s.s * spin * 0.02) % 1;
      const [r, y] = airPath(s.u, s.j);
      air.place(i, Math.cos(s.a)*r, y, Math.sin(s.a)*r);
    });
    air.commit();
  }
});
story.setStep(0, false);
