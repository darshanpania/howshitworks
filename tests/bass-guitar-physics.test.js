import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BASS, PERIOD, FRET_CYCLE, noteHz, noteName, speakingLength, fretDistance, stringHz, waveSpeed,
  massPerMetre, totalTension, pluckModes, stringOffset, pulledOffset, response, trebleCutoff,
  pickupVolts, coilFor, hum, relief, bass,
} from '../appliances/bass-guitar/bass.js';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} ${a} is not ${b} ± ${tol}`);
const peak = (i, fret, opts = {}) => {
  const modes = pluckModes(), f = stringHz(i, fret);
  let m = 0;
  for (let k = 0; k < 800; k++) m = Math.max(m, Math.abs(pickupVolts(i, fret, modes, k / f / 800, 0, opts)));
  return m;
};

test('standard tuning is E1 A1 D2 G2: 41, 55, 73 and 98 Hz', () => {
  assert.deepEqual(BASS.strings.map(s => noteName(s.midi)), ['E1', 'A1', 'D2', 'G2']);
  [41.2, 55, 73.4, 98].forEach((hz, i) => near(stringHz(i), hz, 0.05));
  near(noteHz(69), 440, 1e-9);
  assert.equal(noteName(29), 'F1');
  assert.equal(noteName(30), 'F♯1');
});

test('each fret is one semitone; the 12th fret halves the string and doubles the pitch', () => {
  near(fretDistance(12), BASS.scale / 2, 1e-12);
  near(stringHz(0, 12), 2 * stringHz(0), 1e-9);
  near(speakingLength(1) / speakingLength(0), 0.9439, 0.0001);
  near(stringHz(0, 5), stringHz(1), 1e-9, 'E at the 5th fret is the open A');
  // The frets get closer together toward the body.
  for (let n = 1; n < BASS.frets; n++) assert.ok(fretDistance(n + 1) - fretDistance(n) < fretDistance(n) - fretDistance(n - 1));
});

test('the strings pull with about 800 N, the weight of 81 kg', () => {
  near(totalTension(), 795, 1);
  near(totalTension() / 9.81, 81, 0.1);
  // v = 2Lf = √(T/μ): the E string's wave runs at 71 m/s and the string weighs about 39 g a metre.
  near(waveSpeed(0), 71.2, 0.1);
  near(massPerMetre(0) * 1000, 39.4, 0.1);
  near(Math.sqrt(BASS.strings[3].tension / massPerMetre(3)), waveSpeed(3), 1e-9);
  // Heavier strings are lower: mass per metre falls from E to G.
  for (let i = 1; i < 4; i++) assert.ok(massPerMetre(i) < massPerMetre(i - 1));
});

test('released from rest, the sum of harmonics starts as the pulled V and stays fixed at the ends', () => {
  const modes = pluckModes();
  for (const u of [0.1, 0.2, 0.5, 0.8]) near(stringOffset(modes, u, 0), pulledOffset(u, 1), 0.00006, `u = ${u}`);
  near(stringOffset(modes, 0, 1.3, 0.5), 0, 1e-12);
  near(Math.abs(stringOffset(modes, 1, 0.7, 0.2)), 0, 1e-12);
  // Half a cycle later the V is on the other side.
  near(stringOffset(modes, 0.5, Math.PI), -stringOffset(modes, 0.5, 0), 1e-9);
});

test('a pluck near the saddle has more high harmonics than one near the middle', () => {
  const share = modes => Math.hypot(...modes.slice(4)) / Math.hypot(...modes);
  assert.ok(share(pluckModes(0.1)) > 2 * share(pluckModes(0.4)));
  // A pluck in the middle leaves out every even harmonic.
  near(pluckModes(0.5)[1], 0, 1e-12);
});

test('a firm pluck makes about 200 mV on every string', () => {
  for (let i = 0; i < 4; i++) near(peak(i, 0), 0.205, 0.015, BASS.strings[i].name);
  // The same pluck higher up the neck moves faster, so the voltage rises.
  assert.ok(peak(0, 12) > peak(0, 0) * 1.5);
  // Volume down to half halves the voltage.
  near(peak(0, 0, { vol: 0.5 }), peak(0, 0) / 2, 1e-9);
});

test('each pickup half sits under two strings', () => {
  assert.equal(coilFor(0), BASS.coils[0]);
  assert.equal(coilFor(1), BASS.coils[0]);
  assert.equal(coilFor(2), BASS.coils[1]);
  assert.equal(coilFor(3), BASS.coils[1]);
});

test('the tone knob moves the treble cut from about 4 kHz down to about 400 Hz', () => {
  near(trebleCutoff(1), 4000, 300);
  near(trebleCutoff(0), 400, 50);
  for (let t = 0; t < 1; t += 0.25) assert.ok(trebleCutoff(t) < trebleCutoff(t + 0.25));
  // The low notes pass either way; the treble does not.
  near(response(41, 0), response(41, 1), 0.06);
  assert.ok(response(2000, 0) < 0.05 && response(2000, 1) > 0.9);
});

test('hum is the same in both halves but cancels at the output', () => {
  for (const tau of [0.001, 0.004, 0.013]) {
    const h = hum(tau);
    near(h.a, -h.b, 1e-15);
    assert.equal(h.out, 0);
  }
  near(Math.max(...Array.from({ length: 100 }, (_, k) => hum(k / 5000).a)), BASS.humMV / 1000, 0.0005);
});

test('the strings bow the neck and a turn of the truss rod takes the bow back out', () => {
  near(relief(1, 0), 1.3, 1e-12);
  near(relief(1, 1), 0.3, 1e-12);
  near(relief(0, 0), 0, 1e-12);
  const at = t => bass('truss', t);
  near(at(0).relief, 0, 1e-9, 'slack at the start');
  near(at(3).relief, 1.3, 0.01, 'full pull, rod loose');
  near(at(6.5).relief, 0.3, 0.01, 'rod tightened one turn');
  assert.ok(at(7.95).relief < 0.05, 'eases back to slack before the loop restarts');
  assert.equal(PERIOD.truss, 8);
});

test('the story plucks: four open strings in turn, then the E string again and again', () => {
  const tune = bass('tune', 3);
  assert.deepEqual(tune.strings.map(s => s.age != null), [true, true, true, true]);
  assert.equal(tune.last, 3);
  assert.ok(tune.strings.every(s => s.fret === 0));
  const pluck = bass('pluck', 1, { fret: 7 });
  assert.equal(pluck.last, 0);
  assert.equal(pluck.strings[0].fret, 7);
  assert.equal(pluck.strings[3].age, null);
  // Just before each release the finger draws the string aside.
  assert.ok(bass('pluck', PERIOD.pluck + 0.5).strings[0].pull > 0.5);
  // Before the first release nothing rings yet.
  assert.equal(bass('pluck', 0.1).last, -1);
});

test('fret mode walks up the neck unless the reader picks a fret', () => {
  const frets = FRET_CYCLE.map((_, k) => bass('fret', 1 + k * PERIOD.fret, { fret: null }).strings[0].fret);
  assert.deepEqual(frets, FRET_CYCLE);
  assert.equal(bass('fret', 1 + 2 * PERIOD.fret, { fret: 9 }).strings[0].fret, 9);
  // The finger moves to the next fret while it draws the next pluck.
  assert.equal(bass('fret', PERIOD.fret + 0.5, { fret: null }).strings[0].fret, FRET_CYCLE[1]);
});

test('hum mode plucks the E string, then the G string: one on each half', () => {
  assert.equal(bass('hum', 2).last, 0);
  assert.equal(bass('hum', 4).last, 3);
});
