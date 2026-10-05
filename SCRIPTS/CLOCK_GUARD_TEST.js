import test from "node:test";
import assert from "node:assert/strict";
import { updateClockGuard, stopRejectedMotion } from "./CLOCK_GUARD.js";

test("une horloge normale ou invalide ne suspend pas la session", () => {
  const state = {};
  assert.equal(updateClockGuard(state, Infinity, 5, 10000), null);
  assert.equal(updateClockGuard(state, 250, 4, 10000), null);
  assert.equal(updateClockGuard(state, -1, 5, 10000), null);
  assert.deepEqual(updateClockGuard(state, 5, 5, 10000), { blocked: false });
  assert.equal(state._clockGuard, undefined);
});

test("la reprise attend le retour du rythme normal et cinq secondes serveur", () => {
  const state = {};
  assert.deepEqual(updateClockGuard(state, 250, 5, 10000), { blocked: true });
  assert.equal(state._aud, undefined, "aucun score ni sanction de compte");
  assert.equal(updateClockGuard(state, 5, 5, 14999).blocked, true);
  assert.equal(updateClockGuard(state, 0, 5, 15000).blocked, true);
  assert.equal(updateClockGuard(state, 50, 5, 15000).blocked, true);
  assert.equal(updateClockGuard(state, 5, 5, 19999).blocked, true);
  assert.deepEqual(updateClockGuard(state, 5, 5, 20000), { blocked: false, recovered: true });
});

test("les rejets verifies retardent la reprise, les diagnostics seuls ne la bloquent pas", () => {
  const state = { _security: { history: [{ kind: "movement", at: 14000 }] } };
  updateClockGuard(state, 250, 5, 10000);
  assert.equal(updateClockGuard(state, 5, 5, 15000).blocked, true);
  state._security.history.push({ kind: "clock", at: 19000 }, { kind: "profile", at: 19000 });
  assert.equal(updateClockGuard(state, 5, 5, 19000).recovered, true);
});

test("un mouvement refuse ne transmet plus sa vitesse ni sa destination", () => {
  const state = { x: 123, y: 456, vx: 20000, vy: 30000, moving: true, mx: 99999, my: 99999 };
  stopRejectedMotion(state);
  assert.deepEqual(state, { x: 123, y: 456, vx: 0, vy: 0, moving: false, mx: 123, my: 456, motionBlocked: true });
});
