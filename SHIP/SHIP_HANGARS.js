"use strict";
import { findCatalogItem } from "../SRC/CORE/CATALOG.js";
import { getActiveDroneFormation } from "../DRONE/DRONE_TYPES.js";
import { getPetDamageBonus, getPetLevel, getPetShieldBonus } from "../PET/PET_TYPES.js";

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
  // ✅ Exclusif par hangar : on lit le fit du drone pour CE hangar + CETTE config.
  const drones = user?.drones?.items || [];
  const hangarId = hangar?.id != null ? String(hangar.id) : null;
  const droneFitForHangar = (drone) => {
    if (hangarId && drone?.fitsByHangar?.[hangarId]?.[activeConfig]) return drone.fitsByHangar[hangarId][activeConfig];
    if (drone?.fits?.[activeConfig]) {
      // Legacy : si fitsByHangar absent, fits = global. Mais si fitsByHangar existe
      // pour d'autres hangars, ne pas retomber sur le global (exclusivité).
      const hasPerHangar = drone?.fitsByHangar && typeof drone.fitsByHangar === "object" && Object.keys(drone.fitsByHangar).length > 0;
      if (!hasPerHangar) return drone.fits[activeConfig];
      // Si le hangar courant n'a pas d'entrée, c'est vide (pas le fit d'un autre vaisseau).
      if (hangarId) return { equipment: [], ability: null };
      return drone.fits[activeConfig];
    }
    return drone?.fit || { equipment: [], ability: null };
  };
  const designId = (drone) => {
    const fitForHangar = droneFitForHangar(drone);
    return String(typeof fitForHangar?.ability === "string"
      ? fitForHangar.ability
      : fitForHangar?.ability?.id || fitForHangar?.ability?.name || "").toLowerCase();
  };
  for (const drone of drones) {
    const fitForHangar = droneFitForHangar(drone);
    const levelMultiplier = 1 + Math.max(0, Math.min(5, Number(drone?.level || 1) - 1)) * 0.05;
    const design = designId(drone);
    const laserDesignMultiplier = design.includes("havoc") || design.includes("havok") ? 1.1 : design.includes("spartan") ? 1.01 : 1;
    const shieldDesignMultiplier = design.includes("hercules") ? 1.15 : design.includes("spartan") ? 1.01 : 1;
    for (const itemId of fitForHangar?.equipment || []) {
      const item = itemId ? findCatalogItem(itemId) : null;
      if (item?.module?.type === "laser") baseDamage += Number(item.module.damage || 0) * levelMultiplier * laserDesignMultiplier;
      if (item?.module?.type === "shield") baseShield += Number(item.module.bonusShield || 0) * levelMultiplier * shieldDesignMultiplier;
    }
  }

  // P.E.T : lasers + générateurs (boucliers) + protocoles, exclusif à CE hangar + CETTE config.
  // Bonus de niveau officiels : dégâts +2 % / 2 niveaux, bouclier +2 % / 2 niveaux.
  // Les gears sont utilitaires (pas de stats de combat).
  let bonusPetDamagePct = 0;
  let bonusPetShieldPct = 0;
  let bonusPetHPPct = 0;
  if (user?.pet?.owned === true) {
    const petLevel = getPetLevel(user.pet.exp);
    const petFitForHangar = (() => {
      if (hangarId && user.pet?.fitsByHangar?.[hangarId]?.[activeConfig]) return user.pet.fitsByHangar[hangarId][activeConfig];
      const hasPerHangar = user.pet?.fitsByHangar && typeof user.pet.fitsByHangar === "object" && Object.keys(user.pet.fitsByHangar).length > 0;
      if (!hasPerHangar && user.pet?.fits?.[activeConfig]) return user.pet.fits[activeConfig];
      if (hangarId && hasPerHangar) return { lasers: [], generators: [], gears: [], protocols: [] };
      return user.pet?.fit || { lasers: [], generators: [], gears: [], protocols: [] };
    })();
    const petDamageMult = 1 + getPetDamageBonus(petLevel) / 100;
    const petShieldMult = 1 + getPetShieldBonus(petLevel) / 100;
    for (const itemId of petFitForHangar?.lasers || []) {
      const item = itemId ? findCatalogItem(itemId) : null;
      if (item?.module?.type === "laser") baseDamage += Number(item.module.damage || 0) * petDamageMult;
    }
    for (const itemId of petFitForHangar?.generators || []) {
      const item = itemId ? findCatalogItem(itemId) : null;
      if (item?.module?.type === "shield") baseShield += Number(item.module.bonusShield || 0) * petShieldMult;
    }
    for (const itemId of petFitForHangar?.protocols || []) {
      const item = itemId ? findCatalogItem(itemId) : null;
      const pct = Number(item?.petProtocol?.pct || 0);
      if (!item?.petProtocol || !pct) continue;
      const key = item.petProtocol.key;
      if (key === "damage" || key === "alien") bonusPetDamagePct += pct;
      if (key === "shield") bonusPetShieldPct += pct;
      if (key === "hp") bonusPetHPPct += pct;
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
  let bonusLaserHitPct = 0;
  let bonusExpPct = 0;
  let bonusHonorPct = 0;
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
      if (stat === "laser_hit") bonusLaserHitPct += pct;
      if (stat === "exp") bonusExpPct += pct;
      if (stat === "honor") bonusHonorPct += pct;
    }
  }

  bonusDamagePct += Number(formationEffects.laserDamagePct || 0);
  bonusShieldPct += Number(formationEffects.shieldPct || 0);
  bonusHPPct += Number(formationEffects.hpPct || 0);
  bonusSpeedPct += Number(formationEffects.speedPct || 0);
  // Protocoles P.E.T équipés sur ce hangar / cette config.
  bonusDamagePct += bonusPetDamagePct;
  bonusShieldPct += bonusPetShieldPct;
  bonusHPPct += bonusPetHPPct;
  bonusPenetrationPct += Number(formationEffects.penetrationPct || 0);
  bonusHonorPct += Number(formationEffects.honorPct || 0);
  bonusExpPct += Number(formationEffects.npcXpPct || 0);

  // Bonus d'ensemble des designs : actifs uniquement si tous les drones portent le même design.
  if (drones.length && drones.every(drone => /havoc|havok/.test(designId(drone)))) bonusDamagePct += 10;
  if (drones.length && drones.every(drone => designId(drone).includes("hercules"))) bonusHPPct += 20;
  if (drones.length && drones.every(drone => designId(drone).includes("spartan"))) {
    bonusDamagePct += 10;
    bonusHPPct += 10;
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
    bonusLaserHitPct,     // % de réduction du taux de MISS du joueur
    bonusExpPct,          // % d'XP gagné en plus
    bonusHonorPct,        // % d'honneur gagné en plus
    extras,
    formationEffects,
  };
}
