// src/core/account.js
"use strict";

import { findCatalogItem } from "./catalog.js";
import { SHIP_PACKS } from "../data/shipPacks.js";
import { normalizeQuestState, QUEST_DEFINITIONS } from "../data/quests.js";
import { calculateRankPoints, getQuestHonorReward } from "./progression.js";
import { getFaction, getFactionBaseSpawn, normalizeFactionId } from "./factions.js";
import { compactFitDraft } from "./fitLayout.js";
import { completeActiveGalaxyGate, consumeBuiltGalaxyGate, deployBuiltGalaxyGate, GALAXY_GATE_DEFINITIONS, loseGalaxyGateLife, normalizeGalaxyGateState, setGalaxyGateMultiplierArmed, spinGalaxyGate } from "./galaxyGates.js";
import { getCraftingRecipe } from "../data/crafting.js";
import { createDrone, DRONE_FORMATIONS, DRONE_LEVEL_XP, DRONE_MAX_LEVEL, DRONE_TYPES, getDroneLevel, getIrisPrice, MAX_IRIS_DRONES, SPECIAL_DRONE_PRICE } from "../data/drones.js";

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
  const arr = safeParse(localStorage.getItem(USERS_KEY), []);
  return Array.isArray(arr) ? arr.filter((u) => u && typeof u === "object") : [];
}

function writeUsers(users) {
  localStorage.setItem(USERS_KEY, JSON.stringify(Array.isArray(users) ? users : []));
}

function readCurrent() {
  return safeParse(localStorage.getItem(CUR_KEY), null);
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
  return (SHIP_PACKS || []).find((p) => String(p?.id) === String(shipId)) || null;
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
  if (u.ammo.x1 === -1) u.ammo.x1 = Infinity;
  u.ammo.x1 = Infinity;

  // normalise les munitions connues
  const AMMO_KEYS = ["x2", "x3", "x4", "x6", "sab", "ABL", "RADION"];
  for (const k of AMMO_KEYS) {
    u.ammo[k] = Math.max(0, Number(u.ammo[k] || 0));
  }

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
    return {
      id: String(drone.id || `drone_${u.id}_${index}`), type: drone.type, exp,
      level: getDroneLevel(exp),
      fits: { "1": normalizedFit(fits["1"] || fit), "2": normalizedFit(fits["2"] || {}) },
      fit: normalizedFit(fits[String(Number(u.hangars?.find(h => h?.active)?.activeConfig) === 2 ? 2 : 1)] || fit),
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

  // starter ship toujours owned
  if (!u.inventory.ships.includes(STARTER_SHIP_ID)) u.inventory.ships.push(STARTER_SHIP_ID);

  // hangars
  if (!Array.isArray(u.hangars)) u.hangars = [];

  // 1 hangar par ship possédé
  for (const shipId of u.inventory.ships) {
    if (!u.hangars.some((h) => h && h.shipId === shipId)) {
      u.hangars.push(makeHangar(shipId, false));
    }
  }

  if (!u.hangars.length) {
    u.hangars.push(makeHangar(STARTER_SHIP_ID, true));
  }

  // actif cohérent avec u.ship
  let activeHangar = u.hangars.find((h) => h?.shipId === u.ship) || null;
  if (!activeHangar) {
    u.ship = u.hangars[0].shipId || STARTER_SHIP_ID;
    activeHangar = u.hangars[0];
  }
  for (const h of u.hangars) h.active = h === activeHangar;

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

  const addModule = (itemId) => {
    if (!itemId) return;
    const it = findCatalogItem(itemId);
    if (!it?.module) return;

    const t = it.module.type;
    if (t === "laser") dmg += Number(it.module.damage || 0);
    if (t === "speed") bonusSpeed += Number(it.module.bonusSpeed || 0);
    if (t === "shield") bonusShield += Number(it.module.bonusShield || 0);
  };

  for (const id of fit.lasers) addModule(id);
  for (const id of fit.gens) addModule(id);
  // extras: pas de stats pour l'instant

  return { dmg, bonusSpeed, bonusShield };
}

function saveUser(user, options = {}) {
  user.schemaVersion = STORAGE_SCHEMA_VERSION;
  user.updatedAt = Date.now();
  user.revision = Math.max(0, Math.floor(Number(user.revision) || 0)) + 1;
  const users = readUsers();
  const idx = users.findIndex((x) => x?.id === user.id);
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
    password,
    faction: requestedFaction,
    createdAt: Date.now(),
    credits: STARTER_CREDITS,
    ammo: defaultAmmo(),
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
  if (String(u0.password) !== pass) return { ok: false, error: "Mot de passe incorrect." };

  const u = ensureUserShape(u0);
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
  if (String(u.password || "") !== String(currentPassword || "")) {
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
  if (String(u.password || "") !== String(currentPassword || "")) {
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

export function changeCurrentUserPassword(currentPassword, newPassword) {
  const u = getCurrentUserFull();
  if (!u) return { ok: false, error: "Aucun utilisateur connecté." };
  if (String(u.password || "") !== String(currentPassword || "")) {
    return { ok: false, error: "Mot de passe actuel incorrect." };
  }

  const nextPassword = String(newPassword || "");
  if (nextPassword.length < 4) return { ok: false, error: "Le nouveau mot de passe doit contenir au moins 4 caractères." };
  if (nextPassword === String(currentPassword || "")) return { ok: false, error: "Choisis un mot de passe différent de l'ancien." };

  u.password = nextPassword;
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
  }

  if (patch.inventory?.resources && typeof patch.inventory.resources === "object" && !Array.isArray(patch.inventory.resources)) {
    u.inventory ||= {};
    u.inventory.resources = Object.fromEntries(Object.entries(patch.inventory.resources)
      .map(([resourceId, quantity]) => [String(resourceId), Math.max(0, Math.floor(Number(quantity) || 0))])
      .filter(([, quantity]) => quantity > 0));
  }
  if (patch.drones && typeof patch.drones === "object") u.drones = structuredClone(patch.drones);

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
 * - Ships: unique
 * - Tout le reste: achetable plusieurs fois => counts[itemId]++
 */
export function buyItem(itemId, requestedQuantity = 1) {
  const u = getCurrentUserFull();
  if (!u) return { ok: false, error: "Non connecté." };

  const item = findCatalogItem(itemId);
  if (!item) return { ok: false, error: "Item introuvable." };

  const isShip = !!item.ship?.id;
  const quantity = isShip
    ? 1
    : Math.min(999, Math.max(1, Math.floor(Number(requestedQuantity) || 1)));
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

  // modules (multi)
  if (item.module) {
    incCount(u, item.id, quantity);
    // compat
    if (!u.inventory.modules.includes(item.id)) u.inventory.modules.push(item.id);
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

export function saveCurrentUserDroneFit(droneId, fit, configNo = null) {
  const u = getCurrentUserFull();
  const drone = u?.drones?.items?.find(entry => entry.id === droneId);
  const definition = drone ? DRONE_TYPES[drone.type] : null;
  if (!u || !drone || !definition) return { ok: false, error: "Drone introuvable." };
  const equipment = Array.from({ length: definition.slots }, (_, index) => fit?.equipment?.[index] || null);
  const activeHangar = getActiveHangar(u);
  const cfg = String(Number(configNo ?? activeHangar?.activeConfig) === 2 ? 2 : 1);
  drone.fits ||= {};
  drone.fits[cfg] = { equipment, ability: fit?.ability || null };
  drone.fit = drone.fits[cfg];
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
    const equipment = Array.from({ length: definition.slots }, (_, index) => entry.fit?.equipment?.[index] || null);
    const cfg = String(Number(entry.configNo ?? activeHangar?.activeConfig) === 2 ? 2 : 1);
    drone.fits ||= {};
    drone.fits[cfg] = { equipment, ability: entry.fit?.ability || null };
    drone.fit = drone.fits[cfg];
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

export function spinCurrentUserGalaxyGate(gateId, count = 1, rng = Math.random) {
  const u = getCurrentUserFull();
  if (!u) return { ok: false, error: "Aucun utilisateur connecté." };
  const result = spinGalaxyGate(u.galaxyGates, gateId, count, u.credits, rng);
  if (!result.ok) return result;
  u.galaxyGates = result.state;
  u.credits = result.credits;
  for (const [ammoId, amount] of Object.entries(result.rewards.ammo)) {
    u.ammo[ammoId] = Math.max(0, Number(u.ammo[ammoId]) || 0) + amount;
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

  h.activeConfig = Number(cfg);
  h.fit = h.fits[cfg];

  ensureUserShape(u);
  saveUser(u);
  writeCurrent({ id: u.id, pseudo: u.pseudo, email: u.email });

  localStorage.setItem("orbit_sync", String(Date.now()));

  return { ok: true, user: u, config: Number(cfg) };
}

export function setActiveHangarConfig(hangarId, configNo) {
  const u = getCurrentUserFull();
  if (!u) return { ok: false, error: "Non connecté." };

  const h = (u.hangars || []).find((x) => x?.id === hangarId);
  if (!h) return { ok: false, error: "Hangar introuvable." };

  const cfg = Number(configNo) === 2 ? 2 : 1;
  const shipId = h.shipId || u.ship;

  h.fits ??= {};
  h.fits["1"] = normalizeFitForShip(shipId, h.fits["1"] || h.fit || makeEmptyFit(shipId));
  h.fits["2"] = normalizeFitForShip(shipId, h.fits["2"] || makeEmptyFit(shipId));

  h.activeConfig = cfg;
  h.fit = h.fits[String(cfg)];

  ensureUserShape(u);
  saveUser(u);
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

  const { dmg, bonusSpeed, bonusShield } = computeCombatFromFit(fit);

  return {
    shipId,
    slots,
    fit,

    totalLaserDamage: dmg,
    bonusSpeed,
    bonusShield,

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

  saveUser(u);
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

  const price = Number(it.price || 0);
  if (!Number.isFinite(price) || price <= 0) return { ok: false, error: "Prix invalide." };

  const owned = getOwnedCount(u, itemId);
  if (owned < qty) return { ok: false, error: "Pas assez d'exemplaires." };

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

