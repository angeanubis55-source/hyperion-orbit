// SRC/CORE/ACCOUNT.js
"use strict";

import { findCatalogItem } from "./CATALOG.js";
import { SHIP_PACKS, getShipDesignBaseId, getShipPackById, getShipFamilyId } from "../../SHIP/SHIP_PACKS.js";
import { normalizeQuestState, QUEST_DEFINITIONS } from "../../QUEST/QUEST_TYPES.js";
import { calculateRankPoints, getQuestHonorReward } from "./PROGRESSION.js";
import { getFaction, getFactionBaseSpawn, normalizeFactionId } from "./FACTIONS.js";
import { compactFitArray, compactFitDraft, compactPetFit } from "./FIT_LAYOUT.js";
import { resizeShield } from "./EQUIPMENT_SYNC.js";
import { completeActiveGalaxyGate, consumeBuiltGalaxyGate, deployBuiltGalaxyGate, GALAXY_GATE_DEFINITIONS, loseGalaxyGateLife, normalizeGalaxyGateState, palladiumExchangeForEnergy, PALLADIUM_PER_GALAXY_ENERGY, setGalaxyGateMultiplierArmed, spinGalaxyGate } from "./GALAXY_GATES.js";
import { getCraftingRecipe, CRAFTING_ENABLED } from "../DATA/CRAFTING.js";
import { getRefineryRecipe, refineOreOutput, ORE_SELL_PRICES, UPGRADE_SLOT_ORES } from "../DATA/RESOURCES.js";
import { ROCKET_TYPES } from "../../COMBAT/ROCKET_TYPES.js";
import { createDrone, DRONE_FORMATIONS, DRONE_LEVEL_XP, DRONE_MAX_LEVEL, DRONE_TYPES, getDroneLevel, getIrisPrice, MAX_IRIS_DRONES, SPECIAL_DRONE_PRICE } from "../../DRONE/DRONE_TYPES.js";
import { createPet, emptyPetFit, getPetLevel, getPetMaxHp, getPetSlots, getPetShieldBonus, normalizePetMode, normalizePetPseudo, PET_DEFAULT_PSEUDO, PET_FUEL_MAX, PET_SLOTS } from "../../PET/PET_TYPES.js";
import { getBooster, normalizeBoostersState } from "../DATA/BOOSTERS.js";

// localStorage keys
const USERS_KEY = "orbit_users";
const CUR_KEY = "orbit_current_user";
const STORAGE_SCHEMA_VERSION = 4;
const STARTER_CREDITS = 1000000;
const NPC_KILL_BREAKDOWN_VERSION = 1;
const QUEST_HONOR_VERSION = 1;
const GALAXY_GATE_DATA_RESET_VERSION = 1;

const STARTER_SHIP_ID = "PhoenixBleu";

// FIT slots (fallback)
const FIT_SLOTS = {
  lasers: 15,
  gens: 15, // vitesse OU bouclier dans les mêmes slots
  extras: 15,
};

// ---------------------------
// storage helpers
// ---------------------------
function safeParse(raw, fallback) {
  try {
    const v = JSON.parse(raw);
    return v ?? fallback;
  } catch {
    return fallback;
  }
}

function readUsers() {
  const raw = localStorage.getItem(USERS_KEY);
  // Cache mémoire : évite un JSON.parse de ~1.6MB à chaque lecture
  // (getCurrentUserFull est appelé à chaque frame de sauvegarde).
  if (raw === readUsers._raw && Array.isArray(readUsers._cache)) return readUsers._cache;
  const arr = safeParse(raw, []);
  const list = Array.isArray(arr) ? arr.filter((u) => u && typeof u === "object") : [];
  readUsers._raw = raw;
  readUsers._cache = list;
  return list;
}

function writeUsers(users) {
  const list = Array.isArray(users) ? users : [];
  // Borne l'historique de roulette avant sérialisation : c'est ce qui
  // faisait gonfler orbit_users à 1.6MB -> 600ms de freeze par save.
  // Plafond large (500) : tout l'historique utile est comptabilisé.
  for (const u of list) {
    if (u && Array.isArray(u.inventory?.moduleRollHistory) && u.inventory.moduleRollHistory.length > 500) {
      u.inventory.moduleRollHistory = u.inventory.moduleRollHistory.slice(-500);
    }
  }
  // X1 infini : JSON.stringify(Infinity) donnerait null (corruption au reload).
  // On stocke -1 comme sentinel, relu comme Infinity dans ensureUserShape.
  const raw = JSON.stringify(list, (k, v) => (v === Infinity ? -1 : v));
  localStorage.setItem(USERS_KEY, raw);
  readUsers._raw = raw;
  readUsers._cache = list;
}

function readCurrent() {
  const cur = safeParse(localStorage.getItem(CUR_KEY), null);
  // Validation schéma minimale : sans id valide, on ignore (save corrompue / manuelle).
  if (!cur || typeof cur !== "object" || Array.isArray(cur)) return null;
  if (typeof cur.id !== "string" || !cur.id) return null;
  if (cur.pseudo != null && typeof cur.pseudo !== "string") return null;
  if (cur.email != null && typeof cur.email !== "string") return null;
  return cur;
}

function writeCurrent(cur) {
  if (!cur) localStorage.removeItem(CUR_KEY);
  else localStorage.setItem(CUR_KEY, JSON.stringify(cur));
}

function norm(s) {
  return String(s ?? "").trim().toLowerCase();
}

function uuid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return "u_" + Math.random().toString(16).slice(2) + Date.now().toString(16);
}

// ---------------------------
// password local : SHA-256 + salt, sync (pas de bcrypt côté client).
// Format stocké : "v1$salt$hex". Les anciens mots en clair sont migrés au login.
// Cela évite le clair dans localStorage, mais ne remplace pas un serveur autoritaire.
// ---------------------------
function randomSaltHex(bytes = 16) {
  try {
    const buf = new Uint8Array(bytes);
    if (globalThis.crypto?.getRandomValues) {
      globalThis.crypto.getRandomValues(buf);
      return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
    }
  } catch {}
  let s = "";
  for (let i = 0; i < bytes; i++) s += Math.floor(Math.random() * 256).toString(16).padStart(2, "0");
  return s;
}

function sha256HexSync(str) {
  const bytes = new TextEncoder().encode(String(str ?? ""));
  const K = [0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
  let h0=0x6a09e667,h1=0xbb67ae85,h2=0x3c6ef372,h3=0xa54ff53a,h4=0x510e527f,h5=0x9b05688c,h6=0x1f83d9ab,h7=0x5be0cd19;
  const bitLen = bytes.length * 8;
  const withPad = (((bytes.length + 8) >> 6) + 1) * 64;
  const padded = new Uint8Array(withPad);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const dv = new DataView(padded.buffer);
  dv.setUint32(withPad - 4, bitLen >>> 0, false);
  dv.setUint32(withPad - 8, Math.floor(bitLen / 4294967296), false);
  const w = new Uint32Array(64);
  const rotr = (x, n) => (x >>> n) | (x << (32 - n));
  for (let off = 0; off < withPad; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4, false);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i-15],7) ^ rotr(w[i-15],18) ^ (w[i-15] >>> 3);
      const s1 = rotr(w[i-2],17) ^ rotr(w[i-2],19) ^ (w[i-2] >>> 10);
      w[i] = (w[i-16] + s0 + w[i-7] + s1) | 0;
    }
    let a=h0,b=h1,c=h2,d=h3,e=h4,f=h5,g=h6,h=h7;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e,6) ^ rotr(e,11) ^ rotr(e,25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K[i] + w[i]) | 0;
      const S0 = rotr(a,2) ^ rotr(a,13) ^ rotr(a,22);
      const mj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + mj) | 0;
      h=g; g=f; f=e; e=(d+t1)|0; d=c; c=b; b=a; a=(t1+t2)|0;
    }
    h0=(h0+a)|0; h1=(h1+b)|0; h2=(h2+c)|0; h3=(h3+d)|0; h4=(h4+e)|0; h5=(h5+f)|0; h6=(h6+g)|0; h7=(h7+h)|0;
  }
  const toHex = (x) => (x >>> 0).toString(16).padStart(8, "0");
  return toHex(h0)+toHex(h1)+toHex(h2)+toHex(h3)+toHex(h4)+toHex(h5)+toHex(h6)+toHex(h7);
}

function isPasswordHash(v) {
  return typeof v === "string" && v.startsWith("v1$");
}

function createPasswordHash(plain) {
  const salt = randomSaltHex(16);
  return `v1$${salt}$${sha256HexSync(`${salt}::${String(plain ?? "")}`)}`;
}

function verifyPassword(stored, candidate) {
  const c = String(candidate ?? "");
  if (isPasswordHash(stored)) {
    const [, salt, hex] = String(stored).split("$");
    if (!salt || !hex) return false;
    return sha256HexSync(`${salt}::${c}`) === hex;
  }
  // Legacy : clair. Comparaison directe pour migration au login.
  return String(stored ?? "") === c;
}

// ---------------------------
// model helpers (migration)
// ---------------------------
function defaultAmmo() {
  // x1 = infini (laser de base)
  return {
    x1: Infinity,
    x2: 0,
    x3: 0,
    x4: 0,
    x6: 0,
    sab: 0,

    // munitions lasers spéciales (boutique)
    rcb: 0,
    cbo: 0,
    job: 0,
    rb: 0,
    pib: 0,
    idb: 0,
    vb: 0,
    emaa: 0,
    sbl: 0,
    abl: 0,

    // nouveaux types
    ABL: 0,
    RADION: 0,
  };
}

function makeHangar(shipId, active = false) {
  return {
    id: "h_" + shipId + "_" + Date.now() + "_" + Math.random().toString(16).slice(2),
    shipId,
    active: !!active,

    // ancien modèle (compat)
    modules: {
      speed: null,
      shield: null,
      laser: null,
      extras: [],
    },

    // Position sauvegardée (null = jamais joué = centre de la base de firme)
    lastPos: null, // { x:number, y:number } | null

    // Map sauvegardée (null = jamais joué = map par défaut "1-1")
    lastMap: null, // string | null

    // nouveau modèle (fit) ajouté dans ensureUserShape()
    // fit: { lasers:[], gens:[], extras:[], shipMods:[] }
  };
}

function normalizeArraySize(arr, size, fill = null) {
  const out = Array.isArray(arr) ? arr.slice(0, size) : [];
  while (out.length < size) out.push(fill);
  return out;
}

function getShipPack(shipId) {
  return getShipPackById(shipId);
}

function getShipSlots(shipId) {
  const p = getShipPack(shipId);
  const s = p?.slots || null;
  return {
    lasers: Number(s?.lasers ?? FIT_SLOTS.lasers),
    gens: Number(s?.gens ?? FIT_SLOTS.gens),
    extras: Number(s?.extras ?? FIT_SLOTS.extras),
    shipMods: Number(s?.shipMods ?? 1),
  };
}

function makeEmptyFit(shipId) {
  const slots = getShipSlots(shipId);

  return {
    lasers: Array(slots.lasers).fill(null),
    gens: Array(slots.gens).fill(null),
    extras: Array(slots.extras).fill(null),
    shipMods: Array(slots.shipMods).fill(null),
  };
}

function normalizeFitForShip(shipId, fit) {
  const slots = getShipSlots(shipId);

  return compactFitDraft({
    lasers: normalizeArraySize(fit?.lasers, slots.lasers, null),
    gens: normalizeArraySize(fit?.gens, slots.gens, null),
    extras: normalizeArraySize(fit?.extras, slots.extras, null),
    shipMods: normalizeArraySize(fit?.shipMods, slots.shipMods, null),
  }, slots);
}

function getHangarActiveConfigNo(h) {
  return Number(h?.activeConfig) === 2 ? 2 : 1;
}

function getHangarActiveFit(h) {
  const cfg = String(getHangarActiveConfigNo(h));
  return h?.fits?.[cfg] || h?.fit || null;
}

function normalizeDroneFitValue(value, slots) {
  const size = Math.max(0, Math.floor(Number(slots) || 0));
  // Comme le vaisseau : aucun trou, tout poussé en haut à gauche.
  const equipment = compactFitArray(normalizeArraySize(value?.equipment, size, null), size);
  return {
    equipment,
    ability: value?.ability || null,
  };
}

/**
 * Fit d'un drone pour un hangar + config donnés.
 * Fallback legacy (drone.fits / drone.fit) pour les vieilles sauvegardes.
 */
export function getDroneFit(drone, hangarId, configNo) {
  const cfg = String(Number(configNo) === 2 ? 2 : 1);
  const hid = hangarId != null ? String(hangarId) : null;
  if (hid && drone?.fitsByHangar?.[hid]?.[cfg]) return drone.fitsByHangar[hid][cfg];
  if (hid && drone?.fitsByHangar?.[hid]?.[cfg] === undefined && drone?.fitsByHangar?.[hid]) {
    return drone.fitsByHangar[hid][cfg] || { equipment: [], ability: null };
  }
  // legacy global par config
  if (drone?.fits?.[cfg]) return drone.fits[cfg];
  if (drone?.fit) return drone.fit;
  return { equipment: [], ability: null };
}

function ensureDroneFitsByHangar(u) {
  const hangars = Array.isArray(u.hangars) ? u.hangars.filter(Boolean) : [];
  if (!u.drones || typeof u.drones !== "object") u.drones = {};
  if (!Array.isArray(u.drones.items)) u.drones.items = [];
  if (!hangars.length) return;
  const activeHangar = u.hangars.find((h) => h?.active) || hangars[0] || null;
  const activeCfg = String(Number(activeHangar?.activeConfig) === 2 ? 2 : 1);
  for (const drone of u.drones.items) {
    const definition = DRONE_TYPES[drone?.type];
    if (!definition) continue;
    const slots = Number(definition.slots) || 0;
    const legacyFits = drone.fits && typeof drone.fits === "object" ? drone.fits : {};
    const legacyFit = drone.fit && typeof drone.fit === "object" ? drone.fit : {};
    if (!drone.fitsByHangar || typeof drone.fitsByHangar !== "object" || Array.isArray(drone.fitsByHangar)) {
      drone.fitsByHangar = {};
    }
    const hasAnyHangarKey = Object.keys(drone.fitsByHangar).some((k) => hangars.some((h) => String(h?.id) === String(k)));
    if (!hasAnyHangarKey) {
      // Première migration : l'équipement existant reste sur le hangar actif,
      // les autres hangars partent vides (exclusivité par vaisseau).
      for (const h of hangars) {
        const hid = String(h.id);
        const isActive = activeHangar && String(h.id) === String(activeHangar.id);
        if (isActive) {
          drone.fitsByHangar[hid] = {
            "1": normalizeDroneFitValue(legacyFits["1"] || (activeCfg === "1" ? legacyFit : {}), slots),
            "2": normalizeDroneFitValue(legacyFits["2"] || (activeCfg === "2" ? legacyFit : {}), slots),
          };
        } else {
          drone.fitsByHangar[hid] = {
            "1": normalizeDroneFitValue({}, slots),
            "2": normalizeDroneFitValue({}, slots),
          };
        }
      }
    } else {
      for (const h of hangars) {
        const hid = String(h.id);
        const cur = drone.fitsByHangar[hid];
        if (!cur || typeof cur !== "object") {
          drone.fitsByHangar[hid] = {
            "1": normalizeDroneFitValue({}, slots),
            "2": normalizeDroneFitValue({}, slots),
          };
        } else {
          drone.fitsByHangar[hid] = {
            "1": normalizeDroneFitValue(cur["1"], slots),
            "2": normalizeDroneFitValue(cur["2"], slots),
          };
        }
      }
      for (const key of Object.keys(drone.fitsByHangar)) {
        if (!hangars.some((h) => String(h?.id) === String(key))) delete drone.fitsByHangar[key];
      }
    }
    if (activeHangar) {
      const hid = String(activeHangar.id);
      const perHangar = drone.fitsByHangar[hid] || {};
      perHangar["1"] = normalizeDroneFitValue(perHangar["1"], slots);
      perHangar["2"] = normalizeDroneFitValue(perHangar["2"], slots);
      drone.fitsByHangar[hid] = perHangar;
      // Miroir legacy : le code qui lit drone.fit / drone.fits voit le hangar actif.
      drone.fits = perHangar;
      drone.fit = perHangar[activeCfg] || perHangar["1"];
    }
  }
}

/**
 * Fit du P.E.T pour un hangar + config donnés (exclusif par vaisseau, comme les drones).
 * Fallback legacy (pet.fits / pet.fit, ancien format {equipment}) pour les vieilles sauvegardes.
 */
export function getPetFit(pet, hangarId, configNo) {
  const cfg = String(Number(configNo) === 2 ? 2 : 1);
  const hid = hangarId != null ? String(hangarId) : null;
  const level = getPetLevel(pet?.exp);
  if (hid && pet?.fitsByHangar?.[hid]?.[cfg]) return pet.fitsByHangar[hid][cfg];
  if (hid && pet?.fitsByHangar?.[hid]) {
    return pet.fitsByHangar[hid][cfg] || emptyPetFit(level);
  }
  if (pet?.fits?.[cfg]) return pet.fits[cfg];
  if (pet?.fit) return pet.fit;
  return emptyPetFit(level);
}

function petFitSlotError(itemId, group, petLevel) {
  const it = findCatalogItem(itemId);
  if (!it) return "Objet introuvable.";
  if (group === "lasers" && it?.module?.type !== "laser") return "Emplacement laser : laser uniquement.";
  if (group === "generators" && it?.module?.type !== "shield") return "Emplacement générateur : bouclier uniquement.";
  if (group === "gears") {
    if (!it?.petGear) return "Emplacement gear : gear P.E.T uniquement.";
    const req = Math.max(0, Number(it.petLevel) || 0);
    if (petLevel < req) return `Ce gear exige le P.E.T niveau ${req}.`;
    return null;
  }
  if (group === "protocols") {
    if (!it?.petProtocol) return "Emplacement protocole : protocole P.E.T uniquement.";
    const req = Math.max(0, Number(it.petLevel) || 0);
    if (petLevel < req) return `Ce protocole exige le P.E.T niveau ${req}.`;
  }
  return null;
}

function normalizePetFitValue(value, level = 0) {
  const slots = getPetSlots(level);
  const raw = {
    lasers: normalizeArraySize(value?.lasers, slots.lasers, null),
    generators: normalizeArraySize(value?.generators, slots.generators, null),
    gears: normalizeArraySize(value?.gears, slots.gears, null),
    protocols: normalizeArraySize(value?.protocols, slots.protocols, null),
    ability: value?.ability || null,
  };
  // Migration ancien format {equipment:[...]} : lasers → lasers, boucliers → générateurs.
  if (Array.isArray(value?.equipment) && !Array.isArray(value?.lasers) && !Array.isArray(value?.generators)) {
    for (const id of value.equipment) {
      if (!id) continue;
      const t = findCatalogItem(id)?.module?.type;
      if (t === "laser" && raw.lasers.includes(null)) raw.lasers[raw.lasers.indexOf(null)] = id;
      else if (t === "shield" && raw.generators.includes(null)) raw.generators[raw.generators.indexOf(null)] = id;
    }
  }
  // Comme le vaisseau : aucun trou, tout poussé en haut à gauche dans chaque groupe.
  return compactPetFit(raw, slots);
}

function ensurePetFitsByHangar(u) {
  if (!u?.pet || u.pet.owned !== true) return;
  const hangars = Array.isArray(u.hangars) ? u.hangars.filter(Boolean) : [];
  if (!hangars.length) return;
  const activeHangar = u.hangars.find((h) => h?.active) || hangars[0] || null;
  const activeCfg = String(Number(activeHangar?.activeConfig) === 2 ? 2 : 1);
  const pet = u.pet;
  const level = getPetLevel(pet.exp);
  const legacyFits = pet.fits && typeof pet.fits === "object" ? pet.fits : {};
  const legacyFit = pet.fit && typeof pet.fit === "object" ? pet.fit : {};
  if (!pet.fitsByHangar || typeof pet.fitsByHangar !== "object" || Array.isArray(pet.fitsByHangar)) {
    pet.fitsByHangar = {};
  }
  const hasAnyHangarKey = Object.keys(pet.fitsByHangar).some((k) => hangars.some((h) => String(h?.id) === String(k)));
  if (!hasAnyHangarKey) {
    for (const h of hangars) {
      const hid = String(h.id);
      const isActive = activeHangar && String(h.id) === String(activeHangar.id);
      if (isActive) {
        pet.fitsByHangar[hid] = {
          1: normalizePetFitValue(legacyFits["1"] || (activeCfg === "1" ? legacyFit : {}), level),
          2: normalizePetFitValue(legacyFits["2"] || (activeCfg === "2" ? legacyFit : {}), level),
        };
      } else {
        pet.fitsByHangar[hid] = { 1: normalizePetFitValue({}, level), 2: normalizePetFitValue({}, level) };
      }
    }
  } else {
    for (const h of hangars) {
      const hid = String(h.id);
      const cur = pet.fitsByHangar[hid];
      if (!cur || typeof cur !== "object") {
        pet.fitsByHangar[hid] = { 1: normalizePetFitValue({}, level), 2: normalizePetFitValue({}, level) };
      } else {
        pet.fitsByHangar[hid] = { 1: normalizePetFitValue(cur["1"], level), 2: normalizePetFitValue(cur["2"], level) };
      }
    }
    for (const key of Object.keys(pet.fitsByHangar)) {
      if (!hangars.some((h) => String(h?.id) === String(key))) delete pet.fitsByHangar[key];
    }
  }
  if (activeHangar) {
    const hid = String(activeHangar.id);
    const perHangar = pet.fitsByHangar[hid] || {};
    perHangar["1"] = normalizePetFitValue(perHangar["1"], level);
    perHangar["2"] = normalizePetFitValue(perHangar["2"], level);
    pet.fitsByHangar[hid] = perHangar;
    pet.fits = perHangar;
    pet.fit = perHangar[activeCfg] || perHangar["1"];
  }
}

// Migration doublon starter : "PhoenixBleu" (legacy) et "phoenix_bleu"
// désignent le même vaisseau. Normalise les ids au canonique et déduplique
// les hangars par base (garde l'actif).
export function normalizeStarterShipIds(u) {
  if (!u || typeof u !== "object") return u;
  const canonical = (sid) => String(getShipPackById(sid)?.id || sid);
  const baseOf = (sid) => {
    const id = canonical(sid);
    return getShipDesignBaseId(id) || id;
  };
  if (Array.isArray(u.inventory?.ships)) {
    const seen = new Set();
    u.inventory.ships = u.inventory.ships.map(canonical).filter((sid) => {
      const key = String(sid).toLowerCase();
      if (!sid || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
  if (Array.isArray(u.inventory?.shipDesigns)) {
    const seen = new Set();
    u.inventory.shipDesigns = u.inventory.shipDesigns.map(canonical).filter((sid) => {
      const key = String(sid).toLowerCase();
      if (!sid || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
  if (u.ship) u.ship = canonical(u.ship);
  if (Array.isArray(u.hangars)) {
    for (const h of u.hangars) {
      if (h && typeof h === "object" && h.shipId) h.shipId = canonical(h.shipId);
    }
    // Déduplique par base en gardant l'ordre ; en cas de conflit, l'actif gagne.
    const winnerByBase = new Map();
    for (const h of u.hangars) {
      if (!h || typeof h !== "object") continue;
      const base = String(baseOf(h.shipId)).toLowerCase();
      const prev = winnerByBase.get(base);
      if (!prev || (h.active === true && prev.active !== true)) winnerByBase.set(base, h);
    }
    u.hangars = u.hangars.filter((h) => h && winnerByBase.get(String(baseOf(h.shipId)).toLowerCase()) === h);
    if (!u.hangars.some((h) => h?.active) && u.hangars.length) u.hangars[0].active = true;
  }
  return u;
}

// Items retirés du jeu (anciennes sauvegardes) : purge exacte, sans motif large.
const REMOVED_ITEM_IDS = new Set([  "shd_mk4",
  "gear_grl1",
  "gear_grl2",
  "gear_grl3",
  "gear_grt1",
  "spd_mk4",
  "laser_radion",
  "shd_radion",
  "spd_radion",
  "laser_anchorlock",
  "radion",
]);

function isRemovedItemId(value) {
  return typeof value === "string" && REMOVED_ITEM_IDS.has(value.toLowerCase());
}

// Purge les items retirés du jeu : counts, modules, équipés, munitions.
// Tourne à chaque chargement (migration monde continu des vieux comptes).
export function purgeRemovedItemIds(u) {
  if (!u || typeof u !== "object") return u;
  const counts = u.inventory?.counts;
  if (counts && typeof counts === "object") {
    for (const key of Object.keys(counts)) {
      if (isRemovedItemId(key)) delete counts[key];
    }
  }
  if (Array.isArray(u.inventory?.shipModules)) {
    u.inventory.shipModules = u.inventory.shipModules.filter((m) => !isRemovedItemId(m?.id));
  }
  if (Array.isArray(u.inventory?.modules)) {
    u.inventory.modules = u.inventory.modules.filter((id) => !isRemovedItemId(id));
  }
  const cleanFitArrays = (fit) => {
    if (!fit || typeof fit !== "object") return;
    for (const key of ["lasers", "gens", "generators", "extras", "equipment", "gears", "protocols", "shipMods"]) {
      if (Array.isArray(fit[key])) {
        fit[key] = fit[key].map((id) => (isRemovedItemId(id) ? null : id));
      }
    }
  };
  for (const h of u.hangars || []) {
    if (!h || typeof h !== "object") continue;
    for (const key of ["speed", "shield", "laser"]) {
      if (typeof h.modules?.[key] === "string" && isRemovedItemId(h.modules[key])) h.modules[key] = null;
    }
    for (const cfg of ["1", "2"]) cleanFitArrays(h.fits?.[cfg]);
    cleanFitArrays(h.fit);
  }
  for (const drone of u.drones?.items || []) {
    if (!drone || typeof drone !== "object") continue;
    for (const holder of [drone.fitsByHangar, drone.fits]) {
      if (!holder || typeof holder !== "object") continue;
      for (const sub of Object.values(holder)) {
        if (sub && typeof sub === "object") {
          if (Array.isArray(sub)) sub.forEach(cleanFitArrays);
          else cleanFitArrays(sub);
        }
      }
    }
    cleanFitArrays(drone.fit);
  }
  const pet = u.pet;
  if (pet && typeof pet === "object") {
    for (const holder of [pet.fitsByHangar, pet.fits]) {
      if (!holder || typeof holder !== "object") continue;
      for (const sub of Object.values(holder)) {
        if (sub && typeof sub === "object") {
          if (Array.isArray(sub)) sub.forEach(cleanFitArrays);
          else cleanFitArrays(sub);
        }
      }
    }
    cleanFitArrays(pet.fit);
  }
  if (u.ammo && typeof u.ammo === "object") {
    for (const key of Object.keys(u.ammo)) {
      if (isRemovedItemId(key)) u.ammo[key] = 0;
    }
  }
  return u;
}

function ensureUserShape(u) {
  if (!u || typeof u !== "object") return null;

  if (!u.id) u.id = uuid();
  u.pseudo = String(u.pseudo || "Player").trim().slice(0, 32) || "Player";
  u.email = String(u.email || `${u.pseudo}@local`).trim().slice(0, 254);
  u.faction = normalizeFactionId(u.faction);
  if (!u.createdAt) u.createdAt = Date.now();
  u.schemaVersion = STORAGE_SCHEMA_VERSION;
  u.updatedAt = Number.isFinite(Number(u.updatedAt)) ? Number(u.updatedAt) : Date.now();

  u.credits = Number(u.credits);
  if (!Number.isFinite(u.credits)) u.credits = 0;
  u.credits = Math.max(0, Math.floor(u.credits));
  const currentUserId = readCurrent()?.id;
  const mustResetGalaxyGates = String(currentUserId || "") === String(u.id)
    && Number(u._galaxyGateDataResetVersion || 0) < GALAXY_GATE_DATA_RESET_VERSION;
  u.galaxyGates = normalizeGalaxyGateState(mustResetGalaxyGates ? null : u.galaxyGates);
  if (mustResetGalaxyGates) u._galaxyGateDataResetVersion = GALAXY_GATE_DATA_RESET_VERSION;

  // starter credits (une seule fois)
  if (!u._starterCreditsGiven) {
    if (u.credits <= 0) u.credits = STARTER_CREDITS;
    u._starterCreditsGiven = true;
  }

  // ammo
  if (!u.ammo || typeof u.ammo !== "object") u.ammo = defaultAmmo();
  // Sentinel stockage : -1, null (ancien JSON Infinity->null), "Infinity"/"∞" => infini en mémoire.
  if (u.ammo.x1 === -1 || u.ammo.x1 == null || u.ammo.x1 === "Infinity" || u.ammo.x1 === "∞") u.ammo.x1 = Infinity;
  u.ammo.x1 = Infinity;

  // normalise les munitions connues
  const AMMO_KEYS = ["x2", "x3", "x4", "x6", "sab", "rcb", "cbo", "job", "rb", "pib", "idb", "vb", "emaa", "sbl", "abl", "ABL", "RADION"];
  for (const k of AMMO_KEYS) {
    u.ammo[k] = Math.max(0, Number(u.ammo[k] || 0));
  }

  // Sélection munition du dock rapide (persistée comme rocketActive).
  // Fallback compat : ancienne sauvegarde avec ammo.active embarqué.
  const VALID_ACTIVE_AMMO = ["x1", "x2", "x3", "x4", "x6", "sab", "rcb", "cbo", "job", "rb", "pib", "idb", "vb", "emaa", "sbl", "abl"];
  const rawAmmoActive = String(u.ammoActive ?? u.ammo?.active ?? "x1").toLowerCase();
  u.ammoActive = VALID_ACTIVE_AMMO.includes(rawAmmoActive) ? rawAmmoActive : "x1";
  u.ammo.active = u.ammoActive;
  // Sans stock, retombe sur x1 (infini).
  if (u.ammoActive !== "x1" && !(Number(u.ammo[u.ammoActive] || 0) > 0)) {
    u.ammoActive = "x1";
    u.ammo.active = "x1";
  }

  // roquettes (stock consommable, lance-roquettes natif au vaisseau)
  if (!u.rockets || typeof u.rockets !== "object" || Array.isArray(u.rockets)) u.rockets = {};
  for (const id of Object.keys(ROCKET_TYPES)) {
    u.rockets[id] = Math.max(0, Math.floor(Number(u.rockets[id] || 0)));
  }
  if (!ROCKET_TYPES[String(u.rocketActive || "").toLowerCase()]) u.rocketActive = "r310";
  u.rocketAuto = u.rocketAuto === true;
  if (!ROCKET_TYPES[String(u.launcherActive || "").toLowerCase()]) u.launcherActive = "eco10";
  u.launcherAuto = u.launcherAuto === true;

  // boosters (stock + effets actifs avec expiration)
  u.boosters = normalizeBoostersState(u.boosters);

  // stats
  if (!u.stats || typeof u.stats !== "object") u.stats = {};
  u.stats.honor ??= 0;
  u.stats.exp ??= 0;
  u.stats.rankPoints ??= 0;
  u.stats.lifetimeKills ??= 0;
  if (!u.stats.npcKills || typeof u.stats.npcKills !== "object" || Array.isArray(u.stats.npcKills)) u.stats.npcKills = {};
  if (Number(u.stats.npcKillBreakdownVersion || 0) < NPC_KILL_BREAKDOWN_VERSION) {
    u.stats.lifetimeKills = 0;
    u.stats.npcKills = {};
    u.stats.npcKillBreakdownVersion = NPC_KILL_BREAKDOWN_VERSION;
  }

  if (!u.drones || typeof u.drones !== "object") u.drones = {};
  if (!Array.isArray(u.drones.items)) u.drones.items = [];
  u.drones.items = u.drones.items.filter(drone => DRONE_TYPES[drone?.type]).map((drone, index) => {
    const definition = DRONE_TYPES[drone.type];
    const exp = Math.max(0, Number(drone.exp) || 0);
    const fit = drone.fit && typeof drone.fit === "object" ? drone.fit : {};
    const fits = drone.fits && typeof drone.fits === "object" ? drone.fits : {};
    const normalizedFit = (value) => ({
      equipment: normalizeArraySize(value?.equipment, definition.slots),
      ability: value?.ability || null,
    });
    const prevFitsByHangar = drone.fitsByHangar && typeof drone.fitsByHangar === "object" && !Array.isArray(drone.fitsByHangar)
      ? drone.fitsByHangar
      : null;
    return {
      id: String(drone.id || `drone_${u.id}_${index}`), type: drone.type, exp,
      level: getDroneLevel(exp),
      fits: { "1": normalizedFit(fits["1"] || fit), "2": normalizedFit(fits["2"] || {}) },
      fit: normalizedFit(fits[String(Number(u.hangars?.find(h => h?.active)?.activeConfig) === 2 ? 2 : 1)] || fit),
      ...(prevFitsByHangar ? { fitsByHangar: prevFitsByHangar } : {}),
    };
  });
  if (!Array.isArray(u.drones.formations)) u.drones.formations = [];
  u.drones.formations = [...new Set(u.drones.formations.filter(id => DRONE_FORMATIONS.some(formation => formation.id === id)))];
  if (!Array.isArray(u.drones.designs)) u.drones.designs = [];
  u.drones.designs = u.drones.designs
    .filter(design => typeof design === "string" || (design && typeof design === "object"))
    .map(design => typeof design === "string" ? design : structuredClone(design));
  if (!u.drones.formations.includes("standard")) u.drones.formations.unshift("standard");
  if (!u.drones.activeFormation || !u.drones.formations.includes(u.drones.activeFormation)) u.drones.activeFormation = "standard";
  u.drones.lastFormationChangeAt = Math.max(0, Number(u.drones.lastFormationChangeAt) || 0);
  for (const [type, count] of Object.entries(u.stats.npcKills)) {
    u.stats.npcKills[type] = Math.max(0, Math.floor(Number(count) || 0));
  }
  u.stats.lifetimeKills = Object.values(u.stats.npcKills).reduce((total, count) => total + Math.max(0, Number(count) || 0), 0);
  u.stats.rankPoints = calculateRankPoints(u.stats);

  // P.E.T : possédé une seule fois (unique comme un vaisseau).
  // XP officielle : 5 % de l'XP du vaisseau, niveaux 0 → 20.
  if (!u.pet || typeof u.pet !== "object" || Array.isArray(u.pet)) u.pet = {};
  if (Number(u.inventory?.counts?.["pet_niveau1"] || 0) > 0) u.pet.owned = true;
  if (u.pet.owned === true) {
    if (!u.pet.id) u.pet.id = "niveau1";
    // Pseudo du REX (défaut "REX", renommable en boutique/compte).
    u.pet.pseudo = normalizePetPseudo(u.pet.pseudo, PET_DEFAULT_PSEUDO);
    // Firme du REX : celle du pilote à l'achat, sinon héritage du compte.
    if (typeof u.pet.faction !== "string" || !u.pet.faction) u.pet.faction = normalizeFactionId(u.faction);
    else u.pet.faction = normalizeFactionId(u.pet.faction, normalizeFactionId(u.faction));
    const exp = Math.max(0, Number(u.pet.exp) || 0);
    u.pet.exp = exp;
    u.pet.level = getPetLevel(exp);
    // État en jeu : actif ou non (bouton play/stop), mode passif/combat.
    u.pet.active = u.pet.active === true;
    u.pet.mode = normalizePetMode(u.pet.mode);
    // Gear actif unique (sélecteur fenêtre P.E.T, null = aucun).
    if (typeof u.pet.activeGear !== "string" || !u.pet.activeGear) u.pet.activeGear = null;
    // Fuel infini pour le moment : 50 000 / 50 000 fixe.
    u.pet.fuelMax = PET_FUEL_MAX;
    u.pet.fuel = PET_FUEL_MAX;
    // HP persistés (pleins par défaut). Le max suit le niveau officiel.
    const petHpMax = getPetMaxHp(u.pet.level);
    u.pet.hp = Number.isFinite(Number(u.pet.hp)) ? Math.max(0, Math.min(petHpMax, Math.floor(Number(u.pet.hp)))) : petHpMax;
    // Bouclier : null = plein (le max dépend de l'équipement du hangar actif).
    if (u.pet.sh != null && !Number.isFinite(Number(u.pet.sh))) u.pet.sh = null;
    if (u.pet.sh != null && Number.isFinite(Number(u.pet.sh))) u.pet.sh = Math.max(0, Math.floor(Number(u.pet.sh)));
    if (!u.pet.fits || typeof u.pet.fits !== "object") {
      // Migration : l'ancien fit unique ({equipment}) part sur la config 1.
      const legacyFit = u.pet.fit && typeof u.pet.fit === "object" ? u.pet.fit : {};
      u.pet.fits = { 1: normalizePetFitValue(legacyFit, u.pet.level), 2: normalizePetFitValue({}, u.pet.level) };
    } else {
      u.pet.fits = { 1: normalizePetFitValue(u.pet.fits["1"], u.pet.level), 2: normalizePetFitValue(u.pet.fits["2"], u.pet.level) };
    }
    if (!u.pet.fit || typeof u.pet.fit !== "object") u.pet.fit = normalizePetFitValue(u.pet.fits["1"], u.pet.level);
  }

  u.quests = normalizeQuestState(u.quests);
  if (Number(u.stats.questHonorVersion || 0) < QUEST_HONOR_VERSION) {
    const completed = new Set(u.quests.completed);
    u.stats.honor += QUEST_DEFINITIONS
      .filter(quest => completed.has(quest.id))
      .reduce((total, quest) => total + getQuestHonorReward(quest), 0);
    u.stats.questHonorVersion = QUEST_HONOR_VERSION;
    u.stats.rankPoints = calculateRankPoints(u.stats);
  }

  // inventory
  if (!u.inventory || typeof u.inventory !== "object") u.inventory = {};

  // counts = { [itemId]: number }
  if (!u.inventory.counts || typeof u.inventory.counts !== "object") u.inventory.counts = {};

  // Matériaux persistants récupérés en jeu.
  if (!u.inventory.resources || typeof u.inventory.resources !== "object" || Array.isArray(u.inventory.resources)) {
    u.inventory.resources = {};
  }
  for (const [resourceId, quantity] of Object.entries(u.inventory.resources)) {
    const normalized = Math.max(0, Math.floor(Number(quantity) || 0));
    if (normalized > 0) u.inventory.resources[resourceId] = normalized;
    else delete u.inventory.resources[resourceId];
  }

  // modules roulette (instances uniques)
  if (!Array.isArray(u.inventory.shipModules)) u.inventory.shipModules = [];
  if (!Array.isArray(u.inventory.moduleRollHistory)) {
    u.inventory.moduleRollHistory = u.inventory.shipModules.map(module => ({ ...module }));
  }

  // migration ancienne: inventory.modules array
  if (!Array.isArray(u.inventory.modules)) u.inventory.modules = [];
  for (const itemId of u.inventory.modules) {
    if (!itemId) continue;
    if (typeof u.inventory.counts[itemId] !== "number") u.inventory.counts[itemId] = 1;
  }

  // ships: normalise en array
  if (Array.isArray(u.inventory.ships)) {
    // ok
  } else if (u.inventory.ships && typeof u.inventory.ships === "object") {
    u.inventory.ships = Object.keys(u.inventory.ships).filter((k) => u.inventory.ships[k]);
  } else {
    u.inventory.ships = [];
  }

  // ship actif
  if (!u.ship) u.ship = STARTER_SHIP_ID;

  // designs de vaisseaux (variantes cosmétiques possédées, sans hangar)
  if (!Array.isArray(u.inventory.shipDesigns)) u.inventory.shipDesigns = [];
  u.inventory.shipDesigns = [...new Set(u.inventory.shipDesigns.map(String).filter(Boolean))];

  // starter ship toujours owned
  if (!u.inventory.ships.includes(STARTER_SHIP_ID)) u.inventory.ships.push(STARTER_SHIP_ID);

  // hangars
  if (!Array.isArray(u.hangars)) u.hangars = [];

  // 1 hangar par vaisseau de base possédé (un design ne crée pas de hangar :
  // il s'applique sur le hangar du vaisseau de base).
  const canonicalBaseOf = (sid) => {
    const id = String(sid || "");
    const pack = getShipPackById(id);
    const canonical = pack?.id || id;
    return getShipDesignBaseId(canonical) || canonical;
  };
  for (const shipId of u.inventory.ships) {
    const baseOf = canonicalBaseOf(shipId);
    const already = u.hangars.some((h) => h && canonicalBaseOf(h.shipId) === baseOf);
    if (!already) u.hangars.push(makeHangar(baseOf, false));
  }

  if (!u.hangars.length) {
    u.hangars.push(makeHangar(STARTER_SHIP_ID, true));
  }

  // actif cohérent avec u.ship
  let activeHangar = u.hangars.find((h) => h && canonicalBaseOf(h.shipId) === canonicalBaseOf(u.ship)) || null;
  if (!activeHangar) {
    u.ship = u.hangars[0].shipId || STARTER_SHIP_ID;
    activeHangar = u.hangars[0];
  }
  for (const h of u.hangars) h.active = h === activeHangar;
  if (activeHangar?.shipId) u.ship = activeHangar.shipId;

  // FIT loadout (par vaisseau)
  for (const h of u.hangars) {
    if (!h) continue;

    const shipId = h.shipId || u.ship || STARTER_SHIP_ID;
    const slots = getShipSlots(shipId);

    // init
    if (!h.fit || typeof h.fit !== "object") {
      h.fit = {
        lasers: Array(slots.lasers).fill(null),
        gens: Array(slots.gens).fill(null),
        extras: Array(slots.extras).fill(null),
        shipMods: Array(slots.shipMods).fill(null),
      };
    }

    // normalize arrays size selon le ship
    h.fit.lasers = normalizeArraySize(h.fit.lasers, slots.lasers, null);
    h.fit.gens = normalizeArraySize(h.fit.gens, slots.gens, null);
    h.fit.extras = normalizeArraySize(h.fit.extras, slots.extras, null);
    h.fit.shipMods = normalizeArraySize(h.fit.shipMods, slots.shipMods, null);

    // migration: lastPos/lastMap
    if (h.lastPos === undefined) h.lastPos = null;
    if (h.lastMap === undefined) h.lastMap = null;

    // ✅ Configurations 1 / 2 par hangar
    h.activeConfig = getHangarActiveConfigNo(h);

    const cfg1 = normalizeFitForShip(shipId, h.fits?.["1"] || h.fit || makeEmptyFit(shipId));
    const cfg2 = normalizeFitForShip(shipId, h.fits?.["2"] || makeEmptyFit(shipId));

    h.fits = {
      "1": cfg1,
      "2": cfg2,
    };

    // compat : h.fit pointe toujours vers la config active
    h.fit = h.fits[String(h.activeConfig)];
  }

  // Migration doublon starter (legacy "PhoenixBleu" vs "phoenix_bleu") :
  // ids normalisés au canonique + hangars dédupliqués par base.
  normalizeStarterShipIds(u);

  // ✅ Drones : équipement exclusif par hangar (migration legacy -> actif uniquement)
  ensureDroneFitsByHangar(u);

  // ✅ P.E.T : même exclusivité par hangar (vaisseau) + config 1/2.
  ensurePetFitsByHangar(u);

  // Items retirés du jeu : purge des vieilles sauvegardes.
  purgeRemovedItemIds(u);

  return u;
}

function clampFitToSlots(shipId, fit) {
  const slots = getShipSlots(shipId);

  const normArr = (arr, n) =>
    (Array.isArray(arr) ? arr.slice(0, n) : [])
      .concat(Array(n).fill(null))
      .slice(0, n);

  return {
    lasers: normArr(fit?.lasers, slots.lasers),
    gens: normArr(fit?.gens, slots.gens),
    extras: normArr(fit?.extras, slots.extras),
    shipMods: normArr(fit?.shipMods, slots.shipMods || 1),
  };
}

function computeCombatFromFit(fit) {
  let dmg = 0;
  let bonusSpeed = 0;
  let bonusShield = 0;
  let bonusAbsorb = 0;

  const addModule = (itemId) => {
    if (!itemId) return;
    const it = findCatalogItem(itemId);
    if (!it?.module) return;
    // Équipement P.E.T uniquement : ignoré sur le vaisseau.
    if (it.petOnly) return;

    const t = it.module.type;
    if (t === "laser") dmg += Number(it.module.damage || 0);
    if (t === "speed") bonusSpeed += Number(it.module.bonusSpeed || 0);
    if (t === "shield") {
      bonusShield += Number(it.module.bonusShield || 0);
      bonusAbsorb = Math.max(bonusAbsorb, Number(it.module.absorbPct || 0));
    }
  };

  for (const id of fit.lasers) addModule(id);
  for (const id of fit.gens) addModule(id);
  // extras: pas de stats pour l'instant

  return { dmg, bonusSpeed, bonusShield, bonusAbsorb };
}

function petShieldCapacity(user) {
  if (user?.pet?.owned !== true) return 0;
  const hangar = getActiveHangar(user);
  const fit = getPetFit(user.pet, hangar?.id, hangar?.activeConfig);
  const multiplier = 1 + getPetShieldBonus(getPetLevel(user.pet.exp)) / 100;
  return Math.max(0, Math.floor((fit.generators || []).reduce((sum, id) => {
    const item = id ? findCatalogItem(id) : null;
    return sum + (item?.module?.type === "shield" ? Number(item.module.bonusShield || 0) : 0);
  }, 0) * multiplier));
}

function saveUser(user, options = {}) {
  user.schemaVersion = STORAGE_SCHEMA_VERSION;
  user.updatedAt = Date.now();
  user.revision = Math.max(0, Math.floor(Number(user.revision) || 0)) + 1;
  const users = readUsers();
  const idx = users.findIndex((x) => x?.id === user.id);
  const previousPetMax = Number.isFinite(Number(options.previousPetShieldMax))
    ? Math.max(0, Number(options.previousPetShieldMax))
    : petShieldCapacity(users[idx]);
  const nextPetMax = petShieldCapacity(user);
  if (user.pet?.owned === true && previousPetMax !== nextPetMax) {
    user.pet.sh = resizeShield({ sh: user.pet.sh ?? previousPetMax, shMax: previousPetMax }, nextPetMax).sh;
  }
  if (idx >= 0) users[idx] = user;
  else users.push(user);
  writeUsers(users);
  if (options.notify !== false && typeof window !== "undefined" && typeof CustomEvent !== "undefined") {
    window.dispatchEvent(new CustomEvent("orbit:user-updated", {
      detail: { userId: user.id, revision: user.revision, source: options.source || "account" },
    }));
  }
}

function incCount(u, itemId, delta = 1) {
  u.inventory ??= {};
  u.inventory.counts ??= {};
  const cur = Number(u.inventory.counts[itemId] || 0);
  u.inventory.counts[itemId] = Math.max(0, cur + Number(delta || 0));
}

function getOwnedCount(u, itemId) {
  const n = Number(u?.inventory?.counts?.[itemId] || 0);
  return Number.isFinite(n) ? n : 0;
}

// ------------------------------------------------------------
// ✅ HANGAR "ACTIF" ROBUSTE
// source de vérité = u.ship (pas seulement h.active)
// ------------------------------------------------------------
function getActiveHangar(u) {
  const hs = Array.isArray(u?.hangars) ? u.hangars : [];
  if (!hs.length) return null;

  // ✅ prioritaire: ship sélectionné
  const byShip = hs.find((h) => h?.shipId === u.ship);
  if (byShip) return byShip;

  // fallback: flag active
  const byActive = hs.find((h) => h?.active);
  if (byActive) return byActive;

  // fallback final
  return hs[0] || null;
}

// ---------------------------
// Exports demandés
// ---------------------------
export function register({ pseudo, email, password, faction }) {
  pseudo = String(pseudo || "").trim();
  email = String(email || "").trim().toLowerCase();
  password = String(password || "");
  const requestedFaction = String(faction || "").trim().toLowerCase();

  if (!pseudo || !email || !password) return { ok: false, error: "Champs manquants." };
  if (!requestedFaction || normalizeFactionId(requestedFaction, null) === null) {
    return { ok: false, error: "Choisis une firme valide." };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(email)) return { ok: false, error: "Adresse email invalide." };
  if (password.length < 4) return { ok: false, error: "Mot de passe trop court (4 caractères minimum)." };

  const users = readUsers();
  const keyP = norm(pseudo);
  const keyE = norm(email);

  const exists = users.some((u) => norm(u?.pseudo) === keyP || norm(u?.email) === keyE);
  if (exists) return { ok: false, error: "Pseudo ou email déjà utilisé." };

  const user = ensureUserShape({
    id: uuid(),
    pseudo,
    email,
    password: createPasswordHash(password),
    faction: requestedFaction,
    createdAt: Date.now(),
    credits: STARTER_CREDITS,
    ammo: defaultAmmo(),
    rockets: { r310: 10 },
    ship: STARTER_SHIP_ID,
    inventory: { modules: [], ships: [STARTER_SHIP_ID], counts: {} },
    hangars: [makeHangar(STARTER_SHIP_ID, true)],
    stats: { honor: 0, exp: 0, rankPoints: 0, lifetimeKills: 0 },
  });

  users.push(user);
  writeUsers(users);

  writeCurrent({ id: user.id, pseudo: user.pseudo, email: user.email });
  return { ok: true, user: { id: user.id, pseudo: user.pseudo, email: user.email, faction: user.faction } };
}

export function login(pseudoOrEmail, password) {
  const users = readUsers();
  const key = norm(pseudoOrEmail);
  const pass = String(password || "");

  const u0 = users.find((u) => norm(u?.pseudo) === key || norm(u?.email) === key);
  if (!u0) return { ok: false, error: "Compte introuvable." };
  if (!verifyPassword(u0.password, pass)) return { ok: false, error: "Mot de passe incorrect." };

  const u = ensureUserShape(u0);
  // Migration clair -> hash au premier login réussi.
  if (!isPasswordHash(u0.password)) u.password = createPasswordHash(pass);
  saveUser(u);

  writeCurrent({ id: u.id, pseudo: u.pseudo, email: u.email });
  return { ok: true, user: { id: u.id, pseudo: u.pseudo, email: u.email } };
}

export function logout() {
  writeCurrent(null);
  return { ok: true };
}

export function updateCurrentUserEmail(email, currentPassword) {
  const u = getCurrentUserFull();
  if (!u) return { ok: false, error: "Aucun utilisateur connecté." };

  const nextEmail = String(email || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(nextEmail)) {
    return { ok: false, error: "Adresse email invalide." };
  }
  if (!verifyPassword(u.password, String(currentPassword || ""))) {
    return { ok: false, error: "Mot de passe actuel incorrect." };
  }

  const duplicate = readUsers().some((candidate) => candidate?.id !== u.id && norm(candidate?.email) === norm(nextEmail));
  if (duplicate) return { ok: false, error: "Cette adresse email est déjà liée à un compte." };

  u.email = nextEmail;
  saveUser(u);
  writeCurrent({ id: u.id, pseudo: u.pseudo, email: u.email });
  return { ok: true, user: { id: u.id, pseudo: u.pseudo, email: u.email } };
}

export function updateCurrentUserPseudo(pseudo, currentPassword) {
  const u = getCurrentUserFull();
  if (!u) return { ok: false, error: "Aucun utilisateur connecté." };

  const nextPseudo = String(pseudo || "").trim();
  if (nextPseudo.length < 3 || nextPseudo.length > 32) {
    return { ok: false, error: "Le pseudo doit contenir entre 3 et 32 caractères." };
  }
  if (!/^[\p{L}\p{N}_ -]+$/u.test(nextPseudo)) {
    return { ok: false, error: "Le pseudo contient des caractères non autorisés." };
  }
  if (!verifyPassword(u.password, String(currentPassword || ""))) {
    return { ok: false, error: "Mot de passe actuel incorrect." };
  }

  const duplicate = readUsers().some(candidate => candidate?.id !== u.id && norm(candidate?.pseudo) === norm(nextPseudo));
  if (duplicate) return { ok: false, error: "Ce pseudo est déjà utilisé." };

  u.pseudo = nextPseudo;
  saveUser(u);
  writeCurrent({ id: u.id, pseudo: u.pseudo, email: u.email });
  localStorage.setItem("orbit_sync", String(Date.now()));
  return { ok: true, user: u };
}

export const PET_PSEUDO_CHANGE_CREDIT_COST = 1000000;

export function updateCurrentUserPetPseudo(pseudo, { free = false } = {}) {
  const u = getCurrentUserFull();
  if (!u) return { ok: false, error: "Aucun utilisateur connecté." };
  if (u.pet?.owned !== true) return { ok: false, error: "P.E.T non possédé." };
  const nextPseudo = String(pseudo || "").trim();
  if (nextPseudo.length < 3 || nextPseudo.length > 32) {
    return { ok: false, error: "Le pseudo du REX doit contenir entre 3 et 32 caractères." };
  }
  if (!/^[\p{L}\p{N}_ -]+$/u.test(nextPseudo)) {
    return { ok: false, error: "Le pseudo du REX contient des caractères non autorisés." };
  }
  if (!free) {
    if (Number(u.credits || 0) < PET_PSEUDO_CHANGE_CREDIT_COST) {
      return { ok: false, error: "Il faut 1 000 000 crédits pour renommer le REX." };
    }
    u.credits = Math.max(0, Math.floor(Number(u.credits || 0) - PET_PSEUDO_CHANGE_CREDIT_COST));
  }
  u.pet.pseudo = nextPseudo;
  saveUser(u);
  localStorage.setItem("orbit_sync", String(Date.now()));
  return { ok: true, user: u, creditsSpent: free ? 0 : PET_PSEUDO_CHANGE_CREDIT_COST };
}

export function changeCurrentUserPassword(currentPassword, newPassword) {
  const u = getCurrentUserFull();
  if (!u) return { ok: false, error: "Aucun utilisateur connecté." };
  if (!verifyPassword(u.password, String(currentPassword || ""))) {
    return { ok: false, error: "Mot de passe actuel incorrect." };
  }

  const nextPassword = String(newPassword || "");
  if (nextPassword.length < 4) return { ok: false, error: "Le nouveau mot de passe doit contenir au moins 4 caractères." };
  if (verifyPassword(u.password, nextPassword)) return { ok: false, error: "Choisis un mot de passe différent de l'ancien." };

  u.password = createPasswordHash(nextPassword);
  saveUser(u);
  return { ok: true };
}

export const FACTION_CHANGE_CREDIT_COST = 1000000000;

export function changeCurrentUserFaction(nextFaction) {
  const u = getCurrentUserFull();
  if (!u) return { ok: false, error: "Aucun utilisateur connecté." };

  const factionId = normalizeFactionId(nextFaction, null);
  if (!factionId) return { ok: false, error: "Firme invalide." };
  if (factionId === u.faction) return { ok: false, error: "Tu appartiens déjà à cette firme." };
  if (Number(u.credits || 0) < FACTION_CHANGE_CREDIT_COST) {
    return { ok: false, error: "Il faut 1 000 000 000 crédits pour changer de firme." };
  }

  const honorBefore = Number(u.stats?.honor || 0);
  const honorLost = honorBefore > 0 ? Math.ceil(honorBefore * 0.5) : 0;
  u.credits = Math.max(0, Math.floor(Number(u.credits || 0) - FACTION_CHANGE_CREDIT_COST));
  u.stats.honor = honorBefore - honorLost;
  u.stats.rankPoints = calculateRankPoints(u.stats);
  u.faction = factionId;
  // Le REX suit la firme du pilote (comme le vaisseau).
  if (u.pet?.owned === true) u.pet.faction = factionId;
  const destinationFaction = getFaction(factionId);
  const baseSpawn = getFactionBaseSpawn(factionId);
  const activeHangar = getActiveHangar(u);
  if (activeHangar) {
    activeHangar.lastMap = `${destinationFaction.sector}-1`;
    activeHangar.lastPos = null;
  }
  saveUser(u);
  try { sessionStorage.setItem("orbit_faction_transfer", JSON.stringify({ faction: factionId, map: `${destinationFaction.sector}-1`, fallback: baseSpawn })); } catch {}
  localStorage.setItem("orbit_sync", String(Date.now()));
  return { ok: true, user: u, faction: destinationFaction, creditsSpent: FACTION_CHANGE_CREDIT_COST, honorLost };
}

export function getCurrentUser() {
  const cur = readCurrent();
  if (!cur?.id) return null;
  return { id: cur.id, pseudo: cur.pseudo, email: cur.email };
}

export function getCurrentUserFull() {
  const cur = readCurrent();
  if (!cur?.id) return null;

  const users = readUsers();
  const u0 = users.find((u) => u?.id === cur.id) || null;
  if (!u0) {
    writeCurrent(null);
    return null;
  }

  // Une lecture de compte doit rester une opération sans écriture. Auparavant,
  // chaque appel réécrivait l'intégralité de `orbit_users`, ce qui bloquait le
  // thread principal dès que le profil devenait volumineux (inventaire, drones,
  // quêtes...). La migration n'est persistée que lorsqu'elle est réellement
  // nécessaire.
  const needsMigration = Number(u0.schemaVersion || 0) !== STORAGE_SCHEMA_VERSION;
  const u = ensureUserShape(u0);
  if (needsMigration) saveUser(u);

  if (cur.pseudo !== u.pseudo || cur.email !== u.email) {
    writeCurrent({ id: u.id, pseudo: u.pseudo, email: u.email });
  }
  return u;
}

export function updateCurrentUserProgress(patch = {}) {
  const u = getCurrentUserFull();
  if (!u) return { ok: false, error: "Aucun utilisateur connecté." };

  if (patch.credits != null) u.credits = Number(patch.credits || 0);
  if (patch.ship != null) u.ship = String(patch.ship || STARTER_SHIP_ID);

  if (patch.ammo && typeof patch.ammo === "object") {
    u.ammo ??= defaultAmmo();
    u.ammo.x1 = Infinity;
    if (patch.ammo.x2 != null) u.ammo.x2 = Math.max(0, Number(patch.ammo.x2 || 0));
    if (patch.ammo.x3 != null) u.ammo.x3 = Math.max(0, Number(patch.ammo.x3 || 0));
    if (patch.ammo.x4 != null) u.ammo.x4 = Math.max(0, Number(patch.ammo.x4 || 0));
    if (patch.ammo.x6 != null) u.ammo.x6 = Math.max(0, Number(patch.ammo.x6 || 0));
    if (patch.ammo.sab != null) u.ammo.sab = Math.max(0, Number(patch.ammo.sab || 0));
    for (const k of ["rcb", "cbo", "job", "rb", "pib", "idb", "vb", "emaa", "sbl", "abl"]) {
      if (patch.ammo[k] != null) u.ammo[k] = Math.max(0, Number(patch.ammo[k] || 0));
    }
  }
  // Sélection munition du dock rapide (miroir de rocketActive).
  // Acceptée via patch.ammoActive ou patch.ammo.active (compat).
  {
    const VALID_ACTIVE_AMMO = ["x1", "x2", "x3", "x4", "x6", "sab", "rcb", "cbo", "job", "rb", "pib", "idb", "vb", "emaa", "sbl", "abl"];
    const rawAmmoActive = patch.ammoActive ?? patch.ammo?.active;
    if (rawAmmoActive != null) {
      const key = String(rawAmmoActive).toLowerCase();
      if (VALID_ACTIVE_AMMO.includes(key)) {
        u.ammo ??= defaultAmmo();
        u.ammoActive = key;
        u.ammo.active = key;
      }
    }
    // Sans stock, retombe sur x1.
    if (u.ammoActive && u.ammoActive !== "x1" && !(Number(u.ammo?.[u.ammoActive] || 0) > 0)) {
      u.ammoActive = "x1";
      if (u.ammo) u.ammo.active = "x1";
    }
  }

  if (patch.rockets && typeof patch.rockets === "object") {
    u.rockets ??= {};
    for (const [k, v] of Object.entries(patch.rockets)) {
      if (!ROCKET_TYPES[String(k).toLowerCase()]) continue;
      u.rockets[k] = Math.max(0, Math.floor(Number(v || 0)));
    }
  }
  if (patch.rocketActive != null && ROCKET_TYPES[String(patch.rocketActive).toLowerCase()]) {
    u.rocketActive = String(patch.rocketActive).toLowerCase();
  }
  if (patch.rocketAuto != null) u.rocketAuto = patch.rocketAuto === true;
  if (patch.launcherActive != null && ROCKET_TYPES[String(patch.launcherActive).toLowerCase()]) {
    u.launcherActive = String(patch.launcherActive).toLowerCase();
  }
  if (patch.launcherAuto != null) u.launcherAuto = patch.launcherAuto === true;

  if (patch.inventory?.resources && typeof patch.inventory.resources === "object" && !Array.isArray(patch.inventory.resources)) {
    u.inventory ||= {};
    u.inventory.resources = Object.fromEntries(Object.entries(patch.inventory.resources)
      .map(([resourceId, quantity]) => [String(resourceId), Math.max(0, Math.floor(Number(quantity) || 0))])
      .filter(([, quantity]) => quantity > 0));
  }
  if (patch.drones && typeof patch.drones === "object") u.drones = structuredClone(patch.drones);
  if (patch.pet && typeof patch.pet === "object") u.pet = structuredClone(patch.pet);

  if (patch.hangarState && typeof patch.hangarState === "object") {
    const requestedId = String(patch.hangarState.id || "");
    const hangar = requestedId
      ? (u.hangars || []).find(entry => String(entry?.id || "") === requestedId)
      : getActiveHangar(u);
    if (hangar) {
      const px = Number(patch.hangarState.x);
      const py = Number(patch.hangarState.y);
      if (Number.isFinite(px) && Number.isFinite(py)) hangar.lastPos = { x: px, y: py };
      if (patch.hangarState.mapId) hangar.lastMap = String(patch.hangarState.mapId).toLowerCase();
    }
  }

  if (patch.stats && typeof patch.stats === "object") {
    u.stats ??= {};
    if (patch.stats.honor != null) u.stats.honor = Number(patch.stats.honor || 0);
    if (patch.stats.exp != null) u.stats.exp = Number(patch.stats.exp || 0);
    if (patch.stats.rankPoints != null) u.stats.rankPoints = Number(patch.stats.rankPoints || 0);
    if (patch.stats.lifetimeKills != null) u.stats.lifetimeKills = Math.max(0, Math.floor(Number(patch.stats.lifetimeKills || 0)));
    if (patch.stats.npcKills && typeof patch.stats.npcKills === "object" && !Array.isArray(patch.stats.npcKills)) {
      u.stats.npcKills = Object.fromEntries(Object.entries(patch.stats.npcKills).map(([type, count]) => [
        String(type),
        Math.max(0, Math.floor(Number(count) || 0)),
      ]));
    }
    if (patch.stats.npcKillBreakdownVersion != null) {
      u.stats.npcKillBreakdownVersion = Math.max(0, Math.floor(Number(patch.stats.npcKillBreakdownVersion) || 0));
    }
    u.stats.rankPoints = calculateRankPoints(u.stats);
  }

  if (patch.quests && typeof patch.quests === "object") {
    const incoming = normalizeQuestState(patch.quests);
    const existing = normalizeQuestState(u.quests);
    // Un moteur fraîchement initialisé peut envoyer un journal vide avant
    // d'avoir fini de se synchroniser. Ne détruis jamais des missions déjà
    // sauvegardées dans ce cas.
    const incomingEmpty = Object.keys(incoming.active).length === 0 && incoming.completed.length === 0;
    const existingHasData = Object.keys(existing.active).length > 0 || existing.completed.length > 0;
    if (!incomingEmpty || !existingHasData) u.quests = incoming;
  }

  ensureUserShape(u);
  saveUser(u, { source: "progress" });

  return { ok: true, user: u };
}

/**
 * Achat boutique:
 * - Ships / Designs / P.E.T: unique
 * - Tout le reste: achetable plusieurs fois => counts[itemId]++
 */
export function buyItem(itemId, requestedQuantity = 1, options = {}) {
  const u = getCurrentUserFull();
  if (!u) return { ok: false, error: "Non connecté." };

  const item = findCatalogItem(itemId);
  if (!item) return { ok: false, error: "Item introuvable." };

  const isShip = !!item.ship?.id;
  const isDesign = !!item.design?.id;
  const isPet = !!item.pet?.id;
  const quantity = (isShip || isDesign || isPet)
    ? 1
    : Math.min(1000, Math.max(1, Math.floor(Number(requestedQuantity) || 1)));
  const unitPrice = Math.max(0, Number(item.price || 0));
  const price = unitPrice * quantity;
  if (u.credits < price) return { ok: false, error: "Crédits insuffisants." };

  // ships: unique
  if (item.ship?.id) {
    const shipId = String(item.ship.id);
    if (u.inventory?.ships?.includes(shipId)) {
      return { ok: false, error: "Déjà possédé." };
    }
  }

  // designs: unique (pas de hangar créé, le design s'applique au hangar de base)
  if (item.design?.id) {
    const designId = String(item.design.id);
    u.inventory.shipDesigns ??= [];
    if (u.inventory.shipDesigns.includes(designId) || (Array.isArray(u.inventory.ships) && u.inventory.ships.includes(designId))) {
      return { ok: false, error: "Design déjà possédé." };
    }
  }

  // P.E.T : unique
  if (item.pet?.id) {
    if (u.pet?.owned === true || Number(u.inventory?.counts?.[item.id] || 0) > 0) {
      return { ok: false, error: "P.E.T déjà possédé." };
    }
  }

  // Gears / protocoles P.E.T : P.E.T requis + palier de niveau
  // (officiel : niveau 2 dès P.E.T 4, niveau 3 dès P.E.T 8).
  const reqPetLevel = Math.max(0, Number(item.petLevel) || 0);
  if (item.petGear || item.petProtocol) {
    if (u.pet?.owned !== true) return { ok: false, error: "P.E.T non possédé." };
    if (getPetLevel(u.pet.exp) < reqPetLevel) return { ok: false, error: `P.E.T niveau ${reqPetLevel} requis.` };
  }

  // pay
  u.credits -= price;

  // ammo packs
  if (item.give?.ammo) {
    u.ammo ??= defaultAmmo();
    for (const k of Object.keys(item.give.ammo)) {
      if (k === "x1") continue;
      const add = Number(item.give.ammo[k] || 0) * quantity;
      u.ammo[k] = Math.max(0, Number(u.ammo[k] || 0) + add);
    }
    incCount(u, item.id, quantity);
  }

  // rocket packs (consommable, hors munitions laser)
  if (item.give?.rockets) {
    u.rockets ??= {};
    for (const k of Object.keys(item.give.rockets)) {
      const add = Number(item.give.rockets[k] || 0) * quantity;
      u.rockets[k] = Math.max(0, Math.floor(Number(u.rockets[k] || 0) + add));
    }
    incCount(u, item.id, quantity);
  }

  // modules (multi)
  if (item.module) {
    incCount(u, item.id, quantity);
    // compat
    if (!u.inventory.modules.includes(item.id)) u.inventory.modules.push(item.id);
  }

  // gears / protocoles P.E.T (multi)
  if (item.petGear || item.petProtocol) {
    incCount(u, item.id, quantity);
  }

  // boosters : chaque achat AJOUTE sa durée au timer actif
  // (prolonge si déjà actif, démarre sinon). Pas de stock.
  if (item.booster?.id) {
    const def = getBooster(item.booster.id);
    u.boosters = normalizeBoostersState(u.boosters);
    if (def) {
      const now = Date.now();
      const current = Number(u.boosters.active[def.id] || 0);
      const base = current > now ? current : now;
      u.boosters.active[def.id] = base + Math.max(1, Number(def.durationSec) || 0) * 1000 * Math.max(1, quantity);
    }
  }

  // ship purchase => add ship + hangar
  if (item.ship?.id) {
    const shipId = String(item.ship.id);

    u.inventory.ships ??= [];
    u.hangars ??= [];

    u.inventory.ships.push(shipId);

    // 1 hangar pour ce ship si pas déjà
    if (!u.hangars.some((h) => h?.shipId === shipId)) {
      u.hangars.push(makeHangar(shipId, false));
    }
  }

  // design purchase => juste la collection (s'appliquera via le dropdown hangar)
  if (item.design?.id) {
    const designId = String(item.design.id);
    u.inventory.shipDesigns ??= [];
    if (!u.inventory.shipDesigns.includes(designId)) u.inventory.shipDesigns.push(designId);
  }

  // P.E.T purchase => collection unique + flag u.pet (niveau 0, comme l'officiel)
  if (item.pet?.id) {
    incCount(u, item.id, 1);
    const fresh = createPet(String(item.pet.id), { pseudo: options?.petPseudo, faction: options?.petFaction ?? u.faction });
    u.pet ??= {};
    u.pet.owned = true;
    u.pet.id = fresh.id;
    // Pseudo choisi à l'achat (fenêtre temporaire), firme du pilote.
    u.pet.pseudo = normalizePetPseudo(options?.petPseudo ?? fresh.pseudo, PET_DEFAULT_PSEUDO);
    u.pet.faction = normalizeFactionId(options?.petFaction ?? fresh.faction ?? u.faction, normalizeFactionId(u.faction));
    if (typeof u.pet.exp !== "number") u.pet.exp = 0;
    if (typeof u.pet.level !== "number") u.pet.level = getPetLevel(u.pet.exp);
    if (!u.pet.fits) u.pet.fits = fresh.fits;
    if (!u.pet.fit) u.pet.fit = fresh.fit;
    if (!u.pet.fitsByHangar) u.pet.fitsByHangar = {};
  }

  ensureUserShape(u);
  saveUser(u);
  return { ok: true, user: u, quantity, totalPrice: price };
}

export function buyCurrentUserDrone(type) {
  const u = getCurrentUserFull();
  const definition = DRONE_TYPES[type];
  if (!u || !definition) return { ok: false, error: "Drone introuvable." };
  const owned = u.drones.items.filter(drone => drone.type === type).length;
  if (owned >= definition.maxOwned) return { ok: false, error: `Limite de ${definition.maxOwned} ${definition.name} atteinte.` };
  const price = type === "iris" ? getIrisPrice(owned) : SPECIAL_DRONE_PRICE;
  if (u.credits < price) return { ok: false, error: "Crédits insuffisants." };
  u.credits -= price;
  const drone = createDrone(type, `drone_${uuid()}`);
  u.drones.items.push(drone);
  saveUser(u);
  return { ok: true, user: u, drone, price };
}

export function activateCurrentUserBooster(catalogItemId) {
  const u = getCurrentUserFull();
  if (!u) return { ok: false, error: "Non connecté." };
  const item = findCatalogItem(catalogItemId);
  const def = getBooster(item?.booster?.id);
  if (!item || !def) return { ok: false, error: "Booster introuvable." };
  u.boosters = normalizeBoostersState(u.boosters);
  const now = Date.now();
  if (Number(u.boosters.active[def.id] || 0) > now) return { ok: false, error: "Booster déjà actif." };
  const stock = Math.max(0, Math.floor(Number(u.inventory?.counts?.[item.id] || 0)));
  if (stock <= 0) return { ok: false, error: "Aucun booster en stock." };
  u.inventory.counts[item.id] = stock - 1;
  u.boosters.active[def.id] = now + Math.max(1, Number(def.durationSec) || 0) * 1000;
  ensureUserShape(u);
  saveUser(u);
  return { ok: true, user: u, booster: def, expiresAt: u.boosters.active[def.id] };
}

export function buyCurrentUserDroneFormation(formationId) {
  const u = getCurrentUserFull();
  const formation = DRONE_FORMATIONS.find(entry => entry.id === formationId);
  if (!u || !formation) return { ok: false, error: "Formation introuvable." };
  if (u.drones.formations.includes(formation.id)) return { ok: false, error: "Formation déjà possédée." };
  if (u.credits < formation.price) return { ok: false, error: "Crédits insuffisants." };
  u.credits -= formation.price;
  u.drones.formations.push(formation.id);
  saveUser(u);
  return { ok: true, user: u, formation, price: formation.price };
}

export function setCurrentUserDroneFormation(formationId) {
  const u = getCurrentUserFull();
  const formation = DRONE_FORMATIONS.find(entry => entry.id === formationId);
  if (!u || !formation || !u.drones.formations.includes(formationId)) return { ok: false, error: "Formation non possédée." };
  if (u.drones.items.length < formation.minDrones) return { ok: false, error: `Il faut au moins ${formation.minDrones} drones.` };
  const cooldownLeft = 2000 - (Date.now() - u.drones.lastFormationChangeAt);
  if (cooldownLeft > 0) return { ok: false, error: `Formation disponible dans ${(cooldownLeft / 1000).toFixed(1)} s.` };
  u.drones.activeFormation = formationId;
  u.drones.lastFormationChangeAt = Date.now();
  saveUser(u);
  return { ok: true, user: u, formation };
}

export function saveCurrentUserDroneFit(droneId, fit, configNo = null, hangarId = null) {
  const u = getCurrentUserFull();
  const drone = u?.drones?.items?.find(entry => entry.id === droneId);
  const definition = drone ? DRONE_TYPES[drone.type] : null;
  if (!u || !drone || !definition) return { ok: false, error: "Drone introuvable." };
  const equipment = compactFitArray(Array.from({ length: definition.slots }, (_, index) => fit?.equipment?.[index] || null), definition.slots);
  const activeHangar = getActiveHangar(u);
  const targetHangarId = hangarId != null ? String(hangarId) : String(activeHangar?.id || "");
  if (!targetHangarId) return { ok: false, error: "Hangar introuvable." };
  const hangarForCfg = (u.hangars || []).find((h) => String(h?.id) === targetHangarId) || activeHangar;
  const cfg = String(Number(configNo ?? hangarForCfg?.activeConfig) === 2 ? 2 : 1);
  const value = { equipment, ability: fit?.ability || null };
  drone.fitsByHangar ||= {};
  drone.fitsByHangar[targetHangarId] ||= {};
  drone.fitsByHangar[targetHangarId][cfg] = value;
  // Miroir legacy si c'est le hangar actif (compat avec l'ancien code)
  if (activeHangar && String(activeHangar.id) === targetHangarId) {
    drone.fits ||= {};
    drone.fits[cfg] = value;
    drone.fit = value;
  }
  ensureUserShape(u);
  saveUser(u);
  return { ok: true, user: u, drone };
}

export function saveCurrentUserDroneFits(fits) {
  const u = getCurrentUserFull();
  if (!u) return { ok: false, error: "Non connecté." };
  const activeHangar = getActiveHangar(u);
  let applied = 0;
  for (const entry of fits ?? []) {
    const drone = u?.drones?.items?.find((d) => d.id === entry.droneId);
    const definition = drone ? DRONE_TYPES[drone.type] : null;
    if (!drone || !definition) continue;
    const equipment = compactFitArray(Array.from({ length: definition.slots }, (_, index) => entry.fit?.equipment?.[index] || null), definition.slots);
    const targetHangarId = entry.hangarId != null ? String(entry.hangarId) : String(activeHangar?.id || "");
    if (!targetHangarId) continue;
    const hangarForCfg = (u.hangars || []).find((h) => String(h?.id) === targetHangarId) || activeHangar;
    const cfg = String(Number(entry.configNo ?? hangarForCfg?.activeConfig) === 2 ? 2 : 1);
    const value = { equipment, ability: entry.fit?.ability || null };
    drone.fitsByHangar ||= {};
    drone.fitsByHangar[targetHangarId] ||= {};
    drone.fitsByHangar[targetHangarId][cfg] = value;
    if (activeHangar && String(activeHangar.id) === targetHangarId) {
      drone.fits ||= {};
      drone.fits[cfg] = value;
      drone.fit = value;
    }
    applied++;
  }
  ensureUserShape(u);
  saveUser(u);
  return { ok: true, user: u, applied };
}

export function grantCurrentUserDroneExperience(amount) {
  const u = getCurrentUserFull();
  if (!u) return { ok: false, error: "Non connecté." };
  const gained = Math.max(0, Number(amount) || 0) * 0.05;
  const levelUps = [];
  for (const drone of u.drones.items) {
    const before = drone.level;
    drone.exp += gained;
    drone.level = getDroneLevel(drone.exp);
    if (drone.level > before) levelUps.push({ id: drone.id, level: drone.level });
  }
  saveUser(u);
  return { ok: true, user: u, gained, levelUps };
}

export function saveCurrentUserPetFit(fit, configNo = null, hangarId = null) {
  return saveCurrentUserPetFits([{ fit, configNo, hangarId }]);
}

export function saveCurrentUserPetFits(fits) {
  const u = getCurrentUserFull();
  if (!u) return { ok: false, error: "Non connecté." };
  if (u.pet?.owned !== true) return { ok: false, error: "P.E.T non possédé." };
  const previousPetShieldMax = petShieldCapacity(u);
  const level = getPetLevel(u.pet.exp);
  const slots = getPetSlots(level);
  const activeHangar = getActiveHangar(u);
  let applied = 0;
  for (const entry of fits ?? []) {
    const fit = entry.fit ?? entry;
    const targetHangarId = entry.hangarId != null ? String(entry.hangarId) : String(activeHangar?.id || "");
    if (!targetHangarId) continue;
    const hangarForCfg = (u.hangars || []).find((h) => String(h?.id) === targetHangarId) || activeHangar;
    const cfg = String(Number(entry.configNo ?? hangarForCfg?.activeConfig) === 2 ? 2 : 1);
    const groups = ["lasers", "generators", "gears", "protocols"];
    const value = { ability: fit?.ability || null };
    for (const group of groups) {
      const size = slots[group];
      value[group] = [];
      for (let index = 0; index < size; index++) {
        const id = fit?.[group]?.[index] || null;
        if (!id) {
          value[group].push(null);
          continue;
        }
        const err = petFitSlotError(id, group, level);
        if (err) return { ok: false, error: err };
        value[group].push(id);
      }
    }
    // Comme le vaisseau : aucun trou, tout poussé en haut à gauche.
    const compactedPet = compactPetFit(value, slots);
    for (const group of groups) value[group] = compactedPet[group];
    u.pet.fitsByHangar ||= {};
    u.pet.fitsByHangar[targetHangarId] ||= {};
    u.pet.fitsByHangar[targetHangarId][cfg] = value;
    if (activeHangar && String(activeHangar.id) === targetHangarId) {
      u.pet.fits ||= {};
      u.pet.fits[cfg] = value;
      u.pet.fit = value;
    }
    applied++;
  }
  ensureUserShape(u);
  saveUser(u);
  return { ok: true, user: u, applied };
}

export function grantCurrentUserPetExperience(amount) {
  const u = getCurrentUserFull();
  if (!u) return { ok: false, error: "Non connecté." };
  // L'XP n'est comptabilisée que si le P.E.T est activé (bouton play).
  if (u.pet?.owned !== true || u.pet?.active !== true) return { ok: true, user: u, gained: 0, levelUps: [] };
  const gained = Math.max(0, Number(amount) || 0) * 0.05;
  const before = Number(u.pet.level) || 0;
  u.pet.exp = Math.max(0, Number(u.pet.exp) || 0) + gained;
  u.pet.level = getPetLevel(u.pet.exp);
  saveUser(u);
  return { ok: true, user: u, gained, levelUps: u.pet.level > before ? [{ level: u.pet.level }] : [] };
}

// Bouton play/stop de la fenêtre P.E.T en jeu.
export function setPetActive(active) {
  const u = getCurrentUserFull();
  if (!u) return { ok: false, error: "Non connecté." };
  if (u.pet?.owned !== true) return { ok: false, error: "P.E.T non possédé." };
  u.pet.active = active === true;
  ensureUserShape(u);
  saveUser(u);
  return { ok: true, user: u, active: u.pet.active };
}

// Dropdown passif / combat de la fenêtre P.E.T en jeu.
export function setPetMode(mode) {
  const u = getCurrentUserFull();
  if (!u) return { ok: false, error: "Non connecté." };
  if (u.pet?.owned !== true) return { ok: false, error: "P.E.T non possédé." };
  u.pet.mode = normalizePetMode(mode);
  ensureUserShape(u);
  saveUser(u);
  return { ok: true, user: u, mode: u.pet.mode };
}

// Sélecteur de gear de la fenêtre P.E.T en jeu (un seul actif à la fois).
export function setPetActiveGear(key) {
  const u = getCurrentUserFull();
  if (!u) return { ok: false, error: "Non connecté." };
  if (u.pet?.owned !== true) return { ok: false, error: "P.E.T non possédé." };
  const k = key == null || key === "" ? null : String(key).toLowerCase();
  if (k != null && !["al", "ar", "el", "rep", "tra"].includes(k)) return { ok: false, error: "Gear inconnu." };
  u.pet.activeGear = k;
  ensureUserShape(u);
  saveUser(u);
  return { ok: true, user: u, activeGear: u.pet.activeGear };
}

export function spinCurrentUserGalaxyGate(gateId, count = 1, rng = Math.random) {
  const u = getCurrentUserFull();
  if (!u) return { ok: false, error: "Aucun utilisateur connecté." };
  const result = spinGalaxyGate(u.galaxyGates, gateId, count, u.credits, rng);
  if (!result.ok) return result;
  u.galaxyGates = result.state;
  u.credits = result.credits;
  for (const [ammoId, amount] of Object.entries(result.rewards.ammo || {})) {
    if (!(Number(amount) > 0)) continue;
    u.ammo[ammoId] = Math.max(0, Number(u.ammo[ammoId]) || 0) + amount;
  }
  for (const [rocketId, amount] of Object.entries(result.rewards.rockets || {})) {
    if (!(Number(amount) > 0)) continue;
    if (!ROCKET_TYPES[String(rocketId || "").toLowerCase()]) continue;
    const key = String(rocketId).toLowerCase();
    u.rockets[key] = Math.max(0, Number(u.rockets[key]) || 0) + amount;
  }
  ensureUserShape(u);
  saveUser(u);
  return { ...result, user: u };
}

export function armCurrentUserGalaxyGateMultiplier(gateId, armed = true) {
  const u = getCurrentUserFull();
  if (!u) return { ok: false, error: "Aucun utilisateur connecté." };
  const result = setGalaxyGateMultiplierArmed(u.galaxyGates, gateId, armed);
  if (!result.ok) return { ok: false, error: "Aucun multiplicateur disponible.", state: result.state };
  u.galaxyGates = result.state;
  saveUser(u);
  return { ok: true, user: u, state: result.state };
}

export function grantCurrentUserGalaxyEnergy(amount) {
  const u = getCurrentUserFull();
  if (!u) return { ok: false, error: "Aucun utilisateur connecté." };
  const gained = Math.max(0, Math.floor(Number(amount) || 0));
  u.galaxyGates.energy += gained;
  saveUser(u);
  return { ok: true, gained, user: u };
}

export function consumeCurrentUserGalaxyGate(gateId) {
  const u = getCurrentUserFull();
  if (!u) return { ok: false, error: "Aucun utilisateur connecté." };
  const result = consumeBuiltGalaxyGate(u.galaxyGates, gateId);
  if (!result.ok) return { ok: false, error: "Cette Galaxy Gate n'est pas construite.", state: result.state };
  u.galaxyGates = result.state;
  saveUser(u);
  return { ok: true, user: u };
}

export function deployCurrentUserGalaxyGate(gateId) {
  const u = getCurrentUserFull();
  if (!u) return { ok: false, error: "Aucun utilisateur connecté." };
  const result = deployBuiltGalaxyGate(u.galaxyGates, gateId);
  if (!result.ok) return { ok: false, error: "Cette Gate ne peut pas être envoyée sur la map.", state: result.state };
  u.galaxyGates = result.state;
  saveUser(u);
  return { ok: true, user: u };
}

export function completeCurrentUserGalaxyGate(gateId) {
  const u = getCurrentUserFull();
  if (!u) return { ok: false, error: "Aucun utilisateur connecté." };
  const result = completeActiveGalaxyGate(u.galaxyGates, gateId);
  if (!result.ok) return { ok: false, error: "Aucune Galaxy Gate active correspondante." };
  const reward = GALAXY_GATE_DEFINITIONS[String(gateId || "").toLowerCase()]?.completion;
  u.galaxyGates = result.state;
  if (reward) {
    u.credits += reward.credits;
    u.stats.exp += reward.exp;
    u.stats.honor += reward.honor;
    u.ammo.x4 += reward.x4;
  }
  ensureUserShape(u);
  saveUser(u);
  return { ok: true, user: u, reward };
}

export function loseCurrentUserGalaxyGateLife(gateId) {
  const u = getCurrentUserFull();
  if (!u) return { ok: false, error: "Aucun utilisateur connecté." };
  const result = loseGalaxyGateLife(u.galaxyGates, gateId);
  if (!result.ok) return { ok: false, error: "Aucune Galaxy Gate active correspondante.", ...result };
  u.galaxyGates = result.state;
  saveUser(u);
  return { ...result, user: u };
}

export function saveCurrentUserGalaxyGateWave(gateId, wave) {
  const u = getCurrentUserFull();
  if (!u) return { ok: false, error: "Aucun utilisateur connecté." };
  const id = String(gateId || "").toLowerCase();
  if (u.galaxyGates.active !== id) return { ok: false, error: "Galaxy Gate inactive." };
  u.galaxyGates.activeWave = Math.max(1, Math.floor(Number(wave) || 1));
  // ✅ miroir persisté par gate (alternance Alpha/Beta/Gamma sans perte).
  u.galaxyGates.waves ||= {};
  u.galaxyGates.waves[id] = u.galaxyGates.activeWave;
  saveUser(u);
  return { ok: true, user: u };
}

// ---------------------------
// Hangar API
// ---------------------------
export function setActiveHangar(hangarId) {
  const u = getCurrentUserFull();
  if (!u) return { ok: false, error: "Non connecté." };

  const hs = Array.isArray(u.hangars) ? u.hangars : [];
  const target = hs.find((h) => h?.id === hangarId);
  if (!target) return { ok: false, error: "Hangar introuvable." };

  for (const h of hs) h.active = h.id === target.id;
  u.ship = target.shipId || STARTER_SHIP_ID;

  ensureUserShape(u);
  saveUser(u);
  writeCurrent({ id: u.id, pseudo: u.pseudo, email: u.email });

  // ✅ SIGNAL cross-onglet (le jeu va détecter ça et se resync)
  localStorage.setItem("orbit_sync", String(Date.now()));

  return { ok: true, user: u };
}

// ✅ Applique un design (variante cosmétique) à un hangar existant.
// Le hangar garde son id/équipement mais change de modèle visuel.
export function setHangarDesign(hangarId, designId) {
  const u = getCurrentUserFull();
  if (!u) return { ok: false, error: "Non connecté." };
  if (!hangarId) return { ok: false, error: "Hangar inexistant." };
  if (!designId || designId === "none") {
    designId = null;
  } else {
    designId = String(designId);
  }

  const h = (u.hangars || []).find((x) => x?.id === hangarId);
  if (!h) return { ok: false, error: "Hangar introuvable." };

  const baseId = getShipDesignBaseId(h.shipId) || h.shipId;
  const targetBase =
    designId == null ? baseId : getShipDesignBaseId(designId) || designId;
  if (targetBase !== baseId) {
    return { ok: false, error: "Ce design n'appartient pas à ce vaisseau." };
  }

  if (designId != null) {
    if (designId !== baseId) {
      const owned =
        Array.isArray(u.inventory?.shipDesigns) &&
        (u.inventory.shipDesigns.includes(designId) ||
          (Array.isArray(u.inventory?.ships) && u.inventory.ships.includes(designId)));
      if (!owned) return { ok: false, error: "Design non possédé." };
    }
  }

  h.shipId = designId == null ? baseId : designId;

  // préserve l'équipement en le re-normalisant sur le nouveau modèle
  const prevFit = h.fits?.[h.activeConfig || "1"] || h.fit || null;
  h.fits ??= {};
  h.fits[h.activeConfig || "1"] = normalizeFitForShip(h.shipId, prevFit);
  h.fit = h.fits[h.activeConfig || "1"];

  if ((u.hangars || []).find((x) => x.id === h.id)?.active || h.active) {
    u.ship = h.shipId;
  }

  ensureUserShape(u);
  saveUser(u);
  writeCurrent({ id: u.id, pseudo: u.pseudo, email: u.email });

  // ✅ SIGNAL cross-onglet (le jeu va détecter ça et se resync)
  localStorage.setItem("orbit_sync", String(Date.now()));

  return { ok: true, user: u };
}

// ---------------------------
// Fit API
// ---------------------------
export function getHangarById(hangarId) {
  const u = getCurrentUserFull();
  if (!u) return null;
  return (u.hangars || []).find((x) => x?.id === hangarId) || null;
}

/**
 * Sauvegarde un fit complet (draft -> saved)
 */
export function saveHangarFit(hangarId, fitDraft, configNo = null) {
  const u = getCurrentUserFull();
  if (!u) return { ok: false, error: "Non connecté." };

  const h = (u.hangars || []).find((x) => x?.id === hangarId);
  if (!h) return { ok: false, error: "Hangar introuvable." };

  const shipId = h.shipId || u.ship;
  const cfg = Number(configNo ?? h.activeConfig ?? 1) === 2 ? "2" : "1";

  h.fits ??= {};
  h.fits[cfg] = normalizeFitForShip(shipId, fitDraft);

  // Le hangar ne pilote jamais la config en jeu : on ne touche à activeConfig
  // que si on sauvegarde la config déjà active (miroir h.fit à jour).
  // Changer 1/2 dans le hangar reste local au hangar (voir PROFILE setFitModalConfig).
  if (String(h.activeConfig ?? "1") === cfg) {
    h.fit = h.fits[cfg];
  }

  ensureUserShape(u);
  saveUser(u);
  writeCurrent({ id: u.id, pseudo: u.pseudo, email: u.email });

  localStorage.setItem("orbit_sync", String(Date.now()));

  return { ok: true, user: u, config: Number(cfg) };
}

// Validate the whole displayed configuration before publishing one account update.
export function saveHangarLoadout(hangarId, { ship, drones = {}, pet = null }, configNo = null) {
  const u = getCurrentUserFull();
  if (!u) return { ok: false, error: "Non connecté." };
  const h = u.hangars.find(entry => entry.id === hangarId);
  if (!h) return { ok: false, error: "Hangar introuvable." };
  const previousPetShieldMax = petShieldCapacity(u);
  const cfg = String(Number(configNo ?? h.activeConfig) === 2 ? 2 : 1);
  const usage = new Map();
  const count = id => { if (id) usage.set(id, (usage.get(id) || 0) + 1); };
  const shipFit = normalizeFitForShip(h.shipId, ship);
  for (const [group, ids] of Object.entries(shipFit)) {
    for (const id of ids.filter(Boolean)) {
      if (group === "shipMods") {
        const mod = u.inventory.shipModules.find(entry => entry.id === id);
        if (!mod || String(mod.familyId || getShipFamilyId(mod.shipId)) !== getShipFamilyId(h.shipId)) {
          return { ok: false, error: "Module incompatible avec ce vaisseau." };
        }
      } else {
        const item = findCatalogItem(id);
        const types = { lasers: ["laser"], gens: ["speed", "shield"], extras: ["extra"] };
        if (!item || item.petOnly || !types[group].includes(item.module?.type)) {
          return { ok: false, error: "Équipement incompatible avec le vaisseau." };
        }
      }
      count(id);
    }
  }
  for (const id of Object.keys(drones)) {
    if (!u.drones.items.some(drone => drone.id === id)) return { ok: false, error: "Drone introuvable." };
  }
  for (const drone of u.drones.items) {
    const value = normalizeDroneFitValue(drones[drone.id] ?? getDroneFit(drone, h.id, cfg), DRONE_TYPES[drone.type].slots);
    for (const id of value.equipment.filter(Boolean)) {
      const item = findCatalogItem(id);
      if (!item || item.petOnly || !["laser", "shield"].includes(item.module?.type)) {
        return { ok: false, error: "Équipement incompatible avec les drones." };
      }
      count(id);
    }
    drone.fitsByHangar[h.id][cfg] = value;
  }
  if (pet && u.pet?.owned !== true) return { ok: false, error: "P.E.T non possédé." };
  if (u.pet?.owned === true) {
    const level = getPetLevel(u.pet.exp);
    const value = normalizePetFitValue(pet ?? getPetFit(u.pet, h.id, cfg), level);
    for (const group of ["lasers", "generators", "gears", "protocols"]) {
      for (const id of value[group].filter(Boolean)) {
        const error = petFitSlotError(id, group, level);
        if (error) return { ok: false, error };
        count(id);
      }
    }
    u.pet.fitsByHangar[h.id][cfg] = value;
  }
  for (const [id, used] of usage) {
    const owned = u.inventory.shipModules.some(mod => mod.id === id) ? 1 : getOwnedCount(u, id);
    if (used > owned) return { ok: false, error: `Trop de "${findCatalogItem(id)?.name || id}" équipés : ${used}/${owned}.` };
  }
  h.fits[cfg] = shipFit;
  if (String(h.activeConfig) === cfg) h.fit = shipFit;
  ensureUserShape(u);
  saveUser(u, { previousPetShieldMax });
  localStorage.setItem("orbit_sync", String(Date.now()));
  return { ok: true, user: u, config: Number(cfg) };
}

export function setActiveHangarConfig(hangarId, configNo) {
  const u = getCurrentUserFull();
  if (!u) return { ok: false, error: "Non connecté." };

  const h = (u.hangars || []).find((x) => x?.id === hangarId);
  if (!h) return { ok: false, error: "Hangar introuvable." };
  const previousPetShieldMax = petShieldCapacity(u);

  const cfg = Number(configNo) === 2 ? 2 : 1;
  const shipId = h.shipId || u.ship;

  h.fits ??= {};
  h.fits["1"] = normalizeFitForShip(shipId, h.fits["1"] || h.fit || makeEmptyFit(shipId));
  h.fits["2"] = normalizeFitForShip(shipId, h.fits["2"] || makeEmptyFit(shipId));

  h.activeConfig = cfg;
  h.fit = h.fits[String(cfg)];

  ensureUserShape(u);
  saveUser(u, { previousPetShieldMax });
  writeCurrent({ id: u.id, pseudo: u.pseudo, email: u.email });

  localStorage.setItem("orbit_sync", String(Date.now()));

  return { ok: true, user: u, config: cfg };
}

export function getActiveHangarCombatStats() {
  const u = getCurrentUserFull();
  if (!u) return null;

  const h = getActiveHangar(u);
  if (!h) return null;

  const shipId = h.shipId || u.ship;
  const slots = getShipSlots(shipId);
  const fit = clampFitToSlots(shipId, getHangarActiveFit(h) || {});

  const { dmg, bonusSpeed, bonusShield, bonusAbsorb } = computeCombatFromFit(fit);

  return {
    shipId,
    slots,
    fit,

    totalLaserDamage: dmg,
    bonusSpeed,
    bonusShield,
    bonusAbsorb,

    extras: fit.extras.filter(Boolean),
  };
}

// ---------------------------
// ✅ Position/Map API (par hangar actif)
// ---------------------------

export function getActiveHangarLastPos() {
  const u = getCurrentUserFull();
  if (!u) return null;

  const h = getActiveHangar(u);
  if (!h) return null;

  return h.lastPos || null;
}

export function saveActiveHangarPos(x, y) {
  const u = getCurrentUserFull();
  if (!u) return { ok: false, error: "Non connecté." };

  const h = getActiveHangar(u);
  if (!h) return { ok: false, error: "Hangar introuvable." };

  const px = Number(x);
  const py = Number(y);

  if (!Number.isFinite(px) || !Number.isFinite(py)) {
    return { ok: false, error: "Coordonnées invalides." };
  }

  h.lastPos = { x: px, y: py };

  saveUser(u, { previousPetShieldMax });
  return { ok: true };
}

export function clearActiveHangarPos() {
  const u = getCurrentUserFull();
  if (!u) return { ok: false, error: "Non connecté." };

  const h = getActiveHangar(u);
  if (!h) return { ok: false, error: "Hangar introuvable." };

  h.lastPos = null;

  saveUser(u);
  return { ok: true };
}

export function getActiveHangarLastMap() {
  const u = getCurrentUserFull();
  if (!u) return null;

  const h = getActiveHangar(u);
  if (!h) return null;

  return h.lastMap || null;
}

export function saveActiveHangarMap(mapId) {
  const u = getCurrentUserFull();
  if (!u) return { ok: false, error: "Non connecté." };

  const h = getActiveHangar(u);
  if (!h) return { ok: false, error: "Hangar introuvable." };

  h.lastMap = String(mapId || "").toLowerCase() || null;

  saveUser(u);
  return { ok: true };
}

export function saveActiveHangarState(x, y, mapId, hpPct, shPct) {
  const u = getCurrentUserFull();
  if (!u) return { ok: false, error: "Non connecté." };

  const h = getActiveHangar(u);
  if (!h) return { ok: false, error: "Hangar introuvable." };

  const px = Number(x);
  const py = Number(y);
  if (Number.isFinite(px) && Number.isFinite(py)) {
    h.lastPos = { x: px, y: py };
  }

  if (mapId) {
    h.lastMap = String(mapId).toLowerCase();
  }

  // ✅ persiste la vitalité (ratio vie/bouclier) pour la restaurer après un refresh
  if (Number.isFinite(Number(hpPct))) h.lastHpPct = Math.max(0, Math.min(1, Number(hpPct)));
  if (Number.isFinite(Number(shPct))) h.lastShPct = Math.max(0, Math.min(1, Number(shPct)));

  // La position est sauvegardée périodiquement et ne modifie aucune vue UI.
  saveUser(u, { notify: false });
  return { ok: true };
}

export function getActiveHangarState() {
  const u = getCurrentUserFull();
  if (!u) return { pos: null, map: null };

  const h = getActiveHangar(u);
  if (!h) return { pos: null, map: null };

  return {
    pos: h.lastPos || null,
    map: h.lastMap || null,
    hpPct: Number.isFinite(Number(h.lastHpPct)) ? Number(h.lastHpPct) : null,
    shPct: Number.isFinite(Number(h.lastShPct)) ? Number(h.lastShPct) : null,
  };
}

// ---------------------------
// Compat exports
// ---------------------------
export function getCurrentUserPublic() {
  return getCurrentUser();
}

export function _dangerResetAll() {
  localStorage.removeItem(USERS_KEY);
  localStorage.removeItem(CUR_KEY);
  return { ok: true };
}

export function sellItem(itemId, qty = 1) {
  const u = getCurrentUserFull();
  if (!u) return { ok: false, error: "Non connecté." };

  itemId = String(itemId || "");
  qty = Math.max(1, Number(qty || 1) | 0);

  const it = findCatalogItem(itemId);
  if (!it) return { ok: false, error: "Item introuvable." };

  // pas de vente de ships ici
  if (it.ship) return { ok: false, error: "Impossible de vendre un vaisseau ici." };

  // pas de vente de designs ici
  if (it.design) return { ok: false, error: "Impossible de vendre un design." };

  // pas de vente de P.E.T ici (unique)
  if (it.pet) return { ok: false, error: "Impossible de vendre un P.E.T." };

  const price = Number(it.price || 0);
  if (!Number.isFinite(price) || price <= 0) return { ok: false, error: "Prix invalide." };

  const owned = getOwnedCount(u, itemId);
  if (owned < qty) return { ok: false, error: "Pas assez d'exemplaires." };

  // Configurations can reuse copies, but a sale must leave enough for each one.
  let reserved = 0;
  for (const h of u.hangars || []) {
    for (const cfg of ["1", "2"]) {
      const fit = h.fits?.[cfg] || {};
      const equipped = [...(fit.lasers || []), ...(fit.gens || []), ...(fit.extras || [])];
      for (const drone of u.drones.items) equipped.push(...getDroneFit(drone, h.id, cfg).equipment);
      if (u.pet?.owned === true) {
        const pet = getPetFit(u.pet, h.id, cfg);
        for (const group of ["lasers", "generators", "gears", "protocols"]) equipped.push(...pet[group]);
      }
      reserved = Math.max(reserved, equipped.filter(id => id === itemId).length);
    }
  }
  if (owned - qty < reserved) return { ok: false, error: "Objet équipé : retire-le et applique les changements avant de le vendre." };

  const gainEach = Math.floor(price * 0.5);
  const gain = gainEach * qty;

  incCount(u, itemId, -qty);
  if (u.inventory?.counts?.[itemId] <= 0) delete u.inventory.counts[itemId];

  u.credits = Number(u.credits || 0) + gain;

  if (Array.isArray(u.inventory?.modules)) {
    if (!u.inventory.counts?.[itemId]) {
      u.inventory.modules = u.inventory.modules.filter((x) => x !== itemId);
    }
  }

  ensureUserShape(u);
  saveUser(u);

  writeCurrent({ id: u.id, pseudo: u.pseudo, email: u.email });

  return { ok: true, user: u, gain, gainEach };
}

// ---------------------------
// ✅ Roulette ship modules
// ---------------------------
export function buyModuleRoll(cost = 250000) {
  const u = getCurrentUserFull();
  if (!u) return { ok: false, error: "Non connecté." };

  cost = Math.max(0, Number(cost || 0));
  if (u.credits < cost) return { ok: false, error: "Crédits insuffisants." };

  u.credits -= cost;

  ensureUserShape(u);
  saveUser(u);
  writeCurrent({ id: u.id, pseudo: u.pseudo, email: u.email });

  return { ok: true, user: u };
}

export function addShipModule(moduleObj) {
  const u = getCurrentUserFull();
  if (!u) return { ok: false, error: "Non connecté." };

  ensureUserShape(u);

  if (!moduleObj || typeof moduleObj !== "object") {
    return { ok: false, error: "Module invalide." };
  }

  u.inventory.shipModules.push(moduleObj);
  u.inventory.moduleRollHistory.push({ ...moduleObj });

  saveUser(u);
  writeCurrent({ id: u.id, pseudo: u.pseudo, email: u.email });

  return { ok: true, user: u };
}

// ✅ Reroll : remplace le module précédent (même chaine de rerolls)
export function replaceShipModule(oldId, newModule) {
  const u = getCurrentUserFull();
  if (!u) return { ok: false, error: "Non connecté." };

  ensureUserShape(u);

  if (!newModule || typeof newModule !== "object") {
    return { ok: false, error: "Module invalide." };
  }

  if (oldId) {
    u.inventory.shipModules = u.inventory.shipModules.filter((m) => m?.id !== oldId);
    u.inventory.moduleRollHistory = u.inventory.moduleRollHistory.filter((h) => h?.id !== oldId);
  }

  u.inventory.shipModules.push(newModule);
  u.inventory.moduleRollHistory.push({ ...newModule });

  saveUser(u);
  writeCurrent({ id: u.id, pseudo: u.pseudo, email: u.email });

  return { ok: true, user: u };
}

// ✅ Hangar ID (verrou de session)
export function getActiveHangarId() {
  const u = getCurrentUserFull();
  if (!u) return null;

  const hs = Array.isArray(u.hangars) ? u.hangars : [];
  const h = hs.find(x => x?.shipId === u.ship) || hs.find(x => x?.active) || hs[0] || null;
  return h?.id || null;
}

// ✅ lire état d’un hangar précis
export function getHangarStateById(hangarId) {
  const u = getCurrentUserFull();
  if (!u) return { pos: null, map: null };

  const h = (u.hangars || []).find(x => x?.id === hangarId) || null;
  if (!h) return { pos: null, map: null };

  return {
    pos: h.lastPos || null,
    map: h.lastMap || null,
    hpPct: Number.isFinite(Number(h.lastHpPct)) ? Number(h.lastHpPct) : null,
    shPct: Number.isFinite(Number(h.lastShPct)) ? Number(h.lastShPct) : null,
  };
}

// ✅ save état dans un hangar précis (IMPORTANT)
export function saveHangarStateById(hangarId, x, y, mapId, hpPct, shPct) {
  const u = getCurrentUserFull();
  if (!u) return { ok: false, error: "Non connecté." };

  const h = (u.hangars || []).find(x => x?.id === hangarId) || null;
  if (!h) return { ok: false, error: "Hangar introuvable." };

  const px = Number(x);
  const py = Number(y);
  if (Number.isFinite(px) && Number.isFinite(py)) h.lastPos = { x: px, y: py };

  if (mapId) h.lastMap = String(mapId).toLowerCase();

  // ✅ persiste la vitalité (ratio vie/bouclier) pour la restaurer après un refresh
  if (Number.isFinite(Number(hpPct))) h.lastHpPct = Math.max(0, Math.min(1, Number(hpPct)));
  if (Number.isFinite(Number(shPct))) h.lastShPct = Math.max(0, Math.min(1, Number(shPct)));

  // Évite un recalcul complet de l'équipement à chaque sauvegarde de position.
  saveUser(u, { notify: false });
  return { ok: true };
}

export function craftCurrentUserRecipe(recipeId, requestedQuantity = 1) {
  // Assemblage désactivé (voir CRAFTING_ENABLED) : refusé, code conservé.
  if (!CRAFTING_ENABLED) return { ok: false, error: "Assemblage désactivé." };
  const u = getCurrentUserFull();
  if (!u) return { ok: false, error: "Aucun utilisateur connecté." };
  const recipe = getCraftingRecipe(recipeId);
  if (!recipe) return { ok: false, error: "Recette introuvable." };
  const quantity = Math.min(100, Math.max(1, Math.floor(Number(requestedQuantity) || 1)));
  if (Object.keys(recipe.output?.ships || {}).length && quantity !== 1) {
    return { ok: false, error: "Un vaisseau se fabrique un par un." };
  }
  for (const shipId of Object.keys(recipe.output?.ships || {})) {
    if (u.inventory?.ships?.includes(shipId)) return { ok: false, error: "Ce vaisseau est déjà possédé." };
  }
  for (const [type, unitAmount] of Object.entries(recipe.output?.drones || {})) {
    const definition = DRONE_TYPES[type];
    const owned = u.drones.items.filter(drone => drone.type === type).length;
    if (!definition || owned + Number(unitAmount || 0) * quantity > definition.maxOwned) return { ok: false, error: `Limite de drones ${definition?.name || type} dépassée.` };
  }
  for (const formationId of Object.keys(recipe.output?.formations || {})) {
    if (u.drones.formations.includes(formationId)) return { ok: false, error: "Formation déjà possédée." };
  }
  const creditCost = Math.max(0, Number(recipe.costs?.credits || 0)) * quantity;
  if (Number(u.credits || 0) < creditCost) return { ok: false, error: "Crédits insuffisants." };

  u.inventory ||= {};
  u.inventory.resources ||= {};
  for (const [resourceId, unitCost] of Object.entries(recipe.costs?.resources || {})) {
    const required = Math.max(0, Number(unitCost || 0)) * quantity;
    if (Number(u.inventory.resources[resourceId] || 0) < required) {
      return { ok: false, error: `Ressource insuffisante : ${resourceId}.` };
    }
  }

  u.credits -= creditCost;
  for (const [resourceId, unitCost] of Object.entries(recipe.costs?.resources || {})) {
    u.inventory.resources[resourceId] = Math.max(0, Number(u.inventory.resources[resourceId] || 0) - Number(unitCost || 0) * quantity);
  }
  for (const [resourceId, unitAmount] of Object.entries(recipe.output?.resources || {})) {
    u.inventory.resources[resourceId] = Math.max(0, Number(u.inventory.resources[resourceId] || 0) + Number(unitAmount || 0) * quantity);
  }
  for (const [itemId, unitAmount] of Object.entries(recipe.output?.items || {})) incCount(u, itemId, Number(unitAmount || 0) * quantity);
  for (const [rocketId, unitAmount] of Object.entries(recipe.output?.rockets || {})) {
    u.rockets ??= {};
    u.rockets[rocketId] = Math.max(0, Math.floor(Number(u.rockets[rocketId] || 0) + Number(unitAmount || 0) * quantity));
  }
  for (const shipId of Object.keys(recipe.output?.ships || {})) {
    u.inventory.ships ??= [];
    u.hangars ??= [];
    u.inventory.ships.push(shipId);
    if (!u.hangars.some(hangar => hangar?.shipId === shipId)) u.hangars.push(makeHangar(shipId, false));
  }
  for (const [type, unitAmount] of Object.entries(recipe.output?.drones || {})) {
    const count = Number(unitAmount || 0) * quantity;
    for (let index = 0; index < count; index++) u.drones.items.push(createDrone(type, `drone_${uuid()}`));
  }
  for (const formationId of Object.keys(recipe.output?.formations || {})) u.drones.formations.push(formationId);
  u.ammo ??= defaultAmmo();
  for (const [ammoId, unitAmount] of Object.entries(recipe.output?.ammo || {})) {
    if (ammoId !== "x1") u.ammo[ammoId] = Math.max(0, Number(u.ammo[ammoId] || 0) + Number(unitAmount || 0) * quantity);
  }
  ensureUserShape(u);
  saveUser(u);
  localStorage.setItem("orbit_sync", String(Date.now()));
  return { ok: true, user: u, recipe, quantity };
}

// Raffinage minerais -> minerais nobles (ratios officiels, voir REFINERY_RECIPES).
export function refineCurrentUserOre(recipeId, requestedQuantity = 1) {
  const u = getCurrentUserFull();
  if (!u) return { ok: false, error: "Aucun utilisateur connecté." };
  const recipe = getRefineryRecipe(recipeId);
  if (!recipe) return { ok: false, error: "Recette introuvable." };
  u.inventory ||= {};
  u.inventory.resources ||= {};
  const { quantity, gained } = refineOreOutput(u.inventory.resources, recipe, requestedQuantity);
  if (quantity <= 0) return { ok: false, error: "Minerais insuffisants.", user: u };
  for (const [resourceId, perUnit] of Object.entries(recipe.inputs)) {
    u.inventory.resources[resourceId] = Math.max(0, Number(u.inventory.resources[resourceId] || 0) - Math.floor(Number(perUnit) || 0) * quantity);
  }
  u.inventory.resources[recipe.output.id] = Math.max(0, Number(u.inventory.resources[recipe.output.id] || 0) + gained);
  ensureUserShape(u);
  saveUser(u);
  return { ok: true, user: u, recipe, quantity, gained };
}

// Vente de minerais au comptoir pirate (prix fixes, tout le stock du minerai).
// bonusPct : bonus Cargo Trader du P.E.T (0 = plein tarif).
export function sellCurrentUserOre(resourceId, bonusPct = 0) {  const u = getCurrentUserFull();
  if (!u) return { ok: false, error: "Aucun utilisateur connecté." };
  const id = String(resourceId || "");
  const price = Math.max(0, Math.floor(Number(ORE_SELL_PRICES[id]) || 0));
  if (price <= 0) return { ok: false, error: "Ce minerai ne se vend pas ici.", user: u };
  u.inventory ||= {};
  u.inventory.resources ||= {};
  const owned = Math.max(0, Math.floor(Number(u.inventory.resources[id]) || 0));
  if (owned <= 0) return { ok: false, error: "Stock vide.", user: u };
  const gained = Math.floor(owned * price * (1 + Math.max(0, Number(bonusPct) || 0) / 100));
  u.inventory.resources[id] = 0;
  u.credits = Math.max(0, Number(u.credits || 0)) + gained;
  ensureUserShape(u);
  saveUser(u);
  return { ok: true, user: u, resourceId: id, quantity: owned, gained };
}

// Échange Palladium -> énergie Galaxy (10:1, comptoir pirate). Tout le possible.
export function exchangeCurrentUserPalladiumForEnergy() {
  const u = getCurrentUserFull();
  if (!u) return { ok: false, error: "Aucun utilisateur connecté." };
  u.inventory ||= {};
  u.inventory.resources ||= {};
  u.galaxyGates = normalizeGalaxyGateState(u.galaxyGates);
  const owned = Math.max(0, Math.floor(Number(u.inventory.resources.palladium) || 0));
  const { energies, cost } = palladiumExchangeForEnergy(owned, Infinity);
  if (energies <= 0) return { ok: false, error: `Palladium insuffisant (il faut ${PALLADIUM_PER_GALAXY_ENERGY} Palladium pour 1 énergie).`, user: u };
  u.inventory.resources.palladium = owned - cost;
  u.galaxyGates.energy += energies;
  ensureUserShape(u);
  saveUser(u);
  return { ok: true, energies, cost, user: u };
}

// Charge des minerais sur un équipement (1 minerai = 10 tirs ou 10 minutes).
export function chargeShipUpgrade(slotId, oreId, oreAmount = 1) {
  const u = getCurrentUserFull();
  if (!u) return { ok: false, error: "Aucun utilisateur connecté." };
  const slot = String(slotId || "");
  const ore = String(oreId || "");
  if (!(UPGRADE_SLOT_ORES[slot] || []).includes(ore)) return { ok: false, error: "Minerai incompatible.", user: u };
  const amount = Math.max(1, Math.floor(Number(oreAmount) || 1));
  u.inventory ||= {};
  u.inventory.resources ||= {};
  const owned = Math.max(0, Math.floor(Number(u.inventory.resources[ore]) || 0));
  if (owned < amount) return { ok: false, error: `Il faut ${amount} ${ore} (stock : ${owned}).`, user: u };
  u.upgrades ||= {};
  const current = u.upgrades[slot] || {};
  u.inventory.resources[ore] = owned - amount;
  // Même minerai : on cumule. Sinon on remplace (l'ancien est perdu, comme sur DO).
  u.upgrades[slot] = String(current.ore) === ore
    ? { ore, stock: Math.max(0, Math.floor(Number(current.stock) || 0)) + amount * 10 }
    : { ore, stock: amount * 10 };
  ensureUserShape(u);
  saveUser(u);
  return { ok: true, user: u, slot, ore, stock: u.upgrades[slot].stock };
}

