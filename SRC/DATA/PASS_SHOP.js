"use strict";

export const PASS_MODULE_KEY_COSTS = Object.freeze({ common: 2, rare: 5, epic: 12, legendary: 25 });

export const PASS_MODULE_FORCED = Object.freeze({
  common: Object.freeze({ tier: "x1", statCount: 1 }),
  rare: Object.freeze({ tier: "x2", statCount: 2 }),
  epic: Object.freeze({ tier: "x3", statCount: 3 }),
  legendary: Object.freeze({ tier: "x3", statCount: 4 }),
});

export const PASS_SHOP_OFFERS = Object.freeze([
  Object.freeze({ id: "mod_common", kind: "module", rarity: "common", cost: 2, label: "Module Commun" }),
  Object.freeze({ id: "mod_rare", kind: "module", rarity: "rare", cost: 5, label: "Module Rare" }),
  Object.freeze({ id: "mod_epic", kind: "module", rarity: "epic", cost: 12, label: "Module Épique" }),
  Object.freeze({ id: "mod_legendary", kind: "module", rarity: "legendary", cost: 25, label: "Module Légendaire" }),
  Object.freeze({ id: "res_mucosum", kind: "resources", cost: 1, label: "Mucosum ×25", resources: Object.freeze({ mucosum: 25 }) }),
  Object.freeze({ id: "res_scrap", kind: "resources", cost: 1, label: "Scrap ×25", resources: Object.freeze({ scrap: 25 }) }),
  Object.freeze({ id: "res_plasmide", kind: "resources", cost: 1, label: "Plasmide ×15", resources: Object.freeze({ plasmide: 15 }) }),
  Object.freeze({ id: "res_alloy", kind: "resources", cost: 2, label: "Alliage hybride ×5", resources: Object.freeze({ hybrid_alloy: 5 }) }),
  Object.freeze({ id: "res_prismatium", kind: "resources", cost: 2, label: "Prismatium ×10", resources: Object.freeze({ prismatium: 10 }) }),
  Object.freeze({ id: "res_aurus", kind: "resources", cost: 2, label: "Aurus ×10", resources: Object.freeze({ aurus: 10 }) }),
  Object.freeze({ id: "res_rinusk", kind: "resources", cost: 5, label: "Rinusk ×50 + Traceurs ×10", resources: Object.freeze({ rinusk: 50, blacklight_trace: 10 }) }),
  Object.freeze({ id: "res_kyhalon", kind: "resources", cost: 5, label: "Kyhalon ×10 + Tetrathrin ×10", resources: Object.freeze({ kyhalon: 10, tetrathrin: 10 }) }),
  Object.freeze({ id: "laser_xenocide", kind: "item", itemId: "laser_lf6", cost: 333, label: "Laser Xénocide" }),
]);

export function getPassShopOffer(offerId) {
  return PASS_SHOP_OFFERS.find(offer => offer.id === String(offerId || "")) || null;
}
