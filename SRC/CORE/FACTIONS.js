"use strict";

export const DEFAULT_FACTION_ID = "mmo";

export const FACTIONS = Object.freeze({
  mmo: Object.freeze({ id: "mmo", name: "Mars Mining Operations", shortName: "MMO", sector: "1", imagePath: "ASSETS/FACTIONS/MMO.png", baseSpawn: Object.freeze({ x: 1500, y: 1500 }) }),
  eic: Object.freeze({ id: "eic", name: "Earth Industries Corporation", shortName: "EIC", sector: "2", imagePath: "ASSETS/FACTIONS/EIC.png", baseSpawn: Object.freeze({ x: 9500, y: 1500 }) }),
  vru: Object.freeze({ id: "vru", name: "Venus Resources Unlimited", shortName: "VRU", sector: "3", imagePath: "ASSETS/FACTIONS/VRU.png", baseSpawn: Object.freeze({ x: 9500, y: 5500 }) }),
});

export function normalizeFactionId(value, fallback = DEFAULT_FACTION_ID) {
  const id = String(value || "").trim().toLowerCase();
  return FACTIONS[id] ? id : fallback;
}

export function getFaction(value) {
  return FACTIONS[normalizeFactionId(value)];
}

export function getFactionHomeMap(value) {
  return `${getFaction(value).sector}-1`;
}

export function getFactionUpperBaseMap(value) {
  return `${getFaction(value).sector}-8`;
}

export function getFactionBaseSpawn(value) {
  const spawn = getFaction(value).baseSpawn;
  return { x: spawn.x, y: spawn.y };
}

export function resolveBaseCenter(zoneSafe, fallback = null) {
  const module = zoneSafe?.modules?.find(item => String(item?.id || "").startsWith("CENTRE_"));
  const x = Number(module?.x ?? fallback?.x);
  const y = Number(module?.y ?? fallback?.y);
  return {
    x: Number.isFinite(x) ? x : null,
    y: Number.isFinite(y) ? y : null,
  };
}

export function getFactionRespawnMap(value, currentMapId, { gate = false } = {}) {
  if (gate) return getFactionHomeMap(value);

  const match = String(currentMapId || "").trim().match(/^[123]-(\d+(?:\.\d+)?)$/);
  if (!match) return getFactionHomeMap(value);
  const zone = Number(match[1]);
  return zone <= 4.1 ? getFactionHomeMap(value) : getFactionUpperBaseMap(value);
}
