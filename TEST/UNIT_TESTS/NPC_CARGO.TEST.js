import test from "node:test";
import assert from "node:assert/strict";
import { fallbackCargoFor, getNpcCargoOres } from "../../NPC/NPC_CARGO.js";

test("streuner cargo follows the requested values", () => {
  assert.deepEqual(getNpcCargoOres("npc_Streuner"), { prometium: 10, endurium: 10 });
});

test("boss and uber use the official lexicon soutes", () => {
  assert.deepEqual(getNpcCargoOres("npc_Boss_Streuner"), { prometium: 40, endurium: 40, terbium: 10 });
  assert.equal(getNpcCargoOres("npc_Boss_Kristallon").xenomit, 64);
  assert.equal(getNpcCargoOres("npc_Uber_Kristallon").xenomit, 128);
  assert.deepEqual(getNpcCargoOres("npc_Boss_StreuneR8").prometium, 320);
  assert.deepEqual(getNpcCargoOres("npc_Deadly_Battleray").promerium, 20);
});

test("gate variants scale like the official game", () => {
  assert.deepEqual(getNpcCargoOres("npc_Streuner_alpha"), { prometium: 10, endurium: 10 });
  assert.deepEqual(getNpcCargoOres("npc_Streuner_beta"), { prometium: 20, endurium: 20 });
  assert.equal(getNpcCargoOres("npc_Kristallon_gamma").prometium, 900);
});

test("uber pirates carry official palladium cargo", () => {
  assert.equal(getNpcCargoOres("npc_Uber_Interceptor").palladium, 2);
  assert.equal(getNpcCargoOres("npc_Uber_Saboteur").palladium, 3);
  assert.equal(getNpcCargoOres("npc_Uber_Annihilator").palladium, 4);
  assert.equal(getNpcCargoOres("npc_Uber_Battleray").palladium, 6);
});

test("reskins fall back to the base family", () => {
  assert.deepEqual(getNpcCargoOres("npc_Frozen_Kristallin"), getNpcCargoOres("npc_Kristallin"));
  assert.deepEqual(getNpcCargoOres("npc_Vinespire"), getNpcCargoOres("npc_Kristallin"));
  assert.deepEqual(getNpcCargoOres("npc_Saimon_Corrupted"), getNpcCargoOres("npc_Saimon"));
  assert.deepEqual(getNpcCargoOres("npc_Devourer_Corrupted"), getNpcCargoOres("npc_Devourer"));
  assert.deepEqual(getNpcCargoOres("npc_Saimon_Aberration"), getNpcCargoOres("npc_Saimon"));
  assert.deepEqual(getNpcCargoOres("npc_Boss_Kristallon_Oddity"), getNpcCargoOres("npc_Boss_Kristallon"));
  assert.deepEqual(getNpcCargoOres("npc_Awakened_Lordakium"), getNpcCargoOres("npc_Lordakium"));
  assert.deepEqual(getNpcCargoOres("npc_Reflector_Mimesi5"), getNpcCargoOres("npc_Reflector_Mimesis"));
  assert.deepEqual(getNpcCargoOres("npc_Lordakium_Spore"), { duranium: 5, promerium: 3 });
  assert.ok(Object.keys(getNpcCargoOres("npc_Plagued_Gygerthrall")).length > 0);
});

test("agatus scales with the map", () => {
  assert.equal(getNpcCargoOres("npc_Agatus", "1-3").prometium, 300);
  assert.equal(getNpcCargoOres("npc_Agatus", "1-8").prometium, 1800);
  assert.equal(getNpcCargoOres("npc_Spinel", "1-5").prometium, 264);
});

test("unknown npcs get an hp-based fallback, empty only when officially empty", () => {
  const fallback = fallbackCargoFor("npc_Mindfire_Behemoth");
  assert.ok(fallback.prometium >= 5);
  assert.ok(Object.keys(getNpcCargoOres("npc_Mindfire_Behemoth")).length > 0);
  assert.ok(Object.keys(getNpcCargoOres("npc_Skoll")).length > 0);
  assert.deepEqual(getNpcCargoOres("npc_Spinelus"), {});
  assert.deepEqual(getNpcCargoOres("npc_Plutus_Turret"), {});
});
