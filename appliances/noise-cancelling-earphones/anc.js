// The numbers behind the noise cancelling earbud: what the tip blocks, how well a late mirror
// image cancels, how far the diaphragm moves, and what the battery pays. SI units: m, s, Hz, dB.

export const C = 343;     // speed of sound in air at 20 °C, m/s
export const RHO = 1.204; // density of air at 20 °C, kg/m³
const TAU = Math.PI * 2;

// One bud. cone is the moving width of the 11 mm speaker; canal is the air shut in between the
// tip and the eardrum, m³; path is how far the sound goes from the outer microphone to the speaker.
export const BUD = { grams: 5.4, driver: 0.011, cone: 0.009, canal: 1.3e-6, path: 0.014 };

// The tip and shell as a filter: a plug with small leaks is a first-order low-pass.
// Below corner Hz the sound gets through; above it the loss grows 6 dB per octave, up to limit dB.
export const TIP = { corner: 300, limit: 30 };

// The chip. rate: samples per second. latency: microphone, filter, converter and diaphragm, s.
// match: how close the anti-noise level is to the noise once the inner microphone has trimmed it;
// loose: the same for a poor fit with no trim. Above roll Hz the chip turns the anti-noise down.
export const CHIP = { rate: 192000, latency: 80e-6, match: 0.97, loose: 0.7, roll: 2500 };

// The cells: one in each bud, one in the case. efficiency: the share of the case's energy that
// ends up in the buds.
export const BATTERY = { mAh: 50, volts: 3.8, hours: 6, caseMah: 500, efficiency: 0.8 };

// The slider's pitches: the standard third-octave centres from 40 Hz to 8 kHz.
export const PITCHES = [40, 50, 63, 80, 100, 125, 160, 200, 250, 315, 400, 500, 630, 800, 1000, 1250, 1600, 2000, 2500, 3150, 4000, 5000, 6300, 8000];

export const wavelength = hz => C / hz;

// Passive: the loss through the tip and shell, dB.
export const passive = hz => Math.min(TIP.limit, 10 * Math.log10(1 + (hz / TIP.corner) ** 2));

// The noise passes the outer microphone before it reaches the speaker: the chip's head start, s.
export const headStart = () => BUD.path / C;
// The chip needs longer than that, so the anti-noise is this late, s.
export const lag = () => CHIP.latency - headStart();
// The same lag as a share of one cycle of the note, in degrees.
export const lateBy = hz => 360 * hz * lag();

// The level of the anti-noise as a share of the noise. The chip fades it out at high pitches,
// where a late mirror image would add noise. (A model of the level only: a real filter also
// turns the phase.)
export const antiGain = (hz, match = CHIP.match) => match / (1 + (hz / CHIP.roll) ** 4);

// What is left when a wave meets its mirror image, g times as tall and late by an angle:
// |1 - g·e^(-jφ)|, as a share of the noise's pressure.
export function residual(hz, match = CHIP.match) {
  const g = antiGain(hz, match), phi = TAU * hz * lag();
  return Math.sqrt(1 + g * g - 2 * g * Math.cos(phi));
}
// Active: the loss from the anti-noise, dB.
export const active = (hz, match = CHIP.match) => Math.max(0, -20 * Math.log10(residual(hz, match)));
// With perfect timing, the level match alone sets the limit, dB.
export const bestCase = match => -20 * Math.log10(1 - match);

// Tip and chip together, dB.
export const total = (hz, on = true, match = CHIP.match) => passive(hz) + (on ? active(hz, match) : 0);
// A loss in dB as a share of the pressure.
export const share = db => 10 ** (-db / 20);

// The sealed canal is a small chamber: pushing the diaphragm in by ΔV raises the pressure by
// ρc²·ΔV/V. Returns the one-way travel in metres that makes (or cancels) a tone of db dB SPL.
export function stroke(db) {
  const peak = 20e-6 * 10 ** (db / 20) * Math.SQRT2;
  const area = Math.PI * (BUD.cone / 2) ** 2;
  return peak * BUD.canal / (RHO * C * C) / area;
}

// Energy: watt-hours in one bud, the average power with noise cancelling on, mW, and how many
// times the case can fill both buds again.
export const budWh = () => BATTERY.mAh * BATTERY.volts / 1000;
export const budMilliwatts = () => budWh() / BATTERY.hours * 1000;
export const caseCharges = () => BATTERY.caseMah * BATTERY.efficiency / (2 * BATTERY.mAh);
export const totalHours = () => BATTERY.hours * (1 + caseCharges());

// The animation shows a slow stand-in for the real pitch (0.5 to 2 Hz), and waves far shorter
// than the real ones (16 mm to 5 mm), so the reader can follow them.
const span = hz => Math.log(hz / PITCHES[0]) / Math.log(PITCHES.at(-1) / PITCHES[0]);
export const showHz = hz => 0.5 + 1.5 * span(hz);
export const showLength = hz => 16 - 11 * span(hz);

// A pitch for the readout: 63 Hz, 1.6 kHz.
export function pitchText(hz) {
  return hz < 1000 ? `${hz} Hz` : `${String(hz / 1000).replace(/\.0+$/, '')} kHz`;
}
// A loss for the readout: −23 dB (0 dB without a sign).
export function lossText(db) {
  const n = Math.round(db);
  return n > 0 ? `−${n} dB` : '0 dB';
}
