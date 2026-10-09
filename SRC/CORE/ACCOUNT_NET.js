// SRC/CORE/ACCOUNT_NET.js — Comptes serveur (mode multi).
// Standalone : aucun import métier (pas de cycle avec ACCOUNT.js).
// Seule exception : PHONE_MODE.js (module feuille, aucun import) pour
// espacer l'envoi auto en Debug mode.
// - legacy (aucun token) : ACCOUNT.js utilise localStorage comme avant ;
// - net (token + cache) : readUsers/writeUsers/readCurrent/writeCurrent
//   branchent ici ; les saves partent en POST /api/save (debounce 2 s,
//   5 s en Debug mode) ;
// - revision serveur strictement croissante : anti-ecrasement (409 stale).
import { isPhoneMode } from "./PHONE_MODE.js";

const TOKEN_KEY = "orbit_token";
const CACHE_KEY = "orbit_user_cache";
const CUR_KEY = "orbit_current_user";

let memUser = null;
let memToken = null;
let saveTimer = null;
let saveInFlight = null;
let identityWriter = null;
// Référence serveur indépendante du compte mutable. Une révision locale
// élevée ne prouve pas que ses achats incluent les dernières récompenses.
let serverBase = null;
let retrySave = null;
let knownRewardRevision = 0;
const serverRewards = new Map();
let nextSaveId = 0;
let pendingGalaxyGates = null;
function cachePendingGalaxyGates() {
  if (memUser?.id) lsSet(`orbit_pending_gg:${memUser.id}`, pendingGalaxyGates ? JSON.stringify(pendingGalaxyGates) : null);
}
function restorePendingGalaxyGates() {
  pendingGalaxyGates = null;
  try { pendingGalaxyGates = JSON.parse(lsGet(`orbit_pending_gg:${memUser.id}`) || "null"); } catch {}
  retainPendingGalaxyGates(memUser);
  if (pendingGalaxyGates) schedulePush();
}
function retainPendingGalaxyGates(user) {
  if (pendingGalaxyGates && user) user.galaxyGates = structuredClone(pendingGalaxyGates);
  return user;
}
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

export function netStore(list, { pilotDisksOnly = false, durable = false } = {}) {
  const arr = Array.isArray(list) ? list : [];
  const mine = (memUser && arr.find((u) => u && u.id === memUser.id)) || arr[0] || null;
  // Ce mutateur ne touche que crédits et disques, sur le compte déjà chargé.
  // Garder l'envoi/cache habituel sans parcourir tout l'inventaire au clic.
  if (pilotDisksOnly && mine && mine === memUser) {
    writeCache(memUser, durable);
    schedulePush();
    return;
  }
  if (mine && typeof mine === "object") {
    // Memes garde-fous que le legacy (writeUsers) : plafond historique,
    // sentinelle Infinity -> -1 (JSON ne porte pas Infinity).
    try {
      if (Array.isArray(mine.inventory?.moduleRollHistory) && mine.inventory.moduleRollHistory.length > 500) {
        mine.inventory.moduleRollHistory = mine.inventory.moduleRollHistory.slice(-500);
      }
    } catch {}
    if (JSON.stringify(mine.galaxyGates) !== JSON.stringify(serverBase?.galaxyGates)) {
      pendingGalaxyGates = mine.galaxyGates ? structuredClone(mine.galaxyGates) : null;
    }
    // Le moteur conserve des références à ce compte et à son P.E.T. Les
    // détacher à chaque save perdrait les mutations de la frame suivante.
    // Seuls la référence serveur et le snapshot envoyé sont des copies.
    sanitizeInfiniteValues(mine);
    memUser = retainPendingSelections(mine);
    cachePendingGalaxyGates();
    writeCache(memUser, durable);
    schedulePush();
  }
}

// Les mutateurs demandent une sauvegarde ici. Le delta vient maintenant de
// memUser - serverBase, arbre et équipements compris. Un deuxième journal
// arithmétique débiterait les mêmes opérations deux fois.
function noteAccountMutation() { if (netActive()) schedulePush(); }
export const noteNetPurchase = noteAccountMutation;
export const noteNetConsumption = noteAccountMutation;
export const noteNetEquipmentSold = noteAccountMutation;
export const noteNetUpgradeCharge = noteAccountMutation;
export const noteNetSkylabMoved = noteAccountMutation;
export const noteNetGateEnergy = noteAccountMutation;
export const noteNetUpgradeConsumed = noteAccountMutation;
export const noteNetPetFuelConsumed = noteAccountMutation;
export const noteNetCreditGain = noteAccountMutation;
export const noteNetResourceGain = noteAccountMutation;

// Sélections (munitions, roquettes, lanceurs, autos, formation) en attente
// d'acceptation serveur : rejouées sur le canon en cas de 409. Sans ça,
// un adopt entre l'écriture immédiate et le push accepté restaure
// l'ancienne sélection (rollback du choix, puis repush = perte définitive).
const pendingSelections = {};
const pendingSelectionVersions = {};
const SELECTION_KEYS = ["ammoActive", "rocketActive", "launcherActive", "rocketAuto", "launcherAuto", "droneFormation", "droneFormationAt"];
let selectionVersion = 0;
function cachePendingSelections() {
  if (!memUser?.id) return;
  lsSet(`orbit_pending_selections:${memUser.id}`, Object.keys(pendingSelections).length ? JSON.stringify(pendingSelections) : null);
}

export function noteNetSelection(patch = null) {
  if (!netActive()) return;
  if (!patch || typeof patch !== "object") return;
  const version = ++selectionVersion;
  for (const key of SELECTION_KEYS) {
    if (patch[key] === undefined) continue;
    pendingSelections[key] = patch[key];
    pendingSelectionVersions[key] = version;
  }
  cachePendingSelections();
}

function retainPendingSelections(user) {
  if (!user) return user;
  const sel = pendingSelections;
  if (sel.ammoActive !== undefined) {
    user.ammoActive = sel.ammoActive;
    user.ammo ||= {};
    user.ammo.active = sel.ammoActive;
  }
  for (const key of ["rocketActive", "launcherActive", "rocketAuto", "launcherAuto"]) {
    if (sel[key] !== undefined) user[key] = sel[key];
  }
  if (sel.droneFormation !== undefined || sel.droneFormationAt !== undefined) {
    user.drones ||= {};
    if (sel.droneFormation !== undefined) user.drones.activeFormation = sel.droneFormation;
    if (sel.droneFormationAt !== undefined) user.drones.lastFormationChangeAt = sel.droneFormationAt;
  }
  return user;
}

function restorePendingSelections() {
  for (const key of Object.keys(pendingSelections)) delete pendingSelections[key];
  for (const key of Object.keys(pendingSelectionVersions)) delete pendingSelectionVersions[key];
  try { noteNetSelection(JSON.parse(lsGet(`orbit_pending_selections:${memUser.id}`) || "null")); } catch {}
  retainPendingSelections(memUser);
  if (Object.keys(pendingSelections).length) {
    // La selection peut dater d'un clic juste avant fermeture, donc sa
    // revision doit depasser celle du cache charge au demarrage.
    memUser.revision = Math.max(0, Number(memUser.revision) || 0) + 1;
    schedulePush();
  }
}

function clearPendingSelections(versions, snapshot, acceptedUser) {
  for (const key of Object.keys(versions || {})) {
    if (pendingSelectionVersions[key] !== versions[key]) continue;
    const actual = key === "droneFormation" ? acceptedUser?.drones?.activeFormation
      : key === "droneFormationAt" ? acceptedUser?.drones?.lastFormationChangeAt : acceptedUser?.[key];
    const sent = key === "droneFormation" ? snapshot?.drones?.activeFormation
      : key === "droneFormationAt" ? snapshot?.drones?.lastFormationChangeAt : snapshot?.[key];
    // Seule une confirmation de ce choix precis retire l'attente.
    if (actual !== sent) continue;
    delete pendingSelections[key];
    delete pendingSelectionVersions[key];
  }
  cachePendingSelections();
}
function resetPendingAccountState() {
  for (const key of Object.keys(pendingSelections)) delete pendingSelections[key];
  for (const key of Object.keys(pendingSelectionVersions)) delete pendingSelectionVersions[key];
  serverBase = null;
  retrySave = null;
  knownRewardRevision = 0;
  serverRewards.clear();
  identityWriter = null;
}

export function netSetCurrent(cur) {
  if (!cur) {
    // Logout : coupe la session serveur (best effort) + nettoie tout.
    const tok = memToken || lsGet(TOKEN_KEY);
    memUser = null;
    memToken = null;
    pendingGalaxyGates = null;
    try { clearTimeout(saveTimer); } catch {}
    saveTimer = null;
    resetPendingAccountState();
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

let pendingCacheUser = null;
let cacheWriteScheduled = false;
function flushAccountCache() {
  cacheWriteScheduled = false;
  const user = pendingCacheUser;
  pendingCacheUser = null;
  // Une deconnexion ne doit jamais etre suivie par la resurrection du cache.
  if (!user || !netActive() || user.id !== memUser.id) return;
  try {
    lsSet(CACHE_KEY, JSON.stringify({ user, base: serverBase, retrySave, rewards: [...serverRewards], at: Date.now() },
      (key, value) => value === Infinity ? -1 : value));
  } catch {}
}

function writeCache(user, immediate = false) {
  pendingCacheUser = user;
  if (immediate) { flushAccountCache(); return; }
  if (cacheWriteScheduled) return;
  cacheWriteScheduled = true;
  // Regroupe les sauvegardes rapproches, puis utilise un temps libre du
  // navigateur. La serialisation/localStorage reste hors de l'action.
  setTimeout(() => {
    if (typeof requestIdleCallback === "function") requestIdleCallback(flushAccountCache, { timeout: 1500 });
    else setTimeout(flushAccountCache, 0);
  }, 250);
}

function readCache() {
  try {
    const raw = lsGet(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.user === "object" && parsed.user.id) {
      serverBase = copy(parsed.base?.id === parsed.user.id ? parsed.base : parsed.user);
      retrySave = parsed.retrySave?.user?.id === parsed.user.id ? parsed.retrySave : null;
      serverRewards.clear();
      for (const [revision, reward] of parsed.rewards || []) serverRewards.set(revision, reward);
      knownRewardRevision = Math.max(Number(serverBase.revision) || 0, ...serverRewards.keys());
      return parsed.user;
    }
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
    restorePendingSelections();
    restorePendingGalaxyGates();
    if (retrySave || !same(memUser, serverBase)) schedulePush();
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
  saveInFlight = null;
  identityWriter = null;
  serverRewards.clear();
  knownRewardRevision = Number(memUser.revision) || 0;
  serverBase = copy(memUser);
  retrySave = null;
  restorePendingSelections();
  restorePendingGalaxyGates();
  lsSet(TOKEN_KEY, memToken);
  writeCache(memUser, true);
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
  const token = memToken;
  const userId = memUser.id;
  const allowed = new Set(["pseudo", "email", "password"]);
  const key = String(kind || "").toLowerCase();
  if (!allowed.has(key)) return { ok: false, error: "Modification inconnue." };
  if (identityWriter) return { ok: false, error: "Une modification du compte est déjà en cours." };
  let writer = null;
  try {
    if (saveInFlight) await saveInFlight;
    if (retrySave) {
      await flushNetUser();
      if (retrySave) return { ok: false, error: "La sauvegarde précédente attend encore la connexion." };
    }
    if (!netActive() || memToken !== token || memUser.id !== userId) return { ok: false, ignored: true };
    writer = {}; identityWriter = writer;
    clearTimeout(saveTimer); saveTimer = null;
    const out = await api(`/api/account/${key}`, {
      method: "POST",
      body: { value, currentPassword },
      token,
    });
    if (!netActive() || memToken !== token || memUser.id !== userId) return { ok: false, ignored: true };
    if (out?.ok && out.user) {
      adoptServerUser(out.user, { reason: "account" });
      try { window.dispatchEvent(new CustomEvent("orbit:user-updated", { detail: { userId: memUser.id, revision: memUser.revision, source: "account" } })); } catch {}
    }
    return out || { ok: false, error: "Réponse serveur invalide." };
  } catch {
    return { ok: false, error: "Réseau." };
  } finally {
    if (writer && identityWriter === writer) {
      identityWriter = null;
      if (netActive() && !same(memUser, serverBase)) schedulePush();
    }
  }
}

function schedulePush() {
  // Les kills suivants ne repoussent pas une sauvegarde deja programmee.
  // Debug mode : envoi espacé (5 s au lieu de 2 s), moins de réveils réseau.
  if (saveTimer != null) return;
  let delay = 2000;
  try { if (isPhoneMode()) delay = 5000; } catch {}
  saveTimer = setTimeout(() => { pushNow().catch(() => {}); }, delay);
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

const copy = value => value === undefined ? undefined : structuredClone(value);
function same(a, b) {
  if (a === Infinity) a = -1;
  if (b === Infinity) b = -1;
  if (a === b) return true;
  if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length
      && a.every((value, index) => same(value ?? null, b[index] ?? null));
  }
  // Les champs JSON n'ont pas d'ordre. Une réponse serveur qui les réordonne
  // confirme le même état, sans relancer une écriture ou bloquer le logout.
  const keys = Object.keys(a).filter(key => a[key] !== undefined);
  return keys.length === Object.keys(b).filter(key => b[key] !== undefined).length
    && keys.every(key => Object.hasOwn(b, key) && same(a[key], b[key]));
}
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);

function sanitizeInfiniteValues(value, seen = new WeakSet()) {
  if (!value || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  for (const key of Object.keys(value)) {
    if (value[key] === Infinity) value[key] = -1;
    else sanitizeInfiniteValues(value[key], seen);
  }
}

function replaceAccountObject(target, source) {
  for (const key of Object.keys(target)) {
    if (!Object.hasOwn(source, key)) delete target[key];
  }
  if (Array.isArray(target)) target.length = source.length;
  for (const [key, value] of Object.entries(source)) {
    if (["__proto__", "constructor", "prototype"].includes(key)) continue;
    if (target[key] === value) continue;
    if ((object(target[key]) && object(value)) || (Array.isArray(target[key]) && Array.isArray(value))) {
      replaceAccountObject(target[key], value);
    } else target[key] = value;
  }
  return target;
}

function additivePath(path) {
  return path === "credits" || /^(ammo|rockets|inventory\.(counts|resources)|skylab\.stock)\.[^.]+$/.test(path)
    || path === "pet.fuel" || /^upgrades\.[^.]+\.stock$/.test(path) || path === "galaxyGates.energy"
    || /^pilotSkills\.(disks|points)$/.test(path)
    || /^stats\.(exp|honor|lifetimeKills|npcKills\.[^.]+)$/.test(path)
    || path === "pet.exp" || /^drones\.items\.[^.]+\.exp$/.test(path);
}

// Fusion à trois états : canon reçu + changements locaux depuis la dernière
// référence connue. Les dépenses et les gains sont appliqués une seule fois.
function rebaseValue(base, local, remote, path = "") {
  if (same(local, base)) return copy(remote);
  if (additivePath(path) && (typeof local === "number" || local === undefined)
    && (typeof base === "number" || base === undefined) && (typeof remote === "number" || remote === undefined)) {
    if (local === -1 || base === -1 || remote === -1) return copy(local ?? remote);
    const value = (Number(remote) || 0) + (Number(local) || 0) - (Number(base) || 0);
    return path === "stats.honor" ? value : Math.max(0, value);
  }
  if (same(remote, base)) return copy(local);
  if (Array.isArray(local) && Array.isArray(remote)) {
    const before = Array.isArray(base) ? base : [];
    const keyed = ["hangars", "drones.items", "inventory.shipModules", "inventory.moduleRollHistory"].includes(path);
    if (keyed) {
      const b = new Map(before.map(v => [String(v?.id), v]));
      const l = new Map(local.map(v => [String(v?.id), v]));
      const r = new Map(remote.map(v => [String(v?.id), v]));
      const result = [];
      for (const id of new Set([...r.keys(), ...l.keys()])) {
        const merged = rebaseValue(b.get(id), l.get(id), r.get(id), `${path}.${id}`);
        if (merged !== undefined) result.push(merged);
      }
      return path === "inventory.moduleRollHistory" ? result.slice(-500) : result;
    }
    if (["inventory.modules", "inventory.ships", "inventory.shipDesigns", "drones.formations", "quests.completed"].includes(path)) {
      const b = new Set(before), l = new Set(local), r = new Set(remote);
      for (const id of b) if (!l.has(id)) r.delete(id);
      for (const id of l) if (!b.has(id)) r.add(id);
      return [...r];
    }
    // Les slots ordonnés d'un équipement forment un seul choix utilisateur.
    return copy(local);
  }
  if (object(local) && object(remote)) {
    const result = {};
    for (const key of new Set([...Object.keys(base || {}), ...Object.keys(remote), ...Object.keys(local)])) {
      if (["__proto__", "constructor", "prototype"].includes(key)) continue;
      const value = rebaseValue(base?.[key], local[key], remote[key], path ? `${path}.${key}` : key);
      if (value !== undefined) result[key] = value;
    }
    return result;
  }
  // XP/counters déjà crédités côté serveur : ne pas rejouer la récompense.
  if (/^(stats\.|quests\.active\.|pet\.(exp|level)$|drones\.items\.[^.]+\.(exp|level)$)/.test(path)
    && typeof local === "number" && typeof remote === "number") return Math.max(local, remote);
  return copy(local);
}

function rebaseUser(local, remote, base = serverBase) {
  const result = rebaseValue(base || {}, local, remote);
  for (const key of ["id", "pseudo", "email", "password", "_adminWriteToken"]) {
    if (remote[key] !== undefined) result[key] = remote[key];
  }
  result.revision = remote.revision;
  return retainPendingSelections(result);
}

function addRewardToBase(base, reward) {
  if (!base) return;
  base.credits = Math.max(0, Number(base.credits) || 0) + Math.max(0, Number(reward.credits) || 0);
  base.stats ||= {};
  for (const [field, gain] of [["exp", reward.exp], ["honor", reward.honor]]) {
    base.stats[field] = (Number(base.stats[field]) || 0) + Math.max(0, Number(gain) || 0);
  }
  if (reward.ownsKill && reward.type) {
    base.stats.lifetimeKills = (Number(base.stats.lifetimeKills) || 0) + 1;
    base.stats.npcKills ||= {};
    base.stats.npcKills[reward.type] = (Number(base.stats.npcKills[reward.type]) || 0) + 1;
  }
  for (const drone of base.drones?.items || []) drone.exp = (Number(drone.exp) || 0) + Math.max(0, Number(reward.exp) || 0) * 0.05;
  const petGain = Math.max(0, Number(reward.petExp) || 0);
  // Le reçu confirme le gain serveur. Le canon de référence peut encore
  // précéder l'activation du REX : son ancien flag active ne tranche pas.
  if (petGain > 0) {
    base.pet ||= {};
    base.pet.exp = (Number(base.pet.exp) || 0) + petGain;
  }
}

// Appelé avant d'appliquer un gain WebSocket au moteur. Un gain déjà présent
// dans un canon HTTP ne doit pas augmenter les crédits une seconde fois.
export function noteNetServerReward(reward) {
  if (!netActive() || !serverBase) return true;
  const revision = Math.floor(Number(reward?.revision) || 0);
  if (revision <= knownRewardRevision) return false;
  serverRewards.set(revision, copy(reward));
  knownRewardRevision = revision;
  addRewardToBase(serverBase, reward);
  writeCache(memUser);
  return true;
}

function acceptServerBase(user) {
  serverBase = copy(user);
  const revision = Math.floor(Number(user.revision) || 0);
  knownRewardRevision = Math.max(knownRewardRevision, revision);
  for (const [rev, reward] of serverRewards) {
    if (rev <= revision) serverRewards.delete(rev);
    else addRewardToBase(serverBase, reward);
  }
}

function adoptServerUser(user, { base = serverBase, admin = false, reason = "refresh", conflicts } = {}) {
  if (reason !== "saved") {
    try { window.dispatchEvent(new CustomEvent("orbit:net-before-adopt")); } catch {}
  }
  let remote = user;
  if (!admin && reason !== "saved") {
    // HTTP peut arriver après un gain WebSocket plus récent. La référence
    // contient déjà ce gain : compléter aussi le canon reçu avant la fusion,
    // sinon son retard ressemble à une dépense et retire la récompense.
    remote = copy(user);
    for (const [revision, reward] of serverRewards) {
      if (revision > Number(user.revision || 0)) addRewardToBase(remote, reward);
    }
  }
  const merged = admin ? retainPendingSelections(copy(user)) : rebaseUser(memUser, remote, base);
  // Les confirmations sont silencieuses : mettre à jour les objets déjà
  // utilisés par le moteur, plutôt que lui laisser un ancien compte détaché.
  memUser = reason === "saved" ? replaceAccountObject(memUser, merged) : merged;
  acceptServerBase(user);
  pendingGalaxyGates = same(memUser.galaxyGates, serverBase.galaxyGates) ? null : copy(memUser.galaxyGates);
  if (!same(memUser, serverBase) || Object.keys(pendingSelections).length) {
    memUser.revision = Math.max(Number(user.revision) || 0, Number(memUser.revision) || 0) + 1;
    schedulePush();
  }
  // L'état et sa référence doivent être persistés ensemble avant le journal
  // GG, sinon un reload peut rejouer ce journal sur une référence plus vieille.
  writeCache(memUser, true);
  cachePendingGalaxyGates();
  if (reason !== "saved") {
    try { window.dispatchEvent(new CustomEvent("orbit:net-adopted", { detail: { reason, conflicts } })); } catch {}
  }
}

async function pushNow() {
  saveTimer = null;
  if (identityWriter) { schedulePush(); return { ok: false, busy: true }; }
  if (saveInFlight) {
    if (netActive()) schedulePush();
    return saveInFlight;
  }
  const flight = pushSnapshot();
  saveInFlight = flight;
  try { return await flight; }
  finally { if (saveInFlight === flight) saveInFlight = null; }
}

async function pushSnapshot() {
  if (!netActive()) return { ok: false };
  const token = memToken;
  // En cas de réponse perdue, renvoyer exactement la même opération.
  // Le serveur peut l'avoir enregistrée avant la coupure du transport.
  if (!retrySave) {
    try { window.dispatchEvent(new CustomEvent("orbit:net-before-save")); } catch {}
    retrySave = {
      user: JSON.parse(JSON.stringify(memUser, (key, value) => value === Infinity ? -1 : value)), baseRevision: Number(serverBase?.revision) || 0,
      saveId: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${++nextSaveId}`,
      selections: { ...pendingSelectionVersions },
    };
    retrySave.user.revision = Math.max(Number(retrySave.user.revision) || 0, retrySave.baseRevision + 1);
  }
  const sent = retrySave;
  writeCache(memUser, true);
  let out;
  try {
    out = await api("/api/save", { method: "POST", body: {
      user: sent.user, baseRevision: sent.baseRevision, saveId: sent.saveId,
    }, token });
  } catch {
    if (netActive() && memToken === token) schedulePush();
    return { ok: false, error: "Reseau." };
  }
  if (!netActive() || memToken !== token || String(memUser.id) !== String(sent.user.id)) return { ok: false, ignored: true };
  if (out?.ok && out.user) {
    retrySave = null;
    clearPendingSelections(sent.selections, sent.user, out.user);
    if (same(pendingGalaxyGates, sent.user.galaxyGates)) pendingGalaxyGates = null;
    cachePendingGalaxyGates();
    // Seules les mutations survenues après ce snapshot restent à pousser.
    adoptServerUser(out.user, { base: sent.user, reason: "saved" });
    return out;
  }
  if (out?.status === 409 && out.stale && out.user) {
    retrySave = null;
    adoptServerUser(out.user, { admin: out.adminConflict === true, reason: "stale", conflicts: noteConflict() });
    return out;
  }
  if (out?.status === 401) {
    enterLocalFallback();
    return out;
  }
  // Les erreurs transitoires gardent leur identifiant de sauvegarde.
  // Un refus explicite de validation libère le snapshot pour sa correction.
  if (out?.status >= 400 && out.status < 500 && out.status !== 429) retrySave = null;
  if (netActive()) schedulePush();
  return out || { ok: false };
}

export async function flushNetUser() {
  flushAccountCache();
  try { clearTimeout(saveTimer); } catch {}
  saveTimer = null;
  return pushNow();
}

export function netHasPendingSave() {
  return netActive() && (!!retrySave || !same(memUser, serverBase)
    || Object.keys(pendingSelections).length > 0 || pendingGalaxyGates != null);
}

async function refreshNetUser() {
  if (!netActive()) return;
  const token = memToken, userId = memUser.id;
  let out;
  try { out = await api("/api/me", { token }); } catch { return; }
  if (!netActive() || memToken !== token || memUser.id !== userId) return;
  if (!out?.ok || !out.user) {
    if (out?.status === 401) enterLocalFallback();
    return;
  }
  // Résoudre d'abord une sauvegarde dont la réponse a été perdue : autrement
  // ce refresh ne peut pas savoir quels achats le serveur a déjà appliqués.
  if (retrySave || saveInFlight) { schedulePush(); return; }
  if (Number(out.user.revision) <= Number(serverBase?.revision)) return;
  const admin = !!out.user._adminWriteToken && out.user._adminWriteToken !== serverBase?._adminWriteToken;
  adoptServerUser(out.user, { admin });
}

function enterLocalFallback() {
  const wasActive = netActive();
  memUser = null;
  memToken = null;
  try { clearTimeout(saveTimer); } catch {}
  saveTimer = null;
  resetPendingAccountState();
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
