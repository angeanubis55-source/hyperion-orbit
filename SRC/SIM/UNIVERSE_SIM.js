"use strict";

// Etat vivant de l'univers : une entree stable par camp de spawn, par map.
// Pur (aucun DOM/Canvas/window) pour pouvoir tourner tel quel sur un futur serveur Node.
// Le client (ORBIT_ENGINE) ne fait que : assurer les slots, lire les dus, marquer mort/vivant.

export const UNIVERSE_KEY = "orbit_universe_v1";
export const UNIVERSE_VERSION = 2;

export const RESPAWN_DELAY_MS = 0; // NPC normaux : instant, respawn random dans la map
export const CUBIKON_RESPAWN_DELAY_MS = 60 * 1000; // chaque Cubikon : 60 secondes
export const BOSS_RESPAWN_DELAY_MS = 0;
export const MAX_MAPS_STORED = 64;
export const MAX_SLOTS_PER_MAP = 220;

const CUBIKON_RE = /cubikon/i;

export function respawnDelayForType(type) {
  if (CUBIKON_RE.test(String(type || ""))) return CUBIKON_RESPAWN_DELAY_MS;
  return RESPAWN_DELAY_MS;
}

// --- RNG determine (utile pour futures generations stables + tests) ---
export function hashString(value) {
  let h = 2166136261;
  const s = String(value ?? "");
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function mulberry32(seed) {
  let a = (Number(seed) || 0) >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function slotUid(mapId, campId) {
  return `${String(mapId)}#${String(campId)}`;
}

export function createUniverse() {
  return { v: UNIVERSE_VERSION, maps: {} };
}

function asFiniteNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeCampId(camp, idx) {
  const raw = camp?.id ?? idx;
  return String(raw);
}

// Cree ou reconcilie les slots d'une map SANS jamais effacer l'etat vivant existant.
// - premier passage : slots alive avec home = position du camp defini
// - passages suivants : preserve alive/deadAt/respawnAt/hp, met juste a jour type/home si la def a change
// - prune les camps qui n'existent plus dans la def
export function ensureMapSlots(universe, mapId, campDefs = [], nowMs = 0) {
  if (!universe || typeof universe !== "object") throw new Error("Universe invalide");
  if (!universe.maps || typeof universe.maps !== "object") universe.maps = {};
  const id = String(mapId);
  const now = Math.floor(Number(nowMs) || 0);
  const defs = Array.isArray(campDefs) ? campDefs.slice(0, MAX_SLOTS_PER_MAP) : [];
  const prev = Array.isArray(universe.maps[id]) ? universe.maps[id] : [];
  const prevByUid = new Map(prev.map((s) => [String(s?.uid), s]));
  const next = defs.map((camp, idx) => {
    const campId = normalizeCampId(camp, idx);
    const uid = slotUid(id, campId);
    const old = prevByUid.get(uid);
    const homeX = asFiniteNumber(camp?.x, 0);
    const homeY = asFiniteNumber(camp?.y, 0);
    if (old && typeof old === "object") {
      // Stable : on ne deplace jamais un slot existant avec les nouvelles
      // positions random de getZoneSpawns(). Seul le type est mis a jour
      // (equilibrage), la home et l'etat vivant sont preserves.
      old.type = String(camp?.type || old.type || "unknown");
      if (typeof old.alive !== "boolean") old.alive = true;
      return old;
    }
    return {
      uid,
      campId,
      type: String(camp?.type || "unknown"),
      homeX,
      homeY,
      alive: true,
      deadAtMs: 0,
      respawnAtMs: 0,
      // Dernier etat connu de l'instance active (pour retrouver un NPC blesse au retour).
      // null = jamais vu vivant sur cette session de slot.
      x: homeX,
      y: homeY,
      hpPct: 1,
      shPct: 1,
      // false = prochain spawn en RANDOM (sort de mort). true = position connue.
      scattered: true,
      updatedAtMs: now > 0 ? now : 0,
    };
  });
  universe.maps[id] = next;

  // Garde-fou taille : evite de faire gonfler localStorage avec 42 maps pleines.
  const keys = Object.keys(universe.maps);
  if (keys.length > MAX_MAPS_STORED) {
    const drop = keys.length - MAX_MAPS_STORED;
    for (let i = 0; i < drop; i++) delete universe.maps[keys[i]];
  }
  return next;
}

export function getSlot(universe, mapId, uid) {
  const list = universe?.maps?.[String(mapId)];
  if (!Array.isArray(list)) return null;
  return list.find((s) => String(s?.uid) === String(uid)) || null;
}

export function markDead(universe, mapId, uid, nowMs, delayMs = null) {
  const slot = getSlot(universe, mapId, uid);
  if (!slot) return null;
  const now = Math.floor(Number(nowMs) || 0);
  const delay = delayMs == null ? respawnDelayForType(slot.type) : Math.max(0, Number(delayMs) || 0);
  slot.alive = false;
  slot.deadAtMs = now;
  slot.respawnAtMs = now + delay;
  slot.hpPct = 0;
  slot.shPct = 0;
  slot.scattered = false; // prochain spawn en RANDOM
  slot.updatedAtMs = now;
  return slot;
}

export function markAlive(universe, mapId, uid, nowMs) {
  const slot = getSlot(universe, mapId, uid);
  if (!slot) return null;
  const now = Math.floor(Number(nowMs) || 0);
  slot.alive = true;
  slot.deadAtMs = 0;
  slot.respawnAtMs = 0;
  slot.hpPct = 1;
  slot.shPct = 1;
  slot.x = slot.homeX;
  slot.y = slot.homeY;
  slot.scattered = false; // le spawner placera en RANDOM (sauf Cubikon)
  slot.updatedAtMs = now;
  return slot;
}

// Sauve l'etat d'une instance active (NPC blesse / deplace) dans son slot.
export function snapshotEnemy(universe, mapId, uid, { x, y, hpPct, shPct } = {}, nowMs = 0) {
  const slot = getSlot(universe, mapId, uid);
  if (!slot || slot.alive === false) return null;
  const now = Math.floor(Number(nowMs) || 0);
  if (Number.isFinite(Number(x))) slot.x = Number(x);
  if (Number.isFinite(Number(y))) slot.y = Number(y);
  if (Number.isFinite(Number(hpPct))) slot.hpPct = Math.max(0, Math.min(1, Number(hpPct)));
  if (Number.isFinite(Number(shPct))) slot.shPct = Math.max(0, Math.min(1, Number(shPct)));
  slot.updatedAtMs = now;
  return slot;
}

// Vie en fond des maps inactives (jamais les instances GG : elles ne sont
// pas stockees dans l'univers, mode "gate" oblige).
// - morts : ranime tout slot dont le timer est du (rattrape refresh/absence)
// - vivants : derive abstraite bornee. Quelques secondes d'absence = a peine
//   bouge ; longue absence = retour progressif vers le home, jamais a l'autre
//   bout de la carte. La map active est ignoree (skipMapId) : sa vraie IA tourne.
export const DRIFT_RETURN_MS = 60 * 1000; // retour vers le home en ~60s
export const DRIFT_JITTER_MAX = 350; // derive aleatoire max autour du point
export const DRIFT_MAX_ELAPSED_MS = 15 * 60 * 1000;

export function tickBackground(universe, nowMs, { skipMapId = null } = {}) {
  const now = Math.floor(Number(nowMs) || 0);
  const revived = [];
  let drifted = 0;
  if (!universe?.maps || !(now > 0)) return { revived, drifted };
  const skip = skipMapId != null ? String(skipMapId) : null;
  for (const [mapId, list] of Object.entries(universe.maps)) {
    if (!Array.isArray(list)) continue;
    if (skip != null && String(mapId) === skip) continue;
    for (const slot of list) {
      if (!slot) continue;
      if (slot.alive === false) {
        if (Number(slot.respawnAtMs) > 0 && now < Number(slot.respawnAtMs)) continue;
      slot.alive = true;
      slot.deadAtMs = 0;
      slot.respawnAtMs = 0;
      slot.hpPct = 1;
      slot.shPct = 1;
      slot.x = slot.homeX;
      slot.y = slot.homeY;
      slot.scattered = false; // le spawner placera en RANDOM (sauf Cubikon)
      slot.updatedAtMs = now;
      revived.push({ mapId: String(mapId), uid: String(slot.uid), type: String(slot.type) });
        continue;
      }
      // Derive bornee : proportionnelle au temps ecoule, plafonnee.
      const last = Math.max(0, Math.floor(Number(slot.updatedAtMs) || 0));
      if (!(last > 0)) continue;
      const elapsed = Math.min(Math.max(0, now - last), DRIFT_MAX_ELAPSED_MS);
      if (elapsed < 1000) continue;
      const t = Math.min(1, elapsed / DRIFT_RETURN_MS);
      const pull = t * 0.8;
      let nx = Number(slot.x) + (Number(slot.homeX) - Number(slot.x)) * pull;
      let ny = Number(slot.y) + (Number(slot.homeY) - Number(slot.y)) * pull;
      const bucket = Math.floor(now / 10000);
      const rng = mulberry32(hashString(`${slot.uid}@${bucket}`));
      const jitter = Math.min(DRIFT_JITTER_MAX, elapsed * 0.15);
      nx += (rng() - 0.5) * 2 * jitter;
      ny += (rng() - 0.5) * 2 * jitter;
      if (Number.isFinite(nx)) slot.x = nx;
      if (Number.isFinite(ny)) slot.y = ny;
      slot.updatedAtMs = now;
      drifted++;
    }
  }
  return { revived, drifted };
}

export function serializeUniverse(universe) {
  return JSON.stringify({ v: UNIVERSE_VERSION, maps: universe?.maps || {} });
}

export function deserializeUniverse(raw) {
  if (raw == null || raw === "") return createUniverse();
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!parsed || typeof parsed !== "object" || typeof parsed.maps !== "object") return createUniverse();
    // Migration : les univers v1 ont subi le brassage de types (slots instables).
    // On regenere proprement une fois avec l'autorite univers.
    if (Number(parsed.v) !== UNIVERSE_VERSION) return createUniverse();
    const universe = createUniverse();
    for (const [mapId, list] of Object.entries(parsed.maps)) {
      if (!Array.isArray(list)) continue;
      universe.maps[String(mapId)] = list
        .filter((s) => s && typeof s.uid === "string")
        .slice(0, MAX_SLOTS_PER_MAP)
        .map((s) => ({
          uid: String(s.uid),
          campId: String(s.campId ?? s.uid),
          type: String(s.type || "unknown"),
          homeX: asFiniteNumber(s.homeX ?? s.x, 0),
          homeY: asFiniteNumber(s.homeY ?? s.y, 0),
          alive: s.alive !== false,
          deadAtMs: Math.max(0, Math.floor(Number(s.deadAtMs) || 0)),
          respawnAtMs: Math.max(0, Math.floor(Number(s.respawnAtMs) || 0)),
          x: asFiniteNumber(s.x ?? s.homeX, 0),
          y: asFiniteNumber(s.y ?? s.homeY, 0),
          hpPct: Math.max(0, Math.min(1, Number(s.hpPct ?? 1))),
          shPct: Math.max(0, Math.min(1, Number(s.shPct ?? 1))),
          scattered: s.scattered !== false,
          updatedAtMs: Math.max(0, Math.floor(Number(s.updatedAtMs) || 0)),
        }));
    }
    return universe;
  } catch {
    return createUniverse();
  }
}
