"use strict";

import { MAP_LOADERS } from "./mapRegistry.js";
import { NPC_TYPES } from "../data/npcTypes.js";

const GATE_MAPS = new Set(["alpha", "beta", "gamma", "low", "qz"]);
const SPECIAL_GATE_WAVES = Object.freeze({
  low: () => import("../../maps/Low_map/Waves.js"),
  qz: () => import("../../maps/Blighted_map/Waves.js"),
});
const WORLD_SAMPLE = Object.freeze({ w: 24000, h: 14000 });

function folderForMap(mapId) {
  return mapId === "???" ? "Maudite" : mapId;
}

export async function loadNpcLocationIndex() {
  const locations = {};
  const mapIds = Object.keys(MAP_LOADERS).filter(mapId => !GATE_MAPS.has(mapId));
  await Promise.all(mapIds.map(async mapId => {
    try {
      const folder = folderForMap(mapId);
      const module = await import(`../../maps/${folder}/Spawns.js`);
      if (typeof module.getZoneSpawns !== "function") return;
      const types = new Set();
      for (const spawn of module.getZoneSpawns(WORLD_SAMPLE) || []) {
        if (spawn?.type) types.add(String(spawn.type));
      }
      for (const type of types) {
        if (!locations[type]) locations[type] = [];
        locations[type].push(mapId);
      }
    } catch (error) {
      console.warn(`[Quêtes] Indexation impossible pour la carte ${mapId}`, error);
    }
  }));
  await Promise.all(Object.entries(SPECIAL_GATE_WAVES).map(async ([gateId, loader]) => {
    try {
      const module = await loader();
      const types = new Set([module.DEFAULT_WAVE_TYPE]);
      for (const wave of module.WAVE_PLANS || []) {
        for (const spawn of wave || []) if (spawn?.type) types.add(String(spawn.type));
      }
      for (const type of types) {
        if (!type) continue;
        if (!locations[type]) locations[type] = [];
        locations[type].push(`Gate ${gateId.toUpperCase()}`);
      }
    } catch (error) {
      console.warn(`[Quêtes] Indexation impossible pour la Gate ${gateId}`, error);
    }
  }));
  // Les NPC invoqués à la mort d'un parent héritent de ses emplacements.
  let propagated = true;
  while (propagated) {
    propagated = false;
    for (const [parentType, definition] of Object.entries(NPC_TYPES)) {
      const parentMaps = locations[parentType];
      if (!parentMaps?.length) continue;
      for (const child of definition?.onKill?.spawn || []) {
        if (!child?.type) continue;
        const merged = [...new Set([...(locations[child.type] || []), ...parentMaps])];
        if (merged.length !== (locations[child.type]?.length || 0)) {
          locations[child.type] = merged;
          propagated = true;
        }
      }
    }
  }
  for (const maps of Object.values(locations)) maps.sort((a, b) => a.localeCompare(b, "fr", { numeric: true }));
  return locations;
}
