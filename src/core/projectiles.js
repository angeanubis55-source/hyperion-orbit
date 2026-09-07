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

export function launcherRocketLaunchAngle(forwardAngle, arcDirection, spread = 0) {
  const side = Number(arcDirection) < 0 ? -1 : 1;
  // Départ nettement latéral. Le décalage propre à chaque roquette est
  // amplifié pour que les cinq directions soient clairement distinguables.
  const sideOffset = Math.min(
    83 * Math.PI / 180,
    Math.max(48 * Math.PI / 180, 73 * Math.PI / 180 + side * (Number(spread) || 0) * 2.5),
  );
  return (Number(forwardAngle) || 0) + side * sideOffset;
}

export function blendVelocityDirection(fromX, fromY, toX, toY, progress, speed) {
  const amount = Math.max(0, Math.min(1, Number(progress) || 0));
  const fromLength = Math.hypot(fromX, fromY) || 1;
  const toLength = Math.hypot(toX, toY) || 1;
  // Smoothstep donne une sortie et une arrivée sans cassure visible.
  const smooth = amount * amount * (3 - 2 * amount);
  const x = fromX / fromLength * (1 - smooth) + toX / toLength * smooth;
  const y = fromY / fromLength * (1 - smooth) + toY / toLength * smooth;
  const length = Math.hypot(x, y) || 1;
  const velocity = Math.max(1, Number(speed) || 1);
  return { vx: x / length * velocity, vy: y / length * velocity };
}

/**
 * Conserve l'arc d'une roquette de lanceur pendant le vol, puis réduit sa
 * composante latérale avec une courbe continue à l'approche de la hitbox.
 * Elle rejoint ainsi la cible sans cassure ni orbite finale.
 */
export function guideLauncherRocketVelocity({
  dx,
  dy,
  speed,
  lateralKick = 0,
  hitRadius = 0,
  finalApproachDistance = null,
} = {}) {
  const distance = Math.hypot(Number(dx) || 0, Number(dy) || 0) || 1;
  const velocity = Math.max(1, Number(speed) || 1);
  const nx = (Number(dx) || 0) / distance;
  const ny = (Number(dy) || 0) / distance;
  const kick = Number(lateralKick) || 0;
  const captureDistance = Math.max(
    500,
    velocity * 0.45,
    Math.max(0, Number(hitRadius) || 0) * 8,
    Number(finalApproachDistance) || 0,
  );
  const radius = Math.max(0, Number(hitRadius) || 0);
  // Smoothstep : la composante latérale commence à diminuer sans cassure,
  // puis atteint naturellement zéro sur le bord de la cible.
  const progress = Math.max(0, Math.min(1, (distance - radius) / Math.max(1, captureDistance - radius)));
  const smooth = progress * progress * (3 - 2 * progress);
  const softenedKick = kick * smooth * smooth;
  const rawX = nx * velocity - ny * softenedKick;
  const rawY = ny * velocity + nx * softenedKick;
  const rawLength = Math.hypot(rawX, rawY) || 1;
  return {
    vx: rawX / rawLength * velocity,
    vy: rawY / rawLength * velocity,
  };
}
