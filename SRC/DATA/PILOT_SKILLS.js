"use strict";

// SRC/DATA/PILOT_SKILLS.js — Arbre de pilotage façon DarkOrbit (données + règles pures).
// Source : darkorbitwiki.com/pilot-skills (25 skills, coûts, prérequis) +
// menu11.jpg (disposition : panneau bleu en haut, violet au milieu, rouge en bas).
// Icônes : ASSETS/SKILLTREE_TEXTURE.png, bande 29 cases de 74x85
// (cases 0-3 vides, 4-28 = les 25 icônes). Mapping vérifié contre les
// icônes officielles du wiki (cases "?" = à confirmer visuellement).
// Adaptations au jeu (pas d'uridium, pas de log-disks lootés, 100 % NPC) :
// - 50 points pilote max (officiel 50) via disques de log achetés ;
// - 1 disque = 300 000 crédits (300 uridium officiel x1000), requis
//   par point repris de la table officielle (30, 33, 36... 3202) ;
// - reset en crédits doublés (1M, 2M, 4M...) ;
// - skills sans cible dans le moteur gardés avec leurs VRAIS effets
//   affichés (branchés plus tard) : Bounty I/II (PvP), Detonation I/II +
//   Explosifs (mines).
// Ce module ne touche ni DOM ni stockage.

export const PILOT_MAX_POINTS = 50;
export const PILOT_PP_PER_LEVEL = 1;
export const LOGDISK_PRICE = 300000; // 1 disque de log
export const LOGDISK_PACK = 10; // pack boutique (3 000 000 crédits)
export const PILOT_RESET_BASE = 1000000; // reset 1 : 1M, puis x2 à chaque reset

// Disques requis par point (table officielle, points 1 à 50).
export const LOGDISK_ROWS = Object.freeze([
  30, 33, 36, 40, 44, 48, 53, 58, 64, 71, 78, 86, 94, 104, 114, 125,
  138, 152, 167, 183, 202, 222, 244, 269, 295, 325, 358, 393, 433,
  476, 523, 576, 633, 697, 766, 843, 927, 1020, 1122, 1234, 1358,
  1494, 1643, 1807, 1988, 2187, 2405, 2646, 2911, 3202,
]);

export function pilotResetCost(resetsDone) {
  const n = Math.max(0, Math.floor(Number(resetsDone) || 0));
  return Math.min(9007199254740991, PILOT_RESET_BASE * 2 ** Math.min(n, 40));
}

// Case icône dans la bande (0-28). Les effets affichés sont toujours les
// vrais effets officiels (même si pas encore branchés moteur).
function sk(id, name, desc, frame, frameSure, max, panel, row, col, active, req, levels) {
  return Object.freeze({
    id, name, desc, frame, frameSure, max, panel, row, col, active,
    req: Object.freeze(req.map((r) => Object.freeze({ ...r, skills: r.skills ? Object.freeze([...r.skills]) : undefined }))),
    levels: Object.freeze(levels.map((l) => Object.freeze({ credits: l.credits, seprom: l.seprom || 0, effect: Object.freeze({ ...l.effect }) }))),
  });
}

const C = (credits, seprom = 0, effect = {}) => ({ credits, seprom, effect });

export const PILOT_SKILLS = Object.freeze([
  // ---- Panneau 0 (bleu, en haut) ----
  sk("shiphull01", "Coque I", "Augmente tes PV max.", 19, true, 2, 0, 0, 0, true, [], [
    C(10000, 0, { hpFlat: 5000 }),
    C(20000, 0, { hpFlat: 10000 }),
  ]),
  sk("engineering", "Ingénierie", "Tes robots réparent plus de PV par seconde.", 13, true, 5, 0, 0, 1, true, [
    { type: "anyPP", skills: ["detonation01", "tactics", "shiphull01"], points: 2 },
  ], [
    C(10000, 0, { repairPct: 5 }),
    C(20000, 0, { repairPct: 10 }),
    C(30000, 0, { repairPct: 15 }),
    C(40000, 0, { repairPct: 20 }),
    C(50000, 0, { repairPct: 30 }),
  ]),
  sk("shieldengineering", "Ingénierie bouclier", "Augmente ton bouclier max.", 18, true, 5, 0, 0, 2, true, [
    { type: "anyPP", skills: ["explosives", "logistics", "engineering"], points: 2 },
  ], [
    C(10000, 0, { shieldPct: 4 }),
    C(20000, 0, { shieldPct: 8 }),
    C(30000, 0, { shieldPct: 12 }),
    C(40000, 0, { shieldPct: 18 }),
    C(50000, 0, { shieldPct: 25 }),
  ]),
  sk("tactics", "Tactique", "Plus d'EXP par alien.", 5, true, 5, 0, 1, 0, true, [], [
    C(10000, 0, { expPct: 2 }),
    C(20000, 0, { expPct: 4 }),
    C(30000, 0, { expPct: 6 }),
    C(40000, 0, { expPct: 8 }),
    C(50000, 0, { expPct: 12 }),
  ]),
  sk("logistics", "Logistique", "Étend ta soute.", 6, true, 5, 0, 1, 1, true, [
    { type: "anyPP", skills: ["detonation01", "tactics", "shiphull01"], points: 1 },
  ], [
    C(10000, 0, { cargoPct: 4 }),
    C(20000, 0, { cargoPct: 8 }),
    C(30000, 0, { cargoPct: 12 }),
    C(40000, 0, { cargoPct: 18 }),
    C(50000, 0, { cargoPct: 25 }),
  ]),
  sk("detonation01", "Détonation I", "Dégâts des mines.", 7, true, 2, 0, 2, 0, false, [], [
    C(10000, 0, { mineDmgPct: 7 }),
    C(20000, 0, { mineDmgPct: 14 }),
  ]),
  sk("explosives", "Explosifs", "Rayon des explosions de mines.", 4, true, 5, 0, 2, 1, false, [
    { type: "anyPP", skills: ["detonation01", "tactics", "shiphull01"], points: 1 },
  ], [
    C(10000, 0, { mineRadiusPct: 4 }),
    C(20000, 0, { mineRadiusPct: 8 }),
    C(30000, 0, { mineRadiusPct: 12 }),
    C(40000, 0, { mineRadiusPct: 18 }),
    C(50000, 0, { mineRadiusPct: 25 }),
  ]),
  sk("heatseeking", "Têtes chercheuses", "Chance de réussite des roquettes.", 22, true, 5, 0, 2, 2, true, [
    { type: "anyPP", skills: ["explosives", "logistics", "engineering"], points: 1 },
  ], [
    C(10000, 0, { rocketHitPct: 1 }),
    C(20000, 0, { rocketHitPct: 2 }),
    C(30000, 0, { rocketHitPct: 4 }),
    C(40000, 0, { rocketHitPct: 6 }),
    C(50000, 0, { rocketHitPct: 10 }),
  ]),
  // ---- Panneau 1 (violet, au milieu) ----
  sk("evasive01", "Évasion I", "Réduit la probabilité ennemie de te toucher.", 16, true, 2, 1, 0, 0, true, [
    { type: "anyPP", skills: ["heatseeking", "shieldengineering"], points: 2 },
  ], [
    C(100000, 100, { evadePct: 2 }),
    C(200000, 200, { evadePct: 4 }),
  ]),
  sk("shiphull02", "Coque II", "Augmente tes PV max.", 20, true, 3, 1, 0, 1, true, [
    { type: "pp", skill: "shiphull01", points: 2 },
    { type: "anyPP", skills: ["bounty01", "luck01", "evasive01"], points: 2 },
  ], [
    C(100000, 100, { hpFlat: 15000 }),
    C(200000, 200, { hpFlat: 25000 }),
    C(300000, 300, { hpFlat: 50000 }),
  ]),
  sk("luck01", "Chance I", "Bonus box plus riches.", 27, true, 2, 1, 1, 0, true, [
    { type: "pp", skill: "logistics", points: 2 },
  ], [
    C(100000, 100, { luckPct: 2 }),
    C(200000, 200, { luckPct: 4 }),
  ]),
  sk("cruelty01", "Cruauté I", "Plus de points d'honneur.", 23, false, 2, 1, 1, 1, true, [
    { type: "anyPP", skills: ["bounty01", "luck01", "evasive01"], points: 2 },
  ], [
    C(100000, 100, { honorPct: 4 }),
    C(200000, 200, { honorPct: 8 }),
  ]),
  sk("tractor01", "Rayon tracteur I", "Plus de butin des cargos.", 14, true, 5, 1, 1, 2, true, [
    { type: "anyPP", skills: ["rocketfusion", "cruelty01", "shiphull02"], points: 2 },
  ], [
    C(100000, 100, { cargoLootPct: 1 }),
    C(200000, 200, { cargoLootPct: 2 }),
    C(300000, 300, { cargoLootPct: 3 }),
    C(400000, 400, { cargoLootPct: 4 }),
    C(500000, 500, { cargoLootPct: 6 }),
  ]),
  sk("bounty01", "Chasseur de primes I", "Dégâts lasers en PvP.", 25, true, 2, 1, 2, 0, false, [
    { type: "anyPP", skills: ["heatseeking", "shieldengineering"], points: 2 },
  ], [
    C(100000, 100, { pvpPct: 2 }),
    C(200000, 200, { pvpPct: 4 }),
  ]),
  sk("rocketfusion", "Fusion roquettes", "Plus de dégâts de roquettes.", 9, true, 5, 1, 2, 1, true, [
    { type: "anyPP", skills: ["bounty01", "luck01", "shiphull02"], points: 2 },
  ], [
    C(100000, 100, { rocketDmgPct: 2 }),
    C(200000, 200, { rocketDmgPct: 4 }),
    C(300000, 300, { rocketDmgPct: 6 }),
    C(400000, 400, { rocketDmgPct: 8 }),
    C(500000, 500, { rocketDmgPct: 15 }),
  ]),
  sk("alienhunter", "Chasseur d'aliens", "Plus de dégâts lasers vs aliens.", 12, true, 5, 1, 2, 2, true, [
    { type: "pp", skill: "rocketfusion", points: 2 },
    { type: "pp", skill: "cruelty01", points: 2 },
  ], [
    C(100000, 100, { alienDmgPct: 2 }),
    C(200000, 200, { alienDmgPct: 4 }),
    C(300000, 300, { alienDmgPct: 6 }),
    C(400000, 400, { alienDmgPct: 8 }),
    C(500000, 500, { alienDmgPct: 12 }),
  ]),
  // ---- Panneau 2 (rouge, en bas) ----
  sk("electrooptics", "Électro-optique", "Précision des lasers.", 21, true, 5, 2, 2, 1, true, [
    { type: "anyPP", skills: ["detonation02", "greed", "shieldmechanics"], points: 5 },
  ], [
    C(1000000, 1000, { laserHitPct: 5 }),
    C(2000000, 2000, { laserHitPct: 10 }),
    C(3000000, 3000, { laserHitPct: 15 }),
    C(4000000, 4000, { laserHitPct: 20 }),
    C(5000000, 5000, { laserHitPct: 25 }),
  ]),
  sk("tractor02", "Rayon tracteur II", "Plus de butin des bonus box.", 15, true, 5, 2, 1, 1, true, [
    { type: "anyPP", skills: ["detonation02", "greed", "shieldmechanics"], points: 5 },
  ], [
    C(1000000, 1000, { bonusLootPct: 2 }),
    C(2000000, 2000, { bonusLootPct: 6 }),
    C(3000000, 3000, { bonusLootPct: 10 }),
    C(4000000, 4000, { bonusLootPct: 15 }),
    C(5000000, 5000, { bonusLootPct: 20 }),
  ]),
  sk("cruelty02", "Cruauté II", "Plus de points d'honneur.", 24, false, 3, 2, 1, 2, true, [
    { type: "pp", skill: "cruelty01", points: 2 },
    { type: "anyPP", skills: ["electrooptics", "tractor02"], points: 3 },
  ], [
    C(1000000, 1000, { honorPct: 12 }),
    C(2000000, 2000, { honorPct: 18 }),
    C(3000000, 3000, { honorPct: 25 }),
  ]),
  sk("shieldmechanics", "Mécanique bouclier", "Ton bouclier encaisse plus de dégâts.", 10, false, 5, 2, 0, 0, true, [
    { type: "pp", skill: "shiphull02", points: 3 },
  ], [
    C(1000000, 1000, { shieldToughPct: 2 }),
    C(2000000, 2000, { shieldToughPct: 4 }),
    C(3000000, 3000, { shieldToughPct: 6 }),
    C(4000000, 4000, { shieldToughPct: 8 }),
    C(5000000, 5000, { shieldToughPct: 12 }),
  ]),
  sk("greed", "Cupidité", "Plus de crédits par alien.", 11, false, 5, 2, 1, 0, true, [
    { type: "anyPP", skills: ["alienhunter", "tractor01"], points: 3 },
  ], [
    C(1000000, 1000, { creditPct: 4 }),
    C(2000000, 2000, { creditPct: 8 }),
    C(3000000, 3000, { creditPct: 12 }),
    C(4000000, 4000, { creditPct: 18 }),
    C(5000000, 5000, { creditPct: 25 }),
  ]),
  sk("evasive02", "Évasion II", "Réduit la probabilité ennemie de te toucher.", 17, true, 3, 2, 0, 2, true, [
    { type: "pp", skill: "shieldmechanics", points: 3 },
    { type: "pp", skill: "evasive01", points: 2 },
  ], [
    C(1000000, 1000, { evadePct: 6 }),
    C(2000000, 2000, { evadePct: 8 }),
    C(3000000, 3000, { evadePct: 12 }),
  ]),
  sk("detonation02", "Détonation II", "Dégâts des mines.", 8, true, 3, 2, 2, 0, false, [
    { type: "pp", skill: "detonation01", points: 2 },
    { type: "anyPP", skills: ["alienhunter", "tractor01"], points: 3 },
  ], [
    C(1000000, 1000, { mineDmgPct: 21 }),
    C(2000000, 2000, { mineDmgPct: 28 }),
    C(3000000, 3000, { mineDmgPct: 50 }),
  ]),
  sk("luck02", "Chance II", "Bonus box plus riches.", 28, true, 3, 2, 1, 3, true, [
    { type: "pp", skill: "luck01", points: 2 },
    { type: "pp", skill: "bounty02", points: 3 },
    { type: "pp", skill: "evasive02", points: 3 },
  ], [
    C(1000000, 1000, { luckPct: 6 }),
    C(2000000, 2000, { luckPct: 8 }),
    C(3000000, 3000, { luckPct: 12 }),
  ]),
  sk("bounty02", "Chasseur de primes II", "Dégâts lasers en PvP.", 26, true, 3, 2, 2, 2, false, [
    { type: "pp", skill: "bounty01", points: 2 },
    { type: "anyPP", skills: ["electrooptics", "tractor02"], points: 3 },
  ], [
    C(1000000, 1000, { pvpPct: 6 }),
    C(2000000, 2000, { pvpPct: 8 }),
    C(3000000, 3000, { pvpPct: 12 }),
  ]),
]);

const PILOT_BY_ID = new Map(PILOT_SKILLS.map((s) => [s.id, s]));

export function getPilotSkill(id) {
  return PILOT_BY_ID.get(String(id || "").toLowerCase()) || null;
}

export function normalizePilotSkills(raw) {
  const out = { points: 0, spent: {}, resets: 0, disks: 0 };
  if (raw && typeof raw === "object") {
    out.points = Math.max(0, Math.min(PILOT_MAX_POINTS, Math.floor(Number(raw.points) || 0)));
    out.resets = Math.max(0, Math.floor(Number(raw.resets) || 0));
    out.disks = Math.max(0, Math.floor(Number(raw.disks) || 0));
    const spent = raw.spent;
    if (spent && typeof spent === "object") {
      for (const s of PILOT_SKILLS) {
        const lvl = Math.floor(Number(spent[s.id] ?? 0));
        if (Number.isFinite(lvl) && lvl > 0) out.spent[s.id] = Math.min(s.max, lvl);
      }
    }
  }
  return out;
}

export function pilotSkillLevel(ps, id) {
  return Math.max(0, Math.floor(Number(ps?.spent?.[String(id)] ?? 0)));
}

export function pilotPointsSpent(ps) {
  if (!ps?.spent || typeof ps.spent !== "object") return 0;
  let total = 0;
  for (const s of PILOT_SKILLS) total += Math.min(s.max, Math.max(0, Math.floor(Number(ps.spent[s.id]) || 0)));
  return total;
}

export function pilotPointsAvailable(ps) {
  return Math.max(0, Math.floor(Number(ps?.points) || 0) - pilotPointsSpent(ps));
}

// Éligibilité d'investissement (hors crédits/seprom, vérifiés côté ACCOUNT).
// Retourne { ok, reason }.
export function canInvestPilotSkill(ps, id) {
  const skill = getPilotSkill(id);
  if (!skill) return { ok: false, reason: "Talent introuvable." };
  const state = normalizePilotSkills(ps);
  const lvl = pilotSkillLevel(state, skill.id);
  if (lvl >= skill.max) return { ok: false, reason: "Niveau max atteint." };
  if (pilotPointsAvailable(state) < PILOT_PP_PER_LEVEL) return { ok: false, reason: "Aucun point pilote." };
  for (const r of skill.req) {
    if (r.type === "pp") {
      if (pilotSkillLevel(state, r.skill) < Math.max(0, Number(r.points) || 0)) {
        const need = getPilotSkill(r.skill);
        return { ok: false, reason: `${r.points} PP requis en ${need ? need.name : r.skill}.` };
      }
    } else if (r.type === "anyPP") {
      let sum = 0;
      for (const sid of r.skills || []) sum += pilotSkillLevel(state, sid);
      if (sum < Math.max(0, Number(r.points) || 0)) {
        return { ok: false, reason: `${r.points} PP requis dans une condition.` };
      }
    }
  }
  return { ok: true };
}

// Bonus cumulés des skills ACTIFS (les autres sont affichés mais ignorés).
// Valeurs = effet du niveau atteint (les paliers wiki sont des totaux).
export function pilotSkillMults(ps) {
  const m = {
    hpFlat: 0, repairPct: 0, shieldPct: 0, shieldToughPct: 0,
    expPct: 0, cargoPct: 0, honorPct: 0, creditPct: 0,
    cargoLootPct: 0, bonusLootPct: 0, rocketDmgPct: 0,
    alienDmgPct: 0, laserHitPct: 0, evadePct: 0, luckPct: 0,
    rocketHitPct: 0,
  };
  if (!ps?.spent || typeof ps.spent !== "object") return m;
  for (const s of PILOT_SKILLS) {
    if (s.active !== true) continue;
    const lvl = Math.min(s.max, Math.max(0, Math.floor(Number(ps.spent[s.id]) || 0)));
    if (lvl <= 0) continue;
    const effect = s.levels[lvl - 1]?.effect || {};
    for (const key of Object.keys(m)) {
      if (Number.isFinite(Number(effect[key]))) m[key] += Number(effect[key]);
    }
  }
  return m;
}

// Libellé d'effet pour l'UI ("+10 000 PV max", "+12 % EXP"...).
export function formatPilotEffect(effect) {
  const parts = [];
  const pct = (v) => `${Number(v)} %`;
  const num = (v) => Math.max(0, Math.floor(Number(v) || 0)).toLocaleString("fr-FR");
  if (effect.hpFlat) parts.push(`+${num(effect.hpFlat)} PV max`);
  if (effect.repairPct) parts.push(`+${pct(effect.repairPct)} réparation`);
  if (effect.shieldPct) parts.push(`+${pct(effect.shieldPct)} bouclier`);
  if (effect.shieldToughPct) parts.push(`+${pct(effect.shieldToughPct)} résistance bouclier`);
  if (effect.evadePct) parts.push(`+${pct(effect.evadePct)} esquive`);
  if (effect.expPct) parts.push(`+${pct(effect.expPct)} EXP`);
  if (effect.cargoPct) parts.push(`+${pct(effect.cargoPct)} soute`);
  if (effect.luckPct) parts.push(`+${pct(effect.luckPct)} bonus box`);
  if (effect.honorPct) parts.push(`+${pct(effect.honorPct)} honneur`);
  if (effect.creditPct) parts.push(`+${pct(effect.creditPct)} crédits`);
  if (effect.cargoLootPct) parts.push(`+${pct(effect.cargoLootPct)} butin cargos`);
  if (effect.bonusLootPct) parts.push(`+${pct(effect.bonusLootPct)} butin bonus`);
  if (effect.mineDmgPct) parts.push(`+${pct(effect.mineDmgPct)} dégâts mines`);
  if (effect.mineRadiusPct) parts.push(`+${pct(effect.mineRadiusPct)} rayon mines`);
  if (effect.rocketHitPct) parts.push(`+${pct(effect.rocketHitPct)} réussite roquettes`);
  if (effect.pvpPct) parts.push(`+${pct(effect.pvpPct)} dégâts PvP`);
  if (effect.rocketDmgPct) parts.push(`+${pct(effect.rocketDmgPct)} dégâts roquettes`);
  if (effect.alienDmgPct) parts.push(`+${pct(effect.alienDmgPct)} dégâts vs aliens`);
  if (effect.laserHitPct) parts.push(`+${pct(effect.laserHitPct)} précision lasers`);
  return parts.join(" · ") || "—";
}

// Position icône dans la bande (74px par case).
export function pilotSkillFrameX(frame) {
  return Math.max(0, Math.floor(Number(frame) || 0)) * 74;
}
