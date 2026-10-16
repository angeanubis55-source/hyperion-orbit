"use strict";

// Bots JPC d'Hyperion Orbit — faux joueurs qui peuplent les maps.
// Comme le NPC police de la gate Awakened : coque joueur, drones, tir façon
// joueur (munitions + faux lasers, paire/centre en alternance). Ils farm les
// NPC classiques (jamais cubi/emperor/invoke/mind/strokelight), vont au
// portail se réparer, changent de formation, claquent x4/x6, IEM et ISH.
// Ils n'attaquent jamais les joueurs de leur propre chef mais ripostent
// instantanément quand on les tape.
// Affichage joueur classique : pseudo aléatoire, grade BOT, firme BOT,
// titre violet "Bot JPC d'Hyperion Orbit", barres HP/bouclier.

import { NPC_TYPES } from "./NPC_TYPES.js";
import { SHIP_PACKS } from "../SHIP/SHIP_PACKS.js";
import { isPointInWall } from "../SRC/CORE/BOT_NAVIGATION.js";
import { ROCKET_TYPES } from "../COMBAT/ROCKET_TYPES.js";
import { rocketFlightLife, rocketLaunchSpeed } from "../COMBAT/ROCKET_TYPES.js";
import { JPC_LASER, jpcVolleyParts, tickJpcRepair, jpcTravel, jpcCombatMove, jpcCombatDistance, jpcEngageRange } from "./JPC_BEHAVIOR.js";

export const JPC_BOT_TITLE_TEXT = "Bot JPC d'Hyperion Orbit";
export const JPC_BOT_TITLE_COLOR = "#c77dff";
export const JPC_BOT_TAG = "BOT";

// Jamais en PvP 4-x, ni gate, ni QZ, ni Low, ni Maudite.
const JPC_EXCLUDED_MAPS = new Set([
  "4-1", "4-2", "4-3", "4-4", "4-5",
  "alpha", "beta", "gamma", "delta", "epsilon", "zeta", "kappa",
  "lambda", "kronos", "awakened", "low", "qz", "maudite",
]);

export function isJpcBotMap(mapId) {
  const id = String(mapId || "").trim().toLowerCase();
  if (!id || JPC_EXCLUDED_MAPS.has(id)) return false;
  if (/^4-\d/i.test(id)) return false;
  return true;
}

export function isJpcBot(e) {
  return !!e && e.isJpcBot === true;
}

// Candidat JPC pour un NPC (solo) : le bot vivant le plus proche, hors
// zone sûre (comme un joueur à l'abri : on ne l'aggro pas au portail).
// Retourne l'entité ou null. Le range est fourni par l'appelant.
export function findJpcPreyForNpc(npc, enemies, range, isSafeFn = null) {
  if (!npc || !(npc.hp > 0)) return null;
  const r = Math.max(0, Number(range) || 0);
  if (!(r > 0)) return null;
  let best = null, bestD2 = r * r;
  for (const j of enemies || []) {
    if (!j || j.isJpcBot !== true || !(j.hp > 0)) continue;
    try { if (isSafeFn && isSafeFn(j)) continue; } catch {}
    const dx = Number(j.x) - Number(npc.x), dy = Number(j.y) - Number(npc.y);
    const d2 = dx * dx + dy * dy;
    if (d2 < bestD2) { bestD2 = d2; best = j; }
  }
  return best;
}
// Cibles autorisées : que du classique. Jamais cubi, emperor, invoke,
// mindfire, strokelight (ni kamikazes, ni tourelles, ni saturn/gates).
const JPC_BANNED_TARGET = /cubikon|cubi|emperor|invoke|mindfire|strokelight|barrage|kamikaze|creeper|saturn|awakened|maudite|turret|egg|hitac/i;

export function isJpcFarmable(npc) {
  if (!npc || npc.hp <= 0 || npc.isJpcBot === true) return false;
  if (npc._netPlayer || npc._netPet || npc.isPetTarget) return false;
  const type = String(npc.type || "");
  if (!/^npc_/i.test(type)) return false;
  if (JPC_BANNED_TARGET.test(type)) return false;
  try {
    if (String(NPC_TYPES[type]?.ai || "") === "kamikaze") return false;
  } catch {}
  return true;
}

const SMALL_SHIPS = new Set(["liberator", "nostromo", "piranha", "yamato"]);

// Tier par map : la puissance (vaisseau, PV, dégâts, drones) suit la zone.
export function tierForMap(mapId) {
  const id = String(mapId || "").trim().toLowerCase();
  if (id === "5-2") return 2;
  if (/^[123]-bl$/.test(id)) return 3;
  const m = id.match(/^([123])-(\d)/);
  if (m) {
    const zone = Number(m[2]);
    if (zone <= 2) return 0;
    if (zone <= 4) return 1;
    if (zone <= 6) return 2;
    return 3;
  }
  return 1;
}

// Tier par map : la puissance (vaisseau, PV, dégâts, drones) suit la zone.
// Coques corrélées taille : petites maps = petites coques (liberator,
// piranha, nostromo), grosses maps/BL = cuirassés (goliath, citadel,
// spectrum, solace…), avec designs elite/plus possibles (voir rollJpcShip).
export const JPC_TIERS = [  {
    ships: ["liberator", "piranha", "nostromo"],
    drones: [2, 4], droneLevel: [1, 3],
    hp: [8000, 30000], sh: [8000, 30000],
    dmg: [150, 600], speed: [300, 340],
    ammo: ["x1", "x1", "x1", "x2"],
    forms: ["standard", "turtle", "arrow", "crab", "heart"],
    reward: { credits: 5000, exp: 2000, honor: 10 },
  },
  {
    ships: ["nostromo", "piranha", "bigboy", "leonov", "yamato"],
    drones: [3, 6], droneLevel: [1, 4],
    hp: [30000, 100000], sh: [30000, 100000],
    dmg: [600, 1800], speed: [300, 360],
    ammo: ["x2", "x2", "x3"],
    forms: ["standard", "turtle", "arrow", "crab", "heart", "pincer", "diamond", "chevron", "barrier"],
    reward: { credits: 15000, exp: 8000, honor: 25 },
  },
  {
    ships: ["bigboy", "leonov", "vengeance", "goliath", "aegis"],
    drones: [5, 8], droneLevel: [3, 5],
    hp: [120000, 300000], sh: [120000, 300000],
    dmg: [1800, 5000], speed: [290, 340],
    ammo: ["x3", "x3", "x4"],
    forms: ["barrier", "bat", "drill", "butterfly", "crab", "pincer", "chevron", "heart"],
    reward: { credits: 60000, exp: 25000, honor: 60 },
  },
  {
    ships: ["vengeance", "goliath", "aegis", "citadel", "spectrum", "solace"],
    drones: [6, 10], droneLevel: [4, 6],
    hp: [280000, 550000], sh: [280000, 550000],
    dmg: [4500, 11000], speed: [290, 330],
    ammo: ["x4", "x4", "x4", "x6"],
    forms: ["barrier", "bat", "drill", "butterfly", "crab", "pincer", "ring", "veteran", "dome", "wheel", "x"],
    reward: { credits: 150000, exp: 60000, honor: 150 },
  },
];

// Formations cohérentes façon vrai joueur, par rôle (basées sur les effets
// réels DRONE_TYPES) : on ne farme jamais en veteran/dome/ring (-dégâts),
// on ne fuit jamais en crab/ring/bat/dome (-vitesse), on voyage en wheel.
// Chaque bot tire ses préférences au spawn et les garde (pas de tirage
// aléatoire en plein combat). L'intersection avec les forms du tier garde
// la progression (un bas tier n'a pas drill/barrier).
export const JPC_ROLE_FORMS = Object.freeze({
  farm: ["barrier", "bat", "drill", "x", "butterfly", "heart", "crab", "standard"],
  riposte: ["drill", "pincer", "butterfly", "crab", "heart", "barrier", "standard"],
  flee: ["wheel", "heart", "turtle", "standard"],
  travel: ["wheel", "standard"],
});

export function rollJpcFormation(available, role, count, rng = Math.random) {
  if ((Number(count) || 0) < 4) return "standard";
  const list = Array.isArray(available) ? available : [];
  const cands = (JPC_ROLE_FORMS[role] || JPC_ROLE_FORMS.farm).filter((f) => list.includes(f));
  const pool = cands.length ? cands : ["standard"];
  return pool[Math.floor(rng() * pool.length) % pool.length];
}

export function rollJpcFormSet(available, count, rng = Math.random) {
  return {
    farm: rollJpcFormation(available, "farm", count, rng),
    riposte: rollJpcFormation(available, "riposte", count, rng),
    flee: rollJpcFormation(available, "flee", count, rng),
    travel: rollJpcFormation(available, "travel", count, rng),
  };
}

// Formation du rôle demandé, avec garde <4 drones (minDrones) et repli
// standard si préférence manquante (vieux roster).
export function jpcRoleFormation(e, role) {
  try {
    const count = Number(e?.droneCfg?.count ?? e?.jpcDrones?.count) || 0;
    if (count < 4) return "standard";
    const f = e?.jpcForms?.[role];
    return typeof f === "string" && f ? f : "standard";
  } catch { return "standard"; }
}

// Progression DANS le palier : 1-1 tire en bas de tier, 1-2 en haut
// (1-1 très faible … 1-8 fort). Paliers de 2 maps : zone impaire = 0,
// zone paire = 1. 5-2 et maps inconnues = milieu, BL = max.
export function tierProgressForMap(mapId) {
  const id = String(mapId || "").trim().toLowerCase();
  if (id === "5-2") return 0.5;
  if (/^[123]-bl$/.test(id)) return 1;
  const m = id.match(/^([123])-(\d)/);
  if (m) return Number(m[2]) % 2 === 1 ? 0 : 1;
  return 0.5;
}

// Tirage dans une fenêtre resserrée autour de la progression : centre à
// 25 % (progress 0) ou 75 % (progress 1) du tier, demi-largeur 25 %.
// 1-1 et 1-2 ne se recouvrent (presque) pas : progression stricte.
export function tierWindowedRoll(min, max, progress, rng = Math.random, integer = true) {
  const lo = Math.min(min, max), hi = Math.max(min, max);
  const p = Math.max(0, Math.min(1, Number(progress) ?? 0.5));
  const center = lo + (hi - lo) * (0.25 + 0.5 * p);
  const half = (hi - lo) * 0.25;
  const v = center + (rng() * 2 - 1) * half;
  const c = Math.max(lo, Math.min(hi, v));
  return integer ? Math.round(c) : c;
}

// Pioche dans une liste ordonnée faible → fort (vaisseaux, munitions) :
// moitié tirage libre (variété : toutes les entrées du tier possibles sur
// chaque map — fini les "que des bigboy en 1-5" / "que des spectrum en
// 1-8"), moitié fenêtré par progression (cohérence bas/haut de palier).
export function tierListPick(list, progress, rng = Math.random) {
  if (!Array.isArray(list) || !list.length) return undefined;
  const r = typeof rng === "function" ? rng : Math.random;
  if (r() < 0.5) return list[Math.min(list.length - 1, (r() * list.length) | 0)];
  const p = Math.max(0, Math.min(1, Number(progress) ?? 0.5));
  const idx = Math.max(0, Math.min(list.length - 1,
    Math.round(p * (list.length - 1) + (r() * 2 - 1))));
  return list[idx];
}

// Adresse au combat (riposte) : 0 en 1-1 (elles ne savent pas se battre :
// riposte courte, presque jamais d'IEM/ISH/x6), 1 en 1-8 / BL (agressives :
// x4 + salves x6, IEM/ISH, bonnes formations).
export function jpcSkillForMap(mapId) {
  const id = String(mapId || "").trim().toLowerCase();
  if (/^[123]-bl$/.test(id)) return 1;
  const m = id.match(/^([123])-(\d)/);
  if (m) return (Number(m[2]) - 1) / 7;
  return 0.5;
}
// Durée de riposte : 4 s en 1-1 … 12 s en 1-8/BL.
export function jpcRiposteDurationForSkill(skill) {
  return 4 + 8 * Math.max(0, Math.min(1, Number(skill) ?? 0.5));
}
// Base dégâts riposte : x2 en 1-1 … x4 en 1-8/BL (×1.5 en salve x6).
export function jpcRiposteMultForSkill(skill) {
  return 2 + 2 * Math.max(0, Math.min(1, Number(skill) ?? 0.5));
}
// Dégâts des drones en riposte : comme un vrai joueur, ses drones tirent
// aussi. 6-10 drones haut level en 1-8 = gros DPS, 2-3 bas level en 1-1 =
// presque rien (cohérent avec "ne savent pas se battre" en bas tier).
export function jpcDroneDmgFactor(e) {
  try {
    const count = Number(e?.droneCfg?.count ?? e?.jpcDrones?.count) || 0;
    const level = Number(e?.droneCfg?.level ?? e?.jpcDrones?.level) || 0;
    return 1 + 0.02 * Math.max(0, count) * Math.max(0, level);
  } catch { return 1; }
}

// Formation de riposte selon le bouclier de la cible : papillon (pénétration)
// si gros bouclier, foreuse (gros laser) pour finir si presque vide, sinon
// la préférence du bot. Comme un vrai joueur qui lit la barre adverse.
export function jpcRiposteFormation(e, shieldFrac) {
  try {
    const count = Number(e?.droneCfg?.count ?? e?.jpcDrones?.count) || 0;
    if (count < 4) return "standard";
    const f = Number(shieldFrac);
    if (Number.isFinite(f)) {
      if (f > 0.5) return "butterfly";
      if (f < 0.15) return "drill";
    }
    const pref = e?.jpcForms?.riposte;
    return typeof pref === "string" && pref ? pref : "standard";
  } catch { return "standard"; }
}

// Vitesse façon vrai joueur : base de la coque (vengeance 380 … citadel
// 240) + générateurs vitesse remplis comme son fit (0-70 % des slots,
// le reste en bouclier : un tank full bouclier reste lent). La qualité des
// générateurs suit le tier (G3N-1010 +2 en bas … G3N-7900 +10 en haut).
const JPC_SPEED_GEN_BONUS = Object.freeze([[2, 3], [3, 4, 5], [5, 6, 7], [7, 10]]);

export function jpcShipSpeed(shipId, mapId, rng = Math.random) {
  const rung = JPC_SPEED_GEN_BONUS[Math.max(0, Math.min(3, tierForMap(mapId)))] || [3, 4, 5];
  const want = String(shipId || "").toLowerCase();
  const pack = SHIP_PACKS.find((p) => String(p?.id || "").toLowerCase() === want)
    || SHIP_PACKS.find((p) => String(p?.id || "").toLowerCase() === jpcBaseHull(want));
  const base = Number(pack?.speed) || 300;
  const genSlots = Number(pack?.slots?.gens) || 10;
  const nSpeed = Math.max(0, Math.round(genSlots * (rng() * 0.7)));
  let bonus = 0;
  for (let i = 0; i < nSpeed; i++) bonus += rung[Math.floor(rng() * rung.length) % rung.length];
  return Math.max(100, Math.round(base + bonus));
}

// En BL, les proies ont des millions de PV (Impulse ~2M, Attend ~14M) :
// les JPC tapent ~200k par tir (×18 sur leur base), sinon ils ne tuent
// jamais rien. Bonus FARM uniquement (jamais cubi/emperor/invoke/mind de
// toute façon) — la riposte vs joueurs garde ses propres mults, et les
// maps normales gardent ×1 (200k en 1-8 vaporiserait tout).
export function jpcFarmDmgMult(mapId) {
  const id = String(mapId || "").trim().toLowerCase();
  return /^[123]-bl$/.test(id) ? 18 : 1;
}

// Roquettes façon vrai joueur : standards + lance-roquettes par tier, comme
// un joueur équipé de sa carte.
// Dégâts uniquement, sans effets spéciaux (pas de gel/ralentissement/vol) —
// les animations, arcs et fumées colorées sont identiques aux tiennes.
// Roquette standard : PLT-2021 ou PLT-2026 uniquement, à tous les tiers
// (les dégâts suivent le tier via JPC_ROCKET_DMG_MULT).
export const JPC_ROCKET_STD = Object.freeze([
  ["plt2021", "plt2026"],
  ["plt2021", "plt2026"],
  ["plt2021", "plt2026"],
  ["plt2021", "plt2026"],
]);
// Multiplicateur dégâts roquettes par tier (stock infini comme la x1).
export const JPC_ROCKET_DMG_MULT = Object.freeze([1, 2, 4, 8]);

export function rollJpcRockets(tierIdx, rng = Math.random) {
  const i = Math.max(0, Math.min(3, Number(tierIdx) || 0));
  const pool = JPC_ROCKET_STD[i];
  return { standard: pool[Math.floor(rng() * pool.length) % pool.length] };
}

export function jpcRocketDamage(rocketId, tierIdx) {
  const def = ROCKET_TYPES[String(rocketId || "").toLowerCase()] || null;
  const mult = JPC_ROCKET_DMG_MULT[Math.max(0, Math.min(3, Number(tierIdx) || 0))] ?? 1;
  return Math.max(1, Math.round(Number(def?.damage || 1000) * mult));
}

// Vol roquette façon joueur : arc en C + fumée colorée (mêmes champs que
// spawnRocketProjectile — la boucle enemyBullets les anime à l'identique).
// L'appelant pose cible/dégâts (visuel dmg 0 vs NPC, réel vs joueur).
export function jpcRocketFlight(from, to, rocketId, { salvoIndex = 0, salvoTotal = 1 } = {}) {
  const key = String(rocketId || "r310").toLowerCase();
  const def = ROCKET_TYPES[key] || null;
  const dx = Number(to.x) - Number(from.x), dy = Number(to.y) - Number(from.y);
  const d = Math.hypot(dx, dy) || 1;
  const spd = rocketLaunchSpeed(d);
  const spread = salvoTotal > 1 ? (salvoIndex - (salvoTotal - 1) / 2) * 0.12 : 0;
  const ang = Math.atan2(dy, dx) + spread;
  const arcDir = salvoTotal > 1 ? (salvoIndex % 2 === 0 ? -1 : 1) : (Math.random() < 0.5 ? -1 : 1);
  const arcScale = salvoTotal > 1 ? 1.8 + 1.2 * (salvoTotal > 1 ? salvoIndex / Math.max(1, salvoTotal - 1) : 0.5) : 1;
  const range = Math.max(140, Number(from?.shootRange) || 700);
  return {
    x: Number(from.x) || 0, y: Number(from.y) || 0,
    vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd,
    spd, r: 8, life: rocketFlightLife(range, spd),
    key, scale: 1.5, sprite: null,
    homing: true, ownerId: from.id,
    isRocket: true, isLauncherRocket: def ? def.manual === false : false,
    arcDist0: d, arcT: 0,
    arcKick0: arcDir * arcScale * spd * Math.tan((70 + 15 - Math.min(1, d / range) * 25) * Math.PI / 180),
    smokeT: 0, smokeHue: Math.floor(Math.random() * 360),
  };
}

// Bot JPC à l'abri (portail/base) : comme un joueur en ZNA, impossible à
// verrouiller. Utilisé par netPvpBlocked + Target (refus + rupture de lock).
export function isJpcBotSheltered(e, isSafeFn) {
  try {
    if (!e || e.isJpcBot !== true) return false;
    if (typeof isSafeFn !== "function") return false;
    return !!isSafeFn(e);
  } catch { return false; }
}

// Pause entre deux NPC : 30 % on enchaîne direct, sinon on se balade
// 1-10 s avant de reprendre une cible (comme un vrai joueur qui loot,
// regarde autour, dérive). Zéro = enchaîné direct.
export function rollJpcBreather(rng = Math.random) {
  const r = typeof rng === "function" ? rng : Math.random;
  return r() < 0.3 ? 0 : 1 + r() * 9;
}

// Maladresse : 15 % de MISS comme tout le monde en 1-8/BL, jusqu'à 30 %
// en 1-1 (ils savent pas viser non plus). Mêmes chiffres, même imperfection.
export function jpcMissChance(skill) {
  return 0.15 + 0.15 * (1 - Math.max(0, Math.min(1, Number(skill) ?? 0.5)));
}

// Seuil de fuite du bot (frac coque/total) : courage variable (25-50 %),
// +10 % par assaillant supplémentaire (max +20 %, plafond 70 %). Un vrai
// joueur tente parfois à 10 % seul, mais fuit à 60 %+ s'il voit du monde.
export function jpcFleeThreshold(e, foes) {
  const base = Number(e?.jpcFleeAt ?? 0.35);
  const extra = Math.min(0.2, 0.1 * Math.max(0, (Number(foes) || 0) - 1));
  return Math.min(0.7, base + extra);
}

// Assaillants du bot : NPC au contact en plein combat (provoqués par lui ou
// déjà accrochés — ça sent le surnombre, comme un vrai joueur).
export function jpcCountFoes(bot, enemies, range = 1200) {
  let n = 0;
  try {
    const r2 = Math.max(0, Number(range) || 0) ** 2;
    for (const o of enemies || []) {
      if (!o || o === bot || !(Number(o.hp) > 0) || o.isJpcBot === true) continue;
      if (o._netPlayer || o._netPet || o.isPetTarget) continue;
      if (!/^npc_/i.test(String(o.type || ""))) continue;
      const dx = Number(o.x) - Number(bot.x), dy = Number(o.y) - Number(bot.y);
      if (dx * dx + dy * dy > r2) continue;
      if (o._jpcAggroBy === bot.id && o._jpcAggro === true) { n++; continue; }
      if (o._aggro === true || o._provoked === true) n++;
    }
  } catch {}
  return n;
}

const BULLET_SPRITES = {
  x1: { src: "COMBAT/MUNITIONS/X1.png", w: 78, h: 20, glow: true, invert: true },
  x2: { src: "COMBAT/MUNITIONS/X2.png", w: 46, h: 16, glow: true, invert: true },
  x3: { src: "COMBAT/MUNITIONS/X3.png", w: 78, h: 20, glow: true, invert: true },
  x4: { src: "COMBAT/MUNITIONS/X4.png", w: 58, h: 18, glow: true, invert: true },
  x6: { src: "COMBAT/MUNITIONS/RSB.png", w: 58, h: 18, glow: true, invert: true },
};

const rand = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(rand(a, b + 1));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// Types NPC dédiés (un par coque + designs) : même pipeline que le police
// Awakened (sprite joueur + drones + tir joueur), stats écrasées par bot ensuite.
const jpcTypesReady = new Set();
export function ensureJpcShipType(shipId) {
  const id = String(shipId || "").toLowerCase();
  if (!id) return null;
  const type = `npc_Jpc_${shipId}`;
  if (jpcTypesReady.has(type) || NPC_TYPES[type]) { jpcTypesReady.add(type); return type; }
  const pack = SHIP_PACKS.find((p) => String(p?.id || "").toLowerCase() === id);
  if (!pack) return null;
  NPC_TYPES[type] = {
    name: "JPC",
    sprite: {
      path: pack.path, frames: pack.frames || 32, firstNumber: pack.firstNumber || 1,
      ext: pack.ext || ".png", w: pack.w || 169, h: pack.h || 150,
      // Coques joueur : même convention que le vaisseau local (art orienté
      // ouest à la frame 0, cf. SHIP_PACKS angleOffset).
      angleOffset: Math.PI,
    },
      playSprite: false,
      passiveNative: false,
      spriteSpeed: 0,
      bulletSprite: BULLET_SPRITES.x1,
      bulletScale: 1, bulletR: 6,
      r: 20, hp: 50000, shield: 50000, speed: 300,
      bulletDmg: 1000, bulletSpeed: 4500, shootRange: 700, shootRate: 1,
      ammoKey: "x1",
      fauxLasers: 5,
      altShot: true,
      alwaysMove: true,
      drones: { count: 4, formation: "standard", design: "havoc", level: 1 },
    };
    jpcTypesReady.add(type);
  return type;
}

export function ensureJpcTypes() {
  const wanted = new Set();
  for (const tier of JPC_TIERS) {
    for (const shipId of tier.ships) {
      wanted.add(shipId);
      for (const d of shipDesignsFor(shipId)) wanted.add(d);
    }
  }
  for (const shipId of wanted) ensureJpcShipType(shipId);
}

// Coque de base d'un design (vengeance_lightning → vengeance).
export function jpcBaseHull(shipId) {
  const id = String(shipId || "").toLowerCase();
  const cut = id.indexOf("_");
  return cut > 0 ? id.slice(0, cut) : id;
}

const jpcDesignCache = new Map();
// Skins d'une coque (elite/plus/...) : parfois oui, parfois non.
export function shipDesignsFor(baseId) {
  const base = String(baseId || "").toLowerCase();
  if (jpcDesignCache.has(base)) return jpcDesignCache.get(base);
  const list = SHIP_PACKS
    .filter((p) => {
      const id = String(p?.id || "").toLowerCase();
      return id !== base && id.startsWith(base + "_");
    })
    .map((p) => String(p.id));
  jpcDesignCache.set(base, list);
  return list;
}

// Coque + design éventuel : probabilité croissante avec le tier (les
// vétérans montrent leurs skins). Toujours une coque valide.
const JPC_DESIGN_CHANCE = Object.freeze([0.25, 0.35, 0.4, 0.5]);
export function rollJpcShip(baseShip, tierIdx, rng = Math.random) {
  const base = String(baseShip || "").toLowerCase();
  const chance = JPC_DESIGN_CHANCE[Math.max(0, Math.min(3, Number(tierIdx) || 0))] ?? 0.35;
  if (rng() >= chance) return base;
  const alts = shipDesignsFor(base);
  if (!alts.length) return base;
  return alts[Math.floor(rng() * alts.length) % alts.length];
}

const PSEUDO_ROOTS = ["Nova", "Orion", "Vortex", "Nyx", "Falcon", "Kira", "Spectre", "Atlas", "Neko", "Raven", "Lyra", "Kronos", "Arkos", "Shadow", "Astra", "Phoenix", "Zerox", "Skylow", "Drako", "Luna"];
const PSEUDO_ENDINGS = ["", "_FR", "Prime", "X", "One", "_EU", "Storm", "Rush"];
export function makeJpcPseudo(used, rng = Math.random) {
  const root = PSEUDO_ROOTS[Math.floor(rng() * PSEUDO_ROOTS.length)];
  const ending = PSEUDO_ENDINGS[Math.floor(rng() * PSEUDO_ENDINGS.length)];
  const base = `${root}${ending}${rng() < 0.5 ? Math.floor(10 + rng() * 90) : ""}`;
  let name = base, suffix = 2;
  while (used.has(name)) name = `${base}_${suffix++}`;
  used.add(name);
  return name;
}

// Designs : que du havoc, que du hercules, ou un mix (jamais admin/hermes).
function rollDroneDesign(count, randFn = Math.random) {
  const roll = randFn();
  if (roll < 0.35) return { designs: ["havoc"], primary: "havoc" };
  if (roll < 0.65) return { designs: ["hercules"], primary: "hercules" };
  const designs = [];
  for (let i = 0; i < count; i++) designs.push(randFn() < 0.5 ? "havoc" : "hercules");
  if (!designs.includes("havoc")) designs[0] = "havoc";
  if (!designs.includes("hercules")) designs[designs.length - 1] = "hercules";
  return { designs, primary: "havoc" };
}

// Délai de réapparition après un kill : 90 s (anti-farm en boucle).
export const JPC_RESPAWN_DELAY_S = 90;

// ---- Rotation horaire du roster ----
// Le nombre (et l'identité) des JPC change toutes les heures : même map,
// heure différente = roster différent. Seedée par map + heure (UTC) : tous
// les joueurs/serveurs voient le même roster pour une heure donnée, sans
// redémarrage. En solo comme en multi.
export function jpcHourBucket(nowMs = Date.now()) {
  return Math.floor(Math.max(0, Number(nowMs) || 0) / 3600000);
}

export function jpcRosterCount(mapId, epochMs = Date.now()) {
  const id = String(mapId || "").trim().toLowerCase();
  if (!isJpcBotMap(id)) return 0;
  const rng = mulberry32(hashMapSeed(`jpc:${id}:${jpcHourBucket(epochMs)}`));
  return jpcCountFromRng(id, rng);
}

// Nombre de JPC par map : 2-6 partout, 4-8 en BL (plus grande, plus de
// place). Tirage injecté (seedé côté serveur, Math.random en solo).
export function jpcCountFromRng(mapId, rng = Math.random) {
  const r = typeof rng === "function" ? rng : Math.random;
  const id = String(mapId || "").trim().toLowerCase();
  const bl = /^[123]-bl$/.test(id);
  return (bl ? 4 : 2) + ((r() * 5) | 0);
}

const state = {
  mapId: null,
  enemies: null,
  targetCount: 0,
  bucket: -1,
  pseudos: new Set(),
  respawnIn: 0,
  filled: false,
  prevAlive: 0,
  pending: [],
  time: 0,
};

export function resetJpcState(mapId) {
  const id = String(mapId || "").trim().toLowerCase();
  if (state.mapId === id) return;
  state.mapId = id;
  state.targetCount = 0;
  state.pseudos = new Set();
  resetJpcFill();
}

// Réarme le remplissage rapide (respawn du joueur : les ennemis sont vidés,
// la map ne doit pas rester sans JPC 90 s). Les wipes naturels gardent leurs
// remplacements programmés à 90 s.
export function resetJpcFill() {
  state.respawnIn = 0;
  state.filled = false;
  state.prevAlive = 0;
  state.pending = [];
}

function aliveBots(enemies) {
  let n = 0;
  for (const e of enemies) if (e && e.isJpcBot === true && e.hp > 0) n++;
  return n;
}

function randomSpawnPos(ctx) {
  const W = ctx.WORLD;
  for (let i = 0; i < 40; i++) {
    const x = rand(300, W.w - 300), y = rand(300, W.h - 300);
    const fake = { x, y };
    try { if (ctx.npcIsInSafeZone(fake)) continue; } catch {}
    try { if (isPointInWall(x, y, ctx.zoneWalls || [], 30)) continue; } catch {}
    let bad = false;
    try {
      for (const p of ctx.player ? [ctx.player] : []) {
        const dx = p.x - x, dy = p.y - y;
        if (dx * dx + dy * dy < 1500 * 1500) { bad = true; break; }
      }
    } catch {}
    if (bad) continue;
    return { x, y };
  }
  return { x: rand(500, W.w - 500), y: rand(500, W.h - 500) };
}

function spawnBot(ctx, mapId) {
  const tier = JPC_TIERS[tierForMap(mapId)] || JPC_TIERS[1];
  // Équipement et stats proportionnels à la carte : 1-1 bas de tier (très
  // faible), 1-2 haut de tier, … 1-8 max (assez fort).
  const progress = tierProgressForMap(mapId);
  const baseShip = tierListPick(tier.ships, progress);
  const shipId = rollJpcShip(baseShip, tierForMap(mapId));
  const type = `npc_Jpc_${shipId}`;
  ensureJpcShipType(shipId);
  if (!NPC_TYPES[type]) return null;
  const pos = randomSpawnPos(ctx);
  let e = null;
  try { e = ctx.makeEnemy(type, pos.x, pos.y); } catch { return null; }
  if (!e) return null;

  let droneCount = tierWindowedRoll(tier.drones[0], tier.drones[1], progress);
  if (SMALL_SHIPS.has(jpcBaseHull(shipId))) droneCount = Math.min(droneCount, 5);
  droneCount = clamp(droneCount, 2, 10);
  const droneLevel = tierWindowedRoll(tier.droneLevel[0], tier.droneLevel[1], progress);
  const { designs, primary } = rollDroneDesign(droneCount);
  // Préférences de formations par rôle (stables pour ce bot).
  const jpcForms = rollJpcFormSet(tier.forms, droneCount);
  const formation = droneCount < 4 ? "standard" : jpcForms.travel;

  const hpMax = tierWindowedRoll(tier.hp[0], tier.hp[1], progress);
  const shMax = tierWindowedRoll(tier.sh[0], tier.sh[1], progress);
  const ammo = tierListPick(tier.ammo, progress);
  // Récompense proportionnelle à la force (0.7× en bas de palier, 1.3× en haut).
  const rewardMult = 0.7 + 0.6 * progress;

  Object.assign(e, {
    isJpcBot: true,
    jpcShip: shipId,
    jpcPseudo: makeJpcPseudo(state.pseudos),
    name: "",
    r: 20,
    hpMax, hp: hpMax,
    shMax, sh: shMax,
    // Vitesse coque + fit (lente citerne tankée, rapide intercepteur monté
    // vitesse), pas un tirage uniforme au tier.
    speed: jpcShipSpeed(shipId, mapId),
    bulletDmg: tierWindowedRoll(tier.dmg[0], tier.dmg[1], progress),
    bulletSpeed: 4500, bulletScale: 1, bulletR: 6,
    shootRange: 700,
    shootRate: 1,
    ammoKey: "x1",
    bulletSprite: BULLET_SPRITES.x1,
    fauxLasers: 5,
    altShot: true,
    _altShot: false,
    alwaysMove: true,
    passiveNative: false,
    canShoot: true,
    wanderMode: false,
    aggroRange: 0,
    aggroHold: 0,
    value: Math.round(tier.reward.credits * rewardMult),
    exp: Math.round(tier.reward.exp * rewardMult),
    honor: Math.round(tier.reward.honor * rewardMult),
    droneCfg: { count: droneCount, formation, design: primary, designs, level: droneLevel },
    _aggro: false, _aggroT: 0, _provoked: false,
    _attackedPlayerRecently: false,
    jpcAi: {},
    jpcMode: "farm",
    jpcFarmId: null,
    jpcRetargetT: Math.random(),
    jpcWander: null,
    jpcWanderT: 0,
    jpcShootT: rand(0.3, 1),
    jpcNpcDpsT: 0,
    jpcAmmo: ammo,
    jpcAmmoBase: ammo,
    jpcX6T: 0,
    jpcX6Cd: rand(15, 40),
    jpcForms,
    jpcSkill: jpcSkillForMap(mapId),
    // Courage variable (25-50 %) + glandouille portail à initialiser.
    jpcFleeAt: 0.25 + Math.random() * 0.25,
    jpcMullT: null,
    // Pause entre deux kills (0 = enchaîne direct).
    jpcBreatherT: 0,
    jpcTier: tierForMap(mapId),
    // Roquettes façon vrai joueur : 1 standard + 1 lance-roquettes.
    jpcRockets: rollJpcRockets(tierForMap(mapId)),
    jpcRocketCd: rand(0.3, 1),
    jpcIemCd: 0,
    jpcIshCd: 0,
    ishT: 0,
    jpcRepairDest: null,
    jpcLastTotal: hpMax + shMax,
    jpcRiposteT: 999,
    jpcCalmT: 999,
    jpcRiposte: false,
    // Parité bot Kill : poursuite / passif / scan post-kill / ban mur.
    jpcCloseId: null,
    jpcChaseId: null,
    jpcAggroId: null,
    jpcPostKillScanT: 0,
    jpcWallBan: {},
  });
  e.name = e.jpcPseudo;
  e.angle = rand(0, Math.PI * 2);
  e._previousX = e.x;
  e._previousY = e.y;
  try { ctx.enemies.push(e); } catch { return null; }
  return e;
}

function nearestSafeRefuge(ctx, x, y) {
  // Comme botNearestSafeRefuge : refuge choisi par son bord (le plus proche).
  // On ne retient qu'un portail sûr (son centre est protégé), repli sur le
  // portail le plus proche sinon. Retourne le CERCLE (place de parking
  // calculée par l'appelant : chacun la sienne sur l'anneau).
  let best = null, bestEdge = Infinity, fallback = null, fallbackD2 = Infinity;
  try {
    for (const p of ctx.zonePortals || []) {
      if (!p || p.hidden === true) continue;
      const px = Number(p.x), py = Number(p.y);
      if (!Number.isFinite(px) || !Number.isFinite(py)) continue;
      const r = Number(p.r) || 260;
      const dx = x - px, dy = y - py;
      const d2 = dx * dx + dy * dy;
      if (d2 < fallbackD2) { fallbackD2 = d2; fallback = { x: px, y: py, r }; }
      let safe = true;
      try { safe = ctx.npcIsInSafeZone({ x: px, y: py }) !== false; } catch { safe = true; }
      if (!safe) continue;
      const edge = Math.max(0, Math.sqrt(d2) - r);
      if (edge < bestEdge) { bestEdge = edge; best = { x: px, y: py, r }; }
    }
  } catch {}
  return best || fallback;
}

// Place de parking d'un bot dans sa zone sûre : point aléatoire dans un
// disque de 35 m autour du centre — comme un vrai joueur qui se pose où il
// y a de la place, jamais deux fois pareil (fini l'anneau robotique).
export function jpcParkingSpot(e, cx, cy, radius, world) {
  const TAU = Math.PI * 2;
  const ang = Math.random() * TAU;
  const rr = Math.sqrt(Math.random()) * 35;
  const W = { w: Number(world?.w) || 11000, h: Number(world?.h) || 7000 };
  return {
    x: clamp(Number(cx) + Math.cos(ang) * rr, 80, W.w - 80),
    y: clamp(Number(cy) + Math.sin(ang) * rr, 80, W.h - 80),
  };
}

function farmTakenByOtherJpc(ctx, e, npcId) {
  try {
    for (const o of ctx.enemies || []) {
      if (o && o !== e && o.isJpcBot === true && o.hp > 0 && o.jpcFarmId === npcId) return true;
    }
  } catch {}
  return false;
}

function jpcNpcInWall(ctx, n) {
  try {
    const walls = ctx.zoneWalls || [];
    if (!walls.length || !n) return false;
    return isPointInWall(Number(n.x) || 0, Number(n.y) || 0, walls, Math.max(0, Number(n.r) || 18));
  } catch { return false; }
}

function jpcWallBanActive(e, id) {
  try {
    const until = Number(e?.jpcWallBan?.[String(id)] || 0);
    if (!(until > Date.now())) {
      if (until && e?.jpcWallBan) { try { delete e.jpcWallBan[String(id)]; } catch {} }
      return false;
    }
    return true;
  } catch { return false; }
}

function jpcBanWall(e, npc, ms = 8000) {
  try {
    if (!e || npc?.id == null) return;
    e.jpcWallBan ||= {};
    e.jpcWallBan[String(npc.id)] = Date.now() + Math.max(1000, Number(ms) || 8000);
  } catch {}
}

// Le NPC nous engage-t-il (comme npcIsEngagingPlayer vu côté JPC) ?
function jpcNpcEngaging(e, n) {
  try {
    if (!n || !(n.hp > 0)) return false;
    if (n._jpcAggroBy === e.id && n._jpcAggro === true) return true;
    if (n._aggro === true || n._provoked === true) return true;
    return false;
  } catch { return false; }
}

// Waypoint lointain (2500 m min, 6 essais) : le bot traverse la map en
// grandes lignes droites au lieu de tourner en rond dans le même coin.
function jpcFarWaypoint(ctx, e) {
  const W = ctx.WORLD || { w: 10000, h: 6000 };
  const pick = () => ({
    x: clamp(rand(120, W.w - 120), 80, W.w - 80),
    y: clamp(rand(120, W.h - 120), 80, W.h - 80),
  });
  let best = pick();
  for (let i = 0; i < 6; i++) {
    const p = pick();
    best = p;
    if (Math.hypot(p.x - e.x, p.y - e.y) >= 2500) return p;
  }
  return best;
}
// Distance de stand façon bot Kill : 250 si passif, 120 si poursuite, sinon
// hors de portée NPC (jpcCombatDistance). Suit Bot.closeId/chaseId/aggroId.
function jpcStandDistance(e, target) {
  const fullD = jpcCombatDistance(e, target);
  const canShoot = (Number(target?.shootRange) || 0) > 0;
  let engaging = true;
  try { engaging = jpcNpcEngaging(e, target); } catch { engaging = true; }
  if (engaging) e.jpcAggroId = target.id;
  const passive = !canShoot && engaging !== true && e.jpcAggroId !== target.id && e.jpcChaseId !== target.id;
  if (passive) return Math.min(fullD, 250);
  const d = Math.hypot(Number(target.x) - e.x, Number(target.y) - e.y);
  if (!canShoot) {
    if (e.jpcCloseId !== target.id && d <= fullD + 60) e.jpcCloseId = target.id;
    let fleeing = false;
    if (e.jpcCloseId === target.id && d > 0.01) {
      if (d > fullD + 150) fleeing = true;
      else if (d > fullD + 60) {
        try {
          const rdx = Number(target.x) - e.x, rdy = Number(target.y) - e.y;
          const rvx = (Number(target.vx) || 0) - (Number(e.vx) || 0);
          const rvy = (Number(target.vy) || 0) - (Number(e.vy) || 0);
          if ((rvx * rdx + rvy * rdy) / Math.max(1, d) > 150) fleeing = true;
        } catch {}
      }
    }
    if (fleeing) e.jpcChaseId = target.id;
    else if (e.jpcChaseId === target.id && d <= 120) e.jpcChaseId = null;
    if (e.jpcChaseId === target.id) return 120;
  }
  return fullD;
}

function pickFarmTarget(ctx, e) {
  // Nouvelles cibles uniquement : on évite poliment la cible lockée du joueur
  // (pas de vol) + jamais celle d'un autre JPC. La cible EN COURS est gardée
  // même si le joueur la locke (cible collante, lock gris côté joueur).
  // Comme le bot Kill : pas de wallhack (NPC dans un mur ignoré + ban 8 s),
  // portée capteurs 3400 max.
  const lockedId = ctx.lockedId ?? null;
  let best = null, bestScore = Infinity;
  const cands = [];
  for (const n of ctx.enemies) {
    if (!isJpcFarmable(n) || n === e) continue;
    if (lockedId != null && n.id === lockedId) continue;
    if (farmTakenByOtherJpc(ctx, e, n.id)) continue;
    if (jpcNpcInWall(ctx, n)) continue;
    try { if (n.id != null && jpcWallBanActive(e, n.id)) continue; } catch {}
    const dx = n.x - e.x, dy = n.y - e.y;
    const d2 = dx * dx + dy * dy;
    if (d2 > 3400 * 3400) continue;
    cands.push({ n, d2 });
  }
  cands.sort((a, b) => a.d2 - b.d2);
  for (const { n, d2 } of cands.slice(0, 4)) {
    const score = Math.sqrt(d2) + (Number(n.hpMax) || 0) * 0.002 + Math.random() * 400;
    if (score < bestScore) { bestScore = score; best = n; }
  }
  return best;
}

// Après un kill : comme le bot Kill (postKillScanT 1.5 s), les NPC autour
// sont prioritaires sur la patrouille.
function pickPostKillTarget(ctx, e) {
  const range = Math.max(2200, jpcEngageRange(e) * 3);
  const lim2 = range * range;
  const lockedId = ctx.lockedId ?? null;
  let best = null, bestD2 = Infinity;
  for (const n of ctx.enemies) {
    if (!isJpcFarmable(n) || n === e) continue;
    if (lockedId != null && n.id === lockedId) continue;
    if (farmTakenByOtherJpc(ctx, e, n.id)) continue;
    if (jpcNpcInWall(ctx, n)) continue;
    try { if (n.id != null && jpcWallBanActive(e, n.id)) continue; } catch {}
    const dx = n.x - e.x, dy = n.y - e.y;
    const d2 = dx * dx + dy * dy;
    if (d2 > lim2) continue;
    if (d2 < bestD2) { bestD2 = d2; best = n; }
  }
  return best;
}

function steerTravel(e, ctx, dt, tx, ty, human = 0) {
  const move = jpcTravel(e, tx, ty, dt, ctx.WORLD, ctx.zoneWalls || [], { human });
  e.vx = move.mx * move.spd; e.vy = move.my * move.spd;
  return move.spd === 0;
}

function orbitTarget(e, ref, dt, ctx, standD = null) {
  const move = jpcCombatMove(e, ref, dt, ctx.WORLD, ctx.zoneWalls || [], standD);
  e.vx = move.mx * move.spd; e.vy = move.my * move.spd;
}

const JPC_VISUAL_AMMO = "x1";
const JPC_VISUAL_SPRITE = { src: "COMBAT/MUNITIONS/X1.png", w: 78, h: 20, glow: true, invert: true };

// Roquettes façon vrai joueur : dégâts + visuels en arc fumant.
// Farm (NPC) : dégâts directs + visuel seul (pattern lasers). Riposte
// (joueur) : vrai projectile (dégâts à l'impact, comme les lasers x4/x6).
// Jamais d'effets spéciaux (gel/ralentissement/vol) — dégâts + visuels seuls.
function fireJpcRocket(ctx, e, target, rocketId, flightOpts = {}) {
  const toPlayer = ctx.player != null && target === ctx.player;
  const tierIdx = Number(e.jpcTier ?? 1);
  const skill = Number(e.jpcSkill ?? 0.5);
  // Maladresse : le coup peut rater (visuel part quand même).
  const missed = Math.random() < jpcMissChance(skill);
  let dmg = jpcRocketDamage(rocketId, tierIdx);
  let dealt = 0;
  if (toPlayer) {
    dmg = Math.max(1, Math.round(dmg * jpcRiposteMultForSkill(skill) * rand(0.9, 1.1)));
  }
  if (!toPlayer) {
    dmg = Math.max(1, Math.round(dmg * rand(0.9, 1.1)));
    let res = null;
    if (!missed) {
      try { res = ctx.damageEnemy(target, dmg, 0.15, undefined, { fromJpc: true, fixedDamage: true }); } catch {}
    }
    try {
      dealt = Math.round(Number(res?.total) || 0);
      if (dealt > 0 && ctx.lockedId != null && target.id === ctx.lockedId) {
        ctx.npcJpcDamageFloat?.(target, dealt);
      }
      // Raté sur notre cible lockée : on voit le MISS, comme en multi.
      if (missed && ctx.lockedId != null && target.id === ctx.lockedId) {
        ctx.npcJpcMissFloat?.(target);
      }
    } catch {}
    try {
      if (!missed && target && !target._damagedByPlayer) target.noRewards = true;
      if (target) {
        target._jpcFarmed = true;
        target._jpcAggroBy = e.id;
        target._jpcAggroT = 6;
        target._jpcAggro = true;
      }
    } catch {}
  }
  const fl = jpcRocketFlight(e, target, rocketId, flightOpts);
  ctx.addCappedProjectile(ctx.enemyBullets, {
    ...fl,
    dmg: toPlayer ? dmg : 0,
    target: toPlayer ? "player" : "npc",
    targetId: toPlayer ? null : target.id,
    miss: toPlayer ? missed : false,
    visual: !toPlayer,
    _jpcVisual: !toPlayer,
    _jpcShot: true,
  }, ctx.bulletLimit);
  return dealt;
}

// Visuels de farm : TOUJOURS en x1 (même sous x4/x6 réels), téléguidés vers
// la cible (ils s'arrêtent dessus comme les tirs joueur), vie juste assez
// longue pour l'atteindre (pas de traînées qui filent à l'infini).
function fireSilentVisual(ctx, from, to, dt) {
  const pair = from._altShot === true;
  from._altShot = !pair;
  from.jpcVisualParts = [...(from.jpcVisualParts || []), ...jpcVolleyParts(pair).map(part => ({
    ...part, delay: part.delay + dt, targetId: to.id, target: to === ctx.player ? "player" : "npc",
  }))];
}

function tickJpcVisuals(ctx, from, dt) {
  const pending = from.jpcVisualParts || [];
  from.jpcVisualParts = pending.filter(part => {
    part.delay -= dt;
    if (part.delay > 1e-9) return true;
    const to = part.target === "player" ? ctx.player : ctx.enemies.find(n => n?.id === part.targetId);
    if (!to || !(to.hp > 0) || from.ishT > 0 || from.empT > 0 || from.freezeT > 0 || from.redirectSilenceT > 0) return false;
    if (part.target === "npc" && (from.jpcFarmId !== to.id || from.jpcRiposte || from.jpcMode !== "farm")) return false;
    if (part.target === "player" && !from.jpcRiposte) return false;
    const ang = Math.atan2(to.y - from.y, to.x - from.x);
    const fx = Math.cos(ang), fy = Math.sin(ang);
    const spd = JPC_LASER.baseSpeed + Math.hypot(to.x - from.x, to.y - from.y);
    for (const off of part.offsets) {
      const sx = from.x + fx * ((from.r || 20) + 10) - fy * off;
      const sy = from.y + fy * ((from.r || 20) + 10) + fx * off;
      const dx = to.x - sx, dy = to.y - sy, len = Math.hypot(dx, dy) || 1;
      ctx.addCappedProjectile(ctx.enemyBullets, {
        x: sx, y: sy, vx: dx / len * spd, vy: dy / len * spd, spd, r: 6,
        life: len / spd + 0.3, dmg: 0, key: JPC_VISUAL_AMMO, scale: 1,
        sprite: JPC_VISUAL_SPRITE, target: part.target, targetId: to.id,
        homing: true, ownerId: from.id, miss: false, visual: true, _jpcVisual: true, _jpcShot: true,
      }, ctx.bulletLimit);
    }
    return false;
  });
}

function tickBot(dt, ctx, e, now) {
  if (!e || e.hp <= 0) return;
  e._previousX = e.x;
  e._previousY = e.y;
  e.wobble = (Number(e.wobble) || 0) + dt;

  // Décomptes (le tick NPC standard est contourné pour les JPC).
  e.empT = Math.max(0, (Number(e.empT) || 0) - dt);
  e.freezeT = Math.max(0, (Number(e.freezeT) || 0) - dt);
  e.redirectSilenceT = Math.max(0, (Number(e.redirectSilenceT) || 0) - dt);
  e.jamxT = Math.max(0, (Number(e.jamxT) || 0) - dt);
  e.creedT = Math.max(0, (Number(e.creedT) || 0) - dt);
  e.markT = Math.max(0, (Number(e.markT) || 0) - dt);
  e.neutrT = Math.max(0, (Number(e.neutrT) || 0) - dt);
  e.ishT = Math.max(0, (Number(e.ishT) || 0) - dt);
  e.jpcIemCd = Math.max(0, (Number(e.jpcIemCd) || 0) - dt);
  e.jpcIshCd = Math.max(0, (Number(e.jpcIshCd) || 0) - dt);
  e.jpcX6Cd = Math.max(0, (Number(e.jpcX6Cd) || 0) - dt);
  e.jpcX6T = Math.max(0, (Number(e.jpcX6T) || 0) - dt);

  const total = Math.max(0, Number(e.hp) || 0) + Math.max(0, Number(e.sh) || 0);
  const maxTotal = Math.max(1, (Number(e.hpMax) || 1) + (Number(e.shMax) || 0));
  const frac = total / maxTotal;

  // Riposte : le joueur nous a tapé (dégâts joueur uniquement : les dégâts
  // NPC passent par fromJpc et ne posent jamais _damagedByPlayer).
  if (e._damagedByPlayer === true && total < Number(e.jpcLastTotal || 0)) {
    e.jpcRiposteT = 0;
    e._damagedByPlayer = false;
  }
  // Dernier dégât subi (toute source) : temps simulé (pause-safe).
  if (total < Number(e.jpcLastTotal || 0)) e.jpcCalmT = 0;
  else e.jpcCalmT = Math.min(999, (Number(e.jpcCalmT) || 0) + dt);
  e.jpcRiposteT = Math.min(999, (Number(e.jpcRiposteT) ?? 999) + dt);
  // Regen façon joueur : coque +5 %/s ET bouclier +5 %/s après 10 s sans
  // dégât (REPAIR). Sous le feu : rien ne remonte, même au portail.
  tickJpcRepair(e, dt, e.jpcCalmT);
  // Chiffres +x de réparation façon vrai joueur, sur le bot locké uniquement
  // (comme les soins des joueurs distants : pas de spam pour les autres bots).
  try {
    const gainHp = Number(e.jpcRepairGainHp) || 0, gainSh = Number(e.jpcRepairGainSh) || 0;
    if ((gainHp > 0 || gainSh > 0) && ctx.lockedId != null && e.id === ctx.lockedId) {
      ctx.npcRepairFloat?.(e, gainHp, gainSh);
    }
  } catch {}
  const playerAlive = ctx.player && !ctx.player.dead && (Number(ctx.player.hp) || 0) > 0;
  // Adresse au combat : 1-1 maladroite, 1-8/BL agressive (IEM/ISH/x6, durée).
  const jpcSkill = Math.max(0, Math.min(1, Number(e.jpcSkill ?? 0.5)));
  // Maladresse des lasers riposte (lus par enemyShoot) : +0 en 1-8/BL,
  // +15 % en 1-1 par-dessus les 15 % de base.
  e.jpcMissBonus = 0.15 * (1 - jpcSkill);
  // Le joueur est mort (souvent de notre main) : on l'oublie comme si on
  // ne l'avait jamais attaqué — pas de rancune au respawn.
  if (!playerAlive) {
    e.jpcRiposteT = 999;
    e.jpcRiposte = false;
    e.jpcChaseId = null; e.jpcCloseId = null; e.jpcAggroId = null;
    e._provoked = false; e._aggro = false; e._aggroT = 0;
    e._attackedPlayerRecently = false;
    e._damagedByPlayer = false;
  }
  e.jpcRiposte = playerAlive && e.jpcRiposteT < jpcRiposteDurationForSkill(jpcSkill);
  if (e.jpcRiposte) { e.jpcFarmId = null; e._provoked = true; e._aggro = true; e._aggroT = 4; }

  // ISH : sauvetage sous 25 % (ne tire plus pendant la bulle). Les maladroits
  // (1-1) la ratent souvent, les agressifs (1-8/BL) la claquent presque à coup sûr.
  if (frac < 0.25 && e.ishT <= 0 && e.jpcIshCd <= 0) {
    if (Math.random() < 0.15 + 0.55 * jpcSkill) {
      e.ishT = 6;
      if (e.droneCfg) e.droneCfg.formation = "turtle";
    }
    e.jpcIshCd = 150;
  }

  // IEM : en riposte, casse le lock joueur (souvent en 1-8/BL, rarement en 1-1).
  if (e.jpcRiposte && e.jpcIemCd <= 0 && playerAlive) {
    const dx = ctx.player.x - e.x, dy = ctx.player.y - e.y;
    if (dx * dx + dy * dy < 1000 * 1000 && Math.random() < 0.2 + 0.5 * jpcSkill) {
      try { ctx.npcIemBlast(e, { lockoutSec: 3 }); } catch {}
      e.jpcIemCd = Math.round(150 - 105 * jpcSkill);
    } else if (dx * dx + dy * dy >= 1000 * 1000) {
      e.jpcIemCd = 5;
    }
  }

  // Fenêtre x6 : salves fréquentes en 1-8/BL (~20-30 s), rares en 1-1 (~50-70 s).
  if (e.jpcX6T <= 0 && e.jpcX6Cd <= 0) {
    e.jpcX6T = 6;
    e.jpcX6Cd = rand(50 - 30 * jpcSkill, 70 - 40 * jpcSkill);
  }
  const bursting = e.jpcX6T > 0;
  e.jpcAmmo = bursting ? "x6" : (e.jpcAmmoBase || e.ammoKey || "x4");
  e.jpcAmmoBase = e.jpcAmmoBase || e.ammoKey || "x4";

  // Formation cohérente façon vrai joueur : fixe par rôle (pas de tirage
  // aléatoire en plein combat). Le rôle farm/voyage est affiné plus bas,
  // quand la cible est connue ; ici on pose fuite / riposte. En réparation
  // on ne touche à rien (il garde sa formation, pas de switch robotique).
  try {
    const role = e.ishT > 0 ? null
      : e.jpcRiposte ? "riposte"
      : e.jpcMode === "flee" ? "flee"
      : e.jpcMode === "repair" ? null : "travel";
    if (role && e.droneCfg) e.droneCfg.formation = jpcRoleFormation(e, role);
  } catch {}

  // Fuite / réparation comme un vrai joueur. Déclencheur coque : même sous
  // ISH (qui regonfle le bouclier), une coque critique impose le repli une
  // fois la bulle terminée. SAUF en riposte : on se bat jusqu'à la mort,
  // jamais de fuite quand c'est le joueur qui nous tape.
  if (e.jpcRiposte && (e.jpcMode === "flee" || e.jpcMode === "repair")) {
    e.jpcMode = "farm";
    e.jpcRepairDest = null;
    e.jpcVisualParts = [];
  }
  const hpFrac = (Number(e.hp) || 0) / Math.max(1, Number(e.hpMax) || 1);
  // Seuil variable (courage du bot + surnombre) : on tente parfois à 10 %
  // seul, on fuit à 60 %+ quand ça sent le surnombre, comme un vrai joueur.
  const fleeAt = jpcFleeThreshold(e, jpcCountFoes(e, ctx.enemies));
  if (e.jpcMode !== "repair" && e.jpcMode !== "flee" && (frac < fleeAt || hpFrac < fleeAt) && e.ishT <= 0 && !e.jpcRiposte) {
    e.jpcMode = "flee";
    e.jpcFarmId = null;
    e.jpcVisualParts = [];
    e.jpcRepairDest = null;
    e.jpcMullT = null;
  }
  if (e.jpcMode === "flee" || e.jpcMode === "repair") {
    if (!e.jpcRepairDest) {
      const refuge = nearestSafeRefuge(ctx, e.x, e.y);
      e.jpcRepairDest = refuge
        ? jpcParkingSpot(e, refuge.x, refuge.y, refuge.r, ctx.WORLD)
        : { x: ctx.WORLD.w / 2, y: ctx.WORLD.h / 2 };
    }
    const dest = e.jpcRepairDest;
    const dx = dest.x - e.x, dy = dest.y - e.y;
    // On va jusqu'à SA place de parking (35 m), pas au bord de la zone sûre.
    const arrived = Math.hypot(dx, dy) <= 35;
    if (arrived) e.jpcMode = "repair";
    if (e.jpcMode === "repair") {
      if (frac >= 0.999 && hpFrac >= 0.99) {
        // Réparé : on glandouille encore 5-15 s au portail (comme un vrai
        // joueur) avant de repartir farmer.
        if (e.jpcMullT == null) e.jpcMullT = rand(5, 15);
        if (e.jpcMullT > 0) {
          e.jpcMullT = Math.max(0, e.jpcMullT - dt);
          e.vx = 0; e.vy = 0;
        } else {
          e.jpcMode = "farm";
          e.jpcRepairDest = null;
          e.jpcFarmId = null;
          e.jpcMullT = null;
        }
      } else {
        // Au portail : on attend la regen façon joueur (globale ci-dessus).
        e.vx = 0; e.vy = 0;
        e.jpcMullT = null;
      }
    } else {
      steerTravel(e, ctx, dt, dest.x, dest.y, 0.3);
    }
  } else if (!e.jpcRiposte) {
    // Farm façon bot Kill : cible collante (on finit sa cible), kiting au
    // standD (hors portée NPC / 250 passif / 120 poursuite), approche
    // silencieuse puis tir à portée, scan post-kill 1.5 s, pause 1-10 s
    // entre deux kills (on n'enchaîne pas toujours direct).
    e.jpcPostKillScanT = Math.max(0, (Number(e.jpcPostKillScanT) || 0) - dt);
    e.jpcBreatherT = Math.max(0, (Number(e.jpcBreatherT) || 0) - Math.max(0, Number(dt) || 0));
    const prevFarmId = e.jpcFarmId;
    let target = null;
    // Cible collante façon vrai joueur (sauf en pause entre deux kills) :
    // on garde sa cible même si le joueur la locke à son tour (il verra un
    // lock gris, pas d'abandon). On ne lâche que si elle devient infarmable
    // / trop loin / murée / prise par un autre JPC. Le lock joueur n'est
    // évité que pour les NOUVELLES cibles (pickFarmTarget, politesse anti-vol).
    if (e.jpcBreatherT <= 0 && e.jpcFarmId != null) {
      try {
        for (const n of ctx.enemies) {
          if (!n || n.id !== e.jpcFarmId || !isJpcFarmable(n)) continue;
          const dx = n.x - e.x, dy = n.y - e.y;
          if (dx * dx + dy * dy > 3400 * 3400) continue;
          if (farmTakenByOtherJpc(ctx, e, n.id)) continue;
          if (jpcNpcInWall(ctx, n)) {
            try { jpcBanWall(e, n, 8000); } catch {}
            continue;
          }
          try { if (n.id != null && jpcWallBanActive(e, n.id)) continue; } catch {}
          target = n;
          break;
        }
      } catch {}
    }
    if (!target) {
      // Cible perdue. Si elle est morte : scan post-kill + pause éventuelle
      // avant la suivante (30 % on enchaîne direct, sinon 1-10 s de balade
      // comme un vrai joueur). Si elle est juste partie : on repique aussitôt.
      try {
        if (prevFarmId != null) {
          const stillAlive = ctx.enemies.some((n) => n && n.id === prevFarmId && Number(n.hp) > 0);
          if (!stillAlive) {
            e.jpcPostKillScanT = 1.5;
            if (!(e.jpcBreatherT > 0)) e.jpcBreatherT = rollJpcBreather();
          }
        }
      } catch {}
      if (e.jpcBreatherT <= 0) {
        if (e.jpcPostKillScanT > 0) target = pickPostKillTarget(ctx, e);
        if (!target) {
          target = pickFarmTarget(ctx, e);
          e.jpcFarmId = target ? target.id : null;
        } else {
          e.jpcFarmId = target.id;
        }
      } else {
        e.jpcFarmId = null;
      }
    }
    if (target) {
      const d = Math.hypot(target.x - e.x, target.y - e.y);
      const standD = jpcStandDistance(e, target);
      // Kiting partout (approche + orbit) : jamais de charge au centre.
      orbitTarget(e, target, dt, ctx, standD);
      e.jpcWander = null;
      // En combat : formation d'attaque de ce bot (barrier/bat/drill…,
      // jamais de turtle/ring/dome/veteran qui plombent les dégâts).
      try { if (e.droneCfg && e.ishT <= 0) e.droneCfg.formation = jpcRoleFormation(e, "farm"); } catch {}
      // Tir UNIQUEMENT à portée (hors portée = approche silencieuse, comme
      // le bot Kill qui ne startAttack qu'à botEngageStartRange).
      e.jpcShootT -= dt;
      const canFire = e.ishT <= 0 && (e.empT || 0) <= 0 && (e.freezeT || 0) <= 0 && (e.redirectSilenceT || 0) <= 0;
      const engageMax = jpcEngageRange(e);
      if (e.jpcShootT <= 1e-9 && d <= engageMax && canFire) {
        e.jpcShootT = JPC_LASER.interval;
        const ammo = e.jpcAmmo || "x4";
        const mult = ammo === "x6" ? 1.5 : 1;
        // Maladresse : le coup peut rater (visuel part quand même, comme un
        // vrai joueur). Raté = pas de dégâts, mais le NPC remarque quand même.
        const missed = Math.random() < jpcMissChance(jpcSkill);
        const dmg = Math.max(1, Math.round(Number(e.bulletDmg || 500) * mult * jpcFarmDmgMult(state.mapId) * rand(0.9, 1.1)));
        let res = null;
        if (!missed) {
          try { res = ctx.damageEnemy(target, dmg, 0.15, undefined, { fromJpc: true, fixedDamage: true }); } catch {}
        }
        // Chiffres façon vrai joueur locké : on voit aussi ce que le bot
        // inflige à notre cible (lasers comme roquettes, multi : feed dmg).
        // Raté : MISS écrit sur la cible lockée (comme les tirs alliés).
        try {
          const dealt = Math.round(Number(res?.total) || 0);
          if (dealt > 0 && ctx.lockedId != null && target.id === ctx.lockedId) {
            ctx.npcJpcDamageFloat?.(target, dealt);
          }
          if (missed && ctx.lockedId != null && target.id === ctx.lockedId) {
            ctx.npcJpcMissFloat?.(target);
          }
        } catch {}
        try {
          if (!missed && target && !target._damagedByPlayer) target.noRewards = true;
          if (target) {
            target._jpcFarmed = true;
            // Provocation : le NPC aggro le bot comme un vrai joueur.
            target._jpcAggroBy = e.id;
            target._jpcAggroT = 6;
            target._jpcAggro = true;
          }
        } catch {}
        fireSilentVisual(ctx, e, target, dt);
        void res;
      }
      // Roquette standard toutes les secondes, comme les vrais joueurs
      // (mêmes conditions de tir que les lasers).
      e.jpcRocketCd = Math.max(0, (Number(e.jpcRocketCd) || 0) - Math.max(0, Number(dt) || 0));
      if (e.jpcRocketCd <= 1e-9 && d <= engageMax && canFire) {
        e.jpcRocketCd = JPC_LASER.interval;
        fireJpcRocket(ctx, e, target, e.jpcRockets?.standard || "r310");
      }
      // La défense du NPC passe par sa vraie aggro (enemyShootAtJpc) :
      // pas de double dégât scripté ici.
    } else {
      // Rien à farmer : patrouille façon vrai joueur — cap sur un point
      // lointain (2500 m min), gardé jusqu'à l'arrivée (45 s max si coincé).
      // Fini le re-pick toutes les 6 s qui faisait tourner en rond sur place.
      e.jpcWanderT = Math.max(0, (Number(e.jpcWanderT) || 0) - Math.max(0, Number(dt) || 0));
      const arrived = !e.jpcWander
        || Math.hypot(Number(e.jpcWander.x) - e.x, Number(e.jpcWander.y) - e.y) < 150;
      if (arrived || e.jpcWanderT <= 0) {
        e.jpcWander = jpcFarWaypoint(ctx, e);
        e.jpcWanderT = 45;
      }
      steerTravel(e, ctx, dt, e.jpcWander.x, e.jpcWander.y, 1);
      // Regen : uniquement via la règle globale façon joueur (10 s sans dégât).
    }
  }

  // Riposte agressive : le joueur nous tape → on le tape en x4 (vraie
  // munition blanche), salves x6 (RSB orange, ×1.5) pendant les fenêtres,
  // PLUS les dégâts des drones comme un vrai joueur équipé. Orbit resserrée
  // (on colle à 450 m) à vitesse de poursuite (+25 %, comme un changement
  // de config rapide), formation lue sur le bouclier adverse : papillon si
  // gros bouclier, foreuse pour finir si presque vide.
  if (e.jpcRiposte && playerAlive && e.ishT <= 0 && (e.empT || 0) <= 0 && (e.freezeT || 0) <= 0) {
    const bursting = e.jpcX6T > 0;
    const mult = jpcRiposteMultForSkill(jpcSkill) * (bursting ? 1.5 : 1) * jpcDroneDmgFactor(e);
    try {
      if (e.droneCfg) {
        const pShMax = Number(ctx.player.shMax);
        const pShFrac = pShMax > 0 ? (Number(ctx.player.sh) || 0) / pShMax : null;
        e.droneCfg.formation = jpcRiposteFormation(e, pShFrac);
      }
    } catch {}
    const keepSpd = e.speed;
    e.speed = Math.min((Number(keepSpd) || 300) * 1.25, 450);
    if (e.jpcMode !== "flee" && e.jpcMode !== "repair") {
      orbitTarget(e, ctx.player, dt, ctx, Math.min(jpcCombatDistance(e, ctx.player), 450));
    }
    e.speed = keepSpd;
    e.jpcFarmId = null;
    const keepDmg = e.bulletDmg, keepAmmo = e.ammoKey, keepSprite = e.bulletSprite;
    e.bulletDmg = Math.max(1, Math.round(Number(keepDmg || 500) * mult * rand(0.9, 1.1)));
    e.ammoKey = bursting ? "x6" : "x4";
    e.bulletSprite = bursting ? BULLET_SPRITES.x6 : BULLET_SPRITES.x4;
    try { ctx.enemyShoot(e, dt, ctx.player); }
    catch {} finally { e.bulletDmg = keepDmg; e.ammoKey = keepAmmo; e.bulletSprite = keepSprite; }
    // Roquette standard toutes les secondes en riposte aussi.
    e.jpcRocketCd = Math.max(0, (Number(e.jpcRocketCd) || 0) - Math.max(0, Number(dt) || 0));
    const pd = Math.hypot(ctx.player.x - e.x, ctx.player.y - e.y);
    if (e.jpcRocketCd <= 1e-9 && pd <= (e.shootRange || 700)) {
      e.jpcRocketCd = JPC_LASER.interval;
      fireJpcRocket(ctx, e, ctx.player, e.jpcRockets?.standard || "r310");
    }
  }

  // Intégration + bornes.
  if ((e.freezeT || 0) > 0) { e.vx = 0; e.vy = 0; }
  tickJpcVisuals(ctx, e, dt);
  e.jpcLastTotal = e.hp + e.sh;
  try {
    const W = ctx.WORLD;
    e.x = clamp(Number(e.x) + (Number(e.vx) || 0) * dt, 60, W.w - 60);
    e.y = clamp(Number(e.y) + (Number(e.vy) || 0) * dt, 60, W.h - 60);
  } catch {}
}

export function tickJpcSystem(dt, ctx) {
  try {
    if (!(dt > 0)) return;
    const mapId = String(ctx.currentMapId()).trim().toLowerCase();
    if (!isJpcBotMap(mapId)) return;
    ensureJpcTypes();
    // Nouveau tableau d'ennemis = nouvelle session (même map) : les
    // remplacements programmés de l'ancien contexte ne doivent jamais fuir
    // ici — reset complet comme à l'arrivée sur la map.
    if (state.mapId !== mapId || state.targetCount <= 0 || state.enemies !== ctx.enemies) {
      state.mapId = mapId;
      state.enemies = ctx.enemies;
      state.pseudos = new Set();
      for (const e of ctx.enemies) {
        if (e && e.isJpcBot === true && e.jpcPseudo) state.pseudos.add(e.jpcPseudo);
      }
      state.targetCount = jpcCountFromRng(mapId);
      state.bucket = jpcHourBucket(Date.now());
      state.respawnIn = 0;
      state.filled = false;
      state.prevAlive = aliveBots(ctx.enemies);
      state.pending = [];
    } else {
      // Nouvelle heure sur la même map : le nombre de JPC change (comme un
      // vrai roulement de joueurs). Croissance = remplissage rapide ;
      // décroissance = convergence naturelle (pas de respawn au-delà).
      try {
        const bucket = jpcHourBucket(Date.now());
        if (bucket !== state.bucket) {
          state.bucket = bucket;
          state.targetCount = jpcCountFromRng(mapId);
          state.filled = false;
          state.prevAlive = aliveBots(ctx.enemies);
        }
      } catch {}
    }
    const now = (typeof performance !== "undefined" && performance.now ? performance.now() : Date.now()) / 1000;
    // Temps simulé (pause-safe, testable) : base du délai anti-farm.
    state.time = (Number(state.time) || 0) + Math.max(0, Number(dt) || 0);
    const alive = aliveBots(ctx.enemies);
    // Aucun JPC du tout sur la map (chargement, respawn, wipe total) :
    // remplissage rapide, comme à l'arrivée.
    const anyJpc = ctx.enemies.some((e) => e && e.isJpcBot === true);
    if (!state.filled || !anyJpc) {
      // Remplissage de la map : rapide.
      if (alive < state.targetCount) {
        state.respawnIn -= dt;
        if (state.respawnIn <= 0) {
          state.respawnIn = 0.5;
          spawnBot(ctx, mapId);
        }
      } else {
        state.filled = true;
        state.prevAlive = alive;
      }
    } else {
      // Morts détectées : remplacement programmé dans 90 s (anti-farm en
      // boucle — un seul spawn par tick pour éviter les rafales).
      if (alive < (state.prevAlive ?? alive)) {
        const died = Math.min((state.prevAlive ?? alive) - alive, state.targetCount);
        for (let i = 0; i < died; i++) state.pending.push(state.time + JPC_RESPAWN_DELAY_S);
      }
      state.prevAlive = alive;
      const dueIdx = state.pending.findIndex((t) => t <= state.time);
      if (dueIdx >= 0 && alive < state.targetCount) {
        state.pending.splice(dueIdx, 1);
        spawnBot(ctx, mapId);
      } else if (alive >= state.targetCount) {
        state.pending = [];
      }
    }
    for (const e of ctx.enemies) {
      if (e && e.isJpcBot === true && e.hp > 0) {
        try { tickBot(dt, ctx, e, now); } catch {}
      }
    }
  } catch {}
}

// ---- Multijoueur natif (serveur autoritaire) ----
// Roster seedé par map + heure : mêmes bots (nombre, pseudos, vaisseaux,
// stats, positions) pour tous à une heure donnée, nouveau roster à chaque
// heure sans redémarrer. Pas de tirage par client : le serveur est la seule
// source, tous les écrans voient les mêmes bots.
export function hashMapSeed(str) {
  let h = 2166136261;
  for (const c of String(str || "")) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rosterPos(rng, world, safe, walls) {
  const W = { w: Number(world?.w) || 11000, h: Number(world?.h) || 7000 };
  for (let i = 0; i < 60; i++) {
    const x = 300 + rng() * Math.max(1, W.w - 600);
    const y = 300 + rng() * Math.max(1, W.h - 600);
    let bad = false;
    for (const z of safe || []) {
      const dx = x - Number(z.x), dy = y - Number(z.y);
      const rr = Number(z.r || 0) + 250;
      if (dx * dx + dy * dy < rr * rr) { bad = true; break; }
    }
    if (!bad) {
      for (const w of walls || []) {
        if (Math.abs(x - Number(w?.x || 0)) <= Number(w?.w || 0) / 2 + 30
          && Math.abs(y - Number(w?.y || 0)) <= Number(w?.h || 0) / 2 + 30) { bad = true; break; }
      }
    }
    if (!bad) return { x, y };
  }
  return { x: W.w / 2, y: W.h / 2 };
}

export function buildJpcRoster(mapId, world, safe = [], walls = [], epochMs = Date.now(), usedPseudos = null) {
  const id = String(mapId || "").trim().toLowerCase();
  if (!isJpcBotMap(id)) return [];
  // Seed map + heure : roster identique pour tous à une heure donnée, mais
  // différent d'une heure à l'autre (pas besoin de redémarrer le serveur).
  const rng = mulberry32(hashMapSeed(`jpc:${id}:${jpcHourBucket(epochMs)}`));
  const tier = JPC_TIERS[tierForMap(id)] || JPC_TIERS[1];
  // Même proportionnalité qu'en solo : équipement et stats suivent la carte.
  const progress = tierProgressForMap(id);
  const rewardMult = 0.7 + 0.6 * progress;
  const count = jpcCountFromRng(id, rng);
  // Pseudos uniques y compris face aux bots déjà en vie (renforts horaires) :
  // chaque JPC reste identifiable, pas de jumeaux homonymes.
  const used = usedPseudos instanceof Set ? usedPseudos : new Set();
  const roster = [];
  for (let i = 0; i < count; i++) {
    const baseShip = tierListPick(tier.ships, progress, rng);
    const shipId = rollJpcShip(baseShip, tierForMap(id), rng);
    let droneCount = tierWindowedRoll(tier.drones[0], tier.drones[1], progress, rng);
    if (SMALL_SHIPS.has(jpcBaseHull(shipId))) droneCount = Math.min(droneCount, 5);
    droneCount = Math.max(2, Math.min(10, droneCount));
    const droneLevel = tierWindowedRoll(tier.droneLevel[0], tier.droneLevel[1], progress, rng);
    const { designs, primary } = rollDroneDesign(droneCount, rng);
    // Préférences de formations par rôle (déterministes : mêmes bots à
    // chaque démarrage serveur). Formation initiale = voyage (spawn).
    const forms = rollJpcFormSet(tier.forms, droneCount, rng);
    const formation = droneCount < 4 ? "standard" : forms.travel;
    const hpMax = tierWindowedRoll(tier.hp[0], tier.hp[1], progress, rng);
    const shMax = tierWindowedRoll(tier.sh[0], tier.sh[1], progress, rng);
    const pos = rosterPos(rng, world, safe, walls);    roster.push({
      uid: `${id}#jpc${i}`,
      pseudo: makeJpcPseudo(used, rng),
      shipId,
      type: `npc_Jpc_${shipId}`,
      x: Math.round(pos.x), y: Math.round(pos.y),
      hpMax, shMax,
      speed: jpcShipSpeed(shipId, id, rng),
      bulletDmg: tierWindowedRoll(tier.dmg[0], tier.dmg[1], progress, rng),
      shootRate: 1,
      ammo: tierListPick(tier.ammo, progress, rng),
      drones: { count: droneCount, formation, design: primary, designs, level: droneLevel },
      forms,
      // Roquette standard du bot (PLT-2021 ou PLT-2026).
      rockets: rollJpcRockets(tierForMap(id), rng),
      // Courage variable (25-50 %), comme en solo.
      fleeAt: 0.25 + rng() * 0.25,
      reward: {
        credits: Math.round(tier.reward.credits * rewardMult),
        exp: Math.round(tier.reward.exp * rewardMult),
        honor: Math.round(tier.reward.honor * rewardMult),
      },
    });
  }
  return roster;
}
