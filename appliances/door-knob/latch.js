// Pure motion rules for the knob and latch. Units are centimetres; angles are radians.
// No three.js here, so node tests can check the numbers.
export const LATCH = {
  throw: 1.3,         // the bolt sticks out 13 mm past the door edge
  backset: 6,         // spindle centre is 60 mm from the door edge
  turn: Math.PI / 4,  // a knob turns about 45° to pull the bolt fully in
  play: 0.125,        // free travel before the cam arm meets the retractor tab
  jambCorner: 2,      // the door's outer face (and the jamb face) is 2 cm from its centre
  boltHalf: 0.5,      // the bolt is 10 mm thick
  hole: 0.6,          // the strike hole is 12 mm wide, a little wider than the bolt
  jambGap: 0.3,       // 3 mm gap between the door edge and the jamb
};
// Cam arm length: at a full turn the arm tip has moved throw + play toward the spindle.
LATCH.arm = (LATCH.throw + LATCH.play) / Math.sin(LATCH.turn);

const DEG = Math.PI / 180;
const clamp01 = v => Math.max(0, Math.min(1, v));
export const smooth = v => { v = clamp01(v); return v * v * (3 - 2 * v); };

// How far the cam pulls the bolt in (0..throw) when the spindle turns by angle.
export function camRetract(angle, L = LATCH) {
  return Math.min(L.throw, Math.max(0, L.arm * Math.abs(Math.sin(angle)) - L.play));
}

// How far the strike pushes the bolt in while the door closes. dz is how far the door
// still is from shut, along its thickness. The bevel faces the closing direction (-z).
export function strikeRetract(dz, L = LATCH) {
  const onFace = L.throw - L.jambGap + 0.05;           // tip rides on the jamb face
  const touch = L.jambCorner + L.boltHalf;            // bevel first meets the jamb corner here
  if (dz >= touch) return 0;
  if (dz > touch - 2 * L.boltHalf) return Math.min(onFace, touch - dz);
  if (dz > L.hole - L.boltHalf) return onFace;        // not over the strike hole yet
  return 0;                                           // over the hole: the spring snaps it out
}

// One pose of the mechanism at time t (seconds) in a given mode.
//   turn  – turn the knob 45°, hold, let go
//   cycle – turn, pull the door open, let go, push it shut so the bevel latches
//   lock  – the privacy button is in; the outside knob only rattles
export const PERIOD = { turn: 3.2, cycle: 7, lock: 4 };
export function pose(mode, t, L = LATCH) {
  const p = { knob: 0, outer: 0, door: 0, button: 0, bolt: 0 };
  if (mode === 'lock') {
    p.button = smooth(t / 0.4);
    p.outer = DEG * 4 * Math.sin(t * Math.PI * 3) * (t > 0.6 && t < 3.2 ? 1 : 0);
    return p;
  }
  if (mode === 'turn') {
    p.knob = L.turn * (smooth(t / 0.8) - smooth((t - 1.6) / 0.8));
  } else {
    p.knob = L.turn * (smooth(t / 0.8) - smooth((t - 2.4) / 0.6));
    p.door = 4 * (smooth((t - 1.2) / 1.2) - smooth((t - 3.6) / 1.6));
  }
  p.outer = p.knob;
  p.bolt = Math.max(camRetract(p.knob, L), strikeRetract(p.door, L));
  return p;
}
// Door status for the readout.
export function status(p, locked, L = LATCH) {
  if (p.door > 0.05) return 'Open';
  if (locked) return 'Locked';
  return p.bolt > L.throw - L.jambGap ? 'Unlatched' : 'Latched';
}
