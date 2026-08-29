export const MAX_ACTIVE_QUESTS = 5;

export const QUEST_DEFINITIONS = Object.freeze([
  {
    id: "first_streuners",
    title: "Nettoyage du secteur",
    description: "Sécurise le secteur et récupère les ressources abandonnées.",
    objectives: [
      { id: "streuners", label: "Éliminer des Streuners", kind: "kill", type: "npc_Streuner", amount: 5 },
      { id: "bonus", label: "Collecter des Bonus Boxes", kind: "collect", type: "Bonus_Box", amount: 5 },
    ],
    reward: { credits: 50000 },
  },
  {
    id: "lordakia_patrol",
    title: "Patrouille anti-Lordakia",
    description: "Réduis la présence Lordakia et rapporte des cargaisons.",
    objectives: [
      { id: "lordakias", label: "Éliminer des Lordakias", kind: "kill", type: "npc_Lordakia", amount: 10 },
      { id: "cargo", label: "Collecter des Cargo Boxes", kind: "collect", type: "Cargo_Box", amount: 5 },
    ],
    reward: { credits: 110000 },
    requires: "first_streuners",
  },
  {
    id: "saimon_hunt",
    title: "La menace Saimon",
    description: "Détruis l’escorte légère qui protège les routes ennemies.",
    objectives: [
      { id: "saimons", label: "Éliminer des Saimons", kind: "kill", type: "npc_Saimon", amount: 10 },
      { id: "mordons", label: "Éliminer des Mordons", kind: "kill", type: "npc_Mordon", amount: 5 },
      { id: "bonus", label: "Collecter des Bonus Boxes", kind: "collect", type: "Bonus_Box", amount: 8 },
    ],
    reward: { credits: 240000 },
    requires: "lordakia_patrol",
  },
  { id: "mordon_control", title: "Contrôle des Mordons", description: "Nettoie la zone et récupère les cargaisons.", objectives: [{ id: "mordons", label: "Éliminer des Mordons", kind: "kill", type: "npc_Mordon", amount: 12 }, { id: "cargo", label: "Collecter des Cargo Boxes", kind: "collect", type: "Cargo_Box", amount: 6 }], reward: { credits: 240000 } },
  { id: "sibelon_wall", title: "Briser la ligne Sibelon", description: "Détruis la ligne défensive Sibelon et son escorte.", objectives: [{ id: "sibelons", label: "Éliminer des Sibelons", kind: "kill", type: "npc_Sibelon", amount: 8 }, { id: "sibelonits", label: "Éliminer des Sibelonits", kind: "kill", type: "npc_Sibelonit", amount: 12 }], reward: { credits: 420000 } },
  { id: "devolarium_sweep", title: "Balayage Devolarium", description: "Élimine 6 Devolariums.", target: { kind: "kill", type: "npc_Devolarium", amount: 6 }, reward: { credits: 320000 } },
  { id: "sibelonit_swarm", title: "Essaim de Sibelonits", description: "Élimine 15 Sibelonits.", target: { kind: "kill", type: "npc_Sibelonit", amount: 15 }, reward: { credits: 350000 } },
  { id: "kristallin_frost", title: "Éclats de glace", description: "Élimine 20 Kristallins.", target: { kind: "kill", type: "npc_Kristallin", amount: 20 }, reward: { credits: 500000 } },
  { id: "kristallon_hunt", title: "Chasse aux Kristallons", description: "Élimine 5 Kristallons.", target: { kind: "kill", type: "npc_Kristallon", amount: 5 }, reward: { credits: 650000 } },
  { id: "cubikon_assault", title: "Assaut sur le Cubikon", description: "Détruis 1 Cubikon.", target: { kind: "kill", type: "npc_Cubikon", amount: 1 }, reward: { credits: 1000000 } },
  { id: "cargo_salvage", title: "Récupération de cargaisons", description: "Collecte 10 Cargo Boxes.", target: { kind: "collect", type: "Cargo_Box", amount: 10 }, reward: { credits: 120000 } },
  { id: "bonus_route", title: "Route des bonus", description: "Collecte 15 Bonus Boxes.", target: { kind: "collect", type: "Bonus_Box", amount: 15 }, reward: { credits: 175000 } },
  { id: "green_booty", title: "Butin vert", description: "Collecte 3 Green Booty Boxes.", target: { kind: "collect", type: "Green_Booty_Box", amount: 3 }, reward: { credits: 300000 } },
  { id: "palladium_run", title: "Ruée vers le palladium", description: "Prépare une expédition complète en territoire pirate.", objectives: [{ id: "palladium", label: "Collecter du Palladium", kind: "collect", type: "Palladium_Ore", amount: 20 }, { id: "marauders", label: "Éliminer des Marauders", kind: "kill", type: "npc_Marauder", amount: 5 }], reward: { credits: 750000 } },
  { id: "hybrid_research", title: "Recherche hybride", description: "Affronte les contaminés et récupère leur alliage.", objectives: [{ id: "gygerthralls", label: "Éliminer des Gygerthralls contaminés", kind: "kill", type: "npc_Blighted_Gygerthrall", amount: 5 }, { id: "alloys", label: "Collecter des Hybrid Alloy Boxes", kind: "collect", type: "Hybrid_Alloy_Box", amount: 5 }], reward: { credits: 900000 } },
  { id: "astral_cache", title: "Caches astrales", description: "Collecte 3 Astral Prime Boxes.", target: { kind: "collect", type: "Astral_Prime_Box", amount: 3 }, reward: { credits: 900000 } },
]);

export function getQuestObjectives(quest) {
  const source = Array.isArray(quest?.objectives) && quest.objectives.length
    ? quest.objectives
    : quest?.target ? [quest.target] : [];

  return source.map((objective, index) => ({
    ...objective,
    id: String(objective.id || `objective_${index + 1}`),
    kind: objective.kind || "kill",
    amount: Math.max(1, Math.floor(Number(objective.amount) || 1)),
  }));
}

export function isQuestComplete(state, quest) {
  if (!quest || state?.active?.[quest.id] == null) return false;
  const progress = state.active[quest.id];
  return getQuestObjectives(quest).every(objective =>
    Number(progress?.[objective.id] || 0) >= objective.amount
  );
}

export function normalizeQuestState(raw) {
  const active = {};
  if (raw?.active && typeof raw.active === "object") {
    for (const quest of QUEST_DEFINITIONS) {
      if (Object.keys(active).length >= MAX_ACTIVE_QUESTS) break;
      if (raw.active[quest.id] == null) continue;
      const objectives = getQuestObjectives(quest);
      const saved = raw.active[quest.id];
      active[quest.id] = Object.fromEntries(objectives.map((objective, index) => {
        const value = typeof saved === "number"
          ? (index === 0 ? saved : 0)
          : saved?.[objective.id];
        return [objective.id, Math.max(0, Math.min(
          objective.amount,
          Math.floor(Number(value) || 0)
        ))];
      }));
    }
  }

  const validIds = new Set(QUEST_DEFINITIONS.map(quest => quest.id));
  const completed = [...new Set(Array.isArray(raw?.completed) ? raw.completed : [])]
    .filter(id => validIds.has(id));

  return { active, completed };
}

export function canAcceptQuest(state, quest) {
  if (!quest || state.completed.includes(quest.id) || state.active[quest.id] != null) return false;
  if (Object.keys(state.active).length >= MAX_ACTIVE_QUESTS) return false;
  return !quest.requires || state.completed.includes(quest.requires);
}

export function acceptQuest(state, questId) {
  const quest = QUEST_DEFINITIONS.find(item => item.id === questId);
  if (!canAcceptQuest(state, quest)) return false;
  state.active[quest.id] = Object.fromEntries(
    getQuestObjectives(quest).map(objective => [objective.id, 0])
  );
  return true;
}

export function recordQuestKill(state, npcType) {
  return recordQuestProgress(state, "kill", npcType);
}

export function recordQuestCollect(state, collectableType) {
  return recordQuestProgress(state, "collect", collectableType);
}

export function recordQuestProgress(state, kind, type, amount = 1) {
  const advanced = [];
  for (const quest of QUEST_DEFINITIONS) {
    if (state.active[quest.id] == null) continue;
    let changed = false;
    for (const objective of getQuestObjectives(quest)) {
      if (objective.kind !== kind || objective.type !== type) continue;
      const before = Number(state.active[quest.id][objective.id] || 0);
      state.active[quest.id][objective.id] = Math.min(
        objective.amount,
        before + Math.max(0, Number(amount) || 0)
      );
      changed ||= state.active[quest.id][objective.id] !== before;
    }
    if (changed) advanced.push(quest.id);
  }
  return advanced;
}

export function abandonQuest(state, questId) {
  if (state.active[questId] == null) return false;
  delete state.active[questId];
  return true;
}

export function claimQuest(state, questId) {
  const quest = QUEST_DEFINITIONS.find(item => item.id === questId);
  if (!quest || state.completed.includes(questId)) return null;
  if (!isQuestComplete(state, quest)) return null;

  delete state.active[questId];
  state.completed.push(questId);
  return { ...quest.reward };
}
