// MAPS/KRONOS_MAP/WAVES.js
// Composition officielle de la Kronos Gate (13 vagues de Saturn,
// des vaisseaux d'un univers parallèle).
// Finale : 1 Clone Maléfique + 8 Evil Iris, avec retour à la base mère.
export const DEFAULT_WAVE_TYPE = "npc_Saturn_Phoenix";

export const WAVE_PLANS = [
  null,
  // Vague 1 : 10 Saturn Phoenix + 30 Saturn Yamato.
  [
    { type: "npc_Saturn_Phoenix", count: 10 },
    { type: "npc_Saturn_Yamato", count: 30 },
  ],
  // Vague 2 : 20 Saturn Defcom + 30 Saturn Liberator.
  [
    { type: "npc_Saturn_Defcom", count: 20 },
    { type: "npc_Saturn_Liberator", count: 30 },
  ],
  // Vague 3 : 20 Saturn Nostromo + 30 Saturn Piranha.
  [
    { type: "npc_Saturn_Nostromo", count: 20 },
    { type: "npc_Saturn_Piranha", count: 30 },
  ],
  // Vague 4 : 30 Saturn Bigboy.
  [
    { type: "npc_Saturn_Bigboy", count: 30 },
  ],
  // Vague 5 : 15 Saturn Vengeance + 8 Saturn Goliath.
  [
    { type: "npc_Saturn_Vengeance", count: 15 },
    { type: "npc_Saturn_Goliath", count: 8 },
  ],
  // Vague 6 : 20 Saturn Leonov.
  [
    { type: "npc_Saturn_Leonov", count: 20 },
  ],
  // Vague 7 : 5 Saturn Venom + 5 Saturn Sentinel + 5 Saturn Spectrum
  // + 5 Saturn Diminisher + 5 Saturn Solace.
  [
    { type: "npc_Saturn_Venom", count: 5 },
    { type: "npc_Saturn_Sentinel", count: 5 },
    { type: "npc_Saturn_Spectrum", count: 5 },
    { type: "npc_Saturn_Diminisher", count: 5 },
    { type: "npc_Saturn_Solace", count: 5 },
  ],
  // Vague 8 : 10 Saturn Revenge + 15 Saturn Enforcer.
  [
    { type: "npc_Saturn_Revenge", count: 10 },
    { type: "npc_Saturn_Enforcer", count: 15 },
  ],
  // Vague 9 : 18 Saturn Lightning + 12 Saturn Avenger.
  [
    { type: "npc_Saturn_Lightning", count: 18 },
    { type: "npc_Saturn_Avenger", count: 12 },
  ],
  // Vague 10 : 12 Saturn Bastion + 6 Saturn Enforcer.
  [
    { type: "npc_Saturn_Bastion", count: 12 },
    { type: "npc_Saturn_Enforcer", count: 6 },
  ],
  // Vague 11 : 10 Saturn Spearhead + 5 Saturn Citadel + 8 Saturn Aegis
  // + 10 Saturn Goliath.
  [
    { type: "npc_Saturn_Spearhead", count: 10 },
    { type: "npc_Saturn_Citadel", count: 5 },
    { type: "npc_Saturn_Aegis", count: 8 },
    { type: "npc_Saturn_Goliath", count: 10 },
  ],
  // Vague 12 : 8 Saturn Crimson + 8 Saturn Jade + 8 Saturn Sapphire.
  [
    { type: "npc_Saturn_Crimson", count: 8 },
    { type: "npc_Saturn_Jade", count: 8 },
    { type: "npc_Saturn_Sapphire", count: 8 },
  ],
  // Vague 13 (FIN GG) : 1 Clone Maléfique + 8 Evil Iris.
  [
    {
      type: "npc_Saturn_Evil_Clone",
      count: 1,
      onKill: {
        reward: 0,
        tp: { factionBase: true },
      },
    },
    { type: "npc_Saturn_Evil_Iris", count: 8 },
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
