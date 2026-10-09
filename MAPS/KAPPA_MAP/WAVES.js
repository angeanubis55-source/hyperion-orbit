// MAPS/KAPPA_MAP/WAVES.js
// Composition officielle de la Kappa Gate (11 vagues mixtes).
// Finale : 1 Century Falcon (version faible) avec retour à la base mère.
export const DEFAULT_WAVE_TYPE = "npc_Streuner_kappa";

export const WAVE_PLANS = [
  null,
  // Vague 1 : 10 Streuner + 10 Vagrant + 10 Infernal.
  [
    { type: "npc_Streuner_kappa", count: 10 },
    { type: "npc_Vagrant_kappa", count: 10 },
    { type: "npc_Infernal_kappa", count: 10 },
  ],
  // Vague 2 : 6 Marauder + 7 Scorcher + 8 Boss Mordon.
  [
    { type: "npc_Marauder_kappa", count: 6 },
    { type: "npc_Scorcher_kappa", count: 7 },
    { type: "npc_Boss_Mordon_kappa", count: 8 },
  ],
  // Vague 3 : 6 Outcast + 6 Devolarium + 3 Icy.
  [
    { type: "npc_Outcast_kappa", count: 6 },
    { type: "npc_Devolarium_kappa", count: 6 },
    { type: "npc_Icy_kappa", count: 3 },
  ],
  // Vague 4 : 5 Boss Sibelonit + 5 Corsair + 5 Scorcher.
  [
    { type: "npc_Boss_Sibelonit_kappa", count: 5 },
    { type: "npc_Corsair_kappa", count: 5 },
    { type: "npc_Scorcher_kappa", count: 5 },
  ],
  // Vague 5 : 4 Hooligan + 5 Kristallin + 4 Melter.
  [
    { type: "npc_Hooligan_kappa", count: 4 },
    { type: "npc_Kristallin_kappa", count: 5 },
    { type: "npc_Melter_kappa", count: 4 },
  ],
  // Vague 6 : 8 Interceptor + 6 Barracuda + 3 Annihilator.
  [
    { type: "npc_Interceptor_kappa", count: 8 },
    { type: "npc_Barracuda_kappa", count: 6 },
    { type: "npc_Annihilator_kappa", count: 3 },
  ],
  // Vague 7 : 6 Boss Lordakium + 8 Protegit + 2 Boss Sibelon.
  [
    { type: "npc_Boss_Lordakium_kappa", count: 6 },
    { type: "npc_Protegit_kappa", count: 8 },
    { type: "npc_Boss_Sibelon_kappa", count: 2 },
  ],
  // Vague 8 : 6 Kucurbium + 8 Uber Saimon.
  [
    { type: "npc_Kucurbium_kappa", count: 6 },
    { type: "npc_Uber_Saimon_kappa", count: 8 },
  ],
  // Vague 9 : 5 Convict + 5 Boss Kristallin + 1 DemaNeR.
  [
    { type: "npc_Convict_kappa", count: 5 },
    { type: "npc_Boss_Kristallin_kappa", count: 5 },
    { type: "npc_Demaner_kappa", count: 1 },
  ],
  // Vague 10 : 1 Boss Kucurbium.
  [
    { type: "npc_Boss_Kucurbium_kappa", count: 1 },
  ],
  // Vague 11 (FIN GG) : 1 Century Falcon (version faible).
  [
    {
      type: "npc_Century_Falcon_kappa",
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
