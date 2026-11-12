// heat: the circuit is closed and the wires glow. down: the carriage is at the bottom.
// The lever closes the circuit (step 2) and the thermostat opens it again (step 6).
export const TOASTER_STORY = [
  { t: 'Power comes in from the wall', part: 'Cord · Plug', explode: 0, focus: ['cord'], heat: false, down: false,
    d: 'Mains power at 230 V arrives through the cord. A two-slice toaster uses about 800 watts, so about 3.5 amps flow. That is enough to make the thin heating wires glow in a few seconds. Nothing flows yet: the circuit is open until the lever goes down.' },
  { t: 'The lever lowers the bread', part: 'Lever · Carriage', explode: 0.18, focus: ['lever', 'bread', 'carriage'], heat: true, down: true,
    d: 'Push the lever down, and a carriage lowers both slices into the slots. On the way down it squeezes a spring. At the bottom of its travel it presses two contacts together, and that closes the circuit.' },
  { t: 'An electromagnet holds it down', part: 'Electromagnet · Latch', explode: 0.42, focus: ['magnet'], heat: true, down: true,
    d: 'The spring pushes up, so the lever does not stay down by itself. The same current that heats the wires goes through a small coil of copper wire. The coil becomes a magnet and holds a steel plate on the carriage. While the power is on, the bread stays down.' },
  { t: 'Nichrome wire turns electricity into heat', part: 'Heating elements', explode: 0.56, focus: ['elements'], heat: true, down: true,
    d: 'The wires are nichrome: 80% nickel and 20% chromium. Nichrome resists current about 60 times more than copper, and that resistance turns electrical energy into heat. The wires reach about 600°C and glow orange. They are wound on sheets of mica, which takes the heat and does not conduct.' },
  { t: 'Infrared heat browns the bread', part: 'Radiant heat · Bread', explode: 0.34, focus: ['heat', 'bread'], heat: true, down: true,
    d: 'The glowing wires give off infrared light, which travels straight to the bread. First the surface dries: its water leaves as steam. Above about 140°C, sugars and proteins react and turn brown. This is the Maillard reaction, and it makes the taste of toast.' },
  { t: 'A bimetal thermostat opens the circuit', part: 'Bimetal thermostat', explode: 0.58, focus: ['thermostat'], heat: false, down: true,
    d: 'Near the wires is a strip of two metals bonded together: brass and steel. Brass grows more than steel when it gets hot, so the strip bends toward the steel side. When it bends far enough, it opens the circuit. The browning knob sets how far it must bend. Many new toasters use a timer chip for this job.' },
  { t: 'A spring pops the toast up', part: 'Spring · Carriage', explode: 0.2, focus: ['spring', 'carriage', 'bread'], heat: false, down: false,
    d: 'The circuit is open, so the coil is no longer a magnet and lets go of the carriage. The spring pushes the carriage and the toast up. The contacts come apart at the same time, so the wires stay off until you push the lever again.' },
];

// "heat" in the story is the radiant heat of the elements, so it focuses the same meshes.
export const TOASTER_ALIASES = { heat: 'elements' };
