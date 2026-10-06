import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CATALOG } from '../src/catalog.js';

test('landing page lists the upcoming appliances as coming soon', () => {
  const landing = readFileSync('index.html', 'utf8');
  const soon = landing.slice(landing.indexOf('id="soon"'));
  for (const name of [
    'Washing Machine · Top Load', 'Washing Machine · Front Load',
    'Window AC', 'HVAC', 'Electric Chimney', 'Microwave', 'Air Fryer', 'Landline Phone',
  ]) {
    assert.match(soon, new RegExp(`<h2>${name}</h2>`), `${name} is missing`);
  }
  assert.doesNotMatch(soon, /<a class="card soon"/, 'coming-soon cards must not be links');
});

test('every live appliance has a card in the collection grid, in number order', () => {
  const landing = readFileSync('index.html', 'utf8');
  const grid = landing.slice(landing.indexOf('id="list"'), landing.indexOf('id="soon"'));
  const cards = [...grid.matchAll(/<a class="card[^"]*" href="\/appliances\/([^"]+)"/g)].map(m => m[1]);
  assert.deepEqual(cards, CATALOG.map(a => a.slug));
  assert.equal([...landing.matchAll(/<a class="card[^"]*" href=/g)].length, CATALOG.length, 'a card sits outside the grid');
});
