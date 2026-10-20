import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AMP, KNOBS, bPlusPeak, bPlusAverage, ripple, bPlus, heaterWatts, stageGain, gm, gridBias, triode, headroom,
  taper, toneGain, dB, envelope, chain, outputWatts, overdrive, strum,
} from '../appliances/amplifier/amp.js';
import { AMP_STORY } from '../appliances/amplifier/story.js';

const near = (a, b, tol) => assert.ok(Math.abs(a - b) <= tol, `${a} is not within ${tol} of ${b}`);
const knobs = (over = {}) => ({ ...KNOBS, ...over });

test('a 12AX7 stage makes the signal about 60 times bigger and idles 1.35 V below the cathode', () => {
  near(stageGain(), 61.5, 0.1);
  near(gm() * 1e3, 1.6, 0.01);
  near(gridBias(), -1.35, 1e-9);
  near(triode(0.01), -0.615, 0.01);
});

test('the triode plate can only swing between about 60 V and its 250 V supply', () => {
  const plate = AMP.pre.plate;
  near(plate + triode(-10), AMP.pre.supply, 0.5);
  near(plate + triode(10), AMP.pre.floor, 0.5);
  near(headroom(), 90 / stageGain(), 1e-9);
});

test('the Bassman tone stack scoops the middle and each knob lifts its own band', () => {
  near(dB(toneGain(700, KNOBS)), -14.7, 0.3);
  assert.ok(dB(toneGain(110, KNOBS)) > -6 && dB(toneGain(5000, KNOBS)) > -6);
  assert.ok(toneGain(5000, knobs({ treble: 10 })) > toneGain(5000, knobs({ treble: 2 })));
  assert.ok(toneGain(700, knobs({ middle: 10 })) > toneGain(700, knobs({ middle: 0 })));
  assert.ok(toneGain(60, knobs({ bass: 10 })) > toneGain(60, knobs({ bass: 1 })));
});

test('the gain pot has an audio taper', () => {
  assert.equal(taper(0), 0);
  near(taper(5), 0.1, 1e-9);
  near(taper(10), 1, 1e-9);
});

test('the supply rectifies 2 × 335 V into about 450 V DC with a 100 Hz ripple', () => {
  near(bPlusPeak(), 453.8, 0.1);
  near(bPlusAverage(), 448.8, 0.1);
  near(ripple(), 10, 1e-9);
  let lo = Infinity, hi = -Infinity;
  for (let t = 0; t < 0.02; t += 1e-4) { lo = Math.min(lo, bPlus(t)); hi = Math.max(hi, bPlus(t)); }
  assert.ok(hi <= bPlusPeak() + 1e-9 && lo >= bPlusPeak() - ripple() - 0.5, `B+ swings ${lo.toFixed(1)} to ${hi.toFixed(1)} V`);
  near(heaterWatts(), 17, 0.1);
});

test('the second triode starts to clip past about 6 on the gain knob', () => {
  assert.ok(overdrive(knobs({ gain: 5 })) < 1);
  assert.ok(overdrive(knobs({ gain: 7 })) > 1);
  assert.ok(overdrive(knobs({ gain: 10 })) > overdrive(knobs({ gain: 8 })));
});

test('more gain makes more watts, up to about the rated 30 W and a little past it', () => {
  const watts = [3, 5, 7, 8, 10].map(gain => outputWatts(1, knobs({ gain })));
  watts.slice(1).forEach((w, i) => assert.ok(w > watts[i], `${w} W is not more than ${watts[i]} W`));
  assert.ok(watts[3] > 25 && watts[4] < 2 * AMP.power.ratedW, `${watts[3]} W and ${watts[4]} W`);
});

test('the push-pull tubes trade current: their product stays at idle squared', () => {
  for (const u of [0, 0.1, 0.27, 0.5, 0.81]) {
    const c = chain(u, 1, knobs({ gain: 8 }));
    near(c.ia * c.ib, AMP.power.idleA ** 2, 1e-9);
    near(c.ia - c.ib, 2 * c.is / AMP.power.turns, 1e-9);
    near(c.plateSwing, c.vs * AMP.power.turns / 2, 1e-9);
    assert.ok(c.ia > 0 && c.ib > 0);
  }
  let peak = 0;
  for (let i = 0; i < 100; i++) peak = Math.max(peak, chain(i / 100, 1, knobs({ gain: 10 })).ia);
  assert.ok(peak > 0.2, `peak plate current ${peak} A`);
});

test('the speaker never sees more than the supply allows', () => {
  const vMax = Math.sqrt(2 * AMP.power.ratedW * AMP.power.speaker);
  for (let i = 0; i < 100; i++) assert.ok(Math.abs(chain(i / 100, 1, knobs({ gain: 10 })).vs) < vMax);
});

test('a strum rises fast, fades over seconds and repeats', () => {
  assert.equal(envelope(-1), 0);
  assert.ok(envelope(0.05) > 0.9);
  assert.ok(envelope(2) < 0.2);
  const a = strum(0.1), b = strum(0.1 + AMP.strumS);
  near(a.level, b.level, 1e-9);
  assert.equal(b.count, a.count + 1);
});

test('the story follows the signal from the jack to the speaker', () => {
  assert.equal(AMP_STORY.length, 8);
  AMP_STORY.forEach((s, i) => i && assert.ok(s.reach >= AMP_STORY[i - 1].reach, `step ${i + 1} goes backward`));
  assert.ok(AMP_STORY.at(-1).focus.includes('speaker'));
});
