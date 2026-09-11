// Données, niveaux et équipement du P.E.T / REX.
"use strict";

/**
 * P.E.T / REX — données inspirées du jeu officiel (DarkOrbitWiki / FAQ P.E.T 10).
 * Simplifié pour ce projet :
 * - 1 seul P.E.T par compte (achat boutique 10M), comme un vaisseau unique.
 * - Le P.E.T doit être possédé ET activé (bouton play) pour gagner de l'XP :
 *   +5 % de l'XP du vaisseau (quêtes, NPC, joueurs, gates — même source que les drones).
 * - Niveaux 0 → 20 avec les seuils officiels, puis un coût par niveau
 *   de 25 000 000 XP, augmenté de 15 % à chaque niveau supplémentaire.
 * - Sprite par palier : 0-3 Niveau1, 4-6 Niveau2, 7-9 Niveau3, 10-12 Niveau4,
 *   13-15 Niveau5, 16+ fusion Niveau6_5content.
 * - Équipement : 4 groupes (lasers / générateurs-boucliers / gears / protocoles),
 *   exclusif par hangar (vaisseau) et par config 1/2 — même pattern que les drones.
 * - Bonus / HP max officiels exposés (niveaux 0-20, plafonnés au-delà).
 */

// Seuils XP officiels par niveau (index = niveau). Source : DarkOrbitWiki P.E.T.
// Après le niveau 20 : coût exponentiel, sans plafond de niveau.
export const PET_MAX_LEVEL = 20;
export const PET_XP_POST20 = 25000000;
export const PET_XP_POST20_GROWTH = 1.15;
export const PET_XP_SHARE = 0.05;
// Carburant : 50 000 / 50 000 fixe pour le moment (fuel infini).
export const PET_FUEL_MAX = 50000;
// Modes officiels : passif (soutien) / combat (attaque).
export const PET_MODES = Object.freeze({ passive: "Passif", combat: "Mode combat" });
export function normalizePetMode(mode) {
  return mode === "combat" ? "combat" : "passive";
}
// Ancien format (1 seule liste "equipment") : conservé pour compat, le nouveau
// format utilise 4 groupes (lasers / générateurs / gears / protocoles).
export const PET_SLOTS = 2;
export const PET_SHOP_ICON = "/PET/PET_SPRITES/NIVEAU1/21.png";
export const PET_SPRITE_BASE = "/PET/PET_SPRITES/NIVEAU1/";

export const PET_LEVEL_XP = Object.freeze([
  0, 8000, 64000, 216000, 512000, 1000000, 1728000, 2744000, 4096000, 5832000,
  8000000, 10648000, 13824000, 17576000, 21952000, 27000000, 39000000,
  50000000, 70000000, 100000000, 150000000,
]);

// HP max officiels par niveau.
export const PET_LEVEL_HP = Object.freeze([
  50000, 60000, 70000, 80000, 90000, 100000, 110000, 120000, 130000, 140000,
  150000, 160000, 170000, 180000, 190000, 200000, 210000, 220000, 230000,
  240000, 250000,
]);

// Bonus officiels par niveau (affichage).
export const PET_LEVEL_BONUS = Object.freeze([
  "—",
  "Bouclier +2 %",
  "Dégâts +2 %",
  "Bouclier +4 %",
  "Accès équipement niveau 2",
  "Dégâts +4 %",
  "Bouclier +6 %",
  "Dégâts +6 %",
  "Accès équipement niveau 3",
  "Bouclier +8 %",
  "Dégâts +8 %",
  "Bouclier +10 %",
  "Dégâts +10 %",
  "Bouclier +12 %",
  "Dégâts +12 %",
  "Bouclier +14 %",
  "Dégâts +14 %",
  "Bouclier +16 %",
  "Dégâts +16 %",
  "Bouclier +18 %",
  "Accès équipement niveau 4",
]);

export function getPetLevel(experience) {
  const xp = Math.max(0, Math.min(Number.MAX_VALUE, Number(experience) || 0));
  let level = 0;
  for (let i = 1; i < PET_LEVEL_XP.length; i++) {
    if (xp >= PET_LEVEL_XP[i]) level = i;
    else break;
  }
  if (level >= PET_MAX_LEVEL) {
    const extra = (xp - PET_LEVEL_XP[PET_MAX_LEVEL]) / PET_XP_POST20;
    level = PET_MAX_LEVEL + Math.floor(
      Math.log1p(extra * (PET_XP_POST20_GROWTH - 1)) / Math.log(PET_XP_POST20_GROWTH)
    );
    // Corriger les arrondis du logarithme aux seuils exacts.
    while (level > PET_MAX_LEVEL && getPetLevelXp(level) > xp) level--;
    while (getPetLevelXp(level + 1) <= xp) level++;
  }
  return level;
}

// Seuil XP du niveau donné (pour la barre de progression du niveau en cours).
export function getPetLevelXp(level) {
  const l = Math.max(0, Math.floor(Number(level) || 0));
  if (l <= PET_MAX_LEVEL) return PET_LEVEL_XP[l];
  const extraLevels = l - PET_MAX_LEVEL;
  const cumulative = PET_XP_POST20 *
    (Math.expm1(extraLevels * Math.log(PET_XP_POST20_GROWTH)) / (PET_XP_POST20_GROWTH - 1));
  return PET_LEVEL_XP[PET_MAX_LEVEL] + Math.round(cumulative);
}

export function getPetNextLevelXp(level) {
  const l = Math.max(0, Math.floor(Number(level) || 0));
  return getPetLevelXp(l + 1);
}

export function getPetMaxHp(level) {
  const l = Math.max(0, Math.min(PET_MAX_LEVEL, Math.floor(Number(level) || 0)));
  return PET_LEVEL_HP[l] ?? PET_LEVEL_HP[0];
}

export function getPetLevelBonus(level) {
  const l = Math.max(0, Math.min(PET_MAX_LEVEL, Math.floor(Number(level) || 0)));
  return PET_LEVEL_BONUS[l] ?? "—";
}

export function getPetSpritePath(pet, frame = 21) {
  const f = Math.max(1, Math.min(32, Math.floor(Number(frame) || 21)));
  return `${getPetStageBase(getPetLevel(pet?.exp))}${f}.png`;
}

// Palier visuel par niveau : 0-3 Niveau1, 4-6 Niveau2, 7-9 Niveau3,
// 10-12 Niveau4, 13-15 Niveau5, 16+ fusion (Niveau6 par-dessus Niveau5).
export function getPetStage(level) {
  const l = Math.max(0, Math.floor(Number(level) || 0));
  if (l <= 3) return 1;
  if (l <= 6) return 2;
  if (l <= 9) return 3;
  if (l <= 12) return 4;
  if (l <= 15) return 5;
  return 6;
}

export function getPetStageBase(level) {
  const stage = getPetStage(level);
  return PET_STAGE_DIRS[Math.max(0, Math.min(PET_STAGE_DIRS.length - 1, stage - 1))];
}

// Tous les dossiers de sprites à précharger au chargement du jeu
// (Niveau1 → Niveau5 + fusion Niveau6_5content), 32 frames chacun.
export const PET_STAGE_DIRS = Object.freeze([
  "/PET/PET_SPRITES/NIVEAU1/",
  "/PET/PET_SPRITES/NIVEAU2/",
  "/PET/PET_SPRITES/NIVEAU3/",
  "/PET/PET_SPRITES/NIVEAU4/",
  "/PET/PET_SPRITES/NIVEAU5/",
  "/PET/PET_SPRITES/NIVEAU6_5/",
]);
export const PET_SPRITE_FRAMES = 32;

// Nombre d'emplacements officiels par niveau (index = niveau).
// Source : DarkOrbitWiki P.E.T (LASER / GENERATOR / GEARS / PROTOCOL).
export const PET_SLOT_TABLE = Object.freeze({
  lasers: Object.freeze([1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 9, 10, 10, 11, 11, 12, 12]),
  generators: Object.freeze([2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22]),
  gears: Object.freeze([1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6]),
  protocols: Object.freeze([2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12]),
});

export function getPetSlots(level) {
  const l = Math.max(0, Math.min(PET_MAX_LEVEL, Math.floor(Number(level) || 0)));
  return {
    lasers: PET_SLOT_TABLE.lasers[l],
    generators: PET_SLOT_TABLE.generators[l],
    gears: PET_SLOT_TABLE.gears[l],
    protocols: PET_SLOT_TABLE.protocols[l],
  };
}

// Bonus de niveau officiels (alternance bouclier / dégâts, +2 % par palier).
export function getPetDamageBonus(level) {
  return 2 * Math.floor(Math.max(0, Math.min(PET_MAX_LEVEL, Math.floor(Number(level) || 0))) / 2);
}

export function getPetShieldBonus(level) {
  return 2 * Math.ceil(Math.max(0, Math.min(PET_MAX_LEVEL, Math.floor(Number(level) || 0))) / 2);
}

export function emptyPetFit(level) {
  const slots = getPetSlots(level);
  return {
    lasers: Array(slots.lasers).fill(null),
    generators: Array(slots.generators).fill(null),
    gears: Array(slots.gears).fill(null),
    protocols: Array(slots.protocols).fill(null),
    ability: null,
  };
}

export function getPetShopIcon() {
  return PET_SHOP_ICON;
}

export const PET_DEFAULT_PSEUDO = "REX";

export function normalizePetPseudo(value, fallback = PET_DEFAULT_PSEUDO) {
  const next = String(value ?? "").trim();
  if (next.length >= 3 && next.length <= 32 && /^[\p{L}\p{N}_ -]+$/u.test(next)) return next;
  const fb = String(fallback ?? "").trim();
  if (fb.length >= 3 && fb.length <= 32 && /^[\p{L}\p{N}_ -]+$/u.test(fb)) return fb;
  return PET_DEFAULT_PSEUDO;
}

export function createPet(id = "niveau1", options = {}) {
  return {
    id: String(id || "niveau1"),
    owned: true,
    pseudo: normalizePetPseudo(options?.pseudo, PET_DEFAULT_PSEUDO),
    // Firme du REX : celle du pilote à l'achat (null = hérite du compte).
    faction: typeof options?.faction === "string" && options.faction ? String(options.faction) : null,
    level: 0,
    exp: 0,
    active: false,
    mode: "passive",
    hp: PET_LEVEL_HP[0],
    sh: null,
    fuel: PET_FUEL_MAX,
    fuelMax: PET_FUEL_MAX,
    fits: { 1: emptyPetFit(0), 2: emptyPetFit(0) },
    fit: emptyPetFit(0),
    fitsByHangar: {},
  };
}
