// Each step runs the machine in one mode (see washer.js) and starts from its own state
// when the reader jumps to it. view is the camera position for the step.
const DRY = { water: 0, temp: 15, wet: 0, powder: 1 };
const WASHING = { water: 12, temp: 40, wet: 2, powder: 0 };

export const WASHER_STORY = [
  { t: 'A drum turns inside a tub', part: 'Drum · Tub', explode: 0.45, focus: ['drum', 'tub'], cut: true, mode: 'idle', view: 'front', start: DRY,
    d: 'A front loader has two drums, one inside the other, lying on their side. The inner drum is stainless steel, 47 cm across and full of small holes. It holds the clothes, and it is the only part that turns. The plastic tub around it holds the water.' },
  { t: 'The door seals and locks', part: 'Door · Bellows seal · Lock', explode: 0, focus: ['door', 'gasket', 'lock'], cut: true, mode: 'door', view: 'door', start: DRY,
    d: 'The door is a thick glass bowl. It presses into a rubber bellows that joins the tub to the front of the cabinet. The water comes up above the bottom of the door opening, so a lock bolts the door before the wash starts. It stays locked until the drum stops and the water is out.' },
  { t: 'Water comes in through the soap drawer', part: 'Inlet valve · Detergent drawer', explode: 0, focus: ['valve', 'drawer'], cut: true, mode: 'fill', view: 'top', start: DRY,
    d: 'An electric valve opens and lets in mains water. The water runs through the detergent drawer and washes the powder down into the tub. A pressure switch measures the water level and closes the valve at about 12 litres. A whole program uses 40 to 50 litres, about half of what a top loader uses.' },
  { t: 'A heater warms the water', part: 'Heating element', explode: 0, focus: ['heater', 'water'], cut: true, mode: 'heat', view: 'low', start: { ...WASHING, temp: 15 },
    d: 'A 2 kW element lies in the bottom of the tub, under the drum. It only switches on when water covers it. A sensor next to it switches it off at the set temperature. Heating 12 litres from 15°C to 40°C takes about 10 minutes and uses most of the energy of a wash. The model does it in seconds.' },
  { t: 'A belt drives the drum', part: 'Motor · Belt · Drum pulley', explode: 0.3, focus: ['motor', 'belt', 'pulley'], cut: true, mode: 'wash', view: 'back', start: WASHING,
    d: 'A motor under the tub turns a small pulley. A belt joins it to a large pulley on the back of the drum, 12 times as wide. So the motor turns 12 times faster than the drum: 600 rpm for a 50 rpm wash, and about 17,000 rpm for a spin. Many newer machines put a flat motor straight on the drum shaft instead, with no belt.' },
  { t: 'Lifters raise the clothes and drop them', part: 'Lifters · Clothes', explode: 0, focus: ['lifters', 'clothes'], cut: true, mode: 'wash', view: 'inside', start: WASHING,
    d: 'Three ribs inside the drum, the lifters, carry the wet clothes up the side. At 50 rpm the clothes fall off at about 130° from the bottom and drop back into the water. That fall does the scrubbing. After a few turns the drum stops and turns the other way, so the clothes do not twist into a rope.' },
  { t: 'Drain, then spin at up to 1,400 rpm', part: 'Drain pump · Drum', explode: 0, focus: ['pump', 'drum'], cut: true, mode: 'spin', view: 'front', start: WASHING,
    d: 'A pump pulls the water out through a coin filter. Then the drum speeds up. Above 62 rpm the wall pushes harder than gravity pulls, so the clothes stay flat on it. At 1,400 rpm the push is about 500 times gravity, and the water flies out through the holes. The clothes keep about half their dry weight in water. The model shows the spin slowed down.' },
  { t: 'Springs and dampers soak up the shake', part: 'Springs · Dampers · Concrete weights', explode: 0, focus: ['springs', 'dampers', 'weight'], cut: true, mode: 'shake', view: 'side', start: { ...WASHING, water: 0, wet: 0.6 },
    d: 'Clothes never sit evenly, so a spinning drum pulls the tub round in a small circle. The tub hangs from two springs and stands on two friction dampers. Concrete blocks, often 20 kg or more, make it heavy and slow to move. It shakes most near 240 rpm, then runs smoother at full speed. The model shows the movement 5 times larger.' },
];
