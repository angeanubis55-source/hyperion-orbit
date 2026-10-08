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
      mapLabel: "GG Zeta",
      mode: "gate",
      // ✅ Finale scriptée : Devourer invulnérable sous gardes (vague 9 : garde
      // initiale seule) puis 7 paliers en vague 10 (phasesFinalWaveOnly).
      bossEncounter: {
        bossType: "npc_Devourer",
        name: "Zeta",
        initialGuard: true,
        phasesFinalWaveOnly: true,
        phaseGroups: [
          [{ type: "npc_Infernal", count: 4 }],
          [{ type: "npc_Scorcher", count: 6 }],
          [
            { type: "npc_Streuner", count: 2 },
            { type: "npc_StreuneR8", count: 2 },
            { type: "npc_Boss_Streuner", count: 2 },
            { type: "npc_Uber_Streuner", count: 2 },
            { type: "npc_Uber_StreuneR8", count: 2 },
          ],
          [
            { type: "npc_Lordakia", count: 3 },
            { type: "npc_Boss_Lordakia", count: 2 },
            { type: "npc_Uber_Lordakia", count: 3 },
          ],
          [
            { type: "npc_Saimon", count: 3 },
            { type: "npc_Boss_Saimon", count: 2 },
            { type: "npc_Uber_Saimon", count: 3 },
          ],
          [
            { type: "npc_Sibelonit", count: 3 },
            { type: "npc_Boss_Sibelonit", count: 3 },
            { type: "npc_Uber_Sibelonit", count: 3 },
          ],
          [
            { type: "npc_Kristallin", count: 3 },
            { type: "npc_Boss_Kristallin", count: 3 },
            { type: "npc_Uber_Kristallin", count: 3 },
          ],
        ],
      },
    },
  });
}
