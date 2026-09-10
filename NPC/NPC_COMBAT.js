"use strict";
import { dist2 } from "../SRC/CORE/COLLISION.js";

export function selectNpcCombatTarget(enemy, player, escorts, { gateMode = false, getEscortById = () => null } = {}) {
  if (!gateMode || !escorts.length) { if (enemy) enemy._combatTargetId = "player"; return player; }
  const candidates = player.dead ? [] : [player];
  candidates.push(...escorts.filter(escort => escort.hp > 0));
  if (!candidates.length) return player;
  if (enemy?.type !== "npc_Gygerim_Overlord") {
    const current = enemy?._combatTargetId === "player" ? player : getEscortById(enemy?._combatTargetId);
    if (current?.hp > 0 && dist2(enemy.x, enemy.y, current.x, current.y) <= 1200 ** 2) return current;
  }
  const target = candidates.reduce((best, candidate) => !best || dist2(enemy.x, enemy.y, candidate.x, candidate.y) < dist2(enemy.x, enemy.y, best.x, best.y) ? candidate : best, null) || player;
  enemy._combatTargetId = target === player ? "player" : target.id;
  return target;
}
