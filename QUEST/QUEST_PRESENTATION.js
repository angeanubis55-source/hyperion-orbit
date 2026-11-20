"use strict";

import {
  MAX_ACTIVE_QUESTS,
  QUEST_DEFINITIONS,
  canAcceptQuest,
  FORGE_CONDITIONS,
  FORGE_MAX_AMOUNT,
  findQuestDefinition,
  forgeGeneratedTitle,
  forgePreview,
  forgeTargetName,
  getForgeBlock,
  getForgeQuest,
  getQuestPrerequisiteIds,
  getQuestObjectives,
  getQuestRequiredLevel,
  getOrderedQuestDefinitions,
  isQuestComplete,
} from "./QUEST_TYPES.js";
import { getQuestExperienceReward, getQuestHonorReward } from "../SRC/CORE/PROGRESSION.js";
import { formatInteger } from "../SRC/CORE/NUMBER_FORMAT.js";
import { getResourceName } from "../SRC/DATA/RESOURCES.js";
import { SPRITE_TRIM } from "./SPRITE_TRIM.js";

// Dimensions du contenu visible (sans les marges transparentes du PNG).
// Ex : Streuner = 73x49 visibles sur 109x96 de canvas.
function trimmedDims(source) {
  let key = null;
  if (source?.path) key = String(source.path).replace(/\\/g, "/").replace(/\/+$/, "");
  else if (source?.src) {
    const p = String(source.src).replace(/\\/g, "/");
    const i = p.lastIndexOf("/");
    if (i > 0) key = p.slice(0, i);
  }
  const trim = (key && SPRITE_TRIM[key]) || null;
  if (trim && trim[0] > 0 && trim[1] > 0) return { w: trim[0], h: trim[1] };
  const w = Number(source?.w) || 0, h = Number(source?.h) || 0;
  if (w > 0 && h > 0) return { w, h };
  return null;
}

// Icônes SVG du terminal (courant hérité, 16px, stroke currentColor).
const svgIcon = (inner, size = 16) => `<svg class="qtIcon" width="${size}" height="${size}" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
const SVG_LOCK = svgIcon(`<rect x="3.5" y="7" width="9" height="6.5" rx="1.2"/><path d="M5.5 7V5.2a2.5 2.5 0 0 1 5 0V7"/>`, 13);
const SVG_CHECK = svgIcon(`<path d="M3 8.5l3.2 3.2L13 4.8"/>`, 13);
const SVG_SEARCH = svgIcon(`<circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5l3.5 3.5"/>`, 14);

// Normalisation : plus le sprite est gros, plus on divise (jamais d'agrandissement),
// pour que toutes les images fassent à peu près la même taille cible.
const LIST_THUMB_TARGET = 40;
const DETAIL_PORTRAIT_TARGET = 112;
const OBJECTIVE_ICON_TARGET = 44;
export function normalizedSpriteSize(source, target) {
  const dims = trimmedDims(source);
  if (!dims) return { w: target, h: target };
  const k = Math.min(1, target / Math.max(dims.w, dims.h));
  return { w: Math.max(12, Math.round(dims.w * k)), h: Math.max(12, Math.round(dims.h * k)) };
}
function spriteImg(source, src, target) {
  const { w, h } = normalizedSpriteSize(source, target);
  return `<img src="${src}" width="${w}" height="${h}" style="width:${w}px;height:${h}px" alt="" loading="lazy" draggable="false" onerror="this.style.visibility='hidden'">`;
}
const escapeAttr = value => String(value ?? "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

const QUEST_AMMO_LABELS = { x1: "LCB-10", x2: "MCB-25", x3: "MCB-50", x4: "UCB-100", x6: "RSB-75", sab: "SAB-50", rcb: "RCB-140", cbo: "CBO-100", job: "JOB-100", rb: "RB-214", pib: "PIB-100", idb: "IDB-125", vb: "VB-142", emaa: "EMAA-20", sbl: "SBL-100", abl: "A-BL", tent: "TENT-100", ice: "ICE-100" };
const QUEST_LASER_LABELS = { laser_prl: "Laser Prometheus" };
function questLaserLabel(id) {
  if (QUEST_LASER_LABELS[id]) return QUEST_LASER_LABELS[id];
  return String(id || "Laser").replace(/^laser_?/i, "Laser ").replace(/[_-]+/g, " ").trim() || "Laser";
}

function rewardRows(quest) {
  const r = quest.reward || {};
  const rows = [];
  // Montants à 0 : on n'affiche rien (ex : quêtes BL sans crédits).
  const credits = Math.max(0, Math.floor(Number(r.credits) || 0));
  if (credits > 0) rows.push(["Crédits", formatInteger(credits)]);
  const exp = Math.max(0, Math.floor(Number(getQuestExperienceReward(quest)) || 0));
  if (exp > 0) rows.push(["Expérience", formatInteger(exp)]);
  const honor = Math.max(0, Math.floor(Number(getQuestHonorReward(quest)) || 0));
  if (honor > 0) rows.push(["Honneur", formatInteger(honor)]);
  for (const [type, amount] of Object.entries(r.ammo || {})) {
    if (!(Number(amount) > 0)) continue;
    rows.push([`Munitions ${QUEST_AMMO_LABELS[type] || String(type).toUpperCase()}`, formatInteger(amount)]);
  }
  for (const [id, qty] of Object.entries(r.lasers || {})) {
    if (!(Number(qty) > 0)) continue;
    rows.push([questLaserLabel(id), `${formatInteger(qty)}x`]);
  }
  for (const [id, qty] of Object.entries(r.resources || {})) {
    if (!(Number(qty) > 0)) continue;
    rows.push([getResourceName(id, qty), formatInteger(qty)]);
  }
  const galaxyEnergy = Math.max(0, Math.floor(Number(r.galaxyEnergy) || 0));
  if (galaxyEnergy > 0) rows.push(["Énergies Galaxy Gate", formatInteger(galaxyEnergy)]);
  const stakeBack = Math.max(0, Math.floor(Number(r.forgeStake) || 0));
  if (stakeBack > 0) rows.push(["Mise rendue", formatInteger(stakeBack)]);
  return rows;
}

export function formatQuestEntityName(value) {
  return String(value ?? "")
    .trim()
    .replace(/^npc_/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function objectiveLabel(objective) {
  // Visites : garde l'id de carte tel quel ("2-8", pas "2 8").
  if (objective?.kind === "visit") return String(objective?.label || objective?.type || "Objectif").trim();
  return formatQuestEntityName(objective?.label || objective?.type || "Objectif");
}

// Libellé d'Aperçu : inclut le nombre ("Éliminer 5 Boss Streuners").
// Les libellés qui ont déjà un nombre ("Éliminer 1000 X", "Visiter la carte…") sont inchangés.
// Sinon on remplace le premier article ("des", "du", "de la", "le", "un"...)
// par le montant : couvre toutes les formulations ("Collecter du Palladium"
// -> "Collecter 50 Palladium", "Détruire le Mindfire" -> "Détruire 1 Mindfire").
function apercuObjectiveLabel(objective) {
  const base = objectiveLabel(objective);
  // Grands nombres lisibles : "Éliminer 65000 X" -> "Éliminer 65 000 X".
  if (/\d/.test(base)) return base.replace(/\b\d{4,}\b/g, (n) => formatInteger(Number(n)));
  const amount = Math.max(1, Math.floor(Number(objective?.amount) || 1));
  const pattern = /\b(des|du|de la|de l'|de|le|la|les|l'|un|une)\b/i;
  // Pas d'article à remplacer : le nombre va à la fin (jamais perdu).
  if (!pattern.test(base)) return amount > 1 ? `${base} ×${formatInteger(amount)}` : base;
  return base.replace(pattern, formatInteger(amount));
}

// Contraintes d'un objectif défi, en étiquettes courtes (une par condition,
// chacune traduite séparément).
const CHALLENGE_SHIP_NAMES = { phoenix_bleu: "Phoenix Bleu", liberator: "Liberator" };
const CHALLENGE_LASER_NAMES = { laser_lf1: "LF-1" };
function questChallengeTokens(objective) {
  const cond = objective?.cond;
  if (!cond) return [];
  const tokens = [];
  if (cond.solo) tokens.push("En solo");
  if (cond.config) tokens.push(`Config ${cond.config}`);
  if (cond.ship) tokens.push(`Vaisseau : ${CHALLENGE_SHIP_NAMES[cond.ship] || cond.ship}`);
  if (cond.laser) tokens.push(`Lasers ${CHALLENGE_LASER_NAMES[cond.laser] || cond.laser} uniquement`);
  if (cond.maxLasers) tokens.push(`${cond.maxLasers} laser maximum`);
  if (cond.ammo) tokens.push(`Munitions ${QUEST_AMMO_LABELS[cond.ammo] || String(cond.ammo).toUpperCase()} uniquement`);
  if (cond.stayed) tokens.push("Sans bouger");
  if (cond.hullIntact) tokens.push("Sans perte de coque");
  return tokens;
}
const challengeChips = (objective, cls) => {
  const tokens = questChallengeTokens(objective);
  return tokens.length ? `<span class="${cls}">${tokens.map(token => `<span>${token}</span>`).join("")}</span>` : "";
};

// Où trouver la cible d'un objectif, en une ligne.
function objectiveWhere(objective, npcLocations, collectables) {
  if (objective.kind === "visit") return `Destination : carte ${objective.type}`;
  if (objective.kind === "gate") return `À construire dans le Galaxy Spinner de ta base`;
  if (objective.map) {
    const maps = [].concat(objective.map);
    return `${maps.length > 1 ? "Cartes" : "Carte"} ${maps.join(", ")} uniquement`;
  }
  if (objective.kind === "collect") {
    const maps = collectables?.[objective.type]?.maps;
    if (maps === "*") return objective.type === "Cargo_Box" ? "Butin des NPC, toutes les cartes" : "Toutes les cartes normales";
    const list = Array.isArray(maps) ? maps : maps ? [maps] : [];
    return list.length ? `Cartes ${list.join(", ")}` : "Butin spécial des NPC associés";
  }
  if (objective.type === "*") return "N'importe quel NPC, sur toutes les cartes";
  const maps = npcLocations?.[objective.type] || [];
  return maps.length ? `Cartes ${maps.join(", ")}` : "Apparaît par invocation";
}

// Sprites thématiques (w/h = taille réelle) : visites → portail standard
// (portail pirate sur les maps 5-x), gates → portail de la gate.
const GATE_PORTAL_SPRITES = {
  alpha: { src: "ASSETS/ALPHA_PORTAL/ACTIVE.png", w: 500, h: 500 },
  beta: { src: "ASSETS/BETA_PORTAL/ACTIVE.png", w: 437, h: 456 },
  gamma: { src: "ASSETS/GAMMA_PORTAL/ACTIVE.png", w: 360, h: 421 },
  delta: { src: "ASSETS/DELTA_PORTAL/ACTIVE.png", w: 400, h: 560 },
  epsilon: { src: "ASSETS/EPSILON_PORTAL/ACTIVE.png", w: 406, h: 474 },
  zeta: { src: "ASSETS/ZETA_PORTAL/ACTIVE.png", w: 498, h: 490 },
  kappa: { src: "ASSETS/KAPPA_PORTAL/ACTIVE.png", w: 407, h: 427 },
  lambda: { src: "ASSETS/LAMBDA_PORTAL/ACTIVE.png", w: 402, h: 401 },
  kronos: { src: "ASSETS/KRONOS_PORTAL/ACTIVE.png", w: 410, h: 353 },
};
const VISIT_PORTAL_SPRITE = { src: "ASSETS/STANDARD_PORTAL/ACTIVE.png", w: 320, h: 320 };
const PIRATE_PORTAL_SPRITE = { src: "ASSETS/PIRATES_PORTAL/ACTIVE.png", w: 362, h: 387 };

export function questObjectiveSprite(objective, collectables, npcTypes) {
  if (objective?.kind === "collect") return collectables?.[objective.type]?.sprite;
  if (objective?.kind === "gate") {
    return GATE_PORTAL_SPRITES[String(objective.type || "").toLowerCase()] || VISIT_PORTAL_SPRITE;
  }
  if (objective?.kind === "visit") {
    return /^5-/i.test(String(objective.type || "")) ? PIRATE_PORTAL_SPRITE : VISIT_PORTAL_SPRITE;
  }
  return npcTypes?.[objective?.type]?.sprite;
}

export function getQuestTargetSprite(quest, collectables, npcTypes) {
  return questObjectiveSprite(getQuestObjectives(quest)[0], collectables, npcTypes);
}

export function getQuestTargetImage(quest, collectables, npcTypes) {
  const source = getQuestTargetSprite(quest, collectables, npcTypes);
  if (source?.src) return source.src;
  if (!source?.path) return "ASSETS/QUEST_BUTTON/1.png";
  return `${source.path}${Number(source.firstNumber ?? 1)}${source.ext || ".png"}`;
}

export function questObjectiveImage(objective, collectables, npcTypes) {
  const source = questObjectiveSprite(objective, collectables, npcTypes);
  if (source?.src) return source.src;
  if (!source?.path) return "ASSETS/QUEST_BUTTON/1.png";
  return `${source.path}${Number(source.firstNumber ?? 1)}${source.ext || ".png"}`;
}

// Fenêtre Missions (journal) : version compacte. Objectifs terminés
// repliés en une ligne, récompense résumée sur une ligne (clic = détail),
// bouton Annuler collé à droite de la ligne Récompense.
const JOURNAL_ICON_TARGET = 26;
const qcChevron = (open) => `<svg class="qcChevron${open ? " isOpen" : ""}" width="9" height="9" viewBox="0 0 10 10" aria-hidden="true"><path d="M3 1.5L7 5 3 8.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"></path></svg>`;

export function buildQuestCard(quest, questState, context = {}) {
  const { collectables = {}, npcTypes = {}, showDone = false, showReward = false } = context;
  const objectives = getQuestObjectives(quest);
  const progress = questState.active[quest.id] || {};
  const rows = objectives.map(objective => {
    const current = Number(progress[objective.id] || 0);
    const done = current >= objective.amount;
    const iconSize = normalizedSpriteSize(questObjectiveSprite(objective, collectables, npcTypes), JOURNAL_ICON_TARGET);
    const html = `<div class="qoffObjective${done ? " isDone" : ""}"><span class="qoffCheck"><input type="checkbox" tabindex="-1" aria-hidden="true"${done ? " checked" : ""} disabled></span><span class="qoffObjectiveLabel">${apercuObjectiveLabel(objective)}${challengeChips(objective, "qcConds")}</span><b>${current}/${objective.amount}</b><img src="${questObjectiveImage(objective, collectables, npcTypes)}" width="${iconSize.w}" height="${iconSize.h}" style="width:${iconSize.w}px;height:${iconSize.h}px" alt="" loading="lazy" draggable="false" onerror="this.style.visibility='hidden'"></div>`;
    return { done, html };
  });
  const doneCount = rows.filter(row => row.done).length;
  // Tout est fini : on montre tout (rien à replier).
  const canFold = doneCount > 0 && doneCount < rows.length;
  const foldHtml = canFold
    ? `<button type="button" class="qcToggle qcDoneToggle" data-quest-toggle="done" aria-expanded="${showDone ? "true" : "false"}"><span class="qcDoneMark" aria-hidden="true"></span><span class="qcToggleText">Objectifs terminés (${doneCount})</span>${qcChevron(showDone)}</button>`
    : "";
  const visibleRows = rows.filter(row => !canFold || showDone || !row.done).map(row => row.html).join("");
  const rewards = rewardRows(quest);
  const rewardToggle = rewards.length
    ? `<button type="button" class="qcToggle qcRewardToggle" data-quest-toggle="reward" aria-expanded="${showReward ? "true" : "false"}"><span class="qoffSection">Récompense</span>${qcChevron(showReward)}</button>`
    : "";
  const abandonBtn = `<button type="button" class="questAction questCancel qcAbandon" data-quest-action="abandon" data-quest-id="${quest.id}" title="Abandonner la mission">Annuler la mission</button>`;
  const rewardHtml = `<div class="qcRewardRow">${rewardToggle}${abandonBtn}</div>`
    + (rewards.length && showReward ? `<div class="qoffBox">${rewards.map(([label, value]) => `<div class="qoffReward"><span>${label}</span><b>${value}</b></div>`).join("")}</div>` : "");

  return `<article class="questCard questCompact">
    <h2 class="qoffTitle qcQuestName">${quest.title}</h2>
    <div class="qoffBox">${foldHtml}${visibleRows}</div>
    ${rewardHtml}
  </article>`;
}

export function buildQuestJournalView(questState, selectedId, context = {}) {
  const activeIds = Object.keys(questState.active);
  const selectedQuestId = activeIds.includes(selectedId) ? selectedId : (activeIds[0] || null);
  const selected = findQuestDefinition(selectedQuestId, questState);
  return {
    selectedQuestId,
    intro: "",
    tabsHtml: activeIds.map((id, index) => {
      const quest = findQuestDefinition(id, questState);
      return quest ? `<button type="button" class="gameWinMinBtn miniZoomBtn questTab${id === selectedQuestId ? " active" : ""}" data-quest-tab="${id}" title="${quest.title}">${index + 1}</button>` : "";
    }).join(""),
    contentHtml: selected
      ? buildQuestCard(selected, questState, context)
      : `<div class="questEmpty">Aucune mission active pour le moment</div>`,
  };
}

// Terminal de quêtes : tableau des missions (onglets par statut), la
// mission sélectionnée se déplie dans sa ligne.
const QUEST_TERMINAL_TABS = [
  ["open", "Disponibles", "Dispo."],
  ["active", "En cours", "En cours"],
  ["locked", "Verrouillées", "Verrou."],
  ["done", "Terminées", "Finies"],
  ["forge", "Fabricateur", "Fabric."],
];
const QUEST_STATUS_LABELS = { open: "Disponible", active: "En cours", locked: "Verrouillée", done: "Terminée" };

// Onglet du terminal où se trouve une mission (done / active / locked / open).
export function getQuestTerminalStatus(questState, questId) {
  if (questState.completed.includes(questId)) return "done";
  if (questState.active[questId] != null) return "active";
  const quest = findQuestDefinition(questId, questState);
  return quest && getQuestPrerequisiteIds(quest).some((id) => !questState.completed.includes(id)) ? "locked" : "open";
}

// Avancement moyen des objectifs (0 → 1), chaque objectif plafonné à 100 %.
function questProgressRatio(quest, progress = {}) {
  const objectives = getQuestObjectives(quest);
  if (!objectives.length) return 0;
  const sum = objectives.reduce((total, objective) =>
    total + Math.min(1, Number(progress[objective.id] || 0) / Math.max(1, Number(objective.amount) || 1)), 0);
  return sum / objectives.length;
}

// Onglet Fabricateur : formulaire à gauche, aperçu du contrat à droite.
// Contrat en cours : sa ligne du tableau + le délai avant le suivant.
const SVG_DICE = svgIcon(`<rect x="2.5" y="2.5" width="11" height="11" rx="2.2"/><circle cx="5.6" cy="5.6" r=".9" fill="currentColor"/><circle cx="10.4" cy="10.4" r=".9" fill="currentColor"/><circle cx="8" cy="8" r=".9" fill="currentColor"/>`, 14);
function forgeDelay(ms) {
  const minutes = Math.max(1, Math.ceil(ms / 60000));
  return { h: Math.floor(minutes / 60), m: minutes % 60 };
}
function forgeMult(value) {
  return `×${String(Math.round(value * 100) / 100).replace(".", ",")}`;
}
function buildForgePanel({ questState, draft, npcLocations, npcTypes, collectables, hasAccess, playerCredits, now, forged, row, expanded, selectedQuestId }) {
  const forge = questState.forge || {};
  const cooldown = Math.max(0, Number(forge.cooldownUntil || 0) - now);
  const delay = forgeDelay(cooldown);
  const delayText = `Prochain contrat possible dans ${delay.h} h ${String(delay.m).padStart(2, "0")} min`;

  if (forged) {
    return `<div class="qtTable qfActive">`
      + `<div class="qtHeadRow" aria-hidden="true"><span></span><span>Contrat en cours</span><span>Objectifs</span><span>Crédits</span><span>Expérience</span><span></span></div>`
      + `<div class="qtRows" id="questTerminalRows" role="list">${row(forged)}</div>`
      + `</div>`
      + `<p class="qfInfo"><span>Un seul contrat fabriqué à la fois.</span> ${cooldown > 0 ? `<span>${delayText}</span>` : ""}</p>`;
  }

  const types = Object.keys(npcLocations || {})
    .filter((type) => type.startsWith("npc_") && forgePreview({ type, amount: 1 }))
    .map((type) => [type, forgePreview({ type, amount: 1 }).reward.credits])
    .sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]))
    .map(([type]) => type);
  const spec = { ...(draft || {}) };
  if (!types.includes(spec.type)) spec.type = types.includes("npc_Streuner") ? "npc_Streuner" : (types[0] || spec.type || "npc_Streuner");
  const maps = (npcLocations?.[spec.type] || []).map(String).filter((map) => map && !/^gate\s/i.test(map));
  if (spec.map && !maps.some((map) => map.toLowerCase() === String(spec.map).toLowerCase())) spec.map = "";
  const preview = forgePreview(spec);
  if (!preview) return `<div class="qtEmpty">Fabricateur indisponible.</div>`;
  const amountClamped = preview.spec.amount;

  const block = getForgeBlock(questState, now);
  const broke = playerCredits < preview.cost;
  const reason = !hasAccess ? "Rapproche-toi du bâtiment de quêtes pour créer un contrat."
    : block === "cooldown" ? delayText
    : block === "full" ? `Carnet plein : termine ou abandonne une mission (${MAX_ACTIVE_QUESTS} maximum).`
    : broke ? "Pas assez de crédits."
    : "";
  const canCreate = !reason;

  const typeOptions = types.length ? types : [spec.type];
  const fieldsHtml = `<div class="qfForm">`
    + `<div class="qfField"><span>Cible</span><select data-forge-field="type" aria-label="Cible">${typeOptions.map((type) => `<option value="${escapeAttr(type)}"${type === spec.type ? " selected" : ""}>${forgeTargetName(type)}</option>`).join("")}</select></div>`
    + `<label class="qfField"><span>Quantité</span><input type="number" min="1" max="${FORGE_MAX_AMOUNT}" step="1" value="${amountClamped}" data-forge-field="amount"></label>`
    + `<div class="qfField"><span>Carte</span><select data-forge-field="map" aria-label="Carte"><option value="">Toutes les cartes</option>${maps.map((map) => `<option value="${escapeAttr(map)}"${String(spec.map).toLowerCase() === map.toLowerCase() ? " selected" : ""}>${map}</option>`).join("")}</select></div>`
    + `<label class="qfField"><span>Mise (crédits)</span><input type="number" min="0" max="${preview.stakeCap}" step="100000" value="${preview.spec.stake}" data-forge-field="stake"><small>Maximum ${formatInteger(preview.stakeCap)} · rendue ${forgeMult(preview.mult)} si réussite, perdue si abandon</small></label>`
    + `<div class="qfField qfWide"><span>Contraintes</span><div class="qfConds">${FORGE_CONDITIONS.map((cond) => {
      const on = preview.spec.conds.includes(cond.id);
      return `<button type="button" class="qfCond${on ? " isOn" : ""}" data-forge-cond="${cond.id}" aria-pressed="${on}"><span>${cond.label}</span><b>${forgeMult(cond.mult)}</b></button>`;
    }).join("")}</div></div>`
    + `<label class="qfField qfWide"><span>Nom du contrat</span><span class="qfName"><input type="text" maxlength="48" value="${escapeAttr(spec.title || "")}" placeholder="${escapeAttr(forgeGeneratedTitle(preview.spec.type, preview.spec.titleIdx))}" data-forge-field="title"><button type="button" class="qfDice" data-forge-reroll="1" title="Autre nom">${SVG_DICE}</button></span></label>`
    + `</div>`;

  const quest = { id: "forge_preview", title: preview.title, objectives: [preview.objective], reward: preview.reward };
  const objective = preview.objective;
  const rewards = rewardRows(quest).map(([label, value]) => `<div class="qtReward"><span>${label}</span><b>${value}</b></div>`).join("");
  const costs = [["Frais de dossier", formatInteger(preview.fee)], ...(preview.spec.stake > 0 ? [["Mise", formatInteger(preview.spec.stake)]] : []), ["Total à payer", formatInteger(preview.cost)]]
    .map(([label, value]) => `<div class="qtReward"><span>${label}</span><b>${value}</b></div>`).join("");
  const previewHtml = `<aside class="qfPreview">`
    + `<h3 class="qfTitle">${preview.title}</h3>`
    + `<div class="qtObjective"><span class="qtObjIcon">${spriteImg(questObjectiveSprite(objective, collectables, npcTypes), questObjectiveImage(objective, collectables, npcTypes), OBJECTIVE_ICON_TARGET)}</span>`
    + `<span class="qtObjBody"><span class="qtObjTop"><span>${apercuObjectiveLabel(objective)}</span></span>`
    + `<small>${objectiveWhere(objective, npcLocations, collectables)}</small>${challengeChips(objective, "qtConds")}</span></div>`
    + `<div class="qtSide"><h3>Récompenses</h3><div class="qtRewards">${rewards}<div class="qtReward"><span>Multiplicateur</span><b>${forgeMult(preview.mult)}</b></div></div></div>`
    + `<div class="qtSide"><h3>Coût</h3><div class="qtRewards">${costs}</div></div>`
    + `<div class="qtSideFoot">${reason ? `<p class="qtNote">${reason}</p>` : `<p class="qtNote">Un contrat à la fois, puis 24 h d'attente.</p>`}`
    + `<button type="button" class="qtAction" data-forge-create="1"${canCreate ? "" : " disabled"}>Créer le contrat</button></div>`
    + `</aside>`;
  return `<div class="qfPanel">${fieldsHtml}${previewHtml}</div>`;
}

export function buildQuestTerminalView({ questState, selectedId, hasAccess, collectables, npcTypes, npcLocations = {}, searchQuery = "", filter = "open", playerSector = null, expanded = true, forgeDraft = null, playerCredits = 0, now = Date.now() }) {
  const tab = QUEST_TERMINAL_TABS.some(([id]) => id === filter) ? filter : "open";
  const query = String(searchQuery || "").trim().toLowerCase();
  const matches = (quest) => !query || String(quest.title || "").toLowerCase().includes(query);
  const statusOf = (quest) => getQuestTerminalStatus(questState, quest.id);
  const isExterm = (quest) => String(quest?.id || "").startsWith("exterm1000_");
  const isFinal = (quest) => Array.isArray(quest?.requiresAll) && quest.requiresAll.length > 1;

  // Tri : par niveau puis titre (progression naturelle). Le niveau tient
  // compte des maps de spawn (un Uber 4-5 vaut niv. 12).
  const levelContext = { npcLocations, collectables };
  const forged = getForgeQuest(questState);
  const ordered = forged ? [...getOrderedQuestDefinitions(), forged] : getOrderedQuestDefinitions();
  const levels = new Map(ordered.map((quest) => [quest.id, getQuestRequiredLevel(quest, playerSector, levelContext)]));
  const sorted = [...ordered].sort((a, b) => levels.get(a.id) - levels.get(b.id) || String(a.title || "").localeCompare(String(b.title || ""), "fr"));
  const counts = { open: 0, active: 0, locked: 0, done: 0, forge: 0 };
  for (const quest of sorted) counts[statusOf(quest)] += 1;
  const visible = sorted.filter((quest) => statusOf(quest) === tab && matches(quest));

  const selectedQuestId = sorted.some((quest) => quest.id === selectedId)
    ? selectedId
    : (visible[0]?.id || null);

  // Style tableau : une ligne par mission (mission, objectifs, crédits,
  // XP) ; la mission sélectionnée se déplie sur place (fiche complète).
  const flat = [...visible.filter((item) => !isExterm(item)), ...visible.filter(isExterm)];
  const activeCount = Object.keys(questState.active).length;
  const full = activeCount >= MAX_ACTIVE_QUESTS;
  const rewardValue = (quest, label) => rewardRows(quest).find(([name]) => name === label)?.[1] || "—";

  const detailOf = (quest) => {
    const status = statusOf(quest);
    const accepted = status === "active";
    const completed = status === "done";
    const progress = questState.active[quest.id] || {};
    const prerequisiteIds = getQuestPrerequisiteIds(quest).filter((id) => id !== quest.id);
    const missing = prerequisiteIds.filter((id) => !questState.completed.includes(id));
    const available = hasAccess && canAcceptQuest(questState, quest);
    const showProgress = accepted || completed;

    const objectivesHtml = getQuestObjectives(quest).map((objective) => {
      const amount = Math.max(1, Number(objective.amount) || 1);
      const current = completed ? amount : Math.min(amount, Number(progress[objective.id] || 0));
      return `<div class="qtObjective${current >= amount && showProgress ? " isDone" : ""}">`
        + `<span class="qtObjIcon">${spriteImg(questObjectiveSprite(objective, collectables, npcTypes), questObjectiveImage(objective, collectables, npcTypes), OBJECTIVE_ICON_TARGET)}</span>`
        + `<span class="qtObjBody"><span class="qtObjTop"><span>${apercuObjectiveLabel(objective)}</span>${showProgress ? `<b>${formatInteger(current)} / ${formatInteger(amount)}</b>` : ""}</span>`
        + (showProgress ? `<span class="qtBar"><i style="width:${Math.round(current / amount * 100)}%"></i></span>` : "")
        + `<small>${objectiveWhere(objective, npcLocations, collectables)}</small>${challengeChips(objective, "qtConds")}</span></div>`;
    }).join("");

    const extraRewards = rewardRows(quest).filter(([label]) => label !== "Crédits" && label !== "Expérience");
    const rewardsHtml = extraRewards.map(([label, value]) => `<div class="qtReward"><span>${label}</span><b>${value}</b></div>`).join("");

    let prerequisitesHtml = "";
    if (isFinal(quest)) {
      const done = prerequisiteIds.length - missing.length;
      prerequisitesHtml = `<div class="qtSide"><h3>Progression requise</h3><div class="qtObjTop"><span>Missions terminées</span><b>${formatInteger(done)} / ${formatInteger(prerequisiteIds.length)}</b></div><span class="qtBar"><i style="width:${Math.round(done / Math.max(1, prerequisiteIds.length) * 100)}%"></i></span></div>`;
    } else if (prerequisiteIds.length) {
      const links = prerequisiteIds.map((id) => {
        const parent = QUEST_DEFINITIONS.find((item) => item.id === id);
        const done = questState.completed.includes(id);
        return `<button type="button" class="qtPrereq${done ? " isDone" : ""}" data-quest-prereq="${escapeAttr(id)}">${done ? SVG_CHECK : SVG_LOCK}<span>${parent?.title || id}</span></button>`;
      }).join("");
      prerequisitesHtml = `<div class="qtSide"><h3>${prerequisiteIds.length > 1 ? "Missions requises" : "Mission requise"}</h3><div class="qtPrereqs">${links}</div></div>`;
    }

    const note = completed ? "Récompense déjà récupérée."
      : accepted ? "Suis ta progression dans le journal de missions."
      : !hasAccess ? "Rapproche-toi du bâtiment de quêtes pour l'accepter."
      : missing.length ? (isFinal(quest) ? `Termine les ${prerequisiteIds.length} missions précédentes pour la débloquer.` : "Termine d'abord la mission requise.")
      : full ? `Carnet plein : termine ou abandonne une mission (${MAX_ACTIVE_QUESTS} maximum).`
      : "";
    const button = completed
      ? `<button type="button" class="qtAction isDone" disabled>Mission terminée</button>`
      : accepted
        ? `<button type="button" class="qtAction isClose" data-quest-terminal-close="1">Fermer</button>`
        : `<button type="button" class="qtAction" data-quest-terminal-accept="${escapeAttr(quest.id)}"${available ? "" : " disabled"}>Accepter la mission</button>`;

    return `<div class="qtExpand">`
      + `<div class="qtExpandMain">${quest.description ? `<p class="qtDesc">${quest.description}</p>` : ""}<div class="qtObjectives">${objectivesHtml}</div></div>`
      + `<div class="qtExpandSide">`
      + (rewardsHtml ? `<div class="qtSide"><h3>Autres récompenses</h3><div class="qtRewards">${rewardsHtml}</div></div>` : "")
      + prerequisitesHtml
      + `<div class="qtSideFoot">${note ? `<p class="qtNote">${note}</p>` : ""}${button}</div>`
      + `</div></div>`;
  };

  const row = (quest) => {
    const status = statusOf(quest);
    const objectives = getQuestObjectives(quest);
    const objText = status === "active"
      ? `En cours · ${Math.floor(questProgressRatio(quest, questState.active[quest.id]) * 100)} %`
      : objectives.length === 1
        ? `<span>${apercuObjectiveLabel(objectives[0])}</span>`
        : `${objectives.length} objectifs`;
    const mark = status === "done" ? SVG_CHECK : status === "locked" ? SVG_LOCK : "";
    const open = expanded && quest.id === selectedQuestId;
    const cls = `qtRow is-${status}${open ? " isOpen" : ""}${isFinal(quest) ? " isFinal" : ""}`;
    return `<div class="${cls}" role="listitem">`
      + `<button type="button" class="qtRowHead" data-quest-offer="${escapeAttr(quest.id)}" aria-expanded="${open}" title="${escapeAttr(quest.title)}">`
      + `<span class="qtThumb">${spriteImg(getQuestTargetSprite(quest, collectables, npcTypes), getQuestTargetImage(quest, collectables, npcTypes), LIST_THUMB_TARGET)}</span>`
      + `<span class="qtRowTitle">${quest.title}</span>`
      + `<span class="qtRowObj">${objText}</span>`
      + `<b class="qtRowCredits">${rewardValue(quest, "Crédits")}</b>`
      + `<span class="qtRowXp">${rewardValue(quest, "Expérience")}</span>`
      + `<i class="qtRowMark" aria-hidden="true">${mark}</i></button>`
      + (open ? detailOf(quest) : "")
      + `</div>`;
  };

  const emptyText = query ? "Aucune mission ne correspond à ta recherche."
    : { open: "Aucune mission disponible.", active: "Aucune mission en cours.", locked: "Aucune mission verrouillée.", done: "Aucune mission terminée." }[tab];
  const rowsHtml = flat.length ? flat.map(row).join("") : `<div class="qtEmpty">${emptyText}</div>`;
  const isForge = tab === "forge";
  const tableHtml = isForge
    ? buildForgePanel({ questState, draft: forgeDraft, npcLocations, npcTypes, collectables, hasAccess, playerCredits, now, forged, row, expanded, selectedQuestId })
    : `<div class="qtTable">`
      + `<div class="qtHeadRow" aria-hidden="true"><span></span><span>Mission</span><span>Objectifs</span><span>Crédits</span><span>Expérience</span><span></span></div>`
      + `<div class="qtRows" id="questTerminalRows" role="list">${rowsHtml}</div>`
      + `</div>`;

  const listHtml = `<div class="qtToolbar">`
    + `<div class="qtTabs" role="tablist" aria-label="Statut des missions">${QUEST_TERMINAL_TABS.map(([id, label]) =>
      `<button type="button" class="qtTab is-${id}${id === tab ? " isActive" : ""}" data-quest-filter="${id}" role="tab" aria-selected="${id === tab}"><span>${label}</span>${id === "forge" ? "" : ` · <b>${counts[id]}</b>`}</button>`).join("")}</div>`
    + (isForge ? `<span class="qtSearch qfSpacer"></span>` : `<label class="qtSearch">${SVG_SEARCH}<input type="search" placeholder="Rechercher une mission…" value="${escapeAttr(searchQuery)}" data-quest-search aria-label="Rechercher une mission"></label>`)
    + `<span class="qtSlots"><span>Actives</span> <b>${activeCount} / ${MAX_ACTIVE_QUESTS}</b></span>`
    + `</div>`
    + tableHtml;
  return { selectedQuestId, listHtml, detailHtml: "" };
}
