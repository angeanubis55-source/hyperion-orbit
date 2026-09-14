"use strict";

import { clamp } from "./COLLISION.js";

const PATTERN_CACHE = new WeakMap();

function patternCacheFor(context) {
  let byImage = PATTERN_CACHE.get(context);
  if (!byImage) {
    byImage = new Map();
    PATTERN_CACHE.set(context, byImage);
  }
  return byImage;
}

function cachedPattern(context, image, repeat) {
  if (!context || !image) return null;
  const byImage = patternCacheFor(context);
  const key = repeat + ":repeat";
  let entry = byImage.get(image);
  if (!entry) {
    entry = {};
    byImage.set(image, entry);
  }
  if (!entry[key]) entry[key] = context.createPattern(image, repeat);
  return entry[key];
}

export function drawWallLayer(context, walls, texture, options) {
  if (!context || !walls?.length || !texture) return;
  const { offsetX, offsetY, getImage, isImageReady, createScaleMatrix } = options;
  const image = getImage(texture.src);
  if (!isImageReady(image)) return;
  const pattern = cachedPattern(context, image, "repeat");
  if (!pattern) return;
  const imageWidth = image.naturalWidth || image.width || 1;
  const imageHeight = image.naturalHeight || image.height || 1;
  if (pattern.setTransform && createScaleMatrix) {
    pattern.setTransform(createScaleMatrix((texture.w || imageWidth) / imageWidth, (texture.h || imageHeight) / imageHeight));
  }
  context.save();
  for (const wall of walls) {
    context.save();
    context.translate(wall.x - wall.w / 2 + offsetX, wall.y - wall.h / 2 + offsetY);
    context.fillStyle = pattern;
    context.fillRect(0, 0, wall.w, wall.h);
    context.restore();
  }
  context.restore();
  if (pattern.setTransform && typeof DOMMatrix !== "undefined") {
    pattern.setTransform(new DOMMatrix());
  }
}
