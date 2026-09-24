"use strict";

import { dist2 } from "../SRC/CORE/COLLISION.js";

export const DEFAULT_NPC_VISIBILITY_RADIUS = 1800;
export const DEFAULT_NPC_RADAR_RADIUS = 1800;
export const DEFAULT_NPC_RADAR_FADE_START = 1800;

export function getNpcSensorRanges(rules = {}) {
  if (rules.mode === "gate") {
    return { visibility: Infinity, radar: Infinity, allVisible: true };
  }
  const visibility = Math.max(100, Number(rules.npcVisibilityRadius) || DEFAULT_NPC_VISIBILITY_RADIUS);
  const requestedRadar = Math.max(100, Number(rules.npcRadarRadius) || DEFAULT_NPC_RADAR_RADIUS);
  return { visibility, radar: Math.max(visibility, requestedRadar), allVisible: false };
}

export function isNpcWithinSensor(player, npc, radius) {
  if (!player || !npc || npc.hp <= 0) return false;
  const range = Math.max(0, Number(radius) || 0);
  return dist2(player.x, player.y, npc.x, npc.y) <= range * range;
}

function isLockedSensorTarget(entity, locked) {
  if (!entity || !locked) return false;
  if (entity === locked) return true;
  if (entity._netPlayer != null && locked._netPlayer != null) {
    return String(entity._netPlayer) === String(locked._netPlayer);
  }
  return false;
}

export function shouldDetectNpc(player, npc, radius, lockedNpc = null) {
  return isLockedSensorTarget(npc, lockedNpc) || npc?._attackedPlayerRecently === true || isNpcWithinSensor(player, npc, radius);
}

export function npcSensorOpacity(player, npc, fadeStart = DEFAULT_NPC_RADAR_FADE_START, radius = DEFAULT_NPC_RADAR_RADIUS, lockedNpc = null) {
  if (!player || !npc || npc.hp <= 0) return 0;
  if (isLockedSensorTarget(npc, lockedNpc) || npc?._attackedPlayerRecently === true) return 1;
  const outer = Math.max(0, Number(radius) || 0);
  if (!Number.isFinite(outer)) return 1;
  const inner = Math.max(0, Math.min(outer, Number(fadeStart) || 0));
  const distance = Math.hypot(Number(npc.x) - Number(player.x), Number(npc.y) - Number(player.y));
  if (distance <= inner) return 1;
  if (distance >= outer) return 0;
  return 1 - (distance - inner) / Math.max(1, outer - inner);
}
