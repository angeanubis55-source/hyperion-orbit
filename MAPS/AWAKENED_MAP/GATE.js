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
      mapLabel: "GG Awakened",
      mode: "gate",
      // ✅ Vague 7 : le Devourer vert est invulnérable (bulle ISH comme Zeta)
      // tant que ses 30 Protegit sont en vie (garde initiale).
      bossEncounter: {
        bossType: "npc_Awakened_Devourer",
        name: "???",
        initialGuard: true,
      },
    },
  });
}
