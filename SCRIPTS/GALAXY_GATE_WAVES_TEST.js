import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { GALAXY_GATE_DEFINITIONS, normalizeGalaxyGateState, normalizeGalaxyGateWave, completeActiveGalaxyGate,
  recordGalaxyGateWaveKill, getGalaxyGateWaveKills, resetGalaxyGateWaveKills, rollGalaxyGateResourceRewards, galaxyGateXenomitForCredits, galaxyGateMaterialAmountForCredits, spinGalaxyGate } from "../SRC/CORE/GALAXY_GATES.js";
import { remainingWaveSpawns, createWaveSpawnState } from "../SRC/CORE/WAVES.js";
import { NPC_TYPES } from "../NPC/NPC_TYPES.js";
import { getWavePlan as lambdaPlan } from "../MAPS/LAMBDA_MAP/WAVES.js";
import { getResourceName, getResourceIcon, cargoUsed, cargoAdd } from "../SRC/DATA/RESOURCES.js";
import { GALAXY_GATE_DRONE_DESIGN_DROPS, rollGalaxyGateDroneDesignReward, galaxyGateDroneDesignRewardMessage } from '../SRC/CORE/GALAXY_GATES.js';
import { KRONOS_PARTS_BY_GATE, consumeBuiltGalaxyGate } from '../SRC/CORE/GALAXY_GATES.js';
import { GALAXY_GATE_EQUIPMENT_DROPS, rollGalaxyGateEquipmentReward, galaxyGateEquipmentRewardMessage } from '../SRC/CORE/GALAXY_GATES.js';
import { findCatalogItem } from '../SRC/CORE/CATALOG.js';
import { getPortalSkinForMap } from '../SRC/CORE/PORTAL_SKINS.js';

test('Kronos : le saut sans animation reste dans les six images existantes', () => {
  const context = vm.createContext({});
  vm.runInContext(engineFunction('getPortalFrameSrc'), context);
  const skin = getPortalSkinForMap('kronos');
  const pack = { path: skin.jumpFxPath, frames: skin.jumpFxFrames, firstNumber: 1, ext: '.png' };
  assert.equal(context.getPortalFrameSrc(pack, 9), 'ASSETS/KRONOS_PORTAL/JUMP_FX/6.png');
  for (let index = 0; index < pack.frames; index++) {
    assert.ok(readFileSync(new URL('../' + context.getPortalFrameSrc(pack, index), import.meta.url)).length > 0);
  }
  assert.equal(context.getPortalFrameSrc({ ...pack, frames: 30 }, 9), 'ASSETS/KRONOS_PORTAL/JUMP_FX/10.png');
});

test('Epsilon : 50% Anchorlock, un laser maximum, tirage resolu conserve et catalogue equipable', () => {
  const drop = GALAXY_GATE_EQUIPMENT_DROPS.epsilon;
  assert.deepEqual(drop, { itemId: 'laser_lf5al', chance: 0.5 });
  let wins = 0;
  for (let i = 0; i < 100; i++) {
    let draws = 0;
    const reward = rollGalaxyGateEquipmentReward(drop, () => { draws++; return (i + 0.5) / 100; });
    assert.equal(draws, 1);
    wins += reward.amount;
    assert.deepEqual(rollGalaxyGateEquipmentReward(reward, () => { throw new Error('pas de nouveau tirage'); }), reward);
    assert.equal(galaxyGateEquipmentRewardMessage(reward), reward.amount ? '1x LF-5 Anchorlock reçu' : 'Aucun équipement reçu');
  }
  assert.equal(wins, 50);
  assert.equal(rollGalaxyGateEquipmentReward(drop, () => 0.5).amount, 0);
  assert.equal(rollGalaxyGateEquipmentReward(undefined), null);
  assert.equal(galaxyGateEquipmentRewardMessage(null), null);
  const item = findCatalogItem(drop.itemId);
  assert.equal(item.shopHidden, true);
  assert.equal(item.module.type, 'laser');
  assert.equal(item.module.damage, 265);
});

test('Kronos : une piece par completion, quotas independants et nouvelle construction', () => {
  let state = normalizeGalaxyGateState({});
  for (const [id, required] of Object.entries(KRONOS_PARTS_BY_GATE)) {
    for (let run = 1; run <= required; run++) {
      state = completeActiveGalaxyGate({ ...state, active: id }, id).state;
      if (id !== 'lambda' || run !== required) {
        assert.equal(state.kronosParts[id], run);
        assert.equal(state.parts.kronos, Object.values(state.kronosParts).reduce((a, b) => a + b, 0));
        assert.equal(state.deployed.kronos, false, 'toutes les sources sont necessaires');
      }
    }
    if (id !== 'lambda') {
      const before = structuredClone(state);
      state = completeActiveGalaxyGate({ ...state, active: id }, id).state;
      assert.equal(state.parts.kronos, before.parts.kronos, 'une source complete ne donne pas de piece supplementaire');
    }
  }
  assert.equal(state.deployed.kronos, true);
  assert.equal(state.parts.kronos, 0);
  assert.ok(Object.values(state.kronosParts).every(n => n === 0));
  state = completeActiveGalaxyGate({ ...state, active: 'alpha' }, 'alpha').state;
  assert.equal(state.kronosParts.alpha, 1, 'la prochaine construction peut commencer');
  assert.equal(state.parts.kronos, 1);
  const entered = consumeBuiltGalaxyGate(state, 'kronos');
  assert.equal(entered.ok, true);
  assert.equal(entered.state.kronosParts.alpha, 1, 'entrer dans Kronos conserve la prochaine construction');
});

test('Kronos : migration conserve le total acquis et normalization preserve les sources', () => {
  for (let total = 0; total < 21; total++) {
    const migrated = normalizeGalaxyGateState({ parts: { kronos: total }, completed: { alpha: 1, beta: 1 } });
    assert.equal(migrated.parts.kronos, total);
    assert.equal(Object.values(migrated.kronosParts).reduce((a, b) => a + b, 0), total);
    assert.deepEqual(normalizeGalaxyGateState(migrated), migrated);
  }
  const state = normalizeGalaxyGateState({ kronosParts: { alpha: 1, beta: 2, epsilon: 999, delta: -5, lambda: Infinity } });
  assert.equal(state.kronosParts.alpha, 1);
  assert.equal(state.kronosParts.beta, 2);
  assert.equal(state.kronosParts.epsilon, 4);
  assert.equal(state.kronosParts.delta, 0);
  assert.equal(state.kronosParts.lambda, 0);
  assert.equal(state.parts.kronos, 7);
  const stock = normalizeGalaxyGateState({ active: 'kronos', built: { kronos: 1 } });
  assert.equal(completeActiveGalaxyGate({ ...stock, active: 'alpha', deployed: { kronos: true } }, 'alpha').state.kronosParts.alpha, 0);
});

const engine = readFileSync(new URL("../SRC/CORE/ORBIT_ENGINE.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const mainSource = readFileSync(new URL("../SRC/MAIN.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const multiServerSource = readFileSync(new URL("../SCRIPTS/MULTI_SERVER.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("Eternal : le boot restaure l'instance et le garde lit bien la map du hangar", () => {
  assert.match(mainSource, /eternalGate\?\.inRun === true[\s\S]*mapName = "eternal"/);
  assert.match(engine, /String\(hs\?\.map \|\| ""\)\.toLowerCase\(\) === "eternal"/);
  assert.doesNotMatch(engine, /String\(hs\?\.mapId \|\| ""\)\.toLowerCase\(\) === "eternal"/);
});

test("Eternal : une reprise apres redemarrage est annoncee et autorisee comme instance", () => {
  const start = engine.indexOf("async function startGame()");
  const wait = engine.indexOf("const linked = await waitNetLink", start);
  const instance = engine.indexOf("setNetInstanceMode(!isZoneMap)", start);
  assert.ok(start >= 0 && instance > start && instance < wait,
    "instance:true doit etre configure avant le premier hello");
  assert.match(multiServerSource,
    /nextMap === "eternal"[\s\S]*eternalGate\?\.deployed === true[\s\S]*eternalGate\?\.inRun === true/);
  assert.match(multiServerSource, /\|\| eternalRun\)\) arrival = \{ instance: true \}/);
});
test('Kronos : recompenses de base et ressources proportionnelles aux 75 millions de credits', () => {
  const reward = GALAXY_GATE_DEFINITIONS.kronos.completion;
  assert.equal(reward.credits, 75000000);
  assert.equal(reward.honor, 1000000);
  assert.equal(reward.exp, 75000000);
  assert.equal(reward.x4, 100000);
  assert.equal(reward.energy, 300);
  assert.equal(reward.xenomit, 1875);
  assert.deepEqual(reward.resources, { kyhalon: 75, tetrathrin: 75, bifenon: 75, schism: 7, diametrion: 37 });
});
test('GG : probabilites exactes, un CPU par gain et un seul tirage par completion', () => {
  const expected = { delta: ['hermes', 33], zeta: ['havoc', 45], kappa: ['hercules', 25], kronos: ['saturn', 100] };
  for (const [id, [design, percentage]] of Object.entries(expected)) {
    const drop = GALAXY_GATE_DRONE_DESIGN_DROPS[id];
    assert.equal(drop.itemId, `drone_design_${design}`);
    assert.equal(drop.chance, percentage / 100);
    let won = 0;
    for (let i = 0; i < 100; i++) {
      const reward = rollGalaxyGateDroneDesignReward(drop, () => (i + 0.5) / 100);
      assert.ok(reward.amount === 0 || reward.amount === 1);
      won += reward.amount;
      assert.deepEqual(rollGalaxyGateDroneDesignReward(reward, () => { throw new Error('pas de second tirage'); }), reward);
      assert.equal(galaxyGateDroneDesignRewardMessage(reward), reward.amount ? `1x Design de drones ${design} reçu` : 'Aucun Design de drones reçu');
    }
    assert.equal(won, percentage);
    if (percentage < 100) assert.equal(rollGalaxyGateDroneDesignReward(drop, () => drop.chance).amount, 0);
  }
  for (const id of ['alpha','beta','gamma','epsilon','lambda']) assert.equal(rollGalaxyGateDroneDesignReward(GALAXY_GATE_DRONE_DESIGN_DROPS[id]), null);
});
test('GG : le premier spin et les suivants memorisent la gate choisie quelle que soit la recompense', () => {
  for (const gate of Object.values(GALAXY_GATE_DEFINITIONS).filter(gate => gate.group)) {
    for (const roll of [0.1, 0.25, 0.4, 0.98]) {
      const input = { energy: 10, lastOpenedGate: 'alpha' };
      const first = spinGalaxyGate(input, gate.id, 1, 0, () => roll);
      assert.equal(first.ok, true);
      assert.equal(first.state.lastOpenedGate, gate.id, `${gate.id} : premier spin ${roll}`);
      assert.equal(first.state.history.at(-1).gate, gate.id);
      const next = spinGalaxyGate(first.state, gate.id, 3, first.credits, () => roll);
      assert.equal(next.state.lastOpenedGate, gate.id, `${gate.id} : spins suivants ${roll}`);
      if (gate.group === 'ensemble' && roll === 0.1) {
        assert.equal(first.rewards.partsByGate.alpha, 1, 'les pieces ABG restent partagees entre les trois gates');
      }
      assert.equal(input.lastOpenedGate, 'alpha', 'la sauvegarde source reste intacte');
    }
  }
});
test('GG : Xenomit proportionnel aux credits finaux, et automatiquement recalcule si le montant change', () => {
  const expected = { alpha: 500, beta: 875, gamma: 1250, delta: 1625, epsilon: 750, zeta: 1125, kappa: 1500, lambda: 375, kronos: 1875 };
  for (const [id, amount] of Object.entries(expected)) {
    assert.equal(GALAXY_GATE_DEFINITIONS[id].completion.xenomit, amount);
    assert.equal(galaxyGateXenomitForCredits(GALAXY_GATE_DEFINITIONS[id].completion.credits), amount);
  }
  assert.equal(galaxyGateXenomitForCredits(40000000), 1000);
  assert.equal(galaxyGateXenomitForCredits(20039999), 500, 'arrondi a l entier inferieur');
  for (const credits of [0, -40000, NaN, Infinity]) assert.equal(galaxyGateXenomitForCredits(credits), 0);
});
test('toutes les GG : 20 de chaque materiau pour 20 millions de credits finaux', () => {
  const expected = { alpha: 20, beta: 35, gamma: 50, delta: 65, epsilon: 30, zeta: 45, kappa: 60, lambda: 15, kronos: 75 };
  for (const [id, amount] of Object.entries(expected)) {
    assert.deepEqual(GALAXY_GATE_DEFINITIONS[id].completion.resources, {
      kyhalon: amount, tetrathrin: amount, bifenon: amount, schism: Math.floor(amount / 10), diametrion: Math.floor(amount / 2) });
  }
  assert.equal(galaxyGateMaterialAmountForCredits(40000000), 40);
  assert.equal(galaxyGateMaterialAmountForCredits(20999999), 20);
  for (const credits of [0, -1000000, NaN, Infinity]) assert.equal(galaxyGateMaterialAmountForCredits(credits), 0);
});
test('GG : les montants des materiaux restent identiques a la distribution differee', () => {
  for (const gate of Object.values(GALAXY_GATE_DEFINITIONS)) {
    const noRandom = () => { throw new Error('aucun tirage aleatoire pour les recompenses fixes'); };
    const reward = rollGalaxyGateResourceRewards(gate.completion.resources, noRandom);
    assert.deepEqual(reward, gate.completion.resources);
    assert.deepEqual(rollGalaxyGateResourceRewards(reward, noRandom), reward);
  }
});
test('Schism et Diametrion : icones disponibles et aucun espace de soute utilise', () => {
  const manifest = JSON.parse(readFileSync(new URL('../ASSETS_MANIFEST.json', import.meta.url), 'utf8'));
  for (const [id, label] of [['schism', 'Schism'], ['diametrion', 'Diamétrion']]) {
    assert.equal(getResourceName(id), label);
    const icon = getResourceIcon(id);
    assert.ok(readFileSync(new URL('..' + icon, import.meta.url)).length > 0);
    assert.ok(manifest.assets.includes('.' + icon));
    assert.equal(cargoUsed({ prometium: 3000, [id]: 100 }), 3000);
    assert.equal(cargoAdd({ prometium: 3000 }, id, 100).added, 100);
  }
});
function engineFunction(name) {
  const from = engine.indexOf(`function ${name}(`), to = engine.indexOf("\n}", from);
  assert.ok(from >= 0 && to > from);
  return engine.slice(from, to + 2);
}
function fixture(id = "lambda", plan = lambdaPlan(7)) {
  const state = normalizeGalaxyGateState({}); state.active = id;
  const c = vm.createContext({ window: { __CURRENT_MAP_ID__: id }, rules: { mode: "gate" },
    GALAXY_GATE_DEFINITIONS, wave: GALAXY_GATE_DEFINITIONS[id].maxWaves,
    waveSpawns: { remaining: 0 }, currentWavePlan: plan, enemies: [],
    gateCompletionPending: false, mapSwitchInProgress: false, completions: 0, state,
    runOnKillAction(action) {
      assert.equal(action.tp.factionBase, true);
      const result = completeActiveGalaxyGate(c.state, id);
      assert.equal(result.ok, true); c.state = result.state;
      c.completions++; c.gateCompletionPending = true;
    } });
  vm.runInContext(engineFunction("tryCompleteClearedGalaxyGate"), c);
  return c;
}

test("GG : chaque nombre de vagues correspond au plan et Lambda en contient sept", async () => {
  assert.equal(GALAXY_GATE_DEFINITIONS.lambda.maxWaves, 7);
  for (const gate of Object.values(GALAXY_GATE_DEFINITIONS)) {
    const { WAVE_PLANS, getWavePlan } = await import(`../MAPS/${gate.id.toUpperCase()}_MAP/WAVES.js`);
    assert.equal(WAVE_PLANS.length - 1, gate.maxWaves, gate.id);
    assert.ok(getWavePlan(gate.maxWaves).spawns.some(spawn => spawn.onKill?.tp?.factionBase), gate.id);
    for (let wave = 1; wave <= gate.maxWaves; wave++) {
      const plan = getWavePlan(wave);
      assert.ok(plan.spawns.length > 0, `${gate.id} : vague ${wave}`);
      for (const spawn of plan.spawns) {
        assert.ok(NPC_TYPES[spawn.type], `${gate.id} : type inconnu ${spawn.type}`);
        assert.ok(Number.isInteger(spawn.count) && spawn.count > 0);
      }
    }
    for (const invalid of [0, -1, gate.maxWaves + 1, gate.maxWaves + 100, Infinity, NaN, 1.5]) {
      assert.deepEqual(getWavePlan(invalid).spawns, [], `${gate.id} : aucun recyclage de la finale (${invalid})`);
    }
  }
});

test("toutes les GG : fin unique dans les deux ordres de kills, jamais avant la fin des apparitions", async () => {
  for (const gate of Object.values(GALAXY_GATE_DEFINITIONS)) {
    const { getWavePlan } = await import(`../MAPS/${gate.id.toUpperCase()}_MAP/WAVES.js`);
    const plan = getWavePlan(gate.maxWaves);
    for (const reverse of [false, true]) {
      const c = fixture(gate.id, plan);
      const enemies = plan.spawns.flatMap(spawn => Array.from({ length: spawn.count }, () => ({ type: spawn.type, hp: 1 })));
      c.enemies = reverse ? enemies.reverse() : enemies;
      c.waveSpawns.remaining = 1;
      assert.equal(c.tryCompleteClearedGalaxyGate(), false);
      c.waveSpawns.remaining = 0;
      while (c.enemies.length) {
        c.enemies[0].hp = 0;
        assert.equal(c.tryCompleteClearedGalaxyGate(), false, `${gate.id} : attendre la transaction du kill`);
        c.enemies.shift();
        assert.equal(c.tryCompleteClearedGalaxyGate(), c.enemies.length === 0, gate.id);
      }
      for (let frame = 0; frame < 100; frame++) assert.equal(c.tryCompleteClearedGalaxyGate(), true);
      assert.equal(c.completions, 1); assert.equal(c.state.completed[gate.id], 1);
    }
  }
});

test("GG : limites appliquees des la premiere lecture des anciennes sauvegardes et au changement de vague", () => {
  for (const gate of Object.values(GALAXY_GATE_DEFINITIONS)) {
    for (const value of [gate.maxWaves + 1, 9999]) {
      const restored = normalizeGalaxyGateState({ active: gate.id, activeWave: value });
      assert.equal(restored.activeWave, gate.maxWaves);
      assert.equal(restored.waves[gate.id], gate.maxWaves);
      assert.equal(normalizeGalaxyGateWave(gate.id, value), gate.maxWaves);
      assert.equal(resetGalaxyGateWaveKills(restored, gate.id, value).state.waveKills[gate.id].wave, gate.maxWaves);
      assert.equal(recordGalaxyGateWaveKill(restored, gate.id, value).wave, gate.maxWaves);
    }
  }
});

test("Lambda et Kronos : la reprise garde le boss vivant lorsque les escortes meurent en premier", async () => {
  for (const id of ["lambda", "kronos"]) {
    const gate = GALAXY_GATE_DEFINITIONS[id];
    const { getWavePlan } = await import(`../MAPS/${id.toUpperCase()}_MAP/WAVES.js`);
    const plan = getWavePlan(gate.maxWaves), escort = plan.spawns.find(spawn => !spawn.onKill);
    let state = normalizeGalaxyGateState({ active: id, activeWave: gate.maxWaves });
    for (let kill = 0; kill < escort.count; kill++) state = recordGalaxyGateWaveKill(state, id, gate.maxWaves, 1, escort.type).state;
    state = normalizeGalaxyGateState(JSON.parse(JSON.stringify(state)));
    const remaining = remainingWaveSpawns(plan.spawns, getGalaxyGateWaveKills(state, id));
    assert.equal(remaining.length, 1); assert.equal(remaining[0].type, plan.spawns[0].type);
    assert.equal(remaining[0].count, plan.spawns[0].count, `${id} : le boss ne disparait pas a la reprise`);
    const c = fixture(id, plan);
    c.enemies = remaining.map(spawn => ({ type: spawn.type, hp: 100 }));
    assert.equal(c.tryCompleteClearedGalaxyGate(), false);
    c.enemies.length = 0; assert.equal(c.tryCompleteClearedGalaxyGate(), true);
  }
});

test("Zeta : les gardes de phases ne comptent pas comme NPC du plan et ne font pas disparaitre Devourer", async () => {
  const { getWavePlan } = await import("../MAPS/ZETA_MAP/WAVES.js");
  const plan = getWavePlan(10), user = { galaxyGates: normalizeGalaxyGateState({ active: "zeta", activeWave: 10 }) };
  const c = vm.createContext({ window: { __CURRENT_MAP_ID__: "zeta" }, rules: { mode: "gate" },
    GALAXY_GATE_DEFINITIONS, wave: 10, betweenWaves: false, currentWavePlan: plan, account: { user },
    recordCurrentUserGalaxyGateWaveKill(id, wave, count, currentUser, type) {
      currentUser.galaxyGates = recordGalaxyGateWaveKill(currentUser.galaxyGates, id, wave, count, type).state;
      return { ok: true, user: currentUser };
    } });
  const from = engine.indexOf('      const killedGateId = String(window.__CURRENT_MAP_ID__'),
    to = engine.indexOf('    // Le dernier kill est recompense', from);
  assert.ok(from > 0 && to > from);
  vm.runInContext(`function recordKill(e) { try { ${engine.slice(from, to)} }`, c);
  for (let kill = 0; kill < 4; kill++) c.recordKill({ type: "npc_Infernal_zeta", _bossPhaseMinion: true });
  assert.equal(getGalaxyGateWaveKills(user.galaxyGates, "zeta").killed, 0);
  for (let kill = 0; kill < 2; kill++) c.recordKill({ type: "npc_Infernal_zeta", _gateWave: 10 });
  const remaining = remainingWaveSpawns(plan.spawns, getGalaxyGateWaveKills(user.galaxyGates, "zeta"));
  assert.deepEqual(remaining.map(spawn => spawn.type), ["npc_Devourer_zeta"]);
});

test("GG : reprise des anciens compteurs, migration progressive et nouvelle vague sans anciens kills", () => {
  const plan = lambdaPlan(7).spawns;
  const legacy = { active: "lambda", activeWave: 7, waveKills: { lambda: { wave: 7, killed: 1 } } };
  assert.deepEqual(remainingWaveSpawns(plan, getGalaxyGateWaveKills(legacy, "lambda")).map(spawn => spawn.count), [1, 20]);
  const updated = recordGalaxyGateWaveKill(legacy, "lambda", 7, 1, "npc_Boss_Kristallin_lambda").state;
  const remaining = remainingWaveSpawns(plan, getGalaxyGateWaveKills(updated, "lambda"));
  assert.deepEqual(remaining.map(spawn => spawn.count), [1, 19]);
  const reset = resetGalaxyGateWaveKills(updated, "lambda", 6);
  assert.deepEqual(getGalaxyGateWaveKills(reset.state, "lambda"), { wave: 6, killed: 0 });
  const queue = createWaveSpawnState(); queue.load(remaining);
  assert.equal(queue.remaining, 20);
  assert.deepEqual(plan.map(spawn => spawn.count), [2, 20], "le plan d'origine reste intact");
});

test("GG : beginWave borne une ancienne vague trop haute et reprend les types sauvegardes", () => {
  const progress = { wave: 7, killed: 20, byType: { npc_Boss_Kristallin_lambda: 20 } };
  const c = vm.createContext({ window: { __CURRENT_MAP_ID__: "lambda" }, rules: { mode: "gate" },
    GALAXY_GATE_DEFINITIONS, normalizeGalaxyGateWave, remainingWaveSpawns,
    wave: 999, getWavePlan: lambdaPlan, getCurrentUserGalaxyGateWaveKills: () => progress,
    waveSpawns: createWaveSpawnState(), portal: {}, gateReturnPortal: {},
    ui: { portalOverlay: { style: {} }, nextWaveBtn: {} },
    GATE_WAVE_COUNTDOWN_SECONDS: 5, updateWaveCountdownNotice() {} });
  vm.runInContext(engineFunction("beginWave"), c); c.beginWave();
  assert.equal(c.wave, 7); assert.equal(c.waveSpawns.remaining, 2);
  assert.equal(c.waveSpawns.peek().type, "npc_Boss_Kristallon_lambda");
});

test("GG : un changement de carte ne valide pas la gate en voyant sa liste NPC purgee", () => {
  const c = fixture(); c.mapSwitchInProgress = true;
  Object.assign(c, { started: true, player: { dead: false }, betweenWaves: false, waveStartCountdown: 0 });
  const from = engine.indexOf("function waveController("), to = engine.indexOf("// Multi : kamikaze partage", from);
  vm.runInContext(engine.slice(from, to), c);
  c.waveController(1); assert.equal(c.completions, 0);
  assert.equal(c.tryCompleteClearedGalaxyGate(), true); assert.equal(c.completions, 0);
  c.mapSwitchInProgress = false;
  assert.equal(c.tryCompleteClearedGalaxyGate(), true); assert.equal(c.completions, 1);
});

test("Lambda : boss tues en premier ou en dernier, fin unique apres les 22 NPC", () => {
  const from = engine.indexOf('    if (e._onKill && !(e._netUid && netplayNpcActive())) {');
  const to = engine.indexOf('    if (e.type === "npc_Protegit"', from);
  assert.ok(from > 0 && to > from);
  for (const bossFirst of [true, false]) {
    const c = fixture(), plan = lambdaPlan(7);
    const enemies = plan.spawns.flatMap(spawn => Array.from({ length: spawn.count }, () => ({
      type: spawn.type, hp: 1, _onKill: spawn.onKill })));
    c.enemies = bossFirst ? enemies : enemies.reverse();
    c.netplayNpcActive = () => false; c.isEntityJammed = () => true;
    vm.runInContext(`function handleDeath(e) { ${engine.slice(from, to)} }`, c);
    while (c.enemies.length) {
      const enemy = c.enemies[0]; enemy.hp = 0;
      c.handleDeath(enemy);
      assert.equal(c.completions, 0, "le onKill du boss attend la validation de toute la vague");
      assert.equal(c.tryCompleteClearedGalaxyGate(), false, "dernier kill pas encore credite/retire");
      c.enemies.shift();
      const finished = c.tryCompleteClearedGalaxyGate();
      assert.equal(finished, c.enemies.length === 0);
    }
    assert.equal(c.completions, 1); assert.equal(c.state.completed.lambda, 1);
    assert.equal(c.tryCompleteClearedGalaxyGate(), true); assert.equal(c.completions, 1);
  }
});

test("GG : attente de la file de spawn, renforts hors plan ignores et reprise sans boss conservee", () => {
  const c = fixture(); c.waveSpawns.remaining = 20;
  assert.equal(c.tryCompleteClearedGalaxyGate(), false);
  assert.equal(c.completions, 0);
  c.waveSpawns.remaining = 0; c.enemies = [{ type: "npc_Protegit", hp: 100 }];
  assert.equal(c.tryCompleteClearedGalaxyGate(), true); assert.equal(c.completions, 1);
  const resumed = fixture();
  assert.equal(resumed.tryCompleteClearedGalaxyGate(), true, "reprise : aucun besoin de l'ancien objet boss");
});

test("GG : aucune completion sur une vague intermediaire ou sur une carte normale", () => {
  const c = fixture(); c.wave = 6;
  assert.equal(c.tryCompleteClearedGalaxyGate(), false);
  c.wave = 7; c.rules.mode = "zone";
  assert.equal(c.tryCompleteClearedGalaxyGate(), false); assert.equal(c.completions, 0);
});

test("Lambda : le controleur termine la gate sans ouvrir de portail vers une vague huit", () => {
  const c = fixture();
  Object.assign(c, { started: true, player: { dead: false }, betweenWaves: false,
    waveStartCountdown: 0, MAX_ALIVE: 30,
    onWaveCleared() { throw new Error("aucun portail Continuer apres la vague sept"); } });
  const from = engine.indexOf("function waveController("), to = engine.indexOf("// Multi : kamikaze partage", from);
  assert.ok(from > 0 && to > from);
  vm.runInContext(engine.slice(from, to), c);
  c.waveController(1 / 60); c.waveController(1 / 60);
  assert.equal(c.wave, 7); assert.equal(c.completions, 1);
});

test("GG : un portail Continuer residuel ne depasse pas la derniere vague", () => {
  for (const gate of Object.values(GALAXY_GATE_DEFINITIONS)) {
    let finishes = 0;
    const c = vm.createContext({ isZoneMap: false, betweenWaves: true, mapSwitchInProgress: false,
      window: { __CURRENT_MAP_ID__: gate.id }, GALAXY_GATE_DEFINITIONS, wave: gate.maxWaves,
      getInteractivePortals: () => [], advanceGatePortalJumps: () => ({ action: "continue" }),
      tryCompleteClearedGalaxyGate: () => { finishes++; return true; } });
    vm.runInContext(engineFunction("tickGatePortalJumps"), c);
    assert.equal(c.tickGatePortalJumps(1), true);
    assert.equal(c.wave, gate.maxWaves, gate.id); assert.equal(finishes, 1);
  }
});
