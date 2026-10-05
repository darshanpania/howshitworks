import test from 'node:test';
import assert from 'node:assert/strict';
import { FRYER, heatFlux, browningRate, createSim, stepFryer } from '../appliances/air-fryer/physics.js';

const near = (a, b, tol) => assert.ok(Math.abs(a - b) <= tol, `${a} is not within ${tol} of ${b}`);
// Runs the fryer and reports what happened along the way.
function run(sim, seconds, mode) {
  // The air swing is measured after the first 20 s, once the preheat overshoot has passed.
  const seen = { maxSurfaceWet: 0, edges: 0, minAir: Infinity, maxAir: -Infinity, reached: null };
  for (let t = 0; t < seconds; t += 0.05) {
    const was = sim.heater;
    stepFryer(sim, 0.05, mode);
    if (sim.heater !== was) seen.edges += 1;
    if (sim.water > 0) seen.maxSurfaceWet = Math.max(seen.maxSurfaceWet, sim.surface);
    if (seen.reached === null && sim.air >= (mode.set ?? 200) - 3) seen.reached = t;
    if (t > 20) { seen.minAir = Math.min(seen.minAir, sim.air); seen.maxAir = Math.max(seen.maxAir, sim.air); }
  }
  return seen;
}

test('fast air carries about 5,000 W/m² into a 100 °C surface, five times still air', () => {
  assert.equal(heatFlux(FRYER.hFan, 200, 100), 5000);
  assert.equal(heatFlux(FRYER.hFan, 200, 100) / heatFlux(FRYER.hStill, 200, 100), 5);
});

test('the thermostat preheats to the set point and then holds it by switching the element', () => {
  const sim = createSim();
  const seen = run(sim, 40, { on: true, set: 200 });
  assert.ok(seen.reached < 12, `reached 197 °C after ${seen.reached} s`);
  assert.ok(seen.edges >= 8, `${seen.edges} switch edges`);
  assert.ok(seen.minAir > 192 && seen.maxAir < 208, `air swings ${seen.minAir.toFixed(1)} to ${seen.maxAir.toFixed(1)} °C`);
});

test('a lower setting holds a lower temperature', () => {
  const sim = createSim();
  const seen = run(sim, 40, { on: true, set: 120 });
  assert.ok(seen.minAir > 112 && seen.maxAir < 131, `air swings ${seen.minAir.toFixed(1)} to ${seen.maxAir.toFixed(1)} °C`);
});

test('a wet surface stops at 100 °C until its water is gone, then heats past 140 °C', () => {
  const sim = createSim({ air: 200, element: 550 });
  const seen = run(sim, 40, { on: true, set: 200 });
  assert.equal(seen.maxSurfaceWet, 100);
  assert.equal(sim.water, 0);
  assert.ok(sim.surface > 140, `surface ${sim.surface.toFixed(0)} °C`);
});

test('no browning below 110 °C, and 30 °C hotter browns 8 times faster', () => {
  assert.equal(browningRate(100), 0);
  near(browningRate(180) / browningRate(150), 8, 1e-9);
});

test('fries brown in the air fryer but stay pale with the fan off', () => {
  const fan = createSim({ air: 200, element: 550 });
  const still = createSim({ air: 200, element: 550 });
  run(fan, 30, { on: true, set: 200 });
  run(still, 30, { on: true, set: 200, fan: false });
  assert.ok(fan.brown > 0.6, `brown ${fan.brown.toFixed(2)} with the fan`);
  assert.ok(still.water > 0.5 && still.brown === 0, `water ${still.water.toFixed(2)}, brown ${still.brown.toFixed(2)} without it`);
});

test('switched off, the element stays off and the air cools', () => {
  const sim = createSim({ air: 200, element: 550, heater: true });
  run(sim, 20, { on: false });
  assert.equal(sim.heater, false);
  assert.ok(sim.air < 120, `air ${sim.air.toFixed(0)} °C`);
});
