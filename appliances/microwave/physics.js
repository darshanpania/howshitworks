// Pure microwave-oven numbers. No three.js, no DOM: easy to test.

export const C = 299792458; // m/s, speed of light
const WATER_HEAT = 4186;    // J per kg per °C

export const OVEN = {
  freqHz: 2.45e9,    // the ISM band every home oven uses
  outputW: 800,      // microwave power into the cavity
  inputW: 1250,      // power taken from the wall
  absorbed: 0.8,     // share of the output a mug of water takes up
  massKg: 0.25,      // a 250 ml mug of water
  startC: 20,
  timerS: 120,       // 2:00 on the display
  cycleS: 20,        // at a lower power level the magnetron is on for level/10 of each cycle
  meshMm: 1,         // hole size in the door screen
  turntableRpm: 5,
  speed: 8,          // oven seconds per real second on the page
};

// One wavelength: 12.2 cm at 2.45 GHz.
export const wavelengthM = (freqHz = OVEN.freqHz) => C / freqHz;

// A standing wave has its strongest points every half wavelength: about 6 cm.
export const hotSpotSpacingM = (freqHz = OVEN.freqHz) => wavelengthM(freqHz) / 2;

// The field points one way, then the other, twice per cycle.
export const fieldFlipsPerSecond = (freqHz = OVEN.freqHz) => 2 * freqHz;

// °C per second for water that takes up `absorbed` of the oven's output.
export function heatRateCPerS({ outputW, absorbed, massKg } = OVEN) {
  return outputW * absorbed / (massKg * WATER_HEAT);
}

// Power level 1..10. The magnetron has no dimmer: a lower level switches it on and off.
export function magnetronOn(t, level, cycleS = OVEN.cycleS) {
  if (level >= 10) return true;
  if (level <= 0) return false;
  return ((t % cycleS) + cycleS) % cycleS < cycleS * level / 10;
}

export function createSim(start = {}) {
  return { t: 0, left: OVEN.timerS, T: OVEN.startC, on: false, done: false, ...start };
}

// Advance the oven by dt seconds of oven time. The timer only runs with the door shut.
export function stepOven(sim, dt, { level = 10, doorOpen = false } = {}, cfg = OVEN) {
  if (doorOpen || sim.left <= 0) { sim.on = false; sim.done = sim.left <= 0; return sim; }
  const run = Math.min(dt, sim.left);
  sim.t += run; sim.left -= run;
  sim.on = magnetronOn(sim.t, level, cfg.cycleS);
  if (sim.on) sim.T = Math.min(100, sim.T + heatRateCPerS(cfg) * run); // it boils at 100 °C
  sim.done = sim.left <= 1e-9;
  if (sim.done) { sim.left = 0; sim.on = false; }
  return sim;
}

// "1:45" for the display.
export function clock(seconds) {
  const s = Math.ceil(Math.max(0, seconds) - 1e-9);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// A ray that starts at `from`, runs along `dir` and reflects off the walls of an
// axis-aligned box like light in a room of mirrors. Returns the corner points, `length` long in total.
export function bouncePath(from, dir, { min, max }, length) {
  const p = [...from], points = [[...from]];
  const n = Math.hypot(...dir), d = dir.map(c => c / n);
  let left = length;
  for (let guard = 0; left > 1e-9 && guard < 64; guard++) {
    // Distance to the first wall along each axis.
    let step = left, hit = -1;
    for (let a = 0; a < 3; a++) {
      if (Math.abs(d[a]) < 1e-12) continue;
      const wall = d[a] > 0 ? max[a] : min[a];
      const s = (wall - p[a]) / d[a];
      if (s >= 0 && s < step) { step = s; hit = a; }
    }
    for (let a = 0; a < 3; a++) p[a] += d[a] * step;
    if (hit >= 0) { p[hit] = d[hit] > 0 ? max[hit] : min[hit]; d[hit] = -d[hit]; }
    points.push([...p]);
    left -= step;
  }
  return points;
}

// Total length of a polyline.
export function pathLength(points) {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += Math.hypot(...points[i].map((c, a) => c - points[i - 1][a]));
  return total;
}
