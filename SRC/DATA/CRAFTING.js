"use strict";

import { getItemRarity } from "./ITEM_RARITIES.js";

// SRC/DATA/CRAFTING.js — Assemblage (atelier).
// Liste volontairement VIDE : les recettes sont refaites à la main.
//
// FORMAT D'UNE RECETTE :
//   Object.freeze({
//     id: "craft_apis",            // unique, préfixe craft_ conseillé
//     name: "Drone Apis",          // nom affiché
//     rarity: "epic",              // rare | epic | legendary (common = masquée)
//     costs: {
//       credits: 50000000,         // crédits
//       resources: { scrap: 100, mucosum: 50 }, // ids de RESOURCE_TYPES
//       items: { laser_lf4: 1 },   // (optionnel) ids du catalogue (counts)
//       logDisks: 400,             // (optionnel) disques de log (arbre pilote)
//     },
//     output: { drones: { apis: 1 } }, // UNE seule famille parmi :
//     // { resources: { seprom: 10 } } | { ammo: { x4: 1000 } } |
//     // { rockets: { plt3030: 10 } } | { items: { <catalogId>: 1 } } |
//     // { drones: { <type>: 1 } } | { formations: { <id>: 1 } } |
//     // { ships: { <shipId>: 1 } } | { pet: { pet_niveau1: 1 } }
//   }),
//
// RESSOURCES UTILISABLES (coûts) : palladium, prometium, endurium, terbium,
// prometid, duranium, promerium, seprom, xenomit, osmium, scrap, mucosum,
// plasmide, prismatium, aurus, bifenon, tetrathrin, kyhalon, rinusk,
// blacklight_trace, mindfire_cerebrum (+ refined_component, npc_debris,
// hybrid_alloy, indoctrinated_oil si réactivés comme drops,
// + composants intermédiaires : nano_condensator, high_frequency_cable,
// prismatic_socket, hybrid_processor, nano_case, micro_transistor).
// NOTE : npc_debris n'a actuellement AUCUN drop en jeu (visible dans
// l'inventaire mais non lootable) — préférer les ressources ci-dessus.

// Interrupteur global de l'assemblage.
export const CRAFTING_ENABLED = true;

export const CRAFTING_RECIPES = Object.freeze([
  Object.freeze({
    id: "craft_x2",
    name: "Munitions X2",
    rarity: "rare",
    costs: {
      credits: 0,
      resources: { mucosum: 6, scrap: 1, plasmide: 2 },
    },
    output: { ammo: { x2: 1000 } },
  }),
  Object.freeze({
    id: "craft_x3",
    name: "Munitions MCB-50",
    rarity: "rare",
    costs: {
      credits: 0,
      resources: { scrap: 12, mucosum: 8, plasmide: 2 },
    },
    output: { ammo: { x3: 1000 } },
  }),
  Object.freeze({
    id: "craft_x4",
    name: "Munitions X4",
    rarity: "rare",
    costs: {
      credits: 0,
      resources: { scrap: 50, mucosum: 75, plasmide: 10 },
    },
    output: { ammo: { x4: 1000 } },
  }),
  Object.freeze({
    id: "craft_x6",
    name: "Munitions X6",
    rarity: "rare",
    costs: {
      credits: 0,
      resources: { scrap: 100, mucosum: 100, plasmide: 100 },
    },
    output: { ammo: { x6: 1000 } },
  }),
  Object.freeze({
    id: "craft_nano_condensator",
    name: "Condensateur nano",
    rarity: "rare",
    costs: {
      credits: 0,
      resources: { scrap: 50, prismatium: 10 },
    },
    output: { resources: { nano_condensator: 1 } },
  }),
  Object.freeze({
    id: "craft_high_frequency_cable",
    name: "Câble haute fréquence",
    rarity: "rare",
    costs: {
      credits: 0,
      resources: { scrap: 50, prismatium: 10 },
    },
    output: { resources: { high_frequency_cable: 1 } },
  }),
  Object.freeze({
    id: "craft_prismatic_socket",
    name: "Prise prismatique",
    rarity: "rare",
    costs: {
      credits: 0,
      resources: { mucosum: 80, prismatium: 10 },
    },
    output: { resources: { prismatic_socket: 1 } },
  }),
  Object.freeze({
    id: "craft_hybrid_processor",
    name: "Processeur hybride",
    rarity: "rare",
    costs: {
      credits: 0,
      resources: { scrap: 330, mucosum: 240 },
    },
    output: { resources: { hybrid_processor: 1 } },
  }),
  Object.freeze({
    id: "craft_nano_case",
    name: "Boîte nano",
    rarity: "rare",
    costs: {
      credits: 0,
      resources: { scrap: 25, plasmide: 10 },
    },
    output: { resources: { nano_case: 1 } },
  }),
  Object.freeze({
    id: "craft_micro_transistor",
    name: "Micro transistor",
    rarity: "rare",
    costs: {
      credits: 0,
      resources: { mucosum: 40, plasmide: 30, scrap: 25, aurus: 5 },
    },
    output: { resources: { micro_transistor: 1 } },
  }),
  Object.freeze({
    id: "craft_lf3",
    name: "Laser LF-3",
    rarity: "epic",
    costs: {
      credits: 0,
      resources: { high_frequency_cable: 2, nano_case: 1 },
    },
    output: { items: { laser_lf3: 1 } },
  }),
  Object.freeze({
    id: "craft_lf4pd",
    name: "LF-4 Paritydrill",
    rarity: "epic",
    costs: {
      credits: 0,
      resources: { bifenon: 350, tetrathrin: 300, kyhalon: 160 },
      items: { laser_lf4: 1 },
      logDisks: 400,
    },
    output: { items: { laser_lf4pd: 1 } },
  }),
  Object.freeze({
    id: "craft_lf4md",
    name: "LF-4 Magmadrill",
    rarity: "epic",
    costs: {
      credits: 0,
      resources: { bifenon: 350, tetrathrin: 300, kyhalon: 160 },
      items: { laser_lf4: 1 },
      logDisks: 400,
    },
    output: { items: { laser_lf4md: 1 } },
  }),
  Object.freeze({
    id: "craft_lf4hp",
    name: "LF-4 Hyperplasmoïde",
    rarity: "epic",
    costs: {
      credits: 0,
      resources: { bifenon: 350, tetrathrin: 300, kyhalon: 160 },
      items: { laser_lf4: 1 },
      logDisks: 400,
    },
    output: { items: { laser_lf4hp: 1 } },
  }),
  Object.freeze({
    id: "craft_sar02",
    name: "Roquettes SAR-02",
    rarity: "rare",
    costs: {
      credits: 0,
      resources: { plasmide: 85, scrap: 50, prismatium: 50 },
    },
    output: { rockets: { sar02: 1000 } },
  }),
  Object.freeze({
    id: "craft_ubr100",
    name: "Roquettes UBR-100",
    rarity: "rare",
    costs: {
      credits: 0,
      resources: { plasmide: 215, scrap: 55, prismatium: 2 },
    },
    output: { rockets: { ubr100: 1000 } },
  }),
  Object.freeze({
    id: "craft_boost_hp",
    name: "Hitpoint Booster",
    rarity: "rare",
    costs: {
      credits: 0,
      resources: { mucosum: 30, scrap: 25, plasmide: 1 },
    },
    output: { items: { booster_hp: 1 } },
  }),
  Object.freeze({
    id: "craft_boost_shd",
    name: "Booster de bouclier",
    rarity: "rare",
    costs: {
      credits: 0,
      resources: { mucosum: 30, scrap: 25, plasmide: 1 },
    },
    output: { items: { booster_shd: 1 } },
  }),
  Object.freeze({
    id: "craft_boost_dmg",
    name: "Booster de dégâts",
    rarity: "rare",
    costs: {
      credits: 0,
      resources: { mucosum: 30, scrap: 25, plasmide: 1 },
    },
    output: { items: { booster_dmg: 1 } },
  }),
  Object.freeze({
    id: "craft_boost_ep",
    name: "Expérience Booster",
    rarity: "rare",
    costs: {
      credits: 0,
      resources: { mucosum: 30, scrap: 25, plasmide: 1 },
    },
    output: { items: { booster_ep: 1 } },
  }),
  Object.freeze({
    id: "craft_boost_res",
    name: "Booster de ressources",
    rarity: "rare",
    costs: {
      credits: 0,
      resources: { mucosum: 30, scrap: 25, plasmide: 1 },
    },
    output: { items: { booster_res: 1 } },
  }),
  Object.freeze({
    id: "craft_pet",
    name: "P.E.T.",
    rarity: "epic",
    costs: {
      credits: 0,
      resources: { nano_case: 3, high_frequency_cable: 2 },
    },
    output: { pet: { pet_niveau1: 1 } },
  }),
  Object.freeze({
    id: "craft_iris",
    name: "Drone Iris",
    rarity: "epic",
    costs: {
      credits: 0,
      resources: { nano_condensator: 2, hybrid_processor: 1 },
    },
    output: { drones: { iris: 1 } },
  }),
  Object.freeze({
    id: "craft_leonov",
    name: "Leonov",
    rarity: "legendary",
    costs: {
      credits: 0,
      resources: { nano_case: 2, high_frequency_cable: 1 },
    },
    output: { ships: { leonov: 1 } },
  }),
  Object.freeze({
    id: "craft_vengeance_lightning",
    name: "Éclairage de vengeance",
    rarity: "legendary",
    costs: {
      credits: 0,
      resources: { hybrid_processor: 4, nano_condensator: 2 },
    },
    output: { ships: { vengeance_lightning: 1 } },
  }),
  Object.freeze({
    id: "craft_goliath_peacemaker",
    name: "Goliath Peacemaker",
    rarity: "legendary",
    costs: {
      credits: 0,
      resources: { nano_case: 8, nano_condensator: 2, prismatic_socket: 2 },
    },
    output: { ships: { goliath_peacemaker: 1 } },
  }),
  Object.freeze({
    id: "craft_goliath_sovereign",
    name: "Goliath Souveraine",
    rarity: "legendary",
    costs: {
      credits: 0,
      resources: { nano_case: 8, nano_condensator: 2, prismatic_socket: 2 },
    },
    output: { ships: { goliath_sovereign: 1 } },
  }),
  Object.freeze({
    id: "craft_goliath_centaur",
    name: "Goliath Centaure",
    rarity: "legendary",
    costs: {
      credits: 0,
      resources: { nano_case: 8, nano_condensator: 2, prismatic_socket: 2 },
    },
    output: { ships: { goliath_centaur: 1 } },
  }),
  Object.freeze({
    id: "craft_goliath_vanquisher",
    name: "Goliath Vanquisher",
    rarity: "legendary",
    costs: {
      credits: 0,
      resources: { nano_case: 8, nano_condensator: 2, prismatic_socket: 2 },
    },
    output: { ships: { goliath_vanquisher: 1 } },
  }),
  Object.freeze({
    id: "craft_goliath_bastion",
    name: "Bastion de Goliath",
    rarity: "legendary",
    costs: {
      credits: 0,
      resources: { nano_case: 5, nano_condensator: 4, prismatic_socket: 4 },
    },
    output: { ships: { goliath_bastion: 1 } },
  }),
  Object.freeze({
    id: "craft_venom",
    name: "Venin",
    rarity: "legendary",
    costs: {
      credits: 0,
      resources: { high_frequency_cable: 10, nano_condensator: 8, micro_transistor: 1 },
    },
    output: { ships: { venom: 1 } },
  }),
  Object.freeze({
    id: "craft_diminisher",
    name: "Diminuteur",
    rarity: "legendary",
    costs: {
      credits: 0,
      resources: { high_frequency_cable: 10, nano_condensator: 8, micro_transistor: 1 },
    },
    output: { ships: { diminisher: 1 } },
  }),
  Object.freeze({
    id: "craft_spectrum",
    name: "Spectre",
    rarity: "legendary",
    costs: {
      credits: 0,
      resources: { high_frequency_cable: 10, nano_condensator: 8, micro_transistor: 1 },
    },
    output: { ships: { spectrum: 1 } },
  }),
  Object.freeze({
    id: "craft_solace",
    name: "Solace",
    rarity: "legendary",
    costs: {
      credits: 0,
      resources: { high_frequency_cable: 10, nano_condensator: 8, micro_transistor: 1 },
    },
    output: { ships: { solace: 1 } },
  }),
  Object.freeze({
    id: "craft_sentinel",
    name: "Sentinelle",
    rarity: "legendary",
    costs: {
      credits: 0,
      resources: { nano_case: 6, hybrid_processor: 4, prismatic_socket: 3 },
    },
    output: { ships: { sentinel: 1 } },
  }),
]);

export function getCraftingRecipe(recipeId) {
  return CRAFTING_RECIPES.find(recipe => recipe.id === recipeId) || null;
}

// Rareté d'un objet du catalogue (utilisé par boutique / hangar / pilote).
// Conservé ici car l'atelier et ces fenêtres partagent la même échelle.
export function rarityForCatalogItem(item) {
  const explicit = getItemRarity(item).id;
  if (explicit !== "common") return explicit;
  const price = Math.max(0, Number(item?.price || 0));
  if (price >= 500000000) return "legendary";
  if (price >= 50000000) return "epic";
  if (price >= 1000000) return "rare";
  return "common";
}
