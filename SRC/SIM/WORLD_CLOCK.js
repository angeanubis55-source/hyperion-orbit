"use strict";

// Horloge monde unique, partagee entre solo (Date.now) et futur serveur (heure serveur).
// Pur et testable : aucun acces direct a window/localStorage, tout est injecte.
// En ligne, il suffira de passer nowFn = () => serverTimeMs et storage = adaptateur reseau.

export const WORLD_CLOCK_KEY = "orbit_world_clock_v1";

export function createWorldClock({
  nowFn = () => Date.now(),
  storage = null,
  key = WORLD_CLOCK_KEY,
  saveThrottleMs = 5000,
} = {}) {
  let lastTickMs = 0;
  let lastSaveMs = 0;

  try {
    const raw = storage?.getItem?.(key);
    if (raw != null) {
      const parsed = JSON.parse(raw);
      const t = Number(parsed?.lastTickMs ?? parsed);
      if (Number.isFinite(t) && t > 0) lastTickMs = Math.floor(t);
    }
  } catch {
    // stockage indisponible ou corrompu : on repart de zero sans casser le jeu
  }

  function now() {
    const t = Math.floor(Number(nowFn?.()) || 0);
    return t > 0 ? t : Date.now();
  }

  function markTick({ force = false } = {}) {
    const t = now();
    // Monotone : l'horloge monde ne recule jamais (anti changement d'horloge systeme)
    if (t > lastTickMs) lastTickMs = t;
    if (!storage?.setItem) return lastTickMs;
    if (!force && lastTickMs - lastSaveMs < Math.max(0, saveThrottleMs)) return lastTickMs;
    lastSaveMs = lastTickMs;
    try {
      storage.setItem(key, JSON.stringify({ v: 1, lastTickMs }));
    } catch {
      // quota / navigation privee : le jeu continue, juste sans persistance d'horloge
    }
    return lastTickMs;
  }

  function elapsedSince(pastMs) {
    const past = Math.floor(Number(pastMs) || 0);
    if (!(past > 0)) return 0;
    return Math.max(0, now() - past);
  }

  function timeUntil(targetMs) {
    const target = Math.floor(Number(targetMs) || 0);
    if (!(target > 0)) return 0;
    return Math.max(0, target - now());
  }

  function isDue(targetMs) {
    const target = Math.floor(Number(targetMs) || 0);
    if (!(target > 0)) return true;
    return now() >= target;
  }

  function getLastTick() {
    return lastTickMs;
  }

  return { now, markTick, elapsedSince, timeUntil, isDue, getLastTick, key };
}
