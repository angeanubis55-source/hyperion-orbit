import test from "node:test";
import assert from "node:assert/strict";

import { escapeHtml } from "../src/core/dom.js";
import { DEFAULT_MAP_ID, MAP_LOADERS, normalizeMapId } from "../src/core/mapRegistry.js";

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
