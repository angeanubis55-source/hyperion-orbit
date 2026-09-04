import test from "node:test";
import assert from "node:assert/strict";

import { escapeHtml } from "../src/core/dom.js";
import { DEFAULT_MAP_ID, MAP_LOADERS, normalizeMapId } from "../src/core/mapRegistry.js";
import { clamp, circleRectResolve, dist2, movingCircleHit, segCircleHit } from "../src/core/collision.js";
import { createKeyboardState, createPointerState } from "../src/core/input.js";
import { bulletLifeForRange, damageEnemyLayers, damagePlayerLayers, drainShield } from "../src/core/combat.js";
import { createSpatialPairIndex, forEachNearbyPair, rebuildIdIndex } from "../src/core/spatialIndex.js";
import { drawCenteredImage, hpHueColor, isWorldPointVisible, screenToWorldPoint, worldToScreenPoint } from "../src/core/rendering.js";
import { createNpcEntity } from "../src/core/npcFactory.js";
import { addProjectile, advanceProjectile, createProjectile, removeProjectile } from "../src/core/projectiles.js";
import { createWaveSpawnState } from "../src/core/waves.js";
import { shouldShowNpcBars, updateProgressHud, updateResourceHud, updateWaveHud } from "../src/core/hud.js";
import { createPerformanceMonitor } from "../src/core/performanceMonitor.js";
import { computeNpcSteering, NPC_DIRECT_SPEED_FACTOR, setNpcVelocity } from "../src/core/npcAI.js";
import { getNpcSensorRanges, isNpcWithinSensor, shouldDetectNpc } from "../src/core/npcSensors.js";
import { shouldRunNpcFrame } from "../src/core/npcActivity.js";
import { pushBounded } from "../src/core/boundedCollection.js";
import { createRadiationSystem } from "../src/core/radiationSystem.js";
import { createGatePortalState, getGateReturnMap, positionGateChoicePortals } from "../src/core/gateSystem.js";
import { consumeBuiltGalaxyGate, deployBuiltGalaxyGate, GALAXY_GATE_DEFINITIONS, loseGalaxyGateLife, normalizeGalaxyGateState, setGalaxyGateMultiplierArmed, spinGalaxyGate } from "../src/core/galaxyGates.js";
import { getFactionBaseSpawn, getFactionHomeMap, getFactionRespawnMap, resolveBaseCenter } from "../src/core/factions.js";
import {
  beginGatePortalJump,
  getPortalOpenFade,
  tickGatePortalJumps,
  tickPortalVisualTransitions,
  updatePortalProximity,
} from "../src/core/portalSystem.js";
import { buildQuestJournalView, buildQuestTerminalView, formatQuestEntityName } from "../src/core/questPresentation.js";
import { drawMoveTargetMarker, drawPlayerStatus, drawToastMessage } from "../src/core/canvasHudRenderer.js";
import { getMinimapPortalColors, renderMinimap } from "../src/core/minimapRenderer.js";
import { drawBackgroundLayerSet, drawParallaxStarfield, drawWallLayer } from "../src/core/worldLayerRenderer.js";
import { advancePlayerToTarget, attractPickups, tickFloatingTexts, tickLifetimeItems, updatePlayerVelocity } from "../src/core/frameSystems.js";
import { ADMIN_RANK, PILOT_RANKS, calculateRankPoints, getLevelInfo, getNpcExperienceReward, getNpcHonorReward, getQuestExperienceReward, getQuestHonorReward, getRankInfo, grantExperience, grantHonor } from "../src/core/progression.js";
import { formatInteger } from "../src/core/numberFormat.js";
import { COLLECTABLE_SPAWN, COLLECTABLE_TYPES } from "../src/data/collectables.js";
import { GATE_MULTIPLIERS } from "../src/data/npcBalance.js";
import { NPC_TYPES } from "../src/data/npcTypes.js";
import { getZonePortals as getMmoLowPortals } from "../maps/1-3/Spawns.js";
import { getZonePortals as getEicLowPortals } from "../maps/2-3/Spawns.js";
import { getZonePortals as getVruLowPortals } from "../maps/3-3/Spawns.js";
import { getWavePlan as getLowWavePlan, LOW_COMPLETION_REWARD } from "../maps/Low_map/Waves.js";
import { getWavePlan as getQzWavePlan, QZ_COMPLETION_REWARD } from "../maps/Blighted_map/Waves.js";
import { getZonePortals as getMmoQzPortals } from "../maps/1-7/Spawns.js";
import { getZonePortals as getEicQzPortals } from "../maps/2-7/Spawns.js";
import { getZonePortals as getVruQzPortals } from "../maps/3-7/Spawns.js";
import { getZonePortals as getMmoSixPortals } from "../maps/1-6/Spawns.js";
import { getZonePortals as getMmoSevenPortals } from "../maps/1-7/Spawns.js";
import { getZonePortals as getEicSixPortals } from "../maps/2-6/Spawns.js";
import { getZonePortals as getEicSevenPortals } from "../maps/2-7/Spawns.js";
import { getZonePortals as getVruSixPortals } from "../maps/3-6/Spawns.js";
import { getZonePortals as getVruSevenPortals } from "../maps/3-7/Spawns.js";
import { CATALOG } from "../src/core/catalog.js";
import { createDrone, DRONE_FORMATIONS, DRONE_MAX_LEVEL, getDroneLevel, getDroneSpritePath, getIrisPrice } from "../src/data/drones.js";
import { MODULE_BONUS_RANGES, MODULE_ROLL_COST, MODULE_TIER_WEIGHTS } from "../src/data/moduleDrops.js";
import { appendToFitSlots, compactFitArray, compactFitDraft } from "../src/core/fitLayout.js";
import {
  QUEST_DEFINITIONS,
  MAX_ACTIVE_QUESTS,
  acceptQuest,
  abandonQuest,
  canAcceptQuest,
  claimQuest,
  getQuestObjectives,
  getOrderedQuestDefinitions,
  isQuestComplete,
  normalizeQuestState,
  recordQuestCollect,
  recordQuestKill,
  recordQuestProgress,
} from "../src/data/quests.js";

class MemoryStorage {
  #data = new Map();
  get length() { return this.#data.size; }
  clear() { this.#data.clear(); }
  getItem(key) { return this.#data.has(String(key)) ? this.#data.get(String(key)) : null; }
  key(index) { return [...this.#data.keys()][index] ?? null; }
  removeItem(key) { this.#data.delete(String(key)); }
  setItem(key, value) { this.#data.set(String(key), String(value)); }
}

globalThis.localStorage = new MemoryStorage();

test("escapeHtml neutralise le HTML utilisateur", () => {
  assert.equal(escapeHtml(`<img src=x onerror="alert(1)">&'`), "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;&amp;&#39;");
});

test("la radiation avertit cinq secondes avant les dégâts et s'efface progressivement", () => {
  const radiation = createRadiationSystem({ warningDuration: 5, dpsPct: 0.1, tickInterval: 0.5 });
  const context = { started: true, paused: false, dead: false, outside: true, hpMax: 1000 };
  assert.equal(radiation.update(4.9, context), 0);
  assert.ok(radiation.state.edgeFade > 0);
  assert.equal(radiation.update(0.2, context), 0);
  assert.equal(radiation.update(0.4, context), 50);

  const beforeFade = radiation.state.edgeFade;
  radiation.update(0.2, { ...context, outside: false });
  assert.equal(radiation.state.exposure, 0);
  assert.ok(radiation.state.edgeFade < beforeFade);
});

test("les portails de gate sont centrés et retournent vers la bonne base", () => {
  const next = createGatePortalState();
  const back = createGatePortalState();
  positionGateChoicePortals({ w: 10000, h: 8000 }, next, back, 840);
  assert.deepEqual([next.x, next.y], [4580, 4000]);
  assert.deepEqual([back.x, back.y], [5420, 4000]);
  assert.equal(getGateReturnMap("alpha", "1-1"), "1-1");
  assert.equal(getGateReturnMap("beta", "2-1"), "2-1");
  assert.equal(getGateReturnMap("gamma", "3-1"), "3-1");
});

test("la gate LOW coûte un million dans chaque firme et commence par le Century Falcon", () => {
  for (const getPortals of [getMmoLowPortals, getEicLowPortals, getVruLowPortals]) {
    const portal = getPortals({ w: 11000, h: 7000 }).find(item => item.toMap === "low");
    assert.equal(portal?.entryCost, 1000000);
  }
  const plan = getLowWavePlan(1);
  assert.deepEqual(plan.spawns.map(({ type, count }) => ({ type, count })), [
    { type: "npc_Century_Falcon", count: 1 },
  ]);
  assert.deepEqual(LOW_COMPLETION_REWARD, {
    exp: GALAXY_GATE_DEFINITIONS.alpha.completion.exp / 2,
    honor: GALAXY_GATE_DEFINITIONS.alpha.completion.honor / 2,
    credits: GALAXY_GATE_DEFINITIONS.alpha.completion.credits / 2,
    x4: GALAXY_GATE_DEFINITIONS.alpha.completion.x4 / 2,
  });
});

test("la QZ coûte trente Alliages hybrides, accepte sept escortes et prépare l'Overlord", () => {
  for (const getPortals of [getMmoQzPortals, getEicQzPortals, getVruQzPortals]) {
    const portal = getPortals({ w: 11000, h: 7000 }).find(item => item.toMap === "qz");
    assert.equal(portal?.entryResource, "hybrid_alloy");
    assert.equal(portal?.entryResourceCost, 30);
    assert.equal(portal?.escortResourceCost, 10);
    assert.equal(portal?.maxEscorts, 7);
  }
  assert.deepEqual(getQzWavePlan(1).spawns.map(({ type, count }) => ({ type, count })), [
    { type: "npc_Gygerim_Overlord", count: 1 },
    { type: "npc_Viral_Kristallon", count: 30 },
  ]);
  assert.deepEqual(QZ_COMPLETION_REWARD, {
    exp: GALAXY_GATE_DEFINITIONS.alpha.completion.exp / 2,
    honor: GALAXY_GATE_DEFINITIONS.alpha.completion.honor / 2,
    credits: GALAXY_GATE_DEFINITIONS.alpha.completion.credits / 2,
    x4: 0,
    resources: { indoctrinated_oil: [1, 3] },
  });
});

test("les raccourcis x-6 vers x-7 et retour coûtent 50 000 crédits", () => {
  const pairs = [
    [getMmoSixPortals, "1-7"], [getMmoSevenPortals, "1-6"],
    [getEicSixPortals, "2-7"], [getEicSevenPortals, "2-6"],
    [getVruSixPortals, "3-7"], [getVruSevenPortals, "3-6"],
  ];
  for (const [getPortals, destination] of pairs) {
    const portal = getPortals({ w: 11000, h: 7000 }).find(item => item.toMap === destination);
    assert.equal(portal?.shortcutCreditCost, 50000);
  }
});

test("le Galaxy Spinner assemble, sauvegarde et consomme les Gates", () => {
  const initial = normalizeGalaxyGateState({ energy: 40, parts: { alpha: 33 } });
  const spin = spinGalaxyGate(initial, "alpha", 1, 0, () => 0.1);
  assert.equal(spin.ok, true);
  assert.equal(spin.state.built.alpha, 1);
  assert.equal(spin.state.parts.alpha, 0);
  assert.equal(GALAXY_GATE_DEFINITIONS.alpha.requiredParts, 34);
  const unavailable = consumeBuiltGalaxyGate(spin.state, "alpha");
  assert.equal(unavailable.ok, false);
  const deployed = deployBuiltGalaxyGate(spin.state, "alpha");
  assert.equal(deployed.ok, true);
  assert.equal(deployed.state.deployed.alpha, true);
  assert.equal(deployed.state.built.alpha, 0);
  const consumed = consumeBuiltGalaxyGate(deployed.state, "alpha");
  assert.equal(consumed.ok, true);
  assert.equal(consumed.state.built.alpha, 0);
  assert.equal(consumed.state.active, "alpha");
  const resumed = consumeBuiltGalaxyGate(consumed.state, "alpha");
  assert.equal(resumed.ok, true);
  assert.equal(resumed.state.built.alpha, 0);
});

test("une Galaxy Gate possède cinq vies et est perdue à la cinquième destruction", () => {
  let state = consumeBuiltGalaxyGate(normalizeGalaxyGateState({ deployed: { alpha: true } }), "alpha").state;
  assert.equal(state.lives.alpha, 5);
  for (let remaining = 4; remaining >= 0; remaining--) {
    const result = loseGalaxyGateLife(state, "alpha");
    assert.equal(result.ok, true);
    assert.equal(result.lives, remaining);
    assert.equal(result.exhausted, remaining === 0);
    state = result.state;
  }
  assert.equal(state.active, null);
  assert.equal(state.activeWave, 1);
});

test("le Galaxy Spinner limite chaque Gate à une construction", () => {
  const full = normalizeGalaxyGateState({ energy: 1, parts: { alpha: 33 }, built: { alpha: 2, beta: 1, gamma: 1 } });
  const spin = spinGalaxyGate(full, "alpha", 1, 0, () => 0.1);
  assert.equal(spin.state.built.alpha, 1);
  assert.equal(spin.state.parts.alpha, 0);
  assert.equal(spin.rewards.parts, 0);
});

test("le Galaxy Spinner accepte cent tirages et expose les récompenses finales", () => {
  const initial = normalizeGalaxyGateState({ energy: 100 });
  const spin = spinGalaxyGate(initial, "alpha", 100, 0, () => 0.5);
  assert.equal(spin.performed, 100);
  assert.equal(GALAXY_GATE_DEFINITIONS.alpha.completion.credits, GALAXY_GATE_DEFINITIONS.alpha.completion.exp);
  assert.equal(GALAXY_GATE_DEFINITIONS.gamma.completion.credits, 12000000);
});

test("le générateur Ensemble ouvre la Gate dont il obtient une pièce", () => {
  const rolls = [0.1, 0.5];
  const spin = spinGalaxyGate(normalizeGalaxyGateState({ energy: 1 }), "alpha", 1, 0, () => rolls.shift() ?? 0.5);
  assert.equal(spin.state.parts.beta, 1);
  assert.equal(spin.state.parts.alpha, 0);
  assert.equal(spin.state.lastOpenedGate, "beta");
  assert.equal(spin.rewards.partsByGate.beta, 1);
});

test("le Spinner reste actif avec toutes les Gates construites et identifie le doublon", () => {
  const rolls = [0.1, 0.5];
  const full = normalizeGalaxyGateState({ energy: 1, built: { alpha: 1, beta: 1, gamma: 1 } });
  const spin = spinGalaxyGate(full, "alpha", 1, 0, () => rolls.shift() ?? 0.5);
  assert.equal(spin.ok, true);
  assert.deepEqual(spin.rewards.duplicates, [{ gate: "beta", multiplier: 2 }]);
  assert.equal(spin.state.multipliers.beta, 2);
  assert.equal(spin.state.lastOpenedGate, "beta");
});

test("un multiplicateur arrivé à x5 s'arme automatiquement sur sa Gate", () => {
  const rolls = [0.1, 0.9];
  const full = normalizeGalaxyGateState({
    energy: 1,
    built: { alpha: 1, beta: 1, gamma: 1 },
    multipliers: { gamma: 4 },
  });
  const spin = spinGalaxyGate(full, "alpha", 1, 0, () => rolls.shift() ?? 0.5);
  assert.deepEqual(spin.rewards.duplicates, [{ gate: "gamma", multiplier: 5 }]);
  assert.equal(spin.state.lastOpenedGate, "gamma");
  assert.equal(spin.state.multipliers.gamma, 5);
  assert.equal(spin.state.multiplierArmed.gamma, true);
});

test("un x5 obtenu dans un lot affecte le gain suivant sans multiplier le doublon", () => {
  const rolls = [0.25, 0.9, 0.8];
  const full = normalizeGalaxyGateState({
    energy: 2,
    built: { alpha: 1, beta: 1, gamma: 1 },
    multipliers: { gamma: 4 },
  });
  const spin = spinGalaxyGate(full, "alpha", 2, 0, () => rolls.shift() ?? 0.5);
  assert.deepEqual(spin.rewards.duplicates, [{ gate: "gamma", multiplier: 5 }]);
  assert.equal(spin.rewards.ammo.x4, 375);
  assert.deepEqual(spin.rewards.multiplierApplications, [{
    gate: "gamma",
    multiplier: 5,
    spin: 2,
    rewardType: "ammo",
    rewardId: "x4",
    amount: 375,
  }]);
  assert.equal(spin.state.multipliers.gamma, 1);
  assert.equal(spin.state.multiplierArmed.gamma, false);
});

test("un multiplicateur armé affecte uniquement le prochain spin", () => {
  const initial = normalizeGalaxyGateState({ energy: 2, multipliers: { alpha: 3 } });
  const armed = setGalaxyGateMultiplierArmed(initial, "alpha", true);
  assert.equal(armed.ok, true);
  const spin = spinGalaxyGate(armed.state, "alpha", 2, 0, () => 0.5);
  assert.deepEqual(spin.rewards.multiplierApplied, {
    gate: "alpha",
    multiplier: 3,
    spin: 1,
    rewardType: "ammo",
    rewardId: "x2",
    amount: 750,
  });
  assert.equal(spin.rewards.ammo.x2, 1000);
  assert.equal(spin.state.multipliers.alpha, 1);
  assert.equal(spin.state.multiplierArmed.alpha, false);
});

test("un multiplicateur peut fournir plusieurs pièces de Galaxy Gate", () => {
  const rolls = [0.1, 0];
  const initial = normalizeGalaxyGateState({
    energy: 1,
    multipliers: { alpha: 5 },
    multiplierArmed: { alpha: true },
  });
  const spin = spinGalaxyGate(initial, "alpha", 1, 0, () => rolls.shift() ?? 0.5);
  assert.equal(spin.rewards.partsByGate.alpha, 5);
  assert.equal(spin.state.parts.alpha, 5);
  assert.deepEqual(spin.rewards.multiplierApplications, [{
    gate: "alpha",
    multiplier: 5,
    spin: 1,
    rewardType: "parts",
    rewardId: "alpha",
    amount: 5,
  }]);
});

test("la firme détermine les bases normale, supérieure et de Galaxy Gate", () => {
  assert.equal(getFactionHomeMap("mmo"), "1-1");
  assert.equal(getFactionHomeMap("eic"), "2-1");
  assert.equal(getFactionHomeMap("vru"), "3-1");
  assert.deepEqual(getFactionBaseSpawn("eic"), { x: 9500, y: 1500 });
  assert.equal(getFactionRespawnMap("mmo", "1-4.1"), "1-1");
  assert.equal(getFactionRespawnMap("mmo", "1-5"), "1-8");
  assert.equal(getFactionRespawnMap("eic", "2-10"), "2-8");
  assert.deepEqual(resolveBaseCenter({ modules: [{ id: "CENTRE_EIC", x: 5500, y: 1500 }] }), { x: 5500, y: 1500 });
  assert.equal(getFactionRespawnMap("vru", "beta", { gate: true }), "3-1");
  assert.equal(getGateReturnMap("beta", "1-1"), "1-1");
});

test("un portail s'ouvre, se ferme et termine son saut sans logique de rendu", () => {
  const portal = createGatePortalState();
  updatePortalProximity([portal], 0.5, {
    isNear: () => true,
    switchDuration: 0.5,
    holdDuration: 1,
  });
  assert.equal(portal.open, true);
  assert.equal(getPortalOpenFade(portal, 0.5), 1);

  updatePortalProximity([portal], 0.1, {
    isNear: () => false,
    switchDuration: 0.5,
    holdDuration: 1,
  });
  assert.equal(portal.closing, true);
  tickPortalVisualTransitions([portal], 1, 0.5);
  assert.equal(portal.open, false);
  assert.equal(portal.closing, false);

  portal.jumpDur = 0.25;
  assert.equal(beginGatePortalJump(portal, "continue", 0.5), true);
  assert.equal(tickGatePortalJumps([portal], 0.1), null);
  const completed = tickGatePortalJumps([portal], 0.2);
  assert.equal(completed?.action, "continue");
  assert.equal(completed?.portal, portal);
});

test("la présentation des quêtes distingue le journal et les états du terminal", () => {
  const state = normalizeQuestState();
  assert.equal(acceptQuest(state, QUEST_DEFINITIONS[0].id), true);
  const journal = buildQuestJournalView(state, null);
  assert.equal(journal.selectedQuestId, QUEST_DEFINITIONS[0].id);
  assert.match(journal.tabsHtml, /questTab active/);
  assert.match(journal.contentHtml, /Abandonner la mission/);
  assert.match(journal.contentHtml, /honneur/i);

  const terminal = buildQuestTerminalView({
    questState: state,
    selectedId: QUEST_DEFINITIONS[0].id,
    hasAccess: true,
    collectables: COLLECTABLE_TYPES,
    npcTypes: {},
    npcLocations: { npc_Streuner: ["1-1", "2-1", "3-1"] },
  });
  assert.match(terminal.listHtml, /accepted/);
  assert.match(terminal.detailHtml, /Mission en cours/);
  assert.match(terminal.detailHtml, /honneur/i);
  assert.match(terminal.detailHtml, /questRewardCard/);
  assert.match(terminal.detailHtml, /Cartes disponibles : 1-1, 2-1, 3-1/);
  assert.match(terminal.detailHtml, /Où chercher et comment réussir/);
  const gateHelp = buildQuestTerminalView({
    questState: state,
    selectedId: "gate_alpha",
    hasAccess: true,
    collectables: COLLECTABLE_TYPES,
    npcTypes: {},
  });
  assert.match(gateHelp.detailHtml, /Galaxy Spinner/);
  assert.match(gateHelp.detailHtml, /Préparer le portail/);
  assert.equal(formatQuestEntityName("npc_Sibelonit"), "Sibelonit");
  assert.equal(formatQuestEntityName("npc_Blighted_Gygerthrall"), "Blighted Gygerthrall");
  assert.equal(formatQuestEntityName("Green_Booty_Box"), "Green Booty Box");
});

test("les rendus HUD Canvas restaurent le contexte et gèrent les messages permanents", () => {
  const calls = [];
  const context = new Proxy({ globalAlpha: 1 }, {
    get(target, property) {
      if (property in target) return target[property];
      return (...args) => calls.push([property, ...args]);
    },
    set(target, property, value) {
      target[property] = value;
      return true;
    },
  });
  drawToastMessage(context, { text: "Zone de Non-Agression", t: 2, dur: Infinity, fixed: true }, 1200, 800);
  assert.equal(Number.isFinite(context.globalAlpha), true);
  drawMoveTargetMarker(context, { active: true, x: 10, y: 20 }, 5, 6);
  assert.equal(calls.filter(call => call[0] === "save").length, 2);
  assert.equal(calls.filter(call => call[0] === "restore").length, 2);
});

test("la mini-carte filtre les NPC et dessine les portails avec un contexte équilibré", () => {
  const prevDocument = globalThis.document;
  const staticCalls = [];
  const staticContext = new Proxy({}, {
    get: (target, property) => target[property] || ((...args) => staticCalls.push([property, ...args])),
    set: (target, property, value) => { target[property] = value; return true; },
  });
  globalThis.document = {
    createElement: () => ({
      getContext: () => staticContext,
      width: 0,
      height: 0,
    }),
  };

  try {
    const calls = [];
    const context = new Proxy({}, { get: (target, property) => target[property] || ((...args) => calls.push([property, ...args])), set: (target, property, value) => { target[property] = value; return true; } });
    const player = { x: 500, y: 500, dead: false };
    renderMinimap(context, {
      width: 200, height: 100, world: { w: 1000, h: 1000 }, player,
      enemies: [{ x: 100, y: 100, hp: 10, r: 18 }, { x: 200, y: 200, hp: 10, r: 18 }],
      portals: [{ x: 300, y: 300, r: 50 }], moveTarget: { active: true, x: 700, y: 700 },
      ping: { x: 700, y: 700, t: 0.5, dur: 1 }, camera: player,
      viewportWidth: 800, viewportHeight: 600, shouldShowNpc: (_player, enemy) => enemy.x === 100,
    });
    assert.equal(calls.some(call => call[0] === "drawImage"), true, "la couche statique est posée par drawImage");
    assert.equal(calls.filter(call => call[0] === "fillRect").length, 1, "un seul ennemi filtré dessiné côté dynamique");
    assert.equal(calls.filter(call => call[0] === "save").length, calls.filter(call => call[0] === "restore").length);
    assert.equal(staticCalls.filter(call => call[0] === "fillRect").length, 1, "fond de la mini-carte rendu dans la couche statique");
    assert.equal(staticCalls.filter(call => call[0] === "arc").length >= 2, true, "portail rendu dans la couche statique");
    assert.deepEqual(getMinimapPortalColors({ toMap: "low" }), {
      stroke: "rgba(190,96,255,0.95)",
      fill: "rgba(210,130,255,1)",
    });
    assert.deepEqual(getMinimapPortalColors({ toMap: "qz" }), getMinimapPortalColors({ toMap: "low" }));
    assert.deepEqual(getMinimapPortalColors({ toMap: "1-7", shortcutCreditCost: 50000 }), {
      stroke: "rgba(255,205,82,0.95)",
      fill: "rgba(255,224,120,1)",
    });
    assert.notDeepEqual(getMinimapPortalColors({ toMap: "1-2" }), getMinimapPortalColors({ toMap: "low" }));
  } finally {
    globalThis.document = prevDocument;
  }
});

test("les couches du monde dessinent fonds et murs sans déséquilibrer Canvas", () => {
  const calls = [];
  const pattern = { setTransform: matrix => calls.push(["setTransform", matrix]) };
  const context = new Proxy({ createPattern: () => pattern }, { get: (target, property) => target[property] || ((...args) => calls.push([property, ...args])), set: (target, property, value) => { target[property] = value; return true; } });
  const image = { naturalWidth: 100, naturalHeight: 50 };
  const common = { getImage: () => image, isImageReady: () => true };
  drawBackgroundLayerSet(context, [{ src: "bg", mode: "cover", alpha: 1 }], { ...common, offsetX: 0, offsetY: 0, viewportWidth: 200, viewportHeight: 100 });
  drawWallLayer(context, [{ x: 50, y: 50, w: 20, h: 30 }], { src: "wall", w: 64, h: 64 }, { ...common, offsetX: 5, offsetY: 6, createScaleMatrix: (x, y) => ({ x, y }) });
  assert.equal(calls.some(call => call[0] === "drawImage"), true);
  assert.equal(calls.some(call => call[0] === "setTransform"), true);
  assert.equal(calls.filter(call => call[0] === "save").length, calls.filter(call => call[0] === "restore").length);
});

test("les trois profondeurs d'étoiles dérivent même avec une caméra immobile", () => {
  const prevDocument = globalThis.document;
  const tileStars = [];
  const tileContext = new Proxy({}, {
    get: (target, property) => target[property] || ((...args) => {
      if (property === "arc") tileStars.push(args.slice(0, 3));
    }),
    set: (target, property, value) => { target[property] = value; return true; },
  });
  globalThis.document = {
    createElement: () => ({
      getContext: () => tileContext,
      width: 0,
      height: 0,
    }),
  };

  try {
    const draws = [];
    const context = new Proxy({}, {
      get: (target, property) => target[property] || ((...args) => {
        if (property === "drawImage") draws.push(args.slice(0, 3));
      }),
      set: (target, property, value) => { target[property] = value; return true; },
    });
    const renderAt = elapsedSeconds => {
      draws.length = 0;
      drawParallaxStarfield(context, {
        viewportWidth: 800,
        viewportHeight: 600,
        cameraX: 500,
        cameraY: 500,
        elapsedSeconds,
      });
      return draws.map(([src, x, y]) => `${Math.round(x)},${Math.round(y)}`);
    };

    const initial = renderAt(0);
    const later = renderAt(2);

    assert.ok(tileStars.length > 80, "le sprite pré-rendu contient les étoiles");
    assert.equal(new Set(tileStars.map(([, , radius]) => radius.toFixed(1))).size >= 3, true);
    assert.equal(initial.length >= 3, true, "une tuile dessinée par profondeur");
    assert.notDeepEqual(later, initial, "le décalage des textures dérive avec le temps");
  } finally {
    globalThis.document = prevDocument;
  }
});

test("les systèmes de frame bornent le mouvement et nettoient les effets expirés", () => {
  const player = { x: 0, y: 0, vx: 0, vy: 0, baseSpeed: 100, dead: false };
  updatePlayerVelocity(player, { x: 10, y: 0 }, 1);
  assert.ok(Math.hypot(player.vx, player.vy) <= 100);
  assert.equal(player.vx, 100);
  updatePlayerVelocity(player, { x: 0, y: 0 }, 0.016);
  assert.deepEqual({ vx: player.vx, vy: player.vy }, { vx: 0, vy: 0 });
  const effects = [{ t: 0.2, life: 0.25 }, { t: 0, life: 1 }];
  tickLifetimeItems(effects, 0.1, item => item.life);
  assert.equal(effects.length, 1);
  const texts = [{ t: 0, life: 0.05, x: 0, y: 0, vx: 10, vy: -10 }];
  tickFloatingTexts(texts, 0.1);
  assert.equal(texts.length, 0);
  const pickups = [{ t: 0, x: 1, y: 1, credits: 20 }];
  let reward = 0;
  attractPickups(pickups, player, 0.016, item => { reward += item.credits; });
  assert.equal(pickups.length, 0);
  assert.equal(reward, 20);
});

test("le joueur s'arrête exactement sur le point cliqué sans le dépasser", () => {
  const player = { x: 95, y: 50, vx: 200, vy: 0, dead: false };
  const target = { active: true, x: 100, y: 50 };
  const arrived = advancePlayerToTarget(player, target, 0.033);
  assert.equal(arrived, true);
  assert.deepEqual({ x: player.x, y: player.y, vx: player.vx, vy: player.vy }, { x: 100, y: 50, vx: 0, vy: 0 });
  assert.equal(target.active, false);
});

test("la progression calcule les niveaux et détecte les passages de niveau", () => {
  assert.equal(getLevelInfo(0).level, 1);
  assert.equal(getLevelInfo(10000).level, 2);
  assert.equal(getLevelInfo(20000).level, 3);
  assert.equal(getLevelInfo(40000).level, 4);
  const stats = { exp: 9900 };
  const result = grantExperience(stats, 200);
  assert.equal(stats.exp, 10100);
  assert.equal(result.leveledUp, true);
  assert.equal(result.after.level, 2);
  assert.equal(getNpcExperienceReward({ value: 400 }), 400);
  assert.equal(getQuestExperienceReward({ reward: { credits: 50000 } }), 5000);
  assert.equal(getQuestExperienceReward({ reward: { credits: 50000, exp: 1234 } }), 1234);
  assert.equal(getQuestHonorReward({ reward: { credits: 50000 } }), 500);
  assert.equal(getQuestHonorReward({ reward: { credits: 50000, honor: 42 } }), 42);
  const rankStats = { exp: 1000000, honor: 10000 };
  grantHonor(rankStats, 100);
  assert.equal(calculateRankPoints(rankStats), 111);
  assert.equal(getRankInfo(calculateRankPoints(rankStats)).name, "Pilote spatial de base");
  assert.equal(getRankInfo(524288000).imagePath, "assets/grades/21.png");
  assert.equal(getRankInfo(0, -1).name, "Paria");
  assert.equal(getRankInfo(Number.MAX_SAFE_INTEGER).imagePath, "assets/grades/admin.png");
  assert.equal(PILOT_RANKS.length, 21);
  for (let index = 2; index < PILOT_RANKS.length; index++) {
    assert.equal(PILOT_RANKS[index].points, PILOT_RANKS[index - 1].points * 2);
  }
  assert.equal(ADMIN_RANK.points, Number.MAX_SAFE_INTEGER);
  assert.equal(getNpcHonorReward({ type: "npc_Streuner", value: 400 }), 2);
  assert.equal(getNpcHonorReward({ type: "npc_Boss_Mordon", value: 25600 }), 64);
  assert.equal(getNpcHonorReward({ type: "npc_Inconnu", value: 900 }), 90);
});

test("tous les NPC ont des statistiques et récompenses distinctes valides", () => {
  for (const [type, npc] of Object.entries(NPC_TYPES)) {
    assert.ok(npc.hp >= 1, `${type} doit avoir de la vie`);
    assert.ok(npc.shield >= 0, `${type} doit avoir un bouclier valide`);
    assert.ok(npc.speed >= 0, `${type} doit avoir une vitesse valide`);
    assert.ok(npc.exp >= 0, `${type} doit avoir une expérience valide`);
    assert.ok(npc.honor >= 0, `${type} doit avoir un honneur valide`);
  }

  for (const [gate, multiplier] of Object.entries(GATE_MULTIPLIERS)) {
    const base = NPC_TYPES.npc_Kristallon;
    const variant = NPC_TYPES[`npc_Kristallon_${gate}`];
    assert.equal(variant.hp, base.hp * multiplier);
    assert.equal(variant.shield, base.shield * multiplier);
    assert.equal(variant.speed, base.speed);
    assert.equal(variant.value, base.value * multiplier);
    assert.equal(variant.exp, base.exp * multiplier);
    assert.equal(variant.honor, base.honor * multiplier);
  }

  assert.deepEqual(
    { credits: NPC_TYPES.npc_Blighted_Kristallon.value, exp: NPC_TYPES.npc_Blighted_Kristallon.exp, honor: NPC_TYPES.npc_Blighted_Kristallon.honor },
    { credits: 500000, exp: 65000, honor: 300 },
  );
  assert.deepEqual(
    { credits: NPC_TYPES.npc_Blighted_Gygerthrall.value, exp: NPC_TYPES.npc_Blighted_Gygerthrall.exp, honor: NPC_TYPES.npc_Blighted_Gygerthrall.honor },
    { credits: 18800, exp: 9400, honor: 45 },
  );
  assert.equal(NPC_TYPES.npc_Streuner.speed, 270);
  assert.equal(NPC_TYPES.npc_Protegit.speed, 420);
  assert.equal(NPC_TYPES.npc_Cubikon.speed, 30);
  assert.equal(NPC_TYPES.npc_Boss_Lordakia.speed, 400);
  assert.equal(NPC_TYPES.npc_Boss_Devolarium.speed, 160);
  assert.equal(NPC_TYPES.npc_Boss_Kristallon.speed, 250);
});

test("les NPC de la LOW utilisent leurs statistiques et récompenses dédiées", () => {
  assert.deepEqual(
    ["npc_Vagrant", "npc_Marauder", "npc_Outcast", "npc_Corsair", "npc_Hooligan", "npc_Ravager", "npc_Convict"].map(type => {
      const npc = NPC_TYPES[type];
      return [npc.hp, npc.shield, npc.speed, npc.bulletDmg, npc.value, npc.exp, npc.honor];
    }),
    [
      [80000, 80000, 335, 5000, 45000, 9000, 12],
      [200000, 120000, 315, 11000, 90000, 18000, 24],
      [300000, 160000, 300, 15000, 150000, 27000, 36],
      [400000, 240000, 290, 16000, 240000, 39000, 48],
      [750000, 600000, 280, 9000, 375000, 48000, 96],
      [900000, 600000, 270, 22000, 480000, 54000, 192],
      [1200000, 600000, 260, 23000, 660000, 60000, 300],
    ],
  );
  const falcon = NPC_TYPES.npc_Century_Falcon;
  assert.deepEqual(
    [falcon.hp, falcon.shield, falcon.speed, falcon.bulletDmg, falcon.value, falcon.exp, falcon.honor],
    [12000000, 9000000, 360, 70000, 3000000, 3000000, 15000],
  );
});

test("les grands nombres utilisent des espaces comme séparateurs", () => {
  assert.equal(formatInteger(1000000), "1 000 000");
  assert.equal(formatInteger(12800), "12 800");
});

test("l'insigne de grade est dessiné à gauche du pseudo", () => {
  const calls = [];
  const context = new Proxy({ measureText: () => ({ width: 30 }) }, {
    get: (target, property) => target[property] || ((...args) => calls.push([property, ...args])),
    set: (target, property, value) => { target[property] = value; return true; },
  });
  const player = { dead: false, hp: 100, hpMax: 100, sh: 0, shMax: 0, r: 20 };
  drawPlayerStatus(context, player, "Neo", 100, 100, { complete: true, naturalWidth: 20, naturalHeight: 16 });
  const imageCall = calls.find(call => call[0] === "drawImage");
  assert.deepEqual(imageCall?.slice(2), [60, 210, 20, 16]);
});

test("l'emblème de firme est dessiné à droite du pseudo", () => {
  const calls = [];
  const context = new Proxy({ measureText: () => ({ width: 30 }) }, {
    get: (target, property) => target[property] || ((...args) => calls.push([property, ...args])),
    set: (target, property, value) => { target[property] = value; return true; },
  });
  const player = { dead: false, hp: 100, hpMax: 100, sh: 100, shMax: 100, r: 28 };
  const factionImage = { complete: true, naturalWidth: 18, naturalHeight: 16 };
  drawPlayerStatus(context, player, "Neo", 100, 100, null, factionImage);
  const factionDraw = calls.find(call => call[0] === "drawImage");
  assert.deepEqual(factionDraw.slice(2), [120, 218, 18, 16]);
});

test("les primitives de collision gèrent segments et distances", () => {
  assert.equal(clamp(12, 0, 10), 10);
  assert.equal(dist2(0, 0, 3, 4), 25);
  assert.equal(segCircleHit(0, 0, 10, 0, 5, 1, 2), true);
  assert.equal(segCircleHit(0, 0, 10, 0, 5, 3, 2), false);
  assert.equal(segCircleHit(0, 0, 0, 0, 1, 0, 1), true);
  assert.equal(movingCircleHit(
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 50, y: -10000 },
    { x: 50, y: 10000 },
    5,
  ), true);
});

test("un cercle est repoussé même si son centre est dans un mur", () => {
  const rect = { x: 50, y: 50, w: 40, h: 20 };
  const push = circleRectResolve(50, 50, 5, rect);
  assert.ok(push);
  assert.ok(Math.abs(push.x) + Math.abs(push.y) > 0);

  const outside = circleRectResolve(0, 0, 5, rect);
  assert.equal(outside, null);
});

test("l’état clavier distingue une pression d’une touche maintenue", () => {
  const keyboard = createKeyboardState();
  keyboard.keyDown("Space", false);
  assert.equal(keyboard.held.has("Space"), true);
  assert.equal(keyboard.pressed.has("Space"), true);
  keyboard.endFrame();
  assert.equal(keyboard.pressed.has("Space"), false);
  assert.equal(keyboard.held.has("Space"), true);
  keyboard.keyUp("Space");
  assert.equal(keyboard.held.has("Space"), false);
});

test("l’état pointeur centralise le début et la fin d’un geste", () => {
  const pointer = createPointerState();
  pointer.begin({ clientX: 12, clientY: 34 });
  assert.equal(pointer.down, true);
  assert.equal(pointer.dragStartX, 12);
  pointer.followWhileDown = true;
  pointer.reset();
  assert.equal(pointer.down, false);
  assert.equal(pointer.followWhileDown, false);
});

test("le combat répartit les dégâts entre bouclier, pénétration et vie", () => {
  const target = { hp: 100, sh: 50, dr: 0 };
  const result = damageEnemyLayers(target, 100, {
    random: () => 0.5,
    variance: 0,
    critChance: 0,
    shieldPenetration: 0.2,
  });
  assert.equal(result.bypass, 20);
  assert.equal(result.sh, 50);
  assert.equal(result.hp, 50);
  assert.equal(target.hp, 50);
  assert.equal(target.sh, 0);
});

test("SAB et dégâts joueur respectent les limites des ressources", () => {
  const target = { hp: 10, sh: 30 };
  assert.equal(drainShield(target, 50), 30);
  assert.equal(target.sh, 0);

  const player = { hp: 100, sh: 20, dr: 0 };
  const result = damagePlayerLayers(player, 50);
  assert.equal(result.sh, 20);
  assert.equal(result.hp, 30);
  assert.equal(player.hp, 70);
  assert.equal(bulletLifeForRange(1000, 500), 2.35);
});

test("l’index spatial ne visite que les paires de cellules voisines", () => {
  const entities = [
    { id: 1, x: 10, y: 10, hp: 1 },
    { id: 2, x: 20, y: 20, hp: 1 },
    { id: 3, x: 5000, y: 5000, hp: 1 },
  ];
  const pairs = [];
  forEachNearbyPair(entities, 100, (a, b) => pairs.push([a.id, b.id]));
  assert.deepEqual(pairs, [[1, 2]]);

  const byId = rebuildIdIndex(new Map(), entities);
  assert.equal(byId.get(2), entities[1]);
});

test("l’index spatial persistant réutilise ses buckets", () => {
  const index = createSpatialPairIndex(100);
  const entities = [{ id: 1, x: 10, y: 10, hp: 1 }, { id: 2, x: 20, y: 20, hp: 1 }];
  index.forEachPair(entities, () => {});
  const first = index.stats().allocatedBuckets;
  index.forEachPair(entities, () => {});
  assert.equal(index.stats().allocatedBuckets, first);
  assert.equal(index.stats().activeBuckets, 1);
});

test("les transformations caméra écran sont réversibles", () => {
  const camera = { x: 500, y: 300 };
  const screen = worldToScreenPoint(520, 320, camera, 1000, 600);
  assert.deepEqual(screen, { x: 520, y: 320 });
  assert.deepEqual(screenToWorldPoint(screen.x, screen.y, camera, 1000, 600), { x: 520, y: 320 });
  assert.equal(isWorldPointVisible(520, 320, camera, 1000, 600), true);
  assert.equal(isWorldPointVisible(5000, 5000, camera, 1000, 600), false);
});

test("la couleur de vie est bornée", () => {
  assert.equal(hpHueColor(-1, 2), "hsla(0, 95%, 55%, 1)");
  assert.equal(hpHueColor(1), "hsla(120, 95%, 55%, 0.98)");
});

test("un sprite Canvas est dessiné autour de son centre", () => {
  const calls = [];
  const context = {
    save: () => calls.push("save"),
    restore: () => calls.push("restore"),
    drawImage: (...args) => calls.push(args),
  };
  assert.equal(drawCenteredImage(context, "image", 40, 20), true);
  assert.deepEqual(calls[1], ["image", -20, -10, 40, 20]);
});

test("la fabrique NPC initialise les statistiques et clone les récompenses", () => {
  const config = { hp: 500, shield: 200, speed: 300, onKill: { reward: 50 } };
  const npc = createNpcEntity({ id: 7, type: "npc_Test", x: 10, y: 20, config, random: () => 0.5 });
  assert.equal(npc.hp, 500);
  assert.equal(npc.sh, 200);
  assert.equal(npc.speed, 300);
  npc._onKill.reward = 0;
  assert.equal(config.onKill.reward, 50);
});

test("la fabrique prépare l’état spécial du Cubikon", () => {
  const npc = createNpcEntity({ id: 8, type: "npc_Cubikon", x: 0, y: 0, config: {}, random: () => 0.5 });
  assert.equal(npc.angle, 0);
  assert.equal(npc.spriteFps, 20);
  assert.deepEqual(npc._minionIds, []);
});

test("les projectiles ont des valeurs sûres et progressent avec deltaTime", () => {
  const projectiles = [];
  const projectile = addProjectile(projectiles, { x: 10, vx: 20, life: 2, dmg: 5 });
  assert.equal(projectile, projectiles[0]);
  const expired = advanceProjectile(projectile, 0.5);
  assert.equal(expired, false);
  assert.equal(projectile._oldX, 10);
  assert.equal(projectile._oldY, 0);
  assert.equal(projectile.x, 20);
  assert.equal(projectile.life, 1.5);
  assert.equal(createProjectile().r, 6);
});

test("les projectiles supprimés sont recyclés sans conserver leur ancien état", () => {
  const collection = [];
  const first = addProjectile(collection, { x: 12, sprite: "ancien" });
  removeProjectile(collection, 0);
  const recycled = addProjectile(collection, { x: 30 });
  assert.equal(recycled, first);
  assert.equal(recycled.x, 30);
  assert.equal("sprite" in recycled, false);
});

test("une file de vague compte et consomme chaque groupe", () => {
  const state = createWaveSpawnState();
  assert.equal(state.load([{ type: "a", count: 2 }, { type: "b", count: 1 }]), 3);
  assert.equal(state.tick(0.35), true);
  state.consume();
  assert.equal(state.remaining, 2);
  state.consume();
  assert.equal(state.peek().type, "b");
  state.consume();
  assert.equal(state.remaining, 0);
});

test("le HUD borne les barres et affiche la progression", () => {
  const element = () => ({ textContent: "", style: {} });
  const ui = {
    hpTxt: element(), shTxt: element(), hpBar: element(), shBar: element(),
    honorTxt: element(), xpTxt: element(), rankPtsTxt: element(), lvlTxt: element(),
    waveTxt: element(), spawnLeftTxt: element(), aliveTxt: element(),
  };
  updateResourceHud(ui, { hp: 120, hpMax: 100, sh: -5, shMax: 50 });
  assert.equal(ui.hpBar.style.width, "100%");
  assert.equal(ui.shBar.style.width, "0%");
  updateProgressHud(ui, { honor: 12.9, exp: 50, rankPoints: 4 }, { level: 2, pct: 25 });
  assert.equal(ui.lvlTxt.textContent, "2 (25%)");
  updateWaveHud(ui, { started: true, wave: 3, remaining: 8, alive: 2 });
  assert.equal(ui.spawnLeftTxt.textContent, "8");
});

test("les barres NPC apparaissent après un tir ou lors de la sélection", () => {
  const npc = {};
  assert.equal(shouldShowNpcBars(npc, null), false);
  assert.equal(shouldShowNpcBars(npc, npc), true);
  npc._healthRevealed = true;
  assert.equal(shouldShowNpcBars(npc, null), true);
});

test("le moniteur de performances calcule moyenne et frames lentes", () => {
  const monitor = createPerformanceMonitor(10);
  for (let i = 0; i < 9; i++) monitor.record(0.01);
  monitor.record(0.03);
  const snapshot = monitor.snapshot();
  assert.equal(snapshot.samples, 10);
  assert.equal(snapshot.longFrames, 1);
  assert.equal(snapshot.averageMs, 12);
  assert.equal(snapshot.p95Ms, 30);
});

test("l’IA poursuit de loin et orbite sans reculer de près", () => {
  const entity = { vx: 100, vy: 0, wobble: 0 };
  const ai = { minR: 100, maxR: 200, dir: 1, mode: "orbit", pauseT: 0, wobbleSeed: 0 };
  const far = computeNpcSteering(entity, 300, 1, 0, ai, 1 / 60);
  assert.ok(far.mxv > 0);
  const close = computeNpcSteering(entity, 50, 1, 0, ai, 1 / 60);
  assert.equal(Math.abs(close.mxv), 0);
  assert.ok(Math.abs(close.myv) > 0);
  assert.equal(entity.vx, 100);
  setNpcVelocity(entity, close.mxv, close.myv, 300);
  assert.ok(Math.hypot(entity.vx, entity.vy) <= 300 * NPC_DIRECT_SPEED_FACTOR);
  setNpcVelocity(entity, 1, 0, 300);
  assert.equal(entity.vx, 300 * NPC_DIRECT_SPEED_FACTOR);
  setNpcVelocity(entity, 0, 0, 300);
  assert.deepEqual({ vx: entity.vx, vy: entity.vy }, { vx: 0, vy: 0 });
});

test("les capteurs NPC ont un radar plus large que la visibilité", () => {
  const ranges = getNpcSensorRanges();
  const player = { x: 0, y: 0 };
  const nearby = { x: 1500, y: 0, hp: 1 };
  const radarOnly = { x: 2000, y: 0, hp: 1 };
  const hidden = { x: 2500, y: 0, hp: 1 };
  assert.equal(isNpcWithinSensor(player, nearby, ranges.visibility), true);
  assert.equal(isNpcWithinSensor(player, radarOnly, ranges.visibility), false);
  assert.equal(isNpcWithinSensor(player, radarOnly, ranges.radar), true);
  assert.equal(isNpcWithinSensor(player, hidden, ranges.radar), false);
});

test("un NPC verrouillé reste détecté hors des rayons normaux", () => {
  const player = { x: 0, y: 0 };
  const npc = { x: 10000, y: 10000, hp: 1 };
  assert.equal(shouldDetectNpc(player, npc, 1600), false);
  assert.equal(shouldDetectNpc(player, npc, 1600, npc), true);
});

test("un NPC attaquant reste détecté jusqu’à son retour en roam", () => {
  const player = { x: 0, y: 0 };
  const npc = { x: 10000, y: 10000, hp: 1, _attackedPlayerRecently: true };
  assert.equal(shouldDetectNpc(player, npc, 1600), true);
  npc._attackedPlayerRecently = false;
  assert.equal(shouldDetectNpc(player, npc, 1600), false);
});

test("un NPC lointain est échelonné tandis qu’une cible reste active", () => {
  const player = { x: 0, y: 0 };
  const ranges = getNpcSensorRanges();
  const npc = { id: 1, x: 10000, y: 10000, hp: 1 };
  let ticks = 0;
  for (let frame = 0; frame < 60; frame++) {
    if (shouldRunNpcFrame({ player, npc, ranges, farInterval: 15 })) ticks++;
  }
  assert.equal(ticks, 4);
  assert.equal(shouldRunNpcFrame({ player, npc, ranges, lockedNpc: npc, farInterval: 15 }), true);
});

test("les Galaxy Gates désactivent toutes les limites des capteurs NPC", () => {
  const ranges = getNpcSensorRanges({ mode: "gate" });
  const player = { x: 0, y: 0 };
  const distantNpc = { x: 100000, y: 100000, hp: 1 };
  assert.equal(ranges.allVisible, true);
  assert.equal(isNpcWithinSensor(player, distantNpc, ranges.visibility), true);
  assert.equal(isNpcWithinSensor(player, distantNpc, ranges.radar), true);
});

test("normalizeMapId accepte les cartes réelles sans tenir compte de la casse", () => {
  assert.equal(normalizeMapId(" 1-1 "), "1-1");
  assert.equal(normalizeMapId("ALPHA"), "alpha");
  assert.equal(normalizeMapId("???"), "???");
});

test("une carte inconnue revient à la carte de départ", () => {
  assert.equal(normalizeMapId("5-3"), DEFAULT_MAP_ID);
  assert.equal(normalizeMapId("X-BL"), DEFAULT_MAP_ID);
});

test("le registre ne contient que des chargeurs", () => {
  assert.ok(Object.keys(MAP_LOADERS).length > 30);
  for (const loader of Object.values(MAP_LOADERS)) assert.equal(typeof loader, "function");
});

test("une bataille chargée conserve seulement les effets les plus récents", () => {
  const effects = [];
  for (let i = 0; i < 10_000; i++) pushBounded(effects, { id: i }, 140);
  assert.equal(effects.length, 140);
  assert.equal(effects[0].id, 9_860);
  assert.equal(effects.at(-1).id, 9_999);
});

test("le catalogue des collectables centralise sprites, cartes et récompenses", () => {
  assert.equal(Object.keys(COLLECTABLE_TYPES).length, 6);
  assert.deepEqual(COLLECTABLE_TYPES.Palladium_Ore.maps, ["5-2"]);
  assert.deepEqual(COLLECTABLE_TYPES.Astral_Prime_Box.rewards.ammo.x4, [800, 1100]);
  assert.deepEqual(COLLECTABLE_TYPES.Cargo_Box.rewards.resources.npc_debris, [1, 3]);
  assert.deepEqual(COLLECTABLE_TYPES.Hybrid_Alloy_Box.rewards.resources.hybrid_alloy, [1, 3]);
  assert.equal(COLLECTABLE_TYPES.Bonus_Box.exclusiveRewards.reduce((sum, item) => sum + item.weight, 0), 100);
  assert.equal(COLLECTABLE_TYPES.Bonus_Box.exclusiveRewards.filter(item => item.reward.ammo).length, 3);
  assert.equal(COLLECTABLE_SPAWN.interval, 1);
});

test("les quêtes respectent les prérequis et ne récompensent qu'une fois", () => {
  const state = normalizeQuestState({ active: { unknown: 99 }, completed: ["unknown"] });
  const first = QUEST_DEFINITIONS[0];
  const second = QUEST_DEFINITIONS[1];

  assert.equal(canAcceptQuest(state, first), true);
  assert.equal(canAcceptQuest(state, second), false);
  assert.equal(acceptQuest(state, first.id), true);

  for (const objective of getQuestObjectives(first)) {
    for (let i = 0; i < objective.amount + 3; i++) {
      if (objective.kind === "collect") recordQuestCollect(state, objective.type);
      else recordQuestKill(state, objective.type);
    }
    assert.equal(state.active[first.id][objective.id], objective.amount);
  }
  assert.equal(isQuestComplete(state, first), true);

  const reward = claimQuest(state, first.id);
  assert.equal(reward.credits, first.reward.credits);
  assert.equal(claimQuest(state, first.id), null);
  assert.equal(canAcceptQuest(state, second), true);
});

test("les quêtes acceptent cinq missions, la collecte et l'abandon", () => {
  const state = normalizeQuestState();
  const unlocked = QUEST_DEFINITIONS.filter(quest => !quest.requires);
  const hasCollectObjective = quest => getQuestObjectives(quest).some(objective => objective.kind === "collect");
  const collectCandidate = unlocked.find(hasCollectObjective);
  const independent = [
    ...unlocked.filter(quest => !hasCollectObjective(quest)).slice(0, MAX_ACTIVE_QUESTS - 1),
    collectCandidate,
    unlocked.find(quest => quest.id !== collectCandidate.id && hasCollectObjective(quest)),
  ];

  for (const quest of independent.slice(0, MAX_ACTIVE_QUESTS)) {
    assert.equal(acceptQuest(state, quest.id), true);
  }
  assert.equal(Object.keys(state.active).length, MAX_ACTIVE_QUESTS);
  assert.equal(acceptQuest(state, independent[MAX_ACTIVE_QUESTS].id), false);

  const collectQuest = QUEST_DEFINITIONS.find(quest => hasCollectObjective(quest) && state.active[quest.id] != null);
  assert.ok(collectQuest);
  const collectObjective = getQuestObjectives(collectQuest).find(objective => objective.kind === "collect");
  recordQuestCollect(state, collectObjective.type);
  assert.equal(state.active[collectQuest.id][collectObjective.id], 1);
  assert.equal(abandonQuest(state, collectQuest.id), true);
  assert.equal(state.active[collectQuest.id], undefined);
  assert.equal(abandonQuest(state, collectQuest.id), false);
});

test("une quête à plusieurs objectifs exige de tous les terminer", () => {
  const quest = QUEST_DEFINITIONS.find(item => getQuestObjectives(item).length > 1);
  const state = normalizeQuestState();
  assert.equal(acceptQuest(state, quest.id), true);

  const [first, ...remaining] = getQuestObjectives(quest);
  for (let i = 0; i < first.amount; i++) {
    if (first.kind === "collect") recordQuestCollect(state, first.type);
    else recordQuestKill(state, first.type);
  }
  assert.equal(isQuestComplete(state, quest), false);
  assert.equal(claimQuest(state, quest.id), null);

  for (const objective of remaining) {
    for (let i = 0; i < objective.amount; i++) {
      if (objective.kind === "collect") recordQuestCollect(state, objective.type);
      else recordQuestKill(state, objective.type);
    }
  }
  assert.equal(isQuestComplete(state, quest), true);
});

test("les missions suivent les visites, les Gates et les éliminations par carte", () => {
  const visitQuest = QUEST_DEFINITIONS.find(quest => getQuestObjectives(quest).some(objective => objective.kind === "visit"));
  const gateQuest = QUEST_DEFINITIONS.find(quest => !quest.requires && getQuestObjectives(quest).some(objective => objective.kind === "gate"));
  const mappedQuest = QUEST_DEFINITIONS.find(quest => !quest.requires && getQuestObjectives(quest).some(objective => objective.kind === "kill" && objective.map));
  const state = normalizeQuestState({});
  assert.equal(acceptQuest(state, visitQuest.id), true);
  const visitObjective = getQuestObjectives(visitQuest)[0];
  recordQuestProgress(state, "visit", visitObjective.type, 1, { map: visitObjective.type });
  assert.equal(state.active[visitQuest.id][visitObjective.id], 1);
  assert.equal(acceptQuest(state, gateQuest.id), true);
  const gateObjective = getQuestObjectives(gateQuest)[0];
  recordQuestProgress(state, "gate", gateObjective.type);
  assert.equal(state.active[gateQuest.id][gateObjective.id], 1);
  assert.equal(acceptQuest(state, mappedQuest.id), true);
  const mappedObjective = getQuestObjectives(mappedQuest).find(objective => objective.map);
  recordQuestProgress(state, "kill", mappedObjective.type, 1, { map: "1-1" });
  assert.equal(state.active[mappedQuest.id][mappedObjective.id], 0);
  recordQuestProgress(state, "kill", mappedObjective.type, 1, { map: mappedObjective.map });
  assert.equal(state.active[mappedQuest.id][mappedObjective.id], 1);
});

test("les contrats permanents sont libres et les missions peuvent récompenser des munitions", () => {
  const permanentIds = ["pirate_saboteur_17500", "elite_cube_3500", "elite_protegit_35000", "elite_interceptor_65000", "elite_annihilator_10500"];
  for (const id of permanentIds) {
    const quest = QUEST_DEFINITIONS.find(item => item.id === id);
    assert.ok(quest);
    assert.equal(quest.requires, undefined);
  }
  const ammoQuest = QUEST_DEFINITIONS.find(item => item.id === "ammo_x4_easy");
  const state = normalizeQuestState({});
  assert.equal(acceptQuest(state, ammoQuest.id), true);
  const objective = getQuestObjectives(ammoQuest)[0];
  recordQuestProgress(state, objective.kind, objective.type, objective.amount);
  assert.deepEqual(claimQuest(state, ammoQuest.id).ammo, { x4: 500 });
});

test("les missions peuvent récompenser des énergies Galaxy Gate", () => {
  const quest = QUEST_DEFINITIONS.find(item => item.id === "energy_first_cells");
  const state = normalizeQuestState({});
  assert.ok(quest);
  assert.equal(acceptQuest(state, quest.id), true);
  const objective = getQuestObjectives(quest)[0];
  recordQuestProgress(state, objective.kind, objective.type, objective.amount);
  assert.equal(claimQuest(state, quest.id).galaxyEnergy, 5);
});

test("les objectifs de la carte inconnue ne progressent que sur ???", () => {
  const quest = QUEST_DEFINITIONS.find(item => item.id === "cursed_first_contact");
  const state = normalizeQuestState({});
  assert.equal(acceptQuest(state, quest.id), true);
  const objective = getQuestObjectives(quest).find(item => item.kind === "kill");
  recordQuestProgress(state, "kill", objective.type, objective.amount, { map: "4-5" });
  assert.equal(state.active[quest.id][objective.id], 0);
  recordQuestProgress(state, "kill", objective.type, objective.amount, { map: "???" });
  assert.equal(state.active[quest.id][objective.id], objective.amount);
  const visit = getQuestObjectives(quest).find(item => item.kind === "visit");
  recordQuestProgress(state, "visit", visit.type, 1, { map: "???" });
  const reward = claimQuest(state, quest.id);
  assert.equal(reward.galaxyEnergy, 250);
  assert.deepEqual(reward.ammo, { x4: 100000, x6: 10000 });
});

test("les contrats légendaires comptent toutes les destructions de NPC", () => {
  const quest = QUEST_DEFINITIONS.find(item => item.id === "legend_million_npcs");
  const state = normalizeQuestState({});
  assert.equal(acceptQuest(state, quest.id), true);
  recordQuestProgress(state, "kill", "npc_Streuner", 400000, { map: "1-1" });
  recordQuestProgress(state, "kill", "npc_Cubikon", 600000, { map: "???" });
  assert.equal(isQuestComplete(state, quest), true);
});

test("la mission finale exige automatiquement toutes les missions précédentes", () => {
  const finalQuest = QUEST_DEFINITIONS.at(-1);
  const previousIds = QUEST_DEFINITIONS.slice(0, -1).map(quest => quest.id);
  assert.equal(finalQuest.id, "ultimate_all_missions");
  assert.deepEqual(finalQuest.requiresAll, previousIds);
  assert.equal(canAcceptQuest(normalizeQuestState({ completed: previousIds.slice(1) }), finalQuest), false);
  assert.equal(canAcceptQuest(normalizeQuestState({ completed: previousIds }), finalQuest), true);
  assert.equal(getQuestObjectives(finalQuest)[0].amount, 1);
});

test("le terminal classe les missions par progression et conserve les chaînes", () => {
  const ordered = getOrderedQuestDefinitions();
  const ids = ordered.map(quest => quest.id);
  assert.equal(ordered.length, QUEST_DEFINITIONS.length);
  assert.equal(new Set(ids).size, QUEST_DEFINITIONS.length);
  assert.equal(ids.at(-1), "ultimate_all_missions");
  assert.ok(ids.indexOf("supply_x2_starter") < ids.indexOf("legend_million_npcs"));
  assert.deepEqual(ids.slice(ids.indexOf("supply_x2_starter"), ids.indexOf("supply_x2_starter") + 3), [
    "supply_x2_starter",
    "supply_x2_patrol",
    "supply_x2_armored",
  ]);
  for (const quest of ordered) {
    if (quest.requires) assert.ok(ids.indexOf(quest.requires) < ids.indexOf(quest.id));
  }
});

test("les missions de navigation pure ont des récompenses contenues", () => {
  const navigationQuests = QUEST_DEFINITIONS.filter(quest => {
    const objectives = getQuestObjectives(quest);
    return objectives.length > 0 && objectives.every(objective => objective.kind === "visit");
  });
  assert.ok(navigationQuests.length >= 10);
  assert.ok(navigationQuests.every(quest => quest.reward.credits <= 5000000));
  assert.equal(QUEST_DEFINITIONS.find(quest => quest.id === "century_013").reward.credits, 5000000);
});

test("les anciennes progressions numériques sont migrées vers le premier objectif", () => {
  const quest = QUEST_DEFINITIONS[0];
  const [first, second] = getQuestObjectives(quest);
  const state = normalizeQuestState({ active: { [quest.id]: 3 } });
  assert.equal(state.active[quest.id][first.id], 3);
  assert.equal(state.active[quest.id][second.id], 0);
});

test("les comptes sauvegardés sont versionnés et les valeurs sont bornées", async () => {
  const { getCurrentUserFull, register, updateCurrentUserProgress } = await import("../src/core/account.js");
  const created = register({ pseudo: "Pilote", email: "pilote@example.test", password: "secret", faction: "mmo" });
  assert.equal(created.ok, true);

  updateCurrentUserProgress({ credits: -500, inventory: { resources: { npc_debris: 3, hybrid_alloy: 2 } } });
  const user = getCurrentUserFull();
  assert.equal(user.credits, 0);
  assert.equal(user.schemaVersion, 4);
  assert.equal(user.faction, "mmo");
  assert.deepEqual(user.inventory.resources, { npc_debris: 3, hybrid_alloy: 2 });
  assert.deepEqual(user.quests, { active: {}, completed: [] });
  assert.ok(user.revision >= 1);
  assert.ok(user.updatedAt > 0);
});

test("l'économie des équipements progresse par paliers et limite les modules X1", () => {
  assert.deepEqual(CATALOG.speedGen.map(item => item.module.bonusSpeed), [2, 4, 6, 8, 11, 16]);
  assert.deepEqual(CATALOG.shieldGen.map(item => item.module.bonusShield), [5000, 7500, 10000, 12500, 15000, 22500]);
  assert.deepEqual(CATALOG.lasers.map(item => item.module.damage), [40, 100, 150, 200, 275, 600]);
  assert.deepEqual(CATALOG.ammo.map(item => item.price), [50000, 150000, 500000, 250000, 1500000]);
  assert.ok(CATALOG.ammo.every(item => Object.values(item.give.ammo).every(amount => amount === 1000)));
  assert.equal(CATALOG.speedGen.at(-1).price, 1250000000);
  assert.equal(CATALOG.shieldGen.at(-1).price, 1250000000);
  assert.equal(CATALOG.lasers.at(-1).price, 1500000000);
  assert.equal(MODULE_ROLL_COST, 1000000);
  assert.ok(CATALOG.ships.every(item => Number(item.price) > 0));
  assert.deepEqual(MODULE_TIER_WEIGHTS, [["x1", 68], ["x2", 25], ["x3", 7]]);
  assert.deepEqual(MODULE_BONUS_RANGES.x1, [3, 8]);
});

test("la boutique applique un achat multiple de façon atomique", async () => {
  const { buyItem, getCurrentUserFull, updateCurrentUserProgress } = await import("../src/core/account.js");
  updateCurrentUserProgress({ credits: 1000000 });
  const before = Number(getCurrentUserFull().ammo.x2 || 0);
  const bought = buyItem("ammo_x2", 3);
  assert.equal(bought.ok, true);
  assert.equal(bought.quantity, 3);
  assert.equal(bought.totalPrice, 150000);
  assert.equal(getCurrentUserFull().ammo.x2, before + 3000);
  assert.equal(getCurrentUserFull().credits, 850000);
});

test("l'atelier consomme les ressources et sauvegarde chaque fabrication", async () => {
  const { craftCurrentUserRecipe, getCurrentUserFull, updateCurrentUserProgress } = await import("../src/core/account.js");
  updateCurrentUserProgress({ credits: 1000000, inventory: { resources: { npc_debris: 500 } } });
  const crafted = craftCurrentUserRecipe("refine_debris", 2);
  assert.equal(crafted.ok, true);
  const user = getCurrentUserFull();
  assert.equal(user.credits, 950000);
  assert.equal(user.inventory.resources.npc_debris, 100);
  assert.equal(user.inventory.resources.refined_component, 8);
  const rejected = craftCurrentUserRecipe("forge_radion", 1);
  assert.equal(rejected.ok, false);
  assert.equal(getCurrentUserFull().credits, 950000);
});

test("l'atelier génère automatiquement une recette pour toute la boutique", async () => {
  const { CRAFTING_RECIPES } = await import("../src/data/crafting.js");
  const catalogItems = Object.values(CATALOG).flatMap(items => Array.isArray(items) ? items : []);
  assert.equal(CRAFTING_RECIPES.length, catalogItems.length + 1);
  for (const item of catalogItems) {
    const recipe = CRAFTING_RECIPES.find(entry => entry.catalogItemId === item.id);
    assert.ok(recipe, `recette manquante pour ${item.id}`);
    assert.ok(recipe.costs.resources.refined_component >= 1, `composant raffinÃ© manquant pour ${item.id}`);
  }
  assert.equal(CRAFTING_RECIPES.find(recipe => recipe.id === "refine_debris").costs.resources.npc_debris, 200);
});

test("la roulette conserve un historique persistant des modules obtenus", async () => {
  const { addShipModule, getCurrentUserFull } = await import("../src/core/account.js");
  const module = {
    id: "module_test_history",
    kind: "shipModule",
    shipId: "PhoenixBleu",
    tier: "x2",
    type: "dmg",
    bonuses: [{ stat: "damage", pct: 12 }],
    createdAt: 123456,
  };
  assert.equal(addShipModule(module).ok, true);
  const user = getCurrentUserFull();
  assert.equal(user.inventory.shipModules.at(-1).id, module.id);
  assert.equal(user.inventory.moduleRollHistory.at(-1).id, module.id);
});

test("un pilote peut lier son email et changer son mot de passe", async () => {
  const {
    changeCurrentUserPassword,
    getCurrentUserFull,
    login,
    logout,
    updateCurrentUserEmail,
  } = await import("../src/core/account.js");

  assert.equal(updateCurrentUserEmail("nouvelle@example.test", "incorrect").ok, false);
  assert.equal(updateCurrentUserEmail("nouvelle@example.test", "secret").ok, true);
  assert.equal(getCurrentUserFull().email, "nouvelle@example.test");

  assert.equal(changeCurrentUserPassword("incorrect", "nouveau-secret").ok, false);
  assert.equal(changeCurrentUserPassword("secret", "nouveau-secret").ok, true);
  logout();
  assert.equal(login("nouvelle@example.test", "secret").ok, false);
  assert.equal(login("nouvelle@example.test", "nouveau-secret").ok, true);
});

test("changer de firme coûte un milliard de crédits et la moitié de l'honneur", async () => {
  const { changeCurrentUserFaction, getCurrentUserFull, updateCurrentUserProgress } = await import("../src/core/account.js");
  updateCurrentUserProgress({ credits: 2000000000, stats: { honor: 1001, exp: 0, rankPoints: 0, lifetimeKills: 0, npcKills: {} } });
  const changed = changeCurrentUserFaction("eic");
  assert.equal(changed.ok, true);
  assert.equal(changed.honorLost, 501);
  const user = getCurrentUserFull();
  assert.equal(user.faction, "eic");
  assert.equal(user.credits, 1000000000);
  assert.equal(user.stats.honor, 500);
  assert.equal(user.hangars.find(hangar => hangar.active)?.lastMap, "2-1");
  assert.equal(user.hangars.find(hangar => hangar.active)?.lastPos, null);
  assert.equal(changeCurrentUserFaction("eic").ok, false);
});

test("les destructions NPC détaillées sont réellement sauvegardées", async () => {
  const { getCurrentUserFull, updateCurrentUserProgress } = await import("../src/core/account.js");
  updateCurrentUserProgress({ stats: { npcKills: { npc_Streuner: 3, npc_Lordakia: 2 }, npcKillBreakdownVersion: 1 } });
  const user = getCurrentUserFull();
  assert.deepEqual(user.stats.npcKills, { npc_Streuner: 3, npc_Lordakia: 2 });
  assert.equal(user.stats.lifetimeKills, 5);
});

test("les emplacements d'équipement se compactent vers le premier slot", () => {
  assert.deepEqual(compactFitArray([null, "lf3", null, "lf4"], 5), ["lf3", "lf4", null, null, null]);
  assert.deepEqual(
    compactFitDraft({ lasers: [null, "lf3"], gens: ["g3n", null], extras: [], shipMods: [] }, { lasers: 3, gens: 2, extras: 1, shipMods: 1 }),
    { lasers: ["lf3", null, null], gens: ["g3n", null], extras: [null], shipMods: [null] }
  );
});

test("un groupe d'équipements remplit les slots de gauche à droite", () => {
  const result = appendToFitSlots(["lf4", null, null, null], ["lf3", "lf2", "lf1"], 4);
  assert.equal(result.added, 3);
  assert.deepEqual(result.values, ["lf4", "lf3", "lf2", "lf1"]);
});

test("les drones suivent le prix progressif, les niveaux et leurs sprites", () => {
  assert.equal(getIrisPrice(0), 15000000);
  assert.equal(getIrisPrice(1), 30000000);
  assert.equal(getIrisPrice(7), 1920000000);
  assert.equal(getDroneLevel(0), 1);
  assert.equal(getDroneLevel(750000), 5);
  const drone = createDrone("iris", "iris_test");
  assert.equal(drone.fit.equipment.length, 2);
  assert.equal(DRONE_MAX_LEVEL, 6);
  assert.equal(getDroneLevel(1500000), 6);
  assert.match(getDroneSpritePath({ ...drone, level: 6 }, 32), /Iris_lvl_5\/32\.png$/);
  assert.ok(DRONE_FORMATIONS.every(formation => formation.id === "standard" || formation.minDrones === 4));
  assert.equal(DRONE_FORMATIONS.length, 21);
  assert.equal(DRONE_FORMATIONS.find(formation => formation.id === "drill")?.effects.laserDamagePct, 20);
});

test("les équipements des drones sont indépendants entre les deux configurations", async () => {
  const {
    buyCurrentUserDrone,
    getCurrentUserFull,
    saveCurrentUserDroneFit,
    setActiveHangarConfig,
    updateCurrentUserProgress,
  } = await import("../src/core/account.js");
  updateCurrentUserProgress({ credits: 3000000000 });
  const bought = buyCurrentUserDrone("iris");
  assert.equal(bought.ok, true);
  const hangarId = getCurrentUserFull().hangars.find(hangar => hangar.active)?.id;
  assert.ok(hangarId);
  assert.equal(saveCurrentUserDroneFit(bought.drone.id, { equipment: ["laser_lf3", null], ability: null }, 1).ok, true);
  assert.equal(saveCurrentUserDroneFit(bought.drone.id, { equipment: [null, "shield_sg3n"], ability: null }, 2).ok, true);
  setActiveHangarConfig(hangarId, 1);
  assert.deepEqual(getCurrentUserFull().drones.items.find(drone => drone.id === bought.drone.id).fit.equipment, ["laser_lf3", null]);
  setActiveHangarConfig(hangarId, 2);
  assert.deepEqual(getCurrentUserFull().drones.items.find(drone => drone.id === bought.drone.id).fit.equipment, [null, "shield_sg3n"]);
});

test("le catalogue expose les Iris, Apis, Zeus et les formations", () => {
  assert.equal(CATALOG.drones.length, 3);
  assert.ok(CATALOG.drones.some(item => item.drone?.type === "zeus" && item.price === 500000000));
  assert.equal(CATALOG.formations.length, DRONE_FORMATIONS.filter(formation => formation.price > 0).length);
});
