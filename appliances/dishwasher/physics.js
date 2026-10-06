// Pure dishwasher physics. No three.js, no DOM: easy to test.

export const WATER_HEAT = 4186; // J per kg per °C; 1 litre of water is 1 kg
const RHO = 1000;               // kg/m³

export const DISHWASHER = {
  fillLitres: 3.5,   // one fill: the sump, the pump, the pipes and a thin layer on the floor
  inletC: 20,        // cold tap water
  roomC: 25,
  washC: 65,         // the heater switches off here...
  band: 2,           // ...and back on 2 °C lower
  heaterW: 2000,
  jetBar: 0.2,       // pressure behind the spray-arm nozzles
  lowerArmM: 0.21,   // nozzle radius on the lower arm
  upperArmM: 0.18,
  slip: 0.6,         // share of the frictionless arm speed left after bearing and water drag
  // Time is compressed on screen: the heater runs 30× fast, a fill takes about 5 s, a drain about 6 s.
  heatScale: 30,
  fillLps: 0.7,
  drainLps: 0.6,
  lossPerS: 0.5,     // °C per second the water loses with the heater off (on screen)
};

// °C per second that a heater of `watts` adds to `litres` of water.
export const heatRate = (watts, litres) => watts / (Math.max(litres, 0.001) * WATER_HEAT);

// Seconds to heat `litres` of water from fromC to toC: m·c·ΔT / P.
export const heatSeconds = (litres, fromC, toC, watts) => litres * WATER_HEAT * (toC - fromC) / watts;

// Speed of a water jet driven by `bar` of pressure (Bernoulli: v = √(2p/ρ)), in m/s.
export const jetSpeed = bar => Math.sqrt(2 * bar * 1e5 / RHO);

// A spray arm is a lawn sprinkler: jets leaning angleDeg to the side push the arm the other way.
// With no friction the tips would run at the jets' sideways speed (v·sin θ = ω·r).
export function armRpm(angleDeg, radiusM, { jetBar = DISHWASHER.jetBar, slip = DISHWASHER.slip } = {}) {
  const sideways = jetSpeed(jetBar) * Math.sin(angleDeg * Math.PI / 180);
  return slip * sideways / radiusM * 60 / (2 * Math.PI);
}

export function createSim(start = {}) {
  return { litres: 0, T: DISHWASHER.inletC, heaterOn: false, valveOpen: false, draining: false, ...start };
}

// Advance the machine by dt seconds. mode: { fill, heat, drain }.
export function stepWasher(sim, dt, { fill = false, heat = false, drain = false } = {}, cfg = DISHWASHER) {
  // The inlet valve stays open until the flow meter has counted one fill; cold water mixes in.
  sim.valveOpen = fill && sim.litres < cfg.fillLitres;
  if (sim.valveOpen && dt > 0) {
    const add = Math.min(cfg.fillLps * dt, cfg.fillLitres - sim.litres);
    sim.T = (sim.T * sim.litres + cfg.inletC * add) / (sim.litres + add);
    sim.litres += add;
  }
  sim.draining = drain && sim.litres > 0;
  if (sim.draining) sim.litres = Math.max(0, sim.litres - cfg.drainLps * dt);

  // Thermostat with a small band, so the heater clicks on and off around the set point.
  // It never runs dry: the element must be under water.
  if (!heat || sim.litres < cfg.fillLitres * 0.5) sim.heaterOn = false;
  else if (sim.T >= cfg.washC) sim.heaterOn = false;
  else if (sim.T <= cfg.washC - cfg.band) sim.heaterOn = true;

  if (sim.heaterOn) sim.T += heatRate(cfg.heaterW, sim.litres) * cfg.heatScale * dt;
  else if (sim.T > cfg.roomC) sim.T = Math.max(cfg.roomC, sim.T - cfg.lossPerS * dt * (sim.T - cfg.roomC) / 40);
  return sim;
}
