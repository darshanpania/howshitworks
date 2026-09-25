import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { CATALOG, nextAppliance } from '../src/catalog.js';
import { keyAction } from '../src/engine/story-ui.js';

const key = (k, tagName = 'BODY', extra = {}) => keyAction({ key: k, target: { tagName, ...extra } });

test('arrows step, Space plays, E explodes', () => {
  assert.equal(key('ArrowRight'), 'next');
  assert.equal(key('ArrowLeft'), 'prev');
  assert.equal(key(' '), 'play');
  assert.equal(key('e'), 'explode');
  assert.equal(key('E'), 'explode');
  assert.equal(key('x'), null);
});

test('keys stay with sliders, fields and buttons that already handle them', () => {
  for (const tag of ['INPUT', 'TEXTAREA', 'SELECT']) assert.equal(key('ArrowRight', tag), null);
  assert.equal(key('e', 'DIV', { isContentEditable: true }), null);
  assert.equal(key(' ', 'BUTTON'), null, 'Space already clicks a focused button');
  assert.equal(key(' ', 'A'), null);
  assert.equal(key('ArrowRight', 'BUTTON'), 'next');
  assert.equal(keyAction({ key: 'ArrowRight', ctrlKey: true, target: { tagName: 'BODY' } }), null);
  assert.equal(keyAction({ key: ' ', repeat: true, target: { tagName: 'BODY' } }), null, 'holding Space does not flicker');
});

test('the catalog lists every appliance page with its number and title', () => {
  const dirs = readdirSync('appliances', { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name);
  assert.deepEqual(CATALOG.map(a => a.slug).sort(), dirs.sort());
  CATALOG.forEach((a, i) => {
    assert.equal(a.no, i + 1);
    const html = readFileSync(`appliances/${a.slug}/index.html`, 'utf8');
    assert.match(html, new RegExp(`No\\. ${String(a.no).padStart(2, '0')}<`), a.slug);
    assert.match(html, new RegExp(`<h1>${a.title}</h1>`), a.slug);
  });
});

test('Next after the last step leads to the following appliance, then home', () => {
  assert.deepEqual(nextAppliance('ceiling-fan'), { href: '/appliances/toaster', label: 'Next: Toaster', slug: 'toaster' });
  assert.equal(nextAppliance(CATALOG.at(-1).slug).href, '/');
  assert.equal(nextAppliance('unknown').href, '/');
});
