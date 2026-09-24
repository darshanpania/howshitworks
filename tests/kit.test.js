import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createMaterials, linear, LOOKS } from '../src/kit/materials.js';
import { helixCurve, springGeometry, roundedRect, lathe } from '../src/kit/shapes.js';
import { heatColor } from '../src/kit/effects.js';

test('materials start from a look and accept overrides', () => {
  const M = createMaterials({ a: 'steel', b: { look: 'copper', roughness: 0.9 }, c: { color: 0x123456 } });
  assert.equal(M.a.color.getHex(), LOOKS.steel.color);
  assert.equal(M.b.roughness, 0.9);
  assert.equal(M.b.metalness, LOOKS.copper.metalness);
  assert.equal(M.c.color.getHex(), 0x123456);
});

test('each call makes fresh materials', () => {
  assert.notEqual(createMaterials({ a: 'steel' }).a, createMaterials({ a: 'steel' }).a);
});

test('a PBR stage gets linear colours', () => {
  const M = createMaterials({ a: { color: 0x808080 } }, { pbr: true });
  assert.ok(Math.abs(M.a.color.r - linear(0x808080).r) < 1e-9);
  assert.ok(M.a.color.r < 0.25, 'linear 0x80 is about 0.22');
});

test('an unknown look fails loudly', () => {
  assert.throws(() => createMaterials({ a: 'unobtainium' }), /Unknown look/);
});

test('a helix is centred and has the requested length and radius', () => {
  const curve = helixCurve(2, 5, 0.3, 'y');
  assert.ok(Math.abs(curve.getPoint(0).y + 1) < 1e-9);
  assert.ok(Math.abs(curve.getPoint(1).y - 1) < 1e-9);
  const p = curve.getPoint(0.37);
  assert.ok(Math.abs(Math.hypot(p.x, p.z) - 0.3) < 1e-9);
});

test('a spring starts at y = 0 and is as tall as asked', () => {
  const geo = springGeometry(1.5); geo.computeBoundingBox();
  const { min, max } = geo.boundingBox;
  assert.ok(Math.abs(min.y) < 0.05 && Math.abs(max.y - 1.5) < 0.05, `${min.y}..${max.y}`);
});

test('rounded rectangles and lathes produce geometry', () => {
  assert.ok(roundedRect(2, 1, 0.2).getPoints().length > 8);
  const mesh = lathe([[0, 0], [1, 0], [1, 1]], new THREE.MeshStandardMaterial());
  assert.ok(mesh.geometry.attributes.position.count > 0);
});

test('heat colour goes from black to orange', () => {
  const c = new THREE.Color();
  assert.equal(heatColor(0, c).getHex(), 0x000000);
  heatColor(1, c);
  assert.ok(c.r > c.g && c.g > c.b, 'orange: red > green > blue');
});
