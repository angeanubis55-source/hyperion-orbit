// Execute les fonctions de production avec une horloge determinee.
// Aucun compte, serveur persistant ou donnee du joueur n'est utilise.
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { ABILITIES, ABILITY_IDS, getAbilityInfo, abilityShipKeyFor, HYPERION_QA_DAMAGE, HYPERION_QA_SALVOS } from "../SHIP/SHIP_ABILITIES.js";
import { SHIP_PACKS } from "../SHIP/SHIP_PACKS.js";
import { isAbilityFxBroadcastable, healSpecFor, fxDebuffsOn, HEAL_MIN_INTERVAL_MS, EXEC_WINDOW_MS } from "../SRC/CORE/ABILITY_FX.js";
import { ABILITY_DAMAGE_RULES, validateAbilityDamage, hostileAbility, unlimitedAbilityRange, abilitySpeedMult } from "../SRC/CORE/ABILITY_COMBAT_RULES.js";
import { abilityDamage, activeAbility, tickAbilityStates, triggerPaladin, recordAbilityDamageDealt, recordAbilityNpcKill } from "./ABILITY_RUNTIME.js";
import { shipOwnsAbility, useMovementAbility, isMovementAbilityKey, usePhaseOut, movementSpeed, takeMovement, stopMovementAbility } from "./MOVEMENT_RULES.js";
import { validateCombatHit } from "./COMBAT_PROFILE.js";
import { syncDisarrayShield, syncDisruptorEffects, laserDisrupted, redirectedPlayer, DDOL_ACCURACY_PENALTY } from "./DISRUPTOR_RULES.js";
import { validateVoltChain, triggerTempestBackup, tempestBackupActive, expireTempestBackup } from "./TEMPEST_RULES.js";
import { ROCKET_TYPES } from "../COMBAT/ROCKET_TYPES.js";
import { profileAbilityCooldown } from "../DRONE/DRONE_DESIGNS.js";
import { ZoneNpcSim } from "./NPC_ROOM.js";

const source = readFileSync(new URL("./MULTI_SERVER.js", import.meta.url), "utf8");
const NOW = 100000;
const profileFor = ship => ({ shipId: SHIP_PACKS.find(p => abilityShipKeyFor(p.id) === ship)?.id || ship,
  baseId: ship, hpMax: 1000000, shMax: 100000, speed: 400, range: 1400,
  hangarId: "test", config: 1, laserDamage: 10000, penetration: 0, maxDamage: 1000000,
  critMult: 1, critChance: 0, petOwned: true, rocketIds: ["ric3", "eco10"] });
const player = (id = "caster", ship = "police", x = 4500) => ({ id, shipId: profileFor(ship).shipId,
  hp: 1000000, hpMax: 1000000, sh: 100000, shMax: 100000, x, y: 3500,
  safe: false, firm: id === "caster" ? "mmo" : "eic", _combat: profileFor(ship),
  range: 1400, absorb: 0.8, _abilityCds: {}, moveBuck: 0, moveBuckT: NOW });
function fixture(ship = "police", npc = false) {
  const caster = player("caster", ship), target = player("target", "phoenixbleu", 4600);
  const events = [], room = new Map([[caster.id, { state: caster }]]);
  const sim = { mapId: "1-1", entries: new Map(), inSafe: () => false, applyHit: () => {} };
  (npc ? sim.entries : room).set(target.id, npc ? target : { state: target });
  const api = vm.createContext({ getAbilityInfo, shipOwnsAbility, isMovementAbilityKey, profileAbilityCooldown,
    stopMovementAbility, movementSpeed, takeMovement, isAbilityFxBroadcastable, healSpecFor,
    hostileAbility, unlimitedAbilityRange, validateVoltChain, ROCKET_TYPES, HYPERION_QA_DAMAGE,
    EXEC_WINDOW_MS, HEAL_MIN_INTERVAL_MS, abilityDamage, activeAbility, triggerTempestBackup,
    socialGroupOf: () => null, pvpFeeds: new Map(),
    broadcastRoom: (room, raw) => events.push(JSON.parse(raw)) });
  vm.runInContext(source.slice(source.indexOf("const ABILITY_CLOAK_SILENT"), source.indexOf("import { loadServerMaps")), api);
  return { caster, target, room, sim, api, events, profile: caster._combat };
}
function cast(f, skill, now = NOW, extra = {}) {
  const message = { target: f.target.id, chain: [f.target.id], rocket: "eco10", chargeSec: 3, ...extra };
  if (isMovementAbilityKey(skill)) assert.equal(useMovementAbility(f.caster, f.profile, skill, true, now, f.target, f.target.id), true, skill);
  return f.api.trackAbilityFx(f.caster, f.profile, skill, message, f.room, f.caster.id, now, f.sim);
}

for (const skill of ABILITY_IDS) {
  test(`catalogue : ${skill} appartient a sa coque et possede son chemin d'activation`, () => {
    const f = fixture(ABILITIES[skill].ship);
    assert.equal(shipOwnsAbility(f.profile.shipId, skill), true);
    assert.equal(shipOwnsAbility("PhoenixBleu", skill), false);
    if (/ultimate-cloak|ultimate-cloaking/.test(skill)) {
      assert.equal(isAbilityFxBroadcastable(skill), false);
      assert.equal(f.api.trackAbilityFx(f.caster, f.profile, skill, {}, f.room, f.caster.id, NOW, f.sim), false);
    } else if (skill === "ability_mimesis_phase-out") {
      const arrival = usePhaseOut(f.caster, f.profile, "1-1", { w: 20000, h: 12000 }, NOW, () => 0.5);
      assert.ok(arrival);
      assert.equal(usePhaseOut(f.caster, f.profile, {}, {}, NOW + 1), null);
    } else if (skill === "ability_paladin_last-stand") {
      f.caster.hp = 0;
      assert.equal(triggerPaladin(f.caster, NOW, event => f.events.push(event)), true);
      assert.equal(f.caster.hp, f.caster.hpMax);
      f.caster.hp = 0;
      assert.equal(triggerPaladin(f.caster, NOW + 1), false);
    } else if (skill === "ability_tempest_volt-backup") {
      f.caster.hp = 0;
      assert.equal(triggerTempestBackup(f.caster, f.room, NOW), true);
      assert.equal(f.caster.hp, 1);
      assert.equal(tempestBackupActive(f.caster, NOW + 9999), true);
      assert.equal(expireTempestBackup(f.caster, NOW + 10000), true);
    } else {
      assert.equal(cast(f, skill), true);
      assert.ok(f.events.some(e => e.skill === skill), "activation partagee");
      if (ABILITIES[skill].target === "enemy" || healSpecFor(skill)?.mode === "hot") {
        const event = f.events.find(e => e.skill === skill && !e.phase);
        assert.equal(event.target, f.target.id, "cible partagee");
      }
      assert.equal(f.api.trackAbilityFx(f.caster, profileFor("phoenixbleu"), skill, {}, f.room, f.caster.id, NOW), false);
      f.caster.hp = 0;
      assert.equal(f.api.trackAbilityFx(f.caster, f.profile, skill, {}, f.room, f.caster.id, NOW), false);
    }
  });
}

test('Hermes : le serveur accepte la prochaine aptitude apres sa recharge reduite', () => {
  const f = fixture('solace');
  f.profile.abilityCooldownMult = 0.9;
  assert.equal(cast(f, 'ability_solace', NOW), true);
  assert.equal(f.caster._abilityCds.ability_solace, NOW + 81000);
  assert.equal(cast(f, 'ability_solace', NOW + 80999), false);
  assert.equal(cast(f, 'ability_solace', NOW + 81000), true);
});

for (const skill of ABILITY_IDS.filter(id => hostileAbility(id, ABILITIES[id]))) {
  for (const npc of [false, true]) test(`ZNA ${npc ? "NPC" : "joueur"} : ${skill}`, () => {
    for (const side of ["caster", "target"]) {
      const f = fixture(ABILITIES[skill].ship, npc);
      f[side].safe = true;
      f.sim.inSafe = (x, y) => x === f[side].x;
      assert.equal(f.api.trackAbilityFx(f.caster, f.profile, skill,
        { target: f.target.id, chain: [f.target.id], chargeSec: 3 }, f.room, f.caster.id, NOW, f.sim), false);
      assert.equal(f.events.length, 0);
    }
  });
}

for (const [skill, rule] of Object.entries(ABILITY_DAMAGE_RULES)) {
  test(`impacts : ${skill}, cadence, cible, montants et fin de cast`, () => {
    const f = fixture(ABILITIES[skill].ship), fx = { from: NOW, until: NOW + rule.duration * 1000, target: rule.radius ? "" : f.target.id, x: f.caster.x, y: f.caster.y };
    f.caster._abilityFx = { [skill]: fx };
    const message = { ability: skill, target: f.target.id, dmg: rule.start + (rule.laserMult || 0) * f.profile.laserDamage };
    assert.equal(validateAbilityDamage(f.profile, { ...message, dmg: message.dmg + 100 }, f.caster, f.target, NOW), null);
    const first = validateAbilityDamage(f.profile, message, f.caster, f.target, NOW);
    assert.ok(first); assert.equal(first.variance, 0); assert.equal(first.critChance, 0);
    assert.equal(validateAbilityDamage(f.profile, message, f.caster, f.target, NOW), null, "pas de double tick");
    assert.equal(validateAbilityDamage(f.profile, message, f.caster, f.target, fx.until + 2001), null);
    if (rule.range === 1000 || rule.radius) {
      f.target.x = f.caster.x + (rule.range || rule.radius) + 1;
      assert.equal(validateAbilityDamage(f.profile, message, f.caster, f.target, NOW + 1000), null);
    }
    if (rule.execute) {
      f.target.hp = rule.execute - 1;
      assert.equal(validateAbilityDamage(f.profile, { ...message, dmg: 1e8 }, f.caster, f.target, NOW + 1000), null);
      assert.ok(validateAbilityDamage(f.profile, { ...message, dmg: 1e8 }, f.caster, f.target, fx.until));
      assert.equal(validateAbilityDamage(f.profile, { ...message, dmg: 1e8 }, f.caster, f.target, fx.until), null);
    }
  });
}

for (const [skill, multiplier] of [["ability_citadel_fortify", .2], ["ability_citadel-plus_fortify", .2],
  ["ability_paladin_ripper", .5], ["ability_citadel-plus_prismatic-endurance", .2],
  ["ability_spectrum", .1], ["ability_spectrum-plus_prismatic-reflecting", .3],
  ["ability_hecate-plus_stockpile", .89]]) {
  test(`defense : ${skill}, active, expiree et interrompue par JAMX`, () => {
    const state = player(), events = [];
    state._abilityFx = { [skill]: { from: NOW, until: NOW + 5000, shieldBonus: .11 } };
    assert.ok(Math.abs(abilityDamage(state, 10000, 0, NOW, { reflect: (...args) => events.push(args) }).total - 10000 * multiplier) < 1e-8);
    assert.equal(abilityDamage(state, 10000, 0, NOW + 5000, {}).total, 10000);
    state._jamUntil = NOW + 10000;
    assert.equal(abilityDamage(state, 10000, 0, NOW + 1, {}).total, 10000);
  });
}

test("QA : 125000 sur 30 salves, sans depassement ni cible changee", () => {
  const f = fixture("hyperion"), key = "ability_hyperion_qa";
  assert.equal(cast(f, key), true);
  const ready = f.caster._qaWindow.readyAt;
  assert.equal(f.api.trackAbilityFx(f.caster, f.profile, key, { phase: "fire", target: f.target.id }, f.room, f.caster.id, ready, f.sim), true);
  let sum = 0;
  for (let i = 0; i < HYPERION_QA_SALVOS; i++) {
    const amount = Math.round((i + 1) * 125000 / 30) - Math.round(i * 125000 / 30);
    const hit = validateCombatHit(f.profile, { ability: key, target: f.target.id, dmg: amount }, f.caster, ready + i * 2500 / 30, f.target);
    assert.ok(hit, `salve ${i + 1}`); sum += hit.dmg;
  }
  assert.equal(sum, 125000);
  assert.equal(validateCombatHit(f.profile, { ability: key, target: f.target.id, dmg: 1 }, f.caster, ready + 2500, f.target), null);
});

test("DDOL : effet PLD exactement cinq secondes, sans doubler le malus", () => {
  const f = fixture("disruptor"); cast(f, "ability_disruptor_ddol");
  syncDisruptorEffects(f.room, f.sim, NOW);
  assert.equal(f.target._ddolUntil, NOW + 5000);
  assert.equal(DDOL_ACCURACY_PENALTY, ROCKET_TYPES.pld8.effect.accuracyPenaltyPct);
  syncDisruptorEffects(f.room, f.sim, NOW + 5000); assert.equal(f.target._ddolUntil, 0);
  assert.equal(laserDisrupted(f.target, { rocket: "r310" }, NOW), false);
});

test("desordre bouclier : moitie retiree une seule fois, degats conserves a la fin", () => {
  const state = player(); state.sh = 100000;
  syncDisarrayShield(state, 100000, NOW + 5000, NOW); assert.equal(state.shMax, 50000); assert.equal(state.sh, 50000);
  state.sh -= 10000;
  syncDisarrayShield(state, 100000, NOW + 5000, NOW + 1); assert.equal(state.sh, 40000);
  syncDisarrayShield(state, 100000, 0, NOW + 5000); assert.equal(state.shMax, 100000); assert.equal(state.sh, 90000);
});

test("Hammerclaw : soins personnels reels et +0, montants sur toute la duree", () => {
  for (const [skill, expected, shield] of [["ability_hammerclaw_hp-repair",175000,false], ["ability_hammerclaw-plus_hp-repair",225000,false],
    ["ability_hammerclaw_shield-repair",120000,true], ["ability_hammerclaw-plus_shield-repair",150000,true]]) {
    const f = fixture(ABILITIES[skill].ship), events = [], field = shield ? "sh" : "hp";
    f.caster[field] = 0; f.caster.hp = shield ? 1000000 : 1; f.caster.shMax = 1000000;
    cast(f, skill);
    for (let i = 1; i <= getAbilityInfo(skill).durationSec; i++) tickAbilityStates(f.room, f.sim, NOW + i * 1000, e => events.push(e), () => null);
    assert.equal(f.caster[field], expected + (shield ? 0 : 1), skill);
    assert.equal(events.filter(e => e.skill === skill).reduce((s,e) => s+e.amount,0),expected);
  }
});

test("protection et SHL : transfert exact, rayon et absence de boucle", () => {
  for (const skill of ["ability_citadel_protection", "ability_citadel-plus_protection", "ability_berserker_shl"]) {
    const f = fixture(), transfers = [];
    f.caster._abilityFx = { [skill]: { from: NOW, until: NOW + 5000, target: f.target.id } };
    const context = { room: f.room, allied: () => true, transfer: (...args) => transfers.push(args) };
    const before = f.target.sh, result = abilityDamage(f.target, 10000, 0, NOW, context);
    assert.equal(transfers.length, 1);
    if (skill.endsWith("shl")) {
      assert.equal(transfers[0][1], 8000); assert.equal(f.target.sh, before); assert.equal(result.total, 2000);
    } else {
      assert.equal(transfers[0][1], 2500); assert.equal(result.total, 7500);
      f.caster.x = f.target.x + 601;
      transfers.length = 0;
      assert.equal(abilityDamage(f.target, 10000, 0, NOW, context).total, 10000);
      assert.equal(transfers.length, 0);
    }
    transfers.length = 0;
    abilityDamage(f.target, 10000, 0, NOW, context, true);
    assert.equal(transfers.length, 0, "un transfert secondaire ne recree pas de lien");
  }
});

test("SHL sur NPC : vrai impact de simulation, bouclier conserve et transfert au Berserker", async () => {
  const f = fixture("berserker"), sim = new ZoneNpcSim("1-1", { w: 20000, h: 12000 }, []);
  const npc = { uid: "npc-test", type: "npc_Streuner", hp: 100000, hpMax: 100000, sh: 50000, shMax: 50000, x: 4600, y: 3500, absorb: .8, seq: 1 };
  sim.entries.set(npc.uid, npc); sim.players.set(f.target.id, f.target);
  Object.assign(f.api, { rooms: new Map([["1-1", f.room]]), npcSims: new Map(), savedNpcRespawns: {},
    ZoneNpcSim: { create: async () => sim } });
  const start = source.indexOf("function ensureNpcSim("), end = source.indexOf("\n}", start) + 2;
  vm.runInContext(source.slice(start, end), f.api);
  await f.api.ensureNpcSim("1-1");
  const now = Date.now();
  f.caster._abilityFx = { ability_berserker_shl: { from: now, until: now + 60000, target: npc.uid } };
  const applied = sim.applyHit(f.target.id, { uid: npc.uid, dmg: 10000, pen: 0, critChance: 0, critMult: 1, variance: 0 });
  assert.equal(npc.sh, 50000); assert.equal(npc.hp, 98000); assert.equal(applied, 2000);
  assert.equal(f.caster.sh, 93600); assert.equal(f.caster.hp, 998400);
});

test("renvois : RVG integral vers l'attaquant, Spectrum Plus 70 %, aucune boucle", () => {
  for (const [skill, reflected, remaining] of [["ability_berserker_rvg",10000,0], ["ability_spectrum-plus_prismatic-reflecting",7000,3000]]) {
    const state = player(), reflects = [];
    state._abilityFx = { [skill]: { from: NOW, until: NOW + 5000 } };
    assert.equal(abilityDamage(state, 10000, 0, NOW, { reflect: (...a) => reflects.push(a) }).total, remaining);
    assert.equal(reflects[0][1], reflected);
    reflects.length = 0;
    abilityDamage(state, 10000, 0, NOW, { reflect: (...a) => reflects.push(a) }, true);
    assert.equal(reflects.length, 0);
  }
});

test("Orcus / Plus : 80 % convertis en PV et 20 % subis, soin reel plafonne", () => {
  for (const skill of ["ability_orcus_assimilate", "ability_orcus-plus_assimilate"]) {
    const state = player(), events = []; state.hp = 900000;
    state._abilityFx = { [skill]: { from: NOW, until: NOW + 5000 } };
    assert.equal(abilityDamage(state, 10000, 0, NOW, { emit: e => events.push(e) }).total, 2000);
    assert.equal(events[0].skill, skill, "le soin conserve la variante active");
    assert.equal(events[0].amount, 8000); assert.equal(state.hp, 907600);
    state.hp = state.hpMax;
    abilityDamage(state, 10000, 0, NOW, { emit: e => events.push(e) });
    assert.equal(events.at(-1).amount, 0);
  }
});

test("Orcus / Plus : vrais impacts NPC et PvP, duree, expiration et soins sequences", () => {
  for (const [ship, skill, seconds] of [["orcus", "ability_orcus_assimilate", 20],
    ["orcus_plus", "ability_orcus-plus_assimilate", 24]]) {
    const f = fixture(ship);
    assert.equal(cast(f, skill), true);
    assert.equal(f.caster._abilityFx[skill].until, NOW + seconds * 1000);
    f.caster.hp = 900000;
    for (const sourceId of ["npc_attacker", f.target.id]) {
      const now = NOW + 1000;
      const result = f.api.applyServerAbilityDamage(f.room, f.sim, f.caster, 10000, 0, now, sourceId);
      assert.equal(result.total, 2000);
      const heal = f.events.filter(e => e.phase === "heal").at(-1);
      assert.equal(heal.skill, skill); assert.equal(heal.amount, 8000);
      assert.equal(heal.target, f.caster.id); assert.ok(heal.healSeq > 0);
    }
    assert.equal(f.caster.hp, 915200);
    assert.equal(f.events.filter(e => e.phase === "heal").at(-1).healSeq, 2);
    f.caster.hp = f.caster.hpMax;
    f.api.applyServerAbilityDamage(f.room, f.sim, f.caster, 10000, 0, NOW + seconds * 1000 - 1, f.target.id);
    assert.equal(f.events.filter(e => e.phase === "heal").at(-1).amount, 0);
    const heals = f.events.filter(e => e.phase === "heal").length;
    assert.equal(f.api.applyServerAbilityDamage(f.room, f.sim, f.caster, 10000, 0,
      NOW + seconds * 1000, f.target.id).total, 10000);
    assert.equal(f.events.filter(e => e.phase === "heal").length, heals);
  }
});

test("Orcus / Plus : JAMX coupe la conversion des degats et ses soins", () => {
  for (const [ship, skill] of [["orcus", "ability_orcus_assimilate"], ["orcus_plus", "ability_orcus-plus_assimilate"]]) {
    const f = fixture(ship); cast(f, skill); f.caster.hp = 900000;
    f.caster._jamUntil = NOW + 5000;
    assert.equal(f.api.applyServerAbilityDamage(f.room, f.sim, f.caster, 10000, 0, NOW + 1, f.target.id).total, 10000);
    assert.equal(f.events.some(e => e.phase === "heal"), false);
  }
});

test("Sentinel : croissance composee, fin, changement de configuration et JAMX", () => {
  const f = fixture("sentinel"), events = []; cast(f, "ability_sentinel");
  tickAbilityStates(f.room, f.sim, NOW + 3000, e => events.push(e), () => null);
  assert.equal(f.caster.shMax, Math.floor(100000 * 1.1 ** 3));
  assert.equal(f.caster.sh, f.caster.shMax);
  f.profile.config = 2;
  tickAbilityStates(f.room, f.sim, NOW + 3100, e => events.push(e), () => null);
  assert.equal(f.caster._abilityFx.ability_sentinel.until, NOW + 3100);
  syncDisruptorEffects(f.room, f.sim, NOW + 3100);
  assert.equal(f.caster.shMax, 100000); assert.equal(f.caster.sh, 100000);
});

test("Reallocation : 20 % du degat reel repartis au groupe dans 700, pas aux autres", () => {
  const f = fixture("hammerclaw_plus"), ally = player("ally", "aegis", 4550), outside = player("outside", "aegis", 5301), events = [];
  f.room.set(ally.id, { state: ally }); f.room.set(outside.id, { state: outside });
  for (const { state } of f.room.values()) state.hp = 500000;
  cast(f, "ability_hammerclaw-plus_reallocate");
  recordAbilityDamageDealt(f.caster, 100000, NOW + 1000);
  tickAbilityStates(f.room, f.sim, NOW + 10000, e => events.push(e), id => id === "target" ? null : "group");
  assert.equal(f.caster.hp, 510000); assert.equal(ally.hp, 510000);
  assert.equal(outside.hp, 500000); assert.equal(f.target.hp, 500000);
});

test("Stockpile : dix charges maximum, pas de charge pendant aptitude ou JAMX", () => {
  const f = fixture("hecate_plus");
  for (let i = 0; i < 15; i++) recordAbilityNpcKill(f.caster, NOW);
  assert.equal(f.caster._stockCharges, 10);
  cast(f, "ability_hecate-plus_stockpile");
  assert.equal(f.caster._stockCharges, 0);
  assert.equal(f.caster._abilityFx["ability_hecate-plus_stockpile"].shieldBonus, .11);
  recordAbilityNpcKill(f.caster, NOW + 1); assert.equal(f.caster._stockCharges, 0);
  f.caster._jamUntil = NOW + 20000; recordAbilityNpcKill(f.caster, NOW + 1); assert.equal(f.caster._stockCharges, 0);
});

test("SPR : propagation dix secondes, rayon 300, cap dix, ZNA et expiration", () => {
  const f = fixture("keres"), near = player("near", "aegis", 4800), far = player("far", "aegis", 5500), safe = player("safe", "aegis", 4700);
  safe.safe = true;
  for (const state of [near, far, safe]) f.room.set(state.id, { state });
  cast(f, "ability_keres_spr");
  tickAbilityStates(f.room, f.sim, NOW + 1000, () => {}, () => null);
  assert.equal(near.slowPct, 20); assert.equal(near._sprUntil, NOW + 11000);
  assert.equal(far._sprUntil, 0); assert.equal(safe._sprUntil, 0);
  tickAbilityStates(f.room, f.sim, NOW + 11001, () => {}, () => null);
  assert.equal(near._sprUntil, 0);
});

test("Marqueurs : ralentissement 10 % pendant 10 s et penetration 10 % partagee", () => {
  for (const skill of ["ability_spearhead_target-marker", "ability_spearhead-plus_target-marker", "ability_orcus-plus_target-marker"]) {
    for (const npc of [false, true]) {
      const f = fixture(ABILITIES[skill].ship, npc); cast(f, skill);
      assert.equal(f.target.slowPct, 10); assert.equal(f.target.slowUntil, NOW + 10000);
      assert.equal(fxDebuffsOn(f.caster._abilityFx, f.target.id, NOW).penBonus, .1);
      assert.equal(fxDebuffsOn(f.caster._abilityFx, f.target.id, NOW + getAbilityInfo(skill).durationSec * 1000).penBonus, 0);
      assert.equal(movementSpeed(f.target, f.target._combat, NOW), 360);
      assert.equal(movementSpeed(f.target, f.target._combat, NOW + 10000), 400);
    }
  }
});

test("JAMX : coupe auras, passifs, liens, clones et charges sans relance", () => {
  const f = fixture();
  Object.assign(f.caster, { _abilityFx: { ability_sentinel: { from: NOW, until: NOW + 5000 }, ability_berserker_rvg: { from: NOW, until: NOW + 5000 } },
    _execWindow: { key: "ability_retiarus_chs" }, _qaWindow: {}, tbrClones: [{}], holoClones: [{}], _voltLinkFx: {}, _tempestBackupUntil: NOW + 10000 });
  f.api.jamPlayerAbilities(f.caster, f.room, NOW, 3000);
  assert.equal(Object.keys(f.caster._abilityFx).length, 0);
  assert.equal(f.caster._execWindow, null); assert.equal(f.caster._qaWindow, null);
  assert.equal(f.caster.tbrClones.length, 0); assert.equal(f.caster.holoClones.length, 0);
  assert.equal(f.caster._voltLinkFx, null); assert.equal(f.caster._tempestBackupUntil, 0);
  assert.ok(f.caster._abilityCds.ability_sentinel > NOW);
  f.caster.hp = 0; assert.equal(triggerPaladin(f.caster, NOW + 1), false);
  assert.equal(triggerTempestBackup(f.caster, f.room, NOW + 1), false);
});
