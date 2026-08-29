"use strict";

function cloneConfig(value) {
  if (value == null) return null;
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

const between = (random, min, max) => min + random() * (max - min);

export function createNpcEntity({ id, type, x, y, config, wave = 1, random = Math.random }) {
  if (!config) return null;
  const entity = {
    id, type, name: config.name || type,
    spritePlay: !!config.playSprite, spriteFps: Number(config.spriteSpeed ?? 12), spriteAcc: 0, spriteIdx: 0,
    empT: 0, x, y, vx: 0, vy: 0, wobble: between(random, 0, 999), r: config.r ?? 18,
    hpMax: Math.floor(config.hp ?? 50), hp: 0,
    shMax: Math.floor(config.shield ?? 0), sh: 0,
    speed: Math.floor((config.speed ?? 320) * (0.95 + random() * 0.1)), dr: config.dr ?? 0,
    touchDmg: config.touchDmg ?? (14 + wave * 0.25), value: config.value ?? 0,
    canShoot: config.canShoot !== false, shootRange: config.shootRange ?? 540,
    shootCd: between(random, 0.2, 0.7), shootRate: config.shootRate ?? 1,
    bulletSpeed: config.bulletSpeed ?? 500, bulletDmg: config.bulletDmg ?? 6,
    bulletSpread: config.bulletSpread ?? 0.05, burst: config.burst ?? 1,
    bulletSprite: config.bulletSprite || null, bulletScale: config.bulletScale ?? 1.5,
    bulletR: config.bulletR ?? 7, orbit: config.orbit ?? 0.45,
    angle: type === "npc_Cubikon" ? 0 : between(random, 0, Math.PI * 2), freezeT: 0,
    passiveNative: !!config.passiveNative, _provoked: false,
    _attackedPlayerRecently: false, _onKill: cloneConfig(config.onKill),
  };
  entity.hp = entity.hpMax;
  entity.sh = entity.shMax;
  if (type === "npc_Cubikon") {
    Object.assign(entity, {
      _spawnedOnce: false, _sinceHit: 999, _resetting: false, _minionIds: [],
      _animPhase: null, _openDelayT: 0, _holdLastT: 0, spriteDir: 1,
      _pendingSpawn: 0, spriteFps: 20,
    });
  }
  return entity;
}
