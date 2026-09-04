"use strict";

import { clamp } from "./collision.js";

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
    width, height, world, player, enemies = [], allies = [], portals = [], returnPortal = null,
    isZoneMap = false, safeZone = null, moveTarget = null, ping = null,
    camera, viewportWidth, viewportHeight, lockedNpc = null, shouldShowNpc = () => true,
  } = options;
  const staticLayer = getMinimapStaticLayer(world, portals, isZoneMap, safeZone, returnPortal, width, height);
  context.drawImage(staticLayer, 0, 0);
  const scaleX = width / world.w;
  const scaleY = height / world.h;

  for (const enemy of enemies) {
    if (!enemy || enemy.hp <= 0 || !shouldShowNpc(player, enemy, lockedNpc)) continue;
    const size = clamp((enemy.r || 18) / 12, 2, 6);
    context.fillStyle = "rgba(255,107,122,0.80)";
    context.fillRect(enemy.x * scaleX - size / 2, enemy.y * scaleY - size / 2, size, size);
  }

  context.fillStyle = "rgba(80,255,145,0.95)";
  for (const ally of allies) {
    if (!ally || ally.hp <= 0) continue;
    context.beginPath();
    context.arc(ally.x * scaleX, ally.y * scaleY, 2.6, 0, Math.PI * 2);
    context.fill();
  }

  context.fillStyle = "rgba(124,240,255,1)";
  context.beginPath();
  context.arc(player.x * scaleX, player.y * scaleY, 3.2, 0, Math.PI * 2);
  context.fill();

  if (moveTarget?.active && !player.dead) {
    const targetX = moveTarget.x * scaleX;
    const targetY = moveTarget.y * scaleY;
    context.save();
    context.globalAlpha = 0.85;
    context.lineWidth = 2;
    context.strokeStyle = "rgba(124,240,255,0.75)";
    context.beginPath();
    context.moveTo(player.x * scaleX, player.y * scaleY);
    context.lineTo(targetX, targetY);
    context.stroke();
    context.fillStyle = "rgba(124,240,255,0.95)";
    context.beginPath();
    context.arc(targetX, targetY, 3.2, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }

  if (ping) {
    const progress = clamp(ping.t / ping.dur, 0, 1);
    const radius = 6 + 20 * progress;
    context.save();
    context.globalAlpha = 1 - progress;
    context.lineWidth = 2.5;
    context.strokeStyle = "rgba(255,210,122,0.95)";
    context.beginPath();
    context.arc(ping.x * scaleX, ping.y * scaleY, radius, 0, Math.PI * 2);
    context.stroke();
    context.globalAlpha = (1 - progress) * 0.25;
    context.lineWidth = 6;
    context.beginPath();
    context.arc(ping.x * scaleX, ping.y * scaleY, radius, 0, Math.PI * 2);
    context.stroke();
    context.restore();
  }

  context.strokeStyle = "rgba(124,240,255,0.6)";
  context.strokeRect(
    (camera.x - viewportWidth / 2) * scaleX,
    (camera.y - viewportHeight / 2) * scaleY,
    viewportWidth * scaleX,
    viewportHeight * scaleY,
  );
}
