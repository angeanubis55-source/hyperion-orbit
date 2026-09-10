export const DEFAULT_WAVE_TYPE = "npc_Century_Falcon";

// La LOW rapporte exactement la moitié de la récompense finale d'Alpha.
export const LOW_COMPLETION_REWARD = Object.freeze({
  exp: 2000000,
  honor: 50000,
  credits: 2000000,
  x4: 10000,
});

export const WAVE_PLANS = [
  null,
  [
    {
      type: "npc_Century_Falcon",
      count: 1,
      onKill: {
        completeSpecialGate: {
          gateId: "low",
          name: "LOW",
          reward: LOW_COMPLETION_REWARD,
        },
      },
    },
  ],
];

export function getWavePlan(wave) {
  const spawns = WAVE_PLANS[wave] || WAVE_PLANS[1];
  return {
    spawns: spawns.map(spawn => ({
      type: spawn.type,
      count: spawn.count,
      onKill: spawn.onKill || null,
    })),
  };
}
