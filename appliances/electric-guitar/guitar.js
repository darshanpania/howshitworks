// Pure physics of an electric guitar: the strings, the frets, the pickups and the circuit to the jack.
// No three.js, no DOM: easy to test. Lengths on the guitar are in cm; the rest is SI
// (kg, N, Hz, V, Ω, H, F, seconds).
export const GUITAR = {
  scale: 64.77,       // cm, 25.5 in from the nut to the saddles
  frets: 21,
  pluck: 13,          // cm from the bridge, where the pick strikes
  pull: 0.2,          // cm, how far the pick pulls the string before it slips off
  pickups: { bridge: 4.1, middle: 9.8, neck: 16.2 }, // cm from the saddles to the pole pieces
  turns: 8000,        // turns of 42 AWG (0.063 mm) enamelled copper on each coil
  coilOhms: 6000,     // Ω, DC resistance of one coil
  coilHenry: 2.4,     // H, inductance of one coil
  sense: 0.14,        // V per m/s of string speed over the poles
  pot: 250e3,         // Ω, the volume and tone pots
  toneCap: 0.022e-6,  // F, the tone capacitor
  cable: 500e-12,     // F, about 5 m of guitar cable
  amp: 1e6,           // Ω, the amplifier's input
  mains: 50,          // Hz
  hum: 0.02,          // V of mains hum one coil picks up near a lamp or a dimmer
  sustain: 3,         // s for the fundamental to fall to 37%
};
const G = 9.80665;

// Standard tuning, low E first, on a common 10-46 set. gauge is in inches; mass is kg per metre
// (the wound strings carry a nickel wrap on a steel core, so they are heavier than their gauge suggests).
export const STRINGS = [
  { name: 'E', midi: 40, gauge: 0.046, wound: true, mass: 6.825e-3 },
  { name: 'A', midi: 45, gauge: 0.036, wound: true, mass: 4.280e-3 },
  { name: 'D', midi: 50, gauge: 0.026, wound: true, mass: 2.263e-3 },
  { name: 'G', midi: 55, gauge: 0.017, wound: false, mass: 1.143e-3 },
  { name: 'B', midi: 59, gauge: 0.013, wound: false, mass: 6.69e-4 },
  { name: 'e', midi: 64, gauge: 0.010, wound: false, mass: 3.96e-4 },
];

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const noteHz = midi => 440 * 2 ** ((midi - 69) / 12);
export const noteName = midi => `${NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`;

// ---------- Strings and frets ----------
// Each fret is a semitone: it leaves 2^(-1/12) of the length, about 5.6% shorter.
export const speaking = (fret = 0, cfg = GUITAR) => cfg.scale * 2 ** (-fret / 12);
export const fretFromNut = (fret, cfg = GUITAR) => cfg.scale - speaking(fret, cfg);
export const stringHz = (i, fret = 0) => noteHz(STRINGS[i].midi + fret);
export const stringNote = (i, fret = 0) => noteName(STRINGS[i].midi + fret);
// A string's wave speed is sqrt(T / mass per metre), and the open string is half a wavelength:
// f = sqrt(T / mu) / 2L, so T = mu (2 L f)^2.
export const tension = (i, cfg = GUITAR) => STRINGS[i].mass * (2 * cfg.scale / 100 * stringHz(i)) ** 2;
export const tensionKg = (i, cfg = GUITAR) => tension(i, cfg) / G;

// The modes after a pluck. Harmonic n swings at n times the note, in the shape sin(n pi x / L)
// from the bridge. A pick pulls the string into a triangle; amp is each mode's share of it, in cm.
// Higher harmonics die away faster.
export function modes(i, fret = 0, { pluck = GUITAR.pluck, pull = GUITAR.pull, count = 40, cfg = GUITAR } = {}) {
  const L = speaking(fret, cfg), f = stringHz(i, fret), p = Math.min(pluck, L / 2);
  return Array.from({ length: count }, (_, k) => {
    const n = k + 1;
    const amp = 2 * pull * L * L / (Math.PI ** 2 * n * n * p * (L - p)) * Math.sin(n * Math.PI * p / L);
    return { n, hz: n * f, amp, tau: cfg.sustain / (1 + 0.25 * k) };
  });
}

// ---------- The circuit ----------
// The 5-way switch, from the bridge end. Two pickups at once are wired in parallel.
// Tone 1 works on the neck pickup, tone 2 on the middle and bridge.
export const SWITCH = [
  { name: 'Bridge', coils: ['bridge'], tones: 1 },
  { name: 'Bridge + middle', coils: ['bridge', 'middle'], tones: 1 },
  { name: 'Middle', coils: ['middle'], tones: 1 },
  { name: 'Middle + neck', coils: ['middle', 'neck'], tones: 2 },
  { name: 'Neck', coils: ['neck'], tones: 1 },
];
// The middle pickup is wound the other way and its magnets are flipped (RWRP). The string's
// signal is flipped twice and keeps its sign; hum only sees the winding, so it comes out inverted.
export const WINDING = { bridge: 1, middle: -1, neck: 1 };

const cx = (re, im = 0) => ({ re, im });
const add = (a, b) => cx(a.re + b.re, a.im + b.im);
const div = (a, b) => { const d = b.re * b.re + b.im * b.im; return cx((a.re * b.re + a.im * b.im) / d, (a.im * b.re - a.re * b.im) / d); };
const parallel = zs => div(cx(1), zs.reduce((s, z) => add(s, div(cx(1), z)), cx(0)));

// Audio taper: the tone pot is 10% of its track at half turn.
export const toneOhms = (tone, cfg = GUITAR) => cfg.pot * (10 ** (tone / 5) - 1) / 99;

// Jack volts per volt of coil voltage at hz. The coil (R + L, halved for two in parallel) feeds
// the volume pot, the tone pot and capacitor, the cable and the amp, all in parallel.
// The coil's inductance and the cable's capacitance ring together near 4.5 kHz: the "sparkle".
export function response(hz, pos = 4, tone = 10, cfg = GUITAR) {
  const w = 2 * Math.PI * hz, sel = SWITCH[pos], k = sel.coils.length;
  const source = cx(cfg.coilOhms / k, w * cfg.coilHenry / k);
  const toneZ = cx(toneOhms(tone, cfg), -1 / (w * cfg.toneCap));
  const load = parallel([cx(cfg.pot), ...Array(sel.tones).fill(toneZ), cx(0, -1 / (w * cfg.cable)), cx(cfg.amp)]);
  return div(load, add(source, load));
}
export const gain = (hz, pos, tone, cfg) => { const h = response(hz, pos, tone, cfg); return Math.hypot(h.re, h.im); };

// Where the response peaks, scanning 100 Hz to 20 kHz.
export function resonance(pos = 4, tone = 10, cfg = GUITAR) {
  let best = { hz: 0, gain: 0 };
  for (let hz = 100; hz < 20000; hz *= 1.005) {
    const g = gain(hz, pos, tone, cfg);
    if (g > best.gain) best = { hz, gain: g };
  }
  return best;
}

// ---------- The signal ----------
// What reaches the jack after one pluck: each harmonic's peak volts, its phase and its decay.
// A coil's voltage follows the string's speed over its poles (Faraday). Two coils in parallel
// give the average of their voltages.
// Thinner strings carry less steel, so they disturb the field less; that roughly evens out the
// strings' output, since the thin ones swing faster.
export const steel = i => (STRINGS[i].gauge / STRINGS[0].gauge) ** 0.8;
export function signal({ string = 0, fret = 0, pos = 4, tone = 10, cfg = GUITAR } = {}) {
  const L = speaking(fret, cfg), sel = SWITCH[pos];
  const at = n => sel.coils.reduce((s, c) => s + Math.sin(n * Math.PI * cfg.pickups[c] / L), 0) / sel.coils.length;
  const harmonics = modes(string, fret, { cfg }).map(m => {
    const speed = 2 * Math.PI * m.hz * m.amp / 100 * at(m.n); // m/s at the poles
    const h = response(m.hz, pos, tone, cfg);
    return { n: m.n, hz: m.hz, volts: cfg.sense * steel(string) * speed * Math.hypot(h.re, h.im), phase: Math.atan2(h.im, h.re), tau: m.tau };
  });
  const humShare = sel.coils.reduce((s, c) => s + WINDING[c], 0) / sel.coils.length;
  return { hz: stringHz(string, fret), note: stringNote(string, fret), harmonics, hum: cfg.hum * humShare, mains: cfg.mains };
}

// Jack volts t seconds after the pick lets go. clock is the mains clock, for the hum.
export function volts(sig, t, clock = t) {
  let v = 0;
  for (const h of sig.harmonics) {
    if (!h.volts) continue;
    v -= h.volts * Math.exp(-t / h.tau) * Math.sin(2 * Math.PI * h.hz * t + h.phase);
  }
  const m = 2 * Math.PI * sig.mains * clock;
  return v + sig.hum * (Math.sin(m) + 0.35 * Math.sin(3 * m));
}

// The highest |volts| over one period of the note, starting at t.
export function peak(sig, t = 0, clock = t) {
  let hi = 0;
  const span = 1 / sig.hz;
  for (let k = 0; k < 200; k++) hi = Math.max(hi, Math.abs(volts(sig, t + span * k / 200, clock + span * k / 200)));
  return hi;
}

// Where the harmonics' energy sits: a higher centroid sounds brighter.
export function brightness(sig) {
  let sum = 0, weighted = 0;
  for (const h of sig.harmonics) { sum += h.volts ** 2; weighted += h.hz * h.volts ** 2; }
  return weighted / sum;
}

// ---------- What each step plays ----------
// The story loops one of these modes. Each returns the string being played, the seconds since
// its pick, the switch position (0 = bridge, 4 = neck) and the tone knob.
export const PERIOD = { strum: 8.4, fret: 2.6, pickup: 3, coil: 3, switch: 12, hum: 6, tone: 6, out: 3 };
const smooth = v => { v = Math.max(0, Math.min(1, v)); return v * v * (3 - 2 * v); };
export function play(mode, t) {
  const every = (s, fn) => { const k = Math.floor(t / s); return { since: t - k * s, pick: k, ...fn(k) }; };
  switch (mode) {
    case 'strum': return every(1.4, k => ({ string: k % 6, pos: 4, tone: 10 }));
    case 'switch': return every(2.4, k => ({ string: 0, pos: 4 - (k % 5), tone: 10 }));
    case 'hum': return every(3, k => ({ string: 0, pos: k % 2 ? 3 : 4, tone: 10 }));
    case 'tone': {
      const u = t % PERIOD.tone;
      const tone = u < 2.2 ? 10 : u < 3 ? 10 * (1 - smooth((u - 2.2) / 0.8)) : u < 5.2 ? 0 : 10 * smooth((u - 5.2) / 0.8);
      return every(3, () => ({ string: 0, pos: 4, tone }));
    }
    default: return every(PERIOD[mode] ?? 3, () => ({ string: 0, pos: 4, tone: 10 }));
  }
}
