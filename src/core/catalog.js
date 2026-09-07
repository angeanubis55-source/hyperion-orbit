// src/core/catalog.js
"use strict";

import { SHIP_PACKS, getShipDesignBaseId, isRemovedShipPack } from "../data/shipPacks.js";
import { DRONE_FORMATIONS, SPECIAL_DRONE_PRICE, getDroneShopSpritePath } from "../data/drones.js";
import { ROCKET_TYPES, rocketShopIcon } from "../data/rockets.js";

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
ammo: [
  { id: "ammo_x2",  name: "Munitions X2", price: 50000, give: { ammo: { x2: 1000 } } },
  { id: "ammo_x3",  name: "Munitions X3", price: 150000, give: { ammo: { x3: 1000 } } },
  { id: "ammo_x4",  name: "Munitions X4", price: 500000, give: { ammo: { x4: 1000 } } },

  // ✅ SAB-50 maintenant achetable dans la vraie boutique
  { id: "ammo_sab", name: "Munitions SAB-50", price: 250000, give: { ammo: { sab: 1000 } } },

  { id: "ammo_x6",  name: "Munitions X6", price: 1500000, give: { ammo: { x6: 1000 } } },
  // { id: "ammo_abl", name: "Munitions ABL", price: 250000, give: { ammo: { ABL: 1000 } } },
  // { id: "ammo_radion", name: "Munitions RADION", price: 10000000, give: { ammo: { RADION: 1000 } } },
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
    { id: "spd_radion", name: "Générateur de vitesse RADION", price: 1250000000, module: { type: "speed",  bonusSpeed: 16 } },
  ],

  shieldGen: [
    { id: "shd_mk0", name: "Générateur de bouclier MK0", price: 12500, module: { type: "shield", bonusShield: 5000 } },
    { id: "shd_mk1", name: "Générateur de bouclier MK1", price: 60000, module: { type: "shield", bonusShield: 7500 } },
    { id: "shd_mk2", name: "Générateur de bouclier MK2", price: 250000, module: { type: "shield", bonusShield: 10000 } },
    { id: "shd_mk3", name: "Générateur de bouclier MK3", price: 1250000, module: { type: "shield", bonusShield: 12500 } },
    { id: "shd_mk4", name: "Générateur de bouclier MK4", price: 35000000, module: { type: "shield", bonusShield: 15000 } },
    { id: "shd_radion", name: "Générateur de bouclier RADION", price: 1250000000, module: { type: "shield", bonusShield: 22500 } },
  ],

  lasers: [
    { id: "laser_lf1", name: "laser LF-1", price: 10000, module: { type: "laser", damage: 40 } },
    { id: "laser_lf2", name: "laser LF-2", price: 75000, module: { type: "laser", damage: 100 } },
    { id: "laser_lf3", name: "laser LF-3", price: 350000, module: { type: "laser", damage: 150 } },
    { id: "laser_odysseus", name: "laser Odysseus", price: 2000000, module: { type: "laser", damage: 200 } },
    { id: "laser_anchorlock", name: "laser Anchorlock", price: 50000000, module: { type: "laser", damage: 275 } },
    { id: "laser_radion", name: "laser Mortifier", price: 1500000000, module: { type: "laser", damage: 600 } },
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

