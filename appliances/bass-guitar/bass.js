// Pure physics of an electric bass: the strings, the frets, the pluck, the pickup and the
// controls. No three.js, no DOM: easy to test. Units: metres, newtons, hertz, volts, seconds.
export const BASS = {
  scale: 0.864,       // m from the nut to the saddles (34 in, "long scale")
  frets: 20,
  // Standard tuning, one octave below the four lowest guitar strings. Gauge in inches, as sold;
  // tension in newtons for a common nickel roundwound set at this scale.
  strings: [
    { name: 'E', midi: 28, gauge: 0.105, tension: 200 },
    { name: 'A', midi: 33, gauge: 0.085, tension: 210 },
    { name: 'D', midi: 38, gauge: 0.065, tension: 205 },
    { name: 'G', midi: 43, gauge: 0.045, tension: 180 },
  ],
  pluckAt: 0.2,       // share of the speaking length from the saddle where the finger plucks
  depth: 0.002,       // m the finger pulls the string aside before it lets go
  modes: 32,          // harmonics summed for the string's shape and the pickup voltage
  // The split pickup: each half sits under two strings, this far from the saddles.
  coils: [{ strings: [0, 1], at: 0.158 }, { strings: [2, 3], at: 0.134 }],
  window: 0.02,       // m of string each pole piece senses
  sensitivity: 0.4,   // V per m/s of the E string's speed over the poles (a firm pluck makes about 200 mV)
  humHz: 50,          // mains hum
  humMV: 15,          // mV of hum each half picks up in a room with mains wiring
  // The model shows the strings 40 times slower than they move, so the eye can follow them.
  slow: 40,
};

const smooth = v => { v = Math.max(0, Math.min(1, v)); return v * v * (3 - 2 * v); };
const NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];

// ---------- Strings and frets ----------
// Equal temperament from A4 = 440 Hz. MIDI note 28 is E1, the open E string.
export const noteHz = midi => 440 * 2 ** ((midi - 69) / 12);
export const noteName = midi => `${NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
// Each fret shortens the speaking length by the same ratio, 2^(-1/12), one semitone.
export const speakingLength = (fret, L = BASS.scale) => L * 2 ** (-fret / 12);
export const fretDistance = (fret, L = BASS.scale) => L - speakingLength(fret, L);
export const stringHz = (i, fret = 0, cfg = BASS) => noteHz(cfg.strings[i].midi + fret);
// A wave on the string runs to the saddle and back once per cycle: v = 2 L f = √(T/μ).
export const waveSpeed = (i, cfg = BASS) => 2 * cfg.scale * stringHz(i, 0, cfg);
export const massPerMetre = (i, cfg = BASS) => cfg.strings[i].tension / waveSpeed(i, cfg) ** 2;
export const totalTension = (cfg = BASS) => cfg.strings.reduce((sum, s) => sum + s.tension, 0);

// ---------- The pluck ----------
// The finger pulls the string into a V at share p of its length and lets go. As a sum of
// standing waves, harmonic n has amplitude 2h·sin(nπp) / (n²π²·p(1−p)): a pluck near the
// saddle (small p) keeps more of the high harmonics.
export function pluckModes(p = BASS.pluckAt, h = BASS.depth, count = BASS.modes) {
  return Array.from({ length: count }, (_, k) => {
    const n = k + 1;
    return 2 * h * Math.sin(n * Math.PI * p) / (n * n * Math.PI * Math.PI * p * (1 - p));
  });
}
// Higher harmonics lose their energy faster, so the sharp V rounds off as the note rings.
// age is seconds since the pluck on the model's slowed clock.
export const decay = (n, age) => Math.exp(-Math.max(0, age) * (0.3 + 0.08 * (n - 1)));

// Sideways offset (m) at share u of the speaking length from the saddle. phase is 2π·f·t.
export function stringOffset(modes, u, phase, age = 0) {
  let y = 0;
  for (let k = 0; k < modes.length; k++) {
    const n = k + 1;
    y += modes[k] * Math.sin(n * Math.PI * u) * Math.cos(n * phase) * decay(n, age);
  }
  return y;
}
// Just before the release: a straight-sided V with its tip at p, drawn out to `pull` (0..1).
export const pulledOffset = (u, pull, p = BASS.pluckAt, h = BASS.depth) => pull * h * (u < p ? u / p : (1 - u) / (1 - p));

// ---------- Tone circuit ----------
// Passive P-bass wiring: both pickup halves in series, a 250 kΩ volume pot, a 250 kΩ tone pot
// with a 0.047 µF capacitor to ground, the cable, and the amplifier's input.
export const CIRCUIT = {
  coilOhms: 10500,    // Ω, both halves in series
  coilHenry: 5,       // H
  cable: 600e-12,     // F, about 6 m of instrument cable
  pot: 250e3,         // Ω, volume and tone pots
  cap: 47e-9,         // F, the tone capacitor
  amp: 1e6,           // Ω, the amplifier's input
};
// How much of the pickup's voltage reaches the amplifier at f, with the tone knob at tone
// (0 = all the way down, 1 = all the way up) and the volume knob at vol.
export function response(f, tone = 1, vol = 1, c = CIRCUIT) {
  const w = 2 * Math.PI * f;
  // Admittance of everything from the signal to ground: tone branch, volume pot, cable, amp.
  const rt = Math.max(1, tone * c.pot), xc = -1 / (w * c.cap); // tone branch: rt + j·xc
  const d = rt * rt + xc * xc;
  const g = rt / d + 1 / c.pot + 1 / c.amp, b = -xc / d + w * c.cable;
  // Load impedance 1/(g + jb), in series with the coil's R + jωL.
  const m = g * g + b * b, zr = g / m, zi = -b / m;
  const sr = c.coilOhms + zr, si = w * c.coilHenry + zi;
  return vol * Math.hypot(zr, zi) / Math.hypot(sr, si);
}
// The frequency above the coil's resonance where the treble has fallen 3 dB below the bass.
export function trebleCutoff(tone = 1, c = CIRCUIT) {
  const ref = response(100, tone, 1, c);
  let f = 100, peaked = false;
  for (; f < 20000; f *= 1.01) {
    const r = response(f, tone, 1, c);
    if (r > ref * 1.02) peaked = true;
    if (r < ref / Math.SQRT2 && (peaked || f > 300)) break;
  }
  return f;
}

// ---------- Pickup ----------
// The voltage is the string's speed over the poles (Faraday's law): the derivative of the
// offset, averaged over the window each pole senses. A thinner string carries less steel, so it
// disturbs the field less; that keeps the four strings about equally loud. tau is real time (s)
// since the release.
export const steelShare = (i, cfg = BASS) => Math.sqrt(massPerMetre(i, cfg) / massPerMetre(0, cfg));
export function pickupVolts(i, fret, modes, tau, age, { tone = 1, vol = 1, coil, cfg = BASS } = {}) {
  const at = (coil ?? coilFor(i, cfg)).at, L = speakingLength(fret, cfg.scale);
  const f = stringHz(i, fret, cfg), w = 2 * Math.PI * f, u = at / L, half = cfg.window / L / 2;
  let v = 0;
  for (let k = 0; k < modes.length; k++) {
    const n = k + 1, x = n * Math.PI * half;
    const seen = Math.sin(n * Math.PI * u) * (x ? Math.sin(x) / x : 1);
    v -= modes[k] * seen * n * w * Math.sin(n * w * tau) * decay(n, age) * response(n * f, tone, vol);
  }
  return cfg.sensitivity * steelShare(i, cfg) * v;
}
export const coilFor = (i, cfg = BASS) => cfg.coils.find(c => c.strings.includes(i));

// Hum from mains wiring reaches both halves alike. The second half is wound the other way and
// its magnets are flipped: for the strings the two changes cancel, so their signal adds; hum
// only sees the reversed winding, so it cancels.
export function hum(tau, cfg = BASS) {
  const h = cfg.humMV / 1000 * Math.sin(2 * Math.PI * cfg.humHz * tau);
  return { a: h, b: -h, out: 0 };
}

// ---------- Neck ----------
// Relief is the forward bow of the neck, measured at the 8th fret (mm). The strings' pull bows
// it; each turn of the truss rod nut takes about 1 mm of bow back out.
export const NECK = { bow: 1.3, perTurn: 1.0 };
export const relief = (pull = 1, turns = 1, neck = NECK) => neck.bow * pull - neck.perTurn * turns;

// ---------- The story's timeline ----------
// Modes for the story:
//   tune  – the four strings are plucked one after another and ring together
//   truss – the strings come up to pitch and bow the neck; the truss rod straightens it
//   fret  – the E string is plucked at a different fret each time
//   pluck – the E string is plucked again and again
//   hum   – the E string, then the G string: one on each pickup half
//   tone  – as pluck, while the tone knob sweeps down and back up
export const PERIOD = { tune: 5.6, truss: 8, fret: 2.8, pluck: 2.8, hum: 5.6, tone: 2.8 };
export const TONE_SWEEP = 3 * PERIOD.tone;
export const FRET_CYCLE = [0, 5, 7, 12, 3];
const PLUCKS = { tune: [[0, 0.6], [1, 1.3], [2, 2], [3, 2.7]], fret: [[0, 0.6]], pluck: [[0, 0.6]], hum: [[0, 0.6], [3, 3.4]], tone: [[0, 0.6]], truss: [] };
export const PULL_S = 0.4; // the finger draws the string aside for this long before it lets go

// Everything at time t (seconds on the model's clock, counting up from the step's start).
// fret is the reader's chosen fret; in fret mode, null lets the story walk through FRET_CYCLE.
export function bass(mode, t, { fret = 0 } = {}, cfg = BASS) {
  const period = PERIOD[mode], cycle = Math.floor(t / period), u = t - cycle * period;
  let pull = 1, turns = 1;
  if (mode === 'truss') {
    const back = 1 - smooth((u - 7) / 0.8);
    pull = smooth((u - 0.4) / 2) * back;
    turns = [0, 1, 2, 3].reduce((sum, k) => sum + 0.25 * smooth((u - 3.2 - 0.7 * k) / 0.5), 0) * back;
  }
  const fretAt = c => {
    if (mode === 'tune') return 0; // tuning is done on the open strings
    if (mode === 'fret' && fret == null) return FRET_CYCLE[((c % FRET_CYCLE.length) + FRET_CYCLE.length) % FRET_CYCLE.length];
    return fret ?? 0;
  };
  // Each string: the latest release at or before t (this cycle or the last), or a pluck about to start.
  const strings = cfg.strings.map((_, i) => {
    const at = PLUCKS[mode].find(([s]) => s === i)?.[1];
    if (at == null) return { fret: 0, age: null, pull: 0 };
    const c = u >= at ? cycle : cycle - 1, release = c * period + at;
    const next = release + period;
    const drawing = next - t <= PULL_S ? 1 - (next - t) / PULL_S : 0;
    // The finger moves to the next fret as it starts the next pluck; before the first pluck it waits there.
    const played = release >= 0;
    return { fret: drawing > 0 || !played ? fretAt(c + 1) : fretAt(c), age: played ? t - release : null, pull: drawing };
  });
  const last = strings.reduce((best, s, i) => (s.age != null && (best < 0 || s.age < strings[best].age) ? i : best), -1);
  // In tone mode the knob turns from 10 down to 0 and back, so each pluck sounds a little darker or brighter.
  const tone = mode === 'tone' ? 0.5 + 0.5 * Math.cos(2 * Math.PI * t / TONE_SWEEP) : 1;
  return { pull, turns, relief: relief(pull, turns), strings, last, tone };
}
