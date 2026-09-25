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
- The theme toggle, share menu and sound button live in `src/site.js`; `createStoryUI` mounts them on appliance pages. Build sounds with `src/engine/sound.js` (synthesised Web Audio, no audio files) and trigger them from the frame loop on state edges.
- Landing-page thumbnails are 16:10 WebP renders (800 and 1280 wide, light and dark). Open a page with `?capture` to skip the intro and expose `window.__hswState`, `__hswCam` and `__hswScene` for framing a shot.
- Before committing, run `npm run build` and resolve build errors.

## Deployment

- Production deploys use Vercel (`vercel.json`).
- The production domain is `howshitworks.darshanpania.me`.
- Do not commit generated `dist/`, `node_modules/`, or `.vercel/` files.
