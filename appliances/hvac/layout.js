// Plan of the house and the paths the air takes, in metres. Pure numbers, so tests can check them.
// x runs left to right, z from the back wall (−) to the front (+), y up from the floor grid.

export const FLOOR = 0.12;           // top of the floor slab
export const CEILING = FLOOR + 2.6;  // a 2.6 m room
export const CUT = 1.1;              // walls toward the camera are cut at this height, like a floor plan

export const ROOMS = {
  living: { x: [-4.5, -0.5], z: [-3, 3] },
  hall: { x: [-0.5, 1], z: [-1.8, 3] },
  bed1: { x: [1, 4.5], z: [0, 3] },
  bed2: { x: [1, 4.5], z: [-3, 0] },
  closet: { x: [-0.5, 1], z: [-3, -1.8] },
};
// Door openings onto the hall: [x, z] of the middle of each gap.
export const DOORS = { living: [-0.5, 1.2], bed1: [1, 1.05], bed2: [1, -0.95] };

// An upflow gas furnace (53 × 74 × 102 cm) on a return-air platform, with the cooling coil above it.
export const FURNACE = { x: 0.25, z: -2.4, w: 0.53, d: 0.74, bottom: 0.52, top: 1.54 };
export const COIL = { bottom: 1.54, top: 2.09 };
export const BLOWER = { x: 0.25, y: 0.78, z: -2.4, r: 0.135 };
export const RETURN_GRILLE = { x: 0.25, y: 0.33, z: -1.74 };
// The supply trunk runs along the attic, just above the ceiling.
export const TRUNK = { y: 3.05, z: -2.4, w: 0.45, h: 0.3, x: [-3.45, 3.45] };
// Ceiling registers. from: where the branch duct leaves the trunk.
export const REGISTERS = [
  { room: 'living', x: -2.3, z: -1.1, from: -2.3 },
  { room: 'living', x: -3.1, z: 1.6, from: -3.3 },
  { room: 'bed2', x: 2.8, z: -1.2, from: 2.6 },
  { room: 'bed1', x: 3.0, z: 1.6, from: 3.3 },
];
export const OUTDOOR = { x: 5.7, z: -1.6, w: 0.76, h: 0.84 };
export const THERMOSTAT = { x: -0.28, y: 1.5, z: -1.75 };

// One loop of air for each register: blower → heat exchanger and coil → plenum → trunk →
// branch → register → across the room → hall → return grille → filter → blower.
// Each point is [x, y, z, r]: r is how far the air spreads around the path there.
export function airLoop({ room, x, z, from }) {
  const [dx, dz] = DOORS[room];
  const side = Math.sign(from - FURNACE.x);
  return [
    [FURNACE.x, 0.97, -2.3, 0.05],        // out of the blower
    [FURNACE.x, 1.3, -2.42, 0.17],        // up between the heat exchanger sections
    [FURNACE.x, 1.82, -2.4, 0.17],        // through the coil
    [FURNACE.x, 2.75, -2.4, 0.2],         // the plenum
    [FURNACE.x + side * 0.4, TRUNK.y, TRUNK.z, 0.1],
    [from, TRUNK.y, TRUNK.z, 0.1],        // along the trunk
    [from, 3.02, -2.05, 0.06],            // into the branch duct
    [x, 3.0, z - 0.4, 0.06],
    [x, 2.82, z, 0.05],
    [x, 2.55, z, 0.14],                   // out of the register
    [x + (dx - x) * 0.35, 1.5, z + (dz - z) * 0.35, 0.55], // across the room
    [dx, 0.8, dz, 0.3],                   // through the door
    [FURNACE.x, 0.5, -1.25, 0.3],         // along the hall
    [RETURN_GRILLE.x, RETURN_GRILLE.y, -1.6, 0.13], // into the return grille
    [FURNACE.x, 0.32, -2.35, 0.12],       // through the filter into the platform
    [FURNACE.x, 0.62, -2.4, 0.12],        // up into the blower compartment
    [BLOWER.x, BLOWER.y, BLOWER.z, 0.04], // into the middle of the blower wheel
  ];
}
// Points on every loop where the air changes: it has taken on heat (or lost it) by HEATED,
// leaves the register at REGISTER, and has mixed back to room temperature by MIXED.
export const AIR_KEYS = { heated: 2, register: 9, mixed: 11 };

// The refrigerant line set: from the side of the indoor coil, up through the attic in front of
// the trunk, down the outside wall and into the service valves of the outdoor unit.
// The large vapour line and the small liquid line run side by side: pass the liquid line's offset.
export function lineSet([dx, dy, dz] = [0, 0, 0]) {
  return [
    [0.52, 1.84, -2.2],
    [0.86, 1.84, -2.2],
    [0.86, 1.84, -2.02],
    [0.86, 3.32, -2.02],
    [4.66, 3.32, -2.02],
    [4.66, 0.36, -2.02],
    [5.1, 0.28, -1.8],
    [OUTDOOR.x - OUTDOOR.w / 2, 0.28, -1.8],
  ].map(([x, y, z]) => [x + dx, y + dy, z + dz]);
}
