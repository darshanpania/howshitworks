import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { studioEnvironment, addStudioLights, gridFloor, contactShadow } from './engine/studio.js';
import { reducedMotion } from './engine/loop.js';
import { springGeometry } from './kit/shapes.js';
import { track } from './analytics.js';

// The landing-page hero: the copper open-cube logo, built in 3D. It starts shut, exactly
// like the mark, then opens up. The lid lifts, the two front walls part, and a small
// machine inside comes apart in layers: a gear train, a copper coil and a spring.
// The pointer tilts the view, scrolling past closes the box, and a tap opens or shuts it.

const pbrColor = hex => new THREE.Color(hex).convertSRGBToLinear();

// A spur gear: `teeth` teeth on pitch radius r, with a bore and lightening holes.
function gearGeometry(r, teeth, thick) {
  const s = new THREE.Shape(), step = Math.PI * 2 / teeth, root = r - 0.055, tip = r + 0.05;
  for (let i = 0; i < teeth; i++) {
    const a = i * step;
    [[root, 0], [root, 0.2], [tip, 0.34], [tip, 0.56], [root, 0.7]].forEach(([rr, f], j) => {
      const x = Math.cos(a + f * step) * rr, y = Math.sin(a + f * step) * rr;
      if (i === 0 && j === 0) s.moveTo(x, y); else s.lineTo(x, y);
    });
  }
  s.closePath();
  s.holes.push(new THREE.Path().absarc(0, 0, r * 0.2, 0, Math.PI * 2, true));
  if (r > 0.3) for (let k = 0; k < 5; k++) {
    const a = k / 5 * Math.PI * 2;
    s.holes.push(new THREE.Path().absarc(Math.cos(a) * r * 0.56, Math.sin(a) * r * 0.56, r * 0.16, 0, Math.PI * 2, true));
  }
  const geo = new THREE.ExtrudeGeometry(s, { depth: thick, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.012, bevelSegments: 2, curveSegments: 12 });
  geo.translate(0, 0, -thick / 2); geo.rotateX(-Math.PI / 2);
  return geo;
}

export function mountHero(canvas, { labels: labelHost = null, toggle = null } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 2));
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  scene.environment = studioEnvironment(renderer);
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  const before = [];
  const stage = { renderer, scene, camera, pbr: true, beforeRender: fn => before.push(fn) };
  addStudioLights(stage, { key: [-4, 8, 6], extent: 4, far: 20 });

  // ---------- Materials ----------
  const enamel = hex => new THREE.MeshPhysicalMaterial({ color: pbrColor(hex), roughness: 0.5, metalness: 0.05, clearcoat: 0.6, clearcoatRoughness: 0.3, envMapIntensity: 0.55 });
  const M = {
    top: enamel(0xcf7f47), left: enamel(0xc4703a), right: enamel(0xd98b52), back: enamel(0xb86a38),
    base: new THREE.MeshStandardMaterial({ color: pbrColor(0x2b2621), roughness: 0.6, metalness: 0.2 }),
    brass: new THREE.MeshStandardMaterial({ color: pbrColor(0xd6a44a), roughness: 0.28, metalness: 0.9 }),
    steel: new THREE.MeshStandardMaterial({ color: pbrColor(0xd4d9de), roughness: 0.22, metalness: 0.9 }),
    iron: new THREE.MeshStandardMaterial({ color: pbrColor(0x4a525b), roughness: 0.5, metalness: 0.6 }),
    copper: new THREE.MeshStandardMaterial({ color: pbrColor(0xc4703a), roughness: 0.3, metalness: 0.85, emissive: pbrColor(0xff7a2a), emissiveIntensity: 0 }),
  };

  // ---------- The box and the machine ----------
  // Each part: its group, where it sits shut, and the way it moves when the box opens.
  const root = new THREE.Group(); scene.add(root);
  const parts = [];
  function part(object, offset, { tilt = [0, 0, 0], delay = 0 } = {}) {
    const group = new THREE.Group(); group.add(object); root.add(group);
    object.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    const p = { group, offset: new THREE.Vector3(...offset), tilt, delay, amount: 0, speed: 0 };
    parts.push(p); return p;
  }
  const W = 2, T = 0.12, H = 1.86, R = 0.035;
  const slab = (w, h, d, mat, pos) => { const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, R), mat); m.position.set(...pos); return m; };

  const base = slab(W, 0.14, W, M.base, [0, -1.0, 0]);
  part(base, [0, 0, 0]);
  const back = new THREE.Group();
  back.add(slab(W, H, T, M.back, [0, -0.02, -(W - T) / 2]), slab(T, H, W - T, M.back, [-(W - T) / 2, -0.02, T / 2]));
  const pBack = part(back, [-0.18, -0.02, -0.18]);
  // The two walls facing the viewer part sideways (screen left and right), like the logo.
  const pLeft = part(slab(W - T, H, T, M.left, [T / 2, -0.02, (W - T) / 2]), [-1.0, -0.06, 1.0], { tilt: [0, -0.18, 0], delay: 0.08 });
  const pRight = part(slab(T, H, W - T, M.right, [(W - T) / 2, -0.02, -T / 2]), [1.0, -0.06, -1.0], { tilt: [0, 0.18, 0], delay: 0.08 });
  // The lid lifts and leans its top toward the viewer, so it reads as the logo's top face.
  const lid = slab(W + 0.04, 0.16, W + 0.04, M.top, [0, 0, 0]);
  const lidPivot = new THREE.Group(); lidPivot.position.y = 1.0; lidPivot.add(lid);
  const pLid = part(lidPivot, [0, 1.75, 0], { tilt: [0.13, 0, -0.14], delay: 0 });

  // Gear train: a 16-tooth brass gear drives an 8-tooth steel pinion, 2:1.
  const gears = new THREE.Group();
  const big = new THREE.Mesh(gearGeometry(0.5, 16, 0.12), M.brass), small = new THREE.Mesh(gearGeometry(0.25, 8, 0.12), M.steel);
  const bigAt = new THREE.Vector3(-0.22, -0.84, -0.18), smallAt = bigAt.clone().add(new THREE.Vector3(0.53, 0, 0.53));
  big.position.copy(bigAt); small.position.copy(smallAt); gears.add(big, small);
  [bigAt, smallAt].forEach(p => { const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.3, 16), M.steel); pin.position.copy(p); gears.add(pin); });
  const pGears = part(gears, [0, 0.2, 0], { delay: 0.3 });

  // Motor: an iron core with twelve copper windings, on the big gear's shaft.
  const motor = new THREE.Group();
  const core = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.42, 40), M.iron); motor.add(core);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.26, 0.08, 32), M.steel); cap.position.y = 0.25; motor.add(cap);
  for (let i = 0; i < 14; i++) {
    const a = i / 14 * Math.PI * 2;
    const coil = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.042, 10, 24), M.copper);
    coil.position.set(Math.cos(a) * 0.4, 0, Math.sin(a) * 0.4); coil.lookAt(0, 0, 0); motor.add(coil);
  }
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 1.0, 16), M.steel); shaft.position.y = -0.2; motor.add(shaft);
  motor.position.set(bigAt.x, -0.3, bigAt.z);
  const pMotor = part(motor, [0, 0.95, 0], { delay: 0.2 });

  // A compression spring standing in the back corner.
  const springLen = 0.9;
  const spring = new THREE.Mesh(springGeometry(springLen, { turns: 8, radius: 0.13, wire: 0.028 }), M.steel);
  spring.position.set(0.5, -0.93, -0.55);
  const pSpring = part(spring, [0.35, 0.55, -0.35], { delay: 0.38 });

  // ---------- Floor ----------
  const floor = new THREE.Group(); floor.position.y = -1.07; scene.add(floor);
  floor.add(gridFloor(7.5, { cell: 0.5, opacity: 0.2 }));
  contactShadow(stage, floor, { size: 7, height: 4, blur: 3.2, darkness: 1.3 });

  // ---------- Labels ----------
  // Leader lines from three parts to small mono labels, like notes on a drawing.
  const NOTES = [
    { p: pLid, at: [0.55, 0.08, 0.55], text: 'Lid', dx: 1, dy: -1 },
    { p: pMotor, at: [-0.28, 0, 0.28], text: 'Copper coil', dx: -1, dy: -1 },
    { p: pGears, at: [0.95, -0.84, 0.3], text: 'Gears · 2 : 1', dx: 1, dy: 1 },
  ];
  let notes = [];
  if (labelHost) {
    const SVG = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(SVG, 'svg'); svg.setAttribute('class', 'hero-lines'); svg.setAttribute('aria-hidden', 'true');
    labelHost.append(svg);
    notes = NOTES.map(n => {
      const path = document.createElementNS(SVG, 'path'); path.setAttribute('pathLength', '1'); svg.append(path);
      const dot = document.createElementNS(SVG, 'circle'); dot.setAttribute('r', '3'); svg.append(dot);
      const el = document.createElement('span'); el.className = 'hero-note'; el.textContent = n.text; el.setAttribute('aria-hidden', 'true');
      labelHost.append(el);
      return { ...n, path, dot, el, local: new THREE.Vector3(...n.at) };
    });
  }

  // ---------- Motion ----------
  const view = { theta: 0.8, phi: 1.02, r: 10.4, target: new THREE.Vector3(0, 0.35, 0) };
  const aim = { x: 0, y: 0 }, tilt = { x: 0, y: 0 };
  let open = true, openedAt = performance.now() + (reducedMotion ? -9999 : 900), scrolled = 0, visible = true, hovered = false;
  const host = canvas.parentElement;
  host.addEventListener('pointermove', e => {
    if (e.pointerType !== 'mouse') return;
    const box = host.getBoundingClientRect();
    aim.x = (e.clientX - box.left) / box.width * 2 - 1; aim.y = (e.clientY - box.top) / box.height * 2 - 1;
    hovered = true;
  });
  host.addEventListener('pointerleave', () => { aim.x = 0; aim.y = 0; hovered = false; });
  // The toggle button's click bubbles up here too, so one listener serves mouse, touch and keys.
  host.addEventListener('click', () => {
    open = !open; track('hero_toggled', { open });
    if (toggle) { toggle.textContent = open ? 'Shut the box' : 'Open the box'; toggle.setAttribute('aria-pressed', String(open)); }
  });
  const onScroll = () => {
    const box = host.getBoundingClientRect();
    scrolled = Math.min(1, Math.max(0, -box.top / Math.max(1, box.height)));
  };
  addEventListener('scroll', onScroll, { passive: true }); onScroll();
  new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; }).observe(host);

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight, pr = renderer.getPixelRatio();
    if (canvas.width !== Math.floor(w * pr) || canvas.height !== Math.floor(h * pr)) {
      renderer.setSize(w, h, false); camera.aspect = w / h;
      // Pull back on tall, narrow canvases so the open box still fits side to side.
      view.r = 10.4 * Math.max(1, 1.25 / camera.aspect);
      camera.updateProjectionMatrix();
    }
  }

  const clock = { last: performance.now(), t: 0 };
  let spin = 0;
  function frame(now) {
    const dt = Math.min(0.05, (now - clock.last) / 1000); clock.last = now; clock.t += dt;
    resize();
    // How open the box wants to be: shut at first, then open with a slow breath,
    // a little wider under the mouse, and closing as the hero scrolls away.
    const started = now > openedAt;
    const breath = reducedMotion ? 1 : 0.93 + 0.07 * Math.sin(clock.t * 0.9);
    const want = (started && open ? breath * (hovered ? 1.08 : 1) : 0) * (1 - scrolled * 0.85);
    parts.forEach(p => {
      const late = now > openedAt + p.delay * 1000 || !open;
      const target = late ? want : 0;
      if (reducedMotion) { p.amount = target; p.speed = 0; }
      else {
        p.speed = p.speed * Math.exp(-11 * dt) + (target - p.amount) * 120 * dt;
        p.amount += p.speed * dt;
      }
      p.group.position.copy(p.offset).multiplyScalar(p.amount);
      p.group.rotation.set(p.tilt[0] * p.amount, p.tilt[1] * p.amount, p.tilt[2] * p.amount);
    });
    // The machine runs while the box is open: gears mesh at 2:1 and the coil glows.
    const run = Math.max(0, Math.min(1, pMotor.amount));
    if (!reducedMotion) spin += dt * 1.1 * run;
    big.rotation.y = spin; small.rotation.y = -spin * 2 + Math.PI / 8;
    motor.rotation.y = spin;
    M.copper.emissiveIntensity = run * (0.18 + 0.1 * Math.sin(clock.t * 3));
    const squeeze = reducedMotion ? 1 : 0.86 + 0.14 * Math.sin(clock.t * 2.2);
    spring.scale.y = 1 - (1 - squeeze) * run;

    // The view drifts and follows the mouse; ease so it never snaps.
    const k = reducedMotion ? 1 : Math.min(1, dt * 3);
    tilt.x += (aim.x - tilt.x) * k; tilt.y += (aim.y - tilt.y) * k;
    const sway = reducedMotion ? 0 : Math.sin(clock.t * 0.25) * 0.12;
    const theta = view.theta + sway + tilt.x * 0.28 + scrolled * 0.6, phi = view.phi + tilt.y * 0.1 - scrolled * 0.15;
    camera.position.set(
      view.target.x + view.r * Math.sin(phi) * Math.sin(theta),
      view.target.y + view.r * Math.cos(phi),
      view.target.z + view.r * Math.sin(phi) * Math.cos(theta));
    camera.lookAt(view.target);
    scene.updateMatrixWorld();
    before.forEach(fn => fn());
    renderer.render(scene, camera);
    placeNotes(Math.min(pLid.amount, pGears.amount));
  }

  const v = new THREE.Vector3();
  function placeNotes(amount) {
    if (!notes.length) return;
    const w = canvas.clientWidth, h = canvas.clientHeight, on = amount > 0.75;
    labelHost.classList.toggle('on', on);
    if (!on) return;
    const reach = Math.min(46, w * 0.07);
    notes.forEach(n => {
      n.p.group.localToWorld(v.copy(n.local)).project(camera);
      const x = (v.x + 1) / 2 * w, y = (1 - v.y) / 2 * h;
      const ex = x + n.dx * reach, ey = y + n.dy * reach, lx = ex + n.dx * 26;
      n.path.setAttribute('d', `M${x.toFixed(1)} ${y.toFixed(1)} L${ex.toFixed(1)} ${ey.toFixed(1)} L${lx.toFixed(1)} ${ey.toFixed(1)}`);
      n.dot.setAttribute('cx', x.toFixed(1)); n.dot.setAttribute('cy', y.toFixed(1));
      const lw = n.el.offsetWidth;
      n.el.style.transform = `translate(${(n.dx > 0 ? lx + 6 : lx - 6 - lw).toFixed(1)}px, ${(ey - 9).toFixed(1)}px)`;
    });
  }

  function loop(now) {
    if (visible && !document.hidden) frame(now); else clock.last = now;
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(now => { frame(now); host.classList.add('ready'); requestAnimationFrame(loop); });
}
