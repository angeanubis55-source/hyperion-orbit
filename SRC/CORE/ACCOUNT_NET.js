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

export async function apiAccountIdentity(kind, value, currentPassword) {
  if (!netActive()) return { ok: false, error: "Session serveur inactive." };
  const allowed = new Set(["pseudo", "email", "password"]);
  const key = String(kind || "").toLowerCase();
  if (!allowed.has(key)) return { ok: false, error: "Modification inconnue." };
  try {
    const out = await api(`/api/account/${key}`, {
      method: "POST",
      body: { value, currentPassword },
      token: memToken,
    });
    if (out?.ok && out.user) {
      memUser = out.user;
      writeCache(memUser);
      try { window.dispatchEvent(new CustomEvent("orbit:user-updated", { detail: { userId: memUser.id, revision: memUser.revision, source: "account" } })); } catch {}
    }
    return out || { ok: false, error: "Réponse serveur invalide." };
  } catch {
    return { ok: false, error: "Réseau." };
  }
}

function schedulePush() {
  try { clearTimeout(saveTimer); } catch {}
  saveTimer = setTimeout(() => { pushNow().catch(() => {}); }, 2000);
}

// Conflits d'écriture (409) : normaux isolément (give admin...), mais en
// rafale ils signalent 2 writers sur le même compte (2e onglet/fenêtre) :
// chaque adopt écrase alors les gains non poussés de l'autre côté
// (XP qui ne monte pas, bonus de gate perdus...). On compte sur 120 s.
let conflictTimes = [];
function noteConflict() {
  const now = Date.now();
  conflictTimes.push(now);
  while (conflictTimes.length && now - conflictTimes[0] > 120000) conflictTimes.shift();
  return conflictTimes.length;
}

// Champs strictement croissants (aucune mécanique légitime ne les fait
// baisser : que des +=) : lors d'une adoption du canon serveur (409,
// refresh), on garde le MAX pour ne pas annuler les gains locaux non
// encore poussés (ex : XP d'un kill juste avant un give admin). Sans ça :
// XP qui monte (gain local) puis redescend (adopt du canon sans le gain).
// Volontairement limité à l'XP/compteurs : crédits, munitions et honneur
// (pénalité -50 % au changement de firme) peuvent baisser légitimement.
function mergeProgressiveFields(prev, next) {
  if (!prev || !next || typeof next !== "object") return next;
  try {
    if (prev.stats && next.stats && typeof next.stats === "object") {
      if (Number(prev.stats.exp) > Number(next.stats.exp || 0)) {
        next.stats.exp = Math.max(0, Math.floor(Number(prev.stats.exp)));
      }
      if (Number(prev.stats.lifetimeKills) > Number(next.stats.lifetimeKills || 0)) {
        next.stats.lifetimeKills = Math.max(0, Math.floor(Number(prev.stats.lifetimeKills)));
      }
      const pKills = prev.stats.npcKills, nKills = next.stats.npcKills;
      if (pKills && nKills && typeof pKills === "object" && typeof nKills === "object"
        && !Array.isArray(pKills) && !Array.isArray(nKills)) {
        for (const [type, count] of Object.entries(pKills)) {
          if (Number(count) > Number(nKills[type] || 0)) {
            nKills[type] = Math.max(0, Math.floor(Number(count)));
          }
        }
      }
    }
    if (Array.isArray(prev.drones?.items) && Array.isArray(next.drones?.items)) {
      const byId = new Map();
      for (const d of next.drones.items) {
        if (d && d.id != null) byId.set(String(d.id), d);
      }
      for (const pd of prev.drones.items) {
        if (!pd || pd.id == null) continue;
        const nd = byId.get(String(pd.id));
        if (!nd) continue;
        if (Number(pd.exp) > Number(nd.exp || 0)) nd.exp = Math.max(0, Number(pd.exp));
        if (Number(pd.level) > Number(nd.level || 0)) nd.level = Math.max(0, Math.floor(Number(pd.level)));
      }
    }
    if (prev.pet && next.pet && typeof next.pet === "object") {
      if (Number(prev.pet.exp) > Number(next.pet.exp || 0)) next.pet.exp = Math.max(0, Number(prev.pet.exp));
      if (Number(prev.pet.level) > Number(next.pet.level || 0)) next.pet.level = Math.max(0, Math.floor(Number(prev.pet.level)));
    }
    // Une recompense NPC est maintenant ecrite par le serveur avant que le
    // kill local ait forcement pousse sa quete. Lors de l'adoption de cette
    // revision, garde le maximum de chaque objectif et les missions terminees.
    const pQuests = prev.quests, nQuests = next.quests;
    if (pQuests && nQuests && typeof pQuests === "object" && typeof nQuests === "object") {
      const completed = new Set([...(Array.isArray(nQuests.completed) ? nQuests.completed : []), ...(Array.isArray(pQuests.completed) ? pQuests.completed : [])].map(String));
      nQuests.completed = [...completed];
      nQuests.active ||= {};
      for (const [questId, previousProgress] of Object.entries(pQuests.active || {})) {
        if (completed.has(String(questId))) { delete nQuests.active[questId]; continue; }
        if (!nQuests.active[questId] || typeof nQuests.active[questId] !== "object") {
          nQuests.active[questId] = { ...(previousProgress || {}) };
          continue;
        }
        for (const [objectiveId, count] of Object.entries(previousProgress || {})) {
          if (Number(count) > Number(nQuests.active[questId][objectiveId] || 0)) {
            nQuests.active[questId][objectiveId] = Math.max(0, Math.floor(Number(count) || 0));
          }
        }
      }
    }
  } catch {}
  return next;
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
      const sentRev = Math.max(0, Math.floor(Number(snapshot?.revision) || 0));
      const liveRev = Math.max(0, Math.floor(Number(memUser?.revision) || 0));
      if (liveRev <= sentRev) {
        // Aucun changement local pendant la requete : la reponse peut devenir
        // le nouvel etat canonique.
        memUser = out.user;
        writeCache(memUser);
      } else {
        // Une recompense (notamment le bonus de fin de Galaxy Gate) a ete
        // ajoutee pendant que cette ancienne sauvegarde etait en vol. Ne
        // jamais la remplacer par la reponse correspondant au vieux snapshot;
        // programme plutot l'envoi de la revision locale plus recente.
        writeCache(memUser);
        schedulePush();
      }
    }
    return out;
  }
  if (out && out.status === 409 && out.stale && out.user) {
    // Plus recent ailleurs (2e onglet, give admin...) : on adopte le canon
    // SANS recharger la page (fini les refresh forcés surprises).
    // mergeProgressiveFields : les gains d'XP locaux non poussés survivent.
    // Le moteur re-synchronise via l'événement orbit:net-adopted puis
    // repousse l'état mémoire : convergence, jamais de reload.
    const conflicts = noteConflict();
    // Une écriture admin (crédits/EXP/honneur) doit être adoptée exactement,
    // y compris lorsqu'elle diminue une valeur. La fusion par maximum, utile
    // pour les conflits ordinaires de gains, annulerait sinon les retraits.
    memUser = out.adminConflict === true ? out.user : mergeProgressiveFields(memUser, out.user);
    writeCache(memUser);
    try { window.dispatchEvent(new CustomEvent("orbit:net-adopted", { detail: { reason: "stale", conflicts } })); } catch {}
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
    // Un nouveau token signale une attribution/retrait admin : adoption
    // exacte, sinon le MAX de l'EXP annulerait notamment un retrait.
    const serverAdminToken = String(out.user?._adminWriteToken || "");
    const localAdminToken = String(memUser?._adminWriteToken || "");
    memUser = serverAdminToken && serverAdminToken !== localAdminToken
      ? out.user
      : mergeProgressiveFields(memUser, out.user);
    writeCache(memUser);
    try { window.dispatchEvent(new CustomEvent("orbit:net-adopted", { detail: { reason: "refresh" } })); } catch {}
  }
}

function enterLocalFallback() {
  const wasActive = netActive();
  memUser = null;
  memToken = null;
  try { clearTimeout(saveTimer); } catch {}
  saveTimer = null;
  lsSet(TOKEN_KEY, null);
  lsSet(CACHE_KEY, null);
  lsSet(CUR_KEY, null);
  // Session morte en cours de jeu (401) : on prévient, sinon le joueur
  // continue sans compte et les gains (XP/honneur) partent dans le vide
  // pendant que les crédits (mémoire) semblent normaux.
  if (wasActive) {
    try { window.dispatchEvent(new CustomEvent("orbit:net-fallback", { detail: { at: Date.now() } })); } catch {}
  }
}

try {
  window.__ACCOUNT_NET__ = {
    netActive, enterNetMode, serverOnline, apiRegister, apiLogin, flushNetUser,
    netList, netCurrent,
  };
} catch {}
