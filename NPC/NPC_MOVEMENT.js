"use strict";

import { clamp } from "../SRC/CORE/COLLISION.js";
import { createSpatialPairIndex } from "../SRC/CORE/SPATIAL_INDEX.js";

export const NPC_SEPARATION = Object.freeze({ enable: true, extra: 6, strength: 28, side: 12, maxPush: 220 });
const separationIndex = createSpatialPairIndex(512);

export function applyNpcSeparation(enemies, deltaTime, world, isZoneMap = false) {
  if (isZoneMap || !NPC_SEPARATION.enable || enemies.length <= 1) return;
  separationIndex.forEachPair(enemies, (a, b, i, j) => {
    if (a.type === "npc_Cubikon" || b.type === "npc_Cubikon") return;
    // Fuyards (< 10 % PV en gate) : on les laisse se stacker exactement les
    // uns sur les autres dans le coin, sans les écarter.
    if (a._fleeing && b._fleeing) return;
    const dx = b.x - a.x, dy = b.y - a.y;
    const ra = a.r || 18, rb = b.r || 18;
    const minimum = ra + rb + NPC_SEPARATION.extra;
    const squared = dx * dx + dy * dy;
    if (squared >= minimum * minimum) return;
    const distance = Math.sqrt(squared) || 0.0001;
    const nx = dx / distance, ny = dy / distance;
    const overlap = minimum - distance;
    const push = Math.min(NPC_SEPARATION.maxPush, overlap * NPC_SEPARATION.strength);
    const sign = (i + j) % 2 === 0 ? 1 : -1;
    const side = Math.min(NPC_SEPARATION.maxPush, overlap * NPC_SEPARATION.side) * sign;
    const tx = -ny, ty = nx;
    a.x = clamp(a.x + (-nx * push + tx * side) * deltaTime, ra, world.w - ra);
    a.y = clamp(a.y + (-ny * push + ty * side) * deltaTime, ra, world.h - ra);
    b.x = clamp(b.x + (nx * push - tx * side) * deltaTime, rb, world.w - rb);
    b.y = clamp(b.y + (ny * push - ty * side) * deltaTime, rb, world.h - rb);
  });
}
