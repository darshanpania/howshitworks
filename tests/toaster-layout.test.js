import test from 'node:test';
import assert from 'node:assert/strict';
import { TOASTER_LAYOUT } from '../appliances/toaster/layout.js';

test('two toaster slots run across the toaster width and are separated front to back', () => {
  assert.deepEqual(TOASTER_LAYOUT.slotZ, [-0.55, 0.55]);
  assert.ok(TOASTER_LAYOUT.breadSize[0] > TOASTER_LAYOUT.breadSize[2]);
  assert.equal(TOASTER_LAYOUT.breadSize[0], 2.8);
});

test('heating planes surround both front-to-back bread slices', () => {
  assert.deepEqual(TOASTER_LAYOUT.elementZ, [-1.05, -0.05, 0.05, 1.05]);
});
