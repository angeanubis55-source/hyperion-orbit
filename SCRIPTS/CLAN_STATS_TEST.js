import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

// clanStatsOfData (ACCOUNT_SERVER.js) : statistiques d'un membre pour les clans.
// Elle reçoit json_extract(u.data, '$.stats'), pas le compte entier.
const source = readFileSync(new URL("./ACCOUNT_SERVER.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const from = source.indexOf("function clanStatsOfData(");
const to = source.indexOf("\n}", from);
assert.ok(from >= 0 && to > from);
const ctx = vm.createContext({ calculateRankPoints: ({ exp, honor }) => Math.floor(exp / 100000) + Math.floor(Math.max(0, honor) / 100) });
vm.runInContext(`${source.slice(from, to + 2)}; this.clanStatsOfData = clanStatsOfData;`, ctx);

test("clan : les kills NPC viennent du détail par type, pas du total client", () => {
  // Total client gonflé par 3 kills PvP : le classement doit afficher 12.
  const stats = { exp: 0, honor: 0, lifetimeKills: 15, npcKills: { npc_Streuner: 10, npc_Lordakia: 2 } };
  assert.equal(ctx.clanStatsOfData(JSON.stringify(stats)).npcKills, 12);
});

test("clan : ancien compte sans détail par type, repli sur le total", () => {
  assert.equal(ctx.clanStatsOfData(JSON.stringify({ lifetimeKills: 7 })).npcKills, 7);
  assert.equal(ctx.clanStatsOfData("{}").npcKills, 0);
  assert.equal(ctx.clanStatsOfData(null).npcKills, 0, "compte sans stats");
});
