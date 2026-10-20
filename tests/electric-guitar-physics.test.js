import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GUITAR, STRINGS, PERIOD, SWITCH, noteName, stringHz, stringNote, speaking, fretFromNut, tensionKg,
  modes, response, resonance, signal, volts, peak, brightness, play,
} from '../appliances/electric-guitar/guitar.js';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} ${a} is not ${b} ± ${tol}`);

test('standard tuning: E2 A2 D3 G3 B3 E4, low E at 82.4 Hz', () => {
  assert.deepEqual(STRINGS.map((_, i) => stringNote(i)), ['E2', 'A2', 'D3', 'G3', 'B3', 'E4']);
  near(stringHz(0), 82.41, 0.01);
  near(stringHz(5), 329.63, 0.01);
  assert.equal(noteName(69), 'A4');
});

test('a 10-46 set pulls about 7 to 9 kg a string, 47 kg in all', () => {
  // Published tensions for this set, in kg: 7.94, 8.85, 8.35, 7.53, 6.99, 7.35.
  [7.94, 8.85, 8.35, 7.53, 6.99, 7.35].forEach((kg, i) => near(tensionKg(i), kg, 0.05, STRINGS[i].name));
  near(STRINGS.reduce((s, _, i) => s + tensionKg(i), 0), 47, 0.2);
});

test('each fret is a semitone; the 12th halves the string and doubles the pitch', () => {
  near(speaking(12), GUITAR.scale / 2, 1e-9);
  near(fretFromNut(12), 32.385, 0.001);
  near(fretFromNut(1), 3.636, 0.001, 'the first fret is 36 mm from the nut');
  near(stringHz(0, 12), 2 * stringHz(0), 1e-9);
  assert.equal(stringNote(0, 12), 'E3');
  assert.equal(stringNote(0, 5), stringNote(1), 'the 5th fret of E is the open A');
  for (let n = 1; n <= GUITAR.frets; n++) near(speaking(n - 1) / speaking(n), 2 ** (1 / 12), 1e-12);
});

test('a pluck is a triangle: harmonics fall as 1/n² and the pick point has none', () => {
  const m = modes(0);
  assert.ok(m[0].amp > 0 && m[0].amp < GUITAR.pull);
  // Sum of the modes at the pick point gives back the pull.
  const atPick = m.reduce((s, h) => s + h.amp * Math.sin(h.n * Math.PI * GUITAR.pluck / speaking(0)), 0);
  near(atPick, GUITAR.pull, 0.004);
  for (let k = 1; k < m.length; k++) assert.ok(m[k].tau < m[k - 1].tau, 'higher harmonics die sooner');
});

test('coil inductance and cable capacitance peak near 4 kHz; tone at 0 drops it below 1 kHz', () => {
  const open = resonance(4, 10), shut = resonance(4, 0);
  assert.ok(open.hz > 3500 && open.hz < 5000, `${open.hz} Hz`);
  assert.ok(open.gain > 1.2, 'a small boost at the peak');
  assert.ok(shut.hz > 500 && shut.hz < 900, `${shut.hz} Hz`);
  const h = response(100, 4, 10);
  near(Math.hypot(h.re, h.im), 1, 0.05, 'lows pass straight through');
  assert.ok(Math.hypot(...Object.values(response(8000, 4, 0))) < 0.05, 'highs go to ground with the tone down');
});

test('a plucked low E gives a couple of hundred millivolts at the jack', () => {
  const v = peak(signal({ pos: 4 }), 0, 0);
  assert.ok(v > 0.08 && v < 0.4, `${v} V`);
  for (let i = 0; i < 6; i++) {
    const s = peak(signal({ string: i }), 0, 0);
    assert.ok(s > 0.08 && s < 0.4, `${STRINGS[i].name}: ${s} V`);
  }
  const later = peak(signal({ pos: 4 }), GUITAR.sustain, GUITAR.sustain);
  assert.ok(later < v * 0.5, 'the note dies away');
});

test('the neck pickup sounds warmer than the bridge pickup', () => {
  const neck = signal({ pos: 4 }), bridge = signal({ pos: 0 });
  assert.ok(brightness(bridge) > 1.8 * brightness(neck));
  const share = s => Math.abs(s.harmonics[0].volts) / s.harmonics.reduce((a, h) => a + Math.abs(h.volts), 0);
  assert.ok(share(neck) > 2 * share(bridge), 'the neck hears more of the fundamental');
  assert.ok(brightness(signal({ pos: 4, tone: 0 })) < brightness(neck), 'turning the tone down darkens it');
});

test('the reverse-wound middle pickup cancels hum in positions 2 and 4', () => {
  const hums = SWITCH.map((_, pos) => signal({ pos }).hum);
  assert.deepEqual(hums.map(h => Math.abs(h) > 0), [true, false, true, false, true]);
  // With the strings still, only the hum is left.
  const still = s => ({ ...s, harmonics: [] });
  near(volts(still(signal({ pos: 3 })), 0, 0.005), 0, 1e-12);
  assert.ok(Math.abs(volts(still(signal({ pos: 4 })), 0, 0.005)) > 0.01);
  // The string's own signal adds: two coils give at least as much as the weaker one alone.
  const tone = s => s.harmonics[0].volts;
  assert.ok(tone(signal({ pos: 3 })) >= Math.min(tone(signal({ pos: 2 })), tone(signal({ pos: 4 }))));
});

test('the story modes: strum each string, step the switch, sweep the tone', () => {
  assert.deepEqual([0, 1.5, 3, 7.2].map(t => play('strum', t).string), [0, 1, 2, 5]);
  assert.deepEqual([0, 2.5, 5, 7.3, 9.7].map(t => play('switch', t).pos), [4, 3, 2, 1, 0]);
  assert.deepEqual([0.5, 3.5].map(t => play('hum', t).pos), [4, 3]);
  assert.equal(play('tone', 1).tone, 10);
  assert.equal(play('tone', 4).tone, 0);
  near(play('tone', 3.5).since, 0.5, 1e-9);
  for (const [mode, s] of Object.entries(PERIOD)) assert.ok(play(mode, s - 0.01).since < 3, mode);
});
