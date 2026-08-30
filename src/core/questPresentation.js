"use strict";

import {
  MAX_ACTIVE_QUESTS,
  QUEST_DEFINITIONS,
  canAcceptQuest,
  getQuestObjectives,
  isQuestComplete,
} from "../data/quests.js";
import { getQuestExperienceReward } from "./progression.js";
import { formatInteger } from "./numberFormat.js";

const QUEST_HELP = {
  npc_Streuner: "Présent en grand nombre dans les cartes de départ 1-1, 2-1 et 3-1.",
  npc_Lordakia: "Cherche dans les secteurs de départ et les premières cartes de chaque faction.",
  npc_Saimon: "Fréquente les cartes basses et intermédiaires des trois factions.",
  npc_Mordon: "Présent surtout dans les cartes intermédiaires, notamment les secteurs x-3 et x-4.",
  npc_Sibelon: "Cherche dans les secteurs intermédiaires x-3 et x-4.",
  npc_Devolarium: "Présent dans plusieurs cartes intermédiaires des factions.",
  npc_Sibelonit: "Souvent rencontré dans les secteurs avancés avec les Sibelons.",
  npc_Kristallin: "Cherche dans les cartes avancées et les zones glacées.",
  npc_Kristallon: "Présent dans les cartes avancées, accompagné de Kristallins.",
  npc_Cubikon: "Le Cubikon se trouve dans les secteurs prévus pour les combats de groupe.",
  Cargo_Box: "Les Cargo Boxes apparaissent après la destruction de nombreux NPC.",
  Bonus_Box: "Les Bonus Boxes apparaissent naturellement sur presque toutes les cartes normales.",
  Green_Booty_Box: "Les Green Booty Boxes peuvent apparaître sur les cartes normales.",
  Palladium_Ore: "Le Palladium se collecte sur la carte pirate 5-2.",
  Hybrid_Alloy_Box: "Les alliages hybrides proviennent notamment des Gygerthralls contaminés.",
  Astral_Prime_Box: "Ces boîtes se trouvent dans les secteurs astrals spéciaux.",
};

function rewardLabel(quest) {
  return `${formatInteger(quest.reward.credits)} crédits · ${formatInteger(getQuestExperienceReward(quest))} XP`;
}

export function getQuestTargetImage(quest, collectables, npcTypes) {
  const target = getQuestObjectives(quest)[0];
  const source = target?.kind === "collect"
    ? collectables[target.type]?.sprite
    : npcTypes[target?.type]?.sprite;
  if (!source?.path) return "assets/Quest_Button/1.png";
  return `${source.path}${Number(source.firstNumber ?? 1)}${source.ext || ".png"}`;
}

export function buildQuestCard(quest, questState) {
  const objectives = getQuestObjectives(quest);
  const progress = questState.active[quest.id] || {};
  const ready = isQuestComplete(questState, quest);
  const actions = `${ready
    ? `<button class="questAction" data-quest-action="claim" data-quest-id="${quest.id}">Récupérer la récompense</button>`
    : `<button class="questAction" disabled>Mission en cours</button>`}
    <button class="questAction questCancel" data-quest-action="abandon" data-quest-id="${quest.id}">Abandonner la mission</button>`;

  return `<article class="questCard">
    <div class="questTitle">${quest.title}</div>
    <div class="questDescription">${quest.description}</div>
    <div class="questReward">Récompense : ${rewardLabel(quest)}</div>
    <div class="questObjectives">${objectives.map(objective => {
      const current = Number(progress[objective.id] || 0);
      const percent = Math.min(100, current / objective.amount * 100);
      return `<div class="questObjective"><div class="questStatus"><span>${objective.label || objective.type}</span><b>${current} / ${objective.amount}</b></div><div class="questProgress"><i style="width:${percent}%"></i></div></div>`;
    }).join("")}</div>
    ${ready ? `<div class="questStatus questComplete">Tous les objectifs sont accomplis</div>` : ""}
    ${actions}
  </article>`;
}

export function buildQuestJournalView(questState, selectedId) {
  const activeIds = Object.keys(questState.active);
  const selectedQuestId = activeIds.includes(selectedId) ? selectedId : (activeIds[0] || null);
  const selected = QUEST_DEFINITIONS.find(quest => quest.id === selectedQuestId);
  return {
    selectedQuestId,
    intro: `Journal de bord — ${activeIds.length}/${MAX_ACTIVE_QUESTS} missions actives`,
    tabsHtml: activeIds.map(id => {
      const quest = QUEST_DEFINITIONS.find(item => item.id === id);
      return quest ? `<button class="questTab${id === selectedQuestId ? " active" : ""}" data-quest-tab="${id}" title="${quest.title}">${quest.title}</button>` : "";
    }).join(""),
    contentHtml: selected
      ? buildQuestCard(selected, questState)
      : `<div class="questEmpty">Aucune mission active. Approche-toi d’un bâtiment de quêtes pour en accepter.</div>`,
  };
}

export function buildQuestTerminalView({ questState, selectedId, hasAccess, collectables, npcTypes }) {
  const selectedQuestId = QUEST_DEFINITIONS.some(quest => quest.id === selectedId)
    ? selectedId
    : (QUEST_DEFINITIONS[0]?.id || null);
  const quest = QUEST_DEFINITIONS.find(item => item.id === selectedQuestId);
  const listHtml = QUEST_DEFINITIONS.map(item => {
    const completed = questState.completed.includes(item.id);
    const accepted = questState.active[item.id] != null;
    return `<button class="questOfferItem${item.id === selectedQuestId ? " active" : ""}${accepted ? " accepted" : ""}${completed ? " completed" : ""}" data-quest-offer="${item.id}">${item.title}${accepted ? " — En cours" : ""}</button>`;
  }).join("") || `<div class="questEmpty">Aucune nouvelle mission.</div>`;
  if (!quest) return { selectedQuestId, listHtml, detailHtml: `<div class="questEmpty">Toutes les missions sont actives ou terminées.</div>` };

  const available = hasAccess && canAcceptQuest(questState, quest);
  const accepted = questState.active[quest.id] != null;
  const completed = questState.completed.includes(quest.id);
  const objectives = getQuestObjectives(quest);
  const prerequisite = QUEST_DEFINITIONS.find(item => item.id === quest.requires);
  const full = Object.keys(questState.active).length >= MAX_ACTIVE_QUESTS;
  const status = completed ? "Mission terminée. Récompense déjà récupérée."
    : !hasAccess ? "Rapproche-toi du bâtiment de quêtes."
    : full ? `Tu as déjà ${MAX_ACTIVE_QUESTS} missions actives.`
    : prerequisite && !questState.completed.includes(prerequisite.id) ? `Prérequis : termine « ${prerequisite.title} ».`
    : "Mission disponible.";
  const detailHtml = `
    <div class="questOfferImageWrap"><img class="questOfferImage" src="${getQuestTargetImage(quest, collectables, npcTypes)}" alt="${quest.title}"></div>
    <div class="questTitle">${quest.title}</div><div class="questDescription">${quest.description}</div>
    <div class="questObjectives">${objectives.map(objective => { const current = accepted ? Number(questState.active[quest.id]?.[objective.id] || 0) : (completed ? objective.amount : 0); return `<div class="questObjective"><div class="questStatus"><span>${objective.label || objective.type}</span><b>${current} / ${objective.amount}</b></div></div>`; }).join("")}</div>
    <div class="questReward">Récompense : ${rewardLabel(quest)}</div>
    <div class="questOfferHelp"><b>Où chercher ?</b><br>${objectives.map(objective => `<b>${objective.label || objective.type} :</b> ${QUEST_HELP[objective.type] || "Explore les secteurs correspondant à cet objectif."}`).join("<br>")}</div>
    <div class="questStatus">${status}</div>
    <button class="questAction${completed ? " questCompletedAction" : accepted ? " questAcceptedAction" : ""}" data-quest-terminal-accept="${quest.id}" ${available ? "" : "disabled"}>${completed ? "Mission terminée ✓" : accepted ? "Mission en cours" : "Accepter cette mission"}</button>`;
  return { selectedQuestId, listHtml, detailHtml };
}
