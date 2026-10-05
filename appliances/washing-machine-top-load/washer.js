// Pure top-load washer numbers and wash cycle. No three.js, no DOM: easy to test.
// Units are SI (metres, seconds) unless a name says otherwise.

export const G = 9.81;

export const WASHER = {
  tubR: 0.26,        // inside radius of the plastic outer tub
  basketR: 0.245,    // the steel basket is about 49 cm across
  maxKg: 7,          // rated dry load
  motorRpm: 1400,    // 4-pole induction motor on 50 Hz mains
  belt: 2,           // clutch pulley diameter ÷ motor pulley diameter
  gear: 5,           // planetary reduction in the clutch, used in wash mode only
  stroke: 1.1,       // s the pulsator turns each way
  pause: 0.45,       // s it rests before it turns back
  ramp: 0.15,        // s to reach full stroke speed
  fillRate: 0.05,    // m of water level per second (time is compressed: a real fill takes minutes)
  drainRate: 0.1,    // m per second, also compressed
  spinUp: 180,       // rpm per second, also compressed
  dryRate: 0.45,     // share of the water in the clothes thrown out per second at full spin
};

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Basket speed in spin: the motor through the belt only.
export const spinRpm = (w = WASHER) => w.motorRpm / w.belt;
// Pulsator speed in wash: the gear set slows it again, with that much more torque.
export const washRpm = (w = WASHER) => spinRpm(w) / w.gear;

// The water level the machine picks for a load: 11 cm for 1 kg, up to 29 cm for 7 kg.
export const levelFor = (kg, w = WASHER) => 0.08 + 0.03 * clamp(kg, 1, w.maxKg);
// Litres in the tub at a level: the tub is a cylinder.
export const litres = (level, w = WASHER) => Math.PI * w.tubR ** 2 * level * 1000;
// Pressure the water column puts on the air trapped in the sensor hose: p = ρ·g·h.
export const sensorKPa = level => 1000 * G * level / 1000;
// How many times its own weight the basket wall pushes on the clothes: ω²·r / g.
export const gForce = (rpm, r = WASHER.basketR) => (rpm * 2 * Math.PI / 60) ** 2 * r / G;

// Pulsator speed in rpm, signed, t seconds into the wash: one way, rest, back, rest.
export function strokeRpm(t, w = WASHER) {
  const period = 2 * (w.stroke + w.pause);
  let tau = ((t % period) + period) % period, sign = 1;
  if (tau >= w.stroke + w.pause) { tau -= w.stroke + w.pause; sign = -1; }
  if (tau >= w.stroke) return 0;
  return sign * washRpm(w) * clamp(Math.min(tau, w.stroke - tau) / w.ramp, 0, 1);
}

// level: water level (m). pulsator, basket: rpm (signed for the pulsator).
// wet: share of the wash water still in the clothes (1 after a wash, near 0 after a spin).
// balance: 0 when the balance ring's liquid sits evenly, 1 when it fully offsets the lump.
export function createCycle(start = {}) {
  return { washT: 0, level: 0, valve: false, drain: false, spin: false, pulsator: 0, basket: 0, wet: 1, balance: 0, ...start };
}

// Advance the cycle by dt seconds. mode: 'fill' | 'hold' | 'wash' | 'spin' | 'balance'.
// target is the level for the load (levelFor).
export function stepCycle(c, dt, mode, target, w = WASHER) {
  const spinning = mode === 'spin' || mode === 'balance';
  // One pull of the drain motor opens the drain valve and moves the clutch to spin.
  c.drain = spinning; c.spin = spinning;
  if (spinning) {
    c.valve = false;
    c.level = Math.max(0, c.level - w.drainRate * dt);
    const goal = c.level > 0.01 ? 0 : spinRpm(w); // drain first, then spin up
    c.basket = clamp(c.basket + clamp(goal - c.basket, -2 * w.spinUp * dt, w.spinUp * dt), 0, spinRpm(w));
    c.pulsator = c.basket; // locked to the basket
    const run = c.basket / spinRpm(w);
    c.wet = Math.max(0, c.wet * (1 - w.dryRate * run * run * dt));
    if (mode === 'balance') c.balance = Math.min(1, c.balance + dt * 0.35 * run);
    return c;
  }
  // The brake band stops the basket; the clutch is back in wash mode.
  c.basket = Math.max(0, c.basket - 2 * w.spinUp * dt);
  c.balance = 0;
  // The sensor keeps the valve open until the level is reached.
  c.valve = c.level < target - 1e-4;
  if (c.valve) c.level = Math.min(target, c.level + w.fillRate * dt);
  else c.level = Math.max(target, c.level - w.drainRate * dt);
  const washing = mode === 'wash' && !c.valve && c.basket === 0;
  if (washing) c.washT += dt;
  c.pulsator = washing ? strokeRpm(c.washT, w) : 0;
  c.wet = 1;
  return c;
}
