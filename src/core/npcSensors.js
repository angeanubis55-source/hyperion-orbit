"use strict";

import { dist2 } from "./collision.js";

export const DEFAULT_NPC_VISIBILITY_RADIUS = 1600;
export const DEFAULT_NPC_RADAR_RADIUS = 2200;

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

export function shouldDetectNpc(player, npc, radius, lockedNpc = null) {
  return npc === lockedNpc || npc?._attackedPlayerRecently === true || isNpcWithinSensor(player, npc, radius);
}
