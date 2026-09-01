"use strict";

export const RESOURCE_TYPES = Object.freeze({
  npc_debris: Object.freeze({ id: "npc_debris", name: "Débris de NPC", plural: "Débris de NPC" }),
  hybrid_alloy: Object.freeze({ id: "hybrid_alloy", name: "Alliage hybride", plural: "Alliages hybrides" }),
  indoctrinated_oil: Object.freeze({ id: "indoctrinated_oil", name: "Huile indoctrinée", plural: "Huiles indoctrinées" }),
});

export function getResourceName(resourceId, quantity = 1) {
  const resource = RESOURCE_TYPES[resourceId];
  if (resource) return Number(quantity) > 1 ? resource.plural : resource.name;
  return String(resourceId || "Ressource")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
