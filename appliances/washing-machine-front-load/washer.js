// Pure front-load washer physics and program. No three.js, no DOM: easy to test.
// Units: metres, seconds, litres, rpm (drum turns per minute) and °C.

export const G = 9.81;
const TAU = Math.PI * 2;

export const WASHER = {
  drumR: 0.235,      // inside radius of the drum: 47 cm across
  tubR: 0.27,        // the plastic tub around it
  tubDepth: 0.4,
  ratio: 12,         // drum pulley ÷ motor pulley (288 mm ÷ 24 mm)
  tumbleRpm: 50,
  tumbleMax: 60,     // the program never spins faster while water is in the tub
  distributeRpm: 90, // spreads the clothes flat on the wall before a spin
  spinRpm: 1400,
  washLitres: 12,    // water for the main wash
  washC: 40,         // set temperature
  coldC: 15,         // mains water
  heaterW: 2000,
  heaterMinL: 3,     // the element must be under water
  soaked: 2,         // wet cotton holds about twice its dry weight in water
  // The model runs a wash in seconds, not minutes: these rates are compressed.
  fillRate: 1.6,     // L/s (a real valve lets in about 0.15 L/s)
  drainRate: 3,      // L/s (a real pump: about 0.4 L/s)
  heatRate: 3,       // °C/s
  coolRate: 0.05,    // °C/s
  spinUp: 150,       // rpm/s
  spinDown: 240,     // rpm/s
};

export const omega = rpm => rpm * TAU / 60;

// How hard the drum wall pushes on the clothes, as a multiple of gravity: ω²r / g.
export const gForce = (rpm, r = WASHER.drumR) => omega(rpm) ** 2 * r / G;

// Above this speed the clothes stay flat on the wall all the way round, even at the top.
export const criticalRpm = (r = WASHER.drumR) => Math.sqrt(G / r) * 60 / TAU;

export const motorRpm = drumRpm => drumRpm * WASHER.ratio;

// Time for the element to heat the water: m · c · ΔT / P.
export const heatSeconds = (litres, fromC, toC, watts = WASHER.heaterW) => litres * 4186 * (toC - fromC) / watts;

// Height of the water above the bottom of the tub (a cylinder on its side).
export function levelFromLitres(litres, { r = WASHER.tubR, depth = WASHER.tubDepth } = {}) {
  const area = litres / 1000 / depth;
  const segment = h => r * r * Math.acos((r - h) / r) - (r - h) * Math.sqrt(Math.max(0, 2 * r * h - h * h));
  let lo = 0, hi = 2 * r;
  for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (segment(mid) < area) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}

// Water left in the clothes after a spin, as % of their dry weight. Typical test results:
// the EU label puts a 1,400 rpm machine near 53% and an 800 rpm one near 70%.
const MOISTURE = [[0, 200], [400, 90], [800, 70], [1000, 62], [1200, 56], [1400, 52], [1600, 47]];
export function moistureLeft(rpm) {
  const a = Math.abs(rpm);
  for (let i = 1; i < MOISTURE.length; i++) {
    const [r0, m0] = MOISTURE[i - 1], [r1, m1] = MOISTURE[i];
    if (a <= r1) return m0 + (m1 - m0) * (a - r0) / (r1 - r0);
  }
  return MOISTURE.at(-1)[1];
}

// How far the tub moves when the load is uneven: a spring-mounted mass shaken by a weight
// that turns with the drum. The springs and the tub resonate near 240 rpm; well above
// that, the tub turns about its own centre of mass and moves only by the offset of the load.
export function swayMm(rpm, { unevenKg = 0.6, massKg = 50, resonanceRpm = 240, damping = 0.15 } = {}) {
  const offset = unevenKg * WASHER.drumR * 1000 / massKg;
  const q = Math.abs(rpm) / resonanceRpm;
  return offset * q * q / Math.sqrt((1 - q * q) ** 2 + (2 * damping * q) ** 2);
}

// ---------- Clothes ----------
// One garment, seen from the front. On the wall it turns with the drum. The lifters hold it
// until the wall stops pressing on it (ω²r + g·cos θ = 0), then it flies free and falls until
// it lands on the wall again. θ is measured from the bottom of the drum, in the drum's turn.
// grip < 1 lets a garment slip off its lifter a little early.
export function releaseAngle(rpm, { r = WASHER.drumR, grip = 1 } = {}) {
  const c = (1 - grip) - gForce(rpm, r);
  return c <= -1 ? Infinity : Math.acos(Math.min(1, c));
}

export function createGarment({ r = 0.22, angle = 0, grip = 1 } = {}) {
  return { r, angle, grip, flying: false, x: r * Math.sin(angle), y: -r * Math.cos(angle), vx: 0, vy: 0, air: 0 };
}

// Advance one garment by dt. w is the drum's angular speed (rad/s). shown is the speed the
// model draws the drum at (slower than a real spin), so garments on the wall keep up with it.
// Returns 'launched' or 'landed' on those frames.
export function stepGarment(g, dt, w, shown = w) {
  if (!g.flying) {
    const press = w * w * g.r + G * Math.cos(g.angle);
    if (w !== 0 && press <= G * (1 - g.grip) && Math.abs(g.angle) > 0.5) {
      g.flying = true; g.air = 0;
      g.vx = g.r * w * Math.cos(g.angle); g.vy = g.r * w * Math.sin(g.angle);
      return 'launched';
    }
    // A slow drum cannot hold the clothes up: they slump back to the bottom.
    const hold = Math.min(1, Math.abs(shown) / 2);
    g.angle += shown * dt - (1 - hold) * 2.5 * Math.sin(g.angle) * dt;
    g.angle = Math.atan2(Math.sin(g.angle), Math.cos(g.angle));
    g.x = g.r * Math.sin(g.angle); g.y = -g.r * Math.cos(g.angle);
    return null;
  }
  g.air += dt;
  g.vy -= G * dt;
  g.x += g.vx * dt; g.y += g.vy * dt;
  const out = g.x * g.vx + g.y * g.vy > 0;
  if ((g.x * g.x + g.y * g.y >= g.r * g.r && out) || g.air > 2) {
    g.flying = false;
    g.angle = Math.atan2(g.x, -g.y);
    g.x = g.r * Math.sin(g.angle); g.y = -g.r * Math.cos(g.angle);
    return 'landed';
  }
  return null;
}

// ---------- Program ----------
// Each story mode drives the machine: a drum speed over time, a water level and the heater.
// t is seconds since the step began; top is the spin speed the reader picked.
const ease = t => t * t * (3 - 2 * t);
const tumble = t => { const c = t % 10; return c < 4 ? 1 : c < 5 ? 0 : c < 9 ? -1 : 0; }; // 4 s one way, a pause, 4 s back

// The door: unlock, open, close, lock, then the drum starts.
function doorCycle(t) {
  const c = t % 8;
  const open = c < 1.5 ? 0 : c < 3 ? ease((c - 1.5) / 1.5) : c < 4.5 ? 1 : c < 6 ? 1 - ease((c - 4.5) / 1.5) : 0;
  return { open, lock: c < 1 || c >= 6.5, rpm: c >= 6.8 ? 30 : 0 };
}

export const SHAKE_COAST = 15;
export const MODES = {
  idle: { water: 0, run: () => ({ rpm: 30 }) },
  door: { water: 0, run: doorCycle },
  fill: { water: WASHER.washLitres, run: t => ({ rpm: 40 * tumble(t) }) },
  heat: { water: WASHER.washLitres, heat: true, run: t => ({ rpm: 40 * tumble(t) }) },
  wash: { water: WASHER.washLitres, run: t => ({ rpm: WASHER.tumbleRpm * tumble(t) }) },
  spin: { water: 0, pump: true, run: (t, top) => ({ rpm: t < 4 ? 40 * tumble(t) : t < 7 ? WASHER.distributeRpm : top }) },
  // Spread the load, spin up through the resonance, hold, then coast down through it again.
  // A shake step that starts while a spin is running begins at the coast (t = SHAKE_COAST).
  shake: { water: 0, pump: true, run: (t, top) => { const c = t % 21; return { rpm: c < 2.5 ? WASHER.distributeRpm : c < SHAKE_COAST ? top : 0 }; } },
};

export function createSim(start = {}) {
  return {
    t: 0, rpm: 0, water: 0, temp: WASHER.coldC, wet: 0, powder: 1, extract: 0,
    door: 0, locked: true, valve: false, pump: false, heater: false, ...start,
  };
}

// Advance the machine by dt seconds in one mode.
export function stepWasher(sim, dt, mode, { top = WASHER.spinRpm, cfg = WASHER } = {}) {
  const m = MODES[mode] ?? MODES.idle;
  sim.t += dt;
  const want = m.run(sim.t, top);

  // The lock holds the door shut while the drum turns or water is in the tub.
  const busy = Math.abs(sim.rpm) > 1 || sim.water > 0.5;
  sim.locked = busy || ((want.lock ?? true) && sim.door < 0.01);
  if (!sim.locked) sim.door = want.open ?? 0;

  // Water: the valve fills the tub up to the mode's level; the pump empties it.
  sim.valve = sim.locked && sim.water < m.water - 0.05;
  sim.pump = !!m.pump || sim.water > m.water + 0.05;
  if (sim.valve) {
    const add = Math.min(cfg.fillRate * dt, m.water - sim.water);
    sim.temp = (sim.temp * sim.water + cfg.coldC * add) / (sim.water + add);
    sim.water += add;
    sim.powder = Math.max(0, sim.powder - cfg.fillRate * dt / 8);
  }
  if (sim.pump && sim.water > m.water) sim.water = Math.max(m.water, sim.water - cfg.drainRate * dt);
  if (sim.water > 2) sim.wet = Math.min(cfg.soaked, sim.wet + 0.4 * dt);

  // The heater only runs under water, and switches off at the set temperature.
  sim.heater = !!m.heat && sim.water >= cfg.heaterMinL && sim.temp < cfg.washC - (sim.heater ? 0 : 1);
  sim.temp = sim.heater ? Math.min(cfg.washC, sim.temp + cfg.heatRate * dt) : Math.max(cfg.coldC, sim.temp - cfg.coolRate * dt);

  // Drum: only behind a locked door, and no faster than a tumble while there is water to drain.
  let target = sim.locked && sim.door < 0.01 ? want.rpm ?? 0 : 0;
  if (sim.water > 1) target = Math.max(-cfg.tumbleMax, Math.min(cfg.tumbleMax, target));
  const rate = Math.abs(target) > Math.abs(sim.rpm) ? cfg.spinUp : cfg.spinDown;
  sim.rpm += Math.max(-rate * dt, Math.min(rate * dt, target - sim.rpm));

  // Spin: the faster the drum, the more water leaves the clothes.
  const before = sim.wet, goal = moistureLeft(sim.rpm) / 100;
  if (sim.water < 1 && goal < sim.wet) sim.wet += (goal - sim.wet) * (1 - Math.exp(-dt * 0.3));
  sim.extract = dt > 0 ? (before - sim.wet) / dt : 0;
  return sim;
}
