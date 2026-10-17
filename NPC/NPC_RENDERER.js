"use strict";
import { isHalloweenEventActive } from "./NPC_HALLOWEEN.js";

export function getNpcSpriteBrightness(entity, nowMs = Date.now()) {
  const type = String(entity?.type || "");
  const pulsing = /(?:^|_)(?:Uber|Emperor)_/i.test(type);
  const boss = entity?.isBoss === true || /(?:^|_)Boss_/i.test(type);
  if ((!pulsing && !boss) || !isHalloweenEventActive(nowMs)) return 1;
  // Luminosité uniquement : une oscillation par seconde, sans transparence.
  return pulsing ? 0.625 - 0.125 * Math.cos(nowMs / 1000 * Math.PI * 2) : 0.75;
}

export function getNpcSpriteFrame(entity, config, angleToFrameIndex) {
  const sprite = config?.sprite || {};
  const frames = sprite.frames || sprite._imgs?.length || 1;
  if ((entity.type === "npc_Cubikon" || entity.cubikonMinions) && !entity.spritePlay) return entity._animPhase === "hold" ? frames - 1 : 0;
  if (entity.spritePlay || config?.playSprite) return Math.min(frames - 1, Math.max(0, Math.floor(entity.spriteIdx || 0)));
  return angleToFrameIndex(entity.angle + (sprite.angleOffset || 0), frames);
}
