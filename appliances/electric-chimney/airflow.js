// Pure airflow model for the chimney. No three.js, no DOM: easy to test.
//
// The blower and the ducting meet at one operating point. The blower's pressure falls as
// it moves more air: p = p0·s²·(1 − (Q / (s·Qmax))²), where s is the speed as a share of
// top speed. The filters and duct push back as k·Q². Where the two curves cross is the
// airflow you actually get.

export const CHIMNEY = {
  ratedM3h: 1200,              // what the box says: top speed, nothing in the way
  rpm: [0, 800, 1100, 1400],   // off and the three speed buttons
  shutoffPa: 450,              // blower pressure at top speed with the outlet blocked
  ductMm: 150,                 // round duct
  filterM2: 0.216,             // two 27 × 40 cm mesh filters
  ductK: 2400,                 // Pa per (m³/s)²: 3 m of duct, two bends and the flap
  filterK: 750,                // clean filters
  clog: 10,                    // oil-filled filters resist (1 + clog) times as much
};

export const speeds = (cfg = CHIMNEY) => cfg.rpm.length - 1;

// Airflow in m³/h for a speed button (0 = off) and a filter oil load from 0 (clean) to 1.
// free: true ignores the filters and the duct, as on the box.
export function airflowM3h(speed, load = 0, { free = false } = {}, cfg = CHIMNEY) {
  const s = (cfg.rpm[speed] ?? 0) / cfg.rpm[speeds(cfg)];
  if (s <= 0) return 0;
  const qMax = cfg.ratedM3h / 3600;
  const blower = cfg.shutoffPa / qMax ** 2;
  const system = free ? 0 : cfg.ductK + cfg.filterK * (1 + cfg.clog * Math.min(1, Math.max(0, load)));
  return s * Math.sqrt(cfg.shutoffPa / (system + blower)) * 3600;
}

// The same air through a smaller opening moves faster: v = Q / A.
export function airSpeed(m3h, areaM2) {
  return m3h / 3600 / areaM2;
}

export const ductArea = (cfg = CHIMNEY) => Math.PI * (cfg.ductMm / 2000) ** 2;
