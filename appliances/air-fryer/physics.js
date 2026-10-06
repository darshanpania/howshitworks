// Pure air fryer physics. No three.js, no DOM: easy to test.
// Time is compressed: one second here is roughly a minute of real cooking.

export const FRYER = {
  room: 25,          // °C
  // The element heats fast and gives its heat to the air; the air loses heat through the walls and the vent.
  elementRate: 500,  // °C per second the element gains while it has power
  elementToAir: 0.8, // per second: share of (element − air) the element loses to the air
  airGain: 0.06,     // per second: share of (element − air) the air takes up
  airLoss: 0.1,      // per second: share of (air − room) lost through the walls and the vent
  band: 6,           // °C: the thermostat switches off at set + band / 2 and on again at set − band / 2
  // Food surface (a batch of fries).
  hFan: 50,          // W/m²K, forced convection with the fan running
  hStill: 10,        // W/m²K, still air at the same temperature
  warm: 0.0027,      // °C per second for each W/m² that reaches the surface
  dry: 2.5e-5,       // surface water boiled off per second for each W/m² (1 = wet, 0 = dry)
  brownStart: 110,   // °C: below this the surface does not brown
  brownAt: 150,      // °C: browning runs at brownRate here and doubles every 10 °C above it
  brownRate: 0.04,   // per second
};

// Heat reaching each square metre of food: q = h · (T_air − T_surface), in W/m².
export function heatFlux(h, airC, surfaceC) {
  return h * (airC - surfaceC);
}

// Maillard browning speed at a surface temperature (per second, before the 1 − brown slowdown).
export function browningRate(surfaceC, cfg = FRYER) {
  if (surfaceC < cfg.brownStart) return 0;
  return cfg.brownRate * 2 ** ((surfaceC - cfg.brownAt) / 10);
}

export function createSim(start = {}) {
  return { air: FRYER.room, element: FRYER.room, surface: FRYER.room, water: 1, brown: 0, heater: false, boiling: false, ...start };
}

// Advance the fryer by dt seconds. mode: { on, set, fan }. The fan runs whenever the fryer is on.
export function stepFryer(sim, dt, { on = false, set = 200, fan = on } = {}, cfg = FRYER) {
  // Thermostat with a dead band, so the element switches cleanly instead of chattering.
  if (!on) sim.heater = false;
  else if (sim.air < set - cfg.band / 2) sim.heater = true;
  else if (sim.air > set + cfg.band / 2) sim.heater = false;

  sim.element += ((sim.heater ? cfg.elementRate : 0) - cfg.elementToAir * (sim.element - sim.air)) * dt;
  sim.air += (cfg.airGain * (sim.element - sim.air) - cfg.airLoss * (sim.air - cfg.room)) * dt;

  // While the surface is wet it cannot pass 100 °C: the heat boils water off instead.
  const q = heatFlux(fan ? cfg.hFan : cfg.hStill, sim.air, sim.surface);
  sim.boiling = sim.water > 0 && sim.surface >= 100 && q > 0;
  if (sim.boiling) {
    sim.surface = 100;
    sim.water = Math.max(0, sim.water - q * cfg.dry * dt);
  } else {
    sim.surface += q * cfg.warm * dt;
    if (sim.water > 0) sim.surface = Math.min(100, sim.surface);
  }
  sim.brown = Math.min(1, sim.brown + browningRate(sim.surface, cfg) * (1 - sim.brown) * dt);
  return sim;
}
