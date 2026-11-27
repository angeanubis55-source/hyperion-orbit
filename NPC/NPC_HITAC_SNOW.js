// NPC/NPC_HITAC_SNOW.js — Micro-event « Hitac enneigée » (1 semaine).
// Du lundi 23/11/2026 00h01 au dimanche 29/11/2026 23h59 (heure de Paris) :
// un Hitac givré, escorté de 6 Hitac-Minion givrés (de chaque côté
// du bout de ses 3 bras), qui le suivent en formation.
// Comme l'UFONIT : 1 seul à la fois, sur une map tirée au hasard parmi
// 4-1 / 4-2 / 4-3, sur un portail extérieur, puis patrouille de portail en
// portail (HITAC_SNOW_ROUTES) ; à sa mort il réapparaît
// aussitôt sur une autre map (contrôleur itinérant, NPC_ROOM.js).
// Pur (aucun DOM) : importable côté serveur et côté client.

import { winterParisTime } from "./NPC_WINTER.js";

// Test : true = event actif tout de suite, quelle que soit la date.
// À repasser à false une fois le visuel validé.
export const HITAC_SNOW_FORCE = false;
// Test : croix au centre du sprite + cadre du sprite sur le Hitac et les minions.
export const HITAC_SNOW_DEBUG_CENTER = false;

export const HITAC_SNOW_EVENT = "hitac_snow";
export const HITAC_SNOW_TYPE = "npc_Hitac_Frost";
export const HITAC_SNOW_MINION_TYPE = "npc_Hitac_Minion_Frost";
export const HITAC_SNOW_MAPS = Object.freeze(["4-1", "4-2", "4-3"]);
// Mois 0-11 (comme HALLOWEEN_START) : lus aussi par les annonces Discord.
export const HITAC_SNOW_START_AT = Object.freeze({ year: 2026, month: 10, day: 23, hour: 0, minute: 1 });
export const HITAC_SNOW_END_AT = Object.freeze({ year: 2026, month: 10, day: 29, hour: 23, minute: 59 });
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

// Patrouille : les 3 portails extérieurs de chaque map (le portail
// intérieur vers 4-4 est exclu). Copie des positions de MAPS/4-x/SPAWNS.js.
// Le Hitac apparaît sur l'un d'eux, file tout droit vers le suivant et,
// HITAC_SNOW_TURN_DIST px avant d'y arriver, vire vers le prochain (boucle).
export const HITAC_SNOW_ROUTES = Object.freeze({
  "4-1": Object.freeze([{ x: 803, y: 3067 }, { x: 10232, y: 1000 }, { x: 10232, y: 5900 }]),
  "4-2": Object.freeze([{ x: 5517, y: 767 }, { x: 10232, y: 5900 }, { x: 1083, y: 5900 }]),
  "4-3": Object.freeze([{ x: 10511, y: 3067 }, { x: 1083, y: 1000 }, { x: 1083, y: 5900 }]),
});
export const HITAC_SNOW_TURN_DIST = 800; // distance au portail où il change de cap
export const HITAC_SNOW_TURN_RATE = 0.5; // rad/s : virage en douceur
export const HITAC_SNOW_PATROL_SPEED = 80; // px/s en patrouille (~2 min par traversée)

// Camp sur un portail extérieur de la map (position aléatoire si la map n'a
// pas de route) ; le Hitac patrouille sans jamais chasser ni fuir
// (roamOnly), son escorte le suit en formation (`escort`).
export function buildHitacSnowCamp(world, random = Math.random, mapId = null) {
  const r = typeof random === "function" ? random : Math.random;
  const route = HITAC_SNOW_ROUTES[String(mapId || "").trim().toLowerCase()] || null;
  const start = route ? Math.min(route.length - 1, Math.floor(r() * route.length)) : 0;
  const dir = r() < 0.5 ? 1 : -1;
  const pos = route ? route[start] : hitacSnowCampPos(world, r);
  return {
    // Spawn pile sur le portail de départ, puis cap sur le portail suivant.
    fixed: !!route,
    patrol: route ? { route, idx: (start + dir + route.length) % route.length, dir,
      turnDist: HITAC_SNOW_TURN_DIST, turnRate: HITAC_SNOW_TURN_RATE, speed: HITAC_SNOW_PATROL_SPEED } : null,
    type: HITAC_SNOW_TYPE,
    event: HITAC_SNOW_EVENT,
    roaming: true,
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
