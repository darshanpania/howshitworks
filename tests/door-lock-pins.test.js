import test from 'node:test';
import assert from 'node:assert/strict';
import { LOCK, RIGHT, WRONG, OUT, stacks, boltOut, pose } from '../appliances/door-lock/pins.js';

const set = (shift, key) => stacks(shift, key).filter(s => s.atShear).length;

test('with no key, every driver pin crosses the shear line', () => {
  for (const s of stacks(OUT, RIGHT)) assert.ok(s.gap < LOCK.R, `gap at ${s.gap}`);
});

test('the right key sets all five pins; the wrong key leaves one across', () => {
  assert.equal(set(0, RIGHT), 5);
  assert.equal(set(0, WRONG), 4);
  assert.ok(set(-2, RIGHT) < 5, 'a half-inserted key does not open the lock');
});

test('a quarter turn throws the bolt 25 mm', () => {
  assert.equal(boltOut(0), 0);
  assert.ok(Math.abs(boltOut(Math.PI / 2) - LOCK.throw) < 1e-9);
});

test('the wrong key only rattles the plug', () => {
  for (let t = 0; t < 7.5; t += 0.05) assert.ok(Math.abs(pose('wrong', t).turn) < 0.05);
});
