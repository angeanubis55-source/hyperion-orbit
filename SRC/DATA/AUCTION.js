"use strict";

// SRC/DATA/AUCTION.js — Enchères façon DarkOrbit (données + règles pures).
// Lots FIXES chaque heure pile de Paris (Europe/Paris, reset à :00),
// pas de roulement aléatoire, dans cet ordre :
//   1-3. munitions x2 / x3 / x4 (pack 1000)
//   4. munition x6 (pack 250)
//   5. bouclier SG3N-B02
//   6. générateur G3N-7900
//   7-10. lasers LF-2 / LF-3 / LF-4 / LF-5
//   11. drone Iris (masqué si 8 possédés)
//   12-13. roquettes PLT-3030 / PLT-2021 (x100 chacune)
//   14-17. boosters B01 x10 (10 h) : Expérience / Dégâts / Coque / Bouclier
//   18-20. vaisseaux Goliath / Vengeance / Leonov (masqués si possédés)
//   21. 1 design aléatoire par heure, déterministe (même pour tous)
//   22. 1 ticket relance module, 25 M SANS décote (toujours dernier)
// Mise de départ à -70 % du prix boutique. Pas d'enchérisseurs fantômes :
// la mise est réservée aussitôt, le plus offrant (joueur ou personne) clôt
// le lot. L'orchestration (crédits, gains) vit dans ACCOUNT.js ; ce module
// ne touche ni DOM ni stockage.

export const AUCTION_DURATION_MS = 60 * 60 * 1000; // un cycle = 1 heure pile de Paris
export const AUCTION_ACTIVE_LOTS = 22;
// Historique "Dernières enchères" : 1 cycle complet (22 lots).
export const AUCTION_HISTORY_LEN = 22;
// Fuseau du cycle : réinitialisation à chaque heure pile de Paris (:00).
export const AUCTION_TZ = "Europe/Paris";

const parisWallFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: AUCTION_TZ,
  year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit",
  hourCycle: "h23",
});

// Décalage Paris <-> UTC (ms) à un instant donné (gère été/hiver).
function parisOffsetMs(dateMs) {
  const parts = {};
  for (const p of parisWallFmt.formatToParts(new Date(dateMs))) {
    if (p.type !== "literal") parts[p.type] = p.value;
  }
  const asUTC = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour), Number(parts.minute), Number(parts.second),
  );
  return asUTC - dateMs;
}

// Début de l'heure de Paris en cours (epoch ms).
export function parisHourStartMs(nowMs = Date.now()) {
  const now = Number(nowMs) || Date.now();
  const wall = now + parisOffsetMs(now);
  const wallHour = Math.floor(wall / AUCTION_DURATION_MS) * AUCTION_DURATION_MS;
  // Reconversion heure mur -> epoch (2 itérations pour les bords DST).
  let epoch = wallHour - parisOffsetMs(now);
  epoch = wallHour - parisOffsetMs(epoch);
  return epoch;
}

// Fin de l'heure de Paris en cours = fin du cycle (lots + timer).
export function parisHourEndMs(nowMs = Date.now()) {
  return parisHourStartMs(nowMs) + AUCTION_DURATION_MS;
}

// Graine du design horaire (change à chaque heure pile de Paris).
export function parisHourSeed(nowMs = Date.now()) {
  return Math.floor(parisHourStartMs(nowMs) / AUCTION_DURATION_MS);
}
// Version du cycle : bumpée à chaque changement de la liste fixe.
// Les sauvegardes avec une autre version voient leurs lots purgés
// (avec remboursement des mises réservées) puis reconstruits en fixe.
export const AUCTION_CYCLE_VERSION = 8;

// Prix de départ : -70 % (30 % du prix).
export const AUCTION_START_RATIO = 0.3;

// Conservés pour compat (plus de roulement, mais d'autres modules les importent).
export const AUCTION_EXCLUDED_BOOSTERS = Object.freeze(["ephon", "mul"]);
export const AUCTION_EXCLUDED_LASERS = Object.freeze(["laser_lf5mf", "laser_osl", "laser_prl"]);
export const AUCTION_RESOURCE_OFFERS = Object.freeze([]);
export const AUCTION_PETFUEL_QTY = 250;
export const AUCTION_BOOSTER_QTY = 10;

// Pack custom : 250x RSB-75 (x6) au lieu du pack boutique de 1000.
export const AUCTION_X6_QTY = 250;
// Boosters B01 : x10 = 10 h cumulées au gain.
export const AUCTION_B01_HOURS = 10;

function rand(rng) {
  return typeof rng === "function" ? rng() : Math.random();
}

// PRNG déterministe (mulberry32) : même graine = même tirage.
// Sert au design horaire (identique pour tous, stable entre les ticks).
function mulberry32(seed) {
  let a = Math.max(0, Math.floor(Number(seed) || 0)) >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function auctionStartPrice(shopTotal) {
  return Math.max(500, Math.round(Math.max(0, Number(shopTotal) || 0) * AUCTION_START_RATIO));
}

export function createAuctionLot(spec, nowMs = Date.now(), rng = null) {
  const now = Number(nowMs) || Date.now();
  const shopTotal = Math.max(1, Math.floor(Number(spec?.shopTotal) || 0));
  return {
    id: `auc_${now.toString(36)}_${Math.floor(rand(rng) * 0xffffffff).toString(36)}`,
    catalogId: String(spec?.catalogId || ""),
    name: String(spec?.name || spec?.catalogId || "Lot"),
    icon: String(spec?.icon || ""),
    shopPrice: shopTotal,
    qty: Math.max(1, Math.floor(Number(spec?.qty) || 1)),
    packQty: Math.max(0, Math.floor(Number(spec?.packQty) || 0)),
    kind: String(spec?.kind || "catalog"),
    exclusive: spec?.exclusive === true,
    formationId: spec?.formationId ? String(spec.formationId) : "",
    droneType: spec?.droneType ? String(spec.droneType) : "",
    resourcesGive: spec?.resourcesGive && typeof spec.resourcesGive === "object" ? { ...spec.resourcesGive } : null,
    ammoGive: spec?.ammoGive && typeof spec.ammoGive === "object" ? { ...spec.ammoGive } : null,
    rocketsGive: spec?.rocketsGive && typeof spec.rocketsGive === "object" ? { ...spec.rocketsGive } : null,
    noDiscount: spec?.noDiscount === true,
    // noDiscount (ticket) : départ = prix de base, sans les -70 %.
    startPrice: spec?.noDiscount === true ? shopTotal : auctionStartPrice(shopTotal),
    createdAt: now,
    // Fin calée sur l'heure pile de Paris (pas now + 1 h glissante).
    endsAt: parisHourEndMs(now),
    topBid: 0,
    topBidder: "",
    myBid: 0,
    bids: 0,
  };
}

function findInCatalog(catalog, id) {
  if (!catalog || typeof catalog !== "object") return null;
  for (const cat of Object.values(catalog)) {
    if (!Array.isArray(cat)) continue;
    const hit = cat.find((entry) => entry?.id === id);
    if (hit) return hit;
  }
  return null;
}

// Lots fixes de l'heure, dans l'ordre demandé. Les items déjà possédés
// sont masqués (vaisseaux possédés, design possédé, Iris si 8/8).
// filters: { ownedShips:Set, ownedDesigns:Set, droneCounts:{iris} }
export function buildHourlyLots(catalog, filters = {}, nowMs = Date.now(), rng = null) {
  const now = Number(nowMs) || Date.now();
  const lots = [];
  const ownedShips = filters.ownedShips instanceof Set ? filters.ownedShips : new Set();
  const ownedDesigns = filters.ownedDesigns instanceof Set ? filters.ownedDesigns : new Set();
  const irisOwned = Math.max(0, Math.floor(Number(filters.droneCounts?.iris) || 0));

  const pushCatalog = (id, qty = 1, opts = {}) => {
    const item = findInCatalog(catalog, id);
    if (!item) return null;
    const lot = createAuctionLot(
      { catalogId: item.id, name: item.name || item.id, icon: item.icon || "", shopTotal: Number(item.price || 0) * qty, qty, kind: "catalog", noDiscount: opts?.noDiscount === true },
      now, rng,
    );
    if (item.give?.ammo) lot.packQty = Math.max(1, Math.floor(Number(Object.values(item.give.ammo)[0]) || 0)) * qty;
    else if (item.give?.rockets) {
      lot.packQty = Math.max(1, Math.floor(Number(Object.values(item.give.rockets)[0]) || 0)) * qty;
      // Le nom catalogue contient déjà "×10" ("Roquette PLT-3030 ×10") :
      // on le retire pour éviter l'affichage doublé "×10 ×100".
      lot.name = String(lot.name).replace(/\s*×\s*\d+\s*$/, "");
    }
    lots.push(lot);
    return lot;
  };

  // 1-3. Munitions x2 / x3 / x4 (pack boutique 1000).
  pushCatalog("ammo_x2");
  pushCatalog("ammo_x3");
  pushCatalog("ammo_x4");

  // 4. Munition x6 : pack custom de 250 (prix au prorata du pack 1000).
  {
    const item = findInCatalog(catalog, "ammo_x6");
    if (item) {
      const packFull = Math.max(1, Math.floor(Number(Object.values(item.give?.ammo || {})[0]) || 1000));
      const shopTotal = Math.max(1, Math.round((Number(item.price) || 0) * (AUCTION_X6_QTY / packFull)));
      lots.push(createAuctionLot(
        {
          catalogId: item.id, name: item.name || "RSB-75", icon: item.icon || "",
          shopTotal, qty: 1, packQty: AUCTION_X6_QTY, kind: "ammo_custom",
          ammoGive: { x6: AUCTION_X6_QTY },
        },
        now, rng,
      ));
    }
  }

  // 5. Bouclier B02 + 6. Générateur G3N-7900.
  pushCatalog("shd_sg3nb02");
  pushCatalog("spd_g3n7900");

  // 7-10. Lasers LF-2 / LF-3 / LF-4 / LF-5.
  pushCatalog("laser_lf2");
  pushCatalog("laser_lf3");
  pushCatalog("laser_lf4");
  pushCatalog("laser_lf5");

  // 11. Iris (masqué si 8 possédés).
  if (irisOwned < 8) {
    const iris = findInCatalog(catalog, "drone_iris");
    if (iris) {
      lots.push(createAuctionLot(
        { catalogId: iris.id, name: iris.name || "Drone Iris", icon: iris.icon || "", shopTotal: Number(iris.price) || 0, qty: 1, kind: "drone", droneType: "iris" },
        now, rng,
      ));
    }
  }

  // 12-13. Roquettes PLT-3030 / PLT-2021 : x100 chacune (10 packs boutique).
  pushCatalog("rocket_plt3030", 10);
  pushCatalog("rocket_plt2021", 10);

  // 14-17. Boosters B01 x10 (= 10 h) : Expérience / Dégâts / Coque / Bouclier.
  pushCatalog("booster_ep", AUCTION_B01_HOURS);
  pushCatalog("booster_dmg", AUCTION_B01_HOURS);
  pushCatalog("booster_hp", AUCTION_B01_HOURS);
  pushCatalog("booster_shd", AUCTION_B01_HOURS);

  // 18-20. Vaisseaux Goliath / Vengeance / Leonov (masqués si possédés).
  for (const shipId of ["goliath", "vengeance", "leonov"]) {
    if (ownedShips.has(shipId)) continue;
    pushCatalog(`ship_${shipId}`);
  }

  // 21. 1 design aléatoire par heure de Paris, DÉTERMINISTE
  // (graine = heure pile de Paris) : stable entre les ticks et les refresh
  // (pas d'accumulation). Les designs déjà possédés sont masqués.
  {
    const pool = Array.isArray(catalog?.designs)
      ? catalog.designs.filter((d) => d?.id && !ownedDesigns.has(String(d.design?.id || d.id)))
      : [];
    if (pool.length) {
      const pick = mulberry32(parisHourSeed(now));
      const item = pool[Math.floor(pick() * pool.length) % pool.length];
      pushCatalog(item.id);
    }
  }

  // 22. Ticket relance module (25 M, SANS les -70 %).
  pushCatalog("ticket_module_reroll", 1, { noDiscount: true });

  return lots.slice(0, AUCTION_ACTIVE_LOTS);
}

// Enchère suivante minimale : prix de départ sans mise, sinon +2 % (plancher +1000).
export function auctionMinNextBid(lot) {
  const top = Math.max(0, Math.floor(Number(lot?.topBid) || 0));
  if (top <= 0) return Math.max(1, Math.floor(Number(lot?.startPrice) || 0));
  return Math.max(top + 1000, Math.ceil(top * 1.02));
}

export function auctionTimeLeftMs(lot, nowMs = Date.now()) {
  return Math.max(0, Number(lot?.endsAt) - (Number(nowMs) || Date.now()));
}

export function normalizeAuctionState(raw) {
  const base = { v: Math.max(0, Math.floor(Number(raw?.v) || 0)), lots: [], history: [] };
  if (!raw || typeof raw !== "object") return base;
  if (Array.isArray(raw.lots)) {
    for (const lot of raw.lots.slice(0, AUCTION_ACTIVE_LOTS)) {
      if (!lot || typeof lot !== "object" || typeof lot.catalogId !== "string") continue;
      base.lots.push({
        id: String(lot.id || ""),
        catalogId: String(lot.catalogId),
        name: String(lot.name || lot.catalogId),
        icon: String(lot.icon || ""),
        shopPrice: Math.max(1, Math.floor(Number(lot.shopPrice) || 0)),
        qty: Math.max(1, Math.floor(Number(lot.qty) || 1)),
        packQty: Math.max(0, Math.floor(Number(lot.packQty) || 0)),
        kind: String(lot.kind || "catalog"),
        exclusive: lot.exclusive === true,
        formationId: String(lot.formationId || ""),
        droneType: String(lot.droneType || ""),
        resourcesGive: lot.resourcesGive && typeof lot.resourcesGive === "object" ? { ...lot.resourcesGive } : null,
        ammoGive: lot.ammoGive && typeof lot.ammoGive === "object" ? { ...lot.ammoGive } : null,
        rocketsGive: lot.rocketsGive && typeof lot.rocketsGive === "object" ? { ...lot.rocketsGive } : null,
        noDiscount: lot.noDiscount === true,
        startPrice: Math.max(1, Math.floor(Number(lot.startPrice) || auctionStartPrice(lot.shopPrice))),
        createdAt: Math.max(0, Number(lot.createdAt) || 0),
        endsAt: Math.max(0, Number(lot.endsAt) || 0),
        topBid: Math.max(0, Math.floor(Number(lot.topBid) || 0)),
        topBidder: String(lot.topBidder || ""),
        myBid: Math.max(0, Math.floor(Number(lot.myBid) || 0)),
        bids: Math.max(0, Math.floor(Number(lot.bids) || 0)),
      });
    }
  }
  if (Array.isArray(raw.history)) {
    for (const h of raw.history.slice(-AUCTION_HISTORY_LEN)) {
      if (!h || typeof h !== "object") continue;
      base.history.push({
        name: String(h.name || ""),
        result: h.result === "won" ? "won" : (h.result === "expired" ? "expired" : "lost"),
        amount: Math.max(0, Math.floor(Number(h.amount) || 0)),
        at: Math.max(0, Number(h.at) || 0),
        by: String(h.by || ""),
      });
    }
  }
  return base;
}

export function formatAuctionCountdown(ms) {
  const s = Math.max(0, Math.ceil(Number(ms) / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${m}:${String(sec).padStart(2, "0")}`;
}
