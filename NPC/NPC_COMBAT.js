"use strict";
import { dist2 } from "../SRC/CORE/COLLISION.js";

export function selectNpcCombatTarget(enemy, player, escorts, { gateMode = false, getEscortById = () => null } = {}) {
  // Draw Fire (Citadel) : NPC taunté = verrouillé sur le joueur, aucun
  // nouveau lock ailleurs tant que le verrou est posé.
  if (enemy?.drawFireLock && player && !(player.dead)) { enemy._combatTargetId = "player"; return player; }
  // Hologramme Mimesis : joueur invisible complet → les NPC prennent le clone
  // le plus proche comme si c'était un vrai joueur.
  if (player && !(player.dead) && player.holoGramPhase === "clones") {
    let best = null, bestD = Infinity;
    for (const sc of escorts || []) {
      if (!sc?.holo || !(sc.hp > 0)) continue;
      const d = dist2(enemy.x, enemy.y, sc.x, sc.y);
      if (d < bestD) { bestD = d; best = sc; }
    }
    if (best) { enemy._combatTargetId = best.id; return best; }
  }
  if (!gateMode || !escorts.length) { if (enemy) enemy._combatTargetId = "player"; return player; }
  const candidates = (player.dead || player.holoGramPhase === "clones") ? [] : [player];
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
