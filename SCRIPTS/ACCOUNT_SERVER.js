// SCRIPTS/ACCOUNT_SERVER.js — Comptes serveur (SQLite, zero dependance).
// Persistance autoritaire du blob user + auth par token. La logique jeu
// (credits, inventaire...) reste calculee par le client ; le serveur stocke,
// horodate et protege les revisions (anti-ecrasement silencieux).
// Le client local continue de sanitizer (plafond historique, sentinelle Infinity).

import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { computeHangarStats } from "../SHIP/SHIP_HANGARS.js";
import { activeBoosterMults } from "../SRC/DATA/BOOSTERS.js";
import { pilotSkillMults } from "../SRC/DATA/PILOT_SKILLS.js";
import { calculateRankPoints } from "../SRC/CORE/PROGRESSION.js";
import { getShipDesignBaseId } from "../SHIP/SHIP_PACKS.js";
import { DRONE_XP_SHARE, getDroneLevel } from "../DRONE/DRONE_TYPES.js";
import { PET_XP_SHARE, getPetLevel } from "../PET/PET_TYPES.js";
import { NPC_REWARDS } from "../NPC/NPC_BALANCE.js";

const DB_DIR = resolve(process.cwd(), "SERVER_DATA");
const DB_PATH = join(DB_DIR, "orbit.db");

const FACTIONS = new Set(["mmo", "eic", "vru"]);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i;
const TOKEN_TTL_MS = 30 * 24 * 3600 * 1000;
const BODY_LIMIT = 6_000_000;
const STARTER_CREDITS = 55_000_000;

// Anti-bourrinage register/login : 20/min/IP.
const rateLimits = new Map();
function rateLimited(ip, limit = 20) {
  const now = Date.now();
  const e = rateLimits.get(ip);
  if (!e || now > e.reset) {
    rateLimits.set(ip, { n: 1, reset: now + 60_000 });
    return false;
  }
  e.n++;
  return e.n > limit;
}

// --- Mots de passe : meme format que le client ("v1$salt$hex") ---
function sha256hex(str) {
  return createHash("sha256").update(String(str ?? ""), "utf8").digest("hex");
}
function isHash(v) {
  return typeof v === "string" && (v.startsWith("v1$") || v.startsWith("v2$"));
}
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimits) if (!entry || now > Number(entry.reset || 0) + 60_000) rateLimits.delete(key);
}, 60_000).unref?.();
function hashPassword(plain) {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(String(plain ?? ""), salt, 64).toString("hex");
  return `v2$${salt}$${derived}`;
}
function verifyPassword(stored, candidate) {
  const c = String(candidate ?? "");
  if (typeof stored === "string" && stored.startsWith("v2$")) {
    const parts = String(stored).split("$");
    if (parts.length !== 3 || !parts[1] || !parts[2]) return false;
    try {
      const actual = scryptSync(c, parts[1], 64);
      const expected = Buffer.from(parts[2], "hex");
      return actual.length === expected.length && timingSafeEqual(actual, expected);
    } catch { return false; }
  }
  if (typeof stored === "string" && stored.startsWith("v1$")) {
    const parts = String(stored).split("$");
    if (parts.length !== 3 || !parts[1] || !parts[2]) return false;
    const a = sha256hex(`${parts[1]}::${c}`);
    const b = parts[2];
    if (a.length !== b.length) return false;
    try {
      return timingSafeEqual(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
    } catch {
      return false;
    }
  }
  return String(stored ?? "") === c; // legacy clair -> migre au login
}

const norm = (s) => String(s ?? "").trim().toLowerCase();
function uuid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `u_${randomBytes(8).toString("hex")}${Date.now().toString(16)}`;
}

// --- Base ---
let db = null;
export function initAccountDb() {
  if (db) return db;
  mkdirSync(DB_DIR, { recursive: true });
  db = new DatabaseSync(DB_PATH);
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      pseudo TEXT NOT NULL,
      pseudo_norm TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL,
      faction TEXT NOT NULL DEFAULT 'mmo',
      password_hash TEXT NOT NULL,
      data TEXT NOT NULL DEFAULT '{}',
      revision INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_pseudo ON users(pseudo_norm);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
    CREATE TABLE IF NOT EXISTS pvp_stats (
      user_id TEXT PRIMARY KEY,
      kills INTEGER NOT NULL DEFAULT 0,
      xp INTEGER NOT NULL DEFAULT 0,
      honneur INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS npc_reward_tx (
      tx_key TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_npc_reward_tx_created ON npc_reward_tx(created_at);
    CREATE TABLE IF NOT EXISTS friends (
      user_id TEXT NOT NULL,
      friend_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, friend_id)
    );
    CREATE INDEX IF NOT EXISTS idx_friends_user ON friends(user_id);
    CREATE TABLE IF NOT EXISTS friend_requests (
      from_id TEXT NOT NULL,
      to_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (from_id, to_id)
    );
  `);
  // Menage des sessions expirees (toutes les heures).
  const purge = () => {
    try { db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(Date.now()); } catch {}
    try { db.prepare("DELETE FROM npc_reward_tx WHERE created_at < ?").run(Date.now() - 7 * 24 * 3600_000); } catch {}
  };
  purge();
  setInterval(purge, 3600_000).unref?.();
  // Migration : colonne pseudo_norm pour les bases existantes (casse affichee preservee).
  try { db.exec("ALTER TABLE users ADD COLUMN pseudo_norm TEXT NOT NULL DEFAULT ''"); } catch {}
  try { db.exec("UPDATE users SET pseudo_norm = lower(trim(pseudo)) WHERE pseudo_norm = '' OR pseudo_norm IS NULL"); } catch {}
  try { db.exec("DROP INDEX IF EXISTS idx_users_pseudo"); } catch {}
  try { db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_pseudo ON users(pseudo_norm)"); } catch {}
  return db;
}

function rowToPublic(row) {
  let data = {};
  try { data = JSON.parse(row.data) || {}; } catch {}
  if (data && typeof data === "object") {
    data.id = row.id;
    data.pseudo = row.pseudo;
    data.email = row.email;
    data.faction = row.faction;
  }
  return data;
}

function bearerToken(req) {
  const h = req.headers?.authorization || "";
  const m = /^Bearer\s+(.+)$/i.exec(String(h).trim());
  return m ? m[1].slice(0, 128) : "";
}

// Kill NPC de zone : transaction persistante et idempotente. Le serveur lit
// lui-meme l'equipement, les boosters et l'arbre pilote du compte ; aucun
// montant annonce par le navigateur n'est accepte.
export function awardNpcKill(accountId, npcType, mapId, rewardPercent, ownsKill, txKey) {
  initAccountDb();
  const uid = String(accountId || "");
  const type = String(npcType || "");
  const key = String(txKey || "").slice(0, 240);
  const reward = NPC_REWARDS[type];
  if (!uid || !key || !reward) return null;
  const pct = Math.max(0, Math.min(100, Math.floor(Number(rewardPercent) || 0)));
  if (pct <= 0) return null;
  let inTx = false;
  try {
    db.exec("BEGIN IMMEDIATE");
    inTx = true;
    const inserted = db.prepare("INSERT OR IGNORE INTO npc_reward_tx (tx_key, user_id, created_at) VALUES (?, ?, ?)")
      .run(key, uid, Date.now());
    if (!(Number(inserted?.changes) > 0)) {
      db.exec("ROLLBACK");
      return { duplicate: true };
    }
    const row = db.prepare("SELECT * FROM users WHERE id = ?").get(uid);
    if (!row) throw new Error("Compte introuvable");
    let data = {};
    try { data = JSON.parse(row.data || "{}") || {}; } catch { data = {}; }
    const hangars = Array.isArray(data.hangars) ? data.hangars : [];
    const hangar = hangars.find((h) => h?.active) || hangars[0] || null;
    let equipment = { bonusExpPct: 0, bonusHonorPct: 0 };
    try { if (hangar) equipment = computeHangarStats(hangar, data, { mapId }) || equipment; } catch {}
    let boosters = { exp: 1, honor: 1, petXp: 1 };
    try { boosters = activeBoosterMults(data.boosters, Date.now()); } catch {}
    let pilot = {};
    try { pilot = pilotSkillMults(data.pilotSkills) || {}; } catch {}
    const factor = (v) => 1 + Math.max(0, Number(v) || 0) / 100;
    const baseCredits = Math.max(0, Math.floor(Number(reward.credits) * pct / 100));
    const baseExp = Math.max(0, Math.floor(Number(reward.exp) * pct / 100));
    const baseHonor = Math.max(0, Math.floor(Number(reward.honor) * pct / 100));
    const rawShipId = String(hangar?.shipId || data.ship || "");
    const shipXp = String(getShipDesignBaseId(rawShipId) || rawShipId).toLowerCase() === "goliath_x" ? 1.02 : 1;
    const credits = Math.max(0, Math.floor(baseCredits * factor(pilot.creditPct)));
    const exp = Math.max(0, Math.ceil(baseExp * factor(equipment.bonusExpPct) * Math.max(0, Number(boosters.exp) || 1) * factor(pilot.expPct) * shipXp - Number.EPSILON));
    const honor = Math.max(0, Math.ceil(baseHonor * factor(equipment.bonusHonorPct) * Math.max(0, Number(boosters.honor) || 1) * factor(pilot.honorPct) - Number.EPSILON));
    data.credits = Math.max(0, Math.floor(Number(data.credits) || 0)) + credits;
    data.stats ||= { honor: 0, exp: 0, rankPoints: 0, lifetimeKills: 0 };
    data.stats.exp = Math.max(0, Math.floor(Number(data.stats.exp) || 0)) + exp;
    data.stats.honor = Math.max(0, Math.floor(Number(data.stats.honor) || 0)) + honor;
    if (ownsKill === true) {
      data.stats.lifetimeKills = Math.max(0, Math.floor(Number(data.stats.lifetimeKills) || 0)) + 1;
      data.stats.npcKills ||= {};
      data.stats.npcKills[type] = Math.max(0, Math.floor(Number(data.stats.npcKills[type]) || 0)) + 1;
    }
    data.stats.rankPoints = calculateRankPoints(data.stats);
    for (const drone of data.drones?.items || []) {
      drone.exp = Math.max(0, Number(drone.exp) || 0) + exp * DRONE_XP_SHARE;
      drone.level = getDroneLevel(drone.exp);
    }
    let petExp = 0;
    if (data.pet?.owned === true && data.pet.active === true) {
      petExp = exp * PET_XP_SHARE * Math.max(0, Number(boosters.petXp) || 1);
      data.pet.exp = Math.max(0, Number(data.pet.exp) || 0) + petExp;
      data.pet.level = getPetLevel(data.pet.exp);
    }
    const now = Date.now();
    const revision = Math.max(Math.floor(Number(data.revision) || 0), Number(row.revision) || 0) + 1;
    data.revision = revision;
    data.updatedAt = now;
    db.prepare("UPDATE users SET data = ?, revision = ?, updated_at = ? WHERE id = ?")
      .run(JSON.stringify(data), revision, now, uid);
    db.exec("COMMIT");
    inTx = false;
    return { credits, exp, honor, baseExp, baseHonor, petExp, revision, ownsKill: ownsKill === true, type, txKey: key };
  } catch {
    if (inTx) { try { db.exec("ROLLBACK"); } catch {} }
    return null;
  }
}

function sessionKey(token) {
  return sha256hex(`session::${String(token || "")}`);
}

function findSession(token) {
  const raw = String(token || "").slice(0, 128);
  if (!raw) return null;
  // Compatibilite avec les sessions historiques en clair. Toute nouvelle
  // session est stockee sous forme d'empreinte non reutilisable.
  return db.prepare("SELECT token, user_id, expires_at FROM sessions WHERE token = ? OR token = ? LIMIT 1")
    .get(sessionKey(raw), raw) || null;
}

function authUser(req) {
  const token = bearerToken(req);
  if (!token) return null;
  const s = findSession(token);
  if (!s || Number(s.expires_at) < Date.now()) {
    if (s) { try { db.prepare("DELETE FROM sessions WHERE token = ?").run(s.token); } catch {} }
    return null;
  }
  const u = db.prepare("SELECT * FROM users WHERE id = ?").get(s.user_id);
  return u || null;
}

function newSession(userId) {
  const token = `tok_${randomBytes(32).toString("hex")}`;
  const now = Date.now();
  db.prepare("INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)")
    .run(sessionKey(token), userId, now, now + TOKEN_TTL_MS);
  return token;
}

// PvP : stats persistantes du tueur (classement). Retourne la ligne ou null.
export function recordPvpKill(accountId, exp, honneur) {
  try {
    initAccountDb();
    const uid = String(accountId || "");
    if (!uid) return null;
    const exists = db.prepare("SELECT 1 FROM users WHERE id = ?").get(uid);
    if (!exists) return null;
    const e = Math.max(0, Math.floor(Number(exp) || 0));
    const h = Math.max(0, Math.floor(Number(honneur) || 0));
    db.prepare("INSERT INTO pvp_stats (user_id, kills, xp, honneur, updated_at) VALUES (?, 1, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET kills = kills + 1, xp = xp + excluded.xp, honneur = honneur + excluded.honneur, updated_at = excluded.updated_at")
      .run(uid, e, h, Date.now());
    return db.prepare("SELECT kills, xp, honneur FROM pvp_stats WHERE user_id = ?").get(uid);
  } catch { return null; }
}

// Admin (panneau /api/admin/give, meme effet que SCRIPTS/GIVE_CREDITS.js) :
// ajoute/retire des crédits à un compte par pseudo. Révision bumpée :
// le client adopte la version serveur à sa prochaine synchro.
export function adminGiveCredits(pseudo, amount) {
  try {
    initAccountDb();
    const key = norm(pseudo);
    if (!key) return { ok: false, error: "Pseudo manquant." };
    const row = db.prepare("SELECT * FROM users WHERE pseudo_norm = ?").get(key);
    if (!row) return { ok: false, error: "Compte introuvable." };
    const delta = Math.floor(Number(String(amount ?? "").replace(/[\s_]/g, "")) || 0);
    if (!Number.isFinite(delta) || delta === 0) return { ok: false, error: "Montant invalide (entier non nul)." };
    if (Math.abs(delta) > 1e12) return { ok: false, error: "Montant trop grand (max 1 000 Mds)." };
    let data = {};
    try { data = JSON.parse(row.data || "{}") || {}; } catch { data = {}; }
    const before = Math.max(0, Math.floor(Number(data.credits) || 0));
    const after = Math.max(0, before + delta);
    const now = Date.now();
    const newRev = Math.max(Math.floor(Number(data.revision) || 0), Number(row.revision) || 0) + 1;
    data.credits = after;
    data.revision = newRev;
    data.updatedAt = now;
    db.prepare("UPDATE users SET data = ?, revision = ?, updated_at = ? WHERE id = ?")
      .run(JSON.stringify(data), newRev, now, row.id);
    return { ok: true, id: String(row.id), pseudo: String(row.pseudo || "Pilote").slice(0, 20), before, after, given: delta, revision: newRev };
  } catch { return { ok: false, error: "Erreur serveur." }; }
}

// --- Amis façon DO (comptes uniquement) : demande -> acceptation ->
// amitié mutuelle. Les demandes en attente persistent (joueur hors ligne
// les retrouve à la connexion).
// listFriends : [{ id, pseudo }] triés par pseudo.
export function listFriends(userId) {
  try {
    initAccountDb();
    const uid = String(userId || "");
    if (!uid) return [];
    return db.prepare("SELECT u.id AS id, u.pseudo AS pseudo FROM friends f JOIN users u ON u.id = f.friend_id WHERE f.user_id = ? ORDER BY u.pseudo COLLATE NOCASE").all(uid)
      .map((r) => ({ id: String(r.id), pseudo: String(r.pseudo || "Pilote").slice(0, 20) }));
  } catch { return []; }
}

// Recherche d'un compte par pseudo (insensible à la casse).
export function findUserByPseudo(pseudo) {
  try {
    initAccountDb();
    const row = db.prepare("SELECT id, pseudo FROM users WHERE pseudo_norm = ?").get(norm(pseudo));
    if (!row) return null;
    return { id: String(row.id), pseudo: String(row.pseudo || "Pilote").slice(0, 20) };
  } catch { return null; }
}

export function areFriends(a, b) {
  try {
    initAccountDb();
    return !!db.prepare("SELECT 1 FROM friends WHERE user_id = ? AND friend_id = ?").get(String(a), String(b));
  } catch { return false; }
}

export function hasFriendRequest(fromId, toId) {
  try {
    initAccountDb();
    return !!db.prepare("SELECT 1 FROM friend_requests WHERE from_id = ? AND to_id = ?").get(String(fromId), String(toId));
  } catch { return false; }
}

// Demande d'ami : l'autre doit accepter (voir getFriendRequests).
// Erreurs : NOT_FOUND, SELF, ALREADY (déjà amis), SENT (déjà envoyée).
// Demande croisée (l'autre t'a déjà invité) : amitié immédiate (mutual).
export function sendFriendRequest(fromId, pseudo) {
  try {
    initAccountDb();
    const uid = String(fromId || "");
    const target = findUserByPseudo(pseudo);
    if (!uid || !target) return { ok: false, error: "NOT_FOUND" };
    if (target.id === uid) return { ok: false, error: "SELF" };
    if (areFriends(uid, target.id)) return { ok: false, error: "ALREADY" };
    if (hasFriendRequest(uid, target.id)) return { ok: false, error: "SENT", to: target };
    if (hasFriendRequest(target.id, uid)) {
      const r = acceptFriendRequest(uid, target.id);
      if (r.ok) return { ok: true, mutual: true, to: target };
      return { ok: false, error: "SERVER" };
    }
    db.prepare("INSERT INTO friend_requests (from_id, to_id, created_at) VALUES (?, ?, ?)").run(uid, target.id, Date.now());
    return { ok: true, to: target };
  } catch { return { ok: false, error: "SERVER" }; }
}

// Demandes reçues : [{ fromId, pseudo, at }].
export function getFriendRequests(userId) {
  try {
    initAccountDb();
    return db.prepare("SELECT r.from_id AS fromId, u.pseudo AS pseudo, r.created_at AS at FROM friend_requests r JOIN users u ON u.id = r.from_id WHERE r.to_id = ? ORDER BY r.created_at").all(String(userId))
      .map((r) => ({ fromId: String(r.fromId), pseudo: String(r.pseudo || "Pilote").slice(0, 20), at: Number(r.at) || 0 }));
  } catch { return []; }
}

function resolvePeerId(t) {
  const s = String(t || "").trim();
  if (!s) return null;
  const hit = findUserByPseudo(s);
  if (hit) return hit.id;
  try {
    initAccountDb();
    const row = db.prepare("SELECT id FROM users WHERE id = ?").get(s);
    return row ? String(row.id) : null;
  } catch { return null; }
}

// Accepter : amitié mutuelle (les deux sens), demande supprimée.
export function acceptFriendRequest(userId, target) {
  try {
    initAccountDb();
    const uid = String(userId || "");
    const sid = resolvePeerId(target);
    if (!uid || !sid || sid === uid) return { ok: false, error: "NONE" };
    if (!hasFriendRequest(sid, uid)) return { ok: false, error: "NONE" };
    const now = Date.now();
    db.prepare("DELETE FROM friend_requests WHERE from_id = ? AND to_id = ?").run(sid, uid);
    db.prepare("DELETE FROM friend_requests WHERE from_id = ? AND to_id = ?").run(uid, sid);
    db.prepare("INSERT OR IGNORE INTO friends (user_id, friend_id, created_at) VALUES (?, ?, ?)").run(uid, sid, now);
    db.prepare("INSERT OR IGNORE INTO friends (user_id, friend_id, created_at) VALUES (?, ?, ?)").run(sid, uid, now);
    const who = db.prepare("SELECT pseudo FROM users WHERE id = ?").get(sid);
    return { ok: true, friend: { id: sid, pseudo: String(who?.pseudo || "Pilote").slice(0, 20) } };
  } catch { return { ok: false, error: "SERVER" }; }
}

// Refuser : demande supprimée, sans amitié.
export function declineFriendRequest(userId, target) {
  try {
    initAccountDb();
    const uid = String(userId || "");
    const sid = resolvePeerId(target);
    if (!uid || !sid) return { ok: false };
    db.prepare("DELETE FROM friend_requests WHERE from_id = ? AND to_id = ?").run(sid, uid);
    return { ok: true };
  } catch { return { ok: false }; }
}

// Abonnés : ids des comptes qui suivent userId (pour la présence en ligne).
export function friendFollowers(userId) {
  try {
    initAccountDb();
    const uid = String(userId || "");
    if (!uid) return [];
    return db.prepare("SELECT user_id FROM friends WHERE friend_id = ?").all(uid).map((r) => String(r.user_id));
  } catch { return []; }
}

// Retrait d'ami par pseudo ou id (les deux sens, idempotent).
export function removeFriend(userId, target) {
  try {
    initAccountDb();
    const uid = String(userId || "");
    const t = String(target || "").trim();
    if (!uid || !t) return { ok: false };
    let fid = t;
    if (!fid.startsWith("u_") && fid.length < 60) {
      // Pseudo ou id brut : on tente les deux formes.
      const row = db.prepare("SELECT id FROM users WHERE pseudo_norm = ? OR id = ?").get(norm(t), t);
      if (row) fid = String(row.id);
    } else if (fid.startsWith("u_")) fid = fid.slice(2);
    db.prepare("DELETE FROM friends WHERE user_id = ? AND friend_id = ?").run(uid, fid);
    db.prepare("DELETE FROM friends WHERE user_id = ? AND friend_id = ?").run(fid, uid);
    return { ok: true };
  } catch { return { ok: false }; }
}

// WS multi : verifie un token de compte hors HTTP (hello).
// Retourne { id, pseudo } ou null (invite / token mort).
export function verifyWsToken(token) {
  try {
    const t = String(token || "").slice(0, 128);
    if (!t) return null;
    initAccountDb();
    const s = findSession(t);
    if (!s || Number(s.expires_at) < Date.now()) {
      if (s) { try { db.prepare("DELETE FROM sessions WHERE token = ?").run(s.token); } catch {} }
      return null;
    }
    const u = db.prepare("SELECT id, pseudo FROM users WHERE id = ?").get(s.user_id);
    if (!u) return null;
    return { id: String(u.id), pseudo: String(u.pseudo || "Pilote").slice(0, 20) };
  } catch { return null; }
}

function json(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(body);
  return true;
}

function readBody(req, res, onDone) {
  let size = 0;
  const chunks = [];
  req.on("data", (c) => {
    size += c.length;
    if (size > BODY_LIMIT) {
      try { json(res, 413, { ok: false, error: "Requete trop volumineuse." }); } catch {}
      req.destroy();
      return;
    }
    chunks.push(c);
  });
  req.on("end", () => {
    try {
      onDone(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"));
    } catch {
      json(res, 400, { ok: false, error: "JSON invalide." });
    }
  });
}

// POST /api/register { pseudo, email, password, faction, migrate? }
function handleRegister(body, res) {
  const pseudo = String(body?.pseudo || "").trim();
  const email = String(body?.email || "").trim().toLowerCase();
  const password = String(body?.password || "");
  const faction = norm(body?.faction);
  if (!pseudo || !email || !password) return json(res, 400, { ok: false, error: "Champs manquants." });
  if (pseudo.length > 64) return json(res, 400, { ok: false, error: "Pseudo trop long (64 max)." });
  if (!FACTIONS.has(faction)) return json(res, 400, { ok: false, error: "Choisis une firme valide." });
  if (!EMAIL_RE.test(email)) return json(res, 400, { ok: false, error: "Adresse email invalide." });
  if (password.length < 10) return json(res, 400, { ok: false, error: "Mot de passe trop court (10 caractères minimum)." });
  const keyP = norm(pseudo), keyE = norm(email);
  const clash = db.prepare("SELECT id FROM users WHERE pseudo_norm = ? OR email = ?").get(keyP, keyE);
  if (clash) return json(res, 409, { ok: false, error: "Pseudo ou email déjà utilisé." });

  const id = uuid();
  const now = Date.now();
  let data = {};
  let revision = 1;
  const migrate = body?.migrate;
  if (migrate && typeof migrate === "object" && !Array.isArray(migrate)) {
    // Import unique de la progression locale : meme pseudo/email + mot de
    // passe prouve (verifie contre le hash local).
    if (norm(migrate.pseudo) !== keyP || norm(migrate.email) !== keyE) {
      return json(res, 400, { ok: false, error: "Migration incoherente (pseudo/email)." });
    }
    if (!verifyPassword(migrate.password, password)) {
      return json(res, 403, { ok: false, error: "Migration refusee (mot de passe)." });
    }
    try { data = JSON.parse(JSON.stringify(migrate)); } catch { data = {}; }
    revision = Math.max(1, Math.floor(Number(data.revision) || 1));
  }
  // Dotation uniquement pour une creation neuve. Une migration conserve
  // strictement le solde et le marqueur du compte local importe.
  if (!(migrate && typeof migrate === "object" && !Array.isArray(migrate))) {
    data.credits = STARTER_CREDITS;
    data._starterCreditsGiven = true;
  }
  data.id = id;
  data.pseudo = pseudo;
  data.email = email;
  data.faction = faction;
  data.password = hashPassword(password);
  data.createdAt = data.createdAt || now;
  data.updatedAt = now;
  data.revision = revision;
  if (!data.schemaVersion) data.schemaVersion = 4;
  try {
    db.prepare("INSERT INTO users (id, pseudo, pseudo_norm, email, faction, password_hash, data, revision, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(id, pseudo, keyP, keyE, faction, data.password, JSON.stringify(data), revision, now, now);
  } catch {
    return json(res, 409, { ok: false, error: "Pseudo ou email déjà utilisé." });
  }
  const token = newSession(id);
  return json(res, 200, { ok: true, token, user: rowToPublic({ id, pseudo, email, faction, data: JSON.stringify(data) }) });
}

// POST /api/login { pseudoOrEmail, password }
function handleLogin(body, res) {
  const key = norm(body?.pseudoOrEmail);
  const pass = String(body?.password || "");
  if (!key || !pass) return json(res, 400, { ok: false, error: "Champs manquants." });
  const u = db.prepare("SELECT * FROM users WHERE pseudo_norm = ? OR email = ?").get(key, key);
  if (!u || !verifyPassword(u.password_hash, pass)) return json(res, 401, { ok: false, error: "Identifiants incorrects." });
  // Migration clair -> hash.
  if (!String(u.password_hash || "").startsWith("v2$")) {
    const h = hashPassword(pass);
    try {
      const data = JSON.parse(u.data || "{}");
      data.password = h;
      db.prepare("UPDATE users SET password_hash = ?, data = ?, updated_at = ? WHERE id = ?").run(h, JSON.stringify(data), Date.now(), u.id);
      u.password_hash = h;
      u.data = JSON.stringify(data);
    } catch {}
  }
  const token = newSession(u.id);
  return json(res, 200, { ok: true, token, user: rowToPublic(u) });
}

function handleAccountIdentity(req, body, res, kind) {
  const me = authUser(req);
  if (!me) return json(res, 401, { ok: false, error: "Session invalide." });
  const currentPassword = String(body?.currentPassword || "");
  if (!verifyPassword(me.password_hash, currentPassword)) {
    return json(res, 403, { ok: false, error: "Mot de passe actuel incorrect." });
  }
  let data = {};
  try { data = JSON.parse(me.data || "{}") || {}; } catch {}
  let pseudo = String(me.pseudo || "Pilote");
  let email = norm(me.email);
  let passwordHash = String(me.password_hash || "");
  if (kind === "pseudo") {
    const next = String(body?.value || "").trim();
    if (next.length < 3 || next.length > 32 || !/^[\p{L}\p{N}_ -]+$/u.test(next)) {
      return json(res, 400, { ok: false, error: "Le pseudo doit contenir entre 3 et 32 caractères autorisés." });
    }
    const clash = db.prepare("SELECT 1 FROM users WHERE pseudo_norm = ? AND id != ?").get(norm(next), me.id);
    if (clash) return json(res, 409, { ok: false, error: "Ce pseudo est déjà utilisé." });
    pseudo = next;
  } else if (kind === "email") {
    const next = norm(body?.value);
    if (!EMAIL_RE.test(next)) return json(res, 400, { ok: false, error: "Adresse email invalide." });
    const clash = db.prepare("SELECT 1 FROM users WHERE email = ? AND id != ?").get(next, me.id);
    if (clash) return json(res, 409, { ok: false, error: "Cette adresse email est déjà utilisée." });
    email = next;
  } else if (kind === "password") {
    const next = String(body?.value || "");
    if (next.length < 10) return json(res, 400, { ok: false, error: "Le nouveau mot de passe doit contenir au moins 10 caractères." });
    if (verifyPassword(passwordHash, next)) return json(res, 400, { ok: false, error: "Choisis un mot de passe différent de l'ancien." });
    passwordHash = hashPassword(next);
    // Un changement de mot de passe invalide toutes les autres sessions.
    db.prepare("DELETE FROM sessions WHERE user_id = ?").run(me.id);
    const bearer = bearerToken(req);
    if (bearer) {
      const now = Date.now();
      db.prepare("INSERT OR REPLACE INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)")
        .run(sessionKey(bearer), me.id, now, now + TOKEN_TTL_MS);
    }
  } else return json(res, 400, { ok: false, error: "Modification inconnue." });
  const revision = Math.max(0, Number(me.revision) || 0) + 1;
  data.id = me.id;
  data.pseudo = pseudo;
  data.email = email;
  data.password = passwordHash;
  data.revision = revision;
  data.updatedAt = Date.now();
  db.prepare("UPDATE users SET pseudo = ?, pseudo_norm = ?, email = ?, password_hash = ?, data = ?, revision = ?, updated_at = ? WHERE id = ?")
    .run(pseudo, norm(pseudo), email, passwordHash, JSON.stringify(data), revision, data.updatedAt, me.id);
  return json(res, 200, { ok: true, user: rowToPublic({ id: me.id, pseudo, email, faction: me.faction, data: JSON.stringify(data) }) });
}

// POST /api/save { user } — plein blob, revision strictement croissante.
function handleSave(req, body, res) {
  const me = authUser(req);
  if (!me) return json(res, 401, { ok: false, error: "Session invalide." });
  const blob = body?.user;
  if (!blob || typeof blob !== "object" || Array.isArray(blob)) {
    return json(res, 400, { ok: false, error: "Utilisateur invalide." });
  }
  if (String(blob.id || "") !== String(me.id)) {
    return json(res, 403, { ok: false, error: "Compte refuse." });
  }
  const incomingRev = Math.floor(Number(blob.revision) || 0);
  if (!(incomingRev > Number(me.revision) || 0)) {
    // Client en retard (autre PC/onglet plus recent) : on renvoie le canon.
    return json(res, 409, { ok: false, stale: true, error: "Sauvegarde perimee.", user: rowToPublic(me) });
  }
  // Unicite pseudo/email (hors soi). La casse d'affichage est preservee,
  // seule la forme normalisee est unique.
  const newPseudoRaw = String(blob.pseudo ?? me.pseudo).trim() || String(me.pseudo);
  const newPseudo = norm(newPseudoRaw);
  const newEmail = norm(blob.email) || norm(me.email);
  if (!newPseudo || !newEmail || !EMAIL_RE.test(newEmail)) {
    return json(res, 400, { ok: false, error: "Pseudo/email invalide." });
  }
  if (newPseudoRaw.length > 64) {
    return json(res, 400, { ok: false, error: "Pseudo trop long." });
  }
  const clash = db.prepare("SELECT id FROM users WHERE (pseudo_norm = ? OR email = ?) AND id != ?").get(newPseudo, newEmail, me.id);
  let finalPseudo = newPseudoRaw, finalEmail = newEmail, conflict = false;
  if (clash) {
    // Conflit : on garde les valeurs serveur, on applique le reste.
    finalPseudo = me.pseudo;
    finalEmail = norm(me.email);
    conflict = true;
  }
  const faction = FACTIONS.has(norm(blob.faction)) ? norm(blob.faction) : norm(me.faction);
  let data;
  try { data = JSON.parse(JSON.stringify(blob)); } catch {
    return json(res, 400, { ok: false, error: "Utilisateur invalide." });
  }
  data.id = me.id;
  data.pseudo = finalPseudo;
  data.email = finalEmail;
  data.faction = faction;
  data.revision = incomingRev;
  data.updatedAt = Date.now();
  // Mot de passe : le hash colonne fait foi. Un clair entrant = changement
  // volontaire -> on le re-hache. Un hash entrant est ignore.
  let pwHash = me.password_hash;
  if (typeof data.password === "string" && data.password && !isHash(data.password)) {
    if (data.password.length < 10) return json(res, 400, { ok: false, error: "Mot de passe trop court (10 caractères minimum)." });
    pwHash = hashPassword(data.password);
  }
  data.password = pwHash;
  try {
    db.prepare("UPDATE users SET pseudo = ?, pseudo_norm = ?, email = ?, faction = ?, password_hash = ?, data = ?, revision = ?, updated_at = ? WHERE id = ?")
      .run(finalPseudo, norm(finalPseudo), finalEmail, faction, pwHash, JSON.stringify(data), incomingRev, data.updatedAt, me.id);
  } catch {
    return json(res, 409, { ok: false, error: "Pseudo ou email déjà utilisé." });
  }
  return json(res, 200, { ok: true, conflict: conflict || undefined, user: rowToPublic({ id: me.id, pseudo: finalPseudo, email: finalEmail, faction, data: JSON.stringify(data) }) });
}

export function handleAccountApi(req, res) {
  initAccountDb();
  let pathname = "";
  try { pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname); } catch {}
  if (!pathname.startsWith("/api/")) return false;
  const ip = req.socket?.remoteAddress || "local";
  if (pathname === "/api/ping" && req.method === "GET") {
    json(res, 200, { ok: true, game: "hyperion-orbit" });
    return true;
  }
  if ((pathname === "/api/register" || pathname === "/api/login") && req.method === "POST") {
    if (rateLimited(`${ip}:${pathname}`)) return json(res, 429, { ok: false, error: "Trop de tentatives, reessaie dans une minute." });
    readBody(req, res, (body) => {
      try {
        if (pathname === "/api/register") handleRegister(body, res);
        else handleLogin(body, res);
      } catch {
        json(res, 500, { ok: false, error: "Erreur serveur." });
      }
    });
    return true;
  }
  if (pathname === "/api/logout" && req.method === "POST") {
    const token = bearerToken(req);
    if (token) {
      try { db.prepare("DELETE FROM sessions WHERE token = ? OR token = ?").run(sessionKey(token), token); } catch {}
    }
    return json(res, 200, { ok: true });
  }
  if (pathname === "/api/me" && req.method === "GET") {
    const me = authUser(req);
    if (!me) return json(res, 401, { ok: false, error: "Session invalide." });
    return json(res, 200, { ok: true, user: rowToPublic(me) });
  }
  if (pathname === "/api/rankings" && req.method === "GET") {
    // Classement GENERAL public : tous les comptes (grade + pseudo +
    // points UNIQUEMENT, kills/xp/honneur restent cachés côté client).
    // Points = kills PvP * 10 (0 si aucun) + xp_total / 1000 + honneur_total / 100.
    try {
      if (rateLimited(`${ip}:/api/rankings`, 60)) return json(res, 429, { ok: false, error: "Trop de tentatives, reessaie dans une minute." });
      const rows = db.prepare("SELECT u.pseudo, u.data, s.kills FROM users u LEFT JOIN pvp_stats s ON s.user_id = u.id LIMIT 2000").all();
      const list = [];
      for (const r of rows) {
        const kills = Math.max(0, Math.floor(Number(r.kills) || 0));
        let rankPoints = 0, honor = 0;
        let totalExp = 0;
        let totalHonneur = 0;
        try {
          const data = JSON.parse(r.data || "{}");
          rankPoints = Math.max(0, Math.floor(Number(data?.stats?.rankPoints) || 0));
          honor = Math.max(0, Math.floor(Number(data?.stats?.honor) || 0));
          // XP / honneur TOTAUX du compte pour les points de classement.
          const te = Math.floor(Number(data?.stats?.exp));
          if (Number.isFinite(te) && te >= 0) totalExp = te;
          const th = Math.floor(Number(data?.stats?.honor));
          if (Number.isFinite(th) && th >= 0) totalHonneur = th;
        } catch {}
        list.push({
          pseudo: String(r.pseudo || "Pilote").slice(0, 20),
          points: kills * 10 + Math.floor(totalExp / 1000 + totalHonneur / 100),
          rankPoints, honor,
          _kills: kills,
        });
      }
      list.sort((a, b) => b.points - a.points || b._kills - a._kills);
      return json(res, 200, { ok: true, list: list.slice(0, 100).map(({ pseudo, points, rankPoints, honor }) => ({ pseudo, points, rankPoints, honor })) });
    } catch {
      return json(res, 500, { ok: false, error: "Erreur serveur." });
    }
  }
  if (pathname === "/api/pseudo-free" && req.method === "GET") {
    // Disponibilite d'un pseudo (renommage) : hors soi, insensible a la casse.
    if (rateLimited(`${ip}:/api/pseudo-free`, 60)) return json(res, 429, { ok: false, error: "Trop de tentatives, reessaie dans une minute." });
    const me = authUser(req);
    if (!me) return json(res, 401, { ok: false, error: "Session invalide." });
    let pseudo = "";
    try { pseudo = String(new URL(req.url, "http://localhost").searchParams.get("pseudo") || "").trim(); } catch {}
    if (pseudo.length < 3 || pseudo.length > 32) return json(res, 200, { ok: true, free: false });
    const key = norm(pseudo);
    if (key === norm(me.pseudo)) return json(res, 200, { ok: true, free: true, yours: true });
    const clash = db.prepare("SELECT id FROM users WHERE pseudo_norm = ?").get(key);
    return json(res, 200, { ok: true, free: !clash });
  }
  if (pathname === "/api/save" && req.method === "POST") {
    if (rateLimited(`${ip}:/api/save`, 120)) return json(res, 429, { ok: false, error: "Trop de sauvegardes, reessaie dans un instant." });
    readBody(req, res, (body) => {
      try { handleSave(req, body, res); } catch {
        json(res, 500, { ok: false, error: "Erreur serveur." });
      }
    });
    return true;
  }
  const identityMatch = /^\/api\/account\/(pseudo|email|password)$/.exec(pathname);
  if (identityMatch && req.method === "POST") {
    if (rateLimited(`${ip}:${pathname}`, 10)) return json(res, 429, { ok: false, error: "Trop de tentatives, reessaie dans une minute." });
    readBody(req, res, (body) => {
      try { handleAccountIdentity(req, body, res, identityMatch[1]); }
      catch { json(res, 500, { ok: false, error: "Erreur serveur." }); }
    });
    return true;
  }
  if (pathname === "/api/friends" && (req.method === "GET" || req.method === "POST" || req.method === "DELETE")) {
    if (rateLimited(`${ip}:/api/friends`, 60)) return json(res, 429, { ok: false, error: "Trop de tentatives, reessaie dans une minute." });
    const me = authUser(req);
    if (!me) return json(res, 401, { ok: false, error: "Session invalide." });
    if (req.method === "GET") {
      return json(res, 200, { ok: true, friends: listFriends(me.id) });
    }
    readBody(req, res, (body) => {
      try {
        if (req.method === "POST") {
          // Demande d'ami : l'autre doit accepter (pas d'ajout direct).
          const r = sendFriendRequest(me.id, body?.pseudo);
          if (!r.ok) {
            const msg = r.error === "NOT_FOUND" ? "Pilote introuvable."
              : r.error === "SELF" ? "Tu ne peux pas t'ajouter toi-même."
              : r.error === "ALREADY" ? "Déjà dans tes amis."
              : r.error === "SENT" ? "Demande déjà envoyée." : "Erreur serveur.";
            const code = r.error === "NOT_FOUND" ? 404 : r.error === "SELF" ? 400 : 409;
            return json(res, code, { ok: false, error: msg });
          }
          return json(res, 200, { ok: true, to: r.to, mutual: r.mutual === true ? true : undefined });
        }
        const r = removeFriend(me.id, body?.pseudo ?? body?.id);
        return json(res, 200, { ok: true });
      } catch {
        json(res, 500, { ok: false, error: "Erreur serveur." });
      }
    });
    return true;
  }
  if (pathname === "/api/friends/requests" && req.method === "GET") {
    if (rateLimited(`${ip}:/api/friends`, 60)) return json(res, 429, { ok: false, error: "Trop de tentatives, reessaie dans une minute." });
    const me = authUser(req);
    if (!me) return json(res, 401, { ok: false, error: "Session invalide." });
    return json(res, 200, { ok: true, requests: getFriendRequests(me.id) });
  }
  if ((pathname === "/api/friends/accept" || pathname === "/api/friends/decline") && req.method === "POST") {
    if (rateLimited(`${ip}:/api/friends`, 60)) return json(res, 429, { ok: false, error: "Trop de tentatives, reessaie dans une minute." });
    const me = authUser(req);
    if (!me) return json(res, 401, { ok: false, error: "Session invalide." });
    readBody(req, res, (body) => {
      try {
        const target = body?.pseudo ?? body?.id ?? body?.fromId;
        if (pathname === "/api/friends/accept") {
          const r = acceptFriendRequest(me.id, target);
          if (!r.ok) return json(res, 404, { ok: false, error: "Demande introuvable." });
          return json(res, 200, { ok: true, friend: r.friend });
        }
        declineFriendRequest(me.id, target);
        return json(res, 200, { ok: true });
      } catch {
        json(res, 500, { ok: false, error: "Erreur serveur." });
      }
    });
    return true;
  }
  if (pathname.startsWith("/api/")) {
    json(res, 404, { ok: false, error: "Inconnu." });
    return true;
  }
  return false;
}
