import { shipOwnsAbility } from "./MOVEMENT_RULES.js";

const BACKUP = "ability_tempest_volt-backup";
export function tempestBackupActive(state, now) {
  return now < Number(state._tempestBackupUntil || 0);
}

export function tempestBackupReady(state, now) {
  return shipOwnsAbility(state._combat?.shipId || state.shipId, BACKUP)
    && !state.dead && !state.pvpDead && state.hp > 0
    && now >= Number(state._jamUntil || 0)
    && now >= Number(state._tempestBackupCdUntil || 0)
    && !tempestBackupActive(state, now);
}

export function triggerTempestBackup(state, room, now, allowOneHp = false) {
  if (state.pvpDead || state.dead || state.hp > (allowOneHp ? 1 : 0)
    || now < Number(state._jamUntil || 0)
    || !shipOwnsAbility(state._combat?.shipId || state.shipId, BACKUP)
    || tempestBackupActive(state, now) || now < Number(state._tempestBackupCdUntil || 0)) return false;
  state.hp = 1;
  state._tempestBackupAt = now;
  state._tempestBackupUntil = now + 10000;
  state._tempestBackupCdUntil = now + 370000;
  state._tempestBackupRequestedUntil = 0;
  state._tempestBackupKiller = "";
  state._abilityCds ||= {};
  state._abilityCds[BACKUP] = state._tempestBackupCdUntil; // 10 s d'effet, puis 360 s de recharge.
  state._abilityFx ||= {};
  state._abilityFx[BACKUP] = { from: now, until: state._tempestBackupUntil, x: 0, y: 0, target: "" };
  for (const { ws } of room.values()) {
    if (ws?.readyState === 1) ws.send(JSON.stringify({ t: "skillFx", skill: BACKUP,
      by: state.id, at: now, until: state._tempestBackupUntil, enabled: true }));
  }
  return true;
}

export function expireTempestBackup(state, now) {
  if (!(Number(state._tempestBackupUntil) > 0) || tempestBackupActive(state, now)) return false;
  state._tempestBackupUntil = 0;
  delete state._abilityFx?.[BACKUP];
  if (state.hp <= 1) {
    state.hp = 0;
    state.dead = true;
    state.pvpDead = true;
    state.pvpAt = now;
    return true;
  }
  return false;
}

// Le serveur fournit les positions des maillons, conservées après leur mort.
export function validateVoltChain(state, room, sim, message) {
  const ids = Array.isArray(message.chain) ? message.chain.slice(0, 10) : [message.target];
  if (String(ids[0] || "") !== String(message.target || "")) return [];
  const chain = [];
  const seen = new Set([String(state.id)]);
  let previous = state;
  for (const value of ids) {
    const id = String(value || "").slice(0, 64);
    const target = room.get(id)?.state || sim?.entries?.get(id);
    if (!id || seen.has(id) || !target || target.dead || target.pvpDead || !(target.hp > 0)) break;
    const radius = chain.length ? 660 : Math.max(700, Number(state.range) || 700);
    const dx = Number(target.x) - Number(previous.x), dy = Number(target.y) - Number(previous.y);
    if (!(dx * dx + dy * dy <= radius * radius)) break;
    seen.add(id);
    chain.push({ id, x: Math.round(target.x), y: Math.round(target.y) });
    previous = target;
  }
  return chain;
}
