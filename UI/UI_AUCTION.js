"use strict";

// UI/UI_AUCTION.js — Enchères façon DarkOrbit : lots fixes chaque heure,
// mise réservée aussitôt, remboursement si surenchère.
// Reçoit ses accès moteur par initAuctionUI() (pas de cycle d'import).

import {
  auctionMinNextBid,
  formatAuctionCountdown,
  normalizeAuctionState,
} from "../SRC/DATA/AUCTION.js";
import { getResourceIcon, getResourceName } from "../SRC/DATA/RESOURCES.js";
import { findCatalogItem } from "../SRC/CORE/CATALOG.js";
import { formatInteger } from "../SRC/CORE/NUMBER_FORMAT.js";
import { placeAuctionBid } from "../SRC/CORE/ACCOUNT.js";
import {
  auctionNetDirty,
  clearAuctionNetDirty,
  isLotMaskedForUser,
  isSharedAuction,
  placeSharedBid,
} from "../SRC/CORE/AUCTION_NET.js";
import { getShipPackById } from "../SHIP/SHIP_PACKS.js";
import {
  SHIP_ITEM_DIR,
  SHIP_ITEM_FULL_IDS,
  SHIP_ITEM_TRAIT_IDS,
  SHIP_TRAIT_DIR,
} from "../SHIP/SHIP_ITEMS.js";

let ctx = null;
let lastDynamicRefresh = 0;
let activeTab = "live";

const AUCTION_AMMO_ICONS = Object.freeze({
  ammo_x2: "/ASSETS/ITEMS/AMMO_X2.png",
  ammo_x3: "/ASSETS/ITEMS/AMMO_X3.png",
  ammo_x4: "/ASSETS/ITEMS/AMMO_X4.png",
  ammo_x6: "/ASSETS/ITEMS/AMMO_X6.png",
  ammo_sab: "/ASSETS/ITEMS/AMMO_SAB.png",
  ammo_rcb: "/ASSETS/ITEMS/AMMO_RCB.png",
  ammo_cbo: "/ASSETS/ITEMS/AMMO_CBO.png",
  ammo_job: "/ASSETS/ITEMS/AMMO_JOB.png",
  ammo_rb: "/ASSETS/ITEMS/AMMO_RB.png",
  ammo_pib: "/ASSETS/ITEMS/AMMO_PIB.png",
  ammo_idb: "/ASSETS/ITEMS/AMMO_IDB.png",
  ammo_vb: "/ASSETS/ITEMS/AMMO_VB.png",
  ammo_emaa: "/ASSETS/ITEMS/AMMO_EMAA.png",
  ammo_sbl: "/ASSETS/ITEMS/AMMO_SBL.png",
  ammo_abl: "/ASSETS/ITEMS/AMMO_ABL.png",
});

const AUCTION_FALLBACK_ICON = "/ASSETS/ITEMS/G3N-1010.png";

// Designs sans image items : fichier sprite imposé (même règle que la boutique).
const SHIP_PREVIEW_FILE_OVERRIDES = Object.freeze({
  goliath_crimson: 20,
});

// Image 100x100 d'un vaisseau/design (même résolution que boutique + hangars).
function shipAuctionSrc(shipId, frameIndex = 28) {
  let pack = null;
  try {
    pack = getShipPackById(shipId);
  } catch {
    pack = null;
  }
  const key = pack?.id || shipId;
  const forcedFile = SHIP_PREVIEW_FILE_OVERRIDES[String(key || "").toLowerCase()];
  if (forcedFile == null) {
    if (key && SHIP_ITEM_FULL_IDS.has(String(key))) return `${SHIP_ITEM_DIR}${key}.png`;
    if (key && SHIP_ITEM_TRAIT_IDS.has(String(key))) return `${SHIP_TRAIT_DIR}${key}.png`;
  }
  if (!pack) return "";
  const frames = Number(pack.frames || 1);
  const idx = ((frameIndex % frames) + frames) % frames;
  const first = Number(pack.firstNumber || 1);
  const ext = pack.ext || ".png";
  const base = String(pack.path || "");
  const absBase = base.startsWith("/") ? base : `/${base}`;
  const fileNo = forcedFile ?? (first + idx);
  return `${absBase}${fileNo}${ext}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

function els() {
  return {
    root: document.getElementById("auctionWindow"),
    list: document.getElementById("auctionList"),
    history: document.getElementById("auctionHistory"),
    credits: document.getElementById("auctionCredits"),
    timer: document.getElementById("auctionTimer"),
  };
}

// Timer à côté du bouton réduire (barre de titre), pas dans le corps.
// Idempotent : replacé à chaque tick au cas où la barre est (re)créée après.
function placeAuctionTimer() {
  const { root, timer } = els();
  if (!root || !timer) return;
  const bar = root.querySelector(":scope > .gameWinBar");
  if (!bar) return;
  const minBtn = bar.querySelector(":scope > .gameWinMinBtn");
  const anchor = minBtn || null;
  if (timer.parentElement === bar && (anchor ? timer.nextElementSibling === anchor : timer.parentElement.lastElementChild === timer)) return;
  try {
    if (anchor) bar.insertBefore(timer, anchor);
    else bar.appendChild(timer);
  } catch {}
}

// Timer restant du cycle (temps avant la fin des lots), affiché en doré.
function refreshAuctionTimer() {
  try { placeAuctionTimer(); } catch {}
  const { timer } = els();
  if (!timer) return;
  let auction = null;
  try {
    auction = liveAuction();
  } catch {
    auction = null;
  }
  const lots = Array.isArray(auction?.lots) ? auction.lots : [];
  let next = "—";
  if (lots.length) {
    const now = Date.now();
    let minLeft = Infinity;
    for (const lot of lots) {
      const left = Number(lot?.endsAt) - now;
      if (Number.isFinite(left) && left < minLeft) minLeft = left;
    }
    if (minLeft !== Infinity) next = formatAuctionCountdown(Math.max(0, minLeft));
  }
  if (timer.textContent !== next) timer.textContent = next;
}

// Libellé du plus offrant : "Pseudo a placé la meilleure offre"
// ("Pseudo (toi)..." si c'est toi). Une seule ligne, même à 52 miseurs.
function bidderLabel(lot, pseudo) {
  const hasBid = Number(lot?.topBid) > 0;
  if (!hasBid) return "Aucune enchère pour le moment";
  const who = lot?.topBidder === "you" ? `${pseudo} (toi)` : (lot?.topBidder || "Enchère");
  return `${who} a placé la meilleure offre`;
}

function liveAuction() {
  let user = null;
  try {
    user = ctx?.getUser?.();
  } catch {
    return null;
  }
  if (!user) return null;
  user.auction = normalizeAuctionState(user.auction);
  return user.auction;
}

// Quantité du pack (munitions, roquettes) : stockée ou résolue via le catalogue.
function lotPackQty(lot) {
  if (Number(lot?.packQty) > 0) return Math.floor(Number(lot.packQty));
  try {
    const item = findCatalogItem(lot?.catalogId);
    const fromGive = item?.give?.ammo || item?.give?.rockets || null;
    if (fromGive && typeof fromGive === "object") {
      const v = Math.floor(Number(Object.values(fromGive)[0]) || 0);
      if (v > 0) return v;
    }
  } catch {}
  return 0;
}

function lotIcon(lot) {
  // Ticket relance : image trinitytoken (même pour les anciens lots).
  if (String(lot?.catalogId || "") === "ticket_module_reroll") return "/ASSETS/ITEMS/TICKET_MODULE_REROLL.png";
  // Ressources : vraie icône d'inventaire via l'id canonique.
  if (lot?.kind === "resources" && lot.resourcesGive && typeof lot.resourcesGive === "object") {
    const key = Object.keys(lot.resourcesGive)[0];
    if (key) return getResourceIcon(key);
  }
  if (lot?.icon) return lot.icon;
  // Vaisseaux / designs : vraie image du vaisseau via le catalogue.
  try {
    const item = findCatalogItem(lot?.catalogId);
    const shipId = item?.ship?.id || item?.design?.id || "";
    if (shipId) {
      const src = shipAuctionSrc(shipId);
      if (src) return src;
    }
  } catch {}
  if (lot?.catalogId && AUCTION_AMMO_ICONS[lot.catalogId]) return AUCTION_AMMO_ICONS[lot.catalogId];
  if (String(lot?.catalogId || "").startsWith("rocket_")) {
    const rid = String(lot.catalogId).slice("rocket_".length).toUpperCase().replace(/^R-?/, "R-");
    return `/COMBAT/ROCKET_SPRITES/${rid}_100X100.png`;
  }
  return AUCTION_FALLBACK_ICON;
}

export function renderAuctionWindow() {
  const { root, list, history, credits } = els();
  try { refreshAuctionTimer(); } catch {}
  if (!root || !list) return;
  const auction = liveAuction();
  if (!auction) return;
  let user = null;
  try {
    user = ctx?.getUser?.();
  } catch {
    user = null;
  }
  let shared = false;
  try {
    shared = isSharedAuction();
  } catch {
    shared = false;
  }
  const now = Date.now();
  const saved = {};
  for (const input of list.querySelectorAll("input[data-auction-bid]")) {
    saved[input.dataset.auctionBid] = input.value;
  }
  if (credits) {
    const next = `${formatInteger(Math.max(0, Math.floor(Number(user?.credits) || 0)))} crédits`;
    if (credits.textContent !== next) credits.textContent = next;
  }
  const lots = [...(auction.lots || [])]
    .filter((lot) => {
      // Enchères partagées : masque localement les déjà-possédés
      // (comme les filtres solo).
      try {
        if (shared && isLotMaskedForUser(lot, user)) return false;
      } catch {}
      return true;
    })
    .sort((a, b) => Number(a?.endsAt) - Number(b?.endsAt));
  if (!lots.length) {
    list.innerHTML = `<div class="auctionEmpty">Prochain cycle dans quelques instants.</div>`;
  } else {
    const pseudo = String(user?.pseudo || "Joueur");
    list.innerHTML = lots.map((lot) => {
      const leading = lot.topBidder === "you" && Number(lot.myBid) > 0;
      const minimum = auctionMinNextBid(lot);
      const current = Number(lot.topBid) > 0 ? Number(lot.topBid) : Number(lot.startPrice) || 0;
      // Ressources : vrai nom français (même pour les lots déjà générés).
      let displayName = lot.name;
      if (lot.kind === "resources" && lot.resourcesGive && typeof lot.resourcesGive === "object") {
        const entries = Object.entries(lot.resourcesGive);
        if (entries.length) displayName = getResourceName(entries[0][0], Number(entries[0][1]) || 1);
      }
      const displayQty = lotPackQty(lot) > 0 ? lotPackQty(lot) : (Number(lot.qty) > 1 ? Number(lot.qty) : 0);
      const bidder = bidderLabel(lot, pseudo);
      const bidderCls = Number(lot.topBid) > 0 ? ` class="auctionRecent"` : "";
      return `<div class="auctionRow${leading ? " leading" : ""}" data-auction-lot="${escapeHtml(lot.id)}">`
        + `<img src="${escapeHtml(lotIcon(lot))}" alt="" loading="lazy" draggable="false" onerror="this.onerror=null;this.src='${AUCTION_FALLBACK_ICON}'">`
        + `<span class="auctionMeta"><b>${escapeHtml(displayName)}${displayQty > 0 ? ` ×${formatInteger(displayQty)}` : ""}</b>`
        + `<small${bidderCls}>${escapeHtml(bidder)}</small></span>`
        + `<span class="auctionBid"><b>${formatInteger(current)}</b></span>`
        + `<span class="auctionAct"><input data-auction-bid="${escapeHtml(lot.id)}" type="number" min="${minimum}" step="100" inputmode="numeric" value="${escapeHtml(saved[lot.id] ?? "")}" placeholder="min ${formatInteger(minimum)}" aria-label="Mise pour ${escapeHtml(lot.name)}">`
        + `<button type="button" data-auction-place="${escapeHtml(lot.id)}">Enchérir</button></span></div>`;
    }).join("");
  }
  if (history) {
    // Même ordre que les enchères actuelles (ordre fixe des lots, ticket en dernier).
    const entries = [...(auction.history || [])];
    const histText = (h) => {
      const amountTxt = `${formatInteger(h.amount)} Crédits`;
      const who = h.by ? ` par "${escapeHtml(h.by)}"` : "";
      if (h.result === "won") return `Remporté${who} au prix de ${amountTxt}`;
      if (h.result === "lost") return `Perdu${who} au prix de ${amountTxt} (remboursé)`;
      return `Expiré — aucune enchère`;
    };
    history.innerHTML = entries.length
      ? entries.map((h) => `<div class="auctionHistRow ${h.result === "won" ? "won" : "lost"}"><b>${escapeHtml(h.name)}</b><span>${histText(h)}</span></div>`).join("")
      : `<div class="auctionEmpty">Aucune enchère terminée pour l'instant.</div>`;
  }
  for (const tab of root.querySelectorAll("[data-auction-tab]")) {
    tab.classList.toggle("active", tab.dataset.auctionTab === activeTab);
  }
  for (const page of root.querySelectorAll("[data-auction-page]")) {
    page.classList.toggle("active", page.dataset.auctionPage === activeTab);
  }
}

function refreshAuctionDynamic() {
  const { root } = els();
  if (!root || root.style.display === "none" || root.classList.contains("gameWinMinimized")) return;
  const auction = liveAuction();
  if (!auction) return;
  // Nouveau cycle ou règlement : re-rendu complet (champs préservés).
  const ids = new Set((auction.lots || []).map((lot) => String(lot?.id)));
  let changed = root.querySelectorAll("[data-auction-lot]").length !== (auction.lots || []).length;
  if (!changed) {
    for (const row of root.querySelectorAll("[data-auction-lot]")) {
      if (!ids.has(row.dataset.auctionLot)) {
        changed = true;
        break;
      }
    }
  }
  if (changed) {
    try { renderAuctionWindow(); } catch {}
  }
}

function onAuctionClick(event) {
  const tab = event.target instanceof Element ? event.target.closest("[data-auction-tab]") : null;
  if (tab) {
    activeTab = tab.dataset.auctionTab === "history" ? "history" : "live";
    try { renderAuctionWindow(); } catch {}
    return;
  }
  const btn = event.target instanceof Element ? event.target.closest("[data-auction-place]") : null;
  if (!btn) return;
  const { list } = els();
  const input = list?.querySelector(`input[data-auction-bid="${btn.dataset.auctionPlace || ""}"]`);
  let shared = false;
  try {
    shared = isSharedAuction();
  } catch {
    shared = false;
  }
  const res = shared
    ? placeSharedBid(btn.dataset.auctionPlace, Number(input?.value) || 0)
    : placeAuctionBid(btn.dataset.auctionPlace, Number(input?.value) || 0);
  if (!res?.ok) {
    ctx?.toast?.(res?.error || "Impossible.", 2.2);
    return;
  }
  ctx?.afterAction?.();
  try { renderAuctionWindow(); } catch {}
  ctx?.toast?.(`Mise placée : ${formatInteger(res.bid)} crédits.`, 1.8);
}

function onAuctionInput(event) {
  const input = event.target instanceof Element ? event.target.closest("input[data-auction-bid]") : null;
  if (!input) return;
  const clean = String(input.value || "").replace(/[^0-9]/g, "");
  if (clean !== input.value) input.value = clean;
}

function onAuctionKeydown(event) {
  if (event.key !== "Enter") return;
  const input = event.target instanceof Element ? event.target.closest("input[data-auction-bid]") : null;
  if (!input) return;
  const btn = els().list?.querySelector(`[data-auction-place="${input.dataset.auctionBid || ""}"]`);
  btn?.click();
}

// Patch live (1 s, panneau ouvert, partagé) : met à jour mises/pseudos
// ligne par ligne SANS reconstruire (scroll + saisies préservés).
// Retourne false si la structure a changé (re-rendu complet requis).
function refreshAuctionRowsInPlace(auction, user, shared) {
  const { list } = els();
  if (!list) return true;
  const pseudo = String(user?.pseudo || "Joueur");
  const lots = [...(auction?.lots || [])].filter((lot) => {
    try {
      if (shared && isLotMaskedForUser(lot, user)) return false;
    } catch {}
    return true;
  });
  for (const lot of lots) {
    let row = null;
    try {
      const sel = (typeof CSS !== "undefined" && CSS.escape)
        ? CSS.escape(String(lot.id))
        : String(lot.id).replace(/["\\]/g, "");
      row = list.querySelector(`[data-auction-lot="${sel}"]`);
    } catch {
      row = null;
    }
    if (!row) return false;
    const minimum = auctionMinNextBid(lot);
    const current = Number(lot.topBid) > 0 ? Number(lot.topBid) : Number(lot.startPrice) || 0;
    const bidB = row.querySelector(":scope .auctionBid b");
    if (bidB) {
      const next = formatInteger(current);
      if (bidB.textContent !== next) bidB.textContent = next;
    }
    const bidderSmall = row.querySelector(":scope .auctionMeta small");
    if (bidderSmall) {
      const next = bidderLabel(lot, pseudo);
      if (bidderSmall.textContent !== next) bidderSmall.textContent = next;
      bidderSmall.classList.toggle("auctionRecent", Number(lot.topBid) > 0);
    }
    const input = row.querySelector(":scope input[data-auction-bid]");
    if (input) {
      if (String(input.min || "") !== String(minimum)) input.min = String(minimum);
      const ph = `min ${formatInteger(minimum)}`;
      if (input.placeholder !== ph && !document.activeElement?.isSameNode?.(input)) input.placeholder = ph;
    }
    const leading = lot.topBidder === "you" && Number(lot.myBid) > 0;
    row.classList.toggle("leading", leading);
  }
  if (rowCountMismatch(list, lots)) return false;
  return true;
}

function rowCountMismatch(list, lots) {
  try {
    return list.querySelectorAll(":scope [data-auction-lot]").length !== lots.length;
  } catch {
    return false;
  }
}

// Boucle (appelée par le moteur) : juste le rafraîchissement d'affichage.
// Les mises rivales et règlements passent par tickCurrentUserAuction côté moteur
// (solo) ou pumpSharedAuction (partagé : re-rendu sur dirty serveur +
// patch live chaque seconde panneau ouvert).
export function tickAuctionDisplay() {
  if (!ctx) return;
  try {
    if (auctionNetDirty()) {
      clearAuctionNetDirty();
      renderAuctionWindow();
      return;
    }
  } catch {}
  const now = Date.now();
  if (now - lastDynamicRefresh < 1000) return;
  lastDynamicRefresh = now;
  try { refreshAuctionDynamic(); } catch {}
  // Le timer défile chaque seconde (maj texte seule, sans re-rendu).
  try { refreshAuctionTimer(); } catch {}
  try {
    const { root } = els();
    const visible = root && root.style.display !== "none" && !root.classList.contains("gameWinMinimized");
    if (visible && isSharedAuction()) {
      let user = null;
      try {
        user = ctx?.getUser?.();
      } catch {
        user = null;
      }
      const auction = liveAuction();
      if (auction && user && refreshAuctionRowsInPlace(auction, user, true) === false) {
        renderAuctionWindow();
      }
    }
  } catch {}
}

export function initAuctionUI(context) {
  ctx = context;
  const { root } = els();
  if (!root || root.__auctionWired) return;
  root.__auctionWired = true;
  root.addEventListener("click", onAuctionClick);
  root.addEventListener("keydown", onAuctionKeydown);
  root.addEventListener("input", onAuctionInput);
  window.addEventListener("orbit:window-restored", (event) => {
    if (event.detail?.id === "auctionWindow") {
      try { renderAuctionWindow(); } catch {}
    }
  });
  try { renderAuctionWindow(); } catch {}
}
