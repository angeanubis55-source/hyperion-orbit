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

export function drawBackgroundLayerSet(context, layers, options) {
  if (!context || !layers?.length) return;
  const { offsetX, offsetY, viewportWidth, viewportHeight, getImage, isImageReady } = options;
  for (const layer of layers) {
    const image = getImage(layer.src);
    if (!isImageReady(image)) continue;
    const parallaxX = offsetX * Number(layer.parallax ?? 0);
    const parallaxY = offsetY * Number(layer.parallax ?? 0);
    context.save();
    context.globalAlpha = clamp(layer.alpha ?? 1, 0, 1);
    if (layer.blend) context.globalCompositeOperation = layer.blend;
    const imageWidth = image.naturalWidth || image.width || 1;
    const imageHeight = image.naturalHeight || image.height || 1;
    if (layer.mode === "tile") {
      const pattern = cachedPattern(context, image, "repeat");
      if (pattern) {
        context.translate(parallaxX, parallaxY);
        context.fillStyle = pattern;
        context.fillRect(-parallaxX, -parallaxY, viewportWidth, viewportHeight);
      }
      context.restore();
      continue;
    }
    const scaleX = viewportWidth / imageWidth;
    const scaleY = viewportHeight / imageHeight;
    const scale = layer.mode === "contain" ? Math.min(scaleX, scaleY) : Math.max(scaleX, scaleY);
    const width = imageWidth * scale;
    const height = imageHeight * scale;
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(image, (viewportWidth - width) * 0.5 + parallaxX, (viewportHeight - height) * 0.5 + parallaxY, width, height);
    context.restore();
  }
}

const STARFIELD_LAYERS = Object.freeze([
  { spacing: 180, parallax: 0.04, driftX: 3, driftY: 1.02, radius: 0.75, alpha: 0.48 },
  { spacing: 132, parallax: 0.11, driftX: 5.8, driftY: 1.97, radius: 1.05, alpha: 0.65 },
  { spacing: 98, parallax: 0.23, driftX: 9.5, driftY: 3.23, radius: 1.35, alpha: 0.86 },
]);

function starHash(x, y, seed) {
  let value = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 1442695041);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
}

/**
 * Champ d'étoiles à trois profondeurs. Chaque profondeur est pré-rendue une
 * seule fois dans un canvas offscreen tuilable (les étoiles sont déterministes,
 * aucune ne scintille ni ne saute entre deux frames). À chaque frame, on ne fait
 * que décaler les textures (parallaxe + dérive) via drawImage, ce qui évite de
 * redessiner ~600 arcs par image.
 */
const STARFIELD_TILE_MARGIN = 3;
const starfieldCache = new Map();

function buildStarLayer(layer, layerIndex, viewportWidth, viewportHeight) {
  const spacing = layer.spacing;
  const cellsW = Math.ceil(viewportWidth / spacing) + STARFIELD_TILE_MARGIN * 2;
  const cellsH = Math.ceil(viewportHeight / spacing) + STARFIELD_TILE_MARGIN * 2;
  const tileW = Math.max(1, cellsW * spacing);
  const tileH = Math.max(1, cellsH * spacing);
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(tileW);
  canvas.height = Math.ceil(tileH);
  const c = canvas.getContext("2d");
  c.save();
  c.globalCompositeOperation = "lighter";
  for (let row = 0; row < cellsH; row++) {
    for (let col = 0; col < cellsW; col++) {
      const jitterX = starHash(col, row, layerIndex * 7 + 1) * spacing;
      const jitterY = starHash(col, row, layerIndex * 7 + 2) * spacing;
      let x = (col * spacing + jitterX) % tileW;
      let y = (row * spacing + jitterY) % tileH;
      if (x < 0) x += tileW;
      if (y < 0) y += tileH;
      const brightness = 0.62 + starHash(col, row, layerIndex * 7 + 3) * 0.38;
      const radius = layer.radius * (0.72 + starHash(col, row, layerIndex * 7 + 4) * 0.55);
      c.globalAlpha = layer.alpha * brightness;
      c.fillStyle = layerIndex === 2 ? "#dff8ff" : "#b8dded";
      c.beginPath();
      c.arc(x, y, radius, 0, Math.PI * 2);
      c.fill();
    }
  }
  c.restore();
  return { canvas, tileW, tileH };
}

function getStarLayer(layer, layerIndex, viewportWidth, viewportHeight) {
  const key = `${layerIndex}:${Math.round(viewportWidth)}:${Math.round(viewportHeight)}`;
  let tile = starfieldCache.get(key);
  if (!tile) {
    tile = buildStarLayer(layer, layerIndex, viewportWidth, viewportHeight);
    starfieldCache.set(key, tile);
  }
  return tile;
}

export function drawParallaxStarfield(context, options = {}) {
  if (!context) return;
  const viewportWidth = Math.max(1, Number(options.viewportWidth) || 1);
  const viewportHeight = Math.max(1, Number(options.viewportHeight) || 1);
  const cameraX = Number(options.cameraX) || 0;
  const cameraY = Number(options.cameraY) || 0;
  const elapsedSeconds = Math.max(0, Number(options.elapsedSeconds) || 0);

  context.save();
  context.globalCompositeOperation = "lighter";

  STARFIELD_LAYERS.forEach((layer, layerIndex) => {
    const src = getStarLayer(layer, layerIndex, viewportWidth, viewportHeight);
    const offsetX = cameraX * layer.parallax - elapsedSeconds * layer.driftX;
    const offsetY = cameraY * layer.parallax - elapsedSeconds * layer.driftY;
    let startX = ((offsetX % src.tileW) + src.tileW) % src.tileW;
    let startY = ((offsetY % src.tileH) + src.tileH) % src.tileH;

    for (const dx of [0, src.tileW]) {
      for (const dy of [0, src.tileH]) {
        context.drawImage(src.canvas, dx - startX, dy - startY);
      }
    }
  });

  context.restore();
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
