import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { isHalloweenBossVariant } from "../NPC/NPC_HALLOWEEN.js";
import { ZoneNpcSim } from "./NPC_ROOM.js";

const server = readFileSync(new URL("./MULTI_SERVER.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const engine = readFileSync(new URL("../SRC/CORE/ORBIT_ENGINE.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
function functionSource(source, name) {
  const start = source.indexOf(`function ${name}(`);
  const end = source.indexOf("\n}", start);
  assert.ok(start >= 0 && end > start, name);
  return source.slice(start, end + 2);
}

function rewardServer(size = 1, failOnce = false, sun = false) {
  let now = 1000000;
  const members = Array.from({ length: size }, (_, i) => ({ id: `u_${i}`, online: true, map: "1-3" }));
  const calls = [], messages = [], saved = new Map();
  const context = vm.createContext({
    Date: { now: () => now }, console: { error: () => {} },
    setTimeout: () => { throw new Error("aucune mise en attente autorisée"); },
    rewardedNpcDeaths: new Map(), serverRunId: "test-run", isHalloweenBossVariant,
    socialDescribeGroup: () => ({ members: members.slice() }), describePeer: () => null,
    rooms: new Map([["1-3", new Map(members.map(member => [member.id, {}]))]]),
    findPeerState: () => ({}), audOf: () => ({}), recordAbilityNpcKill: () => {},
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
  const context = vm.createContext({ window: { __CURRENT_MAP_ID__: "1-3" }, enemies: [existing, laterIncarnation],
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
