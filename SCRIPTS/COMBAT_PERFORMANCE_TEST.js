import { canUseFactionModule } from "../SRC/CORE/FACTIONS.js";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { formatInteger } from "../SRC/CORE/NUMBER_FORMAT.js";
import { REFINERY_RECIPES, getRefineryRecipe, refineOreOutput } from "../SRC/DATA/RESOURCES.js";
import { guidedChaseSpeed } from "../COMBAT/PROJECTILES.js";
import { damageEnemyLayers } from "../COMBAT/COMBAT_RULES.js";
import { createDeferredPersistence } from "../SRC/CORE/DEFERRED_PERSISTENCE.js";
import { drawCombatFloatTexts } from "../SRC/CORE/COMBAT_TEXT_RENDERER.js";
import { createSpriteOutlineCache } from "../SRC/CORE/SPRITE_OUTLINE_CACHE.js";
import { selectNpcSnapshot } from "./NPC_SNAPSHOT.js";
import { tickFloatingTexts } from "../SRC/CORE/FRAME_SYSTEMS.js";
import { QUEST_DEFINITIONS, getQuestObjectives, normalizeQuestState, recordQuestProgress, isQuestComplete, claimQuest } from "../QUEST/QUEST_TYPES.js";
import { LOGDISK_PACK, LOGDISK_PRICE, normalizePilotSkills } from "../SRC/DATA/PILOT_SKILLS.js";
import { createDefaultSkylabState, normalizeSkylabState, tickSkylabState } from "../SRC/DATA/SKYLAB.js";

// Exerce les fonctions livrées sans démarrer une session ou un serveur réel.
const engine = readFileSync(new URL("../SRC/CORE/ORBIT_ENGINE.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");

test('les NPC lointains sont tous actualises en une seconde sans paquet massif', () => {
  const npc = { list: Array.from({ length: 500 }, (_, i) => ({ uid: `npc_${i}`, type: 'npc_Streuner',
    x: 10000 + i, y: 10000, hp: 800, sh: 400, alive: true, seq: 1 })), deaths: [], dmg: [], gone: [] };
  const seen = new Map();
  let largest = 0;
  for (let tick = 1; tick <= 20; tick++) {
    const packet = selectNpcSnapshot(npc, [{ x: 0, y: 0 }], tick);
    largest = Math.max(largest, Buffer.byteLength(JSON.stringify(packet)));
    for (const entry of packet.list) seen.set(entry.uid, (seen.get(entry.uid) || 0) + 1);
  }
  assert.equal(seen.size, 500);
  assert.ok([...seen.values()].every(count => count === 1));
  const previousPeak = Buffer.byteLength(JSON.stringify(npc));
  assert.ok(largest < previousPeak * 0.1, `${largest} / ${previousPeak} octets`);
  // Un changement d'ordre de la liste ne change pas les NPC servis au meme tick.
  assert.deepEqual(selectNpcSnapshot(npc, [], 7).list.map(e => e.uid).sort(),
    selectNpcSnapshot({ ...npc, list: [...npc.list].reverse() }, [], 7).list.map(e => e.uid).sort());
});

test('combat et proximite NPC restent a 20 Hz, y compris morts et debuffs', () => {
  const immediate = [
    { uid: 'near', x: 100, y: 100 }, { uid: 'near-second-player', x: 20000, y: 20000 },
    { uid: 'aggro', x: 10000, y: 10000, aggro: 'p1' },
    { uid: 'dying', x: 10000, y: 10000, alive: false },
    { uid: 'hit', x: 10000, y: 10000 }, { uid: 'cube', x: 10000, y: 10000, cube: 'open' },
    { uid: 'slow', x: 10000, y: 10000, slowT: 1 }, { uid: 'frozen', x: 10000, y: 10000, freezeT: 1 },
  ];
  const npc = { list: immediate, dmg: [{ uid: 'hit', total: 300 }], deaths: [{ uid: 'dying' }], gone: ['despawn'] };
  for (let tick = 1; tick <= 40; tick++) {
    const packet = selectNpcSnapshot(npc, [{ x: 0, y: 0 }, { x: 20000, y: 20000 }], tick);
    assert.deepEqual(packet.list, immediate);
    assert.equal(packet.dmg, npc.dmg); assert.equal(packet.deaths, npc.deaths); assert.equal(packet.gone, npc.gone);
  }
});
function engineFunction(name, source = engine) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, name);
  const end = source.indexOf("\n}", start);
  assert.ok(end > start, name);
  return source.slice(start, end + 2);
}

test('restaurer les stocks ne sauvegarde pas la position provisoire du demarrage', () => {
  const user = { credits: 12345, ammoActive: 'x4', ammo: { active: 'x4', x4: 20 }, rockets: { r310: 7 },
    hangars: [{ id: 'h', lastMap: '1-5', lastPos: { x: 6100, y: 4100 } }] };
  let writes = 0, dirty = 0;
  const ctx = vm.createContext({ player: { x: 5500, y: 3500, ammo: { active: 'x1' } }, account: { user },
    AMMO: { x1: {}, x4: {} }, ROCKET_IDS: ['r310', 'eco10'], ROCKET_TYPES: { r310: {}, eco10: {} },
    markProgressDirty: () => dirty++, updateAmmoUI() {},
    updateCurrentUserProgress() { writes++; user.hangars[0].lastPos = { x: ctx.player.x, y: ctx.player.y }; return { ok: true, user }; },
  });
  vm.runInContext(['ammoCount', 'setAmmo', 'restorePlayerStockFromUser'].map(name => engineFunction(name)).join('\n'), ctx);
  ctx.restorePlayerStockFromUser(user);
  assert.equal(ctx.player.ammo.active, 'x4'); assert.equal(ctx.player.ammo.x4, 20);
  assert.equal(ctx.player.credits, 12345); assert.equal(ctx.player.rockets.r310, 7);
  assert.equal(writes, 0); assert.equal(dirty, 0);
  assert.deepEqual(user.hangars[0].lastPos, { x: 6100, y: 4100 });
  user.ammo.x4 = 0;
  ctx.restorePlayerStockFromUser(user);
  assert.equal(ctx.player.ammo.active, 'x1', 'un stock vide conserve le repli sur X1');
  assert.equal(writes, 0); assert.equal(dirty, 0);
});

test('le choix manuel de munition reste sauvegarde immediatement', () => {
  const patches = []; let dirty = 0;
  const ctx = vm.createContext({ player: { ammo: { active: 'x1', x4: 20 } }, account: { user: {} }, AMMO: { x1: {}, x4: {} },
    markProgressDirty: () => dirty++, updateAmmoUI() {}, updateCurrentUserProgress: patch => { patches.push(patch.ammoActive); },
  });
  vm.runInContext(['ammoCount', 'setAmmo'].map(name => engineFunction(name)).join('\n'), ctx);
  ctx.setAmmo('x4'); ctx.setAmmo('x1');
  assert.equal(ctx.player.ammo.active, 'x1'); assert.deepEqual(patches, ['x4', 'x1']); assert.equal(dirty, 2);
});

test("Skylab : la déconnexion stabilise le stock et une coupure rattrape toute la production différée", () => {
  const source = readFileSync(new URL("../UI/UI_SKYLAB.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  const user = { skylab: createDefaultSkylabState(1000) };
  user.skylab.modules.prometium_collector.level = 2;
  const expected = normalizeSkylabState(structuredClone(user.skylab));
  const before = structuredClone(user.skylab);
  let closing = true;
  const context = vm.createContext({ ctx: { getUser: () => user }, isLogoutPending: () => closing,
    deferredProductionSeconds: 0, Date: { now: () => 20000 }, normalizeSkylabState, tickSkylabState,
    lastDirtyMark: 20000, lastDynamicRefresh: 20000 });
  vm.runInContext(engineFunction("tickSkylabProduction", source), context);
  context.tickSkylabProduction(0.5); context.tickSkylabProduction(0.5);
  assert.deepEqual(user.skylab, before, "aucun gain n'arrive derrière la sauvegarde finale");
  closing = false; context.tickSkylabProduction(1);
  tickSkylabState(expected, 20000, 2);
  assert.deepEqual(user.skylab.stock, expected.stock);
  assert.ok(user.skylab.stock.prometium > before.stock.prometium);
  assert.equal(user.skylab.lastTickAt, 20000);
  context.tickSkylabProduction(1); tickSkylabState(expected, 20000, 1);
  assert.deepEqual(user.skylab.stock, expected.stock, "la période différée n'est pas comptée deux fois");
});

test("stockage des cargos : aucune serialisation dans la frame, etat recent et flush a la fermeture", () => {
  const callbacks = [], writes = [];
  let time = 10000;
  let state = { drops: 1 };
  const persist = createDeferredPersistence(() => writes.push(structuredClone(state)), {
    now: () => time, schedule: fn => callbacks.push(fn),
  });
  persist(); state.drops = 2; persist();
  assert.equal(writes.length, 0); assert.equal(callbacks.length, 1);
  callbacks.shift()(); assert.deepEqual(writes, [{ drops: 2 }]);
  time += 1000; persist(); assert.equal(callbacks.length, 0);
  time += 5000; state.drops = 3; persist();
  state.drops = 4; persist({ force: true });
  assert.deepEqual(writes, [{ drops: 2 }, { drops: 4 }]);
  callbacks.shift()(); assert.equal(writes.length, 2);
});

test("recompense NPC partage : compte canonique sans normalisation, gains conserves", () => {
  const user = { id: "pilot", credits: 100, revision: 1, stats: { exp: 10, honor: 2, lifetimeKills: 0, npcKills: {} } };
  const old = { ...user, credits: 50, stats: { ...user.stats } };
  const context = vm.createContext({ account: { user: old }, netList: () => [user],
    noteNetServerReward: () => true,
    getCurrentUserFull: () => { throw new Error("Normalisation pendant la mort"); },
    player: { credits: 100, kills: 0 }, NPC_TYPES: { npc_test: { name: "Test" } },
    getActiveDroneFormation: () => ({}), calculateRankPoints: () => 42, formatInteger,
    addGameLog: () => {}, showNotificationGroup: () => {}, markProgressDirty: () => {}, window: {},
  });
  vm.runInContext(engineFunction("preserveLivePetVitals") + "\n" + engineFunction("killRewards"), context);
  context.killRewards({ type: "npc_test", _netUid: "npc1", _netLootOwner: true,
    _netReward: { credits: 20, exp: 30, honor: 5, baseExp: 30, baseHonor: 5,
      totalExp: 40, totalHonor: 7, revision: 2, percent: 100, ownsKill: true } });
  assert.equal(context.account.user, user);
  assert.equal(context.player.credits, 120);
  assert.equal(user.credits, 120);
  assert.equal(user.stats.exp, 40);
  assert.equal(user.stats.honor, 7);
  assert.equal(user.stats.npcKills.npc_test, 1);
  assert.equal(user.revision, 2);
});

test("une mutation du compte actualise le solde du moteur avant sa prochaine sauvegarde", () => {
  const start = engine.indexOf('window.addEventListener("orbit:user-updated", event => {');
  const from = engine.indexOf("{", start) + 1, to = engine.indexOf("  const previous = account.user;", from);
  assert.ok(start >= 0 && to > from);
  const ctx = vm.createContext({ started: true, player: { credits: 100 }, fresh: { credits: 20 }, event: { detail: { source: "account" } },
    getCurrentUserFull: () => ctx.fresh, syncPlayerStocksFromAccount() {} });
  const sync = () => vm.runInContext(`(() => { ${engine.slice(from, to)} })()`, ctx);
  sync(); assert.equal(ctx.player.credits, 20, "un achat baisse le solde live");
  ctx.fresh.credits = 500; sync(); assert.equal(ctx.player.credits, 500, "une vente augmente le solde live");
  ctx.event.detail.source = "progress"; ctx.fresh.credits = 1; sync(); assert.equal(ctx.player.credits, 500, "une ancienne sauvegarde de progression ne remplace pas le live");
});

test("une amélioration consommée avant épuisement fait partie de la prochaine sauvegarde réseau", () => {
  let dirty = false;
  const ctx = vm.createContext({ account: { user: { upgrades: { laser: { ore: "seprom", stock: 100 } } } },
    noteNetUpgradeConsumed: () => {}, markProgressDirty: () => { dirty = true; }, refreshUpgradeSlotDom: () => {},
  });
  vm.runInContext(engineFunction("consumeUpgradeStock"), ctx);
  assert.equal(ctx.consumeUpgradeStock("laser", 3), true);
  assert.equal(ctx.account.user.upgrades.laser.stock, 97); assert.equal(dirty, true);
});

test("l'achat de disques depuis la fenêtre conserve les crédits gagnés avant l'autosave", () => {
  const pilotUi = readFileSync(new URL("../UI/UI_PILOT_SKILLS.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  const accountSource = readFileSync(new URL("../SRC/CORE/ACCOUNT.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  const user = { id: "pilot", credits: 2_000_000, pilotSkills: { disks: 0 } };
  const writes = [];
  class Element { closest(selector) { return selector === "#pilotBuyDisks" ? this : null; } }
  const context = vm.createContext({ Element, LOGDISK_PACK, LOGDISK_PRICE,
    netActive: () => false,
    started: true, account: { user, dirty: true }, player: { credits: 5_000_000 },
    getCurrentUserFull: () => user, ensurePilotSkills: u => { u.pilotSkills = normalizePilotSkills(u.pilotSkills); },
    prepareCurrentUserMutation() {}, noteNetPurchase() {}, saveUser: u => writes.push(structuredClone(u)), refreshPilotSummary() {},
    saveProgressNow: () => { user.credits = context.player.credits; context.account.dirty = false; },
  });
  vm.runInContext(engineFunction("flushPilotProgressBeforeAction") + "\n"
    + engineFunction("buyLogDiskPack", accountSource) + "\n" + engineFunction("onPilotClick", pilotUi), context);
  context.ctx = { beforeAction: context.flushPilotProgressBeforeAction,
    afterAction: () => { context.player.credits = user.credits; }, toast() {} };
  context.onPilotClick({ target: new Element() });
  assert.equal(user.credits, 2_000_000); assert.equal(context.player.credits, 2_000_000);
  assert.equal(user.pilotSkills.disks, 10); assert.equal(writes.length, 1);
  assert.equal(writes[0].credits, 2_000_000); assert.equal(writes[0].pilotSkills.disks, 10);
  context.onPilotClick({ target: new Element() });
  assert.equal(user.credits, 2_000_000); assert.equal(user.pilotSkills.disks, 10); assert.equal(writes.length, 1);
});

test("acheter des disques actualise le moteur sans recalculer les équipements ni normaliser le compte", () => {
  const start = engine.indexOf('window.addEventListener("orbit:user-updated", event => {');
  const from = engine.indexOf("{", start) + 1, to = engine.indexOf("  const previous = account.user;", from);
  const fresh = { id: "a", credits: 7_000_000, pilotSkills: { disks: 10 } };
  const ctx = vm.createContext({ started: true, player: { credits: 10_000_000 }, account: { user: { id: "a" } },
    event: { detail: { source: "pilot-disks" } }, netList: () => [fresh],
    getCurrentUserFull: () => { throw new Error("Normalisation inutile après achat de disques"); } });
  vm.runInContext(engineFunction("preserveLivePetVitals") + `\n(() => { ${engine.slice(from, to)} })()`, ctx);
  assert.equal(ctx.player.credits, 7_000_000); assert.equal(ctx.account.user, fresh);
});

function targetHarness(enemies) {
  const start = engine.indexOf("const Target = (() => {");
  const end = engine.indexOf("\n})();", start) + "\n})();".length;
  assert.ok(start >= 0 && end > start);
  let stops = 0;
  const context = vm.createContext({ enemies, attackActive: false, fireCooldown: .5,
    stopAttack: () => { stops++; context.attackActive = false; },
    petLockValid: () => true, getEnemyById: id => enemies.find(e => e.id === id),
    player: { shPen: 0 }, NPC_TYPES: {}, rules: {}, damageEnemyLayers,
    blMapDamageMult: () => 1, diminishWeakened: () => false, holoEnemyWeakened: () => false,
    triggerBossEncounterPhase: () => {}, sendNetHit: () => {},
  });
  const damage = engineFunction('refreshCubikonFromMinionHit') + '\n' + engine.slice(engine.indexOf("function damageEnemy("), engine.indexOf("function applyRocketHit("));
  const deaths = engine.slice(engine.indexOf("function processDeathsMeasured("), engine.indexOf("function scheduleGalaxyGateCompletion("));
  vm.runInContext(engine.slice(start, end) + "\nglobalThis.target = Target;\n" + damage + "\n" + deaths, context);
  return { context, target: context.target, stops: () => stops };
}

test("lock NPC : impact predit lethal avant processDeaths, correction serveur sans delock", () => {
  const npc = { id: 1, type: "npc_Streuner", _netUid: "npc1", _netSeq: 3, hp: 100, sh: 0 };
  const h = targetHarness([npc]);
  h.target.set(npc); h.context.attackActive = true;
  h.context.damageEnemy(npc, 1000);
  assert.equal(npc.hp, 0);
  // Plusieurs effets relisent la cible dans la meme frame, avant la mort.
  assert.equal(h.target.get(), npc);
  assert.equal(h.target.get(), npc);
  h.context.processDeathsMeasured();
  assert.equal(npc.hp, 1);
  assert.equal(npc._netWaiting, true);
  npc.hp = 70; // Le snapshot confirme que la cible est encore vivante.
  assert.equal(h.target.get(), npc);
  assert.equal(h.context.attackActive, true);
  assert.equal(h.context.fireCooldown, .5);
  assert.equal(h.stops(), 0);
});

test("lock : morts confirmees serveur et solo liberent la cible", () => {
  for (const verdict of [true, false]) {
    const npc = { id: 1, _netUid: "npc1", hp: 100 };
    const h = targetHarness([npc]); h.target.set(npc);
    npc.hp = 0; npc._netKiller = verdict;
    assert.equal(h.target.get(), null);
  }
  const npc = { id: 1, hp: 100 };
  const h = targetHarness([npc]); h.target.set(npc); npc.hp = 0;
  assert.equal(h.target.get(), null);
});

test("lock : remplacement conserve l'incarnation, sans suivre le respawn ni un retrait", () => {
  const npc = { id: 1, _netUid: "npc1", universeUid: "npc1", _netSeq: 3, hp: 100 };
  const enemies = [npc];
  const h = targetHarness(enemies); h.target.set(npc); h.context.attackActive = true;
  const twin = { ...npc, id: 2 };
  enemies.splice(0, 1, twin);
  assert.equal(h.target.get(), twin);
  assert.equal(h.stops(), 0);
  enemies.splice(0, 1, { ...twin, _netSeq: 4 });
  assert.equal(h.target.get(), null);
  enemies.splice(0, 1, npc); h.target.set(npc);
  enemies.length = 0;
  assert.equal(h.target.get(), null);
});

test("affichage des gains : format francais preserve", () => {
  for (const value of [0, 12, 1234, 123456789, -1234, 42.9, undefined, Infinity]) {
    const expected = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 })
      .format(Math.floor(Number(value) || 0)).replace(/[\u00a0\u202f]/g, " ");
    assert.equal(formatInteger(value), expected);
  }
});

test("raffinage auto : chaine complete, une sauvegarde, debits reseau conserves", () => {
  const source = readFileSync(new URL("../SRC/CORE/ACCOUNT.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  const user = { inventory: { resources: { prometium: 10000, endurium: 10000, terbium: 10000, xenomit: 1000 } } };
  const expected = structuredClone(user);
  let expectedGain = 0;
  const expectedDebits = {};
  for (let pass = 0; pass < 10; pass++) {
    let progress = 0;
    for (const recipe of REFINERY_RECIPES) {
      const { quantity, gained } = refineOreOutput(expected.inventory.resources, recipe, Infinity);
      if (!quantity) continue;
      for (const [id, perUnit] of Object.entries(recipe.inputs)) {
        const debit = perUnit * quantity;
        expected.inventory.resources[id] -= debit;
        expectedDebits[id] = (expectedDebits[id] || 0) + debit;
      }
      expected.inventory.resources[recipe.output.id] = (expected.inventory.resources[recipe.output.id] || 0) + gained;
      progress += gained;
    }
    expectedGain += progress;
    if (!progress) break;
  }
  let saves = 0, reads = 0;
  const debits = {};
  const context = vm.createContext({ account: { user }, ui: { refineryAutoUpgrades: { checked: false } }, REFINERY_RECIPES, getRefineryRecipe, refineOreOutput,
    netActive: () => true, noteNetConsumption: (field, id, count) => { assert.equal(field, "ores"); debits[id] = (debits[id] || 0) + count; },
    getCurrentUserFull: () => { reads++; return user; }, ensureUserShape: u => u,
    saveUser: (u, options) => { assert.equal(u, user); assert.equal(options.source, "progress"); saves++; },
  });
  vm.runInContext(engineFunction("refineCurrentUserOre", source) + "\n" + engineFunction("refineryChargeEquipment") + "\n" + engineFunction("refineryRefineAll"), context);
  assert.equal(context.refineryRefineAll(), expectedGain);
  assert.deepEqual(user, expected);
  assert.deepEqual(debits, expectedDebits);
  assert.equal(reads, 0);
  assert.equal(saves, 1);
  assert.equal(context.refineryRefineAll(), 0);
  assert.equal(saves, 1);
});

test("notifications : toutes les insertions avant lecture des hauteurs, tous les styles apres", () => {
  const events = [];
  const context = vm.createContext({ notificationGroupFrame: 1, pendingNotificationGroup: [{}, {}, {}],
    ui: { orbitNotifications: { children: [] } }, MAX_VISIBLE_NOTIFICATIONS: 8,
    mountNotification: (spec, deferHeight) => {
      assert.equal(deferHeight, true); events.push("insert");
      return { get scrollHeight() { events.push("read"); return 24; }, style: { setProperty: () => events.push("write") } };
    }, resetVisibleNotificationFlow: () => {},
  });
  vm.runInContext(engineFunction("flushLatestNotificationGroup"), context);
  context.flushLatestNotificationGroup();
  assert.deepEqual(events, ["insert", "insert", "insert", "read", "read", "read", "write", "write", "write"]);
});

test("cache compte : ecritures regroupees, derniere revision et deconnexion respectees", () => {
  const source = readFileSync(new URL("../SRC/CORE/ACCOUNT_NET.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  const timers = [], idle = [], writes = [];
  const context = vm.createContext({ memUser: { id: "pilot" }, CACHE_KEY: "cache", serverBase: null, retrySave: null, serverRewards: new Map(),
    setTimeout: fn => timers.push(fn), requestIdleCallback: fn => idle.push(fn),
    netActive: () => !!context.memUser, lsSet: (key, value) => writes.push(JSON.parse(value).user),
  });
  vm.runInContext("let pendingCacheUser = null; let cacheWriteScheduled = false;\n"
    + engineFunction("flushAccountCache", source) + "\n" + engineFunction("writeCache", source), context);
  context.writeCache({ id: "pilot", revision: 1 });
  context.writeCache({ id: "pilot", revision: 2 });
  assert.equal(writes.length, 0); assert.equal(timers.length, 1);
  timers.shift()(); assert.equal(writes.length, 0);
  idle.shift()(); assert.equal(writes[0].revision, 2);
  context.writeCache({ id: "pilot", revision: 3 });
  context.memUser = null;
  timers.shift()(); idle.shift()();
  assert.equal(writes.length, 1);
});
function canvas() {
  const calls = [];
  const ctx = { calls };
  for (const method of ["save", "restore", "translate", "scale", "strokeText", "fillText"]) {
    ctx[method] = (...args) => calls.push({ method, args, blur: ctx.shadowBlur, alpha: ctx.globalAlpha });
  }
  return ctx;
}

function outlineCanvasFactory() {
  const canvases = [];
  function createCanvas() {
    const context = canvas();
    context.drawImage = (...args) => context.calls.push({ method: 'drawImage', args, blur: context.shadowBlur });
    context.fillRect = () => {};
    context.createLinearGradient = () => ({ addColorStop() {} });
    const element = { width: 0, height: 0, context, getContext: () => context };
    canvases.push(element);
    return element;
  }
  return { canvases, createCanvas };
}

test('les 32 frames du Mindfire gardent leur contour en cache pendant les pulsations', () => {
  const factory = outlineCanvasFactory(), cache = createSpriteOutlineCache(factory), main = factory.createCanvas().context;
  const images = Array.from({ length: 32 }, () => ({}));
  for (const image of images) cache.draw(main, image, 800, 640, '#ff2e4d', 1, 16);
  const creations = factory.canvases.length;
  for (const alpha of [0.3, 0.6, 0.95]) for (const image of images) {
    cache.draw(main, image, 800, 640, '#ff2e4d', alpha, 16);
  }
  assert.equal(factory.canvases.length, creations, 'aucun recalcul du halo apres le premier cycle');
  const drawings = main.calls.filter(call => call.method === 'drawImage');
  assert.equal(drawings.length, 128, 'un seul dessin par contour et par frame');
  assert.ok(drawings.every(call => call.blur === 0));
  assert.ok(drawings.every(call => Math.max(call.args[0].width, call.args[0].height) <= 512));
  assert.equal(cache.stats().entries, 32); assert.ok(cache.stats().pixels <= 8 * 1024 * 1024);
});

test('les contours distinguent sprites, couleur, taille et masque, et liberent les anciens bitmaps', () => {
  const factory = outlineCanvasFactory(), cache = createSpriteOutlineCache({ ...factory, maxEntries: 3 });
  const main = factory.createCanvas().context, image = {};
  cache.draw(main, image, 100, 80, 'red', 0.5);
  cache.draw(main, image, 100, 80, 'blue', 0.5);
  cache.draw(main, image, 100, 80, 'red', 0.9); // refresh the red entry
  cache.draw(main, image, 200, 160, 'red', 0.5);
  const creations = factory.canvases.length;
  cache.draw(main, image, 100, 80, 'red', 0.5);
  assert.equal(factory.canvases.length, creations);
  cache.draw(main, image, 100, 80, 'red', 0.5, 12, true);
  const drawings = main.calls.filter(call => call.method === 'drawImage');
  assert.equal(drawings[1].args[0].width, 0, 'le bitmap le moins utilise est libere');
  assert.notEqual(drawings[0].args[0], drawings.at(-1).args[0], 'le masque bas a sa propre entree');
  cache.draw(main, {}, 100, 80, 'red', 0.5);
  assert.equal(cache.stats().entries, 3);
  cache.clear(); assert.deepEqual(cache.stats(), { entries: 0, pixels: 0 });
  assert.ok(drawings.every(call => call.args[0].width === 0));
  const tiny = createSpriteOutlineCache({ ...factory, maxPixels: 10000 });
  tiny.draw(main, image, 800, 640, 'red', 1);
  assert.ok(tiny.stats().pixels <= 10000);
});

test('la mini-carte reste reactive aux changements de carte et de taille sans recalcul a chaque frame', () => {
  let now = 0; const draws = [];
  const context = vm.createContext({ performance: { now: () => now }, window: { devicePixelRatio: 1 },
    mini: { width: 300, height: 205, clientWidth: 300, clientHeight: 205 }, mctx: { setTransform() {} },
    account: { user: {} }, player: { x: 21000, y: 6220 }, WORLD: { w: 30000, h: 18000 },
    enemies: Array.from({ length: 101 }, (_, id) => ({ id, hp: 100 })),
    minimapAllies: () => [], getInteractivePortals: () => [], gateReturnPortal: null,
    isZoneMap: true, zoneSafe: null, zoneWalls: [], rules: {}, moveTarget: {}, miniPing: {}, camera: {},
    innerWidth: 1600, innerHeight: 900, Target: { get: () => null },
    renderMinimap: (_, options) => draws.push(options),
  });
  vm.runInContext('let minimapLastDraw = -Infinity, minimapLastWorld = null, minimapLastSize = "";\n' +
    engineFunction('drawMinimap'), context);
  for (let i = 0; i <= 240; i++) { now = i * 1000 / 240; context.drawMinimap(); }
  assert.ok(draws.length >= 25 && draws.length <= 31);
  assert.equal(draws.at(-1).enemies, context.enemies);
  let count = draws.length;
  context.WORLD = { w: 11000, h: 7000 }; context.drawMinimap(); assert.equal(draws.length, ++count);
  context.mini.width += 20; context.drawMinimap(); assert.equal(draws.length, ++count);
  context.window.devicePixelRatio = 2; context.drawMinimap(); assert.equal(draws.length, ++count);
});

test("guidage : les corrections reseau ne multiplient pas la vitesse des roquettes", () => {
  assert.equal(guidedChaseSpeed(1500, 0, 0), 1500);
  assert.equal(guidedChaseSpeed(1500, 300, 400), 2000);
  assert.equal(guidedChaseSpeed(1500, 2000, 2000), 2250);
  assert.equal(guidedChaseSpeed(1500, undefined, undefined), 1500);
});

test("progression : les tirs repetes ne repoussent pas la sauvegarde", () => {
  const account = { dirty: false, saveCd: 0 };
  const context = vm.createContext({ account });
  vm.runInContext(engineFunction("markProgressDirty"), context);
  context.markProgressDirty();
  assert.equal(account.saveCd, 15);
  account.saveCd = 1;
  context.markProgressDirty();
  assert.equal(account.saveCd, 1);
  account.dirty = false;
  context.markProgressDirty();
  assert.equal(account.saveCd, 15);
});

test("tir sans amelioration : aucune relecture du compte live", () => {
  let reads = 0;
  const account = { user: { upgrades: {} } };
  const context = vm.createContext({ account, getCurrentUserFull: () => { reads++; return account.user; } });
  vm.runInContext(engineFunction("consumeUpgradeStock"), context);
  for (let i = 0; i < 100; i++) {
    assert.equal(context.consumeUpgradeStock("laser"), false);
    assert.equal(context.consumeUpgradeStock("rocket"), false);
  }
  assert.equal(reads, 0);
  account.user = null;
  assert.equal(context.consumeUpgradeStock("laser"), false);
  assert.equal(reads, 1);
});
const float = { x: 100, y: 120, t: .2, life: 1, text: "12,345", color: "red", size: 21, pop: .3, shake: .6, glow: 1, weight: 900 };
const view = { ox: 10, oy: -5, width: 800, height: 600 };
test("mode léger : mêmes chiffres et positions, sans flou ni zoom", () => {
  const ctx = canvas(), item = { ...float };
  drawCombatFloatTexts(ctx, [item], { ...view, simple: true });
  assert.deepEqual(ctx.calls.find(c => c.method === "translate").args, [110, 115]);
  assert.equal(ctx.calls.filter(c => c.method === "scale").length, 0);
  const drawn = ctx.calls.find(c => c.method === "fillText");
  assert.equal(drawn.args[0], "12,345");
  assert.equal(drawn.blur, 0);
  assert.equal(drawn.alpha, .8);
  assert.deepEqual(item, float);
});
test("qualité haute : effets existants préservés et chiffres hors écran ignorés", () => {
  const ctx = canvas();
  drawCombatFloatTexts(ctx, [float, { ...float, x: -500 }, { ...float, x: 300 }], {
    ...view, isBeyondSensorRadius: x => x === 300,
  });
  assert.equal(ctx.calls.filter(c => c.method === "fillText").length, 1);
  assert.equal(ctx.calls.filter(c => c.method === "scale").length, 1);
  assert.equal(ctx.calls.find(c => c.method === "fillText").blur, 20.8);
});
test("déplacement et expiration des chiffres inchangés à différents FPS", () => {
  for (const dt of [0, 1 / 120, 1 / 60, 1 / 30, .25]) {
    const actual = Array.from({ length: 140 }, (_, i) => ({ ...float, x: i, vx: 120, vy: -150, t: i / 140 }));
    const expected = structuredClone(actual);
    for (let i = expected.length - 1; i >= 0; i--) {
      const item = expected[i];
      item.t += dt; item.x += item.vx * dt; item.y += item.vy * dt;
      item.vx *= Math.pow(.9, dt * 60); item.vy *= Math.pow(.92, dt * 60);
      if (item.t >= item.life) expected.splice(i, 1);
    }
    tickFloatingTexts(actual, dt);
    assert.deepEqual(actual, expected);
  }
});

function questHarness() {
  const quest = QUEST_DEFINITIONS.find(q => getQuestObjectives(q).length === 1
    && getQuestObjectives(q)[0].kind === "kill" && getQuestObjectives(q)[0].amount > 10);
  assert.ok(quest);
  const objective = getQuestObjectives(quest)[0];
  const state = normalizeQuestState({ active: { [quest.id]: { [objective.id]: 0 } } });
  const windowNode = () => ({ style: { display: "none" }, classes: new Set(), classList: { contains(name) { return this.owner.classes.has(name); } } });
  const ui = { questWindow: windowNode(), questOfferWindow: windowNode() };
  for (const node of Object.values(ui)) node.classList.owner = node;
  const counts = { journal: 0, terminal: 0, claims: 0, dirty: 0 };
  const observers = [];
  let context;
  context = vm.createContext({ ui, questState: state, QUEST_DEFINITIONS, recordQuestProgress, isQuestComplete,
    window: { __CURRENT_MAP_ID__: objective.map || "1-1" },
    markProgressDirty: () => counts.dirty++, showToast: () => {},
    claimQuestReward: id => { const result = claimQuest(state, id); assert.ok(result); counts.claims++; },
    renderQuestWindow: () => { counts.journal++; vm.runInContext("questJournalRenderPending = false", context); },
    renderQuestTerminal: () => { counts.terminal++; vm.runInContext("questTerminalRenderPending = false", context); },
    MutationObserver: class { constructor(callback) { this.callback = callback; } observe(node) { observers.push({ node, callback: this.callback }); } },
  });
  const observerStart = engine.indexOf("for (const node of [ui.questWindow, ui.questOfferWindow])");
  const observerEnd = engine.indexOf("\n}", observerStart) + 2;
  vm.runInContext("let questJournalRenderPending = false; let questTerminalRenderPending = false;\n"
    + engineFunction("refreshPendingQuestViews") + "\n" + engine.slice(observerStart, observerEnd)
    + "\n" + engineFunction("advanceQuestProgress"), context);
  return { context, quest, objective, state, ui, counts, observers,
    kill() { context.advanceQuestProgress("kill", objective.type); },
    open(node) { node.style.display = "block"; observers.find(o => o.node === node).callback(); },
  };
}
test("kills : aucune reconstruction des quêtes fermées, rattrapage à la réouverture", () => {
  const h = questHarness();
  for (let i = 0; i < 10; i++) h.kill();
  assert.equal(h.state.active[h.quest.id][h.objective.id], 10);
  assert.equal(h.counts.journal, 0); assert.equal(h.counts.terminal, 0);
  h.open(h.ui.questWindow);
  assert.equal(h.counts.journal, 1); assert.equal(h.counts.terminal, 0);
  h.open(h.ui.questOfferWindow);
  assert.equal(h.counts.terminal, 1);
  h.kill();
  assert.equal(h.counts.journal, 2); assert.equal(h.counts.terminal, 2);
});
test("quête réduite : progression et récompense automatique conservées", () => {
  const h = questHarness();
  h.ui.questWindow.style.display = "block";
  h.ui.questWindow.classes.add("gameWinMinimized");
  h.state.active[h.quest.id][h.objective.id] = h.objective.amount - 1;
  h.kill();
  assert.equal(h.counts.claims, 1);
  assert.ok(h.state.completed.includes(h.quest.id));
  assert.equal(h.counts.journal, 0);
  h.ui.questWindow.classes.delete("gameWinMinimized");
  h.observers.find(o => o.node === h.ui.questWindow).callback();
  assert.equal(h.counts.journal, 1);
});

function shotHarness({ shared = true, active = true, shots = false, impacts = false, density = 1, target = "player" } = {}) {
  const player = { x: 100, y: 100, hp: 100, ddolT: 0 };
  const combatTarget = target === "player" ? player : { x: 100, y: 100, hp: 100, id: 2, _netVisual: target === "friend" };
  const projectiles = [];
  const context = vm.createContext({ player, GAME_SETTINGS: { npcExplosions: impacts },
    netplayNpcActive: () => active, displayNpcShotsOn: () => shots, fxDensityMult: () => density,
    safeZoneActive: false, playerIsInSafeZone: () => false, npcPortalCalm: () => false,
    isPlayerUntargetable: () => false, rules: {},
    dist2: (x, y, a, b) => (x-a)**2 + (y-b)**2,
    bulletLifeForRange: () => 2.5, vary: n => n, isEntityJammed: () => false,
    addCappedProjectile: (list, bullet) => list.push(bullet), enemyBullets: projectiles,
    NPC_SHOT_RULES: { missChance: 0, homing: true, hitRadiusBonus: 0 }, ENTITY_LIMITS: { enemyBullets: 500 },
  });
  vm.runInContext(engineFunction("enemyShoot"), context);
  context.enemyShoot({ hp: 100, _netUid: shared ? "npc1" : null, x: 0, y: 0, shootRange: 1000, shootRate: 1, bulletDmg: 10 }, .016, combatTarget);
  return projectiles;
}
test("NPC partagé : pas de projectile invisible vers les joueurs si tirs et impacts coupés", () => {
  assert.equal(shotHarness().length, 0);
  assert.equal(shotHarness({ target: "friend" }).length, 0);
});
test("projectiles à dégâts locaux, repli solo et visuels activés conservés", () => {
  for (const options of [{ shared: false }, { active: false }, { target: "escort" }, { shots: true }, { impacts: true }]) {
    const shots = shotHarness(options);
    assert.equal(shots.length, 1, JSON.stringify(options));
    assert.equal(shots[0].dmg, 10);
  }
  assert.equal(shotHarness({ impacts: true, density: 0 }).length, 0);
});


test("stations : missions, commerce et protection reserves a la firme, pirates neutres", async () => {
  for (const [faction, sector] of [["mmo",1],["eic",2],["vru",3]]) {
    for (const ownerSector of [1,2,3]) {
      for (const zone of [1,4,5,8]) {
        const { getZoneSafeModules } = await import('../MAPS/' + ownerSector + '-' + zone + '/SPAWNS.js');
        const station = getZoneSafeModules({ w:11000, h:7000 }).modules.find(m => m.questTerminal || String(m.spr).startsWith('QUEST_'));
        assert.ok(station);
        assert.equal(canUseFactionModule(station, faction), sector === ownerSector);
        const context = vm.createContext({
          zoneSafe: { modules: [station] }, isZoneMap: true,
          canUseStation: m => canUseFactionModule(m, faction),
          isPlayerNearQuestModule: () => true, isPlayerNearTradeModule: () => true,
          traWindowActive: () => false, activeTradeModule: station,
          dist2: (x,y,a,b) => (x-a)**2 + (y-b)**2,
        });
        vm.runInContext(engineFunction('isQuestModule') + '\n' + engineFunction('hasQuestTerminalAccess') + '\n' + engineFunction('getSafeModuleAt') + '\n' + engineFunction('isTradeWindowAnchored'), context);
        assert.equal(vm.runInContext('hasQuestTerminalAccess()', context), sector === ownerSector);
        assert.equal(vm.runInContext('isTradeWindowAnchored()', context), sector === ownerSector);
        if (station.safeRadius) assert.equal(vm.runInContext('getSafeModuleAt(zoneSafe.modules[0].x, zoneSafe.modules[0].y) !== null', context), sector === ownerSector);
      }
    }
    assert.equal(canUseFactionModule({id:'CENTRE_PIRATES'}, faction), true);
  }
});


test('BL : retour x8 et exclusion des bonus, contrats gates distincts', async () => {
  const { getFactionRespawnMap } = await import('../SRC/CORE/FACTIONS.js');
  const { COLLECTABLE_TYPES: COLLECTABLE_DEFS } = await import('../SRC/DATA/COLLECTABLES.js');
  for (const [faction,sector] of [['mmo',1],['eic',2],['vru',3]]) {
    for (const origin of ['1-BL','2-bl','3-BL']) assert.equal(getFactionRespawnMap(faction,origin), sector+'-8');
    assert.equal(getFactionRespawnMap(faction, sector+'-1'),sector+'-1');
    assert.equal(getFactionRespawnMap(faction,'alpha',{gate:true}),sector+'-1');
  }
  const context = vm.createContext({currentMapId:()=> '1-BL'});
  vm.runInContext(engineFunction('collectableAllowedOnCurrentMap'),context);
  context.cfg = COLLECTABLE_DEFS.Bonus_Box;
  for(const map of ['1-BL','2-BL','3-BL']) { context.map = map; assert.equal(vm.runInContext('collectableAllowedOnCurrentMap(cfg,map)',context),false); }
  context.map='1-6'; assert.equal(vm.runInContext('collectableAllowedOnCurrentMap(cfg,map)',context),true);
  for(const [id,type] of [['salvage_gate_07','alpha'],['salvage_gate_08','beta'],['salvage_gate_09','gamma']]) {
    const q=QUEST_DEFINITIONS.find(q=>q.id===id);
    assert.equal(getQuestObjectives(q)[0].amount,2);
    assert.equal(getQuestObjectives(q)[0].type,type);
  }
});

test('murs : dessin limite au viewport, texture conservee et murs hors ecran ignores', async () => {
  const {drawWallLayer}=await import('../SRC/CORE/WORLD_LAYER_RENDERER.js');
  const draws=[];
  const context={createPattern:()=>({}),save(){},restore(){},fillRect:(...args)=>draws.push(args)};
  drawWallLayer(context,[{x:50,y:50,w:100,h:10000},{x:2000,y:50,w:50,h:50}],{src:'wall'}, {
    offsetX:0,offsetY:0,viewportWidth:800,viewportHeight:600,getImage:()=>({width:64,height:64}),isImageReady:()=>true,
  });
  assert.deepEqual(draws,[[0,0,100,600]]);
});


test('joueur distant immobile : orientation recente suivie sans deplacer la position', () => {
  const source=readFileSync(new URL('../SRC/CORE/NETPLAY.js',import.meta.url),'utf8').replace(/\r\n/g,'\n');
  const r={x:100,y:200,rx:100,ry:200,vx:0,vy:0,vmax:400,angle:Math.PI/2,rangle:0,sampleAt:500,motionSamples:[{at:500,x:100,y:200,vx:0,vy:0,angle:0}],petx:100,pety:200};
  const ctx=vm.createContext({remotes:new Map([['other',r]]),netNpcs:new Map(),performance:{now:()=>1000},netPerf:{maxCorrection:0},NET_LOW_FPS_DELAY_MAX_MS:240,NET_MAX_TURN_RATE:5,NET_MAX_ESTIMATED_SPEED:1500,predictionLeadSeconds:()=>0});
  vm.runInContext(engineFunction('tickNetplayRemotes',source),ctx);
  for(let i=0;i<60;i++) vm.runInContext('tickNetplayRemotes(1/60)',ctx);
  assert.ok(Math.abs(r.rangle-Math.PI/2)<0.001);
  assert.equal(r.rx,100); assert.equal(r.ry,200);
  r.angle=-Math.PI/2;
  for(let i=0;i<60;i++) vm.runInContext('tickNetplayRemotes(1/60)',ctx);
  assert.ok(Math.abs(Math.atan2(Math.sin(r.rangle-r.angle),Math.cos(r.rangle-r.angle)))<0.001);
});


test('REX : respawn meme carte rappelle pres du joueur et efface le trajet', () => {
  const pet={owned:true,active:true,hp:100,x:9000,y:9000,map:'1-6'};
  const context=vm.createContext({account:{user:{pet}},petState:{x:9000,y:9000,ready:true,target:{},fetchId:123,hasWp:true,vx:400,vy:400},petLocator:{enemyId:1,manualType:'npc'},player:{x:1000,y:1500,angle:0},WORLD:{w:11000,h:7000},petBootRestoreArmed:true,currentMapId:()=> '1-6',cancelKamikazeRun:()=>{},clamp:(v,a,b)=>Math.max(a,Math.min(b,v))});
  vm.runInContext(engineFunction('resetPetSpawn')+'\n'+engineFunction('restorePetSavedPosition')+'\n'+engineFunction('resetPetAfterRespawn'),context);
  vm.runInContext('resetPetAfterRespawn()',context);
  assert.equal(context.petState.x,910); assert.equal(context.petState.y,1570);
  assert.equal(context.petState.target,null); assert.equal(context.petState.fetchId,null);
  assert.equal(context.petState.hasWp,false); assert.equal(context.petState.vx,0);
  assert.equal(context.petBootRestoreArmed,false);
  assert.equal(pet.x,910); assert.equal(pet.hp,100); assert.equal(pet.active,true);
  pet.hp=0;
  vm.runInContext('resetPetAfterRespawn()',context);
  assert.equal(pet.hp,0); assert.equal(context.petState.ready,false);
});


test('GG : portail gauche gate et portail droit base de la firme, assets existants', async () => {
  const {getPortalSkinForMap}=await import('../SRC/CORE/PORTAL_SKINS.js');
  const {getFactionHomeMap}=await import('../SRC/CORE/FACTIONS.js');
  const {existsSync}=await import('node:fs');
  for(const gate of ['alpha','beta','gamma','delta','epsilon']) for(const faction of ['mmo','eic','vru']) {
    const portal={},gateReturnPortal={};
    const context=vm.createContext({window:{__CURRENT_MAP_ID__:gate},rules:{},portal,gateReturnPortal,account:{user:{faction}},getFactionHomeMap,getPortalSkinForMap,PORTAL_IDLE_SPR:{},PORTAL_OPEN_SPR:{},PORTAL_JUMP_SPR:{},DEFAULT_PORTAL_JUMP_SPR:{},DEFAULT_PORTAL_JUMP_FX:{},DEFAULT_PORTAL_JUMP_BUTTON:{}});
    vm.runInContext(engineFunction('getPortalSpriteSet'),context);
    const left=vm.runInContext('getPortalSpriteSet(portal)',context);
    const right=vm.runInContext('getPortalSpriteSet(gateReturnPortal)',context);
    for(const state of ['idle','open','jump']) {
      assert.equal(left[state].src,getPortalSkinForMap(gate)[state].src);
      assert.equal(right[state].src,getPortalSkinForMap(getFactionHomeMap(faction))[state].src);
      assert.ok(existsSync(left[state].src)); assert.ok(existsSync(right[state].src));
    }
  }
});


test('Cubikon : renfort sous cinq survivants, aucun apres reset ou mort', () => {
  const server=readFileSync(new URL('./NPC_ROOM.js',import.meta.url),'utf8').replace(/\r\n/g,'\n');
  const start=server.indexOf('  refillCubikonMinions('),end=server.indexOf('\n  }',start)+4;
  const ctx=vm.createContext({});
  vm.runInContext('class Refill { '+server.slice(start,end)+' }; globalThis.Refill=Refill;',ctx);
  for(const count of [0,4,5,20]) {
    const cub={type:'npc_Cubikon',uid:'cube',hp:100,cubeArmed:true,lastCubeHitAt:1000};
    const sim=new ctx.Refill(); let spawned=0;
    sim.countCubikonMinions=()=>count;
    sim.spawnCubikonWave=()=>{spawned=20-count;};
    sim.refillCubikonMinions(cub,15000);
    assert.equal(spawned,0);
    assert.equal(cub.cube?.phase, count<5?'delay':undefined);
    if(count<5) { assert.equal(cub.cube.until,17000); assert.equal(cub.cube.spawnAt,19600); }
    const pending=cub.cube; sim.refillCubikonMinions(cub,15001); assert.equal(cub.cube,pending);
    cub.cube=null;
    spawned=0; sim.refillCubikonMinions(cub,17000); assert.equal(spawned,0);
    cub.hp=0; sim.refillCubikonMinions(cub,2000); assert.equal(spawned,0);
    const local=vm.createContext({enemies:Array.from({length:count},()=>({hp:100,type:'npc_Protegit',masterId:1})),CUBIKON_RESET:{idleDelay:15},isEntityJammed:()=>false,spawnProtegitOnCubikonHit:()=>{spawned=20-count;},cub:{id:1,hp:100,_spawnedOnce:true,_sinceHit:1}});
    vm.runInContext(engineFunction('refillLocalCubikonMinions')+'\nrefillLocalCubikonMinions(cub);',local);
    assert.equal(spawned,0);
    assert.equal(local.cub._animPhase,count<5?'delay':undefined);
    if(count<5) { assert.equal(local.cub._pendingSpawn,20); assert.equal(local.cub.spriteIdx,0); assert.equal(local.cub._openDelayT,2); }
    vm.runInContext('refillLocalCubikonMinions(cub)',local); assert.equal(spawned,0);
    local.cub._animPhase=null;
    spawned=0;local.cub._sinceHit=16;
    vm.runInContext('refillLocalCubikonMinions(cub)',local);assert.equal(spawned,0);
  }
});


test('boutique : tirs et XP REX rafraichissent le solde sans reconstruire les controles', async () => {
  const source=readFileSync(new URL('../PUBLIC/PROFILE.js',import.meta.url),'utf8').replace(/\r\n/g,'\n');
  const {getPetLevel}=await import('../PET/PET_TYPES.js');
  const user={credits:1000,inventory:{},drones:{},pet:{owned:true,exp:100,level:0},rockets:{r310:500}};
  let refreshed=0;
  const signature=JSON.stringify(['ammo',undefined,undefined,undefined,undefined,undefined,true,0,undefined,'','']);
  const ctx=vm.createContext({shopCredits:null,shopList:{},shopPreview:{},shopTab:'ammo',lastShopListSignature:signature,getPetLevel,refreshShopBalance:()=>refreshed++,user});
  vm.runInContext(engineFunction('renderShopMeasured',source),ctx);
  for(let i=0;i<10;i++) {user.pet.exp++;user.rockets.r310--;vm.runInContext('renderShopMeasured(user)',ctx);}
  assert.equal(refreshed,10);
});


test('Protegits et renforts : impact relance le delai du maitre vivant uniquement', () => {
  const cub={id:1,type:'npc_Cubikon',hp:100,_sinceHit:14,_resetting:true};
  const minion={id:2,type:'npc_Protegit',masterId:1,hp:100,despawnDur:0.5};
  const ctx=vm.createContext({enemies:[cub,minion],minion,netplayNpcActive:()=>false});
  vm.runInContext(engineFunction('refreshCubikonFromMinionHit')+'\nrefreshCubikonFromMinionHit(minion)',ctx);
  assert.equal(cub._sinceHit,0);assert.equal(cub._resetting,false);assert.equal(minion.despawnDur,0);
  cub._sinceHit=14;cub.hp=0;
  vm.runInContext('refreshCubikonFromMinionHit(minion)',ctx);assert.equal(cub._sinceHit,14);
});


test('fuite NPC : cap conserve sans cible, rebond aux limites sans nouveau tirage', async () => {
  const {npcFleeDirection}=await import('../NPC/NPC_FLEE.js');
  const npc={x:500,y:500},world={w:11000,h:7000};let draws=0;
  const random=()=>{draws++;return 0;};
  assert.deepEqual(npcFleeDirection(npc,world,random),{x:1,y:0});
  npc.target={x:-999,y:50};
  assert.deepEqual(npcFleeDirection(npc,world,random),{x:1,y:0});
  npc.target=null;npc.x=world.w-80;
  assert.deepEqual(npcFleeDirection(npc,world,random),{x:-1,y:0});
  assert.equal(draws,1);
});


test('Protegits : patrouille autonome bornee, vitesse variee et destination conservee entre decisions', async () => {
  const {protegitPatrol}=await import('../NPC/PROTEGIT_MOVEMENT.js');
  const minion={x:500,y:500},master={x:600,y:600},world={w:11000,h:7000};let calls=0;
  const random=()=>{calls++;return 0.5;};
  const first=protegitPatrol(minion,master,world,0.016,random);
  assert.ok(Math.abs(Math.hypot(first.x,first.y)-1)<1e-9);
  assert.ok(first.speed>=0.85 && first.speed<=1);
  const x=minion.patrolX,y=minion.patrolY;
  protegitPatrol(minion,master,world,0.016,random);
  assert.equal(calls,4);assert.equal(minion.patrolX,x);assert.equal(minion.patrolY,y);
  minion.patrolTime=0;master.x=80;master.y=80;
  protegitPatrol(minion,master,world,0.016,random);
  assert.equal(calls,8);assert.ok(minion.patrolX>=80 && minion.patrolY>=80);
});


test('REX : garde sa cible cinq secondes, libere immediatement une cible invalide', () => {
 const a={hp:100}, b={hp:100}, state={target:null};
 const ctx=vm.createContext({state,a,b,valid:t=>t.hp>0});
 vm.runInContext(engineFunction('chooseStablePetTarget'),ctx);
 state.target=vm.runInContext('chooseStablePetTarget(state,a,10,valid)',ctx);
 assert.equal(state.target,a);
 for(const time of [10.5,11,14.99]) {ctx.now=time;assert.equal(vm.runInContext('chooseStablePetTarget(state,b,now,valid)',ctx),a);}
 assert.equal(vm.runInContext('chooseStablePetTarget(state,b,15,valid)',ctx),b);
 state.target=a;state.targetSelectedAt=20;a.hp=0;
 assert.equal(vm.runInContext('chooseStablePetTarget(state,b,21,valid)',ctx),b);
 assert.equal(vm.runInContext('chooseStablePetTarget(state,null,21,valid)',ctx),null);
});


test('Maudite : Chaos Cubikon compte en contrats generaux, objectifs specifiques distincts', () => {
 const state=normalizeQuestState({active:{elite_cube_3500:{cubikon:0},cursed_cube_breakers:{cubikon:0,cursed_cubikon:0}}});
 recordQuestProgress(state,'kill','npc_Cubikon_maudite',1,{map:'maudite'});
 assert.equal(state.active.elite_cube_3500.cubikon,1);
 assert.equal(state.active.cursed_cube_breakers.cubikon,0);
 assert.equal(state.active.cursed_cube_breakers.cursed_cubikon,1);
 recordQuestProgress(state,'kill','npc_Cubikon',1,{map:'MAUDITE'});
 assert.equal(state.active.elite_cube_3500.cubikon,2);
 assert.equal(state.active.cursed_cube_breakers.cubikon,1);
});

test('Maudite : parts groupe sur meme carte totalisent 100, hors carte et instances exclus', () => {
 const source=readFileSync(new URL('./MULTI_SERVER.js',import.meta.url),'utf8').replace(/\r\n/g,'\n');
 const members=[{id:'u_a',map:'MAUDITE',online:true},{id:'u_b',map:'maudite',online:true},{id:'u_c',map:'maudite',online:true},{id:'u_d',map:'1-7',online:true},{id:'u_e',map:'maudite',instance:true},{id:'u_f',map:'maudite',online:false}];
 const ctx=vm.createContext({socialDescribeGroup:()=>({members}),describePeer:()=>{},death:{uid:'cube',seq:1}});
 vm.runInContext(engineFunction('npcRewardShares',source),ctx);
 const shares=vm.runInContext('npcRewardShares("u_a","maudite",death)',ctx);
 assert.deepEqual(Array.from(shares,s=>s.pid),['u_a','u_b','u_c']);
 assert.equal(shares.reduce((n,s)=>n+s.percent,0),100);
 assert.ok(shares.every(s=>s.percent===33||s.percent===34));
});


test('Maudite : Cubikons classiques et Chaos restent immobiles en simulation serveur', async () => {
 const {ZoneNpcSim}=await import('./NPC_ROOM.js');
 const sim=await ZoneNpcSim.create('maudite'); assert.ok(sim);
 for(let i=0;i<10;i++) sim.tick(0.1);
 const cubes=[...sim.entries.values()].filter(e=>e.type==='npc_Cubikon'||e.type==='npc_Cubikon_maudite');
 assert.ok(cubes.some(e=>e.type==='npc_Cubikon')); assert.ok(cubes.some(e=>e.type==='npc_Cubikon_maudite'));
 const positions=cubes.map(e=>[e.x,e.y]);
 for(const cube of cubes) {assert.equal(cube.speed,0);sim.setPlayer('test',cube.x+150,cube.y+150,{dead:false});}
 for(let i=0;i<100;i++) sim.tick(0.1);
 cubes.forEach((cube,i)=>assert.deepEqual([cube.x,cube.y],positions[i]));
});


test('Cubikons maudits : separation ignore les chevauchements meme si vitesse non nulle', async () => {
 const {applyNpcSeparation}=await import('../NPC/NPC_MOVEMENT.js');
 const cube={id:1,type:'npc_Cubikon_maudite',hp:100,x:500,y:500,r:100,speed:300};
 const mobile={id:2,type:'npc_Protegit',hp:100,x:501,y:501,r:30,speed:300};
 for(let i=0;i<60;i++) applyNpcSeparation([cube,mobile],1/60,{w:11000,h:7000},false);
 assert.equal(cube.x,500);assert.equal(cube.y,500);
});


test('REX : sync compte conserve degats et regeneration live, reparation manuelle adoptee', () => {
 const ctx=vm.createContext({});vm.runInContext(engineFunction('preserveLivePetVitals'),ctx);
 for(const [liveHp,oldHp] of [[40,90],[90,40],[0,80]]) {
 ctx.prev={id:'a',pet:{owned:true,active:true,hp:liveHp,sh:12}};
 ctx.next={id:'a',pet:{owned:true,active:true,hp:oldHp,sh:60,exp:123}};
 vm.runInContext('preserveLivePetVitals(prev,next)',ctx);
 assert.equal(ctx.next.pet.hp,liveHp);assert.equal(ctx.next.pet.sh,12);assert.equal(ctx.next.pet.exp,123);
 }
 ctx.next.pet.active=false;ctx.next.pet.hp=10;
 vm.runInContext('preserveLivePetVitals(prev,next)',ctx);assert.equal(ctx.next.pet.hp,10);
});


test('GG : sauvegarde non repoussee par les kills, progression en attente restauree apres restart', () => {
 const source=readFileSync(new URL('../SRC/CORE/ACCOUNT_NET.js',import.meta.url),'utf8').replace(/\r\n/g,'\n');
 const checkpoint={active:'alpha',activeWave:10,waves:{alpha:10},waveKills:{alpha:{wave:10,killed:12}}};
 let timers=0;
 const saved=new Map([['orbit_pending_gg:a',JSON.stringify(checkpoint)]]);
 const ctx=vm.createContext({memUser:{id:'a',galaxyGates:{activeWave:1}},pendingGalaxyGates:null,saveTimer:null,structuredClone,JSON,lsGet:k=>saved.get(k),lsSet:(k,v)=>v==null?saved.delete(k):saved.set(k,v),setTimeout:()=>++timers});
 vm.runInContext(['retainPendingGalaxyGates','restorePendingGalaxyGates','cachePendingGalaxyGates','schedulePush'].map(n=>engineFunction(n,source)).join('\n'),ctx);
 vm.runInContext('restorePendingGalaxyGates(); schedulePush(); schedulePush()',ctx);
 assert.equal(timers,1);assert.equal(ctx.memUser.galaxyGates.activeWave,10);assert.equal(ctx.memUser.galaxyGates.waveKills.alpha.killed,12);
 ctx.memUser={id:'a',galaxyGates:{activeWave:1}};
 vm.runInContext('retainPendingGalaxyGates(memUser)',ctx);assert.equal(ctx.memUser.galaxyGates.activeWave,10);
 ctx.pendingGalaxyGates=null;vm.runInContext('cachePendingGalaxyGates()',ctx);assert.equal(saved.has('orbit_pending_gg:a'),false);
 ctx.memUser={id:'b',galaxyGates:{activeWave:1}};vm.runInContext('restorePendingGalaxyGates()',ctx);assert.equal(ctx.memUser.galaxyGates.activeWave,1);
});

test('camouflage CPU : refresh conserve activation, compte isole et mort efface etat', () => {
 const saved=new Map();
 const ctx=vm.createContext({account:{user:{id:'a'}},player:{cpuCloak:true,dead:false},localStorage:{getItem:k=>saved.get(k),setItem:(k,v)=>saved.set(k,v),removeItem:k=>saved.delete(k)}});
 vm.runInContext(engineFunction('persistCpuCloak')+'\n'+engineFunction('restoreCpuCloak'),ctx);
 vm.runInContext('persistCpuCloak(); player.cpuCloak=false; restoreCpuCloak()',ctx);
 assert.equal(ctx.player.cpuCloak,true);
 ctx.account.user.id='b';vm.runInContext('restoreCpuCloak()',ctx);assert.equal(ctx.player.cpuCloak,false);
 ctx.account.user.id='a';ctx.player.dead=true;vm.runInContext('persistCpuCloak(); player.dead=false; restoreCpuCloak()',ctx);assert.equal(ctx.player.cpuCloak,false);
 ctx.player.cpuCloak=true;vm.runInContext('persistCpuCloak(); player.cpuCloak=false; persistCpuCloak(); restoreCpuCloak()',ctx);assert.equal(ctx.player.cpuCloak,false);
});

