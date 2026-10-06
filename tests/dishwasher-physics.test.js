import test from 'node:test';
import assert from 'node:assert/strict';
import { DISHWASHER, armRpm, createSim, heatSeconds, jetSpeed, stepWasher } from '../appliances/dishwasher/physics.js';

const run = (sim, seconds, mode) => { for (let t = 0; t < seconds; t += 0.05) stepWasher(sim, 0.05, mode); return sim; };

test('a 2 kW heater takes 3.5 litres from 20°C to 65°C in about 5.5 minutes', () => {
  const minutes = heatSeconds(3.5, 20, 65, 2000) / 60;
  assert.ok(minutes > 5 && minutes < 6, `${minutes.toFixed(2)} min`);
});

test('0.2 bar behind a nozzle makes a jet of about 6 m/s', () => {
  assert.ok(Math.abs(jetSpeed(0.2) - 6.32) < 0.05);
});

test('straight-up jets cannot turn the arm; leaning jets turn it faster', () => {
  assert.equal(armRpm(0, DISHWASHER.lowerArmM), 0);
  const at10 = armRpm(10, DISHWASHER.lowerArmM);
  assert.ok(at10 > 27 && at10 < 33, `${at10.toFixed(1)} rpm at 10°`);
  assert.ok(armRpm(20, DISHWASHER.lowerArmM) > at10);
  assert.ok(armRpm(10, DISHWASHER.upperArmM) > at10, 'a shorter arm turns faster');
});

test('the inlet valve shuts after one fill of 3.5 litres', () => {
  const sim = run(createSim(), 20, { fill: true });
  assert.equal(sim.litres, DISHWASHER.fillLitres);
  assert.equal(sim.valveOpen, false);
  assert.ok(Math.abs(sim.T - DISHWASHER.inletC) < 1e-9);
});

test('the thermostat holds the wash between 63°C and 65°C', () => {
  const sim = run(createSim({ litres: 3.5 }), 30, { heat: true });
  assert.ok(sim.T >= 62.9 && sim.T <= 65.2, `${sim.T.toFixed(2)}°C`);
  let on = 0, off = 0;
  for (let i = 0; i < 400; i++) { stepWasher(sim, 0.05, { heat: true }); if (sim.heaterOn) on++; else off++; }
  assert.ok(on > 0 && off > 0, 'the heater switches on and off');
});

test('the heater never runs without water over it', () => {
  const sim = run(createSim({ litres: 0 }), 5, { heat: true });
  assert.equal(sim.heaterOn, false);
  assert.equal(sim.T, DISHWASHER.inletC);
});

test('the drain pump empties the tub', () => {
  const sim = run(createSim({ litres: 3.5, T: 65 }), 10, { drain: true });
  assert.equal(sim.litres, 0);
  assert.equal(sim.draining, false);
});
