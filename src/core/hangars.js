"use strict";
import { findCatalogItem } from "./catalog.js";

/**
 * calcule les bonus à partir d'un hangar + user.inventory.shipModules
 * On gère:
 * - lasers => +damage
 * - speed/shield gens => +speed/+shield
 * - extras => juste liste
 * - ✅ SHIP MODULES (roulette) => bonus % sur stats
 */
export function computeHangarStats(hangar, user) {
  const activeConfig = Number(hangar?.activeConfig) === 2 ? "2" : "1";

const fit =
  hangar?.fits?.[activeConfig] ||
  hangar?.fit ||
  { lasers: [], gens: [], extras: [], shipMods: [] };
  
  // ✅ ÉTAPE 1 : calculer les stats de BASE (avant modules %)
  let baseDamage = 0;
  let baseSpeed = 0;
  let baseShield = 0;

  // lasers -> damage de base
  for (const itemId of (fit.lasers || [])) {
    if (!itemId) continue;
    const it = findCatalogItem(itemId);
    if (it?.module?.type === "laser") {
      baseDamage += Number(it.module.damage || 0);
    }
  }

  // gens -> speed/shield de base
  for (const itemId of (fit.gens || [])) {
    if (!itemId) continue;
    const it = findCatalogItem(itemId);
    if (it?.module?.type === "speed") {
      baseSpeed += Number(it.module.bonusSpeed || 0);
    }
    if (it?.module?.type === "shield") {
      baseShield += Number(it.module.bonusShield || 0);
    }
  }

  // extras
  const extras = [];
  for (const itemId of (fit.extras || [])) {
    if (!itemId) continue;
    const it = findCatalogItem(itemId);
    if (it?.module?.type === "extra") {
      extras.push(it.module.key || itemId);
    }
  }

  // ✅ ÉTAPE 2 : appliquer les modules roulette (bonus en %)
  let bonusDamagePct = 0;
  let bonusSpeedPct = 0;
  let bonusShieldPct = 0;
  let bonusHPPct = 0;
  let bonusPenetrationPct = 0;

  const shipModules = Array.isArray(user?.inventory?.shipModules) 
    ? user.inventory.shipModules 
    : [];

  const equippedModIds = (fit.shipMods || []).filter(Boolean);

  for (const modId of equippedModIds) {
    if (!modId) continue;
    const mod = shipModules.find(m => m?.id === modId);
    if (!mod) continue;

    // CUMULER les % de chaque stat
    for (const bonus of (mod.bonuses || [])) {
      const stat = bonus.stat;
      const pct = Number(bonus.pct || 0);

      if (stat === "hp") bonusHPPct += pct;
      if (stat === "shield") bonusShieldPct += pct;
      if (stat === "damage") bonusDamagePct += pct;
      if (stat === "speed") bonusSpeedPct += pct;
      if (stat === "penetration") bonusPenetrationPct += pct;
    }
  }

  // ✅ ÉTAPE 3 : calculer les valeurs finales
  const totalLaserDamage = baseDamage * (1 + bonusDamagePct / 100);
  const bonusSpeed = baseSpeed * (1 + bonusSpeedPct / 100);
  const bonusShield = baseShield * (1 + bonusShieldPct / 100);

  return { 
    totalLaserDamage, 
    bonusSpeed, 
    bonusShield, 
    bonusHPPct,           // % à appliquer sur le HP du ship
    bonusPenetrationPct,  // % absolu de pénétration
    extras 
  };
}