// Pure electronics of a tube guitar combo: the guitar's note, two 12AX7 gain stages with a
// Bassman tone stack between them, a push-pull pair of 6L6 power tubes, the output transformer
// and the speaker, and the supply that powers it all. No three.js, no DOM: easy to test.
// Units: volts, ohms, farads, amps, hertz, seconds.
export const AMP = {
  mains: 230, hz: 50,
  hv: 335,            // V RMS on each half of the transformer's high-voltage winding
  rectDrop: 20,       // V lost in the GZ34 rectifier tube
  filter: 100e-6,     // F, the first filter capacitor
  idleA: 0.1,         // A the whole amp draws from the supply at idle
  heater: 6.3,        // V AC for every tube heater
  pickup: 0.3,        // V peak from a strum, at the input jack
  inputOhms: 1e6,
  note: 110,          // Hz, the open A string
  strumS: 2.4,        // a new strum this often
  // A 12AX7 triode, each half. The plate resistor feeds it from a 250 V rail.
  pre: { mu: 100, ra: 62.5e3, rp: 100e3, rk: 1.5e3, supply: 250, plate: 160, floor: 60, idleA: 0.9e-3 },
  // Two 6L6GC tubes in push-pull, each idling at 40 mA, into a 4.2 kΩ plate-to-plate load.
  power: { idleA: 0.04, turns: 23, speaker: 8, ratedW: 30, drive: 60 },
};

// Bassman 5F6-A tone stack: treble pot r1, bass pot r2, mid pot r3, slope resistor r4.
// The 1 MΩ gain pot after it is its load.
export const TONE = { c1: 250e-12, c2: 20e-9, c3: 20e-9, r1: 250e3, r2: 1e6, r3: 25e3, r4: 56e3, load: 1e6 };
// Knob settings, 0 to 10 like the panel.
export const KNOBS = { treble: 7, middle: 4, bass: 6, gain: 5 };

// ---------- Power supply ----------
// The transformer steps 230 V up; the rectifier turns both halves of each cycle the same way,
// and the capacitor fills to the peak 100 times a second and sags in between as the amp draws on it.
export const hvPeak = (cfg = AMP) => cfg.hv * Math.SQRT2;
export const bPlusPeak = (cfg = AMP) => hvPeak(cfg) - cfg.rectDrop;
export const ripple = (amps = AMP.idleA, cfg = AMP) => amps / (2 * cfg.hz * cfg.filter);
export function bPlus(t, amps = AMP.idleA, cfg = AMP) {
  const peak = bPlusPeak(cfg), since = (((t * 2 * cfg.hz - 0.5) % 1) + 1) % 1;
  return Math.max(peak - ripple(amps, cfg) * since, peak * Math.abs(Math.sin(2 * Math.PI * cfg.hz * t)));
}
export const bPlusAverage = (amps = AMP.idleA, cfg = AMP) => bPlusPeak(cfg) - ripple(amps, cfg) / 2;
// Heater power: three 12AX7s at 0.3 A and two 6L6s at 0.9 A, all on 6.3 V.
export const heaterWatts = (cfg = AMP) => cfg.heater * (3 * 0.3 + 2 * 0.9);

// ---------- Preamp ----------
// A triode with a bypassed cathode resistor: the gain is mu × Rp / (Rp + ra).
export const stageGain = (p = AMP.pre) => p.mu * p.rp / (p.rp + p.ra);
// Transconductance: how many amps of plate current each volt on the grid moves.
export const gm = (p = AMP.pre) => p.mu / p.ra;
export const gridBias = (p = AMP.pre) => -p.idleA * p.rk;
// A soft limit: straight for small x, bending toward ±lim.
const soft = (x, lim) => lim * Math.tanh(x / lim);
// The change in plate voltage for a grid signal vin. The plate moves the opposite way to the
// grid. It can rise only to its supply (the tube cuts off) and fall only to about 60 V (the
// grid reaches the cathode), so a big signal flattens on both sides.
export function triode(vin, p = AMP.pre) {
  const swing = -stageGain(p) * vin;
  return swing >= 0 ? soft(swing, p.supply - p.plate) : soft(swing, p.plate - p.floor);
}
export const headroom = (p = AMP.pre) => Math.min(p.supply - p.plate, p.plate - p.floor) / stageGain(p);

// An audio-taper pot: about a tenth of the signal at 5, all of it at 10.
export const taper = knob => (knob <= 0 ? 0 : 0.01 * 100 ** (knob / 10));

// ---------- Tone stack ----------
// The stack's output for 1 V in at frequency f, as a complex number { re, im }. It is solved by
// nodal analysis: six unknown nodes, one equation each for the current into it.
const cx = (re, im = 0) => ({ re, im });
const add = (a, b) => cx(a.re + b.re, a.im + b.im);
const sub = (a, b) => cx(a.re - b.re, a.im - b.im);
const mul = (a, b) => cx(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
const div = (a, b) => { const d = b.re * b.re + b.im * b.im; return cx((a.re * b.re + a.im * b.im) / d, (a.im * b.re - a.re * b.im) / d); };
export function toneStack(f, knobs = KNOBS, c = TONE) {
  const w = 2 * Math.PI * f, pos = k => Math.min(0.999, Math.max(0.001, k / 10));
  const t = pos(knobs.treble), m = pos(knobs.middle), l = pos(knobs.bass);
  const R = ohms => cx(1 / ohms), C = farads => cx(0, w * farads);
  // Nodes: 0 treble pot top, 1 output (treble wiper), 2 treble pot bottom = bass pot top,
  // 3 bass pot bottom = mid pot top, 4 mid wiper, 5 slope resistor end. 'in' is 1 V, 'g' is 0 V.
  const edges = [
    ['in', 0, C(c.c1)], [0, 1, R((1 - t) * c.r1)], [1, 2, R(t * c.r1)], [1, 'g', R(c.load)],
    ['in', 5, R(c.r4)], [5, 2, C(c.c2)], [2, 3, R(l * c.r2)], [3, 4, R((1 - m) * c.r3)], [4, 'g', R(m * c.r3)], [5, 4, C(c.c3)],
  ];
  const n = 6, A = Array.from({ length: n }, () => Array.from({ length: n + 1 }, () => cx(0)));
  for (const [a, b, y] of edges) {
    for (const [i, j] of [[a, b], [b, a]]) {
      if (typeof i !== 'number') continue;
      A[i][i] = add(A[i][i], y);
      if (typeof j === 'number') A[i][j] = sub(A[i][j], y);
      else if (j === 'in') A[i][n] = add(A[i][n], y); // the 1 V source pushes current in
    }
  }
  // Gaussian elimination with partial pivoting.
  const size = z => Math.hypot(z.re, z.im);
  for (let k = 0; k < n; k++) {
    let best = k;
    for (let i = k + 1; i < n; i++) if (size(A[i][k]) > size(A[best][k])) best = i;
    [A[k], A[best]] = [A[best], A[k]];
    for (let i = k + 1; i < n; i++) {
      const factor = div(A[i][k], A[k][k]);
      for (let j = k; j <= n; j++) A[i][j] = sub(A[i][j], mul(factor, A[k][j]));
    }
  }
  const v = Array(n);
  for (let i = n - 1; i >= 0; i--) {
    let s = A[i][n];
    for (let j = i + 1; j < n; j++) s = sub(s, mul(A[i][j], v[j]));
    v[i] = div(s, A[i][i]);
  }
  return v[1];
}
export const toneGain = (f, knobs, c) => { const h = toneStack(f, knobs, c); return Math.hypot(h.re, h.im); };
export const dB = g => 20 * Math.log10(g);

// ---------- The note ----------
// A picked string: the fundamental and seven overtones, each fainter than the last.
export const HARMONICS = [1, 0.55, 0.38, 0.22, 0.16, 0.1, 0.07, 0.05].map((a, i) => ({ k: i + 1, a, phase: 0.6 * i * i }));
const NOTE_PEAK = (() => {
  let peak = 0;
  for (let i = 0; i < 400; i++) {
    const u = i / 400;
    peak = Math.max(peak, Math.abs(HARMONICS.reduce((s, h) => s + h.a * Math.sin(2 * Math.PI * h.k * u + h.phase), 0)));
  }
  return peak;
})();
// The strum's loudness t seconds after the pick hits: a fast attack and a slow fade.
export const envelope = t => (t < 0 ? 0 : (1 - Math.exp(-t / 0.012)) * Math.exp(-t / 1.1));

// The tone stack's effect on each harmonic of the note. Solve it once per knob setting.
export const toneResponse = (knobs = KNOBS, cfg = AMP) => HARMONICS.map(h => toneStack(cfg.note * h.k, knobs));

// The whole chain at one moment. u is the time in the note's cycle, in cycles; level is the
// strum's envelope (0 to 1). Returns the voltage, or current, at every probe point.
export function chain(u, level = 1, knobs = KNOBS, cfg = AMP, tones = toneResponse(knobs, cfg)) {
  const w = 2 * Math.PI * u;
  let input = 0, tone = 0;
  const pre = stageGain(cfg.pre);
  HARMONICS.forEach((h, i) => {
    const a = h.a / NOTE_PEAK * cfg.pickup * level, s = Math.sin(w * h.k + h.phase), c = Math.cos(w * h.k + h.phase);
    input += a * s;
    // The first triode is far from its limits here, so it is linear: the tone stack can work
    // on each harmonic of its (inverted) output in turn.
    tone += -pre * a * (tones[i].re * s + tones[i].im * c);
  });
  const v1 = triode(input, cfg.pre);
  const grid2 = tone * taper(knobs.gain);
  const v2 = triode(grid2, cfg.pre);
  // The phase inverter and power tubes: the speaker voltage bends toward the limit the
  // supply sets. drive is the V2 swing that takes the power stage close to full power.
  const { speaker, turns, idleA, ratedW, drive } = cfg.power;
  const vMax = Math.sqrt(2 * ratedW * speaker);
  const vs = vMax * Math.tanh(v2 / drive);
  const is = vs / speaker;
  // Push-pull class AB: the two plate currents always differ by what the load needs, and
  // their product stays at idle squared, so each tube eases off as the other takes over.
  const delta = 2 * is / turns, mid = Math.sqrt(idleA * idleA + delta * delta / 4);
  return { input, v1, tone, grid2, v2, vs, is, ia: mid + delta / 2, ib: mid - delta / 2, plateSwing: vs * turns / 2 };
}

// Average speaker power over one cycle of the note.
export function outputWatts(level = 1, knobs = KNOBS, cfg = AMP, tones = toneResponse(knobs, cfg), n = 200) {
  let sum = 0;
  for (let i = 0; i < n; i++) sum += chain(i / n, level, knobs, cfg, tones).vs ** 2;
  return sum / n / cfg.power.speaker;
}
// How far the second triode is pushed past its clean range: 0 clean, 1 and up clipping.
export const overdrive = (knobs = KNOBS, cfg = AMP, tones = toneResponse(knobs, cfg)) => {
  let peak = 0;
  for (let i = 0; i < 100; i++) peak = Math.max(peak, Math.abs(chain(i / 100, 1, knobs, cfg, tones).grid2));
  return peak / headroom(cfg.pre);
};
// Where the strum is now: the time since the last pick and its loudness.
export function strum(t, cfg = AMP) {
  const since = ((t % cfg.strumS) + cfg.strumS) % cfg.strumS;
  return { since, level: envelope(since), count: Math.floor(t / cfg.strumS) };
}
