"use strict";

import { getItemRarity } from "./ITEM_RARITIES.js";

// SRC/DATA/CRAFTING.js — Assemblage (atelier).
// Liste volontairement VIDE : les recettes sont refaites à la main.
//
// FORMAT D'UNE RECETTE :
//   Object.freeze({
//     id: "craft_apis",            // unique, préfixe craft_ conseillé
//     name: "Drone Apis",          // nom affiché
//     description: "...",         // résumé court (sinon repris du catalogue)
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
    output: { ammo: { x2: 10000 } },
  }),
  Object.freeze({
    id: "craft_x3",
    name: "Munitions MCB-50",
    rarity: "rare",
    costs: {
      credits: 0,
      resources: { scrap: 12, mucosum: 8, plasmide: 2 },
    },
    output: { ammo: { x3: 10000 } },
  }),
  Object.freeze({
    id: "craft_x4",
    name: "Munitions X4",
    description: "Dégâts laser ×4.",
    rarity: "rare",
    costs: {
      credits: 0,
      resources: { scrap: 50, mucosum: 75, plasmide: 10 },
    },
    output: { ammo: { x4: 10000 } },
  }),
  Object.freeze({
    id: "craft_x6",
    name: "Munitions X6",
    rarity: "rare",
    costs: {
      credits: 0,
      resources: { scrap: 100, mucosum: 100, plasmide: 100 },
    },
    output: { ammo: { x6: 10000 } },
  }),
  Object.freeze({
    id: "craft_rcb",
    name: "Munitions RCB-140",
    rarity: "epic",
    costs: {
      credits: 0,
      resources: { scrap: 150, mucosum: 150, plasmide: 150 },
    },
    output: { ammo: { rcb: 10000 } },
  }),
  Object.freeze({
    id: "craft_nano_condensator",
    name: "Condensateur nano",
    description: "Composant d’assemblage pour drones et vaisseaux.",
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
    description: "Composant pour le LF-3, le P.E.T. et certains vaisseaux.",
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
    description: "Composant destiné à l’assemblage de vaisseaux.",
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
    description: "Composant pour le drone Iris et certains vaisseaux.",
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
    description: "Composant pour le LF-3, le P.E.T. et certains vaisseaux.",
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
    description: "Composant pour Venom, Diminisher, Spectrum et Solace.",
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
    id: "craft_ric3",
    name: "Roquettes R-IC3",
    rarity: "rare",
    costs: {
      credits: 0,
      resources: { scrap: 25, mucosum: 38, plasmide: 5 },
    },
    output: { rockets: { ric3: 100 } },
  }),
  Object.freeze({
    id: "craft_rc100",
    name: "Roquettes RC-100",
    rarity: "rare",
    costs: {
      credits: 0,
      resources: { scrap: 27, mucosum: 40, plasmide: 7 },
    },
    output: { rockets: { rc100: 100 } },
  }),
  Object.freeze({
    id: "craft_shg01",
    name: "Roquettes SHG-01",
    rarity: "rare",
    costs: {
      credits: 0,
      resources: { scrap: 25, mucosum: 38, plasmide: 5 },
    },
    output: { rockets: { shg01: 1000 } },
  }),
  Object.freeze({
    id: "craft_shg02",
    name: "Roquettes SHG-02",
    rarity: "rare",
    costs: {
      credits: 0,
      resources: { scrap: 27, mucosum: 40, plasmide: 7 },
    },
    output: { rockets: { shg02: 1000 } },
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
    description: "Vaisseau renforcé sur les petites cartes de sa firme.",
    rarity: "legendary",
    costs: {
      credits: 0,
      resources: { nano_case: 2, high_frequency_cable: 1 },
    },
    output: { ships: { leonov: 1 } },
  }),
  Object.freeze({
    id: "craft_vengeance_lightning",
    name: "Vengeance Lightning",
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
    name: "Goliath Sovereign",
    rarity: "legendary",
    costs: {
      credits: 0,
      resources: { nano_case: 8, nano_condensator: 2, prismatic_socket: 2 },
    },
    output: { ships: { goliath_sovereign: 1 } },
  }),
  Object.freeze({
    id: "craft_goliath_centaur",
    name: "Goliath Centaur",
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
    name: "Goliath Bastion",
    rarity: "legendary",
    costs: {
      credits: 0,
      resources: { nano_case: 5, nano_condensator: 4, prismatic_socket: 4 },
    },
    output: { ships: { goliath_bastion: 1 } },
  }),
  Object.freeze({
    id: "craft_venom",
    name: "Venom",
    rarity: "legendary",
    costs: {
      credits: 0,
      resources: { high_frequency_cable: 10, nano_condensator: 8, micro_transistor: 1 },
    },
    output: { ships: { venom: 1 } },
  }),
  Object.freeze({
    id: "craft_diminisher",
    name: "Diminisher",
    rarity: "legendary",
    costs: {
      credits: 0,
      resources: { high_frequency_cable: 10, nano_condensator: 8, micro_transistor: 1 },
    },
    output: { ships: { diminisher: 1 } },
  }),
  Object.freeze({
    id: "craft_spectrum",
    name: "Spectrum",
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
    name: "Sentinel",
    rarity: "legendary",
    costs: {
      credits: 0,
      resources: { nano_case: 6, hybrid_processor: 4, prismatic_socket: 3 },
    },
    output: { ships: { sentinel: 1 } },
  }),
  // ---- Blacklight (quêtes BL) ----
  Object.freeze({
    id: "craft_seprom_5000",
    name: "Seprom (5 000)",
    description: "Minerai pour améliorer les lasers, les roquettes et le bouclier.",
    rarity: "rare",
    costs: {
      // Recette officielle : 10 000 Uridium, convertis en crédits (×1000).
      // https://board-es.darkorbit.com/threads/faqs-sistema-de-mejoras-y-ensamblaje.142120/
      credits: 10000000,
      resources: { rinusk: 1250, blacklight_trace: 250 },
    },
    output: { resources: { seprom: 5000 } },
  }),
  Object.freeze({
    id: "craft_prometheus",
    name: "Laser PR-L Prometheus",
    description: "210 dégâts,\n+200 tous les 5 tirs,\n×3,5 contre Impulse, Attend, Invoke et Mindfire.",
    rarity: "legendary",
    costs: {
      credits: 25000000,
      resources: { rinusk: 6000 },
      ammo: { x4: 15000, x6: 2500 },
    },
    output: { items: { laser_prl: 1 } },
  }),
  Object.freeze({
    id: "craft_abl_25000",
    name: "Munitions A-BL (25 000)",
    rarity: "rare",
    costs: {
      credits: 15000000,
      resources: { rinusk: 1500 },
      ammo: { x4: 10000 },
    },
    output: { ammo: { abl: 25000 } },
  }),
  Object.freeze({
    id: "craft_blacklight_cipher",
    name: "Code secret Black Light",
    description: "Objet spécial assemblé à partir des ressources Blacklight.",
    rarity: "legendary",
    costs: {
      credits: 75000000,
      resources: { rinusk: 2400, blacklight_trace: 1000, mindfire_cerebrum: 100 },
    },
    output: { resources: { blacklight_cipher: 1 } },
  }),
  Object.freeze({
    id: "craft_ephon_100",
    name: "Booster EPHON-100 (2h)",
    rarity: "legendary",
    costs: {
      credits: 500000000,
      resources: { rinusk: 10000, blacklight_trace: 10000, mindfire_cerebrum: 1500 },
    },
    output: { items: { booster_ephon: 1 } },
  }),
  Object.freeze({
    id: "craft_ticket_reroll",
    name: "Ticket relance module",
    rarity: "epic",
    costs: {
      credits: 125000000,
      resources: {},
    },
    output: { items: { ticket_module_reroll: 1 } },
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
