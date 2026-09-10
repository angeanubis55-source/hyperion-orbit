import test from "node:test";
import assert from "node:assert/strict";
import { PET_LEVEL_XP, getPetLevel, getPetLevelXp, getPetNextLevelXp } from "../../PET/PET_TYPES.js";

test('PET XP thresholds through level 20 stay unchanged', () => {
  PET_LEVEL_XP.forEach((xp, level) => {
    assert.equal(getPetLevelXp(level), xp);
    assert.equal(getPetLevel(xp), level);
    if (level) assert.equal(getPetLevel(xp - 1), level - 1);
  });
});

test('post-20 costs grow exponentially and levels agree at boundaries', () => {
  let previousCost = 0;
  for (let level = 20; level <= 100; level++) {
    const xp = getPetLevelXp(level);
    const next = getPetNextLevelXp(level);
    assert.equal(getPetLevel(xp), level);
    assert.equal(getPetLevel(next - 1), level);
    assert.equal(getPetLevel(next), level + 1);
    const cost = next - xp;
    if (previousCost) assert.ok(Math.abs(cost - previousCost * 1.15) <= 2);
    previousCost = cost;
  }
  assert.equal(getPetLevelXp(21), 175000000);
  assert.equal(getPetLevelXp(22), 203750000);
});

test('existing high XP is reinterpreted without runaway levels', () => {
  assert.equal(getPetLevel(150000000 + 1614 * 25000000), 59);
  assert.equal(getPetLevel(-1), 0);
  assert.equal(getPetLevel(NaN), 0);
  assert.ok(Number.isFinite(getPetLevel(Infinity)));
  assert.ok(Number.isFinite(getPetLevel(Number.MAX_VALUE)));
});
