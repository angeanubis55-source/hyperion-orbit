"use strict";

// Conseiller de modules (fenêtre Modules, onglet CONSEILLER).
// Pur (aucun DOM) : testable sous Node.
//
// Principe : chaque stat reçoit un POIDS selon le style de jeu (PvE / PvP)
// et l'objectif (équilibré / Expérience / Honneur). Le score d'un module =
// somme(poids × % de la stat × multiplicateur de coque). L'unité est
// « l'équivalent d'1 % de dégâts » : un score de 20 ≈ +20 % de dégâts.
// Les modules se cumulent de façon additive (SHIP_HANGARS.computeHangarStats),
// donc on choisit les 4 meilleurs un par un, en tenant compte des plafonds.

import { getShipFamilyId } from "../../SHIP/SHIP_PACKS.js";

export const ADVISOR_MODULE_SLOTS = 4;

// Taux de MISS de base des lasers (ORBIT_ENGINE PLAYER_SHOTS.missChance) :
// au-delà de 15 % de Ch. Laser, le bonus ne sert plus à rien.
export const ADVISOR_LASER_HIT_CAP = 15;

export const ADVISOR_MODES = Object.freeze({
  pve: "PvE (NPC)",
  pvp: "PvP (joueurs)",
});

export const ADVISOR_FOCUSES = Object.freeze({
  balanced: "Équilibré",
  exp: "Plus d'expérience",
  honor: "Plus d'honneur",
});

// Poids pour 1 % de chaque stat, avec la raison affichée au joueur.
const BASE_WEIGHTS = Object.freeze({
  pve: Object.freeze({
    dmg_npc: [1.05, "Lasers ET roquettes contre les NPC : la meilleure stat de farm."],
    damage: [1, "Tous les tirs laser, sur n'importe quelle cible."],
    dmg_laser: [1, "Même effet que Dégâts sur les lasers (les deux s'additionnent)."],
    laser_hit: [0.15, "Peu utile : un tir raté de temps en temps change peu de chose."],
    shield: [0.5, "Survie : utile, mais les NPC ne demandent pas un tank."],
    hp: [0.45, "Survie : un peu moins efficace que le bouclier qui absorbe en premier."],
    evasion: [0.55, "Chaque % annule ~1 % des coups reçus."],
    speed: [0.35, "Déplacements et collecte plus rapides entre les NPC."],
    penetration: [0.3, "Traverse le bouclier des NPC qui en ont."],
    dmg_rocket: [0.25, "Les roquettes ne pèsent qu'une petite part des dégâts."],
    rocket_hit: [0.05, "Quasi inutile."],
    dmg_pvp: [0, "Aucun effet contre les NPC."],
    exp: [0.1, "Petit bonus de progression."],
    honor: [0.05, "Les NPC donnent peu d'honneur."],
  }),
  pvp: Object.freeze({
    dmg_pvp: [1.05, "Lasers ET roquettes contre les joueurs : la meilleure stat de combat."],
    damage: [1, "Tous les tirs laser, sur n'importe quelle cible."],
    dmg_laser: [1, "Même effet que Dégâts sur les lasers (les deux s'additionnent)."],
    laser_hit: [0.15, "Peu utile : un tir raté de temps en temps change peu de chose."],
    evasion: [1, "Chaque % annule ~1 % des coups adverses : énorme en duel."],
    penetration: [0.9, "Traverse le bouclier adverse : les dégâts vont directement sur la coque."],
    shield: [0.85, "Survie en duel : absorbe les dégâts avant la coque."],
    hp: [0.8, "Survie en duel, contre la pénétration adverse aussi."],
    speed: [0.7, "Fuir, rattraper, garder la distance : décisif en PvP."],
    dmg_rocket: [0.4, "Les roquettes comptent davantage en duel."],
    rocket_hit: [0.05, "Quasi inutile."],
    dmg_npc: [0, "Aucun effet contre les joueurs."],
    exp: [0.05, "Les joueurs donnent peu d'expérience."],
    honor: [0.1, "Petit bonus d'honneur."],
  }),
});

// Objectif : l'Exp ou l'Honneur deviennent prioritaires (cap 12 % par stat,
// d'où un poids élevé pour passer devant un gros bonus de dégâts).
const FOCUS_WEIGHTS = Object.freeze({
  exp: [3, "Objectif Expérience : chaque % d'Exp vaut 3 % de dégâts."],
  honor: [3, "Objectif Honneur : chaque % d'Honneur vaut 3 % de dégâts."],
});

export function advisorWeights(mode, focus) {
  const base = BASE_WEIGHTS[mode] || BASE_WEIGHTS.pve;
  const out = {};
  for (const [stat, [weight, why]] of Object.entries(base)) out[stat] = { weight, why };
  const boost = FOCUS_WEIGHTS[focus];
  if (boost) out[focus] = { weight: boost[0], why: boost[1] };
  return out;
}

// Orcus x1,5 et Orcus Plus x2 (même règle que SHIP_HANGARS).
export function advisorHullMult(shipId) {
  const family = getShipFamilyId(shipId);
  return family === "orcus_plus" ? 2 : family === "orcus" ? 1.5 : 1;
}

function effectivePct(stat, total) {
  return stat === "laser_hit" ? Math.min(total, ADVISOR_LASER_HIT_CAP) : total;
}

// Gain d'un module ajouté à des totaux déjà montés, stat par stat.
function moduleContribution(module, totals, weights, hullMult) {
  const parts = [];
  let score = 0;
  for (const bonus of module?.bonuses || []) {
    const stat = String(bonus?.stat || "");
    const pct = (Number(bonus?.pct) || 0) * hullMult;
    const before = Number(totals[stat] || 0);
    const gainPct = effectivePct(stat, before + pct) - effectivePct(stat, before);
    const weight = Number(weights[stat]?.weight || 0);
    const points = gainPct * weight;
    score += points;
    parts.push({ stat, pct, gainPct, weight, points, capped: gainPct !== pct });
  }
  return { score, parts };
}

function addTotals(totals, module, hullMult) {
  for (const bonus of module?.bonuses || []) {
    const stat = String(bonus?.stat || "");
    totals[stat] = Number(totals[stat] || 0) + (Number(bonus?.pct) || 0) * hullMult;
  }
}

function setScore(modules, weights, hullMult) {
  const totals = {};
  let score = 0;
  for (const module of modules) {
    score += moduleContribution(module, totals, weights, hullMult).score;
    addTotals(totals, module, hullMult);
  }
  return { score, totals };
}

// modules : modules du joueur compatibles avec ce vaisseau.
// equippedIds : modules actuellement montés sur ce vaisseau.
export function adviseModules({ modules = [], equippedIds = [], shipId = "", mode = "pve", focus = "balanced" } = {}) {
  const weights = advisorWeights(mode, focus);
  const hullMult = advisorHullMult(shipId);
  const pool = modules.filter((m) => m && m.id);

  // Sélection gloutonne : à chaque emplacement, le module qui rapporte le
  // plus EN PLUS de ceux déjà choisis (gère le plafond de Ch. Laser).
  // Règle du montage : 1 seul module par couleur (HP / SHD / DMG / SPC).
  const totals = {};
  const picks = [];
  const usedTypes = new Set();
  let remaining = [...pool];
  while (picks.length < ADVISOR_MODULE_SLOTS && remaining.length) {
    const ranked = remaining
      .map((module) => ({ module, ...moduleContribution(module, totals, weights, hullMult) }))
      .sort((a, b) => b.score - a.score);
    const best = ranked[0];
    // Un module qui fait perdre des points ne vaut pas mieux qu'un slot vide.
    if (!best || best.score <= 0) break;
    // Comparaison avec le meilleur autre module de la MÊME couleur : c'est
    // lui qui aurait pris cet emplacement.
    const runnerUp = ranked.find((r) => r !== best && r.module.type === best.module.type) || null;
    picks.push({ ...best, slot: picks.length + 1, runnerUp });
    addTotals(totals, best.module, hullMult);
    usedTypes.add(best.module.type);
    remaining = remaining.filter((m) => !usedTypes.has(m.type));
  }

  const equippedSet = new Set(equippedIds.filter(Boolean).map(String));
  const equipped = pool.filter((m) => equippedSet.has(String(m.id)));
  const current = setScore(equipped, weights, hullMult);

  // Classement de tous les modules seuls (sans cumul), pour le tableau.
  const pickedIds = new Set(picks.map((p) => String(p.module.id)));
  const ranking = pool
    .map((module) => ({
      module,
      ...moduleContribution(module, {}, weights, hullMult),
      recommended: pickedIds.has(String(module.id)),
      equipped: equippedSet.has(String(module.id)),
    }))
    .sort((a, b) => b.score - a.score);

  return {
    mode,
    focus,
    hullMult,
    weights,
    picks,
    totals,
    recommendedScore: picks.reduce((s, p) => s + p.score, 0),
    currentScore: current.score,
    currentTotals: current.totals,
    equippedCount: equipped.length,
    ranking,
  };
}
