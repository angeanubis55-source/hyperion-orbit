import { createServer } from "node:http";
import { readFile, stat, mkdir, writeFile, rename } from "node:fs/promises";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { WebSocketServer } from "ws";
import { ZoneNpcSim, syncSundayEvent } from "./NPC_ROOM.js";
import {
  ANTICHEAT as AC,
  acBucket,
  acStrike,
  acHealTake,
  acAuditWindow,
  acRecordCollection,
  acPoolResize,
  acRecordViolation,
} from "./ANTICHEAT.js";
const {
  AC_HIT_CAP, AC_HIT_REFILL, AC_DMG_CAP, AC_DMG_REFILL,
  AC_PVP_HIT_CAP, AC_PVP_HIT_REFILL, AC_PVP_DMG_CAP, AC_PVP_DMG_REFILL,
  HEAL_BUDGET_RATE, HEAL_BUDGET_CAP,
  PET_LEASH,
} = AC;
import { tickLowRaid, getLowRaidState } from "./LOW_RAID.js";
import { damagePlayerLayers } from "../COMBAT/COMBAT_RULES.js";
import { handleAccountApi, getAccountGameplayData, verifyWsToken, recordPvpKill, recordPvpPetKill, awardNpcKill, grantSundayModule, grantSundayTickets, grantSundayAmmo, listFriends, friendFollowers, findUserByPseudo, hasFriendRequest, clanIdOfUser, clanTagOfUser, clanMemberUserIds, recordClanWarKill, adminGiveCredits, adminGiveExperience, adminGiveHonor, adminGiveModule, adminGiveTitle, adminListAccounts, adminDebugAccount, adminDeleteAccount, adminResetGalaxyGate, adminGiveGalaxyGate, adminDroneDesigns, adminGiveDroneDesign, adminShipFamilies } from "./ACCOUNT_SERVER.js";
import { combatProfile, validateCombatHit } from "./COMBAT_PROFILE.js";
import { profileAbilityCooldown } from "../DRONE/DRONE_DESIGNS.js";
import { selectNpcSnapshot } from "./NPC_SNAPSHOT.js";
import { updateClockGuard, stopRejectedMotion } from "./CLOCK_GUARD.js";
import { takeMovement, useMovementAbility, stopMovementAbility, syncMovementAbility, movementSpeed, usePhaseOut, shipOwnsAbility, dashTargetKey, isMovementAbilityKey } from "./MOVEMENT_RULES.js";
import { isAbilityFxBroadcastable, pruneAbilityFxMap, isExecutionAbility, EXEC_WINDOW_MS, EXEC_AURA_GRACE_MS, EXEC_HIT_CAP_PVP, healSpecFor, HEAL_MIN_INTERVAL_MS, fxDebuffsOn } from "../SRC/CORE/ABILITY_FX.js";
import { hostileAbility, unlimitedAbilityRange } from "../SRC/CORE/ABILITY_COMBAT_RULES.js";
import { getAbilityInfo, HYPERION_QA_DAMAGE } from "../SHIP/SHIP_ABILITIES.js";
import { ROCKET_TYPES } from "../COMBAT/ROCKET_TYPES.js";
import { syncDisarrayShield, syncDisruptorEffects, laserDisrupted, redirectedPlayer } from "./DISRUPTOR_RULES.js";
import { tempestBackupActive, tempestBackupReady, triggerTempestBackup, expireTempestBackup, validateVoltChain } from "./TEMPEST_RULES.js";
import { abilityDamage, activeAbility, fortifyActive, triggerPaladin, tickAbilityStates, recordAbilityDamageDealt, recordAbilityNpcKill, applyEnergyLeech } from "./ABILITY_RUNTIME.js";

// --- Auras d'aptitudes visibles par les autres (Phase 2) ---
// Le serveur reste autoritaire : chaque cast ability_* est validé
// (vaisseau propriétaire + vivant + cooldown), stocké avec expiration,
// purgé à la mort / changement de vaisseau / changement de map, puis
// exposé dans le snapshot via `afx` ([code, secLeft, x, y, target]).
// Les camouflages ne transitent JAMAIS (invisibilité gameplay).
// Les soins instantanés sans aura ne transitent pas (barres HP/SH
// suffisent). Les casts instantanés (rafales, QA, lien...) partent en
// skillFx immédiat (flash visible) sans aura persistante.
const ABILITY_CLOAK_SILENT = new Set([
  "ability_admin-ultimate-cloaking",
  "ability_spearhead_ultimate-cloak",
  "ability_spearhead-plus_ultimate-cloak",
]);
// Camouflage interdit par carte : GG + QZ + Low + Maudite. Le client grise
// les boutons, le serveur tranche en autorité (anti-contournement).
const NO_CLOAK_MAPS = new Set(["alpha", "beta", "gamma", "delta", "epsilon",
  "zeta", "kappa", "lambda", "kronos", "awakened", "eternal", "qz", "low", "maudite"]);
function ownsAbility(profile, skill) {
  // Source unique : MOVEMENT_RULES.shipOwnsAbility (Police + designs).
  try { return shipOwnsAbility(profile?.shipId, skill); } catch { return false; }
}
function clearAbilityFx(state) {
  try { state._abilityFx = {}; } catch {}
  try { state._abilityCds = {}; } catch {}
  try { state._orcusUntil = 0; } catch {}
  try { state._execWindow = null; } catch {}
  state._qaWindow = null;
  state._freeRocketCast = null;
  state.holoClones = [];
}
// Techs (buffs perso : Energy Leech, Precision Targeter, etc.) : traversent
// les changements de map tant qu'elles sont valides, contrairement aux
// auras posées et aux aptitudes de vaisseau (toujours purgées).
// Le client garde déjà ses timers locaux : sans ça, affichage actif mais
// aucun effet serveur. Les entrées restaurées viennent de l'état serveur
// lui-même (pas du client).
function preserveTechAurasAcrossMapChange(state) {
  let saved = null;
  try {
    const fx = state?._abilityFx;
    if (fx && typeof fx === "object") {
      saved = {};
      for (const [key, entry] of Object.entries(fx)) {
        if (!String(key || "").startsWith("ability_tech_")) continue;
        if (entry && Number(entry.until) > Date.now()) saved[key] = { ...entry };
      }
      if (!Object.keys(saved).length) saved = null;
    }
  } catch { saved = null; }
  try { clearAbilityFx(state); } catch {}
  if (saved) {
    try {
      if (!state._abilityFx || typeof state._abilityFx !== "object") state._abilityFx = {};
      Object.assign(state._abilityFx, saved);
    } catch {}
  }
  return state;
}
function jamPlayerAbilities(state, room, now, durationMs) {
  const active = new Set([
    ...Object.keys(state._abilityFx || {}).filter(key => state._abilityFx[key]?.until > now),
    ...Object.keys(state._moveEffects || {}).filter(key => state._moveEffects[key]?.until > now),
  ]);
  if (state.cloaked && state._combat?.cloakSkill) {
    active.add(state._combat.cloakSkill.id);
    state._cloakCdUntil = now + profileAbilityCooldown(Number(state._combat.cloakSkill.cooldownSec || 240), state._combat) * 1000;
  }
  stopMovementAbility(state, state._combat, now);
  state._abilityCds ||= {};
  for (const skill of active) {
    const cooldown = profileAbilityCooldown(Number(getAbilityInfo(skill)?.cooldownSec) || 0, state._combat);
    if (cooldown > 0) state._abilityCds[skill] = now + cooldown * 1000;
    if (isMovementAbilityKey(skill) && cooldown > 0) {
      state._moveCooldowns ||= {};
      state._moveCooldowns[skill] = now + cooldown * 1000;
    }
    broadcastRoom(room, JSON.stringify({ t: "skillFx", skill, by: state.id,
      at: now, until: now, enabled: false }));
  }
  state._abilityFx = {};
  state._orcusUntil = 0;
  state._execWindow = null;
  state._qaWindow = null;
  state._freeRocketCast = null;
  state.holoClones = [];
  if (state._tempestBackupUntil > now) state._tempestBackupCdUntil = now + profileAbilityCooldown(360, state._combat) * 1000;
  state._tempestBackupUntil = 0;
  state._tempestBackupRequestedUntil = 0;
  state._voltLinkFx = null;
  state.tbrClones = [];
  state.cloaked = false;
  state._cloakUntil = 0;
  state._jamAt = now;
  state._jamUntil = Math.max(Number(state._jamUntil) || 0, now + durationMs);
  state._jamxUntil = Math.max(Number(state._jamxUntil) || 0, now + durationMs);
  state.moveSpeed = movementSpeed(state, state._combat, now);
  state.vmax = state.moveSpeed;
}
function awardPlayerKill(room, id, victim, now) {
  if (!id || String(id) === String(victim.id)) return;
  const total = Math.max(1, Number(victim.hpMax) || 1) + Math.max(0, Number(victim.shMax) || 0);
  const fkey = `${id}|${victim.id}`;
  let farm = pvpFarm.get(fkey);
  if (!farm || now - Number(farm.t0 || 0) > 3600_000) farm = { n: 0, t0: now };
  farm.n++;
  pvpFarm.set(fkey, farm);
  const mult = farm.n <= 1 ? 1 : farm.n === 2 ? 0.5 : farm.n === 3 ? 0.25 : 0;
  const exp = Math.round(total / 50 * mult);
  const honneur = Math.round(total / 500 * mult);
  try {
    if (String(id).startsWith("u_")) recordPvpKill(String(id).slice(2), exp, honneur, victim.shipId);
  } catch {}
  try {
    if (String(id).startsWith("u_") && String(victim.id).startsWith("u_")) {
      recordClanWarKill(String(id).slice(2), String(victim.id).slice(2));
    }
  } catch {}
  try {
    const killer = room.get(id);
    if (killer?.ws?.readyState === 1) {
      killer.ws.send(JSON.stringify({ t: "pvpKill", exp, honneur, mult, victim: String(victim.pseudo || "Pilote").slice(0, 20) }));
    }
  } catch {}
}
// Debuffs du lanceur sur une cible (uid NPC ou id joueur) : Diminisher
// (+50 % dégâts bouclier), Holo (+10 % totaux), Marqueur (+10 % péné).
// Les ralentissements transitent déjà par les hits de statut.
function casterDebuffOn(state, targetId, now) {
  try { return fxDebuffsOn(state?._abilityFx, targetId, now); } catch {}
  return { weaken: 0, penBonus: 0, dmgMult: 1 };
}
function isLinkedRepair(skill) {
  return healSpecFor(skill)?.mode === "hot";
}
function breakRepairLink(state, skill, room, id, now) {
  if (!isLinkedRepair(skill)) return;
  const fx = state._abilityFx?.[skill];
  if (!fx?.target) return;
  fx.target = "";
  broadcastRoom(room, JSON.stringify({ t: "skillFx", skill, phase: "unlink", by: id,
    at: now, until: fx.until, target: "" }));
}

// Ticks visuels uniquement : aucun soin supplémentaire appliqué ici.
function relayAbilityHealFx(state, skill, msg, room, id, now) {
  const spec = ({
    "ability_liberator-plus_self-repair": { cap: 35000, ticks: 10, shield: false },
    "ability_aegis_hp-repair": { cap: 20000, ticks: 7, shield: false },
    "ability_aegis_shield-repair": { cap: 15000, ticks: 5, shield: true },
    "ability_aegis_repair-pod": { cap: 18000, ticks: 10, shield: false },
  })[skill];
  if (!spec || state.pvpDead || !(state.hp > 0)) return false;
  const fx = state._abilityFx?.[skill];
  if (!fx || !(now < Number(fx.until) + 2000) || !(now >= Number(fx.from) + 800)) return false;
  if (skill === "ability_aegis_repair-pod") {
    const dx = Number(state.x) - Number(fx.x), dy = Number(state.y) - Number(fx.y);
    if (!(dx * dx + dy * dy <= 400 * 400)) return false;
  }
  const amount = Number(msg.amount);
  if (!Number.isFinite(amount) || amount < 0 || amount > spec.cap) return false;
  if (Number(fx.healTicks || 0) >= spec.ticks || now - Number(fx.lastHealAt ?? fx.from) < HEAL_MIN_INTERVAL_MS) return false;
  fx.lastHealAt = now;
  fx.healTicks = Number(fx.healTicks || 0) + 1;
  broadcastRoom(room, JSON.stringify({ t: "skillFx", skill, phase: "heal", by: id,
    amount: Math.round(amount), shield: spec.shield, at: now, until: now }));
  return true;
}

function hyperionSafeBlocked(state, target, sim, targetIsPlayer) {
  // Seule la cible compte : protégée -> intouchable. Un attaquant protégé
  // peut toujours tirer (il perd sa ZNA en attaquant, parité client
  // netPvpBlocked) : bloquer côté attaquant rendait l'ennemi sur notre base
  // invincible (0 dégât) tout en se réparant.
  const protectedPlayer = p => p?.safe === true && (!sim?.inSafe || sim.inSafe(p.x, p.y));
  return !!(targetIsPlayer ? protectedPlayer(target) : target && sim?.inSafe(target.x, target.y));
}
function hyperionTargetAllowed(state, target, sim, targetIsPlayer) {
  if (!target || target === state || target.dead || target.pvpDead || !(target.hp > 0)) return false;
  if (hyperionSafeBlocked(state, target, sim, targetIsPlayer)) return false;
  return Math.hypot(Number(target.x) - Number(state.x), Number(target.y) - Number(state.y)) <= (Number(state.range) || 800);
}
function emitAbilityEvent(room, event) {
  const target = room?.get(String(event.target || event.by))?.state;
  if (target && (event.phase === "heal" || event.phase === "proc")) {
    target._abilityHealSeq = (Number(target._abilityHealSeq) || 0) + 1;
    Object.assign(event, { healSeq: target._abilityHealSeq, hp: target.hp, sh: target.sh, shMax: target.shMax });
  }
  broadcastRoom(room, JSON.stringify(event));
}
function broadcastChargedShot(room, state, hit, now) {
  if (hit.ability !== "ability_retiarus_chs" && hit.ability !== "ability_retiarus-plus_chsp") return;
  delete state._abilityFx?.[hit.ability];
  broadcastRoom(room, JSON.stringify({ t: "skillFx", skill: hit.ability, phase: "fire", by: state.id,
    target: String(hit.target || hit.uid), x: state.x, y: state.y, at: now, until: now + 1200 }));
}
function applyServerAbilityDamage(room, sim, victim, damage, pen, now, sourceId, sourceProfile = null, weaken = 0, secondary = false) {
  const context = {
    room, sourceProfile,
    emit: event => emitAbilityEvent(room, event),
    allied: (a, b) => {
      const group = socialGroupOf(String(a.id));
      return group ? socialGroupOf(String(b.id)) === group : !!a.firm && a.firm === b.firm;
    },
  };
  const secondaryHit = (target, amount, penetration, by) => {
    if (!target || target.safe || !(target.hp > 0)) return;
    const result = abilityDamage(target, amount, penetration, now, context, true);
    target.pvpAt = now;
    target.pvpFrom = String(by);
    target.dmgBlockUntil = now + 500;
    if (result.total > 0) {
      const map = String(sim?.mapId || target.serverMap || "");
      let feed = pvpFeeds.get(map);
      if (!feed) { feed = new Map(); pvpFeeds.set(map, feed); }
      const key = `${target.id}|${by}`, prior = feed.get(key);
      feed.set(key, { uid: String(target.id), by: String(by), total: Math.round((prior?.total || 0) + result.total) });
    }
    if (!(target.hp > 0) && !triggerTempestBackup(target, room, now)) {
      target.dead = true;
      target.pvpDead = true;
      clearAbilityFx(target);
      if (room.has(String(by))) awardPlayerKill(room, String(by), target, now);
    }
  };
  context.transfer = (target, amount, penetration) => secondaryHit(target, amount, penetration, sourceId);
  context.reflect = (caster, amount, penetration, toLock = false) => {
    const reflectedId = toLock ? String(caster.lockedTarget || "") : String(sourceId);
    const source = room.get(reflectedId)?.state;
    if (source) secondaryHit(source, amount, penetration, caster.id);
    else if (sim?.entries?.get(reflectedId)?.hp > 0 && !sim.inSafe(sim.entries.get(reflectedId).x, sim.entries.get(reflectedId).y)) {
      sim.applyHit(String(caster.id), { uid: reflectedId, dmg: amount, pen: penetration,
        critChance: 0, critMult: 1, variance: 0, execOk: true });
    }
  };
  return abilityDamage(victim, damage, pen, now, context, secondary, weaken);
}
function trackAbilityFx(state, profile, skill, msg, room, id, now, sim = null) {
  const key = String(skill || "").toLowerCase();
  if (ABILITY_CLOAK_SILENT.has(key)) return false;
  let info = null;
  try { info = getAbilityInfo(key); } catch { info = null; }
  if (!info) return false;
  if (!ownsAbility(profile, key)) return false;
  if (state.pvpDead === true || !(Number(state.hp) > 0)) return false;
  const cds = (state._abilityCds && typeof state._abilityCds === "object")
    ? state._abilityCds
    : (state._abilityCds = {});
  const enabled = msg.enabled !== false;
  // Les boosts n'ont qu'une validation : celle des règles de mouvement.
  const movementAbility = isMovementAbilityKey(key);
  const movementEffect = state._moveEffects?.[key];
  const hyperionGa = key === "ability_hyperion_ga";
  const hyperionQa = key === "ability_hyperion_qa";
  const chargedShot = key === "ability_retiarus_chs" || key === "ability_retiarus-plus_chsp";
  const durSec = hyperionQa || chargedShot ? Math.max(0.5, Math.min(10, Number(msg.chargeSec) || (chargedShot ? 3 : 2.5)))
    : key === "ability_mimesis_hologram" ? 3 + Math.max(0.5, Math.min(10, Number(msg.chargeSec) || 1.5))
    : Number(info.durationSec) * (profile.baseId === "centurion" ? 0.5 : 1);
  const cdSec = profileAbilityCooldown(info.cooldownSec, profile);
  if (hyperionQa && msg.phase === "fire") {
    const window = state._qaWindow;
    const target = String(msg.target || "").slice(0, 64);
    if (!window || window.fired || window.target !== target || now + 250 < window.readyAt || now >= window.until
      || !hyperionTargetAllowed(state, room.get(target)?.state || sim?.entries?.get(target), sim, room.has(target))) return false;
    window.fired = true;
    window.firedAt = now;
    window.until = now + 10000;
    cds[key] = now + cdSec * 1000;
    if (state._abilityFx) delete state._abilityFx[key];
    broadcastRoom(room, JSON.stringify({ t: "skillFx", skill: key, by: id, at: now, until: now, enabled: false, phase: "fire" }));
    return true;
  }
  if (enabled === false) {
    if (key === "ability_zephyr_tbr") state.tbrClones = [];
    if (key === "ability_mimesis_hologram") state.holoClones = [];
    if (state._freeRocketCast?.key === key) state._freeRocketCast = null;
    // Annulation (toggle off / lien coupé / charge avortée) : purge
    // immédiate + broadcast de fin pour que les autres effacent sans
    // attendre l'expiration. Charge avortée = fizzle : aucun cooldown
    // (comme en local, cancelChsCharge ne recharge pas).
    try {
      if (state._abilityFx && typeof state._abilityFx === "object") delete state._abilityFx[key];
    } catch {}
    if (key === "ability_orcus_assimilate" || key === "ability_orcus-plus_assimilate") {
      try { state._orcusUntil = 0; } catch {}
    }
    if (key === "ability_retiarus_chs" || key === "ability_retiarus-plus_chsp") {
      const charge = state._execWindow;
      if (charge?.key === key) {
        state._execWindow = null;
        if (!charge.used) delete cds[key];
      }
    } else if (hyperionQa && state._qaWindow && !state._qaWindow.fired) {
      delete cds[key];
    } else if (Number.isFinite(cdSec) && cdSec > 0) {
      cds[key] = now + cdSec * 1000;
    }
    if (hyperionQa) state._qaWindow = null;
    try {
      broadcastRoom(room, JSON.stringify({ t: "skillFx", skill: key, by: id, at: now, until: now, enabled: false }));
    } catch {}
    return true;
  }
  if (!movementAbility && now < Number(cds[key] || 0)) return false;
  if (key === "ability_zephyr_tbr" && !profile.petOwned) return false;
  const target = String(msg.target || "").slice(0, 64);
  const victim = room.get(target)?.state || sim?.entries?.get(target);
  if (key === "ability_berserker_shl" && (!victim || victim === state || victim.dead || victim.pvpDead
    || !(victim.hp > 0) || !(victim.shMax > 0) || Math.hypot(victim.x - state.x, victim.y - state.y) > (Number(state.range) || 800))) return false;
  const freeRocket = key === "ability_goliath-x_frozen-claw" ? "ric3"
    : key === "ability_tartarus_rapid-fire" || key === "ability_tartarus-plus_rapid-fire-plus" ? String(msg.rocket || "eco10") : "";
  if (freeRocket && (!ROCKET_TYPES[freeRocket] || (freeRocket !== "ric3" && ROCKET_TYPES[freeRocket].manual !== false)
    || !hyperionTargetAllowed(state, victim, sim, room.has(target)))) return false;
  if (hostileAbility(key, info)) {
    if (hyperionSafeBlocked(state, victim, sim, room.has(target))) return false;
    if (info.target === "enemy" && (!victim || victim === state || victim.dead || victim.pvpDead || !(victim.hp > 0))) return false;
    const range = /ability_hecate.*particle-beam/.test(key) ? 1000 : Number(state.range) || 800;
    if (info.target === "enemy" && !unlimitedAbilityRange(key) && key !== "ability_keres_sle"
      && Math.hypot(victim.x - state.x, victim.y - state.y) > range) return false;
  }
  if ((hyperionGa || hyperionQa) && !hyperionTargetAllowed(state, room.get(target)?.state || sim?.entries?.get(target), sim, room.has(target))) return false;
  const targetMarker = key === "ability_spearhead_target-marker" || key === "ability_spearhead-plus_target-marker"
    || key === "ability_orcus-plus_target-marker";
  if (targetMarker) {
    const victim = room.get(target)?.state || sim?.entries?.get(target);
    if (!victim || victim === state || victim.dead || victim.pvpDead || !(victim.hp > 0)
      || Math.hypot(Number(victim.x) - Number(state.x), Number(victim.y) - Number(state.y)) > (Number(state.range) || 800)) return false;
  }
  const voltChain = key === "ability_tempest_voltage-link" ? validateVoltChain(state, room, sim, msg) : null;
  if (voltChain && !voltChain.length) return false;
  if (key.startsWith("ability_disruptor_")) {
    const victim = room.get(target)?.state || sim?.entries?.get(target);
    if (!victim || victim === state || victim.dead || victim.pvpDead || !(victim.hp > 0)) return false;
    if (key === "ability_disruptor_shield-disarray" && !(victim.shMax > 0)) return false;
  }
  const hasDuration = Number.isFinite(durSec) && durSec > 0;
  const isToggle = !hasDuration && cdSec === 0;
  const isWindowExec = key === "ability_retiarus_chs" || key === "ability_retiarus-plus_chsp";
  // Cooldown : les toggles partent au (dé)cochage, les autres à la fin
  // d'effet côté client ; ici on pose un garde-fou anti-spam minimal
  // (durée + recharge) sans casser les toggles. Exécutions : le local
  // applique 20/18 min ; le backstop serveur est borné (refresh en pleine
  // charge sans cancel possible) — la fenêtre single-shot reste la vraie
  // limite (un beam par cast).
  if (isWindowExec) cds[key] = now + durSec * 1000 + cdSec * 1000;
  else if (hasDuration) cds[key] = now + ((targetMarker || key === "ability_goliath-x_frozen-claw" ? 0 : durSec) + (Number.isFinite(cdSec) && cdSec > 0 ? cdSec : 0)) * 1000;
  else if (!isToggle && Number.isFinite(cdSec) && cdSec > 0) cds[key] = now + cdSec * 1000;
  else if (isToggle) cds[key] = now + 1500;
  // Position : zones posées (pods, nébuleuse) = point de cast ; le reste
  // suit le lanceur (0,0). Les debuffs mono-cible portent la cible.
  const isZone = info.target === "zone";
  const fx = {
    from: now,
    until: movementAbility && movementEffect
      ? (Number.isFinite(movementEffect.until) ? movementEffect.until : now + 3600_000)
      : now + (hasDuration ? durSec * 1000 : isToggle ? 3600_000 : 3000),
    x: isZone || hyperionGa ? Math.round(Number(state.x) || 0) : 0,
    y: isZone || hyperionGa ? Math.round(Number(state.y) || 0) : 0,
    target: info.target === "enemy" || info.target === "ally" || isLinkedRepair(key) || key === "ability_disruptor_redirect" ? target : "",
  };
  fx.config = profile.config;
  if (key === "ability_solace") fx.until = now + 1000;
  if (freeRocket) state._freeRocketCast = { key, rocket: freeRocket, target, until: now + 20000,
    launched: 0, hits: 0, count: key === "ability_tartarus-plus_rapid-fire-plus" ? 30 : key === "ability_tartarus_rapid-fire" ? 15 : 1 };
  if (key === "ability_sentinel") { fx.baseShield = profile.shMax; fx.shieldTicks = 0; }
  if (key === "ability_hecate-plus_stockpile") {
    const charges = Math.min(10, Number(state._stockCharges) || 0);
    fx.shieldBonus = 0.002 * charges * (charges + 1) / 2;
    state._stockCharges = 0;
  }
  if (key === "ability_keres_spr") fx.infected = { [target]: now + 10000 };
  const neutralMarker = key === "ability_spearhead-plus_neutralizing-marker";
  const targetSlow = key === "ability_holo_enemy-reversal" || key === "ability_pusat-plus_speed-sap" || neutralMarker ? 10
    : key === "ability_keres_spr" ? 20 : chargedShot ? 25 : 0;
  if (victim && targetSlow) {
    if (room.has(target)) takeMovement(victim, victim._combat, victim.x, victim.y, now);
    victim.slowPct = Math.max(now < Number(victim.slowUntil) ? Number(victim.slowPct) || 0 : 0, targetSlow);
    victim.slowUntil = Math.max(Number(victim.slowUntil) || 0, now + (chargedShot ? durSec : neutralMarker ? 3 : key === "ability_holo_enemy-reversal" ? 15 : 10) * 1000);
  }
  if (isLinkedRepair(key)) {
    const linked = room.get(fx.target)?.state;
    const dx = Number(linked?.x) - Number(state.x), dy = Number(linked?.y) - Number(state.y);
    const radius = healSpecFor(key).radius;
    if (!linked || linked === state || linked.dead || linked.pvpDead || !(Number(linked.hp) > 0)
      || linked.cloaked || linked.cloakCpu || !(dx * dx + dy * dy <= radius * radius)) fx.target = "";
  }
  if (voltChain) {
    fx.until = now + 2000;
    state._voltLinkFx = { at: now, until: fx.until, chain: voltChain };
    for (const point of voltChain) {
      const victim = room.get(point.id)?.state || sim?.entries?.get(point.id);
      if (!victim) continue;
      if (room.has(point.id)) takeMovement(victim, victim._combat, victim.x, victim.y, now);
      victim.freezeUntil = Math.max(Number(victim.freezeUntil) || 0, now + 1000);
    }
  }
  if (targetMarker) {
    const victim = room.get(target)?.state || sim?.entries?.get(target);
    if (room.has(target)) takeMovement(victim, victim._combat, victim.x, victim.y, now);
    victim.slowPct = Math.max(now < Number(victim.slowUntil) ? Number(victim.slowPct) || 0 : 0, 10);
    victim.slowUntil = Math.max(Number(victim.slowUntil) || 0, now + 10000);
  }
  if (hyperionGa) {
    const victim = room.get(target)?.state || sim?.entries?.get(target);
    if (room.has(target)) takeMovement(victim, victim._combat, victim.x, victim.y, now);
    const map = String(sim?.mapId || state.serverMap || "").toLowerCase();
    const slowPct = /^4(-|$|\.)/.test(map) || /-4\.1$/.test(map) ? 40 : 80;
    victim.slowPct = Math.max(now < Number(victim.slowUntil) ? Number(victim.slowPct) || 0 : 0, slowPct);
    victim.slowUntil = Math.max(Number(victim.slowUntil) || 0, fx.until);
  }
  if (hyperionQa) state._qaWindow = { target, readyAt: fx.until, until: fx.until + 10000, fired: false, remaining: HYPERION_QA_DAMAGE };
  try {
    if (!state._abilityFx || typeof state._abilityFx !== "object") state._abilityFx = {};
    // Les casts instantanés (durée 0, non-toggle) ne laissent pas d'aura :
    // seul le skillFx immédiat est visible (flash). On les stocke quand
    // même 3 s pour les rooms à faible cadence ? Non : snapshot seul.
    if (hasDuration || isToggle || movementEffect || key === "ability_solace") state._abilityFx[key] = fx;
  } catch {}
  // Orcus Assimilation : la conversion 80 % dégâts -> PV doit valoir aussi
  // contre les joueurs (le client n'adopte que les baisses serveur).
  if (key === "ability_orcus_assimilate" || key === "ability_orcus-plus_assimilate") {
    try { state._orcusUntil = fx.until; } catch {}
  }
  // One-shots instantanés (Tir chargé) : pas d'aura, mais une fenêtre
  // d'exécution single-shot vérifiée au moment du hit (beam ~3 s après
  // le cast). Sans elle, l'enveloppe du profil rejetterait le 100 % vie.
  if (key === "ability_retiarus_chs" || key === "ability_retiarus-plus_chsp") {
    try { state._execWindow = { key, target, readyAt: now + durSec * 1000, until: now + durSec * 1000 + EXEC_WINDOW_MS }; } catch {}
  }
  if (key === "ability_solace" || key === "ability_solace-plus_nano-cluster-repairer-plus") {
    const before = state.hp;
    state.hp = Math.min(state.hpMax, state.hp + state.hpMax * (key === "ability_solace" ? profile.baseId === "centurion" ? 0.2 : 0.35 : 1));
    emitAbilityEvent(room, { t: "skillFx", skill: key, phase: "heal", by: id, target: id,
      amount: Math.round(state.hp - before), hp: state.hp, sh: state.sh, at: now, until: now });
  }
  if (!isAbilityFxBroadcastable(key) && !hasDuration && !isToggle) {
    // Soins instantanés : rien à diffuser (ni aura ni flash).
    return true;
  }
  // Brouillage JAMX/Creed (zone) + Neutralizing (mono-cible) : les victimes
  // joueurs sont brouillées (locks coupés + modules verrouillés côté client,
  // via snapshot jamT). Valeurs officielles : 500px/3s, 1000px/6s, 3s.
  try {
    if (key === "ability_spearhead_jam-x" || key === "ability_spearhead-plus_jamx-creed") {
      const radius = key === "ability_spearhead-plus_jamx-creed" ? 1000 : 500;
      const dur = key === "ability_spearhead-plus_jamx-creed" ? 6000 : 3000;
      for (const [, pentry] of room) {
        const ps = pentry?.state;
        if (!ps || ps === state || ps.pvpDead === true || !(Number(ps.hp) > 0)) continue;
        const dx = Number(ps.x) - Number(state.x), dy = Number(ps.y) - Number(state.y);
        if (dx * dx + dy * dy > radius * radius) continue;
        jamPlayerAbilities(ps, room, now, dur);
      }
      for (const npc of sim?.entries?.values() || []) {
        if (!(npc.hp > 0) || Math.hypot(Number(npc.x) - Number(state.x), Number(npc.y) - Number(state.y)) > radius) continue;
        npc.jamUntil = Math.max(Number(npc.jamUntil) || 0, now + dur);
        npc.cube = null;
      }
    } else if (key === "ability_spearhead-plus_neutralizing-marker") {
      const foe = room.get(String(msg.target));
      if (foe && foe !== null && foe.state && foe.state !== state
        && foe.state.pvpDead !== true && Number(foe.state.hp) > 0) {
        foe.state._jamUntil = Math.max(Number(foe.state._jamUntil) || 0, now + 3000);
      }
    }
  } catch {}
  try {
    broadcastRoom(room, JSON.stringify({ t: "skillFx", skill: key, by: id, at: now,
      until: fx.until, x: fx.x, y: fx.y, target: fx.target, ...(voltChain ? { chain: voltChain } : {}) }));
  } catch {}
  return true;
}
import { loadServerMaps, mapTransition, validArrival, reviveArrival, baseArrival, respawnMap } from "./MAP_RULES.js";
import { getFactionHomeMap } from "../SRC/CORE/FACTIONS.js";
import { handleSocialMessage, socialPeerGone, socialPeerChanged, socialDescribeGroup, socialGroupOf } from "./SOCIAL_ROOM.js";
import { getAuctionSync, handleAuctionBid, pollAuctionCycle, auctionRoomStatus } from "./AUCTION_ROOM.js";
import { getStationSync, handleStationInstall, handleStationUninstall, handleStationBuild, handleStationReplace, handleStationCancelReplace, handleStationRepair, handleStationDeflectToggle, handleStationHit, hasStationMap, getStationDefense, stationShotReady, stationShotFired, isStationFoe, isStationRetaliation, applyStationPassiveHeal, getClanBaseBonuses, getStationOwners } from "./STATION_ROOM.js";
import { GAME_VERSION } from "../SRC/DATA/VERSION.js";
import { COLLECTABLE_TYPES } from "../SRC/DATA/COLLECTABLES.js";
import { HALLOWEEN_END, HALLOWEEN_START, HALLOWEEN_TIME_ZONE, isHalloweenBossVariant, isHalloweenEventActive } from "../NPC/NPC_HALLOWEEN.js";
import { SUNDAY_MODULE_CHANCE, SUNDAY_RARE_CHANCE, SUNDAY_TICKET_CHANCE, SUNDAY_TICKET_QTY, SUNDAY_AMMO_CHANCE, SUNDAY_AMMO_TYPE, SUNDAY_AMMO_QTY, isSundayBossVariant } from "../NPC/NPC_SUNDAY.js";
import { GROUP_BOOSTER_BONUS } from "../SRC/DATA/BOOSTERS.js";
import { STARMAP_JUMP_REUSE_SEC } from "../SRC/DATA/STARMAP.js";

const serverMaps = await loadServerMaps();
const securityStates = new Map();
const accountSockets = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [pid, saved] of securityStates) {
    if (!accountSockets.has(pid) && now - Number(saved.updatedAt || 0) > 24 * 3600_000) securityStates.delete(pid);
  }
}, 60_000).unref?.();

function swapFxRemaining(state, now) {
  return Math.max(0, Math.min(Number(state._swapFxDuration) || 3, state._swapFxPaused
    ? Number(state._swapFxRemaining) || 0 : (Number(state._swapFxUntil) - now) / 1000 || 0));
}
function syncSwapFx(state, msg, now) {
  if (!Number.isFinite(Number(msg.hswap))) return;
  // Etat purement visuel : aucun droit de mouvement ni protection contre les degats.
  const duration = Math.max(0.1, Math.min(3, Number(msg.hswapDur) || 3));
  const remaining = state.dead || state.pvpDead ? 0 : Math.max(0, Math.min(duration, Number(msg.hswap)));
  state._swapFxFromClient = true;
  state._swapFxDuration = duration;
  state._swapFxId = Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, Math.floor(Number(msg.hswapId) || 0)));
  state._swapFxRemaining = remaining;
  state._swapFxPaused = remaining > 0 && msg.hswapPaused === true;
  state._swapFxUntil = now + remaining * 1000;
}
function refreshCombatProfile(state, accountId, map, message = {}) {
  if (!accountId) return null;
  const now = Date.now();
  const requestedConfig = Number(message.config) === 2 ? 2 : Number(message.config) === 1 ? 1 : null;
  if (!state._account || now - Number(state._accountAt || 0) >= 1000
    || (message.shipId && message.shipId !== state.shipId)) {
    state._account = getAccountGameplayData(accountId, state._account);
    state._accountAt = now;
  }
  if (!state._account) return null;
  if (requestedConfig && requestedConfig !== state._config && now >= Number(state._configCdUntil || 0)) {
    state._config = requestedConfig;
    state._configCdUntil = now + 5000;
  }
  if (!state._combat || state._combatRev !== state._account.revision || state._combatMap !== map
    || (state._config && state._combat.config !== state._config)
    || now - Number(state._combatAt || 0) >= 1000) {
    const groupBoosters = {};
    for (const peer of socialDescribeGroup(state.id, { describe: describePeer })?.members || []) {
      if (peer.id === state.id || peer.online === false || peer.map !== map) continue;
      const member = findPeerState(peer.id);
      for (const id of Object.keys(GROUP_BOOSTER_BONUS)) {
        if (now < Number(member?._account?.boosters?.active?.[id] || 0)) groupBoosters[id] = (groupBoosters[id] || 0) + 1;
      }
    }
    // Les compteurs/positions du compte sont souvent inchanges. Le controle
    // d'une seconde verifie les expirations et le groupe sans reconstruire
    // tout l'equipement si les droits de combat sont toujours les memes.
    const boosterSignature = Object.entries(state._account.boosters?.active || {})
      .filter(([, until]) => now < Number(until)).map(([id]) => id).sort().join(",")
      + "|" + Object.entries(groupBoosters).sort(([a], [b]) => a.localeCompare(b)).map(([id, count]) => `${id}:${count}`).join(",");
    if (state._combat && state._combatRev === state._account.revision && state._combatMap === map
      && (!state._config || state._combat.config === state._config)
      && state._combatBoosterSignature === boosterSignature) {
      state._combatAt = now;
      state.hswap = swapFxRemaining(state, now);
      return state._combat;
    }
    const profile = combatProfile(state._account, map, state._config, groupBoosters);
    if (!profile) return null;
    const prior = state._combat;
    const shields = state._configShields || (state._configShields = {});
    const key = `${profile.hangarId}:${profile.config}`;
    if (prior) shields[`${prior.hangarId}:${prior.config}`] = Math.max(0, Number(state.sh) || 0);
    const sentinel = activeAbility(state, "ability_sentinel", now);
    const shieldMax = sentinel?.config === profile.config ? Math.floor(sentinel.baseShield * 1.1 ** Math.min(10, Math.floor((now - sentinel.from) / 1000))) : profile.shMax;
    if (state._abilityShieldMax !== shieldMax) state._shieldBuffSeq = (Number(state._shieldBuffSeq) || 0) + 1;
    state._abilityShieldMax = shieldMax;
    const disarrayRemoved = Number(state._disarrayRemoved) || 0;
    acPoolResize(state, profile.hpMax, Math.max(0, shieldMax - disarrayRemoved));
    syncDisarrayShield(state, shieldMax, Number(state._disarrayUntil) || 0, now);
    if (prior && (prior.hangarId !== profile.hangarId || prior.config !== profile.config) && !state.pvpDead && state.hp > 0) {
      state.sh = Math.min(state.shMax, shields[key] ?? state.shMax);
    }
    // Duree de l'effet portail distant, sans protection contre les degats.
    // Changement de vaisseau : les aptitudes du vaisseau ne suivent pas
    // (le nouveau récupère les siennes, comme les CDs Orcus côté client).
    // Les techs (buffs perso : leech, precision...) suivent, comme leurs
    // timers côté client.
    if (prior && prior.shipId !== profile.shipId) {
      if (!state._swapFxFromClient) state._swapFxUntil = now + 3000;
      preserveTechAurasAcrossMapChange(state);
    }
    state._combat = profile;
    state._config = profile.config;
    state._combatRev = state._account.revision;
    state._combatMap = map;
    state._combatAt = now;
    state._combatBoosterSignature = boosterSignature;
    state.shipId = profile.shipId;
    state.absorb = profile.absorb;
    state.evade = profile.evade;
    state.range = profile.range;
    state.vmax = profile.speed;
    state.moveSpeed = profile.speed;
    state.b2 = Object.keys(GROUP_BOOSTER_BONUS).filter(id => now < Number(state._account.boosters?.active?.[id] || 0));
  }
  state.hswap = swapFxRemaining(state, now);
  return state._combat;
}

const root = resolve(process.cwd());
const dataRoot = resolve(process.env.ORBIT_DATA_DIR || join(root, "SERVER_DATA"));
const portArg = process.argv.find((arg) => arg.startsWith("--port="))?.slice(7);
const PORT = Number(portArg || process.env.PORT || 8080) || 8080;
const PUBLIC_DIRS = new Set(["ASSETS", "AUDIO", "COMBAT", "DRONE", "MAPS", "NPC", "PET", "PUBLIC", "QUEST", "SHIP", "SRC", "UI"]);
const PUBLIC_FILES = new Set(["index.html", "admin.html", "style.css", "ASSETS_MANIFEST.json"]);
// Anti-cheat : voir SCRIPTS/ANTICHEAT.js (module pur, testable).
// Les constantes/helpers locaux ont migré là-bas.

// Compteurs d'audit anticheat par joueur (strictement serveur : kills
// crédités, boxes acceptées, dégâts appliqués). Fenêtre 10 s, voir
// acAuditScore dans ANTICHEAT.js.
function audOf(state) {
  const a = state && state._audit && typeof state._audit === "object" ? state._audit : null;
  if (a) return a;
  const fresh = { t: Date.now(), kills: 0, boxes: 0, dmg: 0, score: 0, strikes: 0, last: null, teleAt: 0 };
  if (state && typeof state === "object") state._audit = fresh;
  return fresh;
}
function findPeerState(pid) {
  const id = String(pid || "");
  if (!id) return null;
  for (const [, room] of rooms) {
    const e = room.get(id);
    if (e && e.state) return e.state;
  }
  const ie = instancePeers.get(id);
  return ie && ie.state ? ie.state : null;
}

function publicRelativePath(pathname) {
  const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const parts = relative.split(/[\\/]+/).filter(Boolean);
  if (!parts.length) return "index.html";
  if (!PUBLIC_FILES.has(parts[0]) && !PUBLIC_DIRS.has(parts[0])) throw new Error("Private path");
  if (parts.some((part) => part.startsWith(".") || part === "node_modules" || part === "SERVER_DATA" || part === "SCRIPTS")) throw new Error("Private path");
  return relative;
}

function setSecurityHeaders(response) {
  response.setHeader("x-content-type-options", "nosniff");
  response.setHeader("referrer-policy", "same-origin");
  response.setHeader("x-frame-options", "DENY");
  response.setHeader("permissions-policy", "camera=(), microphone=(), geolocation=()");
  response.setHeader("cross-origin-resource-policy", "same-origin");
}

// --- Panneau admin (/admin.html) : mot de passe via ORBIT_ADMIN_PASS,
// sinon genere une fois et persiste dans SERVER_DATA/.admin_pass
// (retrouvable en SSH via `cat SERVER_DATA/.admin_pass`, jamais dans git).
const ADMIN_PASS_FILE = join(dataRoot, ".admin_pass");
function loadOrCreateAdminPass() {
  const env = String(process.env.ORBIT_ADMIN_PASS || "").trim();
  if (env) return { pass: env, fromFile: false };
  try {
    const saved = String(readFileSync(ADMIN_PASS_FILE, "utf8") || "").trim();
    if (saved && saved.length <= 256) return { pass: saved, fromFile: true };
  } catch {}
  const gen = `admin_${randomBytes(8).toString("hex")}`;
  try {
    mkdirSync(dirname(ADMIN_PASS_FILE), { recursive: true });
    writeFileSync(ADMIN_PASS_FILE, gen, { mode: 0o600 });
  } catch {}
  return { pass: gen, fromFile: true };
}
const { pass: ADMIN_PASS, fromFile: ADMIN_PASS_PERSISTED } = loadOrCreateAdminPass();
const adminFailures = new Map();
const chatMutes = new Set(); // ids prives de chat (persistants, ids stables)

// --- Bannissements temporaires (panneau admin) : bloques par compte (id
// stable) + par pseudo (anti-evasion par deconnexion). Persistes dans
// SERVER_DATA/bans.json, expiration paresseuse (nettoyes a la lecture).
const BANS_FILE = join(dataRoot, "bans.json");
let bans = new Map(); // key -> { key, pseudo, reason, until (ms|null), at }
try {
  const raw = JSON.parse(readFileSync(BANS_FILE, "utf8") || "{}");
  if (raw && typeof raw === "object") {
    for (const [k, v] of Object.entries(raw)) {
      if (!v || typeof v !== "object") continue;
      bans.set(String(k).slice(0, 128), {
        key: String(k).slice(0, 128),
        pseudo: String(v.pseudo || "?").slice(0, 20),
        reason: String(v.reason || "Comportement inapproprié.").slice(0, 200),
        until: v.until == null ? null : Math.max(0, Number(v.until) || 0),
        at: Math.max(0, Number(v.at) || 0),
      });
    }
  }
} catch {}
function saveBans() {
  try { writeFileSync(BANS_FILE, JSON.stringify(Object.fromEntries(bans))); } catch {}
}
function banKeysFor(id, pseudo) {
  const keys = [];
  if (String(id || "").startsWith("u_")) keys.push(String(id).slice(0, 128));
  const pn = String(pseudo || "").trim().toLowerCase();
  if (pn) keys.push(`pseudo:${pn}`.slice(0, 128));
  return keys;
}
function getActiveBan(id, pseudo) {
  const now = Date.now();
  let changed = false, found = null;
  for (const k of banKeysFor(id, pseudo)) {
    const b = bans.get(k);
    if (!b) continue;
    if (b.until != null && Number(b.until) <= now) { bans.delete(k); changed = true; continue; }
    if (!found) found = b;
  }
  if (changed) saveBans();
  return found;
}
function adminAuthed(request) {
  const ip = String(request.socket?.remoteAddress || "unknown");
  const now = Date.now();
  const failure = adminFailures.get(ip);
  if (failure && now < failure.reset && failure.count >= 10) return false;
  const tok = String(request.headers?.["x-admin-token"] || "").trim();
  let ok = false;
  if (tok !== "" && tok.length <= 256) {
    try {
      const actual = Buffer.from(tok, "utf8");
      const expected = Buffer.from(ADMIN_PASS, "utf8");
      ok = actual.length === expected.length && timingSafeEqual(actual, expected);
    } catch {}
  }
  if (ok) {
    adminFailures.delete(ip);
    return true;
  }
  if (!failure || now >= failure.reset) adminFailures.set(ip, { count: 1, reset: now + 60_000 });
  else failure.count++;
  return false;
}
function adminJson(response, code, obj) {
  response.writeHead(code, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  response.end(JSON.stringify(obj));
}
function readJsonBody(request) {
  return new Promise((resolve) => {
    let size = 0;
    const chunks = [];
    request.on("data", (c) => {
      size += c.length;
      if (size > 100_000) { resolve(null); try { request.destroy(); } catch {} return; }
      chunks.push(c);
    });
    request.on("end", () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))); }
      catch { resolve(null); }
    });
    request.on("error", () => resolve(null));
  });
}
function handleAdminApi(request, response, pathname) {
  if (!pathname.startsWith("/api/admin/")) return false;
  if (!adminAuthed(request)) { adminJson(response, 401, { ok: false, error: "Non autorise." }); return true; }
  const now = Date.now();
  if (pathname === "/api/admin/peers" && request.method === "GET") {
    const peers = [];
    for (const [map, room] of rooms) {
      for (const [pid, entry] of room) {
        const s = entry?.state || {};
        peers.push({
          id: String(pid), pseudo: String(s.pseudo || "Pilote").slice(0, 20),
          authed: String(pid).startsWith("u_"), map,
          x: Math.round(Number(s.x) || 0), y: Math.round(Number(s.y) || 0),
          dead: s.dead === true, muted: chatMutes.has(String(pid)),
          connectedSec: Math.max(0, Math.round((now - Number(s.connectedAt || now)) / 1000)),
        });
      }
    }
    // Joueurs en instance perso (Galaxy Gates : alpha/beta/gamma/delta/epsilon/zeta/kappa/lambda/kronos) : hors
    // room mais connectés — visibles ici avec le badge gate.
    for (const [pid, entry] of instancePeers) {
      const s = entry?.state || {};
      peers.push({
        id: String(pid), pseudo: String(s.pseudo || "Pilote").slice(0, 20),
        authed: String(pid).startsWith("u_"), map: String(entry.mapId || s.map || "?"),
        x: Math.round(Number(s.x) || 0), y: Math.round(Number(s.y) || 0),
        dead: s.dead === true, muted: chatMutes.has(String(pid)),
        connectedSec: Math.max(0, Math.round((now - Number(s.connectedAt || now)) / 1000)),
        instance: true,
      });
    }
    adminJson(response, 200, { ok: true, peers, count: peers.length });
    return true;
  }
  if (pathname === "/api/admin/chat" && request.method === "GET") {
    // Tchat en direct pour le panneau admin (lire l'historique global).
    // Répondre = POST /api/admin/broadcast (message [ADMIN] à tous).
    adminJson(response, 200, { ok: true, list: chatHistory.slice(-40) });
    return true;
  }
  if (pathname === "/api/admin/bans" && request.method === "GET") {
    // Liste des bannissements actifs (expirés purgés).
    getActiveBan("", "");
    adminJson(response, 200, { ok: true, bans: [...bans.values()] });
    return true;
  }
  if (pathname === "/api/admin/cheat" && request.method === "GET") {
    // Anticheat : dossiers gelés en attente de modération + suspects live
    // (score d'audit > 0). Libérer = unban existant ; bannir définitif =
    // ban existant (écrase le gel).
    getActiveBan("", "");
    const holds = [];
    for (const [key, b] of bans) {
      if (!b || b.cheatHold !== true) continue;
      holds.push({
        key, pseudo: String(b.pseudo || ""), reason: String(b.reason || ""),
        at: Number(b.at) || 0,
        evidence: b.evidence && typeof b.evidence === "object" ? b.evidence : null,
      });
    }
    holds.sort((x, y) => y.at - x.at);
    const suspects = [];
    const seen = new Set();
    const collect = (pid, st, map, online = true) => {
      const a = st && st._audit;
      const recent = st?._security && Date.now() - st._security.last.at < 300000;
      if (!a || (!(Number(a.score) > 0) && !recent)) return;
      if (seen.has(pid)) return;
      seen.add(pid);
      suspects.push({
        id: pid, pseudo: String(st.pseudo || ""), online, map: map || null,
        score: Math.round(Number(a.score) || 0), strikes: Number(a.strikes || 0),
        last: a.last && typeof a.last === "object" ? a.last : null,
        security: st._security || null,
        clockBlocked: st._clockGuard?.blocked === true,
      });
    };
    for (const [map, room] of rooms) {
      for (const [pid, e] of room) { if (e && e.state) collect(pid, e.state, map, e.ws?.readyState === 1); }
    }
    for (const [pid, e] of instancePeers) {
      if (e && e.state) collect(pid, e.state, e.mapId || null, e.ws?.readyState === 1);
    }
    // Une deconnexion ne fait pas disparaitre les derniers signalements.
    for (const [pid, st] of securityStates) collect(pid, st, st.serverMap, false);
    suspects.sort((x, y) => y.score - x.score);
    adminJson(response, 200, { ok: true, holds, suspects: suspects.slice(0, 100) });
    return true;
  }
  if (pathname === "/api/admin/ships" && request.method === "GET") {
    // Familles de vaisseaux pour le select "give module" du panneau admin.
    adminJson(response, 200, { ok: true, ships: adminShipFamilies() });
    return true;
  }
  if (pathname === "/api/admin/drone-designs" && request.method === "GET") {
    // Designs de drones pour le select "give design" du panneau admin.
    adminJson(response, 200, { ok: true, designs: adminDroneDesigns() });
    return true;
  }
  if (pathname === "/api/admin/accounts" && request.method === "GET") {
    // Tous les comptes (connectés + hors ligne) + invités connectés.
    // Mêmes actions que les connectés : mute/ban/give par id/pseudo.
    // Kick réservé aux connectés (ok:false si hors ligne).
    const liveById = new Map();
    for (const [map, room] of rooms) {
      for (const [pid, entry] of room) {
        const s = entry?.state || {};
        liveById.set(String(pid), {
          id: String(pid), pseudo: String(s.pseudo || "Pilote").slice(0, 20),
          authed: String(pid).startsWith("u_"), map,
          x: Math.round(Number(s.x) || 0), y: Math.round(Number(s.y) || 0),
          dead: s.dead === true, muted: chatMutes.has(String(pid)),
          connectedSec: Math.max(0, Math.round((now - Number(s.connectedAt || now)) / 1000)),
          instance: false,
        });
      }
    }
    for (const [pid, entry] of instancePeers) {
      const s = entry?.state || {};
      liveById.set(String(pid), {
        id: String(pid), pseudo: String(s.pseudo || "Pilote").slice(0, 20),
        authed: String(pid).startsWith("u_"), map: String(entry.mapId || s.map || "?"),
        x: Math.round(Number(s.x) || 0), y: Math.round(Number(s.y) || 0),
        dead: s.dead === true, muted: chatMutes.has(String(pid)),
        connectedSec: Math.max(0, Math.round((now - Number(s.connectedAt || now)) / 1000)),
        instance: true,
      });
    }
    let accounts = [];
    try { accounts = adminListAccounts() || []; } catch { accounts = []; }
    const out = accounts.map((a) => {
      const live = liveById.get(String(a.id)) || null;
      const ban = getActiveBan(String(a.id), String(a.pseudo));
      return {
        ...a,
        online: !!live,
        map: live ? live.map : null,
        x: live ? live.x : null,
        y: live ? live.y : null,
        dead: live ? live.dead : null,
        muted: chatMutes.has(String(a.id)),
        connectedSec: live ? live.connectedSec : null,
        instance: live ? live.instance === true : false,
        banned: !!ban,
        banUntil: ban ? (ban.until != null ? Number(ban.until) : null) : null,
        banReason: ban ? String(ban.reason || "") : null,
      };
    });
    // Invités connectés (sans compte) : pas de fiche hors ligne possible.
    const guests = [...liveById.values()].filter((p) => !String(p.id).startsWith("u_"));
    const onlineCount = [...liveById.keys()].length;
    adminJson(response, 200, { ok: true, accounts: out, guests, onlineCount, total: out.length });
    return true;
  }
  if ((pathname === "/api/admin/broadcast" || pathname === "/api/admin/kick" || pathname === "/api/admin/mute" || pathname === "/api/admin/debug-account" || pathname === "/api/admin/give" || pathname === "/api/admin/give-exp" || pathname === "/api/admin/give-honor" || pathname === "/api/admin/give-module" || pathname === "/api/admin/give-title" || pathname === "/api/admin/reset-gg" || pathname === "/api/admin/give-gg" || pathname === "/api/admin/give-drone-design" || pathname === "/api/admin/ban" || pathname === "/api/admin/unban" || pathname === "/api/admin/delete" || pathname === "/api/admin/cheat-hold") && request.method === "POST") {
    readJsonBody(request).then((body) => {
      try {
        if (pathname === "/api/admin/debug-account") {
          const res = adminDebugAccount(String(body?.id || body?.pseudo || ""));
          if (!res || res.ok !== true) {
            adminJson(response, res?.error === "Compte introuvable." ? 404 : 400, res || { ok: false, error: "Correction impossible." });
            return;
          }
          const pid = String(res.pid || "");
          let victimWs = null;
          for (const [, room] of rooms) {
            const entry = room.get(pid);
            if (entry?.ws) { victimWs = entry.ws; break; }
          }
          if (!victimWs) victimWs = instancePeers.get(pid)?.ws || null;
          if (pid) {
            peerNoGrace.set(pid, Date.now());
            removeFromAllRooms(pid);
            securityStates.delete(pid);
          }
          if (victimWs) {
            try { victimWs.send(JSON.stringify({ t: "adminKick", reason: "Compte remis en etat par l'admin. Reconnecte-toi." })); } catch {}
            setTimeout(() => { try { victimWs.close(); } catch {} }, 400);
          }
          adminJson(response, 200, res);
          return;
        }
        if (pathname === "/api/admin/delete") {
          // Suppression DEFINITIVE d'un compte : users, sessions, pvp_stats,
          // npc_reward_tx, amis + demandes (les deux sens). Le classement et
          // les listes d'amis sont dérivés de ces tables : le joueur
          // disparaît partout comme s'il n'avait jamais existé.
          const res = adminDeleteAccount(String(body?.id || body?.pseudo || ""));
          if (!res || res.ok !== true) {
            adminJson(response, 404, res || { ok: false, error: "Compte introuvable." });
            return;
          }
          try {
            const pid = String(res.pid || "");
            const pseudoNorm = String(res.pseudo || "").trim().toLowerCase();
            // Purge bannissements + mute liés au compte supprimé.
            let bansChanged = false;
            if (pid && bans.delete(pid)) bansChanged = true;
            const pseudoKey = pseudoNorm ? `pseudo:${pseudoNorm}`.slice(0, 128) : "";
            if (pseudoKey && bans.delete(pseudoKey)) bansChanged = true;
            if (bansChanged) saveBans();
            if (pid) chatMutes.delete(pid);
            // Déconnexion live si connecté (rooms + instances).
            let victimWs = null;
            for (const [, room] of rooms) {
              const entry = room.get(pid);
              if (entry?.ws) { victimWs = entry.ws; break; }
            }
            if (!victimWs) {
              const ie = instancePeers.get(pid);
              if (ie?.ws) victimWs = ie.ws;
            }
            if (victimWs) {
              try {
                if (victimWs.readyState === 1) victimWs.send(JSON.stringify({ t: "adminKick", reason: "Compte supprimé par l'admin." }));
              } catch {}
            }
            if (pid) removeFromAllRooms(pid);
            if (pid) peerNoGrace.set(pid, Date.now());
            if (victimWs) {
              const ws = victimWs;
              setTimeout(() => { try { ws.close(); } catch {} }, 500);
            }
            // Groupes : éjecte le fantôme des groupes en mémoire.
            try {
              socialPeerGone(pid, {
                id: pid, state: { pseudo: res.pseudo }, authed: true,
                send: () => {},
                sendTo: (to, obj) => sendToPeer(to, obj),
                findByPseudo: (pseudo) => findPeerByPseudo(pseudo),
                describe: (p) => (String(p) === pid
                  ? { id: pid, pseudo: String(res.pseudo || "Pilote").slice(0, 20), online: false }
                  : describePeer(p)),
              }, { graceMs: 0 });
            } catch {}
            // Amis : refresh live de leur liste + présence hors ligne.
            try {
              for (const fid of (res.affected || [])) {
                const fpid = `u_${String(fid)}`;
                sendToPeer(fpid, { t: "friendsChanged" });
                sendToPeer(fpid, { t: "friendOnline", id: pid, pseudo: String(res.pseudo || "Pilote").slice(0, 20), online: false, map: "", shipId: "", instance: false, inGroup: false });
              }
            } catch {}
            try {
              const rawUid = String(res.id || "");
              if (rawUid) notifyFriendPresence(rawUid, false);
            } catch {}
          } catch {}
          adminJson(response, 200, res);
          return;
        }
        if (pathname === "/api/admin/give") {
          // GiveCredit : pseudo + quantité (négatif = retirer). Notifie le
          // joueur s'il est connecté ; sinon récupéré à sa prochaine synchro.
          const res = adminGiveCredits(String(body?.pseudo || ""), body?.amount);
          if (!res || res.ok !== true) {
            adminJson(response, res?.error === "Compte introuvable." ? 404 : 400, res || { ok: false, error: "Montant invalide." });
            return;
          }
          try {
            const peer = findPeerByPseudo(res.pseudo);
            if (peer) {
              const txt = `L'admin t'a ${res.given > 0 ? "donné" : "retiré"} ${Math.abs(res.given).toLocaleString("fr-FR")} crédits. Nouveau solde : ${res.after.toLocaleString("fr-FR")}.`;
              sendToPeer(peer.id, { t: "chatMsg", from: "[ADMIN]", text: txt, at: Date.now(), by: "admin" });
            }
          } catch {}
          adminJson(response, 200, res);
          return;
        }
        if (pathname === "/api/admin/give-exp") {
          const res = adminGiveExperience(String(body?.pseudo || ""), body?.amount);
          if (!res || res.ok !== true) {
            adminJson(response, res?.error === "Compte introuvable." ? 404 : 400, res || { ok: false, error: "Montant invalide." });
            return;
          }
          try {
            const peer = findPeerByPseudo(res.pseudo);
            if (peer) {
              const txt = `L'admin t'a ${res.given > 0 ? "donné" : "retiré"} ${Math.abs(res.given).toLocaleString("fr-FR")} EXP. Nouveau total : ${res.after.toLocaleString("fr-FR")}.`;
              sendToPeer(peer.id, { t: "chatMsg", from: "[ADMIN]", text: txt, at: Date.now(), by: "admin" });
            }
          } catch {}
          adminJson(response, 200, res);
          return;
        }
        if (pathname === "/api/admin/give-honor") {
          const res = adminGiveHonor(String(body?.pseudo || ""), body?.amount);
          if (!res || res.ok !== true) {
            adminJson(response, res?.error === "Compte introuvable." ? 404 : 400, res || { ok: false, error: "Montant invalide." });
            return;
          }
          try {
            const peer = findPeerByPseudo(res.pseudo);
            if (peer) {
              const txt = `L'admin t'a ${res.given > 0 ? "donné" : "retiré"} ${Math.abs(res.given).toLocaleString("fr-FR")} honneur. Nouveau total : ${res.after.toLocaleString("fr-FR")}.`;
              sendToPeer(peer.id, { t: "chatMsg", from: "[ADMIN]", text: txt, at: Date.now(), by: "admin" });
            }
          } catch {}
          adminJson(response, 200, res);
          return;
        }
        if (pathname === "/api/admin/give-module") {
          // Give module roulette : pseudo + famille vaisseau + stat + %.
          // Notifie le joueur s'il est connecté ; sinon récupéré à sa synchro.
          const res = adminGiveModule(String(body?.pseudo || ""), String(body?.shipId || ""), String(body?.stat || ""), body?.pct);
          if (!res || res.ok !== true) {
            adminJson(response, res?.error === "Compte introuvable." ? 404 : 400, res || { ok: false, error: "Paramètres invalides." });
            return;
          }
          try {
            const peer = findPeerByPseudo(res.pseudo);
            if (peer) {
              const b = res.module?.bonuses?.[0] || {};
              const txt = `L'admin t'a donné un module ${res.module?.shipId} : ${b.pct > 0 ? "+" : ""}${b.pct}% ${b.stat}.`;
              sendToPeer(peer.id, { t: "chatMsg", from: "[ADMIN]", text: txt, at: Date.now(), by: "admin" });
            }
          } catch {}
          adminJson(response, 200, res);
          return;
        }
        if (pathname === "/api/admin/give-title") {
          // Give un titre cadeau : pseudo + texte libre + couleur hexa.
          // Le joueur le voit débloqué dans sa fenêtre Titre à sa synchro.
          const res = adminGiveTitle(String(body?.pseudo || ""), String(body?.name || ""), String(body?.color || ""));
          if (!res || res.ok !== true) {
            adminJson(response, res?.error === "Compte introuvable." ? 404 : 400, res || { ok: false, error: "Paramètres invalides." });
            return;
          }
          try {
            const peer = findPeerByPseudo(res.pseudo);
            if (peer) {
              const txt = `L'admin t'a donné le titre « ${res.title?.name} » (fenêtre Titres).`;
              sendToPeer(peer.id, { t: "chatMsg", from: "[ADMIN]", text: txt, at: Date.now(), by: "admin" });
            }
          } catch {}
          adminJson(response, 200, res);
          return;
        }
        if (pathname === "/api/admin/give-gg") {          // Ajoute +1 complétion Galaxy Gate (pseudo + gate ou "all"), +1 pièce Kronos.
          // L'anneau doré apparaît à la prochaine synchro du joueur.
          const res = adminGiveGalaxyGate(String(body?.pseudo || ""), String(body?.gate || ""));
          if (!res || res.ok !== true) {
            adminJson(response, res?.error === "Compte introuvable." ? 404 : 400, res || { ok: false, error: "Paramètres invalides." });
            return;
          }
          try {
            const peer = findPeerByPseudo(res.pseudo);
            if (peer) {
              const names = (res.gates || []).map((g) => {
                const n = Number(res.after?.[g]);
                return String(g).slice(0, 1).toUpperCase() + String(g).slice(1) + (Number.isFinite(n) ? ` x${n}` : "");
              });
              const txt = `L'admin t'a ajouté la GG ${names.join(", ")} (anneau ajouté).`;
              sendToPeer(peer.id, { t: "chatMsg", from: "[ADMIN]", text: txt, at: Date.now(), by: "admin" });
            }
          } catch {}
          adminJson(response, 200, res);
          return;
        }
        if (pathname === "/api/admin/give-drone-design") {
          // Donne un design de drone (pseudo + design + quantité 1-99).
          const res = adminGiveDroneDesign(String(body?.pseudo || ""), String(body?.design || ""), body?.count);
          if (!res || res.ok !== true) {
            adminJson(response, res?.error === "Compte introuvable." ? 404 : 400, res || { ok: false, error: "Paramètres invalides." });
            return;
          }
          try {
            const peer = findPeerByPseudo(res.pseudo);
            if (peer) {
              const txt = `L'admin t'a donné ${res.given}x design ${res.name} (stock : ${res.after}).`;
              sendToPeer(peer.id, { t: "chatMsg", from: "[ADMIN]", text: txt, at: Date.now(), by: "admin" });
            }
          } catch {}
          adminJson(response, 200, res);
          return;
        }
        if (pathname === "/api/admin/reset-gg") {
          // Retire la complétion d'une Galaxy Gate (pseudo + gate ou "all").
          // L'anneau doré disparaît à la prochaine synchro du joueur.
          const res = adminResetGalaxyGate(String(body?.pseudo || ""), String(body?.gate || ""));
          if (!res || res.ok !== true) {
            adminJson(response, res?.error === "Compte introuvable." ? 404 : 400, res || { ok: false, error: "Paramètres invalides." });
            return;
          }
          try {
            const peer = findPeerByPseudo(res.pseudo);
            if (peer) {
              const names = (res.gates || []).map((g) => String(g).slice(0, 1).toUpperCase() + String(g).slice(1));
              const txt = `L'admin t'a retiré la GG ${names.join(", ")} (anneau retiré).`;
              sendToPeer(peer.id, { t: "chatMsg", from: "[ADMIN]", text: txt, at: Date.now(), by: "admin" });
            }
          } catch {}
          adminJson(response, 200, res);
          return;
        }
        if (pathname === "/api/admin/broadcast") {
          const text = String(body?.text || "").replace(/\s+/g, " ").trim().slice(0, 200);
          if (!text) { adminJson(response, 400, { ok: false, error: "Message vide." }); return; }
          const entry = { from: "[ADMIN]", text, at: Date.now(), by: "admin", adminBlast: true };
          chatHistory.push(entry);
          if (chatHistory.length > 40) chatHistory.splice(0, chatHistory.length - 40);
          broadcastAll(JSON.stringify({ t: "chatMsg", ...entry }));
          adminJson(response, 200, { ok: true });
          return;
        }
        if (pathname === "/api/admin/unban") {
          const key = String(body?.key || "").slice(0, 128);
          const removed = key ? bans.delete(key) : false;
          if (removed) saveBans();
          if (key && key.startsWith("u_")) chatMutes.delete(key);
          adminJson(response, 200, { ok: removed });
          return;
        }
        if (pathname === "/api/admin/ban") {
          // Bannissement temporaire : id (connecté) ou pseudo (connecté ou
          // non). Bloque la CONNEXION jusqu'à expiration (null = définitif).
          // Victime déconnectée aussitôt (popup motif + date), message
          // [Système] public, persistance bans.json.
          let targetId = String(body?.id || "").slice(0, 128);
          let targetPseudo = String(body?.pseudo || "").trim().slice(0, 20);
          let peerWs = null;
          if (targetId || targetPseudo) {
            outer: {
              for (const [, room] of rooms) {
                for (const [pid, entry] of room) {
                  if ((targetId && String(pid) === targetId)
                    || (targetPseudo && String(entry?.state?.pseudo || "").trim().toLowerCase() === targetPseudo.toLowerCase())) {
                    targetId = String(pid);
                    targetPseudo = String(entry?.state?.pseudo || targetPseudo || "Pilote").slice(0, 20);
                    peerWs = entry?.ws || null;
                    break outer;
                  }
                }
              }
              for (const [pid, entry] of instancePeers) {
                if ((targetId && String(pid) === targetId)
                  || (targetPseudo && String(entry?.state?.pseudo || "").trim().toLowerCase() === targetPseudo.toLowerCase())) {
                  targetId = String(pid);
                  targetPseudo = String(entry?.state?.pseudo || targetPseudo || "Pilote").slice(0, 20);
                  peerWs = entry?.ws || null;
                  break outer;
                }
              }
            }
          }
          const keys = banKeysFor(targetId.startsWith("u_") ? targetId : "", targetPseudo);
          if (!keys.length) { adminJson(response, 400, { ok: false, error: "Pseudo ou id manquant." }); return; }
          let durationMs = body?.durationMs == null ? null : Math.floor(Number(body.durationMs));
          if (durationMs != null) {
            if (!Number.isFinite(durationMs) || durationMs <= 0) { adminJson(response, 400, { ok: false, error: "Durée invalide." }); return; }
            durationMs = Math.min(durationMs, 5 * 365 * 86400_000); // plafond 5 ans
          }
          const reason = String(body?.reason || "Comportement inapproprié.").replace(/\s+/g, " ").trim().slice(0, 200) || "Comportement inapproprié.";
          const until = durationMs == null ? null : Date.now() + durationMs;
          for (const k of keys) {
            bans.set(k, { key: k, pseudo: targetPseudo || k, reason, until, at: Date.now() });
          }
          saveBans();
          if (targetId) chatMutes.add(targetId);
          // Déconnexion immédiate si connecté (popup motif + date côté client).
          if (peerWs) {
            try {
              if (peerWs.readyState === 1) peerWs.send(JSON.stringify({ t: "banned", reason, until }));
            } catch {}
            if (targetId) removeFromAllRooms(targetId);
            if (targetId) peerNoGrace.set(targetId, Date.now());
            const victimWs = peerWs;
            setTimeout(() => { try { victimWs.close(); } catch {} }, 800);
          }
          // Message [Système] public (tchat seul, pas de bannière).
          const sysEntry = { from: "[Système]", text: `Un joueur a été banni. Motif : ${reason}`, at: Date.now(), by: "admin" };
          chatHistory.push(sysEntry);
          if (chatHistory.length > 40) chatHistory.splice(0, chatHistory.length - 40);
          broadcastAll(JSON.stringify({ t: "chatMsg", ...sysEntry }));
          adminJson(response, 200, { ok: true, pseudo: targetPseudo, reason, until });
          return;
        }
        if (pathname === "/api/admin/cheat-hold") {
          // Gel manuel anticheat (modération) : kick + gel du compte en
          // attente d'examen, comme la sanction auto. Pseudo ou id.
          const targetId = String(body?.id || "").slice(0, 128);
          const targetPseudo = String(body?.pseudo || "").trim().slice(0, 20);
          const reason = String(body?.reason || "Dossier anticheat — en cours d'examen par la modération.").replace(/\s+/g, " ").trim().slice(0, 200);
          let pid = "";
          if (targetId) {
            pid = targetId;
          } else if (targetPseudo) {
            const low = targetPseudo.toLowerCase();
            outer: {
              for (const [, room] of rooms) {
                for (const [rid, entry] of room) {
                  if (String(entry?.state?.pseudo || "").trim().toLowerCase() === low) { pid = String(rid); break outer; }
                }
              }
              for (const [rid, entry] of instancePeers) {
                if (String(entry?.state?.pseudo || "").trim().toLowerCase() === low) { pid = String(rid); break outer; }
              }
            }
          }
          if (!pid) {
            // Hors ligne : gel par clé pseudo (bloqué à la prochaine connexion).
            if (!targetPseudo) { adminJson(response, 400, { ok: false, error: "Pseudo ou id manquant." }); return; }
            const key = `pseudo:${targetPseudo.toLowerCase()}`.slice(0, 128);
            bans.set(key, { key, pseudo: targetPseudo, reason, until: null, at: Date.now(), cheatHold: true, evidence: { manual: true } });
            saveBans();
            adminJson(response, 200, { ok: true, pseudo: targetPseudo, offline: true });
            return;
          }
          const res = punishCheater(pid, { manual: true, at: Date.now() }, reason);
          adminJson(response, 200, res);
          return;
        }
        const pid = String(body?.id || "");
        if (!pid) { adminJson(response, 400, { ok: false, error: "Id manquant." }); return; }
        if (pathname === "/api/admin/kick") {
          let found = false;
          const reason = String(body?.reason || "Comportement inapproprié.").slice(0, 200);
          if (pid) peerNoGrace.set(pid, Date.now());
          for (const [map, room] of rooms) {
            const entry = room.get(pid);
            if (!entry || !entry.ws) continue;
            found = true;
            // La victime pète (visible par tous) puis est déconnectée
            // avec le motif. Fermeture différée : laisse passer les messages.
            try {
              if (entry.ws.readyState === 1) entry.ws.send(JSON.stringify({ t: "adminKick", reason }));
            } catch {}
            try {
              broadcastRoom(room, JSON.stringify({ t: "adminBoom", id: pid, x: Math.round(Number(entry.state?.x) || 0), y: Math.round(Number(entry.state?.y) || 0) }), pid);
            } catch {}
            const victimWs = entry.ws;
            setTimeout(() => { try { victimWs.close(); } catch {} }, 500);
          }
          // Joueur en instance perso (gate) : même sanction (pas d'explosion
          // visible, il est seul sur sa map).
          if (!found) {
            const entry = instancePeers.get(pid);
            if (entry?.ws) {
              found = true;
              try {
                if (entry.ws.readyState === 1) entry.ws.send(JSON.stringify({ t: "adminKick", reason }));
              } catch {}
              const victimWs = entry.ws;
              setTimeout(() => { try { victimWs.close(); } catch {} }, 500);
            }
          }
          adminJson(response, 200, { ok: !!found });
          return;
        }
        // mute
        if (body?.muted === false) chatMutes.delete(pid);
        else chatMutes.add(pid);
        adminJson(response, 200, { ok: true, muted: chatMutes.has(pid) });
      } catch {
        adminJson(response, 500, { ok: false, error: "Erreur serveur." });
      }
    });
    return true;
  }
  adminJson(response, 404, { ok: false, error: "Inconnu." });
  return true;
}

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".gif": "image/gif",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

// --- Serveur unique : HTTP statique + API comptes + WebSocket ---
const server = createServer(async (request, response) => {
  try {
    setSecurityHeaders(response);
    // Laisse passer les upgrades WS vers le WebSocketServer (noServer)
    if (request.headers.upgrade) return;
    // Panneau admin : /api/admin/* (token ORBIT_ADMIN_PASS, avant /api/*).
    try {
      const adminPath = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
      if (handleAdminApi(request, response, adminPath)) return;
    } catch (e) {
      console.error("[admin]", e?.message || e);
      response.writeHead(500, { "content-type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ ok: false, error: "Erreur serveur." }));
      return;
    }
    // Comptes serveur : /api/* (register, login, me, save, logout, ping).
    try {
      if (handleAccountApi(request, response)) return;
    } catch (e) {
      console.error("[api]", e?.message || e);
      response.writeHead(500, { "content-type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ ok: false, error: "Erreur serveur." }));
      return;
    }
    const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    const relative = publicRelativePath(pathname);
    const file = normalize(join(root, relative));
    if (file !== root && !file.startsWith(`${root}\\`) && !file.startsWith(`${root}/`)) throw new Error("Invalid path");
    const info = await stat(file);
    if (!info.isFile()) throw new Error("Not a file");
    const etag = `W/"${info.size.toString(16)}-${info.mtimeMs.toString(16)}"`;
    response.setHeader("etag", etag);
    const extension = extname(file).toLowerCase();
    // index.html et ses modules doivent toujours provenir du même déploiement.
    // `no-cache` autorisait encore leur stockage et certains navigateurs/proxys
    // reprenaient alors une ancienne interface après une reconnexion.
    const cacheControl = extension === ".html" || extension === ".js" || extension === ".css"
      ? "no-store"
      : "no-cache";
    response.setHeader("cache-control", cacheControl);
    if (request.headers["if-none-match"]?.split(/\s*,\s*/).includes(etag)) {
      response.writeHead(304);
      response.end();
      return;
    }
    response.writeHead(200, {
      "content-type": mimeTypes[extname(file).toLowerCase()] || "application/octet-stream",
      "cache-control": cacheControl,
    });
    response.end(request.method === "HEAD" ? undefined : await readFile(file));
  } catch {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Fichier introuvable");
  }
});

// --- Multi minimal Etape 1 : rooms par map, broadcast positions 20 Hz ---
// Etape 3 : simu NPC serveur par map zone (positions, HP, mort, killer).
// Protocole (JSON) :
//  client -> serveur : { t:"hello", map, pseudo, shipId } puis { t:"pos", x,y,angle,shipId,pseudo,dead,hpPct,shPct,atk,tx,ty },
//    { t:"map", map } et { t:"hit", uid, dmg, pen, critChance, critMult, weaken, kind }
//  serveur -> client : { t:"welcome", id } puis { t:"snapshot", players:[...], npc:[...] } 20x/s
const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });
// Un snapshot complet est remplace 50 ms plus tard : ne jamais empiler des
// etats obsoletes pour un client dont la connexion ne suit plus.
const SNAPSHOT_BACKPRESSURE_LIMIT = 256 * 1024;
const NPC_NEAR_PLAYER_RADIUS = 2000;
const PLAYER_NEAR_PLAYER_RADIUS = 2600;
const PLAYER_STATIC_REFRESH_TICKS = 10; // garde-fou de resynchronisation : 500 ms
const rooms = new Map(); // mapId(lower) -> Map(id -> { ws, state })
const npcSims = new Map(); // mapId(lower) -> ZoneNpcSim | null | Promise
const NPC_RESPAWNS_FILE = join(dataRoot, "npc_respawns.json");
let savedNpcRespawns = {};
try {
  const parsed = JSON.parse(readFileSync(NPC_RESPAWNS_FILE, "utf8") || "{}");
  if (parsed && typeof parsed === "object" && parsed.maps && typeof parsed.maps === "object") {
    savedNpcRespawns = parsed.maps;
  }
} catch {}

let npcRespawnSavePending = null;
function saveNpcRespawns() {
  // Un seul fichier temporaire : aucune ecriture concurrente, y compris
  // lorsque l'arret arrive pendant la sauvegarde periodique.
  if (npcRespawnSavePending) return npcRespawnSavePending;
  npcRespawnSavePending = persistNpcRespawns().finally(() => { npcRespawnSavePending = null; });
  return npcRespawnSavePending;
}
async function persistNpcRespawns() {
  const maps = {};
  for (const [mapId, sim] of npcSims) {
    if (!sim || typeof sim.then === "function" || typeof sim.serializeRespawns !== "function") continue;
    try { maps[mapId] = JSON.parse(sim.serializeRespawns()); } catch {}
  }
  // Conserve également les cartes pas encore chargées pendant cette session.
  for (const [mapId, state] of Object.entries(savedNpcRespawns)) {
    if (!(mapId in maps)) maps[mapId] = state;
  }
  try {
    await mkdir(dirname(NPC_RESPAWNS_FILE), { recursive: true });
    const temporary = `${NPC_RESPAWNS_FILE}.tmp`;
    await writeFile(temporary, JSON.stringify({ v: 1, savedAt: Date.now(), maps }));
    await rename(temporary, NPC_RESPAWNS_FILE);
    savedNpcRespawns = maps;
  } catch {}
}

setInterval(saveNpcRespawns, 5000).unref?.();
// Refresh (F5) : le socket se ferme mais le joueur revient aussitôt.
// Grâce de 12 s (même durée que le groupe) : room, amis et groupe le
// gardent ; s'il revient (pid stable u_<id>), rattachement silencieux
// sans leave/join. Seul un vrai départ purge (leave + hors ligne).
const PEER_GRACE_MS = 12_000;
const peerGrace = new Map(); // pid -> timeout
const peerNoGrace = new Map(); // pid -> at (kick/ban/suppression : purge immédiate, flag expiré à 60 s)

function cancelPeerGrace(pid) {
  const t = peerGrace.get(String(pid));
  if (!t) return false;
  clearTimeout(t);
  peerGrace.delete(String(pid));
  return true;
}

// Retire l'entrée fantôme SANS broadcast (rattachement en cours).
function dropStaleEntry(pid) {
  const key = String(pid);
  for (const [, room] of rooms) room.delete(key);
  instancePeers.delete(key);
}

function finalizePeerGone(pid, snap) {
  const key = String(pid);
  const ctx = {
    id: key, state: snap?.state, authed: !!snap?.authed,
    send: () => {},
    sendTo: (to, obj) => sendToPeer(to, obj),
    findByPseudo: (pseudo) => findPeerByPseudo(pseudo),
    describe: (p) => describePeer(p),
  };
  try { socialPeerGone(key, ctx, { graceMs: 0 }); } catch {}
  try { if (snap?.authed && snap?.accountId) notifyFriendPresence(snap.accountId, false); } catch {}
  try { removeFromAllRooms(key); } catch {}
}

function schedulePeerGrace(pid, snap) {
  const key = String(pid);
  const ng = peerNoGrace.get(key);
  if (ng != null) {
    peerNoGrace.delete(key);
    if (Date.now() - Number(ng) < 60_000) {
      finalizePeerGone(key, snap);
      return;
    }
  }
  if (peerGrace.has(key)) return;
  // Tag : la boucle 10 s et la simu NPC ignorent le fantôme.
  try {
    for (const [, room] of rooms) {
      const e = room.get(key);
      if (e?.state) { e.state._graceUntil = Date.now() + PEER_GRACE_MS; break; }
    }
    const ie = instancePeers.get(key);
    if (ie?.state) ie.state._graceUntil = Date.now() + PEER_GRACE_MS;
  } catch {}
  peerGrace.set(key, setTimeout(() => {
    peerGrace.delete(key);
    finalizePeerGone(key, snap);
  }, PEER_GRACE_MS));
}const boxRooms = new Map(); // mapId(lower) -> Map(uid -> { type, x, y })
const boxRoomLoads = new Map(); // mapId -> Promise<Map>
const boxRespawns = new Map(); // mapId -> [{ uid, type, at }]
const pvpFeeds = new Map(); // mapId(lower) -> Map("victime|attaquant" -> { uid, by, total })
const pvpFarm = new Map(); // anti-farm : "tueur|victime" -> { n, t0 } (rendement decroissant 60 min)
const chatHistory = []; // global : [{ from, text, at }] (40 derniers)
const chatLastById = new Map(); // anti-spam : id -> timestamp dernier message
const clanChatLast = new Map(); // anti-spam tchat de clan : id -> timestamp

// Tchat de clan : diffusé aux membres connectés (rooms + instances).
// Comparaison sur le tag en mémoire (rafraîchi au hello + ping 15 s).
function broadcastToClan(tag, obj, excludeId = null) {
  const clean = String(tag || "").toUpperCase().slice(0, 5);
  if (!clean) return 0;
  let payload = null;
  try { payload = JSON.stringify(obj); } catch { return 0; }
  let n = 0;
  const matches = (s) => String(s?.clanTag || "").toUpperCase().slice(0, 5) === clean;
  for (const [, room] of rooms) {
    for (const [pid, entry] of room) {
      if (excludeId != null && String(pid) === String(excludeId)) continue;
      if (!matches(entry?.state)) continue;
      try { if (entry.ws.readyState === 1) { entry.ws.send(payload); n++; } } catch {}
    }
  }
  for (const [pid, entry] of instancePeers) {
    if (excludeId != null && String(pid) === String(excludeId)) continue;
    if (!matches(entry?.state)) continue;
    try { if (entry.ws.readyState === 1) { entry.ws.send(payload); n++; } } catch {}
  }
  return n;
}

// Rafraîchit le tag de clan en mémoire depuis la base (mutations HTTP).
function refreshClanTag(state, accountId) {
  try {
    if (!accountId) { state.clanTag = ""; return ""; }
    const tag = clanTagOfUser(accountId) || "";
    state.clanTag = String(tag).slice(0, 5);
    return state.clanTag;
  } catch { return String(state?.clanTag || ""); }
}
const friendPingLast = new Map(); // anti-spam demandes d'ami : id -> timestamp
const hitStats = { count: 0, byMap: new Map() }; // diagnostic multi
const rewardedNpcDeaths = new Map(); // map:uid:seq -> timestamp (anti-double diffusion)
const serverRunId = randomBytes(8).toString("hex");
setInterval(() => {
  if (hitStats.count > 0) {
    const detail = [...hitStats.byMap.entries()].map(([m, n]) => `${m}:${n}`).join(" ");
    console.log(`[multi:npc] hits recus: ${hitStats.count} (${detail})`);
  }
  hitStats.count = 0;
  hitStats.byMap.clear();
}, 30000);
let nextId = 1;

function collectableAllowedOnMap(cfg, mapId) {
  if (!cfg) return false;
  // Event (ex : Pumpkin Box hors Halloween) : jamais, même si maps/deny OK.
  if (cfg.event === "halloween" && !isHalloweenEventActive()) return false;
  const id = String(mapId || "").toLowerCase();
  const deny = cfg?.denyMaps ?? cfg?.blockedMaps ?? cfg?.disabledMaps ?? cfg?.excludeMaps;
  for (const value of (Array.isArray(deny) ? deny : deny != null ? [deny] : [])) {
    const denied = String(value || "").toLowerCase();
    if (denied === "*" || denied === "all" || denied === id) return false;
  }
  const maps = cfg?.maps ?? cfg?.map ?? cfg?.onlyMaps ?? cfg?.allowedMaps;
  if (maps == null || maps === "*" || maps === "all") return true;
  return (Array.isArray(maps) ? maps : [maps]).some((value) => String(value || "").toLowerCase() === id);
}

// Marge anti-murs des box : le client récolte au point (x, y-70) avec un
// vaisseau de rayon ~14 + tolérance 18. Une box à 40px du mur laissait son
// point de collecte dans le mur => non récoltable (cargo / palladium...).
// 140px garantit box + point de collecte atteignables.
const BOX_WALL_CLEAR = 140;
const BOX_COLLECT_DY = -70;
const BOX_COLLECT_CLEAR = 52;

function boxPosInWall(x, y, walls, clear = BOX_WALL_CLEAR) {
  if (!Array.isArray(walls) || !walls.length) return false;
  const m = Math.max(0, Number(clear) || 0);
  for (const w of walls) {
    const hw = Number(w?.w || 0) / 2 + m, hh = Number(w?.h || 0) / 2 + m;
    if (Math.abs(Number(x) - Number(w?.x || 0)) <= hw && Math.abs(Number(y) - Number(w?.y || 0)) <= hh) return true;
  }
  return false;
}

function boxCollectPointInWall(x, y, walls) {
  return boxPosInWall(Number(x) || 0, (Number(y) || 0) + BOX_COLLECT_DY, walls, BOX_COLLECT_CLEAR);
}

function randomBoxPosition(sim) {
  const world = sim?.world || { w: 11000, h: 7000 };
  // La sim NPC charge déjà les murs de la map (sim.walls) : jamais de box
  // bonus / palladium / cargo dedans ni trop près, sinon le point de
  // collecte (70px au-dessus) est dans le mur et la box non récoltable.
  const walls = sim?.walls || [];
  for (let t = 0; t < 24; t++) {
    const pos = { x: Math.round(80 + Math.random() * Math.max(1, world.w - 160)), y: Math.round(80 + Math.random() * Math.max(1, world.h - 160)) };
    if (boxPosInWall(pos.x, pos.y, walls)) continue;
    if (boxCollectPointInWall(pos.x, pos.y, walls)) continue;
    return pos;
  }
  return { x: Math.round(80 + Math.random() * Math.max(1, world.w - 160)), y: Math.round(80 + Math.random() * Math.max(1, world.h - 160)) };
}

function ensureBoxRoom(mapId) {
  const key = String(mapId || "1-1").toLowerCase();
  if (boxRooms.has(key)) return Promise.resolve(boxRooms.get(key));
  if (boxRoomLoads.has(key)) return boxRoomLoads.get(key);
  const pending = Promise.resolve(ensureNpcSim(key)).then((sim) => {
    const boxes = new Map();
    for (const [type, cfg] of Object.entries(COLLECTABLE_TYPES)) {
      if (!cfg || cfg.enabled === false || !collectableAllowedOnMap(cfg, key)) continue;
      const qty = Math.max(0, Math.floor(Number(cfg.qty ?? cfg.count ?? cfg.amount ?? cfg.maxAlive) || 0));
      for (let index = 0; index < qty; index++) {
        const pos = randomBoxPosition(sim);
        boxes.set(`${type}#${index}`, { type, ...pos });
      }
    }
    boxRooms.set(key, boxes);
    boxRoomLoads.delete(key);
    const room = rooms.get(key);
    if (room?.size) broadcastRoom(room, JSON.stringify({ t: "box", op: "list", boxes: [...boxes].map(([uid, b]) => ({ uid, ...b })) }));
    return boxes;
  }).catch(() => {
    boxRoomLoads.delete(key);
    const boxes = new Map();
    // La simulation NPC ne doit jamais conditionner l'existence des box.
    // En cas d'echec de chargement, generation native immediate avec les
    // dimensions de secours ; une room vide ne reste plus mise en cache.
    for (const [type, cfg] of Object.entries(COLLECTABLE_TYPES)) {
      if (!cfg || cfg.enabled === false || !collectableAllowedOnMap(cfg, key)) continue;
      const qty = Math.max(0, Math.floor(Number(cfg.qty ?? cfg.count ?? cfg.amount ?? cfg.maxAlive) || 0));
      for (let index = 0; index < qty; index++) {
        boxes.set(`${type}#${index}`, { type, ...randomBoxPosition(null) });
      }
    }
    boxRooms.set(key, boxes);
    const room = rooms.get(key);
    if (room?.size) broadcastRoom(room, JSON.stringify({ t: "box", op: "list", boxes: [...boxes].map(([uid, b]) => ({ uid, ...b })) }));
    return boxes;
  });
  boxRoomLoads.set(key, pending);
  return pending;
}

function sendBoxSync(ws, mapId) {
  const key = String(mapId || "1-1").toLowerCase();
  ensureBoxRoom(key).then((set) => {
    try {
      if (ws.readyState === 1) ws.send(JSON.stringify({ t: "boxesSync", map: key, boxes: [...set].map(([uid, b]) => ({ uid, ...b })) }));
    } catch {}
  });
}

// Star jump (Carte Stellaire) : aller validé sans portail. Le client attend
// {t:"starJump"} avec les coordonnées AVANT de changer de map ; son {t:"map"}
// suivant est alors un no-op (déjà sur place côté serveur).
// Refusé : instances, gates, raid Low, même map, cooldowns.
// Refusé : instances, gates, raid Low, Maudite, 5-2, Blacklight, même map, cooldowns.
const STAR_JUMP_BLOCKED_MAPS = new Set(["alpha", "beta", "gamma", "delta", "epsilon", "zeta", "kappa", "lambda", "kronos", "awakened", "qz", "low", "maudite", "5-2", "1-bl", "2-bl", "3-bl"]);
const STAR_JUMP_REUSE_MS = STARMAP_JUMP_REUSE_SEC * 1000;
const STAR_JUMP_MAP_ALIASES = { low: "LOW_MAP", maudite: "MAUDITE", "1-bl": "1-BL", "2-bl": "2-BL", "3-bl": "3-BL" };

async function handleStarJumpRequest(ws, peer, fromMap, target, setMapId) {
  const now = Date.now();
  const deny = (reason) => {
    try { if (ws.readyState === 1) ws.send(JSON.stringify({ t: "starJump", ok: false, map: target, reason })); } catch {}
  };
  try {
    const { id, state } = peer;
    if (!target || !serverMaps.has(target) || STAR_JUMP_BLOCKED_MAPS.has(target)) return deny("unreachable");
    if (target === String(fromMap || "").toLowerCase()) return deny("same-map");
    if (now < Number(state.starJumpCdUntil || 0) || now < Number(state.portalCdUntil || 0)) return deny("cooldown");
    const world = serverMaps.get(target)?.world || { w: 11000, h: 7000 };
    // Murs de la map d'arrivée (jamais dedans) : sim NPC si dispo, sinon import direct.
    let walls = [];
    try {
      const sim = await Promise.resolve(ensureNpcSim(target)).catch(() => null);
      if (sim && typeof sim.then !== "function" && Array.isArray(sim.walls)) walls = sim.walls;
    } catch {}
    if (!walls.length) {
      try {
        const dir = STAR_JUMP_MAP_ALIASES[target] || target;
        const spawns = await import(`../MAPS/${dir}/SPAWNS.js`);
        if (typeof spawns?.getZoneWalls === "function") walls = spawns.getZoneWalls(world) || [];
      } catch {}
    }
    let ax = Math.round(world.w / 2), ay = Math.round(world.h / 2);
    for (let t = 0; t < 12; t++) {
      const cx = Math.round(300 + Math.random() * Math.max(1, world.w - 600));
      const cy = Math.round(300 + Math.random() * Math.max(1, world.h - 600));
      let blocked = false;
      for (const wl of walls) {
        const hw = Number(wl?.w || 0) / 2 + 60, hh = Number(wl?.h || 0) / 2 + 60;
        if (Math.abs(cx - Number(wl?.x || 0)) <= hw && Math.abs(cy - Number(wl?.y || 0)) <= hh) { blocked = true; break; }
      }
      if (!blocked) { ax = cx; ay = cy; break; }
    }
    state._arrival = { x: ax, y: ay, until: now + 15000 };
    state.x = ax;
    state.y = ay;
    state.vx = 0; state.vy = 0; state.moving = false;
    state.teleportSeq = (Number(state.teleportSeq) || 0) + 1;
    state.starJumpCdUntil = now + STAR_JUMP_REUSE_MS;
    state.portalCdUntil = now + 5000;
    state.serverMap = target;
    try {
      removeFromAllRooms(id);
      setMapId({ mapId: target });
      roomFor(target).set(id, { ws, state });
      ensureNpcSim(target);
      sendBoxSync(ws, target);
    } catch {}
    if (ws.readyState === 1) ws.send(JSON.stringify({ t: "starJump", ok: true, map: target, x: ax, y: ay }));
  } catch {
    deny("error");
  }
}

function handleHangarArrivalRequest(ws, peer, accountId, fromMap, hangarId, setMapId) {
  const { id, state } = peer, now = Date.now();
  const reply = body => { if (ws.readyState === 1) ws.send(JSON.stringify({ t: 'hangarArrival', hangarId, ...body })); };
  const deny = reason => reply({ ok: false, reason });
  if (!accountId || state.instance || state._clockGuard?.blocked || state.pvpDead || !(state.hp > 0)) return deny('unavailable');
  if (now < Number(state.hangarArrivalCdUntil || 0)) return deny('cooldown');
  const sourceSim = npcSims.get(fromMap);
  if (state.safe !== true || !sourceSim?.inSafe(state.x, state.y)) return deny('unsafe');
  if (now - Math.max(Number(state.pvpAt) || 0, Number(state.npcAt) || 0) < 5000) return deny('combat');
  const user = getAccountGameplayData(accountId);
  const current = user?.hangars?.find(h => h?.active);
  const target = user?.hangars?.find(h => String(h?.id) === hangarId);
  if (!target || target === current) return deny('hangar');
  const map = String(target.lastMap || getFactionHomeMap(user.faction)).toLowerCase();
  const world = serverMaps.get(map)?.world;
  if (!world) return deny('destination');
  const base = baseArrival(serverMaps, map, user.faction);
  const x = Number(target.lastPos?.x ?? base.x), y = Number(target.lastPos?.y ?? base.y);
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < 18 || y < 18 || x > world.w - 18 || y > world.h - 18) return deny('destination');
  // Seule la position du hangar possede et sauvegarde donne droit au transfert.
  // Le client ne fournit aucune coordonnee ni exemption de mouvement.
  state._arrival = { x, y, until: now + 15000 };
  Object.assign(state, { x, y, vx: 0, vy: 0, moving: false, motionBlocked: false,
    teleportSeq: (Number(state.teleportSeq) || 0) + 1, moveBuck: 0, moveBuckT: now,
    serverMap: map, hangarArrivalCdUntil: now + 5000, updatedAt: now });
  removeFromAllRooms(id);
  setMapId(map);
  roomFor(map).set(id, { ws, state });
  ensureNpcSim(map);
  sendBoxSync(ws, map);
  reply({ ok: true, map, x, y });
}

function broadcastRoom(room, payload, excludeId = null) {
  for (const [pid, entry] of room) {
    if (excludeId != null && String(pid) === String(excludeId)) continue;
    try { if (entry.ws.readyState === 1) entry.ws.send(payload); } catch {}
  }
}

// Canaux globaux (tchat, enchères, annonces admin) : TOUS les sockets,
// y compris les joueurs en instance perso (Galaxy Gates, hors room).
const allWs = new Set();
// La vie du socket est distincte de la derniere position de combat.
// Cela couvre aussi les instances, qui n'envoient pas de positions.
setInterval(() => {
  const now = Date.now();
  for (const ws of allWs) {
    if (ws.readyState !== 1 || now - ws.lastHeardAt <= 30000) continue;
    try { ws.close(4000, "Heartbeat timeout"); } catch {}
    const timer = setTimeout(() => { if (ws.readyState !== 3) ws.terminate(); }, 1000);
    timer.unref();
  }
}, 1000);
function broadcastAll(payload) {
  for (const ws of allWs) {
    try { if (ws.readyState === 1) ws.send(payload); } catch {}
  }
}

// Joueurs en instance perso (hors room) : suivis ici pour les messages
// dirigés (murmures, groupes) et la présence amis, cross-map.
const instancePeers = new Map(); // pid -> { ws, state, mapId }

// Recherche d'un pilote connecté par pseudo (rooms + instances).
function findPeerByPseudo(pseudo) {
  const key = String(pseudo || "").trim().toLowerCase();
  if (!key) return null;
  for (const [, room] of rooms) {
    for (const [pid, entry] of room) {
      if (String(entry?.state?.pseudo || "").trim().toLowerCase() === key) {
        return { id: String(pid), pseudo: String(entry.state.pseudo || "Pilote").slice(0, 20) };
      }
    }
  }
  for (const [pid, entry] of instancePeers) {
    if (String(entry?.state?.pseudo || "").trim().toLowerCase() === key) {
      return { id: String(pid), pseudo: String(entry.state.pseudo || "Pilote").slice(0, 20) };
    }
  }
  return null;
}

// Fiche d'un pilote présent, y compris pendant la grâce de reconnexion.
function describePeer(pid) {
  const id = String(pid);
  let entry = null, map = "", instance = false;
  for (const [mkey, room] of rooms) {
    const e = room.get(id);
    if (e) {
      entry = e; map = mkey;
      break;
    }
  }
  if (!entry) {
    entry = instancePeers.get(id);
    if (entry) { map = String(entry.mapId || ""); instance = true; }
  }
  if (!entry) return null;
  const s = entry.state || {};
  return {
    id, pseudo: String(s.pseudo || "Pilote").slice(0, 20), map, online: entry.ws?.readyState === 1, instance, clanTag: String(s.clanTag || "").slice(0, 5),
    x: Number(s.x) || 0, y: Number(s.y) || 0, hpPct: Number(s.hpPct ?? 1), shPct: Number(s.shPct ?? 1),
    hpMax: Number(s.hpMax) || 1, shMax: Number(s.shMax) || 0, dead: s.dead === true,
    shipId: String(s.shipId || "").slice(0, 64), petActive: s.peta === 1,
    b2: Array.isArray(s.b2) ? s.b2.map((v) => String(v || "")).filter((v) => ["dmg2", "shd2", "hp2", "ep2", "hon2", "rep2", "res2", "sreg2"].includes(v)).slice(0, 8) : [],
    combat: s.combat === "npc" || s.combat === "player" ? s.combat : "",
    targetName: String(s.targetName || "").slice(0, 64),
    targetHpPct: Number(s.targetHpPct ?? 0), targetShPct: Number(s.targetShPct ?? 0),
    targetHpMax: Number(s.targetHpMax) || 0, targetShMax: Number(s.targetShMax) || 0,
  };
}

function sendToPeer(pid, obj) {
  const id = String(pid);
  let payload = null;
  try { payload = JSON.stringify(obj); } catch { return false; }
  for (const [, room] of rooms) {
    const e = room.get(id);
    if (e?.ws) {
      try { if (e.ws.readyState === 1) e.ws.send(payload); return true; } catch {}
    }
  }
  const ie = instancePeers.get(id);
  if (ie?.ws) {
    try { if (ie.ws.readyState === 1) ie.ws.send(payload); return true; } catch {}
  }
  return false;
}

// Présence amis : prévient les abonnés connectés + sync initiale au hello.
function notifyFriendPresence(accountId, online) {
  try {
    const selfPid = `u_${String(accountId)}`;
    let selfPseudo = "Pilote";
    let presence = null;
    try { presence = describePeer(selfPid); selfPseudo = presence?.pseudo || selfPseudo; } catch {}
    for (const followerId of friendFollowers(accountId)) {
      const fpid = `u_${String(followerId)}`;
      if (fpid === selfPid) continue;
      sendToPeer(fpid, { t: "friendOnline", id: selfPid, pseudo: selfPseudo, online: online === true, map: String(presence?.map || ""), shipId: String(presence?.shipId || ""), instance: presence?.instance === true, inGroup: !!socialGroupOf(selfPid) });
    }
  } catch {}
}
function sendFriendsSync(ws, accountId) {
  try {
    const online = listFriends(accountId).map((f) => {
      const id = `u_${String(f.id)}`;
      const d = describePeer(id);
      return d ? { id, pseudo: f.pseudo, map: String(d.map || ""), shipId: String(d.shipId || ""), instance: d.instance === true, inGroup: !!socialGroupOf(id) } : null;
    }).filter(Boolean);
    try { ws.send(JSON.stringify({ t: "friendsSync", online })); } catch {}
  } catch {}
}

function ensureNpcSim(mapId) {
  const key = String(mapId || "1-1").toLowerCase();
  if (npcSims.has(key)) return npcSims.get(key);
  const pending = ZoneNpcSim.create(key, savedNpcRespawns[key] || null).then((sim) => {
    if (sim) sim.onDeath = death => awardNpcDeaths(key, [death]);
    if (sim) sim.redirectShieldDamage = (victim, result, sourceId, at) => {
      const room = rooms.get(key);
      if (!room || !(result.sh > 0)) return;
      for (const { state: caster } of room.values()) {
        const link = activeAbility(caster, "ability_berserker_shl", at);
        if (link?.target !== String(victim.uid) || !(caster.hp > 0) || caster.safe || caster.dead || caster.pvpDead
          || Math.hypot(caster.x - victim.x, caster.y - victim.y) > (Number(caster.range) || 800)) continue;
        victim.sh = Math.min(victim.shMax, victim.sh + result.sh);
        const damage = applyServerAbilityDamage(room, sim, caster, result.sh, 0, at, sourceId, room.get(String(sourceId))?.state?._combat, 0, true);
        caster.pvpAt = at;
        caster.pvpFrom = String(sourceId);
        caster.dmgBlockUntil = at + 500;
        let feed = pvpFeeds.get(key);
        if (!feed) { feed = new Map(); pvpFeeds.set(key, feed); }
        const feedKey = `${caster.id}|${sourceId}`, prior = feed.get(feedKey);
        feed.set(feedKey, { uid: String(caster.id), by: String(sourceId), total: Math.round((prior?.total || 0) + damage.total) });
        if (!(caster.hp > 0) && !triggerTempestBackup(caster, room, at)) {
          caster.dead = true;
          caster.pvpDead = true;
          clearAbilityFx(caster);
          if (String(sourceId) !== String(caster.id)) awardPlayerKill(room, String(sourceId), caster, at);
        }
        result.total -= result.sh;
        result.sh = 0;
        break;
      }
    };
    npcSims.set(key, sim || null);
    return sim || null;
  }).catch(() => {
    npcSims.set(key, null);
    return null;
  });
  npcSims.set(key, pending);
  return pending;
}

// Dernier essai de (re)création de simu par map (une simu nulle — échec de
// chargement — n'est pas réessayée par ensureNpcSim : purge définitive sinon).
const npcSimRetryAt = new Map();
function retryNpcSim(key, nowMs) {
  const keyLc = String(key || "1-1").toLowerCase();
  const at = Number(npcSimRetryAt.get(keyLc) || 0);
  if (nowMs < at) return;
  npcSimRetryAt.set(keyLc, nowMs + 10000);
  try { npcSims.delete(keyLc); } catch {}
  try { ensureNpcSim(keyLc); } catch {}
}

function roomFor(mapId) {
  const key = String(mapId || "1-1").toLowerCase();
  if (!rooms.has(key)) rooms.set(key, new Map());
  return rooms.get(key);
}

// Depart immediat (portail / changement de map) : previent l'ancienne room
// pour que les observateurs suppriment le vaisseau sur-le-champ au lieu de
// le garder en extrapolation jusqu'au timeout (le "clone" de 2-3 secondes).
function announceLeave(id) {
  const key = String(id);
  let payload = null;
  try { payload = JSON.stringify({ t: "leave", id: key }); } catch { return; }
  for (const [, room] of rooms) {
    if (!room.has(key)) continue;
    try { broadcastRoom(room, payload, key); } catch {}
  }
}

function removeFromAllRooms(id) {
  try { announceLeave(id); } catch {}
  for (const [mkey, room] of rooms) {
    room.delete(id);
  }
  instancePeers.delete(String(id));
}

// Top 10 dégâts Invoke / Mindfire / Boss Halloween / UFONIT (box perso,
// même partis).
function sunTopIds(death) {
  try {
    if (death?.type !== "npc_Invoke_XVI" && death?.type !== "npc_Mindfire_Behemoth" && !isHalloweenBossVariant(death?.type) && !isSundayBossVariant(death?.type)) return [];
    if (!Array.isArray(death?.shares) || !death.shares.length) return [];
    return death.shares
      .filter((s) => Array.isArray(s) && String(s[0]).startsWith("u_") && Number(s[1]) > 0)
      .map((s) => [String(s[0]), Math.max(0, Number(s[1]) || 0)])
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map((s) => s[0]);
  } catch { return []; }
}

function npcRewardShares(killerId, mapId, death) {
  // Strokelight : 100 % au détenteur du lock rouge, même s'il est en groupe.
  if (death?.type === "npc_Strokelight_Barrage") {
    return [{ pid: String(killerId), percent: 100 }];
  }
  // Invoke / Mindfire / Boss Halloween / UFONIT : pas de partage de groupe.
  // - Destruction (credits/EXP/honneur) : TOUS les tapeurs présents sur la
  //   map, au prorata exact des dégâts, y compris une part inférieure à 1 %.
  // - Invoke / Mindfire / Boss Halloween : box perso au top 10 dégâts.
  // - UFONIT : loterie module du top 10 (voir awardNpcDeaths, sans box).
  if ((death?.type === "npc_Invoke_XVI" || death?.type === "npc_Mindfire_Behemoth"
    || isHalloweenBossVariant(death?.type) || isSundayBossVariant(death?.type))
    && Array.isArray(death?.shares) && death.shares.length) {
    try {
      const ranked = death.shares
        .filter((s) => Array.isArray(s) && String(s[0]).startsWith("u_") && Number(s[1]) > 0)
        .map((s) => [String(s[0]), Math.max(0, Number(s[1]) || 0)])
        .sort((a, b) => b[1] - a[1]);
      if (ranked.length) {
        const sunIds = new Set(ranked.slice(0, 10).map((s) => s[0]));
        let room = null;
        try { room = rooms.get(String(mapId)); } catch {}
        const present = ranked.filter(([pid]) => { try { return !!room && room.has(pid); } catch { return false; } });
        const eligible = present.length ? present : [[String(killerId), 1]];
        const total = eligible.reduce((s, [, d]) => s + d, 0) || 1;
        return eligible.map(([pid, damage]) => ({ pid, percent: damage / total * 100, sun: sunIds.has(pid) }));
      }
    } catch {}
  }
  let eligible = [String(killerId)];
  try {
    const group = socialDescribeGroup(killerId, { describe: (pid) => describePeer(pid) });
    const grouped = (group?.members || [])
      .filter((m) => m?.online !== false && m?.instance !== true && String(m.map).toLowerCase() === String(mapId).toLowerCase())
      .map((m) => String(m.id))
      .filter((pid) => pid.startsWith("u_"))
      .sort();
    if (grouped.includes(String(killerId))) eligible = grouped;
  } catch {}
  const base = Math.floor(100 / eligible.length);
  const remainder = 100 - base * eligible.length;
  let seed = 2166136261;
  const hashKey = `${death.uid}:${death.seq || 0}`;
  for (let i = 0; i < hashKey.length; i++) {
    seed ^= hashKey.charCodeAt(i);
    seed = Math.imul(seed, 16777619);
  }
  const start = (seed >>> 0) % eligible.length;
  return eligible.map((pid, index) => ({
    pid,
    percent: base + (((index - start + eligible.length) % eligible.length) < remainder ? 1 : 0),
  }));
}

// Récompenses NPC immédiates : chaque mort est traitée entièrement,
// sans file, budget de temps, minuterie ni plafond de kills.
const announcedNpcSuns = new Map();
function npcDeathKey(mapId, death) {
  return `${String(mapId).toLowerCase()}:${String(death?.uid || "")}:${Number(death?.seq) || 0}`;
}
function awardNpcDeaths(mapId, deaths) {
  if (!Array.isArray(deaths) || !deaths.length) return;
  const now = Date.now();
  // Historique de déduplication uniquement : aucune récompense n'attend ici.
  for (const history of [rewardedNpcDeaths, announcedNpcSuns]) {
    for (const [key, at] of history) if (now - at > 10 * 60_000) history.delete(key);
  }
  for (const death of deaths) {
    if (!death || typeof death !== "object") continue;
    const killerId = String(death.killer || "");
    if (!killerId.startsWith("u_") || death.cause !== "gun") continue;
    const deathKey = npcDeathKey(mapId, death);
    if (rewardedNpcDeaths.has(deathKey)) continue;
    // Mini-event dominical [ UFONIT ] : aucune soute ni récompense.
    // Top 10 dégâts : 10 % module (25 % rare), 35 % ticket de relance,
    // 55 % rien. Rangs 11+ (tapeurs) : message "rien reçu" uniquement.
    if (isSundayBossVariant(death.type)) {
      const modKey = `sunmod:${deathKey}`;
      if (!rewardedNpcDeaths.has(modKey)) {
        const ranked = (Array.isArray(death.shares) ? death.shares : [])
          .filter((s) => Array.isArray(s) && String(s[0]).startsWith("u_") && Number(s[1]) > 0)
          .map((s) => [String(s[0]), Math.max(0, Number(s[1]) || 0)])
          .sort((a, b) => b[1] - a[1]);
        const topSet = new Set(ranked.slice(0, 10).map((s) => s[0]));
        for (const [pid] of ranked) {
          let win = false, prize = null, prizeRarity = null, prizeModule = null, prizeTickets = 0, prizeAmmo = 0;
          if (topSet.has(pid)) {
            let r = 1;
            try { r = Math.random(); } catch {}
            if (r < SUNDAY_MODULE_CHANCE) {
              let rare = false;
              try { rare = Math.random() < SUNDAY_RARE_CHANCE; } catch {}
              try {
                const res = grantSundayModule(String(pid).slice(2), rare ? "rare" : "common");
                if (res && res.ok && res.module) { win = true; prize = "module"; prizeModule = res.module; prizeRarity = res.module.rarity; }
              } catch {}
            } else if (r < SUNDAY_MODULE_CHANCE + SUNDAY_TICKET_CHANCE) {
              try {
                const res = grantSundayTickets(String(pid).slice(2), SUNDAY_TICKET_QTY);
                if (res && res.ok) { win = true; prize = "ticket"; prizeTickets = res.qty || SUNDAY_TICKET_QTY; }
              } catch {}
            } else if (r < SUNDAY_MODULE_CHANCE + SUNDAY_TICKET_CHANCE + SUNDAY_AMMO_CHANCE) {
              try {
                const res = grantSundayAmmo(String(pid).slice(2), SUNDAY_AMMO_QTY);
                if (res && res.ok) { win = true; prize = "ammo"; prizeAmmo = res.qty || SUNDAY_AMMO_QTY; }
              } catch {}
            }
          }
          try {
            sendToPeer(pid, {
              t: "sundayModule", map: String(mapId), uid: String(death.uid),
              seq: Number(death.seq) || 0, win,
              prize, rarity: prizeRarity,
              module: prizeModule ? sanitizeSundayModule(prizeModule) : null,
              ticketQty: prizeTickets, ammoQty: prizeAmmo,
            });
          } catch {}
        }
        rewardedNpcDeaths.set(modKey, now);
      }
      rewardedNpcDeaths.set(deathKey, now);
      try { pumpSundayEvent(); } catch {}
      continue;
    }
    const killerPseudo = String(findPeerState(killerId)?.pseudo || "");
    const isSunBoss = death.type === "npc_Invoke_XVI" || death.type === "npc_Mindfire_Behemoth" || isHalloweenBossVariant(death.type) || isSundayBossVariant(death.type);
    const sunType = death.type === "npc_Mindfire_Behemoth" ? "Mindfire_Sun_Box"
      : death.type === "npc_Invoke_XVI" ? "Sun_Box"
      : isHalloweenBossVariant(death.type) ? "Boss_Cucurbitor_Box" : null;
    // UFONIT : pas de box perso (loterie module dédiée plus bas).
    if (isSunBoss && sunType && !announcedNpcSuns.has(deathKey)) {
      announcedNpcSuns.set(deathKey, now);
      const sunMsg = { t: "npcSun", map: String(mapId), uid: String(death.uid), seq: Number(death.seq) || 0,
        sunType, x: Math.round(Number(death.x) || 0), y: Math.round(Number(death.y) || 0) };
      for (const pid of sunTopIds(death)) sendToPeer(pid, sunMsg);
    }
    let complete = true;
    // Le nerf appartient au kill : si le tueur utilisait le bot, le pool
    // total crédits/XP/honneur tombe à 25 % avant la répartition. Tous les
    // membres reçoivent donc 25 % de leur part normale.
    const botRewardFactor = findPeerState(killerId)?.bot === true ? 0.25 : 1;
    for (const share of npcRewardShares(killerId, mapId, death)) {
      if (!(share.percent > 0)) continue;
      const accountId = share.pid.slice(2);
      const txKey = `npc:${serverRunId}:${deathKey}:${accountId}`;
      const rewardState = findPeerState(share.pid);
      const passivesEnabled = !(Number(death.at) >= Number(rewardState?._jamAt || Infinity)
        && Number(death.at) < Number(rewardState?._jamUntil || 0));
      let reward = null;
      try { reward = awardNpcKill(accountId, death.type, mapId, share.percent * botRewardFactor, share.pid === killerId, txKey, passivesEnabled); } catch {}
      if (!reward) {
        complete = false;
        console.error(`[multi:npc] échec attribution ${deathKey} à ${share.pid}`);
        continue;
      }
      if (reward.duplicate) continue;
      if (share.pid === killerId) {
        recordAbilityNpcKill(rewardState, Number(death.at) || now);
        try { if (rewardState) audOf(rewardState).kills += 1; } catch {}
      }
      sendToPeer(share.pid, {
        t: "npcReward", map: String(mapId), uid: String(death.uid), seq: Number(death.seq) || 0,
        killer: killerId, killerPseudo, percent: share.percent, ...reward,
        x: Math.round(Number(death.x) || 0), y: Math.round(Number(death.y) || 0),
        sun: isSunBoss && share.sun === true, sunType,
        sunX: isSunBoss ? Math.round(Number(death.x) || 0) : 0,
        sunY: isSunBoss ? Math.round(Number(death.y) || 0) : 0,
      });
    }
    if (complete) rewardedNpcDeaths.set(deathKey, now);
  }
}

// Module UFONIT transmis au gagnant : champs connus uniquement.
function sanitizeSundayModule(mod) {
  if (!mod || typeof mod !== "object") return null;
  const bonuses = Array.isArray(mod.bonuses) ? mod.bonuses.slice(0, 4).map((b) => ({
    stat: String(b?.stat || "").slice(0, 24),
    pct: Math.max(-100, Math.min(100, Math.floor(Number(b?.pct) || 0))),
  })) : [];
  return {
    id: String(mod.id || "").slice(0, 64),
    kind: "shipModule",
    shipId: String(mod.shipId || "").slice(0, 64),
    familyId: String(mod.familyId || "").slice(0, 64),
    tier: String(mod.tier || "").slice(0, 8),
    type: String(mod.type || "").slice(0, 8),
    bonuses,
    rarity: String(mod.rarity || "").slice(0, 16),
    iconKey: String(mod.iconKey || "").slice(0, 32),
    rerolls: 0,
    rerollCredits: 0,
    createdAt: Math.floor(Number(mod.createdAt) || 0),
  };
}

// --- Mini-event dominical [ UFONIT ] : 1 seul sur 4-1 / 4-2 / 4-3 / 4-4 ---
const SUNDAY_MAP_IDS = ["4-1", "4-2", "4-3", "4-4"];
function sundaySimGetter(mapId) {
  try {
    const s = npcSims.get(String(mapId || "").toLowerCase());
    return s && typeof s.tick === "function" ? s : null;
  } catch { return null; }
}
function announceSunday(mapId, text) {
  try {
    const room = rooms.get(String(mapId || "").toLowerCase());
    if (!room || !room.size) return;
    broadcastRoom(room, JSON.stringify({ t: "chatMsg", from: "[EVENT]", text: String(text || "").slice(0, 160), at: Date.now(), by: "event" }));
  } catch {}
}
function pumpSundayEvent() {
  try { for (const m of SUNDAY_MAP_IDS) { try { ensureNpcSim(m); } catch {} } } catch {}
  let res = null;
  try { res = syncSundayEvent(sundaySimGetter, Date.now()); } catch { res = null; }
  if (!res || !Array.isArray(res.events)) return;
  for (const ev of res.events) {
    try {
      if (ev?.t === "spawn" && ev.map) {
        try { console.info(`[sunday] spawn ${String(ev.map).toLowerCase()}`); } catch {}
        announceSunday(ev.map, `[ UFONIT ] est apparu en ${String(ev.map).toUpperCase()} !`);
      }
      else if (ev?.t === "start") { for (const m of SUNDAY_MAP_IDS) announceSunday(m, "[ UFONIT ] rôde sur 4-1 / 4-2 / 4-3 / 4-4 jusqu'à 22h30 !"); }
      else if (ev?.t === "end") { for (const m of SUNDAY_MAP_IDS) announceSunday(m, "L'[ UFONIT ] a disparu... à dimanche prochain !"); }
    } catch {}
  }
}
setInterval(() => { try { pumpSundayEvent(); } catch {} }, 2000).unref?.();
// --- Audit anticheat périodique (10 s) + sanction (kick + gel, JAMAIS de
// ban auto : l'admin tranche après inspection). Voir ANTICHEAT.js.
const CHEAT_KICK_MESSAGE = "Vous avez triché. La modération étudie actuellement votre cas. Si cela est avéré, vous serez définitivement banni.";
function punishCheater(pid, evidence, manualReason = null) {
  const id = String(pid || "");
  if (!id) return { ok: false };
  let entry = null;
  for (const [, room] of rooms) {
    const e = room.get(id);
    if (e) { entry = e; break; }
  }
  if (!entry) entry = instancePeers.get(id) || null;
  const pseudo = String(entry?.state?.pseudo || "").slice(0, 20) || id;
  const reason = String(manualReason || "Triche détectée automatiquement — dossier en cours d'examen par la modération.").slice(0, 200);
  try {
    if (entry?.ws && entry.ws.readyState === 1) entry.ws.send(JSON.stringify({ t: "cheatKick", reason: CHEAT_KICK_MESSAGE }));
  } catch {}
  try { removeFromAllRooms(id); } catch {}
  try { peerNoGrace.set(id, Date.now()); } catch {}
  const victimWs = entry?.ws || null;
  setTimeout(() => { try { victimWs && victimWs.close(); } catch {} }, 800);
  // Gel du compte (comptes uniquement) : PAS de ban définitif auto.
  if (id.startsWith("u_")) {
    const at = Date.now();
    const ev = evidence && typeof evidence === "object" ? evidence : {};
    for (const k of banKeysFor(id, pseudo)) {
      bans.set(k, { key: k, pseudo, reason, until: null, at, cheatHold: true, evidence: ev });
    }
    saveBans();
  }
  try { console.log(`[multi:anticheat] sanction ${pseudo} (${id}) : ${reason}`); } catch {}
  return { ok: true, pseudo };
}
function runCheatAudit() {
  const now = Date.now();
  const peers = [];
  for (const [, room] of rooms) {
    for (const [pid, e] of room) { if (e && e.state) peers.push([pid, e.state]); }
  }
  for (const [pid, e] of instancePeers) {
    if (e && e.state) peers.push([pid, e.state]);
  }
  for (const [pid, st] of peers) {
    const a = st._audit;
    if (!a || typeof a !== "object") continue;
    const r = acAuditWindow(a, now, Number(st.teleStrike || 0));
    if (!r) continue;
    const rates = r.rates;
    const score = r.score;
    const triggers = [...r.triggers];
    if (!triggers.length) continue;
    a.strikes = Number(a.strikes || 0) + 1;
    a.last = { at: now, triggers: triggers.slice(-6) };
    try { console.log(`[multi:anticheat] audit ${st.pseudo} (${pid}) score ${score} : ${triggers.join(" · ")}`); } catch {}
    if (score >= AC.AUDIT_PUNISH_SCORE) {
      try {
        punishCheater(pid, {
          score, strikes: a.strikes,
          kills10s: Math.round(rates.kills), boxes10s: Math.round(rates.boxes),
          dmg10s: Math.round(rates.dmg), triggers: triggers.slice(-6), at: now,
          security: st._security || null,
        });
      } catch {}
      a.score = 0;
    }
  }
}
setInterval(() => {
  try { runCheatAudit(); } catch {}
}, AC.AUDIT_WIN_MS);

server.on("upgrade", (request, socket, head) => {
  const url = new URL(request.url || "/ws", "http://localhost");
  if (!url.pathname.startsWith("/ws")) {
    socket.destroy();
    return;
  }
  // Un navigateur ne peut ouvrir le WS que depuis la meme origine. Les
  // clients non navigateur sans Origin restent autorises (outils/admin).
  const origin = String(request.headers.origin || "");
  if (origin) {
    let originHost = "";
    try { originHost = new URL(origin).host; } catch {}
    if (!originHost || originHost !== String(request.headers.host || "")) {
      socket.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }
  }
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit("connection", ws, request);
  });
});

wss.on("connection", (ws) => {
  ws.lastHeardAt = Date.now();
  let messageRateAt = ws.lastHeardAt;
  let messageRateCount = 0;
  // Invite par defaut ; le hello authentifie (token compte) et fige
  // l'identite stable `u_<accountId>` (meme id apres refresh/restart).
  let id = `p${nextId++}`;
  let authed = false;
  let accountId = null;
  let mapId = "1-1";
  let state = { id, pseudo: "Pilote", shipId: "", x: 0, y: 0, angle: 0, dead: false, hpPct: 1, shPct: 1, atk: false, tx: 0, ty: 0, updatedAt: Date.now(), connectedAt: Date.now(),
    // PvP : PV autoritaires (init depuis la fiche vaisseau, sinon 1/1).
    hpMax: 1, shMax: 0, hp: 1, sh: 0, range: 800, pvpAt: 0, pvpFrom: null, npcAt: 0, npcFrom: null, pvpWin: 0, pvpWinT: 0 };
  roomFor(mapId).set(id, { ws, state });
  allWs.add(ws);
  ws.send(JSON.stringify({ t: "welcome", id, authed: false, run: serverRunId }));

  const correctState = () => {
    const now = Date.now();
    if (now - Number(state._correctionAt || 0) < 500) return;
    state._correctionAt = now;
    if (ws.readyState === 1) ws.send(JSON.stringify({ t: "stateCorrection", map: mapId, x: state.x, y: state.y }));
  };
  const movementTarget = key => rooms.get(mapId)?.get(String(key))?.state || npcSims.get(mapId)?.entries?.get(String(key)) || null;
  const changeMap = (nextMap, instance = false) => {
    if (nextMap === mapId && instance === (state.instance === true)) return true;
    if (!authed || !accountId) return false;
    const now = Date.now();
    if (fortifyActive(state, now)) return false;
    let arrival;
    if (state.instance === true) {
      if (instance || nextMap !== state._instanceReturn?.map) return false;
      arrival = state._instanceReturn;
    } else {
      arrival = mapTransition(serverMaps, state, mapId, nextMap, state._account?.faction, now);
      // Reprise d'une instance sauvegardée : son économie reste locale.
      const savedMap = state._account?.hangars?.find(h => h?.active)?.lastMap;
      const eternalRun = nextMap === "eternal"
        && state._account?.eternalGate?.deployed === true
        && state._account?.eternalGate?.inRun === true;
      if (!arrival && !state._joined && instance
        && ((String(savedMap).toLowerCase() === nextMap
          && ["alpha", "beta", "gamma", "delta", "epsilon", "zeta", "kappa", "lambda", "kronos", "awakened", "qz"].includes(nextMap))
          || eternalRun)) arrival = { instance: true };
    }
    if (!arrival || instance !== (arrival.instance === true)) return false;
    if (instance) {
      const home = respawnMap(state._account?.faction, nextMap);
      state._instanceReturn = { map: home, ...baseArrival(serverMaps, home, state._account?.faction) };
    } else {
      state._arrival = { ...arrival, until: now + 15000 };
      state.x = arrival.x;
      state.y = arrival.y;
    }
    state.serverMap = nextMap;
    state.portalCdUntil = now + 5000;
    return true;
  };

  ws.on("message", (raw) => {
    if (authed && accountSockets.get(id) !== ws) return;
    const rateNow = Date.now();
    if (rateNow - messageRateAt >= 1000) {
      messageRateAt = rateNow;
      messageRateCount = 0;
    }
    messageRateCount++;
    if (messageRateCount > 250) {
      try { ws.close(1008, "Message rate exceeded"); } catch {}
      return;
    }
    let msg = null;
    try { msg = JSON.parse(String(raw)); } catch { return; }
    if (!msg || typeof msg !== "object") return;
    ws.lastHeardAt = rateNow;
    // La pause est appliquee aussi par le serveur, meme si le DOM est retire.
    if (state._clockGuard?.blocked && ["pos", "map", "box", "hit", "pvpHit", "pvpPetHit", "stationHit", "skillUse", "shot", "rshot", "pvpLoot", "pvpLootTake"].includes(msg.t)) {
      stopRejectedMotion(state);
      if (msg.t === "pos" || msg.t === "map") correctState();
      return;
    }
    if (msg.t === "boxSyncReq") {
      // Resync explicite (le client a perdu la sync initiale : refresh,
      // purge, paquet perdu). Throttle anti-spam par connexion.
      try {
        if (state.instance === true) return;
        const now = Date.now();
        if (now - Number(state._boxSyncAt || 0) < 2000) return;
        state._boxSyncAt = now;
        sendBoxSync(ws, mapId);
      } catch {}
      return;
    }
    if (msg.t === "box") {
      // Box ambiantes entierement autoritaires : le serveur genere, valide la
      // distance, tranche le premier collecteur et programme le respawn.
      try {
        const room = rooms.get(mapId);
        if (!room || !room.has(id)) return;
        if (msg.op === "collect" && typeof msg.uid === "string") {
          const uid = msg.uid.slice(0, 64);
          const set = boxRooms.get(mapId);
          const box = set?.get(uid) || null;
          const shipDist = box && state._posOk === true ? Math.hypot(Number(state.x) - box.x, Number(state.y) - box.y) : Infinity;
          const petDist = box && state.peta === 1 ? Math.hypot(Number(state.petx ?? state.x) - box.x, Number(state.pety ?? state.y) - box.y) : Infinity;
          const accepted = !!box && Math.min(shipDist, petDist) <= 260 && set.delete(uid);
          if (accepted) {
            try { acRecordCollection(audOf(state), state._combat); } catch {}
            broadcastRoom(room, JSON.stringify({ t: "box", op: "collect", uid }), id);
            const cfg = COLLECTABLE_TYPES[box.type] || {};
            const delayMs = Math.max(250, Math.floor((Number(cfg.respawnDelaySec ?? 60) || 0) * 1000));
            if (!boxRespawns.has(mapId)) boxRespawns.set(mapId, []);
            boxRespawns.get(mapId).push({ uid, type: box.type, at: Date.now() + delayMs });
          }
          // Le demandeur ne touche la recompense qu'apres cette confirmation.
          try { ws.send(JSON.stringify({ t: "box", op: "claim", uid, ok: accepted, box: !accepted && box ? { uid, type: box.type, x: box.x, y: box.y } : undefined })); } catch {}
          return;
        }
      } catch {}
      return;
    }
    // Demande d'ami envoyée (HTTP) : notification live au destinataire
    // connecté. Vérifiée en base (anti-usurpation : la demande doit exister).
    if (msg.t === "friendPing") {
      try {
        if (!authed || !accountId) return;
        const now = Date.now();
        if (now - Number(friendPingLast.get(id) || 0) < 1000) return;
        friendPingLast.set(id, now);
        const target = String(msg.to || "").trim().slice(0, 20);
        if (!target) return;
        const who = findUserByPseudo(target);
        if (!who || !hasFriendRequest(accountId, who.id)) return;
        const peer = findPeerByPseudo(who.pseudo);
        if (peer) sendToPeer(peer.id, { t: "friendRequest", from: id, fromPseudo: String(state.pseudo || "Pilote").slice(0, 20), at: now });
        try { if (ws.readyState === 1) ws.send(JSON.stringify({ t: "friendPingAck", to: who.pseudo })); } catch {}
      } catch {}
      return;
    }
    // Réponse à une demande (HTTP accept/decline) : l'autre rafraîchit.
    if (msg.t === "friendResponded") {
      try {
        if (!authed || !accountId) return;
        const target = String(msg.to || "").trim().slice(0, 20);
        if (!target) return;
        const peer = findPeerByPseudo(target);
        if (peer) sendToPeer(peer.id, { t: "friendsChanged" });
      } catch {}
      return;
    }
    // Clan : tchat réservé aux membres (rooms + instances, comme le
    // tchat global). 1 message / 500 ms, 200 caractères.
    if (msg.t === "clanChat") {
      try {
        if (!authed || !accountId) return;
        const now = Date.now();
        if (now - Number(clanChatLast.get(id) || 0) < 500) return;
        const text = String(msg.text || "").replace(/\s+/g, " ").trim().slice(0, 200);
        if (!text) return;
        const tag = refreshClanTag(state, accountId);
        if (!tag) return;
        clanChatLast.set(id, now);
        broadcastToClan(tag, { t: "clanMsg", from: id, fromPseudo: String(state.pseudo || "Pilote").slice(0, 20), tag, text, at: now });
      } catch {}
      return;
    }
    // Clan : après une mutation HTTP (invite, accept, kick, leave, rang),
    // le client prévient les membres connectés (rechargent via /api).
    if (msg.t === "clanNotify") {
      try {
        if (!authed || !accountId) return;
        const now = Date.now();
        if (now - Number(clanChatLast.get(`${id}:notify`) || 0) < 500) return;
        clanChatLast.set(`${id}:notify`, now);
        const tag = refreshClanTag(state, accountId);
        try {
          if (ws.readyState === 1) ws.send(JSON.stringify({ t: "clanTag", tag: String(tag || "") }));
        } catch {}
        if (tag) broadcastToClan(tag, { t: "clanChanged", tag }, id);
        const target = String(msg.to || "").trim().slice(0, 20);
        if (target) {
          const peer = findPeerByPseudo(target);
          if (peer && String(peer.id) !== String(id)) sendToPeer(peer.id, { t: "clanChanged", tag: String(tag || "") });
        }
      } catch {}
      return;
    }
    // Clan : resync du tag en mémoire (après accept/kick/leave).
    if (msg.t === "clanRefresh") {
      try {
        if (!authed || !accountId) return;
        const tag = refreshClanTag(state, accountId);
        try {
          if (ws.readyState === 1) ws.send(JSON.stringify({ t: "clanTag", tag: String(tag || "") }));
        } catch {}
      } catch {}
      return;
    }
    // Diplomatie : après une mutation HTTP, prévient les deux clans
    // (rechargent relations + roster via /api) + annonce système.
    if (msg.t === "diploNotify") {
      try {
        if (!authed || !accountId) return;
        const now = Date.now();
        if (now - Number(clanChatLast.get(`${id}:diplo`) || 0) < 500) return;
        clanChatLast.set(`${id}:diplo`, now);
        const tag = refreshClanTag(state, accountId);
        try {
          if (ws.readyState === 1) ws.send(JSON.stringify({ t: "clanTag", tag: String(tag || "") }));
        } catch {}
        const other = String(msg.tag || "").toUpperCase().slice(0, 5);
        const text = String(msg.text || "").replace(/\s+/g, " ").trim().slice(0, 200);
        if (tag) {
          broadcastToClan(tag, { t: "clanChanged", tag });
          if (text) broadcastToClan(tag, { t: "clanMsg", from: "", fromPseudo: "[Diplomatie]", tag, text, at: now });
        }
        if (other && other !== String(tag || "").toUpperCase()) {
          broadcastToClan(other, { t: "clanChanged", tag: other });
          if (text) broadcastToClan(other, { t: "clanMsg", from: "", fromPseudo: "[Diplomatie]", tag: other, text, at: now });
        }
      } catch {}
      return;
    }
    // Groupes + murmures : messages dirigés cross-map (rooms + instances).
    if (msg.t === "groupCreate" || msg.t === "groupInvite" || msg.t === "groupAccept" || msg.t === "groupDecline"
      || msg.t === "groupLeave" || msg.t === "groupKick" || msg.t === "groupChat" || msg.t === "groupSync"
      || msg.t === "groupInviteLock" || msg.t === "groupRally" || msg.t === "whisper") {
      try {
        handleSocialMessage({
          id, state, authed,
          send: (obj) => { try { if (ws.readyState === 1) ws.send(JSON.stringify(obj)); } catch {} },
          sendTo: (pid, obj) => sendToPeer(pid, obj),
          findByPseudo: (pseudo) => findPeerByPseudo(pseudo),
          describe: (pid) => describePeer(pid),
        }, msg);
      } catch {}
      return;
    }
    if (msg.t === "hit") {
      // Degats sur NPC partage : le serveur tranche (HP, mort, killer).
      try {
        if (!authed || !accountId) return;
        const shooter = rooms.get(mapId)?.get(id)?.state;
        if (!shooter || shooter.pvpDead === true || !(Number(shooter.hp) > 0)) return;
        if (msg.ability === "ability_hyperion_qa") {
          const sim = npcSims.get(mapId);
          if (hyperionSafeBlocked(shooter, sim?.entries?.get(String(msg.uid)), sim, false)) return;
        }
        const now = Date.now();
        const profile = refreshCombatProfile(shooter, accountId, mapId);
        // Hits d'exécution d'aptitude (one-shots) : droit frais vérifié
        // (fenêtre CHS consommée, ou aura active) -> contourne l'enveloppe
        // du profil, marqué execOk pour la simu (plafond relevé). Seaux
        // anticheat conservés. Sinon validation standard.
        const simTarget = npcSims.get(mapId)?.entries?.get(String(msg.uid));
        if (msg.ability && hyperionSafeBlocked(shooter, simTarget, npcSims.get(mapId), false)) return;
        msg = validateCombatHit(profile, msg, shooter, now, simTarget);
        if (!msg) return;
        broadcastChargedShot(rooms.get(mapId), shooter, msg, now);
        msg.unlimitedRange = unlimitedAbilityRange(msg.ability);
        try {
          const dd = casterDebuffOn(shooter, msg.uid, now);
          if (dd.weaken > 0) msg.weaken = Math.max(Number(msg.weaken) || 0, dd.weaken);
          let penBonus = dd.penBonus;
          for (const { state: caster } of rooms.get(mapId)?.values() || []) {
            penBonus = Math.max(penBonus, casterDebuffOn(caster, msg.uid, now).penBonus);
          }
          if (penBonus > 0) msg.pen = Math.max(0, Math.min(1, (Number(msg.pen) || 0) + penBonus));
          if (dd.dmgMult > 1 && Number(msg.dmg) > 0) msg.dmg = Number(msg.dmg) * dd.dmgMult;
        } catch {}
        // Anti-rafale : seaux par attaquant (horloge serveur). Rafales AoE
        // légitimes OK, spam Cheat Engine étouffé (mitigation + log).
        // Dégâts nuls (spam de freeze/ralentissement) : coût x5.
        const hitDmg = Math.max(0, Number(msg.dmg) || 0) * profile.critMult * 1.05 * 1.25;
        const hitCost = hitDmg > 0 ? 1 : 5;
        if (!acBucket(shooter, "HitN", now, AC_HIT_CAP, AC_HIT_REFILL, hitCost)
          || !acBucket(shooter, "HitD", now, AC_DMG_CAP, AC_DMG_REFILL, hitDmg)) {
          acRecordViolation(shooter, "combat", now, { reason: "Rafale d'impacts NPC depassant le budget" });
          if (acStrike(shooter, "hitStrike")) {
            try { console.log(`[multi:anticheat] rafale degats ${shooter.pseudo} (${mapId})`); } catch {}
          }
          return;
        }
        const sim = npcSims.get(mapId);
        if (sim && typeof sim.applyHit === "function") {
          syncDisruptorEffects(rooms.get(mapId), sim, now);
          if (laserDisrupted(shooter, msg, now)) return;
          const appliedHit = Number(sim.applyHit(id, msg)) || 0;
          if (appliedHit > 0) { recordAbilityDamageDealt(shooter, appliedHit, now); try { audOf(shooter).dmg += appliedHit; } catch {} }
          applyEnergyLeech(shooter, appliedHit, now,
            event => emitAbilityEvent(rooms.get(mapId), event), sim.entries?.get(String(msg.uid)));
          // Diagnostic multi (console serveur) : hits recus par map.
          hitStats.count++;
          hitStats.byMap.set(mapId, (hitStats.byMap.get(mapId) || 0) + 1);
        }
      } catch {}
      return;
    }
    if (msg.t === "clockReport") {
      // Declaration du client : pause reversible, aucun score ni gel de compte.
      const now = Date.now();
      if (!authed || !accountId || !acBucket(state, "ClockReport", now, 1, 0.25, 1)) return;
      const requested = Number(msg.requestedSeconds), elapsed = Number(msg.serverSeconds);
      const guard = updateClockGuard(state, requested, elapsed, now);
      if (!guard) return;
      if (requested > elapsed * 3) {
        acRecordViolation(state, "clock", now, { reason: "Horloge acceleree signalee par le client",
          scale: Math.min(1000, requested / elapsed), declared: true });
      }
      if (guard.blocked) stopRejectedMotion(state);
      try { ws.send(JSON.stringify({ t: "speedGuard", ...guard })); } catch {}
      return;
    }
    if (msg.t === "skillUse") {
      try {
        if (!authed || !accountId || state.instance === true) return;
        const room = rooms.get(mapId);
        if (!room || !room.has(id)) return;
        const skill = String(msg.skill || "").toLowerCase();
        if (skill === "ability_paladin_last-stand") return; // Déclenchement dans le calcul des dégâts, jamais au clic.
        // Les annulations restent permises ; toutes les activations sont bloquées.
        // Refus explicite (pas silencieux) : le client annule son effet local
        // au lieu d'afficher une aptitude qui ne convertira rien côté serveur.
        if (Date.now() < Number(state._jamUntil || 0) && msg.enabled !== false && msg.phase !== "unlink") {
          try {
            if (ws.readyState === 1) ws.send(JSON.stringify({ t: "skillDenied", skill }));
          } catch {}
          return;
        }
        if (skill === "ability_tempest_volt-backup") {
          const now = Date.now();
          refreshCombatProfile(state, accountId, mapId);
          if (!triggerTempestBackup(state, room, now, true)) state._tempestBackupRequestedUntil = now + 2000;
          return;
        }
        if (msg.phase === "unlink") {
          breakRepairLink(state, skill, room, id, Date.now());
          return;
        }
        // Tech Battle Repair Bot (10k HP/s pendant 15 s) / Battle Repair
        // Bot 2 (30k HP/s pendant 10 s) : HoT serveur (ticks +X via le canal
        // heal, visibles par soi et les verrouilleurs). Conditions : vivant,
        // pas déjà au max de coque. Recharge 300 s chacune. L'aura déborde
        // de 999 ms pour couvrir le tick de la dernière seconde.
        if (skill === "ability_tech_battle_repair" || skill === "ability_tech_battle_repair_2") {
          const now = Date.now();
          const deny = (cooldown) => {
            if (ws.readyState === 1) ws.send(JSON.stringify({ t: "skillDenied", skill,
              cooldown: Math.max(0, Number(cooldown) || 0) }));
          };
          if (state.pvpDead === true || !(Number(state.hp) > 0)) { deny(0); return; }
          const cds = (state._techCds && typeof state._techCds === "object") ? state._techCds : (state._techCds = {});
          if (now < Number(cds[skill] || 0)) { deny((Number(cds[skill]) - now) / 1000); return; }
          const hpMax = Math.max(0, Number(state.hpMax) || 0);
          if (!(hpMax > 0) || !(Number(state.hp) < hpMax)) { deny(0); return; }
          const durSec = skill === "ability_tech_battle_repair_2" ? 10 : 15;
          if (!state._abilityFx || typeof state._abilityFx !== "object") state._abilityFx = {};
          state._abilityFx[skill] = { from: now, until: now + durSec * 1000 + 999, x: 0, y: 0, target: "" };
          cds[skill] = now + 300_000;
          return;
        }
        // Tech Shield Backup (150k) / Shield Backup 2 (300k) : restauration
        // instantanée, +X visible par soi et les verrouilleurs (canal heal).
        // Conditions : générateur de bouclier équipé, pas déjà au max.
        // Recharge 300 s chacune (une tech n'en verrouille plus une autre).
        if (skill === "ability_tech_shield_backup" || skill === "ability_tech_shield_backup_2") {
          const now = Date.now();
          const deny = (cooldown) => {
            if (ws.readyState === 1) ws.send(JSON.stringify({ t: "skillDenied", skill,
              cooldown: Math.max(0, Number(cooldown) || 0) }));
          };
          if (state.pvpDead === true || !(Number(state.hp) > 0)) { deny(0); return; }
          const cds = (state._techCds && typeof state._techCds === "object") ? state._techCds : (state._techCds = {});
          if (now < Number(cds[skill] || 0)) { deny((Number(cds[skill]) - now) / 1000); return; }
          const shMax = Math.max(0, Number(state.shMax) || 0);
          const sh = Math.max(0, Number(state.sh) || 0);
          if (!(shMax > 0)) { deny(0); return; }
          if (!(sh < shMax)) { deny(0); return; }
          const cap = skill === "ability_tech_shield_backup_2" ? 300_000 : 150_000;
          const amount = Math.max(0, Math.min(cap, shMax - sh));
          if (!(amount > 0)) { deny(0); return; }
          state.sh = Math.min(shMax, sh + amount);
          cds[skill] = now + 300_000;
          emitAbilityEvent(room, { t: "skillFx", skill, phase: "heal", by: id, target: id,
            amount: Math.round(amount), shield: true, at: now, until: now });
          return;
        }
        // Tech Energy Leech : vol de vie 10 % pendant 30 min, CD 900 s
        // (spécifique, pas 300 s comme les autres). Aura serveur + boucle
        // LIFE_STEAL visible par tous (skillFx). Le soin est crédité à
        // chaque dégât infligé (NPC + joueurs, JPC compris).
        if (skill === "ability_tech_energy_leech" && msg.phase === "fire") {
          const now = Date.now();
          if (!state._abilityFx || typeof state._abilityFx !== "object") state._abilityFx = {};
          const auraUntil = Number(state._abilityFx[skill]?.until) || 0;
          const deny = (cooldown) => {
            try { console.log(`[leech] deny ${state.pseudo || id} hp=${state.hp} auraUntil=${auraUntil} now=${now}`); } catch {}
            if (ws.readyState === 1) ws.send(JSON.stringify({ t: "skillDenied", skill,
              cooldown: Math.max(0, Number(cooldown) || 0) }));
          };
          if (state.pvpDead === true || !(Number(state.hp) > 0)) { deny(0); return; }
          if (now < auraUntil) {
            // Une reconnexion peut répéter l'activation locale persistée.
            // Garde l'aura et renvoie son horloge au lieu de l'annuler.
            try {
              broadcastRoom(room, JSON.stringify({ t: "skillFx", skill, by: id,
                at: Number(state._abilityFx[skill]?.from) || now, until: auraUntil }));
            } catch {}
            return;
          }
          if (auraUntil > 0 && now < auraUntil + 900000) { deny((auraUntil + 900000 - now) / 1000); return; }
          state._abilityFx[skill] = { from: now, until: now + 1800000, x: 0, y: 0, target: "" };
          try { console.log(`[leech] fire ${state.pseudo || id} aura jusqu=${new Date(now + 1800000).toISOString()}`); } catch {}
          try {
            broadcastRoom(room, JSON.stringify({ t: "skillFx", skill, by: id,
              at: now, until: now + 1800000 }));
          } catch {}
          return;
        }
        if (msg.phase === "heal") {
          relayAbilityHealFx(state, skill, msg, room, id, Date.now());
          return;
        }
        if (skill === "ability_tech_speed_burst") {
          // Tech Speed Burst : 900 pendant 2 s, recharge 300 s individuelle.
          // Aura afx (code 83, flammes visibles par tous) + effet _moveEffects
          // flat:900 (même plafond côté anticheat que le client).
          const now = Date.now();
          const profile = refreshCombatProfile(state, accountId, mapId);
          const deny = (cooldown) => {
            if (ws.readyState === 1) ws.send(JSON.stringify({ t: "skillDenied", skill,
              cooldown: Math.max(0, Number(cooldown) || 0) }));
          };
          if (state.pvpDead === true || !(Number(state.hp) > 0)) { deny(0); return; }
          const cds = (state._techCds && typeof state._techCds === "object") ? state._techCds : (state._techCds = {});
          if (now < Number(cds["ability_tech_speed_burst"] || 0)) {
            deny((Number(cds["ability_tech_speed_burst"]) - now) / 1000);
            return;
          }
          cds["ability_tech_speed_burst"] = now + 300_000;
          const from = now, until = now + 2000;
          if (!state._abilityFx || typeof state._abilityFx !== "object") state._abilityFx = {};
          state._abilityFx["ability_tech_speed_burst"] = { from, until, x: 0, y: 0, target: "" };
          const map = state._moveEffects && typeof state._moveEffects === "object" ? state._moveEffects : (state._moveEffects = {});
          map["ability_tech_speed_burst"] = { from, until, flat: 900, shipId: profile.shipId, hangarId: profile.hangarId, config: profile.config };
          state.moveSpeed = movementSpeed(state, profile, now);
          state.vmax = state.moveSpeed;
          return;
        }
        // Tech Chain Impulse (phase fire = prochain tir consommé) : 30k
        // dégâts à tous les ennemis (NPC + joueurs) dans 700 autour du
        // lanceur, éclair identique pour tous (skillFx chain). Pas de
        // ralentissement (c'est Frost Field). Recharge 300 s, posée au tir.
        if (skill === "ability_tech_chain_impulse" && msg.phase === "fire") {
          const now = Date.now();
          const sim = npcSims.get(mapId);
          const profile = refreshCombatProfile(state, accountId, mapId);
          const deny = (cooldown) => {
            if (ws.readyState === 1) ws.send(JSON.stringify({ t: "skillDenied", skill,
              cooldown: Math.max(0, Number(cooldown) || 0) }));
          };
          if (state.pvpDead === true || !(Number(state.hp) > 0)) { deny(0); return; }
          const cds = (state._techCds && typeof state._techCds === "object") ? state._techCds : (state._techCds = {});
          if (now < Number(cds[skill] || 0)) { deny((Number(cds[skill]) - now) / 1000); return; }
          const seen = new Set([String(id)]);
          const hits = [];
          const inRange = (x, y) => {
            const dx = Number(x) - Number(state.x), dy = Number(y) - Number(state.y);
            return dx * dx + dy * dy <= 700 * 700;
          };
          if (sim && typeof sim.entries?.[Symbol.iterator] === "function") {
            for (const [uid, npc] of sim.entries) {
              if (hits.length >= 12) break;
              if (!npc || npc.dead === true || !(Number(npc.hp) > 0)) continue;
              const vid = String(uid);
              if (seen.has(vid) || !inRange(npc.x, npc.y)) continue;
              seen.add(vid);
              try {
                const damage = sim.applyHit(String(id), { uid: vid, dmg: 30000, pen: 0, critChance: 0, critMult: 1, variance: 0 });
                applyEnergyLeech(state, damage, now, event => emitAbilityEvent(room, event), npc);
              } catch {}
              hits.push({ id: vid, x: Math.round(Number(npc.x)), y: Math.round(Number(npc.y)) });
            }
          }
          for (const [pid, pentry] of room) {
            if (hits.length >= 12) break;
            if (pid === id || seen.has(String(pid))) continue;
            const s = pentry?.state;
            if (!s || s.pvpDead === true || !(Number(s.hp) > 0)) continue;
            if (s.safe === true) continue;
            if (s.firm && state.firm && String(s.firm) === String(state.firm)) continue;
            if (!inRange(s.x, s.y)) continue;
            seen.add(String(pid));
            try {
              const result = applyServerAbilityDamage(room, sim, s, 30000, 0, now, id, profile, 0);
              applyEnergyLeech(state, result?.total, now, event => emitAbilityEvent(room, event), s);
            } catch {}
            hits.push({ id: String(pid), x: Math.round(Number(s.x)), y: Math.round(Number(s.y)) });
          }
          cds[skill] = now + 300_000;
          if (hits.length) {
            try {
              broadcastRoom(room, JSON.stringify({ t: "skillFx", skill, by: id, chain: hits,
                at: now, until: now + Math.min(1500, 200 + hits.length * 120) }));
            } catch {}
          }
          return;
        }
        // Tech Frost Field (phase fire = prochain tir consommé) : -50 % de
        // vitesse pendant 2 s aux ennemis (NPC + joueurs) dans 700 autour du
        // lanceur + halo cyan clair de 700 visible par tous (skillFx, halo
        // dessiné 2 s). Recharge 300 s, posée au tir.
        if (skill === "ability_tech_frost_field" && msg.phase === "fire") {
          const now = Date.now();
          const sim = npcSims.get(mapId);
          const deny = (cooldown) => {
            if (ws.readyState === 1) ws.send(JSON.stringify({ t: "skillDenied", skill,
              cooldown: Math.max(0, Number(cooldown) || 0) }));
          };
          if (state.pvpDead === true || !(Number(state.hp) > 0)) { deny(0); return; }
          const cds = (state._techCds && typeof state._techCds === "object") ? state._techCds : (state._techCds = {});
          if (now < Number(cds[skill] || 0)) { deny((Number(cds[skill]) - now) / 1000); return; }
          const seen = new Set([String(id)]);
          let count = 0;
          const inRange = (x, y) => {
            const dx = Number(x) - Number(state.x), dy = Number(y) - Number(state.y);
            return dx * dx + dy * dy <= 700 * 700;
          };
          if (sim && typeof sim.entries?.[Symbol.iterator] === "function") {
            for (const [uid, npc] of sim.entries) {
              if (count >= 12) break;
              if (!npc || npc.dead === true || !(Number(npc.hp) > 0)) continue;
              const vid = String(uid);
              if (seen.has(vid) || !inRange(npc.x, npc.y)) continue;
              seen.add(vid);
              npc.slowPct = Math.max(Number(npc.slowPct) || 0, 50);
              npc.slowUntil = Math.max(Number(npc.slowUntil) || 0, now + 2000);
              count++;
            }
          }
          for (const [pid, pentry] of room) {
            if (count >= 12) break;
            if (pid === id || seen.has(String(pid))) continue;
            const s = pentry?.state;
            if (!s || s.pvpDead === true || !(Number(s.hp) > 0)) continue;
            if (s.safe === true) continue;
            if (s.firm && state.firm && String(s.firm) === String(state.firm)) continue;
            if (!inRange(s.x, s.y)) continue;
            seen.add(String(pid));
            s.slowPct = Math.max(now < Number(s.slowUntil) ? Number(s.slowPct) || 0 : 0, 50);
            s.slowUntil = Math.max(Number(s.slowUntil) || 0, now + 2000);
            count++;
          }
          cds[skill] = now + 300_000;
          try {
            broadcastRoom(room, JSON.stringify({ t: "skillFx", skill, by: id,
              at: now, until: now + 2000 }));
          } catch {}
          return;
        }
        // Tech NPC Bomb : halo violet 700 pendant 60 s, toutes les 10 s un
        // tick de 100k dégâts sur les NPC dans 700 (ni joueurs ni JPC).
        // 6 x 100k = 600k au total. Visuel identique pour tous (skillFx).
        // Le CD de 300 s démarre après le 6e pulse (posé par le tick).
        if (skill === "ability_tech_npc_bomb" && msg.phase === "fire") {
          const now = Date.now();
          const sim = npcSims.get(mapId);
          const deny = (cooldown) => {
            if (ws.readyState === 1) ws.send(JSON.stringify({ t: "skillDenied", skill,
              cooldown: Math.max(0, Number(cooldown) || 0) }));
          };
          if (state.pvpDead === true || !(Number(state.hp) > 0)) { deny(0); return; }
          const cds = (state._techCds && typeof state._techCds === "object") ? state._techCds : (state._techCds = {});
          if (now < Number(cds[skill] || 0)) { deny((Number(cds[skill]) - now) / 1000); return; }
          if (now < Number(state._abilityFx?.[skill]?.until) || 0) { deny(0); return; }
          if (!state._abilityFx || typeof state._abilityFx !== "object") state._abilityFx = {};
          // +999 ms pour couvrir le tick de la 60e seconde (sinon 5 ticks).
          state._abilityFx[skill] = { from: now, until: now + 60000 + 999, x: 0, y: 0, target: "" };
          try {
            broadcastRoom(room, JSON.stringify({ t: "skillFx", skill, by: id,
              at: now, until: now + 60000 }));
          } catch {}
          return;
        }
        // Tech Precision Targeter : le serveur ne pose que le CD de 300 s
        // (100 % précision 60 min gérée côté client, aucun roll serveur).
        if (skill === "ability_tech_precision_targeter" && msg.phase === "fire") {
          // Aura 60 min : redeclenchement bloque tant qu'elle court, puis
          // CD 300 s (le client affiche le decompte d'effet puis le CD).
          const now = Date.now();
          if (!state._abilityFx || typeof state._abilityFx !== "object") state._abilityFx = {};
          const auraUntil = Number(state._abilityFx[skill]?.until) || 0;
          const deny = (cooldown) => {
            if (ws.readyState === 1) ws.send(JSON.stringify({ t: "skillDenied", skill,
              cooldown: Math.max(0, Number(cooldown) || 0) }));
          };
          if (state.pvpDead === true || !(Number(state.hp) > 0)) { deny(0); return; }
          if (now < auraUntil) { deny(0); return; }
          if (auraUntil > 0 && now < auraUntil + 300000) { deny((auraUntil + 300000 - now) / 1000); return; }
          state._abilityFx[skill] = { from: now, until: now + 3600000, x: 0, y: 0, target: "" };
          return;
        }
        if (skill.startsWith("ability_")) {
          const profile = refreshCombatProfile(state, accountId, mapId);
          if (skill === "ability_mimesis_phase-out") {
            const now = Date.now();
            const arrival = usePhaseOut(state, profile, mapId, serverMaps.get(mapId)?.world, now);
            if (arrival) {
              Object.assign(state, arrival, { vx: 0, vy: 0, moving: false, motionBlocked: false, teleportSeq: (state.teleportSeq || 0) + 1, moveBuck: 0, moveBuckT: now, _arrival: null });
              ws.send(JSON.stringify({ t: "stateCorrection", map: mapId, ...arrival }));
            }
            return;
          }
          const nowFx = Date.now();
          const movementAbility = isMovementAbilityKey(skill);
          const moveOk = movementAbility && useMovementAbility(state, profile, skill, msg.enabled !== false, nowFx, movementTarget(msg.target), String(msg.target || ""));
          if (!movementAbility || moveOk) {
            const accepted = trackAbilityFx(state, profile, skill, msg, room, id, nowFx, npcSims.get(mapId));
            if (!accepted && msg.enabled !== false) {
              if (movementAbility) stopMovementAbility(state, profile, nowFx, skill);
              if (ws.readyState === 1) ws.send(JSON.stringify({ t: "skillDenied", skill,
                cooldown: Math.max(0, (Number(state._abilityCds?.[skill]) - nowFx) / 1000 || 0) }));
            }
            syncDisruptorEffects(room, npcSims.get(mapId), nowFx);
          }
          if (moveOk) {
            state.moveSpeed = movementSpeed(state, profile, Date.now());
          } else if (msg.enabled !== false && isMovementAbilityKey(skill)) {
            // Refusé (mauvais vaisseau, cooldown, cible, portée, bouclier) :
            // le client annule son effet local au lieu de rubber-bander
            // pendant toute la durée. Convergence, pas d'entêtement.
            try {
              if (ws.readyState === 1) ws.send(JSON.stringify({ t: "skillDenied", skill }));
            } catch {}
          }
          return;
        }
        if (skill !== "iem" && skill !== "ish" && skill !== "smb") return;
        const now = Date.now();
        const cdKey = skill === "iem" ? "iemCdUntil" : skill === "ish" ? "ishCdUntil" : "smbCdUntil";
        if (now < Number(state[cdKey] || 0)) return;
        state[cdKey] = now + 30_000;
        const until = now + 3_000;
        if (skill === "iem") {
          takeMovement(state, refreshCombatProfile(state, accountId, mapId), state.x, state.y, now);
          state.iemUntil = until;
          // L'IEM dissipe les ralentissements et gels déjà actifs. Ces champs
          // sont autoritaires : leur remise à zéro empêche un ancien effet de
          // revenir dans le snapshot suivant.
          state.slowPct = 0;
          state.slowUntil = 0;
          state.freezeUntil = 0;
          const sim = npcSims.get(mapId);
          if (sim && typeof sim.breakPlayerLocks === "function") sim.breakPlayerLocks(id, until);
        } else if (skill === "ish") {
          state.ishUntil = until;
        }
        // smb : pas d'invincibilité (pas de ishUntil -> pas de bulle ISH
        // affichée sur le lanceur par les autres clients). Le skillFx part
        // quand même (explosion + son visibles par la room).
        broadcastRoom(room, JSON.stringify({ t: "skillFx", skill, by: id, at: now, until }));
      } catch {}
      return;
    }
    if (msg.t === "pvpHit") {
      // PvP : degats d'un joueur sur un autre, tranches ici.
      try {
        if (!authed || !accountId) return;
        const room = rooms.get(mapId);
        if (!room || !room.has(id)) return;
        let foe = room.get(String(msg.target));
        const me = room.get(id);
        if (!foe || !me) return;
        if (foe === me || me.state.pvpDead === true || !(me.state.hp > 0)) return;
        if (msg.ability === "ability_hyperion_qa"
          && foe.state.safe === true) return;
        const profile = refreshCombatProfile(me.state, accountId, mapId);
        // Hits d'exécution d'aptitude : droit frais vérifié -> enveloppe
        // contournée (plafond EXEC_HIT_CAP_PVP), hit normalisé à la main.
        // Seaux anticheat conservés ci-dessous. Sinon validation standard.
        const impactNow = Date.now();
        // Seule la cible protégée bloque : l'attaquant en ZNA peut tirer
        // (il perd sa protection en attaquant, parité client netPvpBlocked).
        if (foe.state.safe === true) return;
        msg = validateCombatHit(profile, msg, me.state, impactNow, foe.state);
        if (!msg) return;
        broadcastChargedShot(room, me.state, msg, impactNow);
        const execBypass = msg.execOk === true;
        const execAbility = msg.abilityFinal ? msg.ability : "";
        const now = Date.now();
        // Anti-rafale PvP : mêmes seaux (plus stricts : TTK faibles).
        const pvpDmg = Math.max(0, Number(msg.dmg) || 0);
        const pvpCost = pvpDmg > 0 ? 1 : 5;
        if (!acBucket(me.state, "PvpN", now, AC_PVP_HIT_CAP, AC_PVP_HIT_REFILL, pvpCost)
          || !acBucket(me.state, "PvpD", now, AC_PVP_DMG_CAP, AC_PVP_DMG_REFILL, pvpDmg)) {
          acRecordViolation(me.state, "combat", now, { reason: "Rafale d'impacts PvP depassant le budget" });
          if (acStrike(me.state, "pvpStrike")) {
            try { console.log(`[multi:anticheat] rafale pvp ${me.state.pseudo} (${mapId})`); } catch {}
          }
          return;
        }
        let dmg = Number(msg.dmg);
        const hasStatus = (Number(msg.slowPct) > 0 && Number(msg.slowSec) > 0) || Number(msg.freezeSec) > 0 || Number(msg.accuracyPenaltyPct) > 0;
        // Exécution vérifiée : plafond relevé (le droit a été contrôlé).
        const dmgCap = execBypass === true ? EXEC_HIT_CAP_PVP : 1e7;
        if (!Number.isFinite(dmg) || dmg < 0 || dmg > dmgCap || (dmg === 0 && !hasStatus)) return;
        if (foe.state.dead) return;
        if (tempestBackupActive(foe.state, now)) return;
        if (now < Number(foe.state.ishUntil || 0)) return;
        if (now < Number(foe.state.iemUntil || 0)) return;
        // Deja tue (pos de mort pas encore arrivee) : pas de double kill.
        if (foe.state.pvpDead === true) return;
        const wasAlive = Number(foe.state.hp) > 0;
        // Revive rate (reparation entre le pos et le tir) : rebase d'abord,
        // plafonné au budget de remontée (sinon vie figée pleine = dieu).
        if (!wasAlive) return;
        // Anti-teleport : projectile credible depuis la position de l'attaquant.
        const reach = (Number(me.state.range) || 800) + 800;
        const dx = Number(foe.state.x) - Number(me.state.x);
        const dy = Number(foe.state.y) - Number(me.state.y);
        if (dx * dx + dy * dy > reach * reach && !unlimitedAbilityRange(msg.ability)) return;
        syncDisruptorEffects(room, npcSims.get(mapId), now);
        if (!execBypass && laserDisrupted(me.state, msg, now)) return;
        const statusFoe = foe;
        if (dmg > 0) {
          const redirected = redirectedPlayer(room, foe.state, now);
          if (redirected) {
            foe = redirected;
            if (now < Number(foe.state.ishUntil || 0) || now < Number(foe.state.iemUntil || 0) || tempestBackupActive(foe.state, now)) return;
          } else {
            const fx = foe.state._abilityFx?.ability_disruptor_redirect;
            const sim = npcSims.get(mapId);
            const npcTarget = fx && fx.until > now ? sim?.entries?.get(String(fx.target)) : null;
            if (npcTarget?.hp > 0) {
              sim.applyHit(id, { ...msg, uid: String(fx.target), critChance: 0, critMult: 1, execOk: true });
              return;
            }
          }
        }
        const pen = Math.max(0, Math.min(1, Number(msg.pen ?? 0)));
        let applied = 0;
        // Orcus Assimilation de la VICTIME : 80 % des dégâts PvP convertis
        // en PV (plafond hpMax), 20 % restants appliqués normalement.
        // Sans ça, la conversion locale (hurtPlayer) ne vaudrait que vs NPC
        // car le client n'adopte que les baisses serveur.
        let debWeaken = 0, debDmgMult = 1, debPenBonus = 0;
        try {
          for (const [, pentry] of room) {
            const dd = fxDebuffsOn(pentry?.state?._abilityFx, foe.state.id, now);
            debWeaken = Math.max(debWeaken, dd.weaken);
            debDmgMult = Math.max(debDmgMult, dd.dmgMult);
            debPenBonus = Math.max(debPenBonus, dd.penBonus);
          }
        } catch {}
        let evadeEff = Math.max(0, Math.min(0.9, Number(foe.state.evade) || 0));
        try {
          const vm = foe.state._moveEffects;
          if (vm && typeof vm === "object") {
            for (const [vk, ve] of Object.entries(vm)) {
              if (vk === "ability_mimesis_scramble" && ve && Number(ve.until) > now) {
                evadeEff = Math.min(0.9, evadeEff + 0.65);
                break;
              }
            }
          }
        } catch {}
        if (msg.kind === "sab") {
          const drained = Math.min(Math.max(0, Number(foe.state.sh) || 0), dmg);
          foe.state.sh = Math.max(0, Number(foe.state.sh) - drained);
          applied = drained;
        } else {
          if (Math.random() < evadeEff) return;
          // Diminisher : +50 % au prorata du bouclier restant.
          if (debDmgMult > 1 && dmg > 0) dmg = dmg * debDmgMult;
          let penEff = pen;
          if (debPenBonus > 0) penEff = Math.max(0, Math.min(1, penEff + debPenBonus));
          const res = applyServerAbilityDamage(room, npcSims.get(mapId), foe.state, dmg, penEff, now, id, profile, debWeaken);
          applied = Number(res?.total) || 0;
          foe.state.hp = Math.max(0, Number(foe.state.hp) || 0);
          foe.state.sh = Math.max(0, Number(foe.state.sh) || 0);
          // Energy Leech : 10 % des dégâts PvP rendus en coque (+X comme
          // les soins, visibles par le lanceur et ses verrouilleurs).
          applyEnergyLeech(me.state, applied, now, event => emitAbilityEvent(room, event), foe.state);
        }
        foe.state.pvpAt = now;
        // Blackout remontées : un soin (pos) qui arrive juste après ce coup
        // ne doit pas l'effacer avant que la victime l'ait adopté (sinon
        // le tireur voit des chiffres mais la barre ne bouge pas).
        if (Number(msg.dmg) > 0) foe.state.dmgBlockUntil = now + 500;
        const slowPct = Math.max(0, Math.min(95, Number(msg.slowPct) || 0));
        const slowSec = Math.max(0, Math.min(30, Number(msg.slowSec) || 0));
        const freezeSec = Math.max(0, Math.min(5, Number(msg.freezeSec) || 0));
        if (Number(msg.accuracyPenaltyPct) > 0) {
          statusFoe.state.accuracyPenaltyPct = Math.max(now < Number(statusFoe.state.accuracyUntil) ? Number(statusFoe.state.accuracyPenaltyPct) || 0 : 0, Number(msg.accuracyPenaltyPct));
          statusFoe.state.accuracyUntil = Math.max(Number(statusFoe.state.accuracyUntil) || 0, now + Number(msg.accuracySec) * 1000);
        }
        if (slowPct > 0 && slowSec > 0) {
          takeMovement(foe.state, foe.state._combat, foe.state.x, foe.state.y, now);
          foe.state.slowPct = Math.max(Number(foe.state.slowPct) || 0, slowPct);
          foe.state.slowUntil = Math.max(Number(foe.state.slowUntil) || 0, now + slowSec * 1000);
        }
        if (freezeSec > 0) {
          takeMovement(foe.state, foe.state._combat, foe.state.x, foe.state.y, now);
          foe.state.moveBuck = 0;
          foe.state.freezeUntil = Math.max(Number(foe.state.freezeUntil) || 0, now + freezeSec * 1000);
        }
        // Incinération (burst final vérifié) : éjection radiale de la victime
        // (1200 base / 1600 Plus), comme les NPC en local. Mouvement forcé
        // serveur : teleportSeq + stateCorrection comme usePhaseOut, sinon
        // l'anticheat de déplacement de la victime la renverrait en arrière.
        try {
          if (msg.abilityFinal === true && (execAbility === "ability_solaris_inc"
            || execAbility === "ability_solaris-plus_incinerate-plus")
            && Number(foe.state.hp) > 0) {
            const push = execAbility === "ability_solaris-plus_incinerate-plus" ? 1600 : 1200;
            const fdx = Number(foe.state.x) - Number(me.state.x);
            const fdy = Number(foe.state.y) - Number(me.state.y);
            const flen = Math.hypot(fdx, fdy) || 1;
            const world = serverMaps.get(mapId)?.world;
            if (world && Number(world.w) > 160 && Number(world.h) > 160) {
              const nx = Math.max(80, Math.min(Number(world.w) - 80, Number(foe.state.x) + (fdx / flen) * push));
              const ny = Math.max(80, Math.min(Number(world.h) - 80, Number(foe.state.y) + (fdy / flen) * push));
              Object.assign(foe.state, { x: nx, y: ny, vx: 0, vy: 0, moving: false,
                motionBlocked: false, teleportSeq: (Number(foe.state.teleportSeq) || 0) + 1,
                moveBuck: 0, moveBuckT: now });
              try {
                if (foe.ws && foe.ws.readyState === 1) {
                  foe.ws.send(JSON.stringify({ t: "stateCorrection", map: mapId, x: nx, y: ny }));
                }
              } catch {}
            }
          }
        } catch {}
        // Feed degats : la victime voit les chiffres (comme les NPC).
        if (applied > 0) {
          recordAbilityDamageDealt(me.state, applied, now);
          try { audOf(me.state).dmg += applied; } catch {}
          const fkey = `${foe.state.id}|${id}`;
          let feed = pvpFeeds.get(mapId);
          if (!feed) { feed = new Map(); pvpFeeds.set(mapId, feed); }
          const prev = feed.get(fkey);
          feed.set(fkey, { uid: String(foe.state.id), by: String(id), total: Math.round((prev?.total || 0) + applied) });
        }
        // Dernier attaquant : affichage de l'anneau de degats (Ship_damage)
        // sur les autres ecrans (victime + observateurs).
        foe.state.pvpFrom = id;
        if (foe.state.hp <= 0 && triggerTempestBackup(foe.state, room, now)) foe.state._tempestBackupKiller = id;
        // Kill PvP : la cible passe sous 0 PV sur ce coup (etait en vie).
        try {
          if (Number(foe.state.hp) <= 0 && wasAlive !== false) {
            foe.state.pvpDead = true;
            // Mort : les auras du vaincu disparaissent pour tous.
            clearAbilityFx(foe.state);
            awardPlayerKill(room, id, foe.state, now);
          }
        } catch {}
      } catch {}
      return;
    }
    if (msg.t === "heal") {
      // Soin de groupe (aptitude) vers un joueur : le serveur tranche puis
      // les réparations Aegis confirment le gain par skillFx, les autres soins
      // utilisent encore le flux ohAt/ohAmt (comme l'Orcus).
      // Validation : vaisseau, aura active (HoT/pod en cours, pas de soin
      // volant), rayon (pod = point posé serveur, HoT = lanceur), montant
      // plafonné, cadence 800 ms par couple, bouclier cohérent.
      try {
        if (!authed || !accountId || state.instance === true) return;
        const room = rooms.get(mapId);
        if (!room || !room.has(id)) return;
        const ab = String(msg.ability || "").toLowerCase();
        const spec = healSpecFor(ab);
        if (!spec) return;
        const profile = refreshCombatProfile(state, accountId, mapId);
        if (!ownsAbility(profile, ab)) return;
        const now = Date.now();
        if (state.pvpDead === true || !(Number(state.hp) > 0)) return;
        // Les soins ont leur propre registre : le droit d'exécution des
        // aptitudes de dégâts ne peut pas valider un pod ou une réparation.
        if (!(Number(state._abilityFx?.[ab]?.until) + EXEC_AURA_GRACE_MS > now)) return;
        const me = room.get(id);
        const foe = room.get(String(msg.target));
        if (!foe || !me || foe === me) return;
        const st = foe.state;
        if (!st || st.pvpDead === true || !(Number(st.hp) > 0)) return;
        if (!spec.shield && tempestBackupActive(st, now)) return;
        const repairFx = state._abilityFx?.[ab];
        if (isLinkedRepair(ab) && (String(repairFx?.target || "") !== String(st.id)
          || !(now >= Number(repairFx.from) + HEAL_MIN_INTERVAL_MS)
          || Number(repairFx.linkHealTicks || 0) >= spec.ticks)) return;
        if (spec.mode === "pod") {
          const group = socialGroupOf(id);
          if (!group || socialGroupOf(String(st.id)) !== group) return;
        }
        if (Boolean(msg.sh) !== spec.shield) return;
        // Rayon : pods autour du point posé (état serveur), HoTs autour
        // du lanceur vers le joueur capture au lancement.
        let ox = Number(state.x), oy = Number(state.y);
        if (spec.mode === "pod") {
          const fx = state._abilityFx && typeof state._abilityFx === "object" ? state._abilityFx[ab] : null;
          if (!fx || !Number.isFinite(Number(fx.x)) || !Number.isFinite(Number(fx.y))) return;
          ox = Number(fx.x); oy = Number(fx.y);
        }
        const dx = Number(st.x) - ox, dy = Number(st.y) - oy;
        if (dx * dx + dy * dy > Number(spec.radius) * Number(spec.radius)) return;
        const amt = Math.max(0, Math.min(Number(spec.cap), Math.round(Number(msg.amt) || 0)));
        if (!(amt > 0)) return;
        const hk = `${ab}|${foe.state.id}|${spec.shield ? "sh" : "hp"}`;
        const hm = state._healAt && typeof state._healAt === "object" ? state._healAt : (state._healAt = {});
        if (now - Number(hm[hk] || 0) < HEAL_MIN_INTERVAL_MS) return;
        hm[hk] = now;
        if (Object.keys(hm).length > 64) { try { state._healAt = { [hk]: now }; } catch {} }
        if (isLinkedRepair(ab)) repairFx.linkHealTicks = Number(repairFx.linkHealTicks || 0) + 1;
        const before = Number(spec.shield ? st.sh : st.hp) || 0;
        if (spec.shield) {
          if (!(Number(st.shMax) > 0) && !isLinkedRepair(ab)) return;
          st.sh = Math.max(0, Math.min(Number(st.shMax) || 0, Number(st.sh || 0) + amt));
        } else {
          st.hp = Math.max(0, Math.min(Number(st.hpMax) || 1, Number(st.hp || 0) + amt));
        }
        {
          const gain = Math.max(0, Math.round(Number(spec.shield ? st.sh : st.hp) - before));
          emitAbilityEvent(room, { t: "skillFx", skill: ab, phase: "heal",
            by: id, target: String(st.id), amount: gain, shield: spec.shield, at: now, until: now });
        }
      } catch {}
      return;
    }
    if (msg.t === "pvpLoot" || msg.t === "pvpLootTake") {
      // Cargo du vaincu : la victime annonce, les autres affichent ;
      // le ramassage du tueur efface les copies (uid partage).
      try {
        if (!authed || !accountId) return;
        const room = rooms.get(mapId);
        if (!room || !room.has(id)) return;
        if (typeof msg.uid !== "string" || !msg.uid.startsWith("pvploot_")) return;
        if (msg.t === "pvpLootTake") {
          broadcastRoom(room, JSON.stringify({ t: "pvpLootTake", uid: msg.uid.slice(0, 64) }), id);
          return;
        }
        const x = Math.round(Number(msg.x)), y = Math.round(Number(msg.y));
        if (!Number.isFinite(x) || !Number.isFinite(y)) return;
        if (typeof msg.onlyBy !== "string" || !msg.onlyBy) return;
        broadcastRoom(room, JSON.stringify({ t: "pvpLoot", uid: msg.uid.slice(0, 64), x, y, onlyBy: String(msg.onlyBy).slice(0, 64) }), id);
      } catch {}
      return;
    }
    if (msg.t === "pvpPetHit") {
      // Degats PvP sur le PET : pool dedie, meme arbitrage que les vaisseaux.
      // Pas de recompenses, pas d'anti-farm : juste destruction + toast.
      try {
        if (!authed || !accountId) return;
        const room = rooms.get(mapId);
        if (!room || !room.has(id)) return;
        const foe = room.get(String(msg.target));
        const me = room.get(id);
        if (!foe || !me) return;
        if (foe === me || me.state.pvpDead === true || !(me.state.hp > 0)) return;
        const profile = refreshCombatProfile(me.state, accountId, mapId);
        msg = validateCombatHit(profile, msg, me.state);
        if (!msg) {
          acStrike(me.state, "pvpStrike");
          acRecordViolation(me.state, "profile", Date.now(), { reason: "Impact PET hors du profil autorise", unverified: true });
          return;
        }
        if (foe.state.peta !== 1) return;
        const now = Date.now();
        // Le PET beneficie de la zone de non-agression de son proprietaire.
        // Seul le PET protégé bloque (l'attaquant en ZNA peut tirer).
        if (foe.state.serverSafe === true) return;
        const pvpPetDmg = Math.max(0, Number(msg.dmg) || 0);
        const pvpPetCost = pvpPetDmg > 0 ? 1 : 5;
        if (!acBucket(me.state, "PvpN", now, AC_PVP_HIT_CAP, AC_PVP_HIT_REFILL, pvpPetCost)
          || !acBucket(me.state, "PvpD", now, AC_PVP_DMG_CAP, AC_PVP_DMG_REFILL, pvpPetDmg)) {
          acRecordViolation(me.state, "combat", now, { reason: "Rafale d'impacts PET depassant le budget" });
          return;
        }
        const dmg = Number(msg.dmg);
        if (!Number.isFinite(dmg) || dmg <= 0 || dmg > 1e7) return;
        if (foe.state.petDead === true) return;
        const wasPetAlive = Number(foe.state.petPoolHp) > 0;
        if (!wasPetAlive) return;
        const reach = (Number(me.state.range) || 800) + 800;
        const dx = Number(foe.state.petx ?? foe.state.x) - Number(me.state.x);
        const dy = Number(foe.state.pety ?? foe.state.y) - Number(me.state.y);
        if (dx * dx + dy * dy > reach * reach) return;
        const pen = Math.max(0, Math.min(1, Number(msg.pen ?? 0)));
        const pool = { hp: Number(foe.state.petPoolHp) || 0, sh: Number(foe.state.petPoolSh) || 0 };
        let applied = 0;
        if (msg.kind === "sab") {
          const drained = Math.min(Math.max(0, pool.sh), dmg);
          pool.sh = Math.max(0, pool.sh - drained);
          applied = drained;
        } else {
          const res = damagePlayerLayers(pool, dmg, 0.8, pen, 0);
          applied = Number(res?.total) || 0;
        }
        foe.state.petPoolHp = Math.max(0, Number(pool.hp) || 0);
        foe.state.petPoolSh = Math.max(0, Number(pool.sh) || 0);
        // Revision strictement croissante : plusieurs impacts d'une meme
        // salve peuvent tomber dans la meme milliseconde. Avec Date.now()
        // seul, le proprietaire pouvait ignorer le dernier impact (celui a 0).
        foe.state.petPvpAt = Math.max(now, Number(foe.state.petPvpAt || 0) + 1);
        foe.state._petHpRegenBudget = 0;
        foe.state._petShRegenBudget = 0;
        foe.state._petRegenAt = now;
        if (applied > 0) {
          try { audOf(me.state).dmg += applied; } catch {}
          const fkey = `${foe.state.id}|pet|${id}`;
          let feed = pvpFeeds.get(mapId);
          if (!feed) { feed = new Map(); pvpFeeds.set(mapId, feed); }
          const prev = feed.get(fkey);
          feed.set(fkey, { uid: `pet:${String(foe.state.id)}`, by: String(id), total: Math.round((prev?.total || 0) + applied) });
        }
        if (Number(foe.state.petPoolHp) <= 0 && wasPetAlive !== false) {
          foe.state.petDead = true;
          try {
            if (String(id).startsWith("u_")) recordPvpPetKill(String(id).slice(2));
          } catch {}
          try {
            const killer = room.get(id);
            if (killer && killer.ws && killer.ws.readyState === 1) {
              killer.ws.send(JSON.stringify({ t: "pvpPetKill", victim: String(foe.state.pseudo || "Pilote").slice(0, 20), pet: String(foe.state.petn || "REX").slice(0, 32) }));
            }
          } catch {}
        }
      } catch {}
      return;
    }
    if (msg.t === "shot" || msg.t === "rshot") {      // Tirs allies : retransmis tels quels a la room (aucun etat).
      if (state.instance === true) return; // gate : tirs 100 % locaux.
      try {
        const room = rooms.get(mapId);
        if (!room || !room.has(id)) return;
        const out = { t: msg.t, by: id, map: mapId };
        if (msg.t === "rshot" && authed) {
          const profile = refreshCombatProfile(state, accountId, mapId);
          const key = String(msg.key || msg.kind || "");
          const cast = state._freeRocketCast;
          const free = cast && cast.key === msg.ability && cast.rocket === key && cast.until > Date.now() && cast.launched < cast.count;
          if (msg.ability && !free) return;
          if (free) cast.launched++;
          if (profile?.rocketIds.includes(key) || free) {
            state._launchedRocketIds ||= {};
            state._launchedRocketIds[key] = Date.now() + 20000;
          }
        }
        if (typeof msg.key === "string") out.key = String(msg.key).slice(0, 16);
        if (typeof msg.kind === "string") out.kind = String(msg.kind).slice(0, 16);
        if (typeof msg.petTarget === "string") out.petTarget = String(msg.petTarget).slice(0, 64);
        if (typeof msg.stationTarget === "string") out.stationTarget = String(msg.stationTarget).slice(0, 32);
        if (msg.petSource === true) out.petSource = true;
        if (msg.petClone === 0 || msg.petClone === 1) {
          if (state.peta !== 1 || state.dead || state.pvpDead || state.petDead === true
            || !(state._abilityFx?.ability_zephyr_tbr?.until > Date.now())) return;
          out.petClone = msg.petClone;
        }
        for (const k of ["x", "y", "ang", "tx", "ty", "spd", "arcScale", "arcBoost", "prange"]) {
          if (Number.isFinite(Number(msg[k]))) out[k] = Number(msg[k]);
        }
        if (Number.isFinite(Number(msg.n))) out.n = Math.max(1, Math.min(4, Math.round(Number(msg.n))));
        if (Number.isFinite(Number(msg.arcDir))) out.arcDir = Number(msg.arcDir) < 0 ? -1 : 1;
        if (msg.sab === true) out.sab = true;
        // MISS + volley : retransmis pour l'affichage MISS sur les autres ecrans.
        if (msg.miss === true) out.miss = true;
        // Precision Targeter : cercle rouge sous la roquette, des deux cotes.
        if (msg.prec === true) out.prec = true;
        if (Number.isFinite(Number(msg.v))) out.v = Math.max(0, Math.floor(Number(msg.v)));
        broadcastRoom(room, JSON.stringify(out), id);
      } catch {}
      return;
    }
    if (msg.t === "hello" || msg.t === "map") {
      // Authentification (hello) : token compte -> identite stable.
      // Le pseudo du compte fait foi (anti-usurpation), l'id devient
      // `u_<accountId>` (stable entre refresh). Sans token : invite.
      if (msg.t === "hello" && !authed && typeof msg.token === "string" && msg.token) {
        try {
          const who = verifyWsToken(msg.token);
          if (who && who.id) {
            const stableId = `u_${String(who.id).slice(0, 64)}`;
            const previousState = securityStates.get(stableId) || findPeerState(stableId);
            // Reconnexion et refresh reprennent les effets encore actifs.
            // Conserver leurs echeances serveur : aucun relaunch ni temps ajoute.
            const previousSocket = accountSockets.get(stableId);
            accountSockets.set(stableId, ws);
            if (previousSocket && previousSocket !== ws) { try { previousSocket.close(4001, "Session replaced"); } catch {} }
            // Refresh : rattachement silencieux (pas de leave/join).
            if (cancelPeerGrace(stableId)) dropStaleEntry(stableId);
            const room = rooms.get(mapId);
            if (room) {
              if (room.has(id) && room.get(id)?.ws === ws) room.delete(id);
              const prev = room.get(stableId);
              if (prev && prev.ws !== ws) { try { prev.ws.close(4001, "Session replaced"); } catch {} }
              room.delete(stableId);
              if (previousState) state = previousState;
              state.id = stableId;
              id = stableId;
              room.set(id, { ws, state });
            } else {
              state.id = stableId;
              id = stableId;
            }
            accountId = String(who.id);
            authed = true;
            if (previousState) {
              mapId = String(state.serverMap || mapId);
            } else {
              state._account = getAccountGameplayData(accountId);
              state._accountAt = Date.now();
              const saved = state._account?.hangars.find(h => h?.active) || state._account?.hangars[0];
              mapId = serverMaps.has(String(saved?.lastMap).toLowerCase()) ? String(saved.lastMap).toLowerCase()
                : getFactionHomeMap(state._account?.faction);
            }
            const profile = refreshCombatProfile(state, accountId, mapId);
            if (!profile) { ws.close(1008, "Invalid combat profile"); return; }
            if (!previousState) {
              const saved = state._account.hangars.find(h => h?.active) || state._account.hangars[0];
              const base = baseArrival(serverMaps, mapId, state._account.faction);
              const position = saved.lastPos;
              state.x = Number.isFinite(Number(position?.x)) ? Number(position.x) : base.x;
              state.y = Number.isFinite(Number(position?.y)) ? Number(position.y) : base.y;
              state.hp = state.hpMax * Math.max(0, Math.min(1, Number(saved.lastHpPct ?? 1)));
              state.sh = state.shMax * Math.max(0, Math.min(1, Number(saved.lastShPct ?? 1)));
              state.pvpDead = !(state.hp > 0);
              state._posOk = true;
            }
            state.serverMap = mapId;
            removeFromAllRooms(id);
            if (state.instance === true) instancePeers.set(id, { ws, state, mapId });
            else roomFor(mapId).set(id, { ws, state });
            securityStates.set(id, state);
            audOf(state);
            state.pseudo = String(who.pseudo || "Pilote").slice(0, 20);
            refreshClanTag(state, accountId);
            try { ws.send(JSON.stringify({ t: "welcome", id, authed: true, run: serverRunId, at: Date.now(), clockBlocked: state._clockGuard?.blocked === true })); } catch {}
          }
        } catch {}
      }
      // Banni : rejet avec motif + date, sans rejoindre (ni room ni gate).
      try {
        const claimed = (!authed && typeof msg.pseudo === "string" && String(msg.pseudo).trim())
          ? String(msg.pseudo).slice(0, 20)
          : String(state.pseudo || "Pilote").slice(0, 20);
        const ban = getActiveBan(id, claimed);
        if (ban) {
          try {
            if (ws.readyState === 1) {
              // Gel anticheat en attente de modération : message dédié
              // (pas de date, pas de "banni" définitif).
              if (ban.cheatHold === true) {
                ws.send(JSON.stringify({ t: "cheatHold", reason: CHEAT_KICK_MESSAGE }));
              } else {
                ws.send(JSON.stringify({
                  t: "banned",
                  reason: String(ban.reason || "Comportement inapproprié.").slice(0, 200),
                  until: ban.until != null ? Number(ban.until) : null,
                }));
              }
            }
          } catch {}          removeFromAllRooms(id);
          const bannedWs = ws;
          setTimeout(() => { try { bannedWs.close(); } catch {} }, 800);
          return;
        }
      } catch {}
      if (state._clockGuard?.blocked) { stopRejectedMotion(state); correctState(); return; }
      const nextMap = String(msg.map || mapId || "1-1").toLowerCase();
      // Star jump (Carte Stellaire) : arrivée validée côté serveur, sans portail.
      // Le client attend {t:"starJump"} avec les coordonnées d'arrivée AVANT
      // de changer de map ; son {t:"map"} suivant est alors un no-op.
      if (msg.starJump === true && msg.instance !== true) {
        handleStarJumpRequest(ws, { id, state }, mapId, nextMap, (obj) => {
          mapId = obj.mapId;
        });
        return;
      }
      if (!changeMap(nextMap, msg.instance === true)) { correctState(); return; }
      state._joined = true;
      const socialCtx = () => ({
        id, state, authed,
        send: (obj) => { try { if (ws.readyState === 1) ws.send(JSON.stringify(obj)); } catch {} },
        sendTo: (pid, obj) => sendToPeer(pid, obj),
        findByPseudo: (pseudo) => findPeerByPseudo(pseudo),
        describe: (pid) => describePeer(pid),
      });
      // Instance perso (Galaxy Gates) : hors room (invisible, pas de NPC
      // partagés, pas de PvP) mais socket gardé pour les canaux globaux
      // (tchat, enchères). Gameplay 100 % local comme avant.
      if (msg.instance === true) {
        removeFromAllRooms(id);
        mapId = nextMap;
        state.instance = true;
        state.updatedAt = Date.now();
        instancePeers.set(id, { ws, state, mapId });
        try {
          ws.send(JSON.stringify({ t: "chatHistory", list: chatHistory.slice(-30) }));
        } catch {}
        try {
          ws.send(JSON.stringify(getAuctionSync()));
        } catch {}
        // Groupe + amis : état perso renvoyé (membres voient la map gate).
        try {
          ws.send(JSON.stringify({ t: "groupUpdate", group: socialDescribeGroup(id, socialCtx()) }));
        } catch {}
        if (authed && accountId) {
          sendFriendsSync(ws, accountId);
          try { notifyFriendPresence(accountId, true); } catch {}
        }
        try { socialPeerChanged(id, socialCtx()); } catch {}
        return;
      }
      state.instance = false;
      instancePeers.delete(id);
      if (nextMap !== mapId) {
        removeFromAllRooms(id);
        mapId = nextMap;
        roomFor(mapId).set(id, { ws, state });
        ensureNpcSim(mapId);
      } else {
        ensureNpcSim(mapId);
      }
      // Authentifie : pseudo du compte uniquement (declare ignore).
      if (!authed && typeof msg.pseudo === "string" && msg.pseudo.trim()) state.pseudo = String(msg.pseudo).slice(0, 20);
      if (!authed && typeof msg.shipId === "string" && msg.shipId) state.shipId = String(msg.shipId).slice(0, 64);
      state.updatedAt = Date.now();
      // Etat des box pour le nouveau venu.
      sendBoxSync(ws, mapId);
      // Historique du chat global pour le nouveau venu.
      try {
        ws.send(JSON.stringify({ t: "chatHistory", list: chatHistory.slice(-30) }));
      } catch {}
      // Enchères partagées : état complet du cycle pour le nouveau venu.
      try {
        ws.send(JSON.stringify(getAuctionSync()));
      } catch {}
      // Groupe : resync après (re)connexion ou changement de map.
      try {
        ws.send(JSON.stringify({ t: "groupUpdate", group: socialDescribeGroup(id, socialCtx()) }));
      } catch {}
      // Raid Low : état courant pour le nouvel arrivant (vague en cours, etc.).
      if (nextMap === "low") {
        try { ws.send(JSON.stringify(getLowRaidState())); } catch {}
      }
      if (authed && accountId) {
        sendFriendsSync(ws, accountId);
        try { notifyFriendPresence(accountId, true); } catch {}
      }
      try { socialPeerChanged(id, socialCtx()); } catch {}
      return;
    }
    if (msg.t === "ping") {
      // Heartbeat client (3 s) : preuve de vie, reprise après coupure.
      // lastHeardAt maintient la liaison ; updatedAt reste la date de position.
      // Le pong porte la version serveur : le client recharge tout seul
      // quand le jeu a été mis à jour (git pull + restart).
      try {
        ws.send(JSON.stringify({ t: "pong", t0: Math.max(0, Number(msg.t0) || 0), v: String(GAME_VERSION || ""), at: Date.now() }));
      } catch {}
      if (authed && accountId && Date.now() - Number(state._friendsSyncAt || 0) >= 15_000) {
        state._friendsSyncAt = Date.now();
        sendFriendsSync(ws, accountId);
        try {
          const tag = refreshClanTag(state, accountId);
          if (ws.readyState === 1) ws.send(JSON.stringify({ t: "clanTag", tag: String(tag || "") }));
        } catch {}
      }
      return;
    }
    if (msg.t === "chat") {
      // Chat global : 1 message / 800 ms, 200 caracteres, pseudo du pos.
      // Mute admin : ignore silencieux.
      try {
        if (chatMutes.has(id)) return;
        const now = Date.now();
        if (now - Number(chatLastById.get(id) || 0) < 800) return;
        const text = String(msg.text || "").replace(/\s+/g, " ").trim().slice(0, 200);
        if (!text) return;
        chatLastById.set(id, now);
        const entry = { from: String(state.pseudo || "Pilote").slice(0, 20), text, at: now, by: id };
        chatHistory.push(entry);
        if (chatHistory.length > 40) chatHistory.splice(0, chatHistory.length - 40);
        broadcastAll(JSON.stringify({ t: "chatMsg", ...entry }));
      } catch {}
      return;
    }
    if (msg.t === "auctionBid") {
      // Enchère partagée : compte authentifié uniquement, montant mini,
      // gagnant diffusé à tous (comme les messages du tchat).
      try {
        const res = handleAuctionBid(
          { key: msg.key, amount: msg.amount },
          { id, pseudo: state.pseudo, authed },
        );
        if (res.status === "ok") {
          broadcastAll(JSON.stringify(res.update));
        } else {
          try {
            ws.send(JSON.stringify({
              t: "auctionBidReject",
              key: String(msg.key || "").slice(0, 64),
              amount: Math.max(0, Math.floor(Number(msg.amount) || 0)),
              reason: String(res.reason || "Mise refusée."),
              lot: res.lot || null,
            }));
          } catch {}
        }
      } catch {}
      return;
    }
    // Base de Combat partagée : état filtré par clan, le serveur tranche.
    const stationWho = () => {
      let acct = null;
      try { acct = state?._account || null; } catch {}
      return {
        id,
        pseudo: state?.pseudo,
        authed,
        clan: authed && accountId ? clanTagOfUser(accountId) : "",
        faction: acct?.faction || "",
        x: Number(state?.x) || 0,
        y: Number(state?.y) || 0,
        range: Number(state?.range) || 800,
      };
    };
    const broadcastStation = (map) => {
      try {
        const room = roomFor(map);
        if (!room) return;
        for (const [, peer] of room) {
          try {
            const uid = peer?.state?._account?.id || null;
            const tag = uid ? clanTagOfUser(uid) : "";
            peer.ws.send(JSON.stringify(getStationSync(map, tag)));
          } catch {}
        }
      } catch {}
    };
    if (msg.t === "stationSyncReq") {
      try {
        const map = String(mapId || "").toLowerCase();
        if (!hasStationMap(map)) return;
        const tag = authed && accountId ? clanTagOfUser(accountId) : "";
        ws.send(JSON.stringify(getStationSync(map, tag)));
      } catch {}
      return;
    }
    if (msg.t === "stationInstall") {
      try {
        const map = String(mapId || "").toLowerCase();
        if (!hasStationMap(map)) return;
        const res = handleStationInstall(
          { map, slot: msg.slot, resourceId: msg.resourceId },
          stationWho(),
        );
        if (res.status === "ok") {
          try { ws.send(JSON.stringify({ t: "stationInstallOk", map, slot: res.slot, resourceId: res.resourceId })); } catch {}
          broadcastStation(map);
        } else {
          try { ws.send(JSON.stringify({ t: "stationReject", reason: String(res.reason || "Pose refusée.") })); } catch {}
        }
      } catch {}
      return;
    }
    if (msg.t === "stationUninstall") {
      try {
        const map = String(mapId || "").toLowerCase();
        if (!hasStationMap(map)) return;
        const res = handleStationUninstall({ map, slot: msg.slot }, stationWho());
        if (res.status === "ok") {
          try { ws.send(JSON.stringify({ t: "stationUninstallOk", map, slot: res.slot, resourceId: res.resourceId })); } catch {}
          broadcastStation(map);
        } else {
          try { ws.send(JSON.stringify({ t: "stationReject", reason: String(res.reason || "Retrait refusé.") })); } catch {}
        }
      } catch {}
      return;
    }
    if (msg.t === "stationBuild") {
      try {
        const map = String(mapId || "").toLowerCase();
        if (!hasStationMap(map)) return;
        const res = handleStationBuild({ map }, stationWho());
        if (res.status === "ok") {
          broadcastStation(map);
          try {
            const room = roomFor(map);
            if (room) {
              const payload = JSON.stringify({ t: "stationBuildSettle", map, refunds: res.refunds || [] });
              for (const [, peer] of room) {
                try { peer.ws.send(payload); } catch {}
              }
            }
          } catch {}
        } else {
          try { ws.send(JSON.stringify({ t: "stationReject", reason: String(res.reason || "Construction refusée.") })); } catch {}
        }
      } catch {}
      return;
    }
    if (msg.t === "stationHit") {
      try {
        const map = String(mapId || "").toLowerCase();
        if (!hasStationMap(map) || !authed || !accountId) return;
        const res = handleStationHit(
          { map, target: msg.target, dmg: msg.dmg },
          stationWho(),
        );
        if (res.status === "ok") broadcastStation(map);
      } catch {}
      return;
    }
    if (msg.t === "stationReplace") {
      try {
        const map = String(mapId || "").toLowerCase();
        if (!hasStationMap(map)) return;
        const res = handleStationReplace(
          { map, slot: msg.slot, resourceId: msg.resourceId },
          stationWho(),
        );
        if (res.status === "ok") {
          try { ws.send(JSON.stringify({ t: "stationReplaceOk", map, slot: res.slot, resourceId: res.resourceId, replaced: res.replaced })); } catch {}
          broadcastStation(map);
        } else {
          try { ws.send(JSON.stringify({ t: "stationReject", reason: String(res.reason || "Remplacement refusé.") })); } catch {}
        }
      } catch {}
      return;
    }
    if (msg.t === "stationCancelReplace") {
      try {
        const map = String(mapId || "").toLowerCase();
        if (!hasStationMap(map)) return;
        const res = handleStationCancelReplace(
          { map, slot: msg.slot },
          stationWho(),
        );
        if (res.status === "ok") {
          try { ws.send(JSON.stringify({ t: "stationReplaceCancelOk", map, slot: res.slot, resourceId: res.resourceId })); } catch {}
          broadcastStation(map);
        } else {
          try { ws.send(JSON.stringify({ t: "stationReject", reason: String(res.reason || "Annulation refusée.") })); } catch {}
        }
      } catch {}
      return;
    }
    if (msg.t === "stationRepair") {
      try {
        const map = String(mapId || "").toLowerCase();
        if (!hasStationMap(map)) return;
        const res = handleStationRepair({ map }, stationWho());
        if (res.status === "ok") {
          broadcastStation(map);
        } else {
          try { ws.send(JSON.stringify({ t: "stationReject", reason: String(res.reason || "Réparation refusée.") })); } catch {}
        }
      } catch {}
      return;
    }
    if (msg.t === "stationDeflectToggle") {
      try {
        const map = String(mapId || "").toLowerCase();
        if (!hasStationMap(map)) return;
        const res = handleStationDeflectToggle({ map }, stationWho());
        if (res.status === "ok") {
          broadcastStation(map);
        } else {
          try { ws.send(JSON.stringify({ t: "stationReject", reason: String(res.reason || "Déflecteur inchangé.") })); } catch {}
        }
      } catch {}
      return;
    }
    if (msg.t === 'hangarArrival') {
      handleHangarArrivalRequest(ws, { id, state }, authed ? accountId : null, mapId,
        String(msg.hangarId || '').slice(0, 64), next => { mapId = next; });
      return;
    }
    if (msg.t === "pos") {
      // Instance perso : aucune présence partagée (le client ne devrait
      // déjà plus envoyer de pos en gate).
      if (state.instance === true) return;
      if (!authed || !accountId) return;
      const requestedMap = String(msg.map || mapId).toLowerCase();
      if (requestedMap !== mapId) {
        if (!changeMap(requestedMap)) { correctState(); return; }
        removeFromAllRooms(id);
        mapId = requestedMap;
        // Changement de map : les auras posées ne traversent pas.
        // Techs (buffs perso) : conservées si encore valides.
        preserveTechAurasAcrossMapChange(state);
        roomFor(mapId).set(id, { ws, state });
        ensureNpcSim(mapId);
        sendBoxSync(ws, mapId);
      }
      syncSwapFx(state, msg, Date.now());
      const profile = refreshCombatProfile(state, accountId, mapId, msg);
      if (!profile) return;
      syncMovementAbility(state, profile, Date.now(), (k) => movementTarget(k));
      // Vitesse de l'equipement + aptitude autorisee, selon le temps serveur.
      // Les timestamps et vmax du client n'accordent aucun droit de mouvement.
      const declaredVmax = movementSpeed(state, profile, Date.now());
      const nextVx = Number(msg.vx), nextVy = Number(msg.vy);
      if (Number.isFinite(nextVx) && Number.isFinite(nextVy)) {
        const speed = Math.hypot(nextVx, nextVy);
        const scale = speed > declaredVmax ? declaredVmax / speed : 1;
        state.vx = nextVx * scale;
        state.vy = nextVy * scale;
      }
      let movementAccepted = false;
      const nx = Number(msg.x), ny = Number(msg.y);
      if (Number.isFinite(nx) && Number.isFinite(ny)) {
        const nowMove = Date.now();
        const revival = msg.dead !== true && (state.pvpDead === true || !(state.hp > 0))
          && ((state._arrival?.revive === true && validArrival(state._arrival, nx, ny, nowMove))
            || reviveArrival(serverMaps, state, mapId, state._account.faction, nx, ny));
        const legitJump = validArrival(state._arrival, nx, ny, nowMove) || !!revival;
        if (legitJump) {
          movementAccepted = true;
          state.teleportSeq = (state.teleportSeq || 0) + 1;
          state.x = nx;
          state.y = ny;
          state._posOk = true;
          state._rejPos = null;
          state._arrival = null;
          state.moveBuck = 0;
          state.moveBuckT = Date.now();
          if (revival) {
            state.hp = Math.max(1, Math.floor(state.hpMax * 0.1));
            state.sh = Math.floor(state.shMax * 0.1);
            state.dead = false;
            state.pvpDead = false;
            state.healBudHp = 0;
            state.healBudSh = 0;
            state.healBudT = nowMove;
            state.dmgBlockUntil = nowMove + 500;
            state.ishUntil = nowMove + 3000;
            state.portalCdUntil = nowMove + 5000;
          }
        } else {
          // Décision de déplacement : voir SCRIPTS/ANTICHEAT.js (testable).
          const mv = takeMovement(state, profile, nx, ny, nowMove,
            movementTarget(dashTargetKey(state, profile, nowMove)));
          state.x = mv.x;
          state.y = mv.y;
          movementAccepted = mv.accepted;
        }
      }
      if (!movementAccepted) { stopRejectedMotion(state); correctState(); }
      else state.motionBlocked = false;
      if (Number.isFinite(Number(msg.angle))) state.angle = Number(msg.angle);
      // B02 actifs (bonus de groupe) : ids validés, diffusés au groupe.
      if (!authed && typeof msg.pseudo === "string" && msg.pseudo.trim()) state.pseudo = String(msg.pseudo).slice(0, 20);
      state.dead = state.pvpDead === true || !(state.hp > 0);
      // CPU CL04K-XL : vaisseau masqué aux autres (point minimap conservé).
      // CPU natif : son coût en crédits sera validé lors de la migration
      // économique, comme les coûts IEM/ISH/SMB existants.
      // Carte à camouflage interdit : toute activation est ignorée.
      const cloakDeniedMap = NO_CLOAK_MAPS.has(String(mapId || "").toLowerCase());
      if (typeof msg.cloakCpu === "boolean") state.cloakCpu = cloakDeniedMap ? false : msg.cloakCpu;
      // Camouflage d'aptitude : masque aussi le point sur la mini-carte.
      // Le CPU reste distinct ; les NPC reçoivent l'union des deux états.
      if (typeof msg.cloaked === "boolean") {
        const nowCloak = Date.now();
        if (cloakDeniedMap) state._cloakUntil = 0;
        else if (msg.cloaked && !state.cloaked && profile.cloakSkill && nowCloak >= Number(state._jamUntil || 0) && nowCloak >= Number(state._cloakCdUntil || 0)) {
          state._cloakUntil = nowCloak + (Number(profile.cloakSkill.durationSec) || 30) * 1000;
          state._cloakCdUntil = nowCloak + profileAbilityCooldown(Number(profile.cloakSkill.cooldownSec) || 240, profile) * 1000;
        }
        state.cloaked = msg.cloaked && nowCloak >= Number(state._jamUntil || 0) && nowCloak < Number(state._cloakUntil || 0);
      }
      if (typeof msg.safe === "boolean") state.safe = msg.safe;
      if (Number.isFinite(Number(msg.hpPct))) state.hpPct = Math.max(0, Math.min(1, Number(msg.hpPct)));
      if (Number.isFinite(Number(msg.shPct))) state.shPct = Math.max(0, Math.min(1, Number(msg.shPct)));
      if (typeof msg.collectUid === "string") state.collectUid = String(msg.collectUid).slice(0, 64);
      if (typeof msg.collectPet === "boolean") state.collectPet = msg.collectPet;
      if (typeof msg.bg === "boolean") state.bg = msg.bg;
      if (typeof msg.bot === "boolean") state.bot = msg.bot;
      if (typeof msg.atk === "boolean") state.atk = msg.atk;
      if (msg.combat === "npc" || msg.combat === "player" || msg.combat === "") state.combat = msg.combat;
      if (typeof msg.targetName === "string") state.targetName = String(msg.targetName).slice(0, 64);
      if (typeof msg.lockedTarget === "string") {
        state.lockedTarget = msg.lockedTarget.slice(0, 64);
        const room = rooms.get(mapId);
        for (const skill of Object.keys(state._abilityFx || {})) {
          if (isLinkedRepair(skill) && state._abilityFx[skill]?.target
            && state._abilityFx[skill].target !== state.lockedTarget) {
            breakRepairLink(state, skill, room, id, Date.now());
          }
        }
      }
      if (Number.isFinite(Number(msg.targetHpPct))) state.targetHpPct = Math.max(0, Math.min(1, Number(msg.targetHpPct)));
      if (Number.isFinite(Number(msg.targetShPct))) state.targetShPct = Math.max(0, Math.min(1, Number(msg.targetShPct)));
      if (Number.isFinite(Number(msg.targetHpMax))) state.targetHpMax = Math.max(0, Math.min(1e12, Math.round(Number(msg.targetHpMax))));
      if (Number.isFinite(Number(msg.targetShMax))) state.targetShMax = Math.max(0, Math.min(1e12, Math.round(Number(msg.targetShMax))));
      if (Number.isFinite(Number(msg.tx))) state.tx = Math.round(Number(msg.tx));
      if (Number.isFinite(Number(msg.ty))) state.ty = Math.round(Number(msg.ty));
      // Destination de deplacement (prediction cote receveur). Bornee large
      // (monde + marges), jamais de kick (lags = faux positifs).
      if (movementAccepted) {
        if (typeof msg.moving === "boolean") state.moving = msg.moving;
        if (Number.isFinite(Number(msg.mx))) state.mx = Math.max(-100000, Math.min(100000, Math.round(Number(msg.mx))));
        if (Number.isFinite(Number(msg.my))) state.my = Math.max(-100000, Math.min(100000, Math.round(Number(msg.my))));
      }
      if (typeof msg.ammo === "string" && msg.ammo) state.ammo = String(msg.ammo).slice(0, 16);
      if (Number.isFinite(Number(msg.drones))) state.drones = Math.max(0, Math.min(12, Math.round(Number(msg.drones))));
      if (typeof msg.dform === "string" && msg.dform) state.dform = String(msg.dform).slice(0, 32);
      if (Number.isFinite(Number(msg.fint))) state.fint = Math.max(0.05, Math.min(6, Number(msg.fint)));
      if (Number.isFinite(Number(msg.bspd))) state.bspd = Math.max(500, Math.min(20000, Number(msg.bspd)));
      if (typeof msg.dslots === "string" && msg.dslots) state.dslots = String(msg.dslots).slice(0, 256);
      if (Number.isFinite(Number(msg.gg))) state.gg = Math.max(0, Math.min(127, Math.floor(Number(msg.gg))));
      if (typeof msg.alt === "boolean") state.alt = msg.alt;
      if (Number.isFinite(Number(msg.shots))) state.shots = Math.max(0, Math.floor(Number(msg.shots)));
      if (typeof msg.rank === "string" && msg.rank) state.rank = String(msg.rank).slice(0, 64);
      if (typeof msg.firm === "string" && msg.firm) state.firm = String(msg.firm).slice(0, 16);
      // Titre affichable : id validé côté affichage, jamais de HTML (slice + whitelist UI).
      if (typeof msg.title === "string") state.title = String(msg.title).slice(0, 32);
      if (typeof msg.showTitle === "boolean") state.showTitle = msg.showTitle === true;
      // Texte/couleur transmis (cadeaux admin) : texte brut, couleur hexadécimale.
      if (typeof msg.titleT === "string") state.titleT = String(msg.titleT);
      if (typeof msg.titleC === "string") state.titleC = /^#[0-9a-fA-F]{6}$/.test(msg.titleC.trim()) ? msg.titleC.trim().toLowerCase() : "";
      if (typeof msg.dind === "string" && msg.dind) state.dind = String(msg.dind).slice(0, 256);
      if (typeof msg.ficon === "string" && msg.ficon) state.ficon = String(msg.ficon).slice(0, 128);
      if (typeof msg.mind === "string" && msg.mind) state.mind = String(msg.mind).slice(0, 128);
      if (Number.isFinite(Number(msg.rseq))) state.rseq = Math.max(0, Math.floor(Number(msg.rseq)));
      if (typeof msg.rkind === "string" && msg.rkind) state.rkind = String(msg.rkind).slice(0, 16);
      if (Number.isFinite(Number(msg.rspd))) state.rspd = Math.max(500, Math.min(20000, Math.round(Number(msg.rspd))));
      // PvP : PV serveur autoritaires.
      // - Les BAISSES via pos sont adoptees aussitot (cliquet bas : les
      //   degats NPC locaux repercutent, sinon dieu du PvP).
      // - Les MONTEES (robot reparateur, reparations, regen bouclier) sont
      //   aussi suivies (plafonnees au max) : sans ca, le pool serveur
      //   restait bas apres un soin local et le prochain coup NPC
      //   reimposait l'ancien pool au client (vie "qui revient en arriere
      //   apres reparation"). Montees suspectes (>50 % du max hors revive)
      //   loggees, sans kick (serveur prive : pas de faux positif).
      {
        const hm = profile.hpMax;
        syncDisruptorEffects(rooms.get(mapId), npcSims.get(mapId), Date.now());
        const sm = state.shMax;
        // Télémétrie : pools absurdes (= hpMax forgé, dieu du PvP).
        if ((hm > 50e6 || sm > 50e6) && acStrike(state, "poolStrike", 10)) {
          try { console.log(`[multi:anticheat] pool suspect ${state.pseudo} (hpMax ${hm}, shMax ${sm})`); } catch {}
        }
        const cHp = Math.max(0, Math.min(hm, hm * Math.max(0, Math.min(1, Number(msg.hpPct ?? 1)))));
        const cSh = Math.max(0, Math.min(sm, sm * Math.max(0, Math.min(1, Number(msg.shPct ?? 1)))));
        // Budget de remontée (horloge serveur) : les réparations légitimes
        // sont graduelles, la vie figée pleine (Cheat Engine) est étouffée.
        const nowH = Date.now();
        const hDt = Math.max(0, Math.min(5, (nowH - Number(state.healBudT || 0)) / 1000));
        state.healBudT = nowH;
        state.healBudHp = Math.min(hm * HEAL_BUDGET_CAP, Number(state.healBudHp || 0) + hm * HEAL_BUDGET_RATE * hDt);
        state.healBudSh = Math.min(sm * HEAL_BUDGET_CAP, Number(state.healBudSh || 0) + sm * HEAL_BUDGET_RATE * hDt);
        const healTake = (cur, want, max, key) => acHealTake(state, cur, want, max, key);
        if (state.dead === true || state.pvpDead === true) {
          state.hp = 0;
          state.sh = 0;
        } else {
          // Blackout : un coup vient d'être appliqué (dmgBlockUntil) — les
          // remontées sont ignorées le temps que la victime l'adopte
          // (snapshot 20 Hz). Sinon un soin effacerait le coup avant son
          // adoption : chiffres affichés côté tireur, barre immobile.
          // Les baisses restent acceptées. Cohérent avec le jeu (pas de
          // soin efficace sous le feu direct).
          const blocked = Date.now() < Number(state.dmgBlockUntil || 0);
          const backupActive = tempestBackupActive(state, nowH);
          const abilityHealCurrent = Number(msg.abilityHealSeq || 0) === Number(state._abilityHealSeq || 0);
          if (!backupActive && abilityHealCurrent && cHp < state.hp) state.hp = cHp;
          else if (!backupActive && cHp > state.hp && !blocked) {
            if (cHp - state.hp > hm * 0.5) {
              state.healWarn = Number(state.healWarn || 0) + 1;
              if (state.healWarn % 10 === 1) {
                try { console.log(`[multi:anticheat] soin suspect ${state.pseudo} (+${Math.round(cHp - state.hp)} HP en un pos, max ${hm})`); } catch {}
              }
            }
            // Plafonné au budget (voir ci-dessus).
            state.hp = healTake(state.hp, cHp, hm, "healBudHp");
          }
          // Pendant un changement rapide de formation, le client peut déjà
          // exprimer shPct avec son nouveau maximum alors que le profil compte
          // du serveur utilise encore l'ancien. Ne jamais convertir ce ratio
          // avec le mauvais maximum (Cœur -> Foreuse -> Cœur donnait ~4 000).
          const formationStateCurrent = typeof msg.dform !== "string"
            || String(msg.dform) === String(profile.formationId || "standard");
          const shieldStateCurrent = formationStateCurrent
            && Number(msg.disarraySeq || 0) === Number(state._disarraySeq || 0)
            && Number(msg.shieldBuffSeq || 0) === Number(state._shieldBuffSeq || 0);
          if (shieldStateCurrent && abilityHealCurrent && cSh < state.sh) state.sh = cSh;
          else if (shieldStateCurrent && cSh > state.sh && !blocked) {
            if (sm > 0 && cSh - state.sh > sm * 0.5) {
              state.healWarn = Number(state.healWarn || 0) + 1;
              if (state.healWarn % 10 === 1) {
                try { console.log(`[multi:anticheat] soin suspect ${state.pseudo} (+${Math.round(cSh - state.sh)} SH en un pos, max ${sm})`); } catch {}
              }
            }
            state.sh = healTake(state.sh, cSh, sm, "healBudSh");
          }
        }
      }
      if (state.hp <= 1 && Date.now() < Number(state._tempestBackupRequestedUntil || 0)) {
        triggerTempestBackup(state, rooms.get(mapId), Date.now(), true);
      }
      if (!(state.hp > 0) && !triggerPaladin(state, Date.now(), event => emitAbilityEvent(rooms.get(mapId), event)) && !triggerTempestBackup(state, rooms.get(mapId), Date.now())) { state.pvpDead = true; state.dead = true; }
      if (msg.peta === 1 || msg.peta === 0) state.peta = profile.petOwned && msg.peta === 1 ? 1 : 0;
      if (Number.isFinite(Number(msg.petl))) state.petl = Math.max(1, Math.min(32, Math.round(Number(msg.petl))));
      if (Number.isFinite(Number(msg.petx)) && Number.isFinite(Number(msg.pety))) {
        // Laisse PET : le pet colle son vaisseau. Sans ça, petx/pety forgés
        // sur chaque box = ramassage de toute la map (boxes validées dessus).
        const ppx = Math.round(Number(msg.petx)), ppy = Math.round(Number(msg.pety));
        const ldx = ppx - Number(state.x), ldy = ppy - Number(state.y);
        if (ldx * ldx + ldy * ldy <= PET_LEASH * PET_LEASH) {
          state.petx = ppx;
          state.pety = ppy;
        }
      }
      if (Number.isFinite(Number(msg.petd))) state.petd = Math.round(Number(msg.petd) * 100) / 100;
      // Triple barrage : deux positions visuelles, uniquement pendant le cast validé.
      const tbrActive = state.peta === 1 && !state.dead && !state.pvpDead
        && state._abilityFx?.ability_zephyr_tbr?.until > Date.now();
      const holoFx = state._abilityFx?.ability_mimesis_hologram;
      state.holoClones = holoFx?.clonesStarted && holoFx.until > Date.now() && Array.isArray(msg.holoClones)
        ? msg.holoClones.slice(0, 4).filter(c => Array.isArray(c) && c.length === 4 && typeof c[0] === "string"
          && c.slice(1).every(Number.isFinite) && Math.hypot(c[1] - state.x, c[2] - state.y) <= 3000)
          .map(c => [c[0].slice(0, 48), c[1], c[2], c[3]]) : [];
      state.tbrClones = tbrActive && Array.isArray(msg.tbrClones)
        ? msg.tbrClones.slice(0, 2).filter(c => Array.isArray(c) && c.length === 3
          && c.every(n => Number.isFinite(Number(n)))
          && Math.hypot(Number(c[0]) - Number(state.x), Number(c[1]) - Number(state.y)) <= PET_LEASH)
          .map(c => [Math.round(Number(c[0])), Math.round(Number(c[1])), Math.round(Number(c[2]) * 100) / 100]) : [];
      if (typeof msg.petn === "string") state.petn = String(msg.petn).slice(0, 32);
      if (typeof msg.petf === "string") state.petf = String(msg.petf).slice(0, 16);
      // PV du PET (lock info allie) : 0..1 declare, jamais de montee serveur.
      if (Number.isFinite(Number(msg.petHp))) state.petHp = Math.max(0, Math.min(1, Number(msg.petHp)));
      if (Number.isFinite(Number(msg.petSh))) state.petSh = Math.max(0, Math.min(1, Number(msg.petSh)));
      // Pool PV du PET (degats PvP) : meme regles que le pool joueur.
      if (profile.petOwned) {
        const phm = profile.petHpMax;
        const psm = profile.petShMax;
        const cPHp = Math.max(0, Math.min(phm, phm * Math.max(0, Math.min(1, Number(msg.petHp ?? 1)))));
        const cPSh = Math.max(0, Math.min(psm, psm * Math.max(0, Math.min(1, Number(msg.petSh ?? 1)))));
        if (!state._petInit) {
          state.petHpM = phm;
          state.petShM = psm;
          state.petPoolHp = Math.min(phm, Number(state._account.pet.hp) || 0);
          state.petPoolSh = Math.min(psm, Math.max(0, Number(state._account.pet.sh ?? psm) || 0));
          state._petInit = true;
          state.petDead = !(state.petPoolHp > 0);
        } else if (!(cPHp > 0)) {
          state.petPoolHp = 0;
          state.petPoolSh = 0;
        } else if (!(state.petPoolHp > 0)) {
          // Réparation enregistrée dans le compte (10 %), jamais un ratio
          // arbitraire dans pos. L'économie sera migrée séparément.
          if (state._account.revision !== state._petDeathRevision && state._account.pet.active === false
            && Number(state._account.pet.hp) > 0) {
            state.petPoolHp = Math.min(phm * 0.1, Number(state._account.pet.hp));
            state.petPoolSh = 0;
            state.petDead = false;
          }
        } else {
          if (cPHp < state.petPoolHp) state.petPoolHp = cPHp;
          if (cPSh < state.petPoolSh) state.petPoolSh = cPSh;
          // Regeneration legitime du REX : G-REP repare jusqu'a 5 %/s et le
          // bouclier recharge a 5 %/s. Les valeurs arrivent par paliers de
          // 1 s, donc on utilise un petit budget accumule plutot qu'un cliquet
          // strictement descendant qui figeait les barres multijoueur.
          const syncNow = Date.now();
          const syncDt = Math.max(0, Math.min(2, (syncNow - Number(state._petRegenAt || syncNow)) / 1000));
          state._petRegenAt = syncNow;
          state._petHpRegenBudget = Math.min(phm * 0.055, Math.max(0, Number(state._petHpRegenBudget) || 0) + phm * 0.055 * syncDt);
          state._petShRegenBudget = Math.min(psm * 0.055, Math.max(0, Number(state._petShRegenBudget) || 0) + psm * 0.055 * syncDt);
          if (cPHp > state.petPoolHp && state._petHpRegenBudget > 0) {
            const gain = Math.min(cPHp - state.petPoolHp, state._petHpRegenBudget);
            state.petPoolHp += gain;
            state._petHpRegenBudget -= gain;
          }
          if (cPSh > state.petPoolSh && state._petShRegenBudget > 0
            && syncNow - Number(state.petPvpAt || 0) >= 5000) {
            const gain = Math.min(cPSh - state.petPoolSh, state._petShRegenBudget);
            state.petPoolSh += gain;
            state._petShRegenBudget -= gain;
          }
        }
        state.petHpM = phm; state.petShM = psm;
        state.petPoolHp = Math.min(phm, state.petPoolHp);
        state.petPoolSh = Math.min(psm, state.petPoolSh);
        if (!(state.petPoolHp > 0)) {
          state.petDead = true;
          state._petDeathRevision ??= state._account.revision;
        } else state._petDeathRevision = null;
      }
      state.updatedAt = Date.now();
    }
  });

  // Groupes : départ propre + amis : présence hors ligne.
  const onPeerGone = () => {
    try {
      socialPeerGone(id, {
        id, state, authed,
        send: () => {},
        sendTo: (pid, obj) => sendToPeer(pid, obj),
        findByPseudo: (pseudo) => findPeerByPseudo(pseudo),
        describe: (pid) => describePeer(pid),
      });
    } catch {}
    try { if (authed && accountId) notifyFriendPresence(accountId, false); } catch {}
  };
  ws.on("close", (code, reason) => {
    allWs.delete(ws);
    if (code !== 1000 && code !== 1001) {
      console.log(`[multi:connection] ${id} closed ${code}: ${String(reason).slice(0, 120)}`);
    }
    if (authed && accountSockets.get(id) !== ws) return;
    accountSockets.delete(id);
    chatLastById.delete(id); friendPingLast.delete(id); clanChatLast.delete(id);
    clanChatLast.delete(`${id}:notify`); clanChatLast.delete(`${id}:diplo`);
    if (String(id).startsWith("u_")) schedulePeerGrace(id, { state, authed, accountId });
    else { onPeerGone(); removeFromAllRooms(id); }
  });
  ws.on("error", () => { try { ws.close(); } catch {} });
});

// Enchères partagées : clôture à chaque heure pile de Paris (:00),
// gagnants diffusés puis nouveau cycle pour tous.
setInterval(() => {
  try {
    const rolled = pollAuctionCycle();
    if (!rolled) return;
    broadcastAll(JSON.stringify(rolled.settle));
    broadcastAll(JSON.stringify(rolled.sync));
    console.log(`[multi:auction] cycle ${rolled.settle.cycle} clôturé (${rolled.settle.results.filter((r) => r.amount > 0).length} lots vendus).`);
  } catch (err) {
    console.warn("[multi:auction]", err?.message || err);
  }
}, 5000);

// Enchères partagées : heartbeat 60 s (garde-fou : les clients en
// instance perso restent synchronisés même sans mises dans l'heure).
setInterval(() => {
  try {
    broadcastAll(JSON.stringify(getAuctionSync()));
  } catch {}
}, 60000);

// Respawn des box gere meme si aucun joueur n'est present sur la carte.
setInterval(() => {
  const now = Date.now();
  for (const [mapId, queue] of boxRespawns) {
    const set = boxRooms.get(mapId);
    if (!set) continue;
    const sim = npcSims.get(mapId);
    for (let i = queue.length - 1; i >= 0; i--) {
      const pending = queue[i];
      if (!pending || Number(pending.at) > now) continue;
      queue.splice(i, 1);
      if (set.has(pending.uid)) continue;
      const cfg = COLLECTABLE_TYPES[pending.type] || {};
      // Event terminé entre-temps (ex : Pumpkin hors Halloween) : pas de respawn.
      if (cfg.event === "halloween" && !isHalloweenEventActive()) continue;
      const pos = randomBoxPosition(sim && typeof sim.then !== "function" ? sim : null);
      const box = { type: pending.type, ...pos };
      set.set(pending.uid, box);
      const room = rooms.get(mapId);
      if (room?.size) broadcastRoom(room, JSON.stringify({ t: "box", op: "spawn", box: { uid: pending.uid, ...box } }));
    }
    if (!queue.length) boxRespawns.delete(mapId);
  }
}, 250);

// Event Halloween : apparition / disparition des Pumpkin Box en direct
// (toutes les 5 s), sans restart — les rooms ne sont construites qu'une fois.
setInterval(() => {
  try {
    const active = isHalloweenEventActive();
    for (const [mapId, set] of boxRooms) {
      if (!(set instanceof Map)) continue;
      const has = [...set.values()].some((b) => b && b.type === "Pumpkin_Box");
      const room = rooms.get(mapId);
      if (active && !has) {
        const cfg = COLLECTABLE_TYPES.Pumpkin_Box;
        if (!cfg || !collectableAllowedOnMap(cfg, mapId)) continue;
        const sim = npcSims.get(mapId);
        const qty = Math.max(0, Math.floor(Number(cfg.qty) || 0));
        for (let index = 0; index < qty; index++) {
          const uid = `Pumpkin_Box#${index}`;
          if (set.has(uid)) continue;
          const pos = randomBoxPosition(sim && typeof sim.then !== "function" ? sim : null);
          const box = { type: "Pumpkin_Box", ...pos };
          set.set(uid, box);
          if (room?.size) broadcastRoom(room, JSON.stringify({ t: "box", op: "spawn", box: { uid, ...box } }));
        }
      } else if (!active && has) {
        const gone = [];
        for (const [uid, b] of set) {
          if (b && b.type === "Pumpkin_Box") { set.delete(uid); gone.push(uid); }
        }
        const queue = boxRespawns.get(mapId);
        if (Array.isArray(queue)) {
          for (let i = queue.length - 1; i >= 0; i--) {
            if (queue[i]?.type === "Pumpkin_Box") queue.splice(i, 1);
          }
        }
        if (gone.length && room?.size) broadcastRoom(room, JSON.stringify({ t: "box", op: "unspawn", uids: gone }));
      }
    }
  } catch {}
}, 5000);

// Bonus bases du clan (temps réel, toutes maps) : cache 1 s, partagé par
// tous les snapshots — quelques octets par message.
let clanBaseCache = { at: 0, list: [] };
function getCachedClanBaseBonuses(now) {
  try {
    if (now - clanBaseCache.at > 1000 || !Array.isArray(clanBaseCache.list)) {
      clanBaseCache = { at: now, list: getClanBaseBonuses() || [] };
    }
    return clanBaseCache.list;
  } catch { return []; }
}
// Proprios des bases construites (toutes maps) : même cache 1 s.
let stationOwnCache = { at: 0, list: [] };
function getCachedStationOwners(now) {
  try {
    if (now - stationOwnCache.at > 1000 || !Array.isArray(stationOwnCache.list)) {
      stationOwnCache = { at: now, list: getStationOwners() || [] };
    }
    return stationOwnCache.list;
  } catch { return []; }
}

// Broadcast + simu NPC 20 Hz par room, uniquement aux sockets ouvertes.
// Les NPC inactifs a plus de 2 000 unites voyagent a 1 Hz, repartis sur les ticks ;
// leur simulation reste à 20 Hz et les NPC actifs/proches restent toujours
// dans chaque snapshot. Les joueurs lointains restent, eux, à 10 Hz.
// Défense de la Base de Combat : chaque module laser/roquette tire seul sur
// les joueurs hostiles (rouges) non camouflés à sa portée. Appelée à 20 Hz
// (les cadences 1 s / 3 s sont gérées par module). Hostilité mise en cache
// 30 s (clan + diplo changent rarement ; évite les lectures DB par tick).
const stationFoeCache = new Map();
// Dernier passage réparation passive par map (throttle ~1 Hz).
const stationPassiveLast = new Map();
function stationFoeCached(ownerClan, ownerFirm, vClan, vFirm) {
  const k = `${ownerClan}|${ownerFirm}|${vClan}|${vFirm}`;
  const e = stationFoeCache.get(k);
  const now = Date.now();
  if (e && now - e.at < 30000) return e.foe;
  let foe = false;
  try { foe = isStationFoe(ownerClan, ownerFirm, vClan, vFirm); } catch {}
  stationFoeCache.set(k, { foe, at: now });
  if (stationFoeCache.size > 200) stationFoeCache.clear();
  return foe;
}
function tickStationDefense(map, room, now) {
  try {
    if (!hasStationMap(map) || !room || !room.size) return;
    const def = getStationDefense(map);
    if (!def || !def.modules.length) return;
    const sim = npcSims.get(map);
    // Compteurs remis à zéro par victime et par tick (comme les NPC) :
    // sinon la victime verrait un total cumulé qui grossit sans fin.
    const hitVictims = new Set();
    for (const mod of def.modules) {
      if (!stationShotReady(map, mod.slot, now)) continue;
      // Ennemi le plus proche à portée : hostile OU bleu qui a tapé
      // (riposte 30 s), en vie, visible, non protégé.
      let best = null, bestPid = "", bestD2 = mod.range * mod.range;
      for (const [pid, pentry] of room) {
        const s = pentry?.state;
        if (!s || s._posOk !== true) continue;
        if (s.pvpDead === true || !(Number(s.hp) > 0)) continue;
        if (s.cloaked === true || s.cloakCpu === true) continue;
        if (s.safe === true || s.serverSafe === true) continue;
        if (Number(s._graceUntil || 0) > now) continue;
        const acct = s._account || null;
        // Clan : état pair (rafraîchi à l'auth), repli DB avec id brut.
        let vClan = String(s?.clanTag || "").toUpperCase().slice(0, 5);
        if (!vClan) {
          try {
            const raw = String(pid || "").replace(/^u_/i, "");
            vClan = raw ? clanTagOfUser(raw) : "";
          } catch {}
        }
        const vFirm = String(acct?.faction || "").toLowerCase();
        let foe = false;
        try { foe = stationFoeCached(def.clan, def.firm, vClan, vFirm); } catch {}
        if (!foe) {
          // Riposte : le module tire sur le bleu qui a tapé (id pair `u_x`).
          try { foe = isStationRetaliation(map, pid, now) || isStationRetaliation(map, String(acct?.id || ""), now); } catch {}
          if (!foe) continue;
        }
        const dx = Number(s.x) - mod.x, dy = Number(s.y) - mod.y;
        const d2 = dx * dx + dy * dy;
        if (!(d2 <= bestD2)) continue;
        bestD2 = d2;
        best = s;
        bestPid = String(pid);
      }
      if (!best) continue;
      stationShotFired(map, mod.slot, mod.periodMs, now);
      const by = `station:${mod.slot}`;
      const dmg = Math.max(1, Math.round(Number(mod.dmg) * (0.95 + Math.random() * 0.1)));
      const hitNow = Date.now();
      if (best.pvpDead === true || !(Number(best.hp) > 0)) continue;
      if (tempestBackupActive(best, hitNow)) continue;
      if (hitNow < Number(best.ishUntil || 0) || hitNow < Number(best.iemUntil || 0)) continue;
      const scramble = activeAbility(best, "ability_mimesis_scramble", hitNow);
      if (Math.random() < Math.max(0, Math.min(0.9, (Number(best.evade) || 0) + (scramble ? 0.65 : 0)))) continue;
      const wasAlive = Number(best.hp) > 0;
      if (!hitVictims.has(best)) {
        hitVictims.add(best);
        best.npcDamage = 0;
        best.npcHpDamage = 0;
        best.npcShDamage = 0;
      }
      let applied = 0, appliedHp = 0, appliedSh = 0;
      try {
        const res = applyServerAbilityDamage(room, sim, best, dmg, 0, hitNow, by);
        applied = Math.max(0, Math.round(Number(res?.total) || 0));
        appliedHp = Math.max(0, Math.round(Number(res?.hp) || 0));
        appliedSh = Math.max(0, Math.round(Number(res?.sh) || 0));
      } catch {}
      best.hp = Math.max(0, Number(best.hp) || 0);
      best.sh = Math.max(0, Number(best.sh) || 0);
      best.dmgBlockUntil = hitNow + 500;
      best.npcAt = hitNow;
      best.npcFrom = by;
      best.npcDamage = Math.max(0, (Number(best.npcDamage) || 0) + applied);
      best.npcHpDamage = Math.max(0, (Number(best.npcHpDamage) || 0) + appliedHp);
      best.npcShDamage = Math.max(0, (Number(best.npcShDamage) || 0) + appliedSh);
      best.pvpFrom = by;
      if (applied > 0) {
        try {
          let feed = pvpFeeds.get(map);
          if (!feed) { feed = new Map(); pvpFeeds.set(map, feed); }
          const fkey = `${bestPid}|${by}`;
          const prior = feed.get(fkey);
          feed.set(fkey, { uid: String(bestPid), by, total: Math.round((Number(prior?.total) || 0) + applied) });
        } catch {}
      }
      if (Number(best.hp) <= 0 && wasAlive !== false) {
        if (!triggerTempestBackup(best, room, hitNow)) {
          best.pvpDead = true;
          best.dead = true;
          try { clearAbilityFx(best); } catch {}
        }
      }
      // Visuels pour tous : laser x1 depuis le centre du module, roquette
      // en arc avec fumée rouge (départ vers le haut, voir client).
      try {
        if (mod.kind === "rocket") {
          const ang = Math.atan2(Number(best.y) - mod.y, Number(best.x) - mod.x);
          broadcastRoom(room, JSON.stringify({ t: "rshot", map, by, kind: "r310",
            x: Math.round(mod.x), y: Math.round(mod.y), ang: Math.round(ang * 100) / 100,
            tx: Math.round(Number(best.x)), ty: Math.round(Number(best.y)),
            spd: Math.max(500, 900 + Math.hypot(Number(best.x) - mod.x, Number(best.y) - mod.y) * 1.1),
            arcDir: Math.random() < 0.5 ? -1 : 1, arcScale: 1, arcBoost: 15, prange: mod.range,
            miss: false, station: true, v: (tickStationDefense._v = (Number(tickStationDefense._v) || 0) + 1) }));
        } else {
          broadcastRoom(room, JSON.stringify({ t: "shot", map, by,
            x: Math.round(mod.x), y: Math.round(mod.y),
            tx: Math.round(Number(best.x)), ty: Math.round(Number(best.y)),
            key: "x1", n: 1, station: true }));
        }
      } catch {}
    }
    for (const s of hitVictims) {
      s.npcSeq = Math.max(0, Math.floor(Number(s.npcSeq) || 0)) + 1;
      s.npcDamage = Math.max(0, Math.round(Number(s.npcDamage) || 0));
      s.npcHpDamage = Math.max(0, Math.round(Number(s.npcHpDamage) || 0));
      s.npcShDamage = Math.max(0, Math.round(Number(s.npcShDamage) || 0));
    }
  } catch {}
}
let snapshotTick = 0;
setInterval(() => {
  const now = Date.now();
  snapshotTick++;
  const fullPlayerTick = (snapshotTick & 1) === 0;
  const includePlayerStatic = snapshotTick % PLAYER_STATIC_REFRESH_TICKS === 0;
  // Les instances n'ont pas de snapshot partage, mais gardent le meme rythme
  // de simulation. Aucun mouvement ni gain d'economie n'est adopte ici.
  const clockPayload = JSON.stringify({ t: "clock", at: now });
  for (const [, entry] of instancePeers) {
    try {
      if (entry.ws.readyState === 1 && entry.ws.bufferedAmount < SNAPSHOT_BACKPRESSURE_LIMIT) entry.ws.send(clockPayload);
    } catch {}
  }
  for (const [key, room] of rooms) {
    if (!room.size) continue;
    for (const { state } of room.values()) {
      if (expireTempestBackup(state, now)) {
        clearAbilityFx(state);
        awardPlayerKill(room, state._tempestBackupKiller, state, now);
        state._tempestBackupKiller = "";
      }
    }
    tickAbilityStates(room, npcSims.get(key), now, event => emitAbilityEvent(room, event), socialGroupOf);
    syncDisruptorEffects(room, npcSims.get(key), now);
    // Les sockets silencieux sont fermes par le heartbeat. Le handler close
    // retire ensuite la presence via la grace habituelle de reconnexion.
    // Simu NPC : positions des joueurs pour la poursuite, tick, snapshot.
    let npc = { list: [], deaths: [], dmg: [] };
    try {
      const sim = npcSims.get(key);
      if (sim && typeof sim.tick === "function") {
        for (const [pid, entry] of room) {
          const s = entry?.state;
          // Anti-fantôme : jamais positionné (chargement, pas de pos)
          // = ignoré par la simu NPC (ni poursuite ni ciblage).
          // Refresh : le fantôme en grâce n'est ni poursuivi ni ciblé.
          if (s && s._posOk === true && !(Number(s._graceUntil || 0) > now)) {
            const serverSafe = typeof sim.inSafe === "function" ? sim.inSafe(s.x, s.y) : false;
            s.serverSafe = serverSafe && s.safe === true;
            const serverDead = s.pvpDead === true || !(Number(s.hp) > 0);
            sim.setPlayer(pid, s.x, s.y, { dead: serverDead, safe: s.serverSafe, untargetableUntil: Number(s.iemUntil) || 0, cloaked: s.cloaked === true || s.cloakCpu === true, shipId: s.shipId, lockedTarget: s.lockedTarget, shPct: s.shPct });
          }
        }
        if (typeof sim.prunePlayers === "function") {
          try { sim.prunePlayers([...room.keys()]); } catch {}
        }
        sim.tick(0.05);
        // Les tirs NPC partages retirent les PV dans le meme pool autoritaire
        // que le PvP. Les soins du client (reparateur, regen) remontent ce
        // pool via les pos ; les degats serveur restent prioritaires.
        if (typeof sim.drainPlayerHits === "function") {
          const npcHitVictims = new Set();
          for (const hit of sim.drainPlayerHits()) {
            const victim = room.get(String(hit?.playerId));
            let s = victim?.state;
            if (!s || s.pvpDead === true || !(Number(s.hp) > 0)) continue;
            if (tempestBackupActive(s, now)) continue;
            if (Date.now() < Number(s.ishUntil || 0) || Date.now() < Number(s.iemUntil || 0)) continue;
            if (s.serverSafe === true) {
              // Riposte ZNA : seul le NPC visé peut blesser un joueur
              // protégé (parité solo). Tous les autres impacts sont ignorés.
              let safeHitOk = false;
              try { safeHitOk = typeof sim.allowsSafeHit === "function" && sim.allowsSafeHit(hit?.npcUid, String(hit?.playerId)) === true; } catch {}
              if (!safeHitOk) continue;
            }
            const scramble = activeAbility(s, "ability_mimesis_scramble", now);
            if (Math.random() < Math.max(0, Math.min(0.9, (Number(s.evade) || 0) + (scramble ? 0.65 : 0)))) continue;
            const hitNow = Date.now();
            const damage = Math.max(0, Math.min(1e8, Number(hit?.damage) || 0));
            if (!(damage > 0)) continue;
            const redirected = redirectedPlayer(room, s, hitNow);
            if (redirected) {
              s = redirected.state;
              if (hitNow < Number(s.ishUntil || 0) || hitNow < Number(s.iemUntil || 0) || tempestBackupActive(s, hitNow)) continue;
            } else {
              const fx = s._abilityFx?.ability_disruptor_redirect;
              const target = fx && fx.until > hitNow ? sim.entries?.get(String(fx.target)) : null;
              if (target?.hp > 0) {
                sim.applyHit(s.id, { uid: String(fx.target), dmg: damage, pen: 0, critChance: 0, critMult: 1 });
                continue;
              }
            }
            const result = applyServerAbilityDamage(room, sim, s, damage, 0, hitNow, String(hit.npcUid));
            s.hp = Math.max(0, Number(s.hp) || 0);
            s.sh = Math.max(0, Number(s.sh) || 0);
            if (!npcHitVictims.has(s)) {
              npcHitVictims.add(s);
              s.npcDamage = 0;
              s.npcHpDamage = 0;
              s.npcShDamage = 0;
            }
            s.npcAt = hitNow;
            // Blackout remontées (comme en PvP) : le coup doit survivre
            // aux soins qui arrivent avant son adoption par la victime.
            s.dmgBlockUntil = hitNow + 500;
            s.npcFrom = String(hit?.npcUid || "").slice(0, 64);
            s.npcDamage += Math.max(0, Number(result?.total) || 0);
            s.npcHpDamage += Math.max(0, Number(result?.hp) || 0);
            s.npcShDamage += Math.max(0, Number(result?.sh) || 0);
            if (s.hp <= 0 && !triggerTempestBackup(s, room, hitNow)) { s.pvpDead = true; s.dead = true; }
          }
          for (const s of npcHitVictims) {
            s.npcSeq = Math.max(0, Math.floor(Number(s.npcSeq) || 0)) + 1;
            s.npcDamage = Math.max(0, Math.round(Number(s.npcDamage) || 0));
            s.npcHpDamage = Math.max(0, Math.round(Number(s.npcHpDamage) || 0));
            s.npcShDamage = Math.max(0, Math.round(Number(s.npcShDamage) || 0));
          }
        }
        npc = sim.snapshot();
        // Halos Mindfire : camouflages dissipés (message ciblé, le client
        // casse son camouflage à réception).
        if (typeof sim.drainDecloaks === "function") {
          try {
            for (const d of sim.drainDecloaks()) {
              if (!d || !String(d.playerId || "").startsWith("u_")) continue;
              sendToPeer(String(d.playerId), { t: "mindfireDecloak", uid: String(d.npcUid || "") });
            }
          } catch {}
        }
        // Déduplication du journal ; l'attribution normale a déjà eu lieu
        // dans onDeath, au moment exact de la mort.
        awardNpcDeaths(key, npc.deaths);
        // IEM des bots JPC : delock + anti-relock 3 s sur la victime
        // (miroir solo de npcIemBlast).
        if (typeof sim.drainIemBursts === "function") {
          try {
            for (const b of sim.drainIemBursts()) {
              if (!b || !String(b.playerId || "").startsWith("u_")) continue;
              const vst = room.get(String(b.playerId))?.state;
              if (!vst || vst.pvpDead === true || !(Number(vst.hp) > 0)) continue;
              const until = Date.now() + 3000;
              try { sim.breakPlayerLocks?.(String(b.playerId), until); } catch {}
              try {
                sendToPeer(String(b.playerId), { t: "iemHit", by: String(b.npcUid || ""),
                  x: Math.round(Number(b.x) || 0), y: Math.round(Number(b.y) || 0), until });
              } catch {}
            }
          } catch {}
        }
        // Visuels roquettes JPC (arcs + fumée) : joués en rshot comme les
        // roquettes des joueurs (même rendu client).
        if (typeof sim.drainRocketFx === "function") {
          try {
            for (const r of sim.drainRocketFx()) {
              if (!r) continue;
              try {
                broadcastRoom(room, JSON.stringify({ t: "rshot", map: key, kind: String(r.kind || "r310").slice(0, 16),
                  by: String(r.by || ""), x: r.x, y: r.y, ang: r.ang, tx: r.tx, ty: r.ty, spd: r.spd,
                  arcDir: r.arcDir, arcScale: r.arcScale, arcBoost: r.arcBoost, prange: r.prange,
                  miss: r.miss === true, v: r.v }));
              } catch {}
            }
          } catch {}
        }
        // Visuels de tir des fights JPC (JPC<->NPC) : le serveur n'a pas de
        // projectiles, on rejoue des streaks via le canal des tirs alliés.
        if (typeof sim.drainShotFx === "function") {
          try {
            for (const s of sim.drainShotFx()) {
              if (!s) continue;
              try {
                broadcastRoom(room, JSON.stringify({ t: "shot", map: key, by: String(s.by || ""),
                  x: Math.round(Number(s.x) || 0), y: Math.round(Number(s.y) || 0),
                  tx: Math.round(Number(s.tx) || 0), ty: Math.round(Number(s.ty) || 0),
                  key: String(s.key || "x4").slice(0, 16), n: Math.max(1, Math.min(2, Number(s.n) || 1)),
                  npcShot: s.npc === true, tuid: s.tuid != null ? String(s.tuid) : null,
                  miss: s.miss === true,
                  jpcPart: s.jpcPart === true ? true : undefined,
                  npcType: s.npc === true ? String(s.npcType || "") : undefined }));
              } catch {}
            }
          } catch {}
        }
      } else if (sim === undefined) {
        ensureNpcSim(key);
      } else if (sim === null) {
        // Simu en échec (ex : import de map) : réessaye toutes les 10 s
        // au lieu de laisser la map vide définitivement.
        try { retryNpcSim(key, now); } catch {}
      }
    } catch {}
    // Défense de la Base de Combat (chaque tick : les cadences 1 s / 3 s
    // des modules sont gérées par module via leurs cooldowns).
    try { tickStationDefense(key, room, now); } catch {}
    // Réparation passive du module REP (+5000 PV/s sur le cœur et les
    // modules en vie) : ~1 Hz, diffusion seulement si du soin a eu lieu.
    try {
      if (hasStationMap(key)) {
        const nowMs = Date.now();
        if (nowMs - (stationPassiveLast.get(key) || 0) >= 1000) {
          stationPassiveLast.set(key, nowMs);
          if (applyStationPassiveHeal(key, nowMs) && room && room.size) {
            for (const [, peer] of room) {
              try {
                const uid = peer?.state?._account?.id != null ? String(peer.state._account.id) : "";
                const tag = uid ? clanTagOfUser(uid) : "";
                peer.ws.send(JSON.stringify(getStationSync(key, tag)));
              } catch {}
            }
          }
        }
      }
    } catch {}
    // Raid Low : contrôleur de vagues en groupe (ralliement -> 5 s ->
    // vagues enchaînées -> Century Falcon -> récompense fixe).
    if (key === "low") {
      try {
        const lowSim = npcSims.get(key);
        if (lowSim && typeof lowSim.setRaidWave === "function") {
          tickLowRaid(room, lowSim, {
            describe: (pid) => describePeer(pid),
            sendTo: (pid, obj) => sendToPeer(pid, obj),
            broadcast: (obj) => broadcastRoom(room, JSON.stringify(obj)),
          });
        }
      } catch {}
    }
    // Feed degats PvP du tick, fusionne avec le feed NPC (plafond commun).
    try {
      const pf = pvpFeeds.get(key);
      if (pf && pf.size) {
        const base = Array.isArray(npc.dmg) ? npc.dmg : [];
        for (const f of pf.values()) {
          if (base.length >= 24) break;
          if (f && f.total > 0) base.push({ uid: f.uid, by: f.by, total: f.total });
        }
        npc.dmg = base;
        pf.clear();
      }
    } catch {}
    const players = [];
    // Ids des pairs vivants : purge les auras ciblant un joueur mort/parti
    // (canal local auto-coupé à la mort de la cible, ex : venom, hecate).
    const livePeerIds = new Set();
    try {
      for (const [pid, pentry] of room) {
        const ps = pentry?.state;
        if (ps && ps._posOk === true && ps.pvpDead !== true && Number(ps.hp) > 0) livePeerIds.add(String(pid));
      }
    } catch {}
    const pruneFxForSnapshot = (fxMap) => {
      const list = pruneAbilityFxMap(fxMap, now);
      if (!list.length) return list;
      return list.filter((entry) => {
        const tgt = entry && entry[4] ? String(entry[4]) : "";
        // Une cible d'aptitude peut aussi être un NPC partagé (uid).
        return !tgt || livePeerIds.has(tgt)
          || Number(npcSims.get(key)?.entries?.get(tgt)?.hp) > 0;
      });
    };
    for (const [, entry] of room) {
      const s = entry?.state;
      if (!s) continue;
      // Anti-fantôme : pas de pos envoyée = invisible pour les autres.
      if (s._posOk !== true) continue;
      // Un dash arrivé ou un canal interrompu perd aussi son aura visuelle.
      for (const skill of Object.keys(s._abilityFx || {})) {
        if (isLinkedRepair(skill) && s._abilityFx[skill]?.target) {
          const linked = room.get(s._abilityFx[skill].target)?.state;
          const dx = Number(linked?.x) - Number(s.x), dy = Number(linked?.y) - Number(s.y);
          const radius = healSpecFor(skill).radius;
          if (!linked || linked.dead || linked.pvpDead || !(Number(linked.hp) > 0)
            || linked.cloaked || linked.cloakCpu || !(dx * dx + dy * dy <= radius * radius)) {
            breakRepairLink(s, skill, room, s.id, now);
          }
        }
        if (isMovementAbilityKey(skill) && !(Number(s._moveEffects?.[skill]?.until) > now)) {
          delete s._abilityFx[skill];
        }
      }
      players.push({ id: s.id, pseudo: s.pseudo, clan: String(s.clanTag || "").slice(0, 5), shipId: s.shipId, hswap: Math.max(0, Math.min(3, Number(s.hswap) || 0)), x: Math.round(s.x), y: Math.round(s.y), vx: Math.round((Number(s.vx) || 0) * 100) / 100, vy: Math.round((Number(s.vy) || 0) * 100) / 100, moving: s.moving === true, motionBlocked: s.motionBlocked === true, teleportSeq: Number(s.teleportSeq) || 0, mx: Math.round(Number(s.mx) || 0), my: Math.round(Number(s.my) || 0), cloakCpu: s.cloakCpu === true, cloaked: s.cloaked === true, vmax: Math.max(50, Math.min(7500, Math.round(Number(s.vmax) || 400))), angle: Number(s.angle) || 0, dead: s.dead === true, hpPct: s.hpPct ?? 1, shPct: s.shPct ?? 1, collectUid: String(s.collectUid || "").slice(0, 64), collectPet: s.collectPet === true, bg: s.bg === true, atk: s.atk === true, tx: Math.round(Number(s.tx) || 0), ty: Math.round(Number(s.ty) || 0), ammo: String(s.ammo || "x1").slice(0, 16), drones: Number(s.drones) || 0, dform: String(s.dform || "standard").slice(0, 32), fint: Number(s.fint) || 0.25, bspd: Math.round(Number(s.bspd) || 4000), dslots: String(s.dslots || ""), gg: Math.max(0, Math.min(127, Math.floor(Number(s.gg) || 0))), alt: s.alt === true, shots: Math.max(0, Math.floor(Number(s.shots) || 0)), rank: String(s.rank || ""), firm: String(s.firm || ""), title: String(s.title || "").slice(0, 32), showTitle: s.showTitle === true, titleT: String(s.titleT || ""), titleC: String(s.titleC || "").slice(0, 32), dind: String(s.dind || ""), ficon: String(s.ficon || ""), mind: String(s.mind || ""), rseq: Math.max(0, Math.floor(Number(s.rseq) || 0)), rkind: String(s.rkind || "r310").slice(0, 16), rspd: Math.round(Number(s.rspd) || 1500),
        // PvP : PV autoritaires + date du dernier coup recu + attaquant (anneau Ship_damage).
        pvpAt: Number(s.pvpAt) || 0, pvpFrom: s.pvpFrom != null ? String(s.pvpFrom) : null, pvpHp: Math.max(0, Math.round(Number(s.hp) || 0)), pvpSh: Math.max(0, Math.round(Number(s.sh) || 0)),
        npcAt: Number(s.npcAt) || 0, npcSeq: Math.max(0, Math.floor(Number(s.npcSeq) || 0)), npcFrom: s.npcFrom != null ? String(s.npcFrom) : null,
        npcDamage: Math.max(0, Math.round(Number(s.npcDamage) || 0)), npcHpDamage: Math.max(0, Math.round(Number(s.npcHpDamage) || 0)), npcShDamage: Math.max(0, Math.round(Number(s.npcShDamage) || 0)),
        slowPct: now < Number(s.slowUntil || 0) ? Number(s.slowPct) || 0 : 0,
        slowT: Math.max(0, (Number(s.slowUntil) || 0) - now) / 1000,
        freezeT: Math.max(0, (Number(s.freezeUntil) || 0) - now) / 1000,
        redirectSilenceT: Math.max(0, (Number(s._redirectSilenceUntil) || 0) - now) / 1000,
        disarrayT: Math.max(0, (Number(s._disarrayUntil) || 0) - now) / 1000,
        disarraySeq: Number(s._disarraySeq) || 0,
        vbReady: tempestBackupReady(s, now),
        vbAt: Number(s._tempestBackupAt) || 0,
        vbT: Math.max(0, Number(s._tempestBackupUntil) - now) / 1000 || 0,
        vbCd: Math.max(0, Number(s._tempestBackupCdUntil) - now
          - Math.max(0, Number(s._tempestBackupUntil) - now)) / 1000 || 0,
        voltLink: s._voltLinkFx?.until > now ? s._voltLinkFx : null,
        hpMax: Math.max(1, Math.round(Number(s.hpMax) || 1)), shMax: Math.max(0, Math.round(Number(s.shMax) || 0)),
        range: Math.max(200, Math.min(5000, Number(s.range) || 800)),
        peta: s.peta === 1 ? 1 : 0, petl: Math.max(1, Math.min(32, Math.round(Number(s.petl) || 1))),
        petx: Math.round(Number(s.petx) || 0), pety: Math.round(Number(s.pety) || 0),
        petd: Math.round(Number(s.petd || 0) * 100) / 100,
        tbrClones: s.peta === 1 && !s.dead && !s.pvpDead && s.petDead !== true
          && s._abilityFx?.ability_zephyr_tbr?.until > now ? s.tbrClones || [] : [],
        tbrT: s.peta === 1 && !s.dead && !s.pvpDead && s.petDead !== true
          ? Math.max(0, (Number(s._abilityFx?.ability_zephyr_tbr?.until) || 0) - now) / 1000 : 0,
        petn: String(s.petn || "").slice(0, 32), petf: String(s.petf || "").slice(0, 16),
        petHp: Number.isFinite(Number(s.petHp)) ? Math.max(0, Math.min(1, Number(s.petHp))) : 1,
        petSh: Number.isFinite(Number(s.petSh)) ? Math.max(0, Math.min(1, Number(s.petSh))) : 1,
        // Pool PV du PET (adoption cote proprietaire).
        pvpPetHp: Math.max(0, Math.round(Number(s.petPoolHp ?? 1) || 0)),
        pvpPetSh: Math.max(0, Math.round(Number(s.petPoolSh ?? 0) || 0)),
        petPvpAt: Number(s.petPvpAt) || 0,
        petHpM: Math.max(1, Math.round(Number(s.petHpM) || 1)),
        petShM: Math.max(0, Math.round(Number(s.petShM) || 0)),
        safe: s.safe === true,
        combat: s.combat === "player" ? "player" : (s.combat === "npc" ? "npc" : ""),
        iemT: Math.max(0, (Number(s.iemUntil) || 0) - now) / 1000,
        ishT: Math.max(0, (Number(s.ishUntil) || 0) - now) / 1000,
        // Brouillage subi (JAMX/Creed/Neutralizing) : locks coupés + verrou.
        jamT: Math.max(0, (Number(s._jamUntil) || 0) - now) / 1000,
        jamxT: Math.max(0, (Number(s._jamxUntil) || 0) - now) / 1000,
        jamAt: Number(s._jamAt) || 0,
        // Conversion Orcus subie (+X verts victime, voir adoption pvpAt).
        ohAt: Number(s.orcusHealAt) || 0,
        ohAmt: Math.max(0, Math.round(Number(s.orcusHealAmt) || 0)),
        // Auras d'aptitudes visibles (Phase 2) : [[code, secLeft, x, y, target]].
        // Cibles joueurs mortes parties déjà purgées (canaux auto-coupés).
        shieldBuffSeq: Number(s._shieldBuffSeq) || 0,
        sprT: Math.max(0, (Number(s._sprUntil) - now) / 1000 || 0),
        sprCastT: Math.max(0, (Number(s._abilityFx?.ability_keres_spr?.until) - now) / 1000 || 0),
        sprCd: Math.max(0, (Number(s._abilityCds?.ability_keres_spr) - now) / 1000 || 0),
        forcedLock: s._drawFireUntil > now ? String(s._drawFireBy || "") : "",
        forcedLockT: Math.max(0, (Number(s._drawFireUntil) - now) / 1000 || 0),
        abilityHealSeq: Number(s._abilityHealSeq) || 0,
        stockCharges: Number(s._stockCharges) || 0,
        lastStandReady: ownsAbility(s._combat, "ability_paladin_last-stand") && now >= Number(s._lastStandCdUntil || 0) && now >= Number(s._jamUntil || 0),
        lastStandCd: Math.max(0, (Number(s._lastStandCdUntil) - now) / 1000 || 0),
        lastStandAt: Number(s._lastStandAt) || 0,
        lastStandT: Math.max(0, (Number(s._lastStandAt) + 1667 - now) / 1000 || 0),
        holoClones: s._abilityFx?.ability_mimesis_hologram?.until > now ? s.holoClones || [] : [],
        afx: pruneFxForSnapshot(s._abilityFx) });
      const output = players[players.length - 1];
      output.hswap = swapFxRemaining(s, now);
      output.hswapDur = Number(s._swapFxDuration) || 3;
      output.hswapId = Number(s._swapFxId) || 0;
      output.hswapPaused = s._swapFxPaused === true;
      output.gaFx = s._abilityFx?.ability_hyperion_ga?.until > now ? s._abilityFx.ability_hyperion_ga : null;
      output.qaFx = s._abilityFx?.ability_hyperion_qa?.until > now ? s._abilityFx.ability_hyperion_qa : null;
      output.dead = s.dead === true || s.pvpDead === true || !(Number(s.hp) > 0);
      output.hpPct = Math.max(0, Math.min(1, Number(s.hp) / Math.max(1, Number(s.hpMax) || 1)));
      output.shPct = s.shMax > 0 ? Math.max(0, Math.min(1, Number(s.sh) / Number(s.shMax))) : 0;
      const staticSignature = [output.pseudo, output.clan, output.shipId, output.drones, output.dform, output.dslots, output.gg,
        output.rank, output.firm, output.title, output.showTitle, output.titleT, output.titleC, output.dind, output.ficon, output.mind, output.petl, output.petn, output.petf].join("|");
      output._staticChanged = staticSignature !== s._lastStaticSignature;
      output._staticSignature = staticSignature;
    }
    let playersForNetwork = players;
    if (!fullPlayerTick && players.length > 1) {
      const nearRadiusSq = PLAYER_NEAR_PLAYER_RADIUS * PLAYER_NEAR_PLAYER_RADIUS;
      playersForNetwork = players.filter((entry, index) => {
        if (entry.dead || entry.atk || entry.combat === "player"
          || Number(entry.slowT) > 0 || Number(entry.freezeT) > 0
          || Number(entry.iemT) > 0 || Number(entry.ishT) > 0
          || entry.voltLink != null
          || (Array.isArray(entry.afx) && entry.afx.length > 0)) return true;
        for (let otherIndex = 0; otherIndex < players.length; otherIndex++) {
          if (otherIndex === index) continue;
          const other = players[otherIndex];
          const dx = Number(entry.x) - Number(other.x), dy = Number(entry.y) - Number(other.y);
          if (dx * dx + dy * dy <= nearRadiusSq) return true;
        }
        return false;
      });
    }
    // Les donnees d'apparence changent rarement. Elles sont rafraichies a
    // faible cadence ; le client conserve entre-temps sa derniere valeur.
    for (const entry of playersForNetwork) {
      if (!includePlayerStatic && entry._staticChanged !== true) {
        delete entry.pseudo;
        delete entry.clan;
        delete entry.shipId;
        delete entry.drones;
        delete entry.dform;
        delete entry.dslots;
        delete entry.gg;
        delete entry.rank;
        delete entry.firm;
        delete entry.title;
        delete entry.showTitle;
        delete entry.titleT;
        delete entry.titleC;
        delete entry.dind;
        delete entry.ficon;
        delete entry.mind;
        delete entry.petl;
        delete entry.petn;
        delete entry.petf;
      } else {
        const sourceState = room.get(String(entry.id))?.state;
        if (sourceState) sourceState._lastStaticSignature = entry._staticSignature;
      }
      delete entry._staticChanged;
      delete entry._staticSignature;
    }
    const npcForNetwork = selectNpcSnapshot(npc, players, snapshotTick, NPC_NEAR_PLAYER_RADIUS);
    const payload = JSON.stringify({ t: "snapshot", map: key, at: now, players: playersForNetwork, npc: npcForNetwork, cbs: getCachedClanBaseBonuses(now), cbsOwn: getCachedStationOwners(now) });
    for (const [, entry] of room) {
      try {
        if (entry.ws.readyState === 1 && entry.ws.bufferedAmount < SNAPSHOT_BACKPRESSURE_LIMIT) entry.ws.send(payload);
      } catch {}
    }
  }
}, 50);

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[multi] HTTP+WS sur http://0.0.0.0:${PORT}/  (WS: /ws)`);
  try {
    const hwActive = isHalloweenEventActive();
    const p2 = (v) => String(v).padStart(2, "0");
    console.log(`[multi:halloween] event ${hwActive ? "ACTIF" : "inactif"} `
      + `(16/10 ${p2(HALLOWEEN_START.hour)}h${p2(HALLOWEEN_START.minute)} -> 01/11 ${p2(HALLOWEEN_END.hour)}h${p2(HALLOWEEN_END.minute)}, ${HALLOWEEN_TIME_ZONE}; maintenant ${new Date().toISOString()}).`);
  } catch {}
  try {
    getAuctionSync();
    const st = auctionRoomStatus();
    console.log(`[multi:auction] cycle ${st.cycle} (${st.lots} lots partagés${st.withBids ? `, ${st.withBids} avec mises` : ""}).`);
  } catch {}
  if (process.env.ORBIT_ADMIN_PASS) console.log("[multi] Panneau admin : /admin.html (pass ORBIT_ADMIN_PASS)");
  else console.log(`[multi] Panneau admin : /admin.html (mot de passe généré${ADMIN_PASS_PERSISTED ? " dans SERVER_DATA/.admin_pass" : ""}, valeur non affichée)`);
});

let shuttingDown = false;
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    if (shuttingDown) return;
    shuttingDown = true;
    // Maintenance ordonnée : demande d'abord aux navigateurs de sauvegarder,
    // puis ferme toutes les sockets avec le code standard "service restart".
    try { broadcastAll(JSON.stringify({ t: "maintenance", reason: "deploy", retryMs: 3000 })); } catch {}
    try { saveNpcRespawns(); } catch {}
    setTimeout(() => {
      try {
        for (const client of wss.clients) {
          try { client.close(1012, "Mise à jour du serveur"); } catch {}
        }
      } catch {}
      try { server.closeAllConnections?.(); } catch {}
      try { wss.close?.(() => {}); } catch {}
      try { server.close(() => process.exit(0)); } catch { process.exit(0); }
    }, 750).unref?.();
    setTimeout(() => process.exit(0), 3000).unref?.();
  });
}
