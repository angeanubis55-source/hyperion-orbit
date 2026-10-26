import test from "node:test";
import assert from "node:assert/strict";
import { adviseModules, ADVISOR_LASER_HIT_CAP } from "../SRC/DATA/MODULE_ADVISOR.js";

const mod = (id, type, ...bonuses) => ({ id, type, tier: "x1", bonuses: bonuses.map(([stat, pct]) => ({ stat, pct })) });

const modules = [
  mod("npc", "dmg", ["dmg_npc", 30]),
  mod("pvp", "dmg", ["dmg_pvp", 20]),
  mod("shd", "shd", ["shield", 30]),
  mod("exp", "spc", ["exp", 12]),
  mod("hit1", "spc", ["laser_hit", 10]),
  mod("hit2", "spc", ["laser_hit", 10]),
  mod("bad", "hp", ["hp", 2], ["damage", -8]),
];

test("PvE : Dégâts NPC passe devant Dégâts PvP (sans effet sur les NPC)", () => {
  const out = adviseModules({ modules, mode: "pve" });
  const ids = out.picks.map((p) => p.module.id);
  assert.ok(ids.includes("npc"));
  assert.ok(!ids.includes("pvp"));
});

test("PvP : Dégâts PvP choisi, Dégâts NPC jamais", () => {
  const ids = adviseModules({ modules, mode: "pvp" }).picks.map((p) => p.module.id);
  assert.ok(ids.includes("pvp"));
  assert.ok(!ids.includes("npc"));
});

test("objectif Expérience : le module Exp est monté", () => {
  const ids = adviseModules({ modules, mode: "pve", focus: "exp" }).picks.map((p) => p.module.id);
  assert.ok(ids.includes("exp"));
});

test("Ch. Laser plafonnée : Orcus Plus x2 au-delà du plafond", () => {
  const out = adviseModules({ modules: [modules[4]], shipId: "orcus_plus", mode: "pve" });
  assert.equal(out.totals.laser_hit, 20);
  assert.equal(out.picks[0].parts[0].gainPct, ADVISOR_LASER_HIT_CAP);
  assert.equal(out.picks[0].parts[0].capped, true);
});

test("un module qui fait perdre des points n'est jamais conseillé", () => {
  const ids = adviseModules({ modules, mode: "pve" }).picks.map((p) => p.module.id);
  assert.ok(!ids.includes("bad"));
});

test("jamais 2 modules de la même couleur, comparaison avec la même couleur", () => {
  const out = adviseModules({ modules, mode: "pve" });
  const types = out.picks.map((p) => p.module.type);
  assert.equal(new Set(types).size, types.length);
  for (const pick of out.picks) {
    if (pick.runnerUp) assert.equal(pick.runnerUp.module.type, pick.module.type);
  }
});

test("montage actuel comparé au conseillé, coque Orcus x1,5", () => {
  const out = adviseModules({ modules, equippedIds: ["bad"], shipId: "orcus", mode: "pve" });
  assert.equal(out.hullMult, 1.5);
  assert.ok(out.currentScore < 0);
  assert.ok(out.recommendedScore > out.currentScore);
  // Seul module vert = négatif : 3 couleurs conseillées, pas de HP.
  assert.deepEqual(out.picks.map((p) => p.module.type).sort(), ["dmg", "shd", "spc"]);
});
