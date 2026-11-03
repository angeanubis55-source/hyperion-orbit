"use strict";

// Patrouille d'un minion autour de son maître (Protegit du Cubikon, Icy de
// l'Ice Meteoroid). Le minion vise un point tiré autour du maître et en
// change dès qu'il l'atteint ou que le délai expire.
// opts (défaut = Protegit) : rayon min/max, délai min/max entre deux
// points, multiplicateur de vitesse min/max.
export const PROTEGIT_PATROL = Object.freeze({
  radiusMin: 180, radiusMax: 700,
  timeMin: 0.6, timeMax: 1.4,
  speedMin: 0.85, speedMax: 1,
});

export function protegitPatrol(minion, master, world, dt, random = Math.random, opts = PROTEGIT_PATROL) {
  const o = opts || PROTEGIT_PATROL;
  minion.patrolTime = Math.max(0, Number(minion.patrolTime) || 0) - dt;
  const reached = minion.patrolX != null && Math.hypot(minion.patrolX - minion.x, minion.patrolY - minion.y) < 60;
  if (minion.patrolTime <= 0 || minion.patrolX == null || reached) {
    const angle = random() * Math.PI * 2;
    const radius = o.radiusMin + random() * (o.radiusMax - o.radiusMin);
    minion.patrolX = Math.max(80, Math.min(world.w - 80, master.x + Math.cos(angle) * radius));
    minion.patrolY = Math.max(80, Math.min(world.h - 80, master.y + Math.sin(angle) * radius));
    minion.patrolTime = o.timeMin + random() * (o.timeMax - o.timeMin);
    minion.patrolSpeed = o.speedMin + random() * (o.speedMax - o.speedMin);
  }
  const dx = minion.patrolX - minion.x, dy = minion.patrolY - minion.y;
  const distance = Math.hypot(dx, dy) || 1;
  return { x: dx / distance, y: dy / distance, speed: minion.patrolSpeed };
}
