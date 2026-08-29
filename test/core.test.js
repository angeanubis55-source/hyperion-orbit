import test from "node:test";
import assert from "node:assert/strict";

import { escapeHtml } from "../src/core/dom.js";
import { DEFAULT_MAP_ID, MAP_LOADERS, normalizeMapId } from "../src/core/mapRegistry.js";
import { clamp, circleRectResolve, dist2, segCircleHit } from "../src/core/collision.js";
import { createKeyboardState, createPointerState } from "../src/core/input.js";
import { bulletLifeForRange, damageEnemyLayers, damagePlayerLayers, drainShield } from "../src/core/combat.js";
import { forEachNearbyPair, rebuildIdIndex } from "../src/core/spatialIndex.js";
import { hpHueColor, isWorldPointVisible, screenToWorldPoint, worldToScreenPoint } from "../src/core/rendering.js";
import { createNpcEntity } from "../src/core/npcFactory.js";
import { addProjectile, advanceProjectile, createProjectile } from "../src/core/projectiles.js";

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
