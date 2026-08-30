import test from "node:test";
import assert from "node:assert/strict";

import { escapeHtml } from "../src/core/dom.js";
import { DEFAULT_MAP_ID, MAP_LOADERS, normalizeMapId } from "../src/core/mapRegistry.js";
import { clamp, circleRectResolve, dist2, segCircleHit } from "../src/core/collision.js";
import { createKeyboardState, createPointerState } from "../src/core/input.js";
import { bulletLifeForRange, damageEnemyLayers, damagePlayerLayers, drainShield } from "../src/core/combat.js";
import { createSpatialPairIndex, forEachNearbyPair, rebuildIdIndex } from "../src/core/spatialIndex.js";
import { drawCenteredImage, hpHueColor, isWorldPointVisible, screenToWorldPoint, worldToScreenPoint } from "../src/core/rendering.js";
import { createNpcEntity } from "../src/core/npcFactory.js";
import { addProjectile, advanceProjectile, createProjectile, removeProjectile } from "../src/core/projectiles.js";
import { createWaveSpawnState } from "../src/core/waves.js";
import { shouldShowNpcBars, updateProgressHud, updateResourceHud, updateWaveHud } from "../src/core/hud.js";
import { createPerformanceMonitor } from "../src/core/performanceMonitor.js";
import { computeNpcSteering } from "../src/core/npcAI.js";
import { getNpcSensorRanges, isNpcWithinSensor, shouldDetectNpc } from "../src/core/npcSensors.js";
import { shouldRunNpcFrame } from "../src/core/npcActivity.js";
import { pushBounded } from "../src/core/boundedCollection.js";
import { createRadiationSystem } from "../src/core/radiationSystem.js";
import { createGatePortalState, getGateReturnMap, positionGateChoicePortals } from "../src/core/gateSystem.js";
import {
  beginGatePortalJump,
  getPortalOpenFade,
  tickGatePortalJumps,
  tickPortalVisualTransitions,
  updatePortalProximity,
} from "../src/core/portalSystem.js";
import { buildQuestJournalView, buildQuestTerminalView } from "../src/core/questPresentation.js";
import { drawMoveTargetMarker, drawToastMessage } from "../src/core/canvasHudRenderer.js";
import { COLLECTABLE_SPAWN, COLLECTABLE_TYPES } from "../src/data/collectables.js";
import {
  QUEST_DEFINITIONS,
  MAX_ACTIVE_QUESTS,
  acceptQuest,
  abandonQuest,
  canAcceptQuest,
  claimQuest,
  getQuestObjectives,
  isQuestComplete,
  normalizeQuestState,
  recordQuestCollect,
  recordQuestKill,
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
  const radiation = createRadiationSystem({ warningDuration: 5, dpsPct: 0.1 });
  const context = { started: true, paused: false, dead: false, outside: true, hpMax: 1000 };
  assert.equal(radiation.update(4.9, context), 0);
  assert.ok(radiation.state.edgeFade > 0);
  assert.equal(radiation.update(0.2, context), 20);

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
  assert.equal(getGateReturnMap("alpha"), "1-1");
  assert.equal(getGateReturnMap("beta"), "2-1");
  assert.equal(getGateReturnMap("gamma"), "3-1");
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

  const terminal = buildQuestTerminalView({
    questState: state,
    selectedId: QUEST_DEFINITIONS[0].id,
    hasAccess: true,
    collectables: COLLECTABLE_TYPES,
    npcTypes: {},
  });
  assert.match(terminal.listHtml, /accepted/);
  assert.match(terminal.detailHtml, /Mission en cours/);
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

test("les primitives de collision gèrent segments et distances", () => {
  assert.equal(clamp(12, 0, 10), 10);
  assert.equal(dist2(0, 0, 3, 4), 25);
  assert.equal(segCircleHit(0, 0, 10, 0, 5, 1, 2), true);
  assert.equal(segCircleHit(0, 0, 10, 0, 5, 3, 2), false);
  assert.equal(segCircleHit(0, 0, 0, 0, 1, 0, 1), true);
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
  const step = advanceProjectile(projectile, 0.5);
  assert.deepEqual(step, { oldX: 10, oldY: 0, expired: false });
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
  assert.ok(entity.vx < 100);
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

test("les anciennes progressions numériques sont migrées vers le premier objectif", () => {
  const quest = QUEST_DEFINITIONS[0];
  const [first, second] = getQuestObjectives(quest);
  const state = normalizeQuestState({ active: { [quest.id]: 3 } });
  assert.equal(state.active[quest.id][first.id], 3);
  assert.equal(state.active[quest.id][second.id], 0);
});

test("les comptes sauvegardés sont versionnés et les valeurs sont bornées", async () => {
  const { getCurrentUserFull, register, updateCurrentUserProgress } = await import("../src/core/account.js");
  const created = register({ pseudo: "Pilote", email: "pilote@example.test", password: "secret" });
  assert.equal(created.ok, true);

  updateCurrentUserProgress({ credits: -500 });
  const user = getCurrentUserFull();
  assert.equal(user.credits, 0);
  assert.equal(user.schemaVersion, 3);
  assert.deepEqual(user.quests, { active: {}, completed: [] });
  assert.ok(user.revision >= 1);
  assert.ok(user.updatedAt > 0);
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
