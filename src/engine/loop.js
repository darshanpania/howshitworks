export const reducedMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

// Runs frame(dt, now) before each render. dt is capped so a background tab
// does not make the animation jump when it comes back.
export function startLoop(stage, frame) {
  let last = performance.now();
  function tick(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    stage.resize();
    frame(dt, now);
    stage.render();
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}
