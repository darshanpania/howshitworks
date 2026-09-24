// Pure geometry for a 5-pin tumbler cylinder. Units are millimetres; angles are radians.
// Sizes follow a common SC1-style key: 12.7 mm plug, first cut 5.87 mm from the
// shoulder, cuts 3.96 mm apart, and 10 depths 0.381 mm apart.
export const LOCK = {
  R: 6.35,            // plug radius: the shear line
  first: 5.87,        // shoulder to the first pin
  pitch: 3.96,        // pin to pin
  step: 0.381,        // one depth step
  uncut: 3.0,         // top of an uncut blade
  tip: 26,            // shoulder to key tip
  flat: 0.4,          // half the flat at the bottom of a cut
  slope: 0.84,        // cut sides at 100° included
  rest: -1.2,         // key pin bottom with no key in the plug
  driver: 4.2,        // top pin length
  chamberTop: 18.85,  // spring seat in the housing
  throw: 25,          // deadbolt throw
  lever: 25 / (2 * Math.sin(Math.PI / 4)), // lever that gives the throw over a 90° turn
};
export const RIGHT = [3, 6, 2, 8, 4];
export const WRONG = [3, 6, 5, 8, 4]; // one cut too deep
export const PIN_X = RIGHT.map((_, i) => LOCK.first + i * LOCK.pitch);

const cutY = d => LOCK.uncut - d * LOCK.step;
// Key pin lengths fit the right key: each pin top meets the shear line on its cut.
export const KEY_PIN = RIGHT.map(d => LOCK.R - cutY(d));

// Height of the key's top edge at distance x from the shoulder. -Infinity where there is no blade.
export function keyTop(x, bitting) {
  if (x < 0 || x > LOCK.tip) return -Infinity;
  const taperStart = LOCK.tip - 4;
  let y = x > taperStart ? LOCK.uncut - (x - taperStart) * (LOCK.uncut - LOCK.rest + 0.8) / 4 : LOCK.uncut;
  bitting.forEach((d, i) => { y = Math.min(y, cutY(d) + Math.max(0, Math.abs(x - PIN_X[i]) - LOCK.flat) * LOCK.slope); });
  return y;
}

// Pin stack i with the key shoulder at `shift` (0 = fully in, negative = out of the plug).
export function stack(i, shift, bitting) {
  const bottom = Math.max(LOCK.rest, keyTop(PIN_X[i] - shift, bitting));
  const gap = bottom + KEY_PIN[i]; // where the key pin meets the driver pin
  return { bottom, gap, driverTop: gap + LOCK.driver, atShear: Math.abs(gap - LOCK.R) < 0.05 };
}
export function stacks(shift, bitting) { return PIN_X.map((_, i) => stack(i, shift, bitting)); }

// Deadbolt travel for a plug turn of `turn` (0..90°): a lever pin in a slot on the bolt.
export function boltOut(turn) {
  const a = Math.min(Math.max(turn, 0), Math.PI / 2) - Math.PI / 4;
  return LOCK.lever * (Math.sin(a) + Math.sin(Math.PI / 4));
}

const clamp01 = v => Math.max(0, Math.min(1, v));
const smooth = v => { v = clamp01(v); return v * v * (3 - 2 * v); };
const DEG = Math.PI / 180;
export const OUT = -45; // key shoulder when the key waits outside
export const PERIOD = { rest: 4, insert: 7.5, wrong: 7.5, turn: 5.5 };

// One pose at time t in a mode: key shift, which key, plug turn.
//   rest   – no key; the pins sit across the shear line
//   insert – the right key slides in, waits, and comes out
//   wrong  – a key with one wrong cut goes in; the plug only rattles
//   turn   – the right key is in; the plug turns 90° and throws the bolt
export function pose(mode, t) {
  const p = { shift: OUT, key: mode === 'wrong' ? WRONG : RIGHT, turn: 0 };
  if (mode === 'insert' || mode === 'wrong') {
    p.shift = OUT * (1 - smooth(t / 2.5)) + OUT * smooth((t - 4.8) / 2);
  }
  if (mode === 'wrong' && t > 2.7 && t < 4.5) p.turn = 2 * DEG * Math.sin((t - 2.7) * Math.PI * 4);
  if (mode === 'turn') {
    p.shift = 0;
    p.turn = Math.PI / 2 * (smooth((t - 0.5) / 1.2) - smooth((t - 3.2) / 1.2));
  }
  p.bolt = boltOut(p.turn);
  return p;
}
