// SCRIPTS/ACCOUNT_SERVER.js — Comptes serveur (SQLite, zero dependance).
// Persistance autoritaire du blob user + auth par token. La logique jeu
// (credits, inventaire...) reste calculee par le client ; le serveur stocke,
// horodate et protege les revisions (anti-ecrasement silencieux).
// Le client local continue de sanitizer (plafond historique, sentinelle Infinity).

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

const DB_DIR = resolve(process.cwd(), "SERVER_DATA");
const DB_PATH = join(DB_DIR, "orbit.db");

const FACTIONS = new Set(["mmo", "eic", "vru"]);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i;
const TOKEN_TTL_MS = 30 * 24 * 3600 * 1000;
const BODY_LIMIT = 6_000_000;

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
  return typeof v === "string" && v.startsWith("v1$");
}
function hashPassword(plain) {
  const salt = randomBytes(16).toString("hex");
  return `v1$${salt}$${sha256hex(`${salt}::${String(plain ?? "")}`)}`;
}
function verifyPassword(stored, candidate) {
  const c = String(candidate ?? "");
  if (isHash(stored)) {
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
  `);
  // Menage des sessions expirees (toutes les heures).
  const purge = () => {
    try { db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(Date.now()); } catch {}
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

function authUser(req) {
  const token = bearerToken(req);
  if (!token) return null;
  const s = db.prepare("SELECT user_id, expires_at FROM sessions WHERE token = ?").get(token);
  if (!s || Number(s.expires_at) < Date.now()) {
    if (s) { try { db.prepare("DELETE FROM sessions WHERE token = ?").run(token); } catch {} }
    return null;
  }
  const u = db.prepare("SELECT * FROM users WHERE id = ?").get(s.user_id);
  return u || null;
}

function newSession(userId) {
  const token = `tok_${randomBytes(32).toString("hex")}`;
  const now = Date.now();
  db.prepare("INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)")
    .run(token, userId, now, now + TOKEN_TTL_MS);
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

// WS multi : verifie un token de compte hors HTTP (hello).
// Retourne { id, pseudo } ou null (invite / token mort).
export function verifyWsToken(token) {
  try {
    const t = String(token || "").slice(0, 128);
    if (!t) return null;
    initAccountDb();
    const s = db.prepare("SELECT user_id, expires_at FROM sessions WHERE token = ?").get(t);
    if (!s || Number(s.expires_at) < Date.now()) {
      if (s) { try { db.prepare("DELETE FROM sessions WHERE token = ?").run(t); } catch {} }
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
  if (password.length < 4) return json(res, 400, { ok: false, error: "Mot de passe trop court (4 caractères minimum)." });
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
  if (!u) return json(res, 404, { ok: false, error: "Compte introuvable." });
  if (!verifyPassword(u.password_hash, pass)) return json(res, 403, { ok: false, error: "Mot de passe incorrect." });
  // Migration clair -> hash.
  if (!isHash(u.password_hash)) {
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
    if (data.password.length < 4) return json(res, 400, { ok: false, error: "Mot de passe trop court." });
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
    if (token) { try { db.prepare("DELETE FROM sessions WHERE token = ?").run(token); } catch {} }
    return json(res, 200, { ok: true });
  }
  if (pathname === "/api/me" && req.method === "GET") {
    const me = authUser(req);
    if (!me) return json(res, 401, { ok: false, error: "Session invalide." });
    return json(res, 200, { ok: true, user: rowToPublic(me) });
  }
  if (pathname === "/api/rankings" && req.method === "GET") {
    // Classement PvP public : grade + pseudo + points UNIQUEMENT
    // (kills/xp/honneur restent cachés côté client).
    // Points = kills * 10 (inchangé) + xp_total / 1000 + honneur_total / 100.
    try {
      if (rateLimited(`${ip}:/api/rankings`, 60)) return json(res, 429, { ok: false, error: "Trop de tentatives, reessaie dans une minute." });
      const rows = db.prepare("SELECT s.user_id, s.kills, s.xp, s.honneur, u.pseudo, u.data FROM pvp_stats s JOIN users u ON u.id = s.user_id ORDER BY s.kills DESC LIMIT 200").all();
      const list = [];
      for (const r of rows) {
        const kills = Math.max(0, Math.floor(Number(r.kills) || 0));
        let rankPoints = 0, honor = 0;
        let totalExp = Math.max(0, Math.floor(Number(r.xp) || 0));
        let totalHonneur = Math.max(0, Math.floor(Number(r.honneur) || 0));
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
    readBody(req, res, (body) => {
      try { handleSave(req, body, res); } catch {
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
