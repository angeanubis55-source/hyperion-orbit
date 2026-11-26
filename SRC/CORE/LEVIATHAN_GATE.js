"use strict";

// ============================================================================
// LEVIATHAN GATE (map partagée « leviathan », pilotée par le serveur :
// SCRIPTS/LEVIATHAN_GATE.js). Même principe que la GG d'hiver, sans convoi :
//   - du 30/11 00h01 au 13/12 23h59 (heure de Paris) ;
//   - une session par heure : entrée ouverte de :00 à :05, départ commun à
//     :05, fin pile à l'heure suivante (tout le monde est renvoyé à sa base) ;
//   - vagues infinies : la suivante part dès que le dernier NPC de la vague
//     en cours est mort ; les NPC attaquent les joueurs ;
//   - chacun pour soi : pas de groupe (on en sort en entrant), pas de PvP ;
//   - récompenses des NPC classiques + points de classement reçus directement
//     à chaque kill (« Vous avez reçu X points Leviathan »), pas de box ni de
//     récompense de fin de session ;
//   - 2 classements d'une semaine, gains de fin de classement.
// Pur (aucun DOM) : importable côté client et côté serveur.
// ============================================================================

import { winterParisTime } from "../../NPC/NPC_WINTER.js";

export const LEVIATHAN_GATE_MAP = "leviathan";
export const LEVIATHAN_GATE_NAME = "Leviathan Gate";

export const LEVIATHAN_GATE_WORLD = Object.freeze({ w: 8000, h: 5000 });

// Dates de l'événement (mois 0-11, heure de Paris). L'année est fixée :
// événement unique, à redater pour une nouvelle édition.
export const LEVIATHAN_GATE_START_AT = Object.freeze({ year: 2026, month: 10, day: 30, hour: 0, minute: 1 });
export const LEVIATHAN_GATE_END_AT = Object.freeze({ year: 2026, month: 11, day: 13, hour: 23, minute: 59 });

// Classements (fin de chacun à minuit, heure de Paris) : 30/11 -> 6/12, 7/12 -> 13/12.
export const LEVIATHAN_RANKING_ENDS = Object.freeze([
  Object.freeze({ year: 2026, month: 11, day: 7 }),
  Object.freeze({ year: 2026, month: 11, day: 14 }),
]);

// ⚠️ TEST : true = événement actif tout de suite (client + serveur), points
// sur un classement « test » à part (jamais versé). À repasser à false
// avant le 30/11 (et LEVIATHAN_GATE_OPEN_MINUTE à 0 si voulu).
export const LEVIATHAN_GATE_TEST = true;

// Sessions : une par heure, entrée de :MM à :MM+5 (MM = minute d'ouverture),
// fin pile une heure après l'ouverture.
export const LEVIATHAN_GATE_OPEN_MINUTE = 50;
export const LEVIATHAN_GATE_PERIOD_MS = 60 * 60 * 1000;
export const LEVIATHAN_GATE_ENTRY_MS = 5 * 60 * 1000;
export const LEVIATHAN_GATE_RUN_MS = LEVIATHAN_GATE_PERIOD_MS - LEVIATHAN_GATE_ENTRY_MS;

// --- Le combat ----------------------------------------------------------------
// Un boss fixe au centre de la map, sprite joué en continu :
//   1. Dreadfyre Guardian, invulnérable, lâche N Harbinger (10, puis +2 à
//      chaque cycle) ;
//   2. tous les Harbinger tués : fenêtre de 15 s où le boss prend des dégâts,
//      puis de nouveau invulnérable et nouveau lâcher (N + 2) ;
//   3. sous 10 % de vie, le Guardian explose : la Dreadfyre Fortress apparaît
//      à sa place et reprend le cycle (N + 6 à chaque lâcher), impulsions plus
//      fréquentes, parfois deux d'affilée ;
//   4. Fortress détruite : victoire, fin de la session.
// Toutes les X s, le boss émet une impulsion qui balaie toute la carte : elle
// ralentit chaque joueur touché et le repousse un peu (aucun dégât).
export const LEVIATHAN_GUARDIAN_TYPE = "npc_Dreadfyre_Guardian";
export const LEVIATHAN_FORTRESS_TYPE = "npc_Dreadfyre_Fortress";
export const LEVIATHAN_HARBINGER_TYPE = "npc_Dreadfyre_Harbinger";
export const LEVIATHAN_TYPES = Object.freeze([LEVIATHAN_GUARDIAN_TYPE, LEVIATHAN_FORTRESS_TYPE, LEVIATHAN_HARBINGER_TYPE]);

export const LEVIATHAN_BOSS = Object.freeze({
  // Premier lâcher de Harbinger.
  firstAdds: 10,
  // Harbinger en plus à chaque nouveau lâcher.
  addsStep: Object.freeze({ guardian: 2, fortress: 6 }),
  // Fenêtre de dégâts (boss vulnérable) une fois tous les Harbinger tués.
  windowMs: 15000,
  // Le Guardian explose sous ce pourcentage de vie.
  guardianExplodePct: 0.10,
  // Intervalle des impulsions ; Fortress : chance d'une 2e juste après.
  pulseEveryMs: Object.freeze({ guardian: 10000, fortress: 6000 }),
  doublePulseChance: 0.35,
  doublePulseDelayMs: 1500,
  // Impulsion : vitesse de l'onde (px/s), ralenti et poussée.
  pulseSpeed: 4000,
  pulseSlowPct: 50,
  pulseSlowSec: 3,
  pulsePush: 250,
  // Lâcher des Harbinger : autour du boss.
  addsDistance: Object.freeze([450, 900]),
});

// Points de classement : 1 par tranche de LEVIATHAN_POINT_HP PV max d'un NPC
// tué (Harbinger : 5), et 1 par LEVIATHAN_BOSS_DAMAGE_PER_POINT dégâts
// infligés au boss (Guardian / Fortress).
export const LEVIATHAN_POINT_HP = 50000;
export const LEVIATHAN_BOSS_DAMAGE_PER_POINT = 100000;
export function leviathanPoints(hpMax) {
  return Math.max(1, Math.round(Math.max(0, Number(hpMax) || 0) / LEVIATHAN_POINT_HP));
}
export function isLeviathanBossType(type) {
  return type === LEVIATHAN_GUARDIAN_TYPE || type === LEVIATHAN_FORTRESS_TYPE;
}

// --- Dates --------------------------------------------------------------------
const parisMs = (at, end = false) => winterParisTime(at.year, at.month, at.day, at.hour ?? 0, at.minute ?? 0, end ? 59 : 0);
export const LEVIATHAN_GATE_START = parisMs(LEVIATHAN_GATE_START_AT);
export const LEVIATHAN_GATE_END = parisMs(LEVIATHAN_GATE_END_AT, true);

// Les classements de l'événement : [{ index, key, startAt, endAt }].
export const LEVIATHAN_RANKING_PERIODS = Object.freeze((() => {
  let startAt = LEVIATHAN_GATE_START;
  return LEVIATHAN_RANKING_ENDS.map((at, index) => {
    const endAt = parisMs(at);
    const period = Object.freeze({ index, key: `${LEVIATHAN_GATE_START_AT.year}-${index + 1}`, startAt, endAt });
    startAt = endAt;
    return period;
  });
})());

function forced() {
  if (LEVIATHAN_GATE_TEST) return true;
  try {
    // Test / debug serveur : LEVIATHAN_FORCE=1 simule l'événement.
    return typeof process !== "undefined" && process.env && process.env.LEVIATHAN_FORCE === "1";
  } catch { return false; }
}

// Classement de test (avant l'événement) : clé à part, jamais versé.
const LEVIATHAN_TEST_PERIOD = Object.freeze({ index: 0, key: "test", startAt: 0, endAt: LEVIATHAN_GATE_START });

// Classement en cours ou null hors événement.
export function leviathanRankingPeriod(nowMs = Date.now()) {
  const t = Number(nowMs);
  if (!Number.isFinite(t)) return null;
  const found = LEVIATHAN_RANKING_PERIODS.find((p) => t >= p.startAt && t < p.endAt) || null;
  if (found || !forced()) return found;
  return t < LEVIATHAN_GATE_START ? LEVIATHAN_TEST_PERIOD : null;
}

// Gate visible / jouable : pendant un classement (= pendant l'événement).
export function isLeviathanGateActive(nowMs = Date.now()) {
  if (forced()) return true;
  return leviathanRankingPeriod(nowMs) !== null;
}

// --- Sessions -----------------------------------------------------------------
// Session en cours (minutes identiques à Paris). open = entrée autorisée
// (avant le départ).
const OPEN_OFFSET_MS = LEVIATHAN_GATE_OPEN_MINUTE * 60 * 1000;
export function leviathanGateSession(nowMs = Date.now()) {
  const hourAt = Math.floor((Number(nowMs) - OPEN_OFFSET_MS) / LEVIATHAN_GATE_PERIOD_MS) * LEVIATHAN_GATE_PERIOD_MS + OPEN_OFFSET_MS;
  const startAt = hourAt + LEVIATHAN_GATE_ENTRY_MS;
  return {
    hourAt, startAt,
    endAt: hourAt + LEVIATHAN_GATE_PERIOD_MS,
    nextOpenAt: hourAt + LEVIATHAN_GATE_PERIOD_MS,
    open: Number(nowMs) < startAt,
  };
}

// Créneau affiché aux joueurs : { open: ":30", start: ":35" }.
export function leviathanGateWindowLabel() {
  const mm = (minute) => `:${String(minute % 60).padStart(2, "0")}`;
  return { open: mm(LEVIATHAN_GATE_OPEN_MINUTE), start: mm(LEVIATHAN_GATE_OPEN_MINUTE + LEVIATHAN_GATE_ENTRY_MS / 60000) };
}

// --- Placement ----------------------------------------------------------------
// Centre de la map : position du boss.
export const LEVIATHAN_BOSS_POS = Object.freeze({ x: LEVIATHAN_GATE_WORLD.w / 2, y: LEVIATHAN_GATE_WORLD.h / 2 });

// Point d'apparition autour de (x, y), à une distance de [d0, d1], dans la map.
export function leviathanSpawnPoint(x, y, [d0, d1] = LEVIATHAN_BOSS.addsDistance, random = Math.random) {
  const a = random() * Math.PI * 2, d = d0 + random() * (d1 - d0);
  const margin = 400;
  return {
    x: Math.max(margin, Math.min(LEVIATHAN_GATE_WORLD.w - margin, x + Math.cos(a) * d)),
    y: Math.max(margin, Math.min(LEVIATHAN_GATE_WORLD.h - margin, y + Math.sin(a) * d)),
  };
}

// Point d'arrivée des joueurs : un peu partout sur la map, jamais collé au
// boss (au moins 2 500 px du centre).
export function leviathanGateArrival(random = Math.random) {
  const margin = 600, minBoss = 2500;
  for (let i = 0; i < 20; i++) {
    const x = margin + random() * (LEVIATHAN_GATE_WORLD.w - 2 * margin);
    const y = margin + random() * (LEVIATHAN_GATE_WORLD.h - 2 * margin);
    if (Math.hypot(x - LEVIATHAN_BOSS_POS.x, y - LEVIATHAN_BOSS_POS.y) >= minBoss) return { x: Math.round(x), y: Math.round(y) };
  }
  return { x: margin, y: margin };
}

// Nombre de Harbinger du lâcher suivant.
export function leviathanNextAdds(previous, stage) {
  if (!(Number(previous) > 0)) return LEVIATHAN_BOSS.firstAdds;
  return Math.floor(Number(previous)) + (LEVIATHAN_BOSS.addsStep[stage] || 0);
}

// Moment où l'onde d'une impulsion partie de (bx, by) à `at` atteint (x, y).
export function leviathanPulseHitAt(at, bx, by, x, y) {
  return Number(at) + Math.hypot(Number(x) - bx, Number(y) - by) / LEVIATHAN_BOSS.pulseSpeed * 1000;
}

// --- Classement ---------------------------------------------------------------
// Gains de fin de classement : ceux du classement Winter sans l'ICE-100
// (divisés par 2 à chaque place du 1er au 10e, puis le gain du 10e jusqu'au
// 30e). La ressource spéciale de l'événement s'ajoutera ici.
export const LEVIATHAN_RANKING_TOP = 30;
const LEVIATHAN_RANKING_FIXED_FROM = 10;
const LEVIATHAN_RANKING_FIRST = Object.freeze({ credits: 1000000000, exp: 1000000000, honor: 100000000 });
export const LEVIATHAN_RANKING_REWARDS = Object.freeze(Array.from({ length: LEVIATHAN_RANKING_TOP }, (_, i) =>
  Object.freeze({ rank: i + 1, ...Object.fromEntries(Object.entries(LEVIATHAN_RANKING_FIRST)
    .map(([k, v]) => [k, Math.floor(v / 2 ** Math.min(i, LEVIATHAN_RANKING_FIXED_FROM - 1))])) })));

// Points du compte (user.leviathan = { points, period }) pour le classement
// `periodKey` (0 si les points sont ceux d'un autre classement).
export function leviathanPointsFor(entry, periodKey) {
  return periodKey && entry?.period != null && String(entry.period) === String(periodKey)
    ? Math.max(0, Math.floor(Number(entry?.points) || 0)) : 0;
}
// Points du classement en cours (0 hors événement).
export function leviathanPeriodPoints(entry, nowMs = Date.now()) {
  return leviathanPointsFor(entry, leviathanRankingPeriod(nowMs)?.key);
}
// Ordre du classement : points décroissants, puis pseudo.
export function compareLeviathanStanding(a, b) {
  return (Number(b?.points) || 0) - (Number(a?.points) || 0)
    || String(a?.pseudo || "").localeCompare(String(b?.pseudo || ""), "fr");
}
export function leviathanRankingReward(rank) {
  return LEVIATHAN_RANKING_REWARDS[Math.floor(Number(rank)) - 1] || null;
}
// Classement final : les LEVIATHAN_RANKING_TOP premiers ayant au moins 1 point.
export function leviathanFinalStandings(rows) {
  return (Array.isArray(rows) ? rows : [])
    .filter((row) => Number(row?.points) > 0)
    .sort(compareLeviathanStanding)
    .slice(0, LEVIATHAN_RANKING_TOP)
    .map((row, i) => ({ ...row, rank: i + 1, reward: leviathanRankingReward(i + 1) }));
}
