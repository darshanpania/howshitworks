import * as THREE from 'three';
import { createStage, addFloor } from '../../src/engine/stage.js';
import { createParts } from '../../src/engine/parts.js';
import { createStoryUI, bindRange } from '../../src/engine/story-ui.js';
import { startLoop, reducedMotion as reduced } from '../../src/engine/loop.js';
import { box, cylinder, lathe } from '../../src/kit/shapes.js';
import { createMaterials } from '../../src/kit/materials.js';
import { softDot, createParticles } from '../../src/kit/effects.js';
import { COOKER_STORY } from './story.js';
import { COOKER, createSim, stepCooker, boilingPointC } from './physics.js';

// ---------- Stage and light ----------
const stage = createStage(document.querySelector('#c'), {
  fov: 36, pbr: true, camera: { theta: 0.55, phi: 1.1, r: 10, target: [0.4, -0.45, 0] }, zoom: [5, 15], phiLimit: 0.25,
});
const { scene } = stage;
scene.add(new THREE.HemisphereLight(0xffffff, 0x27313a, 0.45));
const key = new THREE.DirectionalLight(0xfff3df, 1.5); key.position.set(4, 8, 5);
key.castShadow = true; key.shadow.mapSize.set(1024, 1024); key.shadow.radius = 4; key.shadow.bias = -0.0005;
Object.assign(key.shadow.camera, { left: -5, right: 5, top: 5, bottom: -5, near: 1, far: 25 });
scene.add(key);
const rim = new THREE.DirectionalLight(0x8db4e5, 0.6); rim.position.set(-5, 3, -4); scene.add(rim);
const FLOOR_Y = -2.3;
addFloor(stage, FLOOR_Y, { size: 13, opacity: 0.16 });

// ---------- Materials ----------
const M = createMaterials({
  alu: { look: 'aluminium', color: 0xdfe3e8, roughness: 0.28, side: THREE.DoubleSide },
  steel: 'steel', plastic: 'plastic', iron: 'iron', rubber: 'rubber',
  water: { color: 0x4f8fd0, metalness: 0, roughness: 0.1 },
  chana: { color: 0xc8923f, roughness: 0.7 },
  plug: { color: 0xb8341f, metalness: 0.4, roughness: 0.4 },
}, { pbr: true });
const flameMat = new THREE.MeshBasicMaterial({ color: 0x3d7dff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });

// ---------- Parts ----------
// Scale: 1 unit ≈ 10 cm. The pot is 24 cm across and 17 cm deep.
const POT = { r: 1.2, bottom: -1.5, top: 0.2 };
const WATER_TOP = -0.45;
const root = new THREE.Group(); scene.add(root);
const { parts, add, update } = createParts(root, { shadows: true });

// Gas burner with a ring of flames.
const flames = new THREE.Group();
{
  const burner = new THREE.Group();
  burner.add(cylinder(0.55, 0.62, 0.22, M.iron, [0, -1.82, 0]));
  burner.add(cylinder(0.32, 0.32, 0.08, M.steel, [0, -1.68, 0]));
  for (let i = 0; i < 4; i++) { // pan support
    const arm = box([1.5, 0.06, 0.08], M.iron, [0, -1.56, 0]); arm.rotation.y = i * Math.PI / 4; burner.add(arm);
  }
  burner.add(cylinder(1.3, 1.4, 0.18, M.plastic, [0, -2.2, 0])); // stove top
  for (let i = 0; i < 18; i++) {
    const a = i / 18 * Math.PI * 2;
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.22, 8), flameMat);
    flame.position.set(Math.cos(a) * 0.4, -1.55, Math.sin(a) * 0.4); flame.rotation.z = Math.cos(a) * 0.35; flame.rotation.x = -Math.sin(a) * 0.35;
    flame.userData.flame = true; flame.userData.noShadow = true; flames.add(flame);
  }
  burner.add(flames);
  add('burner', burner, new THREE.Vector3(), new THREE.Vector3(0, -1.0, 0));
}

// Aluminium pot with a long handle.
{
  const pot = new THREE.Group();
  pot.add(lathe([[0, POT.bottom], [1.05, POT.bottom], [1.17, POT.bottom + 0.06], [POT.r, POT.bottom + 0.2], [POT.r, POT.top - 0.08], [1.27, POT.top], [1.3, POT.top]], M.alu));
  pot.add(box([2.2, 0.2, 0.34], M.plastic, [POT.r + 1.1, POT.top - 0.2, 0], 0.08));
  pot.add(box([0.35, 0.16, 0.2], M.steel, [POT.r + 0.1, POT.top - 0.2, 0]));
  add('pot', pot, new THREE.Vector3(), new THREE.Vector3(0, 0, 0));
}

// Water and soaked chickpeas inside the pot.
{
  const water = new THREE.Group();
  const body = cylinder(POT.r - 0.05, POT.r - 0.05, WATER_TOP - POT.bottom - 0.03, M.water, [0, (WATER_TOP + POT.bottom) / 2, 0], { segments: 48 });
  body.userData.water = true; water.add(body);
  add('water', water, new THREE.Vector3(), new THREE.Vector3(0, 0, 0));
  const food = new THREE.Group(), pea = new THREE.SphereGeometry(0.075, 12, 8);
  for (let i = 0; i < 70; i++) {
    const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * (POT.r - 0.2);
    const mesh = new THREE.Mesh(pea, M.chana);
    mesh.position.set(Math.cos(a) * r, POT.bottom + 0.1 + Math.random() * 0.35, Math.sin(a) * r); food.add(mesh);
  }
  add('food', food, new THREE.Vector3(), new THREE.Vector3(0, 0, 0));
}

// Lid, gasket, vent pipe, whistle weight and safety valve.
{
  const lid = new THREE.Group();
  lid.add(lathe([[1.32, POT.top + 0.02], [1.3, POT.top + 0.08], [1.0, POT.top + 0.18], [0.5, POT.top + 0.25], [0, POT.top + 0.27]], M.alu));
  lid.add(box([1.5, 0.16, 0.3], M.plastic, [POT.r + 0.7, POT.top + 0.1, 0], 0.07)); // lid handle lines up with the pot handle
  add('lid', lid, new THREE.Vector3(), new THREE.Vector3(0, 1.7, 0));

  const gasket = new THREE.Mesh(new THREE.TorusGeometry(POT.r + 0.04, 0.045, 10, 64), M.rubber);
  gasket.rotation.x = Math.PI / 2;
  add('gasket', gasket, new THREE.Vector3(0, POT.top + 0.03, 0), new THREE.Vector3(0, 0.9, 0));

  const vent = cylinder(0.06, 0.07, 0.34, M.steel, [0, 0, 0], { segments: 16 });
  add('vent', vent, new THREE.Vector3(0, POT.top + 0.42, 0), new THREE.Vector3(0, 2.3, 0));

  const weight = new THREE.Group();
  weight.add(cylinder(0.17, 0.19, 0.2, M.steel, [0, 0.1, 0]));
  weight.add(cylinder(0.06, 0.15, 0.12, M.steel, [0, 0.26, 0]));
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.07, 16, 12), M.plastic); knob.position.y = 0.36; weight.add(knob);
  add('weight', weight, new THREE.Vector3(0, POT.top + 0.52, 0), new THREE.Vector3(0, 3.0, 0));

  const safety = new THREE.Group();
  safety.add(cylinder(0.1, 0.11, 0.1, M.steel, [0, 0, 0], { segments: 20 }));
  safety.add(cylinder(0.065, 0.065, 0.06, M.plug, [0, 0.08, 0], { segments: 20 }));
  add('safety', safety, new THREE.Vector3(-0.6, POT.top + 0.24, 0.35), new THREE.Vector3(-0.8, 2.0, 0.6));
}

// Bubbles in the water, steam inside the pot, and jets from the vent and the safety valve.
const dot = softDot();
const bubbles = createParticles(scene, 80, {
  color: 0xeaf4ff, size: 0.1, map: dot,
  seed: () => ({ a: Math.random() * Math.PI * 2, r: Math.sqrt(Math.random()) * (POT.r - 0.15), t: Math.random(), s: 0.6 + Math.random() * 0.8 }),
});
const steam = createParticles(scene, 110, {
  color: 0x9fb2c6, // grey-blue so it shows on a light page size: 0.2, map: dot,
  seed: () => ({ a: Math.random() * Math.PI * 2, r: Math.random() * (POT.r - 0.1), y: Math.random(), s: 0.3 + Math.random() * 0.5 }),
});
const jet = createParticles(scene, 90, { color: 0xffffff, size: 0.26, map: dot, seed: () => ({ t: Math.random(), a: Math.random() * Math.PI * 2, s: 0.6 + Math.random() * 0.8 }) });
const safetyJet = createParticles(scene, 60, { color: 0xffffff, size: 0.24, map: dot, seed: () => ({ t: Math.random(), a: Math.random() * Math.PI * 2, s: 0.6 + Math.random() * 0.8 }) });

// ---------- State and UI ----------
const state = { step: 0, explode: 0, targetExplode: 0, playing: true, focus: [], cut: false, mode: {}, flameLevel: 3, flame: 0, lift: 0 };
const sim = createSim();
const story = createStoryUI({
  story: COOKER_STORY, state,
  onStep: (s, index) => {
    // Going forward keeps the cooker's current heat; jumping back restarts the step from its own start.
    const back = index < (state.lastStep ?? -1); state.lastStep = index;
    sim.T = back ? s.startT : Math.max(sim.T, s.startT);
    sim.safetyOpen = false; sim.lifted = false; if (index <= 2) sim.whistles = 0;
    state.focus = s.focus; state.cut = s.cut; state.cooling = !!s.cooling;
    state.mode = { heat: s.heat, sealed: s.sealed, blocked: !!s.blocked };
  },
});
bindRange('flame', v => { state.flameLevel = v; });
const cfg = { ...COOKER };

const INSIDE = ['pot', 'lid'];
const focusStyle = {
  highlight: 0.15,
  opacity(name, mesh, hot) {
    let alpha = 1;
    if (state.cut && INSIDE.includes(name)) alpha = hot ? 0.35 : 0.18; // cut away to show the inside
    if (state.focus.length && !hot && !INSIDE.includes(name)) alpha = Math.min(alpha, 0.3);
    if (mesh.userData.water) alpha *= 0.55;
    if (mesh.userData.flame) alpha *= state.flame;
    return alpha;
  },
};

const readout = { box: document.getElementById('readout'), p: document.getElementById('r-pressure'), t: document.getElementById('r-temp'), w: document.getElementById('r-whistles') };
let readoutTimer = 0;
function showReadout() {
  const lidFree = state.cooling && sim.p < 0.02;
  readout.p.textContent = `+${sim.p.toFixed(2)} bar`;
  readout.t.textContent = `${sim.T.toFixed(0)}°C${sim.p > 0.02 ? ` (boils at ${boilingPointC(sim.p).toFixed(0)}°C)` : ''}`;
  readout.w.textContent = lidFree ? `${sim.whistles} · safe to open` : String(sim.whistles);
  readout.box.classList.toggle('hot', sim.p > 0.5);
}

// ---------- Frame ----------
startLoop(stage, (dt, now) => {
  update(state, focusStyle, reduced ? 1 : 0.09);

  // Simulation: the flame slider scales how fast heat goes in.
  cfg.heatRate = COOKER.heatRate * state.flameLevel / 3;
  if (state.playing) stepCooker(sim, dt, state.mode, cfg);

  // Flames grow and shrink with the burner.
  const flameTarget = state.mode.heat ? 0.55 + state.flameLevel * 0.09 : 0;
  state.flame += (flameTarget - state.flame) * Math.min(1, dt * (reduced ? 60 : 4));
  flames.children.forEach((f, i) => { f.scale.y = 0.4 + state.flame * (1 + Math.sin(now / 90 + i * 1.7) * 0.15); });

  // The weight rattles up while steam escapes.
  const liftTarget = sim.lifted ? 0.07 + (reduced ? 0 : Math.sin(now / 25) * 0.015) : 0;
  state.lift += (liftTarget - state.lift) * Math.min(1, dt * 20);
  parts.weight.group.position.y += state.lift;

  const playing = state.playing ? 1 : 0;
  // Bubbles when the water is at its boiling point.
  const boiling = state.mode.heat && sim.T >= boilingPointC(sim.p) - 0.5;
  if (bubbles.fade(boiling && state.cut ? 0.8 : 0, Math.min(1, dt * 3))) {
    bubbles.seeds.forEach((b, i) => {
      b.t = (b.t + dt * b.s * 0.6 * playing) % 1;
      bubbles.place(i, Math.cos(b.a) * b.r + Math.sin(b.t * 9 + i) * 0.03, POT.bottom + 0.1 + b.t * (WATER_TOP - POT.bottom - 0.1), Math.sin(b.a) * b.r);
    });
    bubbles.commit();
  }
  // Steam fills the space above the water; thicker as the pressure rises.
  const steamLevel = state.cut && sim.T >= 99 ? 0.25 + Math.min(0.45, sim.p * 0.4) : 0;
  if (steam.fade(steamLevel, Math.min(1, dt * 2))) {
    steam.seeds.forEach((s, i) => {
      s.a += dt * s.s * 0.6 * playing;
      const y = WATER_TOP + 0.05 + s.y * (POT.top + 0.15 - WATER_TOP) + Math.sin(now / 700 + i) * 0.04;
      steam.place(i, Math.cos(s.a) * s.r, y, Math.sin(s.a) * s.r);
    });
    steam.commit();
  }
  // Jets: a plume from the vent while the weight is up, and from the safety valve once it opens.
  const ventTop = parts.weight.group.position.y + 0.3;
  if (jet.fade(sim.lifted && !reduced ? 0.6 : 0, Math.min(1, dt * 6))) {
    jet.seeds.forEach((j, i) => {
      j.t = (j.t + dt * j.s * 1.6 * playing) % 1;
      const spread = j.t * 0.35;
      jet.place(i, Math.cos(j.a) * spread, ventTop + j.t * 2.4, Math.sin(j.a) * spread);
    });
    jet.commit();
  }
  const sp = parts.safety.group.position;
  if (safetyJet.fade(sim.safetyOpen && !reduced ? 0.6 : 0, Math.min(1, dt * 6))) {
    safetyJet.seeds.forEach((j, i) => {
      j.t = (j.t + dt * j.s * 1.6 * playing) % 1;
      const spread = j.t * 0.3;
      safetyJet.place(i, sp.x - j.t * 0.6 + Math.cos(j.a) * spread, sp.y + 0.1 + j.t * 1.8, sp.z + Math.sin(j.a) * spread);
    });
    safetyJet.commit();
  }

  readoutTimer -= dt;
  if (readoutTimer <= 0) { showReadout(); readoutTimer = 0.15; }
});
story.setStep(0, false);
