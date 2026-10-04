"use strict";

// Direction indépendante de la cible, conservée pendant toute la fuite.
export function npcFleeDirection(npc, world, random = Math.random) {
  if (!npc.fleeDirection) {
    const angle = random() * Math.PI * 2;
    npc.fleeDirection = { x: Math.cos(angle), y: Math.sin(angle) };
  }
  const dir = npc.fleeDirection;
  // Rebond aux limites : le NPC poursuit sa route sans suivre le joueur.
  if ((npc.x <= 80 && dir.x < 0) || (npc.x >= world.w - 80 && dir.x > 0)) dir.x *= -1;
  if ((npc.y <= 80 && dir.y < 0) || (npc.y >= world.h - 80 && dir.y > 0)) dir.y *= -1;
  return dir;
}
