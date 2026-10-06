import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { getPetVitalLimits } from "../PET/PET_VITALS.js";
import { getPetLevelXp, getPetMaxHp } from "../PET/PET_TYPES.js";
import { getPetRepairPct, PET_SHIELD_REGEN_PCT_PER_SEC } from "../PET/PET_GEARS.js";
import { CATALOG } from "../SRC/CORE/CATALOG.js";
import { combatProfile } from "./COMBAT_PROFILE.js";
import { getCurrentUserFull, saveUser, updateCurrentUserProgress, repairPet, PET_REPAIR_COST } from "../SRC/CORE/ACCOUNT.js";

// Ce fichier s'exécute dans un worker Node isolé, sans stockage de navigateur.
Object.defineProperty(globalThis, "localStorage", { value: null, writable: true, configurable: true });

const items = Object.values(CATALOG).flat();
const hp = items.find(i => i?.petProtocol?.key === "hp");
const shieldProtocol = items.find(i => i?.petProtocol?.key === "shield");
const shield = items.find(i => i?.module?.type === "shield");
const rep = items.find(i => i?.petGear?.key === "rep" && i.petGear.level === 3);
const fit = () => ({ lasers: [], generators: [shield.id], gears: [rep.id], protocols: [hp.id, shieldProtocol.id] });
const fixture = (shipId = "goliath_plus", legacy = false) => ({
  schemaVersion: 4, id: "pet-repair", pseudo: "PetRepair", email: "pet@example.test", ship: shipId, credits: 100000,
  hangars: [{ id: "pet-hangar", shipId, active: true, activeConfig: 1, fits: { "1": {}, "2": {} } }],
  inventory: { ships: [shipId], counts: { [hp.id]: 1, [shieldProtocol.id]: 1, [shield.id]: 1, [rep.id]: 1 } },
  pet: { owned: true, active: true, fuel: 50000, exp: getPetLevelXp(15), hullUpgrades: 10, hp: 1, sh: 0,
    ...(legacy ? { fits: { "1": fit(), "2": {} } } : { fitsByHangar: { "pet-hangar": { "1": fit(), "2": {} } } }) },
});
function connectLocal(t, user) {
  // Stockage uniquement en mémoire : aucune session ni aucun compte réel.
  const storage = new Map([
    ["orbit_current_user", JSON.stringify({ id: user.id, pseudo: user.pseudo, email: user.email })],
    ["orbit_users", JSON.stringify([user])],
  ]);
  t.mock.property(globalThis, "localStorage", { getItem: k => storage.get(k) ?? null,
    setItem: (k, value) => storage.set(k, value), removeItem: k => storage.delete(k) });
  return storage;
}
const engine = readFileSync(new URL("../SRC/CORE/ORBIT_ENGINE.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
function engineFunction(name) {
  const start = engine.indexOf(`function ${name}(`), end = engine.indexOf("\n}", start);
  assert.ok(start >= 0 && end > start, name);
  return engine.slice(start, end + 2);
}

test("G-REP atteint le vrai maximum sans rollback lors des sauvegardes et relectures", t => {
  const user = fixture(); connectLocal(t, user);
  const ctx = vm.createContext({ account: { user: getCurrentUserFull() }, getPetVitalLimits, getPetRepairPct,
    PET_SHIELD_REGEN_PCT_PER_SEC, petState: { x: 0, y: 0 }, DMG_FMT: { format: String },
    addFloatText() {}, markProgressDirty() {}, tickPetLocator() {} });
  vm.runInContext(["petMaxHpWithHeat", "petShieldMaxForHud", "tickPetRecovery"].map(engineFunction).join("\n"), ctx);
  const max = ctx.petMaxHpWithHeat(ctx.account.user.pet);
  assert.ok(max > getPetMaxHp(15) + 100000);
  for (let second = 0; second < 25; second++) {
    const previousHp = ctx.account.user.pet.hp;
    ctx.tickPetRecovery(1, ctx.account.user.pet, { rep: 3 });
    const healedHp = Math.floor(ctx.account.user.pet.hp);
    assert.ok(healedHp >= previousHp);
    const result = updateCurrentUserProgress({ pet: structuredClone(ctx.account.user.pet) });
    assert.equal(result.ok, true); assert.equal(result.user.pet.hp, healedHp);
    ctx.account.user = getCurrentUserFull();
    assert.equal(ctx.account.user.pet.hp, healedHp);
  }
  assert.equal(ctx.account.user.pet.hp, max);
  assert.equal(ctx.account.user.pet.sh, ctx.petShieldMaxForHud(ctx.account.user.pet, ctx.account.user));
});

for (const ship of ["goliath_plus", "PhoenixBleu"]) {
  test(`migration legacy ${ship} conserve les HP au-dessus de la coque de base`, t => {
    const user = fixture(ship, true), max = getPetVitalLimits(user.pet, user).hpMax;
    user.pet.hp = max; connectLocal(t, user);
    const loaded = getCurrentUserFull(); assert.equal(loaded.pet.hp, max);
    saveUser(loaded); assert.equal(getCurrentUserFull().pet.hp, max);
  });
}

test("serveur et HUD utilisent les mêmes plafonds dans les deux configurations", () => {
  const user = fixture();
  const ctx = vm.createContext({ account: { user }, getPetVitalLimits });
  vm.runInContext(["petMaxHpWithHeat", "petShieldMaxForHud"].map(engineFunction).join("\n"), ctx);
  for (const cfg of [1, 2]) {
    user.hangars[0].activeConfig = cfg;
    const profile = combatProfile(user, "1-1", cfg);
    assert.equal(profile.petHpMax, ctx.petMaxHpWithHeat(user.pet));
    assert.equal(profile.petShMax, ctx.petShieldMaxForHud(user.pet, user));
  }
});

test("normalisation plafonne encore les HP excessifs et ne ressuscite pas un PET détruit", t => {
  const user = fixture(); user.pet.hp = 1e9; connectLocal(t, user);
  const loaded = getCurrentUserFull(); assert.equal(loaded.pet.hp, getPetVitalLimits(loaded.pet, loaded).hpMax);
  loaded.pet.hp = 0; saveUser(loaded); assert.equal(getCurrentUserFull().pet.hp, 0);
});

test("réparation payante rend 10 % du maximum avec bonus, sans activation ni bouclier", t => {
  const user = fixture(); user.pet.hp = 0; connectLocal(t, user);
  const result = repairPet(); assert.equal(result.ok, true);
  assert.equal(result.user.pet.hp, Math.floor(getPetVitalLimits(result.user.pet, result.user).hpMax * 0.1));
  assert.equal(result.user.pet.sh, 0); assert.equal(result.user.pet.active, false);
  assert.equal(result.user.credits, user.credits - PET_REPAIR_COST);
  assert.equal(repairPet().ok, false);
});
