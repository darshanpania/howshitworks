// Each step sets the machine mode: heat (the boiler thermostat is on) and brew (the pump runs
// shots). startT is the boiler temperature at the start of the step, and from is how many
// grams are already in the cup when the step starts a shot.
// cut lists the parts drawn see-through, so the inside shows.
export const ESPRESSO_STORY = [
  { t: 'Cold water waits in the tank', part: 'Water tank', explode: 0, focus: ['tank'], cut: ['case'],
    heat: false, brew: false, startT: 22,
    d: 'A 2 litre tank sits at the back of the machine. A silicone tube runs from its bottom down to the pump. The water is at room temperature.' },
  { t: 'The boiler heats it to 93°C', part: 'Boiler · Heating element', explode: 0, focus: ['boiler', 'element'], cut: ['case', 'boiler'],
    heat: true, brew: false, startT: 22,
    d: 'A small brass boiler sits right above the group head. A 1,200 W element inside heats the water, and a thermostat switches it off at 93°C. Hotter water burns the coffee. Cooler water makes it sour.' },
  { t: '18 g of coffee, tamped flat', part: 'Portafilter · Puck · Tamper', explode: 0.8, focus: ['portafilter', 'puck', 'tamper'], cut: false,
    heat: true, brew: false, startT: 92,
    d: 'The coffee is ground fine, about 0.3 mm, into a 58 mm basket. A tamper presses it with about 15 kg of force into a flat, even puck. A gap or a slope would give the water an easy path around the coffee.' },
  { t: 'The portafilter locks in', part: 'Group head · Portafilter', explode: 0, focus: ['group', 'portafilter'], cut: false,
    heat: true, brew: false, startT: 92, lock: true,
    d: 'Two lugs on the portafilter slide into ramps on the group head. A quarter turn pulls the basket up hard against a rubber gasket, so the seal holds at 9 bar.' },
  { t: 'A vibrating pump makes 9 bar', part: 'Pump · Over-pressure valve · Gauge', explode: 0, focus: ['pump', 'opv', 'gauge'], cut: ['case'],
    heat: true, brew: true, startT: 92, from: 0,
    d: 'A coil pulls a small piston back and forth 50 times a second. Each stroke pushes a little water, up to about 15 bar. An over-pressure valve opens at 9 bar and sends the extra water back to the tank, so the coffee never gets more than 9 bar.' },
  { t: 'The shower screen wets the puck', part: 'Shower screen · Puck', explode: 0.3, focus: ['screen', 'puck'], cut: ['case', 'group', 'portafilter'],
    heat: true, brew: true, startT: 92, from: 0,
    d: 'Hot water leaves the boiler through a fine steel screen that spreads it evenly over the puck. For the first 3 seconds the dry coffee soaks it up and the pressure stays low. When the puck is full, the pressure climbs.' },
  { t: '36 g of espresso in 25 seconds', part: 'Portafilter · Cup', explode: 0, focus: ['portafilter', 'cup'], cut: false,
    heat: true, brew: true, startT: 92, from: 0,
    d: 'At 9 bar the water pushes through the packed coffee and dissolves its oils, sugars and acids. About 36 g of espresso runs out, twice the dose, in 25 seconds. Try the Grind control: coarse coffee rushes through and tastes sour; fine coffee chokes and tastes bitter.' },
  { t: 'A three-way valve lets the pressure out', part: 'Three-way valve · Drip tray', explode: 0, focus: ['valve', 'tray'], cut: ['case'],
    heat: true, brew: true, startT: 92, from: 30,
    d: 'When the shot is done the pump stops, but 9 bar is still trapped above the puck. A solenoid valve opens and dumps it through a pipe into the drip tray. The puck stays dry, and the portafilter comes off without a spray of hot water.' },
];
