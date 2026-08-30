"use strict";

export function updatePlayerVelocity(player, direction, dt, options = {}) {
  const maxSpeed = Math.max(10, Number(player.baseSpeed || 0));
  if (!player.dead && (direction.x || direction.y)) {
    const length = Math.hypot(direction.x, direction.y) || 1;
    const blend = 1 - Math.exp(-Number(options.moveResponse || 6.5) * dt);
    player.vx += (direction.x / length * maxSpeed - player.vx) * blend;
    player.vy += (direction.y / length * maxSpeed - player.vy) * blend;
  } else {
    const blend = 1 - Math.exp(-Number(options.stopResponse || 7.5) * dt);
    player.vx += (0 - player.vx) * blend;
    player.vy += (0 - player.vy) * blend;
  }
  const speed = Math.hypot(player.vx, player.vy);
  if (speed > maxSpeed) {
    player.vx *= maxSpeed / speed;
    player.vy *= maxSpeed / speed;
  }
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
