import { startOrbitGame } from "../../SRC/CORE/ORBIT_ENGINE.js";
import { createImageLoader } from "../../SRC/CORE/IMAGE_LOADER.js";
import { createSFX } from "../../SRC/CORE/SFX.js";

import { WORLD } from "./WORLD.js";
import { getWavePlan, DEFAULT_WAVE_TYPE } from "./WAVES.js";

import { SHIP_PACKS } from "../../SHIP/SHIP_PACKS.js";
import { AMMO, PLAYER_BULLET_SPRITES } from "../../COMBAT/AMMO_TYPES.js";
import { NPC_TYPES } from "../../NPC/NPC_TYPES.js";
import { LOCK_SPR, PORTAL_IDLE_SPR, PORTAL_OPEN_SPR } from "../../UI/UI_SPRITES.js";

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
      // ✅ mort en QZ = retour à la base haute (X-8).
      respawnBase: "upper",
      bossEncounter: {
        bossType: "npc_Gygerim_Overlord",
        name: "QZ",
        stationary: true,
        initialGuard: true,
        position: { xRatio: 0.9, yRatio: 0.5 },
        phaseGroups: Array.from({ length: 10 }, (_, index) => {
          const base = (index % 2 === 0 ? 2 : 3) + index * 3;
          return [
            { type: "npc_Viral_Kristallon", count: base },
            { type: "npc_Viral_Gygerthrall", count: base },
          ];
        }),
      },
      playerSpawn: { x: 520, yRatio: 0.5 },
      escort: { shipId: "goliath", ammo: "x3", max: 7 },
    },
  });
}
