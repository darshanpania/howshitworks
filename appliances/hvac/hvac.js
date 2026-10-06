// Pure HVAC controls and room temperature. No three.js, no DOM: easy to test.
// Time is compressed: a furnace that takes a minute to light takes a few seconds here.

export const HVAC = {
  tons: 3,              // cooling capacity of the system; 1 ton = 3.517 kW
  differential: 0.5,    // °C: the thermostat calls at set point − 0.5 and stops at + 0.5 (heat)
  inducerS: 1.2,        // the inducer fan clears the heat exchanger before ignition
  igniterS: 1.8,        // the hot-surface igniter heats up before the gas valve opens
  blowerDelayS: 2.5,    // after the flame lights, the blower waits for the exchanger to heat
  postPurgeS: 1,        // the inducer runs on after the flame goes out
  overrunS: 4,          // the blower runs on to empty the heat exchanger
  warmS: 2.5,           // seconds for the heat exchanger or coil to reach full temperature
  rise: { heat: 30, hp: 15, cool: -11 }, // °C the system adds to the air at full output
  outdoor: { heat: 2, hp: 7, cool: 35 }, // °C outside, for each mode
  gain: 0.008,          // per second: how fast supply air pulls the room toward it
  leak: 0.003,          // per second: how fast the room drifts toward the outdoor temperature
};

export const KW_PER_TON = 3.517;
const M3H_PER_CFM = 1.699;
// The rule of thumb for duct and blower sizing: 400 cubic feet per minute for each ton.
export const airflowM3h = tons => tons * 400 * M3H_PER_CFM;

export function createSim(start = {}) {
  return {
    T: 20, call: false, phase: 'idle', phaseT: 0, hold: false, h: 0,
    inducer: false, igniter: false, flame: false, blower: false, compressor: false, ...start,
  };
}

// The thermostat: a switch with a dead band, so the system does not flick on and off.
export function calling(call, T, mode, setpoint, d = HVAC.differential) {
  if (mode === 'cool') return call ? T > setpoint - d : T >= setpoint + d;
  return call ? T < setpoint + d : T <= setpoint - d;
}

// Advance the system by dt seconds. mode: 'heat' (gas furnace), 'hp' (heat pump heating) or 'cool'.
export function stepHvac(sim, dt, { mode = 'heat', setpoint = 21 } = {}, cfg = HVAC) {
  sim.call = calling(sim.call, sim.T, mode, setpoint, cfg.differential);
  sim.phaseT += dt;
  const go = phase => { sim.phase = phase; sim.phaseT = 0; };
  if (mode === 'heat') {
    // Call → inducer → igniter → gas valve and flame → blower, once the exchanger is hot.
    if (sim.phase === 'run') go('idle'); // coming from a heat pump mode
    const firing = ['inducer', 'ignite', 'burn'].includes(sim.phase);
    if (!sim.call && firing) go(sim.phase === 'burn' || sim.hold ? 'overrun' : 'idle');
    else if (sim.call && !firing) { sim.hold = sim.phase === 'overrun'; go('inducer'); }
    else if (sim.phase === 'inducer' && sim.phaseT >= cfg.inducerS) go('ignite');
    else if (sim.phase === 'ignite' && sim.phaseT >= cfg.igniterS) go('burn');
    else if (sim.phase === 'overrun' && sim.phaseT >= cfg.overrunS) go('idle');
    if (sim.phase === 'idle' || (sim.phase === 'burn' && sim.phaseT >= cfg.blowerDelayS)) sim.hold = false;
    sim.inducer = ['inducer', 'ignite', 'burn'].includes(sim.phase) || (sim.phase === 'overrun' && sim.phaseT < cfg.postPurgeS);
    sim.igniter = sim.phase === 'ignite';
    sim.flame = sim.phase === 'burn';
    sim.blower = sim.phase === 'overrun' || sim.hold || (sim.phase === 'burn' && sim.phaseT >= cfg.blowerDelayS);
    sim.compressor = false;
  } else {
    // A heat pump or air conditioner starts the compressor, the outdoor fan and the blower together.
    if (sim.call && sim.phase !== 'run') go('run');
    else if (!sim.call && sim.phase !== 'idle') go('idle');
    sim.inducer = sim.igniter = sim.flame = sim.hold = false;
    sim.compressor = sim.blower = sim.phase === 'run';
  }
  // The heat exchanger or coil reaches full output while its source runs, and settles back
  // when it stops: fast while the blower still carries its heat away, slowly when it does not.
  const source = sim.flame || sim.compressor;
  const rate = source ? 1 : sim.blower ? 1.5 : 0.4;
  sim.h += ((source ? 1 : 0) - sim.h) * (1 - Math.exp(-dt * rate / cfg.warmS));
  // Supply air pulls the room toward its own temperature; the walls leak toward outdoors.
  const push = sim.blower ? cfg.rise[mode] * sim.h : 0;
  sim.T += (cfg.gain * push + cfg.leak * (cfg.outdoor[mode] - sim.T)) * dt;
  return sim;
}

// Air temperature at the registers, or null while the blower is off.
export function supplyTempC(sim, mode, cfg = HVAC) {
  return sim.blower ? sim.T + cfg.rise[mode] * sim.h : null;
}

// One short line for the readout.
export function statusText(sim, mode) {
  if (mode !== 'heat') return sim.compressor ? (mode === 'cool' ? 'Cooling' : 'Heat pump on') : 'Off';
  return {
    idle: 'Off', inducer: 'Inducer purge', ignite: 'Igniter glowing',
    burn: sim.blower ? 'Heating' : 'Burners lit', overrun: 'Blower run-on',
  }[sim.phase];
}
