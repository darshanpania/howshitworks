import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('landing page lists the upcoming appliances as coming soon', () => {
  const landing = readFileSync('index.html', 'utf8');
  const soon = landing.slice(landing.indexOf('id="soon"'));
  for (const name of [
    'Espresso Machine', 'Mixer Grinder',
    'Dishwasher', 'Washing Machine · Top Load', 'Washing Machine · Front Load',
    'Window AC', 'HVAC', 'Electric Chimney', 'Microwave', 'Air Fryer', 'Landline Phone',
  ]) {
    assert.match(soon, new RegExp(`<h2>${name}</h2>`), `${name} is missing`);
  }
  assert.doesNotMatch(soon, /<a class="card soon"/, 'coming-soon cards must not be links');
});
