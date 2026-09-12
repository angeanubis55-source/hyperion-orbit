import { inventoryPage } from "../UI/UI_INVENTORY.js";
// PUBLIC/PROFILE.js
"use strict";

import {
  getCurrentUserFull,
  logout,
  buyItem,
  sellItem,
  setActiveHangar,
  setHangarDesign,
  saveHangarLoadout,
  setActiveHangarConfig,
  buyModuleRoll,
  addShipModule,
  replaceShipModule,
  updateCurrentUserEmail,
  updateCurrentUserPseudo,
  updateCurrentUserPetPseudo,
  changeCurrentUserPassword,
  changeCurrentUserFaction,
  buyCurrentUserDrone,
  buyCurrentUserDroneFormation,
  setCurrentUserDroneFormation,
  getDroneFit,
  getPetFit,
} from "../SRC/CORE/ACCOUNT.js";

import { measureGameTask } from "../SRC/CORE/PERFORMANCE_TIMINGS.js";

import { CATALOG, findCatalogItem } from "../SRC/CORE/CATALOG.js";
import { SHIP_PACKS, getShipFamilyId, getShipFamilyMembers, getShipFamilyName, getShipDesignBaseId, getShipDesignIds, getShipPackById } from "../SHIP/SHIP_PACKS.js";
import { SHIP_ITEM_DIR, SHIP_ITEM_FULL_IDS, SHIP_ITEM_TRAIT_IDS, SHIP_TRAIT_DIR } from "../SHIP/SHIP_ITEMS.js";
import { escapeHtml } from "../UI/UI_DOM.js";
import { PILOT_RANKS, calculateRankPoints, getNpcExperienceReward, getNpcHonorReward, getQuestExperienceReward, getQuestHonorReward, getRankInfo } from "../SRC/CORE/PROGRESSION.js";
import { formatInteger } from "../SRC/CORE/NUMBER_FORMAT.js";
import { FACTIONS, getFaction } from "../SRC/CORE/FACTIONS.js";
import { NPC_TYPES } from "../NPC/NPC_TYPES.js";
import { QUEST_DEFINITIONS } from "../QUEST/QUEST_TYPES.js";
import { AMMO } from "../COMBAT/AMMO_TYPES.js";
import { getRocketType, rocketEffectLabel } from "../COMBAT/ROCKET_TYPES.js";
import { getResourceName } from "../SRC/DATA/RESOURCES.js";
import { getItemRarity, ITEM_RARITIES } from "../SRC/DATA/ITEM_RARITIES.js";
import { DRONE_FORMATIONS, DRONE_LEVEL_XP, DRONE_MAX_LEVEL, DRONE_TYPES, getDroneSpritePath, getIrisPrice } from "../DRONE/DRONE_TYPES.js";
import { emptyPetFit, getPetLevel, getPetLevelBonus, getPetLevelXp, getPetNextLevelXp, getPetSlots, getPetSpritePath } from "../PET/PET_TYPES.js";
import { MODULE_ALL_STATS, MODULE_PCT_BAN, MODULE_ROLL_COST, MODULE_SPC_STATS, MODULE_STAT_COUNT_WEIGHTS, MODULE_TIER_MALUS, MODULE_TIER_WEIGHTS, MODULE_TYPE_WEIGHTS, getModuleRarity, getModuleStatCountWeights, getStatMaxPct } from "../SRC/DATA/MODULE_DROPS.js";
import { appendToFitSlots, compactDroneEquipment, compactFitArray, compactFitDraft, compactPetFit, moveEquipmentSlots } from "../SRC/CORE/FIT_LAYOUT.js";
import { rarityForCatalogItem } from "../SRC/DATA/CRAFTING.js";
import { getBooster, formatBoosterDuration } from "../SRC/DATA/BOOSTERS.js";
import { PATCH_NOTES } from "../SRC/DATA/PATCH_NOTES.js";

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
const npcKillList = $("npcKillList");
const npcRewardTotals = $("npcRewardTotals");
const npcRankExp = $("npcRankExp");
const npcRankExpCalc = $("npcRankExpCalc");
const npcRankHonor = $("npcRankHonor");
const npcRankHonorCalc = $("npcRankHonorCalc");
const npcRankImage = $("npcRankImage");
const npcPreviousRankImage = $("npcPreviousRankImage");
const npcPreviousRankName = $("npcPreviousRankName");
const npcPreviousRankPoints = $("npcPreviousRankPoints");
const npcRankPoints = $("npcRankPoints");
const npcRankName = $("npcRankName");
const npcNextRankImage = $("npcNextRankImage");
const npcNextRankPoints = $("npcNextRankPoints");
const npcNextRankName = $("npcNextRankName");
const missionRewardSummary = $("missionRewardSummary");
const accountPseudo = $("accountPseudo");
const accountPseudoStatus = $("accountPseudoStatus");
const pseudoCurrentPassword = $("pseudoCurrentPassword");
const btnSavePseudo = $("btnSavePseudo");
const accountPetPseudo = $("accountPetPseudo");
const accountPetPseudoStatus = $("accountPetPseudoStatus");
const btnSavePetPseudo = $("btnSavePetPseudo");
const accountEmail = $("accountEmail");
const accountEmailStatus = $("accountEmailStatus");
const emailCurrentPassword = $("emailCurrentPassword");
const btnSaveEmail = $("btnSaveEmail");
const passwordCurrent = $("passwordCurrent");
const passwordNew = $("passwordNew");
const passwordConfirm = $("passwordConfirm");
const btnChangePassword = $("btnChangePassword");
const accountFaction = $("accountFaction");
const accountFactionStatus = $("accountFactionStatus");
const btnChangeFaction = $("btnChangeFaction");
const shopCredits = $("shopWindowCredits") || $("shopCredits");
const hangarGrid = $("hangarGrid");
const inventorySearch = $("inventorySearch");
const inventorySections = $("inventorySections");
const inventoryTooltip = $("inventoryTooltip");
const shopList = $("shopWindowList") || $("shopList");
const shopPreview = $("shopWindowPreview") || $("shopPreview");
const btnStart = $("btnStart");
const btnLogout = $("btnLogout");
const btnSessionMenu = $("btnSessionMenu");
const sessionMenu = $("sessionMenu");
const btnRestartGame = $("btnRestartGame");

// state
let user = null;
let storedTab = localStorage.getItem("orbit_profile_tab") || "stats";
if (storedTab === "shop" && document.getElementById("shopWindowPanel")) storedTab = "stats";
if (storedTab === "hangars" && document.getElementById("hangarWindowPanel")) storedTab = "stats";
let tab = storedTab;
let shopTab = localStorage.getItem("orbit_shop_tab") || "ammo";
let selectedShopItemId = null;
let selectedHangarId = null;
let shopRenderToken = 0;
let rouletteRailCells = [];
let moduleReroll = null;

// Coût de la prochaine relance d'un module : 5M de base, x5 par relance
// déjà effectuée. Le compteur est stocké sur le module (persisté en
// sauvegarde), donc il survit au re-render, au changement d'onglet et au reload.
function nextModuleRerollCost(rerollsDone) {
  return MODULE_ROLL_COST * Math.pow(5, (Number(rerollsDone) || 0) + 1);
}
let inventoryQuery = "";

// -------------------- UI helpers --------------------
function setMsg(text, ok = false) {
  const message = String(text ?? "").trim();

  // ✅ évite les toasts vides avec juste le check vert
  if (!message) return;

  showToast(message, ok ? "success" : "error");
}

function showToast(message, type = "info") {
  message = String(message ?? "").trim();

  // ✅ sécurité supplémentaire
  if (!message) return;

  // ✅ Dans le jeu (index.html), on passe par les indications rapides
  // (les lignes en haut de l'écran, comme les kills de NPC) au lieu des cartes toast.
  const engine = window.__ORBIT_ENGINE__;
  if (engine?.showToast) {
    const clean = message
      .replace(/^[\u2705\u274C\u26A0\u2139](?:\uFE0F)?[:\s,]*/, "")
      .trim();
    if (!clean) return;
    engine.showToast(clean);
    return;
  }

  const container = document.getElementById("toastContainer");
  if (!container) return;

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

// Fenêtre temporaire à l'achat du REX : choisir son pseudo.
// (La firme est native : celle du vaisseau, pas besoin de l'afficher.)
// Fenêtre construite en JS (Espace pilote + boutique partagent ce fichier).
function showPetNamingModal({ itemName, totalPrice, onConfirm }) {
  document.getElementById("petNamingOverlay")?.remove();
  const overlay = document.createElement("div");
  overlay.id = "petNamingOverlay";
  overlay.style.cssText = "position:fixed;inset:0;z-index:2000000;display:grid;place-items:center;background:rgba(3,8,18,.72);backdrop-filter:blur(3px);";
  overlay.innerHTML = `
    <div style="width:min(420px,92vw);background:#081826;border:1px solid rgba(0,217,255,.35);border-radius:12px;padding:20px;box-shadow:0 20px 60px rgba(0,0,0,.6);color:#e8f4ff;font-family:inherit;">
      <h3 style="margin:0 0 4px;font-size:17px;">Nommer ton REX</h3>
      <p style="margin:0 0 14px;font-size:12px;opacity:.7;">Achat "${escapeHtml(itemName)}" pour ${formatNumber(totalPrice)} crédits — choisis le pseudo de ton P.E.T.</p>
      <label style="display:block;font-size:11px;font-weight:800;letter-spacing:1px;opacity:.7;margin-bottom:6px;">PSEUDO DU REX</label>
      <input id="petNamingInput" maxlength="32" value="REX" style="width:100%;box-sizing:border-box;background:#04121f;border:1px solid rgba(0,217,255,.35);border-radius:8px;color:#e8f4ff;padding:10px 12px;font-size:15px;font-weight:800;" />
      <p id="petNamingError" style="display:none;margin:8px 0 0;font-size:12px;color:#ff7b8a;"></p>
      <div style="display:flex;gap:10px;margin-top:16px;">
        <button id="petNamingCancel" type="button" style="flex:1;background:transparent;border:1px solid rgba(255,255,255,.25);border-radius:8px;color:#e8f4ff;padding:10px;cursor:pointer;">Annuler</button>
        <button id="petNamingOk" type="button" style="flex:1;background:#00d9ff;border:none;border-radius:8px;color:#04222e;padding:10px;font-weight:900;cursor:pointer;">Acheter</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const input = overlay.querySelector("#petNamingInput");
  const err = overlay.querySelector("#petNamingError");
  const cleanup = () => overlay.remove();
  const fail = (text) => { if (err) { err.style.display = "block"; err.textContent = text; } };
  overlay.addEventListener("click", (e) => { if (e.target === overlay) cleanup(); });
  overlay.querySelector("#petNamingCancel")?.addEventListener("click", cleanup);
  overlay.querySelector("#petNamingOk")?.addEventListener("click", () => {
    const pseudo = String(input?.value || "").trim();
    if (pseudo.length < 3 || pseudo.length > 32) return fail("Le pseudo du REX doit contenir entre 3 et 32 caractères.");
    if (!/^[\p{L}\p{N}_ -]+$/u.test(pseudo)) return fail("Le pseudo du REX contient des caractères non autorisés.");
    cleanup();
    if (onConfirm) onConfirm(pseudo);
  });
  input?.focus();
  input?.select();
}

function ownedCount(u, itemId) {
  const n = Number(u?.inventory?.counts?.[itemId] || 0);
  return Number.isFinite(n) ? n : 0;
}

function alreadyOwnsShip(u, shipId) {
  if (!shipId) return false;
  return Array.isArray(u?.inventory?.ships) && u.inventory.ships.includes(String(shipId));
}

// un design est possédé s'il est dans shipDesigns (achat design) ou legacy ships
function alreadyOwnsDesign(u, shipId) {
  if (!shipId) return false;
  const id = String(shipId);
  return (
    (Array.isArray(u?.inventory?.shipDesigns) && u.inventory.shipDesigns.includes(id)) ||
    (Array.isArray(u?.inventory?.ships) && u.inventory.ships.includes(id))
  );
}

// id de vaisseau représenté par un item de boutique (base OU design)
function itemShipId(it) {
  return String(it?.ship?.id || it?.design?.id || "");
}

function getShopListFor(cat) {
  const direct = CATALOG?.[cat];
  if (Array.isArray(direct) && direct.length) {
    if (cat === "designs") {
      // groupe les designs par vaisseau de base (l'ordre du fichier est déjà cohérent)
      return [...direct].sort((a, b) => {
        const ab = String(a.design?.base || a.id);
        const bb = String(b.design?.base || b.id);
        return ab.localeCompare(bb) || String(a.name).localeCompare(String(b.name));
      });
    }
    if (cat === "petGears" || cat === "petProtocols") {
      return groupPetShopItems(direct);
    }
    return direct;
  }

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

// Gears/protocoles P.E.T : 1 ligne par famille (clé), achat 1 par 1 via le
// menu Niveau dans l'aperçu. Les niveaux verrouillés (P.E.T trop bas) sont
// désactivés dans le menu et se réactivent quand le P.E.T monte de niveau
// (la boutique se re-rend à chaque changement de niveau/XP du P.E.T).
const petShopLevelSel = {};
function petShopLevelOf(entry) {
  return Number(entry?.petGear?.level ?? entry?.petProtocol?.level ?? 1) || 1;
}
function groupPetShopItems(direct) {
  const groups = new Map();
  for (const it of direct) {
    const k = it?.petGear?.key || it?.petProtocol?.key || it?.id;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(it);
  }
  const out = [];
  for (const [k, levels] of groups) {
    levels.sort((a, b) => petShopLevelOf(a) - petShopLevelOf(b));
    const first = levels[0];
    const famName = String(first?.name || k).replace(/^([A-Z]+-[A-Z]+)\d+/, "$1");
    out.push({
      id: `petgrp_${k}`,
      name: famName,
      icon: first?.icon,
      price: Number(first?.price || 0),
      levels,
    });
  }
  return out;
}
function petShopSelectedLevel(group, user) {
  const levels = group?.levels || [];
  if (!levels.length) return 1;
  const petLevel = Math.max(0, Number(user?.pet?.level) || getPetLevel(user?.pet?.exp));
  const wanted = Number(petShopLevelSel[group.id]);
  if (levels.some((e) => petShopLevelOf(e) === wanted)) return wanted;
  const unlocked = levels.filter((e) => Math.max(0, Number(e?.petLevel) || 0) <= petLevel);
  return petShopLevelOf(unlocked[unlocked.length - 1] || levels[0]);
}

function formatNumber(num) {
  return formatInteger(num);
}

function getHangarActionAccess(action) {
  const integrated = !!document.getElementById("profileOverlay");
  if (!integrated) {
    return {
      ok: false,
      error: "Ouvre l'Espace pilote directement depuis le jeu pour effectuer cette action.",
    };
  }
  const access = window.__ORBIT_ENGINE__?.getHangarAccess?.();
  if (!access) return { ok: false, error: "Le moteur du jeu n'est pas encore prêt." };
  if (action === "activate" && !access.canActivate) return { ok: false, error: access.activationError };
  if (action === "equip" && !access.canEquip) return { ok: false, error: access.equipmentError };
  return { ok: true, access };
}

function getAmmoQtyForShopItem(u, it) {
  const ammoGive = it?.give?.ammo;
  const rocketGive = it?.give?.rockets;
  const give = (ammoGive && typeof ammoGive === "object")
    ? { store: u?.ammo, give: ammoGive }
    : (rocketGive && typeof rocketGive === "object")
      ? { store: u?.rockets, give: rocketGive }
      : null;

  if (!give) return null;

  const ammoKey = Object.keys(give.give).find((k) => k !== "x1");
  if (!ammoKey) return null;

  const qty = Number(give.store?.[ammoKey] || 0);

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
const ITEM_ICON_BASE = "/ASSETS/ITEMS/";
const LASER_ICON_BASE = "/ASSETS/LASERS/";
const FALLBACK_ICON = `data:image/svg+xml,${encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
    <rect width="64" height="64" rx="12" fill="#081b29"/>
    <path d="M32 14v24M32 48h.01" stroke="#70e6ff" stroke-width="6" stroke-linecap="round"/>
  </svg>
`)}`;

const ITEM_ICONS = {
  ammo_x1: ITEM_ICON_BASE + "AMMO_X1.png",
  ammo_x2: ITEM_ICON_BASE + "AMMO_X2.png",
  ammo_x3: ITEM_ICON_BASE + "AMMO_X3.png",
  ammo_x4: ITEM_ICON_BASE + "AMMO_X4.png",
  ammo_sab: ITEM_ICON_BASE + "AMMO_SAB.png",
  ammo_x6: ITEM_ICON_BASE + "AMMO_X6.png",
  ammo_rcb: ITEM_ICON_BASE + "AMMO_RCB.png",
  ammo_cbo: ITEM_ICON_BASE + "AMMO_CBO.png",
  ammo_job: ITEM_ICON_BASE + "AMMO_JOB.png",
  ammo_rb: ITEM_ICON_BASE + "AMMO_RB.png",
  ammo_pib: ITEM_ICON_BASE + "AMMO_PIB.png",
  ammo_idb: ITEM_ICON_BASE + "AMMO_IDB.png",
  ammo_vb: ITEM_ICON_BASE + "AMMO_VB.png",
  ammo_emaa: ITEM_ICON_BASE + "AMMO_EMAA.png",
  ammo_sbl: ITEM_ICON_BASE + "AMMO_SBL.png",
  ammo_abl: ITEM_ICON_BASE + "AMMO_ABL.png",
  // Roquettes : icônes de /COMBAT/ROCKET_SPRITES/ (ton dossier). Fallbacks automatiques si absent.
  rocket_r310: "/COMBAT/ROCKET_SPRITES/R-310_100X100.png",
  ammo_r310: "/COMBAT/ROCKET_SPRITES/R-310_100X100.png",
  rocket_eco10: "/COMBAT/ROCKET_SPRITES/ECO-10_100X100.png",
  ammo_eco10: "/COMBAT/ROCKET_SPRITES/ECO-10_100X100.png",
  rocket_plt2021: "/COMBAT/ROCKET_SPRITES/PLT-2021_100X100.png",
  ammo_plt2021: "/COMBAT/ROCKET_SPRITES/PLT-2021_100X100.png",
  rocket_plt2026: "/COMBAT/ROCKET_SPRITES/PLT-2026_100X100.png",
  ammo_plt2026: "/COMBAT/ROCKET_SPRITES/PLT-2026_100X100.png",
  rocket_plt3030: "/COMBAT/ROCKET_SPRITES/PLT-3030_100X100.png",
  ammo_plt3030: "/COMBAT/ROCKET_SPRITES/PLT-3030_100X100.png",
  rocket_ubr100: "/COMBAT/ROCKET_SPRITES/UBR-100_100X100.png",
  ammo_ubr100: "/COMBAT/ROCKET_SPRITES/UBR-100_100X100.png",
  rocket_dcr250: "/COMBAT/ROCKET_SPRITES/DCR-250_100X100.png",
  ammo_dcr250: "/COMBAT/ROCKET_SPRITES/DCR-250_100X100.png",
  rocket_cbr: "/COMBAT/ROCKET_SPRITES/CBR_100X100.png",
  ammo_cbr: "/COMBAT/ROCKET_SPRITES/CBR_100X100.png",
  rocket_pld8: "/COMBAT/ROCKET_SPRITES/PLD-8_100X100.png",
  ammo_pld8: "/COMBAT/ROCKET_SPRITES/PLD-8_100X100.png",
  rocket_sar01: "/COMBAT/ROCKET_SPRITES/SAR-01_100X100.png",
  ammo_sar01: "/COMBAT/ROCKET_SPRITES/SAR-01_100X100.png",
  rocket_sar02: "/COMBAT/ROCKET_SPRITES/SAR-02_100X100.png",
  ammo_sar02: "/COMBAT/ROCKET_SPRITES/SAR-02_100X100.png",
  rocket_hstrm01: "/COMBAT/ROCKET_SPRITES/HSTRM-01_100X100.png",
  ammo_hstrm01: "/COMBAT/ROCKET_SPRITES/HSTRM-01_100X100.png",
  rocket_bdr1211: "/COMBAT/ROCKET_SPRITES/BDR-1211_100X100.png",
  ammo_bdr1211: "/COMBAT/ROCKET_SPRITES/BDR-1211_100X100.png",
  rocket_pir100: "/COMBAT/ROCKET_SPRITES/PIR-100_100X100.png",
  ammo_pir100: "/COMBAT/ROCKET_SPRITES/PIR-100_100X100.png",
  rocket_wizx: "/COMBAT/ROCKET_SPRITES/WIZ-X_100X100.png",
  ammo_wizx: "/COMBAT/ROCKET_SPRITES/WIZ-X_100X100.png",
  rocket_ric3: "/COMBAT/ROCKET_SPRITES/R-IC3_100X100.png",
  ammo_ric3: "/COMBAT/ROCKET_SPRITES/R-IC3_100X100.png",
  rocket_rc100: "/COMBAT/ROCKET_SPRITES/RC-100_100X100.png",
  ammo_rc100: "/COMBAT/ROCKET_SPRITES/RC-100_100X100.png",
  rocket_sr5: "/COMBAT/ROCKET_SPRITES/SR-5_100X100.png",
  ammo_sr5: "/COMBAT/ROCKET_SPRITES/SR-5_100X100.png",
  rocket_agt500: "/COMBAT/ROCKET_SPRITES/AGT-500_100X100.png",
  ammo_agt500: "/COMBAT/ROCKET_SPRITES/AGT-500_100X100.png",
  rocket_sp100x: "/COMBAT/ROCKET_SPRITES/SP-100X_100X100.png",
  ammo_sp100x: "/COMBAT/ROCKET_SPRITES/SP-100X_100X100.png",
  rocket_k300m: "/COMBAT/ROCKET_SPRITES/K-300M_100X100.png",
  ammo_k300m: "/COMBAT/ROCKET_SPRITES/K-300M_100X100.png",
  rocket_bdr1212: "/COMBAT/ROCKET_SPRITES/BDR-1212_100X100.png",
  ammo_bdr1212: "/COMBAT/ROCKET_SPRITES/BDR-1212_100X100.png",
  rocket_shg01: "/COMBAT/ROCKET_SPRITES/SHG-01_100X100.png",
  ammo_shg01: "/COMBAT/ROCKET_SPRITES/SHG-01_100X100.png",
  rocket_shg02: "/COMBAT/ROCKET_SPRITES/SHG-02_100X100.png",
  ammo_shg02: "/COMBAT/ROCKET_SPRITES/SHG-02_100X100.png",
  spd_g3n1010: ITEM_ICON_BASE + "G3N-1010.png",
  spd_g3n2010: ITEM_ICON_BASE + "G3N-2010.png",
  spd_g3n3210: ITEM_ICON_BASE + "G3N-3210.png",
  spd_g3n3310: ITEM_ICON_BASE + "G3N-3310.png",
  spd_g3n6900: ITEM_ICON_BASE + "G3N-6900.png",
  spd_g3n7900: ITEM_ICON_BASE + "G3N-7900.png",
  shd_sg3na01: ITEM_ICON_BASE + "SG3N-A01.png",
  shd_fs01: ITEM_ICON_BASE + "FS-01.png",
  shd_sg3na02: ITEM_ICON_BASE + "SG3N-A02.png",
  shd_sg3na03: ITEM_ICON_BASE + "SG3N-A03.png",
  shd_fs02: ITEM_ICON_BASE + "FS-02.png",
  shd_fs03: ITEM_ICON_BASE + "FS-03.png",
  shd_sg3nb00: ITEM_ICON_BASE + "SG3N-B00.png",
  shd_sg3nb01: ITEM_ICON_BASE + "SG3N-B01.png",
  shd_sg3nb02: ITEM_ICON_BASE + "SG3N-B02.png",
  shd_fs04: ITEM_ICON_BASE + "FS-04.png",
  shd_sg3nb03: ITEM_ICON_BASE + "SG3N-B03.png",
  shd_sg3np01: ITEM_ICON_BASE + "SG3N-P01.png",
  shd_sg3npx01: ITEM_ICON_BASE + "SG3N-PX01.png",
  laser_lf1: LASER_ICON_BASE + "lf_1_100x100.png",
  laser_mp1: LASER_ICON_BASE + "mp_1_100x100.png",
  laser_lf2: LASER_ICON_BASE + "lf_2_100x100.png",
  laser_ulf4: LASER_ICON_BASE + "lf_4_unstable_100x100.png",
  laser_aa1: LASER_ICON_BASE + "aa_1_100x100.png",
  laser_lf3: LASER_ICON_BASE + "lf_3_100x100.png",
  laser_lf4: LASER_ICON_BASE + "lf_4_100x100.png",
  laser_osl: LASER_ICON_BASE + "os_l_100x100.png",
  laser_lf4hp: LASER_ICON_BASE + "lf_4_hp_100x100.png",
  laser_lf4md: LASER_ICON_BASE + "lf_4_md_100x100.png",
  laser_caucasus: LASER_ICON_BASE + "caucasus_100x100.png",
  laser_lf4pd: LASER_ICON_BASE + "lf_4_pd_100x100.png",
  laser_lf5: LASER_ICON_BASE + "lf_5_100x100.png",
  laser_lf5al: LASER_ICON_BASE + "lf_5_al_100x100.png",
  laser_lf5mf: LASER_ICON_BASE + "lf_5_mf_100x100.png",
  laser_lfp01: LASER_ICON_BASE + "lf_p01_100x100.png",
  laser_lfpx01: LASER_ICON_BASE + "lf_px01_100x100.png",
  laser_aap1: LASER_ICON_BASE + "aap_1_100x100.png",
  laser_prl: LASER_ICON_BASE + "pr_l_100x100.png",
};

const FALLBACK_ICONS = {
  ammo: ITEM_ICON_BASE + "AMMO_X2.png",
  rockets: "/COMBAT/ROCKET_SPRITES/R-310_100X100.png",
  launchers: "/COMBAT/ROCKET_SPRITES/HSTRM-01_100X100.png",
  speedGen: ITEM_ICON_BASE + "G3N-1010.png",
  shieldGen: ITEM_ICON_BASE + "SG3N-A01.png",
  lasers: LASER_ICON_BASE + "lf_1_100x100.png",
  speed: ITEM_ICON_BASE + "G3N-1010.png",
  shield: ITEM_ICON_BASE + "SG3N-A01.png",
  laser: LASER_ICON_BASE + "lf_1_100x100.png",
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
  if (stat === "laser_hit") return "Chance de réussite laser";
  if (stat === "exp") return "Expérience";
  if (stat === "honor") return "Honneur";
  return stat;
}

function rollModulePct(min, max) {
  let value = 0;
  let guard = 0;
  while (value === MODULE_PCT_BAN && guard < 16) {
    value = randInt(min, max);
    guard++;
  }
  return value;
}

function moduleFamilyId(module) {
  if (module?.familyId) return String(module.familyId);
  return getShipFamilyId(module?.shipId);
}

function familyBaseShipId(familyId) {
  const family = String(familyId || "");
  if (getShipPack(family)) return family;
  const members = getShipFamilyMembers().get(family) || [];
  let best = members[0] || family;
  for (const id of members) {
    const idSeg = String(id).split("_").length;
    const bestSeg = String(best).split("_").length;
    if (idSeg < bestSeg || (idSeg === bestSeg && String(id).length < String(best).length)) best = id;
  }
  return best;
}

function moduleRarityMeta(module) {
  const id = getModuleRarity(module?.bonuses?.length);
  const meta = ITEM_RARITIES[id] || ITEM_RARITIES.common;
  return { id, name: meta.name, color: meta.color };
}

function generateShipModule(user, opts = {}) {
  const tier = opts.tier || pickWeighted(MODULE_TIER_WEIGHTS);
  const type = opts.type || pickWeighted(MODULE_TYPE_WEIGHTS);
  const statCount = opts.statCount || pickWeighted(getModuleStatCountWeights(tier));

  const ships = Array.isArray(CATALOG?.ships) ? CATALOG.ships : [];
  const shipPick = ships.length ? ships[randInt(0, ships.length - 1)] : null;
  const shipId = opts.shipId || shipPick?.ship?.id || "UnknownShip";
  const familyId = opts.familyId || getShipFamilyId(shipId);

  // Malus (borne basse) fixé par le tier. Le cap positif dépend de la
  // COULEUR du module et de la stat tirée (getStatMaxPct).
  const mn = MODULE_TIER_MALUS[tier] ?? -4;

  let mainStat = "hp";
  if (type === "hp") mainStat = "hp";
  if (type === "shd") mainStat = "shield";
  if (type === "dmg") mainStat = "damage";
  if (type === "spc") mainStat = MODULE_SPC_STATS[randInt(0, MODULE_SPC_STATS.length - 1)];

  // Chaque stat est tirée indépendamment : bonus (+) ou malus (-).
  // Une stat hors de sa couleur est plafonnée à 5% (ex : Dégâts dans un
  // module bleu/Shield), sauf Exp/Honneur toujours à 12%.
  const picked = new Set([mainStat]);
  const bonuses = [{ stat: mainStat, pct: rollModulePct(mn, getStatMaxPct(mainStat, type)) }];

  const pool = MODULE_ALL_STATS.filter((s) => !picked.has(s));
  while (bonuses.length < statCount && pool.length) {
    const index = randInt(0, pool.length - 1);
    const s = pool.splice(index, 1)[0];
    picked.add(s);
    bonuses.push({ stat: s, pct: rollModulePct(mn, getStatMaxPct(s, type)) });
  }

  const rarity = getModuleRarity(bonuses.length);

  const now = Math.floor(Date.now() / 1000);
  const uid = Math.random().toString(16).slice(2, 8);

  return {
    id: `mod_${now}_${uid}`,
    kind: "shipModule",
    shipId,
    familyId,
    tier,
    type,
    bonuses,
    rarity,
    iconKey: `${type}-${tier}`,
    createdAt: now,
  };
}

function iconForItem(it, cat) {
  if (cat === "ships") return shipPreviewSrc(it?.ship?.id, 28);
  if (cat === "designs") return shipPreviewSrc(it?.design?.id, 28);
  if (it?.icon) return it.icon;
  const itemId = it?.id;
  if (itemId && ITEM_ICONS[itemId]) return ITEM_ICONS[itemId];
  if (cat && FALLBACK_ICONS[cat]) return FALLBACK_ICONS[cat];
  return FALLBACK_ICON;
}

function shipPreviewSrc(shipId, frameIndex = 28) {
  // Style uniforme 100x100 top-down : full-id puis trait, sinon frame sprite.
  // Clé canonique via le pack (gère les alias comme PhoenixBleu).
  const pack = getShipPackById(shipId);
  const key = pack?.id || shipId;
  if (key && SHIP_ITEM_FULL_IDS.has(String(key))) {
    return `${SHIP_ITEM_DIR}${key}.png`;
  }
  if (key && SHIP_ITEM_TRAIT_IDS.has(String(key))) {
    return `${SHIP_TRAIT_DIR}${key}.png`;
  }
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
  return getShipPackById(shipId);
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
  // En jeu (index.html avec #shopWindowPanel / #hangarWindowPanel), la
  // boutique et les hangars vivent dans leur propre fenêtre.
  // Sur la page standalone (PROFILE.html), ceux-ci restent des onglets du profil.
  if (next === "shop" && document.getElementById("shopWindowPanel")) next = "stats";
  if (next === "hangars" && document.getElementById("hangarWindowPanel")) next = "stats";
  // Hors Espace pilote intégré, changer d'onglet annule les brouillons
  // d'équipement ; en jeu, c'est la fermeture de la fenêtre Hangars qui s'en charge.
  if (!document.getElementById("hangarWindowPanel") && next !== "hangars" && fitOverlayEl && fitOverlayEl.style.display !== "none") {
    closeFitModal();
  }
  tab = next;
  localStorage.setItem("orbit_profile_tab", tab);

  if (tab === "patchnotes") renderPatchNotes();

  document.querySelectorAll("#profileWindow .tabBtn[data-tab], .tabs .tabBtn[data-tab]").forEach((b) => {
    b.classList.toggle("active", b.dataset.tab === tab);
  });

document.querySelectorAll("#profileWindow .profilePanel, .mainCard .panel").forEach((p) => {
  p.classList.remove("active");
});

const panel = document.getElementById("panel_" + tab);
if (panel) panel.classList.add("active");

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function wireMainTabsOnce() {
  if (inventoryTooltip && inventoryTooltip.parentElement !== document.body) {
    document.body.appendChild(inventoryTooltip);
  }
  document.querySelectorAll("#profileWindow .tabBtn[data-tab], .tabs .tabBtn[data-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      setMsg("", true);
      setTab(btn.dataset.tab);

      renderActiveProfilePanel();
    });
  });

  inventorySearch?.addEventListener("input", () => {
    inventoryQuery = inventorySearch.value || "";
    inventoryPageIndex = 0;
    renderInventory(user);
  });

  inventorySections?.addEventListener("pointermove", (event) => {
    const slot = event.target.closest(".inventorySlot");
    if (!slot || !inventoryTooltip) return;
    inventoryTooltip.textContent = slot.dataset.tooltip || "";
    inventoryTooltip.classList.add("visible");
    const margin = 14;
    const tooltipRect = inventoryTooltip.getBoundingClientRect();
    const left = Math.max(margin, Math.min(window.innerWidth - tooltipRect.width - margin, event.clientX + margin));
    const top = Math.max(margin, Math.min(window.innerHeight - tooltipRect.height - margin, event.clientY + margin));
    inventoryTooltip.style.left = `${left}px`;
    inventoryTooltip.style.top = `${top}px`;
  });
  inventorySections?.addEventListener("pointerleave", () => inventoryTooltip?.classList.remove("visible"));
}

function wireShopTabsOnce() {
  const root = document.getElementById("shopWindowTabs") || document.getElementById("shopTabs");
  root?.querySelectorAll(".tabBtn, .subtabBtn").forEach((btn) => {
    btn.addEventListener("click", () => {
      setShopTab(btn.dataset.shop);
    });
  });
}

function setShopTab(next) {
  if (!next) return;
  shopTab = next;
  localStorage.setItem("orbit_shop_tab", shopTab);
  document.querySelectorAll("#shopWindowTabs .tabBtn, #shopTabs .subtabBtn").forEach((button) => {
    button.classList.toggle("active", button.dataset.shop === shopTab);
  });
  if (user) renderShop(user);
}

function shopIsVisible() {
  const overlay = document.getElementById("shopOverlay");
  return !!overlay && overlay.style.display !== "none" && !overlay.hidden
    && !overlay.classList.contains("gameWinMinimized");
}

function refreshShopIfVisible() {
  try {
    if (shopIsVisible() && user) renderShop(user);
  } catch {}
}

// -------------------- Render --------------------
function renderHeader(u) {
  return u;
}

function renderStats(u) {
  if (!u) return;
  renderNpcStats(u);
  renderAccount(u);
}

const INVENTORY_AMMO_NAMES = Object.freeze({
  x1: "Munitions LCB-10 (X1)", x2: "Munitions MCB-25 (X2)",
  x3: "Munitions MCB-50 (X3)", x4: "Munitions UCB-100 (X4)",
  x6: "Munitions RSB-75 (X6)", sab: "Munitions SAB-50",
  rcb: "Munitions RCB-140", cbo: "Munitions CBO-100",
  job: "Munitions JOB-100", rb: "Munitions RB-214",
  pib: "Munitions PIB-100", idb: "Munitions IDB-125",
  vb: "Munitions VB-142", emaa: "Munitions EMAA-20",
  sbl: "Munitions SBL-100", abl: "Munitions A-BL",
  r310: "Roquette R-310",
});

function humanizeInventoryId(value) {
  return String(value || "Ressource")
    .replace(/^resource[_-]?/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function finiteInventoryQuantity(value) {
  if (value === Infinity || value === "Infinity") return Infinity;
  const quantity = Number(value);
  return Number.isFinite(quantity) && quantity > 0 ? quantity : 0;
}

function inventoryQuantityLabel(value) {
  return value === Infinity ? "∞" : formatNumber(value);
}

function catalogEntry(itemId) {
  for (const [category, entries] of Object.entries(CATALOG || {})) {
    const item = Array.isArray(entries) ? entries.find((entry) => entry?.id === itemId) : null;
    if (item) return { item, category };
  }
  return null;
}

function buildInventorySections(u) {
  const ammoItems = Object.entries(u?.ammo || {}).map(([id, rawQuantity]) => ({
    id, kind: "ammo",
    name: INVENTORY_AMMO_NAMES[id] || `Munitions ${humanizeInventoryId(id)}`,
    quantity: finiteInventoryQuantity(rawQuantity), detail: "Réserve de munitions",
  })).filter((entry) => entry.id !== "x1" && (entry.quantity > 0 || entry.quantity === Infinity));

  for (const [id, rawQuantity] of Object.entries(u?.rockets || {})) {
    const quantity = finiteInventoryQuantity(rawQuantity);
    if (!quantity) continue;
    const rocket = getRocketType(id);
    ammoItems.push({
      id, kind: "ammo",
      name: rocket?.name || INVENTORY_AMMO_NAMES[id] || `Roquette ${humanizeInventoryId(id)}`,
      quantity, detail: rocket?.manual === false ? "Roquettes de lance-roquettes" : "Réserve de roquettes",
    });
  }

  const equipment = [];
  const resources = new Map();
  for (const [itemId, rawQuantity] of Object.entries(u?.inventory?.counts || {})) {
    const quantity = finiteInventoryQuantity(rawQuantity);
    if (!quantity) continue;
    const found = catalogEntry(itemId);
    // Consumable purchase counts are not remaining stock. Their actual reserves
    // are already stacked above from u.ammo and u.rockets, including launcher ammo.
    if (found?.item.give?.ammo || found?.item.give?.rockets) continue;
    // Le P.E.T a sa propre section (niveau/XP) : pas de doublon dans Équipements.
    if (found?.category === "pets") continue;
    if (found && found.category !== "ammo" && found.category !== "ships") {
      let detail = ({ lasers: "Laser", speedGen: "Générateur de vitesse", shieldGen: "Générateur de bouclier", extras: "Extra", rockets: "Roquettes", launchers: "Lance-roquettes", petGears: "Gear P.E.T", petProtocols: "Protocole P.E.T" })[found.category] || "Équipement";
      if (found.item.petProtocol) detail = `Protocole P.E.T · +${Number(found.item.petProtocol.pct) || 0} % ${petProtocolStatLabel(found.item.petProtocol.key)}`;
      if (found.item.petGear) detail = `Gear P.E.T · ${found.item.desc || found.item.name}`;
      equipment.push({
        id: itemId, kind: "equipment", category: found.category, item: found.item,
        name: found.item.name || humanizeInventoryId(itemId), quantity,
        detail,
      });
    } else if (!found) {
      resources.set(itemId, { id: itemId, kind: "resource", name: getResourceName(itemId), quantity, detail: "Ressource" });
    }
  }

  for (const source of [u?.resources, u?.inventory?.resources]) {
    for (const [resourceId, rawQuantity] of Object.entries(source || {})) {
      const quantity = finiteInventoryQuantity(rawQuantity);
      if (!quantity) continue;
      const existing = resources.get(resourceId);
      resources.set(resourceId, {
        id: resourceId, kind: "resource", name: getResourceName(resourceId),
        quantity: (existing?.quantity || 0) + quantity, detail: "Ressource",
      });
    }
  }

  const modules = (u?.inventory?.shipModules || []).map((module, index) => {
    const compatibleShip = getShipPack(module?.shipId);
    const rarityMeta = moduleRarityMeta(module);
    return {
      id: module?.id || `module-${index}`, kind: "module", module,
      name: `${String(module?.type || "module").toUpperCase()} ${String(module?.tier || "").toUpperCase()}`.trim(), quantity: 1,
      detail: (module?.bonuses || []).map((bonus) => `${formatNumber(bonus?.pct || 0)}% ${formatStatLabel(bonus?.stat)}`).join(" · ") || "Module de vaisseau",
      rarityId: rarityMeta.id,
      searchText: `${module?.shipId || ""} ${compatibleShip?.name || ""} ${getShipFamilyName(moduleFamilyId(module))} ${rarityMeta.name}`,
    };
  });

  const ships = (u?.inventory?.ships || []).map((shipId) => {
    const pack = getShipPack(shipId);
    return { id: String(shipId), kind: "ship", name: pack?.name || String(shipId), quantity: 1, detail: "Vaisseau possédé" };
  });

  const shipDesigns = (u?.inventory?.shipDesigns || []).map((shipId) => {
    const pack = getShipPack(shipId);
    const baseId = getShipDesignBaseId(shipId) || shipId;
    const baseName = getShipPack(baseId)?.name || baseId;
    return {
      id: String(shipId), kind: "shipDesign", name: pack?.name || String(shipId), quantity: 1,
      detail: `Design de ${baseName}`,
    };
  });

  const drones = (u?.drones?.items || []).map((drone, index) => ({
    id: drone.id || `drone-${index}`,
    kind: "drone",
    drone,
    name: `${DRONE_TYPES[drone.type]?.name || "Drone"} ${index + 1}`,
    quantity: 1,
    detail: `Niveau ${drone.level || 1} · ${formatNumber(Math.floor(Number(drone.exp) || 0))} XP`,
  }));

  const storedDesigns = Array.isArray(u?.drones?.designs) ? u.drones.designs : [];
  const equippedDesigns = (u?.drones?.items || []).flatMap(drone => {
    if (drone?.fitsByHangar && typeof drone.fitsByHangar === "object" && !Array.isArray(drone.fitsByHangar)) {
      return Object.values(drone.fitsByHangar).flatMap(perHangar => [perHangar?.["1"]?.ability, perHangar?.["2"]?.ability]);
    }
    return [drone?.fits?.["1"]?.ability, drone?.fits?.["2"]?.ability, drone?.fit?.ability];
  }).filter(Boolean);
  const designs = [...storedDesigns, ...equippedDesigns].map((design, index) => {
    const value = typeof design === "string" ? { id: design, name: design } : (design || {});
    return {
      id: value.id || `drone-design-${index}`,
      kind: "droneDesign",
      design: value,
      name: value.name || humanizeInventoryId(value.id || "Design de drone"),
      quantity: 1,
      detail: "Design de drone",
    };
  });
  const droneFormations = (u?.drones?.formations || []).filter(id => id !== "standard").map(id => {
    const formation = DRONE_FORMATIONS.find(entry => entry.id === id);
    return {
      id: `formation-${id}`,
      kind: "droneFormation",
      formation,
      name: formation?.name || humanizeInventoryId(id),
      quantity: 1,
      detail: "Formation de drones possédée",
    };
  });

  const pets = u?.pet?.owned === true ? [{
    id: "pet_niveau1",
    kind: "pet",
    pet: u.pet,
    name: "P.E.T",
    quantity: 1,
    detail: `Niveau ${Math.max(0, Number(u.pet.level) || 0)} · ${formatNumber(Math.floor(Number(u.pet.exp) || 0))} XP · ${getPetLevelBonus(Math.max(0, Number(u.pet.level) || 0))}`,
  }] : [];

  return [
    { id: "ammo", title: "Munitions lasers", items: ammoItems },
    { id: "equipment", title: "Équipements", items: equipment },
    { id: "modules", title: "Modules de vaisseau", items: modules },
    { id: "ships", title: "Vaisseaux", items: ships },
    { id: "ship-designs", title: "Designs de vaisseaux", items: shipDesigns },
    { id: "drones", title: "Drones", items: drones },
    { id: "pets", title: "P.E.T", items: pets },
    { id: "drone-designs", title: "Designs de drones", items: designs },
    { id: "drone-formations", title: "Formations de drones", items: droneFormations },
    { id: "resources", title: "Ressources", items: [...resources.values()] },
  ];
}

function inventoryItemIcon(entry) {
  if (entry.kind === "ship") return shipPreviewSrc(entry.id);
  if (entry.kind === "shipDesign") return shipPreviewSrc(entry.id);
  if (entry.kind === "drone") return getDroneSpritePath(entry.drone, 29);
  if (entry.kind === "pet") return getPetSpritePath(entry.pet, 21);
  if (entry.kind === "droneDesign") return entry.design?.icon || FALLBACK_ICON;
  if (entry.kind === "droneFormation") return entry.formation?.icon || FALLBACK_ICON;
  if (entry.kind === "module") return moduleIconSrc(entry.module?.type, entry.module?.tier);
  if (entry.kind === "equipment") return iconForItem(entry.item, entry.category);
  if (entry.kind === "ammo") {
    const ammoId = entry.id === "sab" ? "ammo_sab" : `ammo_${String(entry.id).toLowerCase()}`;
    return ITEM_ICONS[ammoId] || FALLBACK_ICONS.ammo;
  }
  return FALLBACK_ICON;
}

function inventoryTooltipText(entry) {
  const lines = [entry.name];
  if (entry.rarity) lines.push(`Rareté : ${entry.rarity.name}`);
  if (entry.kind === "ammo") {
    const multiplier = Number(AMMO?.[entry.id]?.mult);
    if (Number.isFinite(multiplier)) lines.push(`Multiplicateur de dégâts : x${multiplier}`);
    const rocket = getRocketType(entry.id);
    if (rocket) {
      lines.push(rocketEffectLabel(rocket));
    }
    lines.push(`Quantité possédée : ${inventoryQuantityLabel(entry.quantity)}`);
  } else if (entry.kind === "equipment") {
    const module = entry.item?.module || {};
    if (Number.isFinite(Number(module.damage))) lines.push(`Dégâts : ${formatNumber(module.damage)}`);
    if (Number.isFinite(Number(module.bonusSpeed))) lines.push(`Vitesse : +${formatNumber(module.bonusSpeed)}`);
    if (Number.isFinite(Number(module.bonusShield))) lines.push(`Bouclier : +${formatNumber(module.bonusShield)}`);
    if (module.key) lines.push(`Effet : ${humanizeInventoryId(module.key)}`);
    if (entry.item?.petProtocol) lines.push(`Bonus : +${Number(entry.item.petProtocol.pct) || 0} % ${petProtocolStatLabel(entry.item.petProtocol.key)} (équipé sur le P.E.T)`);
    if (entry.item?.petGear && entry.item.desc) lines.push(entry.item.desc);
    lines.push(entry.detail);
  } else if (entry.kind === "ship") {
    const pack = getShipPack(entry.id);
    if (pack) {
      lines.push(`Points de vie : ${formatNumber(pack.hp || 0)}`);
      lines.push(`Vitesse : ${formatNumber(pack.speed || 0)}`);
      lines.push(`Slots : ${formatNumber(pack.slots?.lasers || 0)} lasers · ${formatNumber(pack.slots?.gens || 0)} générateurs · ${formatNumber(pack.slots?.extras || 0)} extras`);
    }
  } else if (entry.kind === "shipDesign") {
    lines.push(`Vaisseau de base : ${entry.detail.replace("Design de ", "")}`);
    const pack = getShipPack(entry.id);
    if (pack) {
      lines.push(`Points de vie : ${formatNumber(pack.hp || 0)}`);
      lines.push(`Vitesse : ${formatNumber(pack.speed || 0)}`);
      lines.push(`Slots : ${formatNumber(pack.slots?.lasers || 0)} lasers · ${formatNumber(pack.slots?.gens || 0)} générateurs · ${formatNumber(pack.slots?.extras || 0)} extras`);
    }
  } else if (entry.kind === "drone") {
    lines.push(entry.detail);
    lines.push("2 emplacements d'équipement");
  } else if (entry.kind === "pet") {
    lines.push(entry.detail);
    const petSlots = getPetSlots(Math.max(0, Number(entry.pet?.level) || 0));
    lines.push(`Emplacements : ${petSlots.lasers} lasers · ${petSlots.generators} générateurs · ${petSlots.gears} gears · ${petSlots.protocols} protocoles`);
    lines.push("Équipement exclusif par vaisseau et par config 1/2");
    lines.push("Gagne 5 % de ton XP");
  } else if (entry.kind === "droneDesign") {
    lines.push(entry.detail);
  } else if (entry.kind === "droneFormation") {
    lines.push(entry.formation?.description || entry.detail);
  } else if (entry.kind === "module") {
    if (entry.module?.shipId) {
      const rarityMeta = moduleRarityMeta(entry.module);
      lines.push(`Famille : ${getShipFamilyName(moduleFamilyId(entry.module))} (${rarityMeta.name})`);
      lines.push(`Vaisseau : ${getShipPack(entry.module.shipId)?.name || entry.module.shipId}`);
    }
    if (entry.detail) lines.push(entry.detail);
  } else {
    if (entry.detail) lines.push(entry.detail);
    lines.push(`Quantité : ${entry.quantityLabel || inventoryQuantityLabel(entry.quantity)}`);
  }
  return lines.filter(Boolean).join("\n");
}

function inventoryEntryRarity(entry) {
  if (entry.rarityId) return ITEM_RARITIES[entry.rarityId] || ITEM_RARITIES.common;

  let item = null;
  if (entry.kind === "ship") {
    item = (CATALOG?.ships || []).find((x) => x?.ship?.id === String(entry.id));
  } else if (entry.kind === "ammo") {
    item = findCatalogItem(`ammo_${String(entry.id).toLowerCase()}`);
  } else if (entry.kind === "equipment") {
    item = findCatalogItem(String(entry.id));
  } else if (entry.kind === "drone") {
    item = (CATALOG?.drones || []).find((x) => x?.drone?.type === entry.drone?.type);
  } else if (entry.kind === "pet") {
    item = (CATALOG?.pets || []).find((x) => x?.id === "pet_niveau1");
  } else if (entry.kind === "droneFormation") {
    item = (CATALOG?.formations || []).find((x) => x?.formation?.id === entry.formation?.id);
  }

  if (item) return ITEM_RARITIES[rarityForCatalogItem(item)] || ITEM_RARITIES.common;
  return getItemRarity(entry.id);
}

let lastInventorySignature = "";
let inventoryPageIndex = 0;
let inventoryPager = null;
function renderInventory(u) {
  return measureGameTask("ui.renderInventory", () => renderInventoryMeasured(u));
}

function renderInventoryMeasured(u) {
  if (!u || !inventorySections) return;
  const sections = buildInventorySections(u);
  const signature = JSON.stringify([inventoryQuery, inventoryPageIndex, sections]);
  if (signature === lastInventorySignature) return;
  lastInventorySignature = signature;

  const query = inventoryQuery.trim().toLocaleLowerCase("fr");
  const matching = sections.map(section => ({ ...section, items: section.items.filter(entry =>
    !query || `${entry.name} ${entry.detail} ${entry.id} ${entry.searchText || ""}`.toLocaleLowerCase("fr").includes(query)) }));
  const result = inventoryPage(matching, inventoryPageIndex);
  inventoryPageIndex = result.page;
  const { slots } = result;
  inventorySections.dataset.totalSlots = String(result.total);
  if (!inventoryPager) {
    inventoryPager = document.createElement("nav");
    inventoryPager.className = "inventoryPager";
    inventoryPager.setAttribute("aria-label", "Pages de l?inventaire");
    inventorySections.before(inventoryPager);
    inventoryPager.addEventListener("click", event => {
      const button = event.target.closest("[data-inventory-page]");
      if (!button || button.disabled) return;
      inventoryPageIndex += Number(button.dataset.inventoryPage);
      renderInventory(user);
      inventorySections.scrollTop = 0;
    });
  }
  inventoryPager.innerHTML = `<button data-inventory-page="-1" ${result.page === 0 ? "disabled" : ""}>Pr?c?dent</button>
    <span role="status">Page ${result.page + 1} / ${result.pages} ? ${formatNumber(result.total)} emplacements</span>
    <button data-inventory-page="1" ${result.page + 1 === result.pages ? "disabled" : ""}>Suivant</button>`;
  inventoryTooltip?.classList.remove("visible");
  inventorySections.innerHTML = slots.length ? slots.map((entry) => {
      const stacked = entry.stacked !== false && !["module", "ship", "equipment", "drone", "pet", "droneDesign", "droneFormation"].includes(entry.kind);
      const quantity = entry.quantityLabel || inventoryQuantityLabel(entry.quantity);
      const rarity = inventoryEntryRarity(entry);
      entry.rarity = rarity;
      return `<article class="inventorySlot rarity-${escapeHtml(rarity.id)}" data-rarity="${escapeHtml(rarity.id)}" data-kind="${escapeHtml(entry.kind)}" data-tooltip="${escapeHtml(inventoryTooltipText(entry))}" tabindex="0" aria-label="${escapeHtml(inventoryTooltipText(entry).replace(/\n/g, ". "))}">
        <img src="${escapeHtml(inventoryItemIcon(entry))}" alt="" />
        ${stacked ? `<span class="inventorySlotQuantity">${escapeHtml(quantity)}</span>` : ""}
      </article>`;
    }).join("") : `<div class="inventoryEmpty">${query ? "Aucun résultat." : "Aucun élément possédé."}</div>`;
}

function renderNpcStats(u) {
  if (!u) return;
  const kills = u.stats?.npcKills || {};

  const experience = Math.max(0, Number(u.stats?.exp || 0));
  const honor = Number(u.stats?.honor || 0);
  const rankPoints = calculateRankPoints(u.stats);
  const rank = getRankInfo(rankPoints, honor);
  const previousRank = rank.index > 0 ? PILOT_RANKS[rank.index - 1] : null;
  if (npcRankExp) npcRankExp.textContent = formatNumber(experience);
  if (npcRankExpCalc) npcRankExpCalc.textContent = `${formatNumber(experience)} ÷ 100 000 = ${formatNumber(Math.floor(experience / 100000))}`;
  if (npcRankHonor) npcRankHonor.textContent = formatNumber(honor);
  if (npcRankHonorCalc) npcRankHonorCalc.textContent = `${formatNumber(Math.max(0, honor))} ÷ 100 = ${formatNumber(Math.floor(Math.max(0, honor) / 100))}`;
  if (npcRankImage) npcRankImage.src = rank.imagePath;
  if (npcPreviousRankImage) {
    npcPreviousRankImage.hidden = !previousRank;
    npcPreviousRankImage.src = previousRank ? `ASSETS/RANKS/${previousRank.image.replace(/^[^.]+/, name => name.toUpperCase())}` : "";
  }
  if (npcPreviousRankName) npcPreviousRankName.textContent = previousRank?.name || "Aucun";
  if (npcPreviousRankPoints) npcPreviousRankPoints.textContent = previousRank ? `Seuil ${formatNumber(previousRank.points)}` : "Grade minimum";
  if (npcRankPoints) npcRankPoints.textContent = formatNumber(rankPoints);
  if (npcRankName) npcRankName.textContent = rank.name;
  if (npcNextRankImage) {
    npcNextRankImage.hidden = !rank.next;
    npcNextRankImage.src = rank.next ? `ASSETS/RANKS/${rank.next.image.replace(/^[^.]+/, name => name.toUpperCase())}` : "";
  }
  if (npcNextRankPoints) npcNextRankPoints.textContent = rank.next ? `${formatNumber(Math.max(0, rank.next.points - rankPoints))} points requis` : "Maximum";
  if (npcNextRankName) npcNextRankName.textContent = rank.next?.name || "Grade maximal atteint";

  const npcRows = Object.entries(NPC_TYPES)
      .map(([type, npc]) => {
        const count = Math.max(0, Number(kills[type] || 0));
        const creditsEach = Math.max(0, Number(npc.value || 0));
        const expEach = getNpcExperienceReward({ type, value: creditsEach }, npc);
        const honorEach = getNpcHonorReward({ type, value: creditsEach }, { ...npc, type });
        const exp = count * expEach;
        const gainedHonor = count * honorEach;
        return {
          name: npc.name || type,
          count,
          exp,
          honor: gainedHonor,
          credits: count * creditsEach,
          rankPoints: calculateRankPoints({ exp, honor: gainedHonor }),
        };
      })
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  if (npcKillList) {
    const rows = npcRows
      .map(item => `<div class="npcRewardRow"><span class="npcRewardName">${escapeHtml(item.name)}</span><strong>${formatNumber(item.count)}</strong><span>${formatNumber(item.exp)}</span><span>${formatNumber(item.honor)}</span><span>${formatNumber(item.credits)}</span><span>${formatNumber(item.rankPoints)}</span></div>`)
      .join("");
    npcKillList.innerHTML = rows;
  }

  if (npcRewardTotals) {
    const totals = npcRows.reduce((result, item) => {
      result.count += item.count;
      result.exp += item.exp;
      result.honor += item.honor;
      result.credits += item.credits;
      return result;
    }, { count: 0, exp: 0, honor: 0, credits: 0 });
    const rankPoints = calculateRankPoints(totals);
    npcRewardTotals.innerHTML = `<div class="npcRewardRow npcTotalRewardRow"><span class="npcRewardName">Total des destructions</span><strong>${formatNumber(totals.count)}</strong><span>${formatNumber(totals.exp)}</span><span>${formatNumber(totals.honor)}</span><span>${formatNumber(totals.credits)}</span><span>${formatNumber(rankPoints)}</span></div>`;
  }

  if (missionRewardSummary) {
    const completedIds = new Set(Array.isArray(u.quests?.completed) ? u.quests.completed : []);
    const completed = QUEST_DEFINITIONS.filter(quest => completedIds.has(quest.id));
    const totals = completed.reduce((result, quest) => {
      result.credits += Math.max(0, Number(quest.reward?.credits || 0));
      result.exp += getQuestExperienceReward(quest);
      result.honor += getQuestHonorReward(quest);
      return result;
    }, { credits: 0, exp: 0, honor: 0 });
    const missionRankPoints = calculateRankPoints(totals);
    missionRewardSummary.innerHTML = `<div class="npcRewardRow missionRewardRow"><span class="npcRewardName">Missions effectuées</span><strong>${formatNumber(completed.length)}</strong><span>${formatNumber(totals.exp)}</span><span>${formatNumber(totals.honor)}</span><span>${formatNumber(totals.credits)}</span><span>${formatNumber(missionRankPoints)}</span></div>`;
  }
}

function renderPatchNotes() {
  const list = document.getElementById("patchNotesList");
  if (!list) return;
  const notes = Array.isArray(PATCH_NOTES) ? PATCH_NOTES : [];
  if (notes.length === 0) {
    list.innerHTML = "";
    return;
  }
  const dateFormatter = new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris", dateStyle: "short", timeStyle: "short",
  });
  list.innerHTML = notes.map((entry) =>
    `<div class="patchNoteCard">
      <div class="patchNoteVersion">ALPHA v.${escapeHtml(entry.version)} — <time datetime="${escapeHtml(entry.date)}">${escapeHtml(dateFormatter.format(new Date(entry.date)))}</time></div>
      <div class="patchNoteBody">${escapeHtml(entry.message)}</div>
    </div>`
  ).join("");
}

function renderAccount(u) {
  if (!u) return;

  if (accountPseudoStatus) accountPseudoStatus.textContent = `Pseudo actuel : ${u.pseudo}`;
  if (accountPseudo && document.activeElement !== accountPseudo) accountPseudo.value = String(u.pseudo || "");

  const petPseudo = String(u?.pet?.pseudo || "REX");
  const petOwnedForAccount = u?.pet?.owned === true;
  if (accountPetPseudoStatus) accountPetPseudoStatus.textContent = petOwnedForAccount ? `Pseudo actuel : ${petPseudo}` : "P.E.T non possédé";
  if (accountPetPseudo && document.activeElement !== accountPetPseudo) accountPetPseudo.value = petOwnedForAccount ? petPseudo : "";
  if (btnSavePetPseudo) btnSavePetPseudo.disabled = !petOwnedForAccount;

  const linkedEmail = String(u.email || "").endsWith("@local") ? "" : String(u.email || "");
  if (accountEmailStatus) {
    accountEmailStatus.textContent = linkedEmail ? `Adresse liée : ${linkedEmail}` : "Aucune adresse email liée";
  }
  if (accountEmail && document.activeElement !== accountEmail) accountEmail.value = linkedEmail;
  if (btnSaveEmail) btnSaveEmail.textContent = linkedEmail ? "Modifier l'adresse" : "Lier cette adresse";
  const faction = getFaction(u.faction);
  if (accountFactionStatus) accountFactionStatus.textContent = `Firme actuelle : ${faction.shortName}`;
  if (accountFaction) {
    accountFaction.innerHTML = Object.values(FACTIONS)
      .map(item => `<option value="${item.id}">${item.shortName} — ${item.name}</option>`)
      .join("");
    accountFaction.value = faction.id;
  }
}

function wireAccountSettingsOnce() {
  btnSavePseudo?.addEventListener("click", () => {
    const pseudo = accountPseudo?.value.trim() || "";
    const currentPassword = pseudoCurrentPassword?.value || "";
    const out = updateCurrentUserPseudo(pseudo, currentPassword);
    if (!out?.ok) return setMsg(out?.error || "Impossible de changer le pseudo.", false);

    if (pseudoCurrentPassword) pseudoCurrentPassword.value = "";
    user = getCurrentUserFull();
    renderHeader(user);
    renderStats(user);
    setMsg("Pseudo modifié avec succès.", true);
  });

  btnSavePetPseudo?.addEventListener("click", () => {
    const pseudo = accountPetPseudo?.value.trim() || "";
    if (!user?.pet || user.pet.owned !== true) return setMsg("P.E.T non possédé.", false);
    showConfirm(
      "Renommer le REX",
      `Renommer ton REX en "${pseudo}" coûtera 1 000 000 crédits. Cette opération est immédiate.`,
      () => {
        const out = updateCurrentUserPetPseudo(pseudo);
        if (!out?.ok) return setMsg(out?.error || "Impossible de renommer le REX.", false);
        user = getCurrentUserFull();
        renderHeader(user);
        renderStats(user);
        renderAccount(user);
        syncGameCredits();
        setMsg(`REX renommé en "${user?.pet?.pseudo}". Coût : 1 000 000 crédits.`, true);
      },
    );
  });

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
  btnChangeFaction?.addEventListener("click", () => {
    if (btnChangeFaction.dataset.confirmed !== "yes") {
      const selected = getFaction(accountFaction?.value);
      showConfirm(
        "Confirmer le changement de firme",
        `Rejoindre ${selected.shortName} coûtera 1 000 000 000 crédits et 50 % de ton honneur actuel. Cette opération est immédiate.`,
        () => {
          btnChangeFaction.dataset.confirmed = "yes";
          btnChangeFaction.click();
          delete btnChangeFaction.dataset.confirmed;
        },
      );
      return;
    }
    const out = changeCurrentUserFaction(accountFaction?.value);
    if (!out?.ok) {
      showToast(out?.error || "Impossible de changer de firme.", "error");
      return;
    }
    user = getCurrentUserFull();
    renderHeader(user);
    renderStats(user);
    showToast(`Transfert vers ${out.faction.shortName} effectué. Honneur perdu : ${formatNumber(out.honorLost)}.`, "success");
    setTimeout(() => {
      const url = new URL(location.href);
      url.searchParams.set("map", `${out.faction.sector}-1`);
      url.searchParams.delete("spawn");
      location.href = url.toString();
    }, 700);
    setMsg(`Firme changée : ${out.faction.shortName}. Coût : 1 000 000 000 crédits et ${formatNumber(out.honorLost)} honneur.`, true);
  });
}

// -------------------- Design dropdown (liste référencée, max 10 items visibles) --------------------
let hangarDesignPanel = null;
let hangarDesignPanelCleanup = null;

function closeHangarDesignPanel() {
  if (hangarDesignPanelCleanup) hangarDesignPanelCleanup();
  hangarDesignPanelCleanup = null;
  if (hangarDesignPanel) {
    hangarDesignPanel.remove();
    hangarDesignPanel = null;
  }
}

function openHangarDesignPanel(triggerEl, hangarId, options, currentId) {
  closeHangarDesignPanel();

  // Uniquement les designs possédés (la base l'est toujours).
  const owned = options.filter((o) => !o.locked);
  const panel = document.createElement("div");
  panel.className = "hangarDesignPanel asImages";
  for (const opt of owned) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "hangarDesignImageOption" + (opt.id === currentId ? " selected" : "");
    btn.title = opt.label;
    btn.innerHTML = `<img src="${escapeHtml(opt.icon || "")}" alt="${escapeHtml(opt.label)}" />`;
    btn.addEventListener("click", () => {
      closeHangarDesignPanel();
      applyHangarDesign(hangarId, opt.id);
    });
    panel.appendChild(btn);
  }

  document.body.appendChild(panel);
  hangarDesignPanel = panel;

  const rect = triggerEl.getBoundingClientRect();
  const cols = Math.min(4, Math.max(1, owned.length));
  const width = cols * 80 + 20;
  panel.style.width = `${width}px`;
  panel.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))}px`;

  const maxH = 2 * 88 + 20;
  const below = window.innerHeight - rect.bottom - 6;
  const top = below >= maxH ? rect.bottom + 4 : Math.max(4, rect.top - maxH - 4);
  panel.style.maxHeight = `${maxH}px`;
  panel.style.top = `${top}px`;

  const onPointer = (e) => {
    if (!panel.contains(e.target) && !triggerEl.contains(e.target)) closeHangarDesignPanel();
  };
  const onKey = (e) => {
    if (e.key === "Escape") closeHangarDesignPanel();
  };
  const onScroll = (e) => {
    if (e.target !== document && e.target !== window && e.target !== document.documentElement) return;
    closeHangarDesignPanel();
  };

  document.addEventListener("pointerdown", onPointer, true);
  document.addEventListener("keydown", onKey, true);
  window.addEventListener("scroll", onScroll, true);
  hangarDesignPanelCleanup = () => {
    document.removeEventListener("pointerdown", onPointer, true);
    document.removeEventListener("keydown", onKey, true);
    window.removeEventListener("scroll", onScroll, true);
  };
}

function applyHangarDesign(hangarId, designId) {
  const isIntegratedInGame = !!document.getElementById("profileOverlay");
  if (!isIntegratedInGame && isGameOpen()) {
    return setMsg("⚠️ Le jeu est ouvert. Ferme-le d'abord avant de changer de design.", false);
  }

  const access = getHangarActionAccess("equip");
  if (!access.ok) {
    return setMsg(access.error, false);
  }

  const out = setHangarDesign(hangarId, designId);
  if (!out.ok) {
    return setMsg("❌ " + (out.error || "Impossible d'appliquer le design."), false);
  }

  window.__ORBIT_ENGINE__?.markHangarChanged?.();

  user = getCurrentUserFull();
  setMsg("✅ Design appliqué !", true);
  renderHeader(user);
  renderStats(user);
  renderHangars(user);
  refreshShopIfVisible();

  if (isIntegratedInGame) {
    window.__ORBIT_ENGINE__?.applyHangarDesignLive?.();
  }
}

function renderHangars(u) {
  return measureGameTask("ui.renderHangars", () => renderHangarsMeasured(u));
}

function renderHangarsMeasured(u) {
  if (!u) return;
  hangarGrid.innerHTML = "";

  const hangars = Array.isArray(u.hangars) ? u.hangars : [];
  const activeHangar = hangars.find(h => h?.active) || hangars[0];
  if (!selectedHangarId || !hangars.some(h => h.id === selectedHangarId)) {
    selectedHangarId = activeHangar?.id || null;
  }

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
    const hangarPackName = getShipPack(h.shipId)?.name || h.shipId;

    // ✅ Dropdown visuel des designs possédés (base + designs débloqués).
    const designBase = getShipDesignBaseId(h.shipId) || h.shipId;
    const designIds = getShipDesignIds(designBase);
    const designOptions = designIds.map((did) => {
      const isBase = did === designBase;
      const ownedD = alreadyOwnsDesign(u, did);
      const dpack = getShipPack(did);
      const locked = !isBase && !ownedD;
      return {
        id: did,
        label:
          `${dpack?.name || did}` +
          (isBase ? " · Base" : "") +
          (locked ? " · Verrouillé" : ""),
        icon: shipPreviewSrc(did),
        locked,
      };
    });
    const ownedDesignCount = designOptions.filter((o) => !o.locked).length;
    const el = document.createElement("div");
    el.className = "hangarListItem" + (h.id === selectedHangarId ? " selected" : "") + (isActive ? " active" : "");
    el.innerHTML = `
      <div class="hangarCardPhoto">
        ${prev ? `<img src="${escapeHtml(prev)}" alt="${escapeHtml(h.shipId)}" class="shipImg" />` : ""}
        <button type="button" class="hangarCardPhotoBadge" data-design-trigger="${h.id}" title="Choisir un design (${ownedDesignCount} possédé${ownedDesignCount > 1 ? "s" : ""})">▾</button>
      </div>
      <h3>
        ${escapeHtml(hangarPackName)}
      </h3>
      <div class="tileActions">
        <button class="${isActive ? 'secondary' : 'primary'}" data-act="${h.id}" ${isActive ? 'disabled' : ''}>
          ${isActive ? 'Activé' : 'Activer'}
        </button>
        <button class="secondary" data-fit="${h.id}">Équiper</button>
      </div>
    `;

    const selectHangar = () => {
      selectedHangarId = h.id;
      hangarGrid.querySelectorAll(".hangarListItem").forEach((item) => item.classList.remove("selected"));
      el.classList.add("selected");
    };
    el.addEventListener("click", selectHangar);

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

  const access = getHangarActionAccess("activate");
  if (!access.ok) return setMsg(access.error, false);

  const out = setActiveHangar(h.id);
  if (!out.ok) return setMsg("❌ " + (out.error || "Impossible d'activer le hangar."), false);

  window.__ORBIT_ENGINE__?.markHangarChanged?.();

  user = getCurrentUserFull();
  setMsg("✅ Hangar activé avec succès !", true);
  renderHeader(user);
  renderStats(user);
  renderHangars(user);
  refreshShopIfVisible();
  if (isIntegratedInGame) {
    window.__ORBIT_ENGINE__?.applyHangarDesignLive?.();
  }
});


     el.querySelector(`[data-fit="${h.id}"]`).addEventListener("click", () => {
      openFitModal(h.id);
    });

    // ✅ Petite flèche uniquement → dropdown visuel des designs possédés.
    el.querySelector(`[data-design-trigger="${h.id}"]`)?.addEventListener("click", (e) => {
      e.stopPropagation();
      selectHangar();
      openHangarDesignPanel(e.currentTarget, h.id, designOptions, h.shipId);
    });

    hangarGrid.appendChild(el);
  }
}

let lastShopListSignature = "";
let refreshShopBalance = null;
function currentProfileUser() { return user; }

function renderShop(user) {
  return measureGameTask("ui.renderShop", () => renderShopMeasured(user));
}

function renderShopMeasured(user) {
  if (shopCredits) shopCredits.textContent = formatNumber(user.credits || 0);
  if (!shopList || !shopPreview) return;
  const listSignature = JSON.stringify([shopTab, user.inventory?.ships,
    user.inventory?.shipDesigns, user.drones?.items?.map(drone => [drone.id, drone.type]),
    user.drones?.formations, user.drones?.activeFormation, user.rockets,
    user.pet?.owned, user.pet?.level, Math.floor(Number(user.pet?.exp) || 0), user.inventory?.counts?.["pet_niveau1"]]);
  if (shopTab !== "extras" && listSignature === lastShopListSignature && refreshShopBalance) {
    refreshShopBalance(user);
    return;
  }
  lastShopListSignature = listSignature;
  refreshShopBalance = null;
  const token = ++shopRenderToken;

  document.querySelectorAll("#shopWindowTabs .tabBtn, #shopTabs .subtabBtn").forEach((button) => {
    button.classList.toggle("active", button.dataset.shop === shopTab);
  });

  const shopLayout = shopList.closest(".shopLayout");
  shopLayout?.classList.toggle("extrasMode", shopTab === "extras");

  // Réinitialiser l'affichage
  const gridContainer = document.getElementById("shipsGridContainer");
  if (gridContainer) gridContainer.remove();

  if (shopLayout) shopLayout.style.display = "grid";
  if (shopList) shopList.style.display = "flex";
  if (shopPreview) { shopPreview.style.display = "block"; shopPreview.style.flexDirection = ""; }

  // Catégories spéciales
  if (shopTab === "extras") {
    renderExtrasRoulette(user);
    return;
  }

  // Toutes les catégories utilisent la même liste et le même panneau d'aperçu.
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
    const ownedIris = user?.drones?.items?.filter(drone => drone.type === "iris").length || 0;
    const price = it.drone?.type === "iris" ? getIrisPrice(ownedIris) : Number(it.price || 0);
    const isShipLike = shopTab === "ships" || shopTab === "designs";
    const ownedShip = isShipLike
      ? (shopTab === "designs" ? alreadyOwnsDesign(user, itemShipId(it)) : alreadyOwnsShip(user, it.ship?.id))
      : false;
    const ownedDrone = it.drone ? (user?.drones?.items || []).filter(drone => drone.type === it.drone.type).length : 0;
    const ownedFormation = it.formation ? user?.drones?.formations?.includes(it.formation.id) : false;
    const ownedPet = it.pet ? (user?.pet?.owned === true || Number(user?.inventory?.counts?.[it.id] || 0) > 0) : false;
    const groupLevels = Array.isArray(it?.levels) ? it.levels : null;
    const ownedPetGear = groupLevels
      ? groupLevels.reduce((sum, e) => sum + Number(user?.inventory?.counts?.[e.id] || 0), 0)
      : (it.petGear || it.petProtocol) ? Number(user?.inventory?.counts?.[it.id] || 0) : 0;
    const petGearReq = groupLevels
      ? Math.min(...groupLevels.map((e) => Math.max(0, Number(e?.petLevel) || 0)))
      : (it.petGear || it.petProtocol) ? Math.max(0, Number(it.petLevel) || 0) : 0;

    const row = document.createElement("div");
    row.className = "shopRow" + (it.id === selectedShopItemId ? " active" : "");

    const img = document.createElement("img");
    img.src = iconForItem(it, shopTab);
    img.alt = it.name || it.id;
    img.loading = "lazy";
    img.style.imageRendering = (shopTab === "ships" || shopTab === "designs" || shopTab === "drones") ? "pixelated" : "auto";
    if (shopTab === "drones") img.classList.add("droneShopRowImage");
    if (shopTab === "formations") img.classList.add("formationShopRowImage");
    img.onerror = () => {
      img.onerror = null;
      img.src = FALLBACK_ICON;
    };

    const meta = document.createElement("div");
    meta.className = "shopMeta";

    const title = document.createElement("b");
    title.textContent = it.name || it.id;
    if (it?.petOnly || it?.petGear || it?.petProtocol) {
      const badge = document.createElement("span");
      badge.className = "shopPetBadge";
      badge.textContent = "P.E.T";
      title.appendChild(document.createTextNode(" "));
      title.appendChild(badge);
    }

    const sub = document.createElement("span");
    sub.innerHTML = `${formatNumber(price)} crédits`
      + (shopTab === "designs" ? ` · ${getShipPack(it.design?.base)?.name || it.design?.base}` : "")
      + (ownedShip || ownedFormation || ownedPet ? ` · <span style="color:#00ff88;">Possédé</span>` : "")
      + (it.drone ? ` · ${ownedDrone}/${it.drone.type === "iris" ? 8 : 1}` : "")
      + ((it.petGear || it.petProtocol) ? ` · ×${formatNumber(ownedPetGear)}${petGearReq > 0 ? ` · niv. P.E.T ${petGearReq}+` : ""}` : "")
      + (groupLevels ? ` · ×${formatNumber(ownedPetGear)} · Niveaux 1-${groupLevels.length}` : "");

    meta.appendChild(title);
    meta.appendChild(sub);
    row.appendChild(img);
    row.appendChild(meta);

    row.addEventListener("click", () => {
      selectedShopItemId = it.id;
      ++shopRenderToken;
      for (const sibling of shopList.children) sibling.classList.toggle("active", sibling === row);
      renderShopPreview(currentProfileUser(), it, shopTab);
    });

    shopList.appendChild(row);
  }

  requestAnimationFrame(() => {
    if (token !== shopRenderToken) return;
    const it = list.find((x) => x.id === selectedShopItemId) || list[0];
    renderShopPreview(currentProfileUser(), it, shopTab);
  });
}
function renderShipsGrid(user) {
  // Masquer complètement la structure liste/preview
  const shopLayout = shopList?.closest(".shopLayout");
  if (shopLayout) shopLayout.style.display = "none";

  if (shopList) shopList.style.display = "none";
  if (shopPreview) shopPreview.style.display = "none";

  // Trouver le parent du shopLayout (le panel boutique)
  const shopPanel = document.getElementById("shopWindowPanel") || document.getElementById("panel_shop");
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
        <img src="${escapeHtml(imgSrc)}" alt="${escapeHtml(it.name || it.id)}"
             style="width: ${shipW}px; height: ${shipH}px; transform: scale(${scale});" />
      </div>

      <h3>
        ${escapeHtml(it.name || it.id)}
        ${owned ? ` <span class="pill">Possédé</span>` : ""}
      </h3>

      <div class="shipStats">
        HP: <strong style="color:#00d9ff;">${formatNumber(pack?.hp || 0)}</strong> •
        Vitesse: <strong style="color:#00d9ff;">${pack?.speed || 0}</strong><br>
        Lasers: <strong>${pack?.slots?.lasers || 0}</strong> •
        Génés: <strong>${pack?.slots?.gens || 0}</strong> •
        Extras: <strong>${pack?.slots?.extras || 0}</strong>
        ${pack?.slots?.shipMods ? ` • Modules: <strong>${pack.slots.shipMods}</strong>` : ""}
      </div>

      <div class="shipPrice">
        <span class="amount">${formatNumber(price)}</span> crédits
      </div>

      <button class="primary" style="width: 100%;" ${(!can || owned) ? "disabled" : ""} data-ship-buy="${it.id}">
        ${owned ? "Déjà possédé" : `Acheter`}
      </button>
    `;

    const btn = card.querySelector(`[data-ship-buy="${it.id}"]`);
    if (btn) {
      btn.addEventListener("click", () => {
        if (owned || !can) return;

        const shipName = it.name || it.id;
        const priceFormatted = formatNumber(price);

        showConfirm(
          'Confirmer l\'achat',
          `Voulez-vous acheter le vaisseau "${shipName}" pour ${priceFormatted} crédits ?`,
          () => {
            const out = buyItem(it.id);
            if (!out?.ok) {
              showToast(out?.error || "Achat impossible", 'error');
              return;
            }

            showToast(`Vaisseau ${shipName} acheté !`, 'success');

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
  // La carte doit remplir toute la hauteur du panneau pour plaquer les
  // boutons en bas : le conteneur passe en colonne flex (réinitialisé en
  // block pour les autres onglets dans renderShopMeasured).
  shopPreview.style.display = "flex";
  shopPreview.style.flexDirection = "column";

  const visible = 9;
  const centerIndex = Math.floor(visible / 2);
  const STEP = 74; // 64px (case) + 10px (gap)
  const WINDOW_W = visible * STEP - 10; // 508px, largeur exacte de la fenêtre

  let cells = Array.from({ length: visible }, () => {
    const tier = pickWeighted(MODULE_TIER_WEIGHTS);
    const type = pickWeighted(MODULE_TYPE_WEIGHTS);
    return { type, tier };
  });
  // Si un rail est déjà persisté, on garde les 9 mêmes cellules pour l'idle
  // (sinon le re-render régénèrerait les 9 à chaque lancer).
  if (rouletteRailCells.length) cells = rouletteRailCells.slice(0, visible);

  function randomCell() {
    return { type: pickWeighted(MODULE_TYPE_WEIGHTS), tier: pickWeighted(MODULE_TIER_WEIGHTS) };
  }

  function cellHtml(c) {
    const src = moduleIconSrc(c.type, c.tier);
    return `
      <div style="
        flex:0 0 auto;width:64px;height:64px;border-radius:14px;
        border:1px solid rgba(255,255,255,0.14);
        background:rgba(255,255,255,0.05);
        display:grid;place-items:center;
      ">
        <img src="${src}" style="width:52px;height:52px;object-fit:contain;image-rendering:pixelated;" />
      </div>
    `;
  }

  function railHtml(arr) {
    return arr.map(cellHtml).join("");
  }

  let historyPage = 0;
  let historyUser = user;
  function renderModuleHistory(currentUser) {
    historyUser = currentUser;
    const history = Array.isArray(currentUser?.inventory?.moduleRollHistory)
      ? currentUser.inventory.moduleRollHistory
      : [];
    if (!history.length) return `<div class="moduleHistoryEmpty">Aucun module obtenu pour le moment.</div>`;

    const pages = Math.max(1, Math.ceil(history.length / 4));
    historyPage = Math.max(0, Math.min(historyPage, pages - 1));
    const end = history.length - historyPage * 4;
    const entries = history.slice(Math.max(0, end - 4), end).reverse();
    return entries.map((module, index) => {
      const bonuses = Array.isArray(module?.bonuses)
        ? module.bonuses.map(bonus => {
            const pct = Number(bonus.pct) || 0;
            const color = pct < 0 ? "#ff5566" : "#00ff88";
            const sign = pct > 0 ? "+" : "";
            return `<strong style="color:${color};">${sign}${pct}%</strong> ${escapeHtml(formatStatLabel(bonus.stat))}`;
          }).join(" • ")
        : "Aucun bonus";
      const rarity = moduleRarityMeta(module);
      const familyId = moduleFamilyId(module);
      const familyShipImg = shipPreviewSrc(familyBaseShipId(familyId));
      const obtainedAt = Number(module?.createdAt || 0) > 0
        ? new Date(Number(module.createdAt) * 1000).toLocaleString("fr-FR")
        : "Date inconnue";
      const rerollsDone = Number(module?.rerolls) || 0;
      const nextCost = nextModuleRerollCost(rerollsDone);
      const ownedModule = (currentUser?.inventory?.shipModules || []).some((m) => String(m?.id) === String(module?.id));
      return `
        <div class="moduleHistoryRow">
          <span class="moduleHistoryIndex">${formatNumber(end - index)}</span>
          <img src="${moduleIconSrc(module?.type, module?.tier)}" alt="" class="moduleHistoryModImg" />
          <img src="${familyShipImg}" alt="" class="moduleHistoryShipImg" />
          <div class="moduleHistoryMeta">
            <strong class="moduleHistoryName">${escapeHtml(String(module?.type || "module").toUpperCase())}-${escapeHtml(String(module?.tier || "x1").toUpperCase())}</strong>
            <span class="moduleHistoryRarity" style="color:${rarity.color};font-weight:700;">${escapeHtml(rarity.name)}</span>
            <span>${escapeHtml(getShipFamilyName(familyId))} • ${bonuses}</span>
          </div>
          <div class="moduleHistorySide">
            <time>${escapeHtml(obtainedAt)}</time>
            <span class="moduleHistoryReroll">Relances : <strong>${formatNumber(rerollsDone)}</strong> · Prochaine : <strong>${formatNumber(nextCost)}</strong></span>
          </div>
          ${module?.id ? `<button type="button" class="moduleHistoryRerollBtn" style="width:42px;height:42px;" data-reroll-module="${escapeHtml(String(module.id))}" title="Relancer ce module" ${ownedModule ? "" : "disabled"}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#7cf0ff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="17 1 21 5 17 9"></polyline><path d="M3 11V9a4 4 0 0 1 4-4h14"></path><polyline points="7 23 3 19 7 15"></polyline><path d="M21 13v2a4 4 0 0 1-4 4H3"></path></svg></button>` : ""}
        </div>
      `;
    }).join("");
  }
  function renderModuleHistoryPager(currentUser) {
    const history = Array.isArray(currentUser?.inventory?.moduleRollHistory)
      ? currentUser.inventory.moduleRollHistory
      : [];
    if (!history.length) return "";
    const pages = Math.max(1, Math.ceil(history.length / 4));
    historyPage = Math.max(0, Math.min(historyPage, pages - 1));
    return `<nav class="inventoryPager" aria-label="Pages de l'historique"><button data-history-page="-1" ${historyPage === 0 ? "disabled" : ""}>Précédent</button><span>Page ${historyPage + 1} / ${pages}</span><button data-history-page="1" ${historyPage + 1 === pages ? "disabled" : ""}>Suivant</button></nav>`;
  }
  function updateModuleHistory(currentUser) {
    const historyEl = document.getElementById("moduleRollHistory");
    if (historyEl) historyEl.innerHTML = renderModuleHistory(currentUser);
    const pagerEl = document.getElementById("moduleHistoryPager");
    if (pagerEl) pagerEl.innerHTML = renderModuleHistoryPager(currentUser);
  }

  shopPreview.innerHTML = `
    <div class="tile extrasRoulettePanel" style="display:flex;flex-direction:column;flex:1 0 auto;min-height:100%;box-sizing:border-box;">
      <div class="extrasRouletteHeader">
        <div>
          <h3 id="extrasPanelTitle">Roulette de modules</h3>
          <p id="extrasPanelSub">Obtiens un module bonus aléatoire pour l'un de tes vaisseaux.</p>
        </div>
        <div style="flex:0 0 auto;display:flex;flex-direction:column;align-items:flex-end;gap:8px;">
          <div class="extrasRouletteCost" id="extrasRouletteCost"><span>Coût du tirage</span><strong>${formatNumber(MODULE_ROLL_COST)}</strong> crédits</div>
        </div>
      </div>
      <div id="rouletteView" style="display:flex;flex-direction:column;flex:1 1 auto;">
        <div id="rouletteWindow" style="margin:16px auto;position:relative;overflow:hidden;width:${WINDOW_W}px;padding:16px 0;-webkit-mask-image:linear-gradient(to right,transparent,#000 7%,#000 93%,transparent);mask-image:linear-gradient(to right,transparent,#000 7%,#000 93%,transparent);">
          <div id="rouletteRail" style="display:flex;gap:10px;width:max-content;will-change:transform;">${railHtml(cells)}</div>
          <div id="rouletteCenterCell" style="position:absolute;left:${centerIndex * STEP + (64 - 68) / 2}px;top:50%;transform:translateY(-50%);width:68px;height:68px;pointer-events:none;border-radius:16px;border:3px solid #ffd700;box-shadow:0 0 16px rgba(255,215,0,0.6), inset 0 0 12px rgba(255,215,0,0.28);"></div>
        </div>

        <button id="btnRoll" class="primary" style="width: 100%;" ${Number(user?.credits || 0) < MODULE_ROLL_COST ? "disabled" : ""}>
          Lancer (${formatNumber(MODULE_ROLL_COST)} crédits)
        </button>

        <div id="rollResult" style="margin-top: 16px; text-align: center; color: var(--muted);"></div>
        <div style="margin-top:auto;padding:12px 0 2px;position:sticky;bottom:0;background:linear-gradient(180deg,rgba(5,14,25,0),rgba(5,14,25,.92) 45%);">
          <button id="btnModuleHistory" class="secondary" type="button" style="width:100%;">Historique <span aria-hidden="true">→</span></button>
        </div>
      </div>
      <div id="moduleHistoryView" style="display:none;flex-direction:column;flex:1 1 auto;">
        <div id="moduleRollHistory" class="moduleHistoryList" style="border:0;">${renderModuleHistory(user)}</div>
        <div style="margin-top:auto;padding:12px 0 2px;position:sticky;bottom:0;background:linear-gradient(180deg,rgba(5,14,25,0),rgba(5,14,25,.92) 45%);display:grid;gap:8px;">
          <div id="moduleHistoryPager">${renderModuleHistoryPager(user)}</div>
          <button id="btnBackRoulette" class="secondary" type="button" style="width:100%;"><span aria-hidden="true">←</span> Roulette de modules</button>
        </div>
      </div>
    </div>
  `;

  const rouletteView = document.getElementById("rouletteView");
  const historyView = document.getElementById("moduleHistoryView");
  const panelTitle = document.getElementById("extrasPanelTitle");
  const panelSub = document.getElementById("extrasPanelSub");
  const costEl = document.getElementById("extrasRouletteCost");
  const historyBtn = document.getElementById("btnModuleHistory");
  const showRoulette = () => {
    if (rouletteView) rouletteView.style.display = "flex";
    if (historyView) historyView.style.display = "none";
    if (panelTitle) panelTitle.textContent = "Roulette de modules";
    if (panelSub) panelSub.textContent = "Obtiens un module bonus aléatoire pour l'un de tes vaisseaux.";
    if (costEl) costEl.style.display = "";
  };
  const showHistory = () => {
    historyPage = 0;
    updateModuleHistory(user);
    if (rouletteView) rouletteView.style.display = "none";
    if (historyView) historyView.style.display = "flex";
    if (panelTitle) panelTitle.textContent = "Historique des modules";
    if (panelSub) panelSub.textContent = `${formatNumber(user?.inventory?.moduleRollHistory?.length || 0)} tirage(s)`;
    if (costEl) costEl.style.display = "none";
  };
  historyBtn?.addEventListener("click", showHistory);
  document.getElementById("btnBackRoulette")?.addEventListener("click", showRoulette);

  document.getElementById("moduleHistoryPager").onclick = event => {
    const button = event.target.closest("[data-history-page]");
    if (!button || button.disabled) return;
    historyPage += Number(button.dataset.historyPage);
    updateModuleHistory(historyUser);
  };
  document.getElementById("moduleHistoryView")?.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-reroll-module]");
    if (!btn || btn.disabled) return;
    const id = btn.dataset.rerollModule;
    const entry = (historyUser?.inventory?.moduleRollHistory || []).find((h) => String(h?.id) === String(id));
    if (!entry?.id) return;
    const fresh = getCurrentUserFull();
    const owned = (fresh?.inventory?.shipModules || []).some((m) => String(m?.id) === String(entry.id));
    if (!owned) { setMsg("Module plus en inventaire : relance impossible.", false); return; }
    moduleReroll = {
      shipId: entry.shipId,
      familyId: moduleFamilyId(entry),
      type: entry.type,
      tier: entry.tier,
      statCount: Array.isArray(entry.bonuses) ? entry.bonuses.length : 0,
      currentId: entry.id,
      cost: nextModuleRerollCost(entry.rerolls),
      rerolls: Number(entry.rerolls) || 0,
    };
    showRoulette();
    handleReroll();
  });
  const railEl = document.getElementById("rouletteRail");
  const btn = document.getElementById("btnRoll");

  let rolling = false;

  const renderRollResultCard = (mod) => {
    const bonusesText = mod.bonuses
      .map((b) => {
        const color = Number(b.pct) < 0 ? "#ff5566" : "#00ff88";
        return `<strong style="color: ${color};">${b.pct}%</strong> ${formatStatLabel(b.stat)}`;
      })
      .join(" • ");

    const rarityMeta = moduleRarityMeta(mod);
    const familyId = moduleFamilyId(mod);
    const shipImg = shipPreviewSrc(familyBaseShipId(familyId));
    const credits = Number(user?.credits || 0);

    // Bouton relance collé sous "Lancer", carte du module collée sous la relance.
    const rollBtn = document.getElementById("btnRoll");
    let rerollRow = document.getElementById("rerollRow");
    if (moduleReroll && rollBtn) {
      if (!rerollRow) {
        rerollRow = document.createElement("div");
        rerollRow.id = "rerollRow";
        rerollRow.style.marginTop = "8px";
        rollBtn.insertAdjacentElement("afterend", rerollRow);
      }
      rerollRow.style.display = "";
      rerollRow.innerHTML = `
        <button id="btnRerollModule" class="secondary" style="width:100%;padding:12px 14px;"
          ${credits < moduleReroll.cost ? "disabled" : ""}>
          Relancer ce module (${formatNumber(moduleReroll.cost)} crédits)
        </button>
      `;
    } else if (rerollRow) {
      rerollRow.innerHTML = "";
      rerollRow.style.display = "none";
    }

    const resFinal = document.getElementById("rollResult");
    if (resFinal) {
      resFinal.style.marginTop = "8px";
      resFinal.innerHTML = `
      <div style="padding: 12px; background: rgba(0,217,255,0.1); border: 1px solid rgba(0,217,255,0.3); border-radius: 12px;">
        <div style="display:flex; gap:14px; align-items:center; text-align:left;">
          <div style="flex:1; min-width:0;">
            <div style="font-size: 16px; font-weight: 900; color: #00ff88; margin-bottom: 8px;">Module obtenu</div>
            <div style="color: var(--text);"><strong>${mod.type.toUpperCase()}-${mod.tier.toUpperCase()}</strong>
              <span style="margin-left:8px; color:${rarityMeta.color}; font-weight:700;">${rarityMeta.name}</span>
            </div>
            <div style="color: var(--muted); font-size: 13px;">Vaisseau: <strong>${mod.shipId}</strong></div>
            <div style="color: var(--muted); font-size: 13px;">Famille: ${escapeHtml(getShipFamilyName(familyId))}</div>
            <div style="color: var(--muted); font-size: 13px; margin-top: 4px;">Stats: ${bonusesText}</div>
          </div>
          <img src="${shipImg}" alt="" style="width:120px;height:120px;object-fit:contain;image-rendering:pixelated;background:rgba(0,0,0,0.25);border-radius:12px;border:1px solid rgba(255,215,0,0.25);" />
        </div>
      </div>
      `;
    }

    const rerollBtnEl = document.getElementById("btnRerollModule");
    if (rerollBtnEl) rerollBtnEl.addEventListener("click", handleReroll);
  };

  const refreshAfterModule = (user2, message = "Tirage réussi.") => {
    historyPage = 0;
    updateModuleHistory(user2);
    const panelSub = document.getElementById("extrasPanelSub");
    const historyView = document.getElementById("moduleHistoryView");
    if (panelSub && historyView && historyView.style.display !== "none") panelSub.textContent = `${formatNumber(user2?.inventory?.moduleRollHistory?.length || 0)} tirage(s)`;
    setMsg(message, true);
    renderHeader(user2);
    renderStats(user2);
    renderHangars(user2);
    if (shopCredits) shopCredits.textContent = formatNumber(user2.credits || 0);
    syncGameCredits();
  };

  // Animation rAF -> profil de vitesse CONTINU (style "bait").
  const spinWheel = (buildCells, winCell, onStop) => {
    if (!railEl) { onStop(); return; }

    const k = randInt(30, 40); // index du gagnant (bien au milieu du rail)
    const railLen = k + 9;     // cellules utiles : k + fenêtre visible
    const rail = buildCells(railLen);
    rail[k] = { type: winCell.type, tier: winCell.tier };
    const finalX = (centerIndex - k) * STEP;

    railEl.innerHTML = railHtml(rail);
    railEl.style.transition = "none";
    railEl.style.transform = "translateX(0px)";

    const DURATION = 900; // ms
    const PTS = [
      [0.00, 0.00],
      [0.015, 4.00],
      [0.40, 4.00],
      [0.85, 0.00],
      [1.00, 0.00],
    ];
    function vel(tr) {
      if (tr <= PTS[0][0]) return PTS[0][1];
      for (let i = 1; i < PTS.length; i++) {
        if (tr <= PTS[i][0]) {
          const t0 = PTS[i - 1][0], v0 = PTS[i - 1][1];
          const t1 = PTS[i][0], v1 = PTS[i][1];
          const u = (tr - t0) / (t1 - t0);
          const s = 0.5 - 0.5 * Math.cos(Math.PI * u);
          return v0 + (v1 - v0) * s;
        }
      }
      return PTS[PTS.length - 1][1];
    }
    const N = 500;
    const v = new Array(N + 1);
    let acc = 0;
    for (let i = 0; i <= N; i++) {
      v[i] = acc;
      acc += vel(i / N) / N;
    }
    const vTot = v[N] || 1;
    const start = performance.now();
    function frame(now) {
      const tr = Math.min(1, (now - start) / DURATION);
      const sigma = v[Math.round(tr * N)] / vTot;
      railEl.style.transform = `translateX(${finalX * sigma}px)`;
      if (tr < 1) requestAnimationFrame(frame);
      else {
        railEl.style.transition = "none";
        railEl.style.transform = `translateX(${finalX}px)`;
        onStop();
      }
    }
    requestAnimationFrame(frame);
  };

  // 🎰 TIRAGE DE BASE
  const handleBaseRoll = () => {
    if (rolling) return;
    rolling = true;
    moduleReroll = null; // un nouveau tirage de base "casse" la possibilité de reroll

    const resOut = document.getElementById("rollResult");
    if (resOut) resOut.textContent = "";
    const rerollRowOut = document.getElementById("rerollRow");
    if (rerollRowOut) { rerollRowOut.innerHTML = ""; rerollRowOut.style.display = "none"; }

    // ✅ La roue démarre INSTANTANÉMENT : aucune écriture localStorage ni
    // re-rendu avant l'animation (tout est délégué à l'arrêt).
    const u2 = getCurrentUserFull();
    const mod = generateShipModule(u2);
    mod.rerolls = 0;

    const finishRoll = () => {
      const pay = buyModuleRoll(MODULE_ROLL_COST);
      if (!pay?.ok) {
        setMsg(pay?.error || "Achat impossible.", false);
        rolling = false;
        return;
      }
      const add = addShipModule(mod);
      if (!add?.ok) {
        setMsg(add?.error || "Erreur stockage module.", false);
        rolling = false;
        return;
      }

      user = getCurrentUserFull();
      // Active la possibilité de REROLLER ce module (x5, puis x5 à chaque fois).
      moduleReroll = {
        shipId: mod.shipId,
        familyId: moduleFamilyId(mod),
        type: mod.type,
        tier: mod.tier,
        statCount: mod.bonuses.length,
        currentId: mod.id,
        cost: nextModuleRerollCost(0),
        rerolls: 0,
      };
      renderRollResultCard(mod);
      refreshAfterModule(user);
      rolling = false;
    };

    spinWheel(
      (railLen) => {
        rouletteRailCells = cells.slice();
        while (rouletteRailCells.length < railLen) rouletteRailCells.push(randomCell());
        return rouletteRailCells.slice(0, railLen);
      },
      { type: mod.type, tier: mod.tier },
      finishRoll
    );
  };

  // 🔁 REROLL du module courant : même type/tier/rareté/vaisseau/famille,
  // seuls les % changent. Prix multiplié par 5 à chaque relance.
  const handleReroll = () => {
    if (rolling || !moduleReroll) return;
    rolling = true;

    const cost = moduleReroll.cost;
    user = getCurrentUserFull();
    if (Number(user?.credits || 0) < cost) {
      setMsg("Crédits insuffisants pour relancer.", false);
      rolling = false;
      return;
    }

    // On referme la carte pendant la relance : elle se rouvre avec les
    // nouveaux éléments à l'arrêt (pas d'affichage prématuré de l'ancien).
    const resClear = document.getElementById("rollResult");
    if (resClear) resClear.innerHTML = "";
    const rerollRowClear = document.getElementById("rerollRow");
    if (rerollRowClear) { rerollRowClear.innerHTML = ""; rerollRowClear.style.display = "none"; }

    const onStop = () => {
      const pay = buyModuleRoll(cost);
      if (!pay?.ok) {
        setMsg(pay?.error || "Achat impossible.", false);
        rolling = false;
        return;
      }
      user = pay.user;
      const newMod = generateShipModule(user, {
        shipId: moduleReroll.shipId,
        familyId: moduleReroll.familyId,
        type: moduleReroll.type,
        tier: moduleReroll.tier,
        statCount: moduleReroll.statCount,
      });
      // Le compteur de relances est persisté sur le module lui-même.
      newMod.rerolls = (Number(moduleReroll.rerolls) || 0) + 1;
      const repl = replaceShipModule(moduleReroll.currentId, newMod);
      if (!repl?.ok) {
        setMsg(repl?.error || "Erreur stockage module.", false);
        rolling = false;
        return;
      }

      user = getCurrentUserFull();
      moduleReroll.currentId = newMod.id;
      moduleReroll.rerolls = newMod.rerolls;
      moduleReroll.cost = nextModuleRerollCost(newMod.rerolls);

      // La CARD ne se ferme pas : elle attend le nouveau tirage puis se met à jour.
      renderRollResultCard(newMod);
      refreshAfterModule(user, `Reroll réussi (${formatNumber(cost)} crédits).`);
      rolling = false;
    };

    spinWheel(
      (railLen) => {
        const uniform = { type: moduleReroll.type, tier: moduleReroll.tier };
        rouletteRailCells = Array.from({ length: railLen }, () => ({ ...uniform }));
        return rouletteRailCells.slice(0, railLen);
      },
      { type: moduleReroll.type, tier: moduleReroll.tier },
      onStop
    );
  };

  btn?.addEventListener("click", handleBaseRoll);
}

function renderShopPreview(user, it, cat) {
  // Groupe famille (gears/protocoles) : l'aperçu porte sur le niveau
  // sélectionné, acheté 1 par 1 (pas de quantité).
  const groupRef = Array.isArray(it?.levels) ? it : null;
  if (groupRef) {
    const sel = petShopSelectedLevel(groupRef, user);
    petShopLevelSel[groupRef.id] = sel;
    it = groupRef.levels.find((e) => petShopLevelOf(e) === sel) || groupRef.levels[0];
  }
  const ownedIris = user?.drones?.items?.filter(drone => drone.type === "iris").length || 0;
  const price = it?.drone?.type === "iris" ? getIrisPrice(ownedIris) : Number(it?.price || 0);
  const isShip = cat === "ships";
  const isDesign = cat === "designs";
  const isShipLike = isShip || isDesign;
  const isDrone = cat === "drones";
  const isFormation = cat === "formations";
  const isPet = cat === "pets" || !!it?.pet;
  const shipId = it?.ship?.id || it?.design?.id || null;
  const droneCount = isDrone ? (user?.drones?.items || []).filter(drone => drone.type === it?.drone?.type).length : 0;
  const droneLimit = it?.drone?.type === "iris" ? 8 : 1;
  const formationOwned = isFormation && user?.drones?.formations?.includes(it?.formation?.id);
  const petOwned = isPet && (user?.pet?.owned === true || Number(user?.inventory?.counts?.[it?.id] || 0) > 0);
  const owned = isShipLike ? (isDesign ? alreadyOwnsDesign(user, shipId) : alreadyOwnsShip(user, shipId)) : isDrone ? droneCount >= droneLimit : isPet ? petOwned : Boolean(formationOwned);
  const isUnique = isShipLike || isDrone || isFormation || isPet;
const counts = user?.inventory?.counts || {};
const countOwned = Number(counts[it?.id] || 0);

const ammoQty = getAmmoQtyForShopItem(user, it);
const isAmmo = !!ammoQty;
const ammoKey = ammoQty?.key || "";

let stockLine = "";
let statLine = "";

if (isShipLike) {
  const pack = getShipPack(shipId);
  const slots = getShipSlots(shipId);
  statLine = `
    <p class="shopItemStat" style="margin-top:8px;">
      HP <strong>${formatNumber(pack?.hp ?? 0)}</strong>
      · Vitesse <strong>${formatNumber(pack?.speed ?? 0)}</strong>
      · Laser <strong>${slots.lasers}</strong>
      · Générateur <strong>${slots.gens}</strong>
      · Extras <strong>${slots.extras}</strong>
      · Modules <strong>${slots.shipMods}</strong>
    </p>
  `;
  if (isDesign) {
    const basePack = getShipPack(it?.design?.base);
    statLine += `<p class="shopItemStat">Vaisseau de base : <strong>${escapeHtml(basePack?.name || it?.design?.base || "")}</strong></p>`;
  }
} else if (it?.module?.type === "speed") {
  statLine = `<p class="shopItemStat">Vitesse par générateur <strong>+${formatNumber(it.module.bonusSpeed || 0)}</strong></p>`;
} else if (it?.module?.type === "shield") {
  statLine = `<p class="shopItemStat">Bouclier par générateur <strong>+${formatNumber(it.module.bonusShield || 0)}</strong>${Number(it.module.absorbPct) > 0 ? ` · absorption <strong>${formatNumber(it.module.absorbPct)} %</strong>` : ""}${it?.petOnly ? " · <strong>P.E.T uniquement</strong>" : ""}</p>`;
} else if (it?.module?.type === "laser") {
  statLine = `<p class="shopItemStat">Dégâts de base par tir <strong>${formatNumber(it.module.damage || 0)}</strong>${it?.module?.vsLabel ? ` · bonus vs <strong>${escapeHtml(it.module.vsLabel)}</strong>` : ""}${it?.petOnly ? " · <strong>P.E.T uniquement</strong>" : ""}</p>`;
  if (it?.desc) statLine += `<p class="shopItemStat">${escapeHtml(it.desc)}</p>`;
} else if (it?.give?.ammo) {
  const ammoDesc = it?.desc ? `<p class="shopItemStat">${escapeHtml(it.desc)}</p>` : "";
  statLine = `${ammoDesc}`;
} else if (it?.give?.rockets) {
  const rocket = getRocketType(ammoKey);
  statLine = `<p class="shopItemStat">${escapeHtml(rocketEffectLabel(rocket))}</p>`;
} else if (it?.petProtocol) {
  const req = Math.max(0, Number(it.petLevel) || 0);
  statLine = `<p class="shopItemStat">Bonus <strong>+${Number(it.petProtocol.pct) || 0} % ${escapeHtml(petProtocolStatLabel(it.petProtocol.key))}</strong> quand équipé sur le P.E.T (groupe PROTOCOLES).</p>`;
  if (req > 0) statLine += `<p class="shopItemStat">Nécessite le <strong>P.E.T niveau ${req}</strong> (officiel : palier 2 dès niv. 4, palier 3 dès niv. 8).</p>`;
} else if (it?.petGear) {
  statLine = `<p class="shopItemStat">Gear P.E.T — <strong>${escapeHtml(it.desc || "utilitaire")}</strong> (groupe GEARS, sans stats de combat pour l'instant).</p>`;
} else if (it?.booster?.id) {
  const boosterDef = getBooster(it.booster.id);
  statLine = `<p class="shopItemStat">${escapeHtml(it.desc || "")}</p>`;
  if (boosterDef) statLine += `<p class="shopItemStat">Durée par activation : <strong>${formatBoosterDuration(boosterDef.durationSec)}</strong> · activation depuis la fenêtre Boosters.</p>`;
}
if (isFormation) {
  const formation = DRONE_FORMATIONS.find(entry => entry.id === it?.formation?.id);
  statLine = `<p class="shopItemStat formationDescription">${escapeHtml(formation?.description || "Aucun bonus ni malus")}</p>`;
}
if (isPet) {
  statLine = `<p class="shopItemStat">Compagnon P.E.T — ramasseur et soutien de combat.</p>`;
}

if (isDrone) {
  stockLine = `<p class="shopAmmoOwned">Drones possédés : <strong>${droneCount} / ${droneLimit}</strong></p>`;
} else if (isPet) {
  const petLevel = Math.max(0, Number(user?.pet?.level) || 0);
  const petExp = Math.max(0, Number(user?.pet?.exp) || 0);
  stockLine = petOwned
    ? `<p class="shopAmmoOwned">P.E.T possédé — Niveau ${petLevel} · ${formatNumber(Math.floor(petExp))} XP · ${escapeHtml(getPetLevelBonus(petLevel))}</p>`
    : `<p class="shopAmmoOwned">P.E.T non possédé — achat unique · gagne 5 % de ton XP</p>`;
} else if (isFormation) {
  const active = user?.drones?.activeFormation === it?.formation?.id;
  stockLine = `<p class="shopAmmoOwned">${formationOwned ? (active ? "Formation active" : "Formation possédée") : `Nécessite au moins ${it?.formation?.minDrones || 4} drones`}</p>`;
} else if (!isShipLike && ammoQty) {
  stockLine = `
    <p class="shopAmmoOwned">
      Munitions ${String(ammoKey).toUpperCase()} — quantité possédée :
      <strong data-shop-stock style="color: #00d9ff;">${formatNumber(ammoQty.qty)}</strong>
    </p>
  `;
} else if (!isShipLike) {
  stockLine = `
    <p style="margin: 8px 0;">
      Stock possédé : 
      <strong data-shop-stock style="color: #00d9ff;">${formatNumber(countOwned)}</strong>
    </p>
  `;
}

  const imgSrc = isShipLike ? shipPreviewSrc(shipId) : iconForItem(it, cat);

  // Gears / protocoles P.E.T : P.E.T requis + palier de niveau officiel.
  const petReqLevel = Math.max(0, Number(it?.petLevel) || 0);
  const needsPetGate = !!(it?.petGear || it?.petProtocol);
  const petGateUnmetNow = () => needsPetGate && (user?.pet?.owned !== true || Math.max(0, Number(user?.pet?.level) || 0) < petReqLevel);
  const petGateLabel = () => user?.pet?.owned !== true ? "P.E.T requis" : `P.E.T niveau ${petReqLevel} requis`;

  let previewHtml = "";
  
  if (isShipLike) {
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
      <img src="${imgSrc}" alt="${it?.name || it?.id}" class="bigImg ${isDrone ? "droneShopImage" : isFormation ? "formationShopImage" : ""}${["ammo", "rockets", "launchers", "speedGen", "shieldGen", "lasers", "extras", "petGears", "petProtocols", "boosters"].includes(cat) ? " equipShopImage" : ""}" />
    `;
  }

  shopPreview.innerHTML = `
    <div class="tile">
      ${previewHtml}

      <h3>
        ${it?.name || it?.id} 
        ${owned ? `<span class="pill">Possédé</span>` : ""}
      </h3>

      ${stockLine}
      ${statLine}

      ${!isUnique ? `
        <div class="shopPurchaseRow">
          <div class="shopPurchaseInfo">
            ${groupRef
              ? `<label for="shopBuyLevel">Niveau</label>`
              : `<label for="shopBuyQuantity">${it?.give?.rockets ? "Quantité à acheter × 10" : isAmmo ? "Quantité à acheter × 1 000" : "Quantité à acheter"}</label>`}
            <div class="shopPurchasePrice">
              <span>Prix</span>
              <strong><span id="shopPurchaseTotal">${formatNumber(price)}</span> crédits</strong>
            </div>
          </div>
          ${groupRef ? `
          <select id="shopBuyLevel" aria-label="Niveau à acheter">
            ${groupRef.levels.map((e) => {
              const lv = petShopLevelOf(e);
              const req = Math.max(0, Number(e?.petLevel) || 0);
              const petLevel = Math.max(0, Number(user?.pet?.level) || getPetLevel(user?.pet?.exp));
              const locked = user?.pet?.owned !== true || petLevel < req;
              const label = `Niveau ${lv}${locked ? (user?.pet?.owned !== true ? " (P.E.T requis)" : ` (P.E.T ${req} requis)`) : ""}`;
              return `<option value="${lv}"${lv === petShopLevelOf(it) ? " selected" : ""}${locked ? " disabled" : ""}>${escapeHtml(label)}</option>`;
            }).join("")}
          </select>
          ` : `
          <div class="shopQuantityBox">
            <input id="shopBuyQuantity" type="number" min="1" max="1000" step="1" value="1" inputmode="numeric" aria-label="Quantité à acheter" />
            <select id="shopBuyQuantityPreset" aria-label="Quantités prédéfinies">
              <option value="1">1</option>
              <option value="5">5</option>
              <option value="10">10</option>
              <option value="50">50</option>
              <option value="100">100</option>
              <option value="1000">1000</option>
            </select>
          </div>
          `}
        </div>
      ` : ""}
      
      ${isUnique ? `<p style="margin: 12px 0; font-size: 18px;">
        <strong style="color: #00d9ff;">Prix total:</strong>
        <span id="shopPurchaseTotal" style="font-weight: 900; color: #00ff88;">${formatNumber(price)}</span> crédits
      </p>` : ""}

      <div class="shopBuySection">
        <button id="btnBuyPreview" class="primary" style="width: 100%;" ${(Number(user?.credits || 0) < price || (owned && !formationOwned) || petGateUnmetNow()) ? "disabled" : ""}>
          ${formationOwned ? (user?.drones?.activeFormation === it?.formation?.id ? 'Formation active' : 'Activer la formation') : petGateUnmetNow() ? petGateLabel() : owned ? 'Déjà possédé' : (isUnique ? `Acheter (${formatNumber(price)})` : 'Acheter')}
        </button>
      </div>
    </div>
  `;

  const btn = document.getElementById("btnBuyPreview");
  if (!btn) return;

  const quantityInput = document.getElementById("shopBuyQuantity");
  const quantityPreset = document.getElementById("shopBuyQuantityPreset");
  const levelInput = document.getElementById("shopBuyLevel");
  const totalEl = document.getElementById("shopPurchaseTotal");
  const normalizeQuantity = () => groupRef
    ? 1
    : isUnique
      ? 1
      : Math.min(1000, Math.max(1, Math.floor(Number(quantityInput?.value) || 1)));
  const updatePurchaseSummary = () => {
    const quantity = normalizeQuantity();
    const total = price * quantity;
    if (quantityInput) quantityInput.value = String(quantity);
    if (totalEl) totalEl.textContent = formatNumber(total);
    const gateUnmet = petGateUnmetNow();
    btn.disabled = (owned && !formationOwned) || (formationOwned && user?.drones?.activeFormation === it?.formation?.id) || (!formationOwned && Number(user?.credits || 0) < total) || gateUnmet;
    if (!owned && !formationOwned) {
      btn.textContent = gateUnmet ? petGateLabel() : (isUnique ? `Acheter (${formatNumber(total)})` : "Acheter");
    }
  };

  quantityInput?.addEventListener("input", updatePurchaseSummary);
  quantityInput?.addEventListener("change", updatePurchaseSummary);
  // Le menu déroulant reporte son montant dans la zone de saisie libre.
  quantityPreset?.addEventListener("change", () => {
    if (quantityInput && quantityPreset) quantityInput.value = quantityPreset.value;
    updatePurchaseSummary();
  });
  levelInput?.addEventListener("change", () => {
    if (!groupRef) return;
    petShopLevelSel[groupRef.id] = Number(levelInput.value) || 1;
    renderShopPreview(user, groupRef, cat);
  });
  refreshShopBalance = freshUser => {
    user = freshUser;
    const stock = shopPreview.querySelector("[data-shop-stock]");
    if (stock) stock.textContent = formatNumber(isAmmo
      ? getAmmoQtyForShopItem(user, it)?.qty || 0
      : user.inventory?.counts?.[it.id] || 0);
    updatePurchaseSummary();
  };
  updatePurchaseSummary();

  btn.addEventListener("click", () => {
    const quantity = normalizeQuantity();
    const totalPrice = price * quantity;
    if (formationOwned) {
      const activated = setCurrentUserDroneFormation(it.formation.id);
      if (!activated.ok) return showToast(activated.error, "error");
      user = activated.user;
      renderShop(user);
      syncGameCredits();
      return;
    }
    if (owned || Number(user?.credits || 0) < totalPrice) return;
    if (petGateUnmetNow()) return showToast(petGateLabel(), "error");

    const itemName = it?.name || it?.id;

    // REX : fenêtre temporaire pour choisir son pseudo (la firme est native : celle du vaisseau).
    if (isPet && !petOwned) {
      showPetNamingModal({
        itemName,
        totalPrice,
        onConfirm: (petPseudo) => {
          const out = buyItem(it.id, quantity, { petPseudo, petFaction: user?.faction });
          if (!out?.ok) {
            showToast(out?.error || "Achat impossible", 'error');
            return;
          }
          showToast(`REX "${petPseudo}" acheté avec succès !`, 'success');
          user = getCurrentUserFull();
          renderHeader(user);
          renderStats(user);
          renderHangars(user);
          renderShop(user);
          syncGameCredits();
        },
      });
      return;
    }

    showConfirm(
      'Confirmer l\'achat',
      `Voulez-vous acheter ${quantity > 1 ? `${formatNumber(quantity)} × ` : ""}"${itemName}" pour ${formatNumber(totalPrice)} crédits ?`,
      () => {
        const out = isDrone
          ? buyCurrentUserDrone(it.drone.type)
          : isFormation
            ? buyCurrentUserDroneFormation(it.formation.id)
            : buyItem(it.id, quantity);
        if (!out?.ok) {
          showToast(out?.error || "Achat impossible", 'error');
          return;
        }

        showToast(`${formatNumber(quantity)} × ${itemName} acheté avec succès !`, 'success');

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

// ------------------------------------
// FIT MODAL (Équiper)
// ------------------------------------
function buildFitWindow() {
  const overlay = document.createElement("div");
  overlay.id = "fitOverlay";

  const card = document.createElement("div");
  card.id = "fitCard";
  card.className = "fitWindow";
  card.innerHTML = `
    <div id="fitErr" class="fitError" role="status"></div>

    <div class="fitWorkspace">
      <aside class="fitShipPane">
        <canvas id="fitShipCanvas" width="96" height="96"></canvas>
        <div class="fitShipMeta">
          <b id="fitShipName">—</b>
        </div>
        <div class="fitSectionNav" aria-label="Type d'équipement">
          <button class="fitSectionBtn active" data-fit-section="ship" type="button">Vaisseau</button>
          <button class="fitSectionBtn" data-fit-section="drones" type="button">Drones</button>
          <button class="fitSectionBtn" data-fit-section="pet" type="button">P.E.T</button>
        </div>
        <div id="fitConfigBar" class="fitConfigBar">
          <span>CONFIG.</span>
          <div>
            <button class="fitCfgBtn" data-cfg="1" type="button">1</button>
            <button class="fitCfgBtn" data-cfg="2" type="button">2</button>
          </div>
        </div>
        <div class="fitWindowActions">
          <span class="fitHelpTooltip" tabindex="0" aria-label="Aide sur la sélection">?
            <span><b>Ctrl</b> : sélection multiple<br><b>Maj</b> : tous les exemplaires identiques<br><b>Double-clic</b> : équiper</span>
          </span>
          <button id="fitBtnSellSelection" class="secondary fitSellButton" type="button" disabled>Vendre</button>
          <span class="fitActionSeparator" aria-hidden="true"></span>
          <button id="fitBtnResetAll" class="secondary" type="button">Tout retirer</button>
          <button id="fitBtnPresets" class="secondary" type="button">Presets</button>
          <span class="fitActionSeparator" aria-hidden="true"></span>
          <button id="fitBtnCancel" class="secondary fitBackButton" type="button">Retour</button>
          <button id="fitBtnSave" class="primary" type="button">Appliquer</button>
        </div>
      </aside>

      <section class="fitLoadoutPane">
        <div id="fitDroneWorkspace" class="fitDroneWorkspace" hidden></div>
        <div id="fitPetWorkspace" class="fitPetWorkspace" hidden></div>
        <div class="fitSlotsScroll">
          <section class="fitSlotGroup" data-slot-type="lasers">
            <div class="fitGroupTitle"><span>LASERS</span></div>
            <div id="fitSlotsLasers" class="slotGrid"></div>
          </section>
          <section class="fitSlotGroup" data-slot-type="gens">
            <div class="fitGroupTitle"><span>GÉNÉRATEURS</span></div>
            <div id="fitSlotsGens" class="slotGrid"></div>
          </section>
          <section class="fitSlotGroup" data-slot-type="extras">
            <div class="fitGroupTitle"><span>EXTRAS</span></div>
            <div id="fitSlotsExtras" class="slotGrid"></div>
          </section>
          <section class="fitSlotGroup" data-slot-type="shipMods">
            <div class="fitGroupTitle"><span>MODULES</span><small><span id="shipModsCount">1</span></small></div>
            <div id="fitSlotsShipMods" class="slotGrid slotGridModules"></div>
          </section>
        </div>
      </section>

      <aside class="fitInventoryPane">
        <div class="fitInventoryHeader">
          <div>
            <strong>INVENTAIRE</strong>
          </div>
          <select id="fitInvFilter" class="fitSelect" aria-label="Filtrer l'inventaire">
            <option value="all">Tout</option>
            <option value="laser">Lasers</option>
            <option value="speed">Vitesse</option>
            <option value="shield">Bouclier</option>
            <option value="extra">Extras</option>
          </select>
        </div>
        <div class="fitInvScroll">
          <div id="fitInvGrid" class="invGrid"></div>
          <div class="fitModulesHeading">Modules Roulette</div>
          <div id="fitShipModules" class="fitShipModules"></div>
        </div>
      </aside>
    </div>

    <div id="presetOverlay" class="fitPresetOverlay">
      <div class="fitPresetWindow">
        <header>
          <div><strong>Presets d'équipement</strong><span>Sauvegarde et recharge rapidement une configuration.</span></div>
          <button id="presetClose" class="secondary" type="button">Fermer</button>
        </header>
        <label class="fitPresetField"><span>Nouveau preset</span><input id="fitPresetName" class="fitInput" placeholder="Nom de la configuration" /></label>
        <button id="fitBtnSavePreset" class="primary" type="button">Sauvegarder la configuration actuelle</button>
        <div class="fitPresetDivider"></div>
        <label class="fitPresetField"><span>Presets enregistrés</span><select id="fitPresetSelect" class="fitSelect"><option value="">— Choisir —</option></select></label>
        <div class="fitPresetActions">
          <button id="fitBtnLoadPreset" class="primary" type="button">Appliquer</button>
          <button id="fitBtnDeletePreset" class="secondary" type="button">Supprimer</button>
        </div>
      </div>
    </div>
  `;

  overlay.appendChild(card);
  const host = document.getElementById("hangarWindow") || document.getElementById("profileWindow") || document.body;
  host.appendChild(overlay);
  const returnZone = card.querySelector(".fitInventoryPane");
  const loadoutZone = card.querySelector(".fitLoadoutPane");
  card.querySelectorAll("[data-fit-section]").forEach(button => button.addEventListener("click", () => setFitSection(button.dataset.fitSection)));
  loadoutZone?.addEventListener("dragover", (event) => {
    if (event.dataTransfer.types.includes("application/x-orbit-slot")) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    updateFitDropHighlights();
  });
  loadoutZone?.addEventListener("dragleave", (event) => {
    if (!loadoutZone.contains(event.relatedTarget)) clearFitDropHighlights();
  });
  loadoutZone?.addEventListener("drop", (event) => {
    clearFitDropHighlights();
    if (event.defaultPrevented || event.dataTransfer.types.includes("application/x-orbit-slot")) return;
    event.preventDefault();
    let itemIds = [];
    try { itemIds = JSON.parse(event.dataTransfer.getData("application/x-orbit-items") || "[]"); } catch {}
    const fallbackItemId = event.dataTransfer.getData("text/plain");
    if (!itemIds.length && fallbackItemId) itemIds = [fallbackItemId];
    if (!itemIds.length) return;
    const preferredSlotType = event.target.closest(".fitSlotGroup")?.dataset.slotType || null;
    clearFitSelection();
    itemIds.forEach((itemId, index) => fitState.selectedCopies.set(`drop#${index}`, itemId));
    equipSelectedInventoryItems(preferredSlotType);
  });
  returnZone?.addEventListener("dragover", (event) => {
    const equippedDrag = event.dataTransfer.types.includes("application/x-orbit-slot")
      || event.dataTransfer.types.includes("application/x-orbit-pet-slot");
    if (!equippedDrag) return;
    event.preventDefault();
    returnZone.classList.add("dragReturnActive");
  });
  returnZone?.addEventListener("dragleave", (event) => {
    if (!returnZone.contains(event.relatedTarget)) returnZone.classList.remove("dragReturnActive");
  });
  returnZone?.addEventListener("drop", (event) => {
    returnZone.classList.remove("dragReturnActive");
    const raw = event.dataTransfer.getData("application/x-orbit-slot");
    const rawGroup = event.dataTransfer.getData("application/x-orbit-slots");
    const rawPetSlot = event.dataTransfer.getData("application/x-orbit-pet-slot");
    if (!raw && !rawGroup && !rawPetSlot) return;
    event.preventDefault();
    try {
      if (fitState.section === "drones") {
        // Retour d'un équipement de drone vers l'inventaire (un ou plusieurs slots).
        let sources = [];
        if (rawGroup) { try { sources = JSON.parse(rawGroup); } catch {} }
        if (!sources.length) { try { const p = JSON.parse(raw); if (p?.droneId != null) sources = [p]; } catch {} }
        sources = sources.filter((source) => source?.droneId != null && Number.isInteger(source?.slot));
        if (!sources.length) return;
        const fresh = getCurrentUserFull();
        if (!fresh) return;
        const grouped = new Map();
        sources.forEach((source) => {
          if (!grouped.has(source.droneId)) grouped.set(source.droneId, new Set());
          grouped.get(source.droneId).add(source.slot);
        });
        const fits = [];
        for (const [droneId, slots] of grouped) {
          const drone = fresh.drones?.items?.find((entry) => entry.id === droneId);
          const baseFit = drone ? droneFitForState(drone) : null;
          if (!drone || !Array.isArray(baseFit?.equipment)) continue;
          const equipment = [...baseFit.equipment];
          for (const slot of slots) if (equipment[slot] != null) equipment[slot] = null;
          if (equipment.every((value, index) => value === baseFit.equipment[index])) continue;
          fits.push({ droneId, fit: { ...baseFit, equipment }, configNo: fitState.configNo, hangarId: fitState.hangarId });
        }
        if (!fits.length) return;
        // Brouillon local : appliqué seulement via Appliquer (en base).
        // Comme le vaisseau : on tasse tout en haut à gauche après retrait.
        for (const { droneId, fit } of fits) {
          const drone = fresh.drones?.items?.find((entry) => entry.id === droneId);
          const size = drone ? Math.max(0, Number(DRONE_TYPES[drone.type]?.slots) || fit.equipment.length) : fit.equipment.length;
          fitState.droneDrafts[droneId] = { equipment: compactDroneEquipment(fit.equipment, size), ability: fit.ability || null };
        }
        clearFitSelection();
        showFitError("");
        renderDroneEquipment(user);
        renderInventoryPalette();
        return;
      }
      if (fitState.section === "pet") {
        // Retour d'un équipement P.E.T vers l'inventaire.
        let removals = [];
        try {
          const rawPet = event.dataTransfer.getData("application/x-orbit-pet-slot");
          if (rawPet) { const p = JSON.parse(rawPet); if (p?.group && Number.isInteger(p?.slot)) removals = [{ group: p.group, slot: p.slot }]; }
        } catch {}
        if (fitState.selectedPetSlots.size) {
          removals = [...fitState.selectedPetSlots.keys()].map((key) => {
            const [, group, rawSlot] = String(key).split("#");
            return { group, slot: Number(rawSlot) };
          }).filter((r) => r.group && Number.isInteger(r.slot));
        }
        if (!removals.length) return;
        const fresh = getCurrentUserFull();
        if (!fresh || fresh.pet?.owned !== true) return;
        const baseFit = petFitForState(fresh.pet);
        const nextFit = {
          lasers: [...(baseFit?.lasers || [])],
          generators: [...(baseFit?.generators || [])],
          gears: [...(baseFit?.gears || [])],
          protocols: [...(baseFit?.protocols || [])],
          ability: baseFit?.ability || null,
        };
        for (const { group, slot } of removals) {
          if (Array.isArray(nextFit[group]) && nextFit[group][slot] != null) nextFit[group][slot] = null;
        }
        // Brouillon local : appliqué seulement via Appliquer (en base).
        // Comme le vaisseau : on tasse tout en haut à gauche après retrait.
        fitState.petDraft = compactPetFit({ ...nextFit }, petSizesFor(fresh.pet));
        clearFitSelection();
        showFitError("");
        renderPetEquipment(user);
        renderInventoryPalette();
        return;
      }
      const sources = rawGroup ? JSON.parse(rawGroup) : [JSON.parse(raw)];
      for (const source of sources) {
        if (Array.isArray(fitState.draft[source.slotType])) fitState.draft[source.slotType][source.index] = null;
      }
      compactCurrentFit();
      clearFitSelection();
      showFitError("");
      renderSlots();
      renderInventoryPalette();
      renderShipModulesList();
    } catch {}
  });
  const sellZone = card.querySelector("#fitSellDrop");
  sellZone?.addEventListener("dragover", (event) => {
    if (event.dataTransfer.types.includes("application/x-orbit-slot")) return;
    event.preventDefault();
    sellZone.classList.add("dragSellActive");
  });
  sellZone?.addEventListener("dragleave", () => sellZone.classList.remove("dragSellActive"));
  sellZone?.addEventListener("drop", (event) => {
    sellZone.classList.remove("dragSellActive");
    if (event.dataTransfer.types.includes("application/x-orbit-slot")) return;
    event.preventDefault();
    const itemId = event.dataTransfer.getData("text/plain");
    if (itemId) sellFitInventoryItem(itemId);
  });
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) closeFitModal();
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

  const pack = getShipPackById(shipId);
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
  const pack = getShipPackById(shipId);

  const draw = (t) => {
    if (token !== _fitShipAnimToken) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

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
  selectedCopies: new Map(),
  selectedSlots: new Map(), // émet le changement
  selectedDroneSlots: new Map(),
  selectedPetSlots: new Map(),
  draggedItemIds: [],
  draft: null,
  // Brouillons locaux drones/REX (jamais persistés sans Appliquer).
  droneDrafts: null, // { [droneId]: { equipment: [...], ability } }
  petDraft: null, // { lasers, generators, gears, protocols, ability }
  // Brouillons mis de côté par config (1/2) quand on bascule sans appliquer.
  stash: null,
  used: null,
  slots: { lasers: 15, gens: 15, extras: 15, shipMods: 1 },
  section: "ship",
  droneId: null,
};

// Accès équipement en direct (base ou non). L'ouverture du hangar est libre,
// mais Appliquer + édition du vaisseau exigent la base.
function fitApplyAccess() {
  try {
    const access = getHangarActionAccess("equip");
    return access && access.ok ? { ok: true } : { ok: false, error: access?.error || "Hors base." };
  } catch {
    return { ok: false, error: "Hors base." };
  }
}

// Vaisseau intouchable hors base (ni ajout ni retrait).
function shipEditLocked() {
  if (fitState?.hangarId == null) return false;
  return !fitApplyAccess().ok;
}

// Bouton(s) Appliquer grisé(s) hors base.
function refreshFitApplyButton() {
  const access = fitApplyAccess();
  document.querySelectorAll("#fitBtnSave").forEach((btn) => {
    btn.disabled = !access.ok;
    btn.title = access.ok ? "Appliquer l'équipement" : (access.error || "Appliquer (base requise)");
  });
}

// Snapshot stockage -> brouillons locaux (vaisseau + drones + REX).
function initFitDrafts(hangarId, configNo) {
  const h = (user?.hangars || []).find((x) => x?.id === hangarId);
  if (!h) return false;
  fitState.slots = getShipSlots(h.shipId);
  const baseFit = getFitForConfig(h, configNo);
  fitState.draft = {
    lasers: normalizeFitArray(baseFit.lasers, fitState.slots.lasers),
    gens: normalizeFitArray(baseFit.gens, fitState.slots.gens),
    extras: normalizeFitArray(baseFit.extras, fitState.slots.extras),
    shipMods: normalizeFitArray(baseFit.shipMods, fitState.slots.shipMods),
  };
  fitState.droneDrafts = {};
  for (const drone of user?.drones?.items || []) {
    let f = null;
    try { f = getDroneFit(drone, hangarId, configNo); } catch {}
    f = f || drone?.fits?.[String(Number(configNo) === 2 ? 2 : 1)] || drone?.fit || null;
    // Normalisé à la taille des slots : jamais de tableau riquiqui qui
    // décale/masque des emplacements (sinon "slots vides" impossibles à remplir).
    const size = Math.max(0, Number(DRONE_TYPES[drone.type]?.slots) || (f?.equipment || []).length);
    const equipment = Array.from({ length: size }, (_, i) => f?.equipment?.[i] || null);
    fitState.droneDrafts[drone.id] = {
      equipment,
      ability: f?.ability || null,
    };
  }
  let pf = null;
  try { pf = getPetFit(user?.pet, hangarId, configNo); } catch {}
  pf = pf || user?.pet?.fits?.[String(Number(configNo) === 2 ? 2 : 1)] || user?.pet?.fit || null;
  // Normalisé à la taille des slots du niveau : pareil, aucun slot fantôme.
  const petLevelInit = Math.max(0, Number(user?.pet?.level) || getPetLevel(user?.pet?.exp));
  const petSizes = getPetSlots(petLevelInit);
  const padGroup = (arr, size) => Array.from({ length: Math.max(0, size) }, (_, i) => arr?.[i] || null);
  fitState.petDraft = {
    lasers: padGroup(pf?.lasers, petSizes.lasers),
    generators: padGroup(pf?.generators, petSizes.generators),
    gears: padGroup(pf?.gears, petSizes.gears),
    protocols: padGroup(pf?.protocols, petSizes.protocols),
    ability: pf?.ability || null,
  };
  // Anciennes sauvegardes avec trous : on tasse tout en haut à gauche dès l'ouverture.
  fitState.draft = compactFitDraft(fitState.draft, fitState.slots);
  compactAllDroneDrafts();
  compactCurrentPetDraft();
  return true;
}

// ✅ Drones exclusifs par hangar : lit le fit du drone pour le hangar + config en cours d'édition.
// Brouillon local prioritaire quand le modal est ouvert (jamais persisté sans Appliquer).
function droneFitForState(drone) {
  try {
    if (fitState?.hangarId != null && fitState?.droneDrafts && Object.prototype.hasOwnProperty.call(fitState.droneDrafts, drone?.id)) {
      return fitState.droneDrafts[drone.id];
    }
    if (fitState?.hangarId != null && typeof getDroneFit === "function") {
      const f = getDroneFit(drone, fitState.hangarId, fitState.configNo);
      if (f) return f;
    }
  } catch {}
  const cfgKey = String(Number(fitState?.configNo) === 2 ? 2 : 1);
  return drone?.fits?.[cfgKey] || drone?.fit || { equipment: [], ability: null };
}

// ✅ P.E.T exclusif par hangar (vaisseau) + config 1/2, même pattern que les drones.
// Groupes d'emplacements P.E.T (officiel : lasers / générateurs-boucliers / gears / protocoles).
const PET_FIT_GROUPS = Object.freeze([
  { key: "lasers", label: "LASERS", hint: "laser", accepts: "Un laser" },
  { key: "generators", label: "GÉNÉRATEURS", hint: "bouclier uniquement", accepts: "Un bouclier" },
  { key: "gears", label: "GEARS", hint: "puce P.E.T", accepts: "Un gear P.E.T" },
  { key: "protocols", label: "PROTOCOLES", hint: "protocole IA", accepts: "Un protocole P.E.T" },
]);

function petProtocolStatLabel(key) {
  if (key === "damage") return "dégâts";
  if (key === "shield") return "bouclier";
  if (key === "hp") return "coque";
  if (key === "alien") return "dégâts Alien";
  if (key === "cargo") return "soute cargo";
  if (key === "radar") return "radar";
  if (key === "salvage") return "récupération";
  if (key === "aim") return "précision";
  if (key === "evasion") return "évasion";
  if (key === "eco") return "économie fuel";
  if (key === "heat") return "chaleur";
  return String(key || "");
}

function petItemGroup(itemId) {
  const it = itemId ? findCatalogItem(itemId) : null;
  if (!it) return null;
  if (it?.module?.type === "laser") return "lasers";
  if (it?.module?.type === "shield") return "generators";
  if (it?.petGear) return "gears";
  if (it?.petProtocol) return "protocols";
  return null;
}

function petFitForState(pet) {
  try {
    if (fitState?.hangarId != null && fitState?.petDraft) return fitState.petDraft;
    if (fitState?.hangarId != null && typeof getPetFit === "function") {
      const f = getPetFit(pet, fitState.hangarId, fitState.configNo);
      if (f) return f;
    }
  } catch {}
  const cfgKey = String(Number(fitState?.configNo) === 2 ? 2 : 1);
  return pet?.fits?.[cfgKey] || pet?.fit || { equipment: [], ability: null };
}

function setFitSection(section = "ship") {
  fitState.section = section === "drones" ? "drones" : section === "pet" ? "pet" : "ship";
  document.querySelectorAll("#fitCard [data-fit-section]").forEach(button => button.classList.toggle("active", button.dataset.fitSection === fitState.section));
  const shipSlots = document.querySelector("#fitCard .fitSlotsScroll");
  const droneWorkspace = document.getElementById("fitDroneWorkspace");
  const petWorkspace = document.getElementById("fitPetWorkspace");
  const configBar = document.getElementById("fitConfigBar");
  const inventoryPane = document.querySelector("#fitCard .fitInventoryPane");
  const inventoryFilter = document.getElementById("fitInvFilter");
  const card = document.getElementById("fitCard");
  card?.classList.toggle("droneMode", fitState.section === "drones");
  card?.classList.toggle("petMode", fitState.section === "pet");
  if (shipSlots) shipSlots.hidden = fitState.section !== "ship";
  if (droneWorkspace) droneWorkspace.hidden = fitState.section !== "drones";
  if (petWorkspace) petWorkspace.hidden = fitState.section !== "pet";
  if (configBar) configBar.hidden = fitState.section !== "ship";
  if (inventoryPane) inventoryPane.hidden = false;
  if ((fitState.section === "drones" || fitState.section === "pet") && inventoryFilter) inventoryFilter.value = "all";
  if (fitState.section === "drones") renderDroneEquipment();
  if (fitState.section === "pet") renderPetEquipment();
  if (fitState.draft) renderInventoryPalette();
  refreshFitApplyButton();
}


function renderDroneEquipment(userOverride) {
  const root = document.getElementById("fitDroneWorkspace");
  if (!root) return;
  if (userOverride) user = userOverride; else user = getCurrentUserFull();
  // Comme le vaisseau : affichage toujours tassé en haut à gauche (aucun trou).
  compactAllDroneDrafts();
  const drones = user?.drones?.items || [];
  if (!drones.length) { root.innerHTML = `<div class="fitDroneEmpty">Aucun drone. Achète ton premier Iris dans la boutique.</div>`; return; }
  root.innerHTML = `<div class="droneCards">${drones.map((drone,index)=>{
    const type=DRONE_TYPES[drone.type]; const next=DRONE_LEVEL_XP[drone.level]??DRONE_LEVEL_XP.at(-1);
    const pct=drone.level>=DRONE_MAX_LEVEL?100:Math.min(100,Math.floor(drone.exp/next*100));
    const fitForHangar=droneFitForState(drone);
    const slots=(fitForHangar?.equipment || []).map((id,slotIndex)=>{
      const item=id?findCatalogItem(id):null;
      const selKey=`${drone.id}#${slotIndex}`;
      return `<button class="slotCell droneFitSlot${item?" filled":""}${fitState.selectedDroneSlots.has(selKey)?" selected":""}" data-drone-id="${drone.id}" data-drone-slot="${slotIndex}" data-item-id="${item?.id ?? ""}" title="${escapeHtml(item?.name||"Dépose un laser ou un bouclier")}">${item?`<img src="${iconForItem(item)}" alt="">`:""}</button>`;
    }).join("");
    const xpText=drone.level>=DRONE_MAX_LEVEL?"Niveau maximal":`${formatNumber(Math.floor(drone.exp))} XP / ${formatNumber(next)} XP`;
    return `<article class="droneEquipmentCard"><img class="droneCardSprite" src="${getDroneSpritePath(drone,29)}" alt=""><div class="droneCardIdentity"><strong>${type.name} ${index+1}</strong><span>Niveau ${drone.level} · ${xpText}</span></div><div class="droneCardAbility"><label>DESIGN</label><button class="droneDesignSlot" title="${fitForHangar?.ability?escapeHtml(fitForHangar.ability):"Design vide"}">${fitForHangar?.ability?escapeHtml(fitForHangar.ability):""}</button></div><div class="droneCardSlots"><label>ÉQUIPEMENT</label><div>${slots}</div></div>${drone.level>=DRONE_MAX_LEVEL?"":`<div class="droneXp"><i style="width:${pct}%"></i></div>`}</article>`;
  }).join("")}</div>`;
  root.querySelectorAll("[data-drone-slot]").forEach(slot=>{
    const itemId=slot.dataset.itemId;
    slot.addEventListener("click",event=>{
      if(!itemId)return;
      const selKey=`${slot.dataset.droneId}#${slot.dataset.droneSlot}`;
      if(event.shiftKey){
        const matched=[...fitState.selectedDroneSlots.values()].filter(id=>id===itemId).length;
        const total = [...root.querySelectorAll("[data-drone-slot]")].filter(candidate => candidate.dataset.itemId === itemId).length;
        const alreadyFullySelected=matched===total&&matched===fitState.selectedDroneSlots.size;
        clearFitSelection();
        if(!alreadyFullySelected)root.querySelectorAll("[data-drone-slot]").forEach(candidate=>{if(candidate.dataset.itemId===itemId)fitState.selectedDroneSlots.set(`${candidate.dataset.droneId}#${candidate.dataset.droneSlot}`,itemId);});
      }else if(event.ctrlKey||event.metaKey){
        fitState.selectedCopies.clear();
        if(fitState.selectedDroneSlots.has(selKey))fitState.selectedDroneSlots.delete(selKey);
        else fitState.selectedDroneSlots.set(selKey,itemId);
      }else{
        const deselectOnly=fitState.selectedDroneSlots.size===1&&fitState.selectedDroneSlots.has(selKey);
        clearFitSelection();
        if(!deselectOnly)fitState.selectedDroneSlots.set(selKey,itemId);
      }
      showFitError("");
      renderDroneEquipment();renderInventoryPalette();
    });
    slot.addEventListener("dragover",event=>{event.preventDefault();event.dataTransfer.dropEffect=itemId?"move":"copy";const ids=Array.isArray(fitState.draggedItemIds)?fitState.draggedItemIds:[];if(ids.length&&!ids.some(droneItemPlaceable))return;slot.classList.add("dragTarget")});
    slot.addEventListener("dragleave",()=>slot.classList.remove("dragTarget"));
    slot.addEventListener("drop",event=>{
      event.preventDefault();event.stopPropagation();slot.classList.remove("dragTarget");
      const droppedId=event.dataTransfer.getData("text/plain");
      const type=droppedId?findCatalogItem(droppedId)?.module?.type:null;
      if (findCatalogItem(droppedId)?.petOnly) return showFitError("Objet P.E.T uniquement.");
      let srcDrone=null;
      try{const raw=event.dataTransfer.getData("application/x-orbit-slot");if(raw){const p=JSON.parse(raw);if(p&&p.droneId!=null&&p.slot!=null)srcDrone=p;}}catch{}
      if(srcDrone){
        const fresh=getCurrentUserFull();if(!fresh)return showFitError("Non connecté.");
        const target=fresh.drones?.items?.find(entry=>entry.id===slot.dataset.droneId);
        const source=fresh.drones?.items?.find(entry=>entry.id===srcDrone.droneId);
        if(!target || !source)return;
        const sourceIndex = Number(srcDrone.slot);
        const targetIndex = Number(slot.dataset.droneSlot);
        const sourceFit = droneFitForState(source);
        const targetFit = droneFitForState(target);
        if (!Number.isInteger(sourceIndex) || sourceFit?.equipment?.[sourceIndex] !== droppedId) return;
        if (source.id === target.id && sourceIndex === targetIndex) return;
        const moved = moveEquipmentSlots(sourceFit.equipment, targetFit.equipment, sourceIndex, targetIndex);
        if (!moved) return;
        const fits = [];
        if (source.id !== target.id) {
          fits.push({ droneId: source.id, fit: { ...sourceFit, equipment: moved.source } });
        }
        fits.push({ droneId: target.id, fit: { ...targetFit, equipment: moved.target } });
        // Brouillon local : appliqué seulement via Appliquer (en base).
        // Comme le vaisseau : on tasse tout en haut à gauche après déplacement.
        for (const { droneId, fit } of fits) {
          const droneEntry = droneId === source.id ? source : target;
          const size = Math.max(0, Number(DRONE_TYPES[droneEntry.type]?.slots) || fit.equipment.length);
          fitState.droneDrafts[droneId] = { equipment: compactDroneEquipment(fit.equipment, size), ability: fit.ability || null };
        }
        clearFitSelection();showFitError("");
        renderDroneEquipment(user);renderInventoryPalette();
        return;
      }
      if(type!=="laser"&&type!=="shield")return showFitError("Un drone accepte uniquement un laser ou un bouclier.");
      if((computeUsage(fitState.draft)[droppedId]||0)>=ownedCount(user,droppedId))return showFitError("Tous les exemplaires sont déjà équipés.");
      const fresh=getCurrentUserFull();if(!fresh)return;
      const drone=fresh.drones?.items?.find(entry=>entry.id===slot.dataset.droneId);if(!drone)return;
      const droneFit=droneFitForState(drone);
      // Comme le vaisseau : équipement toujours dans le slot libre le plus en haut à gauche.
      const size = Math.max(0, Number(DRONE_TYPES[drone.type]?.slots) || (droneFit?.equipment || []).length);
      const compacted = compactDroneEquipment(droneFit?.equipment || [], size);
      const freeIndex = compacted.findIndex((value) => !value);
      if (freeIndex < 0) return showFitError("Aucun emplacement de drone disponible");
      compacted[freeIndex] = droppedId;
      // Brouillon local : appliqué seulement via Appliquer (en base).
      fitState.droneDrafts[drone.id] = { equipment: [...compacted], ability: droneFit?.ability || null };
      clearFitSelection();showFitError("");
      renderDroneEquipment(user);renderInventoryPalette();
    });
    if(itemId){
      slot.draggable=true;
      slot.addEventListener("dragstart",event=>{
        if(!fitState.selectedDroneSlots.has(`${slot.dataset.droneId}#${slot.dataset.droneSlot}`)){
          clearFitSelection();
          fitState.selectedDroneSlots.set(`${slot.dataset.droneId}#${slot.dataset.droneSlot}`,itemId);
        }
        event.dataTransfer.setData("text/plain",itemId);
        event.dataTransfer.setData("application/x-orbit-slot",JSON.stringify({droneId:slot.dataset.droneId,slot:Number(slot.dataset.droneSlot)}));
        const slotted=[...fitState.selectedDroneSlots.entries()].map(([key,id])=>{const[droneId,s]=key.split("#");return{droneId,slot:Number(s),itemId:id};});
        event.dataTransfer.setData("application/x-orbit-slots",JSON.stringify(slotted));
        event.dataTransfer.effectAllowed="move";
        fitState.draggedItemIds=[itemId];
        slot.classList.add("dragging");
        updateFitDropHighlights();
      });
      slot.addEventListener("dragend",()=>{slot.classList.remove("dragging");fitState.draggedItemIds=[];clearFitDropHighlights();});
    }
  });
  root.addEventListener("dragover",event=>{
    if(!(event.dataTransfer.types.includes("application/x-orbit-items") || event.dataTransfer.types.includes("text/plain") || (Array.isArray(fitState.draggedItemIds) && fitState.draggedItemIds.length)))return;
    event.preventDefault();
    updateFitDropHighlights();
  });
  root.addEventListener("dragleave",event=>{if(!root.contains(event.relatedTarget))clearFitDropHighlights();});
  root.addEventListener("drop",()=>clearFitDropHighlights());
  refreshFitApplyButton();
}

function renderPetEquipment(userOverride) {
  const root = document.getElementById("fitPetWorkspace");
  if (!root) return;
  if (userOverride) user = userOverride; else user = getCurrentUserFull();
  // Comme le vaisseau : affichage toujours tassé en haut à gauche (aucun trou).
  compactCurrentPetDraft();
  const pet = user?.pet?.owned === true ? user.pet : null;
  if (!pet) {
    root.innerHTML = `<div class="fitDroneEmpty">Aucun P.E.T. Achète ton P.E.T dans la boutique (onglet P.E.T, 10 M crédits).</div>`;
    return;
  }
  const level = Math.max(0, Number(pet.level) || getPetLevel(pet.exp));
  const exp = Math.max(0, Number(pet.exp) || 0);
  const next = getPetNextLevelXp(level);
  const prevThreshold = getPetLevelXp(level);
  const pct = Math.min(100, Math.max(0, Math.floor(((exp - prevThreshold) / Math.max(1, next - prevThreshold)) * 100)));
  const fitForHangar = petFitForState(pet);
  const slotsByGroup = getPetSlots(level);
  const xpText = `${formatNumber(Math.floor(exp))} XP / ${formatNumber(next)} XP`;
  const groupPlaceholder = { lasers: "Dépose un laser", generators: "Dépose un bouclier", gears: "Dépose un gear P.E.T", protocols: "Dépose un protocole" };
  const groupsHtml = PET_FIT_GROUPS.map((group) => {
    const arr = Array.isArray(fitForHangar?.[group.key]) ? fitForHangar[group.key] : [];
    const filled = arr.filter(Boolean).length;
    const size = Number(slotsByGroup[group.key]) || 0;
    const buttons = arr.map((id, slotIndex) => {
      const item = id ? findCatalogItem(id) : null;
      const selKey = `pet#${group.key}#${slotIndex}`;
      return `<button class="slotCell droneFitSlot petFitSlot${item ? " filled" : ""}${fitState.selectedPetSlots.has(selKey) ? " selected" : ""}" data-pet-group="${group.key}" data-pet-slot="${slotIndex}" data-item-id="${item?.id ?? ""}" title="${escapeHtml(item?.name || groupPlaceholder[group.key])}">${item ? `<img src="${iconForItem(item)}" alt="">` : ""}</button>`;
    }).join("");
    return `<div class="petGroup"><label>${group.label} · ${filled}/${size}</label><div class="petGroupSlots">${buttons}</div></div>`;
  }).join("");
  root.innerHTML = `<div class="petCards">`
    + `<article class="petHeaderCard">`
    + `<img class="droneCardSprite" src="${getPetSpritePath(pet, 21)}" alt="P.E.T">`
    + `<div class="droneCardIdentity"><strong>P.E.T · Niveau ${level}</strong><span>${xpText} · +5 % de ton XP · ${escapeHtml(getPetLevelBonus(level))}</span></div>`
    + `<div class="droneXp"><i style="width:${pct}%"></i></div>`
    + `</article>`
    + `<article class="petSlotsCard"><div class="petGroups">${groupsHtml}</div>`
    + `</article></div>`;
  root.querySelectorAll("[data-pet-slot]").forEach(slot => {
    const itemId = slot.dataset.itemId;
    const groupKey = slot.dataset.petGroup;
    const selKey = `pet#${groupKey}#${slot.dataset.petSlot}`;
    slot.addEventListener("click", event => {
      if (!itemId) return;
      // Maj : tous les exemplaires identiques (comme les drones).
      if (event.shiftKey) {
        const matched = [...fitState.selectedPetSlots.values()].filter(id => id === itemId).length;
        const total = PET_FIT_GROUPS.reduce((sum, group) => sum + (petFitForState(pet)?.[group.key] || []).filter(id => id === itemId).length, 0);
        const alreadyFullySelected = matched === total && matched === fitState.selectedPetSlots.size;
        clearFitSelection();
        if (!alreadyFullySelected) {
          const fit = petFitForState(pet);
          for (const group of PET_FIT_GROUPS) {
            (fit?.[group.key] || []).forEach((currentId, currentIndex) => {
              if (currentId === itemId) fitState.selectedPetSlots.set(`pet#${group.key}#${currentIndex}`, currentId);
            });
          }
        }
      } else if (event.ctrlKey || event.metaKey) {
        fitState.selectedCopies.clear();
        if (fitState.selectedPetSlots.has(selKey)) fitState.selectedPetSlots.delete(selKey);
        else fitState.selectedPetSlots.set(selKey, itemId);
      } else {
        const deselectOnly = fitState.selectedPetSlots.size === 1 && fitState.selectedPetSlots.has(selKey);
        clearFitSelection();
        if (!deselectOnly) fitState.selectedPetSlots.set(selKey, itemId);
      }
      showFitError("");
      renderPetEquipment(); renderInventoryPalette();
    });
    slot.addEventListener("dragover", event => { event.preventDefault(); event.dataTransfer.dropEffect = itemId ? "move" : "copy"; const ids = Array.isArray(fitState.draggedItemIds) ? fitState.draggedItemIds : []; if (ids.length && !ids.some((id) => petItemGroup(id) === groupKey)) return; slot.classList.add("dragTarget"); });
    slot.addEventListener("dragleave", () => slot.classList.remove("dragTarget"));
    slot.addEventListener("drop", event => {
      event.preventDefault(); event.stopPropagation(); slot.classList.remove("dragTarget");
      const droppedId = event.dataTransfer.getData("text/plain");
      if (!droppedId) return;
      const targetGroup = petItemGroup(droppedId);
      if (!targetGroup) return showFitError("Cet objet ne va pas sur le P.E.T.");
      if (targetGroup !== groupKey) {
        const want = PET_FIT_GROUPS.find(g => g.key === targetGroup);
        return showFitError(`Va dans ${want ? want.label : targetGroup} (glisse sur le bon groupe).`);
      }
      const fresh = getCurrentUserFull(); if (!fresh) return;
      if (fresh.pet?.owned !== true) return showFitError("P.E.T non possédé.");
      const baseFit = petFitForState(fresh.pet);
      const nextFit = {
        lasers: [...(baseFit?.lasers || [])],
        generators: [...(baseFit?.generators || [])],
        gears: [...(baseFit?.gears || [])],
        protocols: [...(baseFit?.protocols || [])],
        ability: baseFit?.ability || null,
      };
      // Déplacement slot REX -> slot REX (comme les drones) : on vide la source
      // au lieu de dupliquer. Échange si la cible est occupée et compatible.
      let srcPet = null;
      try {
        const raw = event.dataTransfer.getData("application/x-orbit-pet-slot");
        if (raw) { const p = JSON.parse(raw); if (p && p.group && Number.isInteger(p.slot)) srcPet = p; }
      } catch {}
      const targetIndex = Number(slot.dataset.petSlot);
      if (srcPet && (nextFit[srcPet.group]?.[srcPet.slot] || null) === droppedId) {
        if (srcPet.group === groupKey && srcPet.slot === targetIndex) return;
        const displaced = nextFit[groupKey][targetIndex] || null;
        if (displaced && petItemGroup(displaced) !== srcPet.group) {
          return showFitError("Emplacement occupé.");
        }
        nextFit[srcPet.group][srcPet.slot] = displaced;
        nextFit[groupKey][targetIndex] = droppedId;
        // Brouillon local : appliqué seulement via Appliquer (en base).
        // Comme le vaisseau : on tasse tout en haut à gauche après déplacement.
        fitState.petDraft = compactPetFit({ ...nextFit }, petSizesFor(fresh.pet));
        clearFitSelection(); showFitError("");
        renderPetEquipment(user); renderInventoryPalette();
        return;
      }
      const droppedItem = findCatalogItem(droppedId);
      const req = Math.max(0, Number(droppedItem?.petLevel) || 0);
      if (req > 0 && level < req) return showFitError(`Exige le P.E.T niveau ${req}.`);
      if ((computeUsage(fitState.draft)[droppedId] || 0) >= ownedCount(user, droppedId)) return showFitError("Tous les exemplaires sont déjà équipés.");
      // Comme le vaisseau : équipement toujours dans le slot libre le plus en haut à gauche.
      const compactedGroup = compactFitArray(nextFit[groupKey] || [], (petSizesFor(fresh.pet)[groupKey] ?? (nextFit[groupKey] || []).length));
      const freePetIndex = compactedGroup.findIndex((value) => !value);
      if (freePetIndex < 0) return showFitError("Aucun emplacement P.E.T disponible");
      compactedGroup[freePetIndex] = droppedId;
      nextFit[groupKey] = compactedGroup;
      // Brouillon local : appliqué seulement via Appliquer (en base).
      fitState.petDraft = compactPetFit({ ...nextFit }, petSizesFor(fresh.pet));
      clearFitSelection(); showFitError("");
      renderPetEquipment(user); renderInventoryPalette();
    });
    if (itemId) {
      slot.draggable = true;
      slot.addEventListener("dragstart", event => {
        if (!fitState.selectedPetSlots.has(selKey)) {
          clearFitSelection();
          fitState.selectedPetSlots.set(selKey, itemId);
        }
        event.dataTransfer.setData("text/plain", itemId);
        event.dataTransfer.setData("application/x-orbit-pet-slot", JSON.stringify({ group: groupKey, slot: Number(slot.dataset.petSlot) }));
        event.dataTransfer.effectAllowed = "move";
        fitState.draggedItemIds = [itemId];
        slot.classList.add("dragging");
        updateFitDropHighlights();
      });
      slot.addEventListener("dragend", () => { slot.classList.remove("dragging"); fitState.draggedItemIds = []; clearFitDropHighlights(); });
    }
  });
  root.addEventListener("dragover", event => {
    if(!(event.dataTransfer.types.includes("application/x-orbit-items") || event.dataTransfer.types.includes("text/plain") || (Array.isArray(fitState.draggedItemIds) && fitState.draggedItemIds.length)))return;
    event.preventDefault();
    updateFitDropHighlights();
  });
  root.addEventListener("dragleave", event => { if (!root.contains(event.relatedTarget)) clearFitDropHighlights(); });
  root.addEventListener("drop", () => clearFitDropHighlights());
  refreshFitApplyButton();
}

function clearFitSelection() {
  fitState.selectedItemId = null;
  fitState.selectedCopyKey = null;
  fitState.selectedCopies.clear();
  fitState.selectedSlots.clear();
  fitState.selectedDroneSlots.clear();
  fitState.selectedPetSlots.clear();
}

function refreshReturnSelectionButton() {
  const button = document.getElementById("fitBtnReturnSelection");
  if (button) button.disabled = fitState.selectedSlots.size === 0;
}

function returnSelectedEquippedItems() {
  if (!fitState.draft || !fitState.selectedSlots.size) return;
  // Vaisseau intouchable hors base (ni ajout ni retrait).
  if (shipEditLocked()) return showFitError("Hors base : le vaisseau ne peut pas être modifié.");
  for (const slotKey of fitState.selectedSlots.keys()) {
    const [slotType, rawIndex] = slotKey.split("#");
    const index = Number(rawIndex);
    if (Array.isArray(fitState.draft[slotType]) && Number.isInteger(index)) fitState.draft[slotType][index] = null;
  }
  compactCurrentFit();
  clearFitSelection();
  showFitError("");
  renderSlots();
  renderInventoryPalette();
  renderShipModulesList();
}

function compactCurrentFit() {
  if (fitState.draft) fitState.draft = compactFitDraft(fitState.draft, fitState.slots);
}

// Drones / P.E.T : même règle que le vaisseau — aucun trou, tout poussé en haut à gauche.
function droneCapacityFor(drone) {
  return Math.max(0, Number(DRONE_TYPES[drone?.type]?.slots) || (droneFitForState(drone)?.equipment || []).length);
}

function petSizesFor(pet) {
  const level = Math.max(0, Number(pet?.level) || getPetLevel(pet?.exp));
  return getPetSlots(level);
}

function compactDroneDraft(droneId) {
  const drone = (user?.drones?.items || []).find((entry) => entry?.id === droneId);
  const current = droneId != null ? fitState.droneDrafts?.[droneId] : null;
  if (!current || !Array.isArray(current.equipment)) return;
  const size = drone ? droneCapacityFor(drone) : current.equipment.length;
  fitState.droneDrafts[droneId] = {
    equipment: compactDroneEquipment(current.equipment, size),
    ability: current.ability || null,
  };
}

function compactAllDroneDrafts() {
  if (!fitState.droneDrafts) return;
  for (const droneId of Object.keys(fitState.droneDrafts)) compactDroneDraft(droneId);
}

function compactCurrentPetDraft() {
  if (!fitState.petDraft) return;
  const sizes = petSizesFor(user?.pet);
  fitState.petDraft = compactPetFit(fitState.petDraft, sizes);
}

// Objet réservé au P.E.T : laser/bouclier petOnly, gear ou protocole.
// Visible uniquement dans la section P.E.T du hangar + badgé partout.
function isPetOnlyItem(it) {
  return !!(it && (it.petOnly || it.petGear || it.petProtocol));
}

function slotTypeForItem(itemId) {  if (isRouletteModuleId(itemId)) return "shipMods";
  if (findCatalogItem(itemId)?.petOnly) return null;
  const type = findCatalogItem(itemId)?.module?.type;
  if (type === "laser") return "lasers";
  if (type === "speed" || type === "shield") return "gens";
  if (type === "extra") return "extras";
  return null;
}

function selectedInventoryItemIds() {
  return [...fitState.selectedCopies.values()];
}

function clearFitDropHighlights() {
  document.querySelectorAll("#fitCard .fitSlotGroup.dragCompatible").forEach((group) => group.classList.remove("dragCompatible"));
  document.querySelectorAll("#fitCard .droneFitSlot.dragCompatible").forEach((slot) => slot.classList.remove("dragCompatible"));
  document.querySelectorAll("#fitCard .droneFitSlot.dragging").forEach((slot) => slot.classList.remove("dragging"));
  document.querySelectorAll("#fitCard .petFitSlot.dragCompatible").forEach((slot) => slot.classList.remove("dragCompatible"));
  document.querySelectorAll("#fitCard .petFitSlot.dragging").forEach((slot) => slot.classList.remove("dragging"));
  document.querySelectorAll("#fitCard .fitSlotsScroll .slotCell.dragCompatible").forEach((slot) => slot.classList.remove("dragCompatible"));
  document.querySelectorAll("#fitCard .slotCell.dragTarget").forEach((slot) => slot.classList.remove("dragTarget"));
  document.querySelectorAll("#fitCard .droneFitSlot.dragTarget").forEach((slot) => slot.classList.remove("dragTarget"));
  document.querySelectorAll("#fitCard .petFitSlot.dragTarget").forEach((slot) => slot.classList.remove("dragTarget"));
}

function droneItemPlaceable(itemId) {
  if (!itemId || isRouletteModuleId(itemId)) return false;
  const it = findCatalogItem(itemId);
  if (!it || it.petOnly || it.petGear || it.petProtocol) return false;
  const t = it?.module?.type;
  return t === "laser" || t === "shield";
}

function updateFitDropHighlights() {
  clearFitDropHighlights();
  const draggedIds = Array.isArray(fitState.draggedItemIds) ? fitState.draggedItemIds.filter(Boolean) : [];
  if (!draggedIds.length) return;
  // ---- Vaisseau : un groupe par type (lasers / gens / extras / shipMods) ----
  // Les slots bleus viennent du CSS : `.fitSlotGroup.dragCompatible .slotCell`.
  const compatibleTypes = new Set(draggedIds.map(slotTypeForItem).filter(Boolean));
  // Modules roulette : ne surligne que si la famille correspond au hangar en cours.
  if (compatibleTypes.has("shipMods")) {
    const hangar = (user?.hangars || []).find((x) => x?.id === fitState.hangarId);
    const shipFamily = hangar ? getShipFamilyId(hangar.shipId) : null;
    const allModules = Array.isArray(user?.inventory?.shipModules) ? user.inventory.shipModules : [];
    const anyCompatible = draggedIds.some((id) => {
      if (!isRouletteModuleId(id)) return false;
      const mod = allModules.find((entry) => entry?.id === id);
      if (!mod || !shipFamily) return true;
      return moduleFamilyId(mod) === shipFamily;
    });
    if (!anyCompatible) compatibleTypes.delete("shipMods");
  }
  compatibleTypes.forEach((slotType) => {
    document.querySelector(`#fitCard .fitSlotGroup[data-slot-type="${slotType}"]`)?.classList.add("dragCompatible");
  });
  // ---- Drones : lasers + boucliers uniquement, tous les slots concernés ----
  if (draggedIds.some(droneItemPlaceable)) {
    document.querySelectorAll(`#fitCard #fitDroneWorkspace [data-drone-slot]`).forEach((s) => s.classList.add("dragCompatible"));
  }
  // ---- P.E.T : uniquement le(s) groupe(s) concerné(s) par l'item glissé ----
  const petGroups = new Set(draggedIds.map(petItemGroup).filter(Boolean));
  petGroups.forEach((groupKey) => {
    document.querySelectorAll(`#fitCard #fitPetWorkspace [data-pet-group="${groupKey}"]`).forEach((s) => s.classList.add("dragCompatible"));
  });
}

function equipSelectedInventoryItems(preferredSlotType = null) {
  if (!fitState.draft) return 0;
  const selected = selectedInventoryItemIds();
  // Le module roulette coexiste avec la sélection d'inventaire : on équipe les deux.
  if (fitState.selectedItemId && !selected.includes(fitState.selectedItemId)) selected.push(fitState.selectedItemId);
  if (!selected.length) return 0;

  if (fitState.section === "drones") {
    const fresh = getCurrentUserFull();
    if (!fresh) return 0;
    // Comme le vaisseau : on tasse d'abord pour que le 1er libre soit bien en haut à gauche.
    compactAllDroneDrafts();
    const fits = [];
    // Suit les équipements déjà attribués dans cette boucle pour ce hangar/config.
    const pendingByDrone = new Map();
    const equipmentFor = (drone) => {
      if (pendingByDrone.has(drone.id)) return pendingByDrone.get(drone.id);
      const base = droneFitForState(drone);
      const size = Math.max(0, Number(DRONE_TYPES[drone.type]?.slots) || (base?.equipment || []).length);
      return [...compactDroneEquipment(base?.equipment || [], size)];
    };
    for (const itemId of selected) {
      if (findCatalogItem(itemId)?.petOnly) continue;
      const moduleType = findCatalogItem(itemId)?.module?.type;
      if (moduleType !== "laser" && moduleType !== "shield") continue;
      const drone = fresh.drones?.items?.find(entry => (equipmentFor(entry) || []).some(value => !value));
      if (!drone) break;
      const baseFit = droneFitForState(drone);
      const equipment = equipmentFor(drone);
      equipment[equipment.findIndex(value => !value)] = itemId;
      pendingByDrone.set(drone.id, equipment);
      fits.push({ droneId: drone.id, fit: { ...baseFit, equipment: [...equipment] }, configNo: fitState.configNo, hangarId: fitState.hangarId });
      // Met à jour l'objet frais pour que la prochaine itération voie l'emplacement occupé.
      const idx = fits.length - 1;
      // (pendingByDrone fait foi, pas besoin de muter fresh ici)
      void idx;
    }
    // Brouillon local : appliqué seulement via Appliquer (en base).
    // (une entrée fits par objet placé, comme applied côté sauvegarde).
    // Déjà tassé (1er libre = haut-gauche), on re-tasse par sécurité.
    for (const { droneId, fit } of fits) {
      const droneEntry = fresh.drones?.items?.find((entry) => entry.id === droneId);
      const size = droneEntry ? Math.max(0, Number(DRONE_TYPES[droneEntry.type]?.slots) || fit.equipment.length) : fit.equipment.length;
      fitState.droneDrafts[droneId] = { equipment: compactDroneEquipment(fit.equipment, size), ability: fit.ability || null };
    }
    const added = fits.length;
    clearFitSelection();
    showFitError(added ? "" : "Aucun emplacement de drone disponible");
    renderDroneEquipment(user);
    renderInventoryPalette();
    return added;
  }

  if (fitState.section === "pet") {
    const fresh = getCurrentUserFull();
    if (!fresh) return 0;
    if (fresh.pet?.owned !== true) return showFitError("P.E.T non possédé."), 0;
    const petLevel = Math.max(0, Number(fresh.pet.level) || getPetLevel(fresh.pet.exp));
    const baseFit = petFitForState(fresh.pet);
    // Comme le vaisseau : on tasse d'abord pour que le 1er libre soit bien en haut à gauche.
    const petSizes = petSizesFor(fresh.pet);
    const nextFit = compactPetFit({
      lasers: [...(baseFit?.lasers || [])],
      generators: [...(baseFit?.generators || [])],
      gears: [...(baseFit?.gears || [])],
      protocols: [...(baseFit?.protocols || [])],
      ability: baseFit?.ability || null,
    }, petSizes);
    let added = 0;
    let skippedGate = 0;
    // Compte les placements du lot en cours : computeUsage lit l'ancien brouillon,
    // sans ça le même exemplaire passait le contrôle à chaque itération.
    const pending = Object.create(null);
    for (const itemId of selected) {
      const group = petItemGroup(itemId);
      if (!group) continue;
      const it = findCatalogItem(itemId);
      const req = Math.max(0, Number(it?.petLevel) || 0);
      if (req > 0 && petLevel < req) { skippedGate++; continue; }
      if (((computeUsage(fitState.draft)[itemId] || 0) + (pending[itemId] || 0)) >= ownedCount(fresh, itemId)) continue;
      const freeIndex = nextFit[group].findIndex(value => !value);
      if (freeIndex < 0) continue;
      nextFit[group][freeIndex] = itemId;
      pending[itemId] = (pending[itemId] || 0) + 1;
      added++;
    }
    if (!added) return showFitError(skippedGate ? "Paliers de niveau P.E.T insuffisants ou plus de place" : "Aucun emplacement P.E.T disponible"), 0;
    // Brouillon local : appliqué seulement via Appliquer (en base).
    // Déjà tassé (1er libre = haut-gauche), on re-tasse par sécurité.
    fitState.petDraft = compactPetFit({ ...nextFit }, petSizesFor(fresh.pet));
    clearFitSelection();
    showFitError("");
    renderPetEquipment(user);
    renderInventoryPalette();
    return added;
  }

  // Vaisseau intouchable hors base (ni ajout ni retrait).
  if (shipEditLocked()) return showFitError("Hors base : le vaisseau ne peut pas être modifié."), 0;
  compactCurrentFit();
  let added = 0;
  for (const slotType of ["lasers", "gens", "extras"]) {
    if (preferredSlotType && preferredSlotType !== slotType) continue;
    const itemIds = selected.filter((itemId) => slotTypeForItem(itemId) === slotType);
    const result = appendToFitSlots(fitState.draft[slotType], itemIds, fitState.slots[slotType]);
    fitState.draft[slotType] = result.values;
    added += result.added;
  }

  if (!preferredSlotType || preferredSlotType === "shipMods") {
    const allModules = Array.isArray(user?.inventory?.shipModules) ? user.inventory.shipModules : [];
    const hangar = (user?.hangars || []).find((x) => x?.id === fitState.hangarId);
    const shipFamily = hangar ? getShipFamilyId(hangar.shipId) : null;
    const moduleIds = selected.filter((itemId) => slotTypeForItem(itemId) === "shipMods");
    let blockedSameType = null;
    let blockedFamily = false;
    for (const moduleId of moduleIds) {
      const module = allModules.find((entry) => entry?.id === moduleId);
      if (!module || fitState.draft.shipMods.includes(moduleId)) continue;
      if (shipFamily && moduleFamilyId(module) !== shipFamily) { blockedFamily = true; continue; }
      const sameTypeEquipped = fitState.draft.shipMods.some((equippedId) => {
        const equipped = allModules.find((entry) => entry?.id === equippedId);
        return equipped && equipped.type === module.type;
      });
      if (sameTypeEquipped) { blockedSameType = module.type; continue; }
      const result = appendToFitSlots(fitState.draft.shipMods, [moduleId], fitState.slots.shipMods);
      fitState.draft.shipMods = result.values;
      added += result.added;
    }
    if (!added && blockedSameType) {
      clearFitSelection();
      fitState.draggedItemIds = [];
      clearFitDropHighlights();
      showFitError(`1 seul module ${String(blockedSameType).toUpperCase()} par vaisseau (officiel) — glisse le nouveau sur le slot occupé pour le remplacer`);
      renderSlots();
      renderInventoryPalette();
      if (typeof renderShipModulesList === "function") renderShipModulesList();
      return added;
    }
    if (!added && blockedFamily) {
      clearFitSelection();
      fitState.draggedItemIds = [];
      clearFitDropHighlights();
      showFitError("Ce module n'est pas compatible avec ce vaisseau");
      renderSlots();
      renderInventoryPalette();
      if (typeof renderShipModulesList === "function") renderShipModulesList();
      return added;
    }
  }

  clearFitSelection();
  fitState.draggedItemIds = [];
  clearFitDropHighlights();
  showFitError(added ? "" : "Aucun emplacement compatible disponible");
  renderSlots();
  renderInventoryPalette();
  if (typeof renderShipModulesList === "function") renderShipModulesList();
  return added;
}

function showFitError(text) {
  const el = document.getElementById("fitErr");
  if (!el) return;
  if (!text) {
    el.style.display = "none";
    el.textContent = "";
    return;
  }
  el.style.display = "block";
  el.textContent = text;
}

function computeUsage(draft) {
  const map = Object.create(null);
  const all = [...(draft?.lasers || []), ...(draft?.gens || []), ...(draft?.extras || []), ...(draft?.shipMods || [])];
  // ✅ Comptage exclusif au hangar en cours d'édition (chaque vaisseau a ses propres drones + P.E.T).
  for (const drone of user?.drones?.items || []) all.push(...(droneFitForState(drone)?.equipment || []));
  if (user?.pet?.owned === true) {
    const petFit = petFitForState(user.pet);
    all.push(...(petFit?.lasers || []), ...(petFit?.generators || []), ...(petFit?.gears || []), ...(petFit?.protocols || []));
  }
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
    if (!isRouletteModuleId(itemId)) return false;
    const allModules = Array.isArray(user?.inventory?.shipModules) ? user.inventory.shipModules : [];
    const module = allModules.find((entry) => entry?.id === itemId);
    if (!module) return true;
    const hangar = (user?.hangars || []).find((x) => x?.id === fitState.hangarId);
    if (!hangar) return true;
    return moduleFamilyId(module) === getShipFamilyId(hangar.shipId);
  }

  const it = findCatalogItem(itemId);
  if (!it?.module || it.petOnly) return false;
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

  if (fitState.section === "drones") {
    // Brouillon local : appliqué seulement via Appliquer (en base).
    // On vide les slots sans supprimer les emplacements (taille = slots du drone).
    for (const drone of user?.drones?.items || []) {
      const prev = fitState.droneDrafts[drone.id] || { equipment: [], ability: null };
      const size = Math.max(0, Number(DRONE_TYPES[drone.type]?.slots) || prev.equipment.length);
      fitState.droneDrafts[drone.id] = { equipment: Array(size).fill(null), ability: prev.ability || null };
    }
    clearFitSelection();
    showFitError("");
    renderDroneEquipment(user);
    renderInventoryPalette();
    return;
  }

  if (fitState.section === "pet") {
    if (user?.pet?.owned !== true) return showFitError("P.E.T non possédé.");
    // Brouillon local : appliqué seulement via Appliquer (en base).
    // On vide les slots sans supprimer les emplacements (taille = niveau du REX).
    const petLevel = Math.max(0, Number(user.pet.level) || getPetLevel(user.pet.exp));
    const prev = fitState.petDraft || {};
    fitState.petDraft = {
      ...emptyPetFit(petLevel),
      ability: prev.ability || null,
    };
    clearFitSelection();
    showFitError("");
    renderPetEquipment(user);
    renderInventoryPalette();
    return;
  }

  // Vaisseau intouchable hors base (ni ajout ni retrait).
  if (shipEditLocked()) return showFitError("Hors base : le vaisseau ne peut pas être modifié.");
  fitState.draft.lasers = fitState.draft.lasers.map(() => null);
  fitState.draft.gens = fitState.draft.gens.map(() => null);
  fitState.draft.extras = fitState.draft.extras.map(() => null);
  fitState.draft.shipMods = fitState.draft.shipMods.map(() => null);

  clearFitSelection();
  showFitError("");
  renderSlots();
  renderInventoryPalette();
  renderShipModulesList();
}

function sellFitInventoryItem(itemId) {
  if (!itemId || !fitState.draft) return;
  const usage = computeUsage(fitState.draft)[itemId] || 0;
  const owned = ownedCount(user, itemId);
  if (owned <= usage) return showFitError("Tous les exemplaires de cet objet sont équipés");

  const out = sellItem(itemId, 1);
  if (!out?.ok) return showFitError(out?.error || "Vente impossible");

  user = getCurrentUserFull();
  clearFitSelection();
  showFitError("");
  renderSlots();
  renderInventoryPalette();
  renderStats(user);
  renderHangars(user);
  refreshShopIfVisible();
  setMsg(`Vendu (+${formatNumber(out.gain)} crédits)`, true);
}

function sellSelectedInventoryItems() {
  const selected = selectedInventoryItemIds();
  if (!selected.length || !fitState.draft) return;
  const grouped = new Map();
  let estimatedGain = 0;
  for (const itemId of selected) {
    const item = findCatalogItem(itemId);
    const entry = grouped.get(itemId) || { name: item?.name || itemId, quantity: 0, gain: 0 };
    const unitGain = Math.floor(Math.max(0, Number(item?.price || 0)) * 0.5);
    entry.quantity += 1;
    entry.gain += unitGain;
    estimatedGain += unitGain;
    grouped.set(itemId, entry);
  }
  const detail = [...grouped.values()]
    .map((entry) => `${entry.quantity} × ${entry.name} : ${formatNumber(entry.gain)} crédits`)
    .join("\n");
  showConfirm(
    "Vendre la sélection",
    `${detail}\n\nGain total : ${formatNumber(estimatedGain)} crédits`,
    () => {
      let sold = 0;
      let totalGain = 0;
      for (const itemId of selected) {
        const out = sellItem(itemId, 1);
        if (!out?.ok) continue;
        sold += 1;
        totalGain += Number(out.gain || 0);
      }
      user = getCurrentUserFull();
      clearFitSelection();
      showFitError(sold === selected.length ? "" : `${selected.length - sold} objet(s) n'ont pas pu être vendus`);
      renderSlots();
      renderInventoryPalette();
      renderStats(user);
      renderHangars(user);
      refreshShopIfVisible();
      if (sold) setMsg(`${sold} objet(s) vendu(s) (+${formatNumber(totalGain)} crédits)`, true);
    }
  );
}

// -------------------- Inventory Palette --------------------
// Rareté affichée dans le hangar : même règle que l'onglet Inventaire
// (mapping explicite, sinon barème prix) pour que les couleurs correspondent.
function fitItemRarity(itemId, catalogItem = null) {
  const cat = catalogItem || findCatalogItem(itemId);
  if (cat) return ITEM_RARITIES[rarityForCatalogItem(cat)] || ITEM_RARITIES.common;
  return getItemRarity(itemId);
}

function renderInventoryPalette() {
  const grid = document.getElementById("fitInvGrid");
  const sel = document.getElementById("fitInvFilter");
  const clearBtn = document.getElementById("fitBtnClearSel");
  const sellBtn = document.getElementById("fitBtnSell");
  const countEl = document.getElementById("fitSelectionCount");
  const equipBtn = document.getElementById("fitBtnEquipSelection");
  const clearSelectionBtn = document.getElementById("fitBtnClearSelection");
  const sellSelectionBtn = document.getElementById("fitBtnSellSelection");
  if (!grid) return;

  if (clearBtn) {
    clearBtn.onclick = () => {
      clearFitSelection();
      showFitError("");
      renderInventoryPalette();
    };
  }

  const filter = String(sel?.value || "all");
  grid.innerHTML = "";

  fitState.used = computeUsage(fitState.draft);

  if (sellBtn) {
    // Legacy button kept for compatibility with older layouts.
    const id = [...fitState.selectedCopies.values()].at(-1) || fitState.selectedItemId;
    const owned = id ? ownedCount(user, id) : 0;
    const used = id ? Number(fitState.used?.[id] || 0) : 0;
    sellBtn.disabled = !id || owned <= used;
  }

  const selectedCount = fitState.selectedCopies.size;
  const moduleSelected = isRouletteModuleId(fitState.selectedItemId);
  const hasSelection = selectedCount > 0 || moduleSelected;
  if (countEl) {
    const parts = [];
    if (selectedCount) parts.push(`${selectedCount} sélectionné${selectedCount > 1 ? "s" : ""}`);
    if (moduleSelected) parts.push("1 module");
    countEl.textContent = parts.length ? parts.join(" + ") : "Aucune sélection";
  }
  if (equipBtn) {
    equipBtn.disabled = !hasSelection;
    equipBtn.onclick = () => equipSelectedInventoryItems();
  }
  if (clearSelectionBtn) {
    clearSelectionBtn.disabled = !hasSelection;
    clearSelectionBtn.onclick = () => {
      clearFitSelection();
      renderInventoryPalette();
    };
  }
  if (sellSelectionBtn) {
    sellSelectionBtn.disabled = selectedCount === 0;
    sellSelectionBtn.onclick = sellSelectedInventoryItems;
  }

  const counts = user?.inventory?.counts || {};
  const isPetSection = fitState.section === "pet";
  const isDroneSection = fitState.section === "drones";
  const entries = Object.entries(counts)
    .map(([itemId, cnt]) => ({ itemId, cnt: Number(cnt || 0), it: findCatalogItem(itemId) }))
    .filter((x) => x.cnt > 0 && (x.it?.module || x.it?.petGear || x.it?.petProtocol))
    .filter((x) => x.it?.module?.type !== "ammo")
    .filter((x) => {
      // P.E.T uniquement : affiché seulement quand on équipe le P.E.T.
      if (isPetOnlyItem(x.it)) return isPetSection;
      if (isDroneSection) return ["laser", "shield"].includes(x.it?.module?.type);
      if (isPetSection) {
        return ["laser", "shield"].includes(x.it?.module?.type) || x.it?.petGear || x.it?.petProtocol;
      }
      return true;
    });

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
      cell.dataset.copyKey = copyKey;
      cell.dataset.itemId = e.itemId;
      cell.className =
        "invCell" +
        (fitState.selectedCopies.has(copyKey) ? " selected" : "") +
        (!isAvailableCopy ? " disabled" : "");
      const rarity = fitItemRarity(e.itemId, e.it);
      cell.classList.add(`rarity-${rarity.id}`);

      const img = document.createElement("img");
      img.src = iconForItem(e.it, e.it?.module?.type);
      img.alt = e.it?.name || e.itemId;
      img.onerror = () => {
        img.onerror = null;
        img.src = FALLBACK_ICON;
      };
      cell.appendChild(img);

      if (isPetOnlyItem(e.it)) {
        const badge = document.createElement("span");
        badge.className = "petOnlyBadge";
        badge.textContent = "P.E.T";
        cell.appendChild(badge);
      }

      cell.title = `${e.it?.name || e.itemId} · ${rarity.name} (${i + 1}/${e.cnt})${isPetOnlyItem(e.it) ? " · P.E.T uniquement" : ""}`;

      cell.addEventListener("click", (event) => {
        if (!isAvailableCopy) {
          showFitError("Plus de stock disponible (dés-équipe d'abord)");
          return;
        }
        // Exclusif : sélectionner un item désélectionne le module roulette.
        if (event.shiftKey) {
          const copiesOfType = [...fitState.selectedCopies.values()].filter((id) => id === e.itemId).length;
          const alreadyFullySelected = fitState.selectedCopies.size > 0 && copiesOfType === fitState.selectedCopies.size;
          clearFitSelection();
          if (!alreadyFullySelected) {
            fitState.selectedSlots.clear();
            grid.querySelectorAll(".invCell:not(.disabled)").forEach((candidate) => {
              if (candidate.dataset.itemId === e.itemId) {
                fitState.selectedCopies.set(candidate.dataset.copyKey, candidate.dataset.itemId);
              }
            });
          }
        } else if (event.ctrlKey || event.metaKey) {
          // Exclusif : le module est toujours désélectionné, les copies se togglent.
          if (isRouletteModuleId(fitState.selectedItemId)) fitState.selectedItemId = null;
          fitState.selectedSlots.clear();
          if (fitState.selectedCopies.has(copyKey)) fitState.selectedCopies.delete(copyKey);
          else fitState.selectedCopies.set(copyKey, e.itemId);
        } else {
          const deselectOnly = fitState.selectedCopies.size === 1 && fitState.selectedCopies.has(copyKey);
          clearFitSelection();
          if (!deselectOnly) fitState.selectedCopies.set(copyKey, e.itemId);
        }
        const last = [...fitState.selectedCopies.entries()].at(-1);
        fitState.selectedItemId = last?.[1] || null;
        fitState.selectedCopyKey = last?.[0] || null;
        showFitError("");
        renderSlots();
        renderInventoryPalette();
        renderShipModulesList();
      });

      cell.addEventListener("dblclick", (event) => {
        event.preventDefault();
        if (!isAvailableCopy) return;
        if (!fitState.selectedCopies.has(copyKey)) fitState.selectedCopies.set(copyKey, e.itemId);
        equipSelectedInventoryItems();
      });

      cell.draggable = isAvailableCopy;
      cell.addEventListener("dragstart", (ev) => {
        if (!isAvailableCopy) return ev.preventDefault();
        if (!fitState.selectedCopies.has(copyKey)) {
          clearFitSelection();
          fitState.selectedCopies.set(copyKey, e.itemId);
        }
        ev.dataTransfer.setData("text/plain", e.itemId);
        ev.dataTransfer.setData("application/x-orbit-items", JSON.stringify(selectedInventoryItemIds()));
        ev.dataTransfer.effectAllowed = "copy";
        fitState.draggedItemIds = selectedInventoryItemIds();

        fitState.selectedItemId = e.itemId;
        fitState.selectedCopyKey = copyKey;
        updateFitDropHighlights();
      });
      cell.addEventListener("dragend", () => {
        fitState.draggedItemIds = [];
        clearFitDropHighlights();
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
    const rarity = fitItemRarity(itemId);
    d.classList.add(`rarity-${rarity.id}`);
    d.title = `${label || itemId} · ${rarity.name}`;
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

  compactCurrentFit();
  const draft = fitState.draft;
  fitState.used = computeUsage(draft);
  refreshReturnSelectionButton();

  const attachSlotDrag = (cell, slotType, idx, itemId) => {
    if (!itemId) return;
    const slotKey = `${slotType}#${idx}`;
    cell.classList.toggle("selected", fitState.selectedSlots.has(slotKey));
    cell.addEventListener("click", (event) => {
      if (event.shiftKey) {
        const matched = [...fitState.selectedSlots.values()].filter((id) => id === itemId).length;
        const alreadyFullySelected = fitState.selectedSlots.size > 0 && matched === fitState.selectedSlots.size;
        clearFitSelection();
        if (!alreadyFullySelected) {
          for (const currentType of ["lasers", "gens", "extras", "shipMods"]) {
            fitState.draft[currentType].forEach((currentItemId, currentIndex) => {
              if (currentItemId === itemId) fitState.selectedSlots.set(`${currentType}#${currentIndex}`, currentItemId);
            });
          }
        }
      } else if (event.ctrlKey || event.metaKey) {
        fitState.selectedCopies.clear();
        if (fitState.selectedSlots.has(slotKey)) fitState.selectedSlots.delete(slotKey);
        else fitState.selectedSlots.set(slotKey, itemId);
      } else {
        const deselectOnly = fitState.selectedSlots.size === 1 && fitState.selectedSlots.has(slotKey);
        clearFitSelection();
        if (!deselectOnly) fitState.selectedSlots.set(slotKey, itemId);
      }
      showFitError("");
      renderSlots();
      renderInventoryPalette();
    });
    cell.draggable = !shipEditLocked();
    cell.addEventListener("dragstart", (event) => {
      // Vaisseau intouchable hors base : pas de drag depuis ses slots.
      if (shipEditLocked()) {
        event.preventDefault();
        showFitError("Hors base : le vaisseau ne peut pas être modifié.");
        return;
      }
      if (!fitState.selectedSlots.has(slotKey)) {
        clearFitSelection();
        fitState.selectedSlots.set(slotKey, itemId);
      }
      const selectedSources = [...fitState.selectedSlots.keys()].map((key) => {
        const [selectedType, rawIndex] = key.split("#");
        return { slotType: selectedType, index: Number(rawIndex) };
      });
      event.dataTransfer.setData("text/plain", itemId);
      event.dataTransfer.setData("application/x-orbit-slot", JSON.stringify({ slotType, index: idx }));
      event.dataTransfer.setData("application/x-orbit-slots", JSON.stringify(selectedSources));
      event.dataTransfer.effectAllowed = "move";
      fitState.draggedItemIds = [itemId];
      cell.classList.add("dragging");
      updateFitDropHighlights();
    });
    cell.addEventListener("dragend", () => {
      cell.classList.remove("dragging");
      fitState.draggedItemIds = [];
      clearFitDropHighlights();
    });
  };

  const attachDrop = (cell, slotType, idx) => {
    cell.addEventListener("dragover", (ev) => {
      ev.preventDefault();
      ev.dataTransfer.dropEffect = "copy";
      const ids = Array.isArray(fitState.draggedItemIds) ? fitState.draggedItemIds : [];
      if (ids.length && !ids.some((id) => isItemAllowedInSlot(slotType, id))) return;
      cell.classList.add("dragTarget");
    });

    cell.addEventListener("dragleave", () => cell.classList.remove("dragTarget"));

    cell.addEventListener("drop", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      // Vaisseau intouchable hors base (ni ajout ni retrait).
      if (shipEditLocked()) return showFitError("Hors base : le vaisseau ne peut pas être modifié.");
      const itemId = ev.dataTransfer.getData("text/plain");
      if (!itemId) return;

      if (!isItemAllowedInSlot(slotType, itemId)) {
        showFitError("Ce module ne va pas dans ce type de slot");
        return;
      }

      let source = null;
      try {
        const rawSource = ev.dataTransfer.getData("application/x-orbit-slot");
        if (rawSource) source = JSON.parse(rawSource);
      } catch {}

      if (!source) {
        let draggedItems = [];
        try { draggedItems = JSON.parse(ev.dataTransfer.getData("application/x-orbit-items") || "[]"); } catch {}
        if (!draggedItems.length) draggedItems = [itemId];
        clearFitSelection();
        draggedItems.forEach((id, selectionIndex) => fitState.selectedCopies.set(`drag#${selectionIndex}`, id));
        equipSelectedInventoryItems(slotType);
        return;
      }

      if (source && Array.isArray(draft[source.slotType])) draft[source.slotType][source.index] = null;
      const result = appendToFitSlots(draft[slotType], [itemId], fitState.slots[slotType]);
      draft[slotType] = result.values;
      compactCurrentFit();
      clearFitSelection();
      fitState.draggedItemIds = [];
      clearFitDropHighlights();
      showFitError("");
      renderSlots();
      renderInventoryPalette();
    });

    cell.addEventListener("orbitDisabledSlotClick", () => {
      // Vaisseau intouchable hors base (ni ajout ni retrait).
      if (shipEditLocked()) return showFitError("Hors base : le vaisseau ne peut pas être modifié.");
      if (draft[slotType][idx]) {
        draft[slotType][idx] = null;
        compactCurrentFit();
        showFitError("");
        renderSlots();
        renderInventoryPalette();
        return;
      }
      equipSelectedInventoryItems(slotType);
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
    attachSlotDrag(cell, slotType, i, id);
    attachDrop(cell, slotType, i);
    lasersRoot.appendChild(cell);
  }

  for (let i = 0; i < G; i++) {
    const slotType = "gens";
    const id = draft.gens[i];
    const label = id ? findCatalogItem(id)?.name || id : "—";
    const cell = slotCell(label, !!id, id);
    attachSlotDrag(cell, slotType, i, id);
    attachDrop(cell, slotType, i);
    gensRoot.appendChild(cell);
  }

  for (let i = 0; i < E; i++) {
    const slotType = "extras";
    const id = draft.extras[i];
    const label = id ? findCatalogItem(id)?.name || id : "—";
    const cell = slotCell(label, !!id, id);
    attachSlotDrag(cell, slotType, i, id);
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
      const details = document.createElement("div");
      details.className = "shipModSlotDetails";
      const bonusText = (mod?.bonuses || []).map((bonus) => `${bonus.pct}% ${formatStatLabel(bonus.stat)}`).join(" · ");
      details.innerHTML = `<b>${mod ? `${String(mod.type || "").toUpperCase()}-${String(mod.tier || "").toUpperCase()}` : id}</b><span>${bonusText || "Module spécial"}</span>`;
      cell.appendChild(details);
      cell.classList.add("filled");
      cell.classList.add("shipModSlot");
      cell.title = label;
    }

    attachSlotDrag(cell, slotType, i, id);

    cell.addEventListener("orbitDisabledSlotClick", () => {
      // Vaisseau intouchable hors base (ni ajout ni retrait).
      if (shipEditLocked()) return showFitError("Hors base : le vaisseau ne peut pas être modifié.");
      if (!fitState.selectedItemId && draft.shipMods[i]) {
        draft.shipMods[i] = null;
        compactCurrentFit();
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
      // Vaisseau intouchable hors base (ni ajout ni retrait).
      if (shipEditLocked()) return showFitError("Hors base : le vaisseau ne peut pas être modifié.");
      if (cur === selItem) {
        draft.shipMods[i] = null;
        compactCurrentFit();
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
        showFitError(`1 seul module ${selModule.type.toUpperCase()} par vaisseau (officiel) — clique sur son slot pour le retirer, ou glisse le nouveau sur ce slot pour le remplacer`);
        return;
      }

      const used = computeUsage(tmp)[selItem] || 0;
      if (used >= 1) {
        showFitError("Module déjà utilisé");
        return;
      }

      // Placement ciblé : on remplace le contenu du slot cliqué (pas d'ajout en 1er libre).
      draft.shipMods[i] = selItem;
      compactCurrentFit();
      clearFitSelection();
      showFitError("");
      renderSlots();
      renderInventoryPalette();
      renderShipModulesList();
    });

    cell.addEventListener("dragover", (ev) => {
      ev.preventDefault();
      ev.dataTransfer.dropEffect = "copy";
      const ids = Array.isArray(fitState.draggedItemIds) ? fitState.draggedItemIds : [];
      if (ids.length && !ids.some((id) => isItemAllowedInSlot("shipMods", id))) return;
      cell.classList.add("dragTarget");
    });

    cell.addEventListener("dragleave", () => cell.classList.remove("dragTarget"));

    cell.addEventListener("drop", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      // Vaisseau intouchable hors base (ni ajout ni retrait).
      if (shipEditLocked()) return showFitError("Hors base : le vaisseau ne peut pas être modifié.");
      const moduleId = ev.dataTransfer.getData("text/plain");
      if (!moduleId) return;

      if (!isItemAllowedInSlot("shipMods", moduleId)) {
        showFitError("Ce module ne va pas dans ce slot");
        return;
      }

      let source = null;
      try {
        const rawSource = ev.dataTransfer.getData("application/x-orbit-slot");
        if (rawSource) source = JSON.parse(rawSource);
      } catch {}

      const tmp = structuredClone(draft);
      if (source && Array.isArray(tmp[source.slotType])) tmp[source.slotType][source.index] = null;
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
        showFitError(`1 seul module ${selModule.type.toUpperCase()} par vaisseau (officiel) — dépose le nouveau sur le slot ${selModule.type.toUpperCase()} occupé pour le remplacer`);
        return;
      }

      const used = computeUsage(tmp)[moduleId] || 0;
      if (used >= 1) {
        showFitError("Module déjà utilisé");
        return;
      }

      // Placement ciblé : remplacement du slot visé (avec échange si déplacement interne).
      if (source && source.slotType === "shipMods" && Number.isInteger(source.index) && Array.isArray(draft[source.slotType])) {
        const displaced = draft.shipMods[i] || null;
        draft[source.slotType][source.index] = displaced;
        draft.shipMods[i] = moduleId;
      } else {
        if (source && Array.isArray(draft[source.slotType])) draft[source.slotType][source.index] = null;
        draft.shipMods[i] = moduleId;
      }
      compactCurrentFit();
      clearFitSelection();
      fitState.draggedItemIds = [];
      clearFitDropHighlights();
      showFitError("");
      renderSlots();
      renderInventoryPalette();
      renderShipModulesList();
    });

    shipModsRoot.appendChild(cell);
  }
  refreshFitApplyButton();
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
  const shipFamily = getShipFamilyId(h.shipId);
  const list = all.filter(m => moduleFamilyId(m) === shipFamily);

  if (!list.length) {
    root.innerHTML = `<div style="color:var(--fit-muted);font-size:12px;text-align:center;padding:10px;">Aucun module pour ${getShipFamilyName(shipFamily)}</div>`;
    return;
  }

  root.innerHTML = list.slice().reverse().map((m) => {
    const icon = MODULE_ICONS[m.iconKey] || FALLBACK_ICON;
    const equipped = fitState.draft?.shipMods?.includes(m.id);
    const selected = fitState.selectedItemId === m.id && !equipped;
    const rarityMeta = moduleRarityMeta(m);
    const bonus = (m.bonuses || [])
      .map(b => {
        const color = Number(b.pct) < 0 ? "#ff5566" : "#00d9ff";
        return `<strong style="color:${color};">${b.pct}%</strong> ${formatStatLabel(b.stat)}`;
      })
      .join(" • ");
    const label = `${String(m.type || "").toUpperCase()}-${String(m.tier || "").toUpperCase()} · ${rarityMeta.name}${equipped ? " · ÉQUIPÉ" : ""}`;

    return `
      <div class="shipModRow rarity-${rarityMeta.id}${equipped ? " equipped" : ""}${selected ? " selected" : ""}" data-modid="${m.id}" data-equipped="${equipped ? "1" : "0"}" tabindex="0" role="button" aria-pressed="${selected ? "true" : "false"}" title="${escapeHtml(label)}">
        <img src="${icon}" alt="${escapeHtml(label)}" draggable="false" onerror="this.onerror=null;this.src='${FALLBACK_ICON}'" />
        <div style="min-width:0;">
          <div style="font-weight:900; color:#00d9ff;">
            ${String(m.type || "").toUpperCase()}-${String(m.tier || "").toUpperCase()}
            <span style="margin-left:6px;font-size:11px;color:${rarityMeta.color};">${rarityMeta.name}</span>
          </div>
          <div style="font-size:12px; color:var(--fit-muted); word-break:break-word;">
            ${bonus}
            <div style="opacity:.55;">${escapeHtml(getShipFamilyName(moduleFamilyId(m)))}</div>
          </div>
        </div>
        ${equipped ? '<span class="shipModEquippedBadge">ÉQUIPÉ</span>' : ""}
      </div>
    `;
  }).join("");

  root.querySelectorAll(".shipModRow").forEach((row) => {
    row.draggable = row.dataset.equipped !== "1";
    row.addEventListener("dragstart", (ev) => {
      if (row.dataset.equipped === "1") return ev.preventDefault();
      ev.dataTransfer.setData("text/plain", row.dataset.modid);
      ev.dataTransfer.setData("application/x-orbit-items", JSON.stringify([row.dataset.modid]));
      ev.dataTransfer.effectAllowed = "copy";
      fitState.draggedItemIds = [row.dataset.modid];
      updateFitDropHighlights();
    });
    row.addEventListener("dragend", () => {
      fitState.draggedItemIds = [];
      clearFitDropHighlights();
    });
    row.addEventListener("click", () => {
      if (row.dataset.equipped === "1") {
        showFitError("Module déjà équipé");
        return;
      }
      const id = row.dataset.modid;
      // Exclusif : sélectionner un module désélectionne l'inventaire.
      const deselectOnly = fitState.selectedItemId === id;
      clearFitSelection();
      if (!deselectOnly) fitState.selectedItemId = id;
      showFitError("");
      renderShipModulesList();
      renderInventoryPalette();
      renderSlots();
    });
    row.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        row.click();
      }
    });
    row.addEventListener("dblclick", (ev) => {
      ev.preventDefault();
      if (row.dataset.equipped === "1") return;
      clearFitSelection();
      fitState.selectedItemId = row.dataset.modid;
      equipSelectedInventoryItems("shipMods");
      renderShipModulesList();
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
  const nextConfig = Number(configNo) === 2 ? 2 : 1;
  if (nextConfig === fitState.configNo) return;

  // Brouillon uniquement : on met de côté les brouillons de la config actuelle,
  // sans rien persister. Le hangar ne change jamais la config en jeu.
  // Seuls les boutons 1/2 en jeu (fenêtre vie/bouclier, touche C) appellent setActiveHangarConfig.
  fitState.stash ??= {};
  fitState.stash[fitState.configNo] = {
    draft: fitState.draft,
    droneDrafts: fitState.droneDrafts,
    petDraft: fitState.petDraft,
  };

  const h = (user?.hangars || []).find((x) => x?.id === fitState.hangarId);
  if (!h) return;

  fitState.configNo = nextConfig;
  const stashed = fitState.stash[nextConfig];
  if (stashed) {
    fitState.draft = stashed.draft;
    fitState.droneDrafts = stashed.droneDrafts;
    fitState.petDraft = stashed.petDraft;
  } else if (!initFitDrafts(fitState.hangarId, nextConfig)) {
    return;
  }

  fitState.slots = getShipSlots(h.shipId);
  compactCurrentFit();
  compactAllDroneDrafts();
  compactCurrentPetDraft();
  clearFitSelection();
  fitState.used = computeUsage(fitState.draft);

  showFitError("");

  const titleEl = document.getElementById("fitTitle");
  if (titleEl) {
    titleEl.textContent = `Équipement — ${h.shipId} — Config ${fitState.configNo}`;
  window.GameWindowManager?.setTitle(
    equipWindowId(),
    `Équipement — ${h.shipId} — Config ${fitState.configNo}`
  );
  }

  document.querySelectorAll(".fitCfgBtn").forEach((b) => {
    b.classList.toggle("active", Number(b.dataset.cfg) === fitState.configNo);
  });

  renderSlots();
  renderInventoryPalette();
  renderShipModulesList();
  if (fitState.section === "drones") renderDroneEquipment(user);
  if (fitState.section === "pet") renderPetEquipment(user);
}

function openFitModal(hangarId) {
  // Ouverture libre (même hors base) : tout est brouillon local, Appliquer exige la base.
  if (!document.getElementById("profileOverlay")) {
    return setMsg("Ouvre l'Espace pilote directement depuis le jeu pour effectuer cette action.", false);
  }
  if (!window.__ORBIT_ENGINE__?.getHangarAccess?.()) return setMsg("Le moteur du jeu n'est pas encore prêt.", false);
  hookFitDiscardOnMinimize();
  if (!fitOverlayEl) fitOverlayEl = buildFitWindow();

  user = getCurrentUserFull();
  if (!user) return (location.href = "./AUTH.html");

  const h = (user.hangars || []).find((x) => x?.id === hangarId);
  if (!h) return setMsg("Hangar introuvable", false);

  fitState.hangarId = hangarId;
  clearFitSelection();
  setFitSection("ship");

  fitState.configNo = Number(h.activeConfig) === 2 ? 2 : 1;
  fitState.stash = {};
  if (!initFitDrafts(hangarId, fitState.configNo)) return setMsg("Hangar introuvable", false);
  refreshFitApplyButton();

const titleEl = document.getElementById("fitTitle");
const subEl = document.getElementById("fitSub");
if (titleEl) titleEl.textContent = `Équipement — ${h.shipId} — Config ${fitState.configNo}`;
window.GameWindowManager?.setTitle(
  "profileWindow",
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
  b.onclick = () => setFitModalConfig(Number(b.dataset.cfg));
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

  document.querySelectorAll("#fitBtnResetAll").forEach((btn) => { btn.onclick = () => resetAllSlots(); });
  const btnReturnSelection = document.getElementById("fitBtnReturnSelection");
  if (btnReturnSelection) btnReturnSelection.onclick = returnSelectedEquippedItems;

  // VENDRE
  const btnSell = document.getElementById("fitBtnSell");
  if (btnSell) {
    btnSell.onclick = () => {
      const itemId = [...fitState.selectedCopies.values()].at(-1) || fitState.selectedItemId;
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

      clearFitSelection();

      user = getCurrentUserFull();
      setMsg(`Vendu (+${formatNumber(out.gain)} crédits)`, true);

      showFitError("");
      renderSlots();
      renderInventoryPalette();
      renderStats(user);
      renderHangars(user);
      refreshShopIfVisible();
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
      setMsg("Preset sauvegardé", true);
    };
  }

  const btnLoad = document.getElementById("fitBtnLoadPreset");
  if (btnLoad && selPreset) {
    btnLoad.onclick = () => {
      // Preset = modification du vaisseau : verrouillé hors base.
      if (shipEditLocked()) return showFitError("Hors base : le vaisseau ne peut pas être modifié.");
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
      compactCurrentFit();
      clearFitSelection();
      showFitError("");
      renderSlots();
      renderInventoryPalette();
      renderShipModulesList();
      if (presetOverlay) presetOverlay.style.display = "none";
      setMsg("Preset chargé", true);
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
      setMsg("Preset supprimé", true);
    };
  }

  document.getElementById("fitBtnCancel").onclick = () => closeFitModal();

  document.getElementById("fitBtnSave").onclick = () => {
    saveGameBeforeProfileAction();
    user = getCurrentUserFull();
    if (!user) return showFitError("Non connecté.");
    compactCurrentFit();
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

    // Appliquer = la seule référence : vérification en direct, grisé hors base.
    const access = getHangarActionAccess("equip");
    refreshFitApplyButton();
    if (!access.ok) {
      showFitError(access.error);
      return;
    }

    // Vaisseau + drones + REX de la config affichée, en un seul passage.
    const out = saveHangarLoadout(fitState.hangarId, {
      ship: fitState.draft,
      drones: fitState.droneDrafts || {},
      pet: user?.pet?.owned === true ? fitState.petDraft : null,
    }, fitState.configNo);
    if (!out.ok) {
      showFitError(out.error || "Sauvegarde impossible");
      return;
    }

    user = getCurrentUserFull();
    // La config appliquée devient le brouillon de référence (retours 1/2 cohérents).
    if (fitState.stash) delete fitState.stash[fitState.configNo];
    const activeHangar = user.hangars.find(h => h.active);
    const appliedLive = activeHangar?.id === fitState.hangarId && Number(activeHangar.activeConfig) === fitState.configNo;
    setMsg(appliedLive
      ? `Configuration ${fitState.configNo} appliquée en jeu.`
      : `Configuration ${fitState.configNo} enregistrée. En jeu : configuration ${activeHangar?.activeConfig || 1}.`, true);

    closeFitModal();

    renderHeader(user);
    renderStats(user);
    renderHangars(user);
    refreshShopIfVisible();
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
  window.GameWindowManager?.setTitle(equipWindowId(), equipWindowHomeTitle());

  fitState.hangarId = null;
  fitState.configNo = 1;
  clearFitSelection();
  fitState.draft = null;
  // Fermer = tout annuler : les brouillons sont jetés, rien n'est persisté.
  fitState.droneDrafts = null;
  fitState.petDraft = null;
  fitState.stash = null;
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
const AUTH_URL = location.pathname.includes("/PUBLIC/")
  ? "./AUTH.html"
  : "./PUBLIC/AUTH.html";

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
  setTab(tab);
  if (profileIsVisible()) renderActiveProfilePanel();
}

function closeProfileOverlay({ immediate = false } = {}) {
  // Baisser la fenêtre = annuler : les brouillons d'équipement sont jetés
  // (standalone uniquement — en jeu c'est la fenêtre Hangars qui s'en charge).
  if (!document.getElementById("hangarWindowPanel")) closeFitModal();
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
    title: "Espace pilote",
    icon: `<img class="menuIconImg" src="/ASSETS/UI/MENU/user.png" alt="" draggable="false">`,
    root,
    card,
    defaultOpen: false,
  });
  hookFitDiscardOnMinimize();
}

function openShopOverlay() {
  saveGameBeforeProfileAction();

  user = getCurrentUserFull();

  if (!user) {
    location.href = AUTH_URL;
    return;
  }

  const overlay = document.getElementById("shopOverlay");
  if (window.GameWindowManager) window.GameWindowManager.restore("shopWindow");
  else if (overlay) overlay.style.display = "block";

  // Ouverture boutique : toujours l'onglet Munitions lasers par défaut.
  shopTab = "ammo";
  try { localStorage.setItem("orbit_shop_tab", shopTab); } catch {}
  selectedShopItemId = null;
  document.querySelectorAll("#shopWindowTabs .tabBtn").forEach((button) => {
    button.classList.toggle("active", button.dataset.shop === shopTab);
  });
  if (shopIsVisible()) renderShop(user);
}

function closeShopOverlay({ immediate = false } = {}) {
  const overlay = document.getElementById("shopOverlay");
  if (window.GameWindowManager && !immediate) window.GameWindowManager.minimize("shopWindow");
  else if (overlay) overlay.style.display = "none";
}

function registerShopWindow() {
  const root = document.getElementById("shopOverlay");
  const card = document.getElementById("shopWindow");
  if (!root || !card || !window.GameWindowManager) return;
  window.GameWindowManager.register({
    id: "shopWindow",
    title: "Boutique",
    icon: `<img class="menuIconImg" src="/ASSETS/UI/MENU/shop.png" alt="" draggable="false">`,
    root,
    card,
    defaultOpen: false,
  });
}

function hangarIsVisible() {
  const overlay = document.getElementById("hangarOverlay");
  return !!overlay && overlay.style.display !== "none" && !overlay.hidden
    && !overlay.classList.contains("gameWinMinimized");
}

// Id de la fenêtre qui porte l'équipement : la fenêtre Hangars en jeu,
// l'Espace pilote sur la page standalone.
function equipWindowId() {
  return document.getElementById("hangarWindowPanel") ? "hangarWindow" : "profileWindow";
}

function equipWindowHomeTitle() {
  return document.getElementById("hangarWindowPanel") ? "Hangars & Équipement" : "Espace pilote";
}

function openHangarOverlay() {
  saveGameBeforeProfileAction();

  user = getCurrentUserFull();

  if (!user) {
    location.href = AUTH_URL;
    return;
  }

  const overlay = document.getElementById("hangarOverlay");
  if (window.GameWindowManager) window.GameWindowManager.restore("hangarWindow");
  else if (overlay) overlay.style.display = "block";

  document.querySelectorAll("#hangarWindowTabs .tabBtn").forEach((button) => {
    button.classList.toggle("active", button.dataset.hangartab === "hangars");
  });
  if (hangarIsVisible()) renderHangars(user);
}

function closeHangarOverlay({ immediate = false } = {}) {
  // Baisser la fenêtre = annuler : les brouillons d'équipement sont jetés.
  closeFitModal();
  const overlay = document.getElementById("hangarOverlay");
  if (window.GameWindowManager && !immediate) window.GameWindowManager.minimize("hangarWindow");
  else if (overlay) overlay.style.display = "none";
}

function registerHangarWindow() {
  const root = document.getElementById("hangarOverlay");
  const card = document.getElementById("hangarWindow");
  if (!root || !card || !window.GameWindowManager) return;
  window.GameWindowManager.register({
    id: "hangarWindow",
    title: "Hangars & Équipement",
    icon: `<img class="menuIconImg" src="/ASSETS/UI/MENU/hangar.png" alt="" draggable="false">`,
    root,
    card,
    defaultOpen: false,
  });
  hookFitDiscardOnMinimize();
}

function wireHangarTabsOnce() {
  const root = document.getElementById("hangarWindowTabs");
  if (!root || root.__hangarTabsWired) return;
  root.__hangarTabsWired = true;
  root.querySelectorAll(".tabBtn").forEach((button) => {
    button.addEventListener("click", () => {
      if (button.dataset.hangartab === "equipment") {
        const hangars = Array.isArray(user?.hangars) ? user.hangars : [];
        const active = hangars.find((h) => h?.active) || hangars[0];
        const targetId = selectedHangarId || active?.id;
        if (!targetId) return setMsg("Aucun hangar à équiper.", false);
        // L'onglet Équipement est une action : HANGARS reste surligné.
        openFitModal(targetId);
        return;
      }
      root.querySelectorAll(".tabBtn").forEach((b) =>
        b.classList.toggle("active", b === button));
      if (user) renderHangars(user);
    });
  });
}

// Le bouton réduire du window manager contourne closeProfileOverlay :
// baisser la fenêtre = annuler les brouillons d'équipement (rien n'est appliqué).
function hookFitDiscardOnMinimize() {
  const manager = window.GameWindowManager;
  if (!manager || manager.__fitDiscardHooked) return;
  manager.__fitDiscardHooked = true;
  const baseMinimize = manager.minimize.bind(manager);
  manager.minimize = (id, ...rest) => {
    if (String(id) === "hangarWindow") {
      try { closeFitModal(); } catch {}
    } else if (String(id) === "profileWindow" && !document.getElementById("hangarWindowPanel")) {
      try { closeFitModal(); } catch {}
    }
    return baseMinimize(id, ...rest);
  };
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
  setTab(tab);
  if (profileIsVisible()) renderActiveProfilePanel();

}

// -------------------- Buttons --------------------
document.getElementById("btnGameHub")?.addEventListener("click", () => {
  if (window.GameWindowManager?.isOpen("profileWindow")) window.GameWindowManager.minimize("profileWindow");
  else openProfileOverlay();
});

document.getElementById("btnShopHub")?.addEventListener("click", () => {
  if (window.GameWindowManager?.isOpen("shopWindow")) window.GameWindowManager.minimize("shopWindow");
  else openShopOverlay();
});

document.getElementById("btnHangarHub")?.addEventListener("click", () => {
  if (window.GameWindowManager?.isOpen("hangarWindow")) window.GameWindowManager.minimize("hangarWindow");
  else openHangarOverlay();
});

btnLogout?.addEventListener("click", () => {
  logout();
  location.href = AUTH_URL;
});

btnSessionMenu?.addEventListener("click", (event) => {
  event.stopPropagation();
  const open = !sessionMenu?.classList.contains("open");
  sessionMenu?.classList.toggle("open", open);
  btnSessionMenu.setAttribute("aria-expanded", String(open));
});

document.addEventListener("click", (event) => {
  if (event.target.closest(".sessionDockMenu")) return;
  sessionMenu?.classList.remove("open");
  btnSessionMenu?.setAttribute("aria-expanded", "false");
});

btnRestartGame?.addEventListener("click", async () => {
  try {
    if (window.caches) {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    }
    document.cookie.split(";").forEach((cookie) => {
      const name = cookie.split("=")[0]?.trim();
      if (name) document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
    });
    sessionStorage.removeItem("orbit_assets_preloaded_v1");
  } catch (error) {
    console.warn("Redémarrage avec nettoyage partiel", error);
  }
  location.reload();
});

btnStart?.addEventListener("click", () => {
  closeProfileOverlay();
});

window.HyperionProfile = {
  open: openProfileOverlay,
  close: closeProfileOverlay,
  openShop: openShopOverlay,
  closeShop: closeShopOverlay,
  openHangar: openHangarOverlay,
  closeHangar: closeHangarOverlay,
};
compactCurrentFit();

// One refresh per mutation, and only for the visible panel.
let accountRefreshFrame = 0;
function profileIsVisible() {
  const overlay = document.getElementById("profileOverlay");
  return !!overlay && overlay.style.display !== "none" && !overlay.hidden
    && !overlay.classList.contains("gameWinMinimized");
}

function renderActiveProfilePanel({ mutation = false } = {}) {
  if (!user) return;
  if (tab === "stats") renderStats(user);
  if (tab === "account") renderAccount(user);
  if (tab === "npcs") renderNpcStats(user);
  if (tab === "hangars" && !document.getElementById("hangarWindowPanel")) renderHangars(user);
  if (tab === "inventory") renderInventory(user);
  // Page standalone (PROFILE.html) : la boutique reste un onglet du profil.
  // En jeu, la boutique a sa propre fenêtre et ne passe plus par ici.
  if (tab === "shop" && !document.getElementById("shopWindowPanel") && !(mutation && shopTab === "extras")) renderShop(user);
}

window.addEventListener("orbit:user-updated", () => {
  if ((!profileIsVisible() && !shopIsVisible() && !hangarIsVisible()) || accountRefreshFrame) return;
  accountRefreshFrame = requestAnimationFrame(() => {
    accountRefreshFrame = 0;
    user = getCurrentUserFull();
    if (!user) return;
    if (profileIsVisible()) {
      renderHeader(user);
      renderActiveProfilePanel({ mutation: true });
    }
    if (shopIsVisible() && shopTab !== "extras") renderShop(user);
    if (hangarIsVisible()) renderHangars(user);
    if (fitOverlayEl && fitOverlayEl.style.display !== "none" && fitState.hangarId) {
      renderDroneEquipment(user);
      renderInventoryPalette();
    }
  });
});

// Init
registerProfileWindow();
registerShopWindow();
registerHangarWindow();
wireMainTabsOnce();
wireShopTabsOnce();
wireHangarTabsOnce();
wireAccountSettingsOnce();
boot();
