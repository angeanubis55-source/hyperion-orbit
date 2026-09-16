import { petEscortTarget, stepPetMotion, petCombatVelocity, orientPet } from "../../PET/PET_MOTION.js";
import { measureGameTask } from "./PERFORMANCE_TIMINGS.js";
import { NpcEngine } from "../../NPC/NPC_ENGINE_RENDERER.js";
import { ShipEngine } from "../../SHIP/SHIP_ENGINE_RENDERER.js";
import { PetEngine } from "../../PET/PET_ENGINE_RENDERER.js";
import {
  PET_BUOY_COOLDOWN_SEC,
  PET_BUOY_DAMAGE_PCT,
  PET_BUOY_DURATION_SEC,
  PET_BUOY_HP_PCT,
  PET_BUOY_RADIUS,
  PET_GEAR_AUTOLOOT_TYPES,
  PET_GEAR_HPLINK_COOLDOWN_SEC,
  PET_GEAR_HPLINK_DURATION_SEC,
  PET_GEAR_ORE_TYPES,
  PET_GEAR_PICK_DELAY,
  PET_GEAR_TRADE_WINDOW_SEC,
  PET_SHIELD_REGEN_PCT_PER_SEC,
  listEquippedGearOptions,
  getPetEquippedGearLevels,
  getPetGearRange,
  getPetKamikazeCooldownSec,
  getPetKamikazeDamage,
  getPetKamikazeRadius,
  getPetRepairPct,
  getPetSacrificeCooldownSec,
  getPetTradeBonusPct,
  getPetTradeCooldownSec,
  pickNearestWithin,
} from "../../PET/PET_GEARS.js";
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
  refineCurrentUserOre,
  sellCurrentUserOre,
  exchangeCurrentUserPalladiumForEnergy,
  chargeShipUpgrade,
  setCurrentUserDroneFormation,
  getPetFit,
  getDroneFit,
  buyItem,
  setPetActive,
  setPetActiveGear,
  setPetMode,
  repairPet,
  activateCurrentUserBooster,
} from "./ACCOUNT.js";
import {
  GALAXY_GATE_BUILD_LIMIT,
  GALAXY_GATE_DEFINITIONS,
  GALAXY_SPIN_CREDIT_COST,
  normalizeGalaxyGateState,
} from "./GALAXY_GATES.js";
import { computeHangarStats } from "../../SHIP/SHIP_HANGARS.js";
import { resizeShield } from "./EQUIPMENT_SYNC.js";
import { findCatalogItem } from "./CATALOG.js";
import { activeBoosterMults, boosterTimeLeftMs, formatBoosterCountdown, formatBoosterDuration, BOOSTERS } from "../DATA/BOOSTERS.js";
import { CRAFTING_RECIPES, CRAFTING_ENABLED } from "../DATA/CRAFTING.js";
import { ITEM_RARITIES } from "../DATA/ITEM_RARITIES.js";
import { SHIP_EFFECTS } from "../../SHIP/SHIP_EFFECTS.js";
import { GAME_VERSION } from "../DATA/VERSION.js";
import { getShipPackById as getShipPackByIdData, getShipDesignBaseId } from "../../SHIP/SHIP_PACKS.js";
import { DRONE_FORMATIONS, DRONE_MAX_LEVEL, DRONE_TYPES, DRONE_XP_SHARE, formationDockIcon, getActiveDroneFormation, getDroneLevel, getDroneShopSpritePath, getDroneSpritePath, isClassicFormation } from "../../DRONE/DRONE_TYPES.js";
import { DRONE_FORMATION_POSITIONS } from "../../DRONE/DRONE_FORMATIONS.js";
import { PET_XP_SHARE, PET_FUEL_MAX, PET_FUEL_TICK_SEC, PET_FUEL_BASE_TICK, PET_FUEL_GEAR_TICK, PET_FUEL_ONESHOT, getPetDamageBonus, getPetHullBonusHp, getPetLevel, getPetLevelXp, getPetMaxHp, getPetNextLevelXp, getPetShieldBonus, getPetStage, getPetStageBase, normalizePetMode, PET_STAGE_DIRS, PET_SPRITE_FRAMES } from "../../PET/PET_TYPES.js";
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
import { loadNpcLocationIndex, loadPortalIndex } from "../../QUEST/QUEST_LOCATIONS.js";
import {
  drawMoveTargetMarker,
  drawNpcStatus,
  drawPlayerStatus,
  drawTargetLock,
  drawToastMessage,
} from "../../UI/UI_CANVAS_HUD.js";
import { renderMinimap } from "../../UI/UI_MINIMAP.js";
import { drawWallLayer } from "./WORLD_LAYER_RENDERER.js";
import { advancePlayerToTarget, attractPickups, playerSlowMult, tickFloatingTexts, tickLifetimeItems, updatePlayerVelocity } from "./FRAME_SYSTEMS.js";
import { calculateRankPoints, getLevelInfo, getNpcExperienceReward, getNpcHonorReward, getQuestExperienceReward, getQuestHonorReward, getRankInfo, grantExperience, grantHonor } from "./PROGRESSION.js";
import { formatInteger } from "./NUMBER_FORMAT.js";
import { escapeHtml } from "../../UI/UI_DOM.js";
import { wireWikiWindow } from "../../UI/UI_WIKI.js";
import { appendGameLog, readGameLogs } from "./GAME_LOG_STORE.js";
import { getFaction, getFactionBaseSpawn, getFactionHomeMap, getFactionRespawnMap, getFactionUpperBaseMap, normalizeFactionId, resolveBaseCenter } from "./FACTIONS.js";
import { checkMapAccess } from "./MAP_ACCESS.js";
import {
  QUEST_DEFINITIONS,
  MAX_ACTIVE_QUESTS,
  acceptQuest,
  abandonQuest,
  canAcceptQuest,
  claimQuest,
  getQuestObjectives,
  isQuestComplete,
  normalizeQuestState,
  recordQuestProgress,
} from "../../QUEST/QUEST_TYPES.js";
import {
  COLLECTABLE_SPAWN as DEFAULT_COLLECTABLE_SPAWN,
  COLLECTABLE_TYPES as DEFAULT_COLLECTABLE_TYPES,
} from "../DATA/COLLECTABLES.js";
import { getResourceName, getResourceIcon, isOreResource, cargoAdd, cargoUsed, CARGO_CAPACITY, REFINERY_RECIPES, refineOreOutput, ORE_SELL_PRICES, UPGRADE_SLOTS, UPGRADE_SLOT_ORES, UPGRADE_ORE_BONUS } from "../DATA/RESOURCES.js";
import { PALLADIUM_PER_GALAXY_ENERGY, palladiumExchangeForEnergy } from "./GALAXY_GATES.js";
import { getNpcCargoOres } from "../../NPC/NPC_CARGO.js";
import { rollNpcAssemblyBox, rollNpcAssemblyDirect } from "../../NPC/NPC_ASSEMBLY.js";
import { ROCKET_IDS, ROCKET_TYPES, getRocketType, rocketDockIcon, rocketFlightLife, rocketLaunchSpeed, rocketShopIcon } from "../../COMBAT/ROCKET_TYPES.js";
import { SFX_SOUND_NAMES } from "./SFX.js";
import { createWorldClock } from "../SIM/WORLD_CLOCK.js";
import {
  UNIVERSE_KEY,
  createUniverse,
  deserializeUniverse,
  ensureMapSlots,
  getSlot,
  markAlive,
  markDead,
  serializeUniverse,
  snapshotEnemy as snapshotUniverseEnemy,
  slotUid,
  tickBackground,
} from "../SIM/UNIVERSE_SIM.js";
import {
  COLLECTABLE_STORE_KEY,
  addCollectableDrop,
  countCollectableSlots,
  createCollectableStore,
  deserializeCollectableStore,
  dueCollectableSlots,
  ensureCollectableSlots,
  listCollectableDrops,
  listCollectableSlots,
  pruneExpiredDrops,
  removeCollectableDrop,
  reviveCollectableSlot,
  serializeCollectableStore,
  takeCollectableSlot,
} from "../SIM/COLLECTABLE_SIM.js";

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

// ✅ NPC vs radiation : nativement les NPC restent dans la map (0..WORLD).
// Ils ne peuvent suivre le joueur en zone de radiation que s'ils sont
// déjà aggro contre lui pendant que le joueur est dehors et vivant.
// Si le joueur sort de radiation ou meurt dedans, ils rentrent en map.
function isNpcOutsideWorld(e) {
  return e.x < 0 || e.x > WORLD.w || e.y < 0 || e.y > WORLD.h;
}

function npcCanEnterRadiation(e) {
  if (player.dead) return false;
  if (!playerIsOutsideWorld()) return false;
  return !!(e._aggro || e._attackedPlayerRecently);
}

function integrateNpcPosition(e, dt) {
  const r = e.r || 18;
  if (npcCanEnterRadiation(e)) {
    e.x = clamp(e.x + e.vx * dt, r - RADIATION_SPAWN_MARGIN, WORLD.w - r + RADIATION_SPAWN_MARGIN);
    e.y = clamp(e.y + e.vy * dt, r - RADIATION_SPAWN_MARGIN, WORLD.h - r + RADIATION_SPAWN_MARGIN);
    return;
  }
  if (isNpcOutsideWorld(e)) {
    if (player.dead) {
      e._aggro = false;
      e._aggroT = 0;
      e._attackedPlayerRecently = false;
      if (e.aiZ) e.aiZ.state = "wander";
      if (e.aiZ) {
        e.aiZ.wanderTarget = null;
        e.aiZ.wanderT = 0;
      }
    }
    const tx = clamp(e.x, r, WORLD.w - r);
    const ty = clamp(e.y, r, WORLD.h - r);
    const dx = tx - e.x;
    const dy = ty - e.y;
    const d = Math.hypot(dx, dy);
    if (d > 1) {
      const spd = npcEffectiveSpeed(e);
      setNpcVelocity(e, dx / d, dy / d, spd);
    }
    e.x = clamp(e.x + e.vx * dt, r - RADIATION_SPAWN_MARGIN, WORLD.w - r + RADIATION_SPAWN_MARGIN);
    e.y = clamp(e.y + e.vy * dt, r - RADIATION_SPAWN_MARGIN, WORLD.h - r + RADIATION_SPAWN_MARGIN);
    return;
  }
  e.x = clamp(e.x + e.vx * dt, r, WORLD.w - r);
  e.y = clamp(e.y + e.vy * dt, r, WORLD.h - r);
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
    // ✅ on attend la fin de la grâce avant de jouer le son de la zone de radiation
    // (reste de grâce si on revient d'un refresh, pas un nouveau 5 s).
    if (radiationSoundDelay <= 0 && !SFX.loops["radiationLoop"]) {
      const warning = Number(radiationSystem?.config?.warningDuration) || 5;
      radiationSoundDelay = Math.max(0, warning - (Number(radiationSystem.state.exposure) || 0));
      if (radiationSoundDelay <= 0) SFX.loop("radiationLoop", { fadeIn: 0.3 });
    }
    persistRadiationExposure();
  } else {
    if (toast?.fixed && toast.text === "Vous êtes en zone de radiations") {
      clearToastFixed();
    }
    radiationSoundDelay = 0;
    SFX.stopLoop("radiationLoop", { fadeOut: 0.7 });
    clearPersistedRadiationExposure();
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
  // Lien HP : la radiation aussi part sur le REX.
  const radRest = absorbPetLinkDamage(dmg);
  player.hp -= radRest;
  if (radRest > 0) {
    const shown = Math.max(1, Math.round(radRest));
    addPlayerCombatFloat(shown, "rgba(255,80,100,0.95)");
  }

  if (player.hp <= 0) {
    player.hp = 0;
    die();
  }
}

// ✅ Anti-abus refresh en radiation : l'exposition (temps déjà écoulé) survit
// au rechargement via sessionStorage. Sans ça, chaque refresh relançait les
// 5 s de grâce → boucle refresh = immortalité en radiation.
const RADIATION_EXPOSURE_KEY = "orbit_radiation_exposure";
const RADIATION_EXPOSURE_MAX_AGE_MS = 10 * 60 * 1000;
let lastRadiationPersistT = 0;

function persistRadiationExposure() {
  try {
    const now = Date.now();
    if (now - lastRadiationPersistT < 500) return;
    lastRadiationPersistT = now;
    sessionStorage.setItem(RADIATION_EXPOSURE_KEY, JSON.stringify({
      map: window.__CURRENT_MAP_ID__ || "1-1",
      exposure: Number(radiationSystem.state.exposure) || 0,
      tick: Number(radiationSystem.state.tickAccumulator) || 0,
      ts: now,
    }));
  } catch {}
}

function clearPersistedRadiationExposure() {
  lastRadiationPersistT = 0;
  try { sessionStorage.removeItem(RADIATION_EXPOSURE_KEY); } catch {}
}

// ✅ Au spawn : si on réapparaît dehors sur la même carte avec une exposition
// en cours, on reprend le temps déjà écoulé (le temps de chargement compte
// aussi, via ts). Si on spawn dedans ou sur une autre carte : reset.
function restorePersistedRadiationExposure() {
  let rec = null;
  try {
    const raw = sessionStorage.getItem(RADIATION_EXPOSURE_KEY);
    if (raw) rec = JSON.parse(raw);
  } catch { rec = null; }
  if (!rec) return;
  const currentMap = window.__CURRENT_MAP_ID__ || "1-1";
  if (String(rec.map || "") !== String(currentMap) || player.dead || !playerIsOutsideWorld()) {
    clearPersistedRadiationExposure();
    return;
  }
  const ageMs = Date.now() - (Number(rec.ts) || 0);
  if (!(ageMs >= 0) || ageMs > RADIATION_EXPOSURE_MAX_AGE_MS) {
    clearPersistedRadiationExposure();
    return;
  }
  const resumed = Math.max(0, (Number(rec.exposure) || 0) + ageMs / 1000);
  radiationSystem.state.exposure = resumed;
  radiationSystem.state.tickAccumulator = Math.max(0, Number(rec.tick) || 0);
  radiationSystem.state.active = true;
  const warning = Number(radiationSystem?.config?.warningDuration) || 5;
  if (resumed >= warning) radiationSystem.state.wasDamaging = true;
  lastRadiationPersistT = 0;
  persistRadiationExposure();
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
// Bande de radiations hors-carte (scaleDepth 2000 + marge) : les positions
// sauvegardees (refresh) et de mort peuvent legitimement s'y trouver, on ne
// les rabat au bord que bien au-dela.
const RADIATION_SPAWN_MARGIN = 2500;
function clampSpawnPos(x, y) {
  return {
    x: clamp(Number(x) || 0, -RADIATION_SPAWN_MARGIN, WORLD.w + RADIATION_SPAWN_MARGIN),
    y: clamp(Number(y) || 0, -RADIATION_SPAWN_MARGIN, WORLD.h + RADIATION_SPAWN_MARGIN),
  };
}
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
    const deathXY = clampSpawnPos(Number(rec.x) || player.x, Number(rec.y) || player.y);
    player.x = deathXY.x;
    player.y = deathXY.y;
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

// ✅ maps à réparation unique (retour base imposé) : Galaxy Gates + maps
// marquées rules.baseRespawnOnly (ex : carte maudite). Sans logique de vies GG.
function isBaseOnlyRespawnMap() {
  return rules?.mode === "gate" || rules?.baseRespawnOnly === true;
}

// ✅ Tarifs de réparation : base gratuite, portail 50k, sur place 75k.
// CD anti-spam : démarrent dès qu'on utilise l'option payante une fois.
const RESPAWN_PORTAL_COST = 50000;
const RESPAWN_HERE_COST = 75000;
const RESPAWN_PORTAL_CD_SEC = 60;
const RESPAWN_HERE_CD_SEC = 120;
const RESPAWN_CD_STORE_KEY = "hyperion_respawn_cd_v1";

function getRespawnCdStore() {
  try {
    const raw = localStorage.getItem(RESPAWN_CD_STORE_KEY);
    if (!raw) return { portalUntil: 0, hereUntil: 0 };
    const rec = JSON.parse(raw);
    return {
      portalUntil: Math.max(0, Number(rec?.portalUntil) || 0),
      hereUntil: Math.max(0, Number(rec?.hereUntil) || 0),
    };
  } catch {
    return { portalUntil: 0, hereUntil: 0 };
  }
}

function setRespawnCd(which, untilMs) {
  try {
    const store = getRespawnCdStore();
    if (which === "portal") store.portalUntil = Math.max(0, Number(untilMs) || 0);
    if (which === "here") store.hereUntil = Math.max(0, Number(untilMs) || 0);
    localStorage.setItem(RESPAWN_CD_STORE_KEY, JSON.stringify(store));
  } catch {}
}

function getRespawnCdLeft(which) {
  const store = getRespawnCdStore();
  const until = which === "portal" ? store.portalUntil : store.hereUntil;
  return Math.max(0, Math.ceil((until - Date.now()) / 1000));
}

function formatCdLeft(sec) {
  const s = Math.max(0, Math.ceil(Number(sec) || 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m > 0 ? `${m}:${String(r).padStart(2, "0")}` : `${r}s`;
}

let respawnShopTickId = 0;
function stopRespawnShopTick() {
  if (respawnShopTickId) {
    clearInterval(respawnShopTickId);
    respawnShopTickId = 0;
  }
}

// ✅ Met à jour prix / CD / états des boutons de réparation.
function refreshRespawnShop() {
  if (!ui.respawnOverlay || ui.respawnOverlay.style.display === "none") return;
  if (isBaseOnlyRespawnMap()) return;
  const credits = Math.max(0, Math.floor(Number(player.credits) || 0));
  const portalCd = getRespawnCdLeft("portal");
  const hereCd = getRespawnCdLeft("here");

  const portalPrice = document.getElementById("respawnPortalPrice");
  if (portalPrice) portalPrice.textContent = `${formatInteger(RESPAWN_PORTAL_COST)} crédits`;
  const herePrice = document.getElementById("respawnHerePrice");
  if (herePrice) herePrice.textContent = `${formatInteger(RESPAWN_HERE_COST)} crédits`;

  const portalCdEl = document.getElementById("respawnPortalCd");
  if (portalCdEl) portalCdEl.textContent = portalCd > 0 ? `Disponible dans ${formatCdLeft(portalCd)}` : "";
  const hereCdEl = document.getElementById("respawnHereCd");
  if (hereCdEl) hereCdEl.textContent = hereCd > 0 ? `Disponible dans ${formatCdLeft(hereCd)}` : "";

  const portalBtn = ui.respawnPortalBtn?.querySelector("button") || ui.respawnPortalBtn;
  const hereBtn = ui.respawnHereBtn?.querySelector("button") || ui.respawnHereBtn;
  const portalBlocked = portalCd > 0 || credits < RESPAWN_PORTAL_COST;
  const hereBlocked = hereCd > 0 || credits < RESPAWN_HERE_COST;
  if (portalBtn && portalBtn.tagName === "BUTTON") {
    portalBtn.disabled = portalBlocked;
    portalBtn.textContent = portalCd > 0 ? `Aller portail (${formatCdLeft(portalCd)})` : "Aller portail";
  }
  if (hereBtn && hereBtn.tagName === "BUTTON") {
    hereBtn.disabled = hereBlocked;
    hereBtn.textContent = hereCd > 0 ? `Réparer ici (${formatCdLeft(hereCd)})` : "Réparer ici";
  }
  ui.respawnPortalBtn?.classList.toggle("respawnDisabled", portalBlocked);
  ui.respawnHereBtn?.classList.toggle("respawnDisabled", hereBlocked);

  const hint = ui.respawnOverlay.querySelector("#respawnHint");
  if (hint && !isBaseOnlyRespawnMap()) {
    const missing = [];
    if (credits < RESPAWN_PORTAL_COST) missing.push("portail");
    if (credits < RESPAWN_HERE_COST) missing.push("sur place");
    hint.innerHTML = missing.length
      ? `Choisis ta réparation ci-dessus · Crédits insuffisants pour : <b>${missing.join(" · ")}</b> (${formatInteger(credits)} crédits).`
      : "Choisis ta réparation ci-dessus.";
  }
}

function startRespawnShopTick() {
  stopRespawnShopTick();
  refreshRespawnShop();
  respawnShopTickId = setInterval(() => {
    if (!ui.respawnOverlay || ui.respawnOverlay.style.display === "none") {
      stopRespawnShopTick();
      return;
    }
    refreshRespawnShop();
  }, 500);
}

// ✅ Débite les crédits d'une réparation payante. Retourne false si refusé.
function chargeRespawnCost(cost, label) {
  const owned = Math.max(0, Math.floor(Number(player.credits) || 0));
  if (owned < cost) {
    showToast(`Pas assez de crédits (${label} : ${formatInteger(cost)})`, 1.6);
    refreshRespawnShop();
    return false;
  }
  player.credits = owned - cost;
  if (account.user) account.user.credits = player.credits;
  markProgressDirty();
  saveProgressNow();
  return true;
}

function showRespawnOverlay(show, { gateOnly = null } = {}) {
  if (!ui.respawnOverlay) return;
  if (show) {
    document.body.classList.remove("orbitNoFade");
    document.body.classList.add("orbitDead");
  } else {
    // Réapparition D'UN COUP : pas de transition au retour.
    document.body.classList.add("orbitNoFade");
    document.body.classList.remove("orbitDead");
    void document.body.offsetWidth;
    document.body.classList.remove("orbitNoFade");
  }
  // ✅ réparation unique à la base : Galaxy Gates + maps à respawn imposé
  // (ex : carte maudite via rules.baseRespawnOnly). Surchargeable explicitement.
  const gateMode = gateOnly ?? isBaseOnlyRespawnMap();
  if (show && gateMode) {
    if (ui.respawnPortalBtn) ui.respawnPortalBtn.style.display = "none";
    if (ui.respawnHereBtn) ui.respawnHereBtn.style.display = "none";
    if (ui.respawnBaseBtn) ui.respawnBaseBtn.style.display = "";
    const grid = ui.respawnOverlay.querySelector(".grid");
    if (grid) grid.style.gridTemplateColumns = "1fr";
    const hint = ui.respawnOverlay.querySelector("#respawnHint");
    if (hint) hint.innerHTML = rules?.mode === "gate"
      ? "En Galaxy Gate, seule la <b>réparation à la base</b> est possible."
      : "Sur cette carte, seule la <b>réparation à la base</b> est possible.";
  } else if (show) {
    if (ui.respawnPortalBtn) ui.respawnPortalBtn.style.display = "";
    if (ui.respawnHereBtn) ui.respawnHereBtn.style.display = "";
    if (ui.respawnBaseBtn) ui.respawnBaseBtn.style.display = "";
    const grid = ui.respawnOverlay.querySelector(".grid");
    if (grid) grid.style.gridTemplateColumns = "repeat(3, 1fr)";
    const hint = ui.respawnOverlay.querySelector("#respawnHint");
    if (hint) hint.innerHTML = "Choisis ta réparation ci-dessus.";
  }
  ui.respawnOverlay.style.display = show ? "grid" : "none";
  if (show) startRespawnShopTick();
  if (!show) {
    stopRespawnShopTick();
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

// ✅ verrou anti double réapparition (double-clic) :
// armé dans startRespawn, lu dans startDeathSequence et respawn().
let respawnRunning = false;

function startDeathSequence() {
  // ✅ (voir verrou ci-dessus : ne pas réafficher la fenêtre par-dessus un switch)
  setCenterMsg(false);
  // Fondu de sortie de tout le HUD (réapparition instantanée au choix).
  document.body.classList.remove("orbitNoFade");
  document.body.classList.add("orbitDead");
  const veil = document.getElementById("deathVeil");
  if (veil) {
    veil.classList.remove("instant");
    veil.classList.add("active");
  }
  setTimeout(() => {
    // ✅ si le joueur a déjà lancé sa réapparition (double-clic rapide) ou n'est
    // plus mort, on ne réaffiche pas la fenêtre de réparation par-dessus.
    if (!player.dead || respawnRunning) return;
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

// ✅ Fonds de carte et étoiles supprimés : le canvas reste sur son vide #050814.

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
  cargoTxt: document.getElementById("cargoTxt"),
  cargoBar: document.getElementById("cargoBar"),
  oreTradeWindow: document.getElementById("oreTradeWindow"),
  otPalladium: document.getElementById("otPalladium"),
  otPalladiumGain: document.getElementById("otPalladiumGain"),
  otExchangeBtn: document.getElementById("otExchangeBtn"),
  otRows: document.getElementById("otRows"),
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
  questOfferWindow: document.getElementById("questOfferWindow"),
  escortWindowBody: document.getElementById("escortWindowBody"),
  craftingRecipes: document.getElementById("craftingRecipes"),
  craftingDetail: document.getElementById("craftingDetail"),
  craftingQuantity: document.getElementById("craftingQuantity"),
  craftingBuildBtn: document.getElementById("craftingBuildBtn"),
  craftingMessage: document.getElementById("craftingMessage"),
  craftingProgress: document.getElementById("craftingProgress"),
  craftingProgressBar: document.getElementById("craftingProgressBar"),
  craftingProgressPct: document.getElementById("craftingProgressPct"),
  refineryWindow: document.getElementById("refineryWindow"),
  refineryStock: document.getElementById("refineryStock"),
  refineryRecipes: document.getElementById("refineryRecipes"),
  refineryAuto: document.getElementById("refineryAuto"),
  refineryAllBtn: document.getElementById("refineryAllBtn"),
  refineryUpgrades: document.getElementById("refineryUpgrades"),
  upgAmountDialog: document.getElementById("upgAmountDialog"),
  upgAmountIcon: document.getElementById("upgAmountIcon"),
  upgAmountTitle: document.getElementById("upgAmountTitle"),
  upgAmountBtns: document.getElementById("upgAmountBtns"),
  upgAmountPreview: document.getElementById("upgAmountPreview"),
  upgAmountCancel: document.getElementById("upgAmountCancel"),
  upgAmountOk: document.getElementById("upgAmountOk"),
  gameLogSearch: document.getElementById("gameLogSearch"),
  gameLogPrevious: document.getElementById("gameLogPrevious"),
  gameLogNext: document.getElementById("gameLogNext"),
  gameLogPage: document.getElementById("gameLogPage"),

  petWindow: document.getElementById("petWindow"),
  petSprite: document.getElementById("petSprite"),
  petNameTxt: document.getElementById("petNameTxt"),
  petPlayBtn: document.getElementById("petPlayBtn"),
  petModeBtn: document.getElementById("petModeBtn"),
  petModeList: document.getElementById("petModeList"),
  petNpcRow: document.getElementById("petNpcRow"),
  petNpcBtn: document.getElementById("petNpcBtn"),
  petNpcList: document.getElementById("petNpcList"),
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
  cfgToggleBtn: document.getElementById("cfgToggleBtn"),
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
// Re-rend l'onglet actif de la palette (ex : Aptitudes après changement de vaisseau).
let refreshActiveActionPalette = null;
// Dernier vaisseau vu par l'onglet Aptitudes. Suivi indépendant car
// readUsers() partage ses objets en cache : account.user est déjà muté
// au moment de l'événement, donc prev/next y sont toujours égaux.
let lastAbilityShipId = null;

// ============================================================
// Camouflage ultime (Police / admin).
// 30 s d'effet, 240 s de recharge. Invisible pour les NPC et la
// mini-carte, rendu à 50 %, cassé par la moindre attaque.
// ============================================================
const POLICE_CLOAK_DURATION = 30;
const POLICE_CLOAK_COOLDOWN = 240;
// Aptitudes "camouflage" branchées sur le même effet (Police + 2 Spearhead).
const CLOAK_ABILITY_IDS = new Set([
  "ability_admin-ultimate-cloaking",
  "ability_spearhead_ultimate-cloak",
  "ability_spearhead-plus_ultimate-cloak",
]);
function isCloakAbility(abilityId) {
  return CLOAK_ABILITY_IDS.has(String(abilityId || "").toLowerCase());
}
// Recharges persistantes (survivent au refresh) : échéances absolues en
// localStorage, même convention que les gears P.E.T (timestamps).
const PERSIST_CDS_KEY = "orbit_cooldowns_v1";
function readPersistedCds() {
  try { return JSON.parse(localStorage.getItem(PERSIST_CDS_KEY) || "{}") || {}; }
  catch { return {}; }
}
function persistCdUntil(name, seconds) {
  try {
    const all = readPersistedCds();
    if (Number(seconds) > 0) all[name] = Date.now() + Number(seconds) * 1000;
    else delete all[name];
    localStorage.setItem(PERSIST_CDS_KEY, JSON.stringify(all));
  } catch {}
}
function persistedCdLeft(name) {
  try {
    return Math.max(0, (Number(readPersistedCds()[name] || 0) - Date.now()) / 1000);
  } catch { return 0; }
}
// La recharge ne démarre qu'une fois l'aptitude finie ou coupée.
// Visuellement, le voile reste plein pendant l'effet puis descend.
function startPoliceCloakCooldown() {
  player.cloakCd = POLICE_CLOAK_COOLDOWN;
  persistCdUntil("cloakFx", 0);
  persistCdUntil("cloak", POLICE_CLOAK_COOLDOWN);
}
function restorePersistedCds() {
  // Camouflage coupé par un refresh : l'effet est perdu, la recharge démarre.
  if (persistedCdLeft("cloakFx") > 0) {
    player.cloakT = 0;
    startPoliceCloakCooldown();
  } else {
    // Plafonné à la recharge : pendant l'effet le voile reste plein (figé).
    player.cloakCd = Math.min(POLICE_CLOAK_COOLDOWN, Math.max(Number(player.cloakCd || 0), persistedCdLeft("cloak")));
  }
  pulseCd = Math.max(Number(pulseCd || 0), persistedCdLeft("pulse"));
  ishCd = Math.max(Number(ishCd || 0), persistedCdLeft("ish"));
}
// Recharge d'une aptitude pour le voile de CD des slots (même système que
// roquettes/formations : classe cdVeil + variable --cd). Les aptitudes non
// branchées renvoient 0 (aucun voile).
function getAbilityCooldown(abilityId) {
  if (isCloakAbility(abilityId)) {
    // Pendant l'effet : voile plein (figé). Après : la recharge descend.
    if (isPlayerCloaked()) {
      const total = POLICE_CLOAK_DURATION + POLICE_CLOAK_COOLDOWN;
      return { left: total, max: total };
    }
    return { left: Number(player.cloakCd || 0), max: POLICE_CLOAK_COOLDOWN };
  }
  return { left: 0, max: 0 };
}
// Texte du compteur d'aptitude : "45s" sous 60 s, "4:00" au-delà.
function formatAbilityCd(left) {
  const s = Math.max(0, Math.ceil(Number(left) || 0));
  if (s >= 60) return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  return `${s}s`;
}
function isPlayerCloaked() {
  if (typeof player === "undefined" || !player || player.dead) return false;
  return (player.cloakT || 0) > 0;
}
// Toute attaque réelle casse le camouflage (laser, roquette, salve) :
// l'aptitude est coupée donc la recharge démarre.
function breakPoliceCloak() {
  if ((player.cloakT || 0) <= 0) return;
  player.cloakT = 0;
  startPoliceCloakCooldown();
  showNotification("Camouflage ultime désactivé (attaque)", 2, "info");
}
function activatePoliceCloak() {
  if (player.dead || !started) return;
  const cd = Number(player.cloakCd || 0);
  if (cd > 0) {
    showNotification(`Camouflage ultime : recharge ${Math.ceil(cd)} s`, 2, "info");
    return;
  }
  if (isPlayerCloaked()) return;
  player.cloakT = POLICE_CLOAK_DURATION;
  // Recharge posée dès l'activation mais figée : le voile reste plein
  // pendant l'effet, il ne descend qu'à la fin ou à la coupure.
  player.cloakCd = POLICE_CLOAK_DURATION + POLICE_CLOAK_COOLDOWN;
  persistCdUntil("cloakFx", POLICE_CLOAK_DURATION);
  persistCdUntil("cloak", POLICE_CLOAK_DURATION + POLICE_CLOAK_COOLDOWN);
  // Les NPC perdent la cible : on efface l'aggro existante.
  try {
    for (const e of enemies) {
      if (!e || e.hp <= 0) continue;
      e._aggro = false;
      e._aggroT = 0;
      e._attackedPlayerRecently = false;
      if (e._combatTargetId === "player") e._combatTargetId = null;
      if (e.aiZ) e.aiZ.state = "wander";
    }
  } catch {}
  showNotification("Camouflage ultime actif (30 s)", 2.5, "info");
}

function initializeCustomActionBar() {
  const bar = document.getElementById("ammoBar");
  if (!bar || bar.dataset.customized === "1") return;
  bar.dataset.customized = "1";
  const actions = [...bar.querySelectorAll(":scope > .ammoBtn")];
  const palette = document.createElement("div");
  palette.className = "actionPalette";
  palette.hidden = true;
  palette.innerHTML = `<nav><button class="active" data-action-category="ammo">Munitions</button><button data-action-category="rockets">Roquettes</button><button data-action-category="launchers">Lance-roquettes</button><button data-action-category="formations">Formations</button><button data-action-category="skills">Extras</button><button data-action-category="abilities">Aptitudes</button></nav><div class="actionPaletteItems"></div>`;
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
    button.className = "ammoBtn formationActionSlot dockAction" + (isClassicFormation(formation.id) ? " formationClassic" : ""); button.dataset.actionCategory = "formations";
    button.dataset.actionId = `formation:${formation.id}`; button.draggable = true;
    button.innerHTML = `<img src="${formationDockIcon(formation) || formation.icon}" alt=""><span>${formation.name.replace("Formation ", "")}</span>`;
    button.onclick = () => {
      playDockSelectSound(getActiveDroneFormation(account.user).id !== formation.id);
      const result = setCurrentUserDroneFormation(formation.id);
      if (!result.ok) return showNotification(result.error, 2.5, "error");
      account.user = result.user;
      applyCurrentConfigStats(false, null, true);
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
    button.className = "ammoBtn rocketActionSlot dockAction"; button.dataset.actionCategory = "rockets";
    button.dataset.actionId = `rocket:${id}`; button.draggable = true;
    button.title = r?.name || id;
    button.innerHTML = `<img src="${escapeHtml(rocketDockIcon(id) || "")}" alt=""><strong>${escapeHtml(r?.short || id)}</strong><small class="rocketCount">0</small>`;
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

  // Onglet Aptitudes de la palette : les 65 icones de ASSETS/APTITUDES,
  // regroupees par vaisseau. Un vaisseau sans aptitude n'affiche pas de
  // section. Visuel seul pour l'instant (pas d'effet gameplay) : clic = notification.
  const ABILITY_GROUPS = [
    { ship: "Police", ships: ["police"], ids: ["ability_admin-ultimate-cloaking"] },
    { ship: "Aegis", ships: ["aegis"], ids: ["ability_aegis_hp-repair", "ability_aegis_repair-pod", "ability_aegis_shield-repair"] },
    { ship: "Basilisk", ships: ["basilisk"], ids: ["ability_basilisk_heightened-valour", "ability_basilisk_noxious-nebula"] },
    { ship: "Berserker", ships: ["berserker"], ids: ["ability_berserker_bsk", "ability_berserker_rvg", "ability_berserker_shl"] },
    { ship: "Citadel Plus", ships: ["citadel_plus"], ids: ["ability_citadel-plus_prismatic-endurance"] },
    { ship: "Citadel", ships: ["citadel"], ids: ["ability_citadel_draw-fire", "ability_citadel_fortify", "ability_citadel_protection", "ability_citadel_travel"] },
    { ship: "Diminisher", ships: ["diminisher"], ids: ["ability_diminisher"] },
    { ship: "Disruptor", ships: ["disruptor"], ids: ["ability_disruptor_ddol", "ability_disruptor_redirect", "ability_disruptor_shield-disarray"] },
    { ship: "Goliath X", ships: ["goliath_x"], ids: ["ability_goliath-x_frozen-claw"] },
    { ship: "Hammerclaw Plus", ships: ["hammerclaw_plus"], ids: ["ability_hammerclaw-plus_reallocate"] },
    { ship: "Hecate Plus", ships: ["hecate_plus"], ids: ["ability_hecate-plus_particle-beam-plus", "ability_hecate-plus_stockpile"] },
    { ship: "Hecate", ships: ["hecate"], ids: ["ability_hecate_particle-beam"] },
    { ship: "Holo", ships: ["holo"], ids: ["ability_holo_enemy-reversal", "ability_holo_self-reversal"] },
    { ship: "Hyperion", ships: ["hyperion"], ids: ["ability_hyperion_ga", "ability_hyperion_qa"] },
    { ship: "Keres", ships: ["keres"], ids: ["ability_keres_sle", "ability_keres_spr"] },
    { ship: "Liberator Plus", ships: ["liberator_plus"], ids: ["ability_liberator-plus_self-repair"] },
    { ship: "Lightning", ships: ["lightning", "vengeance_lightning"], ids: ["ability_lightning"] },
    { ship: "Mimesis", ships: ["mimesis"], ids: ["ability_mimesis_hologram", "ability_mimesis_phase-out", "ability_mimesis_scramble"] },
    { ship: "Orcus", ships: ["orcus"], ids: ["ability_orcus_assimilate"] },
    { ship: "Paladin", ships: ["paladin"], ids: ["ability_paladin_last-stand", "ability_paladin_ripper"] },
    { ship: "Pusat Plus", ships: ["pusat_plus"], ids: ["ability_pusat-plus_speed-sap"] },
    { ship: "Retiarus Plus", ships: ["retiarus_plus"], ids: ["ability_retiarus-plus_chsp", "ability_retiarus-plus_spcp"] },
    { ship: "Retiarus", ships: ["retiarus"], ids: ["ability_retiarus_chs", "ability_retiarus_spc"] },
    { ship: "Sentinel", ships: ["sentinel"], ids: ["ability_sentinel"] },
    { ship: "Solace Plus", ships: ["solace_plus"], ids: ["ability_solace-plus_nano-cluster-repairer-plus"] },
    { ship: "Solace", ships: ["solace"], ids: ["ability_solace"] },
    { ship: "Solaris Plus", ships: ["solaris_plus"], ids: ["ability_solaris-plus_incinerate-plus"] },
    { ship: "Solaris", ships: ["solaris"], ids: ["ability_solaris_inc"] },
    { ship: "Spearhead Plus", ships: ["spearhead_plus"], ids: ["ability_spearhead-plus_jamx-creed", "ability_spearhead-plus_neutralizing-marker", "ability_spearhead-plus_target-marker", "ability_spearhead-plus_ultimate-cloak"] },
    { ship: "Spearhead", ships: ["spearhead"], ids: ["ability_spearhead_double-minimap", "ability_spearhead_jam-x", "ability_spearhead_target-marker", "ability_spearhead_ultimate-cloak"] },
    { ship: "Spectrum Plus", ships: ["spectrum_plus"], ids: ["ability_spectrum-plus_prismatic-reflecting"] },
    { ship: "Spectrum", ships: ["spectrum"], ids: ["ability_spectrum"] },
    { ship: "Tartarus Plus", ships: ["tartarus_plus"], ids: ["ability_tartarus-plus_rapid-fire-plus", "ability_tartarus-plus_speed-boost-plus"] },
    { ship: "Tartarus", ships: ["tartarus"], ids: ["ability_tartarus_rapid-fire", "ability_tartarus_speed-boost"] },
    { ship: "Tempest", ships: ["tempest"], ids: ["ability_tempest_volt-backup", "ability_tempest_volt-discharge", "ability_tempest_voltage-link"] },
    { ship: "Venom", ships: ["venom"], ids: ["ability_venom"] },
    { ship: "Zephyr", ships: ["zephyr"], ids: ["ability_zephyr_mmt", "ability_zephyr_tbr"] },
  ];
  // Icones de repli : aptitudes "Plus" qui partagent le visuel de base
  // (aucun fichier Plus dédié dans ASSETS/APTITUDES/ICONS).
  const ABILITY_ICON_OVERRIDES = {
    "ability_spearhead-plus_target-marker": "ABILITY_SPEARHEAD_TARGET-MARKER.PNG",
    "ability_spearhead-plus_ultimate-cloak": "ABILITY_SPEARHEAD_ULTIMATE-CLOAK.PNG",
  };
  function abilityIconSrc(name) {
    const file = ABILITY_ICON_OVERRIDES[name] || `${String(name).toUpperCase()}.PNG`;
    return `ASSETS/APTITUDES/ICONS/${file}`;
  }
  const abilityButtons = [];
  for (const group of ABILITY_GROUPS) {
    for (const name of group.ids) {
      const label = name.replace(/^ability_/, "").replace(/[-_]+/g, " ");
      const button = document.createElement("button");
      button.className = "ammoBtn abilityActionSlot"; button.dataset.actionCategory = "abilities";
      button.dataset.actionId = `ability:${name}`; button.dataset.ship = group.ship; button.draggable = true;
      button.title = `${group.ship} — ${label}`;
      button.innerHTML = `<img src="${abilityIconSrc(name)}" alt=""><span>${escapeHtml(label)}</span><small class="abilityCd"></small>`;
      const img = button.querySelector("img");
      if (img) img.onerror = () => { img.onerror = null; img.style.display = "none"; };
      button.onclick = () => {
        if (isCloakAbility(name)) {
          activatePoliceCloak();
          return;
        }
        showNotification(`${group.ship} : ${label} — aptitude visuelle (effet gameplay à venir)`, 2, "info");
      };
      button.addEventListener("dragstart", event => { event.dataTransfer.setData("application/x-orbit-action", button.dataset.actionId); event.dataTransfer.effectAllowed = "move"; });
      byId.set(button.dataset.actionId, button);
      abilityButtons.push(button);
    }
  }

  // Groupe d'aptitudes du vaisseau équipé (hangar actif), ou null.
  // Designs résolus vers leur base (ex : vengeance_lightning_france -> vengeance).
  function currentAbilityShipMatch() {
    let rawShipId = "";
    try { rawShipId = String(getActiveHangarFromUser(account?.user)?.shipId || "").toLowerCase(); } catch {}
    let baseShipId = null;
    try { baseShipId = getShipDesignBaseId(rawShipId); } catch {}
    const candidates = [rawShipId, baseShipId, String(rawShipId).split("_").slice(0, 2).join("_")].filter(Boolean);
    return ABILITY_GROUPS.find(group => group.ships.some(sid => candidates.includes(sid))) || null;
  }
  // Masque l'onglet Aptitudes si le vaisseau équipé n'a aucune aptitude.
  // Retourne le groupe affiché (ou null).
  function syncAbilitiesTabVisibility() {
    const btn = palette.querySelector('[data-action-category="abilities"]');
    if (!btn) return null;
    const match = currentAbilityShipMatch();
    btn.style.display = match ? "" : "none";
    return match;
  }

  // Bouton USE lance-roquettes : nÅ“ud permanent créé dès l'init pour que les
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
    launcherUseBtn.className = "rocketQuickAction launcherAutoBtn dockAction";
    launcherUseBtn.title = "Utiliser la roquette sélectionnée";
    launcherUseBtn.innerHTML = `<strong>USE</strong><span class="launcherSquares"><span class="lsq">■</span><span class="lsq">■</span><span class="lsq">■</span><span class="lsq">■</span><span class="lsq">■</span></span><small class="launcherStock"><span class="launcherCount">0</span></small>`;
    return launcherUseBtn;
  }
  function updateLauncherUseBtn() {
    const btn = createLauncherUseBtn();
    const activeId = String(player.launcherActive || "eco10").toLowerCase();
    const icon = rocketDockIcon(activeId) || rocketDockIcon("eco10");
    const lit = launcherLitNow();
    btn.className = "rocketQuickAction launcherAutoBtn dockAction";
    btn.title = "Utiliser la roquette sélectionnée";
    // Recadrage du fond comme les <img> (contenu bas dans le PNG officiel).
    const bgShift = { bdr1212: -6, eco10: -1, cbr: -2, sar01: -1, sar02: -1, ubr100: -1, pir100: 0, hstrm01: -2 }[activeId] ?? 0;
    btn.style.backgroundImage = icon ? `url("${icon}")` : "";
    btn.style.setProperty("background-position", `50% calc(50% - ${bgShift}px)`, "important");
    btn.innerHTML = `<strong>USE</strong><span class="launcherSquares">${[0, 1, 2, 3, 4].map((i) => `<span class="lsq${i < lit ? " lit" : ""}">■</span>`).join("")}</span><small class="launcherStock"><span class="launcherCount">${formatRocketCount(rocketCount(activeId))}</span></small>`;
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
    paletteItems.classList.toggle("abilitiesView", category === "abilities");
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
        // Bouton USE : nÅ“ud permanent (enregistré dans byId dès l'init) pour
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
    if (category === "abilities") {
      const match = currentAbilityShipMatch();
      try { lastAbilityShipId = String(getActiveHangarFromUser(account?.user)?.shipId || "").toLowerCase(); } catch {}
      // Uniquement les aptitudes du vaisseau équipé, en ligne et centrées.
      // (L'onglet est masqué si le vaisseau n'en a aucune.)
      const groupsToShow = match ? [match] : [];
      if (!groupsToShow.length) {
        const empty = document.createElement("div");
        empty.className = "abilityEmpty";
        empty.textContent = "Aucune aptitude sur ce vaisseau";
        paletteItems.appendChild(empty);
      }
      for (const group of groupsToShow) {
        const section = document.createElement("div");
        section.className = "abilityShipSection";
        const icons = document.createElement("div");
        icons.className = "abilityShipIcons abilitySingle";
        abilityButtons.filter(button => button.dataset.ship === group.ship).forEach(button => {
          const clone = button.cloneNode(true); clone.className = "rocketQuickAction abilityQuickAction"; clone.draggable = true;
          const cloneImg = clone.querySelector("img");
          if (cloneImg) cloneImg.onerror = () => { cloneImg.onerror = null; cloneImg.style.display = "none"; };
          clone.addEventListener("dragstart", event => { event.dataTransfer.setData("application/x-orbit-action", clone.dataset.actionId); });
          clone.onclick = () => button.click(); icons.appendChild(clone);
        });
        section.appendChild(icons);
        paletteItems.appendChild(section);
      }
    }
    else if (category === "formations") formationButtons.forEach(button => {
      const clone = button.cloneNode(true); clone.className = "formationQuickAction dockAction" + (button.classList.contains("formationClassic") ? " formationClassic" : ""); clone.draggable = true;
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
    // Le DOM du dock a changé : le cache de sync pointe des nÅ“uds détachés.
    // Invalidation synchrone (l'observer MutationObserver ne passe qu'après).
    // À l'init les `let` du cache sont en TDZ : pas grave, cache déjà vide/dirty.
    try { invalidateActionDockCache(); } catch {}
  }
  palette.querySelectorAll("[data-action-category]").forEach(button => button.onclick = () => renderPalette(button.dataset.actionCategory));
  refreshActiveActionPalette = () => {
    const match = syncAbilitiesTabVisibility();
    if (palette.hidden) return;
    let active = palette.querySelector("[data-action-category].active")?.dataset.actionCategory || "ammo";
    if (active === "abilities" && !match) active = "ammo";
    renderPalette(active);
  };
  try { lastAbilityShipId = String(getActiveHangarFromUser(account?.user)?.shipId || "").toLowerCase(); } catch {}
  const flipActionPalette = () => {
    palette.hidden = !palette.hidden;
    if (!palette.hidden) syncAbilitiesTabVisibility();
    toggle.classList.toggle("active", !palette.hidden);
    toggle.textContent = palette.hidden ? "⌃" : "⌄";
    try { localStorage.setItem("orbit_palette_open", palette.hidden ? "0" : "1"); } catch {}
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
  // Fermeture au clic ailleurs désactivée : seul le toggle ouvre/ferme.
  bar.append(toggle, palette);
  paletteItems.addEventListener("wheel", event => {
    if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
    event.preventDefault();
    paletteItems.scrollLeft += event.deltaY;
  }, { passive: false });
  renderPalette("ammo");
  syncAbilitiesTabVisibility();
  // Restauration après le boot : sinon le panneau ouvert recouvre l'écran de chargement.
  const restorePalette = () => {
    try {
      if (localStorage.getItem("orbit_palette_open") === "1") {
        palette.hidden = false;
        toggle.classList.add("active");
        toggle.textContent = "⌄";
      }
    } catch {}
  };
  if (document.documentElement.classList.contains("orbitBooting")) {
    const bootWait = setInterval(() => {
      if (!document.documentElement.classList.contains("orbitBooting")) {
        clearInterval(bootWait);
        restorePalette();
      }
    }, 300);
  } else restorePalette();
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
  selectNew: 15, selectAgain: 15, shieldSelected: 15,
  outOfRange: 30,
  escortX1: 5, escortX2: 5, escortX3: 5, escortX4: 5, escortX6: 5, escortSab: 5,
});

const DEFAULT_GAME_SETTINGS = {
  sound: true,
  soundVolume: 5,
  music: true,
  musicVolume: 1,
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
  { id: "menuSelect", label: "Sélection des menus", members: ["selectNew", "selectAgain", "shieldSelected"] },
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
  // ✅ migration : l'ancien raccourci de réparation directe est supprimé.
  delete normalized.respawn;
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

  // Icônes officielles DarkOrbit (extraites de featuresMenu_texture).
  const menuIcon = (name) => `<img class="menuIconImg" src="ASSETS/UI/MENU/${name}.png" alt="" draggable="false">`;

  reg("boxMeta", "Stats joueur", menuIcon("pilotSheet"));
  reg("boxVitals", "État du vaisseau", menuIcon("ship"));
  reg("minimap", "Mini-carte", menuIcon("minimap"));
  reg("settingsWindow", "Paramètres", menuIcon("settings"), false);
  reg("questWindow", "Missions", menuIcon("quests"), false);
  reg("questOfferWindow", "Terminal de quêtes", menuIcon("quests"), false, { minimizable: false });
  // Terminal : comme le comptoir, juste une croix qui fait disparaître (jamais de dock).
  ui.questOfferWindow?.querySelector(".gameWinBar")?.insertAdjacentHTML("beforeend", `<button class="gameWinMinBtn" type="button" title="Fermer">✕</button>`);
  ui.questOfferWindow?.querySelector(".gameWinBar > button:last-child")?.addEventListener("click", closeQuestTerminal);
  window.GameWindowManager?.close?.("questOfferWindow");
  reg("galaxyGateWindow", "Galaxy Gates", menuIcon("ggBuilder"), false);
  reg("gameLogWindow", "LOG", menuIcon("log"), false);
  // Assemblage désactivé (voir CRAFTING_ENABLED) : pas d'icône dock, code conservé.
  if (CRAFTING_ENABLED) reg("craftingWindow", "Assemblage", menuIcon("assembly"), false);
  else {
    document.getElementById("craftingWindow")?.style.setProperty("display", "none", "important");
    window.GameWindowManager?.close?.("craftingWindow");
  }
  reg("petWindow", "P.E.T", menuIcon("pet"), false);
  reg("oreTradeWindow", "Commerce", menuIcon("ore_trade"), false, { minimizable: false });
  // Comptoir : juste une croix qui fait disparaître (jamais de dock).
  ui.oreTradeWindow?.querySelector(".gameWinBar")?.insertAdjacentHTML("beforeend", `<button class="gameWinMinBtn" type="button" title="Fermer">✕</button>`);
  ui.oreTradeWindow?.querySelector(".gameWinBar > button:last-child")?.addEventListener("click", closeOreTradeWindow);
  window.GameWindowManager?.close?.("oreTradeWindow");
  reg("refineryWindow", "Raffinage", menuIcon("refinement"), false);
  reg("boosterWindow", "Boosters", menuIcon("booster"), false);
  reg("botWindow", "BOT", menuIcon("npc_event"), false);
  reg("wikiWindow", "Wiki / Aide", menuIcon("help"), false);
  reg("gygerimStatus", "État du boss", menuIcon("worldBoss"), true, { minimizable: false });
wireSettingsWindow();
wireWikiWindow();
wirePetWindow();
wireBoosterWindow();
wireBotWindow();
}

// ============================================================
// ✅ Fenêtre Boosters en jeu : stock, activation, compte à rebours
// ============================================================
function boosterCatalogId(def) {
  return `booster_${def?.id || ""}`;
}

// Ordre des familles dans la fenêtre.
const BOOSTER_FAMILY_ORDER = ["dmgPct", "shieldPct", "hpPct", "expPct", "honorPct", "repairPct", "resPct", "sregPct", "boxPct", "questPct", "petXpPct"];

// Couleurs officielles lexique FR (cf. screenshot) : rouge = dégâts,
// cyan = bouclier, vert = PV, orange = exp, rose = honneur, etc.
const BOOSTER_FAMILY_COLORS = Object.freeze({
  dmgPct: "#ff2222",
  shieldPct: "#4dd2ff",
  hpPct: "#33ff66",
  expPct: "#ffa028",
  honorPct: "#ffc2d1",
  repairPct: "#c061ff",
  resPct: "#e6c200",
  sregPct: "#6b7cff",
  boxPct: "#f5e0a0",
  questPct: "#ffffff",
  petXpPct: "#e5a055",
});

// Petite icône de catégorie (pour les multi-effets : MUL-B03, EPHON-1).
const BOOSTER_FAMILY_ICONS = Object.freeze({
  dmgPct: "/ASSETS/BOOSTERS/CAT/dmg.png",
  shieldPct: "/ASSETS/BOOSTERS/CAT/shd.png",
  hpPct: "/ASSETS/BOOSTERS/CAT/hp.png",
  expPct: "/ASSETS/BOOSTERS/CAT/ep.png",
  honorPct: "/ASSETS/BOOSTERS/CAT/hon.png",
  repairPct: "/ASSETS/BOOSTERS/CAT/rep.png",
  resPct: "/ASSETS/BOOSTERS/CAT/res.png",
  sregPct: "/ASSETS/BOOSTERS/CAT/sreg.png",
  boxPct: "/ASSETS/BOOSTERS/CAT/bb.png",
  questPct: "/ASSETS/BOOSTERS/MINI/qr.png",
  petXpPct: "/ASSETS/BOOSTERS/CAT/pep.png",
});

function boosterFacetIcon(facet) {
  const keys = Object.keys(facet?.def?.effect || {}).filter(
    (k) => k !== "hitPct" && BOOSTER_FAMILY_ORDER.includes(k)
  );
  // Multi-effets : icône de la catégorie, pas celle du booster.
  if (keys.length > 1) return BOOSTER_FAMILY_ICONS[facet.key] || facet.def.iconMini || facet.def.icon;
  return facet.def.iconMini || facet.def.icon;
}

function renderBoosterWindow() {
  const list = document.getElementById("boosterList");
  if (!list) return;
  const user = account.user || getCurrentUserFull();
  const now = Date.now();
  // On n'affiche que les boosters ACTIFS (tout achat prolonge le timer).
  const owned = BOOSTERS.filter((def) => boosterTimeLeftMs(user?.boosters, def.id, now) > 0);
  if (!owned.length) {
    list.innerHTML = `<div class="boosterEmpty">Aucun booster actif — achète-les en boutique (onglet BOOSTERS).</div>`;
    return;
  }
  // Une ligne par effet : les multi-effets (MUL-B03, EPHON-1) apparaissent
  // dans chaque famille avec le combiné actualisé.
  const facets = [];
  for (const def of owned) {
    for (const [key, value] of Object.entries(def.effect || {})) {
      if (key === "hitPct") continue; // précision : appliquée, non affichée en famille
      if (!BOOSTER_FAMILY_ORDER.includes(key)) continue;
      facets.push({ def, key, pct: Number(value) || 0 });
    }
  }
  const rowHtml = (facet) => {
    const leftMs = boosterTimeLeftMs(user?.boosters, facet.def.id, now);
    const color = BOOSTER_FAMILY_COLORS[facet.key] || "#effbff";
    const icon = boosterFacetIcon(facet);
    return `<div class="boosterRow compact" data-booster="${facet.def.id}" data-family="${facet.key}" style="--boost:${color}" title="${facet.def.name} — ${facet.def.desc}">
      <img src="${icon}" alt="${facet.def.code}">
      <strong class="boosterCode">${facet.def.code}</strong>
      <span class="boosterStatus" data-booster-countdown="${facet.def.id}">${formatBoosterCountdown(leftMs)}</span>
    </div>`;
  };
  let html = "";
  for (const key of BOOSTER_FAMILY_ORDER) {
    const rows = facets.filter((f) => f.key === key);
    if (!rows.length) continue;
    const color = BOOSTER_FAMILY_COLORS[key] || "#ffc85a";
    if (rows.length === 1) {
      const pct = rows[0].pct;
      html += `<div class="boosterSingle" data-family="${key}" style="--boost:${color}"><span class="singleRail"><span class="boosterPct">${pct}%</span><span class="singleBar" aria-hidden="true"></span></span>${rowHtml(rows[0])}</div>`;
    } else {
      const total = Math.round(rows.reduce((sum, f) => sum + f.pct, 0));
      html += `<div class="boosterGroup" data-family="${key}" style="--boost:${color}"><div class="boosterGroupRail"><span class="boosterCombined">${total}%</span><span class="bracket" aria-hidden="true"></span></div><div class="boosterGroupCards">`;
      for (const f of rows) html += rowHtml(f);
      html += `</div></div>`;
    }
  }
  list.innerHTML = html;
}

function refreshBoosterCountdowns() {
  const list = document.getElementById("boosterList");
  if (!list || list.style.display === "none") return;
  const card = document.getElementById("boosterWindow");
  if (!card || card.style.display === "none" || card.classList.contains("gameWinMinimized")) return;
  const now = Date.now();
  const user = account.user || getCurrentUserFull();
  let changed = false;
  for (const def of BOOSTERS) {
    const el = list.querySelector(`[data-booster-countdown="${def.id}"]`);
    if (!el) continue;
    const leftMs = boosterTimeLeftMs(user?.boosters, def.id, now);
    const next = formatBoosterCountdown(leftMs);
    if (el.textContent !== next) {
      // Fin d'effet : re-rendu complet (la ligne disparaît).
      if (leftMs <= 0) { changed = true; break; }
      el.textContent = next;
    }
  }
  if (changed) renderBoosterWindow();
}

window.addEventListener("orbit:window-restored", (event) => {
  if (event.detail?.id === "boosterWindow") renderBoosterWindow();
});

function wireBoosterWindow() {
  queueMicrotask(() => renderBoosterWindow());
}

// ============================================================
// ✅ Fenêtre BOT : farm background (collecte / kill NPC / les 2).
// Tourne dans la boucle du jeu : les autres fenêtres restent
// utilisables pendant que le bot pilote moveTarget + Target +
// attackActive. Un clic manuel sur la map reprend la main ~2,5 s.
// ============================================================
const BOT_STORE_KEY = "orbit_bot_config_v1";
const BOT_MAPS = [
  "1-1", "1-2", "1-3", "1-4", "1-5", "1-6", "1-7", "1-8", "4-1", "1-9", "1-10",
  "2-1", "2-2", "2-3", "2-4", "2-5", "2-6", "2-7", "2-8", "4-2", "2-9", "2-10",
  "3-1", "3-2", "3-3", "3-4", "3-5", "3-6", "3-7", "3-8", "4-3", "3-9", "3-10",
  "4-4", "4-5", "5-2", "MAUDITE",
];
// Munitions laser sélectionnables par NPC (vide = auto / ne pas changer).
const BOT_AMMO_IDS = ["x1", "x2", "x3", "x4", "x6", "sab", "rcb", "cbo", "job", "rb", "pib", "idb", "vb", "emaa", "sbl", "abl"];
const BOT_AMMO_NAMES = Object.freeze({
  x1: "LCB-10", x2: "MCB-25", x3: "MCB-50", x4: "UCB-100", x6: "RSB-75",
  sab: "SAB-50", rcb: "RCB-140", cbo: "CBO-100", job: "JOB-100", rb: "RB-214",
  pib: "PIB-100", idb: "IDB-125", vb: "VB-142", emaa: "EMAA-20", sbl: "SBL-100", abl: "A-BL",
});
// Modules du bot (façon fenêtre Général) : chaque module dérive un mode
// de farm (kill/collect/both) + un comportement (quêtes, galaxy gates).
const BOT_MODULES = Object.freeze({
  both: { mode: "both", label: "Kill & Collect" },
  kill: { mode: "kill", label: "Kill" },
  collect: { mode: "collect", label: "Collect" },
  quest: { mode: "both", label: "Quest" },
  galaxy: { mode: "kill", label: "Galaxy Gates" },
});
function botModeForModule(m) {
  return BOT_MODULES[String(m)]?.mode || "both";
}
function botSetModule(m) {
  m = String(m || "both");
  if (!BOT_MODULES[m]) m = "both";
  Bot.module = m;
  Bot.mode = botModeForModule(m);
  botSaveConfig();
}
const Bot = {
  active: false,
  mode: "both",
  module: "both",
  priority: "npc",
  targetMap: "",
  autoTravel: true,
  autoRepair: true,
  respawn: "base",
  npcAllow: new Set(),
  boxAllow: new Set(),
  npcMapFilter: "",
  formMove: "",
  formAttack: "",
  formTravel: "",
  formFlee: "",
  cfgAttack: "",
  cfgFly: "",
  cfgTravel: "",
  cfgFlee: "",
  cfgPrev: 0,
  ammoPrev: "",
  petMode: "",
  petPrev: null,
  petPrevGear: null,
  engageDist: 0,
  npcAmmo: Object.create(null),
  npcIncludeUnknown: false,
  npcSeen: Object.create(null),
  sightT: 0,
  lock: true,
  overlay: true,
  npcIgnoreDist: 0,
  boxRadius: 0,
  npcPrio: Object.create(null),
  fleeResume: 45,
  maxDeaths: 0,
  reviveWait: 3,
  deaths: 0,
  wasDead: false,
  statsT0: 0,
  credits0: 0,
  exp0: 0,
  orbit: true,
  orbitDist: 560,
  npcDist: Object.create(null),
  npcOrbit: Object.create(null),
  flee: true,
  fleePct: 25,
  cargo: true,
  cargoPct: 95,
  sellBase: "auto",
  refine: {
    laser: { ore: "", qty: 20 },
    shield: { ore: "", qty: 20 },
    rocket: { ore: "", qty: 20 },
    speed: { ore: "", qty: 20 },
  },
  skillIem: false,
  iemFoes: 3,
  skillIsh: false,
  ishPct: 20,
  rockets: false,
  launchers: false,
  questsAccept: false,
  questsClaim: true,
  questT: 0,
  ggSpin: false,
  ggGate: "alpha",
  ggSpins: 10,
  ggAutoMult: true,
  ggAutoEnter: true,
  ggNearestSwitch: true,
  ggFinishForm: "",
  ggFinishCfg: "",
  ggSpinT: 0,
  ggUiT: 0,
  ggJumpCd: 0,
  ggSwitchCd: 0,
  rocketPrev: false,
  launcherPrev: false,
  selling: false,
  travelOverride: "",
  kills: 0,
  boxes: 0,
  lastNpcId: null,
  lastBoxId: null,
  lastFormation: "",
  orbitAng: 0,
  fleeing: false,
  roamX: 0,
  roamY: 0,
  roamT: 0,
  travelCd: 0,
  repairT: 0,
  jumpCd: 0,
  manualT: 0,
  status: "En pause",
  target: "—",
  hudT: 0,
  tab: "general",
};

function botNotifyManual() {
  Bot.manualT = performance.now();
}

function botSaveConfig() {
  try {
    localStorage.setItem(BOT_STORE_KEY, JSON.stringify({
      active: Bot.active,
      mode: Bot.mode,
      module: Bot.module,
      priority: Bot.priority,
      targetMap: Bot.targetMap,
      autoTravel: Bot.autoTravel,
      autoRepair: Bot.autoRepair,
      respawn: Bot.respawn,
      npcAllow: [...Bot.npcAllow],
      boxAllow: [...Bot.boxAllow],
      npcMapFilter: Bot.npcMapFilter,
      formMove: Bot.formMove,
      formAttack: Bot.formAttack,
      formTravel: Bot.formTravel,
      formFlee: Bot.formFlee,
      cfgAttack: Bot.cfgAttack,
      cfgFly: Bot.cfgFly,
      cfgTravel: Bot.cfgTravel,
      cfgFlee: Bot.cfgFlee,
      petMode: Bot.petMode,
      lock: Bot.lock,
      overlay: Bot.overlay,
      npcIgnoreDist: Bot.npcIgnoreDist,
      boxRadius: Bot.boxRadius,
      npcPrio: Bot.npcPrio,
      fleeResume: Bot.fleeResume,
      maxDeaths: Bot.maxDeaths,
      reviveWait: Bot.reviveWait,
      orbit: Bot.orbit,
      orbitDist: Bot.orbitDist,
      npcDist: Bot.npcDist,
      npcOrbit: Bot.npcOrbit,
      engageDist: Bot.engageDist,
      npcAmmo: Bot.npcAmmo,
      npcIncludeUnknown: Bot.npcIncludeUnknown,
      npcSeen: Bot.npcSeen,
      flee: Bot.flee,
      fleePct: Bot.fleePct,
      cargo: Bot.cargo,
      cargoPct: Bot.cargoPct,
      sellBase: Bot.sellBase,
      refine: Bot.refine,
      skillIem: Bot.skillIem,
      iemFoes: Bot.iemFoes,
      skillIsh: Bot.skillIsh,
      ishPct: Bot.ishPct,
      rockets: Bot.rockets,
      launchers: Bot.launchers,
      questsAccept: Bot.questsAccept,
      questsClaim: Bot.questsClaim,
      ggSpin: Bot.ggSpin,
      ggGate: Bot.ggGate,
      ggSpins: Bot.ggSpins,
      ggAutoMult: Bot.ggAutoMult,
      ggAutoEnter: Bot.ggAutoEnter,
      ggNearestSwitch: Bot.ggNearestSwitch,
      ggFinishForm: Bot.ggFinishForm,
      ggFinishCfg: Bot.ggFinishCfg,
      kills: Bot.kills,
      boxes: Bot.boxes,
      tab: Bot.tab,
      savedAt: Date.now(),
    }));
  } catch {}
}

function botLoadConfig() {
  let raw = null;
  try { raw = localStorage.getItem(BOT_STORE_KEY); } catch {}
  if (!raw) return false;
  try {
    const data = JSON.parse(raw);
    if (!data || typeof data !== "object") return false;
    if (["both", "kill", "collect", "quest", "galaxy"].includes(data.module)) Bot.module = data.module;
    else if (["collect", "kill", "both"].includes(data.mode)) Bot.module = data.mode;
    Bot.mode = botModeForModule(Bot.module);
    if (["npc", "box", "nearest"].includes(data.priority)) Bot.priority = data.priority;
    if (typeof data.targetMap === "string") Bot.targetMap = data.targetMap;
    if (typeof data.autoTravel === "boolean") Bot.autoTravel = data.autoTravel;
    if (typeof data.autoRepair === "boolean") Bot.autoRepair = data.autoRepair;
    if (["base", "portal", "here"].includes(data.respawn)) Bot.respawn = data.respawn;
    if (Array.isArray(data.npcAllow)) Bot.npcAllow = new Set(data.npcAllow.map(String));
    if (Array.isArray(data.boxAllow)) Bot.boxAllow = new Set(data.boxAllow.map(String));
    if (typeof data.npcMapFilter === "string") Bot.npcMapFilter = data.npcMapFilter;
    if (typeof data.formMove === "string") Bot.formMove = data.formMove;
    if (typeof data.formAttack === "string") Bot.formAttack = data.formAttack;
    if (typeof data.formTravel === "string") Bot.formTravel = data.formTravel;
    if (typeof data.formFlee === "string") Bot.formFlee = data.formFlee;
    if (data.cfgAttack === "1" || data.cfgAttack === "2") Bot.cfgAttack = data.cfgAttack;
    if (data.cfgFly === "1" || data.cfgFly === "2") Bot.cfgFly = data.cfgFly;
    if (data.cfgTravel === "1" || data.cfgTravel === "2") Bot.cfgTravel = data.cfgTravel;
    if (data.cfgFlee === "1" || data.cfgFlee === "2") Bot.cfgFlee = data.cfgFlee;
    if (typeof data.petMode === "string") Bot.petMode = data.petMode;
    if (typeof data.lock === "boolean") Bot.lock = data.lock;
    if (typeof data.orbit === "boolean") Bot.orbit = data.orbit;
    if (typeof data.overlay === "boolean") Bot.overlay = data.overlay;
    const nid = Math.floor(Number(data.npcIgnoreDist));
    Bot.npcIgnoreDist = Number.isFinite(nid) ? Math.max(0, Math.min(20000, nid)) : 0;
    const brad = Math.floor(Number(data.boxRadius));
    Bot.boxRadius = Number.isFinite(brad) ? Math.max(0, Math.min(20000, brad)) : 0;
    if (data.npcPrio && typeof data.npcPrio === "object") {
      for (const [k, v] of Object.entries(data.npcPrio)) {
        const p = Math.floor(Number(v));
        if (Number.isFinite(p) && p > 0) Bot.npcPrio[String(k)] = Math.min(99, p);
      }
    }
    const fr = Math.floor(Number(data.fleeResume));
    if (Number.isFinite(fr)) Bot.fleeResume = Math.max(10, Math.min(100, fr));
    const md = Math.floor(Number(data.maxDeaths));
    Bot.maxDeaths = Number.isFinite(md) ? Math.max(0, Math.min(999, md)) : 0;
    const rw = Math.floor(Number(data.reviveWait));
    Bot.reviveWait = Number.isFinite(rw) ? Math.max(0, Math.min(60, rw)) : 3;
    const od = Math.floor(Number(data.orbitDist));
    if (Number.isFinite(od)) Bot.orbitDist = Math.max(200, Math.min(2000, od));
    if (data.npcDist && typeof data.npcDist === "object") {
      for (const [k, v] of Object.entries(data.npcDist)) {
        const d = Math.floor(Number(v));
        if (Number.isFinite(d)) Bot.npcDist[String(k)] = Math.max(200, Math.min(2000, d));
      }
    }
    if (data.npcOrbit && typeof data.npcOrbit === "object") {
      for (const [k, v] of Object.entries(data.npcOrbit)) Bot.npcOrbit[String(k)] = v !== false;
    }
    if (typeof data.flee === "boolean") Bot.flee = data.flee;
    const fp = Math.floor(Number(data.fleePct));
    if (Number.isFinite(fp)) Bot.fleePct = Math.max(5, Math.min(90, fp));
    if (typeof data.cargo === "boolean") Bot.cargo = data.cargo;
    const cp = Math.floor(Number(data.cargoPct));
    if (Number.isFinite(cp)) Bot.cargoPct = Math.max(50, Math.min(100, cp));
    if (["auto", "low", "high"].includes(data.sellBase)) Bot.sellBase = data.sellBase;
    if (data.refine && typeof data.refine === "object") {
      for (const slot of ["laser", "shield", "rocket", "speed"]) {
        const r = data.refine[slot];
        if (!r || typeof r !== "object") continue;
        const ore = String(r.ore || "").toLowerCase();
        const qty = Math.floor(Number(r.qty));
        Bot.refine[slot] = {
          ore: (UPGRADE_SLOT_ORES[slot] || []).includes(ore) ? ore : "",
          qty: Number.isFinite(qty) ? Math.max(1, Math.min(999, qty)) : 20,
        };
      }
    }
    if (typeof data.skillIem === "boolean") Bot.skillIem = data.skillIem;
    const foes = Math.floor(Number(data.iemFoes));
    if (Number.isFinite(foes)) Bot.iemFoes = Math.max(1, Math.min(10, foes));
    if (typeof data.skillIsh === "boolean") Bot.skillIsh = data.skillIsh;
    const ishp = Math.floor(Number(data.ishPct));
    if (Number.isFinite(ishp)) Bot.ishPct = Math.max(5, Math.min(90, ishp));
    if (typeof data.rockets === "boolean") Bot.rockets = data.rockets;
    if (typeof data.launchers === "boolean") Bot.launchers = data.launchers;
    if (typeof data.questsAccept === "boolean") Bot.questsAccept = data.questsAccept;
    if (typeof data.questsClaim === "boolean") Bot.questsClaim = data.questsClaim;
    if (typeof data.ggSpin === "boolean") Bot.ggSpin = data.ggSpin;
    if (["alpha", "beta", "gamma"].includes(String(data.ggGate || "").toLowerCase())) Bot.ggGate = String(data.ggGate).toLowerCase();
    {
      const gs = Math.floor(Number(data.ggSpins));
      if (Number.isFinite(gs)) Bot.ggSpins = Math.max(1, Math.min(100, gs));
    }
    if (typeof data.ggAutoMult === "boolean") Bot.ggAutoMult = data.ggAutoMult;
    if (typeof data.ggAutoEnter === "boolean") Bot.ggAutoEnter = data.ggAutoEnter;
    if (typeof data.ggNearestSwitch === "boolean") Bot.ggNearestSwitch = data.ggNearestSwitch;
    if (typeof data.ggFinishForm === "string") Bot.ggFinishForm = data.ggFinishForm;
    if (data.ggFinishCfg === "1" || data.ggFinishCfg === "2") Bot.ggFinishCfg = data.ggFinishCfg;
    else if (typeof data.ggFinishCfg === "string") Bot.ggFinishCfg = "";
    const ed = Math.floor(Number(data.engageDist));
    Bot.engageDist = Number.isFinite(ed) ? Math.max(0, Math.min(3000, ed)) : 0;
    if (data.npcAmmo && typeof data.npcAmmo === "object") {
      for (const [k, v] of Object.entries(data.npcAmmo)) {
        const a = String(v || "").toLowerCase();
        if (BOT_AMMO_IDS.includes(a)) Bot.npcAmmo[String(k)] = a;
      }
    }
    if (typeof data.npcIncludeUnknown === "boolean") Bot.npcIncludeUnknown = data.npcIncludeUnknown;
    if (data.npcSeen && typeof data.npcSeen === "object") {
      for (const [k, v] of Object.entries(data.npcSeen)) {
        if (Array.isArray(v)) Bot.npcSeen[String(k)] = v.map(String).slice(0, 12);
      }
    }
    Bot.kills = Math.max(0, Math.floor(Number(data.kills) || 0));
    Bot.boxes = Math.max(0, Math.floor(Number(data.boxes) || 0));
    if (typeof data.tab === "string") {
      const migrated = BOT_TAB_LEGACY[data.tab] || data.tab;
      if (document.querySelector(`#botTabs [data-bot-tab="${migrated}"]`)) Bot.tab = migrated;
    }
    return data.active === true;
  } catch { return false; }
}

function botLog(text) {
  const el = document.getElementById("botLog");
  if (!el) return;
  const line = document.createElement("div");
  line.textContent = text;
  el.prepend(line);
  while (el.children.length > 30) el.removeChild(el.lastChild);
}

// Onglets de la fenêtre : n'affiche que les sections de l'onglet actif.
const BOT_TABS = ["general", "attack", "collect", "travel", "security", "npc", "rex", "galaxy", "stats", "log"];
const BOT_TAB_LEGACY = Object.freeze({ combat: "attack", boxes: "collect" });
function botSwitchTab(name) {
  if (!BOT_TABS.includes(name)) name = "general";
  Bot.tab = name;
  document.querySelectorAll("#botTabs .botTab").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.botTab === name);
  });
  document.querySelectorAll("#botWindow [data-bot-section]").forEach((sec) => {
    const show = String(sec.dataset.botSection) === name;
    sec.style.display = show ? "" : "none";
  });
  botSaveConfig();
}

function botRefreshHud() {
  const statusEl = document.getElementById("botStatusTxt");
  const targetEl = document.getElementById("botTargetTxt");
  const playEl = document.getElementById("botPlayBtn");
  const killEl = document.getElementById("botKillCount");
  const boxEl = document.getElementById("botBoxCount");
  if (statusEl) {
    statusEl.textContent = Bot.active ? Bot.status : "En pause";
    statusEl.classList.toggle("running", Bot.active);
  }
  if (targetEl) targetEl.textContent = Bot.active ? Bot.target : "—";
  if (playEl) {
    // ✅ ne remplace le nÅ“ud texte que sur changement d'état : sinon le
    // remplacement à chaque refresh peut avaler un clic en cours.
    const txt = Bot.active ? "⏸" : "▶";
    if (playEl.textContent !== txt) playEl.textContent = txt;
    playEl.classList.toggle("running", Bot.active);
    const tip = Bot.active ? "Mettre en pause" : "Démarrer";
    if (playEl.title !== tip) playEl.title = tip;
  }
  if (killEl) killEl.textContent = String(Bot.kills);
  if (boxEl) boxEl.textContent = String(Bot.boxes);
  botRefreshStats();
}

// Stats de session (onglet Stats) : durée, gains et taux horaires.
function botRefreshStats() {
  const set = (id, txt) => {
    const el = document.getElementById(id);
    if (el && el.textContent !== txt) el.textContent = txt;
  };
  set("botStatKills", String(Bot.kills));
  set("botStatBoxes", String(Bot.boxes));
  set("botStatDeaths", String(Bot.deaths));
  if (!Bot.statsT0) {
    set("botStatTime", "—");
    set("botStatCredits", "+0");
    set("botStatCreditsH", "—");
    set("botStatXp", "+0");
    set("botStatXpH", "—");
    return;
  }
  const elapsedS = Math.max(0, (Date.now() - Bot.statsT0) / 1000);
  const mm = String(Math.floor(elapsedS / 60)).padStart(2, "0");
  const ss = String(Math.floor(elapsedS % 60)).padStart(2, "0");
  const hh = Math.floor(elapsedS / 3600);
  set("botStatTime", hh > 0 ? `${hh}h${mm}m` : `${mm}:${ss}`);
  let credits = 0;
  let exp = 0;
  try {
    credits = Math.max(0, Math.floor(Number(player.credits) || 0)) - Bot.credits0;
    exp = Math.max(0, Math.floor(Number(account.user?.stats?.exp) || 0)) - Bot.exp0;
  } catch {}
  const sign = (n) => (n < 0 ? "-" : "+") + formatInteger(Math.abs(n));
  set("botStatCredits", sign(credits));
  set("botStatXp", sign(exp));
  if (elapsedS >= 60) {
    const perH = (n) => sign(Math.round(n / elapsedS * 3600));
    set("botStatCreditsH", perH(credits));
    set("botStatXpH", perH(exp));
  } else {
    set("botStatCreditsH", "—");
    set("botStatXpH", "—");
  }
}

function botSetActive(on) {
  Bot.active = !!on;
  Bot.repairT = 0;
  Bot.travelCd = 0;
  Bot.jumpCd = 0;
  Bot.ggSpinT = 0;
  Bot.ggUiT = 0;
  Bot.ggJumpCd = 0;
  Bot.ggSwitchCd = 0;
  Bot.fleeing = false;
  Bot.selling = false;
  Bot.travelOverride = "";
  Bot.lastFormation = "";
  Bot.roamT = 0;
  if (!Bot.active) {
    Bot.status = "En pause";
    Bot.target = "—";
    botRestorePetMode();
    botRestoreLoadout();
    // On ne coupe pas une attaque manuelle en cours : juste on arrête de piloter.
  } else {
    Bot.status = "Démarré";
    botSnapshotLoadout();
    try {
      Bot.statsT0 = Date.now();
      Bot.credits0 = Math.max(0, Math.floor(Number(player.credits) || 0));
      Bot.exp0 = Math.max(0, Math.floor(Number(account.user?.stats?.exp) || 0));
    } catch { Bot.statsT0 = 0; Bot.credits0 = 0; Bot.exp0 = 0; }
    Bot.deaths = 0;
    Bot.wasDead = false;
    botApplyPetMode();
    botLog(`Bot démarré (${BOT_MODULES[Bot.module]?.label || Bot.module})`);
  }
  botSaveConfig();
  botRefreshHud();
}

// Priorité d'un type de NPC (style DarkBot : la plus haute gagne, 0 = normal).
function botNpcPrio(type) {
  const p = Math.floor(Number(Bot.npcPrio[String(type)]));
  return Number.isFinite(p) ? Math.max(0, Math.min(99, p)) : 0;
}

// Distance d'orbite effective pour un type de NPC (surcharge perso ou défaut).
function botNpcDist(type) {
  const d = Math.floor(Number(Bot.npcDist[String(type)]));
  return Number.isFinite(d) ? Math.max(200, Math.min(2000, d)) : Bot.orbitDist;
}

// Orbite autorisée pour un type de NPC (surcharge perso ou oui par défaut).
function botNpcOrbitOf(type) {
  const key = String(type);
  return key in Bot.npcOrbit ? Bot.npcOrbit[key] !== false : true;
}

// Bascule silencieuse de configuration 1/2 (même logique que le bouton,
// sans les toasts ; cooldown 5 s respecté, échecs ignorés).
function botApplyConfig(want) {
  want = Number(want) === 2 ? 2 : Number(want) === 1 ? 1 : 0;
  if (!want) return;
  try {
    if (player.dead || !started) return;
    if (getActiveConfigNo() === want) return;
    if (getConfigCooldownLeft() > 0) return;
    saveShieldForConfig(getActiveConfigNo());
    saveProgressNow();
    const hangarId = SESSION_HANGAR_ID || getActiveHangarId();
    const out = setActiveHangarConfig(hangarId, want);
    if (!out?.ok) return;
    applyCurrentConfigStats(false, want, true);
    CONFIG_SWITCH.until = Date.now() + CONFIG_SWITCH.cooldownMs;
    updateConfigButtons();
    drawUI();
    botLog(`Configuration ${want} activée`);
  } catch {}
}

// Vend tous les minerais vendables au comptoir. Retourne les crédits gagnés.
function botSellOres() {
  let total = 0;
  try {
    for (const id of Object.keys(ORE_SELL_PRICES)) {
      const owned = Math.floor(Number(account.user?.inventory?.resources?.[id]) || 0);
      if (owned <= 0) continue;
      const out = sellCurrentUserOre(id, 0);
      if (out?.ok) total += Math.floor(Number(out.gained) || 0);
    }
    if (total > 0) {
      account.user = getCurrentUserFull();
      player.credits = Number(account.user?.credits) || player.credits;
      setHudText(ui.shopCredits, formatInteger(player.credits));
      markProgressDirty();
      saveProgressNow();
      window.dispatchEvent(new CustomEvent("orbit:profile-progress"));
    }
  } catch {}
  return total;
}

// Charge les slots d'amélioration avec les minerais configurés (1 minerai
// = 10 tirs / 10 min). Ne remplace JAMAIS un slot chargé d'un autre minerai
// avec du stock restant. Retourne le minerai consommé (place libérée).
function botRefineUpgrades() {
  let consumed = 0;
  try {
    const user = account.user;
    if (!user) return 0;
    for (const slot of ["laser", "shield", "rocket", "speed"]) {
      const cfg = Bot.refine?.[slot];
      const ore = String(cfg?.ore || "").toLowerCase();
      if (!ore || !(UPGRADE_SLOT_ORES[slot] || []).includes(ore)) continue;
      const want = Math.max(1, Math.min(999, Math.floor(Number(cfg.qty) || 0)));
      if (!(want > 0)) continue;
      const loaded = user.upgrades?.[slot];
      const loadedOre = String(loaded?.ore || "").toLowerCase();
      const loadedStock = Math.max(0, Math.floor(Number(loaded?.stock) || 0));
      if (loadedOre && loadedOre !== ore && loadedStock > 0) {
        botLog(`Raffinage ${slot} : ${loadedOre} déjà chargé (${loadedStock}) — on garde`);
        continue;
      }
      const owned = Math.max(0, Math.floor(Number(user.inventory?.resources?.[ore]) || 0));
      const amount = Math.min(want, owned);
      if (amount <= 0) continue;
      const out = chargeShipUpgrade(slot, ore, amount);
      if (out?.ok) {
        consumed += amount;
        botLog(`Raffinage ${slot} : +${amount * 10} (${ore})`);
      }
    }
    if (consumed > 0) {
      account.user = getCurrentUserFull();
      markProgressDirty();
      saveProgressNow();
      window.dispatchEvent(new CustomEvent("orbit:profile-progress"));
    }
  } catch {}
  return consumed;
}

// Base de vente la plus proche (en sauts) : X-1 (low) ou X-8 (high).
// Respecte la préférence (auto / low / high), fallback sur l'autre base.
function botPickSellBase(curMap) {
  const faction = (account.user || getCurrentUserFull())?.faction;
  const low = String(getFactionHomeMap(faction) || "").toLowerCase();
  const high = String(getFactionUpperBaseMap(faction) || "").toLowerCase();
  const cands = [];
  if (Bot.sellBase === "low") { if (low) cands.push(low); if (high) cands.push(high); }
  else if (Bot.sellBase === "high") { if (high) cands.push(high); if (low) cands.push(low); }
  else {
    const rl = low ? botFindRoute(curMap, low) : null;
    const rh = high ? botFindRoute(curMap, high) : null;
    const ranked = [
      rl ? { map: low, hops: rl.length } : null,
      rh ? { map: high, hops: rh.length } : null,
    ].filter(Boolean).sort((a, b) => a.hops - b.hops);
    for (const r of ranked) cands.push(r.map);
    if (low && !cands.includes(low)) cands.push(low);
    if (high && !cands.includes(high)) cands.push(high);
  }
  return cands.filter(Boolean);
}
function botNearestTradeModule() {
  let best = null;
  let bestD2 = Infinity;
  let bestPos = null;
  try {
    for (const m of zoneSafe?.modules || []) {
      if (!isTradeModule(m)) continue;
      const pos = getTradeButtonPosition(m);
      if (!pos) continue;
      const d2 = dist2(player.x, player.y, pos.x, pos.y);
      if (d2 < bestD2) { bestD2 = d2; best = m; bestPos = pos; }
    }
  } catch {}
  return best ? { module: best, pos: bestPos, d2: bestD2 } : null;
}

// Mémorise config + munition au démarrage pour les restaurer à l'arrêt.
function botSnapshotLoadout() {
  Bot.cfgPrev = 0;
  Bot.ammoPrev = "";
  Bot.rocketPrev = false;
  Bot.launcherPrev = false;
  try { Bot.cfgPrev = getActiveConfigNo() === 2 ? 2 : 1; } catch { Bot.cfgPrev = 0; }
  try { Bot.ammoPrev = String(player.ammo.active || ""); } catch { Bot.ammoPrev = ""; }
  try { Bot.rocketPrev = player.rocketAuto === true; } catch {}
  try { Bot.launcherPrev = player.launcherAuto === true; } catch {}
  botApplyRocketFlags();
}

// Applique les flags roquettes/lance-roquettes du bot (restaurés à l'arrêt).
function botApplyRocketFlags() {
  try {
    if (player.rocketAuto !== Bot.rockets || player.launcherAuto !== Bot.launchers) {
      player.rocketAuto = Bot.rockets;
      player.launcherAuto = Bot.launchers;
      markProgressDirty();
    }
  } catch {}
}

function botRestoreLoadout() {
  try {
    if (Bot.cfgPrev === 1 || Bot.cfgPrev === 2) {
      if (getActiveConfigNo() !== Bot.cfgPrev && getConfigCooldownLeft() <= 0 && !player.dead) {
        saveShieldForConfig(getActiveConfigNo());
        const hangarId = SESSION_HANGAR_ID || getActiveHangarId();
        const out = setActiveHangarConfig(hangarId, Bot.cfgPrev);
        if (out?.ok) {
          applyCurrentConfigStats(false, Bot.cfgPrev, true);
          CONFIG_SWITCH.until = Date.now() + CONFIG_SWITCH.cooldownMs;
          updateConfigButtons();
          drawUI();
        }
      }
    }
  } catch {}
  try {
    if (Bot.ammoPrev && AMMO[Bot.ammoPrev] && player.ammo.active !== Bot.ammoPrev) setAmmo(Bot.ammoPrev);
  } catch {}
  try {
    if (player.rocketAuto !== Bot.rocketPrev || player.launcherAuto !== Bot.launcherPrev) {
      player.rocketAuto = Bot.rocketPrev;
      player.launcherAuto = Bot.launcherPrev;
      markProgressDirty();
    }
  } catch {}
  Bot.cfgPrev = 0;
  Bot.ammoPrev = "";
}

// Bascule silencieuse de formation drones (échec ignoré : non possédée,
// pas assez de drones, cooldown 2 s côté compte).
function botApplyFormation(id) {
  if (!id || id === Bot.lastFormation) return;
  let out = null;
  try { out = setCurrentUserDroneFormation(id); } catch { return; }
  if (!out?.ok) return;
  Bot.lastFormation = id;
  try {
    account.user = out.user;
    applyCurrentConfigStats(false, null, true);
  } catch {}
}

// Modules REX visibles par le bot : union sur TOUS les hangars et les 2
// configs (le fit courant n'est qu'un des cas : l'auto-loot peut être
// équipé sur un autre hangar / une autre config), + gear actif en secours.
function botPetGearUnion() {
  const best = new Map();
  try {
    const user = account.user;
    const pet = user?.pet;
    if (!pet) return [];
    const hangs = Array.isArray(user?.hangars) && user.hangars.length ? user.hangars : [null];
    for (const h of hangs) {
      const hid = h ? String(h.id) : null;
      for (const cfg of ["1", "2"]) {
        let fit = null;
        try { fit = hid ? getPetFit(pet, hid, cfg) : null; } catch { continue; }
        let opts = [];
        try { opts = listEquippedGearOptions(fit, findCatalogItem) || []; } catch { continue; }
        for (const o of opts) {
          if (!o || !o.key) continue;
          const prev = best.get(o.key);
          if (!prev || Number(o.level) > Number(prev.level)) best.set(o.key, o);
        }
      }
    }
    const ag = String(pet.activeGear || "").toLowerCase();
    if (ag && !best.has(ag)) best.set(ag, { key: ag, level: 0, label: ag.toUpperCase() });
  } catch {}
  return [...best.values()];
}

// Options REX du bot : Passif / Combat + modules équipés (gear:key).
// Reconstruit à chaque ouverture (l'équipement peut changer en boutique).
function botRefreshPetOptions() {
  const sel = document.getElementById("botPetMode");
  if (!sel) return;
  const prev = Bot.petMode || "";
  let gears = [];
  try { gears = botPetGearUnion(); } catch { gears = []; }
  const opts = [
    `<option value="">Ne pas toucher</option>`,
    `<option value="passive">Passif</option>`,
    `<option value="combat">Combat (assiste)</option>`,
  ];
  for (const g of gears) {
    const label = shortGearLabel(g.label) || String(g.key || "").toUpperCase();
    opts.push(`<option value="gear:${escapeHtml(String(g.key))}">${escapeHtml(label)} (module)</option>`);
  }
  sel.innerHTML = opts.join("");
  const valid = ["", "passive", "combat", ...gears.map((g) => `gear:${g.key}`)];
  if (prev && !valid.includes(prev)) {
    // Choix mémorisé mais gear non visible (compte pas encore chargé ou
    // module déplacé) : on le garde au lieu de l'écraser.
    const short = prev.startsWith("gear:") ? prev.slice(5).toUpperCase() : prev;
    sel.innerHTML = `<option value="${escapeHtml(prev)}">${escapeHtml(short)} (mémorisé)</option>` + sel.innerHTML;
    valid.push(prev);
  }
  sel.value = valid.includes(prev) ? prev : "";
  Bot.petMode = sel.value;
}

// REX pendant le bot : applique le mode / module choisi au démarrage.
// Les modules s'activent en passif sans ouvrir de fenêtre (pas de Trader,
// pas de session) : vrai comportement background.
function botApplyPetMode() {
  Bot.petPrev = null;
  Bot.petPrevGear = null;
  if (!Bot.petMode) return;
  const pet = account.user?.pet?.owned === true ? account.user.pet : null;
  if (!pet) { botLog("REX : non possédé — choix ignoré"); return; }
  if (pet.active !== true) { botLog("REX : désactivé — active-le (fenêtre P.E.T)"); return; }
  Bot.petPrev = normalizePetMode(pet.mode);
  Bot.petPrevGear = String(pet.activeGear || "").toLowerCase() || null;
  try {
    if (Bot.petMode.startsWith("gear:")) {
      const key = Bot.petMode.slice("gear:".length).toLowerCase();
      if (Bot.petPrevGear === key && Bot.petPrev === "passive") { Bot.petPrev = null; Bot.petPrevGear = null; return; }
      const outM = setPetMode("passive");
      if (!outM?.ok) { Bot.petPrev = null; Bot.petPrevGear = null; botLog(`REX : ${outM?.error || "impossible"}`); return; }
      const out = setPetActiveGear(key);
      if (!out?.ok) { Bot.petPrev = null; Bot.petPrevGear = null; botLog("REX : module indisponible"); return; }
      petLocator.manualType = null;
      petLocator.enemyId = null;
      petLocator.needsPick = true;
      loadAccountUser();
      botLog(`REX : module ${key.toUpperCase()} actif`);
      return;
    }
    if (Bot.petPrev === Bot.petMode && !Bot.petPrevGear) { Bot.petPrev = null; Bot.petPrevGear = null; return; }
    const out = setPetMode(Bot.petMode);
    if (!out?.ok) { Bot.petPrev = null; Bot.petPrevGear = null; botLog(`REX : ${out?.error || "impossible"}`); return; }
    try { setPetActiveGear(null); } catch {}
    petLocator.manualType = null;
    petLocator.enemyId = null;
    petLocator.needsPick = true;
    loadAccountUser();
    botLog(`REX : ${Bot.petMode === "combat" ? "mode combat" : "passif"}`);
  } catch { Bot.petPrev = null; Bot.petPrevGear = null; }
}

// Restaure le mode REX (+ module) précédent à l'arrêt du bot.
function botRestorePetMode() {
  if (!Bot.petPrev && !Bot.petPrevGear) return;
  const prev = Bot.petPrev || "passive";
  const prevGear = Bot.petPrevGear;
  Bot.petPrev = null;
  Bot.petPrevGear = null;
  try {
    const pet = account.user?.pet?.owned === true ? account.user.pet : null;
    if (!pet) return;
    if (normalizePetMode(pet.mode) !== prev) {
      const out = setPetMode(prev);
      if (!out?.ok) return;
    }
    if (prev === "passive" && prevGear) {
      try { setPetActiveGear(prevGear); } catch {}
    } else if (!prevGear) {
      try { setPetActiveGear(null); } catch {}
    }
    petLocator.manualType = null;
    petLocator.enemyId = null;
    petLocator.needsPick = true;
    loadAccountUser();
  } catch {}
}

// Accès sûr à l'index NPC->maps (let déclaré plus bas : TDZ au wire initial).
// Fusionne l'index des spawns (quêtes) + les observations du bot en jeu.
function botNpcLocations() {
  let base = {};
  try { base = questNpcLocations || {}; } catch { base = {}; }
  const seen = Bot.npcSeen || {};
  if (!Object.keys(seen).length) return base;
  const out = { ...base };
  for (const [k, v] of Object.entries(seen)) {
    const arr = Array.isArray(v) ? v.map(String) : [];
    if (!arr.length) continue;
    out[k] = [...new Set([...(out[k] || []).map(String), ...arr])];
  }
  return out;
}

// Quêtes auto du bot (toutes les 5 s) : rend les quêtes terminées, et
// accepte au terminal les quêtes tuer/collecter qui correspondent à la
// sélection et au mode du bot (jamais de doublon, une action par passage).
function botTickQuests(dt) {
  Bot.questT -= dt;
  if (Bot.questT > 0) return;
  Bot.questT = 5;
  try {
    if (!started || player.dead) return;
    if (Bot.questsClaim) {
      for (const id of Object.keys(questState.active || {})) {
        const q = QUEST_DEFINITIONS.find(item => item.id === id);
        if (q && isQuestComplete(questState, q)) {
          if (claimQuestReward(id)) {
            try { renderQuestWindow(); renderQuestTerminal(); } catch {}
            botLog(`Quête rendue : ${q.title}`);
          }
          break;
        }
      }
    }
    if (Bot.questsAccept && hasQuestTerminalAccess()) {
      if (Object.keys(questState.active || {}).length >= MAX_ACTIVE_QUESTS) return;
      const curMap = String(window.__CURRENT_MAP_ID__ || "").toLowerCase();
      for (const q of QUEST_DEFINITIONS) {
        if (!canAcceptQuest(questState, q)) continue;
        let objs = [];
        try { objs = getQuestObjectives(q); } catch { continue; }
        if (!objs.length) continue;
        let ok = true;
        for (const o of objs) {
          if (o.map && String(o.map).toLowerCase() !== curMap) { ok = false; break; }
          if (o.kind === "kill") {
            if (Bot.mode === "collect") { ok = false; break; }
            if (o.type !== "*" && Bot.npcAllow.size && !Bot.npcAllow.has(String(o.type))) { ok = false; break; }
          } else if (o.kind === "collect") {
            if (Bot.mode === "kill") { ok = false; break; }
            if (Bot.boxAllow.size && !Bot.boxAllow.has(String(o.type))) { ok = false; break; }
          } else { ok = false; break; }
        }
        if (!ok) continue;
        if (acceptQuest(questState, q.id)) {
          markProgressDirty();
          saveProgressNow();
          try { renderQuestWindow(); renderQuestTerminal(); } catch {}
          botLog(`Quête acceptée : ${q.title}`);
          break;
        }
      }
    }
  } catch {}
}
// Mémorise les NPC croisés par map (throttlé) : enrichit le filtre par map
// pour les types absents de l'index des spawns. Tourne même bot en pause.
function botRecordSightings(dt) {
  Bot.sightT -= dt;
  if (Bot.sightT > 0) return;
  Bot.sightT = 5;
  try {
    if (!started || player.dead) return;
    const cur = String(window.__CURRENT_MAP_ID__ || "").toLowerCase();
    if (!cur) return;
    let changed = false;
    for (const e of enemies) {
      if (!e || Number(e.hp) <= 0) continue;
      const t = String(e.type || "");
      if (!t) continue;
      const arr = Bot.npcSeen[t] || (Bot.npcSeen[t] = []);
      if (!arr.includes(cur)) {
        arr.push(cur);
        if (arr.length > 12) arr.shift();
        changed = true;
      }
    }
    if (changed) botSaveConfig();
  } catch {}
}

// Libellé court des maps d'un NPC (index quêtes : type -> [mapIds]).
function botNpcMapsLabel(type) {
  const maps = botNpcLocations()[String(type)] || [];
  if (!maps.length) return "—";
  const short = maps.map((m) => String(m).toUpperCase());
  return short.length > 3 ? `${short.slice(0, 3).join(", ")} +${short.length - 3}` : short.join(", ");
}

function botUpdateNpcCount() {
  const el = document.getElementById("botNpcCount");
  if (!el) return;
  const list = document.getElementById("botNpcList");
  const shown = list ? list.querySelectorAll(".botNpcRow").length : 0;
  el.textContent = `· ${shown} affichés · ${Bot.npcAllow.size} cochés`;
}

// Options du select de munition par NPC ("" = auto / ne pas changer).
function botAmmoOptions(selected) {
  const opts = [`<option value="">Auto</option>`];
  for (const id of BOT_AMMO_IDS) {
    const label = `${id.toUpperCase()} · ${BOT_AMMO_NAMES[id] || id}`;
    opts.push(`<option value="${id}"${selected === id ? " selected" : ""}>${escapeHtml(label)}</option>`);
  }
  return opts.join("");
}

// (Re)construit la liste NPC : triés par nom, filtrés par map + recherche,
// avec distance d'orbite et toggle d'orbite par NPC.
function botRenderNpcList() {
  const list = document.getElementById("botNpcList");
  if (!list) return;
  const q = String(document.getElementById("botNpcSearch")?.value || "").toLowerCase();
  const mapF = String(Bot.npcMapFilter || "").toLowerCase();
  const locs = botNpcLocations();
  const types = Object.keys(NPC_TYPES || {}).sort((a, b) =>
    String(NPC_TYPES[a]?.name || a).localeCompare(String(NPC_TYPES[b]?.name || b), "fr"));
  const rows = [];
  let located = 0;
  for (const t of types) {
    const name = String(NPC_TYPES[t]?.name || t);
    if (q && !`${name} ${t}`.toLowerCase().includes(q)) continue;
    const maps = locs[String(t)] || [];
    if (maps.length) located++;
    if (mapF) {
      if (maps.length) {
        if (!maps.some((m) => String(m).toLowerCase() === mapF)) continue;
      } else if (!Bot.npcIncludeUnknown) {
        // Filtre actif : on cache les NPC sans données de map (sinon la
        // liste reste pleine et donne l'impression de ne pas filtrer).
        continue;
      }
    }
    const dist = botNpcDist(t);
    const orbit = botNpcOrbitOf(t);
    const ammo = Bot.npcAmmo[String(t)] || "";
    const prio = botNpcPrio(t);
    const mapsFull = (maps || []).map(String).join(", ");
    rows.push(
      `<div class="botNpcRow" data-npc="${escapeHtml(t)}">` +
      `<input class="botNpcSel" type="checkbox" value="${escapeHtml(t)}"${Bot.npcAllow.has(t) ? " checked" : ""} title="Tuer ce NPC" />` +
      `<div class="botNpcId"><span class="botNpcName">${escapeHtml(name)}</span><small class="botNpcMaps" title="${escapeHtml(mapsFull || "Map inconnue")}">Maps : ${escapeHtml(mapsFull || "?")}</small></div>` +
      `<input class="botNpcPrio" type="number" data-type="${escapeHtml(t)}" value="${prio}" min="0" max="99" step="1" title="Priorité (plus haute = tuée d'abord)" />` +
      `<input class="botNpcDist" type="number" data-type="${escapeHtml(t)}" value="${dist}" min="200" max="2000" step="10" title="Distance d'orbite (m)" />` +
      `<select class="botNpcAmmo" data-type="${escapeHtml(t)}" title="Munition pour ce NPC">${botAmmoOptions(ammo)}</select>` +
      `<input class="botNpcOrbit" type="checkbox" data-type="${escapeHtml(t)}"${orbit ? " checked" : ""} title="Tourner autour de ce NPC" />` +
      `</div>`
    );
  }
  list.innerHTML = rows.length ? rows.join("") : `<div class="boosterEmpty">Aucun NPC pour ce filtre.</div>`;
  botUpdateNpcCount();
}

function wireBotWindow() {
  const wasActive = botLoadConfig();
  document.querySelectorAll("#botTabs .botTab").forEach((btn) => {
    if (!btn.dataset.botTabWired) {
      btn.dataset.botTabWired = "1";
      btn.addEventListener("click", () => botSwitchTab(btn.dataset.botTab));
    }
  });
  botSwitchTab(Bot.tab || "general");
  const mapSelect = document.getElementById("botMapSelect");
  if (mapSelect && !mapSelect.options.length) {
    const cur = String(window.__CURRENT_MAP_ID__ || "1-1");
    const opts = [`<option value="">— Rester sur la map —</option>`];
    for (const id of BOT_MAPS) {
      opts.push(`<option value="${escapeHtml(id)}"${id.toLowerCase() === cur.toLowerCase() ? "" : ""}>${escapeHtml(id.toUpperCase())}</option>`);
    }
    mapSelect.innerHTML = opts.join("");
    if (Bot.targetMap) mapSelect.value = Bot.targetMap;
  }
  const npcList = document.getElementById("botNpcList");
  if (npcList && !npcList.dataset.wired) {
    npcList.dataset.wired = "1";
    const allTypes = Object.keys(NPC_TYPES || {});
    if (!Bot.npcAllow.size) for (const t of allTypes) Bot.npcAllow.add(t);
    botRenderNpcList();
    npcList.addEventListener("change", (e) => {
      const el = e.target.closest?.("input");
      if (!el) return;
      if (el.classList.contains("botNpcSel")) {
        if (el.checked) Bot.npcAllow.add(el.value);
        else Bot.npcAllow.delete(el.value);
        botUpdateNpcCount();
        botSaveConfig();
      } else if (el.classList.contains("botNpcOrbit")) {
        Bot.npcOrbit[el.dataset.type] = el.checked;
        botSaveConfig();
      }
    });
    npcList.addEventListener("change", (e) => {
      const sel = e.target.closest?.("select.botNpcAmmo");
      if (sel) {
        const a = String(sel.value || "").toLowerCase();
        if (BOT_AMMO_IDS.includes(a)) Bot.npcAmmo[sel.dataset.type] = a;
        else delete Bot.npcAmmo[sel.dataset.type];
        botSaveConfig();
        return;
      }
    });
    npcList.addEventListener("change", (e) => {
      const el = e.target.closest?.('input[type="number"].botNpcDist');
      if (!el) return;
      const d = Math.floor(Number(el.value));
      if (Number.isFinite(d)) {
        Bot.npcDist[el.dataset.type] = Math.max(200, Math.min(2000, d));
        el.value = Bot.npcDist[el.dataset.type];
        botSaveConfig();
      }
    });
    npcList.addEventListener("change", (e) => {
      const el = e.target.closest?.('input[type="number"].botNpcPrio');
      if (!el) return;
      const p = Math.floor(Number(el.value));
      if (Number.isFinite(p)) {
        const v = Math.max(0, Math.min(99, p));
        if (v > 0) Bot.npcPrio[el.dataset.type] = v;
        else delete Bot.npcPrio[el.dataset.type];
        el.value = v;
        botSaveConfig();
      }
    });
  }
  const boxList = document.getElementById("botBoxList");
  if (boxList && !boxList.children.length) {
    const types = Object.keys(COLLECTABLE_TYPES || {}).sort((a, b) =>
      String(COLLECTABLE_TYPES[a]?.name || a).localeCompare(String(COLLECTABLE_TYPES[b]?.name || b), "fr"));
    if (!Bot.boxAllow.size) for (const t of types) Bot.boxAllow.add(t);
    boxList.innerHTML = types.map((t) =>
      `<label data-box="${escapeHtml(t)}"><input type="checkbox" value="${escapeHtml(t)}"${Bot.boxAllow.has(t) ? " checked" : ""} /><span>${escapeHtml(String(COLLECTABLE_TYPES[t]?.name || t))}</span></label>`
    ).join("");
    boxList.addEventListener("change", (e) => {
      const box = e.target.closest?.('input[type="checkbox"]');
      if (!box) return;
      if (box.checked) Bot.boxAllow.add(box.value);
      else Bot.boxAllow.delete(box.value);
      botSaveConfig();
    });
  }
  // Module (façon fenêtre Général) : Kill & Collect / Kill / Collect / Quest / Galaxy Gates.
  const moduleSel = document.getElementById("botModule");
  if (moduleSel) {
    moduleSel.value = Bot.module || "both";
    if (!moduleSel.dataset.wired) {
      moduleSel.dataset.wired = "1";
      moduleSel.addEventListener("change", () => {
        botSetModule(moduleSel.value);
        moduleSel.value = Bot.module;
        botLog(`Module : ${BOT_MODULES[Bot.module]?.label || Bot.module}`);
      });
    }
  }
  document.querySelectorAll('#botModeRow input[name="botMode"]').forEach((radio) => {
    radio.checked = radio.value === Bot.mode;
    radio.addEventListener("change", () => {
      if (!radio.checked) return;
      botSetModule(radio.value);
      botLog(`Mode : ${BOT_MODULES[Bot.module]?.label || Bot.module}`);
    });
  });
  const autoTravel = document.getElementById("botAutoTravel");
  if (autoTravel) {
    autoTravel.checked = Bot.autoTravel;
    autoTravel.addEventListener("change", () => { Bot.autoTravel = autoTravel.checked; botSaveConfig(); });
  }
  const autoRepair = document.getElementById("botAutoRepair");
  if (autoRepair) {
    autoRepair.checked = Bot.autoRepair;
    autoRepair.addEventListener("change", () => { Bot.autoRepair = autoRepair.checked; botSaveConfig(); });
  }
  const reviveWait = document.getElementById("botReviveWait");
  if (reviveWait) {
    reviveWait.value = Bot.reviveWait;
    if (!reviveWait.dataset.wired) {
      reviveWait.dataset.wired = "1";
      reviveWait.addEventListener("change", () => {
        const v = Math.floor(Number(reviveWait.value));
        if (Number.isFinite(v)) {
          Bot.reviveWait = Math.max(0, Math.min(60, v));
          reviveWait.value = Bot.reviveWait;
          botSaveConfig();
        }
      });
    }
  }
  const maxDeaths = document.getElementById("botMaxDeaths");
  if (maxDeaths) {
    maxDeaths.value = Bot.maxDeaths;
    if (!maxDeaths.dataset.wired) {
      maxDeaths.dataset.wired = "1";
      maxDeaths.addEventListener("change", () => {
        const v = Math.floor(Number(maxDeaths.value));
        if (Number.isFinite(v)) {
          Bot.maxDeaths = Math.max(0, Math.min(999, v));
          maxDeaths.value = Bot.maxDeaths;
          botSaveConfig();
        }
      });
    }
  }
  if (mapSelect) {
    mapSelect.addEventListener("change", () => {
      Bot.targetMap = String(mapSelect.value || "");
      botSaveConfig();
      if (Bot.targetMap) botLog(`Carte cible : ${Bot.targetMap.toUpperCase()}`);
    });
  }
  document.getElementById("botGoBtn")?.addEventListener("click", () => {
    const id = String(document.getElementById("botMapSelect")?.value || "");
    if (!id) return showToast("Choisis une carte cible", 1.4);
    Bot.targetMap = id;
    botSaveConfig();
    botLog(`Cap sur ${id.toUpperCase()}…`);
    if (!Bot.active) botSetActive(true);
  });
  document.getElementById("botPlayBtn")?.addEventListener("click", () => botSetActive(!Bot.active));
  // Filtre NPC par map (index des spawns par carte).
  const npcMapFilter = document.getElementById("botNpcMapFilter");
  if (npcMapFilter && !npcMapFilter.dataset.filled) {
    npcMapFilter.dataset.filled = "1";
    const opts = [`<option value="">Toutes les maps</option>`];
    for (const id of BOT_MAPS) opts.push(`<option value="${escapeHtml(id)}">${escapeHtml(id.toUpperCase())}</option>`);
    npcMapFilter.innerHTML = opts.join("");
    if (Bot.npcMapFilter) npcMapFilter.value = Bot.npcMapFilter;
    npcMapFilter.addEventListener("change", () => {
      Bot.npcMapFilter = String(npcMapFilter.value || "");
      botSaveConfig();
      botRenderNpcList();
    });
  }
  const npcUnknown = document.getElementById("botNpcUnknown");
  if (npcUnknown) {
    npcUnknown.checked = Bot.npcIncludeUnknown;
    if (!npcUnknown.dataset.wired) {
      npcUnknown.dataset.wired = "1";
      npcUnknown.addEventListener("change", () => {
        Bot.npcIncludeUnknown = npcUnknown.checked;
        botSaveConfig();
        botRenderNpcList();
      });
    }
  }
  const npcSearch = document.getElementById("botNpcSearch");
  if (npcSearch && !npcSearch.dataset.wired) {
    npcSearch.dataset.wired = "1";
    npcSearch.addEventListener("input", () => botRenderNpcList());
  }
  document.getElementById("botNpcAll")?.addEventListener("click", () => {
    Bot.npcAllow = new Set(Object.keys(NPC_TYPES || {}));
    npcList?.querySelectorAll("input.botNpcSel").forEach((c) => { c.checked = true; });
    botUpdateNpcCount();
    botSaveConfig();
  });
  document.getElementById("botNpcNone")?.addEventListener("click", () => {
    Bot.npcAllow.clear();
    npcList?.querySelectorAll("input.botNpcSel").forEach((c) => { c.checked = false; });
    botUpdateNpcCount();
    botSaveConfig();
  });
  document.getElementById("botBoxAll")?.addEventListener("click", () => {
    Bot.boxAllow = new Set(Object.keys(COLLECTABLE_TYPES || {}));
    boxList?.querySelectorAll('input[type="checkbox"]').forEach((c) => { c.checked = true; });
    botSaveConfig();
  });
  document.getElementById("botBoxNone")?.addEventListener("click", () => {
    Bot.boxAllow.clear();
    boxList?.querySelectorAll('input[type="checkbox"]').forEach((c) => { c.checked = false; });
    botSaveConfig();
  });
  const boxRadius = document.getElementById("botBoxRadius");
  if (boxRadius) {
    boxRadius.value = Bot.boxRadius;
    if (!boxRadius.dataset.wired) {
      boxRadius.dataset.wired = "1";
      boxRadius.addEventListener("change", () => {
        const v = Math.floor(Number(boxRadius.value));
        if (Number.isFinite(v)) {
          Bot.boxRadius = Math.max(0, Math.min(20000, v));
          boxRadius.value = Bot.boxRadius;
          botSaveConfig();
        }
      });
    }
  }
  // Priorité du mode mixte.
  const priority = document.getElementById("botPriority");
  if (priority) {
    priority.value = Bot.priority;
    if (!priority.dataset.wired) {
      priority.dataset.wired = "1";
      priority.addEventListener("change", () => {
        if (["npc", "box", "nearest"].includes(priority.value)) Bot.priority = priority.value;
        botSaveConfig();
      });
    }
  }
  // Lieu de réapparition.
  const respawnSel = document.getElementById("botRespawn");
  if (respawnSel) {
    respawnSel.value = Bot.respawn;
    if (!respawnSel.dataset.wired) {
      respawnSel.dataset.wired = "1";
      respawnSel.addEventListener("change", () => {
        if (["base", "portal", "here"].includes(respawnSel.value)) Bot.respawn = respawnSel.value;
        botSaveConfig();
      });
    }
  }
  // Formations drones par phase (option vide = ne pas changer).
  const formDefs = [
    ["botFormMove", "formMove"],
    ["botFormAttack", "formAttack"],
    ["botFormTravel", "formTravel"],
    ["botFormFlee", "formFlee"],
  ];
  for (const [elId, key] of formDefs) {
    const sel = document.getElementById(elId);
    if (!sel) continue;
    if (!sel.options.length) {
      // account peut être en TDZ au tout premier wire : on affiche tout,
      // le bot ignorera silencieusement les formations non possédées.
      let owned = null;
      try { owned = new Set(account.user?.drones?.formations || []); } catch { owned = null; }
      const opts = [`<option value="">— Ne pas changer —</option>`];
      for (const f of DRONE_FORMATIONS) {
        const tag = owned && !owned.has(f.id) ? " (non possédée)" : "";
        opts.push(`<option value="${escapeHtml(f.id)}">${escapeHtml(f.name)}${tag}</option>`);
      }
      sel.innerHTML = opts.join("");
    }
    sel.value = Bot[key] || "";
    if (!sel.dataset.wired) {
      sel.dataset.wired = "1";
      sel.addEventListener("change", () => { Bot[key] = String(sel.value || ""); botSaveConfig(); });
    }
  }
  // Configurations 1/2 par phase, style boutons segmentés (—, 1, 2).
  const cfgSegDefs = [
    ["botCfgAttackSeg", "cfgAttack"],
    ["botCfgFlySeg", "cfgFly"],
    ["botCfgFleeSeg", "cfgFlee"],
    ["botCfgTravelSeg", "cfgTravel"],
  ];
  for (const [elId, key] of cfgSegDefs) {
    const seg = document.getElementById(elId);
    if (!seg) continue;
    const paint = () => {
      seg.querySelectorAll("button").forEach((b) => {
        b.classList.toggle("on", String(b.dataset.v || "") === String(Bot[key] || ""));
      });
    };
    paint();
    if (!seg.dataset.wired) {
      seg.dataset.wired = "1";
      seg.addEventListener("click", (e) => {
        const b = e.target.closest?.("button");
        if (!b) return;
        const v = String(b.dataset.v || "");
        Bot[key] = v === "1" || v === "2" ? v : "";
        botSaveConfig();
        paint();
      });
    }
  }
  // REX pendant le bot (modes + modules équipés, liste reconstruite).
  botRefreshPetOptions();  const petSel = document.getElementById("botPetMode");
  if (petSel && !petSel.dataset.wired) {
    petSel.dataset.wired = "1";
    petSel.addEventListener("change", () => {
      Bot.petMode = String(petSel.value || "");
      botSaveConfig();
      // Appliqué aussitôt même bot actif (avant : seulement au démarrage).
      if (Bot.active) botApplyPetMode();
    });
  }
  // Verrouillage de cible, orbite, fuite, overlays.
  const lockBox = document.getElementById("botLock");
  if (lockBox) {
    lockBox.checked = Bot.lock;
    if (!lockBox.dataset.wired) {
      lockBox.dataset.wired = "1";
      lockBox.addEventListener("change", () => { Bot.lock = lockBox.checked; botSaveConfig(); });
    }
  }
  const orbitBox = document.getElementById("botOrbit");
  if (orbitBox) {
    orbitBox.checked = Bot.orbit;
    if (!orbitBox.dataset.wired) {
      orbitBox.dataset.wired = "1";
      orbitBox.addEventListener("change", () => { Bot.orbit = orbitBox.checked; botSaveConfig(); });
    }
  }
  const orbitDist = document.getElementById("botOrbitDist");
  if (orbitDist) {
    orbitDist.value = Bot.orbitDist;
    if (!orbitDist.dataset.wired) {
      orbitDist.dataset.wired = "1";
      orbitDist.addEventListener("change", () => {
        const d = Math.floor(Number(orbitDist.value));
        if (Number.isFinite(d)) {
          Bot.orbitDist = Math.max(200, Math.min(2000, d));
          orbitDist.value = Bot.orbitDist;
          botSaveConfig();
          // Les inputs NPC sans surcharge suivent le défaut : on rafraîchit.
          botRenderNpcList();
        }
      });
    }
  }
  const engageDist = document.getElementById("botEngageDist");
  if (engageDist) {
    engageDist.value = Bot.engageDist;
    if (!engageDist.dataset.wired) {
      engageDist.dataset.wired = "1";
      engageDist.addEventListener("change", () => {
        const d = Math.floor(Number(engageDist.value));
        if (Number.isFinite(d)) {
          Bot.engageDist = Math.max(0, Math.min(3000, d));
          engageDist.value = Bot.engageDist;
          botSaveConfig();
        }
      });
    }
  }
  const fleeBox = document.getElementById("botFlee");
  if (fleeBox) {
    fleeBox.checked = Bot.flee;
    if (!fleeBox.dataset.wired) {
      fleeBox.dataset.wired = "1";
      fleeBox.addEventListener("change", () => { Bot.flee = fleeBox.checked; if (!Bot.flee) Bot.fleeing = false; botSaveConfig(); });
    }
  }
  const fleePct = document.getElementById("botFleePct");  if (fleePct) {
    fleePct.value = Bot.fleePct;
    if (!fleePct.dataset.wired) {
      fleePct.dataset.wired = "1";
      fleePct.addEventListener("change", () => {
        const v = Math.floor(Number(fleePct.value));
        if (Number.isFinite(v)) {
          Bot.fleePct = Math.max(5, Math.min(90, v));
          fleePct.value = Bot.fleePct;
          botSaveConfig();
        }
      });
    }
  }
  const fleeResume = document.getElementById("botFleeResume");
  if (fleeResume) {
    fleeResume.value = Bot.fleeResume;
    if (!fleeResume.dataset.wired) {
      fleeResume.dataset.wired = "1";
      fleeResume.addEventListener("change", () => {
        const v = Math.floor(Number(fleeResume.value));
        if (Number.isFinite(v)) {
          Bot.fleeResume = Math.max(10, Math.min(100, v));
          fleeResume.value = Bot.fleeResume;
          botSaveConfig();
        }
      });
    }
  }
  const npcIgnore = document.getElementById("botNpcIgnore");
  if (npcIgnore) {
    npcIgnore.value = Bot.npcIgnoreDist;
    if (!npcIgnore.dataset.wired) {
      npcIgnore.dataset.wired = "1";
      npcIgnore.addEventListener("change", () => {
        const v = Math.floor(Number(npcIgnore.value));
        if (Number.isFinite(v)) {
          Bot.npcIgnoreDist = Math.max(0, Math.min(20000, v));
          npcIgnore.value = Bot.npcIgnoreDist;
          botSaveConfig();
        }
      });
    }
  }
  const skillIemBox = document.getElementById("botSkillIem");
  if (skillIemBox) {
    skillIemBox.checked = Bot.skillIem;
    if (!skillIemBox.dataset.wired) {
      skillIemBox.dataset.wired = "1";
      skillIemBox.addEventListener("change", () => { Bot.skillIem = skillIemBox.checked; botSaveConfig(); });
    }
  }
  const iemFoes = document.getElementById("botIemFoes");
  if (iemFoes) {
    iemFoes.value = Bot.iemFoes;
    if (!iemFoes.dataset.wired) {
      iemFoes.dataset.wired = "1";
      iemFoes.addEventListener("change", () => {
        const v = Math.floor(Number(iemFoes.value));
        if (Number.isFinite(v)) {
          Bot.iemFoes = Math.max(1, Math.min(10, v));
          iemFoes.value = Bot.iemFoes;
          botSaveConfig();
        }
      });
    }
  }
  const skillIshBox = document.getElementById("botSkillIsh");
  if (skillIshBox) {
    skillIshBox.checked = Bot.skillIsh;
    if (!skillIshBox.dataset.wired) {
      skillIshBox.dataset.wired = "1";
      skillIshBox.addEventListener("change", () => { Bot.skillIsh = skillIshBox.checked; botSaveConfig(); });
    }
  }
  const ishPct = document.getElementById("botIshPct");
  if (ishPct) {
    ishPct.value = Bot.ishPct;
    if (!ishPct.dataset.wired) {
      ishPct.dataset.wired = "1";
      ishPct.addEventListener("change", () => {
        const v = Math.floor(Number(ishPct.value));
        if (Number.isFinite(v)) {
          Bot.ishPct = Math.max(5, Math.min(90, v));
          ishPct.value = Bot.ishPct;
          botSaveConfig();
        }
      });
    }
  }
  const rocketsBox = document.getElementById("botRockets");
  if (rocketsBox) {
    rocketsBox.checked = Bot.rockets;
    if (!rocketsBox.dataset.wired) {
      rocketsBox.dataset.wired = "1";
      rocketsBox.addEventListener("change", () => {
        Bot.rockets = rocketsBox.checked;
        botSaveConfig();
        if (Bot.active) botApplyRocketFlags();
      });
    }
  }
  const launchersBox = document.getElementById("botLaunchers");
  if (launchersBox) {
    launchersBox.checked = Bot.launchers;
    if (!launchersBox.dataset.wired) {
      launchersBox.dataset.wired = "1";
      launchersBox.addEventListener("change", () => {
        Bot.launchers = launchersBox.checked;
        botSaveConfig();
        if (Bot.active) botApplyRocketFlags();
      });
    }
  }
  const questsAcceptBox = document.getElementById("botQuestsAccept");
  if (questsAcceptBox) {
    questsAcceptBox.checked = Bot.questsAccept;
    if (!questsAcceptBox.dataset.wired) {
      questsAcceptBox.dataset.wired = "1";
      questsAcceptBox.addEventListener("change", () => { Bot.questsAccept = questsAcceptBox.checked; botSaveConfig(); });
    }
  }
  const questsClaimBox = document.getElementById("botQuestsClaim");
  if (questsClaimBox) {
    questsClaimBox.checked = Bot.questsClaim;
    if (!questsClaimBox.dataset.wired) {
      questsClaimBox.dataset.wired = "1";
      questsClaimBox.addEventListener("change", () => { Bot.questsClaim = questsClaimBox.checked; botSaveConfig(); });
    }
  }
  // Onglet Galaxy : spinner auto + gate + multiplicateur + formation de fin.
  const ggSpinBox = document.getElementById("botGgSpin");
  if (ggSpinBox) {
    ggSpinBox.checked = Bot.ggSpin;
    if (!ggSpinBox.dataset.wired) {
      ggSpinBox.dataset.wired = "1";
      ggSpinBox.addEventListener("change", () => {
        Bot.ggSpin = ggSpinBox.checked;
        Bot.ggSpinT = 0;
        botSaveConfig();
        botLog(Bot.ggSpin ? "GG spinner auto : ON" : "GG spinner auto : OFF");
      });
    } else ggSpinBox.checked = Bot.ggSpin;
  }
  const ggFinishCfgSel = document.getElementById("botGgFinishCfg");
  if (ggFinishCfgSel) {
    ggFinishCfgSel.value = Bot.ggFinishCfg || "";
    if (!ggFinishCfgSel.dataset.wired) {
      ggFinishCfgSel.dataset.wired = "1";
      ggFinishCfgSel.addEventListener("change", () => {
        const v = String(ggFinishCfgSel.value || "");
        Bot.ggFinishCfg = v === "1" || v === "2" ? v : "";
        ggFinishCfgSel.value = Bot.ggFinishCfg;
        botSaveConfig();
      });
    } else ggFinishCfgSel.value = Bot.ggFinishCfg || "";
  }
  const ggSpinsInput = document.getElementById("botGgSpins");
  if (ggSpinsInput) {
    ggSpinsInput.value = Bot.ggSpins;
    if (!ggSpinsInput.dataset.wired) {
      ggSpinsInput.dataset.wired = "1";
      ggSpinsInput.addEventListener("change", () => {
        const v = Math.floor(Number(ggSpinsInput.value));
        if (Number.isFinite(v)) {
          Bot.ggSpins = Math.max(1, Math.min(100, v));
          ggSpinsInput.value = Bot.ggSpins;
          botSaveConfig();
        }
      });
    } else ggSpinsInput.value = Bot.ggSpins;
  }
  const ggMultBox = document.getElementById("botGgAutoMult");
  if (ggMultBox) {
    ggMultBox.checked = Bot.ggAutoMult;
    if (!ggMultBox.dataset.wired) {
      ggMultBox.dataset.wired = "1";
      ggMultBox.addEventListener("change", () => { Bot.ggAutoMult = ggMultBox.checked; botSaveConfig(); });
    } else ggMultBox.checked = Bot.ggAutoMult;
  }
  const ggEnterBox = document.getElementById("botGgAutoEnter");
  if (ggEnterBox) {
    ggEnterBox.checked = Bot.ggAutoEnter;
    if (!ggEnterBox.dataset.wired) {
      ggEnterBox.dataset.wired = "1";
      ggEnterBox.addEventListener("change", () => { Bot.ggAutoEnter = ggEnterBox.checked; botSaveConfig(); });
    } else ggEnterBox.checked = Bot.ggAutoEnter;
  }
  const ggSwitchBox = document.getElementById("botGgNearestSwitch");
  if (ggSwitchBox) {
    ggSwitchBox.checked = Bot.ggNearestSwitch;
    if (!ggSwitchBox.dataset.wired) {
      ggSwitchBox.dataset.wired = "1";
      ggSwitchBox.addEventListener("change", () => { Bot.ggNearestSwitch = ggSwitchBox.checked; botSaveConfig(); });
    } else ggSwitchBox.checked = Bot.ggNearestSwitch;
  }
  const ggFinishSel = document.getElementById("botGgFinishForm");
  if (ggFinishSel) {
    if (!ggFinishSel.options.length) {
      const opts = [`<option value="">— Ne pas changer —</option>`];
      try {
        for (const f of DRONE_FORMATIONS) opts.push(`<option value="${escapeHtml(f.id)}">${escapeHtml(f.name)}</option>`);
      } catch {}
      ggFinishSel.innerHTML = opts.join("");
    }
    ggFinishSel.value = Bot.ggFinishForm || "";
    if (!ggFinishSel.dataset.wired) {
      ggFinishSel.dataset.wired = "1";
      ggFinishSel.addEventListener("change", () => { Bot.ggFinishForm = String(ggFinishSel.value || ""); botSaveConfig(); });
    } else ggFinishSel.value = Bot.ggFinishForm || "";
  }
  const cargoBox = document.getElementById("botCargo");
  if (cargoBox) {
    cargoBox.checked = Bot.cargo;    if (!cargoBox.dataset.wired) {
      cargoBox.dataset.wired = "1";
      cargoBox.addEventListener("change", () => {
        Bot.cargo = cargoBox.checked;
        if (!Bot.cargo) { Bot.selling = false; Bot.travelOverride = ""; }
        botSaveConfig();
      });
    }
  }
  const cargoPct = document.getElementById("botCargoPct");  if (cargoPct) {
    cargoPct.value = Bot.cargoPct;
    if (!cargoPct.dataset.wired) {
      cargoPct.dataset.wired = "1";
      cargoPct.addEventListener("change", () => {
        const v = Math.floor(Number(cargoPct.value));
        if (Number.isFinite(v)) {
          Bot.cargoPct = Math.max(50, Math.min(100, v));
          cargoPct.value = Bot.cargoPct;
          botSaveConfig();
        }
      });
    }
  }
  const sellBaseSel = document.getElementById("botSellBase");
  if (sellBaseSel) {
    sellBaseSel.value = Bot.sellBase || "auto";
    if (!sellBaseSel.dataset.wired) {
      sellBaseSel.dataset.wired = "1";
      sellBaseSel.addEventListener("change", () => {
        const v = String(sellBaseSel.value || "auto");
        Bot.sellBase = ["auto", "low", "high"].includes(v) ? v : "auto";
        sellBaseSel.value = Bot.sellBase;
        botSaveConfig();
      });
    }
  }
  const refineDefs = [
    ["botRefineLaser", "botRefineLaserQty", "laser"],
    ["botRefineShield", "botRefineShieldQty", "shield"],
    ["botRefineRocket", "botRefineRocketQty", "rocket"],
    ["botRefineSpeed", "botRefineSpeedQty", "speed"],
  ];
  for (const [selId, qtyId, slot] of refineDefs) {
    const sel = document.getElementById(selId);
    const qty = document.getElementById(qtyId);
    if (sel && !sel.options.length) {
      const ores = UPGRADE_SLOT_ORES[slot] || [];
      const opts = [`<option value="">—</option>`];
      for (const ore of ores) {
        const bonus = Math.round(Number(UPGRADE_ORE_BONUS[ore]?.[slot] || 0) * 100);
        opts.push(`<option value="${escapeHtml(ore)}">${escapeHtml(getResourceName(ore))}${bonus > 0 ? ` +${bonus}%` : ""}</option>`);
      }
      sel.innerHTML = opts.join("");
    }
    if (sel) sel.value = Bot.refine?.[slot]?.ore || "";
    if (qty) qty.value = Bot.refine?.[slot]?.qty ?? 20;
    if (sel && !sel.dataset.wired) {
      sel.dataset.wired = "1";
      sel.addEventListener("change", () => {
        const ore = String(sel.value || "").toLowerCase();
        Bot.refine[slot].ore = (UPGRADE_SLOT_ORES[slot] || []).includes(ore) ? ore : "";
        botSaveConfig();
      });
    }
    if (qty && !qty.dataset.wired) {
      qty.dataset.wired = "1";
      qty.addEventListener("change", () => {
        const v = Math.floor(Number(qty.value));
        if (Number.isFinite(v)) {
          Bot.refine[slot].qty = Math.max(1, Math.min(999, v));
          qty.value = Bot.refine[slot].qty;
          botSaveConfig();
        }
      });
    }
  }
  const overlayBox = document.getElementById("botOverlay");  if (overlayBox) {
    overlayBox.checked = Bot.overlay;
    if (!overlayBox.dataset.wired) {
      overlayBox.dataset.wired = "1";
      overlayBox.addEventListener("change", () => { Bot.overlay = overlayBox.checked; botSaveConfig(); });
    }
  }
  // Élargissement unique de la fenêtre (l'ancienne largeur sauvegardée
  // écraserait sinon le nouveau layout large).
  try {
    if (!localStorage.getItem("orbit_bot_wide_v2")) {
      localStorage.setItem("orbit_bot_wide_v2", "1");
      const card = document.getElementById("botWindow");
      if (card && card.getBoundingClientRect().width < 900) {
        card.style.width = "1080px";
        card.style.minWidth = "0";
        card.style.maxWidth = "none";
        card.style.boxSizing = "border-box";
      }
    }
  } catch {}
  window.addEventListener("orbit:window-restored", (event) => {
    if (event.detail?.id === "botWindow") {
      botRefreshHud();
      // L'équipement REX a pu changer (boutique) : on resynchronise la liste.
      botRefreshPetOptions();
    }
  });
  // La liste NPC dépend de l'index des maps (chargé en async) : on la
  // reconstruit dès qu'il arrive.
  window.addEventListener("orbit:npc-locations-ready", () => botRenderNpcList());
  botRefreshHud();
  // Reprise auto après un changement de map avec rechargement : le bot
  // était actif, il repart seul (vrai farm background inter-maps).
  if (wasActive) setTimeout(() => { if (!Bot.active) botSetActive(true); }, 3000);
}

// Cibles du module Quest : types NPC / box réclamés par les quêtes actives
// non terminées (objectifs tuer/collecter). "*" = tout type accepté.
function botQuestTargets() {
  const npcs = new Set();
  const boxes = new Set();
  try {
    for (const [id, prog] of Object.entries(questState.active || {})) {
      const q = QUEST_DEFINITIONS.find(item => item.id === id);
      if (!q) continue;
      let objs = [];
      try { objs = getQuestObjectives(q); } catch { continue; }
      for (const o of objs) {
        if (Number(prog?.[o.id] || 0) >= o.amount) continue;
        if (o.kind === "kill") npcs.add(String(o.type));
        else if (o.kind === "collect") boxes.add(String(o.type));
      }
    }
  } catch {}
  return { npcs, boxes };
}

// Plus proche NPC de quête (priorité DarkBot puis distance).
function botNearestQuestNpc(set) {
  let best = null;
  let bestD2 = Infinity;
  const ignore2 = Bot.npcIgnoreDist > 0 ? Bot.npcIgnoreDist * Bot.npcIgnoreDist : 0;
  const any = set.has("*");
  for (const e of enemies) {
    if (!e || Number(e.hp) <= 0) continue;
    if (e.isPetTarget) continue;
    if (Bot.npcAllow.size && !Bot.npcAllow.has(String(e.type))) continue;
    if (!any && !set.has(String(e.type))) continue;
    try { if (typeof npcIsInSafeZone === "function" && npcIsInSafeZone(e)) continue; } catch {}
    const d2 = dist2(player.x, player.y, e.x, e.y);
    if (ignore2 > 0 && d2 > ignore2) continue;
    const pr = botNpcPrio(e.type);
    const bpr = best ? botNpcPrio(best.type) : -1;
    if (!best || pr > bpr || (pr === bpr && d2 < bestD2)) { bestD2 = d2; best = e; }
  }
  return best ? { npc: best, d2: bestD2 } : null;
}

function botNearestQuestBox(set) {
  let best = null;
  let bestD2 = Infinity;
  const rad2 = Bot.boxRadius > 0 ? Bot.boxRadius * Bot.boxRadius : 0;
  for (const c of collectables) {
    if (!c) continue;
    if (Bot.boxAllow.size && !Bot.boxAllow.has(String(c.type))) continue;
    if (!set.has(String(c.type))) continue;
    const d2 = dist2(player.x, player.y, c.x, c.y);
    if (rad2 > 0 && d2 > rad2) continue;
    if (d2 < bestD2) { bestD2 = d2; best = c; }
  }
  return best ? { box: best, d2: bestD2 } : null;
}

// Plus proche NPC vivant (module Galaxy Gates : vagues imposées, pas de filtre).
function botNearestAnyNpc() {
  let best = null;
  let bestD2 = Infinity;
  for (const e of enemies) {
    if (!e || Number(e.hp) <= 0) continue;
    if (e.isPetTarget) continue;
    const d2 = dist2(player.x, player.y, e.x, e.y);
    if (d2 < bestD2) { bestD2 = d2; best = e; }
  }
  return best ? { npc: best, d2: bestD2 } : null;
}

function botNearestNpc() {
  let best = null;
  let bestD2 = Infinity;
  const ignore2 = Bot.npcIgnoreDist > 0 ? Bot.npcIgnoreDist * Bot.npcIgnoreDist : 0;
  for (const e of enemies) {
    if (!e || Number(e.hp) <= 0) continue;
    if (e.isPetTarget) continue;
    if (Bot.npcAllow.size && !Bot.npcAllow.has(String(e.type))) continue;
    try { if (typeof npcIsInSafeZone === "function" && npcIsInSafeZone(e)) continue; } catch {}
    const d2 = dist2(player.x, player.y, e.x, e.y);
    if (ignore2 > 0 && d2 > ignore2) continue;
    const pr = botNpcPrio(e.type);
    const bpr = best ? botNpcPrio(best.type) : -1;
    if (!best || pr > bpr || (pr === bpr && d2 < bestD2)) { bestD2 = d2; best = e; }
  }
  return best ? { npc: best, d2: bestD2 } : null;
}

function botNearestBox() {
  let best = null;
  let bestD2 = Infinity;
  const rad2 = Bot.boxRadius > 0 ? Bot.boxRadius * Bot.boxRadius : 0;
  for (const c of collectables) {
    if (!c) continue;
    if (Bot.boxAllow.size && !Bot.boxAllow.has(String(c.type))) continue;
    const d2 = dist2(player.x, player.y, c.x, c.y);
    if (rad2 > 0 && d2 > rad2) continue;
    if (d2 < bestD2) { bestD2 = d2; best = c; }
  }
  return best ? { box: best, d2: bestD2 } : null;
}

// Itinéraire physique entre deux maps via le graphe des portails (BFS).
// Retourne [from, ..., to] ou null (index pas prêt ou aucune route).
function botFindRoute(from, to) {
  from = String(from || "").toLowerCase();
  to = String(to || "").toLowerCase();
  if (!from || !to) return null;
  if (from === to) return [to];
  const idx = botPortalIndex;
  if (!idx) return null;
  const prev = new Map([[from, null]]);
  const queue = [from];
  while (queue.length) {
    const cur = queue.shift();
    for (const nxt of idx[cur] || []) {
      if (prev.has(nxt)) continue;
      prev.set(nxt, cur);
      if (nxt === to) {
        const path = [to];
        let c = to;
        while (prev.get(c)) { c = prev.get(c); path.unshift(c); }
        return path;
      }
      queue.push(nxt);
    }
  }
  return null;
}

// Onglet Galaxy : switch adouci vers le plus proche en gate.
// Délai minimum entre deux switchs volontaires + la nouvelle cible doit être
// nettement plus proche (évite l'oscillation A↔B qui mitraille les cooldowns).
const BOT_GG_SWITCH_DELAY = 1.5;
const BOT_GG_SWITCH_CLOSER2 = 0.72; // (0.85)^2 : ~15 % plus proche en distance.

// Formation / config de fin : UNIQUEMENT dès que le Cubikon est mort
// (complétion en cours), jusqu'au renvoi sur la map mère. Pas pendant la
// vague Cubikon : le combat se fait en formation d'attaque normale.
function botGalaxyIsFinishWave() {
  try {
    return gateCompletionPending === true;
  } catch { return false; }
}

function botApplyGalaxyFinishFormation() {
  if (!botGalaxyIsFinishWave()) return;
  try {
    if (Bot.ggFinishForm) botApplyFormation(Bot.ggFinishForm);
  } catch {}
  try {
    if (Bot.ggFinishCfg === "1" || Bot.ggFinishCfg === "2") botApplyConfig(Number(Bot.ggFinishCfg));
  } catch {}
}

// Excursion radiation en gate : quand le kite est plaqué contre un bord
// (cible clampée ≈ sur place) avec une menace proche, on autorise une sortie
// courte hors map pour esquiver et se replacer au lieu de rester fixe contre
// le mur. 5 s gratuites sans dégâts (on reste sous ~3,5 s d'exposition,
// ~500 m de profondeur max), exposition remise à 0 dès la rentrée, et les
// NPC suivent peu/nul dehors : respiration garantie.
function botGateKiteTarget(rawX, rawY, threatClose) {
  const inside = { x: clamp(rawX, 120, WORLD.w - 120), y: clamp(rawY, 120, WORLD.h - 120) };
  try {
    if (rules?.mode !== "gate") return inside;
    let outside = false, exp = 0;
    try { outside = playerIsOutsideWorld(); exp = Number(radiationSystem?.state?.exposure) || 0; } catch {}
    if (outside) {
      // Dehors : on y reste brièvement si menace proche et exposition faible,
      // sinon on rentre aussitôt.
      if (threatClose && exp < 2.5) {
        return { x: clamp(rawX, -500, WORLD.w + 500), y: clamp(rawY, -500, WORLD.h + 500) };
      }
      return inside;
    }
    if (!threatClose) return inside;
    const blocked = Math.hypot(inside.x - player.x, inside.y - player.y) < 150;
    if (!blocked || exp > 3.5) return inside;
    return { x: clamp(rawX, -500, WORLD.w + 500), y: clamp(rawY, -500, WORLD.h + 500) };
  } catch { return inside; }
}

// Spinner auto hors gate (toutes les 100 ms) : multiplicateur auto puis
// spins sur l'ensemble Alpha + Beta + Gamma (une seule roue). Le placement
// sur la map est automatique (voir GALAXY_GATES.js) : la 2e GG reste en
// stock 1/1 tant qu'un portail est déjà posé.
function botTickGalaxySpin(dt) {
  if (!Bot.ggSpin || Bot.module !== "galaxy" || rules?.mode === "gate") return false;
  Bot.ggSpinT -= dt;
  Bot.ggUiT -= dt;
  if (Bot.ggSpinT > 0) return false;
  Bot.ggSpinT = 0.1;
  let user = null;
  try { user = account.user || getCurrentUserFull(); } catch { user = null; }
  const st = user?.galaxyGates;
  if (!st) return false;
  // Alpha / Beta / Gamma ne font qu'un (groupe "ensemble") : spinner Alpha.
  const gateId = "alpha";
  // Multiplicateur auto : on l'arme dès qu'il est disponible (x2+).
  if (Bot.ggAutoMult && Number(st.multiplier) > 1 && st.multiplierArmed !== true) {
    try {
      const armed = armCurrentUserGalaxyGateMultiplier(gateId, true);
      if (armed?.ok) {
        account.user = armed.user;
        loadAccountUser();
        renderGalaxyGateWindow("Multiplicateur activé (bot).");
        botLog(`GG ${gateId.toUpperCase()} : multiplicateur x${armed.state?.multiplier ?? st.multiplier} activé`);
        user = armed.user;
      }
    } catch {}
  }
  const built = Number(user?.galaxyGates?.built?.[gateId] || 0);
  if (built >= GALAXY_GATE_BUILD_LIMIT) return false;
  const spins = Math.max(1, Math.min(100, Math.floor(Number(Bot.ggSpins) || 1)));
  let result = null;
  try { result = spinCurrentUserGalaxyGate(gateId, spins); } catch { result = null; }
  if (!result) return false;
  if (!result.ok) {
    Bot.status = "Galaxy Gates";
    Bot.target = String(result.error || "Spin impossible").slice(0, 60);
    return true;
  }
  try {
    account.user = result.user;
    loadAccountUser();
    player.credits = result.user.credits;
    player.ammo.x2 = result.user.ammo.x2;
    player.ammo.x3 = result.user.ammo.x3;
    player.ammo.x4 = result.user.ammo.x4;
    player.ammo.sab = result.user.ammo.sab;
    player.ammo.x6 = result.user.ammo.x6;
    player.rockets = player.rockets || {};
    for (const [rocketId, amount] of Object.entries(result.user.rockets || {})) player.rockets[rocketId] = amount;
    updateAmmoUI();
  } catch {}
  const autoPlaced = Array.isArray(result.rewards?.autoDeployed) ? result.rewards.autoDeployed : [];
  const builtNow = Number(result.state?.built?.[gateId] || 0);
  const isBuilt = builtNow >= GALAXY_GATE_BUILD_LIMIT || autoPlaced.length > 0;
  // À 10 passages/s on ne rebuild l'UI et le journal que toutes les ~2 s
  // (ou dès qu'une gate est construite / placée).
  const uiDue = isBuilt || Bot.ggUiT <= 0;
  if (uiDue) {
    Bot.ggUiT = 2;
    try { renderGalaxyGateWindow(`${result.performed} spin(s) auto (ensemble)`); } catch {}
    if (!isBuilt) botLog(`GG spinner auto : +${result.performed} spin(s) (ensemble)`);
  }
  // Sécurité legacy : une vieille sauvegarde avec built=1 + non déployée
  // est posée sur la map (normalement déjà migrée par normalize).
  for (const id of ["alpha", "beta", "gamma"]) {
    if (Number(result.state?.built?.[id] || 0) >= GALAXY_GATE_BUILD_LIMIT && result.state?.deployed?.[id] !== true && result.state?.active !== id) {
      try {
        const dep = deployCurrentUserGalaxyGate(id);
        if (dep?.ok) {
          account.user = dep.user;
          loadAccountUser();
          renderGalaxyGateWindow(`${GALAXY_GATE_DEFINITIONS[id].name} envoyée sur la map (bot).`);
        }
      } catch {}
    }
  }
  for (const id of autoPlaced) botLog(`GG ${String(id).toUpperCase()} placée sur la map — direction le portail`);
  return true;
}

// Retourne la gate à jouer : active en priorité, sinon la première
// construite / déployée de l'ensemble (Alpha → Beta → Gamma).
// Null = rien à entrer pour l'instant.
function botPickReadyGalaxyGate() {
  let st = null;
  try { st = (account.user || getCurrentUserFull())?.galaxyGates; } catch { st = null; }
  if (!st) return null;
  const order = ["alpha", "beta", "gamma"];
  if (st.active && GALAXY_GATE_DEFINITIONS[st.active]) return st.active;
  for (const id of order) {
    if (Number(st.built?.[id] || 0) >= GALAXY_GATE_BUILD_LIMIT || st.deployed?.[id] === true) return id;
  }
  return null;
}

// Hors gate, module Galaxy : vole vers la base mère puis vers le portail GG
// déployé et saute dedans. Retourne true si ce comportement a pris la main.
function botTickGalaxyEnter(dt) {
  if (Bot.module !== "galaxy" || !Bot.ggAutoEnter) return false;
  if (rules?.mode === "gate") return false;
  if (Bot.selling || Bot.fleeing) return false;
  const gateId = botPickReadyGalaxyGate();
  if (!gateId) return false;
  let st = null;
  try { st = (account.user || getCurrentUserFull())?.galaxyGates; } catch { st = null; }
  // Sécurité legacy : pose un stock restant non déployé (migration auto normale).
  if (Number(st?.built?.[gateId] || 0) >= GALAXY_GATE_BUILD_LIMIT && st?.deployed?.[gateId] !== true && st?.active !== gateId) {
    try {
      const dep = deployCurrentUserGalaxyGate(gateId);
      if (dep?.ok) {
        account.user = dep.user;
        loadAccountUser();
        renderGalaxyGateWindow(`${GALAXY_GATE_DEFINITIONS[gateId].name} envoyée sur la map (bot).`);
        botLog(`GG ${gateId.toUpperCase()} déployée — direction le portail`);
      }
    } catch {}
  }
  const user = account.user || getCurrentUserFull();
  const homeMap = String(getFactionHomeMap(user?.faction) || "").toLowerCase();
  const curMap = String(window.__CURRENT_MAP_ID__ || "1-1").toLowerCase();
  Bot.ggJumpCd -= dt;
  botApplyFormation(Bot.formTravel || Bot.formMove);
  botApplyConfig(Bot.cfgTravel || Bot.cfgFly);
  // 1. Rejoindre la base mère (voyage physique portail par portail).
  if (homeMap && curMap !== homeMap) {
    if (!botPortalIndex) {
      Bot.status = "Galaxy Gates";
      Bot.target = `Retour base ${homeMap.toUpperCase()}…`;
      botRefreshHudThrottled(dt);
      return true;
    }
    const route = botFindRoute(curMap, homeMap);
    if (!route) {
      Bot.status = "Galaxy Gates";
      Bot.target = `Base ${homeMap.toUpperCase()} inaccessible`;
      botRefreshHudThrottled(dt);
      return true;
    }
    const nextHop = route[1] || homeMap;
    const portalStep = (zonePortals || []).find((p) => String(p.toMap || "").toLowerCase() === nextHop);
    if (!portalStep) {
      Bot.status = "Galaxy Gates";
      Bot.target = `Portail vers ${nextHop.toUpperCase()} introuvable`;
      botRefreshHudThrottled(dt);
      return true;
    }
    Bot.status = `Galaxy Gates → ${gateId.toUpperCase()}`;
    Bot.target = `Retour base (${Math.round(Math.hypot(portalStep.x - player.x, portalStep.y - player.y))}m)`;
    if (attackActive) { try { stopAttack(); } catch {} }
    try { cancelCollectableTarget(); } catch {}
    moveTarget.active = true;
    moveTarget.x = clamp(portalStep.x, 80, WORLD.w - 80);
    moveTarget.y = clamp(portalStep.y, 80, WORLD.h - 80);
    if (isPlayerNearPortal(portalStep) && mapPortalLock <= 0 && !portalStep.jumping && Bot.ggJumpCd <= 0) {
      Bot.ggJumpCd = 3;
      try { if (startZonePortalJump(portalStep)) botLog(`Galaxy : transit vers ${nextHop.toUpperCase()}`); } catch {}
    }
    botRefreshHudThrottled(dt);
    return true;
  }
  // 2. Sur la base mère : foncer sur le portail GG et sauter dedans.
  const ggPortal = (zonePortals || []).find((p) => String(p.toMap || "").toLowerCase() === gateId);
  if (!ggPortal) {
    Bot.status = "Galaxy Gates";
    Bot.target = `Portail ${gateId.toUpperCase()} introuvable (spinner ?)`;
    botRefreshHudThrottled(dt);
    return true;
  }
  Bot.status = `Galaxy Gates → ${gateId.toUpperCase()}`;
  Bot.target = `Portail GG (${Math.round(Math.hypot(ggPortal.x - player.x, ggPortal.y - player.y))}m)`;
  if (attackActive) { try { stopAttack(); } catch {} }
  try { cancelCollectableTarget(); } catch {}
  try { if (Target.get()) Target.clear(); } catch {}
  moveTarget.active = true;
  moveTarget.x = clamp(ggPortal.x, 80, WORLD.w - 80);
  moveTarget.y = clamp(ggPortal.y, 80, WORLD.h - 80);
  if (isPlayerNearPortal(ggPortal) && mapPortalLock <= 0 && !ggPortal.jumping && Bot.ggJumpCd <= 0) {
    Bot.ggJumpCd = 3;
    try {
      if (startZonePortalJump(ggPortal)) botLog(`Entrée GG ${gateId.toUpperCase()}…`);
      else Bot.target = "Portail GG : spinner requis";
    } catch {}
  }
  botRefreshHudThrottled(dt);
  return true;
}

function tickBot(dt) {
  try { botRecordSightings(dt); } catch {}
  if (!Bot.active) return;
  if (!started || player.dead) {
    // Compteur de kills/boxes : la cible a disparu pendant la mort.
    Bot.lastNpcId = null;
    Bot.lastBoxId = null;
    Bot.fleeing = false;
    if (player.dead && started) {
      if (!Bot.wasDead) {
        Bot.wasDead = true;
        Bot.deaths++;
        botRefreshHud();
        if (Bot.maxDeaths > 0 && Bot.deaths >= Bot.maxDeaths) {
          botLog(`Limite de morts atteinte (${Bot.deaths}) — arrêt du bot`);
          botSetActive(false);
          return;
        }
      }
      if (Bot.autoRepair && Bot.active) {
        Bot.repairT += dt;
        if (rules?.mode === "gate") {
          // En Galaxy Gate : seule la sortie vers la base existe.
          Bot.status = "En réparation…";
          Bot.target = "Retour base (gate)";
          if (Bot.repairT >= Math.max(0, Bot.reviveWait)) {
            Bot.repairT = 0;
            try { respawnBaseGate(); botLog("Gate terminée — retour base"); } catch {}
          }
        } else {
        const where = Bot.respawn === "portal" ? "portail" : Bot.respawn === "here" ? "sur place" : "base";
        Bot.status = "En réparation…";
        Bot.target = `Retour ${where}`;
        if (Bot.repairT >= Math.max(0, Bot.reviveWait)) {
          Bot.repairT = 0;
          try {
            if (Bot.respawn === "portal") { respawnNearestPortal(); botLog("Réparation auto au portail"); }
            else if (Bot.respawn === "here") { respawnHere(); botLog("Réparation auto sur place"); }
            else { respawnBase(); botLog("Réparation auto à la base"); }
          } catch {}
        }
        }
      }
    }
    if (Bot.hudT !== 1) { Bot.hudT = 1; botRefreshHud(); }
    return;
  }
  Bot.wasDead = false;

  // Main manuelle récente : le joueur reprend la main, le bot attend.
  // Prioritaire sur tout (fuite et voyage compris).
  if (performance.now() - Bot.manualT < 2500) {
    Bot.status = "Manuel (reprise…)";
    botRefreshHudThrottled(dt);
    return;
  }

  // Flags roquettes auto tenus en continu (restaurés à l'arrêt).
  botApplyRocketFlags();

  // Compétences auto : IEM si assailli par N+, ISH si coque critique.
  // Vérifiés prêts avant appel (pas de spam de toasts de recharge).
  if ((Bot.skillIem || Bot.skillIsh) && started && !player.dead) {
    let foes = 0;
    try {
      for (const e of enemies) {
        if (npcIsEngagingPlayer(e)) {
          foes++;
          if (foes >= Math.max(1, Bot.iemFoes)) break;
        }
      }
    } catch { foes = 0; }
    if (Bot.skillIem && foes >= Math.max(1, Bot.iemFoes) && pulseCd <= 0 && player.credits >= PULSE_COST) {
      try { usePulse(); botLog(`IEM auto (${foes} assaillants)`); } catch {}
    }
    if (Bot.skillIsh && ishCd <= 0 && player.credits >= ISH_COST) {
      const hpM = Math.max(1, Number(player.hpMax) || 1);
      const hpP = (Number(player.hp) || 0) / hpM * 100;
      if (hpP < Bot.ishPct) {
        try { useIsh(); botLog(`ISH auto (${Math.round(hpP)} % coque)`); } catch {}
      }
    }
  }

  // Quêtes auto (rend + accept au terminal), throttlé en interne.
  if (Bot.questsAccept || Bot.questsClaim) botTickQuests(dt);

  // Seuil de fuite : coque basse → repli au portail le plus proche, le
  // robot réparateur passif remonte la coque, reprise au seuil + 20 %.
  // Prioritaire sur le voyage et le farm : la survie d'abord.
  const hpMaxSafe = Math.max(1, Number(player.hpMax) || 1);
  const hpPct = (Number(player.hp) || 0) / hpMaxSafe * 100;
  if (Bot.flee && !Bot.fleeing && hpPct < Bot.fleePct) {
    Bot.fleeing = true;
    try { stopAttack(); } catch {}
    try { cancelCollectableTarget(); } catch {}
    try { if (Target.get()) Target.clear(); } catch {}
    botLog(`Coque à ${Math.round(hpPct)} % — fuite au portail`);
  }
  if (Bot.fleeing) {
    // Reprise explicite (style DarkBot REPAIR_HP_RANGE), plancher = seuil + 5.
    const resumeAt = Math.max(Math.min(100, Bot.fleeResume), Bot.fleePct + 5);
    if (hpPct >= resumeAt) {
      Bot.fleeing = false;
      botLog(`Réparé (${Math.round(hpPct)} %) — reprise du farm`);
    } else {
      Bot.status = "Fuite — réparation";
      Bot.target = `Coque ${Math.round(hpPct)} % (reprise à ${resumeAt} %)`;
      botApplyFormation(Bot.formFlee || Bot.formMove);
      botApplyConfig(Bot.cfgFlee || Bot.cfgFly);
      const shelter = getNearestPortalTo(player.x, player.y);
      if (shelter) {
        if (attackActive) { try { stopAttack(); } catch {} }
        moveTarget.active = true;
        moveTarget.x = clamp(shelter.x, 80, WORLD.w - 80);
        moveTarget.y = clamp(shelter.y, 80, WORLD.h - 80);
      } else if (rules?.mode === "gate") {
        // En Galaxy Gate : pas de portail → kiting : on fuit les menaces en
        // faisant le tour de la map (jamais planté au milieu), tirs coupés,
        // jusqu'à repasser au-dessus du seuil de reprise.
        if (attackActive) { try { stopAttack(); } catch {} }
        try { if (Target.get()) Target.clear(); } catch {}
        let fx = 0, fy = 0;
        for (const e of enemies) {
          if (!e || Number(e.hp) <= 0) continue;
          const ex = player.x - e.x, ey = player.y - e.y;
          const ed = Math.hypot(ex, ey) || 1;
          const w = Math.min(1, 1400 / ed);
          fx += (ex / ed) * w;
          fy += (ey / ed) * w;
        }
        const fl = Math.hypot(fx, fy);
        if (fl > 0.01) {
          // Composante tangentielle pour tourner autour de la map au lieu
          // de se coincer dans un coin (sortie radiation autorisée si plaqué).
          const tx = -fy / fl, ty = fx / fl;
          const rawX = player.x + fx / fl * 900 + tx * 550;
          const rawY = player.y + fy / fl * 900 + ty * 550;
          let nearestD = Infinity;
          try {
            for (const e of enemies) {
              if (!e || Number(e.hp) <= 0) continue;
              const dd = Math.hypot(player.x - e.x, player.y - e.y);
              if (dd < nearestD) nearestD = dd;
            }
          } catch {}
          const tgt = botGateKiteTarget(rawX, rawY, nearestD < 600);
          moveTarget.active = true;
          moveTarget.x = tgt.x;
          moveTarget.y = tgt.y;
        } else {
          moveTarget.active = false;
        }
      } else {
        // Pas de portail sur cette map : on tient position, tirs coupés.
        if (attackActive) { try { stopAttack(); } catch {} }
        moveTarget.active = false;
      }
      botRefreshHudThrottled(dt);
      return;
    }
  }

  // Soute pleine : on raffine d'abord (charge les améliorations), et
  // seulement si vraiment pas moyen on va vendre au comptoir.
  // Jamais en Galaxy Gate (pas de comptoir, pas de sortie auto).
  if (Bot.cargo && !Bot.selling && !player.dead && started && rules?.mode !== "gate") {
    try {
      const c = currentCargo();
      if (c.capacity > 0 && c.used / c.capacity * 100 >= Bot.cargoPct) {
        try { stopAttack(); } catch {}
        try { cancelCollectableTarget(); } catch {}
        try { if (Target.get()) Target.clear(); } catch {}
        const freed = botRefineUpgrades();
        const after = currentCargo();
        if (after.capacity > 0 && after.used / after.capacity * 100 < Bot.cargoPct) {
          botLog(freed > 0 ? `Soute allégée par raffinage (${freed} minerais) — reprise` : "Soute sous le seuil — reprise");
        } else {
          Bot.selling = true;
          botLog(`Soute pleine (${formatInteger(after.used)}/${formatInteger(after.capacity)}) — direction comptoir`);
        }
      }
    } catch {}
  }
  if (Bot.selling) {
    const trade = botNearestTradeModule();
    if (!trade) {
      // Pas de comptoir ici : base la plus proche (X-1 / X-8, préférence
      // respectée), fallback sur l'autre base si besoin.
      const cur = String(window.__CURRENT_MAP_ID__ || "").toLowerCase();
      const next = botPickSellBase(cur).find((m) => m !== cur);
      if (next) {
        if (Bot.travelOverride !== next) botLog(`Direction base ${next.toUpperCase()} (vente)`);
        Bot.travelOverride = next;
      } else {
        Bot.selling = false;
        Bot.travelOverride = null;
        botLog("Soute : aucune base accessible — vente annulée");
      }
    } else {
      Bot.travelOverride = null;
      if (isPlayerNearTradeModule(trade.module)) {
        const gained = botSellOres();
        Bot.selling = false;
        botLog(gained > 0 ? `Vente comptoir : +${formatInteger(gained)} crédits — reprise` : "Soute : rien à vendre — reprise");
      } else {
        Bot.status = "Vente — comptoir";
        Bot.target = `Comptoir (${Math.round(Math.sqrt(trade.d2))}m)`;
        botApplyFormation(Bot.formMove);
        botApplyConfig(Bot.cfgFly);
        if (attackActive) { try { stopAttack(); } catch {} }
        moveTarget.active = true;
        moveTarget.x = clamp(trade.pos.x, 80, WORLD.w - 80);
        moveTarget.y = clamp(trade.pos.y, 80, WORLD.h - 80);
        botRefreshHudThrottled(dt);
        return;
      }
    }
  }

  // Voyage inter-maps : 100 % physique, de portail en portail (BFS).
  // AUCUNE téléportation : le vaisseau vole vraiment jusqu'au portail
  // puis saute, étape par étape jusqu'à la carte cible.
  // travelOverride (vente) prime sur la carte cible de l'utilisateur.
  const effRaw = Bot.travelOverride || Bot.targetMap || "";
  const wantMap = String(effRaw).toLowerCase();
  const curMap = String(window.__CURRENT_MAP_ID__ || "1-1").toLowerCase();
  // Module Galaxy Gates : le voyage manuel est désactivé (l'entrée GG gère
  // elle-même le retour base + le saut), sauf override de vente.
  if (wantMap && wantMap !== curMap && (Bot.autoTravel || Bot.travelOverride) && (Bot.module !== "galaxy" || Bot.travelOverride)) {
    Bot.travelCd -= dt;
    Bot.jumpCd -= dt;
    botApplyFormation(Bot.formTravel);
    botApplyConfig(Bot.cfgTravel);
    if (!botPortalIndex) {
      Bot.status = `Voyage → ${String(effRaw).toUpperCase()}`;
      Bot.target = "Cartographie des portails…";
      botRefreshHudThrottled(dt);
      return;
    }
    const route = botFindRoute(curMap, wantMap);
    if (!route) {
      Bot.status = `Voyage → ${String(effRaw).toUpperCase()}`;
      Bot.target = "Aucune route physique";
      if (Bot.travelCd <= 0) {
        Bot.travelCd = 15;
        botLog(`Aucune route physique vers ${String(effRaw).toUpperCase()} — nouvel essai dans 15 s`);
      }
      botRefreshHudThrottled(dt);
      return;
    }
    const nextHop = route[1] || wantMap;
    const portal = (zonePortals || []).find((p) => String(p.toMap || "").toLowerCase() === nextHop);
    if (!portal) {
      Bot.status = `Voyage → ${Bot.targetMap.toUpperCase()}`;
      Bot.target = `Portail vers ${nextHop.toUpperCase()} introuvable ici`;
      botRefreshHudThrottled(dt);
      return;
    }
    const step = route.length > 2 ? ` (via ${nextHop.toUpperCase()})` : "";
    Bot.status = `Voyage → ${String(effRaw).toUpperCase()}${step}`;
    Bot.target = `Portail (${Math.round(Math.hypot(portal.x - player.x, portal.y - player.y))}m)`;
    if (performance.now() - Bot.manualT < 2500) { botRefreshHudThrottled(dt); return; }
    if (attackActive) { try { stopAttack(); } catch {} }
    try { cancelCollectableTarget(); } catch {}
    moveTarget.active = true;
    moveTarget.x = clamp(portal.x, 80, WORLD.w - 80);
    moveTarget.y = clamp(portal.y, 80, WORLD.h - 80);
    if (isPlayerNearPortal(portal) && mapPortalLock <= 0 && !portal.jumping && Bot.jumpCd <= 0) {
      Bot.jumpCd = 3;
      try {
        if (startZonePortalJump(portal)) {
          botLog(route.length > 2 ? `Saut vers ${nextHop.toUpperCase()} (étape)` : `Arrivée sur ${wantMap.toUpperCase()}`);
        } else {
          Bot.target = "Portail : action requise (coût, niveau…)";
        }
      } catch {}
    }
    botRefreshHudThrottled(dt);
    return;
  }

  const wantKill = Bot.mode === "kill" || Bot.mode === "both";
  const wantBox = Bot.mode === "collect" || Bot.mode === "both";
  const foundNpc = wantKill ? botNearestNpc() : null;
  const foundBox = wantBox ? botNearestBox() : null;

  // Verrouillage : on ne change pas de cible tant que l'actuelle n'est pas finie.
  let lockedNpc = null;
  if (Bot.lock && (Bot.mode === "kill" || Bot.mode === "both")) {
    try {
      const cur = Target.get();
      if (cur && !cur.isPetTarget && Number(cur.hp) > 0 && enemies.includes(cur)
        && (!Bot.npcAllow.size || Bot.npcAllow.has(String(cur.type)))
        && typeof npcIsInSafeZone === "function" && !npcIsInSafeZone(cur)) {
        lockedNpc = cur;
      }
    } catch { lockedNpc = null; }
  }

  let pick = null; // { kind: "npc"|"box", ref }
  const gateMode = rules?.mode === "gate";
  if (Bot.module === "galaxy") {
    if (!gateMode) {
      // Hors gate : spinner auto puis entrée auto dans la gate construite.
      try { botTickGalaxySpin(dt); } catch {}
      if (botTickGalaxyEnter(dt)) return;
      Bot.status = "Galaxy Gates";
      Bot.target = Bot.ggSpin ? "Spinner auto… (aucune gate prête)" : "Active le spinner auto (onglet Galaxy)";
      if (attackActive) { try { stopAttack(); } catch {} }
      try { if (Target.get()) Target.clear(); } catch {}
      try { cancelCollectableTarget(); } catch {}
      moveTarget.active = false;
      botRefreshHudThrottled(dt);
      return;
    }
    // Cubikon mort (complétion en cours) : formation + config de fin.
    try { botApplyGalaxyFinishFormation(); } catch {}
    // En gate : toujours le NPC le plus proche, switch immédiat si un plus
    // proche apparaît. Sans risque côté dégâts : le cooldown de tir est
    // conservé au switch (fix global Target.set), seuls les faux tirs
    // visuels suivent la nouvelle cible.
    let cur = null;
    try {
      const t = Target.get();
      if (t && !t.isPetTarget && Number(t.hp) > 0 && enemies.includes(t)) cur = t;
    } catch { cur = null; }
    const nearest = botNearestAnyNpc();
    let found = null;
    if (Bot.ggNearestSwitch === false) {
      found = cur ? { npc: cur } : nearest;
    } else {
      found = nearest;
    }
    if (!found) {
      // Entre les vagues : le bot vole jusqu'au portail "continuer" et saute
      // dedans automatiquement (proximité + startGatePortalJump).
      if (attackActive) { try { stopAttack(); } catch {} }
      try { if (Target.get()) Target.clear(); } catch {}
      // Saut déjà en cours : on attend la vague suivante.
      if (portal.jumping) {
        Bot.status = "Galaxy Gates";
        Bot.target = "Saut vers la vague suivante…";
        moveTarget.active = false;
        botRefreshHudThrottled(dt);
        return;
      }
      if (betweenWaves && portal.active) {
        Bot.status = "Galaxy Gates";
        const d = Math.round(Math.hypot(portal.x - player.x, portal.y - player.y));
        Bot.target = `Portail vague suivante (${d}m)`;
        moveTarget.active = true;
        moveTarget.x = clamp(portal.x, 80, WORLD.w - 80);
        moveTarget.y = clamp(portal.y, 80, WORLD.h - 80);
        if (isPlayerNearPortal(portal)) {
          try { startGatePortalJump(portal, "continue"); } catch {}
        }
        botRefreshHudThrottled(dt);
        return;
      }
      // Vague en cours d'apparition (spawns à venir) : on patiente.
      // Si le Cubikon vient de mourir (complétion en cours), on garde la
      // formation + config de fin jusqu'au renvoi sur la map mère.
      try { botApplyGalaxyFinishFormation(); } catch {}
      Bot.status = "Galaxy Gates";
      Bot.target = "Vague en cours…";
      moveTarget.active = false;
      botRefreshHudThrottled(dt);
      return;
    }
    pick = { kind: "npc", ref: found.npc };
  } else if (Bot.module === "quest") {
    // On ne vise que les cibles réclamées par les quêtes actives.
    const qt = botQuestTargets();
    const qNpc = qt.npcs.size ? botNearestQuestNpc(qt.npcs) : null;
    const qBox = qt.boxes.size ? botNearestQuestBox(qt.boxes) : null;
    if (lockedNpc && (qt.npcs.has("*") || qt.npcs.has(String(lockedNpc.type)))) {
      pick = { kind: "npc", ref: lockedNpc };
    } else if (Bot.priority === "box") {
      pick = qBox ? { kind: "box", ref: qBox.box } : (qNpc ? { kind: "npc", ref: qNpc.npc } : null);
    } else if (Bot.priority === "nearest") {
      if (qNpc && qBox) pick = qNpc.d2 <= qBox.d2 ? { kind: "npc", ref: qNpc.npc } : { kind: "box", ref: qBox.box };
      else if (qNpc) pick = { kind: "npc", ref: qNpc.npc };
      else if (qBox) pick = { kind: "box", ref: qBox.box };
    } else {
      pick = qNpc ? { kind: "npc", ref: qNpc.npc } : (qBox ? { kind: "box", ref: qBox.box } : null);
    }
    if (!pick) Bot.target = "Aucune cible de quête";
  } else if (lockedNpc) pick = { kind: "npc", ref: lockedNpc };
  else if (Bot.mode === "kill") pick = foundNpc ? { kind: "npc", ref: foundNpc.npc } : null;
  else if (Bot.mode === "collect") pick = foundBox ? { kind: "box", ref: foundBox.box } : null;
  else if (Bot.priority === "box") pick = foundBox ? { kind: "box", ref: foundBox.box } : (foundNpc ? { kind: "npc", ref: foundNpc.npc } : null);
  else if (Bot.priority === "nearest") {
    if (foundNpc && foundBox) pick = foundNpc.d2 <= foundBox.d2 ? { kind: "npc", ref: foundNpc.npc } : { kind: "box", ref: foundBox.box };
    else if (foundNpc) pick = { kind: "npc", ref: foundNpc.npc };
    else if (foundBox) pick = { kind: "box", ref: foundBox.box };
  } else {
    // NPC d'abord (défaut) : le NPC le plus proche gagne, sinon la box.
    pick = foundNpc ? { kind: "npc", ref: foundNpc.npc } : (foundBox ? { kind: "box", ref: foundBox.box } : null);
  }

  // Compteurs : cible suivie qui a disparu = kill / collecte réussie.
  if (Bot.lastNpcId != null && (!foundNpc || foundNpc.npc.id !== Bot.lastNpcId)) {
    const stillAlive = enemies.some((e) => e && e.id === Bot.lastNpcId && Number(e.hp) > 0);
    if (!stillAlive) {
      Bot.kills++;
      botSaveConfig();
      const kc = document.getElementById("botKillCount");
      if (kc) kc.textContent = String(Bot.kills);
    }
    Bot.lastNpcId = null;
  }
  if (Bot.lastBoxId != null && (!foundBox || foundBox.box.id !== Bot.lastBoxId)) {
    const stillThere = collectables.some((c) => c && c.id === Bot.lastBoxId);
    if (!stillThere) {
      Bot.boxes++;
      botSaveConfig();
      const bc = document.getElementById("botBoxCount");
      if (bc) bc.textContent = String(Bot.boxes);
    }
    Bot.lastBoxId = null;
  }

  if (!pick) {
    // Patrouille : waypoint aléatoire toutes les 6 s ou à l'arrivée.
    botApplyFormation(Bot.formMove);
    botApplyConfig(Bot.cfgFly);
    Bot.roamT -= dt;
    if (Bot.roamT <= 0 || !moveTarget.active) {
      Bot.roamT = 6;
      Bot.roamX = 120 + Math.random() * Math.max(240, WORLD.w - 240);
      Bot.roamY = 120 + Math.random() * Math.max(240, WORLD.h - 240);
      moveTarget.active = true;
      moveTarget.x = clamp(Bot.roamX, 80, WORLD.w - 80);
      moveTarget.y = clamp(Bot.roamY, 80, WORLD.h - 80);
    }
    if (attackActive && !Target.get()) { try { stopAttack(); } catch {} }
    Bot.status = Bot.mode === "collect" ? "Collecte — patrouille" : Bot.mode === "kill" ? "Chasse — patrouille" : "Farm — patrouille";
    Bot.target = "Recherche de cible…";
    if (Bot.module === "quest") {
      Bot.status = "Quêtes — patrouille";
      Bot.target = "Aucune cible (accepte des quêtes)";
    }
    botRefreshHudThrottled(dt);
    return;
  }

  if (pick.kind === "npc") {
    const npc = pick.ref;
    if (Bot.lastNpcId !== npc.id) {
      // Nouvelle cible : on part de l'angle actuel pour orbiter sans à-coup.
      Bot.orbitAng = Math.atan2(player.y - npc.y, player.x - npc.x);
    }
    Bot.lastNpcId = npc.id;
    Bot.lastBoxId = null;
    botApplyFormation(Bot.formAttack);
    botApplyConfig(Bot.cfgAttack);
    const d = Math.hypot(npc.x - player.x, npc.y - player.y);
    const npcName = String((NPC_TYPES[npc.type]?.name || npc.type || "NPC")).replace(/^-=\[?\s*|\s*\]?=-$/g, "").trim() || "NPC";
    Bot.status = Bot.mode === "both" ? "Farm — combat" : "Chasse — combat";
    Bot.target = `${npcName} (${Math.round(d)}m)`;
    try { if (Target.get() !== npc) Target.set(npc); } catch {}
    try { cancelCollectableTarget(); } catch {}
    // Munition configurée pour ce NPC (retombe sur X1 si stock vide).
    const wantAmmo = Bot.npcAmmo[String(npc.type)] || "";
    if (wantAmmo && AMMO[wantAmmo] && player.ammo.active !== wantAmmo) {
      try { setAmmo(wantAmmo); } catch {}
    }
    // Tir UNIQUEMENT à portée (jamais de lock + tir à l'autre bout de la
    // carte) : hors portée on approche en silence, à portée on engage
    // (hystérésis 95 % / 100 % : pas de on/off à la limite).
    const engageMax = Bot.engageDist > 0 ? Math.min(Bot.engageDist, playerRange) : playerRange;
    if (!attackActive && d <= engageMax * 0.95) {
      try { startAttack(); } catch {}
    } else if (attackActive && d > engageMax) {
      try { stopAttack(); } catch {}
    }
    // En Galaxy Gate : pas d'orbite serrée ni de camping au milieu du paquet.
    // On garde la distance de tir à la cible, on repousse tous les autres NPC
    // proches (surtout les non-ciblés) et on strafe doucement pour ne jamais
    // rester immobile sous les tirs.
    const isGgCombat = Bot.module === "galaxy" && rules?.mode === "gate";
    // Distance de sécurité : hors de portée de tir du NPC quand c'est
    // possible (portée NPC + marge), sinon au max de notre portée.
    // Évite de rester planté sous les tirs à 560 m face à un NPC qui tire à 700 m.
    const npcShootR = Number(NPC_TYPES[npc.type]?.shootRange) || 0;
    const safeD = npcShootR > 0 ? npcShootR + 200 : 0;
    const standD = Math.min(Math.max(200, botNpcDist(npc.type), safeD), playerRange * 0.9);
    if (isGgCombat) {
      if (d > playerRange * 0.95) {
        // Hors de portée : approche décalée (point à standD, pas le centre).
        const ax = d > 1 ? (player.x - npc.x) / d : 1;
        const ay = d > 1 ? (player.y - npc.y) / d : 0;
        moveTarget.active = true;
        moveTarget.x = clamp(npc.x + ax * standD, 80, WORLD.w - 80);
        moveTarget.y = clamp(npc.y + ay * standD, 80, WORLD.h - 80);
      } else {
        // Kiting généralisé : on tire en reculant devant TOUS les NPC.
        // Répulsion quadratique (les proches dominent), cible pondérée moins
        // fort pour rester à portée de tir d'elle, + dérive tangentielle pour
        // faire le tour de la map au lieu de se coincer. Jamais de camping,
        // jamais de colle : le vaisseau est toujours en mouvement.
        let kx = 0, ky = 0;
        let closestD = Infinity, closestX = 0, closestY = 0;
        for (const e of enemies) {
          if (!e || Number(e.hp) <= 0) continue;
          const ex = player.x - e.x, ey = player.y - e.y;
          const ed = Math.hypot(ex, ey);
          if (ed < closestD) { closestD = ed; closestX = ex; closestY = ey; }
          const KR = 1600;
          if (ed < KR && ed > 1) {
            const w = 1 - ed / KR;
            const push = w * w * (e === npc ? 420 : 1200);
            kx += (ex / ed) * push;
            ky += (ey / ed) * push;
          }
        }
        if (closestD < 150 && closestD > 0.01) {
          // Contact : fuite franche à ~45° du plus proche (radial + latéral).
          const ax = closestX / closestD, ay = closestY / closestD;
          kx = ax * 800 + -ay * 800;
          ky = ay * 800 + ax * 800;
        }
        const kl = Math.hypot(kx, ky);
        if (kl < 60) {
          moveTarget.active = false; // rien à fuir : on tient et on tire
        } else {
          const tx = -ky / kl, ty = kx / kl;
          const step = Math.min(kl, 800);
          const rawX = player.x + kx / kl * step + tx * 350;
          const rawY = player.y + ky / kl * step + ty * 350;
          const tgt = botGateKiteTarget(rawX, rawY, closestD < 600);
          moveTarget.active = true;
          moveTarget.x = tgt.x;
          moveTarget.y = tgt.y;
        }
      }
    } else {
      // Hors gate : même anti-colle que la gate (tous modes). L'approche ne
      // vise jamais le centre exact et on ne reste jamais planté sous le NPC.
      const orbitD = standD;
      const orbitOn = Bot.orbit && botNpcOrbitOf(npc.type);
      const gx = d > 1 ? (player.x - npc.x) / d : 1;
      const gy = d > 1 ? (player.y - npc.y) / d : 0;
      if (d < 160 && d > 0.01) {
        // Contact : esquive latérale pure, le NPC dépasse.
        moveTarget.active = true;
        moveTarget.x = clamp(player.x + -gy * 1000, 80, WORLD.w - 80);
        moveTarget.y = clamp(player.y + gx * 1000, 80, WORLD.h - 80);
      } else if (orbitOn && d <= orbitD * 1.4) {
        // Vitesse angulaire adaptative : on n'exige jamais plus de ~70 % de
        // la vitesse du vaisseau en tangentiel, sinon il coupe les virages,
        // spirale vers le centre du NPC et finit collé dessus.
        const shipSpd = Math.max(10, Number(player.baseSpeed) || 0);
        Bot.orbitAng += dt * Math.min(0.7, shipSpd / Math.max(1, orbitD) * 0.7);
        moveTarget.active = true;
        moveTarget.x = clamp(npc.x + Math.cos(Bot.orbitAng) * orbitD, 80, WORLD.w - 80);
        moveTarget.y = clamp(npc.y + Math.sin(Bot.orbitAng) * orbitD, 80, WORLD.h - 80);
      } else if (d > playerRange * 0.7) {
        // Approche décalée : point à orbitD du NPC, pas son centre.
        moveTarget.active = true;
        moveTarget.x = clamp(npc.x + gx * orbitD, 80, WORLD.w - 80);
        moveTarget.y = clamp(npc.y + gy * orbitD, 80, WORLD.h - 80);
      } else if (d < orbitD * 0.8) {
        // Trop près sans orbite : on recule à distance au lieu de camper dessus.
        moveTarget.active = true;
        moveTarget.x = clamp(player.x + gx * 400, 80, WORLD.w - 80);
        moveTarget.y = clamp(player.y + gy * 400, 80, WORLD.h - 80);
      } else {
        moveTarget.active = false;
      }
    }
  } else {
    const box = pick.ref;
    Bot.lastBoxId = box.id;
    Bot.lastNpcId = null;
    botApplyFormation(Bot.formMove);
    botApplyConfig(Bot.cfgFly);
    const d = Math.hypot(box.x - player.x, box.y - player.y);
    const boxName = String(COLLECTABLE_TYPES[box.type]?.name || box.type || "Box");
    Bot.status = Bot.mode === "both" ? "Farm — collecte" : "Collecte";
    Bot.target = `${boxName} (${Math.round(d)}m)`;
    if (attackActive) { try { stopAttack(); } catch {} }
    try { if (Target.get()) Target.clear(); } catch {}
    try {
      if (collectableTargetId !== box.id) selectCollectable(box);
    } catch {
      moveTarget.active = true;
      moveTarget.x = clamp(box.x, 80, WORLD.w - 80);
      moveTarget.y = clamp(box.y, 80, WORLD.h - 80);
    }
  }
  botRefreshHudThrottled(dt);
}

function botRefreshHudThrottled(dt) {
  Bot.hudT += dt;
  if (Bot.hudT >= 0.25) { Bot.hudT = 0; botRefreshHud(); }
}

// Overlays du bot (bot actif uniquement) : traits vers les NPC cochés,
// cercle de portée autour du vaisseau, portée de chaque NPC, zones de
// non-agression (portails sûrs, base, modules sûrs).
function drawBotOverlays(ox, oy) {
  if (!Bot.active || !Bot.overlay) return;
  if (!started || player.dead) return;
  const px = player.x + ox;
  const py = player.y + oy;
  const inView = (x, y, m) => x > -m && x < innerWidth + m && y > -m && y < innerHeight + m;
  ctx.save();
  ctx.lineWidth = 1.5;
  // 1. Traits vaisseau -> NPC sélectionnés (cochés, vivants, 60 proches).
  // 3. Rayon d'attaque de chaque NPC (40 proches).
  try {
    const cands = [];
    for (const e of enemies) {
      if (!e || Number(e.hp) <= 0 || e.isPetTarget) continue;
      if (Bot.npcAllow.size && !Bot.npcAllow.has(String(e.type))) continue;
      cands.push(e);
    }
    cands.sort((a, b) => dist2(player.x, player.y, a.x, a.y) - dist2(player.x, player.y, b.x, b.y));
    ctx.strokeStyle = "rgba(0,217,255,0.45)";
    ctx.beginPath();
    for (const e of cands.slice(0, 60)) {
      const sx = e.x + ox;
      const sy = e.y + oy;
      if (!inView(sx, sy, 50)) continue;
      ctx.moveTo(px, py);
      ctx.lineTo(sx, sy);
    }
    ctx.stroke();
    ctx.strokeStyle = "rgba(255,70,70,0.5)";
    for (const e of cands.slice(0, 40)) {
      const r = Number(NPC_TYPES[e.type]?.shootRange) || 0;
      if (!(r > 0)) continue;
      const sx = e.x + ox;
      const sy = e.y + oy;
      if (!inView(sx, sy, r)) continue;
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, TAU);
      ctx.stroke();
    }
  } catch {}
  // 2. Cercle de portée d'attaque autour du vaisseau (+ engagement si réglé).
  try {
    ctx.strokeStyle = "rgba(110,255,150,0.65)";
    ctx.beginPath();
    ctx.arc(px, py, playerRange, 0, TAU);
    ctx.stroke();
    const engageMax = Bot.engageDist > 0 ? Math.min(Bot.engageDist, playerRange) : 0;
    if (engageMax > 0) {
      ctx.setLineDash([8, 6]);
      ctx.strokeStyle = "rgba(110,255,150,0.4)";
      ctx.beginPath();
      ctx.arc(px, py, engageMax, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  } catch {}
  // 4. Zones de non-agression : portails sûrs, base, modules sûrs.
  try {
    ctx.strokeStyle = "rgba(150,130,255,0.55)";
    for (const p of getInteractivePortals()) {
      try { if (!portalProvidesSafety(p)) continue; } catch { continue; }
      const rr = DEFAULT_PORTAL_RADIUS + SAFE_ZONE_MARGIN;
      const sx = p.x + ox;
      const sy = p.y + oy;
      if (!inView(sx, sy, rr)) continue;
      ctx.beginPath();
      ctx.arc(sx, sy, rr, 0, TAU);
      ctx.stroke();
    }
    try {
      if (typeof baseProvidesSafety === "function" && baseProvidesSafety() && zoneSafe?.zone?.kind === "circle") {
        const z = zoneSafe.zone;
        const rr = (Number(z.r) || 0) + SAFE_ZONE_MARGIN;
        const sx = z.x + ox;
        const sy = z.y + oy;
        if (inView(sx, sy, rr)) {
          ctx.beginPath();
          ctx.arc(sx, sy, rr, 0, TAU);
          ctx.stroke();
        }
      }
    } catch {}
    ctx.setLineDash([6, 6]);
    for (const m of zoneSafe?.modules || []) {
      const rr = Number(m?.safeRadius) || 0;
      if (!(rr > 0)) continue;
      const sx = m.x + ox;
      const sy = m.y + oy;
      if (!inView(sx, sy, rr)) continue;
      ctx.beginPath();
      ctx.arc(sx, sy, rr, 0, TAU);
      ctx.stroke();
    }
    ctx.setLineDash([]);
  } catch {}
  ctx.restore();
}

registerHudWindows();

// ============================================================
// ✅ Fenêtre P.E.T en jeu : play/stop, mode passif/combat, barres
// HP / bouclier / XP / fuel (réservoir 50 000, consommé en jeu).
// ============================================================
// Somme des % d'un protocole équipé sur le fit actif (chaleur ignorée :
// supprimée du jeu). Ex : "cargo", "radar", "salvage", "shield",
// "damage", "aim", "evasion", "hp", "alien", "eco".
function getPetProtocolPct(pet, user, key) {
  const want = String(key || "").toLowerCase();
  if (!want || want === "heat") return 0;
  const hangar = (user?.hangars || []).find((h) => h?.active) || null;
  const hid = hangar ? String(hangar.id) : null;
  const cfg = String(Number(hangar?.activeConfig) === 2 ? 2 : 1);
  const fit = hid ? getPetFit(pet, hid, cfg) : null;
  let total = 0;
  for (const itemId of fit?.protocols || []) {
    const item = itemId ? findCatalogItem(itemId) : null;
    const k = String(item?.petProtocol?.key || "").toLowerCase();
    if (!k || k === "heat" || k !== want) continue;
    total += Number(item.petProtocol.pct) || 0;
  }
  return Math.max(0, total);
}
function petFuelEcoMult(pet, user) {
  const eco = getPetProtocolPct(pet, user, "eco");
  return Math.max(0, 1 - eco / 100);
}
// Portée d'un gear avec le protocole radar (+X % sur G-AL / G-AR / G-EL).
function getPetGearRangeWithRadar(key, level, pet, user) {
  const base = getPetGearRange(key, level);
  if (!(base > 0)) return 0;
  const radar = getPetProtocolPct(pet, user, "radar");
  return radar > 0 ? base * (1 + radar / 100) : base;
}
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
  // Protocole bouclier (AI-SM) : +X % sur le propre bouclier du REX.
  const shieldPct = getPetProtocolPct(pet, user, "shield");
  if (shieldPct > 0) max *= 1 + shieldPct / 100;
  return Math.max(0, Math.floor(max * (1 + goliathHeatPct() / 100)));
}

function wirePetWindow() {
  ui.petPlayBtn?.addEventListener("click", () => {
    const pet = account.user?.pet?.owned === true ? account.user.pet : null;
    if (!pet) return showToast("P.E.T non possédé.", 1.5);
    // REX détruit : la clé répare (10 000 crédits, coque pleine).
    if (!(Number(pet.hp) > 0)) {
      const out = repairPet();
      if (!out?.ok) return showToast(out?.error || "Impossible.", 1.5);
      account.user = out.user;
      player.credits = out.user.credits;
      setHudText(ui.shopCredits, formatInteger(player.credits));
      loadAccountUser();
      markProgressDirty();
      window.dispatchEvent(new CustomEvent("orbit:profile-progress"));
      return showToast("REX réparé (coque 10 %, bouclier 0).", 1.8);
    }
    // Panne sèche : la goutte achète +100 essence (10 000 crédits débités),
    // sans activer le REX — le bouton repasse en play, à toi de l'allumer.
    if (!(Math.max(0, Math.floor(Number(pet.fuel) || 0)) > 0)) {
      const out = buyItem("pet_fuel", 100);
      if (!out?.ok) return showToast(out?.error || "Impossible.", 1.5);
      account.user = out.user;
      player.credits = out.user.credits;
      setHudText(ui.shopCredits, formatInteger(player.credits));
      loadAccountUser();
      markProgressDirty();
      window.dispatchEvent(new CustomEvent("orbit:profile-progress"));
      return showToast(`+${formatInteger(out.quantity)} essence (${formatInteger(out.totalPrice)} crédits) — appuie sur play.`, 2);
    }
    const out = setPetActive(!pet.active);
    if (!out?.ok) return showToast(out?.error || "Impossible.", 1.5);
    loadAccountUser();
    showToast(out.active ? "P.E.T activé" : "P.E.T désactivé", 1.2);
  });
  // Menus custom P.E.T : toggle à volonté, jamais fermés au clic ailleurs.
  ui.petModeBtn?.addEventListener("click", () => {
    if (ui.petModeBtn.disabled) return;
    ui.petModeList.hidden = !ui.petModeList.hidden;
    placePetDropdown(ui.petModeBtn, ui.petModeList);
  });
  ui.petNpcBtn?.addEventListener("click", () => {
    if (ui.petNpcBtn.disabled) return;
    ui.petNpcList.hidden = !ui.petNpcList.hidden;
    placePetDropdown(ui.petNpcBtn, ui.petNpcList);
  });
  ui.petModeList?.addEventListener("click", (event) => {
    const btn = event.target.closest("button[data-value]");
    if (!btn || btn.disabled) return;
    ui.petModeList.hidden = true;
    applyPetModeValue(String(btn.dataset.value || "passive"));
  });
  ui.petNpcList?.addEventListener("click", (event) => {
    const btn = event.target.closest("button[data-value]");
    if (!btn || btn.disabled) return;
    ui.petNpcList.hidden = true;
    petLocator.manualType = btn.dataset.value || null;
    petLocator.enemyId = null;
  });
}

// Menus custom P.E.T : flottants (position fixe), recalculés pour suivre
// la fenêtre (drag) et s'ouvrir vers le haut si le bas manque.
function placePetDropdown(btn, list) {
  if (!btn || !list || list.hidden) return;
  const r = btn.getBoundingClientRect();
  const h = list.offsetHeight || 200;
  let top = r.bottom + 4;
  if (top + h > window.innerHeight) top = Math.max(4, r.top - 4 - h);
  list.style.left = `${Math.max(4, Math.min(r.left, window.innerWidth - 160))}px`;
  list.style.top = `${top}px`;
  list.style.width = `${Math.max(120, r.width)}px`;
}

// Libellé court du menu Mode : sans les codes G- ("G-AL3 · Auto-Loot" → "Auto-Loot").
function shortGearLabel(label) {
  const parts = String(label || "").split("·");
  return (parts.length > 1 ? parts[parts.length - 1] : parts[0] || "").trim() || String(label || "");
}

// Un seul comportement à la fois : Passif, Mode combat ou un gear équipé.
function applyPetModeValue(v) {
    const pet = account.user?.pet?.owned === true ? account.user.pet : null;
    if (!pet) return showToast("P.E.T non possédé.", 1.5);
    v = String(v || "passive");
    // Kamikaze en cours : course verrouillée, rien ne peut l'arrêter.
    if (kkRunActive()) {
      loadAccountUser();
      return showToast("Kamikaze en cours — REX verrouillé.", 1.5);
    }
    // Un seul comportement à la fois : Passif, Mode combat ou un gear équipé.
    if (v.startsWith("gear:")) {
      const key = v.slice("gear:".length).toLowerCase();
      // Sans carburant, aucun gear ne peut s'activer.
      if (!(Math.max(0, Math.floor(Number(account.user?.pet?.fuel) || 0)) > 0)) {
        loadAccountUser();
        return showToast("Plus de carburant — achète de l'essence P.E.T.", 1.8);
      }
      // Changer de comportement ferme le Trader (→ cooldown) et coupe lien/bouée.
      if (traWindowActive()) endTraSession();
      if (hplLinkActive() && key !== "hpl") endHplLink("gear");
      if (buoySessionActive() && key !== petBuoy.key) endBuoySession("gear");
      if (key === "tra") {
        const left = traCooldownLeftSec();
        if (left > 0) {
          showToast(`Cargo Trader prêt dans ${Math.ceil(left)} s`, 1.8);
          loadAccountUser();
          return;
        }
        // Mémorise le comportement courant pour y revenir après la session.
        petTrader.prevMode = normalizePetMode(account.user?.pet?.mode);
        const prevGear = String(account.user?.pet?.activeGear || "").toLowerCase() || null;
        petTrader.prevGear = prevGear && prevGear !== "tra" ? prevGear : null;
        const outMode = setPetMode("passive");
        if (!outMode?.ok) return showToast(outMode?.error || "Impossible.", 1.5);
        const out = setPetActiveGear("tra");
        if (!out?.ok) return showToast(out?.error || "Impossible.", 1.5);
        const lvl = Math.floor(Number(petGearLevels().tra) || 0);
        if (!(lvl > 0)) {
          setPetActiveGear(null);
          loadAccountUser();
          return showToast("Gear déséquipé.", 1.5);
        }
        petTrader.level = lvl;
        petTrader.until = performance.now() / 1000 + PET_GEAR_TRADE_WINDOW_SEC;
        if (!openTraTradeWindow()) {
          petTrader.until = 0;
          petTrader.level = 0;
          setPetActiveGear(null);
          loadAccountUser();
          return;
        }
        petLocator.manualType = null;
        petLocator.enemyId = null;
        petLocator.needsPick = true;
        loadAccountUser();
        showToast(`Cargo Trader : commerce ouvert 10 s (+${getPetTradeBonusPct(lvl)} %)`, 2);
        return;
      }
      if (key === "fs") {
        const left = fsCooldownLeftSec();
        if (left > 0) {
          showToast(`Flamme sacrificielle prête dans ${Math.ceil(left)} s`, 1.8);
          loadAccountUser();
          return;
        }
        triggerSacrificeFlame();
        return;
      }
      if (key === "kk") {
        const left = kkCooldownLeftSec();
        if (left > 0) {
          showToast(`Kamikaze prêt dans ${Math.ceil(left)} s`, 1.8);
          loadAccountUser();
          return;
        }
        triggerPetKamikaze();
        return;
      }
      if (key === "hpl") {
        if (hplLinkActive()) {
          showToast("Lien HP déjà actif.", 1.2);
          loadAccountUser();
          return;
        }
        const left = hplCooldownLeftSec();
        if (left > 0) {
          showToast(`Lien HP prêt dans ${Math.ceil(left)} s`, 1.8);
          loadAccountUser();
          return;
        }
        startHplLink();
        return;
      }
      if (key === "bc" || key === "bh") {
        if (buoySessionActive() && petBuoy.key === key) {
          showToast("Bouée déjà active.", 1.2);
          loadAccountUser();
          return;
        }
        const left = buoyCooldownLeftSec(key);
        if (left > 0) {
          showToast(`Bouée prête dans ${Math.ceil(left)} s`, 1.8);
          loadAccountUser();
          return;
        }
        startBuoySession(key);
        return;
      }
      const outMode = setPetMode("passive");
      if (!outMode?.ok) return showToast(outMode?.error || "Impossible.", 1.5);
      const out = setPetActiveGear(key);
      if (!out?.ok) return showToast(out?.error || "Impossible.", 1.5);
      petLocator.manualType = null;
      petLocator.enemyId = null;
      petLocator.needsPick = true;
      loadAccountUser();
      const label = shortGearLabel(petEquippedGearOptions().find((e) => e.key === key)?.label) || key.toUpperCase();
      showToast(`P.E.T : ${label} actif`, 1.2);
      return;
    }
    // Changer de comportement ferme le Trader (→ cooldown) et coupe lien/bouée.
    if (traWindowActive()) endTraSession();
    if (hplLinkActive()) endHplLink("gear");
    if (buoySessionActive()) endBuoySession("gear");
    const out = setPetMode(v);
    if (!out?.ok) {
      showToast(out?.error || "Impossible.", 1.5);
      return;
    }
    setPetActiveGear(null);
    petLocator.manualType = null;
    petLocator.enemyId = null;
    petLocator.needsPick = true;
    loadAccountUser();
    showToast(out.mode === "combat" ? "P.E.T : mode combat" : "P.E.T : passif", 1.2);
}

function updatePetHud() {
  const pet = account.user?.pet?.owned === true ? account.user.pet : null;
  const has = !!pet;
  if (ui.petNoPet) ui.petNoPet.hidden = has;
  setHudDisabled(ui.petPlayBtn, !has);
  if (ui.petModeBtn) ui.petModeBtn.disabled = !has;

  const level = has ? getPetLevel(pet.exp) : 0;
  const exp = has ? Math.max(0, Number(pet.exp) || 0) : 0;
  const hpMax = has ? petMaxHpWithHeat(pet) : 0;
  const hp = has ? Math.max(0, Math.min(hpMax, Math.floor(Number(pet.hp)))) : 0;
  const shMax = has ? petShieldMaxForHud(pet, account.user) : 0;
  const sh = has
    ? (pet.sh != null && Number.isFinite(Number(pet.sh)) ? Math.max(0, Math.min(shMax, Math.floor(Number(pet.sh)))) : shMax)
    : 0;
  const next = has ? getPetNextLevelXp(level) : 1;
  const prev = has ? getPetLevelXp(level) : 0;
  // Progression infinie : plus de plafond au niveau 20.
  const xpPct = Math.max(0, Math.min(100, ((exp - prev) / Math.max(1, next - prev)) * 100));
  if (level > 15) setHudText(ui.petXpTxt, `${formatInteger(Math.floor(exp))} - ${level}`);
  else setHudText(ui.petXpTxt, `${formatInteger(Math.floor(exp))} / ${formatInteger(next)} - ${level}`);
  setHudWidth(ui.petXpBar, `${xpPct}%`);
  if (has) setHudText(ui.petNameTxt, String(pet.pseudo || "REX"));
  setHudText(ui.petHpTxt, `${formatInteger(hp)} / ${formatInteger(hpMax)}`);
  setHudWidth(ui.petHpBar, `${hpMax > 0 ? (hp / hpMax) * 100 : 0}%`);
  setHudText(ui.petShTxt, `${formatInteger(sh)} / ${formatInteger(shMax)}`);
  setHudWidth(ui.petShBar, `${shMax > 0 ? (sh / shMax) * 100 : 0}%`);
  if (ui.petShBar?.parentElement) setHudDisplay(ui.petShBar.closest?.(".petMeter") || ui.petShBar.parentElement, shMax > 0 ? "" : "none");
  const fuelMax = has ? Math.max(1, Math.floor(Number(pet.fuelMax) || PET_FUEL_MAX)) : PET_FUEL_MAX;
  const fuel = has ? Math.max(0, Math.min(fuelMax, Math.floor(Number(pet.fuel) || 0))) : 0;
  setHudText(ui.petFuelTxt, `${formatInteger(fuel)} / ${formatInteger(fuelMax)}`);
  setHudWidth(ui.petFuelBar, `${fuelMax > 0 ? (fuel / fuelMax) * 100 : 0}%`);

  if (ui.petPlayBtn) {
    const destroyed = has && !(Number(pet.hp) > 0);
    // À sec = éteint : jamais l'icône pause avec un réservoir vide,
    // même pendant la frame où la désactivation se propage.
    const outOfFuel = has && !(Math.max(0, Math.floor(Number(pet.fuel) || 0)) > 0);
    const shownActive = pet?.active === true && !outOfFuel && !destroyed;
    // ✅ l'icône ne change que d'état (play / pause / clé) : on ne touche au
    // DOM que sur changement. Avant, la comparaison innerHTML ne matchait
    // jamais (sérialisation navigateur) donc le SVG était recréé à chaque
    // frame et le clic tombait sur un nÅ“ud détruit entre mousedown/mouseup.
    const iconKey = !has ? "none" : destroyed ? "wrench" : outOfFuel ? "fuel" : shownActive ? "pause" : "play";
    if (iconKey !== lastPetPlaySig) {
      lastPetPlaySig = iconKey;
      const label = iconKey === "wrench"
        ? '<svg viewBox="0 0 16 16" width="14" height="14"><path d="M11.5 1a3.5 3.5 0 0 0-4.6 4.6L1 11.5V15h3.5l5.9-5.9A3.5 3.5 0 0 0 15 4.5l-2.3 2.3-2.4-.6-.6-2.4L11.5 1z" fill="#eaffff"/></svg>'
        : iconKey === "fuel"
          ? '<svg viewBox="0 0 16 16" width="14" height="14"><path d="M8 1.2C8 1.2 2.6 8.2 2.6 11.3a5.4 5.4 0 0 0 10.8 0C13.4 8.2 8 1.2 8 1.2z" fill="#7cf0ff"/></svg>'
          : iconKey === "pause"
          ? '<svg viewBox="0 0 16 16" width="14" height="14"><rect x="3" y="2" width="4" height="12" rx="1" fill="#eaffff"/><rect x="9" y="2" width="4" height="12" rx="1" fill="#eaffff"/></svg>'
          : '<svg viewBox="0 0 16 16" width="14" height="14"><path d="M4 2 L13 8 L4 14 Z" fill="#eaffff"/></svg>';
      ui.petPlayBtn.innerHTML = label;
    }
    setHudAttr(ui.petPlayBtn, "title", destroyed
      ? "Réparer le REX — 10 000 crédits"
      : outOfFuel
        ? "+100 essence — 10 000 crédits (sans activer le REX)"
        : shownActive ? "Désactiver le P.E.T" : "Activer le P.E.T");
    setHudClass(ui.petPlayBtn, "isOn", shownActive);
  }
  // Menu custom Mode (+ gears équipés, noms boutique, un seul choix actif).
  if (ui.petModeBtn && ui.petModeList) {
    const mode = normalizePetMode(pet?.mode);
    const equipped = has ? petEquippedGearOptions() : [];
    // Gears à cooldown (TRA, FS, KK, HPL, bouées) : option grisée + compte à rebours.
    const cdLeft = { tra: Math.ceil(traCooldownLeftSec()), fs: Math.ceil(fsCooldownLeftSec()), kk: Math.ceil(kkCooldownLeftSec()), hpl: Math.ceil(hplCooldownLeftSec()), bc: Math.ceil(buoyCooldownLeftSec("bc")), bh: Math.ceil(buoyCooldownLeftSec("bh")) };
    const opts = [{ value: "passive", label: "Passif" }, { value: "combat", label: "Combat" }]
      .concat(equipped.map((e) => {
        const left = Number(cdLeft[e.key]) || 0;
        const short = shortGearLabel(e.label);
        return {
          value: `gear:${e.key}`,
          label: left > 0 ? `${short} (${left} s)` : short,
          disabled: left > 0,
        };
      }));
    const activeKey = petActiveGearKey();
    const want = activeKey ? `gear:${activeKey}` : mode;
    const wantOpt = opts.find((o) => o.value === want) || opts[0];
    // Libellés inclus : le compte à rebours (Xs) reconstruit chaque seconde.
    const sig = `${mode}|${opts.map((o) => `${o.value}=${o.label}`).join(",")}`;
    if (sig !== lastPetModeSig) {
      lastPetModeSig = sig;
      ui.petModeList.innerHTML = opts.map((o) =>
        `<button type="button" data-value="${escapeHtml(o.value)}"${o.disabled ? " disabled" : ""}>${escapeHtml(o.label)}</button>`
      ).join("");
    }
    for (const b of ui.petModeList.querySelectorAll("button[data-value]")) {
      b.classList.toggle("isCurrent", b.dataset.value === wantOpt.value);
    }
    if (ui.petModeBtn.textContent !== wantOpt.label) ui.petModeBtn.textContent = wantOpt.label;
  }
  // Liste des NPC de la carte : visible uniquement si le localisateur est actif.
  const showPetNpc = has && pet?.active === true && petActiveGearKey() === "el";
  if (ui.petNpcRow) ui.petNpcRow.hidden = !showPetNpc;
  if (!showPetNpc) {
    if (petLocator.manualType != null || petLocator.enemyId != null) {
      petLocator.manualType = null;
      petLocator.enemyId = null;
    }
    if (ui.petNpcList) ui.petNpcList.hidden = true;
  } else if (ui.petNpcBtn && ui.petNpcList) {
    const live = enemies.filter((e) => e && Number(e.hp) > 0);
    // Une entrée par famille présente sur la carte.
    const families = [...new Set(live.map((e) => String(e.type || "?")))].sort();
    if (petLocator.manualType != null && !families.includes(petLocator.manualType)) {
      petLocator.manualType = null;
      petLocator.needsPick = true;
    }
    // Défaut : une famille au hasard dans la liste.
    if (petLocator.manualType == null && petLocator.needsPick && families.length) {
      petLocator.needsPick = false;
      petLocator.manualType = families[Math.floor(Math.random() * families.length)];
    }
    const sig = families.join("|");
    if (sig !== lastPetNpcSig) {
      lastPetNpcSig = sig;
      ui.petNpcList.innerHTML = '<button type="button" data-value="">— Choisir un NPC —</button>'
        + families.map((type) => `<button type="button" data-value="${escapeHtml(type)}">${escapeHtml(String(NPC_TYPES[type]?.name || type))}</button>`).join("");
    }
    const wantNpc = petLocator.manualType != null ? String(petLocator.manualType) : "";
    for (const b of ui.petNpcList.querySelectorAll("button[data-value]")) {
      b.classList.toggle("isCurrent", (b.dataset.value || "") === wantNpc);
    }
    const wantLabel = petLocator.manualType != null
      ? String(NPC_TYPES[petLocator.manualType]?.name || petLocator.manualType)
      : "— Choisir un NPC —";
    if (ui.petNpcBtn.textContent !== wantLabel) ui.petNpcBtn.textContent = wantLabel;
  }
  // Menus flottants : suivent la fenêtre (drag), fermés sans P.E.T.
  if (!has) {
    if (ui.petModeList) ui.petModeList.hidden = true;
    if (ui.petNpcList) ui.petNpcList.hidden = true;
  } else {
    placePetDropdown(ui.petModeBtn, ui.petModeList);
    if (showPetNpc) placePetDropdown(ui.petNpcBtn, ui.petNpcList);
    else if (ui.petNpcList) ui.petNpcList.hidden = true;
  }
  // Cargo Trader (G-TRA) : expiration des 10 s ou fermeture manuelle → cooldown.
  if (petTrader.until > 0 && (!isOreTradeWindowOpen() || !traWindowActive())) endTraSession();
  // Lien HP (G-HPL) : fin des 20 s, REX désactivé ou config changée → coupure.
  if (petLink.until > 0) {
    if (performance.now() / 1000 >= petLink.until) endHplLink("expired");
    else if (account.user?.pet?.active !== true) endHplLink("off");
    else if (petConfigKey() !== petLink.configKey) endHplLink("config");
  }
  // Bouées (G-BC / G-BH) : fin des 120 s ou REX désactivé → coupure. Aura PV.
  // Config changée : on garde si la bouée est équipée sur les 2, sinon coupée.
  // (L'IEM ne coupe jamais la bouée.)
  if (petBuoy.until > 0) {
    if (performance.now() / 1000 >= petBuoy.until) endBuoySession("expired");
    else if (account.user?.pet?.active !== true) endBuoySession("off");
    else if (petConfigKey() !== petBuoy.configKey) {
      if (Number(petGearLevels()[petBuoy.key]) > 0) petBuoy.configKey = petConfigKey();
      else endBuoySession("config");
    }
  }
  tickBuoyHpAura();
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
let lastPetModeSig = "";
let lastPetNpcSig = "";
let lastPetPlaySig = "";

let selectedCraftingRecipeId = CRAFTING_RECIPES[0]?.id || null;

function craftingResourceAmount(user, resourceId) {
  return Math.max(0, Number(user?.inventory?.resources?.[resourceId] || 0));
}

const CRAFTING_DURATION_BY_RARITY = Object.freeze({ common: 2, rare: 5, epic: 10, legendary: 20 });
let craftingJob = null;

const CRAFTING_FALLBACK_ICON = "/ASSETS/CPU/MICRO_TRANSISTORS_100X100.png";

function craftingAmmoIcon(ammoId) {
  const key = String(ammoId || "").toUpperCase();
  return `/ASSETS/ITEMS/AMMO_${key}.png`;
}

function craftingItemIcon(catalogItemId) {
  const item = catalogItemId ? findCatalogItem(catalogItemId) : null;
  if (item?.icon) return item.icon;
  const id = String(catalogItemId || "");
  if (id.startsWith("ammo_")) return craftingAmmoIcon(id.slice(5));
  if (id.startsWith("rocket_")) {
    try { return rocketShopIcon(id.slice(7)) || CRAFTING_FALLBACK_ICON; } catch { return CRAFTING_FALLBACK_ICON; }
  }
  if (id.startsWith("laser_")) return `/ASSETS/LASERS/${id.slice(6)}_100x100.png`;
  if (id.startsWith("spd_") || id.startsWith("shd_")) return `/ASSETS/ITEMS/${id.slice(4).toUpperCase()}.png`;
  return CRAFTING_FALLBACK_ICON;
}

function craftingRecipeMainIcon(recipe) {
  const out = recipe?.output || {};
  const resId = Object.keys(out.resources || {})[0];
  if (resId) return getResourceIcon(resId);
  const ammoId = Object.keys(out.ammo || {})[0];
  if (ammoId) return craftingAmmoIcon(ammoId);
  const rocketId = Object.keys(out.rockets || {})[0];
  if (rocketId) {
    try { return rocketShopIcon(rocketId) || CRAFTING_FALLBACK_ICON; } catch { return CRAFTING_FALLBACK_ICON; }
  }
  const droneType = Object.keys(out.drones || {})[0];
  if (droneType) {
    try { return getDroneShopSpritePath(droneType) || CRAFTING_FALLBACK_ICON; } catch { return CRAFTING_FALLBACK_ICON; }
  }
  const formationId = Object.keys(out.formations || {})[0];
  if (formationId) {
    const formation = DRONE_FORMATIONS.find(entry => entry.id === formationId);
    if (formation?.icon) return formation.icon;
  }
  const itemId = Object.keys(out.items || {})[0] || recipe?.catalogItemId;
  if (itemId) return craftingItemIcon(itemId);
  return CRAFTING_FALLBACK_ICON;
}

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
  const rows = Object.entries(recipe.costs?.resources || {}).map(([id, amount]) => {
    const required = Number(amount) * quantity;
    const owned = craftingResourceAmount(user, id);
    const pct = required > 0 ? Math.min(100, Math.round((owned / required) * 100)) : 100;
    const ok = owned >= required;
    return `<li class="assemblyCostRow${ok ? " enough" : " missing"}">`
      + `<img src="${escapeHtml(getResourceIcon(id))}" alt="" loading="lazy" onerror="this.onerror=null;this.src='${CRAFTING_FALLBACK_ICON}'">`
      + `<span class="assemblyCostMeta"><span class="assemblyCostName">${escapeHtml(getResourceName(id, required))}</span>`
      + `<span class="assemblyCostBar"><i style="width:${pct}%"></i></span></span>`
      + `<strong>${formatInteger(owned)} / ${formatInteger(required)}</strong></li>`;
  });
  const creditRequired = Number(recipe.costs?.credits || 0) * quantity;
  const creditOwned = Number(user.credits || 0);
  const creditPct = creditRequired > 0 ? Math.min(100, Math.round((creditOwned / creditRequired) * 100)) : 100;
  const creditOk = creditOwned >= creditRequired;
  rows.push(`<li class="assemblyCostRow${creditOk ? " enough" : " missing"}">`
    + `<span class="assemblyCreditIcon">¢</span>`
    + `<span class="assemblyCostMeta"><span class="assemblyCostName">Crédits</span>`
    + `<span class="assemblyCostBar"><i style="width:${creditPct}%"></i></span></span>`
    + `<strong>${formatInteger(creditOwned)} / ${formatInteger(creditRequired)}</strong></li>`);
  return rows.join("");
}

function describeCraftingOutputRow(icon, label, amount) {
  return `<li class="assemblyResultRow">`
    + `<img src="${escapeHtml(icon)}" alt="" loading="lazy" onerror="this.onerror=null;this.src='${CRAFTING_FALLBACK_ICON}'">`
    + `<span>${escapeHtml(label)}</span><strong>×${formatInteger(amount)}</strong></li>`;
}

function describeCraftingOutputs(recipe, quantity) {
  const out = recipe?.output || {};
  const rows = [];
  for (const [id, amount] of Object.entries(out.resources || {})) {
    rows.push(describeCraftingOutputRow(getResourceIcon(id), getResourceName(id, Number(amount) * quantity), Number(amount) * quantity));
  }
  for (const [id, amount] of Object.entries(out.ammo || {})) {
    rows.push(describeCraftingOutputRow(craftingAmmoIcon(id), `Munitions ${String(id).toUpperCase()}`, Number(amount) * quantity));
  }
  for (const [id, amount] of Object.entries(out.rockets || {})) {
    let icon = CRAFTING_FALLBACK_ICON;
    try { icon = rocketShopIcon(id) || CRAFTING_FALLBACK_ICON; } catch { /* noop */ }
    const def = ROCKET_TYPES[id];
    rows.push(describeCraftingOutputRow(icon, def?.name || `Roquette ${id}`, Number(amount) * quantity));
  }
  for (const [id, amount] of Object.entries(out.items || {})) {
    rows.push(describeCraftingOutputRow(craftingItemIcon(id), findCatalogItem(id)?.name || id, Number(amount) * quantity));
  }
  for (const [type, amount] of Object.entries(out.drones || {})) {
    let icon = CRAFTING_FALLBACK_ICON;
    try { icon = getDroneShopSpritePath(type) || CRAFTING_FALLBACK_ICON; } catch { /* noop */ }
    rows.push(describeCraftingOutputRow(icon, `Drone ${DRONE_TYPES[type]?.name || String(type).toUpperCase()}`, Number(amount) * quantity));
  }
  for (const [id, amount] of Object.entries(out.formations || {})) {
    const formation = DRONE_FORMATIONS.find(entry => entry.id === id);
    rows.push(describeCraftingOutputRow(formation?.icon || CRAFTING_FALLBACK_ICON, formation?.name || `Formation ${id}`, Number(amount) * quantity));
  }
  return rows.join("");
}

function renderCraftingWindow(message = "") {
  // Assemblage désactivé : on masque la fenêtre, code conservé pour réactivation.
  if (!CRAFTING_ENABLED) {
    document.getElementById("craftingWindow")?.style.setProperty("display", "none", "important");
    window.GameWindowManager?.close?.("craftingWindow");
    if (ui.craftingMessage) ui.craftingMessage.textContent = "Assemblage désactivé.";
    if (ui.craftingBuildBtn) ui.craftingBuildBtn.disabled = true;
    return;
  }
  if (!ui.craftingRecipes || !ui.craftingDetail) return;
  const user = getCurrentUserFull();
  if (!user) return;
  account.user = user;
  const quantity = Math.max(1, Number(ui.craftingQuantity?.value || 1));
  const RARITY_RANK = { common: 0, rare: 1, epic: 2, legendary: 3 };
  const visibleRecipes = CRAFTING_RECIPES.filter(recipe => (RARITY_RANK[recipe.rarity] ?? 0) >= 1);
  if (!visibleRecipes.some(entry => entry.id === selectedCraftingRecipeId)) {
    selectedCraftingRecipeId = visibleRecipes[0]?.id || CRAFTING_RECIPES[0]?.id || null;
  }
  ui.craftingRecipes.innerHTML = `<div class="assemblyTop"><button type="button" class="assemblyArrow" data-assembly-scroll="-1" aria-label="Précédent">◀</button>`
    + `<div class="assemblyStrip noScrollbar">` + visibleRecipes.map(recipe => {
    const rarity = ITEM_RARITIES[recipe.rarity] || ITEM_RARITIES.common;
    const ownershipBlock = getCraftingOwnershipBlock(user, recipe, 1);
    const icon = craftingRecipeMainIcon(recipe);
    const affordable = Object.entries(recipe.costs?.resources || {}).every(([id, amount]) => craftingResourceAmount(user, id) >= Number(amount))
      && Number(user.credits || 0) >= Number(recipe.costs?.credits || 0);
    return `<button type="button" class="assemblySquare rarity-${rarity.id}${recipe.id === selectedCraftingRecipeId ? " active" : ""}${ownershipBlock ? " ownedLimit" : ""}${affordable && !ownershipBlock ? "" : " cantAfford"}" data-recipe-id="${escapeHtml(recipe.id)}" title="${escapeHtml(ownershipBlock ? `${recipe.name} — ${ownershipBlock}` : recipe.name)}"${craftingJob ? " disabled" : ""}>`
      + `<img src="${escapeHtml(icon)}" alt="${escapeHtml(recipe.name)}" loading="lazy" onerror="this.onerror=null;this.src='${CRAFTING_FALLBACK_ICON}'"></button>`;
  }).join("") + `</div><button type="button" class="assemblyArrow" data-assembly-scroll="1" aria-label="Suivant">▶</button></div>`;
  queueMicrotask(() => {
    const active = ui.craftingRecipes?.querySelector(".assemblySquare.active");
    active?.scrollIntoView({ block: "nearest", inline: "center" });
  });
  const recipe = CRAFTING_RECIPES.find(entry => entry.id === selectedCraftingRecipeId) || visibleRecipes[0] || CRAFTING_RECIPES[0];
  if (!recipe) return;
  selectedCraftingRecipeId = recipe.id;
  const rarity = ITEM_RARITIES[recipe.rarity] || ITEM_RARITIES.common;
  const costs = describeCraftingCosts(user, recipe, quantity);
  const outputs = describeCraftingOutputs(recipe, quantity);
  const mainIcon = craftingRecipeMainIcon(recipe);
  const baseDuration = CRAFTING_DURATION_BY_RARITY[rarity.id] || 2;
  const duration = baseDuration * quantity;
  ui.craftingDetail.innerHTML = `<div class="assemblyHead">`
    + `<img class="assemblyMainIcon rarity-${rarity.id}" src="${escapeHtml(mainIcon)}" alt="" onerror="this.onerror=null;this.src='${CRAFTING_FALLBACK_ICON}'">`
    + `<div><div class="craftingRarity rarity-${rarity.id}">${escapeHtml(rarity.name)}</div><h3>${escapeHtml(recipe.name)}</h3>`
    + `<small class="craftingDuration">Temps d'assemblage : ${duration.toFixed(duration % 1 ? 1 : 0)} s</small></div></div>`
    + `<div class="craftingColumns assemblyColumns"><div><h4>CO&Ucirc;T</h4><ul class="assemblyCosts">${costs}</ul></div>`
    + `<div><h4>R&Eacute;SULTAT</h4><ul class="assemblyResults">${outputs}</ul></div></div>`;
  const canAfford = Number(user.credits || 0) >= Number(recipe.costs?.credits || 0) * quantity
    && Object.entries(recipe.costs?.resources || {}).every(([id, amount]) => craftingResourceAmount(user, id) >= Number(amount) * quantity);
  const ownershipBlock = getCraftingOwnershipBlock(user, recipe, quantity);
  if (ui.craftingBuildBtn) ui.craftingBuildBtn.disabled = !canAfford || Boolean(craftingJob) || Boolean(ownershipBlock);
  if (ui.craftingQuantity) ui.craftingQuantity.disabled = Boolean(craftingJob);
  if (ui.craftingMessage) ui.craftingMessage.textContent = message || (craftingJob ? "Assemblage en cours..." : ownershipBlock || (canAfford ? "Prêt à assembler." : "Ressources insuffisantes."));
}

ui.craftingRecipes?.addEventListener("click", event => {
  const scrollBtn = event.target.closest("[data-assembly-scroll]");
  if (scrollBtn) {
    const strip = ui.craftingRecipes?.querySelector(".assemblyStrip");
    const dir = Number(scrollBtn.dataset.assemblyScroll || 1);
    strip?.scrollBy({ left: dir * 320, behavior: "smooth" });
    return;
  }
  const button = event.target.closest("[data-recipe-id]");
  if (!button) return;
  selectedCraftingRecipeId = button.dataset.recipeId;
  renderCraftingWindow();
});
ui.craftingQuantity?.addEventListener("change", () => renderCraftingWindow());
ui.craftingBuildBtn?.addEventListener("click", () => {
  if (!CRAFTING_ENABLED) return renderCraftingWindow("Assemblage désactivé.");
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
  renderCraftingWindow("Assemblage en cours...");
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
    showNotification(`${result.recipe.name} assemblé`, 2.5, "reward", { goldTerms: [result.recipe.name] });
    if (ui.craftingProgress) ui.craftingProgress.hidden = true;
    if (ui.craftingProgressBar) ui.craftingProgressBar.style.width = "0%";
    renderCraftingWindow(`${result.quantity} assemblage${result.quantity > 1 ? "s" : ""} terminé${result.quantity > 1 ? "s" : ""}.`);
  }, 80);
});

// ============================================================
// Raffinage minerais -> minerais nobles (ratios officiels)
// Toujours au Max : seules les recettes faisables s'affichent.
// Auto : raffine dès qu'une recette devient disponible.
// ============================================================
function refineryRefineAll() {
  // Passes répétées : une recette peut débloquer la suivante (ex : Xenomit -> Promerium).
  let total = 0;
  for (let pass = 0; pass < 10; pass++) {
    let progress = 0;
    for (const recipe of REFINERY_RECIPES) {
      const result = refineCurrentUserOre(recipe.id, Infinity);
      if (result.ok) {
        account.user = result.user;
        progress += result.gained;
      }
    }
    total += progress;
    if (progress <= 0) break;
  }
  return total;
}

function maybeRefineryAuto() {
  if (!ui.refineryAuto?.checked) return 0;
  return refineryRefineAll();
}

function renderRefineryWindow(message = "") {
  if (!ui.refineryRecipes || !ui.refineryStock) return;
  const user = account.user || getCurrentUserFull();
  if (!user) return;
  account.user = user;
  const resources = user.inventory?.resources || {};
  const upgrades = user.upgrades || {};
  // Anti-flash : on ne reconstruit que si les stocks ont vraiment changé.
  const sig = ["prometium", "endurium", "terbium", "prometid", "duranium", "promerium", "seprom", "xenomit", "palladium", "osmium"]
    .map(id => `${id}:${Math.floor(Number(resources[id]) || 0)}`).join(",")
    + "|upg:" + ["laser", "rocket", "speed", "shield"].map(slot => `${slot}:${upgrades[slot]?.ore || "-"}:${Math.floor(Number(upgrades[slot]?.stock) || 0)}`).join(",");
  if (ui.refineryWindow && ui.refineryWindow.dataset.stockSig === sig) return;
  if (ui.refineryWindow) ui.refineryWindow.dataset.stockSig = sig;
  const stockIds = ["palladium", "prometium", "endurium", "terbium", "prometid", "duranium", "promerium", "seprom", "xenomit", "osmium"];
  ui.refineryStock.innerHTML = stockIds.map(id =>
    `<span class="refineryOre" draggable="true" data-ore-drag="${escapeHtml(id)}" title="Glisser vers un slot d'amélioration"><img src="${escapeHtml(getResourceIcon(id))}" alt="${escapeHtml(getResourceName(id))}" loading="lazy" draggable="false"><b>${formatInteger(resources[id] || 0)}</b></span>`
  ).join("");
  const rows = [];
  for (const recipe of REFINERY_RECIPES) {
    const { quantity } = refineOreOutput(resources, recipe, Infinity);
    if (quantity <= 0) continue;
    const inputs = Object.entries(recipe.inputs).map(([id, perUnit]) =>
      `<span class="refineryOre"><img src="${escapeHtml(getResourceIcon(id))}" alt="${escapeHtml(getResourceName(id))}" loading="lazy"><b>${formatInteger(Number(perUnit) * quantity)} / ${formatInteger(resources[id] || 0)}</b></span>`
    ).join(`<em class="refineryPlus">+</em>`);
    const output = `<span class="refineryOre out"><img src="${escapeHtml(getResourceIcon(recipe.output.id))}" alt="${escapeHtml(getResourceName(recipe.output.id))}" loading="lazy"><b>+${formatInteger(Number(recipe.output.amount) * quantity)}</b></span>`;
    rows.push(`<div class="refineryRow">${inputs}<em class="refineryArrow">→</em>${output}<button type="button" data-refinery-build="${escapeHtml(recipe.id)}">Raffiner</button></div>`);
  }
  ui.refineryRecipes.innerHTML = rows.length ? rows.join("") : `<div class="refineryEmpty">Rien à raffiner pour le moment.</div>`;
  // Largeur adaptative : on grandit (jamais on rétrécit) pour englober le contenu, sans scroll.
  if (ui.refineryWindow && ui.refineryWindow.style.display !== "none") {
    const need = Math.max(ui.refineryStock?.scrollWidth || 0, ui.refineryRecipes?.scrollWidth || 0) + 26;
    const have = ui.refineryWindow.clientWidth || 0;
    const cap = Math.min(1200, window.innerWidth - 24);
    if (need > have + 1) {
      ui.refineryWindow.style.width = `${Math.min(Math.ceil(need), cap)}px`;
      const rect = ui.refineryWindow.getBoundingClientRect();
      if (rect.right > window.innerWidth - 8) {
        ui.refineryWindow.style.left = `${Math.max(8, window.innerWidth - 8 - rect.width)}px`;
      }
    }
  }
  // Améliorations d'équipement : cartes avec slot drag & drop.
  if (ui.refineryUpgrades) {
    ui.refineryUpgrades.innerHTML = UPGRADE_SLOTS.map(slot => {
      const loaded = upgrades[slot.id] || {};
      const stock = Math.max(0, Math.floor(Number(loaded.stock) || 0));
      const bonusPct = Math.round(Number(UPGRADE_ORE_BONUS[String(loaded.ore)]?.[slot.id] || 0) * 100);
      const slotInner = stock > 0
        ? `<img src="${escapeHtml(getResourceIcon(loaded.ore))}" alt="${escapeHtml(getResourceName(loaded.ore))}" loading="lazy" draggable="false"><b>${formatInteger(stock)}</b>`
        : `<span class="upgSlotEmpty">Vide</span>`;
      const status = stock > 0 ? `+${bonusPct}%` : "";
      return `<div class="upgCard"><span class="upgHelp" title="${escapeHtml(slot.help || "")}">?</span>`
        + `<img class="upgIcon" src="${escapeHtml(slot.icon)}" alt="${escapeHtml(slot.name)}" loading="lazy" draggable="false">`
        + `<b class="upgName">${escapeHtml(slot.name)}</b>`
        + `<div class="upgSlot${stock > 0 ? " filled" : ""}" data-upgrade-slot="${escapeHtml(slot.id)}">${slotInner}</div>`
        + `<small class="upgStatus">${escapeHtml(status)}</small></div>`;
    }).join("");
  }
}

// Persistance checkbox auto-raffinage (sinon décochée à chaque refresh).
try {
  if (ui.refineryAuto) ui.refineryAuto.checked = localStorage.getItem("orbit_refinery_auto") === "1";
} catch {}
ui.refineryAuto?.addEventListener("change", () => {
  try { localStorage.setItem("orbit_refinery_auto", ui.refineryAuto?.checked ? "1" : "0"); } catch {}
  if (ui.refineryAuto?.checked) {
    refineryRefineAll();
    renderRefineryWindow();
  } else {
    renderRefineryWindow();
  }
});

ui.refineryAllBtn?.addEventListener("click", () => {
  saveProgressNow();
  refineryRefineAll();
  renderRefineryWindow();
  window.dispatchEvent(new CustomEvent("orbit:profile-progress"));
});

ui.refineryRecipes?.addEventListener("click", event => {
  const button = event.target.closest("[data-refinery-build]");
  if (!button) return;
  saveProgressNow();
  const result = refineCurrentUserOre(button.dataset.refineryBuild, Infinity);
  if (!result.ok) {
    account.user = result.user || account.user;
    return renderRefineryWindow(result.error);
  }
  account.user = result.user;
  const autoTotal = maybeRefineryAuto();
  renderRefineryWindow(`${formatInteger(result.gained + autoTotal)} ${getResourceName(result.recipe.output.id, result.gained + autoTotal)} raffiné(s).`);
  window.dispatchEvent(new CustomEvent("orbit:profile-progress"));
});
ui.refineryUpgrades?.addEventListener("click", event => {
  const button = event.target.closest("[data-upgrade-charge]");
  if (!button) return;
  const slot = String(button.dataset.upgradeCharge || "");
  const select = ui.refineryUpgrades?.querySelector(`[data-upgrade-ore="${slot}"]`);
  saveProgressNow();
  const result = chargeShipUpgrade(slot, select?.value, Infinity);
  if (!result.ok) {
    account.user = result.user || account.user;
    showToast(result.error, 2);
    return;
  }
  account.user = result.user;
  applyCurrentConfigStats(false, null, true);
  renderRefineryWindow();
  window.dispatchEvent(new CustomEvent("orbit:profile-progress"));
});

// Drag & drop minerai du stock -> slot d'amélioration, puis choix de la quantité.
const UPGRADE_AMOUNT_CHOICES = Object.freeze(["max", 1, 5, 10, 50, 100, 500, 1000]);
let pendingUpgrade = null;
let pendingUpgradeAmount = "max";

function openUpgradeAmountDialog(slotId, oreId) {
  const user = account.user || getCurrentUserFull();
  const slot = UPGRADE_SLOTS.find(entry => entry.id === String(slotId || ""));
  if (!slot || !(UPGRADE_SLOT_ORES[slot.id] || []).includes(String(oreId || ""))) {
    showToast("Minerai incompatible.", 2);
    return;
  }
  const owned = Math.max(0, Math.floor(Number(user?.inventory?.resources?.[oreId]) || 0));
  if (owned <= 0) {
    showToast("Stock vide.", 2);
    return;
  }
  pendingUpgrade = { slot: slot.id, ore: String(oreId) };
  pendingUpgradeAmount = "max";
  if (ui.upgAmountIcon) ui.upgAmountIcon.src = getResourceIcon(oreId);
  if (ui.upgAmountTitle) ui.upgAmountTitle.textContent = `${slot.name} — ${getResourceName(oreId)}`;
  renderUpgradeAmountDialog();
  if (ui.upgAmountDialog) ui.upgAmountDialog.hidden = false;
}

function renderUpgradeAmountDialog() {
  if (!pendingUpgrade || !ui.upgAmountBtns) return;
  const user = account.user || getCurrentUserFull();
  const owned = Math.max(0, Math.floor(Number(user?.inventory?.resources?.[pendingUpgrade.ore]) || 0));
  const slot = UPGRADE_SLOTS.find(entry => entry.id === pendingUpgrade.slot) || {};
  ui.upgAmountBtns.innerHTML = UPGRADE_AMOUNT_CHOICES.map(n => {
    const isMax = n === "max";
    const disabled = isMax ? owned <= 0 : owned < n;
    const active = pendingUpgradeAmount === n ? "active" : "";
    return `<button type="button" data-upgrade-amount="${n}" class="${active}"${disabled ? " disabled" : ""}>${isMax ? "MAX" : n}</button>`;
  }).join("");
  const amount = pendingUpgradeAmount === "max" ? Math.min(owned, 100000) : pendingUpgradeAmount;
  const gives = amount * 10;
  if (ui.upgAmountPreview) ui.upgAmountPreview.textContent = `${pendingUpgradeAmount === "max" ? "MAX" : pendingUpgradeAmount} minerai → +${formatInteger(gives)} ${slot.unit || "tirs"} (stock : ${formatInteger(owned)})`;
}

function closeUpgradeAmountDialog() {
  pendingUpgrade = null;
  if (ui.upgAmountDialog) ui.upgAmountDialog.hidden = true;
}

ui.refineryStock?.addEventListener("dragstart", event => {
  const source = event.target.closest("[data-ore-drag]");
  if (!source) return;
  event.dataTransfer?.setData("text/plain", String(source.dataset.oreDrag || ""));
  event.dataTransfer?.setData("application/x-ore", String(source.dataset.oreDrag || ""));
});

ui.refineryUpgrades?.addEventListener("dragover", event => {
  const slot = event.target.closest("[data-upgrade-slot]");
  if (!slot) return;
  event.preventDefault();
  slot.classList.add("dragTarget");
});

ui.refineryUpgrades?.addEventListener("dragleave", event => {
  const slot = event.target.closest("[data-upgrade-slot]");
  if (slot && !slot.contains(event.relatedTarget)) slot.classList.remove("dragTarget");
});

ui.refineryUpgrades?.addEventListener("drop", event => {
  const slot = event.target.closest("[data-upgrade-slot]");
  if (!slot) return;
  event.preventDefault();
  slot.classList.remove("dragTarget");
  const ore = event.dataTransfer?.getData("application/x-ore") || event.dataTransfer?.getData("text/plain");
  if (ore) openUpgradeAmountDialog(slot.dataset.upgradeSlot, ore);
});

ui.upgAmountBtns?.addEventListener("click", event => {
  const button = event.target.closest("[data-upgrade-amount]");
  if (!button || button.disabled) return;
  const raw = button.dataset.upgradeAmount;
  pendingUpgradeAmount = raw === "max" ? "max" : Math.max(1, Math.floor(Number(raw) || 1));
  renderUpgradeAmountDialog();
});

ui.upgAmountCancel?.addEventListener("click", closeUpgradeAmountDialog);

ui.upgAmountOk?.addEventListener("click", () => {
  if (!pendingUpgrade) return closeUpgradeAmountDialog();
  saveProgressNow();
  const user = account.user || getCurrentUserFull();
  const owned = Math.max(0, Math.floor(Number(user?.inventory?.resources?.[pendingUpgrade.ore]) || 0));
  // MAX plafonné à 100 000 minerais (= 1 000 000 tirs/minutes).
  const amount = pendingUpgradeAmount === "max" ? Math.min(owned, 100000) : pendingUpgradeAmount;
  const result = chargeShipUpgrade(pendingUpgrade.slot, pendingUpgrade.ore, amount);
  if (!result.ok) {
    account.user = result.user || account.user;
    showToast(result.error, 2);
    closeUpgradeAmountDialog();
    return;
  }
  account.user = result.user;
  applyCurrentConfigStats(false, null, true);
  closeUpgradeAmountDialog();
  renderRefineryWindow();
  window.dispatchEvent(new CustomEvent("orbit:profile-progress"));
});
queueMicrotask(() => renderRefineryWindow());
window.addEventListener("orbit:window-restored", event => {
  if (event.detail?.id === "craftingWindow") renderCraftingWindow();
  if (event.detail?.id === "refineryWindow") renderRefineryWindow();
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
  ui.ggMultiplier.textContent = `x${state.multiplier}`;
  if (ui.ggMultiplierBtn) {
    const armed = state.multiplierArmed === true;
    ui.ggMultiplierBtn.disabled = state.multiplier <= 1;
    ui.ggMultiplierBtn.classList.toggle("active", armed);
    const actionLabel = ui.ggMultiplierBtn.querySelector(".ggMultiplierAction");
    if (actionLabel) actionLabel.textContent = armed ? "Activée" : "Désactivée";
  }
  const isActive = state.active === gate.id;
  const isDeployed = state.deployed?.[gate.id] === true;
  const stock = Math.max(0, Math.floor(Number(state.built[gate.id]) || 0));
  const status = isActive ? "En cours" : isDeployed ? (stock > 0 ? `Sur la map + stock ${stock}/${GALAXY_GATE_BUILD_LIMIT}` : "Sur la map") : (stock > 0 ? `Stock ${stock}/${GALAXY_GATE_BUILD_LIMIT}` : "");
  ui.ggBuilt.textContent = status ? `${formatInteger(stock)} / ${GALAXY_GATE_BUILD_LIMIT} · ${status}` : `${formatInteger(stock)} / ${GALAXY_GATE_BUILD_LIMIT}`;
  if (ui.ggCompleted) ui.ggCompleted.textContent = formatInteger(state.completed[gate.id]);
  if (ui.ggLives) ui.ggLives.textContent = `${formatInteger(state.lives?.[gate.id] ?? gate.maxLives)} / ${formatInteger(gate.maxLives)}`;
  const activeWave = state.active === gate.id
    ? Math.min(gate.maxWaves, Math.max(1, Number(state.activeWave) || 1))
    : Math.min(gate.maxWaves, Math.max(0, Number(state.waves?.[gate.id]) || 0));
  ui.ggWave.textContent = `${activeWave} / ${gate.maxWaves}`;
  const selectedSpinCount = Math.max(1, Number(ui.ggSpinCount?.value || 1));
  ui.ggCreditCost.textContent = formatInteger(GALAXY_SPIN_CREDIT_COST * selectedSpinCount);
  ui.ggSpinBtn.hidden = false;
  ui.ggSpinBtn.disabled = false;
  // ✅ plus de bouton "Préparer" : le placement sur la map est automatique.
  if (ui.ggDeployBtn) ui.ggDeployBtn.remove();
  ui.ggDeployBtn = null;
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
    const ROCKET_REWARD_NAMES = { plt2021: "PLT-2021", plt3030: "PLT-3030", ubr100: "UBR-100", hstrm01: "HSTRM-01" };
    const rockets = Object.entries(reward.rockets || {})
      .map(([id, amount]) => [id, Math.max(0, amount - (appliedTotals[`rockets:${id}`] || 0))])
      .filter(([, amount]) => amount > 0)
      .map(([id, amount]) => `${formatInteger(amount)} roquettes ${escapeHtml(ROCKET_REWARD_NAMES[String(id).toLowerCase()] || String(id).toUpperCase())}`);
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
      if (applied.rewardType === "ammo") return `${formatInteger(applied.amount)} Munitions ${escapeHtml(String(applied.rewardId || "").toUpperCase())} (x${applied.multiplier})`;
      if (applied.rewardType === "rockets") return `${formatInteger(applied.amount)} Roquettes ${escapeHtml(ROCKET_REWARD_NAMES[String(applied.rewardId || "").toLowerCase()] || String(applied.rewardId || "").toUpperCase())} (x${applied.multiplier})`;
      if (applied.rewardType === "credits") return `${formatInteger(applied.amount)} Crédits (x${applied.multiplier})`;
      if (applied.rewardType === "energy") return `${formatInteger(applied.amount)} Énergies (x${applied.multiplier})`;
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
    const gains = [...formatGalaxyGatePartRewards({ partsByGate: remainingParts }), ...built, ...duplicates, credits, energy, ...ammo, ...rockets].filter(Boolean);
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
  const armed = state?.multiplierArmed === true;
  const result = armCurrentUserGalaxyGateMultiplier(selectedGalaxyGateId, !armed);
  if (!result.ok) return renderGalaxyGateWindow(result.error);
  account.user = result.user;
  renderGalaxyGateWindow(armed ? "Multiplicateur désactivé." : "Multiplicateur activé pour le prochain spin.");
});

ui.galaxyGateWindow?.addEventListener("click", event => {
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
  player.ammo.sab = result.user.ammo.sab;
  player.ammo.x6 = result.user.ammo.x6;
  player.rockets = player.rockets || {};
  for (const [rocketId, amount] of Object.entries(result.user.rockets || {})) {
    player.rockets[rocketId] = amount;
  }
  updateAmmoUI();
  const reward = result.rewards;
  const pieces = formatGalaxyGatePartRewards(reward).join(", ");
  const ammo = Object.entries(reward.ammo || {}).filter(([, amount]) => amount > 0).map(([id, amount]) => `${formatInteger(amount)} munitions ${id.toUpperCase()}`).join(", ");
  const rocketGains = Object.entries(reward.rockets || {}).filter(([, amount]) => amount > 0).map(([id, amount]) => {
    const key = String(id).toLowerCase();
    const label = key === "plt2021" ? "PLT-2021" : key === "plt3030" ? "PLT-3030" : key === "ubr100" ? "UBR-100" : key === "hstrm01" ? "HSTRM-01" : id.toUpperCase();
    return `${formatInteger(amount)} roquettes ${label}`;
  }).join(", ");
  const autoPlaced = Array.isArray(reward.autoDeployed) ? reward.autoDeployed.map((id) => `${GALAXY_GATE_DEFINITIONS[id]?.name || id} placée sur la map`) : [];
  const stockInfo = (reward.built ? [`${reward.built} Gate(s) terminée(s)`] : []).concat(autoPlaced);
  const extras = [reward.credits ? `${formatInteger(reward.credits)} crédits` : "", reward.energy ? `${reward.energy} énergie` : "", stockInfo.join(", ")].filter(Boolean).join(", ");
  renderGalaxyGateWindow([`${result.performed} spin(s)`, pieces, ammo, rocketGains, extras].filter(Boolean).join(" · "));
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
  // Comme le bouton vente : le vaisseau doit être dans ce rayon AUTOUR DU BOUTON.
  proximityRadius: 450,
};

// Bouton Commerce minerais (sprites raffinerie d'origine : clickBubbles buttonRefinement).
const TRADE_BUTTON = {
  idle: { src: "ASSETS/TRADE_BUTTON/1.png" },
  mouse: { src: "ASSETS/TRADE_BUTTON/2.png" },
  click: { src: "ASSETS/TRADE_BUTTON/3.png" },
  w: 88,
  h: 135,
  gap: 12,
  // Le vaisseau doit être dans ce rayon AUTOUR DU BOUTON pour le rendre cliquable.
  proximityRadius: 450,
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
  const combatRestrictedMap = /^4-[123]$/.test(mapId) || mapId === "4-4" || mapId === "4-5";
  // Battle 4-x : les NPC ne bloquent jamais le saut, seul un joueur qui nous
  // attaque verrouille (pvpAttackT, posé par hurtPlayer avec source.byPlayer).
  const pvpCooldown = Number(player.pvpAttackT) || 0;
  if (combatRestrictedMap && pvpCooldown > 0) {
    SFX.play("swDeny");
    showToast(`Portail verrouillé — attaqué par un joueur, attends ${Math.ceil(pvpCooldown)} s`, 1.4);
    return false;
  }

  // Niveau requis façon DarkOrbit officiel (voir SRC/CORE/MAP_ACCESS.js).
  // Vérifié avant les coûts : inutile de payer si le niveau bloque.
  const targetMapId = String(ptl.toMap || "").toLowerCase();
  if (targetMapId) {
    const user = account.user || getCurrentUserFull();
    const playerLevel = getLevelInfo(Number(user?.stats?.exp || 0)).level;
    const access = checkMapAccess(targetMapId, playerLevel, getFaction(user?.faction).sector);
    if (!access.ok) {
      SFX.play("swDeny");
      showToast(`Accès refusé — niveau ${access.required} requis pour ${targetMapId.toUpperCase()} (niveau ${access.level})`, 2.4);
      return false;
    }
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
    // ✅ arrivée de l'autre côté = son "saut terminée" (comme les portails de zone).
    try { sessionStorage.setItem("orbit_gate_jump", "1"); } catch {}
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

// ✅ Sauvegarde rapprochée de la position : toutes les 3 s quand le joueur
// a bougé (ou changé de map), pour retrouver sa place exacte après un refresh.
// Réutilise savePositionNow() : ne persiste que position/map/vitalité,
// sans toucher au reste de la progression.
let positionSaveCd = 0;
const lastPositionSave = { x: NaN, y: NaN, map: "" };

function awardExperience(amount, source = "") {
  if (!account.user) loadAccountUser();
  if (!account.user) return null;
  account.user.stats ||= { honor: 0, exp: 0, rankPoints: 0 };
  const moduleBonus = Number(player?.expBonusPct || 0);
  const raw = Number(amount || 0) * Math.max(0, 1 + moduleBonus / 100) * playerBoosterMults().exp;
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
    account.user.pet.exp = Math.max(0, Number(account.user.pet.exp) || 0) + result.gained * PET_XP_SHARE * playerBoosterMults().petXp;
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
  const raw = Number(amount || 0) * Math.max(0, 1 + moduleBonus / 100) * playerBoosterMults().honor;
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
  // Fusionne aussi le stockage frais : progression externe (ou autre onglet)
  // adoptée sans jamais perdre la progression mémoire (on garde le max).
  {
    const persisted = normalizeQuestState(getCurrentUserFull()?.quests);
    if (persisted) {
      for (const [id, prog] of Object.entries(persisted.active)) {
        if (questState.completed.includes(id)) continue;
        const mem = questState.active[id];
        if (!mem) {
          if (Object.keys(questState.active).length < MAX_ACTIVE_QUESTS) questState.active[id] = { ...prog };
          continue;
        }
        for (const [oid, val] of Object.entries(prog)) {
          if (Number(val) > Number(mem[oid] || 0)) mem[oid] = Number(val);
        }
      }
      for (const id of persisted.completed) {
        if (!questState.completed.includes(id)) questState.completed.push(id);
        if (questState.active[id]) delete questState.active[id];
      }
    }
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
  try { window.dispatchEvent(new CustomEvent("orbit:npc-locations-ready")); } catch {}
});

// Graphe des portails pour le voyage physique du BOT (BFS multi-sauts).
let botPortalIndex = null;
loadPortalIndex().then(index => {
  botPortalIndex = index;
  try { window.dispatchEvent(new CustomEvent("orbit:portal-index-ready")); } catch {}
});

function openQuestTerminal() {
  renderQuestTerminal();
  window.GameWindowManager?.restore("questOfferWindow");
}

function closeQuestTerminal() {
  const card = ui.questOfferWindow;
  if (!card || card.classList.contains("gameWinClosing")) return;
  if (window.GameWindowManager) {
    // Même effet de disparition que le commerce, sans icône dock.
    card.classList.add("gameWinClosing");
    setTimeout(() => {
      card.classList.remove("gameWinClosing");
      window.GameWindowManager?.close("questOfferWindow");
    }, 360);
  } else card.style.display = "none";
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

// Rend une quête terminée + distribue les récompenses (même logique que le
// clic manuel : crédits, munitions, XP, honneur, énergie GG). Réutilisé par
// le BOT (quêtes auto). Retourne true si rendue.
function claimQuestReward(questId) {
  const reward = claimQuest(questState, questId);
  if (!reward) return false;
  const quest = QUEST_DEFINITIONS.find(item => item.id === questId);
  // Booster QR-01 : récompenses de quêtes doublées.
  const questMult = playerBoosterMults().quest;
  const creditsGained = Math.max(0, Math.floor(Number(reward.credits || 0) * questMult));
  player.credits += creditsGained;
  const ammoRewards = Object.entries(reward.ammo || {}).filter(([type, amount]) => Object.hasOwn(player.ammo, type) && Number(amount) > 0);
  const ammoGained = ammoRewards.map(([type, amount]) => [type, Math.max(0, Math.floor(Number(amount) * questMult || 0))]);
  for (const [type, gained] of ammoGained) player.ammo[type] += gained;
  if (ammoGained.length) updateAmmoUI();
  const experience = Math.floor(getQuestExperienceReward(quest) * questMult);
  const honor = Math.floor(getQuestHonorReward(quest) * questMult);
  // Montants réellement reçus (bonus modules + boosters XP/honneur inclus).
  const gainedXp = awardExperience(experience)?.gained ?? experience;
  const gainedHonor = awardHonor(honor)?.gained ?? honor;
  if (account.user?.stats) account.user.stats.rankPoints = calculateRankPoints(account.user.stats);
  markProgressDirty();
  saveProgressNow();
  const galaxyEnergy = Math.max(0, Math.floor(Number(reward.galaxyEnergy) * questMult || 0));
  if (galaxyEnergy > 0) {
    const energyResult = grantCurrentUserGalaxyEnergy(galaxyEnergy);
    if (energyResult.ok) {
      account.user = energyResult.user;
      renderGalaxyGateWindow();
    }
  }
  const AMMO_REWARD_NAMES = { x6: "RSB-75", rcb: "RCB-140", cbo: "CBO-100", job: "JOB-100", rb: "RB-214", pib: "PIB-100", idb: "IDB-125", vb: "VB-142", emaa: "EMAA-20", sbl: "SBL-100", abl: "A-BL", sab: "SAB-50", x2: "MCB-25", x3: "MCB-50", x4: "UCB-100", x1: "LCB-10" };
  const ammoMessages = ammoGained.map(([type, gained]) => `Vous avez reçu ${formatInteger(gained)} munitions ${AMMO_REWARD_NAMES[type] || String(type).toUpperCase()}`);
  const energyMessage = galaxyEnergy > 0 ? `Vous avez reçu ${formatInteger(galaxyEnergy)} énergies pour les portails intergalactiques (GG)` : "";
  addGameLog(`Mission ${quest?.title || questId} · +${formatInteger(creditsGained)} crédits · +${formatInteger(gainedXp)} XP · +${formatInteger(gainedHonor)} honneur${ammoMessages.length ? ` · ${ammoMessages.join(" · ")}` : ""}${energyMessage ? ` · ${energyMessage}` : ""}`, "reward");
  showNotificationGroup([
    `Vous avez reçu ${formatInteger(creditsGained)} crédits`,
    `Vous avez gagné ${formatInteger(gainedXp)} XP`,
    `Vous avez gagné ${formatInteger(gainedHonor)} honneur`,
    ...ammoMessages,
    ...(energyMessage ? [energyMessage] : []),
  ]);
  return true;
}

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
    claimQuestReward(questId);
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

  // ⚠ï¸ Ne pas sauvegarder ship ici non plus.
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

  // Le cache suit la nouvelle capacité si l'équipement a changé depuis la visite.
  const resized = resizeShield(saved, player.shMax);
  CONFIG_SHIELDS[cfg] = resized;
  player.sh = resized.sh;
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
  // ✅ Leonov home (x-1 à x-4 de sa firme) : vitesse x2, comme le moteur
  // de déplacement (player.baseSpeed) — sinon l'HUD affiche la moitié.
  const leonovHome = isLeonovHomeActive();
  const total = Math.floor((base + genSpeed) * (1 + speedPct / 100) * playerUpgradeMults().speed * (leonovHome ? 1.2 : 1));

  return {
    shipId,
    config: Number(activeConfig),
    base,
    genSpeed,
    speedPct,
    leonovHome,
    total,
    speedItems,
    speedModules,
  };
}

function getConfigCooldownLeft() {
  return Math.max(0, (CONFIG_SWITCH.until - Date.now()) / 1000);
}

function applyCurrentConfigStats(keepRatios = true, restoreShieldConfigNo = null, keepAbsolute = false) {
  const u = loadAccountUser();
  if (!u) return false;

  const shipId = u.ship || ACTIVE_SHIP?.id || "PhoenixBleu";
  const pack = getShipPackById(shipId);
  ACTIVE_SHIP = pack;

  const hangar = getActiveHangarFromUser(u);
  const stats = computeHangarStats(hangar, u, { mapId: currentMapId() });
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
    Math.floor((shipBaseHP + (stats.bonusFlatHP || 0)) * (1 + (stats.bonusHPPct || 0) / 100) * playerBoosterMults().hp)
  );
  refreshBuoyHpBase();

  player.shMax = Math.max(0, Math.floor((Number(stats.bonusShield) || 0) * playerBoosterMults().shield * playerUpgradeMults().shield));
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
    // ✅ Valeurs absolues conservées : le now ne bouge pas, seul le max
    // change (les barres now/max se recalculent).
    if (keepAbsolute) {
      player.hp = Math.max(1, Math.min(player.hpMax, Math.floor(player.hp)));
      // Si on change de config : on restaure le bouclier de CETTE config.
      if (restoreShieldConfigNo !== null) {
        restoreShieldForConfig(restoreShieldConfigNo);
      } else {
        player.sh = Math.max(0, Math.min(player.shMax, Math.floor(player.sh)));
      }
    } else {
      // HP reste partage (changement de config)
      player.hp = Math.max(1, Math.floor(player.hpMax * oldHpPct));

      // Si on change de config : on restaure le bouclier de CETTE config
      if (restoreShieldConfigNo !== null) {
        restoreShieldForConfig(restoreShieldConfigNo);
      } else {
        player.sh = Math.max(0, Math.floor(player.shMax * oldShPct));
      }
    }
  }

  player.baseDamage = Math.max(1, Math.floor(stats.totalLaserDamage || 1));

  player.laserHitBonusPct = clamp(Number(stats.bonusLaserHitPct || 0), -100, 100);
  player.expBonusPct = Number(stats.bonusExpPct || 0);
  player.honorBonusPct = Number(stats.bonusHonorPct || 0);

  const shipBaseSpeed = Number(pack?.speed || 0);
  player.baseSpeed = Math.max(
    10,
    Math.floor((shipBaseSpeed + (stats.bonusSpeed || 0)) * playerUpgradeMults().speed * (stats.speedMult || 1))
  );

  player.accel = BASE_RUN.accel;
  player.friction = BASE_RUN.friction;

  return true;
}

function updateConfigButtons() {
  const active = getActiveConfigNo();
  const left = getConfigCooldownLeft();

  if (ui.cfgToggleBtn) {
    setHudText(ui.cfgToggleBtn, String(active));
    setHudClass(ui.cfgToggleBtn, "active", true);
    setHudDisabled(ui.cfgToggleBtn, left > 0 || player.dead);
  }
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

  // setActiveHangarConfig publishes the complete update synchronously.
  // The account listener applies the destination configuration exactly once.

  // Recalcul explicite (ne depend pas de l'ecouteur) : absolu + bouclier restaure.
  applyCurrentConfigStats(false, nextConfig, true);

  CONFIG_SWITCH.until = Date.now() + CONFIG_SWITCH.cooldownMs;

  updateConfigButtons();
  drawUI();

  showToast(`Configuration ${nextConfig} activée`, 1.1);
}

ui.cfg1Btn?.addEventListener("click", () => trySwitchConfig(1));
ui.cfg2Btn?.addEventListener("click", () => trySwitchConfig(2));
ui.cfgToggleBtn?.addEventListener("click", () => {
  const current = getActiveConfigNo();
  trySwitchConfig(current === 1 ? 2 : 1);
});

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
  const logVisibleNow = () => ui.gameLogWindow
    && ui.gameLogWindow.style.display !== "none"
    && !ui.gameLogWindow.classList.contains("gameWinMinimized");
  // Rendu immédiat (sans attendre IndexedDB) : le journal est toujours frais.
  if (gameLogPage === 0 && logVisibleNow()) void renderGameLog();
  const userId = getGameLogUserId();
  void appendGameLog(userId, entry)
    .then(() => {
      if (gameLogPage === 0 && logVisibleNow()) void renderGameLog();
    })
    .catch(error => {
      console.warn("Écriture du journal impossible :", error);
      if (gameLogPage === 0 && logVisibleNow()) void renderGameLog();
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
document.getElementById("gameLogResizeHandle")?.addEventListener("pointerdown", (event) => {
  const panel = document.getElementById("gameLogWindow");
  if (!panel) return;
  event.preventDefault();
  event.stopPropagation();
  const startX = event.clientX;
  const startY = event.clientY;
  const rect = panel.getBoundingClientRect();
  const startW = rect.width;
  const startH = rect.height;
  const onMove = (ev) => {
    const w = Math.min(window.innerWidth - 20, Math.max(380, startW + ev.clientX - startX));
    const h = Math.min(window.innerHeight - 20, Math.max(260, startH + ev.clientY - startY));
    panel.style.width = `${Math.round(w)}px`;
    panel.style.height = `${Math.round(h)}px`;
  };
  const onUp = () => {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onUp);
  };
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  window.addEventListener("pointercancel", onUp);
});
void renderGameLog();
// Re-rendu à chaque réouverture (sinon le contenu date de la fermeture).
if (ui.gameLogWindow && typeof MutationObserver !== "undefined") {
  let gameLogWasVisible = ui.gameLogWindow.style.display !== "none"
    && !ui.gameLogWindow.classList.contains("gameWinMinimized");
  new MutationObserver(() => {
    const visible = ui.gameLogWindow.style.display !== "none"
      && !ui.gameLogWindow.classList.contains("gameWinMinimized");
    if (visible && !gameLogWasVisible) void renderGameLog();
    gameLogWasVisible = visible;
  }).observe(ui.gameLogWindow, { attributes: true, attributeFilter: ["style", "class"] });
}

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

  // Repli : notre REX (si en jeu et en vie), après les NPC.
  if (!best && petLockValid()) {
    const dx = w.x - petState.x;
    const dy = w.y - petState.y;
    if (Math.abs(dx) <= PET_DRAW_W / 2 && Math.abs(dy) <= PET_DRAW_H / 2) {
      best = petTargetProxy;
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
  // Raygun désactivé : on ne charge plus COMBAT/RAYGUN/RAYGUN2/.
  if (!LASER_PACK._promise) LASER_PACK._promise = Promise.resolve(false);
  return LASER_PACK._promise;
}

ensureLaserLoaded().then(() => {
  // Volontairement vide : laserReady reste à false, rien à afficher.
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
// ✅ SLOW EFFECT - sprite officiel sur toute cible ralentie
// (PIB-100, DCR-250, K-300M) : boucle 30 frames 250x250.
// ============================================================
const SLOW_FX_PACK = {
  path: "ASSETS/SLOW_EFFECT/",
  frames: 30,
  firstNumber: 1,
  ext: ".png",
  fps: 24,
  // frames 1-15 = cible en mouvement, 16-30 = cible sur place.
  moveFrames: 15,
  // crop commun (union des contenus) pour une taille stable entre les 2 phases.
  crop: { x: 19, y: 7, w: 210, h: 235 },
};

let slowFxImgs = [];
let slowFxReady = false;

function ensureSlowFxLoaded() {
  if (SLOW_FX_PACK._promise) return SLOW_FX_PACK._promise;

  SLOW_FX_PACK._imgs = new Array(SLOW_FX_PACK.frames);

  SLOW_FX_PACK._promise = (async () => {
    const jobs = [];
    for (let i = 0; i < SLOW_FX_PACK.frames; i++) {
      const src = `${SLOW_FX_PACK.path}${SLOW_FX_PACK.firstNumber + i}${SLOW_FX_PACK.ext}`;
      jobs.push(
        loadImage(src, { priority: false })
          .then((img) => (SLOW_FX_PACK._imgs[i] = img))
          .catch(() => (SLOW_FX_PACK._imgs[i] = null))
      );
    }
    await Promise.all(jobs);
    slowFxImgs = SLOW_FX_PACK._imgs;
    slowFxReady = true;
  })();

  return SLOW_FX_PACK._promise;
}

// ============================================================
// ✅ ICE EFFECT - image officielle sur toute cible gelée
// (R-IC3, RC-100) : 300x300, contenu 252x226.
// ============================================================
const ICE_FX = { src: "ASSETS/SHOOT_EFFECT/ICE_EFFECT.png", crop: { x: 39, y: 43, w: 252, h: 226 } };

let iceFxImg = null;

function ensureIceFxLoaded() {
  if (ICE_FX._promise) return ICE_FX._promise;
  ICE_FX._promise = loadImage(ICE_FX.src, { priority: false })
    .then((img) => (iceFxImg = img))
    .catch(() => (iceFxImg = null));
  return ICE_FX._promise;
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

// ============================================================
// ✅ BOOSTERS temporaires (boutique + fenêtre Boosters)
// ============================================================
function playerBoosterMults() {
  try {
    return activeBoosterMults(account.user?.boosters, Date.now());
  } catch {
    return { dmg: 1, shield: 1, hp: 1, exp: 1, honor: 1, repair: 1, res: 1, petXp: 1, hit: 0, sreg: 1, box: 1, quest: 1 };
  }
}

let boosterPrevSignature = "";
let boosterWindowRefreshT = 0;
let boosterResyncT = 0;
let upgradeDrainT = 0;
let refineryLiveT = 0;

function boosterActiveSignature() {
  const active = account.user?.boosters?.active || {};
  const counts = account.user?.inventory?.counts || {};
  const now = Date.now();
  // Actifs + stocks : un achat (stock seul) re-rend aussi la fenêtre.
  return BOOSTERS.map((d) => `${Number(active[d.id] || 0) > now ? "1" : "0"}:${Math.max(0, Math.floor(Number(counts[boosterCatalogId(d)] || 0)))}`).join("|");
}

function tickBoosters(dt) {
  if (!started) return;
  // Usure améliorations bouclier/vitesse : 1 minerai / 60 s.
  upgradeDrainT += dt;
  if (upgradeDrainT >= 60) {
    upgradeDrainT = 0;
    let drained = false;
    if (consumeUpgradeStock("shield")) drained = true;
    if (consumeUpgradeStock("speed")) drained = true;
    if (drained && ui.refineryWindow && ui.refineryWindow.style.display !== "none") renderRefineryWindow();
  }
  // Relecture périodique du compte (achats boutique, autre onglet...) :
  // les nouveaux boosters s'appliquent aux calculs sous 2 s max.
  boosterResyncT += dt;
  if (boosterResyncT >= 2) {
    boosterResyncT = 0;
    try {
      const fresh = getCurrentUserFull();
      if (fresh && Number(fresh.revision || 0) !== Number(account.user?.revision || 0)) {
        account.user = fresh;
        try { applyCurrentConfigStats(false, null, true); } catch {}
      }
    } catch {}
  }
  const now = Date.now();
  const userBoosters = account.user?.boosters;
  // Migration du stock résiduel (anciennes versions) : tout part en timer.
  const counts = account.user?.inventory?.counts;
  if (userBoosters && counts) {
    for (const def of BOOSTERS) {
      const stockKey = `booster_${def.id}`;
      const stock = Math.max(0, Math.floor(Number(counts[stockKey] || 0)));
      if (stock <= 0) continue;
      const current = Number(userBoosters.active?.[def.id] || 0);
      const base = current > now ? current : now;
      userBoosters.active ??= {};
      userBoosters.active[def.id] = base + Math.max(1, Number(def.durationSec) || 0) * 1000 * stock;
      counts[stockKey] = 0;
    }
  }
  const signature = boosterActiveSignature();
  if (signature !== boosterPrevSignature) {
    const prev = boosterPrevSignature;
    boosterPrevSignature = signature;
    if (prev !== "") {
      // Activation ou expiration : on recalcule les max (bouclier/coque)
      // en gardant les valeurs absolues, on annonce les fins, on sauvegarde.
      try { applyCurrentConfigStats(false, null, true); } catch {}
      const prevStates = prev.split("|");
      const nextStates = signature.split("|");
      if (prevStates.length === nextStates.length) {
        BOOSTERS.forEach((b, i) => {
          const wasActive = (prevStates[i] || "").startsWith("1:");
          const isActive = (nextStates[i] || "").startsWith("1:");
          if (wasActive && !isActive) showToast(`Booster ${b.name} terminé`, 2.2);
          if (!wasActive && isActive) showToast(`Booster ${b.name} activé`, 2.2);
        });
      }
      markProgressDirty();
      saveProgressNow();
      renderBoosterWindow();
    }
  }
  // Compte à rebours de la fenêtre (1 s).
  boosterWindowRefreshT += dt;
  if (boosterWindowRefreshT >= 1) {
    boosterWindowRefreshT = 0;
    refreshBoosterCountdowns();
  }
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
// ✅ SHIELD SHIMMER - halo de bouclier officiel rejoué par-dessus
// le vaisseau à intervalle aléatoire (1 à 10 s) tant que la config
// active a du bouclier, avec le son shieldSelected.
// ============================================================
const SHIELD_SHIMMER_PACK = {
  path: "ASSETS/SHIELD_SHIMMER/",
  frames: 33,
  firstNumber: 1,
  ext: ".png",
  fps: 24,
};

let shieldShimmerImgs = [];
let shieldShimmerReady = false;
let shieldShimmerT = -1; // progression de l'anim (-1 = inactif)
let shieldShimmerNext = 10 + Math.random() * 20; // délai avant le prochain jeu (s)
let shieldShimmerCfg = null; // config suivie (détecte le changement)

function ensureShieldShimmerLoaded() {
  if (SHIELD_SHIMMER_PACK._promise) return SHIELD_SHIMMER_PACK._promise;

  SHIELD_SHIMMER_PACK._imgs = new Array(SHIELD_SHIMMER_PACK.frames);

  SHIELD_SHIMMER_PACK._promise = (async () => {
    const jobs = [];
    for (let i = 0; i < SHIELD_SHIMMER_PACK.frames; i++) {
      const src = `${SHIELD_SHIMMER_PACK.path}${SHIELD_SHIMMER_PACK.firstNumber + i}${SHIELD_SHIMMER_PACK.ext}`;
      jobs.push(
        loadImage(src, { priority: false })
          .then((img) => (SHIELD_SHIMMER_PACK._imgs[i] = img))
          .catch(() => (SHIELD_SHIMMER_PACK._imgs[i] = null))
      );
    }
    await Promise.all(jobs);
    shieldShimmerImgs = SHIELD_SHIMMER_PACK._imgs;
    shieldShimmerReady = true;
  })();

  return SHIELD_SHIMMER_PACK._promise;
}

function tickShieldShimmer(dt) {
  if (!started || player.dead) {
    shieldShimmerT = -1;
    return;
  }
  // En combat, le temps est gelé : ni le délai ni l'anim ne progressent,
  // ça reprend exactement où c'était à la fin du combat.
  if ((Number(player.combatT) || 0) > 0 || attackActive === true) return;
  const cfg = getActiveConfigNo();
  if (cfg !== shieldShimmerCfg) {
    // Changement de config : on repart vite si la nouvelle a du bouclier.
    shieldShimmerCfg = cfg;
    shieldShimmerT = -1;
    shieldShimmerNext = 1 + Math.random() * 2;
  }
  const hasShield = (player.shMax > 0) && (player.sh > 0);
  if (!hasShield) {
    // Plus de bouclier : pause. Au retour du bouclier, ça rejoue
    // dans un délai frais de 10 à 30 s.
    shieldShimmerT = -1;
    shieldShimmerNext = 10 + Math.random() * 20;
    return;
  }
  if (shieldShimmerT >= 0) {
    shieldShimmerT += dt;
    if (shieldShimmerT >= SHIELD_SHIMMER_PACK.frames / SHIELD_SHIMMER_PACK.fps) shieldShimmerT = -1;
    return;
  }
  shieldShimmerNext -= dt;
  if (shieldShimmerNext <= 0) {
    shieldShimmerT = 0;
    shieldShimmerNext = 10 + Math.random() * 20;
    ensureShieldShimmerLoaded();
    SFX.play("shieldSelected");
  }
}

// Dessiné par-dessus le vaisseau quand l'anim est en cours,
// avec fondu d'apparition / disparition.
function drawShieldShimmer() {
  if (shieldShimmerT < 0 || !shieldShimmerReady || !shieldShimmerImgs?.length) return;

  const frames = SHIELD_SHIMMER_PACK.frames || shieldShimmerImgs.length;
  const idx = Math.min(frames - 1, Math.floor(shieldShimmerT * SHIELD_SHIMMER_PACK.fps));
  const img = shieldShimmerImgs[idx];
  if (!isImgReady(img)) return;

  const pack = ACTIVE_SHIP || SHIP_PACKS[0];
  const size = Math.max(pack?.w ?? 170, pack?.h ?? 170) + 30;
  const dur = frames / SHIELD_SHIMMER_PACK.fps;
  const fade = 0.3;
  const alpha = clamp(Math.min(shieldShimmerT / fade, (dur - shieldShimmerT) / fade), 0, 1);

  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.globalAlpha = alpha;
  ctx.drawImage(img, -size / 2, -size / 2, size, size);
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

  return needHp;
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
// ✅ EXPLOSION FX (sprites) — mort NPC = HIT_NPC (FLV 300x300 12fps)
// ============================================================
const EXPLOSION_PACK = {
  path: "COMBAT/EXPLOSIONS/HIT_NPC/",
  frames: 40,
  firstNumber: 1,
  ext: ".png",
  fps: 40,
  w: 300,
  h: 300,
};

// ✅ impacts laser : aucun sprite, aucun rond jaune (rien affiché).
// ✅ impacts roquette : mini explosion HIT_NPC (voir spawnExplosion aux hits).

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
  // Ralenti subi (explosion Kamikaze) : secondes restantes + %.
  rocketSlowT: 0,
  rocketSlowPct: 0,

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

  const stats = computeHangarStats(hangar, u, { mapId: currentMapId() });

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

  player.hpMax = Math.max(1, Math.floor((shipBaseHP + (stats.bonusFlatHP || 0)) * (1 + (stats.bonusHPPct || 0) / 100) * playerBoosterMults().hp));
  player.hp = Math.max(1, Math.floor(player.hpMax * oldHpPct));
  refreshBuoyHpBase();

  player.shMax = Math.max(0, Math.floor((Number(stats.bonusShield) || 0) * playerBoosterMults().shield * playerUpgradeMults().shield));
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
  player.baseSpeed = Math.max(10, Math.floor((shipBaseSpeed + (stats.bonusSpeed || 0)) * playerUpgradeMults().speed * (stats.speedMult || 1)));

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

  return String(Math.min(n, 999999));
}

function formatRocketCount(value) {
  const n = Math.max(0, Math.floor(Number(value) || 0));

  return String(Math.min(n, 999999));
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
    if (count) count.textContent = formatRocketCount(rocketCount(id));
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
    el.textContent = formatRocketCount(rocketCount(player.launcherActive));
  }
  // Fond du bouton USE (palette + slots) : suit la sélection.
  const launcherBgIcon = rocketDockIcon(String(player.launcherActive || "eco10").toLowerCase()) || rocketDockIcon("eco10") || "";
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
  const fresh = { bar, ammo: [], formations: [], skills: [], rockets: [], abilities: [] };
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
  for (const button of bar.querySelectorAll("[data-action-id^='ability:']")) {
    fresh.abilities.push({ button, abilityId: String(button.dataset.actionId || "").slice("ability:".length) });
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

  // Aptitudes : voile de recharge sur chaque slot d'aptitude (slots + palette),
  // comme les roquettes (pas de flash). Branchées une par une via getAbilityCooldown.
  for (const { button, abilityId } of actionDockCache.abilities) {
    const cd = getAbilityCooldown(abilityId);
    const cooling = Number(cd.left || 0) > 0 && Number(cd.max || 0) > 0;
    const progress = cooling ? clamp(Number(cd.left) / Number(cd.max), 0, 1) : 0;
    applyDockField(button, "cdVeil", cooling,
      (v) => button.classList.toggle("cdVeil", v));
    applyDockField(button, "cdProgress", progress.toFixed(3),
      (v) => button.style.setProperty("--cd", v));
    if (cooling) {
      applyDockField(button, "cdEdge", getComputedStyle(button).borderColor,
        (v) => button.style.setProperty("--cd-edge", v));
    }
    // Compteur en secondes : temps d'effet restant pendant l'effet, recharge sinon.
    let cdText = "";
    if (cooling) {
      const fxLeft = isCloakAbility(abilityId) ? Number(player.cloakT || 0) : 0;
      cdText = formatAbilityCd(fxLeft > 0 ? fxLeft : cd.left);
    }
    applyDockField(button, "cdText", cdText,
      (v) => { const small = button.querySelector(".abilityCd"); if (small) small.textContent = v; });
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
      // On affiche le temps restant pendant la recharge, "PRET" une fois dispo.
      applyDockField(button, "main", cooling ? `${pulseCd.toFixed(1)}s` : "PRET",
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
      // Temps restant pendant la recharge, "PRET" une fois dispo.
      applyDockField(button, "main", ishCooling ? `${ishCd.toFixed(1)}s` : "PRET",
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

// Formations à drain (Papillon : -5 %/s...) : le bouclier drainé est le prix
// de la formation. Le robot ne le remonte pas et ne le réclame pas
// (ni son, ni HUD, ni floats) — seule la coque est réparée.
function formationDrainsShield() {
  return Number(getActiveDroneFormation(account.user)?.effects?.shieldDrainPct || 0) > 0;
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
    // Robot = coque uniquement : le bouclier ne le déclenche jamais.
    if (player.hp < player.hpMax - 0.01) {
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
  const repairMult = playerBoosterMults().repair;
  // Robot = coque uniquement. Le bouclier se recharge par tick passif
  // (tickShield) : plus de réparation instantanée nulle part.
  player.hp = Math.min(player.hpMax, player.hp + player.hpMax * REPAIR.ratePct * repairMult * REPAIR.tickInterval * tickCount);

  if (player.hp >= player.hpMax - 0.01) {
    stopRepairSound({ fadeOut: 0 });
  }

  const hpGain = Math.round(player.hp - oldHp);
  if (hpGain > 0) {
    addPlayerCombatFloat(hpGain, "rgba(80,255,125,0.98)", "+");
  }
}

function updateRepairUI() {
  const pct = REPAIR.cooldown <= 0 ? 1 : clamp(player.repairT / REPAIR.cooldown, 0, 1);
  const needs = !player.dead && player.hp < player.hpMax - 0.01;

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

function isTradeModule(module) {
  return module?.oreTrade === true;
}

// Bouclier : recharge passive par tick d'1 s (base + regen de formation),
// drain de formation par tick aussi — aucun regen continu nulle part.
let shieldTickT = 0;
function tickShield(dt) {
  if (player.dead || !(player.shMax > 0)) { shieldTickT = 0; return; }
  shieldTickT += Math.max(0, Number(dt) || 0);
  if (shieldTickT < 1.0) return;
  shieldTickT -= 1.0;
  const effects = getActiveDroneFormation(account.user).effects || {};
  const oldSh = player.sh;
  if (!formationDrainsShield()) {
    // Même débit qu'avant (5 %/s + bonus) : seul le rythme change.
    const sregMult = playerBoosterMults().sreg;
    const repairMult = playerBoosterMults().repair;
    const regenPct = Number(effects.shieldRegenPct || 0);
    const perSecond = regenPct > 0
      ? Math.min(Number(effects.shieldRegenCap || Infinity), player.shMax * regenPct / 100)
      : 0;
    player.sh = Math.min(player.shMax,
      player.sh + player.shMax * REPAIR.ratePct * repairMult * sregMult + perSecond);
  }
  const drainPct = Number(effects.shieldDrainPct || 0);
  if (drainPct > 0) player.sh = Math.max(0, player.sh - player.shMax * drainPct / 100);
  const shGain = Math.round(player.sh - oldSh);
  if (shGain > 0) addPlayerCombatFloat(shGain, "rgba(70,180,255,0.98)", "+");
}

function tickDroneFormationEffects(dt) {
  tickShield(dt);
}

function getQuestButtonPosition(module) {
  // Base avec comptoir : les deux boutons côte à côte, centrés (quêtes à gauche).
  const shift = isTradeModule(module) ? QUEST_BUTTON.w / 2 + QUEST_BUTTON.gap / 2 : 0;
  return {
    x: module.x - shift,
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
  if (!module) return false;
  const pos = getQuestButtonPosition(module);
  const radius = Number(QUEST_BUTTON.proximityRadius || 450);
  return dist2(player.x, player.y, pos.x, pos.y) <= radius * radius;
}

function getTradeButtonPosition(module) {
  if (Number.isFinite(Number(module?.tradeButtonX)) && Number.isFinite(Number(module?.tradeButtonY))) {
    return { x: Number(module.tradeButtonX), y: Number(module.tradeButtonY) };
  }
  // Base avec terminal de quêtes : bouton commerce à côté (à droite), paire centrée.
  if (isQuestModule(module)) {
    return {
      x: module.x + TRADE_BUTTON.w / 2 + TRADE_BUTTON.gap / 2,
      y: module.y - Number(module.h || 0) / 2 - TRADE_BUTTON.h / 2 - TRADE_BUTTON.gap,
    };
  }
  return {
    x: module.x,
    y: module.y - Number(module.h || 0) / 2 - TRADE_BUTTON.h / 2 - TRADE_BUTTON.gap,
  };
}

function pickTradeButtonAtScreen(clientX, clientY) {
  if (!isZoneMap || !zoneSafe?.modules?.length) return null;
  const mouseWorld = screenToWorld(clientX, clientY);

  for (let i = zoneSafe.modules.length - 1; i >= 0; i--) {
    const module = zoneSafe.modules[i];
    if (!isTradeModule(module)) continue;
    const pos = getTradeButtonPosition(module);

    if (
      mouseWorld.x >= pos.x - TRADE_BUTTON.w / 2 &&
      mouseWorld.x <= pos.x + TRADE_BUTTON.w / 2 &&
      mouseWorld.y >= pos.y - TRADE_BUTTON.h / 2 &&
      mouseWorld.y <= pos.y + TRADE_BUTTON.h / 2
    ) return module;
  }

  return null;
}

function updateTradeButtonCursor(clientX, clientY) {
  const hoveredModule = pickTradeButtonAtScreen(clientX, clientY);
  for (const module of zoneSafe?.modules || []) {
    if (isTradeModule(module)) module.tradeButtonHovered = module === hoveredModule;
  }
  if (hoveredModule) canvas.style.cursor = "pointer";
  return Boolean(hoveredModule);
}

function isPlayerNearTradeModule(module) {
  if (!module) return false;
  const pos = getTradeButtonPosition(module);
  const radius = Number(TRADE_BUTTON.proximityRadius || 250);
  return dist2(player.x, player.y, pos.x, pos.y) <= radius * radius;
}

// Module commerce actif (fenêtre ouverte dessus). Fermeture si on s'éloigne.
let activeTradeModule = null;

function isTradeWindowAnchored() {
  // Cargo Trader (G-TRA) : vente hors base pendant la session.
  if (traWindowActive()) return true;
  if (!activeTradeModule) return false;
  if (!(zoneSafe?.modules || []).includes(activeTradeModule)) return false;
  return isPlayerNearTradeModule(activeTradeModule);
}

canvas.addEventListener(
  "mousemove",
  (e) => {
    const overPortalButton = updatePortalButtonCursor(
      e.clientX,
      e.clientY
    );

    const overQuestButton = updateQuestButtonCursor(e.clientX, e.clientY);

    const overTradeButton = updateTradeButtonCursor(e.clientX, e.clientY);

    if (!overPortalButton && !overQuestButton && !overTradeButton) {
      updateCollectableCursor(e.clientX, e.clientY);
    }
  },
  { passive: true }
);

// Double-clic maison géré dans le pointerup (fiable sur cibles mobiles).
// Le dblclick natif est désactivé pour éviter les doubles attaques.
let lastClickAtMs = 0;
let lastClickEnemyId = null;

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
  try { botNotifyManual(); } catch {}

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

const tradeButton = pickTradeButtonAtScreen(e.clientX, e.clientY);

if (tradeButton) {
  tradeButton.tradeButtonPressed = true;
  tradeButton.tradeButtonHovered = true;
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
  try { botNotifyManual(); } catch {}

  pointer.downOnEnemy = true;
  pointer.dragArmed = false;
  pointer.dragging = false;
  pointer.followWhileDown = false;

  return;
}

const collectable = pickCollectableAtScreen(e.clientX, e.clientY);
if (collectable) {

  selectCollectable(collectable);
  try { botNotifyManual(); } catch {}

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
    const releasedOnTrade = pickTradeButtonAtScreen(e.clientX, e.clientY);

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

    let pressedTrade = null;
    for (const module of zoneSafe?.modules || []) {
      if (module.tradeButtonPressed) pressedTrade = module;
      module.tradeButtonPressed = false;
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

    if (pressedTrade && releasedOnTrade === pressedTrade) {
      if (!isPlayerNearTradeModule(pressedTrade)) {
        showToast("Approche-toi du comptoir pirate", 1.4);
      } else {
        openOreTradeWindow(pressedTrade);
      }
    }

    // Double-clic maison (fiable sur cibles mobiles) : 2 relâchés sur le même
    // ennemi à moins de 500 ms -> verrouille + attaque. Pas de re-visée.
    if (e.button === 0 && !e.shiftKey) {
      const nowMs = performance.now();
      const releasedEnemy = pickEnemyAtScreen(e.clientX, e.clientY);
      if (releasedEnemy && releasedEnemy.hp > 0 && lastClickEnemyId === releasedEnemy.id && nowMs - lastClickAtMs < 500) {
        lastClickAtMs = 0;
        lastClickEnemyId = null;
        Target.set(releasedEnemy);
        stopAttack();
        startAttack();
      } else if (releasedEnemy && releasedEnemy.hp > 0) {
        lastClickAtMs = nowMs;
        lastClickEnemyId = releasedEnemy.id;
      } else {
        lastClickAtMs = 0;
        lastClickEnemyId = null;
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
      module.tradeButtonPressed = false;
      module.tradeButtonHovered = false;
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

// ============================================================
// Univers persistant (SIM pure, serveur-ready) : horloge qui ne
// s'arrete jamais + slots stables par camp. Le client ne decide
// plus de regen : il lit l'univers et marque mort/vivant.
// ============================================================
function createBrowserStorage() {
  try {
    if (typeof localStorage === "undefined") return null;
    return {
      getItem: (k) => localStorage.getItem(k),
      setItem: (k, v) => localStorage.setItem(k, v),
    };
  } catch {
    return null;
  }
}
const universeStorage = createBrowserStorage();
const worldClock = createWorldClock({ storage: universeStorage });
let universe = createUniverse();
try {
  universe = deserializeUniverse(universeStorage?.getItem?.(UNIVERSE_KEY));
} catch {
  universe = createUniverse();
}
// Rattrapage au boot : un refresh de 30s fait avancer le monde de 30s
// (respawns dus pendant l'absence), jamais de re-roll.
// Seules les maps zone vivent en fond : les instances GG (alpha/beta/gamma,
// mode "gate") ne sont pas stockees dans l'univers. La map active est
// ignoree : c'est sa vraie IA qui tourne.
try {
  tickBackground(universe, worldClock.now(), { skipMapId: String(window.__CURRENT_MAP_ID__ || "") });
} catch {}
// Tick de fond continu : toutes les 5s les maps sans joueur avancent
// (respawns dus + derive bornee). Throttle dans persistUniverse.
try {
  if (typeof window !== "undefined" && !window.__UNIVERSE_BG_TICK__) {
    window.__UNIVERSE_BG_TICK__ = true;
    setInterval(() => {
      try {
        tickBackground(universe, worldClock.now(), { skipMapId: String(window.__CURRENT_MAP_ID__ || "") });
        persistUniverse();
        persistCollectables();
      } catch {}
    }, 5000);
  }
} catch {}
let universeSaveT = 0;
function persistUniverse({ force = false } = {}) {
  worldClock.markTick({ force });
  if (!universeStorage?.setItem && !force) return;
  const nowMs = worldClock.now();
  if (!force && nowMs - universeSaveT < 5000) return;
  universeSaveT = nowMs;
  try {
    universeStorage?.setItem?.(UNIVERSE_KEY, serializeUniverse(universe));
  } catch {}
}
// Monde continu collectables : même rythme que l'univers (5 s, force au quit).
let collectableStore = createCollectableStore();
try {
  collectableStore = deserializeCollectableStore(universeStorage?.getItem?.(COLLECTABLE_STORE_KEY));
} catch {
  collectableStore = createCollectableStore();
}
let collectableSaveT = 0;
function persistCollectables({ force = false } = {}) {
  if (!universeStorage?.setItem && !force) return;
  const nowMs = worldClock.now();
  if (!force && nowMs - collectableSaveT < 5000) return;
  collectableSaveT = nowMs;
  try {
    universeStorage?.setItem?.(COLLECTABLE_STORE_KEY, serializeCollectableStore(collectableStore));
  } catch {}
}
function snapshotActiveEnemiesToUniverse(mapId) {
  if (!isZoneMap) return;
  const nowMs = worldClock.now();
  for (const e of enemies) {
    if (!e || e.hp <= 0 || !e.universeUid) continue;
    const hpPct = e.hpMax > 0 ? e.hp / e.hpMax : 1;
    const shPct = e.shMax > 0 ? e.sh / e.shMax : (e.sh > 0 ? 1 : 0);
    try {
      snapshotUniverseEnemy(universe, mapId, e.universeUid, { x: e.x, y: e.y, hpPct, shPct }, nowMs);
    } catch {}
  }
}
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
const petState = { x: 0, y: 0, angle: 0, fireCd: 0, pickCd: 0, fetchId: null, fetchHold: 0, target: null, ready: false, returning: false, weaveT: 0, followT: 0, wpX: 0, wpY: 0, hasWp: false, attackers: new Map() };

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
// Bouée (G-BC / G-BH) : le REX nous colle fortement en passif.
const PET_BUOY_REST_RADIUS = 120;
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

// Dégâts du joueur sur son propre REX (bouclier puis coque, comme un NPC).
function damagePetFromPlayer(dmg) {
  const pet = account.user?.pet;
  const out = { total: 0, sh: 0, hp: 0 };
  const amount = Math.max(0, Number(dmg) || 0);
  if (!pet || !(Number(pet.hp) > 0) || !(amount > 0)) return out;
  let remaining = amount;
  const shMax = petShieldMaxForHud(pet, account.user);
  if (shMax > 0) {
    const cur = pet.sh != null && Number.isFinite(Number(pet.sh)) ? Number(pet.sh) : shMax;
    const absorbed = Math.min(cur, remaining);
    if (absorbed > 0) {
      pet.sh = cur - absorbed;
      remaining -= absorbed;
      out.sh = absorbed;
    }
  }
  if (remaining > 0) {
    const hpBefore = Number(pet.hp);
    pet.hp = Math.max(0, hpBefore - remaining);
    out.hp = Math.min(remaining, hpBefore);
  }
  out.total = out.sh + out.hp;
  markProgressDirty();
  if (pet.hp <= 0) {
    // Destruction par nos tirs : explosion + son comme un NPC.
    spawnExplosion(petState.x, petState.y, 1.0);
    SFX.play("npcDeath", { maxVoices: 16, cooldown: 0 });
    onPetDestroyed();
    showToast("REX détruit.", 1.8);
    if (petLink.until > 0) endHplLink("destroyed");
  }
  return out;
}

// Autorise l'assistance sur cette cible seulement après un dégât confirmé du
// joueur. Un MISS, un lock ou le simple démarrage du tir ne passe pas ici.
function notePetPlayerDamage(enemy) {
  if (!enemy || enemy.id == null) return;
  // Le REX ne riposte jamais contre nous.
  if (enemy.isPetTarget) return;
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
  let damagePct = 0;
  let alienPct = 0;
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
    const k = String(item?.petProtocol?.key || "").toLowerCase();
    const pct = Number(item?.petProtocol?.pct || 0);
    if (!pct) continue;
    // Laser (AI-LM) : dégâts globaux du REX (joueurs + NPC).
    if (k === "damage") damagePct += pct;
    // Alien (AI-AL) : dégâts vs NPC uniquement (pas vs joueurs).
    else if (k === "alien") alienPct += pct;
  }
  // Aperçu boutique (target null) : dégâts globaux seuls, sans le bonus Alien.
  const isAlienTarget = !!target && target.isPetTarget !== true && target.isPlayer !== true;
  const protoPct = damagePct + (isAlienTarget ? alienPct : 0);
  return { total: base * mult * (1 + protoPct / 100) * (1 + goliathHeatPct() / 100), count: lasers.length };
}
// Précision du REX : 15 % de MISS de base moins le protocole ciblage (AI-AIM).
function petMissChance(pet, user) {
  const aim = getPetProtocolPct(pet, user, "aim");
  return Math.max(0, Math.min(1, PLAYER_SHOTS.missChance - aim / 100));
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
      miss: Math.random() < petMissChance(account.user?.pet, account.user),
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

// ============================================================
// Gears passifs du P.E.T (G-AL / G-AR / G-EL / G-REP).
// Définitions : PET/PET_GEARS.js. Les récompenses de collecte
// passent par applyCollectableReward, comme une collecte joueur.
// ============================================================
const petLocator = { enemyId: null, manualType: null, needsPick: true };

function petFit() {
  const user = account.user;
  const hangar = (user?.hangars || []).find((h) => h?.active) || null;
  const hid = hangar ? String(hangar.id) : null;
  const cfg = String(Number(hangar?.activeConfig) === 2 ? 2 : 1);
  return hid ? getPetFit(user?.pet, hid, cfg) : null;
}

function petGearLevels() {
  return getPetEquippedGearLevels(petFit(), findCatalogItem);
}

// Options du sélecteur (noms boutique, ex : "G-AL3 · Auto-Loot").
function petEquippedGearOptions() {
  return listEquippedGearOptions(petFit(), findCatalogItem);
}

// Gear actif unique (sélecteur fenêtre P.E.T) : null si aucun ou déséquipé.
function petActiveGearKey() {
  const want = String(account.user?.pet?.activeGear || "").toLowerCase();
  if (!want) return null;
  const levels = petGearLevels();
  return Number(levels[want]) > 0 ? want : null;
}

// Cooldowns des gears persistés en temps réel (timestamps Date.now :
// survivent au refresh, contrairement aux sessions qui s'arrêtent).
function getPetGearCdUntil(key) {
  return Math.max(0, Number(account.user?.pet?.gearCds?.[key]) || 0);
}

function setPetGearCd(key, seconds) {
  const pet = account.user?.pet;
  if (!pet) return;
  pet.gearCds = pet.gearCds && typeof pet.gearCds === "object" ? pet.gearCds : {};
  pet.gearCds[key] = Date.now() + Math.max(0, Number(seconds) || 0) * 1000;
  saveProgressNow();
}

function petGearCdLeftSec(key) {
  return Math.max(0, (getPetGearCdUntil(key) - Date.now()) / 1000);
}

// Cargo Trader (G-TRA) : fenêtre commerce hors base pendant 10 s, puis cooldown.
// Fermée avant la fin (ou à l'expiration) : impossible de rouvrir avant le cooldown.
// À la fin, retour au comportement d'avant (mode + gear), pas Passif forcé.
const petTrader = { until: 0, level: 0, prevMode: null, prevGear: null };

function traWindowActive() {
  return petTrader.until > 0 && performance.now() / 1000 < petTrader.until;
}

function traCooldownLeftSec() {
  return petGearCdLeftSec("tra");
}

// Lien HP (G-HPL, niveau unique) : 20 s, cooldown 240 s. Mixé au mode combat
// (le REX se bat) + éclair entre lui et nous. Tous les dégâts coque, quelle
// que soit la source, sont redirigés vers le REX. Coupures : fin des 20 s,
// REX détruit, autre matériel, changement de config, IEM.
const petLink = { until: 0, configKey: null, prevMode: null, prevGear: null };

function hplLinkActive() {
  return petLink.until > 0
    && performance.now() / 1000 < petLink.until
    && account.user?.pet?.active === true
    && Number(account.user.pet.hp) > 0;
}

function hplCooldownLeftSec() {
  return petGearCdLeftSec("hpl");
}

function petConfigKey() {
  const user = account.user;
  const hangar = (user?.hangars || []).find((h) => h?.active) || null;
  if (!hangar) return null;
  return `${String(hangar.id)}:${String(Number(hangar.activeConfig) === 2 ? 2 : 1)}`;
}

function startHplLink() {
  const lvl = Math.floor(Number(petGearLevels().hpl) || 0);
  if (!(lvl > 0)) {
    loadAccountUser();
    return showToast("Gear déséquipé.", 1.5);
  }
  const pet = account.user?.pet;
  if (!(Number(pet?.hp) > 0)) {
    loadAccountUser();
    return showToast("Lien HP : REX détruit, répare-le.", 1.8);
  }
  petLink.prevMode = normalizePetMode(pet?.mode);
  const prevGear = String(pet?.activeGear || "").toLowerCase() || null;
  petLink.prevGear = prevGear && prevGear !== "hpl" ? prevGear : null;
  petLink.configKey = petConfigKey();
  petLink.until = performance.now() / 1000 + PET_GEAR_HPLINK_DURATION_SEC;
  setPetMode("combat");
  setPetActiveGear("hpl");
  loadAccountUser();
  showToast("Lien HP : dégâts coque redirigés 20 s", 2);
}

function endHplLink(reason) {
  if (petLink.until <= 0) return;
  petLink.until = 0;
  petLink.configKey = null;
  setPetGearCd("hpl", PET_GEAR_HPLINK_COOLDOWN_SEC);
  if (String(account.user?.pet?.activeGear || "").toLowerCase() === "hpl") {
    setPetActiveGear(null);
    // Retour au comportement d'avant (si toujours équipé).
    if (petLink.prevMode) setPetMode(petLink.prevMode);
    const pg = petLink.prevGear;
    if (pg && pg !== "hpl" && Number(petGearLevels()[pg]) > 0) {
      setPetActiveGear(pg);
      if (pg === "el") {
        petLocator.manualType = null;
        petLocator.enemyId = null;
        petLocator.needsPick = true;
      }
    }
  }
  petLink.prevMode = null;
  petLink.prevGear = null;
  loadAccountUser();
  const messages = {
    expired: "Lien HP terminé — cooldown 240 s",
    destroyed: "Lien rompu : REX détruit — cooldown 240 s",
    gear: "Lien rompu : autre matériel — cooldown 240 s",
    config: "Lien rompu : configuration changée — cooldown 240 s",
    emp: "Lien rompu : IEM — cooldown 240 s",
    off: "Lien rompu : REX désactivé — cooldown 240 s",
  };
  showToast(messages[reason] || messages.expired, 2);
}

// Portail / play : le REX respawn à côté de nous au lieu de traverser la carte.
let petMapId = null;
let wasPetOn = false;
// Refresh : une seule fois au boot, le REX reprend sa position persistée
// (même map) au lieu de respawn à côté de nous.
let petBootRestoreArmed = true;

function resetPetSpawn() {
  cancelKamikazeRun();
  petState.ready = false;
  petState.target = null;
  petState.fetchId = null;
  petState.fetchHold = 0;
  petLocator.enemyId = null;
  petLocator.manualType = null;
}

// Refresh : replace le REX où il était (même map uniquement). Retourne faux
// si aucune position persistée (spawn normal à côté de nous).
function restorePetSavedPosition(pet, mapId) {
  const sx = Number(pet?.x), sy = Number(pet?.y);
  if (!Number.isFinite(sx) || !Number.isFinite(sy)) return false;
  if (String(pet?.map || "") !== String(mapId || "")) return false;
  cancelKamikazeRun();
  petState.x = clamp(sx, 80, WORLD.w - 80);
  petState.y = clamp(sy, 80, WORLD.h - 80);
  petState.fireCd = 0;
  petState.pickCd = 0;
  petState.fetchId = null;
  petState.fetchHold = 0;
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
  petLocator.enemyId = null;
  petLocator.manualType = null;
  return true;
}

// Persistance de la position du REX (toutes les 5 s) : un refresh le
// retrouve où il était, même en pleine collecte au loin.
function savePetPosition(pet, mapId, dt) {
  if (!pet || pet.owned !== true) return;
  petState.posSaveT = (petState.posSaveT || 0) + Math.max(0, Number(dt) || 0);
  if (petState.posSaveT < 5) return;
  petState.posSaveT = 0;
  pet.x = Math.round(petState.x);
  pet.y = Math.round(petState.y);
  pet.map = String(mapId || "");
  markProgressDirty();
}

// Mort du REX : annule collecte, locator et lien visuel, purge fumée et réacteur.
function onPetDestroyed() {
  cancelKamikazeRun();
  petState.fetchId = null;
  petState.fetchHold = 0;
  petState.repTickT = 0;
  petState.shTickT = 0;
  petState.target = null;
  petState.combatTarget = null;
  petState.assistTarget = null;
  petLocator.enemyId = null;
  petLocator.manualType = null;
  // Flamme du réacteur éteinte + traînées existantes supprimées.
  try { petEngine.states.delete(petState); } catch {}
  for (let i = engineTrails.length - 1; i >= 0; i--) {
    if (engineTrails[i]?.ownerPet) engineTrails.splice(i, 1);
  }
}

// Part coque redirigée vers le REX (toutes sources). Retourne le reste au joueur.
function absorbPetLinkDamage(hpAmount) {
  if (!(hpAmount > 0) || !hplLinkActive()) return hpAmount;
  const pet = account.user?.pet;
  if (!pet || !(Number(pet.hp) > 0)) return hpAmount;
  const taken = Math.min(Number(pet.hp), hpAmount);
  pet.hp = Number(pet.hp) - taken;
  markProgressDirty();
  if (taken >= 1) {
    addFloatText(
      petState.x + (Math.random() - 0.5) * 60,
      petState.y - 90 - Math.random() * 20,
      Math.round(taken),
      "rgba(255,80,100,0.95)",
      { size: 21, pop: 0.3, shake: 0.6, life: 1, glow: 1, weight: 900, impact: true },
    );
  }
  if (pet.hp <= 0) {
    pet.hp = 0;
    onPetDestroyed();
    endHplLink("destroyed");
  }
  return hpAmount - taken;
}

// Bouées (G-BC combat / G-BH coque, niveau unique) : 120 s, cooldown 240 s.
// Le REX colle le joueur en passif, halo continu de 500 : +5 % dégâts (rouge)
// ou +5 % PV max (vert) quand on est dedans.
const petBuoy = { key: null, until: 0, prevMode: null, prevGear: null, configKey: null };

function buoySessionActive() {
  return (petBuoy.key === "bc" || petBuoy.key === "bh") && petBuoy.until > 0
    && performance.now() / 1000 < petBuoy.until;
}

function buoyCooldownLeftSec(key) {
  return petGearCdLeftSec(key);
}

function buoyPlayerInside() {
  if (!buoySessionActive() || !petState.ready || player.dead || !started) return false;
  return Math.hypot(player.x - petState.x, player.y - petState.y) <= PET_BUOY_RADIUS;
}

// × dégâts du joueur dans le halo rouge.
function buoyDamageMult() {
  return petBuoy.key === "bc" && buoyPlayerInside() ? 1 + PET_BUOY_DAMAGE_PCT / 100 : 1;
}

function startBuoySession(key) {
  if (!(Number(petGearLevels()[key]) > 0)) {
    loadAccountUser();
    return showToast("Gear déséquipé.", 1.5);
  }
  const pet = account.user?.pet;
  if (!(Number(pet?.hp) > 0)) {
    loadAccountUser();
    return showToast("Bouée : REX détruit, répare-le.", 1.8);
  }
  petBuoy.prevMode = normalizePetMode(pet?.mode);
  const prevGear = String(pet?.activeGear || "").toLowerCase() || null;
  petBuoy.prevGear = prevGear && prevGear !== key ? prevGear : null;
  petBuoy.key = key;
  petBuoy.until = performance.now() / 1000 + PET_BUOY_DURATION_SEC;
  petBuoy.configKey = petConfigKey();
  setPetMode("passive");
  setPetActiveGear(key);
  loadAccountUser();
  showToast(key === "bc"
    ? "Bouée combat : +5 % dégâts dans le halo 120 s"
    : "Bouée coque : +5 % PV max dans le halo 120 s", 2);
}

function endBuoySession(reason) {
  if (!(petBuoy.key === "bc" || petBuoy.key === "bh") || petBuoy.until <= 0) return;
  const key = petBuoy.key;
  petBuoy.key = null;
  petBuoy.until = 0;
  setPetGearCd(key, PET_BUOY_COOLDOWN_SEC);
  if (String(account.user?.pet?.activeGear || "").toLowerCase() === key) {
    setPetActiveGear(null);
    // Retour au comportement d'avant (si toujours équipé).
    if (petBuoy.prevMode) setPetMode(petBuoy.prevMode);
    const pg = petBuoy.prevGear;
    if (pg && pg !== key && Number(petGearLevels()[pg]) > 0) {
      setPetActiveGear(pg);
      if (pg === "el") {
        petLocator.manualType = null;
        petLocator.enemyId = null;
        petLocator.needsPick = true;
      }
    }
  }
  petBuoy.prevMode = null;
  petBuoy.prevGear = null;
  loadAccountUser();
  const messages = {
    expired: "Bouée terminée — cooldown 240 s",
    gear: "Bouée coupée : autre matériel — cooldown 240 s",
    off: "Bouée coupée : REX désactivé — cooldown 240 s",
    destroyed: "Bouée coupée : REX détruit — cooldown 240 s",
    config: "Bouée coupée : config sans bouée — cooldown 240 s",
  };
  showToast(messages[reason] || messages.expired, 2);
}

// Aura coque : +5 % PV max dans le halo vert (retirés en sortant).
function tickBuoyHpAura() {
  const inside = petBuoy.key === "bh" && buoyPlayerInside();
  if (inside && !player.buoyHpBuff) {
    player.buoyHpBuff = true;
    player.hpMaxBase = player.hpMax;
    player.hpMax = Math.max(1, Math.round(player.hpMax * (1 + PET_BUOY_HP_PCT / 100)));
    player.hp = Math.min(player.hpMax, Math.round(player.hp * (1 + PET_BUOY_HP_PCT / 100)));
    markProgressDirty();
  } else if (!inside && player.buoyHpBuff) {
    player.buoyHpBuff = false;
    if (Number(player.hpMaxBase) > 0) player.hpMax = Math.max(1, Math.floor(Number(player.hpMaxBase)));
    player.hp = Math.min(player.hp, player.hpMax);
    markProgressDirty();
  }
}

// Recalcul de vie (hangar/vaisseau) pendant le buff : rebase sans le perdre.
function refreshBuoyHpBase() {
  if (!player.buoyHpBuff) return;
  player.hpMaxBase = player.hpMax;
  player.hpMax = Math.max(1, Math.round(player.hpMax * (1 + PET_BUOY_HP_PCT / 100)));
  player.hp = Math.min(player.hp, player.hpMax);
}

// Flamme sacrificielle (G-FS, niveau unique) : transfert instantané vers le vaisseau.
// REX à zéro → rien + retour passif (sans cooldown). Sinon : min(bouclier REX,
// manque du vaisseau) — tout si besoin — puis passif + cooldown 90 s.
function fsCooldownLeftSec() {
  return petGearCdLeftSec("fs");
}

function kkCooldownLeftSec() {
  return petGearCdLeftSec("kk");
}

// Kamikaze (G-KK) : course suicide verrouillée.
// Au déclenchement : cible = NPC verrouillé, sinon dernier attaquant récent.
// Choix figé — les dégâts reçus ensuite ne changent plus la cible.
// Le REX fonce tout droit ; au contact il se colle 1 s puis explose
// (dégâts + rayon par niveau : 25000/250, 50000/350, 75000/450).
// Explosion normale (pas de sprite géant) et le REX meurt avec.
// Seule sa destruction prématurée interrompt la course (sans explosion
// ni cooldown). Le cooldown part à l'explosion.
const petKamikaze = { active: false, level: 0, targetId: null, targetRef: null, lastX: 0, lastY: 0, stickT: 0, age: 0 };
const PET_KK_CONTACT_DIST = 70;
const PET_KK_STICK_SEC = 1.0;
const PET_KK_TIMEOUT_SEC = 25;

function kkRunActive() {
  return petKamikaze.active === true;
}

// Annule la course (sans explosion ni cooldown). Retourne true si annulée.
function cancelKamikazeRun(reason) {
  if (!petKamikaze.active) return false;
  petKamikaze.active = false;
  petKamikaze.targetRef = null;
  petKamikaze.targetId = null;
  petKamikaze.stickT = 0;
  petKamikaze.age = 0;
  if (String(account.user?.pet?.activeGear || "").toLowerCase() === "kk") {
    try { setPetActiveGear(null); } catch {}
  }
  try { loadAccountUser(); } catch {}
  if (reason === "destroyed") showToast("Kamikaze interrompu : REX détruit.", 1.8);
  return true;
}

// Cible au déclenchement : lock vivant, sinon dernier attaquant récent.
function pickKamikazeTarget() {
  let locked = null;
  try { locked = Target.get(); } catch { locked = null; }
  if (locked && Number(locked.hp) > 0 && enemies.includes(locked)) return locked;
  const nowS = performance.now() / 1000;
  let best = null;
  let bestT = -Infinity;
  for (const record of petState.attackers.values()) {
    const ref = record?.ref;
    if (!ref || Number(ref.hp) <= 0 || !enemies.includes(ref)) continue;
    if (!record?.pending) continue;
    if (nowS - (Number(record.t) || -Infinity) > PET_ATTACKER_MEMORY) continue;
    if (Number(record.t) > bestT) {
      bestT = Number(record.t);
      best = ref;
    }
  }
  return best;
}

function triggerPetKamikaze() {
  if (petKamikaze.active) {
    loadAccountUser();
    return showToast("Kamikaze déjà en cours.", 1.2);
  }
  const lvl = Math.floor(Number(petGearLevels().kk) || 0);
  if (!(lvl > 0)) {
    loadAccountUser();
    return showToast("Gear déséquipé.", 1.5);
  }
  const left = kkCooldownLeftSec();
  if (left > 0) {
    loadAccountUser();
    return showToast(`Kamikaze prêt dans ${Math.ceil(left)} s`, 1.8);
  }
  const pet = account.user?.pet;
  if (pet?.owned !== true || pet?.active !== true) {
    loadAccountUser();
    return showToast("Kamikaze : REX désactivé.", 1.8);
  }
  if (!(Number(pet.hp) > 0)) {
    loadAccountUser();
    return showToast("Kamikaze : REX détruit, répare-le.", 1.8);
  }
  // One-shot : 3 de carburant d'un coup (réduit par AI-ECO). Prélevé ici :
  // la course détruit le REX, aucun gear ne reste actif derrière.
  const kkFuel = consumePetOneshotFuel(pet, account.user);
  if (!kkFuel.ok) {
    loadAccountUser();
    return showToast(`Kamikaze : carburant insuffisant (${kkFuel.cost} requis).`, 1.8);
  }
  if (player.dead || !started) {
    loadAccountUser();
    return showToast("Kamikaze impossible pour le moment.", 1.5);
  }
  const target = pickKamikazeTarget();
  if (!target) {
    loadAccountUser();
    return showToast("Kamikaze : verrouille une cible.", 1.8);
  }
  // Le kamikaze prend la main : ferme les sessions en cours.
  if (traWindowActive()) endTraSession();
  if (hplLinkActive()) endHplLink("gear");
  if (buoySessionActive()) endBuoySession("gear");
  petKamikaze.active = true;
  petKamikaze.level = lvl;
  petKamikaze.targetRef = target;
  petKamikaze.targetId = target.id;
  petKamikaze.lastX = Number(target.x);
  petKamikaze.lastY = Number(target.y);
  petKamikaze.stickT = 0;
  petKamikaze.age = 0;
  petState.fetchId = null;
  petState.fetchHold = 0;
  petState.returning = false;
  petState.target = null;
  petState.combatTarget = null;
  setPetMode("passive");
  setPetActiveGear("kk");
  loadAccountUser();
  showToast("Kamikaze enclenché !", 1.5);
}

// Fait voler le REX vers sa cible verrouillée. Retourne true si la course
// a pris la main (updatePet saute alors le comportement normal).
function tickPetKamikaze(dt) {
  if (!petKamikaze.active) return false;
  const pet = account.user?.pet;
  if (!pet || pet.owned !== true || pet.active !== true || !(Number(pet.hp) > 0)) {
    cancelKamikazeRun();
    return true;
  }
  petKamikaze.age += Math.max(0, Number(dt) || 0);
  const ref = petKamikaze.targetRef;
  const live = ref && Number(ref.hp) > 0 && enemies.includes(ref) ? ref : null;
  if (live) {
    petKamikaze.lastX = Number(live.x);
    petKamikaze.lastY = Number(live.y);
  }
  const tx = live ? Number(live.x) : petKamikaze.lastX;
  const ty = live ? Number(live.y) : petKamikaze.lastY;
  const dx = tx - petState.x;
  const dy = ty - petState.y;
  const dist = Math.hypot(dx, dy);
  if (live && dist <= PET_KK_CONTACT_DIST) {
    // Collé à la cible : converge en douceur vers elle (pas de snap),
    // puis suit sa position pendant 1 s avant d'exploser.
    const k = Math.min(1, 14 * Math.max(0, Number(dt) || 0));
    petState.x = clamp(petState.x + dx * k, 80 - RADIATION_SPAWN_MARGIN, WORLD.w - 80 + RADIATION_SPAWN_MARGIN);
    petState.y = clamp(petState.y + dy * k, 80 - RADIATION_SPAWN_MARGIN, WORLD.h - 80 + RADIATION_SPAWN_MARGIN);
    petState.vx = Number(live.vx) || 0;
    petState.vy = Number(live.vy) || 0;
    if (dist > 1) petState.angle = Math.atan2(dy, dx);
    if (dist <= 26) petKamikaze.stickT += Math.max(0, Number(dt) || 0);
    if (petKamikaze.stickT >= PET_KK_STICK_SEC) detonatePetKamikaze();
    return true;
  }
  if (!live && dist <= 60) {
    // Cible perdue en route : explose sur son dernier point connu.
    detonatePetKamikaze();
    return true;
  }
  if (petKamikaze.age >= PET_KK_TIMEOUT_SEC) {
    detonatePetKamikaze();
    return true;
  }
  // Fonce tout droit sur le point visé.
  const ownerSpeed = Math.max(260, getSpeedBreakdown().total);
  const kkSpeed = Math.max(620, ownerSpeed * 2);
  const n = dist || 1;
  stepPetMotion(petState, (dx / n) * kkSpeed, (dy / n) * kkSpeed, dt, WORLD, RADIATION_SPAWN_MARGIN);
  petState.angle = Math.atan2(dy, dx);
  return true;
}

function detonatePetKamikaze() {
  const lvl = Math.floor(Number(petKamikaze.level) || 0);
  const ref = petKamikaze.targetRef;
  const live = ref && Number(ref.hp) > 0 && enemies.includes(ref) ? ref : null;
  const cx = live ? Number(live.x) : petState.x;
  const cy = live ? Number(live.y) : petState.y;
  petKamikaze.active = false;
  petKamikaze.targetRef = null;
  petKamikaze.targetId = null;
  petKamikaze.stickT = 0;
  petKamikaze.age = 0;
  const dmg = getPetKamikazeDamage(lvl);
  const radius = getPetKamikazeRadius(lvl);
  if (!(dmg > 0) || !(radius > 0)) {
    setPetActiveGear(null);
    loadAccountUser();
    return showToast("Gear déséquipé.", 1.5);
  }
  spawnExplosion(cx, cy, 1.0);
  try { SFX.play("npcDeath", { maxVoices: 16, cooldown: 0 }); } catch {}
  let hit = 0;
  const r2 = radius * radius;
  for (const e of [...enemies]) {
    if (!e || !(Number(e.hp) > 0) || e._bossEncounter?.invulnerable) continue;
    const ex = Number(e.x) - cx;
    const ey = Number(e.y) - cy;
    const d2 = ex * ex + ey * ey;
    if (d2 > r2) continue;
    // Falloff linéaire : 100 % au centre → 50 % au bord du rayon.
    // Passe par damageEnemy : bouclier d'abord, puis coque (jamais direct vie).
    const fall = 1 - 0.5 * (Math.sqrt(d2) / radius);
    const out = damageEnemy(e, dmg * fall, 0, { chance: 0, mult: 1 });
    if (out?.total > 0) {
      hit++;
      try { notePetPlayerDamage(e); } catch {}
      addFloatText(
        Number(e.x) + (Math.random() - 0.5) * 60,
        Number(e.y) - 90 - Math.random() * 20,
        Math.round(out.total),
        "rgba(255,150,60,0.98)",
        { size: 21, pop: 0.3, shake: 0.6, life: 1, glow: 1, weight: 900, impact: true },
      );
    }
  }
  markProgressDirty();
  setPetGearCd("kk", getPetKamikazeCooldownSec(lvl));
  // Le REX se sacrifie : sa propre explosion le détruit (réparation requise).
  const pet = account.user?.pet;
  if (pet) {
    pet.sh = 0;
    pet.hp = 0;
    markProgressDirty();
  }
  onPetDestroyed();
  if (petLink.until > 0) endHplLink("destroyed");
  setPetMode("passive");
  setPetActiveGear(null);
  loadAccountUser();
  showToast(hit > 0
    ? `Kamikaze : ${formatInteger(Math.round(dmg))} dégâts (${hit} cible${hit > 1 ? "s" : ""}) — REX détruit.`
    : "Kamikaze : explosion manquée — REX détruit.", 2);
}

function triggerSacrificeFlame() {
  const lvl = Math.floor(Number(petGearLevels().fs) || 0);
  if (!(lvl > 0)) {
    loadAccountUser();
    return showToast("Gear déséquipé.", 1.5);
  }
  const pet = account.user?.pet;
  const shMax = petShieldMaxForHud(pet, account.user);
  const rexSh = pet?.sh != null && Number.isFinite(Number(pet.sh)) ? Number(pet.sh) : shMax;
  if (!(rexSh > 0)) {
    setPetMode("passive");
    setPetActiveGear(null);
    loadAccountUser();
    return showToast("Flamme sacrificielle : REX sans bouclier.", 1.8);
  }
  const missing = player.shMax - player.sh;
  const amount = Math.min(rexSh, Math.max(0, missing));
  if (!(amount > 0)) {
    setPetMode("passive");
    setPetActiveGear(null);
    loadAccountUser();
    return showToast("Bouclier déjà plein.", 1.5);
  }
  // One-shot : 3 de carburant d'un coup (réduit par AI-ECO). Prélevé ici,
  // puis retour forcé au passif : le palier retombe à 1 / 2 s.
  const fsFuel = consumePetOneshotFuel(pet, account.user);
  if (!fsFuel.ok) {
    loadAccountUser();
    return showToast(`Flamme sacrificielle : carburant insuffisant (${fsFuel.cost} requis).`, 1.8);
  }
  pet.sh = Math.max(0, rexSh - amount);
  player.sh = Math.min(player.shMax, player.sh + amount);
  addPlayerCombatFloat(amount, "rgba(70,180,255,0.98)", "+");
  markProgressDirty();
  setPetGearCd("fs", getPetSacrificeCooldownSec(lvl));
  setPetMode("passive");
  setPetActiveGear(null);
  loadAccountUser();
  showToast(`Flamme sacrificielle : +${formatInteger(Math.round(amount))} bouclier`, 2);
}

function openTraTradeWindow() {
  if (!ui.oreTradeWindow) {
    showToast("Fenêtre indisponible — recharge la page (Ctrl+F5)", 3);
    return false;
  }
  // Hors base : aucun ancrage comptoir, les ventes restent autorisées
  // via isTradeWindowAnchored() pendant la session.
  renderOreTradeWindow();
  if (window.GameWindowManager) window.GameWindowManager.restore("oreTradeWindow");
  else ui.oreTradeWindow.style.display = "block";
  return true;
}

function endTraSession() {
  if (petTrader.until <= 0) return;
  petTrader.until = 0;
  if (isOreTradeWindowOpen()) closeOreTradeWindow();
  setPetGearCd("tra", getPetTradeCooldownSec(petTrader.level));
  petTrader.level = 0;
  if (String(account.user?.pet?.activeGear || "").toLowerCase() === "tra") {
    setPetActiveGear(null);
    // Retour au comportement d'avant la session (si toujours équipé).
    if (petTrader.prevMode) setPetMode(petTrader.prevMode);
    const pg = petTrader.prevGear;
    if (pg && pg !== "tra" && Number(petGearLevels()[pg]) > 0) {
      setPetActiveGear(pg);
      if (pg === "el") {
        petLocator.manualType = null;
        petLocator.enemyId = null;
        petLocator.needsPick = true;
      }
    }
  }
  petTrader.prevMode = null;
  petTrader.prevGear = null;
  loadAccountUser();
  const wait = Math.round(traCooldownLeftSec());
  showToast(`Cargo Trader terminé — cooldown ${wait} s`, 2);
}

// Gear actif unique sous forme filtrée { al, ar, el, rep, kk, tra, fs, hpl, bc, bh } (0 = inactif).
function petActiveGears() {
  const levels = petGearLevels();
  const active = petActiveGearKey();
  const gears = { al: 0, ar: 0, el: 0, rep: 0, kk: 0, tra: 0, fs: 0, hpl: 0, bc: 0, bh: 0 };
  if (active && Number(levels[active]) > 0) gears[active] = Math.floor(Number(levels[active]));
  return gears;
}

// Box récoltable par le P.E.T : portée centrée sur le joueur, jamais celle
// que le joueur est déjà en train de collecter lui-même.
function isPetFetchEligible(c, gears, alRange, arRange) {
  if (!c) return false;
  if (collectableTargetId === c.id && c.armed === true) return false;
  const type = String(c?.type || "");
  const dp = Math.hypot(c.x - player.x, c.y - player.y);
  if (gears.al > 0 && dp <= alRange && PET_GEAR_AUTOLOOT_TYPES.includes(type)) return true;
  if (gears.ar > 0 && dp <= arRange && PET_GEAR_ORE_TYPES.includes(type)) return true;
  return false;
}

// Cible de collecte du P.E.T (mémorisée par id) : valide l'en-cours seul.
function validatePetFetch(gears) {
  if (petState.fetchId == null) return null;
  const pet = account.user?.pet;
  const cur = collectables.find((c) => c && c.id === petState.fetchId);
  if (cur && isPetFetchEligible(cur, gears, getPetGearRangeWithRadar("al", gears.al, pet, account.user), getPetGearRangeWithRadar("ar", gears.ar, pet, account.user))) return cur;
  petState.fetchId = null;
  petState.fetchHold = 0;
  return null;
}

// Nouveau scan : la box éligible la plus proche du joueur.
function scanPetFetch(gears) {
  const pet = account.user?.pet;
  const alRange = getPetGearRangeWithRadar("al", gears.al, pet, account.user);
  const arRange = getPetGearRangeWithRadar("ar", gears.ar, pet, account.user);
  if (Math.max(alRange, arRange) <= 0) return null;
  const next = pickNearestWithin(
    collectables, player.x, player.y, Math.max(alRange, arRange),
    (c) => isPetFetchEligible(c, gears, alRange, arRange),
  );
  if (next) petState.fetchId = next.id;
  return next;
}

// Récolte au contact, comme un clic joueur (mêmes récompenses).
// Récupération (AI-S) : bonus hors ressources si la box est éligible
// (bonus boxes, cargos, booty — jamais scrap / minerais / assemblage).
function collectPetBox(box) {
  const salvagePct = getPetProtocolPct(account.user?.pet, account.user, "salvage");
  const eligible = ["Bonus_Box", "Cargo_Box", "Green_Booty_Box", "Astral_Prime_Box"].includes(String(box?.type || ""));
  try {
    if (salvagePct > 0 && eligible) box._petSalvagePct = salvagePct;
    else if (box) delete box._petSalvagePct;
  } catch {}
  const res = applyCollectableReward(box);
  try { if (box) delete box._petSalvagePct; } catch {}
  if (res?.kept) {
    // Soute pleine : la box reste — tenter à nouveau dans 10 s, sans spam sonore.
    petState.pickCd = 10;
    return;
  }
  SFX.play("collect", { cut: true, maxVoices: 3 });
  takeCollectableInstance(box);
  const idx = collectables.indexOf(box);
  if (idx >= 0) collectables.splice(idx, 1);
  petState.pickCd = PET_GEAR_PICK_DELAY;
}

function tickPetLocator(gears, dt) {
  if (gears.el <= 0) {
    petLocator.enemyId = null;
    petLocator.manualType = null;
    return;
  }
  // Famille choisie dans la liste : suit toujours le plus proche de nous,
  // dans la portée du gear (1000 / 1500 / 2500) + protocole radar.
  if (petLocator.manualType == null) {
    petLocator.enemyId = null;
    return;
  }
  const range = getPetGearRangeWithRadar("el", gears.el, account.user?.pet, account.user);
  const foe = pickNearestWithin(
    enemies, player.x, player.y, range,
    (e) => Number(e?.hp) > 0 && String(e.type || "?") === petLocator.manualType,
  );
  if (foe) {
    petLocator.enemyId = foe.id;
    return;
  }
  // Rien dans la portée : on garde la famille si elle existe encore
  // (réacquise au rapprochement), sinon nouveau tirage.
  petLocator.enemyId = null;
  const anyLeft = enemies.some(
    (e) => Number(e?.hp) > 0 && String(e.type || "?") === petLocator.manualType,
  );
  if (!anyLeft) {
    petLocator.manualType = null;
    petLocator.needsPick = true;
  }
}

function tickPetPassiveGears(dt) {
  const pet = account.user?.pet;
  if (!pet || pet.active !== true || !petState.ready || player.dead || !started) return;
  // Un seul gear actif à la fois (sélecteur fenêtre P.E.T).
  const gears = petActiveGears();
  // Récupération (coque + bouclier) : tourne même REX détruit (revive via G-REP).
  tickPetRecovery(dt, pet, gears);
  if (!(Number(pet.hp) > 0)) return;
  // La collecte (G-AL / G-AR) se fait en volant jusqu'à la box
  // (voir updatePet) ; ici : localisateur uniquement.
  tickPetLocator(gears, dt);
}

// Récupération coque/bouclier du REX (palliers d'1 s + indicateurs).
function tickPetRecovery(dt, pet, gears) {
  const repPct = getPetRepairPct(gears.rep);
  if (repPct > 0) {
    const max = petMaxHpWithHeat(pet);
    const cur = Number.isFinite(Number(pet.hp)) ? Number(pet.hp) : max;
    if (cur < max - 0.01) {
      petState.repTickT = (petState.repTickT || 0) + dt;
      if (petState.repTickT >= 1.0) {
        petState.repTickT -= 1.0;
        const old = Number.isFinite(Number(pet.hp)) ? Number(pet.hp) : max;
        pet.hp = Math.min(max, old + max * repPct / 100);
        const gain = Math.round(pet.hp - old);
        if (gain > 0) {
          addFloatText(
            petState.x + (Math.random() - 0.5) * 60,
            petState.y - 90 - Math.random() * 20,
            gain,
            "rgba(80,255,125,0.98)",
            { text: `+${DMG_FMT.format(gain)}`, size: 21, pop: 0.3, shake: 0.6, life: 1, glow: 1, weight: 900, impact: true },
          );
        }
        markProgressDirty();
      }
    } else {
      petState.repTickT = 0;
    }
  } else {
    petState.repTickT = 0;
  }
  // Bouclier : recharge passive 5 %/s par pallier d'1 s, +X bleu comme le vaisseau.
  // REX détruit : pas de recharge (ni visuel), le bouclier reste à zéro.
  const petShMax = petShieldMaxForHud(pet, account.user);
  if (!(Number(pet.hp) > 0)) {
    petState.shTickT = 0;
    if (Number(pet.sh) > 0) {
      pet.sh = 0;
      markProgressDirty();
    }
  } else if (petShMax > 0) {
    const curSh = pet.sh != null && Number.isFinite(Number(pet.sh)) ? Number(pet.sh) : petShMax;
    if (curSh < petShMax - 0.01) {
      petState.shTickT = (petState.shTickT || 0) + dt;
      if (petState.shTickT >= 1.0) {
        petState.shTickT -= 1.0;
        const oldSh = pet.sh != null && Number.isFinite(Number(pet.sh)) ? Number(pet.sh) : petShMax;
        pet.sh = Math.min(petShMax, oldSh + petShMax * PET_SHIELD_REGEN_PCT_PER_SEC / 100);
        const shGain = Math.round(pet.sh - oldSh);
        if (shGain > 0) {
          addFloatText(
            petState.x + (Math.random() - 0.5) * 60,
            petState.y - 110 - Math.random() * 20,
            shGain,
            "rgba(70,180,255,0.98)",
            { text: `+${DMG_FMT.format(shGain)}`, size: 21, pop: 0.3, shake: 0.6, life: 1, glow: 1, weight: 900, impact: true },
          );
        }
        markProgressDirty();
      }
    } else {
      petState.shTickT = 0;
    }
  } else {
    petState.shTickT = 0;
  }
  // La collecte (G-AL / G-AR) se fait en volant jusqu'à la box
  // (voir updatePet) ; ici : réparation + localisateur uniquement.
  tickPetLocator(gears, dt);
}

// Carburant du REX : 1 unité toutes les 2 s +1 par gear actif continu,
// le tout réduit par le protocole économie (AI-ECO). Les one-shot
// (kamikaze / sacrifice : 3 d'un coup) sont prélevés à l'activation.
// Le coût est recalculé à chaque palier depuis le gear réellement actif :
// aucun état bloqué à 3 après un one-shot, le retour au passif / combat
// retombe sur 1 / 2 s (ou 2 / 2 s avec un gear continu).
function petFuelTickCost(pet, user) {
  const active = petActiveGearKey();
  // Gears continus : tout gear actif sauf les one-shot déjà consommés.
  // Kamikaze (explosion + REX détruit) et sacrifice (transfert instantané)
  // ne restent jamais actifs : coût de palier = base seule.
  const continuous = active && active !== "kk" && active !== "fs" ? PET_FUEL_GEAR_TICK : 0;
  return (PET_FUEL_BASE_TICK + continuous) * petFuelEcoMult(pet, user);
}
function tickPetFuel(dt) {
  const pet = account.user?.pet;
  if (!pet || pet.owned !== true || pet.active !== true) {
    petState.fuelTickT = 0;
    return;
  }
  if (!(Number(pet.hp) > 0) || !started || player.dead) return;
  petState.fuelTickT = (petState.fuelTickT || 0) + Math.max(0, Number(dt) || 0);
  if (petState.fuelTickT < PET_FUEL_TICK_SEC) return;
  petState.fuelTickT -= PET_FUEL_TICK_SEC;
  const cost = petFuelTickCost(pet, account.user);
  if (!(cost > 0)) return;
  // Carburant entier : on accumule les fractions via un reste.
  petState.fuelRest = (petState.fuelRest || 0) + cost;
  const take = Math.floor(petState.fuelRest);
  if (take <= 0) return;
  petState.fuelRest -= take;
  pet.fuel = Math.max(0, Math.floor(Number(pet.fuel) || 0) - take);
  markProgressDirty();
  if (pet.fuel <= 0) {
    pet.fuel = 0;
    petState.fuelTickT = 0;
    petState.fuelRest = 0;
    try { setPetActive(false); } catch {}
    try { setPetActiveGear(null); } catch {}
    loadAccountUser();
    showToast("REX à sec — achète de l'essence P.E.T.", 2.5);
  }
}
// Prélèvement one-shot (kamikaze / sacrifice) : 3 × économie, min 1.
function consumePetOneshotFuel(pet, user) {
  if (!pet) return { ok: false };
  const cost = Math.max(1, Math.round(PET_FUEL_ONESHOT * petFuelEcoMult(pet, user)));
  const have = Math.max(0, Math.floor(Number(pet.fuel) || 0));
  if (have < cost) return { ok: false, cost, have };
  pet.fuel = have - cost;
  markProgressDirty();
  return { ok: true, cost, have: pet.fuel };
}

function updatePet(dt) {
  const pet = account.user?.pet;
  // Panne sèche : coupure immédiate (sans attendre le palier de 2 s), pour
  // ne jamais afficher un REX "actif" avec un réservoir vide.
  if (pet?.owned === true && pet?.active === true && !(Math.max(0, Math.floor(Number(pet.fuel) || 0)) > 0)) {
    cancelKamikazeRun();
    petState.fuelTickT = 0;
    petState.fuelRest = 0;
    try { setPetActive(false); } catch {}
    try { setPetActiveGear(null); } catch {}
    loadAccountUser();
    showToast("REX à sec — achète de l'essence P.E.T.", 2.5);
    return;
  }
  if (!pet?.owned || pet?.active !== true) {
    cancelKamikazeRun();
    wasPetOn = false;
    petState.ready = false;
    petState.target = null;
    petState.fetchId = null;
    petState.fetchHold = 0;
    petLocator.enemyId = null;
    petLocator.manualType = null;
    return;
  }
  // Portail : respawn à côté de nous au lieu de traverser toute la carte.
  const petMap = currentMapId();
  // Boot (refresh) : le REX reprend sa position persistée sur la même map.
  // Portail et play gardent le rappel / respawn à côté de nous comme avant.
  if (petBootRestoreArmed) {
    petBootRestoreArmed = false;
    if (pet?.owned === true && pet?.active === true && restorePetSavedPosition(pet, petMap)) {
      petMapId = petMap;
      wasPetOn = true;
    }
  }
  if (petMapId !== petMap) {
    petMapId = petMap;
    resetPetSpawn();
  }
  // Play après pause : respawn à côté de nous.
  if (!wasPetOn) {
    wasPetOn = true;
    resetPetSpawn();
  }
  if (!started || player.dead) {
    cancelKamikazeRun();
    return;
  }
  savePetPosition(pet, petMap, dt);
  // REX détruit : seule la récupération tourne (revive via G-REP).
  if (!(Number(pet.hp) > 0)) {
    cancelKamikazeRun("destroyed");
    if (petBuoy.until > 0) endBuoySession("destroyed");
    tickPetRecovery(dt, pet, petActiveGears());
    petState.target = null;
    return;
  }
  if (!petState.ready) {
    petState.x = player.x - 90;
    petState.y = player.y + 70;
    petState.fireCd = 0;
    petState.pickCd = 0;
    petState.fetchId = null;
    petState.fetchHold = 0;
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

  // Kamikaze : course verrouillée, prioritaire sur tout le reste.
  if (kkRunActive()) {
    tickPetFuel(dt);
    // Panne sèche pendant la course : on annule proprement.
    if (account.user?.pet?.active !== true) return;
    tickPetKamikaze(dt);
    tickPetPassiveGears(dt);
    return;
  }
  tickPetFuel(dt);
  if (account.user?.pet?.active !== true) return;

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
  // Collecte G-AL / G-AR : cible connue avant le rappel — un REX en route
  // vers sa box (ou déjà sur la suivante) ne doit pas faire demi-tour.
  // La portée reste centrée sur le joueur : s'éloigner trop annule la cible.
  const petGears = petActiveGears();
  const preFetch = validatePetFetch(petGears) || scanPetFetch(petGears);
  const leash = Math.max(750, playerRange * 1.2) + (finishingAttack ? 600 : 0);
  // Inclure le rayon de combat : le cote oppose du NPC reste accessible.
  const ownerLeash = leash + PET_COMBAT_RADIUS;
  if (ownerDistance > ownerLeash && !petState.returning && preFetch == null) {
    petState.returning = true;
    petState.assistTarget = null;
    petState.escortX = undefined;
    petState.escortY = undefined;
  } else if (preFetch != null || ownerDistance <= PET_REST_RADIUS + 22) {
    petState.returning = false;
  }
  // Ne pas effacer a chaque image les nouveaux degats confirmes pendant le retour.
  let target = null;
  // Lien HP : mixé au mode combat (le REX se bat pendant le lien).
  const petCombatMode = normalizePetMode(pet.mode) === "combat" || hplLinkActive();
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
  const ownerSpeed = Math.max(260, getSpeedBreakdown().total) * playerSlowMult(player);
  // Close / intermediate / far zones blend continuously into catch-up speed.
  const catchup = clamp((ownerDistance - 220) / 680, 0, 1);
  const followSpeed = ownerSpeed * (1.1 + catchup * 0.65);
  let destX = petState.x, destY = petState.y;
  let wantSpeed = followSpeed;
  const weaving = !!target;
  const combat = target ? petCombatVelocity(petState, target, PET_COMBAT_RADIUS, dt, player) : null;
  const weaveVX = combat?.vx || 0, weaveVY = combat?.vy || 0;
  // G-AL / G-AR : sans cible de combat et sans retour, le P.E.T vole
  // jusqu'à la box et la récolte au contact, comme un clic joueur.
  // (preFetch déjà scanné avant le rappel : enchaîne les boxes sans revenir.)
  let fetchTarget = null;
  if (!target && !petState.returning) fetchTarget = preFetch;
  else {
    petState.fetchId = null;
    petState.fetchHold = 0;
  }
  if (!target || petState.returning) {
    // Bouée : le REX nous colle fortement (petit rayon d'escorte).
    const restR = !petState.returning && buoySessionActive() ? PET_BUOY_REST_RADIUS : PET_REST_RADIUS;
    const escort = petEscortTarget(petState, player, dt, petState.returning ? PET_REST_RADIUS * 0.65 : restR);
    // Comme les NPC aggro : le REX suit hors-carte (zone de radiation).
    destX = clamp(escort.x, 80 - RADIATION_SPAWN_MARGIN, WORLD.w - 80 + RADIATION_SPAWN_MARGIN);
    destY = clamp(escort.y, 80 - RADIATION_SPAWN_MARGIN, WORLD.h - 80 + RADIATION_SPAWN_MARGIN);
    wantSpeed = followSpeed;
  }
  const prevX = petState.x;
  const prevY = petState.y;
  if (weaving) {
    const scale = Math.min(1, followSpeed / (Math.hypot(weaveVX, weaveVY) || 1));
    stepPetMotion(petState, weaveVX * scale, weaveVY * scale, dt, WORLD, RADIATION_SPAWN_MARGIN);
  } else if (fetchTarget) {
    // Approche vivante (jamais de ligne droite parfaite ni de snap) :
    // lacet pendant le trajet, micro-flottement pendant la seconde de collecte.
    const collectX = clamp(fetchTarget.x + (COLLECTABLE_PICKUP.offsetX || 0), 80, WORLD.w - 80);
    const collectY = clamp(fetchTarget.y + (COLLECTABLE_PICKUP.offsetY || 0), 80, WORLD.h - 80);
    const t = performance.now() / 1000;
    const dx0 = collectX - petState.x, dy0 = collectY - petState.y;
    const trueDist = Math.hypot(dx0, dy0);
    const arrived = trueDist <= COLLECTABLE_PICKUP.centerRadius + 6;
    let aimX, aimY;
    if (!arrived) {
      petState.fetchHold = 0;
      const wobble = Math.min(70, trueDist * 0.2);
      const nx = dx0 / (trueDist || 1), ny = dy0 / (trueDist || 1);
      const sway = Math.sin(t * 3.1) * wobble;
      aimX = collectX - ny * sway;
      aimY = collectY + nx * sway;
    } else {
      // Sur la box : cap figé + flottement amorti (sans stepPetMotion,
      // dont les recalculs de cap feraient glitcher le sprite sur place).
      aimX = collectX + Math.sin(t * 2.2) * 6;
      aimY = collectY + Math.cos(t * 1.7) * 6;
      const k = Math.min(1, 5 * dt);
      petState.x = clamp(petState.x + (aimX - petState.x) * k, 80, WORLD.w - 80);
      petState.y = clamp(petState.y + (aimY - petState.y) * k, 80, WORLD.h - 80);
      petState.vx = 0;
      petState.vy = 0;
      petState.fetchHold = (petState.fetchHold || 0) + dt;
      // Même durée que le vaisseau (COLLECTABLE_PICKUP.holdDuration).
      if (petState.fetchHold >= COLLECTABLE_PICKUP.holdDuration && petState.pickCd <= 0) {
        collectPetBox(fetchTarget);
        petState.fetchId = null;
        petState.fetchHold = 0;
        fetchTarget = null;
      }
    }
    if (fetchTarget) {
      // Vitesse du joueur, sans bonus de rattrapage (pas une fusée).
      const vx = (aimX - petState.x) * 3, vy = (aimY - petState.y) * 3;
      const speed = Math.hypot(vx, vy);
      const scale = speed > 0 ? Math.min(1, ownerSpeed / speed) : 0;
      stepPetMotion(petState, vx * scale, vy * scale, dt, WORLD, RADIATION_SPAWN_MARGIN);
    }
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
      stepPetMotion(petState, vx * scale, vy * scale, dt, WORLD, RADIATION_SPAWN_MARGIN);
    }
  }
  if (target) petState.angle = Math.atan2(target.y - petState.y, target.x - petState.x);
  // Pas de verrouillage sur la box : le REX garde son orientation de vol.
  else orientPet(petState, dt);
  // Gears passifs (collecte, réparation, localisateurs) : indépendants du combat.
  tickPetPassiveGears(dt);
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

// Lien HP (G-HPL) : gros éclair entre le vaisseau et le REX, comme le robot
// réparateur. Retracé à chaque frame (scintillement électrique).
function drawPetLink(ox, oy) {
  if (!hplLinkActive() || !petState.ready || player.dead || !started) return;
  const x1 = player.x + ox, y1 = player.y + oy;
  const x2 = petState.x + ox, y2 = petState.y + oy;
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len < 1) return;
  const nx = -dy / len, ny = dx / len;
  const segs = 9;
  const pass = (color, width, amp) => {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineJoin = "round";
    ctx.shadowColor = color;
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    for (let i = 1; i < segs; i++) {
      const t = i / segs;
      const off = (Math.random() * 2 - 1) * amp * Math.sin(t * Math.PI);
      ctx.lineTo(x1 + dx * t + nx * off, y1 + dy * t + ny * off);
    }
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.restore();
  };
  pass("rgba(255,225,77,0.85)", 5, 30);
  pass("rgba(255,255,255,0.9)", 2, 30);
  // Halos aux deux extrémités.
  for (const [hx, hy] of [[x1, y1], [x2, y2]]) {
    const glow = ctx.createRadialGradient(hx, hy, 0, hx, hy, 34);
    glow.addColorStop(0, "rgba(255,240,150,0.5)");
    glow.addColorStop(1, "rgba(255,240,150,0)");
    ctx.save();
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(hx, hy, 34, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
}

// Bouées (G-BC / G-BH) : gros halo continu de 500 autour du REX,
// rouge dégâts / vert coque.
function drawPetBuoy(ox, oy) {
  if (!(petBuoy.key === "bc" || petBuoy.key === "bh")) return;
  if (petBuoy.until <= 0 || performance.now() / 1000 >= petBuoy.until) return;
  const pet = account.user?.pet;
  if (!pet?.owned || pet?.active !== true || !(Number(pet.hp) > 0)) return;
  if (!petState.ready || player.dead || !started) return;
  const sx = petState.x + ox, sy = petState.y + oy;
  if (sx < -PET_BUOY_RADIUS || sy < -PET_BUOY_RADIUS
    || sx > innerWidth + PET_BUOY_RADIUS || sy > innerHeight + PET_BUOY_RADIUS) return;
  const t = performance.now() / 1000;
  const pulse = 0.55 + Math.sin(t * 2.5) * 0.12;
  const col = petBuoy.key === "bc" ? "255,70,80" : "80,255,150";
  // Anneaux superposés, sans shadowBlur (coûteux sur un rayon de 500).
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const rings = [[10, 0.10], [5, 0.28], [2, 0.65]];
  for (const [w, a] of rings) {
    ctx.strokeStyle = `rgba(${col},${(a * (0.7 + pulse)).toFixed(3)})`;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.arc(sx, sy, PET_BUOY_RADIUS, 0, TAU);
    ctx.stroke();
  }
  // Pulsation centre → extérieur : 2 vaguelettes en boucle.
  const period = 2.2;
  for (let k = 0; k < 2; k++) {
    const p = (((t + k * period / 2) % period) + period) % period / period;
    const rr = 40 + (PET_BUOY_RADIUS - 40) * p;
    ctx.strokeStyle = `rgba(${col},${(0.35 * (1 - p)).toFixed(3)})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(sx, sy, rr, 0, TAU);
    ctx.stroke();
  }
  ctx.restore();
}

function drawPet(ox, oy) {
  const pet = account.user?.pet;
  if (!pet?.owned || pet?.active !== true) return;
  if (!(Number(pet.hp) > 0)) return;
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
  // Même balancement qu'à l'arrêt que le vaisseau et les drones (sprite uniquement).
  const petTt = performance.now() / 1000;
  const petBobY = Math.sin(petTt * 4.0) * 2 * idleSway;
  ctx.save();
  ctx.translate(0, petBobY);
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
  // Barres coque / bouclier quand on le lock, comme un NPC.
  if (Target.get() === petTargetProxy) drawNpcStatus(ctx, petTargetProxy, String(pet?.pseudo || "REX"), true);
  // Étiquette du REX : pseudo + firme à droite, comme le vaisseau — fixe, sans balancement.
  try {
    const petPseudo = String(pet?.pseudo || "REX");
    const petFaction = getFaction(pet?.faction || account.user?.faction);
    let petFactionImage = getCachedImage(petFaction.imagePath);
    if (!isImgReady(petFactionImage)) {
      loadImage(petFaction.imagePath, { priority: true });
      petFactionImage = null;
    }
    ctx.font = "900 13px ui-sans-serif, system-ui";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    const petNameY = PET_DRAW_H / 2 + 10;
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    ctx.fillText(petPseudo, 0, petNameY);
    if (petFactionImage?.complete && petFactionImage.naturalWidth > 0) {
      const petTextWidth = ctx.measureText(petPseudo).width;
      ctx.drawImage(
        petFactionImage,
        petTextWidth / 2 + 5,
        petNameY,
        petFactionImage.naturalWidth,
        petFactionImage.naturalHeight,
      );
    }
  } catch {}
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

// Fuite des NPC sous 10 % de PV : en Galaxy Gate (alpha/beta/gamma) ils se
// regroupent dans un coin fixe de la map ; en map normale ils fuient loin de
// leur cible. Pur mouvement (les tirs restent gérés par enemyShoot).
// Vitesse plafonnée pour que le joueur reste un peu plus rapide : un fuyard
// plus rapide que le vaisseau serait intouchable à jamais.
const NPC_FLEE_HP_PCT = 10;
const NPC_FLEE_ARRIVED_DIST = 80;
function npcHpPct(e) {
  const max = Math.max(0, Number(e.hpMax) || 0);
  if (!(max > 0)) return 100;
  return (Math.max(0, Number(e.hp) || 0) / max) * 100;
}
function npcShouldFlee(e) {
  if (!e || Number(e.hp) <= 0) return false;
  if ((NPC_TYPES[e.type] || {}).ai === "kamikaze") return false;
  return npcHpPct(e) < NPC_FLEE_HP_PCT;
}
function npcFleeSpeed(e) {
  const own = npcEffectiveSpeed(e);
  const chase = Math.max(60, Number(player.baseSpeed || 0) * 0.92);
  return Math.min(own, chase);
}
// Coin de fuite en gate : le plus proche entre (0,0) haut-gauche et
// (W,H) bas-droite (les vrais coins de map).
function npcGateFleeCorner(e) {
  const dTL = Math.hypot(e.x, e.y);
  const dBR = Math.hypot(WORLD.w - e.x, WORLD.h - e.y);
  return dTL <= dBR ? { x: 0, y: 0 } : { x: WORLD.w, y: WORLD.h };
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
    size: 21,
    pop: 0.3,
    shake: 0.6,
    life: 1,
    glow: 1,
    weight: 900,
    impact: true,
  });
}

function spawnSpark(x, y, big = false) {
  // ✅ legacy : les cercles jaunes sont désactivés (aucun rond dessiné).
  // Impacts laser = rien ; impacts roquette = mini explosion HIT_NPC ;
  // mort NPC = explosion HIT_NPC pleine taille.
  // (la fumée des traînées roquette est poussée directement avec smoke:true)
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

// ✅ Leonov : bonus actif si le vaisseau actif est le Leonov ET que la map
// courante est une carte mère x-1 à x-4 de SA firme (secteur MMO=1, EIC=2, VRU=3).
function isLeonovHomeActive() {
  if (String(account.user?.ship || "").toLowerCase() !== "leonov") return false;
  const sector = getFaction(account.user?.faction)?.sector;
  if (!sector) return false;
  return new RegExp(`^${sector}-[1234]$`).test(currentMapId().trim().toLowerCase());
}

// ✅ Goliath Plus (HEAT) : +10 % dégâts / PV / bouclier du REX par VISUEL
// du P.E.T (Niveau1=+10 % ... Niveau5 et fusion=+50 % plafonné).
// 0 si pas de Goliath Plus actif.
function goliathHeatPct() {
  if (!String(account.user?.ship || "").toLowerCase().startsWith("goliath_plus")) return 0;
  const stage = getPetStage(getPetLevel(account.user?.pet?.exp));
  return Math.min(50, Math.max(1, stage) * 10);
}

// PV max du REX : base niveau + Coque+ (définitif), puis protocole
// coque (AI-HP, +X % sur ses propres HP), puis bonus HEAT du Goliath Plus.
function petMaxHpWithHeat(pet) {
  const base = getPetMaxHp(getPetLevel(pet?.exp)) + getPetHullBonusHp(pet);
  const hpPct = getPetProtocolPct(pet, account.user, "hp");
  const withProto = hpPct > 0 ? base * (1 + hpPct / 100) : base;
  return Math.floor(withProto * (1 + goliathHeatPct() / 100));
}

// Soute lue depuis le compte en mémoire (pas de relecture storage à chaque frame).
// Bonus d'améliorations chargées (minerais sur l'équipement). Actif tant que le stock > 0.
function playerUpgradeMults() {
  const out = { laser: 1, rocket: 1, speed: 1, shield: 1 };
  const upgrades = account.user?.upgrades || {};
  for (const slot of Object.keys(out)) {
    const loaded = upgrades[slot];
    if (!loaded || Math.max(0, Math.floor(Number(loaded.stock) || 0)) <= 0) continue;
    const pct = Number(UPGRADE_ORE_BONUS[String(loaded.ore)]?.[slot] || 0);
    if (pct > 0) out[slot] = 1 + pct;
  }
  return out;
}

// Consomme le stock chargé (lasers/roquettes : par tir ; bouclier/vitesse : par palier).
function consumeUpgradeStock(slot, amount = 1) {
  const upgrades = account.user?.upgrades;
  const loaded = upgrades?.[slot];
  const stock = Math.max(0, Math.floor(Number(loaded?.stock) || 0));
  if (stock <= 0) return false;
  loaded.stock = Math.max(0, stock - Math.max(1, Math.floor(Number(amount) || 1)));
  refreshUpgradeSlotDom(slot);
  if (loaded.stock <= 0) {
    markProgressDirty();
    saveProgressNow();
    applyCurrentConfigStats(false, null, true);
  }
  return true;
}

// Mise à jour instantanée du slot (sans reconstruire toute la fenêtre).
function refreshUpgradeSlotDom(slot) {
  if (!ui.refineryUpgrades) return;
  if (!ui.refineryWindow || ui.refineryWindow.style.display === "none") return;
  const el = ui.refineryUpgrades.querySelector(`[data-upgrade-slot="${slot}"]`);
  if (!el) return;
  const loaded = account.user?.upgrades?.[slot] || {};
  const stock = Math.max(0, Math.floor(Number(loaded.stock) || 0));
  el.classList.toggle("filled", stock > 0);
  el.innerHTML = stock > 0
    ? `<img src="${escapeHtml(getResourceIcon(loaded.ore))}" alt="${escapeHtml(getResourceName(loaded.ore))}" loading="lazy" draggable="false"><b>${formatInteger(stock)}</b>`
    : `<span class="upgSlotEmpty">Vide</span>`;
  const status = el.closest(".upgCard")?.querySelector(".upgStatus");
  if (status) {
    const bonusPct = Math.round(Number(UPGRADE_ORE_BONUS[String(loaded.ore)]?.[slot] || 0) * 100);
    status.textContent = stock > 0 ? `+${bonusPct}%` : "";
  }
}

function currentCargo() {
  const resources = account.user?.inventory?.resources || {};
  const used = cargoUsed(resources);
  // Protocole cargo (AI-CR) : +X % de soute appliqué à notre vaisseau.
  const cargoPct = getPetProtocolPct(account.user?.pet, account.user, "cargo");
  const capacity = cargoPct > 0 ? Math.floor(CARGO_CAPACITY * (1 + cargoPct / 100)) : CARGO_CAPACITY;
  return { used, capacity, free: Math.max(0, capacity - used) };
}

function collectableAllowedOnCurrentMap(cfg, mapId = currentMapId()) {
  const cur = String(mapId);
  const curLow = cur.trim().toLowerCase();

  // Exclusion explicite : aucune box ambiente sur les GG / Low / QZ,
  // mais les drops NPC (cargo + ressources) restent autorisés car
  // leurs configs n'ont pas de denyMaps.
  const deny =
    cfg.denyMaps ??
    cfg.blockedMaps ??
    cfg.disabledMaps ??
    cfg.excludeMaps ??
    null;
  if (deny) {
    const list = Array.isArray(deny) ? deny : [deny];
    for (const m of list) {
      const v = String(m || "").trim().toLowerCase();
      if (!v) continue;
      if (v === "*" || v === "all") return false;
      if (v === curLow || v === cur) return false;
    }
  }

  const maps =
    cfg.maps ??
    cfg.map ??
    cfg.onlyMaps ??
    cfg.allowedMaps ??
    null;

  if (!maps) return true;
  if (maps === "*" || maps === "all") return true;
  if (String(maps).trim() === "*") return true;

  if (Array.isArray(maps)) {
    return maps.map((m) => String(m).trim().toLowerCase()).includes(curLow);
  }

  return String(maps).trim().toLowerCase() === curLow;
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

// ============================================================
// Monde continu collectables (miroir NPC) : slots ambientes persistés +
// drops dynamiques à durée de vie. Une box ramassée reste ramassée
// (respawn après délai) même en cas de refresh / changement de map / mort.
// ============================================================
let collectablesWorldMap = null;

function collectableRespawnDelayMs(type) {
  const cfg = COLLECTABLE_DEFS[type] || {};
  const sec = Number(cfg.respawnDelaySec ?? 60);
  return Math.max(0, Math.floor((Number.isFinite(sec) ? sec : 60) * 1000));
}

function pushAmbientCollectableInstance(slot, mapId) {
  const cfg = COLLECTABLE_DEFS[slot.type] || {};
  ensureCollectableLoaded(slot.type);
  const sp = cfg.sprite || {};
  const frames = Math.max(1, Number(sp.frames || 1));
  collectables.push({
    id: newId(),
    type: slot.type,
    map: mapId,
    x: clamp(Number(slot.x) || 0, 80, WORLD.w - 80),
    y: clamp(Number(slot.y) || 0, 80, WORLD.h - 80),
    r: Number(cfg.r ?? cfg.radius ?? 32),
    pickupRadius: Number(cfg.pickupRadius ?? cfg.r ?? cfg.radius ?? 42),
    armed: false,
    slotUid: String(slot.uid),
    dropUid: null,
    t: 0,
    frameAcc: sp.randomStart ? rand(0, frames) : 0,
  });
}

// Position d'un nouveau slot : aléatoire, espacée des slots existants.
function pickAmbientSlotPosition(type, taken) {
  const cfg = COLLECTABLE_DEFS[type] || {};
  const minSpacing = Number(cfg.minSpacing ?? COLLECTABLE_CFG.minSpacing ?? 120);
  const maxAttempts = Math.max(1, Number(cfg.maxAttempts ?? COLLECTABLE_CFG.maxAttempts ?? 80));
  for (let i = 0; i < maxAttempts; i++) {
    const pos = spawnRandomOnMap();
    if (minSpacing > 0) {
      let ok = true;
      for (const p of taken) {
        if (dist2(pos.x, pos.y, p.x, p.y) < minSpacing * minSpacing) { ok = false; break; }
      }
      if (!ok) continue;
    }
    return pos;
  }
  return spawnRandomOnMap();
}

// Respawn aléatoire d'un slot dû (comme les NPC : jamais à la même place).
function respawnAmbientSlot(slot, mapId) {
  const taken = listCollectableSlots(collectableStore, mapId)
    .filter((s) => s && String(s.uid) !== String(slot.uid))
    .map((s) => ({ x: Number(s.x), y: Number(s.y) }));
  const pos = pickAmbientSlotPosition(slot.type, taken);
  reviveCollectableSlot(collectableStore, mapId, String(slot.uid), pos.x, pos.y);
  pushAmbientCollectableInstance({ ...slot, x: pos.x, y: pos.y }, mapId);
}

function initCollectableWorld(mapId) {
  if (!WORLD || !(Number(WORLD.w) > 0) || !(Number(WORLD.h) > 0)) return;
  const now = worldClock.now();
  const defs = [];
  const taken = listCollectableSlots(collectableStore, mapId).map((s) => ({ x: Number(s.x), y: Number(s.y) }));
  for (const [type, cfg] of collectableDefsList()) {
    const target = collectableTargetCount(cfg);
    if (target <= 0) continue;
    const existing = countCollectableSlots(collectableStore, mapId, type);
    const missing = Math.max(0, target - existing);
    for (let i = 0; i < target - missing; i++) defs.push({ type, x: 0, y: 0 });
    for (let i = 0; i < missing; i++) {
      const pos = pickAmbientSlotPosition(type, taken);
      taken.push(pos);
      defs.push({ type, x: pos.x, y: pos.y });
    }
    // Précharge les sprites des box de la map.
    ensureCollectableLoaded(type);
  }
  const slots = ensureCollectableSlots(collectableStore, mapId, defs, now);
  // Rattrapage horloge monde : respawns dus pendant l'absence (refresh...)
  // sur de NOUVELLES positions aléatoires.
  const spawned = new Set();
  for (const slot of dueCollectableSlots(collectableStore, mapId, now)) {
    try { respawnAmbientSlot(slot, mapId); spawned.add(String(slot.uid)); } catch {}
  }
  pruneExpiredDrops(collectableStore, mapId, now);
  for (const slot of slots) {
    if (slot && slot.alive !== false && !spawned.has(String(slot.uid))) pushAmbientCollectableInstance(slot, mapId);
  }
  // Drops dynamiques survivants (cargo temporaires, assemblage permanents).
  for (const drop of listCollectableDrops(collectableStore, mapId)) {
    const exp = Math.floor(Number(drop.expiresAtMs) || 0);
    let elapsedSec = 0;
    if (exp > 0) {
      const remainingMs = exp - now;
      if (remainingMs <= 0) continue;
      const cfg = COLLECTABLE_DEFS[drop.type] || {};
      const totalMs = Math.max(1, Math.floor(Number(cfg.npcDespawnAfter || 30) * 1000));
      elapsedSec = Math.max(0, (totalMs - remainingMs) / 1000);
    }
    spawnCollectableAtRestored(drop, elapsedSec);
  }
  persistCollectables();
}

// Restaure un drop dynamique avec son temps restant (sans ré-enregistrer).
function spawnCollectableAtRestored(drop, elapsedSec) {
  const cfg = COLLECTABLE_DEFS[drop.type];
  if (!cfg || cfg.enabled === false) return false;
  ensureCollectableLoaded(drop.type);
  const sp = cfg.sprite || {};
  const frames = Math.max(1, Number(sp.frames || 1));
  collectables.push({
    id: newId(),
    type: drop.type,
    map: currentMapId(),
    x: clamp(Number(drop.x) || 0, -RADIATION_SPAWN_MARGIN, WORLD.w + RADIATION_SPAWN_MARGIN),
    y: clamp(Number(drop.y) || 0, -RADIATION_SPAWN_MARGIN, WORLD.h + RADIATION_SPAWN_MARGIN),
    r: Number(cfg.r ?? cfg.radius ?? 32),
    pickupRadius: Number(cfg.pickupRadius ?? cfg.r ?? cfg.radius ?? 42),
    armed: false,
    fromNpc: drop.fromNpc != null ? String(drop.fromNpc) : null,
    oreRemainder: drop.ores && typeof drop.ores === "object" ? { ...drop.ores } : null,
    rewardOverride: drop.noDefReward === true ? { resources: {} } : null,
    fixedAmount: drop.amount,
    dropUid: String(drop.uid),
    slotUid: null,
    despawnAfter: Math.max(0, Number(cfg.npcDespawnAfter || 0)),
    t: Math.max(0, Number(elapsedSec) || 0),
    frameAcc: sp.randomStart ? rand(0, frames) : 0,
  });
  return true;
}

// Retire une instance : slot -> mort programmée, drop -> enregistrement supprimé.
function takeCollectableInstance(c) {
  if (!c) return;
  const mapId = String(c.map || currentMapId());
  try {
    if (c.slotUid) {
      takeCollectableSlot(collectableStore, mapId, String(c.slotUid), worldClock.now(), collectableRespawnDelayMs(c.type));
    }
    if (c.dropUid) {
      removeCollectableDrop(collectableStore, mapId, String(c.dropUid));
    }
    persistCollectables();
  } catch {}
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


function spawnCollectableAt(type, x, y, opts = {}) {
  const cfg = COLLECTABLE_DEFS[type];
  if (!cfg || cfg.enabled === false) return false;
  if (!collectableAllowedOnCurrentMap(cfg)) return false;

  ensureCollectableLoaded(type);

  const sp = cfg.sprite || {};
  const frames = Math.max(1, Number(sp.frames || 1));
  const cx = clamp(x, -RADIATION_SPAWN_MARGIN, WORLD.w + RADIATION_SPAWN_MARGIN);
  const cy = clamp(y, -RADIATION_SPAWN_MARGIN, WORLD.h + RADIATION_SPAWN_MARGIN);
  const despawnAfter = Math.max(0, Number(opts.despawnAfter || 0));

  const instance = {
    id: newId(),
    type,
    map: currentMapId(),

    x: cx,
    y: cy,

    r: Number(cfg.r ?? cfg.radius ?? 32),
    pickupRadius: Number(cfg.pickupRadius ?? cfg.r ?? cfg.radius ?? 42),

    // ✅ important : si tu as fait le système "il faut cliquer dessus"
    armed: opts.armed === true,

    // ✅ permet de savoir que cette box vient d’un NPC
    fromNpc: opts.fromNpc || null,

    // ✅ contenu minerai impose (epave du joueur : 1 prometium)
    oreRemainder: opts.oreRemainder || null,

    // ✅ recompense de base remplacee (epave du joueur : rien d'autre)
    rewardOverride: opts.rewardOverride || null,

    // ✅ montant fixe (drops d'assemblage : quantité tirée au kill)
    fixedAmount: Math.max(0, Math.floor(Number(opts.amount) || 0)) || null,

    slotUid: null,
    dropUid: null,

    despawnAfter,

    t: 0,
    frameAcc: sp.randomStart ? rand(0, frames) : 0,
  };
  collectables.push(instance);

  // Monde continu : les drops à durée de vie survivent au refresh
  // (expiration en temps réel via l'horloge monde). expiresAtMs = 0 :
  // jamais d'expiration (box d'assemblage, comme les bonus box).
  try {
    const record = addCollectableDrop(collectableStore, instance.map, {
      type,
      x: cx,
      y: cy,
      amount: instance.fixedAmount,
      fromNpc: instance.fromNpc,
      ores: instance.oreRemainder,
      noDefReward: instance.rewardOverride != null,
      expiresAtMs: despawnAfter > 0 ? worldClock.now() + despawnAfter * 1000 : 0,
    });
    instance.dropUid = String(record.uid);
    persistCollectables();
  } catch {}

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

  const reward = c.rewardOverride || pickExclusiveCollectableReward(cfg.exclusiveRewards) || cfg.reward || cfg.rewards || {};
  const parts = [];
  const goldTerms = [];
  // Booster Bonus Box : contenu doublé.
  // Maps battle (4-x et x-4.1) : toutes les box sauf cargos doublées de base.
  const battleMapId = String(currentMapId());
  const isBattleMap = /^4(-|$|\.)/.test(battleMapId) || /-4\.1$/.test(battleMapId);
  const battleMult = (isBattleMap && String(c?.type || "") !== "Cargo_Box") ? 2 : 1;
  // Récupération P.E.T (AI-S) : +X % sur le contenu hors ressources
  // (crédits, énergie GG, munitions, HP/bouclier) quand c'est le REX qui
  // ramasse — jamais sur le minerai ni l'assemblage (scrap, mucosum...).
  const petSalvagePct = Number(c?._petSalvagePct) > 0 ? Number(c._petSalvagePct) : 0;
  const salvageMult = petSalvagePct > 0 ? 1 + petSalvagePct / 100 : 1;
  const boxMult = (String(c?.type || "") === "Bonus_Box" ? playerBoosterMults().box : 1) * battleMult * salvageMult;

  let changed = false;
  let grantedAny = false;
  let oreBlockedAny = false;

  const credits = Math.floor(rollValue(reward.credits, 0) * boxMult);
  if (credits > 0) {
    player.credits += credits;
    parts.push(`+${credits} crédits`);
    changed = true;
    grantedAny = true;
  }

  const galaxyEnergy = Math.floor(rollValue(reward.galaxyEnergy, 0) * boxMult);
  if (galaxyEnergy > 0) {
    if (!account.user) loadAccountUser();
    if (account.user) {
      account.user.galaxyGates = normalizeGalaxyGateState(account.user.galaxyGates);
      account.user.galaxyGates.energy += galaxyEnergy;
      parts.push(`+${formatInteger(galaxyEnergy)} énergie pour les portails intergalactiques (GG)`);
      changed = true;
      grantedAny = true;
      if (ui.galaxyGateWindow.style.display !== "none" && !ui.galaxyGateWindow.classList.contains("gameWinMinimized")) {
        renderGalaxyGateWindow();
      }
    }
  }

  if (reward.ammo && typeof reward.ammo === "object") {
    for (const key in reward.ammo) {
      const amount = Math.floor(rollValue(reward.ammo[key], 0) * boxMult);
      if (amount <= 0) continue;

      player.ammo[key] = Math.max(0, Number(player.ammo[key]) || 0) + amount;
      parts.push(`+${formatInteger(amount)} munitions type ${key.toUpperCase()}`);
      changed = true;
      grantedAny = true;
    }
  }

  // Refus anticipé Cargo_Box : si aucun minerai du cargo ne rentre en soute,
  // on ne touche à rien (même pas les débris) et la box reste entière.
  let cargoRefuseUpfront = false;
  const cargoCap = currentCargo().capacity;
  if (String(c?.type || "") === "Cargo_Box" && c?.fromNpc) {
    if (!account.user) loadAccountUser();
    const pendingUpfront = c.oreRemainder || getNpcCargoOres(c.fromNpc, currentMapId());
    const upfrontIds = Object.keys(pendingUpfront);
    if (upfrontIds.length && account.user) {
      const resUpfront = account.user.inventory?.resources || {};
      const multUpfront = playerBoosterMults().res;
      const fits = upfrontIds.some(id => cargoAdd(resUpfront, id, Math.floor(Number(pendingUpfront[id]) * multUpfront), cargoCap).added > 0);
      if (!fits) cargoRefuseUpfront = true;
    }
  }

  if (reward.resources && typeof reward.resources === "object" && !(String(c?.type || "") === "Cargo_Box" && (c?.cargoTaken === true || cargoRefuseUpfront))) {
    if (!account.user) loadAccountUser();
    if (account.user) {
      account.user.inventory ||= {};
      account.user.inventory.resources ||= {};
      // Booster Ressources : +25 % sur les cargos venus de NPC.
      const resMult = (c?.fromNpc ? playerBoosterMults().res : 1) * battleMult;
      const fixedAmount = c?.fixedAmount != null ? Math.max(0, Math.floor(Number(c.fixedAmount))) : null;
      for (const [resourceId, range] of Object.entries(reward.resources)) {
        const wanted = Math.floor((fixedAmount ?? rollValue(range, 0)) * resMult);
        if (wanted <= 0) continue;
        // Minerais -> soute bonus cargo inclus (plafonné, jamais de perte sèche ici : le refus est géré plus bas).
        if (isOreResource(resourceId)) {
          const { added, blocked } = cargoAdd(account.user.inventory.resources, resourceId, wanted, cargoCap);
          if (added > 0) {
            account.user.inventory.resources[resourceId] = Math.max(0, Number(account.user.inventory.resources[resourceId]) || 0) + added;
            parts.push(`+${formatInteger(added)} ${getResourceName(resourceId, added)}`);
            goldTerms.push(formatInteger(added));
            changed = true;
            grantedAny = true;
          }
          if (blocked > 0) oreBlockedAny = true;
          continue;
        }
        account.user.inventory.resources[resourceId] = Math.max(0, Number(account.user.inventory.resources[resourceId]) || 0) + wanted;
        parts.push(`+${formatInteger(wanted)} ${getResourceName(resourceId, wanted)}`);
        goldTerms.push(formatInteger(wanted));
        changed = true;
        grantedAny = true;
      }
    }
  }

  // Minerais du NPC dans son cargo (valeurs officielles : NPC_CARGO.js).
  // - Soute pleine pour TOUT le minerai -> refus : animation + message, la box reste entière.
  // - Partiel -> on prend ce qui rentre, le reste reste dedans (c.oreRemainder).
  let cargoKept = false;
  let cargoRefused = false;
  if (cargoRefuseUpfront) {
    parts.push("Soute pleine — vendez ou raffinez vos minerais");
    changed = true;
    cargoKept = true;
    cargoRefused = true;
  }
  if (String(c?.type || "") === "Cargo_Box" && (c?.fromNpc || c?.oreRemainder) && !cargoRefuseUpfront) {
    const table = c.oreRemainder || getNpcCargoOres(c.fromNpc, currentMapId());
    const ids = Object.keys(table);
    if (ids.length) {
      if (!account.user) loadAccountUser();
      if (account.user) {
        account.user.inventory ||= {};
        account.user.inventory.resources ||= {};
        const resMult = playerBoosterMults().res;
        const remainder = {};
        let granted = false;
        for (const resourceId of ids) {
          const wanted = Math.floor(Number(table[resourceId]) * resMult);
          if (wanted <= 0) continue;
          const { added, blocked } = cargoAdd(account.user.inventory.resources, resourceId, wanted, cargoCap);
          if (added > 0) {
            account.user.inventory.resources[resourceId] = Math.max(0, Number(account.user.inventory.resources[resourceId]) || 0) + added;
            parts.push(`+${formatInteger(added)} ${getResourceName(resourceId, added)}`);
            goldTerms.push(formatInteger(added));
            changed = true;
            granted = true;
          }
          if (blocked > 0) remainder[resourceId] = (remainder[resourceId] || 0) + blocked;
        }
        if (!granted) {
          parts.push("Soute pleine — vendez ou raffinez vos minerais");
          changed = true;
          cargoKept = true;
          cargoRefused = true;
          delete c.oreRemainder;
        } else if (Object.keys(remainder).length) {
          c.oreRemainder = remainder;
          c.cargoTaken = true;
          cargoKept = true;
        } else {
          delete c.oreRemainder;
          c.cargoTaken = true;
        }
      }
    }
  }

  // Box 100 % minerai (ex : rocher Palladium) pleine -> refus : la box reste.
  if (oreBlockedAny && !grantedAny && !cargoKept) {
    parts.push("Soute pleine — vendez ou raffinez vos minerais");
    changed = true;
    cargoKept = true;
    cargoRefused = true;
  }

  const hpFlat = Math.floor(rollValue(reward.hp, 0) * salvageMult);
  if (hpFlat > 0) {
    player.hp = Math.min(player.hpMax, player.hp + hpFlat);
    parts.push(`+${hpFlat} HP`);
    changed = true;
  }

  const hpPct = Number(reward.hpPct || 0);
  if (hpPct > 0) {
    const amount = Math.floor(player.hpMax * hpPct * salvageMult);
    player.hp = Math.min(player.hpMax, player.hp + amount);
    parts.push(`+${amount} HP`);
    changed = true;
  }

  const shFlat = Math.floor(rollValue(reward.shield ?? reward.sh, 0) * salvageMult);
  if (shFlat > 0) {
    player.sh = Math.min(player.shMax, player.sh + shFlat);
    parts.push(`+${shFlat} bouclier`);
    changed = true;
  }

  const shPct = Number(reward.shieldPct ?? reward.shPct ?? 0);
  if (shPct > 0) {
    const amount = Math.floor(player.shMax * shPct * salvageMult);
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

  if (!cargoRefused) advanceQuestProgress("collect", c.type);

  // Raffinage : auto dès qu'une recette est faisable, puis temps réel à chaque collecte.
  maybeRefineryAuto();
  if (ui.refineryWindow && ui.refineryWindow.style.display !== "none" && !ui.refineryWindow.classList.contains("gameWinMinimized")) {
    renderRefineryWindow();
  }

  if (parts.length) {
    const receivedMessages = parts.map(part => part.startsWith("+") ? `Vous avez reçu ${part.replace(/^\+/, "")}` : part);
    addGameLog(receivedMessages.join(" · "), "reward");
    showNotificationGroup(receivedMessages, "reward", { goldTerms });
  } else {
    showToast(cfg.name || "Collectable", 1.0);
  }

  return { kept: cargoKept };
}

document.addEventListener("click", event => {
  if (event.target.closest?.('[data-window-id="questWindow"]')) {
    setTimeout(renderQuestWindow, 0);
  }
});

function tickCollectables(dt) {
  if (!started || player.dead) return;
  if (COLLECTABLE_CFG.enabled === false) return;

  // Monde continu : init paresseuse (première frame sur la map) puis
  // réconciliation périodique des slots (respawns dus via horloge monde).
  const curMap = currentMapId();
  if (collectablesWorldMap !== curMap) {
    collectablesWorldMap = curMap;
    try { initCollectableWorld(curMap); } catch {}
  }

  collectableSpawnT -= dt;

  if (collectableSpawnT <= 0) {
    collectableSpawnT = Math.max(0.1, Number(COLLECTABLE_CFG.interval || 1.0));

    try {
      const now = worldClock.now();
      const liveUids = new Set();
      for (const c of collectables) {
        if (c && c.slotUid && String(c.map || curMap) === curMap) liveUids.add(String(c.slotUid));
      }
      let spawned = 0;
      const spawnCap = Math.max(1, Number(COLLECTABLE_CFG.spawnBatch ?? 5));
      // Respawn aléatoire des slots dus (nouvelle position à chaque fois).
      for (const slot of dueCollectableSlots(collectableStore, curMap, now)) {
        if (spawned >= spawnCap) break;
        if (!slot || liveUids.has(String(slot.uid))) continue;
        respawnAmbientSlot(slot, curMap);
        liveUids.add(String(slot.uid));
        spawned++;
      }
      // Filet de sécurité : slot vivant sans instance.
      for (const slot of listCollectableSlots(collectableStore, curMap)) {
        if (!slot || slot.alive === false || liveUids.has(String(slot.uid))) continue;
        if (spawned >= spawnCap) break;
        pushAmbientCollectableInstance(slot, curMap);
        liveUids.add(String(slot.uid));
        spawned++;
      }
      if (spawned) persistCollectables();
    } catch {}
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

  // Monde continu : l'enregistrement du drop expire avec l'instance.
  if (c.dropUid) {
    try {
      removeCollectableDrop(collectableStore, String(c.map || currentMapId()), String(c.dropUid));
      persistCollectables();
    } catch {}
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
        const autoRes = applyCollectableReward(c);
        if (!autoRes?.kept) {
          takeCollectableInstance(c);
          collectables.splice(i, 1);
        }
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
      const collectRes = applyCollectableReward(c);

      collectableTargetId = null;
      if (!collectRes?.kept) {
        takeCollectableInstance(c);
        collectables.splice(i, 1);
      }
    }
  }
}

function drawCollectBeam(c, ox, oy) {
  if (!c) return;
  // Faisceau du P.E.T vers sa box (même visuel que le joueur).
  const isPetBox = petState.fetchId === c.id && (petState.fetchHold || 0) > 0;
  const isPlayerBox = collectableTargetId === c.id && c.armed === true;
  if (!isPetBox && !isPlayerBox) return;

  const hold = Math.max(0.001, Number(COLLECTABLE_PICKUP.holdDuration || 0.2));
  const p = clamp(((isPetBox ? petState.fetchHold : c.collectT) || 0) / hold, 0, 1);

  // visible uniquement pendant la phase de collecte
  if (p <= 0) return;

  const shipX = (isPetBox ? petState.x : player.x) + ox;
  const shipY = (isPetBox ? petState.y : player.y) + oy;

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

// Silhouettes colorées (clé libre, ex type:frame) pour un contour qui suit
// la sprite. Cache 24 max. Dessinées avant la sprite, qui passe par-dessus.
const petLocatorOutlines = new Map();

function outlineSilhouette(cacheKey, img, w, h, color) {
  const key = `${color}:${cacheKey}`;
  let entry = petLocatorOutlines.get(key);
  if (!entry) {
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.ceil(w));
    canvas.height = Math.max(1, Math.ceil(h));
    const g = canvas.getContext("2d");
    g.imageSmoothingEnabled = false;
    g.drawImage(img, 0, 0, canvas.width, canvas.height);
    g.globalCompositeOperation = "source-in";
    g.fillStyle = color;
    g.fillRect(0, 0, canvas.width, canvas.height);
    entry = canvas;
    petLocatorOutlines.set(key, entry);
    if (petLocatorOutlines.size > 48) petLocatorOutlines.delete(petLocatorOutlines.keys().next().value);
  }
  return entry;
}

// Contour pulsé centré sur l'origine (contexte translaté : NPC, joueur).
function strokeOutlineCentered(sil, w, h, color, alpha) {
  ctx.save();
  ctx.globalAlpha = Math.max(0.3, Math.min(1, alpha));
  ctx.shadowColor = color;
  ctx.shadowBlur = 12;
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    ctx.drawImage(sil, -w / 2 + Math.cos(a) * 2, -h / 2 + Math.sin(a) * 2, w, h);
  }
  ctx.restore();
}

function petLocatorPulse() {
  return 0.75 + Math.sin(performance.now() / 1000 * 5) * 0.2;
}
function drawPetLocator(ox, oy) {
  const pet = account.user?.pet;
  if (!pet?.owned || pet?.active !== true || !petState.ready || player.dead || !started) return;
  if (!(Number(pet.hp) > 0)) return;
  if (petLocator.enemyId == null) return;
  const foe = enemiesById.get(petLocator.enemyId);
  if (!foe || !(foe.hp > 0)) return;
  const sx = foe.x + ox, sy = foe.y + oy;
  if (sx < -260 || sy < -260 || sx > innerWidth + 260 || sy > innerHeight + 260) return;
  const t = performance.now() / 1000;
  const pulse = 0.75 + Math.sin(t * 5) * 0.2;
  const cfg = NPC_TYPES[foe.type];
  const sp = cfg ? cfg.sprite : null;
  if (sp && sp._imgs && sp._imgs.length && sp._ready) {
    const idx = getEnemySpriteFrame(foe, cfg, sp);
    const img = sp._imgs[idx] || sp._imgs[0];
    if (isImgReady(img)) {
      const baseW = sp.w ?? sp.size ?? 160;
      const baseH = sp.h ?? sp.size ?? 160;
      const w = foe.isBoss ? baseW * 1.05 : baseW;
      const h = foe.isBoss ? baseH * 1.05 : baseH;
      // Contour jaune qui suit la sprite (silhouette derrière, pulsée).
      // Dessiné avant : la sprite du NPC passe par-dessus.
      const outline = outlineSilhouette(`pet:${foe.type}:${idx}`, img, w, h, "#ffe14d");
      ctx.save();
      ctx.globalAlpha = Math.max(0.3, Math.min(1, pulse));
      ctx.shadowColor = "rgba(255,225,77,0.9)";
      ctx.shadowBlur = 12;
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        ctx.drawImage(outline, sx - w / 2 + Math.cos(a) * 2, sy - h / 2 + Math.sin(a) * 2, w, h);
      }
      ctx.restore();
      return;
    }
  }
  // Repli : anneau + halo si la sprite n'est pas prête.
  ctx.save();
  ctx.strokeStyle = "rgba(255,225,77,0.9)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(sx, sy, Math.max(8, ((foe.r || 30) + 12) * pulse), 0, TAU);
  ctx.stroke();
  ctx.restore();
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
// Faux tirs de transition lors d'un switch de cible en plein combat :
// purement visuels (dmg 0, sans son, sans conso de munition), ils couvrent
// le cooldown conservé jusqu'au vrai tir pour qu'il n'y ait jamais de
// "trou" sans laser. Le débit de dégâts reste cadencé par fireCooldown.
function scheduleSwitchDecoys(target) {
  try {
    if (!target || Number(target.hp) <= 0) return;
    if (player.dead || !started) return;
    if (pendingSalvo.length > 0) return; // un stream est déjà en vol
    const ammoKey = player.ammo.active || "x1";
    if (isRsbLike(ammoKey)) return; // X6/RCB : on ne touche pas à leur rythme
    const cd = Number(fireCooldown) || 0;
    if (!(cd > 0)) return; // cooldown écoulé : le vrai tir suit aussitôt
    const d2 = dist2(player.x, player.y, target.x, target.y);
    if (d2 > playerRange * playerRange) return;
    const dist = Math.sqrt(d2);
    const speed = (player.baseBulletSpeed + dist * BASE_RUN.bulletSpeedDistGain)
      * (ammoKey === "sab" ? SAB50.bulletSpeedMult : 1);
    const life = bulletLifeForRange(playerRange, speed);
    const isSabLike = ammoKey === "sab" || ammoKey === "cbo";
    const volleySize = player.altShot ? 2 : 1;
    const volleyId = volleySeq++;
    const isRealPair = !!player.altShot && ammoKey !== "sab";
    const pairItems = [[-SIDE_OFFSET, 0], [SIDE_OFFSET, 0]];
    const singleItems = [[0, 0]];
    // But : on couvre exactement l'attente restante (1 faux tir / 0,2 s).
    const interval = 0.2;
    const n = Math.max(1, Math.min(15, Math.ceil(cd / interval)));
    const params = { targetId: target.id, speed, life, volleyId, volleySize: isSabLike ? 1 : volleySize, sabReverse: isSabLike };
    for (let i = 1; i <= n; i++) {
      const fakeIsPair = !isSabLike && (isRealPair ? i % 2 === 0 : i % 2 === 1);
      scheduleSalvoPart(i * interval, { ...params, items: fakeIsPair ? pairItems : singleItems });
    }
  } catch {}
}
const Target = (() => {
  let cur = null;

  function set(e) {
    const next = e && e.hp > 0 ? e : null;

    const wasAttacking = (typeof attackActive !== "undefined") && attackActive === true;
    if (next !== cur && wasAttacking) {
      stopAttack();
    }

    // ✅ changement de cible : on ne touche PLUS au cooldown en cours.
    // L'ancien reset (fireCooldown = 0 à chaque switch) offrait une salve
    // réelle immédiate par switch : en oscillant vite entre A et B on
    // contournait la cadence ~1 s et on mitraillait plusieurs NPC en
    // parallèle. Le tir immédiat ne s'applique que si aucun tir vient
    // d'être déclenché (cooldown déjà écoulé). Vaut pour le jeu manuel
    // comme pour le bot (même Target.set).
    if (next !== cur && typeof fireCooldown !== "undefined") {
      if (!(typeof fireCooldown === "number" && fireCooldown > 0)) fireCooldown = 0;
    }

    // ✅ switch en plein combat : des faux tirs partent aussitôt vers la
    // nouvelle cible et couvrent l'attente jusqu'au vrai tir (aucun trou
    // visuel, aucun dégât supplémentaire).
    if (next && next !== cur && wasAttacking) {
      try { scheduleSwitchDecoys(next); } catch {}
    }

    cur = next;
  }

  function clear() {
    cur = null;
  }

  function get() {
    if (!cur) return null;
    // Notre REX : lock valide tant qu'il est en jeu et en vie.
    if (cur.isPetTarget) {
      if (!petLockValid()) {
        cur = null;
        return null;
      }
      return cur;
    }
    if (!enemies.includes(cur) || cur.hp <= 0) {
      cur = null;
      return null;
    }
    return cur;
  }

  return { set, clear, get };
})();

// Cible "notre REX" : le joueur peut locker et attaquer son propre P.E.T
// (double-clic comme un NPC). Positions et vie résolues en direct.
const petTargetProxy = {
  id: "pet",
  isPetTarget: true,
  name: "REX",
  type: "pet_rex",
  r: 40,
  vx: 0,
  vy: 0,
  get x() { return petState.x; },
  get y() { return petState.y; },
  get hp() { return Number(account.user?.pet?.hp) || 0; },
  get hpMax() { return petMaxHpWithHeat(account.user?.pet); },
  get shMax() { return petShieldMaxForHud(account.user?.pet, account.user); },
  get sh() {
    const pet = account.user?.pet;
    if (!pet) return 0;
    const max = petShieldMaxForHud(pet, account.user);
    return pet.sh != null && Number.isFinite(Number(pet.sh)) ? Number(pet.sh) : max;
  },
};

function petLockValid() {
  const pet = account.user?.pet;
  return !!pet && pet.owned === true && pet.active === true
    && petState.ready && !player.dead && started && Number(pet.hp) > 0;
}

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

// Nombre de lasers (vaisseau + drones, config active) : 1 minerai chargé par laser et par salve.
function countPlayerLasers() {
  let count = 0;
  for (const m of player.laserMods || []) if (Number(m?.damage || 0) > 0) count++;
  for (const m of player.droneLaserMods || []) if (Number(m?.damage || 0) > 0) count++;
  return Math.max(1, count);
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

  const dmgRes = damagePlayerLayers(player, amount, Number(player.shAbsorb) > 0 ? Number(player.shAbsorb) : 0.8);
  // Lien HP : la part coque part sur le REX, le joueur ne garde que le reste.
  let redirected = 0;
  if (dmgRes.hp > 0) {
    const rest = absorbPetLinkDamage(dmgRes.hp);
    redirected = dmgRes.hp - rest;
    player.hp = Math.min(player.hpMax, player.hp + redirected);
  }

  addPlayerCombatFloat(Math.max(0, Math.round(amount - redirected)), "rgba(255,80,100,0.95)");

  if (player.hp <= 0) {
    player.hp = 0;
    die();
  }
}

// Kamikaze NPC (x-4.1...) : son explosion ralentit le joueur ET son P.E.T
// pendant 3 s (-30 %, sprite SLOW_EFFECT officiel), en plus des dégâts.
const KAMIKAZE_SLOW_SEC = 3;
const KAMIKAZE_SLOW_PCT = 30;

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
  const xpText = `${formatInteger(gainedXp)} XP`;
  const honorText = `${formatInteger(gainedHonor)} honneur`;
  const whiteTerms = [];
  const violetTerms = [];
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

// Drops d'assemblage officiels (NPC/NPC_ASSEMBLY.js).
// - Box à collecter (scrap, mucosum, plasmide, prismatium, aurus, bifenon,
//   tetrathrin, kyhalon) : spawn à côté du cargo.
// - Direct inventaire (rinusk, trace, cerebrum) : sans collecte.
if (!e.noRewards) {
  const asmBox = rollNpcAssemblyBox(e.type);
  if (asmBox && COLLECTABLE_DEFS[asmBox.box]) {
    // Box d'assemblage : reste au sol indéfiniment (comme les bonus box),
    // jamais de despawn comme les cargos.
    spawnCollectableAt(asmBox.box, e.x + 70, e.y - 50, {
      armed: false,
      despawnAfter: 0,
      amount: asmBox.amount,
    });
  }

  const asmDirect = rollNpcAssemblyDirect(e.type);
  if (asmDirect.length) {
    if (!account.user) loadAccountUser();
    if (account.user) {
      account.user.inventory ||= {};
      account.user.inventory.resources ||= {};
      const received = [];
      for (const { resource, qty } of asmDirect) {
        const amount = Math.max(0, Math.floor(Number(qty) || 0));
        if (amount <= 0) continue;
        account.user.inventory.resources[resource] =
          Math.max(0, Number(account.user.inventory.resources[resource]) || 0) + amount;
        received.push(`Vous avez reçu ${formatInteger(amount)} ${getResourceName(resource, amount)}`);
      }
      if (received.length) {
        markProgressDirty();
        addGameLog(received.join(" · "), "reward");
        showNotificationGroup(received, "reward", {});
      }
    }
  }
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

    // Univers persistant : la mort arme un timer mural (instant sauf Cubikon 60s).
    // Changer de map ou refresh ne ressuscite plus en avance, l'horloge decide.
    try {
      const deadUid = e.universeUid || (e.homeCampId != null ? slotUid(currentMapId(), e.homeCampId) : null);
      if (deadUid && isZoneMap) {
        markDead(universe, currentMapId(), deadUid, worldClock.now());
        persistUniverse();
      }
    } catch {}

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
        // ✅ le stock 1/1 éventuel est déjà reposé sur la map par completeActiveGalaxyGate.
        const autoMsg = completion.autoDeployed ? ` — stock replacé sur la map` : "";
        renderGalaxyGateWindow(`${GALAXY_GATE_DEFINITIONS[currentGateId].name} terminée${autoMsg}`);
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
    if (String(cur) !== String(destinationMap)) {
      preloadRespawnMap(destinationMap);
      // ✅ switch interne sans rechargement, fallback reload classique.
      goToMapFast(destinationMap).catch((error) => {
        console.warn("Téléportation impossible :", error);
        window.__GO_TO_MAP__?.(destinationMap);
      });
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
  persistCdUntil("pulse", PULSE_COOLDOWN);
  // IEM (EMP-01) : coupe le lien HP du REX.
  if (hplLinkActive()) endHplLink("emp");
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
  persistCdUntil("ish", ISH_COOLDOWN);
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
    // ✅ réparation unique (gate + carte maudite) : le bouton « base »
    // renvoie à la base mère, sinon respawn de zone classique.
    if (isBaseOnlyRespawnMap()) respawnBaseGate();
    else respawnBase();
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
  return; // Raygun supprimé : ni visuel ni dégâts.
}

function spawnLaser(x, y, ang, targetId) {
  return; // Raygun supprimé : ni visuel ni dégâts.
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
    const fired = tryFireOnce(null, true);
    // Vrai tir encore en cooldown (ex. switch après un kill) : on affiche
    // des faux tirs jusqu'au vrai tir, aucun trou visuel.
    if (!fired) { try { scheduleSwitchDecoys(t); } catch {} }
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
  const firedAmmo = tryFireOnce(null, true);
  if (!firedAmmo) { try { scheduleSwitchDecoys(t); } catch {} }
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

  // Tir réel : toute attaque casse le camouflage ultime.
  breakPoliceCloak();
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
  // Boosters dégâts : tous les dégâts infligés (officiel), roquettes comprises.
  const rocketBoosterMults = playerBoosterMults();
  const dmg = (rocket?.damage ?? 1000)
    * (1 + Number(getActiveDroneFormation(account.user).effects?.npcDamagePct || 0) / 100)
    * rocketBoosterMults.dmg * playerUpgradeMults().rocket
    * (isLeonovHomeActive() ? 2.5 : 1);
  consumeUpgradeStock("rocket");
  const shotMiss = typeof miss === "boolean"
    ? miss
    : Math.random() < Math.max(0, PLAYER_SHOTS.missChance - ((Number(player.laserHitBonusPct || 0) + Number(rocketBoosterMults.hit || 0)) / 100));
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

  // Salve réelle : toute attaque casse le camouflage ultime.
  breakPoliceCloak();
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
  if (id === "pet") return petLockValid() ? petTargetProxy : null;
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
    const opts = { size: v.isCrit ? 25 : 21, pop: 0.3, shake: 0.6, life: 1, glow: v.isCrit ? 1.6 : 1, weight: 900, impact: true };
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
    size: v.isCrit ? 25 : 21,
    pop: 0.3,
    shake: 0.6,
    life: 1,
    glow: v.isCrit ? 1.6 : 1.0,
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

  // Tir réel : toute attaque casse le camouflage ultime.
  breakPoliceCloak();
  playPlayerShot(ammoKey);

  const activeKey = player.ammo.active || "x1";
  if (ammoKey === activeKey) consumeAmmo(countPlayerLasers());

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
consumeUpgradeStock("laser", countPlayerLasers());
// Bonus par canon x nombre équipé : vaisseau + drones.
// 1x PR-L = +200, 2x = +400, 35x = +7000 tous les 5 tirs.
// Idem vsMatch (LF-3, AA-1, PR-L Blacklight...) et U-LF4 instable.
let laserBase = player.baseDamage + laserFitVsExtra(player.laserMods, t, player.droneLaserMods);
laserBase += laserFitUnstableDelta(player.laserMods, player.droneLaserMods);
const overdrive = laserFitOverdrive(player.laserMods, player.droneLaserMods, player.volleyCount);
// Boosters : dégâts globaux + précision laser.
const shotBoosterMults = playerBoosterMults();
const shotHitBonusPct = Number(player.laserHitBonusPct || 0) + Number(shotBoosterMults.hit || 0);
  const dmgShot = isSab
    ? player.baseDamage * SAB50.drainMult * shotBoosterMults.dmg
    : (laserBase + overdrive) * mult * (1 + Number(getActiveDroneFormation(account.user).effects?.npcDamagePct || 0) / 100) * shotBoosterMults.dmg * playerUpgradeMults().laser * buoyDamageMult();

  const shotMiss = Math.random() < Math.max(0, PLAYER_SHOTS.missChance - (shotHitBonusPct / 100));

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

  // ðŸ”« salve : le vrai tir compte pour le premier éclair affiché (t=0).
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
  if (/^4-[123]$/.test(mapId) || mapId === "4-4" || mapId === "4-5") return false;
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

// ZNA projetée par un module sûr (ex : contrôleur de missions sur les
// maps x-4 / x-5 via `safeRadius`). Contrairement aux bases CENTRE_*,
// elle est neutre : elle profite à toutes les factions car les
// contrôleurs de missions sont accessibles à tout le monde.
function getSafeModuleAt(x, y) {
  if (!isZoneMap) return null;
  for (const module of zoneSafe?.modules || []) {
    const radius = Number(module?.safeRadius || 0);
    if (!(radius > 0)) continue;
    if (dist2(x, y, module.x, module.y) <= radius * radius) return module;
  }
  return null;
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

  if (getSafeModuleAt(e.x, e.y)) return true;

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
  // ✅ précharge la base mère dès la fin de vague : le portail « retour »
  // bascule en interne sans écran de chargement.
  try { preloadRespawnMap(getGateReturnMap()); } catch {}

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
      // Univers persistant : un slot mort avant son respawnAt ne respawn pas,
      // meme si le joueur change de map / refresh / meurt. L'horloge decide.
      // Mort -> respawn RANDOM instant (sauf Cubikon : au camp).
      // Vivant connu -> position + HP persistés (retrouvé où laissé).
      const uid = slotUid(curMap, camp.id);
      let slot = null;
      try {
        slot = getSlot(universe, curMap, uid);
      } catch { slot = null; }
      const isCubikon = camp.type === "npc_Cubikon";
      if (slot && slot.alive === false) {
        if (!worldClock.isDue(slot.respawnAtMs)) {
          camp.t = 1;
          continue;
        }
        try { markAlive(universe, curMap, uid, worldClock.now()); } catch {}
      }
      const scatter = !isCubikon && (!slot || slot.scattered === false);
      let x = 0, y = 0;

      if (isCubikon) {
  x = camp.x;
  y = camp.y;
} else if (!scatter && slot && slot.alive !== false && slot.updatedAtMs > 0 && Number.isFinite(Number(slot.x))) {
  // NPC connu blesse/deplace : on le retrouve la ou on l'a laisse,
  // pas a l'autre bout de la carte (derive de fond bornee entre-temps).
  x = clamp(Number(slot.x), 80, WORLD.w - 80);
  y = clamp(Number(slot.y), 80, WORLD.h - 80);
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
        e.universeUid = uid;

        e.wanderMode = true;
        e.aggroRange = camp.aggroRange ?? 700;
        e.aggroHold = camp.aggroHold ?? 3.5;

        // Respawn random : fige la nouvelle position (full life).
        if (scatter && slot) {
          try {
            snapshotUniverseEnemy(universe, curMap, uid, { x, y, hpPct: 1, shPct: 1 }, worldClock.now());
            slot.scattered = true;
          } catch {}
        }

        // Restaure le NPC blesse : meme HP que quand on l'a quitte.
        if (!scatter && slot && slot.alive !== false && slot.updatedAtMs > 0) {
          if (Number.isFinite(Number(slot.hpPct)) && e.hpMax > 0) {
            e.hp = Math.max(1, Math.floor(e.hpMax * Math.max(0, Math.min(1, Number(slot.hpPct)))));
          }
          if (Number.isFinite(Number(slot.shPct)) && e.shMax > 0) {
            e.sh = Math.max(0, Math.floor(e.shMax * Math.max(0, Math.min(1, Number(slot.shPct)))));
          }
        }

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
collectablesWorldMap = null;
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
  // ðŸ”¥ fin du cold start : le cooldown réparateur repart désormais normalement
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
    const freshCamps = (preparedZoneCamps || rules.getZoneSpawns(WORLD)).map((c, idx) => ({
      id: idx + 1,
      ...c,
      t: 0,
    }));
    // Univers persistant : apres la premiere generation, l'univers est
    // l'autorite (identite stable). Les defs fraiches (ordre random) ne
    // servent qu'au reglage (aggro, radius...) et aux nouveaux slots.
    // Sans ca, un Kristallon tape changeait de slot a chaque saut.
    try {
      const mapId = String(window.__CURRENT_MAP_ID__ || "1-1");
      const stored = universe?.maps?.[mapId];
      if (Array.isArray(stored) && stored.length > 0) {
        const tuningByType = new Map();
        for (const c of freshCamps) {
          if (!tuningByType.has(String(c.type))) tuningByType.set(String(c.type), c);
        }
        zoneCamps = stored.slice(0, 220).map((s, idx) => {
          const tuning = tuningByType.get(String(s.type)) || freshCamps[idx] || freshCamps[0] || {};
          return {
            id: idx + 1,
            type: String(s.type),
            x: Number(s.homeX),
            y: Number(s.homeY),
            radius: tuning.radius ?? 350,
            respawn: tuning.respawn ?? 1.5,
            maxAlive: tuning.maxAlive ?? 1,
            aggroRange: tuning.aggroRange ?? 700,
            leashRange: tuning.leashRange ?? 1700,
            aggroHold: tuning.aggroHold ?? 4,
            t: 0,
          };
        });
        // La def a grandi (nouveau quota) : ajoute les slots manquants.
        if (freshCamps.length > zoneCamps.length) {
          for (let k = zoneCamps.length; k < freshCamps.length; k++) {
            zoneCamps.push({ ...freshCamps[k], id: k + 1, t: 0 });
          }
        }
      } else {
        zoneCamps = freshCamps;
      }
      ensureMapSlots(universe, mapId, zoneCamps, worldClock.now());
      tickBackground(universe, worldClock.now(), { skipMapId: mapId });
      persistUniverse({ force: false });
    } catch {
      zoneCamps = freshCamps;
    }
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
      const spawnXY = clampSpawnPos(Number(position.x) || fallbackSpawn.x, Number(position.y) || fallbackSpawn.y);
      player.x = spawnXY.x;
      player.y = spawnXY.y;
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
    // Le point est requis : maps 4-1 / 4-2 / 4-3 / 4-4 + portails p_..._to_....
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
    // ✅ Arrivée via un saut de Galaxy Gate (entrée comme retour base) :
    // mêmes sons que les portails de zone.
    let gateJumpArrived = false;
    try {
      gateJumpArrived = sessionStorage.getItem("orbit_gate_jump") === "1";
      if (gateJumpArrived) sessionStorage.removeItem("orbit_gate_jump");
    } catch {}
    if (gateJumpArrived && !spawnedFromPortal) {
      window.setTimeout(() => {
        SFX.stop("swJump");
        SFX.stop("swReady");
        SFX.play("swDone");
      }, 400);
    }
  }

  // ✅ Consomme le spawn "portail" : il ne vaut que pour le saut en cours.
  // Les valeurs ont déjà été lues ci-dessus (wantPortal/urlPortal) et chaque
  // transition réécrit des valeurs fraîches avant le prochain resetRun.
  // Sans ça, l'URL garde ?spawn=... et un refresh (F5) refait apparaître
  // le joueur au portail au lieu de sa position sauvegardée.
  try {
    window.__SPAWN_PORTAL_ID__ = null;
    const spawnUrl = new URL(location.href);
    if (spawnUrl.searchParams.has("spawn")) {
      spawnUrl.searchParams.delete("spawn");
      history.replaceState(history.state ?? null, "", spawnUrl);
    }
  } catch {}

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
        const savedXY = clampSpawnPos(st.pos.x, st.pos.y);
        player.x = savedXY.x;
        player.y = savedXY.y;
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

  // ✅ Arrivée via un portail : le saut nettoie le combat (façon DO officiel).
  // Sans ça, combatT (> 0 jusqu'à 5 s) bloquait safeZoneActive et le joueur
  // qui spawnait au centre d'un portail sûr n'était pas mis directement
  // en zone de non-agression (pas de toast, NPC toujours aggros, tirs reçus).
  if (spawnedFromPortal) {
    player.combatT = 0;
    player.attackedT = 0;
    player.pvpAttackT = 0;
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

  // ✅ refresh en radiation : on reprend l'exposition déjà écoulée au lieu
  // de relancer les 5 s de grâce (anti-abus boucle refresh).
  restorePersistedRadiationExposure();

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
  // Mort = aptitude coupée : la recharge du camouflage démarre.
  if ((player.cloakT || 0) > 0) {
    player.cloakT = 0;
    startPoliceCloakCooldown();
  }
  player.vx = player.vy = 0;
  radiationSoundDelay = 0;
  triggerDeathShake();

  // Coupe immédiatement l'effet de radiation (son, glow rouge + texte pulsé) à la mort.
  radiationSystem.reset();
  clearPersistedRadiationExposure();
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

  // ✅ explosion facon NPC sur le joueur.
  spawnExplosion(player.x, player.y, 1.0);

  // ✅ epave du joueur : cargo box de 1 prometium a l'endroit de la mort.
  spawnCollectableAt("Cargo_Box", player.x, player.y, {
    armed: false,
    fromNpc: null,
    despawnAfter: 300,
    rewardOverride: { resources: {} },
    oreRemainder: { prometium: 1 },
  });

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

  // ✅ les bases mères sont déjà chargées au boot : rien à précharger ici.

  if (rules?.mode === "gate") {
    // ✅ en Galaxy Gate on ne renvoie plus direct à la base mère :
    // on affiche la fenêtre de réparation (seul choix = base), le joueur
    // clique pour valider le retour.
    setCenterMsg(false);
    startDeathSequence();
    return;
  }

  if (isZoneMap) {
    startDeathSequence();
    return;
  }

  respawnBase();
}

// ✅ Portails annexes (par destination) : jamais utilisés pour une
// réapparition au portail — low, QZ, Galaxy Gates (aussi celles des X-1),
// map maudite et 5-2 (portail central de 4-5).
const ANNEX_PORTAL_MAPS = new Set(["low", "qz", "alpha", "beta", "gamma", "maudite", "5-2"]);

function isAnnexPortal(portal) {
  return ANNEX_PORTAL_MAPS.has(String(portal?.toMap || "").trim().toLowerCase());
}

function getNearestPortalTo(x, y, { excludeAnnex = false } = {}) {
  if (!zonePortals || !zonePortals.length) return null;
  let best = null;
  let bestD2 = Infinity;
  for (const p of zonePortals) {
    if (excludeAnnex && isAnnexPortal(p)) continue;
    const d2 = dist2(x, y, p.x, p.y);
    if (d2 < bestD2) {
      bestD2 = d2;
      best = p;
    }
  }
  return best;
}

// ✅ Précharge une map mère (ou respawn) sans bloquer : remplit le cache
// __PRELOAD_MAP__ pour que le switch interne soit instantané.
function preloadRespawnMap(mapId) {
  try {
    const normalized = String(mapId || "").trim();
    if (!normalized) return;
    Promise.resolve(window.__PRELOAD_MAP__?.(normalized)).catch((error) => {
      console.warn("Préchargement de la map de réapparition incomplet :", error);
    });
  } catch {}
}

// ✅ Précharge les maps mères de la firme (base basse + base haute) en tâche
// de fond : au moment de « Réparée à la base », elles sont déjà en cache.
function preloadHomeMaps() {
  try {
    const faction = (account.user || getCurrentUserFull())?.faction;
    const maps = new Set([
      getFactionHomeMap(faction),
      getFactionUpperBaseMap(faction),
    ]);
    for (const mapId of maps) {
      if (mapId) preloadRespawnMap(mapId);
    }
  } catch {}
}

// ✅ Précharge tous les sprites de drones (iris / apis / zeus, tous niveaux,
// toutes frames) : évite les décalages visuels aux premiers virages.
function collectDroneSpriteJobs(background = false) {
  const jobs = [];
  try {
    for (const type of Object.values(DRONE_TYPES)) {
      if (!type?.path) continue;
      for (let level = 0; level < DRONE_MAX_LEVEL; level++) {
        for (let frame = 1; frame <= 32; frame++) {
          jobs.push(loadImage(`${type.path}${level}/${frame}.png`, { priority: !background }));
        }
      }
    }
  } catch {}
  return jobs;
}

let droneSpritesPreloaded = false;
function preloadAllDroneSprites() {
  if (droneSpritesPreloaded) return;
  droneSpritesPreloaded = true;
  try {
    Promise.allSettled(collectDroneSpriteJobs(true)).then(() => true);
  } catch {}
}

// ✅ Assets des 2 bases mères de la firme (X-1 + X-8) : chargés au boot pour
// une « Réparée à la base » instantanée, sans préchargement à la mort.
async function collectHomeBaseJobs() {
  const jobs = [];
  try {
    const faction = (account.user || getCurrentUserFull())?.faction;
    const ids = [getFactionHomeMap(faction), getFactionUpperBaseMap(faction)];
    for (const id of ids) {
      if (!id) continue;
      try {
        const [spawnsMod, worldMod] = await Promise.all([
          import(`../../MAPS/${id}/SPAWNS.js`),
          import(`../../MAPS/${id}/WORLD.js`),
        ]);
        const world = worldMod?.WORLD;
        if (!world) continue;
        const rules = {
          mode: "zone",
          getZoneSpawns: spawnsMod?.getZoneSpawns,
          getZonePortals: spawnsMod?.getZonePortals,
          getZoneSafeModules: spawnsMod?.getZoneSafeModules,
        };
        jobs.push(...preloadCollectables(id));
        jobs.push(...preloadSafeModuleSprites(rules, world));
        for (const camp of (rules.getZoneSpawns?.(world) || [])) {
          if (camp?.type && NPC_TYPES[camp.type]) jobs.push(ensureNpcLoaded(camp.type));
        }
        for (const targetPortal of (rules.getZonePortals?.(world) || [])) {
          jobs.push(...preloadPortalSprites(targetPortal));
        }
      } catch (error) {
        console.warn("Préchargement base incomplet:", id, error);
      }
    }
  } catch {}
  return jobs;
}

// ✅ Changement de map sans rechargement de page quand c'est possible :
// tente le switch interne (__SWITCH_MAP__), sinon retombe sur __GO_TO_MAP__
// (rechargement complet avec écran de chargement).
async function goToMapFast(targetMap, spawnId = null) {
  const cur = window.__CURRENT_MAP_ID__ || "1-1";
  if (String(cur) === String(targetMap) && !spawnId) return "same";
  if (typeof window.__SWITCH_MAP__ === "function") {
    try {
      await window.__SWITCH_MAP__(targetMap, spawnId);
      return "switched";
    } catch (error) {
      console.warn("Changement interne impossible, rechargement :", error);
    }
  }
  if (typeof window.__GO_TO_MAP__ === "function") {
    window.__GO_TO_MAP__(targetMap, spawnId);
    return "reloaded";
  }
  return "failed";
}

function respawnBaseGate() {
  // ✅ base haute (X-8) pour les maps marquées respawnBase upper (maudite, QZ),
  // sinon logique standard (gate → base mère).
  const faction = (account.user || getCurrentUserFull())?.faction;
  const targetMap = rules?.respawnBase === "upper"
    ? getFactionUpperBaseMap(faction)
    : getFactionRespawnMap(faction, window.__CURRENT_MAP_ID__, { gate: true });
  const baseSpawn = getFactionBaseSpawn((account.user || getCurrentUserFull())?.faction);
  setRespawnOverride({ map: targetMap, baseCenter: true, fallback: baseSpawn, respawn: true });
  preloadRespawnMap(targetMap);
  // ✅ passe par startRespawn comme la zone : masque la fenêtre de réparation,
  // joue le son, puis bascule en interne vers la base mère.
  startRespawn(async () => {
    const cur = window.__CURRENT_MAP_ID__ || "1-1";

    if (String(cur) !== String(targetMap)) {
      // ✅ switch interne sans écran de chargement ; fallback = reload classique.
      const result = await goToMapFast(targetMap);
      if (result === "switched" || result === "same") startRespawnInstaShield();
      return;
    }

    resetRun({ randomSpawn: false });
  });
}

// À la réapparition choisie, le menu et le voile noir disparaissent instantanément,
// le son de réapparition joue, puis le respawn s'enchaîne directement.
function startRespawn(action) {
  // ✅ ignore les déclenchements multiples (double-clic, clics répétés
  // pendant le switch) : sinon sons en double et deux changements de map
  // concurrents qui se marchent dessus.
  if (respawnRunning) return;
  respawnRunning = true;
  clearDeathPending();
  SFX.resume();
  SFX.stop("deathPlayer");
  SFX.stop("deathPlayer2");
  SFX.play("respawnPlayer");
  if (toast?.fixed && toast.text === "Vous êtes en zone de radiations") toast = null;
  showRespawnOverlay(false);
  setCenterMsg(false);
  try {
    const result = action();
    if (result && typeof result.catch === "function") {
      result
        .catch((error) => console.warn("Réapparition impossible :", error))
        .finally(() => { respawnRunning = false; });
    } else {
      respawnRunning = false;
    }
  } catch (error) {
    console.warn("Réapparition impossible :", error);
    respawnRunning = false;
  }
  startRespawnInstaShield();
  // ✅ le portail reste bloqué 5 s à partir du moment où le vaisseau réapparaît vraiment
  player.portalLockT = Math.max(player.portalLockT || 0, 5);
}

function respawnBase() {
  // ✅ base haute (X-8) pour les maps marquées respawnBase upper (maudite),
  // sinon logique standard (zones basses → X-1, zones hautes → X-8).
  const faction = (account.user || getCurrentUserFull())?.faction;
  const targetMap = rules?.respawnBase === "upper"
    ? getFactionUpperBaseMap(faction)
    : getFactionRespawnMap(faction, lastDeathPos.map || window.__CURRENT_MAP_ID__);
  const baseSpawn = getFactionBaseSpawn((account.user || getCurrentUserFull())?.faction);
  setRespawnOverride({ map: targetMap, baseCenter: true, fallback: baseSpawn, respawn: true });
  // ✅ la destination est déjà préchargée (mort + boot) : le switch est immédiat.
  preloadRespawnMap(targetMap);
  startRespawn(async () => {
    const cur = window.__CURRENT_MAP_ID__ || "1-1";
    if (String(cur) !== String(targetMap)) {
      // ✅ plus de rechargement complet du jeu : bascule interne,
      // avec rechargement classique uniquement en secours.
      const result = await goToMapFast(targetMap);
      if (result === "switched" || result === "same") startRespawnInstaShield();
      return;
    }

    resetRun({ randomSpawn: false });
  });
}

function respawnNearestPortal() {
  // ✅ réparation unique : seul le retour base est autorisé.
  if (isBaseOnlyRespawnMap()) {
    respawnBaseGate();
    return;
  }
  const portalCd = getRespawnCdLeft("portal");
  if (portalCd > 0) {
    showToast(`Portail en recharge (${formatCdLeft(portalCd)})`, 1.4);
    refreshRespawnShop();
    return;
  }
  const curMap = window.__CURRENT_MAP_ID__ || "1-1";
  // ✅ portails annexes exclus (low, QZ, GG/gates X-1, maudite, 5-2) :
  // on réapparaît au portail normal le plus proche, sinon repli base.
  const p = getNearestPortalTo(lastDeathPos.x, lastDeathPos.y, { excludeAnnex: true });
  if (!p) {
    // ✅ pas de portail sur la carte : repli gratuit vers la base.
    respawnBase();
    return;
  }
  if (!chargeRespawnCost(RESPAWN_PORTAL_COST, "Portail")) return;

  setRespawnCd("portal", Date.now() + RESPAWN_PORTAL_CD_SEC * 1000);
  setRespawnOverride({ map: curMap, x: p.x, y: p.y, respawn: true });
  startRespawn(() => {
    resetRun({ randomSpawn: false });
  });
}

function respawnHere() {
  // ✅ réparation unique : seul le retour base est autorisé.
  if (isBaseOnlyRespawnMap()) {
    respawnBaseGate();
    return;
  }
  const hereCd = getRespawnCdLeft("here");
  if (hereCd > 0) {
    showToast(`Sur place en recharge (${formatCdLeft(hereCd)})`, 1.4);
    refreshRespawnShop();
    return;
  }
  if (!chargeRespawnCost(RESPAWN_HERE_COST, "Sur place")) return;
  const curMap = window.__CURRENT_MAP_ID__ || "1-1";

  setRespawnCd("here", Date.now() + RESPAWN_HERE_CD_SEC * 1000);

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
  if (isBaseOnlyRespawnMap()) {
    respawnBaseGate();
    setCenterMsg(false);
    // ✅ en gate on garde la progression ; sur la maudite on est éjecté vers la base.
    showToast(rules?.mode === "gate" ? "Retour à la base mère" : "Éjecté vers la base mère", 1.6);
    return;
  }
  if (isZoneMap) {
    respawnBase();
    return;
  }

  respawnBaseGate();
  setCenterMsg(false);
  // ✅ en gate on retourne à la base mère en gardant la progression (pas une run neuve).
  showToast("Retour à la base mère", 1.6);
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
  // Rendu en pixels CSS (bitmap = CSS × DPR, voir applyMinimapProportions) :
  // net à toutes les tailles, même après +.
  const cssW = mini.clientWidth || 0;
  const cssH = mini.clientHeight || 0;
  const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  const useCss = cssW > 0 && cssH > 0;
  mctx.setTransform(useCss ? dpr : 1, 0, 0, useCss ? dpr : 1, 0, 0);
  const petAccount = account.user?.pet;
  const isPetActive = !!petAccount?.owned && petAccount?.active === true && !player.dead && Number(petAccount.hp) > 0;
  // Marqueur du localisateur P.E.T (G-EL), résolu en direct.
  const petLocatorMarkers = [];
  if (isPetActive && petLocator.enemyId != null) {
    const foe = enemiesById.get(petLocator.enemyId);
    if (foe && foe.hp > 0) petLocatorMarkers.push({ x: foe.x, y: foe.y, color: "#ffe14d", pulse: true });
  }
  renderMinimap(mctx, {
    width: useCss ? cssW : mini.width,
    height: useCss ? cssH : mini.height,
    world: WORLD,
    player,
    enemies,
    allies: escortShips,
    markers: petLocatorMarkers,
    pet: isPetActive
      ? {
          active: true,
          x: petState.ready ? petState.x : player.x - 90,
          y: petState.ready ? petState.y : player.y + 70,
        }
      : null,
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
  // Leonov sur ses maps natives (boosts) : contour turquoise de base.
  if (isLeonovHomeActive()) {
    const sil = outlineSilhouette(`ship:${pack?.id || "player"}:${idx}`, img, w, h, "#5ff2ff");
    strokeOutlineCentered(sil, w, h, "#5ff2ff", petLocatorPulse());
  }
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

// Contour d'un NPC (Ubers en rouge) : silhouette derrière la sprite.
function drawEnemyContour(e, cfg, exactFrame, color) {
  const sp = cfg?.sprite;
  if (!sp || !sp._imgs || !sp._imgs.length || !sp._ready) return;
  const idx = exactFrame ?? getEnemySpriteFrame(e, cfg, sp);
  const img = sp._imgs[idx] || sp._imgs[0];
  if (!isImgReady(img)) return;
  const baseW = sp.w ?? sp.size ?? 160;
  const baseH = sp.h ?? sp.size ?? 160;
  const w = e.isBoss ? baseW * 1.05 : baseW;
  const h = e.isBoss ? baseH * 1.05 : baseH;
  const sil = outlineSilhouette(`npc:${e.type}:${idx}`, img, w, h, color);
  strokeOutlineCentered(sil, w, h, color, petLocatorPulse());
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
    // ✅ image officielle ICE_EFFECT à la place des anneaux.
    ensureIceFxLoaded();
    if (isImgReady(iceFxImg)) {
      const c = ICE_FX.crop;
      const dw = Math.max(radius * 6, 64);
      const dh = dw * (c.h / c.w);
      ctx.save();
      ctx.globalAlpha = 1;
      ctx.drawImage(iceFxImg, c.x, c.y, c.w, c.h, -dw / 2, -dh / 2, dw, dh);
      ctx.restore();
    } else {
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
  }
  if (slowed) {
    // ✅ sprite officiel SLOW_EFFECT : frames 1-15 si la cible bouge,
    // 16-30 si elle est sur place, cropé à la taille du contenu.
    ensureSlowFxLoaded();
    if (slowFxReady && slowFxImgs?.length) {
      const moving = Math.hypot(Number(e.vx) || 0, Number(e.vy) || 0) > 5;
      const base = moving ? 0 : SLOW_FX_PACK.moveFrames;
      const idx = base + (Math.floor(now * SLOW_FX_PACK.fps) % SLOW_FX_PACK.moveFrames);
      const img = slowFxImgs[idx];
      if (isImgReady(img)) {
        const c = SLOW_FX_PACK.crop;
        const dw = Math.max(radius * 6, 64);
        const dh = dw * (c.h / c.w);
        // ✅ l'avant du sprite (masse vers le haut) suit l'avant du vaisseau.
        ctx.save();
        ctx.rotate((Number(e.angle) || 0) + Math.PI / 2);
        ctx.drawImage(img, c.x, c.y, c.w, c.h, -dw / 2, -dh / 2, dw, dh);
        ctx.restore();
      }
    } else {
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

for (const state of Object.values(TRADE_BUTTON).filter(value => value?.src)) {
  loadImage(state.src, { priority: true });
}

// ============================================================
// Comptoir pirate 5-2 : vente minerais, ouvert UNIQUEMENT via le bouton monde.
// ============================================================
function renderOreTradeWindow() {
  if (!ui.otRows) return;
  const user = account.user || getCurrentUserFull();
  if (!user) return;
  account.user = user;
  const resources = user.inventory?.resources || {};
  const palladium = Math.max(0, Math.floor(Number(resources.palladium) || 0));
  const { energies } = palladiumExchangeForEnergy(palladium, Infinity);
  // Échange Palladium possible partout.
  if (ui.otPalladium) ui.otPalladium.textContent = formatInteger(palladium);
  if (ui.otPalladiumGain) ui.otPalladiumGain.textContent = `x10 = ${formatInteger(energies)} énergie`;
  if (ui.otExchangeBtn) ui.otExchangeBtn.disabled = energies <= 0;
  ui.otRows.innerHTML = Object.entries(ORE_SELL_PRICES).map(([id, price]) => {
    const owned = Math.max(0, Math.floor(Number(resources[id]) || 0));
    const gain = owned * price;
    return `<div class="refineryRow"><span class="refineryOre"><img src="${escapeHtml(getResourceIcon(id))}" alt="${escapeHtml(getResourceName(id))}" loading="lazy"><b>${formatInteger(owned)}</b></span>`
      + `<span class="oreTradeGain">x${formatInteger(price)} = ${formatInteger(gain)} crédit</span>`
      + `<button type="button" data-ore-sell="${escapeHtml(id)}"${owned <= 0 ? " disabled" : ""}>Vendre</button></div>`;
  }).join("");
  // Fenêtre + cartes épousent le contenu (pas de largeur verrouillée trop grande).
  if (ui.oreTradeWindow && ui.oreTradeWindow.style.display !== "none") {
    ui.oreTradeWindow.style.width = "";
    const body = ui.oreTradeWindow.querySelector(".oreTradeBody");
    const need = Math.max(body?.scrollWidth || 0, 280) + 26;
    ui.oreTradeWindow.style.width = `${Math.min(Math.ceil(need), Math.min(640, window.innerWidth - 24))}px`;
  }
}

function openOreTradeWindow(tradeModule = null) {
  const anchor = tradeModule && isTradeModule(tradeModule) ? tradeModule : null;
  if (!anchor || !isPlayerNearTradeModule(anchor)) {
    showToast("Approche-toi du comptoir pirate", 1.4);
    return;
  }
  if (!ui.oreTradeWindow) {
    showToast("Fenêtre indisponible — recharge la page (Ctrl+F5)", 3);
    return;
  }
  activeTradeModule = anchor;
  renderOreTradeWindow();
  if (window.GameWindowManager) window.GameWindowManager.restore("oreTradeWindow");
  else ui.oreTradeWindow.style.display = "block";
}

function closeOreTradeWindow() {
  activeTradeModule = null;
  const card = ui.oreTradeWindow;
  if (!card || card.classList.contains("gameWinClosing")) return;
  if (window.GameWindowManager) {
    // Même effet de disparition que les autres fenêtres, sans icône dock.
    card.classList.add("gameWinClosing");
    setTimeout(() => {
      card.classList.remove("gameWinClosing");
      window.GameWindowManager?.close("oreTradeWindow");
    }, 360);
  } else card.style.display = "none";
}

function isOreTradeWindowOpen() {
  return !!ui.oreTradeWindow && ui.oreTradeWindow.style.display !== "none";
}

ui.otExchangeBtn?.addEventListener("click", () => {
  if (!isTradeWindowAnchored()) {
    closeOreTradeWindow();
    return;
  }
  saveProgressNow();
  const result = exchangeCurrentUserPalladiumForEnergy();
  if (!result.ok) return;
  account.user = result.user;
  addPlayerCombatFloat(result.energies, "rgba(121,237,255,0.98)", "+");
  showNotificationGroup([`Échange : ${formatInteger(result.cost)} Palladium → +${formatInteger(result.energies)} énergie(s) Galaxy`], "reward", { whiteTerms: [`+${formatInteger(result.energies)}`] });
  renderOreTradeWindow();
  window.dispatchEvent(new CustomEvent("orbit:profile-progress"));
});
ui.oreTradeWindow?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-ore-sell]");
  if (!button) return;
  if (!isTradeWindowAnchored()) {
    closeOreTradeWindow();
    return;
  }
  saveProgressNow();
  // Cargo Trader : bonus de vente du niveau équipé pendant la session.
  const traBonus = traWindowActive() ? getPetTradeBonusPct(petTrader.level) : 0;
  const result = sellCurrentUserOre(button.dataset.oreSell, traBonus);
  if (!result.ok) return;
  account.user = result.user;
  player.credits = result.user.credits;
  setHudText(ui.shopCredits, formatInteger(player.credits));
  showNotificationGroup([`Vente : ${formatInteger(result.quantity)} ${getResourceName(result.resourceId, result.quantity)} → +${formatInteger(result.gained)} crédits${traBonus > 0 ? ` (+${traBonus} % Trader)` : ""}`], "reward", { whiteTerms: [`+${formatInteger(result.gained)}`] });
  renderOreTradeWindow();
  window.dispatchEvent(new CustomEvent("orbit:profile-progress"));
});

function startGatePortalJump(ptl, action) {
  if (!ptl || ptl.jumping || !isPlayerNearPortal(ptl)) return;
  if (beginGatePortalJump(ptl, action, portal.switchDur)) {
    // ✅ mêmes sons que les portails de zone : saut possible puis saut en cours.
    SFX.play("swReady");
    window.setTimeout(() => {
      SFX.play("swJump");
    }, 500);
    try { sessionStorage.setItem("orbit_gate_jump", "1"); } catch {}
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
    // ✅ fin du saut vers la vague suivante : mêmes sons qu'une arrivée portail.
    SFX.stop("swJump");
    SFX.stop("swReady");
    SFX.play("swDone");
    try { sessionStorage.removeItem("orbit_gate_jump"); } catch {}
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
    // ✅ retour base sans rechargement quand c'est possible (même pattern
    // que les portails de zone / téléportations), fallback = reload classique.
    const returnMap = getGateReturnMap();
    try { preloadRespawnMap(returnMap); } catch {}
    goToMapFast(returnMap).catch((error) => {
      console.warn("Retour de Galaxy Gate impossible :", error);
      window.__GO_TO_MAP__?.(returnMap);
    });
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

    if (isTradeModule(m)) {
      const tradeSprite = m.tradeButtonPressed
        ? TRADE_BUTTON.click
        : m.tradeButtonHovered
          ? TRADE_BUTTON.mouse
          : TRADE_BUTTON.idle;
      const tradeImg = getCachedImage(tradeSprite.src);

      if (isImgReady(tradeImg)) {
        const tradeBtn = getTradeButtonPosition(m);
        ctx.save();
        ctx.globalAlpha = isPlayerNearTradeModule(m) ? 1 : 0.65;
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(
          tradeImg,
          tradeBtn.x + ox - TRADE_BUTTON.w / 2,
          tradeBtn.y + oy - TRADE_BUTTON.h / 2,
          TRADE_BUTTON.w,
          TRADE_BUTTON.h
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
  const activeFormationDockIcon = activeFormation ? (formationDockIcon(activeFormation) || activeFormation.icon) : null;
  let droneFormationImage = activeFormationDockIcon ? getCachedImage(activeFormationDockIcon) : null;
  if (activeFormationDockIcon && !isImgReady(droneFormationImage)) {
    loadImage(activeFormationDockIcon, { priority: true });
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
      const rr = DEFAULT_PORTAL_RADIUS + SAFE_ZONE_MARGIN;
      if (dist2(player.x, player.y, p.x, p.y) <= rr * rr) return true;
    }
  }

  if (baseProvidesSafety() && zoneSafe?.zone?.kind === "circle") {
    const z = zoneSafe.zone;
    if (dist2(player.x, player.y, z.x, z.y) <= (z.r || 0) * (z.r || 0)) return true;
  }

  if (getSafeModuleAt(player.x, player.y)) return true;

  return false;
}

function enemyShoot(e, dt, combatTarget = player) {
  if (!e || e.hp <= 0) return;
  if ((e.empT || 0) > 0) return;

  if (combatTarget === player && safeZoneActive && playerIsInSafeZone()) return;

  // Camouflage ultime : les NPC ne voient plus le joueur, ils gardent le tir.
  if (combatTarget === player && isPlayerCloaked()) {
    e.shootCd = 0.5 + Math.random() * 0.6;
    return;
  }

  if (rules?.mode === "zone") {
    if (e.passiveNative && !e._provoked) return;
  }

  if (e.canShoot === false) return;
  if ((e.shootRange ?? -1) <= 0) return;
  if ((e.shootRate ?? 0) <= 0) return;

  if (e.type === "npc_Gygerim_Overlord") {
    e._farShotCd = Number.isFinite(e._farShotCd) ? e._farShotCd - dt : 5;
    if (e._farShotCd <= 0) {
      const distantTargets = (!player.dead && !isPlayerCloaked()) ? [player] : [];
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

    tx = clamp(tx, e.r || 18, WORLD.w - (e.r || 18));
    ty = clamp(ty, e.r || 18, WORLD.h - (e.r || 18));

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

  integrateNpcPosition(e, dt);

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
  // Camouflage ultime (Police) : durée + recharge. La recharge ne descend
  // que hors effet (pendant l'effet le voile reste plein).
  if ((player.cloakT || 0) > 0) {
    player.cloakT = Math.max(0, player.cloakT - dt);
    if (player.cloakT <= 0) {
      startPoliceCloakCooldown();
      showNotification("Camouflage ultime terminé", 2, "info");
    }
  } else {
    player.cloakCd = Math.max(0, (player.cloakCd || 0) - dt);
  }

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

  if (account.user && started && !player.dead) {
    positionSaveCd -= dt;
    if (positionSaveCd <= 0) {
      positionSaveCd = 3;
      const posMap = window.__CURRENT_MAP_ID__ || "1-1";
      if (posMap !== lastPositionSave.map
        || Math.abs(player.x - lastPositionSave.x) > 1
        || Math.abs(player.y - lastPositionSave.y) > 1) {
        lastPositionSave.x = player.x;
        lastPositionSave.y = player.y;
        lastPositionSave.map = posMap;
        savePositionNow();
      }
    }
  }

  tickAutoAttack(dt);
  tickAutoRockets();
  tickVolleyFloats(dt);
  tickExplosions(dt);
  tickShipDamages(dt);
  tickPulseFx(dt);
  tickInstaShield(dt);
  tickShieldShimmer(dt);
  tickBoosters(dt);

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
  // Fin du ralenti Kamikaze : on retombe à vitesse normale.
  player.rocketSlowT = Math.max(0, Number(player.rocketSlowT || 0) - dt);
  if (player.rocketSlowT <= 0) player.rocketSlowPct = 0;
  tickRepair(dt);
  tickDroneFormationEffects(dt);
  tickRepairOrbitFx(dt);
  tickCollectables(dt);

  if (!isZoneMap) waveController(dt);
  else zoneController(dt);
  updateBossEncounters();
  updateGateEscorts(dt);
  updatePet(dt);
  try { tickBot(dt); } catch (error) { console.warn("BOT tick:", error); }

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

    // Protection portail en rayon safe (portail + marge), indépendant du
    // rayon d'interaction (450) qui pilote l'ouverture et le saut. Corrige
    // deux bugs : la couronne 450-900 affichait le cercle violet (overlay
    // et NPC en 900) sans protéger le joueur (450), et l'arrivée d'un saut
    // n'activait pas la ZNA côté arrivée.
    const noCombatForSafe = player.combatT <= 0 && !attackActive;
    let safePortal = null;
    if (near) {
      try { if (portalProvidesSafety(near)) safePortal = near; } catch { safePortal = null; }
    }
    if (!safePortal) {
      const pr = DEFAULT_PORTAL_RADIUS + SAFE_ZONE_MARGIN;
      for (const p of getInteractivePortals()) {
        try { if (!portalProvidesSafety(p)) continue; } catch { continue; }
        if (dist2(player.x, player.y, p.x, p.y) <= pr * pr) {
          safePortal = p;
          break;
        }
      }
    }

    if (near) {
      if (safePortal) {
        safeZoneX = safePortal.x;
        safeZoneY = safePortal.y;
        safeZoneR = DEFAULT_PORTAL_RADIUS + SAFE_ZONE_MARGIN;
      } else {
        safeZoneX = near.x;
        safeZoneY = near.y;
        safeZoneR = DEFAULT_PORTAL_RADIUS;
      }
      safeZoneActive = !!safePortal && noCombatForSafe;

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
    } else if (safePortal) {
      // Hors rayon d'interaction mais dans la couronne safe (450-900)
      // d'un portail sûr : on reste protégé (cercle violet = protégé).
      safeZoneX = safePortal.x;
      safeZoneY = safePortal.y;
      safeZoneR = DEFAULT_PORTAL_RADIUS + SAFE_ZONE_MARGIN;
      safeZoneActive = noCombatForSafe;
      if (safeZoneActive) showToastFixed("Zone de Non-Agression");
      else if (toast?.fixed && toast.text === "Zone de Non-Agression") clearToastFixed();
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

      // ZNA des contrôleurs de missions (modules sûrs, ex : maps x-4 / x-5).
      const safeModule = getSafeModuleAt(player.x, player.y);
      if (safeModule) {
        safeZoneX = safeModule.x;
        safeZoneY = safeModule.y;
        safeZoneR = Number(safeModule.safeRadius || 0);
      }

      if ((inModules && baseProvidesSafety()) || safeModule) {
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
    // Protocole évasion (AI-E) : +X % de MISS quand on attaque le REX.
    if (t.isPetTarget && !b.visual && !b.ownerEscortId && !b.miss) {
      const evasionPct = getPetProtocolPct(account.user?.pet, account.user, "evasion");
      if (evasionPct > 0 && Math.random() < Math.min(1, evasionPct / 100)) b.miss = true;
    }
    if (b.miss) {
        // ✅ SAB inversé : aucun son d'impact/d'absorption (même en MISS).
        showPlayerMissOnce(b, t);
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
        spawnExplosion(b.x, b.y, 0.2);
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

      if (b.isRocket) spawnExplosion(b.x, b.y, 0.2);
      removeProjectile(bullets, i);
      cleanupPlayerMissVolley(b);
      continue;
    }

    const sabRecipient = b.ownerEscortId === "pet"
      ? player
      : b.ownerEscortId ? getEscortById(b.ownerEscortId) : player;
    // ✅ les éclairs visuels de la salve X6 n'infligent aucun dégât
    let out = { total: 0 };
    // Tir du joueur sur son propre REX : bouclier puis coque (SAB = drain).
    if (t.isPetTarget && !b.visual && !b.ownerEscortId) {
      if (b.isSab) {
        const pet = account.user?.pet;
        const shMax = petShieldMaxForHud(pet, account.user);
        const avail = pet?.sh != null && Number.isFinite(Number(pet.sh)) ? Number(pet.sh) : shMax;
        const drained = Math.min(Math.max(0, avail), Math.max(0, Number(b.dmg) || 0));
        if (pet && drained > 0) {
          pet.sh = Math.max(0, avail - drained);
          player.sh = Math.min(player.shMax, player.sh + drained);
          markProgressDirty();
          out = { total: drained, sh: drained, hp: 0 };
        }
      } else {
        out = damagePetFromPlayer(b.dmg);
      }
      if (out.total > 0) {
        queueVolleyFloat(t, out, b.volleyId, b.volleySize, VOLLEY_FLOAT_TIMEOUT);
      }
      // Impact roquette sur le REX : explosion + son, comme un NPC.
      if (b.isRocket) {
        spawnExplosion(b.x, b.y, 0.25);
        if (Number(account.user?.pet?.hp) > 0) playRocketImpactStaggered(b.volleyId);
      }
      removeProjectile(bullets, i);
      cleanupPlayerMissVolley(b);
      continue;
    }
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

    if (b.isRocket) spawnExplosion(b.x, b.y, out.total >= 600 || out.isCrit ? 0.35 : 0.25);
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
        if (b.isRocket) spawnExplosion(bulletTarget.x, bulletTarget.y, 0.2);
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
        if (b.isRocket) spawnExplosion(bulletTarget.x, bulletTarget.y, 0.25);
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
        integrateNpcPosition(e, dt);
        
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

              e.anchorTX = clamp(master.x + Math.cos(ang) * r, e.r || 18, WORLD.w - (e.r || 18));
              e.anchorTY = clamp(master.y + Math.sin(ang) * r, e.r || 18, WORLD.h - (e.r || 18));

              e.anchorWanderT = 0.8 + Math.random() * 1.0;
            }

            const dxm = (e.anchorTX || master.x) - e.x;
            const dym = (e.anchorTY || master.y) - e.y;
            const dm = Math.hypot(dxm, dym) || 1;

            const mxv = dxm / dm;
            const myv = dym / dm;

            const spdE = npcEffectiveSpeed(e);
            setNpcVelocity(e, mxv, myv, spdE);

            integrateNpcPosition(e, dt);
            

            if (e.vx * e.vx + e.vy * e.vy > 25) {
              e.angle = Math.atan2(e.vy, e.vx);
            }

            continue;
          }
        }

        // NPC sous 10 % de PV : il fuit loin de sa cible (rattrapable : voir
        // npcFleeSpeed). Les tirs continuent via enemyShoot, seul le
        // mouvement change.
        if (npcShouldFlee(e)) {
          e._fleeing = true;
          setNpcVelocity(e, -nx, -ny, npcFleeSpeed(e));
          integrateNpcPosition(e, dt);
          if (e.vx * e.vx + e.vy * e.vy > 25) {
            e.angle = Math.atan2(e.vy, e.vx);
          }
          continue;
        }
        e._fleeing = false;

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

              tx = clamp(tx, e.r || 18, WORLD.w - (e.r || 18));
              ty = clamp(ty, e.r || 18, WORLD.h - (e.r || 18));

              e.aiZ.wanderTarget = { x: tx, y: ty };
              e.aiZ.wanderT = 1.6 + Math.random() * 1.6;
            }
          } else {
            e.aiZ.state = "wander";
          }
        } else {
          if (!e.passiveNative || e._provoked) {
            // Camouflage ultime : pas de nouvelle aggro sur le joueur invisible.
            if (d <= aggroRange && !isPlayerCloaked()) {
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

        // Camouflage ultime : le NPC ne poursuit plus le joueur invisible.
        if (!playerInSZ && !isPlayerCloaked() && e._aggro) {
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

            tx = clamp(tx, e.r || 18, WORLD.w - (e.r || 18));
            ty = clamp(ty, e.r || 18, WORLD.h - (e.r || 18));

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

        integrateNpcPosition(e, dt);
        

        const spd2N = e.vx * e.vx + e.vy * e.vy;
        if (e._aggro) {
          e.angle = Math.atan2(player.y - e.y, player.x - e.x);
        } else if (spd2N > 25) {
          e.angle = Math.atan2(e.vy, e.vx);
        }

        if (isKamikaze && !player.dead && !isPlayerCloaked() && cfgE.explodeOnTouch) {
          const rrK = (cfgE.explodeRadius || 180);
          const d2K = dist2(e.x, e.y, player.x, player.y);
          if (d2K <= rrK * rrK) {
            spawnExplosion(e.x, e.y, 1.4);
            const dmgK = Number(cfgE.explodeDmg || 12000);
            hurtPlayer(dmgK);
            // Souffle de l'explosion : ralenti 3 s (joueur + P.E.T via
            // ownerSpeed), même sous iFrames, avec sprite SLOW_EFFECT.
            player.rocketSlowT = Math.max(Number(player.rocketSlowT || 0), KAMIKAZE_SLOW_SEC);
            player.rocketSlowPct = Math.max(Number(player.rocketSlowPct || 0), KAMIKAZE_SLOW_PCT);
            showToast(`Kamikaze : vitesse -${KAMIKAZE_SLOW_PCT} % pendant ${KAMIKAZE_SLOW_SEC} s !`, 2);
            addGameLog(`Kamikaze · explosion · vitesse -${KAMIKAZE_SLOW_PCT} % pendant ${KAMIKAZE_SLOW_SEC} s`, "info");
            notePetAttacker(e);
            e.hp = 0;
            e.sh = 0;
          }
        }

        continue;
      } else {
        // NPC sous 10 % de PV en gate : il file vers son coin le plus proche
        // (0,0 ou max) où les fuyards se stackent (rattrapable : npcFleeSpeed).
        // Arrivé : on coupe la poussée, sinon le NPC vibre sur place contre
        // le clamp + la séparation.
        if (npcShouldFlee(e)) {
          e._fleeing = true;
          const corner = npcGateFleeCorner(e);
          const cx = corner.x - e.x, cy = corner.y - e.y;
          const cd = Math.hypot(cx, cy);
          if (cd < NPC_FLEE_ARRIVED_DIST) {
            setNpcVelocity(e, 0, 0, 0);
          } else {
            setNpcVelocity(e, cx / (cd || 1), cy / (cd || 1), npcFleeSpeed(e));
          }
        } else {
          e._fleeing = false;
          if (!e.ai) e.ai = {};

          // Camouflage ultime : le NPC reste sur place (cible invisible).
          const mv = (combatTarget === player && isPlayerCloaked())
            ? { mxv: 0, myv: 0 }
            : computeNpcCombatMovement(e, d, nx, ny, e.ai, dt);

          let mxv = mv.mxv;
          let myv = mv.myv;

          const spdE = npcEffectiveSpeed(e);

          setNpcVelocity(e, mxv, myv, spdE);
        }
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
      // Camouflage ultime : le NPC ne fixe plus le joueur invisible.
      shouldFacePlayer = d2p <= r * r && !(combatTarget === player && isPlayerCloaked());
    }

    if (shouldFacePlayer) {
      e.angle = Math.atan2(combatTarget.y - e.y, combatTarget.x - e.x);
    } else if (spd2 > 25) {
      e.angle = Math.atan2(e.vy, e.vx);
    }

    integrateNpcPosition(e, dt);
    

    const cfgTouch = NPC_TYPES[e.type] || {};
    if (!player.dead && cfgTouch.explodeOnTouch) {
      const rr = (cfgTouch.explodeRadius || 180);
      const d2 = dist2(e.x, e.y, player.x, player.y);

      const hit = d2 <= rr * rr;

          if (hit) {
            spawnExplosion(e.x, e.y, 1.4);

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

if (GAME_SETTINGS.textures) {
  drawZoneWalls(ox, oy);
}

  drawZonePortals(ox, oy);
  drawSafeModules(ox, oy);
  drawMoveTarget(ox, oy);
  try { drawBotOverlays(ox, oy); } catch {}
  drawCollectables(ox, oy);
  drawPetLocator(ox, oy);
  drawEngineTrails(ox, oy);
  drawGateEscorts(ox, oy);
  drawPet(ox, oy);
  drawPetLink(ox, oy);
  drawPetBuoy(ox, oy);

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
    // Tous les Ubers du jeu : contour rouge de base (comme le localisateur).
    if (/uber/i.test(String(e.type || ""))) drawEnemyContour(e, enemyConfig, enemySpriteFrame, "#ff4655");
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

  // Raygun désactivé : aucun faisceau laser affiché.
  // for (const L of lasers) drawLaserBeam(L, ox, oy);

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

  // ✅ impacts roquette/laser = sprites TOUCH_NPC / TOUCH_NPC2 :
  // on ne dessine plus les cercles jaunes, seule la fumée de traînée reste.
  for (const s of sparks) {
    if (!s.smoke) continue;
    const x = s.x + ox, y = s.y + oy;
    if (x < -40 || y < -40 || x > innerWidth + 40 || y > innerHeight + 40) continue;
    const lifeSpan = 1;
    const a = 1 - clamp(s.t / lifeSpan, 0, 1);
    ctx.globalAlpha = a * 0.55;
    ctx.fillStyle = s.color || "rgba(255,210,122,0.9)";
    ctx.beginPath();
    ctx.arc(x, y, 2.5 * (1 - a * 0.2), 0, TAU);
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
    // Camouflage ultime : vaisseau + drones à 50 % d'opacité.
    if (isPlayerCloaked()) ctx.globalAlpha = 0.5;
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

    // ✅ Halo de bouclier officiel rejoué à intervalle aléatoire
    drawShieldShimmer();

    // ✅ Ralenti Kamikaze : sprite SLOW_EFFECT officiel autour du vaisseau.
    if ((player.rocketSlowT || 0) > 0) drawRocketDebuffEffect(player);

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

  // Nom + barres de vie + grade : 50 % d'opacité sous camouflage ultime.
  ctx.save();
  if (isPlayerCloaked()) ctx.globalAlpha = 0.5;
  drawPlayerBars(px, py);
  ctx.restore();
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
    (spd.leonovHome ? ` | Leonov home: x1.2` : ``) +
    ` | Config ${spd.config}`);
}

updateConfigButtons();

  updateResourceHud(ui, player, currentCargo());
  // Comptoir pirate : la fenêtre se ferme dès qu'on s'éloigne du bouton.
  if (isOreTradeWindowOpen() && !isTradeWindowAnchored()) closeOreTradeWindow();
  // Terminal de quêtes : pareil, uniquement via le bouton monde.
  if (ui.questOfferWindow && ui.questOfferWindow.style.display !== "none" && !hasQuestTerminalAccess()) closeQuestTerminal();
  updatePetHud();
  updateWaveHud(ui, { started, wave, remaining: waveSpawns.remaining, alive: enemies.length });

  setHudText(ui.shopCredits, formatInteger(player.credits));

  updateSkillUI();
  updateRepairUI();

  // IEM : pas de % qui remonte, la progression est montrée par le voile
  // circulaire du dock (voir syncActionDockState). Ici on affiche le temps
  // restant pendant la recharge, "PRET" une fois disponible.
  setHudText(ui.pulsePct, pulseCd > 0 ? `${pulseCd.toFixed(1)}s` : "PRET");

  if (ui.pulsePrice) {
    setHudText(ui.pulsePrice, pulseCd > 0 ? "" : "30k");
  }

  // ISH : même affichage que l'IEM (temps restant / PRET + prix).
  setHudText(ui.ishPct, ishCd > 0 ? `${ishCd.toFixed(1)}s` : "PRET");

  if (ui.ishPrice) {
    setHudText(ui.ishPrice, ishCd > 0 ? "" : "30k");
  }

  const rsbPct = getRsbPercent();
  setHudText(ui.cntX6, `${formatInteger(player.ammo.x6)} • ${rsbPct}%`);
  setHudClass(ui.btnX6, "ready",
    started && !player.dead && ammoCount("x6") > 0 && rsbLikeCooldown("x6") <= 0
  );

  setHudText(ui.miniMapName, `Map : ${rules?.mapName || rules?.mapLabel || "—"}`);
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
    jobs.push(...preloadPlayerBulletSprites());
    jobs.push(...preloadPetSprites());
    // ✅ drones dans le chargement bloquant : aucune saccade aux premiers virages.
    jobs.push(...collectDroneSpriteJobs());
    // ✅ bases mères (X-1 + X-8) dans le chargement bloquant : retour base
    // instantané, sans préchargement à la mort.
    jobs.push(...await collectHomeBaseJobs());
    jobs.push(ensureLaserLoaded(), ensureExplosionLoaded(), ensurePulseFxLoaded(),
      ensureRepairOrbitLoaded(), ensureShipDamageLoaded(), ensureInstaShieldLoaded(),
      ensureShieldShimmerLoaded(), ensureSlowFxLoaded(), ensureIceFxLoaded());
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
  // ✅ charge aussi les maps mères + tous les drones en fond (sans bloquer
  // le DÉPART) pour une « Réparée à la base » sans rechargement et des
  // drones sans saccades. Le préchargement ciblé à chaque mort reste actif.
  try {
    const idle = window.requestIdleCallback || ((cb) => setTimeout(cb, 1500));
    idle(() => { preloadHomeMaps(); preloadAllDroneSprites(); });
  } catch {}
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

  // Le compte est chargé ici à coup sûr : restaure les recharges
  // persistantes + resync l'onglet Aptitudes.
  try { restorePersistedCds(); } catch {}
  try { refreshActiveActionPalette?.(); } catch {}

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

  // ✅ après le DÉPART : maps mères + drones en fond pour un respawn base
  // instantané (switch interne) et des drones sans saccades.
  try {
    const idle = window.requestIdleCallback || ((cb) => setTimeout(cb, 2000));
    idle(() => { preloadHomeMaps(); preloadAllDroneSprites(); });
  } catch {}

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
  // Univers persistant : fige les NPC blesses/deplaces avant de quitter,
  // puis fait avancer les autres maps (sauf l'active) + persiste.
  try {
    snapshotActiveEnemiesToUniverse(String(currentMap));
    tickBackground(universe, worldClock.now(), { skipMapId: String(currentMap) });
    persistUniverse();
    persistCollectables({ force: true });
  } catch {}
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

  // ⚠ï¸ Ne surtout pas sauvegarder ship ici.
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
  const preparedZoneCamps = nextRules.mode === "zone" && typeof nextRules.getZoneSpawns === "function"
    ? nextRules.getZoneSpawns(nextWorld) : [];
  const preparedZonePortals = nextRules.mode === "zone" && typeof nextRules.getZonePortals === "function"
    ? nextRules.getZonePortals(nextWorld) : [];

  const jobs = [];
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
  // ✅ Les quêtes "visite de map" doivent se valider à chaque arrivée,
  // y compris lors d'un switch interne (portails sans reload de page).
  // Sans cet appel, seules les arrivées via reload (startGame) validaient.
  try {
    advanceQuestProgress("visit", String(mapId));
    saveProgressNow?.();
  } catch {}
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

    // recalcule les stats (hp, bouclier, vitesse, dégâts…) en valeurs absolues
    applyCurrentConfigStats(false, null, true);

  updateResourceHud(ui, player, currentCargo());
  // Raffinerie ouverte : compteurs d'usure en (quasi) direct, sans reconstruire à chaque frame.
  if (ui.refineryWindow && ui.refineryWindow.style.display !== "none" && !ui.refineryWindow.classList.contains("gameWinMinimized")) {
    const nowMs = performance.now();
    if (nowMs - refineryLiveT > 1500) {
      refineryLiveT = nowMs;
      renderRefineryWindow();
    }
  }

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
  getEquipmentState() {
    const hangar = getActiveHangarFromUser(account.user);
    const pet = account.user?.pet;
    return structuredClone({
      hangarId: hangar?.id, config: getActiveConfigNo(),
      ship: { damage: player.baseDamage, speed: player.baseSpeed, hp: player.hp, hpMax: player.hpMax, shield: player.sh, shieldMax: player.shMax },
      fit: hangar?.fits?.[String(getActiveConfigNo())],
      drones: (account.user?.drones?.items || []).map(drone => getDroneFit(drone, hangar?.id, getActiveConfigNo())),
      pet: { fit: getPetFit(pet, hangar?.id, getActiveConfigNo()), shield: pet?.sh ?? petShieldMaxForHud(pet, account.user), shieldMax: petShieldMaxForHud(pet, account.user), damage: petVolleyDamage(pet, account.user, null).total },
    });
  },
};

// ✅ Sauvegarde d'urgence avant de quitter la map (appelé par main.js via __GO_TO_MAP__)
window.__SAVE_BEFORE_LEAVE__ = () => {
  saveStateImmediate();
};

addEventListener("beforeunload", () => {
  try { saveStateImmediate(); } catch {}
  try { persistUniverse({ force: true }); } catch {}
  try { persistCollectables({ force: true }); } catch {}
  try { localStorage.removeItem("orbit_game_open"); } catch {}
});

// ✅ Bloque le bouton retour/avant du navigateur : les changements de carte
// passent uniquement par les portails du jeu. __GO_TO_MAP__ recharge la page
// avec ?map=&spawn=, donc chaque saut crée une entrée d'historique ; sans ce
// garde, "retour" recharge l'ancienne carte avec un état périmé (ex : retour
// en 1-6 après un saut vers 1-5).
try {
  history.pushState({ orbitBackGuard: true }, "", location.href);
} catch {}
addEventListener("popstate", () => {
  try {
    history.pushState({ orbitBackGuard: true }, "", location.href);
  } catch {}
  try {
    showNotification("Changement de carte : utilise les portails du jeu.", 3, "info");
  } catch {}
});

addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") {
    try { saveStateImmediate(); } catch {}
    try { persistUniverse({ force: true }); } catch {}
    try { persistCollectables({ force: true }); } catch {}
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
  const previous = account.user;
  const previousHangar = getActiveHangarFromUser(previous);
  const nextHangar = getActiveHangarFromUser(refreshed);
  const switched = previousHangar?.id === nextHangar?.id
    && Number(previousHangar?.activeConfig) !== Number(nextHangar?.activeConfig);
  if (started && switched) saveShieldForConfig(previousHangar.activeConfig);
  account.user = refreshed;
  // Changement de vaisseau : account.user est déjà muté ici (cache partagé
  // de readUsers), on compare donc au dernier vaisseau vu par la palette.
  // Le refresh est systématique (pas seulement au changement) : au boot la
  // palette s'initie souvent avant les données du compte et resterait masquée.
  let nowShipId = "";
  try { nowShipId = String(getActiveHangarFromUser(account?.user)?.shipId || "").toLowerCase(); } catch {}
  if (nowShipId !== lastAbilityShipId) lastAbilityShipId = nowShipId;
  try { refreshActiveActionPalette?.(); } catch {}
  if (started) {
    applyCurrentConfigStats(false, switched ? nextHangar.activeConfig : null, true);
    updateConfigButtons();
    updatePetHud();
    drawUI();
  }
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
  // ✅ alternance libre : l'accès direct (URL) à une gate déployée ou déjà
  // commencée bascule dessus au lieu de renvoyer à la base mère.
  const directAccess = consumeCurrentUserGalaxyGate(currentGateMapId);
  if (directAccess.ok) {
    account.user = directAccess.user;
    renderGalaxyGateWindow(`${GALAXY_GATE_DEFINITIONS[currentGateMapId].name} activée`);
  } else {
    const homeMap = getFactionHomeMap(cur.faction);
    showToast("Galaxy Gate non construite", 1.5);
    window.__GO_TO_MAP__?.(homeMap);
    return;
  }
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
