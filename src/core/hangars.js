"use strict";
import { findCatalogItem } from "./catalog.js";
import { getActiveDroneFormation } from "../data/drones.js";

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

  // Les équipements des drones participent aux statistiques du vaisseau.
  // Chaque niveau après le premier améliore de 5 % uniquement l'objet porté.
  for (const drone of user?.drones?.items || []) {
    const levelMultiplier = 1 + Math.max(0, Math.min(4, Number(drone?.level || 1) - 1)) * 0.05;
    for (const itemId of drone?.fit?.equipment || []) {
      const item = itemId ? findCatalogItem(itemId) : null;
      if (item?.module?.type === "laser") baseDamage += Number(item.module.damage || 0) * levelMultiplier;
      if (item?.module?.type === "shield") baseShield += Number(item.module.bonusShield || 0) * levelMultiplier;
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
  const formationEffects = getActiveDroneFormation(user).effects || {};

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

  bonusDamagePct += Number(formationEffects.laserDamagePct || 0);
  bonusShieldPct += Number(formationEffects.shieldPct || 0);
  bonusHPPct += Number(formationEffects.hpPct || 0);
  bonusSpeedPct += Number(formationEffects.speedPct || 0);
  bonusPenetrationPct += Number(formationEffects.penetrationPct || 0);

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
    extras,
    formationEffects,
  };
}
