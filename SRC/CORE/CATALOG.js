// SRC/CORE/CATALOG.js
"use strict";

import { SHIP_PACKS, getShipDesignBaseId, isRemovedShipPack } from "../../SHIP/SHIP_PACKS.js";
import { DRONE_FORMATIONS, SPECIAL_DRONE_PRICE, getDroneShopSpritePath } from "../../DRONE/DRONE_TYPES.js";
import { ROCKET_TYPES, rocketShopIcon } from "../../COMBAT/ROCKET_TYPES.js";

/**
 * Règle de prix temporaire:
 * - PhoenixBleu = de base => pas dans la boutique
 * - les autres => prix calculé (tu pourras remplacer par un champ price dans SHIP_PACKS plus tard)
 */
function defaultShipPrice(pack) {
  // formule simple basée sur la taille / frames (à ajuster)
  const frames = Number(pack.frames || 1);
  const area = (Number(pack.w || 160) * Number(pack.h || 160)) / 1000;
  return Math.round(200000 + frames * 8000 + area * 4000);
}

export const CATALOG = {
  // Munitions lasers officielles (icônes : itemsControlMenu_texture officielle).
  // Dégâts : LCB-10 x1 (base, stock infini, non vendue), MCB-25 x2, MCB-50 x3,
  // UCB-100 x4, SAB-50 (vole le bouclier x2 + recharge le tien), RSB-75 x6.
  ammo: [
  { id: "ammo_x2", name: "MCB-25 (X2)", price: 50000, give: { ammo: { x2: 1000 } },
    code: "MCB-25", mult: 2, laser: "bleu",
    desc: "Batterie moyenne capacité : dégâts doublés (×2).", effect: "Tirs bleus." },
  { id: "ammo_x3", name: "MCB-50 (X3)", price: 150000, give: { ammo: { x3: 1000 } },
    code: "MCB-50", mult: 3, laser: "vert",
    desc: "Batterie capacité max : dégâts triplés (×3).", effect: "Tirs verts." },
  { id: "ammo_x4", name: "UCB-100 (X4)", price: 500000, give: { ammo: { x4: 1000 } },
    code: "UCB-100", mult: 4, laser: "blanc",
    desc: "Batterie ultra capacité : dégâts quadruplés (×4).", effect: "Tirs blancs." },
  { id: "ammo_sab", name: "SAB-50", price: 250000, give: { ammo: { sab: 1000 } },
    code: "SAB-50", mult: 2, laser: "bleu (cercles)",
    desc: "Batterie absorbe-bouclier : vole le bouclier adverse (×2) et recharge le tien. Zéro dégât coque.", effect: "Cercles bleus + faisceau inversé (cible → toi)." },
  { id: "ammo_x6", name: "RSB-75 (X6)", price: 1500000, give: { ammo: { x6: 1000 } },
    code: "RSB-75", mult: 6, laser: "orange",
    desc: "Batterie de salve rapide : dégâts sextuplés (×6).", effect: "Tirs oranges." },
  // Munitions spéciales officielles (effets : voir COMBAT/AMMO_TYPES.js).
  { id: "ammo_rcb", name: "RCB-140", price: 3000000, give: { ammo: { rcb: 1000 } },
    code: "RCB-140", mult: 7, laser: "violet",
    desc: "Munition d'événement : dégâts septuplés (×7).", effect: "Tirs violets." },
  { id: "ammo_cbo", name: "CBO-100", price: 800000, give: { ammo: { cbo: 1000 } },
    code: "CBO-100", mult: 3, laser: "violet (absorption)",
    desc: "Dégâts triplés (×3) + vole le bouclier adverse (×1).", effect: "Faisceau inversé (cible → toi)." },
  { id: "ammo_job", name: "JOB-100", price: 400000, give: { ammo: { job: 1000 } },
    code: "JOB-100", mult: 2, laser: "jaune-vert",
    desc: "×3,5 contre les aliens, ×2 contre les joueurs.", effect: "Tirs jaune-vert." },
  { id: "ammo_rb", name: "RB-214", price: 600000, give: { ammo: { rb: 1000 } },
    code: "RB-214", mult: 4, laser: "or",
    desc: "Dégâts quadruplés (×4), ×8 contre les Demaners.", effect: "Tirs dorés." },
  { id: "ammo_pib", name: "PIB-100", price: 2000000, give: { ammo: { pib: 1000 } },
    code: "PIB-100", mult: 4, laser: "vert",
    desc: "Dégâts quadruplés (×4) + infecte la cible (vitesse −10 %, 15 s).", effect: "Tirs verts." },
  { id: "ammo_idb", name: "IDB-125", price: 1200000, give: { ammo: { idb: 1000 } },
    code: "IDB-125", mult: 1, laser: "magenta (progressif)",
    desc: "Commence à ×1 puis +1,25 par tir réussi jusqu'à ×6 (retombe à ×1 après 3 s sans tirer).", effect: "Tirs magenta." },
  { id: "ammo_vb", name: "VB-142", price: 900000, give: { ammo: { vb: 1000 } },
    code: "VB-142", mult: 4, laser: "mauve",
    desc: "Dégâts quadruplés (×4), ×7 contre Styxus et Charopos.", effect: "Tirs mauves." },
  { id: "ammo_emaa", name: "EMAA-20", price: 900000, give: { ammo: { emaa: 1000 } },
    code: "EMAA-20", mult: 4, laser: "vert-jaune",
    desc: "Dégâts quadruplés (×4), ×7 contre les Mimesis.", effect: "Tirs vert-jaune." },
  { id: "ammo_sbl", name: "SBL-100", price: 900000, give: { ammo: { sbl: 1000 } },
    code: "SBL-100", mult: 4, laser: "cyan",
    desc: "Dégâts quadruplés (×4), ×8 contre les Sibelons.", effect: "Tirs cyan." },
  { id: "ammo_abl", name: "A-BL", price: 1000000, give: { ammo: { abl: 1000 } },
    code: "A-BL", mult: 4, laser: "rose",
    desc: "Dégâts quadruplés (×4), ×8 contre Invoke et Mindfire Behemoth.", effect: "Tirs roses." },
  ],

  // Roquettes tirables (lanceur natif) : généré depuis data/rockets.js.
  // Nouvelles roquettes = juste une entrée là-bas, la boutique suit toute seule.
  rockets: Object.values(ROCKET_TYPES).filter((r) => r.manual !== false).map((r) => ({
    id: `rocket_${r.id}`,
    name: `${r.name} ×${r.packSize}`,
    price: r.packPrice,
    give: { rockets: { [r.id]: r.packSize } },
    icon: rocketShopIcon(r.id),
    manual: true,
  })),

  // Roquettes de lance-roquettes : catégorie à part (pas de tir manuel pour l'instant).
  launchers: Object.values(ROCKET_TYPES).filter((r) => r.manual === false).map((r) => ({
    id: `rocket_${r.id}`,
    name: `${r.name} ×${r.packSize}`,
    price: r.packPrice,
    give: { rockets: { [r.id]: r.packSize } },
    icon: rocketShopIcon(r.id),
    manual: false,
  })),

  speedGen: [
    { id: "spd_mk0", name: "Générateur de vitesse MK0", price: 15000, module: { type: "speed",  bonusSpeed: 2 } },
    { id: "spd_mk1", name: "Générateur de vitesse MK1", price: 75000, module: { type: "speed",  bonusSpeed: 4 } },
    { id: "spd_mk2", name: "Générateur de vitesse MK2", price: 300000, module: { type: "speed",  bonusSpeed: 6 } },
    { id: "spd_mk3", name: "Générateur de vitesse MK3", price: 1500000, module: { type: "speed",  bonusSpeed: 8 } },
    { id: "spd_mk4", name: "Générateur de vitesse MK4", price: 40000000, module: { type: "speed",  bonusSpeed: 11 } },
  ],

  shieldGen: [
    { id: "shd_mk0", name: "Générateur de bouclier MK0", price: 12500, module: { type: "shield", bonusShield: 5000 } },
    { id: "shd_mk1", name: "Générateur de bouclier MK1", price: 60000, module: { type: "shield", bonusShield: 7500 } },
    { id: "shd_mk2", name: "Générateur de bouclier MK2", price: 250000, module: { type: "shield", bonusShield: 10000 } },
    { id: "shd_mk3", name: "Générateur de bouclier MK3", price: 1250000, module: { type: "shield", bonusShield: 12500 } },
    { id: "shd_mk4", name: "Générateur de bouclier MK4", price: 35000000, module: { type: "shield", bonusShield: 15000 } },
  ],

  lasers: [
    { id: "laser_lf1", name: "laser LF-1", price: 10000, module: { type: "laser", damage: 40 } },
    { id: "laser_lf2", name: "laser LF-2", price: 75000, module: { type: "laser", damage: 100 } },
    { id: "laser_lf3", name: "laser LF-3", price: 350000, module: { type: "laser", damage: 150 } },
    { id: "laser_odysseus", name: "laser Odysseus", price: 2000000, module: { type: "laser", damage: 200 } },
    { id: "laser_anchorlock", name: "laser Anchorlock", price: 50000000, module: { type: "laser", damage: 275 } },
    ],

  extras: [
    { id: "extra_radar", name: "Extra: Radar +", price: 250000, module: { type: "extra", key: "radar_plus" } },
    { id: "extra_loot",  name: "Extra: Loot +",  price: 500000, module: { type: "extra", key: "loot_plus" } },
  ],

  drones: [
    { id: "drone_iris", name: "Drone Iris", price: 15000000, drone: { type: "iris" }, icon: getDroneShopSpritePath("iris") },
    { id: "drone_apis", name: "Drone Apis", price: SPECIAL_DRONE_PRICE, drone: { type: "apis" }, icon: getDroneShopSpritePath("apis") },
    { id: "drone_zeus", name: "Drone Zeus", price: SPECIAL_DRONE_PRICE, drone: { type: "zeus" }, icon: getDroneShopSpritePath("zeus") },
  ],

  pets: [
    { id: "pet_niveau1", name: "P.E.T", price: 10000000, icon: "/PET/PET_SPRITES/NIVEAU1/21.png", pet: { id: "niveau1" } },
  ],

  // Gears P.E.T (puces) : catégorie conservée, items retirés pour l'instant.
  // Comme l'officiel, les emplacements se débloquent avec les niveaux du P.E.T.
  petGears: [],

  // Protocoles P.E.T (IA) : catégorie conservée, items retirés pour l'instant.
  // Paliers officiels : niveau 2 dès P.E.T 4, niveau 3 dès P.E.T 8.
  petProtocols: [],

  formations: DRONE_FORMATIONS.filter(formation => formation.price > 0).map(formation => ({
    id: `formation_${formation.id}`, name: formation.name, price: formation.price,
    formation: { id: formation.id, minDrones: formation.minDrones, icon: formation.icon },
    icon: formation.icon,
  })),

  // ✅ auto depuis SHIP_PACKS (price propre à chaque vaisseau, fallback heuristique)
  // « Vaisseaux » = uniquement les vaisseaux de base ; toutes les variantes
  // (designs) sont dans la catégorie « designs ».
  ships: SHIP_PACKS
    .filter(p => p?.id && p.id !== "PhoenixBleu" && !isRemovedShipPack(p.id) && !getShipDesignBaseId(p.id))
    .map(p => ({
      id: `ship_${p.id}`,
      name: `Vaisseau: ${p.name || p.id}`,
      price: Number(p.price) > 0 ? Number(p.price) : defaultShipPrice(p),
      ship: { id: p.id },
    })),

  designs: SHIP_PACKS
    .filter(p => p?.id && p.id !== "PhoenixBleu" && !isRemovedShipPack(p.id) && getShipDesignBaseId(p.id))
    .map(p => ({
      id: `design_${p.id}`,
      name: p.name || p.id,
      price: Number(p.price) > 0 ? Number(p.price) : defaultShipPrice(p),
      design: { id: p.id, base: getShipDesignBaseId(p.id) },
    })),
};

export function findCatalogItem(itemId) {
  for (const cat of Object.values(CATALOG)) {
    if (!Array.isArray(cat)) continue;
    const it = cat.find(x => x?.id === itemId);
    if (it) return it;
  }
  return null;
}

