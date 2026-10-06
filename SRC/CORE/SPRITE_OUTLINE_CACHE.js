// Cache only the glow, not the ship/NPC sprite. Large bosses keep their
// original body resolution; the soft outline needs at most 512 pixels.
export function createSpriteOutlineCache({ maxPixels = 8 * 1024 * 1024, maxEntries = 128,
  maxEdge = 512, createCanvas = () => document.createElement('canvas') } = {}) {
  const entries = new Map(), imageIds = new WeakMap();
  let nextId = 0, pixels = 0;

  function remove(key) {
    const entry = entries.get(key);
    pixels -= entry.pixels;
    entries.delete(key);
    entry.canvas.width = entry.canvas.height = 0;
  }

  function get(image, w, h, color, blur = 12, bottomHalf = false) {
    let id = imageIds.get(image);
    if (id == null) { id = ++nextId; imageIds.set(image, id); }
    const key = `${id}:${w}:${h}:${color}:${blur}:${bottomHalf}`;
    let entry = entries.get(key);
    if (entry) {
      entries.delete(key); entries.set(key, entry);
      return entry;
    }
    const pad = Math.ceil(blur * 2 + 2), width = w + pad * 2, height = h + pad * 2;
    const scale = Math.min(1, maxEdge / Math.max(width, height), Math.sqrt(maxPixels / (width * height)));
    const silhouette = createCanvas();
    silhouette.width = Math.max(1, Math.ceil(w * scale));
    silhouette.height = Math.max(1, Math.ceil(h * scale));
    const tint = silhouette.getContext('2d');
    tint.drawImage(image, 0, 0, silhouette.width, silhouette.height);
    tint.globalCompositeOperation = 'source-in';
    tint.fillStyle = color;
    tint.fillRect(0, 0, silhouette.width, silhouette.height);

    const canvas = createCanvas();
    canvas.width = Math.max(1, Math.floor(width * scale));
    canvas.height = Math.max(1, Math.floor(height * scale));
    const g = canvas.getContext('2d');
    g.shadowColor = color; g.shadowBlur = blur * scale;
    for (let k = 0; k < 8; k++) {
      const angle = k / 8 * Math.PI * 2;
      g.drawImage(silhouette, (pad + Math.cos(angle) * 2) * scale,
        (pad + Math.sin(angle) * 2) * scale, w * scale, h * scale);
    }
    g.shadowBlur = 0;
    if (bottomHalf) {
      g.globalCompositeOperation = 'destination-in';
      const mask = g.createLinearGradient(0, (pad + h * 0.30) * scale, 0, (pad + h * 0.62) * scale);
      mask.addColorStop(0, 'rgba(0,0,0,0)'); mask.addColorStop(1, 'rgba(0,0,0,1)');
      g.fillStyle = mask; g.fillRect(0, 0, canvas.width, canvas.height);
    }
    silhouette.width = silhouette.height = 0;
    entry = { canvas, width, height, pixels: canvas.width * canvas.height };
    entries.set(key, entry); pixels += entry.pixels;
    while (entries.size > maxEntries || pixels > maxPixels) remove(entries.keys().next().value);
    return entry;
  }

  return {
    draw(ctx, image, w, h, color, alpha, blur = 12, bottomHalf = false) {
      const entry = get(image, w, h, color, blur, bottomHalf);
      ctx.save();
      ctx.globalAlpha = Math.max(0.3, Math.min(1, alpha));
      ctx.shadowBlur = 0;
      ctx.drawImage(entry.canvas, -entry.width / 2, -entry.height / 2, entry.width, entry.height);
      ctx.restore();
    },
    clear() { for (const key of entries.keys()) remove(key); },
    stats: () => ({ entries: entries.size, pixels }),
  };
}
