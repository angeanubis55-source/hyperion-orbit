import test from "node:test";
import assert from "node:assert/strict";
import { UPGRADE_ORE_BONUS, UPGRADE_SLOT_ORES } from "../../SRC/DATA/RESOURCES.js";
import { chargeShipUpgrade, getCurrentUserFull } from "../../SRC/CORE/ACCOUNT.js";

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

function seedUser(resources) {
  const user = {
    id: "upg-test",
    pseudo: "Upg",
    email: "upg@local",
    credits: 1000000,
    inventory: { counts: {}, ships: ["PhoenixBleu"], shipModules: [], resources: { ...resources } },
    hangars: [],
  };
  globalThis.localStorage.setItem("orbit_users", JSON.stringify([user]));
  globalThis.localStorage.setItem("orbit_current_user", JSON.stringify({ id: user.id, pseudo: user.pseudo, email: user.email }));
}

test("upgrade bonus table matches the official wiki", () => {
  assert.deepEqual(UPGRADE_ORE_BONUS.seprom, { laser: 0.60, rocket: 0.60, shield: 0.40 });
  assert.deepEqual(UPGRADE_ORE_BONUS.promerium, { laser: 0.30, rocket: 0.30, speed: 0.20, shield: 0.20 });
  assert.deepEqual(UPGRADE_ORE_BONUS.prometid, { laser: 0.15, rocket: 0.15 });
  assert.deepEqual(UPGRADE_ORE_BONUS.duranium, { speed: 0.10, shield: 0.10 });
  assert.deepEqual(UPGRADE_ORE_BONUS.osmium, { laser: 0.50, rocket: 0.50, shield: 0.50 });
  assert.ok(!UPGRADE_SLOT_ORES.speed.includes("seprom"));
  assert.ok(!UPGRADE_SLOT_ORES.laser.includes("duranium"));
});

test("charging all four slots consumes ore and loads stock x10", () => {
  seedUser({ seprom: 10, promerium: 10, duranium: 10, prometid: 10 });
  assert.deepEqual(chargeShipUpgrade("laser", "seprom", 5), { ok: true, user: getCurrentUserFull(), slot: "laser", ore: "seprom", stock: 50 });
  assert.deepEqual(chargeShipUpgrade("rocket", "promerium", 10).stock, 100);
  assert.deepEqual(chargeShipUpgrade("speed", "duranium", 10).stock, 100);
  assert.deepEqual(chargeShipUpgrade("shield", "osmium", 1).ok, false);
  const u = getCurrentUserFull();
  assert.equal(u.inventory.resources.seprom, 5);
  assert.equal(u.inventory.resources.promerium || 0, 0);
  assert.deepEqual(u.upgrades.laser, { ore: "seprom", stock: 50 });
  assert.equal(u.upgrades.speed.ore, "duranium");
});

test("same ore stacks, different ore replaces, incompatible refused", () => {
  seedUser({ seprom: 20 });
  chargeShipUpgrade("laser", "seprom", 5);
  chargeShipUpgrade("laser", "seprom", 5);
  assert.equal(getCurrentUserFull().upgrades.laser.stock, 100);
  assert.equal(getCurrentUserFull().inventory.resources.seprom, 10);
  assert.equal(chargeShipUpgrade("laser", "duranium", 1).ok, false);
  assert.equal(chargeShipUpgrade("speed", "seprom", 1).ok, false);
  assert.equal(chargeShipUpgrade("laser", "seprom", 999).ok, false);
});
