// SRC/DATA/SHIP_EXTRAS.js — Extras CPU du vaisseau (emplacements « extras »).
// Pur (aucun DOM) : importable côté client et côté serveur.
// Chaque extra a une clé d'effet (`key`) et un groupe (`group`) : un seul
// extra par groupe peut être équipé sur un même vaisseau (les deux CPU de
// réparation partagent le groupe « repair »).

export const SHIP_EXTRA_DEFS = Object.freeze({
  extra_cargo_cpu: Object.freeze({ key: "cargo2x", group: "cargo" }),
  extra_fuel_cpu: Object.freeze({ key: "petfuel", group: "petfuel" }),
  extra_radar_cpu: Object.freeze({ key: "radar", group: "radar" }),
  extra_double_rocket_cpu: Object.freeze({ key: "rocket2", group: "rocket2" }),
  extra_repair_cpu_02: Object.freeze({ key: "repair2", group: "repair" }),
  extra_repair_cpu_01: Object.freeze({ key: "repair1", group: "repair" }),
  extra_aim_cpu_01: Object.freeze({ key: "aim1", group: "aim" }),
  extra_aim_cpu_02: Object.freeze({ key: "aim2", group: "aim" }),
  // CPU Emplacement : +N emplacements d'extras, plus celui qu'il occupe.
  extra_slot_cpu_01: Object.freeze({ key: "slot1", group: "slot", slots: 1 }),
  extra_slot_cpu_02: Object.freeze({ key: "slot2", group: "slot", slots: 2 }),
  extra_slot_cpu_03: Object.freeze({ key: "slot3", group: "slot", slots: 3 }),
  extra_slot_cpu_04: Object.freeze({ key: "slot4", group: "slot", slots: 4 }),
  extra_shield_cpu: Object.freeze({ key: "shieldregen", group: "shieldregen" }),
  // Canon à particules : tir aléatoire (rayon thermique / électrique /
  // corrosif au hasard), 50 000 dégâts à la cible.
  extra_particle_cannon: Object.freeze({ key: "particle", group: "particle" }),
});

// Réglages des effets.
export const EXTRA_RADAR_BONUS = 500;          // portée radar / vision NPC
export const EXTRA_PET_FUEL_THRESHOLD = 1000;  // achat auto sous ce seuil
export const EXTRA_PET_FUEL_BUY = 1000;        // quantité achetée
export const EXTRA_REPAIR_SEC = Object.freeze({ repair2: 2, repair1: 1 });
// CPU Bouclier : régénération du bouclier max par seconde, en toutes circonstances.
export const EXTRA_SHIELD_REGEN_PCT = 0.2;
// Canon à particules : dégâts par tir, chance de se déclencher à chaque tir
// laser, cadence maximale acceptée par le serveur (réserve + recharge/s).
export const RAYGUN_DAMAGE = 50000;
// Variance des dégâts : ±5 % (comme les lasers).
export const RAYGUN_VARIANCE = 0.05;
export const RAYGUN_PROC_CHANCE = 0.25;
export const RAYGUN_SERVER_CAP = 3;
export const RAYGUN_SERVER_PER_SEC = 1.5;
export const RAYGUN_ABILITY = "ability_extra_raygun";
// CPU Visée : part des MISS évités (lasers + roquettes du vaisseau).
export const EXTRA_AIM_MISS_CUT = Object.freeze({ aim1: 0.25, aim2: 0.5 });

// Canons à particules : emplacement dédié « particle » (1 par vaisseau),
// chacun tire SON rayon (plus de tirage au hasard).
export const PARTICLE_SLOTS = 1;
export const PARTICLE_CANNON_DEFS = Object.freeze({
  particle_cannon_thermal: Object.freeze({ shot: "thermal", damage: 16571 }),
  particle_cannon_electro: Object.freeze({ shot: "electro", damage: 76514 }),
  particle_cannon_corrosive: Object.freeze({ shot: "corrosive", damage: 32406 }),
});
export function getParticleCannonDef(itemId) {
  return PARTICLE_CANNON_DEFS[String(itemId || "")] || null;
}
// Dégâts de base d'un tir pour une liste d'emplacements « particle »
// (ancien CPU en extra : RAYGUN_DAMAGE).
export function particleCannonDamage(particleSlots) {
  for (const id of Array.isArray(particleSlots) ? particleSlots : []) {
    const def = getParticleCannonDef(id);
    if (def) return def.damage;
  }
  return RAYGUN_DAMAGE;
}

export function getShipExtraDef(itemId) {
  return SHIP_EXTRA_DEFS[String(itemId || "")] || null;
}

// Fit du vaisseau actif (hangar actif, configuration active).
export function activeShipFit(user) {
  const hangars = Array.isArray(user?.hangars) ? user.hangars : [];
  const hangar = hangars.find((h) => h?.active) || hangars[0] || null;
  if (!hangar) return null;
  const cfg = String(Number(hangar.activeConfig) === 2 ? 2 : 1);
  return hangar.fits?.[cfg] || hangar.fit || null;
}

// Clés d'effet des extras équipés sur le vaisseau actif.
export function shipExtraKeys(user) {
  const keys = new Set();
  const fit = activeShipFit(user);
  for (const id of Array.isArray(fit?.extras) ? fit.extras : []) {
    const def = getShipExtraDef(id);
    if (def) keys.add(def.key);
  }
  // Canon à particules (emplacement dédié) : « particle » + son rayon.
  for (const id of Array.isArray(fit?.particle) ? fit.particle : []) {
    const def = getParticleCannonDef(id);
    if (def) { keys.add("particle"); keys.add(`particle_${def.shot}`); }
  }
  return keys;
}

// Erreur si deux extras du même groupe sont dans la liste, sinon null.
export function shipExtraDuplicateError(extras, nameOf = (id) => id) {
  const seen = new Map();
  for (const id of Array.isArray(extras) ? extras : []) {
    const def = getShipExtraDef(id);
    if (!def) continue;
    if (seen.has(def.group)) {
      if (def.group === "aim") return "Un seul CPU de visée peut être équipé.";
      if (def.group === "slot") return "Un seul CPU d'emplacement peut être équipé.";
      return def.group === "repair"
        ? "Un seul CPU de réparation peut être équipé."
        : `${nameOf(id)} : un seul peut être équipé.`;
    }
    seen.set(def.group, id);
  }
  return null;
}

// Emplacements d'extras en plus donnés par un CPU Emplacement présent dans
// la liste : N + 1 (son propre emplacement lui est rendu). Le plus fort si
// plusieurs (cas impossible une fois validé).
export function extraSlotBonus(extras) {
  let bonus = 0;
  for (const id of Array.isArray(extras) ? extras : []) {
    const n = Number(getShipExtraDef(id)?.slots) || 0;
    if (n > 0) bonus = Math.max(bonus, n + 1);
  }
  return bonus;
}

// Nombre d'emplacements d'extras d'un vaisseau pour cette liste d'extras.
export function extrasCapacity(baseSlots, extras) {
  return Math.max(0, Math.floor(Number(baseSlots) || 0)) + extraSlotBonus(extras);
}

// Multiplicateur de soute (CPU Soute : x2).
export function shipExtraCargoMult(user) {
  return shipExtraKeys(user).has("cargo2x") ? 2 : 1;
}
