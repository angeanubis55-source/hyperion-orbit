// SCRIPTS/AUCTION_ROOM.js — Enchères PARTAGÉES (comme le tchat global).
// Lots canoniques identiques pour tous (même heure pile de Paris),
// mises en temps réel avec pseudos, règlement à :00.
// Persistance : SERVER_DATA/auction_state.json (mises du cycle en cours).
// Les crédits restent gérés côté client (comme avant) ; le serveur tranche
// l'ordre des mises (montant mini + horodatage) et désigne le gagnant.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import {
  AUCTION_ACTIVE_LOTS,
  auctionMinNextBid,
  buildHourlyLots,
  parisHourEndMs,
  parisHourSeed,
} from "../SRC/DATA/AUCTION.js";
import { CATALOG } from "../SRC/CORE/CATALOG.js";

const STATE_FILE = process.env.ORBIT_AUCTION_FILE || "SERVER_DATA/auction_state.json";
const MAX_BID = 1000000000000; // 1e12 : garde-fou montants absurdes
const RECENT_KEPT = 8; // mises mémorisées par lot ("qui a parié")
const RECENT_SENT = 5; // pseudos récents envoyés aux clients
const BID_THROTTLE_MS = 800; // 1 mise / 800 ms / joueur (comme le tchat)
const BID_MINUTE_MAX = 60; // 60 mises / min / joueur

let cycle = 0;
let lotsMeta = []; // [{ key, catalogId, name, icon, shopPrice, qty, packQty, kind, droneType, formationId, ammoGive, rocketsGive, resourcesGive, noDiscount, startPrice, endsAt }]
let bids = new Map(); // key -> { topBid, topBidder, topBidderId, bids, recent: [{ pseudo, amount, at }] }
const throttle = new Map(); // bidderId -> { last, stamps: [ms] }

function lotKeyOf(lot) {
  return String(lot?.catalogId || "");
}

function buildCycle(now) {
  const seed = parisHourSeed(now);
  const endsAt = parisHourEndMs(now);
  const fresh = buildHourlyLots(CATALOG, {}, now).slice(0, AUCTION_ACTIVE_LOTS);
  lotsMeta = fresh.map((lot) => ({
    key: lotKeyOf(lot),
    catalogId: String(lot.catalogId || ""),
    name: String(lot.name || lot.catalogId || "Lot"),
    icon: String(lot.icon || ""),
    shopPrice: Math.max(1, Math.floor(Number(lot.shopPrice) || 0)),
    qty: Math.max(1, Math.floor(Number(lot.qty) || 1)),
    packQty: Math.max(0, Math.floor(Number(lot.packQty) || 0)),
    kind: String(lot.kind || "catalog"),
    droneType: String(lot.droneType || ""),
    formationId: String(lot.formationId || ""),
    ammoGive: lot.ammoGive && typeof lot.ammoGive === "object" ? { ...lot.ammoGive } : null,
    rocketsGive: lot.rocketsGive && typeof lot.rocketsGive === "object" ? { ...lot.rocketsGive } : null,
    resourcesGive: lot.resourcesGive && typeof lot.resourcesGive === "object" ? { ...lot.resourcesGive } : null,
    noDiscount: lot.noDiscount === true,
    startPrice: Math.max(1, Math.floor(Number(lot.startPrice) || 0)),
    endsAt,
  }));
  cycle = seed;
  bids = new Map();
  for (const m of lotsMeta) {
    bids.set(m.key, { topBid: 0, topBidder: "", topBidderId: "", bids: 0, recent: [] });
  }
}

function persist() {
  try {
    mkdirSync(dirname(STATE_FILE), { recursive: true });
    const data = { cycle, bids: {} };
    for (const [key, b] of bids) {
      data.bids[key] = {
        topBid: b.topBid, topBidder: b.topBidder, topBidderId: b.topBidderId,
        bids: b.bids, recent: b.recent.slice(-RECENT_KEPT),
      };
    }
    writeFileSync(STATE_FILE, JSON.stringify(data), "utf8");
  } catch {}
}

function restore(now) {
  buildCycle(now);
  try {
    const raw = JSON.parse(readFileSync(STATE_FILE, "utf8") || "{}");
    if (Math.floor(Number(raw?.cycle) || 0) !== cycle) return;
    const saved = raw?.bids;
    if (!saved || typeof saved !== "object") return;
    for (const [key, b] of Object.entries(saved)) {
      const cur = bids.get(String(key));
      if (!cur || !b || typeof b !== "object") continue;
      const topBid = Math.max(0, Math.min(MAX_BID, Math.floor(Number(b.topBid) || 0)));
      if (topBid <= 0) continue;
      cur.topBid = topBid;
      cur.topBidder = String(b.topBidder || "Pilote").slice(0, 20);
      cur.topBidderId = String(b.topBidderId || "").slice(0, 64);
      cur.bids = Math.max(1, Math.floor(Number(b.bids) || 1));
      cur.recent = Array.isArray(b.recent) ? b.recent.filter((r) => r && typeof r === "object").slice(-RECENT_KEPT).map((r) => ({
        pseudo: String(r.pseudo || "Pilote").slice(0, 20),
        amount: Math.max(0, Math.min(MAX_BID, Math.floor(Number(r.amount) || 0))),
        at: Math.max(0, Number(r.at) || 0),
      })) : [];
    }
  } catch {}
}

function serializeLot(meta) {
  const b = bids.get(meta.key) || { topBid: 0, topBidder: "", topBidderId: "", bids: 0, recent: [] };
  return {
    ...meta,
    topBid: b.topBid,
    topBidder: b.topBidder,
    topBidderId: b.topBidderId,
    bids: b.bids,
    recent: b.recent.slice(-RECENT_SENT),
  };
}

// Etat complet pour un nouveau venu (comme chatHistory).
export function getAuctionSync(nowMs = Date.now()) {
  const now = Number(nowMs) || Date.now();
  if (cycle !== parisHourSeed(now)) restore(now);
  return {
    t: "auctionSync",
    cycle,
    endsAt: parisHourEndMs(now),
    lots: lotsMeta.map(serializeLot),
  };
}

// Mise : compte authentifié uniquement (identité stable, anti-usurpation).
// Retourne { status: "ok", update } ou { status: "reject", reason, lot }.
export function handleAuctionBid({ key, amount }, { id, pseudo, authed }, nowMs = Date.now()) {
  const now = Number(nowMs) || Date.now();
  if (cycle !== parisHourSeed(now)) restore(now);
  const k = String(key || "").slice(0, 64);
  const meta = lotsMeta.find((l) => l.key === k);
  if (!meta) return { status: "reject", reason: "Lot introuvable.", lot: null };
  if (now >= Number(meta.endsAt) || 0) return { status: "reject", reason: "Enchère terminée.", lot: serializeLot(meta) };
  if (authed !== true || !String(id || "").startsWith("u_")) {
    return { status: "reject", reason: "Connecte-toi pour miser en ligne.", lot: serializeLot(meta) };
  }
  const bidderId = String(id).slice(0, 64);
  const who = String(pseudo || "Pilote").slice(0, 20);
  // Anti-spam (comme le tchat).
  const th = throttle.get(bidderId) || { last: 0, stamps: [] };
  th.stamps = th.stamps.filter((s) => now - s < 60000);
  if (now - th.last < BID_THROTTLE_MS || th.stamps.length >= BID_MINUTE_MAX) {
    throttle.set(bidderId, th);
    return { status: "reject", reason: "Doucement sur les mises…", lot: serializeLot(meta) };
  }
  const bid = Math.max(0, Math.floor(Number(amount) || 0));
  const b = bids.get(k);
  const minimum = auctionMinNextBid({ topBid: b.topBid, startPrice: meta.startPrice });
  if (!(bid >= minimum)) {
    throttle.set(bidderId, th);
    return { status: "reject", reason: `Mise minimale : ${minimum.toLocaleString("fr-FR")} crédits.`, lot: serializeLot(meta) };
  }
  if (bid > MAX_BID) {
    throttle.set(bidderId, th);
    return { status: "reject", reason: "Montant refusé.", lot: serializeLot(meta) };
  }
  th.last = now;
  th.stamps.push(now);
  throttle.set(bidderId, th);
  b.topBid = bid;
  b.topBidder = who;
  b.topBidderId = bidderId;
  b.bids += 1;
  b.recent.push({ pseudo: who, amount: bid, at: now });
  if (b.recent.length > RECENT_KEPT) b.recent.splice(0, b.recent.length - RECENT_KEPT);
  persist();
  return { status: "ok", update: { t: "auctionUpdate", lot: serializeLot(meta) } };
}

// A appeler périodiquement : clôt le cycle à :00 pile (gagnants)
// puis ouvre le suivant. Retourne null ou { settle, sync }.
export function pollAuctionCycle(nowMs = Date.now()) {
  const now = Number(nowMs) || Date.now();
  if (cycle === 0) restore(now);
  if (cycle === parisHourSeed(now)) return null;
  const results = lotsMeta.map((meta) => {
    const b = bids.get(meta.key) || { topBid: 0, topBidder: "", topBidderId: "", bids: 0 };
    return {
      key: meta.key,
      name: meta.name,
      winner: b.topBid > 0 ? b.topBidder : "",
      winnerId: b.topBid > 0 ? b.topBidderId : "",
      amount: b.topBid,
      bids: b.bids,
    };
  });
  const oldCycle = cycle;
  // Commit le rollover AVANT de reconstruire : si buildCycle leve (lot
  // corrompu...), on ne doit JAMAIS re-diffuser le meme settle au poll
  // suivant (= double attribution des gains chez les gagnants).
  cycle = parisHourSeed(now);
  try {
    buildCycle(now);
  } catch (err) {
    try { console.warn("[multi:auction] buildCycle en echec, lots vides pour ce cycle :", err?.message || err); } catch {}
    try {
      lotsMeta = [];
      bids = new Map();
      cycle = parisHourSeed(now);
    } catch {}
  }
  persist();
  return {
    settle: { t: "auctionSettle", cycle: oldCycle, results },
    sync: getAuctionSync(now),
  };
}

export function auctionRoomStatus() {
  let withBids = 0;
  for (const b of bids.values()) if (b.topBid > 0) withBids++;
  return { cycle, lots: lotsMeta.length, withBids };
}
