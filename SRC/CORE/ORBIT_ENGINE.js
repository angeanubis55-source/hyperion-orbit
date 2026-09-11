import { petEscortTarget, stepPetMotion, petCombatVelocity, orientPet } from "../../PET/PET_MOTION.js";
import { measureGameTask } from "./PERFORMANCE_TIMINGS.js";
import { NpcEngine } from "../../NPC/NPC_ENGINE_RENDERER.js";
import { ShipEngine } from "../../SHIP/SHIP_ENGINE_RENDERER.js";
import { PetEngine } from "../../PET/PET_ENGINE_RENDERER.js";
import { drawEngineTrailParticles, updateEngineTrailParticles } from "./ENGINE_TRAILS.js";
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
  getPetFit,
  setPetActive,
  setPetMode,
} from "./ACCOUNT.js";
import {
  GALAXY_GATE_BUILD_LIMIT,
  GALAXY_GATE_DEFINITIONS,
  GALAXY_SPIN_CREDIT_COST,
  normalizeGalaxyGateState,
} from "./GALAXY_GATES.js";
import { computeHangarStats } from "../../SHIP/SHIP_HANGARS.js";
import { findCatalogItem } from "./CATALOG.js";
import { CRAFTING_RECIPES } from "../DATA/CRAFTING.js";
import { ITEM_RARITIES } from "../DATA/ITEM_RARITIES.js";
import { SHIP_EFFECTS } from "../../SHIP/SHIP_EFFECTS.js";
import { GAME_VERSION } from "../DATA/VERSION.js";
import { getShipPackById as getShipPackByIdData } from "../../SHIP/SHIP_PACKS.js";
import { DRONE_FORMATIONS, DRONE_TYPES, DRONE_XP_SHARE, getActiveDroneFormation, getDroneLevel, getDroneSpritePath } from "../../DRONE/DRONE_TYPES.js";
import { DRONE_FORMATION_POSITIONS } from "../../DRONE/DRONE_FORMATIONS.js";
import { PET_XP_SHARE, PET_FUEL_MAX, getPetDamageBonus, getPetLevel, getPetLevelXp, getPetMaxHp, getPetNextLevelXp, getPetShieldBonus, getPetStage, getPetStageBase, normalizePetMode, PET_STAGE_DIRS, PET_SPRITE_FRAMES } from "../../PET/PET_TYPES.js";
import { clamp, circleRectResolve, dist2, movingCircleHit, segCircleHit } from "./COLLISION.js";
import { createKeyboardState, createPointerState } from "./INPUT.js";
import { bulletLifeForRange, damageEnemyLayers, damagePlayerLayers, drainShield } from "../../COMBAT/COMBAT_RULES.js";
import { createSpatialPairIndex, rebuildIdIndex } from "./SPATIAL_INDEX.js";
import { drawCenteredImage, hpHueColor, isWorldPointVisible, screenToWorldPoint, worldToScreenPoint } from "./RENDERING.js";
import { spawnNpcEntity } from "../../NPC/NPC_SPAWNER.js";
import { addProjectile, advanceProjectile, blendVelocityDirection, guideLauncherRocketVelocity, launcherRocketLaunchAngle, removeProjectile } from "../../COMBAT/PROJECTILES.js";
import { createWaveSpawnState } from "./WAVES.js";
import { shouldShowNpcBars, updateProgressHud, updateResourceHud, updateWaveHud } from "../../UI/UI_HUD.js";
import { createPerformanceMonitor } from "./PERFORMANCE_MONITOR.js";
import { computeNpcCombatMove as computeNpcCombatMovement, setNpcVelocity } from "../../NPC/NPC_AI.js";
import { getNpcSensorRanges, shouldDetectNpc } from "../../NPC/NPC_SENSORS.js";
import { shouldRunNpcFrame } from "../../NPC/NPC_ACTIVITY.js";
import { NPC_SHOTS as NPC_SHOT_RULES } from "../../NPC/NPC_PROJECTILES.js";
import { applyNpcSeparation as separateNpcEntities } from "../../NPC/NPC_MOVEMENT.js";
import { CUBIKON_RESET } from "../../NPC/NPC_SPECIAL_BEHAVIORS.js";
import { selectNpcCombatTarget } from "../../NPC/NPC_COMBAT.js";
import { getNpcSpriteFrame } from "../../NPC/NPC_RENDERER.js";
import { pushBounded } from "./BOUNDED_COLLECTION.js";
import { createRadiationSystem } from "./RADIATION_SYSTEM.js";
import {
  createGatePortalState,
  getGateReturnMap as resolveGateReturnMap,
  positionGateChoicePortals,
  resetGatePortalState,
} from "./GATE_SYSTEM.js";
import {
  beginGatePortalJump,
  getPortalJumpFade as computePortalJumpFade,
  getPortalOpenFade as computePortalOpenFade,
  startPortalClosing,
  tickGatePortalJumps as advanceGatePortalJumps,
  tickPortalVisualTransitions,
  updatePortalProximity,
} from "./PORTAL_SYSTEM.js";
import { buildQuestJournalView, buildQuestTerminalView } from "../../QUEST/QUEST_PRESENTATION.js";
import { loadNpcLocationIndex } from "../../QUEST/QUEST_LOCATIONS.js";
import {
  drawMoveTargetMarker,
  drawNpcStatus,
  drawPlayerStatus,
  drawTargetLock,
  drawToastMessage,
} from "../../UI/UI_CANVAS_HUD.js";
import { renderMinimap } from "../../UI/UI_MINIMAP.js";
import { drawBackgroundLayerSet, drawParallaxStarfield, drawWallLayer } from "./WORLD_LAYER_RENDERER.js";
import { advancePlayerToTarget, attractPickups, tickFloatingTexts, tickLifetimeItems, updatePlayerVelocity } from "./FRAME_SYSTEMS.js";
import { calculateRankPoints, getLevelInfo, getNpcExperienceReward, getNpcHonorReward, getQuestExperienceReward, getQuestHonorReward, getRankInfo, grantExperience, grantHonor } from "./PROGRESSION.js";
import { formatInteger } from "./NUMBER_FORMAT.js";
import { escapeHtml } from "../../UI/UI_DOM.js";
import { appendGameLog, readGameLogs } from "./GAME_LOG_STORE.js";
import { getFaction, getFactionBaseSpawn, getFactionHomeMap, getFactionRespawnMap, normalizeFactionId, resolveBaseCenter } from "./FACTIONS.js";
import {
  QUEST_DEFINITIONS,
  acceptQuest,
  abandonQuest,
  claimQuest,
  isQuestComplete,
  normalizeQuestState,
  recordQuestProgress,
} from "../../QUEST/QUEST_TYPES.js";
import {
  COLLECTABLE_SPAWN as DEFAULT_COLLECTABLE_SPAWN,
  COLLECTABLE_TYPES as DEFAULT_COLLECTABLE_TYPES,
} from "../DATA/COLLECTABLES.js";
import { getResourceName } from "../DATA/RESOURCES.js";
import { ROCKET_IDS, ROCKET_TYPES, getRocketType, rocketFlightLife, rocketLaunchSpeed, rocketShopIcon } from "../../COMBAT/ROCKET_TYPES.js";
import { SFX_SOUND_NAMES } from "./SFX.js";

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
const radiationSystem = createRadiationSystem({ tickInterval: 1.0, minPct: 0.01, maxPct: 0.05, scaleDepth: 2000 });
let radiationActive = false;

function playerIsOutsideWorld() {
  return (
    player.x < 0 ||
    player.x > WORLD.w ||
    player.y < 0 ||
    player.y > WORLD.h
  );
}

function radiationDepth(x, y) {
  const dx = x < 0 ? -x : x > WORLD.w ? x - WORLD.w : 0;
  const dy = y < 0 ? -y : y > WORLD.h ? y - WORLD.h : 0;
  return Math.hypot(dx, dy);
}

function applyRadiation(dt) {
  if ((player.invincibleT || 0) > 0) return;
  const dmg = radiationSystem.update(dt, {
    started,
    dead: player.dead,
    outside: playerIsOutsideWorld(),
    depth: radiationDepth(player.x, player.y),
    hpMax: player.hpMax,
  });
  radiationActive = radiationSystem.state.active;
  if (radiationActive) {
    showToastFixed("Vous êtes en zone de radiations", { pulse: true });
    // ✅ on attend 5 s avant de jouer le son de la zone de radiation
    if (radiationSoundDelay <= 0 && !SFX.loops["radiationLoop"]) {
      radiationSoundDelay = 5;
    }
  } else {
    if (toast?.fixed && toast.text === "Vous êtes en zone de radiations") {
      clearToastFixed();
    }
    radiationSoundDelay = 0;
    SFX.stopLoop("radiationLoop", { fadeOut: 0.7 });
  }
  if (radiationSoundDelay > 0) {
    radiationSoundDelay -= dt;
    if (radiationSoundDelay <= 0) {
      radiationSoundDelay = 0;
      if (radiationActive) SFX.loop("radiationLoop", { fadeIn: 0.3 });
    }
  }
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

// ✅ l'état « mort en attente » survit au refresh : si le joueur recharge en
// étant détruit (zone map, lieu de réapparition pas encore choisi), il reste
// mort et on rejoue l'animation + le son d'explosion au rechargement.
function markDeathPending() {
  try {
    sessionStorage.setItem(
      "orbit_death_pending",
      JSON.stringify({
        map: window.__CURRENT_MAP_ID__ || "1-1",
        x: player.x,
        y: player.y,
        ts: Date.now(),
      }),
    );
  } catch {}
}

function clearDeathPending() {
  try { sessionStorage.removeItem("orbit_death_pending"); } catch {}
}

// ✅ une mort en attente sur LA carte courante ? (utilisé au boot pour ne pas
// démarrer en silence : on force un clic DÉPART qui débloque l'audio et laisse
// le son d'explosion se rejouer automatiquement.)
function hasPendingDeath() {
  try {
    const raw = sessionStorage.getItem("orbit_death_pending");
    if (!raw) return false;
    const rec = JSON.parse(raw);
    return String(rec?.map || "") === String(window.__CURRENT_MAP_ID__ || "1-1");
  } catch {
    return false;
  }
}

function tryReplayPendingDeath() {
  try {
    const raw = sessionStorage.getItem("orbit_death_pending");
    if (!raw) return false;
    const rec = JSON.parse(raw);
    const currentMap = window.__CURRENT_MAP_ID__ || "1-1";
    if (String(rec?.map || "") !== currentMap) return false;

    player.dead = true;
    player.hp = 0;
    player.vx = player.vy = 0;
    player.x = clamp(Number(rec.x) || player.x, 80, WORLD.w - 80);
    player.y = clamp(Number(rec.y) || player.y, 80, WORLD.h - 80);
    lastDeathPos.x = player.x;
    lastDeathPos.y = player.y;
    lastDeathPos.map = currentMap;

    // ✅ au boot, les buffers audio ne sont pas encore chargés ET le
// AudioContext est souvent suspendu par la politique d'autoplay (aucun geste
// utilisateur). On joue donc le son de mort :
//  - dès que le préchargement SFX est terminé si le contexte tourne déjà ;
//  - sinon dès le premier geste qui le reprend (statechange → running),
//    uniquement si le joueur est toujours mort (pas encore réapparu).
    let deathSoundPlayed = false;
    const playDeathSound = () => {
      if (deathSoundPlayed || !player.dead) return;
      deathSoundPlayed = true;
      SFX.crossfade("deathPlayer", "deathPlayer2", { crossAt: 0.2 });
    };
    const armOnResume = () => {
      const ctx = SFX.ctx;
      if (!ctx || ctx.state === "running") {
        playDeathSound();
        return;
      }
      if (typeof ctx.addEventListener === "function") {
        const onState = () => {
          if (ctx.state === "running") {
            ctx.removeEventListener("statechange", onState);
            playDeathSound();
          }
        };
        ctx.addEventListener("statechange", onState);
        // garde-fou : au-delà le joueur a forcément réagi (ou réapparu)
        window.setTimeout(() => ctx.removeEventListener("statechange", onState), 20000);
      }
    };
    if (SFX.preloaded) SFX.preloaded.then(armOnResume).catch(armOnResume);
    else armOnResume();
    triggerDeathShake();
    startDeathSequence();
    return true;
  } catch {
    return false;
  }
}

function showRespawnOverlay(show) {
  if (!ui.respawnOverlay) return;
  ui.respawnOverlay.style.display = show ? "grid" : "none";
  if (!show) {
    const veil = document.getElementById("deathVeil");
    if (veil) {
      veil.classList.remove("active");
      veil.classList.add("instant");
    }
    ui.respawnOverlay.classList.remove("fadeIn");
  }
}

// Séquence de mort : son, voile noir progressif (65 % max), puis le menu de
// réapparition apparaît en fondu par-dessus le monde assombri.
function updateShipMoveSound() {
  const moving = started && !player.dead && Math.hypot(player.vx || 0, player.vy || 0) > 5;
  if (moving && !shipMoveSoundActive) {
    shipMoveSoundActive = true;
    SFX.loop("shipMove", { rate: 1, fadeIn: 0, instantFirst: true });
  } else if (!moving && shipMoveSoundActive) {
    shipMoveSoundActive = false;
    SFX.stopLoop("shipMove", { fadeOut: 0.3 });
  }
}

function startDeathSequence() {
  setCenterMsg(false);
  const veil = document.getElementById("deathVeil");
  if (veil) {
    veil.classList.remove("instant");
    veil.classList.add("active");
  }
  setTimeout(() => {
    showRespawnOverlay(true);
    const ov = ui.respawnOverlay;
    if (ov) {
      ov.classList.remove("fadeIn");
      void ov.offsetWidth; // relance l'animation de fondu
      ov.classList.add("fadeIn");
    }
  }, 1800);
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
    { src: "./BACKGROUNDS/STARS_TILE.webp", mode: "tile", alpha: 0.55, parallax: 0.08, blend: "lighter" },
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
  ishPct: document.getElementById("ishPct"),
  ishPrice: document.getElementById("ishPrice"),

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

  petWindow: document.getElementById("petWindow"),
  petSprite: document.getElementById("petSprite"),
  petNameTxt: document.getElementById("petNameTxt"),
  petLevelTxt: document.getElementById("petLevelTxt"),
  petPlayBtn: document.getElementById("petPlayBtn"),
  petModeSelect: document.getElementById("petModeSelect"),
  petHpBar: document.getElementById("petHpBar"),
  petHpTxt: document.getElementById("petHpTxt"),
  petShBar: document.getElementById("petShBar"),
  petShTxt: document.getElementById("petShTxt"),
  petXpBar: document.getElementById("petXpBar"),
  petXpTxt: document.getElementById("petXpTxt"),
  petFuelBar: document.getElementById("petFuelBar"),
  petFuelTxt: document.getElementById("petFuelTxt"),
  petNoPet: document.getElementById("petNoPet"),

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
  btnIsh: document.getElementById("btnIsh"),
  btnRepair: document.getElementById("btnRepair"),
  repairTxt: document.getElementById("repairTxt"),

  centerMsg: document.getElementById("centerMsg"),
  centerTitle: document.getElementById("centerTitle"),
  centerBody: document.getElementById("centerBody"),
  centerHint: document.getElementById("centerHint"),

  startHint: document.getElementById("startHint"),
  loadingOverlay: document.getElementById("loadingOverlay"),
  loadingStatus: document.getElementById("loadingStatus"),
  loadingBar: document.getElementById("loadingFill"),
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

// Bascule du menu du dock rapide (palette), accessible au clavier (TAB par défaut).
let toggleActionDockMenu = null;

function initializeCustomActionBar() {
  const bar = document.getElementById("ammoBar");
  if (!bar || bar.dataset.customized === "1") return;
  bar.dataset.customized = "1";
  const actions = [...bar.querySelectorAll(":scope > .ammoBtn")];
  const palette = document.createElement("div");
  palette.className = "actionPalette";
  palette.hidden = true;
  palette.innerHTML = `<nav><button class="active" data-action-category="ammo">Munitions</button><button data-action-category="rockets">Roquettes</button><button data-action-category="launchers">Lance-roq.</button><button data-action-category="formations">Formations</button><button data-action-category="skills">Compétences</button></nav><div class="actionPaletteItems"></div>`;
  const toggle = document.createElement("button");
  toggle.type = "button"; toggle.className = "actionPaletteToggle"; toggle.textContent = "⌃"; toggle.title = "Configurer la barre rapide";
  const byId = new Map(actions.map((button) => {
    const id = button.dataset.ammo ? `ammo:${button.dataset.ammo}` : `skill:${button.dataset.skill}`;
    button.dataset.actionId = id;
    button.draggable = true;
    // Pastilles d'orbite de tir (sauf salves rapides X6/RCB) : héritées par tous
    // les clones (slots + palette), animées en CSS quand le bouton tire.
    // Tête 5px + traînée dégressive (4, 3, 2px) collée juste derrière.
    if (button.dataset.ammo && button.dataset.ammo !== "x6" && button.dataset.ammo !== "rcb") {
      for (const cls of ["f1", "f2", "f3", "f4"]) {
        const dot = document.createElement("b");
        dot.className = `fireOrbit ${cls}`;
        dot.setAttribute("aria-hidden", "true");
        button.appendChild(dot);
      }
    }
    return [id, button];
  }));
  // ✅ Munitions (dont les nouvelles : RCB, CBO, JOB...) : câblage des
  // ORIGINAUX (les clones des slots/palette redirigent vers eux via .click()).
  for (const button of actions) {
    const key = String(button.dataset.ammo || "").toLowerCase();
    if (!key || button.dataset.ammoWired === "1") continue;
    button.dataset.ammoWired = "1";
    button.addEventListener("click", () => { playDockSelectSound(player.ammo.active !== key); startAttack(key); });
  }
  let saved = [];
  try { saved = JSON.parse(localStorage.getItem(ACTION_BAR_LAYOUT_KEY) || "[]"); } catch {}
  const layout = Array.from({ length: 20 }, (_, index) => saved[index] || null);
  bar.replaceChildren();
  const persist = () => localStorage.setItem(ACTION_BAR_LAYOUT_KEY, JSON.stringify(
    [...bar.querySelectorAll(".actionSlot")].map(slot => slot.querySelector(".ammoBtn, .rocketQuickAction")?.dataset.actionId || null)
  ));
  const slots = document.createElement("div"); slots.className = "actionSlots"; bar.appendChild(slots);
  const formationButtons = DRONE_FORMATIONS.map(formation => {
    const button = document.createElement("button");
    button.className = "ammoBtn formationActionSlot"; button.dataset.actionCategory = "formations";
    button.dataset.actionId = `formation:${formation.id}`; button.draggable = true;
    button.innerHTML = `<img src="${formation.icon}" alt=""><span>${formation.name.replace("Formation ", "")}</span>`;
    button.onclick = () => {
      playDockSelectSound(getActiveDroneFormation(account.user).id !== formation.id);
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
  // Onglet Roquettes de la palette : clic = roquette active (tir via ESPACE).
  const rocketButtons = ROCKET_IDS.map(id => {
    const r = getRocketType(id);
    const button = document.createElement("button");
    button.className = "ammoBtn rocketActionSlot"; button.dataset.actionCategory = "rockets";
    button.dataset.actionId = `rocket:${id}`; button.draggable = true;
    button.title = r?.name || id;
    button.innerHTML = `<img src="${escapeHtml(rocketShopIcon(id) || "")}" alt=""><strong>${escapeHtml(r?.short || id)}</strong><small class="rocketCount">0</small>`;
    const img = button.querySelector("img");
    if (img) img.onerror = () => { img.onerror = null; img.style.display = "none"; };
    button.onclick = () => {
      const rid = String(id).toLowerCase();
      const isLauncher = getRocketType(rid)?.manual === false;
      if (isLauncher) {
        // Sélection seule (fond du bouton USE) : le tir passe par USE (salve).
        // La charge repart de zéro sur changement de munition.
        playDockSelectSound(player.launcherActive !== rid);
        if (player.launcherActive !== rid) {
          launcherReloadT = 0;
          launcherFullT = 0;
          launcherPhase = "reload";
          launcherPhaseT = 0;
        }
        player.launcherActive = rid;
        markProgressDirty();
        renderPalette("launchers");
        updateAmmoUI();
        return;
      }
      playDockSelectSound(String(player.rocketActive || "").toLowerCase() !== String(id).toLowerCase());
      player.rocketActive = id;
      markProgressDirty();
      refreshRocketPaletteCounts();
      updateAmmoUI();
      // Clic = tir immédiat de la sélection (strict : pas de bascule), auto ou pas.
      tryFireRocket({ strict: true });
    };
    button.addEventListener("dragstart", event => { event.dataTransfer.setData("application/x-orbit-action", button.dataset.actionId); event.dataTransfer.effectAllowed = "move"; });
    byId.set(button.dataset.actionId, button);
    return button;
  });

  // Bouton USE lance-roquettes : nœud permanent créé dès l'init pour que les
  // slots le retrouvent après un refresh. Contenu mis à jour à chaque appel.
  // (La création est pure DOM car player n'existe pas encore à l'init.)
  let launcherUseBtn = null;
  function createLauncherUseBtn() {
    if (launcherUseBtn) return launcherUseBtn;
    launcherUseBtn = document.createElement("button");
    launcherUseBtn.type = "button";
    launcherUseBtn.dataset.actionCategory = "launchers";
    launcherUseBtn.dataset.actionId = "skill:launcherUse";
    launcherUseBtn.draggable = true;
    launcherUseBtn.onclick = () => {
      // Salve du type lance-roquettes sélectionné (strict : la sélection).
      markProgressDirty();
      updateAmmoUI();
      tryFireSalvo();
    };
    launcherUseBtn.addEventListener("dragstart", event => { event.dataTransfer.setData("application/x-orbit-action", launcherUseBtn.dataset.actionId); event.dataTransfer.effectAllowed = "move"; });
    byId.set(launcherUseBtn.dataset.actionId, launcherUseBtn);
    // Contenu placeholder pour que les slots clonés ne soient jamais vides
    // (player n'existe pas encore à l'init ; updateLauncherUseBtn complète après).
    launcherUseBtn.className = "rocketQuickAction launcherAutoBtn";
    launcherUseBtn.title = "Utiliser la roquette sélectionnée";
    launcherUseBtn.innerHTML = `<strong>USE</strong><span class="launcherSquares"><span class="lsq">■</span><span class="lsq">■</span><span class="lsq">■</span><span class="lsq">■</span><span class="lsq">■</span></span><small class="launcherStock"><span class="launcherCount">0</span></small>`;
    return launcherUseBtn;
  }
  function updateLauncherUseBtn() {
    const btn = createLauncherUseBtn();
    const activeId = String(player.launcherActive || "eco10").toLowerCase();
    const icon = rocketShopIcon(activeId) || rocketShopIcon("eco10");
    const lit = launcherLitNow();
    btn.className = "rocketQuickAction launcherAutoBtn";
    btn.title = "Utiliser la roquette sélectionnée";
    btn.style.backgroundImage = icon ? `url("${icon}")` : "";
    btn.innerHTML = `<strong>USE</strong><span class="launcherSquares">${[0, 1, 2, 3, 4].map((i) => `<span class="lsq${i < lit ? " lit" : ""}">■</span>`).join("")}</span><small class="launcherStock"><span class="launcherCount">${formatInteger(rocketCount(activeId))}</span></small>`;
    // Marque l'état affiché (le refresh ne retouche que si ça change).
    launcherSquaresShown = lit;
    return btn;
  }
  function getLauncherUseBtn() {
    return updateLauncherUseBtn();
  }
  // Enregistre dès l'init pour que les slots restaurés le retrouvent.
  createLauncherUseBtn();
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
      const draggedElement = document.querySelector(`.actionSlot .ammoBtn[data-action-id="${CSS.escape(actionId)}"].isDragging, .actionSlot .rocketQuickAction[data-action-id="${CSS.escape(actionId)}"].isDragging, .actionSlot .launcherAutoBtn[data-action-id="${CSS.escape(actionId)}"].isDragging`);
      const source = draggedElement?.closest(".actionSlot");
      // Drop sur le même slot : rien à faire.
      if (source && source === slot) return;
      const displaced = slot.querySelector("[data-action-id]");
      if (source) {
        // Déplacement slot -> slot : échange (swap) au lieu de supprimer l'occupant.
        const button = draggedElement;
        if (displaced && displaced !== button) source.appendChild(displaced);
        slot.appendChild(button);
      } else {
        // Copie depuis la palette : remplacement direct en 1 coup.
        const button = original.cloneNode(true);
        button.removeAttribute("id");
        button.dataset.actionId = actionId;
        button.draggable = true;
        button.onclick = () => original.click();
        if (displaced && displaced !== button) displaced.remove();
        slot.appendChild(button);
      }
      persist();
      updateHudKeyHints();
    });
    slots.appendChild(slot);
  });
  // ✅ Nouvelles munitions (RCB, CBO, JOB...) : placées d'office dans les
  // slots vides (anciens layouts sauvegardés + découverte immédiate).
  // L'utilisateur peut toujours les déplacer via la palette (⌃).
  {
    const placedIds = new Set([...bar.querySelectorAll(".actionSlot [data-action-id]")].map((el) => el.dataset.actionId));
    const missingAmmo = actions.filter((button) => button.dataset.ammo && !placedIds.has(`ammo:${button.dataset.ammo}`));
    const emptySlots = [...bar.querySelectorAll(".actionSlot")].filter((slot) => !slot.querySelector("[data-action-id]"));
    missingAmmo.forEach((original, index) => {
      const slot = emptySlots[index];
      if (!slot) return;
      const id = `ammo:${original.dataset.ammo}`;
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
    });
    if (missingAmmo.length && emptySlots.length) persist();
  }
  actions.forEach(button => button.addEventListener("dragstart", event => {
    if (palette.hidden) return event.preventDefault();
    event.dataTransfer.setData("application/x-orbit-action", button.dataset.actionId);
    event.dataTransfer.effectAllowed = "move";
  }));
  bar.addEventListener("dragstart", event => {
    const item = event.target.closest(".actionSlot .ammoBtn, .actionSlot .rocketQuickAction, .actionSlot .launcherAutoBtn");
    if (!item) return;
    if (palette.hidden) return event.preventDefault();
    item.classList.add("isDragging");
    event.dataTransfer.setData("application/x-orbit-action", item.dataset.actionId || "");
    event.dataTransfer.effectAllowed = "move";
  });
  bar.addEventListener("dragend", () => bar.querySelectorAll(".isDragging").forEach(item => item.classList.remove("isDragging")));
  const paletteItems = palette.querySelector(".actionPaletteItems");
  function renderPalette(category) {
    paletteItems.replaceChildren();
    palette.querySelectorAll("[data-action-category]").forEach(button => button.classList.toggle("active", button.dataset.actionCategory === category));
    if (category === "rockets" || category === "launchers") {
      const onlyLaunchers = category === "launchers";
      if (!onlyLaunchers) {
        // Bouton AUTO en tête (avant R-310) : tir automatique dès que possible.
        const autoBtn = document.createElement("button");
        autoBtn.type = "button";
        autoBtn.className = "rocketQuickAction" + (player.rocketAuto ? " active" : "");
        autoBtn.title = "Roquettes automatiques : ON = tir dès que possible";
        autoBtn.innerHTML = `<strong>AUTO</strong><small>${player.rocketAuto ? "ON" : "OFF"}</small>`;
        autoBtn.onclick = () => {
          player.rocketAuto = !player.rocketAuto;
          markProgressDirty();
          saveProgressNow();
          renderPalette("rockets");
          updateAmmoUI();
          if (!player.rocketAuto) {
            showNotification("Roquettes automatiques : OFF", 1.5, "info");
            return;
          }
          const stock = ROCKET_IDS.filter((id) => getRocketType(id)?.manual !== false)
            .reduce((sum, id) => sum + rocketCount(id), 0);
          const tgt = Target.get();
          const missing = !attackActive ? "enclenche l'attaque de base (CTRL)"
            : stock <= 0 ? "achète des roquettes (boutique > Roquettes)"
            : !tgt ? "verrouille une cible (clic sur un NPC)"
            : dist2(player.x, player.y, tgt.x, tgt.y) > playerRange * playerRange ? "rapproche-toi (hors de portée)"
            : "c'est parti";
          showNotification(`Roquettes automatiques : ON — ${missing}`, 3, "info");
        };
        paletteItems.appendChild(autoBtn);
      } else {
        // Onglet lance-roquettes : petit bouton ON/OFF + gros bouton UTILISER
        // (fond = roquette sélectionnée). UTILISER tire la sélection.
        const toggleBtn = document.createElement("button");
        toggleBtn.type = "button";
        toggleBtn.className = "rocketQuickAction launcherAutoToggle" + (player.launcherAuto ? " active" : "");
        toggleBtn.title = "Lance-roquettes automatique";
        toggleBtn.innerHTML = `<strong>AUTO</strong><small>${player.launcherAuto ? "ON" : "OFF"}</small>`;
        toggleBtn.onclick = () => {
          player.launcherAuto = !player.launcherAuto;
          markProgressDirty();
          saveProgressNow();
          renderPalette("launchers");
          updateAmmoUI();
          if (!player.launcherAuto) {
            showNotification("Lance-roquettes auto : OFF", 1.5, "info");
            return;
          }
          // Diagnostic immédiat : dit ce qui manque pour que ça tire.
          const stock = rocketCount(player.launcherActive);
          const tgt = Target.get();
          const missing = !attackActive ? "enclenche l'attaque de base (CTRL)"
            : stock <= 0 ? "achète des roquettes (boutique > Lance-roquettes)"
            : !tgt ? "verrouille une cible (clic sur un NPC)"
            : dist2(player.x, player.y, tgt.x, tgt.y) > playerRange * playerRange ? "rapproche-toi (hors de portée)"
            : "charge du chargeur en cours…";
          showNotification(`Lance-roquettes auto : ON — ${missing}`, 3, "info");
        };
        paletteItems.appendChild(toggleBtn);
        // Bouton USE : nœud permanent (enregistré dans byId dès l'init) pour
        // que les slots le retrouvent après un refresh. Contenu rafraîchi ici.
        paletteItems.appendChild(getLauncherUseBtn());
      }
      rocketButtons
        .filter((button) => (getRocketType(String(button.dataset.actionId || "").slice("rocket:".length))?.manual === false) === onlyLaunchers)
        .forEach(button => {
        const clone = button.cloneNode(true); clone.className = "rocketQuickAction"; clone.draggable = button.draggable;
        clone.title = button.title;
        const selectedId = onlyLaunchers ? player.launcherActive : player.rocketActive;
        clone.classList.toggle("active", button.dataset.actionId === `rocket:${selectedId}`);
        const cloneImg = clone.querySelector("img");
        if (cloneImg) cloneImg.onerror = () => { cloneImg.onerror = null; cloneImg.style.display = "none"; };
        clone.addEventListener("dragstart", event => { event.dataTransfer.setData("application/x-orbit-action", clone.dataset.actionId); });
        clone.onclick = () => button.click(); paletteItems.appendChild(clone);
      });
      refreshRocketPaletteCounts();
      return;
    }
    if (category === "formations") formationButtons.forEach(button => {
      const clone = button.cloneNode(true); clone.className = "formationQuickAction"; clone.draggable = true;
      clone.classList.toggle("active", button.dataset.actionId === `formation:${account?.user?.drones?.activeFormation}`);
      clone.onclick = () => button.click();
      clone.addEventListener("dragstart", event => { event.dataTransfer.setData("application/x-orbit-action", button.dataset.actionId); event.dataTransfer.effectAllowed = "copy"; });
      paletteItems.appendChild(clone);
    });
    else actions.filter(button => category === "ammo" ? !!button.dataset.ammo : !!button.dataset.skill).forEach(button => {
      const clone = button.cloneNode(true); clone.removeAttribute("id"); clone.draggable = true; clone.dataset.actionId = button.dataset.actionId;
      // État actif explicite : cloneNode copiait l'état au moment du rendu, sans
      // resync ensuite (le cache du dock peut encore pointer les clones détachés
      // de la catégorie précédente quand on change vite de catégorie).
      // À l'init player n'existe pas encore (TDZ) : on garde juste le clonage.
      if (button.dataset.ammo) {
        try {
          clone.classList.toggle("active", String(button.dataset.ammo).toLowerCase() === String(player.ammo.active || "x1").toLowerCase());
        } catch {}
      }
      clone.addEventListener("dragstart", event => { event.dataTransfer.setData("application/x-orbit-action", clone.dataset.actionId); });
      clone.onclick = () => button.click(); paletteItems.appendChild(clone);
    });
    // Le DOM du dock a changé : le cache de sync pointe des nœuds détachés.
    // Invalidation synchrone (l'observer MutationObserver ne passe qu'après).
    // À l'init les `let` du cache sont en TDZ : pas grave, cache déjà vide/dirty.
    try { invalidateActionDockCache(); } catch {}
  }
  palette.querySelectorAll("[data-action-category]").forEach(button => button.onclick = () => renderPalette(button.dataset.actionCategory));
  const flipActionPalette = () => {
    palette.hidden = !palette.hidden;
    toggle.classList.toggle("active", !palette.hidden);
    toggle.textContent = palette.hidden ? "⌃" : "⌄";
  };
  toggle.onclick = flipActionPalette;
  toggleActionDockMenu = flipActionPalette;
  document.addEventListener("dragover", event => {
    if (event.dataTransfer?.types?.includes("application/x-orbit-action")) event.preventDefault();
  });
  document.addEventListener("drop", event => {
    const actionId = event.dataTransfer?.getData("application/x-orbit-action");
    if (!actionId || event.target.closest(".actionSlot") || palette.hidden) return;
    bar.querySelector(".actionSlot .ammoBtn.isDragging, .actionSlot .rocketQuickAction.isDragging, .actionSlot .launcherAutoBtn.isDragging")?.remove();
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
  fireRocket: "Space",
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
  toggleDock: "Tab",
};

// Volumes par défaut réglés par le joueur (ne pas remettre à 50).
const DEFAULT_SFX_VOLUMES = Object.freeze({
  pShotX1: 30, pShotX2: 30, pShotX3: 30, pShotX4: 30, pShotX6: 30,
  sfx_shot_roquettes: 30,
  sfx_shot_lance_roquettes: 25, rocketLoad: 25, rocketsLoadStart: 25, rocketsLoaded: 25,
  pShotSab: 30,
  pulseIEM: 20, ishShield: 20,
  deathPlayer: 30, deathPlayer2: 30,
  respawnPlayer: 25,
  radiationLoop: 25,
  repairStart: 20, repairLoop: 20,
  swReady: 20, swJump: 20, swDone: 20, swDeny: 20,
  shipMove: 25,
  npcDeath: 25,
  collect: 30,
  laserHit1: 10, laserHit2: 10, laserHit3: 10,
  selectNew: 15, selectAgain: 15,
  outOfRange: 30,
  escortX1: 5, escortX2: 5, escortX3: 5, escortX4: 5, escortX6: 5, escortSab: 5,
});

const DEFAULT_GAME_SETTINGS = {
  sound: true,
  soundVolume: 5,
  music: true,
  musicVolume: 1,
  background: true,
  stars: true,
  textures: true,
  drones: true,
  autoStart: false,
  shipEffect: true,
  shipSmoke: true,
  moveMarker: true,
  keybinds: { ...DEFAULT_KEYBINDS },
  // Volumes individuels (0..100) et muets par son, persistés comme le reste.
  sfxVolumes: { ...DEFAULT_SFX_VOLUMES },
  sfxMuted: {},
  sfxDefaultsVersion: 1,
};

// Lignes de l'onglet Son : un groupe = une ligne qui règle tous ses sons.
// Tous les noms de SFX_SOUND_NAMES y figurent exactement une fois.
const SFX_ROWS = [
  { id: "laser", label: "Tirs laser", members: ["pShotX1", "pShotX2", "pShotX3", "pShotX4", "pShotX6", "pShotSab"] },
  { id: "escort", label: "Sons des escortes", members: ["escortX1", "escortX2", "escortX3", "escortX4", "escortX6", "escortSab"] },
  { id: "sfx_shot_roquettes", label: "Tir de roquettes", members: ["sfx_shot_roquettes"] },
  { id: "launcher", label: "Lance-roquettes", members: ["sfx_shot_lance_roquettes", "rocketLoad", "rocketsLoadStart", "rocketsLoaded"] },
  { id: "pulseIsh", label: "IEM / ISH", members: ["pulseIEM", "ishShield"] },
  { id: "death", label: "Mort du joueur", members: ["deathPlayer", "deathPlayer2"] },
  { id: "respawnPlayer", label: "Réapparition", members: ["respawnPlayer"] },
  { id: "radiationLoop", label: "Radiation", members: ["radiationLoop"] },
  { id: "repair", label: "Robot réparateur", members: ["repairStart", "repairLoop"] },
  { id: "jumps", label: "Sauts", members: ["swReady", "swJump", "swDone", "swDeny"] },
  { id: "shipMove", label: "Déplacement du vaisseau", members: ["shipMove"] },
  { id: "npcDeath", label: "Mort des NPC", members: ["npcDeath"] },
  { id: "collect", label: "Récolte", members: ["collect"] },
  { id: "hits", label: "Impacts laser", members: ["laserHit1", "laserHit2", "laserHit3"] },
  { id: "range", label: "Portée / Hors de portée", members: ["outOfRange"] },
  { id: "menuSelect", label: "Sélection des menus", members: ["selectNew", "selectAgain"] },
];

function getSfxRow(id) {
  return SFX_ROWS.find((row) => row.id === id) || null;
}

function normalizeSfxVolumes(raw) {
  const normalized = {};
  const source = raw && typeof raw === "object" ? raw : {};
  for (const name of SFX_SOUND_NAMES) {
    normalized[name] = clamp(Math.round(Number(source[name] ?? DEFAULT_SFX_VOLUMES[name] ?? 50) || 0), 0, 100);
  }
  // Migration : avant, le défaut était 100 partout. Si tout est encore à 100,
  // ce sont des valeurs jamais touchées → on part sur les volumes par défaut.
  const hadKeys = SFX_SOUND_NAMES.some((name) => source[name] != null);
  if (hadKeys && SFX_SOUND_NAMES.every((name) => normalized[name] === 100)) {
    for (const name of SFX_SOUND_NAMES) normalized[name] = DEFAULT_SFX_VOLUMES[name] ?? 50;
  }
  return normalized;
}

function normalizeSfxMuted(raw) {
  const normalized = {};
  const source = raw && typeof raw === "object" ? raw : {};
  for (const name of SFX_SOUND_NAMES) {
    if (source[name] === true) normalized[name] = true;
  }
  return normalized;
}

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
      sfxVolumes: normalizeSfxVolumes(parsed?.sfxVolumes),
      sfxMuted: normalizeSfxMuted(parsed?.sfxMuted),
    };
    settings.soundVolume = clamp(Math.round(Number(settings.soundVolume) || 0), 0, 100);
    if (!settings.sound || settings.soundVolume === 0) {
      settings.sound = false;
      settings.soundVolume = 0;
    }
    // Musique d'ambiance par firme : volume volontairement bas (10 par défaut).
    // Les anciens comptes sans réglage héritent de 10, pas de 50.
    if (parsed?.musicVolume == null && parsed?.music == null) {
      settings.music = true;
      settings.musicVolume = 1;
    } else {
      settings.musicVolume = clamp(Math.round(Number(settings.musicVolume ?? 1) || 0), 0, 100);
      settings.music = parsed?.music == null ? settings.musicVolume > 0 : !!settings.music;
      if (settings.musicVolume === 0) settings.music = false;
    }
    // Migration de l'ancien réglage séparé "Sons des escortes" vers la
    // ligne du tableau (clés escortX*). Appliquée une seule fois.
    try {
      const oldVol = parsed?.escortSoundVolume;
      const oldOn = parsed?.escortSound;
      const escortKeys = ["escortX1", "escortX2", "escortX3", "escortX4", "escortX6", "escortSab"];
      const untouched = escortKeys.every((k) => parsed?.sfxVolumes?.[k] == null && parsed?.sfxMuted?.[k] == null);
      if (untouched && (oldVol != null || oldOn != null)) {
        const v = clamp(Math.round(Number(oldVol ?? 50) || 0), 0, 100);
        for (const k of escortKeys) settings.sfxVolumes[k] = v;
        if (oldOn === false || v === 0) {
          settings.sfxMuted ||= {};
          for (const k of escortKeys) settings.sfxMuted[k] = true;
        }
      }
    } catch {}
    delete settings.escortSound;
    delete settings.escortSoundVolume;
    // Migration unique : les volumes par son partent sur les défauts réglés
    // (ni 100, ni les valeurs héritées d'avant). Les réglages futurs sont ensuite conservés.
    if (Number(parsed?.sfxDefaultsVersion || 0) < 1) {
      settings.sfxVolumes = { ...DEFAULT_SFX_VOLUMES };
      settings.sfxMuted = {};
      settings.sfxDefaultsVersion = 1;
      try {
        localStorage.setItem(GAME_SETTINGS_KEY, JSON.stringify(settings));
      } catch {}
    }
    return settings;
  } catch {
    return {
      ...DEFAULT_GAME_SETTINGS,
      keybinds: { ...DEFAULT_KEYBINDS },
      sfxVolumes: normalizeSfxVolumes(),
      sfxMuted: {},
    };
  }
}

const GAME_SETTINGS = loadGameSettings();
// Fenêtre de départ à chaque refresh : le démarrage auto est désactivé
// temporairement (en mémoire seulement, la préférence sauvegardée est conservée).
GAME_SETTINGS.autoStart = false;

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
      ? Math.max(1, Number(GAME_SETTINGS.soundVolume) || DEFAULT_GAME_SETTINGS.soundVolume)
      : 0;
    SFX?.setMasterVolume?.(GAME_SETTINGS.soundVolume / 100);
  }
  saveGameSettings();
  renderSettingsWindow();

  if (key === "sound") {
    try {
      if (typeof updateMusicPlayback === "function") updateMusicPlayback();
    } catch {}
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

  if (key === "moveMarker") {
    showToast(GAME_SETTINGS.moveMarker ? "Marqueur de déplacement affiché" : "Marqueur de déplacement masqué", 1.1);
  }
}

function setSoundVolume(value) {
  GAME_SETTINGS.soundVolume = clamp(Math.round(Number(value) || 0), 0, 100);
  GAME_SETTINGS.sound = GAME_SETTINGS.soundVolume > 0;
  saveGameSettings();
  SFX?.setMasterVolume?.(GAME_SETTINGS.soundVolume / 100);
  renderSettingsWindow();
  // Les sons généraux contrôlent absolument tout, musique incluse.
  try {
    if (typeof updateMusicPlayback === "function") updateMusicPlayback();
  } catch {}
}

// Applique les volumes / muets individuels au moteur audio.
function applySfxSettings() {
  if (!SFX) return;
  for (const name of SFX_SOUND_NAMES) {
    SFX.setSoundVolume?.(name, (GAME_SETTINGS.sfxVolumes?.[name] ?? DEFAULT_SFX_VOLUMES[name] ?? 50) / 100);
    SFX.setSoundMuted?.(name, GAME_SETTINGS.sfxMuted?.[name] === true);
  }
}

function setSfxVolume(rowId, value) {
  const row = getSfxRow(rowId);
  if (!row) return;
  GAME_SETTINGS.sfxVolumes ||= {};
  const volume = clamp(Math.round(Number(value) || 0), 0, 100);
  for (const name of row.members) {
    GAME_SETTINGS.sfxVolumes[name] = volume;
    SFX?.setSoundVolume?.(name, volume / 100);
  }
  saveGameSettings();
  renderSfxRows();
}

function setSfxMuted(rowId, muted) {
  const row = getSfxRow(rowId);
  if (!row) return;
  GAME_SETTINGS.sfxMuted ||= {};
  for (const name of row.members) {
    if (muted) GAME_SETTINGS.sfxMuted[name] = true;
    else delete GAME_SETTINGS.sfxMuted[name];
    SFX?.setSoundMuted?.(name, muted === true);
  }
  saveGameSettings();
  renderSfxRows();
}

function resetSfxVolumes() {
  GAME_SETTINGS.sfxVolumes = { ...DEFAULT_SFX_VOLUMES };
  GAME_SETTINGS.sfxMuted = {};
  GAME_SETTINGS.music = true;
  GAME_SETTINGS.musicVolume = 1;
  saveGameSettings();
  applySfxSettings();
  renderSfxRows();
  renderSettingsWindow();
  updateMusicPlayback();
  showToast("Sons réinitialisés", 1.2);
}

let waitingForBindAction = null;

const KEYBIND_LABELS = {
  portal: "Portail",
  switchConfig: "Changer configuration",
  toggleAttack: "Activer / arrêter le tir",
  fireRocket: "Tirer une roquette",
  respawn: "Réapparition",

  slot1: "Slot 1", slot2: "Slot 2", slot3: "Slot 3", slot4: "Slot 4", slot5: "Slot 5",
  slot6: "Slot 6", slot7: "Slot 7", slot8: "Slot 8", slot9: "Slot 9", slot10: "Slot 10",
  slot11: "Slot 11", slot12: "Slot 12", slot13: "Slot 13", slot14: "Slot 14", slot15: "Slot 15",
  slot16: "Slot 16", slot17: "Slot 17", slot18: "Slot 18", slot19: "Slot 19", slot20: "Slot 20",
  toggleWindows: "Masquer / restaurer les fenêtres",
  toggleDock: "Ouvrir / fermer le menu du dock rapide",
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

// Onglets de la fenêtre paramètres (Visuels / Commandes / Son).
function switchSettingsTab(name) {
  const window_ = document.getElementById("settingsWindow");
  if (!window_) return;
  const valid = ["visual", "controls", "sound"];
  const target = valid.includes(name) ? name : "visual";
  window_.querySelectorAll("[data-settings-tab]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.settingsTab === target);
  });
  window_.querySelectorAll("[data-settings-page]").forEach((page) => {
    page.classList.toggle("active", page.dataset.settingsPage === target);
  });
}

// Construit une ligne (checkbox + slider) par groupe de sons, les unes sous les autres.
function buildSfxRows() {
  const list = document.getElementById("sfxList");
  if (!list || list.dataset.built === "1") return;
  list.dataset.built = "1";
  list.replaceChildren();
  for (const row of SFX_ROWS) {
    const el = document.createElement("label");
    el.className = "sfxRow";
    el.dataset.sfxRow = row.id;

    const mute = document.createElement("input");
    mute.type = "checkbox";
    mute.dataset.sfxMute = row.id;
    mute.title = "Activer / couper ces sons";
    mute.addEventListener("change", () => setSfxMuted(row.id, !mute.checked));

    const title = document.createElement("span");
    title.className = "sfxName";
    title.textContent = row.label;

    const slider = document.createElement("input");
    slider.type = "range";
    slider.min = "0";
    slider.max = "100";
    slider.step = "1";
    slider.className = "settingsVolumeSlider";
    slider.dataset.sfxVolume = row.id;
    slider.setAttribute("aria-label", `Volume ${row.label}`);
    slider.addEventListener("input", () => setSfxVolume(row.id, slider.value));

    const value = document.createElement("output");
    value.className = "settingsVolumeValue";
    value.dataset.sfxValue = row.id;

    el.append(mute, title, slider, value);
    list.appendChild(el);
  }
  renderSfxRows();
}

// Resynchronise les lignes de sons avec les réglages (sans reconstruire).
// Groupe : valeur commune affichée, sinon moyenne + "Mixte".
function renderSfxRows() {
  const list = document.getElementById("sfxList");
  if (!list || list.dataset.built !== "1") return;
  for (const row of SFX_ROWS) {
    const el = list.querySelector(`[data-sfx-row="${CSS.escape(row.id)}"]`);
    if (!el) continue;
    const volumes = row.members.map((name) => GAME_SETTINGS.sfxVolumes?.[name] ?? DEFAULT_SFX_VOLUMES[name] ?? 50);
    const muted = row.members.map((name) => GAME_SETTINGS.sfxMuted?.[name] === true);
    const allMuted = muted.every(Boolean);
    const allEqual = volumes.every((v) => v === volumes[0]);
    const shown = allEqual ? volumes[0] : Math.round(volumes.reduce((a, b) => a + b, 0) / volumes.length);
    const mute = el.querySelector("[data-sfx-mute]");
    const slider = el.querySelector("[data-sfx-volume]");
    const value = el.querySelector("[data-sfx-value]");
    if (mute) mute.checked = !allMuted;
    if (slider) {
      slider.value = String(shown);
      slider.disabled = allMuted;
    }
    if (value) value.textContent = allMuted ? "Coupé" : allEqual ? `${shown} %` : `Mixte ${shown} %`;
    el.classList.toggle("muted", allMuted);
  }
}

// Ligne musique (même style que les sons du jeu, dans sa propre catégorie).
// Les sons généraux contrôlent absolument tout : si coupés, la ligne
// musique s'affiche coupée aussi.
function renderMusicRow() {
  const row = document.querySelector('[data-music-row="ambiance"]');
  const box = document.getElementById("optMusic");
  const slider = document.getElementById("optMusicVolume");
  const value = document.getElementById("optMusicVolumeValue");
  const shown = clamp(Math.round(Number(GAME_SETTINGS.musicVolume ?? 1) || 0), 0, 100);
  const musicMuted = !GAME_SETTINGS.music || shown === 0;
  const generalMuted = !GAME_SETTINGS.sound;
  const effectivelyMuted = musicMuted || generalMuted;
  if (box) box.checked = !musicMuted;
  if (slider) {
    slider.value = String(shown);
    slider.disabled = effectivelyMuted;
  }
  if (value) {
    if (generalMuted && !musicMuted) value.textContent = "Coupé (général)";
    else value.textContent = effectivelyMuted ? "Coupé" : `${shown} %`;
  }
  row?.classList.toggle("muted", effectivelyMuted);
}

function updateHudKeyHints() {
  document.querySelectorAll("#ammoBar .actionSlot").forEach((slot, index) => {
    const action = slot.querySelector(".ammoBtn, .rocketQuickAction");
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
    "Sons généraux : activés",
    "Sons généraux : coupés"
  );
  // Ligne musique (même style que les sons du jeu) : coupée si musique off
  // OU si les sons généraux sont coupés (ils contrôlent absolument tout).
  renderMusicRow();

  const background = document.getElementById("optBackground");
  const stars = document.getElementById("optStars");
  if (background) background.checked = !!GAME_SETTINGS.background;
  if (stars) stars.checked = !!GAME_SETTINGS.stars;

  const volume = document.getElementById("optVolume");
  const volumeValue = document.getElementById("optVolumeValue");
  if (volume) volume.value = String(GAME_SETTINGS.soundVolume);
  if (volumeValue) volumeValue.textContent = `${GAME_SETTINGS.soundVolume} %`;

  renderMusicRow();

  const autoStart = document.getElementById("optAutoStart");
  if (autoStart) autoStart.checked = !!GAME_SETTINGS.autoStart;
  // Démarrage auto neutralisé (fenêtre de départ à chaque refresh) :
  // case décochée et grisée pour ne pas passer pour un bug.
  if (autoStart) autoStart.disabled = true;
  const drones = document.getElementById("optDrones");
  if (drones) drones.checked = !!GAME_SETTINGS.drones;
  const shipEffect = document.getElementById("optShipEffect");
  if (shipEffect) shipEffect.checked = !!GAME_SETTINGS.shipEffect;
  const shipSmoke = document.getElementById("optShipSmoke");
  if (shipSmoke) shipSmoke.checked = !!GAME_SETTINGS.shipSmoke;
  const moveMarker = document.getElementById("optMoveMarker");
  if (moveMarker) moveMarker.checked = !!GAME_SETTINGS.moveMarker;

  renderKeybindRows();
  renderSfxRows();
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
  const musicBtn = document.getElementById("optMusic");
  const musicVolume = document.getElementById("optMusicVolume");
  const bgBtn = document.getElementById("optBackground");
  const starsBtn = document.getElementById("optStars");
  const texBtn = document.getElementById("optTextures");
  const autoStart = document.getElementById("optAutoStart");
  const drones = document.getElementById("optDrones");
  const shipEffect = document.getElementById("optShipEffect");
  const shipSmoke = document.getElementById("optShipSmoke");
  const moveMarker = document.getElementById("optMoveMarker");
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

  musicBtn?.addEventListener("change", () => {
    setMusicEnabled(musicBtn.checked);
  });

  musicVolume?.addEventListener("input", () => {
    setMusicVolume(musicVolume.value);
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

  moveMarker?.addEventListener("change", () => {
    setGameSetting("moveMarker", moveMarker.checked);
  });

  document.querySelectorAll("#settingsWindow .keyBindRow").forEach((btn) => {
  btn.addEventListener("click", () => {
    beginKeyCapture(btn.dataset.bindAction);
  });
});

document.getElementById("btnResetKeybinds")?.addEventListener("click", () => {
  resetKeybinds();
});

document.getElementById("btnResetSfx")?.addEventListener("click", () => {
  resetSfxVolumes();
});

  document.querySelectorAll("#settingsWindow [data-settings-tab]").forEach((btn) => {
    btn.addEventListener("click", () => switchSettingsTab(btn.dataset.settingsTab));
  });
  buildSfxRows();
  switchSettingsTab("visual");

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
  reg("petWindow", "P.E.T", "🤖", false);
  if (["low", "qz"].includes(String(window.__CURRENT_MAP_ID__ || "").toLowerCase())) {
    reg("escortWindow", "Gestion des escortes", "ES", false);
  }
  reg("gygerimStatus", "État du boss", "B", true, { minimizable: false });
wireSettingsWindow();
wirePetWindow();
}

registerHudWindows();

// ============================================================
// ✅ Fenêtre P.E.T en jeu : play/stop, mode passif/combat, barres
// HP / bouclier / XP / fuel (50 000 / 50 000 fixe pour le moment).
// ============================================================
function petShieldMaxForHud(pet, user) {
  const hangar = (user?.hangars || []).find((h) => h?.active) || null;
  const hid = hangar ? String(hangar.id) : null;
  const cfg = String(Number(hangar?.activeConfig) === 2 ? 2 : 1);
  const fit = hid ? getPetFit(pet, hid, cfg) : null;
  const mult = 1 + getPetShieldBonus(getPetLevel(pet?.exp)) / 100;
  let max = 0;
  for (const itemId of fit?.generators || []) {
    const item = itemId ? findCatalogItem(itemId) : null;
    if (item?.module?.type === "shield") max += Number(item.module.bonusShield || 0) * mult;
  }
  return Math.max(0, Math.floor(max));
}

function wirePetWindow() {
  ui.petPlayBtn?.addEventListener("click", () => {
    const pet = account.user?.pet?.owned === true ? account.user.pet : null;
    if (!pet) return showToast("P.E.T non possédé.", 1.5);
    const out = setPetActive(!pet.active);
    if (!out?.ok) return showToast(out?.error || "Impossible.", 1.5);
    loadAccountUser();
    showToast(out.active ? "P.E.T activé" : "P.E.T désactivé", 1.2);
  });
  ui.petModeSelect?.addEventListener("change", () => {
    const out = setPetMode(ui.petModeSelect.value);
    if (!out?.ok) {
      showToast(out?.error || "Impossible.", 1.5);
      return;
    }
    loadAccountUser();
    showToast(out.mode === "combat" ? "P.E.T : mode combat" : "P.E.T : passif", 1.2);
  });
}

function updatePetHud() {
  const pet = account.user?.pet?.owned === true ? account.user.pet : null;
  const has = !!pet;
  if (ui.petNoPet) ui.petNoPet.hidden = has;
  setHudDisabled(ui.petPlayBtn, !has);
  setHudDisabled(ui.petModeSelect, !has);

  const level = has ? getPetLevel(pet.exp) : 0;
  const exp = has ? Math.max(0, Number(pet.exp) || 0) : 0;
  const hpMax = has ? getPetMaxHp(level) : 0;
  const hp = has ? Math.max(0, Math.min(hpMax, Math.floor(Number(pet.hp)))) : 0;
  const shMax = has ? petShieldMaxForHud(pet, account.user) : 0;
  const sh = has
    ? (Number.isFinite(Number(pet.sh)) ? Math.max(0, Math.min(shMax, Math.floor(Number(pet.sh)))) : shMax)
    : 0;
  const next = has ? getPetNextLevelXp(level) : 1;
  const prev = has ? getPetLevelXp(level) : 0;
  // Progression infinie : plus de plafond au niveau 20.
  const xpPct = Math.max(0, Math.min(100, ((exp - prev) / Math.max(1, next - prev)) * 100));

  setHudText(ui.petLevelTxt, `Niveau ${level}`);
  setHudText(ui.petHpTxt, `${formatInteger(hp)} / ${formatInteger(hpMax)}`);
  setHudWidth(ui.petHpBar, `${hpMax > 0 ? (hp / hpMax) * 100 : 0}%`);
  setHudText(ui.petShTxt, `${formatInteger(sh)} / ${formatInteger(shMax)}`);
  setHudWidth(ui.petShBar, `${shMax > 0 ? (sh / shMax) * 100 : 0}%`);
  if (ui.petShBar?.parentElement) setHudDisplay(ui.petShBar.parentElement, shMax > 0 ? "" : "none");
  setHudText(ui.petXpTxt, `${formatInteger(Math.floor(exp))} / ${formatInteger(next)}`);
  setHudWidth(ui.petXpBar, `${xpPct}%`);
  setHudText(ui.petFuelTxt, `${formatInteger(PET_FUEL_MAX)} / ${formatInteger(PET_FUEL_MAX)}`);
  setHudWidth(ui.petFuelBar, "100%");

  if (ui.petPlayBtn) {
    const label = pet?.active === true ? "⏸" : "▶";
    if (ui.petPlayBtn.textContent !== label) ui.petPlayBtn.textContent = label;
    setHudAttr(ui.petPlayBtn, "title", pet?.active === true ? "Désactiver le P.E.T" : "Activer le P.E.T");
    setHudClass(ui.petPlayBtn, "isOn", pet?.active === true);
  }
  if (ui.petModeSelect) {
    const mode = normalizePetMode(pet?.mode);
    if (document.activeElement !== ui.petModeSelect && ui.petModeSelect.value !== mode) {
      ui.petModeSelect.value = mode;
    }
  }
  // Sprite de la fenêtre suit le palier de niveau (sans recharger en boucle).
  const stage = has ? getPetStage(level) : 0;
  if (stage !== lastPetHudStage) {
    lastPetHudStage = stage;
    if (ui.petSprite && stage > 0) {
      setHudAttr(ui.petSprite, "src", `${getPetStageBase(level)}21.png`);
      ui.petSprite.style.background = stage >= 6
        ? 'url("/PET/PET_SPRITES/NIVEAU5/21.png") center / contain no-repeat'
        : "";
    }
  }
}

let lastPetHudStage = 0;

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
    return `<button type="button" data-gg-gate="${escapeHtml(item.id)}" class="${item.id === gate.id ? "active" : ""}">${escapeHtml(item.name)}<small>${parts}/${item.requiredParts}</small></button>`;
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
      .map(([id, amount]) => `${formatInteger(amount)} munitions ${escapeHtml(String(id).toUpperCase())}`);
    const built = Object.entries(reward.builtByGate || {}).filter(([, amount]) => amount > 0).map(([gateId]) => `${escapeHtml(GALAXY_GATE_DEFINITIONS[gateId]?.name || gateId)} terminée`);
    const duplicateCounts = (reward.duplicates || []).reduce((counts, item) => {
      counts[item.gate] = (counts[item.gate] || 0) + 1;
      return counts;
    }, {});
    const duplicates = Object.entries(duplicateCounts).map(([gateId, amount]) => `Doublon (${escapeHtml(GALAXY_GATE_DEFINITIONS[gateId]?.name || gateId)}) +${amount} multiplicateur${amount > 1 ? "s" : ""}`);
    const groupedApplications = Object.values(applications.reduce((groups, applied) => {
      const key = `${applied.rewardType}:${applied.rewardId || ""}:x${applied.multiplier}`;
      if (!groups[key]) groups[key] = { ...applied, amount: 0, count: 0 };
      groups[key].amount += Number(applied.amount) || 0;
      groups[key].count++;
      return groups;
    }, {}));
    const appliedTexts = groupedApplications.map(applied => {
      if (applied.rewardType === "ammo") return `Munitions ${escapeHtml(String(applied.rewardId || "").toUpperCase())} obtenues : ${formatInteger(applied.amount)} x${applied.multiplier}`;
      if (applied.rewardType === "credits") return `Crédits obtenus : ${formatInteger(applied.amount)} x${applied.multiplier}`;
      if (applied.rewardType === "energy") return `Énergies obtenues : ${formatInteger(applied.amount)} x${applied.multiplier}`;
      if (applied.rewardType === "parts") return `Pièces ${escapeHtml(GALAXY_GATE_DEFINITIONS[applied.rewardId]?.name || applied.rewardId)} obtenues : ${formatInteger(applied.amount)} x${applied.multiplier}`;
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
    return `<div class="ggHistoryRow"><span><b>${escapeHtml(gateSetLabel)}</b> · ${Number(entry.spins) || 0} spin(s)</span><div class="ggHistoryGains">${gainRows}</div></div>`;
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
  src: "ASSETS/STANDARD_PORTAL/JUMP.png",
  w: 319,
  h: 319,
  yOff: 0,
  scale: 1,
  spinSpeed: 0,
  alpha: 1,
};

const DEFAULT_PORTAL_JUMP_FX = {
  path: "ASSETS/PORTAL_JUMP/",
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
    src: "ASSETS/PORTAL_JUMP_BUTTON/NOTHING.png",
  },

  mouse: {
    src: "ASSETS/PORTAL_JUMP_BUTTON/POINTED.png",
  },

  click: {
    src: "ASSETS/PORTAL_JUMP_BUTTON/CLICKED.png",
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
  idle: { src: "ASSETS/QUEST_BUTTON/1.png" },
  mouse: { src: "ASSETS/QUEST_BUTTON/2.png" },
  click: { src: "ASSETS/QUEST_BUTTON/3.png" },
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

  // Exemple : ASSETS/PORTAL_JUMP_FX/1.png
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

  if ((player.portalLockT || 0) > 0) {
    SFX.play("swDeny");
    showToast(`Portail bloqué — attends ${Math.ceil(player.portalLockT)} s après ta mort`, 1.4);
    return false;
  }

  const mapId = String(window.__CURRENT_MAP_ID__ || rules?.mapLabel || "").trim().toLowerCase();
  const combatRestrictedMap = /^[123]-4\.1$/.test(mapId) || mapId === "4-4.123" || mapId === "4-5";
  // Battle 4-x : les NPC ne bloquent jamais le saut, seul un joueur qui nous
  // attaque verrouille (pvpAttackT, posé par hurtPlayer avec source.byPlayer).
  const pvpCooldown = Number(player.pvpAttackT) || 0;
  if (combatRestrictedMap && pvpCooldown > 0) {
    SFX.play("swDeny");
    showToast(`Portail verrouillé — attaqué par un joueur, attends ${Math.ceil(pvpCooldown)} s`, 1.4);
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

  // ✅ verrouille le robot réparateur pendant le saut : cooldown à 0
  player.repairJumpLock = true;
  player.repairT = 0;
  player.repairTickT = 0;
  stopRepairSound({ fadeOut: 0 });

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

  // ✅ "Saut possible" puis 500 ms après → "saut en cours"
  SFX.play("swReady");
  window.setTimeout(() => {
    SFX.play("swJump");
  }, 500);

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
  // Filet de sécurité : la sauvegarde périodique ne sert qu'en cas de
  // crash. Le vrai point de sauvegarde, c'est le portail / changement
  // de map / quitter (saveStateImmediate, freeze masqué par le chargement).
  account.saveCd = 15.0;
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
  const moduleBonus = Number(player?.expBonusPct || 0);
  const raw = Number(amount || 0) * Math.max(0, 1 + moduleBonus / 100);
  const result = grantExperience(account.user.stats, Math.max(0, Math.ceil(raw - Number.EPSILON)));
  if (result.gained <= 0) return result;
  for (const drone of account.user.drones?.items || []) {
    const previousLevel = Math.max(1, Number(drone.level) || getDroneLevel(drone.exp));
    drone.exp = Math.max(0, Number(drone.exp) || 0) + result.gained * DRONE_XP_SHARE;
    drone.level = getDroneLevel(drone.exp);
    if (drone.level > previousLevel) queueDroneLevelTransition(drone.id, previousLevel, drone.level);
  }
  // P.E.T / REX officiel : +5 % de l'XP du vaisseau quand il est possédé
  // ET activé (bouton play de la fenêtre P.E.T).
  if (account.user.pet?.owned === true && account.user.pet.active === true) {
    const previousPetLevel = Math.max(0, Number(account.user.pet.level) || getPetLevel(account.user.pet.exp));
    account.user.pet.exp = Math.max(0, Number(account.user.pet.exp) || 0) + result.gained * PET_XP_SHARE;
    account.user.pet.level = getPetLevel(account.user.pet.exp);
    if (account.user.pet.level > previousPetLevel) {
      showToast(`P.E.T niveau ${account.user.pet.level} atteint !`, 2.6);
    }
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
  const moduleBonus = Number(player?.honorBonusPct || 0);
  const raw = Number(amount || 0) * Math.max(0, 1 + moduleBonus / 100);
  const result = grantHonor(account.user.stats, Math.max(0, Math.ceil(raw - Number.EPSILON)));
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
      const AMMO_REWARD_NAMES = { x6: "RSB-75", rcb: "RCB-140", cbo: "CBO-100", job: "JOB-100", rb: "RB-214", pib: "PIB-100", idb: "IDB-125", vb: "VB-142", emaa: "EMAA-20", sbl: "SBL-100", abl: "A-BL", sab: "SAB-50", x2: "MCB-25", x3: "MCB-50", x4: "UCB-100", x1: "LCB-10" };
      const ammoMessages = ammoRewards.map(([type, amount]) => `Vous avez reçu ${formatInteger(amount)} munitions ${AMMO_REWARD_NAMES[type] || String(type).toUpperCase()}`);
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

function sanitizeRocketsForSave() {
  const out = {};
  for (const id of ROCKET_IDS) {
    out[id] = Math.max(0, Math.floor(Number(player.rockets?.[id] || 0)));
  }
  return out;
}

function saveProgressNow() {
  return measureGameTask("saveProgressNow", saveProgressNowMeasured);
}

function saveProgressNowMeasured() {
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
  pet: account.user.pet,
hangarState: !player.dead && started ? {
    id: SESSION_HANGAR_ID || null,
    x: player.x,
    y: player.y,
    mapId: currentMap,
    hpPct: savedHpPct(),
    shPct: savedShPct(),
  } : null,

  // ⚠️ Ne pas sauvegarder ship ici non plus.
  ammo: {
    x1: Infinity,
    x2: player.ammo.x2 || 0,
    x3: player.ammo.x3 || 0,
    x4: player.ammo.x4 || 0,
    sab: player.ammo.sab || 0,
    x6: player.ammo.x6 || 0,
    rcb: player.ammo.rcb || 0,
    cbo: player.ammo.cbo || 0,
    job: player.ammo.job || 0,
    rb: player.ammo.rb || 0,
    pib: player.ammo.pib || 0,
    idb: player.ammo.idb || 0,
    vb: player.ammo.vb || 0,
    emaa: player.ammo.emaa || 0,
    sbl: player.ammo.sbl || 0,
    abl: player.ammo.abl || 0,
  },
  ammoActive: player.ammo.active || "x1",
  rockets: sanitizeRocketsForSave(),
  rocketActive: player.rocketActive || "r310",
  rocketAuto: player.rocketAuto === true,
  launcherActive: player.launcherActive || "eco10",
  launcherAuto: player.launcherAuto === true,
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

function savedHpPct() {
  return player.hpMax > 0 ? clamp(player.hp / player.hpMax, 0, 1) : null;
}

function savedShPct() {
  return player.shMax > 0 ? clamp(player.sh / player.shMax, 0, 1) : null;
}

function savePositionNow() {
  if (!account.user) return;
  if (player.dead || !started) return;
  
  const currentMap = window.__CURRENT_MAP_ID__ || "1-1";
  if (SESSION_HANGAR_ID) {
    saveHangarStateById(SESSION_HANGAR_ID, player.x, player.y, currentMap, savedHpPct(), savedShPct());
  } else {
    saveActiveHangarState(player.x, player.y, currentMap, savedHpPct(), savedShPct());
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
  // Absorption officielle du générateur équipé (max monté), défaut 80 %.
  player.shAbsorb = Number(stats.bonusAbsorb) > 0 ? clamp(Number(stats.bonusAbsorb) / 100, 0, 1) : 0.8;
  // Détail des canons du vaisseau (bonus conditionnels vsMatch au tir).
  player.laserMods = Array.isArray(stats.laserMods) ? stats.laserMods : [];
  // Drones : bonus par canon aussi (overdrive/vs/instable x nombre équipé).
  player.droneLaserMods = Array.isArray(stats.droneLaserMods) ? stats.droneLaserMods : [];
  // OS-L Odysseus : +3 % de critique par canon, +9 % dès 3 montés, dégâts ×2.
  // Formule officielle : min(50 %, 3n + (n≥3 ? 9 : 0)).
  let oslCount = 0;
  for (const m of player.laserMods) if (Number(m?.critPct || 0) > 0) oslCount += 1;
  player.critChance = oslCount > 0 ? Math.max(0.05, Math.min(0.5, (3 * oslCount + (oslCount >= 3 ? 9 : 0)) / 100)) : 0.05;
  player.critMult = oslCount > 0 ? 2.0 : 1.5;

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

  player.laserHitBonusPct = clamp(Number(stats.bonusLaserHitPct || 0), -100, 100);
  player.expBonusPct = Number(stats.bonusExpPct || 0);
  player.honorBonusPct = Number(stats.bonusHonorPct || 0);

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
  // Préfère la sélection persistée (fresh), sinon garde celle en mémoire.
  const rawActive = String(fresh.ammoActive ?? fresh.ammo?.active ?? player.ammo?.active ?? "x1").toLowerCase();
  const active = AMMO[rawActive] ? rawActive : "x1";

  player.ammo = {
    ...player.ammo,
    active,
    x1: Infinity,
    x2: Math.max(0, Number(a.x2 || 0)),
    x3: Math.max(0, Number(a.x3 || 0)),
    x4: Math.max(0, Number(a.x4 || 0)),
    x6: Math.max(0, Number(a.x6 || 0)),
    sab: Math.max(0, Number(a.sab || 0)),
    rcb: Math.max(0, Number(a.rcb || 0)),
    cbo: Math.max(0, Number(a.cbo || 0)),
    job: Math.max(0, Number(a.job || 0)),
    rb: Math.max(0, Number(a.rb || 0)),
    pib: Math.max(0, Number(a.pib || 0)),
    idb: Math.max(0, Number(a.idb || 0)),
    vb: Math.max(0, Number(a.vb || 0)),
    emaa: Math.max(0, Number(a.emaa || 0)),
    sbl: Math.max(0, Number(a.sbl || 0)),
    abl: Math.max(0, Number(a.abl || 0)),
  };

  // ✅ roquettes synchronisées aussi si achat en boutique profil
  const rk = fresh.rockets || {};
  const nextRockets = { ...player.rockets };
  for (const id of ROCKET_IDS) {
    nextRockets[id] = Math.max(0, Math.floor(Number(rk[id] || 0)));
  }
  player.rockets = nextRockets;
  if (ROCKET_TYPES[String(fresh.rocketActive || "").toLowerCase()]) {
    player.rocketActive = String(fresh.rocketActive).toLowerCase();
  }
  player.rocketAuto = fresh.rocketAuto === true;
  player.launcherActive = ROCKET_TYPES[String(fresh.launcherActive || "").toLowerCase()] ? String(fresh.launcherActive).toLowerCase() : "eco10";
  player.launcherAuto = fresh.launcherAuto === true;

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

function setNotificationText(node, value, { goldTerms = [], whiteTerms = [], violetTerms = [] } = {}) {
  const quantityPattern = /(?<![\p{L}\d])[+-]?\d+(?:[ \u00a0\u202f]\d{3})*(?:[.,]\d+)?(?![\p{L}\d])/gu;
  const collectRanges = (terms) => {
    const ranges = [];
    const loweredValue = value.toLocaleLowerCase("fr-FR");
    for (const rawTerm of terms) {
      const term = String(rawTerm || "").trim();
      if (!term) continue;
      const loweredTerm = term.toLocaleLowerCase("fr-FR");
      let start = 0;
      while ((start = loweredValue.indexOf(loweredTerm, start)) >= 0) {
        ranges.push([start, start + term.length]);
        start += term.length;
      }
    }
    return ranges;
  };
  const mergeRanges = (ranges) => {
    ranges.sort((a, b) => a[0] - b[0] || b[1] - a[1]);
    const merged = [];
    for (const range of ranges) {
      const previous = merged.at(-1);
      if (previous && range[0] <= previous[1]) previous[1] = Math.max(previous[1], range[1]);
      else merged.push([...range]);
    }
    return merged;
  };
  const goldRanges = mergeRanges([
    ...[...value.matchAll(quantityPattern)].map(match => [match.index, match.index + match[0].length]),
    ...collectRanges(goldTerms),
  ]);
  const plainRanges = mergeRanges(collectRanges(whiteTerms));
  const violetRanges = mergeRanges(collectRanges(violetTerms));
  const segments = [];
  for (const [start, end] of goldRanges) {
    for (let i = start; i < end; i++) {
      const inViolet = violetRanges.some(([vs, ve]) => i >= vs && i < ve);
      segments.push({ start: i, end: i + 1, cls: inViolet ? "orbitNotificationAmountViolet" : "orbitNotificationAmount" });
    }
  }
  for (const [ps, pe] of plainRanges) {
    for (let i = ps; i < pe; i++) {
      if ((value[i] === "+" || value[i] === "-") && /\d/.test(value[i + 1] || "")) {
        segments.push({ start: i, end: i + 1, cls: "orbitNotificationAmountPlain" });
      } else if (value[i] === "(" || value[i] === ")") {
        segments.push({ start: i, end: i + 1, cls: "orbitNotificationAmountPlain" });
      }
    }
  }
  const violetUncovered = [];
  for (const [vs, ve] of violetRanges) {
    let runStart = -1;
    for (let i = vs; i < ve; i++) {
      const covered = segments.some(segment => segment.start <= i && segment.end > i);
      if (!covered) {
        if (runStart === -1) runStart = i;
      } else if (runStart !== -1) {
        violetUncovered.push([runStart, i]);
        runStart = -1;
      }
    }
    if (runStart !== -1) violetUncovered.push([runStart, ve]);
  }
  for (const [vs, ve] of violetUncovered) {
    segments.push({ start: vs, end: ve, cls: "orbitNotificationAmountViolet" });
  }
  if (!segments.length) {
    node.append(document.createTextNode(value));
    return;
  }
  const bounds = [...new Set(segments.flatMap(segment => [segment.start, segment.end]))].sort((a, b) => a - b);
  let cursor = 0;
  for (let i = 0; i < bounds.length - 1; i++) {
    const start = bounds[i];
    const end = bounds[i + 1];
    if (end <= start) continue;
    const covering = segments.filter(segment => segment.start <= start && segment.end >= end);
    const cls = covering.some(segment => segment.cls === "orbitNotificationAmountPlain")
      ? "orbitNotificationAmountPlain"
      : covering.some(segment => segment.cls === "orbitNotificationAmountViolet")
        ? "orbitNotificationAmountViolet"
        : covering.some(segment => segment.cls === "orbitNotificationAmount")
          ? "orbitNotificationAmount"
          : null;
    if (start > cursor) node.append(document.createTextNode(value.slice(cursor, start)));
    if (cls) {
      const amount = document.createElement("span");
      amount.className = cls;
      amount.textContent = value.slice(start, end);
      node.append(amount);
    } else {
      node.append(document.createTextNode(value.slice(start, end)));
    }
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
  setNotificationText(node, spec.value, { goldTerms: spec.goldTerms, whiteTerms: spec.whiteTerms, violetTerms: spec.violetTerms });
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

function showNotificationGroup(messages, type = "info", { goldTerms = [], whiteTerms = [], violetTerms = [], minVisibleMs = 3800 } = {}) {
  const values = messages.map(message => String(message ?? "").trim()).filter(Boolean);
  if (!values.length) return;
  pendingNotificationGroup = values.map(value => ({
    value,
    type,
    goldTerms,
    whiteTerms,
    violetTerms,
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

function showToastFixed(text, opts = {}) {
  const value = String(text ?? "");
  if (toast?.fixed && toast.text === value) {
    toast.exiting = false;
    if (opts.pulse) toast.pulse = true;
    return;
  }
  toast = { text: value, t: 0, dur: Infinity, fixed: true, alpha: 0, exiting: false, pulse: !!opts.pulse };
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

// Tremblement d'écran déclenché à la mort : fort au début, puis amorti
// très doucement jusqu'au retour à zéro.
let camShake = null; // { t, dur, max }

function triggerDeathShake() {
  camShake = { t: 0, dur: 3.2, max: 110 };
}

function tickCamShake(dt) {
  if (!camShake) return;
  camShake.t += dt;
  if (camShake.t >= camShake.dur) camShake = null;
}

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
applySfxSettings();
// ✅ Mute global sans devoir modifier tous les SFX.play du jeu
const _SFX_PLAY = typeof SFX?.play === "function" ? SFX.play.bind(SFX) : null;

if (_SFX_PLAY) {
  SFX.play = (id, opts = {}) => {
    if (!GAME_SETTINGS.sound) return null;
    return _SFX_PLAY(id, opts);
  };
}

// ============================================================
// Musique d'ambiance par firme : FIRME -> GENERAL -> FIRME ...
// ============================================================
const MUSIC_TRACKS = Object.freeze({
  mmo: "AUDIO/MUSIQUE/MMO.mp3",
  eic: "AUDIO/MUSIQUE/EIC.mp3",
  vru: "AUDIO/MUSIQUE/VRU.mp3",
  general: "AUDIO/MUSIQUE/GENERAL.mp3",
});

const MUSIC_STATE = {
  audio: null,
  playlist: [],
  index: 0,
  faction: null,
  started: false,
};

function getMusicFactionId() {
  try {
    const raw = (account?.user || getCurrentUserFull())?.faction;
    return normalizeFactionId(raw);
  } catch {
    return "mmo";
  }
}

function buildMusicPlaylist(factionId) {
  const faction = normalizeFactionId(factionId);
  const factionTrack = MUSIC_TRACKS[faction] || MUSIC_TRACKS.mmo;
  return [factionTrack, MUSIC_TRACKS.general];
}

function applyMusicVolume() {
  const el = MUSIC_STATE.audio;
  if (!el) return;
  const vol = clamp(Number(GAME_SETTINGS.musicVolume ?? 1) || 0, 0, 100) / 100;
  try {
    el.volume = vol;
  } catch {}
}

function playMusicIndex() {
  const el = MUSIC_STATE.audio;
  if (!el) return;
  const src = MUSIC_STATE.playlist[MUSIC_STATE.index % MUSIC_STATE.playlist.length];
  if (!src) return;
  try {
    if (el.getAttribute("src") !== src) el.src = src;
    applyMusicVolume();
    const attempt = el.play();
    if (attempt && typeof attempt.catch === "function") attempt.catch(() => {});
  } catch {}
}

function refreshMusicPlaylistIfNeeded() {
  const faction = getMusicFactionId();
  if (MUSIC_STATE.faction !== faction) {
    MUSIC_STATE.faction = faction;
    MUSIC_STATE.playlist = buildMusicPlaylist(faction);
    MUSIC_STATE.index = 0;
    return true;
  }
  if (!MUSIC_STATE.playlist.length) {
    MUSIC_STATE.playlist = buildMusicPlaylist(faction);
    MUSIC_STATE.index = 0;
    return true;
  }
  return false;
}

function ensureMusicElement() {
  if (MUSIC_STATE.audio || typeof window === "undefined" || typeof Audio === "undefined") return MUSIC_STATE.audio;
  const el = new Audio();
  el.preload = "auto";
  el.loop = false;
  try {
    el.volume = clamp(Number(GAME_SETTINGS.musicVolume ?? 1) || 0, 0, 100) / 100;
  } catch {}
  el.addEventListener("ended", () => {
    if (!MUSIC_STATE.playlist.length) return;
    MUSIC_STATE.index = (MUSIC_STATE.index + 1) % MUSIC_STATE.playlist.length;
    playMusicIndex();
  });
  el.addEventListener("error", () => {
    // Passe au morceau suivant pour ne jamais rester bloqué en silence.
    window.setTimeout(() => {
      if (!MUSIC_STATE.audio) return;
      MUSIC_STATE.index = (MUSIC_STATE.index + 1) % Math.max(1, MUSIC_STATE.playlist.length);
      if (GAME_SETTINGS.music && GAME_SETTINGS.sound) playMusicIndex();
    }, 1500);
  });
  MUSIC_STATE.audio = el;
  return el;
}

function updateMusicPlayback() {
  const el = ensureMusicElement();
  if (!el) return;
  // La musique ne démarre qu'après le bouton DÉPART, jamais sur un simple clic ailleurs.
  try {
    if (typeof started !== "undefined" && !started) {
      try { el.pause(); } catch {}
      return;
    }
  } catch {}
  const enabled = !!GAME_SETTINGS.music && !!GAME_SETTINGS.sound && (Number(GAME_SETTINGS.musicVolume ?? 0) > 0);
  if (!enabled) {
    try { el.pause(); } catch {}
    return;
  }
  const switched = refreshMusicPlaylistIfNeeded();
  applyMusicVolume();
  try {
    if (el.paused) playMusicIndex();
    else if (switched) playMusicIndex();
  } catch {}
}

function startFactionMusic() {
  MUSIC_STATE.started = true;
  refreshMusicPlaylistIfNeeded();
  updateMusicPlayback();
}

function setMusicEnabled(enabled) {
  GAME_SETTINGS.music = !!enabled;
  if (GAME_SETTINGS.music && Number(GAME_SETTINGS.musicVolume ?? 0) <= 0) {
    GAME_SETTINGS.musicVolume = 1;
  }
  if (!GAME_SETTINGS.music) {
    // On garde le volume pour la réactivation.
  }
  saveGameSettings();
  renderSettingsWindow();
  updateMusicPlayback();
  showToast(GAME_SETTINGS.music ? "Musique activée" : "Musique coupée", 1.1);
}

function setMusicVolume(value) {
  GAME_SETTINGS.musicVolume = clamp(Math.round(Number(value) || 0), 0, 100);
  // Remonter le slider réactive la musique, le mettre à 0 la coupe.
  GAME_SETTINGS.music = GAME_SETTINGS.musicVolume > 0;
  saveGameSettings();
  renderSettingsWindow();
  updateMusicPlayback();
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

// Sprites P.E.T : tous les paliers (Niveau1 → Niveau5 + fusion),
// 32 frames chacun, préchargés au chargement du jeu.
function preloadPetSprites() {
  const jobs = [];
  for (const dir of PET_STAGE_DIRS) {
    for (let frame = 1; frame <= PET_SPRITE_FRAMES; frame++) {
      jobs.push(loadImage(`${dir}${frame}.png`, { priority: false }));
    }
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

// Animations de propulsion attachées aux positions officielles de main.swf.
const shipEngine = new ShipEngine(loadImage);
const npcEngine = new NpcEngine(loadImage);
const petEngine = new PetEngine(loadImage, { drawWidth: 154, drawHeight: 137 });

function getPlayerSpriteFrame() {
  const pack = ACTIVE_SHIP || SHIP_PACKS[0];
  const frames = Math.max(1, Number(pack?.frames) || playerImgs.length || 1);
  return angleToFrameIndex(player.angle + (pack?.angleOffset || 0), frames);
}

function updateShipEngineFx(dt) {
  shipEngine.update(player, ACTIVE_SHIP, dt, GAME_SETTINGS.shipSmoke);
}
function drawShipEngineFx() {
  if (!GAME_SETTINGS.shipSmoke) return;
  const frame = getPlayerSpriteFrame();
  shipEngine.draw(ctx, player, ACTIVE_SHIP, isImgReady, frame);
}

// --- Effet de vaisseau (Ship_effet) superposé par-dessus le vaisseau ---
let shipEffectFor = "";        // id du vaisseau dont l'effet est chargé
let shipEffectPromise = Promise.resolve();
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
  shipEffectPromise = Promise.all(promises).then(() => { shipEffectReady = true; shipEffectLoading = false; });
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
  return getShipPackByIdData(shipId) || null;
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
  path: "COMBAT/RAYGUN/RAYGUN2/",
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
  path: "ASSETS/PULSE/",
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
// ✅ INSTA SHIELD - sprite au-dessus du vaisseau (3 s à la réapparition)
// ============================================================
const INSTA_SHIELD_PACK = {
  path: "ASSETS/INSTANT_SHIELD/",
  frames: 64,
  firstNumber: 1,
  ext: ".png",
  dur: 3.0,
  w: 320,
  h: 320,
};

let instaShieldImgs = [];
let instaShieldReady = false;
let instaShieldT = -1; // -1 = inactif

function ensureInstaShieldLoaded() {
  if (INSTA_SHIELD_PACK._promise) return INSTA_SHIELD_PACK._promise;

  INSTA_SHIELD_PACK._imgs = new Array(INSTA_SHIELD_PACK.frames);

  INSTA_SHIELD_PACK._promise = (async () => {
    const jobs = [];
    for (let i = 0; i < INSTA_SHIELD_PACK.frames; i++) {
      const src = `${INSTA_SHIELD_PACK.path}${INSTA_SHIELD_PACK.firstNumber + i}${INSTA_SHIELD_PACK.ext}`;
      jobs.push(
        loadImage(src, { priority: false })
          .then((img) => (INSTA_SHIELD_PACK._imgs[i] = img))
          .catch(() => (INSTA_SHIELD_PACK._imgs[i] = null))
      );
    }
    await Promise.all(jobs);
    instaShieldImgs = INSTA_SHIELD_PACK._imgs;
    instaShieldReady = true;
  })();

  return INSTA_SHIELD_PACK._promise;
}

// Lance le bouclier + invincibilité de 3 s à la réapparition du joueur.
function startRespawnInstaShield() {
  instaShieldT = 0;
  player.invincibleT = INSTA_SHIELD_PACK.dur;
  ensureInstaShieldLoaded();
}

function tickInstaShield(dt) {
  if (instaShieldT < 0) return;
  instaShieldT += dt;
  if (instaShieldT >= INSTA_SHIELD_PACK.dur) instaShieldT = -1;
}

// Dessiné par-dessus le vaisseau ET toute autre effet de vaisseau.
function drawInstaShield() {
  if (instaShieldT < 0 || !instaShieldReady || !instaShieldImgs?.length) return;

  const frames = INSTA_SHIELD_PACK.frames || instaShieldImgs.length;
  const idx = Math.min(frames - 1, Math.floor((instaShieldT / INSTA_SHIELD_PACK.dur) * frames));
  const img = instaShieldImgs[idx];
  if (!isImgReady(img)) return;

  const w = INSTA_SHIELD_PACK.w;
  const h = INSTA_SHIELD_PACK.h;

ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.globalAlpha = 1;
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
    ctx.restore();
}

// ============================================================
// ✅ REPAIR ORBIT FX - sprite qui tourne autour du vaisseau
// ============================================================
const DEFAULT_REPAIR_ORBIT_SPR = {
path: "ASSETS/REPAIR_ROBOT/",
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
xOff: -65,
yOff: -65,

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
  fx: 1,
  fy: 1,
  x: -65,
  y: -65,
  tx: -65,
  ty: -65,
  rot: 0,
  tRot: 0,
  cornerT: 0,
  prevActive: false,
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
  if (!started || player.dead || player.repairJumpLock) return false;
  if (player.repairT < REPAIR.cooldown) return false;

  const needHp = player.hp < player.hpMax - 0.5;
  const needSh = player.sh < player.shMax - 0.5;

  return needHp || needSh;
}

// Rotation du robot selon son coin (référence) :
// haut gauche = 0°, haut droite = 90° (droite), bas gauche = -90° (gauche), bas droite = 180°.
function repairOrbitCornerRot(fx = repairOrbitFx.fx, fy = repairOrbitFx.fy) {
  if (fx === -1 && fy === 1) return Math.PI / 2;
  if (fx === 1 && fy === -1) return -Math.PI / 2;
  if (fx === -1 && fy === -1) return Math.PI;
  return 0;
}

function tickRepairOrbitFx(dt) {
  const active = isRepairingNow();

  if (active) {
    repairOrbitFx.t += dt;
    repairOrbitFx.alpha = Math.min(1, repairOrbitFx.alpha + dt * 5);

    // Repioche un coin toutes les 1 s (peut être le même ou un autre).
    if (!repairOrbitFx.prevActive || repairOrbitFx.cornerT >= 1) {
      repairOrbitFx.cornerT = 0;
      repairOrbitFx.fx = Math.random() < 0.5 ? -1 : 1;
      repairOrbitFx.fy = Math.random() < 0.5 ? -1 : 1;
      const px = Number(REPAIR_ORBIT_PACK.xOff ?? -45);
      const py = Number(REPAIR_ORBIT_PACK.yOff ?? -45);
      repairOrbitFx.tx = px * repairOrbitFx.fx;
      repairOrbitFx.ty = py * repairOrbitFx.fy;
      repairOrbitFx.tRot = repairOrbitCornerRot(repairOrbitFx.fx, repairOrbitFx.fy);
    }
    repairOrbitFx.cornerT += dt;

    // Lissage vers la cible : mouvement visible, sans cassure.
    const k = 1 - Math.pow(0.0001, dt);
    repairOrbitFx.x += (repairOrbitFx.tx - repairOrbitFx.x) * k;
    repairOrbitFx.y += (repairOrbitFx.ty - repairOrbitFx.y) * k;
    let dRot = repairOrbitFx.tRot - repairOrbitFx.rot;
    dRot = Math.atan2(Math.sin(dRot), Math.cos(dRot));
    repairOrbitFx.rot += dRot * k;
  } else {
    repairOrbitFx.alpha = Math.max(0, repairOrbitFx.alpha - dt * 8);
    repairOrbitFx.cornerT = 0;

    if (repairOrbitFx.alpha <= 0) {
      repairOrbitFx.t = 0;
    }
  }

  repairOrbitFx.prevActive = active;
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

const x = repairOrbitFx.x;
const y = repairOrbitFx.y;

const spinSpeed = Number(pack.spinSpeed ?? 0);

const w = (pack.w || img.naturalWidth || img.width || 96) * (pack.scale || 1);
const h = (pack.h || img.naturalHeight || img.height || 96) * (pack.scale || 1);

ctx.save();
ctx.translate(x, y);

// ✅ rotation selon le coin (lissée) + rotation optionnelle du sprite sur lui-même
ctx.rotate(repairOrbitFx.rot);

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

// ✅ Éclair vert venant uniquement du coin où se trouve le robot, en direction du vaisseau.
function drawRepairBolts() {
  if (repairOrbitFx.alpha <= 0.01) return;

  const pack = REPAIR_ORBIT_PACK;
  const cx = repairOrbitFx.x;
  const cy = repairOrbitFx.y;

  const t = performance.now() / 1000;
  const alpha = repairOrbitFx.alpha * Number(pack.alpha ?? 1);

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = "rgba(80,255,140,0.9)";
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.shadowColor = "rgba(80,255,140,0.95)";
  ctx.shadowBlur = 10;

  const tx = 0;
  const ty = 0;
  const segs = 5;

  ctx.beginPath();
  ctx.moveTo(cx, cy);
  for (let i = 1; i < segs; i++) {
    const f = i / segs;
    const ix = cx + (tx - cx) * f;
    const iy = cy + (ty - cy) * f;
    const jx = (
      Math.sin(t * 46 + i * 9.3 + cx * 0.35) * 0.5 +
      Math.sin(t * 71 + i * 5.1 + cy * 0.29) * 0.5
    ) * 12 * f;
    const jy = (
      Math.cos(t * 42 + i * 7.7 + cy * 0.31) * 0.5 +
      Math.cos(t * 64 + i * 11.3 + cx * 0.27) * 0.5
    ) * 12 * f;
    ctx.lineTo(ix + jx, iy + jy);
  }
  ctx.lineTo(tx, ty);
  ctx.stroke();

  ctx.restore();
}

// ============================================================
// ✅ EXPLOSION FX (sprites)
// ============================================================
const EXPLOSION_PACK = {
  path: "ASSETS/EXPLOSION/",
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
// ✅ SHIP_DAMAGE FX (sprite, 1x par tir reçu)
// ============================================================
const SHIP_DAMAGE_PACK = {
  path: "ASSETS/SHIP_DAMAGE/",
  frames: 9,
  firstNumber: 1,
  ext: ".png",
  fps: 30,
  w: 320,
  h: 320,
  scale: 1,
};

let shipDamageImgs = [];
let shipDamageReady = false;

function ensureShipDamageLoaded() {
  if (SHIP_DAMAGE_PACK._promise) return SHIP_DAMAGE_PACK._promise;

  SHIP_DAMAGE_PACK._imgs = new Array(SHIP_DAMAGE_PACK.frames);

  SHIP_DAMAGE_PACK._promise = (async () => {
    const jobs = [];
    for (let i = 0; i < SHIP_DAMAGE_PACK.frames; i++) {
      const src = `${SHIP_DAMAGE_PACK.path}${SHIP_DAMAGE_PACK.firstNumber + i}${SHIP_DAMAGE_PACK.ext}`;
      jobs.push(
        loadImage(src, { priority: false })
          .then((img) => (SHIP_DAMAGE_PACK._imgs[i] = img))
          .catch(() => (SHIP_DAMAGE_PACK._imgs[i] = null))
      );
    }
    await Promise.all(jobs);

    shipDamageImgs = SHIP_DAMAGE_PACK._imgs;
    shipDamageReady = true;
    return true;
  })();

  return SHIP_DAMAGE_PACK._promise;
}

const shipDamages = [];

// ✅ rayon du rond calculé automatiquement d'après la taille du sprite du
// vaisseau : grande dimension (w ou h) / 6.
function shipDamageBubbleRadius() {
  const pack = ACTIVE_SHIP || SHIP_PACKS[0];
  const w = Number(pack?.w) || 170;
  const h = Number(pack?.h) || 170;
  return Math.max(w, h) / 6;
}

// ✅ le sprite est posé sur la ligne du rond (bord du cercle), à l'angle du
// tir qui arrive, et orienté "face au tir" (vers le NPC qui nous a touchés).
// Il est ancré au vaisseau : pendant l'animation il reste donc toujours
// sur le cercle, même si le joueur continue d'avancer.
function spawnShipDamage(fromX, fromY) {
  if (!shipDamageReady || !shipDamageImgs || !shipDamageImgs.length) return;

  const ang = Math.atan2(fromY - player.y, fromX - player.x);
  const rad = shipDamageBubbleRadius();

  pushBounded(shipDamages, {
    ang,
    rad,
    rot: ang,
    t: 0,
    scale: Number(SHIP_DAMAGE_PACK.scale) || 0.4,
  }, ENTITY_LIMITS.explosions);
}

function tickShipDamages(dt) {
  if (!shipDamages.length) return;

  const fps = SHIP_DAMAGE_PACK.fps || 30;
  const frames = SHIP_DAMAGE_PACK.frames || shipDamageImgs.length || 1;
  const dur = frames / fps;

  for (let i = shipDamages.length - 1; i >= 0; i--) {
    const sd = shipDamages[i];
    sd.t += dt;
    if (sd.t >= dur) shipDamages.splice(i, 1);
  }
}

function drawShipDamages(ox, oy) {
  if (!shipDamageReady || !shipDamageImgs || !shipDamageImgs.length) return;

  const fps = SHIP_DAMAGE_PACK.fps || 30;
  const frames = SHIP_DAMAGE_PACK.frames || shipDamageImgs.length || 1;

  for (const sd of shipDamages) {
    const idx = Math.min(frames - 1, Math.floor(sd.t * fps));
    const img = shipDamageImgs[idx];
    if (!isImgReady(img)) continue;

    // ✅ recalculé à chaque frame sur le cercle AUTOUR DU VAISSEAU :
    // le sprite suit le joueur qui avance au lieu de rester en place.
    const x = player.x + Math.cos(sd.ang) * sd.rad + ox;
    const y = player.y + Math.sin(sd.ang) * sd.rad + oy;

    const w = (SHIP_DAMAGE_PACK.w || (img.naturalWidth || img.width || 128)) * sd.scale;
    const h = (SHIP_DAMAGE_PACK.h || (img.naturalHeight || img.height || 128)) * sd.scale;

    if (x + w / 2 < 0 || y + h / 2 < 0 || x - w / 2 > innerWidth || y - h / 2 > innerHeight) continue;

    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    // ✅ rotation libre sur 360° : le sprite pointe "à droite" (angle 0) par
    // défaut ; on le pivote vers l'angle du tir reçu pour qu'il fasse face.
    ctx.translate(x, y);
    ctx.rotate(sd.rot || 0);
    ctx.globalAlpha = 1;
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
    ctx.restore();
  }
}

// ============================================================
// BASE / PLAYER
// ============================================================
const REPAIR = { cooldown: 6.0, ratePct: 0.05, tickInterval: 1.0 };
let repairSoundActive = false;
let shipMoveSoundActive = false;
let radiationSoundDelay = 0;

const BASE_RUN = {
  range: 700,
  credits: 10000000,
  kills: 0,
  dr: 0,
  shPen: 0.2,
  baseFireRate: 1,
  baseBulletSpeed: 4000,
  // ✅ +1 px/s de vitesse de tir par px de distance à la cible
  bulletSpeedDistGain: 1.0,
  fireRateMult: 1.0,
  laserDmgMult: 1.0,
  accel: 3200,
  friction: 0.86,
  ammo: { active: "x1", x1: Infinity, x2: 2000, x3: 1000, x4: 500, x6: 10, sab: 2000, rcb: 0, cbo: 0, job: 0, rb: 0, pib: 0, idb: 0, vb: 0, emaa: 0, sbl: 0, abl: 0 },
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
  // Attaqué par un JOUEUR (pas un NPC) : seul ce timer verrouille les portails
  // des maps battle 4-x. Les dégâts NPC ne le déclenchent jamais.
  pvpAttackT: 0,
  portalLockT: 0,
  invincibleT: 0,

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
  // ✅ verrou pendant le saut : cooldown maintenu à 0, réarmé à l'arrivée
  repairJumpLock: false,
  // ✅ au refresh : le cooldown repart de 0 (cold start), puis se désarme
  repairColdStart: false,

  baseDamage: 0,
  baseFireRate: 0,
  baseBulletSpeed: 0,

  fireRateMult: 1.0,
  laserDmgMult: 1.0,

  baseSpeed: 0,
  accel: 0,
  friction: 0,

  altShot: false,

  ammo: { active: "x1", x1: Infinity, x2: 0, x3: 0, x4: 0, x6: 0, sab: 0, rcb: 0, cbo: 0, job: 0, rb: 0, pib: 0, idb: 0, vb: 0, emaa: 0, sbl: 0, abl: 0 },

  // Roquettes : stock consommable (lance-roquettes natif au vaisseau).
  // Seule player.rocketActive est tirée ; sélection dans l'onglet Roquettes.
  // rocketAuto = tir automatique dès que possible (bouton AUTO).
  rockets: Object.fromEntries(ROCKET_IDS.map((id) => [id, 0])),
  rocketActive: "r310",
  rocketAuto: false,
  // Lance-roquettes : sélection (fond du bouton USE, défaut eco10) + état auto.
  // Le tir arrive avec la mécanique (états déjà persistés).
  launcherActive: "eco10",
  launcherAuto: false,
};

function getShipPackById(shipId) {
  return getShipPackByIdData(shipId) || SHIP_PACKS[0];
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

  // ✅ Aucun soin au changement de carte/portail/URL : on garde le même
  // pourcentage de vie et de bouclier. Seul le robot réparateur régénère.
  // (Au boot : hpMax=0 → ratio 1 → vie pleine. Après une mort : hp=0 → 1 PV,
  // puis l'override de résurrection applique sa pénalité de 10 %.)
  const oldHpPct = player.hpMax > 0 ? clamp(player.hp / player.hpMax, 0, 1) : 1;
  const oldShPct = player.shMax > 0 ? clamp(player.sh / player.shMax, 0, 1) : 1;

  player.hpMax = Math.max(1, Math.floor(shipBaseHP * (1 + (stats.bonusHPPct || 0) / 100)));
  player.hp = Math.max(1, Math.floor(player.hpMax * oldHpPct));

  player.shMax = Math.max(0, Math.floor(Number(stats.bonusShield) || 0));
  player.sh = Math.max(0, Math.floor(player.shMax * oldShPct));
  player.shAbsorb = Number(stats.bonusAbsorb) > 0 ? clamp(Number(stats.bonusAbsorb) / 100, 0, 1) : 0.8;
  player.laserMods = Array.isArray(stats.laserMods) ? stats.laserMods : [];
  player.droneLaserMods = Array.isArray(stats.droneLaserMods) ? stats.droneLaserMods : [];
  let oslCount = 0;
  for (const m of player.laserMods) if (Number(m?.critPct || 0) > 0) oslCount += 1;
  player.critChance = oslCount > 0 ? Math.max(0.05, Math.min(0.5, (3 * oslCount + (oslCount >= 3 ? 9 : 0)) / 100)) : 0.05;
  player.critMult = oslCount > 0 ? 2.0 : 1.5;

  player.baseDamage = Math.max(1, Math.floor(stats.totalLaserDamage || 1));

  player.laserHitBonusPct = clamp(Number(stats.bonusLaserHitPct || 0), -100, 100);
  player.expBonusPct = Number(stats.bonusExpPct || 0);
  player.honorBonusPct = Number(stats.bonusHonorPct || 0);

  player.baseFireRate = BASE_RUN.baseFireRate;
  player.baseBulletSpeed = BASE_RUN.baseBulletSpeed;
  player.fireRateMult = BASE_RUN.fireRateMult;
  player.laserDmgMult = BASE_RUN.laserDmgMult;

  const shipBaseSpeed = Number(pack?.speed || 0);
  player.baseSpeed = Math.max(10, Math.floor(shipBaseSpeed + (stats.bonusSpeed || 0)));

player.accel = BASE_RUN.accel;
player.friction = BASE_RUN.friction;

  if (!player.repairColdStart) {
    player.repairT = REPAIR.cooldown;
  }
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
  if (player.ammo.active === key) {
    updateAmmoUI();
    return;
  }
  player.ammo.active = key;
  // Persiste la sélection du dock rapide (sinon refresh => retour x1).
  markProgressDirty();
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

// Dernier état des carrés AUTO affiché : le refresh ne les retouche que si
// le stock change (laisse jouer la charge après un changement de munition).
let launcherSquaresShown = -1;

// Rafraîchit les boutons roquettes de la palette et des slots (compte + actif).
function refreshRocketPaletteCounts() {
  // Init du jeu : player n'existe pas encore (déclaré plus bas) → on saute.
  try { void player.rockets; } catch { return; }
  const bar = document.getElementById("ammoBar");
  if (!bar) return;
  const activeStd = `rocket:${String(player.rocketActive || "r310").toLowerCase()}`;
  const activeLauncher = `rocket:${String(player.launcherActive || "eco10").toLowerCase()}`;
  for (const el of bar.querySelectorAll('[data-action-id^="rocket:"]')) {
    const id = String(el.dataset.actionId || "").slice("rocket:".length);
    const count = el.querySelector(".rocketCount");
    if (count) count.textContent = formatInteger(rocketCount(id));
    const isLauncher = getRocketType(id)?.manual === false;
    el.classList.toggle("active", el.dataset.actionId === (isLauncher ? activeLauncher : activeStd));
  }
  // Carrés du bouton USE : chargeur (1/s jusqu'à min(5, stock)).
  // On ne retouche que si ça a changé (laisse la charge jouer entre deux).
  const launcherLit = launcherLitNow();
  if (launcherLit !== launcherSquaresShown) {
    launcherSquaresShown = launcherLit;
    for (const el of bar.querySelectorAll(".launcherAutoBtn")) {
      el.querySelectorAll(".lsq").forEach((sq, i) => {
        sq.classList.toggle("lit", i < launcherLit);
      });
    }
  }
  for (const el of bar.querySelectorAll(".launcherAutoBtn .launcherCount")) {
    el.textContent = formatInteger(rocketCount(player.launcherActive));
  }
  // Fond du bouton USE (palette + slots) : suit la sélection.
  const launcherBgIcon = rocketShopIcon(String(player.launcherActive || "eco10").toLowerCase()) || rocketShopIcon("eco10") || "";
  const launcherBgWant = launcherBgIcon ? `url("${launcherBgIcon}")` : "";
  for (const el of bar.querySelectorAll(".launcherAutoBtn")) {
    if (el.style.backgroundImage !== launcherBgWant) el.style.backgroundImage = launcherBgWant;
  }
  // Petit bouton ON/OFF lance-roquettes.
  for (const el of bar.querySelectorAll(".launcherAutoToggle")) {
    el.classList.toggle("active", !!player.launcherAuto);
    const s = el.querySelector("small");
    if (s) s.textContent = player.launcherAuto ? "ON" : "OFF";
  }
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

  refreshRocketPaletteCounts();

  syncActionDockState();
}

let actionDockCache = null;
let actionDockDirty = true;
let actionDockObserver = null;
const lastDockField = new WeakMap();
// Durée du verrou après un changement de formation (doit rester synchronisée
// avec setCurrentUserDroneFormation dans ACCOUNT.js).
const FORMATION_SWITCH_MS = 2000;

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
  const fresh = { bar, ammo: [], formations: [], skills: [], rockets: [] };
  for (const button of bar.querySelectorAll("[data-ammo]")) {
    fresh.ammo.push({ button, ammo: button.dataset.ammo, small: button.querySelector("small") });
  }
  for (const button of bar.querySelectorAll("[data-action-id^='formation:']")) {
    fresh.formations.push({ button, actionId: button.dataset.actionId });
  }
  for (const button of bar.querySelectorAll("[data-action-id^='rocket:']")) {
    // Standards uniquement : le lance-roquettes est exclu (comme pour l'IEM).
    const rid = String(button.dataset.actionId || "").slice("rocket:".length).toLowerCase();
    if (getRocketType(rid)?.manual === false) continue;
    fresh.rockets.push({ button, rocketId: rid });
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
    // Pastille orbitale blanche pendant le tir (x1-x4, sab, spéciales ; X6/RCB exclus).
    // Suit la munition active : change de slot avec elle, disparaît à l'arrêt.
    const firing = attackActive && !player.dead && ammo === activeAmmo && !isRsbLike(ammo);
    applyDockField(button, "firing", firing,
      (v) => button.classList.toggle("firing", v));
    // X6/RCB : voile de leur cooldown 5 s. Liseré auto-adaptatif en continu
    // comme roquettes/formations ; flash de fin couleur du contour du slot.
    if (isRsbLike(ammo)) {
      const cd = rsbLikeCooldown(ammo);
      const cdMax = ammo === "rcb" ? RCB_COOLDOWN : RSB_COOLDOWN;
      const cooling = cd > 0;
      const progress = cooling ? clamp(cd / cdMax, 0, 1) : 0;
      const wasCooling = button.dataset.x6Cooling === "1";
      if (wasCooling && !cooling) {
        // Fin du voile : animation "prêt" unique (pas de double système).
        button.classList.remove("x6Ready");
        void button.offsetWidth;
        button.classList.add("x6Ready");
        setTimeout(() => button.classList.remove("x6Ready"), 500);
      }
      button.dataset.x6Cooling = cooling ? "1" : "0";
      applyDockField(button, "cdVeil", cooling,
        (v) => button.classList.toggle("cdVeil", v));
      applyDockField(button, "cdProgress", progress.toFixed(3),
        (v) => button.style.setProperty("--cd", v));
      if (cooling) {
        // Liseré brillant seulement si X6 est la munition active : sinon
        // le voile de recharge ressemble à une sélection (double-sélection
        // apparente avec la vraie munition active).
        const edgeColor = ammo === activeAmmo
          ? getComputedStyle(button).borderColor
          : "rgba(120,130,140,.35)";
        applyDockField(button, "cdEdge", edgeColor,
          (v) => button.style.setProperty("--cd-edge", v));
      }
    }
  }

  const activeFormationId = getActiveDroneFormation(account.user).id;
  // Verrou 2 s après un changement de formation (miroir de ACCOUNT.js :
  // setCurrentUserDroneFormation). Pilote le voile + le flash des formations.
  let formationLockLeft = 0;
  try {
    const lastChange = account?.user?.drones?.lastFormationChangeAt || 0;
    formationLockLeft = Math.max(0, FORMATION_SWITCH_MS - (Date.now() - lastChange));
  } catch { formationLockLeft = 0; }
  for (const { button, actionId } of actionDockCache.formations) {
    const selected = actionId === `formation:${activeFormationId}`;
    applyDockField(button, "active", selected,
      (v) => button.classList.toggle("active", v));
    // Pendant le verrou, toutes les formations sont indisponibles :
    // le voile s'affiche sur chaque slot qui contient une formation.
    const cooling = formationLockLeft > 0;
    const progress = cooling ? clamp(formationLockLeft / FORMATION_SWITCH_MS, 0, 1) : 0;
    applyDockField(button, "cdVeil", cooling,
      (v) => button.classList.toggle("cdVeil", v));
    applyDockField(button, "cdProgress", progress.toFixed(3),
      (v) => button.style.setProperty("--cd", v));
    // Liseré auto-adaptatif : suit la bordure du slot en continu (la sélection
    // peut changer : doré sélectionnée, gris les autres).
    if (cooling) {
      applyDockField(button, "cdEdge", getComputedStyle(button).borderColor,
        (v) => button.style.setProperty("--cd-edge", v));
    }
  }

  // Roquettes standard : cooldown partagé, voile sur chaque slot de roquette.
  // (Pas de flash : ~1 s en tir soutenu = trop de clignotement.)
  for (const { button } of actionDockCache.rockets) {
    const cooling = rocketCooldown > 0;
    const progress = cooling ? clamp(rocketCooldown / (rocketCooldownMax || 1), 0, 1) : 0;
    applyDockField(button, "cdVeil", cooling,
      (v) => button.classList.toggle("cdVeil", v));
    applyDockField(button, "cdProgress", progress.toFixed(3),
      (v) => button.style.setProperty("--cd", v));
    // Liseré auto-adaptatif : suit la bordure du slot en continu (la roquette
    // active peut changer en cours de recharge : orange / gris).
    if (cooling) {
      applyDockField(button, "cdEdge", getComputedStyle(button).borderColor,
        (v) => button.style.setProperty("--cd-edge", v));
    }
  }

  for (const { button, skill, small } of actionDockCache.skills) {
    if (skill === "pulse") {
      const progress = pulseCd > 0 ? clamp(pulseCd / PULSE_COOLDOWN, 0, 1) : 0;
      const canUse = canUseSkill(PULSE_COST);
      const cooling = progress > 0;
      // Front descendant du cooldown -> petite lueur "prête" (one-shot).
      const wasCooling = button.dataset.iemCooling === "1";
      if (wasCooling && !cooling && canUse) {
        button.classList.remove("skillReadyPop");
        void button.offsetWidth;
        button.classList.add("skillReadyPop");
        setTimeout(() => button.classList.remove("skillReadyPop"), 750);
      }
      button.dataset.iemCooling = cooling ? "1" : "0";
      applyDockField(button, "feedback", cooling,
        (v) => button.classList.toggle("skillFeedback", v));
      applyDockField(button, "progress", progress.toFixed(3),
        (v) => button.style.setProperty("--skill-feedback", v));
      applyDockField(button, "disabled", !canUse || cooling,
        (v) => button.classList.toggle("disabled", v));
      applyDockField(button, "ready", canUse && !cooling,
        (v) => button.classList.toggle("ready", v));
      // Plus de compteur 0->100% : le voile circulaire montre la progression.
      // On affiche le temps restant pendant la recharge, "PRÊT" une fois dispo.
      applyDockField(button, "main", cooling ? `${pulseCd.toFixed(1)}s` : "PRÊT",
        (v) => { if (small[0]) small[0].textContent = v; });
      applyDockField(button, "cd", cooling ? "" : "30k",
        (v) => { if (small[1]) small[1].textContent = v; });
    } else if (skill === "ish") {
      const ishProgress = ishCd > 0 ? clamp(ishCd / ISH_COOLDOWN, 0, 1) : 0;
      const ishCanUse = canUseSkill(ISH_COST);
      const ishCooling = ishProgress > 0;
      // Front descendant du cooldown -> petite lueur "prête" (one-shot).
      const ishWasCooling = button.dataset.ishCooling === "1";
      if (ishWasCooling && !ishCooling && ishCanUse) {
        button.classList.remove("skillReadyPop");
        void button.offsetWidth;
        button.classList.add("skillReadyPop");
        setTimeout(() => button.classList.remove("skillReadyPop"), 750);
      }
      button.dataset.ishCooling = ishCooling ? "1" : "0";
      applyDockField(button, "feedback", ishCooling,
        (v) => button.classList.toggle("skillFeedback", v));
      applyDockField(button, "progress", ishProgress.toFixed(3),
        (v) => button.style.setProperty("--skill-feedback", v));
      applyDockField(button, "disabled", !ishCanUse || ishCooling,
        (v) => button.classList.toggle("disabled", v));
      applyDockField(button, "ready", ishCanUse && !ishCooling,
        (v) => button.classList.toggle("ready", v));
      // Temps restant pendant la recharge, "PRÊT" une fois dispo.
      applyDockField(button, "main", ishCooling ? `${ishCd.toFixed(1)}s` : "PRÊT",
        (v) => { if (small[0]) small[0].textContent = v; });
      applyDockField(button, "cd", ishCooling ? "" : "30k",
        (v) => { if (small[1]) small[1].textContent = v; });
    } else if (skill === "repair") {
      applyDockField(button, "active", false,
        (v) => button.classList.remove("active"));
      applyDockField(button, "disabled", player.dead,
        (v) => button.classList.toggle("disabled", v));
      applyDockField(button, "text", ui.repairTxt ? ui.repairTxt.textContent : "",
        (v) => { if (small[0]) small[0].textContent = v; });
      // Robot réparateur : même voile que le reste pendant sa recharge (6 s).
      const repairPct = REPAIR.cooldown <= 0 ? 1 : clamp(player.repairT / REPAIR.cooldown, 0, 1);
      const repairCooling = !player.dead && repairPct < 1;
      const repairProgress = repairCooling ? 1 - repairPct : 0;
      const repairReady = !player.dead && !repairCooling;
      if (button.dataset.repairCooling === "1" && repairReady) {
        button.classList.remove("skillReadyPop");
        void button.offsetWidth;
        button.classList.add("skillReadyPop");
        setTimeout(() => button.classList.remove("skillReadyPop"), 750);
      }
      button.dataset.repairCooling = repairCooling ? "1" : "0";
      applyDockField(button, "ready", repairReady,
        (v) => button.classList.toggle("ready", v));
      applyDockField(button, "feedback", repairCooling,
        (v) => button.classList.toggle("skillFeedback", v));
      applyDockField(button, "progress", repairProgress.toFixed(3),
        (v) => button.style.setProperty("--skill-feedback", v));
      applyDockField(button, "cdVeil", false,
        (v) => button.classList.toggle("cdVeil", v));

    }
  }
}

// Son de sélection du dock rapide : nouveau choix vs choix déjà actif.
function playDockSelectSound(isNew) {
  SFX.play(isNew ? "selectNew" : "selectAgain");
}

// (Câblage des munitions : générique sur les originaux, voir
// initializeCustomActionBar — les clones slots/palette suivent.)

// ✅ Munitions spéciales : même câblage que X1-X6 (le dock est générique :
// counts + actif déjà gérés par syncActionDockState pour tout [data-ammo]).
// (Voir initializeCustomActionBar : les originaux sont câblés là-bas,
// les clones des slots/palette redirigent vers eux.)

// ============================================================
// Repair
// ============================================================
function stopRepairSound({ fadeOut = 0 } = {}) {
  if (!repairSoundActive) return;
  repairSoundActive = false;
  SFX.stopLoop("repairLoop", { fadeOut });
}

function resetRepairCooldown() {
  player.repairT = 0;
  player.repairTickT = 0;
  stopRepairSound({ fadeOut: 0 });
}

function tickRepair(dt) {
  if (player.dead) {
    player.repairTickT = 0;
    stopRepairSound({ fadeOut: 0 });
    return;
  }

  // ✅ pendant un saut de portail : cooldown bloqué à 0 (le robot ne peut
  // pas se recharger ni réparer). À l'arrivée (resetRun) il est réarmé
  // immédiatement et relance sa réparation avec le son.
  if (player.repairJumpLock) {
    player.repairT = 0;
    player.repairTickT = 0;
    stopRepairSound({ fadeOut: 0 });
    return;
  }

  const previousRepairT = player.repairT;
  player.repairT = Math.min(REPAIR.cooldown, player.repairT + dt);
  if (player.repairT < REPAIR.cooldown) return;

  // ✅ Démarre le son de réparation dès que le robot est actif et "a besoin".
  // Cas du saut : le cooldown arrive déjà plein (resetPlayerToBase) sans
  // jamais franchir le seuil → on relance le son au réarmement si la boucle
  // n'est pas déjà en cours (repairSoundActive).
  if (!repairSoundActive) {
    const needs = player.hp < player.hpMax - 0.01 || player.sh < player.shMax - 0.01;
    if (needs) {
      SFX.play("repairStart");
      repairSoundActive = true;
      SFX.loop("repairLoop", { fadeIn: 0.25 });
    }
  }

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

  if (player.hp >= player.hpMax - 0.01 && player.sh >= player.shMax - 0.01) {
    stopRepairSound({ fadeOut: 0 });
  }

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
  // Note : le glow "repairing" est piloté dans syncActionDockState (les boutons
  // visibles sont des clones ; ui.btnRepair est détaché après init du dock).
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

    if (isKeybind("fireRocket", e.code)) {
      tryFireRocket();
      return;
    }

    if (isKeybind("toggleWindows", e.code)) {
      window.GameWindowManager?.toggleAll?.();
      return;
    }

    if (isKeybind("toggleDock", e.code)) {
      toggleActionDockMenu?.();
      return;
    }

    for (let slotIndex = 0; slotIndex < 20; slotIndex++) {
      if (!isKeybind(`slot${slotIndex + 1}`, e.code)) continue;
      document.querySelectorAll("#ammoBar .actionSlot")[slotIndex]?.querySelector(".ammoBtn, .rocketQuickAction")?.click();
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
const ESCORT_LOCK_SPR = Object.freeze({ ...LOCK_SPR, src: "ASSETS/UI/LOCK_VERT.png" });
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
  return selectNpcCombatTarget(enemy, player, escortShips, {
    gateMode: rules?.mode === "gate",
    getEscortById,
  });
  /* Ancienne implémentation conservée temporairement pour faciliter la comparaison.
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
  return target; */
}

function initializeGateEscorts() {
  escortShips.length = 0;
  if (typeof clearPendingEscortSalvo === "function") {
    try { clearPendingEscortSalvo(); } catch {}
  }
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
  const isRealPair = !!escort.altShot;
  const shots = isRealPair
    ? [
        { x: muzzleX + px * SIDE_OFFSET, y: muzzleY + py * SIDE_OFFSET, damage: totalDamage * SIDE_DMG_SPLIT },
        { x: muzzleX - px * SIDE_OFFSET, y: muzzleY - py * SIDE_OFFSET, damage: totalDamage * SIDE_DMG_SPLIT },
      ]
    : [{ x: muzzleX, y: muzzleY, damage: totalDamage }];
  playEscortShot(ammoKey);
  const escortLife = bulletLifeForRange(ESCORT_ATTACK_RANGE, speed);
  for (const shot of shots) {
    const dx = target.x - shot.x;
    const dy = target.y - shot.y;
    const length = Math.hypot(dx, dy) || 1;
    addCappedProjectile(bullets, {
      x: shot.x, y: shot.y, vx: dx / length * speed, vy: dy / length * speed, spd: speed,
      r: 6, life: escortLife, dmg: shot.damage,
      key: ammoKey, side: "player", targetId: target.id, homing: true, miss: shotMiss,
      isSab: useSab,
      ownerEscortId: escort.id, volleyId, volleySize: shots.length,
    }, ENTITY_LIMITS.playerBullets);
  }
  // Faux tirs visuels comme le joueur : 6 éclairs par salve, alternance
  // paire / central, aucun dégât, aucun son d'impact.
  const escortSalvoShots = 6;
  const escortSalvoInterval = 0.2;
  const pairItems = [[-SIDE_OFFSET, 0], [SIDE_OFFSET, 0]];
  const singleItems = [[0, 0]];
  for (let i = 1; i < escortSalvoShots; i++) {
    const fakeIsPair = isRealPair ? i % 2 === 0 : i % 2 === 1;
    scheduleEscortSalvoPart(i * escortSalvoInterval, {
      escortId: escort.id,
      targetId: target.id,
      speed,
      life: escortLife,
      volleyId,
      volleySize: shots.length,
      key: ammoKey,
      items: fakeIsPair ? pairItems : singleItems,
    });
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

// ============================================================
// ✅ P.E.T / REX en jeu : libre, suit constamment le joueur (place
// fixe près de lui quand il est immobile), sprite fixe par palier
// (pas d'animation en boucle), taille contenue.
// Passif = suit seulement, ne tire jamais (même attaqué).
// Combat = riposte : attaque le NPC qui nous attaque (tirage
// aléatoire toutes les 1 s si plusieurs) en se mettant à portée,
// sinon attaque seulement si on a nous-même lancé une attaque.
// ============================================================
const petState = { x: 0, y: 0, angle: 0, fireCd: 0, pickCd: 0, target: null, ready: false, returning: false, weaveT: 0, followT: 0, wpX: 0, wpY: 0, hasWp: false, attackers: new Map() };

// Règle générale : au-delà de 400px de nous, il revient vers nous quoi
// qu'il fasse (attaque ou pas), quitte à repartir au combat après.
// À l'arrêt, il s'arrête autour de nous dans un rayon de 300 (sans se
// repositionner s'il est déjà dedans). Il ne bouge que si on bouge.

// Reste dans ce rayon autour du vaisseau (600). Il ne bouge que si on
// bouge : trouve une place et s'arrête quand on s'arrête.

const PET_FOLLOW_RADIUS = 400;
const PET_RETURN_CLEAR = 300;
const PET_REST_RADIUS = 300;
const PET_COMBAT_RADIUS = 300;
// Taille d'affichage : taille réelle des sprites (154×137, sans réduction).
const PET_DRAW_W = 154;
const PET_DRAW_H = 137;
// Retirage de la cible riposte toutes les 1 s si plusieurs attaquants.
const PET_REPICK_DELAY = 1;
// Un attaquant compte seulement s'il nous a infligé des dégâts il y a moins de 6 s
// (pas un simple lock/aggro) : tracé via notePetAttacker sur dégâts réels.
const PET_ATTACKER_MEMORY = 6;
// Téléportation si trop loin (changement de map, respawn...).
const PET_MAX_CHASE_DIST = 3000;

// Enregistre un NPC qui vient RÉELLEMENT de nous infliger des dégâts
// (tir qui touche, kamikaze, explosion au contact). Seule cette trace
// déclenche la riposte du P.E.T — jamais un lock ou une aggro.
function notePetAttacker(enemy) {
  if (!enemy || enemy.hp <= 0 || enemy.id == null) return;
  // Chaque dégât reçu accorde aléatoirement une ou deux salves de riposte.
  const previous = petState.attackers.get(enemy.id);
  petState.attackers.set(enemy.id, {
    ref: enemy,
    t: performance.now() / 1000,
    pending: Math.min(8, (Number(previous?.pending) || 0) + (Math.random() < 0.5 ? 1 : 2)),
  });
  if (petState.attackers.size > 40) {
    petState.attackers.delete(petState.attackers.keys().next().value);
  }
}

// Autorise l'assistance sur cette cible seulement après un dégât confirmé du
// joueur. Un MISS, un lock ou le simple démarrage du tir ne passe pas ici.
function notePetPlayerDamage(enemy) {
  if (!enemy || enemy.id == null) return;
  petState.assistTarget = enemy;
}

function petVolleyDamage(pet, user, target) {
  const hangar = (user?.hangars || []).find((h) => h?.active) || null;
  const hid = hangar ? String(hangar.id) : null;
  const cfg = String(Number(hangar?.activeConfig) === 2 ? 2 : 1);
  const fit = hid ? getPetFit(pet, hid, cfg) : null;
  const level = getPetLevel(pet?.exp);
  const mult = 1 + getPetDamageBonus(level) / 100;
  let base = 0;
  let protoPct = 0;
  const lasers = [];
  const targetType = String(target?.type || "");
  for (const itemId of fit?.lasers || []) {
    const item = itemId ? findCatalogItem(itemId) : null;
    if (item?.module?.type === "laser") {
      const d = Number(item.module.damage || 0);
      base += d;
      lasers.push(itemId);
      // Bonus conditionnels P.E.T (AAP-1 vs Mimesis...).
      if (Array.isArray(item.module.vsMatch) && item.module.vsMatch.some((re) => re?.test?.(targetType))) {
        base += d * (Number(item.module.vsMult || 1) - 1);
      }
    }
  }
  for (const itemId of fit?.protocols || []) {
    const item = itemId ? findCatalogItem(itemId) : null;
    const pct = Number(item?.petProtocol?.pct || 0);
    if (item?.petProtocol && (item.petProtocol.key === "damage" || item.petProtocol.key === "alien") && pct) {
      protoPct += pct;
    }
  }
  return { total: base * mult * (1 + protoPct / 100), count: lasers.length };
}

function firePetVolley(target) {
  const { total, count } = petVolleyDamage(account.user?.pet, account.user, target);
  if (!(total > 0) || !count) return;
  const ammoKey = player.ammo.active || "x1";
  const ammoCfg = AMMO[ammoKey] || AMMO.x1;
const isSab = ammoKey === "sab";
  const angle = Math.atan2(target.y - petState.y, target.x - petState.x);
  const speed = Math.max(900, Number(BASE_RUN.baseBulletSpeed) || 4000);
  const muzzle = 50;
  const muzzleX = petState.x + Math.cos(angle) * muzzle;
  const muzzleY = petState.y + Math.sin(angle) * muzzle;
  const volleyId = volleySeq++;
  const volleyDamage = isSab ? total * SAB50.drainMult : total * (ammoCfg.mult || 1);
  // Les points de tir suivent l'apparence, pas le nombre de lasers équipés.
  // SAB/CBO : UN seul laser central (comme sur le vaisseau), jamais en double.
  const stage = getPetStage(getPetLevel(account.user?.pet?.exp));
  const canFirePair = stage >= 4 && ammoKey !== "sab" && ammoKey !== "cbo";
  const isRealPair = canFirePair && (petState.altShot ?? true);
  const shotOffsets = isRealPair ? [-SIDE_OFFSET, SIDE_OFFSET] : [0];
  const perShot = volleyDamage / shotOffsets.length;
  const life = bulletLifeForRange(playerRange, speed);
  const perp = angle + Math.PI / 2;
  for (const off of shotOffsets) {
    const sx = muzzleX + Math.cos(perp) * off;
    const sy = muzzleY + Math.sin(perp) * off;
    const dx = target.x - sx;
    const dy = target.y - sy;
    const len = Math.hypot(dx, dy) || 1;
    addCappedProjectile(bullets, {
      x: sx, y: sy, vx: dx / len * speed, vy: dy / len * speed, spd: speed,
      r: 6, life, dmg: perShot,
      key: ammoKey, side: "player", targetId: target.id, homing: true,
      isSab,
      miss: Math.random() < PLAYER_SHOTS.missChance,
      ownerEscortId: "pet", volleyId, volleySize: shotOffsets.length,
    }, ENTITY_LIMITS.playerBullets);
  }
  // Comme dans DarkOrbit, les lasers du REX puisent dans la réserve choisie
  // par le joueur. Le X1 reste naturellement illimité.
  consumeAmmo(count);
  playEscortShot(ammoKey);
  const salvoShots = isRsbLike(ammoKey) ? 12 : 6;
  const salvoInterval = isRsbLike(ammoKey) ? 1 / 12 : 0.2;
  for (let i = 1; i < salvoShots; i++) {
    const fakeIsPair = canFirePair && (isRealPair ? i % 2 === 0 : i % 2 === 1);
    const items = fakeIsPair ? [[-SIDE_OFFSET, 0], [SIDE_OFFSET, 0]] : [[0, 0]];
    scheduleEscortSalvoPart(i * salvoInterval, {
      escortId: "pet", targetId: target.id, speed, life, volleyId,
      volleySize: items.length, key: ammoKey, items,
    });
  }
  petState.altShot = !isRealPair;
  const retaliation = petState.attackers.get(target.id);
  if (retaliation?.pending > 0) {
    retaliation.pending -= 1;
    if (retaliation.pending <= 0) petState.attackers.delete(target.id);
  }
  if (petState.outOfRangeTarget === target && petState.outOfRangeShots > 0) {
    petState.outOfRangeShots -= 1;
    if (petState.outOfRangeShots <= 0) {
      petState.outOfRangeTarget = null;
      if (petState.assistTarget === target) petState.assistTarget = null;
    }
  }
}

function updatePet(dt) {
  const pet = account.user?.pet;
  if (!pet?.owned || pet?.active !== true) { petState.ready = false; petState.target = null; return; }
  if (!started || player.dead) return;
  if (!petState.ready) {
    petState.x = player.x - 90;
    petState.y = player.y + 70;
    petState.fireCd = 0;
    petState.pickCd = 0;
    petState.target = null;
    petState.returning = false;
    petState.weaveT = 0;
    petState.vx = 0;
    petState.vy = 0;
    petState.followAngle = player.angle || 0;
    petState.hasWp = false;
    petState.followWait = 0;
    petState.combatTarget = null;
    petState.assistTarget = null;
    petState.outOfRangeTarget = null;
    petState.outOfRangeShots = 0;
    petState.ready = true;
  }

  petState.fireCd = Math.max(0, petState.fireCd - dt);
  petState.pickCd = Math.max(0, petState.pickCd - dt);

  const ownerDistance = Math.hypot(player.x - petState.x, player.y - petState.y);
  const selectedPetTarget = attackActive ? Target.get() : null;
  const continuingAssist = !!selectedPetTarget && petState.assistTarget === selectedPetTarget
    && selectedPetTarget.hp > 0 && enemies.includes(selectedPetTarget);
  const outsidePlayerRange = continuingAssist
    && Math.hypot(selectedPetTarget.x - player.x, selectedPetTarget.y - player.y) > playerRange;
  if (outsidePlayerRange) {
    if (petState.graceTarget !== selectedPetTarget) {
      petState.graceTarget = selectedPetTarget;
      petState.graceRemaining = 3;
    }
    petState.graceRemaining = Math.max(0, petState.graceRemaining - dt);
  } else {
    petState.graceTarget = null;
    petState.graceRemaining = 0;
  }
  const finishingAttack = outsidePlayerRange && petState.graceRemaining > 0;
  const leash = Math.max(750, playerRange * 1.2) + (finishingAttack ? 600 : 0);
  // Inclure le rayon de combat : le cote oppose du NPC reste accessible.
  const ownerLeash = leash + PET_COMBAT_RADIUS;
  if (ownerDistance > ownerLeash && !petState.returning) {
    petState.returning = true;
    petState.assistTarget = null;
    petState.escortX = undefined;
    petState.escortY = undefined;
  } else if (ownerDistance <= PET_REST_RADIUS + 22) {
    petState.returning = false;
  }
  // Ne pas effacer a chaque image les nouveaux degats confirmes pendant le retour.
  let target = null;
  const petCombatMode = normalizePetMode(pet.mode) === "combat";
  if (petCombatMode && !petState.returning) {
    const playerTarget = attackActive ? Target.get() : null;
    const playerTargetDistance = playerTarget
      ? Math.hypot(playerTarget.x - player.x, playerTarget.y - player.y)
      : Infinity;
    const playerTargetInRange = playerTargetDistance <= playerRange;

    // La riposte autonome reste disponible lorsque le joueur ne tire sur
    // personne. Elle autorise aussi immédiatement cette même cible si le joueur
    // l'attaque, sans attendre qu'il lui inflige lui-même un dégât.
    // notePetAttacker n'est jamais appelée sur un simple lock, une tentative
    // d'attaque ou un tir raté.
    const nowS = performance.now() / 1000;
    let lastDamageAt = -Infinity;
    let lastAttacker = null;
    let playerTargetHitUs = false;
    for (const [id, record] of petState.attackers) {
      const valid = record.pending && nowS - record.t <= PET_ATTACKER_MEMORY
        && record.ref?.hp > 0 && enemies.includes(record.ref);
      if (!valid) {
        petState.attackers.delete(id);
      } else {
        if (record.ref === playerTarget) playerTargetHitUs = true;
        if (record.t > lastDamageAt) {
          lastDamageAt = record.t;
          lastAttacker = record.ref;
        }
      }
    }
    if (playerTarget) {
      const assisted = petState.assistTarget === playerTarget;
      const authorized = assisted || playerTargetHitUs;
      if (playerTargetInRange) {
        petState.outOfRangeTarget = null;
        petState.outOfRangeShots = 0;
        if (authorized) target = playerTarget;
      } else if (assisted) {
        if (finishingAttack) target = playerTarget;
      } else if (playerTargetHitUs) {
        // Une agression reçue conserve sa règle séparée : une ou deux salves par impact.
        target = playerTarget;
      }
    } else {
      petState.outOfRangeTarget = null;
      petState.outOfRangeShots = 0;
      target = lastAttacker;
    }
  }
  if (!petCombatMode) petState.assistTarget = null;
  if (target && (!(target.hp > 0) || !enemies.includes(target)
    || Math.hypot(target.x - player.x, target.y - player.y) > leash)) {
    // Sortir de la zone annule aussi l'autorisation obtenue par un ancien
    // dégât : en se rapprochant, le joueur devra réellement toucher à nouveau.
    if (petState.assistTarget === target) petState.assistTarget = null;
    petState.outOfRangeTarget = null;
    petState.outOfRangeShots = 0;
    target = null;
  }
  petState.target = target;
  if (!target) {
    for (let i = pendingEscortSalvo.length - 1; i >= 0; i--) {
      if (pendingEscortSalvo[i].escortId === "pet") pendingEscortSalvo.splice(i, 1);
    }
  }
  if (!target) petState.combatTarget = null;
  const ownerSpeed = Math.max(260, getSpeedBreakdown().total);
  // Close / intermediate / far zones blend continuously into catch-up speed.
  const catchup = clamp((ownerDistance - 220) / 680, 0, 1);
  const followSpeed = ownerSpeed * (1.1 + catchup * 0.65);
  let destX = petState.x, destY = petState.y;
  let wantSpeed = followSpeed;
  const weaving = !!target;
  const combat = target ? petCombatVelocity(petState, target, PET_COMBAT_RADIUS, dt, player) : null;
  const weaveVX = combat?.vx || 0, weaveVY = combat?.vy || 0;
  if (!target || petState.returning) {
    const escort = petEscortTarget(petState, player, dt, petState.returning ? PET_REST_RADIUS * 0.65 : PET_REST_RADIUS);
    destX = clamp(escort.x, 80, WORLD.w - 80);
    destY = clamp(escort.y, 80, WORLD.h - 80);
    wantSpeed = followSpeed;
  }
  const prevX = petState.x;
  const prevY = petState.y;
  if (weaving) {
    const scale = Math.min(1, followSpeed / (Math.hypot(weaveVX, weaveVY) || 1));
    stepPetMotion(petState, weaveVX * scale, weaveVY * scale, dt, WORLD);
  } else {
    const dx = destX - petState.x, dy = destY - petState.y;
    const dist = Math.hypot(dx, dy);
    {
      // Match the owner's motion while correcting separation, then brake at rest.
      const escorting = !target || petState.returning;
      // Zone morte à l'arrivée : évite de dépasser le point puis d'inverser le
      // cap en boucle, ce qui donnait l'impression que le PET glitchait sur place.
      const settled = escorting && dist < 22;
      let vx = settled ? 0 : dx * 3;
      let vy = settled ? 0 : dy * 3;
      const speed = Math.hypot(vx, vy);
      const scale = speed > 0 ? Math.min(1, wantSpeed / speed) : 0;
      stepPetMotion(petState, vx * scale, vy * scale, dt, WORLD);
    }
  }
  if (target) petState.angle = Math.atan2(target.y - petState.y, target.x - petState.x);
  else orientPet(petState, dt);
  // Le REX doit réellement rejoindre sa zone de combat avant de tirer. Cette
  // règle vaut aussi pour une riposte déclenchée par un dégât reçu.
  const inRangeToFire = target
    && Math.hypot(target.x - petState.x, target.y - petState.y) <= PET_COMBAT_RADIUS + 5;

  if (!target || !inRangeToFire || petState.fireCd > 0) return;
  firePetVolley(target);
  petState.fireCd = 1 / Math.max(0.001, player.baseFireRate * player.fireRateMult);
}

const petCombinedFrames = new Map();

function getPetSpriteFrame() {
  return ((angleToFrameIndex(petState.angle, 32) + 16) % 32) + 1;
}

function drawPet(ox, oy) {
  const pet = account.user?.pet;
  if (!pet?.owned || pet?.active !== true) return;
  if (!petState.ready || player.dead || !started) return;
  const x = petState.x + ox;
  const y = petState.y + oy;
  if (x < -160 || y < -160 || x > innerWidth + 160 || y > innerHeight + 160) return;
  const level = getPetLevel(pet.exp);
  // Sprite directionnel d'après sa propre orientation. Comme les drones,
  // les sprites P.E.T sont encodés dans le sens opposé : demi-tour (+16).
  const frame = getPetSpriteFrame();
  const image = getCachedImage(`${getPetStageBase(level)}${frame}.png`);
  // Le dernier palier contient uniquement les pièces à superposer au Niveau5.
  const baseImage = getPetStage(level) >= 6
    ? getCachedImage(`/PET/PET_SPRITES/NIVEAU5/${frame}.png`)
    : null;
  ctx.save();
  ctx.translate(x, y);
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;
  let sprite = image;
  if (baseImage) {
    // Précomposer les deux couches pour ne jamais afficher l'extension seule.
    sprite = petCombinedFrames.get(frame);
    if (!sprite && isImgReady(baseImage) && isImgReady(image)) {
      sprite = document.createElement("canvas");
      sprite.width = PET_DRAW_W;
      sprite.height = PET_DRAW_H;
      const composite = sprite.getContext("2d");
      composite.imageSmoothingEnabled = false;
      composite.drawImage(baseImage, 0, 0, PET_DRAW_W, PET_DRAW_H);
      composite.drawImage(image, 0, 0, PET_DRAW_W, PET_DRAW_H);
      petCombinedFrames.set(frame, sprite);
    }
    if (!sprite) sprite = isImgReady(baseImage) ? baseImage : null;
  }
  if (sprite && (baseImage || isImgReady(sprite))) {
    drawCenteredImage(ctx, sprite, PET_DRAW_W, PET_DRAW_H);
    if (GAME_SETTINGS.shipSmoke) petEngine.draw(ctx, petState, sprite, frame, isImgReady);
  }
  else { ctx.fillStyle = "#79f5ff"; ctx.beginPath(); ctx.arc(0, 0, 20, 0, TAU); ctx.fill(); }
  ctx.restore();
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

function emitEngineTrail(entity, config, dt, ownerNpcId = null, engineKind = "ship", exactFrame = null, spriteImage = null) {
  const speed = Math.hypot(entity.vx || 0, entity.vy || 0);
  if (speed < 35 || !isOnScreenWorld(entity.x, entity.y, 180)) {
    entity._trailAcc = 0;
    return;
  }

  const provider = engineKind === "npc" ? npcEngine : engineKind === "pet" ? petEngine : shipEngine;
  const officialEmitters = engineKind === "pet"
    ? provider.emitters(entity, spriteImage, exactFrame)
    : provider.emitters(entity, config, exactFrame);
  const sprite = config?.sprite || config || {};
  const layout = officialEmitters.length ? {
    resolvedEmitters: officialEmitters.map(point => ({ ...point, calibrated: true })),
    gap: 0,
    trailRear: engineKind === "ship" ? shipEngine.trailRear : 0,
    scale: clamp(Math.min(Number(sprite.w) || 100, Number(sprite.h) || 100) / 150, 0.55, 1.8),
  } : null;
  if (!layout) return;

  const speedRatio = clamp(speed / Math.max(100, Number(entity.speed || config?.speed || 320)), 0, 1);
  entity._trailAcc = (entity._trailAcc || 0) + dt * (10 + speedRatio * 10);

  while (entity._trailAcc >= 1) {
    entity._trailAcc -= 1;
    const angle = engineKind === "ship"
      ? shipEngine.heading(entity, config, exactFrame ?? shipEngine.spriteFrame(entity, config))
      : engineKind === "pet"
        ? petEngine.heading(exactFrame)
        : npcEngine.heading(entity, config, exactFrame ?? npcEngine.spriteFrame(entity, config));
    const fx = Math.cos(angle);
    const fy = Math.sin(angle);
    const px = -fy;
    const py = fx;

    const emitters = layout.resolvedEmitters || Array.from({ length: layout.engines }, (_, i) => ({
      rear: layout.rear,
      side: (layout.engines === 1 ? 0 : (i / (layout.engines - 1) - 0.5) * 2) * layout.spacing,
    }));
    for (const emitter of emitters) {
      const jitter = (Math.random() - 0.5) * 4;
      const rear = emitter.calibrated
        ? (layout.gap || 0) + (layout.trailRear || 0)
        : emitter.rear + (layout.gap || 0) + (layout.trailRear || 0);
      pushBounded(engineTrails, {
        ownerNpcId,
        ownerPet: engineKind === "pet",
        x: entity.x + (emitter.x || 0) - fx * rear + px * ((emitter.side || 0) + jitter),
        y: entity.y + (emitter.y || 0) - fy * rear + py * ((emitter.side || 0) + jitter),
        vx: (entity.vx || 0) * 0.12 - fx * (25 + Math.random() * 30) + px * jitter,
        vy: (entity.vy || 0) * 0.12 - fy * (25 + Math.random() * 30) + py * jitter,
        t: 0,
        life: 0.3 + Math.random() * 0.2,
        size: (2.7 + Math.random() * 1.8) * layout.scale,
        rotation: angle + Math.PI + (Math.random() - 0.5) * 0.5,
        spin: (Math.random() - 0.5) * 1.1,
        stretch: 1.35 + Math.random() * 0.75,
        drift: (Math.random() - 0.5) * 18,
        smokeVariant: Math.floor(Math.random() * 6),
      }, ENTITY_LIMITS.engineTrails);
    }
  }
}

function tickEngineTrails(dt) {
  const shipFrame = getPlayerSpriteFrame();
  if (!player.dead && GAME_SETTINGS.shipSmoke) emitEngineTrail(player, ACTIVE_SHIP, dt, null, "ship", shipFrame);

  const pet = account.user?.pet;
  petEngine.update(petState, dt, GAME_SETTINGS.shipSmoke && pet?.owned && pet?.active === true && petState.ready && !player.dead);
  if (GAME_SETTINGS.shipSmoke && pet?.owned && pet?.active === true && petState.ready && !player.dead) {
    const petFrame = getPetSpriteFrame();
    const petSprite = getCachedImage(`${getPetStageBase(getPetLevel(pet.exp))}${petFrame}.png`);
    emitEngineTrail(petState, { sprite: { w: PET_DRAW_W, h: PET_DRAW_H }, speed: 320 }, dt, null, "pet", petFrame, petSprite);
  }

  const lockedNpc = Target.get();
  if (GAME_SETTINGS.shipSmoke) {
    for (const enemy of enemies) {
      if (enemy?.hp <= 0) continue;
      npcEngine.update(enemy, dt, true);
      if (!shouldDetectNpc(player, enemy, NPC_SENSOR_RANGES.visibility, lockedNpc)) {
        enemy._trailAcc = 0;
        continue;
      }
      const enemyConfig = NPC_TYPES[enemy.type];
      const enemyFrame = enemyConfig?.sprite ? getEnemySpriteFrame(enemy, enemyConfig, enemyConfig.sprite) : 0;
      emitEngineTrail(enemy, enemyConfig, dt, enemy.id, "npc", enemyFrame);
    }
  } else {
    for (const enemy of enemies) if (enemy) {
      enemy._trailAcc = 0;
      npcEngine.update(enemy, dt, false);
    }
  }

  updateEngineTrailParticles(engineTrails, dt, (particle) => {
    if (particle.ownerNpcId != null) {
      const owner = getEnemyById(particle.ownerNpcId);
      if (!owner || owner.hp <= 0 || !shouldDetectNpc(player, owner, NPC_SENSOR_RANGES.visibility, lockedNpc)) {
        return true;
      }
    }
    if (particle.ownerPet && (!account.user?.pet?.active || !petState.ready || player.dead)) return true;
    return false;
  });
}

function drawEngineTrails(ox, oy) {
  drawEngineTrailParticles(ctx, engineTrails, ox, oy, innerWidth, innerHeight);
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
const rocketEffectVolleysShown = new Set();

// Empêche d'afficher "0" deux fois pour le double tir SAB quand la cible n'a plus de bouclier.
const sabZeroShown = new Set();

function showSabZeroOnce(b, t) {
  const key = b.volleyId ?? `solo_${Math.random()}`;
  if (sabZeroShown.has(key)) return;
  sabZeroShown.add(key);
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

function showPlayerMissOnce(b, t) {
  const key = b.volleyId ?? `solo_${Math.random()}`;

  if (playerMissVolleysShown.has(key)) return;

  playerMissVolleysShown.add(key);

  addMissText(
    t.x + (Math.random() - 0.5) * 50,
    t.y - 85 - Math.random() * 20
  );
}

function showRocketEffectHitOnce(b, t) {
  if (!b?.rocketEffect || (!b.rocketEffect.slowPct && !b.rocketEffect.accuracyPenaltyPct && !b.rocketEffect.freezeSec)) return;
  const key = b.volleyId ?? `solo_${Math.random()}`;
  if (rocketEffectVolleysShown.has(key)) return;
  rocketEffectVolleysShown.add(key);
  const isFrozen = (b.rocketEffect.freezeSec || 0) > 0;
  const isSlow = b.rocketEffect.slowPct > 0;
  addFloatText(t.x, t.y - 92, 0, isFrozen ? "rgba(150,230,255,0.98)" : isSlow ? "rgba(80,220,255,0.98)" : "rgba(205,120,255,0.98)", {
    text: isFrozen ? "GELÉ" : "TOUCHÉ", size: 18, pop: 0.35, shake: 0.35, life: 1, glow: 1.2, weight: 900, impact: true,
  });
}

function cleanupPlayerMissVolley(b) {
  if (!b || b.volleyId == null) return;

  const stillExists = bullets.some(x => x && x.volleyId === b.volleyId);
  if (!stillExists) {
    playerMissVolleysShown.delete(b.volleyId);
    sabZeroShown.delete(b.volleyId);
    rocketEffectVolleysShown.delete(b.volleyId);
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

function collectableAllowedOnCurrentMap(cfg, mapId = currentMapId()) {
  const cur = String(mapId);

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

function preloadCollectables(mapId = currentMapId()) {
  const jobs = [];
  for (const [type, cfg] of Object.entries(COLLECTABLE_DEFS)) {
    if (!cfg || cfg.enabled === false || !collectableAllowedOnCurrentMap(cfg, mapId)) continue;
    jobs.push(ensureCollectableLoaded(type));
  }
  return jobs;
}


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
        SFX.play("collect", { cut: true, maxVoices: 3 });
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
      SFX.play("collect", { cut: true, maxVoices: 3 });
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
  const factoryEntity = spawnNpcEntity({
    id: newId(),
    type,
    x,
    y,
    config: NPC_TYPES[type],
    wave,
  }, {
    bullet: src => { if (src) getCachedImage(src); },
    preview: ensureNpcPreview,
    frames: ensureNpcLoaded,
  });
  if (!factoryEntity) return null;
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

    // ✅ changement de cible → cooldown de tir remis à zéro (tir immédiat)
    if (next !== cur && typeof fireCooldown !== "undefined") {
      fireCooldown = 0;
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
// ✅ Munitions spéciales du joueur (officielles) : résolution du
// multiplicateur au moment du tir. Lecture seule du type de cible.
const idbRamp = { mult: 1, lastUse: 0 };

function resolveAmmoMult(ammoKey, target) {
  const cfg = AMMO[ammoKey] || AMMO.x1;
  const base = Number(cfg.mult || 1);
  // IDB-125 : +1,25 par tir réussi jusqu'à ×6, reset après 3 s sans tirer.
  if (ammoKey === "idb") {
    const now = Date.now();
    const resetMs = Number(cfg.rampResetMs || 3000);
    if (now - idbRamp.lastUse > resetMs) idbRamp.mult = 1;
    const current = Math.min(Number(cfg.rampMax || 6), Math.max(1, Number(idbRamp.mult || 1)));
    idbRamp.mult = Math.min(Number(cfg.rampMax || 6), current + Number(cfg.rampStep || 1.25));
    idbRamp.lastUse = now;
    return current;
  }
  const targetType = String(target?.type || "");
  // JOB-100 : ×3,5 aliens, ×2 joueurs.
  if (ammoKey === "job") return targetType.startsWith("npc_") ? Number(cfg.vsNpcMult || 3.5) : base;
  // Bonus conditionnels (RB/Demaners, SBL/Sibelons, VB/Styxus-Charopos,
  // EMAA/Mimesis, A-BL/Invoke-Mindfire).
  if (Array.isArray(cfg.vsMatch) && cfg.vsMatch.some((re) => re.test(targetType))) {
    return Number(cfg.vsMult || base);
  }
  return base;
}

// Bonus conditionnels des CANONS (AA-1 vs Mimesis, PR-L vs Blacklight...) :
// s'ajoutent à la puissance de base, par canon monté.
// 1 laser = +bonus, 2 lasers = +2x bonus, 35 lasers = 35x bonus.
// Vaisseau + drones cumulés (P.E.T = dégâts propres, exclus).
function laserFitVsExtra(laserMods, target, droneLaserMods = null) {
  const targetType = String(target?.type || "");
  let extra = 0;
  for (const m of laserMods || []) {
    const d = Number(m?.damage || 0);
    if (!(d > 0)) continue;
    if (Array.isArray(m?.vsMatch) && m.vsMatch.some((re) => re?.test?.(targetType))) {
      extra += d * (Number(m?.vsMult || 1) - 1);
    }
  }
  for (const m of droneLaserMods || []) {
    const d = Number(m?.damage || 0);
    if (!(d > 0)) continue;
    if (Array.isArray(m?.vsMatch) && m.vsMatch.some((re) => re?.test?.(targetType))) {
      extra += d * (Number(m?.vsMult || 1) - 1);
    }
  }
  return extra;
}

// Overdrive par canon : 1x PR-L = +200, 2x = +400, 35x = +7000.
// Tous les 5 tirs (volleyCount % 5 === 0), vaisseau + drones cumulés.
function laserFitOverdrive(laserMods, droneLaserMods, volleyCount) {
  if (Number(volleyCount || 0) % 5 !== 0) return 0;
  let overdrive = 0;
  for (const m of laserMods || []) overdrive += Number(m?.overdrive || 0);
  for (const m of droneLaserMods || []) overdrive += Number(m?.overdrive || 0);
  return overdrive;
}

// U-LF4 instable : 128-220 aléatoires par canon, vaisseau + drones.
// Retourne le delta à ajouter à laserBase (déjà = baseDamage total).
function laserFitUnstableDelta(laserMods, droneLaserMods) {
  let delta = 0;
  for (const m of laserMods || []) {
    const d = Number(m?.damage || 0);
    if (m?.unstable && d > 0) delta += (128 + Math.random() * 92) - d;
  }
  for (const m of droneLaserMods || []) {
    const d = Number(m?.damage || 0);
    if (m?.unstable && d > 0) {
      const baseDmg = Number(m?.baseDamage || 174);
      const mult = Number(m?.mult || 1) || 1;
      delta += (128 + Math.random() * 92) * mult - d;
      void baseDmg;
    }
  }
  return delta;
}

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

function drainShieldFromEnemy(e, amount, recipient = player, transferPct) {
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
  e._damagedByPlayer = true;
  if (e._cubikonDeathFlee) e.noRewards = false;
  e._healthRevealed = true;
  triggerBossEncounterPhase(e, stolen);

  // ✅ Transfert vers ton vaisseau, sans dépasser ton shield max.
  const gain = stolen * (Number(transferPct) >= 0 ? Number(transferPct) : SAB50.transferPct);
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

      e._pendingSpawn = 20;

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
function damageEnemy(e, dmg, shieldPenetration, crit) {
  if (!e || e.hp <= 0) return { total: 0, sh: 0, hp: 0, bypass: 0, isCrit: false, rawDamage: 0 };
  if (e._bossEncounter?.invulnerable) return emptyEnemyDamageResult();

  const result = damageEnemyLayers(e, dmg, {
    shieldPenetration: shieldPenetration ?? player.shPen,
    critChance: crit?.chance ?? undefined,
    critMultiplier: crit?.mult ?? undefined,
  });
  if (result.total > 0) {
    e._damagedByPlayer = true;
    if (e._cubikonDeathFlee) e.noRewards = false;
  }
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
e._pendingSpawn = 20;

  e.spritePlay = false;
  e.spriteDir = 1;
  e.spriteIdx = 0;
  e.spriteAcc = 0;

  e.angle = 0;
}
  }

  return result;
}

function applyRocketHit(e, b, recipient = player) {
  if (!e || e.hp <= 0 || e._bossEncounter?.invulnerable) return emptyEnemyDamageResult();
  const effect = b.rocketEffect || null;
  const direct = b.dmg > 0 ? damageEnemy(e, b.dmg, effect?.pierceShield ? 1 : effect?.piercePct) : emptyEnemyDamageResult();
  const drained = effect?.shieldDrain > 0 && e.hp > 0
    ? drainShieldFromEnemy(e, effect.shieldDrain, recipient, effect?.leechPct)
    : emptyEnemyDamageResult();

  if (effect?.slowPct > 0) {
    e.rocketSlowPct = Math.max(Number(e.rocketSlowPct || 0), Number(effect.slowPct));
    e.rocketSlowT = Math.max(Number(e.rocketSlowT || 0), Number(effect.duration || 5));
  }
  if (effect?.accuracyPenaltyPct > 0) {
    e.rocketAccuracyPenaltyPct = Math.max(Number(e.rocketAccuracyPenaltyPct || 0), Number(effect.accuracyPenaltyPct));
    e.rocketAccuracyT = Math.max(Number(e.rocketAccuracyT || 0), Number(effect.duration || 5));
  }
  if (effect?.freezeSec > 0) {
    e.freezeT = Math.max(Number(e.freezeT || 0), Number(effect.freezeSec));
  }
  if (effect) {
    e._damagedByPlayer = true;
    if (e._cubikonDeathFlee) e.noRewards = false;
  }
  if (effect && rules?.mode === "zone") {
    if (e.passiveNative) e._provoked = true;
    e._aggroT = e.aggroHold ?? 3.5;
    e._aggro = true;
  }

  return {
    total: (direct.total || 0) + (drained.total || 0),
    sh: (direct.sh || 0) + (drained.sh || 0),
    hp: direct.hp || 0,
    bypass: direct.bypass || 0,
    isCrit: !!(direct.isCrit || drained.isCrit),
    rawDamage: (direct.rawDamage || 0) + (drained.rawDamage || 0),
    rocketDirectRaw: direct.rawDamage || 0,
    rocketShieldDrainRaw: drained.rawDamage || 0,
  };
}

function applyRocketVolleyHit(e, b, count, recipient = player) {
  const combined = {
    total: 0, sh: 0, hp: 0, bypass: 0, isCrit: false, rawDamage: 0,
    rocketDirectRaw: 0, rocketShieldDrainRaw: 0,
  };
  for (let i = 0; i < Math.max(1, count || 1); i++) {
    const hit = applyRocketHit(e, b, recipient);
    combined.total += hit.total || 0;
    combined.sh += hit.sh || 0;
    combined.hp += hit.hp || 0;
    combined.bypass += hit.bypass || 0;
    combined.rawDamage += hit.rawDamage || 0;
    combined.rocketDirectRaw += hit.rocketDirectRaw || 0;
    combined.rocketShieldDrainRaw += hit.rocketShieldDrainRaw || 0;
    if (hit.isCrit) combined.isCrit = true;
  }
  return combined;
}

function npcEffectiveSpeed(e, fallback = 320) {
  const baseSpeed = Number(e?.speed) || fallback;
  const slowPct = (e?.rocketSlowT || 0) > 0
    ? clamp(Number(e.rocketSlowPct) || 0, 0, 95)
    : 0;
  return baseSpeed * (1 - slowPct / 100);
}

function hurtPlayer(amount, source = null) {
  if (player.dead || player.iFrames > 0 || (player.invincibleT || 0) > 0) return;

  resetRepairCooldown();
  player.iFrames = 0.1;
  player.attackedT = 5;
  // Seul un joueur bloque les portails battle : les sources NPC passent null.
  if (source?.byPlayer === true) player.pvpAttackT = 5;

  damagePlayerLayers(player, amount, Number(player.shAbsorb) > 0 ? Number(player.shAbsorb) : 0.8);

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
  const xpResult = awardExperience(experience, "npc");
  const honorResult = awardHonor(honor);
  const gainedXp = xpResult?.gained ?? experience;
  const gainedHonor = honorResult?.gained ?? honor;
  const formation = getActiveDroneFormation(account.user) || {};
  const formationName = String(formation?.name || "").replace(/^Formation\s+/i, "");
  const xpFormationPct = Number(formation?.effects?.npcXpPct || 0);
  const honorFormationPct = Number(formation?.effects?.honorPct || 0);
  const xpModulePct = Math.max(0, Number(player?.expBonusPct || 0) - xpFormationPct);
  const honorModulePct = Math.max(0, Number(player?.honorBonusPct || 0) - honorFormationPct);
  const xpTotalBonus = Math.max(0, gainedXp - experience);
  const honorTotalBonus = Math.max(0, gainedHonor - honor);
  const xpFormationBonus = Math.min(xpTotalBonus, Math.max(0, Math.round(experience * xpFormationPct / 100)));
  const honorFormationBonus = Math.min(honorTotalBonus, Math.max(0, Math.round(honor * honorFormationPct / 100)));
  const xpModuleBonus = Math.max(0, xpTotalBonus - xpFormationBonus);
  const honorModuleBonus = Math.max(0, honorTotalBonus - honorFormationBonus);
  const xpBonusText = xpFormationBonus > 0 ? `( +${formatInteger(xpFormationBonus)} ${formationName} )` : "";
  const honorBonusText = honorFormationBonus > 0 ? `( +${formatInteger(honorFormationBonus)} ${formationName} )` : "";
  const xpModuleText = xpModuleBonus > 0 ? `( +${formatInteger(xpModuleBonus)} Module(s) )` : "";
  const honorModuleText = honorModuleBonus > 0 ? `( +${formatInteger(honorModuleBonus)} Module(s) )` : "";
  const xpText = `${formatInteger(gainedXp)} XP ${xpBonusText} ${xpModuleText}`.trim();
  const honorText = `${formatInteger(gainedHonor)} honneur ${honorBonusText} ${honorModuleText}`.trim();
  const whiteTerms = [xpBonusText, xpModuleText, honorBonusText, honorModuleText].filter(Boolean);
  const violetTerms = [...(formationName ? [formationName] : []), ...(xpModuleBonus > 0 || honorModuleBonus > 0 ? ["Module(s)"] : [])];
  const npcName = String(NPC_TYPES[e.type]?.name || e.type || "NPC").replace(/^npc_/i, "");
  addGameLog(`${npcName} détruit · +${formatInteger(credits)} crédits · +${xpText} · +${honorText}`, "reward");
  showNotificationGroup([
    `${npcName} éliminé`,
    `Vous avez reçu ${formatInteger(credits)} crédits`,
    `Vous avez gagné ${xpText}`,
    `Vous avez gagné ${honorText}`,
  ], "info", { whiteTerms, violetTerms });
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
  return measureGameTask("processDeaths", processDeathsMeasured);
}

function processDeathsMeasured() {
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    if (e.hp > 0) continue;

    if (!e.suppressDeathExplosion) {
      spawnExplosion(e.x, e.y, e.isBoss ? 1.6 : 1.0);
      // Atténue les lasers avant le son de mort pour une destruction réelle.
      SFX.fadeOut("pShotX1", { dur: 0.25, to: 0.3 });
      SFX.fadeOut("pShotX2", { dur: 0.25, to: 0.3 });
      SFX.fadeOut("pShotX3", { dur: 0.25, to: 0.3 });
      SFX.fadeOut("pShotX4", { dur: 0.25, to: 0.3 });
      SFX.fadeOut("pShotX6", { dur: 0.25, to: 0.3 });
      SFX.fadeOut("pShotSab", { dur: 0.25, to: 0.3 });
      SFX.play("npcDeath", { maxVoices: 16, cooldown: 0 });
    }

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

    // À la mort du Cubikon, chaque Protegit fuit dans sa propre direction
    // pendant deux secondes et perd progressivement toute sa vie.
    const fleeAngle = Math.random() * TAU;
    const fleeSpeed = Math.max(650, Number(m.speed) || 650);
    m._cubikonDeathFlee = true;
    m._cubikonDeathFleeT = 2;
    m._cubikonDeathDecayActive = true;
    m._cubikonDeathDecay = Math.max(1, Number(m.hpMax) || Number(m.hp) || 1) * 0.05;
    m.noRewards = !m._damagedByPlayer;
    m.despawnT = 0;
    m.despawnDur = 0;
    m.masterId = null;
    m._provoked = false;
    m._aggro = false;
    m._aggroT = 0;
    m._attackedPlayerRecently = false;
    m.vx = Math.cos(fleeAngle) * fleeSpeed;
    m.vy = Math.sin(fleeAngle) * fleeSpeed;
    m.angle = fleeAngle;
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
  laserCombatInRange = null;
  escapeWatch = null;
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
    // Ne jamais sauver en synchrone au milieu d'une frame de kill :
    // la sauvegarde temporisée regroupe et évite le freeze (~600ms).
    markProgressDirty();
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
    // Sauvegarde différée aussi ici (même raison : pas de freeze au kill).
    markProgressDirty();
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

// Compétence ISH : même CD que l'IEM, 3 s d'invincibilité + anim de réapparition.
const ISH_COST = 30000;

const ISH_COOLDOWN = 10.0;

const ISH_DURATION = 3.0;

let pulseCd = 0;
let iemCd = 0;
let ishCd = 0;

function canUseSkill(cost) {
  return started && !player.dead && player.credits >= cost;
}

function updateSkillUI() {
  const pulseOk = canUseSkill(PULSE_COST) && pulseCd <= 0;
  const ishOk = canUseSkill(ISH_COST) && ishCd <= 0;

  setHudClass(ui.btnPulse, "disabled", !pulseOk);
  setHudClass(ui.btnPulse, "ready", pulseOk);
  setHudClass(ui.btnIsh, "disabled", !ishOk);
  setHudClass(ui.btnIsh, "ready", ishOk);
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
  SFX.play("pulseIEM");

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

// ISH : 3 s d'invincibilité + même anim que la réapparition,
// mais son Bouclier_Instant (pas le son de réapparition).
function useIsh() {
  if (!started || player.dead) return;

  if (ishCd > 0) {
    showToast(`ISH en recharge (${ishCd.toFixed(1)}s)`, 0.9);
    return;
  }

  if (player.credits < ISH_COST) {
    showToast("Pas assez de crédits (ISH)", 1.2);
    return;
  }

  player.credits -= ISH_COST;
  ishCd = ISH_COOLDOWN;
  startRespawnInstaShield();
  // L'ISH dure 3 s comme l'anim (même durée que l'invincibilité de réapparition).
  player.invincibleT = Math.max(Number(player.invincibleT) || 0, ISH_DURATION);
  SFX.play("ishShield");

  markProgressDirty();

  showToast("ISH !", 1.0);
}

ui.btnIsh?.addEventListener("click", () => {
  if (!ui.btnIsh.classList.contains("disabled")) useIsh();
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

// Suivi de portée laser pendant l'attaque : true = à portée (combat),
// false = hors de portée, null = pas d'attaque en cours.
// Les notifs ne partent que sur transition → jamais de spam, même en continu.
let laserCombatInRange = null;
// Surveillance d'évasion : attaque arrêtée en plein combat, on guette la
// sortie de portée pour annoncer "Vous avez échappé à l'attaque !".
let escapeWatch = null;

// Anti-spam des notifs manuelles répétées (clic / CTRL).
let laserRangeNotifyLast = -10;
function notifyLaserRange(text, type) {
  const now = (typeof performance !== "undefined" ? performance.now() : Date.now()) / 1000;
  if (now - laserRangeNotifyLast < 1.5) return false;
  laserRangeNotifyLast = now;
  showNotification(text, 1.5, type);
  return true;
}

// "Hors de portée" : Out_Of_Range joué 3x en enchaîné (le suivant démarre
// quand le précédent atteint 50 % de sa durée).
// La suite est annulée si on rentre en combat ou si l'attaque s'arrête entre-temps.
let outOfRangeSeq = 0;
function playOutOfRangeTriple() {
  const seq = ++outOfRangeSeq;
  const buffered = SFX?.buffers?.outOfRange?.duration;
  const gapMs = Number.isFinite(buffered) && buffered > 0 ? Math.round((buffered * 1000) / 2) : 250;
  SFX?.play?.("outOfRange");
  for (let i = 1; i < 3; i++) {
    window.setTimeout(() => {
      if (seq !== outOfRangeSeq) return; // relance plus récente
      if (!attackActive) return; // attaque arrêtée entre-temps
      if (laserCombatInRange === true) return; // rentré en combat entre-temps
      SFX?.play?.("outOfRange");
    }, i * gapMs);
  }
}

function isLaserTargetOutOfRange(t) {
  if (!t) return false;
  return dist2(player.x, player.y, t.x, t.y) > playerRange * playerRange;
}

// Annonce immédiate au déclenchement manuel : "Le combat a commencé."
// à portée, "Cible hors de portée." sinon (comme roquettes / lance-roquettes).
function announceLaserCombatRange(t) {
  const out = isLaserTargetOutOfRange(t);
  laserCombatInRange = !out;
  escapeWatch = null;
  if (out) {
    if (notifyLaserRange("Cible hors de portée.", "error")) playOutOfRangeTriple();
  } else notifyLaserRange("Le combat a commencé.", "info");
}

function startAttack(ammoOverride = null) {
  const currentAmmo = player.ammo.active || "x1";

  if (ammoOverride && attackActive && ammoOverride === currentAmmo) {
    stopAttack();
    return;
  }
  // Changement de munition en plein combat : pas de nouvelle annonce,
  // tickAutoAttack suit déjà les transitions de portée.
  const wasAttackActive = attackActive;

  if (!ammoOverride) {
    if (attackActive) {
      stopAttack();
      return;
    }
    if (player.dead || !started) return;
    const t = Target.get();
    if (!t) return;
    attackActive = true;
    announceLaserCombatRange(t);
    tryFireOnce(null, true);
    return;
  }

  // ✅ changement de munition :
  const switchingToRsbLike = isRsbLike(ammoOverride);

  if (attackActive && switchingToRsbLike) {
    // les salves rapides ont leur propre rythme : on coupe la salve en cours.
    clearPendingSalvo();
  } else if (attackActive && !switchingToRsbLike) {
    // ✅ entre munitions standard : les faux tirs (en attente et déjà en vol)
    // deviennent instantanément la nouvelle munition, sans perdre leur cadence
    // (on ne repart pas d'un nouveau vrai tir pour relancer la salve).
    reskinSalvo(ammoOverride);
  }

  if (ammoOverride) setAmmo(ammoOverride);

  if (player.dead || !started) return;

  const t = Target.get();
  if (!t) return;

  // ✅ salve rapide indisponible : l'attaque reste active mais visuellement
  // rien ne part jusqu'à la fin du cooldown, où la salve se déclenche d'elle-même.
  if (switchingToRsbLike && rsbLikeCooldown(ammoOverride) > 0) {
    attackActive = true;
    if (!wasAttackActive) announceLaserCombatRange(t);
    return;
  }

  attackActive = true;
  if (!wasAttackActive) announceLaserCombatRange(t);
  tryFireOnce(null, true);
}

function stopAttack() {
  // Arrêt en plein combat : on surveille les sorties de portée (évasion).
  // Réarmé à chaque retour à portée → le message revient à chaque sortie.
  const t = laserCombatInRange === true ? Target.get() : null;
  escapeWatch = t ? { targetId: t.id, wasIn: true } : null;
  attackActive = false;
  laserCombatInRange = null;
  clearPendingSalvo();
}

function toggleAttack() {
  if (attackActive) stopAttack();
  else startAttack();
}

// ============================================================
// Roquettes (tir manuel façon DarkOrbit, lanceur natif au vaisseau)
// ============================================================
function activeRocket() {
  return getRocketType(player.rocketActive) || getRocketType("r310");
}

function rocketCount(id = player.rocketActive) {
  const key = String(id || "r310").toLowerCase();
  return Math.max(0, Math.floor(Number(player.rockets?.[key] || 0)));
}

function tryFireRocket(opts = {}) {
  const silent = opts.auto === true;
  const notify = (text, dur, type) => { if (!silent) showNotification(text, dur, type); };
  if (player.dead || !started) return false;
  const rocket = activeRocket();
  // Standards uniquement : les lance-roquettes passent par le bouton USE (salves).
  if (rocket.manual === false) {
    notify("Roquette de lance-roquettes — bouton USE.", 2, "error");
    return false;
  }
  if (rocketCount(rocket.id) <= 0) {
    // Bascule auto vers un type standard possédé (sauf tir strict : la sélection).
    if (!opts.strict) {
      const fallback = ROCKET_IDS.filter((id) => getRocketType(id)?.manual !== false).find((id) => rocketCount(id) > 0);
      if (fallback) {
        player.rocketActive = fallback;
        return tryFireRocket(opts);
      }
    }
    notify("Plus de roquettes — boutique > Roquettes.", 2.5, "error");
    return false;
  }
  if (rocketCooldown > 0) return false;

  const t = Target.get();
  if (!t) return false;

  const d2 = dist2(player.x, player.y, t.x, t.y);
  if (d2 > playerRange * playerRange) {
    notify("Cible hors de portée.", 1.5, "error");
    return false;
  }

  player.angle = Math.atan2(t.y - player.y, t.x - player.x);

  SFX.play("sfx_shot_roquettes", { cooldown: 0.05, cut: true });

  player.rockets[rocket.id] = rocketCount(rocket.id) - 1;
  rocketCooldownMax = rocket?.cooldown || 1.0;
  rocketCooldown = rocketCooldownMax;
  // Arme comme les lasers : lève la zone de non-agression pendant 5 s.
  player.combatT = 5.0;
  markProgressDirty();
  updateAmmoUI();

  spawnRocketProjectile(rocket, t, { volleyId: volleySeq++, volleySize: 1 });
  return true;
}

// Fabrique un projectile roquette (tir unique ou salve) : centre du vaisseau,
// tête chercheuse en arc (C), fumée arc-en-ciel, MISS possible au contact.
function spawnRocketProjectile(rocket, t, { spread = 0, volleyId = 0, volleySize = 1, arcDir = null, arcScale = 1, arcBoost = 0, miss = null } = {}) {
  const distToTarget = Math.hypot(t.x - player.x, t.y - player.y);
  // Même vitesse de base que les standards.
  const speed = rocketLaunchSpeed(distToTarget);
  // Durée garantie : la roquette touche toujours (ou MISS au contact),
  // jamais d'expiration en vol tant que la cible vit.
  const life = rocketFlightLife(playerRange, speed);
  const dmg = (rocket?.damage ?? 1000)
    * (1 + Number(getActiveDroneFormation(account.user).effects?.npcDamagePct || 0) / 100);
  const shotMiss = typeof miss === "boolean"
    ? miss
    : Math.random() < Math.max(0, PLAYER_SHOTS.missChance - (Number(player.laserHitBonusPct || 0) / 100));
  const ang = rocket.manual === false
    ? launcherRocketLaunchAngle(player.angle, arcDir, spread)
    : player.angle + spread;

  addCappedProjectile(bullets, {
    x: player.x,
    y: player.y,
    vx: Math.cos(ang) * speed,
    vy: Math.sin(ang) * speed,
    r: 8.0,
    life,
    dmg,
    rocketEffect: rocket.effect || null,
    key: rocket.id,
    side: "player",
    targetId: t.id,
    homing: true,
    spd: speed,
    volleyId,
    volleySize: Math.max(1, volleySize || 1),
    isSab: false,
    isRocket: true,
    isLauncherRocket: rocket.manual === false,
    launcherDepartureX: Math.cos(ang),
    launcherDepartureY: Math.sin(ang),
    launcherDepartureT: 0,
    // Vol en arc (C) : 70° de près → 45° au max de portée (sens aléatoire),
    // + bonus d'angle pour les salves (arcs plus grands, plus loin).
    // Arc grand si la cible est proche, petit si elle est loin.
    // En salve : sens alterné + ampleur propre à chaque roquette (éventail, pas de superposition).
    arcDist0: distToTarget,
    arcT: 0,
    arcKick0: (arcDir ?? (Math.random() < 0.5 ? -1 : 1)) * arcScale * speed * Math.tan((70 + arcBoost - Math.min(1, distToTarget / playerRange) * 25) * Math.PI / 180),
    smokeT: 0,
    smokeHue: Math.floor(Math.random() * 360),
    miss: shotMiss,
  }, ENTITY_LIMITS.playerBullets);
}

// Salve du lance-roquettes : N = carrés bleus (chargeur), tir possible à tout
// moment même partiel. Le tir vide le chargeur puis impose 2 s de pause
// (manuel comme auto) avant la recharge.
// Totalement séparé des standards (sélection, stock, cycle propres).
function tryFireSalvo(opts = {}) {
  const silent = opts.auto === true;
  const notify = (text, dur, type) => { if (!silent) showNotification(text, dur, type); };
  if (player.dead || !started) return false;
  const id = String(player.launcherActive || "eco10").toLowerCase();
  const rocket = getRocketType(id);
  if (!rocket || rocket.manual !== false) return false;
  const n = launcherLitNow();
  if (n <= 0) {
    notify("Chargeur vide — rechargement en cours…", 2, "error");
    return false;
  }
  // En auto : laisse le chargeur plein affiché 0.4 s avant la salve.
  if (opts.auto) {
    const full = Math.min(5, rocketCount(id));
    if (n < full || launcherFullT < 0.4) return false;
  }

  const t = Target.get();
  if (!t) return false;

  if (dist2(player.x, player.y, t.x, t.y) > playerRange * playerRange) {
    notify("Cible hors de portée.", 1.5, "error");
    return false;
  }

  player.angle = Math.atan2(t.y - player.y, t.x - player.x);

  player.rockets[id] = rocketCount(id) - n;
  launcherReloadT = 0;
  launcherFullT = 0;
  launcherPhase = "cooldown";
  launcherPhaseT = 0;
  // Arme comme les lasers : lève la zone de non-agression pendant 5 s.
  player.combatT = 5.0;
  markProgressDirty();
  updateAmmoUI();

  const volleyId = volleySeq++;
  const volleyMiss = Math.random() < Math.max(0, PLAYER_SHOTS.missChance - (Number(player.laserHitBonusPct || 0) / 100));
  for (let i = 0; i < n; i++) {
    // 1 son par roquette, en même temps.
    SFX.play("sfx_shot_lance_roquettes", { maxVoices: 8 });
    // Éventail large : sens alterné + grande ampleur → 5 grands C distincts.
    const dirSign = i % 2 === 0 ? -1 : 1;
    const scale = 1.8 + 1.2 * (n > 1 ? i / (n - 1) : 0.5);
    spawnRocketProjectile(rocket, t, { spread: (i - (n - 1) / 2) * 0.12, volleyId, volleySize: n, arcDir: dirSign, arcScale: scale, arcBoost: 15, miss: volleyMiss });
  }
  return true;
}

// Autos roquettes : ne tirent que sur ON **et** attaque de base enclenchée
// (Activer / arrêter le tir). Silencieux : pas de spam de notifications.
function tickAutoRockets() {
  if (!attackActive) return;
  if (player.dead || !started) return;
  const t = Target.get();
  if (!t) return;
  if (dist2(player.x, player.y, t.x, t.y) > playerRange * playerRange) return;
  // Deux armes séparées : chacune son cooldown, pas de blocage croisé.
  if (player.rocketAuto) tryFireRocket({ auto: true });
  if (player.launcherAuto) tryFireSalvo({ auto: true });
}

function tickAutoAttack(dt) {
  // Attaque coupée en plein combat : on guette chaque sortie de portée.
  // Retour à portée = réarmé (silencieux) → le message revient à la sortie suivante.
  if (!attackActive) {
    if (escapeWatch && !player.dead && started) {
      const wt = Target.get();
      if (!wt || wt.id !== escapeWatch.targetId) escapeWatch = null;
      else if (isLaserTargetOutOfRange(wt)) {
        if (escapeWatch.wasIn) notifyLaserRange("Vous avez échappé à l'attaque !", "info");
        escapeWatch.wasIn = false;
      } else {
        escapeWatch.wasIn = true;
      }
    }
    return;
  }
  if (player.dead || !started) return;

  const t = Target.get();
  if (!t) {
    stopAttack();
    return;
  }

  const d2 = dist2(player.x, player.y, t.x, t.y);
  const inRange = d2 <= playerRange * playerRange;
  // Annonce les changements de portée pendant l'attaque :
  // "Le combat a commencé." en entrant, "Cible hors de portée." en sortant.
  if (laserCombatInRange === null) {
    laserCombatInRange = inRange;
  } else if (inRange !== laserCombatInRange) {
    laserCombatInRange = inRange;
    if (inRange) notifyLaserRange("Le combat a commencé.", "info");
    else {
      // Tir toujours enclenché et sortie de portée : hors de portée + triple bip.
      if (notifyLaserRange("Cible hors de portée.", "error")) playOutOfRangeTriple();
    }
  }
  if (!inRange) return;

  const ammoKey = player.ammo.active || "x1";
  // ✅ les salves rapides (X6, RCB) suivent leur propre cooldown (5 s),
  // indépendant du laser standard.
  if (isRsbLike(ammoKey)) {
    if (rsbLikeCooldown(ammoKey) <= 0) tryFireOnce(null, true);
    return;
  }

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
  x6: "pShotX6",
  sab: "pShotSab",
  // Munitions spéciales : RCB = son RSB (comme son comportement) ;
  // les autres n'ont aucun son dédié côté officiel → son X1.
  rcb: "pShotX6",
  cbo: "pShotSab",
  job: "pShotX1",
  rb: "pShotX1",
  pib: "pShotX1",
  idb: "pShotX1",
  vb: "pShotX1",
  emaa: "pShotX1",
  sbl: "pShotX1",
  abl: "pShotX1",
};

function playPlayerShot(ammoKey) {
  const id = PLAYER_SHOT_SFX[ammoKey] || PLAYER_SHOT_SFX.x1;
  // ✅ hors salves rapides : on alterne entre son standard, légèrement plus
  // aigu et légèrement plus grave pour casser la monotonie.
  const RATE_VARIANTS = [0.9, 1.0, 1.1];
  const rate = isRsbLike(ammoKey)
    ? 0.98 + Math.random() * 0.04
    : RATE_VARIANTS[Math.floor(Math.random() * RATE_VARIANTS.length)];
  SFX.play(id, { rate, cooldown: 0.01, cut: true });
  // ✅ CBO-100 : double son SAB + X1 en même temps (absorption + tir).
  if (ammoKey === "cbo") {
    SFX.play(PLAYER_SHOT_SFX.x1, { rate, cooldown: 0.01, cut: true });
  }
}

// Tir réel d'une escorte : mêmes fichiers que le joueur mais clés SFX
// dédiées, réglées par la ligne "Sons des escortes" (sans couper le joueur).
const ESCORT_SHOT_SFX = {
  x1: "escortX1",
  x2: "escortX2",
  x3: "escortX3",
  x4: "escortX4",
  x6: "escortX6",
  sab: "escortSab",
  rcb: "escortX6",
  cbo: "escortSab",
  job: "escortX1",
  rb: "escortX1",
  pib: "escortX1",
  idb: "escortX1",
  vb: "escortX1",
  emaa: "escortX1",
  sbl: "escortX1",
  abl: "escortX1",
};

function playEscortShot(ammoKey) {
  const id = ESCORT_SHOT_SFX[ammoKey] || ESCORT_SHOT_SFX.x1;
  const RATE_VARIANTS = [0.9, 1.0, 1.1];
  const rate = RATE_VARIANTS[Math.floor(Math.random() * RATE_VARIANTS.length)];
  SFX.play(id, { rate, cooldown: 0.05, maxVoices: 2 });
}

// ✅ quand un vrai tir touche sa cible (dégâts, sans dégâts ou MISS),
// on joue aléatoirement un des 3 sons "laser hit".
const PLAYER_LASER_HIT_SFX = ["laserHit1", "laserHit2", "laserHit3"];

function playPlayerLaserHit() {
  const id = PLAYER_LASER_HIT_SFX[Math.floor(Math.random() * PLAYER_LASER_HIT_SFX.length)];
  SFX.play(id, { cooldown: 0.04, maxVoices: 4 });
}

// Impacts d'une même volée : 1er immédiat, suivants décalés de 100 ms.
// (Map bornée : pas de fuite sur la durée d'une session.)
const rocketVolleyHitCount = new Map();
const launcherVolleyImpactCount = new Map();

function registerLauncherRocketImpact(b) {
  const key = b.volleyId;
  const need = Math.max(1, Number(b.volleySize) || 1);
  const count = (launcherVolleyImpactCount.get(key) || 0) + 1;
  if (count >= need) {
    launcherVolleyImpactCount.delete(key);
    return { final: true, count: need };
  }
  if (launcherVolleyImpactCount.size > 500 && !launcherVolleyImpactCount.has(key)) {
    launcherVolleyImpactCount.delete(launcherVolleyImpactCount.keys().next().value);
  }
  launcherVolleyImpactCount.set(key, count);
  return { final: false, count };
}
function playRocketImpactStaggered(volleyId) {
  const n = rocketVolleyHitCount.get(volleyId) || 0;
  if (rocketVolleyHitCount.size > 500 && !rocketVolleyHitCount.has(volleyId)) {
    const oldest = rocketVolleyHitCount.keys().next().value;
    rocketVolleyHitCount.delete(oldest);
  }
  rocketVolleyHitCount.set(volleyId, n + 1);
  if (n === 0) playPlayerLaserHit();
  else window.setTimeout(() => playPlayerLaserHit(), n * 100);
}

let fireCooldown = 0;

const RSB_COOLDOWN = 5.0;
let rsbCooldown = 0;

// ✅ X6 + RCB-140 : cooldown PARTAGÉ (5 s). Tirer l'un bloque l'autre,
// voiles et boutons suivent le même compteur des deux côtés.
const RCB_COOLDOWN = 5.0;
let rcbCooldown = 0;

// Munitions à salve rapide (tir RSB) : X6 + RCB.
const isRsbLike = (key) => key === "x6" || key === "rcb";
function rsbLikeCooldown(key) {
  void key;
  return Math.max(rsbCooldown, rcbCooldown);
}

// Roquettes R-310 : tir manuel à tête chercheuse, stock consommable.
let rocketCooldown = 0;
// Durée de référence du cooldown en cours (pour le voile du dock).
let rocketCooldownMax = 1.0;
// Lance-roquettes : chargeur 5 coups à 1/s, tir quand on veut (même partiel),
// 2 s de pause après chaque salve avant la recharge. Pas d'autre blocage.
let launcherReloadT = 0;
let launcherPhase = "reload"; // reload | cooldown
let launcherPhaseT = 0;
let launcherFullT = 0; // temps passé chargeur plein (affichage avant salve auto)

function launcherThreshold() {
  return Math.max(0, Math.min(5, rocketCount(player.launcherActive)));
}

function launcherLitNow() {
  if (launcherPhase === "cooldown") return 0;
  const stock = rocketCount(player.launcherActive);
  return Math.max(0, Math.min(5, Math.floor(launcherReloadT), stock));
}

function tickLauncherCharger(dt) {
  const full = launcherThreshold();
  if (full <= 0) {
    // Rien à charger : retour au début du cycle.
    if (launcherPhase !== "reload" || launcherReloadT !== 0) {
      launcherPhase = "reload";
      launcherReloadT = 0;
    }
    launcherFullT = 0;
    return;
  }
  if (launcherPhase === "cooldown") {
    launcherPhaseT += dt;
    if (launcherPhaseT >= 2) {
      launcherPhase = "reload";
      launcherReloadT = 0;
      SFX.play("rocketsLoadStart", { cut: true });
    }
    launcherFullT = 0;
    return;
  }
  // reload : +1/s. Le tir est possible à tout moment (même partiel).
  const previousLit = launcherLitNow();
  launcherReloadT = Math.min(5, launcherReloadT + dt);
  // Mémorise le plein affiché pour la salve auto.
  const lit = launcherLitNow();
  for (let loaded = previousLit + 1; loaded <= lit; loaded++) {
    SFX.play(loaded === 5 ? "rocketsLoaded" : "rocketLoad", { maxVoices: 5 });
  }
  if (lit >= full) launcherFullT += dt;
  else launcherFullT = 0;
}

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

// ✅ éclatement temporel de la salve (purement visuel) :
// les éclairs de la salve sont espacés sur la durée d'un tir.
// Chaque entrée stocke les infos du tir (cible, formes, balistiques) :
// au moment du spawn, la munition utilisée est celle ACTIVE, ce qui permet
// de "reskinner" instantanément les faux tirs pendant un changement d'ammo.
const pendingSalvo = [];

function clearPendingSalvo() {
  pendingSalvo.length = 0;
}

function scheduleSalvoPart(delay, entry) {
  if (delay <= 0) {
    spawnSalvoDecoy(entry);
    return;
  }
  pendingSalvo.push({ t: delay, ...entry });
}

function spawnSalvoDecoy(e) {
  // ✅ la salve s'arrête si la cible n'existe plus (NPC mort)
  const t2 = getEnemyById(e.targetId);
  if (!t2) return;
  // ✅ munition active au moment du tir : si on a switché entre-temps,
  // le faux tir devient instantanément la nouvelle munition.
  const key = player.ammo.active || e.key || "x1";
  // ✅ SAB/CBO inversé : les faux tirs partent eux aussi de la cible vers le vaisseau.
  // (Si on a switché de munition entre-temps, retour au départ vaisseau classique.)
  if (e.sabReverse && (key === "sab" || key === "cbo")) {
    const rdx = player.x - t2.x, rdy = player.y - t2.y;
    const rdl = Math.hypot(rdx, rdy) || 1;
    const rnx = rdx / rdl, rny = rdy / rdl;
    const startX = t2.x + rnx * ((t2.r || 18) + 6);
    const startY = t2.y + rny * ((t2.r || 18) + 6);
    const baseAng = Math.atan2(rny, rnx);
    const qx = -rny, qy = rnx;
    for (const [off, aOff] of e.items) {
      addCappedProjectile(bullets, {
        x: startX + qx * off,
        y: startY + qy * off,
        vx: Math.cos(baseAng + aOff) * e.speed,
        vy: Math.sin(baseAng + aOff) * e.speed,
        r: 6.0,
        life: e.life,
        dmg: 0,
        key,
        side: "player",
        targetId: e.targetId,
        homing: true,
        sabReverse: true,
        spd: e.speed,
        volleyId: e.volleyId,
        volleySize: e.volleySize,
        isSab: key === "sab",
        miss: false,
        visual: true,
      }, ENTITY_LIMITS.playerBullets);
    }
    return;
  }
  // ✅ recalcule la position de départ depuis le vaisseau au moment du tir
  // (le joueur a pu bouger entre le début et la fin de la salve)
  const ang2 = Math.atan2(t2.y - player.y, t2.x - player.x);
  const fx2 = Math.cos(ang2), fy2 = Math.sin(ang2);
  const px2 = -fy2, py2 = fx2;
  const muzzle2X = player.x + fx2 * (player.r + 10);
  const muzzle2Y = player.y + fy2 * (player.r + 10);
  for (const [off, aOff] of e.items) {
    addCappedProjectile(bullets, {
      x: muzzle2X + px2 * off,
      y: muzzle2Y + py2 * off,
      vx: Math.cos(ang2 + aOff) * e.speed,
      vy: Math.sin(ang2 + aOff) * e.speed,
      r: 6.0,
      life: e.life,
      dmg: 0,
      key,
      side: "player",
      targetId: e.targetId,
      homing: true,
      spd: e.speed,
      volleyId: e.volleyId,
      volleySize: e.volleySize,
      isSab: false,
      miss: false,
      visual: true,
    }, ENTITY_LIMITS.playerBullets);
  }
}

function tickPendingSalvo(dt) {
  if (!pendingSalvo.length) return;
  for (let i = pendingSalvo.length - 1; i >= 0; i--) {
    const entry = pendingSalvo[i];
    entry.t -= dt;
    if (entry.t <= 0) {
      pendingSalvo.splice(i, 1);
      spawnSalvoDecoy(entry);
    }
  }
}

// Faux tirs des escortes : même visuel que le joueur (éclairs dmg 0),
// spawnés depuis l'escorte au moment du tir, jamais de dégâts ni de son.
const pendingEscortSalvo = [];

function clearPendingEscortSalvo() {
  pendingEscortSalvo.length = 0;
}

function scheduleEscortSalvoPart(delay, entry) {
  if (delay <= 0) {
    spawnEscortSalvoDecoy(entry);
    return;
  }
  pendingEscortSalvo.push({ t: delay, ...entry });
}

function spawnEscortSalvoDecoy(e) {
  const isPet = e.escortId === "pet";
  if (isPet && (!account.user?.pet?.active || !petState.ready || player.dead)) return;
  if (isPet && (petState.returning || petState.target?.id !== e.targetId
    || normalizePetMode(account.user?.pet?.mode) !== "combat")) return;
  const escort = isPet ? petState : getEscortById(e.escortId);
  const t2 = getEnemyById(e.targetId);
  if (!escort || (isPet ? account.user?.pet?.hp <= 0 : escort.hp <= 0) || !t2 || t2.hp <= 0) return;
  const ang2 = Math.atan2(t2.y - escort.y, t2.x - escort.x);
  const fx2 = Math.cos(ang2), fy2 = Math.sin(ang2);
  const px2 = -fy2, py2 = fx2;
  const muzzle = isPet ? 50 : (escort.pack?.r || 34) + 10;
  const muzzle2X = escort.x + fx2 * muzzle;
  const muzzle2Y = escort.y + fy2 * muzzle;
  for (const [off, aOff] of e.items) {
    addCappedProjectile(bullets, {
      x: muzzle2X + px2 * off,
      y: muzzle2Y + py2 * off,
      vx: Math.cos(ang2 + aOff) * e.speed,
      vy: Math.sin(ang2 + aOff) * e.speed,
      r: 6.0,
      life: e.life,
      dmg: 0,
      key: e.key || "x3",
      side: "player",
      targetId: e.targetId,
      homing: true,
      spd: e.speed,
      volleyId: e.volleyId,
      volleySize: e.volleySize,
      isSab: false,
      miss: false,
      visual: true,
      ownerEscortId: e.escortId,
    }, ENTITY_LIMITS.playerBullets);
  }
}

function tickPendingEscortSalvo(dt) {
  if (!pendingEscortSalvo.length) return;
  for (let i = pendingEscortSalvo.length - 1; i >= 0; i--) {
    const entry = pendingEscortSalvo[i];
    entry.t -= dt;
    if (entry.t <= 0) {
      pendingEscortSalvo.splice(i, 1);
      spawnEscortSalvoDecoy(entry);
    }
  }
}

// ✅ les faux tirs déjà en vol deviennent instantanément la nouvelle munition.
function reskinSalvo(newKey) {
  for (const b of bullets) {
    if (b && b.visual && !b.ownerEscortId) b.key = newKey;
  }
}

function flushVolleyKey(key, v) {
  pendingVolleys.delete(key);
  if (!v || v.rawDamage <= 0) return;

  if (v.hasRocketBreakdown) {
    const opts = { size: 18, pop: 0.3, shake: 0.6, life: 1, glow: v.isCrit ? 1.4 : 1, weight: 900, impact: true };
    if (v.rocketDirectRaw > 0) {
      addFloatText(v.x - 24, v.y - 52, v.rocketDirectRaw, "rgba(255,107,122,0.95)", opts);
    }
    if (v.rocketShieldDrainRaw > 0) {
      addFloatText(v.x + 24, v.y - 82, v.rocketShieldDrainRaw, "rgba(124,240,255,0.95)", opts);
    }
    return;
  }

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

function queueVolleyFloat(target, out, volleyId, volleySize, timeout = VOLLEY_FLOAT_TIMEOUT) {
  if (!target || !out) return;

  const key = `${volleyId}:${target.id}`;
  let v = pendingVolleys.get(key);
  if (!v) {
    v = {
      t: 0,
      need: Math.max(1, volleySize || 1),
      timeout: Math.max(VOLLEY_FLOAT_TIMEOUT, Number(timeout) || 0),
      got: 0,
      total: 0,
      hp: 0,
      sh: 0,
      rawDamage: 0,
      rocketDirectRaw: 0,
      rocketShieldDrainRaw: 0,
      hasRocketBreakdown: false,
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
  v.rocketDirectRaw += out.rocketDirectRaw || 0;
  v.rocketShieldDrainRaw += out.rocketShieldDrainRaw || 0;
  if (Object.hasOwn(out, "rocketDirectRaw") || Object.hasOwn(out, "rocketShieldDrainRaw")) v.hasRocketBreakdown = true;
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
    if (v.t >= v.timeout) flushVolleyKey(key, v);
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

  let ammoKey = player.ammo.active || "x1";

  // ✅ les salves rapides (X6, RCB) ont leur propre cooldown (5 s) : elles
  // ignorent le cooldown du tir laser standard et ne le réinitialisent pas.
  if (isRsbLike(ammoKey)) {
    if (rsbLikeCooldown(ammoKey) > 0) {
      // ✅ pendant le retour de la salve : on n'attaque pas (pas de repli x1)
      return false;
    }
  } else if (fireCooldown > 0) {
    return false;
  }

  player.angle = Math.atan2(t.y - player.y, t.x - player.x);

  const ammoCfg = AMMO[ammoKey] || AMMO.x1;

  const baseCd = 1 / Math.max(0.001, player.baseFireRate * player.fireRateMult);
  if (!isRsbLike(ammoKey)) {
    fireCooldown = typeof ammoCfg.cooldown === "number" ? ammoCfg.cooldown : baseCd;
  }

  // ✅ munitions spéciales : IDB rampe, JOB aliens/joueurs, bonus
  // conditionnels (Demaners, Sibelons...). Voir COMBAT/AMMO_TYPES.js.
  const mult = resolveAmmoMult(ammoKey, t);

  playPlayerShot(ammoKey);

  const activeKey = player.ammo.active || "x1";
  if (ammoKey === activeKey) consumeAmmo(1);

const isSab = ammoKey === "sab";
// ✅ CBO-100 : même tir inversé que SAB (absorption), mais avec dégâts ×3
// normaux + vol de bouclier ×1 (au lieu du drain pur).
const isCbo = ammoKey === "cbo";
const isSabLike = isSab || isCbo;

// ✅ Vitesse du tir : base 4000, et plus on est loin de la cible plus elle
// augmente (dist * bulletSpeedDistGain).
const distToTarget = Math.hypot(t.x - player.x, t.y - player.y);
const speed = (player.baseBulletSpeed + distToTarget * BASE_RUN.bulletSpeedDistGain)
  * (isSab ? SAB50.bulletSpeedMult : 1);

const life = bulletLifeForRange(playerRange, speed);

// ✅ SAB-50 ne fait pas de dégâts HP.
// Elle utilise ta puissance laser comme quantité de bouclier à voler.
player.volleyCount = (player.volleyCount || 0) + 1;
// Bonus par canon x nombre équipé : vaisseau + drones.
// 1x PR-L = +200, 2x = +400, 35x = +7000 tous les 5 tirs.
// Idem vsMatch (LF-3, AA-1, PR-L Blacklight...) et U-LF4 instable.
let laserBase = player.baseDamage + laserFitVsExtra(player.laserMods, t, player.droneLaserMods);
laserBase += laserFitUnstableDelta(player.laserMods, player.droneLaserMods);
const overdrive = laserFitOverdrive(player.laserMods, player.droneLaserMods, player.volleyCount);
const dmgShot = isSab
  ? player.baseDamage * SAB50.drainMult
  : (laserBase + overdrive) * mult * (1 + Number(getActiveDroneFormation(account.user).effects?.npcDamagePct || 0) / 100);

  const shotMiss = Math.random() < Math.max(0, PLAYER_SHOTS.missChance - (Number(player.laserHitBonusPct || 0) / 100));

  const ang = player.angle;
  const fx = Math.cos(ang), fy = Math.sin(ang);
  const px = -fy, py = fx;

  const muzzleX = player.x + fx * (player.r + 10);
  const muzzleY = player.y + fy * (player.r + 10);

  if (isSabLike) {
    // ✅ SAB/CBO inversé : UN seul laser central, tiré DE LA CIBLE VERS le vaisseau
    // (absorption de bouclier). Pas d'alternance paire/impair (altShot untouched).
    const rdx = player.x - t.x, rdy = player.y - t.y;
    const rdl = Math.hypot(rdx, rdy) || 1;
    const rnx = rdx / rdl, rny = rdy / rdl;
    addCappedProjectile(bullets, {
      x: t.x + rnx * ((t.r || 18) + 6),
      y: t.y + rny * ((t.r || 18) + 6),
      vx: rnx * speed,
      vy: rny * speed,
      r: 6.0,
      life,
      dmg: dmgShot,
      key: ammoKey,
      side: "player",
      targetId,
      homing: true,
      sabReverse: true, // homing vers le joueur + impact à l'arrivée au vaisseau
      spd: speed,
      volleyId,
      volleySize: 1,
      isSab,
      miss: shotMiss,
    }, ENTITY_LIMITS.playerBullets);
  } else if (!player.altShot) {
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

  if (ammoKey === "x6" || ammoKey === "rcb") { rsbCooldown = RSB_COOLDOWN; rcbCooldown = RCB_COOLDOWN; }

  // ✅ Salve visuelle : seule la première volée (le vrai tir) inflige les dégâts ;
  // les éclairs suivants sont des doublons esthétiques (dmg 0) qui convergent sur la cible.
  // X6/RCB → 12 tirs affichés par seconde ; autres munitions → 6 tirs (1 toutes les 200 ms).
  const salvoShots = isRsbLike(ammoKey) ? 12 : 6;
  const salvoInterval = isRsbLike(ammoKey) ? 1 / 12 : 0.2;

  // 🔫 salve : le vrai tir compte pour le premier éclair affiché (t=0).
  // Les éclairs restants s'affichent toutes les `salvoInterval` ms en
  // alternant toujours "les 2" (paire gauche/droite) puis "le seul" (central),
  // même pour les faux tirs. SAB inversé : que des centraux (cible→vaisseau).
  const isRealPair = !!player.altShot && !isSab;
  const pairItems = [[-SIDE_OFFSET, 0], [SIDE_OFFSET, 0]];
  const singleItems = [[0, 0]];
  const salvoShotParams = { targetId, speed, life, volleyId, volleySize: isSabLike ? 1 : volleySize, sabReverse: isSabLike };
  for (let i = 1; i < salvoShots; i++) {
    const fakeIsPair = !isSabLike && (isRealPair ? i % 2 === 0 : i % 2 === 1);
    scheduleSalvoPart(i * salvoInterval, {
      ...salvoShotParams,
      items: fakeIsPair ? pairItems : singleItems,
    });
  }

  // SAB inversé : toujours central unique → l'alternance altShot est préservée
  // pour les autres munitions.
  if (!isSabLike) player.altShot = !player.altShot;
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
  laserCombatInRange = null;
  escapeWatch = null;
  betweenWaves = false;
  pendingVolleys.clear();
  launcherVolleyImpactCount.clear();

  // ✅ arrivée effective sur la carte = saut réussi : le robot réparateur
  // est réarmé immédiatement (resetPlayerToBase le remet sur son cooldown),
  // la réparation repart dès l'arrivée, sons compris.
  player.repairJumpLock = false;

  portal.active = false;
  gateReturnPortal.active = false;
  if (ui.portalOverlay) ui.portalOverlay.style.display = "none";

bullets.length = 0;
enemyBullets.length = 0;
clearPendingSalvo();
clearPendingEscortSalvo();
shipDamages.length = 0;
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
  rcbCooldown = 0;

  const u = loadAccountUser();

  if (u?.ship) {
    const found = getShipPackByIdData(u.ship);
    if (found) ACTIVE_SHIP = found;
  }

  resetPlayerToBase({ keepCredits: true });
  // 🔥 fin du cold start : le cooldown réparateur repart désormais normalement
  player.repairColdStart = false;

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
  rcb: Number(a.rcb || 0),
  cbo: Number(a.cbo || 0),
  job: Number(a.job || 0),
  rb: Number(a.rb || 0),
  pib: Number(a.pib || 0),
  idb: Number(a.idb || 0),
  vb: Number(a.vb || 0),
  emaa: Number(a.emaa || 0),
  sbl: Number(a.sbl || 0),
  abl: Number(a.abl || 0),
};
const rk0 = u.rockets || {};
player.rockets = Object.fromEntries(ROCKET_IDS.map((id) => [id, Math.max(0, Math.floor(Number(rk0[id] || 0)))]));
player.rocketActive = ROCKET_TYPES[String(u.rocketActive || "").toLowerCase()] ? String(u.rocketActive).toLowerCase() : "r310";
player.rocketAuto = u.rocketAuto === true;
player.launcherActive = ROCKET_TYPES[String(u.launcherActive || "").toLowerCase()] ? String(u.launcherActive).toLowerCase() : "eco10";
player.launcherAuto = u.launcherAuto === true;
rocketCooldown = 0;
launcherReloadT = 0;
launcherFullT = 0;
launcherPhase = "reload";
launcherPhaseT = 0;
    // Restaure la munition du dock rapide (sinon retour x1 au refresh).
    // setAmmo valide le stock et marque dirty uniquement si changement.
    setAmmo(String(u.ammoActive ?? u.ammo?.active ?? "x1").toLowerCase());
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

    // Whitelist : id portail/map limités à [A-Za-z0-9_-.], 64 chars max, map == carte courante.
    // Le point est requis : maps 1-4.1 / 2-4.1 / 3-4.1 / 4-4.123 + portails p_..._to_....
    const isSafeId = (v) => typeof v === "string" || typeof v === "number"
      ? /^[A-Za-z0-9_\-.]{1,64}$/.test(String(v))
      : false;
    // Candidats dans l'ordre : 1) switch interne (sessionStorage),
    // 2) rechargement via __GO_TO_MAP__ (?map=&spawn=, window.__SPAWN_PORTAL_ID__).
    // Le 2) couvrait un trou : l'URL portait le portail mais resetRun ne le lisait
    // jamais → spawn fallback faction (ex 1500/1500) au lieu du portail.
    let urlPortal = null;
    let urlMap = null;
    try {
      const params = new URLSearchParams(location.search);
      urlPortal = params.get("spawn") || window.__SPAWN_PORTAL_ID__ || null;
      urlMap = params.get("map") || null;
    } catch {}
    const candidates = [];
    if (wantPortal) candidates.push([wantPortal, wantMap]);
    if (urlPortal) candidates.push([urlPortal, urlMap || currentMap]);
    for (const [candPortal, candMap] of candidates) {
      if (!candPortal || !candMap) continue;
      if (!isSafeId(candPortal) || !isSafeId(candMap)) continue;
      if (String(candMap).toLowerCase() !== String(currentMap).toLowerCase()) continue;
      const ptl = zonePortals.find(p => String(p.id) === String(candPortal));
      if (!ptl) continue;
      player.x = clamp(ptl.x, 80, WORLD.w - 80);
      player.y = clamp(ptl.y, 80, WORLD.h - 80);
      spawnedFromPortal = true;
      break;
    }
    if (spawnedFromPortal) {
      // ✅ Son "Saut terminée" quand on apparaît de l'autre côté du portail
      window.setTimeout(() => {
        SFX.stop("swJump");
        SFX.stop("swReady");
        SFX.play("swDone");
      }, 400);
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
    } else {
      if (String(st.map) !== String(currentMap)) {
        player.x = clamp(fallbackSpawn.x, 80, WORLD.w - 80);
        player.y = clamp(fallbackSpawn.y, 80, WORLD.h - 80);
      } else if (st.pos && st.pos.x != null && st.pos.y != null) {
        player.x = clamp(st.pos.x, 80, WORLD.w - 80);
        player.y = clamp(st.pos.y, 80, WORLD.h - 80);
      } else {
        player.x = clamp(fallbackSpawn.x, 80, WORLD.w - 80);
        player.y = clamp(fallbackSpawn.y, 80, WORLD.h - 80);
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
        saveHangarStateById(SESSION_HANGAR_ID, player.x, player.y, currentMap, savedHpPct(), savedShPct());
      } else {
        saveActiveHangarState(player.x, player.y, currentMap, savedHpPct(), savedShPct());
      }
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
  laserCombatInRange = null;
  escapeWatch = null;
  player.dead = true;
  player.vx = player.vy = 0;
  radiationSoundDelay = 0;
  triggerDeathShake();

  // Coupe immédiatement l'effet de radiation (son, glow rouge + texte pulsé) à la mort.
  radiationSystem.reset();
  radiationActive = false;
  SFX.stopLoop("radiationLoop", { fadeOut: 0 });
  repairSoundActive = false;
  SFX.stop("repairStart");
  SFX.stopLoop("repairLoop", { fadeOut: 0 });
  shipMoveSoundActive = false;
  SFX.stopLoop("shipMove", { fadeOut: 0 });
  if (toast?.fixed && toast.text === "Vous êtes en zone de radiations") toast = null;
  clearPendingSalvo();

  SFX.crossfade("deathPlayer", "deathPlayer2", { crossAt: 0.2 });

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

  // ✅ on ne sauvegarde jamais la position/vitalité au moment de la mort :
  // sinon un refresh après une mort réapparaissait sur le lieu exact avec
  // ~0 PV. On garde la dernière sauvegarde « en vie ».
  // L'état « mort » lui est mémorisé séparément (sessionStorage) pour être
  // rejoué si le joueur refresh avant d'avoir choisi un lieu de réapparition.
  markDeathPending();

  if (rules?.mode === "gate") {
    setCenterMsg(false);
    showRespawnOverlay(false);
    respawnBaseGate();
    return;
  }

  if (isZoneMap) {
    startDeathSequence();
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
  clearDeathPending();
  SFX.resume();
  const targetMap = getFactionRespawnMap((account.user || getCurrentUserFull())?.faction, window.__CURRENT_MAP_ID__, { gate: true });
  const baseSpawn = getFactionBaseSpawn((account.user || getCurrentUserFull())?.faction);
  setRespawnOverride({ map: targetMap, baseCenter: true, fallback: baseSpawn, respawn: true });
  SFX.stop("deathPlayer");
  SFX.stop("deathPlayer2");
  SFX.play("respawnPlayer");
  startRespawnInstaShield();
  player.portalLockT = Math.max(player.portalLockT || 0, 5);

  const cur = window.__CURRENT_MAP_ID__ || "1-1";

  if (typeof window.__GO_TO_MAP__ === "function" && String(cur) !== targetMap) {
    window.__GO_TO_MAP__(targetMap);
    return;
  }

  resetRun({ randomSpawn: false });
}

// À la réapparition choisie, le menu et le voile noir disparaissent instantanément,
// le son de réapparition joue, puis le respawn s'enchaîne directement.
function startRespawn(action) {
  clearDeathPending();
  SFX.resume();
  SFX.stop("deathPlayer");
  SFX.stop("deathPlayer2");
  SFX.play("respawnPlayer");
  if (toast?.fixed && toast.text === "Vous êtes en zone de radiations") toast = null;
  showRespawnOverlay(false);
  setCenterMsg(false);
  action();
  startRespawnInstaShield();
  // ✅ le portail reste bloqué 5 s à partir du moment où le vaisseau réapparaît vraiment
  player.portalLockT = Math.max(player.portalLockT || 0, 5);
}

function respawnBase() {
  const targetMap = getFactionRespawnMap((account.user || getCurrentUserFull())?.faction, lastDeathPos.map || window.__CURRENT_MAP_ID__);
  const baseSpawn = getFactionBaseSpawn((account.user || getCurrentUserFull())?.faction);
  setRespawnOverride({ map: targetMap, baseCenter: true, fallback: baseSpawn, respawn: true });
  startRespawn(() => {
    const cur = window.__CURRENT_MAP_ID__ || "1-1";
    if (typeof window.__GO_TO_MAP__ === "function" && String(cur) !== targetMap) {
      window.__GO_TO_MAP__(targetMap);
      return;
    }

    resetRun({ randomSpawn: false });
  });
}

function respawnNearestPortal() {
  const curMap = window.__CURRENT_MAP_ID__ || "1-1";

  const p = getNearestPortalTo(lastDeathPos.x, lastDeathPos.y);
  if (!p) {
    respawnBase();
    return;
  }

  setRespawnOverride({ map: curMap, x: p.x, y: p.y, respawn: true });
  startRespawn(() => {
    resetRun({ randomSpawn: false });
  });
}

function respawnHere() {
  const curMap = window.__CURRENT_MAP_ID__ || "1-1";

  setRespawnOverride({
    map: curMap,
    x: lastDeathPos.x,
    y: lastDeathPos.y,
    respawn: true,
  });

  startRespawn(() => {
    resetRun({ randomSpawn: false });
  });
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
  const idx = getPlayerSpriteFrame();
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

function getEnemySpriteFrame(e, cfg, sp) {
  return getNpcSpriteFrame(e, cfg, angleToFrameIndex);
}

function drawEnemyBody(e, exactFrame = null) {
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

  const idx = exactFrame ?? getEnemySpriteFrame(e, cfg, sp);
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

// Ubers pirates (5-2) : anneau rouge pulsé tout autour pour les repérer.
const UBER_PIRATE_GLOW = new Set([
  "npc_Uber_Interceptor",
  "npc_Uber_Barracuda",
  "npc_Uber_Saboteur",
  "npc_Uber_Annihilator",
]);

function drawUberPirateGlow(e) {
  if (!UBER_PIRATE_GLOW.has(String(e?.type || ""))) return;
  if ((e.hp || 0) <= 0) return;
  const now = performance.now() * 0.001;
  const radius = Math.max(24, Number(e.r) || 24);
  const pulse = 0.65 + Math.sin(now * 4) * 0.2;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.strokeStyle = `rgba(255,45,60,${pulse})`;
  ctx.lineWidth = 4;
  ctx.shadowColor = "rgba(255,30,45,1)";
  ctx.shadowBlur = 18;
  ctx.beginPath();
  ctx.arc(0, 0, radius + 10, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, radius + 18, -now * 1.2, -now * 1.2 + Math.PI * 1.5);
  ctx.stroke();
  ctx.restore();
}

function drawRocketDebuffEffect(e) {  const slowed = (e.rocketSlowT || 0) > 0;
  const disrupted = (e.rocketAccuracyT || 0) > 0;
  const frozen = (e.freezeT || 0) > 0;
  if (!slowed && !disrupted && !frozen) return;

  const now = performance.now() * 0.001;
  const radius = Math.max(24, Number(e.r) || 24);
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  if (frozen) {
    const pulse = 0.7 + Math.sin(now * 5) * 0.2;
    ctx.strokeStyle = `rgba(150,230,255,${pulse})`;
    ctx.lineWidth = 4;
    ctx.shadowColor = "rgba(150,230,255,1)";
    ctx.shadowBlur = 16;
    ctx.beginPath();
    ctx.arc(0, 0, radius + 10, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, radius + 18, now * 1.5, now * 1.5 + Math.PI * 1.5);
    ctx.stroke();
  }
  if (slowed) {
    const pulse = 0.75 + Math.sin(now * 7) * 0.15;
    ctx.strokeStyle = `rgba(70,220,255,${pulse})`;
    ctx.lineWidth = 3;
    ctx.shadowColor = "rgba(70,220,255,0.95)";
    ctx.shadowBlur = 14;
    for (let i = 0; i < 3; i++) {
      const direction = i % 2 ? -1 : 1;
      const start = now * direction + i;
      ctx.beginPath();
      ctx.arc(0, 0, radius + 7 + i * 6, start, start + Math.PI * 1.25);
      ctx.stroke();
    }
  }
  if (disrupted) {
    ctx.rotate(now * 2.8);
    ctx.strokeStyle = "rgba(205,95,255,0.92)";
    ctx.lineWidth = 2.5;
    ctx.shadowColor = "rgba(205,95,255,1)";
    ctx.shadowBlur = 12;
    const arm = radius + 15;
    for (let i = 0; i < 4; i++) {
      ctx.rotate(Math.PI / 2);
      ctx.beginPath();
      ctx.moveTo(arm - 9, -7);
      ctx.lineTo(arm, -7);
      ctx.lineTo(arm, 7);
      ctx.lineTo(arm - 9, 7);
      ctx.stroke();
    }
  }
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
  CENTRE_MMO: { src: "ASSETS/MMO/CENTRE.png" },
  BEACON_MMO: { src: "ASSETS/MMO/BEACON.png" },
  QUEST_MMO: { src: "ASSETS/MMO/QUEST.png" },

  CENTRE_EIC: { src: "ASSETS/EIC/CENTRE.png" },
  BEACON_EIC: { src: "ASSETS/EIC/BEACON.png" },
  QUEST_EIC: { src: "ASSETS/EIC/QUEST.png" },

  CENTRE_VRU: { src: "ASSETS/VRU/CENTRE.png" },
  BEACON_VRU: { src: "ASSETS/VRU/BEACON.png" },
  QUEST_VRU: { src: "ASSETS/VRU/QUEST.png" },

  CENTRE_PIRATE: { src: "ASSETS/PIRATES/CENTRE.png" },
};

function preloadSafeModuleSprites(sectorRules, world) {
  if (sectorRules?.mode !== "zone" || typeof sectorRules.getZoneSafeModules !== "function") return [];
  const safe = sectorRules.getZoneSafeModules(world);
  const sources = new Set();
  for (const module of safe?.modules || []) {
    const sprite = SAFE_MODULE_SPR[module.spr];
    if (sprite?.src) sources.add(sprite.src);
  }
  for (const beacon of safe?.beacons || []) {
    const sprite = SAFE_MODULE_SPR[beacon.spr] || SAFE_MODULE_SPR.BEACON_MMO;
    if (sprite?.src) sources.add(sprite.src);
  }
  return [...sources].map(src => loadImage(src, { priority: true }));
}

for (const state of Object.values(QUEST_BUTTON).filter(value => value?.src)) {
  loadImage(state.src, { priority: true });
}

function startGatePortalJump(ptl, action) {
  if (!ptl || ptl.jumping || !isPlayerNearPortal(ptl)) return;
  if (beginGatePortalJump(ptl, action, portal.switchDur)) {
    // Marque le progrès avant le saut : saveStateImmediate() le persistera
    // pendant le préchargement, freeze masqué par l'animation de saut.
    markProgressDirty();
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

function getDroneFormationOffsets(count, formationId) {
  const n = Math.max(0, Math.floor(Number(count) || 0));
  if (!n) return [];
  const reference = DRONE_FORMATION_POSITIONS[formationId] || DRONE_FORMATION_POSITIONS.standard;
  return Array.from({ length: n }, (_, index) => ({ ...reference[index % reference.length] }));
}
const droneVisualStates = new Map();

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
  // La formation utilise le cap quantifie de la frame actuellement affichee.
  const shipFrame = getPlayerSpriteFrame();
  const shipHeading = shipEngine.heading(player, ACTIVE_SHIP, shipFrame);
  const formationAngle = shipHeading + Math.PI;
  const ca = Math.cos(formationAngle), sa = Math.sin(formationAngle);
  // L'atlas progresse dans le sens opposé : cet index correspond à la
  // rotation visuelle demandée de 90° vers la droite.
  const shipFrameCount = Math.max(1, Number(ACTIVE_SHIP?.frames) || playerImgs.length || 1);
  const directionalShipFrame = shipFrameCount === 33
    ? shipFrame % 32
    : Math.floor(shipFrame * 32 / shipFrameCount) % 32;
  const frame = directionalShipFrame + 1;
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
  if (!GAME_SETTINGS.moveMarker) return;
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
  return Math.round(clamp(1 - rsbLikeCooldown("x6") / RSB_COOLDOWN, 0, 1) * 100);
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
          ownerId: e.id,
          miss: Math.random() < Math.min(1, NPC_SHOT_RULES.missChance
            + ((e.rocketAccuracyT || 0) > 0 ? Number(e.rocketAccuracyPenaltyPct || 0) / 100 : 0)),
          hitRadiusBonus: NPC_SHOT_RULES.hitRadiusBonus,
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
    const accuracyPenalty = (e.rocketAccuracyT || 0) > 0 ? Number(e.rocketAccuracyPenaltyPct || 0) / 100 : 0;
    const willMiss = Math.random() < Math.min(1, NPC_SHOT_RULES.missChance + accuracyPenalty);

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
      homing: NPC_SHOT_RULES.homing,
      ownerId: e.id,
      miss: willMiss,
      hitRadiusBonus: NPC_SHOT_RULES.hitRadiusBonus,
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

  const spd = npcEffectiveSpeed(e);

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
  updateShipEngineFx(dt);
  rebuildEnemyIndex();
  player.combatT = Math.max(0, (player.combatT || 0) - dt);
  player.attackedT = Math.max(0, (player.attackedT || 0) - dt);
  player.pvpAttackT = Math.max(0, (player.pvpAttackT || 0) - dt);
  player.invincibleT = Math.max(0, (player.invincibleT || 0) - dt);
  player.portalLockT = Math.max(0, (player.portalLockT || 0) - dt);

  fireCooldown = Math.max(0, fireCooldown - dt);
  laserCd = Math.max(0, laserCd - dt);
  rsbCooldown = Math.max(0, rsbCooldown - dt);
  rcbCooldown = Math.max(0, rcbCooldown - dt);
  const rocketWasCooling = rocketCooldown > 0;
  rocketCooldown = Math.max(0, rocketCooldown - dt);
  // Fin de recharge roquette : rafraîchir le bouton une fois.
  if (rocketWasCooling && rocketCooldown <= 0) updateAmmoUI();
  // Chargeur lance-roquettes : refresh à chaque carré gagné/perdu.
  if (started && !player.dead) {
    const before = launcherLitNow();
    tickLauncherCharger(dt);
    if (launcherLitNow() !== before) updateAmmoUI();
  }
  pulseCd = Math.max(0, pulseCd - dt);
  ishCd = Math.max(0, ishCd - dt);

  if (account.user && account.dirty) {
    account.saveCd -= dt;
    if (account.saveCd <= 0) scheduleProgressSave();
  }

  tickAutoAttack(dt);
  tickAutoRockets();
  tickVolleyFloats(dt);
  tickExplosions(dt);
  tickShipDamages(dt);
  tickPulseFx(dt);
  tickInstaShield(dt);

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

  updateShipMoveSound();
  tickPendingSalvo(dt);
  tickPendingEscortSalvo(dt);

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
  updatePet(dt);

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

      if (safeZoneActive) {
        showToastFixed("Zone de Non-Agression");
      } else if (toast?.fixed && toast.text === "Zone de Non-Agression") {
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
        else if (toast?.fixed && toast.text === "Zone de Non-Agression") clearToastFixed();
      } else {
        safeZoneActive = false;
        if (toast?.fixed && toast.text === "Zone de Non-Agression") clearToastFixed();
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
    if (toast?.fixed && toast.text === "Zone de Non-Agression") clearToastFixed();
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
    if (b.sabReverse) {
      // ✅ SAB inversé : poursuit le JOUEUR (absorption), pas la cible.
      if (player.dead || (player.hp || 0) <= 0) {
        removeProjectile(bullets, i);
        cleanupPlayerMissVolley(b);
        continue;
      }
      const pdx = player.x - b.x, pdy = player.y - b.y;
      const pd = Math.hypot(pdx, pdy) || 1;
      const pspd = Math.max(120, Number(b.spd) || Math.hypot(b.vx, b.vy) || 120);
      b.vx = (pdx / pd) * pspd;
      b.vy = (pdy / pd) * pspd;
    } else {
    const dx = t.x - b.x;
    const dy = t.y - b.y;
    const distance = Math.hypot(dx, dy) || 1;
    const baseSpeed = Math.max(120, Number(b.spd) || Math.hypot(b.vx, b.vy) || 120);
    const targetSpeed = Math.hypot(Number(t.vx) || 0, Number(t.vy) || 0);
    const chaseSpeed = Math.max(baseSpeed, targetSpeed + baseSpeed);
    b.vx = dx / distance * chaseSpeed;
    b.vy = dy / distance * chaseSpeed;
    if (b.isRocket) {
      // Arc en C : échelle ABSOLUE (impulsion initiale × extinction temps
      // × fade de la distance restante) : poursuite pure en finale,
      // pas de dépassement, pas d'orbite autour de la cible.
      b.arcT = (b.arcT || 0) + dt;
      // Fade quadratique : l'arc meurt vite en finale (jamais de tour complet).
      const fade = Math.min(1, distance / Math.max(1, b.arcDist0 || 1));
      const kickNow = (b.arcKick0 || 0) * Math.pow(0.5, b.arcT * chaseSpeed / 1500) * fade * fade;
      const nx = dx / distance, ny = dy / distance;
      if (b.isLauncherRocket) {
        const guided = guideLauncherRocketVelocity({
          dx,
          dy,
          speed: chaseSpeed,
          lateralKick: kickNow,
          hitRadius: (t.r || 18) + (b.r || 6),
        });
        // La salve se détache du vaisseau : bref départ latéral, puis raccord
        // progressif vers l'arc guidé sans excursion démesurée.
        b.launcherDepartureT = (b.launcherDepartureT || 0) + dt;
        const returnProgress = (b.launcherDepartureT - 0.08) / 0.28;
        const departure = blendVelocityDirection(
          b.launcherDepartureX,
          b.launcherDepartureY,
          guided.vx,
          guided.vy,
          returnProgress,
          chaseSpeed,
        );
        b.vx = departure.vx;
        b.vy = departure.vy;
      } else {
        // Les roquettes normales conservent exactement leur arc historique.
        b.vx += -ny * kickNow;
        b.vy += nx * kickNow;
        const sp = Math.hypot(b.vx, b.vy) || 1;
        b.vx = b.vx / sp * chaseSpeed;
        b.vy = b.vy / sp * chaseSpeed;
      }
      // Fumée arc-en-ciel + filet : densité au mètre (tous les 12 px),
      // constante à toute vitesse — couvre tout le vol même à 3 s.
      const lastPt = b.trail?.length ? b.trail[b.trail.length - 1] : null;
      const stepMoved = lastPt ? Math.hypot(b.x - lastPt.x, b.y - lastPt.y) : 99;
      b.smokeDist = (b.smokeDist || 0) + stepMoved;
      if (b.smokeDist >= 12) {
        b.smokeDist = 0;
        b.smokeHue = ((b.smokeHue || 0) + 8) % 360;
        const smokeColor = b.isLauncherRocket
          ? "rgba(190,200,205,0.82)"
          : `hsla(${b.smokeHue},100%,65%,0.9)`;
        pushBounded(sparks, { x: b.x, y: b.y, t: 0, big: false, smoke: true, color: smokeColor }, ENTITY_LIMITS.sparks);
        b.trail ??= [];
        b.trail.push({ x: b.x, y: b.y, hue: b.smokeHue || 0, color: b.isLauncherRocket ? "rgba(205,215,220,0.9)" : null });
        if (b.trail.length > 110) b.trail.shift();
      }
      if (!b.trail?.length) {
        b.trail = [{ x: b.x, y: b.y, hue: b.smokeHue || 0, color: b.isRocket ? "rgba(205,215,220,0.9)" : null }];
      }
    }
    }
  }

  const expired = advanceProjectile(b, dt);

  if (b.sabReverse) {
    // ✅ SAB/CBO inversé : l'impact a lieu à l'ARRIVÉE AU VAISSEAU (absorption).
    // Le drain est prélevé sur la cible `t` (qui doit toujours exister).
    // CBO = dégâts normaux (×3 déjà dans b.dmg) + vol de bouclier ×1 ;
    // SAB = drain pur, zéro dégât coque.
    const pr = (player.r || 20) + (b.r || 6);
    if (segCircleHit(b._oldX, b._oldY, b.x, b.y, player.x, player.y, pr)) {
      if (b.miss) {
        // ✅ SAB inversé : aucun son d'impact/d'absorption (même en MISS).
        showPlayerMissOnce(b, t);
        spawnSpark(b.x, b.y, false);
        removeProjectile(bullets, i);
        cleanupPlayerMissVolley(b);
        continue;
      }
      const sabRecipient = b.ownerEscortId ? getEscortById(b.ownerEscortId) : player;
      let out = { total: 0 };
      if (!b.visual) {
        if (b.key === "cbo") {
          out = damageEnemy(t, b.dmg);
          if (t.hp > 0) {
            const leech = drainShieldFromEnemy(t, b.dmg / 3, sabRecipient);
            out.total += leech.total || 0;
            out.sh += leech.sh || 0;
          }
        } else {
          out = drainShieldFromEnemy(t, b.dmg, sabRecipient);
        }
      }
      if (out.total > 0) {
        queueVolleyFloat(t, out, b.volleyId, 1, VOLLEY_FLOAT_TIMEOUT);
      } else if (!b.visual) {
        showSabZeroOnce(b, t);
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
    continue;
  }

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
    let launcherImpact = null;
    if (b.isLauncherRocket && !b.visual) {
      launcherImpact = registerLauncherRocketImpact(b);
      if (!launcherImpact.final) {
        if (b.miss && !b.ownerEscortId) playPlayerLaserHit();
        else if (!b.ownerEscortId) playRocketImpactStaggered(b.volleyId);
        spawnSpark(b.x, b.y, false);
        removeProjectile(bullets, i);
        cleanupPlayerMissVolley(b);
        continue;
      }
    }

    if (b.miss) {
      // ✅ MISS : le tir "touche" mais ne tue pas → son laser hit
      // (jamais pour les escortes : impacts silencieux).
      if (!b.visual && !b.ownerEscortId) playPlayerLaserHit();

      showPlayerMissOnce(b, t);

      spawnSpark(b.x, b.y, false);
      removeProjectile(bullets, i);
      cleanupPlayerMissVolley(b);
      continue;
    }

    const sabRecipient = b.ownerEscortId === "pet"
      ? player
      : b.ownerEscortId ? getEscortById(b.ownerEscortId) : player;
    // ✅ les éclairs visuels de la salve X6 n'infligent aucun dégât
    let out = { total: 0 };
    if (!b.visual) {
      out = b.isSab
        ? drainShieldFromEnemy(t, b.dmg, sabRecipient)
          : b.isRocket
            ? b.isLauncherRocket
              ? applyRocketVolleyHit(t, b, launcherImpact?.count || b.volleySize, sabRecipient)
              : applyRocketHit(t, b, sabRecipient)
            : damageEnemy(t, b.dmg, undefined, (!b.ownerEscortId ? { chance: player.critChance, mult: player.critMult } : undefined));

      // ✅ CBO-100 (joueur) : dégâts normaux + vol de bouclier ×1, comme SAB.
      if (!b.isRocket && !b.isSab && b.key === "cbo" && t.hp > 0) {
        const leech = drainShieldFromEnemy(t, b.dmg / 3, sabRecipient);
        out.total += leech.total || 0;
        out.sh += leech.sh || 0;
      }
      // ✅ PIB-100 (joueur) : infecte la cible (vitesse −10 % pendant 15 s).
      if (!b.isRocket && !b.isSab && b.key === "pib" && t.hp > 0) {
        t.rocketSlowPct = Math.max(Number(t.rocketSlowPct || 0), 10);
        t.rocketSlowT = Math.max(Number(t.rocketSlowT || 0), 15);
      }

      if (b.isRocket && (b.rocketEffect?.slowPct || b.rocketEffect?.accuracyPenaltyPct || b.rocketEffect?.freezeSec)) {
        showRocketEffectHitOnce(b, t);
      }

      // Son d'impact : lasers = silencieux ; roquettes = 1 son chacune,
      // décalés de 100 ms dans une salve (pas 5 en même temps).
      if (t.hp > 0 && b.isRocket && !b.ownerEscortId) {
        playRocketImpactStaggered(b.volleyId);
      }
    }

    if (out.total > 0) {
      if (!b.ownerEscortId) notePetPlayerDamage(t);
      if (!b.ownerEscortId || Target.get() === t) {
        queueVolleyFloat(t, out, b.volleyId, b.isLauncherRocket ? 1 : b.volleySize, b.isLauncherRocket ? 1.5 : VOLLEY_FLOAT_TIMEOUT);
      }
    } else if (b.isSab && !b.visual) {
      showSabZeroOnce(b, t);
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

  // ✅ Dès que le tir NPC entre dans le rond imaginaire (même un miss),
  // on joue le sprite Ship_damage, face au projectile.
  if (bulletTarget === player && !b._bubblePlayed) {
    const rad = shipDamageBubbleRadius();
    if (segCircleHit(b._oldX, b._oldY, b.x, b.y, player.x, player.y, rad)) {
      b._bubblePlayed = true;
      spawnShipDamage(b._oldX, b._oldY);
    }
  }

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
        if (bulletTarget === player) {
          // (sprite déjà joué à l'entrée du rond) ; secours si le tir est
          // né déjà dans le cercle (pas de détection de franchissement)
          if (!b._bubblePlayed) {
            b._bubblePlayed = true;
            spawnShipDamage(b.x, b.y);
          }
          hurtPlayer(b.dmg);
          // Dégâts réellement reçus → le P.E.T pourra riposter sur ce NPC.
          if (b.ownerId != null) {
            notePetAttacker(enemies.find((x) => x?.id === b.ownerId) || null);
          }
        }
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

  tickLifetimeItems(sparks, dt, (s) => (s.smoke ? 1 : 0.25));
  tickFloatingTexts(floatTexts, dt);
  attractPickups(pickups, player, dt, pickup => {
    player.credits += pickup.credits || 0;
    markProgressDirty();
  });

  separateNpcEntities(enemies, dt, WORLD, isZoneMap);
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
      const n = e._pendingSpawn || 20;
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

      if (e._sinceHit >= CUBIKON_RESET.idleDelay) {
        e._resetting = true;

        const hpHeal = e.hpMax * CUBIKON_RESET.healPct * dt;
        e.hp = Math.min(e.hpMax, e.hp + hpHeal);

        if ((e.shMax || 0) > 0) {
          const shHeal = e.shMax * CUBIKON_RESET.shHealPct * dt;
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
                CUBIKON_RESET.minionDespawnMin +
                Math.random() * (CUBIKON_RESET.minionDespawnMax - CUBIKON_RESET.minionDespawnMin);
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

    if (e.type === "npc_Protegit" && e._cubikonDeathDecayActive) {
      e.hp = Math.max(0, e.hp - (e._cubikonDeathDecay || 0) * dt);
      if (e.hp <= 0) {
        e.hp = 0;
        e.sh = 0;
        e.suppressDeathExplosion = false;
        continue;
      }

      if (e._cubikonDeathFlee) {
        e._cubikonDeathFleeT = Math.max(0, (e._cubikonDeathFleeT || 0) - dt);
        e.x = clamp(e.x + e.vx * dt, e.r, WORLD.w - e.r);
        e.y = clamp(e.y + e.vy * dt, e.r, WORLD.h - e.r);
        if (e._cubikonDeathFleeT <= 0) {
          e._cubikonDeathFlee = false;
          e.vx = 0;
          e.vy = 0;
          e.wanderMode = true;
          if (e.aiZ) e.aiZ.state = "wander";
        }
        continue;
      }
    }

    e.empT = Math.max(0, (e.empT || 0) - dt);
    const emp = (e.empT || 0) > 0;

    e.rocketSlowT = Math.max(0, (e.rocketSlowT || 0) - dt);
    if (e.rocketSlowT <= 0) e.rocketSlowPct = 0;
    e.rocketAccuracyT = Math.max(0, (e.rocketAccuracyT || 0) - dt);
    if (e.rocketAccuracyT <= 0) e.rocketAccuracyPenaltyPct = 0;

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

            const spdE = npcEffectiveSpeed(e);
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
            const mv = computeNpcCombatMovement(e, d, nx, ny, e.aiZ, dt);
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

        const spdE = npcEffectiveSpeed(e);
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
            notePetAttacker(e);
            e.hp = 0;
            e.sh = 0;
          }
        }

        continue;
      } else {
               if (!e.ai) e.ai = {};

        const mv = computeNpcCombatMovement(e, d, nx, ny, e.ai, dt);

        let mxv = mv.mxv;
        let myv = mv.myv;

        const spdE = npcEffectiveSpeed(e);

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
        notePetAttacker(e);

        e.hp = 0;
        e.sh = 0;
      }
    }
  }

  tickEngineTrails(dt);
  processDeaths();

  tickCamShake(dt);

  camera.x += (player.x - camera.x) * (1 - Math.pow(0.0009, dt * 60));
  camera.y += (player.y - camera.y) * (1 - Math.pow(0.0009, dt * 60));

  keyboard.endFrame();
}

// ============================================================
// Render
// ============================================================
const WALL_TEX = {
  src: "ASSETS/UI/BLOCKZONE.png",
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

  let ox = innerWidth / 2 - camera.x;
  let oy = innerHeight / 2 - camera.y;

  if (camShake) {
    const p = camShake.t / camShake.dur;
    const amp = camShake.max * Math.pow(1 - p, 3);
    if (amp > 0.1) {
      ox += (Math.random() * 2 - 1) * amp;
      oy += (Math.random() * 2 - 1) * amp;
    }
  }

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
  drawPet(ox, oy);

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

    const enemyConfig = NPC_TYPES[e.type];
    const enemySpriteFrame = enemyConfig?.sprite ? getEnemySpriteFrame(e, enemyConfig, enemyConfig.sprite) : 0;
    drawEnemyBody(e, enemySpriteFrame);
    if (GAME_SETTINGS.shipSmoke) npcEngine.draw(ctx, e, enemyConfig, isImgReady, enemySpriteFrame);
    drawUberPirateGlow(e);
    drawRocketDebuffEffect(e);

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
    // Filet fin derrière les roquettes : gris pour le lanceur, arc-en-ciel
    // pour les roquettes normales.
    if (b.isRocket && b.trail?.length > 1) {
      ctx.save();
      ctx.lineWidth = 1;
      ctx.lineCap = "round";
      for (let i = 1; i < b.trail.length; i++) {
        const p0 = b.trail[i - 1], p1 = b.trail[i];
        ctx.globalAlpha = 0.75 * (i / b.trail.length);
        ctx.strokeStyle = p1.color || `hsla(${p1.hue || 0},100%,62%,1)`;
        ctx.beginPath();
        ctx.moveTo(p0.x + ox, p0.y + oy);
        ctx.lineTo(p1.x + ox, p1.y + oy);
        ctx.stroke();
      }
      ctx.restore();
      ctx.globalAlpha = 1;
    }
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
    const lifeSpan = s.smoke ? 1 : 0.25;
    const a = 1 - clamp(s.t / lifeSpan, 0, 1);
    ctx.globalAlpha = a * (s.smoke ? 0.55 : 0.8);
    ctx.fillStyle = s.color || "rgba(255,210,122,0.9)";
    ctx.beginPath();
    ctx.arc(x, y, (s.big ? 26 : s.smoke ? 2.5 : 14) * (1 - a * 0.2), 0, TAU);
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

    // Comme dans le client officiel, la flamme recouvre sa sortie de réacteur.
    drawShipEngineFx();

    // ✅ FX réparation par-dessus le vaisseau
    drawRepairOrbitFxLocal();

    // ✅ Éclairs verts des 4 coins vers le vaisseau (pendant la réparation)
    drawRepairBolts();

    // ✅ Insta shield : au-dessus du vaisseau et de tout autre effet (3 s)
    drawInstaShield();

    ctx.restore();
    ctx.globalAlpha = 1;
  }

  // ✅ bubble d'impact PAR-DESSUS le vaisseau : elle reste visible même si
  // le point d'impact est sur la silhouette du vaisseau.
  drawShipDamages(ox, oy);

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
}

updateConfigButtons();

  updateResourceHud(ui, player);
  updatePetHud();
  updateWaveHud(ui, { started, wave, remaining: waveSpawns.remaining, alive: enemies.length });

  setHudText(ui.shopCredits, formatInteger(player.credits));

  updateSkillUI();
  updateRepairUI();

  // IEM : pas de % qui remonte, la progression est montrée par le voile
  // circulaire du dock (voir syncActionDockState). Ici on affiche le temps
  // restant pendant la recharge, "PRÊT" une fois disponible.
  setHudText(ui.pulsePct, pulseCd > 0 ? `${pulseCd.toFixed(1)}s` : "PRÊT");

  if (ui.pulsePrice) {
    setHudText(ui.pulsePrice, pulseCd > 0 ? "" : "30k");
  }

  // ISH : même affichage que l'IEM (temps restant / PRÊT + prix).
  setHudText(ui.ishPct, ishCd > 0 ? `${ishCd.toFixed(1)}s` : "PRÊT");

  if (ui.ishPrice) {
    setHudText(ui.ishPrice, ishCd > 0 ? "" : "30k");
  }

  const rsbPct = getRsbPercent();
  setHudText(ui.cntX6, `${formatInteger(player.ammo.x6)} • ${rsbPct}%`);
  setHudClass(ui.btnX6, "ready",
    started && !player.dead && ammoCount("x6") > 0 && rsbLikeCooldown("x6") <= 0
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

async function prepareGameAssets() {
  if (assetsPrepared) return;
  if (ui.loadingOverlay) ui.loadingOverlay.style.display = "block";
  if (ui.loadingStatus) ui.loadingStatus.textContent = "Chargement du secteur actuel…";
  const stopProgress = IMG.onProgress(({ total, done }) => {
    const percent = total ? Math.round(done / total * 100) : 0;
    if (ui.loadingBar) ui.loadingBar.style.width = `${percent}%`;
    if (ui.loadingCount) ui.loadingCount.textContent = `${done} / ${total} ressources du secteur`;
    if (ui.loadingPercent) ui.loadingPercent.textContent = `${percent} %`;
    ui.loadingOverlay?.querySelector(".loadingTrack")?.setAttribute("aria-valuenow", String(percent));
  });
  try {
    const jobs = [ensurePackLoaded(ACTIVE_SHIP), loadImage(WALL_TEX.src, { priority: true })];
    for (const layer of BG_LAYERS) if (layer.src) jobs.push(loadImage(layer.src, { priority: true }));
    jobs.push(...preloadPlayerBulletSprites());
    jobs.push(...preloadPetSprites());
    jobs.push(ensureLaserLoaded(), ensureExplosionLoaded(), ensurePulseFxLoaded(),
      ensureRepairOrbitLoaded(), ensureShipDamageLoaded(), ensureInstaShieldLoaded());
    jobs.push(...preloadCollectables());
    jobs.push(...preloadSafeModuleSprites(rules, WORLD));
    if (GAME_SETTINGS.shipEffect) {
      loadShipEffect(ACTIVE_SHIP.id);
      jobs.push(shipEffectPromise);
    }
    for (const type of npcTypesForCurrentSector()) {
      if (NPC_TYPES[type]) jobs.push(ensureNpcLoaded(type));
    }
    if (rules?.mode === "zone" && typeof rules.getZonePortals === "function") {
      for (const portal of rules.getZonePortals(WORLD) || []) jobs.push(...preloadPortalSprites(portal));
    } else {
      jobs.push(...preloadPortalSprites());
    }
    await Promise.allSettled(jobs);
    await IMG.whenIdle();
    assetsPrepared = true;
    playerImgs = ACTIVE_SHIP._imgs;
    playerImgsReady = true;
    if (ui.loadingStatus) ui.loadingStatus.textContent = "Secteur prêt.";
    if (ui.loadingStartBtn) {
      ui.loadingStartBtn.disabled = false;
      ui.loadingStartBtn.textContent = "DÉPART";
    }
    if (ui.loadingOverlay) ui.loadingOverlay.classList.add("isReady");
  } finally {
    stopProgress();
  }
  if (GAME_SETTINGS.autoStart) await startGame();
}

async function startGame() {
  if (starting || started) return;
  starting = true;

  SFX.preload();
  preloadPlayerBulletSprites();
  preloadPetSprites();
  ensureExplosionLoaded();
  ensureShipDamageLoaded();
  ensurePulseFxLoaded();
  ensureRepairOrbitLoaded();

  const u = getCurrentUserFull();
  if (u?.ship) {
    const found = getShipPackByIdData(u.ship);
    if (found) ACTIVE_SHIP = found;
  }

  if (!playerImgsReady) {
    await ensurePackLoaded(ACTIVE_SHIP);
    playerImgs = ACTIVE_SHIP._imgs;
    playerImgsReady = true;
  }

  started = true;

  // Musique lancée uniquement ici (clic DÉPART = geste utilisateur).
  try { startFactionMusic(); } catch {}

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

  // ✅ si le joueur a refreshé pendant sa mort (lieu de réapparition pas encore
  // choisi), on le garde mort et on rejoue l'animation + le son d'explosion.
  tryReplayPendingDeath();

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
let frameRequestId = 0;
let backgroundFrameTimer = 0;
let frameScheduleGeneration = 0;

function scheduleNextFrame() {
  const generation = frameScheduleGeneration;
  if (document.visibilityState === "hidden") {
    backgroundFrameTimer = setTimeout(() => {
      backgroundFrameTimer = 0;
      if (generation === frameScheduleGeneration) frame(performance.now());
    }, 33);
    return;
  }
  frameRequestId = requestAnimationFrame((t) => {
    frameRequestId = 0;
    if (generation === frameScheduleGeneration) frame(t);
  });
}

function restartFrameScheduler() {
  frameScheduleGeneration++;
  if (frameRequestId) cancelAnimationFrame(frameRequestId);
  if (backgroundFrameTimer) clearTimeout(backgroundFrameTimer);
  frameRequestId = 0;
  backgroundFrameTimer = 0;
  scheduleNextFrame();
}

function frame(t) {
  const realDt = Math.max(0, (t - last) / 1000);
  last = t;
  performanceMonitor.record(realDt);

  fpsAcc += realDt;
  fpsFrames++;
  if (fpsAcc >= 0.25) {
    fpsValue = Math.round(fpsFrames / fpsAcc);
    fpsAcc = 0;
    fpsFrames = 0;
  }

  try {
    // Les navigateurs ralentissent les timers des onglets masqués. Découper
    // le temps écoulé garde la simulation stable sans perdre cette durée.
    let remainingDt = Math.min(realDt, 1.25);
    do {
      const dt = Math.min(0.033, remainingDt);
      update(dt);
      remainingDt -= dt;
    } while (remainingDt > 0.0001);

    if (document.visibilityState !== "hidden") {
      draw();
      drawUI();
    }
  } catch (err) {
    console.error("CRASH:", err);
    started = false;
    setCenterMsg(true, "Erreur JS", "Ouvre la console (F12) et copie l'erreur <b>CRASH</b>.", "");
  }
  scheduleNextFrame();
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
    saveHangarStateById(SESSION_HANGAR_ID, player.x, player.y, currentMap, savedHpPct(), savedShPct());
  } else {
    saveActiveHangarState(player.x, player.y, currentMap, savedHpPct(), savedShPct());
  }

updateCurrentUserProgress({
  credits: player.credits,
  quests: questState,
  stats: { ...(account.user.stats || {}) },
  inventory: { resources: { ...(account.user.inventory?.resources || {}) } },
  drones: account.user.drones,
  pet: account.user.pet,

  // ⚠️ Ne surtout pas sauvegarder ship ici.
  // Le vaisseau actif est géré par setActiveHangar().
  ammo: {
    x1: Infinity,
    x2: player.ammo.x2 || 0,
    x3: player.ammo.x3 || 0,
    x4: player.ammo.x4 || 0,
    sab: player.ammo.sab || 0,
    x6: player.ammo.x6 || 0,
    rcb: player.ammo.rcb || 0,
    cbo: player.ammo.cbo || 0,
    job: player.ammo.job || 0,
    rb: player.ammo.rb || 0,
    pib: player.ammo.pib || 0,
    idb: player.ammo.idb || 0,
    vb: player.ammo.vb || 0,
    emaa: player.ammo.emaa || 0,
    sbl: player.ammo.sbl || 0,
    abl: player.ammo.abl || 0,
  },
  ammoActive: player.ammo.active || "x1",
  rockets: sanitizeRocketsForSave(),
  rocketActive: player.rocketActive || "r310",
  rocketAuto: player.rocketAuto === true,
  launcherActive: player.launcherActive || "eco10",
  launcherAuto: player.launcherAuto === true,
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
  jobs.push(...preloadCollectables(mapId));
  jobs.push(...preloadSafeModuleSprites(nextRules, nextWorld));
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
  // Pas de save synchrone à l'arrivée : la position d'avant-saut a déjà
  // été persistée par saveStateImmediate() avant la bascule (freeze masqué
  // par le chargement). On marque dirty, le prochain portail / quit / filet
  // 15s persistera la nouvelle map sans freeze visible.
  markProgressDirty();
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

// ✅ Échange dynamique du vaisseau actif (design modifié dans l'Espace pilote)
// sans recharger la page : on rafraîchit ACTIVE_SHIP, ses sprites et les stats.
function applyHangarDesignLive() {
  try {
    const u = loadAccountUser();
    const shipId = (u?.ship || ACTIVE_SHIP?.id || "PhoenixBleu");
    const pack = getShipPackById(shipId);
    if (!pack) return { ok: false, error: "Vaisseau introuvable." };

    ACTIVE_SHIP = pack;

    // recharge les sprites du nouveau modèle
    playerImgsReady = false;
    ensurePackLoaded(pack)
      .then(() => {
        playerImgs = pack._imgs;
        playerImgsReady = true;
      })
      .catch(() => {
        playerImgsReady = true;
      });

    // recalcule les stats (hp, bouclier, vitesse, dégâts…) en gardant les ratios
    applyCurrentConfigStats(true);

    updateResourceHud(ui, player);

    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  }
}

window.__ORBIT_ENGINE__ = {
  switchMap: switchMapConfig,
  getHangarAccess,
  markHangarChanged,
  applyHangarDesignLive,
  showToast,
  showNotification,
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
  restartFrameScheduler();
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
// Restaure la sélection persistée au boot sans marquer dirty
// (les stocks réels sont chargés au start ; un save ici écraserait tout).
{
  const bootUser = loadAccountUser();
  const bootAmmo = String(bootUser?.ammoActive ?? bootUser?.ammo?.active ?? "x1").toLowerCase();
  if (AMMO[bootAmmo]) player.ammo.active = bootAmmo;
  updateAmmoUI();
}

// ✅ le cooldown du robot réparateur repart de 0 au refresh
{
  player.repairT = 0;
  player.repairTickT = 0;
  player.repairColdStart = true;
}

// ✅ restaure la vitalité de la dernière session (refresh ne soigne plus)
{
  const restored = getActiveHangarState();
  if (player.hpMax > 0 && Number.isFinite(Number(restored?.hpPct))) {
    player.hp = Math.max(1, Math.floor(player.hpMax * clamp(Number(restored.hpPct), 0, 1)));
  }
  if (player.shMax > 0 && Number.isFinite(Number(restored?.shPct))) {
    player.sh = Math.max(0, Math.floor(player.shMax * clamp(Number(restored.shPct), 0, 1)));
  }
}

const cur = getCurrentUserFull() || null;

if (!cur) {
  location.href = "./PUBLIC/AUTH.html";
  return;
}

const currentGateMapId = String(window.__CURRENT_MAP_ID__ || "").toLowerCase();
if (rules?.mode === "gate" && GALAXY_GATE_DEFINITIONS[currentGateMapId] && cur.galaxyGates?.active !== currentGateMapId) {
  const homeMap = getFactionHomeMap(cur.faction);
  showToast("Galaxy Gate non construite", 1.5);
  window.__GO_TO_MAP__?.(homeMap);
  return;
}

const pack = getShipPackByIdData(cur.ship) || SHIP_PACKS[0];
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
scheduleNextFrame();

// ✅ Fenêtre P.E.T : ouverte d'office si le P.E.T est possédé et que le
// joueur n'a jamais touché à son état (choix ensuite respecté).
{
  let petTouched = null;
  try { petTouched = localStorage.getItem("orbit_hud_window_state:petWindow"); } catch {}
  if (cur.pet?.owned === true && petTouched === null) window.GameWindowManager?.restore("petWindow");
}

}
