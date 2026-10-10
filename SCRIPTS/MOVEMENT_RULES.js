import { abilityShipKeyFor, getAbilitiesForShip, policeAbilityIds, abilityIconFile } from "../SHIP/SHIP_ABILITIES.js";
import { getShipDesignBaseId } from "../SHIP/SHIP_PACKS.js";
import { ANTICHEAT, acMoveTake, acRecordViolation } from "./ANTICHEAT.js";

// Valeurs des aptitudes effectivement branchees dans FRAME_SYSTEMS.
const rules = {
  "ability_lightning": { mult: 2, duration: 10, cooldown: 60 },
  "ability_citadel_travel": { mult: 2, duration: 5, cooldown: 60 },
  "ability_citadel-plus_travel": { mult: 2, duration: 5, cooldown: 60 },
  "ability_yamato_travel": { mult: 2, duration: 5, cooldown: 60 },
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

// true si la clé est une aptitude de mouvement gérée ici (vitesse/dash).
export function isMovementAbilityKey(key) {
  return !!rules[String(key || "").toLowerCase()];
}

// Un design hérite des aptitudes de sa coque (comme la palette cliente
// currentAbilityShipMatch) ; Police possède toutes les siennes via
// policeAbilityIds (getAbilitiesForShip("police") ne contient que le cloak).
// Source unique : MULTI_SERVER s'en sert aussi (ownsAbility).
let policeMoveSet = null;
export function shipOwnsAbility(shipId, skill) {
  const skid = String(shipId || "").toLowerCase();
  const sval = String(skill || "").toLowerCase();
  if (!skid || !sval) return false;
  if (skid === "police") {
    if (!policeMoveSet) policeMoveSet = new Set((policeAbilityIds() || []).map((s) => String(s).toLowerCase()));
    if (policeMoveSet.has(sval)) return true;
    // Variantes base/Plus partageant la même icône (dédupliquées côté
    // palette au profit de la plus forte) : même famille d'aptitude.
    // Ex : ability_citadel_travel quand le set garde la variante Plus.
    try {
      const want = String(abilityIconFile(sval) || "");
      if (want) {
        for (const owned of policeMoveSet) {
          if (String(abilityIconFile(owned) || "") === want) return true;
        }
      }
    } catch {}
    return false;
  }
  const keys = [abilityShipKeyFor(skid)];
  try {
    const base = getShipDesignBaseId(skid);
    if (base && base !== skid) keys.push(base);
  } catch {}
  return keys.some((k) => k && getAbilitiesForShip(k).some((a) => String(a?.id || "").toLowerCase() === sval));
}

// Effets mouvement actifs : state._moveEffects = { [abilityId]: {...} }.
// Plusieurs auras CUMULABLES (toggle Tartarus + Voyage...) : le
// multiplicateur est le PRODUIT, comme playerSlowMult côté client.
// (Avant : un seul _moveEffect, tout cumul rejeté -> rollbacks.)
export function activeMoveEffects(state, profile, now) {
  const map = state?._moveEffects;
  if (!map || typeof map !== "object" || !profile) return [];
  const out = [];
  for (const [key, e] of Object.entries(map)) {
    if (!e || typeof e !== "object") continue;
    if (!(now >= Number(e.from) && now < Number(e.until))) continue;
    if (!sameShip(e, profile)) continue;
    out.push({ key, ...e });
  }
  return out;
}

export function dashMoveEffect(state, profile, now) {
  return activeMoveEffects(state, profile, now).find((e) => e.dash) || null;
}

// Clé de cible du dash actif (pour résoudre l'objet cible côté serveur).
export function dashTargetKey(state, profile, now) {
  try { return String(dashMoveEffect(state, profile, now)?.targetKey || ""); } catch { return ""; }
}

export function usePhaseOut(state, profile, map, world, now, random = Math.random) {
  const key = "ability_mimesis_phase-out";
  if (!profile || state.pvpDead || !(state.hp > 0)
    || !shipOwnsAbility(profile.shipId, key)
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
  let mult = 1;
  for (const e of activeMoveEffects(state, profile, now)) mult *= Number(e.mult) || 1;
  const slow = now < Number(state.slowUntil || 0) ? Math.min(95, Math.max(0, Number(state.slowPct) || 0)) : 0;
  return Math.max(0, Math.floor(profile.speed) * mult * (1 - slow / 100));
}

// Integrer les changements de vitesse avec l'horloge serveur : un bonus
// expire ne donne pas sa vitesse au temps suivant (ni au temps precedent).
export function movementWindow(state, profile, now) {
  const from = Math.max(now - ANTICHEAT.MOVE_NETWORK_WINDOW_MS, Math.min(now, Number(state.moveBuckT ?? now)));
  const marks = [from, now];
  // Marques de TOUS les effets connus (même expirés : une fin de bonus dans
  // la fenêtre doit rester intégrée précisément).
  try {
    const map = state?._moveEffects;
    if (map && typeof map === "object") {
      for (const e of Object.values(map)) {
        if (!e || typeof e !== "object") continue;
        for (const time of [e.from, e.until]) {
          if (time > from && time < now) marks.push(time);
        }
      }
    }
  } catch {}
  for (const time of [state.slowUntil, state.freezeUntil]) {
    if (time > from && time < now) marks.push(time);
  }
  marks.sort((a, b) => a - b);
  let distance = 0, capacitySpeed = movementSpeed(state, profile, now);
  for (let i = 1; i < marks.length; i++) {
    const speed = movementSpeed(state, profile, (marks[i] + marks[i - 1]) / 2);
    capacitySpeed = Math.max(capacitySpeed, speed);
    distance += speed * (marks[i] - marks[i - 1]) / 1000;
  }
  // Grâce d'activation (ping) : effet démarré depuis < 1 s -> +250 ms de
  // SALLE d'acceptation au régime actuel pour les positions déjà en vol.
  // - check-only (allowance.grace) : n'alimente JAMAIS le seau ;
  // - consommée une fois par activation : une rafale ne la renouvelle pas ;
  // - rafales au même instant exclues ; toggles exclus.
  let grace = 0;
  try {
    const sinceLast = now - Number(state.moveBuckT ?? now);
    if (sinceLast > 0) {
      const marked = Number(state._moveGraceFrom ?? -1);
      for (const e of activeMoveEffects(state, profile, now)) {
        const r = rules[e.key];
        if (!r || r.toggle) continue;
        const from = Number(e.from);
        if (now - from < 1000 && from > marked) grace = Math.max(grace, capacitySpeed * 0.25);
      }
      if (grace > 0) {
        let maxFrom = marked;
        for (const e of activeMoveEffects(state, profile, now)) {
          const from = Number(e.from);
          if (now - from < 1000 && from > maxFrom) maxFrom = from;
        }
        state._moveGraceFrom = maxFrom;
      }
    }
  } catch {}
  // 1 % pour les coordonnees arrondies ; aucune marge permanente de 50 %.
  const blockedReason = state.pvpDead || !(state.hp > 0) ? "dead"
    : now < Number(state.freezeUntil || 0) ? "frozen" : null;
  return { distance: distance * 1.01, capacitySpeed, blockedReason, grace };
}

export function takeMovement(state, profile, x, y, now, target = null) {
  const dashEff = dashMoveEffect(state, profile, now);
  if (dashEff && target) {
    const dx = x - state.x, dy = y - state.y;
    const tx = target.x - state.x, ty = target.y - state.y;
    const length = Math.hypot(dx, dy), targetDistance = Math.hypot(tx, ty);
    // Le dash autorise une approche de la cible, pas un boost libre.
    // La marge laterale absorbe son mouvement entre deux snapshots.
    if (length > 4 && (dx * tx + dy * ty < 0
      || Math.abs(dx * ty - dy * tx) > targetDistance * (30 + length * 0.2))) {
      acRecordViolation(state, "movement", now, { reason: "Dash hors de la direction de sa cible",
        distance: Math.round(length), ability: dashEff.key, target: dashEff.targetKey });
      return { x: state.x, y: state.y, accepted: false };
    }
    // Dash validé : le saut vers la cible passe sans violation (salle
    // check-only, seau intact, pas de strike). Sans ça, le x5 est rejeté
    // par à-coups : rollbacks en plein dash.
    state.moveSpeed = movementSpeed(state, profile, now);
    state.vmax = state.moveSpeed;
    const w = movementWindow(state, profile, now);
    w.grace = Math.max(Number(w.grace) || 0, length);
    return acMoveTake(state, x, y, now, w);
  }
  state.moveSpeed = movementSpeed(state, profile, now);
  state.vmax = state.moveSpeed;
  return acMoveTake(state, x, y, now, movementWindow(state, profile, now));
}

export function stopMovementAbility(state, profile, now, key = null) {
  const map = state?._moveEffects;
  if (!map || typeof map !== "object") return;
  const keys = key ? [String(key).toLowerCase()] : Object.keys(map);
  for (const k of keys) {
    const effect = map[k];
    if (!effect) { delete map[k]; continue; }
    takeMovement(state, profile, state.x, state.y, now);
    const rule = rules[effect.key || k];
    const cooldowns = state._moveCooldowns || (state._moveCooldowns = {});
    if (rule && now < effect.until && !rule.toggle && !rule.cooldownFromStart) cooldowns[effect.key || k] = now + rule.cooldown * 1000;
    delete map[k];
  }
}

export function syncMovementAbility(state, profile, now, target = null) {
  const map = state?._moveEffects;
  if (!map || typeof map !== "object") return;
  const resolve = typeof target === "function" ? target : () => target;
  if (state.pvpDead || !(state.hp > 0)) {
    for (const k of Object.keys(map)) {
      try { stopMovementAbility(state, profile, now, k); } catch {}
    }
    return;
  }
  for (const [k, e] of Object.entries(map)) {
    if (!e || typeof e !== "object") { delete map[k]; continue; }
    if (!(now >= Number(e.from) && now < Number(e.until))) { delete map[k]; continue; }
    if (!sameShip(e, profile)) { delete map[k]; continue; }
    if (e.channel && (profile.config !== e.config || !(state.sh > 0))) {
      stopMovementAbility(state, profile, now, k);
      continue;
    }
    if (e.dash) {
      const t = resolve(e.targetKey);
      if (!t || !(t.hp > 0) || Math.hypot(t.x - state.x, t.y - state.y) <= 200) {
        stopMovementAbility(state, profile, now, k);
      }
    }
  }
}

export function useMovementAbility(state, profile, key, enabled, now, target = null, targetKey = "") {
  const rule = rules[key];
  if (!rule || !profile || !shipOwnsAbility(profile.shipId, key)) return false;
  const cooldowns = state._moveCooldowns || (state._moveCooldowns = {});
  const active = activeMoveEffects(state, profile, now);
  if (enabled === false) {
    if (!active.some((e) => e.key === key)) return false;
    stopMovementAbility(state, profile, now, key);
    if (rule.toggle) cooldowns[key] = now + rule.cooldown * 1000;
    return true;
  }
  if (state.pvpDead || !(state.hp > 0) || now < Number(cooldowns[key] || 0)
    || (rule.channel && !(state.sh > 0))) return false;
  // Re-clic de la même aptitude temporisée : no-op (comme le client).
  // Une AUTRE aptitude reste acceptée : les boosts se cumulent (produit).
  if (!rule.toggle && active.some((e) => e.key === key)) return false;
  if (rule.target && (!target || !(target.hp > 0) || target.id === state.id)) return false;
  if (rule.target && !rule.dash && Math.hypot(target.x - state.x, target.y - state.y) > profile.range) return false;
  takeMovement(state, profile, state.x, state.y, now); // regler le temps avant l'activation
  // Sleight poursuit une cible mobile jusqu'a l'arrivee ou l'annulation,
  // comme le client. Un temps estime sur sa position initiale le couperait
  // trop tot. La cible et la direction restent controlees a chaque position.
  const duration = rule.duration;
  const until = duration ? now + duration * 1000 : Infinity;
  const map = state._moveEffects && typeof state._moveEffects === "object" ? state._moveEffects : (state._moveEffects = {});
  map[key] = { from: now, until, mult: rule.mult, shipId: profile.shipId,
    hangarId: profile.hangarId, config: profile.config, channel: rule.channel, dash: rule.dash, targetKey };
  cooldowns[key] = rule.toggle || rule.cooldownFromStart ? now + rule.cooldown * 1000 : until + rule.cooldown * 1000;
  return true;
}
