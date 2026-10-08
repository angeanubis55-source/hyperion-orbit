import { abilityShipKeyFor, getAbilitiesForShip } from "../SHIP/SHIP_ABILITIES.js";
import { ANTICHEAT, acMoveTake, acRecordViolation } from "./ANTICHEAT.js";

// Valeurs des aptitudes effectivement branchees dans FRAME_SYSTEMS.
const rules = {
  "ability_lightning": { mult: 2, duration: 10, cooldown: 60 },
  "ability_citadel_travel": { mult: 2, duration: 5, cooldown: 60 },
  "ability_citadel-plus_travel": { mult: 2, duration: 5, cooldown: 60 },
  "ability_holo_self-reversal": { mult: 1.1, duration: 15, cooldown: 15 },
  "ability_retiarus_spc": { mult: 1.1, duration: 10, cooldown: 240 },
  "ability_retiarus-plus_spcp": { mult: 1.2, duration: 10, cooldown: 240 },
  "ability_pusat-plus_speed-sap": { mult: 1.1, duration: 10, cooldown: 60, target: true },
  "ability_solace-plus_nano-cluster-repairer-plus": { mult: 2, duration: 1, cooldown: 90, cooldownFromStart: true },
  "ability_tartarus_speed-boost": { mult: 1.3, toggle: true, cooldown: 0 },
  "ability_tartarus-plus_speed-boost-plus": { mult: 1.45, toggle: true, cooldown: 10 },
  "ability_mimesis_scramble": { mult: 1.25, channel: true, cooldown: 300 },
  "ability_keres_sle": { mult: 5, dash: true, cooldown: 120, target: true },
};
const sameShip = (effect, profile) => effect?.shipId === profile.shipId && effect.hangarId === profile.hangarId;

export function usePhaseOut(state, profile, map, world, now, random = Math.random) {
  const key = "ability_mimesis_phase-out";
  if (!profile || state.pvpDead || !(state.hp > 0)
    || !getAbilitiesForShip(abilityShipKeyFor(profile.shipId)).some(a => a.id === key)
    || /low|uba/.test(map) || /^5(?:-|$|\.)/.test(map) || ["alpha", "beta", "gamma", "delta", "epsilon", "zeta", "kappa", "lambda", "kronos", "qz"].includes(map)
    || !(world?.w > 160) || !(world?.h > 160)) return null;
  const cooldowns = state._moveCooldowns || (state._moveCooldowns = {});
  if (now < Number(cooldowns[key] || 0)) return null;
  cooldowns[key] = now + 300000;
  const angle = random() * Math.PI * 2;
  return { x: Math.max(80, Math.min(world.w - 80, state.x + Math.cos(angle) * 500)),
    y: Math.max(80, Math.min(world.h - 80, state.y + Math.sin(angle) * 500)) };
}

export function movementSpeed(state, profile, now) {
  if (!profile || state.pvpDead || !(state.hp > 0) || now < Number(state.freezeUntil || 0)) return 0;
  const effect = state._moveEffect;
  const mult = sameShip(effect, profile) && now >= effect.from && now < effect.until ? effect.mult : 1;
  const slow = now < Number(state.slowUntil || 0) ? Math.min(95, Math.max(0, Number(state.slowPct) || 0)) : 0;
  return Math.max(0, Math.floor(profile.speed) * mult * (1 - slow / 100));
}

// Integrer les changements de vitesse avec l'horloge serveur : un bonus
// expire ne donne pas sa vitesse au temps suivant (ni au temps precedent).
export function movementWindow(state, profile, now) {
  const from = Math.max(now - ANTICHEAT.MOVE_NETWORK_WINDOW_MS, Math.min(now, Number(state.moveBuckT ?? now)));
  const marks = [from, now];
  for (const time of [state._moveEffect?.from, state._moveEffect?.until, state.slowUntil, state.freezeUntil]) {
    if (time > from && time < now) marks.push(time);
  }
  marks.sort((a, b) => a - b);
  let distance = 0, capacitySpeed = movementSpeed(state, profile, now);
  for (let i = 1; i < marks.length; i++) {
    const speed = movementSpeed(state, profile, (marks[i] + marks[i - 1]) / 2);
    capacitySpeed = Math.max(capacitySpeed, speed);
    distance += speed * (marks[i] - marks[i - 1]) / 1000;
  }
  // 1 % pour les coordonnees arrondies ; aucune marge permanente de 50 %.
  const blockedReason = state.pvpDead || !(state.hp > 0) ? "dead"
    : now < Number(state.freezeUntil || 0) ? "frozen" : null;
  return { distance: distance * 1.01, capacitySpeed, blockedReason };
}

export function takeMovement(state, profile, x, y, now, target = null) {
  const effect = state._moveEffect;
  if (effect?.dash && sameShip(effect, profile) && now < effect.until && target) {
    const dx = x - state.x, dy = y - state.y;
    const tx = target.x - state.x, ty = target.y - state.y;
    const length = Math.hypot(dx, dy), targetDistance = Math.hypot(tx, ty);
    // Le dash autorise une approche de la cible, pas un boost libre.
    // La marge laterale absorbe son mouvement entre deux snapshots.
    if (length > 4 && (dx * tx + dy * ty < 0
      || Math.abs(dx * ty - dy * tx) > targetDistance * (30 + length * 0.2))) {
      acRecordViolation(state, "movement", now, { reason: "Dash hors de la direction de sa cible",
        distance: Math.round(length), ability: effect.key, target: effect.targetKey });
      return { x: state.x, y: state.y, accepted: false };
    }
  }
  state.moveSpeed = movementSpeed(state, profile, now);
  state.vmax = state.moveSpeed;
  return acMoveTake(state, x, y, now, movementWindow(state, profile, now));
}

export function stopMovementAbility(state, profile, now) {
  const effect = state._moveEffect;
  if (!effect) return;
  takeMovement(state, profile, state.x, state.y, now);
  const rule = rules[effect.key];
  const cooldowns = state._moveCooldowns || (state._moveCooldowns = {});
  if (now < effect.until && !rule.toggle && !rule.cooldownFromStart) cooldowns[effect.key] = now + rule.cooldown * 1000;
  state._moveEffect = null;
}

export function syncMovementAbility(state, profile, now, target = null) {
  const effect = state._moveEffect;
  if (!effect) return;
  if (!sameShip(effect, profile) || state.pvpDead || !(state.hp > 0)
    || (effect.channel && (profile.config !== effect.config || !(state.sh > 0)))
    || (effect.dash && (!target || !(target.hp > 0) || Math.hypot(target.x - state.x, target.y - state.y) <= 200))) {
    stopMovementAbility(state, profile, now);
  }
}

export function useMovementAbility(state, profile, key, enabled, now, target = null, targetKey = "") {
  const rule = rules[key];
  if (!rule || !profile || !getAbilitiesForShip(abilityShipKeyFor(profile.shipId)).some(a => a.id === key)) return false;
  const cooldowns = state._moveCooldowns || (state._moveCooldowns = {});
  const effect = state._moveEffect;
  if (enabled === false) {
    if (effect?.key !== key) return false;
    stopMovementAbility(state, profile, now);
    if (rule.toggle) cooldowns[key] = now + rule.cooldown * 1000;
    return true;
  }
  if (state.pvpDead || !(state.hp > 0) || now < Number(cooldowns[key] || 0)
    || (effect && now < effect.until) || (rule.channel && !(state.sh > 0))) return false;
  if (rule.target && (!target || !(target.hp > 0) || target.id === state.id)) return false;
  if (rule.target && !rule.dash && Math.hypot(target.x - state.x, target.y - state.y) > profile.range) return false;
  takeMovement(state, profile, state.x, state.y, now); // regler le temps avant l'activation
  // Sleight poursuit une cible mobile jusqu'a l'arrivee ou l'annulation,
  // comme le client. Un temps estime sur sa position initiale le couperait
  // trop tot. La cible et la direction restent controlees a chaque position.
  const duration = rule.duration;
  const until = duration ? now + duration * 1000 : Infinity;
  state._moveEffect = { key, from: now, until, mult: rule.mult, shipId: profile.shipId,
    hangarId: profile.hangarId, config: profile.config, channel: rule.channel, dash: rule.dash, targetKey };
  cooldowns[key] = rule.toggle || rule.cooldownFromStart ? now + rule.cooldown * 1000 : until + rule.cooldown * 1000;
  return true;
}
