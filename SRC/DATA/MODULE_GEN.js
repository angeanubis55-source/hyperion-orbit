"use strict";

// Génération de modules vaisseau (roulette boutique + boutique du passe).
// Extrait de PUBLIC/PROFILE.js à logique STRICTEMENT identique (mêmes
// tables, mêmes tirages) pour être réutilisé en jeu (ORBIT_ENGINE).
// Pur (aucun DOM) : testable sous Node.

import {
  MODULE_ALL_STATS,
  MODULE_PCT_BAN,
  MODULE_SPC_STATS,
  MODULE_TIER_MALUS,
  MODULE_TIER_WEIGHTS,
  MODULE_TYPE_WEIGHTS,
  getModuleRarity,
  getModuleStatCountWeights,
  getStatMaxPct,
} from "./MODULE_DROPS.js";
import { CATALOG } from "../CORE/CATALOG.js";
import { getShipFamilyId } from "../../SHIP/SHIP_PACKS.js";

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

function rollModulePct(min, max) {
  let value = 0;
  let guard = 0;
  while (value === MODULE_PCT_BAN && guard < 16) {
    value = randInt(min, max);
    guard++;
  }
  return value;
}

export function generateShipModule(user, opts = {}) {
  const tier = opts.tier || pickWeighted(MODULE_TIER_WEIGHTS);
  const type = opts.type || pickWeighted(MODULE_TYPE_WEIGHTS);
  const statCount = opts.statCount || pickWeighted(getModuleStatCountWeights(tier));

  const ships = (Array.isArray(opts.ships) ? opts.ships
    : Array.isArray(CATALOG?.ships) ? CATALOG.ships : [])
    .filter((s) => String(s?.ship?.id || "").toLowerCase() !== "police" && !s?.shopHidden);
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
    rerolls: 0,
    rerollCredits: 0,
  };
}
