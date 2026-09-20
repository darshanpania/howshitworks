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
- Before committing, run `npm run build` and resolve build errors.

## Deployment

- Production deploys use Vercel (`vercel.json`).
- The production domain is `howshitworks.darshanpania.me`.
- Do not commit generated `dist/`, `node_modules/`, or `.vercel/` files.
