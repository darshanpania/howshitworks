// Each step names the camera view and which air streams show: room (the cold side) and out (the hot side).
// ghost: false keeps the parts out of focus solid. pace speeds up the thermostat clock, so the
// last step shows a full on/off cycle quickly.
export const AC_STORY = [
  { t: 'One box, two sides', part: 'Partition · Room side · Outside', explode: 0, focus: ['partition'], cut: true, ghost: false, view: 'all', air: ['room', 'out'],
    d: 'A window AC sits in a hole in the wall. The front faces the room and the back hangs outside. An insulated partition splits the box into a cold side and a hot side. Its job is to move heat out of the room, even when it is hotter outside.' },
  { t: 'The compressor squeezes the gas', part: 'Rotary compressor', explode: 0, focus: ['compressor'], cut: true, view: 'out', air: [],
    d: 'A sealed copper loop runs through both sides, filled with R32 refrigerant. The compressor pulls in cool gas at about 10 bar and squeezes it to about 31 bar. Squeezed gas gets hot: it leaves at about 80°C. This is where most of the 1.65 kW goes.' },
  { t: 'The hot coil gives heat to the outside', part: 'Condenser coil', explode: 0, focus: ['condenser'], cut: true, view: 'out', air: ['out'],
    d: 'The hot gas goes into the condenser at the back: copper tubes through thin aluminium fins. The outdoor fan pulls 35°C air in through the side vents and pushes it out through the fins. The gas is hotter than that air, so it gives up its heat. At 31 bar, it turns to liquid at about 50°C.' },
  { t: 'A thin tube drops the pressure', part: 'Capillary tube', explode: 0, focus: ['capillary'], cut: true, view: 'cap', air: [],
    d: 'The warm liquid squeezes into a capillary tube: about 1 m of copper with a 1.5 mm bore. Friction drops the pressure from 31 bar to 10 bar. At 10 bar, R32 boils at 7°C. Part of the liquid boils at once, and that cools the rest to 7°C.' },
  { t: 'The cold coil takes heat from the room', part: 'Evaporator coil', explode: 0, focus: ['evaporator'], cut: true, view: 'in', air: ['room'],
    d: 'The cold liquid goes into the evaporator behind the front grille. Room air at 27°C passes through its fins. The refrigerant takes heat from the air and boils into gas, still at 7°C. The air leaves about 13°C colder. The gas goes back through the partition to the compressor, and the loop starts again.' },
  { t: 'One motor turns two fans', part: 'Fan motor · Blower · Outdoor fan', explode: 0, focus: ['motor', 'blower', 'fan'], cut: true, view: 'shaft', air: ['room', 'out'],
    d: 'One motor sits behind the partition, with a shaft out of each end. At the front, it turns a blower wheel that pulls room air through the filter and the cold coil, then blows it back into the room. At the back, it turns the propeller fan for the hot coil. Both turn at about 1,000 rpm.' },
  { t: 'Water drips off and goes to the hot coil', part: 'Drain tray · Slinger ring', explode: 0, focus: ['tray', 'fan'], cut: true, view: 'water', air: [], water: true,
    d: 'The cold coil is below the dew point of the room air, so water forms on its fins, the same as on a cold glass. On a humid day that is about 2 litres an hour. It drips into a tray and runs to the back. A ring on the rim of the outdoor fan dips into it and throws the water at the hot coil, where it evaporates.' },
  { t: 'The thermostat switches the compressor', part: 'Thermostat · Controls', explode: 0, focus: ['controls'], cut: true, view: 'front', air: ['room'], pace: 3,
    d: 'A sensor in front of the cold coil reads the room air. When the room drops just below the set temperature, the thermostat stops the compressor. The fan keeps running. When the room warms just above it, the compressor starts again, but not within 3 minutes of a stop. Try the Set slider. Each 1°C higher saves about 6% of the power.' },
];
