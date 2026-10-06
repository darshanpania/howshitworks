import test from 'node:test';
import assert from 'node:assert/strict';
import { HVAC, KW_PER_TON, airflowM3h, calling, createSim, stepHvac, supplyTempC, statusText } from '../appliances/hvac/hvac.js';
import { ROOMS, REGISTERS, FURNACE, BLOWER, airLoop, AIR_KEYS, lineSet, OUTDOOR } from '../appliances/hvac/layout.js';

const DT = 1 / 30;
// Run the system for a number of seconds and record each frame.
function run(sim, seconds, opts) {
  const frames = [];
  for (let t = 0; t < seconds; t += DT) frames.push({ t, ...stepHvac(sim, DT, opts) });
  return frames;
}
const inside = (x, z, { x: [x0, x1], z: [z0, z1] }) => x > x0 && x < x1 && z > z0 && z < z1;

test('the thermostat has a dead band, so it does not flick on and off', () => {
  assert.equal(calling(false, 20.6, 'heat', 21), false, 'just below the set point is not cold enough to start');
  assert.equal(calling(false, 20.5, 'heat', 21), true);
  assert.equal(calling(true, 21.4, 'heat', 21), true, 'a running call holds until half a degree above');
  assert.equal(calling(true, 21.5, 'heat', 21), false);
  assert.equal(calling(false, 24.4, 'cool', 24), false);
  assert.equal(calling(false, 24.5, 'cool', 24), true);
  assert.equal(calling(true, 23.5, 'cool', 24), false);
});

test('the furnace purges, ignites and lights before the blower starts', () => {
  const frames = run(createSim({ T: 19 }), 8, { mode: 'heat', setpoint: 21 });
  const first = key => frames.find(f => f[key])?.t ?? Infinity;
  assert.ok(first('inducer') < first('igniter'), 'inducer before igniter');
  assert.ok(first('igniter') < first('flame'), 'igniter before gas');
  assert.ok(first('flame') + HVAC.blowerDelayS - 0.1 < first('blower'), 'blower waits for the heat exchanger');
  assert.ok(Math.abs(first('flame') - (HVAC.inducerS + HVAC.igniterS)) < 0.1);
  assert.ok(frames.every(f => !(f.igniter && f.flame)), 'the igniter switches off once the flame is lit');
  assert.equal(statusText(frames.at(-1), 'heat'), 'Heating');
});

test('when the room warms up, the flame stops and the blower runs on, then everything stops', () => {
  const sim = createSim({ T: 21.6, call: true, phase: 'burn', phaseT: 10, h: 1, flame: true, blower: true, inducer: true });
  stepHvac(sim, DT, { mode: 'heat', setpoint: 21 });
  assert.equal(sim.phase, 'overrun');
  assert.equal(sim.flame, false);
  assert.equal(sim.blower, true, 'the blower empties the heat exchanger');
  run(sim, HVAC.overrunS + 0.2, { mode: 'heat', setpoint: 21 });
  assert.equal(sim.phase, 'idle');
  assert.equal(sim.blower, false);
  assert.equal(statusText(sim, 'heat'), 'Off');
});

test('a call during the run-on keeps the blower going through the restart', () => {
  const sim = createSim({ T: 20.4, phase: 'overrun', phaseT: 1, h: 0.8, blower: true });
  const frames = run(sim, HVAC.inducerS + HVAC.igniterS + HVAC.blowerDelayS + 1, { mode: 'heat', setpoint: 21 });
  assert.ok(frames.every(f => f.blower), 'no gap in the airflow');
});

test('a heat pump starts the compressor and blower together', () => {
  const sim = createSim({ T: 19 });
  stepHvac(sim, DT, { mode: 'hp', setpoint: 21 });
  assert.equal(sim.compressor, true);
  assert.equal(sim.blower, true);
  assert.equal(sim.flame, false);
  assert.equal(statusText(sim, 'hp'), 'Heat pump on');
});

test('heating warms the room; cooling cools it; both stop near the set point', () => {
  const heat = createSim({ T: 19 });
  run(heat, 120, { mode: 'heat', setpoint: 21 });
  assert.ok(heat.T > 20.4 && heat.T < 21.8, `heat settled at ${heat.T}`);
  const cool = createSim({ T: 26 });
  run(cool, 120, { mode: 'cool', setpoint: 24 });
  assert.ok(cool.T > 23.2 && cool.T < 24.6, `cool settled at ${cool.T}`);
});

test('supply air is warmest from the furnace and cold from the air conditioner', () => {
  const full = mode => supplyTempC(createSim({ T: 21, h: 1, blower: true }), mode);
  assert.ok(full('heat') > full('hp'), 'a furnace gives hotter air than a heat pump');
  assert.ok(full('hp') > 21);
  assert.ok(full('cool') > 8 && full('cool') < 15, `${full('cool')} °C`);
  assert.equal(supplyTempC(createSim(), 'heat'), null, 'no supply air while the blower is off');
});

test('a 3-ton system moves about 2,000 m³ of air an hour and 10.5 kW of heat', () => {
  assert.ok(Math.abs(airflowM3h(HVAC.tons) - 2039) < 5);
  assert.ok(Math.abs(HVAC.tons * KW_PER_TON - 10.55) < 0.05);
});

test('every register sits inside its room, and every air loop starts and ends at the blower', () => {
  for (const r of REGISTERS) {
    assert.ok(inside(r.x, r.z, ROOMS[r.room]), `${r.room} register at ${r.x}, ${r.z}`);
    const loop = airLoop(r);
    const [x0, , z0] = loop[0], [x1, y1, z1] = loop.at(-1);
    assert.ok(Math.abs(x0 - FURNACE.x) < 0.01 && Math.abs(z0 - FURNACE.z) < 0.2, 'leaves the blower');
    assert.deepEqual([x1, y1, z1], [BLOWER.x, BLOWER.y, BLOWER.z], 'comes back to the blower wheel');
    assert.ok(loop[AIR_KEYS.register][1] < loop[AIR_KEYS.register - 1][1], 'drops out of the ceiling register');
  }
});

test('the refrigerant lines run from the indoor coil to the outdoor unit', () => {
  const line = lineSet();
  assert.ok(Math.abs(line[0][0] - (FURNACE.x + FURNACE.w / 2)) < 0.01, 'starts at the side of the coil');
  assert.equal(line.at(-1)[0], OUTDOOR.x - OUTDOOR.w / 2, 'ends at the outdoor unit');
  const liquid = lineSet([0, -0.06, 0.08]);
  assert.equal(liquid.length, line.length);
});
