"use strict";

import { clamp } from "../SRC/CORE/COLLISION.js";

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
  // Affaiblissement (Diminisher, officiel) : +50 % de dégâts AU bouclier —
  // le bouclier fond 1,5x plus vite, la coque ne prend rien de plus.
  // Si le bouclier casse, le surplus part en coque comme d'habitude.
  const weakenShields = clamp(Number(options.weakenShields || 0), 0, 10);
  // Distribution des dégâts (officiel, par entité : générateurs côté joueur,
  // "shield spread" côté NPC, défaut 80/20) : part au bouclier, reste en
  // coque direct. Bouclier à 0 : 100 % en coque.
  const shieldSpread = clamp(Number(options.shieldSpread ?? 0.8), 0, 1);
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
    shieldDamage = Math.min(target.sh, remaining * shieldSpread);
    target.sh -= shieldDamage;
    remaining -= shieldDamage;
    if (weakenShields > 0 && shieldDamage > 0 && (target.sh || 0) > 0) {
      const extra = Math.min(target.sh, shieldDamage * weakenShields);
      target.sh -= extra;
      shieldDamage += extra;
    }
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

export function damagePlayerLayers(player, amount, shieldAbsorb = 0.8, shieldPenetration = 0, shieldTough = 0) {
  if (!player || player.invincibleT > 0) return { total: 0, sh: 0, hp: 0, bypass: 0 };
  const reduced = Math.max(0, Number(amount) || 0) * (1 - clamp(Number(player.dr || 0), 0, 1));
  let remaining = reduced;
  let bypassDamage = 0;
  const pen = clamp(Number(shieldPenetration || 0), 0, 1);
  // Pénétration : part des dégâts qui traverse directement en coque en
  // ignorant le bouclier (0 = tout passe par le bouclier puis la coque).
  if ((player.sh || 0) > 0 && pen > 0 && remaining > 0) {
    const bypass = remaining * pen;
    remaining -= bypass;
    bypassDamage = Math.min(player.hp, bypass);
    player.hp = Math.max(0, player.hp - bypassDamage);
  }
  // Mécanique bouclier (arbre pilote) : la part absorbée est réduite de
  // shieldTough (0-0.9), la différence est annulée par le bouclier renforcé.
  const tough = clamp(Number(shieldTough || 0), 0, 0.9);
  const absorbedRaw = Math.min(Math.max(0, Number(player.sh) || 0), remaining * clamp(shieldAbsorb, 0, 1));
  const negated = absorbedRaw * tough;
  const absorbed = absorbedRaw - negated;
  const hpDamage = remaining - absorbed - negated;
  player.sh -= absorbed;
  player.hp = Math.max(0, player.hp - hpDamage);
  return { total: absorbed + hpDamage + bypassDamage, sh: absorbed, hp: hpDamage + bypassDamage, bypass: bypassDamage };
}
