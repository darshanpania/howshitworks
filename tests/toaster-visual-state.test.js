import test from 'node:test';
import assert from 'node:assert/strict';
import { partOpacity } from '../appliances/toaster/visual-state.js';

test('closed toaster shell stays solid until the internals are requested', () => {
  assert.equal(partOpacity('shell', { explode: 0, focus: ['cord'] }), 1);
  assert.equal(partOpacity('shell', { explode: 0.5, focus: ['elements'] }), 0.2);
});

test('the active interior part stays readable in an exploded view', () => {
  assert.equal(partOpacity('elements', { explode: 0.5, focus: ['elements'] }), 1);
  assert.equal(partOpacity('magnet', { explode: 0.5, focus: ['elements'] }), 0.28);
});
