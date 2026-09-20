import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

test('toaster is a first-class appliance page linked from the landing page', () => {
  assert.ok(existsSync('appliances/toaster/index.html'));
  assert.ok(existsSync('appliances/toaster/main.js'));
  assert.ok(existsSync('appliances/toaster/page.css'));

  const landing = readFileSync('index.html', 'utf8');
  const toaster = readFileSync('appliances/toaster/index.html', 'utf8');

  assert.match(landing, /href="\/appliances\/toaster"/);
  assert.doesNotMatch(landing, /Toaster<\/h2>\s*<p>[^<]*Coming next/i);
  assert.match(toaster, /<title>Toaster · How Shit Works<\/title>/);
  assert.match(toaster, /The story in 7 steps/);
});
