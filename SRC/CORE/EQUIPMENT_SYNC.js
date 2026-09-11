// Preserve damage when capacity changes; an unequipped shield has no damage ratio.
export function resizeShield(saved, nextMax) {
  const max = Math.max(0, Number(nextMax) || 0);
  if (!saved || !(Number(saved.shMax) > 0)) return { sh: max, shMax: max };
  const ratio = Math.max(0, Math.min(1, (Number(saved.sh) || 0) / Number(saved.shMax)));
  return { sh: Math.floor(max * ratio), shMax: max };
}
