"use strict";

// SRC/DATA/SKYLAB.js — Données + logique pure du Skylab (fidèle au vrai DarkOrbit).
// Valeurs officielles : https://darkorbitwiki.com/skylab/ (2 coquilles du wiki
// corrigées et signalées par "CORRIGE WIKI").
// Le jeu n'a pas d'uridium : les coûts uridium du wiki sont convertis en
// crédits (x1000, comme le reste de la boutique).
// Échelle de temps : SKYLAB_TIME_SCALE = 60 (1 h du vrai DO = 1 min en jeu),
// choisie pour rester jouable. La production est accélérée d'autant
// (1 heure de production DO par minute réelle).

export const SKYLAB_TIME_SCALE = 60;
export const SKYLAB_PRODUCTION_MULT = 10;
// Cycles de raffinage par seconde et par niveau : consommation graduelle
// (jamais de siphon instantané du stock).
export const SKYLAB_REFINERY_CYCLES_PER_SEC = 0.1;
export const SKYLAB_MAX_LEVEL = 20;
export const SKYLAB_TRANSPORT_COOLDOWN_SEC = 30;
export const SKYLAB_ROBOT_LIFETIME_MS = 12 * 3600 * 1000;
export const SKYLAB_ROBOT_CREDIT_COST = 50000; // robot unique : +5 % productivité
export const SKYLAB_MAX_ROBOTS = 12;
// Envoi immédiat : 1250 uridium sur DO → x1000 crédits (comme la boutique).
export const SKYLAB_INSTANT_TRANSPORT_COST = 1250000;

// Ressources gérées par le Skylab (stock séparé de la soute du vaisseau).
export const SKYLAB_RESOURCE_IDS = Object.freeze([
  "prometium", "endurium", "terbium",
  "prometid", "duranium", "xenomit",
  "promerium", "seprom",
]);

// Production / heure de jeu par niveau (index 0 = niveau 1).
const COLLECTOR_RATE = Object.freeze([16, 19, 24, 31, 40, 51, 64, 79, 96, 115, 136, 159, 184, 211, 240, 271, 304, 339, 376, 415]);
const REFINERY_RATE_BASIC = Object.freeze([110, 370, 752, 1245, 1839, 2530, 3314, 4186, 5144, 6186, 7309, 8511, 9790, 11146, 12576, 14080, 15656, 17303, 19020, 20750]); // CORRIGE WIKI : L20 "20.06" -> ~20750
const REFINERY_RATE_PROMERIUM = Object.freeze([11, 37, 75, 124, 184, 253, 331, 419, 514, 619, 731, 851, 979, 1115, 1258, 1408, 1566, 1730, 1902, 2081]); // CORRIGE WIKI : L18 "1.30" -> ~1730
const REFINERY_RATE_SEPROM = Object.freeze([1, 3, 7, 11, 17, 23, 30, 38, 47, 56, 66, 77, 89, 101, 114, 128, 142, 157, 173, 189]);
const SOLAR_ENERGY = Object.freeze([170, 210, 270, 350, 450, 570, 710, 870, 1050, 1250, 1470, 1710, 1970, 2250, 2550, 2870, 3210, 3570, 3950, 4350]);

// Stockage max par niveau de STORAGE (index 0 = niveau 1).
const STORAGE_RAW = Object.freeze([105600, 355195, 722148, 1194728, 1765474, 2429006, 3181160, 4018569, 4938423, 5938324, 7016186, 8170170, 9398635, 10700104, 12073234, 13516800, 15029673, 16610810, 18259241, 19974063]);
const STORAGE_REFINED = Object.freeze([5280, 17760, 36107, 59763, 88274, 121450, 159058, 200925, 246921, 296916, 350809, 408509, 469932, 535005, 603662, 675840, 751484, 830540, 912962, 998703]);
const STORAGE_PROMERIUM = Object.freeze([528, 1776, 3611, 5974, 8827, 12145, 15906, 20093, 24692, 29692, 35081, 40851, 46993, 53501, 60366, 67584, 75148, 83054, 91296, 99870]); // CORRIGE WIKI : L18 "80,054" -> 83054
const STORAGE_SEPROM = Object.freeze([48, 161, 328, 543, 802, 1104, 1446, 1827, 2245, 2699, 3189, 3714, 4272, 4864, 5488, 6144, 6832, 7550, 8300, 9079]);

// Coûts d'amélioration vers le niveau cible (index 0 = cible niveau 2).
// Groupe A : basic / solar / storage. Groupe B : collecteurs. Groupe C : xeno.
// Raffineries dérivées par formules (E = D x5/3, F = E x2), comme le wiki.
const COST_A_CREDITS = Object.freeze([16352, 27144, 38891, 51403, 64560, 78279, 92499, 107171, 122257, 137725, 153550, 169708, 186180, 202949, 220000, 237320, 254896, 272719, 290777]);
const COST_A_RES = Object.freeze([707, 2923, 8000, 17469, 33068, 56718, 90510, 136688, 197642, 275902, 374123, 495087, 641694, 816957, 1024000, 1266051, 1546443, 1868605, 2236068]);
const COST_B_CREDITS = Object.freeze([13081, 21715, 31113, 41122, 51648, 62623, 73999, 85737, 97805, 110180, 122840, 135766, 148944, 162359, 176000, 189856, 203914, 218175, 232622]);
const COST_B_RES = Object.freeze([566, 2338, 6400, 13978, 26454, 45375, 72408, 109350, 158114, 220721, 299298, 396070, 513355, 653566, 819200, 1012841, 1235154, 1494884, 1788854]);
const COST_C_CREDITS = Object.freeze([19622, 32573, 46669, 61683, 77472, 93935, 110998, 128605, 146708, 165270, 184260, 203649, 223416, 243539, 264000, 284784, 305875, 327262, 348933]); // CORRIGE WIKI : L20 "248.933" -> 348933
const COST_C_RES = Object.freeze([849, 3507, 9600, 20963, 39682, 68062, 108612, 164025, 237171, 331082, 448948, 594105, 770033, 980349, 1228800, 1519261, 1855731, 2242327, 2683282]);

// Durées wiki en secondes (niveau cible, index 0 = cible niveau 2).
const TIME_A = Object.freeze([8280, 13440, 19020, 24840, 30900, 37200, 43680, 50280, 54900, 63960, 71040, 78180, 85440, 92820, 100260, 107880, 115500, 123240, 131100]);
const TIME_D = Object.freeze([13800, 22440, 31680, 41400, 51540, 61980, 72840, 83820, 95100, 106620, 118380, 130020, 141980, 154680, 167560, 179760, 192540, 205440, 218460]); // CORRIGE WIKI : palier 8 "36:23" -> 20:14 (72840)

// Construction niveau 1 (les collecteurs / raffineries / xeno démarrent à construire).
const BUILD_COST = Object.freeze({
  prometium_collector: { credits: 5500, res: 50, timeSec: 3600 },
  endurium_collector: { credits: 5500, res: 50, timeSec: 3600 },
  terbium_collector: { credits: 5500, res: 50, timeSec: 3600 },
  xeno_module: { credits: 8250, res: 75, timeSec: 3600 },
  prometid_refinery: { credits: 8250, res: 75, timeSec: 6000 },
  duranium_refinery: { credits: 8250, res: 75, timeSec: 6000 },
  promerium_refinery: { credits: 13750, res: 125, timeSec: 10800 },
  seprom_refinery: { credits: 27500, res: 250, timeSec: 21600 },
});

export const SKYLAB_MODULES = Object.freeze([
  Object.freeze({ id: "basic", name: "Module de base", desc: "Cœur du Skylab. Chaque niveau augmente toute la production de 2 %.", image: null, costGroup: "A", upgradeable: true, startLevel: 1 }),
  Object.freeze({ id: "solar", name: "Module solaire", desc: "Fournit l'énergie. Sans assez d'énergie, la production ralentit.", image: null, costGroup: "A", upgradeable: true, startLevel: 1 }),
  Object.freeze({ id: "storage", name: "Module de stockage", desc: "Augmente la capacité de stockage de toutes les ressources.", image: null, costGroup: "A", upgradeable: true, startLevel: 1 }),
  Object.freeze({ id: "transport", name: "Module de transport", desc: "Envoie les ressources du Skylab vers la soute du vaisseau.", image: null, costGroup: null, upgradeable: false, startLevel: 1 }),
  Object.freeze({ id: "prometium_collector", name: "Collecteur de Prometium", desc: "Produit du Prometium en continu.", image: "ASSETS/SKYLAB/prometium_collector_layer.gif", costGroup: "B", upgradeable: true, startLevel: 0, output: "prometium" }),
  Object.freeze({ id: "endurium_collector", name: "Collecteur d'Endurium", desc: "Produit de l'Endurium en continu.", image: "ASSETS/SKYLAB/endurium_collector_layer.gif", costGroup: "B", upgradeable: true, startLevel: 0, output: "endurium" }),
  Object.freeze({ id: "terbium_collector", name: "Collecteur de Terbium", desc: "Produit du Terbium en continu.", image: "ASSETS/SKYLAB/terbium_collector_layer.gif", costGroup: "B", upgradeable: true, startLevel: 0, output: "terbium" }),
  Object.freeze({ id: "prometid_refinery", name: "Raffinerie de Prometid", desc: "20 Prometium + 10 Endurium → 1 Prometid.", image: "ASSETS/SKYLAB/prometid_refinery_layer.gif", costGroup: "D", upgradeable: true, startLevel: 0 }),
  Object.freeze({ id: "duranium_refinery", name: "Raffinerie de Duranium", desc: "10 Endurium + 20 Terbium → 1 Duranium.", image: "ASSETS/SKYLAB/duranium_refinery_layer.gif", costGroup: "D", upgradeable: true, startLevel: 0 }),
  Object.freeze({ id: "promerium_refinery", name: "Raffinerie de Promerium", desc: "10 Prometid + 10 Duranium + 1 Xenomit → 1 Promerium.", image: "ASSETS/SKYLAB/promerium_refinery_layer.gif", costGroup: "E", upgradeable: true, startLevel: 0 }),
  Object.freeze({ id: "seprom_refinery", name: "Raffinerie de Seprom", desc: "10 Promerium → 1 Seprom.", image: "ASSETS/SKYLAB/seprom_refinery_layer.gif", costGroup: "E2", upgradeable: true, startLevel: 0 }),
  Object.freeze({ id: "xeno_module", name: "Module Xeno", desc: "Produit du Xenomit, consommé en continu par la raffinerie de Promerium.", image: "ASSETS/SKYLAB/xeno_module_layer.gif", costGroup: "C", upgradeable: true, startLevel: 0, output: "xenomit" }),
]);

export function getSkylabModuleDef(moduleId) {
  return SKYLAB_MODULES.find((m) => m.id === String(moduleId || "")) || null;
}

export function isCollectorModule(moduleId) {
  return ["prometium_collector", "endurium_collector", "terbium_collector"].includes(String(moduleId || ""));
}

// Stock de départ : 20 % des ressources de base (sinon impossible de
// construire le premier collecteur, qui coûte du brut du stock Skylab).
export const SKYLAB_STARTER_STOCK = Object.freeze({
  prometium: 21120, // 20 % de STORAGE_RAW niveau 1 (105 600)
  endurium: 21120,
  terbium: 21120,
});

// État initial : les 4 modules de départ niveau 1, le reste à construire.
export function createDefaultSkylabState(nowMs = Date.now()) {
  const modules = {};
  for (const def of SKYLAB_MODULES) {
    modules[def.id] = {
      level: def.startLevel,
      enabled: true,
      upgrading: null, // { to, finishesAt }
      robots: [], // [{ elite, expiresAt }] — collecteurs uniquement
    };
  }
  return {
    modules,
    stock: { prometium: 0, endurium: 0, terbium: 0, prometid: 0, duranium: 0, xenomit: 0, promerium: 0, seprom: 0, ...SKYLAB_STARTER_STOCK },
    lastTickAt: Number(nowMs) || Date.now(),
    transportReadyAt: 0,
    _starterStockGiven: true,
  };
}

// Normalise un état chargé (vieilles sauvegardes, valeurs corrompues).
export function normalizeSkylabState(raw, nowMs = Date.now()) {
  const base = createDefaultSkylabState(nowMs);
  if (!raw || typeof raw !== "object") return base;
  for (const def of SKYLAB_MODULES) {
    const m = raw.modules?.[def.id];
    if (!m || typeof m !== "object") continue;
    const level = Math.max(0, Math.min(SKYLAB_MAX_LEVEL, Math.floor(Number(m.level) || 0)));
    base.modules[def.id].level = level;
    base.modules[def.id].enabled = m.enabled !== false;
    if (m.upgrading && typeof m.upgrading === "object") {
      const to = Math.floor(Number(m.upgrading.to) || 0);
      const finishesAt = Number(m.upgrading.finishesAt) || 0;
      if (to >= 1 && to <= SKYLAB_MAX_LEVEL && finishesAt > 0) {
        base.modules[def.id].upgrading = { to, finishesAt };
      }
    }
    if (Array.isArray(m.robots)) {
      base.modules[def.id].robots = m.robots
        .filter((r) => r && typeof r === "object")
        .map((r) => ({ elite: r.elite === true, expiresAt: Number(r.expiresAt) || 0 }))
        .filter((r) => r.expiresAt > Number(nowMs) - SKYLAB_ROBOT_LIFETIME_MS);
    }
  }
  if (raw.stock && typeof raw.stock === "object") {
    for (const id of SKYLAB_RESOURCE_IDS) {
      base.stock[id] = Math.max(0, Number(raw.stock[id]) || 0);
    }
  }
  // Anciennes sauvegardes sans dotation : on crédite une seule fois.
  if (!raw._starterStockGiven) {
    for (const [id, amount] of Object.entries(SKYLAB_STARTER_STOCK)) {
      base.stock[id] = Math.max(base.stock[id] || 0, amount);
    }
  }
  base._starterStockGiven = true;
  base.lastTickAt = Number(raw.lastTickAt) > 0 ? Number(raw.lastTickAt) : Number(nowMs) || Date.now();
  base.transportReadyAt = Math.max(0, Number(raw.transportReadyAt) || 0);
  return base;
}

// --- Production ---

export function skylabCollectorRatePerHour(level) {
  const l = Math.floor(Number(level) || 0);
  if (l < 1) return 0;
  return COLLECTOR_RATE[Math.min(SKYLAB_MAX_LEVEL, l) - 1] || 0;
}

export function skylabXenoRatePerHour(level) {
  return Math.round(skyLabCollectorBase(level) * 0.75);
}

function skyLabCollectorBase(level) {
  return skylabCollectorRatePerHour(level);
}

export function skylabRefineryRatePerHour(moduleId, level) {
  const l = Math.floor(Number(level) || 0);
  if (l < 1) return 0;
  const idx = Math.min(SKYLAB_MAX_LEVEL, l) - 1;
  if (moduleId === "prometid_refinery" || moduleId === "duranium_refinery") return REFINERY_RATE_BASIC[idx] || 0;
  if (moduleId === "promerium_refinery") return REFINERY_RATE_PROMERIUM[idx] || 0;
  if (moduleId === "seprom_refinery") return REFINERY_RATE_SEPROM[idx] || 0;
  return 0;
}

export function skylabSolarEnergy(level) {
  const l = Math.floor(Number(level) || 0);
  if (l < 1) return 0;
  return SOLAR_ENERGY[Math.min(SKYLAB_MAX_LEVEL, l) - 1] || 0;
}

export function skylabModuleEnergyRequired(moduleId, level) {
  const l = Math.floor(Number(level) || 0);
  if (l < 1) return 0;
  if (moduleId === "solar") return 0;
  if (moduleId === "transport") return 16;
  return 16 * l;
}

export function skylabEnergyStatus(state) {
  const s = state?.modules || {};
  let produced = skylabSolarEnergy(Number(s.solar?.level) || 0);
  let required = 0;
  for (const def of SKYLAB_MODULES) {
    if (def.id === "solar") continue;
    // En pause : ne consomme plus (et la conso globale se met à jour).
    if (s[def.id] && s[def.id].enabled === false) continue;
    required += skylabModuleEnergyRequired(def.id, Number(s[def.id]?.level) || 0);
  }
  return { produced, required, efficiency: required <= 0 ? 1 : Math.max(0, Math.min(1, produced / required)) };
}

export function skylabStorageCap(state, resourceId) {
  const storageLevel = Math.max(1, Math.min(SKYLAB_MAX_LEVEL, Math.floor(Number(state?.modules?.storage?.level) || 1)));
  const idx = storageLevel - 1;
  const id = String(resourceId || "");
  if (["prometium", "endurium", "terbium"].includes(id)) return STORAGE_RAW[idx];
  if (["prometid", "duranium"].includes(id)) return STORAGE_REFINED[idx];
  if (id === "promerium") return STORAGE_PROMERIUM[idx];
  if (id === "seprom") return STORAGE_SEPROM[idx];
  if (id === "xenomit") {
    // Le Xenomit ne se stocke pas (consommé en continu) : petit tampon.
    const xenoLevel = Math.max(0, Math.floor(Number(state?.modules?.xeno_module?.level) || 0));
    return Math.max(0, Math.ceil(skylabXenoRatePerHour(xenoLevel) * 3));
  }
  return 0;
}

// Demande horaire réelle des raffineries actives par ressource
// (production brute du module x ratios de recette). Sert à l'affichage net.
const SKYLAB_REFINERY_INPUTS = Object.freeze({
  prometid_refinery: Object.freeze({ prometium: 20, endurium: 10 }),
  duranium_refinery: Object.freeze({ endurium: 10, terbium: 20 }),
  promerium_refinery: Object.freeze({ prometid: 10, duranium: 10, xenomit: 1 }),
  seprom_refinery: Object.freeze({ promerium: 10 }),
});

const SKYLAB_REFINERY_OUTPUT = Object.freeze({
  prometid_refinery: "prometid",
  duranium_refinery: "duranium",
  promerium_refinery: "promerium",
  seprom_refinery: "seprom",
});

const SKYLAB_REFINERY_ORDER = Object.freeze([
  "prometid_refinery", "duranium_refinery", "promerium_refinery", "seprom_refinery",
]);

// Simule une heure de jeu sur une copie du stock : ce que chaque raffinerie
// produit VRAIMENT (limité par les intrants ou la place dispo) et ce qui est
// consommé par ressource. Sert à l'affichage temps réel.
export function skylabSimulateHour(state) {
  const stock = {};
  for (const id of SKYLAB_RESOURCE_IDS) stock[id] = Math.max(0, Number(state?.stock?.[id]) || 0);
  const basicMult = skylabBasicBonusMult(state);
  const eff = skylabEnergyStatus(state).efficiency;
  const outputs = {};
  const consumed = {};
  for (const modId of SKYLAB_REFINERY_ORDER) {
    outputs[modId] = 0;
    const m = state?.modules?.[modId];
    if (!m || m.enabled === false || m.upgrading) continue;
    const level = Math.floor(Number(m.level) || 0);
    if (level < 1) continue;
    let units = level * SKYLAB_REFINERY_CYCLES_PER_SEC * 60 * basicMult * eff;
    if (!(units > 0)) continue;
    const inputs = SKYLAB_REFINERY_INPUTS[modId];
    for (const [resId, perUnit] of Object.entries(inputs)) {
      units = Math.min(units, stock[resId] / perUnit);
    }
    const outId = SKYLAB_REFINERY_OUTPUT[modId];
    const cap = skylabStorageCap(state, outId);
    units = Math.min(units, Math.max(0, cap - stock[outId]));
    units = Math.max(0, units);
    if (!(units > 0)) continue;
    for (const [resId, perUnit] of Object.entries(inputs)) {
      stock[resId] = Math.max(0, stock[resId] - perUnit * units);
      consumed[resId] = (Number(consumed[resId]) || 0) + perUnit * units;
    }
    stock[outId] += units;
    outputs[modId] = units;
  }
  return { outputs, consumed };
}

export function skylabBasicBonusMult(state) {
  const basic = Math.max(1, Math.min(SKYLAB_MAX_LEVEL, Math.floor(Number(state?.modules?.basic?.level) || 1)));
  return 1 + 0.02 * (basic - 1);
}

export function skylabRobotBonusPct(moduleState, nowMs = Date.now()) {
  const now = Number(nowMs) || Date.now();
  let pct = 0;
  for (const r of moduleState?.robots || []) {
    if (Number(r?.expiresAt) > now) pct += 5;
  }
  return pct;
}

export function skylabRobotCount(moduleState, nowMs = Date.now()) {
  const now = Number(nowMs) || Date.now();
  let normal = 0, elite = 0;
  for (const r of moduleState?.robots || []) {
    if (Number(r?.expiresAt) > now) {
      if (r.elite === true) elite += 1;
      else normal += 1;
    }
  }
  return { normal, elite, total: normal + elite };
}

// Temps restant du premier robot acheté (le premier à expirer), en ms.
export function skylabFirstRobotMsLeft(moduleState, nowMs = Date.now()) {
  const now = Number(nowMs) || Date.now();
  let first = 0;
  for (const r of moduleState?.robots || []) {
    const left = Number(r?.expiresAt) - now;
    if (left > 0 && (first <= 0 || left < first)) first = left;
  }
  return first;
}

// --- Coûts d'amélioration ---
// Retourne { credits, resTotal, resEach:{prometium,endurium,terbium}, timeSecGame }
// resTotal = total brut prélevé sur le stock skylab, réparti en 3 parts.
// timeSecGame = durée en jeu (wiki / SKYLAB_TIME_SCALE).

function costEntry(creditsArr, resArr, targetLevel) {
  const idx = Math.floor(Number(targetLevel) || 0) - 2;
  if (idx < 0 || idx >= creditsArr.length) return null;
  return { credits: creditsArr[idx], res: resArr[idx] };
}

export function skylabUpgradeCost(moduleId, targetLevel) {
  const def = getSkylabModuleDef(moduleId);
  if (!def || def.upgradeable !== true) return null;
  const to = Math.floor(Number(targetLevel) || 0);
  if (to < 1 || to > SKYLAB_MAX_LEVEL) return null;
  if (to === 1) {
    const build = BUILD_COST[moduleId];
    if (!build) return null;
    return splitCost(build.credits, build.res, build.timeSec / SKYLAB_TIME_SCALE);
  }
  const group = def.costGroup;
  let entry = null, timeWikiSec = 0;
  if (group === "A") { entry = costEntry(COST_A_CREDITS, COST_A_RES, to); timeWikiSec = TIME_A[to - 2]; }
  else if (group === "B") { entry = costEntry(COST_B_CREDITS, COST_B_RES, to); timeWikiSec = TIME_A[to - 2]; }
  else if (group === "C") { entry = costEntry(COST_C_CREDITS, COST_C_RES, to); timeWikiSec = TIME_A[to - 2]; }
  else if (group === "D" || group === "E" || group === "E2") {
    const dEntry = costEntry(COST_C_CREDITS, COST_C_RES, to); // D reprend les coûts du groupe C
    if (!dEntry) return null;
    const dTime = TIME_D[to - 2];
    if (group === "D") { entry = dEntry; timeWikiSec = dTime; }
    else if (group === "E") {
      entry = { credits: Math.round(dEntry.credits * 5 / 3), res: Math.round(dEntry.res * 5 / 3) };
      timeWikiSec = Math.round(dTime * 1.8);
    } else {
      entry = { credits: Math.round(dEntry.credits * 10 / 3), res: Math.round(dEntry.res * 10 / 3) };
      timeWikiSec = Math.round(dTime * 3.6);
    }
  }
  if (!entry) return null;
  return splitCost(entry.credits, entry.res, timeWikiSec / SKYLAB_TIME_SCALE);
}

function splitCost(credits, resTotal, timeSecGame) {
  const total = Math.max(0, Math.floor(Number(resTotal) || 0));
  const each = Math.floor(total / 3);
  const rest = total - each * 3;
  return {
    credits: Math.max(0, Math.floor(Number(credits) || 0)),
    resTotal: total,
    resEach: {
      prometium: each + (rest > 0 ? 1 : 0),
      endurium: each + (rest > 1 ? 1 : 0),
      terbium: each,
    },
    timeSecGame: Math.max(1, Math.round(Number(timeSecGame) || 0)),
  };
}

// --- Simulation ---
// Fait avancer la production de dtRealSec secondes réelles.
// Retourne { completed: [moduleIds...] } (améliorations terminées).
export function tickSkylabState(state, nowMs = Date.now(), dtRealSec = 1) {
  const now = Number(nowMs) || Date.now();
  const dt = Math.max(0, Math.min(24 * 3600, Number(dtRealSec) || 0));
  const completed = [];
  if (!state || typeof state !== "object") return { completed };
  state.modules ||= {};
  state.stock ||= {};

  // 1. Termine les améliorations échues.
  for (const def of SKYLAB_MODULES) {
    const m = state.modules[def.id];
    if (!m || !m.upgrading) continue;
    if (Number(m.upgrading.finishesAt) <= now) {
      m.level = Math.max(0, Math.min(SKYLAB_MAX_LEVEL, Math.floor(Number(m.upgrading.to) || 0)));
      m.upgrading = null;
      completed.push(def.id);
    }
  }

  if (dt <= 0) {
    state.lastTickAt = now;
    return { completed };
  }

  const energy = skylabEnergyStatus(state);
  const basicMult = skylabBasicBonusMult(state);
  const eff = energy.efficiency;

  const addStock = (id, amount) => {
    if (!(amount > 0)) return;
    const cap = skylabStorageCap(state, id);
    const cur = Math.max(0, Number(state.stock[id]) || 0);
    state.stock[id] = Math.min(cap, cur + amount);
  };
  const takeStock = (id, amount) => {
    const cur = Math.max(0, Number(state.stock[id]) || 0);
    const taken = Math.min(cur, Math.max(0, amount));
    state.stock[id] = cur - taken;
    return taken;
  };

  // 2. Collecteurs (bruts) + xeno.
  const collectorOutputs = { prometium_collector: "prometium", endurium_collector: "endurium", terbium_collector: "terbium" };
  for (const [modId, resId] of Object.entries(collectorOutputs)) {
    const m = state.modules[modId];
    if (!m || m.enabled === false || m.upgrading) continue;
    const level = Math.floor(Number(m.level) || 0);
    if (level < 1) continue;
    const robotMult = 1 + skylabRobotBonusPct(m, now) / 100;
    // Échelle x60 + production x10 : 10 heures de production DO par minute réelle.
    const perSec = (skylabCollectorRatePerHour(level) / 60) * SKYLAB_PRODUCTION_MULT * robotMult * basicMult * eff;
    addStock(resId, perSec * dt);
  }
  {
    const m = state.modules.xeno_module;
    if (m && m.enabled !== false && !m.upgrading) {
      const level = Math.floor(Number(m.level) || 0);
      if (level >= 1) {
        const perSec = (skylabXenoRatePerHour(level) / 60) * SKYLAB_PRODUCTION_MULT * basicMult * eff;
        addStock("xenomit", perSec * dt);
      }
    }
  }

  // 3. Raffineries en chaîne (prometid -> duranium -> promerium -> seprom).
  // Consommation graduelle : chaque raffinerie consomme au plus
  // (niveau x cycles) par seconde, dans les ratios de sa recette.
  const refineStep = (modId, inputs, outputId) => {
    const m = state.modules[modId];
    if (!m || m.enabled === false || m.upgrading) return;
    const level = Math.floor(Number(m.level) || 0);
    if (level < 1) return;
    const cyclesPerSec = level * SKYLAB_REFINERY_CYCLES_PER_SEC * basicMult * eff;
    if (!(cyclesPerSec > 0)) return;
    let units = cyclesPerSec * dt;
    // Limite par les intrants disponibles.
    for (const [resId, perUnit] of Object.entries(inputs)) {
      const have = Math.max(0, Number(state.stock[resId]) || 0);
      units = Math.min(units, have / perUnit);
    }
    // Limite par la place restante en sortie.
    const cap = skylabStorageCap(state, outputId);
    const cur = Math.max(0, Number(state.stock[outputId]) || 0);
    units = Math.min(units, Math.max(0, cap - cur));
    if (!(units > 0)) return;
    for (const [resId, perUnit] of Object.entries(inputs)) takeStock(resId, perUnit * units);
    addStock(outputId, units);
  };
  refineStep("prometid_refinery", { prometium: 20, endurium: 10 }, "prometid");
  refineStep("duranium_refinery", { endurium: 10, terbium: 20 }, "duranium");
  refineStep("promerium_refinery", { prometid: 10, duranium: 10, xenomit: 1 }, "promerium");
  refineStep("seprom_refinery", { promerium: 10 }, "seprom");

  // 4. Robots expirés purgés.
  for (const def of SKYLAB_MODULES) {
    const m = state.modules[def.id];
    if (m && Array.isArray(m.robots) && m.robots.length) {
      m.robots = m.robots.filter((r) => Number(r?.expiresAt) > now);
    }
  }

  state.lastTickAt = now;
  return { completed };
}

// Vérifie qu'une amélioration peut démarrer (sans la déduire).
export function canStartSkylabUpgrade(state, moduleId, creditsAvailable, nowMs = Date.now()) {
  const def = getSkylabModuleDef(moduleId);
  if (!def) return { ok: false, error: "Module inconnu." };
  if (def.upgradeable !== true) return { ok: false, error: "Ce module ne s'améliore pas." };
  const m = state?.modules?.[moduleId];
  if (!m) return { ok: false, error: "Module inconnu." };
  if (m.upgrading) return { ok: false, error: "Amélioration déjà en cours." };
  const level = Math.floor(Number(m.level) || 0);
  const to = level + 1;
  if (to > SKYLAB_MAX_LEVEL) return { ok: false, error: "Niveau maximum atteint." };
  // Tout dépend du module de base (sauf lui) : pas de niv 2 sans base niv 2, etc.
  if (moduleId !== "basic") {
    const basic = Math.floor(Number(state?.modules?.basic?.level) || 0);
    if (to > basic) return { ok: false, error: `Module de base niveau ${to} requis.` };
  }
  const cost = skylabUpgradeCost(moduleId, to);
  if (!cost) return { ok: false, error: "Coût indisponible." };
  if (Number(creditsAvailable) < cost.credits) return { ok: false, error: "Crédits insuffisants." };
  const stock = state?.stock || {};
  for (const [resId, need] of Object.entries(cost.resEach)) {
    if (Math.floor(Number(stock[resId]) || 0) < need) {
      return { ok: false, error: `Pas assez de ${resId} dans le Skylab (${need} requis).` };
    }
  }
  return { ok: true, to, cost };
}

export function formatSkylabDuration(secGame) {
  const s = Math.max(0, Math.floor(Number(secGame) || 0));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  if (m > 0) return `${m}m ${String(sec).padStart(2, "0")}s`;
  return `${sec}s`;
}
