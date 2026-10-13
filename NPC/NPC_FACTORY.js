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
    // La vitesse est une statistique de gameplay officielle : ne pas lui
    // appliquer de variation aléatoire à chaque apparition.
    speed: Math.floor(config.speed ?? 320), dr: config.dr ?? 0,
    touchDmg: config.touchDmg ?? (14 + wave * 0.25), value: config.value ?? 0,
    canShoot: config.canShoot !== false, shootRange: config.shootRange ?? 540,
    shootCd: between(random, 0.2, 0.7), shootRate: config.shootRate ?? 1,
    bulletSpeed: config.bulletSpeed ?? 500, bulletDmg: config.bulletDmg ?? 6,
    bulletSpread: config.bulletSpread ?? 0.05, burst: config.burst ?? 1,
    bulletSprite: config.bulletSprite || null, bulletScale: config.bulletScale ?? 1.5,
    // ✅ tir façon joueur : clé de munition (x3...), faux lasers visuels, vitesse calée sur le joueur.
    ammoKey: config.ammoKey || "x1",
    fauxLasers: Math.max(0, Math.floor(Number(config.fauxLasers) || 0)),
    altShot: config.altShot === true, _altShot: false,
    matchPlayerSpeed: config.matchPlayerSpeed === true,
    // ✅ décalage appliqué à la vitesse joueur (ex. -50 pour l'icy).
    playerSpeedDelta: Number.isFinite(Number(config.playerSpeedDelta)) ? Number(config.playerSpeedDelta) : 0,
    // ✅ toujours en mouvement (aucun mode hold/pause en combat).
    alwaysMove: config.alwaysMove === true,
    // ✅ drones façon joueur (formation + design) : visuels + bonus dégâts du design.
    droneCfg: config.drones ? {
      count: Math.max(0, Math.min(12, Math.floor(Number(config.drones.count) || 0))),
      formation: String(config.drones.formation || "standard"),
      design: String(config.drones.design || ""),
      level: Math.max(1, Math.min(6, Math.floor(Number(config.drones.level) || 6))),
    } : null,
    // ✅ mécanique Cubikon (1-6 + vert) : type de minions + quotas (défaut : 20 Protegit).
    // despawnOnReset / fleeOnDeath : défaut true (classique), false pour les icy verts (ils restent combattre).
    cubikonMinions: config.cubikonMinions ? {
      type: String(config.cubikonMinions.type || "npc_Protegit"),
      max: Math.max(1, Math.floor(Number(config.cubikonMinions.max) || 20)),
      refill: Math.max(1, Math.floor(Number(config.cubikonMinions.refill) || 20)),
      despawnOnReset: config.cubikonMinions.despawnOnReset !== false,
      fleeOnDeath: config.cubikonMinions.fleeOnDeath !== false,
    } : null,
    bulletR: config.bulletR ?? 7, orbit: config.orbit ?? 0.45,
    angle: (type === "npc_Cubikon" || !!config.cubikonMinions) ? 0 : between(random, 0, Math.PI * 2), freezeT: 0,
    passiveNative: !!config.passiveNative, _provoked: false,
    isHealer: !!config.isHealer,
    healPulseCd: Number(config.healPulseInterval ?? 2), healPulseT: 0,
    _attackedPlayerRecently: false, _onKill: cloneConfig(config.onKill),
  };
  entity.hp = entity.hpMax;
  entity.sh = entity.shMax;
  if (type === "npc_Cubikon" || config.cubikonMinions) {
    Object.assign(entity, {
      _spawnedOnce: false, _sinceHit: 999, _resetting: false, _minionIds: [],
      _animPhase: null, _openDelayT: 0, _holdLastT: 0, spriteDir: 1,
      _pendingSpawn: 0, spriteFps: 20,
    });
  }
  return entity;
}
