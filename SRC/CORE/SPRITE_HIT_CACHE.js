// Like sprite outlines, picking follows the image alpha rather than its box.
// Store one bit per source pixel, shared across entities and drawing sizes.
export function createSpriteHitCache({ maxBytes = 4 * 1024 * 1024, maxEntries = 256,
  createCanvas = () => document.createElement('canvas') } = {}) {
  const entries = new Map(), unreadable = new WeakSet();
  let bytes = 0;

  function remove(image) {
    bytes -= entries.get(image).data.byteLength;
    entries.delete(image);
  }

  function get(image) {
    if (!image || unreadable.has(image) || image.complete === false) return null;
    const w = Math.floor(Number(image.naturalWidth ?? image.width) || 0);
    const h = Math.floor(Number(image.naturalHeight ?? image.height) || 0);
    if (!(w > 0 && h > 0)) return null;
    let entry = entries.get(image);
    if (entry && entry.w === w && entry.h === h) {
      entries.delete(image); entries.set(image, entry);
      return entry;
    }
    if (entry) remove(image);
    let canvas;
    try {
      canvas = createCanvas();
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(image, 0, 0);
      const rgba = ctx.getImageData(0, 0, w, h).data;
      const data = new Uint8Array(Math.ceil(w * h / 8));
      for (let i = 0; i < w * h; i++) {
        if (rgba[i * 4 + 3] > 0) data[i >> 3] |= 1 << (i & 7);
      }
      entry = { w, h, data };
      entries.set(image, entry); bytes += data.byteLength;
      while (entries.size > maxEntries || bytes > maxBytes) remove(entries.keys().next().value);
      return entry;
    } catch {
      // A failed read never turns transparent space back into a clickable box.
      unreadable.add(image);
      return null;
    } finally {
      if (canvas) canvas.width = canvas.height = 0;
    }
  }

  return {
    contains(image, width, height, x, y) {
      if (!(width > 0 && height > 0)) return false;
      const u = x / width + 0.5, v = y / height + 0.5;
      if (!(u >= 0 && u < 1 && v >= 0 && v < 1)) return false;
      const entry = get(image);
      if (!entry) return false;
      const index = Math.floor(v * entry.h) * entry.w + Math.floor(u * entry.w);
      return (entry.data[index >> 3] & (1 << (index & 7))) !== 0;
    },
    clear() { entries.clear(); bytes = 0; },
    stats: () => ({ entries: entries.size, bytes }),
  };
}
