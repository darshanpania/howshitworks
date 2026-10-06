import test from 'node:test';
import assert from 'node:assert/strict';
import { ESPRESSO, GRIND, createSim, stepMachine, startShot, pumpFlow, steadyBar } from '../appliances/espresso-machine/physics.js';

const near = (a, b, tol) => assert.ok(Math.abs(a - b) <= tol, `${a} is not within ${tol} of ${b}`);
// Runs one shot to its end and reports what a barista would watch.
function pull(grind) {
  const sim = createSim({ T: ESPRESSO.brewC });
  const seen = { maxP: 0, firstDrop: null, returned: 0 };
  for (let i = 0; i < 6000 && sim.phase !== 'rest'; i++) {
    stepMachine(sim, 0.02, { heat: true, brew: true, grind });
    seen.maxP = Math.max(seen.maxP, sim.p);
    seen.returned += sim.opvQ * 0.02;
    if (seen.firstDrop === null && sim.cup > 0.1) seen.firstDrop = sim.t;
  }
  return { sim, ...seen };
}

test('the pump gives less water the harder it pushes and stalls at 15 bar', () => {
  assert.equal(pumpFlow(0), ESPRESSO.pumpMl);
  assert.ok(pumpFlow(9) < pumpFlow(3));
  assert.equal(pumpFlow(ESPRESSO.pumpBar), 0);
});

test('the right grind gives 36 g in about 25 s at 9 bar', () => {
  const { sim, maxP, firstDrop, returned } = pull(3);
  assert.equal(sim.cup, ESPRESSO.dose * ESPRESSO.ratio);
  near(sim.t, 25, 2);
  near(maxP, ESPRESSO.opvBar, 0.01);
  assert.ok(firstDrop > 2, `first drop at ${firstDrop} s: the dry puck soaks first`);
  assert.ok(returned > 5, `${returned} ml went back to the tank through the over-pressure valve`);
});

test('the over-pressure valve caps the pressure at 9 bar even when the puck chokes', () => {
  assert.ok(steadyBar(Infinity) <= ESPRESSO.opvBar);
  for (const grind of [1, 2, 3]) assert.ok(pull(grind).maxP <= ESPRESSO.opvBar + 1e-9);
});

test('finer coffee runs slower and coarser coffee runs faster', () => {
  const times = GRIND.map((_, i) => pull(i + 1).sim.t);
  for (let i = 1; i < times.length; i++) assert.ok(times[i] < times[i - 1], times.join(' > '));
  assert.ok(times[0] > 45, `very fine: ${times[0]} s`);
  assert.ok(times[4] < 15, `very coarse: ${times[4]} s`);
});

test('very coarse coffee cannot hold 9 bar', () => {
  const { maxP } = pull(5);
  assert.ok(maxP < 7, `${maxP} bar`);
});

test('after the shot the three-way valve drops the pressure to zero', () => {
  const { sim } = pull(3);
  assert.equal(sim.phase, 'rest');
  assert.equal(sim.p, 0);
});

test('the shot starts again after a short rest', () => {
  const { sim } = pull(3);
  for (let t = 0; t < ESPRESSO.rest + 0.1; t += 0.02) stepMachine(sim, 0.02, { heat: true, brew: true, grind: 3 });
  assert.equal(sim.phase, 'brew');
  assert.equal(sim.cup, 0);
  assert.equal(sim.shots, 2);
});

test('a shot can start part way through', () => {
  const sim = startShot(createSim({ T: 93 }), { grind: 3, from: 30 });
  assert.equal(sim.phase, 'brew');
  assert.ok(sim.cup >= 30 && sim.cup < 31, `${sim.cup} g`);
  near(sim.p, ESPRESSO.opvBar, 0.01);
});

test('the thermostat brings the boiler to 93 °C and holds it there', () => {
  const sim = createSim();
  for (let t = 0; t < 30; t += 0.02) stepMachine(sim, 0.02, { heat: true });
  let lo = Infinity, hi = -Infinity;
  for (let t = 0; t < 60; t += 0.02) { stepMachine(sim, 0.02, { heat: true }); lo = Math.min(lo, sim.T); hi = Math.max(hi, sim.T); }
  assert.ok(lo >= ESPRESSO.brewC - ESPRESSO.band - 0.2 && hi <= ESPRESSO.brewC + 0.2, `${lo}–${hi} °C`);
});

test('with the pump off there is no pressure', () => {
  const sim = createSim({ T: 93 });
  stepMachine(sim, 0.02, { heat: true, brew: false });
  assert.equal(sim.p, 0);
  assert.equal(sim.phase, 'idle');
});
