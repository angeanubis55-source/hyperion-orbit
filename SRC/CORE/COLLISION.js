"use strict";

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function dist2(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

export function segCircleHit(ax, ay, bx, by, cx, cy, radius) {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;

  if (lengthSquared <= 0.000001) {
    return dist2(ax, ay, cx, cy) <= radius * radius;
  }

  const t = clamp(((cx - ax) * dx + (cy - ay) * dy) / lengthSquared, 0, 1);
  const closestX = ax + dx * t;
  const closestY = ay + dy * t;
  return dist2(closestX, closestY, cx, cy) <= radius * radius;
}

export function movingCircleHit(projectileStart, projectileEnd, targetStart, targetEnd, radius) {
  return segCircleHit(
    projectileStart.x - targetStart.x,
    projectileStart.y - targetStart.y,
    projectileEnd.x - targetEnd.x,
    projectileEnd.y - targetEnd.y,
    0,
    0,
    radius,
  );
}

export function circleRectResolve(px, py, radius, rect) {
  if (!rect) return null;

  const halfWidth = rect.w * 0.5;
  const halfHeight = rect.h * 0.5;
  const left = rect.x - halfWidth;
  const right = rect.x + halfWidth;
  const top = rect.y - halfHeight;
  const bottom = rect.y + halfHeight;
  const closestX = clamp(px, left, right);
  const closestY = clamp(py, top, bottom);
  const dx = px - closestX;
  const dy = py - closestY;
  const distanceSquared = dx * dx + dy * dy;

  if (distanceSquared > radius * radius) return null;

  // Si le centre est dans le rectangle, la normale issue du point le plus
  // proche est nulle. On choisit alors explicitement la sortie la plus courte.
  if (distanceSquared <= 0.000001) {
    const exits = [
      { x: left - radius - px, y: 0 },
      { x: right + radius - px, y: 0 },
      { x: 0, y: top - radius - py },
      { x: 0, y: bottom + radius - py },
    ];
    return exits.reduce((best, candidate) =>
      Math.abs(candidate.x) + Math.abs(candidate.y) < Math.abs(best.x) + Math.abs(best.y)
        ? candidate
        : best
    );
  }

  const distance = Math.sqrt(distanceSquared);
  const overlap = radius - distance + 0.5;
  return { x: (dx / distance) * overlap, y: (dy / distance) * overlap };
}
