import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { isHalloweenBossVariant, appendHalloweenCamps, halloweenRoleOf } from "../NPC/NPC_HALLOWEEN.js";
import { NPC_TYPES } from "../NPC/NPC_TYPES.js";
import { ZoneNpcSim } from "./NPC_ROOM.js";
import { npcMapCreditMultiplier } from "../NPC/NPC_BALANCE.js";
import { QUEST_DEFINITIONS, getQuestObjectives, normalizeQuestState, recordQuestProgress, isQuestComplete } from "../QUEST/QUEST_TYPES.js";
import { normalizeBattlepassState, recordBattlepassProgress, getBattlepassObjective, mergeBattlepassProgress } from "../QUEST/BATTLEPASS.js";

const server = readFileSync(new URL("./MULTI_SERVER.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const engine = readFileSync(new URL("../SRC/CORE/ORBIT_ENGINE.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
function functionSource(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, name);
  for (let end = source.indexOf("\n}", start); end >= 0; end = source.indexOf("\n}", end + 2)) {
    const candidate = source.slice(start, end + 2);
    try { new vm.Script(candidate); return candidate; } catch {}
  }
  assert.fail(`Fonction incomplète : ${name}`);
}

function rewardServer(size = 1, failOnce = false, sun = false, killerBot = false) {
  let now = 1000000;
  const members = Array.from({ length: size }, (_, i) => ({ id: `u_${i}`, online: true, map: "1-3" }));
  const calls = [], messages = [], saved = new Map();
  const context = vm.createContext({
    Date: { now: () => now }, console: { error: () => {} },
    setTimeout: () => { throw new Error("aucune mise en attente autorisée"); },
    rewardedNpcDeaths: new Map(), serverRunId: "test-run", isHalloweenBossVariant,
    socialDescribeGroup: () => ({ members: members.slice() }), describePeer: () => null,
    rooms: new Map([["1-3", new Map(members.map(member => [member.id, {}]))]]),
    findPeerState: pid => ({ bot: killerBot === true && pid === "u_0" }), audOf: () => ({}), recordAbilityNpcKill: () => {},
    awardNpcKill: (id, type, map, percent, ownsKill, txKey) => {
      calls.push(txKey);
      now += 8; // Un coût par transaction ne doit interrompre aucun kill.
      if (failOnce) { failOnce = false; return null; }
      if (saved.has(txKey)) return { duplicate: true };
      const reward = { type, txKey, percent, ownsKill, credits: percent, exp: percent, honor: percent };
      saved.set(txKey, reward);
      return reward;
    },
    sendToPeer: (pid, message) => messages.push({ pid, ...message }),
  });
  context.announcedNpcSuns = new Map();
  vm.runInContext(functionSource(server, "sunTopIds") + "\n" + functionSource(server, "npcRewardShares")
    + "\n" + functionSource(server, "npcDeathKey") + "\n" + functionSource(server, "awardNpcDeaths"), context);
  const deaths = count => Array.from({ length: count }, (_, i) => ({ uid: `npc#${i}`, seq: 1,
    type: sun ? "npc_Invoke_XVI" : "npc_Streuner", cause: "gun", killer: "u_0", at: now, x: 500, y: 600,
    ...(sun ? { shares: members.map(member => [member.id, 100]) } : {}),
  }));
  return { context, members, calls, messages, saved, deaths };
}

test("crédits NPC : bonus dégressif sur les cartes classiques", () => {
  for (const sector of [1, 2, 3]) {
    for (let map = 1; map <= 4; map++) assert.equal(npcMapCreditMultiplier(`${sector}-${map}`), 2);
    assert.equal(npcMapCreditMultiplier(`${sector}-5`), 1.5);
    for (let map = 6; map <= 8; map++) assert.equal(npcMapCreditMultiplier(`${sector}-${map}`), 1.25);
  }
  for (const map of ["4-1", "4-5", "5-1", "1-BL", "low", "alpha", "awakened"])
    assert.equal(npcMapCreditMultiplier(map), 1, map);
});

test("1500 kills attribués dans l'appel initial, sans délai ni double récompense", () => {
  const s = rewardServer();
  const deaths = s.deaths(1500);
  s.context.awardNpcDeaths("1-3", deaths);
  assert.equal(s.saved.size, 1500);
  assert.equal(s.messages.length, 1500);
  s.context.awardNpcDeaths("1-3", deaths);
  assert.equal(s.saved.size, 1500);
  assert.equal(s.calls.length, 1500);
});

test("600 kills en groupe de 24 : les 14400 parts sont attribuées immédiatement", () => {
  const s = rewardServer(24);
  s.context.awardNpcDeaths("1-3", s.deaths(600));
  assert.equal(s.saved.size, 600 * 24);
  assert.equal(s.calls.length, 600 * 24, "les parts déjà traitées ne sont pas recommencées");
  assert.equal(s.messages.filter(m => m.ownsKill).length, 600);
  const total = s.messages.reduce((sum, m) => sum + m.percent, 0);
  assert.equal(total, 600 * 100);
  for (let i = 0; i < 24; i++) assert.equal(s.messages.filter(m => m.pid === `u_${i}`).length, 600);
});

test("kill du bot : le groupe partage un pool réduit à 25 %", () => {
  const s = rewardServer(4, false, false, true);
  s.context.awardNpcDeaths("1-3", s.deaths(1));
  const rewards = s.messages.filter(message => message.t === "npcReward");
  assert.equal(rewards.length, 4);
  assert.equal(rewards.reduce((sum, reward) => sum + reward.percent, 0), 25);
  assert.deepEqual(rewards.map(reward => reward.percent), [6.25, 6.25, 6.25, 6.25]);
  assert.equal(rewards.filter(reward => reward.ownsKill).length, 1);
});

test("kill du bot en BL : la récompense NPC reste réduite à 25 %", () => {
  const s = rewardServer(1, false, false, true);
  s.context.awardNpcDeaths("1-BL", s.deaths(1));
  const rewards = s.messages.filter(message => message.t === "npcReward");
  assert.equal(rewards.length, 1);
  assert.equal(rewards[0].percent, 25);
});

test("kill manuel : le groupe conserve le pool normal à 100 %", () => {
  const s = rewardServer(4);
  s.context.awardNpcDeaths("1-3", s.deaths(1));
  const rewards = s.messages.filter(message => message.t === "npcReward");
  assert.equal(rewards.reduce((sum, reward) => sum + reward.percent, 0), 100);
});

test("journal rejoué après une erreur SQLite : aucun doublon ni soleil répété", () => {
  const s = rewardServer(8, true, true);
  const deaths = s.deaths(3);
  s.context.awardNpcDeaths("1-3", deaths);
  assert.equal(s.saved.size, 23, "les autres parts sont attribuées malgré l'erreur");
  s.context.awardNpcDeaths("1-3", deaths);
  assert.equal(s.saved.size, 24);
  assert.equal(s.calls.length, 32);
  assert.equal(s.messages.filter(m => m.t === "npcSun").length, 24);
  assert.equal(s.messages.filter(m => m.t === "npcReward").length, 24);
});

test("une part en erreur ne bloque pas les récompenses des autres membres", () => {
  const s = rewardServer(8);
  const award = s.context.awardNpcKill;
  s.context.awardNpcKill = (...args) => args[0] === "0" ? null : award(...args);
  const deaths = s.deaths(1);
  s.context.awardNpcDeaths("1-3", deaths);
  assert.equal(s.saved.size, 7);
  s.context.awardNpcKill = award;
  s.context.awardNpcDeaths("1-3", deaths);
  assert.equal(s.saved.size, 8);
});

test("simulation réelle : le coup fatal attribue le kill avant le snapshot suivant", async () => {
  const s = rewardServer();
  const sim = await ZoneNpcSim.create("1-3");
  assert.ok(sim);
  sim.onDeath = death => s.context.awardNpcDeaths("1-3", [death]);
  sim.tick(.1);
  const enemy = [...sim.entries.values()].find(e => e.hp > 0 && !e.jpc);
  assert.ok(enemy);
  sim.setPlayer("u_0", enemy.x, enemy.y);
  sim.applyHit("u_0", { uid: enemy.uid, dmg: 100000000, variance: 0, critChance: 0 });
  assert.equal(s.saved.size, 1);
  assert.equal(s.messages.length, 1, "l'envoi se fait avant le retour du coup fatal");
  s.context.awardNpcDeaths("1-3", sim.snapshot().deaths);
  assert.equal(s.messages.length, 1);
});

test("15 cycles Halloween complets : chaque nouvelle incarnation verse son gain", t => {
  t.mock.timers.enable({ apis: ["Date"], now: Date.parse("2026-10-17T10:00:00Z") });
  const s = rewardServer();
  const world = { w: 11000, h: 7000 };
  const camps = appendHalloweenCamps([], world, { mapId: "1-3", npcTypes: NPC_TYPES })
    .map((camp, i) => ({ ...camp, id: i + 1 }));
  const sim = new ZoneNpcSim("1-3", world, camps);
  sim.jpcApplyHourBucket = () => {};
  const deaths = [];
  sim.onDeath = death => { deaths.push(death); s.context.awardNpcDeaths("1-3", [death]); };
  sim.tick(.1);
  const kill = (role, index) => {
    const live = [...sim.entries.values()].filter(e => e.hp > 0 && halloweenRoleOf(e.type) === role);
    const enemy = live[index % live.length];
    assert.ok(enemy, `un ${role} est disponible`);
    sim.setPlayer("u_0", enemy.x, enemy.y);
    sim.applyHit("u_0", { uid: enemy.uid, dmg: 100000000, variance: 0, critChance: 0 });
    assert.equal(enemy.hp, 0);
    sim.players.clear();
    sim.tick(.1);
  };
  for (let cycle = 0; cycle < 15; cycle++) {
    for (let i = 0; i < 50; i++) kill("normal", i);
    assert.equal(sim.halloween.phase, "boss");
    for (let i = 0; i < 3; i++) kill("boss", 0);
    assert.equal(sim.halloween.phase, "normal");
    assert.equal(s.messages.filter(m => m.t === "npcReward").length, (cycle + 1) * 53,
      `tous les kills du cycle ${cycle + 1} sont récompensés`);
  }
  assert.equal(new Set(deaths.map(d => `${d.uid}:${d.seq}`)).size, 15 * 53);
});

test("changements de vague : les camps purgés puis recréés restent récompensés", () => {
  const s = rewardServer();
  const camps = [1, 2].map(id => ({ id, raidWave: id, type: "npc_Streuner",
    x: 5000, y: 3500, fixed: true, maxAlive: 1, respawn: 0 }));
  const sim = new ZoneNpcSim("1-3", { w: 11000, h: 7000 }, camps);
  sim.syncHalloween = sim.jpcApplyHourBucket = () => {};
  sim.onDeath = death => s.context.awardNpcDeaths("1-3", [death]);
  for (let cycle = 0; cycle < 20; cycle++) {
    sim.setRaidWave(1);
    sim.tick(.1);
    const enemy = [...sim.entries.values()].find(e => e.campId === 1);
    assert.ok(enemy?.hp > 0);
    sim.setPlayer("u_0", enemy.x, enemy.y);
    sim.applyHit("u_0", { uid: enemy.uid, dmg: 100000000, variance: 0, critChance: 0 });
    assert.equal(enemy.hp, 0);
    sim.players.clear();
    sim.tick(.1);
    assert.ok(sim.entries.get(enemy.uid).hp > 0);
    sim.setRaidWave(2);
    assert.equal(sim.entries.has(enemy.uid), false, "la vague retire le camp vivant");
    sim.tick(.1);
    assert.equal(s.saved.size, cycle + 1, "la recréation ne réutilise aucun ancien gain");
  }
});

test("roster JPC remplacé : aucune incarnation déjà récompensée n'est réutilisée", () => {
  const s = rewardServer();
  const sim = new ZoneNpcSim("1-3", { w: 11000, h: 7000 }, []);
  sim.syncHalloween = sim.jpcApplyHourBucket = () => {};
  sim.onDeath = death => s.context.awardNpcDeaths("1-3", [death]);
  const roster = [{ uid: "1-3#jpc0", type: "npc_Streuner", x: 5000, y: 3500, hpMax: 1000 }];
  sim.spawnJpcRoster(roster, Date.now());
  const uid = roster[0].uid;
  const kill = () => {
    const enemy = sim.entries.get(uid);
    sim.setPlayer("u_0", enemy.x, enemy.y);
    sim.applyHit("u_0", { uid, dmg: 100000000, variance: 0, critChance: 0 });
    assert.equal(enemy.hp, 0);
    sim.players.clear();
  };
  const firstSeq = sim.entries.get(uid).seq;
  kill();
  sim.entries.get(uid).jpcRespawnAt = 0;
  sim.tick(.1);
  const respawnSeq = sim.entries.get(uid).seq;
  assert.equal(respawnSeq, firstSeq + 1);
  kill();
  sim.spawnJpcRoster(roster, Date.now());
  assert.equal(sim.entries.get(uid).seq, respawnSeq + 1, "remplacement du roster existant");
  kill();
  sim.entries.delete(uid);
  sim.spawnJpcRoster(roster, Date.now());
  assert.equal(sim.entries.get(uid).seq, respawnSeq + 2, "recréation après suppression");
  kill();
  assert.equal(s.saved.size, 4, "chaque vie du bot a versé sa récompense");
});

test("Strokelight : seul le détenteur du lock rouge est récompensé, même en groupe", () => {
  const s = rewardServer(2);
  const type = "npc_Strokelight_Barrage";
  const camps = [1, 2].map(id => ({ id, type, x: 5000, y: 3500, fixed: true, maxAlive: 1, respawn: 3600 }));
  const sim = new ZoneNpcSim("1-3", { w: 11000, h: 7000 }, camps);
  sim.onDeath = death => s.context.awardNpcDeaths("1-3", [death]);
  for (const [index, percent] of [.5, 20].entries()) {
    sim.spawnFor(camps[index], Date.now());
    const boss = [...sim.entries.values()].find(e => e.campId === index + 1);
    Object.assign(boss, { hp: 10000, hpMax: 10000, sh: 0, shMax: 0, dr: 0 });
    for (const id of ["u_0", "u_1"]) sim.setPlayer(id, boss.x, boss.y);
    sim.applyHit("u_0", { uid: boss.uid, dmg: 10000 - percent * 100, variance: 0, critChance: 0 });
    sim.applyHit("u_1", { uid: boss.uid, dmg: percent * 100, variance: 0, critChance: 0 });
    assert.equal(boss.hp, 0);
    const rewards = s.messages.filter(m => m.t === "npcReward" && m.uid === boss.uid);
    assert.equal(rewards.length, 1, "le groupe et le dernier coup ne donnent aucune part");
    assert.equal(rewards[0].pid, "u_0");
    assert.equal(rewards[0].percent, 100);
    assert.equal(rewards[0].ownsKill, true);
    assert.ok(rewards.every(m => m.sun === false), "le Strokelight ne crée pas de soleil personnel");
  }
  s.context.awardNpcDeaths("1-3", sim.snapshot().deaths);
  assert.equal(s.saved.size, 2, "les snapshots suivants ne doublent aucun gain");
});

test("Boss Cucurbitor : chaque tapeur reçoit sa part exacte sans être le premier attaquant", () => {
  const s = rewardServer(2);
  const death = { ...s.deaths(1)[0], type: "npc_Boss_Curcubitor_1_3", shares: [["u_0", 9950], ["u_1", 50]] };
  s.context.awardNpcDeaths("1-3", [death]);
  const first = s.messages.find(m => m.t === "npcReward" && m.pid === "u_0");
  const later = s.messages.find(m => m.t === "npcReward" && m.pid === "u_1");
  assert.equal(first.percent, 99.5);
  assert.equal(later.percent, .5);
  assert.equal(later.ownsKill, false);
  assert.equal(later.sun, true);
});

test("Boss Cucurbitor : tous les 150 tapeurs sont éligibles, même sous 1 %", () => {
  const s = rewardServer(150);
  const death = { ...s.deaths(1)[0], type: "npc_Boss_Curcubitor_1_3",
    shares: s.members.map(member => [member.id, 100]) };
  const shares = s.context.npcRewardShares("u_0", "1-3", death);
  assert.equal(shares.length, 150);
  assert.ok(shares.every(share => share.percent > 0 && share.percent < 1));
  assert.ok(Math.abs(shares.reduce((sum, share) => sum + share.percent, 0) - 100) < 1e-9);
  s.context.awardNpcDeaths("1-3", [death]);
  assert.equal(s.messages.filter(m => m.t === "npcReward").length, 150);
  assert.equal(s.messages.filter(m => m.t === "npcSun").length, 10);
});

test("simulation réelle : le journal du boss conserve tous les 150 attaquants et leurs dégâts décimaux", () => {
  const type = "npc_Boss_Curcubitor_1_3";
  const sim = new ZoneNpcSim("1-3", { w: 11000, h: 7000 }, [{ id: 1, type,
    x: 5000, y: 3500, fixed: true, maxAlive: 1, respawn: 3600 }]);
  sim.jpcApplyHourBucket = () => {};
  sim.tick(.1);
  const boss = [...sim.entries.values()].find(e => e.type === type);
  assert.ok(boss);
  for (let i = 0; i < 150; i++) {
    const pid = `u_${i}`;
    sim.setPlayer(pid, boss.x, boss.y);
    sim.applyHit(pid, { uid: boss.uid, dmg: i === 149 ? 100000000 : .25, variance: 0, critChance: 0 });
  }
  const death = sim.deaths.find(d => d.uid === boss.uid);
  assert.equal(death.shares.length, 150);
  assert.equal(death.shares.find(([pid]) => pid === "u_0")[1], .25);
});

test("récompenses tardives : quêtes et gains appliqués après disparition, respawn ou changement de carte", () => {
  const existing = { type: "npc_Streuner", _netUid: "live", _netSeq: 3 };
  const laterIncarnation = { type: "npc_Streuner", _netUid: "respawn", _netSeq: 2 };
  const rewards = [
    { map: "1-3", uid: "live", seq: 3, type: "npc_Streuner", ownsKill: true },
    { map: "1-3", uid: "respawn", seq: 1, type: "npc_Streuner", ownsKill: true },
    { map: "2-4", uid: "gone", seq: 1, type: "npc_Jpc_T1", ownsKill: false },
  ];
  const gained = [], quests = [];
  const context = vm.createContext({ window: { __CURRENT_MAP_ID__: "1-3" }, enemies: [existing, laterIncarnation], account: { user: {} },
    measureGameTask: (_, fn) => fn(),
    advanceQuestProgress: (kind, type, amount, location) => quests.push([kind, type, location.map]),
    killRewards: e => gained.push(e), onStockpileNpcKill: () => {},
  });
  vm.runInContext(functionSource(engine, "applyNetNpcReward"), context);
  for (const reward of rewards) context.applyNetNpcReward(reward);
  assert.equal(gained.length, 3);
  assert.equal(gained[0], existing);
  assert.equal(laterIncarnation._netReward, undefined, "le vieux kill ne touche pas le nouveau NPC");
  assert.equal(gained[2].isJpcBot, true);
  assert.equal(gained[2]._netLootOwner, false);
  assert.deepEqual(quests, [["kill", "npc_Streuner", "1-3"], ["kill", "npc_Streuner", "1-3"], ["kill", "npc_Jpc_T1", "2-4"], ["pvp", "pvp", "2-4"]]);
  // Vrai bloc de progression du cadavre : sa récompense a déjà été reçue.
  const start = engine.indexOf("    if (!e.noRewards && e._netReward?._progressApplied !== true) {");
  const end = engine.indexOf("    try { flushBattlepassDamage(); }", start);
  assert.ok(start >= 0 && end > start);
  context.e = existing;
  vm.runInContext(engine.slice(start, end), context);
  assert.equal(gained.length, 3, "le retrait ultérieur du cadavre ne recompte rien");
  for (const reward of rewards) context.applyNetNpcReward(reward);
  assert.equal(gained.length, 3);
});

function progressEngine() {
  const quest = QUEST_DEFINITIONS.find(q => getQuestObjectives(q).some(o => o.kind === "kill" && o.type === "*" && o.amount > 10000));
  assert.ok(quest);
  const objective = getQuestObjectives(quest).find(o => o.kind === "kill" && o.type === "*");
  let live = { id: "pilot", credits: 100, stats: { exp: 0, honor: 0, lifetimeKills: 0, npcKills: {} },
    quests: normalizeQuestState({ active: { [quest.id]: { [objective.id]: 0 } } }),
    battlepass: normalizeBattlepassState(null), inventory: { resources: {} }, drones: { items: [] } };
  const messages = [];
  const existing = { type: "npc_Curcubitor_1_3", _netUid: "npc", _netSeq: 1, _netLootOwner: false };
  const context = vm.createContext({ structuredClone,
    account: { user: structuredClone(live), dirty: false },
    player: { credits: 100, kills: 0, ammo: {}, expBonusPct: 0, honorBonusPct: 0 },
    enemies: [existing], window: { __CURRENT_MAP_ID__: "1-3", dispatchEvent() {} },
    CustomEvent: class {}, started: false, questState: normalizeQuestState(live.quests),
    QUEST_DEFINITIONS, recordQuestProgress, normalizeQuestState, isQuestComplete,
    normalizeBattlepassState, recordBattlepassProgress, getBattlepassObjective, mergeBattlepassProgress,
    isHalloweenEventActive: () => true, netMyId: () => "u_pilot", getNetGroup: () => null,
    netList: () => [live], getCurrentUserFull: () => structuredClone(live),
    noteNetServerReward: () => true, getActiveDroneFormation: () => ({}),
    calculateRankPoints: stats => stats.exp + stats.honor,
    measureGameTask: (_, fn) => fn(), showToast() {}, addGameLog() {},
    showNotificationGroup: lines => messages.push(lines), formatInteger: value => String(value),
    NPC_TYPES: { npc_Curcubitor_1_3: { name: "Curcubitor" } },
    questJournalRenderPending: false, questTerminalRenderPending: false, refreshPendingQuestViews() {},
    onStockpileNpcKill() {}, sanitizeRocketsForSave: () => ({}),
    updateCurrentUserProgress: patch => {
      live = { ...structuredClone(live), ...structuredClone(patch) };
      return { ok: true, user: structuredClone(live) };
    },
  });
  vm.runInContext(["preserveLivePetVitals", "loadAccountUser", "markProgressDirty", "advanceQuestProgress",
    "advanceBattlepassProgress", "killRewards", "applyNetNpcReward", "saveProgressNowMeasured"]
    .map(name => functionSource(engine, name)).join("\n"), context);
  const reward = (seq, ownsKill = true) => ({ map: "1-3", uid: "npc", seq, type: "npc_Curcubitor_1_3",
    killer: ownsKill ? "u_pilot" : "u_mira", killerPseudo: ownsKill ? "Moi" : "Mira", ownsKill,
    percent: 50, credits: 10, baseExp: 20, exp: 20, baseHonor: 2, honor: 2, revision: seq + 1 });
  return { context, reward, messages, live: () => live, quest, objective, existing };
}

test("messages : un ancien indicateur de butin ne transforme pas notre kill en kill d'un autre pilote", () => {
  const c = progressEngine();
  c.context.applyNetNpcReward(c.reward(1, true));
  assert.match(c.messages.at(-1)[0], /^Vous avez éliminé/);
  assert.equal(c.existing._netLootOwner, true);
});

test("messages : le vrai pseudo du tueur est affiché pour une part reçue hors groupe", () => {
  const c = progressEngine();
  c.context.applyNetNpcReward(c.reward(1, false));
  assert.match(c.messages.at(-1)[0], /^Le pilote Mira a éliminé/);
});

test("une récompense reçue avant le chargement du compte alimente aussi ses quêtes et son passe", () => {
  const c = progressEngine();
  c.context.account.user = null;
  c.context.questState = normalizeQuestState(null);
  c.context.applyNetNpcReward(c.reward(1));
  assert.equal(c.context.questState.active[c.quest.id][c.objective.id], 1);
  assert.equal(c.context.account.user.battlepass.progress.hw_kill_7, 1);
});

test("5000 kills, sauvegardes et comptes remplacés : quêtes, passe et gains restent exacts", () => {
  const c = progressEngine();
  for (let i = 1; i <= 5000; i++) {
    c.context.applyNetNpcReward(c.reward(i, i % 2 === 0));
    if (i % 37 === 0) c.context.saveProgressNowMeasured();
  }
  c.context.saveProgressNowMeasured();
  const saved = c.live();
  assert.equal(saved.quests.active[c.quest.id][c.objective.id], 5000);
  assert.equal(saved.battlepass.progress.hw_kill_7, 5000);
  assert.equal(saved.credits, 50100);
  assert.equal(saved.stats.exp, 100000);
  assert.equal(saved.stats.honor, 10000);
  assert.equal(saved.stats.lifetimeKills, 2500);
});
