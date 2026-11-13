import * as THREE from 'three';

const pad = n => String(n).padStart(2, '0');

// The step a part belongs to: the first step that puts it in focus. A part in focus on the
// current step returns the current step, so a tap on it changes nothing.
// focusOf(i) gives the part names of step i (pages may rename story names to part names).
export function stepForPart(name, steps, current, focusOf = i => steps[i].focus ?? []) {
  if (focusOf(current)?.includes(name)) return current;
  for (let i = 0; i < steps.length; i++) if (focusOf(i)?.includes(name)) return i;
  return -1;
}

// Of the meshes under the pointer (nearest first), the reader means the first solid one.
// X-ray ghosts are see-through, so a tap goes through them to the part behind; a ghost
// counts only when nothing solid is behind it. hits: [{ name, alpha, step }].
export function choosePick(hits) {
  const known = hits.filter(h => h.step >= 0 && h.alpha > 0.02);
  return known.find(h => h.alpha >= 0.4) ?? known[0] ?? null;
}

// Tap a part on the model to go to its step; tap twice to reset the view. With a mouse, the part under the pointer
// shows the step it leads to. A drag still orbits: only a short, still press counts as a tap.
export function createPicking(stage, { parts, state, story, doc = document }) {
  const canvas = stage.renderer.domElement, host = canvas.parentElement;
  if (!host) return null;
  const tip = doc.createElement('div'); tip.className = 'part-tip'; tip.setAttribute('aria-hidden', 'true');
  tip.innerHTML = '<span class="callout-n"></span><span class="part-tip-t"></span>';
  host.append(tip);

  // Pages may map story names to part names in onStep, so remember what each step really focused.
  const seen = {};
  const focusOf = i => seen[i] ?? story[i].focus ?? [];
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  let meshes = null;
  const shown = o => { for (; o; o = o.parent) if (!o.visible) return false; return true; };

  function pick(x, y) {
    const box = canvas.getBoundingClientRect();
    ndc.set(((x - box.left) / box.width) * 2 - 1, 1 - ((y - box.top) / box.height) * 2);
    ray.setFromCamera(ndc, stage.camera);
    if (!meshes) {
      meshes = [];
      Object.entries(parts).forEach(([name, p]) => p.meshes.forEach(m => { m.userData.part = name; meshes.push(m); }));
    }
    const hits = ray.intersectObjects(meshes, false).filter(h => shown(h.object)).map(h => {
      const name = h.object.userData.part;
      return { name, alpha: h.object.userData.alpha ?? 1, step: stepForPart(name, story, state.step, focusOf) };
    });
    return choosePick(hits);
  }

  // A tap that ends the intro is not a pick: taps count from a moment after the model has settled.
  let down = null, hover = null, at = null, moved = false, checked = 0, lastTap = null, readyAt = Infinity;
  canvas.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId }; hide(); });
  canvas.addEventListener('pointerup', e => {
    const d = down; down = null;
    if (!d || d.t < readyAt + 300 || d.id !== e.pointerId || performance.now() - d.t > 500 || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6) return;
    // Two taps close together reset the view; one tap on a part goes to its step.
    const now = performance.now();
    if (lastTap && now - lastTap.t < 350 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 24) { lastTap = null; state.resetView?.(); return; }
    lastTap = { x: e.clientX, y: e.clientY, t: now };
    const hit = pick(e.clientX, e.clientY);
    if (hit && hit.step !== state.step) state.goTo?.(hit.step, 'model');
  });
  canvas.addEventListener('pointercancel', () => { down = null; });
  canvas.addEventListener('pointermove', e => { if (e.pointerType === 'mouse' && !e.buttons) { at = { x: e.clientX, y: e.clientY }; moved = true; } });
  canvas.addEventListener('pointerleave', () => { at = null; hide(); });

  function hide() { hover = null; tip.classList.remove('on'); canvas.style.cursor = ''; }
  // One ray when the mouse moves, and one now and then while it rests: parts move under a still pointer.
  stage.afterRender(() => {
    if (state.focus && !seen[state.step]) seen[state.step] = state.focus.slice();
    if (stage.intro.t < 1) return;
    const now = performance.now();
    if (readyAt === Infinity) readyAt = now;
    if (!at || down || !(moved || now - checked > 400)) return;
    moved = false; checked = now;
    const { x, y } = at;
    const hit = pick(x, y);
    if (!hit || hit.step === state.step) return hide();
    if (hover !== hit.step) {
      hover = hit.step;
      tip.querySelector('.callout-n').textContent = pad(hit.step + 1);
      tip.querySelector('.part-tip-t').textContent = story[hit.step].t;
    }
    const box = host.getBoundingClientRect(), w = tip.offsetWidth;
    const left = Math.max(8, Math.min(box.width - w - 8, x - box.left + 14));
    tip.style.transform = `translate(${left.toFixed(0)}px, ${(y - box.top + 18).toFixed(0)}px)`;
    tip.classList.add('on'); canvas.style.cursor = 'pointer';
  });
  return { pick };
}
