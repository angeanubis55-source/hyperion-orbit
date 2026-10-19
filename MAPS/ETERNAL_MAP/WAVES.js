// MAPS/ETERNAL_MAP/WAVES.js — Gate Eternal (entrée = Eternal Classique CPU, pas de spin).
export const DEFAULT_WAVE_TYPE = "npc_Streuner_eternal";

export const WAVE_PLANS = [
  null,
  [{ type: "npc_Streuner_eternal", count: 40 }],
  [{ type: "npc_Lordakia_eternal", count: 40 }],
  [{ type: "npc_Mordon_eternal", count: 40 }],
  [{ type: "npc_Saimon_eternal", count: 80 }],
  [{ type: "npc_Devolarium_eternal", count: 20 }],
  [{ type: "npc_Kristallin_eternal", count: 80 }],
  [{ type: "npc_Sibelon_eternal", count: 20 }],
  [{ type: "npc_Sibelonit_eternal", count: 80 }],
  [{ type: "npc_Kristallon_eternal", count: 2 }],
  [{ type: "npc_Protegit_eternal", count: 30 }],
  // ✅ Dernière vague : 2 Lordakium (fin de gate = retour base auto, voir moteur).
  [{ type: "npc_Lordakium_eternal", count: 2 }],
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
