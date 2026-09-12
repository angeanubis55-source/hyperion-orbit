"use strict";

import { clamp } from "./COLLISION.js";

const PATTERN_CACHE = new WeakMap();

function patternCacheFor(context) {
  let byImage = PATTERN_CACHE.get(context);
  if (!byImage) {
    byImage = new Map();
    PATTERN_CACHE.set(context, byImage);
  }
  return byImage;
}

function cachedPattern(context, image, repeat) {
  if (!context || !image) return null;
  const byImage = patternCacheFor(context);
  const key = repeat + ":repeat";
  let entry = byImage.get(image);
  if (!entry) {
    entry = {};
    byImage.set(image, entry);
  }
  if (!entry[key]) entry[key] = context.createPattern(image, repeat);
  return entry[key];
}

// ---------------------------------------------------------------
// Fond de carte : les images de map font 2100x1310 jusqu'à
// 4096x2604 (10+ Mo). Les tuiler en pleine résolution à chaque
// frame via createPattern + fillRect plein écran sature le
// fillrate GPU (surtout avec le blend "lighter" et un DPR à 2).
// On tuile donc une version réduite (max 1024 px), pré-rendue UNE
// seule fois : visuellement quasi identique (fond à alpha 0.85,
// parallaxe 0.02), mais 4x à 16x moins de texels par frame.
// ---------------------------------------------------------------
const MAX_TILE_SIZE = 1024;
const downsizedCache = new WeakMap();

function tilingSource(image) {
  if (!image) return null;
  const w = image.naturalWidth || image.width || 0;
  const h = image.naturalHeight || image.height || 0;
  if (!w || !h) return image;
  if (Math.max(w, h) <= MAX_TILE_SIZE) return image;
  let small = downsizedCache.get(image);
  if (!small) {
    const scale = MAX_TILE_SIZE / Math.max(w, h);
    small = document.createElement("canvas");
    small.width = Math.max(1, Math.round(w * scale));
    small.height = Math.max(1, Math.round(h * scale));
    const c = small.getContext("2d");
    // Qualité haute ici uniquement : c'est un pré-rendu unique,
    // pas un coût par frame.
    c.imageSmoothingEnabled = true;
    c.imageSmoothingQuality = "high";
    c.drawImage(image, 0, 0, small.width, small.height);
    downsizedCache.set(image, small);
  }
  return small;
}

export function drawBackgroundLayerSet(context, layers, options) {
  if (!context || !layers?.length) return;
  const { offsetX, offsetY, viewportWidth, viewportHeight, getImage, isImageReady } = options;
  for (const layer of layers) {
    const image = getImage(layer.src);
    if (!isImageReady(image)) continue;
    const parallaxX = offsetX * Number(layer.parallax ?? 0);
    const parallaxY = offsetY * Number(layer.parallax ?? 0);
    context.save();
    context.globalAlpha = clamp(layer.alpha ?? 1, 0, 1);
    if (layer.blend) context.globalCompositeOperation = layer.blend;
    if (layer.mode === "tile") {
      // Version réduite (mise en cache) : le motif tient dans le
      // cache texture GPU au lieu de saturer le fillrate.
      const tiling = tilingSource(image);
      const pattern = cachedPattern(context, tiling, "repeat");
      if (pattern) {
        context.translate(parallaxX, parallaxY);
        context.fillStyle = pattern;
        context.fillRect(-parallaxX, -parallaxY, viewportWidth, viewportHeight);
      }
      context.restore();
      continue;
    }
    // Mode cover/contain (aucun layer actuel ne l'utilise) : on garde le
    // smoothing par défaut du canvas, pas de "high" forcé chaque frame.
    const imageWidth = image.naturalWidth || image.width || 1;
    const imageHeight = image.naturalHeight || image.height || 1;
    const scaleX = viewportWidth / imageWidth;
    const scaleY = viewportHeight / imageHeight;
    const scale = layer.mode === "contain" ? Math.min(scaleX, scaleY) : Math.max(scaleX, scaleY);
    const width = imageWidth * scale;
    const height = imageHeight * scale;
    context.drawImage(image, (viewportWidth - width) * 0.5 + parallaxX, (viewportHeight - height) * 0.5 + parallaxY, width, height);
    context.restore();
  }
}

const STARFIELD_LAYERS = Object.freeze([
  { spacing: 180, parallax: 0.04, driftX: 3, driftY: 1.02, radius: 0.75, alpha: 0.48 },
  { spacing: 132, parallax: 0.11, driftX: 5.8, driftY: 1.97, radius: 1.05, alpha: 0.65 },
  { spacing: 98, parallax: 0.23, driftX: 9.5, driftY: 3.23, radius: 1.35, alpha: 0.86 },
]);

function starHash(x, y, seed) {
  let value = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 1442695041);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
}

/**
 * Champ d'étoiles à trois profondeurs. Chaque profondeur est pré-rendue une
 * seule fois dans un PETIT canvas offscreen (512x512) strictement périodique :
 * chaque étoile débordant d'un bord est redessinée de l'autre côté, donc le
 * motif se répète sans couture. À chaque frame, on ne fait qu'UN fillRect avec
 * un pattern répété par couche (3 passes plein écran avec une texture 512²
 * qui tient dans le cache GPU), au lieu de 12 drawImage d'un tile de la
 * taille de l'écran.
 *
 * Ancien coût (1080p, DPR 2) : 12 drawImage de ~2500x1500 mis à l'échelle
 * x2 en mode "lighter" + un cache qui se reconstruisait à chaque resize
 * sans jamais être purgé (fuite mémoire).
 * Nouveau coût : 3 fills d'un motif 512², cache borné à 3 entrées, aucun
 * rebuild au resize. Même densité d'étoiles, mêmes parallaxes/dérives.
 */
const STAR_TILE = 512;
const starfieldCache = new Map();

function buildStarTile(layer, layerIndex) {
  // Grille N x N calée sur 512 pour une périodicité exacte. L'écart avec
  // `spacing` d'origine est < 11 %, la densité d'étoiles est conservée.
  const cells = Math.max(1, Math.round(STAR_TILE / layer.spacing));
  const cell = STAR_TILE / cells;
  const canvas = document.createElement("canvas");
  canvas.width = STAR_TILE;
  canvas.height = STAR_TILE;
  const c = canvas.getContext("2d");
  c.save();
  c.globalCompositeOperation = "lighter";
  for (let row = 0; row < cells; row++) {
    for (let col = 0; col < cells; col++) {
      const x = col * cell + starHash(col, row, layerIndex * 7 + 1) * cell;
      const y = row * cell + starHash(col, row, layerIndex * 7 + 2) * cell;
      const brightness = 0.62 + starHash(col, row, layerIndex * 7 + 3) * 0.38;
      const radius = layer.radius * (0.72 + starHash(col, row, layerIndex * 7 + 4) * 0.55);
      c.globalAlpha = layer.alpha * brightness;
      c.fillStyle = layerIndex === 2 ? "#dff8ff" : "#b8dded";
      // Dessin wrappé 3x3 : le motif est parfaitement tuilable.
      for (let oy = -STAR_TILE; oy <= STAR_TILE; oy += STAR_TILE) {
        for (let ox = -STAR_TILE; ox <= STAR_TILE; ox += STAR_TILE) {
          const px = x + ox;
          const py = y + oy;
          if (px < -radius || py < -radius || px > STAR_TILE + radius || py > STAR_TILE + radius) continue;
          c.beginPath();
          c.arc(px, py, radius, 0, Math.PI * 2);
          c.fill();
        }
      }
    }
  }
  c.restore();
  return canvas;
}

function getStarTile(layer, layerIndex) {
  let tile = starfieldCache.get(layerIndex);
  if (!tile) {
    tile = buildStarTile(layer, layerIndex);
    starfieldCache.set(layerIndex, tile);
  }
  return tile;
}

function positiveModulo(value, mod) {
  return ((value % mod) + mod) % mod;
}

export function drawParallaxStarfield(context, options = {}) {
  if (!context) return;
  const viewportWidth = Math.max(1, Number(options.viewportWidth) || 1);
  const viewportHeight = Math.max(1, Number(options.viewportHeight) || 1);
  const cameraX = Number(options.cameraX) || 0;
  const cameraY = Number(options.cameraY) || 0;
  const elapsedSeconds = Math.max(0, Number(options.elapsedSeconds) || 0);

  context.save();
  context.globalCompositeOperation = "lighter";

  STARFIELD_LAYERS.forEach((layer, layerIndex) => {
    const tile = getStarTile(layer, layerIndex);
    const pattern = cachedPattern(context, tile, "repeat");
    if (!pattern) return;
    const shiftX = positiveModulo(cameraX * layer.parallax - elapsedSeconds * layer.driftX, STAR_TILE);
    const shiftY = positiveModulo(cameraY * layer.parallax - elapsedSeconds * layer.driftY, STAR_TILE);
    context.save();
    context.translate(-shiftX, -shiftY);
    context.fillStyle = pattern;
    context.fillRect(shiftX, shiftY, viewportWidth, viewportHeight);
    context.restore();
  });

  context.restore();
}

export function drawWallLayer(context, walls, texture, options) {
  if (!context || !walls?.length || !texture) return;
  const { offsetX, offsetY, getImage, isImageReady, createScaleMatrix } = options;
  const image = getImage(texture.src);
  if (!isImageReady(image)) return;
  const pattern = cachedPattern(context, image, "repeat");
  if (!pattern) return;
  const imageWidth = image.naturalWidth || image.width || 1;
  const imageHeight = image.naturalHeight || image.height || 1;
  if (pattern.setTransform && createScaleMatrix) {
    pattern.setTransform(createScaleMatrix((texture.w || imageWidth) / imageWidth, (texture.h || imageHeight) / imageHeight));
  }
  context.save();
  for (const wall of walls) {
    context.save();
    context.translate(wall.x - wall.w / 2 + offsetX, wall.y - wall.h / 2 + offsetY);
    context.fillStyle = pattern;
    context.fillRect(0, 0, wall.w, wall.h);
    context.restore();
  }
  context.restore();
  if (pattern.setTransform && typeof DOMMatrix !== "undefined") {
    pattern.setTransform(new DOMMatrix());
  }
}
