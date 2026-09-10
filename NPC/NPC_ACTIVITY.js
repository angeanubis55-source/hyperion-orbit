"use strict";

import { shouldDetectNpc } from "./NPC_SENSORS.js";

export function shouldRunNpcFrame({ player, npc, ranges, lockedNpc = null, farInterval = 15 }) {
  if (!npc || npc.hp <= 0) return false;
  if (ranges?.allVisible || shouldDetectNpc(player, npc, ranges?.radar, lockedNpc)) {
    npc._sleepTick = 0;
    return true;
  }

  const interval = Math.max(1, Math.floor(Number(farInterval) || 1));
  const initial = Math.abs(Math.floor(Number(npc.id) || 0)) % interval;
  npc._sleepTick = ((npc._sleepTick ?? initial) + 1) % interval;
  return npc._sleepTick === 0;
}
