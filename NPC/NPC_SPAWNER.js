"use strict";
import { createNpcEntity } from "./NPC_FACTORY.js";

export function spawnNpcEntity(options, prepare = {}) {
  const entity = createNpcEntity(options);
  if (!entity) return null;
  prepare.bullet?.(entity.bulletSprite?.src);
  prepare.preview?.(entity.type);
  prepare.frames?.(entity.type);
  return entity;
}
