"use strict";

import { clamp } from "./COLLISION.js";

export function cameraOffset(camera, viewportWidth, viewportHeight) {
  return {
    x: viewportWidth / 2 - camera.x,
    y: viewportHeight / 2 - camera.y,
  };
}

export function screenToWorldPoint(screenX, screenY, camera, viewportWidth, viewportHeight, zoom = 1) {
  const z = Number(zoom) > 0 ? Number(zoom) : 1;
  const offset = cameraOffset(camera, viewportWidth, viewportHeight);
  if (z === 1) return { x: screenX - offset.x, y: screenY - offset.y };
  const cx = viewportWidth / 2, cy = viewportHeight / 2;
  return { x: camera.x + (screenX - cx) / z, y: camera.y + (screenY - cy) / z };
}

export function worldToScreenPoint(worldX, worldY, camera, viewportWidth, viewportHeight, zoom = 1) {
  const z = Number(zoom) > 0 ? Number(zoom) : 1;
  const offset = cameraOffset(camera, viewportWidth, viewportHeight);
  if (z === 1) return { x: worldX + offset.x, y: worldY + offset.y };
  const cx = viewportWidth / 2, cy = viewportHeight / 2;
  return { x: cx + (worldX - camera.x) * z, y: cy + (worldY - camera.y) * z };
}

export function isWorldPointVisible(worldX, worldY, camera, viewportWidth, viewportHeight, margin = 120, zoom = 1) {
  const screen = worldToScreenPoint(worldX, worldY, camera, viewportWidth, viewportHeight, zoom);
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
