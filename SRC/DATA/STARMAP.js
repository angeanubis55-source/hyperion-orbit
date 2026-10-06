"use strict";

// Carte Stellaire : cartes visibles et eligibilite au saut direct.
// Les ids sont les clés exactes de MAP_LOADERS (MAP_REGISTRY.js).
// LOW, QZ, 5-2 et Blacklight sont visibles, accessibles par portails uniquement.
// Les Galaxy Gates et Maudite restent hors de ce schema.
// Disposition des references Lower_star_system et Upper_star_system :
// petites cartes a gauche, grandes cartes a droite, dans un seul schema.
// Grandes vignettes avec les positions reelles des portails.

export const STARMAP_UNIT = Object.freeze({ w: 260, h: 200 });
export const STARMAP_NODE = Object.freeze({ w: 224, h: 176 });
// Position du canvas dans la bordure de 1 px du noeud.
export const STARMAP_ART = Object.freeze({ x: 11, y: 39, w: 202, h: 124 });

const N = (id, col, row, group, jumpable = true, folder = id) =>
  Object.freeze({ id, col, row, group, folder, jumpable,
    reason: jumpable ? "" : "Accès par les portails uniquement — Jump indisponible." });

export const STARMAP_NODES = Object.freeze([
  // Lower : MMO a gauche, EIC en haut a droite, VRU en bas a droite.
  N("1-1", 0, 3.1, "mmo"), N("1-2", 1.1, 3.1, "mmo"),
  N("1-3", 2.2, 2.3, "mmo"), N("1-4", 2.2, 3.95, "mmo"),
  N("2-1", 5.5, 0, "eic"), N("2-2", 4.4, 0.8, "eic"),
  N("2-3", 3.3, 1.5, "eic"), N("2-4", 5.5, 1.6, "eic"),
  N("4-1", 3.3, 3.1, "pvp"), N("4-2", 4.4, 2.65, "pvp"),
  N("4-3", 4.4, 3.9, "pvp"),
  N("3-4", 3.3, 4.8, "vru"), N("3-3", 5.5, 3.2, "vru"),
  N("3-2", 4.4, 5.5, "vru"), N("3-1", 5.5, 6.4, "vru"),
  // Upper : conserver le losange MMO et les deux branches EIC/VRU.
  N("1-8", 7.8, -1.45, "mmo"), N("1-6", 6.9, -0.1, "mmo"),
  N("1-7", 8.7, -0.1, "mmo"), N("1-5", 7.8, 1.1, "mmo"),
  N("4-4", 8.5, 2.8, "pvp"), N("4-5", 8.05, 5.3, "pvp"),
  N("2-5", 10.4, 2.0, "eic"), N("2-6", 10.4, 0.4, "eic"),
  N("2-7", 11.6, 1.1, "eic"), N("2-8", 11.6, 0, "eic"),
  N("3-5", 10.1, 4.4, "vru"), N("3-7", 11.2, 4.4, "vru"),
  N("3-6", 10.45, 6.0, "vru"), N("3-8", 11.55, 6.0, "vru"),
  // Blacklight MMO au-dessus du losange, avec sa propre marge.
  N("1-BL", 7.8, -2.7, "bl", false),
  N("2-BL", 13.2, 0, "bl", false), N("3-BL", 13.2, 6.0, "bl", false),
  N("5-2", 8.9, 7.1, "pirate", false),
  N("low", 1.2, 0.9, "event", false, "LOW_MAP"),
  N("qz", 7.0, 6.5, "event", false, "BLIGHTED_MAP"),
]);

// Les liaisons viennent des vrais SPAWNS de chaque carte via STARMAP_LAYOUT.

export const STARMAP_JUMP_CHANNEL_SEC = 10;
export const STARMAP_JUMP_REUSE_SEC = 5;
export const STARMAP_JUMP_FX_SEC = 2.5;
