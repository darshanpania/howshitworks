// Pure mixer-grinder numbers: motor speed, blade speed and the AC current. No three.js, no DOM.

export const MIXER = {
  watts: 750,        // rated input power
  volts: 230,        // Indian mains
  mainsHz: 50,
  topRpm: 18000,     // no-load motor speed on 3
  // Share of the field coil each switch position (off, 1, 2, 3) sends the current through.
  // Fewer turns make a weaker field, and a series motor runs faster on a weaker field.
  fieldTurns: [0, 1, 0.78, 0.6],
  bladeMm: 76,       // tip to tip, the 4-wing wet-grinding blade
  bars: 12,          // armature slots and commutator bars in the model
  loadDrop: 0.2,     // share of speed lost with a full jar
};

// A series motor speeds up until its back-EMF (field × speed) nearly matches the supply,
// so with no load its speed goes as 1 / field turns. A load pulls the speed down.
export function motorRpm(setting, load = 0, m = MIXER) {
  if (!setting) return 0;
  return m.topRpm * m.fieldTurns[m.fieldTurns.length - 1] / m.fieldTurns[setting] * (1 - m.loadDrop * load);
}

// How fast the blade tip moves: circumference × turns per second, in km/h.
export function tipSpeedKmh(rpm, bladeMm = MIXER.bladeMm) {
  return Math.PI * bladeMm / 1000 * rpm / 60 * 3.6;
}

// AC current reverses twice in every cycle.
export const reversalsPerSecond = hz => 2 * hz;

// In a series motor one current i flows through the field and the armature, so the torque
// goes as field × armature current = i². It never goes negative: the motor runs on AC.
export function seriesTorque(t, hz = MIXER.mainsHz) {
  const i = Math.sin(2 * Math.PI * hz * t);
  return i * i;
}

// Current drawn at full power: P = V × I.
export const ratedAmps = (m = MIXER) => m.watts / m.volts;
