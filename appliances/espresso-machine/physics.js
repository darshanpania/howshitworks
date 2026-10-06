// Pure espresso physics. No three.js, no DOM: easy to test.
// The shot runs in real time: 25 s on the page is 25 s in a kitchen. Only the boiler's
// warm-up is sped up.

export const ESPRESSO = {
  dose: 18,          // g of ground coffee in the basket
  ratio: 2,          // the shot stops at twice the dose: 36 g in the cup
  brewC: 93,         // the boiler thermostat switches the element off here
  band: 2,           // and back on 2 °C lower
  ambient: 22,
  heatRate: 6,       // °C per second with the element on (sped up about ten times)
  lossRate: 0.4,     // °C per second the hot boiler loses with the element off
  pumpBar: 15,       // a vibratory pump stalls at about 15 bar
  pumpMl: 8,         // ml/s the pump moves against no pressure
  opvBar: 9,         // the over-pressure valve opens here and sends the rest back to the tank
  soakMl: 20,        // water that fills the space over the puck and wets the dry coffee
  soakBar: 1.5,      // pressure while the puck soaks
  give: 1.5,         // ml per bar: hoses, gasket and boiler stretch a little as the pressure builds
  ventRate: 4,       // 1/s: how fast the three-way valve lets the trapped pressure out
  rest: 3,           // s between one shot and the next
};

// How hard the puck pushes back, in bar per ml/s of flow, from very fine (1) to very coarse (5).
// Finer grounds pack tighter and leave smaller gaps for the water.
export const GRIND = [
  { label: 'Very fine', r: 14 },
  { label: 'Fine', r: 8.5 },
  { label: 'Right', r: 5.3 },
  { label: 'Coarse', r: 2.6 },
  { label: 'Very coarse', r: 1.2 },
];
export const grindAt = level => GRIND[Math.max(1, Math.min(GRIND.length, Math.round(level))) - 1];

// A vibratory pump gives less water the harder it has to push: a straight line from
// pumpMl at 0 bar to nothing at pumpBar.
export function pumpFlow(bar, cfg = ESPRESSO) {
  return cfg.pumpMl * Math.max(0, 1 - bar / cfg.pumpBar);
}

// Where the pump and the puck agree: the pressure at which the pump's flow equals the flow
// the puck lets through. The over-pressure valve caps it.
export function steadyBar(resistance, cfg = ESPRESSO) {
  const free = cfg.pumpMl / (1 / resistance + cfg.pumpMl / cfg.pumpBar);
  return Math.min(free, cfg.opvBar);
}

export function createSim(start = {}) {
  return {
    T: ESPRESSO.ambient, element: false,
    phase: 'idle',   // idle → brew → vent → rest → brew ...
    t: 0,            // shot timer, s
    p: 0,            // pressure over the puck, bar
    soaked: 0,       // ml taken up before the first drop
    cup: 0,          // g of espresso in the cup
    pumpQ: 0, puckQ: 0, opvQ: 0, ventQ: 0, // flows this frame, ml/s
    rested: 0, shots: 0,
    ...start,
  };
}

// A fresh shot: empty cup, dry puck, no pressure. With from > 0 the shot is run on
// until that many grams are in the cup.
export function startShot(sim, { grind = 3, from = 0 } = {}, cfg = ESPRESSO) {
  Object.assign(sim, { phase: 'brew', t: 0, p: 0, soaked: 0, cup: 0, pumpQ: 0, puckQ: 0, opvQ: 0, ventQ: 0, rested: 0 });
  sim.shots += 1;
  const T = sim.T;
  while (sim.phase === 'brew' && sim.cup < from) stepMachine(sim, 0.02, { heat: false, brew: true, grind, from }, cfg);
  sim.T = T;
  return sim;
}

// Advance the machine by dt seconds. mode: { heat, brew, grind, from }.
export function stepMachine(sim, dt, { heat = false, brew = false, grind = 3, from = 0 } = {}, cfg = ESPRESSO) {
  // Boiler: the thermostat switches the element off at the set point and on again below the band.
  if (!heat) sim.element = false;
  else if (sim.T <= cfg.brewC - cfg.band) sim.element = true;
  else if (sim.T >= cfg.brewC) sim.element = false;
  if (sim.element) sim.T += cfg.heatRate * dt;
  else sim.T -= cfg.lossRate * dt * Math.max(0, sim.T - cfg.ambient) / (cfg.brewC - cfg.ambient);
  sim.T = Math.max(cfg.ambient, sim.T);

  sim.pumpQ = sim.puckQ = sim.opvQ = sim.ventQ = 0;
  if (!brew) { sim.phase = 'idle'; sim.p = 0; return sim; }
  if (sim.phase === 'idle') startShot(sim, { grind, from }, cfg);

  if (sim.phase === 'brew') {
    sim.t += dt;
    sim.pumpQ = pumpFlow(sim.p, cfg);
    if (sim.soaked < cfg.soakMl) {
      // Pre-infusion: the water fills the space over the puck and soaks into the dry coffee.
      sim.soaked = Math.min(cfg.soakMl, sim.soaked + sim.pumpQ * dt);
      sim.p = cfg.soakBar * sim.soaked / cfg.soakMl;
    } else {
      // The puck is full. Whatever the puck does not let through raises the pressure;
      // above the valve's setting it goes back to the tank instead.
      sim.puckQ = sim.p / grindAt(grind).r;
      sim.p += (sim.pumpQ - sim.puckQ) / cfg.give * dt;
      if (sim.p > cfg.opvBar) { sim.opvQ = (sim.p - cfg.opvBar) * cfg.give / dt; sim.p = cfg.opvBar; }
      sim.cup += sim.puckQ * dt; // 1 ml of espresso is about 1 g
    }
    if (sim.cup >= cfg.dose * cfg.ratio) { sim.cup = cfg.dose * cfg.ratio; sim.phase = 'vent'; }
  } else if (sim.phase === 'vent') {
    // Pump off, three-way valve open: the trapped water and pressure go to the drip tray.
    sim.ventQ = sim.p * cfg.ventRate * cfg.give;
    sim.p -= sim.p * Math.min(1, cfg.ventRate * dt);
    if (sim.p < 0.05) { sim.p = 0; sim.phase = 'rest'; sim.rested = 0; }
  } else if (sim.phase === 'rest') {
    sim.rested += dt;
    if (sim.rested >= cfg.rest) startShot(sim, { grind, from }, cfg);
  }
  return sim;
}
