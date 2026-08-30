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
  { id: "basic_space_pilot", name: "Pilote spatial de base", points: 0, image: "1.png" },
  { id: "space_pilot", name: "Pilote spatial", points: 1000, image: "2.png" },
  { id: "chief_space_pilot", name: "Pilote spatial en chef", points: 2000, image: "3.png" },
  { id: "basic_sergeant", name: "Sergent de base", points: 4000, image: "4.png" },
  { id: "sergeant", name: "Sergent", points: 8000, image: "5.png" },
  { id: "chief_sergeant", name: "Sergent-chef", points: 16000, image: "6.png" },
  { id: "basic_lieutenant", name: "Lieutenant de base", points: 32000, image: "7.png" },
  { id: "lieutenant", name: "Lieutenant", points: 64000, image: "8.png" },
  { id: "chief_lieutenant", name: "Lieutenant-chef", points: 128000, image: "9.png" },
  { id: "basic_captain", name: "Capitaine de base", points: 256000, image: "10.png" },
  { id: "captain", name: "Capitaine", points: 512000, image: "11.png" },
  { id: "chief_captain", name: "Capitaine-chef", points: 1024000, image: "12.png" },
  { id: "basic_major", name: "Major de base", points: 2048000, image: "13.png" },
  { id: "major", name: "Major", points: 4096000, image: "14.png" },
  { id: "chief_major", name: "Major-chef", points: 8192000, image: "15.png" },
  { id: "basic_colonel", name: "Colonel de base", points: 16384000, image: "16.png" },
  { id: "colonel", name: "Colonel", points: 32768000, image: "17.png" },
  { id: "chief_colonel", name: "Colonel-chef", points: 65536000, image: "18.png" },
  { id: "basic_general", name: "Général de base", points: 131072000, image: "19.png" },
  { id: "general", name: "Général", points: 262144000, image: "20.png" },
  { id: "chief_general", name: "Chef général suprême", points: 524288000, image: "21.png" },
];

export const OUTLAW_RANK = { id: "outlaw", name: "Paria", points: 0, image: "0.png", special: true };
export const ADMIN_RANK = { id: "admin", name: "Administrateur", points: Number.MAX_SAFE_INTEGER, image: "admin.png", special: true };

export function getRankInfo(rankPoints, honor = 0) {
  const points = Math.max(0, Math.floor(Number(rankPoints || 0)));
  if (Number(honor || 0) < 0) return rankResult(OUTLAW_RANK, -1, points, PILOT_RANKS[0]);
  if (points >= ADMIN_RANK.points) return rankResult(ADMIN_RANK, PILOT_RANKS.length, points, null);
  let index = 0;
  for (let i = 1; i < PILOT_RANKS.length; i++) {
    if (points < PILOT_RANKS[i].points) break;
    index = i;
  }
  const rank = PILOT_RANKS[index];
  const next = PILOT_RANKS[index + 1] || null;
  return rankResult(rank, index, points, next);
}

function rankResult(rank, index, points, next) {
  return {
    index,
    id: rank.id,
    name: rank.name,
    image: rank.image,
    imagePath: `assets/grades/${rank.image}`,
    points,
    next,
    maxRank: !next,
    special: !!rank.special,
  };
}

export function grantHonor(stats, amount) {
  const target = stats || {};
  const gained = Math.max(0, Math.floor(Number(amount || 0)));
  target.honor = Number(target.honor || 0) + gained;
  return { gained, total: target.honor };
}

export function calculateRankPoints(stats) {
  const experience = Math.max(0, Number(stats?.exp || 0));
  const honor = Math.max(0, Number(stats?.honor || 0));
  return Math.floor(experience / 100000 + honor / 100);
}
