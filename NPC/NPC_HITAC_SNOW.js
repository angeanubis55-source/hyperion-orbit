// NPC/NPC_HITAC_SNOW.js — Micro-event « Hitac enneigée » (1 semaine).
// Du lundi 23/11/2026 00h01 au dimanche 29/11/2026 23h59 (heure de Paris) :
// un Hitac givré, escorté de 6 Hitac-Minion givrés (de chaque côté
// du bout de ses 3 bras), qui le suivent en formation.
// Comme l'UFONIT : 1 seul à la fois, sur une map tirée au hasard parmi
// 4-1 / 4-2 / 4-3, à une position aléatoire ; à sa mort il réapparaît
// aussitôt sur une autre map (contrôleur itinérant, NPC_ROOM.js).
// Pur (aucun DOM) : importable côté serveur et côté client.

import { winterParisTime } from "./NPC_WINTER.js";

// Test : true = event actif tout de suite, quelle que soit la date.
// À repasser à false une fois le visuel validé.
export const HITAC_SNOW_FORCE = true;
// Test : croix au centre du sprite + cadre du sprite sur le Hitac et les minions.
export const HITAC_SNOW_DEBUG_CENTER = false;

export const HITAC_SNOW_EVENT = "hitac_snow";
export const HITAC_SNOW_TYPE = "npc_Hitac_Frost";
export const HITAC_SNOW_MINION_TYPE = "npc_Hitac_Minion_Frost";
export const HITAC_SNOW_MAPS = Object.freeze(["4-1", "4-2", "4-3"]);
export const HITAC_SNOW_START = winterParisTime(2026, 10, 23, 0, 1);
export const HITAC_SNOW_END = winterParisTime(2026, 10, 29, 23, 59, 59);

// Agrandissement du groupe (Hitac, minions, écarts) par rapport à la
// capture de référence : x1,25 = minion à la taille du SWF givré (112x100).
export const HITAC_SNOW_SCALE = 1.25;

// Escorte relevée au pixel près sur la capture de référence (Hitac 400x355
// décalé de 4 px, minions 90x80 retrouvés par corrélation d'image).
// Décalages = centre du minion - centre du Hitac, en px de la capture
// (multipliés par HITAC_SNOW_SCALE ci-dessous).
// z : chevauchement de la capture — côté crochets devant le Hitac (1),
// en face derrière (-1, la pointe du bras passe par-dessus).
// Le sprite ne tourne pas : décalages fixes dans le monde.
const HITAC_SNOW_ESCORT_REF = Object.freeze([
  // Bras gauche : dessus (derrière) / dessous (devant)
  Object.freeze({ dx: -108, dy: -57.5, z: -1 }),
  Object.freeze({ dx: -128, dy: 55.5, z: 1 }),
  // Bras haut : gauche (derrière) / droite (devant)
  Object.freeze({ dx: -4, dy: -103.5, z: -1 }),
  Object.freeze({ dx: 135, dy: -66.5, z: 1 }),
  // Bras bas : droite (derrière) / gauche (devant)
  Object.freeze({ dx: 159, dy: 55.5, z: -1 }),
  Object.freeze({ dx: 50, dy: 128.5, z: 1 }),
]);
export const HITAC_SNOW_ESCORT_OFFSETS = Object.freeze(HITAC_SNOW_ESCORT_REF.map(({ dx, dy, z }) =>
  Object.freeze({ dx: dx * HITAC_SNOW_SCALE, dy: dy * HITAC_SNOW_SCALE, z })));

// Couche d'affichage autour du Hitac Givré : les autres NPC passent sous
// tout le groupe (-2), puis minions de derrière (-1), Hitac (0), minions de
// devant (1). uid serveur des minions : "<maître>:es<i>".
export function hitacSnowDrawLayer(type, uid) {
  if (type === HITAC_SNOW_TYPE) return 0;
  if (type !== HITAC_SNOW_MINION_TYPE) return -2;
  const m = /:es(\d+)$/.exec(String(uid || ""));
  return m ? Number(HITAC_SNOW_ESCORT_OFFSETS[Number(m[1])]?.z) || 0 : 0;
}

export function isHitacSnowActive(now = new Date()) {
  if (HITAC_SNOW_FORCE) return true;
  try {
    // Test / debug serveur : HITAC_SNOW_FORCE=1 simule l'event.
    if (typeof process !== "undefined" && process.env && process.env.HITAC_SNOW_FORCE === "1") return true;
  } catch {}
  const t = now instanceof Date ? now.getTime() : Number(now);
  return Number.isFinite(t) && t >= HITAC_SNOW_START && t <= HITAC_SNOW_END;
}

export function hitacSnowPreloadTypes(mapId, now = new Date()) {
  const id = String(mapId || "").trim().toLowerCase();
  return HITAC_SNOW_MAPS.includes(id) && isHitacSnowActive(now) ? [HITAC_SNOW_TYPE, HITAC_SNOW_MINION_TYPE] : [];
}

export function hitacSnowPickMap(random = Math.random) {
  try {
    const r = typeof random === "function" ? random() : Math.random();
    const index = Math.floor(Number(r) * HITAC_SNOW_MAPS.length);
    return HITAC_SNOW_MAPS[Math.max(0, Math.min(HITAC_SNOW_MAPS.length - 1, index))] || HITAC_SNOW_MAPS[0];
  } catch { return HITAC_SNOW_MAPS[0]; }
}

// Position aléatoire du groupe : marge de 1000 px aux bords pour que
// l'escorte (jusqu'à ~200 px du Hitac) et le halo du Creed restent en map.
const HITAC_SNOW_EDGE_MARGIN = 1000;
export function hitacSnowCampPos(world, random = Math.random) {
  const w = Number(world?.w) || 11000;
  const h = Number(world?.h) || 7000;
  const r = typeof random === "function" ? random : Math.random;
  const m = Math.min(HITAC_SNOW_EDGE_MARGIN, w / 4, h / 4);
  return {
    x: Math.round(m + r() * Math.max(1, w - 2 * m)),
    y: Math.round(m + r() * Math.max(1, h - 2 * m)),
  };
}

// Camp à position aléatoire ; le Hitac erre sur la map sans jamais chasser
// ni fuir (roamOnly), son escorte le suit en formation (`escort`).
export function buildHitacSnowCamp(world, random = Math.random) {
  const pos = hitacSnowCampPos(world, random);
  return {
    type: HITAC_SNOW_TYPE,
    event: HITAC_SNOW_EVENT,
    roaming: true,
    fixed: false,
    stationary: false,
    roamOnly: true,
    x: pos.x,
    y: pos.y,
    radius: 350,
    respawn: 0,
    maxAlive: 1,
    aggroRange: 1000,
    leashRange: 1700,
    aggroHold: 8,
    // Chaque minion : 3 vies au total (2 réapparitions), 2 s après sa mort.
    // shieldMaster : Hitac invincible (bulle ISH) tant qu'un minion vit ou
    // qu'une réapparition reste à jouer.
    escort: { type: HITAC_SNOW_MINION_TYPE, offsets: HITAC_SNOW_ESCORT_OFFSETS, lives: 3, respawnSec: 2, shieldMaster: true },
  };
}
