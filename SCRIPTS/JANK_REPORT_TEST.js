import test from "node:test";
import assert from "node:assert/strict";
import {
  startJankRecorder,
  noteJankFrame,
  noteSaveOp,
  noteGuardBlock,
  getJankSummary,
  getJankReport,
  setJankTimingsProvider,
  clearJankReport,
} from "../SRC/CORE/JANK_RECORDER.js";

function freshSession() {
  clearJankReport();
  startJankRecorder(() => ({ map: "5-2", fps: 60, npcs: 101, players: 2 }));
}

test("les trous d'images et les sauvegardes sont tracés", () => {
  freshSession();
  noteJankFrame(0.01);
  assert.equal(getJankSummary().count, 0, "10ms = pas une saccade");
  noteJankFrame(0.2);
  assert.equal(getJankSummary().count, 1);
  assert.equal(getJankSummary().max, 200);
  noteSaveOp("univers-stockage", 210, 100000);
  noteSaveOp("univers-stockage", 30, 100000);
  const report = getJankReport("0.319");
  assert.match(report, /2× · moy 120ms · max 210ms/);
  assert.match(report, /98Ko/);
});

test("le rapport contient saccades, sauvegardes, moteur et contexte", () => {
  freshSession();
  noteJankFrame(0.15);
  noteSaveOp("push-post", 300, 0);
  setJankTimingsProvider(() => ({
    "frame.total": { count: 10, totalMs: 100, maxMs: 50, averageMs: 10 },
  }));
  const report = getJankReport("0.319");
  assert.match(report, /Rapport saccades — v0\.319/);
  assert.match(report, /150ms · image · carte 5-2 · 60 FPS · 101 NPC · 2 joueurs/);
  assert.match(report, /--- Sauvegardes/);
  assert.match(report, /push-post : 1× · moy 300ms/);
  assert.match(report, /--- Moteur/);
  assert.match(report, /frame\.total : 10× · moy 10\.0ms · max 50ms/);
  assert.match(report, /--- Contexte \(fin de session\) ---/);
  setJankTimingsProvider(null);
});

test("les blocages du garde survivent au reload via stockage", () => {
  freshSession();
  const store = {};
  globalThis.localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
  };
  try {
    noteGuardBlock(1200);
    const report = getJankReport("0.319");
    assert.match(report, /1200ms · garde/);
    assert.match(report, /Garde vitesse : 1 blocage/);
    assert.match(report, /blocage 1200ms/);
  } finally {
    delete globalThis.localStorage;
  }
});

test("sans stockage ni PerformanceObserver, rien ne casse", () => {
  freshSession();
  noteSaveOp("x", 5, 10);
  noteGuardBlock(50);
  const report = getJankReport("0.319");
  assert.match(report, /Rapport saccades/);
});
