// The numbers behind the concert speaker: the hang, the crossover, how far each driver moves,
// the bass port, and how the level spreads over the crowd. SI units: metres, seconds, Hz, dB.

export const C = 343;     // speed of sound in air at 20 °C, m/s
export const RHO = 1.204; // density of air at 20 °C, kg/m³
const TAU = Math.PI * 2;
const RAD = Math.PI / 180;

// One box of a three-way line array (the class of a 12-inch flagship box).
// taper is how far the top and bottom faces lean in toward the back, so boxes can splay.
export const BOX = { width: 1.3, height: 0.36, depth: 0.5, kg: 55, taper: 5 };

// The hang: the top front corner of the top box is trim metres above the floor. The flying
// frame tilts the top box site° down; the pins set the splay between each pair below it.
// Listeners' ears are at ear metres; the crowd stands from front to back metres away.
export const HANG = {
  boxes: 12, trim: 9, site: 8, ear: 1.7, front: 5, back: 40,
  splay: [0.5, 0.5, 0.5, 1, 1, 1.5, 2, 4, 6, 10, 10],
};

// The crossover, Hz: below low to the woofers, up to high to the mids, the rest to the highs.
export const CROSSOVER = { low: 250, high: 1500 };

// The drivers in one box. sd is the moving area of one driver, m²; xmax its one-way limit, mm.
export const DRIVERS = {
  woofers: { name: 'Woofers', count: 2, sd: 0.053, xmax: 9 },
  mids: { name: 'Mids', count: 4, sd: 0.0139, xmax: 3 },
  highs: { name: 'Compression drivers', count: 2, sd: 0.00456, throat: 0.000995, xmax: 0.5 },
};
// The highs' waveguide: a round throat for each driver, and one tall, narrow slot at the mouth.
export const GUIDE = { throat: 0.036, slot: 0.29, width: 0.03 };
// Each woofer has its own chamber and front port. q is the port's loss: the resonance is not perfect.
export const PORT = { volume: 0.045, width: 0.045, height: 0.28, length: 0.25, q: 7 };
// The highs' waveguide spreads 90° wide and 10° tall: a directivity factor of about 50.
export const HORN_Q = 50;
// The travel numbers are for one box playing this loud, dB SPL at 1 m.
export const LEVEL = 115;

// The slider's pitches: the standard third-octave centres from 40 Hz to 16 kHz.
export const PITCHES = [40, 50, 63, 80, 100, 125, 160, 200, 250, 315, 400, 500, 630, 800, 1000, 1250, 1600, 2000, 2500, 3150, 4000, 5000, 6300, 8000, 10000, 12500, 16000];

export const wavelength = hz => C / hz;
export const band = hz => (hz < CROSSOVER.low ? 'woofers' : hz < CROSSOVER.high ? 'mids' : 'highs');
const peakPa = db => 20e-6 * 10 ** (db / 20) * Math.SQRT2;

// The port's air (a mass) on the air in the chamber (a spring): a Helmholtz resonator.
// The slot's open ends add to its acoustic length (end corrections of a flanged and a free end).
export function portLength() {
  const r = Math.sqrt(PORT.width * PORT.height / Math.PI);
  return PORT.length + (0.85 + 0.61) * r;
}
export function portTuning() {
  const area = PORT.width * PORT.height;
  return C / TAU * Math.sqrt(area / (PORT.volume * portLength()));
}

// For a far-field pressure, the air the box pushes must accelerate by p·4πr/ρ (in open air).
// A cone in a vented box shares that with its port: near the tuning the port does the work.
// Returns the peak one-way travel in metres of the driver that plays hz, and the port's peak air speed.
export function travel(hz, db = LEVEL) {
  const w = TAU * hz, push = peakPa(db) * 4 * Math.PI / RHO; // m⁴/s², at 1 m
  const key = band(hz), d = DRIVERS[key];
  if (key === 'woofers') {
    const wb = TAU * portTuning(), loss = w * wb / PORT.q;
    // Volume moved by cone + port, per volume moved by the cone alone: (w² - j·loss) / (wb² - w² + j·loss).
    const gain = Math.hypot(w * w, loss) / Math.hypot(wb * wb - w * w, loss);
    const x = push / (d.count * d.sd * w * w * gain);
    const port = d.sd * x * wb * wb / Math.hypot(wb * wb - w * w, loss) / (PORT.width * PORT.height) * w;
    return { key, x, port };
  }
  if (key === 'mids') return { key, x: push / (d.count * d.sd * w * w), port: 0 };
  // A compression driver works into the horn's throat, a load of ρc per area: it needs power, not travel.
  const watts = (peakPa(db) ** 2 / 2) / (RHO * C) * 4 * Math.PI / HORN_Q;
  const throatSpeed = Math.sqrt(2 * (watts / d.count) / (RHO * C * d.throat));
  return { key, x: throatSpeed * d.throat / d.sd / w, port: 0 };
}

// Where every box hangs. open (0..1) scales the splay, from a straight column to the full J.
// For each box: aim (° below level), the top front corner and the centre of the front face,
// as [height, forward] in metres from the floor under the top box's front edge.
export function hang(open = 1, { trim = HANG.trim, site = HANG.site, splay = HANG.splay } = {}) {
  const boxes = [];
  let y = trim, z = 0, aim = site;
  for (let i = 0; i < HANG.boxes; i++) {
    if (i > 0) aim += splay[i - 1] * open;
    const a = aim * RAD, by = y - BOX.height * Math.cos(a), bz = z - BOX.height * Math.sin(a);
    boxes.push({ aim, top: [y, z], center: [(y + by) / 2, (z + bz) / 2] });
    y = by; z = bz;
  }
  return boxes;
}

// How far forward a box's axis reaches ear height.
export const landing = box => box.center[1] + (box.center[0] - HANG.ear) / Math.tan(box.aim * RAD);

// Sound level at a listener z metres in front and x metres to the side, in dB above what one
// box gives 1 m in front of it. Each box beams 10° tall and 90° wide (-6 dB at the edges)
// and falls off with distance like a point source; the boxes add as power.
export function coverage(z, x = 0, boxes = hang()) {
  let power = 0;
  for (const b of boxes) {
    const dy = b.center[0] - HANG.ear, dz = z - b.center[1];
    const d = Math.hypot(x, dy, dz);
    const off = Math.atan2(dy, Math.hypot(dz, x)) / RAD - b.aim;
    const side = Math.atan2(x, dz) / RAD;
    const db = Math.max(-30, -6 * (off / 5) ** 2) + Math.max(-30, -6 * (side / 45) ** 2) - 20 * Math.log10(d);
    power += 10 ** (db / 10);
  }
  return 10 * Math.log10(power);
}

// The spread of level over the crowd's centre line, front to back.
export function coverageSpread(boxes = hang(), step = 0.5) {
  let lo = Infinity, hi = -Infinity;
  for (let z = HANG.front; z <= HANG.back + 1e-9; z += step) {
    const l = coverage(z, 0, boxes); lo = Math.min(lo, l); hi = Math.max(hi, l);
  }
  return hi - lo;
}

// A point source loses 20·log10 of the distance ratio: 6 dB per doubling.
export const pointLoss = (near, far) => 20 * Math.log10(far / near);
// A line source loses 10·log10 of it: 3 dB per doubling (in its near field).
export const lineLoss = (near, far) => 10 * Math.log10(far / near);

// How far a straight line of height h keeps its near field (cylindrical spreading) at hz, m.
// The usual estimate for line arrays: d = 1.5·f·H²·√(1 - 1/(3fH)²), f in kHz.
export function nearField(hz, h) {
  const f = hz / 1000;
  return 1.5 * f * h * h * Math.sqrt(Math.max(0, 1 - 1 / (3 * f * h) ** 2));
}

// The music for the animation: one tone at the slider's pitch. The visible stroke uses a slow
// stand-in for the real frequency (0.6 to 3 Hz), so the reader can follow it.
export const showHz = hz => 0.6 + 2.4 * Math.log(hz / PITCHES[0]) / Math.log(PITCHES.at(-1) / PITCHES[0]);

// A pitch for the readout: 63 Hz, 1.6 kHz.
export function pitchText(hz) {
  return hz < 1000 ? `${hz} Hz` : `${String(hz / 1000).replace(/\.0+$/, '')} kHz`;
}
// A length: 5.4 m, 69 cm, 2.1 cm.
export function lengthText(m) {
  if (m >= 1) return `${m.toFixed(1)} m`;
  if (m >= 0.1) return `${Math.round(m * 100)} cm`;
  return `${(m * 100).toFixed(1)} cm`;
}
// A stroke: ±3.6 mm, ±0.42 mm, ±4 µm.
export function travelText(x) {
  const mm = x * 1000;
  if (mm >= 1) return `±${mm.toFixed(1)} mm`;
  if (mm >= 0.1) return `±${mm.toFixed(2)} mm`;
  return `±${Math.max(1, Math.round(mm * 1000))} µm`;
}
