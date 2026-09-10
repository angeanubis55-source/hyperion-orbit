import test from "node:test";
import assert from "node:assert/strict";
import { createPerformanceMonitor } from "../../SRC/CORE/PERFORMANCE_MONITOR.js";
import { measureGameTask, gamePerformanceTimings } from "../../SRC/CORE/PERFORMANCE_TIMINGS.js";

test("les pauses longues restent visibles dans les statistiques", () => {
  const monitor = createPerformanceMonitor(10);
  for (let i = 0; i < 9; i++) monitor.record(0.01);
  monitor.record(0.5);
  assert.equal(monitor.snapshot().p95Ms, 500);
  assert.equal(monitor.snapshot().averageMs, 59);
});

test("les mesures préservent résultats et erreurs et se réinitialisent", () => {
  gamePerformanceTimings.reset();
  assert.equal(measureGameTask("test", () => 42), 42);
  const error = new Error("test");
  assert.throws(() => measureGameTask("test", () => { throw error; }), value => value === error);
  const result = gamePerformanceTimings.snapshot().test;
  assert.equal(result.count, 2);
  assert.ok(result.maxMs >= result.averageMs);
  result.count = 100;
  assert.equal(gamePerformanceTimings.snapshot().test.count, 2);
  gamePerformanceTimings.reset();
  assert.deepEqual(gamePerformanceTimings.snapshot(), {});
});
