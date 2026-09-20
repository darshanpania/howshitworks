import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('toaster orbit drag clears after cancelled touch input', () => {
  const source = readFileSync('appliances/toaster/main.js', 'utf8');
  assert.match(source, /canvas\.addEventListener\('pointercancel', \(\) => \{ drag = null; \}\)/);
});
