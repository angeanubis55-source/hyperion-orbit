// MAPS/ALPHA_MAP/WAVES.js
export const DEFAULT_WAVE_TYPE = "npc_Streuner";

export const WAVE_PLANS = [
  null,
  [{ type: "npc_Streuner_alpha", count: 20 }],
  [{ type: "npc_Lordakia_alpha", count: 20 }],
  [{ type: "npc_Mordon_alpha", count: 20 }],
  [{ type: "npc_Saimon_alpha", count: 40 }],
  [{ type: "npc_Devolarium_alpha", count: 20 }],
  [{ type: "npc_Kristallin_alpha", count: 40 }],
  [{ type: "npc_Sibelon_alpha", count: 20 }],
  [{ type: "npc_Sibelonit_alpha", count: 40 }],
  [{ type: "npc_Kristallon_alpha", count: 16 }],
  [{ type: "npc_Protegit_alpha", count: 30 }],

  // ✅ Cubikon = FIN GG
  [
    {
      type: "npc_Cubikon_alpha",
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
