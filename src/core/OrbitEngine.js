"use strict";
import {
  getCurrentUserFull,
  updateCurrentUserProgress,
  getActiveHangarState,
  saveActiveHangarState,
  getActiveHangarId,
  getHangarStateById,
  saveHangarStateById,
  setActiveHangarConfig
} from "./account.js";
import { computeHangarStats } from "./hangars.js";
import { findCatalogItem } from "./catalog.js";
import { clamp, circleRectResolve, dist2, segCircleHit } from "./collision.js";
import { createKeyboardState, createPointerState } from "./input.js";
import { bulletLifeForRange, damageEnemyLayers, damagePlayerLayers, drainShield } from "./combat.js";
import { forEachNearbyPair, rebuildIdIndex } from "./spatialIndex.js";

export function startOrbitGame(config) {

const {
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

COLLECTABLE_TYPES = {
  Cargo_Box: {
  name: "Bonus crédits",

  // ✅ uniquement sur ces maps
 // maps: ["1-1", "1-2"],
maps: "*",

  qty: 0,
  spawnBatch: 50,
  minSpacing: 100,
  avoidPlayer: 0,

  npcDespawnAfter: 30,

  r: 30,
  pickupRadius: 50,
  bob: 5,

  sprite: {
    path: "assets/collectables/Cargo_Box/",
    frames: 32,
    firstNumber: 1,
    ext: ".png",
    fps: 35,
    w: 128,
    h: 128,
    scale: 1,
    randomStart: true,
    glow: false,
  },

  rewards: {
    credits: [1000, 10000],
  },
},
  Bonus_Box: {
  name: "Bonus crédits",

  // ✅ uniquement sur ces maps
 // maps: ["1-1", "1-2"],
maps: "*",

  qty: 50,
  spawnBatch: 50,
  minSpacing: 100,
  avoidPlayer: 0,

  npcDespawnAfter: 0,

  r: 30,
  pickupRadius: 50,
  bob: 5,

  sprite: {
    path: "assets/collectables/Bonus_Box/",
    frames: 25,
    firstNumber: 1,
    ext: ".png",
    fps: 20,
    w: 108,
    h: 72,
    scale: 1,
    randomStart: true,
    glow: false,
  },

  rewards: {
    credits: [1000, 10000],
  },
},
  Green_Booty_Box: {
  name: "Bonus crédits",

  // ✅ uniquement sur ces maps
 // maps: ["1-1", "1-2"],
maps: "*",

  qty: 10,
  spawnBatch: 10,
  minSpacing: 100,
  avoidPlayer: 0,

  npcDespawnAfter: 0,

  r: 30,
  pickupRadius: 50,
  bob: 5,

  sprite: {
    path: "assets/collectables/Green_Booty_Box/",
    frames: 2,
    firstNumber: 1,
    ext: ".png",
    fps: 35,
    w: 72,
    h: 58,
    scale: 1,
    randomStart: true,
    glow: false,
  },

  rewards: {
    credits: [1000, 10000],
  },
},
  Astral_Prime_Box: {
  name: "Bonus de munitions",

  // ✅ uniquement sur ces maps
 // maps: ["1-1", "1-2"],
maps: "???",

  qty: 100,
  spawnBatch: 100,
  minSpacing: 100,
  avoidPlayer: 0,

  npcDespawnAfter: 0,

  r: 30,
  pickupRadius: 50,
  bob: 5,

  sprite: {
    path: "assets/collectables/Astral_Prime_Box/",
    frames: 26,
    firstNumber: 1,
    ext: ".png",
    fps: 25,
    w: 110,
    h: 110,
    scale: 1,
    randomStart: true,
    glow: false,
  },

  rewards: {
      ammo: {
        x4: [800, 1100],
      },
      },
},
  Hybrid_Alloy_Box: {
  name: "Immunizer CPU bonus",

  // ✅ uniquement sur ces maps
 // maps: ["1-1", "1-2"],
maps: "*",

  qty: 0,
  spawnBatch: 100,
  minSpacing: 1,
  avoidPlayer: 0,

  npcDespawnAfter: 0,

  r: 30,
  pickupRadius: 50,
  bob: 5,

  sprite: {
    path: "assets/collectables/Hybrid_Alloy_Box/",
    frames: 40,
    firstNumber: 1,
    ext: ".png",
    fps: 25,
    w: 96,
    h: 128,
    scale: 1,
    randomStart: true,
    glow: false,
  },

  rewards: {
    credits: [1, 3],
  },
},
  Palladium_Ore: {
  name: "Bonus crédits",

  // ✅ uniquement sur ces maps
 // maps: ["1-1", "1-2"],
maps: ["5-2"],

  qty: 1000,
  spawnBatch: 1000,
  minSpacing: 10,
  avoidPlayer: 0,

  npcDespawnAfter: 0,

  r: 30,
  pickupRadius: 50,
  bob: 5,

  sprite: {
    path: "assets/collectables/Palladium_Ore/",
    frames: 27,
    firstNumber: 1,
    ext: ".png",
    fps: 20,
    w: 76,
    h: 76,
    scale: 1,
    randomStart: true,
    glow: false,
  },

  rewards: {
    credits: [100, 100],
  },
},

},

COLLECTABLE_SPAWN = {
  enabled: true,
  interval: 1.0,
  spawnBatch: 5,
  avoidPlayer: 700,
  minSpacing: 130,
},

  rules = {},
} = config;

const DEFAULT_SPAWN = { x: 1500, y: 1500 };

// ============================================================
// ✅ Radiation zone (hors limites WORLD)
// ============================================================
const RADIATION = {
  dpsPct: 0.10, // ✅ 10% HP max / seconde
};

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
  if (!started || paused || player.dead) return;

  radiationActive = playerIsOutsideWorld();

  if (!radiationActive) return;

  const dmg = player.hpMax * RADIATION.dpsPct * dt;

  resetRepairCooldown();
  player.hp -= dmg;

  if (player.hp <= 0) {
    player.hp = 0;
    die();
  }
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
const BG_LAYERS = (
  WORLD?.bgLayers ||
  rules?.bgLayers ||
  [
    { src: WORLD?.bgSrc || rules?.bgSrc || null, mode: "tile", alpha: 0.85, parallax: 0.02 },
    { src: "./Backgrounds/stars_tile.webp", mode: "tile", alpha: 0.55, parallax: 0.08, blend: "lighter" },
  ]
).filter(x => x && x.src);

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

  respawnOverlay: document.getElementById("respawnOverlay"),
  respawnBaseBtn: document.getElementById("respawnBaseBtn"),
  respawnPortalBtn: document.getElementById("respawnPortalBtn"),
  respawnHereBtn: document.getElementById("respawnHereBtn"),

  pulsePct: document.getElementById("pulsePct"),
  pulsePrice: document.getElementById("pulsePrice"),

  fpsTxt: document.getElementById("fpsTxt"),

  boxWave: document.getElementById("boxWave"),
  boxMeta: document.getElementById("boxMeta"),
  boxVitals: document.getElementById("boxVitals"),

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
  btnNuke: document.getElementById("btnNuke"),
  btnRepair: document.getElementById("btnRepair"),
  repairTxt: document.getElementById("repairTxt"),

  centerMsg: document.getElementById("centerMsg"),
  centerTitle: document.getElementById("centerTitle"),
  centerBody: document.getElementById("centerBody"),
  centerHint: document.getElementById("centerHint"),

  startHint: document.getElementById("startHint"),

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

// ============================================================
// ✅ Paramètres rapides du jeu
// ============================================================
const GAME_SETTINGS_KEY = "orbit_game_settings_v1";

const DEFAULT_KEYBINDS = {
  portal: "KeyJ",
  switchConfig: "KeyC",
  toggleAttack: "ControlLeft",
  respawn: "KeyR",

  ammoX1: "Digit1",
  ammoX2: "Digit2",
  ammoX3: "Digit3",
  ammoX4: "Digit4",
  ammoSAB: "Digit5",
  ammoX6: "Digit6",

  pulse: "Digit7",
  nuke: "Digit8",
};

const DEFAULT_GAME_SETTINGS = {
  sound: true,
  background: true,
  textures: true,
  keybinds: { ...DEFAULT_KEYBINDS },
};

function normalizeKeybinds(raw) {
  return {
    ...DEFAULT_KEYBINDS,
    ...(raw && typeof raw === "object" ? raw : {}),
  };
}

function loadGameSettings() {
  try {
    const raw = localStorage.getItem(GAME_SETTINGS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};

    return {
      ...DEFAULT_GAME_SETTINGS,
      ...(parsed && typeof parsed === "object" ? parsed : {}),
      keybinds: normalizeKeybinds(parsed?.keybinds),
    };
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
  saveGameSettings();
  renderSettingsWindow();

  if (key === "sound") {
    showToast(GAME_SETTINGS.sound ? "Son activé" : "Son coupé", 1.1);
  }

  if (key === "background") {
    showToast(GAME_SETTINGS.background ? "Fond de carte affiché" : "Fond de carte masqué", 1.1);
  }

  if (key === "textures") {
    showToast(GAME_SETTINGS.textures ? "Textures affichées" : "Textures masquées", 1.1);
  }
}

let waitingForBindAction = null;

const KEYBIND_LABELS = {
  portal: "Portail",
  switchConfig: "Changer configuration",
  toggleAttack: "Attaque auto",
  respawn: "Réapparition",

  ammoX1: "Munition X1",
  ammoX2: "Munition X2",
  ammoX3: "Munition X3",
  ammoX4: "Munition X4",
  ammoSAB: "Munition SAB-50",
  ammoX6: "Munition X6",

  pulse: "I.E.M",
  nuke: "Bombe",
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
  const setHint = (selector, action) => {
    const el = document.querySelector(`${selector} .keyHint`);
    if (el) el.textContent = codeLabel(getKeybind(action));
  };

  setHint("#btnX1", "ammoX1");
  setHint("#btnX2", "ammoX2");
  setHint("#btnX3", "ammoX3");
  setHint("#btnX4", "ammoX4");
  setHint("#btnSAB", "ammoSAB");
  setHint("#btnX6", "ammoX6");
  setHint("#btnPulse", "pulse");
  setHint("#btnNuke", "nuke");

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
    "🔊 Son : activé",
    "🔇 Son : coupé"
  );

  updateSettingsButton(
    "optBackground",
    GAME_SETTINGS.background,
    "🌌 Fond de carte : affiché",
    "🌑 Fond de carte : masqué"
  );

    renderKeybindRows();
  updateHudKeyHints();
}

function wireSettingsWindow() {
  const soundBtn = document.getElementById("optSound");
  const bgBtn = document.getElementById("optBackground");
  const texBtn = document.getElementById("optTextures");

  soundBtn?.addEventListener("click", () => {
    setGameSetting("sound", !GAME_SETTINGS.sound);
  });

  bgBtn?.addEventListener("click", () => {
    setGameSetting("background", !GAME_SETTINGS.background);
  });

  texBtn?.addEventListener("click", () => {
    setGameSetting("textures", !GAME_SETTINGS.textures);
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

  const reg = (id, title, icon) => {
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
    });
  };

  reg("boxWave", "Vagues / Kills", "🌊");
  reg("boxMeta", "Stats joueur", "📊");
  reg("boxVitals", "Vie / Bouclier / FPS", "❤️");
  reg("minimap", "Mini-carte", "🗺️");
  reg("settingsWindow", "Paramètres", "⚙️");
wireSettingsWindow();

// ✅ La fenêtre paramètres démarre réduite dans le dock
window.GameWindowManager?.minimize("settingsWindow");

  console.log("✅ HUD windows registered");
}

setTimeout(registerHudWindows, 200);

// ============================================================
// Helpers
// ============================================================
const MAX_ALIVE = 100;
let currentWavePlan = null;

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

  if (spr.idle?.src) loadImage(spr.idle.src, { priority: true });
  if (spr.open?.src) loadImage(spr.open.src, { priority: true });
  if (spr.jump?.src) loadImage(spr.jump.src, { priority: true });

  const btn = spr.jumpButton;

if (btn?.idle?.src) {
  loadImage(btn.idle.src, { priority: true });
}

if (btn?.mouse?.src) {
  loadImage(btn.mouse.src, { priority: true });
}

if (btn?.click?.src) {
  loadImage(btn.click.src, { priority: true });
}

  // ✅ précharge le sprite animé par-dessus
  const fx = spr.jumpFx;
  if (fx?.path && fx?.frames) {
    const frames = Math.max(1, Number(fx.frames || 1));

    for (let i = 0; i < frames; i++) {
      const src = getPortalFrameSrc(fx, i);
      if (src) loadImage(src, { priority: true });
    }
  }
}

function startZonePortalJump(ptl) {
  if (!ptl || ptl.jumping) return;

  // ✅ on mémorise l'état visuel actuel du portail
  // comme ça le jump part de l'état open sans cassure
  ptl.jumpBaseFade = Math.max(0, getPortalOpenFade(ptl));

  ptl.jumping = true;
  ptl.jumpT = 0;
  ptl.jumpDur = Math.max(0.1, Number(ptl.jumpDur ?? 2));

  ptl.jumpMap = ptl.toMap;
  ptl.jumpPortal = ptl.toPortal;

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

  showToast("Saut en cours...", ptl.jumpDur);
}

function finishZonePortalJump(ptl) {
  if (!ptl) return;

  const toMap = ptl.jumpMap ?? ptl.toMap;
  const toPortal = ptl.jumpPortal ?? ptl.toPortal;

  ptl.jumping = false;
  ptl.jumpT = 0;
  ptl.jumpMap = null;
  ptl.jumpPortal = null;

  if (typeof window.__GO_TO_MAP__ === "function") {
    try {
      sessionStorage.setItem("spawnPortalId", String(toPortal ?? ""));
      sessionStorage.setItem("spawnMapId", String(toMap ?? ""));
    } catch {}

    window.__GO_TO_MAP__(toMap);
  } else {
    console.warn("window.__GO_TO_MAP__ manquante");
  }
}

function tickZonePortalJumps(dt) {
  if (!isZoneMap || !started || paused || player.dead || !zonePortals.length) return false;

  for (const ptl of zonePortals) {
    if (!ptl.jumping) continue;

    ptl.jumpT += dt;

    if (ptl.jumpT >= Math.max(0.1, Number(ptl.jumpDur || 2))) {
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
let paused = true;
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

function loadAccountUser() {
  account.user = getCurrentUserFull();
  return account.user;
}

function markProgressDirty() {
  account.dirty = true;
  account.saveCd = 0.35;
}

function saveProgressNow() {
  if (!account.user) return;
  
  if (!player.dead && started) {
    const currentMap = window.__CURRENT_MAP_ID__ || "1-1";
    saveActiveHangarState(player.x, player.y, currentMap);
  }
  
updateCurrentUserProgress({
  credits: player.credits,

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
  account.dirty = false;
}

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
    shMax: Math.max(1, Number(player.shMax || 1)),
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

  const total = Math.floor(base + genSpeed * (1 + speedPct / 100));

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

function getLevelInfo(exp) {
  exp = Math.max(0, Number(exp || 0));

  // Barème simple :
  // niveau 1 = 0 exp
  // niveau 2 = 1 000 exp
  // niveau 3 = 4 000 exp
  // niveau 4 = 9 000 exp
  // etc
  const level = Math.max(1, Math.floor(Math.sqrt(exp / 1000)) + 1);

  const curReq = Math.pow(level - 1, 2) * 1000;
  const nextReq = Math.pow(level, 2) * 1000;
  const pct = nextReq > curReq
    ? Math.floor(((exp - curReq) / (nextReq - curReq)) * 100)
    : 100;

  return {
    level,
    pct: clamp(pct, 0, 100),
    curReq,
    nextReq,
  };
}

function applyCurrentConfigStats(keepRatios = true, restoreShieldConfigNo = null) {
  const u = loadAccountUser();
  if (!u) return false;

  const shipId = u.ship || ACTIVE_SHIP?.id || "PhoenixBleu";
  const pack = getShipPackById(shipId);
  ACTIVE_SHIP = pack;

  const hangar = getActiveHangarFromUser(u);
  const stats = computeHangarStats(hangar, u);

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

  player.shMax = Math.max(1, Math.floor(stats.bonusShield || 1));

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
    ui.cfg1Btn.classList.toggle("active", active === 1);
    ui.cfg1Btn.disabled = left > 0 || active === 1 || player.dead;
  }

  if (ui.cfg2Btn) {
    ui.cfg2Btn.classList.toggle("active", active === 2);
    ui.cfg2Btn.disabled = left > 0 || active === 2 || player.dead;
  }

  if (ui.cfgCooldownTxt) {
    ui.cfgCooldownTxt.textContent = left > 0 ? `${left.toFixed(1)}s` : "";
  }
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
  renderAmmoShop();
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

let toast = null;
let startHintT = 0;

function showToast(text, dur = 2) {
  toast = {
    text: String(text ?? ""),
    t: 0,
    dur: Math.max(0.25, Number(dur) || 2),
    fixed: false,
  };
}

function showToastFixed(text) {
  toast = { text: String(text ?? ""), t: 0, dur: Infinity, fixed: true };
}

function clearToastFixed() {
  if (toast && toast.fixed) toast = null;
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
  const ox = innerWidth / 2 - camera.x;
  const oy = innerHeight / 2 - camera.y;
  return { x: sx - ox, y: sy - oy };
}

function worldToScreen(x, y) {
  return { 
    x: x + (innerWidth / 2 - camera.x), 
    y: y + (innerHeight / 2 - camera.y) 
  };
}

function isOnScreenWorld(x, y, margin = 120) {
  const s = worldToScreen(x, y);
  return s.x >= -margin && s.y >= -margin && 
         s.x <= innerWidth + margin && s.y <= innerHeight + margin;
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
  for (const k in PLAYER_BULLET_SPRITES) {
    const src = PLAYER_BULLET_SPRITES[k]?.src;
    if (src) loadImage(src, { priority: false });
  }
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

  LASER_PACK._promise = new Promise((resolve) => {
    let done = 0;
    for (let i = 0; i < LASER_PACK.frames; i++) {
      const img = new Image();
      img.src = `${LASER_PACK.path}${LASER_PACK.firstNumber + i}${LASER_PACK.ext}`;
      img.onload = () => {
        done++;
        if (done >= LASER_PACK.frames) resolve(true);
      };
      img.onerror = () => {
        done++;
        if (done >= LASER_PACK.frames) resolve(true);
      };
      LASER_PACK._imgs.push(img);
    }
  });

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

function spawnPulseFx(x, y, scale = 1) {
  if (!pulseReady || !pulseImgs?.length) return;
  pulseFxs.push({ x, y, t: 0, scale: Math.max(0.2, Number(scale) || 1) });
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

    const x = fx.x + ox;
    const y = fx.y + oy;

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
  if (!started || paused || player.dead) return false;
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

  ctx.drawImage(img, -w / 2, -h / 2, w, h);

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

  explosions.push({
    x,
    y,
    t: 0,
    scale: Math.max(0.2, Number(scale) || 1),
  });
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
const REPAIR = { cooldown: 6.0, ratePct: 0.05 };

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
  player.shPen = BASE_RUN.shPen + ((stats.bonusPenetrationPct || 0) / 100);

  const shipBaseHP = Number(pack?.hp || 1);
  player.hpMax = Math.max(1, Math.floor(shipBaseHP * (1 + (stats.bonusHPPct || 0) / 100)));
  player.hp = player.hpMax;

  player.shMax = Math.max(1, Math.floor(stats.bonusShield || 1));
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

  return String(Math.min(n, 9999999));
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
}

function tickRepair(dt) {
  if (player.dead) return;

  player.repairT = Math.min(REPAIR.cooldown, player.repairT + dt);

  if (player.repairT >= REPAIR.cooldown) {
    const hpAmt = player.hpMax * REPAIR.ratePct * dt;
    const shAmt = player.shMax * REPAIR.ratePct * dt;

    if (player.hp < player.hpMax) player.hp = Math.min(player.hpMax, player.hp + hpAmt);
    if (player.sh < player.shMax) player.sh = Math.min(player.shMax, player.sh + shAmt);
  }
}

function updateRepairUI() {
  const pct = REPAIR.cooldown <= 0 ? 1 : clamp(player.repairT / REPAIR.cooldown, 0, 1);
  const needs = !player.dead && (player.hp < player.hpMax - 0.01 || player.sh < player.shMax - 0.01);

  if (player.dead) ui.repairTxt.textContent = "OFF";
  else if (pct < 1) ui.repairTxt.textContent = `${Math.floor(pct * 100)}%`;
  else ui.repairTxt.textContent = needs ? `+${Math.round(REPAIR.ratePct * 100)}%/s` : "OK";

  ui.btnRepair.classList.toggle("ready", pct >= 1 && needs && !player.dead);
  ui.btnRepair.classList.toggle("disabled", player.dead);
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

function togglePause() {
  paused = !paused;
  if (paused) setCenterMsg(true, "Pause", "Appuie sur <b>Esc</b> pour reprendre.", "Astuce : X4 pour boss");
  else setCenterMsg(false);
}

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
const used = [...boundKeys, "Escape"];

    if (used.includes(e.code)) e.preventDefault();

    keyboard.keyDown(e.code, e.repeat);

    // Pause / démarrage, on garde Escape fixe pour l’instant
    if (e.code === "Escape") {
      if (!started) startGame();
      else togglePause();
      return;
    }

    if (e.repeat) return;

    if (isKeybind("respawn", e.code)) {
      if (player.dead) respawn();
      return;
    }

    if (isKeybind("portal", e.code)) {
      if (!isZoneMap) tryStartNextWave();
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

    if (isKeybind("ammoX1", e.code)) {
      startAttack("x1");
      return;
    }

    if (isKeybind("ammoX2", e.code)) {
      startAttack("x2");
      return;
    }

    if (isKeybind("ammoX3", e.code)) {
      startAttack("x3");
      return;
    }

    if (isKeybind("ammoX4", e.code)) {
      startAttack("x4");
      return;
    }

    if (isKeybind("ammoSAB", e.code)) {
      startAttack("sab");
      return;
    }

    if (isKeybind("ammoX6", e.code)) {
      startAttack("x6");
      return;
    }

    if (isKeybind("pulse", e.code)) {
      usePulse();
      return;
    }

    if (isKeybind("nuke", e.code)) {
      useNuke();
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
  if (!isZoneMap || !zonePortals?.length) return null;

  const mouseWorld = screenToWorld(clientX, clientY);

  // On parcourt à l'envers pour prendre celui dessiné au-dessus
  for (let i = zonePortals.length - 1; i >= 0; i--) {
    const ptl = zonePortals[i];
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
  if (!isZoneMap || !zonePortals?.length) return false;

  const hoveredPortal = pickPortalButtonAtScreen(
    clientX,
    clientY
  );

  for (const ptl of zonePortals) {
    ptl.buttonHovered = ptl === hoveredPortal;
  }

  if (hoveredPortal) {
    canvas.style.cursor = "pointer";
    return true;
  }

  return false;
}

canvas.addEventListener(
  "mousemove",
  (e) => {
    const overPortalButton = updatePortalButtonCursor(
      e.clientX,
      e.clientY
    );

    if (!overPortalButton) {
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
  if (paused || !started) return;

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

    let pressedPortal = null;

    for (const ptl of zonePortals || []) {
      if (ptl.buttonPressed) {
        pressedPortal = ptl;
      }

      ptl.buttonPressed = false;
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
        startZonePortalJump(pressedPortal);
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

    for (const ptl of zonePortals || []) {
      ptl.buttonPressed = false;
      ptl.buttonHovered = false;
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
const pickups = [];
const collectables = [];
const sparks = [];
const floatTexts = [];
const lasers = [];

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
  missChance: 0.30, // 30% de MISS par tir complet
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

  floatTexts.push({
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
  });
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

  const minR = ca.minR;
  const maxR = ca.maxR;
  const midR = (minR + maxR) * 0.5;

  const tx = -ny * ca.dir;
  const ty = nx * ca.dir;

  let mxv = 0;
  let myv = 0;

  // ✅ trop loin : il revient vers toi
  if (d > maxR) {
    const side = Math.sin(e.wobble * 1.4 + ca.wobbleSeed) * 0.30;

    mxv = nx * 0.90 + tx * side;
    myv = ny * 0.90 + ty * side;

    return { mxv, myv };
  }

  // ✅ trop proche : il ne recule PLUS
  // Avant : mxv = -nx / myv = -ny
  // Maintenant : il freine, glisse ou reste sur place
  if (d < minR) {
    const brake = Math.pow(NPC_COMBAT_MOVE.closeBrake, dt * 60);
    e.vx *= brake;
    e.vy *= brake;

    if (ca.mode === "hold" || ca.mode === "pause" || ca.pauseT > 0) {
      return { mxv: 0, myv: 0 };
    }

    const sidePower = ca.mode === "drift" ? 0.25 : 0.55;
    const wobble = Math.sin(e.wobble * 2.2 + ca.wobbleSeed) * 0.20;

    mxv = tx * (sidePower + wobble);
    myv = ty * (sidePower + wobble);

    return { mxv, myv };
  }

  // ✅ dans la bonne zone : comportement moins robotique
  if (ca.mode === "hold" || ca.pauseT > 0) {
    return { mxv: 0, myv: 0 };
  }

  if (ca.mode === "pause") {
    return { mxv: 0, myv: 0 };
  }

  const err = clamp((d - midR) / Math.max(1, maxR - minR), -1, 1);

  // ✅ important :
  // pull ne devient jamais négatif, donc le NPC ne recule pas quand tu avances vers lui
  const pull = Math.max(0, err) * 0.45;

  const orbitPower = ca.mode === "drift" ? 0.35 : 0.80;
  const wobble = Math.sin(e.wobble * 1.7 + ca.wobbleSeed) * 0.18;

  mxv = tx * (orbitPower + wobble) + nx * pull;
  myv = ty * (orbitPower + wobble) + ny * pull;

  return { mxv, myv };
}

function applyNpcSeparation(dt) {
  if (isZoneMap) return;
  if (!NPC_SEP.enable) return;
  
  if (enemies.length <= 1) return;

  forEachNearbyPair(enemies, 512, (a, b, i, j) => {

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

      a.vx += ax;
      a.vy += ay;
      b.vx += bx;
      b.vy += by;
  });
}

// ✅ Starfield scroll (effet déplacement réel)
let starScrollX = 0;
let starScrollY = 0;

const STAR_SCROLL_FACTOR = 2;

// ============================================================
// Starfield pattern
// ============================================================
const STAR_TILE = document.createElement("canvas");
STAR_TILE.width = 512;
STAR_TILE.height = 512;
const sctx = STAR_TILE.getContext("2d");

(function buildStars() {
  sctx.clearRect(0, 0, STAR_TILE.width, STAR_TILE.height);
  for (let i = 0; i < 50; i++) {
    const x = Math.random() * STAR_TILE.width;
    const y = Math.random() * STAR_TILE.height;
    const r = 0.6 + Math.random() * 1.8;
    const a = 0.15 + Math.random() * 0.75;
    sctx.globalAlpha = a;
    sctx.fillStyle = "#e8f0ff";
    sctx.beginPath();
    sctx.arc(x, y, r, 0, TAU);
    sctx.fill();
  }
  sctx.globalAlpha = 1;
})();

const STAR_PATTERN = ctx.createPattern(STAR_TILE, "repeat");

// ============================================================
// Shop
// ============================================================

function renderAmmoShop() {
  // Boutique munitions supprimée du HUD.
  // Les achats se font maintenant dans la boutique Profil intégrée au jeu.
  if (!ui.ammoShopBody) return;
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

  floatTexts.push({
    x,
    y,
    vx: vx0,
    vy: vy0,
    t: 0,
    life: o.life,
    text: DMG_FMT.format(Math.round(n)),
    color,
    size: o.size,
    pop: o.pop,
    shake: o.shake,
    glow: o.glow,
    weight: o.weight,
    impact: o.impact,
  });
}

function spawnSpark(x, y, big = false) {
  sparks.push({ x, y, t: 0, big });
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
  for (const [type] of collectableDefsList()) {
    ensureCollectableLoaded(type);
  }
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

  const reward = cfg.reward || cfg.rewards || {};
  const parts = [];

  let changed = false;

  const credits = rollValue(reward.credits, 0);
  if (credits > 0) {
    player.credits += credits;
    parts.push(`+${credits} crédits`);
    changed = true;
  }

  if (reward.ammo && typeof reward.ammo === "object") {
    for (const key in reward.ammo) {
      const amount = rollValue(reward.ammo[key], 0);
      if (amount <= 0) continue;

      player.ammo[key] = Math.max(0, Number(player.ammo[key]) || 0) + amount;
      parts.push(`+${amount} ${key.toUpperCase()}`);
      changed = true;
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
    renderAmmoShop();
  }

  if (parts.length) {
    showToast(parts.join(" • "), 1.25);
  } else {
    showToast(cfg.name || "Collectable", 1.0);
  }
}

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

    drawCollectBeam(c, ox, oy);

    const maxSize = Math.max(sp.w || 64, sp.h || 64) * (sp.scale || 1);
    if (x < -maxSize || y < -maxSize || x > innerWidth + maxSize || y > innerHeight + maxSize) {
      continue;
    }

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
      ctx.drawImage(img, -w / 2, -h / 2, w, h);

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
  const cfg = NPC_TYPES[type];
  if (!cfg) return null;
  const onKillCfg = cfg?.onKill ? JSON.parse(JSON.stringify(cfg.onKill)) : null;

  const e = {
    id: newId(),
    type,
    name: cfg.name || type,

    spritePlay: !!cfg.playSprite,
    spriteFps: Number(cfg.spriteSpeed ?? 12),
    spriteAcc: 0,
    spriteIdx: 0,

    empT: 0,

    x,
    y,
    vx: 0,
    vy: 0,
    wobble: rand(0, 999),
    r: cfg.r ?? 18,

    hpMax: Math.floor(cfg.hp ?? 50),
    hp: 0,
    shMax: Math.floor(cfg.shield ?? 0),
    sh: 0,

    speed: Math.floor(vary(cfg.speed ?? 320, 0.05)),
    dr: cfg.dr ?? 0,

    touchDmg: cfg.touchDmg ?? (14 + wave * 0.25),
    value: cfg.value ?? 0,

    canShoot: cfg.canShoot !== false,
    shootRange: cfg.shootRange ?? 540,
    shootCd: rand(0.2, 0.7),
    shootRate: cfg.shootRate ?? 1.0,

    bulletSpeed: cfg.bulletSpeed ?? 500,
    bulletDmg: cfg.bulletDmg ?? 6,
    bulletSpread: cfg.bulletSpread ?? 0.05,
    burst: cfg.burst ?? 1,

    bulletSprite: cfg.bulletSprite || null,
    bulletScale: cfg.bulletScale ?? 1.5,
    bulletR: cfg.bulletR ?? 7,
    orbit: cfg.orbit ?? 0.45,

    angle: (type === "npc_Cubikon") ? 0 : rand(0, TAU),
    freezeT: 0,

    passiveNative: !!cfg.passiveNative,
    _provoked: false,
    _onKill: onKillCfg,
  };

  e.hp = e.hpMax;
  e.sh = e.shMax;

  if (e.bulletSprite?.src) getCachedImage(e.bulletSprite.src);
  ensureNpcPreview(type);
  ensureNpcLoaded(type);
  
  if (cfg.onKill && !e._onKill) {
    e._onKill = cfg.onKill;
  }

  if (type === "npc_Cubikon") {
  e._spawnedOnce = false;
  e._sinceHit = 999;
  e._resetting = false;
  e._minionIds = [];

  e._animPhase = null;         // "delay" | "open" | "hold" | "close"
  e._openDelayT = 0;           // ✅ NEW
  e._holdLastT = 0;
  e.spriteDir = 1;
  e._pendingSpawn = 0;

  e.spriteFps = 20;
}

  enemiesById.set(e.id, e);

  return e;
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

function drainShieldFromEnemy(e, amount) {
  if (!e || e.hp <= 0) {
    return { total: 0, sh: 0, hp: 0, bypass: 0, isCrit: false, rawDamage: 0, sab: true };
  }

  const raw = Math.max(1, Number(amount) || 1);

  // ✅ La SAB ne touche QUE le bouclier.
  const stolen = drainShield(e, raw);

  if (stolen <= 0) {
    return { total: 0, sh: 0, hp: 0, bypass: 0, isCrit: false, rawDamage: 0, sab: true };
  }

  // ✅ Transfert vers ton vaisseau, sans dépasser ton shield max.
  const gain = stolen * SAB50.transferPct;
  player.sh = Math.min(player.shMax, player.sh + gain);

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
    isCrit: false,
    rawDamage: stolen,
    sab: true,
  };
}

// ============================================================
// Combat
// ============================================================
function damageEnemy(e, dmg) {
  if (!e || e.hp <= 0) return { total: 0, sh: 0, hp: 0, bypass: 0, isCrit: false, rawDamage: 0 };

  const result = damageEnemyLayers(e, dmg, { shieldPenetration: player.shPen });
  const shD = result.sh;
  const hpD = result.hp;

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

  damagePlayerLayers(player, amount);

  const shown = Math.max(1, Math.round(amount));

  const offsetX = (Math.random() - 0.5) * 60;
  const offsetY = -90 - Math.random() * 20;

  addFloatText(player.x + offsetX, player.y + offsetY, shown, "rgba(255,80,100,0.95)", {
    size: 18,
    pop: 0.3,
    shake: 0.6,
    life: 1,
    glow: 1.0,
    weight: 900,
    impact: true
  });

  if (player.hp <= 0) {
    player.hp = 0;
    die();
  }
}

function killRewards(e) {
  player.kills++;
  player.credits += e.value || 0;
  markProgressDirty();
  renderAmmoShop();
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
      runOnKillAction(e._onKill, { x: e.x, y: e.y });
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

    if (!e.noRewards) killRewards(e);
    
    if (e.type === "npc_Protegit" && e.masterId) {
      const cub = getEnemyById(e.masterId);
      if (cub && Array.isArray(cub._minionIds)) {
        cub._minionIds = cub._minionIds.filter(id => id !== e.id);
      }
    }

    enemies.splice(i, 1);
  }
}

function runOnKillAction(action, pos = null) {
  if (!action) return;
  
  if (action.spawn && pos) {
    for (const s of action.spawn) {
      const count = Math.max(1, Number(s.count || 1));
      const radius = Math.max(40, Number(s.radius || 260));

      for (let i = 0; i < count; i++) {
        const ang = Math.random() * Math.PI * 2;
        const d = 60 + Math.random() * radius;

        const sx = clamp(pos.x + Math.cos(ang) * d, 80, WORLD.w - 80);
        const sy = clamp(pos.y + Math.sin(ang) * d, 80, WORLD.h - 80);

        const en = makeEnemy(s.type, sx, sy);
        if (en) enemies.push(en);
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

  if (action.spawn && Array.isArray(action.spawn)) {
    const ox = pos?.x ?? player.x;
    const oy = pos?.y ?? player.y;

    for (const s of action.spawn) {
      const count = Math.max(1, Number(s.count || 1));
      const rad = Math.max(0, Number(s.radius || 220));

      for (let i = 0; i < count; i++) {
        if (enemies.length >= MAX_ALIVE) break;

        const a = Math.random() * Math.PI * 2;
        const d = Math.random() * rad;

        const sx = clamp(ox + Math.cos(a) * d, 80, WORLD.w - 80);
        const sy = clamp(oy + Math.sin(a) * d, 80, WORLD.h - 80);

        const ne = makeEnemy(s.type, sx, sy);
        if (ne) enemies.push(ne);
      }
    }
  }

  const tp = action.tp;
  if (tp?.toMap) {
    setRespawnOverride({ map: tp.toMap, x: tp.x, y: tp.y });

    const cur = window.__CURRENT_MAP_ID__ || "1-1";
    if (typeof window.__GO_TO_MAP__ === "function" && String(cur) !== String(tp.toMap)) {
      window.__GO_TO_MAP__(tp.toMap);
      return;
    }

    resetRun({ randomSpawn: false });
  }
}

// ============================================================
// Skills (Pulse / Nuke)
// ============================================================
const PULSE_COST = 30000;
const NUKE_COST = 100000;

const PULSE_COOLDOWN = 10.0;
const PULSE_RADIUS = 5000000;

let pulseCd = 0;
let iemCd = 0;

function canUseSkill(cost) {
  return started && !paused && !player.dead && player.credits >= cost;
}

function updateSkillUI() {
  const pulseOk = canUseSkill(PULSE_COST) && pulseCd <= 0;
  const nukeOk = canUseSkill(NUKE_COST);
  
  ui.btnPulse.classList.toggle("disabled", !pulseOk);
  ui.btnNuke.classList.toggle("disabled", !nukeOk);
  ui.btnPulse.classList.toggle("ready", pulseOk);
  ui.btnNuke.classList.toggle("ready", nukeOk);
}

function usePulse() {
  const PULSE_DISABLE = 3.0;

  if (!started || paused || player.dead) return;

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

  markProgressDirty();
  renderAmmoShop();

  showToast("IEM !", 1.0);

  let touched = 0;
  for (const e of enemies) {
    if (!e || e.hp <= 0) continue;

    e.empT = Math.max(e.empT || 0, PULSE_DISABLE);
    e._aggro = false;
    e._aggroT = 0;

    touched++;
  }

  if (touched <= 0) showToast("IEM : aucune cible", 0.9);
}

function useNuke() {
  if (!canUseSkill(NUKE_COST)) {
    showToast("Pas assez de crédits (Nucléaire)", 1.2);
    return;
  }
  player.credits -= NUKE_COST;
  markProgressDirty();
  renderAmmoShop();

  waveToSpawn = 0;
  for (const e of enemies) {
    e.hp = 0;
    e.sh = 0;
  }
  processDeaths();
  showToast("NUCLÉAIRE !!!", 1.2);
}

ui.btnPulse.addEventListener("click", () => {
  if (!ui.btnPulse.classList.contains("disabled")) usePulse();
});
ui.btnNuke.addEventListener("click", () => {
  if (!ui.btnNuke.classList.contains("disabled")) useNuke();
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

  lasers.push({ x, y, ang, len, t: 0, dur: durVis, width: LASER.width, targetId });

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

  if (player.dead || paused || !started) return;

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
  if (player.dead || paused || !started) return;

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
  : player.baseDamage * mult;

  const shotMiss = Math.random() < PLAYER_SHOTS.missChance;

  const ang = player.angle;
  const fx = Math.cos(ang), fy = Math.sin(ang);
  const px = -fy, py = fx;

  const muzzleX = player.x + fx * (player.r + 10);
  const muzzleY = player.y + fy * (player.r + 10);

  if (!player.altShot) {
bullets.push({
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
  volleyId,
  volleySize,
    isSab,
  miss: shotMiss,
});
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

bullets.push({
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
  volleyId,
  volleySize,
    isSab,
  miss: shotMiss,
});

bullets.push({
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
  volleyId,
  volleySize,
    isSab,
  miss: shotMiss,
});
  }

  if (ammoKey === "x6") rsbCooldown = RSB_COOLDOWN;

  player.altShot = !player.altShot;
  maybeTriggerLaser();
  player.combatT = 5.0;
  return true;
}

// ✅ Zone map spawner
const isZoneMap = rules?.mode === "zone";
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

function npcIsInSafeZone(e) {
  if (!isZoneMap) return false;
  
  if (zonePortals && zonePortals.length) {
    for (const p of zonePortals) {
      const rr = DEFAULT_PORTAL_RADIUS + SAFE_ZONE_MARGIN;
      if (dist2(e.x, e.y, p.x, p.y) <= rr * rr) {
        return true;
      }
    }
  }

  if (zoneSafe?.zone?.kind === "circle") {
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
let waveToSpawn = 0;
let spawnTimer = 0;
let waveQueue = [];

  function nextTypeInQueue() {
    return waveQueue.length ? waveQueue[0].type : null;
  }

function beginWave() {
  const plan = getWavePlan(wave);
  currentWavePlan = plan;

  waveQueue = (plan.spawns || []).map((s) => ({
    type: s.type,
    left: s.count,
    onKill: s.onKill || null,
  }));

  waveToSpawn = waveQueue.reduce((sum, s) => sum + (s.left || 0), 0);

  spawnTimer = 0.35;
  betweenWaves = false;

  portal.active = false;
  ui.portalOverlay.style.display = "none";
  ui.nextWaveBtn.disabled = false;

  if (!isZoneMap) showToast(`Vague ${wave}`, 1.0);
}

function onWaveCleared() {
  betweenWaves = true;

  portal.active = true;
  portal.x = player.x;
  portal.y = player.y;

  portal.switching = false;
  portal.switchT = 0;

  portal.open = false;
  portal.holding = false;
  portal.holdT = 0;

  portal.startAfterSwitch = false;

  if (ui.portalOverlay) ui.portalOverlay.style.display = "none";
}

function tryStartNextWave() {
  if (!started || paused || player.dead) return;
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

if (waveToSpawn > 0 && enemies.length < MAX_ALIVE) {
  spawnTimer -= dt;
  if (spawnTimer <= 0) {
    const next = waveQueue.length ? waveQueue[0] : null;
    const type = next?.type || DEFAULT_WAVE_TYPE;
    const isCubikon = (type === "npc_Cubikon");

    const extra = clamp((wave - 1) * 40, 0, 2200);
    const minD = 1800 + extra;
    const maxD = 3400 + extra;

    const pos = isCubikon
      ? spawnAtSafeDistance(minD, maxD, 700)
      : spawnRandomOnMap();

    const { x, y } = pos;

    const e = makeEnemy(type, x, y);
    if (e) {
      e._onKill = next?.onKill || null;
      enemies.push(e);
    }

    if (waveQueue.length) {
      waveQueue[0].left--;
      if (waveQueue[0].left <= 0) waveQueue.shift();
    }

    waveToSpawn--;
    spawnTimer = 0.05;
  }
}


  if (waveToSpawn === 0 && enemies.length === 0) {
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
function resetRun({ randomSpawn = false } = {}) {
  let spawnedFromPortal = false;
  attackActive = false;
  betweenWaves = false;
  pendingVolleys.clear();

  portal.active = false;
  if (ui.portalOverlay) ui.portalOverlay.style.display = "none";

bullets.length = 0;
enemyBullets.length = 0;
enemies.length = 0;
pickups.length = 0;
collectables.length = 0;
sparks.length = 0;
floatTexts.length = 0;
lasers.length = 0;
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
    zoneCamps = rules.getZoneSpawns(WORLD).map((c, idx) => ({
      id: idx + 1,
      ...c,
      t: 0,
    }));
  } else {
    zoneCamps = [];
  }

if (isZoneMap && typeof rules.getZonePortals === "function") {
  zonePortals = (rules.getZonePortals(WORLD) || []).map((p, i) => ({
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

  if (isZoneMap && typeof rules.getZoneWalls === "function") {
    zoneWalls = rules.getZoneWalls(WORLD) || [];
  } else {
    zoneWalls = [];
  }

  if (!spawnedFromPortal) {
    const currentMap = window.__CURRENT_MAP_ID__ || "1-1";
    const ov = popRespawnOverride();

    if (ov && String(ov.map || "") === String(currentMap)) {
      player.x = clamp(Number(ov.x) || DEFAULT_SPAWN.x, 80, WORLD.w - 80);
      player.y = clamp(Number(ov.y) || DEFAULT_SPAWN.y, 80, WORLD.h - 80);
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

    if (!st?.map) {
      player.x = clamp(DEFAULT_SPAWN.x, 80, WORLD.w - 80);
      player.y = clamp(DEFAULT_SPAWN.y, 80, WORLD.h - 80);
      console.log(`[SPAWN] Jamais joué => default ${DEFAULT_SPAWN.x},${DEFAULT_SPAWN.y} sur 1-1`);
    } else {
      if (String(st.map) !== String(currentMap)) {
        player.x = clamp(DEFAULT_SPAWN.x, 80, WORLD.w - 80);
        player.y = clamp(DEFAULT_SPAWN.y, 80, WORLD.h - 80);
        console.log(`[SPAWN] Map différente (saved=${st.map}, cur=${currentMap}) => default spawn`);
      } else if (st.pos && st.pos.x != null && st.pos.y != null) {
        player.x = clamp(st.pos.x, 80, WORLD.w - 80);
        player.y = clamp(st.pos.y, 80, WORLD.h - 80);
        console.log(`[SPAWN] Position sauvegardée: ${Math.floor(player.x)}, ${Math.floor(player.y)} sur ${currentMap}`);
      } else {
        player.x = clamp(DEFAULT_SPAWN.x, 80, WORLD.w - 80);
        player.y = clamp(DEFAULT_SPAWN.y, 80, WORLD.h - 80);
        console.log(`[SPAWN] Pas de pos => default spawn`);
      }
    }
  }

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

  wave = 1;
  if (!isZoneMap) beginWave();

  renderAmmoShop();

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

  if (started) {
    const currentMap = window.__CURRENT_MAP_ID__ || "1-1";
    if (SESSION_HANGAR_ID) {
      saveHangarStateById(SESSION_HANGAR_ID, player.x, player.y, currentMap);
    } else {
      saveActiveHangarState(player.x, player.y, currentMap);
    }
  }

  if (isZoneMap) {
    setCenterMsg(false);
    showRespawnOverlay(true);
    return;
  }

  setCenterMsg(true, "Vaisseau détruit", "Réparée à la base.", "Appuie sur <b>R</b> pour respawn.");
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
  setRespawnOverride({ map: "1-1", x: 1500, y: 1500 });

  const cur = window.__CURRENT_MAP_ID__ || "1-1";

  if (typeof window.__GO_TO_MAP__ === "function" && String(cur) !== "1-1") {
    window.__GO_TO_MAP__("1-1");
    return;
  }

  resetRun({ randomSpawn: false });
}

function respawnBase() {
  setRespawnOverride({ map: "1-1", x: 1500, y: 1500 });
  showRespawnOverlay(false);
  setCenterMsg(false);

  const cur = window.__CURRENT_MAP_ID__ || "1-1";
  if (typeof window.__GO_TO_MAP__ === "function" && String(cur) !== "1-1") {
    window.__GO_TO_MAP__("1-1");
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

  setRespawnOverride({ map: curMap, x: p.x, y: p.y });
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
  resetRun({ randomSpawn: true });
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

  if (paused || !started || player.dead) return;

  setMoveTargetFromMiniEvent(e.clientX, e.clientY);

  miniPing = { x: moveTarget.x, y: moveTarget.y, t: 0, dur: 0.75 };

  mini.setPointerCapture(e.pointerId);
}, { passive: false });

mini.addEventListener("pointermove", (e) => {
  if (!e.buttons) return;
  e.preventDefault();
  e.stopPropagation();

  if (paused || !started || player.dead) return;

  setMoveTargetFromMiniEvent(e.clientX, e.clientY);
}, { passive: false });

mini.addEventListener("pointerup", (e) => {
  try { mini.releasePointerCapture(e.pointerId); } catch {}
}, { passive: true });

function drawMinimap() {
  const w = mini.width, h = mini.height;
  mctx.clearRect(0, 0, w, h);

  mctx.fillStyle = "rgba(255,255,255,0.04)";
  mctx.fillRect(0, 0, w, h);

  const sx = w / WORLD.w;
  const sy = h / WORLD.h;

  for (const e of enemies) {
    if (!e || e.hp <= 0) continue;
    const x = e.x * sx;
    const y = e.y * sy;
    const s = clamp((e.r || 18) / 12, 2, 6);

    mctx.fillStyle = "rgba(255,107,122,0.80)";
    mctx.fillRect(x - s / 2, y - s / 2, s, s);
  }

  if (isZoneMap && zonePortals?.length) {
    mctx.save();
    mctx.globalAlpha = 0.9;
    mctx.lineWidth = 2;
    mctx.strokeStyle = "rgba(124,240,255,0.7)";

    for (const p of zonePortals) {
      const x = p.x * sx;
      const y = p.y * sy;

      const s = (sx + sy) * 0.5;
      const rr = (p.r || 200) * s;

      mctx.beginPath();
      mctx.arc(x, y, rr, 0, Math.PI * 2);
      mctx.stroke();
    }

    mctx.restore();
  }

  if (isZoneMap && zoneSafe) {
    const mods = zoneSafe.modules || [];

    mctx.save();
    mctx.globalAlpha = 0.95;

    for (const m of mods) {
      const x = m.x * sx;
      const y = m.y * sy;

      const base = Math.max(m.w || 0, m.h || 0);
      const r = Math.max(3, base * 0.18 * ((sx + sy) * 0.5));

      mctx.fillStyle = "rgba(120,255,160,0.22)";
      mctx.beginPath();
      mctx.arc(x, y, r, 0, Math.PI * 2);
      mctx.fill();

      mctx.strokeStyle = "rgba(120,255,160,0.80)";
      mctx.lineWidth = 1.5;
      mctx.stroke();
    }

    const bea = zoneSafe.beacons || [];
    mctx.fillStyle = "rgba(120,255,160,0.95)";
    for (const b of bea) {
      const x = b.x * sx;
      const y = b.y * sy;
      const r = 2;
      mctx.beginPath();
      mctx.arc(x, y, r, 0, Math.PI * 2);
      mctx.fill();
    }

    mctx.restore();
  }

  mctx.fillStyle = "rgba(124,240,255,1)";
  mctx.beginPath();
  mctx.arc(player.x * sx, player.y * sy, 3.2, 0, Math.PI * 2);
  mctx.fill();

  if (moveTarget.active && !player.dead) {
    const tx = moveTarget.x * sx;
    const ty = moveTarget.y * sy;

    mctx.save();
    mctx.globalAlpha = 0.85;
    mctx.lineWidth = 2;
    mctx.strokeStyle = "rgba(124,240,255,0.75)";

    mctx.beginPath();
    mctx.moveTo(player.x * sx, player.y * sy);
    mctx.lineTo(tx, ty);
    mctx.stroke();

    mctx.fillStyle = "rgba(124,240,255,0.95)";
    mctx.beginPath();
    mctx.arc(tx, ty, 3.2, 0, Math.PI * 2);
    mctx.fill();

    mctx.restore();
  }

  if (miniPing) {
    const p = clamp(miniPing.t / miniPing.dur, 0, 1);
    const a = 1 - p;

    const x = miniPing.x * sx;
    const y = miniPing.y * sy;

    const r0 = 6;
    const r1 = 26;
    const r = r0 + (r1 - r0) * p;

    mctx.save();
    mctx.globalAlpha = a;
    mctx.lineWidth = 2.5;
    mctx.strokeStyle = "rgba(255,210,122,0.95)";
    mctx.beginPath();
    mctx.arc(x, y, r, 0, Math.PI * 2);
    mctx.stroke();

    mctx.globalAlpha = a * 0.25;
    mctx.lineWidth = 6;
    mctx.beginPath();
    mctx.arc(x, y, r, 0, Math.PI * 2);
    mctx.stroke();

    mctx.restore();
  }

  const vw = innerWidth * sx;
  const vh = innerHeight * sy;
  const vx = (camera.x - innerWidth / 2) * sx;
  const vy = (camera.y - innerHeight / 2) * sy;

  mctx.strokeStyle = "rgba(124,240,255,0.6)";
  mctx.strokeRect(vx, vy, vw, vh);
}

// ============================================================
// Labels / colors
// ============================================================
function hpHueColor(pct, alpha = 0.98) {
  const p = clamp(pct, 0, 1);
  const hue = 120 * p;
  return `hsla(${hue}, 95%, 55%, ${alpha})`;
}

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
  ctx.drawImage(img, -w / 2, -h / 2, w, h);

  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.restore();
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
  ctx.drawImage(img, -w / 2, -h / 2, w, h);
  ctx.restore();
}

// ============================================================
// Portal / Toast / MoveTarget / Target (PNG)
// ============================================================
loadImage(LOCK_SPR.src, { priority: true });
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

function drawPortal(ox, oy) {
  if (!portal.active) return;

  const imgA = getCachedImage(PORTAL_IDLE_SPR.src);
  const imgB = getCachedImage(PORTAL_OPEN_SPR.src);
  if (!isImgReady(imgA) || !isImgReady(imgB)) return;

  const x = portal.x + ox;
  const y = portal.y + oy + (PORTAL_IDLE_SPR.yOff || 0);

  const w = PORTAL_IDLE_SPR.w || imgA.naturalWidth || 128;
  const h = PORTAL_IDLE_SPR.h || imgA.naturalHeight || 128;

  let p = portal.open ? 1 : 0;

  if (portal.switching && portal.switchDur > 0) {
    p = clamp(portal.switchT / portal.switchDur, 0, 1);
  }

  ctx.save();
  ctx.imageSmoothingEnabled = false;

  ctx.globalAlpha = 1 - p;
  ctx.drawImage(imgA, x - w / 2, y - h / 2, w, h);

  ctx.globalAlpha = p;
  ctx.drawImage(imgB, x - w / 2, y - h / 2, w, h);

  ctx.restore();
  ctx.globalAlpha = 1;
}

function getPortalOpenFade(ptl) {
  if (!ptl) return 0;

  // ✅ pendant le jump, on garde l'état visuel open figé
  if (ptl.jumping && Number.isFinite(ptl.jumpBaseFade)) {
    return clamp(ptl.jumpBaseFade, 0, 1);
  }

  // ✅ transition open -> idle
  if (ptl.closing) {
    const dur = Math.max(0.1, Number(ptl.closeDur || portal.switchDur || 1));
    const t = clamp(ptl.closeT / dur, 0, 1);
    const from = Number.isFinite(ptl.closeFrom) ? ptl.closeFrom : 1;
    return from * (1 - t);
  }

  // ✅ transition idle -> open
  if (ptl.switching) {
    const dur = Math.max(0.1, Number(portal.switchDur || 1));
    return clamp(ptl.switchT / dur, 0, 1);
  }

  return ptl.open ? 1 : 0;
}

function getPortalJumpFade(ptl) {
  if (!ptl?.jumping) return 0;

  // ✅ transition open -> jump
  if (ptl.jumpSwitching) {
    const dur = Math.max(0.1, Number(ptl.jumpSwitchDur || portal.switchDur || 1));
    return clamp(ptl.jumpSwitchT / dur, 0, 1);
  }

  return 1;
}

function startZonePortalClosing(ptl) {
  if (!ptl || ptl.jumping) return;

  const from = getPortalOpenFade(ptl);

  if (from <= 0.001) {
    ptl.switching = false;
    ptl.holding = false;
    ptl.open = false;
    ptl.switchT = 0;
    ptl.holdT = 0;
    ptl.closing = false;
    ptl.closeT = 0;
    ptl.closeFrom = 0;
    return;
  }

  ptl.switching = false;
  ptl.holding = false;
  ptl.open = false;
  ptl.switchT = 0;
  ptl.holdT = 0;

  ptl.closing = true;
  ptl.closeT = 0;
  ptl.closeFrom = from;
  ptl.closeDur = Math.max(0.1, Number(ptl.closeDur || portal.switchDur || 1));
}

function tickZonePortalVisualTransitions(dt) {
  if (!isZoneMap || !zonePortals?.length) return;

  for (const ptl of zonePortals) {
    if (ptl.closing) {
      ptl.closeT += dt;

      if (ptl.closeT >= Math.max(0.1, Number(ptl.closeDur || portal.switchDur || 1))) {
        ptl.closing = false;
        ptl.closeT = 0;
        ptl.closeFrom = 0;
        ptl.open = false;
      }
    }

    if (ptl.jumpSwitching) {
      ptl.jumpSwitchT += dt;

      if (ptl.jumpSwitchT >= Math.max(0.1, Number(ptl.jumpSwitchDur || portal.switchDur || 1))) {
        ptl.jumpSwitching = false;
        ptl.jumpSwitchT = 0;
      }
    }
  }
}

function drawZonePortals(ox, oy) {
  if (!isZoneMap || !zonePortals?.length) return;

  ctx.save();
  ctx.imageSmoothingEnabled = false;

  for (const ptl of zonePortals) {
    const spr = getPortalSpriteSet(ptl);

    const imgIdle = getCachedImage(spr.idle?.src);
    const imgOpen = getCachedImage(spr.open?.src);

    if (!isImgReady(imgIdle) || !isImgReady(imgOpen)) continue;

    const w = spr.idle.w || imgIdle.naturalWidth || 128;
    const h = spr.idle.h || imgIdle.naturalHeight || 128;
    const yOff = spr.idle.yOff || 0;

    const x = ptl.x + ox;
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
    ctx.drawImage(
      imgOpen,
      x - w / 2,
      y - h / 2,
      w,
      h
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
        ctx.translate(x, y + jumpYOff);
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
  if (!toast) return;
  const p = clamp(toast.t / toast.dur, 0, 1);
  const a = 1 - p;
  const y = innerHeight * 0.35 + (1 - p) * 8;

  ctx.save();
  ctx.globalAlpha = a;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const isSafe = toast && toast.fixed && toast.text === "Zone de Non-Agression";
  ctx.font = isSafe
    ? "900 22px ui-sans-serif, system-ui"
    : "1000 44px ui-sans-serif, system-ui";

  ctx.lineWidth = 0;
  ctx.strokeStyle = "rgba(5,8,20,0.85)";
  ctx.strokeText(toast.text, innerWidth / 2, y);
  ctx.fillStyle = "rgba(215,226,255,0.95)";
  ctx.fillText(toast.text, innerWidth / 2, y);

  ctx.restore();
  ctx.globalAlpha = 1;
}

function drawMoveTarget(ox, oy) {
  if (!moveTarget.active) return;
  const x = moveTarget.x + ox;
  const y = moveTarget.y + oy;

  ctx.save();
  ctx.globalAlpha = 0.9;
  ctx.strokeStyle = "rgba(124,240,255,0.75)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, 16, 0, TAU);
  ctx.stroke();

  ctx.globalAlpha = 0.7;
  ctx.beginPath();
  ctx.moveTo(x - 10, y);
  ctx.lineTo(x + 10, y);
  ctx.moveTo(x, y - 10);
  ctx.lineTo(x, y + 10);
  ctx.stroke();

  ctx.restore();
  ctx.globalAlpha = 1;
}

function drawTargetMarker(e, ox, oy, time) {
  if (!e || e.hp <= 0) return;

  const img = getCachedImage(LOCK_SPR.src);
  if (!isImgReady(img)) return;

  const x = e.x + ox;
  const y = e.y + oy + (LOCK_SPR.yOff || 0);

  const a = 0.85 + Math.sin(time * 8.0) * 0.10;

  ctx.save();
  ctx.globalAlpha = a;
  ctx.imageSmoothingEnabled = false;

  ctx.drawImage(img, x - LOCK_SPR.w / 2, y - LOCK_SPR.h / 2, LOCK_SPR.w, LOCK_SPR.h);

  ctx.restore();
  ctx.globalAlpha = 1;
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
  if (player.dead) return;

  const w = 120, h = 4, gap = 0;
  
  const bx = px - w / 2;
  const by = py - player.r - 72;

  const hpPct = clamp(player.hp / player.hpMax, 0, 1);
  const shPct = player.shMax > 0 ? clamp(player.sh / player.shMax, 0, 1) : 0;

  ctx.save();
  ctx.globalAlpha = 0.95;

  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.fillRect(bx, by, w, h);
  ctx.fillStyle = hpHueColor(hpPct, 0.98);
  ctx.fillRect(bx, by, w * hpPct, h);
  ctx.strokeStyle = "rgba(255,255,255,0.22)";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(bx - 0.5, by - 0.5, w + 1, h + 1);

  if (player.shMax > 0) {
    const sy = by + h + gap;
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.fillRect(bx, sy, w, h);
    ctx.fillStyle = "rgba(124,240,255,0.90)";
    ctx.fillRect(bx, sy, w * shPct, h);
    ctx.strokeStyle = "rgba(255,255,255,0.22)";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(bx - 0.5, sy - 0.5, w + 1, h + 1);
  }

  const user = account.user;
  const playerName = user?.username || "Admin TEST";
  
  ctx.font = "900 16px ui-sans-serif, system-ui";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  
  const nameY = py + player.r + 90;
  
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(5,8,20,0.90)";
  ctx.strokeText(playerName, px, nameY);
  
  ctx.fillStyle = "rgba(124,240,255,0.95)";
  ctx.fillText(playerName, px, nameY);

  ctx.restore();
  ctx.globalAlpha = 1;
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
    for (const p of zonePortals) {
      const rr = DEFAULT_PORTAL_RADIUS;
      if (dist2(player.x, player.y, p.x, p.y) <= rr * rr) return true;
    }
  }

  if (zoneSafe?.zone?.kind === "circle") {
    const z = zoneSafe.zone;
    if (dist2(player.x, player.y, z.x, z.y) <= (z.r || 0) * (z.r || 0)) return true;
  }

  return false;
}

function enemyShoot(e, dt) {
  if (!e || e.hp <= 0) return;
  if ((e.empT || 0) > 0) return;

  if (safeZoneActive && playerIsInSafeZone()) return;

  if (rules?.mode === "zone") {
    if (e.passiveNative && !e._provoked) return;
  }

  if (e.canShoot === false) return;
  if ((e.shootRange ?? -1) <= 0) return;
  if ((e.shootRate ?? 0) <= 0) return;

  e.shootCd = (e.shootCd ?? 0) - dt;
  if (e.shootCd > 0) return;

  if (player.dead) {
    e.shootCd = 0.5 + Math.random() * 0.6;
    return;
  }

  const r = e.shootRange || 0;
  const d2p = dist2(e.x, e.y, player.x, player.y);

  if (d2p > r * r) {
    e.shootCd = 0.12 + Math.random() * 0.18;
    return;
  }

  const baseCd = 1 / Math.max(0.001, e.shootRate || 1);
  e.shootCd = baseCd * (0.85 + Math.random() * 0.3);

  const ang0 = Math.atan2(player.y - e.y, player.x - e.x);
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

    enemyBullets.push({
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

      target: "player",
      homing: NPC_SHOTS.homing,
      miss: willMiss,
      hitRadiusBonus: NPC_SHOTS.hitRadiusBonus,
    });
  }
}

function pointInRect(x, y, r) {
  return !!r && x >= r.x1 && x <= r.x2 && y >= r.y1 && y <= r.y2;
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

  e.vx += nx * spd * dt;
  e.vy += ny * spd * dt;

e.vx *= Math.pow(0.95, dt * 60);
e.vy *= Math.pow(0.95, dt * 60);

  const v = Math.hypot(e.vx, e.vy);
  if (v > spd) {
    const s = spd / v;
    e.vx *= s;
    e.vy *= s;
  }

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
  if (paused) return;
  rebuildEnemyIndex();
  player.combatT = Math.max(0, (player.combatT || 0) - dt);

  fireCooldown = Math.max(0, fireCooldown - dt);
  laserCd = Math.max(0, laserCd - dt);
  rsbCooldown = Math.max(0, rsbCooldown - dt);
  pulseCd = Math.max(0, pulseCd - dt);

  if (account.user && account.dirty) {
    account.saveCd -= dt;
    if (account.saveCd <= 0) saveProgressNow();
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
    if (toast.dur !== Infinity && toast.t >= toast.dur) toast = null;
  }

  if (miniPing) {
    miniPing.t += dt;
    if (miniPing.t >= miniPing.dur) miniPing = null;
  }

  if (portal.active) {
    if (portal.switching) {
      portal.switchT += dt;
      if (portal.switchT >= portal.switchDur) {
        portal.switchT = portal.switchDur;
        portal.switching = false;

        portal.open = true;
        portal.holding = true;
        portal.holdT = 0;
      }
    }

    if (portal.holding) {
      portal.holdT += dt;
      if (portal.holdT >= portal.holdDur) {
        portal.holdT = portal.holdDur;
        portal.holding = false;

        if (portal.startAfterSwitch) {
          portal.startAfterSwitch = false;

          betweenWaves = false;
          portal.active = false;
          portal.open = false;

          wave++;
          beginWave();
        }
      }
    }
  }

  refreshHoldMoveTarget();
  let mx = 0, my = 0;

if (moveTarget.active && !player.dead) {
  const dx = moveTarget.x - player.x;
  const dy = moveTarget.y - player.y;
  const d = Math.hypot(dx, dy);

  if (d < 18) {
    moveTarget.active = false;
  } else {
    mx = dx / d;
    my = dy / d;
  }
}

// ✅ mouvement uniquement à la souris
let ax = mx;
let ay = my;

const maxSpeed = Math.max(10, Number(player.baseSpeed || 0));

// ✅ Plus cette valeur est haute, plus le vaisseau atteint vite sa vitesse max
const MOVE_RESPONSE = 6.5;

// ✅ Plus cette valeur est haute, plus le vaisseau freine vite quand tu arrêtes de bouger
const STOP_RESPONSE = 7.5;

if (!player.dead && (ax || ay)) {
  const len = Math.hypot(ax, ay) || 1;
  ax /= len;
  ay /= len;

  const targetVx = ax * maxSpeed;
  const targetVy = ay * maxSpeed;

  const t = 1 - Math.exp(-MOVE_RESPONSE * dt);

  player.vx += (targetVx - player.vx) * t;
  player.vy += (targetVy - player.vy) * t;
} else {
  const t = 1 - Math.exp(-STOP_RESPONSE * dt);

  player.vx += (0 - player.vx) * t;
  player.vy += (0 - player.vy) * t;
}

// Sécurité : ne jamais dépasser la vitesse max
const sp = Math.hypot(player.vx, player.vy);
if (sp > maxSpeed) {
  const s = maxSpeed / sp;
  player.vx *= s;
  player.vy *= s;
}

  if (!player.dead) {
    player.x = player.x + player.vx * dt;
    player.y = player.y + player.vy * dt;

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

  if (!player.dead && started && !paused) {
    starScrollX += (-player.vx * dt) * STAR_SCROLL_FACTOR;
    starScrollY += (-player.vy * dt) * STAR_SCROLL_FACTOR;

    starScrollX %= STAR_TILE.width;
    starScrollY %= STAR_TILE.height;
  }

  applyRadiation(dt);

  player.iFrames = Math.max(0, player.iFrames - dt);
  tickRepair(dt);
  tickRepairOrbitFx(dt);
  tickCollectables(dt);

  if (!isZoneMap) waveController(dt);
  else zoneController(dt);

  mapPortalLock = Math.max(0, mapPortalLock - dt);
  portalHintCd = Math.max(0, portalHintCd - dt);
  tickZonePortalVisualTransitions(dt);
  if (tickZonePortalJumps(dt)) return;

  if (isZoneMap && started && !player.dead && zonePortals.length) {
    let near = null;

    for (const p of zonePortals) {
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
      safeZoneActive = (player.combatT <= 0 && !attackActive);

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

      if (inModules) {
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
    bullets.splice(i, 1);
    cleanupPlayerMissVolley(b);
    continue;
  }

  const oldX = b.x;
  const oldY = b.y;

  b.x += b.vx * dt;
  b.y += b.vy * dt;
  b.life -= dt;

  const rr = (t.r || 18) + (b.r || 6);

  if (segCircleHit(oldX, oldY, b.x, b.y, t.x, t.y, rr)) {
    if (b.miss) {
      showPlayerMissOnce(b, t);

      spawnSpark(b.x, b.y, false);
      bullets.splice(i, 1);
      cleanupPlayerMissVolley(b);
      continue;
    }

    const out = b.isSab
      ? drainShieldFromEnemy(t, b.dmg)
      : damageEnemy(t, b.dmg);

    if (out.total > 0) {
      queueVolleyFloat(t, out, b.volleyId, b.volleySize);
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
    bullets.splice(i, 1);
    cleanupPlayerMissVolley(b);
    continue;
  }

  if (b.life <= 0) {
    bullets.splice(i, 1);
    cleanupPlayerMissVolley(b);
  }
}

for (let i = enemyBullets.length - 1; i >= 0; i--) {
  const b = enemyBullets[i];

  const oldX = b.x;
  const oldY = b.y;

  // Le tir NPC recalcule sa direction vers le joueur.
  // Donc visuellement, il ne passe plus à côté.
  if (!player.dead && b.target === "player" && b.homing) {
    const dx = player.x - b.x;
    const dy = player.y - b.y;
    const d = Math.hypot(dx, dy) || 1;

    const spd = Math.max(120, b.spd || Math.hypot(b.vx, b.vy) || 900);

    b.vx = (dx / d) * spd;
    b.vy = (dy / d) * spd;
  }

  b.x += b.vx * dt;
  b.y += b.vy * dt;
  b.life -= dt;

  if (!player.dead) {
    const rr = (b.r || 0) + player.r + (b.hitRadiusBonus || 0);

    if (segCircleHit(oldX, oldY, b.x, b.y, player.x, player.y, rr)) {
      enemyBullets.splice(i, 1);

      if (b.miss) {
        addMissText(
          player.x + (Math.random() - 0.5) * 50,
          player.y - 85 - Math.random() * 20
        );

        spawnSpark(player.x, player.y, false);
      } else {
        hurtPlayer(b.dmg);
        spawnSpark(player.x, player.y, false);
      }

      continue;
    }
  }

  if (b.life <= 0) enemyBullets.splice(i, 1);
}

  for (let i = sparks.length - 1; i >= 0; i--) {
    sparks[i].t += dt;
    if (sparks[i].t > 0.25) sparks.splice(i, 1);
  }

  for (let i = floatTexts.length - 1; i >= 0; i--) {
    const ft = floatTexts[i];
    ft.t += dt;

    ft.x += (ft.vx || 0) * dt;
    ft.y += (ft.vy || 0) * dt;

    ft.vx *= Math.pow(0.90, dt * 60);
    ft.vy *= Math.pow(0.92, dt * 60);

    if (ft.t >= ft.life) floatTexts.splice(i, 1);
  }

  for (let i = pickups.length - 1; i >= 0; i--) {
    const pck = pickups[i];
    pck.t += dt;
    if (player.dead) continue;

    const dx = player.x - pck.x;
    const dy = player.y - pck.y;
    const d = Math.hypot(dx, dy) || 1;

    const spdLoot = 2200 + d * 2.8;
    pck.x += (dx / d) * spdLoot * dt;
    pck.y += (dy / d) * spdLoot * dt;

    if (d < 28) {
      player.credits += pck.credits || 0;
      markProgressDirty();
      pickups.splice(i, 1);
      renderAmmoShop();
    }
  }

  applyNpcSeparation(dt);
  
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];

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

    if (!frozen) enemyShoot(e, dt);

    const dx = player.x - e.x;
    const dy = player.y - e.y;
    const d = Math.hypot(dx, dy) || 1;
    const nx = dx / d, ny = dy / d;

    const zoneMode = rules?.mode === "zone";

    if (emp) {
      e._aggro = false;
      e._aggroT = 0;
      if (e.aiZ) e.aiZ.state = "wander";

      tickEmpWander(e, dt);
      continue;
    }

    if (frozen) {
      e.vx *= Math.pow(0.55, dt * 60);
      e.vy *= Math.pow(0.55, dt * 60);
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
e.vx += mxv * spdE * 1.35 * dt;
e.vy += myv * spdE * 1.35 * dt;

            e.vx *= Math.pow(0.95, dt * 60);
            e.vy *= Math.pow(0.95, dt * 60);

            const v = Math.hypot(e.vx, e.vy);
            if (v > spdE) {
              const s = spdE / v;
              e.vx *= s; 
              e.vy *= s;
            }

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
          if (e._aggro && e._aggroT <= 0) e._aggro = false;
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
e.vx += mxv * spdE * 1.35 * dt;
e.vy += myv * spdE * 1.35 * dt;

e.vx *= Math.pow(0.95, dt * 60);
e.vy *= Math.pow(0.95, dt * 60);

        const espN = Math.hypot(e.vx, e.vy);
        if (espN > spdE) {
          const s = spdE / espN;
          e.vx *= s; 
          e.vy *= s;
        }

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

e.vx += mxv * spdE * 1.35 * dt;
e.vy += myv * spdE * 1.35 * dt;

e.vx *= Math.pow(0.95, dt * 60);
e.vy *= Math.pow(0.95, dt * 60);

        const esp = Math.hypot(e.vx, e.vy);
        if (esp > spdE) {
          const s = spdE / esp;
          e.vx *= s; 
          e.vy *= s;
        }
      }
    }

    const spd2 = e.vx * e.vx + e.vy * e.vy;
    const zoneMode2 = rules?.mode === "zone";

    let shouldFacePlayer = false;

    if (zoneMode2) {
      shouldFacePlayer = (e.aiZ?.state === "aggro");
    } else {
      const d2p = dist2(e.x, e.y, player.x, player.y);
      const r = (e.shootRange || 540);
      shouldFacePlayer = d2p <= r * r;
    }

    if (shouldFacePlayer) {
      e.angle = Math.atan2(player.y - e.y, player.x - e.x);
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

  processDeaths();

  camera.x += (player.x - camera.x) * (1 - Math.pow(0.0009, dt * 60));
  camera.y += (player.y - camera.y) * (1 - Math.pow(0.0009, dt * 60));

  keyboard.endFrame();
}

// ============================================================
// Render
// ============================================================
const WALL_TEX = {
  src: "assets/BlockZone.png",
  w: 64,
  h: 64,
};

loadImage(WALL_TEX.src, { priority: true });

function drawZoneWalls(ox, oy) {
  if (!isZoneMap || !zoneWalls?.length) return;

  const img = getCachedImage(WALL_TEX.src);
  if (!isImgReady(img)) return;

  const pat = ctx.createPattern(img, "repeat");
  if (!pat) return;

  const iw = img.naturalWidth || img.width || 1;
  const ih = img.naturalHeight || img.height || 1;

  const sx = (WALL_TEX.w || iw) / iw;
  const sy = (WALL_TEX.h || ih) / ih;

  if (pat.setTransform) {
    pat.setTransform(new DOMMatrix().scale(sx, sy));
  }

  ctx.save();

  for (const w of zoneWalls) {
    const left = (w.x - w.w / 2) + ox;
    const top = (w.y - w.h / 2) + oy;

    ctx.save();
    ctx.translate(left, top);

    ctx.fillStyle = pat;
    ctx.fillRect(0, 0, w.w, w.h);

    ctx.restore();
  }

  ctx.restore();
}

function drawBackgroundLayers(ox, oy) {
  if (!BG_LAYERS || !BG_LAYERS.length) return;

  for (const L of BG_LAYERS) {
    const img = getCachedImage(L.src);
    if (!isImgReady(img)) continue;

    const alpha = clamp(L.alpha ?? 1, 0, 1);
    const par = Number(L.parallax ?? 0);

    const px = ox * par;
    const py = oy * par;

    ctx.save();
    ctx.globalAlpha = alpha;

    if (L.blend) ctx.globalCompositeOperation = L.blend;

    const iw = img.naturalWidth || img.width || 1;
    const ih = img.naturalHeight || img.height || 1;

    if (L.mode === "tile") {
      const pat = ctx.createPattern(img, "repeat");
      if (pat) {
        ctx.translate(px, py);
        ctx.fillStyle = pat;
        ctx.fillRect(-px, -py, innerWidth, innerHeight);
      }
      ctx.restore();
      ctx.globalCompositeOperation = "source-over";
      continue;
    }

    const sx = innerWidth / iw;
    const sy = innerHeight / ih;
    const s = (L.mode === "contain") ? Math.min(sx, sy) : Math.max(sx, sy);

    const dw = iw * s;
    const dh = ih * s;

    const x = (innerWidth - dw) * 0.5 + px;
    const y = (innerHeight - dh) * 0.5 + py;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, x, y, dw, dh);
    ctx.imageSmoothingEnabled = false;

    ctx.restore();
    ctx.globalCompositeOperation = "source-over";
  }
}

function draw() {
  ctx.fillStyle = "#050814";
  ctx.fillRect(0, 0, innerWidth, innerHeight);

  const ox = innerWidth / 2 - camera.x;
  const oy = innerHeight / 2 - camera.y;

if (GAME_SETTINGS.background) {
  drawBackgroundLayers(ox, oy);
}

if (GAME_SETTINGS.textures) {
  drawZoneWalls(ox, oy);
}

  ctx.save();
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = STAR_PATTERN;

  const spx = (starScrollX % STAR_TILE.width) - STAR_TILE.width;
  const spy = (starScrollY % STAR_TILE.height) - STAR_TILE.height;

  ctx.translate(spx, spy);
  ctx.fillRect(0, 0, innerWidth + STAR_TILE.width * 2, innerHeight + STAR_TILE.height * 2);
  ctx.restore();

  drawPortal(ox, oy);
  drawZonePortals(ox, oy);
  drawSafeModules(ox, oy);
  drawMoveTarget(ox, oy);
  drawPulseFx(ox, oy);
  drawCollectables(ox, oy);

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

  for (const e of enemies) {
    if (e.hp <= 0) continue;

    const x = e.x + ox, y = e.y + oy;
    if (x < -220 || y < -220 || x > innerWidth + 220 || y > innerHeight + 220) continue;

    ctx.save();
    ctx.translate(x, y);

    ctx.fillStyle = "rgba(255,107,122,0.86)";
    ctx.strokeStyle = "rgba(255,255,255,0.16)";
    ctx.lineWidth = 2;

    drawEnemyBody(e);

    const pct = clamp(e.hp / e.hpMax, 0, 1);
    const w = e.r * 2.6;
    const h = 4;
    const bx = -w / 2;
    const by = -e.r - 35 - h;

    if ((e.shMax || 0) > 0) {
      const spct = clamp(e.sh / e.shMax, 0, 1);
      const sy2 = by + h;

      ctx.save();
      ctx.globalAlpha = 0.95;
      ctx.fillStyle = "rgba(0,0,0,0.45)";
      ctx.fillRect(bx, sy2, w, h);
      ctx.fillStyle = "rgba(124,240,255,0.90)";
      ctx.fillRect(bx, sy2, w * spct, h);
      ctx.strokeStyle = "rgba(255,255,255,0.22)";
      ctx.lineWidth = 1;
      ctx.strokeRect(bx - 0.5, sy2 - 0.5, w + 1, h + 1);
      ctx.restore();
    }

    ctx.save();
    ctx.globalAlpha = 0.95;
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.fillRect(bx, by, w, h);

    const col = hpHueColor(pct, 0.98);
    ctx.fillStyle = col;
    ctx.fillRect(bx, by, w * pct, h);

    ctx.strokeStyle = "rgba(255,255,255,0.22)";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(bx - 0.5, by - 0.5, w + 1, h + 1);
    ctx.restore();

    const label = npcLabelFor(e);
    
    ctx.save();
    ctx.globalAlpha = 0.98;
    ctx.font = "900 13px ui-sans-serif, system-ui";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    
    const labelY = e.r + 35;
    
    ctx.lineWidth = 0;
    ctx.strokeStyle = "rgba(5,8,20,0.90)";
    ctx.strokeText(label, 0, labelY);
    
    ctx.fillStyle = "rgba(255,59,78,0.95)";
    ctx.fillText(label, 0, labelY);
    
    ctx.restore();

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

    const blink = player.iFrames > 0 ? Math.sin(performance.now() * 0.03) * 0.35 + 0.65 : 1;
    ctx.globalAlpha = blink;

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

  const t = Target.get();
  if (t) drawTargetMarker(t, ox, oy, performance.now() / 1000);

  drawPlayerBars(px, py);
  drawMinimap();
  drawToast();
}

// ============================================================
// UI update
// ============================================================
function drawUI() {
  const zoneMode = rules?.mode === "zone";

  if (ui.boxWave) ui.boxWave.style.display = zoneMode ? "none" : "block";
  if (ui.boxMeta) ui.boxMeta.style.display = "block";
  if (ui.boxVitals) ui.boxVitals.style.display = "block";

  if (ui.credits) ui.credits.textContent = String(player.credits);
  if (ui.kills) ui.kills.textContent = String(player.kills);

const u = account.user || null;
const st = u?.stats || {};

const honor = Number(st.honor || 0);
const exp = Number(st.exp || 0);
const rankPoints = Number(st.rankPoints || 0);
const lvl = getLevelInfo(exp);

if (ui.honorTxt) ui.honorTxt.textContent = String(Math.floor(honor));
if (ui.xpTxt) ui.xpTxt.textContent = String(Math.floor(exp));
if (ui.rankPtsTxt) ui.rankPtsTxt.textContent = String(Math.floor(rankPoints));

if (ui.lvlTxt) {
  ui.lvlTxt.textContent = `${lvl.level} (${lvl.pct}%)`;
}

if (ui.spdTxt) {
  const spd = getSpeedBreakdown();

  ui.spdTxt.textContent = String(spd.total);

  ui.spdTxt.title =
    `Vaisseau: ${spd.base}` +
    ` | Générateurs: +${spd.genSpeed}` +
    ` | Modules vitesse: +${spd.speedPct}%` +
    ` | Config ${spd.config}`;

  // Debug console si vitesse anormale
  if (spd.total > spd.base && !window.__speedDebugShown) {
    window.__speedDebugShown = true;
    console.log("🚀 SPEED DEBUG", spd);
  }
}

updateConfigButtons();

  if (ui.hpTxt) ui.hpTxt.textContent = `${Math.max(0, Math.floor(player.hp))} / ${player.hpMax}`;
  if (ui.shTxt) ui.shTxt.textContent = `${Math.max(0, Math.floor(player.sh))} / ${player.shMax}`;
  if (ui.hpBar) ui.hpBar.style.width = `${clamp((player.hp / player.hpMax) * 100, 0, 100)}%`;
  if (ui.shBar) ui.shBar.style.width = `${clamp((player.sh / player.shMax) * 100, 0, 100)}%`;

  if (ui.waveTxt) ui.waveTxt.textContent = started ? String(wave) : "—";
  if (ui.spawnLeftTxt) ui.spawnLeftTxt.textContent = started ? String(waveToSpawn) : "—";
  if (ui.aliveTxt) ui.aliveTxt.textContent = started ? String(enemies.length) : "—";

  if (ui.shopCredits) ui.shopCredits.textContent = String(player.credits);

  updateSkillUI();
  updateRepairUI();

  const pulsePct = getPulsePercent();
  if (ui.pulsePct) ui.pulsePct.textContent = `${pulsePct}%`;

  if (ui.pulsePrice) {
    if (pulseCd > 0) ui.pulsePrice.textContent = `${pulseCd.toFixed(1)}s`;
    else ui.pulsePrice.textContent = "30,000 Cr.";
  }

  const rsbPct = getRsbPercent();
  if (ui.cntX6) ui.cntX6.textContent = `${player.ammo.x6} • ${rsbPct}%`;
  if (ui.btnX6) ui.btnX6.classList.toggle(
    "ready",
    started && !paused && !player.dead && ammoCount("x6") > 0 && rsbCooldown <= 0
  );

  if (ui.miniMapName) ui.miniMapName.textContent = `Map : ${rules?.mapLabel || "—"}`;
  if (ui.miniPos) ui.miniPos.textContent = `Pos : ${Math.floor(player.x)} / ${Math.floor(player.y)}`;

  if (ui.fpsTxt) ui.fpsTxt.textContent = String(fpsValue || 0);
}

// ============================================================
// Start game
// ============================================================
let starting = false;

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

  paused = false;
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
  setCenterMsg(false);

  starting = false;
}

// ============================================================
// Frame loop
// ============================================================
let last = performance.now();
let fpsAcc = 0;
let fpsFrames = 0;
let fpsValue = 0;

function frame(t) {
  const dt = Math.min(0.033, (t - last) / 1000);
  last = t;

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
    paused = true;
    setCenterMsg(true, "Erreur JS", "Ouvre la console (F12) et copie l'erreur <b>CRASH</b>.", "");
  }
  requestAnimationFrame(frame);
}

// ============================================================
// Init
// ============================================================
function saveStateImmediate() {
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

resetPlayerToBase();
updateAmmoUI();
setAmmo("x1");
renderAmmoShop();

const cur = getCurrentUserFull() || null;

if (!cur) {
  location.href = "./public/auth.html";
  return;
}

const pack = SHIP_PACKS.find(p => p.id === cur.ship) || SHIP_PACKS[0];
ACTIVE_SHIP = pack;

ensurePackLoaded(pack).then(() => {
  playerImgs = pack._imgs;
  playerImgsReady = true;
  startGame();
});

setCenterMsg(false);
requestAnimationFrame(frame);

}
