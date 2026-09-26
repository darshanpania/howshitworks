# How Shit Works — Agent Guide

## Project

This is a static Vite site that uses Three.js to explain the internals of everyday appliances. The landing page is `index.html`; every appliance lives in `appliances/<name>/` and has its own `index.html`, `main.js`, and `page.css`.

## Commands

- Install dependencies: `npm install`
- Run locally: `npm run dev`
- Build the production site: `npm run build`
- Preview the production build: `npm run preview`

## Development conventions

- Keep the site dependency-light. Use the existing Three.js version unless an upgrade is necessary.
- Preserve Vite's multi-page setup in `vite.config.js`: new appliance directories are discovered automatically.
- Model appliance parts with clear Three.js primitives and use real-world measurements or values when they improve the explanation.
- Structure each appliance as a concise, step-by-step visual story. Keep controls and animation understandable on touch devices as well as desktop.
- Keep shared styles in `src/base.css`; use each appliance's `page.css` only for page-specific styling.
- Stage every appliance in the shared studio: `createStage(canvas, { pbr: true })`, `addStudioLights(stage, { key, extent })` and `addFloor(stage, y, { size, cell })` (a grid that fades into the backdrop plus a soft contact shadow). The backdrop is CSS behind the transparent canvas.
- Parts registered with `createParts(root, { lively: true })` turn to an x-ray outline as their opacity drops, and parts in focus get a copper rim. Set `mesh.userData.noGhost` to keep a see-through part (water) plain.
- Call `createCallouts(stage, { parts, state, story })` once per page: it pins a numbered label with a leader line to the parts in focus. `object.userData.anchor` picks the point on a part; `anchorStatic` ignores the spin of its parents.
- The landing-page hero (`src/hero.js`) is the open-cube logo in 3D. It loads after first paint, and the flat logo stays in place without WebGL.
- The theme toggle, share menu and sound button live in `src/site.js`; `createStoryUI` mounts them on appliance pages. Build sounds with `src/engine/sound.js` (synthesised Web Audio, no audio files) and trigger them from the frame loop on state edges.
- Landing-page thumbnails are 16:10 WebP renders (800 and 1280 wide, light and dark) of the full-width stage with the UI hidden, including the studio backdrop. Open a page with `?capture` to skip the intro, hide the callouts and expose `window.__hswState`, `__hswCam` and `__hswScene` for framing a shot. Clear `__hswState.focus` so only cutaway parts show as x-ray.
- Before committing, run `npm run build` and resolve build errors.

## Deployment

- Production deploys use Vercel (`vercel.json`).
- The production domain is `howshitworks.darshanpania.me`.
- Do not commit generated `dist/`, `node_modules/`, or `.vercel/` files.
