"use strict";

import { clamp } from "../SRC/CORE/COLLISION.js";

export function getMinimapPortalColors(portal, isReturn = false) {
  if (isReturn) return { stroke: "rgba(255,178,92,0.9)", fill: "rgba(255,178,92,0.95)" };
  if (["low", "qz"].includes(String(portal?.toMap || "").toLowerCase())) {
    return { stroke: "rgba(190,96,255,0.95)", fill: "rgba(210,130,255,1)" };
  }
  if (Number(portal?.shortcutCreditCost || 0) > 0) {
    return { stroke: "rgba(255,205,82,0.95)", fill: "rgba(255,224,120,1)" };
  }
  return { stroke: "rgba(124,240,255,0.8)", fill: "rgba(124,240,255,0.95)" };
}

const minimapStaticCache = new Map();

function minimapStaticKey(world, portals, isZoneMap, safeZone, returnPortal, width, height) {
  const portalKey = (portals || []).map((p) => [p.x, p.y, p.r, p.toMap, p.shortcutCreditCost]);
  const safeKey = safeZone
    ? {
        modules: (safeZone.modules || []).map((m) => [m.x, m.y, m.w, m.h]),
        beacons: (safeZone.beacons || []).map((b) => [b.x, b.y]),
      }
    : null;
  return [
    world.w, world.h, width, height,
    isZoneMap ? 1 : 0,
    JSON.stringify(portalKey),
    String(returnPortal === portals ? "same" : (returnPortal && portals.indexOf(returnPortal))),
    JSON.stringify(safeKey),
  ].join("|");
}

function drawMinimapStatic(cctx, cw, ch, world, portals, isZoneMap, safeZone, returnPortal) {
  cctx.clearRect(0, 0, cw, ch);
  cctx.fillStyle = "rgba(255,255,255,0.04)";
  cctx.fillRect(0, 0, cw, ch);
  const scaleX = cw / world.w;
  const scaleY = ch / world.h;

  if (portals.length) {
    cctx.save();
    cctx.globalAlpha = 0.9;
    cctx.lineWidth = 2;
    for (const portal of portals) {
      const isReturn = !isZoneMap && portal === returnPortal;
      const colors = getMinimapPortalColors(portal, isReturn);
      const x = portal.x * scaleX;
      const y = portal.y * scaleY;
      const radius = (portal.r || 200) * ((scaleX + scaleY) * 0.5);
      cctx.strokeStyle = colors.stroke;
      cctx.beginPath();
      cctx.arc(x, y, radius, 0, Math.PI * 2);
      cctx.stroke();
      cctx.fillStyle = colors.fill;
      cctx.beginPath();
      cctx.arc(x, y, 2.5, 0, Math.PI * 2);
      cctx.fill();
    }
    cctx.restore();
  }

  if (isZoneMap && safeZone) {
    cctx.save();
    cctx.globalAlpha = 0.95;
    for (const module of safeZone.modules || []) {
      const radius = Math.max(3, Math.max(module.w || 0, module.h || 0) * 0.18 * ((scaleX + scaleY) * 0.5));
      cctx.fillStyle = "rgba(120,255,160,0.22)";
      cctx.beginPath();
      cctx.arc(module.x * scaleX, module.y * scaleY, radius, 0, Math.PI * 2);
      cctx.fill();
      cctx.strokeStyle = "rgba(120,255,160,0.80)";
      cctx.lineWidth = 1.5;
      cctx.stroke();
    }
    cctx.fillStyle = "rgba(120,255,160,0.95)";
    for (const beacon of safeZone.beacons || []) {
      cctx.beginPath();
      cctx.arc(beacon.x * scaleX, beacon.y * scaleY, 2, 0, Math.PI * 2);
      cctx.fill();
    }
    cctx.restore();
  }
}

function getMinimapStaticLayer(world, portals, isZoneMap, safeZone, returnPortal, width, height) {
  const key = minimapStaticKey(world, portals, isZoneMap, safeZone, returnPortal, width, height);
  let entry = minimapStaticCache.get(key);
  if (!entry) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const cctx = canvas.getContext("2d");
    drawMinimapStatic(cctx, width, height, world, portals, isZoneMap, safeZone, returnPortal);
    entry = { canvas, key };
    minimapStaticCache.set(key, entry);
  }
  return entry.canvas;
}

export function renderMinimap(context, options) {
  if (!context) return;
  const {
    width, height, world, player, enemies = [], allies = [], pet = null, portals = [], returnPortal = null,
    isZoneMap = false, safeZone = null, moveTarget = null, ping = null, markers = [],
    camera, viewportWidth, viewportHeight, lockedNpc = null, shouldShowNpc = () => true, npcOpacity = () => 1,
  } = options;
  const staticLayer = getMinimapStaticLayer(world, portals, isZoneMap, safeZone, returnPortal, width, height);
  // La couche statique contient un fond blanc translucide. Sans effacer le
  // canvas visible, ce voile s'accumule à chaque frame jusqu'à devenir blanc.
  context.clearRect(0, 0, width, height);
  context.drawImage(staticLayer, 0, 0);
  const scaleX = width / world.w;
  const scaleY = height / world.h;

  for (const enemy of enemies) {
    if (!enemy || enemy.hp <= 0 || !shouldShowNpc(player, enemy, lockedNpc)) continue;
    const size = clamp((enemy.r || 18) / 12, 2, 6);
    const opacity = clamp(Number(npcOpacity(player, enemy, lockedNpc)) || 0, 0, 1);
    if (opacity <= 0) continue;
    context.fillStyle = `rgba(255,107,122,${(0.8 * opacity).toFixed(3)})`;
    context.fillRect(enemy.x * scaleX - size / 2, enemy.y * scaleY - size / 2, size, size);
  }

  for (const ally of allies) {
    if (!ally || ally.hp <= 0) continue;
    // Joueur distant : meme taille qu'un NPC + meme portee radar.
    if (ally._net) {
      if (!shouldShowNpc(player, ally, lockedNpc)) continue;
      const size = clamp((ally.r || 18) / 12, 2, 6);
      context.fillStyle = ally.color || "rgba(80,160,255,0.95)";
      context.fillRect(ally.x * scaleX - size / 2, ally.y * scaleY - size / 2, size, size);
      continue;
    }
    context.fillStyle = "rgba(80,255,145,0.95)";
    context.beginPath();
    context.arc(ally.x * scaleX, ally.y * scaleY, 2.6, 0, Math.PI * 2);
    context.fill();
  }

  // REX / P.E.T actif : cercle vert 4x4 avec centre jaune 2x2.
  if (pet?.active === true && Number.isFinite(Number(pet.x)) && Number.isFinite(Number(pet.y))) {
    const px = pet.x * scaleX;
    const py = pet.y * scaleY;
    context.fillStyle = "#50ff91";
    context.beginPath();
    context.arc(px, py, 2, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = "#ffe14d";
    context.beginPath();
    context.arc(px, py, 1, 0, Math.PI * 2);
    context.fill();
  }

  // Marqueurs (localisateur P.E.T) : rond qui s'éloigne en boucle,
  // comme le ping au clic mais plus discret et plus fin.
  for (const marker of markers || []) {
    if (!marker || !Number.isFinite(Number(marker.x)) || !Number.isFinite(Number(marker.y))) continue;
    const mx = marker.x * scaleX;
    const my = marker.y * scaleY;
    if (marker.cross) {
      const blink = Math.floor(performance.now() / 250) % 2 === 0;
      if (!blink) continue;
      context.save();
      context.strokeStyle = marker.color || "#ff3b4f";
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(mx - 5, my - 5); context.lineTo(mx + 5, my + 5);
      context.moveTo(mx + 5, my - 5); context.lineTo(mx - 5, my + 5);
      context.stroke();
      context.restore();
      continue;
    }
    if (marker.pulse) {
      const period = 2;
      const progress = ((performance.now() / 1000) % period) / period;
      context.save();
      context.globalAlpha = (1 - progress) * 0.9;
      context.lineWidth = 1.5;
      context.strokeStyle = marker.color || "#ffe14d";
      context.beginPath();
      context.arc(mx, my, 2 + 10 * progress, 0, Math.PI * 2);
      context.stroke();
      context.restore();
      continue;
    }
    const s = 4;
    context.save();
    context.fillStyle = marker.color || "#ffe14d";
    context.beginPath();
    context.moveTo(mx, my - s);
    context.lineTo(mx + s, my);
    context.lineTo(mx, my + s);
    context.lineTo(mx - s, my);
    context.closePath();
    context.fill();
    context.restore();
  }

  // Joueur : lignes horizontale + verticale sur toute la mini-carte.
  const playerX = player.x * scaleX;
  const playerY = player.y * scaleY;
  context.save();
  context.strokeStyle = "rgba(150,155,165,1)";
  context.lineWidth = 0.5;
  context.beginPath();
  context.moveTo(0, playerY);
  context.lineTo(width, playerY);
  context.moveTo(playerX, 0);
  context.lineTo(playerX, height);
  context.stroke();
  context.restore();

  if (moveTarget?.active && !player.dead) {
    const targetX = moveTarget.x * scaleX;
    const targetY = moveTarget.y * scaleY;
    context.save();
    context.globalAlpha = 0.35;
    context.lineWidth = 1;
    context.strokeStyle = "rgba(124,240,255,0.75)";
    context.beginPath();
    context.moveTo(player.x * scaleX, player.y * scaleY);
    context.lineTo(targetX, targetY);
    context.stroke();
    // Destination : petite croix discrète, pas de boule.
    const crossArm = 4;
    context.globalAlpha = 0.6;
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(targetX - crossArm, targetY);
    context.lineTo(targetX + crossArm, targetY);
    context.moveTo(targetX, targetY - crossArm);
    context.lineTo(targetX, targetY + crossArm);
    context.stroke();
    context.restore();
  }

  if (ping) {
    const progress = clamp(ping.t / ping.dur, 0, 1);
    const radius = 3 + 10 * progress;
    context.save();
    context.globalAlpha = (1 - progress) * 0.7;
    context.lineWidth = 1;
    context.strokeStyle = "rgba(255,210,122,0.95)";
    context.beginPath();
    context.arc(ping.x * scaleX, ping.y * scaleY, radius, 0, Math.PI * 2);
    context.stroke();
    context.restore();
  }

  context.strokeStyle = "rgba(124,240,255,0.25)";
  context.lineWidth = 1;
  context.strokeRect(
    (camera.x - viewportWidth / 2) * scaleX,
    (camera.y - viewportHeight / 2) * scaleY,
    viewportWidth * scaleX,
    viewportHeight * scaleY,
  );
}
