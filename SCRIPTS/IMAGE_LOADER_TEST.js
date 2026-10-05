import test from "node:test";
import assert from "node:assert/strict";
import { createImageLoader } from "../SRC/CORE/IMAGE_LOADER.js";

function images(t) {
  const pending = new Map();
  class Image {
    set src(src) { pending.set(src, this); }
    decode() { return Promise.resolve(); }
  }
  const previous = globalThis.Image;
  globalThis.Image = Image;
  t.after(() => {
    if (previous === undefined) delete globalThis.Image;
    else globalThis.Image = previous;
  });
  return pending;
}

test("un lot fixe ignore les nouvelles ressources et leurs terminaisons", async t => {
  const pending = images(t), loader = createImageLoader();
  const first = loader.load("first.png"), second = loader.load("second.png");
  const history = [];
  const unsubscribe = loader.onProgress(state => history.push(state), { freezeTotal: true });
  pending.get("first.png").onload(); await first;
  assert.equal(history.at(-1).done, 1);
  assert.equal(history.at(-1).total, 2);
  const unrelated = loader.load("background.png");
  pending.get("background.png").onload(); await unrelated;
  assert.equal(history.at(-1).done, 1, "le fond ne fait pas avancer le lot du demarrage");
  assert.equal(history.at(-1).total, 2);
  pending.get("second.png").onload(); await second;
  assert.deepEqual(history.at(-1), { total: 2, done: 2, pending: 0 });
  assert.ok(history.every((state, i) => !i || state.done >= history[i - 1].done));
  unsubscribe();
  const updates = history.length;
  loader.load("later.png");
  assert.equal(history.length, updates);
});

test("les images deja chargees comptent sans nouveau telechargement", async t => {
  const pending = images(t), loader = createImageLoader();
  const cached = loader.load("cached.png");
  pending.get("cached.png").onload(); await cached;
  assert.equal(loader.load("cached.png"), cached);
  const history = [];
  loader.onProgress(state => history.push(state), { freezeTotal: true });
  assert.deepEqual(history.at(-1), { total: 1, done: 1, pending: 0 });
  loader.load("new.png");
  assert.deepEqual(history.at(-1), { total: 1, done: 1, pending: 0 });
  assert.equal(loader.snapshot().total, 2, "le compteur global reste dynamique");
});

test("un lot vide reste vide quand d'autres images sont ajoutees", async t => {
  const pending = images(t), loader = createImageLoader();
  const history = [];
  loader.onProgress(state => history.push(state), { freezeTotal: true });
  const next = loader.load("later.png");
  pending.get("later.png").onload(); await next;
  assert.ok(history.every(state => state.total === 0 && state.done === 0 && state.pending === 0));
});
