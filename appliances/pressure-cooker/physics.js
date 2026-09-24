// Pure pressure-cooker physics. No three.js, no DOM: easy to test.

export const ATM = 1.01325;               // bar, sea-level air pressure
const L = 40660, R = 8.314, T0 = 373.15;  // water: latent heat J/mol, gas constant, boiling point K

export const COOKER = {
  weightKg: 0.1,     // the whistle weight
  ventMm: 3.5,       // vent pipe bore
  safetyBar: 2.0,    // safety valve opens here if the vent is blocked
  heatRate: 4,       // °C per second with the burner on (time is compressed)
  ventRate: 6,       // °C per second carried away while steam escapes
  coolRate: 3,       // °C per second cooling, near cooking temperature
  hysteresis: 0.15,  // bar the pressure drops before the weight settles again
  ambient: 25,
};

// Clausius–Clapeyron: boiling point for a gauge pressure (bar above the air).
export function boilingPointC(gaugeBar) {
  return 1 / (1 / T0 - R * Math.log((gaugeBar + ATM) / ATM) / L) - 273.15;
}

// Gauge pressure of steam over water at tempC. Inverse of boilingPointC.
export function saturationGaugeBar(tempC) {
  return ATM * Math.exp(L / R * (1 / T0 - 1 / (tempC + 273.15))) - ATM;
}

// The weight lifts when steam pressure × vent area equals its weight: p = m·g / A.
export function liftPressureBar(massKg, ventMm) {
  const area = Math.PI * (ventMm / 2000) ** 2;
  return massKg * 9.81 / area / 1e5;
}

export function createSim(start = {}) {
  return { T: COOKER.ambient, p: 0, lifted: false, whistles: 0, safetyOpen: false, ...start };
}

// Advance the cooker by dt seconds. mode: { heat, sealed, blocked }.
export function stepCooker(sim, dt, { heat = false, sealed = false, blocked = false } = {}, cfg = COOKER) {
  const lift = liftPressureBar(cfg.weightKg, cfg.ventMm);
  if (heat) sim.T += cfg.heatRate * dt;
  else sim.T -= cfg.coolRate * dt * Math.max(0.2, (sim.T - cfg.ambient) / 95);
  if (sim.lifted) sim.T -= cfg.ventRate * dt;
  if (sim.safetyOpen) sim.T -= cfg.ventRate * 2 * dt;
  sim.T = Math.max(cfg.ambient, sim.T);

  const open = !sealed || sim.safetyOpen && sim.T <= 100;
  if (open) sim.T = Math.min(sim.T, 100); // an open pot boils away at 100 °C
  sim.p = open ? 0 : Math.max(0, saturationGaugeBar(sim.T));

  if (!sealed || blocked) sim.lifted = false;
  else if (!sim.lifted && sim.p >= lift) { sim.lifted = true; sim.whistles += 1; }
  else if (sim.lifted && sim.p <= lift - cfg.hysteresis) sim.lifted = false;
  if (sealed && blocked && sim.p >= cfg.safetyBar) sim.safetyOpen = true;
  return sim;
}
