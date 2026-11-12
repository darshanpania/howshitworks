import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BUD, TIP, CHIP, BATTERY, PITCHES, passive, headStart, lag, lateBy, antiGain, residual, active, bestCase, total,
  share, stroke, budWh, budMilliwatts, caseCharges, totalHours, showLength, pitchText, lossText,
} from '../appliances/noise-cancelling-earphones/anc.js';
import { EARPHONE_STORY } from '../appliances/noise-cancelling-earphones/story.js';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} ${a} is not ${b} ± ${tol}`);
const text = EARPHONE_STORY.map(s => s.d).join(' ');
const says = (phrase, why) => assert.ok(text.includes(phrase), `the story should say "${phrase}" (${why})`);

test('the tip stops the high notes and lets the low notes through', () => {
  near(passive(TIP.corner), 3.01, 0.01, 'the corner is the -3 dB point');
  assert.ok(passive(100) < 1);
  says('100 Hz engine rumble loses less than 1 dB', 'passive loss at 100 Hz');
  says(`4 kHz hiss reaches the eardrum ${Math.round(passive(4000))} dB quieter`, 'passive loss at 4 kHz');
  assert.equal(passive(1e6), TIP.limit);
  for (let i = 1; i < PITCHES.length; i++) assert.ok(passive(PITCHES[i]) > passive(PITCHES[i - 1]), 'the loss grows with pitch');
});

test('the outer microphone gives the chip a head start of about 41 µs', () => {
  near(headStart() * 1e6, 40.8, 0.1);
  says(`${BUD.path * 1000} mm to go to the speaker, which takes ${Math.round(headStart() * 1e6)} µs`, 'head start');
  says(`${CHIP.rate.toLocaleString('en-US')} times a second`, 'sample rate');
  says(`about ${CHIP.latency * 1e6} µs, so the anti-noise arrives about ${Math.round(lag() * 1e6)} µs late`, 'lag');
});

test('a late mirror image cancels low notes well and high notes badly', () => {
  says(`only ${lateBy(100).toFixed(1)}° of a cycle, and ${Math.round(active(100))} dB of the noise goes away`, '100 Hz');
  says(`At 1 kHz it is ${Math.round(lateBy(1000))}° late, and only ${Math.round(active(1000))} dB goes away`, '1 kHz');
  for (let i = 1; i < PITCHES.length; i++) assert.ok(active(PITCHES[i]) <= active(PITCHES[i - 1]), 'the active loss falls with pitch');
  // A perfect copy a sixth of a cycle late leaves as much as it met: the limit of any mirror image.
  near(Math.sqrt(2 - 2 * Math.cos(Math.PI / 3)), 1, 1e-12);
  // So the chip turns the anti-noise down up there, and it never makes the noise worse by much.
  says(`Above about ${CHIP.roll / 1000} kHz the chip turns the anti-noise down`, 'roll-off');
  assert.ok(antiGain(8000) < 0.02);
  for (const hz of PITCHES) assert.ok(residual(hz) < 1.01, `${hz} Hz: ${residual(hz)}`);
  assert.ok(active(8000) < 0.1);
});

test('the inner microphone keeps the level matched', () => {
  says(`level ${Math.round((1 - CHIP.loose) * 100)}% off, the bud can remove no more than ${Math.floor(bestCase(CHIP.loose))} dB`, 'loose fit');
  says(`level within ${Math.round((1 - CHIP.match) * 100)}%, it can remove ${Math.floor(bestCase(CHIP.match))} dB`, 'trimmed');
  assert.ok(active(100, CHIP.loose) < bestCase(CHIP.loose));
  assert.ok(active(100) > active(100, CHIP.loose) + 15);
});

test('tip and chip together take more than 20 dB off every pitch', () => {
  const least = Math.min(...PITCHES.map(hz => total(hz)));
  assert.ok(least > 20, `least ${least}`);
  says('more than 20 dB at every pitch', 'total');
  assert.equal(total(100, false), passive(100));
  near(share(20), 0.1, 1e-12);
});

test('the diaphragm moves a few tens of nanometres', () => {
  near(stroke(80) * 1e9, 40.8, 0.2);
  says(`about ${BUD.canal * 1e6} cm³ of air`, 'canal volume');
  says(`an 80 dB rumble the diaphragm moves only ±${Math.round(stroke(80) * 1e9)} nm`, 'stroke');
  says(`a speaker ${BUD.driver * 1000} mm wide`, 'driver size');
  says(`about ${Math.round(BUD.grams)} g`, 'weight');
});

test('the battery and the case', () => {
  near(budWh(), 0.19, 1e-9);
  says(`holds ${budWh()} Wh`, 'bud cell');
  says(`about ${Math.round(budMilliwatts())} mW`, 'power');
  says(`lasts ${BATTERY.hours} hours`, 'hours');
  assert.equal(BATTERY.caseMah / BATTERY.mAh, 10);
  says(`charges both buds ${caseCharges()} more times, for ${totalHours()} hours in total`, 'case');
});

test('readout text and the drawn waves', () => {
  assert.equal(pitchText(125), '125 Hz');
  assert.equal(pitchText(2500), '2.5 kHz');
  assert.equal(lossText(22.6), '−23 dB');
  assert.equal(lossText(0.2), '0 dB');
  assert.ok(showLength(PITCHES[0]) > showLength(PITCHES.at(-1)));
  // Every step's pitch is on the slider.
  for (const s of EARPHONE_STORY) assert.ok(PITCHES[s.pitch], s.t);
});
