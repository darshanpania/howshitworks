import test from 'node:test';
import assert from 'node:assert/strict';
import { MIXER, motorRpm, tipSpeedKmh, reversalsPerSecond, seriesTorque, ratedAmps } from '../appliances/mixer-grinder/motor.js';

const near = (a, b, tol) => assert.ok(Math.abs(a - b) <= tol, `${a} is not within ${tol} of ${b}`);

test('speed 3 runs at 18,000 rpm, off is still, and each speed is faster', () => {
  assert.equal(motorRpm(0), 0);
  near(motorRpm(3), 18000, 1e-9);
  assert.ok(motorRpm(1) < motorRpm(2) && motorRpm(2) < motorRpm(3));
});

test('fewer field turns make a weaker field and a faster motor', () => {
  for (let s = 1; s < 3; s++) assert.ok(MIXER.fieldTurns[s + 1] < MIXER.fieldTurns[s]);
  near(motorRpm(1) * MIXER.fieldTurns[1], motorRpm(3) * MIXER.fieldTurns[3], 1e-6);
});

test('a full jar slows the motor', () => {
  assert.ok(motorRpm(3, 1) < motorRpm(3, 0));
  near(motorRpm(3, 1), 18000 * (1 - MIXER.loadDrop), 1e-9);
});

test('a 76 mm blade at 18,000 rpm moves its tips at about 260 km/h', () => {
  near(tipSpeedKmh(18000), 258, 1);
  assert.equal(tipSpeedKmh(0), 0);
});

test('50 Hz mains reverses 100 times a second', () => {
  assert.equal(reversalsPerSecond(MIXER.mainsHz), 100);
});

test('in a series motor the torque never reverses on AC', () => {
  let sum = 0;
  const n = 1000;
  for (let i = 0; i < n; i++) {
    const torque = seriesTorque(i / n / MIXER.mainsHz);
    assert.ok(torque >= 0);
    sum += torque;
  }
  near(sum / n, 0.5, 1e-6); // i² averages to half its peak over a cycle
});

test('750 W on 230 V draws about 3.3 A', () => {
  near(ratedAmps(), 3.26, 0.01);
});
