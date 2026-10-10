// Profil calculé depuis le compte sauvegardé, jamais depuis un paquet pos.
// L'intégrité des achats/inventaires relève de la migration économique.
import { computeHangarStats } from "../SHIP/SHIP_HANGARS.js";
import { getShipDesignBaseId, getShipPackById } from "../SHIP/SHIP_PACKS.js";
import { activeBoosterMults, GROUP_BOOSTER_BONUS } from "../SRC/DATA/BOOSTERS.js";
import { pilotSkillMults } from "../SRC/DATA/PILOT_SKILLS.js";
import { UPGRADE_ORE_BONUS } from "../SRC/DATA/RESOURCES.js";
import { findCatalogItem } from "../SRC/CORE/CATALOG.js";
import { getPetVitalLimits } from "../PET/PET_VITALS.js";
import { ROCKET_TYPES } from "../COMBAT/ROCKET_TYPES.js";
import { abilityShipKeyFor, getAbilitiesForShip } from "../SHIP/SHIP_ABILITIES.js";
import { acBucket } from "./ANTICHEAT.js";

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, Number(v) || 0));
const pct = (v) => 1 + Math.max(0, Number(v) || 0) / 100;

export function combatProfile(user, mapId, configNo = null, groupBoosters = {}) {
  const saved = user?.hangars?.find(h => h?.active) || user?.hangars?.[0];
  if (!saved) return null;
  const hangar = { ...saved, activeConfig: configNo === 2 ? 2 : configNo === 1 ? 1 : saved.activeConfig };
  const ship = getShipPackById(hangar.shipId);
  if (!ship) return null;
  const baseId = String(getShipDesignBaseId(ship.id) || ship.id).toLowerCase();
  const stats = computeHangarStats(hangar, user, { mapId });
  const boost = activeBoosterMults(user.boosters);
  const boosterKeys = { hpPct: "hp", shieldPct: "shield", dmgPct: "dmg" };
  for (const [id, count] of Object.entries(groupBoosters)) {
    for (const [effect, value] of Object.entries(GROUP_BOOSTER_BONUS[id] || {})) {
      if (boosterKeys[effect]) boost[boosterKeys[effect]] += value * clamp(count, 0, 9) / 100;
    }
  }
  const pilot = pilotSkillMults(user.pilotSkills);
  const upgrade = (slot) => Number(user.upgrades?.[slot]?.stock) > 0
    ? 1 + Math.max(0, Number(UPGRADE_ORE_BONUS[user.upgrades[slot].ore]?.[slot]) || 0) : 1;
  const hpMax = Math.floor(((Number(ship.hp) || 1) + (baseId === "police" ? 0 : 100000)
    + (Number(stats.bonusFlatHP) || 0) + pilot.hpFlat) * Math.max(0, 1 + stats.bonusHPPct / 100) * boost.hp);
  const shMax = Math.floor(stats.bonusShield * boost.shield * pct(pilot.shieldPct) * upgrade("shield"));
  const osl = stats.laserMods.filter(m => Number(m.critPct) > 0).length;
  // Enveloppe des impacts existants : munitions jusqu'à x8 et bonus
  // temporaires/conditionnels. Le protocole historique prédit les impacts
  // côté client ; ce plafond ne remplace pas une simulation des tirs.
  const conditional = [...stats.laserMods, ...stats.droneLaserMods].reduce((sum, m) =>
    sum + Math.max(0, Number(m.damage) || 0) * Math.max(0, (Number(m.vsMult) || 1) - 1)
      + Math.max(0, Number(m.overdrive) || 0), 0);
  const laser = (stats.totalLaserDamage + conditional) * boost.dmg * pct(pilot.alienDmgPct) * upgrade("laser");
  const rocketIds = Object.keys(ROCKET_TYPES).filter(key => Number(user.rockets?.[key]) > 0);
  const rocket = rocketIds.reduce((max, key) => Math.max(max, Number(ROCKET_TYPES[key].damage) || 0,
    Number(ROCKET_TYPES[key].effect?.shieldDrain) || 0), 0) * boost.dmg * pct(pilot.rocketDmgPct) * upgrade("rocket");
  const cfg = String(Number(hangar.activeConfig) === 2 ? 2 : 1);
  const pet = user.pet;
  const petFit = pet?.fitsByHangar?.[hangar.id]?.[cfg] || pet?.fits?.[cfg] || pet?.fit || {};
  const petLimits = getPetVitalLimits(pet, user, hangar);
  const petDamage = (petFit.lasers || []).reduce((sum, id) => sum + (Number(findCatalogItem(id)?.module?.damage) || 0), 0);
  const fit = hangar.fits?.[cfg] || hangar.fit || {};
  const abilities = getAbilitiesForShip(abilityShipKeyFor(ship.id));
  return {
    shipId: ship.id, baseId, hangarId: String(hangar.id), config: Number(cfg),
    hpMax: clamp(hpMax, 1, 1e9), shMax: clamp(shMax, 0, 1e9),
    speed: clamp((ship.speed + stats.bonusSpeed) * upgrade("speed") * stats.speedMult, 50, 1500),
    range: 1400, // couvre le doublement de portée des aptitudes existantes
    absorb: clamp((stats.bonusAbsorb > 0 ? stats.bonusAbsorb / 100 : 0.8)
      + Number(stats.formationEffects?.shieldAbsorptionPct || 0) / 100, 0, 1),
    evade: clamp((stats.bonusEvasionPct + pilot.evadePct + Number(stats.formationEffects?.evasionPct || 0)) / 100, 0, 0.9),
    penetration: clamp(stats.bonusPenetrationPct / 100, 0, 1),
    critChance: osl ? 0.05 + (3 * osl) / 100 : 0.05,
    critMult: osl ? 2 : 1.5,
    maxDamage: clamp(Math.max(laser * 8 * 4, rocket * 10, petDamage * 8 * 4,
      // SMB + impacts des aptitudes : enveloppe compatible avec les coques.
      50000, hpMax * 0.25), 1, 1e8),
    rocketIds,
    cloakSkill: abilities.find(a => /cloak/.test(a.id)) || null,
    petOwned: !!pet?.owned,
    // Le PET et les deux clones de Triple barrage peuvent recolter ensemble.
    petCollectors: pet?.owned ? (abilities.some(a => a.id === "ability_zephyr_tbr") ? 3 : 1) : 0,
    petHpMax: pet?.owned ? clamp(petLimits.hpMax, 1, 5e7) : 0,
    petShMax: pet?.owned ? clamp(petLimits.shMax, 0, 5e7) : 0,
  };
}

// Ne copie jamais les coefficients, critiques ou effets arbitraires du
// client. Les effets de roquette viennent de la définition serveur.
export function validateCombatHit(profile, message, state = null, now = Date.now()) {
  if (!profile || !message) return null;
  const dmg = Number(message.dmg);
  if (!Number.isFinite(dmg) || dmg < 0 || dmg > profile.maxDamage) return null;
  const hit = { uid: message.uid, target: message.target, dmg,
    kind: message.kind === "sab" ? "sab" : "direct",
    pen: profile.penetration, critChance: profile.critChance, critMult: profile.critMult,
    weaken: 0, slowPct: 0, slowSec: 0, freezeSec: 0 };
  const rocketKey = String(message.rocket || "");
  if (rocketKey) {
    if (!profile.rocketIds.includes(rocketKey) && !(now < Number(state?._launchedRocketIds?.[rocketKey] || 0))) return null;
    const effect = ROCKET_TYPES[rocketKey]?.effect || {};
    hit.pen = effect.pierceShield ? 1 : effect.piercePct ?? profile.penetration;
    hit.slowPct = effect.slowPct || 0;
    hit.slowSec = effect.duration || 0;
    hit.freezeSec = effect.freezeSec || 0;
    if (state && (hit.slowPct > 0 || hit.freezeSec > 0)
      && !acBucket(state, `Control:${rocketKey}`, now, 1, 1 / Math.max(1, ROCKET_TYPES[rocketKey].cooldown), 1)) return null;
  }
  if (dmg === 0 && !(hit.slowPct > 0 && hit.slowSec > 0) && !(hit.freezeSec > 0)) return null;
  return hit;
}
