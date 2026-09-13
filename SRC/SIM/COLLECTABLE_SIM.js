"use strict";

// Etat vivant des collectables : un slot stable par box ambiente + drops dynamiques.
// Miroir de UNIVERSE_SIM.js (NPC) : slots persistés, horloge monde réelle,
// respawn après délai même en cas de refresh / changement de map / mort.
// Pur (aucun DOM/Canvas/window) pour pouvoir tourner sur un futur serveur Node.

export const COLLECTABLE_STORE_KEY = "orbit_collectables_v1";
export const COLLECTABLE_STORE_VERSION = 1;
export const MAX_COLLECTABLE_MAPS_STORED = 64;
export const MAX_COLLECTABLE_SLOTS_PER_MAP = 1200; // Palladium 5-2 = 1000

export function createCollectableStore() {
  return { v: COLLECTABLE_STORE_VERSION, maps: {} };
}

function asFiniteNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function getMapEntry(store, mapId, create = false) {
  if (!store || typeof store !== "object") throw new Error("Store collectables invalide");
  if (!store.maps || typeof store.maps !== "object") store.maps = {};
  const id = String(mapId);
  if (!store.maps[id] && create) store.maps[id] = { slots: [], drops: [] };
  const entry = store.maps[id];
  if (!entry) return null;
  if (!Array.isArray(entry.slots)) entry.slots = [];
  if (!Array.isArray(entry.drops)) entry.drops = [];
  return entry;
}

// Cree ou reconcilie les slots ambientes d'une map SANS effacer l'etat vivant.
// defs : [{ type, x, y }] en ordre stable (type puis index). uid = `${type}#${index}`.
// - premier passage : slots alive aux positions données
// - passages suivants : preserve alive/takenAt/respawnAt/x/y, prune les defs retirées
export function ensureCollectableSlots(store, mapId, defs = [], nowMs = 0) {
  const id = String(mapId);
  const entry = getMapEntry(store, id, true);
  const list = Array.isArray(defs) ? defs.slice(0, MAX_COLLECTABLE_SLOTS_PER_MAP) : [];
  const prevByUid = new Map(entry.slots.map((s) => [String(s?.uid), s]));
  const seen = new Set();
  const next = [];
  const perType = new Map();
  for (const def of list) {
    const type = String(def?.type || "unknown");
    const index = perType.get(type) || 0;
    perType.set(type, index + 1);
    const uid = `${type}#${index}`;
    if (seen.has(uid)) continue;
    seen.add(uid);
    const old = prevByUid.get(uid);
    if (old && typeof old === "object" && String(old.type) === type) {
      if (typeof old.alive !== "boolean") old.alive = true;
      next.push(old);
      continue;
    }
    next.push({
      uid,
      type,
      x: asFiniteNumber(def?.x, 0),
      y: asFiniteNumber(def?.y, 0),
      alive: true,
      takenAtMs: 0,
      respawnAtMs: 0,
    });
  }
  entry.slots = next;

  const keys = Object.keys(store.maps);
  if (keys.length > MAX_COLLECTABLE_MAPS_STORED) {
    const drop = keys.length - MAX_COLLECTABLE_MAPS_STORED;
    for (let i = 0; i < drop; i++) delete store.maps[keys[i]];
  }
  return next;
}

export function getCollectableSlot(store, mapId, uid) {
  const entry = getMapEntry(store, mapId, false);
  if (!entry) return null;
  return entry.slots.find((s) => String(s?.uid) === String(uid)) || null;
}

// Vue lecture des slots d'une map (construction des defs côté moteur).
export function listCollectableSlots(store, mapId) {
  const entry = getMapEntry(store, mapId, false);
  if (!entry) return [];
  return entry.slots.slice();
}

export function countCollectableSlots(store, mapId, type) {
  return listCollectableSlots(store, mapId).filter((s) => String(s?.type) === String(type)).length;
}

// Drops survivants d'une map (restauration côté moteur).
export function listCollectableDrops(store, mapId) {
  const entry = getMapEntry(store, mapId, false);
  if (!entry) return [];
  return entry.drops.slice();
}

// Box ramassée : slot mort jusqu'à nowMs + delayMs (respawn monde continu).
export function takeCollectableSlot(store, mapId, uid, nowMs, delayMs = 0) {
  const slot = getCollectableSlot(store, mapId, uid);
  if (!slot) return null;
  const now = Math.floor(Number(nowMs) || 0);
  slot.alive = false;
  slot.takenAtMs = now;
  slot.respawnAtMs = now + Math.max(0, Number(delayMs) || 0);
  return slot;
}

// Slots morts dont le timer est dû (rattrape refresh/absence via horloge monde).
export function reviveDueCollectables(store, mapId, nowMs) {
  const entry = getMapEntry(store, mapId, false);
  if (!entry) return [];
  const now = Math.floor(Number(nowMs) || 0);
  const revived = [];
  for (const slot of entry.slots) {
    if (!slot || slot.alive !== false) continue;
    if (Number(slot.respawnAtMs) > 0 && now < Number(slot.respawnAtMs)) continue;
    slot.alive = true;
    slot.takenAtMs = 0;
    slot.respawnAtMs = 0;
    revived.push(slot);
  }
  return revived;
}

// Liste des slots dus (le moteur leur choisit une NOUVELLE position aléatoire).
export function dueCollectableSlots(store, mapId, nowMs) {
  const entry = getMapEntry(store, mapId, false);
  if (!entry) return [];
  const now = Math.floor(Number(nowMs) || 0);
  return entry.slots.filter(
    (s) => s && s.alive === false && !(Number(s.respawnAtMs) > 0 && now < Number(s.respawnAtMs))
  );
}

// Ranime un slot sur une nouvelle position (respawn aléatoire, comme les NPC).
export function reviveCollectableSlot(store, mapId, uid, x, y) {
  const slot = getCollectableSlot(store, mapId, uid);
  if (!slot) return null;
  if (Number.isFinite(Number(x))) slot.x = Number(x);
  if (Number.isFinite(Number(y))) slot.y = Number(y);
  slot.alive = true;
  slot.takenAtMs = 0;
  slot.respawnAtMs = 0;
  return slot;
}

// Drops dynamiques (cargo / assemblage, à durée de vie) : { uid, type, x, y, amount, fromNpc, expiresAtMs }.
export function addCollectableDrop(store, mapId, drop = {}, nowMs = 0) {
  const entry = getMapEntry(store, String(mapId), true);
  const uid = String(drop?.uid || `${String(drop?.type || "drop")}#${Date.now()}#${entry.drops.length}`);
  const record = {
    uid,
    type: String(drop?.type || "Cargo_Box"),
    x: asFiniteNumber(drop?.x, 0),
    y: asFiniteNumber(drop?.y, 0),
    amount: Math.max(0, Math.floor(Number(drop?.amount) || 0)) || null,
    fromNpc: drop?.fromNpc != null ? String(drop.fromNpc) : null,
    expiresAtMs: Math.max(0, Math.floor(Number(drop?.expiresAtMs) || 0)),
  };
  entry.drops.push(record);
  return record;
}

export function removeCollectableDrop(store, mapId, uid) {
  const entry = getMapEntry(store, mapId, false);
  if (!entry) return false;
  const idx = entry.drops.findIndex((d) => String(d?.uid) === String(uid));
  if (idx < 0) return false;
  entry.drops.splice(idx, 1);
  return true;
}

// Drops expirés (rattrape refresh/absence). Retourne les survivants.
export function pruneExpiredDrops(store, mapId, nowMs) {
  const entry = getMapEntry(store, mapId, false);
  if (!entry) return [];
  const now = Math.floor(Number(nowMs) || 0);
  entry.drops = entry.drops.filter((d) => {
    if (!d) return false;
    const exp = Math.floor(Number(d.expiresAtMs) || 0);
    return !(exp > 0 && now >= exp);
  });
  return entry.drops;
}

export function serializeCollectableStore(store) {
  return JSON.stringify({ v: COLLECTABLE_STORE_VERSION, maps: store?.maps || {} });
}

export function deserializeCollectableStore(raw) {
  if (raw == null || raw === "") return createCollectableStore();
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!parsed || typeof parsed !== "object" || typeof parsed.maps !== "object") return createCollectableStore();
    if (Number(parsed.v) !== COLLECTABLE_STORE_VERSION) return createCollectableStore();
    const store = createCollectableStore();
    for (const [mapId, entry] of Object.entries(parsed.maps)) {
      if (!entry || typeof entry !== "object") continue;
      store.maps[String(mapId)] = {
        slots: (Array.isArray(entry.slots) ? entry.slots : [])
          .filter((s) => s && typeof s.uid === "string" && typeof s.type === "string")
          .slice(0, MAX_COLLECTABLE_SLOTS_PER_MAP)
          .map((s) => ({
            uid: String(s.uid),
            type: String(s.type),
            x: asFiniteNumber(s.x, 0),
            y: asFiniteNumber(s.y, 0),
            alive: s.alive !== false,
            takenAtMs: Math.max(0, Math.floor(Number(s.takenAtMs) || 0)),
            respawnAtMs: Math.max(0, Math.floor(Number(s.respawnAtMs) || 0)),
          })),
        drops: (Array.isArray(entry.drops) ? entry.drops : [])
          .filter((d) => d && typeof d.uid === "string")
          .slice(0, MAX_COLLECTABLE_SLOTS_PER_MAP)
          .map((d) => ({
            uid: String(d.uid),
            type: String(d.type || "Cargo_Box"),
            x: asFiniteNumber(d.x, 0),
            y: asFiniteNumber(d.y, 0),
            amount: Math.max(0, Math.floor(Number(d.amount) || 0)) || null,
            fromNpc: d.fromNpc != null ? String(d.fromNpc) : null,
            expiresAtMs: Math.max(0, Math.floor(Number(d.expiresAtMs) || 0)),
          })),
      };
    }
    return store;
  } catch {
    return createCollectableStore();
  }
}
