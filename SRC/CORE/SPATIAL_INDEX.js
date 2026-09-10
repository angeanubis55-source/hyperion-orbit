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
        if (!bucket) {
          bucket = [];
          grid.set(key, bucket);
        }
        if (bucket.length === 0) activeKeys.push(key);
        bucket.push(index);
      }

      for (let index = 0; index < entities.length; index++) {
        const entity = entities[index];
        if (!isActive(entity)) continue;
        const cellX = Math.floor(entity.x / size);
        const cellY = Math.floor(entity.y / size);

        for (let offsetY = -1; offsetY <= 1; offsetY++) {
          for (let offsetX = -1; offsetX <= 1; offsetX++) {
            const bucket = grid.get(integerKey(cellX + offsetX, cellY + offsetY));
            if (!bucket?.length) continue;
            for (const otherIndex of bucket) {
              if (otherIndex > index) callback(entity, entities[otherIndex], index, otherIndex);
            }
          }
        }
      }
    },
    stats() { return { allocatedBuckets: grid.size, activeBuckets: activeKeys.length }; },
  };
}

export function forEachNearbyPair(entities, cellSize, callback, isActive) {
  createSpatialPairIndex(cellSize).forEachPair(entities, callback, isActive);
}
