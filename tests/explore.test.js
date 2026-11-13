import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { stepFromSearch, stepSearch } from '../src/engine/story-ui.js';
import { stepForPart, choosePick } from '../src/engine/pick.js';
import { frameGoal } from '../src/engine/framing.js';

test('a link with ?step=N opens on that step', () => {
  assert.equal(stepFromSearch('?step=3', 8), 2);
  assert.equal(stepFromSearch('?capture&step=8', 8), 7);
  for (const bad of ['', '?step=0', '?step=9', '?step=two', '?step=1.5', undefined]) assert.equal(stepFromSearch(bad, 8), 0, String(bad));
});

test('the address names the step in view, and the first step is the plain page', () => {
  assert.equal(stepSearch('', 2), '?step=3');
  assert.equal(stepSearch('?step=3', 0), '');
  assert.equal(stepSearch('?step=3', 4), '?step=5');
  assert.equal(stepSearch('?capture', 1), '?capture&step=2');
  assert.equal(stepSearch('?capture&step=2', 0), '?capture');
});

const STEPS = [{ focus: ['cord'] }, { focus: ['lever', 'carriage'] }, { focus: ['magnet'] }, { focus: ['spring', 'carriage'] }];

test('a part leads to the first step that focuses it', () => {
  assert.equal(stepForPart('magnet', STEPS, 0), 2);
  assert.equal(stepForPart('carriage', STEPS, 0), 1);
  assert.equal(stepForPart('carriage', STEPS, 3), 3, 'a part in focus now stays on this step');
  assert.equal(stepForPart('shell', STEPS, 0), -1);
  assert.equal(stepForPart('elements', STEPS, 0, i => (i === 2 ? ['elements'] : STEPS[i].focus)), 2, 'pages can rename story names');
});

test('a tap goes through x-ray ghosts to the solid part behind', () => {
  const shell = { name: 'shell', alpha: 0.1, step: 0 }, magnet = { name: 'magnet', alpha: 1, step: 2 };
  assert.equal(choosePick([shell, magnet]), magnet);
  assert.equal(choosePick([shell]), shell, 'a ghost counts when nothing solid is behind it');
  assert.equal(choosePick([{ name: 'case', alpha: 1, step: -1 }, magnet]), magnet, 'parts without a step are skipped');
  assert.equal(choosePick([{ name: 'gone', alpha: 0, step: 1 }]), null);
  assert.equal(choosePick([]), null);
});

test('the camera moves in on a small part and keeps the page view for a large one', () => {
  const base = { r: 12, target: [0, 0, 0] };
  const small = frameGoal({ base, center: [2, -1.5, 0], radius: 0.4 });
  assert.ok(Math.abs(small.r - 6.96) < 1e-9, 'never closer than 58% of the page distance');
  assert.ok(small.target[0] > 1.2 && small.target[0] < 2, 'the view turns toward the part, but not all the way');
  const large = frameGoal({ base, center: [0.5, 0, 0], radius: 4 });
  assert.deepEqual(large, { r: 12, target: [0, 0, 0] });
  const mid = frameGoal({ base, center: [2, 0, 0], radius: 1.2 });
  assert.ok(mid.r > 7 && mid.r < 12);
  assert.equal(frameGoal({ base, center: [2, 0, 0], radius: 0.4, minR: 8 }).r, 8, 'the zoom limit of the page holds');
  const phone = frameGoal({ base, center: [2, 0, 0], radius: 1.2, aspect: 0.6 });
  assert.ok(phone.r > mid.r, 'a narrow stage stays further out');
});

test('every page tells the reader about tapping parts and the reset key', () => {
  for (const slug of readdirSync('appliances')) {
    const html = readFileSync(`appliances/${slug}/index.html`, 'utf8');
    assert.match(html, /<kbd>R<\/kbd> reset<\/p>/, slug);
    assert.match(html, /<p class="hint">Drag to orbit\. Tap a part or a step to focus it\.<\/p>/, slug);
  }
});
