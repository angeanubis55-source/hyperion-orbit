"use strict";

export function protegitPatrol(minion, master, world, dt, random = Math.random) {
  minion.patrolTime = Math.max(0, Number(minion.patrolTime) || 0) - dt;
  const reached = minion.patrolX != null && Math.hypot(minion.patrolX - minion.x, minion.patrolY - minion.y) < 60;
  if (minion.patrolTime <= 0 || minion.patrolX == null || reached) {
    const angle = random() * Math.PI * 2;
    const radius = 180 + random() * 520;
    minion.patrolX = Math.max(80, Math.min(world.w - 80, master.x + Math.cos(angle) * radius));
    minion.patrolY = Math.max(80, Math.min(world.h - 80, master.y + Math.sin(angle) * radius));
    minion.patrolTime = 0.6 + random() * 0.8;
    minion.patrolSpeed = 0.85 + random() * 0.15;
  }
  const dx = minion.patrolX - minion.x, dy = minion.patrolY - minion.y;
  const distance = Math.hypot(dx, dy) || 1;
  return { x: dx / distance, y: dy / distance, speed: minion.patrolSpeed };
}
