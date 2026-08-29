// src/core/catalog.js
"use strict";

import { SHIP_PACKS } from "../data/shipPacks.js";

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
  { id: "ammo_x2",  name: "Munitions X2", price: 25000, give: { ammo: { x2: 100000000 } } },
  { id: "ammo_x3",  name: "Munitions X3", price: 50000, give: { ammo: { x3: 1000 } } },
  { id: "ammo_x4",  name: "Munitions X4", price: 100000, give: { ammo: { x4: 1000 } } },

  // ✅ SAB-50 maintenant achetable dans la vraie boutique
  { id: "ammo_sab", name: "Munitions SAB-50", price: 75000, give: { ammo: { sab: 500 } } },

  { id: "ammo_x6",  name: "Munitions X6", price: 250000, give: { ammo: { x6: 1000 } } },
 // { id: "ammo_abl", name: "Munitions ABL", price: 250000, give: { ammo: { ABL: 1000 } } },
 // { id: "ammo_radion", name: "Munitions RADION", price: 10000000, give: { ammo: { RADION: 1000 } } },
],

  speedGen: [
    { id: "spd_mk0", name: "Générateur de vitesse MK0", price: 10000, module: { type: "speed",  bonusSpeed: 3 } },
    { id: "spd_mk1", name: "Générateur de vitesse MK1", price: 50000, module: { type: "speed",  bonusSpeed: 4 } },
    { id: "spd_mk2", name: "Générateur de vitesse MK2", price: 200000, module: { type: "speed",  bonusSpeed: 5 } },
    { id: "spd_mk3", name: "Générateur de vitesse MK3", price: 1000000, module: { type: "speed",  bonusSpeed: 7 } },
    { id: "spd_mk4", name: "Générateur de vitesse MK4", price: 25000000, module: { type: "speed",  bonusSpeed: 10 } },
    { id: "spd_radion", name: "Générateur de vitesse RADION", price: 1000000000, module: { type: "speed",  bonusSpeed: 12 } },
  ],

  shieldGen: [
    { id: "shd_mk0", name: "Générateur de bouclier MK0", price: 10000, module: { type: "shield", bonusShield: 9000 } },
    { id: "shd_mk1", name: "Générateur de bouclier MK1", price: 50000, module: { type: "shield", bonusShield: 9500 } },
    { id: "shd_mk2", name: "Générateur de bouclier MK2", price: 200000, module: { type: "shield", bonusShield: 10000 } },
    { id: "shd_mk3", name: "Générateur de bouclier MK3", price: 1000000, module: { type: "shield", bonusShield: 11450 } },
    { id: "shd_mk4", name: "Générateur de bouclier MK4", price: 25000000, module: { type: "shield", bonusShield: 11900 } },
    { id: "shd_radion", name: "Générateur de bouclier RADION", price: 1000000000, module: { type: "shield", bonusShield: 14500 } },
  ],

  lasers: [
    { id: "laser_lf1", name: "laser LF-1", price: 10000, module: { type: "laser", damage: 65 } },
    { id: "laser_lf2", name: "laser LF-2", price: 50000, module: { type: "laser", damage: 140 } },
    { id: "laser_lf3", name: "laser LF-3", price: 200000, module: { type: "laser", damage: 201 } },
    { id: "laser_odysseus", name: "laser Odysseus", price: 1000000, module: { type: "laser", damage: 220 } },
    { id: "laser_anchorlock", name: "laser Anchorlock", price: 25000000, module: { type: "laser", damage: 245 } },
    { id: "laser_radion", name: "laser Mortifier", price: 1000000000, module: { type: "laser", damage: 350 } },
    ],

  extras: [
    { id: "extra_radar", name: "Extra: Radar +", price: 100000, module: { type: "extra", key: "radar_plus" } },
    { id: "extra_loot",  name: "Extra: Loot +",  price: 200000, module: { type: "extra", key: "loot_plus" } },
  ],

  // ✅ auto depuis SHIP_PACKS
  ships: SHIP_PACKS
    .filter(p => p?.id && p.id !== "PhoenixBleu")
    .map(p => ({
      id: `ship_${p.id}`,
      name: `Vaisseau: ${p.name || p.id}`,
      price: defaultShipPrice(p),
      ship: { id: p.id },
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

