"use strict";
// Temps joué : format "X an(s), X mois, X jour(s), X h, X min, X s".
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";

const engine = readFileSync(new URL("../SRC/CORE/ORBIT_ENGINE.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");

function engineFunction(name, source = engine) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, name);
  const end = source.indexOf("\n}", start);
  assert.ok(end > start, name);
  return source.slice(start, end + 2);
}

const context = vm.createContext({});
vm.runInContext(engineFunction("formatPlaytime"), context);
vm.runInContext(engineFunction("formatRegDate"), context);
const formatPlaytime = (s) => vm.runInContext(`formatPlaytime(${JSON.stringify(s)})`, context);
const formatRegDate = (t) => vm.runInContext(`formatRegDate(${JSON.stringify(t)})`, context);

test("temps joué : compact 1 lettre, zéros masqués", () => {
  assert.equal(formatPlaytime(0), "0s");
  assert.equal(formatPlaytime(1), "1s");
  assert.equal(formatPlaytime(61), "1m, 1s");
  assert.equal(formatPlaytime(3600), "1h");
  assert.equal(formatPlaytime(3661), "1h, 1m, 1s");
  assert.equal(formatPlaytime(90061), "1j, 1h, 1m, 1s");
  assert.equal(formatPlaytime(3600 * 24 * 40), "1M, 10j");
  assert.equal(formatPlaytime(3600 * 24 * 400), "1a, 1M, 5j");
  assert.equal(formatPlaytime(2 * 31536000 + 3 * 2592000 + 4 * 86400 + 5 * 3600 + 6 * 60 + 7),
    "2a, 3M, 4j, 5h, 6m, 7s");
  assert.equal(formatPlaytime(-5), "0s");
  assert.equal(formatPlaytime("abc"), "0s");
});

test("inscription : date JJ/MM/AAAA, vide si absente", () => {
  // Midi heure locale : même jour calendaire quel que soit le fuseau.
  assert.equal(formatRegDate(new Date(2026, 8, 20, 12).getTime()), "20/09/2026");
  assert.equal(formatRegDate(new Date(2025, 0, 1, 12).getTime()), "01/01/2025");
  assert.equal(formatRegDate(0), "—");
  assert.equal(formatRegDate(null), "—");
  assert.equal(formatRegDate("abc"), "—");
});
