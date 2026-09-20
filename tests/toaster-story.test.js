import test from 'node:test';
import assert from 'node:assert/strict';
import { TOASTER_STORY } from '../appliances/toaster/story.js';

test('toaster story explains the complete pop-up cycle in seven steps', () => {
  assert.equal(TOASTER_STORY.length, 7);
  assert.deepEqual(
    TOASTER_STORY.map(step => step.t),
    [
      'Power comes in from the wall',
      'The lever lowers the bread',
      'An electromagnet holds it down',
      'Nichrome wire turns electricity into heat',
      'Infrared heat browns the bread',
      'A bimetal thermostat opens the circuit',
      'A spring pops the toast up',
    ],
  );
});

test('every toaster story step focuses existing model parts', () => {
  const partNames = new Set([
    'cord', 'bread', 'carriage', 'magnet', 'elements', 'heat', 'thermostat', 'spring',
  ]);

  for (const step of TOASTER_STORY) {
    assert.ok(step.focus.length > 0, `${step.t} needs a focused part`);
    for (const part of step.focus) {
      assert.ok(partNames.has(part), `${step.t} references ${part}`);
    }
  }
});
