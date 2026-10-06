import test from 'node:test';
import assert from 'node:assert/strict';
import { WASHER, spinRpm, washRpm, levelFor, litres, sensorKPa, gForce, strokeRpm, createCycle, stepCycle } from '../appliances/washing-machine-top-load/washer.js';

const run = (c, mode, seconds, target = levelFor(5)) => {
  for (let t = 0; t < seconds; t += 1 / 60) stepCycle(c, 1 / 60, mode, target);
  return c;
};

test('the belt halves the motor speed and the gear cuts it by five for the wash', () => {
  assert.equal(spinRpm(), 700);
  assert.equal(washRpm(), 140);
});

test('a bigger load gets more water, and the sensor reads ρ·g·h', () => {
  assert.ok(levelFor(7) > levelFor(1));
  assert.equal(levelFor(99), levelFor(WASHER.maxKg));
  assert.ok(Math.abs(levelFor(7) - 0.29) < 1e-9);
  assert.ok(Math.abs(litres(0.29) - 61.6) < 0.1, `${litres(0.29)} L`);
  assert.ok(Math.abs(sensorKPa(0.25) - 2.45) < 0.01);
});

test('at 700 rpm the basket wall pushes with about 134 g', () => {
  assert.ok(Math.abs(gForce(700) - 134) < 1, `${gForce(700)} g`);
});

test('the pulsator turns one way, rests, then turns back', () => {
  const mid = WASHER.stroke / 2, back = WASHER.stroke + WASHER.pause + mid;
  assert.equal(strokeRpm(mid), 140);
  assert.equal(strokeRpm(WASHER.stroke + WASHER.pause / 2), 0);
  assert.equal(strokeRpm(back), -140);
  for (let t = 0; t < 10; t += 0.01) assert.ok(Math.abs(strokeRpm(t)) <= 140);
});

test('the valve stays open until the sensor reads the level for the load', () => {
  const c = createCycle();
  stepCycle(c, 1 / 60, 'fill', levelFor(5));
  assert.equal(c.valve, true);
  run(c, 'fill', 10);
  assert.equal(c.valve, false);
  assert.ok(Math.abs(c.level - levelFor(5)) < 1e-9);
});

test('the pulsator waits for the fill, and the basket stays still in the wash', () => {
  const c = createCycle();
  run(c, 'wash', 0.5);
  assert.equal(c.pulsator, 0, 'no wash while the valve is open');
  let moved = false;
  for (let t = 0; t < 12; t += 1 / 60) { stepCycle(c, 1 / 60, 'wash', levelFor(5)); moved ||= c.pulsator !== 0; assert.equal(c.basket, 0); }
  assert.ok(moved);
});

test('spin drains first, then the basket and pulsator turn together at 700 rpm', () => {
  const c = createCycle({ level: levelFor(5) });
  stepCycle(c, 1 / 60, 'spin', levelFor(5));
  assert.equal(c.drain, true);
  assert.equal(c.basket, 0, 'no spin with water in the tub');
  run(c, 'spin', 12);
  assert.equal(c.level, 0);
  assert.equal(c.basket, 700);
  assert.equal(c.pulsator, c.basket);
  assert.ok(c.wet < 0.1, `wet ${c.wet}`);
});

test('the balance ring evens out the lump as the basket comes up to speed', () => {
  const c = run(createCycle({ basket: 300 }), 'balance', 6);
  assert.equal(c.balance, 1);
  run(c, 'wash', 1);
  assert.equal(c.balance, 0);
});
