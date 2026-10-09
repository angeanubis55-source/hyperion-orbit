import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../SRC/CORE/ACCOUNT_NET.js", import.meta.url), "utf8").replace(/^import .*;\r?\n/gm, "").replace(/^export /gm, "");
const before = { ammoActive: "x3", rocketActive: "r310", launcherActive: "eco10", droneFormation: "standard", droneFormationAt: 1000 };
const after = { ammoActive: "x4", rocketActive: "plt2026", launcherActive: "hstrm01", droneFormation: "butterfly", droneFormationAt: 10000 };
const user = (revision = 1, selection = before) => ({ id: "pilot", revision, credits: 100, stats: { exp: 10 },
  ammoActive: selection.ammoActive, ammo: { active: selection.ammoActive, x3: 100, x4: 100 },
  rocketActive: selection.rocketActive, launcherActive: selection.launcherActive,
  drones: { items: [], formations: ["standard", "butterfly"], activeFormation: selection.droneFormation, lastFormationChangeAt: selection.droneFormationAt },
});

function client(storage = new Map()) {
  const requests = [], timers = new Map(), events = [];
  let timerId = 0;
  const api = vm.createContext({ structuredClone, AbortController, performance,
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
    window: { addEventListener() {}, dispatchEvent: event => events.push(event) },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options?.detail; } },
    setTimeout: (fn, ms) => { const id = ++timerId; timers.set(id, { fn, ms }); return id; },
    clearTimeout: id => timers.delete(id),
    fetch: (path, options) => new Promise(resolve => requests.push({ path, body: options.body && JSON.parse(options.body),
      reply: (status, value) => resolve({ status, json: async () => value }) })),
  });
  vm.runInContext(source, api);
  const choose = patch => {
    // ACCOUNT.saveUser mutates the live user before netStore replaces it.
    const current = api.netList()[0];
    for (const key of ["ammoActive", "rocketActive", "launcherActive"]) if (patch[key] !== undefined) current[key] = patch[key];
    if (patch.ammoActive !== undefined) current.ammo.active = patch.ammoActive;
    if (patch.droneFormation !== undefined) current.drones.activeFormation = patch.droneFormation;
    if (patch.droneFormationAt !== undefined) current.drones.lastFormationChangeAt = patch.droneFormationAt;
    api.noteNetSelection(patch);
    current.revision++;
    api.netStore([current]);
  };
  const check = expected => {
    const current = api.netList()[0];
    assert.equal(current.ammoActive, expected.ammoActive);
    assert.equal(current.ammo.active, expected.ammoActive);
    assert.equal(current.rocketActive, expected.rocketActive);
    assert.equal(current.launcherActive, expected.launcherActive);
    assert.equal(current.drones.activeFormation, expected.droneFormation);
    assert.equal(current.drones.lastFormationChangeAt, expected.droneFormationAt);
  };
  const refresh = async serverUser => {
    const entry = [...timers].find(([, timer]) => timer.ms === 0);
    assert.ok(entry); timers.delete(entry[0]); entry[1].fn();
    const request = requests.findLast(r => r.path === "/api/me");
    request.reply(200, { ok: true, user: serverUser });
    for (let i = 0; i < 8; i++) await Promise.resolve();
  };
  return { api, requests, timers, storage, choose, check, refresh, events };
}

test("une ancienne sauvegarde acceptee ne remplace aucun des quatre nouveaux choix", async () => {
  const c = client(); c.api.enterNetMode("token", user()); c.choose(before);
  const saving = c.api.flushNetUser(), request = c.requests.at(-1);
  c.choose(after);
  request.reply(200, { ok: true, user: request.body.user }); await saving;
  c.check(after);
  const conflict = c.api.flushNetUser();
  c.requests.at(-1).reply(409, { stale: true, user: user(50) }); await conflict;
  c.check(after);
});

test("les selections restent en attente apres plusieurs conflits consecutifs", async () => {
  const c = client(); c.api.enterNetMode("token", user()); c.choose(after);
  for (const revision of [50, 51, 52]) {
    const saving = c.api.flushNetUser(); c.requests.at(-1).reply(409, { stale: true, user: user(revision) });
    await saving; c.check(after);
  }
  const saving = c.api.flushNetUser(), snapshot = c.requests.at(-1).body.user;
  c.requests.at(-1).reply(200, { ok: true, user: snapshot }); await saving;
  // Once confirmed, another session's newer choices can be adopted normally.
  await c.refresh(user(snapshot.revision + 10)); c.check(before);
});

test("un refresh du compte conserve les choix locaux et adopte les nouveaux gains", async () => {
  const c = client(); c.api.enterNetMode("token", user()); c.choose(after);
  await c.refresh({ ...user(50), credits: 300, stats: { exp: 500 } });
  c.check(after); assert.equal(c.api.netList()[0].credits, 300); assert.equal(c.api.netList()[0].stats.exp, 500);
});

test("une correction admin respecte les totaux serveur sans annuler les selections", async () => {
  const c = client(); c.api.enterNetMode("token", user()); c.choose(after);
  const saving = c.api.flushNetUser();
  c.requests.at(-1).reply(409, { stale: true, adminConflict: true, user: { ...user(50), credits: 1, stats: { exp: 2 }, _adminWriteToken: "admin" } });
  await saving; c.check(after);
  assert.equal(c.api.netList()[0].credits, 1); assert.equal(c.api.netList()[0].stats.exp, 2);
});

test("le changement d'identite n'annule pas une selection encore non confirmee", async () => {
  const c = client(); c.api.enterNetMode("token", user()); c.choose(after);
  const updating = c.api.apiAccountIdentity("pseudo", "NewName", "password");
  c.requests.at(-1).reply(200, { ok: true, user: { ...user(50), pseudo: "NewName" } });
  await updating; c.check(after); assert.equal(c.api.netList()[0].pseudo, "NewName");
});

test("les choix non confirmes survivent au rechargement et sont isoles par compte", async () => {
  const c = client(); c.api.enterNetMode("token", user()); c.choose(after);
  const reloaded = client(c.storage); assert.equal(reloaded.api.bootNetFromCache(), true);
  reloaded.check(after); await reloaded.refresh(user(50)); reloaded.check(after);
  reloaded.api.netSetCurrent(null);
  reloaded.api.enterNetMode("other-token", { ...user(), id: "other" }); reloaded.check(before);
});

test("deux flush simultanes partagent l'envoi en cours et le dernier choix reste sauvegardable", async () => {
  const c = client(); c.api.enterNetMode("token", user()); c.choose(before);
  const first = c.api.flushNetUser(); c.choose(after); const second = c.api.flushNetUser();
  assert.equal(c.requests.filter(r => r.path === "/api/save").length, 1);
  c.requests[0].reply(200, { ok: true, user: c.requests[0].body.user });
  await Promise.all([first, second]); c.check(after);
  const latest = c.api.flushNetUser(), request = c.requests.at(-1);
  assert.equal(request.body.user.ammoActive, after.ammoActive);
  request.reply(200, { ok: true, user: request.body.user }); await latest; c.check(after);
});

test("une reponse recue apres deconnexion ne reactive pas l'ancien compte", async () => {
  const c = client(); c.api.enterNetMode("token", user()); c.choose(after);
  const saving = c.api.flushNetUser(), request = c.requests.at(-1);
  c.api.netSetCurrent(null);
  request.reply(200, { ok: true, user: request.body.user }); await saving;
  assert.equal(c.api.netActive(), false); assert.equal(c.api.netList().length, 0);
});
