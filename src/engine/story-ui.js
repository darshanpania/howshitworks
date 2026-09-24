import { track } from '../analytics.js';

// Builds the step list and wires Back, Next, Play and the Explode slider.
// state needs: step, playing, targetExplode. onStep(step, index) applies the rest.
export function createStoryUI({ story, state, onStep, doc = document }) {
  const $ = id => doc.getElementById(id);
  const list = $('steps'), explode = $('explode'), play = $('play');
  story.forEach((s, i) => {
    const b = doc.createElement('button'); b.className = 'step'; b.id = `step-${i}`;
    b.innerHTML = `<span class="n">${String(i + 1).padStart(2, '0')}</span><span><div class="t">${s.t}</div><div class="d">${s.d}</div><div class="part">${s.part}</div></span>`;
    b.addEventListener('click', () => setStep(i, true, 'list'));
    list.append(b);
  });

  // source is how the reader got here: 'list', 'next' or 'prev'. Internal calls pass none.
  function setStep(index, scroll = true, source) {
    state.step = (index + story.length) % story.length;
    const s = story[state.step];
    if (source) track('story_step_viewed', { step: state.step + 1, step_title: s.t, steps_total: story.length, source });
    state.targetExplode = s.explode;
    explode.value = String(Math.round(s.explode * 100));
    list.querySelectorAll('.step').forEach((el, j) => el.classList.toggle('active', j === state.step));
    if (scroll) $(`step-${state.step}`).scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    onStep(s, state.step);
  }

  play.addEventListener('click', () => {
    state.playing = !state.playing; play.textContent = state.playing ? 'Pause' : 'Play';
    track('playback_toggled', { playing: state.playing, step: state.step + 1 });
  });
  explode.addEventListener('input', e => { state.targetExplode = e.target.value / 100; });
  explode.addEventListener('change', e => track('control_changed', { control: 'explode', value: Number(e.target.value), step: state.step + 1 }));
  $('prev').addEventListener('click', () => setStep(state.step - 1, true, 'prev'));
  $('next').addEventListener('click', () => setStep(state.step + 1, true, 'next'));
  return { setStep };
}

// Calls fn(number) now and whenever the range input with this id moves.
export function bindRange(id, fn, doc = document) {
  const input = doc.getElementById(id);
  input.addEventListener('input', () => fn(Number(input.value)));
  input.addEventListener('change', () => track('control_changed', { control: id, value: Number(input.value) }));
  fn(Number(input.value));
  return input;
}
