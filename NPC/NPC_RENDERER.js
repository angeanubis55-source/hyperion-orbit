"use strict";

export function getNpcSpriteBrightness(entity, nowMs = Date.now()) {
  return 1;
}

export function getNpcSpriteFrame(entity, config, angleToFrameIndex) {
  const sprite = config?.sprite || {};
  const frames = sprite.frames || sprite._imgs?.length || 1;
  if ((entity.type === "npc_Cubikon" || entity.cubikonMinions) && !entity.spritePlay) return entity._animPhase === "hold" ? frames - 1 : 0;
  // Animation en boucle sur l'horloge (indépendante de la sim), décalée par NPC.
  if (sprite.loopFps > 0 && frames > 1) {
    const t = (typeof performance !== "undefined" ? performance.now() : Date.now()) / 1000;
    const phase = Number(entity.seq ?? entity.id ?? 0) || 0;
    return Math.floor(t * sprite.loopFps + phase * 3) % frames;
  }
  if (entity.spritePlay || config?.playSprite) return Math.min(frames - 1, Math.max(0, Math.floor(entity.spriteIdx || 0)));
  return angleToFrameIndex(entity.angle + (sprite.angleOffset || 0), frames);
}
