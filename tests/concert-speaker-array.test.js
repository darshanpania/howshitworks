import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BOX, HANG, GUIDE, DRIVERS, PORT, CROSSOVER, LEVEL, RHO, band, wavelength, portTuning, travel, hang, landing,
  coverage, coverageSpread, pointLoss, lineLoss, nearField, travelText, pitchText, lengthText,
} from '../appliances/concert-speaker/array.js';
import { SPEAKER_STORY } from '../appliances/concert-speaker/story.js';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} ${a} is not ${b} ± ${tol}`);
const text = SPEAKER_STORY.map(s => s.d).join(' ');
const says = (phrase, why) => assert.ok(text.includes(phrase), `the story should say "${phrase}" (${why})`);

test('the crossover sends each pitch to one kind of driver', () => {
  assert.equal(band(40), 'woofers');
  assert.equal(band(CROSSOVER.low - 1), 'woofers');
  assert.equal(band(CROSSOVER.low), 'mids');
  assert.equal(band(CROSSOVER.high), 'highs');
  assert.equal(band(16000), 'highs');
  near(wavelength(343), 1, 1e-9);
  assert.equal(lengthText(wavelength(80)), '4.3 m');
  assert.equal(pitchText(1600), '1.6 kHz');
});

test('the port and its chamber resonate at about 49 Hz', () => {
  near(portTuning(), 49.4, 0.3);
  says(`resonate at about ${Math.round(portTuning())} Hz`, 'port tuning');
  says(`${Math.round(PORT.volume * 1000)}-litre chamber`, 'chamber volume');
});

test('low notes need long strokes, and the port takes over at its tuning', () => {
  const at80 = travel(80), at40 = travel(40), at50 = travel(50);
  assert.equal(at80.key, 'woofers');
  says(`±${(at80.x * 1000).toFixed(1)} mm at 80 Hz`, 'woofer travel at 80 Hz');
  assert.ok(at40.x * 1000 > DRIVERS.woofers.xmax, 'at 40 Hz the cone would pass its limit');
  says(`±${(at40.x * 1000).toFixed(1)} mm, past their ±${DRIVERS.woofers.xmax} mm limit`, 'woofer travel at 40 Hz');
  // Near the tuning the cone moves less than at 80 Hz, though the note is lower.
  assert.ok(at50.x < at80.x);
  says(`cone needs only ±${(at50.x * 1000).toFixed(1)} mm`, 'woofer travel at 50 Hz');
  says(`about ${Math.round(at50.port)} m/s`, 'port air speed at 50 Hz');
  // A sealed box: the cones alone move all the air, so the stroke goes as 1 / f².
  const push = 20e-6 * 10 ** (LEVEL / 20) * Math.SQRT2 * 4 * Math.PI / RHO;
  const sealed = push / (DRIVERS.woofers.count * DRIVERS.woofers.sd * (2 * Math.PI * 50) ** 2);
  says(`sealed box would need ±${Math.round(sealed * 1000)} mm`, 'sealed-box travel at 50 Hz');
  // Well above the tuning the port no longer helps: an octave down needs nearly four times the stroke.
  assert.ok(travel(100).x / travel(200).x > 3, 'an octave down needs more than three times the stroke');
});

test('the compression drivers move a few µm', () => {
  const t = travel(4000);
  assert.equal(t.key, 'highs');
  assert.equal(travelText(t.x), '±4 µm');
  says('at 4 kHz it moves only about ±4 µm', 'dome travel');
  assert.ok(t.x * 1000 < DRIVERS.highs.xmax);
});

test('the waveguide slot fills more than 80% of the box height', () => {
  assert.ok(GUIDE.slot / BOX.height > 0.8);
  says(`${Math.round(GUIDE.slot * 100)} cm tall and ${Math.round(GUIDE.width * 100)} cm wide`, 'slot size');
  says(`${Math.round(GUIDE.throat * 1000)} mm wide`, 'throat');
});

test('the hang: 12 boxes linked at the front, bending into a J', () => {
  const boxes = hang();
  assert.equal(boxes.length, HANG.boxes);
  assert.equal(boxes[0].top[0], HANG.trim);
  // Every pin angle fits the box's taper, and the splay grows down the hang.
  HANG.splay.forEach((a, i) => {
    assert.ok(a <= 2 * BOX.taper, `splay ${i}`);
    if (i) assert.ok(a >= HANG.splay[i - 1], 'splay grows toward the bottom');
  });
  for (let i = 1; i < boxes.length; i++) {
    const a = boxes[i - 1].aim * Math.PI / 180;
    near(boxes[i].top[0], boxes[i - 1].top[0] - BOX.height * Math.cos(a), 1e-9, 'front corners meet');
    near(boxes[i].top[1], boxes[i - 1].top[1] - BOX.height * Math.sin(a), 1e-9, 'front corners meet');
  }
  near(boxes.at(-1).aim, HANG.site + HANG.splay.reduce((s, a) => s + a, 0), 1e-9);
  // Top boxes aim past the back of the crowd, bottom boxes at the front rows.
  assert.ok(landing(boxes[0]) > HANG.back);
  assert.ok(landing(boxes.at(-1)) < HANG.front);
  for (let i = 1; i < boxes.length; i++) assert.ok(landing(boxes[i]) < landing(boxes[i - 1]));
  says(`${HANG.boxes} boxes, each ${BOX.width} m wide and about ${BOX.kg} kg`, 'box size');
  says(`top is ${HANG.trim} m above the floor`, 'trim height');
  says(`from ${HANG.splay[0]}° at the top to ${HANG.splay.at(-1)}° at the bottom`, 'splay range');
  says(`one line of sound ${(HANG.boxes * BOX.height).toFixed(1)} m tall`, 'line height');
});

test('the J spreads the level evenly from the front rows to the back', () => {
  const spread = coverageSpread();
  assert.ok(spread < 6.5, `J: ${spread} dB from front to back`);
  says(`by only about ${Math.round(spread)} dB from ${HANG.front} m to ${HANG.back} m`, 'J coverage');
  // A straight column of the same boxes leaves the front rows in a hole.
  const straight = hang(0), mean = (a, b, boxes) => { let s = 0, n = 0; for (let z = a; z <= b; z += 0.5) { s += coverage(z, 0, boxes); n++; } return s / n; };
  assert.ok(mean(20, 30, straight) - mean(HANG.front, 10, straight) > 15, 'straight: front rows more than 15 dB down');
  says('more than 15 dB quieter', 'straight column');
  // Off to the side, the 90° horn still covers the crowd.
  assert.ok(coverage(20, 0) - coverage(20, 9) < 6);
  near(pointLoss(HANG.front, HANG.back), 18, 0.1);
  says(`one box alone would lose ${Math.round(pointLoss(HANG.front, HANG.back))} dB`, 'point source');
});

test('a line loses half as much per doubling as a point, out to its near-field limit', () => {
  near(pointLoss(10, 20), 6.02, 0.01);
  near(lineLoss(10, 20), 3.01, 0.01);
  says('loses 6 dB each time the distance doubles', 'point source');
  says('loses only 3 dB', 'line source');
  const reach = nearField(2000, HANG.boxes * BOX.height);
  assert.ok(reach > HANG.back, 'at 2 kHz the line is still a line at the back of the crowd');
  says(`about ${Math.round(reach / 5) * 5} m`, 'near field at 2 kHz');
});
