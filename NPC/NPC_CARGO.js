"use strict";

import { NPC_TYPES } from "./NPC_TYPES.js";

// Cargo minerais des NPC (lexique officiel FR + darkorbitwiki).
// Boss/Uber explicites (pas de simple x4/x8 : le lexique donne les vraies soutes).
// Reskins (Frozen, Blighted, Maudite, Corrupted, Aberration, Oddity...) -> famille de base.
// Sans données : estimation par points de vie (~), tout le monde est branché.

function tri(prometium, terbium, endurium) {
  return { prometium, endurium, terbium };
}

const BASE_CARGO = Object.freeze({
  npc_Streuner: Object.freeze({ prometium: 10, endurium: 10 }),
  npc_Streuner_Aider: Object.freeze({ prometium: 12, endurium: 12 }),
  npc_Streuner_Recruit: Object.freeze({ prometium: 15, endurium: 15 }),
  npc_Streuner_Creeper: Object.freeze({ prometium: 5, endurium: 5, terbium: 5 }),
  npc_Lordakia: Object.freeze({ prometium: 10, endurium: 10, terbium: 20 }),
  npc_Saimon: Object.freeze({ ...tri(40, 40, 40), prometid: 2, duranium: 2 }),
  npc_Mordon: Object.freeze({ ...tri(80, 80, 80), prometid: 8, duranium: 8, promerium: 1 }),
  npc_Sibelonit: Object.freeze({ ...tri(100, 100, 100), prometid: 8, duranium: 8, promerium: 1 }),
  npc_Devolarium: Object.freeze({ ...tri(100, 100, 100), prometid: 16, duranium: 8, promerium: 16 }),
  npc_Kristallin: Object.freeze({ ...tri(100, 100, 100), prometid: 16, duranium: 16, promerium: 1 }),
  npc_Protegit: Object.freeze({ ...tri(100, 100, 100), prometid: 16, duranium: 16, promerium: 5 }),
  npc_Sibelon: Object.freeze({ ...tri(200, 200, 200), prometid: 32, duranium: 32, promerium: 4 }),
  npc_Lordakium: Object.freeze({ ...tri(300, 300, 300), prometid: 64, duranium: 64, promerium: 8 }),
  npc_Lordakium_Spore: Object.freeze({ duranium: 5, promerium: 3 }),
  npc_Kristallon: Object.freeze({ ...tri(300, 300, 300), prometid: 128, duranium: 128, promerium: 16 }),
  npc_Cubikon: Object.freeze({ ...tri(1200, 1200, 1200), prometid: 512, duranium: 512, promerium: 64, xenomit: 64 }),
  npc_Devourer: Object.freeze({ ...tri(1600, 1600, 1600), prometid: 256, duranium: 256, promerium: 32, seprom: 16, xenomit: 64 }),
  npc_Interceptor: Object.freeze({ ...tri(100, 100, 100), prometid: 18, duranium: 18 }),
  npc_Barracuda: Object.freeze({ ...tri(200, 200, 200), prometid: 24, duranium: 24, promerium: 4 }),
  npc_Saboteur: Object.freeze({ ...tri(500, 500, 500), prometid: 32, duranium: 32, promerium: 8 }),
  npc_Annihilator: Object.freeze({ ...tri(300, 300, 300), prometid: 48, duranium: 48, promerium: 12, xenomit: 2 }),
  npc_Battleray: Object.freeze({ ...tri(400, 400, 400), prometid: 64, duranium: 64, promerium: 20, xenomit: 4 }),
  npc_Deadly_Battleray: Object.freeze({ ...tri(400, 400, 400), prometid: 64, duranium: 64, promerium: 20, xenomit: 4 }),
  npc_Emperor_Sibelon: Object.freeze({ ...tri(1600, 1600, 1600), prometid: 256, duranium: 256, promerium: 32, xenomit: 64 }),
  npc_Emperor_Lordakium: Object.freeze({ ...tri(2560, 2560, 2560), prometid: 512, duranium: 512, promerium: 64, xenomit: 64 }),
  npc_Emperor_Kristallon: Object.freeze({ ...tri(2560, 2560, 2560), prometid: 1024, duranium: 1024, promerium: 128, xenomit: 128 }),
  npc_Emperor_Streuner: Object.freeze({ prometium: 160, endurium: 160 }),
  npc_Century_Falcon: Object.freeze({ prometium: 1, endurium: 1, terbium: 1, prometid: 1, duranium: 1, promerium: 1, xenomit: 1 }),
  npc_StreuneR8: Object.freeze({ ...tri(160, 160, 160), prometid: 15, duranium: 15, promerium: 1, xenomit: 4 }),
  // Pirates LoW (versions map pirate 5-2).
  npc_Vagrant: Object.freeze({ ...tri(50, 50, 50), prometid: 4, duranium: 4, xenomit: 1 }),
  npc_Marauder: Object.freeze({ ...tri(75, 75, 75), prometid: 8, duranium: 8, xenomit: 2 }),
  npc_Outcast: Object.freeze({ ...tri(50, 50, 50), prometid: 4, duranium: 4, xenomit: 1 }),
  npc_Corsair: Object.freeze({ ...tri(50, 50, 50), prometid: 4, duranium: 4, xenomit: 1 }),
  npc_Hooligan: Object.freeze({ ...tri(50, 50, 50), prometid: 4, duranium: 4, xenomit: 1 }),
  npc_Ravager: Object.freeze({ ...tri(50, 50, 50), prometid: 4, duranium: 4, promerium: 2, xenomit: 1 }),
  npc_Convict: Object.freeze({ ...tri(50, 50, 50), prometid: 4, duranium: 4, promerium: 2, xenomit: 1 }),
  // Zeta.
  npc_Infernal: Object.freeze({ ...tri(100, 100, 100), prometid: 16, duranium: 16, promerium: 2, seprom: 1 }),
  npc_Scorcher: Object.freeze({ ...tri(200, 200, 200), prometid: 32, duranium: 32, promerium: 4, seprom: 2 }),
  npc_Melter: Object.freeze({ ...tri(300, 300, 300), prometid: 128, duranium: 128, promerium: 16, seprom: 8 }),
  npc_SaNeJiEwZ: Object.freeze({ ...tri(300, 300, 300), prometid: 126, duranium: 126, promerium: 44, xenomit: 22 }),
  npc_Demaner_Corsair: Object.freeze({ ...tri(150, 150, 150), prometid: 25, duranium: 25, promerium: 2, seprom: 2, xenomit: 8 }),
  // Blacklight.
  npc_Impulse_II: Object.freeze({ ...tri(350, 350, 350), prometid: 80, duranium: 80, promerium: 10 }),
  npc_Attend_IX: Object.freeze({ ...tri(500, 500, 500), prometid: 200, duranium: 200, promerium: 25 }),
  npc_Purpose_XXI: Object.freeze({ ...tri(300, 300, 300), prometid: 128, duranium: 128, promerium: 16 }),
  npc_Abide_I: Object.freeze({ ...tri(80, 80, 80), prometid: 25, duranium: 25, promerium: 2 }),
  npc_SteadFast_III: Object.freeze({ ...tri(80, 80, 80), prometid: 25, duranium: 25, promerium: 2 }),
  npc_Attitude_XIII: Object.freeze({ seprom: 3000 }),
  npc_Observe_X: Object.freeze({ seprom: 3000 }),
  // Famille Mimesis (lexique).
  npc_Hexor_Mimesis: Object.freeze({ ...tri(400, 400, 400), prometid: 64, duranium: 64, promerium: 4, xenomit: 8 }),
  npc_Raging_Mimesis: Object.freeze({ ...tri(1000, 1000, 1000), prometid: 256, duranium: 256, promerium: 8, xenomit: 16 }),
  npc_Cloning_Mimesis: Object.freeze({ ...tri(2400, 2400, 2400), prometid: 512, duranium: 512, promerium: 16, xenomit: 32 }),
  npc_Terror_Mimesis: Object.freeze({ ...tri(3200, 3200, 3200), prometid: 1024, duranium: 1024, promerium: 32, xenomit: 64 }),
  npc_Reflector_Mimesis: Object.freeze({ ...tri(4000, 4000, 4000), prometid: 2048, duranium: 2048, promerium: 64, xenomit: 128 }),
  // Glace.
  npc_Icy: Object.freeze({ ...tri(100, 100, 100), prometid: 16, duranium: 16, promerium: 2 }),
  npc_Ice_Meteoroid: Object.freeze({ ...tri(2400, 2400, 2400), prometid: 1024, duranium: 1024, promerium: 128, xenomit: 256 }),
  npc_Super_Ice_Meteoroid: Object.freeze({ ...tri(2400, 2400, 2400), prometid: 1024, duranium: 1024, promerium: 128, xenomit: 512 }),
  npc_Kucurbium: Object.freeze({ ...tri(1200, 1200, 1200), prometid: 512, duranium: 512, promerium: 64, xenomit: 256 }),
  npc_BossKucurbium: Object.freeze({ ...tri(4800, 4800, 4800), prometid: 2048, duranium: 2048, promerium: 256, xenomit: 1024 }),
  // Plutus.
  npc_Cote_Lo: Object.freeze({ ...tri(60, 60, 60), prometid: 25, duranium: 25, promerium: 3 }),
  npc_Kodkod: Object.freeze({ ...tri(180, 180, 180), prometid: 75, duranium: 75, promerium: 10 }),
  npc_Aura_Dun_Jig: Object.freeze({ ...tri(300, 300, 300), prometid: 128, duranium: 128, promerium: 16 }),
  npc_Lac_Lion: Object.freeze({ ...tri(400, 400, 400), prometid: 175, duranium: 175, promerium: 22 }),
  npc_Natal_Nap: Object.freeze({ ...tri(1150, 1150, 1150), prometid: 500, duranium: 500, promerium: 60 }),
  npc_Plutus_Boss: Object.freeze({ ...tri(1150, 1150, 1150), prometid: 500, duranium: 500, promerium: 60 }),
  // Poissons 5-4.
  npc_Spookfish: Object.freeze({ ...tri(200, 200, 200), prometid: 32, duranium: 32, promerium: 2 }),
  npc_Lanternfish: Object.freeze({ ...tri(400, 400, 400), prometid: 64, duranium: 64, promerium: 4, xenomit: 8 }),
  npc_Barb: Object.freeze({ ...tri(800, 800, 800), prometid: 128, duranium: 128, promerium: 8, xenomit: 16 }),
  npc_Pike: Object.freeze({ ...tri(1200, 1200, 1200), prometid: 512, duranium: 512, promerium: 64, xenomit: 256 }),
  npc_The_Stinger: Object.freeze({ ...tri(4800, 4800, 4800), prometid: 2048, duranium: 2048, promerium: 256, xenomit: 1024 }),
  // Trio ancien + éclaireurs (~ niveau Kristallin/Kristallon, pas de fiche wiki).
  npc_Styxus: Object.freeze({ ...tri(300, 300, 300), prometid: 128, duranium: 128, promerium: 16 }),
  npc_Charopos: Object.freeze({ ...tri(300, 300, 300), prometid: 128, duranium: 128, promerium: 16 }),
  npc_Lanatum: Object.freeze({ ...tri(300, 300, 300), prometid: 128, duranium: 128, promerium: 16 }),
  // Hitac (échelle Ice_Meteoroid, ~ par durabilité).
  npc_Hitac_2_0: Object.freeze({ ...tri(4800, 4800, 4800), prometid: 2048, duranium: 2048, promerium: 256, xenomit: 512 }),
  npc_Hitac_2_5: Object.freeze({ ...tri(3600, 3600, 3600), prometid: 1536, duranium: 1536, promerium: 192, xenomit: 384 }),
  npc_Hitac_Minion_2_0: Object.freeze({ ...tri(3600, 3600, 3600), prometid: 1536, duranium: 1536, promerium: 192, xenomit: 384 }),
  npc_Hitac_Minion_2_5: Object.freeze({ ...tri(2400, 2400, 2400), prometid: 1024, duranium: 1024, promerium: 128, xenomit: 256 }),
  npc_Hitac_Underling: Object.freeze({ ...tri(300, 300, 300), prometid: 128, duranium: 128, promerium: 16 }),
  npc_Hitac_Underboss: Object.freeze({ ...tri(300, 300, 300), prometid: 128, duranium: 128, promerium: 16 }),
  npc_I_Hitac: Object.freeze({ ...tri(300, 300, 300), prometid: 128, duranium: 128, promerium: 16 }),
  // Skoll (~ niveau Ice_Meteoroid, xenomit réduit : pas de fiche wiki).
  npc_Skoll: Object.freeze({ ...tri(4800, 4800, 4800), prometid: 2048, duranium: 2048, promerium: 256, xenomit: 512 }),
  npc_Skoll_280: Object.freeze({ ...tri(4800, 4800, 4800), prometid: 2048, duranium: 2048, promerium: 256, xenomit: 512 }),
  // Curcubitor (event, ~ niveau Kristallin).
  npc_Curcubitor: Object.freeze({ ...tri(100, 100, 100), prometid: 16, duranium: 16, promerium: 1 }),
  npc_Boss_Curcubitor: Object.freeze({ ...tri(400, 400, 400), prometid: 64, duranium: 64, promerium: 4, xenomit: 8 }),
  npc_Frightful_Curcubitor: Object.freeze({ ...tri(300, 300, 300), prometid: 128, duranium: 128, promerium: 16 }),
  // Plutus Warhead / Synk (~ niveau Lanternfish/Barb).
  npc_Plutus_Warhead: Object.freeze({ ...tri(800, 800, 800), prometid: 128, duranium: 128, promerium: 8, xenomit: 16 }),
  npc_Synk: Object.freeze({ ...tri(800, 800, 800), prometid: 128, duranium: 128, promerium: 8, xenomit: 16 }),
  // Demaner Freighter (~ niveau Emperor_Sibelon / 2).
  npc_Demaner_Freighter: Object.freeze({ ...tri(2400, 2400, 2400), prometid: 1024, duranium: 1024, promerium: 128, xenomit: 128 }),
  // Éclaireurs / roquettes (~ niveau Sibelon).
  npc_Streuner_Rocketeer: Object.freeze({ ...tri(200, 200, 200), prometid: 32, duranium: 32, promerium: 4 }),
  npc_Seeker_Rocket: Object.freeze({ ...tri(200, 200, 200), prometid: 32, duranium: 32, promerium: 4 }),
  // Famille Cyborg custom (~ niveau Kristallin, pas de fiche wiki).
  npc_Troublemaker_Cyborg: Object.freeze({ ...tri(150, 150, 150), prometid: 24, duranium: 24, promerium: 3 }),
  npc_Cowering_Cyborg: Object.freeze({ ...tri(150, 150, 150), prometid: 24, duranium: 24, promerium: 3 }),
  npc_Phasing_Cyborg: Object.freeze({ ...tri(150, 150, 150), prometid: 24, duranium: 24, promerium: 3 }),
  npc_Demolition_Cyborg: Object.freeze({ ...tri(150, 150, 150), prometid: 24, duranium: 24, promerium: 3 }),
  npc_Shielded_Cyborg: Object.freeze({ ...tri(150, 150, 150), prometid: 24, duranium: 24, promerium: 3 }),
  npc_Singularity_Cyborg: Object.freeze({ ...tri(150, 150, 150), prometid: 24, duranium: 24, promerium: 3 }),
});

// Soutes Boss explicites (lexique FR).
const BOSS_CARGO = Object.freeze({
  npc_Boss_Streuner: Object.freeze({ prometium: 40, endurium: 40, terbium: 10 }),
  npc_Boss_Lordakia: Object.freeze({ prometium: 10, endurium: 10, terbium: 20, prometid: 10, promerium: 1, xenomit: 1 }),
  npc_Boss_Saimon: Object.freeze({ ...tri(160, 160, 160), prometid: 8, duranium: 8, promerium: 1, xenomit: 2 }),
  npc_Boss_Mordon: Object.freeze({ ...tri(320, 320, 320), prometid: 32, duranium: 32, promerium: 8, xenomit: 4 }),
  npc_Boss_Sibelonit: Object.freeze({ ...tri(400, 400, 400), prometid: 32, duranium: 32, promerium: 4, xenomit: 8 }),
  npc_Boss_Devolarium: Object.freeze({ ...tri(400, 400, 400), prometid: 64, duranium: 64, promerium: 8, xenomit: 8 }),
  npc_Boss_Kristallin: Object.freeze({ ...tri(400, 400, 400), prometid: 64, duranium: 64, promerium: 4, xenomit: 8 }),
  npc_Boss_Sibelon: Object.freeze({ ...tri(800, 800, 800), prometid: 128, duranium: 128, promerium: 16, xenomit: 16 }),
  npc_Boss_Lordakium: Object.freeze({ ...tri(1200, 1200, 1200), prometid: 256, duranium: 256, promerium: 32, xenomit: 32 }),
  npc_Boss_Kristallon: Object.freeze({ ...tri(1200, 1200, 1200), prometid: 512, duranium: 512, promerium: 64, xenomit: 64 }),
  npc_Boss_StreuneR8: Object.freeze({ ...tri(320, 320, 320), prometid: 32, duranium: 32, promerium: 4, xenomit: 4 }),
});

// Soutes Uber explicites (lexique FR, Palladium inclus).
const UBER_CARGO = Object.freeze({
  npc_Uber_Streuner: Object.freeze({ ...tri(80, 80, 80) }),
  npc_Uber_Lordakia: Object.freeze({ ...tri(160, 160, 160), prometid: 20, duranium: 20, promerium: 2, xenomit: 2 }),
  npc_Uber_Saimon: Object.freeze({ ...tri(320, 320, 320), prometid: 16, duranium: 16, promerium: 2, xenomit: 4 }),
  npc_Uber_Mordon: Object.freeze({ ...tri(640, 640, 640), prometid: 64, duranium: 64, promerium: 16, xenomit: 8 }),
  npc_Uber_Sibelonit: Object.freeze({ ...tri(800, 800, 800), prometid: 128, duranium: 128, promerium: 16, xenomit: 32 }),
  npc_Uber_Devolarium: Object.freeze({ ...tri(800, 800, 800), prometid: 128, duranium: 128, promerium: 16, xenomit: 16 }),
  npc_Uber_Kristallin: Object.freeze({ ...tri(800, 800, 800), prometid: 128, duranium: 128, promerium: 8, xenomit: 16 }),
  npc_Uber_Sibelon: Object.freeze({ ...tri(1600, 1600, 1600), prometid: 256, duranium: 256, promerium: 32, xenomit: 32 }),
  npc_Uber_Lordakium: Object.freeze({ ...tri(2400, 2400, 2400), prometid: 512, duranium: 512, promerium: 64, xenomit: 64 }),
  npc_Uber_Kristallon: Object.freeze({ ...tri(2400, 2400, 2400), prometid: 1024, duranium: 1024, promerium: 128, xenomit: 128 }),
  npc_Uber_StreuneR8: Object.freeze({ ...tri(1200, 1200, 1200), prometid: 120, duranium: 120, promerium: 8, xenomit: 16 }),
  npc_Uber_Interceptor: Object.freeze({ ...tri(800, 800, 800), prometid: 72, duranium: 72, promerium: 16, palladium: 2 }),
  npc_Uber_Barracuda: Object.freeze({ ...tri(1000, 1000, 1000), prometid: 100, duranium: 12, promerium: 100, palladium: 2 }),
  npc_Uber_Saboteur: Object.freeze({ ...tri(1500, 1500, 1500), prometid: 120, duranium: 120, promerium: 32, palladium: 3 }),
  npc_Uber_Annihilator: Object.freeze({ ...tri(1200, 1200, 1200), prometid: 200, duranium: 200, promerium: 48, xenomit: 8, palladium: 4 }),
  npc_Uber_Battleray: Object.freeze({ ...tri(1400, 1400, 1400), prometid: 250, duranium: 250, promerium: 80, xenomit: 8, palladium: 6 }),
});

// Agatus / Spinel : montants selon la map (lexique FR).
const AGATUS_TIERS = Object.freeze({
  "1-3": 0, "2-3": 0, "3-3": 0,
  "1-4": 1, "2-4": 1, "3-4": 1,
  "1-5": 2, "2-5": 2, "3-5": 2,
  "1-6": 3, "2-6": 3, "3-6": 3,
  "1-7": 4, "2-7": 4, "3-7": 4,
  "1-8": 5, "2-8": 5, "3-8": 5,
});
const AGATUS_CARGO = Object.freeze([
  Object.freeze({ ...tri(300, 300, 300), prometid: 128, duranium: 128, promerium: 16, xenomit: 4 }),
  Object.freeze({ ...tri(600, 600, 600), prometid: 256, duranium: 256, promerium: 32, xenomit: 8 }),
  Object.freeze({ ...tri(990, 990, 990), prometid: 422, duranium: 422, promerium: 53, xenomit: 13 }),
  Object.freeze({ ...tri(1440, 1440, 1440), prometid: 614, duranium: 614, promerium: 77, xenomit: 19 }),
  Object.freeze({ ...tri(1650, 1650, 1650), prometid: 704, duranium: 704, promerium: 88, xenomit: 22 }),
  Object.freeze({ ...tri(1800, 1800, 1800), prometid: 768, duranium: 768, promerium: 96, xenomit: 24 }),
]);
const SPINEL_CARGO = Object.freeze([
  Object.freeze({ ...tri(80, 80, 80), prometid: 8, duranium: 8, promerium: 1 }),
  Object.freeze({ ...tri(160, 160, 160), prometid: 16, duranium: 16, promerium: 2 }),
  Object.freeze({ ...tri(264, 264, 264), prometid: 26, duranium: 26, promerium: 3 }),
  Object.freeze({ ...tri(384, 384, 384), prometid: 38, duranium: 38, promerium: 6 }),
  Object.freeze({ ...tri(440, 440, 440), prometid: 44, duranium: 44, promerium: 6 }),
  Object.freeze({ ...tri(480, 480, 480), prometid: 48, duranium: 48, promerium: 6 }),
]);

function agatusTier(mapId) {
  const tier = AGATUS_TIERS[String(mapId || "").toLowerCase()];
  return tier == null ? 0 : tier;
}

// Reskins -> famille de base (le suffixe Gate est géré à part).
function stripReskin(type) {
  let base = String(type || "");
  base = base.replace(/^npc_Frozen_/, "npc_");
  base = base.replace(/^npc_Blighted_/, "npc_");
  base = base.replace(/^npc_Plagued_/, "npc_");
  base = base.replace(/_maudite\d*$/, "");
  base = base.replace(/_(Aberration|Oddity)$/, "");
  base = base.replace(/^npc_Awakened_/, "npc_");
  if (base === "npc_QQQ_Protegit") return "npc_Protegit";
  if (base === "npc_Lordakium_Spore") return "npc_Lordakium_Spore";
  if (base === "npc_Streuner_Guard_Turret" || base === "npc_Technician_Streuner" || base === "npc_Warrior_Streuner") return "npc_Streuner";
  if (/_Corrupted$/.test(base)) return base.replace(/_Corrupted$/, "");
  if (base === "npc_Reflector_Mimesis" || base === "npc_Reflector_Mimesi5") return "npc_Reflector_Mimesis";
  if (/Mimesi/.test(base)) return "npc_Hexor_Mimesis";
  if (/spire/i.test(base) || /Stalker/.test(base)) {
    return "npc_Kristallin";
  }
  return base;
}

function scaleCargo(cargo, mult, extra) {
  const out = {};
  for (const [id, amount] of Object.entries(cargo || {})) {
    const scaled = Math.floor(Number(amount) * mult);
    if (scaled > 0) out[id] = scaled;
  }
  for (const [id, amount] of Object.entries(extra || {})) {
    if (Number(amount) > 0) out[id] = Math.max(0, Math.floor(Number(out[id]) || 0) + Math.floor(Number(amount)));
  }
  return Object.freeze(out);
}

// Estimation par points de vie pour les NPC sans fiche (~).
export function fallbackCargoFor(type) {
  const cfg = NPC_TYPES[String(type || "")] || {};
  const durability = Math.max(0, Number(cfg.hp) || 0) + Math.max(0, Number(cfg.shield) || 0);
  const trio = Math.min(2000, Math.max(5, Math.round(durability / 60)));
  const out = { prometium: trio, endurium: trio, terbium: trio };
  const prime = Math.floor(trio / 10);
  if (prime > 0) {
    out.prometid = prime;
    out.duranium = prime;
  }
  const promerium = Math.floor(trio / 75);
  if (promerium > 0) out.promerium = promerium;
  if (/Boss|Uber/i.test(String(cfg.name || type))) {
    out.xenomit = Math.max(1, Math.floor(trio / 100));
  }
  return Object.freeze(out);
}

// Cargo minerais d'un NPC (objet gelé { resourceId: quantité }). mapId = pour Agatus/Spinel.
export function getNpcCargoOres(type, mapId = null) {
  let key = String(type || "");
  let gateMult = 1;
  const gate = key.match(/_(alpha|beta|gamma)$/);
  if (gate) {
    gateMult = gate[1] === "beta" ? 2 : gate[1] === "gamma" ? 3 : 1;
    key = key.slice(0, -gate[0].length);
  }
  if (key === "npc_Agatus") return scaleCargo(AGATUS_CARGO[agatusTier(mapId)], gateMult);
  if (key === "npc_Spinel") return scaleCargo(SPINEL_CARGO[agatusTier(mapId)], gateMult);
  // Indestructible / soute officielle 0.
  if (key === "npc_Spinelus" || key === "npc_Plutus_Turret") return Object.freeze({});
  key = stripReskin(key);
  if (BASE_CARGO[key]) return scaleCargo(BASE_CARGO[key], gateMult);
  if (BOSS_CARGO[key]) return scaleCargo(BOSS_CARGO[key], gateMult);
  if (UBER_CARGO[key]) return scaleCargo(UBER_CARGO[key], gateMult);
  let m = key.match(/^npc_Boss_(.+)$/);
  if (m) {
    const base = BASE_CARGO[`npc_${m[1]}`];
    if (base) return scaleCargo(base, 4 * gateMult);
    return scaleCargo(fallbackCargoFor(type), 4 * gateMult);
  }
  m = key.match(/^npc_Uber_(.+)$/);
  if (m) {
    const base = BASE_CARGO[`npc_${m[1]}`];
    if (base) return scaleCargo(base, 8 * gateMult);
    return scaleCargo(fallbackCargoFor(type), 8 * gateMult);
  }
  if (key === "npc_Sheer_Chaos_Interceptor") return scaleCargo(BASE_CARGO.npc_Interceptor, 8 * gateMult);
  if (key === "npc_Sheer_Chaos_Annihilator") return scaleCargo(BASE_CARGO.npc_Annihilator, 8 * gateMult);
  if (key === "npc_Sheer_Chaos_Protegit") return scaleCargo(BASE_CARGO.npc_Protegit, 8 * gateMult);
  if (key === "npc_Deadly_Battleray") return scaleCargo(BASE_CARGO.npc_Deadly_Battleray, gateMult);
  // Dernier recours : estimation par PV (aucun NPC ne rend les mains vides).
  return scaleCargo(fallbackCargoFor(type), gateMult);
}
