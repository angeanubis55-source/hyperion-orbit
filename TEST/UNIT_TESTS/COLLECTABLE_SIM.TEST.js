import test from "node:test";
import assert from "node:assert/strict";

import {
  addCollectableDrop,
  countCollectableSlots,
  createCollectableStore,
  deserializeCollectableStore,
  dueCollectableSlots,
  ensureCollectableSlots,
  listCollectableDrops,
  listCollectableSlots,
  pruneExpiredDrops,
  removeCollectableDrop,
  reviveCollectableSlot,
  reviveDueCollectables,
  serializeCollectableStore,
  takeCollectableSlot,
} from "../../SRC/SIM/COLLECTABLE_SIM.js";

function defs(type, n) {
  return Array.from({ length: n }, (_, i) => ({ type, x: i * 200, y: i * 200 }));
}

test("slots stables : positions et états préservés entre visites", () => {
  const store = createCollectableStore();
  ensureCollectableSlots(store, "1-1", [...defs("Bonus_Box", 3)], 1000);
  takeCollectableSlot(store, "1-1", "Bonus_Box#1", 2000, 60000);
  // Revisite avec defs régénérées (positions différentes) : l'état vivant gagne.
  ensureCollectableSlots(store, "1-1", [...defs("Bonus_Box", 3)], 3000);
  const slots = listCollectableSlots(store, "1-1");
  assert.equal(slots.length, 3);
  assert.equal(slots[0].x, 0); // position d'origine conservée
  assert.equal(slots[1].alive, false); // toujours ramassée
  assert.equal(slots[1].respawnAtMs, 62000);
  assert.equal(slots[2].alive, true);
});

test("respawn après délai seulement (rattrape refresh via horloge)", () => {
  const store = createCollectableStore();
  ensureCollectableSlots(store, "1-1", [...defs("Bonus_Box", 2)], 0);
  takeCollectableSlot(store, "1-1", "Bonus_Box#0", 1000, 60000);
  assert.deepEqual(dueCollectableSlots(store, "1-1", 30000).map((s) => s.uid), []);
  assert.deepEqual(dueCollectableSlots(store, "1-1", 61000).map((s) => s.uid), ["Bonus_Box#0"]);
  const revived = reviveCollectableSlot(store, "1-1", "Bonus_Box#0", 500, 600);
  assert.equal(revived.alive, true);
  assert.equal(revived.x, 500); // nouvelle position aléatoire du moteur
  assert.equal(revived.y, 600);
});

test("reviveDueCollectables ranime tout ce qui est dû", () => {
  const store = createCollectableStore();
  ensureCollectableSlots(store, "4-5", [...defs("Bonus_Box", 2)], 0);
  takeCollectableSlot(store, "4-5", "Bonus_Box#0", 0, 1000);
  takeCollectableSlot(store, "4-5", "Bonus_Box#1", 0, 999999);
  assert.deepEqual(reviveDueCollectables(store, "4-5", 2000).map((s) => s.uid), ["Bonus_Box#0"]);
});

test("réduction du quota prune les slots en trop", () => {
  const store = createCollectableStore();
  ensureCollectableSlots(store, "1-1", [...defs("Bonus_Box", 5)], 0);
  ensureCollectableSlots(store, "1-1", [...defs("Bonus_Box", 3)], 0);
  assert.equal(countCollectableSlots(store, "1-1", "Bonus_Box"), 3);
});

test("drops dynamiques : expiration temps réel, suppression à la collecte", () => {
  const store = createCollectableStore();
  const rec = addCollectableDrop(store, "1-1", { type: "Cargo_Box", x: 10, y: 20, fromNpc: "npc_Saimon", expiresAtMs: 5000 });
  assert.ok(rec.uid);
  assert.equal(listCollectableDrops(store, "1-1").length, 1);
  assert.equal(pruneExpiredDrops(store, "1-1", 4999).length, 1); // encore valide
  assert.equal(pruneExpiredDrops(store, "1-1", 5000).length, 0); // expiré
  const rec2 = addCollectableDrop(store, "1-1", { type: "Scrap_Box", x: 1, y: 2, amount: 3, expiresAtMs: 99999 });
  assert.equal(removeCollectableDrop(store, "1-1", rec2.uid), true);
  assert.equal(listCollectableDrops(store, "1-1").length, 0);
});

test("sérialisation : round-trip + données corrompues", () => {
  const store = createCollectableStore();
  ensureCollectableSlots(store, "1-1", [...defs("Bonus_Box", 2)], 0);
  takeCollectableSlot(store, "1-1", "Bonus_Box#0", 1000, 60000);
  addCollectableDrop(store, "1-1", { type: "Cargo_Box", x: 5, y: 6, fromNpc: "npc_Saimon", expiresAtMs: 99999 });
  const restored = deserializeCollectableStore(serializeCollectableStore(store));
  assert.equal(listCollectableSlots(restored, "1-1").length, 2);
  assert.equal(listCollectableSlots(restored, "1-1")[0].alive, false);
  assert.equal(listCollectableDrops(restored, "1-1")[0].fromNpc, "npc_Saimon");
  assert.deepEqual(deserializeCollectableStore("###").maps, {});
  assert.deepEqual(deserializeCollectableStore(null).maps, {});
});
