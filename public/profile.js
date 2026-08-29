// public/profile.js
"use strict";

import {
  getCurrentUserFull,
  logout,
  buyItem,
  sellItem,
  setActiveHangar,
  saveHangarFit,
  setActiveHangarConfig,
  buyModuleRoll,
  addShipModule,
  updateCurrentUserEmail,
  changeCurrentUserPassword,
} from "../src/core/account.js";

import { CATALOG, findCatalogItem } from "../src/core/catalog.js";
import { SHIP_PACKS } from "../src/data/shipPacks.js";
import { escapeHtml } from "../src/core/dom.js";

console.log("profile.js loaded ✅");

// ✅ détecte si index.html (le jeu) est ouvert
function isGameOpen() {
  try {
    const t = Number(localStorage.getItem("orbit_game_open") || 0);
    if (!Number.isFinite(t) || t <= 0) return false;

    // si le flag est récent, on considère le jeu ouvert
    return (Date.now() - t) < 2000; // 2 minutes
  } catch {
    return false;
  }
}

// ✅ affichage message (utilise ton système existant si tu en as un)
function showHangarMsg(text) {
  // si tu as déjà une fonction showToast / showNotif -> remplace par la tienne
  showToast(text);
}


const $ = (id) => document.getElementById(id);

// UI refs
const msgEl = $("msg");
const headerEl = $("profileHeader");
const statCredits = $("statCredits");
const statHonor = $("statHonor");
const statExp = $("statExp");
const statRank = $("statRank");
const accountEmail = $("accountEmail");
const accountEmailStatus = $("accountEmailStatus");
const emailCurrentPassword = $("emailCurrentPassword");
const btnSaveEmail = $("btnSaveEmail");
const passwordCurrent = $("passwordCurrent");
const passwordNew = $("passwordNew");
const passwordConfirm = $("passwordConfirm");
const btnChangePassword = $("btnChangePassword");
const shopCredits = $("shopCredits");
const hangarGrid = $("hangarGrid");
const hangarPreviewImage = $("hangarPreviewImage");
const hangarPreviewTitle = $("hangarPreviewTitle");
const hangarPreviewMeta = $("hangarPreviewMeta");
const shopList = $("shopList");
const shopPreview = $("shopPreview");
const btnStart = $("btnStart");
const btnLogout = $("btnLogout");

// state
let user = null;
let tab = localStorage.getItem("orbit_profile_tab") || "stats";
let shopTab = localStorage.getItem("orbit_shop_tab") || "ammo";
let selectedShopItemId = null;
let selectedHangarId = null;
let shopRenderToken = 0;

// -------------------- UI helpers --------------------
function setMsg(text, ok = false) {
  const message = String(text ?? "").trim();

  // ✅ évite les toasts vides avec juste le check vert
  if (!message) return;

  showToast(message, ok ? "success" : "error");
}

function showToast(message, type = "info") {
  const container = document.getElementById("toastContainer");
  if (!container) return;

  message = String(message ?? "").trim();

  // ✅ sécurité supplémentaire
  if (!message) return;

  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  
  const icons = {
    success: "✅",
    error: "❌",
    info: "ℹ️"
  };

  toast.innerHTML = `
    <div class="toastIcon">${icons[type] || icons.info}</div>
    <div class="toastContent">${escapeHtml(message)}</div>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add("removing");

    setTimeout(() => {
      if (toast.parentElement) {
        toast.remove();
      }
    }, 250);
  }, 3000);
}

function showConfirm(title, message, onConfirm) {
  const overlay = document.getElementById('confirmOverlay');
  const titleEl = document.getElementById('confirmTitle');
  const messageEl = document.getElementById('confirmMessage');
  const cancelBtn = document.getElementById('confirmCancel');
  const okBtn = document.getElementById('confirmOk');

  if (!overlay || !titleEl || !messageEl || !cancelBtn || !okBtn) return;

  titleEl.textContent = title;
  messageEl.textContent = message;
  overlay.style.display = 'grid';

  const cleanup = () => {
    overlay.style.display = 'none';
    cancelBtn.onclick = null;
    okBtn.onclick = null;
  };

  cancelBtn.onclick = cleanup;

  overlay.onclick = (e) => {
    if (e.target === overlay) cleanup();
  };

  okBtn.onclick = () => {
    cleanup();
    if (onConfirm) onConfirm();
  };
}

function ownedCount(u, itemId) {
  const n = Number(u?.inventory?.counts?.[itemId] || 0);
  return Number.isFinite(n) ? n : 0;
}

function alreadyOwnsShip(u, shipId) {
  if (!shipId) return false;
  return Array.isArray(u?.inventory?.ships) && u.inventory.ships.includes(String(shipId));
}

function getShopListFor(cat) {
  const direct = CATALOG?.[cat];
  if (Array.isArray(direct) && direct.length) return direct;

  if (cat === "ships") {
    const allCatalogItems = Object.values(CATALOG || {}).flatMap((v) => (Array.isArray(v) ? v : []));
    const shipItems = allCatalogItems.filter((it) => it?.ship?.id);
    const out = [];
    for (const pack of SHIP_PACKS || []) {
      const it = shipItems.find((x) => String(x.ship.id) === String(pack.id));
      if (it) out.push(it);
    }
    return out.length ? out : shipItems;
  }

  return [];
}

function formatNumber(num) {
  return new Intl.NumberFormat('fr-FR').format(num);
}

function getAmmoQtyForShopItem(u, it) {
  const ammoGive = it?.give?.ammo;

  if (!ammoGive || typeof ammoGive !== "object") return null;

  const ammoKey = Object.keys(ammoGive).find((k) => k !== "x1");
  if (!ammoKey) return null;

  const qty = Number(u?.ammo?.[ammoKey] || 0);

  return {
    key: ammoKey,
    qty: Number.isFinite(qty) ? qty : 0,
  };
}

function syncGameCredits() {
  if (window.HyperionGameSync?.syncFromAccount) {
    window.HyperionGameSync.syncFromAccount();
  }
}

function saveGameBeforeProfileAction() {
  if (window.HyperionGameSync?.saveNow) {
    window.HyperionGameSync.saveNow();
  }
}

// -------------------- Icons --------------------
const ITEM_ICON_BASE = "/assets/items/";
const LASER_ICON_BASE = "/assets/lasers/";
const FALLBACK_ICON = `data:image/svg+xml,${encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
    <rect width="64" height="64" rx="12" fill="#081b29"/>
    <path d="M32 14v24M32 48h.01" stroke="#70e6ff" stroke-width="6" stroke-linecap="round"/>
  </svg>
`)}`;

const ITEM_ICONS = {
  ammo_x2: ITEM_ICON_BASE + "ammo_x2.png",
  ammo_x3: ITEM_ICON_BASE + "ammo_x3.png",
  ammo_x4: ITEM_ICON_BASE + "ammo_x4.png",
  ammo_sab: ITEM_ICON_BASE + "ammo_abl.png",
  ammo_x6: ITEM_ICON_BASE + "ammo_x6.png",
 // ammo_abl: ITEM_ICON_BASE + "ammo_abl.png",
 // ammo_radion: ITEM_ICON_BASE + "ammo_radion.png",
  spd_mk0: ITEM_ICON_BASE + "spd_mk0.png",
  spd_mk1: ITEM_ICON_BASE + "spd_mk1.png",
  spd_mk2: ITEM_ICON_BASE + "spd_mk2.png",
  spd_mk3: ITEM_ICON_BASE + "spd_mk3.png",
  spd_mk4: ITEM_ICON_BASE + "spd_mk4.png",
  spd_radion: ITEM_ICON_BASE + "spd_radion.png",
  shd_mk0: ITEM_ICON_BASE + "shd_mk0.png",
  shd_mk1: ITEM_ICON_BASE + "shd_mk1.png",
  shd_mk2: ITEM_ICON_BASE + "shd_mk2.png",
  shd_mk3: ITEM_ICON_BASE + "shd_mk3.png",
  shd_mk4: ITEM_ICON_BASE + "shd_mk4.png",
  shd_radion: ITEM_ICON_BASE + "shd_radion.png",
  laser_lf1: LASER_ICON_BASE + "laser_lf1.png",
  laser_lf2: LASER_ICON_BASE + "laser_lf2.png",
  laser_lf3: LASER_ICON_BASE + "laser_lf3.png",
  laser_anchorlock: LASER_ICON_BASE + "laser_lf5_anchorlock.png",
  laser_odysseus: LASER_ICON_BASE + "laser_odysseus.png",
  laser_radion: LASER_ICON_BASE + "laser_lf5_mortifier.png",
};

const FALLBACK_ICONS = {
  ammo: ITEM_ICON_BASE + "ammo_x2.png",
  speed: ITEM_ICON_BASE + "spd_mk0.png",
  shield: ITEM_ICON_BASE + "shd_mk0.png",
  laser: LASER_ICON_BASE + "laser_lf1.png",
};

const MODULE_ICONS = {
  "hp-x1": ITEM_ICON_BASE + "hpx1.png",
  "hp-x2": ITEM_ICON_BASE + "hpx2.png",
  "hp-x3": ITEM_ICON_BASE + "hpx3.png",
  "shd-x1": ITEM_ICON_BASE + "shdx1.png",
  "shd-x2": ITEM_ICON_BASE + "shdx2.png",
  "shd-x3": ITEM_ICON_BASE + "shdx3.png",
  "dmg-x1": ITEM_ICON_BASE + "dmgx1.png",
  "dmg-x2": ITEM_ICON_BASE + "dmgx2.png",
  "dmg-x3": ITEM_ICON_BASE + "dmgx3.png",
  "spc-x1": ITEM_ICON_BASE + "spcx1.png",
  "spc-x2": ITEM_ICON_BASE + "spcx2.png",
  "spc-x3": ITEM_ICON_BASE + "spcx3.png",
};

function moduleIconSrc(type, tier) {
  return MODULE_ICONS[`${type}-${tier}`] || FALLBACK_ICON;
}

function randInt(min, max) {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pickWeighted(pairs) {
  const total = pairs.reduce((s, [, w]) => s + w, 0);
  let r = Math.random() * total;
  for (const [v, w] of pairs) {
    r -= w;
    if (r <= 0) return v;
  }
  return pairs[pairs.length - 1][0];
}

function formatStatLabel(stat) {
  if (stat === "hp") return "PV";
  if (stat === "shield") return "Bouclier";
  if (stat === "damage") return "Dégâts";
  if (stat === "penetration") return "Pénétration";
  if (stat === "speed") return "Vitesse";
  return stat;
}

function generateShipModule(user) {
  const tier = pickWeighted([["x1", 85], ["x2", 13], ["x3", 2]]);
  const type = pickWeighted([["hp", 25], ["shd", 25], ["dmg", 25], ["spc", 25]]);
  const statCount = pickWeighted([[1, 70], [2, 24], [3, 5.5], [4, 0.5]]);

  const ships = Array.isArray(CATALOG?.ships) ? CATALOG.ships : [];
  const shipPick = ships.length ? ships[randInt(0, ships.length - 1)] : null;
  const shipId = shipPick?.ship?.id || "UnknownShip";

  const ranges = { x1: [5, 15], x2: [10, 20], x3: [15, 30] };
  const [mn, mx] = ranges[tier] || [5, 15];

  const ALL_STATS = ["hp", "shield", "penetration", "speed", "damage"];

  let mainStat = "hp";
  if (type === "hp") mainStat = "hp";
  if (type === "shd") mainStat = "shield";
  if (type === "dmg") mainStat = "damage";
  if (type === "spc") mainStat = Math.random() < 0.5 ? "penetration" : "speed";

  const picked = new Set([mainStat]);
  const bonuses = [{ stat: mainStat, pct: randInt(mn, mx) }];

  while (bonuses.length < statCount) {
    const pool = ALL_STATS.filter((s) => !picked.has(s));
    if (!pool.length) break;
    const s = pool[randInt(0, pool.length - 1)];
    picked.add(s);
    bonuses.push({ stat: s, pct: randInt(mn, mx) });
  }

  const now = Math.floor(Date.now() / 1000);
  const uid = Math.random().toString(16).slice(2, 8);

  return {
    id: `mod_${now}_${uid}`,
    kind: "shipModule",
    shipId,
    tier,
    type,
    bonuses,
    iconKey: `${type}-${tier}`,
    createdAt: now,
  };
}

function iconForItem(it, cat) {
  if (cat === "ships") return shipPreviewSrc(it?.ship?.id, 28);
  const itemId = it?.id;
  if (itemId && ITEM_ICONS[itemId]) return ITEM_ICONS[itemId];
  if (cat && FALLBACK_ICONS[cat]) return FALLBACK_ICONS[cat];
  return FALLBACK_ICON;
}

function shipPreviewSrc(shipId, frameIndex = 28) {
  const pack = SHIP_PACKS.find((p) => p.id === shipId);
  if (!pack) return FALLBACK_ICON;

  const frames = Number(pack.frames || 1);
  const idx = ((frameIndex % frames) + frames) % frames;
  const first = Number(pack.firstNumber || 1);
  const ext = pack.ext || ".png";
  const base = String(pack.path || "");
  const absBase = base.startsWith("/") ? base : "/" + base;

  return `${absBase}${first + idx}${ext}`;
}

function getShipPack(shipId) {
  return SHIP_PACKS.find((p) => String(p.id) === String(shipId)) || null;
}

function getShipSlots(shipId) {
  const p = getShipPack(shipId);
  const s = p?.slots || null;
  return {
    lasers: Number(s?.lasers ?? 15),
    gens: Number(s?.gens ?? 15),
    extras: Number(s?.extras ?? 15),
    shipMods: Number(s?.shipMods ?? 1),
  };
}

function normalizeFitArray(arr, n) {
  const a = Array.isArray(arr) ? arr.slice(0, n) : [];
  while (a.length < n) a.push(null);
  return a;
}

function shipScaleToFit200(shipId, max = 200) {
  const p = getShipPack(shipId);
  if (!p) return 1;
  const w = Number(p.w || max);
  const h = Number(p.h || max);
  return Math.min(max / w, max / h, 1);
}

// -------------------- Tabs --------------------
function setTab(next) {
  tab = next;
  localStorage.setItem("orbit_profile_tab", tab);

  document.querySelectorAll(".tabBtn").forEach((b) => {
    b.classList.toggle("active", b.dataset.tab === tab);
  });

document.querySelectorAll("#profileOverlay .profilePanel").forEach((p) => {
  p.classList.remove("active");
});

const panel = document.getElementById("panel_" + tab);
if (panel) panel.classList.add("active");

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function wireMainTabsOnce() {
  document.querySelectorAll(".tabBtn").forEach((btn) => {
    btn.addEventListener("click", () => {
      setMsg("", true);
      setTab(btn.dataset.tab);

      if (tab === "stats") renderStats(user);
      if (tab === "hangars") renderHangars(user);
      if (tab === "shop") renderShop(user);
    });
  });
}

function wireShopTabsOnce() {
  const root = document.getElementById("shopTabs");
  root?.querySelectorAll(".subtabBtn").forEach((btn) => {
    btn.addEventListener("click", () => {
      shopTab = btn.dataset.shop;
      localStorage.setItem("orbit_shop_tab", shopTab);
      renderShop(user);
    });
  });
}

// -------------------- Render --------------------
function renderHeader(u) {
  if (!u) {
    headerEl.textContent = "Non connecté";
    return;
  }

  const emailLabel = String(u.email || "").endsWith("@local") ? "Non liée" : escapeHtml(u.email);
  headerEl.innerHTML = `
    <span style="color: #00d9ff;">Pilote:</span> ${escapeHtml(u.pseudo)} • 
    <span style="color: #00d9ff;">Email:</span> ${emailLabel} •
    <span style="color: #00d9ff;">Vaisseau actif:</span> ${escapeHtml(u.ship)}
  `;
}

function renderStats(u) {
  if (!u) return;

  statCredits.textContent = formatNumber(u.credits || 0);
  statHonor.textContent = formatNumber(u.stats?.honor ?? 0);
  statExp.textContent = formatNumber(u.stats?.exp ?? 0);
  statRank.textContent = formatNumber(u.stats?.rankPoints ?? 0);

  const linkedEmail = String(u.email || "").endsWith("@local") ? "" : String(u.email || "");
  if (accountEmailStatus) {
    accountEmailStatus.textContent = linkedEmail ? `Adresse liée : ${linkedEmail}` : "Aucune adresse email liée";
  }
  if (accountEmail && document.activeElement !== accountEmail) accountEmail.value = linkedEmail;
  if (btnSaveEmail) btnSaveEmail.textContent = linkedEmail ? "Modifier l'adresse" : "Lier cette adresse";
}

function wireAccountSettingsOnce() {
  btnSaveEmail?.addEventListener("click", () => {
    const email = accountEmail?.value.trim() || "";
    const currentPassword = emailCurrentPassword?.value || "";
    const out = updateCurrentUserEmail(email, currentPassword);
    if (!out?.ok) return setMsg(out?.error || "Impossible de modifier l'adresse email.", false);

    if (emailCurrentPassword) emailCurrentPassword.value = "";
    user = getCurrentUserFull();
    renderHeader(user);
    renderStats(user);
    setMsg("Adresse email enregistrée.", true);
  });

  btnChangePassword?.addEventListener("click", () => {
    const currentPassword = passwordCurrent?.value || "";
    const nextPassword = passwordNew?.value || "";
    if (nextPassword !== (passwordConfirm?.value || "")) {
      return setMsg("Les nouveaux mots de passe ne correspondent pas.", false);
    }

    const out = changeCurrentUserPassword(currentPassword, nextPassword);
    if (!out?.ok) return setMsg(out?.error || "Impossible de changer le mot de passe.", false);

    if (passwordCurrent) passwordCurrent.value = "";
    if (passwordNew) passwordNew.value = "";
    if (passwordConfirm) passwordConfirm.value = "";
    setMsg("Mot de passe modifié avec succès.", true);
  });
}

function renderHangars(u) {
  if (!u) return;
  hangarGrid.innerHTML = "";

  const hangars = Array.isArray(u.hangars) ? u.hangars : [];
  const activeHangar = hangars.find(h => h?.active) || hangars[0];
  if (!selectedHangarId || !hangars.some(h => h.id === selectedHangarId)) {
    selectedHangarId = activeHangar?.id || null;
  }

  const updateHangarPreview = (hangar) => {
    if (!hangar) return;
    const activePack = getShipPack(hangar.shipId);
    const activeSlots = getShipSlots(hangar.shipId);
    const preview = shipPreviewSrc(hangar.shipId);
    if (hangarPreviewImage) {
      hangarPreviewImage.src = preview || "";
      hangarPreviewImage.style.display = preview ? "block" : "none";
    }
    if (hangarPreviewTitle) hangarPreviewTitle.textContent = activePack?.name || hangar.shipId;
    if (hangarPreviewMeta) hangarPreviewMeta.textContent = `Lasers ${activeSlots.lasers} · Générateurs ${activeSlots.gens} · Extras ${activeSlots.extras}`;
  };

  updateHangarPreview(hangars.find(h => h.id === selectedHangarId) || activeHangar);

  if (!hangars.length) {
    hangarGrid.innerHTML = `
      <div class="tile">
        <h3>Aucun hangar</h3>
        <p>Achète ton premier vaisseau dans la boutique !</p>
      </div>
    `;
    return;
  }

  for (const h of hangars) {
    const isActive = !!h.active;
    const prev = shipPreviewSrc(h.shipId);
    const slots = getShipSlots(h.shipId);

    const mods = Array.isArray(u?.inventory?.shipModules) ? u.inventory.shipModules : [];
    const modsForShip = mods.filter(m => String(m?.shipId) === String(h.shipId));

    const el = document.createElement("div");
    el.className = "hangarListItem" + (h.id === selectedHangarId ? " selected" : "") + (isActive ? " active" : "");
    el.innerHTML = `
      <div class="tileShipPreview">
        ${prev ? `<img src="${prev}" alt="${h.shipId}" class="shipImg" style="image-rendering: pixelated;" />` : ""}
        <div style="flex: 1;">
          <h3>
            ${h.shipId} 
            ${isActive ? `<span class="pill">Actif</span>` : ""}
          </h3>
          <p style="margin-bottom: 4px; color: var(--muted);">
            Lasers: <strong>${slots.lasers}</strong> • 
            Génés: <strong>${slots.gens}</strong> • 
            Extras: <strong>${slots.extras}</strong>
          </p>
          <p style="margin: 0; color: var(--muted);">
            Modules roulette: <strong style="color: #00d9ff;">${modsForShip.length}</strong>
          </p>
        </div>
      </div>

      <div class="tileActions">
        <button class="${isActive ? 'secondary' : 'primary'}" data-act="${h.id}" ${isActive ? 'disabled' : ''}>
          ${isActive ? '✅ Activé' : 'Activer'}
        </button>
        <button class="secondary" data-fit="${h.id}">⚙️ Équiper</button>
      </div>
    `;

    el.addEventListener("click", () => {
      selectedHangarId = h.id;
      hangarGrid.querySelectorAll(".hangarListItem").forEach((item) => item.classList.remove("selected"));
      el.classList.add("selected");
      updateHangarPreview(h);
    });

   el.querySelector(`[data-act="${h.id}"]`).addEventListener("click", () => {
  if (isActive) return;

  // ✅ si le jeu (index.html) est ouvert, on bloque le changement de hangar
const isIntegratedInGame = !!document.getElementById("profileOverlay");

if (!isIntegratedInGame && isGameOpen()) {
  return setMsg(
    "⚠️ Le jeu est ouvert. Ferme-le d’abord avant de changer de hangar.",
    false
  );
}

  const out = setActiveHangar(h.id);
  if (!out.ok) return setMsg("❌ " + (out.error || "Impossible d'activer le hangar."), false);

  user = getCurrentUserFull();
  setMsg("✅ Hangar activé avec succès !", true);
  renderHeader(user);
  renderStats(user);
  renderHangars(user);
  if (tab === "shop") renderShop(user);
  if (isIntegratedInGame) {
  setTimeout(() => location.reload(), 500);
}
});


     el.querySelector(`[data-fit="${h.id}"]`).addEventListener("click", () => {
      openFitModal(h.id);
    });

    hangarGrid.appendChild(el);
  }
}

function renderShop(user) {
  if (shopCredits) shopCredits.textContent = formatNumber(user.credits || 0);
  if (!shopList || !shopPreview) return;

  document.querySelectorAll("#shopTabs .subtabBtn").forEach((button) => {
    button.classList.toggle("active", button.dataset.shop === shopTab);
  });

  const shopLayout = shopList.closest(".shopLayout");
  shopLayout?.classList.toggle("extrasMode", shopTab === "extras");

  // Réinitialiser l'affichage
  const gridContainer = document.getElementById("shipsGridContainer");
  if (gridContainer) gridContainer.remove();

  if (shopLayout) shopLayout.style.display = "grid";
  if (shopList) shopList.style.display = "flex";
  if (shopPreview) shopPreview.style.display = "block";

  // Catégories spéciales
  if (shopTab === "extras") {
    renderExtrasRoulette(user);
    return;
  }

  // Toutes les catégories utilisent la même liste et le même panneau d'aperçu.
  const token = ++shopRenderToken;
  shopList.innerHTML = "";

  const list = getShopListFor(shopTab);
  if (!Array.isArray(list) || !list.length) {
    shopList.innerHTML = `
      <div class="tile">
        <h3>Aucun item</h3>
        <p>Cette catégorie est vide.</p>
      </div>
    `;
    shopPreview.innerHTML = `
      <div class="tile">
        <h3>—</h3>
        <p class="muted">Aucune preview disponible.</p>
      </div>
    `;
    return;
  }

  if (!selectedShopItemId || !list.some((x) => x.id === selectedShopItemId)) {
    selectedShopItemId = list[0].id;
  }

  for (const it of list) {
    const price = Number(it.price || 0);
    const ownedShip = shopTab === "ships" ? alreadyOwnsShip(user, it.ship?.id) : false;

    const row = document.createElement("div");
    row.className = "shopRow" + (it.id === selectedShopItemId ? " active" : "");

    const img = document.createElement("img");
    img.src = iconForItem(it, shopTab);
    img.alt = it.name || it.id;
    img.loading = "lazy";
    img.style.imageRendering = shopTab === "ships" ? "pixelated" : "auto";
    img.onerror = () => {
      img.onerror = null;
      img.src = FALLBACK_ICON;
    };

    const meta = document.createElement("div");
    meta.className = "shopMeta";

    const title = document.createElement("b");
    title.textContent = it.name || it.id;

    const sub = document.createElement("span");
    sub.innerHTML = `💰 ${formatNumber(price)} crédits` + (ownedShip ? ` • <span style="color: #00ff88;">Possédé</span>` : "");

    meta.appendChild(title);
    meta.appendChild(sub);
    row.appendChild(img);
    row.appendChild(meta);

    row.addEventListener("click", () => {
      selectedShopItemId = it.id;
      renderShop(user);
    });

    shopList.appendChild(row);
  }

  requestAnimationFrame(() => {
    if (token !== shopRenderToken) return;
    const it = list.find((x) => x.id === selectedShopItemId) || list[0];
    renderShopPreview(user, it, shopTab);
  });
}
function renderShipsGrid(user) {
  // Masquer complètement la structure liste/preview
  const shopLayout = shopList?.closest(".shopLayout");
  if (shopLayout) shopLayout.style.display = "none";

  if (shopList) shopList.style.display = "none";
  if (shopPreview) shopPreview.style.display = "none";

  // Trouver le parent du shopLayout (le panel shop)
  const shopPanel = document.getElementById("panel_shop");
  if (!shopPanel) return;

  // Créer ou récupérer le container grid
  let gridContainer = document.getElementById("shipsGridContainer");
  if (!gridContainer) {
    gridContainer = document.createElement("div");
    gridContainer.id = "shipsGridContainer";
    gridContainer.className = "shopLayoutGrid";
    // Ajouter directement au panel shop au lieu de shopList.parentElement
    shopPanel.appendChild(gridContainer);
  }

  gridContainer.style.display = "grid";
  gridContainer.innerHTML = "";
  gridContainer.scrollTop = 0;

  const list = getShopListFor("ships");
  if (!Array.isArray(list) || !list.length) {
    gridContainer.innerHTML = `
      <div class="tile">
        <h3>Aucun vaisseau</h3>
        <p>Aucun vaisseau disponible.</p>
      </div>
    `;
    return;
  }

  for (const it of list) {
    const price = Number(it.price || 0);
    const shipId = it?.ship?.id;
    const owned = alreadyOwnsShip(user, shipId);
    const can = Number(user?.credits || 0) >= price;

    const pack = getShipPack(shipId);
    const shipW = pack?.w || 200;
    const shipH = pack?.h || 200;
    const containerSize = 280;
    const scale = Math.min(containerSize / shipW, containerSize / shipH, 1) * 0.75;

    const imgSrc = shipPreviewSrc(shipId);

const card = document.createElement("div");
card.className = "shipCard" + (owned ? " owned" : "");

    card.innerHTML = `
      <div class="shipImageContainer">
        <img src="${imgSrc}" alt="${it.name || it.id}"
             style="width: ${shipW}px; height: ${shipH}px; transform: scale(${scale});" />
      </div>

      <h3>
        ${it.name || it.id}
        ${owned ? ` <span class="pill">Possédé</span>` : ""}
      </h3>

      <div class="shipStats">
        💪 HP: <strong style="color:#00d9ff;">${formatNumber(pack?.hp || 0)}</strong> •
        ⚡ Vitesse: <strong style="color:#00d9ff;">${pack?.speed || 0}</strong><br>
        🔫 Lasers: <strong>${pack?.slots?.lasers || 0}</strong> •
        ⚙️ Génés: <strong>${pack?.slots?.gens || 0}</strong> •
        🛡️ Extras: <strong>${pack?.slots?.extras || 0}</strong>
        ${pack?.slots?.shipMods ? ` • ✨ Modules: <strong>${pack.slots.shipMods}</strong>` : ""}
      </div>

      <div class="shipPrice">
        💰 <span class="amount">${formatNumber(price)}</span> crédits
      </div>

      <button class="primary" style="width: 100%;" ${(!can || owned) ? "disabled" : ""} data-ship-buy="${it.id}">
        ${owned ? "✅ Déjà possédé" : `💰 Acheter`}
      </button>
    `;

    const btn = card.querySelector(`[data-ship-buy="${it.id}"]`);
    if (btn) {
      btn.addEventListener("click", () => {
        if (owned || !can) return;

        const shipName = it.name || it.id;
        const priceFormatted = formatNumber(price);

        showConfirm(
          '🚀 Confirmer l\'achat',
          `Voulez-vous acheter le vaisseau "${shipName}" pour ${priceFormatted} crédits ?`,
          () => {
            const out = buyItem(it.id);
            if (!out?.ok) {
              showToast(out?.error || "Achat impossible", 'error');
              return;
            }

            showToast(`✅ Vaisseau ${shipName} acheté !`, 'success');

            user = getCurrentUserFull();
            renderHeader(user);
            renderStats(user);
            renderHangars(user);
            renderShop(user);
            syncGameCredits();
          }
        );
      });
    }

    gridContainer.appendChild(card);
  }
}

function renderExtrasRoulette(user) {
  if (!shopList || !shopPreview) return;

  shopList.innerHTML = "";

  const visible = 7;
  const centerIndex = Math.floor(visible / 2);

  let cells = Array.from({ length: visible }, () => {
    const tier = pickWeighted([["x1", 85], ["x2", 13], ["x3", 2]]);
    const type = pickWeighted([["hp", 25], ["shd", 25], ["dmg", 25], ["spc", 25]]);
    return { type, tier };
  });

  function renderStrip() {
    return `
      <div style="display:flex;gap:10px;justify-content:center;align-items:center;flex-wrap:wrap;">
        ${cells
          .map((c, i) => {
            const isCenter = i === centerIndex;
            const src = moduleIconSrc(c.type, c.tier);
            return `
              <div style="
                width:64px;height:64px;border-radius:14px;
                border:1px solid ${isCenter ? "rgba(0,217,255,0.6)" : "rgba(255,255,255,0.14)"};
                background:${isCenter ? "rgba(0,217,255,0.15)" : "rgba(255,255,255,0.05)"};
                display:grid;place-items:center;
                transform:${isCenter ? "scale(1.1)" : "scale(1)"};
                transition: all 0.3s ease;
              ">
                <img src="${src}" style="width:52px;height:52px;object-fit:contain;image-rendering:pixelated;" />
              </div>
            `;
          })
          .join("")}
      </div>
    `;
  }

  function rollStep() {
    const tier = pickWeighted([["x1", 85], ["x2", 13], ["x3", 2]]);
    const type = pickWeighted([["hp", 25], ["shd", 25], ["dmg", 25], ["spc", 25]]);
    cells = cells.slice(1).concat({ type, tier });
  }

  shopPreview.innerHTML = `
    <div class="tile extrasRoulettePanel">
      <div class="extrasRouletteHeader">
        <div>
          <h3>🎰 Roulette de Modules</h3>
          <p>Obtiens un module bonus aléatoire pour l'un de tes vaisseaux.</p>
        </div>
        <div class="extrasRouletteCost"><span>Coût du tirage</span><strong>250 000</strong> crédits</div>
      </div>
      <div id="rouletteStrip" style="margin:16px 0;">
        ${renderStrip()}
      </div>

      <p style="color: var(--muted); font-size: 13px; margin: 12px 0; text-align: center;">
        Tier: <strong style="color: #00d9ff;">x1 (85%)</strong>, 
        <strong style="color: #ff006e;">x2 (13%)</strong>, 
        <strong style="color: #00ff88;">x3 (2%)</strong>
      </p>

      <button id="btnRoll" class="primary" style="width: 100%;" ${Number(user?.credits || 0) < 250000 ? "disabled" : ""}>
        🎰 Lancer (250 000 crédits)
      </button>

      <div id="rollResult" style="margin-top: 16px; text-align: center; color: var(--muted);"></div>
    </div>
  `;

  const stripEl = document.getElementById("rouletteStrip");
  const btn = document.getElementById("btnRoll");
  const res = document.getElementById("rollResult");

  let rolling = false;

  btn?.addEventListener("click", () => {
    if (rolling) return;
    rolling = true;
    res.textContent = "";

    const pay = buyModuleRoll(250000);
    if (!pay?.ok) {
      rolling = false;
      setMsg("❌ " + (pay?.error || "Achat impossible."), false);
      return;
    }

    user = getCurrentUserFull();
    renderHeader(user);
    renderStats(user);
    renderHangars(user);
    if (shopCredits) shopCredits.textContent = formatNumber(user.credits || 0);
    syncGameCredits();

    let steps = randInt(26, 44);
    let delay = 35;

    const tick = () => {
      rollStep();
      if (stripEl) stripEl.innerHTML = renderStrip();

      steps--;
      delay = Math.min(140, delay + (steps < 10 ? 10 : 0));

      if (steps > 0) {
        setTimeout(tick, delay);
        return;
      }

      const u2 = getCurrentUserFull();
      const mod = generateShipModule(u2);

      cells[centerIndex] = { type: mod.type, tier: mod.tier };
      if (stripEl) stripEl.innerHTML = renderStrip();

      const add = addShipModule(mod);
      if (!add?.ok) {
        setMsg("❌ " + (add?.error || "Erreur stockage module."), false);
        rolling = false;
        return;
      }

      user = getCurrentUserFull();

      const bonusesText = mod.bonuses
        .map((b) => `<strong style="color: #00d9ff;">${b.pct}%</strong> ${formatStatLabel(b.stat)}`)
        .join(" • ");

      res.innerHTML = `
        <div style="margin-top:12px; padding: 12px; background: rgba(0,217,255,0.1); border: 1px solid rgba(0,217,255,0.3); border-radius: 12px;">
          <div style="font-size: 16px; font-weight: 900; color: #00ff88; margin-bottom: 8px;">✅ Module Gagné!</div>
          <div style="color: var(--text);"><strong>${mod.type.toUpperCase()}-${mod.tier.toUpperCase()}</strong></div>
          <div style="color: var(--muted); font-size: 13px;">Vaisseau: <strong>${mod.shipId}</strong></div>
          <div style="color: var(--muted); font-size: 13px; margin-top: 4px;">Bonus: ${bonusesText}</div>
        </div>
      `;

      setMsg("✅ Tirage réussi !", true);

      renderHeader(user);
      renderStats(user);
      if (shopCredits) shopCredits.textContent = formatNumber(user.credits || 0);
      syncGameCredits();

      rolling = false;
    };

    tick();
  });
}

function renderShopPreview(user, it, cat) {
  const price = Number(it?.price || 0);
  const can = Number(user?.credits || 0) >= price;
  const isShip = cat === "ships";
  const shipId = it?.ship?.id || null;
  const owned = isShip ? alreadyOwnsShip(user, shipId) : false;
const counts = user?.inventory?.counts || {};
const countOwned = Number(counts[it?.id] || 0);

const ammoQty = getAmmoQtyForShopItem(user, it);

let stockLine = "";

if (!isShip && ammoQty) {
  stockLine = `
    <p style="margin: 8px 0;">
      Quantité possédée : 
      <strong style="color: #00d9ff;">${formatNumber(ammoQty.qty)}</strong>
    </p>
  `;
} else if (!isShip) {
  stockLine = `
    <p style="margin: 8px 0;">
      Stock possédé : 
      <strong style="color: #00d9ff;">${formatNumber(countOwned)}</strong>
    </p>
  `;
}

  let gainLine = "";
  if (it?.give?.ammo) {
    const entries = Object.entries(it.give.ammo)
      .filter(([k]) => k !== "x1")
      .map(([k, v]) => `${String(k).toUpperCase()} <strong>+${Number(v)}</strong>`);
    if (entries.length) {
      gainLine = `<p style="margin: 8px 0;">Gain munitions: ${entries.join(" • ")}</p>`;
    }
  }

  const imgSrc = isShip ? shipPreviewSrc(shipId) : iconForItem(it, cat);

  let previewHtml = "";
  
  if (isShip) {
    // Récupérer les dimensions du vaisseau depuis SHIP_PACKS
    const pack = getShipPack(shipId);
    const shipW = pack?.w || 200;
    const shipH = pack?.h || 200;
    
    // Container de 400x400px
    const containerSize = 400;
    
    // Calculer le scale pour que le vaisseau rentre dans le container
    const scale = Math.min(containerSize / shipW, containerSize / shipH, 1) * 0.8; // 0.8 pour laisser un peu de marge
    
    previewHtml = `
      <div class="shipPreviewContainer">
        <img src="${imgSrc}" alt="${it?.name || it?.id}"
             style="width: ${shipW}px; height: ${shipH}px; transform: scale(${scale});" />
      </div>
    `;
  } else {
    previewHtml = `
      <img src="${imgSrc}" alt="${it?.name || it?.id}" class="bigImg" 
           style="image-rendering: auto;" />
    `;
  }

  shopPreview.innerHTML = `
    <div class="tile">
      ${previewHtml}

      <h3>
        ${it?.name || it?.id} 
        ${owned ? `<span class="pill">Possédé</span>` : ""}
      </h3>

      ${gainLine}
      ${stockLine}
      
      <p style="margin: 12px 0; font-size: 18px;">
        <strong style="color: #00d9ff;">Prix:</strong> 
        <span style="font-weight: 900; color: #00ff88;">${formatNumber(price)}</span> crédits
      </p>

      <button id="btnBuyPreview" class="primary" style="width: 100%;" ${(!can || owned) ? "disabled" : ""}>
        ${owned ? '✅ Déjà possédé' : `💰 Acheter (${formatNumber(price)})`}
      </button>
    </div>
  `;

  const btn = document.getElementById("btnBuyPreview");
  if (!btn) return;

  btn.addEventListener("click", () => {
    console.log("Click sur btnBuyPreview détecté !", { owned, can });
    
    if (owned || !can) return;

    const itemName = it?.name || it?.id;
    const priceFormatted = formatNumber(price);

    console.log("Affichage confirmation pour:", itemName);

    showConfirm(
      '💰 Confirmer l\'achat',
      `Voulez-vous acheter "${itemName}" pour ${priceFormatted} crédits ?`,
      () => {
        console.log("Confirmation OK, achat en cours...");
        const out = buyItem(it.id);
        if (!out?.ok) {
          showToast(out?.error || "Achat impossible", 'error');
          return;
        }

        showToast(`✅ ${itemName} acheté avec succès !`, 'success');

        user = getCurrentUserFull();
        renderHeader(user);
        renderStats(user);
        renderHangars(user);
        renderShop(user);
        setTab("shop");
        syncGameCredits();
      }
    );
  });
}

// ------------------------------------
// FIT MODAL (Équiper)
// ------------------------------------
function buildModalShell() {
  const overlay = document.createElement("div");
  overlay.id = "fitOverlay";
overlay.style.cssText = `
  position:fixed; inset:0; background:rgba(0,0,0,0.75);
  display:none; place-items:center; z-index:70000;
  padding:18px;
  overflow:auto;
  backdrop-filter: blur(8px);
`;

const card = document.createElement("div");
  card.style.cssText = `
    width: min(1400px, 96vw);
    max-height: calc(100vh - 36px);
    overflow: auto;
    background: linear-gradient(135deg, rgba(10,12,28,0.98), rgba(5,8,20,0.98));
    border: 1px solid rgba(0,217,255,0.3);
    border-radius: 18px;
    box-shadow: 0 20px 60px rgba(0,0,0,0.7), 0 0 100px rgba(0,217,255,0.2);
    padding: 20px;
  `;

  card.innerHTML = `
<style>
  :root{
    --fit-panel: rgba(255,255,255,0.04);
    --fit-border2: rgba(100,200,255,0.2);
    --fit-text: #e8f4ff;
    --fit-muted: rgba(232,244,255,0.6);
    --fit-accent: rgba(0,217,255,0.6);
    --fit-accentBg: rgba(0,217,255,0.15);
  }

  .fitTop{
    display:flex;
    align-items:flex-start;
    justify-content:space-between;
    gap:12px;
    flex-wrap:wrap;
    margin-bottom: 16px;
  }
  .fitTopTitle{ 
    font-weight:900; 
    font-size:24px; 
    background: linear-gradient(135deg, #ffffff, #00d9ff);
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
  }
  .fitTopSub{ color:var(--fit-muted); font-size:13px; margin-top:6px; }

  .fitLayout{
    margin-top:14px;
    display:grid;
    grid-template-columns: 280px 1fr 360px;
    gap:12px;
    align-items:start;
    min-width:0;
  }

  @media (max-width: 1400px){
    .fitLayout{ grid-template-columns: 1fr; }
    #fitCard{ height:auto !important; overflow:auto !important; }
  }

  .fitPanel{
    min-width:0;
    min-height:0;
    border:1px solid var(--fit-border2);
    background: linear-gradient(135deg, rgba(255,255,255,0.06), rgba(100,200,255,0.03));
    border-radius:16px;
    padding:16px;
    display:flex;
    flex-direction:column;
    overflow:hidden;
    backdrop-filter: blur(12px);
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
  }

  .fitInvScroll{
    flex: 1 1 auto;
    min-height: 0;
    max-height: calc(92vh - 210px);
    overflow-y: auto;
    overflow-x: hidden;
    padding-right: 6px;
    scrollbar-width: thin;
  }
  .fitInvScroll::-webkit-scrollbar{ width: 10px; }
  .fitInvScroll::-webkit-scrollbar-track{ background: rgba(255,255,255,0.05); border-radius: 10px; }
  .fitInvScroll::-webkit-scrollbar-thumb{ background: rgba(0,217,255,0.3); border-radius: 10px; }
  .fitInvScroll::-webkit-scrollbar-thumb:hover{ background: rgba(0,217,255,0.5); }

  .fitShipWrap{ display:grid; gap:12px; place-items:center; }
  #fitShipCanvas{
    width:220px;height:220px;border-radius:16px;
    border:1px solid rgba(0,217,255,0.3);
    background: rgba(0,0,0,0.25);
    image-rendering: pixelated;
    box-shadow: 0 8px 24px rgba(0,0,0,0.4);
  }
  .fitShipMeta{ text-align:center; display:grid; gap:4px; }
  #fitShipName{ color:var(--fit-text); font-weight: 900; font-size: 16px; }
  #fitShipHint{ color:var(--fit-muted); font-size:12px; line-height: 1.4; }

  .fitGroupTitle{ 
    font-weight:900; 
    margin-bottom:10px; 
    color: #00d9ff;
    font-size: 14px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .slotGrid{
    display:grid;
    grid-template-columns: repeat(10, minmax(46px, 1fr));
    gap:6px;
    align-content:start;
    min-width:0;
  }

  .slotCell{
    width:100%;
    aspect-ratio: 1 / 1;
    border-radius:10px;
    border:1px solid rgba(100,200,255,0.2);
    background: rgba(255,255,255,0.06);
    display:grid;
    place-items:center;
    cursor:pointer;
    user-select:none;
    overflow:hidden;
    transition: all 0.3s ease;
  }
  .slotCell:hover{
    border-color: rgba(0,217,255,0.4);
    background: rgba(255,255,255,0.1);
  }
  .slotCell img{
    width:90%;height:90%;
    object-fit:contain;
    image-rendering:pixelated;
  }
  .slotCell.filled{
    background: rgba(0,217,255,0.15);
    border-color: rgba(0,217,255,0.5);
  }

  .fitInvTop{
    display:flex;
    align-items:flex-start;
    justify-content:space-between;
    gap:10px;
    flex-wrap:wrap;
    margin-bottom: 12px;
  }
  .fitBtnRow{
    display:flex;
    gap:8px;
    flex-wrap:wrap;
    align-items:center;
  }

  .fitSelect, .fitInput{
    padding:10px 14px;
    border-radius:12px;
    border:1px solid rgba(100,200,255,0.25);
    background: rgba(255,255,255,0.06);
    color:var(--fit-text);
    font-weight:700;
    outline:none;
    font-size: 13px;
  }
  .fitInput{ width:180px; }

  .invGrid{
    display:grid;
    grid-template-columns: repeat(7, 40px);
    gap:6px;
    align-content:start;
    justify-content:start;
    min-width:0;
  }

  .invCell{
    width:40px;height:40px;border-radius:10px;
    border:1px solid rgba(100,200,255,0.2);
    background: rgba(255,255,255,0.06);
    cursor:pointer;
    display:grid;
    place-items:center;
    position:relative;
    overflow:hidden;
    transition: all 0.3s ease;
  }
  .invCell:hover{
    border-color: rgba(0,217,255,0.4);
    background: rgba(255,255,255,0.1);
  }
  .invCell.selected{
    border-color: var(--fit-accent);
    background: var(--fit-accentBg);
    box-shadow: 0 0 12px rgba(0,217,255,0.3);
  }
  .invCell.disabled{
    opacity:0.3;
    cursor:not-allowed;
  }
  .invCell img{
    width:34px;height:34px;
    object-fit:contain;
    image-rendering:pixelated;
    display:block;
    pointer-events:none;
  }

  .fitHr{ margin:16px 0; border:0; border-top:1px solid rgba(100,200,255,0.2); }
  .fitHelp{ 
    margin-top:12px; 
    color:rgba(232,244,255,0.5); 
    font-size:12px; 
    line-height:1.4; 
  }
  
  .shipModRow{
    border:1px solid rgba(100,200,255,0.2);
    background:rgba(255,255,255,0.04);
    border-radius:12px;
    padding:10px;
    display:flex;
    gap:10px;
    align-items:center;
    cursor:grab;
    transition: all 0.3s ease;
  }
  .shipModRow:hover{
    border-color: rgba(0,217,255,0.4);
    background: rgba(0,217,255,0.08);
    transform: translateY(-2px);
  }
  .shipModRow:active{
    cursor: grabbing;
  }
</style>

    <div class="fitTop">
      <div>
        <div id="fitTitle" class="fitTopTitle">⚙️ Équipement</div>
        <div id="fitSub" class="fitTopSub">...</div>
      </div>
      <div style="display:flex; gap:10px; flex-wrap:wrap;">
        <button id="fitBtnPresets" class="secondary">📋 Presets</button>
        <button id="fitBtnCancel" class="secondary">✖ Annuler</button>
        <button id="fitBtnSave" class="primary">✅ Appliquer</button>
      </div>
    </div>

    <div id="fitErr" class="msg err" style="display:none; margin-bottom:12px;"></div>

    <div class="fitLayout">
      <div class="fitPanel">
        <div class="fitShipWrap">
          <canvas id="fitShipCanvas" width="220" height="220"></canvas>
          <div class="fitShipMeta">
            <b id="fitShipName">—</b>
            <span id="fitShipHint">Glisse un item depuis l'inventaire ou clique sur un slot</span>
          </div>
        </div>
      </div>

      <div class="fitPanel">
        <div style="display:grid; gap:16px;">
          <div>
            <div class="fitGroupTitle">🔫 Lasers</div>
            <div id="fitSlotsLasers" class="slotGrid"></div>
          </div>

          <div>
            <div class="fitGroupTitle">⚡ Générateurs</div>
            <div id="fitSlotsGens" class="slotGrid"></div>
          </div>

          <div>
            <div class="fitGroupTitle">🛡️ Extras</div>
            <div id="fitSlotsExtras" class="slotGrid"></div>
          </div>

          <div>
            <div class="fitGroupTitle">✨ Modules Roulette (<span id="shipModsCount">1</span> slots)</div>
            <div id="fitSlotsShipMods" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(46px,56px));max-width:100%;gap:6px;"></div>
          </div>
        </div>
      </div>

      <div class="fitPanel">
        <div class="fitInvTop">
          <div style="font-weight:900; color: #00d9ff;">📦 Inventaire</div>

          <div class="fitBtnRow">
            <select id="fitInvFilter" class="fitSelect">
              <option value="all">Tout</option>
              <option value="laser">Lasers</option>
              <option value="speed">Vitesse</option>
              <option value="shield">Bouclier</option>
              <option value="extra">Extras</option>
            </select>

            <button id="fitBtnClearSel" class="secondary" title="Désélectionner">
              🗑️
            </button>

            <button id="fitBtnSell" class="secondary" disabled title="Vendre (50% du prix)">
              💰
            </button>

            <button id="fitBtnResetAll" class="secondary" title="Tout retirer">
              ♻️
            </button>
          </div>
        </div>

        <div class="fitInvScroll">
          <div id="fitInvGrid" class="invGrid"></div>
          <hr class="fitHr" />
          <div style="font-weight:900; margin-bottom:10px; color: #00d9ff;">✨ Modules Roulette</div>
          <div id="fitShipModules" style="display:grid;gap:8px;"></div>
        </div>

      </div>
    </div>

    <div id="presetOverlay" style="
      position:fixed; inset:0;
      background:rgba(0,0,0,0.75);
      display:none; place-items:center;
      z-index:71000;
      backdrop-filter: blur(8px);
    ">
      <div style="
        width:min(560px, 94vw);
        background: linear-gradient(135deg, rgba(10,12,28,0.98), rgba(5,8,20,0.98));
        border:1px solid rgba(0,217,255,0.3);
        border-radius:16px;
        box-shadow: 0 20px 60px rgba(0,0,0,0.7);
        padding:20px;
      ">
        <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:16px;">
          <div style="font-weight:900; font-size: 18px; color: #00d9ff;">📋 Presets</div>
          <button id="presetClose" class="secondary">✖ Fermer</button>
        </div>

        <div class="fitBtnRow" style="margin-bottom:12px;">
          <input id="fitPresetName" class="fitInput" placeholder="Nom du preset..." />
          <button id="fitBtnSavePreset" class="primary">💾 Sauver</button>
          <button id="fitBtnQuickLoad" class="secondary">📥 Charger</button>
        </div>

        <div class="fitBtnRow">
          <select id="fitPresetSelect" class="fitSelect" style="flex:1; min-width:220px;">
            <option value="">— Choisir —</option>
          </select>
          <button id="fitBtnLoadPreset" class="secondary">✅ Appliquer</button>
          <button id="fitBtnDeletePreset" class="secondary">🗑️ Supprimer</button>
        </div>

        <div class="fitHelp">
          💡 Sauvegarde ta configuration actuelle pour la recharger plus tard.
        </div>
      </div>
    </div>
  `;

  overlay.appendChild(card);
document.body.appendChild(overlay);



overlay.addEventListener("click", (e) => {
  if (e.target === overlay) closeFitModal();
});

return overlay;
}

// -------- Ship rotating preview --------
const _fitShipCache = new Map();

function ensureShipFramesLoaded(shipId) {
  shipId = String(shipId || "");
  if (!shipId) return Promise.resolve(null);

  const existing = _fitShipCache.get(shipId);
  if (existing?.promise) return existing.promise;

  const pack = SHIP_PACKS.find((p) => p?.id === shipId);
  if (!pack) return Promise.resolve(null);

  const rec = { imgs: new Array(pack.frames || 1), ready: false, promise: null };
  rec.promise = (async () => {
    const frames = Math.max(1, Number(pack.frames || 1));
    const first = Number(pack.firstNumber || 1);
    const ext = pack.ext || ".png";
    const base = String(pack.path || "");
    const absBase = base.startsWith("/") ? base : "/" + base;

    const jobs = [];
    for (let i = 0; i < frames; i++) {
      const src = `${absBase}${first + i}${ext}`;
      jobs.push(
        new Promise((resolve) => {
          const img = new Image();
          img.src = src;
          img.onload = () => resolve(img);
          img.onerror = () => resolve(null);
        }).then((img) => {
          rec.imgs[i] = img;
        })
      );
    }
    await Promise.all(jobs);
    rec.ready = true;
    return rec;
  })();

  _fitShipCache.set(shipId, rec);
  return rec.promise;
}

let _fitShipAnimToken = 0;

function startFitShipAnim(shipId) {
  const canvas = document.getElementById("fitShipCanvas");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;

  const token = ++_fitShipAnimToken;
  const pack = SHIP_PACKS.find((p) => p?.id === shipId) || null;

  const draw = (t) => {
    if (token !== _fitShipAnimToken) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const rec = _fitShipCache.get(shipId);
    if (!pack || !rec?.ready) {
      requestAnimationFrame(draw);
      return;
    }

    const frames = Math.max(1, Number(pack.frames || rec.imgs.length || 1));
    const idx = Math.floor((t / 1000) * 18) % frames;
    const img = rec.imgs[idx] || rec.imgs[0];
    if (!img || !img.naturalWidth) {
      requestAnimationFrame(draw);
      return;
    }

    const baseW = Number(pack.w || img.naturalWidth || 160);
    const baseH = Number(pack.h || img.naturalHeight || 160);

    const pad = 0.88;
    const s = Math.min((canvas.width * pad) / baseW, (canvas.height * pad) / baseH, 1);

    const dw = baseW * s;
    const dh = baseH * s;

    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
    ctx.restore();

    requestAnimationFrame(draw);
  };

  requestAnimationFrame(draw);
}

function stopFitShipAnim() {
  _fitShipAnimToken++;
}

// ------------------------------------
// FIT STATE
// ------------------------------------
let fitOverlayEl = null;

let fitState = {
  hangarId: null,
  configNo: 1,
  selectedItemId: null,
  selectedCopyKey: null,
  draft: null,
  used: null,
  slots: { lasers: 15, gens: 15, extras: 15, shipMods: 1 },
};

function showFitError(text) {
  const el = document.getElementById("fitErr");
  if (!el) return;
  if (!text) {
    el.style.display = "none";
    el.textContent = "";
    return;
  }
  el.style.display = "block";
  el.textContent = "⚠️ " + text;
}

function computeUsage(draft) {
  const map = Object.create(null);
  const all = [...draft.lasers, ...draft.gens, ...draft.extras, ...(draft.shipMods || [])];
  for (const id of all) {
    if (!id) continue;
    map[id] = (map[id] || 0) + 1;
  }
  return map;
}

function isRouletteModuleId(id) {
  return typeof id === "string" && id.startsWith("mod_");
}

function canPlaceItem(itemId, draft) {
  if (!itemId) return true;
  const owned = ownedCount(user, itemId);
  const used = computeUsage(draft)[itemId] || 0;
  return used < owned;
}

function isItemAllowedInSlot(slotType, itemId) {
  if (!itemId) return true;

  if (slotType === "shipMods") {
    return isRouletteModuleId(itemId);
  }

  const it = findCatalogItem(itemId);
  if (!it?.module) return false;
  const t = it.module.type;

  if (slotType === "lasers") return t === "laser";
  if (slotType === "gens") return t === "speed" || t === "shield";
  if (slotType === "extras") return t === "extra";
  return false;
}

// -------------------- Presets --------------------
function presetStorageKey(u, hangarId) {
  const uid = String(u?.email || u?.pseudo || "guest");
  return `orbit_fit_presets:${uid}:${String(hangarId || "")}`;
}

function loadPresets(u, hangarId) {
  try {
    const raw = localStorage.getItem(presetStorageKey(u, hangarId));
    const obj = raw ? JSON.parse(raw) : {};
    return obj && typeof obj === "object" ? obj : {};
  } catch {
    return {};
  }
}

function savePresets(u, hangarId, presetsObj) {
  try {
    localStorage.setItem(presetStorageKey(u, hangarId), JSON.stringify(presetsObj || {}));
  } catch {}
}

function refreshPresetSelect() {
  const sel = document.getElementById("fitPresetSelect");
  if (!sel) return;

  const presets = loadPresets(user, fitState.hangarId);
  const names = Object.keys(presets).sort((a, b) => a.localeCompare(b));

  sel.innerHTML = `<option value="">— Choisir —</option>`;
  for (const n of names) {
    const opt = document.createElement("option");
    opt.value = n;
    opt.textContent = n;
    sel.appendChild(opt);
  }
}

function resetAllSlots() {
  if (!fitState?.draft) return;

  fitState.draft.lasers = fitState.draft.lasers.map(() => null);
  fitState.draft.gens = fitState.draft.gens.map(() => null);
  fitState.draft.extras = fitState.draft.extras.map(() => null);
  fitState.draft.shipMods = fitState.draft.shipMods.map(() => null);

  fitState.selectedItemId = null;
  fitState.selectedCopyKey = null;
  showFitError("");
  renderSlots();
  renderInventoryPalette();
  renderShipModulesList();
}

// -------------------- Inventory Palette --------------------
function renderInventoryPalette() {
  const grid = document.getElementById("fitInvGrid");
  const sel = document.getElementById("fitInvFilter");
  const clearBtn = document.getElementById("fitBtnClearSel");
  const sellBtn = document.getElementById("fitBtnSell");
  if (!grid) return;

  if (clearBtn) {
    clearBtn.onclick = () => {
      fitState.selectedItemId = null;
      fitState.selectedCopyKey = null;
      showFitError("");
      renderInventoryPalette();
    };
  }

  const filter = String(sel?.value || "all");
  grid.innerHTML = "";

  fitState.used = computeUsage(fitState.draft);

  if (sellBtn) {
    const id = fitState.selectedItemId;
    const owned = id ? ownedCount(user, id) : 0;
    const used = id ? Number(fitState.used?.[id] || 0) : 0;
    sellBtn.disabled = !id || owned <= used;
  }

  const counts = user?.inventory?.counts || {};
  const entries = Object.entries(counts)
    .map(([itemId, cnt]) => ({ itemId, cnt: Number(cnt || 0), it: findCatalogItem(itemId) }))
    .filter((x) => x.cnt > 0 && x.it?.module)
    .filter((x) => x.it?.module?.type !== "ammo");

  const filtered = entries.filter((e) => {
    const t = e.it?.module?.type;
    if (filter === "all") return true;
    return t === filter;
  });

  filtered.sort(
    (a, b) =>
      (a.it?.module?.type || "").localeCompare(b.it?.module?.type || "") ||
      (a.it?.name || a.itemId).localeCompare(b.it?.name || b.itemId)
  );

  for (const e of filtered) {
    const used = Number(fitState.used?.[e.itemId] || 0);
    const left = Math.max(0, e.cnt - used);

    for (let i = 0; i < e.cnt; i++) {
      const isAvailableCopy = i < left;
      const copyKey = `${e.itemId}#${i}`;

      const cell = document.createElement("div");
      cell.className =
        "invCell" +
        (fitState.selectedCopyKey === copyKey ? " selected" : "") +
        (!isAvailableCopy ? " disabled" : "");

      const img = document.createElement("img");
      img.src = iconForItem(e.it, e.it?.module?.type);
      img.alt = e.it?.name || e.itemId;
      img.onerror = () => {
        img.onerror = null;
        img.src = FALLBACK_ICON;
      };
      cell.appendChild(img);

      cell.title = `${e.it?.name || e.itemId} (${i + 1}/${e.cnt})`;

      cell.addEventListener("click", () => {
        if (!isAvailableCopy) {
          showFitError("Plus de stock disponible (dés-équipe d'abord)");
          return;
        }
        fitState.selectedItemId = e.itemId;
        fitState.selectedCopyKey = copyKey;
        showFitError("");
        renderInventoryPalette();
      });

      cell.draggable = isAvailableCopy;
      cell.addEventListener("dragstart", (ev) => {
        if (!isAvailableCopy) return ev.preventDefault();
        ev.dataTransfer.setData("text/plain", e.itemId);
        ev.dataTransfer.effectAllowed = "copy";

        fitState.selectedItemId = e.itemId;
        fitState.selectedCopyKey = copyKey;
      });

      grid.appendChild(cell);
    }
  }

  if (!filtered.length) {
    grid.innerHTML = `<div style="grid-column:1/-1;color:var(--fit-muted);font-size:12px;text-align:center;padding:20px;">Aucun item dans l'inventaire</div>`;
  }
}

function slotCell(label, filled, itemId = null) {
  const d = document.createElement("div");
  d.className = "slotCell" + (filled ? " filled" : "");
  d.title = label || "";

  if (filled && itemId) {
    const img = document.createElement("img");
    img.src = iconForItem({ id: itemId }, "modules");
    img.alt = label || itemId;
    img.draggable = false;
    img.onerror = () => {
      img.onerror = null;
      img.src = FALLBACK_ICON;
    };
    d.appendChild(img);
  }
  return d;
}

function renderSlots() {
  const lasersRoot = document.getElementById("fitSlotsLasers");
  const gensRoot = document.getElementById("fitSlotsGens");
  const extrasRoot = document.getElementById("fitSlotsExtras");
  const shipModsRoot = document.getElementById("fitSlotsShipMods");

  if (!lasersRoot || !gensRoot || !extrasRoot || !shipModsRoot) return;

  lasersRoot.innerHTML = "";
  gensRoot.innerHTML = "";
  extrasRoot.innerHTML = "";
  shipModsRoot.innerHTML = "";

  const draft = fitState.draft;
  fitState.used = computeUsage(draft);

  const onSlotClick = (slotType, idx) => {
    const selItem = fitState.selectedItemId;
    const cur = draft[slotType][idx] || null;

    if (!selItem) {
      if (cur) {
        draft[slotType][idx] = null;
        showFitError("");
        renderSlots();
        renderInventoryPalette();
      }
      return;
    }

    if (!isItemAllowedInSlot(slotType, selItem)) {
      showFitError("Ce module ne va pas dans ce type de slot");
      return;
    }

    if (cur === selItem) {
      draft[slotType][idx] = null;
      showFitError("");
      renderSlots();
      renderInventoryPalette();
      return;
    }

    const tmp = structuredClone(draft);
    tmp[slotType][idx] = null;
    if (!canPlaceItem(selItem, tmp)) {
      showFitError("Pas assez d'exemplaires disponibles");
      return;
    }

    draft[slotType][idx] = selItem;
    showFitError("");
    renderSlots();
    renderInventoryPalette();
  };

  const attachDrop = (cell, slotType, idx) => {
    cell.addEventListener("dragover", (ev) => {
      ev.preventDefault();
      ev.dataTransfer.dropEffect = "copy";
    });

    cell.addEventListener("drop", (ev) => {
      ev.preventDefault();
      const itemId = ev.dataTransfer.getData("text/plain");
      if (!itemId) return;

      if (!isItemAllowedInSlot(slotType, itemId)) {
        showFitError("Ce module ne va pas dans ce type de slot");
        return;
      }

      const tmp = structuredClone(draft);
      tmp[slotType][idx] = null;
      if (!canPlaceItem(itemId, tmp)) {
        showFitError("Pas assez d'exemplaires disponibles");
        return;
      }

      draft[slotType][idx] = itemId;
      fitState.selectedItemId = itemId;
      fitState.selectedCopyKey = itemId + "#drop";
      showFitError("");
      renderSlots();
      renderInventoryPalette();
    });
  };

  const L = Number(fitState?.slots?.lasers ?? 0);
  const G = Number(fitState?.slots?.gens ?? 0);
  const E = Number(fitState?.slots?.extras ?? 0);

  for (let i = 0; i < L; i++) {
    const slotType = "lasers";
    const id = draft.lasers[i];
    const label = id ? findCatalogItem(id)?.name || id : "—";
    const cell = slotCell(label, !!id, id);
    cell.addEventListener("click", () => onSlotClick(slotType, i));
    attachDrop(cell, slotType, i);
    lasersRoot.appendChild(cell);
  }

  for (let i = 0; i < G; i++) {
    const slotType = "gens";
    const id = draft.gens[i];
    const label = id ? findCatalogItem(id)?.name || id : "—";
    const cell = slotCell(label, !!id, id);
    cell.addEventListener("click", () => onSlotClick(slotType, i));
    attachDrop(cell, slotType, i);
    gensRoot.appendChild(cell);
  }

  for (let i = 0; i < E; i++) {
    const slotType = "extras";
    const id = draft.extras[i];
    const label = id ? findCatalogItem(id)?.name || id : "—";
    const cell = slotCell(label, !!id, id);
    cell.addEventListener("click", () => onSlotClick(slotType, i));
    attachDrop(cell, slotType, i);
    extrasRoot.appendChild(cell);
  }

  // ShipMods (slots dynamiques)
  const SM = Number(fitState?.slots?.shipMods ?? 1);
  
  for (let i = 0; i < SM; i++) {
    const slotType = "shipMods";
    const id = draft.shipMods[i];

    let label = "—";
    if (id) {
      const mod = (user?.inventory?.shipModules || []).find(m => m?.id === id);
      label = mod ? `${mod.type.toUpperCase()}-${mod.tier.toUpperCase()}` : id;
    }

    const cell = slotCell(label, !!id, null);

    if (id) {
      const mod = (user?.inventory?.shipModules || []).find(m => m?.id === id);
      const img = document.createElement("img");
      img.src = mod ? (MODULE_ICONS[mod.iconKey] || FALLBACK_ICON) : FALLBACK_ICON;
      img.draggable = false;
      cell.innerHTML = "";
      cell.appendChild(img);
      cell.classList.add("filled");
      cell.title = label;
    }

    cell.addEventListener("click", () => {
      if (!fitState.selectedItemId && draft.shipMods[i]) {
        draft.shipMods[i] = null;
        showFitError("");
        renderSlots();
        renderInventoryPalette();
        renderShipModulesList();
        return;
      }
      
      const selItem = fitState.selectedItemId;
      if (!selItem) {
        showFitError("Sélectionne un module roulette dans la liste");
        return;
      }

      if (!isItemAllowedInSlot("shipMods", selItem)) {
        showFitError("Ce module ne va pas dans ce slot");
        return;
      }

      const cur = draft.shipMods[i] || null;
      if (cur === selItem) {
        draft.shipMods[i] = null;
        showFitError("");
        renderSlots();
        renderInventoryPalette();
        renderShipModulesList();
        return;
      }

      const tmp = structuredClone(draft);
      tmp.shipMods[i] = null;

      const all = Array.isArray(user?.inventory?.shipModules) ? user.inventory.shipModules : [];
      const selModule = all.find(m => m?.id === selItem);
      
      if (!selModule) {
        showFitError("Module introuvable");
        return;
      }

      // Vérifier qu'on n'a pas déjà un module du même type
      const alreadyHasSameType = tmp.shipMods.some(modId => {
        if (!modId) return false;
        const mod = all.find(m => m?.id === modId);
        return mod && mod.type === selModule.type;
      });

      if (alreadyHasSameType) {
        showFitError(`Tu as déjà un module ${selModule.type.toUpperCase()} équipé`);
        return;
      }

      const used = computeUsage(tmp)[selItem] || 0;
      if (used >= 1) {
        showFitError("Module déjà utilisé");
        return;
      }

      draft.shipMods[i] = selItem;
      showFitError("");
      renderSlots();
      renderInventoryPalette();
      renderShipModulesList();
    });

    cell.addEventListener("dragover", (ev) => {
      ev.preventDefault();
      ev.dataTransfer.dropEffect = "copy";
    });

    cell.addEventListener("drop", (ev) => {
      ev.preventDefault();
      const moduleId = ev.dataTransfer.getData("text/plain");
      if (!moduleId) return;

      if (!isItemAllowedInSlot("shipMods", moduleId)) {
        showFitError("Ce module ne va pas dans ce slot");
        return;
      }

      const tmp = structuredClone(draft);
      tmp.shipMods[i] = null;

      const all = Array.isArray(user?.inventory?.shipModules) ? user.inventory.shipModules : [];
      const selModule = all.find(m => m?.id === moduleId);
      
      if (!selModule) {
        showFitError("Module introuvable");
        return;
      }

      // Vérifier qu'on n'a pas déjà un module du même type
      const alreadyHasSameType = tmp.shipMods.some(modId => {
        if (!modId) return false;
        const mod = all.find(m => m?.id === modId);
        return mod && mod.type === selModule.type;
      });

      if (alreadyHasSameType) {
        showFitError(`Tu as déjà un module ${selModule.type.toUpperCase()} équipé`);
        return;
      }

      const used = computeUsage(tmp)[moduleId] || 0;
      if (used >= 1) {
        showFitError("Module déjà utilisé");
        return;
      }

      draft.shipMods[i] = moduleId;
      fitState.selectedItemId = moduleId;
      showFitError("");
      renderSlots();
      renderInventoryPalette();
      renderShipModulesList();
    });

    shipModsRoot.appendChild(cell);
  }
}

function renderShipModulesList() {
  const root = document.getElementById("fitShipModules");
  if (!root) return;

  const u = getCurrentUserFull();
  if (!u) return;

  const h = (u.hangars || []).find(x => x?.id === fitState.hangarId);
  if (!h) {
    root.innerHTML = `<div style="color:var(--fit-muted);font-size:12px;text-align:center;padding:10px;">Hangar introuvable</div>`;
    return;
  }

  const all = Array.isArray(u?.inventory?.shipModules) ? u.inventory.shipModules : [];
  const list = all.filter(m => String(m?.shipId) === String(h.shipId));

  if (!list.length) {
    root.innerHTML = `<div style="color:var(--fit-muted);font-size:12px;text-align:center;padding:10px;">Aucun module pour ${h.shipId}</div>`;
    return;
  }

  root.innerHTML = list.slice().reverse().map((m) => {
    const icon = MODULE_ICONS[m.iconKey] || FALLBACK_ICON;
    const bonus = (m.bonuses || [])
      .map(b => `<strong style="color:#00d9ff;">${b.pct}%</strong> ${formatStatLabel(b.stat)}`)
      .join(" • ");

    return `
      <div class="shipModRow" data-modid="${m.id}">
        <img src="${icon}" style="width:40px;height:40px;object-fit:contain;image-rendering:pixelated;border-radius:10px;background:rgba(0,0,0,0.25);" />
        <div style="min-width:0;">
          <div style="font-weight:900; color:#00d9ff;">
            ${String(m.type || "").toUpperCase()}-${String(m.tier || "").toUpperCase()}
          </div>
          <div style="font-size:12px; color:var(--fit-muted); word-break:break-word;">
            ${bonus}
          </div>
        </div>
      </div>
    `;
  }).join("");

  root.querySelectorAll(".shipModRow").forEach((row) => {
    row.draggable = true;
    row.addEventListener("dragstart", (ev) => {
      ev.dataTransfer.setData("text/plain", row.dataset.modid);
      ev.dataTransfer.effectAllowed = "copy";
    });
  });
}

function getFitForConfig(h, configNo) {
  const cfg = Number(configNo) === 2 ? "2" : "1";

  return (
    h?.fits?.[cfg] ||
    h?.fit ||
    { lasers: [], gens: [], extras: [], shipMods: [] }
  );
}

function setFitModalConfig(configNo) {
  user = getCurrentUserFull();

  const h = (user?.hangars || []).find((x) => x?.id === fitState.hangarId);
  if (!h) return;

  fitState.configNo = Number(configNo) === 2 ? 2 : 1;

  const baseFit = getFitForConfig(h, fitState.configNo);

  fitState.slots = getShipSlots(h.shipId);

  fitState.draft = {
    lasers: normalizeFitArray(baseFit.lasers, fitState.slots.lasers),
    gens: normalizeFitArray(baseFit.gens, fitState.slots.gens),
    extras: normalizeFitArray(baseFit.extras, fitState.slots.extras),
    shipMods: normalizeFitArray(baseFit.shipMods, fitState.slots.shipMods),
  };

  fitState.selectedItemId = null;
  fitState.selectedCopyKey = null;
  fitState.used = computeUsage(fitState.draft);

  const titleEl = document.getElementById("fitTitle");
  if (titleEl) {
    titleEl.textContent = `⚙️ Équipement — ${h.shipId} — Config ${fitState.configNo}`;
    window.GameWindowManager?.setTitle(
  "fit",
  `Équipement — ${h.shipId} — Config ${fitState.configNo}`
);
  }

  document.querySelectorAll(".fitCfgBtn").forEach((b) => {
    b.classList.toggle("active", Number(b.dataset.cfg) === fitState.configNo);
  });

  renderSlots();
  renderInventoryPalette();
  renderShipModulesList();
}

function openFitModal(hangarId) {
  if (!fitOverlayEl) fitOverlayEl = buildModalShell();

  user = getCurrentUserFull();
  if (!user) return (location.href = "./auth.html");

  const h = (user.hangars || []).find((x) => x?.id === hangarId);
  if (!h) return setMsg("❌ Hangar introuvable", false);

  fitState.hangarId = hangarId;
  fitState.selectedItemId = null;
  fitState.selectedCopyKey = null;

 fitState.configNo = Number(h.activeConfig) === 2 ? 2 : 1;
fitState.slots = getShipSlots(h.shipId);

const baseFit = getFitForConfig(h, fitState.configNo);

fitState.draft = {
  lasers: normalizeFitArray(baseFit.lasers, fitState.slots.lasers),
  gens: normalizeFitArray(baseFit.gens, fitState.slots.gens),
  extras: normalizeFitArray(baseFit.extras, fitState.slots.extras),
  shipMods: normalizeFitArray(baseFit.shipMods, fitState.slots.shipMods),
};

const titleEl = document.getElementById("fitTitle");
const subEl = document.getElementById("fitSub");
if (titleEl) titleEl.textContent = `⚙️ Équipement — ${h.shipId} — Config ${fitState.configNo}`;
window.GameWindowManager?.setTitle(
  "fit",
  `Équipement — ${h.shipId} — Config ${fitState.configNo}`
);
  if (subEl) {
    subEl.textContent = `Slots: Lasers ${fitState.slots.lasers} • Génés ${fitState.slots.gens} • Extras ${fitState.slots.extras} • Modules ${fitState.slots.shipMods}`;
  }

  let cfgBar = document.getElementById("fitConfigBar");

if (!cfgBar) {
  cfgBar = document.createElement("div");
  cfgBar.id = "fitConfigBar";
  cfgBar.style.cssText = `
    display:flex;
    align-items:center;
    gap:8px;
    margin:10px 0 14px;
  `;

  cfgBar.innerHTML = `
    <span style="font-size:13px;color:rgba(232,244,255,.65);font-weight:800;">
      Configuration :
    </span>
    <button class="fitCfgBtn" data-cfg="1">1</button>
    <button class="fitCfgBtn" data-cfg="2">2</button>
  `;

  subEl.insertAdjacentElement("afterend", cfgBar);

  cfgBar.querySelectorAll(".fitCfgBtn").forEach((btn) => {
    btn.addEventListener("click", () => {
      setFitModalConfig(Number(btn.dataset.cfg));
    });
  });
}

cfgBar.querySelectorAll(".fitCfgBtn").forEach((b) => {
  b.classList.toggle("active", Number(b.dataset.cfg) === fitState.configNo);
});

  const shipNameEl = document.getElementById("fitShipName");
  if (shipNameEl) shipNameEl.textContent = h.shipId;

  const shipModsCountEl = document.getElementById("shipModsCount");
  if (shipModsCountEl) shipModsCountEl.textContent = fitState.slots.shipMods;

  showFitError("");

  const filterSel = document.getElementById("fitInvFilter");
  if (filterSel) {
    filterSel.onchange = () => {
      showFitError("");
      renderInventoryPalette();
    };
  }

  const btnReset = document.getElementById("fitBtnResetAll");
  if (btnReset) btnReset.onclick = () => resetAllSlots();

  // VENDRE
  const btnSell = document.getElementById("fitBtnSell");
  if (btnSell) {
    btnSell.onclick = () => {
      const itemId = fitState.selectedItemId;
      if (!itemId) return showFitError("Sélectionne un item à vendre");

      const usage = computeUsage(fitState.draft)[itemId] || 0;
      const owned = ownedCount(user, itemId);

      if (owned <= usage) {
        showFitError("Impossible: tout est équipé");
        return;
      }

      const out = sellItem(itemId, 1);
      if (!out.ok) {
        showFitError(out.error || "Vente impossible");
        return;
      }

      fitState.selectedItemId = null;
      fitState.selectedCopyKey = null;

      user = getCurrentUserFull();
      setMsg(`✅ Vendu (+${formatNumber(out.gain)} crédits)`, true);

      showFitError("");
      renderSlots();
      renderInventoryPalette();
      renderStats(user);
      renderHangars(user);
      if (tab === "shop") renderShop(user);
    };
  }

  // Presets
  refreshPresetSelect();

  const presetOverlay = document.getElementById("presetOverlay");
  const btnPresets = document.getElementById("fitBtnPresets");
  const btnPresetClose = document.getElementById("presetClose");

  if (btnPresets && presetOverlay) {
    btnPresets.onclick = () => {
      refreshPresetSelect();
      presetOverlay.style.display = "grid";
    };
  }
  if (btnPresetClose && presetOverlay) {
    btnPresetClose.onclick = () => {
      presetOverlay.style.display = "none";
    };
  }
  if (presetOverlay) {
    presetOverlay.onclick = (e) => {
      if (e.target === presetOverlay) presetOverlay.style.display = "none";
    };
  }

  const selPreset = document.getElementById("fitPresetSelect");
  const btnQuickLoad = document.getElementById("fitBtnQuickLoad");
  if (btnQuickLoad && selPreset) {
    btnQuickLoad.onclick = () => {
      const key = String(selPreset.value || "");
      if (!key) return showFitError("Choisis un preset");
      document.getElementById("fitBtnLoadPreset")?.click();
    };
  }

  const btnSavePreset = document.getElementById("fitBtnSavePreset");
  const inpPresetName = document.getElementById("fitPresetName");
  if (btnSavePreset && inpPresetName) {
    btnSavePreset.onclick = () => {
      const name = String(inpPresetName.value || "").trim();
      if (!name) return showFitError("Donne un nom au preset");
      const presets = loadPresets(user, fitState.hangarId);
      presets[name] = structuredClone(fitState.draft);
      savePresets(user, fitState.hangarId, presets);
      inpPresetName.value = "";
      showFitError("");
      refreshPresetSelect();
      setMsg("✅ Preset sauvegardé", true);
    };
  }

  const btnLoad = document.getElementById("fitBtnLoadPreset");
  if (btnLoad && selPreset) {
    btnLoad.onclick = () => {
      const key = String(selPreset.value || "");
      if (!key) return showFitError("Choisis un preset");
      const presets = loadPresets(user, fitState.hangarId);
      const p = presets[key];
      if (!p) return showFitError("Preset introuvable");

      fitState.draft = {
        lasers: normalizeFitArray(p.lasers, fitState.slots.lasers),
        gens: normalizeFitArray(p.gens, fitState.slots.gens),
        extras: normalizeFitArray(p.extras, fitState.slots.extras),
        shipMods: normalizeFitArray(p.shipMods, fitState.slots.shipMods),
      };

      fitState.selectedItemId = null;
      fitState.selectedCopyKey = null;
      showFitError("");
      renderSlots();
      renderInventoryPalette();
      renderShipModulesList();
      setMsg("✅ Preset chargé", true);
    };
  }

  const btnDel = document.getElementById("fitBtnDeletePreset");
  if (btnDel && selPreset) {
    btnDel.onclick = () => {
      const key = String(selPreset.value || "");
      if (!key) return showFitError("Choisis un preset");
      const presets = loadPresets(user, fitState.hangarId);
      if (!presets[key]) return showFitError("Preset introuvable");

      delete presets[key];
      savePresets(user, fitState.hangarId, presets);

      showFitError("");
      refreshPresetSelect();
      setMsg("✅ Preset supprimé", true);
    };
  }

  document.getElementById("fitBtnCancel").onclick = () => closeFitModal();

  document.getElementById("fitBtnSave").onclick = () => {
    const usage = computeUsage(fitState.draft);

    for (const [itemId, used] of Object.entries(usage)) {
      if (isRouletteModuleId(itemId)) {
        const all = Array.isArray(user?.inventory?.shipModules) ? user.inventory.shipModules : [];
        const hasIt = all.some(m => m?.id === itemId);

        const own = hasIt ? 1 : 0;
        if (used > own) {
          showFitError(`Module introuvable: ${itemId}`);
          return;
        }
        continue;
      }

      const own = ownedCount(user, itemId);
      if (used > own) {
        showFitError(`Trop de "${findCatalogItem(itemId)?.name || itemId}" équipés: ${used}/${own}`);
        return;
      }
    }

    const out = saveHangarFit(fitState.hangarId, fitState.draft, fitState.configNo);
    if (!out.ok) {
      showFitError(out.error || "Sauvegarde impossible");
      return;
    }

    user = getCurrentUserFull();
    setMsg("✅ Équipement sauvegardé !", true);

    closeFitModal();

    renderHeader(user);
    renderStats(user);
    renderHangars(user);
    if (tab === "shop") renderShop(user);
  };

fitState.used = computeUsage(fitState.draft);
renderSlots();
renderInventoryPalette();
renderShipModulesList();

fitOverlayEl.style.display = "grid";

ensureShipFramesLoaded(h.shipId).then(() => {
  if (!fitOverlayEl || fitOverlayEl.style.display === "none") return;
  startFitShipAnim(h.shipId);
});
}

function closeFitModal() {
  if (!fitOverlayEl) return;

  stopFitShipAnim();
  fitOverlayEl.style.display = "none";

  fitState.hangarId = null;
  fitState.configNo = 1;
  fitState.selectedItemId = null;
  fitState.selectedCopyKey = null;
  fitState.draft = null;
  fitState.used = null;

  showFitError("");

  const filterSel = document.getElementById("fitInvFilter");
  if (filterSel) filterSel.value = "all";

  const inv = document.getElementById("fitInvGrid");
  if (inv) inv.innerHTML = "";
  const a = document.getElementById("fitSlotsLasers");
  const b = document.getElementById("fitSlotsGens");
  const c = document.getElementById("fitSlotsExtras");
  const d = document.getElementById("fitSlotsShipMods");
  if (a) a.innerHTML = "";
  if (b) b.innerHTML = "";
  if (c) c.innerHTML = "";
  if (d) d.innerHTML = "";
}

// -------------------- Overlay intégré jeu --------------------
const AUTH_URL = location.pathname.includes("/public/")
  ? "./auth.html"
  : "./public/auth.html";

function openProfileOverlay() {
  saveGameBeforeProfileAction();

  user = getCurrentUserFull();

  if (!user) {
    location.href = AUTH_URL;
    return;
  }

  const overlay = document.getElementById("profileOverlay");
  if (window.GameWindowManager) window.GameWindowManager.restore("profileWindow");
  else if (overlay) overlay.style.display = "block";

  renderHeader(user);
  renderStats(user);
  renderHangars(user);
  renderShop(user);
  setTab(tab);
}

function closeProfileOverlay({ immediate = false } = {}) {
  const overlay = document.getElementById("profileOverlay");
  if (window.GameWindowManager && !immediate) window.GameWindowManager.minimize("profileWindow");
  else if (overlay) overlay.style.display = "none";
}

function registerProfileWindow() {
  const root = document.getElementById("profileOverlay");
  const card = document.getElementById("profileWindow");
  if (!root || !card || !window.GameWindowManager) return;
  window.GameWindowManager.register({
    id: "profileWindow",
    title: "Profil / Hangars / Boutique",
    icon: "👤",
    root,
    card,
  });
}

// -------------------- Boot --------------------
function boot() {
  setMsg("", true);

  user = getCurrentUserFull();

  if (!user) {
    location.href = AUTH_URL;
    return;
  }

  renderHeader(user);
  renderStats(user);
  renderHangars(user);
  renderShop(user);
  setTab(tab);

  closeProfileOverlay({ immediate: true });
}

// -------------------- Buttons --------------------
document.getElementById("btnGameHub")?.addEventListener("click", () => {
  openProfileOverlay();
});

btnLogout?.addEventListener("click", () => {
  logout();
  location.href = AUTH_URL;
});

btnStart?.addEventListener("click", () => {
  closeProfileOverlay();
});

window.HyperionProfile = {
  open: openProfileOverlay,
  close: closeProfileOverlay,
};

// Init
registerProfileWindow();
wireMainTabsOnce();
wireShopTabsOnce();
wireAccountSettingsOnce();
boot();
