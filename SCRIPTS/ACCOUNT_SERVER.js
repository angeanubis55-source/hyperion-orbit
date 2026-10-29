// SCRIPTS/ACCOUNT_SERVER.js — Comptes serveur (SQLite, zero dependance).
// Persistance autoritaire du blob user + auth par token. Les achats boutique
// sont calcules ici ; les autres mutations historiques arrivent encore par
// snapshot revisionne (anti-ecrasement silencieux).
// Le client local continue de sanitizer (plafond historique, sentinelle Infinity).

import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { gunzip } from "node:zlib";
import { mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { computeHangarStats } from "../SHIP/SHIP_HANGARS.js";
import { activeBoosterMults, getBooster } from "../SRC/DATA/BOOSTERS.js";
import { pilotSkillMults } from "../SRC/DATA/PILOT_SKILLS.js";
import { calculateRankPoints } from "../SRC/CORE/PROGRESSION.js";
import { getShipDesignBaseId, getShipFamilyId, getShipFamilyIds, getShipFamilyName, getShipPackById } from "../SHIP/SHIP_PACKS.js";
import { DRONE_XP_SHARE, getDroneLevel } from "../DRONE/DRONE_TYPES.js";
import { DRONE_DESIGNS, getDroneDesign } from "../DRONE/DRONE_DESIGNS.js";
import { createPet, getPetHullPrice, getPetLevel, PET_FUEL_MAX, PET_HULL_MAX_BUYS, PET_XP_SHARE } from "../PET/PET_TYPES.js";
import { npcMapCreditMultiplier, resolveNpcReward } from "../NPC/NPC_BALANCE.js";
import { rollNpcAssemblyDirect } from "../NPC/NPC_ASSEMBLY.js";
import { MODULE_ALL_STATS, MODULE_DAILY_ROLL_LIMIT, MODULE_DMG_STATS, MODULE_PCT_BAN, MODULE_ROLL_COST, MODULE_SELL_PRICES, MODULE_SPC_STATS, MODULE_STAT_FAMILY, MODULE_TIER_MALUS, getModuleRarity, getStatMaxPct } from "../SRC/DATA/MODULE_DROPS.js";
import { generateShipModule } from "../SRC/DATA/MODULE_GEN.js";
import { findCatalogItem } from "../SRC/CORE/CATALOG.js";
import { createDrone, DRONE_FORMATIONS, DRONE_TYPES, getIrisPrice, SPECIAL_DRONE_PRICE } from "../DRONE/DRONE_TYPES.js";
import { getFaction, getFactionBaseSpawn } from "../SRC/CORE/FACTIONS.js";
import { CARGO_CAPACITY, cargoAdd, getRefineryRecipe, ORE_SELL_PRICES, planAutoUpgradeCharges, REFINERY_RECIPES, refineOreOutput, upgradeOreCapacity } from "../SRC/DATA/RESOURCES.js";
import { getPetTradeBonusPct } from "../PET/PET_GEARS.js";
import { CRAFTING_ENABLED, getCraftingRecipe } from "../SRC/DATA/CRAFTING.js";
import { isHalloweenEventActive } from "../NPC/NPC_HALLOWEEN.js";
import { getPassShopOffer, PASS_MODULE_FORCED } from "../SRC/DATA/PASS_SHOP.js";
import { SKYLAB_INSTANT_TRANSPORT_COST, SKYLAB_MAX_ROBOTS, SKYLAB_RESOURCE_IDS, SKYLAB_ROBOT_CREDIT_COST, SKYLAB_ROBOT_LIFETIME_MS, SKYLAB_TRANSPORT_COOLDOWN_SEC, canStartSkylabUpgrade, getSkylabModuleDef, isCollectorModule, normalizeSkylabState, skylabRobotCount, skylabStorageCap, tickSkylabState } from "../SRC/DATA/SKYLAB.js";
import { deployBuiltGalaxyGate, normalizeGalaxyGateState, palladiumExchangeForEnergy, setGalaxyGateMultiplierArmed, spinGalaxyGate } from "../SRC/CORE/GALAXY_GATES.js";
import { authLink, emailServiceReady, emailTemplate, sendAccountEmail } from "./EMAIL_SERVICE.js";

const DB_DIR = resolve(process.env.ORBIT_DATA_DIR || resolve(process.cwd(), "SERVER_DATA"));
const DB_PATH = join(DB_DIR, "orbit.db");

const FACTIONS = new Set(["mmo", "eic", "vru"]);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i;
const TOKEN_TTL_MS = 30 * 24 * 3600 * 1000;
const VERIFY_TTL_MS = 24 * 3600 * 1000;
const RESET_TTL_MS = 60 * 60 * 1000;
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
// scrypt ASYNC : la version sync bloquait la boucle du processus (qui heberge
// aussi la simu multi) ~40-100 ms par login -> freeze pour tous les joueurs.
// Meme parametres/sortie que scryptSync, format v2$ inchange.
const scryptAsync = promisify(scrypt);
async function hashPassword(plain) {
  const salt = randomBytes(16).toString("hex");
  const derived = (await scryptAsync(String(plain ?? ""), salt, 64)).toString("hex");
  return `v2$${salt}$${derived}`;
}
async function verifyPassword(stored, candidate) {
  const c = String(candidate ?? "");
  if (typeof stored === "string" && stored.startsWith("v2$")) {
    const parts = String(stored).split("$");
    if (parts.length !== 3 || !parts[1] || !parts[2]) return false;
    try {
      const actual = await scryptAsync(c, parts[1], 64);
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

const authTokenHash = token => sha256hex(`orbit-auth:${String(token || "")}`);
function issueAccountToken(userId, kind, ttlMs) {
  const raw = randomBytes(32).toString("base64url");
  const now = Date.now();
  db.prepare("DELETE FROM account_auth_tokens WHERE user_id = ? AND kind = ?").run(String(userId), String(kind));
  db.prepare("INSERT INTO account_auth_tokens (token_hash, user_id, kind, created_at, expires_at, used_at) VALUES (?, ?, ?, ?, ?, 0)")
    .run(authTokenHash(raw), String(userId), String(kind), now, now + ttlMs);
  return raw;
}
function consumeAccountToken(raw, kind) {
  const now = Date.now();
  const hash = authTokenHash(raw);
  const row = db.prepare("SELECT * FROM account_auth_tokens WHERE token_hash = ? AND kind = ? AND used_at = 0 AND expires_at > ?")
    .get(hash, String(kind), now);
  if (!row) return null;
  const changed = db.prepare("UPDATE account_auth_tokens SET used_at = ? WHERE token_hash = ? AND used_at = 0").run(now, hash);
  return Number(changed.changes) === 1 ? row : null;
}
function testEmailBypass(email) {
  return /@[^@]+\.test$/i.test(String(email || "")) && !emailServiceReady();
}
const emailText = value => String(value || "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));

async function sendVerificationEmail(user, rawToken) {
  const href = authLink({ verify: rawToken });
  await sendAccountEmail({
    to: user.email,
    subject: "Confirme ton inscription Hyperion Orbit",
    text: `Bonjour ${user.pseudo}, confirme ton inscription avec ce lien (valable 24 h) : ${href}`,
    html: emailTemplate("Confirme ton inscription", `Bienvenue ${emailText(user.pseudo)}. Confirme ton adresse email pour activer ton compte. Ce lien expire dans 24 heures.`, "Activer mon compte", href),
  });
}

// --- Base ---
let db = null;
export function initAccountDb() {
  if (db) return db;
  mkdirSync(DB_DIR, { recursive: true });
  db = new DatabaseSync(DB_PATH);
  let hadEmailVerifiedColumn = false;
  try { hadEmailVerifiedColumn = db.prepare("PRAGMA table_info(users)").all().some(row => row.name === "email_verified_at"); } catch {}
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
      updated_at INTEGER NOT NULL,
      email_verified_at INTEGER NOT NULL DEFAULT 0
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
    CREATE TABLE IF NOT EXISTS account_auth_tokens (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      used_at INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_account_auth_tokens_user ON account_auth_tokens(user_id, kind);
    CREATE TABLE IF NOT EXISTS account_save_tx (
      user_id TEXT NOT NULL,
      save_id TEXT NOT NULL,
      request_hash TEXT NOT NULL,
      metadata TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, save_id)
    );
    CREATE INDEX IF NOT EXISTS idx_account_save_tx_created ON account_save_tx(user_id, created_at DESC);
    CREATE TABLE IF NOT EXISTS pvp_stats (
      user_id TEXT PRIMARY KEY,
      kills INTEGER NOT NULL DEFAULT 0,
      xp INTEGER NOT NULL DEFAULT 0,
      honneur INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS pvp_ship_kills (
      user_id TEXT NOT NULL,
      ship TEXT NOT NULL,
      kills INTEGER NOT NULL DEFAULT 0,
      xp INTEGER NOT NULL DEFAULT 0,
      honneur INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (user_id, ship)
    );
    CREATE INDEX IF NOT EXISTS idx_pvp_ship_kills_user ON pvp_ship_kills(user_id);
    CREATE TABLE IF NOT EXISTS pvp_pet_kills (
      user_id TEXT PRIMARY KEY,
      kills INTEGER NOT NULL DEFAULT 0,
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
    CREATE TABLE IF NOT EXISTS clan_applications (
      clan_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (clan_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_clan_applications_user ON clan_applications(user_id);
    CREATE TABLE IF NOT EXISTS clan_ranks (
      clan_id TEXT NOT NULL,
      id TEXT NOT NULL,
      name TEXT NOT NULL,
      rights INTEGER NOT NULL DEFAULT 0,
      builtin TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      PRIMARY KEY (clan_id, id)
    );
    CREATE TABLE IF NOT EXISTS clan_diplo (
      id TEXT PRIMARY KEY,
      from_clan TEXT NOT NULL,
      to_clan TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'nap',
      status TEXT NOT NULL DEFAULT 'pending',
      kills_from INTEGER NOT NULL DEFAULT 0,
      kills_to INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      ends_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_clan_diplo_clans ON clan_diplo(from_clan, to_clan);
    CREATE TABLE IF NOT EXISTS clan_log (
      clan_id TEXT NOT NULL,
      text TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_clan_log_clan ON clan_log(clan_id, created_at);
  `);
  try { db.exec("ALTER TABLE users ADD COLUMN email_verified_at INTEGER NOT NULL DEFAULT 0"); } catch {}
  // Compatibilité : les comptes créés avant l'arrivée de la validation email
  // restent utilisables. Cette migration ne s'exécute qu'une seule fois.
  if (!hadEmailVerifiedColumn) {
    try { db.exec("UPDATE users SET email_verified_at = created_at WHERE email_verified_at = 0"); } catch {}
  }
  // Menage des sessions expirees (toutes les heures).
  const purge = () => {
    try { db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(Date.now()); } catch {}
    try { db.prepare("DELETE FROM account_auth_tokens WHERE expires_at < ? OR used_at > 0").run(Date.now()); } catch {}
    try {
      const stale = db.prepare("SELECT id FROM users WHERE email_verified_at = 0 AND created_at < ?").all(Date.now() - VERIFY_TTL_MS);
      for (const row of stale) {
        db.prepare("DELETE FROM account_auth_tokens WHERE user_id = ?").run(row.id);
        db.prepare("DELETE FROM users WHERE id = ?").run(row.id);
      }
    } catch {}
    try { db.prepare("DELETE FROM npc_reward_tx WHERE created_at < ?").run(Date.now() - 7 * 24 * 3600_000); } catch {}
  };
  purge();
  setInterval(purge, 3600_000).unref?.();
  // Clans : recrutement ouvert/fermé pour les bases existantes.
  try { db.exec("ALTER TABLE clans ADD COLUMN open INTEGER NOT NULL DEFAULT 1"); } catch {}
  // Clans : annonce (message du jour) et banque de crédits.
  try { db.exec("ALTER TABLE clans ADD COLUMN motd TEXT NOT NULL DEFAULT ''"); } catch {}
  try { db.exec("ALTER TABLE clans ADD COLUMN motd_at INTEGER NOT NULL DEFAULT 0"); } catch {}
  try { db.exec("ALTER TABLE clans ADD COLUMN bank INTEGER NOT NULL DEFAULT 0"); } catch {}
  // Crédits reçus de la banque depuis l'arrivée (plafond 50 M / jour de clan).
  try { db.exec("ALTER TABLE clan_members ADD COLUMN bank_received INTEGER NOT NULL DEFAULT 0"); } catch {}
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS clan_bank_log (
      clan_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      amount INTEGER NOT NULL,
      target_id TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_clan_bank_log_clan ON clan_bank_log(clan_id, created_at);`);
  } catch {}
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS clan_announcements (
      clan_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      text TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_clan_announcements_clan ON clan_announcements(clan_id, created_at);`);
  } catch {}
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS friend_blocks (
      user_id TEXT NOT NULL,
      blocked_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, blocked_id)
    );
    CREATE INDEX IF NOT EXISTS idx_friend_blocks_blocked ON friend_blocks(blocked_id);`);
  } catch {}
  // Le rang Chef affiche tous les droits, banque comprise.
  try { db.exec("UPDATE clan_ranks SET rights = 31 WHERE builtin = 'leader' AND rights != 31"); } catch {}
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
export function awardNpcKill(accountId, npcType, mapId, rewardPercent, ownsKill, txKey, shipPassivesEnabled = true) {
  initAccountDb();
  const uid = String(accountId || "");
  const type = String(npcType || "");
  const key = String(txKey || "").slice(0, 240);
  const reward = resolveNpcReward(type);
  if (!uid || !key || !reward) return null;
  const pct = Math.max(0, Math.min(100, Number(rewardPercent) || 0));
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
    const baseCredits = Math.max(0, Math.floor(Number(reward.credits) * pct / 100
      * npcMapCreditMultiplier(mapId)));
    const baseExp = Math.max(0, Math.floor(Number(reward.exp) * pct / 100));
    const baseHonor = Math.max(0, Math.floor(Number(reward.honor) * pct / 100));
    const rawShipId = String(hangar?.shipId || data.ship || "");
    const shipXp = shipPassivesEnabled && String(getShipDesignBaseId(rawShipId) || rawShipId).toLowerCase() === "goliath_x" ? 1.02 : 1;
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
    // Drops directs assemblage (rinusk, traceur...) : autoritaire serveur en
    // multi, sinon le client les perdait (écrasé par la version serveur) et le
    // toast n'affichait jamais "Vous avez reçu X Rinusk". Seul le propriétaire
    // du loot (killer) les reçoit, comme en solo.
    let direct = [];
    if (ownsKill === true) {
      try {
        const rolled = rollNpcAssemblyDirect(type);
        if (Array.isArray(rolled) && rolled.length) {
          data.inventory ||= {};
          data.inventory.resources ||= {};
          for (const entry of rolled) {
            const resource = String(entry?.resource || "");
            const qty = Math.max(0, Math.floor(Number(entry?.qty) || 0));
            if (!resource || qty <= 0) continue;
            data.inventory.resources[resource] =
              Math.max(0, Math.floor(Number(data.inventory.resources[resource]) || 0)) + qty;
            direct.push({ resource, qty });
          }
        }
      } catch {}
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
    return {
      credits, exp, honor, baseExp, baseHonor, petExp, revision, direct,
      totalCredits: Math.max(0, Math.floor(Number(data.credits) || 0)),
      totalExp: Math.max(0, Math.floor(Number(data.stats?.exp) || 0)),
      totalHonor: Math.floor(Number(data.stats?.honor) || 0),
      ownsKill: ownsKill === true, type, txKey: key,
    };
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

function addInventoryCount(data, itemId, quantity) {
  data.inventory ||= {};
  data.inventory.counts ||= {};
  data.inventory.counts[itemId] = Math.max(0, Math.floor(Number(data.inventory.counts[itemId]) || 0)) + quantity;
}

function applyCatalogPurchase(data, item, requestedQuantity, options = {}) {
  const isUnique = !!(item.ship?.id || item.design?.id || item.pet?.id || item.drone || item.formation);
  let quantity = isUnique ? 1 : Math.min(item.give?.ammo ? 1_000_000 : 5000,
    Math.max(1, Math.floor(Number(requestedQuantity) || 1)));
  let totalPrice = Math.max(0, Math.floor(Number(item.price) || 0)) * quantity;
  data.inventory ||= {};
  data.inventory.modules ||= [];
  data.inventory.ships ||= [];
  data.inventory.counts ||= {};

  if (item.petHull) {
    if (data.pet?.owned !== true) return { error: "P.E.T non possede." };
    const owned = Math.max(0, Math.min(PET_HULL_MAX_BUYS, Math.floor(Number(data.pet.hullUpgrades) || 0)));
    if (owned >= PET_HULL_MAX_BUYS) return { error: "Coque+ au maximum." };
    quantity = Math.min(quantity, PET_HULL_MAX_BUYS - owned);
    totalPrice = 0;
    for (let index = 0; index < quantity; index++) totalPrice += getPetHullPrice(owned + index);
    if (Math.max(0, Math.floor(Number(data.credits) || 0)) < totalPrice) return { error: "Credits insuffisants." };
    data.credits -= totalPrice;
    data.pet.hullUpgrades = owned + quantity;
    addInventoryCount(data, item.id, quantity);
    return { quantity, totalPrice };
  }
  if (item.petFuel) {
    if (data.pet?.owned !== true) return { error: "P.E.T non possede." };
    const space = Math.max(0, PET_FUEL_MAX - Math.max(0, Math.floor(Number(data.pet.fuel) || 0)));
    if (!space) return { error: "Reservoir plein." };
    quantity = Math.min(quantity, space);
    totalPrice = Math.max(0, Math.floor(Number(item.price) || 0)) * quantity;
  }
  if (item.ship?.id && data.inventory.ships.includes(String(item.ship.id))) return { error: "Deja possede." };
  if (item.design?.id) {
    data.inventory.shipDesigns ||= [];
    const designId = String(item.design.id);
    if (data.inventory.shipDesigns.includes(designId) || data.inventory.ships.includes(designId)) return { error: "Design deja possede." };
  }
  if (item.pet?.id && (data.pet?.owned === true || Number(data.inventory.counts[item.id] || 0) > 0)) return { error: "P.E.T deja possede." };
  if (item.petGear || item.petProtocol) {
    if (data.pet?.owned !== true) return { error: "P.E.T non possede." };
    const required = Math.max(0, Math.floor(Number(item.petLevel) || 0));
    if (getPetLevel(data.pet.exp) < required) return { error: `P.E.T niveau ${required} requis.` };
  }
  if (item.drone?.type) {
    const type = String(item.drone.type);
    const definition = DRONE_TYPES[type];
    if (!definition) return { error: "Drone introuvable." };
    data.drones ||= { items: [], formations: ["standard"], activeFormation: "standard" };
    data.drones.items ||= [];
    const owned = data.drones.items.filter(drone => drone?.type === type).length;
    if (owned >= definition.maxOwned) return { error: `Limite de ${definition.maxOwned} ${definition.name} atteinte.` };
    totalPrice = type === "iris" ? getIrisPrice(owned) : SPECIAL_DRONE_PRICE;
  }
  if (item.formation?.id) {
    const formation = DRONE_FORMATIONS.find(entry => entry.id === item.formation.id);
    if (!formation || !(Number(formation.price) > 0)) return { error: "Formation non disponible en boutique." };
    data.drones ||= { items: [], formations: ["standard"], activeFormation: "standard" };
    data.drones.formations ||= ["standard"];
    if (data.drones.formations.includes(formation.id)) return { error: "Formation deja possedee." };
    totalPrice = Number(formation.price);
  }
  if (!Number.isSafeInteger(totalPrice) || Math.max(0, Math.floor(Number(data.credits) || 0)) < totalPrice) {
    return { error: "Credits insuffisants." };
  }
  data.credits = Math.max(0, Math.floor(Number(data.credits) || 0)) - totalPrice;

  for (const [ammoId, amount] of Object.entries(item.give?.ammo || {})) {
    if (ammoId === "x1") continue;
    data.ammo ||= {};
    data.ammo[ammoId] = Math.max(0, Math.floor(Number(data.ammo[ammoId]) || 0)) + Math.max(0, Math.floor(Number(amount) || 0)) * quantity;
  }
  for (const [rocketId, amount] of Object.entries(item.give?.rockets || {})) {
    data.rockets ||= {};
    data.rockets[rocketId] = Math.max(0, Math.floor(Number(data.rockets[rocketId]) || 0)) + Math.max(0, Math.floor(Number(amount) || 0)) * quantity;
  }
  for (const [resourceId, amount] of Object.entries(item.give?.resources || {})) {
    data.inventory.resources ||= {};
    data.inventory.resources[resourceId] = Math.max(0, Math.floor(Number(data.inventory.resources[resourceId]) || 0)) + Math.max(0, Math.floor(Number(amount) || 0)) * quantity;
  }
  if (item.give?.ammo || item.give?.rockets || item.module || item.petGear || item.petProtocol || item.ticket?.kind || item.petFuel) {
    addInventoryCount(data, item.id, quantity);
  }
  if (item.petFuel) data.pet.fuel = Math.min(PET_FUEL_MAX, Math.max(0, Math.floor(Number(data.pet.fuel) || 0)) + quantity);
  if (item.module && !data.inventory.modules.includes(item.id)) data.inventory.modules.push(item.id);
  if (item.booster?.id) {
    const booster = getBooster(item.booster.id);
    if (!booster) return { error: "Booster introuvable." };
    data.boosters ||= { active: {} };
    data.boosters.active ||= {};
    const now = Date.now();
    const current = Number(data.boosters.active[booster.id] || 0);
    data.boosters.active[booster.id] = (current > now ? current : now) + Math.max(1, Number(booster.durationSec) || 0) * 1000 * quantity;
  }
  if (item.ship?.id) {
    const shipId = String(item.ship.id);
    data.inventory.ships.push(shipId);
    data.hangars ||= [];
    if (!data.hangars.some(hangar => hangar?.shipId === shipId)) {
      const faction = getFaction(data.faction);
      data.hangars.push({ id: `h_${shipId}_${Date.now()}_${randomBytes(6).toString("hex")}`, shipId, active: false,
        modules: { speed: null, shield: null, laser: null, extras: [] }, lastPos: getFactionBaseSpawn(data.faction), lastMap: `${faction.sector}-1` });
    }
  }
  if (item.design?.id) data.inventory.shipDesigns.push(String(item.design.id));
  if (item.pet?.id) {
    addInventoryCount(data, item.id, 1);
    data.pet = createPet(String(item.pet.id), { pseudo: options.petPseudo, faction: data.faction });
  }
  if (item.drone?.type) {
    const drone = createDrone(String(item.drone.type), `drone_${uuid()}`);
    data.drones.items.push(drone);
  }
  if (item.formation?.id) data.drones.formations.push(String(item.formation.id));
  return { quantity, totalPrice };
}

function ammoSellInfo(id) {
  const key = String(id || "");
  if (!key || key === "x1") return null;
  for (const [prefix, field, give] of [["ammo_", "ammo", "ammo"], ["rocket_", "rockets", "rockets"]]) {
    const item = findCatalogItem(prefix + key);
    const size = Math.max(1, Math.floor(Number(item?.give?.[give]?.[key]) || 0));
    const price = Math.max(0, Math.floor(Number(item?.price) || 0));
    if (item && size > 0 && price > 0) return { field, unit: Math.floor(price * 0.5 / size) };
  }
  return null;
}

function moduleRerollCredits(module) {
  const explicit = Number(module?.rerollCredits);
  if (Number.isFinite(explicit) && explicit >= 0) return Math.floor(explicit);
  let total = 0;
  for (let index = 0; index < Math.max(0, Math.floor(Number(module?.rerolls) || 0)); index++) {
    total += Math.max(0, Number(MODULE_ROLL_COST) || 0) * Math.pow(5, index + 1);
  }
  return Math.floor(total);
}

function serverModuleGroupKey(module) {
  return JSON.stringify({ t: module?.type || "", tier: module?.tier || "", ship: module?.shipId || "",
    b: module?.bonuses || [], r: Math.max(0, Math.floor(Number(module?.rerolls) || 0)), c: moduleRerollCredits(module) });
}

function serverModuleSellPrice(module) {
  return Math.max(0, Number(MODULE_SELL_PRICES[getModuleRarity(module?.bonuses?.length)]) || 0)
    + Math.floor(moduleRerollCredits(module) * 0.5);
}

function serverModuleDailyKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function ensureServerModuleInventory(data) {
  data.inventory ||= {};
  data.inventory.counts ||= {};
  data.inventory.resources ||= {};
  data.inventory.shipModules ||= [];
  data.inventory.moduleRollHistory ||= [];
  data.stats ||= {};
}

// Journal des tirages : tenu par le serveur (tirages /api/modules, dimanche),
// le client ne l'envoie plus. Borne comme cote client (plafond historique 500).
function capServerHistory(data) {
  try {
    if (Array.isArray(data?.inventory?.moduleRollHistory) && data.inventory.moduleRollHistory.length > 500) {
      data.inventory.moduleRollHistory = data.inventory.moduleRollHistory.slice(-500);
    }
  } catch {}
}

function payServerModuleRoll(data, cost, payWith = "auto") {
  const tickets = Math.max(0, Math.floor(Number(data.inventory.counts.ticket_module_reroll) || 0));
  if (payWith !== "credits" && tickets > 0) {
    data.inventory.counts.ticket_module_reroll = tickets - 1;
    if (data.inventory.counts.ticket_module_reroll <= 0) delete data.inventory.counts.ticket_module_reroll;
    return { type: "ticket", amount: 1 };
  }
  const price = Math.max(0, Math.floor(Number(cost) || 0));
  const credits = Math.max(0, Math.floor(Number(data.credits) || 0));
  if (credits < price) throw Object.assign(new Error("Credits insuffisants."), { client: true });
  data.credits = credits - price;
  return { type: "credits", amount: price };
}

function applyServerModuleOperation(data, body) {
  ensureServerModuleInventory(data);
  const action = String(body?.action || "");
  if (action === "roll") {
    const day = serverModuleDailyKey();
    const stored = data.stats.moduleDailyRolls;
    const count = stored?.day === day ? Math.max(0, Math.floor(Number(stored.count) || 0)) : 0;
    let payment;
    if (count >= MODULE_DAILY_ROLL_LIMIT) {
      // Quota du jour épuisé : seul un ticket de tirage permet un tirage
      // supplémentaire (hors quota, le compteur n'avance pas).
      const tickets = Math.max(0, Math.floor(Number(data.inventory.counts.ticket_module_roll) || 0));
      if (!(tickets > 0)) throw Object.assign(new Error(`Limite quotidienne atteinte (${MODULE_DAILY_ROLL_LIMIT} tirages/jour).`), { client: true, quota: { used: count, limit: MODULE_DAILY_ROLL_LIMIT, left: 0, day } });
      data.inventory.counts.ticket_module_roll = tickets - 1;
      if (data.inventory.counts.ticket_module_roll <= 0) delete data.inventory.counts.ticket_module_roll;
      payment = { type: "ticket", amount: 1 };
    } else {
      payment = payServerModuleRoll(data, MODULE_ROLL_COST, "credits");
      data.stats.moduleDailyRolls = { day, count: count + 1 };
    }
    const module = generateShipModule(data);
    module.rerolls = 0; module.rerollCredits = 0;
    data.inventory.shipModules.push(module);
    data.inventory.moduleRollHistory.push({ ...module, rollPayment: payment });
    capServerHistory(data);
    return { module, payment };
  }
  if (action === "reroll") {
    const oldId = String(body?.moduleId || "");
    const index = data.inventory.shipModules.findIndex(module => String(module?.id || "") === oldId);
    if (index < 0) throw Object.assign(new Error("Module plus en inventaire : relance impossible."), { client: true });
    const old = data.inventory.shipModules[index];
    const rerolls = Math.max(0, Math.floor(Number(old.rerolls) || 0));
    const cost = MODULE_ROLL_COST * Math.pow(5, rerolls + 1);
    // Choix explicite du client ("credits" / "ticket"), "auto" = ticket
    // d'abord comme avant. Un ticket exigé mais absent = refus net.
    const want = String(body?.payWith || "auto").toLowerCase();
    let payment;
    if (want === "credits") {
      payment = payServerModuleRoll(data, cost, "credits");
    } else if (want === "ticket") {
      const tickets = Math.max(0, Math.floor(Number(data.inventory.counts.ticket_module_reroll) || 0));
      if (!(tickets > 0)) throw Object.assign(new Error("Aucun ticket de relance."), { client: true });
      data.inventory.counts.ticket_module_reroll = tickets - 1;
      if (data.inventory.counts.ticket_module_reroll <= 0) delete data.inventory.counts.ticket_module_reroll;
      payment = { type: "ticket", amount: 1 };
    } else {
      payment = payServerModuleRoll(data, cost, "auto");
    }
    const module = generateShipModule(data, {
      shipId: old.shipId, familyId: old.familyId, type: old.type, tier: old.tier,
      statCount: Math.max(1, Array.isArray(old.bonuses) ? old.bonuses.length : 1),
    });
    module.rerolls = rerolls + 1;
    module.rerollCredits = moduleRerollCredits(old) + (payment.type === "credits" ? cost : 0);
    data.inventory.shipModules.splice(index, 1, module);
    data.inventory.moduleRollHistory.push({ ...module, rollPayment: payment });
    capServerHistory(data);
    return { module, payment };
  }
  if (action === "pass") {
    if (!isHalloweenEventActive()) throw Object.assign(new Error("Event Halloween termine."), { client: true });
    const offer = getPassShopOffer(body?.offerId);
    if (!offer) throw Object.assign(new Error("Offre inconnue."), { client: true });
    const keys = Math.max(0, Math.floor(Number(data.inventory.resources.battlepass_key) || 0));
    if (keys < offer.cost) throw Object.assign(new Error(`Cles insuffisantes : ${keys} / ${offer.cost}.`), { client: true });
    data.inventory.resources.battlepass_key = keys - offer.cost;
    let module = null;
    if (offer.kind === "module") {
      const forced = PASS_MODULE_FORCED[offer.rarity];
      module = generateShipModule(data, forced);
      module.rerolls = 0; module.rerollCredits = 0;
      data.inventory.shipModules.push(module);
      data.inventory.moduleRollHistory.push({ ...module, rollPayment: { type: "keys", amount: offer.cost } });
      capServerHistory(data);
    } else if (offer.kind === "resources") {
      for (const [id, amount] of Object.entries(offer.resources)) data.inventory.resources[id] = Math.max(0, Math.floor(Number(data.inventory.resources[id]) || 0)) + amount;
    } else if (offer.kind === "item") {
      data.inventory.counts[offer.itemId] = Math.max(0, Math.floor(Number(data.inventory.counts[offer.itemId]) || 0)) + 1;
    }
    return { module, payment: { type: "keys", amount: offer.cost } };
  }
  throw Object.assign(new Error("Operation module inconnue."), { client: true });
}

function serverCargoCapacity(data) {
  let pct = 0;
  try { pct = Number(pilotSkillMults(data?.pilotSkills)?.cargoPct) || 0; } catch {}
  return Math.max(1, Math.floor(CARGO_CAPACITY * (1 + Math.max(0, pct) / 100)));
}

function syncServerSkylab(data, now = Date.now()) {
  data.skylab = normalizeSkylabState(data.skylab, now);
  const last = Number(data.skylab.lastTickAt) || now;
  const elapsed = Math.max(0, Math.min(12 * 3600, (now - last) / 1000));
  return tickSkylabState(data.skylab, now, elapsed);
}

function serverSkylabAmounts(raw) {
  const amounts = {};
  for (const id of SKYLAB_RESOURCE_IDS) {
    const value = Math.max(0, Math.floor(Number(raw?.[id]) || 0));
    if (value > 0) amounts[id] = value;
  }
  return amounts;
}

function moveServerSkylab(data, amounts, toSky) {
  data.inventory ||= {}; data.inventory.resources ||= {};
  const sky = data.skylab;
  const moved = {};
  let totalMoved = 0;
  for (const [id, requested] of Object.entries(amounts)) {
    if (id === "xenomit") continue;
    if (toSky) {
      const inShip = Math.max(0, Math.floor(Number(data.inventory.resources[id]) || 0));
      const room = Math.max(0, skylabStorageCap(sky, id) - Math.floor(Number(sky.stock[id]) || 0));
      const quantity = Math.min(requested, inShip, room);
      if (!(quantity > 0)) continue;
      data.inventory.resources[id] = inShip - quantity;
      if (data.inventory.resources[id] <= 0) delete data.inventory.resources[id];
      sky.stock[id] = Math.max(0, Number(sky.stock[id]) || 0) + quantity;
      moved[id] = quantity; totalMoved += quantity;
    } else {
      const inSky = Math.max(0, Math.floor(Number(sky.stock[id]) || 0));
      if (!(inSky > 0)) continue;
      const { added } = cargoAdd(data.inventory.resources, id, Math.min(requested, inSky), serverCargoCapacity(data));
      if (!(added > 0)) continue;
      sky.stock[id] = Math.max(0, Number(sky.stock[id]) || 0) - added;
      data.inventory.resources[id] = Math.max(0, Math.floor(Number(data.inventory.resources[id]) || 0)) + added;
      moved[id] = added; totalMoved += added;
    }
  }
  return { moved, totalMoved };
}

function applyServerSkylabOperation(data, body, now = Date.now()) {
  const tick = syncServerSkylab(data, now);
  const sky = data.skylab;
  const action = String(body?.action || "sync");
  if (action === "sync") return { completed: tick.completed };
  if (action === "upgrade") {
    const moduleId = String(body?.moduleId || "");
    const check = canStartSkylabUpgrade(sky, moduleId, Number(data.credits || 0), now);
    if (!check.ok) throw Object.assign(new Error(check.error), { client: true });
    data.credits = Math.max(0, Math.floor(Number(data.credits) || 0) - check.cost.credits);
    for (const [id, amount] of Object.entries(check.cost.resEach)) sky.stock[id] = Math.max(0, Math.floor(Number(sky.stock[id]) || 0) - amount);
    sky.modules[moduleId].upgrading = { to: check.to, finishesAt: now + check.cost.timeSecGame * 1000 };
    sky.lastTickAt = now;
    return { moduleId, to: check.to, cost: check.cost, completed: tick.completed };
  }
  if (action === "toggle") {
    const moduleId = String(body?.moduleId || "");
    if (!getSkylabModuleDef(moduleId)) throw Object.assign(new Error("Module inconnu."), { client: true });
    if (["basic", "solar", "storage", "transport"].includes(moduleId)) throw Object.assign(new Error("Ce module reste toujours actif."), { client: true });
    sky.modules[moduleId].enabled = body?.enabled !== false;
    return { moduleId, enabled: sky.modules[moduleId].enabled, completed: tick.completed };
  }
  if (action === "robot") {
    const moduleId = String(body?.moduleId || "");
    if (!isCollectorModule(moduleId)) throw Object.assign(new Error("Robots reserves aux collecteurs."), { client: true });
    const module = sky.modules[moduleId];
    if (Math.floor(Number(module?.level) || 0) < 1) throw Object.assign(new Error("Construis d'abord ce collecteur."), { client: true });
    if (skylabRobotCount(module, now).total >= SKYLAB_MAX_ROBOTS) throw Object.assign(new Error(`Maximum ${SKYLAB_MAX_ROBOTS} robots par collecteur.`), { client: true });
    const credits = Math.max(0, Math.floor(Number(data.credits) || 0));
    if (credits < SKYLAB_ROBOT_CREDIT_COST) throw Object.assign(new Error("Credits insuffisants."), { client: true });
    data.credits = credits - SKYLAB_ROBOT_CREDIT_COST;
    module.robots.push({ elite: false, expiresAt: now + SKYLAB_ROBOT_LIFETIME_MS });
    return { moduleId, price: SKYLAB_ROBOT_CREDIT_COST, completed: tick.completed };
  }
  if (action === "transport" || action === "instant") {
    if (Math.floor(Number(sky.modules?.transport?.level) || 0) < 1) throw Object.assign(new Error("Module de transport indisponible."), { client: true });
    const amounts = serverSkylabAmounts(body?.amounts);
    delete amounts.xenomit;
    if (!Object.keys(amounts).length) throw Object.assign(new Error("Choisis une quantite a transporter."), { client: true });
    const toSky = body?.toSky === true;
    if (action === "transport" && Number(sky.transportReadyAt) > now) {
      const wait = Math.ceil((Number(sky.transportReadyAt) - now) / 1000);
      throw Object.assign(new Error(`Transporteur en vol (${wait}s).`), { client: true });
    }
    if (action === "instant" && Math.max(0, Math.floor(Number(data.credits) || 0)) < SKYLAB_INSTANT_TRANSPORT_COST) {
      throw Object.assign(new Error("Credits insuffisants pour l'envoi immediat."), { client: true });
    }
    const moved = moveServerSkylab(data, amounts, toSky);
    if (!(moved.totalMoved > 0)) throw Object.assign(new Error("Rien a transporter (stocks vides ou pleins)."), { client: true });
    if (action === "instant") data.credits = Math.max(0, Math.floor(Number(data.credits) || 0) - SKYLAB_INSTANT_TRANSPORT_COST);
    else sky.transportReadyAt = now + SKYLAB_TRANSPORT_COOLDOWN_SEC * 1000;
    sky.lastTickAt = now;
    return { ...moved, cost: action === "instant" ? SKYLAB_INSTANT_TRANSPORT_COST : 0, completed: tick.completed };
  }
  throw Object.assign(new Error("Operation Skylab inconnue."), { client: true });
}

function applyServerGalaxyGateOperation(data, body) {
  data.galaxyGates = normalizeGalaxyGateState(data.galaxyGates);
  data.inventory ||= {}; data.inventory.resources ||= {};
  data.ammo ||= {}; data.rockets ||= {};
  const action = String(body?.action || "");
  if (action === "spin") {
    const gateId = String(body?.gateId || "").toLowerCase();
    const count = Math.max(1, Math.min(100, Math.floor(Number(body?.count) || 1)));
    const result = spinGalaxyGate(data.galaxyGates, gateId, count, data.credits, Math.random);
    if (!result.ok) throw Object.assign(new Error(result.error || "Spin impossible."), { client: true });
    data.galaxyGates = result.state;
    data.credits = result.credits;
    for (const [id, amount] of Object.entries(result.rewards?.ammo || {})) {
      data.ammo[id] = Math.max(0, Math.floor(Number(data.ammo[id]) || 0)) + Math.max(0, Math.floor(Number(amount) || 0));
    }
    for (const [id, amount] of Object.entries(result.rewards?.rockets || {})) {
      data.rockets[id] = Math.max(0, Math.floor(Number(data.rockets[id]) || 0)) + Math.max(0, Math.floor(Number(amount) || 0));
    }
    return { performed: result.performed, rewards: result.rewards, state: result.state };
  }
  if (action === "multiplier") {
    const result = setGalaxyGateMultiplierArmed(data.galaxyGates, body?.gateId, body?.armed === true);
    if (!result.ok) throw Object.assign(new Error("Aucun multiplicateur disponible."), { client: true });
    data.galaxyGates = result.state;
    return { state: result.state };
  }
  if (action === "deploy") {
    const result = deployBuiltGalaxyGate(data.galaxyGates, body?.gateId);
    if (!result.ok) throw Object.assign(new Error("Cette Gate ne peut pas etre envoyee sur la map."), { client: true });
    data.galaxyGates = result.state;
    return { state: result.state };
  }
  if (action === "palladium") {
    const owned = Math.max(0, Math.floor(Number(data.inventory.resources.palladium) || 0));
    const exchange = palladiumExchangeForEnergy(owned, Infinity);
    if (!(exchange.energies > 0)) throw Object.assign(new Error("Palladium insuffisant."), { client: true });
    data.inventory.resources.palladium = exchange.remaining;
    data.galaxyGates.energy += exchange.energies;
    return { energies: exchange.energies, cost: exchange.cost };
  }
  throw Object.assign(new Error("Operation Galaxy Gate inconnue."), { client: true });
}

function visitEquipmentFits(data, callback) {
  for (const hangar of data.hangars || []) {
    for (const config of ["1", "2"]) callback(hangar?.fits?.[config], ["lasers", "gens", "extras", "shipMods"]);
  }
  for (const drone of data.drones?.items || []) {
    for (const perHangar of Object.values(drone?.fitsByHangar || {})) for (const config of ["1", "2"]) callback(perHangar?.[config], ["equipment"]);
    for (const config of ["1", "2"]) callback(drone?.fits?.[config], ["equipment"]);
    callback(drone?.fit, ["equipment"]);
  }
  if (data.pet?.owned === true) {
    for (const perHangar of Object.values(data.pet.fitsByHangar || {})) for (const config of ["1", "2"]) callback(perHangar?.[config], ["lasers", "generators", "gears", "protocols"]);
    for (const config of ["1", "2"]) callback(data.pet.fits?.[config], ["lasers", "generators", "gears", "protocols"]);
    callback(data.pet.fit, ["lasers", "generators", "gears", "protocols"]);
  }
}

function reservedCatalogCopies(data, itemId) {
  let reserved = 0;
  const count = values => Array.isArray(values) ? values.filter(value => String(value || "") === itemId).length : 0;
  for (const hangar of data.hangars || []) for (const config of ["1", "2"]) {
    let used = 0;
    const shipFit = hangar?.fits?.[config] || {};
    for (const group of ["lasers", "gens", "extras"]) used += count(shipFit[group]);
    for (const drone of data.drones?.items || []) {
      const fit = drone?.fitsByHangar?.[String(hangar.id)]?.[config] || drone?.fits?.[config] || drone?.fit;
      used += count(fit?.equipment);
    }
    if (data.pet?.owned === true) {
      const fit = data.pet?.fitsByHangar?.[String(hangar.id)]?.[config] || data.pet?.fits?.[config] || data.pet?.fit;
      for (const group of ["lasers", "generators", "gears", "protocols"]) used += count(fit?.[group]);
    }
    reserved = Math.max(reserved, used);
  }
  return reserved;
}

function stripCatalogItem(data, itemId) {
  let stripped = 0;
  visitEquipmentFits(data, (fit, groups) => {
    if (!fit) return;
    for (const group of groups) if (Array.isArray(fit[group])) {
      fit[group] = fit[group].map(value => {
        if (String(value || "") !== itemId) return value;
        stripped++; return null;
      });
    }
  });
  return stripped;
}

function equippedTraderLevel(data) {
  const hangar = (data.hangars || []).find(entry => entry?.active) || data.hangars?.[0];
  const config = String(Number(hangar?.activeConfig) === 2 ? 2 : 1);
  const perHangar = data.pet?.fitsByHangar?.[String(hangar?.id || "")]?.[config];
  const fit = perHangar || data.pet?.fits?.[config] || data.pet?.fit;
  let level = 0;
  for (const itemId of fit?.gears || []) {
    const gear = findCatalogItem(String(itemId || ""))?.petGear;
    if (gear?.key === "tra") level = Math.max(level, Math.floor(Number(gear.level) || 0));
  }
  return level;
}

function addServerHangar(data, shipId) {
  data.hangars ||= [];
  if (data.hangars.some(hangar => hangar?.shipId === shipId)) return;
  const faction = getFaction(data.faction);
  data.hangars.push({ id: `h_${shipId}_${Date.now()}_${randomBytes(6).toString("hex")}`, shipId, active: false,
    modules: { speed: null, shield: null, laser: null, extras: [] }, lastPos: getFactionBaseSpawn(data.faction), lastMap: `${faction.sector}-1` });
}

function applyServerCraft(data, recipe, requestedQuantity) {
  const quantity = Math.min(100, Math.max(1, Math.floor(Number(requestedQuantity) || 1)));
  if (!CRAFTING_ENABLED) return { error: "Assemblage desactive." };
  if (recipe.event === "halloween" && !isHalloweenEventActive()) return { error: "Event Halloween termine." };
  if (Object.keys(recipe.output?.ships || {}).length && quantity !== 1) return { error: "Un vaisseau se fabrique un par un." };
  if (Object.keys(recipe.output?.pet || {}).length && quantity !== 1) return { error: "Un P.E.T se fabrique un par un." };
  data.inventory ||= {}; data.inventory.resources ||= {}; data.inventory.counts ||= {}; data.inventory.modules ||= []; data.inventory.ships ||= [];
  data.drones ||= { items: [], formations: ["standard"], activeFormation: "standard" };
  data.drones.items ||= []; data.drones.formations ||= ["standard"];
  for (const shipId of Object.keys(recipe.output?.ships || {})) if (data.inventory.ships.includes(shipId)) return { error: "Ce vaisseau est deja possede." };
  for (const [type, amount] of Object.entries(recipe.output?.drones || {})) {
    const definition = DRONE_TYPES[type];
    const owned = data.drones.items.filter(drone => drone?.type === type).length;
    if (!definition || owned + Math.max(0, Number(amount) || 0) * quantity > definition.maxOwned) return { error: "Limite de drones depassee." };
  }
  for (const formationId of Object.keys(recipe.output?.formations || {})) if (data.drones.formations.includes(formationId)) return { error: "Formation deja possedee." };
  if (Object.keys(recipe.output?.pet || {}).length && data.pet?.owned === true) return { error: "P.E.T deja possede." };
  const creditCost = Math.max(0, Math.floor(Number(recipe.costs?.credits) || 0)) * quantity;
  if (Math.max(0, Math.floor(Number(data.credits) || 0)) < creditCost) return { error: "Credits insuffisants." };
  for (const [resourceId, unitCost] of Object.entries(recipe.costs?.resources || {})) {
    const required = Math.max(0, Math.floor(Number(unitCost) || 0)) * quantity;
    if (Math.max(0, Math.floor(Number(data.inventory.resources[resourceId]) || 0)) < required) return { error: `Ressource insuffisante : ${resourceId}.` };
  }
  for (const [itemId, unitCost] of Object.entries(recipe.costs?.items || {})) {
    const required = Math.max(0, Math.floor(Number(unitCost) || 0)) * quantity;
    const owned = Math.max(0, Math.floor(Number(data.inventory.counts[itemId]) || 0));
    if (owned < required) return { error: `Objet insuffisant : ${itemId}.` };
    if (owned - required < reservedCatalogCopies(data, itemId)) return { error: "Objet equipe : retire-le avant de l'assembler." };
  }
  const diskCost = Math.max(0, Math.floor(Number(recipe.costs?.logDisks) || 0)) * quantity;
  if (Math.max(0, Math.floor(Number(data.pilotSkills?.disks) || 0)) < diskCost) return { error: "Disques de log insuffisants." };
  for (const [ammoId, unitCost] of Object.entries(recipe.costs?.ammo || {})) {
    const required = Math.max(0, Math.floor(Number(unitCost) || 0)) * quantity;
    if (Math.max(0, Math.floor(Number(data.ammo?.[ammoId]) || 0)) < required) return { error: `Munitions insuffisantes : ${ammoId}.` };
  }
  data.credits = Math.max(0, Math.floor(Number(data.credits) || 0)) - creditCost;
  for (const [resourceId, unitCost] of Object.entries(recipe.costs?.resources || {})) data.inventory.resources[resourceId] -= Math.max(0, Math.floor(Number(unitCost) || 0)) * quantity;
  for (const [itemId, unitCost] of Object.entries(recipe.costs?.items || {})) {
    data.inventory.counts[itemId] -= Math.max(0, Math.floor(Number(unitCost) || 0)) * quantity;
    if (data.inventory.counts[itemId] <= 0) { delete data.inventory.counts[itemId]; data.inventory.modules = data.inventory.modules.filter(value => value !== itemId); }
  }
  if (diskCost > 0) { data.pilotSkills ||= {}; data.pilotSkills.disks = Math.max(0, Math.floor(Number(data.pilotSkills.disks) || 0)) - diskCost; }
  data.ammo ||= {};
  for (const [ammoId, unitCost] of Object.entries(recipe.costs?.ammo || {})) data.ammo[ammoId] -= Math.max(0, Math.floor(Number(unitCost) || 0)) * quantity;
  for (const [resourceId, amount] of Object.entries(recipe.output?.resources || {})) data.inventory.resources[resourceId] = Math.max(0, Math.floor(Number(data.inventory.resources[resourceId]) || 0)) + Math.max(0, Math.floor(Number(amount) || 0)) * quantity;
  for (const [itemId, amount] of Object.entries(recipe.output?.items || {})) addInventoryCount(data, itemId, Math.max(0, Math.floor(Number(amount) || 0)) * quantity);
  data.rockets ||= {};
  for (const [rocketId, amount] of Object.entries(recipe.output?.rockets || {})) data.rockets[rocketId] = Math.max(0, Math.floor(Number(data.rockets[rocketId]) || 0)) + Math.max(0, Math.floor(Number(amount) || 0)) * quantity;
  for (const shipId of Object.keys(recipe.output?.ships || {})) { data.inventory.ships.push(shipId); addServerHangar(data, shipId); }
  for (const [type, amount] of Object.entries(recipe.output?.drones || {})) for (let index = 0; index < Math.max(0, Math.floor(Number(amount) || 0)) * quantity; index++) data.drones.items.push(createDrone(type, `drone_${uuid()}`));
  for (const formationId of Object.keys(recipe.output?.formations || {})) data.drones.formations.push(formationId);
  for (const petCatalogId of Object.keys(recipe.output?.pet || {})) {
    const item = findCatalogItem(petCatalogId);
    if (!item?.pet?.id) continue;
    addInventoryCount(data, item.id, 1); data.pet = createPet(String(item.pet.id), { faction: data.faction });
  }
  for (const [ammoId, amount] of Object.entries(recipe.output?.ammo || {})) if (ammoId !== "x1") data.ammo[ammoId] = Math.max(0, Math.floor(Number(data.ammo[ammoId]) || 0)) + Math.max(0, Math.floor(Number(amount) || 0)) * quantity;
  return { quantity, recipeId: recipe.id };
}

function newSession(userId) {
  const token = `tok_${randomBytes(32).toString("hex")}`;
  const now = Date.now();
  db.prepare("INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)")
    .run(sessionKey(token), userId, now, now + TOKEN_TTL_MS);
  return token;
}

// PvP : stats persistantes du tueur (classement). Retourne la ligne ou null.
// shipId : vaisseau de la victime (designs regroupés sur leur base).
export function recordPvpKill(accountId, exp, honneur, shipId) {
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
    try {
      const raw = String(shipId || "").toLowerCase().slice(0, 64);
      const ship = String(getShipDesignBaseId(raw) || getShipFamilyId(raw) || raw || "inconnu").toLowerCase().slice(0, 64) || "inconnu";
      db.prepare("INSERT INTO pvp_ship_kills (user_id, ship, kills, xp, honneur, updated_at) VALUES (?, ?, 1, ?, ?, ?) ON CONFLICT(user_id, ship) DO UPDATE SET kills = kills + 1, xp = xp + excluded.xp, honneur = honneur + excluded.honneur, updated_at = excluded.updated_at")
        .run(uid, ship, e, h, Date.now());
    } catch {}
    return db.prepare("SELECT kills, xp, honneur FROM pvp_stats WHERE user_id = ?").get(uid);
  } catch { return null; }
}

// PET ennemi détruit : seul le compteur (pas de récompense XP/honneur).
export function recordPvpPetKill(accountId) {
  try {
    initAccountDb();
    const uid = String(accountId || "");
    if (!uid) return null;
    const exists = db.prepare("SELECT 1 FROM users WHERE id = ?").get(uid);
    if (!exists) return null;
    db.prepare("INSERT INTO pvp_pet_kills (user_id, kills, updated_at) VALUES (?, 1, ?) ON CONFLICT(user_id) DO UPDATE SET kills = kills + 1, updated_at = excluded.updated_at")
      .run(uid, Date.now());
    return db.prepare("SELECT kills FROM pvp_pet_kills WHERE user_id = ?").get(uid);
  } catch { return null; }
}
// Admin (panneau /api/admin/give, meme effet que SCRIPTS/GIVE_CREDITS.js) :
// ajoute/retire des crédits à un compte par pseudo. Révision bumpée :
// le client adopte la version serveur à sa prochaine synchro.
// Plafond par opération : 1 million de Mds (1e15, montants exacts garantis).
const ADMIN_GIVE_CREDITS_MAX = 1e15;
export function adminGiveCredits(pseudo, amount) {
  try {
    initAccountDb();
    const key = norm(pseudo);
    if (!key) return { ok: false, error: "Pseudo manquant." };
    const row = db.prepare("SELECT * FROM users WHERE pseudo_norm = ?").get(key);
    if (!row) return { ok: false, error: "Compte introuvable." };
    const delta = Math.floor(Number(String(amount ?? "").replace(/[\s_]/g, "")) || 0);
    if (!Number.isFinite(delta) || delta === 0) return { ok: false, error: "Montant invalide (entier non nul)." };
    if (Math.abs(delta) > ADMIN_GIVE_CREDITS_MAX) return { ok: false, error: "Montant trop grand (max 1 million de Mds)." };
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
// gg (complétions Galaxy Gates non nulles), faction, createdAt, updatedAt }].
// Tri par pseudo, max 5000.
export function adminListAccounts() {
  try {
    initAccountDb();
    const rows = db.prepare("SELECT id, pseudo, faction, data, created_at, updated_at FROM users ORDER BY pseudo COLLATE NOCASE LIMIT 5000").all();
    return rows.map((r) => {
      let credits = 0, exp = 0, honor = 0;
      let gg = {};
      try {
        const data = JSON.parse(r.data || "{}");
        credits = Math.max(0, Math.floor(Number(data.credits) || 0));
        exp = Math.max(0, Math.floor(Number(data?.stats?.exp) || 0));
        honor = Math.max(0, Math.floor(Number(data?.stats?.honor) || 0));
        const completed = data?.galaxyGates?.completed;
        if (completed && typeof completed === "object") {
          for (const [gate, count] of Object.entries(completed)) {
            const n = Math.max(0, Math.floor(Number(count) || 0));
            if (n > 0 && /^[a-z]{3,8}$/.test(String(gate))) gg[String(gate)] = n;
          }
        }
      } catch {}
      const accountId = String(r.id);
      return {
        accountId,
        id: `u_${accountId}`.slice(0, 128),
        pseudo: String(r.pseudo || "Pilote").slice(0, 20),
        faction: String(r.faction || ""),
        credits, exp, honor, gg,
        createdAt: Number(r.created_at) || 0,
        updatedAt: Number(r.updated_at) || 0,
      };
    });
  } catch { return []; }
}

// Remise en etat de secours sans perte d'inventaire ni de progression.
export function adminDebugAccount(target) {
  try {
    initAccountDb();
    const raw = String(target || "").trim();
    if (!raw) return { ok: false, error: "Compte manquant." };
    const accountId = raw.startsWith("u_") ? raw.slice(2) : raw;
    const row = db.prepare("SELECT * FROM users WHERE id = ? OR pseudo_norm = ?").get(accountId, norm(raw));
    if (!row) return { ok: false, error: "Compte introuvable." };
    let data = {};
    try { data = JSON.parse(row.data || "{}") || {}; } catch { data = {}; }
    const faction = FACTIONS.has(norm(data.faction || row.faction)) ? norm(data.faction || row.faction) : "mmo";
    const home = { mmo: { map: "1-1", x: 1500, y: 1500 }, eic: { map: "2-1", x: 9500, y: 1500 }, vru: { map: "3-1", x: 9500, y: 5500 } }[faction];
    const starterId = "phoenix_bleu";
    data.inventory ||= {};
    data.inventory.ships = Array.isArray(data.inventory.ships) ? data.inventory.ships : [];
    if (!data.inventory.ships.some(id => /^phoenix_?bleu$/i.test(String(id)))) data.inventory.ships.push(starterId);
    data.hangars = Array.isArray(data.hangars) ? data.hangars.filter(h => h && typeof h === "object") : [];
    let starter = data.hangars.find(h => /^phoenix_?bleu$/i.test(String(h.shipId || "")));
    if (!starter) { starter = { id: `h_${starterId}_debug`, shipId: starterId }; data.hangars.push(starter); }
    const emptyShipFit = () => ({ lasers: [], gens: [], extras: [], shipMods: [] });
    for (const hangar of data.hangars) {
      hangar.active = hangar === starter;
      hangar.activeConfig = 1;
      hangar.fits = { "1": emptyShipFit(), "2": emptyShipFit() };
      hangar.fit = hangar.fits["1"];
      hangar.modules = { speed: null, shield: null, laser: null, extras: [] };
    }
    Object.assign(starter, { shipId: starterId, lastMap: home.map, lastPos: { x: home.x, y: home.y }, lastHpPct: 1, lastShPct: 1 });
    data.ship = starterId;
    const emptyDroneFit = () => ({ equipment: [], ability: null });
    data.drones ||= {};
    data.drones.items = Array.isArray(data.drones.items) ? data.drones.items : [];
    for (const drone of data.drones.items) {
      drone.fitsByHangar = {};
      for (const hangar of data.hangars) drone.fitsByHangar[String(hangar.id)] = { "1": emptyDroneFit(), "2": emptyDroneFit() };
      drone.fits = drone.fitsByHangar[String(starter.id)];
      drone.fit = drone.fits["1"];
    }
    const emptyPetFit = () => ({ lasers: [], generators: [], gears: [], protocols: [], ability: null });
    if (data.pet && typeof data.pet === "object") {
      data.pet.active = false;
      data.pet.fitsByHangar = {};
      for (const hangar of data.hangars) data.pet.fitsByHangar[String(hangar.id)] = { "1": emptyPetFit(), "2": emptyPetFit() };
      data.pet.fits = data.pet.fitsByHangar[String(starter.id)];
      data.pet.fit = data.pet.fits["1"];
    }
    if (data.eternalGate && typeof data.eternalGate === "object") data.eternalGate.inRun = false;
    const now = Date.now();
    const revision = Math.max(Math.floor(Number(data.revision) || 0), Number(row.revision) || 0) + 1;
    data._adminWriteToken = randomBytes(12).toString("hex");
    data.revision = revision;
    data.updatedAt = now;
    db.prepare("UPDATE users SET data = ?, revision = ?, updated_at = ? WHERE id = ?").run(JSON.stringify(data), revision, now, row.id);
    return { ok: true, id: String(row.id), pid: `u_${String(row.id)}`, pseudo: String(row.pseudo || "Pilote").slice(0, 20), ship: starterId, map: home.map, revision };
  } catch { return { ok: false, error: "Erreur serveur." }; }
}

// Admin (panneau /api/admin/reset-gg + /api/admin/give-gg) : retire/ajoute
// la complétion d'une Galaxy Gate d'un compte par pseudo ("all" = toutes).
// L'anneau doré apparaît/disparaît : le client adopte la version serveur à
// sa prochaine synchro (révision bumpée). Reset retire aussi les pièces
// Kronos issues de cette gate. Give incrémente (+1 par clic) ET ajoute
// +1 pièce Kronos (plafonnée au quota de la gate, comme une vraie complétion).
const ADMIN_GG_IDS = Object.freeze(["alpha", "beta", "gamma", "delta", "epsilon", "zeta", "kappa", "lambda", "kronos", "awakened"]);
// Quotas fidèles (miroir de KRONOS_PARTS_BY_GATE dans SRC/CORE/GALAXY_GATES.js) :
// chaque complétion d'une gate source donne +1 pièce Kronos jusqu'au quota.
const ADMIN_KRONOS_QUOTA = Object.freeze({ alpha: 4, beta: 3, gamma: 1, delta: 1, epsilon: 4, zeta: 1, kappa: 2, lambda: 5 });
export function adminGiveGalaxyGate(pseudo, gate) {
  try {
    initAccountDb();
    const key = norm(pseudo);
    if (!key) return { ok: false, error: "Pseudo manquant." };
    const row = db.prepare("SELECT * FROM users WHERE pseudo_norm = ?").get(key);
    if (!row) return { ok: false, error: "Compte introuvable." };
    const id = String(gate || "").toLowerCase();
    const all = id === "all";
    if (!all && !ADMIN_GG_IDS.includes(id)) return { ok: false, error: "Gate inconnue." };
    let data = {};
    try { data = JSON.parse(row.data || "{}") || {}; } catch { data = {}; }
    data.galaxyGates ||= {};
    data.galaxyGates.completed ||= {};
    data.galaxyGates.kronosParts ||= {};
    const targets = all ? [...ADMIN_GG_IDS] : [id];
    const kronosBuilt = Math.max(0, Math.floor(Number(data.galaxyGates.built?.kronos) || 0));
    const before = {};
    const after = {};
    const kronosBefore = {};
    const kronosAfter = {};
    for (const g of targets) {
      before[g] = Math.max(0, Math.floor(Number(data.galaxyGates.completed[g]) || 0));
      after[g] = before[g] + 1;
      data.galaxyGates.completed[g] = after[g];
      // ✅ pièce Kronos comme une vraie complétion (plafond par gate source,
      // jamais pour kronos/awakened, jamais si Kronos déjà construite).
      const quota = ADMIN_KRONOS_QUOTA[g] || 0;
      if (quota > 0 && kronosBuilt < 1) {
        kronosBefore[g] = Math.min(quota, Math.max(0, Math.floor(Number(data.galaxyGates.kronosParts[g]) || 0)));
        kronosAfter[g] = Math.min(quota, kronosBefore[g] + 1);
        data.galaxyGates.kronosParts[g] = kronosAfter[g];
      }
    }
    const now = Date.now();
    const newRev = Math.max(Math.floor(Number(data.revision) || 0), Number(row.revision) || 0) + 1;
    data._adminWriteToken = randomBytes(12).toString("hex");
    data.revision = newRev;
    data.updatedAt = now;
    db.prepare("UPDATE users SET data = ?, revision = ?, updated_at = ? WHERE id = ?")
      .run(JSON.stringify(data), newRev, now, row.id);
    return { ok: true, id: String(row.id), pseudo: String(row.pseudo || "Pilote").slice(0, 20), gates: targets, before, after, kronosBefore, kronosAfter, revision: newRev };
  } catch { return { ok: false, error: "Erreur serveur." }; }
}
export function adminResetGalaxyGate(pseudo, gate) {
  try {
    initAccountDb();
    const key = norm(pseudo);
    if (!key) return { ok: false, error: "Pseudo manquant." };
    const row = db.prepare("SELECT * FROM users WHERE pseudo_norm = ?").get(key);
    if (!row) return { ok: false, error: "Compte introuvable." };
    const id = String(gate || "").toLowerCase();
    const all = id === "all";
    if (!all && !ADMIN_GG_IDS.includes(id)) return { ok: false, error: "Gate inconnue." };
    let data = {};
    try { data = JSON.parse(row.data || "{}") || {}; } catch { data = {}; }
    data.galaxyGates ||= {};
    data.galaxyGates.completed ||= {};
    data.galaxyGates.kronosParts ||= {};
    const targets = all ? [...ADMIN_GG_IDS] : [id];
    const before = {};
    for (const g of targets) {
      before[g] = Math.max(0, Math.floor(Number(data.galaxyGates.completed[g]) || 0));
      data.galaxyGates.completed[g] = 0;
      if (g !== "kronos") data.galaxyGates.kronosParts[g] = 0;
    }
    const now = Date.now();
    const newRev = Math.max(Math.floor(Number(data.revision) || 0), Number(row.revision) || 0) + 1;
    data._adminWriteToken = randomBytes(12).toString("hex");
    data.revision = newRev;
    data.updatedAt = now;
    db.prepare("UPDATE users SET data = ?, revision = ?, updated_at = ? WHERE id = ?")
      .run(JSON.stringify(data), newRev, now, row.id);
    return { ok: true, id: String(row.id), pseudo: String(row.pseudo || "Pilote").slice(0, 20), gates: targets, before, revision: newRev };
  } catch { return { ok: false, error: "Erreur serveur." }; }
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
    try { db.prepare("DELETE FROM pvp_ship_kills WHERE user_id = ?").run(uid); } catch {}
    try { db.prepare("DELETE FROM pvp_pet_kills WHERE user_id = ?").run(uid); } catch {}
    try { db.prepare("DELETE FROM npc_reward_tx WHERE user_id = ?").run(uid); } catch {}
    try { db.prepare("DELETE FROM friends WHERE user_id = ? OR friend_id = ?").run(uid, uid); } catch {}
    try { db.prepare("DELETE FROM friend_requests WHERE from_id = ? OR to_id = ?").run(uid, uid); } catch {}
    // Clan : départ propre (succession du chef ou dissolution si dernier).
    let clanAffected = [];
    try {
      const r = clanLeaveCore(uid);
      clanAffected = Array.isArray(r?.affected) ? r.affected : [];
    } catch {}
    try { db.prepare("DELETE FROM clan_applications WHERE user_id = ?").run(uid); } catch {}
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
    return db.prepare(`SELECT u.id AS id, u.pseudo AS pseudo, u.faction AS faction, u.data AS data, u.updated_at AS updatedAt,
        f.created_at AS since, c.tag AS clanTag, COALESCE(p.kills, 0) AS pvpKills
      FROM friends f JOIN users u ON u.id = f.friend_id
      LEFT JOIN clan_members m ON m.user_id = u.id LEFT JOIN clans c ON c.id = m.clan_id
      LEFT JOIN pvp_stats p ON p.user_id = u.id
      WHERE f.user_id = ? ORDER BY u.pseudo COLLATE NOCASE`).all(uid)
      .map((r) => ({
        id: String(r.id), pseudo: String(r.pseudo || "Pilote").slice(0, 20),
        faction: String(r.faction || "").slice(0, 16),
        clan: String(r.clanTag || "").slice(0, 32),
        since: Math.max(0, Number(r.since) || 0),
        lastSeen: Math.max(0, Number(r.updatedAt) || 0),
        pvpKills: Math.max(0, Math.floor(Number(r.pvpKills) || 0)),
        ...clanStatsOfData(r.data),
      }));
  } catch { return []; }
}

function pseudoOf(userId) {
  try {
    initAccountDb();
    const row = db.prepare("SELECT pseudo FROM users WHERE id = ?").get(String(userId || ""));
    return row ? String(row.pseudo || "Pilote").slice(0, 20) : "Pilote";
  } catch { return "Pilote"; }
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

// --- Blocage : le bloqué ne peut plus envoyer de demande d'ami, de message
// privé ni d'invitation de groupe à celui qui l'a bloqué. Bloquer retire
// l'amitié et les demandes en attente dans les deux sens.
export function isBlockedBy(blockerId, blockedId) {
  try {
    initAccountDb();
    return !!db.prepare("SELECT 1 FROM friend_blocks WHERE user_id = ? AND blocked_id = ?").get(String(blockerId || ""), String(blockedId || ""));
  } catch { return false; }
}

export function blockUser(userId, pseudo) {
  try {
    initAccountDb();
    const uid = String(userId || "");
    const target = findUserByPseudo(pseudo);
    if (!uid || !target) return { ok: false, error: "NOT_FOUND" };
    if (target.id === uid) return { ok: false, error: "SELF" };
    db.prepare("INSERT OR IGNORE INTO friend_blocks (user_id, blocked_id, created_at) VALUES (?, ?, ?)").run(uid, target.id, Date.now());
    const wasFriend = areFriends(uid, target.id);
    removeFriend(uid, target.id);
    db.prepare("DELETE FROM friend_requests WHERE (from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?)").run(uid, target.id, target.id, uid);
    return { ok: true, blocked: target, wasFriend };
  } catch { return { ok: false, error: "SERVER" }; }
}

export function unblockUser(userId, pseudo) {
  try {
    initAccountDb();
    const uid = String(userId || "");
    const target = findUserByPseudo(pseudo);
    if (!uid || !target) return { ok: false, error: "NOT_FOUND" };
    db.prepare("DELETE FROM friend_blocks WHERE user_id = ? AND blocked_id = ?").run(uid, target.id);
    return { ok: true, unblocked: target };
  } catch { return { ok: false, error: "SERVER" }; }
}

export function listBlocked(userId) {
  try {
    initAccountDb();
    return db.prepare("SELECT u.pseudo AS pseudo, b.created_at AS at FROM friend_blocks b JOIN users u ON u.id = b.blocked_id WHERE b.user_id = ? ORDER BY b.created_at DESC").all(String(userId || ""))
      .map((r) => ({ pseudo: String(r.pseudo || "Pilote").slice(0, 20), at: Number(r.at) || 0 }));
  } catch { return []; }
}

// Demandes envoyées, en attente : [{ pseudo, at }].
export function getSentFriendRequests(userId) {
  try {
    initAccountDb();
    return db.prepare("SELECT u.pseudo AS pseudo, u.faction AS faction, r.created_at AS at FROM friend_requests r JOIN users u ON u.id = r.to_id WHERE r.from_id = ? ORDER BY r.created_at DESC").all(String(userId || ""))
      .map((r) => ({ pseudo: String(r.pseudo || "Pilote").slice(0, 20), faction: String(r.faction || "").slice(0, 16), at: Number(r.at) || 0 }));
  } catch { return []; }
}

export function cancelFriendRequest(userId, pseudo) {
  try {
    initAccountDb();
    const uid = String(userId || "");
    const target = findUserByPseudo(pseudo);
    if (!uid || !target) return { ok: false, error: "NOT_FOUND" };
    db.prepare("DELETE FROM friend_requests WHERE from_id = ? AND to_id = ?").run(uid, target.id);
    return { ok: true };
  } catch { return { ok: false, error: "SERVER" }; }
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
    if (isBlockedBy(uid, target.id)) return { ok: false, error: "YOU_BLOCKED" };
    if (isBlockedBy(target.id, uid)) return { ok: false, error: "BLOCKED" };
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
    return db.prepare("SELECT r.from_id AS fromId, u.pseudo AS pseudo, u.faction AS faction, r.created_at AS at FROM friend_requests r JOIN users u ON u.id = r.from_id WHERE r.to_id = ? ORDER BY r.created_at").all(String(userId))
      .map((r) => ({ fromId: String(r.fromId), pseudo: String(r.pseudo || "Pilote").slice(0, 20), faction: String(r.faction || "").slice(0, 16), at: Number(r.at) || 0 }));
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

// --- Clans façon DO (comptes uniquement) : création [TAG] (300 000
// crédits), candidatures joueur -> clan gratuites,
// rangs personnalisables avec droits, recrutement ouvert/fermé,
// diplomatie alliance / NAP / guerre (100 jours max, score de kills),
// journal de clan. Tchat via MULTI_SERVER.
// Un pilote = un seul clan. Le tag est unique (2-5 caractères affichés
// Nom et tag libres (Unicode, espaces et symboles). Taille max 30 membres.
export const CLAN_MAX_MEMBERS = 30;
export const CLAN_RIGHTS = Object.freeze({ APPS: 1, KICK: 2, DIPLO: 4, EDIT: 8, BANK: 16 });
const CLAN_RIGHTS_ALL = 31;
const CLAN_MOTD_MAX = 300;
const CLAN_BANK_MAX_TX = 1_000_000_000_000;
const CLAN_BANK_LOG_MAX = 40;
// Plafond de réception : 50 M par jour passé dans le clan, jour d'arrivée
// compris (50 M dès l'arrivée, 100 M au 2e jour...). Ce qui n'est pas reçu
// reste disponible ; chaque distribution est déduite. Compteur par membre
// (clan_members.bank_received), remis à zéro si le pilote quitte le clan.
export const CLAN_BANK_DAILY_LIMIT = 50_000_000;
const DAY_MS = 24 * 3600_000;
export function clanBankAllowance(joinedAt, received, now = Date.now()) {
  const days = Math.floor(Math.max(0, now - (Number(joinedAt) || now)) / DAY_MS) + 1;
  return {
    allowance: Math.max(0, days * CLAN_BANK_DAILY_LIMIT - Math.max(0, Number(received) || 0)),
    nextAt: (Number(joinedAt) || now) + days * DAY_MS,
  };
}
const CLAN_NAME_MAX = 64;
const CLAN_TAG_MAX = 32;
// Tag d'un nouveau clan : 5 caractères max (les anciens tags restent lisibles).
export const CLAN_TAG_CREATE_MAX = 5;
const CLAN_CREATE_COST = 300000;
const CLAN_WAR_MAX_MS = 100 * 24 * 3600_000;
const CLAN_LOG_MAX = 30;
const CLAN_RANK_NAME_RE = /^[\p{L}\p{N}_ -]{2,20}$/u;

function cleanClanName(s) {
  return String(s || "").normalize("NFKC").slice(0, CLAN_NAME_MAX);
}
function cleanClanTag(s) {
  return String(s || "").normalize("NFKC").slice(0, CLAN_TAG_MAX);
}
function clanTagKey(s) {
  return cleanClanTag(s).toLocaleLowerCase("fr");
}
function cleanClanDesc(s) {
  return String(s || "").replace(/\s+/g, " ").trim().slice(0, 250);
}
function cleanRankName(s) {
  return String(s || "").replace(/\s+/g, " ").trim().slice(0, 20);
}

// Crédits du blob serveur (vérification + débit création/candidature).
// Bump de révision : le client adopte le canon à sa prochaine synchro
// (même mécanisme que le give admin).
function adjustCredits(uid, delta) {
  try {
    initAccountDb();
    const row = db.prepare("SELECT * FROM users WHERE id = ?").get(String(uid || ""));
    if (!row) return { ok: false };
    let data = {};
    try { data = JSON.parse(row.data || "{}") || {}; } catch { data = {}; }
    const before = Math.max(0, Math.floor(Number(data.credits) || 0));
    if (delta < 0 && before < -delta) return { ok: false, credits: before };
    const after = Math.max(0, before + delta);
    const now = Date.now();
    const rev = Math.max(Math.floor(Number(data.revision) || 0), Number(row.revision) || 0) + 1;
    data.credits = after;
    data.revision = rev;
    data.updatedAt = now;
    db.prepare("UPDATE users SET data = ?, revision = ?, updated_at = ? WHERE id = ?")
      .run(JSON.stringify(data), rev, now, String(uid));
    return { ok: true, credits: after };
  } catch { return { ok: false }; }
}

// Journal de clan (30 dernières entrées) : arrivées, départs, diplo...
export function addClanLog(clanId, text) {
  try {
    initAccountDb();
    const cid = String(clanId || "");
    const clean = String(text || "").replace(/\s+/g, " ").trim().slice(0, 200);
    if (!cid || !clean) return;
    const now = Date.now();
    db.prepare("INSERT INTO clan_log (clan_id, text, created_at) VALUES (?, ?, ?)").run(cid, clean, now);
    db.prepare("DELETE FROM clan_log WHERE clan_id = ? AND rowid NOT IN (SELECT rowid FROM clan_log WHERE clan_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?)")
      .run(cid, cid, CLAN_LOG_MAX);
  } catch {}
}

function getClanLog(clanId, limit = 15) {
  try {
    initAccountDb();
    return db.prepare("SELECT text, created_at AS at FROM clan_log WHERE clan_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?").all(String(clanId), Math.max(1, Math.min(30, limit)))
      .map((r) => ({ text: String(r.text || "").slice(0, 200), at: Number(r.at) || 0 }));
  } catch { return []; }
}

// Rangs du clan (toujours au moins Chef / Officier / Membre).
export function clanRanks(clanId) {
  try {
    initAccountDb();
    const cid = String(clanId || "");
    if (!cid) return [];
    let rows = [];
    try { rows = db.prepare("SELECT name, rights, builtin FROM clan_ranks WHERE clan_id = ? ORDER BY CASE builtin WHEN 'leader' THEN 0 WHEN 'officer' THEN 1 WHEN 'member' THEN 2 ELSE 3 END, created_at").all(cid); } catch { rows = []; }
    if (!rows.length) {
      const now = Date.now();
      try {
        db.prepare("INSERT OR IGNORE INTO clan_ranks (clan_id, id, name, rights, builtin, created_at) VALUES (?, 'leader', 'Chef', 31, 'leader', ?)").run(cid, now);
        db.prepare("INSERT OR IGNORE INTO clan_ranks (clan_id, id, name, rights, builtin, created_at) VALUES (?, 'officer', 'Officier', 3, 'officer', ?)").run(cid, now);
        db.prepare("INSERT OR IGNORE INTO clan_ranks (clan_id, id, name, rights, builtin, created_at) VALUES (?, 'member', 'Membre', 0, 'member', ?)").run(cid, now);
        rows = db.prepare("SELECT name, rights, builtin FROM clan_ranks WHERE clan_id = ? ORDER BY CASE builtin WHEN 'leader' THEN 0 WHEN 'officer' THEN 1 WHEN 'member' THEN 2 ELSE 3 END, created_at").all(cid);
      } catch {}
    }
    return rows.map((r) => ({ name: String(r.name || "Membre").slice(0, 20), rights: Math.max(0, Math.min(CLAN_RIGHTS_ALL, Number(r.rights) || 0)), builtin: String(r.builtin || "") }));
  } catch { return []; }
}

// Droits effectifs d'un membre : { isLeader, apps, kick, diplo, edit, bank }.
export function clanRightsOf(userId, clanId) {
  const none = { isLeader: false, apps: false, kick: false, diplo: false, edit: false, bank: false };
  try {
    initAccountDb();
    const uid = String(userId || ""), cid = String(clanId || "");
    if (!uid || !cid) return none;
    const clan = db.prepare("SELECT leader_id FROM clans WHERE id = ?").get(cid);
    if (clan && String(clan.leader_id) === uid) return { isLeader: true, apps: true, kick: true, diplo: true, edit: true, bank: true };
    const mem = db.prepare("SELECT role FROM clan_members WHERE user_id = ? AND clan_id = ?").get(uid, cid);
    if (!mem) return none;
    const role = String(mem.role || "member");
    if (role === "leader") return { isLeader: true, apps: true, kick: true, diplo: true, edit: true, bank: true };
    const ranks = clanRanks(cid);
    const rank = ranks.find((x) => x.name.toLowerCase() === role.toLowerCase())
      || ranks.find((x) => x.builtin === "officer" && role === "officer")
      || null;
    // Repli legacy : un vieil "officer" sans ligne de rang garde ses droits.
    const bits = rank ? Number(rank.rights) : (role === "officer" ? 3 : 0);
    return {
      isLeader: false,
      apps: (bits & CLAN_RIGHTS.APPS) !== 0,
      kick: (bits & CLAN_RIGHTS.KICK) !== 0,
      diplo: (bits & CLAN_RIGHTS.DIPLO) !== 0,
      edit: (bits & CLAN_RIGHTS.EDIT) !== 0,
      bank: (bits & CLAN_RIGHTS.BANK) !== 0,
    };
  } catch { return none; }
}

function isClanLeader(userId, clanId) {
  try {
    initAccountDb();
    const row = db.prepare("SELECT leader_id FROM clans WHERE id = ?").get(String(clanId || ""));
    return !!row && String(row.leader_id) === String(userId || "");
  } catch { return false; }
}

export function clanIdOfUser(userId) {
  try {
    initAccountDb();
    const row = db.prepare("SELECT clan_id FROM clan_members WHERE user_id = ?").get(String(userId || ""));
    return row ? String(row.clan_id) : null;
  } catch { return null; }
}

export function clanIdOfTag(tag) {
  try {
    initAccountDb();
    const row = db.prepare("SELECT id FROM clans WHERE tag_norm = ?").get(clanTagKey(tag));
    return row ? String(row.id) : "";
  } catch { return ""; }
}

export function clanTagOfUser(userId) {
  try {
    initAccountDb();
    const row = db.prepare("SELECT c.tag AS tag FROM clan_members m JOIN clans c ON c.id = m.clan_id WHERE m.user_id = ?").get(String(userId || ""));
    return row ? String(row.tag || "").slice(0, CLAN_TAG_MAX) : "";
  } catch { return ""; }
}

function clanRoleOf(userId, clanId) {
  try {
    initAccountDb();
    const row = db.prepare("SELECT role FROM clan_members WHERE user_id = ? AND clan_id = ?").get(String(userId), String(clanId));
    return row ? String(row.role || "member") : null;
  } catch { return null; }
}

// Fiche complète : { id, name, tag, description, leader, role, members: [{id,pseudo,role}],
// applications: [{pseudo, at}] (candidatures reçues, leader/officer) }.
export function getMyClan(userId) {
  try {
    initAccountDb();
    const uid = String(userId || "");
    if (!uid) return null;
    const clan = db.prepare("SELECT c.*, m.role AS my_role FROM clan_members m JOIN clans c ON c.id = m.clan_id WHERE m.user_id = ?").get(uid);
    if (!clan) return null;
    const members = clanMemberRows(String(clan.id));
    const out = {
      id: String(clan.id), name: String(clan.name || "Clan").slice(0, CLAN_NAME_MAX), tag: String(clan.tag || "").slice(0, CLAN_TAG_MAX),
      description: String(clan.description || "").slice(0, 250),
      leader: String(clan.leader_id || ""), role: String(clan.my_role || "member"), members,
      open: Number(clan.open ?? 1) !== 0,
      ranks: clanRanks(String(clan.id)),
      log: getClanLog(String(clan.id), 15),
      motd: String(clan.motd || "").slice(0, CLAN_MOTD_MAX),
      motdAt: Math.max(0, Number(clan.motd_at) || 0),
      bank: Math.max(0, Math.floor(Number(clan.bank) || 0)),
      bankLog: getClanBankLog(String(clan.id)),
      announcements: getClanAnnouncements(String(clan.id)),
      createdAt: Math.max(0, Number(clan.created_at) || 0),
      rights: clanRightsOf(uid, String(clan.id)),
    };
    if (clanRightsOf(uid, String(clan.id)).apps) {
      try {
        out.applications = db.prepare("SELECT u.pseudo AS pseudo, a.created_at AS at FROM clan_applications a JOIN users u ON u.id = a.user_id WHERE a.clan_id = ? ORDER BY a.created_at").all(String(clan.id))
          .map((r) => ({ pseudo: String(r.pseudo || "Pilote").slice(0, 20), at: Number(r.at) || 0 }));
      } catch { out.applications = []; }
    }
    return out;
  } catch { return null; }
}

// --- Stats des membres, classement, annonce et banque de clan ---
// Présence fournie par MULTI_SERVER (même processus) : userId -> { online, map }.
let clanPresenceProvider = null;
export function setClanPresenceProvider(fn) {
  clanPresenceProvider = typeof fn === "function" ? fn : null;
}
function clanPresenceOf(userId) {
  try { return clanPresenceProvider?.(String(userId)) || null; } catch { return null; }
}

// Chiffres publics d'un compte (blob) : exp, honneur, points de grade, kills NPC.
function clanStatsOfData(raw) {
  let data = {};
  try { data = typeof raw === "string" ? (JSON.parse(raw || "{}") || {}) : (raw || {}); } catch { data = {}; }
  const stats = data.stats || {};
  const exp = Math.max(0, Math.floor(Number(stats.exp) || 0));
  const honor = Math.floor(Number(stats.honor) || 0);
  return {
    exp, honor,
    rankPoints: calculateRankPoints({ exp, honor }),
    npcKills: Math.max(0, Math.floor(Number(stats.lifetimeKills) || 0)),
  };
}

function clanMemberRows(clanId) {
  const now = Date.now();
  return db.prepare(`SELECT m.user_id AS id, u.pseudo AS pseudo, m.role AS role, m.joined_at AS joinedAt,
      m.bank_received AS bankReceived, u.data AS data, u.updated_at AS updatedAt, COALESCE(p.kills, 0) AS pvpKills
    FROM clan_members m JOIN users u ON u.id = m.user_id LEFT JOIN pvp_stats p ON p.user_id = m.user_id
    WHERE m.clan_id = ? ORDER BY CASE m.role WHEN 'leader' THEN 0 WHEN 'officer' THEN 1 ELSE 2 END, m.joined_at`).all(String(clanId))
    .map((r) => {
      const presence = clanPresenceOf(r.id);
      const quota = clanBankAllowance(r.joinedAt, r.bankReceived, now);
      return {
        id: String(r.id), pseudo: String(r.pseudo || "Pilote").slice(0, 20), role: String(r.role || "member"),
        joinedAt: Math.max(0, Number(r.joinedAt) || 0),
        lastSeen: Math.max(0, Number(r.updatedAt) || 0),
        online: presence?.online === true,
        map: presence?.online === true ? String(presence.map || "").slice(0, 24) : "",
        pvpKills: Math.max(0, Math.floor(Number(r.pvpKills) || 0)),
        bankReceived: Math.max(0, Math.floor(Number(r.bankReceived) || 0)),
        bankAllowance: quota.allowance,
        bankNextAt: quota.nextAt,
        ...clanStatsOfData(r.data),
      };
    });
}

function getClanBankLog(clanId) {
  try {
    return db.prepare(`SELECT l.kind AS kind, l.amount AS amount, l.created_at AS at, u.pseudo AS pseudo, t.pseudo AS target
      FROM clan_bank_log l LEFT JOIN users u ON u.id = l.user_id LEFT JOIN users t ON t.id = l.target_id
      WHERE l.clan_id = ? ORDER BY l.created_at DESC, l.rowid DESC LIMIT ?`).all(String(clanId), CLAN_BANK_LOG_MAX)
      .map((r) => ({
        kind: String(r.kind) === "withdraw" ? "withdraw" : "deposit",
        amount: Math.max(0, Math.floor(Number(r.amount) || 0)), at: Number(r.at) || 0,
        pseudo: String(r.pseudo || "Pilote").slice(0, 20), target: r.target ? String(r.target).slice(0, 20) : "",
      }));
  } catch { return []; }
}

function addClanBankLog(clanId, userId, kind, amount, targetId = "") {
  db.prepare("INSERT INTO clan_bank_log (clan_id, user_id, kind, amount, target_id, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .run(String(clanId), String(userId), kind, amount, String(targetId || ""), Date.now());
  db.prepare("DELETE FROM clan_bank_log WHERE clan_id = ? AND rowid NOT IN (SELECT rowid FROM clan_bank_log WHERE clan_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 200)")
    .run(String(clanId), String(clanId));
}

function cleanBankAmount(value) {
  const amount = Number(String(value ?? "").replace(/[\s_.]/g, ""));
  return Number.isSafeInteger(amount) && amount >= 1 && amount <= CLAN_BANK_MAX_TX ? amount : 0;
}

// Écrit les crédits d'un compte dans une transaction déjà ouverte.
// Révision incrémentée : un client connecté fusionne l'écart (409 stale).
function writeCreditsInTx(userId, delta) {
  const row = db.prepare("SELECT * FROM users WHERE id = ?").get(String(userId));
  if (!row) return null;
  const data = rowToPublic(row);
  const before = Math.max(0, Math.floor(Number(data.credits) || 0));
  if (delta < 0 && before < -delta) return { error: "NOCASH", before };
  const now = Date.now();
  data.credits = before + delta;
  data.revision = Math.max(Math.floor(Number(data.revision) || 0), Number(row.revision) || 0) + 1;
  data.updatedAt = now;
  db.prepare("UPDATE users SET data = ?, revision = ?, updated_at = ? WHERE id = ?")
    .run(JSON.stringify(data), data.revision, now, row.id);
  return { user: data, before, after: data.credits };
}

// Historique des annonces publiées (les 20 dernières).
function getClanAnnouncements(clanId) {
  try {
    return db.prepare(`SELECT a.text AS text, a.created_at AS at, u.pseudo AS pseudo
      FROM clan_announcements a LEFT JOIN users u ON u.id = a.user_id
      WHERE a.clan_id = ? ORDER BY a.created_at DESC, a.rowid DESC LIMIT 20`).all(String(clanId))
      .map((r) => ({ text: String(r.text || "").slice(0, CLAN_MOTD_MAX), at: Number(r.at) || 0, pseudo: String(r.pseudo || "Pilote").slice(0, 20) }));
  } catch { return []; }
}

// Bases de combat : rapport fourni par MULTI_SERVER (STATION_ROOM), même
// principe que la présence (pas d'import circulaire).
let clanBasesProvider = null;
export function setClanBasesProvider(fn) {
  clanBasesProvider = typeof fn === "function" ? fn : null;
}
export function getClanBases(userId) {
  try {
    const tag = clanTagOfUser(userId);
    const report = clanBasesProvider?.(tag) || null;
    return { tag, maps: report?.maps || [], mine: report?.mine || [], building: report?.building || [] };
  } catch { return { tag: "", maps: [], mine: [], building: [] }; }
}

// Annonce du clan (droit Édition). Vide = retirée.
export function setClanMotd(userId, text) {
  try {
    initAccountDb();
    const uid = String(userId || "");
    const clanId = clanIdOfUser(uid);
    if (!clanId) return { ok: false, error: "NOCLAN" };
    if (!clanRightsOf(uid, clanId).edit) return { ok: false, error: "RIGHTS" };
    const clean = String(text || "").replace(/\s+/g, " ").trim().slice(0, CLAN_MOTD_MAX);
    const at = clean ? Date.now() : 0;
    db.prepare("UPDATE clans SET motd = ?, motd_at = ? WHERE id = ?").run(clean, at, clanId);
    if (clean) {
      db.prepare("INSERT INTO clan_announcements (clan_id, user_id, text, created_at) VALUES (?, ?, ?, ?)").run(clanId, uid, clean, at);
      db.prepare("DELETE FROM clan_announcements WHERE clan_id = ? AND rowid NOT IN (SELECT rowid FROM clan_announcements WHERE clan_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 50)").run(clanId, clanId);
    }
    addClanLog(clanId, clean ? `Annonce publiée par ${pseudoOf(uid)}.` : `Annonce retirée par ${pseudoOf(uid)}.`);
    return { ok: true, motd: clean, motdAt: at };
  } catch { return { ok: false, error: "SERVER" }; }
}

// Dépôt : tout membre. Retourne le compte à jour (adopté par le client).
export function clanBankDeposit(userId, value) {
  let inTx = false;
  try {
    initAccountDb();
    const uid = String(userId || "");
    const amount = cleanBankAmount(value);
    if (!amount) return { ok: false, error: "AMOUNT" };
    const clanId = clanIdOfUser(uid);
    if (!clanId) return { ok: false, error: "NOCLAN" };
    db.exec("BEGIN IMMEDIATE"); inTx = true;
    const paid = writeCreditsInTx(uid, -amount);
    if (!paid || paid.error) {
      db.exec("ROLLBACK"); inTx = false;
      return { ok: false, error: paid?.error || "NOT_FOUND" };
    }
    db.prepare("UPDATE clans SET bank = bank + ? WHERE id = ?").run(amount, clanId);
    addClanBankLog(clanId, uid, "deposit", amount);
    db.exec("COMMIT"); inTx = false;
    const bank = Number(db.prepare("SELECT bank FROM clans WHERE id = ?").get(clanId)?.bank) || 0;
    return { ok: true, amount, bank, user: paid.user };
  } catch {
    if (inTx) { try { db.exec("ROLLBACK"); } catch {} }
    return { ok: false, error: "SERVER" };
  }
}

// Retrait / distribution vers un membre (droit Banque, chef inclus).
export function clanBankWithdraw(actorId, pseudo, value) {
  let inTx = false;
  try {
    initAccountDb();
    const uid = String(actorId || "");
    const amount = cleanBankAmount(value);
    if (!amount) return { ok: false, error: "AMOUNT" };
    const clanId = clanIdOfUser(uid);
    if (!clanId) return { ok: false, error: "NOCLAN" };
    if (!clanRightsOf(uid, clanId).bank) return { ok: false, error: "RIGHTS" };
    const target = db.prepare("SELECT id, pseudo FROM users WHERE pseudo_norm = ?").get(norm(pseudo));
    if (!target) return { ok: false, error: "NOT_FOUND" };
    if (clanIdOfUser(target.id) !== clanId) return { ok: false, error: "NOMEMBER" };
    db.exec("BEGIN IMMEDIATE"); inTx = true;
    const bank = Number(db.prepare("SELECT bank FROM clans WHERE id = ?").get(clanId)?.bank) || 0;
    if (bank < amount) {
      db.exec("ROLLBACK"); inTx = false;
      return { ok: false, error: "BANK", bank };
    }
    const member = db.prepare("SELECT joined_at AS joinedAt, bank_received AS received FROM clan_members WHERE clan_id = ? AND user_id = ?").get(clanId, String(target.id));
    const quota = clanBankAllowance(member?.joinedAt, member?.received);
    if (amount > quota.allowance) {
      db.exec("ROLLBACK"); inTx = false;
      return { ok: false, error: "LIMIT", allowance: quota.allowance, nextAt: quota.nextAt, target: String(target.pseudo || "Pilote").slice(0, 20) };
    }
    const paid = writeCreditsInTx(target.id, amount);
    if (!paid || paid.error) {
      db.exec("ROLLBACK"); inTx = false;
      return { ok: false, error: "NOT_FOUND" };
    }
    db.prepare("UPDATE clans SET bank = bank - ? WHERE id = ?").run(amount, clanId);
    db.prepare("UPDATE clan_members SET bank_received = bank_received + ? WHERE clan_id = ? AND user_id = ?").run(amount, clanId, String(target.id));
    addClanBankLog(clanId, uid, "withdraw", amount, target.id);
    db.exec("COMMIT"); inTx = false;
    return {
      ok: true, amount, bank: bank - amount, target: String(target.pseudo || "Pilote").slice(0, 20),
      targetId: String(target.id), user: String(target.id) === uid ? paid.user : null,
    };
  } catch {
    if (inTx) { try { db.exec("ROLLBACK"); } catch {} }
    return { ok: false, error: "SERVER" };
  }
}

// Clan qui disparaît : sa banque revient au dernier chef (jamais perdue).
function refundClanBank(clanId, userId) {
  try {
    const bank = Math.max(0, Math.floor(Number(db.prepare("SELECT bank FROM clans WHERE id = ?").get(String(clanId))?.bank) || 0));
    if (!(bank > 0) || !userId) return 0;
    const paid = adjustCredits(String(userId), bank);
    if (!paid.ok) return 0;
    db.prepare("UPDATE clans SET bank = 0 WHERE id = ?").run(String(clanId));
    return bank;
  } catch { return 0; }
}

// Classement public : points de grade cumulés des membres (puis honneur).
let clanRankingCache = { at: 0, list: [] };
export function listClanRanking() {
  try {
    initAccountDb();
    const now = Date.now();
    if (now - clanRankingCache.at < 30_000) return clanRankingCache.list;
    const byClan = new Map();
    const rows = db.prepare(`SELECT c.id AS clanId, c.name AS name, c.tag AS tag, c.created_at AS createdAt, u.data AS data, COALESCE(p.kills, 0) AS pvpKills
      FROM clans c JOIN clan_members m ON m.clan_id = c.id JOIN users u ON u.id = m.user_id LEFT JOIN pvp_stats p ON p.user_id = m.user_id`).all();
    for (const r of rows) {
      const id = String(r.clanId);
      let entry = byClan.get(id);
      if (!entry) {
        entry = { tag: String(r.tag || "").slice(0, CLAN_TAG_MAX), name: String(r.name || "Clan").slice(0, CLAN_NAME_MAX),
          createdAt: Number(r.createdAt) || 0, members: 0, rankPoints: 0, honor: 0, exp: 0, npcKills: 0, pvpKills: 0 };
        byClan.set(id, entry);
      }
      const st = clanStatsOfData(r.data);
      entry.members++;
      entry.rankPoints += st.rankPoints;
      entry.honor += Math.max(0, st.honor);
      entry.exp += st.exp;
      entry.npcKills += st.npcKills;
      entry.pvpKills += Math.max(0, Math.floor(Number(r.pvpKills) || 0));
    }
    const list = [...byClan.values()]
      .sort((a, b) => b.rankPoints - a.rankPoints || b.honor - a.honor || a.createdAt - b.createdAt)
      .slice(0, 100)
      .map((entry, index) => ({ position: index + 1, ...entry }));
    clanRankingCache = { at: now, list };
    return list;
  } catch { return []; }
}
function invalidateClanRanking() { clanRankingCache = { at: 0, list: [] }; }

// Liste publique de tous les clans : [{ id, name, tag, description,
// leader, memberCount }] triés par taille puis nom.
export function listClans() {
  try {
    initAccountDb();
    return db.prepare("SELECT c.id AS id, c.name AS name, c.tag AS tag, c.description AS description, c.open AS open, u.pseudo AS leader, (SELECT COUNT(*) FROM clan_members m WHERE m.clan_id = c.id) AS n FROM clans c LEFT JOIN users u ON u.id = c.leader_id ORDER BY n DESC, c.name COLLATE NOCASE LIMIT 200").all()
      .map((r) => ({
        id: String(r.id), name: String(r.name || "Clan").slice(0, CLAN_NAME_MAX), tag: String(r.tag || "").slice(0, CLAN_TAG_MAX),
        description: String(r.description || "").slice(0, 250),
        leader: String(r.leader || "Pilote").slice(0, 20), memberCount: Math.max(0, Number(r.n) || 0),
        open: Number(r.open ?? 1) !== 0,
      }));
  } catch { return []; }
}

// Candidatures envoyées par le joueur : [{ clanId, name, tag, at }].
export function getMyApplications(userId) {
  try {
    initAccountDb();
    return db.prepare("SELECT a.clan_id AS clanId, c.name AS name, c.tag AS tag, a.created_at AS at FROM clan_applications a JOIN clans c ON c.id = a.clan_id WHERE a.user_id = ? ORDER BY a.created_at").all(String(userId))
      .map((r) => ({ clanId: String(r.clanId), name: String(r.name || "Clan").slice(0, CLAN_NAME_MAX), tag: String(r.tag || "").slice(0, CLAN_TAG_MAX), at: Number(r.at) || 0 }));
  } catch { return []; }
}

// Info publique d'un clan par tag : { name, tag, leader, memberCount, members: [pseudo] }.
export function getClanInfo(tag) {
  try {
    initAccountDb();
    const row = db.prepare("SELECT * FROM clans WHERE tag_norm = ?").get(clanTagKey(tag));
    if (!row) return null;
    const members = db.prepare("SELECT u.pseudo AS pseudo, m.role AS role FROM clan_members m JOIN users u ON u.id = m.user_id WHERE m.clan_id = ? ORDER BY CASE m.role WHEN 'leader' THEN 0 WHEN 'officer' THEN 1 ELSE 2 END, m.joined_at").all(String(row.id))
      .map((r) => ({ pseudo: String(r.pseudo || "Pilote").slice(0, 20), role: String(r.role || "member") }));
    let leaderPseudo = "?";
    try {
      const lr = db.prepare("SELECT pseudo FROM users WHERE id = ?").get(String(row.leader_id));
      if (lr) leaderPseudo = String(lr.pseudo || "Pilote").slice(0, 20);
    } catch {}
    return { id: String(row.id), name: String(row.name || "Clan").slice(0, CLAN_NAME_MAX), tag: String(row.tag || "").slice(0, CLAN_TAG_MAX), description: String(row.description || "").slice(0, 250), leader: leaderPseudo, memberCount: members.length, members };
  } catch { return null; }
}

export function createClan(userId, name, tag, description) {
  try {
    initAccountDb();
    const uid = String(userId || "");
    if (!uid) return { ok: false, error: "AUTH" };
    if (clanIdOfUser(uid)) return { ok: false, error: "ALREADY" };
    const cleanName = cleanClanName(name);
    const cleanTag = cleanClanTag(tag);
    if (!cleanName.trim()) return { ok: false, error: "NAME" };
    if (!cleanTag.trim()) return { ok: false, error: "TAG" };
    if (Array.from(cleanTag.trim()).length > CLAN_TAG_CREATE_MAX) return { ok: false, error: "TAG_LONG" };
    const cleanTagNorm = clanTagKey(cleanTag);
    const clash = db.prepare("SELECT 1 FROM clans WHERE tag_norm = ?").get(cleanTagNorm);
    if (clash) return { ok: false, error: "TAKEN" };
    // Frais de fondation façon DO : 300 000 crédits.
    const paid = adjustCredits(uid, -CLAN_CREATE_COST);
    if (!paid.ok) return { ok: false, error: "NOCASH" };
    const id = uuid();
    const now = Date.now();
    db.prepare("INSERT INTO clans (id, name, tag, tag_norm, leader_id, description, open, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?)").run(id, cleanName, cleanTag, cleanTagNorm, uid, cleanClanDesc(description), now);
    db.prepare("INSERT INTO clan_members (clan_id, user_id, role, joined_at) VALUES (?, ?, 'leader', ?)").run(id, uid, now);
    clanRanks(id);
    addClanLog(id, `Clan fondé par ${pseudoOf(uid)}.`);
    // Une création annule les candidatures envoyées en attente.
    try { db.prepare("DELETE FROM clan_applications WHERE user_id = ?").run(uid); } catch {}
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
  const leaverPseudo = pseudoOf(uid);
  db.prepare("DELETE FROM clan_members WHERE clan_id = ? AND user_id = ?").run(clanId, uid);
  try { db.prepare("DELETE FROM clan_applications WHERE user_id = ?").run(uid); } catch {}
  const rest = (() => {
    try { return db.prepare("SELECT user_id, role, joined_at FROM clan_members WHERE clan_id = ? ORDER BY joined_at").all(clanId); } catch { return []; }
  })();
  if (!rest.length) {
    refundClanBank(clanId, uid);
    try { db.prepare("DELETE FROM clan_bank_log WHERE clan_id = ?").run(clanId); } catch {}
    try { db.prepare("DELETE FROM clan_announcements WHERE clan_id = ?").run(clanId); } catch {}
    try { db.prepare("DELETE FROM clans WHERE id = ?").run(clanId); } catch {}
    try { db.prepare("DELETE FROM clan_applications WHERE clan_id = ?").run(clanId); } catch {}
    try { db.prepare("DELETE FROM clan_ranks WHERE clan_id = ?").run(clanId); } catch {}
    try { db.prepare("DELETE FROM clan_diplo WHERE from_clan = ? OR to_clan = ?").run(clanId, clanId); } catch {}
    try { db.prepare("DELETE FROM clan_log WHERE clan_id = ?").run(clanId); } catch {}
    return { dissolved: true, clanId, affected: [] };
  }
  addClanLog(clanId, `${leaverPseudo} a quitté le clan.`);
  try {
    const clan = db.prepare("SELECT leader_id FROM clans WHERE id = ?").get(clanId);
    if (clan && String(clan.leader_id) === String(uid)) {
      const successor = rest.find((m) => String(m.role) === "officer") || rest[0];
      const sid = String(successor.user_id);
      db.prepare("UPDATE clan_members SET role = 'leader' WHERE clan_id = ? AND user_id = ?").run(clanId, sid);
      db.prepare("UPDATE clans SET leader_id = ? WHERE id = ?").run(sid, clanId);
      addClanLog(clanId, `${pseudoOf(sid)} devient chef du clan.`);
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

// Candidature gratuite : c'est le joueur qui postule (plus d'invitations).
// Recrutement fermé = refus.
// Erreurs : AUTH, INCLAN (déjà en clan), NONE (clan inconnu),
// CLOSED, APPLIED (déjà postulée), FULL (clan plein).
export function applyToClan(userId, tag) {
  try {
    initAccountDb();
    const uid = String(userId || "");
    if (!uid) return { ok: false, error: "AUTH" };
    if (clanIdOfUser(uid)) return { ok: false, error: "INCLAN" };
    const clan = db.prepare("SELECT * FROM clans WHERE tag_norm = ?").get(clanTagKey(tag));
    if (!clan) return { ok: false, error: "NONE" };
    if (Number(clan.open ?? 1) === 0) return { ok: false, error: "CLOSED" };
    const count = (() => {
      try { return Number(db.prepare("SELECT COUNT(*) AS n FROM clan_members WHERE clan_id = ?").get(String(clan.id))?.n) || 0; } catch { return 0; }
    })();
    if (count >= CLAN_MAX_MEMBERS) return { ok: false, error: "FULL" };
    const dup = (() => {
      try { return !!db.prepare("SELECT 1 FROM clan_applications WHERE clan_id = ? AND user_id = ?").get(String(clan.id), uid); } catch { return false; }
    })();
    if (dup) return { ok: false, error: "APPLIED" };
    db.prepare("INSERT INTO clan_applications (clan_id, user_id, created_at) VALUES (?, ?, ?)").run(String(clan.id), uid, Date.now());
    return { ok: true, clan: { id: String(clan.id), name: String(clan.name || "Clan").slice(0, CLAN_NAME_MAX), tag: String(clan.tag || "").slice(0, CLAN_TAG_MAX) } };
  } catch { return { ok: false, error: "SERVER" }; }
}

// Retrait d'une candidature par le candidat lui-même.
export function cancelApplication(userId, tag) {
  try {
    initAccountDb();
    const uid = String(userId || "");
    if (!uid) return { ok: false };
    const clan = db.prepare("SELECT id FROM clans WHERE tag_norm = ?").get(clanTagKey(tag));
    if (!clan) {
      try { db.prepare("DELETE FROM clan_applications WHERE user_id = ?").run(uid); } catch {}
      return { ok: true };
    }
    db.prepare("DELETE FROM clan_applications WHERE clan_id = ? AND user_id = ?").run(String(clan.id), uid);
    return { ok: true };
  } catch { return { ok: false }; }
}

// Accepter une candidature (droit candidatures) : le postulant rejoint,
// ses autres candidatures sont purgées.
export function acceptClanApplication(actorId, pseudo) {
  try {
    initAccountDb();
    const uid = String(actorId || "");
    const clanId = clanIdOfUser(uid);
    if (!clanId) return { ok: false, error: "NOCLAN" };
    if (!clanRightsOf(uid, clanId).apps) return { ok: false, error: "RIGHTS" };
    const target = findUserByPseudo(pseudo);
    if (!target) return { ok: false, error: "NOT_FOUND" };
    if (clanIdOfUser(target.id)) {
      try { db.prepare("DELETE FROM clan_applications WHERE clan_id = ? AND user_id = ?").run(clanId, target.id); } catch {}
      return { ok: false, error: "INCLAN" };
    }
    const app = (() => {
      try { return db.prepare("SELECT 1 FROM clan_applications WHERE clan_id = ? AND user_id = ?").get(clanId, target.id); } catch { return null; }
    })();
    if (!app) return { ok: false, error: "NONE" };
    const count = (() => {
      try { return Number(db.prepare("SELECT COUNT(*) AS n FROM clan_members WHERE clan_id = ?").get(clanId)?.n) || 0; } catch { return 0; }
    })();
    if (count >= CLAN_MAX_MEMBERS) return { ok: false, error: "FULL" };
    db.prepare("INSERT INTO clan_members (clan_id, user_id, role, joined_at) VALUES (?, ?, 'member', ?)").run(clanId, target.id, Date.now());
    try { db.prepare("DELETE FROM clan_applications WHERE user_id = ?").run(target.id); } catch {}
    addClanLog(clanId, `${target.pseudo} a rejoint le clan.`);
    return { ok: true, member: target, clanId };
  } catch { return { ok: false, error: "SERVER" }; }
}

// Refuser une candidature (droit candidatures).
export function declineClanApplication(actorId, pseudo) {
  try {
    initAccountDb();
    const uid = String(actorId || "");
    const clanId = clanIdOfUser(uid);
    if (!clanId) return { ok: false, error: "NOCLAN" };
    if (!clanRightsOf(uid, clanId).apps) return { ok: false, error: "RIGHTS" };
    const target = findUserByPseudo(pseudo);
    if (!target) return { ok: false, error: "NOT_FOUND" };
    db.prepare("DELETE FROM clan_applications WHERE clan_id = ? AND user_id = ?").run(clanId, target.id);
    return { ok: true, member: target, clanId };
  } catch { return { ok: false, error: "SERVER" }; }
}

export function kickClanMember(actorId, pseudo) {
  try {
    initAccountDb();
    const uid = String(actorId || "");
    const clanId = clanIdOfUser(uid);
    if (!clanId) return { ok: false, error: "NOCLAN" };
    const rights = clanRightsOf(uid, clanId);
    if (!rights.kick) return { ok: false, error: "RIGHTS" };
    const target = findUserByPseudo(pseudo);
    if (!target) return { ok: false, error: "NOT_FOUND" };
    if (target.id === uid) return { ok: false, error: "SELF" };
    const targetRole = clanRoleOf(target.id, clanId);
    if (!targetRole) return { ok: false, error: "NOMEMBER" };
    if (targetRole === "leader" || target.id === String(db.prepare("SELECT leader_id FROM clans WHERE id = ?").get(clanId)?.leader_id || "")) {
      return { ok: false, error: "RIGHTS" };
    }
    // Non-chef : seulement les simples membres (rang Membre de base).
    if (!rights.isLeader && targetRole !== "member") return { ok: false, error: "RIGHTS" };
    db.prepare("DELETE FROM clan_members WHERE clan_id = ? AND user_id = ?").run(clanId, target.id);
    addClanLog(clanId, `${target.pseudo} a été exclu du clan.`);
    return { ok: true, kicked: target, clanId };
  } catch { return { ok: false, error: "SERVER" }; }
}

// Attribution d'un rang (chef uniquement, jamais Chef : voir transfert).
export function assignClanRank(actorId, pseudo, rankName) {
  try {
    initAccountDb();
    const uid = String(actorId || "");
    const clanId = clanIdOfUser(uid);
    if (!clanId) return { ok: false, error: "NOCLAN" };
    if (!isClanLeader(uid, clanId)) return { ok: false, error: "RIGHTS" };
    const target = findUserByPseudo(pseudo);
    if (!target) return { ok: false, error: "NOT_FOUND" };
    if (target.id === uid) return { ok: false, error: "SELF" };
    if (!clanRoleOf(target.id, clanId)) return { ok: false, error: "NOMEMBER" };
    const clean = cleanRankName(rankName);
    const rank = clanRanks(clanId).find((x) => x.name.toLowerCase() === clean.toLowerCase());
    if (!rank) return { ok: false, error: "RANK" };
    if (rank.builtin === "leader") return { ok: false, error: "RIGHTS" };
    db.prepare("UPDATE clan_members SET role = ? WHERE clan_id = ? AND user_id = ?").run(rank.name, clanId, target.id);
    addClanLog(clanId, `${target.pseudo} devient ${rank.name}.`);
    return { ok: true, member: target, clanId, rank: rank.name };
  } catch { return { ok: false, error: "SERVER" }; }
}

// Gestion des rangs (chef uniquement) : create | rename | delete | rights.
export function manageClanRank(actorId, action, name, newName, rights) {
  try {
    initAccountDb();
    const uid = String(actorId || "");
    const clanId = clanIdOfUser(uid);
    if (!clanId) return { ok: false, error: "NOCLAN" };
    if (!isClanLeader(uid, clanId)) return { ok: false, error: "RIGHTS" };
    const clean = cleanRankName(name);
    if (!CLAN_RANK_NAME_RE.test(clean)) return { ok: false, error: "NAME" };
    const ranks = clanRanks(clanId);
    const rank = ranks.find((x) => x.name.toLowerCase() === clean.toLowerCase());
    if (action === "create") {
      if (rank) return { ok: false, error: "TAKEN" };
      if (["chef", "officier", "membre", "leader", "officer", "member"].includes(clean.toLowerCase())) return { ok: false, error: "RESERVED" };
      db.prepare("INSERT INTO clan_ranks (clan_id, id, name, rights, builtin, created_at) VALUES (?, ?, ?, 0, '', ?)").run(clanId, `r_${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`, clean, Date.now());
      addClanLog(clanId, `Rang ${clean} créé.`);
      return { ok: true, clanId };
    }
    if (!rank) return { ok: false, error: "RANK" };
    if (rank.builtin === "leader") return { ok: false, error: "RIGHTS" };
    if (action === "rights") {
      const bits = Math.max(0, Math.min(CLAN_RIGHTS_ALL, Math.floor(Number(rights) || 0)));
      db.prepare("UPDATE clan_ranks SET rights = ? WHERE clan_id = ? AND name = ?").run(bits, clanId, rank.name);
      return { ok: true, clanId };
    }
    if (action === "rename") {
      const next = cleanRankName(newName);
      if (!CLAN_RANK_NAME_RE.test(next)) return { ok: false, error: "NAME" };
      if (ranks.some((x) => x.name.toLowerCase() === next.toLowerCase())) return { ok: false, error: "TAKEN" };
      if (rank.builtin !== "" && ["chef", "officier", "membre"].includes(next.toLowerCase())) return { ok: false, error: "RESERVED" };
      db.prepare("UPDATE clan_ranks SET name = ? WHERE clan_id = ? AND name = ?").run(next, clanId, rank.name);
      db.prepare("UPDATE clan_members SET role = ? WHERE clan_id = ? AND role = ?").run(next, clanId, rank.name);
      return { ok: true, clanId };
    }
    if (action === "delete") {
      if (rank.builtin !== "") return { ok: false, error: "RIGHTS" };
      db.prepare("DELETE FROM clan_ranks WHERE clan_id = ? AND name = ?").run(clanId, rank.name);
      db.prepare("UPDATE clan_members SET role = 'member' WHERE clan_id = ? AND role = ?").run(clanId, rank.name);
      addClanLog(clanId, `Rang ${rank.name} supprimé.`);
      return { ok: true, clanId };
    }
    return { ok: false, error: "ACTION" };
  } catch { return { ok: false, error: "SERVER" }; }
}

export function setClanDescription(userId, description) {
  try {
    initAccountDb();
    const uid = String(userId || "");
    const clanId = clanIdOfUser(uid);
    if (!clanId) return { ok: false, error: "NOCLAN" };
    if (!clanRightsOf(uid, clanId).edit) return { ok: false, error: "RIGHTS" };
    db.prepare("UPDATE clans SET description = ? WHERE id = ?").run(cleanClanDesc(description), clanId);
    return { ok: true, clanId };
  } catch { return { ok: false, error: "SERVER" }; }
}

// Recrutement ouvert / fermé (droit édition) : fermé = plus de candidatures.
export function setClanOpen(userId, open) {
  try {
    initAccountDb();
    const uid = String(userId || "");
    const clanId = clanIdOfUser(uid);
    if (!clanId) return { ok: false, error: "NOCLAN" };
    if (!clanRightsOf(uid, clanId).edit) return { ok: false, error: "RIGHTS" };
    db.prepare("UPDATE clans SET open = ? WHERE id = ?").run(open === true ? 1 : 0, clanId);
    addClanLog(clanId, open === true ? "Recrutement ouvert." : "Recrutement fermé.");
    return { ok: true, clanId, open: open === true };
  } catch { return { ok: false, error: "SERVER" }; }
}

// Transfert de chefferie (chef uniquement).
export function transferClanLeadership(actorId, pseudo) {
  try {
    initAccountDb();
    const uid = String(actorId || "");
    const clanId = clanIdOfUser(uid);
    if (!clanId) return { ok: false, error: "NOCLAN" };
    if (!isClanLeader(uid, clanId)) return { ok: false, error: "RIGHTS" };
    const target = findUserByPseudo(pseudo);
    if (!target) return { ok: false, error: "NOT_FOUND" };
    if (target.id === uid) return { ok: false, error: "SELF" };
    if (!clanRoleOf(target.id, clanId)) return { ok: false, error: "NOMEMBER" };
    db.prepare("UPDATE clan_members SET role = 'member' WHERE clan_id = ? AND user_id = ?").run(clanId, uid);
    db.prepare("UPDATE clan_members SET role = 'leader' WHERE clan_id = ? AND user_id = ?").run(clanId, target.id);
    db.prepare("UPDATE clans SET leader_id = ? WHERE id = ?").run(target.id, clanId);
    addClanLog(clanId, `${target.pseudo} devient chef du clan.`);
    return { ok: true, member: target, clanId };
  } catch { return { ok: false, error: "SERVER" }; }
}

// Dissolution par le chef (même avec des membres).
export function dissolveClan(actorId) {
  try {
    initAccountDb();
    const uid = String(actorId || "");
    const clanId = clanIdOfUser(uid);
    if (!clanId) return { ok: false, error: "NOCLAN" };
    if (!isClanLeader(uid, clanId)) return { ok: false, error: "RIGHTS" };
    let affected = [];
    try { affected = db.prepare("SELECT user_id FROM clan_members WHERE clan_id = ? AND user_id != ?").all(clanId, uid).map((r) => String(r.user_id)); } catch {}
    const refunded = refundClanBank(clanId, uid);
    try { db.prepare("DELETE FROM clan_bank_log WHERE clan_id = ?").run(clanId); } catch {}
    try { db.prepare("DELETE FROM clan_announcements WHERE clan_id = ?").run(clanId); } catch {}
    try { db.prepare("DELETE FROM clan_members WHERE clan_id = ?").run(clanId); } catch {}
    try { db.prepare("DELETE FROM clan_applications WHERE clan_id = ?").run(clanId); } catch {}
    try { db.prepare("DELETE FROM clan_ranks WHERE clan_id = ?").run(clanId); } catch {}
    try { db.prepare("DELETE FROM clan_diplo WHERE from_clan = ? OR to_clan = ?").run(clanId, clanId); } catch {}
    try { db.prepare("DELETE FROM clan_log WHERE clan_id = ?").run(clanId); } catch {}
    try { db.prepare("DELETE FROM clans WHERE id = ?").run(clanId); } catch {}
    invalidateClanRanking();
    return { ok: true, clanId, affected, refunded };
  } catch { return { ok: false, error: "SERVER" }; }
}

// --- Diplomatie façon DO : alliance / NAP (proposition + acceptation),
// guerre (déclaration unilatérale immédiate, 100 jours max, score de
// kills). Fin de guerre sur demande acceptée ou expiration.
const DIPLO_KINDS = new Set(["alliance", "nap", "war"]);
export const DIPLO_LABEL = Object.freeze({ alliance: "Alliance", nap: "NAP", war: "Guerre" });

function purgeExpiredWars() {
  try { db.prepare("DELETE FROM clan_diplo WHERE kind = 'war' AND status = 'active' AND ends_at IS NOT NULL AND ends_at <= ?").run(Date.now()); } catch {}
}

function clanTagById(clanId) {
  try {
    const row = db.prepare("SELECT tag FROM clans WHERE id = ?").get(String(clanId || ""));
    return row ? String(row.tag || "").slice(0, CLAN_TAG_MAX) : "?";
  } catch { return "?"; }
}

export function diploBetween(a, b) {
  try {
    initAccountDb();
    purgeExpiredWars();
    return db.prepare("SELECT * FROM clan_diplo WHERE (from_clan = ? AND to_clan = ?) OR (from_clan = ? AND to_clan = ?) ORDER BY created_at DESC").all(String(a), String(b), String(b), String(a));
  } catch { return []; }
}

// Relations d'un clan : { active: [...], incoming: [...], outgoing: [...] }.
// active: { id, kind, status, otherId, otherTag, otherName, otherMembers,
//   killsMine, killsTheirs, endsAt, daysLeft, mine (suis-je l'initiateur) }.
export function getClanRelations(userId) {
  try {
    initAccountDb();
    const clanId = clanIdOfUser(String(userId || ""));
    if (!clanId) return { ok: false, error: "NOCLAN" };
    purgeExpiredWars();
    const rows = db.prepare("SELECT * FROM clan_diplo WHERE from_clan = ? OR to_clan = ? ORDER BY created_at DESC LIMIT 100").all(clanId, clanId);
    const info = new Map();
    const describe = (cid) => {
      if (info.has(cid)) return info.get(cid);
      let d = { tag: "?", name: "Clan", members: 0 };
      try {
        const c = db.prepare("SELECT tag, name FROM clans WHERE id = ?").get(cid);
        const n = db.prepare("SELECT COUNT(*) AS n FROM clan_members WHERE clan_id = ?").get(cid)?.n;
        if (c) d = { tag: String(c.tag || "?").slice(0, CLAN_TAG_MAX), name: String(c.name || "Clan").slice(0, CLAN_NAME_MAX), members: Math.max(0, Number(n) || 0) };
      } catch {}
      info.set(cid, d);
      return d;
    };
    const active = [], incoming = [], outgoing = [];
    for (const r of rows) {
      const mine = String(r.from_clan) === String(clanId);
      const otherId = mine ? String(r.to_clan) : String(r.from_clan);
      const other = describe(otherId);
      const killsMine = mine ? Number(r.kills_from) || 0 : Number(r.kills_to) || 0;
      const killsTheirs = mine ? Number(r.kills_to) || 0 : Number(r.kills_from) || 0;
      const entry = {
        id: String(r.id), kind: String(r.kind), status: String(r.status),
        otherId, otherTag: other.tag, otherName: other.name, otherMembers: other.members,
        killsMine, killsTheirs, mine,
        endsAt: r.ends_at != null ? Number(r.ends_at) : null,
        daysLeft: r.ends_at != null ? Math.max(0, Math.ceil((Number(r.ends_at) - Date.now()) / 86400_000)) : null,
      };
      if (String(r.status) === "active") active.push(entry);
      else if (mine) outgoing.push(entry);
      else incoming.push(entry);
    }
    return { ok: true, active, incoming, outgoing };
  } catch { return { ok: false, error: "SERVER" }; }
}

// Proposer alliance/NAP (pending) ou déclarer la guerre (active aussitôt).
export function proposeDiplo(actorId, tag, kind) {
  try {
    initAccountDb();
    const k = String(kind || "").toLowerCase();
    if (!DIPLO_KINDS.has(k)) return { ok: false, error: "KIND" };
    const uid = String(actorId || "");
    const clanId = clanIdOfUser(uid);
    if (!clanId) return { ok: false, error: "NOCLAN" };
    if (!clanRightsOf(uid, clanId).diplo) return { ok: false, error: "RIGHTS" };
    const target = db.prepare("SELECT * FROM clans WHERE tag_norm = ?").get(clanTagKey(tag));
    if (!target) return { ok: false, error: "NONE" };
    if (String(target.id) === String(clanId)) return { ok: false, error: "SELF" };
    if (diploBetween(clanId, String(target.id)).length) return { ok: false, error: "EXISTS" };
    const now = Date.now();
    const id = uuid();
    const myTag = clanTagById(clanId), theirTag = String(target.tag || "").slice(0, CLAN_TAG_MAX);
    if (k === "war") {
      db.prepare("INSERT INTO clan_diplo (id, from_clan, to_clan, kind, status, kills_from, kills_to, created_at, ends_at) VALUES (?, ?, ?, 'war', 'active', 0, 0, ?, ?)").run(id, clanId, String(target.id), now, now + CLAN_WAR_MAX_MS);
      addClanLog(clanId, `Guerre déclarée à [${theirTag}].`);
      addClanLog(String(target.id), `[${myTag}] nous a déclaré la guerre.`);
      return { ok: true, war: true, rel: { id, kind: "war", otherTag: theirTag } };
    }
    db.prepare("INSERT INTO clan_diplo (id, from_clan, to_clan, kind, status, kills_from, kills_to, created_at, ends_at) VALUES (?, ?, ?, ?, 'pending', 0, 0, ?, NULL)").run(id, clanId, String(target.id), k, now);
    addClanLog(clanId, `${DIPLO_LABEL[k]} proposée à [${theirTag}].`);
    return { ok: true, rel: { id, kind: k, otherTag: theirTag } };
  } catch { return { ok: false, error: "SERVER" }; }
}

// Répondre à une proposition reçue (ou à une demande de fin de guerre).
export function respondDiplo(actorId, relId, accept) {
  try {
    initAccountDb();
    const uid = String(actorId || "");
    const clanId = clanIdOfUser(uid);
    if (!clanId) return { ok: false, error: "NOCLAN" };
    if (!clanRightsOf(uid, clanId).diplo) return { ok: false, error: "RIGHTS" };
    const rel = db.prepare("SELECT * FROM clan_diplo WHERE id = ?").get(String(relId || ""));
    if (!rel || String(rel.status) !== "pending" || String(rel.to_clan) !== String(clanId)) return { ok: false, error: "NONE" };
    const otherId = String(rel.from_clan);
    const myTag = clanTagById(clanId), theirTag = clanTagById(otherId);
    if (accept !== true) {
      db.prepare("DELETE FROM clan_diplo WHERE id = ?").run(String(rel.id));
      addClanLog(clanId, `${DIPLO_LABEL[String(rel.kind)] || "Proposition"} de [${theirTag}] refusée.`);
      return { ok: true, declined: true };
    }
    if (String(rel.kind) === "war") {
      // Demande de fin de guerre acceptée : la guerre se termine.
      db.prepare("DELETE FROM clan_diplo WHERE kind = 'war' AND ((from_clan = ? AND to_clan = ?) OR (from_clan = ? AND to_clan = ?))").run(clanId, otherId, otherId, clanId);
      addClanLog(clanId, `Guerre contre [${theirTag}] terminée.`);
      addClanLog(otherId, `Guerre contre [${myTag}] terminée.`);
      return { ok: true, ended: true };
    }
    db.prepare("UPDATE clan_diplo SET status = 'active' WHERE id = ?").run(String(rel.id));
    addClanLog(clanId, `${DIPLO_LABEL[String(rel.kind)]} conclue avec [${theirTag}].`);
    addClanLog(otherId, `${DIPLO_LABEL[String(rel.kind)]} conclue avec [${myTag}].`);
    return { ok: true };
  } catch { return { ok: false, error: "SERVER" }; }
}

// Rompre alliance/NAP aussitôt ; guerre : DEMANDE de paix uniquement.
// Cliquer "Paix" ne termine JAMAIS la guerre : ça crée une demande
// (pending) que l'autre clan doit accepter via respondDiplo. Même si les
// deux clans demandent, la guerre continue jusqu'à acceptation explicite.
export function endDiplo(actorId, relId) {
  try {
    initAccountDb();
    const uid = String(actorId || "");
    const clanId = clanIdOfUser(uid);
    if (!clanId) return { ok: false, error: "NOCLAN" };
    if (!clanRightsOf(uid, clanId).diplo) return { ok: false, error: "RIGHTS" };
    const rel = db.prepare("SELECT * FROM clan_diplo WHERE id = ?").get(String(relId || ""));
    if (!rel) return { ok: false, error: "NONE" };
    const mine = String(rel.from_clan) === String(clanId) || String(rel.to_clan) === String(clanId);
    if (!mine) return { ok: false, error: "NONE" };
    const otherId = String(rel.from_clan) === String(clanId) ? String(rel.to_clan) : String(rel.from_clan);
    const myTag = clanTagById(clanId), theirTag = clanTagById(otherId);
    if (String(rel.kind) !== "war") {
      if (String(rel.status) !== "active") {
        db.prepare("DELETE FROM clan_diplo WHERE id = ?").run(String(rel.id));
        return { ok: true, retracted: true };
      }
      db.prepare("DELETE FROM clan_diplo WHERE id = ?").run(String(rel.id));
      addClanLog(clanId, `${DIPLO_LABEL[String(rel.kind)]} avec [${theirTag}] rompue.`);
      addClanLog(otherId, `${DIPLO_LABEL[String(rel.kind)]} avec [${myTag}] rompue.`);
      return { ok: true, ended: true };
    }
    if (String(rel.status) !== "active") {
      // Retrait de ma propre demande de fin de guerre en attente.
      if (String(rel.kind) === "war" && String(rel.status) === "pending" && String(rel.from_clan) === String(clanId)) {
        db.prepare("DELETE FROM clan_diplo WHERE id = ?").run(String(rel.id));
        return { ok: true, retracted: true };
      }
      return { ok: false, error: "NONE" };
    }
    // Ne JAMAIS terminer la guerre ici : même si l'autre clan a déjà
    // demandé la paix, il faut passer par Accepter (respondDiplo).
    const myReq = db.prepare("SELECT id FROM clan_diplo WHERE kind = 'war' AND status = 'pending' AND from_clan = ? AND to_clan = ?").get(clanId, otherId);
    if (myReq) return { ok: true, requested: true };
    db.prepare("INSERT INTO clan_diplo (id, from_clan, to_clan, kind, status, kills_from, kills_to, created_at, ends_at) VALUES (?, ?, ?, 'war', 'pending', 0, 0, ?, NULL)").run(uuid(), clanId, otherId, Date.now());
    addClanLog(clanId, `Fin de guerre proposée à [${theirTag}].`);
    return { ok: true, requested: true };
  } catch { return { ok: false, error: "SERVER" }; }
}

// Score de guerre : +1 kill au camp du tueur (PvP, appelé par MULTI_SERVER).
export function recordClanWarKill(attUid, vicUid) {
  try {
    initAccountDb();
    const a = clanIdOfUser(String(attUid || ""));
    const b = clanIdOfUser(String(vicUid || ""));
    if (!a || !b || a === b) return null;
    purgeExpiredWars();
    const war = db.prepare("SELECT * FROM clan_diplo WHERE kind = 'war' AND status = 'active' AND ((from_clan = ? AND to_clan = ?) OR (from_clan = ? AND to_clan = ?))").get(a, b, b, a);
    if (!war) return null;
    if (String(war.from_clan) === String(a)) db.prepare("UPDATE clan_diplo SET kills_from = kills_from + 1 WHERE id = ?").run(String(war.id));
    else db.prepare("UPDATE clan_diplo SET kills_to = kills_to + 1 WHERE id = ?").run(String(war.id));
    return { ok: true };
  } catch { return null; }
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
export function getAccountGameplayData(accountId, previous = null) {
  initAccountDb();
  // Le poll WS reste a une seconde. Une revision inchangee ne justifie pas
  // de relire et parser le JSON complet de l'inventaire a chaque passage.
  if (previous && String(previous.id) === String(accountId)) {
    const current = db.prepare("SELECT revision FROM users WHERE id = ?").get(String(accountId));
    if (!current) return null;
    if (Number(current.revision) === Number(previous.revision)) return previous;
  }
  const row = db.prepare("SELECT data, faction, revision FROM users WHERE id = ?").get(String(accountId));
  if (!row) return null;
  try {
    const data = JSON.parse(row.data || "{}");
    if (!Array.isArray(data.hangars) || !data.hangars.length) {
      data.hangars = [{ id: "starter", shipId: "PhoenixBleu", active: true, activeConfig: 1,
        fit: { lasers: [], gens: [], extras: [], shipMods: [] } }];
    }
    return { ...data, faction: row.faction, revision: row.revision };
  } catch { return null; }
}

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
    if (res.writableEnded) return;
    // Meme contrat qu'avant : toute exception (parse OU onDone) -> 400.
    const parse = (buf) => {
      try {
        onDone(JSON.parse(buf.toString("utf8") || "{}"));
      } catch {
        try { json(res, 400, { ok: false, error: "JSON invalide." }); } catch {}
      }
    };
    // Sauvegardes compressees par le client (CompressionStream) : ~10x moins
    // d'octets. Decompression asynchrone (pool libuv), bornee comme le corps.
    if (String(req.headers["content-encoding"] || "").toLowerCase() === "gzip") {
      gunzip(Buffer.concat(chunks), { maxOutputLength: BODY_LIMIT }, (err, buf) => {
        if (err) return json(res, err.code === "ERR_BUFFER_TOO_LARGE" ? 413 : 400, { ok: false, error: "JSON invalide." });
        parse(buf);
      });
      return;
    }
    parse(Buffer.concat(chunks));
  });
}

// POST /api/register { pseudo, email, password, faction, migrate? }
async function handleRegister(body, res) {
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
    if (!await verifyPassword(migrate.password, password)) {
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
  data.password = await hashPassword(password);
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
  const publicUser = rowToPublic({ id, pseudo, email, faction, data: JSON.stringify(data) });
  // Les domaines .test sont réservés aux tests automatisés locaux. En
  // production, aucun compte réel ne reçoit de session avant confirmation.
  if (testEmailBypass(email)) {
    db.prepare("UPDATE users SET email_verified_at = ? WHERE id = ?").run(now, id);
    const token = newSession(id);
    return json(res, 200, { ok: true, token, user: publicUser, testEmailBypass: true });
  }
  if (!emailServiceReady()) {
    db.prepare("DELETE FROM users WHERE id = ?").run(id);
    return json(res, 503, { ok: false, error: "Le service email n'est pas configuré. Inscription temporairement indisponible." });
  }
  const verification = issueAccountToken(id, "verify", VERIFY_TTL_MS);
  try {
    await sendVerificationEmail({ id, pseudo, email }, verification);
  } catch {
    db.prepare("DELETE FROM account_auth_tokens WHERE user_id = ?").run(id);
    db.prepare("DELETE FROM users WHERE id = ?").run(id);
    return json(res, 503, { ok: false, error: "L'email de confirmation n'a pas pu être envoyé. Réessaie plus tard." });
  }
  return json(res, 202, { ok: true, pendingVerification: true, message: "Compte créé. Consulte ta boîte email pour confirmer ton inscription." });
}

// POST /api/login { pseudoOrEmail, password }
async function handleLogin(body, res) {
  const key = norm(body?.pseudoOrEmail);
  const pass = String(body?.password || "");
  if (!key || !pass) return json(res, 400, { ok: false, error: "Champs manquants." });
  const u = db.prepare("SELECT * FROM users WHERE pseudo_norm = ? OR email = ?").get(key, key);
  if (!u || !await verifyPassword(u.password_hash, pass)) return json(res, 401, { ok: false, error: "Identifiants incorrects." });
  if (!(Number(u.email_verified_at) > 0)) return json(res, 403, { ok: false, code: "EMAIL_UNVERIFIED", error: "Confirme ton inscription avec le lien reçu par email avant de te connecter." });
  // Migration clair -> hash.
  if (!String(u.password_hash || "").startsWith("v2$")) {
    const h = await hashPassword(pass);
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

async function handleVerifyEmail(body, res) {
  const row = consumeAccountToken(String(body?.token || ""), "verify");
  if (!row) return json(res, 400, { ok: false, error: "Lien de confirmation invalide ou expiré." });
  const now = Date.now();
  db.prepare("UPDATE users SET email_verified_at = ?, updated_at = ? WHERE id = ?").run(now, now, row.user_id);
  return json(res, 200, { ok: true, message: "Adresse confirmée. Tu peux maintenant te connecter." });
}

async function handleForgotUsername(body, res) {
  const email = norm(body?.email);
  const generic = { ok: true, message: "Si cette adresse correspond à un compte, son nom d'utilisateur vient d'être envoyé." };
  if (!EMAIL_RE.test(email)) return json(res, 200, generic);
  const user = db.prepare("SELECT id, pseudo, email, email_verified_at FROM users WHERE email = ?").get(email);
  if (user && Number(user.email_verified_at) > 0 && emailServiceReady()) {
    try {
      await sendAccountEmail({ to: user.email, subject: "Ton nom d'utilisateur Hyperion Orbit",
        text: `Ton nom d'utilisateur est : ${user.pseudo}`,
        html: emailTemplate("Nom d'utilisateur retrouvé", `Ton nom d'utilisateur Hyperion Orbit est : <strong>${emailText(user.pseudo)}</strong>`, "Retour à la connexion", authLink()) });
    } catch {}
  }
  return json(res, 200, generic);
}

async function handleForgotPassword(body, res) {
  const email = norm(body?.email);
  const generic = { ok: true, message: "Si cette adresse correspond à un compte, un lien de réinitialisation vient d'être envoyé." };
  if (!EMAIL_RE.test(email)) return json(res, 200, generic);
  const user = db.prepare("SELECT id, pseudo, email, email_verified_at FROM users WHERE email = ?").get(email);
  if (user && Number(user.email_verified_at) > 0 && emailServiceReady()) {
    const raw = issueAccountToken(user.id, "password", RESET_TTL_MS);
    const href = authLink({ reset: raw });
    try {
      await sendAccountEmail({ to: user.email, subject: "Réinitialise ton mot de passe Hyperion Orbit",
        text: `Réinitialise ton mot de passe avec ce lien valable une heure : ${href}`,
        html: emailTemplate("Réinitialisation du mot de passe", "Une demande de réinitialisation a été reçue. Ce lien expire dans une heure et ne fonctionne qu'une fois.", "Choisir un nouveau mot de passe", href) });
    } catch { try { db.prepare("DELETE FROM account_auth_tokens WHERE user_id = ? AND kind = 'password'").run(user.id); } catch {} }
  }
  return json(res, 200, generic);
}

async function handleResetPassword(body, res) {
  const raw = String(body?.token || "");
  const password = String(body?.password || "");
  if (password.length < 10) return json(res, 400, { ok: false, error: "Mot de passe trop court (10 caractères minimum)." });
  const row = consumeAccountToken(raw, "password");
  if (!row) return json(res, 400, { ok: false, error: "Lien de réinitialisation invalide ou expiré." });
  const hash = await hashPassword(password);
  const user = db.prepare("SELECT data FROM users WHERE id = ?").get(row.user_id);
  if (!user) return json(res, 400, { ok: false, error: "Compte introuvable." });
  let data = {};
  try { data = JSON.parse(user.data || "{}") || {}; } catch {}
  data.password = hash;
  data.updatedAt = Date.now();
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare("UPDATE users SET password_hash = ?, data = ?, updated_at = ? WHERE id = ?").run(hash, JSON.stringify(data), data.updatedAt, row.user_id);
    db.prepare("DELETE FROM sessions WHERE user_id = ?").run(row.user_id);
    db.prepare("DELETE FROM account_auth_tokens WHERE user_id = ?").run(row.user_id);
    db.exec("COMMIT");
  } catch (error) { try { db.exec("ROLLBACK"); } catch {} throw error; }
  return json(res, 200, { ok: true, message: "Mot de passe réinitialisé. Tu peux maintenant te connecter." });
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

// Admin : liste des designs de drones pour le panneau (select give design).
// Retourne [{ id, name }] trié par nom. Id = itemId d'inventaire
// ("drone_design_havoc", ...) directement équipable.
export function adminDroneDesigns() {
  try {
    return Object.values(DRONE_DESIGNS)
      .map((d) => ({ id: String(d.itemId), name: String(d.name) }))
      .sort((a, b) => a.name.localeCompare(b.name, "fr"));
  } catch { return []; }
}

// Admin : donne un design de drone à un compte (panneau
// /api/admin/give-drone-design). Ajoute `count` exemplaires au stock
// d'inventaire (équipables ensuite sur les drones). 1 à 99 par opération.
export function adminGiveDroneDesign(pseudo, designId, count = 1) {
  try {
    initAccountDb();
    const key = norm(pseudo);
    if (!key) return { ok: false, error: "Pseudo manquant." };
    const row = db.prepare("SELECT * FROM users WHERE pseudo_norm = ?").get(key);
    if (!row) return { ok: false, error: "Compte introuvable." };
    const design = getDroneDesign(designId);
    if (!design) return { ok: false, error: "Design inconnu." };
    const n = Math.floor(Number(String(count ?? "").replace(/[\s_]/g, "")) || 0);
    if (!Number.isFinite(n) || n < 1 || n > 99) return { ok: false, error: "Quantité invalide (1 à 99)." };
    let data = {};
    try { data = JSON.parse(row.data || "{}") || {}; } catch { data = {}; }
    data.inventory ||= {};
    data.inventory.counts ||= {};
    const before = Math.max(0, Math.floor(Number(data.inventory.counts[design.itemId]) || 0));
    const after = before + n;
    const now = Date.now();
    const newRev = Math.max(Math.floor(Number(data.revision) || 0), Number(row.revision) || 0) + 1;
    data.inventory.counts[design.itemId] = after;
    data._adminWriteToken = randomBytes(12).toString("hex");
    data.revision = newRev;
    data.updatedAt = now;
    db.prepare("UPDATE users SET data = ?, revision = ?, updated_at = ? WHERE id = ?")
      .run(JSON.stringify(data), newRev, now, row.id);
    return { ok: true, id: String(row.id), pseudo: String(row.pseudo || "Pilote").slice(0, 20), design: design.itemId, name: design.name, before, after, given: n, revision: newRev };
  } catch { return { ok: false, error: "Erreur serveur." }; }
}

// Admin : liste des familles de vaisseaux pour le panneau (select give module).
// Retourne [{ id, name }] trié par nom, ids en minuscules (base de famille).
export function adminShipFamilies() {
  try {
    return getShipFamilyIds()
      .map((id) => ({ id: String(id), name: String(getShipFamilyName(id) || id) }))
      .sort((a, b) => a.name.localeCompare(b.name, "fr"));
  } catch { return []; }
}

// Admin : give un module roulette à un compte (panneau /api/admin/give-module).
// Crée UN module 1 stat : { shipId (famille), stat, pct }. Le % est la valeur
// brute stockée (le x1.5 Orcus / x2 Orcus Plus s'applique à l'équipement).
// pct entier, -8 (malus max x3) à 100. tier x3, rareté common (1 stat).
const ADMIN_MODULE_STATS = new Set([
  "hp", "shield", "damage", "speed", "penetration",
  "laser_hit", "rocket_hit", "evasion", "exp", "honor",
]);
const ADMIN_MODULE_TYPE_BY_STAT = { hp: "hp", shield: "shd", damage: "dmg" };
export function adminGiveModule(pseudo, shipId, stat, pct) {
  try {
    initAccountDb();
    const key = norm(pseudo);
    if (!key) return { ok: false, error: "Pseudo manquant." };
    const row = db.prepare("SELECT * FROM users WHERE pseudo_norm = ?").get(key);
    if (!row) return { ok: false, error: "Compte introuvable." };
    const family = getShipFamilyId(shipId);
    if (!family || !getShipPackById(family)) return { ok: false, error: "Vaisseau inconnu." };
    const statId = String(stat || "").toLowerCase();
    if (!ADMIN_MODULE_STATS.has(statId)) return { ok: false, error: "Stat inconnue." };
    const pctInt = Math.floor(Number(String(pct ?? "").replace(/[\s_]/g, "")) || 0);
    if (!Number.isFinite(pctInt) || pctInt === 0) return { ok: false, error: "Pourcentage invalide (entier non nul)." };
    if (pctInt < -8 || pctInt > 100) return { ok: false, error: "Pourcentage hors borne (-8 à 100)." };
    let data = {};
    try { data = JSON.parse(row.data || "{}") || {}; } catch { data = {}; }
    data.inventory ||= {};
    if (!Array.isArray(data.inventory.shipModules)) data.inventory.shipModules = [];
    const now = Math.floor(Date.now() / 1000);
    const type = ADMIN_MODULE_TYPE_BY_STAT[statId] || "spc";
    const mod = {
      id: `mod_admin_${now}_${randomBytes(3).toString("hex")}`,
      kind: "shipModule",
      shipId: String(family),
      familyId: String(family),
      tier: "x3",
      type,
      bonuses: [{ stat: statId, pct: pctInt }],
      rarity: "common",
      iconKey: `${type}-x3`,
      rerolls: 0,
      rerollCredits: 0,
      createdAt: now,
    };
    data.inventory.shipModules.push(mod);
    const newRev = Math.max(Math.floor(Number(data.revision) || 0), Number(row.revision) || 0) + 1;
    data._adminWriteToken = randomBytes(12).toString("hex");
    data.revision = newRev;
    data.updatedAt = Date.now();
    db.prepare("UPDATE users SET data = ?, revision = ?, updated_at = ? WHERE id = ?")
      .run(JSON.stringify(data), newRev, Date.now(), row.id);
    return { ok: true, id: String(row.id), pseudo: String(row.pseudo || "Pilote").slice(0, 20), module: mod, revision: newRev };
  } catch { return { ok: false, error: "Erreur serveur." }; }
}

// Mini-event dominical [ UFONIT ] : loterie module du top 10 dégâts.
// rarity "common" -> tier x1 / 1 stat, "rare" -> tier x2 / 2 stats (même
// barème que la boutique du passe). Tirage intra-module identique à
// generateShipModule (tables MODULE_DROPS). Aucune soute ni récompense.
const SUNDAY_MODULE_SPEC = Object.freeze({
  common: Object.freeze({ tier: "x1", statCount: 1 }),
  rare: Object.freeze({ tier: "x2", statCount: 2 }),
});
const SUNDAY_MODULE_TYPES = Object.freeze(["hp", "shd", "dmg", "spc"]);
function sundayRollPct(min, max) {
  let value = 0, guard = 0;
  while (value === MODULE_PCT_BAN && guard < 16) {
    value = Math.floor(Math.random() * (Math.floor(max) - Math.ceil(min) + 1)) + Math.ceil(min);
    guard++;
  }
  return value;
}
export function grantSundayModule(accountId, rarity) {
  try {
    initAccountDb();
    const uid = String(accountId || "");
    if (!uid) return { ok: false, error: "Compte manquant." };
    const spec = SUNDAY_MODULE_SPEC[rarity] || SUNDAY_MODULE_SPEC.common;
    const row = db.prepare("SELECT * FROM users WHERE id = ?").get(uid);
    if (!row) return { ok: false, error: "Compte introuvable." };
    let data = {};
    try { data = JSON.parse(row.data || "{}") || {}; } catch { data = {}; }
    const families = getShipFamilyIds().filter((f) => !/police/i.test(String(f || "")));
    const family = String(families.length ? families[Math.floor(Math.random() * families.length)] : "goliath");
    const type = SUNDAY_MODULE_TYPES[Math.floor(Math.random() * SUNDAY_MODULE_TYPES.length)];
    const mainStat = type === "hp" ? "hp" : type === "shd" ? "shield" : type === "dmg" ? MODULE_DMG_STATS[Math.floor(Math.random() * MODULE_DMG_STATS.length)]
      : MODULE_SPC_STATS[Math.floor(Math.random() * MODULE_SPC_STATS.length)];
    const mn = MODULE_TIER_MALUS[spec.tier] ?? -4;
    // UNE stat par famille, comme les tirages boutique (voir MODULE_GEN).
    const picked = new Set([mainStat]);
    const usedFamilies = new Set([MODULE_STAT_FAMILY[mainStat]]);
    const bonuses = [{ stat: mainStat, pct: sundayRollPct(mn, getStatMaxPct(mainStat, type)) }];
    const pool = MODULE_ALL_STATS.filter((s) => !picked.has(s) && !usedFamilies.has(MODULE_STAT_FAMILY[s]));
    while (bonuses.length < spec.statCount && pool.length) {
      const s = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
      picked.add(s);
      usedFamilies.add(MODULE_STAT_FAMILY[s]);
      for (let i = pool.length - 1; i >= 0; i--) {
        if (MODULE_STAT_FAMILY[pool[i]] === MODULE_STAT_FAMILY[s]) pool.splice(i, 1);
      }
      bonuses.push({ stat: s, pct: sundayRollPct(mn, getStatMaxPct(s, type)) });
    }
    const now = Math.floor(Date.now() / 1000);
    const mod = {
      id: `mod_sun_${now}_${randomBytes(3).toString("hex")}`,
      kind: "shipModule",
      shipId: family,
      familyId: family,
      tier: spec.tier,
      type,
      bonuses,
      rarity: getModuleRarity(bonuses.length),
      iconKey: `${type}-${spec.tier}`,
      rerolls: 0,
      rerollCredits: 0,
      createdAt: now,
    };
    data.inventory ||= {};
    if (!Array.isArray(data.inventory.shipModules)) data.inventory.shipModules = [];
    if (!Array.isArray(data.inventory.moduleRollHistory)) data.inventory.moduleRollHistory = [];
    data.inventory.shipModules.push(mod);
    data.inventory.moduleRollHistory.push({ ...mod, rollPayment: { type: "event", amount: 0 } });
    capServerHistory(data);
    const newRev = Math.max(Math.floor(Number(data.revision) || 0), Number(row.revision) || 0) + 1;
    data.revision = newRev;
    data.updatedAt = Date.now();
    db.prepare("UPDATE users SET data = ?, revision = ?, updated_at = ? WHERE id = ?")
      .run(JSON.stringify(data), newRev, Date.now(), row.id);
    return { ok: true, module: mod, revision: newRev };
  } catch { return { ok: false, error: "Erreur serveur." }; }
}

// Mini-event dominical [ UFONIT ] : tickets de relance module.
// Compteur inventaire ticket_module_reroll (même clé que la boutique).
export function grantSundayTickets(accountId, qty) {
  try {
    initAccountDb();
    const uid = String(accountId || "");
    const n = Math.max(0, Math.floor(Number(qty) || 0));
    if (!uid || !(n > 0)) return { ok: false, error: "Quantité invalide." };
    const row = db.prepare("SELECT * FROM users WHERE id = ?").get(uid);
    if (!row) return { ok: false, error: "Compte introuvable." };
    let data = {};
    try { data = JSON.parse(row.data || "{}") || {}; } catch { data = {}; }
    data.inventory ||= {};
    data.inventory.counts ||= {};
    data.inventory.counts.ticket_module_reroll =
      Math.max(0, Math.floor(Number(data.inventory.counts.ticket_module_reroll) || 0)) + n;
    const newRev = Math.max(Math.floor(Number(data.revision) || 0), Number(row.revision) || 0) + 1;
    data.revision = newRev;
    data.updatedAt = Date.now();
    db.prepare("UPDATE users SET data = ?, revision = ?, updated_at = ? WHERE id = ?")
      .run(JSON.stringify(data), newRev, Date.now(), row.id);
    return { ok: true, qty: n, revision: newRev };
  } catch { return { ok: false, error: "Erreur serveur." }; }
}

// Mini-event dominical [ UFONIT ] : munitions X4.
// Compteur compte X4 (même clé que le jeu).
export function grantSundayAmmo(accountId, qty) {
  try {
    initAccountDb();
    const uid = String(accountId || "");
    const n = Math.max(0, Math.floor(Number(qty) || 0));
    if (!uid || !(n > 0)) return { ok: false, error: "Quantité invalide." };
    const row = db.prepare("SELECT * FROM users WHERE id = ?").get(uid);
    if (!row) return { ok: false, error: "Compte introuvable." };
    let data = {};
    try { data = JSON.parse(row.data || "{}") || {}; } catch { data = {}; }
    data.ammo ||= {};
    data.ammo.x4 = Math.max(0, Math.floor(Number(data.ammo.x4) || 0)) + n;
    const newRev = Math.max(Math.floor(Number(data.revision) || 0), Number(row.revision) || 0) + 1;
    data.revision = newRev;
    data.updatedAt = Date.now();
    db.prepare("UPDATE users SET data = ?, revision = ?, updated_at = ? WHERE id = ?")
      .run(JSON.stringify(data), newRev, Date.now(), row.id);
    return { ok: true, qty: n, revision: newRev };
  } catch { return { ok: false, error: "Erreur serveur." }; }
}

// Admin : give un titre cadeau à un compte (panneau /api/admin/give-title).
// Texte libre (32 car. max) + couleur hexadécimale. Visible dans la fenêtre
// Titre du joueur (débloqué, sélectionnable, « Cadeau de l'admin ») et par
// tous sous son pseudo. Doublon de texte = couleur mise à jour, pas de doublon.
// Aucune limite de nombre.
export function adminGiveTitle(pseudo, name, color) {
  try {
    initAccountDb();
    const key = norm(pseudo);
    if (!key) return { ok: false, error: "Pseudo manquant." };
    const row = db.prepare("SELECT * FROM users WHERE pseudo_norm = ?").get(key);
    if (!row) return { ok: false, error: "Compte introuvable." };
    const cleanName = String(name || "").replace(/\s+/g, " ").trim();
    if (!cleanName) return { ok: false, error: "Texte vide." };
    const rawColor = String(color || "").trim();
    const cleanColor = /^#[0-9a-fA-F]{6}$/.test(rawColor) ? rawColor.toLowerCase() : "#ffffff";
    let data = {};
    try { data = JSON.parse(row.data || "{}") || {}; } catch { data = {}; }
    if (!data.titles || typeof data.titles !== "object" || Array.isArray(data.titles)) data.titles = {};
    if (!Array.isArray(data.titles.custom)) data.titles.custom = [];
    if (!Array.isArray(data.titles.unlocked)) data.titles.unlocked = [];
    const existing = data.titles.custom.find(c => String(c?.name || "").toLowerCase() === cleanName.toLowerCase());
    let entry;
    if (existing) {
      existing.color = cleanColor;
      entry = { id: String(existing.id), name: String(existing.name), color: cleanColor };
    } else {
      entry = { id: `admin_${randomBytes(4).toString("hex")}`, name: cleanName, color: cleanColor };
      data.titles.custom.push(entry);
    }
    if (!data.titles.unlocked.map(String).includes(entry.id)) data.titles.unlocked.push(entry.id);
    const newRev = Math.max(Math.floor(Number(data.revision) || 0), Number(row.revision) || 0) + 1;
    data._adminWriteToken = randomBytes(12).toString("hex");
    data.revision = newRev;
    data.updatedAt = Date.now();
    db.prepare("UPDATE users SET data = ?, revision = ?, updated_at = ? WHERE id = ?")
      .run(JSON.stringify(data), newRev, Date.now(), row.id);
    return { ok: true, id: String(row.id), pseudo: String(row.pseudo || "Pilote").slice(0, 20), title: entry, revision: newRev };
  } catch { return { ok: false, error: "Erreur serveur." }; }
}

async function handleAccountIdentity(req, body, res, kind) {
  const me = authUser(req);
  if (!me) return json(res, 401, { ok: false, error: "Session invalide." });
  const currentPassword = String(body?.currentPassword || "");
  if (!await verifyPassword(me.password_hash, currentPassword)) {
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
    if (await verifyPassword(passwordHash, next)) return json(res, 400, { ok: false, error: "Choisis un mot de passe différent de l'ancien." });
    passwordHash = await hashPassword(next);
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

// Le blob accepte ne differe de la requete que par ces champs serveur.
// Un recu compact evite de renvoyer et reparcourir tous les modules ; il
// confirme un saveId precis, y compris apres une reponse perdue.
function saveResponseUser(body, user) {
  if (body.compactSave !== true || !body.saveId) return { user };
  const metadata = {};
  for (const key of ["id", "pseudo", "email", "faction", "password", "revision", "updatedAt"]) metadata[key] = user[key];
  return { snapshotAccepted: true, saveId: String(body.saveId).slice(0, 128), user: metadata };
}

function protectServerModuleDailyRolls(serverData, incomingData) {
  const day = serverModuleDailyKey();
  const serverRolls = serverData?.stats?.moduleDailyRolls;
  const incomingRolls = incomingData?.stats?.moduleDailyRolls;
  const serverCount = serverRolls?.day === day ? Math.max(0, Math.floor(Number(serverRolls.count) || 0)) : 0;
  const incomingCount = incomingRolls?.day === day ? Math.max(0, Math.floor(Number(incomingRolls.count) || 0)) : 0;
  const count = Math.max(serverCount, incomingCount);
  incomingData.stats = incomingData.stats && typeof incomingData.stats === "object" ? incomingData.stats : {};
  incomingData.stats.moduleDailyRolls = { day, count };
  return incomingRolls?.day !== day || Math.max(0, Math.floor(Number(incomingRolls?.count) || 0)) !== count;
}

// POST /api/save { user } — plein blob, revision strictement croissante.
async function handleSave(req, body, res) {
  // Hash d'un mot de passe en clair calcule AVANT toute lecture : aucun
  // await ne doit separer le controle de revision de l'UPDATE (sinon deux
  // sauvegardes concurrentes pourraient s'ecraser).
  const rawPassword = body?.user?.password;
  const prehashedPassword = typeof rawPassword === "string" && rawPassword.length >= 10 && !isHash(rawPassword)
    ? await hashPassword(rawPassword) : null;
  const me = authUser(req);
  if (!me) return json(res, 401, { ok: false, error: "Session invalide." });
  const blob = body?.user;
  if (!blob || typeof blob !== "object" || Array.isArray(blob)) {
    return json(res, 400, { ok: false, error: "Utilisateur invalide." });
  }
  if (String(blob.id || "") !== String(me.id)) {
    return json(res, 403, { ok: false, error: "Compte refuse." });
  }
  const saveId = String(body.saveId || "").slice(0, 128);
  const requestHash = saveId ? createHash("sha256").update(JSON.stringify({ user: blob, baseRevision: body.baseRevision })).digest("hex") : "";
  if (saveId) {
    const receipt = db.prepare("SELECT request_hash, metadata FROM account_save_tx WHERE user_id = ? AND save_id = ?").get(me.id, saveId);
    if (receipt) {
      if (receipt.request_hash !== requestHash) return json(res, 409, { ok: false, error: "Identifiant de sauvegarde réutilisé avec un contenu différent." });
      // Reconstitue exactement le snapshot accepté, même si une récompense
      // a depuis modifié le compte. Le client acquitte ainsi la bonne dépense.
      return json(res, 200, { ok: true, duplicate: true,
        ...saveResponseUser(body, { ...blob, ...JSON.parse(receipt.metadata) }) });
    }
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
  // La révision locale peut augmenter plusieurs fois pendant un achat.
  // Elle ne permet pas d'écraser un canon que le client n'a jamais reçu.
  if (body.baseRevision !== undefined && (!Number.isSafeInteger(body.baseRevision) || body.baseRevision !== Number(me.revision))) {
    return json(res, 409, { ok: false, stale: true, error: "Compte modifié depuis la dernière synchronisation.", user: rowToPublic(me) });
  }
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
  // blob sort tout juste de JSON.parse (readBody) et n'est utilise que par
  // cette requete : le re-cloner (stringify+parse) coutait ~6 ms sur un gros
  // compte, boucle bloquee pour toute la simu. Le hash du recu est deja fait.
  const blobHasHistory = !!blob.inventory && typeof blob.inventory === "object"
    && Object.hasOwn(blob.inventory, "moduleRollHistory");
  const data = blob;
  data.id = me.id;
  data.pseudo = finalPseudo;
  data.email = finalEmail;
  data.faction = faction;
  data.revision = incomingRev;
  data.updatedAt = Date.now();
  // Les tirages sont validés par /api/modules. Une sauvegarde de jeu créée
  // juste avant un tirage ne doit jamais pouvoir remettre un ancien compteur.
  const moduleRollsCorrected = protectServerModuleDailyRolls(serverData, data);
  // Journal des tirages : le client ne l'envoie plus (le serveur l'écrit).
  // Clé absente = on garde le journal serveur tel quel (borné). Reçu d'un
  // ancien client qui le porte encore : remplacement comme avant.
  try {
    data.inventory ||= {};
    if (!blobHasHistory) {
      const kept = serverData.inventory?.moduleRollHistory;
      if (Array.isArray(kept)) data.inventory.moduleRollHistory = kept.slice(-500);
      else delete data.inventory.moduleRollHistory;
    } else if (Array.isArray(data.inventory.moduleRollHistory)) {
      capServerHistory(data);
    }
  } catch {}
  // Mot de passe : le hash colonne fait foi. Un clair entrant = changement
  // volontaire -> on le re-hache. Un hash entrant est ignore.
  let pwHash = me.password_hash;
  if (typeof data.password === "string" && data.password && !isHash(data.password)) {
    if (data.password.length < 10) return json(res, 400, { ok: false, error: "Mot de passe trop court (10 caractères minimum)." });
    pwHash = prehashedPassword || await hashPassword(data.password);
  }
  data.password = pwHash;
  try {
    db.exec("BEGIN IMMEDIATE");
    db.prepare("UPDATE users SET pseudo = ?, pseudo_norm = ?, email = ?, faction = ?, password_hash = ?, data = ?, revision = ?, updated_at = ? WHERE id = ?")
      .run(finalPseudo, norm(finalPseudo), finalEmail, faction, pwHash, JSON.stringify(data), incomingRev, data.updatedAt, me.id);
    if (saveId) {
      const metadata = { id: data.id, pseudo: data.pseudo, email: data.email, faction: data.faction,
        password: data.password, revision: data.revision, updatedAt: data.updatedAt };
      db.prepare("INSERT INTO account_save_tx (user_id, save_id, request_hash, metadata, created_at) VALUES (?, ?, ?, ?, ?)")
        .run(me.id, saveId, requestHash, JSON.stringify(metadata), data.updatedAt);
      // Petits reçus seulement ; conserver les 256 dernières opérations.
      db.prepare("DELETE FROM account_save_tx WHERE user_id = ? AND save_id IN (SELECT save_id FROM account_save_tx WHERE user_id = ? ORDER BY created_at DESC, rowid DESC LIMIT -1 OFFSET 256)")
        .run(me.id, me.id);
    }
    db.exec("COMMIT");
  } catch {
    try { db.exec("ROLLBACK"); } catch {}
    return json(res, 409, { ok: false, error: "Pseudo ou email déjà utilisé." });
  }
  const responseUser = body.compactSave === true && saveId ? data
    : rowToPublic({ id: me.id, pseudo: finalPseudo, email: finalEmail, faction, data: JSON.stringify(data) });
  return json(res, 200, { ok: true, conflict: conflict || undefined,
    ...(moduleRollsCorrected ? { user: responseUser } : saveResponseUser(body, responseUser)) });
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
    const authLimit = pathname === "/api/register" ? (process.env.NODE_TEST_CONTEXT ? 100 : 5) : 20;
    if (rateLimited(`${ip}:${pathname}`, authLimit)) return json(res, 429, { ok: false, error: "Trop de tentatives, reessaie dans une minute." });
    readBody(req, res, (body) => {
      try {
        if (pathname === "/api/register") handleRegister(body, res).catch(() => { try { json(res, 500, { ok: false, error: "Erreur serveur." }); } catch {} });
        else handleLogin(body, res).catch(() => { try { json(res, 500, { ok: false, error: "Erreur serveur." }); } catch {} });
      } catch {
        json(res, 500, { ok: false, error: "Erreur serveur." });
      }
    });
    return true;
  }
  const publicAuthHandlers = {
    "/api/auth/verify-email": handleVerifyEmail,
    "/api/auth/forgot-username": handleForgotUsername,
    "/api/auth/forgot-password": handleForgotPassword,
    "/api/auth/reset-password": handleResetPassword,
  };
  if (publicAuthHandlers[pathname] && req.method === "POST") {
    const strictLimit = pathname.includes("forgot") ? 5 : 15;
    if (rateLimited(`${ip}:${pathname}`, strictLimit)) return json(res, 429, { ok: false, error: "Trop de tentatives. Réessaie dans une minute." });
    readBody(req, res, body => {
      Promise.resolve(publicAuthHandlers[pathname](body, res)).catch(() => {
        try { json(res, 500, { ok: false, error: "Erreur serveur." }); } catch {}
      });
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
        let eternalWaves = 0;
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
          // ✅ record Eternal : meilleur total de vagues (jamais réinitialisé,
          // remplacé uniquement si le joueur fait mieux).
          const ew = Math.floor(Number(data?.eternalGate?.bestWaves));
          if (Number.isFinite(ew) && ew > 0) eternalWaves = ew;
        } catch {}
        list.push({
          pseudo: String(r.pseudo || "Pilote").slice(0, 20),
          points: kills * 10 + Math.floor(totalExp / 1000 + totalHonneur / 100),
          exp: totalExp,
          honor: totalHonneur,
          rankPoints, faction,
          eternalWaves,
          _kills: kills,
        });
      }
      list.sort((a, b) => b.points - a.points || b._kills - a._kills);
      const rowFields = ({ pseudo, points, exp, rankPoints, honor, faction, eternalWaves }) =>
        ({ pseudo, points, exp: exp || 0, rankPoints, honor, faction, eternalWaves: eternalWaves || 0 });
      // ✅ classement Eternal : top 100 par vagues terminées (indépendant du top points).
      const eternalTop = list.filter((row) => row.eternalWaves > 0)
        .sort((a, b) => b.eternalWaves - a.eternalWaves)
        .slice(0, 100).map(rowFields);
      return json(res, 200, { ok: true, list: list.slice(0, 100).map(rowFields), eternal: eternalTop });
    } catch {
      return json(res, 500, { ok: false, error: "Erreur serveur." });
    }
  }
  if (pathname === "/api/pvp/me" && req.method === "GET") {
    // Stats PvP personnelles (tableau Destruction Joueurs).
    try {
      if (rateLimited(`${ip}:/api/pvp/me`, 60)) return json(res, 429, { ok: false, error: "Trop de tentatives, reessaie dans une minute." });
      const me = authUser(req);
      if (!me) return json(res, 401, { ok: false, error: "Session invalide." });
      initAccountDb();
      const row = db.prepare("SELECT kills, xp, honneur FROM pvp_stats WHERE user_id = ?").get(String(me.id)) || { kills: 0, xp: 0, honneur: 0 };
      let petKills = 0;
      try {
        const pr = db.prepare("SELECT kills FROM pvp_pet_kills WHERE user_id = ?").get(String(me.id));
        petKills = Math.max(0, Math.floor(Number(pr?.kills) || 0));
      } catch {}
      let ships = {};
      try {
        for (const r of db.prepare("SELECT ship, kills, xp, honneur FROM pvp_ship_kills WHERE user_id = ?").all(String(me.id))) {
          ships[String(r.ship || "").toLowerCase()] = {
            kills: Math.max(0, Math.floor(Number(r.kills) || 0)),
            xp: Math.max(0, Math.floor(Number(r.xp) || 0)),
            honneur: Math.max(0, Math.floor(Number(r.honneur) || 0)),
          };
        }
      } catch {}
      return json(res, 200, {
        ok: true,
        kills: Math.max(0, Math.floor(Number(row.kills) || 0)),
        xp: Math.max(0, Math.floor(Number(row.xp) || 0)),
        honneur: Math.max(0, Math.floor(Number(row.honneur) || 0)),
        petKills,
        ships,
      });
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
  if (pathname === "/api/galaxy-gates" && req.method === "POST") {
    if (rateLimited(`${ip}:/api/galaxy-gates`, 180)) return json(res, 429, { ok: false, error: "Trop d'operations, reessaie dans un instant." });
    readBody(req, res, (body) => {
      const me = authUser(req);
      if (!me) return json(res, 401, { ok: false, error: "Session invalide." });
      let inTx = false;
      try {
        db.exec("BEGIN IMMEDIATE"); inTx = true;
        const row = db.prepare("SELECT * FROM users WHERE id = ?").get(me.id);
        if (!row) throw new Error("Compte introuvable");
        const data = rowToPublic(row);
        const result = applyServerGalaxyGateOperation(data, body);
        const now = Date.now();
        const revision = Math.max(Math.floor(Number(data.revision) || 0), Number(row.revision) || 0) + 1;
        data.revision = revision; data.updatedAt = now;
        db.prepare("UPDATE users SET data = ?, revision = ?, updated_at = ? WHERE id = ?")
          .run(JSON.stringify(data), revision, now, row.id);
        db.exec("COMMIT"); inTx = false;
        return json(res, 200, { ok: true, user: data, ...result });
      } catch (error) {
        if (inTx) { try { db.exec("ROLLBACK"); } catch {} }
        return json(res, error?.client ? 409 : 500, { ok: false, error: error?.client ? error.message : "Erreur serveur." });
      }
    });
    return true;
  }
  if (pathname === "/api/skylab" && req.method === "POST") {
    if (rateLimited(`${ip}:/api/skylab`, 120)) return json(res, 429, { ok: false, error: "Trop d'operations, reessaie dans un instant." });
    readBody(req, res, (body) => {
      const me = authUser(req);
      if (!me) return json(res, 401, { ok: false, error: "Session invalide." });
      let inTx = false;
      try {
        db.exec("BEGIN IMMEDIATE"); inTx = true;
        const row = db.prepare("SELECT * FROM users WHERE id = ?").get(me.id);
        if (!row) throw new Error("Compte introuvable");
        const data = rowToPublic(row);
        const result = applyServerSkylabOperation(data, body, Date.now());
        const now = Date.now();
        const revision = Math.max(Math.floor(Number(data.revision) || 0), Number(row.revision) || 0) + 1;
        data.revision = revision; data.updatedAt = now;
        db.prepare("UPDATE users SET data = ?, revision = ?, updated_at = ? WHERE id = ?")
          .run(JSON.stringify(data), revision, now, row.id);
        db.exec("COMMIT"); inTx = false;
        return json(res, 200, { ok: true, user: data, ...result });
      } catch (error) {
        if (inTx) { try { db.exec("ROLLBACK"); } catch {} }
        return json(res, error?.client ? 409 : 500, { ok: false, error: error?.client ? error.message : "Erreur serveur." });
      }
    });
    return true;
  }
  if (pathname === "/api/modules" && req.method === "POST") {
    if (rateLimited(`${ip}:/api/modules`, 120)) return json(res, 429, { ok: false, error: "Trop d'operations, reessaie dans un instant." });
    readBody(req, res, (body) => {
      const me = authUser(req);
      if (!me) return json(res, 401, { ok: false, error: "Session invalide." });
      let inTx = false;
      try {
        db.exec("BEGIN IMMEDIATE"); inTx = true;
        const row = db.prepare("SELECT * FROM users WHERE id = ?").get(me.id);
        if (!row) throw new Error("Compte introuvable");
        const data = rowToPublic(row);
        const result = applyServerModuleOperation(data, body);
        const now = Date.now();
        const revision = Math.max(Math.floor(Number(data.revision) || 0), Number(row.revision) || 0) + 1;
        data.revision = revision; data.updatedAt = now;
        db.prepare("UPDATE users SET data = ?, revision = ?, updated_at = ? WHERE id = ?")
          .run(JSON.stringify(data), revision, now, row.id);
        db.exec("COMMIT"); inTx = false;
        return json(res, 200, { ok: true, user: data, ...result });
      } catch (error) {
        if (inTx) { try { db.exec("ROLLBACK"); } catch {} }
        return json(res, error?.client ? 409 : 500, { ok: false, error: error?.client ? error.message : "Erreur serveur.", ...(error?.quota && typeof error.quota === "object" ? { quota: error.quota } : null) });
      }
    });
    return true;
  }
  if (pathname === "/api/production" && req.method === "POST") {
    if (rateLimited(`${ip}:/api/production`, 180)) return json(res, 429, { ok: false, error: "Trop d'operations, reessaie dans un instant." });
    readBody(req, res, (body) => {
      const me = authUser(req);
      if (!me) return json(res, 401, { ok: false, error: "Session invalide." });
      const action = String(body?.action || "");
      const recipeId = String(body?.recipeId || "");
      const requested = Math.floor(Number(body?.quantity ?? 1));
      if (action !== "refineChain" && (!recipeId || !Number.isSafeInteger(requested) || requested < 1 || requested > 1_000_000)) return json(res, 400, { ok: false, error: "Operation invalide." });
      let inTx = false;
      try {
        db.exec("BEGIN IMMEDIATE"); inTx = true;
        const row = db.prepare("SELECT * FROM users WHERE id = ?").get(me.id);
        if (!row) throw new Error("Compte introuvable");
        const data = rowToPublic(row);
        let result;
        if (action === "refine") {
          const recipe = getRefineryRecipe(recipeId);
          if (!recipe) throw Object.assign(new Error("Recette introuvable."), { client: true });
          data.inventory ||= {}; data.inventory.resources ||= {};
          const refined = refineOreOutput(data.inventory.resources, recipe, requested);
          if (refined.quantity <= 0) throw Object.assign(new Error("Minerais insuffisants."), { client: true });
          for (const [resourceId, amount] of Object.entries(recipe.inputs)) data.inventory.resources[resourceId] = Math.max(0, Math.floor(Number(data.inventory.resources[resourceId]) || 0)) - Math.max(0, Math.floor(Number(amount) || 0)) * refined.quantity;
          data.inventory.resources[recipe.output.id] = Math.max(0, Math.floor(Number(data.inventory.resources[recipe.output.id]) || 0)) + refined.gained;
          result = { recipeId: recipe.id, quantity: refined.quantity, gained: refined.gained };
        } else if (action === "refineChain") {
        // Raffinage auto groupé : TOUTE la chaîne (10 passes max) + chargement
        // des équipements entrelacé, en UNE transaction et UN aller-retour.
        // Sans ça, l'auto envoyait jusqu'à 60 requêtes séquentielles par cycle.
        data.inventory ||= {}; data.inventory.resources ||= {}; data.upgrades ||= {};
        const selections = {};
        if (body?.selections && typeof body.selections === "object") {
          for (const [k, v] of Object.entries(body.selections)) selections[String(k)] = String(v ?? "");
        }
        let cursors = {};
        if (body?.cursors && typeof body.cursors === "object") {
          for (const [k, v] of Object.entries(body.cursors)) {
            const n = Math.floor(Number(v) || 0);
            if (Number.isFinite(n) && n >= 0) cursors[String(k)] = n;
          }
        }
        const chargeSelected = () => {
          let moved = 0;
          const plan = planAutoUpgradeCharges(data.inventory.resources, selections, cursors, data.upgrades);
          cursors = plan.cursors || cursors;
          for (const { slot, ore, amount } of plan.charges) {
            const cur = data.upgrades[slot] || {};
            const owned = Math.max(0, Math.floor(Number(data.inventory.resources[ore]) || 0));
            const qty = Math.max(0, Math.min(Math.floor(Number(amount) || 0), owned, upgradeOreCapacity(data.upgrades, slot, ore)));
            if (qty <= 0) continue;
            data.inventory.resources[ore] = owned - qty;
            data.upgrades[slot] = String(cur.ore) === String(ore)
              ? { ore, stock: Math.max(0, Math.floor(Number(cur.stock) || 0)) + qty * 10 }
              : { ore, stock: qty * 10 };
            moved += qty;
          }
          return moved;
        };
        let total = 0, chargedTotal = chargeSelected();
        const byRecipe = {};
        for (let pass = 0; pass < 10; pass++) {
          let progress = 0;
          for (const recipe of REFINERY_RECIPES) {
            const refined = refineOreOutput(data.inventory.resources, recipe, 1_000_000);
            if (refined.quantity <= 0) continue;
            for (const [resourceId, amount] of Object.entries(recipe.inputs)) data.inventory.resources[resourceId] = Math.max(0, Math.floor(Number(data.inventory.resources[resourceId]) || 0) - Math.max(0, Math.floor(Number(amount) || 0)) * refined.quantity);
            data.inventory.resources[recipe.output.id] = Math.max(0, Math.floor(Number(data.inventory.resources[recipe.output.id]) || 0)) + refined.gained;
            progress += refined.gained;
            byRecipe[recipe.id] = (byRecipe[recipe.id] || 0) + refined.gained;
            chargedTotal += chargeSelected();
          }
          total += progress;
          if (progress <= 0) break;
        }
        if (total <= 0 && chargedTotal <= 0) throw Object.assign(new Error("Rien à raffiner."), { client: true });
        result = { gained: total, charged: chargedTotal, byRecipe, cursors };
      } else if (action === "craft") {
          const recipe = getCraftingRecipe(recipeId);
          if (!recipe) throw Object.assign(new Error("Recette introuvable."), { client: true });
          result = applyServerCraft(data, recipe, requested);
          if (result.error) throw Object.assign(new Error(result.error), { client: true });
        } else throw Object.assign(new Error("Operation inconnue."), { client: true });
        const now = Date.now();
        const revision = Math.max(Math.floor(Number(data.revision) || 0), Number(row.revision) || 0) + 1;
        data.revision = revision; data.updatedAt = now;
        db.prepare("UPDATE users SET data = ?, revision = ?, updated_at = ? WHERE id = ?")
          .run(JSON.stringify(data), revision, now, row.id);
        db.exec("COMMIT"); inTx = false;
        return json(res, 200, { ok: true, user: data, ...result });
      } catch (error) {
        if (inTx) { try { db.exec("ROLLBACK"); } catch {} }
        return json(res, error?.client ? 409 : 500, { ok: false, error: error?.client ? error.message : "Erreur serveur." });
      }
    });
    return true;
  }
  if (pathname === "/api/shop/sell" && req.method === "POST") {
    if (rateLimited(`${ip}:/api/shop/sell`, 120)) return json(res, 429, { ok: false, error: "Trop de ventes, reessaie dans un instant." });
    readBody(req, res, (body) => {
      const me = authUser(req);
      if (!me) return json(res, 401, { ok: false, error: "Session invalide." });
      const kind = String(body?.kind || "equipment");
      const id = String(body?.id || "");
      const quantity = Math.floor(Number(body?.quantity ?? 1));
      if (!id || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 1_000_000) {
        return json(res, 400, { ok: false, error: "Vente invalide." });
      }
      let inTx = false;
      try {
        db.exec("BEGIN IMMEDIATE"); inTx = true;
        const row = db.prepare("SELECT * FROM users WHERE id = ?").get(me.id);
        if (!row) throw new Error("Compte introuvable");
        const data = rowToPublic(row);
        data.inventory ||= {}; data.inventory.counts ||= {}; data.inventory.resources ||= {};
        let soldQuantity = quantity, gainEach = 0, gain = 0, stripped = 0;
        if (kind === "ammo") {
          const info = ammoSellInfo(id);
          const store = info?.field === "rockets" ? data.rockets : data.ammo;
          const stock = Math.max(0, Math.floor(Number(store?.[id]) || 0));
          if (!info || stock < quantity) throw Object.assign(new Error("Pas assez de munitions."), { client: true });
          gainEach = info.unit; gain = gainEach * quantity; store[id] = stock - quantity;
          if (info.field === "ammo" && data.ammoActive !== "x1" && !(Number(data.ammo?.[data.ammoActive]) > 0)) {
            data.ammoActive = "x1"; data.ammo.active = "x1";
          }
        } else if (kind === "module") {
          const all = Array.isArray(data.inventory.shipModules) ? data.inventory.shipModules : [];
          const owned = all.filter(module => serverModuleGroupKey(module) === id);
          if (owned.length < quantity) throw Object.assign(new Error("Pas assez d'exemplaires."), { client: true });
          gainEach = serverModuleSellPrice(owned[0]);
          if (!(gainEach > 0)) throw Object.assign(new Error("Ce module ne se vend pas ici."), { client: true });
          const mounted = new Set();
          for (const hangar of data.hangars || []) for (const config of ["1", "2"]) {
            for (const moduleId of hangar?.fits?.[config]?.shipMods || []) if (moduleId) mounted.add(String(moduleId));
          }
          const free = owned.filter(module => !mounted.has(String(module?.id)));
          const selected = free.slice(0, quantity);
          if (selected.length < quantity) {
            if (body?.force !== true) throw Object.assign(new Error("Module equipe : retire-le avant de le vendre."), { client: true });
            selected.push(...owned.filter(module => mounted.has(String(module?.id))).slice(0, quantity - selected.length));
          }
          const soldIds = new Set(selected.map(module => String(module?.id)));
          visitEquipmentFits(data, (fit, groups) => {
            if (!fit || !groups.includes("shipMods") || !Array.isArray(fit.shipMods)) return;
            fit.shipMods = fit.shipMods.map(value => {
              if (!soldIds.has(String(value || ""))) return value;
              stripped++; return null;
            });
          });
          data.inventory.shipModules = all.filter(module => !soldIds.has(String(module?.id)));
          gain = gainEach * quantity;
        } else if (kind === "ore") {
          const unit = Math.max(0, Math.floor(Number(ORE_SELL_PRICES[id]) || 0));
          const owned = Math.max(0, Math.floor(Number(data.inventory.resources[id]) || 0));
          if (!(unit > 0)) throw Object.assign(new Error("Ce minerai ne se vend pas ici."), { client: true });
          if (owned <= 0) throw Object.assign(new Error("Stock vide."), { client: true });
          soldQuantity = owned;
          const traderLevel = body?.trader === true ? equippedTraderLevel(data) : 0;
          const bonusPct = traderLevel > 0 ? getPetTradeBonusPct(traderLevel) : 0;
          gainEach = unit;
          gain = Math.floor(owned * unit * (1 + bonusPct / 100));
          data.inventory.resources[id] = 0;
        } else {
          const item = findCatalogItem(id);
          if (!item) throw Object.assign(new Error("Item introuvable."), { client: true });
          if (item.ship || item.design || item.pet || item.ticket || !(Number(item.price) > 0)) {
            throw Object.assign(new Error("Cet article ne peut pas etre vendu."), { client: true });
          }
          const owned = Math.max(0, Math.floor(Number(data.inventory.counts[id]) || 0));
          if (owned < quantity) throw Object.assign(new Error("Pas assez d'exemplaires."), { client: true });
          const reserved = reservedCatalogCopies(data, id);
          if (owned - quantity < reserved) {
            if (body?.force !== true) throw Object.assign(new Error("Objet equipe : retire-le avant de le vendre."), { client: true });
            stripped = stripCatalogItem(data, id);
          }
          if (owned - quantity < reservedCatalogCopies(data, id)) throw Object.assign(new Error("Objet encore equipe."), { client: true });
          data.inventory.counts[id] = owned - quantity;
          if (data.inventory.counts[id] <= 0) {
            delete data.inventory.counts[id];
            if (Array.isArray(data.inventory.modules)) data.inventory.modules = data.inventory.modules.filter(value => value !== id);
          }
          gainEach = Math.floor(Number(item.price) * 0.5); gain = gainEach * quantity;
        }
        if (!Number.isSafeInteger(gain) || gain < 0) throw new Error("Gain invalide");
        data.credits = Math.max(0, Math.floor(Number(data.credits) || 0)) + gain;
        const now = Date.now();
        const revision = Math.max(Math.floor(Number(data.revision) || 0), Number(row.revision) || 0) + 1;
        data.revision = revision; data.updatedAt = now;
        db.prepare("UPDATE users SET data = ?, revision = ?, updated_at = ? WHERE id = ?")
          .run(JSON.stringify(data), revision, now, row.id);
        db.exec("COMMIT"); inTx = false;
        return json(res, 200, { ok: true, user: data, quantity: soldQuantity, gain, gained: gain, gainEach, stripped });
      } catch (error) {
        if (inTx) { try { db.exec("ROLLBACK"); } catch {} }
        return json(res, error?.client ? 409 : 500, { ok: false, error: error?.client ? error.message : "Erreur serveur." });
      }
    });
    return true;
  }
  if (pathname === "/api/shop/buy" && req.method === "POST") {
    if (rateLimited(`${ip}:/api/shop/buy`, 120)) return json(res, 429, { ok: false, error: "Trop d'achats, reessaie dans un instant." });
    readBody(req, res, (body) => {
      const me = authUser(req);
      if (!me) return json(res, 401, { ok: false, error: "Session invalide." });
      const item = findCatalogItem(String(body?.itemId || ""));
      if (!item || item.shopHidden === true) return json(res, 400, { ok: false, error: "Article non vendu en boutique." });
      const rawQuantity = Number(body?.quantity ?? 1);
      if (!Number.isSafeInteger(rawQuantity) || rawQuantity < 1 || rawQuantity > 1_000_000) {
        return json(res, 400, { ok: false, error: "Quantite invalide." });
      }
      let inTx = false;
      try {
        db.exec("BEGIN IMMEDIATE"); inTx = true;
        const row = db.prepare("SELECT * FROM users WHERE id = ?").get(me.id);
        if (!row) throw new Error("Compte introuvable");
        const data = rowToPublic(row);
        const purchase = applyCatalogPurchase(data, item, rawQuantity, { petPseudo: body?.petPseudo });
        if (purchase.error) {
          db.exec("ROLLBACK"); inTx = false;
          return json(res, 409, { ok: false, error: purchase.error, user: rowToPublic(row) });
        }
        const now = Date.now();
        const revision = Math.max(Math.floor(Number(data.revision) || 0), Number(row.revision) || 0) + 1;
        data.revision = revision; data.updatedAt = now;
        db.prepare("UPDATE users SET data = ?, revision = ?, updated_at = ? WHERE id = ?")
          .run(JSON.stringify(data), revision, now, row.id);
        db.exec("COMMIT"); inTx = false;
        return json(res, 200, { ok: true, user: data, ...purchase });
      } catch {
        if (inTx) { try { db.exec("ROLLBACK"); } catch {} }
        return json(res, 500, { ok: false, error: "Erreur serveur." });
      }
    });
    return true;
  }
  if (pathname === "/api/save" && req.method === "POST") {
    if (rateLimited(`${ip}:/api/save`, 120)) return json(res, 429, { ok: false, error: "Trop de sauvegardes, reessaie dans un instant." });
    readBody(req, res, (body) => {
      try { handleSave(req, body, res).catch(() => { try { json(res, 500, { ok: false, error: "Erreur serveur." }); } catch {} }); } catch {
        json(res, 500, { ok: false, error: "Erreur serveur." });
      }
    });
    return true;
  }
  const identityMatch = /^\/api\/account\/(pseudo|email|password)$/.exec(pathname);
  if (identityMatch && req.method === "POST") {
    if (rateLimited(`${ip}:${pathname}`, 10)) return json(res, 429, { ok: false, error: "Trop de tentatives, reessaie dans une minute." });
    readBody(req, res, (body) => {
      try { handleAccountIdentity(req, body, res, identityMatch[1]).catch(() => { try { json(res, 500, { ok: false, error: "Erreur serveur." }); } catch {} }); }
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
              : r.error === "SENT" ? "Demande déjà envoyée."
              : r.error === "YOU_BLOCKED" ? "Tu as bloqué ce pilote : débloque-le d'abord."
              : r.error === "BLOCKED" ? "Demande impossible." : "Erreur serveur.";
            const code = r.error === "NOT_FOUND" ? 404 : (r.error === "SELF" || r.error === "BLOCKED" || r.error === "YOU_BLOCKED") ? 400 : 409;
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
  if (pathname === "/api/friends/sent" && req.method === "GET") {
    if (rateLimited(`${ip}:/api/friends`, 60)) return json(res, 429, { ok: false, error: "Trop de tentatives, reessaie dans une minute." });
    const me = authUser(req);
    if (!me) return json(res, 401, { ok: false, error: "Session invalide." });
    return json(res, 200, { ok: true, sent: getSentFriendRequests(me.id) });
  }
  if (pathname === "/api/friends/blocks" && (req.method === "GET" || req.method === "POST" || req.method === "DELETE")) {
    if (rateLimited(`${ip}:/api/friends`, 60)) return json(res, 429, { ok: false, error: "Trop de tentatives, reessaie dans une minute." });
    const me = authUser(req);
    if (!me) return json(res, 401, { ok: false, error: "Session invalide." });
    if (req.method === "GET") return json(res, 200, { ok: true, blocked: listBlocked(me.id) });
    readBody(req, res, (body) => {
      try {
        const r = req.method === "POST" ? blockUser(me.id, body?.pseudo) : unblockUser(me.id, body?.pseudo);
        if (!r.ok) {
          const msg = r.error === "NOT_FOUND" ? "Pilote introuvable." : r.error === "SELF" ? "Tu ne peux pas te bloquer toi-même." : "Erreur serveur.";
          return json(res, r.error === "NOT_FOUND" ? 404 : 400, { ok: false, error: msg });
        }
        return json(res, 200, { ok: true, pseudo: (r.blocked || r.unblocked)?.pseudo, id: (r.blocked || r.unblocked)?.id, wasFriend: r.wasFriend === true });
      } catch { json(res, 500, { ok: false, error: "Erreur serveur." }); }
    });
    return true;
  }
  if (pathname === "/api/friends/cancel" && req.method === "POST") {
    if (rateLimited(`${ip}:/api/friends`, 60)) return json(res, 429, { ok: false, error: "Trop de tentatives, reessaie dans une minute." });
    const me = authUser(req);
    if (!me) return json(res, 401, { ok: false, error: "Session invalide." });
    readBody(req, res, (body) => {
      try {
        const r = cancelFriendRequest(me.id, body?.pseudo);
        if (!r.ok) return json(res, r.error === "NOT_FOUND" ? 404 : 500, { ok: false, error: r.error === "NOT_FOUND" ? "Pilote introuvable." : "Erreur serveur." });
        return json(res, 200, { ok: true });
      } catch { json(res, 500, { ok: false, error: "Erreur serveur." }); }
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
  // --- Clans : fiche, création, candidatures, rangs ---
  if (pathname === "/api/clans/me" && req.method === "GET") {
    const me = authUser(req);
    if (!me) return json(res, 401, { ok: false, error: "Session invalide." });
    return json(res, 200, { ok: true, clan: getMyClan(me.id) });
  }
  if (pathname === "/api/clans/list" && req.method === "GET") {
    if (rateLimited(`${ip}:/api/clans`, 60)) return json(res, 429, { ok: false, error: "Trop de tentatives, reessaie dans une minute." });
    const me = authUser(req);
    if (!me) return json(res, 401, { ok: false, error: "Session invalide." });
    return json(res, 200, { ok: true, clans: listClans() });
  }
  if (pathname === "/api/clans/my-applications" && req.method === "GET") {
    const me = authUser(req);
    if (!me) return json(res, 401, { ok: false, error: "Session invalide." });
    return json(res, 200, { ok: true, applications: getMyApplications(me.id) });
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
  if (pathname === "/api/clans" && req.method === "POST") {
    if (rateLimited(`${ip}:/api/clans`, 60)) return json(res, 429, { ok: false, error: "Trop de tentatives, reessaie dans une minute." });
    const me = authUser(req);
    if (!me) return json(res, 401, { ok: false, error: "Session invalide." });
    readBody(req, res, (body) => {
      try {
        const r = createClan(me.id, body?.name, body?.tag, body?.description);
        if (!r.ok) {
          const msg = r.error === "ALREADY" ? "Tu es déjà dans un clan."
            : r.error === "NAME" ? "Le nom du clan ne peut pas être vide."
            : r.error === "TAG" ? "Le tag du clan ne peut pas être vide."
            : r.error === "TAG_LONG" ? "Le tag du clan fait 5 caractères maximum."
            : r.error === "TAKEN" ? "Ce tag est déjà pris." : "Erreur serveur.";
          return json(res, r.error === "TAKEN" || r.error === "ALREADY" ? 409 : 400, { ok: false, error: msg });
        }
        return json(res, 200, { ok: true, clan: r.clan });
      } catch { json(res, 500, { ok: false, error: "Erreur serveur." }); }
    });
    return true;
  }
  if (pathname === "/api/clans/bases" && req.method === "GET") {
    if (rateLimited(`${ip}:/api/clans/bases`, 60)) return json(res, 429, { ok: false, error: "Trop de tentatives, reessaie dans une minute." });
    const me = authUser(req);
    if (!me) return json(res, 401, { ok: false, error: "Session invalide." });
    return json(res, 200, { ok: true, ...getClanBases(me.id) });
  }
  if (pathname === "/api/clans/ranking" && req.method === "GET") {
    if (rateLimited(`${ip}:/api/clans`, 60)) return json(res, 429, { ok: false, error: "Trop de tentatives, reessaie dans une minute." });
    const me = authUser(req);
    if (!me) return json(res, 401, { ok: false, error: "Session invalide." });
    return json(res, 200, { ok: true, ranking: listClanRanking() });
  }
  if ((pathname === "/api/clans/motd" || pathname === "/api/clans/bank/deposit" || pathname === "/api/clans/bank/withdraw") && req.method === "POST") {
    if (rateLimited(`${ip}:/api/clans`, 60)) return json(res, 429, { ok: false, error: "Trop de tentatives, reessaie dans une minute." });
    const me = authUser(req);
    if (!me) return json(res, 401, { ok: false, error: "Session invalide." });
    readBody(req, res, (body) => {
      try {
        if (pathname === "/api/clans/motd") {
          const r = setClanMotd(me.id, body?.text);
          if (!r.ok) return json(res, r.error === "NOCLAN" ? 404 : 403, { ok: false, error: r.error === "NOCLAN" ? "Tu n'es dans aucun clan." : "Droit édition requis." });
          return json(res, 200, { ok: true, motd: r.motd, motdAt: r.motdAt });
        }
        const bankError = (r) => r.error === "AMOUNT" ? "Montant invalide."
          : r.error === "NOCLAN" ? "Tu n'es dans aucun clan."
          : r.error === "NOCASH" ? "Crédits insuffisants."
          : r.error === "BANK" ? "Banque du clan insuffisante."
          : r.error === "RIGHTS" ? "Droit banque requis."
          : r.error === "NOT_FOUND" ? "Pilote introuvable."
          : r.error === "NOMEMBER" ? "Ce pilote n'est pas dans ton clan."
          : r.error === "LIMIT" ? `Plafond atteint : ${r.target} peut encore recevoir ${Math.floor(Number(r.allowance) || 0).toLocaleString("fr-FR")} crédits (+50 000 000 par jour passé dans le clan).`
          : "Erreur serveur.";
        if (pathname === "/api/clans/bank/deposit") {
          const r = clanBankDeposit(me.id, body?.amount);
          if (!r.ok) return json(res, r.error === "SERVER" ? 500 : 400, { ok: false, error: bankError(r) });
          return json(res, 200, { ok: true, amount: r.amount, bank: r.bank, user: r.user });
        }
        const r = clanBankWithdraw(me.id, body?.pseudo, body?.amount);
        if (!r.ok) return json(res, r.error === "SERVER" ? 500 : r.error === "RIGHTS" ? 403 : 400, { ok: false, error: bankError(r) });
        return json(res, 200, { ok: true, amount: r.amount, bank: r.bank, target: r.target, targetId: r.targetId, user: r.user || undefined });
      } catch { json(res, 500, { ok: false, error: "Erreur serveur." }); }
    });
    return true;
  }
  if (pathname === "/api/clans/relations" && req.method === "GET") {
    const me = authUser(req);
    if (!me) return json(res, 401, { ok: false, error: "Session invalide." });
    const r = getClanRelations(me.id);
    if (!r.ok) return json(res, 404, { ok: false, error: "Tu n'es dans aucun clan." });
    return json(res, 200, { ok: true, active: r.active, incoming: r.incoming, outgoing: r.outgoing });
  }
  if ((pathname === "/api/clans/apply" || pathname === "/api/clans/cancel" || pathname === "/api/clans/accept" || pathname === "/api/clans/decline"
    || pathname === "/api/clans/leave" || pathname === "/api/clans/kick" || pathname === "/api/clans/assign"
    || pathname === "/api/clans/rank-manage" || pathname === "/api/clans/open" || pathname === "/api/clans/transfer"
    || pathname === "/api/clans/dissolve" || pathname === "/api/clans/diplo" || pathname === "/api/clans/diplo/respond"
    || pathname === "/api/clans/diplo/end"
    || pathname === "/api/clans/description") && req.method === "POST") {
    if (rateLimited(`${ip}:/api/clans`, 60)) return json(res, 429, { ok: false, error: "Trop de tentatives, reessaie dans une minute." });
    const me = authUser(req);
    if (!me) return json(res, 401, { ok: false, error: "Session invalide." });
    readBody(req, res, (body) => {
      try {
        if (pathname === "/api/clans/apply") {
          const r = applyToClan(me.id, body?.tag);
          if (!r.ok) {
            const msg = r.error === "INCLAN" ? "Tu es déjà dans un clan."
              : r.error === "APPLIED" ? "Candidature déjà envoyée."
              : r.error === "FULL" ? "Clan plein (30 max)."
              : r.error === "CLOSED" ? "Recrutement fermé pour ce clan."
              : r.error === "NONE" ? "Clan introuvable." : "Erreur serveur.";
            const code = r.error === "NONE" ? 404 : (r.error === "INCLAN" || r.error === "APPLIED" || r.error === "FULL") ? 409 : 400;
            return json(res, code, { ok: false, error: msg });
          }
          return json(res, 200, { ok: true, clan: r.clan });
        }
        if (pathname === "/api/clans/cancel") {
          cancelApplication(me.id, body?.tag);
          return json(res, 200, { ok: true });
        }
        if (pathname === "/api/clans/accept") {
          const r = acceptClanApplication(me.id, body?.pseudo);
          if (!r.ok) {
            const msg = r.error === "NOT_FOUND" ? "Pilote introuvable."
              : r.error === "INCLAN" ? "Ce pilote est déjà dans un clan."
              : r.error === "FULL" ? "Clan plein (30 max)."
              : r.error === "RIGHTS" ? "Seuls le chef et les officiers acceptent."
              : r.error === "NOCLAN" ? "Tu n'es dans aucun clan."
              : "Candidature introuvable.";
            const code = r.error === "NOT_FOUND" || r.error === "NONE" ? 404 : (r.error === "INCLAN" || r.error === "FULL") ? 409 : 400;
            return json(res, code, { ok: false, error: msg });
          }
          return json(res, 200, { ok: true, member: r.member });
        }
        if (pathname === "/api/clans/decline") {
          const r = declineClanApplication(me.id, body?.pseudo);
          if (!r.ok) return json(res, 400, { ok: false, error: "Refus impossible." });
          return json(res, 200, { ok: true, member: r.member });
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
        if (pathname === "/api/clans/assign") {
          const r = assignClanRank(me.id, body?.pseudo, body?.rank);
          if (!r.ok) {
            const msg = r.error === "NOT_FOUND" ? "Pilote introuvable."
              : r.error === "NOMEMBER" ? "Pas membre de ton clan."
              : r.error === "RANK" ? "Rang inexistant."
              : "Attribution impossible (chef uniquement).";
            return json(res, r.error === "NOT_FOUND" || r.error === "NOMEMBER" || r.error === "RANK" ? 404 : 400, { ok: false, error: msg });
          }
          return json(res, 200, { ok: true, member: r.member, rank: r.rank });
        }
        if (pathname === "/api/clans/rank-manage") {
          const r = manageClanRank(me.id, body?.action, body?.name, body?.newName, body?.rights);
          if (!r.ok) {
            const msg = r.error === "TAKEN" ? "Rang déjà existant."
              : r.error === "RESERVED" ? "Nom réservé."
              : r.error === "RANK" ? "Rang inexistant."
              : r.error === "NAME" ? "Nom de rang invalide (2-20 lettres)."
              : "Gestion impossible (chef uniquement).";
            return json(res, 400, { ok: false, error: msg });
          }
          return json(res, 200, { ok: true });
        }
        if (pathname === "/api/clans/open") {
          const r = setClanOpen(me.id, body?.open === true);
          if (!r.ok) return json(res, 400, { ok: false, error: "Modification impossible (droit édition requis)." });
          return json(res, 200, { ok: true, open: r.open });
        }
        if (pathname === "/api/clans/transfer") {
          const r = transferClanLeadership(me.id, body?.pseudo);
          if (!r.ok) return json(res, 400, { ok: false, error: "Transfert impossible (chef uniquement, membre du clan)." });
          return json(res, 200, { ok: true, member: r.member });
        }
        if (pathname === "/api/clans/dissolve") {
          const r = dissolveClan(me.id);
          if (!r.ok) return json(res, 400, { ok: false, error: "Dissolution impossible (chef uniquement)." });
          return json(res, 200, { ok: true });
        }
        if (pathname === "/api/clans/diplo") {
          const r = proposeDiplo(me.id, body?.tag, body?.kind);
          if (!r.ok) {
            const msg = r.error === "NONE" ? "Clan introuvable."
              : r.error === "SELF" ? "Pas de diplomatie avec ton propre clan."
              : r.error === "EXISTS" ? "Relation déjà existante (romps-la d'abord)."
              : r.error === "KIND" ? "Type invalide (alliance, nap, war)."
              : r.error === "RIGHTS" ? "Droit diplomatie requis."
              : "Erreur serveur.";
            return json(res, r.error === "NONE" ? 404 : 400, { ok: false, error: msg });
          }
          return json(res, 200, { ok: true, war: r.war === true, rel: r.rel });
        }
        if (pathname === "/api/clans/diplo/respond") {
          const r = respondDiplo(me.id, body?.id, body?.accept === true);
          if (!r.ok) return json(res, 400, { ok: false, error: "Réponse impossible." });
          return json(res, 200, { ok: true, declined: r.declined === true, ended: r.ended === true });
        }
        if (pathname === "/api/clans/diplo/end") {
          const r = endDiplo(me.id, body?.id);
          if (!r.ok) return json(res, 400, { ok: false, error: "Rupture impossible." });
          return json(res, 200, { ok: true, ended: r.ended === true, requested: r.requested === true, retracted: r.retracted === true });
        }
        const r = setClanDescription(me.id, body?.description);
        if (!r.ok) return json(res, 400, { ok: false, error: "Description impossible (droit édition requis)." });
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
