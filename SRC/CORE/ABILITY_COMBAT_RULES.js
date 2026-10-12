// Règles des impacts d'aptitude partagées, indépendantes du rendu.
import { profileAbilityCooldown } from "../../DRONE/DRONE_DESIGNS.js";
export const ABILITY_DAMAGE_RULES = Object.freeze({
  ability_cyborg_singularity: { start: 6900, step: 300, cap: 13600, duration: 30, directHp: true, execute: 150000, range: Infinity },
  ability_venom: { start: 1500, step: 200, cap: 8500, duration: 35, directHp: true, execute: 100000, range: Infinity },
  "ability_hecate_particle-beam": { start: 8050, step: 6000, duration: 5, directHp: true, range: 1000 },
  "ability_hecate-plus_particle-beam-plus": { start: 10000, step: 6000, duration: 6, directHp: true, range: 1000 },
  ability_solaris_inc: { start: 25000, duration: 3, radius: 600, final: 75000 },
  "ability_solaris-plus_incinerate-plus": { start: 50000, duration: 3, radius: 800, final: 75000 },
  ability_paladin_ripper: { start: 10000, laserMult: 3, duration: 3, radius: 600 },
  "ability_basilisk_noxious-nebula": { start: 14000, stack: 0.05, duration: 10, radius: 500, zone: true },
});

export const CHARGED_SHOTS = new Set(["ability_retiarus_chs", "ability_retiarus-plus_chsp"]);
export function isAbilityDamage(key) { return !!ABILITY_DAMAGE_RULES[key] || CHARGED_SHOTS.has(key) || key === "ability_hyperion_qa"; }
export function unlimitedAbilityRange(key) { return CHARGED_SHOTS.has(key) || ABILITY_DAMAGE_RULES[key]?.range === Infinity; }
export function hostileAbility(key, info) {
  if (key === "ability_berserker_rvg" || key === "ability_berserker_shl") return false;
  return isAbilityDamage(key) || info?.target === "enemy" || /_draw-fire$|_jam-x$|_jamx-creed$/.test(key);
}

// L'horloge et le compteur du cast appartiennent au serveur. Un tick direct
// ne reprend jamais les critiques ni la pénétration d'un laser ordinaire.
export function validateAbilityDamage(profile, message, state, target, now) {
  const key = String(message.ability || "");
  const raw = Number(message.dmg), targetId = String(message.target || message.uid || "");
  if (!target || !(target.hp > 0) || !Number.isFinite(raw) || !(raw > 0)) return null;
  if (CHARGED_SHOTS.has(key)) {
    const win = state?._execWindow;
    if (!win || win.key !== key || win.target !== targetId || win.used || now + 100 < win.readyAt || now >= win.until) return null;
    const cap = Math.ceil((Number(target.hp) + Math.max(0, Number(target.sh) || 0)) * 1.1);
    win.used = true;
    state._abilityCds[key] = now + profileAbilityCooldown(key === "ability_retiarus_chs" ? 1200 : 1080, profile) * 1000;
    return { uid: message.uid, target: message.target, ability: key, dmg: Math.min(raw, cap), kind: "direct", pen: 1, critChance: 0, critMult: 1, variance: 0, execOk: true };
  }
  const rule = ABILITY_DAMAGE_RULES[key], fx = state?._abilityFx?.[key];
  if (!rule || !fx || !(now < fx.until + 2000) || now < fx.from || (fx.target && fx.target !== targetId)) return null;
  const ox = rule.zone ? fx.x : state.x, oy = rule.zone ? fx.y : state.y;
  if (Math.hypot(Number(target.x) - ox, Number(target.y) - oy) > (rule.radius || rule.range || profile.range)) return null;
  const ticks = fx.damageTicks || (fx.damageTicks = {});
  const tick = ticks[targetId] || { count: 0, last: -Infinity, final: false, executed: false };
  // Une exécution doit réellement être sous le seuil sur le serveur.
  const execution = rule.execute && raw > rule.cap;
  const final = rule.final && raw === rule.final;
  if (execution) {
    if (tick.executed || target.hp >= rule.execute || now + 200 < fx.until) return null;
    tick.executed = true;
  } else if (final) {
    if (tick.final || now + 200 < fx.until) return null;
    tick.final = true;
  } else {
    const immediate = rule.directHp ? 1 : 0;
    const allowed = Math.min(Math.ceil((fx.until - fx.from) / 1000) + immediate, 1 + Math.floor((now - fx.from + 200) / 1000));
    if (tick.count >= allowed || now - tick.last < 750) return null;
    let amount = (rule.start + (rule.step || 0) * tick.count + (rule.laserMult || 0) * (profile.laserDamage || 0));
    if (rule.cap) amount = Math.min(rule.cap, amount);
    if (rule.stack) amount = rule.start * (1 + rule.stack) ** tick.count;
    if (raw > Math.ceil(amount) + 1) return null;
    tick.count++;
    tick.last = now;
  }
  ticks[targetId] = tick;
  return { uid: message.uid, target: message.target, ability: key, dmg: execution ? Number(target.hp) : raw,
    kind: "direct", pen: rule.directHp ? 1 : profile.penetration,
    critChance: 0, critMult: 1, variance: 0, execOk: !!execution, abilityFinal: !!final };
}

export function activeAbility(state, key, now) {
  const fx = state?._abilityFx?.[key];
  return fx && fx.from <= now && fx.until > now && !(now < Number(state._jamUntil)) ? fx : null;
}
export function abilitySpeedMult(state, now) {
  let mult = 1;
  if (activeAbility(state, "ability_berserker_rvg", now)) mult *= 0.95;
  if (activeAbility(state, "ability_sentinel", now)) mult *= 0.7;
  if (activeAbility(state, "ability_hecate_particle-beam", now) || activeAbility(state, "ability_hecate-plus_particle-beam-plus", now)) mult *= 0.9;
  const charge = state?._execWindow;
  if (charge && !charge.used && now < charge.readyAt) mult *= charge.key === "ability_retiarus_chs" ? 0.5 : 0.75;
  return mult;
}
export function fortifyActive(state, now) {
  return activeAbility(state, "ability_citadel_fortify", now) || activeAbility(state, "ability_citadel-plus_fortify", now);
}
