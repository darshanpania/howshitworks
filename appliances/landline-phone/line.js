// Pure electrics of a landline: the loop current, the ring, the rotary dial and the voice.
// No three.js, no DOM: easy to test. Units: volts, ohms, milliamps, seconds, degrees.
export const LINE = {
  battery: 48,        // V the exchange keeps across the pair
  feed: 400,          // Ω, the exchange's two 200 Ω feed coils
  km: 3,              // km of pair between the phone and the exchange
  wire: 0.5,          // mm, copper wire diameter
  phone: 200,         // Ω, the whole phone off hook, with the carbon at rest
  carbon: 100,        // Ω of that is the carbon transmitter
  swing: 0.5,         // a loud voice moves the carbon by up to ±50%
  farMA: 1.2,         // mA, the other caller's voice as it arrives here
  ringV: 75,          // V RMS ringing voltage
  ringHz: 25,
  ringer: 8000,       // Ω, ringer coils and capacitor at 25 Hz
  cadence: [0.4, 0.2, 0.4, 2], // s: ring, pause, ring, long pause
  pps: 10,            // dial pulses per second
  breakShare: 0.6,    // the dial holds the loop open for 60 ms of each 100 ms pulse
};
const RHO = 0.0172; // Ω·mm²/m, annealed copper at 20 °C

export const wireOhmsPerKm = (d = LINE.wire) => RHO * 1000 / (Math.PI * d * d / 4);
// Out on one wire and back on the other.
export const loopOhms = (km = LINE.km, d = LINE.wire) => 2 * km * wireOhmsPerKm(d);
// The phone off hook. push (-1..1) is the transmitter diaphragm: +1 squeezes the carbon.
export const phoneOhms = (push = 0, cfg = LINE) => cfg.phone - cfg.carbon * cfg.swing * push;
// Ohm's law round the loop: battery, feed coils, both wires, the phone.
export function loopCurrent(km = LINE.km, push = 0, cfg = LINE) {
  return 1000 * cfg.battery / (cfg.feed + loopOhms(km, cfg.wire) + phoneOhms(push, cfg));
}
export const ringPeakMA = (km = LINE.km, cfg = LINE) => 1000 * cfg.ringV * Math.SQRT2 / (cfg.ringer + loopOhms(km, cfg.wire));

// Ring cadence: ring-ring, pause.
export function ringOn(t, cfg = LINE) {
  const [a, b, c, d] = cfg.cadence, u = t % (a + b + c + d);
  return u < a || (u >= a + b && u < a + b + c);
}

// ---------- Rotary dial ----------
// Finger holes are 30° apart. Digit n (pulses: 1..10, "0" sends 10) turns the wheel (n + 1) × 30°
// to the finger stop. On the way back a governor holds 300° a second, so one 30° step is one
// 100 ms pulse; the last 30° is lost motion, a short gap after the last pulse.
export const DIAL = { step: 30, stop: -45, wind: 0.7, hold: 0.25, gap: 0.9 };
export const pulsesFor = digit => (digit === 0 ? 10 : digit);
export const dialTurn = n => (n + 1) * DIAL.step;
export const holeAngle = digit => DIAL.stop + dialTurn(pulsesFor(digit)); // on the wheel at rest
export const digitTime = (n, cfg = LINE) => DIAL.wind + DIAL.hold + dialTurn(n) / (DIAL.step * cfg.pps) + DIAL.gap;

const clamp01 = v => Math.max(0, Math.min(1, v));
const smooth = v => { v = clamp01(v); return v * v * (3 - 2 * v); };

// The dial t seconds after the finger goes into the hole for n pulses: the wheel angle, whether
// the pulse contacts hold the loop open, and how many pulses have gone.
export function dialPose(n, t, cfg = LINE) {
  const turn = dialTurn(n);
  if (t < DIAL.wind) return { angle: turn * smooth(t / DIAL.wind), open: false, sent: 0, phase: 'wind' };
  const back = t - DIAL.wind - DIAL.hold;
  if (back < 0) return { angle: turn, open: false, sent: 0, phase: 'hold' };
  const angle = Math.max(0, turn - DIAL.step * cfg.pps * back);
  const a = angle - DIAL.step;
  if (a <= 0) return { angle, open: false, sent: n, phase: angle > 0 ? 'return' : 'rest' };
  const seg = Math.ceil(a / DIAL.step);   // n at the top of the travel, 1 at the bottom
  const frac = a / DIAL.step - (seg - 1); // 1 → 0 through each step
  const open = frac > 1 - cfg.breakShare;
  const index = n - seg + 1;
  return { angle, open, sent: open ? index - 1 : index, phase: 'return' };
}

// ---------- Voice ----------
// A made-up voice: about four syllables a second in phrases with short pauses. It is slowed
// down so the eye can follow it; real speech moves the diaphragm hundreds of times a second.
const SYL = 4.2, PHRASE = 3.4, END = 11 / SYL;
export function voiceLevel(t, seed = 0) {
  const u = (((t + seed) % PHRASE) + PHRASE) % PHRASE;
  if (u > END) return 0;
  return Math.max(0, Math.sin(Math.PI * u * SYL)) ** 0.6 * (0.7 + 0.3 * Math.sin(u * 2.3 + seed));
}
export function voice(t, seed = 0) {
  const tone = 0.62 * Math.sin(2 * Math.PI * 5.3 * t) + 0.38 * Math.sin(2 * Math.PI * 8.9 * t + 1.3 + seed);
  return voiceLevel(t, seed) * tone;
}

// ---------- The whole phone ----------
// Modes for the story:
//   idle   – handset down, no call
//   ring   – handset down, the exchange rings the bell
//   lift   – the handset comes up, waits, and goes back down
//   dial   – handset up; the dial sends 5, then 0
//   talk   – handset up, you speak
//   listen – handset up, the other caller speaks
export const PERIOD = { idle: 4, ring: 3, lift: 6.5, dial: 7.4, talk: 6.8, listen: 6.8 };
export const DIGITS = [5, 0];
const LEAD = 0.8;

function liftAt(mode, t) {
  if (mode === 'idle' || mode === 'ring') return 0;
  if (mode !== 'lift') return 1;
  return smooth((t - 1.2) / 0.8) - smooth((t - 5.4) / 0.8);
}

function dialAt(t, cfg) {
  let u = t - LEAD;
  const got = [];
  if (u < 0) return { angle: 0, open: false, sent: 0, phase: 'rest', got };
  for (const digit of DIGITS) {
    const n = pulsesFor(digit), span = digitTime(n, cfg);
    if (u < span) return { ...dialPose(n, u, cfg), digit, got };
    got.push(digit); u -= span;
  }
  return { angle: 0, open: false, sent: 0, phase: 'done', got };
}

// Everything at time t in a mode. km is the line length.
export function phone(mode, t, { km = LINE.km } = {}, cfg = LINE) {
  const lift = liftAt(mode, t);
  const off = lift > 0.025; // the plungers rise and the hookswitch closes as soon as the handset leaves the cradle
  const ring = mode === 'ring' && ringOn(t, cfg);
  const dial = mode === 'dial' ? dialAt(t, cfg) : null;
  const open = !!dial?.open;
  const push = mode === 'talk' ? voice(t) : 0;
  const far = mode === 'listen' ? voice(t, 1.7) : 0;

  let mA = 0, volts = cfg.battery;
  if (off && !open) {
    mA = loopCurrent(km, push, cfg) + far * cfg.farMA;
    volts = mA / 1000 * phoneOhms(push, cfg);
  } else if (ring) {
    mA = ringPeakMA(km, cfg) * Math.sin(2 * Math.PI * cfg.ringHz * t);
  }

  const clap = ring ? Math.max(-1, Math.min(1, 1.7 * Math.sin(2 * Math.PI * cfg.ringHz * t))) : 0;
  let status = 'Waiting', tone = false;
  if (mode === 'ring') status = 'Ringing you';
  else if (dial) {
    // The exchange counts each gap in the current. The dial tone stops at the first one.
    const n = dial.digit == null ? 0 : pulsesFor(dial.digit);
    const got = n && dial.sent >= n ? [...dial.got, dial.digit] : dial.got;
    const count = dial.sent + (dial.open ? 1 : 0);
    if (dial.phase === 'return' && count > 0 && dial.sent < n) status = `Counting ${count}`;
    else if (dial.phase === 'done') status = 'Connecting';
    else if (got.length) status = `Got ${got.join(' ')}`;
    else { status = 'Dial tone'; tone = true; }
  } else if (mode === 'talk' || mode === 'listen') status = 'Connected';
  else if (off) { status = 'Dial tone'; tone = true; }

  return { lift, off, ring, clap, dial, open, push, far, mA, volts, status, tone };
}
