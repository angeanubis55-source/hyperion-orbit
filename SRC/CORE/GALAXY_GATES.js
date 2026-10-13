"use strict";

import { getDroneDesign } from "../../DRONE/DRONE_DESIGNS.js";
import { findCatalogItem } from "./CATALOG.js";

export const GALAXY_GATE_EQUIPMENT_DROPS = Object.freeze({
  epsilon: Object.freeze({ itemId: "laser_lf5al", chance: 0.5 }),
});

export function rollGalaxyGateEquipmentReward(drop, rng = Math.random) {
  const item = findCatalogItem(drop?.itemId);
  if (!item?.module) return null;
  if (typeof drop.amount === "number") return { itemId: item.id, amount: drop.amount > 0 ? 1 : 0 };
  const chance = Math.max(0, Math.min(1, Number(drop.chance) || 0));
  const amount = chance >= 1 || (chance > 0 && Number(rng()) < chance) ? 1 : 0;
  return { itemId: item.id, amount };
}

export function galaxyGateEquipmentRewardMessage(reward) {
  const item = findCatalogItem(reward?.itemId);
  if (!item?.module) return null;
  return reward.amount > 0 ? `1x ${item.name.replace(/^laser /i, "")} reçu` : "Aucun équipement reçu";
}

export const GALAXY_GATE_DRONE_DESIGN_DROPS = Object.freeze({
  delta: Object.freeze({ itemId: "drone_design_hermes", chance: 0.33 }),
  zeta: Object.freeze({ itemId: "drone_design_havoc", chance: 0.45 }),
  kappa: Object.freeze({ itemId: "drone_design_hercules", chance: 0.25 }),
  kronos: Object.freeze({ itemId: "drone_design_saturn", chance: 1 }),
  awakened: Object.freeze({ itemId: "drone_design_admin", chance: 0.01 }),
});

export function rollGalaxyGateDroneDesignReward(drop, rng = Math.random) {
  const design = getDroneDesign(drop?.itemId);
  if (!design) return null;
  if (typeof drop.amount === "number") return { itemId: design.itemId, amount: drop.amount > 0 ? 1 : 0 };
  const chance = Math.max(0, Math.min(1, Number(drop.chance) || 0));
  const amount = chance >= 1 || (chance > 0 && Number(rng()) < chance) ? 1 : 0;
  return { itemId: design.itemId, amount };
}

export function galaxyGateDroneDesignRewardMessage(reward) {
  const design = getDroneDesign(reward?.itemId);
  if (!design) return null;
  return reward.amount > 0 ? `1x Design de drones ${design.name.toLowerCase()} reçu` : "Aucun Design de drones reçu";
}

export function galaxyGateXenomitForCredits(credits) {
  const amount = Number(credits);
  return Number.isFinite(amount) ? Math.max(0, Math.floor(amount / 40000)) : 0;
}

export function galaxyGateMaterialAmountForCredits(credits) {
  const amount = Number(credits);
  return Number.isFinite(amount) ? Math.max(0, Math.floor(amount / 1000000)) : 0;
}

function defineCompletionReward(reward) {
  const amount = galaxyGateMaterialAmountForCredits(reward.credits);
  return Object.freeze({ ...reward, xenomit: galaxyGateXenomitForCredits(reward.credits),
    resources: Object.freeze({ kyhalon: amount, tetrathrin: amount, bifenon: amount,
      schism: Math.floor(amount / 10), diametrion: Math.floor(amount / 2) }) });
}

// Resolve each material independently once per completion. Numeric amounts
// are already resolved and keep their value during delayed distribution.
export function rollGalaxyGateResourceRewards(resources, rng = Math.random) {
  return Object.fromEntries(Object.entries(resources || {}).map(([id, value]) => {
    if (!Array.isArray(value)) return [id, Math.max(0, Math.floor(Number(value) || 0))];
    const min = Math.max(0, Math.floor(Number(value[0]) || 0));
    const max = Math.max(min, Math.floor(Number(value[1]) || 0));
    const random = Math.max(0, Math.min(1 - Number.EPSILON, Number(rng()) || 0));
    return [id, min + Math.floor(random * (max - min + 1))];
  }));
}

export const GALAXY_GATE_DEFINITIONS = Object.freeze({
  alpha: Object.freeze({ id: "alpha", name: "Alpha", group: "ensemble", requiredParts: 34, maxWaves: 11, maxLives: 5, image: "ASSETS/ALPHA_PORTAL/DESACTIVE.png", completion: defineCompletionReward({ exp: 6000000, honor: 150000, credits: 20000000, x4: 30000 }), rewardScale: 1 }),
  beta: Object.freeze({ id: "beta", name: "Beta", group: "ensemble", requiredParts: 48, maxWaves: 11, maxLives: 5, image: "ASSETS/BETA_PORTAL/DESACTIVE.png", completion: defineCompletionReward({ exp: 12000000, honor: 300000, credits: 35000000, x4: 60000 }), rewardScale: 2 }),
  gamma: Object.freeze({ id: "gamma", name: "Gamma", group: "ensemble", requiredParts: 82, maxWaves: 11, maxLives: 5, image: "ASSETS/GAMMA_PORTAL/DESACTIVE.png", completion: defineCompletionReward({ exp: 18000000, honor: 450000, credits: 50000000, x4: 100000 }), rewardScale: 3 }),
  // ✅ Delta : roue de spin isolée (groupe "delta"), 128 pièces / 10 vagues (officiel).
  delta: Object.freeze({ id: "delta", name: "Delta", group: "delta", requiredParts: 128, maxWaves: 10, maxLives: 5, image: "ASSETS/DELTA_PORTAL/DESACTIVE.png", completion: defineCompletionReward({ exp: 13500000, honor: 337500, credits: 65000000, x4: 67500 }), rewardScale: 3 }),
  // ✅ Epsilon : roue de spin isolée (groupe "epsilon"), 99 pièces / 11 vagues pirates (officiel).
  epsilon: Object.freeze({ id: "epsilon", name: "Epsilon", group: "epsilon", requiredParts: 99, maxWaves: 11, maxLives: 5, image: "ASSETS/EPSILON_PORTAL/DESACTIVE.png", completion: defineCompletionReward({ exp: 7500000, honor: 225000, credits: 30000000, x4: 30000 }), rewardScale: 1 }),
  // ✅ Zeta : roue de spin isolée (groupe "zeta"), 111 pièces / 10 vagues (finale scriptée Devourer).
  zeta: Object.freeze({ id: "zeta", name: "Zeta", group: "zeta", requiredParts: 111, maxWaves: 10, maxLives: 5, image: "ASSETS/ZETA_PORTAL/DESACTIVE.png", completion: defineCompletionReward({ exp: 9000000, honor: 300000, credits: 45000000, x4: 37500 }), rewardScale: 1 }),
  // ✅ Kappa : roue de spin isolée (groupe "kappa"), 120 pièces / 11 vagues mixtes (officiel).
  kappa: Object.freeze({ id: "kappa", name: "Kappa", group: "kappa", requiredParts: 120, maxWaves: 11, maxLives: 5, image: "ASSETS/KAPPA_PORTAL/DESACTIVE.png", completion: defineCompletionReward({ exp: 13500000, honor: 487500, credits: 60000000, x4: 45000 }), rewardScale: 1 }),
  // ✅ Lambda : roue de spin isolée (groupe "lambda"), 45 pièces / 7 vagues de Boss (officiel).
  lambda: Object.freeze({ id: "lambda", name: "Lambda", group: "lambda", requiredParts: 45, maxWaves: 7, maxLives: 5, image: "ASSETS/LAMBDA_PORTAL/DESACTIVE.png", completion: defineCompletionReward({ exp: 4125000, honor: 150000, credits: 15000000, x4: 15000 }), rewardScale: 1 }),
  // ✅ Kronos : PAS de roue (construction fidèle via complétions des autres gates), 21 pièces / 13 vagues Saturn.
  kronos: Object.freeze({ id: "kronos", name: "Kronos", group: null, requiredParts: 21, maxWaves: 13, maxLives: 5, image: "ASSETS/KRONOS_PORTAL/DESACTIVE.png", completion: defineCompletionReward({ exp: 75000000, honor: 1000000, credits: 75000000, x4: 100000, energy: 300 }), rewardScale: 1 }),
  // ✅ Awakened : roue de spin isolée (groupe "awakened"), 1 seule pièce, 17 vagues.
  // Récompense finale = x10 Kronos.
  awakened: Object.freeze({ id: "awakened", name: "Awakened", group: "awakened", requiredParts: 1, maxWaves: 17, maxLives: 1, image: "ASSETS/PORTAL/AWAKENED/DESACTIVE.png", completion: defineCompletionReward({ exp: 750000000, honor: 10000000, credits: 750000000, x4: 1000000, energy: 3000 }), rewardScale: 1 }),
});

// Groupes de spin : "ensemble" (Alpha/Beta/Gamma, une seule roue), "delta",
// "epsilon", "zeta", "kappa", "lambda" et "awakened" (roues isolées).
// Kronos n'a pas de roue (construction via complétions, voir KRONOS_PARTS_BY_GATE).
export const KRONOS_PARTS_BY_GATE = Object.freeze({
  alpha: 4, beta: 3, gamma: 1, delta: 1, epsilon: 4, zeta: 1, kappa: 2, lambda: 5,
});
// "epsilon", "zeta", "kappa", "lambda" et "awakened" (roues isolées).
export const GALAXY_GATE_SPIN_GROUPS = Object.freeze(["ensemble", "delta", "epsilon", "zeta", "kappa", "lambda", "awakened"]);

// Groupe de spin d'une gate (roue utilisée pour les pièces/doublons/multiplicateur).
export function getGalaxyGateSpinGroup(gateId) {
  const gate = GALAXY_GATE_DEFINITIONS[String(gateId || "").toLowerCase()];
  return gate ? (gate.group || gate.id) : null;
}

export const GALAXY_SPIN_CREDIT_COST = 125000;
export const GALAXY_GATE_BUILD_LIMIT = 1;

// Échange Palladium -> énergie Galaxy (comptoir pirate 5-2). 10:1.
export const PALLADIUM_PER_GALAXY_ENERGY = 10;

// Calcul pur : combien d'énergies avec `owned` Palladium (max `requested`).
export function palladiumExchangeForEnergy(owned, requested = Infinity) {
  const stock = Math.max(0, Math.floor(Number(owned) || 0));
  const want = requested == null ? Infinity : Math.max(0, Math.floor(Number(requested) || 0));
  const energies = Math.min(Math.floor(stock / PALLADIUM_PER_GALAXY_ENERGY), want);
  return { energies, cost: energies * PALLADIUM_PER_GALAXY_ENERGY, remaining: stock - energies * PALLADIUM_PER_GALAXY_ENERGY };
}

export function normalizeGalaxyGateWave(gateId, value) {
  const gate = GALAXY_GATE_DEFINITIONS[String(gateId || "").toLowerCase()];
  const number = Number(value);
  const wave = Number.isFinite(number) ? Math.max(1, Math.floor(number)) : 1;
  return gate ? Math.min(gate.maxWaves, wave) : wave;
}

export function normalizeGalaxyGateState(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const state = {
    energy: Math.max(0, Math.floor(Number(source.energy) || 0)),
    parts: {},
    built: {},
    deployed: {},
    completed: {},
    kronosParts: {},
    lives: {},
    // ✅ multiplicateurs par groupe de spin : "ensemble" (ABG), "delta", "epsilon", "zeta", "kappa", "lambda" et "awakened" isolés.
    multipliers: { ensemble: 1, delta: 1, epsilon: 1, zeta: 1, kappa: 1, lambda: 1, awakened: 1 },
    multiplierArmed: { ensemble: false, delta: false, epsilon: false, zeta: false, kappa: false, lambda: false, awakened: false },
    active: GALAXY_GATE_DEFINITIONS[String(source.active || "").toLowerCase()] ? String(source.active).toLowerCase() : null,
    activeWave: Math.max(1, Math.floor(Number(source.activeWave) || 1)),
    // ✅ progression persistée par gate : permet d'alterner librement
    // entre Alpha / Beta / Gamma sans perdre la vague atteinte.
    // 0 = jamais commencée, sinon dernière vague sauvegardée.
    waves: {},
    // ✅ kills intra-vague persistés par gate : { [gateId]: { wave, killed } }.
    // Permet de ne pas refaire respawn les NPC déjà tués de la vague en
    // cours après un refresh ou une mort (re-entrée dans la GG).
    // `killed` = nombre de NPC du plan de vague déjà éliminés.
    waveKills: {},
    lastOpenedGate: GALAXY_GATE_DEFINITIONS[String(source.lastOpenedGate || "").toLowerCase()] ? String(source.lastOpenedGate).toLowerCase() : "alpha",
    history: Array.isArray(source.history) ? source.history.slice(-30) : [],
  };
  for (const gate of Object.values(GALAXY_GATE_DEFINITIONS)) {
    state.parts[gate.id] = Math.min(gate.requiredParts - 1, Math.max(0, Math.floor(Number(source.parts?.[gate.id]) || 0)));
    state.built[gate.id] = Math.min(GALAXY_GATE_BUILD_LIMIT, Math.max(0, Math.floor(Number(source.built?.[gate.id]) || 0)));
    if (state.built[gate.id] >= GALAXY_GATE_BUILD_LIMIT) state.parts[gate.id] = 0;
    state.deployed[gate.id] = source.deployed?.[gate.id] === true;
    state.completed[gate.id] = Math.max(0, Math.floor(Number(source.completed?.[gate.id]) || 0));
    state.lives[gate.id] = Math.min(gate.maxLives, Math.max(0, Math.floor(Number(source.lives?.[gate.id]) || gate.maxLives)));
    state.waves[gate.id] = Math.min(gate.maxWaves, Math.max(0, Math.floor(Number(source.waves?.[gate.id]) || 0)));
    // ✅ migration/validation des kills intra-vague (ancien format ignoré).
    // On garde le marqueur de vague même à killed=0 (vague démarrée, aucun
    // kill) : seul { wave: 0 } signifie « aucune progression ».
    const rawKills = source.waveKills?.[gate.id];
    const killWave = Math.min(gate.maxWaves, Math.max(0, Math.floor(Number(rawKills?.wave) || 0)));
    const killed = Number.isFinite(Number(rawKills?.killed)) ? Math.max(0, Math.floor(Number(rawKills.killed))) : 0;
    state.waveKills[gate.id] = (rawKills && typeof rawKills === "object" && killWave >= 1)
      ? { wave: killWave, killed }
      : { wave: 0, killed: 0 };
    if (killWave >= 1 && rawKills?.byType && typeof rawKills.byType === "object") {
      const entries = Object.entries(rawKills.byType).filter(([type, count]) =>
        type.startsWith("npc_") && type.length <= 128 && Number.isFinite(Number(count)) && Number(count) > 0);
      state.waveKills[gate.id].byType = Object.fromEntries(entries.map(([type, count]) => [type, Math.floor(Number(count))]));
      state.waveKills[gate.id].killed = Math.max(killed, Object.values(state.waveKills[gate.id].byType).reduce((sum, count) => sum + count, 0));
    }
  }
  // Track the current Kronos assembly by source gate, independently of lifetime completions.
  const hasKronosParts = source.kronosParts && typeof source.kronosParts === "object";
  let legacyRemaining = state.parts.kronos;
  for (const [id, required] of Object.entries(KRONOS_PARTS_BY_GATE)) {
    const value = Number(source.kronosParts?.[id]);
    state.kronosParts[id] = hasKronosParts
      ? Math.min(required, Math.max(0, Number.isFinite(value) ? Math.floor(value) : 0))
      : Math.min(required, state.completed[id] * required, legacyRemaining);
    if (!hasKronosParts) legacyRemaining -= state.kronosParts[id];
  }
  // Legacy saves stored only a total. Preserve every earned piece, even if
  // their original source cannot be recovered from lifetime completion counts.
  if (!hasKronosParts) for (const [id, required] of Object.entries(KRONOS_PARTS_BY_GATE)) {
    const amount = Math.min(required - state.kronosParts[id], legacyRemaining);
    state.kronosParts[id] += amount;
    legacyRemaining -= amount;
  }
  const kronosTotal = Object.values(state.kronosParts).reduce((sum, amount) => sum + amount, 0);
  if (kronosTotal >= GALAXY_GATE_DEFINITIONS.kronos.requiredParts && state.built.kronos < GALAXY_GATE_BUILD_LIMIT) {
    state.built.kronos++;
  }
  if (state.built.kronos >= GALAXY_GATE_BUILD_LIMIT) {
    for (const id of Object.keys(KRONOS_PARTS_BY_GATE)) state.kronosParts[id] = 0;
    state.parts.kronos = 0;
  } else {
    state.parts.kronos = kronosTotal;
  }
  // ✅ migration : ancien format 1 multiplicateur scalaire partagé (+ legacy
  // par gate) -> multiplicateurs par groupe de spin (ensemble = max hérité).
  const clampMult = (value) => Math.min(5, Math.max(1, Math.floor(Number(value) || 1)));
  const legacyScalar = clampMult(source.multiplier);
  const legacyScalarArmed = source.multiplierArmed === true && legacyScalar > 1;
  const groupMax = { ensemble: legacyScalar, delta: 1, epsilon: 1, zeta: 1, kappa: 1, lambda: 1, awakened: 1 };
  const groupArmed = { ensemble: legacyScalarArmed, delta: false, epsilon: false, zeta: false, kappa: false, lambda: false, awakened: false };
  for (const gate of Object.values(GALAXY_GATE_DEFINITIONS)) {
    const group = gate.group || gate.id;
    // Ancien format objet par gate (alpha/beta/gamma) : reporté sur son groupe.
    const legacyValue = clampMult(source.multipliers?.[gate.id]);
    if (Number(source.multipliers?.[gate.id]) > 0 && legacyValue > (groupMax[group] || 1)) groupMax[group] = legacyValue;
    if (source.multiplierArmed?.[gate.id] === true && legacyValue > 1) groupArmed[group] = true;
  }
  for (const group of GALAXY_GATE_SPIN_GROUPS) {
    // Nouveau format objet par groupe (ensemble/delta) : prioritaire.
    const stored = Number(source.multipliers?.[group]);
    state.multipliers[group] = Number.isFinite(stored) && stored > 0 ? clampMult(stored) : (groupMax[group] || 1);
    const storedArmed = source.multiplierArmed?.[group];
    const armed = typeof storedArmed === "boolean" ? storedArmed : (groupArmed[group] === true);
    state.multiplierArmed[group] = armed && state.multipliers[group] > 1;
  }
  // ✅ auto-placement : une GG terminée est directement posée sur la map.
  // Une sauvegarde legacy avec built=1 + deployed=false migre vers
  // built=0 + deployed=true (sauf si la gate est en cours -> stock conservé).
  for (const gate of Object.values(GALAXY_GATE_DEFINITIONS)) {
    if (state.built[gate.id] > 0 && state.deployed[gate.id] !== true && state.active !== gate.id) {
      state.built[gate.id]--;
      state.deployed[gate.id] = true;
      state.lives[gate.id] = gate.maxLives;
    }
  }
  // ✅ la vague persistée de la gate active fait foi (vieilles saves sans `waves`).
  if (state.active && GALAXY_GATE_DEFINITIONS[state.active]) {
    state.activeWave = normalizeGalaxyGateWave(state.active, state.waves[state.active] || state.activeWave);
    state.waves[state.active] = state.activeWave;
  }
  return state;
}

export function spinGalaxyGate(stateInput, gateId, count = 1, credits = 0, rng = Math.random) {
  const state = normalizeGalaxyGateState(stateInput);
  const gate = GALAXY_GATE_DEFINITIONS[String(gateId || "").toLowerCase()];
  if (!gate) return { ok: false, error: "Galaxy Gate inconnue.", state, credits };
  // ✅ Kronos n'a pas de roue : parts via complétions des autres gates.
  if (gate.id === "kronos") return { ok: false, error: "Kronos se construit en terminant les autres Galaxy Gates.", state, credits };
  const spins = Math.min(100, Math.max(1, Math.floor(Number(count) || 1)));
  let balance = Math.max(0, Math.floor(Number(credits) || 0));
  const rewards = {
    parts: 0,
    partsByGate: Object.fromEntries(Object.keys(GALAXY_GATE_DEFINITIONS).map(id => [id, 0])),
    built: 0,
    builtByGate: Object.fromEntries(Object.keys(GALAXY_GATE_DEFINITIONS).map(id => [id, 0])),
    duplicates: [],
    multiplierApplied: null,
    multiplierApplications: [],
    credits: 0,
    energy: 0,
    ammo: { x2: 0, x3: 0, x4: 0, sab: 0, x6: 0 },
    rockets: { plt2021: 0, plt3030: 0, ubr100: 0, hstrm01: 0 },
  };
  let performed = 0;

  const spinGroup = gate.group || gate.id;
  const groupGates = Object.values(GALAXY_GATE_DEFINITIONS).filter(item => (item.group || item.id) === spinGroup);
  const randomGate = () => {
    const gates = groupGates;
    return gates[Math.min(gates.length - 1, Math.floor(Math.max(0, Math.min(0.999999, Number(rng()) || 0)) * gates.length))];
  };
  // ✅ doublons et multiplicateur armé : strictement isolés par groupe de spin
  // (un doublon Delta ne booste que Delta, jamais l'ensemble ABG).
  const registerDuplicate = (duplicateGate) => {
    const group = duplicateGate.group || duplicateGate.id;
    state.multipliers[group] = Math.min(5, Math.max(1, Number(state.multipliers?.[group]) || 1) + 1);
    if (state.multipliers[group] >= 5) state.multiplierArmed[group] = true;
    rewards.duplicates.push({ gate: duplicateGate.id, multiplier: state.multipliers[group] });
  };
  const applyArmedMultiplier = (rewardType, rewardId, baseAmount, maximum = Infinity) => {
    const armed = state.multiplierArmed?.[spinGroup] === true;
    const owned = Math.min(5, Math.max(1, Number(state.multipliers?.[spinGroup]) || 1));
    if (armed !== true || owned <= 1) return Math.min(baseAmount, maximum);
    const amount = Math.min(baseAmount * owned, maximum);
    const application = { gate: gate.id, multiplier: owned, spin: performed, rewardType, rewardId, amount };
    rewards.multiplierApplied ||= application;
    rewards.multiplierApplications.push(application);
    state.multiplierArmed[spinGroup] = false;
    state.multipliers[spinGroup] = 1;
    return amount;
  };

  for (let i = 0; i < spins; i++) {
    if (state.energy > 0) state.energy--;
    else if (balance >= GALAXY_SPIN_CREDIT_COST) balance -= GALAXY_SPIN_CREDIT_COST;
    else break;

    performed++;
    const roll = Math.max(0, Math.min(0.999999, Number(rng()) || 0));
    if (roll < 0.22) {
      const availableGates = groupGates.filter(item => state.built[item.id] < GALAXY_GATE_BUILD_LIMIT);
      const partGate = availableGates.length
        ? availableGates[Math.min(availableGates.length - 1, Math.floor(Math.max(0, Math.min(0.999999, Number(rng()) || 0)) * availableGates.length))]
        : null;
      if (!partGate) {
        registerDuplicate(randomGate());
      } else if (state.parts[partGate.id] < partGate.requiredParts - 1) {
        const amount = applyArmedMultiplier("parts", partGate.id, 1, partGate.requiredParts - state.parts[partGate.id]);
        state.parts[partGate.id] += amount;
        rewards.parts += amount;
        rewards.partsByGate[partGate.id] += amount;
        if (state.parts[partGate.id] >= partGate.requiredParts) {
          state.parts[partGate.id] = 0;
          state.built[partGate.id]++;
          rewards.built++;
          rewards.builtByGate[partGate.id]++;
        }
      } else {
        const amount = applyArmedMultiplier("parts", partGate.id, 1, 1);
        state.parts[partGate.id] = 0;
        state.built[partGate.id]++;
        rewards.parts += amount;
        rewards.partsByGate[partGate.id] += amount;
        rewards.built++;
        rewards.builtByGate[partGate.id]++;
      }
    } else if (roll < 0.32) {
      registerDuplicate(randomGate());
    } else if (roll < 0.55) {
      const amount = applyArmedMultiplier("ammo", "x2", 250);
      rewards.ammo.x2 += amount;
    } else if (roll < 0.69) {
      const amount = applyArmedMultiplier("ammo", "x3", 150);
      rewards.ammo.x3 += amount;
    } else if (roll < 0.79) {
      const amount = applyArmedMultiplier("ammo", "x4", 75);
      rewards.ammo.x4 += amount;
    } else if (roll < 0.86) {
      const amount = applyArmedMultiplier("ammo", "sab", 200);
      rewards.ammo.sab += amount;
    } else if (roll < 0.90) {
      const amount = applyArmedMultiplier("rockets", "plt2021", 20);
      rewards.rockets.plt2021 += amount;
    } else if (roll < 0.925) {
      const amount = applyArmedMultiplier("rockets", "plt3030", 10);
      rewards.rockets.plt3030 += amount;
    } else if (roll < 0.945) {
      const amount = applyArmedMultiplier("rockets", "ubr100", 10);
      rewards.rockets.ubr100 += amount;
    } else if (roll < 0.96) {
      const amount = applyArmedMultiplier("rockets", "hstrm01", 10);
      rewards.rockets.hstrm01 += amount;
    } else if (roll < 0.99) {
      const amount = applyArmedMultiplier("credits", null, 50000);
      rewards.credits += amount;
    } else if (roll < 0.999) {
      const amount = applyArmedMultiplier("ammo", "x6", 20);
      rewards.ammo.x6 += amount;
    } else {
      const amount = applyArmedMultiplier("energy", null, 2);
      rewards.energy += amount;
    }
  }

  if (!performed) return { ok: false, error: `Énergie insuffisante et ${GALAXY_SPIN_CREDIT_COST.toLocaleString("fr-FR")} crédits requis par spin.`, state, credits: balance };
  state.lastOpenedGate = gate.id;
  state.energy += rewards.energy;
  balance += rewards.credits;
  // ✅ auto-placement : chaque GG terminée par ce spin est directement posée
  // sur la map. Si un portail est déjà posé (ou la gate en cours), la GG
  // reste en stock built=1/1 et sera posée à la fin de la gate en cours.
  const autoDeployed = [];
  for (const gate of Object.values(GALAXY_GATE_DEFINITIONS)) {
    while (state.built[gate.id] > 0 && state.deployed[gate.id] !== true && state.active !== gate.id) {
      state.built[gate.id]--;
      state.deployed[gate.id] = true;
      state.lives[gate.id] = gate.maxLives;
      autoDeployed.push(gate.id);
      // Une seule pose par gate et par spin suffit (built max = 1).
      break;
    }
  }
  rewards.autoDeployed = autoDeployed;
  state.history.push({ gate: gate.id, at: Date.now(), spins: performed, rewards });
  state.history = state.history.slice(-30);
  return { ok: true, state, credits: balance, performed, rewards };
}

export function setGalaxyGateMultiplierArmed(stateInput, gateId, armed = true) {
  const state = normalizeGalaxyGateState(stateInput);
  const group = getGalaxyGateSpinGroup(gateId) || "ensemble";
  if (Math.min(5, Math.max(1, Number(state.multipliers?.[group]) || 1)) <= 1) return { ok: false, state };
  state.multiplierArmed[group] = armed === true;
  return { ok: true, state };
}

export function deployBuiltGalaxyGate(stateInput, gateId) {
  const state = normalizeGalaxyGateState(stateInput);
  const id = String(gateId || "").toLowerCase();
  // ✅ on peut préparer une gate pendant qu'une autre est en cours (alternance libre) ;
  // seul le déploiement de la gate déjà en cours est interdit.
  if (!GALAXY_GATE_DEFINITIONS[id] || state.built[id] <= 0 || state.active === id || state.deployed[id]) {
    return { ok: false, state };
  }
  state.built[id]--;
  state.deployed[id] = true;
  state.lives[id] = GALAXY_GATE_DEFINITIONS[id].maxLives;
  return { ok: true, state };
}

export function consumeBuiltGalaxyGate(stateInput, gateId) {
  const state = normalizeGalaxyGateState(stateInput);
  const id = String(gateId || "").toLowerCase();
  if (!GALAXY_GATE_DEFINITIONS[id]) return { ok: false, state };
  // Reprise de la gate déjà en cours.
  if (state.active === id) {
    state.waves[id] = Math.min(GALAXY_GATE_DEFINITIONS[id].maxWaves, Math.max(1, state.activeWave));
    return { ok: true, state, resumed: true };
  }
  // ✅ alternance libre : on peut entrer dans une gate déployée même si une
  // autre est en cours. La progression de l'ancienne est sauvegardée et son
  // portail est reposé pour pouvoir y revenir plus tard.
  if (state.active) {
    if (!state.deployed[id]) return { ok: false, state };
    const previous = state.active;
    state.waves[previous] = Math.min(GALAXY_GATE_DEFINITIONS[previous].maxWaves, Math.max(1, state.activeWave));
    state.deployed[previous] = true;
    const hadProgress = (state.waves[id] || 0) > 0;
    state.deployed[id] = false;
    state.active = id;
    state.activeWave = hadProgress ? state.waves[id] : 1;
    state.waves[id] = Math.min(GALAXY_GATE_DEFINITIONS[id].maxWaves, Math.max(1, state.activeWave));
    if (!hadProgress) state.lives[id] = GALAXY_GATE_DEFINITIONS[id].maxLives;
    return { ok: true, state, switched: true, from: previous };
  }
  if (!state.deployed[id]) return { ok: false, state };
  const hadProgress = (state.waves[id] || 0) > 0;
  state.deployed[id] = false;
  state.active = id;
  state.activeWave = hadProgress ? state.waves[id] : 1;
  state.waves[id] = Math.min(GALAXY_GATE_DEFINITIONS[id].maxWaves, Math.max(1, state.activeWave));
  if (!hadProgress) state.lives[id] = GALAXY_GATE_DEFINITIONS[id].maxLives;
  return { ok: true, state };
}

export function getGalaxyGateWaveKills(stateInput, gateId) {
  const state = normalizeGalaxyGateState(stateInput);
  const id = String(gateId || "").toLowerCase();
  if (!GALAXY_GATE_DEFINITIONS[id]) return { wave: 0, killed: 0 };
  const entry = state.waveKills?.[id];
  return {
    wave: Math.max(0, Math.floor(Number(entry?.wave) || 0)),
    killed: Math.max(0, Math.floor(Number(entry?.killed) || 0)),
    ...(entry?.byType ? { byType: { ...entry.byType } } : {}),
  };
}

// ✅ Incrémente les kills intra-vague (NPC du plan de vague éliminé).
// Si la vague ne correspond pas à celle mémorisée, on repart de `count`
// (nouvelle vague). Retourne le compteur à jour.
export function recordGalaxyGateWaveKill(stateInput, gateId, wave, count = 1, npcType = null) {
  const state = normalizeGalaxyGateState(stateInput);
  const id = String(gateId || "").toLowerCase();
  if (!GALAXY_GATE_DEFINITIONS[id]) return { ok: false, state };
  const w = normalizeGalaxyGateWave(id, wave);
  const delta = Math.max(1, Math.floor(Number(count) || 1));
  state.waveKills ||= {};
  const prev = state.waveKills[id];
  if (prev && Number(prev.wave) === w) {
    prev.killed = Math.max(0, Math.floor(Number(prev.killed) || 0)) + delta;
  } else {
    state.waveKills[id] = { wave: w, killed: delta };
  }
  if (typeof npcType === "string" && npcType.startsWith("npc_")) {
    const entry = state.waveKills[id];
    entry.byType ||= {};
    entry.byType[npcType] = (Number(entry.byType[npcType]) || 0) + delta;
  }
  return { ok: true, state, ...state.waveKills[id] };
}

// ✅ Reset des kills intra-vague (passage à la vague suivante).
export function resetGalaxyGateWaveKills(stateInput, gateId, wave) {
  const state = normalizeGalaxyGateState(stateInput);
  const id = String(gateId || "").toLowerCase();
  if (!GALAXY_GATE_DEFINITIONS[id]) return { ok: false, state };
  const w = normalizeGalaxyGateWave(id, wave);
  state.waveKills ||= {};
  state.waveKills[id] = { wave: w, killed: 0 };
  return { ok: true, state };
}

// ✅ Suppression des kills intra-vague (GG terminée ou perdue).
export function clearGalaxyGateWaveKills(stateInput, gateId) {
  const state = normalizeGalaxyGateState(stateInput);
  const id = String(gateId || "").toLowerCase();
  if (!GALAXY_GATE_DEFINITIONS[id]) return { ok: false, state };
  state.waveKills ||= {};
  state.waveKills[id] = { wave: 0, killed: 0 };
  return { ok: true, state };
}

export function completeActiveGalaxyGate(stateInput, gateId) {
  const state = normalizeGalaxyGateState(stateInput);
  const id = String(gateId || "").toLowerCase();
  if (state.active !== id) return { ok: false, state };
  state.active = null;
  state.activeWave = 1;
  state.waves[id] = 0;
  state.waveKills ||= {};
  state.waveKills[id] = { wave: 0, killed: 0 };
  state.lives[id] = GALAXY_GATE_DEFINITIONS[id].maxLives;
  state.completed[id]++;
  // ✅ auto-placement du stock : si une GG était en stock 1/1 pendant le run,
  // elle est posée automatiquement sur la map dès la fin de la gate.
  let autoDeployed = null;
  if (state.built[id] > 0 && state.deployed[id] !== true) {
    state.built[id]--;
    state.deployed[id] = true;
    state.lives[id] = GALAXY_GATE_DEFINITIONS[id].maxLives;
    autoDeployed = id;
  }
  // One completion contributes one piece, capped at this source gate's quota.
  if (KRONOS_PARTS_BY_GATE[id] && state.built.kronos < GALAXY_GATE_BUILD_LIMIT) {
    state.kronosParts[id] = Math.min(KRONOS_PARTS_BY_GATE[id], state.kronosParts[id] + 1);
  }
  return { ok: true, state: normalizeGalaxyGateState(state), autoDeployed };
}

export function loseGalaxyGateLife(stateInput, gateId) {
  const state = normalizeGalaxyGateState(stateInput);
  const id = String(gateId || "").toLowerCase();
  if (!GALAXY_GATE_DEFINITIONS[id] || state.active !== id) return { ok: false, state, exhausted: false };
  state.lives[id] = Math.max(0, state.lives[id] - 1);
  const exhausted = state.lives[id] === 0;
  if (exhausted) {
    state.active = null;
    state.activeWave = 1;
    state.waves[id] = 0;
    // ✅ GG perdue : la progression intra-vague est effacée (prochain run
    // repart de zéro) et les ressources non ramassées seront purgées côté moteur.
    state.waveKills ||= {};
    state.waveKills[id] = { wave: 0, killed: 0 };
  } else {
    state.waves[id] = Math.min(GALAXY_GATE_DEFINITIONS[id].maxWaves, Math.max(1, state.activeWave));
  }
  return { ok: true, state, exhausted, lives: state.lives[id] };
}
