"use strict";

// SRC/DATA/BATTLESTATION.js — Base de Combat (test visuel sur 1-3).
// Hub + 9 slots en anneau. Sprites affichés 1:1 (tailles natives mesurées) :
// modules 210x210, hub 350x350, frames laser 210x210, attaque roquette 200x178.

export const STATION_HUB = Object.freeze({
  resourceId: "station_core",
  name: "Cœur de base",
  src: "ASSETS/BATTLESTATION/CENTRE.png",
  w: 350,
  h: 350,
});

// Valeurs niveau 1 de la CBS officielle, x3. Le cœur cumule la coque et le
// déflecteur (80 % de la coque après le rééquilibrage officiel).
export const STATION_MODULE_HP = 4_680_000;
export const STATION_HULL_HP = 17_550_000;
export const STATION_DEFLECTOR_HP = 14_040_000;
export const STATION_CORE_HP = STATION_HULL_HP + STATION_DEFLECTOR_HP;

// Base vide (astéroïde non conquis) : affichée tant que le hub n'est pas posé.
export const STATION_EMPTY_BASE = Object.freeze({
  resourceId: null,
  name: "Base vide",
  src: "ASSETS/BATTLESTATION/CAILLOUX VIDE.png",
  w: 325,
  h: 334,
});

// Les 9 emplacements autour du hub (départ en haut, sens horaire).
// Les modules s'y posent à la construction (voir slots dans STATION.js).
export const STATION_SLOT_IDS = Object.freeze([
  "emplacement1",
  "emplacement2",
  "emplacement3",
  "emplacement4",
  "emplacement5",
  "emplacement6",
  "emplacement7",
  "emplacement8",
  "emplacement9",
]);

// Sprites par module : src = frame de repos, frames = animation idle (lasers),
// attack = animation de tir (roquettes, câblée plus tard au combat).
export const STATION_MODULE_SPRITES = Object.freeze({
  station_laser_1: Object.freeze({ src: "ASSETS/BATTLESTATION/LASER_STATION_NIV_1.png", w: 210, h: 210, frames: Object.freeze(["ASSETS/BATTLESTATION/LASER_STATION_NIV_1/1.png", "ASSETS/BATTLESTATION/LASER_STATION_NIV_1/2.png"]) }),
  station_laser_2: Object.freeze({ src: "ASSETS/BATTLESTATION/LASER_STATION_NIV_2.png", w: 210, h: 210, frames: Object.freeze(["ASSETS/BATTLESTATION/LASER_STATION_NIV_2/1.png", "ASSETS/BATTLESTATION/LASER_STATION_NIV_2/2.png"]) }),
  station_laser_3: Object.freeze({ src: "ASSETS/BATTLESTATION/LASER_STATION_NIV_3.png", w: 210, h: 210, frames: Object.freeze(["ASSETS/BATTLESTATION/LASER_STATION_NIV_3/1.png", "ASSETS/BATTLESTATION/LASER_STATION_NIV_3/2.png"]) }),
  station_rocket_1: Object.freeze({ src: "ASSETS/BATTLESTATION/ROQUETTE_STATION_NIV_1.png", w: 210, h: 210, attack: Object.freeze(["ASSETS/BATTLESTATION/ROQUETTE_ANIMATION_ATTAQUE/0.png", "ASSETS/BATTLESTATION/ROQUETTE_ANIMATION_ATTAQUE/1.png"]), attackW: 200, attackH: 178 }),
  station_rocket_2: Object.freeze({ src: "ASSETS/BATTLESTATION/ROQUETTE_STATION_NIV_2.png", w: 210, h: 210, attack: Object.freeze(["ASSETS/BATTLESTATION/ROQUETTE_ANIMATION_ATTAQUE/0.png", "ASSETS/BATTLESTATION/ROQUETTE_ANIMATION_ATTAQUE/1.png"]), attackW: 200, attackH: 178 }),
  station_module_dmg: Object.freeze({ src: "ASSETS/BATTLESTATION/MODULE_DMG.png", w: 210, h: 210 }),
  station_module_exp: Object.freeze({ src: "ASSETS/BATTLESTATION/MODULE_EXP.png", w: 210, h: 210 }),
  station_module_hon: Object.freeze({ src: "ASSETS/BATTLESTATION/MODULE_HON.png", w: 210, h: 210 }),
  station_module_rep: Object.freeze({ src: "ASSETS/BATTLESTATION/MODULE_REP.png", w: 210, h: 210 }),
});

// Anneau des slots : rayon 430 (hub 350 + module 210 sans chevauchement).
const STATION_RING_R = 430;
const STATION_RING_N = STATION_SLOT_IDS.length;
export const STATION_SLOT_OFFSETS = Object.freeze(
  STATION_SLOT_IDS.map((_, i) => {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / STATION_RING_N;
    return Object.freeze({
      x: Math.round(Math.cos(angle) * STATION_RING_R),
      y: Math.round(Math.sin(angle) * STATION_RING_R),
    });
  })
);

// Déflecteur : +3 s de bouclier par seconde de charge, bouclier déclenché
// à 90 min cumulées. Bouton = COUPURE 30 min uniquement (pas d'activation
// manuelle) : pendant la coupure le cumul est gelé et aucun bouclier ne se
// déclenche ; à la fin, le cycle reprend où il en était. Couper en plein
// bouclier rend le temps restant à la banque.
// Cœur + modules invincibles sous bouclier, destructibles sinon.
export const STATION_DEFLECT_RATE = 3;
export const STATION_DEFLECT_COST = 90 * 60;
export const STATION_DEFLECT_OFF_MS = 30 * 60 * 1000;

// Modules uniques : un seul exemplaire de chaque par station
// (comme les boosters officiels). Lasers et roquettes : cumulables.
export const STATION_UNIQUE_MODULES = Object.freeze([
  "station_module_dmg",
  "station_module_exp",
  "station_module_hon",
  "station_module_rep",
]);

// Défense de la base : chaque module laser/roquette tire seul sur les
// ennemis (joueurs hostiles non camouflés) à sa portée. Dégâts par tir,
// cadence par module. Le Cœur ne tire pas.
export const STATION_WEAPON_STATS = Object.freeze({
  station_laser_1: Object.freeze({ kind: "laser", range: 750, dmg: 25000, periodMs: 1000 }),
  station_laser_2: Object.freeze({ kind: "laser", range: 950, dmg: 30000, periodMs: 1000 }),
  station_laser_3: Object.freeze({ kind: "laser", range: 950, dmg: 35000, periodMs: 1000 }),
  station_rocket_1: Object.freeze({ kind: "rocket", range: 950, dmg: 75000, periodMs: 3000 }),
  station_rocket_2: Object.freeze({ kind: "rocket", range: 950, dmg: 85000, periodMs: 3000 }),
});

// Durée d'installation d'un module (comme l'officiel) : 60 s avec
// compte à rebours circulaire dans la fenêtre.
export const STATION_INSTALL_CD_SEC = 60;

// Couleurs de l'anneau de propriété (vue + minimap) :
// vert = à nous (notre clan, allié), jaune = NAP,
// rouge = ennemie (autre firme ou clan en guerre), bleu = amie
// (même firme, pas en guerre), gris = vide.
export const STATION_RING_COLORS = Object.freeze({
  own: "#35d957",
  nap: "#ffd60a",
  enemy: "#ff3b57",
  friendly: "#3b9dff",
  empty: "#9aa3ad",
});
// Emplacement détruit : 59 frames jouées à la destruction d'un module,
// puis la dernière frame reste (cratère) tant que l'emplacement est vide.
export const STATION_DESTROYED_SPOT = Object.freeze({
  w: 210,
  h: 210,
  frameMs: 40,
  frames: Object.freeze(
    Array.from({ length: 59 }, (_, i) => `ASSETS/BATTLESTATION/EMPLACEMENT_DETRUIT/${i + 1}.png`)
  ),
});
export const STATION_PRELOAD_SRCS = Object.freeze([
  STATION_HUB.src,
  STATION_EMPTY_BASE.src,
  ...STATION_DESTROYED_SPOT.frames,
  ...Object.keys(STATION_MODULE_SPRITES).flatMap((id) => {
    const def = STATION_MODULE_SPRITES[id] || {};
    return [def.src, ...(def.frames || [])];
  }),
]);
