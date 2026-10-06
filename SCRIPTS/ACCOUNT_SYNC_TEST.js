import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { pruneUnavailableLoadout } from "../SRC/CORE/FIT_INVENTORY.js";
import { normalizePilotSkills, canInvestPilotSkill, LOGDISK_PRICE, LOGDISK_PACK } from "../SRC/DATA/PILOT_SKILLS.js";
import { planAutoUpgradeCharges, UPGRADE_SLOT_ORES } from '../SRC/DATA/RESOURCES.js';

const source = readFileSync(new URL("../SRC/CORE/ACCOUNT_NET.js", import.meta.url), "utf8").replace(/^export /gm, "");
const account = readFileSync(new URL("../SRC/CORE/ACCOUNT.js", import.meta.url), "utf8");
const user = () => ({ id: "pilot", revision: 1, credits: 100_000_000, stats: { exp: 10, honor: 5, npcKills: {}, lifetimeKills: 0 },
  pilotSkills: { disks: 0, points: 10, resets: 0, spent: { shiphull01: 2 } },
  inventory: { counts: { shd_sg3nb02: 11 }, modules: ["shd_sg3nb02"], resources: { seprom: 100 }, shipModules: [{ id: "m1" }, { id: "m2" }] },
  ammo: { x4: 100 }, rockets: { plt2026: 20 },
  hangars: [{ id: "h1", shipId: "goliath", active: true, fits: { "1": { gens: ["shd_sg3nb02"] }, "2": { gens: ["shd_sg3nb02"] } } }],
  drones: { items: [], formations: [] }, pet: { owned: true, active: false, fuel: 100 },
  skylab: { stock: { seprom: 100 } }, galaxyGates: { energy: 0 }, upgrades: { laser: { ore: "seprom", stock: 100 } },
});
const plain = value => JSON.parse(JSON.stringify(value));

function client(storage = new Map()) {
  const requests = [], timers = new Map(), listeners = new Map(); let timerId = 0;
  const api = vm.createContext({ structuredClone, AbortController,
    localStorage: { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v), removeItem: k => storage.delete(k) },
    window: { addEventListener: (type, fn) => listeners.set(type, fn), dispatchEvent: event => listeners.get(event.type)?.(event) },
    CustomEvent: class { constructor(type, options = {}) { this.type = type; this.detail = options.detail; } },
    setTimeout: (fn, ms) => { const id = ++timerId; timers.set(id, { fn, ms }); return id; }, clearTimeout: id => timers.delete(id),
    fetch: (path, options) => new Promise((resolve, reject) => requests.push({ path, body: options.body && JSON.parse(options.body),
      reply: (status, value) => resolve({ status, json: async () => value }), reject })),
  });
  vm.runInContext(source, api);
  const mutate = fn => { const live = api.netList()[0]; fn(live); live.revision++; api.netStore([live]); };
  const replySave = async (status, out) => {
    const promise = api.flushNetUser(), request = requests.at(-1);
    request.reply(status, typeof out === "function" ? out(request.body) : out);
    await promise; return request.body;
  };
  const conflict = remote => replySave(409, { ok: false, stale: true, user: structuredClone(remote) });
  const accept = () => replySave(200, body => ({ ok: true, user: structuredClone(body.user) }));
  const refresh = async remote => {
    const entry = [...timers].find(([, timer]) => timer.ms === 0); assert.ok(entry);
    timers.delete(entry[0]); entry[1].fn(); requests.at(-1).reply(200, { ok: true, user: structuredClone(remote) });
    for (let i = 0; i < 8; i++) await Promise.resolve();
  };
  return { api, requests, storage, timers, mutate, conflict, accept, refresh, current: () => api.netList()[0] };
}

function wireLogout(c) {
  const start = account.indexOf("export async function logout("), end = account.indexOf("\n}", start) + 2;
  assert.ok(start >= 0 && end > start);
  Object.assign(c.api, { prepareCurrentUserMutation() {}, writeCurrent: value => c.api.netSetCurrent(value) });
  vm.runInContext("let logoutPending = false;\n" + account.slice(start, end).replace(/^export /gm, ""), c.api);
}

test('le partage automatique reste acquis apres un conflit et conserve les nouveaux minerais serveur', async () => {
  const c = client(), initial = user(); c.api.enterNetMode('token', structuredClone(initial));
  Object.assign(c.api, { UPGRADE_SLOT_ORES, planAutoUpgradeCharges, ensureUserShape() {},
    getCurrentUserForMutation: () => c.current(), saveUser: u => { u.revision++; c.api.netStore([u]); } });
  for (const name of ['chargeShipUpgrade', 'chargeShipUpgradesAutomatically']) {
    const from = account.indexOf(`export function ${name}(`), end = account.indexOf('\n}', from) + 2;
    vm.runInContext(account.slice(from, end).replace(/^export /gm, ''), c.api);
  }
  const result = c.api.chargeShipUpgradesAutomatically({ laser: 'seprom', rocket: 'seprom', shield: 'seprom' });
  assert.equal(result.consumed, 100);
  const stocks = plain(c.current().upgrades);
  const remote = structuredClone(initial); remote.revision++;
  remote.inventory.resources.seprom += 7; remote.credits += 500;
  await c.conflict(remote);
  assert.equal(c.current().inventory.resources.seprom, 7);
  assert.deepEqual(plain(c.current().upgrades), stocks);
  assert.equal(c.current().credits, initial.credits + 500);
  await c.accept(); assert.equal(c.current().inventory.resources.seprom, 7);
  assert.deepEqual(plain(c.current().upgrades), stocks);
});

test("la déconnexion attend aussi l'achat réalisé pendant la sauvegarde en cours", async () => {
  const c = client(); c.api.enterNetMode("token", user()); wireLogout(c);
  c.mutate(u => { u.credits -= 3_000_000; u.pilotSkills.disks = 10; });
  const leaving = c.api.logout(), first = c.requests.at(-1);
  assert.equal(first.path, "/api/save"); assert.equal(c.api.netActive(), true);
  c.mutate(u => { u.credits -= 3_000_000; u.pilotSkills.disks += 10; });
  first.reply(200, { ok: true, user: first.body.user });
  for (let i = 0; i < 12; i++) await Promise.resolve();
  const last = c.requests.at(-1); assert.equal(last.path, "/api/save");
  assert.equal(last.body.user.credits, 94_000_000); assert.equal(last.body.user.pilotSkills.disks, 20);
  assert.equal(c.api.netActive(), true, "ne révoque pas le token avant la confirmation finale");
  last.reply(200, { ok: true, user: last.body.user });
  assert.equal((await leaving).ok, true); assert.equal(c.api.netActive(), false);
  assert.equal(c.requests.at(-1).path, "/api/logout");
});

test("une déconnexion avec coupure conserve la session et la sauvegarde à renvoyer", async () => {
  const c = client(); c.api.enterNetMode("token", user()); wireLogout(c);
  c.mutate(u => { u.credits -= 3_000_000; u.pilotSkills.disks = 10; });
  const leaving = c.api.logout(), first = c.requests.at(-1); first.reject(new Error("Coupure"));
  assert.equal((await leaving).ok, false); assert.equal(c.api.netActive(), true);
  assert.equal(c.current().pilotSkills.disks, 10); assert.equal(c.storage.get("orbit_token"), "token");
  assert.ok(JSON.parse(c.storage.get("orbit_user_cache")).retrySave);
  const sent = await c.accept(); assert.deepEqual(sent, first.body);
});

test("sauvegarder le compte ne détache pas les objets utilisés par le moteur", async () => {
  const c = client(); c.api.enterNetMode("token", user());
  const live = c.current(), pet = live.pet, resources = live.inventory.resources;
  c.api.netStore([live]);
  assert.equal(c.current(), live);
  resources.prometium = 50; pet.hp = 5000; pet.fuel -= 4;
  const sent = await c.accept();
  assert.equal(sent.user.inventory.resources.prometium, 50);
  assert.equal(sent.user.pet.hp, 5000); assert.equal(sent.user.pet.fuel, 96);
});

test("une confirmation de sauvegarde ne détache ni le compte ni le PET, même avec des changements en vol", async () => {
  const c = client(); c.api.enterNetMode("token", user());
  const live = c.current(), pet = live.pet, resources = live.inventory.resources;
  const saving = c.api.flushNetUser(), request = c.requests.at(-1);
  pet.hp = 5000; pet.fuel -= 4; resources.prometium = 50;
  request.reply(200, { ok: true, user: request.body.user }); await saving;
  assert.equal(c.current(), live); assert.equal(c.current().pet, pet);
  assert.equal(c.current().inventory.resources, resources);
  pet.hp = 7000; resources.prometium += 10;
  const sent = await c.accept();
  assert.equal(sent.user.pet.hp, 7000); assert.equal(sent.user.pet.fuel, 96);
  assert.equal(sent.user.inventory.resources.prometium, 60);
});

test("la sentinelle de stock infini ne relance pas une sauvegarde déjà confirmée", async () => {
  const c = client(); c.api.enterNetMode("token", user());
  // Une lecture normalise -1 en Infinity dans le compte chargé.
  c.current().ammo.x4 = Infinity;
  const sent = await c.accept(); assert.equal(sent.user.ammo.x4, -1);
  assert.equal(c.current().revision, sent.user.revision);
  assert.equal([...c.timers.values()].some(t => t.ms === 2000), false);
  c.api.flushAccountCache();
  assert.equal(JSON.parse(c.storage.get("orbit_user_cache")).user.ammo.x4, -1);
});

test("l'ordre des champs serveur ne crée pas une nouvelle sauvegarde après confirmation", async () => {
  const c = client(); c.api.enterNetMode("token", user());
  const saving = c.api.flushNetUser(), request = c.requests.at(-1);
  const remote = Object.fromEntries(Object.entries(request.body.user).reverse());
  remote.pet = Object.fromEntries(Object.entries(remote.pet).reverse());
  request.reply(200, { ok: true, user: remote }); await saving;
  assert.equal(c.current().revision, remote.revision);
  assert.equal(c.api.netHasPendingSave(), false);
  assert.equal([...c.timers.values()].some(t => t.ms === 2000), false);
});

test("une récompense PET confirmée avant le canon d'activation n'est pas créditée deux fois", async () => {
  const c = client(), initial = user(); initial.pet.exp = 0;
  c.api.enterNetMode("token", structuredClone(initial));
  c.mutate(u => { u.pet.active = true; });
  const reward = { revision: 3, exp: 20, petExp: 2 };
  assert.equal(c.api.noteNetServerReward(reward), true);
  c.mutate(u => { u.stats.exp += 20; u.pet.exp += 2; });
  await c.conflict({ ...initial, revision: 2, pet: { ...initial.pet, active: true } });
  assert.equal(c.current().pet.exp, 2);
  await c.conflict({ ...initial, revision: 3, stats: { ...initial.stats, exp: 30 },
    pet: { ...initial.pet, active: true, exp: 2 } });
  assert.equal(c.current().pet.exp, 2);
});

test("achat de disques et investissements survivent à plusieurs conflits sans perdre ni redébiter les crédits", async () => {
  const c = client(), initial = user(); c.api.enterNetMode("token", structuredClone(initial));
  c.mutate(u => { u.credits -= 3_000_000; u.pilotSkills.disks += 10; u.pilotSkills.spent.engineering = 2; });
  for (const revision of [50, 51, 52]) {
    await c.conflict({ ...initial, revision, credits: initial.credits + 1000 });
    assert.equal(c.current().credits, initial.credits - 3_000_000 + 1000);
    assert.equal(c.current().pilotSkills.disks, 10); assert.equal(c.current().pilotSkills.spent.engineering, 2);
  }
  const sent = await c.accept(); assert.equal(sent.baseRevision, 52);
  assert.equal(c.current().pilotSkills.disks, 10);
});

test("un refresh serveur conserve l'arbre, les achats d'inventaire et les deux configurations locales", async () => {
  const c = client(), initial = user(); c.api.enterNetMode("token", structuredClone(initial));
  c.mutate(u => { u.credits -= 20_000_000; u.inventory.counts.shd_sg3nb02 += 2;
    u.pilotSkills.spent.engineering = 2; u.hangars[0].fits["2"].gens = ["shd_sg3nb02", "shd_sg3nb02"]; });
  await c.refresh({ ...initial, revision: 30, credits: initial.credits + 500 });
  assert.equal(c.current().credits, 80_000_500); assert.equal(c.current().inventory.counts.shd_sg3nb02, 13);
  assert.equal(c.current().pilotSkills.spent.engineering, 2);
  assert.equal(c.current().hangars[0].fits["2"].gens.length, 2);
  assert.equal(c.current().hangars[0].fits["1"].gens.length, 1);
});

test("une vente conserve ses crédits et retire les équipements dans les deux configs après des conflits répétés", async () => {
  const c = client(), initial = user(); c.api.enterNetMode("token", structuredClone(initial));
  c.mutate(u => { delete u.inventory.counts.shd_sg3nb02; u.inventory.modules = []; u.credits += 55_000_000;
    u.hangars[0].fits["1"].gens = []; u.hangars[0].fits["2"].gens = []; u.inventory.shipModules.shift(); });
  for (const revision of [20, 21, 22]) {
    await c.conflict({ ...initial, revision });
    assert.equal(c.current().inventory.counts.shd_sg3nb02 || 0, 0);
    assert.equal(c.current().credits, 155_000_000);
    assert.deepEqual(plain(c.current().inventory.shipModules), [{ id: "m2" }]);
    assert.equal(c.current().hangars[0].fits["1"].gens.length, 0); assert.equal(c.current().hangars[0].fits["2"].gens.length, 0);
  }
  await c.accept();
});

test("les dépenses de minerais, d'essence et d'améliorations sont conservées sans duplication", async () => {
  const c = client(), initial = user(); c.api.enterNetMode("token", structuredClone(initial));
  c.mutate(u => { u.inventory.resources.seprom -= 20; u.skylab.stock.seprom += 20; u.galaxyGates.energy += 5;
    u.pet.fuel -= 7; u.upgrades.laser.stock -= 3; u.ammo.x4 -= 10; u.rockets.plt2026 -= 2; });
  for (const revision of [2, 3, 4]) await c.conflict({ ...initial, revision });
  assert.equal(c.current().inventory.resources.seprom, 80); assert.equal(c.current().skylab.stock.seprom, 120);
  assert.equal(c.current().galaxyGates.energy, 5); assert.equal(c.current().pet.fuel, 93);
  assert.equal(c.current().upgrades.laser.stock, 97); assert.equal(c.current().ammo.x4, 90); assert.equal(c.current().rockets.plt2026, 18);
});

test("une ancienne réponse acceptée conserve l'achat réalisé pendant son envoi", async () => {
  const c = client(); c.api.enterNetMode("token", user());
  const saving = c.api.flushNetUser(), request = c.requests.at(-1);
  c.mutate(u => { u.credits -= 3_000_000; u.pilotSkills.disks = 10; });
  request.reply(200, { ok: true, user: request.body.user }); await saving;
  assert.equal(c.current().credits, 97_000_000); assert.equal(c.current().pilotSkills.disks, 10);
  const sent = await c.accept(); assert.equal(sent.user.credits, 97_000_000);
});

test("les crédits et munitions encore dans le moteur sont copiés avant l'envoi et avant un conflit", async () => {
  const c = client(); c.api.enterNetMode("token", user());
  let staged = { credits: 97_000_000, ammo: 90 };
  const saveLive = () => { if (staged) { c.mutate(u => { u.credits = staged.credits; u.ammo.x4 = staged.ammo; }); staged = null; } };
  c.api.window.addEventListener("orbit:net-before-save", saveLive);
  c.api.window.addEventListener("orbit:net-before-adopt", saveLive);
  const saving = c.api.flushNetUser(), request = c.requests.at(-1);
  assert.equal(request.body.user.credits, 97_000_000); assert.equal(request.body.user.ammo.x4, 90);
  staged = { credits: 94_000_000, ammo: 80 };
  request.reply(409, { stale: true, user: { ...user(), revision: 20, credits: 100_000_500 } }); await saving;
  assert.equal(c.current().credits, 94_000_500); assert.equal(c.current().ammo.x4, 80);
});

test("une récompense locale et une récompense serveur inconnue cumulent XP et crédits", async () => {
  const c = client(); c.api.enterNetMode("token", user());
  c.mutate(u => { u.credits += 1000; u.stats.exp += 20; u.stats.honor += 2; });
  await c.conflict({ ...user(), revision: 20, credits: 100_000_500, stats: { ...user().stats, exp: 60, honor: 8 } });
  assert.equal(c.current().credits, 100_001_500); assert.equal(c.current().stats.exp, 80); assert.equal(c.current().stats.honor, 10);
});

test("une sauvegarde dont la réponse est perdue renvoie le même identifiant et le même snapshot", async () => {
  const c = client(); c.api.enterNetMode("token", user());
  c.mutate(u => { u.credits -= 3_000_000; u.pilotSkills.disks = 10; });
  const failed = c.api.flushNetUser(), first = c.requests.at(-1); first.reject(new Error("Coupure")); await failed;
  c.mutate(u => { u.credits -= 3_000_000; u.pilotSkills.disks += 10; });
  const retried = await c.accept(); assert.deepEqual(retried, first.body);
  assert.equal(c.current().credits, 94_000_000); assert.equal(c.current().pilotSkills.disks, 20);
  const latest = await c.accept(); assert.notEqual(latest.saveId, first.body.saveId); assert.equal(latest.user.credits, 94_000_000);
});

test("le cache conserve les changements non confirmés et leur référence après rechargement", async () => {
  const c = client(); c.api.enterNetMode("token", user());
  c.mutate(u => { u.credits -= 3_000_000; u.pilotSkills.disks = 10; });
  c.api.flushAccountCache();
  const reloaded = client(c.storage); assert.equal(reloaded.api.bootNetFromCache(), true);
  await reloaded.refresh({ ...user(), revision: 10, credits: 100_000_500 });
  assert.equal(reloaded.current().credits, 97_000_500); assert.equal(reloaded.current().pilotSkills.disks, 10);
});

test("un rechargement après réponse perdue retrouve aussi le snapshot à acquitter", async () => {
  const c = client(); c.api.enterNetMode("token", user());
  c.mutate(u => { u.credits -= 3_000_000; u.pilotSkills.disks = 10; });
  const failed = c.api.flushNetUser(), first = c.requests.at(-1); first.reject(new Error("Coupure")); await failed;
  const reloaded = client(c.storage); assert.equal(reloaded.api.bootNetFromCache(), true);
  const retried = await reloaded.accept(); assert.deepEqual(retried, first.body);
  assert.equal(reloaded.current().credits, 97_000_000); assert.equal(reloaded.current().pilotSkills.disks, 10);
});

test("un changement d'identité attend la sauvegarde en cours et ne rejoue pas un achat déjà acquitté", async () => {
  const c = client(); c.api.enterNetMode("token", user());
  c.mutate(u => { u.credits -= 3_000_000; u.pilotSkills.disks = 10; });
  const saving = c.api.flushNetUser(), request = c.requests.at(-1);
  const identity = c.api.apiAccountIdentity("pseudo", "Nouveau", "password");
  assert.equal(c.requests.length, 1, "l'identité ne part pas pendant le save");
  request.reply(200, { ok: true, user: request.body.user }); await saving;
  for (let i = 0; i < 8; i++) await Promise.resolve();
  assert.equal(c.requests.at(-1).path, "/api/account/pseudo");
  const before = c.requests.length;
  assert.equal((await c.api.flushNetUser()).busy, true); assert.equal(c.requests.length, before);
  c.requests.at(-1).reply(200, { ok: true, user: { ...request.body.user, pseudo: "Nouveau", revision: 20 } });
  await identity;
  assert.equal(c.current().credits, 97_000_000); assert.equal(c.current().pilotSkills.disks, 10); assert.equal(c.current().pseudo, "Nouveau");
});

test("une récompense déjà reçue par HTTP n'est pas créditée encore une fois par WebSocket", async () => {
  const c = client(); c.api.enterNetMode("token", user());
  await c.refresh({ ...user(), revision: 10, credits: 100_000_500 });
  assert.equal(c.api.noteNetServerReward({ revision: 10, credits: 500, exp: 10 }), false);
  assert.equal(c.current().credits, 100_000_500);
});

test("une récompense WebSocket connue ne devient pas un second gain lors d'un conflit avec un achat", async () => {
  const c = client(); c.api.enterNetMode("token", user());
  c.mutate(u => { u.credits -= 3_000_000; u.pilotSkills.disks = 10; });
  assert.equal(c.api.noteNetServerReward({ revision: 2, credits: 500, exp: 20 }), true);
  c.mutate(u => { u.credits += 500; u.stats.exp += 20; });
  await c.conflict({ ...user(), revision: 2, credits: 100_000_500, stats: { ...user().stats, exp: 30 } });
  assert.equal(c.current().credits, 97_000_500); assert.equal(c.current().stats.exp, 30);
});

test("une récompense arrivée pendant une sauvegarde acceptée n'est ni perdue ni rejouée", async () => {
  const c = client(); c.api.enterNetMode("token", user());
  c.mutate(u => { u.credits -= 3_000_000; u.pilotSkills.disks = 10; });
  const saving = c.api.flushNetUser(), request = c.requests.at(-1);
  assert.equal(c.api.noteNetServerReward({ revision: 3, credits: 500, exp: 20 }), true);
  c.mutate(u => { u.credits += 500; u.stats.exp += 20; });
  request.reply(200, { ok: true, user: request.body.user }); await saving;
  assert.equal(c.current().credits, 97_000_500); assert.equal(c.current().stats.exp, 30);
  await c.conflict({ ...request.body.user, revision: 3, credits: 97_000_500, stats: { ...user().stats, exp: 30 } });
  assert.equal(c.current().credits, 97_000_500); assert.equal(c.current().stats.exp, 30);
});

test("le journal GG après un conflit utilise la même référence que le cache rechargé", async () => {
  const c = client(); c.api.enterNetMode("token", user());
  c.mutate(u => { u.galaxyGates.energy = 5; });
  await c.conflict({ ...user(), revision: 10, galaxyGates: { energy: 2 } });
  assert.equal(c.current().galaxyGates.energy, 7);
  const reloaded = client(c.storage); assert.equal(reloaded.api.bootNetFromCache(), true);
  await reloaded.refresh({ ...user(), revision: 11, galaxyGates: { energy: 3 } });
  assert.equal(reloaded.current().galaxyGates.energy, 8);
});

for (const action of ["refresh", "conflict"]) {
  test(`un canon ${action} plus ancien que la récompense WebSocket ne retire pas le gain`, async () => {
    const c = client(), initial = user(); c.api.enterNetMode("token", structuredClone(initial));
    c.mutate(u => { u.credits -= 3_000_000; u.pilotSkills.disks = 10; });
    const reward = { revision: 3, credits: 500, exp: 20, honor: 2, ownsKill: true, type: "npc_test" };
    assert.equal(c.api.noteNetServerReward(reward), true);
    c.mutate(u => { u.credits += 500; u.stats.exp += 20; u.stats.honor += 2;
      u.stats.lifetimeKills++; u.stats.npcKills.npc_test = 1; });
    await c[action]({ ...initial, revision: 2 });
    assert.equal(c.current().credits, 97_000_500); assert.equal(c.current().pilotSkills.disks, 10);
    assert.equal(c.current().stats.exp, 30); assert.equal(c.current().stats.honor, 7);
    assert.equal(c.current().stats.lifetimeKills, 1); assert.equal(c.current().stats.npcKills.npc_test, 1);
    await c.conflict({ ...initial, revision: 3, credits: 100_000_500,
      stats: { ...initial.stats, exp: 30, honor: 7, lifetimeKills: 1, npcKills: { npc_test: 1 } } });
    assert.equal(c.current().credits, 97_000_500); assert.equal(c.current().stats.exp, 30);
    await c.accept();
    assert.equal(c.api.noteNetServerReward(reward), false);
  });
}

test("l'achat réel de disques appelle la sauvegarde, même sans attendre un kill", () => {
  const c = client(); c.api.enterNetMode("token", user());
  Object.assign(c.api, { getCurrentUserFull: () => { throw new Error("Normalisation pendant l'achat réseau"); }, ensurePilotSkills: u => { u.pilotSkills = normalizePilotSkills(u.pilotSkills); },
    LOGDISK_PRICE, LOGDISK_PACK, prepareCurrentUserMutation() {}, saveUser: u => { u.revision++; c.api.netStore([u]); } });
  const start = account.indexOf("export function buyLogDiskPack()"), end = account.indexOf("// Échange de disques", start);
  vm.runInContext(account.slice(start, end).replace(/^export /gm, ""), c.api);
  const result = c.api.buyLogDiskPack(); assert.equal(result.ok, true);
  assert.equal(c.current().revision, 2); assert.equal(c.current().credits, 97_000_000); assert.equal(c.current().pilotSkills.disks, 10);
  c.api.flushAccountCache(); assert.equal(JSON.parse(c.storage.get("orbit_user_cache")).user.pilotSkills.disks, 10);
});

test("l'achat réseau prépare le solde sans sauvegarde complète et conserve les consommations jusqu'à l'envoi", async () => {
  const c = client(); c.api.enterNetMode("token", user());
  const engine = readFileSync(new URL("../SRC/CORE/ORBIT_ENGINE.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  const extract = (text, name) => {
    const start = text.indexOf(`function ${name}(`), end = text.indexOf("\n}", start);
    assert.ok(start >= 0 && end > start, name); return text.slice(start, end + 2);
  };
  const live = c.current();
  let fullSaves = 0, walks = 0;
  Object.assign(c.api, { LOGDISK_PRICE, LOGDISK_PACK, STORAGE_SCHEMA_VERSION: 4,
    started: true, account: { user: live, dirty: true }, player: { credits: 100_012_500, ammo: { x4: 80 } },
    readUsers: () => c.api.netList(), writeUsers: (list, options) => c.api.netStore(list, options),
    petShieldCapacity: () => { throw new Error("Recalcul PET pendant l'achat de disques"); },
    getCurrentUserFull: () => { throw new Error("Normalisation pendant l'achat de disques"); },
    ensurePilotSkills: u => { u.pilotSkills = normalizePilotSkills(u.pilotSkills); },
    saveProgressNow: () => { fullSaves++; live.ammo.x4 = c.api.player.ammo.x4; c.api.account.dirty = false; },
    sanitizeInfiniteValues: () => { walks++; },
  });
  vm.runInContext("let preparingMutation = false;\n" + ["prepareCurrentUserMutation", "saveUser", "buyLogDiskPack"].map(name => extract(account.replace(/\r\n/g, "\n"), name)).join("\n")
    + "\n" + extract(engine, "saveLiveProgressBeforeNetwork"), c.api);
  c.api.window.addEventListener("orbit:account-before-mutation", c.api.saveLiveProgressBeforeNetwork);
  c.api.window.addEventListener("orbit:net-before-save", c.api.saveLiveProgressBeforeNetwork);
  c.api.window.addEventListener("orbit:user-updated", event => {
    if (event.detail.source === "pilot-disks") c.api.player.credits = live.credits;
  });
  assert.equal(c.api.buyLogDiskPack().ok, true);
  assert.equal(live.credits, 97_012_500); assert.equal(live.pilotSkills.disks, 10);
  assert.equal(c.api.player.credits, live.credits);
  assert.equal(fullSaves, 0); assert.equal(walks, 0); assert.equal(c.api.account.dirty, true);
  const sent = await c.accept();
  assert.equal(fullSaves, 1); assert.equal(sent.user.ammo.x4, 80);
  assert.equal(sent.user.credits, 97_012_500); assert.equal(sent.user.pilotSkills.disks, 10);
});

test("les deux points prérequis restent disponibles après synchronisation pour investir le talent suivant", async () => {
  const c = client(); c.api.enterNetMode("token", user());
  c.mutate(u => { u.pilotSkills.spent.engineering = 2; });
  await c.conflict({ ...user(), revision: 10 });
  assert.equal(canInvestPilotSkill(c.current().pilotSkills, "shieldengineering").ok, true);
});

test("le brouillon retire les copies vendues sur vaisseau, drones et PET, en conservant les choix valides", () => {
  const shield = "shd_sg3nb02", loadout = { ship: { gens: [shield, shield], shipMods: ["m1", "m2"] },
    drones: { d1: { equipment: [shield] } }, pet: { generators: [shield] } };
  const current = user(); current.inventory.counts[shield] = 2; current.inventory.shipModules = [{ id: "m2" }];
  assert.equal(pruneUnavailableLoadout(loadout, current), 3);
  assert.deepEqual(loadout.ship.gens, [shield, shield]); assert.deepEqual(loadout.ship.shipMods, [null, "m2"]);
  assert.deepEqual(loadout.drones.d1.equipment, [null]); assert.deepEqual(loadout.pet.generators, [null]);
  assert.equal(pruneUnavailableLoadout(loadout, current), 0);
  current.inventory.counts[shield] = 0; assert.equal(pruneUnavailableLoadout(loadout, current), 2);
  assert.deepEqual(loadout.ship.gens, [null, null]);
});
