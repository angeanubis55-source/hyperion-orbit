"use strict";

import { clamp } from "../SRC/CORE/COLLISION.js";

export const NPC_DIRECT_SPEED_FACTOR = 0.75;

export const NPC_COMBAT_MOVE = Object.freeze({
  radiusMin: 260, radiusMax: 430,
  changeMin: 0.7, changeMax: 2.8,
  closeBrake: 0.78,
  orbitChance: 0.45, holdChance: 0.25, driftChance: 0.20, pauseChance: 0.10,
});

const between = (random, min, max) => min + random() * (max - min);

export function createNpcCombatAI(random = Math.random) {
  const value = random();
  const mode = value < NPC_COMBAT_MOVE.orbitChance ? "orbit"
    : value < NPC_COMBAT_MOVE.orbitChance + NPC_COMBAT_MOVE.holdChance ? "hold"
      : value < NPC_COMBAT_MOVE.orbitChance + NPC_COMBAT_MOVE.holdChance + NPC_COMBAT_MOVE.driftChance ? "drift"
        : "pause";
  return {
    mode,
    dir: random() < 0.5 ? -1 : 1,
    cd: between(random, NPC_COMBAT_MOVE.changeMin, NPC_COMBAT_MOVE.changeMax),
    minR: between(random, 240, 330),
    maxR: between(random, 350, 470),
    wobbleSeed: random() * 9999,
    pauseT: 0,
  };
}

export function ensureNpcCombatAI(ai, random = Math.random) {
  if (!ai) ai = {};
  ai.combatMove ||= createNpcCombatAI(random);
  return ai.combatMove;
}

export function tickNpcCombatAI(state, deltaTime, random = Math.random) {
  state.cd -= deltaTime;
  if (state.pauseT > 0) state.pauseT -= deltaTime;
  if (state.cd > 0) return;
  const value = random();
  state.mode = value < 0.40 ? "orbit" : value < 0.62 ? "hold" : value < 0.86 ? "drift" : "pause";
  if (random() < 0.60) state.dir *= -1;
  if (state.mode === "pause") state.pauseT = between(random, 0.25, 0.85);
  state.cd = between(random, NPC_COMBAT_MOVE.changeMin, NPC_COMBAT_MOVE.changeMax);
}

export function computeNpcCombatMove(entity, distance, nx, ny, ai, deltaTime, random = Math.random) {
  const state = ensureNpcCombatAI(ai, random);
  tickNpcCombatAI(state, deltaTime, random);
  return computeNpcSteering(entity, distance, nx, ny, state, deltaTime, NPC_COMBAT_MOVE.closeBrake);
}

export function computeNpcSteering(entity, distance, nx, ny, ai, deltaTime, closeBrake = 0.7) {
  const tangentX = -ny * ai.dir;
  const tangentY = nx * ai.dir;
  const midpoint = (ai.minR + ai.maxR) * 0.5;

  if (distance > ai.maxR) {
    const side = Math.sin(entity.wobble * 1.4 + ai.wobbleSeed) * 0.3;
    return { mxv: nx * 0.9 + tangentX * side, myv: ny * 0.9 + tangentY * side };
  }

  if (distance < ai.minR) {
    if (ai.mode === "hold" || ai.mode === "pause" || ai.pauseT > 0) return { mxv: 0, myv: 0 };
    const sidePower = ai.mode === "drift" ? 0.25 : 0.55;
    const wobble = Math.sin(entity.wobble * 2.2 + ai.wobbleSeed) * 0.2;
    return { mxv: tangentX * (sidePower + wobble), myv: tangentY * (sidePower + wobble) };
  }

  if (ai.mode === "hold" || ai.mode === "pause" || ai.pauseT > 0) return { mxv: 0, myv: 0 };
  const error = clamp((distance - midpoint) / Math.max(1, ai.maxR - ai.minR), -1, 1);
  const pull = Math.max(0, error) * 0.45;
  const orbitPower = ai.mode === "drift" ? 0.35 : 0.8;
  const wobble = Math.sin(entity.wobble * 1.7 + ai.wobbleSeed) * 0.18;
  return {
    mxv: tangentX * (orbitPower + wobble) + nx * pull,
    myv: tangentY * (orbitPower + wobble) + ny * pull,
  };
}

export function setNpcVelocity(entity, directionX, directionY, speed) {
  const maxSpeed = Math.max(0, Number(speed) || 0) * NPC_DIRECT_SPEED_FACTOR;
  const length = Math.hypot(directionX, directionY);
  if (!length || !maxSpeed) {
    entity.vx = 0;
    entity.vy = 0;
    return;
  }

  const scale = maxSpeed * Math.min(1, length) / length;
  entity.vx = directionX * scale;
  entity.vy = directionY * scale;
}
