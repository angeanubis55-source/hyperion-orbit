// MAPS/OMICRON_MAP/WAVES.js
// GG Omicron : vagues de l'Alpha sans Streuner / Protegit / Cubikon,
// NPC standard des maps, deux familles par vague, Emperor Kristallon en finale.
// Aucun crédit / XP / honneur au kill : ressources d'assemblage directement
// dans l'inventaire (ORBIT_ENGINE, grantResourceGateDrops).
// La gate se termine quand la dernière vague est vidée (contrôleur de vague).
export const DEFAULT_WAVE_TYPE = "npc_Lordakia_omicron";

// Deux familles par vague (deux ressources), quelques Boss, Emperor en finale.
export const WAVE_PLANS = [
  null,
  [{ type: "npc_Lordakia_omicron", count: 30 }, { type: "npc_Saimon_omicron", count: 20 }],
  [{ type: "npc_Mordon_omicron", count: 25 }, { type: "npc_Sibelonit_omicron", count: 25 }],
  [{ type: "npc_Kristallin_omicron", count: 30 }, { type: "npc_Boss_Kristallin_omicron", count: 5 }],
  [{ type: "npc_Devolarium_omicron", count: 20 }, { type: "npc_Saimon_omicron", count: 20 }],
  [{ type: "npc_Sibelon_omicron", count: 15 }, { type: "npc_Sibelonit_omicron", count: 30 }],
  [{ type: "npc_Kristallin_omicron", count: 30 }, { type: "npc_Kristallon_omicron", count: 10 }],
  [{ type: "npc_Lordakium_omicron", count: 20 }, { type: "npc_Boss_Sibelon_omicron", count: 10 }],
  [{ type: "npc_Emperor_Kristallon_omicron", count: 1 }, { type: "npc_Kristallon_omicron", count: 12 }],
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
