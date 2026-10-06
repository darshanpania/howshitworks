import test from 'node:test';
import assert from 'node:assert/strict';
import { CHIMNEY, airflowM3h, airSpeed, ductArea } from '../appliances/electric-chimney/airflow.js';

const near = (a, b, tol) => assert.ok(Math.abs(a - b) <= tol, `${a} is not within ${tol} of ${b}`);

test('with nothing in the way, top speed moves the rated 1,200 m³/h', () => {
  near(airflowM3h(3, 0, { free: true }), CHIMNEY.ratedM3h, 1e-6);
});

test('clean filters and the duct bring it down to about 900 m³/h', () => {
  near(airflowM3h(3, 0), 900, 5);
});

test('the same air is about 1 m/s at the filters and 14 m/s in the duct', () => {
  const q = airflowM3h(3, 0);
  near(airSpeed(q, CHIMNEY.filterM2), 1.16, 0.05);
  near(airSpeed(q, ductArea()), 14.1, 0.2);
});

test('airflow follows the blower speed', () => {
  for (const speed of [1, 2]) near(airflowM3h(speed) / airflowM3h(3), CHIMNEY.rpm[speed] / CHIMNEY.rpm[3], 1e-9);
  assert.equal(airflowM3h(0), 0);
});

test('oil-filled filters cut the flow by about 30%', () => {
  const clean = airflowM3h(3, 0), oily = airflowM3h(3, 1);
  near(oily, 630, 5);
  near(1 - oily / clean, 0.3, 0.02);
  assert.ok(airflowM3h(3, 0.5) < clean && airflowM3h(3, 0.5) > oily);
});
