import test from "node:test";
import assert from "node:assert/strict";

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

const { purgeRemovedItemIds } = await import("../../SRC/CORE/ACCOUNT.js");

test("purge des items retirés : uniquement les IDs nommés", () => {
  const u = {
    inventory: {
      counts: { shd_mk4: 2, spd_mk4: 1, laser_anchorlock: 1, laser_radion: 3, laser_lf3: 5, laser_odysseus: 1, spd_mk3: 1 },
      shipModules: [{ id: "laser_anchorlock" }, { id: "laser_lf3" }, { id: "shd_radion" }, { id: "laser_odysseus" }],
      modules: ["spd_mk4", "spd_g3n7900"],
    },
    hangars: [{
      shipId: "vengeance",
      modules: { speed: "spd_mk4", shield: "shd_sg3nb02", laser: null, extras: ["laser_radion"] },
      fits: {
        1: { lasers: ["laser_lf3", "laser_anchorlock"], gens: ["SPD_MK4"], extras: [null], shipMods: [] },
        2: { lasers: [null], gens: [], extras: [], shipMods: [] },
      },
    }],
    drones: { items: [{ type: "iris", fits: { 1: { equipment: ["laser_lf3", "shd_radion"] } } }] },
    pet: { owned: true, fit: { lasers: ["laser_odysseus"], gears: [] } },
    ammo: { x1: null, x2: 100, RADION: 50 },
  };
  purgeRemovedItemIds(u);
  assert.deepEqual(Object.keys(u.inventory.counts).sort(), ["laser_lf3", "laser_odysseus", "spd_mk3"]);
  assert.deepEqual(u.inventory.shipModules.map((m) => m.id).sort(), ["laser_lf3", "laser_odysseus"]);
  assert.deepEqual(u.inventory.modules, ["spd_g3n7900"]);
  assert.deepEqual(u.hangars[0].fits["1"].lasers, ["laser_lf3", null]);
  assert.deepEqual(u.hangars[0].fits["1"].gens, [null]);
  assert.equal(u.hangars[0].modules.speed, null);
  assert.equal(u.hangars[0].modules.shield, "shd_sg3nb02");
  assert.deepEqual(u.drones.items[0].fits["1"].equipment, ["laser_lf3", null]);
  assert.deepEqual(u.pet.fit.lasers, ["laser_odysseus"]);
  assert.equal(u.ammo.RADION, 0);
  assert.equal(u.ammo.x2, 100);
});
