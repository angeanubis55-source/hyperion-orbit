"use strict";

// Niveaux d'accès aux maps, calqués sur le DarkOrbit officiel (FAQ Bigpoint) :
// - Niv 1 : X-1 + X-2 de sa compagnie
// - Niv 2 : X-3 de sa compagnie
// - Niv 3 : X-4 de sa compagnie
// - Niv 5 : X-3 + X-4 en territoire ennemi
// - Niv 8 : maps PvP 4-1 / 4-2 / 4-3
// - Niv 9 : map PvP 4-4
// - Niv 10 : X-5 de sa compagnie
// - Niv 11 : X-6 + X-7 de sa compagnie
// - Niv 12 : X-8 de sa compagnie, 4-5, maps pirates 5-x
// - Niv 13 : X-2 ennemi
// - Niv 14 : X-5 ennemi
// - Niv 15 : X-6 + X-7 ennemis
// - Niv 16 : X-1 ennemi
// - Niv 17 : X-8 ennemi (tout débloqué)
//
// Maps customs du remake (sans équivalent officiel) :
// - 4-1 / 4-2 / 4-3 (arènes de combat) : 8, palier des maps PvP
// - 4-4 (hub central) : 9 comme la map PvP officielle
// - x-9 / x-10 (contenu endgame) : 12 comme X-8, 17 en territoire ennemi
// - 5-2 (pirates) : 12 comme les 5-x officiels
// - MAUDITE (cimetière Cubikon, contenu niveau 4-5) : 12
// - low / qz : aucune limite (déjà verrouillées par leurs coûts d'entrée)
// - Galaxy Gates alpha / beta / gamma : 1 (déjà verrouillées par pièces et énergie)

const OWN_SECTOR_LEVELS = Object.freeze({ 1: 1, 2: 1, 3: 2, 4: 3, 5: 10, 6: 11, 7: 11 });
const ENEMY_SECTOR_LEVELS = Object.freeze({ 1: 16, 2: 13, 3: 5, 4: 5, 5: 14, 6: 15, 7: 15 });
// X-8 et au-delà (dont les customs x-9 / x-10) : 12 chez soi, 17 chez l'ennemi.
const OWN_DEEP_UPPER_LEVEL = 12;
const ENEMY_DEEP_UPPER_LEVEL = 17;

const SPECIAL_MAP_LEVELS = Object.freeze({
  "4-1": 8,
  "4-2": 8,
  "4-3": 8,
  "4-4": 9,
  "4-5": 12,
  "5-2": 12,
  maudite: 12,
  alpha: 1,
  beta: 1,
  gamma: 1,
});

export function getMapRequiredLevel(mapId, playerSector = null) {
  const id = String(mapId || "").trim().toLowerCase();
  if (Object.hasOwn(SPECIAL_MAP_LEVELS, id)) return SPECIAL_MAP_LEVELS[id];
  const match = id.match(/^([123])-(\d+)$/);
  if (!match) return 1;
  const zone = Number(match[2]);
  if (!Number.isFinite(zone)) return 1;
  const own = playerSector != null && String(playerSector) === match[1];
  if (zone >= 8) return own ? OWN_DEEP_UPPER_LEVEL : ENEMY_DEEP_UPPER_LEVEL;
  const table = own ? OWN_SECTOR_LEVELS : ENEMY_SECTOR_LEVELS;
  return table[zone] ?? 1;
}

export function checkMapAccess(mapId, playerLevel, playerSector = null) {
  const required = getMapRequiredLevel(mapId, playerSector);
  const level = Math.max(1, Math.floor(Number(playerLevel) || 1));
  return { ok: level >= required, required, level };
}
