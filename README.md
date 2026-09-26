# How Shit Works

Everyday electrical and mechanical appliances, shown from the inside in three.js.

Live: https://howshitworks.darshanpania.me

## Run

```
npm install
npm run dev
```

## Add an appliance

1. Create `appliances/<name>/` with `index.html`, `main.js`, and `page.css`. Copy `appliances/ceiling-fan/` as the template.
2. Write the story first: 6 to 8 steps. One step = one idea = one part in focus.
3. Model with primitives only (cylinder, box, torus, cone). Use real numbers (rpm, µF, angles).
4. Put it in the studio: `addStudioLights` and `addFloor` from `src/engine/stage.js`, and `createCallouts` from `src/engine/callouts.js` for the labels on the parts in focus.
5. Add a card to `index.html` and the appliance to `src/catalog.js`.

Vite picks up every folder under `appliances/` as its own page.

## Analytics

`src/analytics.js` sends events to the PostHog project "HowShitWorks". It runs only in production builds (set `VITE_POSTHOG_DEV=true` to test with `npm run dev`). Every event carries an `appliance` property (`home` on the landing page).

| Event | When |
| --- | --- |
| `$pageview`, `$autocapture` | Automatic, from posthog-js |
| `appliance_card_clicked` | A card on the landing page is clicked |
| `story_step_viewed` | A step is opened from the list, Next or Back |
| `playback_toggled` | Play or Pause is clicked |
| `control_changed` | A slider (Explode, Speed, Browning, Flame) is released |
| `model_orbited`, `model_zoomed` | The first drag or zoom on the 3D model, once per page |

Shared code in `src/engine/` sends these, so new appliances get them without extra work.
