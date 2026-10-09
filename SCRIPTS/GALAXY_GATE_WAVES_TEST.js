import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { GALAXY_GATE_DEFINITIONS, normalizeGalaxyGateState, normalizeGalaxyGateWave, completeActiveGalaxyGate,
  recordGalaxyGateWaveKill, getGalaxyGateWaveKills, resetGalaxyGateWaveKills } from "../SRC/CORE/GALAXY_GATES.js";
import { remainingWaveSpawns, createWaveSpawnState } from "../SRC/CORE/WAVES.js";
import { NPC_TYPES } from "../NPC/NPC_TYPES.js";
import { getWavePlan as lambdaPlan } from "../MAPS/LAMBDA_MAP/WAVES.js";

const engine = readFileSync(new URL("../SRC/CORE/ORBIT_ENGINE.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
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
