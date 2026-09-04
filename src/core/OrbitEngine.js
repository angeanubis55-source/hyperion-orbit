"use strict";
import {
  getCurrentUserFull,
  updateCurrentUserProgress,
  getActiveHangarState,
  saveActiveHangarState,
  getActiveHangarId,
  getHangarStateById,
  saveHangarStateById,
  setActiveHangarConfig,
  consumeCurrentUserGalaxyGate,
  completeCurrentUserGalaxyGate,
  loseCurrentUserGalaxyGateLife,
  grantCurrentUserGalaxyEnergy,
  spinCurrentUserGalaxyGate,
  saveCurrentUserGalaxyGateWave,
  deployCurrentUserGalaxyGate,
  armCurrentUserGalaxyGateMultiplier,
  craftCurrentUserRecipe,
  setCurrentUserDroneFormation,
} from "./account.js";
import {
  GALAXY_GATE_BUILD_LIMIT,
  GALAXY_GATE_DEFINITIONS,
  GALAXY_SPIN_CREDIT_COST,
  normalizeGalaxyGateState,
} from "./galaxyGates.js";
import { computeHangarStats } from "./hangars.js";
import { findCatalogItem } from "./catalog.js";
import { CRAFTING_RECIPES } from "../data/crafting.js";
import { ITEM_RARITIES } from "../data/itemRarities.js";
import { SHIP_EFFECTS } from "../data/shipEffects.js";
import { GAME_VERSION } from "../data/version.js";
import { DRONE_FORMATIONS, DRONE_FORMATION_LAYOUTS, DRONE_TYPES, DRONE_XP_SHARE, getActiveDroneFormation, getDroneLevel, getDroneSpritePath } from "../data/drones.js";
import { clamp, circleRectResolve, dist2, movingCircleHit, segCircleHit } from "./collision.js";
import { createKeyboardState, createPointerState } from "./input.js";
import { bulletLifeForRange, damageEnemyLayers, damagePlayerLayers, drainShield } from "./combat.js";
import { createSpatialPairIndex, rebuildIdIndex } from "./spatialIndex.js";
import { drawCenteredImage, hpHueColor, isWorldPointVisible, screenToWorldPoint, worldToScreenPoint } from "./rendering.js";
import { createNpcEntity } from "./npcFactory.js";
import { addProjectile, advanceProjectile, removeProjectile } from "./projectiles.js";
import { createWaveSpawnState } from "./waves.js";
import { shouldShowNpcBars, updateProgressHud, updateResourceHud, updateWaveHud } from "./hud.js";
import { createPerformanceMonitor } from "./performanceMonitor.js";
import { computeNpcSteering, setNpcVelocity } from "./npcAI.js";
import { getNpcSensorRanges, shouldDetectNpc } from "./npcSensors.js";
import { shouldRunNpcFrame } from "./npcActivity.js";
import { pushBounded } from "./boundedCollection.js";
import { createRadiationSystem } from "./radiationSystem.js";
import {
  createGatePortalState,
  getGateReturnMap as resolveGateReturnMap,
  positionGateChoicePortals,
  resetGatePortalState,
} from "./gateSystem.js";
import {
  beginGatePortalJump,
  getPortalJumpFade as computePortalJumpFade,
  getPortalOpenFade as computePortalOpenFade,
  startPortalClosing,
  tickGatePortalJumps as advanceGatePortalJumps,
  tickPortalVisualTransitions,
  updatePortalProximity,
} from "./portalSystem.js";
import { buildQuestJournalView, buildQuestTerminalView } from "./questPresentation.js";
import { loadNpcLocationIndex } from "./questLocations.js";
import {
  drawMoveTargetMarker,
  drawNpcStatus,
  drawPlayerStatus,
  drawTargetLock,
  drawToastMessage,
} from "./canvasHudRenderer.js";
import { renderMinimap } from "./minimapRenderer.js";
import { drawBackgroundLayerSet, drawParallaxStarfield, drawWallLayer } from "./worldLayerRenderer.js";
import { advancePlayerToTarget, attractPickups, tickFloatingTexts, tickLifetimeItems, updatePlayerVelocity } from "./frameSystems.js";
import { calculateRankPoints, getLevelInfo, getNpcExperienceReward, getNpcHonorReward, getQuestExperienceReward, getQuestHonorReward, getRankInfo, grantExperience, grantHonor } from "./progression.js";
import { formatInteger } from "./numberFormat.js";
import { escapeHtml } from "./dom.js";
import { appendGameLog, readGameLogs } from "./gameLogStore.js";
import { getFaction, getFactionBaseSpawn, getFactionHomeMap, getFactionRespawnMap, resolveBaseCenter } from "./factions.js";
import {
  QUEST_DEFINITIONS,
  acceptQuest,
  abandonQuest,
  claimQuest,
  isQuestComplete,
  normalizeQuestState,
  recordQuestProgress,
} from "../data/quests.js";
import {
  COLLECTABLE_SPAWN as DEFAULT_COLLECTABLE_SPAWN,
  COLLECTABLE_TYPES as DEFAULT_COLLECTABLE_TYPES,
} from "../data/collectables.js";
import { getResourceName } from "../data/resources.js";

export function startOrbitGame(config) {

if (window.__ORBIT_ENGINE__?.switchMap) {
  const pending = window.__ORBIT_ENGINE__.switchMap(config, window.__PENDING_MAP_SWITCH__ || {});
  window.__ORBIT_SWITCH_PROMISE__ = pending;
  return pending;
}

let {
  WORLD,
  getWavePlan,
  DEFAULT_WAVE_TYPE,
  SHIP_PACKS,
  AMMO,
  PLAYER_BULLET_SPRITES,
  NPC_TYPES,
  LOCK_SPR,
  PORTAL_IDLE_SPR,
  PORTAL_OPEN_SPR,
  PORTAL_JUMP_SPR = null,
  REPAIR_ORBIT_SPR = null,
  createImageLoader,
  createSFX,

  COLLECTABLE_TYPES = DEFAULT_COLLECTABLE_TYPES,
  COLLECTABLE_SPAWN = DEFAULT_COLLECTABLE_SPAWN,

  rules = {},
} = config;

function getFactionFallbackSpawn() {
  return getFactionBaseSpawn((account.user || getCurrentUserFull())?.faction);
}

// ============================================================
// ✅ Radiation zone (hors limites WORLD)
// ============================================================
const radiationSystem = createRadiationSystem();
let radiationActive = false;

function playerIsOutsideWorld() {
  return (
    player.x < 0 ||
    player.x > WORLD.w ||
    player.y < 0 ||
    player.y > WORLD.h
  );
}

function applyRadiation(dt) {
  const dmg = radiationSystem.update(dt, {
    started,
    dead: player.dead,
    outside: playerIsOutsideWorld(),
    hpMax: player.hpMax,
  });
  radiationActive = radiationSystem.state.active;
  if (dmg <= 0) return;
  resetRepairCooldown();
  player.hp -= dmg;
  const shown = Math.max(1, Math.round(dmg));
  addPlayerCombatFloat(shown, "rgba(255,80,100,0.95)");

  if (player.hp <= 0) {
    player.hp = 0;
    die();
  }
}

function drawRadiationWarning() {
  if (player.dead) return;
  radiationSystem.draw(ctx, innerWidth, innerHeight, performance.now() / 1000);
}

// ✅ last death position (pour "réparer sur place")
let lastDeathPos = { x: 0, y: 0, map: null };

// ✅ respawn override via sessionStorage
function setRespawnOverride(data) {
  try { sessionStorage.setItem("respawnOverride", JSON.stringify(data)); } catch {}
}

function popRespawnOverride() {
  try {
    const raw = sessionStorage.getItem("respawnOverride");
    if (!raw) return null;
    sessionStorage.removeItem("respawnOverride");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function showRespawnOverlay(show) {
  if (!ui.respawnOverlay) return;
  ui.respawnOverlay.style.display = show ? "grid" : "none";
}

// ✅ Hangar verrouillé pour CET onglet
let SESSION_HANGAR_ID = null;

function lockSessionHangar() {
  const id = getActiveHangarId();
  SESSION_HANGAR_ID = id;
  return id;
}

// ✅ Background layers (2 couches superposées)
function createBackgroundLayers(world = WORLD, mapRules = rules) {
  return (
  world?.bgLayers ||
  mapRules?.bgLayers ||
  [
    { src: world?.bgSrc || mapRules?.bgSrc || null, mode: "tile", alpha: 0.85, parallax: 0.02 },
    { src: "./Backgrounds/stars_tile.webp", mode: "tile", alpha: 0.55, parallax: 0.08, blend: "lighter" },
  ]
).filter(x => x && x.src);
}
let BG_LAYERS = createBackgroundLayers();

// ============================================================
// Canvas
// ============================================================
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d", { alpha: false });

function resize() {
  const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  canvas.width = Math.floor(innerWidth * dpr);
  canvas.height = Math.floor(innerHeight * dpr);
  canvas.style.width = innerWidth + "px";
  canvas.style.height = innerHeight + "px";
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = false;
}
addEventListener("resize", resize);
resize();

// ============================================================
// DOM refs
// ============================================================
const ui = {
  waveTxt: document.getElementById("waveTxt"),
  spawnLeftTxt: document.getElementById("spawnLeftTxt"),
  aliveTxt: document.getElementById("aliveTxt"),
  credits: document.getElementById("credits"),
  kills: document.getElementById("kills"),
  dmgTxt: document.getElementById("dmgTxt"),
  rangeTxt: document.getElementById("rangeTxt"),
  spdTxt: document.getElementById("spdTxt"),
  hpTxt: document.getElementById("hpTxt"),
  shTxt: document.getElementById("shTxt"),
  hpBar: document.getElementById("hpBar"),
  shBar: document.getElementById("shBar"),
  gygerimStatus: document.getElementById("gygerimStatus"),
  bossStatusTitle: document.getElementById("bossStatusTitle"),
  gygerimHpBar: document.getElementById("gygerimHpBar"),
  gygerimShBar: document.getElementById("gygerimShBar"),
  gygerimHpTxt: document.getElementById("gygerimHpTxt"),
  gygerimShTxt: document.getElementById("gygerimShTxt"),

  respawnOverlay: document.getElementById("respawnOverlay"),
  respawnBaseBtn: document.getElementById("respawnBaseBtn"),
  respawnPortalBtn: document.getElementById("respawnPortalBtn"),
  respawnHereBtn: document.getElementById("respawnHereBtn"),

  pulsePct: document.getElementById("pulsePct"),
  pulsePrice: document.getElementById("pulsePrice"),

  fpsTxt: document.getElementById("fpsTxt"),
  versionTxt: document.getElementById("versionTxt"),

  boxWave: document.getElementById("boxWave"),
  boxMeta: document.getElementById("boxMeta"),
  boxVitals: document.getElementById("boxVitals"),
  questList: document.getElementById("questList"),
  questIntro: document.getElementById("questIntro"),
  questTabs: document.getElementById("questTabs"),
  questOfferDetail: document.getElementById("questOfferDetail"),
  questOfferList: document.getElementById("questOfferList"),
  galaxyGateWindow: document.getElementById("galaxyGateWindow"),
  ggEnergy: document.getElementById("ggEnergy"),
  ggCredits: document.getElementById("ggCredits"),
  ggTabs: document.getElementById("ggTabs"),
  ggParts: document.getElementById("ggParts"),
  ggPortalImage: document.getElementById("ggPortalImage"),
  ggRewards: document.getElementById("ggRewards"),
  ggMultiplier: document.getElementById("ggMultiplier"),
  ggMultiplierBtn: document.getElementById("ggMultiplierBtn"),
  ggBuilt: document.getElementById("ggBuilt"),
  ggCompleted: document.getElementById("ggCompleted"),
  ggLives: document.getElementById("ggLives"),
  ggWave: document.getElementById("ggWave"),
  ggCreditCost: document.getElementById("ggCreditCost"),
  ggResult: document.getElementById("ggResult"),
  ggHistory: document.getElementById("ggHistory"),
  ggSpinCount: document.getElementById("ggSpinCount"),
  ggSpinBtn: document.getElementById("ggSpinBtn"),
  ggNpcRewardScale: document.getElementById("ggNpcRewardScale"),
  ggDeployBtn: document.getElementById("ggDeployBtn"),
  orbitNotifications: document.getElementById("orbitNotifications"),
  gameLogEntries: document.getElementById("gameLogEntries"),
  gameLogWindow: document.getElementById("gameLogWindow"),
  questWindow: document.getElementById("questWindow"),
  escortWindowBody: document.getElementById("escortWindowBody"),
  craftingRecipes: document.getElementById("craftingRecipes"),
  craftingDetail: document.getElementById("craftingDetail"),
  craftingQuantity: document.getElementById("craftingQuantity"),
  craftingBuildBtn: document.getElementById("craftingBuildBtn"),
  craftingMessage: document.getElementById("craftingMessage"),
  craftingProgress: document.getElementById("craftingProgress"),
  craftingProgressBar: document.getElementById("craftingProgressBar"),
  craftingProgressPct: document.getElementById("craftingProgressPct"),
  gameLogSearch: document.getElementById("gameLogSearch"),
  gameLogPrevious: document.getElementById("gameLogPrevious"),
  gameLogNext: document.getElementById("gameLogNext"),
  gameLogPage: document.getElementById("gameLogPage"),

  honorTxt: document.getElementById("honorTxt"),
  xpTxt: document.getElementById("xpTxt"),
  rankPtsTxt: document.getElementById("rankPtsTxt"),

  lvlTxt: document.getElementById("lvlTxt"),
cfg1Btn: document.getElementById("cfg1Btn"),
cfg2Btn: document.getElementById("cfg2Btn"),
cfgCooldownTxt: document.getElementById("cfgCooldownTxt"),

  miniMapName: document.getElementById("miniMapName"),
  miniPos: document.getElementById("miniPos"),

  btnPulse: document.getElementById("btnPulse"),
  btnRepair: document.getElementById("btnRepair"),
  repairTxt: document.getElementById("repairTxt"),

  centerMsg: document.getElementById("centerMsg"),
  centerTitle: document.getElementById("centerTitle"),
  centerBody: document.getElementById("centerBody"),
  centerHint: document.getElementById("centerHint"),

  startHint: document.getElementById("startHint"),
  loadingOverlay: document.getElementById("loadingOverlay"),
  loadingStatus: document.getElementById("loadingStatus"),
  loadingBar: document.getElementById("loadingBar"),
  loadingCount: document.getElementById("loadingCount"),
  loadingPercent: document.getElementById("loadingPercent"),
  loadingStartBtn: document.getElementById("loadingStartBtn"),

  ammoShopBody: document.getElementById("ammoShopBody"),
  shopCredits: document.getElementById("ammoShopCredits"),

  btnX1: document.getElementById("btnX1"),
  btnX2: document.getElementById("btnX2"),
  btnX3: document.getElementById("btnX3"),
  btnX4: document.getElementById("btnX4"),
  btnSAB: document.getElementById("btnSAB"),
  btnX6: document.getElementById("btnX6"),

  cntX1: document.getElementById("cntX1"),
  cntX2: document.getElementById("cntX2"),
  cntX3: document.getElementById("cntX3"),
  cntX4: document.getElementById("cntX4"),
  cntSAB: document.getElementById("cntSAB"),
  cntX6: document.getElementById("cntX6"),

  portalOverlay: document.getElementById("portalOverlay"),
  portalTitle: document.getElementById("portalTitle"),
  portalSub: document.getElementById("portalSub"),
  nextWaveBtn: document.getElementById("nextWaveBtn"),
};

const ACTION_BAR_LAYOUT_KEY = "orbit_action_bar_layout_v2";

function initializeCustomActionBar() {
  const bar = document.getElementById("ammoBar");
  if (!bar || bar.dataset.customized === "1") return;
  bar.dataset.customized = "1";
  const actions = [...bar.querySelectorAll(":scope > .ammoBtn")];
  const palette = document.createElement("div");
  palette.className = "actionPalette";
  palette.hidden = true;
  palette.innerHTML = `<nav><button class="active" data-action-category="ammo">Munitions</button><button data-action-category="formations">Formations</button><button data-action-category="skills">Compétences</button></nav><div class="actionPaletteItems"></div>`;
  const toggle = document.createElement("button");
  toggle.type = "button"; toggle.className = "actionPaletteToggle"; toggle.textContent = "⌃"; toggle.title = "Configurer la barre rapide";
  const byId = new Map(actions.map((button) => {
    const id = button.dataset.ammo ? `ammo:${button.dataset.ammo}` : `skill:${button.dataset.skill}`;
    button.dataset.actionId = id;
    button.draggable = true;
    return [id, button];
  }));
  let saved = [];
  try { saved = JSON.parse(localStorage.getItem(ACTION_BAR_LAYOUT_KEY) || "[]"); } catch {}
  const layout = Array.from({ length: 20 }, (_, index) => saved[index] || null);
  const used = new Set(layout.filter(id => byId.has(id)));
  for (const id of byId.keys()) if (!used.has(id)) {
    const emptyIndex = layout.findIndex(value => !value);
    if (emptyIndex >= 0) layout[emptyIndex] = id;
  }
  bar.replaceChildren();
  const persist = () => localStorage.setItem(ACTION_BAR_LAYOUT_KEY, JSON.stringify(
    [...bar.querySelectorAll(".actionSlot")].map(slot => slot.querySelector(".ammoBtn")?.dataset.actionId || null)
  ));
  const slots = document.createElement("div"); slots.className = "actionSlots"; bar.appendChild(slots);
  layout.forEach((id, index) => {
    const slot = document.createElement("div");
    slot.className = "actionSlot";
    slot.dataset.index = String(index);
    if (byId.has(id)) {
      const original = byId.get(id);
      const instance = original.cloneNode(true);
      instance.removeAttribute("id");
      instance.dataset.actionId = id;
      instance.onclick = () => original.click();
      instance.addEventListener("dragstart", event => {
        if (palette.hidden) return event.preventDefault();
        event.dataTransfer.setData("application/x-orbit-action", id);
        event.dataTransfer.effectAllowed = "move";
      });
      slot.appendChild(instance);
    }
    slot.addEventListener("dragover", event => { event.preventDefault(); slot.classList.add("dragTarget"); });
    slot.addEventListener("dragleave", () => slot.classList.remove("dragTarget"));
    slot.addEventListener("drop", event => {
      event.preventDefault();
      slot.classList.remove("dragTarget");
      const actionId = event.dataTransfer.getData("application/x-orbit-action");
      const original = byId.get(actionId);
      if (!original || palette.hidden) return;
      const draggedElement = document.querySelector(`.actionSlot .ammoBtn[data-action-id="${CSS.escape(actionId)}"].isDragging`);
      const source = draggedElement?.closest(".actionSlot");
      const button = source ? draggedElement : original.cloneNode(true);
      if (!source) {
        button.removeAttribute("id");
        button.dataset.actionId = actionId;
        button.onclick = () => original.click();
      }
      const displaced = slot.querySelector(".ammoBtn");
      if (displaced && displaced !== button) displaced.remove();
      slot.appendChild(button);
      persist();
      updateHudKeyHints();
    });
    slots.appendChild(slot);
  });
  actions.forEach(button => button.addEventListener("dragstart", event => {
    if (palette.hidden) return event.preventDefault();
    event.dataTransfer.setData("application/x-orbit-action", button.dataset.actionId);
    event.dataTransfer.effectAllowed = "move";
  }));
  const formationButtons = DRONE_FORMATIONS.map(formation => {
    const button = document.createElement("button");
    button.className = "ammoBtn formationActionSlot"; button.dataset.actionCategory = "formations";
    button.dataset.actionId = `formation:${formation.id}`; button.draggable = true;
    button.innerHTML = `<img src="${formation.icon}" alt=""><span>${formation.name.replace("Formation ", "")}</span>`;
    button.onclick = () => {
      const result = setCurrentUserDroneFormation(formation.id);
      if (!result.ok) return showNotification(result.error, 2.5, "error");
      account.user = result.user;
      applyCurrentConfigStats(true);
      syncActionDockState();
      showNotification(`${formation.name} activée`, 2, "info", { goldTerms: [formation.name] });
      renderPalette("formations");
    };
    button.addEventListener("dragstart", event => { event.dataTransfer.setData("application/x-orbit-action", button.dataset.actionId); event.dataTransfer.effectAllowed = "move"; });
    byId.set(button.dataset.actionId, button);
    return button;
  });
  bar.addEventListener("dragstart", event => {
    const item = event.target.closest(".actionSlot .ammoBtn");
    if (!item) return;
    if (palette.hidden) return event.preventDefault();
    item.classList.add("isDragging");
    event.dataTransfer.setData("application/x-orbit-action", item.dataset.actionId || "");
    event.dataTransfer.effectAllowed = "move";
  });
  bar.addEventListener("dragend", () => bar.querySelectorAll(".isDragging").forEach(item => item.classList.remove("isDragging")));
  const paletteItems = palette.querySelector(".actionPaletteItems");
  layout.forEach((id,index)=>{
    if (!id?.startsWith("formation:") || !byId.has(id) || slots.children[index]?.querySelector(".ammoBtn")) return;
    const original = byId.get(id);
    const instance = original.cloneNode(true);
    instance.dataset.actionId = id;
    instance.onclick = () => original.click();
    instance.addEventListener("dragstart", event => {
      if (palette.hidden) return event.preventDefault();
      event.dataTransfer.setData("application/x-orbit-action", id);
    });
    slots.children[index]?.appendChild(instance);
  });
  function renderPalette(category) {
    paletteItems.replaceChildren();
    palette.querySelectorAll("[data-action-category]").forEach(button => button.classList.toggle("active", button.dataset.actionCategory === category));
    if (category === "formations") formationButtons.forEach(button => {
      const clone = button.cloneNode(true); clone.className = "formationQuickAction"; clone.draggable = true;
      clone.classList.toggle("active", button.dataset.actionId === `formation:${account?.user?.drones?.activeFormation}`);
      clone.onclick = () => button.click();
      clone.addEventListener("dragstart", event => { event.dataTransfer.setData("application/x-orbit-action", button.dataset.actionId); event.dataTransfer.effectAllowed = "copy"; });
      paletteItems.appendChild(clone);
    });
    else actions.filter(button => category === "ammo" ? !!button.dataset.ammo : !!button.dataset.skill).forEach(button => {
      const clone = button.cloneNode(true); clone.removeAttribute("id"); clone.draggable = true; clone.dataset.actionId = button.dataset.actionId;
      clone.addEventListener("dragstart", event => { event.dataTransfer.setData("application/x-orbit-action", clone.dataset.actionId); });
      clone.onclick = () => button.click(); paletteItems.appendChild(clone);
    });
  }
  palette.querySelectorAll("[data-action-category]").forEach(button => button.onclick = () => renderPalette(button.dataset.actionCategory));
  toggle.onclick = () => {
    palette.hidden = !palette.hidden;
    toggle.classList.toggle("active", !palette.hidden);
    toggle.textContent = palette.hidden ? "⌃" : "⌄";
  };
  document.addEventListener("dragover", event => {
    if (event.dataTransfer?.types?.includes("application/x-orbit-action")) event.preventDefault();
  });
  document.addEventListener("drop", event => {
    const actionId = event.dataTransfer?.getData("application/x-orbit-action");
    if (!actionId || event.target.closest(".actionSlot") || palette.hidden) return;
    bar.querySelector(".actionSlot .ammoBtn.isDragging")?.remove();
    persist();
    updateHudKeyHints();
  });
  document.addEventListener("pointerdown", event => {
    if (!palette.hidden && !bar.contains(event.target)) {
      palette.hidden = true;
      toggle.classList.remove("active");
      toggle.textContent = "⌃";
    }
  }, true);
  bar.append(toggle, palette);
  paletteItems.addEventListener("wheel", event => {
    if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
    event.preventDefault();
    paletteItems.scrollLeft += event.deltaY;
  }, { passive: false });
  renderPalette("ammo");
  persist();
  queueMicrotask(updateHudKeyHints);
}

initializeCustomActionBar();

// ============================================================
// ✅ Paramètres rapides du jeu
// ============================================================
const GAME_SETTINGS_KEY = "orbit_game_settings_v1";

const DEFAULT_KEYBINDS = {
  portal: "KeyJ",
  switchConfig: "KeyC",
  toggleAttack: "ControlLeft",
  respawn: "KeyR",

  slot1: "Digit1",
  slot2: "Digit2",
  slot3: "Digit3",
  slot4: "Digit4",
  slot5: "Digit5",
  slot6: "Digit6",
  slot7: "Digit7",
  slot8: "Digit8",
  slot9: "Digit9",
  slot10: "Digit0",
  slot11: "F1", slot12: "F2", slot13: "F3", slot14: "F4", slot15: "F5",
  slot16: "F6", slot17: "F7", slot18: "F8", slot19: "F9", slot20: "F10",
  toggleWindows: "KeyH",
};

const DEFAULT_GAME_SETTINGS = {
  sound: true,
  soundVolume: 55,
  background: true,
  stars: true,
  textures: true,
  drones: true,
  autoStart: false,
  shipEffect: true,
  shipSmoke: true,
  keybinds: { ...DEFAULT_KEYBINDS },
};

function normalizeKeybinds(raw) {
  const normalized = { ...DEFAULT_KEYBINDS };
  if (raw && typeof raw === "object") {
    for (const key of Object.keys(DEFAULT_KEYBINDS)) {
      if (typeof raw[key] === "string" && raw[key]) normalized[key] = raw[key];
    }
  }
  return normalized;
}

function loadGameSettings() {
  try {
    const raw = localStorage.getItem(GAME_SETTINGS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};

    const settings = {
      ...DEFAULT_GAME_SETTINGS,
      ...(parsed && typeof parsed === "object" ? parsed : {}),
      keybinds: normalizeKeybinds(parsed?.keybinds),
    };
    settings.soundVolume = clamp(Math.round(Number(settings.soundVolume) || 0), 0, 100);
    if (!settings.sound || settings.soundVolume === 0) {
      settings.sound = false;
      settings.soundVolume = 0;
    }
    return settings;
  } catch {
    return {
      ...DEFAULT_GAME_SETTINGS,
      keybinds: { ...DEFAULT_KEYBINDS },
    };
  }
}

const GAME_SETTINGS = loadGameSettings();

function saveGameSettings() {
  try {
    localStorage.setItem(GAME_SETTINGS_KEY, JSON.stringify(GAME_SETTINGS));
  } catch {}
}

function setGameSetting(key, value) {
  if (!(key in GAME_SETTINGS)) return;

  GAME_SETTINGS[key] = !!value;
  if (key === "sound") {
    GAME_SETTINGS.soundVolume = GAME_SETTINGS.sound
      ? Math.max(1, Number(GAME_SETTINGS.soundVolume) || 55)
      : 0;
    SFX?.setMasterVolume?.(GAME_SETTINGS.soundVolume / 100);
  }
  saveGameSettings();
  renderSettingsWindow();

  if (key === "sound") {
    showToast(GAME_SETTINGS.sound ? "Son activé" : "Son coupé", 1.1);
  }

  if (key === "background") {
    showToast(GAME_SETTINGS.background ? "Fond de carte affiché" : "Fond de carte masqué", 1.1);
  }

  if (key === "stars") {
    showToast(GAME_SETTINGS.stars ? "Étoiles animées" : "Étoiles masquées", 1.1);
  }

  if (key === "textures") {
    showToast(GAME_SETTINGS.textures ? "Textures affichées" : "Textures masquées", 1.1);
  }

  if (key === "drones") {
    showToast(GAME_SETTINGS.drones ? "Drones affichés" : "Drones masqués", 1.1);
  }
}

function setSoundVolume(value) {
  GAME_SETTINGS.soundVolume = clamp(Math.round(Number(value) || 0), 0, 100);
  GAME_SETTINGS.sound = GAME_SETTINGS.soundVolume > 0;
  saveGameSettings();
  SFX?.setMasterVolume?.(GAME_SETTINGS.soundVolume / 100);
  renderSettingsWindow();
}

let waitingForBindAction = null;

const KEYBIND_LABELS = {
  portal: "Portail",
  switchConfig: "Changer configuration",
  toggleAttack: "Activer / arrêter le tir",
  respawn: "Réapparition",

  slot1: "Slot 1", slot2: "Slot 2", slot3: "Slot 3", slot4: "Slot 4", slot5: "Slot 5",
  slot6: "Slot 6", slot7: "Slot 7", slot8: "Slot 8", slot9: "Slot 9", slot10: "Slot 10",
  slot11: "Slot 11", slot12: "Slot 12", slot13: "Slot 13", slot14: "Slot 14", slot15: "Slot 15",
  slot16: "Slot 16", slot17: "Slot 17", slot18: "Slot 18", slot19: "Slot 19", slot20: "Slot 20",
  toggleWindows: "Masquer / restaurer les fenêtres",
};

function getKeybind(action) {
  return GAME_SETTINGS.keybinds?.[action] || DEFAULT_KEYBINDS[action];
}

function isKeybind(action, code) {
  return getKeybind(action) === code;
}

function codeLabel(code) {
  code = String(code || "");

  const map = {
    ControlLeft: "CTRL G",
    ControlRight: "CTRL D",
    ShiftLeft: "SHIFT G",
    ShiftRight: "SHIFT D",
    AltLeft: "ALT G",
    AltRight: "ALT D",
    Space: "ESPACE",
    Escape: "ESC",
    Tab: "TAB",
    Enter: "ENTRÉE",
    Backspace: "⌫",
    ArrowUp: "↑",
    ArrowDown: "↓",
    ArrowLeft: "←",
    ArrowRight: "→",
  };

  if (map[code]) return map[code];
  if (code.startsWith("Key")) return code.slice(3).toUpperCase();
  if (code.startsWith("Digit")) return code.slice(5);
  if (code.startsWith("Numpad")) return "NUM " + code.slice(6);

  return code || "—";
}

function findKeybindConflict(action, code) {
  for (const [a, c] of Object.entries(GAME_SETTINGS.keybinds || {})) {
    if (a !== action && c === code) return a;
  }
  return null;
}

function bindKey(action, code) {
  if (!DEFAULT_KEYBINDS[action]) return false;

  const conflict = findKeybindConflict(action, code);
  if (conflict) {
    showToast(
      `Touche déjà utilisée pour : ${KEYBIND_LABELS[conflict] || conflict}`,
      1.5
    );
    return false;
  }

  GAME_SETTINGS.keybinds[action] = code;
  saveGameSettings();
  renderSettingsWindow();

  showToast(
    `${KEYBIND_LABELS[action] || action} → ${codeLabel(code)}`,
    1.2
  );

  return true;
}

function resetKeybinds() {
  GAME_SETTINGS.keybinds = { ...DEFAULT_KEYBINDS };
  saveGameSettings();
  renderSettingsWindow();
  showToast("Touches réinitialisées", 1.2);
}

function beginKeyCapture(action) {
  if (!DEFAULT_KEYBINDS[action]) return;

  waitingForBindAction = action;

  document.querySelectorAll("#settingsWindow .keyBindRow").forEach((b) => {
    b.classList.toggle("waiting", b.dataset.bindAction === action);
  });

  const label = KEYBIND_LABELS[action] || action;
  showToast(`Appuie sur une touche pour : ${label}`, 2);
}

function renderKeybindRows() {
  for (const action of Object.keys(DEFAULT_KEYBINDS)) {
    const el = document.querySelector(`[data-bind-value="${action}"]`);
    if (el) el.textContent = codeLabel(getKeybind(action));
  }

  document.querySelectorAll("#settingsWindow .keyBindRow").forEach((b) => {
    b.classList.toggle("waiting", b.dataset.bindAction === waitingForBindAction);
  });
}

function updateHudKeyHints() {
  document.querySelectorAll("#ammoBar .actionSlot").forEach((slot, index) => {
    const action = slot.querySelector(".ammoBtn");
    if (!action) return;
    let hint = action.querySelector(".slotKeyHint");
    if (!hint) {
      hint = document.createElement("span");
      hint.className = "slotKeyHint";
      action.appendChild(hint);
    }
    hint.textContent = codeLabel(getKeybind(`slot${index + 1}`));
  });

  if (ui.portalSub) {
    ui.portalSub.innerHTML = `Portail prêt — appuie sur <b>${codeLabel(getKeybind("portal"))}</b> ou clique.`;
  }

  if (ui.nextWaveBtn) {
    ui.nextWaveBtn.textContent = `Passer à la vague suivante (${codeLabel(getKeybind("portal"))})`;
  }
}

function toggleActiveConfigByKey() {
  const current = getActiveConfigNo();
  trySwitchConfig(current === 1 ? 2 : 1);
}

function updateSettingsButton(id, isOn, onText, offText) {
  const btn = document.getElementById(id);
  if (!btn) return;

  btn.textContent = isOn ? onText : offText;
  btn.classList.toggle("isOn", !!isOn);
  btn.classList.toggle("isOff", !isOn);
}

function renderSettingsWindow() {
  updateSettingsButton(
    "optSound",
    GAME_SETTINGS.sound,
    "Son : activé",
    "Son : coupé"
  );

  const background = document.getElementById("optBackground");
  const stars = document.getElementById("optStars");
  if (background) background.checked = !!GAME_SETTINGS.background;
  if (stars) stars.checked = !!GAME_SETTINGS.stars;

  const volume = document.getElementById("optVolume");
  const volumeValue = document.getElementById("optVolumeValue");
  if (volume) volume.value = String(GAME_SETTINGS.soundVolume);
  if (volumeValue) volumeValue.textContent = `${GAME_SETTINGS.soundVolume} %`;

  const autoStart = document.getElementById("optAutoStart");
  if (autoStart) autoStart.checked = !!GAME_SETTINGS.autoStart;
  const drones = document.getElementById("optDrones");
  if (drones) drones.checked = !!GAME_SETTINGS.drones;
  const shipEffect = document.getElementById("optShipEffect");
  if (shipEffect) shipEffect.checked = !!GAME_SETTINGS.shipEffect;
  const shipSmoke = document.getElementById("optShipSmoke");
  if (shipSmoke) shipSmoke.checked = !!GAME_SETTINGS.shipSmoke;

  renderKeybindRows();
  updateHudKeyHints();
}

function normalizeSettingsWindow() {
  const settingsWindow = document.getElementById("settingsWindow");
  if (settingsWindow) {
    settingsWindow.classList.remove("settingsControlsOpen");
    settingsWindow.style.width = `${Math.min(940, innerWidth - 24)}px`;
  }
}

function wireSettingsWindow() {
  const soundBtn = document.getElementById("optSound");
  const volume = document.getElementById("optVolume");
  const bgBtn = document.getElementById("optBackground");
  const starsBtn = document.getElementById("optStars");
  const texBtn = document.getElementById("optTextures");
  const autoStart = document.getElementById("optAutoStart");
  const drones = document.getElementById("optDrones");
  const shipEffect = document.getElementById("optShipEffect");
  const shipSmoke = document.getElementById("optShipSmoke");
  const settingsWindow = document.getElementById("settingsWindow");

  if (settingsWindow) {
    normalizeSettingsWindow();
  }

  window.addEventListener("orbit:window-restored", (event) => {
    if (event.detail?.id === "settingsWindow") normalizeSettingsWindow();
  });

  soundBtn?.addEventListener("click", () => {
    setGameSetting("sound", !GAME_SETTINGS.sound);
  });

  volume?.addEventListener("input", () => {
    setSoundVolume(volume.value);
  });

  bgBtn?.addEventListener("change", () => {
    setGameSetting("background", bgBtn.checked);
  });

  starsBtn?.addEventListener("change", () => {
    setGameSetting("stars", starsBtn.checked);
  });

  texBtn?.addEventListener("click", () => {
    setGameSetting("textures", !GAME_SETTINGS.textures);
  });

  autoStart?.addEventListener("change", () => {
    setGameSetting("autoStart", autoStart.checked);
  });

  drones?.addEventListener("change", () => {
    setGameSetting("drones", drones.checked);
  });

  shipEffect?.addEventListener("change", () => {
    setGameSetting("shipEffect", shipEffect.checked);
  });

  shipSmoke?.addEventListener("change", () => {
    setGameSetting("shipSmoke", shipSmoke.checked);
  });

  document.querySelectorAll("#settingsWindow .keyBindRow").forEach((btn) => {
  btn.addEventListener("click", () => {
    beginKeyCapture(btn.dataset.bindAction);
  });
});

document.getElementById("btnResetKeybinds")?.addEventListener("click", () => {
  resetKeybinds();
});

document.getElementById("btnResetWindows")?.addEventListener("click", () => {
  if (window.GameWindowManager?.resetPositions) {
    window.GameWindowManager.resetPositions();
    showToast("Fenêtres réinitialisées", 1.2);
  } else {
    showToast("Gestionnaire de fenêtres introuvable", 1.5);
  }
});
  renderSettingsWindow();
}

// ============================================================
// ✅ Fenêtres HUD déplaçables / réductibles
// ============================================================
function registerHudWindows() {
  if (!window.GameWindowManager) {
    console.warn("GameWindowManager introuvable");
    return;
  }

  const reg = (id, title, icon, defaultOpen = true, options = {}) => {
    const el = document.getElementById(id);
    if (!el) {
      console.warn("HUD window introuvable:", id);
      return;
    }

    window.GameWindowManager.register({
      id,
      title,
      icon,
      root: el,
      card: el,
      defaultOpen,
      ...options,
    });
  };

  reg("boxWave", "Vagues / Kills", "🌊");
  reg("boxMeta", "Stats joueur", "📊");
  reg("boxVitals", "État du vaisseau", "❤️");
  reg("minimap", "Mini-carte", "🗺️");
  reg("settingsWindow", "Paramètres", "⚙️", false);
  reg("questWindow", "Missions", "❗", false);
  reg("questOfferWindow", "Terminal de quêtes", "📡", false);
  reg("galaxyGateWindow", "Galaxy Gates", "✦", false);
  reg("gameLogWindow", "LOG", "≡", false);
  reg("craftingWindow", "Atelier de fabrication", "AF", false);
  if (["low", "qz"].includes(String(window.__CURRENT_MAP_ID__ || "").toLowerCase())) {
    reg("escortWindow", "Gestion des escortes", "ES", false);
  }
  reg("gygerimStatus", "État du boss", "B", true, { minimizable: false });
wireSettingsWindow();

  console.log("✅ HUD windows registered");
}

registerHudWindows();

let selectedCraftingRecipeId = CRAFTING_RECIPES[0]?.id || null;

function craftingResourceAmount(user, resourceId) {
  return Math.max(0, Number(user?.inventory?.resources?.[resourceId] || 0));
}

const CRAFTING_DURATION_BY_RARITY = Object.freeze({ common: 2, rare: 5, epic: 10, legendary: 20 });
let craftingJob = null;

function getCraftingOwnershipBlock(user, recipe, quantity = 1) {
  for (const shipId of Object.keys(recipe?.output?.ships || {})) {
    if (user?.inventory?.ships?.includes(shipId)) return "Vaisseau déjà possédé.";
  }
  for (const formationId of Object.keys(recipe?.output?.formations || {})) {
    if (user?.drones?.formations?.includes(formationId)) return "Formation déjà possédée.";
  }
  for (const [type, unitAmount] of Object.entries(recipe?.output?.drones || {})) {
    const definition = DRONE_TYPES[type];
    const owned = (user?.drones?.items || []).filter(drone => drone?.type === type).length;
    if (!definition || owned + Number(unitAmount || 0) * quantity > definition.maxOwned) {
      return `Limite de ${definition?.name || type} atteinte.`;
    }
  }
  return "";
}

function describeCraftingCosts(user, recipe, quantity) {
  const resourceLines = Object.entries(recipe.costs?.resources || {}).map(([id, amount]) => {
    const required = Number(amount) * quantity;
    const owned = craftingResourceAmount(user, id);
    return `<li><span>${escapeHtml(getResourceName(id, required))}</span><strong class="${owned >= required ? "enough" : "missing"}">${formatInteger(owned)} / ${formatInteger(required)}</strong></li>`;
  });
  const creditRequired = Number(recipe.costs?.credits || 0) * quantity;
  resourceLines.push(`<li><span>Cr&eacute;dits</span><strong class="${Number(user.credits || 0) >= creditRequired ? "enough" : "missing"}">${formatInteger(user.credits)} / ${formatInteger(creditRequired)}</strong></li>`);
  return resourceLines.join("");
}

function describeCraftingOutput(map, quantity, labelForId) {
  return Object.entries(map || {}).map(([id, amount]) =>
    `<li><span>${escapeHtml(labelForId(id))}</span><strong>${formatInteger(Number(amount) * quantity)}</strong></li>`
  ).join("");
}

function renderCraftingWindow(message = "") {
  if (!ui.craftingRecipes || !ui.craftingDetail) return;
  const user = getCurrentUserFull();
  if (!user) return;
  account.user = user;
  let quantity = Math.max(1, Number(ui.craftingQuantity?.value || 1));
  ui.craftingRecipes.innerHTML = CRAFTING_RECIPES.map(recipe => {
    const rarity = ITEM_RARITIES[recipe.rarity] || ITEM_RARITIES.common;
    const ownershipBlock = getCraftingOwnershipBlock(user, recipe, 1);
    return `<button type="button" class="craftingRecipe rarity-${rarity.id}${recipe.id === selectedCraftingRecipeId ? " active" : ""}${ownershipBlock ? " ownedLimit" : ""}" data-recipe-id="${escapeHtml(recipe.id)}" title="${escapeHtml(ownershipBlock)}"${craftingJob ? " disabled" : ""}><span>${escapeHtml(recipe.name)}</span><small>${escapeHtml(ownershipBlock || rarity.name)}</small></button>`;
  }).join("");
  const recipe = CRAFTING_RECIPES.find(entry => entry.id === selectedCraftingRecipeId) || CRAFTING_RECIPES[0];
  if (!recipe) return;
  selectedCraftingRecipeId = recipe.id;
  if (Object.keys(recipe.output?.ships || {}).length && quantity !== 1) {
    quantity = 1;
    if (ui.craftingQuantity) ui.craftingQuantity.value = "1";
  }
  const rarity = ITEM_RARITIES[recipe.rarity] || ITEM_RARITIES.common;
  const costs = describeCraftingCosts(user, recipe, quantity);
  const outputs = [
    describeCraftingOutput(recipe.output?.resources, quantity, id => getResourceName(id, Number(recipe.output.resources[id]) * quantity)),
    describeCraftingOutput(recipe.output?.items, quantity, id => findCatalogItem(id)?.name || id),
    describeCraftingOutput(recipe.output?.ammo, quantity, id => `Munitions ${id.toUpperCase()}`),
    describeCraftingOutput(recipe.output?.ships, quantity, id => findCatalogItem(recipe.catalogItemId)?.name || `Vaisseau ${id}`),
    describeCraftingOutput(recipe.output?.drones, quantity, id => `Drone ${id.toUpperCase()}`),
    describeCraftingOutput(recipe.output?.formations, quantity, id => `Formation ${id}`),
  ].join("");
  const baseDuration = CRAFTING_DURATION_BY_RARITY[rarity.id] || 2;
  const duration = baseDuration * quantity;
  ui.craftingDetail.innerHTML = `<div class="craftingRarity rarity-${rarity.id}">${escapeHtml(rarity.name)}</div><h3>${escapeHtml(recipe.name)}</h3><small class="craftingDuration">Temps de fabrication : ${duration.toFixed(duration % 1 ? 1 : 0)} s</small><div class="craftingColumns"><div><h4>CO&Ucirc;T</h4><ul>${costs}</ul></div><div><h4>R&Eacute;SULTAT</h4><ul>${outputs}</ul></div></div>`;
  const canAfford = Number(user.credits || 0) >= Number(recipe.costs?.credits || 0) * quantity
    && Object.entries(recipe.costs?.resources || {}).every(([id, amount]) => craftingResourceAmount(user, id) >= Number(amount) * quantity);
  const ownershipBlock = getCraftingOwnershipBlock(user, recipe, quantity);
  if (ui.craftingBuildBtn) ui.craftingBuildBtn.disabled = !canAfford || Boolean(craftingJob) || Boolean(ownershipBlock);
  if (ui.craftingQuantity) ui.craftingQuantity.disabled = Boolean(craftingJob);
  if (ui.craftingMessage) ui.craftingMessage.textContent = message || (craftingJob ? "Fabrication en cours..." : ownershipBlock || (canAfford ? "Prêt à fabriquer." : "Ressources insuffisantes."));
}

ui.craftingRecipes?.addEventListener("click", event => {
  const button = event.target.closest("[data-recipe-id]");
  if (!button) return;
  selectedCraftingRecipeId = button.dataset.recipeId;
  renderCraftingWindow();
});
ui.craftingQuantity?.addEventListener("change", () => renderCraftingWindow());
ui.craftingBuildBtn?.addEventListener("click", () => {
  if (craftingJob) return;
  const recipe = CRAFTING_RECIPES.find(entry => entry.id === selectedCraftingRecipeId);
  if (!recipe) return;
  const quantity = Math.max(1, Number(ui.craftingQuantity?.value || 1));
  const user = getCurrentUserFull();
  const ownershipBlock = getCraftingOwnershipBlock(user, recipe, quantity);
  if (ownershipBlock) return renderCraftingWindow(ownershipBlock);
  const canAfford = Number(user?.credits || 0) >= Number(recipe.costs?.credits || 0) * quantity
    && Object.entries(recipe.costs?.resources || {}).every(([id, amount]) => craftingResourceAmount(user, id) >= Number(amount) * quantity);
  if (!canAfford) return renderCraftingWindow("Ressources insuffisantes.");
  const baseDuration = CRAFTING_DURATION_BY_RARITY[recipe.rarity] || 2;
  const durationMs = baseDuration * quantity * 1000;
  craftingJob = { recipe, quantity, startedAt: performance.now(), durationMs };
  if (ui.craftingProgress) ui.craftingProgress.hidden = false;
  renderCraftingWindow("Fabrication en cours...");
  const timer = setInterval(() => {
    if (!craftingJob) return clearInterval(timer);
    const progress = clamp((performance.now() - craftingJob.startedAt) / craftingJob.durationMs, 0, 1);
    const percent = Math.round(progress * 100);
    if (ui.craftingProgressBar) ui.craftingProgressBar.style.width = `${percent}%`;
    if (ui.craftingProgressPct) ui.craftingProgressPct.textContent = `${percent} %`;
    if (progress < 1) return;
    clearInterval(timer);
    const completed = craftingJob;
    craftingJob = null;
    const result = craftCurrentUserRecipe(completed.recipe.id, completed.quantity);
    if (!result.ok) {
      if (ui.craftingProgress) ui.craftingProgress.hidden = true;
      if (ui.craftingProgressBar) ui.craftingProgressBar.style.width = "0%";
      return renderCraftingWindow(result.error);
    }
    account.user = result.user;
    syncPlayerFromAccount();
    window.dispatchEvent(new CustomEvent("orbit:profile-progress"));
    showNotification(`${result.recipe.name} fabriqué`, 2.5, "reward", { goldTerms: [result.recipe.name] });
    if (ui.craftingProgress) ui.craftingProgress.hidden = true;
    if (ui.craftingProgressBar) ui.craftingProgressBar.style.width = "0%";
    renderCraftingWindow(`${result.quantity} fabrication${result.quantity > 1 ? "s" : ""} terminée${result.quantity > 1 ? "s" : ""}.`);
  }, 80);
});
window.addEventListener("orbit:window-restored", event => {
  if (event.detail?.id === "craftingWindow") renderCraftingWindow();
});
window.addEventListener("orbit:profile-progress", () => renderCraftingWindow());
queueMicrotask(() => renderCraftingWindow());

let selectedGalaxyGateId = null;

function formatGalaxyGatePartRewards(reward) {
  const detailed = Object.entries(reward?.partsByGate || {})
    .filter(([, amount]) => Number(amount) > 0)
    .map(([gateId, amount]) => {
      const gateName = GALAXY_GATE_DEFINITIONS[gateId]?.name || gateId;
      return `${formatInteger(amount)} pièce${Number(amount) > 1 ? "s" : ""} ${gateName}`;
    });
  if (detailed.length) return detailed;
  const total = Math.max(0, Number(reward?.parts) || 0);
  return total ? [`${formatInteger(total)} pièce${total > 1 ? "s" : ""}`] : [];
}

function renderGalaxyGateWindow(message = "") {
  if (!ui.ggTabs) return;
  const user = getCurrentUserFull();
  const state = user?.galaxyGates;
  if (!state) return;
  if (!selectedGalaxyGateId && GALAXY_GATE_DEFINITIONS[state.lastOpenedGate]) selectedGalaxyGateId = state.lastOpenedGate;
  const gate = GALAXY_GATE_DEFINITIONS[selectedGalaxyGateId] || GALAXY_GATE_DEFINITIONS.alpha;
  ui.ggEnergy.textContent = formatInteger(state.energy);
  ui.ggCredits.textContent = formatInteger(user.credits);
  const displayedParts = state.built[gate.id] >= GALAXY_GATE_BUILD_LIMIT ? gate.requiredParts : state.parts[gate.id];
  ui.ggParts.textContent = `${formatInteger(displayedParts)} / ${formatInteger(gate.requiredParts)}`;
  ui.ggPortalImage.src = gate.image;
  ui.ggPortalImage.alt = `Portail ${gate.name}`;
  const completion = gate.completion;
  ui.ggRewards.innerHTML = `<strong>Récompenses finales</strong><span>${formatInteger(completion.exp)} XP</span><span>${formatInteger(completion.honor)} honneur</span><span>${formatInteger(completion.credits)} crédits</span><span>${formatInteger(completion.x4)} UCB-100</span>`;
  ui.ggNpcRewardScale.innerHTML = `Récompenses des NPC <em>×${gate.rewardScale}</em>`;
  ui.ggMultiplier.textContent = `x${state.multipliers[gate.id]}`;
  if (ui.ggMultiplierBtn) {
    const armed = state.multiplierArmed?.[gate.id] === true;
    ui.ggMultiplierBtn.disabled = state.multipliers[gate.id] <= 1;
    ui.ggMultiplierBtn.classList.toggle("active", armed);
    ui.ggMultiplierBtn.textContent = armed ? "Activé pour le prochain spin" : "Activer";
  }
  ui.ggBuilt.textContent = `${formatInteger(state.built[gate.id])} / ${GALAXY_GATE_BUILD_LIMIT}`;
  ui.ggCompleted.textContent = formatInteger(state.completed[gate.id]);
  if (ui.ggLives) ui.ggLives.textContent = `${formatInteger(state.lives?.[gate.id] ?? gate.maxLives)} / ${formatInteger(gate.maxLives)}`;
  const activeWave = state.active === gate.id ? Math.min(gate.maxWaves, Math.max(1, Number(state.activeWave) || 1)) : 0;
  ui.ggWave.textContent = `${activeWave} / ${gate.maxWaves}`;
  const selectedSpinCount = Math.max(1, Number(ui.ggSpinCount?.value || 1));
  ui.ggCreditCost.textContent = formatInteger(GALAXY_SPIN_CREDIT_COST * selectedSpinCount);
  const isActive = state.active === gate.id;
  const isDeployed = state.deployed?.[gate.id] === true;
  const isFull = state.built[gate.id] >= GALAXY_GATE_BUILD_LIMIT;
  ui.ggSpinBtn.hidden = false;
  ui.ggSpinBtn.disabled = false;
  ui.ggDeployBtn.hidden = !isFull;
  ui.ggDeployBtn.disabled = !isFull || isDeployed || Boolean(state.active);
  ui.ggDeployBtn.textContent = isActive ? "Gate en cours" : isDeployed ? "Portail préparé" : "Préparer le portail";
  ui.ggTabs.innerHTML = Object.values(GALAXY_GATE_DEFINITIONS).map(item => {
    const parts = state.built[item.id] >= GALAXY_GATE_BUILD_LIMIT ? item.requiredParts : state.parts[item.id];
    return `<button type="button" data-gg-gate="${item.id}" class="${item.id === gate.id ? "active" : ""}">${item.name}<small>${parts}/${item.requiredParts}</small></button>`;
  }).join("");
  const history = [...state.history].reverse();
  ui.ggHistory.innerHTML = history.length ? history.map(entry => {
    const reward = entry.rewards || {};
    const applications = Array.isArray(reward.multiplierApplications) && reward.multiplierApplications.length
      ? reward.multiplierApplications
      : reward.multiplierApplied ? [reward.multiplierApplied] : [];
    const appliedTotals = applications.reduce((totals, item) => {
      const key = `${item.rewardType}:${item.rewardId || ""}`;
      totals[key] = (totals[key] || 0) + (Number(item.amount) || 0);
      return totals;
    }, {});
    const ammo = Object.entries(reward.ammo || {})
      .map(([id, amount]) => [id, Math.max(0, amount - (appliedTotals[`ammo:${id}`] || 0))])
      .filter(([, amount]) => amount > 0)
      .map(([id, amount]) => `${formatInteger(amount)} munitions ${id.toUpperCase()}`);
    const built = Object.entries(reward.builtByGate || {}).filter(([, amount]) => amount > 0).map(([gateId]) => `${GALAXY_GATE_DEFINITIONS[gateId]?.name || gateId} terminée`);
    const duplicateCounts = (reward.duplicates || []).reduce((counts, item) => {
      counts[item.gate] = (counts[item.gate] || 0) + 1;
      return counts;
    }, {});
    const duplicates = Object.entries(duplicateCounts).map(([gateId, amount]) => `Doublon (${GALAXY_GATE_DEFINITIONS[gateId]?.name || gateId}) +${amount} multiplicateur${amount > 1 ? "s" : ""}`);
    const groupedApplications = Object.values(applications.reduce((groups, applied) => {
      const key = `${applied.rewardType}:${applied.rewardId || ""}:x${applied.multiplier}`;
      if (!groups[key]) groups[key] = { ...applied, amount: 0, count: 0 };
      groups[key].amount += Number(applied.amount) || 0;
      groups[key].count++;
      return groups;
    }, {}));
    const appliedTexts = groupedApplications.map(applied => {
      if (applied.rewardType === "ammo") return `Munitions ${String(applied.rewardId || "").toUpperCase()} obtenues : ${formatInteger(applied.amount)} x${applied.multiplier}`;
      if (applied.rewardType === "credits") return `Crédits obtenus : ${formatInteger(applied.amount)} x${applied.multiplier}`;
      if (applied.rewardType === "energy") return `Énergies obtenues : ${formatInteger(applied.amount)} x${applied.multiplier}`;
      if (applied.rewardType === "parts") return `Pièces ${GALAXY_GATE_DEFINITIONS[applied.rewardId]?.name || applied.rewardId} obtenues : ${formatInteger(applied.amount)} x${applied.multiplier}`;
      return "";
    }).filter(Boolean);
    const remainingCredits = Math.max(0, (reward.credits || 0) - (appliedTotals["credits:"] || 0));
    const remainingEnergy = Math.max(0, (reward.energy || 0) - (appliedTotals["energy:"] || 0));
    const remainingParts = Object.fromEntries(Object.entries(reward.partsByGate || {}).map(([gateId, amount]) => [
      gateId,
      Math.max(0, amount - (appliedTotals[`parts:${gateId}`] || 0)),
    ]));
    const credits = remainingCredits ? `${formatInteger(remainingCredits)} crédits` : "";
    const energy = remainingEnergy ? `${remainingEnergy} énergie` : "";
    const gains = [...formatGalaxyGatePartRewards({ partsByGate: remainingParts }), ...built, ...duplicates, credits, energy, ...ammo].filter(Boolean);
    const gainRows = (gains.length || appliedTexts.length)
      ? `${gains.map(gain => `<small>${gain}</small>`).join("")}${appliedTexts.map(text => `<small class="ggHistoryMultiplierApplied">${text}</small>`).join("")}`
      : `<small>Aucun gain direct</small>`;
    const historyGate = GALAXY_GATE_DEFINITIONS[entry.gate] || GALAXY_GATE_DEFINITIONS.alpha;
    const gateSetLabel = historyGate.group === "ensemble"
      ? Object.values(GALAXY_GATE_DEFINITIONS).filter(item => item.group === "ensemble").map(item => item.name).join(" · ")
      : historyGate.name;
    return `<div class="ggHistoryRow"><span><b>${gateSetLabel}</b> · ${entry.spins} spin(s)</span><div class="ggHistoryGains">${gainRows}</div></div>`;
  }).join("") : `<div class="ggHistoryEmpty">Aucun spin enregistré.</div>`;
}

ui.ggTabs?.addEventListener("click", event => {
  const button = event.target.closest("[data-gg-gate]");
  if (!button) return;
  selectedGalaxyGateId = button.dataset.ggGate;
  renderGalaxyGateWindow();
});

ui.ggSpinCount?.addEventListener("change", () => renderGalaxyGateWindow());

ui.ggMultiplierBtn?.addEventListener("click", () => {
  const state = getCurrentUserFull()?.galaxyGates;
  const armed = state?.multiplierArmed?.[selectedGalaxyGateId] === true;
  const result = armCurrentUserGalaxyGateMultiplier(selectedGalaxyGateId, !armed);
  if (!result.ok) return renderGalaxyGateWindow(result.error);
  account.user = result.user;
  renderGalaxyGateWindow(armed ? "Multiplicateur désactivé." : "Multiplicateur activé pour le prochain spin.");
});

ui.galaxyGateWindow?.addEventListener("click", event => {
  const deployButton = event.target.closest("[data-gg-deploy]");
  if (deployButton) {
    saveProgressNow();
    const result = deployCurrentUserGalaxyGate(selectedGalaxyGateId);
    if (!result.ok) return renderGalaxyGateWindow(result.error);
    account.user = result.user;
    renderGalaxyGateWindow(`${GALAXY_GATE_DEFINITIONS[selectedGalaxyGateId].name} envoyée sur la map.`);
    return;
  }
  const button = event.target.closest("[data-gg-spin]");
  if (!button) return;
  saveProgressNow();
  const result = spinCurrentUserGalaxyGate(selectedGalaxyGateId, Number(ui.ggSpinCount?.value || 1));
  if (!result.ok) {
    renderGalaxyGateWindow(result.error);
    return;
  }
  account.user = result.user;
  if (GALAXY_GATE_DEFINITIONS[result.state.lastOpenedGate]) selectedGalaxyGateId = result.state.lastOpenedGate;
  player.credits = result.user.credits;
  player.ammo.x2 = result.user.ammo.x2;
  player.ammo.x3 = result.user.ammo.x3;
  player.ammo.x4 = result.user.ammo.x4;
  updateAmmoUI();
  const reward = result.rewards;
  const pieces = formatGalaxyGatePartRewards(reward).join(", ");
  const ammo = Object.entries(reward.ammo).filter(([, amount]) => amount > 0).map(([id, amount]) => `${formatInteger(amount)} munitions ${id.toUpperCase()}`).join(", ");
  const extras = [reward.credits ? `${formatInteger(reward.credits)} crédits` : "", reward.energy ? `${reward.energy} énergie` : "", reward.built ? `${reward.built} Gate prête` : ""].filter(Boolean).join(", ");
  renderGalaxyGateWindow([`${result.performed} spin(s)`, pieces, ammo, extras].filter(Boolean).join(" · "));
  window.dispatchEvent(new CustomEvent("orbit:galaxy-gates"));
});

renderGalaxyGateWindow();

// ============================================================
// Helpers
// ============================================================
const MAX_ALIVE = 100;
let currentWavePlan = null;
let NPC_SENSOR_RANGES = getNpcSensorRanges(rules);

const TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);
const vary = (val, pct = 0.05) => {
  const p = Math.max(0, Number(pct) || 0);
  const v = (1 - p) + Math.random() * (2 * p);
  return val * v;
};

const normAng = (a) => ((a % TAU) + TAU) % TAU;

let nextId = 1;
const newId = () => nextId++;

function resolvePlayerWalls() {
  if (!zoneWalls || !zoneWalls.length) return;

  for (let pass = 0; pass < 2; pass++) {
    for (const w of zoneWalls) {
      const push = circleRectResolve(player.x, player.y, player.r, w);
      if (!push) continue;

      player.x = clamp(player.x + push.x, player.r, WORLD.w - player.r);
      player.y = clamp(player.y + push.y, player.r, WORLD.h - player.r);

      const dot = player.vx * push.x + player.vy * push.y;
      if (dot < 0) {
        player.vx *= 0.25;
        player.vy *= 0.25;
      }
    }
  }
}

// ============================================================
// Image loader (queue + cache) ✅ anti-freeze
// ============================================================
const IMG = createImageLoader({ concurrency: 6 });
const loadImage = IMG.load;
const getCachedImage = IMG.getCached;
const isImgReady = IMG.isReady;

// ============================================================
// ✅ Sprites portails personnalisables + animation jump
// ============================================================
const DEFAULT_PORTAL_JUMP_SPR = {
  src: "assets/Standard_Portal/jump.png",
  w: 319,
  h: 319,
  yOff: 0,
  scale: 1,
  spinSpeed: 0,
  alpha: 1,
};

const DEFAULT_PORTAL_JUMP_FX = {
  path: "assets/Portal_Jump/",
  frames: 25,
  firstNumber: 1,
  ext: ".png",
  fps: 40,

  w: 320,
  h: 320,

  scale: 1,
  xOff: 0,
  yOff: 0,

  alpha: 1,
  loop: true,
  spinSpeed: 0,
};

const DEFAULT_PORTAL_JUMP_BUTTON = {
  idle: {
    src: "assets/Portal_Jump_Button/Nothing.png",
  },

  mouse: {
    src: "assets/Portal_Jump_Button/Pointed.png",
  },

  click: {
    src: "assets/Portal_Jump_Button/Clicked.png",
  },

  // Taille affichée
  w: 88,
  h: 135,

  // Position par rapport au centre du portail
  xOff: -10,
  yOff: -250,

  alpha: 1,

  // Le joueur doit être dans le rayon du portail
  requireNear: true,
};

const QUEST_BUTTON = {
  idle: { src: "assets/Quest_Button/1.png" },
  mouse: { src: "assets/Quest_Button/2.png" },
  click: { src: "assets/Quest_Button/3.png" },
  w: 88,
  h: 135,
  gap: 12,
  interactionRadius: 700,
};

function getPortalSpriteSet(ptl = null) {
  return {
    idle: ptl?.sprites?.idle || PORTAL_IDLE_SPR,
    open: ptl?.sprites?.open || PORTAL_OPEN_SPR,

    jump: {
      ...DEFAULT_PORTAL_JUMP_SPR,
      ...(PORTAL_JUMP_SPR || {}),
      ...(ptl?.sprites?.jump || {}),
    },

    jumpFx: {
      ...DEFAULT_PORTAL_JUMP_FX,
      ...(ptl?.sprites?.jumpFx || {}),
    },

    jumpButton: {
      ...DEFAULT_PORTAL_JUMP_BUTTON,
      ...(ptl?.jumpButton || {}),

      idle: {
        ...DEFAULT_PORTAL_JUMP_BUTTON.idle,
        ...(ptl?.jumpButton?.idle || {}),
      },

      mouse: {
        ...DEFAULT_PORTAL_JUMP_BUTTON.mouse,
        ...(ptl?.jumpButton?.mouse || {}),
      },

      click: {
        ...DEFAULT_PORTAL_JUMP_BUTTON.click,
        ...(ptl?.jumpButton?.click || {}),
      },
    },
  };
}

function getPortalFrameSrc(pack, index) {
  if (!pack) return null;

  const first = Number(pack.firstNumber ?? 1);
  const ext = pack.ext || ".png";
  const n = first + index;

  // Exemple : assets/portal_jump_fx/1.png
  return `${pack.path}${n}${ext}`;
}

function preloadPortalSprites(ptl = null) {
  const spr = getPortalSpriteSet(ptl);
  const jobs = [];

  if (spr.idle?.src) jobs.push(loadImage(spr.idle.src, { priority: true }));
  if (spr.open?.src) jobs.push(loadImage(spr.open.src, { priority: true }));
  if (spr.jump?.src) jobs.push(loadImage(spr.jump.src, { priority: true }));

  const btn = spr.jumpButton;

if (btn?.idle?.src) {
  jobs.push(loadImage(btn.idle.src, { priority: true }));
}

if (btn?.mouse?.src) {
  jobs.push(loadImage(btn.mouse.src, { priority: true }));
}

if (btn?.click?.src) {
  jobs.push(loadImage(btn.click.src, { priority: true }));
}

  // ✅ précharge le sprite animé par-dessus
  const fx = spr.jumpFx;
  if (fx?.path && fx?.frames) {
    const frames = Math.max(1, Number(fx.frames || 1));

    for (let i = 0; i < frames; i++) {
      const src = getPortalFrameSrc(fx, i);
      if (src) jobs.push(loadImage(src, { priority: true }));
    }
  }
  return jobs;
}

const SHORTCUT_TAX_CONFIRMATION_KEY = "orbit_shortcut_tax_confirmation_hidden_v1";

function isShortcutTaxConfirmationHidden() {
  try {
    return localStorage.getItem(SHORTCUT_TAX_CONFIRMATION_KEY) === "1";
  } catch {
    return false;
  }
}

function hideShortcutTaxConfirmation() {
  try {
    localStorage.setItem(SHORTCUT_TAX_CONFIRMATION_KEY, "1");
  } catch {}
}

function requestShortcutTaxConfirmation(ptl, shortcutCost) {
  if (!ptl || ptl.entryConfirmationOpen) return false;
  const overlay = document.getElementById("confirmOverlay");
  const title = document.getElementById("confirmTitle");
  const message = document.getElementById("confirmMessage");
  const cancel = document.getElementById("confirmCancel");
  const confirm = document.getElementById("confirmOk");
  if (!overlay || !title || !message || !cancel || !confirm) return false;

  const destination = String(ptl.toMap || "secteur inconnu").toUpperCase();
  const enough = player.credits >= shortcutCost;
  const remainingCredits = Math.max(0, player.credits - shortcutCost);

  ptl.entryConfirmationOpen = true;
  title.textContent = `Raccourci vers ${destination}`;
  message.innerHTML = `Ce portail est un raccourci intersectoriel.<br><strong>${formatInteger(shortcutCost)} crédits</strong> seront débités à chaque passage.<br><br>Tu possèdes <strong>${formatInteger(player.credits)}</strong> crédits.<br>Après le passage : <strong>${formatInteger(remainingCredits)}</strong> crédits.<label style="display:flex;align-items:center;gap:9px;margin-top:16px;color:#b9dce8;font-weight:800;cursor:pointer"><input id="shortcutTaxDontAskAgain" type="checkbox" style="width:17px;height:17px;accent-color:#26c3e4"> Ne plus afficher cette confirmation</label>`;
  cancel.style.display = "";
  cancel.textContent = "Annuler";
  confirm.disabled = !enough;
  confirm.textContent = enough ? "Payer et utiliser" : "Crédits insuffisants";
  overlay.style.display = "grid";

  const cleanup = () => {
    ptl.entryConfirmationOpen = false;
    overlay.style.display = "none";
    overlay.onclick = null;
    cancel.onclick = null;
    confirm.onclick = null;
    confirm.disabled = false;
  };

  cancel.onclick = cleanup;
  overlay.onclick = event => { if (event.target === overlay) cleanup(); };
  confirm.onclick = () => {
    if (player.credits < shortcutCost) return;
    if (document.getElementById("shortcutTaxDontAskAgain")?.checked) {
      hideShortcutTaxConfirmation();
    }
    cleanup();
    startZonePortalJump(ptl, true);
  };
  return true;
}

function requestPortalEntryConfirmation(ptl, entryCost) {
  if (!ptl || ptl.entryConfirmationOpen) return false;
  const overlay = document.getElementById("confirmOverlay");
  const title = document.getElementById("confirmTitle");
  const message = document.getElementById("confirmMessage");
  const cancel = document.getElementById("confirmCancel");
  const confirm = document.getElementById("confirmOk");
  if (!overlay || !title || !message || !cancel || !confirm) return false;

  ptl.entryConfirmationOpen = true;
  title.textContent = "Entrer dans la gate LOW";
  const escortCost = Math.max(0, Math.floor(Number(ptl.escortCreditCost) || 0));
  const maxEscorts = Math.max(0, Math.min(7, Math.floor(Number(ptl.maxEscorts) || 0)));
  const options = Array.from({ length: maxEscorts + 1 }, (_, count) => `<option value="${count}">${count} escorte${count > 1 ? "s" : ""}${count ? ` (+${formatInteger(count * escortCost)} crédits)` : ""}</option>`).join("");
  message.innerHTML = `<span id="creditGateEntrySummary"></span>${maxEscorts ? `<label style="display:grid;gap:7px;margin-top:14px;color:#9fd7e8;font-weight:800">Escortes Goliath<select id="creditGateEscortCount" style="height:38px;padding:0 10px;border:1px solid rgba(124,240,255,.28);border-radius:8px;color:#e8f4ff;background:#071622">${options}</select></label>` : ""}`;
  cancel.textContent = "Annuler";
  confirm.textContent = "Confirmer";
  overlay.style.display = "grid";

  const select = document.getElementById("creditGateEscortCount");
  const summary = document.getElementById("creditGateEntrySummary");
  const refresh = () => {
    const escorts = Math.max(0, Math.min(maxEscorts, Number(select?.value) || 0));
    const total = entryCost + escorts * escortCost;
    const enough = player.credits >= total;
    if (summary) summary.innerHTML = `Tu possèdes <strong>${formatInteger(player.credits)}</strong> crédits.<br><strong>${formatInteger(total)}</strong> nécessaires (${formatInteger(entryCost)} d'entrée${escorts ? ` + ${formatInteger(escorts * escortCost)} pour ${escorts} escorte${escorts > 1 ? "s" : ""}` : ""}).<br>Après paiement : <strong>${formatInteger(Math.max(0, player.credits - total))}</strong> crédits.`;
    confirm.disabled = !enough;
    confirm.textContent = enough ? "Confirmer l'entrée" : "Crédits insuffisants";
  };
  select?.addEventListener("change", refresh);
  refresh();

  const cleanup = () => {
    ptl.entryConfirmationOpen = false;
    overlay.style.display = "none";
    overlay.onclick = null;
    cancel.onclick = null;
    confirm.onclick = null;
    confirm.disabled = false;
  };
  cancel.onclick = cleanup;
  overlay.onclick = event => {
    if (event.target === overlay) cleanup();
  };
  confirm.onclick = () => {
    const escorts = Math.max(0, Math.min(maxEscorts, Number(select?.value) || 0));
    const total = entryCost + escorts * escortCost;
    if (player.credits < total) return;
    ptl.pendingEntryCost = total;
    ptl.pendingEscortCount = escorts;
    cleanup();
    startZonePortalJump(ptl, true);
  };
  return true;
}

function requestResourceGateConfirmation(ptl) {
  if (!ptl || ptl.entryConfirmationOpen) return false;
  const overlay = document.getElementById("confirmOverlay");
  const title = document.getElementById("confirmTitle");
  const message = document.getElementById("confirmMessage");
  const cancel = document.getElementById("confirmCancel");
  const confirm = document.getElementById("confirmOk");
  if (!overlay || !title || !message || !cancel || !confirm) return false;

  if (!account.user) loadAccountUser();
  const resourceId = String(ptl.entryResource || "hybrid_alloy");
  const owned = Math.max(0, Math.floor(Number(account.user?.inventory?.resources?.[resourceId]) || 0));
  const baseCost = Math.max(0, Math.floor(Number(ptl.entryResourceCost) || 0));
  const escortCost = Math.max(0, Math.floor(Number(ptl.escortResourceCost) || 10));
  const maxEscorts = Math.max(0, Math.min(7, Math.floor(Number(ptl.maxEscorts) || 0)));
  const resourceName = getResourceName(resourceId, owned);
  ptl.entryConfirmationOpen = true;
  title.textContent = "Entrer dans la gate QZ";
  cancel.textContent = "Annuler";
  confirm.textContent = owned >= baseCost ? "Confirmer l'entrée" : "Fermer";

  if (owned < baseCost) {
    message.innerHTML = `Accès impossible : tu possèdes <strong>${formatInteger(owned)}</strong> ${escapeHtml(resourceName)}, mais <strong>${formatInteger(baseCost)}</strong> sont nécessaires.<br><br>Élimine des <strong>Blighted Kristallon</strong> : ils font apparaître des <strong>Blighted Gygerthrall</strong>, dont les cargaisons contiennent les Alliages hybrides.`;
    cancel.style.display = "none";
  } else {
    const options = Array.from({ length: maxEscorts + 1 }, (_, count) => `<option value="${count}">${count} escorte${count > 1 ? "s" : ""}${count ? ` (+${formatInteger(count * escortCost)} alliages)` : ""}</option>`).join("");
    message.innerHTML = `<span id="qzEntrySummary"></span><label style="display:grid;gap:7px;margin-top:14px;color:#9fd7e8;font-weight:800">Escortes Goliath<select id="qzEscortCount" style="height:38px;padding:0 10px;border:1px solid rgba(124,240,255,.28);border-radius:8px;color:#e8f4ff;background:#071622">${options}</select></label>`;
    const select = document.getElementById("qzEscortCount");
    const summary = document.getElementById("qzEntrySummary");
    const refresh = () => {
      const escorts = Math.max(0, Math.min(maxEscorts, Number(select?.value) || 0));
      const total = baseCost + escorts * escortCost;
      const enough = owned >= total;
      if (summary) summary.innerHTML = `Tu possèdes <strong>${formatInteger(owned)}</strong> Alliages hybrides.<br><strong>${formatInteger(total)}</strong> nécessaires (${formatInteger(baseCost)} d'entrée${escorts ? ` + ${formatInteger(escorts * escortCost)} pour ${escorts} escorte${escorts > 1 ? "s" : ""}` : ""}).<br>Après paiement : <strong>${formatInteger(Math.max(0, owned - total))}</strong> restant${owned - total > 1 ? "s" : ""}.`;
      confirm.disabled = !enough;
      confirm.textContent = enough ? "Confirmer l'entrée" : "Alliages insuffisants";
    };
    select?.addEventListener("change", refresh);
    refresh();
  }
  overlay.style.display = "grid";

  const cleanup = () => {
    ptl.entryConfirmationOpen = false;
    overlay.style.display = "none";
    overlay.onclick = null;
    cancel.onclick = null;
    confirm.onclick = null;
    cancel.style.display = "";
    confirm.disabled = false;
  };
  cancel.onclick = cleanup;
  overlay.onclick = event => { if (event.target === overlay) cleanup(); };
  confirm.onclick = () => {
    if (owned < baseCost) return cleanup();
    const escorts = Math.max(0, Math.min(maxEscorts, Number(document.getElementById("qzEscortCount")?.value) || 0));
    const total = baseCost + escorts * escortCost;
    if (owned < total) return;
    ptl.pendingResourceCost = total;
    ptl.pendingEscortCount = escorts;
    cleanup();
    startZonePortalJump(ptl, true);
  };
  return true;
}

function startZonePortalJump(ptl, entryConfirmed = false) {
  if (!ptl || ptl.jumping) return false;
  if (!isPlayerNearPortal(ptl)) {
    showToast("Approche-toi du portail", 1.2);
    return false;
  }

  const mapId = String(window.__CURRENT_MAP_ID__ || rules?.mapLabel || "").trim().toLowerCase();
  const combatRestrictedMap = /^[123]-4\.1$/.test(mapId) || mapId === "4-4.123" || mapId === "4-5";
  const combatCooldown = Math.max(Number(player.combatT) || 0, Number(player.attackedT) || 0);
  if (combatRestrictedMap && combatCooldown > 0) {
    showToast(`Portail verrouillé — attends ${Math.ceil(combatCooldown)} s après le combat`, 1.4);
    return false;
  }

  const entryCost = Math.max(0, Math.floor(Number(ptl.entryCost) || 0));
  const shortcutCreditCost = Math.max(0, Math.floor(Number(ptl.shortcutCreditCost) || 0));
  const confirmedEntryCost = entryConfirmed
    ? Math.max(entryCost, Math.floor(Number(ptl.pendingEntryCost) || entryCost))
    : entryCost;
  const resourceEntryCost = Math.max(0, Math.floor(Number(ptl.entryResourceCost) || 0));
  if (resourceEntryCost > 0 && !entryConfirmed) return requestResourceGateConfirmation(ptl);
  if (resourceEntryCost > 0 && entryConfirmed) {
    if (!account.user) loadAccountUser();
    const resourceId = String(ptl.entryResource || "hybrid_alloy");
    const totalCost = Math.max(resourceEntryCost, Math.floor(Number(ptl.pendingResourceCost) || resourceEntryCost));
    const owned = Math.max(0, Math.floor(Number(account.user?.inventory?.resources?.[resourceId]) || 0));
    if (owned < totalCost) {
      showToast(`Entrée refusée — ${formatInteger(totalCost)} ${getResourceName(resourceId, totalCost)} requis`, 2.2);
      return false;
    }
    account.user.inventory.resources[resourceId] = owned - totalCost;
    try { sessionStorage.setItem("orbit_gate_escorts_qz", String(Math.max(0, Number(ptl.pendingEscortCount) || 0))); } catch {}
    markProgressDirty();
    saveProgressNow();
    showNotification(`Accès QZ payé : ${formatInteger(totalCost)} Alliages hybrides`, 3, "info");
    addGameLog(`Entrée QZ · -${formatInteger(totalCost)} Alliages hybrides`, "info");
    ptl.pendingResourceCost = 0;
    ptl.pendingEscortCount = 0;
  }
  const totalPortalCreditCost = confirmedEntryCost + shortcutCreditCost;
  if (totalPortalCreditCost > 0 && player.credits < totalPortalCreditCost) {
    showToast(`Passage refusé — ${formatInteger(totalPortalCreditCost)} crédits requis`, 1.8);
    return false;
  }
  if (shortcutCreditCost > 0 && !entryConfirmed && !isShortcutTaxConfirmationHidden()) {
    return requestShortcutTaxConfirmation(ptl, shortcutCreditCost);
  }
  if (entryCost > 0 && !entryConfirmed) {
    return requestPortalEntryConfirmation(ptl, entryCost);
  }

  const gateId = String(ptl.toMap || "").toLowerCase();
  if (GALAXY_GATE_DEFINITIONS[gateId]) {
    const user = account.user || getCurrentUserFull();
    const factionHomeMap = getFactionHomeMap(user?.faction);
    if (String(window.__CURRENT_MAP_ID__ || "").toLowerCase() !== factionHomeMap) {
      showToast(`Cette Galaxy Gate est uniquement accessible depuis ta base mère ${factionHomeMap}`, 1.8);
      return false;
    }
    const access = consumeCurrentUserGalaxyGate(gateId);
    if (!access.ok) {
      showToast("Cette Galaxy Gate doit d'abord être construite dans le Spinner", 1.8);
      return false;
    }
    account.user = access.user;
    renderGalaxyGateWindow(`${GALAXY_GATE_DEFINITIONS[gateId].name} activée`);
  }

  if (entryCost > 0) {
    player.credits -= confirmedEntryCost;
    if (ptl.maxEscorts > 0) {
      try { sessionStorage.setItem(`orbit_gate_escorts_${gateId}`, String(Math.max(0, Number(ptl.pendingEscortCount) || 0))); } catch {}
    }
    if (account.user) account.user.credits = player.credits;
    markProgressDirty();
    saveProgressNow();
    showNotification(`Droit d'entrée acquitté : ${formatInteger(confirmedEntryCost)} crédits`, 3, "info");
    addGameLog(`Entrée ${String(ptl.toMap || "Gate").toUpperCase()} · -${formatInteger(confirmedEntryCost)} crédits`, "info");
    ptl.pendingEntryCost = 0;
    ptl.pendingEscortCount = 0;
  }

  if (shortcutCreditCost > 0) {
    player.credits -= shortcutCreditCost;
    if (account.user) account.user.credits = player.credits;
    markProgressDirty();
    saveProgressNow();
    showNotification(`Taxe du raccourci acquittée : ${formatInteger(shortcutCreditCost)} crédits`, 3, "info");
    addGameLog(`Raccourci vers ${String(ptl.toMap || "secteur").toUpperCase()} · -${formatInteger(shortcutCreditCost)} crédits`, "info");
  }

  // ✅ on mémorise l'état visuel actuel du portail
  // comme ça le jump part de l'état open sans cassure
  ptl.jumpBaseFade = Math.max(0, getPortalOpenFade(ptl));

  ptl.jumping = true;
  ptl.jumpT = 0;
  ptl.jumpDur = Math.max(0.1, Number(ptl.jumpDur ?? 2));

  ptl.jumpMap = ptl.toMap;
  ptl.jumpPortal = ptl.toPortal;
  ptl.jumpTargetReady = false;
  ptl.jumpTargetPromise = Promise.resolve(
    window.__PRELOAD_MAP__?.(ptl.jumpMap, ptl.jumpPortal)
  ).catch((error) => {
    console.warn("Préchargement de la prochaine carte incomplet:", error);
  }).finally(() => {
    ptl.jumpTargetReady = true;
  });

  // ✅ transition open -> jump
  ptl.jumpSwitching = true;
  ptl.jumpSwitchT = 0;
  ptl.jumpSwitchDur = Math.max(0.1, Number(ptl.jumpSwitchDur || portal.switchDur || 1));

  // ✅ surtout on coupe la fermeture / ouverture normale
  ptl.open = true;
  ptl.switching = false;
  ptl.holding = false;
  ptl.closing = false;
  ptl.switchT = 0;
  ptl.holdT = 0;
  ptl.closeT = 0;

  // ✅ le joueur peut quitter le portail, le jump continue quand même
  mapPortalLock = Math.max(mapPortalLock, ptl.jumpDur + 0.25);

  const destinationMap = String(ptl.jumpMap || ptl.toMap || "inconnue");
  showNotification(`Saut en cours vers la carte ${destinationMap}`, ptl.jumpDur, "info", { goldTerms: [destinationMap] });
  return true;
}

function finishZonePortalJump(ptl) {
  if (!ptl || ptl.jumpSwitchPending) return;

  const toMap = ptl.jumpMap ?? ptl.toMap;
  const toPortal = ptl.jumpPortal ?? ptl.toPortal;
  ptl.jumpSwitchPending = true;

  if (typeof window.__SWITCH_MAP__ === "function") {
    window.__SWITCH_MAP__(toMap, toPortal).catch((error) => {
      console.error("Changement interne impossible:", error);
      ptl.jumpSwitchPending = false;
      window.__GO_TO_MAP__?.(toMap, toPortal);
    });
    return;
  }

  ptl.jumpSwitchPending = false;
  window.__GO_TO_MAP__?.(toMap, toPortal);
}

function tickZonePortalJumps(dt) {
  if (!isZoneMap || !started || player.dead || !zonePortals.length) return false;

  for (const ptl of zonePortals) {
    if (!ptl.jumping) continue;

    ptl.jumpT += dt;

    if (ptl.jumpT >= Math.max(0.1, Number(ptl.jumpDur || 2))) {
      if (!ptl.jumpTargetReady) continue;
      finishZonePortalJump(ptl);
      return true;
    }
  }

  return false;
}

// ✅ précharge tous les backgrounds
for (const L of BG_LAYERS) {
  if (L?.src) loadImage(L.src, { priority: true });
}

// ============================================================
// State
// ============================================================
let started = false;
let betweenWaves = false;

// ✅ Idle sway (balancement à l'arrêt)
let idleSway = 0;

// ============================================================
// ✅ Account / Progress
// ============================================================
const account = {
  user: null,
  dirty: false,
  saveCd: 0,
};
let questState = normalizeQuestState(getCurrentUserFull()?.quests);

function loadAccountUser() {
  const previousId = account.user?.id || null;
  account.user = getCurrentUserFull();

  // Le module est initialisé avant la connexion. Dans ce cas, questState
  // contient encore l'état vide issu de l'utilisateur anonyme : resynchronise
  // une seule fois avec l'état réellement persisté du compte connecté.
  const currentId = account.user?.id || null;
  if (currentId && currentId !== previousId) {
    questState = normalizeQuestState(account.user.quests);
    selectedQuestId = null;
    selectedQuestOfferId = null;
  }
  return account.user;
}

function markProgressDirty() {
  account.dirty = true;
  account.saveCd = 0.35;
}

let progressSaveIdleHandle = 0;
function scheduleProgressSave() {
  if (progressSaveIdleHandle) return;
  const persist = () => {
    progressSaveIdleHandle = 0;
    if (account.user && account.dirty) saveProgressNow();
  };
  if (typeof requestIdleCallback === "function") {
    progressSaveIdleHandle = requestIdleCallback(persist, { timeout: 1200 });
  } else {
    progressSaveIdleHandle = setTimeout(persist, 0);
  }
}

function awardExperience(amount, source = "") {
  if (!account.user) loadAccountUser();
  if (!account.user) return null;
  account.user.stats ||= { honor: 0, exp: 0, rankPoints: 0 };
  const formationBonus = source === "npc" ? Number(getActiveDroneFormation(account.user).effects?.npcXpPct || 0) : 0;
  const result = grantExperience(account.user.stats, Number(amount || 0) * (1 + formationBonus / 100));
  if (result.gained <= 0) return result;
  for (const drone of account.user.drones?.items || []) {
    const previousLevel = Math.max(1, Number(drone.level) || getDroneLevel(drone.exp));
    drone.exp = Math.max(0, Number(drone.exp) || 0) + result.gained * DRONE_XP_SHARE;
    drone.level = getDroneLevel(drone.exp);
    if (drone.level > previousLevel) queueDroneLevelTransition(drone.id, previousLevel, drone.level);
  }
  markProgressDirty();
  if (result.leveledUp) {
    showToast(`Niveau ${result.after.level} atteint !`, 2.6);
  } else if (source === "quest") {
    showToast(`+${formatInteger(result.gained)} XP`, 1.8);
  }
  return result;
}

function awardHonor(amount) {
  if (!account.user) loadAccountUser();
  if (!account.user) return null;
  account.user.stats ||= { honor: 0, exp: 0, rankPoints: 0, lifetimeKills: 0 };
  const previousRank = getRankInfo(account.user.stats.rankPoints, account.user.stats.honor);
  const formationBonus = Number(getActiveDroneFormation(account.user).effects?.honorPct || 0);
  const result = grantHonor(account.user.stats, Number(amount || 0) * Math.max(0, 1 + formationBonus / 100));
  account.user.stats.rankPoints = calculateRankPoints(account.user.stats);
  const nextRank = getRankInfo(account.user.stats.rankPoints, account.user.stats.honor);
  if (result.gained > 0) markProgressDirty();
  if (nextRank.index > previousRank.index) showToast(`Nouveau grade : ${nextRank.name}`, 2.6);
  return result;
}

let selectedQuestId = null;
let lastQuestTerminalAccess = null;

function hasQuestTerminalAccess() {
  return (zoneSafe?.modules || []).some(module =>
    isQuestModule(module) && isPlayerNearQuestModule(module)
  );
}

function renderQuestWindow() {
  if (!ui.questList) return;
  // Rattrape le cas où le moteur a été instancié avant la session utilisateur
  // (refresh/login) et aurait conservé un journal vide en mémoire.
  {
    const persisted = (account.user || getCurrentUserFull())?.quests;
    const memoryIds = Object.keys(questState.active).sort().join("|");
    const savedState = persisted && normalizeQuestState(persisted);
    const savedIds = savedState ? Object.keys(savedState.active).sort().join("|") : "";
    // Après un refresh, le moteur peut avoir un ancien jeu de missions en
    // mémoire. Les identifiants persistés font foi ; la progression en cours
    // est conservée tant que le même jeu de missions est affiché.
    if (savedState && savedIds !== memoryIds) questState = savedState;
  }
  const view = buildQuestJournalView(questState, selectedQuestId);
  selectedQuestId = view.selectedQuestId;
  if (ui.questIntro) ui.questIntro.textContent = view.intro;
  if (ui.questTabs) ui.questTabs.innerHTML = view.tabsHtml;
  ui.questList.innerHTML = view.contentHtml;
  fitQuestWindowToContent();
}

let questWindowFitFrame = 0;
function fitQuestWindowToContent() {
  const questWindow = document.getElementById("questWindow");
  if (!questWindow || questWindow.style.display === "none") return;
  cancelAnimationFrame(questWindowFitFrame);
  questWindowFitFrame = requestAnimationFrame(() => {
    if (questWindow.style.display === "none") return;
    const bar = questWindow.querySelector(":scope > .gameWinBar");
    const intro = questWindow.querySelector("#questIntro");
    const tabs = questWindow.querySelector("#questTabs");
    const list = questWindow.querySelector("#questList");
    if (!list) return;

    list.style.overflowY = "visible";
    list.style.flex = "0 0 auto";
    const chromeHeight = (bar?.offsetHeight || 30) + (intro?.offsetHeight || 0) + (tabs?.offsetHeight || 0);
    const desiredHeight = chromeHeight + list.scrollHeight + 2;
    const top = Math.max(8, questWindow.getBoundingClientRect().top || 8);
    const availableHeight = Math.max(180, window.innerHeight - top - 12);
    const nextHeight = Math.min(desiredHeight, availableHeight);
    const heightValue = `${Math.ceil(nextHeight)}px`;
    const overflowValue = desiredHeight > availableHeight + 1 ? "auto" : "visible";
    const flexValue = overflowValue === "auto" ? "1 1 auto" : "0 0 auto";
    if (questWindow.style.height !== heightValue) questWindow.style.height = heightValue;
    if (list.style.overflowY !== overflowValue) list.style.overflowY = overflowValue;
    if (list.style.flex !== flexValue) list.style.flex = flexValue;
  });
}

window.addEventListener("resize", fitQuestWindowToContent);
const questWindowElement = document.getElementById("questWindow");
if (questWindowElement) {
  new MutationObserver(() => {
    if (questWindowElement.style.display !== "none") fitQuestWindowToContent();
  }).observe(questWindowElement, { attributes: true, attributeFilter: ["class", "style"] });
}

let selectedQuestOfferId = null;
let questNpcLocations = {};

function renderQuestTerminal() {
  if (!ui.questOfferDetail || !ui.questOfferList) return;
  const hasAccess = hasQuestTerminalAccess();
  lastQuestTerminalAccess = hasAccess;
  const view = buildQuestTerminalView({
    questState,
    selectedId: selectedQuestOfferId,
    hasAccess,
    collectables: COLLECTABLE_DEFS,
    npcTypes: NPC_TYPES,
    npcLocations: questNpcLocations,
  });
  selectedQuestOfferId = view.selectedQuestId;
  ui.questOfferList.innerHTML = view.listHtml;
  ui.questOfferDetail.innerHTML = view.detailHtml;
}

loadNpcLocationIndex().then(locations => {
  questNpcLocations = locations;
  renderQuestTerminal();
});

function openQuestTerminal() {
  renderQuestTerminal();
  window.GameWindowManager?.restore("questOfferWindow");
}

ui.questOfferList?.addEventListener("click", event => {
  const offer = event.target.closest("[data-quest-offer]");
  if (!offer) return;
  selectedQuestOfferId = offer.dataset.questOffer;
  renderQuestTerminal();
});

ui.questOfferDetail?.addEventListener("click", event => {
  const button = event.target.closest("[data-quest-terminal-accept]");
  if (!button) return;
  if (!hasQuestTerminalAccess()) {
    showToast("Rapproche-toi du bâtiment de quêtes", 1.5);
  } else if (acceptQuest(questState, button.dataset.questTerminalAccept)) {
    selectedQuestId = button.dataset.questTerminalAccept;
    markProgressDirty();
    saveProgressNow();
    showToast("Mission acceptée", 1.3);
    advanceQuestProgress("visit", String(window.__CURRENT_MAP_ID__ || "").toLowerCase());
  }
  renderQuestWindow();
  renderQuestTerminal();
});

function advanceQuestProgress(kind, type) {
  const advanced = recordQuestProgress(questState, kind, type, 1, {
    map: String(window.__CURRENT_MAP_ID__ || "").toLowerCase(),
  });
  if (!advanced.length) return;
  markProgressDirty();
  const questVisible = ui.questWindow
    && ui.questWindow.style.display !== "none"
    && !ui.questWindow.classList.contains("gameWinMinimized");
  if (questVisible) renderQuestWindow();

  for (const id of advanced) {
    const quest = QUEST_DEFINITIONS.find(item => item.id === id);
    if (quest && isQuestComplete(questState, quest)) {
      showToast(`Mission accomplie : ${quest.title}`, 2);
    }
  }
}

ui.questTabs?.addEventListener("click", event => {
  const tab = event.target.closest("[data-quest-tab]");
  if (!tab) return;
  selectedQuestId = tab.dataset.questTab;
  renderQuestWindow();
});

ui.questList?.addEventListener("click", event => {
  const button = event.target.closest("[data-quest-action]");
  if (!button) return;
  const questId = button.dataset.questId;

  if (button.dataset.questAction === "abandon") {
    if (button.dataset.abandonConfirmed !== "true") {
      button.dataset.abandonConfirmed = "true";
      button.classList.add("questCancelConfirm");
      button.textContent = "Confirmer l’abandon";
      window.setTimeout(() => {
        if (!button.isConnected || button.dataset.abandonConfirmed !== "true") return;
        delete button.dataset.abandonConfirmed;
        button.classList.remove("questCancelConfirm");
        button.textContent = "Abandonner la mission";
      }, 4000);
      return;
    }

    if (abandonQuest(questState, questId)) {
      selectedQuestId = null;
      markProgressDirty();
      saveProgressNow();
      showToast("Mission abandonnée — progression perdue", 1.7);
    }
  }

  if (button.dataset.questAction === "claim") {
    const reward = claimQuest(questState, questId);
    if (reward) {
      const quest = QUEST_DEFINITIONS.find(item => item.id === questId);
      player.credits += Math.max(0, Number(reward.credits || 0));
      const ammoRewards = Object.entries(reward.ammo || {}).filter(([type, amount]) => Object.hasOwn(player.ammo, type) && Number(amount) > 0);
      for (const [type, amount] of ammoRewards) player.ammo[type] += Math.max(0, Math.floor(Number(amount) || 0));
      if (ammoRewards.length) updateAmmoUI();
      const experience = getQuestExperienceReward(quest);
      const honor = getQuestHonorReward(quest);
      awardExperience(experience);
      awardHonor(honor);
      if (account.user?.stats) account.user.stats.rankPoints = calculateRankPoints(account.user.stats);
      markProgressDirty();
      saveProgressNow();
      const galaxyEnergy = Math.max(0, Math.floor(Number(reward.galaxyEnergy) || 0));
      if (galaxyEnergy > 0) {
        const energyResult = grantCurrentUserGalaxyEnergy(galaxyEnergy);
        if (energyResult.ok) {
          account.user = energyResult.user;
          renderGalaxyGateWindow();
        }
      }
      const ammoMessages = ammoRewards.map(([type, amount]) => `Vous avez reçu ${formatInteger(amount)} munitions ${type === "x6" ? "RSB-75" : type.toUpperCase()}`);
      const energyMessage = galaxyEnergy > 0 ? `Vous avez reçu ${formatInteger(galaxyEnergy)} énergies pour les portails intergalactiques (GG)` : "";
      addGameLog(`Mission ${quest?.title || questId} · +${formatInteger(reward.credits)} crédits · +${formatInteger(experience)} XP · +${formatInteger(honor)} honneur${ammoMessages.length ? ` · ${ammoMessages.join(" · ")}` : ""}${energyMessage ? ` · ${energyMessage}` : ""}`, "reward");
      showNotificationGroup([
        `Vous avez reçu ${formatInteger(reward.credits)} crédits`,
        `Vous avez gagné ${formatInteger(experience)} XP`,
        `Vous avez gagné ${formatInteger(honor)} honneur`,
        ...ammoMessages,
        ...(energyMessage ? [energyMessage] : []),
      ]);
    }
  }

  renderQuestWindow();
  renderQuestTerminal();
});

function saveProgressNow() {
  // Les missions peuvent être acceptées depuis le terminal avant que la
  // boucle de jeu ait initialisé `account.user`. Recharge alors le compte
  // directement afin de ne jamais perdre la sauvegarde des quêtes.
  if (!account.user) account.user = getCurrentUserFull();
  if (!account.user) return;
  
  const currentMap = window.__CURRENT_MAP_ID__ || "1-1";
  const result = updateCurrentUserProgress({
  credits: player.credits,
  quests: questState,
  stats: { ...(account.user.stats || {}) },
  inventory: { resources: { ...(account.user.inventory?.resources || {}) } },
  drones: account.user.drones,
  hangarState: !player.dead && started ? {
    id: SESSION_HANGAR_ID || null,
    x: player.x,
    y: player.y,
    mapId: currentMap,
  } : null,

  // ⚠️ Ne pas sauvegarder ship ici non plus.
  ammo: {
    x1: Infinity,
    x2: player.ammo.x2 || 0,
    x3: player.ammo.x3 || 0,
    x4: player.ammo.x4 || 0,
    sab: player.ammo.sab || 0,
    x6: player.ammo.x6 || 0,
  },
});
  if (result?.ok && result.user) account.user = result.user;
  account.dirty = false;
  window.dispatchEvent(new CustomEvent("orbit:profile-progress"));
}

// Commandes locales de développement : elles modifient l'état chargé et la
// sauvegarde en même temps, contrairement à une écriture directe localStorage.
window.giveHybridAlloy = function giveHybridAlloy(amount = 100) {
  if (!account.user) loadAccountUser();
  if (!account.user) throw new Error("Aucun pilote connecté.");
  const gained = Math.max(0, Math.floor(Number(amount) || 0));
  account.user.inventory ||= {};
  account.user.inventory.resources ||= {};
  const resources = account.user.inventory.resources;
  resources.hybrid_alloy = Math.max(0, Math.floor(Number(resources.hybrid_alloy) || 0)) + gained;
  markProgressDirty();
  saveProgressNow();
  showNotification(`Vous avez reçu ${formatInteger(gained)} Alliages hybrides`, 3, "reward");
  return resources.hybrid_alloy;
};

function savePositionNow() {
  if (!account.user) return;
  if (player.dead || !started) return;
  
  const currentMap = window.__CURRENT_MAP_ID__ || "1-1";
  if (SESSION_HANGAR_ID) {
    saveHangarStateById(SESSION_HANGAR_ID, player.x, player.y, currentMap);
  } else {
    saveActiveHangarState(player.x, player.y, currentMap);
  }
}

// ============================================================
// ✅ Configuration 1 / 2 + niveau
// ============================================================
const CONFIG_SWITCH = {
  cooldownMs: 5000,
  until: 0,
};

// ✅ Bouclier séparé par configuration
// HP = partagé entre les configs
// Shield = chaque config garde sa propre valeur
const CONFIG_SHIELDS = {
  "1": null,
  "2": null,
};

function normalizeConfigNo(configNo) {
  return Number(configNo) === 2 ? "2" : "1";
}

function saveShieldForConfig(configNo = getActiveConfigNo()) {
  const cfg = normalizeConfigNo(configNo);

  CONFIG_SHIELDS[cfg] = {
    sh: Math.max(0, Math.min(player.shMax || 0, Number(player.sh || 0))),
    shMax: Math.max(0, Number(player.shMax) || 0),
  };
}

function restoreShieldForConfig(configNo) {
  const cfg = normalizeConfigNo(configNo);
  const saved = CONFIG_SHIELDS[cfg];

  // Première fois qu'on va sur cette config : bouclier plein
  if (!saved) {
    player.sh = player.shMax;
    return;
  }

  // On restaure la valeur absolue, sans dépasser le nouveau max
  player.sh = Math.max(0, Math.min(player.shMax, Number(saved.sh || 0)));
}

function getActiveConfigNo() {
  const h = getActiveHangarFromUser(account.user);
  return Number(h?.activeConfig) === 2 ? 2 : 1;
}

function getSpeedBreakdown() {
  const u = account.user || getCurrentUserFull();
  const hangar = getActiveHangarFromUser(u);
  const shipId = u?.ship || ACTIVE_SHIP?.id || "PhoenixBleu";
  const pack = getShipPackById(shipId);

  const activeConfig = Number(hangar?.activeConfig) === 2 ? "2" : "1";

  const fit =
    hangar?.fits?.[activeConfig] ||
    hangar?.fit ||
    { gens: [], shipMods: [] };

  const base = Math.max(0, Number(pack?.speed || 0));

  let genSpeed = 0;
  const speedItems = [];

  for (const itemId of fit.gens || []) {
    if (!itemId) continue;

    const it = findCatalogItem(itemId);
    if (it?.module?.type !== "speed") continue;

    const bonus = Number(it.module.bonusSpeed || 0);
    genSpeed += bonus;

    speedItems.push({
      id: itemId,
      name: it.name || itemId,
      bonus,
    });
  }

  let speedPct = 0;
  const speedModules = [];

  const shipModules = Array.isArray(u?.inventory?.shipModules)
    ? u.inventory.shipModules
    : [];

  for (const modId of fit.shipMods || []) {
    if (!modId) continue;

    const mod = shipModules.find((m) => m?.id === modId);
    if (!mod) continue;

    for (const b of mod.bonuses || []) {
      if (b.stat !== "speed") continue;

      const pct = Number(b.pct || 0);
      speedPct += pct;

      speedModules.push({
        id: mod.id,
        type: mod.type,
        tier: mod.tier,
        pct,
      });
    }
  }

  speedPct += Number(getActiveDroneFormation(u).effects?.speedPct || 0);
  const total = Math.floor((base + genSpeed) * (1 + speedPct / 100));

  return {
    shipId,
    config: Number(activeConfig),
    base,
    genSpeed,
    speedPct,
    total,
    speedItems,
    speedModules,
  };
}

function getConfigCooldownLeft() {
  return Math.max(0, (CONFIG_SWITCH.until - Date.now()) / 1000);
}

function applyCurrentConfigStats(keepRatios = true, restoreShieldConfigNo = null) {
  const u = loadAccountUser();
  if (!u) return false;

  const shipId = u.ship || ACTIVE_SHIP?.id || "PhoenixBleu";
  const pack = getShipPackById(shipId);
  ACTIVE_SHIP = pack;

  const hangar = getActiveHangarFromUser(u);
  const stats = computeHangarStats(hangar, u);
  player.dr = clamp(BASE_RUN.dr + Number(stats.formationEffects?.shieldAbsorptionPct || 0) / 100, 0, 1);

  // ✅ HP partagé entre les configs
  const oldHpPct =
    keepRatios && player.hpMax > 0
      ? clamp(player.hp / player.hpMax, 0, 1)
      : 1;

  // Ancien comportement utilisé seulement hors changement de config
  const oldShPct =
    keepRatios && player.shMax > 0
      ? clamp(player.sh / player.shMax, 0, 1)
      : 1;

  player.shPen = BASE_RUN.shPen + ((stats.bonusPenetrationPct || 0) / 100);

  const shipBaseHP = Number(pack?.hp || 1);
  player.hpMax = Math.max(
    1,
    Math.floor(shipBaseHP * (1 + (stats.bonusHPPct || 0) / 100))
  );

  player.shMax = Math.max(0, Math.floor(Number(stats.bonusShield) || 0));

  if (!player.dead) {
    // ✅ HP reste partagé
    player.hp = Math.max(1, Math.floor(player.hpMax * oldHpPct));

    // ✅ Si on change de config : on restaure le bouclier de CETTE config
    if (restoreShieldConfigNo !== null) {
      restoreShieldForConfig(restoreShieldConfigNo);
    } else {
      player.sh = Math.max(0, Math.floor(player.shMax * oldShPct));
    }
  }

  player.baseDamage = Math.max(1, Math.floor(stats.totalLaserDamage || 1));

  const shipBaseSpeed = Number(pack?.speed || 0);
  player.baseSpeed = Math.max(
    10,
    Math.floor(shipBaseSpeed + (stats.bonusSpeed || 0))
  );

  player.accel = BASE_RUN.accel;
  player.friction = BASE_RUN.friction;

  return true;
}

function updateConfigButtons() {
  const active = getActiveConfigNo();
  const left = getConfigCooldownLeft();

  if (ui.cfg1Btn) {
    setHudClass(ui.cfg1Btn, "active", active === 1);
    setHudDisabled(ui.cfg1Btn, left > 0 || active === 1 || player.dead);
  }

  if (ui.cfg2Btn) {
    setHudClass(ui.cfg2Btn, "active", active === 2);
    setHudDisabled(ui.cfg2Btn, left > 0 || active === 2 || player.dead);
  }

  setHudText(ui.cfgCooldownTxt, left > 0 ? `${left.toFixed(1)}s` : "");
}

function trySwitchConfig(nextConfig) {
  if (player.dead) return;

  const current = getActiveConfigNo();
  nextConfig = Number(nextConfig) === 2 ? 2 : 1;

  if (current === nextConfig) return;

  const left = getConfigCooldownLeft();
  if (left > 0) {
    showToast(`Configuration en recharge: ${left.toFixed(1)}s`, 1.1);
    return;
  }

// ✅ sauvegarde le bouclier de la config actuelle avant de changer
saveShieldForConfig(current);

saveProgressNow();

const hangarId = SESSION_HANGAR_ID || getActiveHangarId();
const out = setActiveHangarConfig(hangarId, nextConfig);

  if (!out?.ok) {
    showToast(out?.error || "Impossible de changer de configuration", 1.5);
    return;
  }

  account.user = getCurrentUserFull();

  applyCurrentConfigStats(true, nextConfig);

  CONFIG_SWITCH.until = Date.now() + CONFIG_SWITCH.cooldownMs;

  updateConfigButtons();
  drawUI();

  showToast(`Configuration ${nextConfig} activée`, 1.1);
}

ui.cfg1Btn?.addEventListener("click", () => trySwitchConfig(1));
ui.cfg2Btn?.addEventListener("click", () => trySwitchConfig(2));

function syncPlayerFromAccount() {
  const fresh = getCurrentUserFull();
  if (!fresh) return false;

  account.user = fresh;
  // Synchronise aussi le journal des missions lors d'un refresh ou d'une
  // reconnexion (le moteur peut avoir été créé avant le compte).
  questState = normalizeQuestState(fresh.quests);
  if (!questState.active[selectedQuestId]) {
    selectedQuestId = Object.keys(questState.active)[0] || null;
  }

  // ✅ crédits toujours synchronisés avec le compte
  player.credits = Math.max(0, Number(fresh.credits || 0));

  // ✅ munitions synchronisées aussi si achat en boutique profil
  const a = fresh.ammo || {};
  const active = player.ammo?.active || "x1";

  player.ammo = {
    ...player.ammo,
    active,
    x1: Infinity,
    x2: Math.max(0, Number(a.x2 || 0)),
    x3: Math.max(0, Number(a.x3 || 0)),
    x4: Math.max(0, Number(a.x4 || 0)),
    x6: Math.max(0, Number(a.x6 || 0)),
    sab: Math.max(0, Number(a.sab || 0)),
  };

  if (player.ammo.active !== "x1" && ammoCount(player.ammo.active) <= 0) {
    player.ammo.active = "x1";
  }

  updateAmmoUI();
  drawUI();

  account.dirty = false;
  account.saveCd = 0;

  return true;
}

window.HyperionGameSync = {
  saveNow() {
    saveProgressNow();
    return true;
  },

  syncFromAccount() {
    return syncPlayerFromAccount();
  },

  getCredits() {
    return player.credits;
  },
};

const portal = {
  active: false,
  x: 0,
  y: 0,
  switching: false,
  switchT: 0,
  switchDur: 1,
  holdDur: 1.5,
  open: false,
  holding: false,
  holdT: 0,
  startAfterSwitch: false,
};
const gateReturnPortal = createGatePortalState();

function getInteractivePortals() {
  return isZoneMap
    ? (zonePortals || []).filter(isZonePortalAvailable)
    : (betweenWaves ? [portal, gateReturnPortal].filter(ptl => ptl.active) : []);
}

function isZonePortalAvailable(ptl) {
  const gateId = String(ptl?.toMap || "").toLowerCase();
  if (!GALAXY_GATE_DEFINITIONS[gateId]) return true;
  const user = account.user || getCurrentUserFull();
  const factionHomeMap = getFactionHomeMap(user?.faction);
  if (String(window.__CURRENT_MAP_ID__ || "").toLowerCase() !== factionHomeMap) return false;
  const state = user?.galaxyGates;
  return state?.active === gateId || state?.deployed?.[gateId] === true;
}

function getGateReturnMap() {
  const homeMap = getFactionHomeMap((account.user || getCurrentUserFull())?.faction);
  return resolveGateReturnMap(window.__CURRENT_MAP_ID__, homeMap);
}

let toast = null;
let startHintT = 0;
const sessionGameLog = [];
const GAME_LOG_PAGE_SIZE = 100;
let gameLogPage = 0;
let gameLogQuery = "";
let gameLogRenderToken = 0;
let gameLogSearchTimer = 0;

function getGameLogUserId() {
  return String(account.user?.id || getCurrentUserFull()?.id || "");
}

function formatGameLogDate(timestamp) {
  return new Date(timestamp).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

async function renderGameLog() {
  if (!ui.gameLogEntries) return;
  const token = ++gameLogRenderToken;
  const userId = getGameLogUserId();
  let result;
  try {
    result = await readGameLogs(userId, { query: gameLogQuery, page: gameLogPage, pageSize: GAME_LOG_PAGE_SIZE });
  } catch (error) {
    console.warn("Historique IndexedDB indisponible :", error);
    const filtered = sessionGameLog
      .filter(entry => !gameLogQuery || entry.text.toLocaleLowerCase("fr-FR").includes(gameLogQuery))
      .reverse();
    const offset = gameLogPage * GAME_LOG_PAGE_SIZE;
    result = { entries: filtered.slice(offset, offset + GAME_LOG_PAGE_SIZE), hasNext: filtered.length > offset + GAME_LOG_PAGE_SIZE };
  }
  if (token !== gameLogRenderToken) return;
  ui.gameLogEntries.innerHTML = result.entries.length
    ? result.entries.map(entry => `<div class="gameLogEntry ${escapeHtml(entry.type)}"><time>${formatGameLogDate(entry.timestamp)}</time><span>${escapeHtml(entry.text)}</span></div>`).join("")
    : `<div class="gameLogEmpty">Aucun événement${gameLogQuery ? " correspondant" : ""}.</div>`;
  if (ui.gameLogPage) ui.gameLogPage.textContent = `Page ${gameLogPage + 1}`;
  if (ui.gameLogPrevious) ui.gameLogPrevious.disabled = gameLogPage === 0;
  if (ui.gameLogNext) ui.gameLogNext.disabled = !result.hasNext;
}

function addGameLog(text, type = "info") {
  const value = String(text ?? "").trim();
  if (!value) return;
  const entry = { text: value, type, timestamp: Date.now() };
  sessionGameLog.push(entry);
  if (sessionGameLog.length > 250) sessionGameLog.shift();
  const userId = getGameLogUserId();
  void appendGameLog(userId, entry)
    .then(() => {
      const logVisible = ui.gameLogWindow
        && ui.gameLogWindow.style.display !== "none"
        && !ui.gameLogWindow.classList.contains("gameWinMinimized");
      if (gameLogPage === 0 && logVisible) void renderGameLog();
    })
    .catch(error => {
      console.warn("Écriture du journal impossible :", error);
    });
}

function setNotificationText(node, value, { goldTerms = [] } = {}) {
  const quantityPattern = /(?<![\p{L}\d])[+-]?\d+(?:[ \u00a0\u202f]\d{3})*(?:[.,]\d+)?(?![\p{L}\d])/gu;
  const ranges = [...value.matchAll(quantityPattern)].map(match => [match.index, match.index + match[0].length]);
  const loweredValue = value.toLocaleLowerCase("fr-FR");
  for (const rawTerm of goldTerms) {
    const term = String(rawTerm || "").trim();
    if (!term) continue;
    const loweredTerm = term.toLocaleLowerCase("fr-FR");
    let start = 0;
    while ((start = loweredValue.indexOf(loweredTerm, start)) >= 0) {
      ranges.push([start, start + term.length]);
      start += term.length;
    }
  }
  ranges.sort((a, b) => a[0] - b[0] || b[1] - a[1]);
  const mergedRanges = [];
  for (const range of ranges) {
    const previous = mergedRanges.at(-1);
    if (previous && range[0] <= previous[1]) previous[1] = Math.max(previous[1], range[1]);
    else mergedRanges.push([...range]);
  }
  let cursor = 0;
  for (const [start, end] of mergedRanges) {
    if (start > cursor) node.append(document.createTextNode(value.slice(cursor, start)));
    const amount = document.createElement("span");
    amount.className = "orbitNotificationAmount";
    amount.textContent = value.slice(start, end);
    node.append(amount);
    cursor = end;
  }
  if (cursor < value.length) node.append(document.createTextNode(value.slice(cursor)));
}

const MAX_VISIBLE_NOTIFICATIONS = 8;
const NOTIFICATION_FLOW_STEP_MS = 1200;
const pendingNotifications = [];
let pendingNotificationGroup = null;
let notificationGroupFrame = 0;

function removeNotificationNode(node) {
  if (!node) return;
  clearTimeout(node._leaveTimer);
  clearTimeout(node._removeTimer);
  node.remove();
  pumpNotificationQueue();
}

function mountNotification(spec) {
  if (!ui.orbitNotifications) return;
  const node = document.createElement("div");
  node.className = `orbitNotification ${spec.type}`;
  setNotificationText(node, spec.value, { goldTerms: spec.goldTerms });
  ui.orbitNotifications.appendChild(node);
  node.style.setProperty("--notice-height", `${node.scrollHeight}px`);
  const now = Date.now();
  const baseVisibleMs = Math.max(spec.minVisibleMs, spec.durationMs);
  node.dataset.baseVisibleMs = String(baseVisibleMs);
  const previousNodes = [...ui.orbitNotifications.children].filter(item => item !== node && !item.classList.contains("leaving"));
  const previousLeaveAt = Number(previousNodes.at(-1)?.dataset.leaveAt) || 0;
  const leaveAt = spec.stagger
    ? Math.max(now + NOTIFICATION_FLOW_STEP_MS, previousLeaveAt + NOTIFICATION_FLOW_STEP_MS)
    : now + NOTIFICATION_FLOW_STEP_MS;
  node.dataset.leaveAt = String(leaveAt);
  node._leaveTimer = setTimeout(() => node.classList.add("leaving"), Math.max(0, leaveAt - now));
  node._removeTimer = setTimeout(() => removeNotificationNode(node), Math.max(0, leaveAt - now) + 700);
}

function resetVisibleNotificationFlow() {
  if (!ui.orbitNotifications) return;
  const now = Date.now();
  let previousLeaveAt = 0;
  for (const node of ui.orbitNotifications.children) {
    if (node.classList.contains("leaving")) continue;
    const leaveAt = previousLeaveAt
      ? previousLeaveAt + NOTIFICATION_FLOW_STEP_MS
      : now + NOTIFICATION_FLOW_STEP_MS;
    previousLeaveAt = leaveAt;
    node.dataset.leaveAt = String(leaveAt);
    clearTimeout(node._leaveTimer);
    clearTimeout(node._removeTimer);
    node._leaveTimer = setTimeout(() => node.classList.add("leaving"), Math.max(0, leaveAt - now));
    node._removeTimer = setTimeout(() => removeNotificationNode(node), Math.max(0, leaveAt - now) + 700);
  }
}

function pumpNotificationQueue() {
  if (!ui.orbitNotifications) return;
  while (ui.orbitNotifications.children.length < MAX_VISIBLE_NOTIFICATIONS && pendingNotifications.length) {
    mountNotification(pendingNotifications.shift());
  }
}

function makeRoomForLatestNotification() {
  if (!ui.orbitNotifications || ui.orbitNotifications.children.length < MAX_VISIBLE_NOTIFICATIONS) return;
  if (ui.orbitNotifications.querySelector(".leaving")) return;
  const oldest = [...ui.orbitNotifications.children].find(node => !node.classList.contains("leaving"));
  if (!oldest) return;
  clearTimeout(oldest._leaveTimer);
  clearTimeout(oldest._removeTimer);
  oldest.classList.add("notificationEvicting", "leaving");
  oldest._removeTimer = setTimeout(() => removeNotificationNode(oldest), 700);
}

function flushLatestNotificationGroup() {
  notificationGroupFrame = 0;
  const group = pendingNotificationGroup;
  pendingNotificationGroup = null;
  if (!group?.length || !ui.orbitNotifications) return;
  const activeNodes = [...ui.orbitNotifications.children].filter(node => !node.classList.contains("leaving"));
  const overflow = Math.max(0, activeNodes.length + group.length - MAX_VISIBLE_NOTIFICATIONS);
  if (overflow > 0) {
    pendingNotifications.length = 0;
    for (const node of activeNodes.slice(0, overflow)) {
      clearTimeout(node._leaveTimer);
      clearTimeout(node._removeTimer);
      node.classList.add("leaving", "notificationSuperseded");
      node._removeTimer = setTimeout(() => removeNotificationNode(node), 700);
    }
  }
  for (const spec of group.slice(-MAX_VISIBLE_NOTIFICATIONS)) mountNotification(spec);
  resetVisibleNotificationFlow();
}

function showNotificationGroup(messages, type = "info", { goldTerms = [], minVisibleMs = 3800 } = {}) {
  const values = messages.map(message => String(message ?? "").trim()).filter(Boolean);
  if (!values.length) return;
  pendingNotificationGroup = values.map(value => ({
    value,
    type,
    goldTerms,
    minVisibleMs,
    stagger: true,
    durationMs: 4000,
  }));
  if (!notificationGroupFrame) notificationGroupFrame = requestAnimationFrame(flushLatestNotificationGroup);
}

function showNotification(text, dur = 2, type = "info", { log = true, goldTerms = [], minVisibleMs = 3800, stagger = true } = {}) {
  const value = String(text ?? "").trim();
  if (!value) return;
  if (log) addGameLog(value, type);
  if (!ui.orbitNotifications) return;
  const spec = { value, type, goldTerms, minVisibleMs, stagger, durationMs: Number(dur) * 1000 };
  if (ui.orbitNotifications.children.length >= MAX_VISIBLE_NOTIFICATIONS) {
    pendingNotifications[0] = spec;
    pendingNotifications.length = 1;
    makeRoomForLatestNotification();
  } else {
    mountNotification(spec);
  }
}

function showToast(text, dur = 2) {
  const value = String(text ?? "");
  const type = /insuffisant|impossible|verrouill|erreur|annul/i.test(value) ? "error" : /\+|récompense|reçu|niveau|grade|accomplie/i.test(value) ? "reward" : "info";
  showNotification(value, dur, type);
}

ui.gameLogSearch?.addEventListener("input", () => {
  clearTimeout(gameLogSearchTimer);
  gameLogSearchTimer = setTimeout(() => {
    gameLogQuery = String(ui.gameLogSearch?.value || "").trim().toLocaleLowerCase("fr-FR");
    gameLogPage = 0;
    void renderGameLog();
  }, 180);
});
ui.gameLogPrevious?.addEventListener("click", () => {
  if (gameLogPage <= 0) return;
  gameLogPage -= 1;
  void renderGameLog();
});
ui.gameLogNext?.addEventListener("click", () => {
  gameLogPage += 1;
  void renderGameLog();
});
void renderGameLog();

function showToastFixed(text) {
  const value = String(text ?? "");
  if (toast?.fixed && toast.text === value) {
    toast.exiting = false;
    return;
  }
  toast = { text: value, t: 0, dur: Infinity, fixed: true, alpha: 0, exiting: false };
}

function clearToastFixed() {
  if (toast?.fixed) toast.exiting = true;
}

function setCenterMsg(show, title, body, hint) {
  ui.centerMsg.style.display = show ? "block" : "none";
  if (!show) return;
  ui.centerTitle.textContent = title || "";
  ui.centerBody.innerHTML = body || "";
  ui.centerHint.innerHTML = hint || "";
  ui.centerHint.style.display = hint ? "inline-block" : "none";
}

// ============================================================
// Camera
// ============================================================
const camera = { x: WORLD.w / 2, y: WORLD.h / 2 };

function screenToWorld(sx, sy) {
  return screenToWorldPoint(sx, sy, camera, innerWidth, innerHeight);
}

function worldToScreen(x, y) {
  return worldToScreenPoint(x, y, camera, innerWidth, innerHeight);
}

function isOnScreenWorld(x, y, margin = 120) {
  return isWorldPointVisible(x, y, camera, innerWidth, innerHeight, margin);
}

function pickEnemyAtScreen(sx, sy) {
  const w = screenToWorld(sx, sy);
  let best = null;
  let bestD2 = Infinity;

  for (const e of enemies) {
    if (!e || e.hp <= 0) continue;

    const cfg = NPC_TYPES[e.type] || {};
    const sp = cfg.sprite || null;

    const spW = (sp?.w ?? sp?.size ?? ((e.r || 18) * 2));
    const spH = (sp?.h ?? sp?.size ?? ((e.r || 18) * 2));

    const halfW = spW * 0.5;
    const halfH = spH * 0.5;

    const dx = w.x - e.x;
    const dy = w.y - e.y;

    if (Math.abs(dx) > halfW || Math.abs(dy) > halfH) continue;

    const d2 = dx * dx + dy * dy;
    if (d2 < bestD2) {
      best = e;
      bestD2 = d2;
    }
  }

  return best;
}

// ============================================================
// SFX
// ============================================================
const SFX = createSFX();
SFX.setMasterVolume?.(GAME_SETTINGS.soundVolume / 100);
// ✅ Mute global sans devoir modifier tous les SFX.play du jeu
const _SFX_PLAY = typeof SFX?.play === "function" ? SFX.play.bind(SFX) : null;

if (_SFX_PLAY) {
  SFX.play = (id, opts = {}) => {
    if (!GAME_SETTINGS.sound) return null;
    return _SFX_PLAY(id, opts);
  };
}

// ============================================================
// Bullets sprites
// ============================================================
function preloadPlayerBulletSprites() {
  const jobs = [];
  for (const k in PLAYER_BULLET_SPRITES) {
    const src = PLAYER_BULLET_SPRITES[k]?.src;
    if (src) jobs.push(loadImage(src, { priority: false }));
  }
  return jobs;
}

function drawBulletSprite(x, y, ang, key, side, scale = 1, spriteOverride = null) {
  if (side === "npc") {
    if (spriteOverride && spriteOverride.src) {
      const img = getCachedImage(spriteOverride.src);
      if (isImgReady(img)) {
        const sMul = (spriteOverride.scale || 1) * scale;
        const dw = (spriteOverride.w || img.naturalWidth || img.width || 32) * sMul;
        const dh = (spriteOverride.h || img.naturalHeight || img.height || 16) * sMul;

        ctx.save();
        ctx.translate(x, y);

        let rot = ang + (spriteOverride.rotateOffset || 0);
        if (spriteOverride.invert) rot += Math.PI;

        ctx.rotate(rot);

        const sx = spriteOverride.flipX ? -1 : 1;
        const sy = spriteOverride.flipY ? -1 : 1;
        ctx.scale(sx, sy);

        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);

        if (spriteOverride.glow) {
          ctx.globalAlpha = 0.22;
          ctx.drawImage(img, -dw * 0.7, -dh * 0.7, dw * 1.4, dh * 1.4);
          ctx.globalAlpha = 1;
        }

        ctx.restore();
        return;
      }
    }

    // fallback capsule
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang);
    ctx.imageSmoothingEnabled = false;

    const len = 26 * scale;
    const wid = 8 * scale;
    const r = wid / 2;

    ctx.fillStyle = "rgba(255,170,210,0.90)";
    ctx.beginPath();
    ctx.moveTo(-len / 2 + r, -wid / 2);
    ctx.arcTo(len / 2, -wid / 2, len / 2, wid / 2, r);
    ctx.arcTo(len / 2, wid / 2, -len / 2, wid / 2, r);
    ctx.arcTo(-len / 2, wid / 2, -len / 2, -wid / 2, r);
    ctx.arcTo(-len / 2, -wid / 2, len / 2, -wid / 2, r);
    ctx.closePath();
    ctx.fill();

    ctx.globalAlpha = 0.18;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.restore();
    return;
  }

  key = key && PLAYER_BULLET_SPRITES[key] ? key : "x1";
  const spr = PLAYER_BULLET_SPRITES[key];

  if (spr && spr.src) {
    const img = getCachedImage(spr.src);
    if (isImgReady(img)) {
      const sMul = (spr.scale || 1) * scale;
      const dw = (spr.w || img.naturalWidth || img.width || 32) * sMul;
      const dh = (spr.h || img.naturalHeight || img.height || 16) * sMul;

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(ang + (spr.rotateOffset || 0));
      ctx.imageSmoothingEnabled = false;

      ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);

      if (spr.glow) {
        ctx.globalAlpha = 0.18;
        ctx.drawImage(img, -dw * 0.7, -dh * 0.7, dw * 1.4, dh * 1.4);
        ctx.globalAlpha = 1;
      }
      ctx.restore();
      return;
    }
  }

  // fallback
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = AMMO[key]?.color || "rgba(124,240,255,0.95)";
  ctx.beginPath();
  ctx.arc(0, 0, 4.2 * scale, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// ============================================================
// Ships
// ============================================================
let ACTIVE_SHIP = SHIP_PACKS[0];
let playerImgs = [];
let playerImgsReady = false;

// --- Effet de vaisseau (Ship_effet) superposé par-dessus le vaisseau ---
let shipEffectFor = "";        // id du vaisseau dont l'effet est chargé
let shipEffectImgs = [];       // images chargées de l'effet
let shipEffectReady = false;   // images prêtes à être dessinées
let shipEffectLoading = false; // chargement en cours / déjà tenté pour cet id
const SHIP_EFFECT_FPS = 60;

// Charge (une seule fois par vaisseau) les frames de l'effet correspondant.
// Retourne l'objet { frames, w, h } de l'effet, ou null s'il n'y en a pas.
function loadShipEffect(shipId) {
  const id = shipId || "";
  if (shipEffectFor === id && (shipEffectReady || shipEffectLoading)) return shipEffectInfo();
  shipEffectFor = id;
  shipEffectImgs = [];
  shipEffectReady = false;

  const info = SHIP_EFFECTS[id];
  if (!info) { shipEffectLoading = true; return null; }

  shipEffectLoading = true;
  const promises = [];
  shipEffectImgs = new Array(info.frames);
  for (let i = 0; i < info.frames; i++) {
    const src = `${info.path}${1 + i}.png`;
    promises.push(loadImage(src, { priority: false }).then((img) => (shipEffectImgs[i] = img)));
  }
  Promise.all(promises).then(() => { shipEffectReady = true; shipEffectLoading = false; });
  return info;
}

function shipEffectInfo() {
  return SHIP_EFFECTS[shipEffectFor] || null;
}

// Dessine l'effet superposé par-dessus le vaisseau (boucle à l'infini, 60 fps).
function drawShipEffectOverlay() {
  const info = SHIP_EFFECTS[shipEffectFor];
  if (!info || !shipEffectReady || !shipEffectImgs || !shipEffectImgs.length) return;
  const t = performance.now() / 1000;
  const idx = Math.floor(t * SHIP_EFFECT_FPS) % info.frames;
  const img = shipEffectImgs[idx];
  if (!isImgReady(img)) return;
  ctx.imageSmoothingEnabled = false;
  drawCenteredImage(ctx, img, info.w, info.h);
}

function getPackById(shipId) {
  return SHIP_PACKS.find(p => p?.id === shipId) || null;
}

function getShipBaseStats(shipId) {
  const p = getPackById(shipId);

  const speed = Number(p?.speed);
  const hp = Number(p?.hp);

  return {
    speed: Number.isFinite(speed) ? speed : 450,
    hp: Number.isFinite(hp) ? hp : 256000,
    slots: {
      lasers: Number(p?.slots?.lasers ?? 15),
      gens: Number(p?.slots?.gens ?? 15),
      extras: Number(p?.slots?.extras ?? 15),
    }
  };
}

function ensurePackLoaded(pack) {
  if (pack._promise) return pack._promise;

  pack._imgs = new Array(pack.frames);
  pack._ready = false;

  pack._promise = (async () => {
    const jobs = [];
    for (let i = 0; i < pack.frames; i++) {
      const src = `${pack.path}${pack.firstNumber + i}${pack.ext}`;
      jobs.push(loadImage(src, { priority: false }).then((img) => (pack._imgs[i] = img)));
    }
    await Promise.all(jobs);
    pack._ready = true;
    return pack;
  })();

  return pack._promise;
}

function angleToFrameIndex(angle, frames) {
  if (!frames || frames <= 1) return 0;
  const a = normAng(angle);
  return Math.floor((a / TAU) * frames) % frames;
}

// ============================================================
// Laser pack (frames)
// ============================================================
const LASER_PACK = { 
  path: "Raygun/Raygun2/", 
  frames: 36, 
  firstNumber: 1, 
  ext: ".png", 
  fps: 20, 
  scrollSpeed: 0 
};
let laserImgs = [];
let laserReady = false;

function ensureLaserLoaded() {
  if (LASER_PACK._promise) return LASER_PACK._promise;
  LASER_PACK._imgs = [];

  LASER_PACK._promise = (async () => {
    const jobs = [];
    for (let i = 0; i < LASER_PACK.frames; i++) {
      const src = `${LASER_PACK.path}${LASER_PACK.firstNumber + i}${LASER_PACK.ext}`;
      jobs.push(loadImage(src, { priority: false }).then((img) => { LASER_PACK._imgs[i] = img; }));
    }
    await Promise.all(jobs);
    return true;
  })();

  return LASER_PACK._promise;
}

ensureLaserLoaded().then(() => {
  laserImgs = LASER_PACK._imgs;
  laserReady = true;
});

// ============================================================
// ✅ PULSE/IEM FX (sprites one-shot)
// ============================================================
const PULSE_PACK = {
  path: "assets/pulse/",
  frames: 29,
  firstNumber: 1,
  ext: ".png",
  fps: 30,
  w: 437,
  h: 437,
};

let pulseImgs = [];
let pulseReady = false;

function ensurePulseFxLoaded() {
  if (PULSE_PACK._promise) return PULSE_PACK._promise;

  PULSE_PACK._imgs = new Array(PULSE_PACK.frames);

  PULSE_PACK._promise = (async () => {
    const jobs = [];
    for (let i = 0; i < PULSE_PACK.frames; i++) {
      const src = `${PULSE_PACK.path}${PULSE_PACK.firstNumber + i}${PULSE_PACK.ext}`;
      jobs.push(
        loadImage(src, { priority: false })
          .then((img) => (PULSE_PACK._imgs[i] = img))
          .catch(() => (PULSE_PACK._imgs[i] = null))
      );
    }
    await Promise.all(jobs);
    pulseImgs = PULSE_PACK._imgs;
    pulseReady = true;
    return true;
  })();

  return PULSE_PACK._promise;
}

const pulseFxs = [];

function spawnPulseFx(x, y, scale = 1, followPlayer = false) {
  if (!pulseReady || !pulseImgs?.length) return;
  pushBounded(pulseFxs, {
    x,
    y,
    t: 0,
    scale: Math.max(0.2, Number(scale) || 1),
    followPlayer: followPlayer === true,
  }, ENTITY_LIMITS.pulseFxs);
}

function tickPulseFx(dt) {
  if (!pulseFxs.length) return;
  const fps = PULSE_PACK.fps || 30;
  const frames = PULSE_PACK.frames || pulseImgs.length || 1;
  const dur = frames / fps;

  for (let i = pulseFxs.length - 1; i >= 0; i--) {
    pulseFxs[i].t += dt;
    if (pulseFxs[i].t >= dur) pulseFxs.splice(i, 1);
  }
}

function drawPulseFx(ox, oy) {
  if (!pulseReady || !pulseImgs?.length) return;

  const fps = PULSE_PACK.fps || 30;
  const frames = PULSE_PACK.frames || pulseImgs.length || 1;

  for (const fx of pulseFxs) {
    const idx = Math.min(frames - 1, Math.floor(fx.t * fps));
    const img = pulseImgs[idx];
    if (!isImgReady(img)) continue;

    const x = (fx.followPlayer ? player.x : fx.x) + ox;
    const y = (fx.followPlayer ? player.y : fx.y) + oy;

    const w = (PULSE_PACK.w || (img.naturalWidth || img.width || 256)) * fx.scale;
    const h = (PULSE_PACK.h || (img.naturalHeight || img.height || 256)) * fx.scale;

    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.globalAlpha = 1;
    ctx.drawImage(img, x - w / 2, y - h / 2, w, h);
    ctx.restore();
  }
}

// ============================================================
// ✅ REPAIR ORBIT FX - sprite qui tourne autour du vaisseau
// ============================================================
const DEFAULT_REPAIR_ORBIT_SPR = {
path: "assets/Repair_Robot/",
frames: 10,
firstNumber: 1,
ext: ".png",
fps: 30,

w: 56,
h: 42,
scale: 1,

// ✅ position fixe par rapport au vaisseau
// négatif en X = gauche
// négatif en Y = haut
xOff: -25,
yOff: -25,

// ✅ plus de rotation autour du vaisseau
radius: 0,
orbitSpeed: 0,
spinSpeed: 0,

alpha: 1,
};

const REPAIR_ORBIT_PACK = {
  ...DEFAULT_REPAIR_ORBIT_SPR,
  ...(REPAIR_ORBIT_SPR || {}),
};

let repairOrbitImgs = [];
let repairOrbitReady = false;

const repairOrbitFx = {
  t: 0,
  alpha: 0,
};

function getRepairOrbitFrameSrc(pack, index) {
  if (!pack) return null;

  if (pack.src) return pack.src;

  const first = Number(pack.firstNumber ?? 1);
  const ext = pack.ext || ".png";
  const n = first + index;

  return `${pack.path}${n}${ext}`;
}

function ensureRepairOrbitLoaded() {
  if (REPAIR_ORBIT_PACK._promise) return REPAIR_ORBIT_PACK._promise;

  const frames = Math.max(1, Number(REPAIR_ORBIT_PACK.frames || 1));
  REPAIR_ORBIT_PACK._imgs = new Array(frames);

  REPAIR_ORBIT_PACK._promise = (async () => {
    const jobs = [];

    for (let i = 0; i < frames; i++) {
      const src = getRepairOrbitFrameSrc(REPAIR_ORBIT_PACK, i);
      if (!src) continue;

      jobs.push(
        loadImage(src, { priority: false })
          .then((img) => (REPAIR_ORBIT_PACK._imgs[i] = img))
          .catch(() => (REPAIR_ORBIT_PACK._imgs[i] = null))
      );
    }

    await Promise.all(jobs);

    repairOrbitImgs = REPAIR_ORBIT_PACK._imgs;
    repairOrbitReady = true;

    return true;
  })();

  return REPAIR_ORBIT_PACK._promise;
}

function isRepairingNow() {
  if (!started || player.dead) return false;
  if (player.repairT < REPAIR.cooldown) return false;

  const needHp = player.hp < player.hpMax - 0.5;
  const needSh = player.sh < player.shMax - 0.5;

  return needHp || needSh;
}

function tickRepairOrbitFx(dt) {
  const active = isRepairingNow();

  if (active) {
    repairOrbitFx.t += dt;
    repairOrbitFx.alpha = Math.min(1, repairOrbitFx.alpha + dt * 5);
  } else {
    repairOrbitFx.alpha = Math.max(0, repairOrbitFx.alpha - dt * 8);

    if (repairOrbitFx.alpha <= 0) {
      repairOrbitFx.t = 0;
    }
  }
}

function drawRepairOrbitFxLocal() {
  if (!repairOrbitReady || !repairOrbitImgs?.length) return;
  if (repairOrbitFx.alpha <= 0.01) return;

  const pack = REPAIR_ORBIT_PACK;

  const frames = Math.max(1, Number(pack.frames || repairOrbitImgs.length || 1));
  const fps = Math.max(1, Number(pack.fps || 30));

  const idx = Math.floor(repairOrbitFx.t * fps) % frames;
  const img = repairOrbitImgs[idx];

  if (!isImgReady(img)) return;

const x = Number(pack.xOff ?? -45);
const y = Number(pack.yOff ?? -45);

const spinSpeed = Number(pack.spinSpeed ?? 0);

const w = (pack.w || img.naturalWidth || img.width || 96) * (pack.scale || 1);
const h = (pack.h || img.naturalHeight || img.height || 96) * (pack.scale || 1);

ctx.save();
ctx.translate(x, y);

// ✅ rotation optionnelle du sprite sur lui-même
if (spinSpeed !== 0) {
  ctx.rotate(repairOrbitFx.t * TAU * spinSpeed);
}

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  ctx.globalAlpha *= repairOrbitFx.alpha * Number(pack.alpha ?? 1);

  drawCenteredImage(ctx, img, w, h);

  ctx.restore();
}

// ============================================================
// ✅ EXPLOSION FX (sprites)
// ============================================================
const EXPLOSION_PACK = {
  path: "assets/Boom1/",
  frames: 23,
  firstNumber: 1,
  ext: ".png",
  fps: 30,
  w: 512,
  h: 512,
};

let explosionImgs = [];
let explosionReady = false;

function ensureExplosionLoaded() {
  if (EXPLOSION_PACK._promise) return EXPLOSION_PACK._promise;

  EXPLOSION_PACK._imgs = new Array(EXPLOSION_PACK.frames);

  EXPLOSION_PACK._promise = (async () => {
    const jobs = [];
    for (let i = 0; i < EXPLOSION_PACK.frames; i++) {
      const src = `${EXPLOSION_PACK.path}${EXPLOSION_PACK.firstNumber + i}${EXPLOSION_PACK.ext}`;
      jobs.push(
        loadImage(src, { priority: false })
          .then((img) => (EXPLOSION_PACK._imgs[i] = img))
          .catch(() => (EXPLOSION_PACK._imgs[i] = null))
      );
    }
    await Promise.all(jobs);

    explosionImgs = EXPLOSION_PACK._imgs;
    explosionReady = true;
    return true;
  })();

  return EXPLOSION_PACK._promise;
}

const explosions = [];

function spawnExplosion(x, y, scale = 1) {
  if (!explosionReady || !explosionImgs || !explosionImgs.length) {
    spawnSpark(x, y, true);
    return;
  }

  pushBounded(explosions, {
    x,
    y,
    t: 0,
    scale: Math.max(0.2, Number(scale) || 1),
  }, ENTITY_LIMITS.explosions);
}

function tickExplosions(dt) {
  if (!explosions.length) return;

  const fps = EXPLOSION_PACK.fps || 30;
  const frames = EXPLOSION_PACK.frames || explosionImgs.length || 1;
  const dur = frames / fps;

  for (let i = explosions.length - 1; i >= 0; i--) {
    const ex = explosions[i];
    ex.t += dt;
    if (ex.t >= dur) explosions.splice(i, 1);
  }
}

function drawExplosions(ox, oy) {
  if (!explosionReady || !explosionImgs || !explosionImgs.length) return;

  const fps = EXPLOSION_PACK.fps || 30;
  const frames = EXPLOSION_PACK.frames || explosionImgs.length || 1;

  for (const ex of explosions) {
    const idx = Math.min(frames - 1, Math.floor(ex.t * fps));
    const img = explosionImgs[idx];
    if (!isImgReady(img)) continue;

    const x = ex.x + ox;
    const y = ex.y + oy;

    const w = (EXPLOSION_PACK.w || (img.naturalWidth || img.width || 128)) * ex.scale;
    const h = (EXPLOSION_PACK.h || (img.naturalHeight || img.height || 128)) * ex.scale;

    if (x + w / 2 < 0 || y + h / 2 < 0 || x - w / 2 > innerWidth || y - h / 2 > innerHeight) continue;

    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.globalAlpha = 1;
    ctx.drawImage(img, x - w / 2, y - h / 2, w, h);
    ctx.restore();
  }
}

// ============================================================
// BASE / PLAYER
// ============================================================
const REPAIR = { cooldown: 6.0, ratePct: 0.05, tickInterval: 0.5 };

const BASE_RUN = {
  range: 700,
  credits: 10000000,
  kills: 0,
  dr: 0,
  shPen: 0.2,
  baseFireRate: 2,
  baseBulletSpeed: 4000,
  fireRateMult: 1.0,
  laserDmgMult: 1.0,
  accel: 3200,
  friction: 0.86,
  ammo: { active: "x1", x1: Infinity, x2: 2000, x3: 1000, x4: 500, x6: 10, sab: 2000 },
};

let playerRange = BASE_RUN.range;

const player = {
  x: WORLD.w / 2,
  y: WORLD.h / 2,
  vx: 0,
  vy: 0,
  r: 14,
  angle: 0,
  combatT: 0,
  attackedT: 0,

  hpMax: 0,
  hp: 0,
  shMax: 0,
  sh: 0,

  credits: 0,
  kills: 0,

  dr: 0,
  dead: false,
  iFrames: 0,

  shPen: 0,
  repairT: REPAIR.cooldown,
  repairTickT: 0,

  baseDamage: 0,
  baseFireRate: 0,
  baseBulletSpeed: 0,

  fireRateMult: 1.0,
  laserDmgMult: 1.0,

  baseSpeed: 0,
  accel: 0,
  friction: 0,

  altShot: false,

  ammo: { active: "x1", x1: Infinity, x2: 0, x3: 0, x4: 0, x6: 0, sab: 0 },
};

function getShipPackById(shipId) {
  return SHIP_PACKS.find(p => String(p.id) === String(shipId)) || SHIP_PACKS[0];
}

function getActiveHangarFromUser(u) {
  const hs = Array.isArray(u?.hangars) ? u.hangars : [];
  return hs.find(h => h?.active) || hs[0] || null;
}

function normalizeFit(fit, pack) {
  const slots = pack?.slots || { lasers: 15, gens: 15, extras: 15 };
  const L = Math.max(0, Number(slots.lasers || 0));
  const G = Math.max(0, Number(slots.gens || 0));
  const E = Math.max(0, Number(slots.extras || 0));

  const base = fit || {};
  const lasers = (Array.isArray(base.lasers) ? base.lasers : []).slice(0, L);
  const gens = (Array.isArray(base.gens) ? base.gens : []).slice(0, G);
  const extras = (Array.isArray(base.extras) ? base.extras : []).slice(0, E);

  while (lasers.length < L) lasers.push(null);
  while (gens.length < G) gens.push(null);
  while (extras.length < E) extras.push(null);

  return { lasers, gens, extras, slots: { lasers: L, gens: G, extras: E } };
}

function resetPlayerToBase({ keepCredits = false } = {}) {
  const creditsKeep = player.credits;

  player.dead = false;
  player.iFrames = 1.0;

  const u = loadAccountUser();
  const shipId = (u?.ship || ACTIVE_SHIP?.id || "PhoenixBleu");

  const pack = getShipPackById(shipId);
  ACTIVE_SHIP = pack;

  const hangar = u ? getActiveHangarFromUser(u) : null;
  const fitNorm = normalizeFit(hangar?.fit, pack);

  const stats = computeHangarStats(hangar, u);

  player.dr = BASE_RUN.dr;
  player.dr = clamp(player.dr + Number(stats.formationEffects?.shieldAbsorptionPct || 0) / 100, 0, 1);
  player.shPen = BASE_RUN.shPen + ((stats.bonusPenetrationPct || 0) / 100);

  const shipBaseHP = Number(pack?.hp || 1);
  player.hpMax = Math.max(1, Math.floor(shipBaseHP * (1 + (stats.bonusHPPct || 0) / 100)));
  player.hp = player.hpMax;

  player.shMax = Math.max(0, Math.floor(Number(stats.bonusShield) || 0));
  player.sh = player.shMax;

  player.baseDamage = Math.max(1, Math.floor(stats.totalLaserDamage || 1));

  player.baseFireRate = BASE_RUN.baseFireRate;
  player.baseBulletSpeed = BASE_RUN.baseBulletSpeed;
  player.fireRateMult = BASE_RUN.fireRateMult;
  player.laserDmgMult = BASE_RUN.laserDmgMult;

  const shipBaseSpeed = Number(pack?.speed || 0);
  player.baseSpeed = Math.max(10, Math.floor(shipBaseSpeed + (stats.bonusSpeed || 0)));

player.accel = BASE_RUN.accel;
player.friction = BASE_RUN.friction;

  player.repairT = REPAIR.cooldown;
  player.repairTickT = 0;
  player.altShot = false;

  player.ammo = { ...BASE_RUN.ammo };
  playerRange = BASE_RUN.range;

  if (!keepCredits) player.credits = BASE_RUN.credits;
  else player.credits = creditsKeep;

  player.kills = BASE_RUN.kills;
  player.vx = 0;
  player.vy = 0;

  setAmmo("x1");
  updateAmmoUI();
}

function ammoCount(key) {
  return key === "x1" ? Infinity : player.ammo[key] || 0;
}

function setAmmo(key) {
  if (!AMMO[key]) return;
  if (key !== "x1" && ammoCount(key) <= 0) key = "x1";
  player.ammo.active = key;
  updateAmmoUI();
}

function consumeAmmo(shots) {
  const k = player.ammo.active;
  if (k === "x1") return;
  player.ammo[k] = Math.max(0, (player.ammo[k] || 0) - shots);
  if (player.ammo[k] <= 0) player.ammo.active = "x1";
  updateAmmoUI();
}

function formatAmmoCount(value) {
  if (value === Infinity || value === "Infinity" || value === "∞") {
    return "∞";
  }

  const n = Math.max(0, Math.floor(Number(value) || 0));

  return formatInteger(Math.min(n, 9999999));
}

function updateAmmoUI() {
  const active = player.ammo.active;

  ui.btnX1.classList.toggle("active", active === "x1");
  ui.btnX2.classList.toggle("active", active === "x2");
  ui.btnX3.classList.toggle("active", active === "x3");
  ui.btnX4.classList.toggle("active", active === "x4");
  ui.btnX6.classList.toggle("active", active === "x6");

  if (ui.btnSAB) {
    ui.btnSAB.classList.toggle("active", active === "sab");
  }

  ui.cntX1.textContent = "∞";
  ui.cntX2.textContent = formatAmmoCount(player.ammo.x2);
  ui.cntX3.textContent = formatAmmoCount(player.ammo.x3);
  ui.cntX4.textContent = formatAmmoCount(player.ammo.x4);
  ui.cntX6.textContent = formatAmmoCount(player.ammo.x6);

  if (ui.cntSAB) {
    ui.cntSAB.textContent = formatAmmoCount(player.ammo.sab);
  }

  syncActionDockState();
}

let actionDockCache = null;
let actionDockDirty = true;
let actionDockObserver = null;
const lastDockField = new WeakMap();

function invalidateActionDockCache() {
  actionDockCache = null;
  actionDockDirty = true;
}

function isTextOnlyMutation(records) {
  for (const record of records) {
    if (record.type !== "childList") return false;
    const nodes = [...record.addedNodes, ...record.removedNodes];
    if (nodes.some((node) => node.nodeType !== 3)) return false;
  }
  return true;
}

function ensureActionDockCache() {
  const bar = document.getElementById("ammoBar");
  if (!bar) return null;
  const fresh = { bar, ammo: [], formations: [], skills: [] };
  for (const button of bar.querySelectorAll("[data-ammo]")) {
    fresh.ammo.push({ button, ammo: button.dataset.ammo, small: button.querySelector("small") });
  }
  for (const button of bar.querySelectorAll("[data-action-id^='formation:']")) {
    fresh.formations.push({ button, actionId: button.dataset.actionId });
  }
  for (const button of bar.querySelectorAll("[data-skill]")) {
    fresh.skills.push({ button, skill: button.dataset.skill, small: button.querySelectorAll("small") });
  }
  if (!actionDockObserver && typeof MutationObserver !== "undefined") {
    actionDockObserver = new MutationObserver((records) => {
      if (isTextOnlyMutation(records)) return;
      invalidateActionDockCache();
    });
    actionDockObserver.observe(bar, { childList: true, subtree: true });
  }
  return fresh;
}

function dockFieldCache(button) {
  let byField = lastDockField.get(button);
  if (!byField) {
    byField = new Map();
    lastDockField.set(button, byField);
  }
  return byField;
}

function applyDockField(button, field, value, apply) {
  const byField = dockFieldCache(button);
  if (byField.get(field) === value) return;
  byField.set(field, value);
  apply(value);
}

function syncActionDockState() {
  if (!actionDockCache) {
    if (actionDockDirty) {
      actionDockCache = ensureActionDockCache();
      actionDockDirty = false;
    }
    if (!actionDockCache) return;
  }

  const activeAmmo = player.ammo.active || "x1";

  for (const { button, ammo, small } of actionDockCache.ammo) {
    const value = ammo === "x1" ? "∞" : formatAmmoCount(player.ammo[ammo]);
    applyDockField(button, "active", ammo === activeAmmo,
      (v) => button.classList.toggle("active", v));
    applyDockField(button, "text", value,
      (v) => { if (small) small.textContent = v; });
  }

  const activeFormationId = getActiveDroneFormation(account.user).id;
  for (const { button, actionId } of actionDockCache.formations) {
    applyDockField(button, "active", actionId === `formation:${activeFormationId}`,
      (v) => button.classList.toggle("active", v));
  }

  for (const { button, skill, small } of actionDockCache.skills) {
    if (skill === "pulse") {
      const progress = pulseCd > 0 ? clamp(pulseCd / PULSE_COOLDOWN, 0, 1) : 0;
      const canUse = canUseSkill(PULSE_COST);
      applyDockField(button, "feedback", progress > 0,
        (v) => button.classList.toggle("skillFeedback", v));
      applyDockField(button, "progress", progress.toFixed(3),
        (v) => button.style.setProperty("--skill-feedback", v));
      applyDockField(button, "disabled", !canUse || pulseCd > 0,
        (v) => button.classList.toggle("disabled", v));
      applyDockField(button, "ready", canUse && pulseCd <= 0,
        (v) => button.classList.toggle("ready", v));
      applyDockField(button, "pct", `${getPulsePercent()}%`,
        (v) => { if (small[0]) small[0].textContent = v; });
      applyDockField(button, "cd", pulseCd > 0 ? `${pulseCd.toFixed(1)}s` : "30k",
        (v) => { if (small[1]) small[1].textContent = v; });
    } else if (skill === "repair") {
      applyDockField(button, "active", false,
        (v) => button.classList.remove("active"));
      applyDockField(button, "ready", false,
        (v) => button.classList.remove("ready"));
      applyDockField(button, "feedback", false,
        (v) => button.classList.remove("skillFeedback"));
      applyDockField(button, "disabled", player.dead,
        (v) => button.classList.toggle("disabled", v));
      applyDockField(button, "text", ui.repairTxt ? ui.repairTxt.textContent : "",
        (v) => { if (small[0]) small[0].textContent = v; });
    }
  }
}

ui.btnX1.addEventListener("click", () => startAttack("x1"));
ui.btnX2.addEventListener("click", () => startAttack("x2"));
ui.btnX3.addEventListener("click", () => startAttack("x3"));
ui.btnX4.addEventListener("click", () => startAttack("x4"));
ui.btnX6.addEventListener("click", () => startAttack("x6"));

if (ui.btnSAB) {
  ui.btnSAB.addEventListener("click", () => startAttack("sab"));
}

// ============================================================
// Repair
// ============================================================
function resetRepairCooldown() {
  player.repairT = 0;
  player.repairTickT = 0;
}

function tickRepair(dt) {
  if (player.dead) {
    player.repairTickT = 0;
    return;
  }

  const previousRepairT = player.repairT;
  player.repairT = Math.min(REPAIR.cooldown, player.repairT + dt);
  if (player.repairT < REPAIR.cooldown) return;

  const repairingDt = previousRepairT >= REPAIR.cooldown
    ? dt
    : Math.max(0, dt - (REPAIR.cooldown - previousRepairT));
  player.repairTickT += repairingDt;
  const tickCount = Math.floor((player.repairTickT + 1e-9) / REPAIR.tickInterval);
  if (tickCount <= 0) return;
  player.repairTickT -= tickCount * REPAIR.tickInterval;

  const oldHp = player.hp;
  const oldSh = player.sh;
  player.hp = Math.min(player.hpMax, player.hp + player.hpMax * REPAIR.ratePct * REPAIR.tickInterval * tickCount);
  player.sh = Math.min(player.shMax, player.sh + player.shMax * REPAIR.ratePct * REPAIR.tickInterval * tickCount);

  const hpGain = Math.round(player.hp - oldHp);
  const shGain = Math.round(player.sh - oldSh);
  if (hpGain > 0) {
    addPlayerCombatFloat(hpGain, "rgba(80,255,125,0.98)", "+");
  }
  if (shGain > 0) {
    addPlayerCombatFloat(shGain, "rgba(70,180,255,0.98)", "+");
  }
}

function updateRepairUI() {
  const pct = REPAIR.cooldown <= 0 ? 1 : clamp(player.repairT / REPAIR.cooldown, 0, 1);
  const needs = !player.dead && (player.hp < player.hpMax - 0.01 || player.sh < player.shMax - 0.01);

  const text = player.dead ? "OFF"
    : pct < 1 ? `${Math.floor(pct * 100)}%`
    : needs ? `+${Math.round(REPAIR.ratePct * 100)}%/s` : "OK";
  setHudText(ui.repairTxt, text);

  setHudClass(ui.btnRepair, "active", false);
  setHudClass(ui.btnRepair, "ready", false);
  setHudClass(ui.btnRepair, "disabled", player.dead);
  syncActionDockState();
}

// ============================================================
// Input
// ============================================================
const keyboard = createKeyboardState();
const keys = keyboard.held;
const justPressed = keyboard.pressed;

// ✅ Anti-zoom navigateur
window.addEventListener(
  "wheel",
  (e) => {
    if (e.ctrlKey) {
      e.preventDefault();
    }
  },
  { passive: false }
);

window.addEventListener(
  "keydown",
  (e) => {
    const isZoomKey =
      e.key === "+" ||
      e.key === "-" ||
      e.key === "=" ||
      e.key === "0" ||
      e.code === "NumpadAdd" ||
      e.code === "NumpadSubtract";

    if ((e.ctrlKey || e.metaKey) && isZoomKey) {
      e.preventDefault();
    }
  },
  { passive: false }
);

addEventListener(
  "keydown",
  (e) => {
    // ✅ si on est en train de choisir une nouvelle touche
    if (waitingForBindAction) {
      e.preventDefault();
      e.stopPropagation();

      if (e.code === "Escape") {
        waitingForBindAction = null;
        renderSettingsWindow();
        showToast("Changement de touche annulé", 1);
        return;
      }

      bindKey(waitingForBindAction, e.code);
      waitingForBindAction = null;
      renderSettingsWindow();
      return;
    }

    const typingTarget = e.target?.closest?.("input, textarea, select, [contenteditable='true']");
    if (typingTarget) return;

const boundKeys = Object.values(GAME_SETTINGS.keybinds || {});
const used = [...boundKeys];

    if (used.includes(e.code)) e.preventDefault();

    keyboard.keyDown(e.code, e.repeat);

    if (e.repeat) return;

    if (isKeybind("respawn", e.code)) {
      if (player.dead) respawn();
      return;
    }

    if (isKeybind("portal", e.code)) {
      if (!isZoneMap && betweenWaves) {
        const near = getInteractivePortals().find(isPlayerNearPortal);
        if (near) startGatePortalJump(near, near === portal ? "continue" : "return");
      }
      return;
    }

    if (isKeybind("switchConfig", e.code)) {
      toggleActiveConfigByKey();
      return;
    }

    if (isKeybind("toggleAttack", e.code)) {
      toggleAttack();
      return;
    }

    if (isKeybind("toggleWindows", e.code)) {
      window.GameWindowManager?.toggleAll?.();
      return;
    }

    for (let slotIndex = 0; slotIndex < 20; slotIndex++) {
      if (!isKeybind(`slot${slotIndex + 1}`, e.code)) continue;
      document.querySelectorAll("#ammoBar .actionSlot")[slotIndex]?.querySelector(".ammoBtn")?.click();
      return;
    }
  },
  { passive: false }
);

addEventListener("keyup", (e) => keyboard.keyUp(e.code));

// Click-to-move / Lock manuel
canvas.style.touchAction = "none";
canvas.addEventListener("contextmenu", (e) => e.preventDefault());

function isPlayerNearPortal(ptl) {
  if (!ptl) return false;

  const radius = DEFAULT_PORTAL_RADIUS;

  return dist2(
    player.x,
    player.y,
    ptl.x,
    ptl.y
  ) <= radius * radius;
}

function pickPortalButtonAtScreen(clientX, clientY) {
  const portals = getInteractivePortals();
  if (!portals.length) return null;

  const mouseWorld = screenToWorld(clientX, clientY);

  // On parcourt à l'envers pour prendre celui dessiné au-dessus
  for (let i = portals.length - 1; i >= 0; i--) {
    const ptl = portals[i];
    const spr = getPortalSpriteSet(ptl);
    const btn = spr.jumpButton;

    if (!btn || ptl.jumping) continue;

    const x = ptl.x + Number(btn.xOff || 0);
    const y = ptl.y + Number(btn.yOff ?? -210);

    const w = Math.max(1, Number(btn.w || 160));
    const h = Math.max(1, Number(btn.h || 45));

    if (
      mouseWorld.x >= x - w / 2 &&
      mouseWorld.x <= x + w / 2 &&
      mouseWorld.y >= y - h / 2 &&
      mouseWorld.y <= y + h / 2
    ) {
      return ptl;
    }
  }

  return null;
}

function updatePortalButtonCursor(clientX, clientY) {
  const portals = getInteractivePortals();
  if (!portals.length) return false;

  const hoveredPortal = pickPortalButtonAtScreen(
    clientX,
    clientY
  );

  for (const ptl of portals) {
    ptl.buttonHovered = ptl === hoveredPortal;
  }

  if (hoveredPortal) {
    canvas.style.cursor = "pointer";
    return true;
  }

  return false;
}

function isQuestModule(module) {
  return module?.questTerminal === true || String(module?.spr || "").startsWith("QUEST_");
}

function tickDroneFormationEffects(dt) {
  if (player.dead || player.shMax <= 0) return;
  const effects = getActiveDroneFormation(account.user).effects || {};
  const regenPct = Number(effects.shieldRegenPct || 0);
  const drainPct = Number(effects.shieldDrainPct || 0);
  if (regenPct > 0) {
    const perSecond = Math.min(Number(effects.shieldRegenCap || Infinity), player.shMax * regenPct / 100);
    player.sh = Math.min(player.shMax, player.sh + perSecond * dt);
  }
  if (drainPct > 0) player.sh = Math.max(0, player.sh - player.shMax * drainPct / 100 * dt);
}

function getQuestButtonPosition(module) {
  return {
    x: module.x,
    y: module.y - Number(module.h || 0) / 2 - QUEST_BUTTON.h / 2 - QUEST_BUTTON.gap,
  };
}

function pickQuestButtonAtScreen(clientX, clientY) {
  if (!isZoneMap || !zoneSafe?.modules?.length) return null;
  const mouseWorld = screenToWorld(clientX, clientY);

  for (let i = zoneSafe.modules.length - 1; i >= 0; i--) {
    const module = zoneSafe.modules[i];
    if (!isQuestModule(module)) continue;
    const pos = getQuestButtonPosition(module);

    if (
      mouseWorld.x >= pos.x - QUEST_BUTTON.w / 2 &&
      mouseWorld.x <= pos.x + QUEST_BUTTON.w / 2 &&
      mouseWorld.y >= pos.y - QUEST_BUTTON.h / 2 &&
      mouseWorld.y <= pos.y + QUEST_BUTTON.h / 2
    ) return module;
  }

  return null;
}

function updateQuestButtonCursor(clientX, clientY) {
  const hoveredModule = pickQuestButtonAtScreen(clientX, clientY);
  for (const module of zoneSafe?.modules || []) {
    if (isQuestModule(module)) module.questButtonHovered = module === hoveredModule;
  }
  if (hoveredModule) canvas.style.cursor = "pointer";
  return Boolean(hoveredModule);
}

function isPlayerNearQuestModule(module) {
  return dist2(player.x, player.y, module.x, module.y) <= QUEST_BUTTON.interactionRadius ** 2;
}

canvas.addEventListener(
  "mousemove",
  (e) => {
    const overPortalButton = updatePortalButtonCursor(
      e.clientX,
      e.clientY
    );

    const overQuestButton = updateQuestButtonCursor(e.clientX, e.clientY);

    if (!overPortalButton && !overQuestButton) {
      updateCollectableCursor(e.clientX, e.clientY);
    }
  },
  { passive: true }
);

// Double click = lock + démarre l'attaque
canvas.addEventListener(
  "dblclick",
  (e) => {
    e.preventDefault();
    SFX.resume();

    const enemy = pickEnemyAtScreen(e.clientX, e.clientY);
    if (!enemy) return;

    Target.set(enemy);
    stopAttack();
    startAttack();
  },
  { passive: false }
);

const moveTarget = { active: false, x: 0, y: 0 };

const pointer = createPointerState();
const DRAG_THRESHOLD = 8;

// ✅ Position souris écran mémorisée
function rememberPointer(e) {
  pointer.remember(e);
}

function setMoveTargetFromScreen(clientX, clientY) {
  // ✅ Tout clic manuel sur la map annule l'ordre de collecte
  cancelCollectableTarget();

  const w = screenToWorld(clientX, clientY);
  moveTarget.active = true;
  moveTarget.x = w.x;
  moveTarget.y = w.y;
}

function setMoveTargetFromEvent(e) {
  rememberPointer(e);
  setMoveTargetFromScreen(e.clientX, e.clientY);
}

// ✅ Recalcule la cible chaque frame tant que le clic est maintenu
function refreshHoldMoveTarget() {
  if (!pointer.down) return;
  if (!pointer.followWhileDown) return;
  if (pointer.downOnEnemy) return;
  if (player.dead) return;
  if (!started) return;

  setMoveTargetFromScreen(pointer.clientX, pointer.clientY);
}

canvas.addEventListener(
  "pointerdown",
  (e) => {
    SFX.resume();

    if (e.button === 2) {
      return;
    }

    if (e.button !== 0) return;

pointer.begin(e);

    canvas.setPointerCapture(e.pointerId);

    const portalButton = pickPortalButtonAtScreen(
  e.clientX,
  e.clientY
);

if (portalButton) {
  portalButton.buttonPressed = true;
  portalButton.buttonHovered = true;

  pointer.dragArmed = false;
  pointer.dragging = false;
  pointer.downOnEnemy = false;
  pointer.followWhileDown = false;

  return;
}

const questButton = pickQuestButtonAtScreen(e.clientX, e.clientY);

if (questButton) {
  questButton.questButtonPressed = true;
  questButton.questButtonHovered = true;
  pointer.dragArmed = false;
  pointer.dragging = false;
  pointer.downOnEnemy = false;
  pointer.followWhileDown = false;
  return;
}

   const enemy = pickEnemyAtScreen(e.clientX, e.clientY);
if (enemy) {
  // ✅ On lock le NPC
  // ✅ Mais on ne touche PAS à l'ordre de collecte de box
  Target.set(enemy);

  pointer.downOnEnemy = true;
  pointer.dragArmed = false;
  pointer.dragging = false;
  pointer.followWhileDown = false;

  return;
}

const collectable = pickCollectableAtScreen(e.clientX, e.clientY);
if (collectable) {

  selectCollectable(collectable);

  pointer.dragArmed = false;
  pointer.dragging = false;
  pointer.downOnEnemy = false;
  pointer.followWhileDown = false;

  return;
}
cancelCollectableTarget();
pointer.followWhileDown = true;
setMoveTargetFromEvent(e);
  },
  { passive: false }
);

canvas.addEventListener(
  "pointermove",
  (e) => {
    rememberPointer(e);

    if (!pointer.down || !pointer.dragArmed || pointer.downOnEnemy) return;

    const dx = e.clientX - pointer.dragStartX;
    const dy = e.clientY - pointer.dragStartY;

    if (!pointer.dragging) {
      if (dx * dx + dy * dy < DRAG_THRESHOLD * DRAG_THRESHOLD) return;
      pointer.dragging = true;
    }

    pointer.followWhileDown = true;
    setMoveTargetFromEvent(e);
  },
  { passive: false }
);

canvas.addEventListener(
  "pointerup",
  (e) => {
    const releasedOnPortal = pickPortalButtonAtScreen(
      e.clientX,
      e.clientY
    );
    const releasedOnQuest = pickQuestButtonAtScreen(e.clientX, e.clientY);

    let pressedPortal = null;

    for (const ptl of getInteractivePortals()) {
      if (ptl.buttonPressed) {
        pressedPortal = ptl;
      }

      ptl.buttonPressed = false;
    }

    let pressedQuest = null;
    for (const module of zoneSafe?.modules || []) {
      if (module.questButtonPressed) pressedQuest = module;
      module.questButtonPressed = false;
    }

    // Le clic doit être relâché sur le même bouton
    if (
      pressedPortal &&
      releasedOnPortal === pressedPortal
    ) {
      const spr = getPortalSpriteSet(pressedPortal);
      const btn = spr.jumpButton;

      const requireNear = btn?.requireNear !== false;
      const nearEnough = isPlayerNearPortal(pressedPortal);

      if (pressedPortal.jumping) {
        // Le portail est déjà en train de sauter
      } else if (mapPortalLock > 0) {
        showToast("Portail temporairement indisponible", 1);
      } else if (requireNear && !nearEnough) {
        showToast("Approche-toi du portail", 1.2);
      } else {
        if (!isZoneMap && pressedPortal === portal) {
          startGatePortalJump(portal, "continue");
        } else if (!isZoneMap && pressedPortal === gateReturnPortal) {
          startGatePortalJump(gateReturnPortal, "return");
        } else {
          startZonePortalJump(pressedPortal);
        }
      }
    }

    if (pressedQuest && releasedOnQuest === pressedQuest) {
      if (!isPlayerNearQuestModule(pressedQuest)) {
        showToast("Approche-toi du bâtiment de quêtes", 1.4);
      } else {
        openQuestTerminal();
      }
    }

    pointer.reset();

    try {
      canvas.releasePointerCapture(e.pointerId);
    } catch {}
  },
  { passive: false }
);

canvas.addEventListener(
  "pointercancel",
  (e) => {
    pointer.reset();

    for (const ptl of getInteractivePortals()) {
      ptl.buttonPressed = false;
      ptl.buttonHovered = false;
    }

    for (const module of zoneSafe?.modules || []) {
      module.questButtonPressed = false;
      module.questButtonHovered = false;
    }

    try {
      canvas.releasePointerCapture(e.pointerId);
    } catch {}
  },
  { passive: true }
);

// Portal controls
ui.nextWaveBtn.addEventListener("click", (e) => {
  e.preventDefault();
  tryStartNextWave();
});

const portalCardEl = document.getElementById("portalCard");
if (portalCardEl) {
  portalCardEl.addEventListener("click", (e) => {
    e.preventDefault();
    tryStartNextWave();
  });
}

// ============================================================
// Entities
// ============================================================
const bullets = [];
const enemyBullets = [];
const enemies = [];
const escortShips = [];
const pickups = [];
const collectables = [];
const sparks = [];
const healerPulses = [];
const floatTexts = [];
const lasers = [];
const engineTrails = [];
const ESCORT_LOCK_SPR = Object.freeze({ ...LOCK_SPR, src: "UI/Lock_Vert.png" });
const ESCORT_ATTACK_RANGE = 580;
const ESCORT_OVERLORD_ATTACK_RANGE = 720;
const ESCORT_SAB_START_RATIO = 0.55;
const ESCORT_SAB_STOP_RATIO = 0.92;

function getEscortById(id) {
  return escortShips.find(escort => escort.id === id) || null;
}

function destroyEscort(escort) {
  if (!escort || escort.respawnT != null) return;
  escort.hp = 0;
  escort.sh = 0;
  escort.vx = 0;
  escort.vy = 0;
  escort.target = null;
  escort.respawnT = 5;
  spawnExplosion(escort.x, escort.y, 1.25);
  showNotification("Une escorte a été détruite — retour dans 5 secondes", 3, "info");
}

function getNpcCombatTarget(enemy) {
  if (rules?.mode !== "gate" || !escortShips.length) {
    if (enemy) enemy._combatTargetId = "player";
    return player;
  }
  const candidates = player.dead ? [] : [player];
  candidates.push(...escortShips.filter(escort => escort.hp > 0));
  if (!candidates.length) return player;
  if (enemy?.type === "npc_Gygerim_Overlord") {
    const nearest = candidates.reduce((best, candidate) => (
      !best || dist2(enemy.x, enemy.y, candidate.x, candidate.y) < dist2(enemy.x, enemy.y, best.x, best.y)
        ? candidate
        : best
    ), null) || player;
    enemy._combatTargetId = nearest === player ? "player" : nearest.id;
    return nearest;
  }
  const current = enemy?._combatTargetId === "player" ? player : getEscortById(enemy?._combatTargetId);
  if (current?.hp > 0 && dist2(enemy.x, enemy.y, current.x, current.y) <= 1200 * 1200) return current;
  const target = candidates.reduce((best, candidate) => (
    !best || dist2(enemy.x, enemy.y, candidate.x, candidate.y) < dist2(enemy.x, enemy.y, best.x, best.y) ? candidate : best
  ), null) || player;
  enemy._combatTargetId = target === player ? "player" : target.id;
  return target;
}

function initializeGateEscorts() {
  escortShips.length = 0;
  const gateId = String(window.__CURRENT_MAP_ID__ || "").toLowerCase();
  if (!rules?.escort) return;
  let count = 0;
  try {
    const stored = sessionStorage.getItem(`orbit_gate_escorts_${gateId}`)
      ?? (gateId === "qz" ? sessionStorage.getItem("orbit_qz_escorts") : null);
    count = Math.max(0, Math.min(Number(rules.escort.max) || 7, Number(stored) || 0));
  } catch {}
  const escortShipId = String(rules.escort.shipId || "goliath").toLowerCase();
  const pack = SHIP_PACKS.find(item => String(item.id || "").toLowerCase() === escortShipId)
    || SHIP_PACKS.find(item => String(item.id || "").toLowerCase() === "goliath");
  if (pack) void ensurePackLoaded(pack).catch(error => console.warn("Sprite de l'escorte indisponible :", error));
  for (let index = 0; index < count; index++) {
    const angle = (index / Math.max(1, count)) * TAU;
    escortShips.push({
      id: `${gateId}-escort-${index}`, formationIndex: index,
      x: player.x + Math.cos(angle) * 180, y: player.y + Math.sin(angle) * 180,
      vx: 0, vy: 0, angle, hp: 256000, hpMax: 256000, sh: 180000, shMax: 180000,
      speed: 460, damage: 50000, fireCd: index * 0.12, target: null, pack,
      altShot: index % 2 === 0, waypoint: null, waypointT: 0,
      sabActive: false,
    });
  }
  if (count) showNotification(`${count} escorte${count > 1 ? "s" : ""} Goliath engagée${count > 1 ? "s" : ""}`, 4, "info");
}

function chooseEscortWaypoint(escort) {
  const angle = Math.random() * TAU;
  const distance = rand(550, 1300);
  return {
    x: clamp(escort.x + Math.cos(angle) * distance, 120, WORLD.w - 120),
    y: clamp(escort.y + Math.sin(angle) * distance, 120, WORLD.h - 120),
  };
}

function fireEscortVolley(escort, target) {
  const angle = Math.atan2(target.y - escort.y, target.x - escort.x);
  const fx = Math.cos(angle);
  const fy = Math.sin(angle);
  const px = -fy;
  const py = fx;
  const speed = Math.max(900, Number(rules?.escort?.bulletSpeed) || BASE_RUN.baseBulletSpeed);
  const muzzle = (escort.pack?.r || 34) + 10;
  const muzzleX = escort.x + fx * muzzle;
  const muzzleY = escort.y + fy * muzzle;
  const volleyId = volleySeq++;
  const useSab = escort.sabActive && Number(target.sh || 0) > 0;
  const ammoKey = useSab ? "sab" : (rules?.escort?.ammo || "x3");
  const normalAmmoMult = Math.max(0.001, Number(AMMO[rules?.escort?.ammo || "x3"]?.mult) || 3);
  const totalDamage = useSab
    ? (escort.damage / normalAmmoMult) * SAB50.drainMult
    : escort.damage;
  const shotMiss = Math.random() < PLAYER_SHOTS.missChance;
  const shots = escort.altShot
    ? [
        { x: muzzleX + px * SIDE_OFFSET, y: muzzleY + py * SIDE_OFFSET, damage: totalDamage * SIDE_DMG_SPLIT },
        { x: muzzleX - px * SIDE_OFFSET, y: muzzleY - py * SIDE_OFFSET, damage: totalDamage * SIDE_DMG_SPLIT },
      ]
    : [{ x: muzzleX, y: muzzleY, damage: totalDamage }];
  for (const shot of shots) {
    const dx = target.x - shot.x;
    const dy = target.y - shot.y;
    const length = Math.hypot(dx, dy) || 1;
    addCappedProjectile(bullets, {
      x: shot.x, y: shot.y, vx: dx / length * speed, vy: dy / length * speed, spd: speed,
      r: 6, life: bulletLifeForRange(ESCORT_ATTACK_RANGE, speed), dmg: shot.damage,
      key: ammoKey, side: "player", targetId: target.id, homing: true, miss: shotMiss,
      isSab: useSab,
      ownerEscortId: escort.id, volleyId, volleySize: shots.length,
    }, ENTITY_LIMITS.playerBullets);
  }
  escort.altShot = !escort.altShot;
  escort.angle = angle;
}

function updateGateEscorts(dt) {
  if (!escortShips.length) return;
  for (const escort of escortShips) {
    if (escort.hp <= 0) {
      escort.respawnT = Math.max(0, Number(escort.respawnT ?? 5) - dt);
      if (escort.respawnT <= 0) {
        const spawn = rules?.playerSpawn || {};
        const angle = (Number(escort.formationIndex || 0) / Math.max(1, escortShips.length)) * TAU;
        const spawnX = Number(spawn.x ?? WORLD.w * Number(spawn.xRatio ?? 0.08));
        const spawnY = Number(spawn.y ?? WORLD.h * Number(spawn.yRatio ?? 0.5));
        escort.x = clamp(spawnX + Math.cos(angle) * 180, 80, WORLD.w - 80);
        escort.y = clamp(spawnY + Math.sin(angle) * 180, 80, WORLD.h - 80);
        escort.hp = escort.hpMax;
        escort.sh = escort.shMax;
        escort.respawnT = null;
        escort.waypoint = null;
        escort.waypointT = 0;
        escort.bossAnchor = null;
        escort.bossAnchorTargetId = null;
        escort.bossAttackRange = null;
        showNotification("Une escorte est revenue au combat", 2.5, "info");
      }
      continue;
    }
    escort.fireCd = Math.max(0, escort.fireCd - dt);
    const shieldRatio = escort.sh / Math.max(1, escort.shMax);
    if (shieldRatio <= ESCORT_SAB_START_RATIO) escort.sabActive = true;
    else if (shieldRatio >= ESCORT_SAB_STOP_RATIO) escort.sabActive = false;
    const livingEnemies = enemies.filter(enemy => enemy?.hp > 0);
    const candidates = livingEnemies.filter(enemy => !enemy._bossEncounter?.invulnerable);
    escort.target = candidates.reduce((best, enemy) => {
      if (!best) return enemy;
      return dist2(escort.x, escort.y, enemy.x, enemy.y) < dist2(escort.x, escort.y, best.x, best.y) ? enemy : best;
    }, null);
    escort.waypointT = Math.max(0, Number(escort.waypointT || 0) - dt);
    const reachedWaypoint = escort.waypoint && dist2(escort.x, escort.y, escort.waypoint.x, escort.waypoint.y) < 100 * 100;
    const needsWaypoint = !escort.waypoint || escort.waypointT <= 0 || reachedWaypoint;
    if (!escort.target && needsWaypoint) {
      escort.waypoint = chooseEscortWaypoint(escort);
      escort.waypointT = rand(3, 6);
    }
    const targetsOverlord = escort.target?.type === "npc_Gygerim_Overlord";
    const formationIndex = Number(escort.formationIndex || 0);
    if (targetsOverlord && escort.bossAnchorTargetId !== escort.target.id) {
      escort.bossAnchorTargetId = escort.target.id;
      const anchorAngle = rand(Math.PI - 0.52, Math.PI + 0.52);
      escort.bossAttackRange = rand(540, 705);
      escort.bossAnchor = {
        xOffset: Math.cos(anchorAngle) * escort.bossAttackRange,
        yOffset: Math.sin(anchorAngle) * escort.bossAttackRange,
      };
    } else if (!targetsOverlord) {
      escort.bossAnchorTargetId = null;
      escort.bossAnchor = null;
      escort.bossAttackRange = null;
    }
    const orbitAngle = performance.now() / 2200 + formationIndex;
    const destination = targetsOverlord
      ? {
          x: escort.target.x + escort.bossAnchor.xOffset,
          y: escort.target.y + escort.bossAnchor.yOffset,
        }
      : escort.target
        ? { x: escort.target.x + Math.cos(orbitAngle) * 560, y: escort.target.y + Math.sin(orbitAngle) * 560 }
        : escort.waypoint;
    const dx = destination.x - escort.x;
    const dy = destination.y - escort.y;
    const distance = Math.hypot(dx, dy) || 1;
    const speed = Math.min(escort.speed, distance * 2.2);
    escort.vx = dx / distance * speed;
    escort.vy = dy / distance * speed;
    escort.x = clamp(escort.x + escort.vx * dt, 80, WORLD.w - 80);
    escort.y = clamp(escort.y + escort.vy * dt, 80, WORLD.h - 80);
    if (Math.hypot(escort.vx, escort.vy) > 5) escort.angle = Math.atan2(escort.vy, escort.vx);
    const targetInRange = escort.target && (
      dist2(escort.x, escort.y, escort.target.x, escort.target.y) <= (
        targetsOverlord ? Math.min(ESCORT_OVERLORD_ATTACK_RANGE, Number(escort.bossAttackRange || ESCORT_OVERLORD_ATTACK_RANGE) + 15) : ESCORT_ATTACK_RANGE
      ) ** 2
    );
    if (targetInRange) {
      escort.angle = Math.atan2(escort.target.y - escort.y, escort.target.x - escort.x);
      if (escort.fireCd <= 0) {
        fireEscortVolley(escort, escort.target);
        const ammoConfig = AMMO[rules?.escort?.ammo || "x3"] || AMMO.x3 || {};
        const playerCadence = 1 / Math.max(0.001, player.baseFireRate * player.fireRateMult);
        escort.fireCd = typeof ammoConfig.cooldown === "number" ? ammoConfig.cooldown : playerCadence;
      }
    }
  }
}

function drawGateEscorts(ox, oy) {
  for (const escort of escortShips) {
    if (escort.hp <= 0) continue;
    const x = escort.x + ox;
    const y = escort.y + oy;
    if (x < -160 || y < -160 || x > innerWidth + 160 || y > innerHeight + 160) continue;
    ctx.save();
    ctx.translate(x, y);
    const pack = escort.pack;
    const frames = pack?.frames || 1;
    const image = pack?._imgs?.[angleToFrameIndex(escort.angle + (pack?.angleOffset || 0), frames)] || pack?._imgs?.[0];
    if (isImgReady(image)) drawCenteredImage(ctx, image, pack.w || 169, pack.h || 150);
    else { ctx.fillStyle = "#79f5ff"; ctx.beginPath(); ctx.arc(0, 0, 24, 0, TAU); ctx.fill(); }
    ctx.restore();
    const barWidth = 92;
    const barHeight = 4;
    const barX = x - barWidth / 2;
    const barY = y - 62;
    const hpPercent = clamp(escort.hp / Math.max(1, escort.hpMax), 0, 1);
    const shieldPercent = clamp(escort.sh / Math.max(1, escort.shMax), 0, 1);
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,.6)";
    ctx.fillRect(barX, barY, barWidth, barHeight);
    ctx.fillRect(barX, barY + barHeight + 2, barWidth, barHeight);
    ctx.fillStyle = "rgba(78,235,112,.95)";
    ctx.fillRect(barX, barY, barWidth * hpPercent, barHeight);
    ctx.fillStyle = "rgba(70,190,255,.95)";
    ctx.fillRect(barX, barY + barHeight + 2, barWidth * shieldPercent, barHeight);
    ctx.strokeStyle = "rgba(220,245,255,.28)";
    ctx.lineWidth = 1;
    ctx.strokeRect(barX - .5, barY - .5, barWidth + 1, barHeight + 1);
    ctx.strokeRect(barX - .5, barY + barHeight + 1.5, barWidth + 1, barHeight + 1);
    ctx.restore();
    ctx.fillStyle = "#7cf0ff";
    ctx.font = "800 11px system-ui"; ctx.textAlign = "center"; ctx.fillText("ESCORTE GOLIATH", x, y + 58);
  }
}

function drawEscortTargetLocks(ox, oy) {
  const playerTarget = Target.get();
  const image = getCachedImage(ESCORT_LOCK_SPR.src);
  if (!isImgReady(image)) return;
  const targets = new Set();
  for (const escort of escortShips) {
    if (escort.target?.hp > 0 && escort.target !== playerTarget) targets.add(escort.target);
  }
  for (const target of targets) drawTargetLock(ctx, target, image, ESCORT_LOCK_SPR, ox, oy, performance.now() / 1000);
}

const ENTITY_LIMITS = Object.freeze({
  playerBullets: 320,
  enemyBullets: 900,
  explosions: 48,
  sparks: 180,
  floatTexts: 140,
  lasers: 80,
  pulseFxs: 12,
  engineTrails: 420,
});

function getEngineTrailLayout(entity, config) {
  const sprite = config?.sprite || config || {};
  const trail = sprite.trail ?? config?.trail ?? {};
  if (trail === false) return null;

  const w = Number(sprite.w ?? sprite.size ?? 160);
  const h = Number(sprite.h ?? sprite.size ?? 140);
  const engines = Math.max(1, Math.min(3, Number(trail.engines ?? (w >= 155 ? 2 : 1))));

  return {
    engines,
    rear: Number(trail.rear ?? w * 0.34),
    spacing: Number(trail.spacing ?? h * 0.16),
    scale: clamp(Number(trail.scale ?? Math.min(w, h) / 150), 0.55, 1.8),
  };
}

function emitEngineTrail(entity, config, dt, ownerNpcId = null) {
  const speed = Math.hypot(entity.vx || 0, entity.vy || 0);
  if (speed < 35 || !isOnScreenWorld(entity.x, entity.y, 180)) {
    entity._trailAcc = 0;
    return;
  }

  const layout = getEngineTrailLayout(entity, config);
  if (!layout) return;

  const speedRatio = clamp(speed / Math.max(100, Number(entity.speed || config?.speed || 320)), 0, 1);
  entity._trailAcc = (entity._trailAcc || 0) + dt * (10 + speedRatio * 10);

  while (entity._trailAcc >= 1) {
    entity._trailAcc -= 1;
    const angle = Number.isFinite(entity.angle) ? entity.angle : Math.atan2(entity.vy, entity.vx);
    const fx = Math.cos(angle);
    const fy = Math.sin(angle);
    const px = -fy;
    const py = fx;

    for (let i = 0; i < layout.engines; i++) {
      const side = layout.engines === 1 ? 0 : (i / (layout.engines - 1) - 0.5) * 2;
      const jitter = (Math.random() - 0.5) * 4;
      pushBounded(engineTrails, {
        ownerNpcId,
        x: entity.x - fx * layout.rear + px * (side * layout.spacing + jitter),
        y: entity.y - fy * layout.rear + py * (side * layout.spacing + jitter),
        vx: (entity.vx || 0) * 0.12 - fx * (25 + Math.random() * 30) + px * jitter,
        vy: (entity.vy || 0) * 0.12 - fy * (25 + Math.random() * 30) + py * jitter,
        t: 0,
        life: 0.45 + Math.random() * 0.3,
        size: (3.2 + Math.random() * 2.4) * layout.scale,
      }, ENTITY_LIMITS.engineTrails);
    }
  }
}

function tickEngineTrails(dt) {
  if (!player.dead && GAME_SETTINGS.shipSmoke) emitEngineTrail(player, ACTIVE_SHIP, dt);

  const lockedNpc = Target.get();
  if (GAME_SETTINGS.shipSmoke) {
    for (const enemy of enemies) {
      if (enemy?.hp <= 0) continue;
      if (!shouldDetectNpc(player, enemy, NPC_SENSOR_RANGES.visibility, lockedNpc)) {
        enemy._trailAcc = 0;
        continue;
      }
      emitEngineTrail(enemy, NPC_TYPES[enemy.type], dt, enemy.id);
    }
  } else {
    for (const enemy of enemies) if (enemy) enemy._trailAcc = 0;
  }

  for (let i = engineTrails.length - 1; i >= 0; i--) {
    const particle = engineTrails[i];
    if (particle.ownerNpcId != null) {
      const owner = getEnemyById(particle.ownerNpcId);
      if (!owner || owner.hp <= 0 || !shouldDetectNpc(player, owner, NPC_SENSOR_RANGES.visibility, lockedNpc)) {
        engineTrails.splice(i, 1);
        continue;
      }
    }
    particle.t += dt;
    if (particle.t >= particle.life) {
      engineTrails.splice(i, 1);
      continue;
    }
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.vx *= Math.pow(0.94, dt * 60);
    particle.vy *= Math.pow(0.94, dt * 60);
  }
}

function drawEngineTrails(ox, oy) {
  ctx.save();
  for (const particle of engineTrails) {
    const progress = particle.t / particle.life;
    const x = particle.x + ox;
    const y = particle.y + oy;
    if (x < -30 || y < -30 || x > innerWidth + 30 || y > innerHeight + 30) continue;

    ctx.globalAlpha = (1 - progress) * 0.3;
    ctx.fillStyle = progress < 0.3 ? "rgb(125, 220, 255)" : "rgb(155, 175, 190)";
    ctx.beginPath();
    ctx.arc(x, y, particle.size * (0.75 + progress * 1.5), 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

function addCappedProjectile(collection, options, limit) {
  while (collection.length >= limit) removeProjectile(collection, 0);
  return addProjectile(collection, options);
}

let collectableTargetId = null;

const COLLECTABLE_PICKUP = {
  offsetX: 0,
  offsetY: -70,      // ✅ le vaisseau se place 50px au-dessus de la box
  centerRadius: 18,
  holdDuration: 0.2,
};

function cancelCollectableTarget() {
  if (collectableTargetId !== null) {
    const old = collectables.find(c => c && c.id === collectableTargetId);
    if (old) {
      old.armed = false;
      old.collectT = 0;
    }
  }

  collectableTargetId = null;
}

function selectCollectable(c) {
  if (!c) return;

  cancelCollectableTarget();

  collectableTargetId = c.id;
  c.armed = true;
  c.collectT = 0;

moveTarget.active = true;
moveTarget.x = c.x + (COLLECTABLE_PICKUP.offsetX || 0);
moveTarget.y = c.y + (COLLECTABLE_PICKUP.offsetY || 0);
}

// ============================================================
// ✅ NPC shots : homing + MISS
// ============================================================
const NPC_SHOTS = {
  missChance: 0.15,      // 15% de MISS
  homing: true,          // les tirs NPC suivent le joueur visuellement
  hitRadiusBonus: 20,    // évite les tirs qui passent juste à côté
};

// ============================================================
// ✅ Player shots : MISS par tir complet / volley
// ============================================================
const PLAYER_SHOTS = {
  missChance: 0.15, // Une salve complète peut rater, même si ses projectiles restent guidés.
};

// Empêche d'afficher MISS deux fois quand le tir visuel a 2 projectiles
const playerMissVolleysShown = new Set();

function showPlayerMissOnce(b, t) {
  const key = b.volleyId ?? `solo_${Math.random()}`;

  if (playerMissVolleysShown.has(key)) return;

  playerMissVolleysShown.add(key);

  addMissText(
    t.x + (Math.random() - 0.5) * 50,
    t.y - 85 - Math.random() * 20
  );
}

function cleanupPlayerMissVolley(b) {
  if (!b || b.volleyId == null) return;

  const stillExists = bullets.some(x => x && x.volleyId === b.volleyId);
  if (!stillExists) {
    playerMissVolleysShown.delete(b.volleyId);
  }
}

function addMissText(x, y) {
  const base = 70 + Math.random() * 35;

  pushBounded(floatTexts, {
    x,
    y,
    vx: (Math.random() * 2 - 1) * base * 0.45,
    vy: -(base * (0.9 + Math.random() * 0.35)),
    t: 0,
    life: 0.9,
    text: "MISS",
    color: "rgba(180,220,255,0.96)",
    size: 18,
    pop: 0.35,
    shake: 0.5,
    glow: 1.0,
    weight: 900,
    impact: true,
  }, ENTITY_LIMITS.floatTexts);
}

const CUBI_RESET = { 
  idleDelay: 5.0, 
  healPct: 0.08, 
  shHealPct: 0.10, 
  minionDespawnMin: 0.5, 
  minionDespawnMax: 0.5
};

// ============================================================
// ✅ NPC separation (anti-stack)
// ============================================================
const NPC_SEP = {
  enable: true,
  extra: 6,
  strength: 28,
  side: 12,
  maxPush: 220,
};
const npcSeparationIndex = createSpatialPairIndex(512);

// ============================================================
// ✅ NPC combat movement : moins robotique, sans toucher NPC_TYPES
// ============================================================
const NPC_COMBAT_MOVE = {
  radiusMin: 260,
  radiusMax: 430,

  changeMin: 0.7,
  changeMax: 2.8,

  closeBrake: 0.78,

  orbitChance: 0.45,
  holdChance: 0.25,
  driftChance: 0.20,
  pauseChance: 0.10,
};

function createNpcCombatAI() {
  const r = Math.random();

  let mode = "orbit";

  if (r < NPC_COMBAT_MOVE.orbitChance) {
    mode = "orbit";
  } else if (r < NPC_COMBAT_MOVE.orbitChance + NPC_COMBAT_MOVE.holdChance) {
    mode = "hold";
  } else if (r < NPC_COMBAT_MOVE.orbitChance + NPC_COMBAT_MOVE.holdChance + NPC_COMBAT_MOVE.driftChance) {
    mode = "drift";
  } else {
    mode = "pause";
  }

  return {
    mode,
    dir: Math.random() < 0.5 ? -1 : 1,
    cd: rand(NPC_COMBAT_MOVE.changeMin, NPC_COMBAT_MOVE.changeMax),

    // ✅ chaque NPC a son propre rayon, sans NPC_TYPES
    minR: rand(240, 330),
    maxR: rand(350, 470),

    // ✅ évite les mouvements parfaitement circulaires
    wobbleSeed: Math.random() * 9999,
    pauseT: 0,
  };
}

function ensureNpcCombatAI(ai) {
  if (!ai) ai = {};

  if (!ai.combatMove) {
    ai.combatMove = createNpcCombatAI();
  }

  return ai.combatMove;
}

function tickNpcCombatAI(ca, dt) {
  ca.cd -= dt;

  if (ca.pauseT > 0) {
    ca.pauseT -= dt;
  }

  if (ca.cd > 0) return;

  const r = Math.random();

  if (r < 0.40) ca.mode = "orbit";
  else if (r < 0.62) ca.mode = "hold";
  else if (r < 0.86) ca.mode = "drift";
  else ca.mode = "pause";

  if (Math.random() < 0.60) {
    ca.dir *= -1;
  }

  if (ca.mode === "pause") {
    ca.pauseT = rand(0.25, 0.85);
  }

  ca.cd = rand(NPC_COMBAT_MOVE.changeMin, NPC_COMBAT_MOVE.changeMax);
}

function computeNpcCombatMove(e, d, nx, ny, ai, dt) {
  const ca = ensureNpcCombatAI(ai);
  tickNpcCombatAI(ca, dt);
  return computeNpcSteering(e, d, nx, ny, ca, dt, NPC_COMBAT_MOVE.closeBrake);

}

function applyNpcSeparation(dt) {
  if (isZoneMap) return;
  if (!NPC_SEP.enable) return;
  
  if (enemies.length <= 1) return;

  npcSeparationIndex.forEachPair(enemies, (a, b, i, j) => {

      if (a.type === "npc_Cubikon" || b.type === "npc_Cubikon") return;

      const dx = b.x - a.x;
      const dy = b.y - a.y;

      const ra = a.r || 18;
      const rb = b.r || 18;

      const minDist = ra + rb + NPC_SEP.extra;
      const d2 = dx * dx + dy * dy;

      if (d2 >= minDist * minDist) return;

      const d = Math.sqrt(d2) || 0.0001;

      const nx = dx / d;
      const ny = dy / d;

      const overlap = (minDist - d);

      const push = Math.min(NPC_SEP.maxPush, overlap * NPC_SEP.strength);

      const tx = -ny;
      const ty = nx;
      const sign = (i + j) % 2 === 0 ? 1 : -1;
      const side = Math.min(NPC_SEP.maxPush, overlap * NPC_SEP.side) * sign;

      const ax = (-nx * push + tx * side) * dt;
      const ay = (-ny * push + ty * side) * dt;

      const bx = ( nx * push - tx * side) * dt;
      const by = ( ny * push - ty * side) * dt;

      a.x = clamp(a.x + ax, a.r || 18, WORLD.w - (a.r || 18));
      a.y = clamp(a.y + ay, a.r || 18, WORLD.h - (a.r || 18));
      b.x = clamp(b.x + bx, b.r || 18, WORLD.w - (b.r || 18));
      b.y = clamp(b.y + by, b.r || 18, WORLD.h - (b.r || 18));
  });
}

// ============================================================
// NPC TYPES
// ============================================================
function ensureNpcPreview(type) {
  const cfg = NPC_TYPES[type];
  const sp = cfg?.sprite;
  if (!sp) return Promise.resolve(null);
  if (sp._previewPromise) return sp._previewPromise;

  const src = `${sp.path}${sp.firstNumber}${sp.ext}`;
  sp._previewPromise = loadImage(src, { priority: true })
    .then((img) => (sp._previewImg = img))
    .catch(() => null);

  return sp._previewPromise;
}

function ensureNpcLoaded(type) {
  const cfg = NPC_TYPES[type];
  const sp = cfg?.sprite;
  if (!sp) return Promise.resolve(null);

  if (sp._promise) return sp._promise;

  sp._imgs = new Array(sp.frames);
  sp._ready = false;

  sp._promise = (async () => {
    const jobs = [];
    for (let i = 0; i < sp.frames; i++) {
      const src = `${sp.path}${sp.firstNumber + i}${sp.ext}`;
      jobs.push(loadImage(src, { priority: false }).then((img) => (sp._imgs[i] = img)));
    }
    await Promise.all(jobs);
    sp._ready = true;
    return sp;
  })();

  return sp._promise;
}

// ============================================================
// FX / Text
// ============================================================
const DMG_FMT = (() => {
  try { return new Intl.NumberFormat("en-US"); }
  catch { return { format: (n) => String(n) }; }
})();

function floatOptsForDamage(n) {
  const size = 18;
  const pop = 0.3;
  const shake = 0.6;
  const life = 1;
  const glow = 1.0;
  const weight = 900;
  const impact = true;

  return { size, pop, shake, life, glow, weight, impact };
}

function addFloatText(x, y, n, color, opts = {}) {
  n = Math.max(0, Number(n) || 0);
  const o = { size: 16, pop: 0.55, shake: 0.8, glow: 0.8, life: 0.85, weight: 900, impact: false, ...opts };

  const base = 60 + Math.random() * 40 + Math.sqrt(n) * 0.08;

  const vx0 = (Math.random() * 2 - 1) * base * 0.60;
  const vy0 = -(base * (0.85 + Math.random() * 0.35));

  pushBounded(floatTexts, {
    x,
    y,
    vx: vx0,
    vy: vy0,
    t: 0,
    life: o.life,
    text: o.text ?? DMG_FMT.format(Math.round(n)),
    color,
    size: o.size,
    pop: o.pop,
    shake: o.shake,
    glow: o.glow,
    weight: o.weight,
    impact: o.impact,
  }, ENTITY_LIMITS.floatTexts);
}

function addPlayerCombatFloat(amount, color, prefix = "") {
  const shown = Math.max(1, Math.round(Number(amount) || 0));
  const textOffsetX = (Math.random() - 0.5) * 60;
  const textOffsetY = -90 - Math.random() * 20;
  addFloatText(player.x + textOffsetX, player.y + textOffsetY, shown, color, {
    text: `${prefix}${DMG_FMT.format(shown)}`,
    size: 18,
    pop: 0.3,
    shake: 0.6,
    life: 1,
    glow: 1,
    weight: 900,
    impact: true,
  });
}

function spawnSpark(x, y, big = false) {
  pushBounded(sparks, { x, y, t: 0, big }, ENTITY_LIMITS.sparks);
}

function spawnPickup(x, y, credits) {
  if (credits) pickups.push({ x, y, credits, t: 0 });
}

// ============================================================
// Spawns
// ============================================================
function spawnAtSafeDistance(minD, maxD, offscreenMargin = 280) {
  for (let i = 0; i < 20; i++) {
    const ang = rand(0, Math.PI * 2);
    const d = rand(minD, maxD);
    const x = clamp(player.x + Math.cos(ang) * d, 80, WORLD.w - 80);
    const y = clamp(player.y + Math.sin(ang) * d, 80, WORLD.h - 80);
    if (!isOnScreenWorld(x, y, offscreenMargin)) return { x, y };
  }
  const ang = rand(0, Math.PI * 2);
  const d = rand(minD, maxD);
  return { 
    x: clamp(player.x + Math.cos(ang) * d, 80, WORLD.w - 80), 
    y: clamp(player.y + Math.sin(ang) * d, 80, WORLD.h - 80) 
  };
}

function spawnRandomOnMap() {
  for (let i = 0; i < 60; i++) {
    const x = rand(80, WORLD.w - 80);
    const y = rand(80, WORLD.h - 80);

    // évite de spawn dans les safe zones en mode zone
    if (isZoneMap) {
      const fake = { x, y };
      if (npcIsInSafeZone(fake)) continue;
    }

    return { x, y };
  }

  // fallback
  return {
    x: rand(80, WORLD.w - 80),
    y: rand(80, WORLD.h - 80),
  };
}

// ============================================================
// ✅ Collectables globaux toutes maps
// ============================================================

const COLLECTABLE_CFG = {
  enabled: true,

  // Toutes les X secondes on vérifie s’il manque des collectables
  interval: 1.0,

  // Combien on peut en respawn max par vérification
  spawnBatch: 5,

  // Évite de spawn trop proche du joueur
  avoidPlayer: 700,

  // Distance minimale entre collectables
  minSpacing: 120,

  // Nombre d’essais pour trouver une bonne position
  maxAttempts: 80,

  ...(rules?.collectables?.spawn || {}),
  ...(COLLECTABLE_SPAWN || {}),
};

const COLLECTABLE_DEFS =
  Object.keys(COLLECTABLE_TYPES || {}).length
    ? COLLECTABLE_TYPES
    : (rules?.collectables?.types || {});

let collectableSpawnT = 0;

function currentMapId() {
  return String(window.__CURRENT_MAP_ID__ || "1-1");
}

function collectableAllowedOnCurrentMap(cfg) {
  const cur = currentMapId();

  const maps =
    cfg.maps ??
    cfg.map ??
    cfg.onlyMaps ??
    cfg.allowedMaps ??
    null;

  if (!maps) return true;
  if (maps === "*" || maps === "all") return true;

  if (Array.isArray(maps)) {
    return maps.map(String).includes(cur);
  }

  return String(maps) === cur;
}

function collectableDefsList() {
  return Object.entries(COLLECTABLE_DEFS)
    .filter(([, cfg]) =>
      cfg &&
      cfg.enabled !== false &&
      collectableAllowedOnCurrentMap(cfg)
    );
}

function collectableTargetCount(cfg) {
  return Math.max(0, Math.floor(Number(
    cfg.qty ??
    cfg.count ??
    cfg.amount ??
    cfg.maxAlive ??
    0
  )));
}

function countCollectablesByType(type) {
  let n = 0;
  for (const c of collectables) {
    if (c && c.type === type) n++;
  }
  return n;
}

function rollValue(v, fallback = 0) {
  if (Array.isArray(v)) {
    const a = Number(v[0] ?? 0);
    const b = Number(v[1] ?? a);
    return Math.floor(rand(Math.min(a, b), Math.max(a, b) + 1));
  }

  if (v && typeof v === "object") {
    const a = Number(v.min ?? 0);
    const b = Number(v.max ?? a);
    return Math.floor(rand(Math.min(a, b), Math.max(a, b) + 1));
  }

  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function pickExclusiveCollectableReward(entries) {
  const pool = Array.isArray(entries)
    ? entries.filter(entry => Number(entry?.weight) > 0 && entry?.reward)
    : [];
  if (!pool.length) return null;
  const total = pool.reduce((sum, entry) => sum + Number(entry.weight), 0);
  let roll = Math.random() * total;
  for (const entry of pool) {
    roll -= Number(entry.weight);
    if (roll <= 0) return entry.reward;
  }
  return pool.at(-1).reward;
}

function ensureCollectableLoaded(type) {
  const cfg = COLLECTABLE_DEFS[type];
  const sp = cfg?.sprite;
  if (!sp || !sp.path) return Promise.resolve(null);

  if (sp._promise) return sp._promise;

  const frames = Math.max(1, Number(sp.frames || 1));
  const first = Number(sp.firstNumber ?? 1);
  const ext = sp.ext || ".png";

  sp._imgs = new Array(frames);
  sp._ready = false;

  sp._promise = (async () => {
    const jobs = [];

    for (let i = 0; i < frames; i++) {
      const src = `${sp.path}${first + i}${ext}`;

      jobs.push(
        loadImage(src, { priority: false })
          .then((img) => {
            sp._imgs[i] = img;
            return img;
          })
          .catch(() => {
            sp._imgs[i] = null;
            return null;
          })
      );
    }

    await Promise.all(jobs);
    sp._ready = true;
    return sp;
  })();

  return sp._promise;
}

function preloadCollectables() {
  const jobs = [];
  for (const [type] of collectableDefsList()) {
    jobs.push(ensureCollectableLoaded(type));
  }
  return jobs;
}

preloadCollectables();

function isCollectablePositionOk(x, y, cfg) {
  const avoidPlayer = Number(cfg.avoidPlayer ?? COLLECTABLE_CFG.avoidPlayer ?? 700);
  if (avoidPlayer > 0 && dist2(x, y, player.x, player.y) < avoidPlayer * avoidPlayer) {
    return false;
  }

  const minSpacing = Number(cfg.minSpacing ?? COLLECTABLE_CFG.minSpacing ?? 120);
  if (minSpacing > 0) {
    for (const c of collectables) {
      if (!c) continue;
      if (dist2(x, y, c.x, c.y) < minSpacing * minSpacing) {
        return false;
      }
    }
  }

  return true;
}

function spawnCollectable(type) {
const cfg = COLLECTABLE_DEFS[type];
if (!cfg || cfg.enabled === false) return false;
if (!collectableAllowedOnCurrentMap(cfg)) return false;

  ensureCollectableLoaded(type);

  const maxAttempts = Math.max(1, Number(cfg.maxAttempts ?? COLLECTABLE_CFG.maxAttempts ?? 80));

  for (let i = 0; i < maxAttempts; i++) {
    const pos = spawnRandomOnMap();

    if (!isCollectablePositionOk(pos.x, pos.y, cfg)) continue;

    const sp = cfg.sprite || {};
    const frames = Math.max(1, Number(sp.frames || 1));

collectables.push({
  id: newId(),
  type,
  map: currentMapId(),

  x: pos.x,
  y: pos.y,

  r: Number(cfg.r ?? cfg.radius ?? 32),
  pickupRadius: Number(cfg.pickupRadius ?? cfg.r ?? cfg.radius ?? 42),

  armed: false,

  t: 0,
  frameAcc: sp.randomStart ? rand(0, frames) : 0,
});

    return true;
  }

  return false;
}

function spawnCollectableAt(type, x, y, opts = {}) {
  const cfg = COLLECTABLE_DEFS[type];
  if (!cfg || cfg.enabled === false) return false;
  if (!collectableAllowedOnCurrentMap(cfg)) return false;

  ensureCollectableLoaded(type);

  const sp = cfg.sprite || {};
  const frames = Math.max(1, Number(sp.frames || 1));

  collectables.push({
    id: newId(),
    type,
    map: currentMapId(),

    x: clamp(x, 80, WORLD.w - 80),
    y: clamp(y, 80, WORLD.h - 80),

    r: Number(cfg.r ?? cfg.radius ?? 32),
    pickupRadius: Number(cfg.pickupRadius ?? cfg.r ?? cfg.radius ?? 42),

    // ✅ important : si tu as fait le système "il faut cliquer dessus"
    armed: opts.armed === true,

    // ✅ permet de savoir que cette box vient d’un NPC
    fromNpc: opts.fromNpc || null,

    despawnAfter: Math.max(0, Number(opts.despawnAfter || 0)),

    t: 0,
    frameAcc: sp.randomStart ? rand(0, frames) : 0,
  });

  return true;
}

function pickCollectableAtScreen(sx, sy) {
  const w = screenToWorld(sx, sy);
  let best = null;
  let bestD2 = Infinity;

  for (const c of collectables) {
    if (!c) continue;
    if (c.map && String(c.map) !== currentMapId()) continue;

    const cfg = COLLECTABLE_DEFS[c.type] || {};
    const sp = cfg.sprite || {};

    const hitW = Number(sp.w || 64) * Number(sp.scale || 1);
    const hitH = Number(sp.h || 64) * Number(sp.scale || 1);

    const halfW = Math.max(hitW * 0.5, c.pickupRadius || c.r || 32);
    const halfH = Math.max(hitH * 0.5, c.pickupRadius || c.r || 32);

    const dx = w.x - c.x;
    const dy = w.y - c.y;

    if (Math.abs(dx) > halfW || Math.abs(dy) > halfH) continue;

    const d2 = dx * dx + dy * dy;
    if (d2 < bestD2) {
      best = c;
      bestD2 = d2;
    }
  }

  return best;
}

function updateCollectableCursor(sx, sy) {
  if (pickCollectableAtScreen(sx, sy)) {
    canvas.style.cursor = "pointer";
  } else {
    canvas.style.cursor = "default";
  }
}

function applyCollectableReward(c) {
  const cfg = COLLECTABLE_DEFS[c.type];
  if (!cfg) return;

  const reward = pickExclusiveCollectableReward(cfg.exclusiveRewards) || cfg.reward || cfg.rewards || {};
  const parts = [];
  const goldTerms = [];

  let changed = false;

  const credits = rollValue(reward.credits, 0);
  if (credits > 0) {
    player.credits += credits;
    parts.push(`+${credits} crédits`);
    changed = true;
  }

  const galaxyEnergy = rollValue(reward.galaxyEnergy, 0);
  if (galaxyEnergy > 0) {
    if (!account.user) loadAccountUser();
    if (account.user) {
      account.user.galaxyGates = normalizeGalaxyGateState(account.user.galaxyGates);
      account.user.galaxyGates.energy += galaxyEnergy;
      parts.push(`+${formatInteger(galaxyEnergy)} énergie pour les portails intergalactiques (GG)`);
      changed = true;
      if (ui.galaxyGateWindow.style.display !== "none" && !ui.galaxyGateWindow.classList.contains("gameWinMinimized")) {
        renderGalaxyGateWindow();
      }
    }
  }

  if (reward.ammo && typeof reward.ammo === "object") {
    for (const key in reward.ammo) {
      const amount = rollValue(reward.ammo[key], 0);
      if (amount <= 0) continue;

      player.ammo[key] = Math.max(0, Number(player.ammo[key]) || 0) + amount;
      parts.push(`+${formatInteger(amount)} munitions type ${key.toUpperCase()}`);
      changed = true;
    }
  }

  if (reward.resources && typeof reward.resources === "object") {
    if (!account.user) loadAccountUser();
    if (account.user) {
      account.user.inventory ||= {};
      account.user.inventory.resources ||= {};
      for (const [resourceId, range] of Object.entries(reward.resources)) {
        const amount = rollValue(range, 0);
        if (amount <= 0) continue;
        account.user.inventory.resources[resourceId] = Math.max(0, Number(account.user.inventory.resources[resourceId]) || 0) + amount;
        parts.push(`+${formatInteger(amount)} ${getResourceName(resourceId, amount)}`);
        goldTerms.push(formatInteger(amount));
        changed = true;
      }
    }
  }

  const hpFlat = rollValue(reward.hp, 0);
  if (hpFlat > 0) {
    player.hp = Math.min(player.hpMax, player.hp + hpFlat);
    parts.push(`+${hpFlat} HP`);
    changed = true;
  }

  const hpPct = Number(reward.hpPct || 0);
  if (hpPct > 0) {
    const amount = Math.floor(player.hpMax * hpPct);
    player.hp = Math.min(player.hpMax, player.hp + amount);
    parts.push(`+${amount} HP`);
    changed = true;
  }

  const shFlat = rollValue(reward.shield ?? reward.sh, 0);
  if (shFlat > 0) {
    player.sh = Math.min(player.shMax, player.sh + shFlat);
    parts.push(`+${shFlat} bouclier`);
    changed = true;
  }

  const shPct = Number(reward.shieldPct ?? reward.shPct ?? 0);
  if (shPct > 0) {
    const amount = Math.floor(player.shMax * shPct);
    player.sh = Math.min(player.shMax, player.sh + amount);
    parts.push(`+${amount} bouclier`);
    changed = true;
  }

  if (typeof cfg.onCollect === "function") {
    cfg.onCollect({
      player,
      collectable: c,
      config: cfg,
      showToast,
      addFloatText,
      markProgressDirty,
    });

    changed = true;
  }

  if (changed) {
    markProgressDirty();
    updateAmmoUI();
  }

  advanceQuestProgress("collect", c.type);

  if (parts.length) {
    const receivedMessages = parts.map(part => `Vous avez reçu ${part.replace(/^\+/, "")}`);
    addGameLog(receivedMessages.join(" · "), "reward");
    showNotificationGroup(receivedMessages, "reward", { goldTerms });
  } else {
    showToast(cfg.name || "Collectable", 1.0);
  }
}

document.addEventListener("click", event => {
  if (event.target.closest?.('[data-window-id="questWindow"]')) {
    setTimeout(renderQuestWindow, 0);
  }
});

function tickCollectables(dt) {
  if (!started || player.dead) return;
  if (COLLECTABLE_CFG.enabled === false) return;

  collectableSpawnT -= dt;

  if (collectableSpawnT <= 0) {
    collectableSpawnT = Math.max(0.1, Number(COLLECTABLE_CFG.interval || 1.0));

    for (const [type, cfg] of collectableDefsList()) {
      const target = collectableTargetCount(cfg);
      if (target <= 0) continue;

      const alive = countCollectablesByType(type);
      const missing = Math.max(0, target - alive);
      const batch = Math.min(
        missing,
        Math.max(1, Number(cfg.spawnBatch ?? COLLECTABLE_CFG.spawnBatch ?? 5))
      );

      for (let i = 0; i < batch; i++) {
        spawnCollectable(type);
      }
    }
  }

  for (let i = collectables.length - 1; i >= 0; i--) {
    const c = collectables[i];
    if (!c) continue;

    const cfg = COLLECTABLE_DEFS[c.type] || {};
    const sp = cfg.sprite || {};

    c.t += dt;

    if (c.despawnAfter > 0 && c.t >= c.despawnAfter) {
  if (collectableTargetId === c.id) {
    cancelCollectableTarget();
    moveTarget.active = false;
  }

  collectables.splice(i, 1);
  continue;
}

    const fps = Math.max(0.01, Number(sp.fps ?? sp.speed ?? 12));
    c.frameAcc += dt * fps;

    if (player.dead) continue;

const isSelected = collectableTargetId === c.id && c.armed === true;

    // ✅ Ancien comportement uniquement si une box est vraiment en autoCollect
    if (!isSelected && cfg.autoCollect === true) {
      const rr = player.r + (c.pickupRadius || c.r || 32);

      if (dist2(player.x, player.y, c.x, c.y) <= rr * rr) {
        applyCollectableReward(c);
        collectables.splice(i, 1);
      }

      continue;
    }

    // ✅ Si la box n'a pas été cliquée, on ne la collecte pas
    if (!isSelected) {
      c.collectT = 0;
      continue;
    }

    // ✅ Force le vaisseau à continuer vers le centre exact de la box
   // ✅ Point de collecte légèrement au-dessus de la box
const collectX = c.x + (COLLECTABLE_PICKUP.offsetX || 0);
const collectY = c.y + (COLLECTABLE_PICKUP.offsetY || 0);

// ✅ Force le vaisseau à continuer vers ce point
moveTarget.active = true;
moveTarget.x = collectX;
moveTarget.y = collectY;

const dx = collectX - player.x;
const dy = collectY - player.y;
const d = Math.hypot(dx, dy);

    // Pas encore au-dessus de la box
    if (d > COLLECTABLE_PICKUP.centerRadius) {
      c.collectT = 0;
      continue;
    }

    // ✅ Le vaisseau est au-dessus : on stoppe proprement
    moveTarget.active = false;
    player.vx = 0;
    player.vy = 0;

    // ✅ Snap léger pour être parfaitement centré sur la box
player.x = collectX;
player.y = collectY;

    c.collectT = (c.collectT || 0) + dt;

    // ✅ Attente de 1 seconde avant collecte
    if (c.collectT >= COLLECTABLE_PICKUP.holdDuration) {
      applyCollectableReward(c);

      collectableTargetId = null;
      collectables.splice(i, 1);
    }
  }
}

function drawCollectBeam(c, ox, oy) {
  if (!c) return;
  if (collectableTargetId !== c.id) return;
  if (c.armed !== true) return;

  const hold = Math.max(0.001, Number(COLLECTABLE_PICKUP.holdDuration || 0.2));
  const p = clamp((c.collectT || 0) / hold, 0, 1);

  // visible uniquement pendant la phase de collecte
  if (p <= 0) return;

  const shipX = player.x + ox;
  const shipY = player.y + oy;

  const boxX = c.x + ox;
  const boxY = c.y + oy;

  const dx = shipX - boxX;
  const dy = shipY - boxY;
  const dist = Math.hypot(dx, dy);

  if (dist < 8) return;

  const dirX = dx / dist;
  const dirY = dy / dist;

  // perpendiculaire pour écarter un peu les traits
  const sideX = -dirY;
  const sideY = dirX;

  ctx.save();
  ctx.globalCompositeOperation = "lighter";

  // petit halo sur la box
  const pulse = 0.5 + 0.5 * Math.sin(c.t * 20);
  ctx.globalAlpha = 0.18 + p * 0.25;
  ctx.beginPath();
  ctx.arc(boxX, boxY, 16 + pulse * 8, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(120,240,255,0.9)";
  ctx.fill();

  // traits qui montent de la box vers le vaisseau
  const count = 50;

  for (let i = 0; i < count; i++) {
    const seed = i * 1.37;

    // progression du trait le long de l'axe box -> vaisseau
    const travel = ((c.t * 4.5) + i / count) % 1;

    // part de la box et monte vers le vaisseau
    const baseT = travel;

    // légère dispersion latérale
    const spread = Math.sin(c.t * 12 + seed) * 10 + (i % 2 === 0 ? -8 : 8);

    const cx = boxX + dx * baseT + sideX * spread;
    const cy = boxY + dy * baseT + sideY * spread;

    // orientation du trait dans la direction du vaisseau
    const len = 8 + p * 10 + (Math.sin(c.t * 18 + seed) * 2);
    const tx1 = cx - dirX * len * 0.5;
    const ty1 = cy - dirY * len * 0.5;
    const tx2 = cx + dirX * len * 0.5;
    const ty2 = cy + dirY * len * 0.5;

    ctx.globalAlpha = 0.20 + p * 0.75;

    // trait externe
    ctx.strokeStyle = "rgba(120,240,255,0.95)";
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(tx1, ty1);
    ctx.lineTo(tx2, ty2);
    ctx.stroke();

    // coeur blanc
    ctx.strokeStyle = "rgba(255,255,255,0.95)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(
      cx - dirX * len * 0.22,
      cy - dirY * len * 0.22
    );
    ctx.lineTo(
      cx + dirX * len * 0.22,
      cy + dirY * len * 0.22
    );
    ctx.stroke();
  }

  // petit flash discret près du vaisseau
  ctx.globalAlpha = 0.15 + p * 0.25;
  ctx.beginPath();
  ctx.arc(shipX, shipY, 10 + pulse * 5, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.fill();

  ctx.restore();
}

function drawCollectables(ox, oy) {
  for (const c of collectables) {
    const cfg = COLLECTABLE_DEFS[c.type] || {};
    const sp = cfg.sprite || {};

    const x = c.x + ox;
    const y = c.y + oy;

    const maxSize = Math.max(sp.w || 64, sp.h || 64) * (sp.scale || 1);
    if (x < -maxSize || y < -maxSize || x > innerWidth + maxSize || y > innerHeight + maxSize) {
      continue;
    }

    drawCollectBeam(c, ox, oy);

    const frames = Math.max(1, Number(sp.frames || sp._imgs?.length || 1));
    const idx = Math.floor(c.frameAcc) % frames;
    const img = sp._imgs?.[idx];

    const pulse = 1 + Math.sin(c.t * 4) * 0.04;
    const bob = Math.sin(c.t * 3) * Number(cfg.bob ?? 4);

    ctx.save();
    ctx.translate(x, y + bob);
    ctx.scale(pulse, pulse);

    if (img && isImgReady(img)) {
      const scale = Number(sp.scale || 1);
      const w = Number(sp.w || img.naturalWidth || img.width || 64) * scale;
      const h = Number(sp.h || img.naturalHeight || img.height || 64) * scale;

      ctx.imageSmoothingEnabled = false;
  drawCenteredImage(ctx, img, w, h);

      if (sp.glow !== false) {
        ctx.globalAlpha = 0.22;
        ctx.drawImage(img, -w * 0.7, -h * 0.7, w * 1.4, h * 1.4);
        ctx.globalAlpha = 1;
      }
    } else {
      // fallback si le sprite n’est pas chargé
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = cfg.color || "rgba(124,240,255,0.95)";
      ctx.beginPath();
      ctx.arc(0, 0, c.r || 24, 0, TAU);
      ctx.fill();

      ctx.globalAlpha = 0.18;
      ctx.beginPath();
      ctx.arc(0, 0, (c.r || 24) * 1.8, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    ctx.restore();
  }
}

function makeEnemy(type, x, y) {
  const factoryEntity = createNpcEntity({
    id: newId(),
    type,
    x,
    y,
    config: NPC_TYPES[type],
    wave,
  });
  if (!factoryEntity) return null;
  if (factoryEntity.bulletSprite?.src) getCachedImage(factoryEntity.bulletSprite.src);
  ensureNpcPreview(type);
  ensureNpcLoaded(type);
  enemiesById.set(factoryEntity.id, factoryEntity);
  const encounter = rules?.bossEncounter;
  if (encounter?.bossType === type) {
    factoryEntity._bossEncounter = {
      phase: 0,
      invulnerable: !!encounter.initialGuard,
      initialGuard: !!encounter.initialGuard,
      minionIds: [],
    };
    factoryEntity._stationaryBoss = !!encounter.stationary;
  }
  return factoryEntity;

}

// ============================================================
// Targeting 100% MANUEL (aucun auto-lock)
// ============================================================
const Target = (() => {
  let cur = null;

  function set(e) {
    const next = e && e.hp > 0 ? e : null;

    if (next !== cur && typeof attackActive !== "undefined" && attackActive) {
      stopAttack();
    }

    cur = next;
  }

  function clear() {
    cur = null;
  }

  function get() {
    if (!cur) return null;
    if (!enemies.includes(cur) || cur.hp <= 0) {
      cur = null;
      return null;
    }
    return cur;
  }

  return { set, clear, get };
})();

function spawnProtegitOnCubikonHit(cub, count = 30) {
  if (!cub || cub.hp <= 0) return;
  if (cub.type !== "npc_Cubikon") return;

  // ✅ Maximum de Protegit actifs liés à ce Cubikon
  const MAX_MINIONS = 80;

  const current = (cub._minionIds?.length || 0);
  if (current >= MAX_MINIONS) return;

  const wanted = Math.max(0, Math.floor(Number(count) || 30));
  const toSpawn = Math.min(wanted, MAX_MINIONS - current);

  for (let i = 0; i < toSpawn; i++) {
    const ang = Math.random() * Math.PI * 2;

    // ✅ Un peu plus large pour éviter que 150 Protegit spawn tous au même endroit
    const dist = 130 + Math.random() * 520;

    const sx = clamp(cub.x + Math.cos(ang) * dist, 80, WORLD.w - 80);
    const sy = clamp(cub.y + Math.sin(ang) * dist, 80, WORLD.h - 80);

    const m = makeEnemy("npc_Protegit", sx, sy);
    if (!m) continue;

    m.masterId = cub.id;
    m.anchorR = 1000 + Math.random() * 1000;
    m.anchorWanderT = 0;
    m.anchorTX = sx;
    m.anchorTY = sy;

    m.passiveNative = true;
    m._provoked = true;

    enemies.push(m);

    cub._minionIds.push(m.id);
  }
}

// ============================================================
// ✅ SAB-50 : vole uniquement le bouclier NPC
// ============================================================
const SAB50 = {
  // ✅ 0.5 = 50% des dégâts laser
  // Si tu voulais vraiment 0.5%, il faudrait mettre 0.005
  drainMult: 2,

  // ✅ 100% du bouclier volé va sur ton vaisseau
  transferPct: 1.0,

  // ✅ 2x plus rapide qu'un tir normal
  bulletSpeedMult: 1,
};

function drainShieldFromEnemy(e, amount, recipient = player) {
  if (!e || e.hp <= 0 || e._bossEncounter?.invulnerable) {
    return { total: 0, sh: 0, hp: 0, bypass: 0, isCrit: false, rawDamage: 0, sab: true };
  }

  const baseDamage = Math.max(1, Number(amount) || 1);
  const variance = 0.95 + Math.random() * 0.1;
  const isCrit = Math.random() < 0.05;
  const raw = baseDamage * variance * (isCrit ? 1.5 : 1);

  // ✅ La SAB ne touche QUE le bouclier.
  const stolen = drainShield(e, raw);

  if (stolen <= 0) {
    return { total: 0, sh: 0, hp: 0, bypass: 0, isCrit: false, rawDamage: 0, sab: true };
  }
  e._healthRevealed = true;
  triggerBossEncounterPhase(e, stolen);

  // ✅ Transfert vers ton vaisseau, sans dépasser ton shield max.
  const gain = stolen * SAB50.transferPct;
  if (recipient?.hp > 0) {
    recipient.sh = Math.min(recipient.shMax, recipient.sh + gain);
  }

  // ✅ Ça compte comme une attaque pour l'aggro / Cubikon.
  if (rules?.mode === "zone") {
    if (e.passiveNative) e._provoked = true;
    e._aggroT = e.aggroHold ?? 3.5;
    e._aggro = true;
  }

  // ✅ Si tu tapes le Cubikon à la SAB, ça déclenche aussi ses Protegit.
  if (e.type === "npc_Cubikon") {
    e._sinceHit = 0;

    if (e._resetting) {
      e._resetting = false;
      for (const m of enemies) {
        if (!m || m.hp <= 0) continue;
        if (m.type !== "npc_Protegit") continue;
        if (m.masterId !== e.id) continue;
        m.despawnDur = 0;
        m.despawnT = 0;
      }
    }

    if (!e._spawnedOnce) {
      e._spawnedOnce = true;

      e._animPhase = "delay";
      e._openDelayT = 2.0;
      e._holdLastT = 0;

      // Mets ici la même valeur que tu as choisie pour le Cubikon.
      // Pour 30 à 80 inclus :
      e._pendingSpawn = Math.floor(rand(30, 81));

      e.spritePlay = false;
      e.spriteDir = 1;
      e.spriteIdx = 0;
      e.spriteAcc = 0;
      e.angle = 0;
    }
  }

  return {
    total: stolen,
    sh: stolen,
    hp: 0,
    bypass: 0,
    isCrit,
    rawDamage: stolen,
    sab: true,
  };
}

// ============================================================
// Combat
// ============================================================
function damageEnemy(e, dmg) {
  if (!e || e.hp <= 0) return { total: 0, sh: 0, hp: 0, bypass: 0, isCrit: false, rawDamage: 0 };
  if (e._bossEncounter?.invulnerable) return emptyEnemyDamageResult();

  const result = damageEnemyLayers(e, dmg, { shieldPenetration: player.shPen });
  const shD = result.sh;
  const hpD = result.hp;
  if (result.total > 0) e._healthRevealed = true;
  triggerBossEncounterPhase(e, result.total);

  if (rules?.mode === "zone") {
    if (e.passiveNative) e._provoked = true;
    e._aggroT = e.aggroHold ?? 3.5;
    e._aggro = true;
  }

  if (e.type === "npc_Cubikon") {
    e._sinceHit = 0;

    if (e._resetting) {
      e._resetting = false;
      for (const m of enemies) {
        if (!m || m.hp <= 0) continue;
        if (m.type !== "npc_Protegit") continue;
        if (m.masterId !== e.id) continue;
        m.despawnDur = 0;
        m.despawnT = 0;
      }
    }

   if (!e._spawnedOnce && (shD + hpD) > 0) {
  e._spawnedOnce = true;

  e._animPhase = "delay";
  e._openDelayT = 2.0;      // ✅ ici ton délai
  e._holdLastT = 0;
e._pendingSpawn = Math.floor(rand(30, 80)); // ✅ entre 30 et 150 Protegit

  e.spritePlay = false;
  e.spriteDir = 1;
  e.spriteIdx = 0;
  e.spriteAcc = 0;

  e.angle = 0;
}


  }

  return result;
}

function hurtPlayer(amount) {
  if (player.dead || player.iFrames > 0) return;

  resetRepairCooldown();
  player.iFrames = 0.1;
  player.attackedT = 5;

  damagePlayerLayers(player, amount);

  addPlayerCombatFloat(amount, "rgba(255,80,100,0.95)");

  if (player.hp <= 0) {
    player.hp = 0;
    die();
  }
}

function killRewards(e) {
  player.kills++;
  const credits = Math.max(0, Number(e.value) || 0);
  player.credits += credits;
  const experience = getNpcExperienceReward(e, NPC_TYPES[e.type]);
  const honor = getNpcHonorReward(e, { ...NPC_TYPES[e.type], type: e.type });
  awardExperience(experience, "npc");
  awardHonor(honor);
  const npcName = String(NPC_TYPES[e.type]?.name || e.type || "NPC").replace(/^npc_/i, "");
  addGameLog(`${npcName} détruit · +${formatInteger(credits)} crédits · +${formatInteger(experience)} XP · +${formatInteger(honor)} honneur`, "reward");
  showNotificationGroup([
    `${npcName} éliminé`,
    `Vous avez reçu ${formatInteger(credits)} crédits`,
    `Vous avez gagné ${formatInteger(experience)} XP`,
    `Vous avez gagné ${formatInteger(honor)} honneur`,
  ]);
  if (account.user?.stats) account.user.stats.lifetimeKills = Math.max(0, Number(account.user.stats.lifetimeKills || 0)) + 1;
  if (account.user?.stats && e.type) {
    account.user.stats.npcKills ||= {};
    account.user.stats.npcKills[e.type] = Math.max(0, Number(account.user.stats.npcKills[e.type] || 0)) + 1;
  }

  markProgressDirty();
  // La sauvegarde temporisée regroupe les destructions rapprochées et évite
  // de sérialiser tout le compte au milieu de chaque frame de combat.
}

function emptyEnemyDamageResult() {
  return { total: 0, sh: 0, hp: 0, bypass: 0, isCrit: false, rawDamage: 0 };
}

function triggerBossEncounterPhase(boss, damageDone) {
  const config = rules?.bossEncounter;
  const state = boss?._bossEncounter;
  const phaseGroups = Array.isArray(config?.phaseGroups) ? config.phaseGroups : null;
  const phaseTypes = Array.isArray(config?.phaseTypes) ? config.phaseTypes : [];
  const phaseCount = phaseGroups?.length || phaseTypes.length;
  if (!state || state.invulnerable || damageDone <= 0 || state.phase >= phaseCount) return false;

  const durabilityMax = Math.max(1, Number(boss.hpMax || 0) + Number(boss.shMax || 0));
  const durability = Math.max(0, Number(boss.hp || 0) + Number(boss.sh || 0));
  const threshold = durabilityMax * (1 - (state.phase + 1) / phaseCount);
  if (durability > threshold) return false;

  if (boss.hp <= 0) boss.hp = 1;
  state.invulnerable = true;
  const phaseIndex = state.phase;
  state.phase++;
  state.minionIds.length = 0;

  const group = phaseGroups?.[phaseIndex] || [{ type: phaseTypes[phaseIndex], count: Math.max(1, Math.floor(Number(config.countPerPhase) || 15)) }];
  let totalCount = 0;
  for (const spawn of group) {
    const type = spawn?.type;
    const count = Math.max(1, Math.floor(Number(spawn?.count) || 1));
    totalCount += count;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * TAU;
      const distance = 180 + Math.random() * 520;
      const minion = makeEnemy(type, clamp(boss.x + Math.cos(angle) * distance, 80, WORLD.w - 80), clamp(boss.y + Math.sin(angle) * distance, 80, WORLD.h - 80));
      if (!minion) continue;
      minion.masterId = boss.id;
      minion._bossPhaseMinion = true;
      minion._provoked = true;
      enemies.push(minion);
      state.minionIds.push(minion.id);
    }
  }

  const encounterName = config?.name || "LOW";
  showNotification(`Phase ${state.phase} / ${phaseCount} — ${totalCount} ennemis`, 4, "info");
  addGameLog(`${encounterName} · Phase ${state.phase}/${phaseCount} · ${totalCount} ennemis`, "info");
  return true;
}

function updateBossEncounters() {
  if (!rules?.bossEncounter) return;
  for (const boss of enemies) {
    const state = boss?._bossEncounter;
    if (!state?.invulnerable || boss.hp <= 0) continue;
    const remaining = state.initialGuard
      ? waveSpawns.remaining > 0 || enemies.some(enemy => enemy?.hp > 0 && enemy !== boss)
      : enemies.some(enemy => enemy?.hp > 0 && enemy._bossPhaseMinion && enemy.masterId === boss.id);
    if (remaining) continue;
    state.invulnerable = false;
    state.initialGuard = false;
    state.minionIds.length = 0;
    showNotification(`Défense du ${NPC_TYPES[boss.type]?.name || boss.type} désactivée — le combat reprend`, 3, "info");
  }
}

function processDeaths() {
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    if (e.hp > 0) continue;

    spawnExplosion(e.x, e.y, e.isBoss ? 1.6 : 1.0);

let dropType = "Cargo_Box";

if (e.type === "npc_Blighted_Gygerthrall") {
  dropType = "Hybrid_Alloy_Box";
}

if (
  !e.noRewards &&
  e.type !== "npc_Protegit"
) {
  const dropCfg = COLLECTABLE_DEFS[dropType] || {};

  spawnCollectableAt(dropType, e.x, e.y, {
    armed: false,
    fromNpc: e.type,

    // ✅ timer selon la box
    despawnAfter: Number(dropCfg.npcDespawnAfter || 0),
  });
}


    if (e._onKill) {
      runOnKillAction(e._onKill, {
        x: e.x,
        y: e.y,
        bossMasterId: e._bossPhaseMinion ? e.masterId : null,
      });
      e._onKill = null;
    }
if (e.type === "npc_Cubikon") {
  for (const m of enemies) {
    if (!m || m.hp <= 0) continue;
    if (m.type !== "npc_Protegit") continue;
    if (m.masterId !== e.id) continue;

    // ✅ Quand le Cubikon meurt, tous ses Protegit explosent directement.
    // Pas de fuite, pas de suivi du joueur, pas de mort 1 par 1.
    m.value = 0;
    m.noRewards = true;
    m.despawnT = 0;
    m.despawnDur = 0;
    m.vx = 0;
    m.vy = 0;
    m.hp = 0;
    m.sh = 0;
  }
}

  //  if (e.type === "npc_Cubikon") {
   //   for (const m of enemies) {
   //     if (!m || m.hp <= 0) continue;
   //     if (m.type !== "npc_Protegit") continue;
    //    if (m.masterId !== e.id) continue;

    //    m.despawnT = 0;
    //    m.despawnDur = 6 + Math.random() * 5;
   //   }
   // }

    if (!e.noRewards) {
      advanceQuestProgress("kill", e.type);
      killRewards(e);
    }
    
    if (e.type === "npc_Protegit" && e.masterId) {
      const cub = getEnemyById(e.masterId);
      if (cub && Array.isArray(cub._minionIds)) {
        cub._minionIds = cub._minionIds.filter(id => id !== e.id);
      }
    }

    enemies.splice(i, 1);
  }
}

let gateCompletionPending = false;

function scheduleGalaxyGateCompletion(gateId, completion) {
  if (gateCompletionPending) return;
  gateCompletionPending = true;
  if (escortShips.length || rules?.escort) {
    const escortGateId = String(gateId).toLowerCase();
    escortShips.length = 0;
    try {
      sessionStorage.removeItem(`orbit_gate_escorts_${escortGateId}`);
      if (escortGateId === "qz") sessionStorage.removeItem("orbit_qz_escorts");
    } catch {}
  }
  attackActive = false;
  player.vx = 0;
  player.vy = 0;
  moveTarget.active = false;
  const gate = GALAXY_GATE_DEFINITIONS[gateId];
  const reward = completion.reward || gate?.completion;
  const user = account.user || getCurrentUserFull();
  const destinationMap = getFactionRespawnMap(user?.faction, gateId, { gate: true });
  const destinationReady = Promise.resolve(window.__PRELOAD_MAP__?.(destinationMap)).catch((error) => {
    console.warn("Préchargement de la base mère incomplet :", error);
  });
  const gateName = completion.name || gate?.name || gateId;
  const stillInCompletedGate = () => String(window.__CURRENT_MAP_ID__ || "").toLowerCase() === gateId;
  const scheduleCountdown = (startDelay) => {
    [3, 2, 1].forEach((second, index) => {
      setTimeout(() => {
        if (stillInCompletedGate()) showNotification(String(second), 4, "info", { log: false });
      }, startDelay + index * 1000);
    });
  };

  scheduleCountdown(0);

  setTimeout(() => {
    if (!stillInCompletedGate() || !reward) return;
    const messages = [
      `Vous avez gagné ${formatInteger(reward.exp)} XP`,
      `Vous avez gagné ${formatInteger(reward.honor)} honneur`,
      `Vous avez reçu ${formatInteger(reward.credits)} crédits`,
      ...(Number(reward.x4) > 0 ? [`Vous avez reçu ${formatInteger(reward.x4)} UCB-100`] : []),
      ...(Array.isArray(reward.resourceMessages) ? reward.resourceMessages : []),
    ];
    showNotificationGroup(messages, "reward");
    addGameLog(`${gateName} · ${messages.join(" · ")}`, "reward");
  }, 3000);

  scheduleCountdown(3700);

  setTimeout(() => {
    if (!stillInCompletedGate()) return;
    showNotification(`Galaxy Gate ${gateName} terminée`, 4, "reward", { log: false, goldTerms: [gateName] });
    addGameLog(`Galaxy Gate ${gateName} terminée`, "reward");
  }, 6700);

  setTimeout(async () => {
    if (!stillInCompletedGate()) return;
    await destinationReady;
    if (!stillInCompletedGate()) return;
    setRespawnOverride({ map: destinationMap, baseCenter: true, fallback: getFactionBaseSpawn(user?.faction) });
    addGameLog(`Retour vers la base mère ${destinationMap}`, "info");
    gateCompletionPending = false;
    if (typeof window.__SWITCH_MAP__ === "function" && String(destinationMap) !== gateId) {
      try {
        await window.__SWITCH_MAP__(destinationMap);
        return;
      } catch (error) {
        console.error("Retour interne après Galaxy Gate impossible :", error);
      }
    }
    if (typeof window.__GO_TO_MAP__ === "function" && String(destinationMap) !== gateId) window.__GO_TO_MAP__(destinationMap);
    else resetRun({ randomSpawn: false });
  }, 8500);
}

function runOnKillAction(action, pos = null) {
  if (!action) return;

  if (action.spawn) {
    const ox = pos?.x ?? player.x;
    const oy = pos?.y ?? player.y;

    for (const s of action.spawn) {
      const count = Math.max(1, Number(s.count || 1));
      const radius = Math.max(40, Number(s.radius || 260));

      for (let i = 0; i < count; i++) {
        const ang = Math.random() * Math.PI * 2;
        const d = 60 + Math.random() * radius;

        const sx = clamp(ox + Math.cos(ang) * d, 80, WORLD.w - 80);
        const sy = clamp(oy + Math.sin(ang) * d, 80, WORLD.h - 80);

        const en = makeEnemy(s.type, sx, sy);
        if (en) {
          if (pos?.bossMasterId) {
            en.masterId = pos.bossMasterId;
            en._bossPhaseMinion = true;
            en._provoked = true;
          }
          enemies.push(en);
        }
      }
    }
  }

  const reward = Number(action.reward || 0);
  if (reward > 0) {
    player.credits += reward;
    markProgressDirty();
    saveProgressNow();
    showToast(`GG ! +${reward} Cr.`, 2.2);
  }

  if (action.completeSpecialGate) {
    const special = action.completeSpecialGate;
    const specialReward = special.reward || {};
    const credits = Math.max(0, Math.floor(Number(specialReward.credits) || 0));
    const experience = Math.max(0, Math.floor(Number(specialReward.exp) || 0));
    const honor = Math.max(0, Math.floor(Number(specialReward.honor) || 0));
    const x4 = Math.max(0, Math.floor(Number(specialReward.x4) || 0));
    const resourceMessages = [];
    player.credits += credits;
    player.ammo.x4 += x4;
    if (!account.user) loadAccountUser();
    if (account.user && specialReward.resources && typeof specialReward.resources === "object") {
      account.user.inventory ||= {};
      account.user.inventory.resources ||= {};
      for (const [resourceId, range] of Object.entries(specialReward.resources)) {
        const amount = rollValue(range, 0);
        if (amount <= 0) continue;
        account.user.inventory.resources[resourceId] = Math.max(0, Number(account.user.inventory.resources[resourceId]) || 0) + amount;
        resourceMessages.push(`Vous avez reçu ${formatInteger(amount)} ${getResourceName(resourceId, amount)}`);
      }
    }
    awardExperience(experience);
    awardHonor(honor);
    updateAmmoUI();
    advanceQuestProgress("gate", String(special.gateId || "low").toLowerCase());
    markProgressDirty();
    saveProgressNow();
    scheduleGalaxyGateCompletion(String(special.gateId || "low").toLowerCase(), {
      name: special.name || "LOW",
      reward: { credits, exp: experience, honor, x4, resourceMessages },
    });
    return;
  }

  const tp = action.tp;
  if (tp?.toMap || tp?.factionBase) {
    const currentGateId = String(window.__CURRENT_MAP_ID__ || "").toLowerCase();
    if (rules?.mode === "gate" && tp.factionBase && GALAXY_GATE_DEFINITIONS[currentGateId]) {
      const completion = completeCurrentUserGalaxyGate(currentGateId);
      if (completion.ok) {
        advanceQuestProgress("gate", currentGateId);
        account.user = completion.user;
        player.credits = completion.user.credits;
        player.ammo.x4 = completion.user.ammo.x4;
        updateAmmoUI();
        markProgressDirty();
        renderGalaxyGateWindow(`${GALAXY_GATE_DEFINITIONS[currentGateId].name} terminée`);
        scheduleGalaxyGateCompletion(currentGateId, completion);
      }
      return;
    }
    const destinationMap = rules?.mode === "gate"
      ? getFactionRespawnMap((account.user || getCurrentUserFull())?.faction, window.__CURRENT_MAP_ID__, { gate: true })
      : tp.toMap;
    const destinationPosition = rules?.mode === "gate"
      ? { baseCenter: true, fallback: getFactionBaseSpawn((account.user || getCurrentUserFull())?.faction) }
      : { x: tp.x, y: tp.y };
    setRespawnOverride({ map: destinationMap, ...destinationPosition });

    const cur = window.__CURRENT_MAP_ID__ || "1-1";
    if (typeof window.__GO_TO_MAP__ === "function" && String(cur) !== String(destinationMap)) {
      window.__GO_TO_MAP__(destinationMap);
      return;
    }

    resetRun({ randomSpawn: false });
  }
}

// ============================================================
// Compétence IEM
// ============================================================
const PULSE_COST = 30000;

const PULSE_COOLDOWN = 10.0;

let pulseCd = 0;
let iemCd = 0;

function canUseSkill(cost) {
  return started && !player.dead && player.credits >= cost;
}

function updateSkillUI() {
  const pulseOk = canUseSkill(PULSE_COST) && pulseCd <= 0;
  
  setHudClass(ui.btnPulse, "disabled", !pulseOk);
  setHudClass(ui.btnPulse, "ready", pulseOk);
  syncActionDockState();
}

function npcIsEngagingPlayer(enemy) {
  if (!enemy || enemy.hp <= 0) return false;

  if (rules?.mode === "zone") {
    return enemy._aggro === true || enemy.aiZ?.state === "aggro" || enemy._attackedPlayerRecently === true;
  }

  return enemy._combatTargetId === "player" || enemy._aggro === true || enemy._attackedPlayerRecently === true;
}

function usePulse() {
  const PULSE_DISABLE = 3.0;

  if (!started || player.dead) return;

  if (pulseCd > 0) {
    showToast(`Pulse en recharge (${pulseCd.toFixed(1)}s)`, 0.9);
    return;
  }

  if (player.credits < PULSE_COST) {
    showToast("Pas assez de crédits (Pulse)", 1.2);
    return;
  }

  player.credits -= PULSE_COST;
  pulseCd = PULSE_COOLDOWN;
  spawnPulseFx(player.x, player.y, 1, true);

  markProgressDirty();

  showToast("IEM !", 1.0);

  let touched = 0;
  for (const e of enemies) {
    if (!npcIsEngagingPlayer(e)) continue;

    e.empT = Math.max(e.empT || 0, PULSE_DISABLE);
    e._aggro = false;
    e._aggroT = 0;
    e._attackedPlayerRecently = false;

    touched++;
  }

  if (touched <= 0) showToast("IEM : aucune cible", 0.9);
}

ui.btnPulse.addEventListener("click", () => {
  if (!ui.btnPulse.classList.contains("disabled")) usePulse();
});

if (ui.respawnBaseBtn) {
  ui.respawnBaseBtn.addEventListener("click", (e) => {
    e.preventDefault();
    respawnBase();
  });
}

if (ui.respawnPortalBtn) {
  ui.respawnPortalBtn.addEventListener("click", (e) => {
    e.preventDefault();
    respawnNearestPortal();
  });
}

if (ui.respawnHereBtn) {
  ui.respawnHereBtn.addEventListener("click", (e) => {
    e.preventDefault();
    respawnHere();
  });
}

// ============================================================
// Laser
// ============================================================
const LASER = {
  chance: 1,
  minCd: 3.0,
  maxCd: 5.0,
  lenExtra: -300,
  width: 30,
  hitWidth: 30,
  baseDmg: 20000,
  falloff: 0.8,
  visualExtraLen: 900,
  hitExtraLen: 900,
};

let laserCd = 2.0;

function maybeTriggerLaser() {
  if (laserCd > 0) return;
  if (Math.random() > LASER.chance) return;
  const t = Target.get();
  if (t) spawnLaser(player.x, player.y, player.angle, t.id);
  laserCd = rand(LASER.minCd, LASER.maxCd);
}

function spawnLaser(x, y, ang, targetId) {
  const target = getEnemyById(targetId);
  if (!target) return;

  const len = playerRange + LASER.lenExtra;
  const hitLen = len + (LASER.hitExtraLen || 0);
  const start = player.r + 18;
  const segMax = start + hitLen;

  const dx = Math.cos(ang), dy = Math.sin(ang);

  const fps = LASER_PACK.fps || 20;
  const durVis = LASER_PACK.frames / fps;

  pushBounded(lasers, { x, y, ang, len, t: 0, dur: durVis, width: LASER.width, targetId }, ENTITY_LIMITS.lasers);

  const rx = target.x - x;
  const ry = target.y - y;

  const proj = rx * dx + ry * dy;
  if (proj < 0 || proj > segMax) return;

  const dist2ToLine = rx * rx + ry * ry - proj * proj;
  const rad = (target.r || 18) + LASER.hitWidth;
  if (dist2ToLine > rad * rad) return;

  const variance = 0.95 + Math.random() * 0.10;
  let dmg = LASER.baseDmg * (player.laserDmgMult || 1) * variance;

  const CRIT_CHANCE = 0.05;
  const CRIT_MULT = 1.50;
  const isCrit = Math.random() < CRIT_CHANCE;

  if (isCrit) {
    dmg *= CRIT_MULT;
  }

  const rawDamage = dmg;

  const out = damageEnemy(target, dmg);

  if (out.total > 0) {
    const n = Math.max(1, Math.round(rawDamage));
    
    const col = isCrit 
      ? "rgba(255,220,50,0.98)"
      : "rgba(179,66,255,0.95)";

    const opts = {
      size: 18,
      pop: 0.3,
      shake: 0.6,
      life: 1,
      glow: isCrit ? 1.4 : 1.0,
      weight: 900,
      impact: true
    };

    const offsetX = (Math.random() - 0.5) * 60;
    const offsetY = -60 - Math.random() * 20;

    addFloatText(target.x + offsetX, target.y + offsetY, n, col, opts);
    spawnSpark(target.x, target.y, true);
  }
}

// ============================================================
// Shooting (attaque continue sans maintenir)
// ============================================================
let attackActive = false;

function startAttack(ammoOverride = null) {
  const currentAmmo = player.ammo.active || "x1";

  if (ammoOverride && attackActive && ammoOverride === currentAmmo) {
    stopAttack();
    return;
  }

  if (ammoOverride) setAmmo(ammoOverride);

  if (attackActive && ammoOverride) return;

  if (attackActive) {
    stopAttack();
    return;
  }

  if (player.dead || !started) return;

  const t = Target.get();
  if (!t) return;

  attackActive = true;
  tryFireOnce(null, true);
}

function stopAttack() {
  attackActive = false;
}

function toggleAttack() {
  if (attackActive) stopAttack();
  else startAttack();
}

function tickAutoAttack(dt) {
  if (!attackActive) return;
  if (player.dead || !started) return;

  const t = Target.get();
  if (!t) {
    stopAttack();
    return;
  }

  const d2 = dist2(player.x, player.y, t.x, t.y);
  if (d2 > playerRange * playerRange) return;

  if (fireCooldown <= 0) {
    tryFireOnce(null, true);
  }
}

const SIDE_OFFSET = 30;
const SIDE_DMG_SPLIT = 0.5;

const PLAYER_SHOT_SFX = { 
  x1: "pShotX1", 
  x2: "pShotX2", 
  x3: "pShotX3", 
  x4: "pShotX4", 
  x6: "pShotX4" 
};

function playPlayerShot(ammoKey) {
  const id = PLAYER_SHOT_SFX[ammoKey] || PLAYER_SHOT_SFX.x1;
  SFX.play(id, { vol: 0.28, rate: 0.98 + Math.random() * 0.04, cooldown: 0.02, maxVoices: 2 });
}

let fireCooldown = 0;

const RSB_COOLDOWN = 5.0;
let rsbCooldown = 0;

const enemiesById = new Map();

function rebuildEnemyIndex() {
  rebuildIdIndex(enemiesById, enemies);
}

function getEnemyById(id) {
  if (id == null) return null;
  const enemy = enemiesById.get(id);
  return enemy?.hp > 0 ? enemy : null;
}

let volleySeq = 1;
const VOLLEY_FLOAT_TIMEOUT = 0.08;
const pendingVolleys = new Map();

function flushVolleyKey(key, v) {
  pendingVolleys.delete(key);
  if (!v || v.rawDamage <= 0) return;

  const n = Math.max(1, Math.round(v.rawDamage));

  const col = v.isCrit 
    ? "rgba(255,220,50,0.98)"
    : (v.hp > 0 
        ? "rgba(255,107,122,0.95)"
        : "rgba(124,240,255,0.95)");

  const opts = {
    size: 18,
    pop: 0.3,
    shake: 0.6,
    life: 1,
    glow: v.isCrit ? 1.4 : 1.0,
    weight: 900,
    impact: true
  };

  const offsetX = (Math.random() - 0.5) * 60;
  const offsetY = -40 - Math.random() * 20;

  addFloatText(v.x + offsetX, v.y + offsetY, n, col, opts);
}

function queueVolleyFloat(target, out, volleyId, volleySize) {
  if (!target || !out) return;

  const key = `${volleyId}:${target.id}`;
  let v = pendingVolleys.get(key);
  if (!v) {
    v = {
      t: 0,
      need: Math.max(1, volleySize || 1),
      got: 0,
      total: 0,
      hp: 0,
      sh: 0,
      rawDamage: 0,
      x: target.x,
      y: target.y,
      r: target.r || 18,
      isCrit: false
    };
    pendingVolleys.set(key, v);
  }

  v.t = 0;
  v.got++;
  v.total += out.total || 0;
  v.hp += out.hp || 0;
  v.sh += out.sh || 0;
  v.rawDamage += out.rawDamage || 0;
  v.x = target.x;
  v.y = target.y;
  v.r = target.r || v.r;

  if (out.isCrit) v.isCrit = true;

  if (v.got >= v.need) flushVolleyKey(key, v);
}

function tickVolleyFloats(dt) {
  if (!pendingVolleys.size) return;
  for (const [key, v] of pendingVolleys) {
    v.t += dt;
    if (v.t >= VOLLEY_FLOAT_TIMEOUT) flushVolleyKey(key, v);
  }
}

function tryFireOnce(ammoOverride = null, silent = false) {
  if (player.dead) return false;

  if (ammoOverride) setAmmo(ammoOverride);

  const t = Target.get();
  if (!t) return false;

  const volleyId = volleySeq++;
  const volleySize = player.altShot ? 2 : 1;
  const targetId = t.id;

  if (!t) return false;

  const d2 = dist2(player.x, player.y, t.x, t.y);
  if (d2 > playerRange * playerRange) return false;

  if (fireCooldown > 0) return false;

  let ammoKey = player.ammo.active || "x1";

  if (ammoKey === "x6" && rsbCooldown > 0) {
    ammoKey = "x1";
  }

  player.angle = Math.atan2(t.y - player.y, t.x - player.x);

  const ammoCfg = AMMO[ammoKey] || AMMO.x1;

  const baseCd = 1 / Math.max(0.001, player.baseFireRate * player.fireRateMult);
  fireCooldown = typeof ammoCfg.cooldown === "number" ? ammoCfg.cooldown : baseCd;

  const mult = ammoCfg.mult || 1;

  playPlayerShot(ammoKey);

  const activeKey = player.ammo.active || "x1";
  if (ammoKey === activeKey) consumeAmmo(1);

const isSab = ammoKey === "sab";

// ✅ Vitesse différente pour la SAB-50
const speed = isSab
  ? player.baseBulletSpeed * SAB50.bulletSpeedMult
  : player.baseBulletSpeed;

const life = bulletLifeForRange(playerRange, speed);

// ✅ SAB-50 ne fait pas de dégâts HP.
// Elle utilise ta puissance laser comme quantité de bouclier à voler.
const dmgShot = isSab
  ? player.baseDamage * SAB50.drainMult
  : player.baseDamage * mult * (1 + Number(getActiveDroneFormation(account.user).effects?.npcDamagePct || 0) / 100);

  const shotMiss = Math.random() < PLAYER_SHOTS.missChance;

  const ang = player.angle;
  const fx = Math.cos(ang), fy = Math.sin(ang);
  const px = -fy, py = fx;

  const muzzleX = player.x + fx * (player.r + 10);
  const muzzleY = player.y + fy * (player.r + 10);

  if (!player.altShot) {
addCappedProjectile(bullets, {
  x: muzzleX,
  y: muzzleY,
  vx: fx * speed,
  vy: fy * speed,
  r: 6.0,
  life,
  dmg: dmgShot,
  key: ammoKey,
  side: "player",
  targetId,
  homing: true,
  spd: speed,
  volleyId,
  volleySize,
    isSab,
  miss: shotMiss,
}, ENTITY_LIMITS.playerBullets);
  } else {
    const ox = px * SIDE_OFFSET;
    const oy = py * SIDE_OFFSET;

    const leftX = muzzleX + ox, leftY = muzzleY + oy;
    const rightX = muzzleX - ox, rightY = muzzleY - oy;

    const ldx0 = t.x - leftX, ldy0 = t.y - leftY;
    const rdx0 = t.x - rightX, rdy0 = t.y - rightY;

    const ll = Math.hypot(ldx0, ldy0) || 1;
    const rl = Math.hypot(rdx0, rdy0) || 1;

    const ldx = ldx0 / ll, ldy = ldy0 / ll;
    const rdx = rdx0 / rl, rdy = rdy0 / rl;

addCappedProjectile(bullets, {
  x: leftX,
  y: leftY,
  vx: ldx * speed,
  vy: ldy * speed,
  r: 6.0,
  life,
  dmg: dmgShot * SIDE_DMG_SPLIT,
  key: ammoKey,
  side: "player",
  targetId,
  homing: true,
  spd: speed,
  volleyId,
  volleySize,
    isSab,
  miss: shotMiss,
}, ENTITY_LIMITS.playerBullets);

addCappedProjectile(bullets, {
  x: rightX,
  y: rightY,
  vx: rdx * speed,
  vy: rdy * speed,
  r: 6.0,
  life,
  dmg: dmgShot * SIDE_DMG_SPLIT,
  key: ammoKey,
  side: "player",
  targetId,
  homing: true,
  spd: speed,
  volleyId,
  volleySize,
    isSab,
  miss: shotMiss,
}, ENTITY_LIMITS.playerBullets);
  }

  if (ammoKey === "x6") rsbCooldown = RSB_COOLDOWN;

  player.altShot = !player.altShot;
  maybeTriggerLaser();
  player.combatT = 5.0;
  return true;
}

// ✅ Zone map spawner
let isZoneMap = rules?.mode === "zone";
let zoneCamps = [];
let zonePortals = [];
let zoneWalls = [];
let zoneSafe = null;
let mapPortalLock = 0;
let portalHintCd = 0;

let safeZoneActive = false;
let safeZoneX = 0;
let safeZoneY = 0;
let safeZoneR = 0;

// Rayon général de tous les portails
const DEFAULT_PORTAL_RADIUS = 450;

const SAFE_ZONE_MARGIN = 450;

function getCurrentZoneMapId() {
  return String(window.__CURRENT_MAP_ID__ || rules?.mapLabel || "").trim().toLowerCase();
}

function portalProvidesSafety(portal) {
  const mapId = getCurrentZoneMapId();
  if (/^[123]-4\.1$/.test(mapId) || mapId === "4-4.123" || mapId === "4-5") return false;
  const sectorMatch = mapId.match(/^([123])-/);
  const playerSector = getFaction((account.user || getCurrentUserFull())?.faction).sector;
  if (sectorMatch && sectorMatch[1] !== playerSector) return false;
  const destination = String(portal?.toMap || "").trim().toLowerCase();
  return !["alpha", "beta", "gamma"].includes(destination);
}

function baseProvidesSafety() {
  const center = zoneSafe?.modules?.find(module => String(module?.id || "").startsWith("CENTRE_"));
  if (!center) return false;
  const owner = String(center.id).slice("CENTRE_".length).toLowerCase();
  if (owner === "pirates" || owner === "pirate") return true;
  return owner === getFaction((account.user || getCurrentUserFull())?.faction).id;
}

function npcIsInSafeZone(e) {
  if (!isZoneMap) return false;
  
  if (zonePortals && zonePortals.length) {
    for (const p of getInteractivePortals()) {
      if (!portalProvidesSafety(p)) continue;
      const rr = DEFAULT_PORTAL_RADIUS + SAFE_ZONE_MARGIN;
      if (dist2(e.x, e.y, p.x, p.y) <= rr * rr) {
        return true;
      }
    }
  }

  if (baseProvidesSafety() && zoneSafe?.zone?.kind === "circle") {
    const z = zoneSafe.zone;
    const rr = (z.r || 0) + SAFE_ZONE_MARGIN;
    if (dist2(e.x, e.y, z.x, z.y) <= rr * rr) {
      return true;
    }
  }

  return false;
}

// ============================================================
// Wave system
// ============================================================
let wave = 1;
const waveSpawns = createWaveSpawnState();
const GATE_WAVE_COUNTDOWN_SECONDS = 5;
let waveStartCountdown = 0;
let waveCountdownSecond = -1;

  function nextTypeInQueue() {
    return waveSpawns.peek()?.type || null;
  }

function updateWaveCountdownNotice() {
  const second = Math.max(1, Math.ceil(waveStartCountdown));
  if (second === waveCountdownSecond) return;
  waveCountdownSecond = second;
  showNotification(String(second), 4, "info", { log: false });
}

function finishWaveCountdownNotice() {
  const gateId = String(window.__CURRENT_MAP_ID__ || "").toLowerCase();
  const gateName = GALAXY_GATE_DEFINITIONS[gateId]?.name || rules?.mapLabel || gateId;
  showNotification(`La vague ${wave} de la Galaxy Gate ${gateName} commence`, 4, "info", {
    log: false,
    goldTerms: [gateName],
  });
}

function beginWave() {
  const plan = getWavePlan(wave);
  currentWavePlan = plan;

  waveSpawns.load(plan.spawns || []);
  betweenWaves = false;
  waveStartCountdown = rules?.mode === "gate" ? GATE_WAVE_COUNTDOWN_SECONDS : 0;
  waveCountdownSecond = -1;

  portal.active = false;
  gateReturnPortal.active = false;
  ui.portalOverlay.style.display = "none";
  ui.nextWaveBtn.disabled = false;

  if (waveStartCountdown > 0) updateWaveCountdownNotice();
}

function onWaveCleared() {
  if (gateCompletionPending) return;
  betweenWaves = true;
  resetGatePortalState(portal, { active: true, switchDuration: portal.switchDur });
  portal.switchDur = Math.max(0.1, Number(portal.switchDur || 1));
  portal.holdDur = Math.max(0.1, Number(portal.holdDur || 1.5));
  resetGatePortalState(gateReturnPortal, { active: true, switchDuration: portal.switchDur });
  positionGateChoicePortals(WORLD, portal, gateReturnPortal, 840);
  portal.startAfterSwitch = false;

  if (ui.portalOverlay) ui.portalOverlay.style.display = "none";
}

function tryStartNextWave() {
  if (!started || player.dead) return;
  if (!betweenWaves) return;

  if (portal.switching || portal.holding) return;

  portal.switching = true;
  portal.switchT = 0;

  portal.open = false;
  portal.holding = false;
  portal.holdT = 0;

  portal.startAfterSwitch = true;
}

function waveController(dt) {
  if (!started || player.dead || betweenWaves) return;

  if (waveStartCountdown > 0) {
    waveStartCountdown = Math.max(0, waveStartCountdown - dt);
    if (waveStartCountdown > 0) {
      updateWaveCountdownNotice();
      return;
    }
    finishWaveCountdownNotice();
  }

if (waveSpawns.remaining > 0 && enemies.length < MAX_ALIVE) {
  if (waveSpawns.tick(dt)) {
    const next = waveSpawns.peek();
    const type = next?.type || DEFAULT_WAVE_TYPE;
    const isCubikon = (type === "npc_Cubikon");
    const isEncounterBoss = rules?.bossEncounter?.bossType === type;

    const extra = clamp((wave - 1) * 40, 0, 2200);
    const minD = 1800 + extra;
    const maxD = 3400 + extra;

    const encounterPosition = rules?.bossEncounter?.position;
    const pos = isEncounterBoss
      ? {
          x: Number.isFinite(Number(encounterPosition?.x)) ? Number(encounterPosition.x) : WORLD.w * (Number(encounterPosition?.xRatio) || 0.5),
          y: Number.isFinite(Number(encounterPosition?.y)) ? Number(encounterPosition.y) : WORLD.h * (Number(encounterPosition?.yRatio) || 0.5),
        }
      : (isCubikon ? spawnAtSafeDistance(minD, maxD, 700) : spawnRandomOnMap());

    const { x, y } = pos;

    const e = makeEnemy(type, x, y);
    if (e) {
      e._onKill = next?.onKill || null;
      if (!isEncounterBoss && rules?.bossEncounter?.initialGuard) e._bossInitialGuard = true;
      enemies.push(e);
    }

    waveSpawns.consume();
  }
}


  if (waveSpawns.remaining === 0 && enemies.length === 0) {
    onWaveCleared();
  }
}

function zoneController(dt) {
  if (!started || player.dead) return;
  if (!isZoneMap) return;

  const curMap = currentMapId();

for (let i = collectables.length - 1; i >= 0; i--) {
  if (collectables[i]?.map && String(collectables[i].map) !== curMap) {
    collectables.splice(i, 1);
  }
}

  for (const camp of zoneCamps) {
    camp.t -= dt;
    if (camp.t > 0) continue;

    let alive = 0;
    for (const e of enemies) {
      if (!e || e.hp <= 0) continue;
      if (e.homeCampId === camp.id) alive++;
    }

    if (alive < (camp.maxAlive || 0)) {
      let x = 0, y = 0;

      if (camp.type === "npc_Cubikon") {
  x = camp.x;
  y = camp.y;
} else {
  const pos = spawnRandomOnMap();
  x = pos.x;
  y = pos.y;
}



      const e = makeEnemy(camp.type, x, y);
      if (e) {
        e.homeX = null;
        e.homeY = null;
        e.homeCampId = camp.id;

        e.wanderMode = true;
        e.aggroRange = camp.aggroRange ?? 700;
        e.aggroHold = camp.aggroHold ?? 3.5;

        enemies.push(e);
      }
    }

    camp.t = camp.respawn ?? 1.5;
  }
}

// ============================================================
// Death / Respawn
// ============================================================
function resetRun({ randomSpawn = false, preparedZoneCamps = null, preparedZonePortals = null } = {}) {
  let spawnedFromPortal = false;
  attackActive = false;
  betweenWaves = false;
  pendingVolleys.clear();

  portal.active = false;
  gateReturnPortal.active = false;
  if (ui.portalOverlay) ui.portalOverlay.style.display = "none";

bullets.length = 0;
enemyBullets.length = 0;
enemies.length = 0;
escortShips.length = 0;
pickups.length = 0;
collectables.length = 0;
sparks.length = 0;
floatTexts.length = 0;
lasers.length = 0;
engineTrails.length = 0;
collectableSpawnT = 0;

  fireCooldown = 0;
  laserCd = 2.0;
  rsbCooldown = 0;

  const u = loadAccountUser();

  if (u?.ship) {
    const found = SHIP_PACKS.find(p => p.id === u.ship);
    if (found) ACTIVE_SHIP = found;
  }

  resetPlayerToBase({ keepCredits: true });

  if (u) {
    player.credits = Number(u.credits || 0);

const a = u.ammo || {};
player.ammo = {
  active: "x1",
  x1: Infinity,
  x2: Number(a.x2 || 0),
  x3: Number(a.x3 || 0),
  x4: Number(a.x4 || 0),
  sab: Number(a.sab || 0),
  x6: Number(a.x6 || 0),
};
    setAmmo("x1");
    updateAmmoUI();
  }

  moveTarget.active = false;
  Target.clear();

  if (isZoneMap && typeof rules.getZoneSpawns === "function") {
    zoneCamps = (preparedZoneCamps || rules.getZoneSpawns(WORLD)).map((c, idx) => ({
      id: idx + 1,
      ...c,
      t: 0,
    }));
  } else {
    zoneCamps = [];
  }

if (isZoneMap && typeof rules.getZonePortals === "function") {
  zonePortals = (preparedZonePortals || rules.getZonePortals(WORLD) || []).map((p, i) => ({
    id: p.id ?? String(i + 1),
    ...p,

    buttonHovered: false,
    buttonPressed: false,

    switching: false,
    switchT: 0,

    open: false,
    holding: false,
    holdT: 0,

    autoOpen: p.autoOpen ?? true,

jumping: false,
jumpT: 0,
jumpDur: Math.max(0.1, Number(p.jumpDur ?? 2)),
jumpMap: null,
jumpPortal: null,
jumpSwitchPending: false,

closing: false,
closeT: 0,
closeFrom: 0,
closeDur: Math.max(0.1, Number(p.closeDur ?? portal.switchDur ?? 1)),

jumpSwitching: false,
jumpSwitchT: 0,
jumpSwitchDur: Math.max(0.1, Number(p.jumpSwitchDur ?? portal.switchDur ?? 1)),
jumpBaseFade: 1,
  }));

  for (const ptl of zonePortals) {
    preloadPortalSprites(ptl);
  }
} else {
  zonePortals = [];
}

  if (isZoneMap && typeof rules.getZoneSafeModules === "function") {
    zoneSafe = rules.getZoneSafeModules(WORLD) || null;
  } else {
    zoneSafe = null;
  }

  if (!spawnedFromPortal) {
    try {
      const transfer = JSON.parse(sessionStorage.getItem("orbit_faction_transfer") || "null");
      const currentMap = String(window.__CURRENT_MAP_ID__ || "1-1");
      if (transfer && String(transfer.map || "") === currentMap) {
        const center = resolveBaseCenter(zoneSafe, transfer.fallback);
        const baseX = center.x;
        const baseY = center.y;
        if (Number.isFinite(baseX) && Number.isFinite(baseY)) {
          player.x = clamp(baseX, 80, WORLD.w - 80);
          player.y = clamp(baseY, 80, WORLD.h - 80);
          spawnedFromPortal = true;
        }
        sessionStorage.removeItem("orbit_faction_transfer");
      }
    } catch {}
  }

  if (isZoneMap && typeof rules.getZoneWalls === "function") {
    zoneWalls = rules.getZoneWalls(WORLD) || [];
  } else {
    zoneWalls = [];
  }

  if (!spawnedFromPortal) {
    const currentMap = window.__CURRENT_MAP_ID__ || "1-1";
    const ov = popRespawnOverride();

    if (ov && String(ov.map || "") === String(currentMap)) {
      const position = ov.baseCenter ? resolveBaseCenter(zoneSafe, ov.fallback) : ov;
      const fallbackSpawn = getFactionFallbackSpawn();
      player.x = clamp(Number(position.x) || fallbackSpawn.x, 80, WORLD.w - 80);
      player.y = clamp(Number(position.y) || fallbackSpawn.y, 80, WORLD.h - 80);
      if (ov.respawn === true) {
        player.hp = Math.max(1, Math.ceil(player.hpMax * 0.1));
        player.sh = player.shMax > 0 ? Math.max(1, Math.ceil(player.shMax * 0.1)) : 0;
        player.repairT = Math.max(0, REPAIR.cooldown - 5);
        player.repairTickT = 0;
      }
      spawnedFromPortal = true;
      console.log(`[RESPAWN] Override spawn: ${player.x}, ${player.y} on ${currentMap}`);
    }
  }

  if (isZoneMap && zonePortals.length) {
    let wantPortal = null;
    let wantMap = null;

    try {
      wantPortal = sessionStorage.getItem("spawnPortalId");
      wantMap = sessionStorage.getItem("spawnMapId");
      
      sessionStorage.removeItem("spawnPortalId");
      sessionStorage.removeItem("spawnMapId");
    } catch {}

    const currentMap = window.__CURRENT_MAP_ID__ || "1-1";
    
    if (wantPortal && wantMap && String(wantMap) === String(currentMap)) {
      const pid = String(wantPortal);
      const ptl = zonePortals.find(p => String(p.id) === pid);

      if (ptl) {
        player.x = clamp(ptl.x, 80, WORLD.w - 80);
        player.y = clamp(ptl.y, 80, WORLD.h - 80);
        spawnedFromPortal = true;
        console.log(`[SPAWN] Arrivée via portail ${pid} sur map ${currentMap}`);
      }
    }
  }

  if (!spawnedFromPortal) {
    const st = SESSION_HANGAR_ID
      ? getHangarStateById(SESSION_HANGAR_ID)
      : getActiveHangarState();

    const currentMap = window.__CURRENT_MAP_ID__ || "1-1";
    const fallbackSpawn = getFactionFallbackSpawn();

    if (!st?.map) {
      player.x = clamp(fallbackSpawn.x, 80, WORLD.w - 80);
      player.y = clamp(fallbackSpawn.y, 80, WORLD.h - 80);
      console.log(`[SPAWN] Jamais joué => base de firme ${fallbackSpawn.x},${fallbackSpawn.y}`);
    } else {
      if (String(st.map) !== String(currentMap)) {
        player.x = clamp(fallbackSpawn.x, 80, WORLD.w - 80);
        player.y = clamp(fallbackSpawn.y, 80, WORLD.h - 80);
        console.log(`[SPAWN] Map différente (saved=${st.map}, cur=${currentMap}) => base de firme`);
      } else if (st.pos && st.pos.x != null && st.pos.y != null) {
        player.x = clamp(st.pos.x, 80, WORLD.w - 80);
        player.y = clamp(st.pos.y, 80, WORLD.h - 80);
        console.log(`[SPAWN] Position sauvegardée: ${Math.floor(player.x)}, ${Math.floor(player.y)} sur ${currentMap}`);
      } else {
        player.x = clamp(fallbackSpawn.x, 80, WORLD.w - 80);
        player.y = clamp(fallbackSpawn.y, 80, WORLD.h - 80);
        console.log(`[SPAWN] Pas de pos => base de firme`);
      }
    }
  }

  if (rules?.mode === "gate" && rules?.playerSpawn) {
    const spawn = rules.playerSpawn;
    player.x = clamp(Number(spawn.x ?? WORLD.w * Number(spawn.xRatio ?? 0.08)), 80, WORLD.w - 80);
    player.y = clamp(Number(spawn.y ?? WORLD.h * Number(spawn.yRatio ?? 0.5)), 80, WORLD.h - 80);
  }

  initializeGateEscorts();

  setTimeout(() => {
    if (!player.dead && started) {
      const currentMap = window.__CURRENT_MAP_ID__ || "1-1";
      if (SESSION_HANGAR_ID) {
        saveHangarStateById(SESSION_HANGAR_ID, player.x, player.y, currentMap);
      } else {
        saveActiveHangarState(player.x, player.y, currentMap);
      }
      console.log(`[SPAWN] Position sauvegardée immédiatement: ${Math.floor(player.x)}, ${Math.floor(player.y)} sur ${currentMap}`);
    }
  }, 100);

  camera.x = player.x;
  camera.y = player.y;

  const activeGateId = String(window.__CURRENT_MAP_ID__ || "").toLowerCase();
  const savedGateWave = (rules?.mode === "gate" && account.user?.galaxyGates?.active === activeGateId)
    ? account.user.galaxyGates.activeWave
    : 1;
  wave = Math.max(1, Math.floor(Number(savedGateWave) || 1));
  if (!isZoneMap) beginWave();

  markProgressDirty();
  saveProgressNow();
}

function die() {
  attackActive = false;
  player.dead = true;
  player.vx = player.vy = 0;

  lastDeathPos.x = player.x;
  lastDeathPos.y = player.y;
  lastDeathPos.map = window.__CURRENT_MAP_ID__ || "1-1";

  const defeatedGateId = String(window.__CURRENT_MAP_ID__ || "").toLowerCase();
  if (rules?.mode === "gate" && GALAXY_GATE_DEFINITIONS[defeatedGateId]) {
    const lifeResult = loseCurrentUserGalaxyGateLife(defeatedGateId);
    if (lifeResult.ok) {
      account.user = lifeResult.user;
      const gateName = GALAXY_GATE_DEFINITIONS[defeatedGateId].name;
      if (lifeResult.exhausted) showNotificationGroup([`Galaxy Gate ${gateName} perdue`, "Il ne vous reste plus aucune vie."]);
      else showNotificationGroup([`Vaisseau détruit dans la Galaxy Gate ${gateName}`, `${lifeResult.lives} vie${lifeResult.lives > 1 ? "s" : ""} restante${lifeResult.lives > 1 ? "s" : ""}`]);
      renderGalaxyGateWindow();
    }
  }

  if (started) {
    const currentMap = window.__CURRENT_MAP_ID__ || "1-1";
    if (SESSION_HANGAR_ID) {
      saveHangarStateById(SESSION_HANGAR_ID, player.x, player.y, currentMap);
    } else {
      saveActiveHangarState(player.x, player.y, currentMap);
    }
  }

  if (rules?.mode === "gate") {
    setCenterMsg(false);
    showRespawnOverlay(false);
    respawnBaseGate();
    return;
  }

  if (isZoneMap) {
    setCenterMsg(false);
    showRespawnOverlay(true);
    return;
  }

  respawnBase();
}

function getNearestPortalTo(x, y) {
  if (!zonePortals || !zonePortals.length) return null;
  let best = null;
  let bestD2 = Infinity;
  for (const p of zonePortals) {
    const d2 = dist2(x, y, p.x, p.y);
    if (d2 < bestD2) {
      bestD2 = d2;
      best = p;
    }
  }
  return best;
}

function respawnBaseGate() {
  const targetMap = getFactionRespawnMap((account.user || getCurrentUserFull())?.faction, window.__CURRENT_MAP_ID__, { gate: true });
  const baseSpawn = getFactionBaseSpawn((account.user || getCurrentUserFull())?.faction);
  setRespawnOverride({ map: targetMap, baseCenter: true, fallback: baseSpawn, respawn: true });

  const cur = window.__CURRENT_MAP_ID__ || "1-1";

  if (typeof window.__GO_TO_MAP__ === "function" && String(cur) !== targetMap) {
    window.__GO_TO_MAP__(targetMap);
    return;
  }

  resetRun({ randomSpawn: false });
}

function respawnBase() {
  const targetMap = getFactionRespawnMap((account.user || getCurrentUserFull())?.faction, lastDeathPos.map || window.__CURRENT_MAP_ID__);
  const baseSpawn = getFactionBaseSpawn((account.user || getCurrentUserFull())?.faction);
  setRespawnOverride({ map: targetMap, baseCenter: true, fallback: baseSpawn, respawn: true });
  showRespawnOverlay(false);
  setCenterMsg(false);

  const cur = window.__CURRENT_MAP_ID__ || "1-1";
  if (typeof window.__GO_TO_MAP__ === "function" && String(cur) !== targetMap) {
    window.__GO_TO_MAP__(targetMap);
    return;
  }

  resetRun({ randomSpawn: false });
}

function respawnNearestPortal() {
  const curMap = window.__CURRENT_MAP_ID__ || "1-1";

  const p = getNearestPortalTo(lastDeathPos.x, lastDeathPos.y);
  if (!p) {
    respawnBase();
    return;
  }

  setRespawnOverride({ map: curMap, x: p.x, y: p.y, respawn: true });
  showRespawnOverlay(false);
  setCenterMsg(false);
  resetRun({ randomSpawn: false });
}

function respawnHere() {
  const curMap = window.__CURRENT_MAP_ID__ || "1-1";

  setRespawnOverride({
    map: curMap,
    x: lastDeathPos.x,
    y: lastDeathPos.y,
    respawn: true,
  });

  showRespawnOverlay(false);
  setCenterMsg(false);
  resetRun({ randomSpawn: false });
}

function respawn() {
  if (isZoneMap) {
    respawnBase();
    return;
  }

  respawnBaseGate();
  setCenterMsg(false);
  showToast("Nouvelle run — Wave 1", 1.6);
}

// ============================================================
// Minimap
// ============================================================
const mini = document.getElementById("miniCanvas");
const mctx = mini.getContext("2d");
let miniPing = null;

mini.style.touchAction = "none";

function setMoveTargetFromMiniEvent(clientX, clientY) {
  // ✅ Un clic minimap annule aussi l'ordre de collecte
  cancelCollectableTarget();

  const rect = mini.getBoundingClientRect();

  const cx = (clientX - rect.left) * (mini.width / rect.width);
  const cy = (clientY - rect.top) * (mini.height / rect.height);

  const mx = cx / mini.width;
  const my = cy / mini.height;

  const wx = mx * WORLD.w;
  const wy = my * WORLD.h;

  moveTarget.active = true;
  moveTarget.x = wx;
  moveTarget.y = wy;
}

mini.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  e.stopPropagation();
  SFX.resume();

  if (!started || player.dead) return;

  setMoveTargetFromMiniEvent(e.clientX, e.clientY);

  miniPing = { x: moveTarget.x, y: moveTarget.y, t: 0, dur: 0.75 };

  mini.setPointerCapture(e.pointerId);
}, { passive: false });

mini.addEventListener("pointermove", (e) => {
  if (!e.buttons) return;
  e.preventDefault();
  e.stopPropagation();

  if (!started || player.dead) return;

  setMoveTargetFromMiniEvent(e.clientX, e.clientY);
}, { passive: false });

mini.addEventListener("pointerup", (e) => {
  try { mini.releasePointerCapture(e.pointerId); } catch {}
}, { passive: true });

function drawMinimap() {
  renderMinimap(mctx, {
    width: mini.width,
    height: mini.height,
    world: WORLD,
    player,
    enemies,
    allies: escortShips,
    portals: getInteractivePortals(),
    returnPortal: gateReturnPortal,
    isZoneMap,
    safeZone: zoneSafe,
    moveTarget,
    ping: miniPing,
    camera,
    viewportWidth: innerWidth,
    viewportHeight: innerHeight,
    lockedNpc: Target.get(),
    shouldShowNpc: (source, enemy, locked) => shouldDetectNpc(source, enemy, NPC_SENSOR_RANGES.radar, locked),
  });
}


// ============================================================
// Labels / colors
// ============================================================
function npcLabelFor(e) {
  const name = e && e.name ? String(e.name).trim() : "";
  return name || `NPC ${e?.id ?? "?"}`;
}

// ============================================================
// Draw: player & NPC sprites
// ============================================================
function drawPlayerBody() {
  if (!playerImgsReady || !playerImgs || !playerImgs.length) return false;

  const pack = ACTIVE_SHIP || SHIP_PACKS[0];
  const frames = pack.frames || playerImgs.length;
  const idx = angleToFrameIndex(player.angle + (pack.angleOffset || 0), frames);
  const img = playerImgs[idx] || playerImgs[0];
  if (!isImgReady(img)) return false;

  const w = pack.w ?? 170;
  const h = pack.h ?? 170;
  drawCenteredImage(ctx, img, w, h);

  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.restore();

  // ✅ Effet de vaisseau (Ship_effet) par-dessus le vaisseau, boucle à l'infini
  if (GAME_SETTINGS.shipEffect) {
    loadShipEffect(pack?.id);
    drawShipEffectOverlay();
  }

  return true;
}

function drawEnemyBody(e) {
  const cfg = NPC_TYPES[e.type];
  const sp = cfg?.sprite;

  if (!sp || !sp._imgs || !sp._imgs.length || !sp._ready) {
    ctx.save();
    ctx.globalAlpha = 0.95;
    ctx.beginPath();
    ctx.arc(0, 0, e.r, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    return;
  }

const frames = sp.frames || sp._imgs.length;
let idx = 0;

if (e.type === "npc_Cubikon" && !e.spritePlay) {
  if (e._animPhase === "hold") idx = (frames - 1);
  else idx = 0;
}
else if (e.spritePlay || cfg?.playSprite) {
  idx = Math.min(frames - 1, (e.spriteIdx || 0));
}
else {
  idx = angleToFrameIndex(e.angle + (sp.angleOffset || 0), frames);
}


  const img = sp._imgs[idx] || sp._imgs[0] || sp._previewImg;

  if (!isImgReady(img)) {
    ctx.beginPath();
    ctx.arc(0, 0, e.r, 0, TAU);
    ctx.fill();
    ctx.stroke();
    return;
  }

  const baseW = sp.w ?? sp.size ?? 160;
  const baseH = sp.h ?? sp.size ?? 160;

  const w = e.isBoss ? baseW * 1.05 : baseW;
  const h = e.isBoss ? baseH * 1.05 : baseH;

  ctx.save();
  ctx.imageSmoothingEnabled = false;
  drawCenteredImage(ctx, img, w, h);
  ctx.restore();
}

// ============================================================
// Portal / Toast / MoveTarget / Target (PNG)
// ============================================================
loadImage(LOCK_SPR.src, { priority: true });
loadImage(ESCORT_LOCK_SPR.src, { priority: true });
loadImage(PORTAL_IDLE_SPR.src, { priority: true });
loadImage(PORTAL_OPEN_SPR.src, { priority: true });

if (PORTAL_JUMP_SPR?.src) {
  loadImage(PORTAL_JUMP_SPR.src, { priority: true });
}

const SAFE_MODULE_SPR = {
  CENTRE_MMO: { src: "assets/MMO/Centre.png" },
  BEACON_MMO: { src: "assets/MMO/Beacon.png" },
  QUEST_MMO: { src: "assets/MMO/Quest.png" },

  CENTRE_EIC: { src: "assets/EIC/Centre.png" },
  BEACON_EIC: { src: "assets/EIC/Beacon.png" },
  QUEST_EIC: { src: "assets/EIC/Quest.png" },

  CENTRE_VRU: { src: "assets/VRU/Centre.png" },
  BEACON_VRU: { src: "assets/VRU/Beacon.png" },
  QUEST_VRU: { src: "assets/VRU/Quest.png" },

  CENTRE_PIRATE: { src: "assets/PIRATES/Centre.png" },
};

for (const k in SAFE_MODULE_SPR) {
  loadImage(SAFE_MODULE_SPR[k].src, { priority: false });
}

for (const state of Object.values(QUEST_BUTTON).filter(value => value?.src)) {
  loadImage(state.src, { priority: true });
}

function startGatePortalJump(ptl, action) {
  if (!ptl || ptl.jumping || !isPlayerNearPortal(ptl)) return;
  if (beginGatePortalJump(ptl, action, portal.switchDur)) {
    const gateId = String(window.__CURRENT_MAP_ID__ || "").toLowerCase();
    const gateName = GALAXY_GATE_DEFINITIONS[gateId]?.name || rules?.mapLabel || gateId;
    if (action === "continue") {
      showNotification(`Saut en cours vers la vague ${wave + 1} de la map ${gateName}`, ptl.jumpDur, "info", { goldTerms: [gateName] });
    } else {
      const destinationMap = String(getGateReturnMap());
      showNotification(`Saut en cours vers la carte ${destinationMap}`, ptl.jumpDur, "info", { goldTerms: [destinationMap] });
    }
  }
}

const DIMENSIONAL_DRONE_FORMATIONS = new Set(["ring", "drill", "veteran", "dome", "wheel", "x", "wave"]);
const STANDARD_DRONE_FORMATION_RADIUS = Math.max(
  ...DRONE_FORMATION_LAYOUTS.standard.map(point => Math.hypot(point.x, point.y)),
  1,
);

function getDroneFormationOffsets(count, formationId) {
  const n = Math.max(0, Math.floor(Number(count) || 0));
  if (!n) return [];
  const reference = DRONE_FORMATION_LAYOUTS[formationId] || DRONE_FORMATION_LAYOUTS.standard;
  const referenceRadius = Math.max(...reference.map(point => Math.hypot(point.x, point.y)), 1);
  const normalizedScale = DIMENSIONAL_DRONE_FORMATIONS.has(formationId)
    ? STANDARD_DRONE_FORMATION_RADIUS / referenceRadius
    : 1;
  if (reference?.length) return Array.from({length:n},(_,index)=>{
    const sourceIndex=n===1?Math.floor(reference.length/2):Math.round(index*(reference.length-1)/(n-1));
    const point=reference[sourceIndex];
    // Les coordonnées viennent uniquement des dix marqueurs jaunes de l'image.
    // Le cartouche « 3D » n'est jamais un point de formation.
    const shipClearance = 35;
    if (DIMENSIONAL_DRONE_FORMATIONS.has(formationId)) {
      if (formationId === "veteran") {
        // Les quatre branches doivent se croiser exactement au centre du vaisseau.
        const scale = ((STANDARD_DRONE_FORMATION_RADIUS * 4) + shipClearance) / referenceRadius;
        return { x: point.x * scale, y: point.y * scale };
      }
      // Chaque moitié est écartée du vaisseau sans changer son dessin interne.
      // La réduction d'échelle compense cette marge afin de conserver la largeur standard.
      const centerClearance = 60;
      const scale = ((STANDARD_DRONE_FORMATION_RADIUS * 4) + shipClearance - centerClearance) / referenceRadius;
      const clearanceX = point.x ? Math.sign(point.x) * centerClearance : 0;
      const clearanceY = !point.x && point.y ? Math.sign(point.y) * centerClearance : 0;
      return { x: point.x * scale + clearanceX, y: point.y * scale + clearanceY };
    }
    const length = Math.hypot(point.x, point.y) || 1;
    const scale = 4 * normalizedScale;
    return {
      x: point.x * scale + (point.x / length) * shipClearance,
      y: point.y * scale + (point.y / length) * shipClearance,
    };
  });
  if (formationId === "ring") return Array.from({ length: n }, (_, index) => {
    const angle = (index / n) * TAU;
    return { x: Math.cos(angle) * 105, y: Math.sin(angle) * 72 };
  });
  if (["turtle","dome","ring"].includes(formationId)) return Array.from({ length: n }, (_, index) => {
    const angle = (index / n) * TAU;
    return { x: Math.cos(angle) * (formationId === "ring" ? 112 : 90), y: Math.sin(angle) * (formationId === "ring" ? 78 : 62) };
  });
  if (["barrier","wall"].includes(formationId)) return Array.from({ length: n }, (_, index) => ({ x: -88, y: (index - (n - 1) / 2) * 30 }));
  if (formationId === "arrow") return Array.from({ length: n }, (_, index) => {
    const side = index % 2 === 0 ? -1 : 1;
    const rank = Math.floor(index / 2) + 1;
    return { x: -45 - rank * 25, y: side * rank * 24 };
  });
  if (formationId === "diamond") return Array.from({ length: n }, (_, index) => {
    const angle = (index / n) * TAU;
    return { x: Math.cos(angle) * 100, y: Math.sin(angle) * 62 };
  });
  if (formationId === "heart") return Array.from({ length: n }, (_, index) => {
    const t = (index / Math.max(1, n - 1)) * Math.PI * 2;
    return { x: -65 + Math.sin(t) * 50, y: -Math.cos(t) * 42 + Math.cos(t * 2) * 16 };
  });
  if (["pincer","crab","butterfly"].includes(formationId)) return Array.from({ length: n }, (_, index) => {
    const side = index % 2 === 0 ? -1 : 1;
    const rank = Math.floor(index / 2);
    return { x: -70 + rank * 18, y: side * (35 + rank * 18) };
  });
  if (["star","x","wheel"].includes(formationId)) return Array.from({ length: n }, (_, index) => {
    const angle = (index / n) * TAU;
    const radius = index % 2 ? 105 : 72;
    return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius * .7 };
  });
  if (["double_arrow","chevron","drill","lance"].includes(formationId)) return Array.from({ length: n }, (_, index) => {
    const side = index % 2 === 0 ? -1 : 1;
    const rank = Math.floor(index / 2) + 1;
    return { x: -35 - rank * 27, y: side * rank * (formationId === "double_arrow" ? 34 : 24) };
  });
  if (formationId === "wave") return Array.from({ length: n }, (_, index) => ({ x: -78 + index * 17, y: Math.sin(index * 1.35) * 50 }));
  return Array.from({ length: n }, (_, index) => {
    const angle = Math.PI * 0.55 + (index / Math.max(1, n - 1)) * Math.PI * 0.9;
    return { x: Math.cos(angle) * 92, y: Math.sin(angle) * 64 };
  });
}

const droneVisualStates = new Map();
let droneFormationVisualAngle = Number.NaN;
let lastDronePlayerAngle = Number.NaN;
let droneTurnTransitionStartedAt = 0;

function shortestAngleDelta(from, to) {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

function queueDroneLevelTransition(droneId, fromLevel, toLevel) {
  const id = String(droneId || "");
  if (!id || toLevel <= fromLevel) return;
  const state = droneVisualStates.get(id) || { x: 0, y: 0, initialized: false };
  state.levelTransition = {
    startedAt: performance.now(),
    fromLevel: Math.max(1, Number(fromLevel) || 1),
    toLevel: Math.max(1, Number(toLevel) || 1),
  };
  droneVisualStates.set(id, state);
}

function drawPlayerDrones() {
  const droneState = account.user?.drones;
  const drones = droneState?.items || [];
  if (!drones.length) return;
  const formation = DRONE_FORMATIONS.find(entry => entry.id === droneState.activeFormation);
  const formationId = drones.length >= Number(formation?.minDrones || 0) ? formation?.id : "standard";
  const offsets = getDroneFormationOffsets(drones.length, formationId);
  const now = performance.now();
  // Les références montrent toujours le vaisseau orienté vers le haut.
  // L'angle du moteur vaut -PI/2 dans cette orientation : on compense ce quart de tour.
  const desiredFormationAngle = player.angle + Math.PI / 2;
  if (!Number.isFinite(droneFormationVisualAngle)) droneFormationVisualAngle = desiredFormationAngle;
  if (Number.isFinite(lastDronePlayerAngle) && Math.abs(shortestAngleDelta(lastDronePlayerAngle, player.angle)) > 2.6) {
    droneTurnTransitionStartedAt = now;
  }
  lastDronePlayerAngle = player.angle;
  // La formation accompagne volontairement la rotation avec un léger retard :
  // les drones décrivent ainsi un mouvement visible au lieu de pivoter comme un bloc rigide.
  droneFormationVisualAngle += shortestAngleDelta(droneFormationVisualAngle, desiredFormationAngle) * 0.0800;
  const formationAngle = droneFormationVisualAngle;
  const ca = Math.cos(formationAngle), sa = Math.sin(formationAngle);
  // Les sprites des drones sont encodés dans le sens opposé aux vaisseaux.
  const frame = ((angleToFrameIndex(player.angle, 32) + 16) % 32) + 1;
  drones.forEach((drone, index) => {
    const target = offsets[index];
    const id = String(drone.id || index);
    const state = droneVisualStates.get(id) || {
      x: target.x,
      y: target.y,
      lastAt: now,
      initialized: true,
      displayLevel: Math.max(1, Number(drone.level) || 1),
    };
    const elapsed = Math.min(0.05, Math.max(0, (now - Number(state.lastAt || now)) / 1000));
    const follow = 1 - Math.exp(-elapsed * 7.5);
    state.x += (target.x - state.x) * follow;
    state.y += (target.y - state.y) * follow;
    state.lastAt = now;
    let collapse = 1;
    const turnAge = now - droneTurnTransitionStartedAt;
    if (droneTurnTransitionStartedAt && turnAge < 600) {
      const turnCollapse = turnAge < 160
        ? 1 - turnAge / 160
        : turnAge < 225
          ? 0
          : Math.min(1, (turnAge - 225) / 375);
      collapse = Math.min(collapse, turnCollapse);
    }
    const transition = state.levelTransition;
    if (transition) {
      const age = now - transition.startedAt;
      if (age < 360) {
        collapse = 1 - age / 360;
        state.displayLevel = transition.fromLevel;
      } else if (age < 500) {
        collapse = 0;
        state.displayLevel = transition.toLevel;
      } else if (age < 980) {
        collapse = (age - 500) / 480;
        state.displayLevel = transition.toLevel;
      } else {
        state.displayLevel = transition.toLevel;
        state.levelTransition = null;
      }
    } else {
      state.displayLevel = Math.max(1, Number(drone.level) || 1);
    }
    droneVisualStates.set(id, state);
    const point = { x: state.x * collapse, y: state.y * collapse };
    const x = point.x * ca - point.y * sa;
    const y = point.x * sa + point.y * ca;
    if (!GAME_SETTINGS.drones || collapse <= 0.03) return;
    const src = getDroneSpritePath({ ...drone, level: state.displayLevel }, frame);
    const image = getCachedImage(src);
    let renderImage = image;
    if (!isImgReady(image)) {
      loadImage(src, { priority: true });
      renderImage = state.lastImage || null;
      if (!isImgReady(renderImage)) return;
    } else {
      state.lastImage = image;
    }
    ctx.save();
    ctx.translate(x, y);
    drawCenteredImage(ctx, renderImage, 64, 56);
    ctx.restore();
  });
  const activeIds = new Set(drones.map((drone, index) => String(drone.id || index)));
  for (const id of droneVisualStates.keys()) if (!activeIds.has(id)) droneVisualStates.delete(id);
}

function tickGatePortalJumps(dt) {
  if (isZoneMap || !betweenWaves) return false;
  const completed = advanceGatePortalJumps(getInteractivePortals(), dt);
  if (!completed) return false;
  if (completed.action === "continue") {
    betweenWaves = false;
    wave++;
    const gateId = String(window.__CURRENT_MAP_ID__ || "").toLowerCase();
    if (GALAXY_GATE_DEFINITIONS[gateId]) {
      const saved = saveCurrentUserGalaxyGateWave(gateId, wave);
      if (saved.ok) {
        account.user = saved.user;
        renderGalaxyGateWindow();
      }
    }
    beginWave();
  } else {
    const gateId = String(window.__CURRENT_MAP_ID__ || "").toLowerCase();
    if (GALAXY_GATE_DEFINITIONS[gateId]) {
      const saved = saveCurrentUserGalaxyGateWave(gateId, wave + 1);
      if (saved.ok) {
        account.user = saved.user;
        renderGalaxyGateWindow();
      }
    }
    window.__GO_TO_MAP__?.(getGateReturnMap());
  }
  return true;
}

function getPortalOpenFade(ptl) {
  return computePortalOpenFade(ptl, portal.switchDur);
}

function getPortalJumpFade(ptl) {
  return computePortalJumpFade(ptl, portal.switchDur);
}

function startZonePortalClosing(ptl) {
  startPortalClosing(ptl, portal.switchDur);
}

function tickZonePortalVisualTransitions(dt) {
  const portals = getInteractivePortals();
  tickPortalVisualTransitions(portals, dt, portal.switchDur);
}

function drawZonePortals(ox, oy) {
  const portals = getInteractivePortals();
  if (!portals.length) return;

  ctx.save();
  ctx.imageSmoothingEnabled = false;

  for (const ptl of portals) {
    const spr = getPortalSpriteSet(ptl);

    const imgIdle = getCachedImage(spr.idle?.src);
    const imgOpen = getCachedImage(spr.open?.src);

    if (!isImgReady(imgIdle) || !isImgReady(imgOpen)) continue;

    const w = spr.idle.w || imgIdle.naturalWidth || 128;
    const h = spr.idle.h || imgIdle.naturalHeight || 128;
    const xOff = Number(spr.idle.xOff || 0);
    const yOff = spr.idle.yOff || 0;

    const x = ptl.x + ox + xOff;
    const y = ptl.y + oy + yOff;

    const openFade = getPortalOpenFade(ptl);
    const jumpFade = getPortalJumpFade(ptl);

    // ✅ portail idle
    ctx.globalAlpha = 1 - openFade;
    ctx.drawImage(
      imgIdle,
      x - w / 2,
      y - h / 2,
      w,
      h
    );

    // ✅ portail ouvert
    ctx.globalAlpha = openFade;
    const openW = spr.open.w || w;
    const openH = spr.open.h || h;
    const openScale = Number(spr.open.scale ?? 1);
    const openXOff = Number(spr.open.xOff || 0);
    const openYOff = Number(spr.open.yOff || 0);
    ctx.drawImage(
      imgOpen,
      x + openXOff - (openW * openScale) / 2,
      y + openYOff - (openH * openScale) / 2,
      openW * openScale,
      openH * openScale
    );

    ctx.globalAlpha = 1;

    // ========================================================
    // Image fixe pendant le saut
    // ========================================================
    if (ptl.jumping && spr.jump?.src) {
      const imgJump = getCachedImage(spr.jump.src);

      if (isImgReady(imgJump)) {
        const jumpW =
          spr.jump.w ||
          imgJump.naturalWidth ||
          128;

        const jumpH =
          spr.jump.h ||
          imgJump.naturalHeight ||
          128;

        const jumpYOff = Number(spr.jump.yOff || 0);
        const jumpXOff = Number(spr.jump.xOff || 0);

        const dur = Math.max(
          0.1,
          Number(ptl.jumpDur || 2)
        );

        const t = clamp(ptl.jumpT / dur, 0, 1);

        const spinSpeed = Number(
          spr.jump.spinSpeed ?? 0
        );

        const angle = spinSpeed
          ? t * TAU * spinSpeed
          : 0;

        const scale = Number(spr.jump.scale ?? 1);
        const alpha =
          Number(spr.jump.alpha ?? 1) *
          jumpFade;

        ctx.save();
        ctx.translate(x + jumpXOff, y + jumpYOff);
        ctx.rotate(angle);
        ctx.globalAlpha = alpha;

        ctx.drawImage(
          imgJump,
          -(jumpW * scale) / 2,
          -(jumpH * scale) / 2,
          jumpW * scale,
          jumpH * scale
        );

        ctx.restore();
        ctx.globalAlpha = 1;
      }
    }

    // ========================================================
    // Animation pendant le saut
    // ========================================================
    if (
      ptl.jumping &&
      spr.jumpFx?.path &&
      spr.jumpFx?.frames
    ) {
      const fx = spr.jumpFx;

      const frames = Math.max(
        1,
        Number(fx.frames || 1)
      );

      const fps = Math.max(
        1,
        Number(fx.fps || 24)
      );

      const loop = fx.loop !== false;

      let frameIndex = Math.floor(
        ptl.jumpT * fps
      );

      if (loop) {
        frameIndex %= frames;
      } else {
        frameIndex = Math.min(
          frames - 1,
          frameIndex
        );
      }

      const src = getPortalFrameSrc(
        fx,
        frameIndex
      );

      const imgFx = getCachedImage(src);

      if (isImgReady(imgFx)) {
        const fxW =
          fx.w ||
          imgFx.naturalWidth ||
          128;

        const fxH =
          fx.h ||
          imgFx.naturalHeight ||
          128;

        const fxScale = Number(fx.scale ?? 1);
        const fxAlpha =
          Number(fx.alpha ?? 1) *
          jumpFade;

        const fxYOff = Number(fx.yOff || 0);
        const fxXOff = Number(fx.xOff || 0);

        const spinSpeed = Number(
          fx.spinSpeed || 0
        );

        const angle = spinSpeed
          ? ptl.jumpT * TAU * spinSpeed
          : 0;

        ctx.save();

        ctx.translate(
          x + fxXOff,
          y + fxYOff
        );

        ctx.rotate(angle);
        ctx.globalAlpha = fxAlpha;

        ctx.drawImage(
          imgFx,
          -(fxW * fxScale) / 2,
          -(fxH * fxScale) / 2,
          fxW * fxScale,
          fxH * fxScale
        );

        ctx.restore();
        ctx.globalAlpha = 1;
      }
    }

    // ========================================================
    // ✅ Bouton de saut au-dessus du portail
    // ========================================================
    const btn = spr.jumpButton;

    if (btn && !ptl.jumping) {
      let buttonSprite = btn.idle;

      if (ptl.buttonPressed) {
        buttonSprite = btn.click;
      } else if (ptl.buttonHovered) {
        buttonSprite = btn.mouse;
      }

      const buttonImg = getCachedImage(
        buttonSprite?.src
      );

      if (isImgReady(buttonImg)) {
        const buttonX =
          ptl.x +
          ox +
          Number(btn.xOff || 0);

        const buttonY =
          ptl.y +
          oy +
          Number(btn.yOff ?? -210);

        const buttonW = Math.max(
          1,
          Number(
            btn.w ||
            buttonImg.naturalWidth ||
            buttonImg.width ||
            88
          )
        );

        const buttonH = Math.max(
          1,
          Number(
            btn.h ||
            buttonImg.naturalHeight ||
            buttonImg.height ||
            135
          )
        );

        let alpha = Number(btn.alpha ?? 1);

        if (
          btn.requireNear !== false &&
          !isPlayerNearPortal(ptl)
        ) {
          alpha *= 0.65;
        }

        ctx.save();

        ctx.globalAlpha = alpha;
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";

        ctx.drawImage(
          buttonImg,
          buttonX - buttonW / 2,
          buttonY - buttonH / 2,
          buttonW,
          buttonH
        );

        ctx.restore();
        ctx.globalAlpha = 1;
      }
    }

    // ✅ FIN du portail actuel
  }

  // ✅ FIN de tous les portails
  ctx.restore();
  ctx.globalAlpha = 1;
}

function drawSafeModules(ox, oy) {
  if (!isZoneMap || !zoneSafe) return;

  const mods = zoneSafe.modules || [];

  for (const m of mods) {
    const spr = SAFE_MODULE_SPR[m.spr];
    if (!spr) continue;

    const img = getCachedImage(spr.src);
    if (!isImgReady(img)) continue;

    const x = m.x + ox;
    const y = m.y + oy;

    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    ctx.drawImage(
      img,
      x - m.w / 2,
      y - m.h / 2,
      m.w,
      m.h
    );

    ctx.restore();

    if (isQuestModule(m)) {
      const buttonSprite = m.questButtonPressed
        ? QUEST_BUTTON.click
        : m.questButtonHovered
          ? QUEST_BUTTON.mouse
          : QUEST_BUTTON.idle;
      const buttonImg = getCachedImage(buttonSprite.src);

      if (isImgReady(buttonImg)) {
        const button = getQuestButtonPosition(m);
        ctx.save();
        ctx.globalAlpha = isPlayerNearQuestModule(m) ? 1 : 0.65;
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(
          buttonImg,
          button.x + ox - QUEST_BUTTON.w / 2,
          button.y + oy - QUEST_BUTTON.h / 2,
          QUEST_BUTTON.w,
          QUEST_BUTTON.h
        );
        ctx.restore();
      }
    }
  }

  const bea = zoneSafe.beacons || [];

  for (const b of bea) {
    const beaconSprite =
      SAFE_MODULE_SPR[b.spr] ||
      SAFE_MODULE_SPR.BEACON_MMO;

    const bImg = getCachedImage(beaconSprite.src);
    if (!isImgReady(bImg)) continue;

    const x = b.x + ox;
    const y = b.y + oy;

    const bw = Number(b.w) || 90;
    const bh = Number(b.h) || 165;

    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    ctx.drawImage(
      bImg,
      x - bw / 2,
      y - bh / 2,
      bw,
      bh
    );

    ctx.restore();
  }
}

function drawToast() {
  drawToastMessage(ctx, toast, innerWidth, innerHeight);
}

function drawMoveTarget(ox, oy) {
  drawMoveTargetMarker(ctx, moveTarget, ox, oy);
}

function drawTargetMarker(e, ox, oy, time) {
  if (!e || e.hp <= 0) return;
  const img = getCachedImage(LOCK_SPR.src);
  if (!isImgReady(img)) return;
  drawTargetLock(ctx, e, img, LOCK_SPR, ox, oy, time);
}

function drawLaserBeam(L, ox, oy) {
  const p = clamp(L.t / L.dur, 0, 1);
  const a = 1 - p;

  const ok = laserReady && laserImgs && laserImgs.length;

  const x = L.x + ox;
  const y = L.y + oy;

  const start = player.r + 18;
  const len = L.len;

  const visualLen = len + (LASER.visualExtraLen || 0);
  const STRETCH_X = 2.2;
  const STRETCH_Y = 0.75;
  const endX = x + Math.cos(L.ang) * (start + visualLen);
  const endY = y + Math.sin(L.ang) * (start + visualLen);
  const margin = Math.max(40, L.width * 2);
  if (Math.max(x, endX) < -margin || Math.min(x, endX) > innerWidth + margin ||
      Math.max(y, endY) < -margin || Math.min(y, endY) > innerHeight + margin) return;

  if (!ok) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(L.ang);
    ctx.globalAlpha = a * 0.6;
    ctx.lineCap = "round";
    ctx.lineWidth = L.width * STRETCH_Y;
    ctx.strokeStyle = "rgba(179,66,255,1)";
    ctx.beginPath();
    ctx.moveTo(start, 0);
    ctx.lineTo(start + visualLen, 0);
    ctx.stroke();
    ctx.restore();
    ctx.globalAlpha = 1;
    return;
  }

  const FPS = LASER_PACK.fps || 20;
  let idx = Math.min(LASER_PACK.frames - 1, Math.floor(L.t * FPS));
  if (L._lastGoodIdx == null) L._lastGoodIdx = 0;

  const ready = (img) => !!(img && img.complete && img.naturalWidth > 0);
  if (!ready(laserImgs[idx])) {
    if (ready(laserImgs[L._lastGoodIdx])) idx = L._lastGoodIdx;
  }
  if (ready(laserImgs[idx])) L._lastGoodIdx = idx;
  const img = laserImgs[idx];
  if (!ready(img)) return;

  const iw = img.naturalWidth || img.width || 1;
  const ih = img.naturalHeight || img.height || 1;

  const tileW = iw * STRETCH_X;
  const tileH = ih * STRETCH_Y;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(L.ang);

  ctx.beginPath();
  ctx.rect(start, -tileH / 2, visualLen, tileH);
  ctx.clip();

  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = a * 0.25;
  for (let xx = start; xx < start + visualLen; xx += tileW) {
    ctx.drawImage(img, xx, -tileH / 2, tileW, tileH);
  }
  ctx.globalAlpha = a * 0.95;
  for (let xx = start; xx < start + visualLen; xx += tileW) {
    ctx.drawImage(img, xx, -tileH / 2, tileW, tileH);
  }

  ctx.restore();
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;
}

function drawPlayerBars(px, py) {
  const stats = account.user?.stats || {};
  const rank = getRankInfo(calculateRankPoints(stats), stats.honor);
  let rankImage = getCachedImage(rank.imagePath);
  if (!isImgReady(rankImage)) {
    loadImage(rank.imagePath, { priority: true });
    rankImage = null;
  }
  const faction = getFaction(account.user?.faction);
  let factionImage = getCachedImage(faction.imagePath);
  if (!isImgReady(factionImage)) {
    loadImage(faction.imagePath, { priority: true });
    factionImage = null;
  }
  const droneIndicators = (account.user?.drones?.items || []).map(drone => {
    const ability = drone?.fit?.ability;
    const design = typeof ability === "string"
      ? ability.toLowerCase()
      : `${ability?.id || ""} ${ability?.name || ""}`.toLowerCase();
    if (design.includes("hercules")) return "rgb(30,144,255)";
    if (design.includes("havoc") || design.includes("havok")) return "rgb(255,45,55)";
    if (drone?.type === "apis") return "rgb(90,180,255)";
    if (drone?.type === "zeus") return "rgb(174,190,75)";
    return "rgb(255,255,255)";
  });
  const activeFormation = getActiveDroneFormation(account.user);
  let droneFormationImage = activeFormation ? getCachedImage(activeFormation.icon) : null;
  if (activeFormation && !isImgReady(droneFormationImage)) {
    loadImage(activeFormation.icon, { priority: true });
    droneFormationImage = null;
  }
  const activeHangar = getActiveHangarFromUser(account.user);
  const activeFit = activeHangar?.fits?.[String(Number(activeHangar.activeConfig) === 2 ? 2 : 1)] || activeHangar?.fit || {};
  const equippedModules = (account.user?.inventory?.shipModules || []).filter(module => (activeFit.shipMods || []).includes(module?.id));
  const moduleColorByType = {
    hp: "rgb(70,210,105)",
    shd: "rgb(45,150,255)",
    dmg: "rgb(255,70,70)",
    spc: "rgb(255,215,70)",
  };
  const moduleIndicators = equippedModules.map(module => moduleColorByType[module.type]).filter(Boolean);
  drawPlayerStatus(
    ctx,
    player,
    account.user?.pseudo || "Pilote",
    px,
    py,
    rankImage,
    factionImage,
    droneIndicators,
    droneFormationImage,
    moduleIndicators,
  );
}

function getRsbPercent() {
  if (RSB_COOLDOWN <= 0) return 100;
  return Math.round(clamp(1 - rsbCooldown / RSB_COOLDOWN, 0, 1) * 100);
}

function getPulsePercent() {
  if (PULSE_COOLDOWN <= 0) return 100;
  return Math.round(clamp(1 - (pulseCd / PULSE_COOLDOWN), 0, 1) * 100);
}

function playerIsInSafeZone() {
  if (!isZoneMap) return false;

  if (zonePortals?.length) {
    for (const p of getInteractivePortals()) {
      if (!portalProvidesSafety(p)) continue;
      const rr = DEFAULT_PORTAL_RADIUS;
      if (dist2(player.x, player.y, p.x, p.y) <= rr * rr) return true;
    }
  }

  if (baseProvidesSafety() && zoneSafe?.zone?.kind === "circle") {
    const z = zoneSafe.zone;
    if (dist2(player.x, player.y, z.x, z.y) <= (z.r || 0) * (z.r || 0)) return true;
  }

  return false;
}

function enemyShoot(e, dt, combatTarget = player) {
  if (!e || e.hp <= 0) return;
  if ((e.empT || 0) > 0) return;

  if (combatTarget === player && safeZoneActive && playerIsInSafeZone()) return;

  if (rules?.mode === "zone") {
    if (e.passiveNative && !e._provoked) return;
  }

  if (e.canShoot === false) return;
  if ((e.shootRange ?? -1) <= 0) return;
  if ((e.shootRate ?? 0) <= 0) return;

  if (e.type === "npc_Gygerim_Overlord") {
    e._farShotCd = Number.isFinite(e._farShotCd) ? e._farShotCd - dt : 5;
    if (e._farShotCd <= 0) {
      const distantTargets = player.dead ? [] : [player];
      distantTargets.push(...escortShips.filter(escort => escort.hp > 0));
      const farthest = distantTargets.reduce((best, candidate) => (
        !best || dist2(e.x, e.y, candidate.x, candidate.y) > dist2(e.x, e.y, best.x, best.y)
          ? candidate
          : best
      ), null);
      if (farthest) {
        const angle = Math.atan2(farthest.y - e.y, farthest.x - e.x);
        const projectileSpeed = Math.max(120, e.bulletSpeed || 900);
        const distance = Math.hypot(farthest.x - e.x, farthest.y - e.y);
        const muzzle = (e.r || 18) + 12;
        addCappedProjectile(enemyBullets, {
          x: e.x + Math.cos(angle) * muzzle,
          y: e.y + Math.sin(angle) * muzzle,
          vx: Math.cos(angle) * projectileSpeed,
          vy: Math.sin(angle) * projectileSpeed,
          spd: projectileSpeed,
          r: e.bulletR ?? 7,
          life: Math.max(2.5, distance / projectileSpeed + 1.5),
          dmg: Math.max(1, Math.round(vary(e.bulletDmg ?? 10, 0.05))),
          key: "x1",
          scale: e.bulletScale ?? 1.5,
          sprite: e.bulletSprite || null,
          target: farthest === player ? "player" : "escort",
          targetId: farthest === player ? null : farthest.id,
          homing: true,
          miss: Math.random() < NPC_SHOTS.missChance,
          hitRadiusBonus: NPC_SHOTS.hitRadiusBonus,
          longRange: true,
        }, ENTITY_LIMITS.enemyBullets);
        if (farthest === player) e._attackedPlayerRecently = true;
      }
      e._farShotCd = 5;
    }
  }

  e.shootCd = (e.shootCd ?? 0) - dt;
  if (e.shootCd > 0) return;

  if (!combatTarget || combatTarget.hp <= 0 || (combatTarget === player && player.dead)) {
    e.shootCd = 0.5 + Math.random() * 0.6;
    return;
  }

  const r = e.shootRange || 0;
  const d2p = dist2(e.x, e.y, combatTarget.x, combatTarget.y);

  if (d2p > r * r) {
    e.shootCd = 0.12 + Math.random() * 0.18;
    return;
  }

  const baseCd = 1 / Math.max(0.001, e.shootRate || 1);
  e.shootCd = baseCd * (0.85 + Math.random() * 0.3);

  const ang0 = Math.atan2(combatTarget.y - e.y, combatTarget.x - e.x);
  const burst = Math.max(1, e.burst || 1);

  for (let k = 0; k < burst; k++) {
    const willMiss = Math.random() < NPC_SHOTS.missChance;

    // Plus de spread ici : le tir part directement vers le joueur.
    const ang = ang0;

    const spd = Math.max(120, e.bulletSpeed || 900);
    const vx = Math.cos(ang) * spd;
    const vy = Math.sin(ang) * spd;

    const life = bulletLifeForRange(e.shootRange, spd);
    const muzzle = (e.r || 18) + 12;

    const baseDmg = e.bulletDmg ?? 10;
    const shotDmg = Math.max(1, Math.round(vary(baseDmg, 0.05)));

    addCappedProjectile(enemyBullets, {
      x: e.x + Math.cos(ang) * muzzle,
      y: e.y + Math.sin(ang) * muzzle,
      vx,
      vy,
      spd,
      r: e.bulletR ?? 7,
      life: Math.max(life, 2.5),
      dmg: shotDmg,
      key: "x1",
      scale: e.bulletScale ?? 1.5,
      sprite: e.bulletSprite || null,

      target: combatTarget === player ? "player" : "escort",
      targetId: combatTarget === player ? null : combatTarget.id,
      homing: NPC_SHOTS.homing,
      miss: willMiss,
      hitRadiusBonus: NPC_SHOTS.hitRadiusBonus,
    }, ENTITY_LIMITS.enemyBullets);
    if (combatTarget === player) e._attackedPlayerRecently = true;
  }
}

function tickEmpWander(e, dt) {
  if (!e.empAI) {
    e.empAI = {
      t: 0,
      tx: e.x,
      ty: e.y
    };
  }

  e.empAI.t -= dt;

  if (e.empAI.t <= 0) {
    const ang = Math.random() * Math.PI * 2;
    const dist = 350 + Math.random() * 900;

    let tx = e.x + Math.cos(ang) * dist;
    let ty = e.y + Math.sin(ang) * dist;

    tx = clamp(tx, 80, WORLD.w - 80);
    ty = clamp(ty, 80, WORLD.h - 80);

    e.empAI.tx = tx;
    e.empAI.ty = ty;
    e.empAI.t = 1.0 + Math.random() * 1.5;
  }

  const dx = e.empAI.tx - e.x;
  const dy = e.empAI.ty - e.y;
  const d = Math.hypot(dx, dy) || 1;

  if (d < 120) e.empAI.t = Math.min(e.empAI.t, 0.15);

  const nx = dx / d;
  const ny = dy / d;

  const spd = e.speed || 320;

  setNpcVelocity(e, nx, ny, spd);

  e.x = clamp(e.x + e.vx * dt, e.r, WORLD.w - e.r);
  e.y = clamp(e.y + e.vy * dt, e.r, WORLD.h - e.r);

  if (e.vx * e.vx + e.vy * e.vy > 25) {
    e.angle = Math.atan2(e.vy, e.vx);
  }
}

// ============================================================
// Update (MEGA fonction - continuation depuis partie 2)
// ============================================================
function update(dt) {
  rebuildEnemyIndex();
  player.combatT = Math.max(0, (player.combatT || 0) - dt);
  player.attackedT = Math.max(0, (player.attackedT || 0) - dt);

  fireCooldown = Math.max(0, fireCooldown - dt);
  laserCd = Math.max(0, laserCd - dt);
  rsbCooldown = Math.max(0, rsbCooldown - dt);
  pulseCd = Math.max(0, pulseCd - dt);

  if (account.user && account.dirty) {
    account.saveCd -= dt;
    if (account.saveCd <= 0) scheduleProgressSave();
  }

  tickAutoAttack(dt);
  tickVolleyFloats(dt);
  tickExplosions(dt);
  tickPulseFx(dt);

  for (let i = lasers.length - 1; i >= 0; i--) {
    lasers[i].t += dt;
    if (lasers[i].t >= lasers[i].dur) lasers.splice(i, 1);
  }

if (startHintT > 0) {
  startHintT = Math.max(0, startHintT - dt);

  if (startHintT <= 0 && ui.startHint) {
    ui.startHint.style.display = "none";
  }
}

  if (toast) {
    toast.t += dt;
    if (toast.fixed) {
      const direction = toast.exiting ? -1 : 1;
      toast.alpha = clamp((toast.alpha ?? 0) + direction * dt * 2.8, 0, 1);
      if (toast.exiting && toast.alpha <= 0) toast = null;
    } else if (toast.t >= toast.dur) toast = null;
  }

  if (miniPing) {
    miniPing.t += dt;
    if (miniPing.t >= miniPing.dur) miniPing = null;
  }

  if (portal.active) {
    updatePortalProximity(getInteractivePortals(), dt, {
      isNear: isPlayerNearPortal,
      switchDuration: portal.switchDur,
      holdDuration: portal.holdDur,
    });
    if (justPressed.has(getKeybind("portal"))) {
      const near = getInteractivePortals().find(isPlayerNearPortal);
      if (near) startGatePortalJump(near, near === portal ? "continue" : "return");
    }
  }

  refreshHoldMoveTarget();
  let mx = 0, my = 0;

if (moveTarget.active && !player.dead) {
  const dx = moveTarget.x - player.x;
  const dy = moveTarget.y - player.y;
  const d = Math.hypot(dx, dy);

  if (d <= 0.5) {
    player.x = moveTarget.x;
    player.y = moveTarget.y;
    player.vx = 0;
    player.vy = 0;
    moveTarget.active = false;
  } else {
    mx = dx / d;
    my = dy / d;
  }
}

updatePlayerVelocity(player, { x: mx, y: my }, dt);

  if (!player.dead) {
    advancePlayerToTarget(player, moveTarget, dt);

    if (isZoneMap && !playerIsOutsideWorld()) {
      resolvePlayerWalls();
    }
  }

  {
    const spd = Math.hypot(player.vx, player.vy);

    let target = clamp(1 - spd / 60, 0, 1);

    if (attackActive) target *= 0.25;
    if (moveTarget.active) target *= 0.15;
    if (player.dead) target = 0;

    idleSway += (target - idleSway) * (1 - Math.pow(0.0006, dt * 60));
  }

  applyRadiation(dt);

  player.iFrames = Math.max(0, player.iFrames - dt);
  tickRepair(dt);
  tickDroneFormationEffects(dt);
  tickRepairOrbitFx(dt);
  tickCollectables(dt);

  if (!isZoneMap) waveController(dt);
  else zoneController(dt);
  updateBossEncounters();
  updateGateEscorts(dt);

  mapPortalLock = Math.max(0, mapPortalLock - dt);
  portalHintCd = Math.max(0, portalHintCd - dt);
  tickZonePortalVisualTransitions(dt);
  if (tickGatePortalJumps(dt)) return;
  if (tickZonePortalJumps(dt)) return;

  if (isZoneMap && started && !player.dead && zonePortals.length) {
    let near = null;

    for (const p of getInteractivePortals()) {
      const rr = DEFAULT_PORTAL_RADIUS;
      if (dist2(player.x, player.y, p.x, p.y) <= rr * rr) {
        near = p;
        break;
      }
    }

    if (near) {
      safeZoneX = near.x;
      safeZoneY = near.y;
      safeZoneR = DEFAULT_PORTAL_RADIUS;
      safeZoneActive = portalProvidesSafety(near) && (player.combatT <= 0 && !attackActive);

      if (
  near.autoOpen &&
  !near.open &&
  !near.switching &&
  !near.holding &&
  !near.closing &&
  !near.jumping
) {
  near.switching = true;
  near.switchT = 0;
  near.open = false;
  near.holding = false;
  near.holdT = 0;
}

      if (near.switching) {
        near.switchT += dt;
        if (near.switchT >= (portal.switchDur || 1)) {
          near.switchT = (portal.switchDur || 1);
          near.switching = false;

          near.open = true;
          near.holding = true;
          near.holdT = 0;
        }
      }

      if (near.holding) {
        near.holdT += dt;
        if (near.holdT >= (portal.holdDur || 1)) {
          near.holdT = (portal.holdDur || 1);
          near.holding = false;
        }
      }

      if (radiationActive) {
        showToastFixed("☢ RADIATIONS ☢");
      } else if (safeZoneActive) {
        showToastFixed("Zone de Non-Agression");
      } else {
        clearToastFixed();
      }

if (
  mapPortalLock <= 0 &&
  justPressed.has(getKeybind("portal")) &&
  !near.jumping
) {
  startZonePortalJump(near);
}
    } else {
      safeZoneX = 0;
      safeZoneY = 0;
      safeZoneR = 0;

      const inModules = !!(
        zoneSafe?.zone &&
        (
          (zoneSafe.zone.kind === "circle" &&
            dist2(player.x, player.y, zoneSafe.zone.x, zoneSafe.zone.y) <= zoneSafe.zone.r * zoneSafe.zone.r
          )
        )
      );

      if (inModules && baseProvidesSafety()) {
        safeZoneActive = (player.combatT <= 0 && !attackActive);
        if (safeZoneActive) showToastFixed("Zone de Non-Agression");
        else clearToastFixed();
      } else {
        safeZoneActive = false;
        clearToastFixed();
      }
for (const ptl of zonePortals) {
  if (ptl.jumping) continue;

  if (ptl.open || ptl.switching || ptl.holding) {
    startZonePortalClosing(ptl);
  }
}
    }
  } else {
    safeZoneActive = false;
    clearToastFixed();
  }

  const tAim = Target.get();
  if (!player.dead) {
    if (attackActive && tAim) {
      player.angle = Math.atan2(tAim.y - player.y, tAim.x - player.x);
    } else if (moveTarget.active) {
      player.angle = Math.atan2(moveTarget.y - player.y, moveTarget.x - player.x);
    }
  }

for (let i = bullets.length - 1; i >= 0; i--) {
  const b = bullets[i];

  const t = getEnemyById(b.targetId);
  if (!t) {
    removeProjectile(bullets, i);
    cleanupPlayerMissVolley(b);
    continue;
  }

  if (b.homing) {
    const dx = t.x - b.x;
    const dy = t.y - b.y;
    const distance = Math.hypot(dx, dy) || 1;
    const baseSpeed = Math.max(120, Number(b.spd) || Math.hypot(b.vx, b.vy) || 120);
    const targetSpeed = Math.hypot(Number(t.vx) || 0, Number(t.vy) || 0);
    const chaseSpeed = Math.max(baseSpeed, targetSpeed + baseSpeed);
    b.vx = dx / distance * chaseSpeed;
    b.vy = dy / distance * chaseSpeed;
  }

  const expired = advanceProjectile(b, dt);

  const rr = (t.r || 18) + (b.r || 6);
  const targetStart = {
    x: Number.isFinite(t._previousX) ? t._previousX : t.x,
    y: Number.isFinite(t._previousY) ? t._previousY : t.y,
  };

  if (movingCircleHit(
    { x: b._oldX, y: b._oldY },
    { x: b.x, y: b.y },
    targetStart,
    { x: t.x, y: t.y },
    rr,
  )) {
    if (b.miss) {
      showPlayerMissOnce(b, t);

      spawnSpark(b.x, b.y, false);
      removeProjectile(bullets, i);
      cleanupPlayerMissVolley(b);
      continue;
    }

    const sabRecipient = b.ownerEscortId ? getEscortById(b.ownerEscortId) : player;
    const out = b.isSab
      ? drainShieldFromEnemy(t, b.dmg, sabRecipient)
      : damageEnemy(t, b.dmg);

    if (out.total > 0) {
      if (!b.ownerEscortId || Target.get() === t) queueVolleyFloat(t, out, b.volleyId, b.volleySize);
    } else if (b.isSab) {
      addFloatText(
        t.x + (Math.random() - 0.5) * 50,
        t.y - 70 - Math.random() * 20,
        0,
        "rgba(120,180,255,0.85)",
        {
          size: 16,
          pop: 0.25,
          shake: 0.4,
          life: 0.7,
          glow: 0.8,
          weight: 900,
          impact: true,
        }
      );
    }

    spawnSpark(b.x, b.y, out.total >= 600 || out.isCrit);
    removeProjectile(bullets, i);
    cleanupPlayerMissVolley(b);
    continue;
  }

  if (expired) {
    removeProjectile(bullets, i);
    cleanupPlayerMissVolley(b);
  }
}

for (let i = enemyBullets.length - 1; i >= 0; i--) {
  const b = enemyBullets[i];
  const bulletTarget = b.target === "escort" ? getEscortById(b.targetId) : player;

  // Le tir NPC recalcule sa direction vers le joueur.
  // Donc visuellement, il ne passe plus à côté.
  if (bulletTarget?.hp > 0 && b.homing) {
    const dx = bulletTarget.x - b.x;
    const dy = bulletTarget.y - b.y;
    const d = Math.hypot(dx, dy) || 1;

    const spd = Math.max(120, b.spd || Math.hypot(b.vx, b.vy) || 900);

    b.vx = (dx / d) * spd;
    b.vy = (dy / d) * spd;
  }

  const expired = advanceProjectile(b, dt);

  if (bulletTarget?.hp > 0) {
    const rr = (b.r || 0) + (bulletTarget.r || player.r) + (b.hitRadiusBonus || 0);

    if (segCircleHit(b._oldX, b._oldY, b.x, b.y, bulletTarget.x, bulletTarget.y, rr)) {
      removeProjectile(enemyBullets, i);

      const formationEvasion = bulletTarget === player
        ? Math.max(0, Number(getActiveDroneFormation(account.user).effects?.evasionPct || 0)) / 100
        : 0;
      const effectiveMiss = b.miss || (formationEvasion > 0 && Math.random() < formationEvasion);
      if (effectiveMiss) {
        if (bulletTarget === player) addMissText(player.x + (Math.random() - 0.5) * 50, player.y - 85 - Math.random() * 20);
        spawnSpark(bulletTarget.x, bulletTarget.y, false);
      } else {
        if (bulletTarget === player) hurtPlayer(b.dmg);
        else {
          damagePlayerLayers(bulletTarget, b.dmg);
          if (bulletTarget.hp <= 0) destroyEscort(bulletTarget);
        }
        spawnSpark(bulletTarget.x, bulletTarget.y, false);
      }

      continue;
    }
  }

  if (expired) removeProjectile(enemyBullets, i);
}

  tickLifetimeItems(sparks, dt, () => 0.25);
  tickFloatingTexts(floatTexts, dt);
  attractPickups(pickups, player, dt, pickup => {
    player.credits += pickup.credits || 0;
    markProgressDirty();
  });

  applyNpcSeparation(dt);
  for (const healer of enemies) {
    if (!healer || healer.hp <= 0 || !healer.isHealer) continue;
    const config = NPC_TYPES[healer.type] || {};
    healer.healPulseT = Math.max(0, (healer.healPulseT || 0) - dt);
    if (healer.healPulseT > 0) continue;
    healer.healPulseT = Number(config.healPulseInterval ?? 2);
    const radius = Number(config.healPulseRadius ?? 300);
    const radius2 = radius * radius;
    const amountPct = Number(config.healPulsePct ?? 0.1);
    healerPulses.push({ x: healer.x, y: healer.y, radius, t: 0, life: 0.8 });
    for (const ally of enemies) {
      if (!ally || ally === healer || ally.hp <= 0 || ally.type === "npc_Streuner_Aider") continue;
      const dx = ally.x - healer.x;
      const dy = ally.y - healer.y;
      if (dx * dx + dy * dy > radius2) continue;
      ally.hp = Math.min(ally.hpMax, ally.hp + ally.hpMax * amountPct);
      ally._healthRevealed = true;
    }
  }
  tickLifetimeItems(healerPulses, dt, pulse => pulse.life);
  const lockedNpcForActivity = Target.get();
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    if (!e || e.hp <= 0) continue;
    e._previousX = e.x;
    e._previousY = e.y;
    if (!shouldRunNpcFrame({
      player,
      npc: e,
      ranges: NPC_SENSOR_RANGES,
      lockedNpc: lockedNpcForActivity,
      farInterval: 15,
    })) continue;

    if (e.type === "npc_Cubikon" && !e.spritePlay) {
      e.angle = 0;
      }

    // ✅ Animation sprites (Cubikon special)
if (e.spritePlay) {
  const sp = NPC_TYPES[e.type]?.sprite;
  const frames = sp?.frames || sp?._imgs?.length || 1;

  const fps = Math.max(0.01, e.spriteFps || 12);
  e.spriteAcc += dt * fps;

  if (e.spriteAcc >= 1) {
    const steps = Math.floor(e.spriteAcc);
    e.spriteAcc -= steps;

    // ✅ Cubikon : pas de boucle %frames (on veut open/close)
    if (e.type === "npc_Cubikon") {
      const dir = e.spriteDir || 1;
      e.spriteIdx += steps * dir;
    } else {
      e.spriteIdx = (e.spriteIdx + steps) % frames;
    }
  }
}

// ✅ Cubikon : OPEN -> HOLD 2s -> SPAWN -> CLOSE -> IDLE
if (e.type === "npc_Cubikon" && e._animPhase) {
  const sp = NPC_TYPES[e.type]?.sprite;
  const frames = sp?.frames || sp?._imgs?.length || 1;
  const last = frames - 1;

   if (e._animPhase === "delay") {
    e._openDelayT -= dt;

    // reste idle (frame 0)
    e.spritePlay = false;
    e.spriteIdx = 0;
    e.spriteAcc = 0;

    if (e._openDelayT <= 0) {
      // ✅ start OPEN après l'attente
      e._animPhase = "open";
      e.spritePlay = true;
      e.spriteDir = 1;
      e.spriteIdx = 0;
      e.spriteAcc = 0;
    }
  }

  // OPEN
  if (e._animPhase === "open") {
    if (e.spriteIdx >= last) {
      e.spriteIdx = last;

      // ✅ bloque sur dernière frame
      e.spritePlay = false;
      e._animPhase = "hold";
      e._holdLastT = 2.0; // ✅ 2 secondes sur la dernière frame
    }
  }

  // HOLD
  else if (e._animPhase === "hold") {
    e.spriteIdx = last;
    e._holdLastT -= dt;

    if (e._holdLastT <= 0) {
      // ✅ Spawn ici (pendant la frame ouverte)
      const n = e._pendingSpawn || 30;
      e._pendingSpawn = 0;
      spawnProtegitOnCubikonHit(e, n);

      // ✅ commence fermeture (reverse)
      e._animPhase = "close";
      e.spritePlay = true;
      e.spriteDir = -1;
      e.spriteAcc = 0;
      e.spriteIdx = last;
    }
  }

  // CLOSE
  else if (e._animPhase === "close") {
    if (e.spriteIdx <= 0) {
      e.spriteIdx = 0;
      e.spritePlay = false;
      e.spriteAcc = 0;

      // ✅ fini : idle
      e._animPhase = null;
      e.spriteDir = 1;
      e.angle = 0;
    }
  }
}

    if (!e || e.hp <= 0) continue;

    if (e.type === "npc_Cubikon") {
      e._sinceHit = (e._sinceHit ?? 999) + dt;

      if (e._minionDespawning == null) e._minionDespawning = false;

      if (e._sinceHit >= CUBI_RESET.idleDelay) {
        e._resetting = true;

        const hpHeal = e.hpMax * CUBI_RESET.healPct * dt;
        e.hp = Math.min(e.hpMax, e.hp + hpHeal);

        if ((e.shMax || 0) > 0) {
          const shHeal = e.shMax * CUBI_RESET.shHealPct * dt;
          e.sh = Math.min(e.shMax, e.sh + shHeal);
        }

        const fullHP = e.hp >= e.hpMax - 1;
        const fullSH = (e.shMax || 0) <= 0 ? true : (e.sh >= e.shMax - 1);

        if (!fullHP || !fullSH) {
          e._minionDespawning = false;

          for (const m of enemies) {
            if (!m || m.hp <= 0) continue;
            if (m.type !== "npc_Protegit") continue;
            if (m.masterId !== e.id) continue;

            m.despawnDur = 0;
            m.despawnT = 0;
          }
        }

        if (fullHP && fullSH) {
          if (!e._minionDespawning) {
            e._minionDespawning = true;

            for (const m of enemies) {
              if (!m || m.hp <= 0) continue;
              if (m.type !== "npc_Protegit") continue;
              if (m.masterId !== e.id) continue;

              m.value = 0;
              m.noRewards = true;
              m.despawnT = 0;
              m.despawnDur =
                CUBI_RESET.minionDespawnMin +
                Math.random() * (CUBI_RESET.minionDespawnMax - CUBI_RESET.minionDespawnMin);
            }
          }

          const hasMinionAlive = enemies.some(m =>
            m && m.hp > 0 && m.type === "npc_Protegit" && m.masterId === e.id
          );

          if (!hasMinionAlive) {
            e._spawnedOnce = false;
            e._resetting = false;
            e._minionDespawning = false;
            e._sinceHit = 999;

            e._provoked = false;
            e._aggro = false;
            e._aggroT = 0;
            e._attackedPlayerRecently = false;
            if (e.aiZ) e.aiZ.state = "wander";
          }
        }
      } else {
        e._resetting = false;
        e._minionDespawning = false;
      }
    }

    if (e.type === "npc_Protegit" && e.despawnDur) {
      e.despawnT = (e.despawnT || 0) + dt;

      if (e.despawnT >= e.despawnDur) {
        e.hp = 0;
        e.sh = 0;
        continue;
      }
    }

    e.empT = Math.max(0, (e.empT || 0) - dt);
    const emp = (e.empT || 0) > 0;

    if (e.type === "npc_Cubikon") {
      e._hitSpawnCd = Math.max(0, (e._hitSpawnCd || 0) - dt);
    }

    e.wobble += dt;

    e.freezeT = Math.max(0, (e.freezeT || 0) - dt);
    const frozen = e.freezeT > 0;

    const combatTarget = getNpcCombatTarget(e);
    if (!frozen) enemyShoot(e, dt, combatTarget);

    if (e._stationaryBoss) {
      e.vx = 0;
      e.vy = 0;
      e.angle = Math.atan2(combatTarget.y - e.y, combatTarget.x - e.x);
      continue;
    }

    const dx = combatTarget.x - e.x;
    const dy = combatTarget.y - e.y;
    const d = Math.hypot(dx, dy) || 1;
    const nx = dx / d, ny = dy / d;

    const zoneMode = rules?.mode === "zone";

    if (emp) {
      e._aggro = false;
      e._aggroT = 0;
      e._attackedPlayerRecently = false;
      if (e.aiZ) e.aiZ.state = "wander";

      tickEmpWander(e, dt);
      continue;
    }

    if (frozen) {
      e.vx = 0;
      e.vy = 0;
    } else {
      if (zoneMode) {
        const cfgE = NPC_TYPES[e.type] || {};
        const isKamikaze = cfgE.ai === "kamikaze";

        if (e.type === "npc_Protegit" && e.masterId) {
          const master = getEnemyById(e.masterId);

          if (master && master.hp > 0) {
            e.anchorWanderT = (e.anchorWanderT || 0) - dt;

            if (e.anchorWanderT <= 0) {
              const ang = Math.random() * Math.PI * 2;
              const rMin = e.anchorRMin ?? 200;
              const rMax = e.anchorRMax ?? 700;
              const r = rand(rMin, rMax);

              e.anchorTX = clamp(master.x + Math.cos(ang) * r, 80, WORLD.w - 80);
              e.anchorTY = clamp(master.y + Math.sin(ang) * r, 80, WORLD.h - 80);

              e.anchorWanderT = 0.8 + Math.random() * 1.0;
            }

            const dxm = (e.anchorTX || master.x) - e.x;
            const dym = (e.anchorTY || master.y) - e.y;
            const dm = Math.hypot(dxm, dym) || 1;

            const mxv = dxm / dm;
            const myv = dym / dm;

            const spdE = e.speed || 320;
            setNpcVelocity(e, mxv, myv, spdE);

            e.x = clamp(e.x + e.vx * dt, e.r, WORLD.w - e.r);
            e.y = clamp(e.y + e.vy * dt, e.r, WORLD.h - e.r);

            if (e.vx * e.vx + e.vy * e.vy > 25) {
              e.angle = Math.atan2(e.vy, e.vx);
            }

            continue;
          }
        }

        if (!e.aiZ) {
          e.aiZ = {
            state: "wander",
            dir: Math.random() < 0.5 ? -1 : 1,
            wanderTarget: null,
            wanderT: 0
          };
        }

        e._aggroT = Math.max(0, (e._aggroT || 0) - dt);

        const aggroRange = e.aggroRange ?? 700;
        const aggroHold = e.aggroHold ?? 3.5;

        const playerInSZ = (safeZoneActive && playerIsInSafeZone());
        const npcInSZ = npcIsInSafeZone(e);

        if (playerInSZ) {
          e._aggro = false;
          e._aggroT = 0;
          e._attackedPlayerRecently = false;

          if (npcInSZ) {
            e.aiZ.state = "wander";

            if (!e.aiZ.wanderTarget || e.aiZ.wanderT <= 0) {
              const dxs = e.x - safeZoneX;
              const dys = e.y - safeZoneY;
              const ds = Math.hypot(dxs, dys) || 1;

              const nxOut = dxs / ds;
              const nyOut = dys / ds;

              const rr = DEFAULT_PORTAL_RADIUS + SAFE_ZONE_MARGIN;
              const outDist = rr + 320 + Math.random() * 420;

              let tx = safeZoneX + nxOut * outDist + rand(-260, 260);
              let ty = safeZoneY + nyOut * outDist + rand(-260, 260);

              tx = clamp(tx, 80, WORLD.w - 80);
              ty = clamp(ty, 80, WORLD.h - 80);

              e.aiZ.wanderTarget = { x: tx, y: ty };
              e.aiZ.wanderT = 1.6 + Math.random() * 1.6;
            }
          } else {
            e.aiZ.state = "wander";
          }
        } else {
          if (!e.passiveNative || e._provoked) {
            if (d <= aggroRange) {
              e._aggro = true;
              e._aggroT = aggroHold;
            }
          }
          if (e._aggro && e._aggroT <= 0) {
            e._aggro = false;
            e._attackedPlayerRecently = false;
          }
        }

        let mxv = 0, myv = 0;

        if (!playerInSZ && e._aggro) {
          e.aiZ.state = "aggro";

                  if (isKamikaze) {
            mxv = nx;
            myv = ny;
          } else {
            const mv = computeNpcCombatMove(e, d, nx, ny, e.aiZ, dt);
            mxv = mv.mxv;
            myv = mv.myv;
          }
        } else {
          e.aiZ.state = "wander";
          e.aiZ.wanderT -= dt;

          if (!e.aiZ.wanderTarget || e.aiZ.wanderT <= 0) {
            const angle = Math.random() * Math.PI * 2;
            const distance = 400 + Math.random() * 800;

            let tx = e.x + Math.cos(angle) * distance;
            let ty = e.y + Math.sin(angle) * distance;

            tx = clamp(tx, 80, WORLD.w - 80);
            ty = clamp(ty, 80, WORLD.h - 80);

            e.aiZ.wanderTarget = { x: tx, y: ty };
            e.aiZ.wanderT = 3 + Math.random() * 4;
          }

          const txW = e.aiZ.wanderTarget.x - e.x;
          const tyW = e.aiZ.wanderTarget.y - e.y;
          const tdistW = Math.hypot(txW, tyW) || 1;

          if (tdistW < 100) e.aiZ.wanderT = 0;

          mxv = (txW / tdistW) * 0.65;
          myv = (tyW / tdistW) * 0.65;
        }

        const spdE = e.speed;
        setNpcVelocity(e, mxv, myv, spdE);

        e.x = clamp(e.x + e.vx * dt, e.r, WORLD.w - e.r);
        e.y = clamp(e.y + e.vy * dt, e.r, WORLD.h - e.r);

        const spd2N = e.vx * e.vx + e.vy * e.vy;
        if (e._aggro) {
          e.angle = Math.atan2(player.y - e.y, player.x - e.x);
        } else if (spd2N > 25) {
          e.angle = Math.atan2(e.vy, e.vx);
        }

        if (isKamikaze && !player.dead && cfgE.explodeOnTouch) {
          const rrK = (cfgE.explodeRadius || 180);
          const d2K = dist2(e.x, e.y, player.x, player.y);
          if (d2K <= rrK * rrK) {
            spawnExplosion(e.x, e.y, 1.4);
            spawnSpark(e.x, e.y, true);
            const dmgK = Number(cfgE.explodeDmg || 12000);
            hurtPlayer(dmgK);
            e.hp = 0;
            e.sh = 0;
          }
        }

        continue;
      } else {
               if (!e.ai) e.ai = {};

        const mv = computeNpcCombatMove(e, d, nx, ny, e.ai, dt);

        let mxv = mv.mxv;
        let myv = mv.myv;

        const spdE = e.speed;

        setNpcVelocity(e, mxv, myv, spdE);
      }
    }

    const spd2 = e.vx * e.vx + e.vy * e.vy;
    const zoneMode2 = rules?.mode === "zone";

    let shouldFacePlayer = false;

    if (zoneMode2) {
      shouldFacePlayer = (e.aiZ?.state === "aggro");
    } else {
      const d2p = dist2(e.x, e.y, combatTarget.x, combatTarget.y);
      const r = (e.shootRange || 540);
      shouldFacePlayer = d2p <= r * r;
    }

    if (shouldFacePlayer) {
      e.angle = Math.atan2(combatTarget.y - e.y, combatTarget.x - e.x);
    } else if (spd2 > 25) {
      e.angle = Math.atan2(e.vy, e.vx);
    }

    e.x = clamp(e.x + e.vx * dt, e.r, WORLD.w - e.r);
    e.y = clamp(e.y + e.vy * dt, e.r, WORLD.h - e.r);

    const cfgTouch = NPC_TYPES[e.type] || {};
    if (!player.dead && cfgTouch.explodeOnTouch) {
      const rr = (cfgTouch.explodeRadius || 180);
      const d2 = dist2(e.x, e.y, player.x, player.y);

      const hit = d2 <= rr * rr;

      if (hit) {
        spawnExplosion(e.x, e.y, 1.4);
        spawnSpark(e.x, e.y, true);

        const dmg = Number(cfgTouch.explodeDmg || 12000);
        hurtPlayer(dmg);

        e.hp = 0;
        e.sh = 0;
      }
    }
  }

  tickEngineTrails(dt);
  processDeaths();

  camera.x += (player.x - camera.x) * (1 - Math.pow(0.0009, dt * 60));
  camera.y += (player.y - camera.y) * (1 - Math.pow(0.0009, dt * 60));

  keyboard.endFrame();
}

// ============================================================
// Render
// ============================================================
const WALL_TEX = {
  src: "assets/ui/BlockZone.png",
  w: 64,
  h: 64,
};

loadImage(WALL_TEX.src, { priority: true });

function drawZoneWalls(ox, oy) {
  if (!isZoneMap || !zoneWalls?.length) return;
  drawWallLayer(ctx, zoneWalls, WALL_TEX, {
    offsetX: ox,
    offsetY: oy,
    getImage: getCachedImage,
    isImageReady: isImgReady,
    createScaleMatrix: (sx, sy) => new DOMMatrix().scale(sx, sy),
  });
}

function drawBackgroundLayers(ox, oy) {
  drawBackgroundLayerSet(ctx, BG_LAYERS, {
    offsetX: ox,
    offsetY: oy,
    viewportWidth: innerWidth,
    viewportHeight: innerHeight,
    getImage: getCachedImage,
    isImageReady: isImgReady,
  });
}

function draw() {
  ctx.fillStyle = "#050814";
  ctx.fillRect(0, 0, innerWidth, innerHeight);

  const ox = innerWidth / 2 - camera.x;
  const oy = innerHeight / 2 - camera.y;

if (GAME_SETTINGS.background) {
  drawBackgroundLayers(ox, oy);
}

// Le champ d'étoiles est une composante permanente de l'espace. Il reste
// visible même si les images de fond optionnelles sont désactivées.
if (GAME_SETTINGS.stars) {
  drawParallaxStarfield(ctx, {
    cameraX: camera.x,
    cameraY: camera.y,
    viewportWidth: innerWidth,
    viewportHeight: innerHeight,
    elapsedSeconds: performance.now() / 1000,
  });
}

if (GAME_SETTINGS.textures) {
  drawZoneWalls(ox, oy);
}

  drawZonePortals(ox, oy);
  drawSafeModules(ox, oy);
  drawMoveTarget(ox, oy);
  drawCollectables(ox, oy);
  drawEngineTrails(ox, oy);
  drawGateEscorts(ox, oy);

  for (const pck of pickups) {
    const x = pck.x + ox, y = pck.y + oy;
    const pulse = 1 + Math.sin(pck.t * 8) * 0.08;

    ctx.save();
    ctx.translate(x, y);

    ctx.globalAlpha = 0.9;
    ctx.fillStyle = "rgba(255,210,122,0.92)";
    ctx.beginPath();
    ctx.arc(0, 0, 10 * pulse, 0, TAU);
    ctx.fill();

    ctx.globalAlpha = 0.22;
    ctx.beginPath();
    ctx.arc(0, 0, 22 * pulse, 0, TAU);
    ctx.fill();

    ctx.globalAlpha = 0.95;
    ctx.font = "1000 12px ui-sans-serif, system-ui";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    const txt = `+${pck.credits || 0}`;
    ctx.lineWidth = 4;
    ctx.strokeStyle = "rgba(5,8,20,0.90)";
    ctx.strokeText(txt, 0, 14);
    ctx.fillStyle = "rgba(255,210,122,0.95)";
    ctx.fillText(txt, 0, 14);

    ctx.restore();
    ctx.globalAlpha = 1;
  }

  const selectedEnemyForBars = Target.get();
  for (const pulse of healerPulses) {
    const x = pulse.x + ox;
    const y = pulse.y + oy;
    const k = clamp(pulse.t / pulse.life, 0, 1);
    if (x < -pulse.radius || y < -pulse.radius || x > innerWidth + pulse.radius || y > innerHeight + pulse.radius) continue;
    ctx.save();
    ctx.globalAlpha = (1 - k) * 0.78;
    const innerRadius = pulse.radius * (0.2 + k * 0.8);
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, innerRadius);
    gradient.addColorStop(0, `rgba(55,255,125,${0.48 * (1 - k)})`);
    gradient.addColorStop(0.72, `rgba(55,255,125,${0.25 * (1 - k)})`);
    gradient.addColorStop(1, "rgba(80,255,145,0)");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y, innerRadius, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = "rgba(80,255,145,0.95)";
    ctx.lineWidth = 6 - k * 3;
    ctx.shadowColor = "rgba(80,255,145,0.8)";
    ctx.shadowBlur = 16;
    ctx.beginPath();
    ctx.arc(x, y, innerRadius, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }
  for (const e of enemies) {
    if (e.hp <= 0) continue;
    if (!shouldDetectNpc(player, e, NPC_SENSOR_RANGES.visibility, selectedEnemyForBars)) continue;

    const x = e.x + ox, y = e.y + oy;
    if (x < -220 || y < -220 || x > innerWidth + 220 || y > innerHeight + 220) continue;

    ctx.save();
    ctx.translate(x, y);

    ctx.fillStyle = "rgba(255,107,122,0.86)";
    ctx.strokeStyle = "rgba(255,255,255,0.16)";
    ctx.lineWidth = 2;

    drawEnemyBody(e);

    drawNpcStatus(
      ctx,
      e,
      npcLabelFor(e),
      NPC_SENSOR_RANGES.allVisible || shouldShowNpcBars(e, selectedEnemyForBars),
    );

    ctx.restore();
    ctx.globalAlpha = 1;
  }

  drawExplosions(ox, oy);

  for (const L of lasers) drawLaserBeam(L, ox, oy);

  for (const b of bullets) {
    const x = b.x + ox, y = b.y + oy;
    if (x < -90 || y < -90 || x > innerWidth + 90 || y > innerHeight + 90) continue;
    const ang = Math.atan2(b.vy, b.vx);
    drawBulletSprite(x, y, ang, b.key || "x1", "player", 1.6);
  }

  for (const b of enemyBullets) {
    const x = b.x + ox, y = b.y + oy;
    if (x < -120 || y < -120 || x > innerWidth + 120 || y > innerHeight + 120) continue;
    const ang = Math.atan2(b.vy, b.vx);
    const scale = b.scale ?? 1.5;
    drawBulletSprite(x, y, ang, b.key || "x1", "npc", scale, b.sprite || null);
  }

  for (const s of sparks) {
    const x = s.x + ox, y = s.y + oy;
    if (x < -40 || y < -40 || x > innerWidth + 40 || y > innerHeight + 40) continue;
    const a = 1 - clamp(s.t / 0.25, 0, 1);
    ctx.globalAlpha = a * 0.8;
    ctx.fillStyle = "rgba(255,210,122,0.9)";
    ctx.beginPath();
    ctx.arc(x, y, (s.big ? 26 : 14) * (1 - a * 0.2), 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  for (const ft of floatTexts) {
    const p = clamp(ft.t / ft.life, 0, 1);
    const a = 1 - p;

    const sx = ft.x + ox;
    const sy = ft.y + oy;
    if (sx < -120 || sy < -80 || sx > innerWidth + 120 || sy > innerHeight + 80) continue;

    const popK = Math.exp(-p * 10);
    const sc = 1 + (ft.pop || 0) * popK;

    const sh = (ft.shake || 0) * (1 - p);
    const jx = (Math.random() * 2 - 1) * sh;
    const jy = (Math.random() * 2 - 1) * sh;

    ctx.save();
    ctx.translate(sx + jx, sy + jy);
    ctx.scale(sc, sc);

    ctx.globalAlpha = a;
    ctx.shadowBlur = (ft.glow || 0) * 26 * (1 - p);
    ctx.shadowColor = ft.color;

    ctx.font = `${ft.weight || 900} ${Math.round(ft.size || 18)}px ui-sans-serif, system-ui`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    const lw = clamp((ft.size || 18) * 0.22, 4, 12);
    ctx.lineWidth = lw;
    ctx.strokeStyle = "rgba(5,8,20,0.92)";
    ctx.strokeText(ft.text, 0, 0);

    ctx.fillStyle = ft.color;
    ctx.fillText(ft.text, 0, 0);

    ctx.restore();
    ctx.globalAlpha = 1;
  }

  const px = player.x + ox, py = player.y + oy;
  if (!player.dead) {
    ctx.save();
    ctx.translate(px, py);
    
    const tt = performance.now() / 1000;
    const bobY = Math.sin(tt * 4.0) * 2 * idleSway;
    ctx.translate(0, bobY);

    drawPlayerDrones();
        const ok = drawPlayerBody();
    if (!ok) {
      ctx.rotate(player.angle);
      ctx.fillStyle = "rgba(215,226,255,0.92)";
      ctx.strokeStyle = "rgba(124,240,255,0.35)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(18, 0);
      ctx.lineTo(-12, -10);
      ctx.lineTo(-6, 0);
      ctx.lineTo(-12, 10);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    // ✅ FX réparation par-dessus le vaisseau
    drawRepairOrbitFxLocal();

    ctx.restore();
    ctx.globalAlpha = 1;
  }

  // L'IEM reste centrée sur le joueur et se dessine au-dessus du vaisseau.
  drawPulseFx(ox, oy);

  const t = Target.get();
  drawEscortTargetLocks(ox, oy);
  if (t) {
    drawTargetMarker(t, ox, oy, performance.now() / 1000);
  }

  drawPlayerBars(px, py);
  drawMinimap();
  drawToast();
  drawRadiationWarning();
}

// ============================================================
// UI update
// ============================================================
let lastEscortPanelHtml = "";
function renderEscortPanel() {
  if (!ui.escortWindowBody) return;
  const html = escortShips.length ? escortShips.map((escort, index) => {
    const alive = escort.hp > 0;
    const hpPct = clamp(escort.hp / Math.max(1, escort.hpMax), 0, 1) * 100;
    const shPct = clamp(escort.sh / Math.max(1, escort.shMax), 0, 1) * 100;
    const targetName = alive && escort.target ? (NPC_TYPES[escort.target.type]?.name || "Cible") : "Aucune cible";
    const status = alive ? targetName : `Retour dans ${Math.ceil(Number(escort.respawnT || 0))} s`;
    return `<article class="escortStatus${alive ? "" : " destroyed"}"><div class="escortStatusHead"><strong>ESCORTE ${index + 1}</strong><span>${escapeHtml(status)}</span></div><div class="escortVitals barWrap"><div class="bar hp"><i style="width:${hpPct}%"></i><span class="barValue">${formatInteger(escort.hp)} / ${formatInteger(escort.hpMax)}</span></div><div class="bar sh"><i style="width:${shPct}%"></i><span class="barValue">${formatInteger(escort.sh)} / ${formatInteger(escort.shMax)}</span></div></div></article>`;
  }).join("") : `<div class="escortEmpty">Aucune escorte engag&eacute;e dans cette Gate.</div>`;
  if (html !== lastEscortPanelHtml) {
    ui.escortWindowBody.innerHTML = html;
    lastEscortPanelHtml = html;
  }
}

const hudLastText = new Map();
const hudLastWidth = new Map();
const hudLastDisplay = new Map();

function setHudText(element, value) {
  if (!element) return;
  const text = String(value);
  if (hudLastText.get(element) === text) return;
  hudLastText.set(element, text);
  element.textContent = text;
}

function setHudWidth(element, width) {
  if (!element) return;
  if (hudLastWidth.get(element) === width) return;
  hudLastWidth.set(element, width);
  element.style.width = width;
}

function setHudDisplay(element, display) {
  if (!element) return;
  if (hudLastDisplay.get(element) === display) return;
  hudLastDisplay.set(element, display);
  element.style.display = display;
}

const hudLastAttr = new WeakMap();

function setHudAttr(element, name, value) {
  if (!element) return;
  const text = String(value);
  let byName = hudLastAttr.get(element);
  if (!byName) {
    byName = new Map();
    hudLastAttr.set(element, byName);
  }
  if (byName.get(name) === text) return;
  byName.set(name, text);
  element.setAttribute(name, text);
}

const hudLastClass = new WeakMap();

function setHudClass(element, className, on) {
  if (!element || !className) return;
  let byName = hudLastClass.get(element);
  if (!byName) {
    byName = new Map();
    hudLastClass.set(element, byName);
  }
  const bool = !!on;
  if (byName.get(className) === bool) return;
  byName.set(className, bool);
  if (bool) element.classList.add(className);
  else element.classList.remove(className);
}

const hudLastDisabled = new WeakMap();

function setHudDisabled(element, on) {
  if (!element) return;
  const bool = !!on;
  if (hudLastDisabled.get(element) === bool) return;
  hudLastDisabled.set(element, bool);
  element.disabled = bool;
}

function drawUI() {
  const zoneMode = rules?.mode === "zone";
  const terminalAccess = hasQuestTerminalAccess();
  if (terminalAccess !== lastQuestTerminalAccess) renderQuestTerminal();

  if (ui.boxWave) {
    const waveWindowOpen = window.GameWindowManager?.isOpen("boxWave") ?? true;
    setHudDisplay(ui.boxWave, !zoneMode && waveWindowOpen ? "block" : "none");
  }

  setHudText(ui.credits, formatInteger(player.credits));
  setHudText(ui.kills, formatInteger(player.kills));

  if (ui.gygerimStatus) {
    const bossType = rules?.bossEncounter?.bossType;
    const boss = bossType ? enemies.find(enemy => enemy?.hp > 0 && enemy.type === bossType) : null;
    setHudDisplay(ui.gygerimStatus, boss ? "block" : "none");
    if (boss) {
      const hpMax = Math.max(1, Number(boss.hpMax) || 1);
      const shMax = Math.max(0, Number(boss.shMax) || 0);
      setHudText(ui.bossStatusTitle, String(NPC_TYPES[boss.type]?.name || rules?.bossEncounter?.name || "BOSS").toLocaleUpperCase("fr-FR"));
      setHudWidth(ui.gygerimHpBar, `${clamp(boss.hp / hpMax, 0, 1) * 100}%`);
      setHudWidth(ui.gygerimShBar, `${(shMax > 0 ? clamp(boss.sh / shMax, 0, 1) : 0) * 100}%`);
      setHudText(ui.gygerimHpTxt, `${formatInteger(boss.hp)} / ${formatInteger(hpMax)}`);
      setHudText(ui.gygerimShTxt, `${formatInteger(boss.sh)} / ${formatInteger(shMax)}`);
    }
  }
  renderEscortPanel();

const u = account.user || null;
const st = u?.stats || {};

const exp = Number(st.exp || 0);
const lvl = getLevelInfo(exp);
st.rankPoints = calculateRankPoints(st);
updateProgressHud(ui, st, lvl);

if (ui.spdTxt) {
  const spd = getSpeedBreakdown();

  setHudText(ui.spdTxt, formatInteger(spd.total));

  setHudAttr(ui.spdTxt, "title",
    `Vaisseau: ${spd.base}` +
    ` | Générateurs: +${spd.genSpeed}` +
    ` | Modules vitesse: +${spd.speedPct}%` +
    ` | Config ${spd.config}`);

  // Debug console si vitesse anormale
  if (spd.total > spd.base && !window.__speedDebugShown) {
    window.__speedDebugShown = true;
    console.log("🚀 SPEED DEBUG", spd);
  }
}

updateConfigButtons();

  updateResourceHud(ui, player);
  updateWaveHud(ui, { started, wave, remaining: waveSpawns.remaining, alive: enemies.length });

  setHudText(ui.shopCredits, formatInteger(player.credits));

  updateSkillUI();
  updateRepairUI();

  const pulsePct = getPulsePercent();
  setHudText(ui.pulsePct, `${pulsePct}%`);

  if (ui.pulsePrice) {
    const pulsePriceText = pulseCd > 0 ? `${pulseCd.toFixed(1)}s` : "30 000 Cr.";
    setHudText(ui.pulsePrice, pulsePriceText);
  }

  const rsbPct = getRsbPercent();
  setHudText(ui.cntX6, `${formatInteger(player.ammo.x6)} • ${rsbPct}%`);
  setHudClass(ui.btnX6, "ready",
    started && !player.dead && ammoCount("x6") > 0 && rsbCooldown <= 0
  );

  setHudText(ui.miniMapName, `Map : ${rules?.mapLabel || "—"}`);
  setHudText(ui.miniPos, `Pos : ${formatInteger(player.x)} / ${formatInteger(player.y)}`);

  setHudText(ui.versionTxt, `ALPHA v.${GAME_VERSION}`);
  if (ui.fpsTxt) {
    const perf = performanceMonitor.snapshot();
    setHudText(ui.fpsTxt, String(fpsValue || perf.fps || 0));
  }
}

// ============================================================
// Start game
// ============================================================
let starting = false;
let assetsPrepared = false;
const SESSION_ASSET_CACHE_KEY = "orbit_assets_preloaded_v1";

function renderLoadingProgress({ done = 0, total = 0 } = {}) {
  const percent = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
  if (ui.loadingBar) ui.loadingBar.style.width = `${percent}%`;
  if (ui.loadingCount) ui.loadingCount.textContent = `${done} / ${total} éléments`;
  if (ui.loadingPercent) ui.loadingPercent.textContent = `${percent} %`;
  ui.loadingOverlay?.querySelector(".loadingTrack")?.setAttribute("aria-valuenow", String(percent));
}

function revealPreparedGame() {
  requestAnimationFrame(() => requestAnimationFrame(() => {
    document.documentElement.classList.remove("orbitBooting");
  }));
}

function npcTypesForCurrentSector() {
  const types = new Set();
  try {
    if (rules?.mode === "zone" && typeof rules.getZoneSpawns === "function") {
      for (const spawn of rules.getZoneSpawns(WORLD) || []) if (spawn?.type) types.add(spawn.type);
    } else {
      for (let waveNo = 1; waveNo <= 32; waveNo++) {
        for (const spawn of getWavePlan(waveNo)?.spawns || []) if (spawn?.type) types.add(spawn.type);
      }
    }
  } catch (error) {
    console.warn("Préchargement NPC partiel:", error);
  }
  if (DEFAULT_WAVE_TYPE) types.add(DEFAULT_WAVE_TYPE);
  return types;
}

async function preloadWholeGameCache() {
  if (ui.loadingStatus) ui.loadingStatus.textContent = "Premier lancement : mise en cache complète du jeu…";
  const response = await fetch("./assets-manifest.json", { cache: "no-cache" });
  if (!response.ok) throw new Error(`Manifeste de ressources indisponible (${response.status})`);
  const manifest = await response.json();
  const assets = Array.isArray(manifest?.assets) ? manifest.assets : [];
  let cursor = 0;
  let done = 0;
  let failed = 0;

  const update = () => {
    const percent = assets.length ? Math.round((done / assets.length) * 100) : 100;
    if (ui.loadingBar) ui.loadingBar.style.width = `${percent}%`;
    if (ui.loadingCount) ui.loadingCount.textContent = `${done} / ${assets.length} ressources`;
    if (ui.loadingPercent) ui.loadingPercent.textContent = `${percent} %`;
    ui.loadingOverlay?.querySelector(".loadingTrack")?.setAttribute("aria-valuenow", String(percent));
  };

  update();
  const worker = async () => {
    while (cursor < assets.length) {
      const index = cursor++;
      try {
        const assetResponse = await fetch(assets[index], { cache: "force-cache" });
        if (!assetResponse.ok) throw new Error(String(assetResponse.status));
        await assetResponse.arrayBuffer();
      } catch {
        failed++;
      } finally {
        done++;
        if (done % 8 === 0 || done === assets.length) update();
      }
    }
  };

  await Promise.all(Array.from({ length: 8 }, worker));
  if (failed) console.warn(`${failed} ressource(s) n'ont pas pu être mises en cache.`);
}

async function prepareGameAssets() {
  if (assetsPrepared) return;

  let sessionCacheReady = false;
  try { sessionCacheReady = sessionStorage.getItem(SESSION_ASSET_CACHE_KEY) === "ready"; } catch {}

  if (sessionCacheReady) {
    if (ui.loadingOverlay) ui.loadingOverlay.style.display = "none";
    const essentialJobs = [ensurePackLoaded(ACTIVE_SHIP), loadImage(WALL_TEX.src, { priority: true })];
    for (const layer of BG_LAYERS) essentialJobs.push(loadImage(layer.src, { priority: true }));
    if (rules?.mode === "zone" && typeof rules.getZonePortals === "function") {
      try {
        for (const portal of rules.getZonePortals(WORLD) || []) essentialJobs.push(...preloadPortalSprites(portal));
      } catch {}
    } else {
      essentialJobs.push(...preloadPortalSprites());
    }
    await Promise.allSettled(essentialJobs);
    playerImgs = ACTIVE_SHIP._imgs;
    playerImgsReady = true;
    assetsPrepared = true;
    await startGame();
    return;
  }

  if (ui.loadingOverlay) ui.loadingOverlay.style.display = "grid";
  await preloadWholeGameCache();
  if (ui.loadingStatus) ui.loadingStatus.textContent = "Préparation des éléments du secteur…";

  const unsubscribe = IMG.onProgress(renderLoadingProgress);
  const jobs = [];
  for (const layer of WORLD.bgLayers || []) if (layer?.src) jobs.push(loadImage(layer.src, { priority: true }));
  jobs.push(ensurePackLoaded(ACTIVE_SHIP));
  jobs.push(...preloadPlayerBulletSprites());
  jobs.push(ensureLaserLoaded(), ensureExplosionLoaded(), ensurePulseFxLoaded(), ensureRepairOrbitLoaded());
  jobs.push(...preloadCollectables());

  for (const type of Object.keys(NPC_TYPES)) jobs.push(ensureNpcPreview(type));
  for (const type of npcTypesForCurrentSector()) {
    if (NPC_TYPES[type]) jobs.push(ensureNpcLoaded(type));
  }

  if (rules?.mode === "zone" && typeof rules.getZonePortals === "function") {
    try {
      for (const portal of rules.getZonePortals(WORLD) || []) jobs.push(...preloadPortalSprites(portal));
    } catch (error) {
      console.warn("Préchargement portail partiel:", error);
    }
  } else {
    jobs.push(...preloadPortalSprites());
  }

  await Promise.allSettled(jobs);
  await IMG.whenIdle();
  renderLoadingProgress(IMG.snapshot());
  unsubscribe();
  assetsPrepared = true;
  try { sessionStorage.setItem(SESSION_ASSET_CACHE_KEY, "ready"); } catch {}

  playerImgs = ACTIVE_SHIP._imgs;
  playerImgsReady = true;
  if (ui.loadingStatus) ui.loadingStatus.textContent = "Secteur prêt. Tous les éléments essentiels sont en cache.";
  if (ui.loadingStartBtn) {
    ui.loadingStartBtn.disabled = false;
    ui.loadingStartBtn.textContent = "DÉPART";
  }

  if (GAME_SETTINGS.autoStart) await startGame();
}

async function startGame() {
  if (starting || started) return;
  starting = true;

  SFX.preload();
  preloadPlayerBulletSprites();
  ensureExplosionLoaded();
  ensurePulseFxLoaded();
  ensureRepairOrbitLoaded();

  const u = getCurrentUserFull();
  if (u?.ship) {
    const found = SHIP_PACKS.find(p => p.id === u.ship);
    if (found) ACTIVE_SHIP = found;
  }

  if (!playerImgsReady) {
    await ensurePackLoaded(ACTIVE_SHIP);
    playerImgs = ACTIVE_SHIP._imgs;
    playerImgsReady = true;
  }

  started = true;

  try {
    localStorage.setItem("orbit_game_open", String(Date.now()));
  } catch {}

  lockSessionHangar();

startHintT = 7.5;

if (ui.startHint) {
  ui.startHint.style.display = "block";
}

  resetRun({ randomSpawn: false });
  advanceQuestProgress("visit", String(window.__CURRENT_MAP_ID__ || "").toLowerCase());
  // Le contenu des fenêtres n'est pas conservé par le DOM après un refresh.
  // Recharge immédiatement le journal depuis le compte avant que le joueur
  // rouvre l'icône « Missions » dans le dock.
  renderQuestWindow();
  renderQuestTerminal();
  if (window.__ORBIT_MAP_TRANSITION__) player.iFrames = 0;
  setCenterMsg(false);

  if (ui.loadingOverlay) {
    ui.loadingOverlay.classList.add("isLeaving");
    setTimeout(() => { ui.loadingOverlay.style.display = "none"; }, 240);
  }

  revealPreparedGame();

  starting = false;
}

ui.loadingStartBtn?.addEventListener("click", () => startGame());

// ============================================================
// Frame loop
// ============================================================
let last = performance.now();
let fpsAcc = 0;
let fpsFrames = 0;
let fpsValue = 0;
const performanceMonitor = createPerformanceMonitor();

function frame(t) {
  const dt = Math.min(0.033, (t - last) / 1000);
  last = t;
  performanceMonitor.record(dt);

  fpsAcc += dt;
  fpsFrames++;
  if (fpsAcc >= 0.25) {
    fpsValue = Math.round(fpsFrames / fpsAcc);
    fpsAcc = 0;
    fpsFrames = 0;
  }

  try {
    update(dt);
    draw();
    drawUI();
  } catch (err) {
    console.error("CRASH:", err);
    started = false;
    setCenterMsg(true, "Erreur JS", "Ouvre la console (F12) et copie l'erreur <b>CRASH</b>.", "");
  }
  requestAnimationFrame(frame);
}

// ============================================================
// Init
// ============================================================
function saveStateImmediate() {
  try { if (sessionStorage.getItem("orbit_faction_transfer")) return; } catch {}
  if (!account.user) return;
  if (!started) return;
  if (player.dead) return;

  const currentMap = window.__CURRENT_MAP_ID__ || "1-1";
  if (SESSION_HANGAR_ID) {
    saveHangarStateById(SESSION_HANGAR_ID, player.x, player.y, currentMap);
  } else {
    saveActiveHangarState(player.x, player.y, currentMap);
  }

updateCurrentUserProgress({
  credits: player.credits,
  quests: questState,
  stats: { ...(account.user.stats || {}) },
  inventory: { resources: { ...(account.user.inventory?.resources || {}) } },
  drones: account.user.drones,

  // ⚠️ Ne surtout pas sauvegarder ship ici.
  // Le vaisseau actif est géré par setActiveHangar().
  ammo: {
    x1: Infinity,
    x2: player.ammo.x2 || 0,
    x3: player.ammo.x3 || 0,
    x4: player.ammo.x4 || 0,
    sab: player.ammo.sab || 0,
    x6: player.ammo.x6 || 0,
  },
});
}

async function switchMapConfig(nextConfig, { mapId, spawnId = null } = {}) {
  if (!nextConfig?.WORLD || !mapId) throw new Error("Configuration de destination invalide");

  const nextRules = nextConfig.rules || {};
  const nextWorld = nextConfig.WORLD;
  const nextBackgrounds = createBackgroundLayers(nextWorld, nextRules);
  const preparedZoneCamps = nextRules.mode === "zone" && typeof nextRules.getZoneSpawns === "function"
    ? nextRules.getZoneSpawns(nextWorld) : [];
  const preparedZonePortals = nextRules.mode === "zone" && typeof nextRules.getZonePortals === "function"
    ? nextRules.getZonePortals(nextWorld) : [];

  const jobs = nextBackgrounds.map((layer) => loadImage(layer.src, { priority: true }));
  for (const camp of preparedZoneCamps) if (camp?.type && NPC_TYPES[camp.type]) jobs.push(ensureNpcLoaded(camp.type));
  if (nextRules.mode !== "zone" && typeof nextConfig.getWavePlan === "function") {
    const gateTypes = new Set();
    for (let waveNo = 1; waveNo <= 32; waveNo++) {
      for (const spawn of nextConfig.getWavePlan(waveNo)?.spawns || []) if (spawn?.type) gateTypes.add(spawn.type);
    }
    for (const type of gateTypes) if (NPC_TYPES[type]) jobs.push(ensureNpcLoaded(type));
  }
  for (const targetPortal of preparedZonePortals) jobs.push(...preloadPortalSprites(targetPortal));
  await Promise.allSettled(jobs);

  saveStateImmediate();
  WORLD = nextWorld;
  getWavePlan = nextConfig.getWavePlan || (() => ({ spawns: [] }));
  DEFAULT_WAVE_TYPE = nextConfig.DEFAULT_WAVE_TYPE || "dummy";
  rules = nextRules;
  BG_LAYERS = nextBackgrounds;
  NPC_SENSOR_RANGES = getNpcSensorRanges(rules);
  isZoneMap = rules.mode === "zone";

  window.__CURRENT_MAP_ID__ = String(mapId);
  addGameLog(`Entrée sur la carte ${mapId}`, "info");
  window.__SPAWN_PORTAL_ID__ = spawnId;
  window.__ORBIT_MAP_TRANSITION__ = true;
  try {
    sessionStorage.setItem("spawnPortalId", String(spawnId ?? ""));
    sessionStorage.setItem("spawnMapId", String(mapId));
  } catch {}

  const url = new URL(location.href);
  url.searchParams.set("map", String(mapId));
  if (spawnId) url.searchParams.set("spawn", String(spawnId));
  else url.searchParams.delete("spawn");
  history.replaceState({ mapId }, "", url);

  resetRun({ preparedZoneCamps, preparedZonePortals });
  player.iFrames = 0;
  mapPortalLock = 0.6;
  markProgressDirty();
  saveProgressNow();
  return true;
}

const HANGAR_ACTION_DELAY_MS = 5000;
const HANGAR_SWITCH_TIME_KEY = "orbit_hangar_last_switch_at";

function playerIsInBaseZone() {
  const zone = zoneSafe?.zone;
  return !!(zone?.kind === "circle"
    && dist2(player.x, player.y, zone.x, zone.y) <= (zone.r || 0) * (zone.r || 0));
}

function getHangarAccess() {
  const now = Date.now();
  const lastSwitchAt = Math.max(0, Number(sessionStorage.getItem(HANGAR_SWITCH_TIME_KEY)) || 0);
  const switchCooldownMs = Math.max(0, HANGAR_ACTION_DELAY_MS - (now - lastSwitchAt));
  const attackedCooldownMs = Math.max(0, Math.ceil((player.attackedT || 0) * 1000));
  const inNonAggressionZone = !!(safeZoneActive && playerIsInSafeZone());
  const currentMap = String(window.__CURRENT_MAP_ID__ || rules?.mapLabel || "").toLowerCase();
  const factionSector = getFaction((account.user || getCurrentUserFull())?.faction).sector;
  const equipmentMaps = new Set([`${factionSector}-1`, `${factionSector}-8`, "5-2"]);
  const onEquipmentMap = equipmentMaps.has(currentMap);
  const inEquipmentBase = onEquipmentMap && playerIsInBaseZone();

  let activationError = "";
  if (!inNonAggressionZone) activationError = "Place-toi dans une zone de non-agression pour changer de vaisseau.";
  else if (attackedCooldownMs > 0) activationError = `Attends ${Math.ceil(attackedCooldownMs / 1000)} s après la dernière attaque reçue.`;
  else if (switchCooldownMs > 0) activationError = `Attends ${Math.ceil(switchCooldownMs / 1000)} s avant un nouveau changement de vaisseau.`;

  let equipmentError = "";
  if (!onEquipmentMap) equipmentError = `L'équipement est disponible uniquement sur les bases ${factionSector}-1, ${factionSector}-8 ou 5-2.`;
  else if (!inEquipmentBase) equipmentError = "Rapproche-toi de la base centrale pour modifier l'équipement.";

  return {
    canActivate: !activationError,
    activationError,
    canEquip: !equipmentError,
    equipmentError,
    attackedCooldownMs,
    switchCooldownMs,
    currentMap,
  };
}

function markHangarChanged() {
  sessionStorage.setItem(HANGAR_SWITCH_TIME_KEY, String(Date.now()));
}

window.__ORBIT_ENGINE__ = {
  switchMap: switchMapConfig,
  getHangarAccess,
  markHangarChanged,
};

// ✅ Sauvegarde d'urgence avant de quitter la map (appelé par main.js via __GO_TO_MAP__)
window.__SAVE_BEFORE_LEAVE__ = () => {
  saveStateImmediate();
};

addEventListener("beforeunload", () => {
  try { saveStateImmediate(); } catch {}
  try { localStorage.removeItem("orbit_game_open"); } catch {}
});

addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") {
    try { saveStateImmediate(); } catch {}
    try { localStorage.setItem("orbit_game_open", String(Date.now())); } catch {}
  }
});

window.addEventListener("storage", (e) => {
  if (e.key !== "orbit_sync") return;

  const nowActive = getActiveHangarId();
  if (started && SESSION_HANGAR_ID && nowActive && nowActive !== SESSION_HANGAR_ID) {
    location.reload();
  }
});

window.addEventListener("orbit:user-updated", event => {
  // Une sauvegarde issue de ce moteur possède déjà le bon état en mémoire.
  // Évite de relire le compte et de recalculer tout l'équipement après chaque
  // destruction ou collecte.
  if (event?.detail?.source === "progress") return;
  const refreshed = getCurrentUserFull();
  if (!refreshed) return;
  account.user = refreshed;
  if (started) applyCurrentConfigStats(true);
});

resetPlayerToBase();
updateAmmoUI();
setAmmo("x1");

const cur = getCurrentUserFull() || null;

if (!cur) {
  location.href = "./public/auth.html";
  return;
}

const currentGateMapId = String(window.__CURRENT_MAP_ID__ || "").toLowerCase();
if (rules?.mode === "gate" && GALAXY_GATE_DEFINITIONS[currentGateMapId] && cur.galaxyGates?.active !== currentGateMapId) {
  const homeMap = getFactionHomeMap(cur.faction);
  showToast("Galaxy Gate non construite", 1.5);
  window.__GO_TO_MAP__?.(homeMap);
  return;
}

const pack = SHIP_PACKS.find(p => p.id === cur.ship) || SHIP_PACKS[0];
ACTIVE_SHIP = pack;
document.documentElement.classList.add("orbitHudReady");

prepareGameAssets().catch((error) => {
  console.error("Erreur de préparation:", error);
  if (ui.loadingStatus) ui.loadingStatus.textContent = "Chargement incomplet. Tu peux tout de même démarrer.";
  if (ui.loadingStartBtn) {
    ui.loadingStartBtn.disabled = false;
    ui.loadingStartBtn.textContent = "DÉPART";
  }
});

setCenterMsg(false);
requestAnimationFrame(frame);

}
