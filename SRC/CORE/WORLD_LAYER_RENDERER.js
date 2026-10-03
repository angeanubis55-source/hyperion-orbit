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
    // ✅ Coords écran arrondies à l'entier : 2 murs qui partagent EXACTEMENT
    // la même arête tombent sur le même pixel → aucune ligne de jointure
    // (avec des fractionnaires, l'antialiasing laissait filtrer le fond).
    context.translate(0, 0);
    context.fillStyle = pattern;
    const x0 = Math.round(wall.x - wall.w / 2 + offsetX);
    const y0 = Math.round(wall.y - wall.h / 2 + offsetY);
    const x1 = Math.round(wall.x + wall.w / 2 + offsetX);
    const y1 = Math.round(wall.y + wall.h / 2 + offsetY);
    context.fillRect(x0, y0, x1 - x0, y1 - y0);
    context.restore();
  }
  context.restore();
  if (pattern.setTransform && typeof DOMMatrix !== "undefined") {
    pattern.setTransform(new DOMMatrix());
  }
}
