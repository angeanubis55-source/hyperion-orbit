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
