"use strict";

export const RESOURCE_TYPES = Object.freeze({
  refined_component: Object.freeze({ id: "refined_component", name: "Composant raffiné", plural: "Composants raffinés", icon: "/ASSETS/CPU/NANO_CONDENSER_100X100.png" }),
  npc_debris: Object.freeze({ id: "npc_debris", name: "Débris de NPC", plural: "Débris de NPC", icon: "/ASSETS/CPU/MICRO_TRANSISTORS_100X100.png" }),
  hybrid_alloy: Object.freeze({ id: "hybrid_alloy", name: "Alliage hybride", plural: "Alliages hybrides", icon: "/ASSETS/CPU/PRISMATIC_SOCKET_100X100.png" }),
  indoctrinated_oil: Object.freeze({ id: "indoctrinated_oil", name: "Huile indoctrinée", plural: "Huiles indoctrinées", icon: "/ASSETS/CPU/RLLB_X_100X100.png" }),
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
