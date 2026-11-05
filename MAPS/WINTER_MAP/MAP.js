import { startOrbitGame } from "../../SRC/CORE/ORBIT_ENGINE.js";
import { createImageLoader } from "../../SRC/CORE/IMAGE_LOADER.js";
import { createSFX } from "../../SRC/CORE/SFX.js";
import { getZoneSpawns, getZonePortals, getZoneSafeModules } from "./SPAWNS.js";

import { WORLD } from "./WORLD.js";

import { SHIP_PACKS } from "../../SHIP/SHIP_PACKS.js";
import { AMMO, PLAYER_BULLET_SPRITES } from "../../COMBAT/AMMO_TYPES.js";
import { NPC_TYPES } from "../../NPC/NPC_TYPES.js";
import { LOCK_SPR, PORTAL_IDLE_SPR, PORTAL_OPEN_SPR } from "../../UI/UI_SPRITES.js";

export function init() {
  startOrbitGame({
    WORLD,

    // gate system inutilisé : vagues du convoi pilotées par SCRIPTS/WINTER_GATE.js
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
      // ✅ GG d'hiver partagée : convoi du Père Noël (SRC/CORE/WINTER_CONVOY.js),
      // session horaire commune, pas de PvP.
      mode: "zone",
      mapLabel: "Winter",
      convoy: true,
      noBackground: true,
      getZoneSpawns,
      getZonePortals,
      getZoneSafeModules,
    },
  });
}
