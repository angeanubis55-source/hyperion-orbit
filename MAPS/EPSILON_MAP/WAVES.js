// MAPS/EPSILON_MAP/WAVES.js
// Composition officielle de l'Epsilon Gate (11 vagues de pirates).
// Finale : 5 Ravager + 6 Convict, avec retour à la base mère.
export const DEFAULT_WAVE_TYPE = "npc_Vagrant";

export const WAVE_PLANS = [
  null,
  // Vague 1 : 17 Vagrant.
  [
    { type: "npc_Vagrant_epsilon", count: 17 },
  ],
  // Vague 2 : 12 Vagrant + 5 Marauder.
  [
    { type: "npc_Vagrant_epsilon", count: 12 },
    { type: "npc_Marauder_epsilon", count: 5 },
  ],
  // Vague 3 : 5 Marauder + 9 Outcast.
  [
    { type: "npc_Marauder_epsilon", count: 5 },
    { type: "npc_Outcast_epsilon", count: 9 },
  ],
  // Vague 4 : 5 Marauder + 12 Outcast.
  [
    { type: "npc_Marauder_epsilon", count: 5 },
    { type: "npc_Outcast_epsilon", count: 12 },
  ],
  // Vague 5 : 6 Outcast + 9 Corsair.
  [
    { type: "npc_Outcast_epsilon", count: 6 },
    { type: "npc_Corsair_epsilon", count: 9 },
  ],
  // Vague 6 : 4 Corsair + 6 Outcast + 5 Hooligan.
  [
    { type: "npc_Corsair_epsilon", count: 4 },
    { type: "npc_Outcast_epsilon", count: 6 },
    { type: "npc_Hooligan_epsilon", count: 5 },
  ],
  // Vague 7 : 5 Corsair + 9 Hooligan.
  [
    { type: "npc_Corsair_epsilon", count: 5 },
    { type: "npc_Hooligan_epsilon", count: 9 },
  ],
  // Vague 8 : 10 Hooligan + 4 Ravager.
  [
    { type: "npc_Hooligan_epsilon", count: 10 },
    { type: "npc_Ravager_epsilon", count: 4 },
  ],
  // Vague 9 : 5 Hooligan + 6 Ravager + 3 Convict.
  [
    { type: "npc_Hooligan_epsilon", count: 5 },
    { type: "npc_Ravager_epsilon", count: 6 },
    { type: "npc_Convict_epsilon", count: 3 },
  ],
  // Vague 10 : 4 Convict.
  [
    { type: "npc_Convict_epsilon", count: 4 },
  ],
  // Vague 11 (FIN GG) : 5 Ravager + 6 Convict.
  [
    {
      type: "npc_Ravager_epsilon",
      count: 5,
      onKill: {
        reward: 0,
        tp: { factionBase: true },
      },
    },
    {
      type: "npc_Convict_epsilon",
      count: 6,
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
