// The window AC's layout, and the paths air and water take through it. Pure numbers:
// no three.js, no DOM. Scale: 1 unit = 10 cm. x runs from the room (the front grille) to the
// outside (the hot coil at the back); y is up; z runs across the width, +z toward the reader.

// A 1.5 ton unit: 66 cm wide, 43 cm tall, 77 cm deep.
export const BODY = { front: -3.85, back: 3.85, half: 3.3, bottom: -1.7, top: 2.6 };
export const PAN_Y = -1.6;                       // top of the base pan
export const WALL = { x0: -2.95, x1: -0.65, floor: -2.9, top: 3.5, back: -4.7 }; // a 23 cm brick wall
export const PARTITION_X = -1.3;
export const AXIS = { y: 0.45, z: -0.9 };          // one shaft: blower, motor and outdoor fan
export const EVAP = { x0: -3.45, x1: -3.0, y0: -1.2, y1: 1.62, z0: -3.05, z1: 1.55 };
export const COND = { x0: 3.22, x1: 3.68, y0: -1.45, y1: 2.42, z0: -2.95, z1: 2.95 };
export const BLOWER = { x: -2.2, r: 0.9, w: 0.82 };
export const FAN = { x: 2.55, r: 1.68 };
export const WATER_Y = -1.2;                      // the water in the sump at the back

const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = t => Math.min(1, Math.max(0, t));
const smooth = (a, b, t) => { const k = clamp01((t - a) / (b - a)); return k * k * (3 - 2 * k); };

// A smooth path through waypoints [x, y, z] reached at stops (0 to 1): Catmull-Rom between them.
function along(points, stops, u, out) {
  let i = 0;
  while (i < stops.length - 2 && u > stops[i + 1]) i++;
  const t = clamp01((u - stops[i]) / (stops[i + 1] - stops[i]));
  const p0 = points[Math.max(0, i - 1)], p1 = points[i], p2 = points[i + 1], p3 = points[Math.min(points.length - 1, i + 2)];
  const t2 = t * t, t3 = t2 * t;
  for (let k = 0; k < 3; k++) {
    out[k] = 0.5 * (2 * p1[k] + (p2[k] - p0[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (3 * p1[k] - p0[k] - 3 * p2[k] + p3[k]) * t3);
  }
  return out;
}
// Fade in at the start of a path and out at its end.
const fade = (u, a = 0.08, b = 0.9) => smooth(0, a, u) * (1 - smooth(b, 1, u));

// Each particle keeps five random numbers in seed[0..4].
// Room air: in through the lower grille, through the filter and the cold coil, into the eye of
// the blower, round the scroll, along the duct over the coil and out of the top louvres.
// out = [x, y, z, cold, alpha]; cold goes 0 to 1 as the air passes the coil.
const ROOM_STOPS = [0, 0.2, 0.3, 0.36, 0.47, 0.56, 0.64, 0.72, 0.8, 0.9, 1];
export function roomAir(u, [a, b, c, d], out) {
  const y = lerp(EVAP.y0 + 0.2, EVAP.y1 - 0.15, a), z = lerp(EVAP.z0 + 0.25, EVAP.z1 - 0.25, b);
  const spin = c * Math.PI * 2, exitZ = AXIS.z + lerp(0.95, 1.3, d);
  const louvreY = lerp(1.95, 2.42, a), louvreZ = lerp(EVAP.z0 + 0.2, EVAP.z1 - 0.2, b);
  along([
    [-6.4, y - 0.3, z * 1.1], [-4.6, y, z], [EVAP.x0, y, z], [EVAP.x1, y, z],
    [BLOWER.x - 0.5, AXIS.y + 0.4 * Math.cos(spin), AXIS.z + 0.4 * Math.sin(spin)],
    [BLOWER.x, AXIS.y + 1.05 * Math.cos(spin + 2), AXIS.z + 1.05 * Math.sin(spin + 2)],
    [BLOWER.x, 1.9, exitZ], [-2.7, 2.18, louvreZ], [BODY.front, louvreY, louvreZ],
    [-5.3, louvreY + 0.25, louvreZ * 1.05], [-6.8, louvreY - 0.5 - d * 0.5, louvreZ * 1.1],
  ], ROOM_STOPS, u, out);
  out[3] = smooth(0.3, 0.36, u);
  out[4] = fade(u);
  return out;
}

// Outside air: in through the side vents, pulled through the fan, pushed out through the hot coil.
// out = [x, y, z, hot, alpha]; hot goes 0 to 1 as the air passes the coil.
const OUT_STOPS = [0, 0.15, 0.25, 0.38, 0.5, 0.57, 0.62, 0.68, 0.84, 1];
export function outdoorAir(u, [a, b, c, d, e], out) {
  const side = a < 0.5 ? 1 : -1;
  const x = lerp(-0.2, 2.1, b), y = lerp(-1.1, 2.2, c);
  const r = lerp(0.45, FAN.r - 0.15, d), turn = e * Math.PI * 2;
  const coilY = lerp(COND.y0 + 0.25, COND.y1 - 0.2, c), coilZ = lerp(COND.z0 + 0.2, COND.z1 - 0.2, (e + a) % 1);
  along([
    [x - 0.3, y, side * 5.8], [x, y, side * 4.3], [x, y, side * BODY.half],
    [(x + FAN.x) / 2, (y + AXIS.y) / 2, side * 1.6 + AXIS.z * 0.5],
    [FAN.x - 0.3, AXIS.y + r * Math.cos(turn), AXIS.z + r * Math.sin(turn)],
    [FAN.x + 0.35, AXIS.y + r * Math.cos(turn + 0.6), AXIS.z + r * Math.sin(turn + 0.6)],
    [COND.x0, coilY, coilZ], [COND.x1, coilY, coilZ], [5.3, coilY + 0.3, coilZ * 1.08], [6.9, coilY + 0.9, coilZ * 1.15],
  ], OUT_STOPS, u, out);
  out[3] = smooth(0.62, 0.68, u);
  out[4] = fade(u, 0.1);
  return out;
}

// Water from the cold coil: a drop falls into the tray, then runs back along the base pan to the sump.
// out = [x, y, z, alpha].
export function drip(u, [a, b, , d], out) {
  const x = lerp(EVAP.x0 + 0.05, EVAP.x1 - 0.05, a), z = lerp(EVAP.z0 + 0.2, EVAP.z1 - 0.2, b);
  if (u < 0.2) {
    const t = u / 0.2;
    out[0] = x; out[1] = EVAP.y0 - 0.02 - (EVAP.y0 - PAN_Y - 0.06) * t * t; out[2] = z;
  } else {
    const t = smooth(0.2, 1, u);
    out[0] = lerp(x, 2.4 + d * 0.8, t); out[1] = PAN_Y + 0.05; out[2] = lerp(z, AXIS.z + (b - 0.5) * 3, t);
  }
  out[3] = smooth(0, 0.04, u) * (1 - smooth(0.85, 1, u));
  return out;
}

// Water thrown off the slinger ring: it leaves the rim, flies back onto the hot coil and runs
// down its face as it evaporates. out = [x, y, z, alpha].
export function spray(u, [a, b, c], out) {
  const angle = Math.PI + (a - 0.5) * 2.4; // mostly off the bottom half of the ring, where it dips in the water
  const r0 = FAN.r + 0.04, r1 = r0 + 0.3 + b * 0.6;
  const y0 = AXIS.y + r0 * Math.cos(angle), z0 = AXIS.z + r0 * Math.sin(angle);
  const hitY = Math.min(COND.y1 - 0.2, AXIS.y + r1 * Math.cos(angle) + 0.9 + c * 1.6), hitZ = AXIS.z + r1 * Math.sin(angle);
  if (u < 0.45) {
    const t = u / 0.45;
    out[0] = lerp(FAN.x + 0.1, COND.x0 - 0.04, t); out[1] = lerp(y0, hitY, Math.sqrt(t)); out[2] = lerp(z0, hitZ, t);
  } else {
    const t = (u - 0.45) / 0.55;
    out[0] = COND.x0 - 0.04; out[1] = hitY - t * 0.7; out[2] = hitZ;
  }
  out[3] = smooth(0, 0.05, u) * (1 - smooth(0.6, 1, u));
  return out;
}
