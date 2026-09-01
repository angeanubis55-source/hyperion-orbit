"use strict";

import {
  MAX_ACTIVE_QUESTS,
  QUEST_DEFINITIONS,
  canAcceptQuest,
  getQuestPrerequisiteIds,
  getQuestObjectives,
  getOrderedQuestDefinitions,
  isQuestComplete,
} from "../data/quests.js";
import { getQuestExperienceReward, getQuestHonorReward } from "./progression.js";
import { formatInteger } from "./numberFormat.js";

function rewardRows(quest) {
  const ammo = Object.entries(quest.reward?.ammo || {}).filter(([, amount]) => amount > 0).map(([type, amount]) => [`Munitions ${type === "x6" ? "RSB-75" : type.toUpperCase()}`, formatInteger(amount)]);
  const galaxyEnergy = Math.max(0, Math.floor(Number(quest.reward?.galaxyEnergy) || 0));
  return [
    ["Crédits", formatInteger(quest.reward.credits)],
    ["Expérience", formatInteger(getQuestExperienceReward(quest))],
    ["Honneur", formatInteger(getQuestHonorReward(quest))],
    ...ammo,
    ...(galaxyEnergy ? [["Énergies Galaxy Gate", formatInteger(galaxyEnergy)]] : []),
  ];
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
  return formatQuestEntityName(objective?.label || objective?.type || "Objectif");
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
    ${rewardCard(quest)}
    <div class="questObjectives">${objectives.map(objective => {
      const current = Number(progress[objective.id] || 0);
      const percent = Math.min(100, current / objective.amount * 100);
      return `<div class="questObjective"><div class="questStatus"><span>${objectiveLabel(objective)}</span><b>${current} / ${objective.amount}</b></div><div class="questProgress"><i style="width:${percent}%"></i></div></div>`;
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

export function buildQuestTerminalView({ questState, selectedId, hasAccess, collectables, npcTypes, npcLocations = {} }) {
  const orderedQuests = getOrderedQuestDefinitions();
  const selectedQuestId = orderedQuests.some(quest => quest.id === selectedId)
    ? selectedId
    : (orderedQuests[0]?.id || null);
  const quest = QUEST_DEFINITIONS.find(item => item.id === selectedQuestId);
  const listHtml = orderedQuests.map(item => {
    const completed = questState.completed.includes(item.id);
    const accepted = questState.active[item.id] != null;
    const locked = getQuestPrerequisiteIds(item).some(id => !questState.completed.includes(id));
    return `<button class="questOfferItem${item.id === selectedQuestId ? " active" : ""}${accepted ? " accepted" : ""}${completed ? " completed" : ""}${locked ? " locked" : ""}" data-quest-offer="${item.id}">${item.title}${accepted ? " — En cours" : ""}</button>`;
  }).join("") || `<div class="questEmpty">Aucune nouvelle mission.</div>`;
  if (!quest) return { selectedQuestId, listHtml, detailHtml: `<div class="questEmpty">Toutes les missions sont actives ou terminées.</div>` };

  const available = hasAccess && canAcceptQuest(questState, quest);
  const accepted = questState.active[quest.id] != null;
  const completed = questState.completed.includes(quest.id);
  const objectives = getQuestObjectives(quest);
  const prerequisite = QUEST_DEFINITIONS.find(item => item.id === quest.requires);
  const prerequisiteIds = getQuestPrerequisiteIds(quest);
  const missingPrerequisites = prerequisiteIds.filter(id => !questState.completed.includes(id));
  const unlockedQuests = QUEST_DEFINITIONS.filter(item => item.requires === quest.id);
  const full = Object.keys(questState.active).length >= MAX_ACTIVE_QUESTS;
  const status = completed ? "Mission terminée. Récompense déjà récupérée."
    : !hasAccess ? "Rapproche-toi du bâtiment de quêtes."
    : full ? `Tu as déjà ${MAX_ACTIVE_QUESTS} missions actives.`
    : missingPrerequisites.length ? (quest.requiresAll ? `Prérequis : termine les ${prerequisiteIds.length} missions précédentes.` : `Prérequis : termine « ${prerequisite?.title || missingPrerequisites[0]} ».`)
    : "Mission disponible.";
  const seriesRows = [
    ...(prerequisite ? [["Mission requise", prerequisite.title]] : []),
    ...(quest.requiresAll ? [["Progression requise", `${prerequisiteIds.length - missingPrerequisites.length} / ${prerequisiteIds.length} missions terminées`]] : []),
    ...(unlockedQuests.length ? [["Débloque ensuite", unlockedQuests.map(item => item.title).join(", ")]] : []),
  ];
  const detailHtml = `
    <div class="questTitle">${quest.title}</div><div class="questDescription">${quest.description}</div>
    <div class="questObjectives">${objectives.map(objective => { const current = accepted ? Number(questState.active[quest.id]?.[objective.id] || 0) : (completed ? objective.amount : 0); return `<div class="questObjective"><div class="questStatus"><span>${objectiveLabel(objective)}</span><b>${current} / ${objective.amount}</b></div></div>`; }).join("")}</div>
    ${rewardCard(quest)}
    ${seriesRows.length ? `<section class="questInfoCard questSeriesCard"><h4>Série de missions</h4><div class="questInfoRows">${seriesRows.map(([label, value]) => `<div><span>${label}</span><b>${value}</b></div>`).join("")}</div></section>` : ""}
    <section class="questInfoCard questHelpCard"><h4>Où chercher et comment réussir ?</h4><div class="questHelpList">${objectives.map(objective => `<article><b>${objectiveLabel(objective)}</b><p>${objectiveHelp(objective, npcLocations, collectables)}</p></article>`).join("")}</div></section>
    <div class="questStatus">${status}</div>
    <button class="questAction${completed ? " questCompletedAction" : accepted ? " questAcceptedAction" : ""}" data-quest-terminal-accept="${quest.id}" ${available ? "" : "disabled"}>${completed ? "Mission terminée ✓" : accepted ? "Mission en cours" : "Accepter cette mission"}</button>`;
  return { selectedQuestId, listHtml, detailHtml };
}
