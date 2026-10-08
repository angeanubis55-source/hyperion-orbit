// MAPS/ZETA_MAP/WAVES.js
// Composition officielle de la Zeta Gate (10 vagues) :
// vagues 1-8 classiques, vague 9 = Devourer invulnérable + 6 à 12 Infernal
// (tirage par run), vague 10 = finale scriptée (Devourer + 2 Infernal, puis
// 7 paliers via bossEncounter).
export const DEFAULT_WAVE_TYPE = "npc_Infernal_zeta";

export const WAVE_PLANS = [
  null,
  // Vague 1 : 10 Infernal.
  [
    { type: "npc_Infernal_zeta", count: 10 },
  ],
  // Vague 2 : 9 Infernal + 3 Scorcher.
  [
    { type: "npc_Infernal_zeta", count: 9 },
    { type: "npc_Scorcher_zeta", count: 3 },
  ],
  // Vague 3 : 5 Infernal + 7 Scorcher.
  [
    { type: "npc_Infernal_zeta", count: 5 },
    { type: "npc_Scorcher_zeta", count: 7 },
  ],
  // Vague 4 : 9 Scorcher.
  [
    { type: "npc_Scorcher_zeta", count: 9 },
  ],
  // Vague 5 : 8 Scorcher + 2 Melter.
  [
    { type: "npc_Scorcher_zeta", count: 8 },
    { type: "npc_Melter_zeta", count: 2 },
  ],
  // Vague 6 : 3 Scorcher + 6 Melter.
  [
    { type: "npc_Scorcher_zeta", count: 3 },
    { type: "npc_Melter_zeta", count: 6 },
  ],
  // Vague 7 : 10 Melter.
  [
    { type: "npc_Melter_zeta", count: 10 },
  ],
  // Vague 8 : 13 Melter.
  [
    { type: "npc_Melter_zeta", count: 13 },
  ],
  // Vague 9 : 1 Devourer (invulnérable) + 6 à 12 Infernal (tirage par run).
  [
    { type: "npc_Devourer_zeta", count: 1 },
    { type: "npc_Infernal_zeta", count: "6-12" },
  ],
  // Vague 10 (FIN GG, scriptée) : 1 Devourer + 2 Infernal, puis 7 paliers.
  [
    {
      type: "npc_Devourer_zeta",
      count: 1,
      onKill: {
        reward: 0,
        tp: { factionBase: true },
      },
    },
    { type: "npc_Infernal_zeta", count: 2 },
  ],
];

export function getWavePlan(w) {
  const spawns = WAVE_PLANS[w];
  if (spawns && spawns.length) {
    return {
      spawns: spawns.map((s) => {
        // ✅ tirage du nombre d'Infernal de la vague 9 (6 à 12 par run).
        let count = s.count;
        if (typeof count === "string" && /^\d+\s*-\s*\d+$/.test(count)) {
          const [lo, hi] = count.split("-").map((x) => Math.max(1, Math.floor(Number(x) || 1)));
          count = lo + Math.floor(Math.random() * (Math.max(lo, hi) - lo + 1));
        }
        return {
          type: s.type,
          count,
          onKill: s.onKill || null, // ✅ important
        };
      }),
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
