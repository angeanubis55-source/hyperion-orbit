export const DEFAULT_WAVE_TYPE = "npc_Viral_Kristallon";

export const QZ_COMPLETION_REWARD = Object.freeze({
  exp: 2000000,
  honor: 50000,
  credits: 2000000,
  x4: 0,
  resources: Object.freeze({ indoctrinated_oil: [1, 3] }),
});

export const WAVE_PLANS = [
  null,
  [
    {
      type: "npc_Gygerim_Overlord",
      count: 1,
      onKill: {
        completeSpecialGate: {
          gateId: "qz",
          name: "QZ",
          reward: QZ_COMPLETION_REWARD,
        },
      },
    },
    { type: "npc_Viral_Kristallon", count: 30 },
  ],
];

export function getWavePlan(wave) {
  const spawns = WAVE_PLANS[wave] || WAVE_PLANS[1];
  return { spawns: spawns.map(spawn => ({ ...spawn, onKill: spawn.onKill || null })) };
}
