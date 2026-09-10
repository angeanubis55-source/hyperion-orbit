const FIT_KEYS = ["lasers", "gens", "extras", "shipMods"];

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
