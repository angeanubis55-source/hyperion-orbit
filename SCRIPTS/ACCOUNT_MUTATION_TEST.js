import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { getCurrentUserFull, buyItem, sellCurrentUserOre, setPetMode, updateCurrentUserProgress,
  loadSkylabFromShip, chargeShipUpgradesAutomatically, craftCurrentUserRecipe, completeCurrentUserGalaxyGate,
  saveUser, saveHangarLoadout, saveCurrentUserDroneFits, getDroneFit } from "../SRC/CORE/ACCOUNT.js";
import { createDrone } from '../DRONE/DRONE_TYPES.js';
import { GALAXY_GATE_DEFINITIONS, normalizeGalaxyGateState } from "../SRC/CORE/GALAXY_GATES.js";
import { CATALOG } from "../SRC/CORE/CATALOG.js";
import { ORE_SELL_PRICES } from "../SRC/DATA/RESOURCES.js";

for (const key of ["localStorage", "window", "CustomEvent"]) {
  Object.defineProperty(globalThis, key, { value: undefined, writable: true, configurable: true });
}
const engine = readFileSync(new URL("../SRC/CORE/ORBIT_ENGINE.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
function engineFunction(name) {
  const start = engine.indexOf(`function ${name}(`);
  const end = start + engine.slice(start).search(/^}$/m);
  assert.ok(start >= 0 && end > start, name);
  return engine.slice(start, end + 1);
}

function session(t) {
  const original = { schemaVersion: 4, id: `mutation-test-${t.name}`, pseudo: "MutationTest", email: "mutation@example.test",
    ship: "goliath", credits: 100_000_000, ammoActive: "x4", ammo: { x3: 100, x4: 100 }, rockets: { plt2026: 20 },
    inventory: { ships: ["goliath"], resources: { prometium: 100 } },
    hangars: [{ id: "h1", shipId: "goliath", active: true, activeConfig: 1, fits: { "1": {}, "2": {} } }],
    pet: { owned: true, active: true, fuel: 100, exp: 0, hp: 1000, sh: 0 },
  };
  const storage = new Map([["orbit_users", JSON.stringify([original])],
    ["orbit_current_user", JSON.stringify({ id: original.id, pseudo: original.pseudo, email: original.email })]]);
  t.mock.property(globalThis, "localStorage", { getItem: k => storage.get(k) ?? null,
    setItem: (k, v) => storage.set(k, v), removeItem: k => storage.delete(k) });
  const win = new EventTarget(); win.__CURRENT_MAP_ID__ = "1-1";
  t.mock.property(globalThis, "window", win);
  class Custom extends Event { constructor(type, options = {}) { super(type); this.detail = options.detail; } }
  t.mock.property(globalThis, "CustomEvent", Custom);
  const loaded = getCurrentUserFull();
  loaded.inventory.resources.prometium += 50;
  loaded.pet.hp = 5000; loaded.pet.fuel = 93;
  const ctx = vm.createContext({ started: true, window: win, CustomEvent: Custom,
    account: { user: loaded, dirty: true, saveCd: 15 },
    player: { credits: original.credits + 12_500, ammo: { active: "x4", x3: 80, x4: 80 }, rockets: { plt2026: 18 },
      x: 1500, y: 1500, dead: false },
    getCurrentUserFull, updateCurrentUserProgress, SESSION_HANGAR_ID: "h1", questState: loaded.quests,
    hangarLocationTransferPending: () => false, savedHpPct: () => 1, savedShPct: () => 0,
    AMMO: { x1: {}, x3: {}, x4: {} }, ROCKET_IDS: ["plt2026"], ROCKET_TYPES: { plt2026: {}, eco10: {} },
    ammoCount: key => ctx.player.ammo[key] || 0,
  });
  vm.runInContext(["sanitizeRocketsForSave", "saveProgressNowMeasured", "syncPlayerStocksFromAccount"].map(engineFunction).join("\n"), ctx);
  let flushes = 0;
  win.addEventListener("orbit:account-before-mutation", () => {
    if (ctx.account.dirty) { flushes++; ctx.saveProgressNowMeasured(); }
  });
  win.addEventListener("orbit:user-updated", e => {
    if (e.detail?.source === "progress") return;
    const fresh = getCurrentUserFull();
    ctx.player.credits = fresh.credits; ctx.syncPlayerStocksFromAccount(fresh); ctx.account.user = fresh;
  });
  return { ctx, original, flushes: () => flushes };
}

test("achat d'essence : conserve gains, tirs, minerais et réparation PET avant l'autosave", t => {
  const { ctx, original, flushes } = session(t);
  const result = buyItem("pet_fuel", 100); assert.equal(result.ok, true);
  assert.equal(result.user.credits, original.credits + 12_500 - result.totalPrice);
  assert.equal(result.user.pet.fuel, 193); assert.equal(result.user.pet.hp, 5000);
  assert.equal(result.user.inventory.resources.prometium, 150);
  assert.equal(result.user.ammo.x4, 80); assert.equal(result.user.rockets.plt2026, 18);
  assert.equal(flushes(), 1);
  ctx.saveProgressNowMeasured();
  assert.equal(getCurrentUserFull().credits, result.user.credits);
});

test("vente de minerais : vend aussi la collecte récente sans perdre les crédits", t => {
  const { ctx, original } = session(t);
  const result = sellCurrentUserOre("prometium"); assert.equal(result.ok, true);
  assert.equal(result.gained, 150 * ORE_SELL_PRICES.prometium);
  assert.equal(result.user.credits, original.credits + 12_500 + result.gained);
  ctx.saveProgressNowMeasured();
  assert.equal(getCurrentUserFull().inventory.resources.prometium || 0, 0);
});

test("achat de munitions après des tirs : le prochain save garde tout le nouveau stock", t => {
  const { ctx } = session(t);
  const item = Object.values(CATALOG).flat().find(i => Number(i?.give?.ammo?.x3) > 0);
  assert.ok(item);
  const result = buyItem(item.id, 1); assert.equal(result.ok, true);
  assert.ok(result.user.ammo.x3 > 80);
  assert.equal(ctx.player.ammo.x3, result.user.ammo.x3);
  ctx.saveProgressNowMeasured();
  assert.equal(getCurrentUserFull().ammo.x3, result.user.ammo.x3);
});

test("changer une sélection ou un mode PET conserve les consommations et les soins", t => {
  const { ctx, original } = session(t);
  assert.equal(updateCurrentUserProgress({ ammoActive: "x1" }).ok, true);
  let user = getCurrentUserFull();
  assert.equal(user.credits, original.credits + 12_500); assert.equal(user.ammo.x4, 80);
  assert.equal(user.pet.hp, 5000); assert.equal(user.pet.fuel, 93);
  const result = setPetMode("passive"); assert.equal(result.ok, true);
  ctx.saveProgressNowMeasured(); user = getCurrentUserFull();
  assert.equal(user.ammoActive, "x1"); assert.equal(user.pet.hp, 5000);
});

test("transport Skylab : n'efface pas les ressources encore présentes dans le moteur", t => {
  const { ctx, original } = session(t);
  const result = loadSkylabFromShip({ prometium: 40 }); assert.equal(result.ok, true);
  assert.equal(result.user.inventory.resources.prometium, 110);
  assert.equal(result.user.credits, original.credits + 12_500);
  ctx.saveProgressNowMeasured(); assert.equal(getCurrentUserFull().inventory.resources.prometium, 110);
});

test("les simples lectures du compte ne déclenchent pas de sauvegarde de combat", t => {
  const { flushes } = session(t);
  getCurrentUserFull(); getCurrentUserFull(); assert.equal(flushes(), 0);
});

test("cinq packs de Seprom restent en soute apres le craft et l'autosave", t => {
  const { ctx, original } = session(t);
  Object.assign(ctx.account.user.inventory.resources, { rinusk: 6250, blacklight_trace: 1250 });
  const result = craftCurrentUserRecipe("craft_seprom_5000", 5);
  assert.equal(result.ok, true);
  assert.equal(result.user.inventory.resources.seprom, 25000);
  assert.equal(result.user.inventory.resources.rinusk || 0, 0);
  assert.equal(result.user.inventory.resources.blacklight_trace || 0, 0);
  assert.equal(result.user.credits, original.credits + 12500 - 50000000);
  assert.equal(ctx.account.user.inventory.resources.seprom, 25000);
  ctx.saveProgressNowMeasured();
  assert.equal(getCurrentUserFull().inventory.resources.seprom, 25000);
});

test("le chargement automatique partage le minerai sans perdre les gains et consommations en cours", t => {
  const { ctx, original, flushes } = session(t);
  ctx.account.user.inventory.resources.seprom = 501;
  const result = chargeShipUpgradesAutomatically({ laser: 'seprom', rocket: 'seprom', shield: 'seprom', speed: 'seprom' });
  assert.equal(result.consumed, 501);
  assert.equal(flushes(), 1, 'une seule preparation pour les trois slots compatibles');
  for (const slot of ['laser', 'rocket', 'shield']) assert.equal(result.user.upgrades[slot].stock, 1670);
  assert.equal(result.user.upgrades.speed?.stock || 0, 0);
  assert.equal(result.user.inventory.resources.seprom || 0, 0);
  assert.equal(result.user.credits, original.credits + 12500);
  assert.equal(result.user.ammo.x4, 80); assert.equal(result.user.rockets.plt2026, 18);
  ctx.saveProgressNowMeasured();
  const saved = getCurrentUserFull();
  assert.equal(saved.upgrades.laser.stock, 1670);
  assert.equal(saved.inventory.resources.seprom || 0, 0);
});

test("consommer l'essence PET ne recharge pas un ancien compte et ne retire pas les soins", t => {
  const { ctx } = session(t);
  Object.assign(ctx, { petState: { fuelTickT: 0, fuelRest: 0 }, PET_FUEL_TICK_SEC: 2, PET_FUEL_ONESHOT: 3,
    petFuelTickCost: () => 1, petFuelEcoMult: () => 1, noteNetPetFuelConsumed() {},
    markProgressDirty: () => { ctx.account.dirty = true; } });
  vm.runInContext(["tickPetFuel", "consumePetOneshotFuel"].map(engineFunction).join("\n"), ctx);
  ctx.tickPetFuel(2);
  assert.equal(ctx.account.user.pet.hp, 5000); assert.equal(ctx.account.user.pet.fuel, 92);
  const result = ctx.consumePetOneshotFuel(ctx.account.user.pet, ctx.account.user);
  assert.equal(result.ok, true); assert.equal(result.have, 89);
  assert.equal(ctx.account.user.inventory.resources.prometium, 150);
  ctx.saveProgressNowMeasured();
  const saved = getCurrentUserFull();
  assert.equal(saved.pet.hp, 5000); assert.equal(saved.pet.fuel, 89);
  assert.equal(saved.inventory.resources.prometium, 150);
});

test("la synchronisation applique aussi une diminution du stock et revient sur x1 si épuisé", () => {
  const ctx = vm.createContext({ player: { ammo: { active: "x4", x4: 100 }, rockets: { plt2026: 20 } },
    AMMO: { x1: {}, x4: {} }, ROCKET_IDS: ["plt2026"], ROCKET_TYPES: { plt2026: {}, eco10: {} },
    ammoCount: key => ctx.player.ammo[key] || 0 });
  vm.runInContext(engineFunction("syncPlayerStocksFromAccount"), ctx);
  ctx.syncPlayerStocksFromAccount({ ammoActive: "x4", ammo: { x4: 0 }, rockets: { plt2026: 2 } });
  assert.equal(ctx.player.ammo.x4, 0); assert.equal(ctx.player.ammo.active, "x1");
  assert.equal(ctx.player.rockets.plt2026, 2);
});

for (const gate of Object.values(GALAXY_GATE_DEFINITIONS)) for (const deferred of [false, true]) {
  test(`${gate.id} : Xénomit proportionnel aux crédits, gain ${deferred ? 'différé' : 'immédiat'} et unique`, t => {
    const { ctx } = session(t);
    ctx.account.dirty = false;
    const user = ctx.account.user;
    user.inventory.resources = { prometium: 3000, xenomit: 17, kyhalon: 11, tetrathrin: 12, bifenon: 13, schism: 14, diametrion: 15 };
    user.galaxyGates = normalizeGalaxyGateState({ active: gate.id });
    const result = completeCurrentUserGalaxyGate(gate.id, user, { deferReward: deferred });
    const xenomit = gate.completion.credits / 40000;
    assert.equal(result.ok, true, gate.id);
    assert.equal(result.reward.xenomit, xenomit, gate.id);
    assert.equal(result.user.inventory.resources.xenomit, 17 + (deferred ? 0 : xenomit), gate.id);
    assert.equal(result.user.inventory.resources.prometium, 3000);
    assert.equal(getCurrentUserFull().inventory.resources.xenomit, 17 + (deferred ? 0 : xenomit), 'gain sauvegardé');
    for (const [id, initial] of [['kyhalon', 11], ['tetrathrin', 12], ['bifenon', 13], ['schism', 14], ['diametrion', 15]]) {
      const amount = result.reward.resources[id];
      const creditsPerUnit = id === 'schism' ? 10000000 : id === 'diametrion' ? 2000000 : 1000000;
      assert.equal(amount, Math.floor(gate.completion.credits / creditsPerUnit), `${gate.id} : ${id} proportionnel aux credits`);
      assert.equal(result.user.inventory.resources[id], initial + (deferred ? 0 : amount));
      assert.equal(getCurrentUserFull().inventory.resources[id], initial + (deferred ? 0 : amount));
    }
    assert.equal(completeCurrentUserGalaxyGate(gate.id, result.user).ok, false, 'pas de récompense répétée');
    assert.equal(getCurrentUserFull().inventory.resources.xenomit, 17 + (deferred ? 0 : xenomit));
    for (const [id, initial] of [['kyhalon', 11], ['tetrathrin', 12], ['bifenon', 13], ['schism', 14], ['diametrion', 15]]) {
      assert.equal(getCurrentUserFull().inventory.resources[id], initial + (deferred ? 0 : result.reward.resources[id]));
    }
  });
}

test('designs drones : sauvegarde atomique, manque de stock et transfert sans duplication', t => {
  const { ctx } = session(t); ctx.account.dirty = false;
  const u = ctx.account.user;
  u.drones.items = [createDrone('iris', 'd1'), createDrone('apis', 'd2'), createDrone('zeus', 'd3')];
  u.inventory.counts.drone_design_admin = 2;
  saveUser(u, { source: 'progress' });
  const ship = getCurrentUserFull().hangars[0].fits['1'];
  const fit = { equipment: [null, null], ability: 'drone_design_admin' };
  assert.equal(saveHangarLoadout('h1', { ship, drones: { d1: fit, d2: fit } }, 1).ok, true);
  assert.equal(getDroneFit(getCurrentUserFull().drones.items[0], 'h1', 1).ability, 'drone_design_admin');
  assert.equal(getDroneFit(getCurrentUserFull().drones.items[0], 'h1', 2).ability, null);
  const before = structuredClone(getCurrentUserFull().drones);
  assert.equal(saveHangarLoadout('h1', { ship, drones: { d3: fit } }, 1).ok, false);
  assert.deepEqual(getCurrentUserFull().drones, before, 'pas de modification partielle quand le stock manque');
  assert.equal(saveCurrentUserDroneFits([
    { droneId: 'd1', hangarId: 'h1', configNo: 1, fit: { ...fit, ability: null } },
    { droneId: 'd3', hangarId: 'h1', configNo: 1, fit },
  ]).ok, true);
  const stored = getCurrentUserFull();
  assert.equal(getDroneFit(stored.drones.items[0], 'h1', 1).ability, null);
  assert.equal(getDroneFit(stored.drones.items[2], 'h1', 1).ability, 'drone_design_admin');
  assert.equal(stored.inventory.counts.drone_design_admin, 2);
});

test('designs drones legacy : migration du stock une seule fois et aliases conserves', t => {
  const { ctx } = session(t); ctx.account.dirty = false;
  const u = ctx.account.user;
  u.drones.designs = ['green', { name: 'Hermes', quantity: 3 }];
  saveUser(u, { source: 'progress' });
  for (let i = 0; i < 3; i++) {
    const current = getCurrentUserFull();
    assert.equal(current.inventory.counts.drone_design_admin, 1);
    assert.equal(current.inventory.counts.drone_design_hermes, 3);
    assert.deepEqual(current.drones.designs, []);
    saveUser(current, { source: 'progress' });
  }
});
