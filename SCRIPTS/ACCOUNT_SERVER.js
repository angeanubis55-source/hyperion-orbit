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
    CREATE TABLE IF NOT EXISTS clans (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      tag TEXT NOT NULL,
      tag_norm TEXT NOT NULL DEFAULT '',
      leader_id TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_clans_tag ON clans(tag_norm);
    CREATE TABLE IF NOT EXISTS clan_members (
      clan_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'member',
      joined_at INTEGER NOT NULL,
      PRIMARY KEY (user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_clan_members_clan ON clan_members(clan_id);
    CREATE TABLE IF NOT EXISTS clan_invites (
      clan_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      from_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (clan_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_clan_invites_user ON clan_invites(user_id);
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
    const factor = (v) => Math.max(0, 1 + (Number(v) || 0) / 100);
    const baseCredits = Math.max(0, Math.floor(Number(reward.credits) * pct / 100));
    const baseExp = Math.max(0, Math.floor(Number(reward.exp) * pct / 100));
    const baseHonor = Math.max(0, Math.floor(Number(reward.honor) * pct / 100));
    const rawShipId = String(hangar?.shipId || data.ship || "");
    const shipXp = String(getShipDesignBaseId(rawShipId) || rawShipId).toLowerCase() === "goliath_x" ? 1.02 : 1;
    const credits = Math.max(0, Math.floor(baseCredits * factor(pilot.creditPct)));
    const exp = Math.max(0, Math.ceil(baseExp * factor(equipment.bonusExpPct) * Math.max(0, Number(boosters.exp) || 1) * factor(pilot.expPct) * shipXp - Number.EPSILON));
    const zeroHonorFormation = String(data?.drones?.activeFormation || "").toLowerCase() === "x";
    const honor = zeroHonorFormation
      ? 0
      : Math.max(0, Math.ceil(baseHonor * factor(equipment.bonusHonorPct) * Math.max(0, Number(boosters.honor) || 1) * factor(pilot.honorPct) - Number.EPSILON));
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
    data._adminWriteToken = randomBytes(12).toString("hex");
    data.revision = newRev;
    data.updatedAt = now;
    db.prepare("UPDATE users SET data = ?, revision = ?, updated_at = ? WHERE id = ?")
      .run(JSON.stringify(data), newRev, now, row.id);
    return { ok: true, id: String(row.id), pseudo: String(row.pseudo || "Pilote").slice(0, 20), before, after, given: delta, revision: newRev };
  } catch { return { ok: false, error: "Erreur serveur." }; }
}

// Admin : liste tous les comptes pour le panneau (connectés + hors ligne).
// Retourne [{ accountId, id (pid stable u_xxx), pseudo, credits, exp, honor,
// faction, createdAt, updatedAt }]. Tri par pseudo, max 5000.
export function adminListAccounts() {
  try {
    initAccountDb();
    const rows = db.prepare("SELECT id, pseudo, faction, data, created_at, updated_at FROM users ORDER BY pseudo COLLATE NOCASE LIMIT 5000").all();
    return rows.map((r) => {
      let credits = 0, exp = 0, honor = 0;
      try {
        const data = JSON.parse(r.data || "{}");
        credits = Math.max(0, Math.floor(Number(data.credits) || 0));
        exp = Math.max(0, Math.floor(Number(data?.stats?.exp) || 0));
        honor = Math.max(0, Math.floor(Number(data?.stats?.honor) || 0));
      } catch {}
      const accountId = String(r.id);
      return {
        accountId,
        id: `u_${accountId}`.slice(0, 128),
        pseudo: String(r.pseudo || "Pilote").slice(0, 20),
        faction: String(r.faction || ""),
        credits, exp, honor,
        createdAt: Number(r.created_at) || 0,
        updatedAt: Number(r.updated_at) || 0,
      };
    });
  } catch { return []; }
}

// Admin : suppression DEFINITIVE d'un compte (id u_xxx / brut ou pseudo).
// Efface tout : ligne users (= classement, profil), sessions, pvp_stats,
// npc_reward_tx, amis (les deux sens), demandes d'ami (les deux sens).
// Comme s'il n'avait jamais existé. Retourne les ids amis impactés pour
// notification live côté MULTI_SERVER.
export function adminDeleteAccount(target) {
  try {
    initAccountDb();
    const t = String(target || "").trim();
    if (!t) return { ok: false, error: "Pseudo ou id manquant." };
    let row = null;
    const rawId = t.startsWith("u_") ? t.slice(2) : t;
    try { row = db.prepare("SELECT id, pseudo FROM users WHERE id = ?").get(rawId) || null; } catch {}
    if (!row) {
      try { row = db.prepare("SELECT id, pseudo FROM users WHERE pseudo_norm = ?").get(norm(t)) || null; } catch {}
    }
    if (!row) return { ok: false, error: "Compte introuvable." };
    const uid = String(row.id);
    const pseudo = String(row.pseudo || "Pilote").slice(0, 20);
    // Amis impactés (avant suppression) pour refresh live de leur liste.
    let affected = [];
    try {
      const rows = db.prepare("SELECT user_id, friend_id FROM friends WHERE user_id = ? OR friend_id = ?").all(uid, uid);
      const set = new Set();
      for (const r of rows) {
        const a = String(r.user_id), b = String(r.friend_id);
        if (a && a !== uid) set.add(a);
        if (b && b !== uid) set.add(b);
      }
      affected = [...set].slice(0, 5000);
    } catch {}
    try { db.exec("BEGIN IMMEDIATE"); } catch {}
    try {
      db.prepare("DELETE FROM sessions WHERE user_id = ?").run(uid);
    } catch {}
    try { db.prepare("DELETE FROM pvp_stats WHERE user_id = ?").run(uid); } catch {}
    try { db.prepare("DELETE FROM npc_reward_tx WHERE user_id = ?").run(uid); } catch {}
    try { db.prepare("DELETE FROM friends WHERE user_id = ? OR friend_id = ?").run(uid, uid); } catch {}
    try { db.prepare("DELETE FROM friend_requests WHERE from_id = ? OR to_id = ?").run(uid, uid); } catch {}
    // Clan : départ propre (succession du chef ou dissolution si dernier).
    let clanAffected = [];
    try {
      const r = clanLeaveCore(uid);
      clanAffected = Array.isArray(r?.affected) ? r.affected : [];
    } catch {}
    try { db.prepare("DELETE FROM clan_invites WHERE from_id = ?").run(uid); } catch {}
    let deleted = 0;
    try { deleted = Number(db.prepare("DELETE FROM users WHERE id = ?").run(uid)?.changes) || 0; } catch {}
    try { db.exec("COMMIT"); } catch {}
    if (!deleted) { try { db.exec("ROLLBACK"); } catch {} return { ok: false, error: "Compte introuvable." }; }
    for (const cid of clanAffected) if (cid && !affected.includes(cid)) affected.push(cid);
    return { ok: true, id: uid, pid: `u_${uid}`.slice(0, 128), pseudo, affected };
  } catch { try { db.exec("ROLLBACK"); } catch {} return { ok: false, error: "Erreur serveur." }; }
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

// --- Clans façon DO (comptes uniquement) : création [TAG], invites,
// rangs (leader / officer / member), chat de clan via MULTI_SERVER.
// Un pilote = un seul clan. Le tag est unique (2-5 caractères affichés
// en majuscules). Taille max 30 membres.
export const CLAN_MAX_MEMBERS = 30;
const CLAN_TAG_RE = /^[A-Z0-9]{2,5}$/;

function cleanClanName(s) {
  return String(s || "").replace(/\s+/g, " ").trim().slice(0, 30);
}
function cleanClanTag(s) {
  return String(s || "").replace(/\s+/g, "").trim().toUpperCase().slice(0, 5);
}
function cleanClanDesc(s) {
  return String(s || "").replace(/\s+/g, " ").trim().slice(0, 200);
}

export function clanIdOfUser(userId) {
  try {
    initAccountDb();
    const row = db.prepare("SELECT clan_id FROM clan_members WHERE user_id = ?").get(String(userId || ""));
    return row ? String(row.clan_id) : null;
  } catch { return null; }
}

export function clanTagOfUser(userId) {
  try {
    initAccountDb();
    const row = db.prepare("SELECT c.tag AS tag FROM clan_members m JOIN clans c ON c.id = m.clan_id WHERE m.user_id = ?").get(String(userId || ""));
    return row ? String(row.tag || "").slice(0, 5) : "";
  } catch { return ""; }
}

function clanRoleOf(userId, clanId) {
  try {
    initAccountDb();
    const row = db.prepare("SELECT role FROM clan_members WHERE user_id = ? AND clan_id = ?").get(String(userId), String(clanId));
    return row ? String(row.role || "member") : null;
  } catch { return null; }
}

// Fiche complète : { id, name, tag, description, leader, role, members: [{id,pseudo,role}], invites: [{pseudo}] (sortantes, leader/officer) }.
export function getMyClan(userId) {
  try {
    initAccountDb();
    const uid = String(userId || "");
    if (!uid) return null;
    const clan = db.prepare("SELECT c.*, m.role AS my_role FROM clan_members m JOIN clans c ON c.id = m.clan_id WHERE m.user_id = ?").get(uid);
    if (!clan) return null;
    const members = db.prepare("SELECT m.user_id AS id, u.pseudo AS pseudo, m.role AS role FROM clan_members m JOIN users u ON u.id = m.user_id WHERE m.clan_id = ? ORDER BY CASE m.role WHEN 'leader' THEN 0 WHEN 'officer' THEN 1 ELSE 2 END, m.joined_at").all(String(clan.id))
      .map((r) => ({ id: String(r.id), pseudo: String(r.pseudo || "Pilote").slice(0, 20), role: String(r.role || "member") }));
    const out = {
      id: String(clan.id), name: String(clan.name || "Clan").slice(0, 30), tag: String(clan.tag || "").slice(0, 5),
      description: String(clan.description || "").slice(0, 200),
      leader: String(clan.leader_id || ""), role: String(clan.my_role || "member"), members,
    };
    if (out.role === "leader" || out.role === "officer") {
      try {
        out.invites = db.prepare("SELECT u.pseudo AS pseudo FROM clan_invites i JOIN users u ON u.id = i.user_id WHERE i.clan_id = ? ORDER BY i.created_at").all(String(clan.id))
          .map((r) => ({ pseudo: String(r.pseudo || "Pilote").slice(0, 20) }));
      } catch { out.invites = []; }
    }
    return out;
  } catch { return null; }
}

// Invitations reçues : [{ clanId, name, tag, fromPseudo, at }].
export function getClanInvites(userId) {
  try {
    initAccountDb();
    return db.prepare("SELECT i.clan_id AS clanId, c.name AS name, c.tag AS tag, u.pseudo AS fromPseudo, i.created_at AS at FROM clan_invites i JOIN clans c ON c.id = i.clan_id JOIN users u ON u.id = i.from_id WHERE i.user_id = ? ORDER BY i.created_at").all(String(userId))
      .map((r) => ({ clanId: String(r.clanId), name: String(r.name || "Clan").slice(0, 30), tag: String(r.tag || "").slice(0, 5), fromPseudo: String(r.fromPseudo || "Pilote").slice(0, 20), at: Number(r.at) || 0 }));
  } catch { return []; }
}

// Info publique d'un clan par tag : { name, tag, leader, memberCount, members: [pseudo] }.
export function getClanInfo(tag) {
  try {
    initAccountDb();
    const row = db.prepare("SELECT * FROM clans WHERE tag_norm = ?").get(String(tag || "").trim().toLowerCase());
    if (!row) return null;
    const members = db.prepare("SELECT u.pseudo AS pseudo, m.role AS role FROM clan_members m JOIN users u ON u.id = m.user_id WHERE m.clan_id = ? ORDER BY CASE m.role WHEN 'leader' THEN 0 WHEN 'officer' THEN 1 ELSE 2 END, m.joined_at").all(String(row.id))
      .map((r) => ({ pseudo: String(r.pseudo || "Pilote").slice(0, 20), role: String(r.role || "member") }));
    let leaderPseudo = "?";
    try {
      const lr = db.prepare("SELECT pseudo FROM users WHERE id = ?").get(String(row.leader_id));
      if (lr) leaderPseudo = String(lr.pseudo || "Pilote").slice(0, 20);
    } catch {}
    return { id: String(row.id), name: String(row.name || "Clan").slice(0, 30), tag: String(row.tag || "").slice(0, 5), description: String(row.description || "").slice(0, 200), leader: leaderPseudo, memberCount: members.length, members };
  } catch { return null; }
}

export function createClan(userId, name, tag) {
  try {
    initAccountDb();
    const uid = String(userId || "");
    if (!uid) return { ok: false, error: "AUTH" };
    if (clanIdOfUser(uid)) return { ok: false, error: "ALREADY" };
    const cleanName = cleanClanName(name);
    const cleanTag = cleanClanTag(tag);
    if (cleanName.length < 3) return { ok: false, error: "NAME" };
    if (!CLAN_TAG_RE.test(cleanTag)) return { ok: false, error: "TAG" };
    const clash = db.prepare("SELECT 1 FROM clans WHERE tag_norm = ?").get(cleanTag.toLowerCase());
    if (clash) return { ok: false, error: "TAKEN" };
    const id = uuid();
    const now = Date.now();
    db.prepare("INSERT INTO clans (id, name, tag, tag_norm, leader_id, description, created_at) VALUES (?, ?, ?, ?, ?, '', ?)").run(id, cleanName, cleanTag, cleanTag.toLowerCase(), uid, now);
    db.prepare("INSERT INTO clan_members (clan_id, user_id, role, joined_at) VALUES (?, ?, 'leader', ?)").run(id, uid, now);
    // Une création annule les invitations reçues en attente.
    try { db.prepare("DELETE FROM clan_invites WHERE user_id = ?").run(uid); } catch {}
    return { ok: true, clan: getMyClan(uid) };
  } catch { return { ok: false, error: "SERVER" }; }
}

// Noyau de départ (quitter / kick / suppression admin) : succession ou
// dissolution. Retourne { dissolved, clanId, affected: [userId] }.
function clanLeaveCore(uid) {
  const clanId = clanIdOfUser(uid);
  if (!clanId) return { dissolved: false, clanId: null, affected: [] };
  let affected = [];
  try {
    affected = db.prepare("SELECT user_id FROM clan_members WHERE clan_id = ? AND user_id != ?").all(clanId, uid).map((r) => String(r.user_id));
  } catch {}
  db.prepare("DELETE FROM clan_members WHERE clan_id = ? AND user_id = ?").run(clanId, uid);
  try { db.prepare("DELETE FROM clan_invites WHERE user_id = ?").run(uid); } catch {}
  const rest = (() => {
    try { return db.prepare("SELECT user_id, role, joined_at FROM clan_members WHERE clan_id = ? ORDER BY joined_at").all(clanId); } catch { return []; }
  })();
  if (!rest.length) {
    try { db.prepare("DELETE FROM clans WHERE id = ?").run(clanId); } catch {}
    try { db.prepare("DELETE FROM clan_invites WHERE clan_id = ?").run(clanId); } catch {}
    return { dissolved: true, clanId, affected: [] };
  }
  try {
    const clan = db.prepare("SELECT leader_id FROM clans WHERE id = ?").get(clanId);
    if (clan && String(clan.leader_id) === String(uid)) {
      const successor = rest.find((m) => String(m.role) === "officer") || rest[0];
      const sid = String(successor.user_id);
      db.prepare("UPDATE clan_members SET role = 'leader' WHERE clan_id = ? AND user_id = ?").run(clanId, sid);
      db.prepare("UPDATE clans SET leader_id = ? WHERE id = ?").run(sid, clanId);
    }
  } catch {}
  return { dissolved: false, clanId, affected };
}

export function leaveClan(userId) {
  try {
    initAccountDb();
    const uid = String(userId || "");
    if (!uid || !clanIdOfUser(uid)) return { ok: false, error: "NONE" };
    return { ok: true, ...clanLeaveCore(uid) };
  } catch { return { ok: false, error: "SERVER" }; }
}

export function inviteToClan(fromId, pseudo) {
  try {
    initAccountDb();
    const uid = String(fromId || "");
    const clanId = clanIdOfUser(uid);
    if (!clanId) return { ok: false, error: "NOCLAN" };
    const role = clanRoleOf(uid, clanId);
    if (role !== "leader" && role !== "officer") return { ok: false, error: "RIGHTS" };
    const target = findUserByPseudo(pseudo);
    if (!target) return { ok: false, error: "NOT_FOUND" };
    if (target.id === uid) return { ok: false, error: "SELF" };
    if (clanIdOfUser(target.id)) return { ok: false, error: "INCLAN" };
    const count = (() => {
      try { return Number(db.prepare("SELECT COUNT(*) AS n FROM clan_members WHERE clan_id = ?").get(clanId)?.n) || 0; } catch { return 0; }
    })();
    if (count >= CLAN_MAX_MEMBERS) return { ok: false, error: "FULL" };
    const dup = (() => {
      try { return !!db.prepare("SELECT 1 FROM clan_invites WHERE clan_id = ? AND user_id = ?").get(clanId, target.id); } catch { return false; }
    })();
    if (dup) return { ok: false, error: "SENT" };
    db.prepare("INSERT INTO clan_invites (clan_id, user_id, from_id, created_at) VALUES (?, ?, ?, ?)").run(clanId, target.id, uid, Date.now());
    return { ok: true, to: target };
  } catch { return { ok: false, error: "SERVER" }; }
}

export function acceptClanInvite(userId, tag) {
  try {
    initAccountDb();
    const uid = String(userId || "");
    if (!uid) return { ok: false, error: "AUTH" };
    if (clanIdOfUser(uid)) return { ok: false, error: "INCLAN" };
    const clan = db.prepare("SELECT * FROM clans WHERE tag_norm = ?").get(String(tag || "").trim().toLowerCase());
    if (!clan) return { ok: false, error: "NONE" };
    const inv = (() => {
      try { return db.prepare("SELECT 1 FROM clan_invites WHERE clan_id = ? AND user_id = ?").get(String(clan.id), uid); } catch { return null; }
    })();
    if (!inv) return { ok: false, error: "NONE" };
    const count = (() => {
      try { return Number(db.prepare("SELECT COUNT(*) AS n FROM clan_members WHERE clan_id = ?").get(String(clan.id))?.n) || 0; } catch { return 0; }
    })();
    if (count >= CLAN_MAX_MEMBERS) return { ok: false, error: "FULL" };
    db.prepare("INSERT INTO clan_members (clan_id, user_id, role, joined_at) VALUES (?, ?, 'member', ?)").run(String(clan.id), uid, Date.now());
    try { db.prepare("DELETE FROM clan_invites WHERE user_id = ?").run(uid); } catch {}
    return { ok: true, clan: getMyClan(uid), clanId: String(clan.id) };
  } catch { return { ok: false, error: "SERVER" }; }
}

export function declineClanInvite(userId, tag) {
  try {
    initAccountDb();
    const uid = String(userId || "");
    if (!uid) return { ok: false };
    const clan = db.prepare("SELECT id FROM clans WHERE tag_norm = ?").get(String(tag || "").trim().toLowerCase());
    if (!clan) {
      try { db.prepare("DELETE FROM clan_invites WHERE user_id = ?").run(uid); } catch {}
      return { ok: true };
    }
    db.prepare("DELETE FROM clan_invites WHERE clan_id = ? AND user_id = ?").run(String(clan.id), uid);
    return { ok: true };
  } catch { return { ok: false }; }
}

export function kickClanMember(actorId, pseudo) {
  try {
    initAccountDb();
    const uid = String(actorId || "");
    const clanId = clanIdOfUser(uid);
    if (!clanId) return { ok: false, error: "NOCLAN" };
    const role = clanRoleOf(uid, clanId);
    const target = findUserByPseudo(pseudo);
    if (!target) return { ok: false, error: "NOT_FOUND" };
    if (target.id === uid) return { ok: false, error: "SELF" };
    const targetRole = clanRoleOf(target.id, clanId);
    if (!targetRole) return { ok: false, error: "NOMEMBER" };
    if (role === "officer" && targetRole !== "member") return { ok: false, error: "RIGHTS" };
    if (role !== "leader" && role !== "officer") return { ok: false, error: "RIGHTS" };
    db.prepare("DELETE FROM clan_members WHERE clan_id = ? AND user_id = ?").run(clanId, target.id);
    return { ok: true, kicked: target, clanId };
  } catch { return { ok: false, error: "SERVER" }; }
}

// Promotion / rétrogradation (leader uniquement) : member <-> officer.
export function setClanRank(actorId, pseudo, officer) {
  try {
    initAccountDb();
    const uid = String(actorId || "");
    const clanId = clanIdOfUser(uid);
    if (!clanId) return { ok: false, error: "NOCLAN" };
    if (clanRoleOf(uid, clanId) !== "leader") return { ok: false, error: "RIGHTS" };
    const target = findUserByPseudo(pseudo);
    if (!target) return { ok: false, error: "NOT_FOUND" };
    if (target.id === uid) return { ok: false, error: "SELF" };
    if (!clanRoleOf(target.id, clanId)) return { ok: false, error: "NOMEMBER" };
    db.prepare("UPDATE clan_members SET role = ? WHERE clan_id = ? AND user_id = ?").run(officer === true ? "officer" : "member", clanId, target.id);
    return { ok: true, member: target, clanId };
  } catch { return { ok: false, error: "SERVER" }; }
}

export function setClanDescription(userId, description) {
  try {
    initAccountDb();
    const uid = String(userId || "");
    const clanId = clanIdOfUser(uid);
    if (!clanId) return { ok: false, error: "NOCLAN" };
    if (clanRoleOf(uid, clanId) !== "leader") return { ok: false, error: "RIGHTS" };
    db.prepare("UPDATE clans SET description = ? WHERE id = ?").run(cleanClanDesc(description), clanId);
    return { ok: true, clanId };
  } catch { return { ok: false, error: "SERVER" }; }
}

// Ids des comptes membres d'un clan (notifs live + chat).
export function clanMemberUserIds(clanId) {
  try {
    initAccountDb();
    if (!clanId) return [];
    return db.prepare("SELECT user_id FROM clan_members WHERE clan_id = ?").all(String(clanId)).map((r) => String(r.user_id));
  } catch { return []; }
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

// Admin : ajoute/retire de l'EXP au compte et recalcule immediatement les
// points de grade. Comme pour les credits, la revision force la prochaine
// synchronisation client a adopter la valeur serveur.
export function adminGiveExperience(pseudo, amount) {
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
    data.stats ||= { honor: 0, exp: 0, rankPoints: 0, lifetimeKills: 0 };
    const before = Math.max(0, Math.floor(Number(data.stats.exp) || 0));
    const after = Math.max(0, before + delta);
    const now = Date.now();
    const newRev = Math.max(Math.floor(Number(data.revision) || 0), Number(row.revision) || 0) + 1;
    data.stats.exp = after;
    data.stats.rankPoints = calculateRankPoints(data.stats);
    data._adminWriteToken = randomBytes(12).toString("hex");
    data.revision = newRev;
    data.updatedAt = now;
    db.prepare("UPDATE users SET data = ?, revision = ?, updated_at = ? WHERE id = ?")
      .run(JSON.stringify(data), newRev, now, row.id);
    return { ok: true, id: String(row.id), pseudo: String(row.pseudo || "Pilote").slice(0, 20), before, after, given: delta, revision: newRev };
  } catch { return { ok: false, error: "Erreur serveur." }; }
}

// Admin : ajoute/retire de l'honneur et recalcule les points de grade.
export function adminGiveHonor(pseudo, amount) {
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
    data.stats ||= { honor: 0, exp: 0, rankPoints: 0, lifetimeKills: 0 };
    const before = Math.max(0, Math.floor(Number(data.stats.honor) || 0));
    const after = Math.max(0, before + delta);
    const now = Date.now();
    const newRev = Math.max(Math.floor(Number(data.revision) || 0), Number(row.revision) || 0) + 1;
    data.stats.honor = after;
    data.stats.rankPoints = calculateRankPoints(data.stats);
    data._adminWriteToken = randomBytes(12).toString("hex");
    data.revision = newRev;
    data.updatedAt = now;
    db.prepare("UPDATE users SET data = ?, revision = ?, updated_at = ? WHERE id = ?")
      .run(JSON.stringify(data), newRev, now, row.id);
    return { ok: true, id: String(row.id), pseudo: String(row.pseudo || "Pilote").slice(0, 20), before, after, given: delta, revision: newRev };
  } catch { return { ok: false, error: "Erreur serveur." }; }
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
  // Une attribution admin peut arriver pendant que le joueur possède déjà
  // plusieurs sauvegardes locales en attente. Leur revision peut être plus
  // grande que celle du serveur tout en transportant les anciens totaux.
  // Le token oblige alors le client à adopter une fois l'état admin exact
  // avant qu'une nouvelle sauvegarde complète soit acceptée.
  let serverData = {};
  try { serverData = JSON.parse(me.data || "{}") || {}; } catch { serverData = {}; }
  const adminWriteToken = String(serverData._adminWriteToken || "");
  if (adminWriteToken && String(blob._adminWriteToken || "") !== adminWriteToken) {
    return json(res, 409, {
      ok: false,
      stale: true,
      adminConflict: true,
      error: "Modification administrateur plus recente.",
      user: rowToPublic(me),
    });
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
        let faction = "";
        try {
          const data = JSON.parse(r.data || "{}");
          rankPoints = Math.max(0, Math.floor(Number(data?.stats?.rankPoints) || 0));
          honor = Math.max(0, Math.floor(Number(data?.stats?.honor) || 0));
          // XP / honneur TOTAUX du compte pour les points de classement.
          const te = Math.floor(Number(data?.stats?.exp));
          if (Number.isFinite(te) && te >= 0) totalExp = te;
          const th = Math.floor(Number(data?.stats?.honor));
          if (Number.isFinite(th) && th >= 0) totalHonneur = th;
          const fa = String(data?.faction || "").toLowerCase();
          if (fa === "mmo" || fa === "eic" || fa === "vru") faction = fa;
        } catch {}
        list.push({
          pseudo: String(r.pseudo || "Pilote").slice(0, 20),
          points: kills * 10 + Math.floor(totalExp / 1000 + totalHonneur / 100),
          rankPoints, honor, faction,
          _kills: kills,
        });
      }
      list.sort((a, b) => b.points - a.points || b._kills - a._kills);
      return json(res, 200, { ok: true, list: list.slice(0, 100).map(({ pseudo, points, rankPoints, honor, faction }) => ({ pseudo, points, rankPoints, honor, faction })) });
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
  // --- Clans : fiche, création, invitations, rangs ---
  if (pathname === "/api/clans/me" && req.method === "GET") {
    const me = authUser(req);
    if (!me) return json(res, 401, { ok: false, error: "Session invalide." });
    return json(res, 200, { ok: true, clan: getMyClan(me.id) });
  }
  if (pathname === "/api/clans/info" && req.method === "GET") {
    if (rateLimited(`${ip}:/api/clans`, 60)) return json(res, 429, { ok: false, error: "Trop de tentatives, reessaie dans une minute." });
    const me = authUser(req);
    if (!me) return json(res, 401, { ok: false, error: "Session invalide." });
    let tag = "";
    try { tag = String(new URL(req.url, "http://localhost").searchParams.get("tag") || ""); } catch {}
    const info = getClanInfo(tag);
    if (!info) return json(res, 404, { ok: false, error: "Clan introuvable." });
    return json(res, 200, { ok: true, clan: info });
  }
  if (pathname === "/api/clans/invites" && req.method === "GET") {
    const me = authUser(req);
    if (!me) return json(res, 401, { ok: false, error: "Session invalide." });
    return json(res, 200, { ok: true, invites: getClanInvites(me.id) });
  }
  if (pathname === "/api/clans" && req.method === "POST") {
    if (rateLimited(`${ip}:/api/clans`, 60)) return json(res, 429, { ok: false, error: "Trop de tentatives, reessaie dans une minute." });
    const me = authUser(req);
    if (!me) return json(res, 401, { ok: false, error: "Session invalide." });
    readBody(req, res, (body) => {
      try {
        const r = createClan(me.id, body?.name, body?.tag);
        if (!r.ok) {
          const msg = r.error === "ALREADY" ? "Tu es déjà dans un clan."
            : r.error === "NAME" ? "Nom de clan invalide (3 lettres minimum)."
            : r.error === "TAG" ? "Tag invalide (2 à 5 lettres/chiffres)."
            : r.error === "TAKEN" ? "Ce tag est déjà pris." : "Erreur serveur.";
          return json(res, r.error === "TAKEN" || r.error === "ALREADY" ? 409 : 400, { ok: false, error: msg });
        }
        return json(res, 200, { ok: true, clan: r.clan });
      } catch { json(res, 500, { ok: false, error: "Erreur serveur." }); }
    });
    return true;
  }
  if ((pathname === "/api/clans/invite" || pathname === "/api/clans/accept" || pathname === "/api/clans/decline"
    || pathname === "/api/clans/leave" || pathname === "/api/clans/kick" || pathname === "/api/clans/rank"
    || pathname === "/api/clans/description") && req.method === "POST") {
    if (rateLimited(`${ip}:/api/clans`, 60)) return json(res, 429, { ok: false, error: "Trop de tentatives, reessaie dans une minute." });
    const me = authUser(req);
    if (!me) return json(res, 401, { ok: false, error: "Session invalide." });
    readBody(req, res, (body) => {
      try {
        if (pathname === "/api/clans/invite") {
          const r = inviteToClan(me.id, body?.pseudo);
          if (!r.ok) {
            const msg = r.error === "NOT_FOUND" ? "Pilote introuvable."
              : r.error === "SELF" ? "Tu ne peux pas t'inviter toi-même."
              : r.error === "INCLAN" ? "Ce pilote est déjà dans un clan."
              : r.error === "SENT" ? "Invitation déjà envoyée."
              : r.error === "FULL" ? "Clan plein (30 max)."
              : r.error === "RIGHTS" ? "Seuls le chef et les officiers invitent."
              : r.error === "NOCLAN" ? "Tu n'es dans aucun clan." : "Erreur serveur.";
            const code = r.error === "NOT_FOUND" ? 404 : (r.error === "INCLAN" || r.error === "SENT" || r.error === "FULL") ? 409 : 400;
            return json(res, code, { ok: false, error: msg });
          }
          return json(res, 200, { ok: true, to: r.to });
        }
        if (pathname === "/api/clans/accept") {
          const r = acceptClanInvite(me.id, body?.tag);
          if (!r.ok) {
            const msg = r.error === "INCLAN" ? "Tu es déjà dans un clan."
              : r.error === "FULL" ? "Clan plein (30 max)."
              : "Invitation introuvable.";
            return json(res, r.error === "INCLAN" || r.error === "FULL" ? 409 : 404, { ok: false, error: msg });
          }
          return json(res, 200, { ok: true, clan: r.clan });
        }
        if (pathname === "/api/clans/decline") {
          declineClanInvite(me.id, body?.tag);
          return json(res, 200, { ok: true });
        }
        if (pathname === "/api/clans/leave") {
          const r = leaveClan(me.id);
          if (!r.ok) return json(res, 404, { ok: false, error: "Tu n'es dans aucun clan." });
          return json(res, 200, { ok: true, dissolved: r.dissolved === true });
        }
        if (pathname === "/api/clans/kick") {
          const r = kickClanMember(me.id, body?.pseudo);
          if (!r.ok) {
            const msg = r.error === "NOT_FOUND" ? "Pilote introuvable."
              : r.error === "SELF" ? "Tu ne peux pas t'exclure toi-même (quitte le clan)."
              : r.error === "NOMEMBER" ? "Pas membre de ton clan."
              : r.error === "RIGHTS" ? "Droits insuffisants."
              : "Erreur serveur.";
            return json(res, r.error === "NOT_FOUND" || r.error === "NOMEMBER" ? 404 : 400, { ok: false, error: msg });
          }
          return json(res, 200, { ok: true, kicked: r.kicked });
        }
        if (pathname === "/api/clans/rank") {
          const r = setClanRank(me.id, body?.pseudo, body?.officer === true);
          if (!r.ok) return json(res, 400, { ok: false, error: "Promotion impossible (chef uniquement)." });
          return json(res, 200, { ok: true, member: r.member });
        }
        const r = setClanDescription(me.id, body?.description);
        if (!r.ok) return json(res, 400, { ok: false, error: "Description impossible (chef uniquement)." });
        return json(res, 200, { ok: true });
      } catch { json(res, 500, { ok: false, error: "Erreur serveur." }); }
    });
    return true;
  }
  if (pathname.startsWith("/api/")) {
    json(res, 404, { ok: false, error: "Inconnu." });
    return true;
  }
  return false;
}
