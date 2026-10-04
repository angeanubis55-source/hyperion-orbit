"use strict";

// Murs dessinés en procédural pur : aucun sprite, aucun motif répété, donc
// aucun chargement d'image, aucune matrice de motif à recalculer par frame.
// Par mur visible : 1 fillRect (aplat) + 1 strokeRect (bordure) — le chemin
// le plus rapide pour le canvas, même sur les petites configs.

const DEFAULT_WALL_COLORS = Object.freeze({
  fill: "#333945",
  edge: "#7e8899",
  edgeWidth: 3,
});

export function drawWallLayer(context, walls, texture, options) {
  if (!context || !walls?.length) return;
  const { offsetX = 0, offsetY = 0,
    viewportWidth = Infinity, viewportHeight = Infinity,
    colors = DEFAULT_WALL_COLORS } = options || {};
  const fill = colors?.fill ?? DEFAULT_WALL_COLORS.fill;
  const edge = colors?.edge ?? DEFAULT_WALL_COLORS.edge;
  const edgeWidth = Math.max(1, Number(colors?.edgeWidth ?? DEFAULT_WALL_COLORS.edgeWidth) || 1);
  context.save();
  context.fillStyle = fill;
  context.strokeStyle = edge;
  context.lineWidth = edgeWidth;
  for (const wall of walls) {
    // Coords écran arrondies à l'entier : 2 murs qui partagent EXACTEMENT
    // la même arête tombent sur le même pixel → aucune ligne de jointure
    // (avec des fractionnaires, l'antialiasing laissait filtrer le fond).
    const x0 = Math.round(wall.x - wall.w / 2 + offsetX);
    const y0 = Math.round(wall.y - wall.h / 2 + offsetY);
    const x1 = Math.round(wall.x + wall.w / 2 + offsetX);
    const y1 = Math.round(wall.y + wall.h / 2 + offsetY);
    const left = Math.max(0, x0), top = Math.max(0, y0);
    const right = Math.min(viewportWidth, x1), bottom = Math.min(viewportHeight, y1);
    if (right <= left || bottom <= top) continue;
    context.fillRect(left, top, right - left, bottom - top);
    if (typeof context.strokeRect === "function") {
      context.strokeRect(left, top, right - left, bottom - top);
    }
  }
  context.restore();
}
