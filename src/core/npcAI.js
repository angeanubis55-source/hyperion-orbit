"use strict";

import { clamp } from "./collision.js";

export const NPC_DIRECT_SPEED_FACTOR = 0.75;

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
