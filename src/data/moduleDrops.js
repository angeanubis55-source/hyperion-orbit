"use strict";

export const MODULE_ROLL_COST = 1000000;

export const MODULE_TIER_WEIGHTS = Object.freeze([
  Object.freeze(["x1", 68]),
  Object.freeze(["x2", 25]),
  Object.freeze(["x3", 7]),
]);

export const MODULE_TYPE_WEIGHTS = Object.freeze([
  Object.freeze(["hp", 25]),
  Object.freeze(["shd", 25]),
  Object.freeze(["dmg", 25]),
  Object.freeze(["spc", 25]),
]);

export const MODULE_STAT_COUNT_WEIGHTS = Object.freeze([
  Object.freeze([1, 72]),
  Object.freeze([2, 23]),
  Object.freeze([3, 4.5]),
  Object.freeze([4, 0.5]),
]);

// La rareté d'un module dépend de son nombre de stats. On corrèle la rareté
// au tier tiré :
//   x1 -> surtout Commun + Rare
//   x2 -> surtout Rare + Épique
//   x3 -> surtout Épique + Légendaire
export const MODULE_STAT_COUNT_WEIGHTS_BY_TIER = Object.freeze({
  x1: Object.freeze([
    Object.freeze([1, 80]),
    Object.freeze([2, 17]),
    Object.freeze([3, 2.5]),
    Object.freeze([4, 0.5]),
  ]),
  x2: Object.freeze([
    Object.freeze([1, 10]),
    Object.freeze([2, 60]),
    Object.freeze([3, 27]),
    Object.freeze([4, 3]),
  ]),
  x3: Object.freeze([
    Object.freeze([1, 3]),
    Object.freeze([2, 22]),
    Object.freeze([3, 50]),
    Object.freeze([4, 25]),
  ]),
});

export function getModuleStatCountWeights(tier) {
  return MODULE_STAT_COUNT_WEIGHTS_BY_TIER[tier] || MODULE_STAT_COUNT_WEIGHTS;
}

// Bornes NÉGATIVES (malus) par tier : une stat peut descendre jusque-là.
// Le positif, lui, est borné par la COULEUR du module (voir + bas).
export const MODULE_TIER_MALUS = Object.freeze({
  x1: -4,
  x2: -6,
  x3: -8,
});

// Cap MAXIMAL d'une stat tirée dans SA couleur naturelle :
//   🟢 vert (hp)  -> PV 32 %
//   🔵 bleu (shd) -> Bouclier 30 %
//   🔴 rouge (dmg)-> Dégâts 20 %
//   🟡 jaune (spc)-> Chance de tir 10 %, Pénétration 12 %, Vitesse 12 %
export const MODULE_STAT_MAX_BY_COLOR = Object.freeze({
  hp: Object.freeze({ hp: 32 }),
  shd: Object.freeze({ shield: 30 }),
  dmg: Object.freeze({ damage: 20 }),
  spc: Object.freeze({ laser_hit: 10, penetration: 12, speed: 12 }),
});

// Stats "toutes couleurs" : même cap quel que soit le module.
export const MODULE_STAT_MAX_ANY = Object.freeze({
  exp: 12,
  honor: 12,
});

// Toute stat tirée dans une couleur qui n'est pas la sienne : 5 % max.
export const MODULE_STAT_MAX_OFF_COLOR = 5;

// Cap maximal d'une stat selon le type de module dans lequel elle est tirée.
export function getStatMaxPct(stat, moduleType) {
  const byColor = MODULE_STAT_MAX_BY_COLOR[moduleType]?.[stat];
  if (byColor != null) return byColor;
  const any = MODULE_STAT_MAX_ANY[stat];
  if (any != null) return any;
  return MODULE_STAT_MAX_OFF_COLOR;
}

// Valeur à éviter : un tirage ne doit jamais donner 0% (inutile).
export const MODULE_PCT_BAN = 0;

// Statistiques modifiables par un module roulette.
export const MODULE_ALL_STATS = Object.freeze([
  "hp",
  "shield",
  "damage",
  "speed",
  "penetration",
  "laser_hit",
  "exp",
  "honor",
]);

// Piscine du type "spc" : la stat principale est choisie parmi celles-ci.
export const MODULE_SPC_STATS = Object.freeze([
  "penetration",
  "speed",
  "laser_hit",
  "exp",
  "honor",
]);

// La rareté est liée au NOMBRE de stats du module (malus ou non inclus).
export const MODULE_RARITY_BY_STAT_COUNT = Object.freeze({
  1: "common",
  2: "rare",
  3: "epic",
  4: "legendary",
});

export function getModuleRarity(statCount) {
  const count = Math.max(1, Math.min(4, Math.floor(Number(statCount) || 1)));
  return MODULE_RARITY_BY_STAT_COUNT[count] || "common";
}