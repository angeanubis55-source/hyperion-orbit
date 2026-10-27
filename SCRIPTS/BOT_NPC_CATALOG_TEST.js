import test from "node:test";
import assert from "node:assert/strict";
import { botCatalogGroups, botMapGroupKey, botMapsLabel, buildBotNpcCatalog } from "../SRC/CORE/BOT_NPC_CATALOG.js";

const npcTypes = {
  npc_Streuner: { name: "-=[ Streuner ]=-" },
  npc_Sibelon: { name: "-=[ Sibelon ]=-" },
  npc_Kristallon: { name: "-=[ Kristallon ]=-" },
  jpc_bot_1: { name: "Joueur", isJpcBot: true },
  npc_Curcubitor: { name: "-=[ Curcubitor ]=-" },
};
const locations = {
  npc_Streuner: ["1-1", "2-1", "3-1"],
  npc_Sibelon: ["1-5", "2-5", "3-5", "4-4"],
  npc_Kristallon: ["1-6", "Gate ETERNAL"],
  jpc_bot_1: ["1-1"],
  npc_Curcubitor: ["1-3"],
  npc_Inconnu: ["1-1"],
};
const outsideEvent = new Date("2026-03-01T12:00:00Z");
const duringEvent = new Date("2026-10-25T12:00:00Z");

test("maps regroupées par secteur", () => {
  assert.equal(botMapGroupKey("2-5"), "x-5");
  assert.equal(botMapGroupKey("3-BL"), "x-bl");
  assert.equal(botMapGroupKey("4-4"), "4-4");
  assert.equal(botMapGroupKey("Gate ETERNAL"), "gg");
  assert.equal(botMapsLabel(["1-1", "2-1", "3-1"]), "X-1");
  assert.equal(botMapsLabel(["1-5", "2-5", "3-5", "4-4"]), "X-5, 4-4");
  assert.equal(botMapsLabel(["1-6", "Gate ETERNAL"]), "1-6, GG ETERNAL");
});

test("liste fixe : uniquement les NPC des maps, jamais les JPC ni les inconnus", () => {
  const keys = buildBotNpcCatalog({ locations, npcTypes, now: outsideEvent }).map((r) => r.key);
  assert.deepEqual(keys, ["npc_Kristallon", "npc_Sibelon", "npc_Streuner"]);
});

test("NPC d'événement : présents pendant l'événement, retirés après", () => {
  const during = buildBotNpcCatalog({ locations, npcTypes, now: duringEvent });
  const curcubitor = during.find((r) => r.key === "event:halloween:normal");
  assert.ok(curcubitor);
  assert.equal(curcubitor.types.length, 18);
  assert.ok(curcubitor.groups.includes("event"));
  assert.ok(during.some((r) => r.key === "event:halloween:boss"));
  const after = buildBotNpcCatalog({ locations, npcTypes, now: outsideEvent });
  assert.ok(!after.some((r) => r.event));
});

test("filtre : groupes ordonnés X-1..X-8, maps seules, Galaxy Gates en dernier", () => {
  const groups = botCatalogGroups(buildBotNpcCatalog({ locations, npcTypes, now: outsideEvent }));
  assert.deepEqual(groups, ["x-1", "x-5", "x-6", "4-4", "gg"]);
});
