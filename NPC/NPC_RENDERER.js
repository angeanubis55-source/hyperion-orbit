"use strict";
export function getNpcSpriteFrame(entity, config, angleToFrameIndex) {
  const sprite = config?.sprite || {};
  const frames = sprite.frames || sprite._imgs?.length || 1;
  if (entity.type === "npc_Cubikon" && !entity.spritePlay) return entity._animPhase === "hold" ? frames - 1 : 0;
  if (entity.spritePlay || config?.playSprite) return Math.min(frames - 1, Math.max(0, Math.floor(entity.spriteIdx || 0)));
  return angleToFrameIndex(entity.angle + (sprite.angleOffset || 0), frames);
}
