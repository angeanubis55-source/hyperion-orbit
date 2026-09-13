"use strict";

export const RESOURCE_TYPES = Object.freeze({
  refined_component: Object.freeze({ id: "refined_component", name: "Composant raffiné", plural: "Composants raffinés", icon: "/ASSETS/CPU/NANO_CONDENSER_100X100.png" }),
  npc_debris: Object.freeze({ id: "npc_debris", name: "Débris de NPC", plural: "Débris de NPC", icon: "/ASSETS/CPU/MICRO_TRANSISTORS_100X100.png" }),
  hybrid_alloy: Object.freeze({ id: "hybrid_alloy", name: "Alliage hybride", plural: "Alliages hybrides", icon: "/ASSETS/CPU/PRISMATIC_SOCKET_100X100.png" }),
  indoctrinated_oil: Object.freeze({ id: "indoctrinated_oil", name: "Huile indoctrinée", plural: "Huiles indoctrinées", icon: "/ASSETS/CPU/RLLB_X_100X100.png" }),
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
