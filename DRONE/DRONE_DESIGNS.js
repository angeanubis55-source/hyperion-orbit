"use strict";

const design = (id, name, sprite, effects) => Object.freeze({
  id, name, itemId: `drone_design_${id}`,
  icon: `DRONE/DRONE_SPRITES/CPU_DRONES/${id.toUpperCase()}.png`,
  shopIcon: `DRONE/DRONE_SPRITES/SHOP/${id.toUpperCase()}.png`,
  sprite: `DRONE/DRONE_SPRITES/ZEUS_APIS_IRIS_${sprite}_LVL_`,
  effects: Object.freeze(effects),
});

export const DRONE_DESIGNS = Object.freeze({
  havoc: design("havoc", "Havoc", "HAVOK", { damagePct: 1 }),
  hermes: design("hermes", "Hermes", "HERMES", { cooldownPct: 1 }),
  hercules: design("hercules", "Hercules", "HERCULES", { shieldPct: 2, hpPct: 2 }),
  admin: design("admin", "ADMIN", "ADMIN", { damagePct: 1, hpPct: 1, cooldownPct: 1, evasionPct: 1 }),
  saturn: design("saturn", "SATURN", "SATURN", { hpPct: 2.5, laserHitPct: 2.5, rocketHitPct: 2.5 }),
});

export function getDroneDesign(value) {
  if (value && typeof value === "object") return getDroneDesign(value.id) || getDroneDesign(value.name);
  const key = String(value || "").toLowerCase().replace(/^(?:drone_design_|cpu_drone_|cpu_)/, "");
  const aliases = { havok: "havoc", green: "admin", gold: "saturn", white_turquoise: "hermes" };
  return DRONE_DESIGNS[aliases[key] || key] || null;
}

export function getDroneFitForHangar(drone, hangarId, configNo = 1) {
  const cfg = Number(configNo) === 2 ? "2" : "1";
  const hid = hangarId == null ? null : String(hangarId);
  const perHangar = drone?.fitsByHangar;
  if (hid && perHangar && Object.keys(perHangar).length) {
    return perHangar[hid]?.[cfg] || { equipment: [], ability: null };
  }
  return drone?.fits?.[cfg] || drone?.fit || { equipment: [], ability: null };
}

export function getDroneDesignBonuses(user, hangarId, configNo = 1, fitForDrone = null) {
  const effects = { damagePct: 0, shieldPct: 0, hpPct: 0, cooldownPct: 0, evasionPct: 0, laserHitPct: 0, rocketHitPct: 0 };
  const counts = Object.fromEntries(Object.keys(DRONE_DESIGNS).map(id => [id, 0]));
  for (const drone of user?.drones?.items || []) {
    const fit = fitForDrone ? fitForDrone(drone) : getDroneFitForHangar(drone, hangarId, configNo);
    const selected = getDroneDesign(fit?.ability);
    if (!selected) continue;
    counts[selected.id]++;
    for (const [key, amount] of Object.entries(selected.effects)) effects[key] += amount;
  }
  return { counts, effects };
}

export function droneDesignBonusLabel(value, bonuses) {
  const selected = getDroneDesign(value);
  if (!selected) return "Aucun bonus";
  const labels = { damagePct: "dégâts bonus", hpPct: "PV bonus", shieldPct: "bouclier bonus",
    cooldownPct: "recharge en moins", evasionPct: "évasion bonus", laserHitPct: "précision laser bonus", rocketHitPct: "précision roquettes bonus" };
  return Object.keys(selected.effects).map(key => `${Number(bonuses?.effects?.[key] || 0).toLocaleString("fr-FR")} % ${labels[key]}`).join(" · ");
}

export function droneDesignCooldown(seconds, reductionPct = 0) {
  return Math.max(0, Number(seconds) || 0) * Math.max(0.1, 1 - Math.max(0, Number(reductionPct) || 0) / 100);
}

export function profileAbilityCooldown(seconds, profile) {
  const mult = Number(profile?.abilityCooldownMult);
  return Math.max(0, Number(seconds) || 0) * (Number.isFinite(mult) && mult > 0 ? mult : 1);
}

export function droneIndicatorColor(drone) {
  const colors = { havoc: 'rgb(255,45,55)', hercules: 'rgb(30,144,255)', admin: 'rgb(70,220,100)', saturn: 'rgb(255,215,70)', hermes: 'rgb(180,255,245)' };
  return colors[getDroneDesign(drone?.fit?.ability)?.id] || (drone?.type === 'apis' ? 'rgb(90,180,255)' : drone?.type === 'zeus' ? 'rgb(174,190,75)' : 'rgb(255,255,255)');
}
