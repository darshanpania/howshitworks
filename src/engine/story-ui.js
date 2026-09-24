// Builds the step list and wires Back, Next, Play and the Explode slider.
// state needs: step, playing, targetExplode. onStep(step, index) applies the rest.
export function createStoryUI({ story, state, onStep, doc = document }) {
  const $ = id => doc.getElementById(id);
  const list = $('steps'), explode = $('explode'), play = $('play');
  story.forEach((s, i) => {
    const b = doc.createElement('button'); b.className = 'step'; b.id = `step-${i}`;
    b.innerHTML = `<span class="n">${String(i + 1).padStart(2, '0')}</span><span><div class="t">${s.t}</div><div class="d">${s.d}</div><div class="part">${s.part}</div></span>`;
    b.addEventListener('click', () => setStep(i));
    list.append(b);
  });

  function setStep(index, scroll = true) {
    state.step = (index + story.length) % story.length;
    const s = story[state.step];
    state.targetExplode = s.explode;
    explode.value = String(Math.round(s.explode * 100));
    list.querySelectorAll('.step').forEach((el, j) => el.classList.toggle('active', j === state.step));
    if (scroll) $(`step-${state.step}`).scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    onStep(s, state.step);
  }

  play.addEventListener('click', () => { state.playing = !state.playing; play.textContent = state.playing ? 'Pause' : 'Play'; });
  explode.addEventListener('input', e => { state.targetExplode = e.target.value / 100; });
  $('prev').addEventListener('click', () => setStep(state.step - 1));
  $('next').addEventListener('click', () => setStep(state.step + 1));
  return { setStep };
}

// Calls fn(number) now and whenever the range input with this id moves.
export function bindRange(id, fn, doc = document) {
  const input = doc.getElementById(id);
  input.addEventListener('input', () => fn(Number(input.value)));
  fn(Number(input.value));
  return input;
}
