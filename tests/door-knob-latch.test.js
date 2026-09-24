import test from 'node:test';
import assert from 'node:assert/strict';
import { LATCH, camRetract, strikeRetract, pose, status, PERIOD } from '../appliances/door-knob/latch.js';

const near = (a, b, eps = 0.02) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);

test('a 45° turn either way pulls the bolt fully in', () => {
  near(camRetract(0), 0);
  near(camRetract(LATCH.turn), LATCH.throw);
  near(camRetract(-LATCH.turn), LATCH.throw);
  assert.equal(camRetract(0.05), 0, 'a small wobble stays inside the free play');
});

test('closing the door rides the bevel and snaps out over the strike hole', () => {
  assert.equal(strikeRetract(4), 0);
  const riding = strikeRetract(2);
  assert.ok(riding > 0 && riding < LATCH.throw, 'the bevel is part way in at the jamb corner');
  assert.ok(LATCH.throw - strikeRetract(1) <= LATCH.jambGap, 'the tip clears the jamb face');
  assert.equal(strikeRetract(0), 0, 'the spring pushes it out at the hole');
});

test('a full cycle ends latched, and the lock mode never moves the bolt', () => {
  const end = pose('cycle', PERIOD.cycle - 0.1);
  assert.equal(status(end, false), 'Latched');
  assert.equal(status(pose('cycle', 2), false), 'Open');
  for (let t = 0; t < PERIOD.lock; t += 0.1) assert.equal(pose('lock', t).bolt, 0);
  assert.equal(status(pose('lock', 1), true), 'Locked');
});
