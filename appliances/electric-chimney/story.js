// Each step sets whether the blower runs, how oily the filters get, and the camera view.
export const CHIMNEY_STORY = [
  { t: 'Frying throws up smoke and oil', part: 'Kadhai · Gas stove', explode: 0, focus: ['kadhai'], cut: false, fan: false, view: 'all',
    d: 'Oil in a kadhai fries at about 180°C. Hot air, steam, smoke and fine drops of oil rise off it in a plume. With nothing to catch it, the plume spreads through the kitchen, and the oil settles on the walls as a sticky film.' },
  { t: 'The hood catches the plume', part: 'Hood', explode: 0, focus: ['hood'], cut: false, fan: true, view: 'all',
    d: 'The hood hangs 65 to 75 cm above the stove and is as wide as it. Press a speed button and the blower starts to pull. Now the plume bends into the hood instead of spreading out.' },
  { t: 'A motor spins a blower wheel', part: 'Motor · Blower wheel', explode: 0, focus: ['motor', 'wheel'], cut: true, fan: true, view: 'hood',
    d: 'Inside the hood, a 200 W motor turns a drum-shaped wheel of curved blades at up to 1,400 rpm. The blades throw air outward. That leaves low pressure at the centre of the wheel, and air rushes in to fill it. This pull is the suction.' },
  { t: 'Mesh filters catch the oil', part: 'Mesh filters ×2', explode: 0.5, focus: ['filters'], cut: true, fan: true, view: 'under',
    d: 'All the air must pass through two aluminium filters, each made of five layers of mesh. The air twists through the holes. The drops of oil are heavier, so they cannot turn as fast: they hit the metal and stick. Smoke and steam are fine enough to get through.' },
  { t: 'The scroll aims the air up', part: 'Scroll housing', explode: 0, focus: ['scroll'], cut: true, fan: true, view: 'hood',
    d: 'The wheel turns inside a snail-shaped scroll. The gap around the wheel gets wider all the way round, so the air thrown off the blades collects in it and leaves in one direction: up the outlet and into the duct.' },
  { t: 'A duct takes the air outside', part: 'Duct · Back-draft flap', explode: 0, focus: ['duct', 'flap'], cut: true, fan: true, view: 'duct',
    d: 'A 150 mm duct carries the air through the wall. The air that crossed the filters at about 1 m/s now moves at about 14 m/s. At the end, a flap opens in the airflow and falls shut when the blower stops, so wind and insects stay out. Set the speed to 0 to see it close.' },
  { t: 'Oily filters choke the airflow', part: 'Mesh filters ×2', explode: 0, focus: ['filters'], cut: false, fan: true, clog: true, view: 'under',
    d: 'The 1,200 m³/h on the box is what the blower moves with nothing in its way. The filters and the duct push back, so about 900 m³/h gets through here. As oil fills the mesh, it pushes back harder and the flow falls toward 630 m³/h. Wash the filters in hot, soapy water every two to three weeks.' },
];
