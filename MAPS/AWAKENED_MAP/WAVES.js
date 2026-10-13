// MAPS/AWAKENED_MAP/WAVES.js — placeholder en attendant le design final des vagues.
// 10 vagues : Lordakium éveillés en ouverture, Devourer éveillé en finale.
export const DEFAULT_WAVE_TYPE = "npc_Awakened_Lordakium";

export const WAVE_PLANS = [
  null,
  [{ type: "npc_Awakened_Lordakium", count: 20 }],
  [{ type: "npc_Awakened_Lordakium", count: 30 }],
  [{ type: "npc_Streuner", count: 20 }],
  [{ type: "npc_Saimon", count: 30 }],
  [{ type: "npc_Devolarium", count: 20 }],
  [{ type: "npc_Kristallin", count: 30 }],
  [{ type: "npc_Sibelon", count: 20 }],
  [{ type: "npc_Kristallon", count: 16 }],
  [{ type: "npc_Protegit", count: 30 }],

  // ✅ Finale : Awakened Devourer + retour base faction au kill.
  [
    {
      type: "npc_Awakened_Devourer",
      count: 1,
      onKill: {
        reward: 0,
        tp: { factionBase: true },
      },
    },
  ],
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
