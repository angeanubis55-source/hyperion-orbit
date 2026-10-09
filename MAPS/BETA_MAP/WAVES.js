// MAPS/BETA_MAP/WAVES.js
export const DEFAULT_WAVE_TYPE = "npc_Streuner";

export const WAVE_PLANS = [
  null,
  [{ type: "npc_Streuner_beta", count: 20 }],
  [{ type: "npc_Lordakia_beta", count: 20 }],
  [{ type: "npc_Mordon_beta", count: 20 }],
  [{ type: "npc_Saimon_beta", count: 40 }],
  [{ type: "npc_Devolarium_beta", count: 20 }],
  [{ type: "npc_Kristallin_beta", count: 40 }],
  [{ type: "npc_Sibelon_beta", count: 20 }],
  [{ type: "npc_Sibelonit_beta", count: 40 }],
  [{ type: "npc_Kristallon_beta", count: 16 }],
  [{ type: "npc_Protegit_beta", count: 30 }],

  // ✅ Cubikon = FIN GG
  [
    {
      type: "npc_Cubikon_beta",
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
        onKill: s.onKill || null, // ✅ important
      })),
    };
  }

  // Une gate a un nombre fini de vagues : aucun respawn au-dela.
  return { spawns: [] };
}
