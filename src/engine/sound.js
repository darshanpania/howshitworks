// Small synthesised sound kit on the Web Audio API. No audio files: every sound is built
// from oscillators and filtered noise, so pages stay light. Sound is off until the reader
// turns it on (browsers only allow audio after a tap), and the choice is remembered.
const KEY = 'hsw-sound';
const read = () => { try { return localStorage.getItem(KEY) === 'on'; } catch { return false; } };
const write = on => { try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch { /* private mode */ } };

let ctx = null, master = null, noiseBuffer = null;
const listeners = new Set();
const loops = new Set();

function audio() {
  if (ctx) return ctx;
  const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain(); master.gain.value = 0; master.connect(ctx.destination);
  noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return ctx;
}

// A gain envelope: fast attack, exponential release.
function envelope(gain, at, { peak, attack = 0.004, release = 0.1 }) {
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), at + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + attack + release);
  return at + attack + release;
}

// One oscillator note. glide bends the pitch toward a second frequency.
function tone({ freq, type = 'sine', gain = 0.3, attack, release = 0.15, glide, delay = 0 }) {
  if (!sound.on || !audio()) return;
  const at = ctx.currentTime + delay, osc = ctx.createOscillator(), g = ctx.createGain();
  osc.type = type; osc.frequency.setValueAtTime(freq, at);
  if (glide) osc.frequency.exponentialRampToValueAtTime(glide, at + (attack ?? 0.004) + release);
  osc.connect(g).connect(master);
  const end = envelope(g, at, { peak: gain, attack, release });
  osc.start(at); osc.stop(end + 0.02);
}

// A burst of filtered noise: clicks, knocks, hisses.
function noise({ gain = 0.3, attack, release = 0.08, filter = 'bandpass', freq = 2000, q = 1, delay = 0 }) {
  if (!sound.on || !audio()) return;
  const at = ctx.currentTime + delay, src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  src.buffer = noiseBuffer; src.loop = true;
  f.type = filter; f.frequency.value = freq; f.Q.value = q;
  src.connect(f).connect(g).connect(master);
  const end = envelope(g, at, { peak: gain, attack, release });
  src.start(at, Math.random()); src.stop(end + 0.02);
}

// A sound that runs until stopped: a motor hum, a steam hiss. Call set() every frame;
// it glides to the new level, so the frame loop can drive it directly.
function loop({ type = 'noise', freq = 1000, q = 1, filter = 'bandpass', wave = 'sine' } = {}) {
  const handle = {
    level: 0, freq, nodes: null,
    set(level, f = handle.freq) {
      handle.level = level; handle.freq = f;
      if (!handle.nodes && level > 0.001 && sound.on && audio()) handle.nodes = start();
      if (!handle.nodes) return;
      const t = ctx.currentTime;
      handle.nodes.gain.gain.setTargetAtTime(sound.on ? level : 0, t, 0.08);
      handle.nodes.tune.setTargetAtTime(f, t, 0.1);
    },
  };
  function start() {
    const gain = ctx.createGain(); gain.gain.value = 0; gain.connect(master);
    if (type === 'noise') {
      const src = ctx.createBufferSource(), f = ctx.createBiquadFilter();
      src.buffer = noiseBuffer; src.loop = true; f.type = filter; f.frequency.value = freq; f.Q.value = q;
      src.connect(f).connect(gain); src.start();
      return { gain, tune: f.frequency };
    }
    const osc = ctx.createOscillator(); osc.type = wave; osc.frequency.value = freq; osc.connect(gain); osc.start();
    return { gain, tune: osc.frequency };
  }
  loops.add(handle);
  return handle;
}

export const sound = {
  on: read(),
  supported: typeof globalThis.AudioContext === 'function' || typeof globalThis.webkitAudioContext === 'function',
  toggle(on = !sound.on) {
    sound.on = on; write(on);
    if (on && audio()) { ctx.resume(); master.gain.setTargetAtTime(0.8, ctx.currentTime, 0.05); }
    else if (ctx) master.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
    loops.forEach(l => l.set(l.level));
    listeners.forEach(fn => fn(on));
    return on;
  },
  onChange(fn) { listeners.add(fn); },
  tone, noise, loop,

  // ---------- Shared effects ----------
  // A small metal click: a latch, a pin, a switch.
  click(gain = 0.35) { noise({ gain, release: 0.035, freq: 4200, q: 3 }); tone({ freq: 2600, type: 'triangle', gain: gain * 0.25, release: 0.03 }); },
  // A heavier knock: a bolt reaching its stop, a lid seating.
  thunk(gain = 0.45) { tone({ freq: 140, glide: 70, gain, release: 0.16 }); noise({ gain: gain * 0.5, release: 0.05, freq: 900, q: 1.5 }); },
  // A spring letting go.
  twang(gain = 0.2) { tone({ freq: 420, glide: 260, type: 'triangle', gain, release: 0.35 }); tone({ freq: 845, glide: 520, gain: gain * 0.4, release: 0.25 }); },
  // Air moving fast: a puff or a whoosh.
  whoosh(gain = 0.2, freq = 700) { noise({ gain, attack: 0.08, release: 0.3, filter: 'lowpass', freq }); },
};

// Browsers suspend audio after a tab is hidden; resume on return when sound is on.
// When the reader turned sound on during an earlier visit, the first tap or key starts it.
if (typeof document !== 'undefined') {
  const unlock = () => {
    ['pointerdown', 'keydown'].forEach(type => document.removeEventListener(type, unlock, true));
    if (sound.on) sound.toggle(true);
  };
  ['pointerdown', 'keydown'].forEach(type => document.addEventListener(type, unlock, true));
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) ctx.suspend(); else if (sound.on) ctx.resume();
  });
}
