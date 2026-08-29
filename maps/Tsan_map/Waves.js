// src/maps/Gamma/GammaWaves.js
export const DEFAULT_WAVE_TYPE = "npc_Devolarium_Corrupted";

export const WAVE_PLANS = [
  null,
  [{ type: "npc_SaNeJiEwZ", count: 25 }],
  [{ type: "npc_Saimon_Corrupted", count: 25 }],
  [{ type: "npc_SaNeJiEwZ", count: 50 }],
  [{ type: "npc_Saimon_Corrupted", count: 50 }],
  [{ type: "npc_Devolarium_Corrupted", count: 3 }],
  [{ type: "npc_Devolarium_Corrupted", count: 5 },{ type: "npc_Saimon_Corrupted", count: 25 },{ type: "npc_SaNeJiEwZ", count: 25 }],
  [{ type: "npc_Lordakium_Corrupted", count: 1 }],
  [{ type: "npc_Devourer_Corrupted", count: 1 }],
   [{ type: "npc_Devolarium_Corrupted", count: 10 },
    { type: "npc_Saimon_Corrupted", count: 25 },
      { type: "npc_Lordakium_Corrupted", count: 3 },
        { type: "npc_SaNeJiEwZ", count: 25 },
          { type: "npc_Devourer_Corrupted", count: 3 }],

  // ✅ Cubikon = FIN GG
  [
    {
      type: "npc_Demaner_Freighter",
      count: 1,
      onKill: {
        reward: 1000000000,
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
