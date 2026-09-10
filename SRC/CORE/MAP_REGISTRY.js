"use strict";

export const DEFAULT_MAP_ID = "1-1";

export const MAP_LOADERS = Object.freeze({
  alpha: () => import("../../MAPS/ALPHA_MAP/GATE.js"),
  beta: () => import("../../MAPS/BETA_MAP/GATE.js"),
  gamma: () => import("../../MAPS/GAMMA_MAP/GATE.js"),
  low: () => import("../../MAPS/LOW_MAP/GATE.js"),
  qz: () => import("../../MAPS/BLIGHTED_MAP/GATE.js"),
  "1-1": () => import("../../MAPS/1-1/MAP.js"),
  "1-2": () => import("../../MAPS/1-2/MAP.js"),
  "1-3": () => import("../../MAPS/1-3/MAP.js"),
  "1-4": () => import("../../MAPS/1-4/MAP.js"),
  "1-5": () => import("../../MAPS/1-5/MAP.js"),
  "1-6": () => import("../../MAPS/1-6/MAP.js"),
  "1-7": () => import("../../MAPS/1-7/MAP.js"),
  "1-8": () => import("../../MAPS/1-8/MAP.js"),
  "1-4.1": () => import("../../MAPS/1-4.1/MAP.js"),
  "1-9": () => import("../../MAPS/1-9/MAP.js"),
  "1-10": () => import("../../MAPS/1-10/MAP.js"),
  "2-1": () => import("../../MAPS/2-1/MAP.js"),
  "2-2": () => import("../../MAPS/2-2/MAP.js"),
  "2-3": () => import("../../MAPS/2-3/MAP.js"),
  "2-4": () => import("../../MAPS/2-4/MAP.js"),
  "2-5": () => import("../../MAPS/2-5/MAP.js"),
  "2-6": () => import("../../MAPS/2-6/MAP.js"),
  "2-7": () => import("../../MAPS/2-7/MAP.js"),
  "2-8": () => import("../../MAPS/2-8/MAP.js"),
  "2-4.1": () => import("../../MAPS/2-4.1/MAP.js"),
  "2-9": () => import("../../MAPS/2-9/MAP.js"),
  "2-10": () => import("../../MAPS/2-10/MAP.js"),
  "3-1": () => import("../../MAPS/3-1/MAP.js"),
  "3-2": () => import("../../MAPS/3-2/MAP.js"),
  "3-3": () => import("../../MAPS/3-3/MAP.js"),
  "3-4": () => import("../../MAPS/3-4/MAP.js"),
  "3-5": () => import("../../MAPS/3-5/MAP.js"),
  "3-6": () => import("../../MAPS/3-6/MAP.js"),
  "3-7": () => import("../../MAPS/3-7/MAP.js"),
  "3-8": () => import("../../MAPS/3-8/MAP.js"),
  "3-4.1": () => import("../../MAPS/3-4.1/MAP.js"),
  "3-9": () => import("../../MAPS/3-9/MAP.js"),
  "3-10": () => import("../../MAPS/3-10/MAP.js"),
  "4-4.123": () => import("../../MAPS/4-4.123/MAP.js"),
  "4-5": () => import("../../MAPS/4-5/MAP.js"),
  "5-2": () => import("../../MAPS/5-2/MAP.js"),
  "MAUDITE": () => import("../../MAPS/MAUDITE/MAP.js"),
});

const MAP_IDS_BY_LOWERCASE = new Map(Object.keys(MAP_LOADERS).map(id => [id.toLowerCase(), id]));

export function normalizeMapId(value) {
  const id = String(value || "").trim().toLowerCase();
  if (id === "???") return "MAUDITE";
  return MAP_IDS_BY_LOWERCASE.get(id) || DEFAULT_MAP_ID;
}

export function getMapLoader(value) {
  return MAP_LOADERS[normalizeMapId(value)];
}
