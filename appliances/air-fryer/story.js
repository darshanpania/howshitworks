// Each step sets whether the fryer is on, what the reader sees (cutaway, air, vent) and a
// starting point for the simulation: air temperature, food surface temperature, surface
// water (1 = wet) and browning (0 = raw).
export const FRYER_STORY = [
  { t: 'You set the heat and the time', part: 'Control panel · Cord', explode: 0, focus: ['panel', 'cord'], cut: false,
    on: false, start: { air: 25, surface: 25, water: 1, brown: 0 },
    d: 'An air fryer is a small, strong fan oven. It draws about 1,500 watts from the wall. You choose a temperature between 80°C and 200°C and a time. A switch behind the drawer keeps the power off until the drawer is fully closed.' },
  { t: 'A steel tube gets red hot', part: 'Heating element', explode: 0.3, focus: ['element'], cut: true,
    on: true, start: { air: 25, surface: 25, water: 1, brown: 0 },
    d: 'Above the basket is a flat coil of steel tube. Inside it, a nichrome wire sits in magnesium oxide powder, which passes heat but not electricity. Current heats the wire, and the tube glows dull red at about 700°C. Watch the air reading climb as it preheats.' },
  { t: 'A fan pulls air through the heat', part: 'Fan · Motor', explode: 0, focus: ['fan', 'motor'], cut: true, air: true,
    on: true, start: { air: 150, surface: 40, water: 1, brown: 0 },
    d: 'Just above the element spins a centrifugal fan. It sucks air up through its middle, past the hot tube, and throws it out sideways from its rim. A motor above drives it on a shaft. One Philips patent calls for at least 20 litres of air every second.' },
  { t: 'The drawer turns the air around', part: 'Drawer · Air guide', explode: 0, focus: ['drawer', 'deflector'], cut: true, air: true,
    on: true, start: { air: 190, surface: 60, water: 1, brown: 0 },
    d: 'The hot air races down the gap between the basket and the drawer wall. At the bottom, a star-shaped guide in the drawer turns it upward and sets it spinning. The air rises through the mesh floor of the basket, through the food, and back into the fan.' },
  { t: 'Moving air carries heat in fast', part: 'Basket · Fries', explode: 0, focus: ['basket', 'food'], cut: true, air: true,
    on: true, start: { air: 200, surface: 80, water: 1, brown: 0 },
    d: 'Still air next to food cools down and stays there, like a thin blanket. Fast air keeps blowing that blanket away. With the fan on, about 5,000 watts reach each square metre of the fries: five times more than still air at the same temperature.' },
  { t: 'The outside dries, then browns', part: 'Fries · Crust', explode: 0, focus: ['food'], cut: true, air: true,
    on: true, start: { air: 200, surface: 100, water: 0.25, brown: 0 },
    d: 'A wet surface cannot get hotter than 100°C: the heat boils its water off. The moving air carries the steam away. Once the outside is dry, it heats past 140°C and browns in the Maillard reaction. That dry, brown layer is the crunch. A tablespoon of oil helps it brown evenly.' },
  { t: 'A sensor holds the temperature', part: 'Temperature probe · Element', explode: 0, focus: ['sensor', 'element'], cut: true, air: true,
    on: true, start: { air: 200, surface: 150, water: 0, brown: 0.3 },
    d: 'A probe in the air stream holds a thermistor: its resistance falls as it gets hotter. The control board switches the element off a few degrees above the set point and on again a few degrees below. Watch it dim and glow. If the fryer ever overheats, a thermal fuse cuts the power for good.' },
  { t: 'A second fan keeps the motor cool', part: 'Cooling fan · Vent', explode: 0, focus: ['coolfan', 'vent'], cut: true, vent: true,
    on: true, start: { air: 200, surface: 160, water: 0, brown: 0.45 },
    d: 'The motor sits just above a 200°C oven. A second fan on the same shaft pulls room air in through the top, over the motor and out the back. Steam from the food leaves through the back vent too, so the air inside stays dry and the fries stay crisp.' },
];
