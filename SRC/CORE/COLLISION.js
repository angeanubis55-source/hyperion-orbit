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

export function circleRectResolve(px, py, radius, rect) {  if (!rect) return null;

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

// Raccourcit une destination au premier mur traversé : le segment
// (fx,fy)->(tx,ty) s'arrête à la bordure du premier rectangle (gonflé de
// margin) au lieu de passer à travers. Retourne { x, y } (inchangé si
// aucun mur traversé). Utilisé pour les clics de déplacement.
export function clampSegmentToWalls(fx, fy, tx, ty, walls, margin = 0) {
  const dx = tx - fx, dy = ty - fy;
  const len = Math.hypot(dx, dy);
  if (!(len > 0.000001) || !Array.isArray(walls) || !walls.length) return { x: tx, y: ty };
  const m = Math.max(0, Number(margin) || 0);
  let bestT = Infinity;
  for (const rect of walls) {
    if (!rect) continue;
    const left = rect.x - rect.w / 2 - m;
    const right = rect.x + rect.w / 2 + m;
    const top = rect.y - rect.h / 2 - m;
    const bottom = rect.y + rect.h / 2 + m;
    // Départ déjà dedans : on reste sur place (pas de destination valide).
    if (fx >= left && fx <= right && fy >= top && fy <= bottom) return { x: fx, y: fy };
    let tmin = 0, tmax = 1;
    if (Math.abs(dx) < 1e-9) {
      if (fx < left || fx > right) continue;
    } else {
      let t1 = (left - fx) / dx, t2 = (right - fx) / dx;
      if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) continue;
    }
    if (Math.abs(dy) < 1e-9) {
      if (fy < top || fy > bottom) continue;
    } else {
      let t1 = (top - fy) / dy, t2 = (bottom - fy) / dy;
      if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) continue;
    }
    if (tmin > 0 && tmin < bestT) bestT = tmin;
  }
  if (!Number.isFinite(bestT)) return { x: tx, y: ty };
  const back = Math.min(0.999, (m + 4) / len);
  const t = Math.max(0, bestT - back);
  return { x: fx + dx * t, y: fy + dy * t };
}
