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
import { addProjectile, advanceProjectile, createProjectile } from "../src/core/projectiles.js";
import { createWaveSpawnState } from "../src/core/waves.js";
import { shouldShowNpcBars, updateProgressHud, updateResourceHud, updateWaveHud } from "../src/core/hud.js";
import { createPerformanceMonitor } from "../src/core/performanceMonitor.js";
import { computeNpcSteering } from "../src/core/npcAI.js";
import { getNpcSensorRanges, isNpcWithinSensor, shouldDetectNpc } from "../src/core/npcSensors.js";

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

test("les comptes sauvegardés sont versionnés et les valeurs sont bornées", async () => {
  const { getCurrentUserFull, register, updateCurrentUserProgress } = await import("../src/core/account.js");
  const created = register({ pseudo: "Pilote", email: "pilote@local", password: "secret" });
  assert.equal(created.ok, true);

  updateCurrentUserProgress({ credits: -500 });
  const user = getCurrentUserFull();
  assert.equal(user.credits, 0);
  assert.equal(user.schemaVersion, 2);
  assert.ok(user.revision >= 1);
  assert.ok(user.updatedAt > 0);
});
