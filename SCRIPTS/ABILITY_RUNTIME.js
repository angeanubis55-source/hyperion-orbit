import { damagePlayerLayers } from "../COMBAT/COMBAT_RULES.js";
import { shipOwnsAbility } from "./MOVEMENT_RULES.js";

import { activeAbility, fortifyActive } from "../SRC/CORE/ABILITY_COMBAT_RULES.js";
export { activeAbility, fortifyActive } from "../SRC/CORE/ABILITY_COMBAT_RULES.js";
export function triggerPaladin(state, now, emit) {
  if (state.hp > 0 || now < Number(state._jamUntil) || now < Number(state._lastStandCdUntil)
    || !shipOwnsAbility(state.shipId, "ability_paladin_last-stand")) return false;
  state.hp = state.hpMax;
  state.dead = false;
  state.pvpDead = false;
  state._lastStandCdUntil = now + 600000;
  state._lastStandAt = now;
  emit?.({ t: "skillFx", skill: "ability_paladin_last-stand", phase: "proc", by: state.id,
    target: state.id, amount: Math.round(state.hpMax), at: now, until: now + 1667 });
  return true;
}

// Les transferts secondaires n'entrent pas une seconde fois dans les liens
// et les réflexions : aucune boucle entre deux vaisseaux protégés.
export function abilityDamage(state, amount, penetration, now, context, secondary = false, weaken = 0) {
  const empty = { total: 0, hp: 0, sh: 0, bypass: 0 };
  if (!state || !(state.hp > 0) || state.dead || state.pvpDead || now < Number(state.ishUntil)
    || now < Number(state.iemUntil) || now < Number(state._tempestBackupUntil)) return empty;
  let damage = Math.max(0, Number(amount) || 0), pen = penetration;
  if (!secondary && activeAbility(state, "ability_berserker_rvg", now)) {
    context.reflect?.(state, damage, penetration);
    return empty;
  }
  if (fortifyActive(state, now)) damage *= 0.2;
  if (activeAbility(state, "ability_paladin_ripper", now)) damage *= 0.5;
  if (activeAbility(state, "ability_citadel-plus_prismatic-endurance", now)) {
    damage *= 0.2;
    pen = context.sourceProfile?.butterfly ? 0.2 : 0;
  }
  if (activeAbility(state, "ability_spectrum", now)) damage *= 0.1;
  if (activeAbility(state, "ability_spectrum-plus_prismatic-reflecting", now)) {
    if (!secondary) context.reflect?.(state, damage * 0.7, penetration);
    damage *= 0.3;
  }
  const assimilate = activeAbility(state, "ability_orcus-plus_assimilate", now) ? "ability_orcus-plus_assimilate"
    : activeAbility(state, "ability_orcus_assimilate", now) ? "ability_orcus_assimilate" : null;
  if (assimilate) {
    const before = state.hp;
    state.hp = Math.min(state.hpMax, state.hp + damage * 0.8);
    const gain = Math.max(0, Math.round(state.hp - before));
    context.emit?.({ t: "skillFx", skill: assimilate, phase: "heal", by: state.id,
      target: state.id, amount: gain, shield: false, at: now, until: now });
    damage *= 0.2;
  }
  if (!secondary) {
    for (const { state: protector } of context.room?.values() || []) {
      if (protector === state || !(protector.hp > 0) || protector.safe || protector.dead || protector.pvpDead) continue;
      if (!activeAbility(protector, "ability_citadel_protection", now) && !activeAbility(protector, "ability_citadel-plus_protection", now)) continue;
      if (!context.allied?.(state, protector) || Math.hypot(protector.x - state.x, protector.y - state.y) > 600) continue;
      context.transfer?.(protector, damage * 0.25, pen);
      damage *= 0.75;
      break;
    }
  }
  const stock = activeAbility(state, "ability_hecate-plus_stockpile", now);
  if (stock) damage *= 1 - Math.min(0.11, Number(stock.shieldBonus) || 0);
  const result = damagePlayerLayers(state, damage, Number(state.absorb) || 0.8, pen, Number(state._combat?.shieldTough) || 0);
  // Affaiblissement : seul le bouclier reçoit le supplément.
  if (weaken > 0 && state.sh > 0 && result.sh > 0) {
    const extra = Math.min(state.sh, result.sh * weaken);
    state.sh -= extra;
    result.sh += extra;
    result.total += extra;
  }
  if (!secondary && result.sh > 0) {
    for (const { state: caster } of context.room?.values() || []) {
      const link = activeAbility(caster, "ability_berserker_shl", now);
      if (!link || link.target !== String(state.id) || caster === state || !(caster.hp > 0) || caster.safe) continue;
      state.sh = Math.min(state.shMax, state.sh + result.sh);
      context.transfer?.(caster, result.sh, 0);
      result.total -= result.sh;
      result.sh = 0;
      break;
    }
  }
  triggerPaladin(state, now, context.emit);
  return result;
}

export function tickAbilityStates(room, sim, now, emit, groupOf) {
  const alive = s => s && !s.dead && !s.pvpDead && s.hp > 0;
  const heal = (state, key, amount, shield = false) => {
    const field = shield ? "sh" : "hp", max = shield ? "shMax" : "hpMax", before = Number(state[field]) || 0;
    if (!shield && now < Number(state._tempestBackupUntil)) amount = 0;
    state[field] = Math.min(state[max], before + amount);
    emit({ t: "skillFx", skill: key, phase: "heal", by: state.id, target: state.id,
      amount: Math.max(0, Math.round(state[field] - before)), shield, hp: state.hp, sh: state.sh, at: now, until: now });
  };
  const allTargets = [...room].map(([id, entry]) => [String(id), entry.state]).concat([...(sim?.entries || [])]);
  for (const [, target] of allTargets) {
    target._sprUntil = 0;
    target._drawFireBy = "";
    target._drawFireUntil = 0;
  }
  for (const npc of sim?.entries?.values() || []) {
    const hold = npc._incHold;
    if (hold && (!activeAbility(room.get(String(hold.by))?.state, hold.key, now) || room.get(String(hold.by))?.state?.safe)) npc._incHold = null;
  }
  for (const { state } of room.values()) {
    if (!alive(state)) continue;
    let boostedShield = Number(state._combat?.shMax) || 0;
    for (const [key, fx] of Object.entries(state._abilityFx || {})) {
      if (!fx || fx.finished) continue;
      if (key === "ability_berserker_shl" && fx.until > now) {
        const linked = room.get(String(fx.target))?.state || sim?.entries?.get(String(fx.target));
        if (!alive(linked) || Math.hypot(linked.x - state.x, linked.y - state.y) > (Number(state.range) || 800)) {
          fx.until = now;
          state._abilityCds[key] = now + 10000;
          emit({ t: "skillFx", skill: key, by: state.id, at: now, until: now, enabled: false, forced: true });
        }
      }
      const active = fx.until > now && !(now < Number(state._jamUntil));
      if (active && key === "ability_mimesis_hologram" && now >= fx.until - 3000 && !fx.clonesStarted) {
        fx.clonesStarted = true;
        sim?.breakPlayerLocks?.(state.id, now + 100);
        emit({ t: "skillFx", skill: key, phase: "clones", by: state.id, at: now, until: fx.until });
      }
      if (key === "ability_sentinel") {
        if (active && fx.config !== state._combat?.config) {
          fx.until = now;
          state._abilityCds[key] = now + 180000;
          fx.finished = true;
          emit({ t: "skillFx", skill: key, by: state.id, at: now, until: now, enabled: false, forced: true });
        } else if (active) {
          const ticks = Math.min(10, Math.floor((now - fx.from) / 1000));
          boostedShield = Math.floor(fx.baseShield * 1.1 ** ticks);
          const gained = Math.max(0, Math.floor(fx.baseShield * 1.1 ** ticks) - Math.floor(fx.baseShield * 1.1 ** fx.shieldTicks));
          fx.shieldTicks = ticks;
          state.shMax = boostedShield;
          if (gained > 0) heal(state, key, gained, true);
        }
      }
      if (!(now < Number(state._jamUntil)) && /ability_hammerclaw(?:-plus)?_(hp-repair|shield-repair|repair-pod)$/.test(key)) {
        const tick = Math.floor((now - fx.from) / 1000), last = Number(fx.selfHealTick) || 0;
        const total = Math.round((fx.until - fx.from) / 1000);
        if (tick > last && last < total) {
          fx.selfHealTick = Math.min(tick, total);
          const plus = key.startsWith("ability_hammerclaw-plus_");
          const shield = key.endsWith("shield-repair"), pod = key.endsWith("repair-pod");
          const radius = plus ? 600 : 400;
          if (!pod || Math.hypot(state.x - fx.x, state.y - fx.y) <= radius) {
            const amount = pod ? (plus ? 25000 : 17500) : shield ? (plus ? 50000 : 40000) : plus ? 37500 : 25000;
            heal(state, key, amount * (fx.selfHealTick - last), shield);
          }
        }
      }
      if (active && key === "ability_keres_spr" && !state.safe) {
        const infected = fx.infected || {};
        // Une génération par tick : la contagion suit réellement les cibles.
        const carriers = allTargets.filter(([id, s]) => infected[id] > now && alive(s));
        for (const [id, target] of allTargets) {
          if (Object.keys(infected).length >= 10) break;
          if (target === state || infected[id] || !alive(target) || target.safe || sim?.inSafe?.(target.x, target.y)) continue;
          if (!carriers.some(([, s]) => Math.hypot(s.x - target.x, s.y - target.y) <= 300)) continue;
          infected[id] = now + 10000;
          target.slowPct = Math.max(now < target.slowUntil ? Number(target.slowPct) || 0 : 0, 20);
          target.slowUntil = Math.max(Number(target.slowUntil) || 0, infected[id]);
        }
        const latest = Math.max(0, ...Object.values(infected));
        for (const [id, target] of allTargets) target._sprUntil = Math.max(Number(target._sprUntil) || 0, Number(infected[id]) || 0);
        if (latest > fx.until) fx.until = latest;
        state._abilityCds[key] = fx.until + 300000;
      }
      if (active && (key === "ability_citadel_draw-fire" || key === "ability_citadel-plus_draw-fire") && !state.safe) {
        const group = groupOf(String(state.id));
        for (const { state: target } of room.values()) {
          if (target === state || !alive(target) || target.safe || target.firm && target.firm === state.firm
            || group && groupOf(String(target.id)) === group || Math.hypot(target.x - state.x, target.y - state.y) > 600) continue;
          target._drawFireBy = state.id;
          target._drawFireUntil = fx.until;
        }
        for (const npc of sim?.entries?.values() || []) {
          if (!alive(npc) || sim.inSafe(npc.x, npc.y) || Math.hypot(npc.x - state.x, npc.y - state.y) > 600) continue;
          npc._drawFireBy = state.id;
          npc._drawFireUntil = fx.until;
        }
      }
      if (active && (key === "ability_solaris_inc" || key === "ability_solaris-plus_incinerate-plus") && !state.safe) {
        const radius = key === "ability_solaris_inc" ? 600 : 800;
        for (const npc of sim?.entries?.values() || []) {
          if (!alive(npc) || sim.inSafe(npc.x, npc.y) || Math.hypot(npc.x - state.x, npc.y - state.y) > radius) continue;
          if (!npc._incHold) npc._incHold = { by: state.id, key, until: fx.until, radius: radius * 0.35, angle: Math.atan2(npc.y - state.y, npc.x - state.x) };
        }
      }
      if (!active) {
        if (key === "ability_diminisher" && !(now < state._jamUntil)) state.sh *= 0.7;
        if (key === "ability_hammerclaw-plus_reallocate" && !(now < state._jamUntil) && fx.pool > 0) {
          const group = groupOf(String(state.id));
          const targets = [...room.values()].map(entry => entry.state).filter(s => alive(s)
            && (s === state || group && groupOf(String(s.id)) === group) && Math.hypot(s.x - state.x, s.y - state.y) <= 700);
          for (const target of targets) heal(target, key, fx.pool / Math.max(1, targets.length));
        }
        fx.finished = true;
      }
    }
    if (state._abilityShieldMax !== boostedShield) state._shieldBuffSeq = (Number(state._shieldBuffSeq) || 0) + 1;
    state._abilityShieldMax = boostedShield;
    if (state._abilityFx?.ability_sentinel?.finished) {
      state.shMax = Math.max(0, boostedShield - (Number(state._disarrayRemoved) || 0));
      state.sh = Math.min(state.sh, state.shMax);
    }
  }
}

export function recordAbilityDamageDealt(state, damage, now) {
  const fx = activeAbility(state, "ability_hammerclaw-plus_reallocate", now);
  if (fx && damage > 0) fx.pool = (Number(fx.pool) || 0) + damage * 0.2;
}
export function recordAbilityNpcKill(state, now) {
  if (!state || now < Number(state._jamUntil) || activeAbility(state, "ability_hecate-plus_stockpile", now)) return;
  if (shipOwnsAbility(state.shipId, "ability_hecate-plus_stockpile")) state._stockCharges = Math.min(10, (Number(state._stockCharges) || 0) + 1);
}
