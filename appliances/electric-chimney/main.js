import * as THREE from 'three';
import { createStage, addFloor, addStudioLights } from '../../src/engine/stage.js';
import { createParts, looksInside } from '../../src/engine/parts.js';
import { createCallouts } from '../../src/engine/callouts.js';
import { createStoryUI, bindRange } from '../../src/engine/story-ui.js';
import { sound } from '../../src/engine/sound.js';
import { startLoop, reducedMotion as reduced } from '../../src/engine/loop.js';
import { box, cylinder, lathe, roundedRect, extrudeUp } from '../../src/kit/shapes.js';
import { createMaterials, linear } from '../../src/kit/materials.js';
import { softDot, createParticles } from '../../src/kit/effects.js';
import { CHIMNEY_STORY } from './story.js';
import { CHIMNEY, airflowM3h, airSpeed, ductArea } from './airflow.js';

// ---------- Stage and light ----------
// Scale: 1 unit = 10 cm. y = 0 is the bottom of the hood, 65 cm above the stove top.
// The hood hangs on a wall whose front face is at z = -2.5; the duct leaves through it toward -z.
const VIEWS = {
  all: { r: 32, theta: 0.62, phi: 1.32, target: [0.2, -0.2, -0.8] },
  hood: { r: 10.5, theta: 0.9, phi: 1.22, target: [0.3, 1.7, -0.9] },
  under: { r: 13, theta: 0.5, phi: 1.88, target: [0, -0.8, 0] },
  duct: { r: 17, theta: 1.3, phi: 1.16, target: [0.3, 2.9, -2.9] },
};
const stage = createStage(document.getElementById('c'), {
  fov: 36, pbr: true, camera: VIEWS.all, zoom: [6, 36], phiLimit: 0.25,
});
const { scene, cam } = stage;
addStudioLights(stage, { key: [6, 14, 9], extent: 10, far: 45 });
const FLOOR = -7.4;
// No cast-shadow catcher: the hood hangs so high that its shadow would be a hard slab across the floor.
addFloor(stage, FLOOR, { size: 24, opacity: 0.14, height: 9, blur: 3.5, shadowSize: 16, shadow: false });

// ---------- Materials ----------
// Expanded aluminium mesh: a diamond lattice, used as a cut-out so the layers show through each other.
function meshTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, 64, 64);
  g.strokeStyle = '#fff'; g.lineWidth = 9; g.beginPath();
  for (let i = -64; i <= 128; i += 32) { g.moveTo(i, 0); g.lineTo(i + 64, 64); g.moveTo(i, 64); g.lineTo(i + 64, 0); }
  g.stroke();
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(10, 15); t.anisotropy = 4;
  return t;
}
// Kitchen wall: glazed tiles on the face, brick where the wall is cut.
function canvasTexture(draw, repeat) {
  const c = document.createElement('canvas'); c.width = c.height = 128; draw(c.getContext('2d'));
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); t.encoding = THREE.sRGBEncoding; t.anisotropy = 4;
  return t;
}
const tileTexture = () => canvasTexture(g => { // 15 cm tiles
  g.fillStyle = '#d4ccbf'; g.fillRect(0, 0, 128, 128); g.fillStyle = '#ebe6dd'; g.fillRect(3, 3, 122, 122);
}, [1 / 1.5, 1 / 1.5]);
// Side faces map (y, depth) to (u, v): courses run across u, two of them per tile.
const brickTexture = () => canvasTexture(g => {
  g.fillStyle = '#d6cdbf'; g.fillRect(0, 0, 128, 128);
  for (let course = 0; course < 2; course++) for (let b = -1; b < 2; b++) {
    const shade = 150 + ((course * 7 + b * 13) % 5) * 9;
    g.fillStyle = `rgb(${shade + 12}, ${shade * 0.58 | 0}, ${shade * 0.45 | 0})`;
    g.fillRect(course * 64 + 2, b * 64 + course * 32 + 2, 60, 60);
  }
}, [1 / 1.7, 1 / 2.3]);
const M = createMaterials({
  steel: { look: 'brushed', color: 0xc3c9d0, side: THREE.DoubleSide },
  glass: { color: 0x15191e, metalness: 0.4, roughness: 0.14, side: THREE.DoubleSide },
  alu: { look: 'aluminium', side: THREE.DoubleSide },
  galv: { color: 0xa9b1b9, metalness: 0.75, roughness: 0.38, side: THREE.DoubleSide },
  mesh: { look: 'aluminium', side: THREE.DoubleSide, alphaMap: meshTexture(), alphaTest: 0.5 },
  motor: { color: 0x3b4249, metalness: 0.55, roughness: 0.45 },
  stove: { look: 'brushed', color: 0xb9bfc6 },
  steelSolid: 'steel', brass: 'brass', iron: 'iron', dark: 'dark', plastic: 'plastic',
  kadhai: { color: 0x34302c, metalness: 0.65, roughness: 0.42, side: THREE.DoubleSide },
  oil: { color: 0xc0841f, metalness: 0.2, roughness: 0.05 },
  pakora: { color: 0xa35e24, roughness: 0.85 },
  tiles: { color: 0xffffff, roughness: 0.6, map: tileTexture() },
  brick: { color: 0xffffff, roughness: 0.95, map: brickTexture() },
  pvc: { color: 0xe9e7e1, roughness: 0.5, side: THREE.DoubleSide },
  lamp: { color: 0xfff6e6, roughness: 0.3 },
  button: { color: 0x2c3238, roughness: 0.4 },
}, { pbr: true });
const flameMat = new THREE.MeshBasicMaterial({ color: 0x3d7dff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });

// ---------- Helpers ----------
// The four side walls between two level rectangles [x0, x1, z0, z1] at heights y0 and y1.
function sleeve(a, b, y0, y1, mat) {
  const corners = r => [[r[0], r[2]], [r[1], r[2]], [r[1], r[3]], [r[0], r[3]]];
  const lo = corners(a), hi = corners(b), pos = [];
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4, q = [[...lo[i], y0], [...lo[j], y0], [...hi[j], y1], [...hi[i], y1]].map(([x, z, y]) => [x, y, z]);
    pos.push(...q[0], ...q[1], ...q[2], ...q[0], ...q[2], ...q[3]);
  }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.computeVertexNormals();
  return new THREE.Mesh(geo, mat);
}
// A wall swept along x from -width/2 to width/2 through 2D points (u, v) → (z, y).
function band(points, width, mat) {
  const pos = [], index = [];
  points.forEach(p => pos.push(-width / 2, p.y, p.x, width / 2, p.y, p.x));
  for (let i = 0; i < points.length - 1; i++) { const a = i * 2; index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(index); geo.computeVertexNormals();
  return new THREE.Mesh(geo, mat);
}
const alongX = mesh => { mesh.rotation.z = Math.PI / 2; return mesh; };
const alongZ = mesh => { mesh.rotation.x = Math.PI / 2; return mesh; };

// ---------- Layout ----------
const TOP = FLOOR + 0.86;                    // glass top of the stove
const BURNERS = [-1.6, 1.6], BZ = 0.15;
const KADHAI = new THREE.Vector3(BURNERS[0], TOP + 0.3, BZ);
const OIL = 0.3;                             // oil level inside the kadhai
// Hood: a black glass skirt, a steel pyramid and a column that runs up the wall.
const HOOD = { skirt: [-3, 3, -2.5, 2.5], col: [-1.5, 1.5, -2.5, 0.8], skirtTop: 0.6, pyrTop: 2.4, top: 6.8 };
const FILTERS = [{ x: -1.45, z: -0.3, w: 2.7, d: 4 }, { x: 1.45, z: -0.3, w: 2.7, d: 4 }];
// Blower: wheel and scroll share one axis along x. In the scroll's own plane u runs along z and v along y.
const XC = 0.35, YC = 1.9, ZC = -1.2;        // wheel centre
const W = 1.3;                               // scroll width
const R0 = 0.86, R1 = 1.46, H = 1.1;         // scroll radius at the tongue and at the outlet; outlet top
const scrollR = th => R0 + (R1 - R0) * (th / (Math.PI * 2)) ** 1.5;
const DUCT = { x: XC, z: ZC + (R0 + R1) / 2, y: 5.2, r: 0.75, end: -5.3 };
const WALL = [-4.8, -2.5];                   // a 230 mm brick wall

// ---------- Parts ----------
const root = new THREE.Group(); scene.add(root);
const { parts, add, update } = createParts(root, { shadows: true, lively: true });

// Gas stove: two burners on a glass top. The left one is lit under the kadhai.
const flames = new THREE.Group();
{
  const g = new THREE.Group();
  g.add(box([6.3, 0.72, 3.3], M.stove, [0, FLOOR + 0.45, 0.2]));
  g.add(box([6.5, 0.07, 3.5], M.glass, [0, TOP - 0.035, 0.2], 0.03));
  [-2.9, 2.9].forEach(x => [-1.2, 1.6].forEach(z => g.add(cylinder(0.12, 0.14, 0.09, M.dark, [x, FLOOR + 0.045, z], { segments: 12 }))));
  BURNERS.forEach(x => {
    g.add(cylinder(0.56, 0.6, 0.1, M.dark, [x, TOP + 0.05, BZ]));
    g.add(cylinder(0.42, 0.46, 0.09, M.brass, [x, TOP + 0.14, BZ]));
    g.add(cylinder(0.26, 0.26, 0.06, M.dark, [x, TOP + 0.21, BZ]));
    // Cast-iron pan support: a ring on four legs, with four prongs that hold the pan.
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.045, 8, 40), M.iron); ring.rotation.x = Math.PI / 2; ring.position.set(x, TOP + 0.3, BZ); g.add(ring);
    for (let k = 0; k < 4; k++) {
      const a = k * Math.PI / 2 + Math.PI / 4;
      g.add(cylinder(0.04, 0.05, 0.3, M.iron, [x + Math.cos(a) * 0.95, TOP + 0.15, BZ + Math.sin(a) * 0.95], { segments: 8 }));
      const prong = box([0.42, 0.07, 0.07], M.iron, [x + Math.cos(a) * 0.76, TOP + 0.33, BZ + Math.sin(a) * 0.76]); prong.rotation.y = -a; g.add(prong);
    }
    g.add(alongZ(cylinder(0.2, 0.22, 0.16, M.plastic, [x, FLOOR + 0.45, 1.93], { segments: 24 })));
    g.add(box([0.05, 0.22, 0.05], M.steelSolid, [x, FLOOR + 0.5, 2.03], 0));
  });
  for (let i = 0; i < 20; i++) {
    const a = i / 20 * Math.PI * 2;
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.2, 8), flameMat);
    flame.position.set(BURNERS[0] + Math.cos(a) * 0.47, TOP + 0.26, BZ + Math.sin(a) * 0.47);
    flame.rotation.z = -Math.cos(a) * 0.5; flame.rotation.x = Math.sin(a) * 0.5; // lean outward
    flame.userData.flame = true; flame.userData.noShadow = true; flames.add(flame);
  }
  g.add(flames);
  add('stove', g, new THREE.Vector3(), new THREE.Vector3(0, -1.4, 0));
}

// Kadhai of hot oil with pakoras frying in it.
const pakoras = [];
{
  const g = new THREE.Group();
  g.add(lathe([[0, 0], [0.45, 0.02], [0.82, 0.1], [1.08, 0.24], [1.26, 0.42], [1.36, 0.6], [1.41, 0.64]], M.kadhai, { segments: 56 }));
  [1, -1].forEach(s => {
    const geo = new THREE.TorusGeometry(0.2, 0.045, 8, 20, Math.PI); geo.rotateX(Math.PI / 2); geo.rotateY(s * Math.PI / 2);
    const handle = new THREE.Mesh(geo, M.kadhai); handle.position.set(s * 1.36, 0.58, 0); g.add(handle);
  });
  const oil = new THREE.Mesh(new THREE.CircleGeometry(1.07, 48).rotateX(-Math.PI / 2), M.oil); oil.position.y = OIL; g.add(oil);
  const lump = new THREE.IcosahedronGeometry(0.2, 2);
  const p = lump.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = v.clone().normalize(), k = 1 + 0.2 * Math.sin(n.x * 5 + 1.3) * Math.sin(n.y * 4 + 0.7) * Math.sin(n.z * 6 + 2.1);
    p.setXYZ(i, v.x * k, v.y * k * 0.7, v.z * k);
  }
  lump.computeVertexNormals();
  [[0.1, 0.2], [-0.45, -0.1], [0.5, -0.35], [-0.15, 0.55], [0.6, 0.4], [-0.55, -0.6]].forEach(([x, z], i) => {
    const m = new THREE.Mesh(lump, M.pakora); m.position.set(x, OIL + 0.04, z); m.rotation.y = i * 1.3; m.scale.setScalar(0.85 + (i % 3) * 0.12);
    g.add(m); pakoras.push(m);
  });
  add('kadhai', g, KADHAI.clone(), new THREE.Vector3(0, -0.6, 0));
}

// Hood shell: glass skirt, steel pyramid and column, and the bottom frame with lamps and buttons.
{
  const g = new THREE.Group();
  const { skirt, col } = HOOD;
  g.add(sleeve(skirt, skirt, 0, HOOD.skirtTop, M.glass));
  g.add(sleeve(skirt, col, HOOD.skirtTop, HOOD.pyrTop, M.steel));
  g.add(sleeve(col, col, HOOD.pyrTop, HOOD.top, M.steel));
  g.add(box([3.04, 0.06, 3.34], M.steel, [0, HOOD.top + 0.03, (col[2] + col[3]) / 2], 0.02));
  const plate = roundedRect(6, 5, 0.04, 0, 0);
  FILTERS.forEach(f => plate.holes.push(roundedRect(f.w, f.d, 0.05, f.x, -f.z, new THREE.Path())));
  g.add(extrudeUp(plate, 0.04, M.steel, 0));
  [-1.9, 1.9].forEach(x => { const lamp = cylinder(0.17, 0.17, 0.03, M.lamp, [x, -0.01, 2.1], { segments: 24 }); lamp.userData.lamp = true; lamp.userData.noShadow = true; g.add(lamp); });
  // Touch buttons on the front: light, then speeds 1 to 3.
  [0, 1, 2, 3].forEach(k => { const b = alongZ(cylinder(0.075, 0.075, 0.02, M.button, [1.0 + k * 0.42, 0.3, 2.51], { segments: 16 })); b.userData.button = k; g.add(b); });
  g.userData.anchor = [2.5, 1.2, 0.6];
  add('hood', g, new THREE.Vector3(), new THREE.Vector3(0, 0.3, 2.2));
}
// Light from the two lamps onto the stove.
{
  const spot = new THREE.SpotLight(0xfff0d8, 0.9, 14, 0.7, 0.7, 1.5);
  spot.position.set(0, -0.1, 1.4); spot.target.position.set(-0.6, FLOOR, 0.2);
  scene.add(spot, spot.target);
}

// Mesh filters: an aluminium frame round five layers of expanded mesh.
const layers = [];
{
  const g = new THREE.Group();
  FILTERS.forEach(f => {
    const rim = roundedRect(f.w, f.d, 0.06, f.x, -f.z);
    rim.holes.push(roundedRect(f.w - 0.16, f.d - 0.16, 0.04, f.x, -f.z, new THREE.Path()));
    g.add(extrudeUp(rim, 0.12, M.alu, -0.05));
    g.add(box([0.5, 0.05, 0.1], M.alu, [f.x, -0.07, f.z + f.d / 2 - 0.25]));
    for (let i = 0; i < 5; i++) {
      const geo = new THREE.PlaneGeometry(f.w - 0.16, f.d - 0.16);
      const uv = geo.attributes.uv; // shift each layer's lattice so the holes do not line up
      for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) + i * 0.017, uv.getY(k) + i * 0.029);
      const sheet = new THREE.Mesh(geo, M.mesh); sheet.rotation.x = -Math.PI / 2; sheet.position.set(f.x, -0.03, f.z);
      sheet.userData.layer = i; sheet.userData.noShadow = true; g.add(sheet); layers.push(sheet);
    }
  });
  g.userData.anchor = [1.45, -0.05, 0.9];
  add('filters', g, new THREE.Vector3(), new THREE.Vector3(0, -2.4, 0));
}

// Motor: a small induction motor with cooling fins, its shaft running into the wheel.
{
  const g = new THREE.Group();
  g.add(alongX(cylinder(0.42, 0.42, 0.62, M.motor, [0, 0, 0], { segments: 32 })));
  g.add(alongX(cylinder(0.32, 0.4, 0.1, M.steelSolid, [-0.36, 0, 0], { segments: 32 })));
  g.add(alongX(cylinder(0.4, 0.32, 0.1, M.steelSolid, [0.36, 0, 0], { segments: 32 })));
  for (let i = 0; i < 5; i++) {
    const fin = new THREE.Mesh(new THREE.TorusGeometry(0.43, 0.022, 6, 32), M.motor); fin.rotation.y = Math.PI / 2; fin.position.x = -0.24 + i * 0.12; g.add(fin);
  }
  g.add(alongX(cylinder(0.05, 0.05, 0.7, M.steelSolid, [0.72, 0, 0], { segments: 12 })));
  g.add(box([0.5, 0.06, 0.9], M.galv, [0.05, -0.47, 0])); // mounting foot
  add('motor', g, new THREE.Vector3(XC - W / 2 - 0.47, YC, ZC), new THREE.Vector3(-1.6, 0, 0));
}

// Blower wheel: 32 forward-curved blades between a back plate and an inlet ring.
const wheel = new THREE.Group();
{
  wheel.add(alongX(cylinder(0.76, 0.76, 0.04, M.galv, [-0.53, 0, 0], { segments: 48 })));
  wheel.add(alongX(cylinder(0.14, 0.14, 0.2, M.steelSolid, [-0.44, 0, 0], { segments: 20 })));
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.69, 0.045, 8, 48), M.galv); ring.rotation.y = Math.PI / 2; ring.position.x = 0.53; wheel.add(ring);
  for (let i = 0; i < 32; i++) {
    const phi = i / 32 * Math.PI * 2;
    const blade = box([1.06, 0.022, 0.2], M.galv, [0, 0.65 * Math.sin(phi), 0.65 * Math.cos(phi)], 0);
    blade.rotation.x = -(phi + 0.6); // the outer edge leans ahead, in the direction of spin
    blade.userData.noShadow = true; wheel.add(blade);
  }
  add('wheel', wheel, new THREE.Vector3(XC, YC, ZC), new THREE.Vector3(2.4, 0, 0));
}

// Scroll housing: the gap round the wheel widens from the tongue to the outlet.
{
  const g = new THREE.Group();
  const spiral = [];
  for (let i = 0; i <= 72; i++) { const th = i / 72 * Math.PI * 2, r = scrollR(th); spiral.push(new THREE.Vector2(r * Math.cos(th), r * Math.sin(th))); }
  const outline = [...spiral, new THREE.Vector2(R1, H), new THREE.Vector2(R0, H)];
  const side = shape => new THREE.ShapeGeometry(shape, 1).rotateY(-Math.PI / 2); // (u, v) → (z, y)
  const back = new THREE.Mesh(side(new THREE.Shape(outline)), M.galv); back.position.x = -W / 2; g.add(back);
  const inlet = new THREE.Shape(outline); inlet.holes.push(new THREE.Path().absarc(0, 0, 0.6, 0, Math.PI * 2, true));
  const front = new THREE.Mesh(side(inlet), M.galv); front.position.x = W / 2; front.userData.cutaway = true; g.add(front);
  const bell = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.05, 8, 48), M.galv); bell.rotation.y = Math.PI / 2; bell.position.x = W / 2 + 0.02; bell.userData.cutaway = true; g.add(bell);
  g.add(band([new THREE.Vector2(R0, H), ...spiral, new THREE.Vector2(R1, H)], W, M.galv));
  g.userData.anchor = [W / 2, -0.95, -0.35];
  add('scroll', g, new THREE.Vector3(XC, YC, ZC), new THREE.Vector3(0, 0, 0));
}

// Duct: up from the scroll, a bend, then straight back through the wall.
const v3 = (y, z) => new THREE.Vector3(DUCT.x, y, z);
const ductPath = new THREE.CurvePath();
ductPath.add(new THREE.LineCurve3(v3(H + YC, DUCT.z), v3(4.3, DUCT.z)));
ductPath.add(new THREE.QuadraticBezierCurve3(v3(4.3, DUCT.z), v3(DUCT.y, DUCT.z), v3(DUCT.y, DUCT.z - 0.9)));
ductPath.add(new THREE.LineCurve3(v3(DUCT.y, DUCT.z - 0.9), v3(DUCT.y, DUCT.end)));
// Air follows the same path, starting lower, at the bottom of the scroll outlet.
const airPath = new THREE.CurvePath();
airPath.add(new THREE.LineCurve3(v3(YC, DUCT.z), v3(H + YC, DUCT.z)));
ductPath.curves.forEach(c => airPath.add(c));
{
  const g = new THREE.Group();
  g.add(box([1.7, 0.06, 1.6], M.galv, [DUCT.x, H + YC, DUCT.z], 0.02)); // collar plate on the scroll outlet
  g.add(new THREE.Mesh(new THREE.TubeGeometry(ductPath, 160, DUCT.r, 32, false), M.alu));
  // Ribs of the flexible aluminium duct, up to the wall.
  const length = ductPath.getLength(), rib = new THREE.TorusGeometry(DUCT.r + 0.01, 0.024, 6, 40);
  for (let s = 0.15; s < length; s += 0.22) {
    const t = s / length, at = ductPath.getPointAt(t);
    if (at.z < WALL[1]) break;
    const ring = new THREE.Mesh(rib, M.alu); ring.position.copy(at); ring.lookAt(at.clone().add(ductPath.getTangentAt(t)));
    ring.userData.noShadow = true; g.add(ring);
  }
  g.add(alongZ(cylinder(0.8, 0.8, WALL[1] - WALL[0], M.pvc, [DUCT.x, DUCT.y, (WALL[0] + WALL[1]) / 2], { segments: 40, open: true }))); // sleeve in the wall
  g.userData.anchor = [DUCT.x + 0.74, 4.85, DUCT.z - 0.35];
  add('duct', g, new THREE.Vector3(), new THREE.Vector3(0, 0, 0));
}

// Back-draft flap on the outside of the wall: hinged at the top, blown open by the air.
const flap = new THREE.Group();
{
  const g = new THREE.Group();
  g.add(alongZ(cylinder(0.82, 0.82, 0.55, M.pvc, [DUCT.x, DUCT.y, WALL[0] - 0.275], { segments: 40, open: true })));
  const plate = roundedRect(2, 2, 0.15, DUCT.x, DUCT.y);
  plate.holes.push(new THREE.Path().absarc(DUCT.x, DUCT.y, 0.82, 0, Math.PI * 2, true));
  const geo = new THREE.ExtrudeGeometry(plate, { depth: 0.06, bevelEnabled: false, curveSegments: 32 }); geo.translate(0, 0, WALL[0] - 0.06);
  g.add(new THREE.Mesh(geo, M.pvc));
  flap.position.set(DUCT.x, DUCT.y + 0.82, WALL[0] - 0.58);
  flap.add(alongZ(cylinder(0.8, 0.8, 0.04, M.pvc, [0, -0.82, 0], { segments: 40 })));
  flap.add(alongX(cylinder(0.04, 0.04, 0.5, M.steelSolid, [0, 0, 0], { segments: 8 })));
  g.add(flap);
  add('flap', g, new THREE.Vector3(), new THREE.Vector3(0, 0, -2.2));
}

// A section of the kitchen wall, with the hole the duct goes through.
{
  const s = roundedRect(7.2, 7.6, 0.04, 0, 3);
  s.holes.push(new THREE.Path().absarc(DUCT.x, DUCT.y, 0.82, 0, Math.PI * 2, true));
  const geo = new THREE.ExtrudeGeometry(s, { depth: WALL[1] - WALL[0], bevelEnabled: false, curveSegments: 32 }); geo.translate(0, 0, WALL[0]);
  add('wall', new THREE.Mesh(geo, [M.tiles, M.brick]), new THREE.Vector3(), new THREE.Vector3(0, 0, -1.2));
}

// ---------- Air ----------
// A cloud of points that can each fade on their own (RGBA vertex colours).
function createCloud(count, { color, size, map }) {
  const positions = new Float32Array(count * 3), colors = new Float32Array(count * 4), c = linear(color);
  for (let i = 0; i < count; i++) colors.set([c.r, c.g, c.b, 0], i * 4);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 4));
  const points = new THREE.Points(geometry, new THREE.PointsMaterial({ size, map, vertexColors: true, transparent: true, depthWrite: false }));
  points.frustumCulled = false; scene.add(points);
  return {
    points,
    place(i, p, alpha) { positions.set([p.x, p.y, p.z], i * 3); colors[i * 4 + 3] = alpha; },
    commit() { geometry.attributes.position.needsUpdate = true; geometry.attributes.color.needsUpdate = true; },
  };
}
const dot = softDot();
const disc = () => { const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()); return [Math.cos(a) * r, Math.sin(a) * r]; };
// Each particle's own random numbers: where it starts on the oil, which filter it heads for,
// where it crosses the wheel and the duct.
function seed(span) {
  const [dx, dz] = disc(), left = Math.random() < 0.7;
  return {
    u: Math.random() * span, dx, dz, ph: Math.random() * Math.PI * 2,
    fx: (left ? -1.45 : 1.45) + (Math.random() - 0.5) * 2.3, fz: -0.3 + (Math.random() - 0.5) * 3.5,
    lx: (Math.random() - 0.5) * 0.9, lz: Math.random() - 0.5, jr: Math.random(), jv: disc(),
  };
}
// Seconds each leg takes at full flow: rise to the hood, cross the hood, round the scroll,
// along the duct, out of the flap.
const LEGS = [3.4, 1.0, 1.0, 0.9, 1.1];
const STARTS = LEGS.map((_, i) => LEGS.slice(0, i).reduce((a, b) => a + b, 0));
const CYCLE = LEGS.reduce((a, b) => a + b, 0);
const STICK = 1.4; // seconds an oil drop shows on the filter before the next one
const smoke = createCloud(260, { color: 0x8a98a8, size: 0.6, map: dot });
const smokeSeeds = Array.from({ length: 260 }, () => seed(CYCLE));
const oil = createCloud(110, { color: 0xe0a238, size: 0.13, map: dot });
const oilSeeds = Array.from({ length: 110 }, () => seed(LEGS[0] + STICK));
const bubbles = createParticles(scene, 40, { color: 0xfff4dc, size: 0.08, map: dot, seed: () => ({ a: Math.random() * Math.PI * 2, r: 0.2 + Math.random() * 0.75, t: Math.random(), s: 0.8 + Math.random() }) });

const P = new THREE.Vector3(), T = new THREE.Vector3(), N = new THREE.Vector3(), X = new THREE.Vector3(1, 0, 0);
const smooth = t => t * t * (3 - 2 * t);
// The plume above the kadhai. pull 0: it rises, widens, hits the hood and spills into the room.
// pull 1: it bends into the hood and ends on a filter. Returns the alpha.
function plume(s, t, pull, spread, out) {
  const k = parts.kadhai.group.position, fy = parts.filters.group.position.y - 0.04;
  const sx = k.x + s.dx * 0.55 * spread, sz = k.z + s.dz * 0.55 * spread, sy = k.y + OIL + 0.05;
  const sway = Math.sin(t * 6 + s.ph) * 0.15 * (1 - t);
  const e = smooth(t);
  const ax = sx + (s.fx - sx) * e + sway, az = sz + (s.fz - sz) * e, ay = sy + (fy - sy) * t;
  const rise = Math.min(1, t / 0.8), spill = Math.max(0, t - 0.8) / 0.2;
  const wx = sx + s.dx * 2.2 * rise + s.dx * 2.5 * spill + sway * 2, wz = sz + s.dz * 2 * rise + 3.5 * spill;
  const wy = sy + (-0.5 - sy) * rise + 0.5 * spill;
  out.set(wx + (ax - wx) * pull, wy + (ay - wy) * pull, wz + (az - wz) * pull);
  return Math.min(1, t / 0.12) * (1 - spill * (1 - pull));
}
// Inside: up from the filter to the inlet, round the wheel and the scroll, then up the duct and out.
function inside(s, leg, t, out) {
  if (leg === 1) {
    const f = parts.filters.group.position.y;
    const p0x = s.fx, p0y = f + 0.1, p0z = s.fz;
    const p1x = s.fx * 0.4 + 1.3, p1y = 1.0, p1z = ZC + (s.fz - ZC) * 0.4;
    const p2x = XC + W / 2 + 0.3, p2y = YC + s.jv[1] * 0.4, p2z = ZC + s.jv[0] * 0.4;
    const p3x = XC + 0.25, p3y = YC + s.jv[1] * 0.3, p3z = ZC + s.jv[0] * 0.3;
    const a = (1 - t) ** 3, b = 3 * (1 - t) ** 2 * t, c = 3 * (1 - t) * t * t, d = t ** 3;
    return out.set(a * p0x + b * p1x + c * p2x + d * p3x, a * p0y + b * p1y + c * p2y + d * p3y, a * p0z + b * p1z + c * p2z + d * p3z);
  }
  if (leg === 2) {
    let r, th, x;
    if (t < 0.25) { // thrown outward by the blades
      const k = t / 0.25; r = 0.3 + 0.45 * k; th = s.ph + 1.2 * k; x = XC + 0.25 + (s.lx - 0.25) * k;
    } else { // carried round the widening scroll to the outlet
      const k = (t - 0.25) / 0.75, start = (s.ph + 1.2) % (Math.PI * 2);
      th = start + (Math.PI * 2 - start) * k; r = 0.78 + (scrollR(th) - 0.78) * (0.25 + 0.6 * s.jr); x = XC + s.lx;
    }
    return out.set(x, YC + r * Math.sin(th), ZC + r * Math.cos(th));
  }
  if (leg === 3) {
    airPath.getPointAt(t, out); airPath.getTangentAt(t, T); N.crossVectors(T, X);
    const narrow = THREE.MathUtils.clamp((out.y - YC - H) / 0.4 + 1, 0.45, 1); // the outlet is narrower than the duct
    return out.addScaledVector(N, s.lz * 0.55 * narrow).setX(DUCT.x + s.lx * (out.y < YC + H ? 1 : 1.2));
  }
  // leg 4: out under the flap, spreading and sinking a little as it slows
  const z0 = parts.flap.group.position.z + WALL[0] - 0.6;
  return out.set(DUCT.x + s.lx * (1 + 2.5 * t), DUCT.y - 0.35 - 0.8 * t + s.lz * (0.6 + 1.6 * t), z0 - 2.6 * t);
}

// ---------- State and UI ----------
const state = {
  step: 0, explode: 0, targetExplode: 0, playing: true, focus: [], cut: false,
  fan: false, speed: 3, clog: false, load: 0, layersOn: false, layers: 0, rpm: 0, angle: 0, pull: 0, flap: 0, flame: 0,
};
let camGoal = null;
const story = createStoryUI({
  story: CHIMNEY_STORY, state,
  onStep: s => {
    state.focus = s.focus; state.cut = s.cut; state.fan = s.fan; state.clog = !!s.clog; state.layersOn = s.focus.includes('filters') && s.explode > 0;
    if (!state.clog) state.load = 0; // fresh filters, washed
    const v = VIEWS[s.view]; camGoal = { ...v, target: new THREE.Vector3(...v.target) };
    cam.theta = v.theta + THREE.MathUtils.euclideanModulo(cam.theta - v.theta + Math.PI, 2 * Math.PI) - Math.PI; // take the short way round
  },
});
bindRange('speed', v => { state.speed = v; });
createCallouts(stage, { parts, state, story: CHIMNEY_STORY });

const SHELLS = ['hood', 'duct', 'wall'];
const BLACK = new THREE.Color(0), LAMP = linear(0xfff1d6), LIT = linear(0xf7a35c);
const focusStyle = {
  highlight: 0.2,
  opacity(name, mesh, hot) {
    let alpha = 1;
    const shell = SHELLS.includes(name) || mesh.userData.cutaway;
    if (state.cut && shell) alpha = hot ? 0.3 : 0.12; // cut away to show the air inside
    else if (state.focus.length && !hot && looksInside(state)) alpha = 0.35;
    if (mesh.userData.flame) alpha *= state.flame;
    return alpha;
  },
  decorate(material, { mesh }) {
    if (!material.emissive) return;
    const glow = mesh.userData.glow ?? 0;
    if (mesh.userData.lamp) { material.emissive.copy(LAMP); material.emissiveIntensity = 1.5; }
    else if (mesh.userData.button !== undefined) {
      const on = mesh.userData.button === 0 || mesh.userData.button === shownSpeed();
      material.emissive.copy(on ? LIT : BLACK); material.emissiveIntensity = on ? 1.3 : 0;
    } else { material.emissive.copy(glow > 0.001 ? material.color : BLACK); material.emissiveIntensity = glow; }
  },
};
const shownSpeed = () => (state.fan ? state.speed : 0);

const readout = {
  box: document.getElementById('readout'), blower: document.getElementById('r-blower'), flow: document.getElementById('r-flow'),
  duct: document.getElementById('r-duct'), filters: document.getElementById('r-filters'),
};
function showReadout(flow) {
  readout.blower.textContent = state.rpm < 20 ? 'Off' : `${(Math.round(state.rpm / 10) * 10).toLocaleString('en-US')} rpm`;
  readout.flow.textContent = `${(Math.round(flow / 10) * 10).toLocaleString('en-US')} m³/h`;
  readout.duct.textContent = `${airSpeed(flow, ductArea()).toFixed(1)} m/s`;
  readout.filters.textContent = state.load < 0.02 ? 'Clean' : `${Math.round(state.load * 100)}% oily`;
  readout.box.classList.toggle('oily', state.load > 0.5);
}

// ---------- Sound ----------
// The motor hums at twice the 50 Hz mains, the air rushes louder and brighter as the blower
// speeds up, and the kadhai sizzles with little crackles. The touch buttons beep, and the
// flap clacks shut when the air stops.
const hum = sound.loop({ type: 'tone', wave: 'triangle', freq: 100 });
const rush = sound.loop({ type: 'noise', filter: 'bandpass', freq: 500, q: 0.6 });
const sizzle = sound.loop({ type: 'noise', filter: 'highpass', freq: 4500, q: 0.7 });
const was = { speed: shownSpeed(), flap: 0, crackle: 0 };
function playSounds(dt, run) {
  const on = state.playing ? 1 : 0;
  hum.set(0.03 * Math.min(1, run * 1.5) * on);
  rush.set(0.2 * run * on, 300 + 700 * run);
  sizzle.set(0.025 * on);
  was.crackle -= dt;
  if (on && was.crackle <= 0) { sound.noise({ gain: 0.03 + Math.random() * 0.05, release: 0.02, freq: 5500, q: 2 }); was.crackle = 0.05 + Math.random() * 0.3; }
  const speed = shownSpeed();
  if (speed !== was.speed && stage.intro.t >= 1) sound.tone({ freq: speed ? 1900 : 1400, gain: 0.08, release: 0.09 });
  was.speed = speed;
  if (state.flap < 0.05 && was.flap >= 0.05) { sound.click(0.25); sound.thunk(0.12); }
  was.flap = state.flap;
}

// ---------- Frame ----------
const CLEAN = linear(0xd5dae0), OILY = linear(0x8a5a1e);
let readoutTimer = 0;
startLoop(stage, (dt, now) => {
  update(state, focusStyle, reduced ? 1 : 0.09, dt);
  if (camGoal) { // ease to the step's view once; after that the reader's own orbit and zoom win
    const k = reduced ? 1 : Math.min(1, dt * 3);
    for (const a of ['r', 'theta', 'phi']) cam[a] += (camGoal[a] - cam[a]) * k;
    cam.target.lerp(camGoal.target, k);
    if (Math.abs(camGoal.r - cam.r) < 0.05 && Math.abs(camGoal.theta - cam.theta) < 0.005 && Math.abs(camGoal.phi - cam.phi) < 0.005 && cam.target.distanceTo(camGoal.target) < 0.02) camGoal = null;
  }
  const play = state.playing ? 1 : 0, ease = r => (reduced ? 1 : Math.min(1, dt * r));

  // Blower: spins up and coasts down; airflow follows its speed.
  if (play) {
    state.rpm += (CHIMNEY.rpm[shownSpeed()] - state.rpm) * ease(1.6);
    state.angle += dt * 14 * state.rpm / CHIMNEY.rpm[3];
    if (state.clog) state.load = Math.min(1, state.load + dt * 0.07);
  }
  wheel.rotation.x = -state.angle;
  const flow = airflowM3h(3, state.load) * state.rpm / CHIMNEY.rpm[3], run = state.rpm / CHIMNEY.rpm[3];
  state.pull += (Math.min(1, flow / 500) - state.pull) * ease(2.5);
  const flapTarget = Math.min(1.15, 1.25 * Math.sqrt(flow / 900));
  state.flap += (flapTarget - state.flap) * ease(flapTarget > state.flap ? 5 : 3);
  flap.rotation.x = state.flap;

  // Filters: the layers fan out in the filter step, and turn brown as they load with oil.
  state.layers += ((state.layersOn ? 1 : 0) - state.layers) * ease(3);
  const gap = 0.025 + 0.22 * state.layers;
  layers.forEach(sheet => {
    sheet.position.y = -0.03 + sheet.userData.layer * gap;
    [].concat(sheet.material).forEach(m => m.color.copy(CLEAN).lerp(OILY, state.load * 0.85));
  });

  // Flames flicker; pakoras bob in the oil, and bubbles pop round them.
  state.flame += (1 - state.flame) * ease(4);
  flames.children.forEach((f, i) => { f.scale.y = 0.5 + 0.5 * state.flame * (1 + Math.sin(now / 90 + i * 1.7) * 0.15); });
  pakoras.forEach((m, i) => { m.position.y = OIL + 0.04 + (reduced ? 0 : Math.sin(now / 260 + i * 2.1) * 0.015); });
  const k = parts.kadhai.group.position;
  if (bubbles.fade(reduced ? 0 : 0.85, 0.1)) {
    bubbles.seeds.forEach((b, i) => {
      if (play) { b.t += dt * b.s * 1.5; if (b.t > 1) { b.t = 0; b.a = Math.random() * Math.PI * 2; b.r = 0.2 + Math.random() * 0.75; } }
      bubbles.place(i, k.x + Math.cos(b.a) * b.r, k.y + OIL + 0.01 + b.t * 0.05, k.z + Math.sin(b.a) * b.r);
    });
    bubbles.commit();
  }

  // Smoke: up from the kadhai, and with the blower on, through the hood and out of the wall.
  const f = flow / 900, through = THREE.MathUtils.smoothstep(state.pull, 0.1, 0.5);
  smokeSeeds.forEach((s, i) => {
    let leg = STARTS.findLastIndex(start => s.u >= start);
    if (play) {
      s.u += dt * (leg === 0 ? 0.45 + 0.55 * state.pull : Math.max(0.3, f));
      if (leg === 0 && s.u >= LEGS[0] && state.pull < 0.5) s.u -= LEGS[0]; // no draw: the plume spills into the room
      if (s.u >= CYCLE) s.u -= CYCLE;
      leg = STARTS.findLastIndex(start => s.u >= start);
    }
    const t = (s.u - STARTS[leg]) / LEGS[leg];
    let alpha;
    if (leg === 0) alpha = 0.4 * plume(s, t, state.pull, 1, P);
    else { inside(s, leg, t, P); alpha = 0.4 * through * (leg === 4 ? 1 - t : 1); }
    smoke.place(i, P, alpha);
  });
  smoke.commit();

  // Oil: the drops ride the plume and stick to the first layer of mesh they reach.
  oilSeeds.forEach((s, i) => {
    if (play) {
      s.u += dt * (s.u < LEGS[0] ? 0.45 + 0.55 * state.pull : 1);
      if (s.u >= LEGS[0] && state.pull < 0.5 && s.u < LEGS[0] + dt * 2) s.u = 0;
      if (s.u >= LEGS[0] + STICK) s.u = 0;
    }
    let alpha;
    if (s.u < LEGS[0]) alpha = 0.9 * plume(s, s.u / LEGS[0], state.pull, 0.7, P);
    else { plume(s, 1, 1, 0.7, P); P.y = parts.filters.group.position.y - 0.035; alpha = 0.9 * (1 - (s.u - LEGS[0]) / STICK); }
    oil.place(i, P, alpha);
  });
  oil.commit();

  playSounds(dt, run);
  readoutTimer -= dt;
  if (readoutTimer <= 0) { showReadout(flow); readoutTimer = 0.15; }
});
story.setStep(0, false);
