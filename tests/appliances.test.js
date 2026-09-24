// Checks every folder under appliances/ against the same rules.
// A new appliance gets these tests for free.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';

const names = readdirSync('appliances', { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name);
const landing = readFileSync('index.html', 'utf8');

for (const name of names) {
  const dir = `appliances/${name}`;
  test(`${name}: has the page files`, () => {
    for (const file of ['index.html', 'main.js', 'page.css', 'story.js']) assert.ok(existsSync(`${dir}/${file}`), `${dir}/${file}`);
  });

  test(`${name}: story has 6 to 8 complete steps`, async () => {
    const story = Object.values(await import(`../${dir}/story.js`)).find(Array.isArray);
    assert.ok(story, 'story.js exports an array of steps');
    assert.ok(story.length >= 6 && story.length <= 8, `${story.length} steps`);
    for (const step of story) {
      for (const key of ['t', 'd', 'part']) assert.equal(typeof step[key], 'string', `${step.t}: ${key}`);
      assert.ok(step.explode >= 0 && step.explode <= 1, `${step.t}: explode ${step.explode}`);
      assert.ok(Array.isArray(step.focus) && step.focus.length > 0, `${step.t}: focus`);
    }
  });

  test(`${name}: every focused part is a real model part`, async () => {
    const mod = await import(`../${dir}/story.js`);
    const story = Object.values(mod).find(Array.isArray);
    const aliases = Object.entries(mod).find(([key]) => key.endsWith('ALIASES'))?.[1] ?? {};
    const source = readFileSync(`${dir}/main.js`, 'utf8');
    const parts = new Set([...source.matchAll(/\badd\('([\w-]+)'/g)].map(m => m[1]));
    assert.ok(parts.size > 0, 'main.js registers parts with add()');
    for (const step of story) for (const focus of step.focus) {
      assert.ok(parts.has(aliases[focus] ?? focus), `${step.t} focuses "${focus}", which main.js never adds`);
    }
  });

  test(`${name}: page header matches the story and uses the engine`, async () => {
    const story = Object.values(await import(`../${dir}/story.js`)).find(Array.isArray);
    const html = readFileSync(`${dir}/index.html`, 'utf8');
    assert.match(html, /<title>[^<]+ · How Shit Works<\/title>/);
    assert.match(html, new RegExp(`The story in ${story.length} steps`));
    for (const id of ['c', 'steps', 'play', 'explode', 'prev', 'next']) assert.match(html, new RegExp(`id="${id}"`), `#${id}`);
    assert.match(readFileSync(`${dir}/main.js`, 'utf8'), /src\/engine\//);
  });

  test(`${name}: is linked from the landing page`, () => {
    assert.match(landing, new RegExp(`href="/appliances/${name}"`));
  });
}
