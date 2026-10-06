import test from 'node:test';
import assert from 'node:assert/strict';
import { OVEN, wavelengthM, hotSpotSpacingM, fieldFlipsPerSecond, heatRateCPerS, magnetronOn, createSim, stepOven, clock, bouncePath, pathLength } from '../appliances/microwave/physics.js';

const near = (a, b, tol) => assert.ok(Math.abs(a - b) <= tol, `${a} is not within ${tol} of ${b}`);

test('2.45 GHz waves are 12.2 cm long, with hot spots about 6 cm apart', () => {
  near(wavelengthM() * 100, 12.24, 0.01);
  near(hotSpotSpacingM() * 100, 6.12, 0.01);
  assert.equal(fieldFlipsPerSecond(), 4.9e9);
});

test('the door screen holes are over 100 times smaller than the wavelength', () => {
  assert.ok(wavelengthM() * 1000 / OVEN.meshMm > 100);
});

test('800 W warms a 250 ml mug by about 0.6 °C a second', () => {
  near(heatRateCPerS(), 0.61, 0.01);
});

test('a lower power level switches the magnetron on for that share of each cycle', () => {
  const share = level => {
    const samples = OVEN.cycleS * 1000;
    let on = 0;
    for (let i = 0; i < samples; i++) on += magnetronOn(i * 0.01, level) ? 1 : 0;
    return on / samples;
  };
  near(share(10), 1, 1e-9);
  near(share(5), 0.5, 0.01);
  near(share(2), 0.2, 0.01);
});

test('two minutes at full power takes the mug from 20 °C to the low 90s, then stops', () => {
  const sim = createSim();
  for (let t = 0; t < 130; t += 0.1) stepOven(sim, 0.1, { level: 10 });
  assert.equal(sim.done, true);
  assert.equal(sim.on, false);
  assert.equal(sim.left, 0);
  near(sim.T, 93, 1.5);
});

test('half power heats about half as much in the same time', () => {
  const full = createSim(), half = createSim();
  for (let t = 0; t < 120; t += 0.1) { stepOven(full, 0.1, { level: 10 }); stepOven(half, 0.1, { level: 5 }); }
  near((half.T - 20) / (full.T - 20), 0.5, 0.03);
});

test('opening the door stops the magnetron and the timer', () => {
  const sim = createSim();
  stepOven(sim, 10, { level: 10 });
  const { left, T } = sim;
  stepOven(sim, 10, { level: 10, doorOpen: true });
  assert.equal(sim.on, false);
  assert.equal(sim.left, left);
  assert.equal(sim.T, T);
});

test('the display counts down in minutes and seconds', () => {
  assert.equal(clock(120), '2:00');
  assert.equal(clock(104.2), '1:45');
  assert.equal(clock(0), '0:00');
});

test('a bouncing ray stays inside the cavity and has the length asked for', () => {
  const room = { min: [-1.5, -1, -1.6], max: [1.5, 0.95, 1.6] };
  const path = bouncePath([1.45, 0.6, -0.3], [-1, -0.4, 0.55], room, 11);
  near(pathLength(path), 11, 1e-9);
  assert.ok(path.length > 3, 'it bounces');
  for (const p of path) p.forEach((c, a) => assert.ok(c >= room.min[a] - 1e-9 && c <= room.max[a] + 1e-9, `${p} is outside`));
});
