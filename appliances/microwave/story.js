// Each step picks a camera view and what to show: waves, the hot-spot map, molecules, the door cycle.
export const MICROWAVE_STORY = [
  { t: 'A transformer makes 2,000 volts', part: 'Transformer · Capacitor · Diode', explode: 0, focus: ['transformer', 'capacitor', 'diode'], cut: true, view: 'front',
    d: 'Mains power at 230 V goes into a heavy transformer. Its secondary coil has about nine times as many turns, so it puts out about 2,000 V. A capacitor and a diode double that, so the magnetron gets about 4,000 V. At a lower power level the oven switches the magnetron on and off: at 50%, it runs 10 s in every 20 s.' },
  { t: 'The magnetron makes 2.45 GHz waves', part: 'Magnetron · Cathode · Magnets', explode: 0.55, focus: ['anode', 'magnets'], cut: true, view: 'magnetron', electrons: true,
    d: 'A 3.3 V coil heats the cathode in the middle until it gives off electrons. The 4,000 V pulls them toward a copper ring around it. Two ring magnets bend their paths, so they swirl around in spokes. The spokes sweep past small cavities cut into the copper, and each cavity rings like a whistle: 2.45 billion times a second.' },
  { t: 'A fan keeps the magnetron cool', part: 'Fan · Cooling fins', explode: 0, focus: ['fan', 'magnetron'], cut: true, view: 'bay', air: true,
    d: 'An 800 W oven takes about 1,250 W from the wall. Most of the difference becomes heat in the magnetron. A fan blows air through its thin aluminium fins. The same air then flows through the oven and out of the vents, and takes the steam from the food with it.' },
  { t: 'A metal duct guides the waves', part: 'Antenna · Waveguide', explode: 0, focus: ['antenna', 'waveguide'], cut: true, view: 'guide', waves: 'guide',
    d: 'The antenna of the magnetron sits inside a rectangular metal duct: the waveguide. The waves bounce along its walls and into the oven. A thin sheet of mica covers the opening. Microwaves pass through it, but splashes of food stay out.' },
  { t: 'The waves bounce around the box', part: 'Cavity · Standing waves', explode: 0, focus: ['cavity'], cut: true, view: 'cavity', waves: 'all', map: true,
    d: 'The metal walls reflect microwaves the way a mirror reflects light. The waves cross and add up into a fixed pattern: a standing wave. Each wave is 12.2 cm long, so the hot spots are about 6 cm apart, with cool spots between them.' },
  { t: 'The field twists water molecules', part: 'Water molecules', explode: 0, focus: ['molecules', 'water'], cut: true, view: 'mug', molecules: true,
    d: 'A water molecule has a slightly negative end and a slightly positive end. The electric field turns each molecule to line up with it, then the field flips: 4.9 billion times a second. The molecules twist back and forth and knock into their neighbours, and that motion is heat. The waves reach 1 to 2 cm into food; the middle heats by conduction.' },
  { t: 'The turntable evens out the hot spots', part: 'Turntable · Motor', explode: 0, focus: ['turntable', 'motor', 'mug'], cut: true, view: 'cavity', map: true,
    d: 'A small motor under the floor turns the glass tray at about 5 rpm: one turn every 12 seconds. The food moves through the hot and cool spots, so it heats more evenly. Let food stand for a minute after the beep: heat keeps spreading into the cold parts.' },
  { t: 'The door screen keeps the waves in', part: 'Door screen · Latch', explode: 0, focus: ['door', 'latch'], cut: false, view: 'door', waves: 'door', doorCycle: true,
    d: 'The window has a metal screen with holes about 1 mm across. Microwaves are 122 mm long, so they cannot get through and bounce back. Light waves are less than a thousandth of a millimetre long, so you can still see in. Open the door, and the latch lets go of switches that cut the power at once.' },
];
