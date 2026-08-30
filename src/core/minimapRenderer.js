"use strict";

import { clamp } from "./collision.js";

export function renderMinimap(context, options) {
  if (!context) return;
  const {
    width, height, world, player, enemies = [], portals = [], returnPortal = null,
    isZoneMap = false, safeZone = null, moveTarget = null, ping = null,
    camera, viewportWidth, viewportHeight, lockedNpc = null, shouldShowNpc = () => true,
  } = options;
  context.clearRect(0, 0, width, height);
  context.fillStyle = "rgba(255,255,255,0.04)";
  context.fillRect(0, 0, width, height);
  const scaleX = width / world.w;
  const scaleY = height / world.h;

  for (const enemy of enemies) {
    if (!enemy || enemy.hp <= 0 || !shouldShowNpc(player, enemy, lockedNpc)) continue;
    const size = clamp((enemy.r || 18) / 12, 2, 6);
    context.fillStyle = "rgba(255,107,122,0.80)";
    context.fillRect(enemy.x * scaleX - size / 2, enemy.y * scaleY - size / 2, size, size);
  }

  if (portals.length) {
    context.save();
    context.globalAlpha = 0.9;
    context.lineWidth = 2;
    for (const portal of portals) {
      const isReturn = !isZoneMap && portal === returnPortal;
      const x = portal.x * scaleX;
      const y = portal.y * scaleY;
      const radius = (portal.r || 200) * ((scaleX + scaleY) * 0.5);
      context.strokeStyle = isReturn ? "rgba(255,178,92,0.9)" : "rgba(124,240,255,0.8)";
      context.beginPath();
      context.arc(x, y, radius, 0, Math.PI * 2);
      context.stroke();
      context.fillStyle = isReturn ? "rgba(255,178,92,0.95)" : "rgba(124,240,255,0.95)";
      context.beginPath();
      context.arc(x, y, 2.5, 0, Math.PI * 2);
      context.fill();
    }
    context.restore();
  }

  if (isZoneMap && safeZone) {
    context.save();
    context.globalAlpha = 0.95;
    for (const module of safeZone.modules || []) {
      const radius = Math.max(3, Math.max(module.w || 0, module.h || 0) * 0.18 * ((scaleX + scaleY) * 0.5));
      context.fillStyle = "rgba(120,255,160,0.22)";
      context.beginPath();
      context.arc(module.x * scaleX, module.y * scaleY, radius, 0, Math.PI * 2);
      context.fill();
      context.strokeStyle = "rgba(120,255,160,0.80)";
      context.lineWidth = 1.5;
      context.stroke();
    }
    context.fillStyle = "rgba(120,255,160,0.95)";
    for (const beacon of safeZone.beacons || []) {
      context.beginPath();
      context.arc(beacon.x * scaleX, beacon.y * scaleY, 2, 0, Math.PI * 2);
      context.fill();
    }
    context.restore();
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
