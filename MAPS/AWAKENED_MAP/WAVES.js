// MAPS/AWAKENED_MAP/WAVES.js — table rase : les vagues seront branchées une par une.
export const DEFAULT_WAVE_TYPE = "npc_Awakened_Lordakium";

export const WAVE_PLANS = [
  null,
  // Vague 1 : 1 seul police Awakened (tir x3 façon joueur + faux lasers, même vitesse que le joueur).
  // À sa mort : 30 icy verts.
  [{ type: "npc_Awakened_Police", count: 1,
    onKill: { spawn: [ { type: "npc_Awakened_Icy", count: 30, radius: 400 } ] } }],
  // Vague 2 : 1 cubikon vert, mécanique 1-6 (immobile, vagues d'icy verts au contact,
  // renfort sous 5 survivants, reset/regen idle) — quotas doublés : 40 icy max.
  // À sa mort : 15 protegit verts.
  [{ type: "npc_Awakened_Cubikon", count: 1,
    onKill: { spawn: [ { type: "npc_Awakened_Protegit", count: 15, radius: 300 } ] } }],
  // Vague 3 : 50 mordons verts (vie/bouclier x3, +100 vitesse vs homologue).
  // Chaque mordon tué fait apparaître 1 protegit vert + 1 icy vert.
  [{ type: "npc_Awakened_Mordon", count: 50,
    onKill: { spawn: [ { type: "npc_Awakened_Protegit", count: 1, radius: 260 }, { type: "npc_Awakened_Icy", count: 1, radius: 260 } ] } }],
  // Vague 4 : 50 saimons verts (vie/bouclier x10, dégâts x3 vs homologue).
  [{ type: "npc_Awakened_Saimon", count: 50 }],
];

export function getWavePlan(w) {
  const spawns = WAVE_PLANS[w];
  if (spawns && spawns.length) {
    return {
      spawns: spawns.map((s) => ({
        type: s.type,
        count: s.count,
        onKill: s.onKill || null,
      })),
    };
  }

  // Une gate a un nombre fini de vagues : aucun respawn au-dela.
  return { spawns: [] };
}
