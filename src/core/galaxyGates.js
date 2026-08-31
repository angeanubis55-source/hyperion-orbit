"use strict";

export const GALAXY_GATE_DEFINITIONS = Object.freeze({
  alpha: Object.freeze({ id: "alpha", name: "Alpha", requiredParts: 34, maxWaves: 11, image: "assets/Alpha_Portal/désactivé.png", completion: Object.freeze({ exp: 4000000, honor: 100000, credits: 4000000, x4: 20000 }), rewardScale: 1 }),
  beta: Object.freeze({ id: "beta", name: "Beta", requiredParts: 48, maxWaves: 11, image: "assets/Beta_Portal/désactivé.png", completion: Object.freeze({ exp: 8000000, honor: 200000, credits: 8000000, x4: 40000 }), rewardScale: 2 }),
  gamma: Object.freeze({ id: "gamma", name: "Gamma", requiredParts: 82, maxWaves: 11, image: "assets/Gamma_Portal/désactivé.png", completion: Object.freeze({ exp: 12000000, honor: 300000, credits: 12000000, x4: 60000 }), rewardScale: 3 }),
});

export const GALAXY_SPIN_CREDIT_COST = 100000;
export const GALAXY_GATE_BUILD_LIMIT = 1;

export function normalizeGalaxyGateState(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const state = {
    energy: Math.max(0, Math.floor(Number(source.energy) || 0)),
    parts: {},
    built: {},
    deployed: {},
    completed: {},
    multipliers: {},
    multiplierArmed: {},
    active: GALAXY_GATE_DEFINITIONS[String(source.active || "").toLowerCase()] ? String(source.active).toLowerCase() : null,
    activeWave: Math.max(1, Math.floor(Number(source.activeWave) || 1)),
    lastOpenedGate: GALAXY_GATE_DEFINITIONS[String(source.lastOpenedGate || "").toLowerCase()] ? String(source.lastOpenedGate).toLowerCase() : "alpha",
    history: Array.isArray(source.history) ? source.history.slice(-30) : [],
  };
  for (const gate of Object.values(GALAXY_GATE_DEFINITIONS)) {
    state.parts[gate.id] = Math.min(gate.requiredParts - 1, Math.max(0, Math.floor(Number(source.parts?.[gate.id]) || 0)));
    state.built[gate.id] = Math.min(GALAXY_GATE_BUILD_LIMIT, Math.max(0, Math.floor(Number(source.built?.[gate.id]) || 0)));
    if (state.built[gate.id] >= GALAXY_GATE_BUILD_LIMIT) state.parts[gate.id] = 0;
    state.deployed[gate.id] = source.deployed?.[gate.id] === true;
    state.completed[gate.id] = Math.max(0, Math.floor(Number(source.completed?.[gate.id]) || 0));
    state.multipliers[gate.id] = Math.min(5, Math.max(1, Math.floor(Number(source.multipliers?.[gate.id]) || 1)));
    state.multiplierArmed[gate.id] = source.multiplierArmed?.[gate.id] === true && state.multipliers[gate.id] > 1;
  }
  return state;
}

export function spinGalaxyGate(stateInput, gateId, count = 1, credits = 0, rng = Math.random) {
  const state = normalizeGalaxyGateState(stateInput);
  const gate = GALAXY_GATE_DEFINITIONS[String(gateId || "").toLowerCase()];
  if (!gate) return { ok: false, error: "Galaxy Gate inconnue.", state, credits };
  const spins = Math.min(100, Math.max(1, Math.floor(Number(count) || 1)));
  let balance = Math.max(0, Math.floor(Number(credits) || 0));
  const rewards = {
    parts: 0,
    partsByGate: { alpha: 0, beta: 0, gamma: 0 },
    built: 0,
    builtByGate: { alpha: 0, beta: 0, gamma: 0 },
    duplicates: [],
    multiplierApplied: null,
    multiplierApplications: [],
    credits: 0,
    energy: 0,
    ammo: { x2: 0, x3: 0, x4: 0 },
  };
  let performed = 0;

  const randomGate = () => {
    const gates = Object.values(GALAXY_GATE_DEFINITIONS);
    return gates[Math.min(gates.length - 1, Math.floor(Math.max(0, Math.min(0.999999, Number(rng()) || 0)) * gates.length))];
  };
  const registerDuplicate = (duplicateGate) => {
    const current = state.multipliers[duplicateGate.id];
    state.multipliers[duplicateGate.id] = Math.min(5, current + 1);
    state.lastOpenedGate = duplicateGate.id;
    if (state.multipliers[duplicateGate.id] >= 5) state.multiplierArmed[duplicateGate.id] = true;
    rewards.duplicates.push({ gate: duplicateGate.id, multiplier: state.multipliers[duplicateGate.id] });
  };
  const applyArmedMultiplier = (rewardType, rewardId, baseAmount, maximum = Infinity) => {
    const candidates = [state.lastOpenedGate, gate.id, ...Object.keys(GALAXY_GATE_DEFINITIONS)];
    const multiplierGateId = candidates.find((id, index) => candidates.indexOf(id) === index
      && state.multiplierArmed[id] === true
      && state.multipliers[id] > 1);
    if (!multiplierGateId) return Math.min(baseAmount, maximum);
    const multiplier = state.multipliers[multiplierGateId];
    const amount = Math.min(baseAmount * multiplier, maximum);
    const application = { gate: multiplierGateId, multiplier, spin: performed, rewardType, rewardId, amount };
    rewards.multiplierApplied ||= application;
    rewards.multiplierApplications.push(application);
    state.multiplierArmed[multiplierGateId] = false;
    state.multipliers[multiplierGateId] = 1;
    return amount;
  };

  for (let i = 0; i < spins; i++) {
    if (state.energy > 0) state.energy--;
    else if (balance >= GALAXY_SPIN_CREDIT_COST) balance -= GALAXY_SPIN_CREDIT_COST;
    else break;

    performed++;
    const roll = Math.max(0, Math.min(0.999999, Number(rng()) || 0));
    if (roll < 0.22) {
      const availableGates = Object.values(GALAXY_GATE_DEFINITIONS).filter(item => state.built[item.id] < GALAXY_GATE_BUILD_LIMIT);
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
      if (partGate) {
        state.lastOpenedGate = partGate.id;
      }
    } else if (roll < 0.32) {
      registerDuplicate(randomGate());
    } else if (roll < 0.60) {
      const amount = applyArmedMultiplier("ammo", "x2", 250);
      rewards.ammo.x2 += amount;
    } else if (roll < 0.78) {
      const amount = applyArmedMultiplier("ammo", "x3", 150);
      rewards.ammo.x3 += amount;
    } else if (roll < 0.90) {
      const amount = applyArmedMultiplier("ammo", "x4", 75);
      rewards.ammo.x4 += amount;
    } else if (roll < 0.97) {
      const amount = applyArmedMultiplier("credits", null, 50000);
      rewards.credits += amount;
    } else {
      const amount = applyArmedMultiplier("energy", null, 2);
      rewards.energy += amount;
    }
  }

  if (!performed) return { ok: false, error: `Énergie insuffisante et ${GALAXY_SPIN_CREDIT_COST.toLocaleString("fr-FR")} crédits requis par spin.`, state, credits: balance };
  state.energy += rewards.energy;
  balance += rewards.credits;
  state.history.push({ gate: gate.id, at: Date.now(), spins: performed, rewards });
  state.history = state.history.slice(-30);
  return { ok: true, state, credits: balance, performed, rewards };
}

export function setGalaxyGateMultiplierArmed(stateInput, gateId, armed = true) {
  const state = normalizeGalaxyGateState(stateInput);
  const id = String(gateId || "").toLowerCase();
  if (!GALAXY_GATE_DEFINITIONS[id] || state.multipliers[id] <= 1) return { ok: false, state };
  state.multiplierArmed[id] = armed === true;
  return { ok: true, state };
}

export function deployBuiltGalaxyGate(stateInput, gateId) {
  const state = normalizeGalaxyGateState(stateInput);
  const id = String(gateId || "").toLowerCase();
  if (!GALAXY_GATE_DEFINITIONS[id] || state.built[id] <= 0 || state.active || state.deployed[id]) {
    return { ok: false, state };
  }
  state.built[id]--;
  state.deployed[id] = true;
  return { ok: true, state };
}

export function consumeBuiltGalaxyGate(stateInput, gateId) {
  const state = normalizeGalaxyGateState(stateInput);
  const id = String(gateId || "").toLowerCase();
  if (state.active === id) return { ok: true, state, resumed: true };
  if (!GALAXY_GATE_DEFINITIONS[id] || !state.deployed[id] || state.active) return { ok: false, state };
  state.deployed[id] = false;
  state.active = id;
  state.activeWave = 1;
  return { ok: true, state };
}

export function completeActiveGalaxyGate(stateInput, gateId) {
  const state = normalizeGalaxyGateState(stateInput);
  const id = String(gateId || "").toLowerCase();
  if (state.active !== id) return { ok: false, state };
  state.active = null;
  state.activeWave = 1;
  state.completed[id]++;
  return { ok: true, state };
}
