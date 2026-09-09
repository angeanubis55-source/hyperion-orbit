"use strict";

// Crédits, expérience et honneur sont trois récompenses indépendantes.
// Ces bases reprennent les valeurs historiques DarkOrbit.
const BASE_REWARDS = Object.freeze({
  Streuner: { credits: 400, exp: 400, honor: 2 },
  Lordakia: { credits: 800, exp: 800, honor: 4 },
  Saimon: { credits: 1600, exp: 1600, honor: 8 },
  Mordon: { credits: 6400, exp: 3200, honor: 16 },
  Devolarium: { credits: 51200, exp: 6400, honor: 32 },
  Sibelonit: { credits: 12800, exp: 3200, honor: 16 },
  Sibelon: { credits: 102400, exp: 12800, honor: 64 },
  Lordakium: { credits: 204800, exp: 25600, honor: 128 },
  Kristallin: { credits: 12800, exp: 6400, honor: 32 },
  Kristallon: { credits: 409600, exp: 51200, honor: 256 },
  StreuneR8: { credits: 12000, exp: 6400000000, honor: 32 },
  Protegit: { credits: 12800, exp: 6400, honor: 32 },
  Cubikon: { credits: 1638400, exp: 512000, honor: 4096 },
});

const EXACT_REWARDS = Object.freeze({
  npc_Vagrant: { credits: 45000, exp: 9000, honor: 12 },
  npc_Marauder: { credits: 90000, exp: 18000, honor: 24 },
  npc_Outcast: { credits: 150000, exp: 27000, honor: 36 },
  npc_Corsair: { credits: 240000, exp: 39000, honor: 48 },
  npc_Hooligan: { credits: 375000, exp: 48000, honor: 96 },
  npc_Ravager: { credits: 480000, exp: 54000, honor: 192 },
  npc_Convict: { credits: 660000, exp: 60000, honor: 300 },
  npc_Century_Falcon: { credits: 3000000, exp: 3000000, honor: 15000 },
  npc_Boss_Sibelonit: { credits: 102400, exp: 12800, honor: 64 },
  npc_Uber_Sibelonit: { credits: 204800, exp: 25600, honor: 128 },
  npc_Blighted_Kristallin: { credits: 12800, exp: 6400, honor: 32 },
  npc_Blighted_Kristallon: { credits: 500000, exp: 65000, honor: 300 },
  npc_Blighted_Gygerthrall: { credits: 18800, exp: 9400, honor: 45 },
  npc_Viral_Kristallon: { credits: 500000, exp: 65000, honor: 300 },
  npc_Viral_Gygerthrall: { credits: 18800, exp: 9400, honor: 45 },
  npc_Interceptor: { credits: 25000, exp: 7500, honor: 40 },
  npc_Barracuda: { credits: 90000, exp: 15000, honor: 80 },
  npc_Saboteur: { credits: 125000, exp: 22500, honor: 72 },
  npc_Annihilator: { credits: 250000, exp: 30000, honor: 128 },
  npc_Battleray: { credits: 1160000, exp: 83300, honor: 190 },
  npc_Emperor_Sibelon: { credits: 1400000, exp: 512000, honor: 2048 },
  npc_Emperor_Lordakium: { credits: 2000000, exp: 768000, honor: 4096 },
  npc_Emperor_Kristallon: { credits: 5000000, exp: 1024000, honor: 8192 },
});

const EXACT_STATS = Object.freeze({
  npc_Vagrant: { hp: 80000, shield: 80000, bulletDmg: 5000 },
  npc_Marauder: { hp: 200000, shield: 120000, bulletDmg: 11000 },
  npc_Outcast: { hp: 300000, shield: 160000, bulletDmg: 15000 },
  npc_Corsair: { hp: 400000, shield: 240000, bulletDmg: 16000 },
  npc_Hooligan: { hp: 750000, shield: 600000, bulletDmg: 9000 },
  npc_Ravager: { hp: 900000, shield: 600000, bulletDmg: 22000 },
  npc_Convict: { hp: 1200000, shield: 600000, bulletDmg: 23000 },
  npc_Century_Falcon: { hp: 12000000, shield: 9000000, bulletDmg: 70000 },
  npc_Saimon: { hp: 6000, shield: 6000 },
  npc_Uber_Sibelon: { hp: 1600000, shield: 1600000 },
  npc_Boss_Kristallon: { hp: 1600000, shield: 1200000 },
  npc_StreuneR8: { hp: 40000, shield: 30000 },
  npc_Boss_StreuneR8: { hp: 80000, shield: 40000 },
  npc_Uber_StreuneR8: { hp: 320000, shield: 240000 },
  npc_Streuner_Aider: { hp: 1500, shield: 1000 },
  npc_Blighted_Kristallon: { hp: 600000, shield: 400000 },
  npc_Blighted_Gygerthrall: { hp: 240000, shield: 200000 },
  npc_Viral_Kristallon: { hp: 600000, shield: 400000 },
  npc_Viral_Gygerthrall: { hp: 240000, shield: 200000 },
  npc_Gygerim_Overlord: { hp: 60000000, shield: 60000000 },
  npc_Battleray: { hp: 330000, shield: 260000 },
  npc_Emperor_Lordakium: { hp: 9600000, shield: 6800000 },
  npc_Emperor_Kristallon: { hp: 14080000, shield: 10560000 },
});

const GATE_MULTIPLIERS = Object.freeze({ alpha: 1, beta: 2, gamma: 3 });

const BASE_SPEEDS = Object.freeze({
  Streuner: 270,
  Lordakia: 320,
  Saimon: 320,
  Mordon: 125,
  Devolarium: 200,
  Sibelonit: 320,
  Sibelon: 100,
  Lordakium: 230,
  Kristallin: 320,
  Kristallon: 250,
  Protegit: 420,
  Cubikon: 30,
  StreuneR8: 280,
});

const OFFICIAL_SPEEDS = Object.freeze({
  // Le Vagrant suit normalement la vitesse du joueur (+15). Le moteur
  // utilisant une vitesse NPC fixe, 335 conserve ce léger avantage.
  npc_Vagrant: 335,
  npc_Marauder: 315,
  npc_Outcast: 300,
  npc_Corsair: 290,
  npc_Hooligan: 280,
  npc_Ravager: 270,
  npc_Convict: 260,
  npc_Century_Falcon: 360,
  npc_Boss_Streuner: 250,
  npc_Boss_Lordakia: 400,
  npc_Boss_Saimon: 300,
  npc_Boss_Mordon: 150,
  npc_Boss_Devolarium: 160,
  npc_Boss_Sibelonit: 300,
  npc_Boss_Sibelon: 175,
  npc_Boss_Lordakium: 200,
  npc_Boss_Kristallin: 340,
  npc_Boss_Kristallon: 250,
  npc_Boss_StreuneR8: 200,
  npc_Uber_Streuner: 280,
  npc_Uber_Lordakia: 360,
  npc_Uber_Saimon: 360,
  npc_Uber_Mordon: 165,
  npc_Uber_Devolarium: 240,
  npc_Uber_Sibelonit: 360,
  npc_Uber_Sibelon: 140,
  npc_Uber_Lordakium: 270,
  npc_Uber_Kristallin: 360,
  npc_Uber_Kristallon: 290,
  npc_Uber_StreuneR8: 320,
  npc_Interceptor: 500,
  npc_Barracuda: 430,
  npc_Saboteur: 430,
  npc_Annihilator: 350,
  npc_Battleray: 220,
});

function positiveInteger(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.round(number)) : fallback;
}

function splitNpcType(type) {
  let family = String(type || "").replace(/^npc_/, "");
  let variantMultiplier = 1;
  if (family.startsWith("Boss_")) {
    family = family.slice(5);
    variantMultiplier = 4;
  } else if (family.startsWith("Uber_")) {
    family = family.slice(5);
    variantMultiplier = 8;
  }

  const gateMatch = family.match(/_(alpha|beta|gamma)$/);
  const gate = gateMatch?.[1] || null;
  if (gate) family = family.slice(0, -(gate.length + 1));
  return { family, variantMultiplier, gate };
}

function applyGateStats(types, type, npc, family, gate) {
  if (!gate) return;
  const base = types[`npc_${family}`];
  if (!base) return;
  const multiplier = GATE_MULTIPLIERS[gate];
  npc.hp = positiveInteger(base.hp * multiplier);
  npc.shield = positiveInteger(base.shield * multiplier);
  npc.speed = positiveInteger(base.speed);
}

function fallbackRewards(npc) {
  const credits = positiveInteger(npc.value);
  const durability = positiveInteger(npc.hp) + positiveInteger(npc.shield);
  return {
    credits,
    exp: positiveInteger(npc.exp, Math.min(credits, durability * 0.08)),
    honor: positiveInteger(npc.honor, credits > 0 ? Math.min(10000, Math.max(1, Math.sqrt(credits) * 0.45)) : 0),
  };
}

function resolveRewards(type, npc, parsed) {
  const exact = EXACT_REWARDS[type];
  if (exact) return exact;
  const base = BASE_REWARDS[parsed.family];
  if (!base) return fallbackRewards(npc);
  const gateMultiplier = parsed.gate ? GATE_MULTIPLIERS[parsed.gate] : 1;
  const multiplier = parsed.variantMultiplier * gateMultiplier;
  return {
    credits: base.credits * multiplier,
    exp: base.exp * multiplier,
    honor: base.honor * multiplier,
  };
}

export function applyNpcBalance(types) {
  for (const [type, npc] of Object.entries(types || {})) {
    if (!npc || typeof npc !== "object") continue;
    const parsed = splitNpcType(type);
    Object.assign(npc, EXACT_STATS[type] || {});
    if (OFFICIAL_SPEEDS[type] != null) npc.speed = OFFICIAL_SPEEDS[type];
    else if (!parsed.gate && parsed.variantMultiplier === 1 && BASE_SPEEDS[parsed.family] != null) {
      npc.speed = BASE_SPEEDS[parsed.family];
    }
    applyGateStats(types, type, npc, parsed.family, parsed.gate);

    npc.hp = positiveInteger(npc.hp, 1);
    npc.shield = positiveInteger(npc.shield);
    npc.speed = positiveInteger(npc.speed);
    const rewards = resolveRewards(type, npc, parsed);
    npc.value = positiveInteger(rewards.credits);
    npc.exp = positiveInteger(rewards.exp);
    npc.honor = positiveInteger(rewards.honor);
  }
  return types;
}

export { BASE_REWARDS, BASE_SPEEDS, EXACT_REWARDS, EXACT_STATS, GATE_MULTIPLIERS, OFFICIAL_SPEEDS };
