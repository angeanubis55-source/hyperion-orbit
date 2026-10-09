"use strict";
import { shouldRefreshWindow } from "../SRC/CORE/BACKGROUND_REFRESH.js";

// UI/UI_TDM.js — Fenêtre Inventaire : rend le même inventaire que l'Espace
// pilote (mêmes sections, icônes, quantités, tooltips — builders partagés de
// PUBLIC/PROFILE.js), de façon indépendante, avec switch par catégorie +
// recherche + pagination.

import { getCurrentUserFull, sellItem, sellShipModules, sellUnitPrice, shipModuleGroupKey } from "../SRC/CORE/ACCOUNT.js";
import { inventoryPage } from "./UI_INVENTORY.js";
import { escapeHtml } from "./UI_DOM.js";
import { formatInteger } from "../SRC/CORE/NUMBER_FORMAT.js";

let started = false;
let buildersPromise = null;

const TABS = [
  { id: "all", label: "Tout", kinds: null },
  { id: "ammo", label: "Munitions", kinds: ["ammo"] },
  { id: "equipment", label: "Équipements", kinds: ["equipment"] },
  { id: "modules", label: "Modules", kinds: ["module"] },
  { id: "ships", label: "Vaisseaux", kinds: ["ship", "shipDesign"] },
  { id: "drones", label: "Drones & P.E.T", kinds: ["drone", "droneDesign", "droneFormation", "pet"] },
  { id: "resources", label: "Ressources", kinds: ["resource"] },
];

let activeTab = "all";
let searchQuery = "";
let pageIndex = 0;
let pagerEl = null;
let lastSignature = "";
// Sélection unique pour la vente : clé stable "kind:id".
const selectedKeys = new Set();
// Snapshot frais des entrées affichées (module objet inclus), par clé.
const entryByKey = new Map();

function slotKey(entry) {
  return `${entry?.kind || ""}:${entry?.id || ""}`;
}

function $(id) {
  return document.getElementById(id);
}

// Import dynamique depuis l'URL exacte du <script> PROFILE.js déjà chargé :
// même instance de module (pas de double exécution), même si le ?v= change.
function loadBuilders() {
  if (!buildersPromise) {
    buildersPromise = (async () => {
      let spec = "../PUBLIC/PROFILE.js";
      try {
        const tag = document.querySelector('script[src*="PUBLIC/PROFILE.js"]');
        const src = tag?.getAttribute("src");
        if (src) spec = new URL(src, document.baseURI).href;
      } catch {}
      return import(spec);
    })();
  }
  return buildersPromise;
}

function emptyHtml(text) {
  return `<div class="inventoryEmpty">${escapeHtml(text)}</div>`;
}

function ensurePager(dst) {
  if (pagerEl || !dst) return;
  pagerEl = document.createElement("nav");
  pagerEl.className = "tdmPager";
  pagerEl.setAttribute("aria-label", "Pages de l'inventaire");
  dst.before(pagerEl);
  pagerEl.addEventListener("click", (event) => {
    const button = event.target instanceof Element ? event.target.closest("[data-tdm-page]") : null;
    if (!button || button.disabled) return;
    pageIndex += Number(button.dataset.tdmPage);
    void render();
    try {
      dst.scrollTop = 0;
    } catch {}
  });
}

function setPager(page, pages, total) {
  if (!pagerEl) return;
  pagerEl.innerHTML = `<button data-tdm-page="-1" ${page === 0 ? "disabled" : ""} type="button">Précédent</button>`
    + `<span role="status">Page ${page + 1} / ${pages} – ${formatInteger(total)} emplacements</span>`
    + `<button data-tdm-page="1" ${page + 1 >= pages ? "disabled" : ""} type="button">Suivant</button>`;
}

function slotHtml(b, entry) {
  const stacked = entry.stacked !== false && !["drone", "pet", "droneDesign", "droneFormation"].includes(entry.kind);
  const quantity = entry.quantityLabel || b.inventoryQuantityLabel(entry.quantity);
  const rarity = b.inventoryEntryRarity(entry);
  entry.rarity = rarity;
  const richTip = entry.kind === "module" ? b.htmlForDataAttr(b.inventoryModuleTooltipHtml(entry)) : "";
  const tip = b.inventoryTooltipText(entry);
  const key = slotKey(entry);
  const selected = selectedKeys.has(key) ? " selected" : "";
  return `<article class="inventorySlot rarity-${escapeHtml(rarity.id)}${selected}" data-key="${escapeHtml(key)}" data-entry-id="${escapeHtml(String(entry.id ?? ""))}" data-quantity="${escapeHtml(String(entry.quantity ?? ""))}" data-rarity="${escapeHtml(rarity.id)}" data-kind="${escapeHtml(entry.kind)}" data-tooltip="${escapeHtml(tip)}"${richTip ? ` data-tooltip-html="${richTip}"` : ""} tabindex="0" aria-label="${escapeHtml(tip.replace(/\n/g, ". "))}">`
    + `<img src="${escapeHtml(b.inventoryItemIcon(entry))}" alt="" />`
    + `${stacked ? `<span class="inventorySlotQuantity">${escapeHtml(quantity)}</span>` : ""}`
    + `</article>`;
}

function selectedEntry() {
  const key = [...selectedKeys][0];
  return key ? entryByKey.get(key) || null : null;
}

function updateSellBtn() {
  const btn = $("tdmSellBtn");
  if (!btn) return;
  btn.disabled = selectedKeys.size === 0;
  btn.textContent = "Vendre";
}

function pruneSelection(filtered) {
  const allKeys = new Set();
  entryByKey.clear();
  for (const section of filtered) {
    for (const entry of section.items || []) {
      const key = slotKey(entry);
      allKeys.add(key);
      entryByKey.set(key, entry);
    }
  }
  for (const key of [...selectedKeys]) {
    if (!allKeys.has(key)) selectedKeys.delete(key);
  }
  updateSellBtn();
}

function sellSelected() {
  openSellDialog();
}

let sellDialog = null; // { id, name, maxQty, unitGain, usage }

function engineNotify(text, dur = 2.5, type = "info") {
  try {
    window.__ORBIT_ENGINE__?.showNotification?.(text, dur, type);
  } catch {}
}

function sellDialogQty() {
  const input = $("tdmSellQty");
  const max = Math.max(1, sellDialog?.maxQty || 1);
  let qty = Math.floor(Number(input?.value) || 0);
  if (!Number.isFinite(qty)) qty = max;
  return Math.max(1, Math.min(max, qty));
}

function refreshSellDialogTotal() {
  if (!sellDialog) return;
  const qty = sellDialogQty();
  const total = sellDialog.unitGain * qty;
  const el = $("tdmSellTotal");
  if (el) el.textContent = `${formatInteger(qty)} × ${formatInteger(sellDialog.unitGain)} = +${formatInteger(total)} crédits`;
  const input = $("tdmSellQty");
  if (input && String(qty) !== String(input.value)) input.value = String(qty);
}

function sellDialogError(text) {
  const el = $("tdmSellError");
  if (!el) return;
  if (!text) {
    el.hidden = true;
    el.textContent = "";
  } else {
    el.hidden = false;
    el.textContent = text;
  }
}

function closeSellDialog() {
  sellDialog = null;
  const dlg = $("tdmSellDialog");
  if (dlg) dlg.hidden = true;
}

const SELLABLE_KINDS = ["equipment", "ammo", "module"];

function openSellDialog() {
  const entry = selectedEntry();
  if (!entry) return;
  // Tout se vend sauf vaisseaux, designs, P.E.T, drones et ressources.
  if (!SELLABLE_KINDS.includes(entry.kind)) {
    engineNotify(`${entry.name || "Objet"} : non vendable (vaisseaux, designs, P.E.T, drones et ressources exclus).`, 3, "error");
    return;
  }
  const unitGain = sellUnitPrice(entry.kind, entry.id, entry.module);
  if (!(unitGain > 0)) {
    engineNotify(`${entry.name || "Objet"} : sans prix de vente.`, 3, "error");
    return;
  }
  const maxQty = Math.floor(Number(entry.quantity) || 0);
  if (!Number.isFinite(maxQty) || maxQty <= 0) {
    engineNotify(`${entry.name || "Objet"} : quantité invendable.`, 3, "error");
    return;
  }
  // Vente directe : si l'objet est monté quelque part, il en est retiré
  // automatiquement (forçage), sans avertissement ni case à cocher.
  sellDialog = {
    id: entry.id,
    kind: entry.kind,
    name: entry.name || entry.id,
    module: entry.module || null,
    maxQty,
    unitGain,
  };
  hideTooltip();
  const dlg = $("tdmSellDialog");
  if (!dlg) return;
  const nameEl = $("tdmSellItem");
  if (nameEl) nameEl.textContent = `${sellDialog.name} — stock : ${formatInteger(maxQty)}`;
  const qtyInput = $("tdmSellQty");
  if (qtyInput) {
    qtyInput.max = String(maxQty);
    qtyInput.value = "1";
  }
  sellDialogError("");
  dlg.hidden = false;
  refreshSellDialogTotal();
}

function confirmSellDialog() {
  if (!sellDialog) return;
  const { id, kind, name, module } = sellDialog;
  const qty = sellDialogQty();
  let res = null;
  try {
    if (kind === "module") res = sellShipModules(shipModuleGroupKey(module), qty, { force: true });
    else res = sellItem(id, qty, { force: true });
  } catch (e) {
    res = { ok: false, error: String(e?.message || e) };
  }
  if (!res?.ok) {
    sellDialogError(res?.error || "Vente impossible.");
    return;
  }
  const stripped = Number(res.stripped) || 0;
  closeSellDialog();
  selectedKeys.clear();
  updateSellBtn();
  engineNotify(
    `Vente : ${formatInteger(qty)}× ${name} · +${formatInteger(Number(res.gain) || 0)} crédits${stripped > 0 ? ` · ${stripped} copie${stripped > 1 ? "s" : ""} retirée${stripped > 1 ? "s" : ""} des équipements` : ""}`,
    3.5,
    "info"
  );
  const eng = window.__ORBIT_ENGINE__ || {};
  // Resynchronise le joueur (crédits HUD) avant tout, sinon le tick
  // moteur réécraserait les gains avec l'ancien solde en mémoire.
  try {
    eng.syncPlayerFromAccount?.();
  } catch {}
  // Vente de munitions : recopie aussi le stock vers la session live.
  if (res.ammoSold) {
    try {
      eng.applyAccountAmmoToPlayer?.();
    } catch {}
  }
  try {
    window.dispatchEvent(new CustomEvent("orbit:profile-progress"));
  } catch {}
  try {
    void render();
  } catch {}
}

async function render() {
  if (!shouldRefreshWindow("tdmWindow")) return;
  const dst = $("tdmInventorySections");
  if (!dst) return;
  ensurePager(dst);

  let user = null;
  try {
    user = getCurrentUserFull();
  } catch {}
  if (!user) {
    setPager(0, 1, 0);
    hideTooltip();
    dst.innerHTML = emptyHtml("Connecte-toi pour voir ton inventaire.");
    return;
  }

  let b = null;
  try {
    b = await loadBuilders();
  } catch {}
  if (!shouldRefreshWindow("tdmWindow")) return;
  if (!b?.buildInventorySections) {
    hideTooltip();
    dst.innerHTML = emptyHtml("Inventaire indisponible pour le moment.");
    return;
  }

  let sections = [];
  try {
    sections = b.buildInventorySections(user) || [];
  } catch {
    sections = [];
  }

  const tab = TABS.find((t) => t.id === activeTab) || TABS[0];
  const q = searchQuery.trim().toLocaleLowerCase("fr");
  const filtered = sections.map((section) => ({
    ...section,
    items: (section.items || []).filter((entry) => {
      if (tab.kinds && !tab.kinds.includes(entry.kind)) return false;
      if (q && !`${entry.name} ${entry.detail} ${entry.id} ${entry.searchText || ""}`.toLocaleLowerCase("fr").includes(q)) return false;
      return true;
    }),
  }));

  const result = inventoryPage(filtered, pageIndex);
  pageIndex = result.page;
  try {
    dst.dataset.totalSlots = String(result.total);
  } catch {}
  pruneSelection(filtered);
  // Même optimisation que l'Espace pilote : données inchangées = pas de rebuild DOM.
  let signature = "";
  try {
    signature = JSON.stringify([activeTab, q, pageIndex, filtered]);
  } catch {}
  if (signature && signature === lastSignature) return;
  lastSignature = signature;
  setPager(result.page, result.pages, result.total);
  hideTooltip();
  dst.innerHTML = result.slots.length
    ? result.slots.map((entry) => slotHtml(b, entry)).join("")
    : emptyHtml(q || activeTab !== "all" ? "Aucun résultat." : "Aucun élément possédé.");
}

function hideTooltip() {
  $("tdmInventoryTooltip")?.classList.remove("visible");
}

function showTooltipFor(el, event) {
  const tip = $("tdmInventoryTooltip");
  if (!tip || !el) return;
  const rich = el.getAttribute("data-tooltip-html");
  const plain = el.getAttribute("data-tooltip") || el.getAttribute("aria-label") || "";
  if (!rich && !plain) {
    hideTooltip();
    return;
  }
  const x = Number(event?.clientX);
  const y = Number(event?.clientY);
  // Le HTML riche est déjà échappé en amont (PROFILE.js), on le réinjecte tel quel.
  if (rich) {
    try {
      const wrapper = document.createElement("div");
      wrapper.innerHTML = rich.replace(/&quot;/g, '"');
      tip.innerHTML = wrapper.innerHTML || "";
    } catch {
      tip.textContent = plain;
    }
    tip.classList.add("visible");
    positionTooltip(tip, x, y);
    return;
  }
  const lines = String(plain).split("\n").filter(Boolean);
  tip.textContent = "";
  lines.forEach((line, i) => {
    const div = document.createElement("div");
    div.className = i === 0 ? "ttModName" : "ttModLine";
    div.textContent = line;
    tip.appendChild(div);
  });
  tip.classList.add("visible");
  positionTooltip(tip, x, y);
}

function positionTooltip(tip, x, y) {
  try {
    // Suit la souris comme dans l'Espace pilote, en restant dans l'écran.
    const margin = 14;
    const r = tip.getBoundingClientRect();
    const cx = Number.isFinite(x) ? x : window.innerWidth / 2;
    const cy = Number.isFinite(y) ? y : window.innerHeight / 2;
    const left = Math.max(margin, Math.min(window.innerWidth - r.width - margin, cx + margin));
    const top = Math.max(margin, Math.min(window.innerHeight - r.height - margin, cy + margin));
    tip.style.left = `${Math.round(left)}px`;
    tip.style.top = `${Math.round(top)}px`;
  } catch {}
}

export function initTdmUI() {
  if (started) return;
  started = true;

  const dst = $("tdmInventorySections");
  const search = $("tdmInventorySearch");
  const tabs = document.querySelectorAll("[data-tdm-tab]");
  if (!dst) return;

  tabs.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tdmTab === activeTab);
    btn.addEventListener("click", () => {
      activeTab = btn.dataset.tdmTab || "all";
      tabs.forEach((other) => other.classList.toggle("active", other === btn));
      pageIndex = 0;
      void render();
    });
  });

  search?.addEventListener("input", () => {
    searchQuery = search.value || "";
    pageIndex = 0;
    void render();
  });

  // Infobulle au survol (comme l'espace pilote).
  dst.addEventListener("pointermove", (event) => {
    const slot = event.target instanceof Element ? event.target.closest(".inventorySlot") : null;
    if (!slot) {
      hideTooltip();
      return;
    }
    showTooltipFor(slot, event);
  });
  // Clic = sélection unique (comme l'équipement des hangars).
  dst.addEventListener("click", (event) => {
    const slot = event.target instanceof Element ? event.target.closest(".inventorySlot") : null;
    if (!slot || !dst.contains(slot)) return;
    const key = slot.getAttribute("data-key") || "";
    if (!key) return;
    if (selectedKeys.has(key)) {
      selectedKeys.delete(key);
      slot.classList.remove("selected");
    } else {
      for (const old of dst.querySelectorAll(".inventorySlot.selected")) old.classList.remove("selected");
      selectedKeys.clear();
      selectedKeys.add(key);
      slot.classList.add("selected");
    }
    updateSellBtn();
  });
  dst.addEventListener("pointerleave", hideTooltip);

  $("tdmSellBtn")?.addEventListener("click", sellSelected);

  // Dialogue de vente : quantité + confirmation (+ forçage si équipé).
  document.querySelectorAll("#tdmSellDialog [data-tdm-qty]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (!sellDialog) return;
      const input = $("tdmSellQty");
      if (!input) return;
      const raw = btn.getAttribute("data-tdm-qty") || "";
      input.value = raw === "max" ? String(sellDialog.maxQty) : raw;
      refreshSellDialogTotal();
    });
  });
  $("tdmSellQty")?.addEventListener("input", refreshSellDialogTotal);
  $("tdmSellCancel")?.addEventListener("click", closeSellDialog);
  $("tdmSellConfirm")?.addEventListener("click", confirmSellDialog);
  $("tdmSellDialog")?.addEventListener("pointerdown", (event) => {
    if (event.target && event.target.id === "tdmSellDialog") closeSellDialog();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && sellDialog) closeSellDialog();
  });

  const resync = event => {
    // Les disques de log appartiennent à l'arbre : aucune case de cet
    // inventaire ne change, même lorsque la fenêtre est ouverte.
    if (event?.detail?.source === "pilot-disks") return;
    try {
      void render();
    } catch {}
  };
  window.addEventListener("orbit:profile-progress", resync);
  window.addEventListener("orbit:user-updated", resync);
  window.addEventListener("orbit:window-restoring", (e) => {
    if (e?.detail?.id === "tdmWindow") resync();
  });
  document.querySelector('[data-window-id="tdmWindow"]')?.addEventListener("click", () => {
    setTimeout(resync, 60);
  });

  // Le compte peut charger en différé : premier rendu + rattrapages.
  resync();
  setTimeout(resync, 800);
  setTimeout(resync, 2500);
}

export function refreshTdmWindow() {
  if (!started) return;
  try {
    void render();
  } catch {}
}
