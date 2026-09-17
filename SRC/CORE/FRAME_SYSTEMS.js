"use strict";

// Ralenti du joueur (explosion Kamikaze, ...) : même échelle que les NPC
// (rocketSlowT en secondes, rocketSlowPct en %). 1 = vitesse normale.
// Voyage (Citadel) : x2 temporaire pendant travelT.
export function playerSlowMult(player) {
  let mult = 1;
  if (player && (Number(player.rocketSlowT) || 0) > 0) {
    const pct = Math.min(95, Math.max(0, Number(player.rocketSlowPct) || 0));
    mult *= Math.max(0.05, 1 - pct / 100);
  }
  if (player && (Number(player.travelT) || 0) > 0) mult *= 2;
  // Représailles (Berserker, officiel) : -5 % de vitesse pendant l'effet.
  if (player && (Number(player.rvgT) || 0) > 0) mult *= 0.95;
  return mult;
}

export function updatePlayerVelocity(player, direction, dt, options = {}) {
  const maxSpeed = Math.max(10, Number(player.baseSpeed || 0)) * playerSlowMult(player);
  if (!player.dead && (direction.x || direction.y)) {
    const length = Math.hypot(direction.x, direction.y) || 1;
    player.vx = direction.x / length * maxSpeed;
    player.vy = direction.y / length * maxSpeed;
  } else {
    player.vx = 0;
    player.vy = 0;
  }
  const speed = Math.hypot(player.vx, player.vy);
  if (speed > maxSpeed) {
    player.vx *= maxSpeed / speed;
    player.vy *= maxSpeed / speed;
  }
}

export function advancePlayerToTarget(player, target, dt, options = {}) {
  if (!player || player.dead) return false;
  const stepX = Number(player.vx || 0) * dt;
  const stepY = Number(player.vy || 0) * dt;

  if (target?.active) {
    const dx = Number(target.x) - Number(player.x);
    const dy = Number(target.y) - Number(player.y);
    const distance = Math.hypot(dx, dy);
    const snapDistance = Math.max(0.01, Number(options.snapDistance ?? 0.5));
    const forwardStep = distance > 0
      ? (stepX * dx + stepY * dy) / distance
      : 0;

    if (distance <= snapDistance || (forwardStep > 0 && forwardStep >= distance)) {
      player.x = Number(target.x);
      player.y = Number(target.y);
      player.vx = 0;
      player.vy = 0;
      target.active = false;
      return true;
    }
  }

  player.x = Number(player.x) + stepX;
  player.y = Number(player.y) + stepY;
  return false;
}

export function tickLifetimeItems(items, dt, getLifetime) {
  for (let index = items.length - 1; index >= 0; index--) {
    const item = items[index];
    item.t = Number(item.t || 0) + dt;
    if (item.t >= getLifetime(item)) items.splice(index, 1);
  }
}

export function tickFloatingTexts(items, dt) {
  for (let index = items.length - 1; index >= 0; index--) {
    const item = items[index];
    item.t += dt;
    item.x += (item.vx || 0) * dt;
    item.y += (item.vy || 0) * dt;
    item.vx *= Math.pow(0.9, dt * 60);
    item.vy *= Math.pow(0.92, dt * 60);
    if (item.t >= item.life) items.splice(index, 1);
  }
}

export function attractPickups(items, player, dt, onCollect) {
  for (let index = items.length - 1; index >= 0; index--) {
    const item = items[index];
    item.t += dt;
    if (player.dead) continue;
    const dx = player.x - item.x;
    const dy = player.y - item.y;
    const distance = Math.hypot(dx, dy) || 1;
    const speed = 2200 + distance * 2.8;
    item.x += dx / distance * speed * dt;
    item.y += dy / distance * speed * dt;
    if (distance < 28) {
      items.splice(index, 1);
      onCollect(item);
    }
  }
}
