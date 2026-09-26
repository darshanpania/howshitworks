import * as THREE from 'three';
import { reducedMotion } from './loop.js';

// Engineering-drawing callouts: a dot on each part in focus, a thin leader line that
// breaks at 45° to a numbered balloon, and the step's part name. The balloon sits on the
// outer side of the part so it never covers the middle of the model, and it stays clear of
// the title at the top and the play bar at the bottom.
//
// A part can set object.userData.anchor = [x, y, z] (in its own frame) to choose the point
// the line meets; with userData.anchorStatic it ignores the spin of its parents (blades).
const SVG = 'http://www.w3.org/2000/svg';
const pad = n => String(n).padStart(2, '0');
const v = new THREE.Vector3(), c = new THREE.Vector3(), bounds = new THREE.Box3();

export function createCallouts(stage, { parts, state, story, max = 3, doc = document }) {
  const host = stage.renderer.domElement.parentElement;
  if (!host || stage.capture) return null;
  const layer = doc.createElement('div'); layer.className = 'callouts'; layer.setAttribute('aria-hidden', 'true');
  const svg = doc.createElementNS(SVG, 'svg'); svg.setAttribute('class', 'callout-lines');
  const label = doc.createElement('div'); label.className = 'callout-label';
  label.innerHTML = '<span class="callout-n"></span><span class="callout-t"></span>';
  layer.append(svg, label); host.append(layer);
  const make = (tag, cls) => { const el = doc.createElementNS(SVG, tag); el.setAttribute('class', cls); svg.append(el); return el; };
  const leaders = Array.from({ length: max }, () => { const p = make('path', 'leader'); p.setAttribute('pathLength', '1'); return p; });
  const halos = Array.from({ length: max }, () => make('circle', 'callout-halo'));
  const dots = Array.from({ length: max }, () => make('circle', 'callout-dot'));
  dots.forEach(d => d.setAttribute('r', '3.5')); halos.forEach(h => h.setAttribute('r', '4'));

  let shownStep = -1, names = [], showAt = 0, pos = null, size = { w: 0, h: 0 };
  const safe = { top: 0, bottom: 0 };

  // Where the line meets the part, in world space, plus the part's bounding box in its
  // group's frame (so the balloon can sit clear of it). Both are cached per part.
  function anchor(name) {
    const p = parts[name]; if (!p) return null;
    const object = p.group.children[0];
    if (!p.anchor) {
      if (object.userData.anchor) p.anchor = new THREE.Vector3(...object.userData.anchor).applyMatrix4(object.matrix);
      else {
        p.group.updateWorldMatrix(true, true);
        bounds.setFromObject(p.group);
        if (bounds.isEmpty()) return null;
        p.anchor = p.group.worldToLocal(bounds.getCenter(new THREE.Vector3()));
        p.box = [0, 1, 2, 3, 4, 5, 6, 7].map(i => p.group.worldToLocal(new THREE.Vector3(
          i & 1 ? bounds.max.x : bounds.min.x, i & 2 ? bounds.max.y : bounds.min.y, i & 4 ? bounds.max.z : bounds.min.z)));
      }
    }
    if (object.userData.anchorStatic) return p.root.localToWorld(v.copy(p.anchor).add(p.group.position));
    return p.group.localToWorld(v.copy(p.anchor));
  }
  // Grows rect by the part's box as seen on screen.
  function extend(name, rect) {
    const p = parts[name];
    if (!p?.box || p.group.children[0].userData.anchorStatic) return;
    for (const corner of p.box) {
      p.group.localToWorld(c.copy(corner)).project(stage.camera);
      if (c.z > 1) continue;
      const x = (c.x + 1) / 2 * size.w, y = (1 - c.y) / 2 * size.h;
      rect.l = Math.min(rect.l, x); rect.r = Math.max(rect.r, x); rect.t = Math.min(rect.t, y);
    }
  }

  function measure() {
    size = { w: host.clientWidth, h: host.clientHeight };
    const box = host.getBoundingClientRect();
    const brand = host.querySelector('.brand')?.getBoundingClientRect();
    const hud = host.querySelector('.hud')?.getBoundingClientRect();
    safe.top = brand ? brand.bottom - box.top + 14 : 16;
    safe.bottom = hud ? hud.top - box.top - 14 : size.h - 16;
  }
  let measureTimer = 0;

  function update() {
    if (state.step !== shownStep) {
      shownStep = state.step; names = (state.focus ?? []).slice(0, max);
      layer.classList.remove('on', 'draw');
      showAt = performance.now() + (reducedMotion ? 0 : 520);
      label.querySelector('.callout-n').textContent = pad(state.step + 1);
      label.querySelector('.callout-t').textContent = story[state.step]?.part ?? '';
      pos = null;
    }
    const ready = stage.intro.t >= 1 && performance.now() >= showAt && names.length > 0;
    if (!ready) return;
    if (--measureTimer <= 0 || size.w !== host.clientWidth || size.h !== host.clientHeight) { measure(); measureTimer = 30; }
    const { w, h } = size;
    const points = names.map(name => {
      const world = anchor(name); if (!world) return null;
      world.project(stage.camera);
      if (world.z > 1 || world.z < -1) return null;
      return { x: (world.x + 1) / 2 * w, y: (1 - world.y) / 2 * h };
    });
    const first = points.find(Boolean);
    const room = safe.bottom - safe.top;
    if (!first || room < 40 || first.x < 0 || first.x > w || first.y < 0 || first.y > h) { layer.classList.remove('on'); return; }

    const lw = label.offsetWidth, lh = label.offsetHeight;
    const reach = Math.max(26, Math.min(64, w * 0.05));
    const rect = { l: first.x, r: first.x, t: first.y };
    names.forEach(name => extend(name, rect));
    // Beside the parts in focus, on the side they lean toward (or the side used last, so it
    // does not flip back and forth). If the balloon would cross its own anchor to fit on
    // screen, try the other side; if neither fits (narrow phones), it sits above the parts.
    const clampX = x => Math.max(12, Math.min(w - lw - 12, x));
    const clear = (s, x) => (s > 0 ? x - 12 > first.x : x + lw + 12 < first.x);
    const prefer = pos?.side || (first.x > w * 0.5 ? 1 : -1);
    let side = 0, lx = clampX(first.x - lw / 2), ly = Math.min(rect.t, first.y - reach) - lh - 10;
    for (const s of [prefer, -prefer]) {
      const out = Math.min(w * 0.22, Math.max(reach, s > 0 ? rect.r - first.x : first.x - rect.l) + 18);
      const x = clampX(s > 0 ? first.x + out : first.x - out - lw);
      if (clear(s, x)) { side = s; lx = x; ly = first.y - reach - lh / 2; break; }
    }
    ly = Math.max(safe.top, Math.min(safe.bottom - lh, ly));
    if (!pos || pos.side !== side) pos = { x: lx, y: ly, side };
    else { pos.x += (lx - pos.x) * 0.2; pos.y += (ly - pos.y) * 0.2; }
    label.style.transform = `translate(${pos.x.toFixed(1)}px, ${pos.y.toFixed(1)}px)`;

    // Beside: the elbow sits just outside the balloon, level with its middle.
    // Above: the lines rise to the balloon's lower edge.
    const ey = side ? pos.y + lh / 2 : pos.y + lh;
    const edge = side > 0 ? pos.x : pos.x + lw;
    points.forEach((p, i) => {
      const on = !!p;
      dots[i].style.display = halos[i].style.display = leaders[i].style.display = on ? '' : 'none';
      if (!on) return;
      dots[i].setAttribute('cx', p.x.toFixed(1)); dots[i].setAttribute('cy', p.y.toFixed(1));
      halos[i].setAttribute('cx', p.x.toFixed(1)); halos[i].setAttribute('cy', p.y.toFixed(1));
      let d;
      if (side) {
        // 45° out of the part, then level into the elbow.
        const ex = side > 0 ? pos.x - 12 : pos.x + lw + 12;
        const dy = ey - p.y, bend = p.x + Math.sign(ex - p.x || side) * Math.min(Math.abs(dy), Math.abs(ex - p.x));
        d = `M${p.x.toFixed(1)} ${p.y.toFixed(1)} L${bend.toFixed(1)} ${ey.toFixed(1)} L${ex.toFixed(1)} ${ey.toFixed(1)}${i === 0 ? ` L${edge.toFixed(1)} ${ey.toFixed(1)}` : ''}`;
      } else {
        const ex = Math.max(pos.x + 14, Math.min(pos.x + lw - 14, p.x));
        d = `M${p.x.toFixed(1)} ${p.y.toFixed(1)} L${ex.toFixed(1)} ${ey.toFixed(1)}`;
      }
      leaders[i].setAttribute('d', d);
    });
    for (let i = points.length; i < max; i++) dots[i].style.display = halos[i].style.display = leaders[i].style.display = 'none';
    if (!layer.classList.contains('on')) layer.classList.add('on', 'draw');
  }

  stage.afterRender(update);
  return { update };
}
