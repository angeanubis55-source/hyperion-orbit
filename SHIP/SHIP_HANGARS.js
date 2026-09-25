"use strict";
import { findCatalogItem } from "../SRC/CORE/CATALOG.js";
import { getActiveDroneFormation } from "../DRONE/DRONE_TYPES.js";
import { getShipDesignBaseId, getShipPackById } from "./SHIP_PACKS.js";
import { getShipEffectStats } from "./SHIP_BONUSES.js";
import { FACTIONS, normalizeFactionId } from "../SRC/CORE/FACTIONS.js";

/**
 * calcule les bonus à partir d'un hangar + user.inventory.shipModules
 * On gère:
 * - lasers => +damage
 * - speed/shield gens => +speed/+shield
 * - extras => juste liste
 * - ✅ SHIP MODULES (roulette) => bonus % sur stats
 */
export function computeHangarStats(hangar, user, ctx = {}) {
  const activeConfig = Number(hangar?.activeConfig) === 2 ? "2" : "1";

const fit =
  hangar?.fits?.[activeConfig] ||
  hangar?.fit ||
  { lasers: [], gens: [], extras: [], shipMods: [] };

  // Orcus / Orcus Plus : seuls les % des modules roulette équipés sont
  // multipliés (x1.5 / x2, ex : +30% PV -> +45% / +60%). Les designs
  // cosmétiques héritent de leur base. Lasers, générateurs, drones,
  // formations et effets passifs non concernés.
  const hullBaseId = getShipDesignBaseId(hangar?.shipId) || String(hangar?.shipId || "").toLowerCase();
  const hullModuleMult = hullBaseId === "orcus_plus" ? 2 : hullBaseId === "orcus" ? 1.5 : 1;
  
  // ✅ ÉTAPE 1 : calculer les stats de BASE (avant modules %)
  let baseDamage = 0;
  let baseSpeed = 0;
  let baseShield = 0;
  let bonusAbsorb = 0;
  const laserMods = [];
  // Mods des drones pour les bonus par canon (overdrive/vs/instable).
  const droneLaserMods = [];

  // lasers -> damage de base (P.E.T uniquement ignorés sur le vaisseau)
  let mfCount = 0;
  let hpBonusPct = 0;
  for (const itemId of (fit.lasers || [])) {
    if (!itemId) continue;
    const it = findCatalogItem(itemId);
    if (it?.module?.type === "laser" && !it.petOnly) {
      baseDamage += Number(it.module.damage || 0);
      laserMods.push({
        damage: Number(it.module.damage || 0),
        vsMatch: it.module.vsMatch, vsMult: it.module.vsMult,
        overdrive: it.module.overdrive, critPct: it.module.critPct,
        unstable: it.module.unstable, mf: it.module.mf,
      });
      if (it.module.mf) mfCount += 1;
      hpBonusPct += Number(it.module.hpPct || 0);
    }
  }

  // gens -> speed/shield de base (absorption = max monté)
  for (const itemId of (fit.gens || [])) {
    if (!itemId) continue;
    const it = findCatalogItem(itemId);
    if (it?.module?.type === "speed") {
      baseSpeed += Number(it.module.bonusSpeed || 0);
    }
    if (it?.module?.type === "shield" && !it.petOnly) {
      baseShield += Number(it.module.bonusShield || 0);
      bonusAbsorb = Math.max(bonusAbsorb, Number(it.module.absorbPct || 0));
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
      if (item?.petOnly) continue;
      if (item?.module?.type === "laser") {
        const mult = levelMultiplier * laserDesignMultiplier;
        baseDamage += Number(item.module.damage || 0) * mult;
        // Bonus par canon des drones (overdrive / vsMatch / instable) :
        // 1 laser = +bonus, 2 lasers = +2x bonus, 35 lasers = 35x bonus.
        // On stocke le damage déjà scalé pour que le vs/overdrive suive le niveau/design.
        // HP Hyperplasmoid : +0,5 %/canon, vaisseau + drones (officiel cumulé).
        hpBonusPct += Number(item.module.hpPct || 0);
        droneLaserMods.push({
          damage: Number(item.module.damage || 0) * mult,
          baseDamage: Number(item.module.damage || 0),
          mult,
          vsMatch: item.module.vsMatch, vsMult: item.module.vsMult,
          overdrive: Number(item.module.overdrive || 0) * mult,
          unstable: item.module.unstable,
        });
      }
      if (item?.module?.type === "shield") baseShield += Number(item.module.bonusShield || 0) * levelMultiplier * shieldDesignMultiplier;
    }
  }

  // REX (P.E.T) : AUCUNE stat ne remonte au vaisseau.
  // Tout ce qui est équipé sur le REX (lasers, générateurs, protocoles, gears)
  // reste sur le REX pour ses propres stats (voir petVolleyDamage côté moteur).
  // Vaisseau = canons/générateurs du vaisseau + drones uniquement.

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
  let bonusRocketHitPct = 0;
  let bonusEvasionPct = 0;
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

    // CUMULER les % de chaque stat (x1.5 sur Orcus, x2 sur Orcus Plus).
    for (const bonus of (mod.bonuses || [])) {
      const stat = bonus.stat;
      const pct = Number(bonus.pct || 0) * hullModuleMult;

      if (stat === "hp") bonusHPPct += pct;
      if (stat === "shield") bonusShieldPct += pct;
      if (stat === "damage") bonusDamagePct += pct;
      if (stat === "speed") bonusSpeedPct += pct;
      if (stat === "penetration") bonusPenetrationPct += pct;
      if (stat === "laser_hit") bonusLaserHitPct += pct;
      if (stat === "rocket_hit") bonusRocketHitPct += pct;
      if (stat === "evasion") bonusEvasionPct += pct;
      if (stat === "exp") bonusExpPct += pct;
      if (stat === "honor") bonusHonorPct += pct;
    }
  }

  bonusDamagePct += Number(formationEffects.laserDamagePct || 0);
  bonusShieldPct += Number(formationEffects.shieldPct || 0);
  bonusHPPct += Number(formationEffects.hpPct || 0);
  bonusSpeedPct += Number(formationEffects.speedPct || 0);
  // LF-4 Hyperplasmoid : +0,5 % de coque max par canon monté.
  bonusHPPct += hpBonusPct;
  // LF-5 Mortifier : dégâts globaux selon le nombre monté
  // (nerfé : 3:+1 %, 4:+2 %, 5:+3 %, 8:+5 %, 12:+6 %, 14+:+7 %).
  if (mfCount >= 14) bonusDamagePct += 7;
  else if (mfCount >= 12) bonusDamagePct += 6;
  else if (mfCount >= 8) bonusDamagePct += 5;
  else if (mfCount >= 5) bonusDamagePct += 3;
  else if (mfCount >= 4) bonusDamagePct += 2;
  else if (mfCount >= 3) bonusDamagePct += 1;
  bonusPenetrationPct += Number(formationEffects.penetrationPct || 0);
  bonusHonorPct += Number(formationEffects.honorPct || 0);
  bonusExpPct += Number(formationEffects.npcXpPct || 0);

  // ✅ ÉTAPE 2bis : effet passif du vaisseau / design actif (boutique).
  // h.shipId porte déjà le design actif (setHangarDesign l'y écrit).
  const shipEffect = getShipEffectStats(hangar?.shipId);
  bonusDamagePct += Number(shipEffect.damagePct || 0);
  bonusShieldPct += Number(shipEffect.shieldPct || 0);
  bonusHPPct += Number(shipEffect.hpPct || 0);
  bonusExpPct += Number(shipEffect.expPct || 0);
  bonusHonorPct += Number(shipEffect.honorPct || 0);
  bonusPenetrationPct += Number(shipEffect.penPct || 0);

  // ✅ Leonov : sur les cartes x-1 à x-4 de SA firme (secteur MMO=1,
  // EIC=2, VRU=3) : +100 % dégâts / bouclier / PV + XP x2 + vitesse x2
  // (roquettes x2 et XP x2 drones/P.E.T. gérés dans ORBIT_ENGINE).
  // Bonus recalculé à chaque chargement de map / changement de config
  // (le moteur passe ctx.mapId).
  let leonovHome = false;
  if (String(hangar?.shipId || "").toLowerCase() === "leonov") {
    const sector = FACTIONS[normalizeFactionId(user?.faction)]?.sector;
    const mapId = String(ctx?.mapId || "").trim().toLowerCase();
    if (sector && new RegExp(`^${sector}-[1234]$`).test(mapId)) {
      leonovHome = true;
      bonusDamagePct += 150;
      bonusShieldPct += 150;
      bonusHPPct += 150;
      bonusExpPct += 100;
    }
  }

  // Bonus d'ensemble des designs : actifs uniquement si tous les drones portent le même design.
  if (drones.length && drones.every(drone => /havoc|havok/.test(designId(drone)))) bonusDamagePct += 10;
  if (drones.length && drones.every(drone => designId(drone).includes("hercules"))) bonusHPPct += 20;
  if (drones.length && drones.every(drone => designId(drone).includes("spartan"))) {
    bonusDamagePct += 10;
    bonusHPPct += 10;
  }

  // ✅ ÉTAPE 3 : calculer les valeurs finales
  const totalLaserDamage = baseDamage * (1 + bonusDamagePct / 100);
  // The engine adds the hull speed: include its percentage bonus here too.
  const hullSpeed = Number(getShipPackById(hangar?.shipId)?.speed || 0);
  const bonusSpeed = baseSpeed * (1 + bonusSpeedPct / 100) + hullSpeed * bonusSpeedPct / 100
    + Number(shipEffect.speedFlat || 0);
  // Police : bouclier x500 les valeurs de chaque générateur équipé.
  const isPoliceHull = String(hangar?.shipId || "").toLowerCase() === "police";
  const bonusShield = isPoliceHull
    ? baseShield * 500 * Math.max(0, 1 + bonusShieldPct / 100)
    : baseShield * Math.max(0, 1 + bonusShieldPct / 100);

  return { 
    totalLaserDamage, 
    bonusSpeed, 
    bonusShield, 
    bonusAbsorb,          // max des générateurs montés (0 = défaut 80 % moteur)
    bonusFlatHP: Number(shipEffect.flatHp || 0), // PV fixes (ex : Yamato Ronin +40000)
    speedMult: leonovHome ? 1.2 : 1, // Leonov home : vitesse x1.2
    leonovHome,                     // Leonov home : roquettes x2, XP x2 drones/P.E.T. (moteur)
    laserMods,            // détail canons du vaisseau (bonus vsMatch appliqués au tir)
    droneLaserMods,       // détail canons des drones (overdrive/vs/instable x nombre équipé)
    bonusHPPct,           // % à appliquer sur le HP du ship
    bonusPenetrationPct,  // % absolu de pénétration
    bonusLaserHitPct,     // % de réduction du taux de MISS du joueur
    bonusRocketHitPct,    // % de réduction du taux de MISS des roquettes
    bonusEvasionPct,      // % de chance d'esquiver totalement un coup reçu
    bonusExpPct,          // % d'XP gagné en plus
    bonusHonorPct,        // % d'honneur gagné en plus
    extras,
    formationEffects,
  };
}
