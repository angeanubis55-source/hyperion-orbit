// MAPS/LAMBDA_MAP/WAVES.js
// Composition officielle de la Lambda Gate (7 vagues, 100 % Boss).
// Finale : 2 Boss Kristallon + 20 Boss Kristallin, avec retour à la base mère.
export const DEFAULT_WAVE_TYPE = "npc_Boss_Streuner_lambda";

export const WAVE_PLANS = [
  null,
  // Vague 1 : 10 Boss Streuner + 20 Boss Lordakia.
  [
    { type: "npc_Boss_Streuner_lambda", count: 10 },
    { type: "npc_Boss_Lordakia_lambda", count: 20 },
  ],
  // Vague 2 : 6 Boss Mordon + 14 Boss Saimon.
  [
    { type: "npc_Boss_Mordon_lambda", count: 6 },
    { type: "npc_Boss_Saimon_lambda", count: 14 },
  ],
  // Vague 3 : 5 Boss Devolarium + 14 Boss Sibelonit.
  [
    { type: "npc_Boss_Devolarium_lambda", count: 5 },
    { type: "npc_Boss_Sibelonit_lambda", count: 14 },
  ],
  // Vague 4 : 10 Boss Sibelonit + 1 Boss Sibelon.
  [
    { type: "npc_Boss_Sibelonit_lambda", count: 10 },
    { type: "npc_Boss_Sibelon_lambda", count: 1 },
  ],
  // Vague 5 : 3 Boss Lordakium + 10 Boss Lordakia.
  [
    { type: "npc_Boss_Lordakium_lambda", count: 3 },
    { type: "npc_Boss_Lordakia_lambda", count: 10 },
  ],
  // Vague 6 : 12 Boss Kristallin + 1 Boss Kristallon.
  [
    { type: "npc_Boss_Kristallin_lambda", count: 12 },
    { type: "npc_Boss_Kristallon_lambda", count: 1 },
  ],
  // Vague 7 (FIN GG) : 2 Boss Kristallon + 20 Boss Kristallin.
  [
    {
      type: "npc_Boss_Kristallon_lambda",
      count: 2,
      onKill: {
        reward: 0,
        tp: { factionBase: true },
      },
    },
    { type: "npc_Boss_Kristallin_lambda", count: 20 },
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
