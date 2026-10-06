import test from 'node:test';
import assert from 'node:assert/strict';
import { AC, coolingKW, rejectedKW, eer, r32Bar, r32BoilC, createRoom, stepRoom, supplyAirC } from '../appliances/window-ac/physics.js';

const near = (a, b, tol) => assert.ok(Math.abs(a - b) <= tol, `${a} is not within ${tol} of ${b}`);
function run(sim, seconds, setC = AC.setC) {
  let min = Infinity, max = -Infinity;
  for (let t = 0; t < seconds; t += 0.05) { stepRoom(sim, 0.05, setC); min = Math.min(min, sim.T); max = Math.max(max, sim.T); }
  return { min, max };
}

test('R32 boils at 7°C near 10 bar and condenses at 50°C near 31 bar', () => {
  near(r32Bar(AC.evapC), 10.1, 0.2);
  near(r32Bar(AC.condC), 31.4, 0.3);
  near(r32Bar(0), 8.13, 0.1);
  near(r32Bar(25), 16.9, 0.2);
});

test('the boiling point is the inverse of the pressure', () => {
  for (const t of [-10, 7, 25, 50]) near(r32BoilC(r32Bar(t)), t, 1e-9);
});

test('1.5 ton moves about 5.3 kW, and the outside coil gives off that plus the power in', () => {
  near(coolingKW(1.5), 5.28, 0.01);
  near(rejectedKW(), coolingKW() + AC.inputKW, 1e-9);
  assert.ok(eer() > 3 && eer() < 3.5, `EER ${eer()}`);
});

test('a hot room cools to the setting, then the thermostat holds it in its band', () => {
  const sim = createRoom();
  run(sim, 300);
  const { min, max } = run(sim, 200);
  assert.ok(min >= AC.setC - AC.band - 0.05 && max <= AC.setC + AC.band + 0.05, `room ${min} to ${max}`);
  assert.ok(sim.stops >= 3 && sim.starts >= 3, `${sim.stops} stops, ${sim.starts} starts`);
});

test('the compressor waits before it starts again', () => {
  const sim = createRoom({ T: 30, on: false, wait: AC.restartS });
  stepRoom(sim, 1);
  assert.equal(sim.on, false, 'still waiting');
  for (let t = 0; t < AC.restartS; t += 0.1) stepRoom(sim, 0.1);
  assert.equal(sim.on, true);
});

test('a setting above the room temperature stops the compressor', () => {
  const sim = createRoom({ T: 26 });
  stepRoom(sim, 0.05, 30);
  assert.equal(sim.on, false);
});

test('air leaves the cold coil about 13°C colder, and at room temperature when the compressor rests', () => {
  assert.equal(supplyAirC(AC.roomC), 14);
  assert.equal(supplyAirC(AC.roomC, 0), AC.roomC);
});
