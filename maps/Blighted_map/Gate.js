import { startOrbitGame } from "../../src/core/OrbitEngine.js";
import { createImageLoader } from "../../src/core/ImageLoader.js";
import { createSFX } from "../../src/core/SFX.js";

import { WORLD } from "./World.js";
import { getWavePlan, DEFAULT_WAVE_TYPE } from "./Waves.js";

import { SHIP_PACKS } from "../../src/data/shipPacks.js";
import { AMMO, PLAYER_BULLET_SPRITES } from "../../src/data/ammo.js";
import { NPC_TYPES } from "../../src/data/npcTypes.js";
import { LOCK_SPR, PORTAL_IDLE_SPR, PORTAL_OPEN_SPR } from "../../src/data/uiSprites.js";

export function init() {
  startOrbitGame({
    WORLD,
    getWavePlan,
    DEFAULT_WAVE_TYPE,

    SHIP_PACKS,
    AMMO,
    PLAYER_BULLET_SPRITES,
    NPC_TYPES,
    LOCK_SPR,
    PORTAL_IDLE_SPR,
    PORTAL_OPEN_SPR,

    createImageLoader,
    createSFX,

    rules: {
      mapLabel: "GG QZ",
      mode: "gate",
    },
  });
}
