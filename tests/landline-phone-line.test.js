import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LINE, DIAL, PERIOD, DIGITS, wireOhmsPerKm, loopOhms, loopCurrent, ringPeakMA, ringOn,
  pulsesFor, dialTurn, holeAngle, dialPose, digitTime, voice, phone,
} from '../appliances/landline-phone/line.js';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} ${a} is not ${b} ± ${tol}`);

test('0.5 mm copper is about 88 Ω per km, out and back', () => {
  near(wireOhmsPerKm(), 87.6, 0.1);
  near(loopOhms(3), 525.6, 0.5);
});

test('off hook on 3 km of pair: about 43 mA and 8.5 V at the phone', () => {
  const p = phone('talk', 3); // between phrases, so the carbon is at rest
  assert.ok(p.push === 0);
  near(p.mA, 42.6, 0.1);
  near(p.volts, 8.5, 0.05);
  assert.equal(p.status, 'Connected');
});

test('a longer line carries less current', () => {
  near(loopCurrent(1), 61.9, 0.1);
  near(loopCurrent(5), 32.5, 0.1);
  for (let km = 1; km < 5; km++) assert.ok(loopCurrent(km + 1) < loopCurrent(km));
});

test('on hook, the loop is open: no current and the full 48 V', () => {
  const p = phone('idle', 1);
  assert.equal(p.off, false);
  assert.equal(p.mA, 0);
  assert.equal(p.volts, LINE.battery);
  assert.equal(p.status, 'Waiting');
});

test('lifting the handset closes the loop and brings the dial tone', () => {
  assert.equal(phone('lift', 0.5).off, false);
  const up = phone('lift', 3);
  assert.equal(up.off, true);
  assert.ok(up.mA > 40);
  assert.equal(up.status, 'Dial tone');
  assert.equal(up.tone, true);
  assert.equal(phone('lift', PERIOD.lift - 0.05).off, false, 'the handset is back down at the end');
});

test('the ring is 75 V AC at 25 Hz, ring-ring then a pause', () => {
  near(ringPeakMA(3), 12.4, 0.1);
  assert.ok(ringOn(0.1) && !ringOn(0.5) && ringOn(0.7) && !ringOn(1.5) && ringOn(3.1));
  let lo = 0, hi = 0;
  for (let t = 0; t < 0.4; t += 0.001) { const { mA } = phone('ring', t); lo = Math.min(lo, mA); hi = Math.max(hi, mA); }
  near(hi, 12.4, 0.1); near(lo, -12.4, 0.1);
  assert.equal(phone('ring', 1.5).mA, 0, 'no current in the pause');
  assert.equal(phone('ring', 1.5).status, 'Ringing you');
});

test('the dial opens the loop once per pulse, 60 ms each, and 0 sends 10', () => {
  assert.equal(pulsesFor(0), 10);
  for (const digit of [1, 5, 0]) {
    const n = pulsesFor(digit);
    assert.equal(holeAngle(digit), DIAL.stop + dialTurn(n));
    let opens = 0, openTime = 0, was = false, last;
    const dt = 0.0005;
    for (let t = 0; t < digitTime(n); t += dt) {
      last = dialPose(n, t);
      if (last.open && !was) opens++;
      if (last.open) openTime += dt;
      was = last.open;
    }
    assert.equal(opens, n, `digit ${digit}`);
    near(openTime / n, 0.06, 0.002, `break per pulse for ${digit}`);
    assert.equal(last.sent, n);
    assert.equal(last.angle, 0, 'the dial comes back to rest');
  }
});

test('the exchange counts the pulses: dial tone, 5, then 0', () => {
  const seen = [];
  for (let t = 0; t < PERIOD.dial; t += 0.002) {
    const s = phone('dial', t).status;
    if (seen.at(-1) !== s) seen.push(s);
  }
  assert.deepEqual(DIGITS, [5, 0]);
  assert.deepEqual(seen, [
    'Dial tone', 'Counting 1', 'Counting 2', 'Counting 3', 'Counting 4', 'Counting 5', 'Got 5',
    ...Array.from({ length: 10 }, (_, i) => `Counting ${i + 1}`), 'Got 5 0', 'Connecting',
  ]);
  for (let t = 0; t < PERIOD.dial; t += 0.002) {
    const p = phone('dial', t);
    if (p.open) assert.equal(p.mA, 0, 'no current while the pulse contacts are open');
  }
});

test('squeezing the carbon lowers its resistance and raises the current', () => {
  let lo = Infinity, hi = 0;
  for (let t = 0; t < PERIOD.talk; t += 0.002) {
    const p = phone('talk', t);
    assert.ok(Math.abs(p.push) <= 1);
    if (p.push > 0.2) assert.ok(p.mA > loopCurrent(), 'a push in raises the current');
    lo = Math.min(lo, p.mA); hi = Math.max(hi, p.mA);
  }
  assert.ok(hi - lo > 2 && hi - lo < 8, `the voice swings the current by ${hi - lo} mA`);
});

test('the far voice arrives as a small change on the same current', () => {
  for (let t = 0; t < PERIOD.listen; t += 0.01) {
    const p = phone('listen', t);
    near(p.mA, loopCurrent() + voice(t, 1.7) * LINE.farMA, 1e-9);
  }
});
