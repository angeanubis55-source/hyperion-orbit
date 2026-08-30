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

export const MODULE_BONUS_RANGES = Object.freeze({
  x1: Object.freeze([3, 8]),
  x2: Object.freeze([9, 16]),
  x3: Object.freeze([18, 30]),
});
