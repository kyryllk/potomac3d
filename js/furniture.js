// ─────────────────────────────────────────────────────────────────────────
// FURNITURE CATALOG
// ─────────────────────────────────────────────────────────────────────────
// Each item is a real-world-sized box you can drop into the room.
// Sizes are in FEET: w = width (left-right), d = depth (front-back), h = height.
// Add your own items by copying a line — they show up in the palette automatically.
// `cat` groups them in the palette. `color` is the box tint.
// ─────────────────────────────────────────────────────────────────────────

const ft = (feet, inches = 0) => feet + inches / 12;

export const CATALOG = [
  // Beds
  { type: 'bed-queen',   label: 'Queen Bed',   cat: 'Bedroom', w: ft(5),      d: ft(6, 8),  h: ft(2),     color: '#8ba7c4' },
  { type: 'bed-full',    label: 'Full Bed',    cat: 'Bedroom', w: ft(4, 6),   d: ft(6, 3),  h: ft(2),     color: '#8ba7c4' },
  { type: 'bed-twin',    label: 'Twin Bed',    cat: 'Bedroom', w: ft(3, 3),   d: ft(6, 3),  h: ft(2),     color: '#8ba7c4' },
  { type: 'nightstand',  label: 'Nightstand',  cat: 'Bedroom', w: ft(1, 8),   d: ft(1, 6),  h: ft(2),     color: '#a98d6b' },
  { type: 'dresser',     label: 'Dresser',     cat: 'Bedroom', w: ft(5),      d: ft(1, 8),  h: ft(3),     color: '#a98d6b' },

  // Living
  { type: 'sofa',        label: 'Sofa',        cat: 'Living',  w: ft(7),      d: ft(3),     h: ft(2, 10), color: '#7c9c86' },
  { type: 'loveseat',    label: 'Loveseat',    cat: 'Living',  w: ft(5),      d: ft(3),     h: ft(2, 10), color: '#7c9c86' },
  { type: 'armchair',    label: 'Armchair',    cat: 'Living',  w: ft(2, 10),  d: ft(3),     h: ft(2, 10), color: '#7c9c86' },
  { type: 'coffee-table',label: 'Coffee Table',cat: 'Living',  w: ft(4),      d: ft(2),     h: ft(1, 6),  color: '#a98d6b' },
  { type: 'tv-stand',    label: 'TV Stand',    cat: 'Living',  w: ft(5),      d: ft(1, 6),  h: ft(2),     color: '#8a8a8a' },
  { type: 'bookshelf',   label: 'Bookshelf',   cat: 'Living',  w: ft(2, 6),   d: ft(1),     h: ft(6),     color: '#a98d6b' },

  // Dining / Kitchen
  { type: 'dining-table',label: 'Dining Table',cat: 'Kitchen', w: ft(6),      d: ft(3),     h: ft(2, 6),  color: '#a98d6b' },
  { type: 'dining-chair',label: 'Dining Chair',cat: 'Kitchen', w: ft(1, 6),   d: ft(1, 6),  h: ft(3),     color: '#8a7a5c' },
  { type: 'fridge',      label: 'Refrigerator',cat: 'Kitchen', w: ft(3),      d: ft(2, 10), h: ft(5, 9),  color: '#c9ccd1' },
  { type: 'range',       label: 'Range / Stove',cat:'Kitchen', w: ft(2, 6),   d: ft(2, 6),  h: ft(3),     color: '#c9ccd1' },
  { type: 'island',      label: 'Kitchen Island',cat:'Kitchen',w: ft(4),      d: ft(2),     h: ft(3),     color: '#b7a888' },

  // Office / misc
  { type: 'desk',        label: 'Desk',        cat: 'Office',  w: ft(4),      d: ft(2),     h: ft(2, 6),  color: '#a98d6b' },
  { type: 'office-chair',label: 'Office Chair',cat: 'Office',  w: ft(2),      d: ft(2),     h: ft(3, 4),  color: '#6a6a6a' },
  { type: 'rug',         label: 'Rug (8×5)',   cat: 'Misc',    w: ft(8),      d: ft(5),     h: ft(0, 1),  color: '#b06a5c' },
  { type: 'box',         label: 'Blank Box',   cat: 'Misc',    w: ft(2),      d: ft(2),     h: ft(2),     color: '#b0895c' },
];

// Grouped by category for building the palette UI
export function catalogByCategory() {
  const groups = {};
  for (const item of CATALOG) (groups[item.cat] ||= []).push(item);
  return groups;
}

export function catalogItem(type) {
  return CATALOG.find((i) => i.type === type);
}
