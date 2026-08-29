"use strict";

export function rebuildIdIndex(index, entities, isActive = (entity) => entity?.hp > 0) {
  index.clear();
  for (const entity of entities) {
    if (entity?.id != null && isActive(entity)) index.set(entity.id, entity);
  }
  return index;
}

export function forEachNearbyPair(entities, cellSize, callback, isActive = (entity) => entity?.hp > 0) {
  const size = Math.max(1, Number(cellSize) || 1);
  const grid = new Map();

  for (let index = 0; index < entities.length; index++) {
    const entity = entities[index];
    if (!isActive(entity)) continue;
    const key = `${Math.floor(entity.x / size)},${Math.floor(entity.y / size)}`;
    const bucket = grid.get(key);
    if (bucket) bucket.push(index);
    else grid.set(key, [index]);
  }

  for (let index = 0; index < entities.length; index++) {
    const entity = entities[index];
    if (!isActive(entity)) continue;
    const cellX = Math.floor(entity.x / size);
    const cellY = Math.floor(entity.y / size);

    for (let offsetY = -1; offsetY <= 1; offsetY++) {
      for (let offsetX = -1; offsetX <= 1; offsetX++) {
        const bucket = grid.get(`${cellX + offsetX},${cellY + offsetY}`);
        if (!bucket) continue;
        for (const otherIndex of bucket) {
          if (otherIndex <= index) continue;
          callback(entity, entities[otherIndex], index, otherIndex);
        }
      }
    }
  }
}
