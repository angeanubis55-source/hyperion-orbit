"use strict";

import { CATALOG } from "../CORE/CATALOG.js";
import { getItemRarity } from "./ITEM_RARITIES.js";

export function rarityForCatalogItem(item) {
  const explicit = getItemRarity(item).id;
  if (explicit !== "common") return explicit;
  const price = Math.max(0, Number(item?.price || 0));
  if (price >= 500000000) return "legendary";
  if (price >= 50000000) return "epic";
  if (price >= 1000000) return "rare";
  return "common";
}

function resourceCostsForItem(item, rarity) {
  const price = Math.max(0, Number(item?.price || 0));
  const resources = {};
  const debrisDivisor = { common: 10000, rare: 25000, epic: 100000, legendary: 500000 }[rarity] || 10000;
  const debrisCap = { common: 500, rare: 1000, epic: 2500, legendary: 5000 }[rarity] || 500;
  resources.npc_debris = Math.min(debrisCap, Math.max(5, Math.ceil(price / debrisDivisor)));
  if (rarity === "common") resources.refined_component = Math.min(20, Math.max(1, 1 + Math.ceil(price / 100000)));
  if (rarity === "rare") resources.refined_component = Math.min(300, Math.max(5, 5 + Math.ceil(price / 2000000)));
  if (rarity === "epic") {
    resources.refined_component = Math.min(600, Math.max(15, 15 + Math.ceil(price / 5000000)));
    resources.hybrid_alloy = Math.min(50, Math.max(2, Math.ceil(price / 50000000)));
  }
  if (rarity === "legendary") {
    resources.refined_component = Math.min(1500, Math.max(50, 50 + Math.ceil(price / 10000000)));
    resources.hybrid_alloy = Math.min(100, Math.max(5, Math.ceil(price / 25000000)));
    resources.indoctrinated_oil = Math.min(10, Math.max(1, Math.ceil(price / 250000000)));
  }
  return resources;
}

function recipeFromCatalog(item) {
  const rarity = rarityForCatalogItem(item);
  const output = item?.ship?.id
    ? { ships: { [item.ship.id]: 1 } }
    : item?.drone?.type
      ? { drones: { [item.drone.type]: 1 } }
      : item?.formation?.id
        ? { formations: { [item.formation.id]: 1 } }
    : item?.give?.ammo
      ? { ammo: { ...item.give.ammo } }
      : { items: { [item.id]: 1 } };
  return Object.freeze({
    id: `craft_${item.id}`,
    catalogItemId: item.id,
    name: item.name,
    rarity,
    costs: {
      credits: Math.max(0, Math.round(Number(item.price || 0) * 0.2)),
      resources: resourceCostsForItem(item, rarity),
    },
    output,
  });
}

const catalogRecipes = Object.values(CATALOG)
  .flatMap(items => Array.isArray(items) ? items : [])
  .filter(item => item?.id)
  .map(recipeFromCatalog);

export const CRAFTING_RECIPES = Object.freeze([
  Object.freeze({
    id: "refine_debris",
    name: "Composants raffinés",
    rarity: "rare",
    costs: { credits: 25000, resources: { npc_debris: 200 } },
    output: { resources: { refined_component: 4 } },
  }),
  ...catalogRecipes,
]);

export function getCraftingRecipe(recipeId) {
  return CRAFTING_RECIPES.find(recipe => recipe.id === recipeId) || null;
}
