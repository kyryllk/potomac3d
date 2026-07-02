// Feet ↔ human-readable helpers. Internal model is always decimal feet.

// 6.667 → "6′8″"   (rounds to the nearest inch)
export function ftToStr(feet) {
  const totalIn = Math.round(feet * 12);
  const f = Math.floor(totalIn / 12);
  const inch = totalIn % 12;
  if (f === 0) return `${inch}″`;
  if (inch === 0) return `${f}′`;
  return `${f}′${inch}″`;
}

// decimal feet → whole inches (for the resize inputs)
export const ftToIn = (feet) => Math.round(feet * 12);

// whole inches → decimal feet
export const inToFt = (inches) => inches / 12;

// radians → whole degrees and back (for the rotation input)
export const radToDeg = (r) => Math.round((r * 180) / Math.PI);
export const degToRad = (d) => (d * Math.PI) / 180;
