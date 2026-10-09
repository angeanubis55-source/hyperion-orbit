import test from "node:test";
import assert from "node:assert/strict";
import { isPhoneMode, setPhoneModeCached, resetPhoneModeCache } from "../SRC/CORE/PHONE_MODE.js";

test("mode téléphone coupé par défaut (sans stockage, sans réglage)", () => {
  resetPhoneModeCache();
  assert.equal(isPhoneMode(), false);
});

test("le cache mémoire évite de relire le stockage", () => {
  resetPhoneModeCache();
  setPhoneModeCached(true);
  assert.equal(isPhoneMode(), true);
  setPhoneModeCached(false);
  assert.equal(isPhoneMode(), false);
  resetPhoneModeCache();
});

test("la valeur est lue dans les réglages persistés", () => {
  resetPhoneModeCache();
  const store = {};
  globalThis.localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
  };
  try {
    store.orbit_game_settings_v1 = JSON.stringify({ phoneMode: true });
    assert.equal(isPhoneMode(), true);
    resetPhoneModeCache();
    store.orbit_game_settings_v1 = JSON.stringify({ phoneMode: false });
    assert.equal(isPhoneMode(), false);
    resetPhoneModeCache();
    store.orbit_game_settings_v1 = JSON.stringify({});
    assert.equal(isPhoneMode(), false, "clé absente = comportement normal");
    resetPhoneModeCache();
    store.orbit_game_settings_v1 = "pas-du-json{";
    assert.equal(isPhoneMode(), false, "stockage corrompu = comportement normal");
  } finally {
    delete globalThis.localStorage;
    resetPhoneModeCache();
  }
});
