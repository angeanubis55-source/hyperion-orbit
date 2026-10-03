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
// Sélection de hangar/design pas encore confirmée par le serveur. Elle doit
// survivre à un 409 provoqué entre-temps par une récompense ou un autre save.
let pendingHangarSelection = null;
let observedShipSelection = null;
let observedHangarSelection = null;
let refreshStarted = false;
let pendingPurchaseCredits = 0;
const pendingPurchaseStock = { ammo: {}, rockets: {} };
const pendingConsumedStock = { ammo: {}, rockets: {}, ores: {} };
// Charges d'améliorations (raffinage -> slots laser/rocket/speed/shield) pas
// encore acceptées par le serveur : sur 409, le canon (sans la charge)
// écraserait le slot = dépôt "mis puis enlevé et remis dans la liste".
const pendingUpgradeCharges = {};
// Miroir local de ORE_RESOURCE_IDS (SRC/DATA/RESOURCES.js) : ce module reste
// sans import (pas de cycle avec ACCOUNT.js).
const ORE_IDS = Object.freeze(["palladium", "prometium", "endurium", "terbium", "prometid", "duranium", "promerium", "seprom", "xenomit", "osmium"]);

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
    try {
      const newActive = mine?.hangars?.find((h) => h?.active)
        || mine?.hangars?.find((h) => h?.shipId === mine?.ship)
        || null;
      const newShipId = String(mine?.ship || "");
      const newHangarId = String(newActive?.id || "");
      if (observedShipSelection !== null
        && (newShipId !== observedShipSelection || newHangarId !== observedHangarSelection)) {
        pendingHangarSelection = {
          ship: mine.ship,
          hangarId: newActive?.id || null,
          hangar: newActive ? structuredClone(newActive) : null,
        };
      }
      observedShipSelection = newShipId;
      observedHangarSelection = newHangarId;
    } catch {}
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

// Enregistre le prix d'un achat jusqu'a ce que le serveur ait accepte la
// sauvegarde correspondante. Sur 409, ce debit sera rejoue sur le canon.
export function noteNetPurchase(totalPrice, stockGains = null) {
  if (!netActive()) return;
  const price = Math.max(0, Math.floor(Number(totalPrice) || 0));
  if (price > 0) pendingPurchaseCredits += price;
  for (const field of ["ammo", "rockets"]) {
    const gains = stockGains?.[field];
    if (!gains || typeof gains !== "object") continue;
    for (const [id, amount] of Object.entries(gains)) {
      if (id === "x1") continue;
      const add = Math.max(0, Math.floor(Number(amount) || 0));
      if (add > 0) pendingPurchaseStock[field][id] = Math.max(0, Number(pendingPurchaseStock[field][id]) || 0) + add;
    }
  }
}

export function noteNetConsumption(field, id, amount) {
  if (!netActive() || !pendingConsumedStock[field]) return;
  const key = String(id || "").toLowerCase();
  const used = Math.max(0, Math.floor(Number(amount) || 0));
  if (key && used > 0) pendingConsumedStock[field][key] = Math.max(0, Number(pendingConsumedStock[field][key]) || 0) + used;
}

// Charge d'amélioration (raffinage) en attente d'acceptation serveur.
// Rejouée sur le canon en cas de 409 (comme les achats).
export function noteNetUpgradeCharge(slot, ore, stock) {
  if (!netActive()) return;
  const key = String(slot || "").toLowerCase();
  const st = Math.max(0, Math.floor(Number(stock) || 0));
  if (!key || !(st > 0)) return;
  pendingUpgradeCharges[key] = { ore: String(ore || ""), stock: st };
}

function clearPendingPurchaseStock(snapshot) {
  for (const field of ["ammo", "rockets"]) {
    for (const [id, amount] of Object.entries(snapshot?.[field] || {})) {
      const left = Math.max(0, Number(pendingPurchaseStock[field][id]) || 0) - Math.max(0, Number(amount) || 0);
      if (left > 0) pendingPurchaseStock[field][id] = left;
      else delete pendingPurchaseStock[field][id];
    }
  }
}

function clearPendingConsumedStock(snapshot) {
  for (const field of ["ammo", "rockets"]) {
    for (const [id, amount] of Object.entries(snapshot?.[field] || {})) {
      const left = Math.max(0, Number(pendingConsumedStock[field][id]) || 0) - Math.max(0, Number(amount) || 0);
      if (left > 0) pendingConsumedStock[field][id] = left;
      else delete pendingConsumedStock[field][id];
    }
  }
  // Minerais : soldés via leur propre snapshot (consumedOresAtSend), pas via
  // les stocks du snapshot poussé (qui donneraient un solde faux -> la
  // dépense serait re-soustraite à chaque 409 = rollback à zéro).
}

function resetPendingPurchases() {
  pendingPurchaseCredits = 0;
  pendingPurchaseStock.ammo = {};
  pendingPurchaseStock.rockets = {};
  pendingConsumedStock.ammo = {};
  pendingConsumedStock.rockets = {};
  pendingConsumedStock.ores = {};
  for (const k of Object.keys(pendingUpgradeCharges)) delete pendingUpgradeCharges[k];
}

export function netSetCurrent(cur) {
  if (!cur) {
    // Logout : coupe la session serveur (best effort) + nettoie tout.
    const tok = memToken || lsGet(TOKEN_KEY);
    memUser = null;
    memToken = null;
    try { clearTimeout(saveTimer); } catch {}
    saveTimer = null;
    resetPendingPurchases();
    pendingHangarSelection = null;
    observedShipSelection = null;
    observedHangarSelection = null;
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
    lsSet(CACHE_KEY, JSON.stringify({ user, at: Date.now() }));
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
    if (parsed && typeof parsed.user === "object" && parsed.user.id) return parsed.user;
  } catch {}
  return null;
}

function observeHangarSelection(user) {
  try {
    const active = user?.hangars?.find((h) => h?.active)
      || user?.hangars?.find((h) => h?.shipId === user?.ship)
      || null;
    observedShipSelection = String(user?.ship || "");
    observedHangarSelection = String(active?.id || "");
  } catch {}
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
    observeHangarSelection(memUser);
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
  observeHangarSelection(memUser);
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
// Volontairement limité à l'XP/compteurs/minerais : crédits, munitions et
// honneur (pénalité -50 % au changement de firme) peuvent baisser
// légitimement. Les minerais sont sûrs ici : toutes les dépenses
// (vente, échange, raffinage, atelier, transporteur) écrivent le canon
// directement ET resynchronisent le moteur — seul le moteur collecte
// (jamais le serveur), donc moteur > canon = gain non poussé.
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
        if (!nd) {
          next.drones.items.push(pd);
          byId.set(String(pd.id), pd);
          continue;
        }
        if (Number(pd.exp) > Number(nd.exp || 0)) nd.exp = Math.max(0, Number(pd.exp));
        if (Number(pd.level) > Number(nd.level || 0)) nd.level = Math.max(0, Math.floor(Number(pd.level)));
      }
      if (Array.isArray(prev.drones.formations) && Array.isArray(next.drones.formations)) {
        const formations = new Set(next.drones.formations.map(String));
        for (const id of prev.drones.formations) {
          if (id != null && !formations.has(String(id))) {
            next.drones.formations.push(id);
            formations.add(String(id));
          }
        }
      }
    }
    if (prev.pet && next.pet && typeof next.pet === "object") {
      if (Number(prev.pet.exp) > Number(next.pet.exp || 0)) next.pet.exp = Math.max(0, Number(prev.pet.exp));
      if (Number(prev.pet.level) > Number(next.pet.level || 0)) next.pet.level = Math.max(0, Math.floor(Number(prev.pet.level)));
    }
    // Améliorations chargées (raffinage -> slots) : une charge validée
    // localement ne doit jamais disparaître quand le canon serveur (sans la
    // charge, push pas encore accepté) est adopté. Même minerai : MAX du
    // stock (consommation par tir non poussée à chaque coup). Slot vide côté
    // canon : on garde la charge locale. Minerai remplacé : le canon tranche
    // (le replay pendingUpgradeCharges couvre le cas récent).
    if (prev.upgrades && next.upgrades && typeof next.upgrades === "object" && !Array.isArray(next.upgrades)) {
      for (const [slot, loaded] of Object.entries(prev.upgrades)) {
        const key = String(slot || "").toLowerCase();
        if (!key || !loaded || typeof loaded !== "object") continue;
        const pStock = Math.max(0, Math.floor(Number(loaded.stock) || 0));
        if (!(pStock > 0)) continue;
        const pOre = String(loaded.ore || "");
        const cur = next.upgrades[key];
        const nStock = cur && typeof cur === "object" ? Math.max(0, Math.floor(Number(cur.stock) || 0)) : 0;
        if (!cur || typeof cur !== "object" || !(nStock > 0)) {
          next.upgrades[key] = { ore: pOre, stock: pStock };
        } else if (String(cur.ore || "") === pOre && pStock > nStock) {
          next.upgrades[key] = { ore: pOre, stock: pStock };
        }
      }
    }
    // Vaisseaux/designs/hangars possédés localement mais absents du canon
    // serveur (achat boutique pas encore poussé lors d'un 409) : union.
    // Un achat validé localement ne doit jamais disparaître avec l'illusion
    // d'un remboursement. Les vaisseaux ne se revendent pas : l'union ne
    // ressuscite aucun bien vendu.
    if (prev.inventory && next.inventory && typeof next.inventory === "object") {
      for (const key of ["ships", "shipDesigns"]) {
        if (Array.isArray(prev.inventory[key]) && Array.isArray(next.inventory[key])) {
          const have = new Set(next.inventory[key].map(String));
          for (const id of prev.inventory[key]) {
            if (id != null && !have.has(String(id))) {
              next.inventory[key].push(id);
              have.add(String(id));
            }
          }
        }
      }
      // Modules vaisseaux + historique roulette : union par id. Un tirage
      // validé localement ne doit jamais disparaître quand le canon serveur
      // (récompense NPC, give admin, 2e onglet...) est adopté après un 409.
      // Sans ça : module "comme si on l'avait pas eu" (ni inventaire, ni
      // historique). L'historique reste plafonné à 500 (garde les + récents,
      // dont le tirage qui vient d'être fait).
      for (const key of ["shipModules", "moduleRollHistory"]) {
        if (Array.isArray(prev.inventory[key]) && Array.isArray(next.inventory[key])) {
          const have = new Set();
          for (const m of next.inventory[key]) {
            if (m && m.id != null) have.add(String(m.id));
          }
          for (const m of prev.inventory[key]) {
            if (m && m.id != null && !have.has(String(m.id))) {
              next.inventory[key].push(m);
              have.add(String(m.id));
            }
          }
          if (key === "moduleRollHistory" && next.inventory[key].length > 500) {
            next.inventory[key] = next.inventory[key].slice(-500);
          }
        }
      }
      const pCounts = prev.inventory.counts, nCounts = next.inventory.counts;
      if (pCounts && nCounts && typeof pCounts === "object" && typeof nCounts === "object") {
        for (const [id, count] of Object.entries(pCounts)) {
          if (Number(count) > Number(nCounts[id] || 0)) nCounts[id] = Math.max(0, Math.floor(Number(count) || 0));
        }
      }
      // Minerais de soute (cf. ORE_RESOURCE_IDS dans SRC/DATA/RESOURCES.js) :
      // la collecte crédite le moteur en local, le push suit en debounce 2 s.
      // Entre les deux, un adopt du canon (récompense NPC...) écrasait le gain :
      // soute qui monte à la collecte puis redescend — le plus visible sur le
      // Palladium (+1 par rocher). On garde le MAX par minerai, comme l'XP.
      const pRes = prev.inventory.resources, nRes = next.inventory.resources;
      if (pRes && nRes && typeof pRes === "object" && typeof nRes === "object"
        && !Array.isArray(pRes) && !Array.isArray(nRes)) {
        for (const id of ORE_IDS) {
          const pv = Math.max(0, Math.floor(Number(pRes[id]) || 0));
          if (pv > Math.max(0, Math.floor(Number(nRes[id]) || 0))) nRes[id] = pv;
        }
      }
    }
    if (Array.isArray(prev.hangars) && Array.isArray(next.hangars)) {
      const have = new Set(next.hangars.filter(Boolean).map((h) => String(h?.shipId)));
      for (const h of prev.hangars) {
        if (h && typeof h === "object" && !have.has(String(h?.shipId))) {
          next.hangars.push(h);
          have.add(String(h?.shipId));
        }
      }
    }
    // Boosters : chaque achat ne fait que PROLONGER le timer actif (jamais de
    // baisse légitime). En plein fight, une récompense NPC écrite côté serveur
    // fait échouer le push de l'achat (409) : sans ce MAX, le canon serveur
    // (sans l'achat) écrase le timer local = achat "crédité puis rollback".
    // Les crédits gardent le canon serveur (peuvent baisser légitimement).
    if (prev.boosters && next.boosters && typeof next.boosters === "object") {
      const pActive = prev.boosters.active, nActive = next.boosters.active;
      if (pActive && nActive && typeof pActive === "object" && typeof nActive === "object"
        && !Array.isArray(pActive) && !Array.isArray(nActive)) {
        for (const [id, expiresAt] of Object.entries(pActive)) {
          if (Number(expiresAt) > Number(nActive[id] || 0)) {
            nActive[id] = Math.max(0, Number(expiresAt));
          }
        }
      }
    }
    // Une recompense NPC est maintenant ecrite par le serveur avant que le
    // kill local ait forcement pousse sa quete. Lors de l'adoption de cette
    // revision, garde le maximum de chaque objectif et les missions terminees.
    const pQuests = prev.quests, nQuests = next.quests;
    if (pQuests && nQuests && typeof pQuests === "object" && typeof nQuests === "object") {
      const completed = new Set([...(Array.isArray(nQuests.completed) ? nQuests.completed : []), ...(Array.isArray(pQuests.completed) ? pQuests.completed : [])].map(String));
      nQuests.completed = [...completed];
      // Abandons explicites : purgés des deux côtés, jamais ressuscités.
      const tombstones = { ...((pQuests.abandoned && typeof pQuests.abandoned === "object") ? pQuests.abandoned : {}), ...((nQuests.abandoned && typeof nQuests.abandoned === "object") ? nQuests.abandoned : {}) };
      for (const id of completed) delete tombstones[id];
      nQuests.abandoned = tombstones;
      for (const id of Object.keys(tombstones)) { delete nQuests.active[id]; }
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
  const purchaseCreditsAtSend = pendingPurchaseCredits;
  const purchaseStockAtSend = JSON.parse(JSON.stringify(pendingPurchaseStock));
  const consumedStockAtSend = JSON.parse(JSON.stringify(pendingConsumedStock));
  const consumedOresAtSend = JSON.parse(JSON.stringify(pendingConsumedStock.ores || {}));
  const upgradeChargesAtSend = JSON.parse(JSON.stringify(pendingUpgradeCharges));
  let out = null;
  try {
    out = await api("/api/save", { method: "POST", body: { user: snapshot }, token });
  } catch {
    return { ok: false, error: "Reseau." };
  }
  if (out && out.ok) {
    pendingPurchaseCredits = Math.max(0, pendingPurchaseCredits - purchaseCreditsAtSend);
    clearPendingPurchaseStock(purchaseStockAtSend);
    clearPendingConsumedStock(consumedStockAtSend);
    // Minerais dépensés couverts par le snapshot accepté : on ne solde que
    // ce qui était en attente à l'envoi (une nouvelle dépense en vol reste).
    for (const [id, sent] of Object.entries(consumedOresAtSend || {})) {
      const key = String(id || "").toLowerCase();
      if (!key) continue;
      const left = Math.max(0, Number(pendingConsumedStock.ores[key]) || 0) - Math.max(0, Number(sent) || 0);
      if (left > 0) pendingConsumedStock.ores[key] = left;
      else delete pendingConsumedStock.ores[key];
    }
    // Charges d'améliorations couvertes par le snapshot accepté (inchangées
    // pendant le vol : une nouvelle charge reste en attente).
    for (const [k, sent] of Object.entries(upgradeChargesAtSend || {})) {
      const cur = pendingUpgradeCharges[k];
      if (cur && String(cur.ore) === String(sent?.ore) && Math.floor(Number(cur.stock) || 0) === Math.floor(Number(sent?.stock) || 0)) {
        delete pendingUpgradeCharges[k];
      }
    }
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
    try {
      const sentActive = snapshot?.hangars?.find((h) => h?.active)
        || snapshot?.hangars?.find((h) => h?.shipId === snapshot?.ship);
      if (pendingHangarSelection
        && String(snapshot?.ship || "") === String(pendingHangarSelection.ship || "")
        && String(sentActive?.id || "") === String(pendingHangarSelection.hangarId || "")) {
        pendingHangarSelection = null;
      }
    } catch {}
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
    if (out.adminConflict !== true && pendingHangarSelection) {
      const pending = pendingHangarSelection;
      memUser.hangars = Array.isArray(memUser.hangars) ? memUser.hangars : [];
      if (pending.hangar && pending.hangarId) {
        const index = memUser.hangars.findIndex((h) => String(h?.id || "") === String(pending.hangarId));
        if (index >= 0) memUser.hangars[index] = structuredClone(pending.hangar);
        else memUser.hangars.push(structuredClone(pending.hangar));
      }
      for (const h of memUser.hangars) h.active = String(h?.id || "") === String(pending.hangarId || "");
      memUser.ship = pending.ship;
    }
    if (out.adminConflict !== true && pendingPurchaseCredits > 0) {
      memUser.credits = Math.max(0, Math.floor(Number(memUser.credits) || 0) - pendingPurchaseCredits);
    }
    if (out.adminConflict !== true) {
      for (const field of ["ammo", "rockets"]) {
        memUser[field] ||= {};
        for (const [id, amount] of Object.entries(pendingPurchaseStock[field])) {
          memUser[field][id] = Math.max(0, Math.floor(Number(memUser[field][id]) || 0)) + Math.max(0, Math.floor(Number(amount) || 0));
        }
        for (const [id, amount] of Object.entries(pendingConsumedStock[field])) {
          memUser[field][id] = Math.max(0, Math.floor(Number(memUser[field][id]) || 0) - Math.max(0, Math.floor(Number(amount) || 0)));
        }
      }
      // Minerais dépensés (vente, raffinage, charge d'amélioration, échange)
      // pas encore acceptés : on rejoue la dépense sur le canon, sinon le
      // MAX du merge les ressuscite et le dépôt semble annulé.
      // Soldés aussitôt (baked dans memUser qui sera poussé) : un 2e 409
      // avant le push ne doit pas les re-soustraire (= rollback à zéro).
      memUser.inventory ||= {};
      memUser.inventory.resources ||= {};
      for (const [id, amount] of Object.entries(pendingConsumedStock.ores)) {
        const key = String(id || "").toLowerCase();
        if (!key) continue;
        memUser.inventory.resources[key] = Math.max(0, Math.floor(Number(memUser.inventory.resources[key]) || 0) - Math.max(0, Math.floor(Number(amount) || 0)));
        delete pendingConsumedStock.ores[key];
      }
      // Charges d'améliorations en attente : restaurées sur le canon
      // (soldées aussitôt, même raison).
      memUser.upgrades ||= {};
      for (const [slot, charge] of Object.entries(pendingUpgradeCharges)) {
        const key = String(slot || "").toLowerCase();
        const st = Math.max(0, Math.floor(Number(charge?.stock) || 0));
        if (!key || !(st > 0)) continue;
        memUser.upgrades[key] = { ore: String(charge?.ore || ""), stock: st };
        delete pendingUpgradeCharges[key];
      }
    }
    memUser.revision = Math.max(
      Math.floor(Number(memUser.revision) || 0),
      Math.floor(Number(out.user.revision) || 0),
    ) + 1;
    writeCache(memUser);
    try { window.dispatchEvent(new CustomEvent("orbit:net-adopted", { detail: { reason: "stale", conflicts } })); } catch {}
    schedulePush();
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
  flushAccountCache();
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
  resetPendingPurchases();
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
