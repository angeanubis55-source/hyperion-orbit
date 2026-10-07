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
const SVG_BANG = svgIcon(`<path d="M8 2.5v6.5"/><circle cx="8" cy="12.3" r="1.1" fill="currentColor" stroke="none"/>`);
const SVG_LOCK = svgIcon(`<rect x="3.5" y="7" width="9" height="6.5" rx="1.2"/><path d="M5.5 7V5.2a2.5 2.5 0 0 1 5 0V7"/>`);
const SVG_CHECK = svgIcon(`<path d="M3 8.5l3.2 3.2L13 4.8"/>`);
const SVG_ALL = svgIcon(`<path d="M8 2.5l5.5 3L8 8.5 2.5 5.5z"/><path d="M2.5 8.7L8 11.7l5.5-3"/><path d="M2.5 11.7L8 14.7l5.5-3"/>`);
const SVG_MINUS = svgIcon(`<path d="M3 8h10"/>`, 14);
const SVG_PLUS = svgIcon(`<path d="M8 3v10M3 8h10"/>`, 14);

// Normalisation : plus le sprite est gros, plus on divise (jamais d'agrandissement),
// pour que toutes les images fassent à peu près la même taille cible.
const TREE_THUMB_TARGET = 40;
const DETAIL_PORTRAIT_TARGET = 100;
const DETAIL_ICON_TARGET = 64;
export function normalizedSpriteSize(source, target) {
  const dims = trimmedDims(source);
  if (!dims) return { w: target, h: target };
  const k = Math.min(1, target / Math.max(dims.w, dims.h));
  return { w: Math.max(12, Math.round(dims.w * k)), h: Math.max(12, Math.round(dims.h * k)) };
}
function treeThumbSize(source) {
  return normalizedSpriteSize(source, TREE_THUMB_TARGET);
}

const QUEST_AMMO_LABELS = { x1: "LCB-10", x2: "MCB-25", x3: "MCB-50", x4: "UCB-100", x6: "RSB-75", sab: "SAB-50", rcb: "RCB-140", cbo: "CBO-100", job: "JOB-100", rb: "RB-214", pib: "PIB-100", idb: "IDB-125", vb: "VB-142", emaa: "EMAA-20", sbl: "SBL-100", abl: "A-BL" };
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

function rewardCard(quest) {
  return `<section class="questInfoCard questRewardCard"><h4>Récompenses</h4><div class="questInfoRows">${rewardRows(quest).map(([label, value]) => `<div><span>${label}</span><b>${value}</b></div>`).join("")}</div></section>`;
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

function gateAdvice(type) {
  const name = formatQuestEntityName(type);
  const tactical = type === "gamma"
    ? "Prévois ta configuration la plus résistante : les vagues Gamma sont les plus longues et les plus solides."
    : type === "beta"
      ? "Utilise une configuration dégâts et une configuration bouclier : Beta demande davantage d’endurance qu’Alpha."
      : "Commence avec Alpha, conserve une configuration de fuite et répare-toi complètement entre les vagues.";
  return `Construis ${name} dans le Galaxy Spinner depuis ta base mère, puis utilise « Préparer le portail ». ${tactical} Entre deux vagues, utilise le portail de retour si tes munitions ou ton équipement ne suffisent plus.`;
}

function collectableAdvice(objective, collectables) {
  const definition = collectables?.[objective.type];
  if (objective.map) return `Collecte cette ressource sur la carte ${objective.map} : seules les collectes effectuées sur cette carte comptent.`;
  if (definition?.maps === "*") {
    if (objective.type === "Cargo_Box") return "Détruis des NPC sur les cartes normales puis récupère les Cargo Boxes qu’ils abandonnent.";
    return "Disponible sur toutes les cartes normales. Parcours les zones peu fréquentées pour en trouver plus rapidement.";
  }
  const maps = Array.isArray(definition?.maps) ? definition.maps : definition?.maps ? [definition.maps] : [];
  return maps.length ? `Disponible sur ${maps.join(", ")}.` : "Cette ressource est obtenue comme butin spécial après la destruction des NPC associés.";
}

function objectiveHelp(objective, npcLocations, collectables) {
  if (objective.kind === "visit") return `Destination : carte ${objective.type}. Suis les portails indiqués sur la mini-carte et évite le combat pour valider la visite rapidement.`;
  if (objective.kind === "gate") return gateAdvice(objective.type);
  if (objective.kind === "collect") return collectableAdvice(objective, collectables);
  if (objective.kind === "kill" && objective.type === "*") return objective.map ? `Élimine n’importe quel NPC sur la carte ${objective.map}. Les destructions réalisées ailleurs ne comptent pas.` : "Tous les NPC détruits comptent, quelle que soit leur espèce ou leur carte.";
  if (objective.map) return `Cible présente sur la carte ${objective.map}. Seules les destructions réalisées sur cette carte comptent.`;
  const maps = npcLocations?.[objective.type] || [];
  return maps.length
    ? `Cartes disponibles : ${maps.join(", ")}. Choisis la carte la plus proche de ta firme et reste près d’un portail pour pouvoir te replier.`
    : "Cette cible apparaît par invocation ou après la destruction d’un NPC parent ; élimine ses unités associées pour la faire apparaître.";
}

// Sprites thématiques (w/h = taille réelle) : visites → portail standard
// (portail pirate sur les maps 5-x), gates → portail de la gate.
const GATE_PORTAL_SPRITES = {
  alpha: { src: "ASSETS/ALPHA_PORTAL/ACTIVE.png", w: 500, h: 500 },
  beta: { src: "ASSETS/BETA_PORTAL/ACTIVE.png", w: 437, h: 456 },
  gamma: { src: "ASSETS/GAMMA_PORTAL/ACTIVE.png", w: 360, h: 421 },
  delta: { src: "ASSETS/DELTA_PORTAL/ACTIVE.png", w: 400, h: 560 },
  epsilon: { src: "ASSETS/EPSILON_PORTAL/ACTIVE.png", w: 406, h: 474 },
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

export function buildQuestTerminalView({ questState, selectedId, hasAccess, collectables, npcTypes, npcLocations = {}, searchQuery = "", filter = "open", playerSector = null }) {
  const orderedQuests = getOrderedQuestDefinitions();
  const query = String(searchQuery || "").trim().toLowerCase();
  const matches = (quest) => !query || String(quest.title || "").toLowerCase().includes(query);
  const isLocked = (quest) => getQuestPrerequisiteIds(quest).some((id) => !questState.completed.includes(id));
  const isAccepted = (quest) => questState.active[quest.id] != null;
  const isCompleted = (quest) => questState.completed.includes(quest.id);
  const isOpen = (quest) => !isLocked(quest) && !isAccepted(quest) && !isCompleted(quest);
  // Tri officiel : par niveau puis récompense (progression naturelle).
  // Le niveau tient compte des maps de spawn (un Uber 4-5 vaut niv. 12).
  const levelContext = { npcLocations, collectables };
  const byLevel = [...orderedQuests].sort((a, b) =>
    getQuestRequiredLevel(a, playerSector, levelContext) - getQuestRequiredLevel(b, playerSector, levelContext)
    || a.title.localeCompare(b.title, "fr"));
  const counts = {
    open: byLevel.filter((quest) => isOpen(quest) || isAccepted(quest)).length,
    locked: byLevel.filter((quest) => isLocked(quest) && !isCompleted(quest)).length,
    done: byLevel.filter(isCompleted).length,
    all: byLevel.length,
  };
  const visible = byLevel.filter((quest) => {
    if (!matches(quest)) return false;
    if (filter === "open") return isOpen(quest) || isAccepted(quest);
    if (filter === "locked") return isLocked(quest) && !isCompleted(quest);
    if (filter === "done") return isCompleted(quest);
    return true;
  });
  const selectedQuestId = byLevel.some((quest) => quest.id === selectedId)
    ? selectedId
    : (visible[0]?.id || byLevel[0]?.id || null);
  const quest = QUEST_DEFINITIONS.find(item => item.id === selectedQuestId);
  const isExtermQuest = (item) => String(item?.id || "").startsWith("exterm1000_");
  const mainQuests = byLevel.filter((quest) => !isExtermQuest(quest));
  const extermQuests = byLevel.filter(isExtermQuest).sort((a, b) => String(a.title || "").localeCompare(String(b.title || ""), "fr"));
  const questButton = (item) => {
    const lv = getQuestRequiredLevel(item, playerSector, levelContext);
    const isExterm = isExtermQuest(item);
    const parents = isExterm ? [] : getQuestPrerequisiteIds(item).filter(id => id !== item.id);
    // La quête finale "requiresAll" a ~300 parents : on ne dessine pas ses
    // arêtes pour ne pas noyer l'arbre, on l'affiche comme nœud final.
    const isFinal = Array.isArray(item.requiresAll) && item.requiresAll.length > 1;
    const edgeParents = isFinal ? [] : parents;
    let cls = "questTreeNode";
    if (item.id === selectedQuestId) cls += " active";
    if (isAccepted(item)) cls += " accepted";
    if (isCompleted(item)) cls += " completed";
    if (isLocked(item)) cls += " locked";
    if (isFinal) cls += " isFinal";
    if (isExterm) cls += " isExterm";
    const inFilter = filter === "open" ? (isOpen(item) || isAccepted(item))
      : filter === "locked" ? (isLocked(item) && !isCompleted(item))
      : filter === "done" ? isCompleted(item)
      : true;
    // Terminée : toujours verte et visible (pas grisée par les filtres).
    // Seule la recherche peut encore l'estomper.
    if (!matches(item) || (!inFilter && !isCompleted(item))) cls += " dimmed";
    const sub = isAccepted(item) ? "Active" : isCompleted(item) ? "Terminée" : isLocked(item) ? "Verrouillée" : `Niv. ${lv}`;
    const icon = getQuestTargetImage(item, collectables, npcTypes);
    const thumb = treeThumbSize(getQuestTargetSprite(item, collectables, npcTypes));
    // Même checkbox que les paramètres (affichage seul, non cliquable).
    const nodeCheck = `<input type="checkbox" class="questTreeCheck" tabindex="-1" aria-hidden="true"${isCompleted(item) ? " checked" : ""} disabled>`;
    return `<button class="${cls}" data-quest-offer="${item.id}" data-quest-parents="${edgeParents.join(",")}" title="${String(item.title || "").replace(/"/g, "&quot;")} — ${sub}"><span class="questTreeThumb"><img src="${icon}" width="${thumb.w}" height="${thumb.h}" style="width:${thumb.w}px;height:${thumb.h}px" alt="" loading="lazy" draggable="false" onerror="this.style.visibility='hidden'"></span><span><b>${item.title}</b><small>${sub}</small></span><i class="questTreeDot">${nodeCheck}</i></button>`;
  };
  // Profondeur = plus longue chaîne de prérequis (gauche -> droite).
  // Les contrats d'extermination sont hors arbre : rangée du bas.
  const byId = new Map(mainQuests.map(quest => [quest.id, quest]));
  const depthMemo = new Map();
  const questDepth = (id, visiting = new Set()) => {
    if (depthMemo.has(id)) return depthMemo.get(id);
    const quest = byId.get(id);
    if (!quest) return 0;
    const parents = getQuestPrerequisiteIds(quest).filter(parentId => parentId !== id && byId.has(parentId));
    // Finale "tout requérir" : toujours tout à droite.
    if (Array.isArray(quest.requiresAll) && quest.requiresAll.length > 1) {
      let deepest = 0;
      for (const parentId of parents) {
        if (visiting.has(parentId)) continue;
        visiting.add(id);
        deepest = Math.max(deepest, questDepth(parentId, visiting));
        visiting.delete(id);
      }
      const depth = deepest + 1;
      depthMemo.set(id, depth);
      return depth;
    }
    if (!parents.length) {
      depthMemo.set(id, 0);
      return 0;
    }
    let deepest = 0;
    visiting.add(id);
    for (const parentId of parents) {
      if (visiting.has(parentId)) continue;
      deepest = Math.max(deepest, questDepth(parentId, visiting));
    }
    visiting.delete(id);
    const depth = deepest + 1;
    depthMemo.set(id, depth);
    return depth;
  };
  const columns = new Map();
  let maxDepth = 0;
  for (const quest of mainQuests) {
    const depth = questDepth(quest.id);
    maxDepth = Math.max(maxDepth, depth);
    if (!columns.has(depth)) columns.set(depth, []);
    columns.get(depth).push(quest);
  }
  for (const quests of columns.values()) quests.sort((a, b) => String(a.title || "").localeCompare(String(b.title || ""), "fr"));
  // Réduction des croisements (Sugiyama simplifié) : on trie chaque colonne
  // pour mettre chaque nœud en face de ses parents puis de ses enfants.
  // Sans ça, un enfant peut se retrouver tout en bas alors que son parent
  // est tout en haut, et les fils se croisent partout.
  const childrenOf = new Map();
  for (const quest of mainQuests) {
    for (const parentId of getQuestPrerequisiteIds(quest).filter(id => id !== quest.id && byId.has(id))) {
      if (!childrenOf.has(parentId)) childrenOf.set(parentId, []);
      childrenOf.get(parentId).push(quest.id);
    }
  }
  const titleCompare = (a, b) => String(a.title || "").localeCompare(String(b.title || ""), "fr");
  const refreshPositions = (pos) => {
    pos.clear();
    for (const quests of columns.values()) quests.forEach((q, i) => pos.set(q.id, i));
  };
  {
    const pos = new Map();
    refreshPositions(pos);
    for (let pass = 0; pass < 6; pass++) {
      // Aller : chaque nœud se rapproche de ses parents (colonne précédente).
      for (let depth = 1; depth <= maxDepth; depth++) {
        const quests = columns.get(depth);
        const prev = columns.get(depth - 1);
        if (!quests?.length || !prev?.length) continue;
        const prevPos = new Map(prev.map((q, i) => [q.id, i]));
        const score = new Map(quests.map(q => {
          const parents = getQuestPrerequisiteIds(q).filter(id => prevPos.has(id));
          const avg = parents.length
            ? parents.reduce((s, id) => s + prevPos.get(id), 0) / parents.length
            : pos.get(q.id);
          return [q.id, avg];
        }));
        quests.sort((a, b) => (score.get(a.id) - score.get(b.id)) || titleCompare(a, b));
      }
      refreshPositions(pos);
      // Retour : chaque nœud se rapproche de ses enfants (colonne suivante).
      for (let depth = maxDepth - 1; depth >= 0; depth--) {
        const quests = columns.get(depth);
        const next = columns.get(depth + 1);
        if (!quests?.length || !next?.length) continue;
        const nextPos = new Map(next.map((q, i) => [q.id, i]));
        const score = new Map(quests.map(q => {
          const children = (childrenOf.get(q.id) || []).filter(id => nextPos.has(id));
          const avg = children.length
            ? children.reduce((s, id) => s + nextPos.get(id), 0) / children.length
            : pos.get(q.id);
          return [q.id, avg];
        }));
        quests.sort((a, b) => (score.get(a.id) - score.get(b.id)) || titleCompare(a, b));
      }
      refreshPositions(pos);
    }
  }
  const treeColsHtml = Array.from({ length: maxDepth + 1 }, (_, depth) => {
    const quests = columns.get(depth) || [];
    if (!quests.length) return "";
    return `<div class="questTreeCol" data-depth="${depth}"><div class="questTreeNodes">${quests.map(questButton).join("")}</div></div>`;
  }).join("");
  const extermHtml = extermQuests.length
    ? `<div class="questTreeExterm"><div class="questTreeExtermTitle">— Contrats d'extermination <small>${extermQuests.length} · hors chaîne, sans prérequis</small></div><div class="questTreeExtermGrid">${extermQuests.map(questButton).join("")}</div></div>`
    : "";
  const freeSlots = Math.max(0, MAX_ACTIVE_QUESTS - Object.keys(questState.active).length);
  const searchHtml = `<div class="questTreeToolbar"><div class="questSearchRow"><input class="questSearchInput" type="search" placeholder="Rechercher une mission…" value="${searchQuery.replace(/"/g, "&quot;")}" data-quest-search aria-label="Rechercher une mission"></div>`
    + `<div class="questToggles" role="tablist" aria-label="Filtres">`
    + `<button class="questToggleBtn${filter === "open" ? " active" : ""}" data-quest-filter="open" role="tab" title="Disponibles (${counts.open})">${SVG_BANG}</button>`
    + `<button class="questToggleBtn${filter === "locked" ? " active" : ""}" data-quest-filter="locked" role="tab" title="Verrouillées (${counts.locked})">${SVG_LOCK}</button>`
    + `<button class="questToggleBtn${filter === "done" ? " active" : ""}" data-quest-filter="done" role="tab" title="Terminées (${counts.done})">${SVG_CHECK}</button>`
    + `<button class="questToggleBtn${filter === "all" ? " active" : ""}" data-quest-filter="all" role="tab" title="Toutes (${counts.all})">${SVG_ALL}</button>`
    + `<span class="questTreeSlots">Encore ${freeSlots} emplacement${freeSlots > 1 ? "s" : ""} de mission</span>`
    + `<span class="questTreeZoom"><button type="button" data-quest-zoom="out" title="Zoom -">${SVG_MINUS}</button><button type="button" data-quest-zoom="reset" title="Zoom 100%">100%</button><button type="button" data-quest-zoom="in" title="Zoom +">${SVG_PLUS}</button></span>`
    + `</div>`
    + `</div><div class="questTreeScroll" id="questTreeScroll"><div class="questTreeCanvas" id="questTreeCanvas"><svg class="questTreeEdges" id="questTreeEdges" aria-hidden="true"></svg><div class="questTreeMain">${treeColsHtml || `<div class="questEmpty">Aucune mission ici.</div>`}</div>${extermHtml}</div></div>`;
  let listHtml = searchHtml;
  if (!quest) return { selectedQuestId, listHtml, detailHtml: `<div class="questEmpty">Toutes les missions sont actives ou terminées.</div>` };

  const available = hasAccess && canAcceptQuest(questState, quest);
  const accepted = questState.active[quest.id] != null;
  const completed = questState.completed.includes(quest.id);
  const objectives = getQuestObjectives(quest);
  const prerequisite = QUEST_DEFINITIONS.find(item => item.id === quest.requires);
  const prerequisiteIds = getQuestPrerequisiteIds(quest);
  const missingPrerequisites = prerequisiteIds.filter(id => !questState.completed.includes(id));
  const full = Object.keys(questState.active).length >= MAX_ACTIVE_QUESTS;
  const pill = completed ? ["done", "Terminée ✓"]
    : accepted ? ["active", "En cours"]
    : !hasAccess ? ["far", "Terminal éloigné"]
    : full ? ["full", "Carnet plein"]
    : missingPrerequisites.length ? ["locked", "Verrouillée"]
    : ["open", "Disponible"];
  const status = completed ? "Mission terminée. Récompense déjà récupérée."
    : !hasAccess ? "Rapproche-toi du bâtiment de quêtes."
    : full ? ""
    : missingPrerequisites.length ? (quest.requiresAll ? `Prérequis : termine les ${prerequisiteIds.length} missions précédentes.` : `Prérequis : termine « ${prerequisite?.title || missingPrerequisites[0]} ».`)
    : "Mission disponible.";
  const targetImg = getQuestTargetImage(quest, collectables, npcTypes);
  const seriesRows = [
    ...(prerequisite ? [["Mission requise", prerequisite.title]] : []),
    ...(quest.requiresAll ? [["Progression requise", `${prerequisiteIds.length - missingPrerequisites.length} / ${prerequisiteIds.length} missions terminées`]] : []),
  ];
  const questLevel = getQuestRequiredLevel(quest, playerSector, levelContext);
  const objectiveSprite = (objective) => questObjectiveSprite(objective, collectables, npcTypes);
  const objectiveIcon = (objective) => questObjectiveImage(objective, collectables, npcTypes);
  const portraitSize = normalizedSpriteSize(getQuestTargetSprite(quest, collectables, npcTypes), DETAIL_PORTRAIT_TARGET);
  const acceptBtn = completed
    ? `<button class="qoffAccept done" disabled>Mission terminée ✓</button>`
    : accepted
      ? `<button class="qoffAccept close" data-quest-terminal-close="1">Fermer</button>`
      : `<button class="qoffAccept" data-quest-terminal-accept="${quest.id}"${available ? "" : " disabled"}>Accepter la mission</button>`;
  const statusHtml = (!status || completed || status === "Mission disponible.") ? "" : `<div class="qbriefStatus">${status}</div>`;
  const detailHtml = `
    <div class="qoffHead">
      <span class="qoffPortraitFrame"><img class="qoffPortrait" src="${targetImg}" width="${portraitSize.w}" height="${portraitSize.h}" style="width:${portraitSize.w}px;height:${portraitSize.h}px" alt="" loading="lazy" draggable="false" onerror="this.style.visibility='hidden'"></span>
      <div class="qoffHeadText">
        <h2 class="qoffTitle">${quest.title}</h2>
      </div>
    </div>
    <h4 class="qoffSection">Aperçu</h4>
    <div class="qoffBox">${objectives.map(objective => { const current = accepted ? Number(questState.active[quest.id]?.[objective.id] || 0) : (completed ? objective.amount : 0); const iconSize = normalizedSpriteSize(objectiveSprite(objective), DETAIL_ICON_TARGET); return `<div class="qoffObjective noCount"><span class="qoffCheck"><input type="checkbox" tabindex="-1" aria-hidden="true"${completed || current >= objective.amount ? " checked" : ""} disabled></span><span class="qoffObjectiveLabel">${apercuObjectiveLabel(objective)}</span><img src="${objectiveIcon(objective)}" width="${iconSize.w}" height="${iconSize.h}" style="width:${iconSize.w}px;height:${iconSize.h}px" alt="" loading="lazy" draggable="false" onerror="this.style.visibility='hidden'"></div>`; }).join("")}</div>
    <h4 class="qoffSection">Récompense</h4>
    <div class="qoffBox">${rewardRows(quest).map(([label, value]) => `<div class="qoffReward"><span>${label}</span><b>${value}</b></div>`).join("")}</div>
    ${seriesRows.length ? `<div class="qoffSeries">${seriesRows.map(([label, value]) => `<div><span>${label}</span><b>${value}</b></div>`).join("")}</div>` : ""}
    <div class="qoffBottom qoffBottomSolo">${acceptBtn}</div>
    ${statusHtml}`;
  return { selectedQuestId, listHtml, detailHtml };
}
