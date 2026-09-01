"use strict";

export const DEFAULT_MAP_ID = "1-1";

export const MAP_LOADERS = Object.freeze({
  alpha: () => import("../../maps/Alpha_map/Gate.js"),
  beta: () => import("../../maps/Beta_map/Gate.js"),
  gamma: () => import("../../maps/Gamma_map/Gate.js"),
  low: () => import("../../maps/Low_map/Gate.js"),
  qz: () => import("../../maps/Blighted_map/Gate.js"),
  "1-1": () => import("../../maps/1-1/Map.js"),
  "1-2": () => import("../../maps/1-2/Map.js"),
  "1-3": () => import("../../maps/1-3/Map.js"),
  "1-4": () => import("../../maps/1-4/Map.js"),
  "1-5": () => import("../../maps/1-5/Map.js"),
  "1-6": () => import("../../maps/1-6/Map.js"),
  "1-7": () => import("../../maps/1-7/Map.js"),
  "1-8": () => import("../../maps/1-8/Map.js"),
  "1-4.1": () => import("../../maps/1-4.1/Map.js"),
  "1-9": () => import("../../maps/1-9/Map.js"),
  "1-10": () => import("../../maps/1-10/Map.js"),
  "2-1": () => import("../../maps/2-1/Map.js"),
  "2-2": () => import("../../maps/2-2/Map.js"),
  "2-3": () => import("../../maps/2-3/Map.js"),
  "2-4": () => import("../../maps/2-4/Map.js"),
  "2-5": () => import("../../maps/2-5/Map.js"),
  "2-6": () => import("../../maps/2-6/Map.js"),
  "2-7": () => import("../../maps/2-7/Map.js"),
  "2-8": () => import("../../maps/2-8/Map.js"),
  "2-4.1": () => import("../../maps/2-4.1/Map.js"),
  "2-9": () => import("../../maps/2-9/Map.js"),
  "2-10": () => import("../../maps/2-10/Map.js"),
  "3-1": () => import("../../maps/3-1/Map.js"),
  "3-2": () => import("../../maps/3-2/Map.js"),
  "3-3": () => import("../../maps/3-3/Map.js"),
  "3-4": () => import("../../maps/3-4/Map.js"),
  "3-5": () => import("../../maps/3-5/Map.js"),
  "3-6": () => import("../../maps/3-6/Map.js"),
  "3-7": () => import("../../maps/3-7/Map.js"),
  "3-8": () => import("../../maps/3-8/Map.js"),
  "3-4.1": () => import("../../maps/3-4.1/Map.js"),
  "3-9": () => import("../../maps/3-9/Map.js"),
  "3-10": () => import("../../maps/3-10/Map.js"),
  "4-4.123": () => import("../../maps/4-4.123/Map.js"),
  "4-5": () => import("../../maps/4-5/Map.js"),
  "5-2": () => import("../../maps/5-2/Map.js"),
  "???": () => import("../../maps/Maudite/Map.js"),
});

export function normalizeMapId(value) {
  const id = String(value || "").trim().toLowerCase();
  return Object.hasOwn(MAP_LOADERS, id) ? id : DEFAULT_MAP_ID;
}

export function getMapLoader(value) {
  return MAP_LOADERS[normalizeMapId(value)];
}
