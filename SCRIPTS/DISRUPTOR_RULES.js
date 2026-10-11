import { ROCKET_TYPES } from "../COMBAT/ROCKET_TYPES.js";

export const DDOL_ACCURACY_PENALTY = ROCKET_TYPES.pld8.effect.accuracyPenaltyPct;

// Une réduction unique, même si plusieurs Disruptor visent la même cible.
// Le maximum retiré revient à la fin, sans effacer les dégâts reçus.
export function syncDisarrayShield(state, baseMax, until, now) {
  const base = Math.max(0, Number(baseMax) || 0);
  const previous = Number(state._disarrayRemoved) || 0;
  const removed = until > now && state.hp > 0 ? Math.floor(base / 2) : 0;
  state.shMax = base - removed;
  if (removed > previous) state.sh = Math.min(Number(state.sh) || 0, state.shMax);
  else if (removed < previous && state.hp > 0) {
    state.sh = Math.min(state.shMax, (Number(state.sh) || 0) + previous - removed);
  }
  if (previous !== removed) state._disarraySeq = (Number(state._disarraySeq) || 0) + 1;
  state._disarrayRemoved = removed;
  state._disarrayUntil = until;
  state.sh = Math.max(0, Math.min(state.shMax, Number(state.sh) || 0));
}

export function syncDisruptorEffects(room, sim, now) {
  const effects = new Map();
  for (const { state } of room.values()) {
    if (!state || state.dead || state.pvpDead || !(state.hp > 0)) continue;
    for (const [skill, fx] of Object.entries(state._abilityFx || {})) {
      if (!skill.startsWith("ability_disruptor_") || !fx.target || !(fx.until > now)) continue;
      const effect = effects.get(fx.target) || { ddol: 0, silence: 0, disarray: 0 };
      if (skill === "ability_disruptor_ddol") effect.ddol = Math.max(effect.ddol, fx.until);
      if (skill === "ability_disruptor_redirect") effect.silence = Math.max(effect.silence, Number(fx.from) + 4000);
      if (skill === "ability_disruptor_shield-disarray") effect.disarray = Math.max(effect.disarray, fx.until);
      effects.set(fx.target, effect);
    }
  }
  const update = (state, id, baseMax) => {
    const effect = effects.get(String(id));
    state._ddolUntil = effect?.ddol || 0;
    state._redirectSilenceUntil = effect?.silence || 0;
    syncDisarrayShield(state, baseMax, effect?.disarray || 0, now);
  };
  for (const [id, { state }] of room) {
    if (state) update(state, id, state._abilityShieldMax ?? state._combat?.shMax ?? ((Number(state.shMax) || 0) + (Number(state._disarrayRemoved) || 0)));
  }
  for (const [id, npc] of sim?.entries || []) {
    update(npc, id, (Number(npc.shMax) || 0) + (Number(npc._disarrayRemoved) || 0));
  }
}

export function laserDisrupted(state, hit, now) {
  if (hit.rocket || hit.ability) return false;
  if (now < Number(state._redirectSilenceUntil || 0)) return true;
  const penalty = Math.max(now < Number(state._ddolUntil || 0) ? DDOL_ACCURACY_PENALTY : 0,
    now < Number(state.accuracyUntil || 0) ? Number(state.accuracyPenaltyPct) || 0 : 0);
  return penalty > 0 && Math.random() < penalty / 100;
}

// Un seul renvoi : deux redirections ne peuvent pas former une boucle.
export function redirectedPlayer(room, state, now) {
  const fx = state._abilityFx?.ability_disruptor_redirect;
  if (!fx || !(fx.until > now)) return null;
  const target = room.get(String(fx.target));
  if (!target?.state || target.state === state || target.state.dead || target.state.pvpDead || !(target.state.hp > 0)) return null;
  return target;
}
