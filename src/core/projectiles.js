"use strict";

const projectilePools = new WeakMap();
const MAX_POOL_SIZE = 1_024;

function poolFor(collection) {
  let pool = projectilePools.get(collection);
  if (!pool) {
    pool = [];
    projectilePools.set(collection, pool);
  }
  return pool;
}

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
  const projectile = poolFor(collection).pop() || {};
  for (const key of Object.keys(projectile)) delete projectile[key];
  Object.assign(projectile, createProjectile(options));
  collection.push(projectile);
  return projectile;
}

export function removeProjectile(collection, index) {
  if (index < 0 || index >= collection.length) return null;
  const [projectile] = collection.splice(index, 1);
  const pool = poolFor(collection);
  if (projectile && pool.length < MAX_POOL_SIZE) pool.push(projectile);
  return projectile || null;
}

/**
 * Fait progresser un projectile d'un pas temporel et renvoie simplement si il
 * est expiré. La position précédente est écrite dans `_oldX`/`_oldY` du
 * projectile lui-même, ce qui évite d'allouer un objet à chaque frame par
 * projectile (et donc des micro-freezes liés au ramasse-miettes en combat).
 */
export function advanceProjectile(projectile, deltaTime) {
  projectile._oldX = projectile.x;
  projectile._oldY = projectile.y;
  projectile.x += projectile.vx * deltaTime;
  projectile.y += projectile.vy * deltaTime;
  projectile.life -= deltaTime;
  return projectile.life <= 0;
}
