"use strict";

export function pushBounded(collection, value, limit) {
  if (!Array.isArray(collection)) throw new TypeError("collection must be an array");
  const max = Math.max(1, Math.floor(Number(limit) || 1));
  if (collection.length >= max) collection.splice(0, collection.length - max + 1);
  collection.push(value);
  return value;
}
