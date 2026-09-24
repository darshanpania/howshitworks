import test from 'node:test';
import assert from 'node:assert/strict';
import { boilingPointC, saturationGaugeBar, liftPressureBar, createSim, stepCooker, COOKER } from '../appliances/pressure-cooker/physics.js';

const near = (a, b, tol) => assert.ok(Math.abs(a - b) <= tol, `${a} is not within ${tol} of ${b}`);
function run(sim, seconds, mode) {
  let maxP = 0;
  for (let t = 0; t < seconds; t += 0.05) { stepCooker(sim, 0.05, mode); maxP = Math.max(maxP, sim.p); }
  return maxP;
}

test('water boils at 100 °C open and about 120 °C at +1 bar', () => {
  near(boilingPointC(0), 100, 0.05);
  near(boilingPointC(1), 120.6, 0.5);
});

test('saturation pressure is the inverse of the boiling point', () => {
  for (const g of [0, 0.5, 1, 2]) near(saturationGaugeBar(boilingPointC(g)), g, 1e-9);
});

test('a 100 g weight on a 3.5 mm vent lifts at about 1 bar', () => {
  near(liftPressureBar(0.1, 3.5), 1.02, 0.01);
});

test('an open pot never builds pressure or passes 100 °C', () => {
  const sim = createSim();
  run(sim, 60, { heat: true, sealed: false });
  assert.equal(sim.p, 0);
  near(sim.T, 100, 1e-9);
});

test('the weight caps the pressure and whistles again and again', () => {
  const sim = createSim(); const lift = liftPressureBar(COOKER.weightKg, COOKER.ventMm);
  const maxP = run(sim, 90, { heat: true, sealed: true });
  assert.ok(maxP < lift + 0.05, `max ${maxP} bar, lift ${lift} bar`);
  assert.ok(sim.whistles >= 3, `${sim.whistles} whistles`);
});

test('a blocked vent opens the safety valve near its set pressure', () => {
  const sim = createSim();
  const maxP = run(sim, 90, { heat: true, sealed: true, blocked: true });
  assert.equal(sim.safetyOpen, true);
  assert.equal(sim.whistles, 0);
  assert.ok(maxP < COOKER.safetyBar + 0.05, `max ${maxP} bar`);
});

test('with the heat off the pressure falls to zero', () => {
  const sim = createSim({ T: 120 });
  run(sim, 120, { heat: false, sealed: true });
  assert.equal(sim.p, 0);
});
