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
import { tickFloatingTexts } from "../SRC/CORE/FRAME_SYSTEMS.js";
import { QUEST_DEFINITIONS, getQuestObjectives, normalizeQuestState, recordQuestProgress, isQuestComplete, claimQuest } from "../QUEST/QUEST_TYPES.js";

// Exerce les fonctions livrées sans démarrer une session ou un serveur réel.
const engine = readFileSync(new URL("../SRC/CORE/ORBIT_ENGINE.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
function engineFunction(name, source = engine) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, name);
  const end = source.indexOf("\n}", start);
  assert.ok(end > start, name);
  return source.slice(start, end + 2);
}

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
    getCurrentUserFull: () => { throw new Error("Normalisation pendant la mort"); },
    player: { credits: 100, kills: 0 }, NPC_TYPES: { npc_test: { name: "Test" } },
    getActiveDroneFormation: () => ({}), calculateRankPoints: () => 42, formatInteger,
    addGameLog: () => {}, showNotificationGroup: () => {}, markProgressDirty: () => {}, window: {},
  });
  vm.runInContext(engineFunction("killRewards"), context);
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
  const damage = engine.slice(engine.indexOf("function damageEnemy("), engine.indexOf("function applyRocketHit("));
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
  const context = vm.createContext({ account: { user }, REFINERY_RECIPES, getRefineryRecipe, refineOreOutput,
    netActive: () => true, noteNetConsumption: (field, id, count) => { assert.equal(field, "ores"); debits[id] = (debits[id] || 0) + count; },
    getCurrentUserFull: () => { reads++; return user; }, ensureUserShape: u => u,
    saveUser: (u, options) => { assert.equal(u, user); assert.equal(options.source, "progress"); saves++; },
  });
  vm.runInContext(engineFunction("refineCurrentUserOre", source) + "\n" + engineFunction("refineryRefineAll"), context);
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
  const context = vm.createContext({ memUser: { id: "pilot" }, CACHE_KEY: "cache",
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
  for(const gate of ['alpha','beta','gamma']) for(const faction of ['mmo','eic','vru']) {
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
