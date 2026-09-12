import test from "node:test";
import assert from "node:assert/strict";

import {
  BOOSTERS,
  activeBoosterMults,
  boosterTimeLeftMs,
  formatBoosterCountdown,
  formatBoosterDuration,
  getBooster,
  isBoosterActive,
  normalizeBoostersState,
} from "../../SRC/DATA/BOOSTERS.js";

class MemoryStorage {
  #data = new Map();
  get length() { return this.#data.size; }
  clear() { this.#data.clear(); }
  key(i) { return [...this.#data.keys()][i] || null; }
  getItem(k) { return this.#data.has(k) ? this.#data.get(k) : null; }
  setItem(k, v) { this.#data.set(k, String(v)); }
  removeItem(k) { this.#data.delete(k); }
}
globalThis.localStorage = new MemoryStorage();
globalThis.sessionStorage = new MemoryStorage();

test("compte de test", async () => {
  const { register } = await import("../../SRC/CORE/ACCOUNT.js");
  const created = register({ pseudo: "Booster", email: "booster@example.test", password: "secret", faction: "mmo" });
  assert.equal(created.ok, true);
});

test("catalogue boosters : 33 définitions officielles", async () => {
  assert.equal(BOOSTERS.length, 33);
  const { CATALOG } = await import("../../SRC/CORE/CATALOG.js");
  assert.equal(CATALOG.boosters.length, 33);
  for (const def of BOOSTERS) {
    const item = CATALOG.boosters.find((it) => it?.booster?.id === def.id);
    assert.ok(item, `item boutique pour ${def.id}`);
    assert.ok(Number(item.price) > 0);
    assert.ok(String(item.icon || "").length > 0);
  }
  const dmg = getBooster("dmg");
  assert.equal(dmg.effect.dmgPct, 10);
  assert.equal(getBooster("shd").effect.shieldPct, 25);
  assert.equal(getBooster("hp").effect.hpPct, 10);
  assert.equal(getBooster("ep").effect.expPct, 10);
  assert.equal(getBooster("hon").effect.honorPct, 10);
  assert.equal(getBooster("nope"), null);
});

test("achat booster : activation immédiate, pas de stock", async () => {
  const { buyItem, getCurrentUserFull, updateCurrentUserProgress } = await import("../../SRC/CORE/ACCOUNT.js");
  updateCurrentUserProgress({ credits: 10000000 });
  const before = Date.now();
  const bought = buyItem("booster_dmg", 2);
  assert.equal(bought.ok, true);
  assert.equal(bought.quantity, 2);
  assert.equal(getCurrentUserFull().inventory.counts.booster_dmg || 0, 0);
  const expiresAt = getCurrentUserFull().boosters.active.dmg;
  assert.ok(expiresAt > before + 2 * 3599 * 1000 && expiresAt <= Date.now() + 2 * 3600 * 1000);
  assert.equal(getCurrentUserFull().credits, 10000000 - bought.totalPrice);
});

test("rachat : prolonge le timer actif", async () => {
  const { buyItem, getCurrentUserFull, updateCurrentUserProgress } = await import("../../SRC/CORE/ACCOUNT.js");
  updateCurrentUserProgress({ credits: 10000000 });
  buyItem("booster_ep", 1);
  const first = getCurrentUserFull().boosters.active.ep;
  buyItem("booster_ep", 1);
  const second = getCurrentUserFull().boosters.active.ep;
  assert.ok(second - first > 3599 * 1000 && second - first <= 3601 * 1000);
});

test("activation manuelle : refuse sans stock et en doublon", async () => {
  const { activateCurrentUserBooster } = await import("../../SRC/CORE/ACCOUNT.js");
  assert.equal(activateCurrentUserBooster("booster_dmg").ok, false);
  assert.equal(activateCurrentUserBooster("booster_hon").ok, false);
});

test("B02 : même effet, cumul avec la même famille", async () => {
  const { buyItem, getCurrentUserFull, updateCurrentUserProgress } = await import("../../SRC/CORE/ACCOUNT.js");
  const { getBooster } = await import("../../SRC/DATA/BOOSTERS.js");
  assert.equal(getBooster("dmg2").effect.dmgPct, 10);
  updateCurrentUserProgress({ credits: 10000000 });
  buyItem("booster_dmg2", 1);
  const u = getCurrentUserFull();
  // DMG-B01 déjà actif (test d'achat) -> le B02 s'active aussi (cumul).
  assert.ok(u.boosters.active.dmg2 > Date.now());
  assert.ok(u.boosters.active.dmg > Date.now());
});

test("multiplicateurs : actifs puis expirés", () => {
  const now = Date.now();
  const state = normalizeBoostersState({
    stock: {},
    active: { dmg: now + 3600000, shd: now - 1000, ep: now + 1000 },
  });
  const mults = activeBoosterMults(state, now);
  assert.equal(mults.dmg, 1.1);
  assert.equal(mults.exp, 1.1);
  assert.equal(mults.shield, 1);
  assert.equal(mults.hp, 1);
  assert.equal(mults.honor, 1);
  assert.equal(isBoosterActive(state, "dmg", now), true);
  assert.equal(isBoosterActive(state, "shd", now), false);
  assert.ok(boosterTimeLeftMs(state, "dmg", now) > 3599000);
  assert.equal(boosterTimeLeftMs(state, "shd", now), 0);
  const expired = activeBoosterMults(state, now + 7200000);
  assert.deepEqual(expired, { dmg: 1, shield: 1, hp: 1, exp: 1, honor: 1, repair: 1, res: 1, petXp: 1, hit: 0, sreg: 1, box: 1, quest: 1 });
});

test("variantes lexique : NPC, précision, 50 %, EPHON, multiple, PET", () => {
  const now = Date.now();
  const state = normalizeBoostersState({
    stock: {},
    active: { npc: now + 1000, dmgh: now + 1000, ep50: now + 1000, hon50: now + 1000, ephon: now + 1000, mul: now + 1000, pep: now + 1000 },
  });
  const mults = activeBoosterMults(state, now);
  assert.ok(Math.abs(mults.dmg - 1.17) < 1e-9);
  assert.equal(mults.hit, 8);
  assert.equal(mults.exp, 2.55);
  assert.equal(mults.honor, 2.5);
  assert.equal(mults.shield, 1.05);
  assert.equal(mults.petXp, 1.05);
});

test("lexique complet : regen, bonus box, quêtes + cumul famille", () => {
  const now = Date.now();
  const state = normalizeBoostersState({
    stock: {},
    active: { sreg: now + 1000, bb: now + 1000, qr: now + 1000 },
  });
  const mults = activeBoosterMults(state, now);
  assert.equal(mults.sreg, 1.25);
  assert.equal(mults.box, 2);
  assert.equal(mults.quest, 2);
});

test("nouvelles familles : réparation et ressources", () => {
  const now = Date.now();
  const state = normalizeBoostersState({ stock: {}, active: { rep: now + 1000, res: now + 1000 } });
  const mults = activeBoosterMults(state, now);
  assert.equal(mults.repair, 1.1);
  assert.equal(mults.res, 1.25);
  assert.equal(getBooster("rep").effect.repairPct, 10);
  assert.equal(getBooster("res").effect.resPct, 25);
});

test("normalisation : nettoie les valeurs invalides", () => {
  const state = normalizeBoostersState({ stock: { dmg: -3, shd: "x", hon: 2.7 }, active: { dmg: "abc", hp: 123 } });
  assert.equal(state.stock.dmg, 0);
  assert.equal(state.stock.shd, 0);
  assert.equal(state.stock.hon, 2);
  assert.equal(state.active.dmg, undefined);
  assert.equal(state.active.hp, 123);
});

test("icônes : fichiers boutique + fenêtre présents", async () => {
  const { existsSync } = await import("node:fs");
  for (const def of BOOSTERS) {
    assert.ok(existsSync(def.icon.slice(1)), `icône boutique ${def.id}`);
    assert.ok(existsSync(def.iconMini.slice(1)), `mini fenêtre ${def.id}`);
  }
});

test("formatages durées", () => {
  assert.equal(formatBoosterDuration(3600), "1 h");
  assert.equal(formatBoosterDuration(90), "1 min");
  assert.equal(formatBoosterCountdown(3661000), "1:01:01");
  assert.equal(formatBoosterCountdown(59000), "00:59");
});
