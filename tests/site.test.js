import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { shareLinks } from '../src/site.js';

test('share links carry the page URL to X and WhatsApp', () => {
  const links = shareLinks('https://howshitworks.darshanpania.me/appliances/toaster', 'How a toaster works');
  assert.match(links.x, /^https:\/\/x\.com\/intent\/post\?/);
  assert.match(links.x, /url=https%3A%2F%2Fhowshitworks\.darshanpania\.me%2Fappliances%2Ftoaster/);
  assert.match(links.whatsapp, /^https:\/\/wa\.me\/\?text=How%20a%20toaster%20works%20https%3A/);
});

test('every page applies the saved theme before first paint', () => {
  const pages = ['index.html', ...readdirSync('appliances').map(name => `appliances/${name}/index.html`)];
  for (const page of pages) {
    const head = readFileSync(page, 'utf8').split('</head>')[0];
    assert.match(head, /localStorage\.getItem\('hsw-theme'\)/, page);
    assert.ok(head.indexOf('hsw-theme') < head.indexOf('/src/base.css'), `${page}: theme script runs before the stylesheet`);
  }
});

test('the landing footer credits the author without a source link', () => {
  const footer = readFileSync('index.html', 'utf8').match(/<footer>(.*?)<\/footer>/s)[1];
  assert.match(footer, /Built with three\.js and .*❤️.* by <a href="https:\/\/darshanpania\.me">Darshan Pania<\/a>/);
  assert.doesNotMatch(footer, /github/i);
});
