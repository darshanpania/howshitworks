import { track, appliance } from '../analytics.js';
import { nextAppliance } from '../catalog.js';
import { reducedMotion } from './loop.js';

const pad = n => String(n).padStart(2, '0');

// Maps a keydown to a story action, or null to leave the key alone.
// Typing in a field or dragging a slider keeps its own keys; Space on a button or link
// already clicks it, so it is not handled twice.
export function keyAction({ key, target, altKey, ctrlKey, metaKey, repeat }) {
  if (altKey || ctrlKey || metaKey) return null;
  const tag = target?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable) return null;
  if (key === 'ArrowRight') return 'next';
  if (key === 'ArrowLeft') return 'prev';
  if (repeat) return null;
  if (key === 'e' || key === 'E') return 'explode';
  if (key === ' ' || key === 'Spacebar') return ['BUTTON', 'A', 'SUMMARY'].includes(tag) ? null : 'play';
  return null;
}

// Shows a range input's value in its <output id="<id>-out"> and fills the track up to the thumb.
export function showRange(input, text) {
  const min = Number(input.min || 0), max = Number(input.max || 100), v = Number(input.value);
  input.style.setProperty('--fill', `${((v - min) / (max - min)) * 100}%`);
  const out = input.ownerDocument.getElementById(`${input.id}-out`);
  if (out) out.textContent = text ?? `${v}/${max}`;
}

// Builds the step list and wires Back, Next, Play, Explode, the phone Controls sheet,
// the progress bar and the keyboard. state needs: step, playing, targetExplode.
// onStep(step, index) applies the rest.
export function createStoryUI({ story, state, onStep, doc = document, slug = appliance }) {
  const $ = id => doc.getElementById(id);
  const list = $('steps'), explode = $('explode'), play = $('play'), prev = $('prev'), next = $('next');
  const bar = $('progress'), count = $('progress-count');
  const onward = nextAppliance(slug), last = story.length - 1;
  story.forEach((s, i) => {
    const b = doc.createElement('button'); b.className = 'step'; b.id = `step-${i}`;
    b.innerHTML = `<span class="n">${pad(i + 1)}</span><span><span class="t">${s.t}</span><span class="d">${s.d}</span><span class="part">${s.part}</span></span>`;
    b.addEventListener('click', () => setStep(i, true, 'list'));
    list.append(b);
  });

  const showExplode = () => showRange(explode, `${explode.value}%`);
  function setExplode(v) { state.targetExplode = v; explode.value = String(Math.round(v * 100)); showExplode(); }

  // source is how the reader got here: 'list', 'next', 'prev' or 'key'. Internal calls pass none.
  function setStep(index, scroll = true, source) {
    state.step = Math.max(0, Math.min(last, index));
    const s = story[state.step];
    if (source) track('story_step_viewed', { step: state.step + 1, step_title: s.t, steps_total: story.length, source });
    setExplode(s.explode);
    list.querySelectorAll('.step').forEach((el, j) => {
      el.classList.toggle('active', j === state.step);
      if (j === state.step) el.setAttribute('aria-current', 'step'); else el.removeAttribute('aria-current');
    });
    if (scroll) $(`step-${state.step}`).scrollIntoView({ block: 'nearest', behavior: reducedMotion ? 'auto' : 'smooth' });
    // Back is disabled on the first step; keep keyboard focus on the footer when that happens.
    const refocus = state.step === 0 && doc.activeElement === prev;
    prev.disabled = state.step === 0;
    if (refocus) next.focus();
    const atEnd = state.step === last;
    next.textContent = atEnd ? `${onward.label} →` : 'Next';
    next.classList.toggle('primary', atEnd);
    if (bar) {
      bar.style.setProperty('--progress', `${((state.step + 1) / story.length) * 100}%`);
      bar.setAttribute('aria-valuenow', String(state.step + 1));
      bar.setAttribute('aria-valuetext', `Step ${state.step + 1} of ${story.length}: ${s.t}`);
    }
    if (count) count.textContent = `${pad(state.step + 1)} / ${pad(story.length)}`;
    onStep(s, state.step);
  }

  function showPlaying() {
    play.setAttribute('aria-pressed', String(state.playing));
    play.setAttribute('aria-label', state.playing ? 'Pause animation' : 'Play animation');
  }
  function togglePlay(source = 'button') {
    state.playing = !state.playing; showPlaying();
    track('playback_toggled', { playing: state.playing, step: state.step + 1, source });
  }
  function goNext(source) {
    if (state.step < last) return setStep(state.step + 1, true, source);
    if (source === 'key') return; // the keyboard never leaves the page
    track('next_appliance_clicked', { from: slug, to: onward.slug, steps_total: story.length });
    doc.defaultView.location.assign(onward.href);
  }

  play.addEventListener('click', () => togglePlay());
  explode.addEventListener('input', e => { state.targetExplode = e.target.value / 100; showExplode(); });
  explode.addEventListener('change', e => track('control_changed', { control: 'explode', value: Number(e.target.value), step: state.step + 1 }));
  prev.addEventListener('click', () => setStep(state.step - 1, true, 'prev'));
  next.addEventListener('click', () => goNext('next'));
  showPlaying();

  // Phone: the sliders live in a small sheet opened by the Controls button.
  const hud = play.closest('.hud'), toggle = $('controls-toggle');
  function setSheet(open) { hud.classList.toggle('open', open); toggle.setAttribute('aria-expanded', String(open)); }
  if (toggle) {
    toggle.addEventListener('click', () => setSheet(toggle.getAttribute('aria-expanded') !== 'true'));
    doc.addEventListener('pointerdown', e => { if (!hud.contains(e.target)) setSheet(false); });
  }

  doc.addEventListener('keydown', e => {
    if (e.key === 'Escape' && hud.classList.contains('open')) { setSheet(false); toggle.focus(); return; }
    const action = keyAction(e);
    if (!action) return;
    e.preventDefault();
    if (action === 'next') goNext('key');
    else if (action === 'prev') setStep(state.step - 1, true, 'key');
    else if (action === 'play') togglePlay('key');
    else {
      setExplode(state.targetExplode >= 0.5 ? 0 : 1);
      track('control_changed', { control: 'explode', value: Number(explode.value), step: state.step + 1, source: 'key' });
    }
  });
  return { setStep };
}

// Calls fn(number) now and whenever the range input with this id moves.
export function bindRange(id, fn, doc = document) {
  const input = doc.getElementById(id);
  const show = () => { showRange(input); fn(Number(input.value)); };
  input.addEventListener('input', show);
  input.addEventListener('change', () => track('control_changed', { control: id, value: Number(input.value) }));
  show();
  return input;
}
