"use strict";

export function rebuildIdIndex(index, entities, isActive = (entity) => entity?.hp > 0) {
  index.clear();
  for (const entity of entities) {
    if (entity?.id != null && isActive(entity)) index.set(entity.id, entity);
  }
  return index;
}

function integerKey(x, y) {
  const a = x >= 0 ? x * 2 : -x * 2 - 1;
  const b = y >= 0 ? y * 2 : -y * 2 - 1;
  const sum = a + b;
  return (sum * (sum + 1)) / 2 + b;
}

export function createSpatialPairIndex(cellSize = 512) {
  const size = Math.max(1, Number(cellSize) || 1);
  const grid = new Map();
  const activeKeys = [];
  function clearActiveBuckets() {
    for (const key of activeKeys) grid.get(key).length = 0;
    activeKeys.length = 0;
  }
  return {
    forEachPair(entities, callback, isActive = (entity) => entity?.hp > 0) {
      clearActiveBuckets();
      for (let index = 0; index < entities.length; index++) {
        const entity = entities[index];
        if (!isActive(entity)) continue;
        const key = integerKey(Math.floor(entity.x / size), Math.floor(entity.y / size));
        let bucket = grid.get(key);
        if (!bucket) { bucket = []; grid.set(key, bucket); }
        if (bucket.length === 0) activeKeys.push(key);
        bucket.push(index);
      }
      for (let index = 0; index < entities.length; index++) {
        const entity = entities[index];
        if (!isActive(entity)) continue;
        const cellX = Math.floor(entity.x / size), cellY = Math.floor(entity.y / size);
        for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
          const bucket = grid.get(integerKey(cellX + ox, cellY + oy));
          if (!bucket?.length) continue;
          for (const otherIndex of bucket) {
            if (otherIndex > index) callback(entity, entities[otherIndex], index, otherIndex);
          }
        }
      }
    },
    stats() { return { allocatedBuckets: grid.size, activeBuckets: activeKeys.length }; },
  };
}

export class SpatialIndex {
  constructor(cellSize = 640) {
    this.cellSize = Math.max(64, Number(cellSize) || 640);
    this.cells = new Map();
  }

  rebuild(items) {
    this.cells.clear();
    for (const item of items || []) {
      if (!item || !Number.isFinite(Number(item.x)) || !Number.isFinite(Number(item.y))) continue;
      const cx = Math.floor(Number(item.x) / this.cellSize);
      const cy = Math.floor(Number(item.y) / this.cellSize);
      const key = `${cx}:${cy}`;
      let cell = this.cells.get(key);
      if (!cell) this.cells.set(key, cell = []);
      cell.push(item);
    }
  }

  queryRect(minX, minY, maxX, maxY) {
    const out = [];
    const x0 = Math.floor(Number(minX) / this.cellSize);
    const y0 = Math.floor(Number(minY) / this.cellSize);
    const x1 = Math.floor(Number(maxX) / this.cellSize);
    const y1 = Math.floor(Number(maxY) / this.cellSize);
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const cell = this.cells.get(`${cx}:${cy}`);
        if (!cell) continue;
        for (const item of cell) {
          if (item.x >= minX && item.x <= maxX && item.y >= minY && item.y <= maxY) out.push(item);
        }
      }
    }
    return out;
  }

  queryCircle(x, y, radius) {
    const r = Math.max(0, Number(radius) || 0);
    const r2 = r * r;
    return this.queryRect(x - r, y - r, x + r, y + r)
      .filter((item) => {
        const dx = Number(item.x) - x, dy = Number(item.y) - y;
        return dx * dx + dy * dy <= r2;
      });
  }
}

// API historique utilisee par le benchmark du projet : chaque paire d'une
// cellule et de ses huit voisines est visitee une seule fois.
export function forEachNearbyPair(items, cellSize, visit) {
  createSpatialPairIndex(cellSize).forEachPair(items, visit);
}
