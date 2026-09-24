import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';

const origin = 'https://howshitworks.darshanpania.me';
const pages = ['index.html', ...readdirSync('appliances').map(name => `appliances/${name}/index.html`)];
for (const page of pages) {
  test(`${page} exposes social previews without JavaScript`, () => {
    const head = readFileSync(page, 'utf8').split('</head>')[0];
    const meta = key => head.match(new RegExp(`<meta (?:property|name)="${key}" content="([^"]*)"`))?.[1];
    assert.equal(meta('og:title'), head.match(/<title>(.*?)<\/title>/)[1]);
    assert.equal(meta('og:description'), meta('description'));
    assert.equal(meta('og:type'), 'website');
    assert.equal(meta('og:url'), origin + (page === 'index.html' ? '/' : '/' + page.replace('/index.html', '')));
    assert.equal(meta('og:image'), `${origin}/brand/og-image.jpg`);
    assert.equal(meta('og:image:width'), '1200');
    assert.equal(meta('og:image:height'), '630');
    assert.equal(meta('og:image:type'), 'image/jpeg');
    assert.ok(meta('og:image:alt'));
    assert.equal(meta('twitter:card'), 'summary_large_image');
    assert.equal(meta('twitter:image'), meta('og:image'));
    assert.equal(meta('twitter:title'), meta('og:title'));
    assert.equal(meta('twitter:description'), meta('description'));
    assert.match(head, /rel="icon"[^>]*href="\/brand\/logo.svg"/);
    assert.ok(existsSync('public/brand/og-image.jpg'));
    assert.ok(existsSync('public/brand/logo.svg'));
  });
}
