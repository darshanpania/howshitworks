import * as THREE from 'three';
import { createStage, addFloor, addStudioLights } from '../../src/engine/stage.js';
import { createParts, looksInside } from '../../src/engine/parts.js';
import { createCallouts } from '../../src/engine/callouts.js';
import { createStoryUI, bindRange, showRange } from '../../src/engine/story-ui.js';
import { sound } from '../../src/engine/sound.js';
import { startLoop, reducedMotion as reduced } from '../../src/engine/loop.js';
import { box, cylinder, lathe, roundedRect, extrudeUp } from '../../src/kit/shapes.js';
import { createMaterials, linear } from '../../src/kit/materials.js';
import { softDot, speckleTexture, heatColor, createParticles } from '../../src/kit/effects.js';
import { FRYER_STORY } from './story.js';
import { createSim, stepFryer } from './physics.js';

// ---------- Stage and light ----------
const stage = createStage(document.querySelector('#c'), {
  fov: 36, pbr: true, camera: { theta: 0.62, phi: 1.02, r: 14.5, target: [0, -0.25, 0.3] }, zoom: [6, 20], phiLimit: 0.25,
});
const { scene } = stage;
addStudioLights(stage, { key: [5, 9, 6], extent: 6, far: 30 });
const FLOOR_Y = -2.35;
addFloor(stage, FLOOR_Y, { size: 14, opacity: 0.16, height: 5.5 });

// ---------- Textures ----------
// A white sheet with one hole per tile, used as an alpha map: the basket's perforated wall and mesh floor.
function holesTexture({ size = 64, hole = 0.3, square = false, repeat = [1, 1] } = {}) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, size, size); g.fillStyle = '#000';
  if (square) { const s = size * hole * 2; g.fillRect((size - s) / 2, (size - s) / 2, s, s); }
  else { g.beginPath(); g.arc(size / 2, size / 2, size * hole, 0, Math.PI * 2); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat);
  return t;
}

// ---------- Materials ----------
const M = createMaterials({
  body: { color: 0x30353b, metalness: 0.25, roughness: 0.42 },
  trim: { look: 'brushed', color: 0xc9ced4 },
  steel: { look: 'brushed', side: THREE.DoubleSide },
  dark: 'dark', iron: 'iron', copper: 'copper', wire: 'wire',
  coating: { color: 0x2a2d31, metalness: 0.3, roughness: 0.5, side: THREE.DoubleSide }, // non-stick drawer
  basket: { color: 0xb9c0c8, metalness: 0.75, roughness: 0.3, side: THREE.DoubleSide, alphaMap: holesTexture({ hole: 0.42, repeat: [44, 8] }), alphaTest: 0.02 },
  grid: { color: 0xb9c0c8, metalness: 0.75, roughness: 0.3, side: THREE.DoubleSide, alphaMap: holesTexture({ square: true, hole: 0.34, repeat: [18, 18] }), alphaTest: 0.02 },
  sheath: { color: 0x6b6158, metalness: 0.7, roughness: 0.35 }, // the element's steel tube
  fan: { look: 'aluminium', side: THREE.DoubleSide },
  glass: { color: 0x0b0d0f, metalness: 0.1, roughness: 0.12 },
  cable: { color: 0x1c1f22, roughness: 0.6 },
  pin: 'brass',
  fry: { color: 0xe9cf8a, roughness: 0.78, map: speckleTexture({ repeat: 0.6 }) },
  ceramic: { color: 0xece6da, roughness: 0.5 },
}, { pbr: true });

// ---------- Parts ----------
// Scale: 1 unit ≈ 7 cm. The body is 27 cm wide and 32 cm tall; the basket is 18 cm across.
// The cooking chamber is centred on the y axis. The body sits a little forward of it, so the
// drawer front has room in front of the round drawer.
const BODY = { w: 3.8, d: 4.5, r: 0.75, z: 0.25, bottom: -2.29, plinth: -2.17, split: 0.05, top: 2.1, wall: 0.07 };
const FRONT = BODY.z + BODY.d / 2;      // z of the front face
const CUT = FRONT - BODY.r;             // where the drawer front meets the side walls
const PAN = { r: 1.55, floor: -2.02 };
const BASKET = { rBottom: 1.18, rTop: 1.28, bottom: -1.45, top: -0.05 };
const ELEMENT_Y = 0.2, FAN_Y = 0.58, SHIELD_Y = 0.98, COOL_Y = 1.78;
const root = new THREE.Group(); scene.add(root);
const { parts, add, update } = createParts(root, { shadows: true, lively: true });

// Outline of the lower body seen from above: the sides and back of the rounded footprint,
// open at the front where the drawer slides in. Shape y is world -z (see extrudeUp).
function sidesAndBack({ w, d, r, wall }) {
  const s = new THREE.Shape(), x = w / 2, y = d / 2, open = -y + r, i = x - wall, j = y - wall;
  s.moveTo(-x, open); s.lineTo(-x, y - r); s.quadraticCurveTo(-x, y, -x + r, y);
  s.lineTo(x - r, y); s.quadraticCurveTo(x, y, x, y - r); s.lineTo(x, open);
  s.lineTo(i, open); s.lineTo(i, y - r); s.quadraticCurveTo(i, j, x - r, j);
  s.lineTo(-x + r, j); s.quadraticCurveTo(-i, j, -i, y - r); s.lineTo(-i, open); s.closePath();
  return s;
}
// The front of the footprint: the drawer front, with the two front corners rounded.
function frontSlab({ w, d, r }) {
  const s = new THREE.Shape(), x = w / 2, y = d / 2;
  s.moveTo(-x, -y + r); s.quadraticCurveTo(-x, -y, -x + r, -y); s.lineTo(x - r, -y);
  s.quadraticCurveTo(x, -y, x, -y + r); s.closePath();
  return s;
}
const atBody = mesh => { mesh.position.z += BODY.z; return mesh; };

// Lower body: the plinth, the side and back walls around the drawer, and four feet.
{
  const shell = new THREE.Group();
  shell.add(atBody(extrudeUp(roundedRect(BODY.w + 0.06, BODY.d + 0.06, BODY.r + 0.03), 0.1, M.dark, BODY.bottom + 0.02, 0.02)));
  shell.add(atBody(extrudeUp(sidesAndBack(BODY), BODY.split - BODY.plinth, M.body, BODY.plinth)));
  [[-1.4, -1.7], [1.4, -1.7], [-1.4, 1.7], [1.4, 1.7]].forEach(([x, z]) => shell.add(cylinder(0.16, 0.18, 0.06, M.dark, [x, FLOOR_Y + 0.03, BODY.z + z], { segments: 16 })));
  add('shell', shell, new THREE.Vector3(), new THREE.Vector3(0, -0.2, -1.4));
}

// Upper body: a full ring of wall and a steel top with the cooling-air grille.
{
  const lid = new THREE.Group();
  const ring = roundedRect(BODY.w, BODY.d, BODY.r);
  ring.holes.push(roundedRect(BODY.w - BODY.wall * 2, BODY.d - BODY.wall * 2, BODY.r - BODY.wall, 0, 0, new THREE.Path()));
  lid.add(atBody(extrudeUp(ring, BODY.top - BODY.split, M.body, BODY.split)));
  lid.add(atBody(extrudeUp(roundedRect(BODY.w - 0.08, BODY.d - 0.08, BODY.r - 0.04), 0.12, M.trim, BODY.top, 0.04)));
  for (let i = 0; i < 18; i++) {
    const a = i / 18 * Math.PI * 2, slot = box([0.38, 0.02, 0.06], M.dark, [Math.cos(a) * 0.75, BODY.top + 0.162, Math.sin(a) * 0.75], 0.01);
    slot.rotation.y = -a; lid.add(slot);
  }
  add('lid', lid, new THREE.Vector3(), new THREE.Vector3(0, 2.6, -1.4));
}

// Control panel: a black glass plate on the upper front with a lit display and two buttons.
// The display is a canvas, redrawn when the setting or the element changes.
const display = { canvas: document.createElement('canvas'), key: '' };
display.canvas.width = 384; display.canvas.height = 160;
display.texture = new THREE.CanvasTexture(display.canvas); display.texture.encoding = THREE.sRGBEncoding;
{
  const panel = new THREE.Group();
  panel.add(box([1.7, 1.0, 0.05], M.glass, [0, 1.12, FRONT + 0.005], 0.02));
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.44, 0.6), new THREE.MeshStandardMaterial({ color: 0x000000, emissiveMap: display.texture, roughness: 0.25 }));
  screen.position.set(0, 1.3, FRONT + 0.032); screen.userData.display = true; screen.userData.noShadow = true; panel.add(screen);
  [-0.38, 0.38].forEach(x => {
    const button = cylinder(0.1, 0.1, 0.02, M.trim, [x, 0.84, FRONT + 0.035], { segments: 24 }); button.rotation.x = Math.PI / 2; panel.add(button);
  });
  add('panel', panel, new THREE.Vector3(), new THREE.Vector3(0, 2.6, -1.4));
}
function drawDisplay(set, heating, fan) {
  const key = `${set}|${heating}|${fan}`;
  if (key === display.key) return;
  display.key = key;
  const g = display.canvas.getContext('2d'), w = display.canvas.width, h = display.canvas.height;
  const lit = '#ff7a2e', dim = '#3b2216';
  g.fillStyle = '#050607'; g.fillRect(0, 0, w, h);
  g.fillStyle = lit; g.textBaseline = 'alphabetic';
  g.font = '600 88px "IBM Plex Mono", ui-monospace, monospace'; g.fillText(`${set}°`, 22, 112);
  g.font = '500 30px "IBM Plex Mono", ui-monospace, monospace'; g.fillText('15 MIN', 252, 64);
  // Heat (three waves) and fan (four blades) symbols light up while each one runs.
  g.lineWidth = 5; g.lineCap = 'round';
  g.strokeStyle = heating ? lit : dim;
  for (let i = 0; i < 3; i++) { const x = 262 + i * 18; g.beginPath(); g.moveTo(x, 132); g.bezierCurveTo(x - 9, 120, x + 9, 108, x, 96); g.stroke(); }
  g.fillStyle = fan ? lit : dim;
  for (let i = 0; i < 4; i++) { g.beginPath(); g.ellipse(340 + Math.cos(i * Math.PI / 2) * 11, 114 + Math.sin(i * Math.PI / 2) * 11, 11, 5, i * Math.PI / 2, 0, Math.PI * 2); g.fill(); }
  display.texture.needsUpdate = true;
}

// Back vent: slots in the upper back wall where the cooling air and the steam leave.
{
  const vent = new THREE.Group(), back = BODY.z - BODY.d / 2;
  for (let i = 0; i < 6; i++) vent.add(box([1.5, 0.07, 0.04], M.dark, [0, 0.88 + i * 0.14, back - 0.005], 0.015));
  add('vent', vent, new THREE.Vector3(), new THREE.Vector3(0, 2.6, -1.4));
}

// Power cord: out of the back, along the floor, to a three-pin plug.
{
  const cord = new THREE.Group(), back = BODY.z - BODY.d / 2;
  const path = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-1.2, -1.9, back), new THREE.Vector3(-1.3, -2.18, back - 0.45), new THREE.Vector3(-2.1, -2.29, back - 0.6),
    new THREE.Vector3(-3.0, -2.29, -1.4), new THREE.Vector3(-3.3, -2.29, -0.1), new THREE.Vector3(-3.25, -2.27, 0.85),
  ]);
  cord.add(new THREE.Mesh(new THREE.TubeGeometry(path, 64, 0.055, 10, false), M.cable));
  const plug = box([0.5, 0.36, 0.48], M.cable, [-3.2, -2.17, 1.2], 0.08); plug.rotation.y = 0.15; cord.add(plug);
  [[0.12, 0.13], [0.12, -0.13], [-0.09, 0]].forEach(([dy, dx]) => {
    const pin = cylinder(0.032, 0.032, 0.28, M.pin, [dx, dy, 0.36], { segments: 10 }); pin.rotation.x = Math.PI / 2; plug.add(pin);
  });
  cord.userData.anchor = [-3.2, -2.1, 1.2]; // the plug
  add('cord', cord, new THREE.Vector3(), new THREE.Vector3(-0.8, 0, -0.8));
}

// Drawer: the front with its handle, and a round non-stick pan behind it.
{
  const drawer = new THREE.Group();
  drawer.add(atBody(extrudeUp(frontSlab(BODY), BODY.split - BODY.plinth - 0.06, M.body, BODY.plinth + 0.02, 0.02)));
  drawer.add(box([1.6, 0.5, 0.56], M.body, [0, -0.72, FRONT + 0.27], 0.14));
  drawer.add(box([1.24, 0.03, 0.34], M.trim, [0, -0.46, FRONT + 0.3], 0.012));
  drawer.add(box([0.32, 0.07, 0.2], M.trim, [0, -0.44, FRONT + 0.1], 0.02)); // release button
  drawer.add(lathe([[0, PAN.floor], [1.44, PAN.floor], [1.52, PAN.floor + 0.07], [PAN.r, PAN.floor + 0.17], [PAN.r, -0.03], [1.6, 0]], M.coating));
  drawer.add(box([1.1, 1.5, 0.3], M.dark, [0, -1.1, (PAN.r + CUT) / 2], 0.04)); // bracket from the pan to the front
  drawer.userData.anchor = [1.08, -1.0, 1.08];
  add('drawer', drawer, new THREE.Vector3(), new THREE.Vector3(0, 0, 2.3));
}

// Air guide: a star of curved ridges and a cone on the drawer floor.
{
  const guide = new THREE.Group();
  guide.add(cylinder(0.04, 0.36, 0.26, M.coating, [0, PAN.floor + 0.13, 0], { segments: 32 }));
  // Each ridge is set at an angle to the radius, so the air leaves the guide spinning.
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2, arm = new THREE.Group(); arm.rotation.y = -a;
    const ridge = box([1.0, 0.12, 0.05], M.coating, [0.85, PAN.floor + 0.06, 0.12], 0.02); ridge.rotation.y = 0.3; arm.add(ridge);
    guide.add(arm);
  }
  guide.userData.anchor = [0.82, PAN.floor + 0.1, 0.5];
  add('deflector', guide, new THREE.Vector3(), new THREE.Vector3(0, 0.3, 2.3));
}

// Basket: a perforated steel wall and a mesh floor, on four short legs.
{
  const basket = new THREE.Group();
  const wall = lathe([[BASKET.rBottom, BASKET.bottom], [BASKET.rTop, BASKET.top]], M.basket, { segments: 64 });
  wall.userData.seeThrough = true; basket.add(wall);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(BASKET.rBottom, 64), M.grid);
  floor.rotation.x = -Math.PI / 2; floor.position.y = BASKET.bottom; basket.add(floor);
  [BASKET.bottom, BASKET.top].forEach((y, i) => {
    const rim = new THREE.Mesh(new THREE.TorusGeometry(i ? BASKET.rTop : BASKET.rBottom, 0.03, 8, 64), M.trim);
    rim.rotation.x = Math.PI / 2; rim.position.y = y; basket.add(rim);
  });
  for (let i = 0; i < 4; i++) {
    const a = i / 4 * Math.PI * 2 + Math.PI / 4;
    basket.add(cylinder(0.04, 0.04, 0.3, M.trim, [Math.cos(a) * 0.95, BASKET.bottom - 0.15, Math.sin(a) * 0.95], { segments: 8 }));
  }
  basket.userData.anchor = [0.88, -0.75, 0.88];
  add('basket', basket, new THREE.Vector3(), new THREE.Vector3(0, 0.9, 2.3));
}

// Fries: thin sticks of potato in a loose heap. A seeded random keeps the heap the same on every visit.
function seeded(seed) {
  return () => {
    seed = seed + 0x6d2b79f5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
{
  const food = new THREE.Group(), rand = seeded(15);
  const lengths = [0.72, 0.84, 0.96].map(l => new THREE.BoxGeometry(l, 0.11, 0.11));
  for (let i = 0; i < 56; i++) {
    const k = i % 3, len = 0.72 + k * 0.12, r = Math.sqrt(rand()) * (1.1 - len / 2), a = rand() * Math.PI * 2;
    const fry = new THREE.Mesh(lengths[k], M.fry);
    fry.position.set(Math.cos(a) * r, BASKET.bottom + 0.07 + Math.floor(i / 11) * 0.1 + rand() * 0.05, Math.sin(a) * r);
    fry.rotation.set((rand() - 0.5) * 0.4, rand() * Math.PI, (rand() - 0.5) * 0.5);
    food.add(fry);
  }
  add('food', food, new THREE.Vector3(), new THREE.Vector3(0, 1.25, 2.3));
}

// Heating element: one steel tube bent into a flat double spiral, so both ends finish at the
// rim and rise to their terminals. A warm light under it lights the fries while it glows.
const heatingTubes = [];
const elementLight = new THREE.PointLight(0xff6a2a, 0, 3.6, 2);
{
  const element = new THREE.Group(), turns = 2.25, r0 = 0.3, r1 = 1.2, n = 120, end = turns * Math.PI * 2;
  const arm = (k, offset) => { const a = k * end + offset, r = r1 - (r1 - r0) * k; return new THREE.Vector3(Math.cos(a) * r, ELEMENT_Y, Math.sin(a) * r); };
  const points = [new THREE.Vector3(r1, 0.8, 0), new THREE.Vector3(r1, ELEMENT_Y + 0.12, 0)];
  for (let i = 0; i <= n; i++) points.push(arm(i / n, 0));
  for (let i = n; i >= 0; i--) points.push(arm(i / n, Math.PI));
  points.push(new THREE.Vector3(-r1, ELEMENT_Y + 0.12, 0), new THREE.Vector3(-r1, 0.8, 0));
  const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 700, 0.045, 8, false), M.sheath);
  tube.userData.heating = true; element.add(tube); heatingTubes.push(tube);
  [-r1, r1].forEach(x => element.add(box([0.16, 0.08, 0.16], M.ceramic, [x, 0.8, 0], 0.03))); // terminal blocks
  elementLight.position.set(0, ELEMENT_Y - 0.15, 0); element.add(elementLight);
  element.userData.anchor = [0.62, ELEMENT_Y, 0.82];
  add('element', element, new THREE.Vector3(), new THREE.Vector3(0, 0.45, 0));
}

// Centrifugal fan: a backing disc, twelve swept blades and an open ring at the bottom, so air
// comes in through the middle and leaves at the rim. Only the inner group spins.
const fanSpin = new THREE.Group();
{
  const fan = new THREE.Group(); fan.add(fanSpin); fanSpin.position.y = FAN_Y;
  fanSpin.add(cylinder(1.05, 1.05, 0.03, M.fan, [0, 0.12, 0], { segments: 48 }));
  fanSpin.add(cylinder(0.14, 0.14, 0.12, M.trim, [0, 0.06, 0], { segments: 20 }));
  for (let i = 0; i < 12; i++) {
    const a = i / 12 * Math.PI * 2, blade = box([0.5, 0.22, 0.025], M.fan, [Math.cos(a) * 0.78, 0, Math.sin(a) * 0.78], 0.008);
    blade.rotation.y = -a + 0.45; fanSpin.add(blade);
  }
  const shroud = new THREE.Mesh(new THREE.RingGeometry(0.55, 1.05, 48), M.fan);
  shroud.rotation.x = -Math.PI / 2; shroud.position.y = -0.11; fanSpin.add(shroud);
  fan.userData.anchor = [0.74, FAN_Y, 0.74];
  add('fan', fan, new THREE.Vector3(), new THREE.Vector3(0, 0.85, 0));
}

// Chamber top: a steel hood over the fan and element, and a heat shield above it.
{
  const hood = new THREE.Group();
  hood.add(lathe([[1.6, 0.03], [1.58, 0.3], [1.48, 0.72], [1.25, 0.84], [0.12, 0.86]], M.steel));
  hood.add(cylinder(1.62, 1.62, 0.03, M.steel, [0, SHIELD_Y, 0], { segments: 64 }));
  add('hood', hood, new THREE.Vector3(), new THREE.Vector3(0, 1.3, 0));
}

// Motor: a shaded-pole motor, the usual kind in small appliances. A stack of iron plates,
// a copper coil on one leg, and the rotor with the shaft, which spins.
const rotorSpin = new THREE.Group();
{
  const motor = new THREE.Group();
  for (let i = 0; i < 5; i++) motor.add(box([1.1, 0.06, 0.74], M.iron, [0, 1.08 + i * 0.075, 0], 0.01));
  const coil = cylinder(0.19, 0.19, 0.48, M.copper, [-0.4, 1.23, 0], { segments: 20 }); coil.rotation.x = Math.PI / 2; motor.add(coil);
  [-0.45, 0.45].forEach(x => motor.add(box([0.06, 0.1, 0.5], M.trim, [x, SHIELD_Y + 0.06, 0]))); // brackets
  motor.add(rotorSpin);
  rotorSpin.add(cylinder(0.22, 0.22, 0.42, M.iron, [0, 1.23, 0], { segments: 24 }));
  rotorSpin.add(cylinder(0.045, 0.045, COOL_Y - FAN_Y, M.trim, [0, (COOL_Y + FAN_Y) / 2 + 0.06, 0], { segments: 12 }));
  rotorSpin.add(box([0.02, 0.43, 0.08], M.copper, [0.22, 1.23, 0])); // a mark so the rotor reads as turning
  add('motor', motor, new THREE.Vector3(), new THREE.Vector3(0, 1.75, 0));
}

// Cooling fan: seven pitched blades on the top of the same shaft.
const coolSpin = new THREE.Group();
{
  const cooler = new THREE.Group(); cooler.add(coolSpin); coolSpin.position.y = COOL_Y;
  coolSpin.add(cylinder(0.1, 0.1, 0.12, M.trim, [0, 0, 0], { segments: 16 }));
  for (let i = 0; i < 7; i++) {
    const a = i / 7 * Math.PI * 2, blade = box([0.5, 0.02, 0.17], M.fan, [Math.cos(a) * 0.35, 0, Math.sin(a) * 0.35], 0.006);
    blade.rotation.order = 'YXZ'; blade.rotation.y = -a; blade.rotation.x = 0.5; coolSpin.add(blade);
  }
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.025, 8, 48), M.fan); ring.rotation.x = Math.PI / 2; coolSpin.add(ring);
  cooler.userData.anchor = [0.42, COOL_Y, 0.36];
  add('coolfan', cooler, new THREE.Vector3(), new THREE.Vector3(0, 2.15, 0));
}

// Temperature probe in the air stream, and a thermal fuse on the heat shield.
{
  const sensor = new THREE.Group(), x = -0.95, z = 0.78;
  sensor.add(cylinder(0.028, 0.028, 0.42, M.trim, [x, 0.6, z], { segments: 10 }));
  const bead = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 8), M.trim); bead.position.set(x, 0.38, z); sensor.add(bead);
  const lead = new THREE.CatmullRomCurve3([new THREE.Vector3(x, 0.8, z), new THREE.Vector3(x, 1.06, z - 0.05), new THREE.Vector3(-0.6, 1.12, 0.45)]);
  sensor.add(new THREE.Mesh(new THREE.TubeGeometry(lead, 16, 0.016, 6, false), M.wire));
  const fuse = cylinder(0.055, 0.055, 0.24, M.ceramic, [0.95, SHIELD_Y + 0.07, 0.6], { segments: 14 }); fuse.rotation.z = Math.PI / 2; sensor.add(fuse);
  sensor.userData.anchor = [x, 0.4, z];
  add('sensor', sensor, new THREE.Vector3(), new THREE.Vector3(-1.1, 1.0, 0));
}

// ---------- Moving air ----------
// A path through points, walked by arc length: pointAt(path, 0..1, out) fills out.
function polyline(points) {
  const lens = points.slice(1).map((p, i) => Math.hypot(...p.map((v, k) => v - points[i][k])));
  return { points, lens, total: lens.reduce((a, b) => a + b, 0) };
}
function pointAt({ points, lens, total }, u, out) {
  let d = u * total;
  for (let i = 0; i < lens.length; i++) {
    if (d <= lens[i] || i === lens.length - 1) {
      const k = Math.min(1, d / lens[i]);
      for (let c = 0; c < out.length; c++) out[c] = points[i][c] + (points[i + 1][c] - points[i][c]) * k;
      return out;
    }
    d -= lens[i];
  }
  return out;
}
const dot = softDot(), at2 = [0, 0], at3 = [0, 0, 0];
// One loop of the hot air as [radius, y]: out along the fan, down the drawer wall, in along the
// floor, up through the basket and the fries, and back into the fan's eye.
const air = createParticles(scene, 300, {
  size: 0.24, map: dot,
  seed: () => {
    const j = Math.random(), rIn = 0.12 + j * 0.95, floor = PAN.floor + 0.24;
    return { a: Math.random() * Math.PI * 2, u: Math.random(), s: 0.75 + Math.random() * 0.5,
      path: polyline([[0.3, FAN_Y], [1.42, FAN_Y - 0.08], [1.44, floor + 0.06], [rIn, floor], [rIn, ELEMENT_Y - 0.1], [0.3, FAN_Y]]) };
  },
});
// Steam rising off the wet fries.
const steam = createParticles(scene, 50, {
  size: 0.32, map: dot,
  seed: () => ({ a: Math.random() * Math.PI * 2, r: Math.sqrt(Math.random()) * 0.9, t: Math.random(), s: 0.5 + Math.random() * 0.6 }),
});
// Cooling air: in at the top, down past the motor, out of the back vent.
const back = BODY.z - BODY.d / 2;
const coolAir = createParticles(scene, 80, {
  size: 0.24, map: dot,
  seed: () => {
    const a = Math.random() * Math.PI * 2, x = (Math.random() - 0.5) * 1.3, y = 0.9 + Math.random() * 0.65;
    return { u: Math.random(), s: 0.7 + Math.random() * 0.5, path: polyline([
      [Math.cos(a) * 0.75, 2.9, Math.sin(a) * 0.75], [Math.cos(a) * 0.6, BODY.top, Math.sin(a) * 0.6],
      [Math.cos(a) * 0.7, 1.4, Math.sin(a) * 0.45 - 0.4], [x, y, back + 0.05], [x * 1.3, y + 0.6, back - 1.1]]) };
  },
});
// Moist air from the chamber, out of the same vent.
const exhaust = createParticles(scene, 40, {
  size: 0.3, map: dot,
  seed: () => {
    const x = (Math.random() - 0.5) * 1.2, y = 0.9 + Math.random() * 0.6;
    return { u: Math.random(), s: 0.6 + Math.random() * 0.4, path: polyline([
      [x * 0.8, 0.5, -1.2], [x * 0.9, 0.95, -1.62], [x, y, back + 0.05], [x * 1.3, y + 0.75, back - 1.2]]) };
  },
});

// Particle colours are sRGB like every other colour here; the PBR stage renders in linear light.
[[steam, 0x8fa4ba], [coolAir, 0x3f7fc4], [exhaust, 0x8fa4ba]].forEach(([cloud, hex]) => cloud.material.color.copy(linear(hex)));

// ---------- State and UI ----------
const state = { step: 0, explode: 0, targetExplode: 0, playing: true, focus: [], cut: false, on: false, air: false, vent: false, set: 200, spin: 0, angle: 0, glow: 0 };
const sim = createSim();
const story = createStoryUI({
  story: FRYER_STORY, state,
  onStep: (s, index) => {
    // Going forward keeps the fries as cooked as they are; jumping back restarts the step from its own start.
    const reset = index < (state.lastStep ?? -1) || index === 0; state.lastStep = index;
    const start = s.start;
    for (const key of ['air', 'surface', 'brown']) sim[key] = reset ? start[key] : Math.max(sim[key], start[key]);
    sim.water = reset ? start.water : Math.min(sim.water, start.water);
    if (reset) sim.element = start.air;
    if (s.on && start.air > 100) sim.element = Math.max(sim.element, sim.air + 300); // already hot: no dip
    state.focus = s.focus; state.cut = s.cut; state.on = s.on; state.air = !!s.air; state.vent = !!s.vent;
  },
});
const temp = bindRange('temp', v => { state.set = v; });
const showTemp = () => showRange(temp, `${temp.value}°C`);
temp.addEventListener('input', showTemp); showTemp();
createCallouts(stage, { parts, state, story: FRYER_STORY });

// The housing goes glassy in cutaway steps, with the panel and the vent that sit on it;
// when a step looks inside, other parts fade to x-ray.
const HOUSING = ['shell', 'lid', 'drawer', 'hood'], ON_HOUSING = ['panel', 'vent'];
const BLACK = new THREE.Color(0x000000), wireColor = new THREE.Color();
const focusStyle = {
  highlight: 0.12,
  opacity(name, mesh, hot) {
    let alpha = 1;
    if (state.cut && HOUSING.includes(name)) alpha = hot ? 0.35 : 0.14;
    if (state.cut && ON_HOUSING.includes(name) && !hot) alpha = 0.14;
    if (state.focus.length && !hot && !HOUSING.includes(name) && looksInside(state)) alpha = Math.min(alpha, 0.3);
    if (mesh.userData.seeThrough && hot) alpha = Math.min(alpha, 0.55); // the basket wall, so the fries show through
    return alpha;
  },
  decorate(material, { mesh, hot }) {
    if (mesh.userData.heating) { material.emissive.copy(wireColor); material.emissiveIntensity = 1 + state.glow * 0.6; }
    else if (mesh.userData.display) { material.emissive.setRGB(1, 1, 1); material.emissiveIntensity = 1.1; }
    else { material.emissive.copy(hot ? material.color : BLACK); material.emissiveIntensity = hot ? 0.12 : 0; }
  },
};

const $ = id => document.getElementById(id);
const readout = { box: $('readout'), air: $('r-air'), fries: $('r-fries'), element: $('r-element'), crust: $('r-crust') };
let readoutTimer = 0;
function showReadout() {
  readout.air.textContent = `${sim.air.toFixed(0)}°C`;
  readout.fries.textContent = `${sim.surface.toFixed(0)}°C`;
  readout.element.textContent = sim.heater ? 'On' : 'Off';
  // The crust is wet, then drying at 100 °C, then dry and browning.
  readout.crust.textContent = sim.boiling ? 'drying' : sim.water > 0 ? 'wet' : sim.brown < 0.005 ? 'dry' : `${Math.round(sim.brown * 100)}% brown`;
  readout.box.classList.toggle('on', sim.heater);
}

// ---------- Sound ----------
// The motor hums at twice the 50 Hz mains, the air rushes, the relay clicks as the thermostat
// switches the element, wet fries sizzle, and two beeps start the fryer.
const hum = sound.loop({ type: 'tone', wave: 'triangle', freq: 100 });
const rush = sound.loop({ type: 'noise', filter: 'lowpass', freq: 400, q: 0.7 });
const sizzle = sound.loop({ type: 'noise', filter: 'highpass', freq: 4500, q: 0.7 });
const was = { heater: false, on: false };
function playSounds() {
  const run = Math.min(1, state.spin / 16), live = state.playing ? 1 : 0;
  hum.set(0.03 * run);
  rush.set(0.14 * run, 300 + 500 * run);
  sizzle.set(sim.boiling ? 0.035 * live * (0.7 + 0.3 * Math.random()) : 0);
  if (sim.heater !== was.heater && state.playing) sound.click(0.22);
  if (state.on && !was.on) { sound.tone({ freq: 2100, type: 'square', gain: 0.04, release: 0.08 }); sound.tone({ freq: 2100, type: 'square', gain: 0.04, release: 0.08, delay: 0.16 }); }
  was.heater = sim.heater; was.on = state.on;
}

// ---------- Frame ----------
const RAW = linear(0xe9cf8a), GOLD = linear(0xd99a2b), DEEP = linear(0x8e4f1c), fryColor = new THREE.Color();
const hotAir = linear(0xe8743a), coolTint = linear(0x5e8dc4);
startLoop(stage, (dt, now) => {
  // The element starts to glow dull red above about 300 °C and is orange-red near 700 °C.
  state.glow = THREE.MathUtils.clamp((sim.element - 300) / 420, 0, 1);
  heatColor(state.glow, wireColor);
  update(state, focusStyle, reduced ? 1 : 0.09, dt);

  if (state.playing) stepFryer(sim, dt, { on: state.on, set: state.set });
  elementLight.intensity = state.glow * 2.4;
  drawDisplay(state.set, sim.heater, state.on);

  // Both fans and the rotor turn on one shaft; they spin up and coast down.
  const spinTarget = state.on && state.playing ? 16 : 0;
  state.spin += (spinTarget - state.spin) * Math.min(1, dt * (reduced ? 60 : 1.6));
  state.angle += dt * state.spin;
  fanSpin.rotation.y = coolSpin.rotation.y = rotorSpin.rotation.y = -state.angle;

  // The fries go from pale to golden to deep brown, and a little glossier as they crisp.
  const b = sim.brown;
  if (b < 0.6) fryColor.copy(RAW).lerp(GOLD, b / 0.6); else fryColor.copy(GOLD).lerp(DEEP, (b - 0.6) / 0.4);
  parts.food.meshes.forEach(mesh => { mesh.material.color.copy(fryColor); mesh.material.roughness = 0.78 - b * 0.3; });

  const flow = state.spin / 16, move = state.playing ? 1 : 0;
  // Hot air loop, tinted by its temperature. It only shows with the parts in place.
  air.material.color.copy(coolTint).lerp(hotAir, THREE.MathUtils.clamp((sim.air - 40) / 160, 0, 1));
  if (air.fade(state.air && state.cut && state.explode < 0.15 ? 0.9 * Math.min(1, flow * 1.5) : 0, Math.min(1, dt * 3))) {
    air.seeds.forEach((p, i) => {
      const du = dt * p.s * flow * 0.28 * move;
      p.u = (p.u + du) % 1; p.a += du * 2.4; // the fan and the star-shaped guide set the air spinning
      pointAt(p.path, p.u, at2);
      air.place(i, Math.cos(p.a) * at2[0], at2[1], Math.sin(p.a) * at2[0]);
    });
    air.commit();
  }
  // Steam while the surface water boils off.
  const foodY = parts.food.group.position.y;
  if (steam.fade(sim.boiling && state.cut && state.explode < 0.15 ? 0.6 * Math.min(1, sim.water * 3 + 0.3) : 0, Math.min(1, dt * 2))) {
    steam.seeds.forEach((p, i) => {
      p.t = (p.t + dt * p.s * 0.45 * move) % 1;
      const r = p.r + p.t * 0.25, a = p.a + p.t * 2;
      steam.place(i, Math.cos(a) * r, foodY + BASKET.bottom + 0.35 + p.t * 1.5, Math.sin(a) * r);
    });
    steam.commit();
  }
  // Cooling air and steam leaving through the back vent.
  const venting = state.vent && state.explode < 0.15 ? Math.min(1, flow * 1.5) : 0;
  [[coolAir, 0.75, 0.32], [exhaust, 0.5, 0.22]].forEach(([cloud, level, speed]) => {
    if (!cloud.fade(level * venting, Math.min(1, dt * 3))) return;
    cloud.seeds.forEach((p, i) => {
      p.u = (p.u + dt * p.s * speed * flow * move) % 1;
      pointAt(p.path, p.u, at3); cloud.place(i, at3[0], at3[1], at3[2]);
    });
    cloud.commit();
  });

  playSounds();
  readoutTimer -= dt;
  if (readoutTimer <= 0) { showReadout(); readoutTimer = 0.15; }
});
story.setStep(0, false);
// The display uses the page's mono font; draw it again once the font has loaded.
document.fonts?.load('600 88px "IBM Plex Mono"').then(() => { display.key = ''; }).catch(() => {});
