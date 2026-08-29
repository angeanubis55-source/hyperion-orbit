"use strict";

export function createProjectile(options = {}) {
  return {
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    r: 6,
    life: 1,
    dmg: 0,
    miss: false,
    homing: false,
    ...options,
  };
}

export function addProjectile(collection, options) {
  const projectile = createProjectile(options);
  collection.push(projectile);
  return projectile;
}

export function advanceProjectile(projectile, deltaTime) {
  const oldX = projectile.x;
  const oldY = projectile.y;
  projectile.x += projectile.vx * deltaTime;
  projectile.y += projectile.vy * deltaTime;
  projectile.life -= deltaTime;
  return { oldX, oldY, expired: projectile.life <= 0 };
}
