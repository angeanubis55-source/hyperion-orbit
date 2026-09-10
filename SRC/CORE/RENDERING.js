"use strict";

import { clamp } from "./COLLISION.js";

export function cameraOffset(camera, viewportWidth, viewportHeight) {
  return {
    x: viewportWidth / 2 - camera.x,
    y: viewportHeight / 2 - camera.y,
  };
}

export function screenToWorldPoint(screenX, screenY, camera, viewportWidth, viewportHeight) {
  const offset = cameraOffset(camera, viewportWidth, viewportHeight);
  return { x: screenX - offset.x, y: screenY - offset.y };
}

export function worldToScreenPoint(worldX, worldY, camera, viewportWidth, viewportHeight) {
  const offset = cameraOffset(camera, viewportWidth, viewportHeight);
  return { x: worldX + offset.x, y: worldY + offset.y };
}

export function isWorldPointVisible(worldX, worldY, camera, viewportWidth, viewportHeight, margin = 120) {
  const screen = worldToScreenPoint(worldX, worldY, camera, viewportWidth, viewportHeight);
  return screen.x >= -margin && screen.y >= -margin &&
    screen.x <= viewportWidth + margin && screen.y <= viewportHeight + margin;
}

export function hpHueColor(percent, alpha = 0.98) {
  return `hsla(${120 * clamp(percent, 0, 1)}, 95%, 55%, ${clamp(alpha, 0, 1)})`;
}

export function drawCenteredImage(context, image, width, height, smoothing = false) {
  if (!context || !image || width <= 0 || height <= 0) return false;
  context.save();
  context.imageSmoothingEnabled = smoothing;
  context.drawImage(image, -width / 2, -height / 2, width, height);
  context.restore();
  return true;
}
