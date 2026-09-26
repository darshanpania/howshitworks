import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createParts, looksInside } from '../src/engine/parts.js';
import { attachOrbit } from '../src/engine/stage.js';

function fakeCanvas() {
  const handlers = {};
  return {
    style: {},
    addEventListener: (type, fn) => { handlers[type] = fn; },
    setPointerCapture() {},
    fire: (type, e = {}) => handlers[type]({ preventDefault() {}, ...e }),
  };
}
const mesh = () => new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ color: 0xff0000 }));

test('parts move from home along their offset as the explode amount grows', () => {
  const { parts, add, explode } = createParts(new THREE.Group());
  add('lid', mesh(), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 2, 0));
  explode(0.5);
  assert.deepEqual(parts.lid.group.position.toArray(), [0, 2, 0]);
});

test('update reapplies focus while the explode amount animates', () => {
  const { parts, add, update } = createParts(new THREE.Group());
  add('shell', mesh(), new THREE.Vector3(), new THREE.Vector3(0, 1, 0));
  const state = { explode: 0, targetExplode: 1, focus: [] };
  const style = { opacity: () => (state.explode > 0.5 ? 0.2 : 1) };
  update(state, style, 0.3);
  assert.equal(parts.shell.meshes[0].material.opacity, 1);
  update(state, style, 0.3);
  assert.ok(state.explode > 0.5);
  assert.equal(parts.shell.meshes[0].material.opacity, 0.2);
  assert.equal(parts.shell.meshes[0].material.depthWrite, false);
});

test('focus gives each mesh its own material and highlights only focused parts', () => {
  const shared = new THREE.MeshStandardMaterial({ color: 0x336699 });
  const { parts, add, applyFocus } = createParts(new THREE.Group());
  add('a', new THREE.Mesh(new THREE.BoxGeometry(), shared), new THREE.Vector3(), new THREE.Vector3());
  add('b', new THREE.Mesh(new THREE.BoxGeometry(), shared), new THREE.Vector3(), new THREE.Vector3());
  applyFocus(['a'], { highlight: 0.3 });
  const [a, b] = [parts.a.meshes[0].material, parts.b.meshes[0].material];
  assert.notEqual(a, shared); assert.notEqual(a, b);
  assert.equal(a.emissiveIntensity, 0.3);
  assert.equal(b.emissiveIntensity, 0);
});

test('a step looks inside only when it cuts the case or pulls the parts apart', () => {
  assert.equal(looksInside({ cut: false, explode: 0 }), false);
  assert.equal(looksInside({ cut: true, explode: 0 }), true);
  assert.equal(looksInside({ cut: false, explode: 0.35 }), true);
});

test('the intro shows the appliance whole, then gives the step its focus back', () => {
  const { parts, add, update } = createParts(new THREE.Group(), { lively: true });
  add('shell', mesh(), new THREE.Vector3(), new THREE.Vector3());
  const state = { explode: 0, targetExplode: 0, focus: ['cord'], cut: true };
  const style = { opacity: (name, m, hot) => (state.focus.length && !hot ? 0.3 : 1) };
  update(state, style, 0.09, 1 / 60);
  assert.equal(parts.shell.meshes[0].material.opacity, 1, 'solid while the intro plays');
  assert.deepEqual(state.focus, ['cord']);
  assert.equal(state.cut, true);
});

test('orbit drag stops after a cancelled touch', () => {
  const canvas = fakeCanvas(), cam = { theta: 0, phi: 1, r: 10 };
  attachOrbit(canvas, cam);
  canvas.fire('pointerdown', { pointerId: 1, clientX: 0, clientY: 0 });
  canvas.fire('pointercancel', { pointerId: 1 });
  canvas.fire('pointermove', { pointerId: 1, clientX: 100, clientY: 100 });
  assert.equal(cam.theta, 0);
});

test('two-finger pinch zooms within the limits', () => {
  const canvas = fakeCanvas(), cam = { theta: 0, phi: 1, r: 10 };
  attachOrbit(canvas, cam, { zoom: [5, 16] });
  canvas.fire('pointerdown', { pointerId: 1, clientX: 0, clientY: 0 });
  canvas.fire('pointerdown', { pointerId: 2, clientX: 100, clientY: 0 });
  canvas.fire('pointermove', { pointerId: 2, clientX: 200, clientY: 0 });
  assert.equal(cam.r, 5);
  assert.equal(cam.theta, 0, 'a pinch must not also orbit');
});
