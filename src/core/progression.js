"use strict";

import { clamp } from "./collision.js";

export function getLevelInfo(experience) {
  const exp = Math.max(0, Number(experience || 0));
  const level = exp < 10000 ? 1 : Math.floor(Math.log2(exp / 10000)) + 2;
  const currentRequirement = level === 1 ? 0 : 10000 * 2 ** (level - 2);
  const nextRequirement = 10000 * 2 ** (level - 1);
  const progress = nextRequirement > currentRequirement
    ? Math.floor((exp - currentRequirement) / (nextRequirement - currentRequirement) * 100)
    : 100;
  return {
    level,
    pct: clamp(progress, 0, 100),
    curReq: currentRequirement,
    nextReq: nextRequirement,
    current: exp - currentRequirement,
    required: nextRequirement - currentRequirement,
  };
}

export function getNpcExperienceReward(npc, definition = {}) {
  return Math.max(0, Math.floor(Number(npc?.value ?? definition.value ?? 0)));
}

const BASE_NPC_HONOR = {
  Streuner: 2, Lordakia: 4, Saimon: 8, Mordon: 16, Devolarium: 32,
  Sibelonit: 16, Sibelon: 64, Lordakium: 128, Kristallin: 32,
  Kristallon: 256, Protegit: 32, Cubikon: 4096, StreuneR8: 16,
  Interceptor: 24, Barracuda: 56, Saboteur: 72, Annihilator: 128,
};

export function getNpcHonorReward(npc, definition = {}) {
  const credits = Math.max(0, Number(npc?.value ?? definition.value ?? 0));
  const rawType = String(npc?.type || definition.type || "").replace(/^npc_/, "");
  let type = rawType;
  let multiplier = 1;
  if (type.startsWith("Boss_")) { type = type.slice(5); multiplier *= 4; }
  if (type.startsWith("Uber_")) { type = type.slice(5); multiplier *= 8; }
  if (type.endsWith("_beta")) { type = type.slice(0, -5); multiplier *= 2; }
  if (type.endsWith("_gamma")) { type = type.slice(0, -6); multiplier *= 4; }
  if (type.endsWith("_alpha")) type = type.slice(0, -6);
  const known = BASE_NPC_HONOR[type];
  return Math.max(0, Math.floor(known == null ? credits * 0.1 : known * multiplier));
}

export function getQuestExperienceReward(quest) {
  const reward = quest?.reward || {};
  return Math.max(0, Math.floor(Number(reward.exp ?? Number(reward.credits || 0) * 0.1)));
}

export function grantExperience(stats, amount) {
  const target = stats || {};
  const beforeExp = Math.max(0, Number(target.exp || 0));
  const gained = Math.max(0, Math.floor(Number(amount || 0)));
  const before = getLevelInfo(beforeExp);
  target.exp = beforeExp + gained;
  const after = getLevelInfo(target.exp);
  return { gained, before, after, leveledUp: after.level > before.level };
}

export const PILOT_RANKS = [
  { name: "Pilote débutant", points: 0 },
  { name: "Pilote spatial", points: 100 },
  { name: "Sergent", points: 500 },
  { name: "Lieutenant", points: 1500 },
  { name: "Capitaine", points: 4000 },
  { name: "Major", points: 10000 },
  { name: "Colonel", points: 25000 },
  { name: "Général", points: 60000 },
  { name: "Commandant suprême", points: 150000 },
];

export function getRankInfo(rankPoints) {
  const points = Math.max(0, Math.floor(Number(rankPoints || 0)));
  let index = 0;
  for (let i = 1; i < PILOT_RANKS.length; i++) {
    if (points < PILOT_RANKS[i].points) break;
    index = i;
  }
  const rank = PILOT_RANKS[index];
  const next = PILOT_RANKS[index + 1] || null;
  return { index, name: rank.name, points, next, maxRank: !next };
}

export function grantHonor(stats, amount) {
  const target = stats || {};
  const gained = Math.max(0, Math.floor(Number(amount || 0)));
  target.honor = Math.max(0, Number(target.honor || 0)) + gained;
  return { gained, total: target.honor };
}

export function calculateRankPoints(stats) {
  const experience = Math.max(0, Number(stats?.exp || 0));
  const honor = Math.max(0, Number(stats?.honor || 0));
  return Math.floor(experience / 100000 + honor / 100);
}
