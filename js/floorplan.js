// ─────────────────────────────────────────────────────────────────────────
// FLOOR PLAN DATA — 2015 W. Potomac, Unit #3
// ─────────────────────────────────────────────────────────────────────────
// This is the ONE file to edit if a room size looks wrong.
// Everything in the 3D view is generated from the numbers below.
//
// Units are FEET (decimals). 7'5" = 7 + 5/12 = 7.417.  1 world unit = 1 foot.
// Coordinates: origin (0,0) is the FRONT-LEFT (north-west) corner.
//   x  → runs LEFT→RIGHT  (west → east)   ... the short dimension (~20 ft)
//   z  → runs TOP→BOTTOM  (north → south) ... the long dimension (~43 ft)
// Each room is its NW corner (x,z) plus width w (east-west) and depth d (north-south).
//
// Reading of the drawing (labeled dimensions I could see):
//   Den 8'1"×7'5" · Living 12'7"×13'6" · Dining 12'6"×14'6"
//   Bedroom 1 7'5"×14'6" · Bedroom 2 7'4"×10'6" · Kitchen 12'5"×14'10"
//   Deck 11'×6'9"  ·  Bath (no printed dims — estimated)
// The room boxes below are straightened onto a clean spine at x=8 so there
// are no gaps; the outer east wall is left slightly jagged (the bay) as drawn.
// ─────────────────────────────────────────────────────────────────────────

// tiny helper so you can write feet+inches instead of doing the math
export const ft = (feet, inches = 0) => feet + inches / 12;

// Wall + ceiling settings (safe to tweak)
export const WALL_THICKNESS = 0.4;   // ~5 in
export const WALL_HEIGHT     = 8;    // ceiling height, ft
export const DECK_HEIGHT     = 0.5;  // deck slab / railing base, ft

// ── Interior rooms (walls are auto-generated around these) ──────────────────
export const ROOMS = [
  // WEST column (x 0 → 8)                       name          x     z        w         d
  { name: 'Den',        x: 0,   z: 0,          w: ft(8),     d: ft(7, 5),  color: '#e8ddca' },
  { name: 'Stairs',     x: 0,   z: ft(7, 5),   w: ft(8),     d: ft(10, 5), color: '#d9d4cb', type: 'stairs' },
  { name: 'Bedroom 1',  x: 0,   z: ft(17,10),  w: ft(8),     d: ft(14, 6), color: '#d9e4e8' },
  { name: 'Bedroom 2',  x: 0,   z: ft(32, 4),  w: ft(8),     d: ft(10, 6), color: '#d9e4e8' },

  // EAST column (x 8 → ~20.5)
  { name: 'Living Room',x: 8,   z: 0,          w: ft(12, 7), d: ft(13, 6), color: '#e9e2d4' },
  { name: 'Dining Room',x: 8,   z: ft(13, 6),  w: ft(12, 6), d: ft(14, 6), color: '#e9e2d4' },
  { name: 'Kitchen',    x: 8,   z: ft(28),     w: ft(12, 5), d: ft(14,10), color: '#e4e7de' },
];

// ── Bath — small room carved into the east side (estimated, no printed dims) ─
export const BATH = { name: 'Bath', x: 14.5, z: 24, w: 6, d: 6.5, color: '#dfe8ea' };

// ── Deck — outdoor slab at the rear ─────────────────────────────────────────
export const DECK = { name: 'Deck', x: 6, z: ft(42,10), w: ft(11), d: ft(6, 9), color: '#cbb79a' };

// Overall footprint (derived, used to frame the camera)
export const BOUNDS = {
  minX: 0, maxX: 8 + ft(12, 7),
  minZ: 0, maxZ: ft(42, 10) + ft(6, 9),
};
