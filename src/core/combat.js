"use strict";

import { clamp } from "./collision.js";

export function bulletLifeForRange(range, speed) {
  return clamp(range / Math.max(120, speed) + 0.35, 0.6, 5);
}

export function damageEnemyLayers(target, damage, options = {}) {
  const empty = { total: 0, sh: 0, hp: 0, bypass: 0, isCrit: false, rawDamage: 0 };
  if (!target || target.hp <= 0) return empty;

  const random = options.random || Math.random;
  const variance = Number(options.variance ?? 0.05);
  const critChance = Number(options.critChance ?? 0.05);
  const critMultiplier = Number(options.critMultiplier ?? 1.5);
  const shieldPenetration = clamp(Number(options.shieldPenetration || 0), 0, 1);
  const variedDamage = Math.max(0, Number(damage) || 0) * (1 - variance + random() * variance * 2);
  const isCrit = random() < critChance;
  const rawDamage = variedDamage * (isCrit ? critMultiplier : 1);
  let remaining = rawDamage * (1 - clamp(Number(target.dr || 0), 0, 1));
  let shieldDamage = 0;
  let hpDamage = 0;
  let bypassDamage = 0;

  if ((target.sh || 0) > 0 && shieldPenetration > 0) {
    const bypass = remaining * shieldPenetration;
    remaining -= bypass;
    bypassDamage = Math.min(target.hp, bypass);
    target.hp -= bypassDamage;
    hpDamage += bypassDamage;
  }

  if ((target.sh || 0) > 0 && remaining > 0) {
    shieldDamage = Math.min(target.sh, remaining);
    target.sh -= shieldDamage;
    remaining -= shieldDamage;
  }

  if (remaining > 0 && target.hp > 0) {
    const applied = Math.min(target.hp, remaining);
    target.hp -= applied;
    hpDamage += applied;
  }

  return {
    total: shieldDamage + hpDamage,
    sh: shieldDamage,
    hp: hpDamage,
    bypass: bypassDamage,
    isCrit,
    rawDamage,
  };
}

export function drainShield(target, amount) {
  if (!target || target.hp <= 0) return 0;
  const requested = Math.max(0, Number(amount) || 0);
  const drained = Math.min(Math.max(0, Number(target.sh) || 0), requested);
  target.sh -= drained;
  return drained;
}

export function damagePlayerLayers(player, amount, shieldAbsorb = 0.8) {
  const reduced = Math.max(0, Number(amount) || 0) * (1 - clamp(Number(player.dr || 0), 0, 1));
  const absorbed = Math.min(Math.max(0, Number(player.sh) || 0), reduced * clamp(shieldAbsorb, 0, 1));
  const hpDamage = reduced - absorbed;
  player.sh -= absorbed;
  player.hp = Math.max(0, player.hp - hpDamage);
  return { total: absorbed + hpDamage, sh: absorbed, hp: hpDamage };
}
