import { startOrbitGame } from "../../src/core/OrbitEngine.js";
import { createImageLoader } from "../../src/core/ImageLoader.js";
import { createSFX } from "../../src/core/SFX.js";
import { getZoneSpawns, getZonePortals } from "./Spawns.js";

import { WORLD } from "./World.js";

import { SHIP_PACKS } from "../../src/data/shipPacks.js";
import { AMMO, PLAYER_BULLET_SPRITES } from "../../src/data/ammo.js";
import { NPC_TYPES } from "../../src/data/npcTypes.js";
import { LOCK_SPR, PORTAL_IDLE_SPR, PORTAL_OPEN_SPR } from "../../src/data/uiSprites.js";

export function init() {
  startOrbitGame({
    WORLD,

    // gate system inutilisé en zone
    getWavePlan: () => ({ spawns: [] }),
    DEFAULT_WAVE_TYPE: "dummy",

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
  mode: "zone",
  mapLabel: "1-9",
  getZoneSpawns,
  getZonePortals, // ✅ ajout
},

  });
}
