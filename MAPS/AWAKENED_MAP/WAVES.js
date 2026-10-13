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
  // Vague 4 : 50 saimons verts (vie/bouclier x10, dégâts x6, +50 vitesse vs homologue).
  // À 50 % PV : IEM (delock + non-reverrouillable 3 s, FX suit).
  [{ type: "npc_Awakened_Saimon", count: 50 }],
  // Vague 5 : 30 blighted kristallons verts (x3), puis 3 impulse II verts (x3)
  // une fois les 30 morts (palier 2), puis 1 police (comme vague 1) une fois
  // les 3 impulse morts (palier 3).
  [{ type: "npc_Awakened_Blighted_Kristallon", count: 30, phase: 1 },
   { type: "npc_Awakened_Impulse_II", count: 3, phase: 2 },
   { type: "npc_Awakened_Police", count: 1, phase: 3,
     onKill: { spawn: [ { type: "npc_Awakened_Icy", count: 30, radius: 400 } ] } }],
  // Vague 6 : 1 cubikon vert (comme vague 2), puis 1 police (comme vague 1)
  // une fois le cubikon et ses icy/protegit morts (palier 2).
  [{ type: "npc_Awakened_Cubikon", count: 1, phase: 1,
    onKill: { spawn: [ { type: "npc_Awakened_Protegit", count: 15, radius: 300 } ] } },
   { type: "npc_Awakened_Police", count: 1, phase: 2,
     onKill: { spawn: [ { type: "npc_Awakened_Icy", count: 30, radius: 400 } ] } }],
  // Vague 7 : 1 devourer vert + 30 protegit verts. Le Devourer est
  // invulnérable (bulle ISH comme Zeta) tant que les 30 sont en vie.
  [{ type: "npc_Awakened_Devourer", count: 1 },
   { type: "npc_Awakened_Protegit", count: 30 }],
  // Vague 8 : 3 devourers verts (x3) + 90 protegit verts. Chaque Devourer est
  // invulnérable tant que des non-boss sont en vie (pas de deadlock entre eux).
  [{ type: "npc_Awakened_Devourer", count: 3 },
   { type: "npc_Awakened_Protegit", count: 90 }],
  // Vague 9 : 50 devolariums verts (vie/bouclier x3, dégâts x10, +100 vitesse vs homologue, x3).
  [{ type: "npc_Awakened_Devolarium", count: 50 }],
  // Vague 10 : 10 impulse II verts (x3).
  [{ type: "npc_Awakened_Impulse_II", count: 10 }],
  // Vague 11 en 3 paliers : 1 police (+30 icy), puis 1 autre police (+30 icy)
  // une fois le premier et ses icy morts, puis 3 impulse une fois le second
  // et ses icy morts.
  [{ type: "npc_Awakened_Police", count: 1, phase: 1,
    onKill: { spawn: [ { type: "npc_Awakened_Icy", count: 30, radius: 400 } ] } },
   { type: "npc_Awakened_Police", count: 1, phase: 2,
     onKill: { spawn: [ { type: "npc_Awakened_Icy", count: 30, radius: 400 } ] } },
   { type: "npc_Awakened_Impulse_II", count: 3, phase: 3 }],
  // Vague 12 : 12 saimons + 12 mordons + 12 devolariums verts.
  [{ type: "npc_Awakened_Saimon", count: 12 },
   { type: "npc_Awakened_Mordon", count: 12 },
   { type: "npc_Awakened_Devolarium", count: 12 }],
  // Vague 13 : 1 police + 30 protegit verts.
  [{ type: "npc_Awakened_Police", count: 1,
    onKill: { spawn: [ { type: "npc_Awakened_Icy", count: 30, radius: 400 } ] } },
   { type: "npc_Awakened_Protegit", count: 30 }],
  // Vague 14 en 4 paliers : 14 blighted kristallons, puis 14 autres une fois
  // morts, puis 14 autres une fois morts, puis 2 polices une fois morts.
  [{ type: "npc_Awakened_Blighted_Kristallon", count: 14, phase: 1 },
   { type: "npc_Awakened_Blighted_Kristallon", count: 14, phase: 2 },
   { type: "npc_Awakened_Blighted_Kristallon", count: 14, phase: 3 },
   { type: "npc_Awakened_Police", count: 2, phase: 4,
     onKill: { spawn: [ { type: "npc_Awakened_Icy", count: 30, radius: 400 } ] } }],
  // Vague 15 en 7 paliers : 25 icy + 25 protegit, puis 2 polices, puis
  // 15 impulse, puis 3 devourers protégés par 15 impulse (garde initiale),
  // puis 10 kristallons, puis 5 devolarium + 5 saimon + 5 mordon, puis 1 cubikon.
  [{ type: "npc_Awakened_Icy", count: 25, phase: 1 },
   { type: "npc_Awakened_Protegit", count: 25, phase: 1 },
   { type: "npc_Awakened_Police", count: 2, phase: 2,
     onKill: { spawn: [ { type: "npc_Awakened_Icy", count: 30, radius: 400 } ] } },
   { type: "npc_Awakened_Impulse_II", count: 15, phase: 3 },
   { type: "npc_Awakened_Devourer", count: 3, phase: 4 },
   { type: "npc_Awakened_Impulse_II", count: 15, phase: 4 },
   { type: "npc_Awakened_Blighted_Kristallon", count: 10, phase: 5 },
   { type: "npc_Awakened_Devolarium", count: 5, phase: 6 },
   { type: "npc_Awakened_Saimon", count: 5, phase: 6 },
   { type: "npc_Awakened_Mordon", count: 5, phase: 6 },
   { type: "npc_Awakened_Cubikon", count: 1, phase: 7,
     onKill: { spawn: [ { type: "npc_Awakened_Protegit", count: 15, radius: 300 } ] } }],
  // Vague 16 : 1 devourer protégé par 3 cubikons (garde initiale : invulnérable
  // + ISH tant que des non-boss sont en vie — cubikons, icy et protegit inclus).
  [{ type: "npc_Awakened_Devourer", count: 1 },
   { type: "npc_Awakened_Cubikon", count: 3,
     onKill: { spawn: [ { type: "npc_Awakened_Protegit", count: 15, radius: 300 } ] } }],
  // Vague 17 (FINALE GG) : 1 seul impulse II vert. Retour base au kill.
  [{ type: "npc_Awakened_Impulse_II", count: 1,
    onKill: { reward: 0, tp: { factionBase: true } } }],
];

export function getWavePlan(w) {
  const spawns = WAVE_PLANS[w];
  if (spawns && spawns.length) {
    return {
      spawns: spawns.map((s) => ({
        type: s.type,
        count: s.count,
        onKill: s.onKill || null,
        phase: s.phase || 1,
      })),
    };
  }

  // Une gate a un nombre fini de vagues : aucun respawn au-dela.
  return { spawns: [] };
}
