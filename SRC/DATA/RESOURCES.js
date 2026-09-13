"use strict";

export const RESOURCE_TYPES = Object.freeze({
  refined_component: Object.freeze({ id: "refined_component", name: "Composant raffiné", plural: "Composants raffinés", icon: "/ASSETS/ORES/REFINED_COMPONENT.png" }),
  npc_debris: Object.freeze({ id: "npc_debris", name: "Débris de NPC", plural: "Débris de NPC", icon: "/ASSETS/ORES/NPC_DEBRIS.png" }),
  hybrid_alloy: Object.freeze({ id: "hybrid_alloy", name: "Alliage hybride", plural: "Alliages hybrides", icon: "/ASSETS/ORES/HYBRID_ALLOY.png" }),
  indoctrinated_oil: Object.freeze({ id: "indoctrinated_oil", name: "Huile indoctrine", plural: "Huiles indoctrines", icon: "/ASSETS/ORES/INDOCTRINATED_OIL.png" }),
  palladium: Object.freeze({ id: "palladium", name: "Palladium", plural: "Palladium", icon: "/ASSETS/ORES/PALLADIUM.png" }),
  prometium: Object.freeze({ id: "prometium", name: "Prometium", plural: "Prometium", icon: "/ASSETS/ORES/PROMETIUM.png" }),
  endurium: Object.freeze({ id: "endurium", name: "Endurium", plural: "Endurium", icon: "/ASSETS/ORES/ENDURIUM.png" }),
  terbium: Object.freeze({ id: "terbium", name: "Terbium", plural: "Terbium", icon: "/ASSETS/ORES/TERBIUM.png" }),
  prometid: Object.freeze({ id: "prometid", name: "Prometid", plural: "Prometid", icon: "/ASSETS/ORES/PROMETID.png" }),
  duranium: Object.freeze({ id: "duranium", name: "Duranium", plural: "Duranium", icon: "/ASSETS/ORES/DURANIUM.png" }),
  promerium: Object.freeze({ id: "promerium", name: "Promerium", plural: "Promerium", icon: "/ASSETS/ORES/PROMERIUM.png" }),
  seprom: Object.freeze({ id: "seprom", name: "Seprom", plural: "Seprom", icon: "/ASSETS/ORES/SEPROM.png" }),
  xenomit: Object.freeze({ id: "xenomit", name: "Xenomit", plural: "Xenomit", icon: "/ASSETS/ORES/XENOMIT.png" }),
  osmium: Object.freeze({ id: "osmium", name: "Osmium", plural: "Osmium", icon: "/ASSETS/ORES/OSMIUM.png" }),
  // Ressources d'assemblage (drops NPC officiels) : atelier, hors soute des 3000.
  scrap: Object.freeze({ id: "scrap", name: "Scrap", plural: "Scrap", icon: "/ASSETS/ORES/SCRAP.png" }),
  mucosum: Object.freeze({ id: "mucosum", name: "Mucosum", plural: "Mucosum", icon: "/ASSETS/ORES/MUCOSUM.png" }),
  plasmide: Object.freeze({ id: "plasmide", name: "Plasmide", plural: "Plasmide", icon: "/ASSETS/ORES/PLASMIDE.png" }),
  prismatium: Object.freeze({ id: "prismatium", name: "Prismatium", plural: "Prismatium", icon: "/ASSETS/ORES/PRISMATIUM.png" }),
  aurus: Object.freeze({ id: "aurus", name: "Aurus", plural: "Aurus", icon: "/ASSETS/ORES/AURUS.png" }),
  bifenon: Object.freeze({ id: "bifenon", name: "Bifenon", plural: "Bifenon", icon: "/ASSETS/ORES/BIFENON.png" }),
  tetrathrin: Object.freeze({ id: "tetrathrin", name: "Tetrathrin", plural: "Tetrathrin", icon: "/ASSETS/ORES/TETRATHRIN.png" }),
  kyhalon: Object.freeze({ id: "kyhalon", name: "Kyhalon", plural: "Kyhalon", icon: "/ASSETS/ORES/KYHALON.png" }),
  rinusk: Object.freeze({ id: "rinusk", name: "Rinusk", plural: "Rinusk", icon: "/ASSETS/ORES/RINUSK.png" }),
  blacklight_trace: Object.freeze({ id: "blacklight_trace", name: "Trace Blacklight", plural: "Traces Blacklight", icon: "/ASSETS/ORES/BLACKLIGHT_TRACE.png" }),
  mindfire_cerebrum: Object.freeze({ id: "mindfire_cerebrum", name: "Cerebrum", plural: "Cerebrums", icon: "/ASSETS/ORES/MINDFIRE_CEREBRUM.png" }),
});

export function getResourceName(resourceId, quantity = 1) {
  const resource = RESOURCE_TYPES[resourceId];
  if (resource) return Number(quantity) > 1 ? resource.plural : resource.name;
  return String(resourceId || "Ressource")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function getResourceIcon(resourceId) {
  return RESOURCE_TYPES[resourceId]?.icon || "/ASSETS/CPU/MICRO_TRANSISTORS_100X100.png";
}

// Soute du vaisseau : capacité 3000, occupée par les minerais.
export const CARGO_CAPACITY = 3000;

export const ORE_RESOURCE_IDS = Object.freeze(["palladium", "prometium", "endurium", "terbium", "prometid", "duranium", "promerium", "seprom", "osmium"]);

export function isOreResource(resourceId) {
  return ORE_RESOURCE_IDS.includes(String(resourceId || ""));
}

export function cargoUsed(resources) {
  if (!resources || typeof resources !== "object") return 0;
  let used = 0;
  for (const id of ORE_RESOURCE_IDS) used += Math.max(0, Math.floor(Number(resources[id]) || 0));
  return used;
}

export function cargoFree(resources, capacity = CARGO_CAPACITY) {
  return Math.max(0, Math.floor(Number(capacity) || 0) - cargoUsed(resources));
}

// Prix de vente fixes au comptoir pirate (crédits / unité). Palladium = échange uniquement, Xenomit = invendable.
export const ORE_SELL_PRICES = Object.freeze({
  prometium: 20,
  endurium: 30,
  terbium: 50,
  prometid: 100,
  duranium: 150,
  promerium: 500,
  seprom: 750,
  osmium: 100000,
});

// Améliorations d'équipement (onglet Upgrade du vrai DO) : minerai chargé = bonus.
// Charge = 100 unités. Lasers/roquettes : 1/salve. Bouclier/vitesse : 1/60 s.
export const UPGRADE_CHARGE_COST = 100;

export const UPGRADE_SLOTS = Object.freeze([
  Object.freeze({ id: "laser", name: "Dégâts lasers", unit: "tirs", icon: "/ASSETS/LASERS/lf_3_100x100.png", help: "Charge un minerai sur les lasers : +dégâts à chaque tir. 1 minerai = 10 tirs. Prometid +15 %, Promerium +30 %, Seprom +60 %, Osmium +50 %." }),
  Object.freeze({ id: "rocket", name: "Dégâts roquettes", unit: "tirs", icon: "/COMBAT/ROCKET_SPRITES/PLT-3030_100X100.png", help: "Charge un minerai sur les roquettes : +dégâts par roquette. 1 minerai = 10 tirs. Prometid +15 %, Promerium +30 %, Seprom +60 %, Osmium +50 %." }),
  Object.freeze({ id: "speed", name: "Vitesse", unit: "min", icon: "/ASSETS/ITEMS/G3N-7900.png", help: "Charge un minerai sur les générateurs de vitesse. 1 minerai = 10 minutes. Duranium +10 %, Promerium +20 %." }),
  Object.freeze({ id: "shield", name: "Bouclier", unit: "min", icon: "/ASSETS/ITEMS/SG3N-B03.png", help: "Charge un minerai sur les générateurs de bouclier. 1 minerai = 10 minutes. Duranium +10 %, Promerium +20 %, Seprom +40 %, Osmium +50 %." }),
]);

export const UPGRADE_SLOT_ORES = Object.freeze({
  laser: Object.freeze(["prometid", "promerium", "seprom", "osmium"]),
  rocket: Object.freeze(["prometid", "promerium", "seprom", "osmium"]),
  speed: Object.freeze(["duranium", "promerium"]),
  shield: Object.freeze(["duranium", "promerium", "seprom", "osmium"]),
});

export const UPGRADE_ORE_BONUS = Object.freeze({
  prometid: Object.freeze({ laser: 0.15, rocket: 0.15 }),
  duranium: Object.freeze({ speed: 0.10, shield: 0.10 }),
  promerium: Object.freeze({ laser: 0.30, rocket: 0.30, speed: 0.20, shield: 0.20 }),
  seprom: Object.freeze({ laser: 0.60, rocket: 0.60, shield: 0.40 }),
  osmium: Object.freeze({ laser: 0.50, rocket: 0.50, shield: 0.50 }),
});

// Raffinage officiel (ratios du client d'origine) : minerais bruts -> minerais nobles.
export const REFINERY_RECIPES = Object.freeze([
  Object.freeze({ id: "prometid", name: "Prometid", inputs: Object.freeze({ prometium: 20, endurium: 10 }), output: Object.freeze({ id: "prometid", amount: 1 }) }),
  Object.freeze({ id: "duranium", name: "Duranium", inputs: Object.freeze({ endurium: 10, terbium: 20 }), output: Object.freeze({ id: "duranium", amount: 1 }) }),
  Object.freeze({ id: "promerium", name: "Promerium", inputs: Object.freeze({ prometid: 10, duranium: 10, xenomit: 1 }), output: Object.freeze({ id: "promerium", amount: 1 }) }),
  Object.freeze({ id: "seprom", name: "Seprom", inputs: Object.freeze({ promerium: 10 }), output: Object.freeze({ id: "seprom", amount: 1 }) }),
  Object.freeze({ id: "osmium", name: "Osmium", inputs: Object.freeze({ seprom: 100 }), output: Object.freeze({ id: "osmium", amount: 1 }) }),
  Object.freeze({ id: "xenomit", name: "Xenomit", inputs: Object.freeze({ prometid: 100, duranium: 100 }), output: Object.freeze({ id: "xenomit", amount: 10 }) }),
]);

export function getRefineryRecipe(recipeId) {
  return REFINERY_RECIPES.find((recipe) => recipe.id === String(recipeId || "")) || null;
}

// Calcul pur : quantités raffinables avec le stock donné.
export function refineOreOutput(resources, recipe, quantity = 1) {
  const wanted = Math.max(1, Math.floor(Number(quantity) || 1));
  const stock = resources && typeof resources === "object" ? resources : {};
  let possible = wanted;
  for (const [id, perUnit] of Object.entries(recipe?.inputs || {})) {
    const need = Math.max(1, Math.floor(Number(perUnit) || 0));
    possible = Math.min(possible, Math.floor(Math.max(0, Number(stock[id]) || 0) / need));
  }
  return { quantity: Math.max(0, possible), gained: Math.max(0, possible) * Math.max(1, Number(recipe?.output?.amount) || 1) };
}

// Ajout plafonné par la soute. Les ressources non-minerais (atelier) ne passent pas par la soute.
export function cargoAdd(resources, resourceId, amount) {
  const wanted = Math.max(0, Math.floor(Number(amount) || 0));
  if (wanted <= 0) return { added: 0, blocked: 0, full: cargoFree(resources) <= 0 };
  if (!isOreResource(resourceId)) return { added: wanted, blocked: 0, full: false };
  const free = cargoFree(resources);
  const added = Math.min(wanted, free);
  return { added, blocked: wanted - added, full: free <= 0 };
}
