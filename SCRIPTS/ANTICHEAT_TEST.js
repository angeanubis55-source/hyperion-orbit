import test from "node:test";
import assert from "node:assert/strict";
import { acMoveTake, acBucket, acPoolResize, acHealTake, acAuditWindow, acAuditScore, acRecordViolation } from "./ANTICHEAT.js";
import { combatProfile, validateCombatHit } from "./COMBAT_PROFILE.js";
import { loadServerMaps, mapTransition, validArrival, reviveArrival } from "./MAP_RULES.js";
import { damageEnemyLayers } from "../COMBAT/COMBAT_RULES.js";
import { CATALOG } from "../SRC/CORE/CATALOG.js";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { GROUP_BOOSTER_BONUS } from "../SRC/DATA/BOOSTERS.js";

const items = Object.values(CATALOG).flat().filter(i => i && typeof i === "object");
const laser = items.find(i => i.module?.type === "laser" && !i.petOnly);
const shield = items.find(i => i.module?.type === "shield" && !i.petOnly);
const fixture = () => ({
  faction: "mmo", hangars: [{ id: "h1", shipId: "PhoenixBleu", active: true, activeConfig: 1,
    fits: { "1": { lasers: [laser.id], gens: [shield.id], extras: [], shipMods: [] },
      "2": { lasers: [], gens: [], extras: [], shipMods: [] } } }],
  inventory: { shipModules: [] }, drones: { items: [] }, rockets: { ric3: 2 },
});

test("des positions répétées ne débloquent pas un saut hors budget", t => {
  t.mock.method(console, "log", () => {});
  const state = { x: 0, y: 0, moveBuck: 0, moveBuckT: 10000 };
  for (let i = 0; i < 100; i++) assert.equal(acMoveTake(state, 100000, 0, 10000).accepted, false);
  assert.equal(acMoveTake(state, 100000, 0, 16000).accepted, false);
});

test("les rejets conservent la recharge et la vitesse vient du serveur", () => {
  const state = { x: 0, y: 0, moveSpeed: 400, moveBuck: 0, moveBuckT: 10000, vmax: 5000 };
  assert.equal(acMoveTake(state, 5000, 0, 10500).accepted, false);
  assert.equal(state.moveBuck, 200);
  assert.equal(acMoveTake(state, 400, 0, 11000).accepted, true);
  assert.equal(state.moveBuck, 0);
});

test("un déplacement normal et une rafale après un lag restent possibles", () => {
  const state = { x: 1000, y: 1000, moveSpeed: 500, moveBuck: 0, moveBuckT: 10000 };
  assert.equal(acMoveTake(state, 1050, 1000, 10100).accepted, true);
  assert.equal(acMoveTake(state, 2000, 1000, 12100).accepted, true);
});

test("des coordonnées non finies ne corrompent pas le budget", () => {
  const state = { x: 10, y: 20, moveBuck: 20, moveBuckT: 10000 };
  for (const x of [NaN, Infinity, -Infinity]) assert.equal(acMoveTake(state, x, 0, 10000).accepted, false);
  assert.equal(state.moveBuck, 20);
});

test("changer un maximum ne soigne pas et n'efface pas une mort", () => {
  const state = { _init: true, hpMax: 1000, shMax: 1000, hp: 1, sh: 0,
    pvpDead: true, dmgBlockUntil: 99999, healBudHp: 500, healBudSh: 500 };
  for (const max of [1001, 1000, 1001]) acPoolResize(state, max, 1000);
  assert.equal(state.hp, 1);
  assert.equal(state.sh, 0);
  assert.equal(state.pvpDead, true);
  state.hp = 0;
  acPoolResize(state, 2000, 2000);
  assert.equal(state.hp, 0);
});

test("la réparation ne dépasse jamais le budget ni le maximum", () => {
  const state = { budget: 30 };
  assert.equal(acHealTake(state, 50, 1000, 100, "budget"), 80);
  assert.equal(state.budget, 0);
  assert.equal(acHealTake(state, 80, 100, 100, "budget"), 80);
});

test("l'audit attend 10 secondes même pour le premier kill", () => {
  const a = { t: 10000, kills: 1, boxes: 0, dmg: 0, score: 0 };
  assert.equal(acAuditWindow(a, 10010), null);
  assert.equal(a.kills, 1);
  const r = acAuditWindow(a, 20000);
  assert.equal(r.rates.kills, 1);
  assert.equal(r.score, 0);
});

test("des téléportations seules font monter le score jusqu'au gel", () => {
  let score = 0;
  for (let i = 0; i < 10; i++) score = acAuditScore(score, { teleports: 25 }).score;
  assert.equal(score, 100);
  assert.equal(acAuditScore(score, { teleports: 1 }).punish, true);
  assert.equal(acAuditScore(score, {}).score, 90);
});

test("l'audit normalise une fenêtre longue et remet ses compteurs à zéro", () => {
  const a = { t: 10000, kills: 40, boxes: 0, dmg: 0, score: 0, teleAt: 10 };
  const r = acAuditWindow(a, 30000, 12);
  assert.equal(r.rates.kills, 20);
  assert.equal(r.rates.teleports, 2);
  assert.equal(r.score, 10);
  assert.equal(a.kills, 0);
  assert.equal(a.teleAt, 12);
});

test("un rejet isole est visible sans score, meme apres une rafale de paquets de lag", () => {
  const s = { _audit: { t: 10000, score: 0 } };
  for (let i = 0; i < 200; i++) acRecordViolation(s, "movement", 11000, { distance: 1000 });
  assert.equal(s._security.total, 200);
  assert.equal(s._security.history.length, 1);
  assert.equal(acAuditWindow(s._audit, 20000).score, 0);
});

test("des rejets de petits sauts repetes font monter le score et gardent des details bornes", t => {
  t.mock.method(console, "log", () => {});
  const s = { x: 0, y: 0, moveSpeed: 400, moveBuck: 0, moveBuckT: 10000,
    _audit: { t: 10000, score: 0 } };
  for (let window = 0; window < 2; window++) {
    for (let i = 1; i <= 100; i++) {
      const now = 10000 + window * 10000 + i * 100;
      assert.equal(acMoveTake(s, 3000, 0, now).accepted, false);
    }
    const audit = acAuditWindow(s._audit, 20000 + window * 10000);
    assert.equal(audit.score, (window + 1) * 50);
    assert.equal(audit.rates.teleports, 0, "aucun saut ne depasse 4000 u");
    assert.ok(audit.triggers.some(t => t.includes("mouvements refusés")));
    assert.equal(s._audit.movementRejected, 0);
  }
  assert.ok(s._security.history.length <= 24);
  assert.equal(s._security.last.distance, 3000);
  assert.equal(s._security.last.speed, 400);
  assert.equal(s._audit.score, 100);
});

test("une declaration d'horloge client reste informative, sans gel automatique", () => {
  const s = { _audit: { t: 10000, score: 0 } };
  for (let i = 0; i < 10; i++) acRecordViolation(s, "clock", 10000 + i * 1000, { scale: 50, declared: true });
  assert.equal(acAuditWindow(s._audit, 20000).score, 0);
  assert.equal(s._security.last.declared, true);
});

test("un effet de combat encore local ne provoque pas de gel sur un rejet de profil seul", () => {
  const s = { _audit: { t: 10000, score: 0 } };
  for (let i = 0; i < 100; i++) acRecordViolation(s, "profile", 10000 + i * 100, { unverified: true });
  assert.equal(acAuditWindow(s._audit, 20000).score, 0);
  assert.equal(s._security.last.unverified, true);
});

test("les stats dépendent du hangar et de sa configuration", () => {
  const user = fixture();
  const a = combatProfile(user, "1-1", 1), b = combatProfile(user, "1-1", 2);
  assert.ok(a.hpMax > 1);
  assert.ok(a.shMax > 0);
  assert.equal(b.shMax, 0);
  assert.equal(a.hpMax, b.hpMax);
  const forged = combatProfile({ ...user, hpMax: 1e12, range: 1e12, evade: 1, absorb: 1 }, "1-1", 1);
  assert.deepEqual(forged, a);
});

test("les malus de formation et les boosters de groupe restent appliqués", () => {
  const user = fixture();
  const normal = combatProfile(user, "1-1");
  user.drones = { activeFormation: "diamond", items: Array.from({ length: 4 }, () => ({ level: 1, fit: { equipment: [] } })) };
  const diamond = combatProfile(user, "1-1");
  assert.equal(diamond.hpMax, Math.floor(normal.hpMax * 0.7));
  const boosted = combatProfile(user, "1-1", 1, { hp2: 2, shd2: 1 });
  assert.ok(boosted.hpMax > diamond.hpMax);
  assert.ok(boosted.shMax > diamond.shMax);
});

test("le changement de configuration serveur conserve les PV et les boucliers déjà dépensés", () => {
  const source = readFileSync(new URL("./MULTI_SERVER.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  const start = source.indexOf("function refreshCombatProfile(");
  const end = source.indexOf("\n}", start);
  assert.ok(start >= 0 && end > start);
  const user = fixture();
  let now = 10000;
  const context = vm.createContext({ state: { id: "u_test" }, message: {}, Date: { now: () => now },
    getAccountGameplayData: () => user, socialDescribeGroup: () => null, describePeer: () => null,
    findPeerState: () => null, combatProfile, acPoolResize, SERVER_VMAX: 1500, GROUP_BOOSTER_BONUS });
  vm.runInContext(source.slice(start, end + 2), context);
  vm.runInContext('refreshCombatProfile(state, "test", "1-1", message)', context);
  context.state.hp = 100; context.state.sh = 0;
  now = 10001; context.message = { config: 2, hpMax: 1e9 };
  vm.runInContext('refreshCombatProfile(state, "test", "1-1", message)', context);
  assert.equal(context.state.hp, 100);
  assert.equal(context.state._combat.config, 2);
  now = 10002; context.message = { config: 1 };
  vm.runInContext('refreshCombatProfile(state, "test", "1-1", message)', context);
  assert.equal(context.state._combat.config, 2, "le cooldown ne dépend pas du nombre de paquets");
  now = 16000;
  vm.runInContext('refreshCombatProfile(state, "test", "1-1", message)', context);
  assert.equal(context.state._combat.config, 1);
  assert.equal(context.state.hp, 100);
  assert.equal(context.state.sh, 0);
});

test("les coefficients forgés sont remplacés avant application et débit du budget", () => {
  const profile = combatProfile(fixture(), "1-1");
  const safe = validateCombatHit(profile, { dmg: 1, critChance: 1, critMult: 1000000,
    pen: 1, weaken: 10, freezeSec: 5, slowPct: 95, slowSec: 30 });
  assert.equal(safe.critChance, profile.critChance);
  assert.equal(safe.critMult, profile.critMult);
  assert.equal(safe.pen, profile.penetration);
  assert.equal(safe.weaken, 0);
  assert.equal(safe.freezeSec, 0);
  const enemy = { hp: 1000000, sh: 0 };
  damageEnemyLayers(enemy, safe.dmg, { critChance: safe.critChance, critMultiplier: safe.critMult, variance: 0, random: () => 0 });
  assert.equal(enemy.hp, 1000000 - profile.critMult);
  assert.equal(validateCombatHit(profile, { dmg: profile.maxDamage + 1 }), null);
  for (const dmg of [NaN, Infinity, -1]) assert.equal(validateCombatHit(profile, { dmg }), null);
});

test("le gel vient d'une roquette possédée avec son propre cooldown serveur", () => {
  const p = combatProfile(fixture(), "1-1"), state = {};
  const message = { dmg: 0, rocket: "ric3", freezeSec: 999, slowPct: 95 };
  assert.equal(validateCombatHit(p, message, state, 10000).freezeSec, 2);
  assert.equal(validateCombatHit(p, message, state, 10001), null);
  assert.equal(validateCombatHit(p, message, state, 40000).freezeSec, 2);
  assert.equal(validateCombatHit(p, { dmg: 0, rocket: "rc100" }), null);
  assert.equal(validateCombatHit(p, { dmg: 0, freezeSec: 999 }), null);
});

test("un projectile déjà lancé conserve ses droits après consommation du dernier stock", () => {
  const p = combatProfile(fixture(), "1-1");
  p.rocketIds = [];
  const state = { _launchedRocketIds: { ric3: 20000 } };
  assert.equal(validateCombatHit(p, { dmg: 0, rocket: "ric3" }, state, 10000).freezeSec, 2);
  assert.equal(validateCombatHit(p, { dmg: 0, rocket: "ric3" }, state, 20001), null);
});

test("le seau limite une rafale et se recharge avec l'horloge serveur", () => {
  const state = {};
  assert.equal(acBucket(state, "hits", 10000, 2, 1, 2), true);
  assert.equal(acBucket(state, "hits", 10000, 2, 1, 1), false);
  assert.equal(acBucket(state, "hits", 11000, 2, 1, 1), true);
});

test("les portails réels autorisent seulement leur destination et leur arrivée", async () => {
  const maps = await loadServerMaps();
  const portal = maps.get("1-2").portals.find(p => p.toMap === "1-1");
  const state = { x: portal.x, y: portal.y, hp: 100 };
  const arrival = mapTransition(maps, state, "1-2", "1-1", "mmo", 10000);
  assert.ok(arrival);
  assert.ok(validArrival({ ...arrival, until: 20000 }, arrival.x, arrival.y, 10000));
  assert.equal(validArrival({ ...arrival, until: 20000 }, 999999, 999999, 10000), false);
  assert.equal(mapTransition(maps, state, "1-2", "4-5", "mmo", 10000), null);
  assert.equal(mapTransition(maps, { ...state, x: 5500, y: 3500 }, "1-2", "1-1", "mmo", 10000), null);
  assert.equal(mapTransition(maps, state, "1-2", "unknown", "mmo", 10000), null);
});

test("le flag dead du client ne donne pas un droit de résurrection ou de téléportation", async () => {
  const maps = await loadServerMaps();
  const alive = { x: 5500, y: 3500, hp: 100, dead: true };
  assert.equal(reviveArrival(maps, alive, "1-2", "mmo", 5000, 3500), null);
  assert.equal(mapTransition(maps, alive, "1-2", "1-1", "mmo", 10000), null);
  const dead = { ...alive, hp: 0, pvpDead: true };
  assert.ok(reviveArrival(maps, dead, "1-2", "mmo", dead.x, dead.y));
  assert.equal(reviveArrival(maps, dead, "1-2", "mmo", 999999, 999999), null);
  assert.ok(mapTransition(maps, dead, "1-2", "1-1", "mmo", 10000)?.revive);
});
