import test from "node:test";
import assert from "node:assert/strict";
import { getCurrentUserFull, saveHangarLoadout, getDroneFit, getPetFit, sellItem } from "../../SRC/CORE/ACCOUNT.js";
import { computeHangarStats } from "../../SHIP/SHIP_HANGARS.js";
import { getShipPackById } from "../../SHIP/SHIP_PACKS.js";
import { moveEquipmentSlots } from "../../SRC/CORE/FIT_LAYOUT.js";
import { resizeShield } from "../../SRC/CORE/EQUIPMENT_SYNC.js";

function fixture({ pet = false } = {}) {
  const data = new Map();
  globalThis.localStorage = {
    getItem: key => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: key => data.delete(key),
  };
  localStorage.setItem("orbit_users", JSON.stringify([{
    id: "audit", pseudo: "Audit", ship: "PhoenixBleu",
    inventory: { counts: { laser_lf1: 1, laser_lfp01: 1, shd_sg3na01: 1 }, ships: ["PhoenixBleu"], shipModules: [] },
    drones: { items: [{ id: "d1", type: "iris", exp: 0 }] },
    pet: { owned: pet, exp: 0 },
  }]));
  localStorage.setItem("orbit_current_user", JSON.stringify({ id: "audit" }));
  return getCurrentUserFull().hangars.find(h => h.active).id;
}

test("Apply without a PET persists once and survives reload", () => {
  const hid = fixture();
  const before = getCurrentUserFull().revision || 0;
  const result = saveHangarLoadout(hid, { ship: { lasers: ["laser_lf1"] } }, 1);
  assert.equal(result.ok, true, result.error);
  const user = getCurrentUserFull();
  assert.equal(user.revision, before + 1);
  assert.equal(user.hangars.find(h => h.id === hid).fit.lasers[0], "laser_lf1");
});

test("a single laser transfers ship to drone to PET without duplication", () => {
  const hid = fixture({ pet: true });
  assert.equal(saveHangarLoadout(hid, { ship: { lasers: ["laser_lf1"] } }, 1).ok, true);
  assert.equal(saveHangarLoadout(hid, { ship: {}, drones: { d1: { equipment: ["laser_lf1"] } } }, 1).ok, true);
  assert.equal(getCurrentUserFull().hangars[0].fit.lasers.filter(Boolean).length, 0);
  assert.equal(getDroneFit(getCurrentUserFull().drones.items[0], hid, 1).equipment[0], "laser_lf1");
  assert.equal(saveHangarLoadout(hid, { ship: {}, drones: { d1: { equipment: [] } }, pet: { lasers: ["laser_lf1"] } }, 1).ok, true);
  const user = getCurrentUserFull();
  assert.equal(getDroneFit(user.drones.items[0], hid, 1).equipment.filter(Boolean).length, 0);
  assert.equal(getPetFit(user.pet, hid, 1).lasers[0], "laser_lf1");
});

test("invalid PET or duplicate inventory causes no partial save", () => {
  const hid = fixture({ pet: true });
  const before = localStorage.getItem("orbit_users");
  for (const loadout of [
    { ship: { lasers: ["laser_lf1"] }, pet: { lasers: ["invalid"] } },
    { ship: { lasers: ["laser_lf1"] }, drones: { d1: { equipment: ["laser_lf1"] } } },
    { ship: { lasers: ["laser_lfp01"] } },
    { ship: {}, drones: { d1: { equipment: ["laser_lfp01"] } } },
  ]) {
    assert.equal(saveHangarLoadout(hid, loadout, 1).ok, false);
    assert.equal(localStorage.getItem("orbit_users"), before);
  }
});

test("editing configuration 2 leaves active configuration 1 unchanged", () => {
  const hid = fixture();
  assert.equal(saveHangarLoadout(hid, { ship: { lasers: ["laser_lf1"] } }, 2).ok, true);
  const h = getCurrentUserFull().hangars.find(h => h.id === hid);
  assert.equal(h.activeConfig, 1);
  assert.equal(h.fit.lasers.filter(Boolean).length, 0);
  assert.equal(h.fits["2"].lasers[0], "laser_lf1");
});

test("selling respects equipment reserved in inactive configurations", () => {
  const hid = fixture();
  assert.equal(saveHangarLoadout(hid, { ship: {}, drones: { d1: { equipment: ["laser_lf1"] } } }, 2).ok, true);
  assert.equal(sellItem("laser_lf1", 1).ok, false);
  assert.equal(getCurrentUserFull().inventory.counts.laser_lf1, 1);
  assert.equal(saveHangarLoadout(hid, { ship: {}, drones: { d1: { equipment: [] } } }, 2).ok, true);
  assert.equal(sellItem("laser_lf1", 1).ok, true);
});

test("speed modules affect hull speed even without speed generators", () => {
  const shipId = "PhoenixBleu";
  const stats = computeHangarStats({ shipId, fit: { shipMods: ["mod_speed"] } }, {
    inventory: { shipModules: [{ id: "mod_speed", bonuses: [{ stat: "speed", pct: 10 }] }] },
  });
  assert.equal(stats.bonusSpeed, getShipPackById(shipId).speed * 0.1);
});

test("moving drone slots neither duplicates nor loses displaced equipment", () => {
  const same = ["laser_lf1", null];
  assert.deepEqual(moveEquipmentSlots(same, same, 0, 1).target, [null, "laser_lf1"]);
  assert.deepEqual(same, ["laser_lf1", null]);
  const occupied = ["laser_lf1", "shield"];
  assert.deepEqual(moveEquipmentSlots(occupied, occupied, 0, 1).target, ["shield", "laser_lf1"]);
  const moved = moveEquipmentSlots(["laser_lf1", null], ["shield", null], 0, 0);
  assert.deepEqual(moved, { source: ["shield", null], target: ["laser_lf1", null] });
  assert.equal(moveEquipmentSlots(same, same, -1, 0), null);
});

test("account observers see the final loadout once, never an intermediate state", () => {
  const hid = fixture({ pet: true });
  const events = [];
  const previousWindow = globalThis.window;
  globalThis.window = { dispatchEvent: event => {
    if (event.type === "orbit:user-updated") events.push(getCurrentUserFull());
  } };
  try {
    const result = saveHangarLoadout(hid, {
      ship: {}, drones: { d1: { equipment: ["laser_lf1"] } }, pet: { lasers: ["laser_lfp01"] },
    }, 1);
    assert.equal(result.ok, true, result.error);
    assert.equal(events.length, 1);
    assert.equal(getDroneFit(events[0].drones.items[0], hid, 1).equipment[0], "laser_lf1");
    assert.equal(getPetFit(events[0].pet, hid, 1).lasers[0], "laser_lfp01");
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});

test("cached shields follow new equipment capacity without healing damaged shields", () => {
  assert.deepEqual(resizeShield({ sh: 0, shMax: 0 }, 2000), { sh: 2000, shMax: 2000 });
  assert.deepEqual(resizeShield({ sh: 500, shMax: 1000 }, 2000), { sh: 1000, shMax: 2000 });
  assert.deepEqual(resizeShield({ sh: 0, shMax: 1000 }, 2000), { sh: 0, shMax: 2000 });
  assert.deepEqual(resizeShield({ sh: 500, shMax: 1000 }, 0), { sh: 0, shMax: 0 });
});

test("PET full-shield sentinel survives account normalization", () => {
  fixture({ pet: true });
  const users = JSON.parse(localStorage.getItem("orbit_users"));
  users[0].pet.sh = null;
  localStorage.setItem("orbit_users", JSON.stringify(users));
  assert.equal(getCurrentUserFull().pet.sh, null);
});

test("new PET shields persist and are not reset by the next account update", () => {
  const hid = fixture({ pet: true });
  assert.equal(saveHangarLoadout(hid, { ship: {}, pet: { generators: ["shd_sg3na01"] } }, 1).ok, true);
  assert.equal(getCurrentUserFull().pet.sh, 1000);
  assert.equal(saveHangarLoadout(hid, { ship: { lasers: ["laser_lf1"] } }, 1).ok, true);
  assert.equal(getCurrentUserFull().pet.sh, 1000);
});
