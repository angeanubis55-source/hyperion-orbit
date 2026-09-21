// SRC/CORE/ACCOUNT_NET.js — Comptes serveur (mode multi).
// Standalone : aucun import (pas de cycle avec ACCOUNT.js).
// - legacy (aucun token) : ACCOUNT.js utilise localStorage comme avant ;
// - net (token + cache) : readUsers/writeUsers/readCurrent/writeCurrent
//   branchent ici ; les saves partent en POST /api/save (debounce 2 s) ;
// - revision serveur strictement croissante : anti-ecrasement (409 stale).

const TOKEN_KEY = "orbit_token";
const CACHE_KEY = "orbit_user_cache";
const CUR_KEY = "orbit_current_user";

let memUser = null;
let memToken = null;
let saveTimer = null;
let refreshStarted = false;

function lsGet(k) {
  try { return localStorage.getItem(k); } catch { return null; }
}
function lsSet(k, v) {
  try {
    if (v == null) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  } catch {}
}

export function netActive() {
  return memUser != null && typeof memUser === "object" && memToken != null && memToken !== "";
}

export function netList() {
  return memUser ? [memUser] : [];
}

export function netCurrent() {
  if (!memUser) return null;
  return { id: memUser.id, pseudo: memUser.pseudo, email: memUser.email };
}

export function netStore(list) {
  const arr = Array.isArray(list) ? list : [];
  const mine = (memUser && arr.find((u) => u && u.id === memUser.id)) || arr[0] || null;
  if (mine && typeof mine === "object") {
    // Memes garde-fous que le legacy (writeUsers) : plafond historique,
    // sentinelle Infinity -> -1 (JSON ne porte pas Infinity).
    try {
      if (Array.isArray(mine.inventory?.moduleRollHistory) && mine.inventory.moduleRollHistory.length > 500) {
        mine.inventory.moduleRollHistory = mine.inventory.moduleRollHistory.slice(-500);
      }
    } catch {}
    memUser = JSON.parse(JSON.stringify(mine, (k, v) => (v === Infinity ? -1 : v)));
    writeCache(memUser);
    schedulePush();
  }
}

export function netSetCurrent(cur) {
  if (!cur) {
    // Logout : coupe la session serveur (best effort) + nettoie tout.
    const tok = memToken || lsGet(TOKEN_KEY);
    memUser = null;
    memToken = null;
    try { clearTimeout(saveTimer); } catch {}
    saveTimer = null;
    lsSet(TOKEN_KEY, null);
    lsSet(CACHE_KEY, null);
    lsSet(CUR_KEY, null);
    if (tok) {
      try {
        fetch("/api/logout", { method: "POST", headers: { Authorization: `Bearer ${tok}` }, keepalive: true }).catch(() => {});
      } catch {}
    }
    return;
  }
}

function writeCache(user) {
  try {
    lsSet(CACHE_KEY, JSON.stringify({ user, at: Date.now() }));
  } catch {}
}

function readCache() {
  try {
    const raw = lsGet(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.user === "object" && parsed.user.id) return parsed.user;
  } catch {}
  return null;
}

// Boot synchrone (import) depuis token + cache. Le refresh async suit.
export function bootNetFromCache() {
  try {
    const tok = lsGet(TOKEN_KEY);
    if (!tok) return false;
    const cached = readCache();
    if (!cached) return false;
    memToken = tok;
    memUser = cached;
    if (!refreshStarted) {
      refreshStarted = true;
      setTimeout(() => { refreshNetUser().catch(() => {}); }, 0);
    }
    window.addEventListener("pagehide", () => { flushNetUser().catch(() => {}); });
    return true;
  } catch {
    return false;
  }
}

export function enterNetMode(token, user) {
  memToken = String(token || "");
  memUser = user && typeof user === "object" ? user : null;
  if (!memToken || !memUser) return false;
  lsSet(TOKEN_KEY, memToken);
  writeCache(memUser);
  try {
    lsSet(CUR_KEY, JSON.stringify({ id: memUser.id, pseudo: memUser.pseudo, email: memUser.email }));
  } catch {}
  if (!refreshStarted) {
    refreshStarted = true;
    setTimeout(() => { refreshNetUser().catch(() => {}); }, 0);
  }
  window.addEventListener("pagehide", () => { flushNetUser().catch(() => {}); });
  return true;
}

async function api(path, { method = "GET", body, token, timeout = 15000 } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => { try { ctrl.abort(); } catch {} }, Math.max(500, timeout));
  try {
    const headers = {};
    if (body !== undefined) headers["content-type"] = "application/json; charset=utf-8";
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(path, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
    const data = await res.json().catch(() => ({}));
    return { status: res.status, ...(data && typeof data === "object" ? data : {}) };
  } finally {
    clearTimeout(timer);
  }
}

export async function serverOnline(timeout = 2000) {
  try {
    if (!/^https?:$/.test(location.protocol)) return false;
    const r = await api("/api/ping", { timeout });
    return !!(r && r.ok === true);
  } catch {
    return false;
  }
}

export async function apiRegister({ pseudo, email, password, faction, migrate } = {}) {
  const out = await api("/api/register", { method: "POST", body: { pseudo, email, password, faction, migrate } });
  if (out && out.ok && out.token && out.user) enterNetMode(out.token, out.user);
  return out;
}

export async function apiLogin(pseudoOrEmail, password) {
  const out = await api("/api/login", { method: "POST", body: { pseudoOrEmail, password } });
  if (out && out.ok && out.token && out.user) enterNetMode(out.token, out.user);
  return out;
}

// Disponibilite d'un pseudo (renommage) : faux si pris par un autre compte.
// Hors ligne : { ok:false} (l'appelant garde son controle local).
export async function apiPseudoFree(pseudo) {
  if (!netActive()) return { ok: false };
  try {
    const out = await api(`/api/pseudo-free?pseudo=${encodeURIComponent(String(pseudo || ""))}`, { token: memToken, timeout: 5000 });
    return out || { ok: false };
  } catch {
    return { ok: false };
  }
}

function schedulePush() {
  try { clearTimeout(saveTimer); } catch {}
  saveTimer = setTimeout(() => { pushNow().catch(() => {}); }, 2000);
}

async function pushNow() {
  saveTimer = null;
  if (!netActive()) return { ok: false };
  const token = memToken;
  const snapshot = memUser;
  let out = null;
  try {
    out = await api("/api/save", { method: "POST", body: { user: snapshot }, token });
  } catch {
    return { ok: false, error: "Reseau." };
  }
  if (out && out.ok) {
    if (out.user && typeof out.user === "object") {
      memUser = out.user;
      writeCache(memUser);
    }
    return out;
  }
  if (out && out.status === 409 && out.stale && out.user) {
    // Plus recent ailleurs (2e onglet, give admin...) : on adopte le canon
    // SANS recharger la page (fini les refresh forcés surprises).
    // Le moteur re-synchronise via l'événement orbit:net-adopted puis
    // repousse l'état mémoire : convergence, jamais de reload.
    memUser = out.user;
    writeCache(memUser);
    try { window.dispatchEvent(new CustomEvent("orbit:net-adopted", { detail: { reason: "stale" } })); } catch {}
    return out;
  }
  if (out && out.status === 401) {
    // Session morte : bascule locale (reconnecte-toi via AUTH).
    enterLocalFallback();
    return out;
  }
  if (out && out.user && typeof out.user === "object") {
    // Conflit pseudo/email : le serveur tranche, on adopte le canon.
    memUser = out.user;
    writeCache(memUser);
  }
  return out || { ok: false };
}

export async function flushNetUser() {
  try { clearTimeout(saveTimer); } catch {}
  saveTimer = null;
  return pushNow();
}

async function refreshNetUser() {
  if (!netActive()) return;
  let out = null;
  try {
    out = await api("/api/me", { token: memToken });
  } catch {
    return;
  }
  if (!out || !out.ok || !out.user) {
    if (out && out.status === 401) enterLocalFallback();
    return;
  }
  const srvRev = Math.floor(Number(out.user.revision) || 0);
  const memRev = Math.floor(Number(memUser?.revision) || 0);
  if (srvRev > memRev) {
    // Serveur plus récent qu'au boot : on adopte sans recharger
    // (le moteur vivant se resynchronise via orbit:net-adopted).
    memUser = out.user;
    writeCache(memUser);
    try { window.dispatchEvent(new CustomEvent("orbit:net-adopted", { detail: { reason: "refresh" } })); } catch {}
  }
}

function enterLocalFallback() {
  memUser = null;
  memToken = null;
  try { clearTimeout(saveTimer); } catch {}
  saveTimer = null;
  lsSet(TOKEN_KEY, null);
  lsSet(CACHE_KEY, null);
  lsSet(CUR_KEY, null);
}

try {
  window.__ACCOUNT_NET__ = {
    netActive, enterNetMode, serverOnline, apiRegister, apiLogin, flushNetUser,
    netList, netCurrent,
  };
} catch {}
