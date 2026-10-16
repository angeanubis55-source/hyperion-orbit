"use strict";

// Passe de combat Halloween : 25 objectifs à paliers, récompenses en clés
// (connectées plus tard). Pur (aucun DOM/Canvas/window) : le stockage vit
// dans account.user.battlepass = { eventId, progress: {objId: n}, claimed: [] }.

import { halloweenRoleOf } from "../NPC/NPC_HALLOWEEN.js";

export const BATTLEPASS_EVENT_ID = "hw2026";

const obj = (id, label, kind, match, amount, keys) => Object.freeze({
  id, label, kind, match: Object.freeze(Array.isArray(match) ? match : [match]), amount, keys,
});

export const BATTLEPASS_OBJECTIVES = Object.freeze([
  obj("hw_kill_1", "Éliminer 25 Curcubitors", "kill", "npc_Curcubitor", 25, 1),
  obj("hw_kill_2", "Éliminer 100 Curcubitors", "kill", "npc_Curcubitor", 100, 2),
  obj("hw_kill_3", "Éliminer 250 Curcubitors", "kill", "npc_Curcubitor", 250, 3),
  obj("hw_kill_4", "Éliminer 500 Curcubitors", "kill", "npc_Curcubitor", 500, 5),
  obj("hw_kill_5", "Éliminer 1000 Curcubitors", "kill", "npc_Curcubitor", 1000, 8),
  obj("hw_kill_6", "Éliminer 2500 Curcubitors", "kill", "npc_Curcubitor", 2500, 12),
  obj("hw_kill_7", "Éliminer 10000 Curcubitors", "kill", "npc_Curcubitor", 10000, 20),
  obj("hw_boss_1", "Éliminer 1 Boss Curcubitor", "kill", "npc_Boss_Curcubitor", 1, 3),
  obj("hw_boss_2", "Éliminer 3 Boss Curcubitors", "kill", "npc_Boss_Curcubitor", 3, 8),
  obj("hw_boss_3", "Éliminer 9 Boss Curcubitors", "kill", "npc_Boss_Curcubitor", 9, 15),
  obj("hw_boss_4", "Éliminer 25 Boss Curcubitors", "kill", "npc_Boss_Curcubitor", 25, 25),
  obj("hw_boss_5", "Éliminer 50 Boss Curcubitors", "kill", "npc_Boss_Curcubitor", 50, 40),
  obj("hw_boss_6", "Éliminer 100 Boss Curcubitors", "kill", "npc_Boss_Curcubitor", 100, 60),
  obj("hw_candy_1", "Collecter 50 bonbons", "collect", "candy", 50, 2),
  obj("hw_candy_2", "Collecter 200 bonbons", "collect", "candy", 200, 5),
  obj("hw_candy_3", "Collecter 500 bonbons", "collect", "candy", 500, 10),
  obj("hw_candy_4", "Collecter 1500 bonbons", "collect", "candy", 1500, 20),
  obj("hw_gold_1", "Collecter 10 bonbons dorés", "collect", "candy_golden", 10, 3),
  obj("hw_gold_2", "Collecter 30 bonbons dorés", "collect", "candy_golden", 30, 8),
  obj("hw_gold_3", "Collecter 75 bonbons dorés", "collect", "candy_golden", 75, 15),
  obj("hw_gold_4", "Collecter 200 bonbons dorés", "collect", "candy_golden", 200, 25),
  obj("hw_pump_1", "Ramasser 10 Pumpkin Box", "collect", "Pumpkin_Box", 10, 2),
  obj("hw_pump_2", "Ramasser 50 Pumpkin Box", "collect", "Pumpkin_Box", 50, 6),
  obj("hw_cucu_1", "Ramasser 10 Box de Cucurbitors", "collect", ["Cucurbitor_Box", "Boss_Cucurbitor_Box"], 10, 2),
  obj("hw_cucu_2", "Ramasser 30 Box de Cucurbitors", "collect", ["Cucurbitor_Box", "Boss_Cucurbitor_Box"], 30, 5),
  obj("hw_cucu_3", "Ramasser 100 Box de Cucurbitors", "collect", ["Cucurbitor_Box", "Boss_Cucurbitor_Box"], 100, 12),
  obj("hw_dmg_1", "Infliger 1 000 000 de dégâts aux NPC", "dmg", "npc", 1000000, 3),
  obj("hw_dmg_2", "Infliger 10 000 000 de dégâts aux NPC", "dmg", "npc", 10000000, 6),
  obj("hw_dmg_3", "Infliger 100 000 000 de dégâts aux NPC", "dmg", "npc", 100000000, 12),
  obj("hw_dmg_4", "Infliger 500 000 000 de dégâts aux NPC", "dmg", "npc", 500000000, 25),
  obj("hw_dmg_5", "Infliger 1 000 000 000 de dégâts aux NPC", "dmg", "npc", 1000000000, 40),
  obj("hw_dmg_6", "Infliger 10 000 000 000 de dégâts aux NPC", "dmg", "npc", 10000000000, 60),
]);

export function getBattlepassObjective(objId) {
  return BATTLEPASS_OBJECTIVES.find((o) => o.id === objId) || null;
}

export function normalizeBattlepassState(raw) {
  const obj = raw && typeof raw === "object" ? raw : {};
  const fresh = () => {
    const progress = {};
    for (const def of BATTLEPASS_OBJECTIVES) progress[def.id] = 0;
    return { eventId: BATTLEPASS_EVENT_ID, progress, claimed: [] };
  };
  // Nouvel event : on repart de zéro.
  if (obj.eventId != null && obj.eventId !== BATTLEPASS_EVENT_ID) return fresh();
  if (!obj.progress || typeof obj.progress !== "object") return fresh();
  const progress = {};
  for (const def of BATTLEPASS_OBJECTIVES) {
    progress[def.id] = Math.max(0, Math.min(def.amount, Math.floor(Number(obj.progress[def.id]) || 0)));
  }
  const claimed = Array.isArray(obj.claimed)
    ? obj.claimed.map(String).filter((id) => getBattlepassObjective(id))
    : [];
  return { eventId: BATTLEPASS_EVENT_ID, progress, claimed };
}

// Types alimentés par un événement (kind, type) : les variantes Halloween
// comptent aussi pour leur générique (toutes maps, tous niveaux).
export function battlepassFeedTypes(kind, type) {
  const out = [String(type)];
  if (kind === "kill") {
    const role = halloweenRoleOf(type);
    if (role === "normal") out.push("npc_Curcubitor");
    else if (role === "boss") out.push("npc_Boss_Curcubitor");
  }
  return out;
}

// Retourne { advanced, completed } (ids). L'état passé est muté (puis sauvé).
export function recordBattlepassProgress(state, kind, type, amount = 1) {
  const st = normalizeBattlepassState(state);
  Object.assign(state, { eventId: st.eventId, progress: { ...st.progress }, claimed: [...st.claimed] });
  const advanced = [];
  const completed = [];
  const qty = Math.max(0, Number(amount) || 0);
  if (!(qty > 0)) return { advanced, completed };
  const fed = battlepassFeedTypes(kind, type);
  for (const def of BATTLEPASS_OBJECTIVES) {
    if (def.kind !== kind) continue;
    if (!def.match.some((m) => fed.includes(String(m)))) continue;
    const before = Number(state.progress[def.id] || 0);
    if (before >= def.amount) continue;
    state.progress[def.id] = Math.min(def.amount, before + qty);
    advanced.push(def.id);
    if (state.progress[def.id] >= def.amount) completed.push(def.id);
  }
  return { advanced, completed };
}

export function isBattlepassComplete(state, objId) {
  const def = getBattlepassObjective(objId);
  if (!def) return false;
  const st = normalizeBattlepassState(state);
  return Number(st.progress[def.id] || 0) >= def.amount;
}
