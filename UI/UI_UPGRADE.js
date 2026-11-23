"use strict";

// UI/UI_UPGRADE.js — Fenêtre "Amélioration" : canons lasers et générateurs
// (bouclier + vitesse), lvl.1 à lvl.16 (+2 % par niveau), coût en crédits.
// Présentation en cases comme l'Inventaire (styles #tdmWindow -> #upgradeWindow).
// Les exemplaires équipés s'améliorent aussi (remplacés sur place).
// Règles et coûts : SRC/DATA/UPGRADES.js (partagés avec le serveur).

import { findCatalogItem } from "../SRC/CORE/CATALOG.js";
import { upgradeEquipmentItem } from "../SRC/CORE/ACCOUNT.js";
import { rarityForCatalogItem } from "../SRC/DATA/CRAFTING.js";
import { formatInteger } from "../SRC/CORE/NUMBER_FORMAT.js";
import { escapeHtml } from "./UI_DOM.js";
import {
  UPGRADE_MAX_LEVEL,
  isUpgradableItem,
  itemUpgradeLevel,
  parseUpgradeId,
  reservedEquippedCopies,
  upgradeBonusPct,
  upgradeCost,
} from "../SRC/DATA/UPGRADES.js";

let ctx = null;
let filter = "all";
// Case choisie : "<id>|<1 = équipé, 0 = libre>|<n° d'exemplaire>".
let selectedKey = null;
let busy = false;

const TYPE_STAT = {
  laser: { key: "damage", label: "Dégâts" },
  shield: { key: "bonusShield", label: "Bouclier" },
  speed: { key: "bonusSpeed", label: "Vitesse" },
};
// Ordre d'affichage : lasers, puis boucliers avant vitesse dans Générateurs.
const TYPE_ORDER = { laser: 0, shield: 1, speed: 2 };

const els = () => ({
  root: document.getElementById("upgradeWindow"),
  list: document.getElementById("upgList"),
  detail: document.getElementById("upgDetail"),
  credits: document.getElementById("upgCredits"),
});

function user() {
  try { return ctx?.getUser?.() || null; } catch { return null; }
}

function credits(u) {
  try {
    const live = ctx?.getCredits?.();
    if (Number.isFinite(Number(live))) return Math.max(0, Math.floor(Number(live)));
  } catch {}
  return Math.max(0, Math.floor(Number(u?.credits) || 0));
}

// Une case par objet et par niveau (comme les piles de l'Inventaire).
function stacks(u) {
  const out = [];
  for (const [id, raw] of Object.entries(u?.inventory?.counts || {})) {
    const owned = Math.max(0, Math.floor(Number(raw) || 0));
    if (!owned) continue;
    const item = findCatalogItem(id);
    if (!isUpgradableItem(item)) continue;
    const level = itemUpgradeLevel(id);
    const equipped = Math.min(owned, reservedEquippedCopies(u, id));
    out.push({ id, item, level, owned, equipped, type: item.module.type });
  }
  out.sort((a, b) => TYPE_ORDER[a.type] - TYPE_ORDER[b.type]
    || (Number(b.item.price) || 0) - (Number(a.item.price) || 0)
    || String(a.item.name).localeCompare(String(b.item.name)) || b.level - a.level);
  return out;
}

// Une case par exemplaire : d'abord les exemplaires équipés (✓), puis les libres.
function copies(u) {
  const out = [];
  for (const s of stacks(u)) {
    for (let i = 0; i < s.owned; i++) {
      const equipped = i < s.equipped;
      out.push({ ...s, copyEquipped: equipped, key: `${s.id}|${equipped ? 1 : 0}|${equipped ? i : i - s.equipped}` });
    }
  }
  return out;
}

function inFilter(s) {
  if (filter === "all") return true;
  return filter === "laser" ? s.type === "laser" : s.type !== "laser";
}

function statValue(item, level) {
  const stat = TYPE_STAT[item?.module?.type];
  const base = Number(item?.module?.[stat?.key]) || 0;
  return Math.round(base * (1 + upgradeBonusPct(level) / 100) * 100) / 100;
}

function rarityId(item) {
  try { return rarityForCatalogItem(item) || "common"; } catch { return "common"; }
}

function slotHtml(c) {
  const sel = c.key === selectedKey ? " selected" : "";
  const tip = `${c.item.name} · lvl.${c.level}${c.copyEquipped ? " · équipé" : ""}`;
  return `<article class="inventorySlot rarity-${escapeHtml(rarityId(c.item))}${sel}" data-upg-key="${escapeHtml(c.key)}" title="${escapeHtml(tip)}" tabindex="0">`
    + `<img src="${escapeHtml(c.item.icon || "")}" alt="" draggable="false" />`
    + `<span class="upgLvlBadge${c.level >= UPGRADE_MAX_LEVEL ? " isMax" : ""}">LVL.${c.level}</span>`
    + `</article>`;
}

function detailHtml(u, s) {
  if (!s) return `<div class="upgDetailEmpty">Sélectionne une case pour l'améliorer.</div>`;
  const stat = TYPE_STAT[s.type];
  const isMax = s.level >= UPGRADE_MAX_LEVEL;
  const next = Math.min(UPGRADE_MAX_LEVEL, s.level + 1);
  const icon = `<div class="inventorySlot rarity-${escapeHtml(rarityId(s.item))} upgDetailIcon"><img src="${escapeHtml(s.item.icon || "")}" alt="" draggable="false" /><span class="upgLvlBadge${isMax ? " isMax" : ""}">LVL.${s.level}</span></div>`;
  const info = `<div class="upgDetailInfo">`
    + `<strong>${escapeHtml(s.item.name)}</strong>`
    + (isMax
      ? `<span><span>lvl.${s.level}</span> · <span>${stat.label}</span> <b>${formatInteger(statValue(s.item, s.level))}</b> · <b>+${upgradeBonusPct(s.level)} %</b></span>`
      : `<span><b class="upgLvCur">lvl.${s.level}</b> ➜ <b class="upgUp">lvl.${next}</b> · <span>${stat.label}</span> <b>${formatInteger(statValue(s.item, s.level))}</b> ➜ <b class="upgUp">${formatInteger(statValue(s.item, next))}</b> · <b>+${upgradeBonusPct(s.level)} %</b> ➜ <b class="upgUp">+${upgradeBonusPct(next)} %</b></span>`)
    + `<span class="upgOwned">${s.copyEquipped ? `<span>Exemplaire équipé</span>` : `<span>Exemplaire libre</span>`}</span>`
    + `</div>`;
  if (isMax) return icon + info + `<div class="upgDetailMax">Niveau maximal atteint</div>`;
  const cost = upgradeCost(s.item, s.level).credits;
  const cr = credits(u);
  const canUpgrade = !busy && cr >= cost;
  return icon + info
    + `<p class="upgCostLine${cr < cost ? " short" : ""}"><span class="upgCostWord">Coût d'amélioration pour</span> <span class="upgCostGold">lvl.${next}</span> <span class="upgCostWord">:</span> <span class="upgCostTotal">${formatInteger(cost)}</span> <span class="upgCostWord">Crédits</span></p>`
    + `<button type="button" class="tdmTab upgGoBtn" data-upg-go${canUpgrade ? "" : " disabled"}>${busy ? "Amélioration…" : cr < cost ? "Crédits insuffisants" : "Améliorer"}</button>`;
}

export function renderUpgradeWindow() {
  const { root, list, detail, credits: crEl } = els();
  if (!root || !list || !detail) return;
  const u = user();
  if (crEl) crEl.textContent = formatInteger(credits(u));
  root.querySelectorAll("[data-upg-filter]").forEach((b) => b.classList.toggle("active", b.dataset.upgFilter === filter));
  const shown = copies(u).filter(inFilter);
  if (selectedKey && !shown.some((c) => c.key === selectedKey)) selectedKey = null;
  if (!selectedKey && shown.length) selectedKey = shown[0].key;
  const scroll = list.scrollTop;
  list.innerHTML = shown.length ? shown.map(slotHtml).join("")
    : `<div class="inventoryEmpty">Aucun objet de ce type dans l'inventaire.</div>`;
  list.scrollTop = scroll;
  detail.innerHTML = detailHtml(u, shown.find((c) => c.key === selectedKey) || null);
}

async function doUpgrade() {
  if (busy || !selectedKey) return;
  const s = copies(user()).find((x) => x.key === selectedKey);
  if (!s || s.level >= UPGRADE_MAX_LEVEL) return;
  const qty = 1;
  busy = true;
  renderUpgradeWindow();
  let res = null;
  try {
    try { ctx?.beforeAction?.(); } catch {}
    res = await upgradeEquipmentItem(s.id, qty, { equipped: s.copyEquipped });
  } catch (e) {
    res = { ok: false, error: String(e?.message || e) };
  } finally {
    busy = false;
  }
  if (res?.ignored) { renderUpgradeWindow(); return; }
  if (!res?.ok) {
    try { ctx?.notify?.(res?.error || "Amélioration impossible.", 3, "error"); } catch {}
    renderUpgradeWindow();
    return;
  }
  try { ctx?.afterAction?.(); } catch {}
  const to = res.to || null;
  try { ctx?.notify?.(`${s.item.name} : lvl.${parseUpgradeId(to).level}`, 2.5, "info"); } catch {}
  // Suit l'exemplaire amélioré (même état équipé / libre).
  if (to) {
    const after = copies(user());
    const same = after.find((x) => x.id === to && x.copyEquipped === s.copyEquipped) || after.find((x) => x.id === to);
    if (same) selectedKey = same.key;
  }
  renderUpgradeWindow();
}

function onClick(event) {
  const t = event.target instanceof Element ? event.target : null;
  if (!t) return;
  const f = t.closest("[data-upg-filter]");
  if (f) { filter = f.dataset.upgFilter; selectedKey = null; renderUpgradeWindow(); return; }
  const slot = t.closest("[data-upg-key]");
  if (slot) { selectedKey = slot.dataset.upgKey; renderUpgradeWindow(); return; }
  if (t.closest("[data-upg-go]")) doUpgrade();
}

// Double-clic sur une case : amélioration directe de cet exemplaire.
function onDblClick(event) {
  const t = event.target instanceof Element ? event.target : null;
  const slot = t?.closest("[data-upg-key]");
  if (!slot) return;
  selectedKey = slot.dataset.upgKey;
  doUpgrade();
}

export function initUpgradeUI(context) {
  ctx = context;
  const { root } = els();
  if (!root || root.__upgWired) return;
  root.__upgWired = true;
  root.addEventListener("click", onClick);
  root.addEventListener("dblclick", onDblClick);
  window.addEventListener("orbit:window-restoring", (event) => {
    if (event.detail?.id === "upgradeWindow") { try { renderUpgradeWindow(); } catch {} }
  });
  // Achats, ventes, équipement : la fenêtre ouverte suit le compte.
  window.addEventListener("orbit:user-updated", () => {
    if (busy || document.getElementById("upgradeWindow")?.style.display === "none") return;
    try { renderUpgradeWindow(); } catch {}
  });
  try { renderUpgradeWindow(); } catch {}
}
