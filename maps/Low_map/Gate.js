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
      mapLabel: "GG Low",
      mode: "gate",
      playerSpawn: { x: 520, yRatio: 0.5 },
      escort: { shipId: "goliath", ammo: "x3", max: 3 },
      bossEncounter: {
        bossType: "npc_Century_Falcon",
        countPerPhase: 15,
        phaseTypes: [
          "npc_Vagrant",
          "npc_Marauder",
          "npc_Outcast",
          "npc_Corsair",
          "npc_Hooligan",
          "npc_Ravager",
          "npc_Convict",
        ],
      },
    },
  });
}
