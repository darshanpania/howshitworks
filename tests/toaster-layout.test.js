import test from 'node:test';
import assert from 'node:assert/strict';
import { TOASTER_LAYOUT } from '../appliances/toaster/layout.js';

test('two toaster slots run across the toaster width and are separated front to back', () => {
  assert.deepEqual(TOASTER_LAYOUT.slotZ, [-0.55, 0.55]);
  assert.ok(TOASTER_LAYOUT.breadSize[0] > TOASTER_LAYOUT.breadSize[2]);
  assert.ok(TOASTER_LAYOUT.breadSize[0] < TOASTER_LAYOUT.slotSize[0]);
  assert.ok(TOASTER_LAYOUT.breadSize[2] < TOASTER_LAYOUT.slotSize[1]);
});

test('heating planes surround both front-to-back bread slices', () => {
  assert.deepEqual(TOASTER_LAYOUT.elementZ, [-1.05, -0.05, 0.05, 1.05]);
  const halfBreadDepth = TOASTER_LAYOUT.breadSize[2] / 2;
  assert.ok(TOASTER_LAYOUT.elementZ[0] < TOASTER_LAYOUT.slotZ[0] - halfBreadDepth);
  assert.ok(TOASTER_LAYOUT.elementZ[1] > TOASTER_LAYOUT.slotZ[0] + halfBreadDepth);
  assert.ok(TOASTER_LAYOUT.elementZ[2] < TOASTER_LAYOUT.slotZ[1] - halfBreadDepth);
  assert.ok(TOASTER_LAYOUT.elementZ[3] > TOASTER_LAYOUT.slotZ[1] + halfBreadDepth);
});

test('nichrome loops cover the height of each bread slice', () => {
  assert.deepEqual(TOASTER_LAYOUT.heatingY, [-0.52, -0.26, 0, 0.26, 0.52]);
});
