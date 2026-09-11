const FIT_KEYS = ["lasers", "gens", "extras", "shipMods"];

export function moveEquipmentSlots(source, target, sourceIndex, targetIndex) {
  if (!Array.isArray(source) || !Array.isArray(target)
    || !Number.isInteger(sourceIndex) || !Number.isInteger(targetIndex)
    || sourceIndex < 0 || sourceIndex >= source.length
    || targetIndex < 0 || targetIndex >= target.length || !source[sourceIndex]) return null;
  const nextSource = [...source];
  const nextTarget = source === target ? nextSource : [...target];
  nextSource[sourceIndex] = target[targetIndex] || null;
  nextTarget[targetIndex] = source[sourceIndex];
  return { source: nextSource, target: nextTarget };
}

export function compactFitArray(values, capacity = Array.isArray(values) ? values.length : 0) {
  const size = Math.max(0, Math.floor(Number(capacity) || 0));
  const filled = (Array.isArray(values) ? values : []).filter(Boolean).slice(0, size);
  return filled.concat(Array(Math.max(0, size - filled.length)).fill(null));
}

export function compactFitDraft(draft, slots = {}) {
  const source = draft && typeof draft === "object" ? draft : {};
  const result = {};
  for (const key of FIT_KEYS) {
    const fallback = Array.isArray(source[key]) ? source[key].length : 0;
    result[key] = compactFitArray(source[key], slots[key] ?? fallback);
  }
  return result;
}

export function appendToFitSlots(values, itemIds, capacity = Array.isArray(values) ? values.length : 0) {
  const compacted = compactFitArray(values, capacity);
  let cursor = compacted.findIndex((value) => !value);
  let added = 0;
  for (const itemId of Array.isArray(itemIds) ? itemIds : []) {
    if (!itemId || cursor < 0) break;
    compacted[cursor] = itemId;
    added += 1;
    cursor = compacted.findIndex((value, index) => index > cursor && !value);
  }
  return { values: compacted, added };
}

// Drones / P.E.T : même règle que le vaisseau — aucun trou, tout poussé en haut à gauche.
// compactDroneEquipment(equipment, capacity) : compacte une liste d'équipement drone.
// compactPetFit(fit, sizes) : compacte chaque groupe (lasers / generators-gears-protocols, etc.).
export function compactDroneEquipment(values, capacity = Array.isArray(values) ? values.length : 0) {
  return compactFitArray(values, capacity);
}

export function compactPetFit(fit, sizes = {}) {
  const source = fit && typeof fit === "object" ? fit : {};
  const result = { ...source };
  for (const key of Object.keys(source)) {
    if (key === "ability") continue;
    if (!Array.isArray(source[key])) continue;
    const fallback = source[key].length;
    const size = sizes[key] ?? fallback;
    result[key] = compactFitArray(source[key], size);
  }
  // Groupes connus même si absents du draft (taille imposée par le niveau).
  for (const key of Object.keys(sizes)) {
    if (key === "ability" || Array.isArray(result[key])) continue;
    result[key] = compactFitArray([], sizes[key]);
  }
  return result;
}
