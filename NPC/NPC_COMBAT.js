"use strict";
import { dist2 } from "../SRC/CORE/COLLISION.js";

export function selectNpcCombatTarget(enemy, player, escorts, { getEscortById = () => null } = {}) {
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
  if (enemy) enemy._combatTargetId = "player";
  return player;
}
