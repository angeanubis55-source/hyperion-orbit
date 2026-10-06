// SRC/CORE/AUCTION_NET.js — Enchères PARTAGÉES (comme le tchat).
// Le serveur (SCRIPTS/AUCTION_ROOM.js) tranche les mises et désigne le
// gagnant ; ce module fusionne l'état serveur dans user.auction.lots
// (mêmes objets que le solo : l'UI ne change presque pas).
// Solo-safe : sans serveur, le local (ACCOUNT.js) continue comme avant.

import {
  drainNetAuctionInbox,
  sendAuctionBid,
  netConnected,
  netIsAuthed,
  netMyId,
} from "./NETPLAY.js";
import {
  getCurrentUserForMutation,
  saveUser,
  setSharedAuctionMode,
  applySharedAuctionWin,
  applySharedAuctionLoss,
  pushSharedAuctionExpired,
} from "./ACCOUNT.js";
import {
  AUCTION_CYCLE_VERSION,
  auctionMinNextBid,
  normalizeAuctionState,
} from "../DATA/AUCTION.js";

const STALE_MS = 120000; // sans nouvelles serveur 2 min : retour en solo
const META_CACHE_MAX = 64; // méta statique des lots (règlement des gains)
const PENDING_HOLD_MS = 30000; // mise envoyée, écho serveur pas encore reçu : ne pas crier à la surenchère

let sharedActive = false;
let sharedCycle = 0;
let lastSeen = 0;
let dirty = false;
const pending = new Map(); // key -> { prev, amount } (mise optimiste)
const metaCache = new Map(); // key -> { catalogId, name, qty, kind, ... }

export function isSharedAuction() {
  return sharedActive === true;
}

export function auctionNetDirty() {
  return dirty === true;
}

export function clearAuctionNetDirty() {
  dirty = false;
}

function meId() {
  try {
    return String(netMyId() || "");
  } catch {
    return "";
  }
}

// "Surenchère de X" vs "Surenchère d'un rival" (grammaire).
function outbidToastText(outbidBy, lotName) {
  const who = String(outbidBy || "").trim();
  if (!who || /^un rival$/i.test(who)) return `Surenchère d'un rival sur ${lotName} (remboursé).`;
  if (/^[aeiouyh]/i.test(who)) return `Surenchère d'${who} sur ${lotName} (remboursé).`;
  return `Surenchère de ${who} sur ${lotName} (remboursé).`;
}

function cacheMeta(srv) {
  if (!srv || typeof srv !== "object") return;
  const key = String(srv.key || srv.catalogId || "");
  if (!key) return;
  metaCache.set(key, {
    catalogId: String(srv.catalogId || key),
    name: String(srv.name || key),
    qty: Math.max(1, Math.floor(Number(srv.qty) || 1)),
    kind: String(srv.kind || "catalog"),
    droneType: String(srv.droneType || ""),
    formationId: String(srv.formationId || ""),
    ammoGive: srv.ammoGive && typeof srv.ammoGive === "object" ? { ...srv.ammoGive } : null,
    rocketsGive: srv.rocketsGive && typeof srv.rocketsGive === "object" ? { ...srv.rocketsGive } : null,
    resourcesGive: srv.resourcesGive && typeof srv.resourcesGive === "object" ? { ...srv.resourcesGive } : null,
  });
  while (metaCache.size > META_CACHE_MAX) {
    const oldest = metaCache.keys().next().value;
    metaCache.delete(oldest);
  }
}

// Masquage local (comme les filtres solo) : déjà possédés invisibles.
export function isLotMaskedForUser(lotLike, u) {
  try {
    const catalogId = String(lotLike?.catalogId || "");
    if (catalogId.startsWith("ship_")) {
      const ships = (u?.inventory?.ships || []).map(String);
      if (ships.includes(catalogId.slice(5))) return true;
    } else if (catalogId.startsWith("design_")) {
      const designs = (u?.inventory?.shipDesigns || []).map(String);
      if (designs.includes(catalogId)) return true;
    } else if (catalogId === "drone_iris") {
      const iris = (u?.drones?.items || []).filter((d) => d?.type === "iris").length;
      if (iris >= 8) return true;
    }
  } catch {}
  return false;
}

// Fusion d'un lot serveur. carried = myBid locale conservée (0 si aucune).
// Retourne { lot, refunded, outbidBy }.
function mergeSingleLot(srv, u, carried) {
  const me = meId();
  const key = String(srv?.key || srv?.catalogId || "");
  const srvTop = Math.max(0, Math.floor(Number(srv?.topBid) || 0));
  const srvBidder = String(srv?.topBidder || "");
  const srvBidderId = String(srv?.topBidderId || "");
  const mine = srvBidderId !== "" && srvBidderId === me && srvTop > 0;
  let myBid = Math.max(0, Math.floor(Number(carried) || 0));
  let refunded = 0;
  let outbidBy = "";
  if (mine) {
    if (srvTop > myBid) {
      // Ma mise vue par le serveur (reconnect / 2 onglets) : aligne la
      // réservation locale sur l'autorité serveur.
      const diff = srvTop - myBid;
      u.credits = Math.max(0, Math.floor(Number(u.credits || 0) - diff));
      myBid = srvTop;
    }
  } else if (myBid > 0) {
    // Surenchère subie : mise réservée remboursée.
    refunded = myBid;
    u.credits = Math.max(0, Math.floor(Number(u.credits || 0) + myBid));
    outbidBy = srvBidder || "un rival";
    myBid = 0;
  }
  const lot = {
    id: `net_${sharedCycle}_${key}`,
    catalogId: String(srv?.catalogId || key),
    name: String(srv?.name || key),
    icon: String(srv?.icon || ""),
    shopPrice: Math.max(1, Math.floor(Number(srv?.shopPrice) || 0)),
    qty: Math.max(1, Math.floor(Number(srv?.qty) || 1)),
    packQty: Math.max(0, Math.floor(Number(srv?.packQty) || 0)),
    kind: String(srv?.kind || "catalog"),
    exclusive: false,
    formationId: String(srv?.formationId || ""),
    droneType: String(srv?.droneType || ""),
    resourcesGive: srv?.resourcesGive && typeof srv.resourcesGive === "object" ? { ...srv.resourcesGive } : null,
    ammoGive: srv?.ammoGive && typeof srv.ammoGive === "object" ? { ...srv.ammoGive } : null,
    rocketsGive: srv?.rocketsGive && typeof srv.rocketsGive === "object" ? { ...srv.rocketsGive } : null,
    noDiscount: srv?.noDiscount === true,
    startPrice: Math.max(1, Math.floor(Number(srv?.startPrice) || 0)),
    createdAt: lastSeen || Date.now(),
    endsAt: Math.max(0, Number(srv?.endsAt) || 0),
    topBid: srvTop,
    topBidder: mine ? "you" : srvBidder,
    myBid,
    bids: Math.max(0, Math.floor(Number(srv?.bids) || 0)),
    recent: Array.isArray(srv?.recent) ? srv.recent.filter((r) => r && typeof r === "object").slice(-8).map((r) => ({
      pseudo: String(r.pseudo || "").slice(0, 20),
      amount: Math.max(0, Math.floor(Number(r.amount) || 0)),
      at: Math.max(0, Number(r.at) || 0),
    })) : [],
  };
  return { lot, refunded, outbidBy };
}

function applySync(msg, now) {
  const newCycle = Math.max(0, Math.floor(Number(msg?.cycle) || 0));
  const incoming = Array.isArray(msg?.lots) ? msg.lots : [];
  const wasActive = sharedActive === true;
  const oldCycle = sharedCycle;
  const isBoundary = wasActive && oldCycle !== newCycle;
  sharedActive = true;
  sharedCycle = newCycle;
  lastSeen = now;
  try {
    setSharedAuctionMode(true);
  } catch {}
  const events = [];
  // Rattrapage : si le settle de :00 a été manqué (déco à l'heure pile,
  // inbox pleine, onglet en veille), le sync porte le dernier règlement.
  // On l'applique AVANT de fusionner, sinon un gagnant seul sur son lot
  // serait remboursé en "surenchère" et perdrait l'item.
  try {
    const ls = msg?.lastSettle;
    if (ls && typeof ls === "object" && Number.isFinite(Number(ls?.cycle)) && Array.isArray(ls?.results)) {
      const rec = applySettle({ cycle: ls.cycle, results: ls.results });
      for (const ev of rec.events || []) events.push(ev);
    }
  } catch {}
  // Relecture APRES rattrapage (applySettle a pu rembourser + vider les lots).
  const u = getCurrentUserForMutation();
  if (!u) return { events };
  // Anciennes réservations (cycle manqué sans règlement) : rembourse.
  const oldByKey = new Map();
  try {
    for (const lot of u.auction?.lots || []) {
      if (lot && lot.catalogId) oldByKey.set(String(lot.catalogId), Math.max(0, Math.floor(Number(lot.myBid) || 0)));
    }
  } catch {}
  const merged = [];
  for (const srv of incoming) {
    try {
      cacheMeta(srv);
    } catch {}
    const key = String(srv?.key || srv?.catalogId || "");
    if (!key) continue;
    const carried = oldByKey.get(String(srv?.catalogId || key)) || 0;
    // Mise envoyée, écho serveur pas encore reçu (sync devançant l'update) :
    // on garde la mise locale au lieu de crier à la surenchère.
    // Sans ça, un joueur seul sur son lot voyait "surenchéri" à tort.
    try {
      const pend = pending.get(key);
      if (pend && carried > 0 && (now - Math.max(0, Number(pend.at) || 0)) < PENDING_HOLD_MS) {
        const me = meId();
        const srvTop = Math.max(0, Math.floor(Number(srv?.topBid) || 0));
        const srvBidderId = String(srv?.topBidderId || "");
        const confirmedMine = srvBidderId !== "" && srvBidderId === me && srvTop > 0;
        if (confirmedMine && srvTop >= Number(pend.amount || 0)) pending.delete(key);
        if (!confirmedMine) {
          const localLot = (u.auction?.lots || []).find((l) => String(l?.catalogId) === String(srv?.catalogId || key));
          if (localLot && Number(localLot.myBid) > 0) {
            merged.push(localLot);
            continue;
          }
        }
      } else if (pend && (now - Math.max(0, Number(pend.at) || 0)) >= PENDING_HOLD_MS) {
        pending.delete(key);
      }
    } catch {}
    const { lot, refunded, outbidBy } = mergeSingleLot(srv, u, carried);
    if (isLotMaskedForUser(lot, u)) {
      // Lot masqué mais mise réservée dessus : rembourse (sécurité).
      if (lot.myBid > 0) u.credits = Math.max(0, Math.floor(Number(u.credits || 0) + lot.myBid));
      continue;
    }
    // Frontière de cycle (ex : 07:00:00) : ce n'est pas une surenchère mais
    // la clôture du cycle — libellé dédié pour ne pas accuser un rival fantôme.
    if (refunded > 0) events.push({ type: "toast", text: isBoundary ? `Cycle clôturé : ${lot.name} — mise remboursée (${refunded.toLocaleString("fr-FR")} crédits).` : outbidToastText(outbidBy, lot.name) });
    merged.push(lot);
  }
  // Réservations orphelines (lot disparu / cycle manqué) : rembourse.
  if (wasActive && oldCycle !== newCycle) {
    const incomingKeys = new Set(incoming.map((s) => String(s?.catalogId || s?.key || "")));
    for (const [catalogId, myBid] of oldByKey) {
      if (myBid > 0 && !incomingKeys.has(catalogId)) {
        u.credits = Math.max(0, Math.floor(Number(u.credits || 0) + myBid));
        events.push({ type: "toast", text: `Cycle manqué : mise remboursée (${myBid.toLocaleString("fr-FR")} crédits).` });
      }
    }
  }
  try {
    const norm = normalizeAuctionState({ v: AUCTION_CYCLE_VERSION, lots: merged, history: u.auction?.history || [] });
    u.auction = norm;
  } catch {
    u.auction = { v: AUCTION_CYCLE_VERSION, lots: merged, history: u.auction?.history || [] };
  }
  try {
    saveUser(u);
  } catch {}
  dirty = true;
  return { events };
}

function applyUpdate(msg, now) {
  const u = getCurrentUserForMutation();
  if (!u || sharedActive !== true) return { events: [] };
  const events = [];
  const srv = msg?.lot;
  if (!srv || typeof srv !== "object") return { events };
  lastSeen = now;
  try {
    cacheMeta(srv);
  } catch {}
  const key = String(srv.key || srv.catalogId || "");
  const catalogId = String(srv.catalogId || key);
  if (!key) return { events };
  const lots = Array.isArray(u.auction?.lots) ? u.auction.lots : [];
  const idx = lots.findIndex((l) => String(l?.catalogId) === catalogId);
  const carried = idx >= 0 ? Number(lots[idx]?.myBid) || 0 : 0;
  const pend = pending.get(key);
  const confirmed = String(srv.topBidderId || "") === meId() && Number(srv.topBid) >= Number(pend?.amount || 0);
  if (pend && !confirmed && now - Number(pend.at || 0) < PENDING_HOLD_MS) {
    // Une mise rivale peut avoir été diffusée avant notre demande, puis
    // arriver pendant l'attente. Le rejet/la confirmation tranche d'abord,
    // sinon cet update rembourse la réserve, puis le rejet rembourse encore.
    return { events };
  }
  const { lot, refunded, outbidBy } = mergeSingleLot(srv, u, carried);
  if (pending.has(key)) {
    const me = meId();
    const srvBidderId = String(srv.topBidderId || "");
    const confirmed = srvBidderId !== "" && srvBidderId === me && Number(srv.topBid) >= Number(pending.get(key)?.amount || 0);
    if (confirmed) pending.delete(key);
  }
  if (isLotMaskedForUser(lot, u)) {
    if (idx >= 0) lots.splice(idx, 1);
    if (lot.myBid > 0) u.credits = Math.max(0, Math.floor(Number(u.credits || 0) + lot.myBid));
  } else if (idx >= 0) {
    lots[idx] = lot;
  } else {
    lots.push(lot);
  }
  if (refunded > 0) events.push({ type: "toast", text: outbidToastText(outbidBy, lot.name) });
  try {
    saveUser(u);
  } catch {}
  dirty = true;
  return { events };
}

// Cycles deja regles (anti double-attribution : le meme settle recu deux
// fois — double diffusion, reconnexion, double onglet — ne doit jamais
// payer deux fois). Persiste en local (12 derniers), partage entre onglets.
const SETTLED_KEY = "orbit_auction_settled_v1";
const SETTLED_OWNER_KEY = `${SETTLED_KEY}:legacy-owner`;
function settledStorageKey() { return `${SETTLED_KEY}:${meId()}`; }
function settledCycles() {
  try {
    let cached = localStorage.getItem(settledStorageKey());
    if (cached == null) {
      // L'ancien journal était commun à tous les comptes du navigateur.
      // Le conserver pour le compte de migration, sans bloquer les autres.
      const legacy = localStorage.getItem(SETTLED_KEY);
      let owner = localStorage.getItem(SETTLED_OWNER_KEY);
      if (legacy && !owner) { owner = meId(); localStorage.setItem(SETTLED_OWNER_KEY, owner); }
      if (legacy && owner === meId()) {
        cached = legacy; localStorage.setItem(settledStorageKey(), cached);
      }
    }
    const raw = JSON.parse(cached || "[]");
    return new Set(Array.isArray(raw) ? raw.map(String).slice(-12) : []);
  } catch { return new Set(); }
}
function markCycleSettled(cycleId) {
  try {
    const set = settledCycles();
    set.add(String(cycleId));
    const arr = [...set].slice(-12);
    localStorage.setItem(settledStorageKey(), JSON.stringify(arr));
  } catch {}
}
function applySettle(msg) {
  const u = getCurrentUserForMutation();
  if (!u || sharedActive !== true) return { events: [], profileDirty: false };
  const cycleId = String(msg?.cycle ?? "");
  if (cycleId && settledCycles().has(cycleId)) return { events: [], profileDirty: false };
  if (cycleId) markCycleSettled(cycleId);
  const events = [];
  let profileDirty = false;
  const me = meId();
  const results = Array.isArray(msg?.results) ? msg.results : [];
  const lots = Array.isArray(u.auction?.lots) ? u.auction.lots : [];
  const byKey = new Map(lots.map((l) => [String(l?.catalogId), l]));
  for (const r of results) {
    if (!r || typeof r !== "object") continue;
    const key = String(r.key || "");
    const name = String(r.name || key || "Lot");
    const winnerId = String(r.winnerId || "");
    const winner = String(r.winner || "");
    const amount = Math.max(0, Math.floor(Number(r.amount) || 0));
    const local = byKey.get(key);
    if (winnerId !== "" && winnerId === me && amount > 0) {
      const meta = metaCache.get(key) || { catalogId: key, name };
      let res = null;
      try {
        res = applySharedAuctionWin({ ...meta, name, amount, by: winner || u?.pseudo || "Joueur" });
      } catch {
        res = null;
      }
      if (res?.ok) {
        events.push({ type: "won", name, amount });
        profileDirty = true;
      } else {
        events.push({ type: "toast", text: `Lot ${name} : gain impossible, mise remboursée.` });
      }
    } else if (local && Number(local.myBid) > 0) {
      try {
        applySharedAuctionLoss({ name, amount: Number(local.myBid) || 0, by: winner });
      } catch {}
      events.push({ type: "toast", text: `Enchère perdue : ${name} (${winner || "rival"}). Remboursé.` });
    } else if (local && !isLotMaskedForUser(local, u)) {
      try {
        pushSharedAuctionExpired(name);
      } catch {}
    }
  }
  try {
    const cur = getCurrentUserForMutation();
    if (cur) {
      cur.auction = normalizeAuctionState({ v: AUCTION_CYCLE_VERSION, lots: [], history: cur.auction?.history || [] });
      saveUser(cur);
    }
  } catch {}
  dirty = true;
  return { events, profileDirty };
}

function applyReject(msg) {
  const u = getCurrentUserForMutation();
  if (!u || sharedActive !== true) return { events: [] };
  const events = [];
  const key = String(msg?.key || "");
  const p = pending.get(key);
  const lots = Array.isArray(u.auction?.lots) ? u.auction.lots : [];
  const idx = lots.findIndex((l) => String(l?.catalogId) === key);
  if (p) {
    pending.delete(key);
    u.credits = Math.max(0, Math.floor(Number(u.credits || 0) + Math.max(0, Math.floor(Number(p.amount) || 0))));
    if (idx >= 0) {
      const prev = Math.max(0, Math.floor(Number(p.prev) || 0));
      lots[idx].myBid = 0;
      if (prev > 0) {
        u.credits = Math.max(0, Math.floor(Number(u.credits || 0) - prev));
        lots[idx].myBid = prev;
      }
    }
  }
  // Etat serveur joint : fait foi (comme une update, sans toast surenchère
  // si c'est notre propre ancienne mise qui revient).
  if (msg?.lot && typeof msg.lot === "object" && idx >= 0) {
    const carried = Number(lots[idx]?.myBid) || 0;
    const { lot, refunded } = mergeSingleLot(msg.lot, u, carried);
    lots[idx] = lot;
    if (refunded > 0 && !p) events.push({ type: "toast", text: `Dépassé sur ${lot.name} (remboursé).` });
  }
  try {
    saveUser(u);
  } catch {}
  dirty = true;
  events.push({ type: "toast", text: String(msg?.reason || "Mise refusée.") });
  return { events };
}

// Pompe appelée par le moteur (toutes les 2 s) : applique les messages
// serveur aux lots locaux. Retourne { shared, dirty, profileDirty, events }.
export function pumpSharedAuction(nowMs = Date.now()) {
  const now = Number(nowMs) || Date.now();
  // Repli solo UNIQUEMENT si le socket est coupé (pas en gate calme :
  // le heartbeat serveur 60 s garde lastSeen frais tant qu'on est branché).
  let online = true;
  try {
    online = netConnected();
  } catch {
    online = true;
  }
  if (sharedActive === true && online !== true && now - lastSeen > STALE_MS) {
    sharedActive = false;
    sharedCycle = 0;
    pending.clear();
    try {
      setSharedAuctionMode(false);
    } catch {}
    return { shared: false, dirty: true, profileDirty: false, events: [{ type: "toast", text: "Enchères hors ligne : retour en solo." }] };
  }
  let inbox = [];
  try {
    inbox = drainNetAuctionInbox();
  } catch {
    inbox = [];
  }
  if (!inbox.length) return { shared: sharedActive, dirty: false, profileDirty: false, events: [] };
  const events = [];
  let profileDirty = false;
  let hadSync = false;
  for (const msg of inbox) {
    if (!msg || typeof msg !== "object") continue;
    try {
      if (msg.t === "auctionSync") {
        hadSync = true;
        for (const ev of applySync(msg, now).events || []) events.push(ev);
      } else if (msg.t === "auctionUpdate") {
        for (const ev of applyUpdate(msg, now).events || []) events.push(ev);
      } else if (msg.t === "auctionSettle") {
        const res = applySettle(msg);
        for (const ev of res.events || []) events.push(ev);
        if (res.profileDirty) profileDirty = true;
      } else if (msg.t === "auctionBidReject") {
        for (const ev of applyReject(msg).events || []) events.push(ev);
      }
    } catch {}
  }
  void hadSync;
  const wasDirty = dirty;
  // Tout changement d'enchères (mise rivale, remboursement, rejet, settle)
  // touche crédits et/ou historique : le moteur doit resync le profil
  // (sinon la sauvegarde périodique réécrase le remboursement).
  if (wasDirty) profileDirty = true;
  return { shared: sharedActive, dirty: wasDirty, profileDirty, events };
}

// Mise en ligne (montant total). Réserve optimiste + envoi serveur.
export function placeSharedBid(lotId, amount) {
  if (sharedActive !== true) return { ok: false, error: "Hors ligne (serveur injoignable)." };
  if (!netIsAuthed()) return { ok: false, error: "Connecte-toi pour miser en ligne." };
  const u = getCurrentUserForMutation();
  if (!u) return { ok: false, error: "Aucun utilisateur connecté." };
  const lots = Array.isArray(u.auction?.lots) ? u.auction.lots : [];
  const lot = lots.find((entry) => String(entry?.id) === String(lotId));
  if (!lot) return { ok: false, error: "Lot introuvable." };
  const key = String(lot.catalogId || "");
  if (!key || isLotMaskedForUser(lot, u)) return { ok: false, error: "Lot indisponible." };
  const awaiting = pending.get(key);
  if (awaiting && Date.now() - Number(awaiting.at || 0) < PENDING_HOLD_MS) {
    return { ok: false, error: "Ta précédente mise attend la confirmation du serveur." };
  }
  if (Math.max(0, Number(lot.endsAt) || 0) <= Date.now()) return { ok: false, error: "Enchère terminée." };
  const bid = Math.max(0, Math.floor(Number(amount) || 0));
  const minimum = auctionMinNextBid(lot);
  if (bid < minimum) return { ok: false, error: `Mise minimale : ${minimum.toLocaleString("fr-FR")} crédits.` };
  const prevMyBid = Math.max(0, Math.floor(Number(lot.myBid) || 0));
  const avail = Math.max(0, Math.floor(Number(u.credits || 0))) + prevMyBid;
  if (avail < bid) return { ok: false, error: "Crédits insuffisants." };
  u.credits = avail - bid;
  lot.myBid = bid;
  lot.topBid = bid;
  lot.topBidder = "you";
  lot.bids = Math.max(0, Math.floor(Number(lot.bids) || 0)) + 1;
  pending.set(key, { prev: prevMyBid, amount: bid, at: Date.now() });
  try {
    saveUser(u);
  } catch {}
  let sent = false;
  try {
    sent = sendAuctionBid(key, bid);
  } catch {
    sent = false;
  }
  if (!sent) {
    pending.delete(key);
    lot.myBid = prevMyBid;
    u.credits = avail - prevMyBid;
    try {
      saveUser(u);
    } catch {}
    return { ok: false, error: "Envoi impossible (déconnecté)." };
  }
  dirty = true;
  return { ok: true, bid, key };
}
