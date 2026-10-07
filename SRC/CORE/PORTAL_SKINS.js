"use strict";

import { normalizeMapId } from "./MAP_REGISTRY.js";

// ============================================================================
// FICHIER CENTRAL DES PORTAILS — seul endroit qui décrit les skins de portails.
// ============================================================================
// Règle : chaque portail affiche le skin de sa map de DESTINATION.
//   Ex : en 1-1 le portail vers 1-2 utilise NORMAUX/1-2,
//        et en 1-2 le retour vers 1-1 utilise NORMAUX/1-1.
// Les vieux PVP_PORTAL (rouge) et PORTAL_JUMP_RED ne sont PAS utilisés
// (ni référencés) : les maps battle 4-1..4-4 utilisent BATTLE/4-x.
// Tous les autres assets portails du jeu sont conservés et centralisés ici :
//   ASSETS/PORTAL/NORMAUX|BATTLE|BL|QZ, ALPHA|BETA|GAMMA|PIRATES_PORTAL,
//   STANDARD_PORTAL (fallback), PORTAL_JUMP (fx), PORTAL_JUMP_BUTTON.
// Maps sans skin dédié (low, 4-5 hors pirates, MAUDITE...) -> null,
// le moteur retombe sur STANDARD_PORTAL (conservé en fallback).
const SKIN_DIR_BY_MAP = (() => {
  const m = new Map();
  for (const id of [
    "1-1", "1-2", "1-3", "1-4", "1-5", "1-6", "1-7", "1-8",
    "2-1", "2-2", "2-3", "2-4", "2-5", "2-6", "2-7", "2-8",
    "3-1", "3-2", "3-3", "3-4", "3-5", "3-6", "3-7", "3-8",
  ]) m.set(id, `NORMAUX/${id}`);
  for (const id of ["4-1", "4-2", "4-3", "4-4", "4-5"]) m.set(id, `BATTLE/${id}`);
  m.set("1-BL", "BL/1BL");
  m.set("2-BL", "BL/2BL");
  m.set("3-BL", "BL/3BL");
  m.set("qz", "QZ/QZ");
  return m;
})();

const JUMP_FX_BY_CATEGORY = Object.freeze({
  // Portails normaux : anim de saut du jeu (dossier PORTAL_JUMP conservé).
  NORMAUX: "ASSETS/PORTAL_JUMP/",
  BATTLE: "ASSETS/PORTAL/BATTLE/JUMP/",
  BL: "ASSETS/PORTAL/BL/JUMP/",
  QZ: "ASSETS/PORTAL/QZ/JUMP/",
});

// Skins des portails spéciaux (assets conservés, tailles d'origine du jeu).
// Branchés sur la destination : alpha/beta/gamma/delta/epsilon + pirates (5-2 <-> 4-5).
const SPECIAL_SKINS = Object.freeze({
  alpha: Object.freeze({
    idle: { src: "ASSETS/ALPHA_PORTAL/DESACTIVE.png", w: 500, h: 500, yOff: 0 },
    open: { src: "ASSETS/ALPHA_PORTAL/ACTIVE.png", w: 500, h: 500, yOff: 0 },
    jump: { src: "ASSETS/ALPHA_PORTAL/JUMP.png", w: 500, h: 500, yOff: 0, scale: 1, spinSpeed: 0, alpha: 1 },
    jumpFxPath: null,
  }),
  beta: Object.freeze({
    idle: { src: "ASSETS/BETA_PORTAL/DESACTIVE.png", w: 437, h: 456, yOff: 0 },
    open: { src: "ASSETS/BETA_PORTAL/ACTIVE.png", w: 437, h: 456, yOff: 0 },
    jump: { src: "ASSETS/BETA_PORTAL/JUMP.png", w: 437, h: 456, yOff: 0, scale: 1, spinSpeed: 0, alpha: 1 },
    jumpFxPath: null,
  }),
  gamma: Object.freeze({
    idle: { src: "ASSETS/GAMMA_PORTAL/DESACTIVE.png", w: 360, h: 421, yOff: 0 },
    open: { src: "ASSETS/GAMMA_PORTAL/ACTIVE.png", w: 360, h: 421, yOff: 0 },
    jump: { src: "ASSETS/GAMMA_PORTAL/JUMP.png", w: 360, h: 421, yOff: 0, scale: 1, spinSpeed: 0, alpha: 1 },
    jumpFxPath: null,
  }),
  delta: Object.freeze({
    idle: { src: "ASSETS/DELTA_PORTAL/DESACTIVE.png", w: 400, h: 560, yOff: 0 },
    open: { src: "ASSETS/DELTA_PORTAL/ACTIVE.png", w: 400, h: 560, yOff: 0 },
    jump: { src: "ASSETS/DELTA_PORTAL/JUMP.png", w: 400, h: 560, yOff: 0, scale: 1, spinSpeed: 0, alpha: 1 },
    jumpFxPath: null,
  }),
  epsilon: Object.freeze({
    idle: { src: "ASSETS/EPSILON_PORTAL/DESACTIVE.png", w: 406, h: 474, yOff: 0 },
    open: { src: "ASSETS/EPSILON_PORTAL/ACTIVE.png", w: 406, h: 474, yOff: 0 },
    jump: { src: "ASSETS/EPSILON_PORTAL/JUMP.png", w: 406, h: 474, yOff: 0, scale: 1, spinSpeed: 0, alpha: 1 },
    jumpFxPath: null,
  }),
  pirates: Object.freeze({
    idle: { src: "ASSETS/PIRATES_PORTAL/DESACTIVE.png", w: 362, h: 387, yOff: 0 },
    open: { src: "ASSETS/PIRATES_PORTAL/ACTIVE.png", w: 362, h: 387, yOff: 0 },
    jump: { src: "ASSETS/PIRATES_PORTAL/JUMP.png", w: 362, h: 387, yOff: 0, scale: 1, spinSpeed: 0, alpha: 1 },
    jumpFxPath: null,
  }),
});

// Destination utilisant le skin pirates : le portail vers 5-2.
// (les sprites pirates explicites déjà présents dans SPAWNS.js sont conservés
//  tels quels et restent prioritaires ; 4-5 garde son fallback standard.)
const PIRATES_DESTINATIONS = Object.freeze(["5-2"]);

// Fallback : portail standard du jeu (conservé).
export const STANDARD_PORTAL_SKIN = Object.freeze({
  idle: { src: "ASSETS/STANDARD_PORTAL/DESACTIVE.png", w: 320, h: 320, yOff: 0 },
  open: { src: "ASSETS/STANDARD_PORTAL/ACTIVE.png", w: 320, h: 320, yOff: 0 },
  jump: { src: "ASSETS/STANDARD_PORTAL/JUMP.png", w: 320, h: 320, yOff: 0, scale: 1, spinSpeed: 0, alpha: 1 },
});

// Animation de saut par défaut (conservée).
export const DEFAULT_PORTAL_JUMP_FX = Object.freeze({
  path: "ASSETS/PORTAL_JUMP/",
  frames: 25,
  firstNumber: 1,
  ext: ".png",
  fps: 40,
  w: 320,
  h: 320,
  scale: 1,
  xOff: 0,
  yOff: 0,
  alpha: 1,
  loop: true,
  spinSpeed: 0,
});

// Bouton de saut par défaut (conservé).
export const DEFAULT_PORTAL_JUMP_BUTTON = Object.freeze({
  idle: Object.freeze({ src: "ASSETS/PORTAL_JUMP_BUTTON/NOTHING.png" }),
  mouse: Object.freeze({ src: "ASSETS/PORTAL_JUMP_BUTTON/POINTED.png" }),
  click: Object.freeze({ src: "ASSETS/PORTAL_JUMP_BUTTON/CLICKED.png" }),
  w: 88,
  h: 135,
  xOff: -10,
  yOff: -250,
  alpha: 1,
  requireNear: true,
});

export function getPortalSkinForMap(toMap) {
  const id = normalizeMapId(toMap);
  const lower = String(id || "").toLowerCase();
  // Portails spéciaux d'abord (galaxy gates + pirates).
  if (lower === "alpha") return SPECIAL_SKINS.alpha;
  if (lower === "beta") return SPECIAL_SKINS.beta;
  if (lower === "gamma") return SPECIAL_SKINS.gamma;
  if (lower === "delta") return SPECIAL_SKINS.delta;
  if (lower === "epsilon") return SPECIAL_SKINS.epsilon;
  if (PIRATES_DESTINATIONS.includes(lower)) return SPECIAL_SKINS.pirates;
  // Portails par map : NORMAUX / BATTLE / BL / QZ.
  const dir = SKIN_DIR_BY_MAP.get(id);
  if (!dir) return null;
  const category = String(dir).split("/")[0];
  return {
    idle: { src: `ASSETS/PORTAL/${dir}/DESACTIVE.png`, w: 320, h: 320, yOff: 0 },
    open: { src: `ASSETS/PORTAL/${dir}/ACTIVE.png`, w: 320, h: 320, yOff: 0 },
    jump: { src: `ASSETS/PORTAL/${dir}/JUMP.png`, w: 320, h: 320, yOff: 0, scale: 1, spinSpeed: 0, alpha: 1 },
    jumpFxPath: JUMP_FX_BY_CATEGORY[category] || null,
  };
}
