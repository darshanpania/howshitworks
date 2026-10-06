import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WASHER, gForce, criticalRpm, motorRpm, heatSeconds, levelFromLitres, moistureLeft, swayMm,
  releaseAngle, createGarment, stepGarment, omega, createSim, stepWasher,
} from '../appliances/washing-machine-front-load/washer.js';

const near = (a, b, tol) => assert.ok(Math.abs(a - b) <= tol, `${a} is not within ${tol} of ${b}`);
const deg = rad => rad * 180 / Math.PI;
function run(sim, seconds, mode, opts, check = () => {}) {
  for (let t = 0; t < seconds; t += 0.02) { stepWasher(sim, 0.02, mode, opts); check(sim); }
  return sim;
}

test('a 47 cm drum pins the clothes above 62 rpm and pushes about 500 g at 1,400 rpm', () => {
  near(criticalRpm(), 61.7, 0.1);
  near(gForce(criticalRpm()), 1, 1e-9);
  near(gForce(1400), 515, 2);
  assert.equal(motorRpm(1400), 16800);
});

test('heating 12 L from 15 °C to 40 °C with 2 kW takes about 10 minutes', () => {
  near(heatSeconds(12, 15, 40) / 60, 10.5, 0.1);
});

test('12 L stands about 10 cm deep in the tub', () => {
  near(levelFromLitres(WASHER.washLitres), 0.102, 0.002);
  assert.ok(levelFromLitres(20) > levelFromLitres(12));
  near(levelFromLitres(0), 0, 1e-6);
});

test('a faster spin leaves less water in the clothes', () => {
  near(moistureLeft(1400), 52, 1e-9);
  near(moistureLeft(800), 70, 1e-9);
  assert.ok(moistureLeft(1000) < moistureLeft(800) && moistureLeft(1200) < moistureLeft(1000));
});

test('the tub sways most at its resonance, not at full speed', () => {
  assert.ok(swayMm(240) > 3 * swayMm(1400));
  assert.ok(swayMm(50) < 0.5);
});

test('at 50 rpm clothes leave the wall at about 130° and drop back', () => {
  near(deg(releaseAngle(50)), 131, 1);
  assert.equal(releaseAngle(90), Infinity);
  const g = createGarment({ r: WASHER.drumR }), w = omega(50);
  let top = 0, launches = 0, landings = 0;
  for (let t = 0; t < 4; t += 0.005) {
    const event = stepGarment(g, 0.005, w);
    if (!g.flying) top = Math.max(top, g.angle);
    if (event === 'launched') { launches++; near(deg(g.angle), 131, 2); }
    if (event === 'landed') landings++;
  }
  assert.ok(launches >= 2 && landings >= 2, `${launches} launches, ${landings} landings`);
  assert.ok(deg(top) < 133);
});

test('at 90 rpm clothes stay flat on the wall; at rest they slump to the bottom', () => {
  const g = createGarment({ r: 0.2, grip: 0.85 });
  for (let t = 0; t < 10; t += 0.005) stepGarment(g, 0.005, omega(90));
  assert.equal(g.flying, false);
  const rest = createGarment({ r: 0.2, angle: 1.2 });
  for (let t = 0; t < 4; t += 0.005) stepGarment(rest, 0.005, 0);
  near(rest.angle, 0, 0.02);
});

test('the valve fills to the wash level and the heater stops at the set temperature', () => {
  const sim = run(createSim(), 30, 'heat');
  near(sim.water, WASHER.washLitres, 0.06);
  assert.equal(sim.valve, false);
  near(sim.temp, WASHER.washC, 1);
});

test('the heater never runs without water over it', () => {
  run(createSim({ water: 0 }), 5, 'heat', {}, sim => {
    if (sim.heater) assert.ok(sim.water >= WASHER.heaterMinL, `heater on with ${sim.water} L`);
  });
});

test('the door opens only when the drum is still and the tub is empty', () => {
  let opened = false;
  run(createSim(), 24, 'door', {}, sim => {
    if (sim.door > 0) { opened = true; assert.ok(Math.abs(sim.rpm) < 1 && sim.water < 0.5 && !sim.locked); }
    if (Math.abs(sim.rpm) > 1) assert.ok(sim.locked && sim.door === 0);
  });
  assert.ok(opened);
});

test('the wash tumbles both ways at 50 rpm', () => {
  let ahead = 0, back = 0;
  run(createSim({ water: 12 }), 12, 'wash', {}, sim => { ahead = Math.max(ahead, sim.rpm); back = Math.min(back, sim.rpm); });
  near(ahead, 50, 1e-9);
  near(back, -50, 1e-9);
});

test('the drum drains before it spins, then reaches the chosen speed', () => {
  for (const top of [800, 1400]) {
    const sim = run(createSim({ water: 12, wet: 2 }), 40, 'spin', { top }, s => {
      if (s.water > 1) assert.ok(Math.abs(s.rpm) <= WASHER.tumbleMax, `${s.rpm} rpm with ${s.water} L in the tub`);
    });
    near(sim.rpm, top, 1e-9);
    assert.equal(sim.water, 0);
    near(sim.wet * 100, moistureLeft(top), 3);
  }
});
