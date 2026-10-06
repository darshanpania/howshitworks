// Pure window AC numbers and the thermostat. No three.js, no DOM: easy to test.

// A 1.5 ton window AC on R32, rated with 35°C outside and 27°C in the room.
export const AC = {
  tons: 1.5,
  inputKW: 1.65,     // electricity in: compressor plus the fan motor
  evapC: 7,          // the refrigerant boils in the room coil at this temperature
  condC: 50,         // and condenses in the outside coil at this one
  dischargeC: 80,    // gas leaving the compressor
  outdoorC: 35,
  roomC: 27,
  startC: 31,        // a hot room when the AC is switched on
  setC: 24,          // the default setting for new ACs in India
  band: 0.5,         // the compressor stops at set − band and starts again at set + band
  restartS: 3,       // a real AC waits 3 minutes before a restart; time here is compressed
  coolRate: 0.07,    // °C per second the AC takes out of the room (compressed)
  leak: 0.004,       // per second, per °C between outside and the room: heat coming back in
  coilDrop: 13,      // °C the air cools as it passes the cold coil
};

// One ton of refrigeration melts one US ton of ice in a day: 3.517 kW.
export const KW_PER_TON = 3.517;
export const coolingKW = (tons = AC.tons) => tons * KW_PER_TON;
// The outside coil gives off the room's heat plus the electricity the AC used.
export const rejectedKW = (cfg = AC) => coolingKW(cfg.tons) + cfg.inputKW;
// Energy efficiency ratio: watts of cooling per watt of electricity.
export const eer = (cfg = AC) => coolingKW(cfg.tons) / cfg.inputKW;

// Saturation pressure of R32 in bar (absolute) at tempC: where it boils or condenses.
// A two-constant Clausius–Clapeyron fit, within 1% from −10 to 60°C.
export function r32Bar(tempC) {
  return Math.exp(10.831 - 2386 / (tempC + 273.15));
}
// The inverse: the temperature at which R32 boils at this pressure.
export function r32BoilC(bar) {
  return 2386 / (10.831 - Math.log(bar)) - 273.15;
}

export function createRoom(start = {}) {
  return { T: AC.startC, on: true, wait: 0, starts: 0, stops: 0, ...start };
}

// Advance the room by dt seconds with the thermostat at setC.
// The compressor stops a little under the setting and starts a little over it,
// but never sooner than restartS after a stop, so the two pressures can even out.
export function stepRoom(sim, dt, setC = AC.setC, cfg = AC) {
  sim.wait = Math.max(0, sim.wait - dt);
  if (sim.on && sim.T <= setC - cfg.band) { sim.on = false; sim.wait = cfg.restartS; sim.stops += 1; }
  else if (!sim.on && sim.wait <= 0 && sim.T >= setC + cfg.band) { sim.on = true; sim.starts += 1; }
  const leak = cfg.leak * (cfg.outdoorC - sim.T);
  sim.T += (leak - (sim.on ? cfg.coolRate : 0)) * dt;
  return sim;
}

// Air leaving the room coil. run is how hard the compressor is working, 0 (resting) to 1:
// the coil warms up to room temperature over a few seconds after a stop.
export const supplyAirC = (roomC, run = 1, cfg = AC) => roomC - cfg.coilDrop * run;
