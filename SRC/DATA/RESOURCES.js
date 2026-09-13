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

export const ORE_RESOURCE_IDS = Object.freeze(["palladium", "prometium", "endurium", "terbium", "prometid", "duranium", "promerium", "seprom", "xenomit"]);

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

// Ajout plafonné par la soute. Les ressources non-minerais (atelier) ne passent pas par la soute.
export function cargoAdd(resources, resourceId, amount) {
  const wanted = Math.max(0, Math.floor(Number(amount) || 0));
  if (wanted <= 0) return { added: 0, blocked: 0, full: cargoFree(resources) <= 0 };
  if (!isOreResource(resourceId)) return { added: wanted, blocked: 0, full: false };
  const free = cargoFree(resources);
  const added = Math.min(wanted, free);
  return { added, blocked: wanted - added, full: free <= 0 };
}
