// src/maps/alpha/AlphaWaves.js
export const DEFAULT_WAVE_TYPE = " ";

export const WAVE_PLANS = [
  null,
  [{ type: "", count: 1 }],
  [{ type: "npc_Viral_Kristallon", count: 25 },{ type: "npc_Viral_Gygerthrall", count: 10 }],

  // ✅ Cubikon = FIN GG
  [
    {
      type: "npc_Gygerim_Overlord",
      count: 1,
      onKill: {
        reward: 10000000,
        tp: { toMap: "1-1", x: 1500, y: 1500 },
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
