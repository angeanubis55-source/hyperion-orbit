// MAPS/DELTA_MAP/WAVES.js
// Composition officielle de la Delta Gate (10 vagues) : mix réguliers + Boss,
// finale 3x SaNeJiEwZ (Demaner) qui renvoie à la base mère.
export const DEFAULT_WAVE_TYPE = "npc_Streuner";

export const WAVE_PLANS = [
  null,
  // Vague 1 : 5 Lordakia + 10 Mordon + 15 Saimon.
  [
    { type: "npc_Lordakia_delta", count: 5 },
    { type: "npc_Mordon_delta", count: 10 },
    { type: "npc_Saimon_delta", count: 15 },
  ],
  // Vague 2 : 11 Streuner + 1 StreuneR.
  [
    { type: "npc_Streuner_delta", count: 11 },
    { type: "npc_StreuneR8_delta", count: 1 },
  ],
  // Vague 3 : 5 Mordon + 10 Saimon + 15 Kristallin.
  [
    { type: "npc_Mordon_delta", count: 5 },
    { type: "npc_Saimon_delta", count: 10 },
    { type: "npc_Kristallin_delta", count: 15 },
  ],
  // Vague 4 : 12 Lordakia + 1 Lordakium.
  [
    { type: "npc_Lordakia_delta", count: 12 },
    { type: "npc_Lordakium_delta", count: 1 },
  ],
  // Vague 5 : 10 Boss Lordakia + 6 Boss Saimon + 8 Boss Mordon.
  [
    { type: "npc_Boss_Lordakia_delta", count: 10 },
    { type: "npc_Boss_Saimon_delta", count: 6 },
    { type: "npc_Boss_Mordon_delta", count: 8 },
  ],
  // Vague 6 : 15 Sibelonit + 1 Sibelon.
  [
    { type: "npc_Sibelonit_delta", count: 15 },
    { type: "npc_Sibelon_delta", count: 1 },
  ],
  // Vague 7 : 5 Sibelonit + 10 Kristallin + 5 Boss StreuneR.
  [
    { type: "npc_Sibelonit_delta", count: 5 },
    { type: "npc_Kristallin_delta", count: 10 },
    { type: "npc_Boss_StreuneR8_delta", count: 5 },
  ],
  // Vague 8 : 10 Kristallin + 1 Kristallon.
  [
    { type: "npc_Kristallin_delta", count: 10 },
    { type: "npc_Kristallon_delta", count: 1 },
  ],
  // Vague 9 : 15 Protegit + 3 Boss Lordakium.
  [
    { type: "npc_Protegit_delta", count: 15 },
    { type: "npc_Boss_Lordakium_delta", count: 3 },
  ],
  // Vague 10 (FIN GG) : 3 SaNeJiEwZ.
  [
    {
      type: "npc_SaNeJiEwZ_delta",
      count: 3,
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
