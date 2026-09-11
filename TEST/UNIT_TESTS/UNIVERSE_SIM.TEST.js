import test from "node:test";
import assert from "node:assert/strict";
import { createWorldClock } from "../../SRC/SIM/WORLD_CLOCK.js";
import {
  createUniverse,
  deserializeUniverse,
  ensureMapSlots,
  markDead,
  respawnDelayForType,
  serializeUniverse,
  snapshotEnemy,
  tickBackground,
} from "../../SRC/SIM/UNIVERSE_SIM.js";

test("clock ne recule jamais et calcule l'ecoule", () => {
  let t = 1000;
  const clock = createWorldClock({ nowFn: () => t, storage: null });
  clock.markTick({ force: true });
  assert.equal(clock.getLastTick(), 1000);
  t = 500; // horloge systeme reculee
  clock.markTick({ force: true });
  assert.equal(clock.getLastTick(), 1000);
  t = 40000;
  assert.equal(clock.elapsedSince(1000), 39000);
  assert.equal(clock.isDue(20000), true);
  assert.equal(clock.isDue(50000), false);
});

test("slots stables : pas de regen au re-assure", () => {
  const u = createUniverse();
  const camps = [
    { id: 1, type: "npc_Streuner", x: 100, y: 200 },
    { id: 2, type: "npc_Streuner", x: 300, y: 400 },
  ];
  const first = ensureMapSlots(u, "1-1", camps, 1000);
  assert.equal(first.length, 2);
  markDead(u, "1-1", first[0].uid, 2000);
  const second = ensureMapSlots(u, "1-1", camps, 3000);
  assert.equal(second[0].alive, false); // l'etat vivant est preserve, pas regenere
  assert.equal(second[0].uid, first[0].uid);
});

test("respawn instant sauf cubikon 60s", () => {
  assert.equal(respawnDelayForType("npc_Streuner"), 0);
  assert.equal(respawnDelayForType("npc_Boss_Kristallon"), 0);
  assert.equal(respawnDelayForType("npc_Cubikon"), 60000);
});

test("fond : quelques secondes = a peine bouge, ignore la map active", () => {
  const u = createUniverse();
  ensureMapSlots(u, "1-1", [{ id: 1, type: "npc_Streuner", x: 1000, y: 1000 }], 0);
  snapshotEnemy(u, "1-1", "1-1#1", { x: 1100, y: 1000, hpPct: 0.3, shPct: 0.3 }, 10000);
  // 3 secondes d'absence : derive de quelques dizaines de px max
  const r = tickBackground(u, 13000, {});
  assert.equal(r.revived.length, 0);
  const s = u.maps["1-1"][0];
  assert.ok(Math.abs(s.x - 1100) < 200, `derive courte bornee, x=${s.x}`);
  assert.equal(s.hpPct, 0.3); // blesse reste blesse (pas de bots encore)
  // map active ignoree
  const before = s.x;
  tickBackground(u, 60000, { skipMapId: "1-1" });
  assert.equal(u.maps["1-1"][0].x, before);
});

test("fond : longue absence = retour vers le home, borne", () => {
  const u = createUniverse();
  ensureMapSlots(u, "2-1", [{ id: 1, type: "npc_Saimon", x: 500, y: 500 }], 0);
  snapshotEnemy(u, "2-1", "2-1#1", { x: 5000, y: 5000, hpPct: 0.5, shPct: 0.5 }, 1000);
  tickBackground(u, 1000 + 10 * 60 * 1000, {});
  const s = u.maps["2-1"][0];
  const dHome = Math.hypot(s.x - 500, s.y - 500);
  assert.ok(dHome < 4500, `revenu vers le home, d=${dHome}`);
});
test("mort -> respawn via horloge (rattrapage refresh)", () => {
  const u = createUniverse();
  ensureMapSlots(u, "1-1", [{ id: 1, type: "npc_Streuner", x: 10, y: 20 }], 0);
  const uid = "1-1#1";
  markDead(u, "1-1", uid, 1000, 3000); // respawn a 4000
  let r = tickBackground(u, 2000);
  assert.equal(r.revived.length, 0); // trop tot
  r = tickBackground(u, 5000); // comme un retour apres refresh
  assert.equal(r.revived.length, 1);
  assert.equal(r.revived[0].uid, uid);
});

test("NPC blesse retrouve son HP (snapshot)", () => {
  const u = createUniverse();
  ensureMapSlots(u, "1-1", [{ id: 7, type: "npc_Saimon", x: 50, y: 60 }], 100);
  snapshotEnemy(u, "1-1", "1-1#7", { x: 111, y: 222, hpPct: 0.3, shPct: 0.1 }, 200);
  const again = ensureMapSlots(u, "1-1", [{ id: 7, type: "npc_Saimon", x: 50, y: 60 }], 300);
  assert.equal(again[0].hpPct, 0.3);
  assert.equal(again[0].x, 111);
  const back = deserializeUniverse(serializeUniverse(u));
  assert.equal(back.maps["1-1"][0].hpPct, 0.3);
});
