"use strict";

import { clamp } from "./collision.js";

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
      const pattern = context.createPattern(image, "repeat");
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
 * Champ d'étoiles à trois profondeurs. Les positions sont calculées depuis une
 * grille déterministe : aucune étoile ne scintille ou ne saute entre deux frames.
 */
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
    const worldOffsetX = cameraX * layer.parallax - elapsedSeconds * layer.driftX;
    const worldOffsetY = cameraY * layer.parallax - elapsedSeconds * layer.driftY;
    const firstColumn = Math.floor(worldOffsetX / layer.spacing) - 1;
    const firstRow = Math.floor(worldOffsetY / layer.spacing) - 1;
    const columns = Math.ceil(viewportWidth / layer.spacing) + 3;
    const rows = Math.ceil(viewportHeight / layer.spacing) + 3;

    for (let row = firstRow; row < firstRow + rows; row++) {
      for (let column = firstColumn; column < firstColumn + columns; column++) {
        const jitterX = starHash(column, row, layerIndex * 7 + 1) * layer.spacing;
        const jitterY = starHash(column, row, layerIndex * 7 + 2) * layer.spacing;
        const x = column * layer.spacing + jitterX - worldOffsetX;
        const y = row * layer.spacing + jitterY - worldOffsetY;
        if (x < -3 || y < -3 || x > viewportWidth + 3 || y > viewportHeight + 3) continue;

        const brightness = 0.62 + starHash(column, row, layerIndex * 7 + 3) * 0.38;
        const radius = layer.radius * (0.72 + starHash(column, row, layerIndex * 7 + 4) * 0.55);
        context.globalAlpha = layer.alpha * brightness;
        context.fillStyle = layerIndex === 2 ? "#dff8ff" : "#b8dded";
        context.beginPath();
        context.arc(x, y, radius, 0, Math.PI * 2);
        context.fill();
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
  const pattern = context.createPattern(image, "repeat");
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
}
