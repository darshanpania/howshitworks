import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CATALOG } from '../src/catalog.js';

test('landing page lists the upcoming appliances as coming soon', () => {
  const landing = readFileSync('index.html', 'utf8');
  const soon = landing.slice(landing.indexOf('id="soon"'));
  for (const name of [
  ]) {
    assert.match(soon, new RegExp(`<h2>${name}</h2>`), `${name} is missing`);
  }
  assert.doesNotMatch(soon, /<a class="card soon"/, 'coming-soon cards must not be links');
});

test('every live appliance has one closed card in the collection, in catalog order', () => {
  const landing = readFileSync('index.html', 'utf8');
  const grid = landing.slice(landing.indexOf('id="list"'), landing.indexOf('id="soon"'));
  assert.equal(landing.split('<a class="card').length - 1, CATALOG.length, 'one card per catalog entry');
  // Each card closes before the next opens; parallel merges have dropped a closing tag before.
  const cards = grid.split('<a class="card').slice(1);
  assert.deepEqual(cards.map(c => c.match(/href="\/appliances\/([^"]+)"/)[1]), CATALOG.map(a => a.slug));
  cards.forEach((c, i) => {
    assert.match(c, new RegExp(`No\\. ${String(CATALOG[i].no).padStart(2, '0')}<`), CATALOG[i].slug);
    assert.equal(c.split('</a>').length - 1, 1, `${CATALOG[i].slug} card is not closed`);
  });
  const count = String(CATALOG.length).padStart(2, '0');
  assert.match(landing, new RegExp(`The collection <span class="count">${count}</span>`));
  assert.match(landing, new RegExp(`<dt>Appliances</dt><dd>${count}</dd>`));
});
