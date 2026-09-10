// MAPS/GAMMA_MAP/WAVES.js
export const DEFAULT_WAVE_TYPE = "npc_Streuner";

export const WAVE_PLANS = [
  null,
  [{ type: "npc_Streuner_gamma", count: 20 }],
  [{ type: "npc_Lordakia_gamma", count: 20 }],
  [{ type: "npc_Mordon_gamma", count: 20 }],
  [{ type: "npc_Saimon_gamma", count: 40 }],
  [{ type: "npc_Devolarium_gamma", count: 20 }],
  [{ type: "npc_Kristallin_gamma", count: 40 }],
  [{ type: "npc_Sibelon_gamma", count: 20 }],
  [{ type: "npc_Sibelonit_gamma", count: 40 }],
  [{ type: "npc_Kristallon_gamma", count: 16 }],
  [{ type: "npc_Protegit_gamma", count: 30 }],

  // ✅ Cubikon = FIN GG
  [
    {
      type: "npc_Cubikon_gamma",
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

  // fallback: répète la dernière vague définie
  for (let i = WAVE_PLANS.length - 1; i >= 1; i--) {
    if (WAVE_PLANS[i] && WAVE_PLANS[i].length) {
      return {
        spawns: WAVE_PLANS[i].map((s) => ({
          type: s.type,
          count: s.count,
          onKill: s.onKill || null,
        })),
      };
    }
  }

  return { spawns: [{ type: DEFAULT_WAVE_TYPE, count: 10, onKill: null }] };
}
