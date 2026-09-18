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
4. Add a card to `index.html`.

Vite picks up every folder under `appliances/` as its own page.
