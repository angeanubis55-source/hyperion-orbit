// Gears passifs du P.E.T — définitions et helpers purs (sans DOM ni Canvas).
// Branchés dans ORBIT_ENGINE.updatePet via tickPetPassiveGears :
// - G-AL (al) : auto-collecte cargo + bonus boxes.
// - G-AR (ar) : auto-collecte minerais / ressources.
// - G-EL (el) : localisateur d'ennemis (minimap + marqueur monde).
// - G-REP (rep) : régénération coque du P.E.T.
// - G-KK (kk) : course suicide verrouillée (fonce sur la cible, colle 1 s, explose).
// Les autres gears actifs (tra...) sont branchés via applyPetModeValue
// en réutilisant getPetEquippedGearLevels().
"use strict";

// Portées par niveau de gear (index = niveau 1..3) : officielles pour
// l'auto-loot (G-AL / G-AR), divisées par 2 pour le localisateur (G-EL).
export const PET_GEAR_RANGES = Object.freeze({
  al: Object.freeze([700, 1500, 3000]),
  ar: Object.freeze([700, 1500, 3000]),
  el: Object.freeze([1000, 1500, 2500]),
});

// Régénération coque G-REP : % de la coque max par seconde (pallier d'1 s).
export const PET_GEAR_REPAIR_PCT = Object.freeze([3, 4, 5]);

// Recharge passive du bouclier : % du bouclier max par seconde (pallier d'1 s),
// comme la réparation du vaisseau.
export const PET_SHIELD_REGEN_PCT_PER_SEC = 5;

// Cargo Trader (G-TRA) : fenêtre commerce hors base, bonus de vente et cooldown par niveau.
export const PET_GEAR_TRADE_WINDOW_SEC = 10;
export const PET_GEAR_TRADE_COOLDOWN_SEC = Object.freeze([300, 120, 30]);
export const PET_GEAR_TRADE_BONUS_PCT = Object.freeze([5, 15, 30]);

// Flamme sacrificielle (G-FS, niveau unique) : transfère le bouclier du REX
// vers le vaisseau (tout si besoin), cooldown 90 s.
export const PET_GEAR_SACRIFICE_COOLDOWN_SEC = Object.freeze([90]);

// Kamikaze (G-KK) : le REX fonce sur sa cible verrouillée puis explose.
// Dégâts fixes + rayon + cooldown par niveau (voir CATALOG desc).
export const PET_GEAR_KAMIKAZE_DAMAGE = Object.freeze([25000, 50000, 75000]);
export const PET_GEAR_KAMIKAZE_RADIUS = Object.freeze([250, 350, 450]);
export const PET_GEAR_KAMIKAZE_COOLDOWN_SEC = Object.freeze([120, 60, 30]);

// Lien HP (G-HPL, niveau unique) : dégâts coque redirigés vers le REX,
// durée 20 s, cooldown 240 s. Mixé au mode combat + éclair entre les deux.
export const PET_GEAR_HPLINK_DURATION_SEC = 20;
export const PET_GEAR_HPLINK_COOLDOWN_SEC = 240;

// Bouées (G-BC combat / G-BH coque, niveau unique) : le REX colle le joueur
// en passif, halo continu de 500. Dedans : +5 % dégâts (rouge) / +5 % PV max (vert).
// Durée 120 s, cooldown 240 s.
export const PET_BUOY_RADIUS = 500;
export const PET_BUOY_DURATION_SEC = 120;
export const PET_BUOY_COOLDOWN_SEC = 240;
export const PET_BUOY_DAMAGE_PCT = 5;
export const PET_BUOY_HP_PCT = 5;

// Types de collectables aspirés par G-AL (cargo, bonus boxes, scrap,
// mucosum, plasmide, prismatium — hors green).
export const PET_GEAR_AUTOLOOT_TYPES = Object.freeze([
  "Cargo_Box",
  "Bonus_Box",
  "Astral_Prime_Box",
  "Scrap_Box",
  "Mucosum_Box",
  "Plasmide_Box",
  "Prismatium_Box",
]);

// Types de collectables aspirés par G-AR (minerais + ressources d'assemblage).
export const PET_GEAR_ORE_TYPES = Object.freeze([
  "Palladium_Ore",
  "Hybrid_Alloy_Box",
  "Scrap_Box",
  "Mucosum_Box",
  "Plasmide_Box",
  "Prismatium_Box",
  "Aurus_Box",
  "Bifenon_Box",
  "Tetrathrin_Box",
  "Kyhalon_Box",
]);

// Cadences (anti-rafale) : 1 collecte toutes les 0,3 s, 1 scan locator toutes les 0,5 s.
export const PET_GEAR_PICK_DELAY = 0.3;
export const PET_GEAR_LOCATOR_DELAY = 0.5;

/**
 * Niveaux équipés par clé de gear (meilleur niveau par famille).
 * @param {object} fit - fit P.E.T ({ gears: [...] }).
 * @param {function} findItem - résolveur d'item catalogue (id -> item).
 * @returns {object} ex : { al: 2, ar: 0, el: 1, rep: 3 } (0 = absent).
 */
export function getPetEquippedGearLevels(fit, findItem) {
  const levels = { al: 0, ar: 0, el: 0, rep: 0, kk: 0, tra: 0, fs: 0, hpl: 0, bc: 0, bh: 0 };
  if (!fit || typeof findItem !== "function") return levels;
  for (const itemId of fit.gears || []) {
    if (!itemId) continue;
    let item = null;
    try {
      item = findItem(itemId);
    } catch {
      item = null;
    }
    const gear = item?.petGear;
    if (!gear || typeof gear.key !== "string") continue;
    const key = gear.key.toLowerCase();
    if (!(key in levels)) continue;
    const level = Math.max(0, Math.floor(Number(gear.level) || 0));
    if (level > levels[key]) levels[key] = level;
  }
  return levels;
}

export function getPetGearRange(key, level) {
  const table = PET_GEAR_RANGES[String(key || "").toLowerCase()];
  if (!table) return 0;
  const l = Math.max(1, Math.min(table.length, Math.floor(Number(level) || 0)));
  if (!(Number(level) >= 1)) return 0;
  return table[l - 1];
}

export function getPetRepairPct(level) {
  const l = Math.floor(Number(level) || 0);
  if (l < 1) return 0;
  return PET_GEAR_REPAIR_PCT[Math.min(l, PET_GEAR_REPAIR_PCT.length) - 1];
}

export function getPetTradeCooldownSec(level) {
  const l = Math.floor(Number(level) || 0);
  if (l < 1) return 0;
  return PET_GEAR_TRADE_COOLDOWN_SEC[Math.min(l, PET_GEAR_TRADE_COOLDOWN_SEC.length) - 1];
}

export function getPetTradeBonusPct(level) {
  const l = Math.floor(Number(level) || 0);
  if (l < 1) return 0;
  return PET_GEAR_TRADE_BONUS_PCT[Math.min(l, PET_GEAR_TRADE_BONUS_PCT.length) - 1];
}

export function getPetSacrificeCooldownSec(level) {
  const l = Math.floor(Number(level) || 0);
  if (l < 1) return 0;
  return PET_GEAR_SACRIFICE_COOLDOWN_SEC[Math.min(l, PET_GEAR_SACRIFICE_COOLDOWN_SEC.length) - 1];
}

export function getPetKamikazeDamage(level) {
  const l = Math.floor(Number(level) || 0);
  if (l < 1) return 0;
  return PET_GEAR_KAMIKAZE_DAMAGE[Math.min(l, PET_GEAR_KAMIKAZE_DAMAGE.length) - 1];
}

export function getPetKamikazeRadius(level) {
  const l = Math.floor(Number(level) || 0);
  if (l < 1) return 0;
  return PET_GEAR_KAMIKAZE_RADIUS[Math.min(l, PET_GEAR_KAMIKAZE_RADIUS.length) - 1];
}

export function getPetKamikazeCooldownSec(level) {
  const l = Math.floor(Number(level) || 0);
  if (l < 1) return 0;
  return PET_GEAR_KAMIKAZE_COOLDOWN_SEC[Math.min(l, PET_GEAR_KAMIKAZE_COOLDOWN_SEC.length) - 1];
}

/**
 * Plus proche élément d'une liste dans la portée (distance euclidienne).
 * @returns {object|null} l'élément le plus proche, ou null.
 */
export function pickNearestWithin(list, x, y, range, isEligible) {
  if (!Array.isArray(list) || !(range > 0)) return null;
  const rangeSq = range * range;
  let best = null;
  let bestSq = Infinity;
  for (const entry of list) {
    if (!entry || !Number.isFinite(entry.x) || !Number.isFinite(entry.y)) continue;
    if (typeof isEligible === "function" && !isEligible(entry)) continue;
    const dx = entry.x - x;
    const dy = entry.y - y;
    const d2 = dx * dx + dy * dy;
    if (d2 <= rangeSq && d2 < bestSq) {
      bestSq = d2;
      best = entry;
    }
  }
  return best;
}

const PET_GEAR_SHORT_LABELS = Object.freeze({
  al: "G-AL",
  ar: "G-AR",
  el: "G-EL",
  rep: "G-REP",
  kk: "G-KK",
  tra: "G-TRA",
  fs: "G-FS",
  hpl: "G-HPL",
  bc: "G-BC",
  bh: "G-BH",
});

// Familles de gears passifs sélectionnables (un seul actif à la fois).
export const PET_PASSIVE_GEAR_KEYS = Object.freeze(["al", "ar", "el", "rep", "kk", "tra", "fs", "hpl", "bc", "bh"]);

/**
 * Gears équipés pour le sélecteur : [{ key, level, label }],
 * avec le nom boutique de l'item équipé (ex : "G-AL3 · Auto-Loot").
 */
export function listEquippedGearOptions(fit, findItem) {
  const best = new Map();
  if (!fit || typeof findItem !== "function") return [];
  for (const itemId of fit.gears || []) {
    if (!itemId) continue;
    let item = null;
    try {
      item = findItem(itemId);
    } catch {
      item = null;
    }
    const key = String(item?.petGear?.key || "").toLowerCase();
    if (!PET_PASSIVE_GEAR_KEYS.includes(key)) continue;
    const level = Math.floor(Number(item.petGear.level) || 0);
    if (level <= 0) continue;
    const prev = best.get(key);
    if (!prev || level > prev.level) {
      best.set(key, {
        key,
        level,
        label: String(item.name || `${PET_GEAR_SHORT_LABELS[key]}${level}`),
      });
    }
  }
  return PET_PASSIVE_GEAR_KEYS.filter((k) => best.has(k)).map((k) => best.get(k));
}

/** Libellés courts des gears actifs pour la fenêtre P.E.T ("G-REP2 · G-AL1"). */
export function describePetGears(levels) {
  if (!levels || typeof levels !== "object") return "—";
  const parts = [];
  for (const key of Object.keys(PET_GEAR_SHORT_LABELS)) {
    const level = Math.floor(Number(levels[key]) || 0);
    if (level > 0) parts.push(`${PET_GEAR_SHORT_LABELS[key]}${level}`);
  }
  return parts.length ? parts.join(" · ") : "—";
}
