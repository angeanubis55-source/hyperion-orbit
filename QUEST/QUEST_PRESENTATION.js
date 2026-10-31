"use strict";

import {
  MAX_ACTIVE_QUESTS,
  QUEST_DEFINITIONS,
  canAcceptQuest,
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
const LIST_THUMB_TARGET = 34;
const DETAIL_PORTRAIT_TARGET = 84;
const DETAIL_ICON_TARGET = 64;
const OBJECTIVE_ICON_TARGET = 40;
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
  if (/\d/.test(base)) return base;
  const amount = Math.max(1, Math.floor(Number(objective?.amount) || 1));
  const pattern = /\b(des|du|de la|de l'|de|le|la|les|l'|un|une)\b/i;
  if (!pattern.test(base)) return base;
  return base.replace(pattern, `${amount}`);
}

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

export function buildQuestCard(quest, questState, context = {}) {
  const { collectables = {}, npcTypes = {} } = context;
  const objectives = getQuestObjectives(quest);
  const progress = questState.active[quest.id] || {};
  const rowsHtml = objectives.map(objective => {
    const current = Number(progress[objective.id] || 0);
    const done = current >= objective.amount;
    const iconSize = normalizedSpriteSize(questObjectiveSprite(objective, collectables, npcTypes), DETAIL_ICON_TARGET);
    return `<div class="qoffObjective"><span class="qoffCheck"><input type="checkbox" tabindex="-1" aria-hidden="true"${done ? " checked" : ""} disabled></span><span class="qoffObjectiveLabel">${apercuObjectiveLabel(objective)}</span><b>${current}/${objective.amount}</b><img src="${questObjectiveImage(objective, collectables, npcTypes)}" width="${iconSize.w}" height="${iconSize.h}" style="width:${iconSize.w}px;height:${iconSize.h}px" alt="" loading="lazy" draggable="false" onerror="this.style.visibility='hidden'"></div>`;
  }).join("");
  const actions = `<button class="questAction questCancel" data-quest-action="abandon" data-quest-id="${quest.id}">Abandonner la mission</button>`;

  return `<article class="questCard">
    <h2 class="qoffTitle">${quest.title}</h2>
    <h4 class="qoffSection">Aperçu</h4>
    <div class="qoffBox">${rowsHtml}</div>
    <h4 class="qoffSection">Récompense</h4>
    <div class="qoffBox">${rewardRows(quest).map(([label, value]) => `<div class="qoffReward"><span>${label}</span><b>${value}</b></div>`).join("")}</div>
    <div class="qoffActions">${actions}</div>
  </article>`;
}

export function buildQuestJournalView(questState, selectedId, context = {}) {
  const activeIds = Object.keys(questState.active);
  const selectedQuestId = activeIds.includes(selectedId) ? selectedId : (activeIds[0] || null);
  const selected = QUEST_DEFINITIONS.find(quest => quest.id === selectedQuestId);
  return {
    selectedQuestId,
    intro: "",
    tabsHtml: activeIds.map((id, index) => {
      const quest = QUEST_DEFINITIONS.find(item => item.id === id);
      return quest ? `<button class="questTab${id === selectedQuestId ? " active" : ""}" data-quest-tab="${id}" title="${quest.title}">${index + 1}</button>` : "";
    }).join(""),
    contentHtml: selected
      ? buildQuestCard(selected, questState, context)
      : `<div class="questEmpty">Aucune mission active pour le moment</div>`,
  };
}

// Terminal de quêtes : liste à gauche (onglets par statut, groupée par
// niveau), fiche de la mission sélectionnée à droite.
const QUEST_TERMINAL_TABS = [
  ["open", "Disponibles", "Dispo."],
  ["active", "En cours", "En cours"],
  ["locked", "Verrouillées", "Verrou."],
  ["done", "Terminées", "Finies"],
];
const QUEST_STATUS_LABELS = { open: "Disponible", active: "En cours", locked: "Verrouillée", done: "Terminée" };

// Onglet du terminal où se trouve une mission (done / active / locked / open).
export function getQuestTerminalStatus(questState, questId) {
  if (questState.completed.includes(questId)) return "done";
  if (questState.active[questId] != null) return "active";
  const quest = QUEST_DEFINITIONS.find((item) => item.id === questId);
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

export function buildQuestTerminalView({ questState, selectedId, hasAccess, collectables, npcTypes, npcLocations = {}, searchQuery = "", filter = "open", playerSector = null }) {
  const tab = QUEST_TERMINAL_TABS.some(([id]) => id === filter) ? filter : "open";
  const query = String(searchQuery || "").trim().toLowerCase();
  const matches = (quest) => !query || String(quest.title || "").toLowerCase().includes(query);
  const statusOf = (quest) => getQuestTerminalStatus(questState, quest.id);
  const isExterm = (quest) => String(quest?.id || "").startsWith("exterm1000_");
  const isFinal = (quest) => Array.isArray(quest?.requiresAll) && quest.requiresAll.length > 1;

  // Tri : par niveau puis titre (progression naturelle). Le niveau tient
  // compte des maps de spawn (un Uber 4-5 vaut niv. 12).
  const levelContext = { npcLocations, collectables };
  const ordered = getOrderedQuestDefinitions();
  const levels = new Map(ordered.map((quest) => [quest.id, getQuestRequiredLevel(quest, playerSector, levelContext)]));
  const sorted = [...ordered].sort((a, b) => levels.get(a.id) - levels.get(b.id) || String(a.title || "").localeCompare(String(b.title || ""), "fr"));
  const counts = { open: 0, active: 0, locked: 0, done: 0 };
  for (const quest of sorted) counts[statusOf(quest)] += 1;
  const visible = sorted.filter((quest) => statusOf(quest) === tab && matches(quest));

  const selectedQuestId = sorted.some((quest) => quest.id === selectedId)
    ? selectedId
    : (visible[0]?.id || null);

  // Liste : groupes "Niveau N", contrats d'extermination à la fin.
  const row = (quest) => {
    const status = statusOf(quest);
    const objectives = getQuestObjectives(quest);
    const sub = status === "active"
      ? `En cours · ${Math.floor(questProgressRatio(quest, questState.active[quest.id]) * 100)} %`
      : status === "done"
        ? "Terminée"
        : `${apercuObjectiveLabel(objectives[0] || {})}${objectives.length > 1 ? ` +${objectives.length - 1}` : ""}`;
    const mark = status === "done" ? SVG_CHECK : status === "locked" ? SVG_LOCK : "";
    const cls = `qtRow is-${status}${quest.id === selectedQuestId ? " isSelected" : ""}${isFinal(quest) ? " isFinal" : ""}`;
    return `<button type="button" class="${cls}" data-quest-offer="${escapeAttr(quest.id)}" role="listitem" title="${escapeAttr(quest.title)}">`
      + `<span class="qtThumb">${spriteImg(getQuestTargetSprite(quest, collectables, npcTypes), getQuestTargetImage(quest, collectables, npcTypes), LIST_THUMB_TARGET)}</span>`
      + `<span class="qtRowText"><b>${quest.title}</b><small>${sub}</small></span>`
      + `<i class="qtRowMark" aria-hidden="true">${mark}</i></button>`;
  };
  const groups = [];
  for (const quest of visible.filter((item) => !isExterm(item))) {
    const label = `Niveau ${levels.get(quest.id)}`;
    if (groups.at(-1)?.label !== label) groups.push({ label, quests: [] });
    groups.at(-1).quests.push(quest);
  }
  const contracts = visible.filter(isExterm);
  if (contracts.length) groups.push({ label: "Contrats d'extermination", quests: contracts });
  const emptyText = query ? "Aucune mission ne correspond à ta recherche."
    : { open: "Aucune mission disponible.", active: "Aucune mission en cours.", locked: "Aucune mission verrouillée.", done: "Aucune mission terminée." }[tab];
  const rowsHtml = groups.length
    ? groups.map(({ label, quests }) => `<div class="qtGroup"><h4 class="qtGroupTitle"><span>${label}</span><small>${quests.length}</small></h4>${quests.map(row).join("")}</div>`).join("")
    : `<div class="qtEmpty">${emptyText}</div>`;

  const activeCount = Object.keys(questState.active).length;
  const listHtml = `<label class="qtSearch">${SVG_SEARCH}<input type="search" placeholder="Rechercher une mission…" value="${escapeAttr(searchQuery)}" data-quest-search aria-label="Rechercher une mission"></label>`
    + `<div class="qtTabs" role="tablist" aria-label="Statut des missions">${QUEST_TERMINAL_TABS.map(([id, label, short]) =>
      `<button type="button" class="qtTab is-${id}${id === tab ? " isActive" : ""}" data-quest-filter="${id}" role="tab" aria-selected="${id === tab}" title="${label}"><span class="qtTabLong">${label}</span><span class="qtTabShort">${short}</span><b>${counts[id]}</b></button>`).join("")}</div>`
    + `<div class="qtRows" id="questTerminalRows" role="list">${rowsHtml}</div>`
    + `<div class="qtSlots"><span>Missions actives</span><span class="qtSlotsBar"><i style="width:${Math.round(Math.min(1, activeCount / MAX_ACTIVE_QUESTS) * 100)}%"></i></span><b>${activeCount} / ${MAX_ACTIVE_QUESTS}</b></div>`;

  const quest = QUEST_DEFINITIONS.find((item) => item.id === selectedQuestId);
  if (!quest) return { selectedQuestId, listHtml, detailHtml: `<div class="qtEmpty qtDetailEmpty">Sélectionne une mission dans la liste.</div>` };

  const status = statusOf(quest);
  const accepted = status === "active";
  const completed = status === "done";
  const progress = questState.active[quest.id] || {};
  const prerequisiteIds = getQuestPrerequisiteIds(quest).filter((id) => id !== quest.id);
  const missing = prerequisiteIds.filter((id) => !questState.completed.includes(id));
  const full = activeCount >= MAX_ACTIVE_QUESTS;
  const available = hasAccess && canAcceptQuest(questState, quest);

  const objectivesHtml = getQuestObjectives(quest).map((objective) => {
    const amount = Math.max(1, Number(objective.amount) || 1);
    const current = completed ? amount : Math.min(amount, Number(progress[objective.id] || 0));
    const showProgress = accepted || completed;
    return `<div class="qtObjective${current >= amount && showProgress ? " isDone" : ""}">`
      + `<span class="qtObjIcon">${spriteImg(questObjectiveSprite(objective, collectables, npcTypes), questObjectiveImage(objective, collectables, npcTypes), OBJECTIVE_ICON_TARGET)}</span>`
      + `<span class="qtObjBody"><span class="qtObjTop"><span>${apercuObjectiveLabel(objective)}</span>${showProgress ? `<b>${formatInteger(current)} / ${formatInteger(amount)}</b>` : ""}</span>`
      + (showProgress ? `<span class="qtBar"><i style="width:${Math.round(current / amount * 100)}%"></i></span>` : "")
      + `<small>${objectiveWhere(objective, npcLocations, collectables)}</small></span></div>`;
  }).join("");

  const rewardsHtml = rewardRows(quest).map(([label, value]) => `<div class="qtReward"><span>${label}</span><b>${value}</b></div>`).join("");

  let prerequisitesHtml = "";
  if (isFinal(quest)) {
    const done = prerequisiteIds.length - missing.length;
    prerequisitesHtml = `<section class="qtSection"><h3>Progression requise</h3><div class="qtObjTop"><span>Missions terminées</span><b>${formatInteger(done)} / ${formatInteger(prerequisiteIds.length)}</b></div><span class="qtBar"><i style="width:${Math.round(done / Math.max(1, prerequisiteIds.length) * 100)}%"></i></span></section>`;
  } else if (prerequisiteIds.length) {
    const links = prerequisiteIds.map((id) => {
      const parent = QUEST_DEFINITIONS.find((item) => item.id === id);
      const done = questState.completed.includes(id);
      return `<button type="button" class="qtPrereq${done ? " isDone" : ""}" data-quest-offer="${escapeAttr(id)}">${done ? SVG_CHECK : SVG_LOCK}<span>${parent?.title || id}</span></button>`;
    }).join("");
    prerequisitesHtml = `<section class="qtSection"><h3>${prerequisiteIds.length > 1 ? "Missions requises" : "Mission requise"}</h3><div class="qtPrereqs">${links}</div></section>`;
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

  const tags = [
    `<span class="qtPill is-${status}">${QUEST_STATUS_LABELS[status]}</span>`,
    `<span class="qtLevel">Niveau ${levels.get(quest.id)}</span>`,
    isExterm(quest) ? `<span class="qtLevel">Contrat</span>` : "",
    isFinal(quest) ? `<span class="qtLevel">Mission finale</span>` : "",
  ].join("");
  const detailHtml = `<div class="qtDetail is-${status}">`
    + `<div class="qtDetailScroll">`
    + `<header class="qtHead"><span class="qtPortrait">${spriteImg(getQuestTargetSprite(quest, collectables, npcTypes), getQuestTargetImage(quest, collectables, npcTypes), DETAIL_PORTRAIT_TARGET)}</span>`
    + `<div class="qtHeadText"><div class="qtTags">${tags}</div><h2 class="qtTitle">${quest.title}</h2>${quest.description ? `<p class="qtDesc">${quest.description}</p>` : ""}</div></header>`
    + `<section class="qtSection"><h3>Objectifs</h3><div class="qtObjectives">${objectivesHtml}</div></section>`
    + (rewardsHtml ? `<section class="qtSection"><h3>Récompenses</h3><div class="qtRewards">${rewardsHtml}</div></section>` : "")
    + prerequisitesHtml
    + `</div>`
    + `<footer class="qtFoot">${note ? `<p class="qtNote">${note}</p>` : ""}${button}</footer>`
    + `</div>`;
  return { selectedQuestId, listHtml, detailHtml };
}
