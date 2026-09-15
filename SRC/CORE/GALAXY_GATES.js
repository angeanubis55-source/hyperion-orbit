"use strict";

export const GALAXY_GATE_DEFINITIONS = Object.freeze({
  alpha: Object.freeze({ id: "alpha", name: "Alpha", group: "ensemble", requiredParts: 34, maxWaves: 11, maxLives: 5, image: "ASSETS/ALPHA_PORTAL/DESACTIVE.png", completion: Object.freeze({ exp: 4000000, honor: 100000, credits: 12000000, x4: 20000 }), rewardScale: 1 }),
  beta: Object.freeze({ id: "beta", name: "Beta", group: "ensemble", requiredParts: 48, maxWaves: 11, maxLives: 5, image: "ASSETS/BETA_PORTAL/DESACTIVE.png", completion: Object.freeze({ exp: 8000000, honor: 200000, credits: 24000000, x4: 40000 }), rewardScale: 2 }),
  gamma: Object.freeze({ id: "gamma", name: "Gamma", group: "ensemble", requiredParts: 82, maxWaves: 11, maxLives: 5, image: "ASSETS/GAMMA_PORTAL/DESACTIVE.png", completion: Object.freeze({ exp: 12000000, honor: 300000, credits: 36000000, x4: 60000 }), rewardScale: 3 }),
});

export const GALAXY_SPIN_CREDIT_COST = 100000;
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

export function normalizeGalaxyGateState(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const state = {
    energy: Math.max(0, Math.floor(Number(source.energy) || 0)),
    parts: {},
    built: {},
    deployed: {},
    completed: {},
    lives: {},
    // ✅ multiplicateur unique partagé entre Alpha / Beta / Gamma.
    multiplier: 1,
    multiplierArmed: false,
    active: GALAXY_GATE_DEFINITIONS[String(source.active || "").toLowerCase()] ? String(source.active).toLowerCase() : null,
    activeWave: Math.max(1, Math.floor(Number(source.activeWave) || 1)),
    // ✅ progression persistée par gate : permet d'alterner librement
    // entre Alpha / Beta / Gamma sans perdre la vague atteinte.
    // 0 = jamais commencée, sinon dernière vague sauvegardée.
    waves: {},
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
  }
  // ✅ migration : ancien format 1 multiplicateur par gate -> 1 seul partagé (on garde le max).
  let sharedMultiplier = Math.min(5, Math.max(1, Math.floor(Number(source.multiplier) || 1)));
  let sharedArmed = source.multiplierArmed === true && sharedMultiplier > 1;
  for (const gate of Object.values(GALAXY_GATE_DEFINITIONS)) {
    const legacyValue = Math.min(5, Math.max(1, Math.floor(Number(source.multipliers?.[gate.id]) || 1)));
    if (legacyValue > sharedMultiplier) sharedMultiplier = legacyValue;
    if (source.multiplierArmed?.[gate.id] === true && legacyValue > 1) sharedArmed = true;
  }
  state.multiplier = sharedMultiplier;
  state.multiplierArmed = sharedArmed && sharedMultiplier > 1;
  // ✅ migration : ancien format 1 multiplicateur par gate -> 1 seul partagé (on garde le max).
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
    if (state.waves[state.active] > 0) state.activeWave = Math.min(GALAXY_GATE_DEFINITIONS[state.active].maxWaves, state.waves[state.active]);
    else state.waves[state.active] = Math.min(GALAXY_GATE_DEFINITIONS[state.active].maxWaves, state.activeWave);
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
  const registerDuplicate = (duplicateGate) => {
    state.multiplier = Math.min(5, state.multiplier + 1);
    state.lastOpenedGate = duplicateGate.id;
    if (state.multiplier >= 5) state.multiplierArmed = true;
    rewards.duplicates.push({ gate: duplicateGate.id, multiplier: state.multiplier });
  };
  const applyArmedMultiplier = (rewardType, rewardId, baseAmount, maximum = Infinity) => {
    if (state.multiplierArmed !== true || state.multiplier <= 1) return Math.min(baseAmount, maximum);
    const multiplier = state.multiplier;
    const amount = Math.min(baseAmount * multiplier, maximum);
    const application = { gate: gate.id, multiplier, spin: performed, rewardType, rewardId, amount };
    rewards.multiplierApplied ||= application;
    rewards.multiplierApplications.push(application);
    state.multiplierArmed = false;
    state.multiplier = 1;
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
      if (partGate) {
        state.lastOpenedGate = partGate.id;
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
  if (state.multiplier <= 1) return { ok: false, state };
  state.multiplierArmed = armed === true;
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

export function completeActiveGalaxyGate(stateInput, gateId) {
  const state = normalizeGalaxyGateState(stateInput);
  const id = String(gateId || "").toLowerCase();
  if (state.active !== id) return { ok: false, state };
  state.active = null;
  state.activeWave = 1;
  state.waves[id] = 0;
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
  return { ok: true, state, autoDeployed };
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
  } else {
    state.waves[id] = Math.min(GALAXY_GATE_DEFINITIONS[id].maxWaves, Math.max(1, state.activeWave));
  }
  return { ok: true, state, exhausted, lives: state.lives[id] };
}
