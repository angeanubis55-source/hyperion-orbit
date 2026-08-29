"use strict";

import { dist2 } from "./collision.js";

export const DEFAULT_NPC_VISIBILITY_RADIUS = 1800;
export const DEFAULT_NPC_RADAR_RADIUS = 3000;

export function getNpcSensorRanges(rules = {}) {
  const visibility = Math.max(100, Number(rules.npcVisibilityRadius) || DEFAULT_NPC_VISIBILITY_RADIUS);
  const requestedRadar = Math.max(100, Number(rules.npcRadarRadius) || DEFAULT_NPC_RADAR_RADIUS);
  return { visibility, radar: Math.max(visibility, requestedRadar) };
}

export function isNpcWithinSensor(player, npc, radius) {
  if (!player || !npc || npc.hp <= 0) return false;
  const range = Math.max(0, Number(radius) || 0);
  return dist2(player.x, player.y, npc.x, npc.y) <= range * range;
}
