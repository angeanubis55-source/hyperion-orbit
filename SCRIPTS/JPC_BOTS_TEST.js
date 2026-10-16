"use strict";
// Bots JPC d'Hyperion Orbit : éligibilité des maps, types dédiés, filtre de
// cibles (que du classique), simulation de farm / riposte / fuite / repair.
import test from "node:test";
import assert from "node:assert/strict";

import { NPC_TYPES } from "../NPC/NPC_TYPES.js";
import { spawnNpcEntity } from "../NPC/NPC_SPAWNER.js";
import { ensureJpcTypes, isJpcBotMap, isJpcFarmable, tickJpcSystem } from "../NPC/JPC_BOTS.js";
import { resetJpcFill } from "../NPC/JPC_BOTS.js";
import { buildJpcRoster, hashMapSeed, JPC_TIERS, tierForMap } from "../NPC/JPC_BOTS.js";
import { tierListPick, tierProgressForMap, mulberry32 } from "../NPC/JPC_BOTS.js";
import { JPC_ROLE_FORMS, rollJpcFormation, rollJpcFormSet } from "../NPC/JPC_BOTS.js";
import { jpcSkillForMap, jpcRiposteDurationForSkill, jpcRiposteMultForSkill, jpcRiposteFormation, jpcDroneDmgFactor } from "../NPC/JPC_BOTS.js";
import { jpcShipSpeed } from "../NPC/JPC_BOTS.js";
import { jpcFarmDmgMult } from "../NPC/JPC_BOTS.js";
import { jpcParkingSpot } from "../NPC/JPC_BOTS.js";
import { isJpcBotSheltered } from "../NPC/JPC_BOTS.js";
import { jpcBaseHull, shipDesignsFor, rollJpcShip, ensureJpcShipType } from "../NPC/JPC_BOTS.js";
import { jpcMissChance, jpcFleeThreshold, jpcCountFoes } from "../NPC/JPC_BOTS.js";
import { rollJpcBreather } from "../NPC/JPC_BOTS.js";
import { jpcHourBucket, jpcRosterCount } from "../NPC/JPC_BOTS.js";
import { jpcCountFromRng } from "../NPC/JPC_BOTS.js";
import { JPC_ROCKET_STD, JPC_ROCKET_DMG_MULT, rollJpcRockets, jpcRocketDamage } from "../NPC/JPC_BOTS.js";
import { ROCKET_TYPES } from "../COMBAT/ROCKET_TYPES.js";
import { findJpcPreyForNpc } from "../NPC/JPC_BOTS.js";
import { ZoneNpcSim } from "./NPC_ROOM.js";
import { tickJpcRepair, jpcTravel } from "../NPC/JPC_BEHAVIOR.js";
import { makeJpcPseudo } from "../NPC/JPC_BOTS.js";

test("pseudos : aucune collision meme avec un tirage identique", () => {
  const used = new Set();
  for (let i = 0; i < 500; i++) {
    const name = makeJpcPseudo(used, () => 0);
    assert.ok(!name.startsWith("JPC"));
    assert.ok(name.length <= 32);
  }
  assert.equal(used.size, 500);
});

test("reparation : premier tick apres 10 + 1 s, puis 5 % chaque seconde", () => {
  const bot = { hp: 200, sh: 100, hpMax: 1000, shMax: 2000 };
  for (let i = 1; i <= 219; i++) tickJpcRepair(bot, 0.05, i * 0.05);
  assert.equal(bot.hp, 200);
  assert.equal(bot.sh, 100);
  tickJpcRepair(bot, 0.05, 11);
  assert.equal(bot.hp, 250);
  assert.equal(bot.sh, 200);
  assert.equal(bot.jpcRepairGainHp, 50, "gain coque exposé (+x)");
  assert.equal(bot.jpcRepairGainSh, 100, "gain bouclier exposé (+x)");
  tickJpcRepair(bot, 0.95, 11.95);
  assert.equal(bot.hp, 250);
  tickJpcRepair(bot, 0.05, 0); // Un impact annule la fraction de tick.
  tickJpcRepair(bot, 0.05, 10.05);
  assert.equal(bot.hp, 250);
});

test("trajet : vitesse constante, dernier pas borne, murs contournes", () => {
  const world = { w: 10000, h: 6000 };
  const bot = { x: 1000, y: 1000, speed: 300, r: 20 };
  for (let i = 0; i < 65; i++) {
    const move = jpcTravel(bot, 2000, 1000, 0.05, world);
    assert.equal(move.spd, 300);
    bot.x += move.mx * move.spd * 0.05;
    bot.y += move.my * move.spd * 0.05;
  }
  const last = jpcTravel(bot, bot.x + 4, bot.y, 0.05, world);
  assert.equal(last.spd * 0.05, 4);
  const walls = [{ x: 3000, y: 1000, w: 200, h: 1000 }];
  for (let i = 0; i < 300; i++) {
    const move = jpcTravel(bot, 4000, 1000, 0.05, world, walls);
    bot.x += move.mx * move.spd * 0.05;
    bot.y += move.my * move.spd * 0.05;
    assert.ok(!(bot.x >= 2880 && bot.x <= 3120 && bot.y >= 480 && bot.y <= 1520));
  }
  assert.ok(Math.hypot(bot.x - 4000, bot.y - 1000) < 1);
});

function controlledSim() {
  ensureJpcTypes();
  const sim = new ZoneNpcSim("1-2", { w: 10000, h: 6000 }, [], null);
  sim.safe = [{ x: 9000, y: 3000, r: 450 }]; sim.walls = [];
  sim.spawnJpcRoster(buildJpcRoster("1-2", sim.world).slice(0, 2), 100000);
  const bots = [...sim.entries.values()];
  for (const bot of bots) {
    Object.assign(bot, { x: 1000, y: 3000, jpcIshAt: Infinity, jpcX6At: Infinity, jpcFormAt: Infinity });
  }
  const prey = { uid: "prey", type: "npc_Streuner", x: 1400, y: 3000,
    hp: 1000000, sh: 0, hpMax: 1000000, shMax: 0, speed: 0, spread: 0.8, canShoot: false, r: 18 };
  sim.entries.set(prey.uid, prey);
  return { sim, bots, prey };
}

test("serveur : nouvelles cibles évitées au lock joueur, cible en cours gardée (gris)", () => {
  const { sim, bots: [a, b], prey } = controlledSim();
  sim.setPlayer("spectator", 1500, 3000, { lockedTarget: prey.uid });
  assert.equal(prey.lockBy, undefined); // Aucun tir joueur necessaire.
  assert.equal(sim.jpcPickPrey(a), null); // Nouvelle cible : la sélection joueur est évitée.
  a.jpcPreyUid = prey.uid;
  assert.equal(sim.jpcPreyValid(a), true); // En cours : gardée malgré le lock (gris, comme un vrai joueur).
  sim.setPlayer("spectator", 1500, 3000, { lockedTarget: "" });
  assert.equal(sim.jpcPickPrey(b), null);
  a.hp = 0;
  assert.equal(sim.jpcPickPrey(b), prey.uid);
});

test("serveur : 6 eclairs x1 espaces de 200 ms, centre/cotes, cible exacte", () => {
  const { sim, bots: [bot, other], prey } = controlledSim();
  other.hp = 0;
  bot.jpcPreyUid = prey.uid;
  sim.setPlayer("spectator", 1500, 3000);
  sim.jpcStartVolley(bot, prey.uid, false, 100000);
  const counts = [];
  for (let i = 0; i < 6; i++) {
    sim.jpcTickVisuals(bot, 100000 + i * 200 - 1);
    assert.equal(sim.drainShotFx().length, 0);
    bot.x += 10;
    sim.jpcTickVisuals(bot, 100000 + i * 200);
    const [shot] = sim.drainShotFx();
    assert.ok(shot);
    assert.equal(shot.x, bot.x);
    assert.equal(shot.tuid, prey.uid);
    assert.equal(shot.key, "x1");
    counts.push(shot.n);
  }
  assert.deepEqual(counts, [1, 2, 1, 2, 1, 2]);
  sim.jpcStartVolley(bot, prey.uid, false, 102000);
  sim.jpcTickVisuals(bot, 102000);
  assert.equal(sim.drainShotFx()[0].n, 2);
  sim.setPlayer("spectator", 1500, 3000, { lockedTarget: prey.uid });
  sim.jpcTickVisuals(bot, 102200);
  const [lockShot] = sim.drainShotFx();
  assert.ok(lockShot, "visuels continuent malgré le lock joueur (gris, comme un vrai joueur)");
  assert.equal(lockShot.tuid, prey.uid);
});

test("respawn 90 s : pas de refill en boucle après un kill", () => {
  resetJpcFill();
  const { ctx, enemies } = makeCtx("2-5", { withNpcs: false });
  const dt = 1 / 60;
  const aliveCount = () => enemies.filter((e) => e?.isJpcBot && e.hp > 0).length;
  // Remplissage initial complet (rapide : 1 bot / 0,5 s).
  for (let f = 0; f < 60 * 20; f++) tickJpcSystem(dt, ctx);
  const alive0 = aliveCount();
  assert.ok(alive0 >= 2, "remplissage initial rapide");
  // Tue 2 bots : rien ne revient avant 90 s.
  for (const v of enemies.filter((e) => e?.isJpcBot && e.hp > 0).slice(0, 2)) v.hp = 0;
  for (let f = 0; f < 60 * 10; f++) tickJpcSystem(dt, ctx);
  assert.equal(aliveCount(), alive0 - 2, "aucun remplacement avant 90 s");
  // Après 90 s : les remplacements arrivent.
  for (let f = 0; f < 60 * 95; f++) tickJpcSystem(dt, ctx);
  assert.ok(aliveCount() >= alive0, "remplacements après 90 s");
  resetJpcFill();
});

test("serveur : respawn JPC à 90 s (anti-farm en boucle)", () => {
  const { sim, bots } = controlledSim();
  const bot = bots.find((e) => e.hp > 0);
  const nowMs = Date.now();
  sim.jpcKillBot(bot, nowMs);
  assert.equal(bot.hp, 0, "bot tué");
  const wait = Number(bot.jpcRespawnAt) - nowMs;
  assert.ok(wait >= 89000 && wait <= 91000, `respawn dans 90 s (${wait} ms)`);
  for (let i = 0; i < 10; i++) sim.tick(0.05);
  assert.ok(!(bot.hp > 0), "toujours mort avant 90 s");
  bot.jpcRespawnAt = Date.now() - 1000;
  const seq = bot.seq;
  sim.tick(0.05);
  assert.ok(bot.hp > 0, "respawné à l'échéance");
  assert.equal(bot.seq, seq + 1, "incarnation suivante");
  // Tué par un joueur : même délai (c'est le cas farm en boucle).
  const bot2 = bots.find((e) => e !== bot && e.hp > 0);
  sim.setPlayer("u_k", bot2.x + 100, bot2.y, { dead: false, safe: false });
  const t0 = Date.now();
  sim.applyHit("u_k", { uid: bot2.uid, dmg: 1000000, pen: 0 });
  assert.ok(!(bot2.hp > 0), "tué par le joueur");
  assert.ok(Number(bot2.jpcRespawnAt) - t0 >= 89000, "respawn joueur aussi à 90 s");
});

test("serveur : roquettes farm (dégâts + rshot) et riposte (playerHits)", () => {
  const { sim, bots } = controlledSim();
  const bot = bots.find((e) => e.hp > 0);
  const prey = sim.entries.get(bot.jpcPreyUid) || [...sim.entries.values()].find((e) => !e.jpc && e.hp > 0);
  assert.ok(bot.jpcRockets?.standard, "roquette standard serveur");
  // Farm : dégâts directs + visuel rshot (le tir peut rater : on boucle).
  bot.jpcShootT = Date.now() + 60000;
  bot.jpcRocketAt = 0;
  const expected = jpcRocketDamage(bot.jpcRockets.standard, bot.jpcTier ?? 1);
  let dealt = 0;
  for (let i = 0; i < 10 && dealt <= 0; i++) {
    const hpBefore = prey.hp;
    bot.jpcRocketAt = 0;
    sim.jpcMove(bot, null, 0.05, Date.now());
    dealt = hpBefore - prey.hp;
  }
  // Variance du tir (0.9-1.1) × variance/crit des couches dégâts.
  assert.ok(dealt >= expected * 0.8 && dealt <= expected * 1.8, `roquette farm ${dealt} ≈ ${expected}`);
  const farmShots = sim.drainRocketFx().filter((s) => s.kind === bot.jpcRockets.standard);
  assert.ok(farmShots.length >= 1, "rshot farm (visuel même en cas de MISS)");
  // Cadence 1 s : rappel immédiat = rien.
  sim.jpcMove(bot, null, 0.05, Date.now());
  assert.equal(sim.drainRocketFx().length, 0, "pas de 2e avant 1 s");
  // Riposte : dégâts playerHits + rshot vers le joueur (on boucle pour
  // passer le MISS 15 %, comme un vrai tir).
  sim.setPlayer("u_r", bot.x + 200, bot.y, { dead: false, safe: false });
  bot.jpcRocketAt = 0;
  let hit = null;
  for (let i = 0; i < 20 && !hit; i++) {
    sim.jpcFireRocket(bot, { id: "u_r", x: bot.x + 200, y: bot.y }, true, Date.now());
    hit = sim.playerHits.find((h) => h.playerId === "u_r");
  }
  assert.ok(hit && hit.damage > 0 && hit.kind === "rocket", "playerHits roquette");
  const rshots = sim.drainRocketFx().filter((s) => s.kind === bot.jpcRockets.standard);
  assert.ok(rshots.length >= 1, "rshot riposte");
});

test("serveur : bots en fuite garés près du centre (aléatoire 35 m)", () => {
  const { sim, bots } = controlledSim();
  const pair = bots.filter((e) => e.hp > 0).slice(0, 2);
  assert.equal(pair.length, 2, "deux bots");
  for (const bot of pair) {
    bot.hp = bot.hpMax * 0.2;
    bot.sh = 0;
    bot.jpcIshAt = Infinity;
    bot.jpcSafeX = null;
  }
  sim.tick(0.05);
  const [x1, x2] = pair;
  assert.ok(x1.jpcSafeX != null && x2.jpcSafeX != null, "destinations calculées");
  for (const bot of pair) {
    assert.ok(Math.hypot(bot.jpcSafeX - 9000, bot.jpcSafeY - 3000) <= 35, "dans 35 m du centre");
  }
});

test("serveur : JPC à l'abri = intouchable comme un joueur (ZNA portail/base)", () => {
  const { sim, bots } = controlledSim();
  const bot = bots.find((e) => e.hp > 0);
  // Le bot se répare au centre de sa ZNA : dégâts + claims refusés.
  sim.safe = [{ x: bot.x, y: bot.y, r: 500 }];
  sim.setPlayer("u_camp", bot.x + 200, bot.y, { dead: false, safe: false });
  const hpBefore = bot.hp;
  sim.applyHit("u_camp", { uid: bot.uid, dmg: 50000, pen: 0 });
  assert.equal(bot.hp, hpBefore, "aucun dégât à l'abri");
  assert.equal(bot.lockBy, null, "pas de lock à l'abri");
  assert.equal(bot.firstBy, null, "pas de crédit à l'abri");
  assert.equal(bot.aggroBy, null, "pas d'aggro à l'abri");
  assert.equal((bot.hitHist || []).length, 0, "pas d'historique à l'abri");
  // Hors zone : les tirs repassent normalement (le garde est bien la cause).
  sim.safe = [];
  sim.applyHit("u_camp", { uid: bot.uid, dmg: 1000, pen: 0 });
  assert.ok(!(bot.hp >= hpBefore), "dégâts hors zone");
  assert.equal(String(bot.lockBy), "u_camp", "lock hors zone");
});

test("serveur : un JPC qui a tué oublie le joueur mort (pas de rancune)", () => {
  const { sim, bots } = controlledSim();
  const bot = bots.find((e) => e.hp > 0);
  sim.setPlayer("u_vic", bot.x + 100, bot.y, { dead: false, safe: false });
  sim.applyHit("u_vic", { uid: bot.uid, dmg: 1000, pen: 0 });
  assert.equal(String(bot.aggroBy), "u_vic", "riposte ciblée sur l'agresseur");
  for (let i = 0; i < 5; i++) sim.tick(0.05);
  assert.equal(String(bot.chaseId), "u_vic", "poursuite en cours");
  assert.ok((bot.dmgBy?.size || 0) > 0 && (bot.hitHist || []).length > 0, "historique de dégâts");
  // Le joueur meurt (tué par le bot ou non) : oubli total.
  sim.setPlayer("u_vic", bot.x + 100, bot.y, { dead: true, safe: false });
  for (let i = 0; i < 5; i++) sim.tick(0.05);
  assert.equal(bot.aggroBy, null, "aggro oubliée");
  assert.equal(bot.chaseId, null, "poursuite oubliée");
  assert.equal(bot.lastHitBy, null, "dernier tapeur oublié");
  assert.equal(bot.dmgBy?.size || 0, 0, "cumul dégâts oublié");
  assert.equal((bot.hitHist || []).length, 0, "historique oublié");
  // Respawn à côté du bot : toujours aucune rancune, le bot farme.
  sim.setPlayer("u_vic", bot.x + 100, bot.y, { dead: false, safe: false });
  for (let i = 0; i < 5; i++) sim.tick(0.05);
  assert.notEqual(String(bot.aggroBy || ""), "u_vic", "pas de rancune au respawn");
  assert.notEqual(String(bot.chaseId || ""), "u_vic", "pas de poursuite au respawn");
});

test("serveur : salves riposte en x4/x6, farm en x1", () => {
  const { sim, bots: [bot, other], prey } = controlledSim();
  other.hp = 0;
  bot.jpcPreyUid = prey.uid;
  sim.setPlayer("u_rip", bot.x + 200, bot.y, { dead: false, safe: false });
  bot.chaseId = "u_rip";
  // Farm (NPC) : toujours x1.
  sim.jpcStartVolley(bot, prey.uid, false, 200000);
  sim.jpcTickVisuals(bot, 200000);
  assert.equal(sim.drainShotFx().find((s) => s.tuid === prey.uid)?.key, "x1");
  // Riposte (joueur) : x4, x6 en salve (on purge les éclairs de farm en attente).
  bot.jpcVisualParts = [];
  sim.jpcStartVolley(bot, "u_rip", true, 201000, "x4");
  sim.jpcTickVisuals(bot, 201000);
  const r4 = sim.drainShotFx().find((s) => s.tuid === "u_rip");
  assert.ok(r4, "visuel riposte");
  assert.equal(r4.key, "x4", "riposte en x4");
  bot.jpcVisualParts = [];
  sim.jpcStartVolley(bot, "u_rip", true, 202000, "x6");
  sim.jpcTickVisuals(bot, 202000);
  assert.equal(sim.drainShotFx().find((s) => s.tuid === "u_rip")?.key, "x6", "salve x6");
});

test("serveur : farm une fois par seconde, riposte sans double cible", () => {
  const { sim, bots: [bot, other], prey } = controlledSim();
  other.hp = 0;
  sim.jpcMove(bot, null, 0.05, 100000);
  assert.equal(bot.jpcShootT, 101000);
  const hp = prey.hp;
  sim.jpcMove(bot, null, 0.05, 100999);
  assert.equal(prey.hp, hp);
  // Le tir peut rater (maladresse) : on boucle jusqu'au premier impact.
  let hit = false;
  for (let i = 0; i < 10 && !hit; i++) {
    sim.jpcMove(bot, null, 0.05, 101000 + i * 1000);
    hit = prey.hp < hp;
  }
  assert.ok(hit, "tir farm (quitte à rater d'abord)");
  sim.setPlayer("attacker", 1500, 3000);
  const before = prey.hp;
  sim.jpcMove(bot, { id: "attacker" }, 0.05, 103000);
  assert.equal(bot.jpcPreyUid, null);
  assert.equal(prey.hp, before);
});

test("cartes éligibles : pas de PvP 4-x, ni gate, ni QZ, ni Low, ni Maudite", () => {
  for (const map of ["1-1", "1-2", "2-5", "3-8", "5-2", "1-BL"]) {
    assert.equal(isJpcBotMap(map), true, map);
  }
  for (const map of ["4-1", "4-5", "alpha", "zeta", "awakened", "low", "qz", "MAUDITE"]) {
    assert.equal(isJpcBotMap(map), false, map);
  }
});

test("types dédiés : coque joueur, tir façon joueur, drones", () => {
  ensureJpcTypes();
  assert.ok(NPC_TYPES.npc_Jpc_liberator, "liberator enregistré");
  assert.ok(NPC_TYPES.npc_Jpc_goliath, "goliath enregistré");
  assert.match(String(NPC_TYPES.npc_Jpc_liberator.sprite.path), /SHIP_LIBERATOR/);
  assert.equal(NPC_TYPES.npc_Jpc_goliath.altShot, true);
  assert.ok((NPC_TYPES.npc_Jpc_goliath.drones?.count || 0) > 0);
  // Coques joueur : même convention d'orientation que le vaisseau local.
  assert.equal(NPC_TYPES.npc_Jpc_liberator.sprite.angleOffset, Math.PI);
  assert.equal(NPC_TYPES.npc_Jpc_goliath.sprite.angleOffset, Math.PI);
});

test("cibles : que du classique (ni cubi, ni emperor, ni invoke/mind/strokelight)", () => {
  assert.equal(isJpcFarmable({ hp: 1, type: "npc_Streuner" }), true);
  assert.equal(isJpcFarmable({ hp: 1, type: "npc_Boss_Kristallon" }), true);
  for (const type of ["npc_Cubikon", "npc_Cubikon_beta", "npc_Emperor_Sibelon",
    "npc_Invoke_XVI", "npc_Mindfire_Behemoth", "npc_Strokelight_Barrage",
    "npc_Streuner_Creeper"]) {
    assert.equal(isJpcFarmable({ hp: 1, type }), false, type);
  }
  assert.equal(isJpcFarmable({ hp: 0, type: "npc_Streuner" }), false);
});

let nextId = 1;
function makeCtx(mapId, { withNpcs = true } = {}) {
  const enemies = [];
  const mk = (type, x, y) => spawnNpcEntity(
    { id: nextId++, type, x, y, config: NPC_TYPES[type], wave: 1 },
    { bullet: () => {}, preview: () => {}, frames: () => {} },
  );
  if (withNpcs) {
    for (const t of ["npc_Streuner", "npc_Saimon", "npc_Cubikon", "npc_Emperor_Sibelon"]) {
      const e = mk(t, 1000 + Math.random() * 8000, 1000 + Math.random() * 4000);
      if (e) enemies.push(e);
    }
  }
  const firedAtPlayer = [];
  const ctx = {
    enemies,
    makeEnemy: (type, x, y) => mk(type, x, y),
    WORLD: { w: 10000, h: 6000 },
    zoneWalls: [],
    zonePortals: [{ x: 9000, y: 5000, r: 260 }],
    zoneCamps: [{ x: 2000, y: 2000 }, { x: 7000, y: 1500 }],
    player: { x: 500, y: 500, hp: 500000, dead: false },
    damageEnemy: (e, dmg, pen, crit, opts) => {
      if (!e || e.hp <= 0) return { total: 0 };
      if (opts?.fromJpc !== true) e._damagedByPlayer = true;
      else if (!e._damagedByPlayer) e.noRewards = true;
      const done = Math.min(e.hp, Math.max(1, Math.round(dmg)));
      e.hp -= done;
      return { total: done, sh: 0, hp: done };
    },
    enemyShoot: (e) => { firedAtPlayer.push(e.id); },
    npcIemBlast: () => {},
    addCappedProjectile: () => {},
    enemyBullets: [],
    bulletLimit: 900,
    bulletLifeForRange: () => 3,
    currentMapId: () => mapId,
    npcIsInSafeZone: () => false,
  };
  return { ctx, enemies, firedAtPlayer };
}

test("solo : faux tirs etales, sans degats, cible gardée au lock joueur (gris)", () => {
  const { ctx, enemies } = makeCtx("2-3", { withNpcs: false });
  tickJpcSystem(0.05, ctx);
  const bot = enemies.find(e => e.isJpcBot);
  Object.assign(bot, { x: 1000, y: 3000, jpcShootT: 0, jpcIshCd: Infinity });
  const prey = { id: nextId++, type: "npc_Streuner", x: 1400, y: 3000, hp: 1e6, hpMax: 1e6 };
  enemies.push(prey);
  const shots = [];
  let time = 0;
  // Visuels lasers seuls (les roquettes 1/s ont leur propre canal isRocket).
  ctx.addCappedProjectile = (_, shot) => { if (shot.ownerId === bot.id && shot.isRocket !== true) shots.push({ ...shot, time }); };
  for (let i = 0; i < 20; i++) {
    time = i * 0.05;
    tickJpcSystem(0.05, ctx);
  }
  const groups = Map.groupBy(shots, shot => Math.round(shot.time * 1000));
  assert.deepEqual([...groups.keys()], [0, 200, 400, 600, 800]);
  assert.deepEqual([...groups.values()].map(parts => parts.length), [1, 2, 1, 2, 1]);
  assert.ok(shots.every(s => s.dmg === 0 && s.key === "x1" && s.targetId === prey.id));
  ctx.lockedId = prey.id;
  // Comme un vrai joueur : le bot garde sa cible (lock gris côté joueur),
  // dégâts réels + visuels continuent (on force la cadence, le MISS peut
  // faire rater un tir).
  const beforeHp = prey.hp, beforeShots = shots.length;
  for (let f = 0; f < 10 && prey.hp >= beforeHp; f++) {
    bot.jpcShootT = 0; bot.jpcRocketCd = 0;
    tickJpcSystem(0.05, ctx);
  }
  assert.ok(prey.hp < beforeHp, "dégâts continuent malgré le lock joueur");
  assert.ok(shots.length > beforeShots, "visuels continuent malgré le lock joueur");
  assert.equal(bot.jpcFarmId, prey.id, "cible gardée (lock gris)");
});

test("1-2 : 2-6 bots, pseudos varies, farm classique, riposte, x4/x6", () => {
  const { ctx, enemies, firedAtPlayer } = makeCtx("1-2");
  const dt = 1 / 60;
  const frames = 60 * 120;
  let sawFarmKill = false, sawRiposte = false, sawX6 = false;
  for (let f = 0; f < frames; f++) {
    tickJpcSystem(dt, ctx);
    if (f === Math.floor(frames / 2)) {
      const bot = enemies.find((e) => e?.isJpcBot && e.hp > 0);
      if (bot) { bot.hp -= 5000; bot._damagedByPlayer = true; }
    }
    for (const e of enemies) {
      if (!e?.isJpcBot) continue;
      if (e.jpcRiposte) sawRiposte = true;
      if (e.jpcX6T > 0) sawX6 = true;
    }
    for (const e of enemies) {
      if (e && !e.isJpcBot && e.hp <= 0 && !e.counted) {
        e.counted = true;
        assert.ok(!/Cubikon|Emperor/i.test(String(e.type)), `cible interdite tuée: ${e.type}`);
        if (/Streuner|Saimon/.test(String(e.type))) sawFarmKill = true;
      }
    }
  }
  const bots = enemies.filter((e) => e?.isJpcBot && e.hp > 0);
  assert.ok(bots.length >= 2 && bots.length <= 6, `2-6 bots (n=${bots.length})`);
  const names = bots.map((b) => b.jpcPseudo);
  assert.equal(new Set(names).size, names.length, "pseudos uniques");
  assert.ok(names.every((n) => /^[A-Za-z][A-Za-z0-9_]{1,31}$/.test(n) && !n.startsWith("JPC")), "pseudos JPC_XY");
  assert.ok(bots.every((b) => /^npc_Jpc_/.test(b.type)), "types JPC");
  assert.ok(bots.every((b) => (b.droneCfg?.count || 0) >= 2 && (b.droneCfg?.count || 0) <= 10), "drones 2-10");
  assert.ok(bots.every((b) => !/admin|hermes|saturn/i.test((b.droneCfg?.designs || []).join(","))), "havoc/hercules/mix uniquement");
  assert.equal(sawFarmKill, true, "tuent des NPC classiques");
  assert.equal(sawRiposte, true, "riposte après attaque joueur");
  assert.ok(firedAtPlayer.length > 0, "tirs réels vers le joueur en riposte");
  assert.equal(sawX6, true, "fenêtre x6 observée");
});

test("3-8 : pools haut niveau, certains à 6+ drones, petits vaisseaux capés", () => {
  const { ctx, enemies } = makeCtx("3-8");
  const dt = 1 / 60;
  for (let f = 0; f < 60 * 90; f++) tickJpcSystem(dt, ctx);
  const bots = enemies.filter((e) => e?.isJpcBot && e.hp > 0);
  assert.ok(bots.length >= 2 && bots.length <= 6, `2-6 bots (n=${bots.length})`);
  assert.ok(bots.every((b) => (b.hpMax + b.shMax) >= 500000), "pools cohérents haut niveau");
  assert.ok(bots.some((b) => (b.droneCfg?.count || 0) >= 6), "certains ont 6+ drones");
  const small = bots.filter((b) => ["liberator", "nostromo", "piranha", "yamato"].includes(b.jpcShip));
  assert.ok(small.every((b) => (b.droneCfg?.count || 0) <= 5), "petits vaisseaux <= 5 drones");
});

test("solo : chiffres +x de réparation sur le bot locké uniquement", () => {
  const { ctx, enemies } = makeCtx("2-3", { withNpcs: false });
  const dt = 1 / 60;
  let bot = null;
  for (let f = 0; f < 60 * 20 && !bot; f++) {
    tickJpcSystem(dt, ctx);
    bot = enemies.find((e) => e?.isJpcBot && e.hp > 0);
  }
  assert.ok(bot, "bot spawné");
  const floats = [];
  ctx.npcRepairFloat = (e, hp, sh) => { floats.push({ id: e.id, hp, sh }); };
  bot.hp = bot.hpMax * 0.5;
  bot.sh = bot.shMax * 0.5;
  bot.jpcIshCd = 9999;
  tickJpcSystem(dt, ctx); // le dégât simulé remet le calme à 0
  bot.jpcCalmT = 11;
  // Non locké : aucun chiffre.
  for (let f = 0; f < 70; f++) tickJpcSystem(dt, ctx);
  assert.equal(floats.length, 0, "rien sans lock");
  assert.ok(bot.hp > bot.hpMax * 0.5, "mais la regen tourne quand même");
  // Locké : +x coque (vert) et bouclier (bleu).
  ctx.lockedId = bot.id;
  for (let f = 0; f < 70; f++) tickJpcSystem(dt, ctx);
  assert.ok(floats.length > 0, "chiffres sur le bot locké");
  assert.ok(floats.every((c) => c.id === bot.id && (c.hp > 0 || c.sh > 0)), "gains positifs du bon bot");
});

test("serveur : feed heal du snapshot pour la réparation JPC", () => {
  const { sim, bots } = controlledSim();
  const bot = bots.find((e) => e.hp > 0);
  bot.hp = bot.hpMax * 0.5;
  bot.sh = bot.shMax * 0.5;
  bot.lastHitAt = Date.now() - 11000;
  bot.jpcIshAt = Infinity;
  for (let i = 0; i < 30; i++) sim.tick(0.05);
  assert.ok(bot.hp > bot.hpMax * 0.5, "regen serveur active");
  const snap = sim.snapshot();
  const heal = (snap.heal || []).find((h) => String(h.uid) === String(bot.uid));
  assert.ok(heal, "entrée heal au snapshot");
  assert.ok(Number(heal.hp) > 0 && Number(heal.sh) > 0, "gains coque + bouclier");
  // Drainé : snapshot suivant sans nouveau tick = plus de heal.
  assert.equal((sim.snapshot().heal || []).length, 0, "feed vidé après envoi");
});

test("ZNA : JPC à l'abri inattaquable/inverrouillable, comme un joueur", () => {
  const safe = (e) => Number(e.x) > 9000;
  assert.equal(isJpcBotSheltered({ isJpcBot: true, x: 9500 }, safe), true, "JPC à l'abri");
  assert.equal(isJpcBotSheltered({ isJpcBot: true, x: 1000 }, safe), false, "JPC dehors");
  assert.equal(isJpcBotSheltered({ isJpcBot: false, x: 9500 }, safe), false, "non-JPC ignoré");
  assert.equal(isJpcBotSheltered({ type: "npc_Streuner", x: 9500 }, safe), false, "NPC normaux inchangés");
  assert.equal(isJpcBotSheltered(null, safe), false, "null");
  assert.equal(isJpcBotSheltered({ isJpcBot: true, x: 9500 }, null), false, "sans fonction de zone");
});

test("solo : dégâts JPC visibles sur le NPC locké (lasers + roquettes)", () => {
  const { ctx, enemies } = makeCtx("2-3", { withNpcs: false });
  const dt = 1 / 60;
  let bot = null;
  for (let f = 0; f < 60 * 20 && !bot; f++) {
    tickJpcSystem(dt, ctx);
    bot = enemies.find((e) => e?.isJpcBot && e.hp > 0);
  }
  assert.ok(bot, "bot spawné");
  const floats = [];
  ctx.npcJpcDamageFloat = (target, amount) => { floats.push({ id: target.id, amount }); };
  const prey = { id: nextId++, type: "npc_Streuner", x: bot.x + 300, y: bot.y, hp: 1e6, hpMax: 1e6 };
  enemies.push(prey);
  for (let f = 0; f < 10; f++) tickJpcSystem(dt, ctx);
  assert.equal(bot.jpcFarmId, prey.id, "cible acquise");
  // Non locké : aucun chiffre (comme les soins distants).
  bot.jpcShootT = 0; bot.jpcRocketCd = 0;
  for (let f = 0; f < 5; f++) tickJpcSystem(dt, ctx);
  assert.equal(floats.length, 0, "rien sans lock");
  // Locké : chiffres lasers + roquettes (on force la cadence, le MISS peut
  // faire rater un tir).
  ctx.lockedId = prey.id;
  for (let f = 0; f < 10 && floats.length === 0; f++) {
    bot.jpcShootT = 0; bot.jpcRocketCd = 0;
    tickJpcSystem(dt, ctx);
  }
  assert.ok(floats.length > 0, "chiffres sur le NPC locké");
  assert.ok(floats.every((c) => c.id === prey.id && c.amount > 0), "montants positifs de la bonne cible");
});

test("parking au portail : point aléatoire dans 35 m du centre", () => {
  const world = { w: 10000, h: 6000 };
  // Toujours dans le disque, jamais deux fois pareil.
  const seen = new Set();
  for (let i = 0; i < 10; i++) {
    const s = jpcParkingSpot({ id: i }, 9000, 5000, 500, world);
    assert.ok(Math.hypot(s.x - 9000, s.y - 5000) <= 35, "dans 35 m du centre");
    seen.add(`${Math.round(s.x)}:${Math.round(s.y)}`);
  }
  assert.ok(seen.size > 1, "aléatoire (pas l'anneau robotique)");
  // Intégration solo : deux bots en fuite se garent près du centre.
  const { ctx, enemies } = makeCtx("2-4", { withNpcs: false });
  ctx.npcIsInSafeZone = (e) => {
    const dx = e.x - 9000, dy = e.y - 5000;
    return dx * dx + dy * dy < 400 * 400;
  };
  const dt = 1 / 60;
  for (let f = 0; f < 60 * 10; f++) tickJpcSystem(dt, ctx);
  const bots = enemies.filter((e) => e?.isJpcBot && e.hp > 0).slice(0, 2);
  assert.equal(bots.length, 2, "deux bots");
  for (const bot of bots) {
    bot.x = 1000; bot.y = 1000; bot.vx = 0; bot.vy = 0;
    bot.hp = bot.hpMax * 0.2; bot.sh = 0;
    bot.jpcIshCd = 9999;
  }
  for (let f = 0; f < 60 * 120; f++) {
    tickJpcSystem(dt, ctx);
    // Harcèlement non létal : pas de regen en vol, la réparation est réelle.
    for (const bot of bots) {
      if (bot.jpcMode !== "repair" && bot.hp > 1) bot.hp = Math.max(1, bot.hp - bot.hpMax * 0.0005);
    }
    if (bots.every((bot) => bot.jpcMode === "repair")) break;
  }
  assert.ok(bots.every((bot) => bot.jpcMode === "repair"), "les deux réparent");
  for (const bot of bots) {
    assert.ok(Math.hypot(bot.x - 9000, bot.y - 5000) < 150, "garé près du centre, pas au bord");
  }
  // En réparation on ne touche à rien : chacun garde sa formation de fuite
  // (pas de bascule robotique vers standard).
  for (const bot of bots) {
    assert.equal(bot.droneCfg.formation, bot.jpcForms.flee, "formation de fuite conservée au portail");
  }
});

test("fuite au portail + réparation complète puis retour au farm", () => {
  const { ctx, enemies } = makeCtx("2-4", { withNpcs: false });
  ctx.npcIsInSafeZone = (e) => {
    const dx = e.x - 9000, dy = e.y - 5000;
    return dx * dx + dy * dy < 400 * 400;
  };
  const dt = 1 / 60;
  for (let f = 0; f < 60 * 10; f++) tickJpcSystem(dt, ctx);
  const bots = enemies.filter((e) => e?.isJpcBot);
  assert.ok(bots.length > 0, "bots spawnés");
  const bot = bots.sort((a, b) =>
    ((b.x - 9000) ** 2 + (b.y - 5000) ** 2) - ((a.x - 9000) ** 2 + (a.y - 5000) ** 2))[0];
  bot.x = 1000; bot.y = 1000; bot.vx = 0; bot.vy = 0;
  bot.hp = bot.hpMax * 0.2;
  bot.sh = 0;
  bot.jpcIshCd = 9999;
  let sawFlee = false, sawRepair = false, repaired = false, repairDist = null;
  for (let f = 0; f < 60 * 180; f++) {
    tickJpcSystem(dt, ctx);
    if (bot.hp <= 0) break;
    // Harcèlement non létal : pas de regen en vol, la réparation au portail
    // est réellement observée (sinon il arrive full et repart aussitôt).
    if (bot.jpcMode !== "repair" && bot.hp > 1) bot.hp = Math.max(1, bot.hp - bot.hpMax * 0.0005);
    if (bot.jpcMode === "flee") sawFlee = true;
    if (bot.jpcMode === "repair") {
      sawRepair = true;
      // Comme le bot du joueur : réparation près du centre, pas au bord.
      if (repairDist == null) repairDist = Math.hypot(bot.x - 9000, bot.y - 5000);
    }
    if ((sawFlee || sawRepair) && bot.jpcMode === "farm"
      && (bot.hp + bot.sh) / (bot.hpMax + bot.shMax) > 0.99) { repaired = true; break; }
  }
  assert.ok(sawFlee || sawRepair, "fuite vers le portail");
  assert.equal(repaired, true, "réparé puis retour au farm");
  assert.ok(repairDist != null && repairDist < 200, `réparation près du centre (${repairDist?.toFixed(0)}m)`);
});

test("multi natif : roster déterministe (mêmes bots à chaque démarrage)", () => {
  const world = { w: 10000, h: 6000 };
  // Époque figée : deux builds de la même heure sont identiques (sans ça le
  // test serait flaky à chaque changement d'heure).
  const epoch = 1726000000000;
  const a = buildJpcRoster("1-2", world, [], [], epoch);
  const b = buildJpcRoster("1-2", world, [], [], epoch);
  assert.deepEqual(a, b, "deux builds identiques");
  assert.ok(a.length >= 2 && a.length <= 6, `2-6 bots en 1-2 (n=${a.length})`);
  const bl = buildJpcRoster("1-bl", world, [], [], epoch);
  assert.ok(bl.length >= 4 && bl.length <= 8, `4-8 bots en BL (n=${bl.length})`);
  const c = buildJpcRoster("3-8", world, [], [], epoch);
  assert.notDeepEqual(a, c, "roster différent par map");
  assert.equal(buildJpcRoster("4-2", world, [], [], epoch).length, 0, "4-2 exclu");
  assert.equal(buildJpcRoster("alpha", world, [], [], epoch).length, 0, "gate exclue");
  const pseudos = a.map((d) => d.pseudo);
  assert.equal(new Set(pseudos).size, pseudos.length, "pseudos uniques");
  assert.ok(pseudos.every((p) => /^[A-Za-z][A-Za-z0-9_]{1,31}$/.test(p) && !p.startsWith("JPC")), "pseudos JPC_XY");
  for (const d of a) {
    assert.match(d.type, /^npc_Jpc_[a-z_]+$/, "type coque");
    assert.ok(d.hpMax > 0 && d.shMax > 0 && d.bulletDmg > 0, "stats positives");
    assert.ok(d.drones.count >= 2 && d.drones.count <= 10, "drones 2-10");
    assert.ok(!/admin|hermes|saturn/i.test(d.drones.designs.join(",")), "havoc/hercules/mix");
    assert.ok(typeof hashMapSeed("x") === "number", "seed numérique");
  }
  const t0ships = new Set(JPC_TIERS[tierForMap("1-2")].ships);
  assert.ok(a.every((d) => t0ships.has(jpcBaseHull(d.shipId))), "coques du tier de la map (designs inclus)");
});

test("rotation horaire : le nombre de JPC change toutes les heures", () => {
  const world = { w: 10000, h: 6000 };
  // Buckets : heures UTC entières.
  assert.equal(jpcHourBucket(3600000), 1);
  assert.equal(jpcHourBucket(3600000 + 1000), 1);
  assert.equal(jpcHourBucket(7200000), 2);
  assert.equal(jpcRosterCount("4-2", 1726000000000), 0, "map exclue = 0");
  // Le nombre varie selon l'heure (2-6, 4-8 en BL), sans redémarrage.
  const counts = new Set();
  const blCounts = new Set();
  const HB = 479444 * 3600000; // début d'heure exacte (pas de chevauchement).
  for (let h = 0; h < 24; h++) {
    const n = jpcRosterCount("1-2", HB + h * 3600000);
    assert.ok(n >= 2 && n <= 6, `heure ${h} : 2-6 (n=${n})`);
    counts.add(n);
    const b = jpcRosterCount("1-bl", HB + h * 3600000);
    assert.ok(b >= 4 && b <= 8, `BL heure ${h} : 4-8 (n=${b})`);
    blCounts.add(b);
  }
  assert.ok(counts.size > 1, `le nombre change selon l'heure (${[...counts].join("/")})`);
  // Même heure = même roster (tous les joueurs voient pareil).
  assert.deepEqual(
    buildJpcRoster("1-2", world, [], [], HB),
    buildJpcRoster("1-2", world, [], [], HB + 3599999),
    "même heure = même roster",
  );
});

test("serveur : proie d'un JPC vivant = pas de récompense, libérée à sa mort", () => {
  const { sim, bots, prey } = controlledSim();
  const [bot, other] = bots;
  other.hp = 0; // bot isolé.
  sim.setPlayer("hunter", 1400, 3000);
  // Le JPC farme la proie : revendiquée (grise, pas de récompense partagée).
  bot.jpcPreyUid = prey.uid;
  bot.jpcMode = "farm";
  assert.equal(sim.jpcPreyClaimed(prey.uid), true, "proie revendiquée");
  assert.equal(sim.jpcPreyClaimed("nope"), false, "inconnue = libre");
  // Le joueur la tue pendant le farm : tueur vide = mort silencieuse.
  sim.applyHit("hunter", { uid: prey.uid, dmg: 5e7 });
  const dead = sim.entries.get(prey.uid);
  assert.ok(!(dead.hp > 0), "proie tuée");
  assert.equal(dead.killer, "", "pas de tueur (pas de récompense partagée)");
  assert.equal(sim.deaths[sim.deaths.length - 1].killer, "", "journal sans tueur");
  // Le joueur tue le JPC : la suivante est rouge (récompense normale).
  sim.jpcKillBot(bot, Date.now());
  assert.equal(sim.jpcPreyClaimed(prey.uid), false, "proie libérée");
  const prey2Uid = "prey2";
  sim.entries.set(prey2Uid, { uid: prey2Uid, type: "npc_Streuner", x: 1400, y: 3000,
    hp: 1000000, sh: 0, hpMax: 1000000, shMax: 0, speed: 0, spread: 0.8, canShoot: false, r: 18,
    aggroHoldMs: 3500, firstBy: null, lastHitBy: null, lockBy: null, lockHitAt: 0, lockReleaseAt: 0, seq: 1 });
  sim.applyHit("hunter", { uid: prey2Uid, dmg: 5e7 });
  assert.equal(sim.entries.get(prey2Uid).killer, "hunter", "tueur normal après libération");
});

test("solo : MISS du JPC écrit sur le NPC locké (pas de MISS sans lock)", () => {
  const { ctx, enemies } = makeCtx("1-1", { withNpcs: false });
  const dt = 1 / 60;
  let bot = null;
  for (let f = 0; f < 60 * 20 && !bot; f++) {
    tickJpcSystem(dt, ctx);
    bot = enemies.find((e) => e?.isJpcBot && e.hp > 0);
  }
  assert.ok(bot, "bot spawné");
  const prey = { id: nextId++, type: "npc_Streuner", x: bot.x + 300, y: bot.y, hp: 1e6, hpMax: 1e6 };
  enemies.push(prey);
  let farmer = null;
  for (let f = 0; f < 60 && !farmer; f++) {
    tickJpcSystem(dt, ctx);
    farmer = enemies.find((e) => e?.isJpcBot && e.hp > 0 && e.jpcFarmId === prey.id);
  }
  assert.ok(farmer, "cible acquise par un bot");
  bot = farmer;
  bot.jpcIshCd = 9999;
  const misses = [];
  ctx.npcJpcMissFloat = (t) => { misses.push(t.id); };
  // Pas locké : aucun MISS écrit (comme les chiffres de dégâts).
  for (let f = 0; f < 5; f++) {
    prey.x = bot.x + 300; prey.y = bot.y;
    bot.jpcShootT = 0; bot.jpcRocketCd = 0;
    tickJpcSystem(dt, ctx);
  }
  assert.equal(misses.length, 0, "pas de MISS sans lock");
  // Locké : les ratés s'écrivent (maladresse 30 % en 1-1, lasers + roquettes).
  ctx.lockedId = prey.id;
  for (let f = 0; f < 60 && misses.length === 0; f++) {
    prey.x = bot.x + 300; prey.y = bot.y;
    bot.jpcShootT = 0; bot.jpcRocketCd = 0;
    tickJpcSystem(dt, ctx);
  }
  assert.ok(misses.length > 0, "MISS écrit sur le NPC locké");
  assert.ok(misses.every((id) => id === prey.id), "que sur la cible lockée");
});

test("serveur : MISS farm transmis aux visuels (locké = MISS écrit)", () => {
  const { sim, bots, prey } = controlledSim();
  const [bot, other] = bots;
  other.hp = 0;
  sim.setPlayer("spectator", 1500, 3000);
  bot.jpcPreyUid = prey.uid;
  bot.jpcMode = "farm";
  // Lasers : volée ratée → shotFx avec miss (canal des tirs alliés).
  sim.jpcStartVolley(bot, prey.uid, false, 100000, "x1", true);
  sim.jpcTickVisuals(bot, 100000 + 2000);
  const fx = sim.drainShotFx();
  assert.ok(fx.length > 0, "visuels émis");
  assert.ok(fx.every((s) => s.miss === true), "MISS transmis aux visuels lasers");
  // Volée normale : pas de MISS (comportement inchangé).
  sim.jpcStartVolley(bot, prey.uid, false, 200000);
  sim.jpcTickVisuals(bot, 200000 + 2000);
  assert.ok(sim.drainShotFx().every((s) => s.miss !== true), "pas de MISS sans raté");
  // Roquettes : le raté finit dans le rshot (maladresse ~28 % en 1-2).
  let sawMiss = false;
  for (let i = 0; i < 60 && !sawMiss && prey.hp > 0; i++) {
    sim.jpcFireRocket(bot, prey, false, Date.now());
    sawMiss = sim.drainRocketFx().some((r) => r.miss === true);
  }
  assert.ok(sawMiss, "MISS transmis au rshot farm");
});

test("serveur : nouvelle heure = renforts si ça monte, pas de respawn si ça baisse", () => {
  const { sim } = controlledSim(); // 2 bots, cible suivra.
  const aliveCount = () => [...sim.entries.values()].filter((e) => e?.jpc === true && e.hp > 0).length;
  const h0 = 479444 * 3600000; // début d'heure exacte.
  sim.jpcBucket = jpcHourBucket(h0);
  sim.jpcTarget = 2;
  // Heure suivante : la cible devient le nombre seedé de la nouvelle heure.
  const h1 = (jpcHourBucket(h0) + 1) * 3600000 + 1000;
  const want = jpcRosterCount("1-2", h1);
  assert.ok(want >= 2, `la nouvelle heure veut ${want} bots`);
  sim.jpcApplyHourBucket(h1);
  assert.equal(sim.jpcTarget, want, "cible = roster de la nouvelle heure");
  assert.equal(aliveCount(), want, "renforts immédiats (que des uids uniques)");
  assert.equal(new Set([...sim.entries.values()].filter((e) => e?.jpc).map((e) => e.uid)).size,
    [...sim.entries.values()].filter((e) => e?.jpc).length, "uids uniques");
  // Baisse : on force une cible basse, les morts restent morts (convergence
  // naturelle), les vivants ne disparaissent pas. L'heure réelle est figée
  // pour que tick() ne déclenche pas une autre rotation entre-temps.
  sim.jpcTarget = 1;
  sim.jpcBucket = jpcHourBucket(Date.now());
  const victim = [...sim.entries.values()].find((e) => e?.jpc === true && e.hp > 0);
  sim.jpcKillBot(victim, Date.now());
  victim.jpcRespawnAt = Date.now() - 1000; // 90 s déjà écoulées.
  sim.tick(0.05);
  assert.ok(!(victim.hp > 0), "pas de respawn au-delà de la cible horaire");
  assert.equal(aliveCount(), want - 1, "les vivants restent");
  // Remontée : le respawn reprend sous la cible.
  sim.jpcTarget = want;
  victim.jpcRespawnAt = Date.now() - 1000;
  sim.tick(0.05);
  assert.ok(victim.hp > 0, "respawn normal sous la cible");
});

test("multi natif : la sim serveur spawne, farme et réplique les JPC", () => {
  ensureJpcTypes();
  const world = { w: 10000, h: 6000 };
  const camps = [
    { id: 1, type: "npc_Streuner", x: 5000, y: 3000, aggroRange: 700, respawn: 0, maxAlive: 3 },
  ];
  const sim = new ZoneNpcSim("1-2", world, camps, null);
  sim.safe = [{ x: 9000, y: 5000, r: 500 }];
  sim.walls = [];
  const now = Date.now();
  sim.spawnJpcRoster(buildJpcRoster("1-2", world, sim.safe, []), now);
  const bots = [...sim.entries.values()].filter((e) => e.jpc === true);
  assert.ok(bots.length >= 2 && bots.length <= 6, `roster spawné (n=${bots.length})`);
  assert.ok(bots.every((e) => e.hp === e.hpMax && e.aggroRange === 0), "full vie, pas d'aggro proximité");
  // Un joueur + quelques ticks : les bots bougent, le snapshot les expose.
  sim.setPlayer("u_test", 1000, 1000, { dead: false, safe: false });
  const before = bots.map((e) => ({ uid: e.uid, x: e.x, y: e.y }));
  for (let i = 0; i < 40; i++) sim.tick(0.05);
  let moved = 0;
  for (const { uid, x, y } of before) {
    const e = sim.entries.get(uid);
    if (e && (Math.abs(e.x - x) > 1 || Math.abs(e.y - y) > 1)) moved++;
  }
  assert.ok(moved > 0, "les bots se déplacent côté serveur");
  const snap = sim.snapshot();
  const jpcSnaps = snap.list.filter((s) => s.jpc === 1);
  assert.equal(jpcSnaps.length, bots.filter((e) => e.hp > 0).length, "tous répliqués");
  for (const s of jpcSnaps) {
    assert.match(String(s.type), /^npc_Jpc_/, "type coque transmis");
    assert.match(String(s.jpPseudo), /^[A-Za-z][A-Za-z0-9_]{1,31}$/, "pseudo transmis");
    assert.ok(Number(s.jpDrones) >= 2, "drones transmis");
    assert.ok(typeof s.jpForm === "string", "formation transmise");
  }
  // Le joueur tape un bot : aggro de riposte, pas d'aggro spontanée.
  const target = bots.find((e) => e.hp > 0);
  sim.setPlayer("u_test", target.x + 100, target.y, { dead: false, safe: false });
  sim.applyHit("u_test", { uid: target.uid, dmg: 1000, pen: 0 });
  assert.equal(String(target.aggroBy), "u_test", "riposte ciblée sur l'agresseur");
  assert.equal(String(target.firstBy), "u_test", "lock premier attaquant");
  // ISH serveur : dégâts ignorés.
  target.jpcIshUntil = Date.now() + 60000;
  const hpBefore = target.hp;
  sim.applyHit("u_test", { uid: target.uid, dmg: 50000, pen: 0 });
  assert.equal(target.hp, hpBefore, "ISH bloque les dégâts serveur");
  target.jpcIshUntil = 0;
});

test("multi natif : le farm JPC tue sans créditer aucun joueur", () => {
  ensureJpcTypes();
  const world = { w: 10000, h: 6000 };
  const sim = new ZoneNpcSim("1-2", world, [], null);
  sim.safe = [];
  sim.walls = [];
  const now = Date.now();
  sim.spawnJpcRoster(buildJpcRoster("1-2", world, [], []).slice(0, 1), now);
  const bot = [...sim.entries.values()].find((e) => e.jpc === true);
  // Proie faible collée au bot.
  const preyUid = "1-2#testprey";
  sim.entries.set(preyUid, {
    uid: preyUid, campId: 999, type: "npc_Streuner",
    x: bot.x + 50, y: bot.y, angle: 0,
    hp: 500, sh: 0, hpMax: 800, shMax: 400,
    speed: 270, dr: 0, spread: 0.8, r: 18,
    passive: false, kamikaze: false, canShoot: false, shootRange: 0, shootRate: 0,
    bulletDmg: 0, burst: 1, shootCd: 0, aggroRange: 0, aggroHoldMs: 3500,
    aggroBy: null, aggroUntil: 0, tx: null, ty: null, killer: null,
    firstBy: null, lastHitBy: null, lockBy: null, lockHitAt: 0, lockReleaseAt: 0, hitHist: [],
    orbitDir: 1, orbitT: 2, seq: 1,
  });
  for (let i = 0; i < 20 * 60 && sim.entries.get(preyUid)?.hp > 0; i++) {
    // Timers muraux gelés en fast-loop : on réarme à chaque tick (le MISS
    // peut aussi faire rater un tir).
    bot.jpcShootT = 0; bot.jpcRocketAt = 0;
    sim.tick(0.05);
  }
  const prey = sim.entries.get(preyUid);
  assert.ok(!(prey.hp > 0), "la proie meurt sous le farm JPC");
  assert.equal(prey.killer, "", "aucun tueur joueur (pas de récompense)");
  const death = sim.deaths.find((d) => d.uid === preyUid);
  assert.ok(death, "mort journalisée");
  assert.equal(death.killer, "", "journal sans tueur joueur");
  assert.ok(!String(death.killer || "").startsWith("u_"), "filtrée par queueNpcDeaths");
});

test("multi natif : création sim map réelle 1-2 avec roster JPC", async () => {
  const sim = await ZoneNpcSim.create("1-2", null);
  assert.ok(sim, "sim créée");
  const bots = [...sim.entries.values()].filter((e) => e.jpc === true);
  assert.ok(bots.length >= 2 && bots.length <= 6, `roster natif (n=${bots.length})`);
  assert.ok(bots.every((e) => e.hp === e.hpMax), "full vie au spawn");
  const snap = sim.snapshot();
  assert.ok(snap.list.filter((s) => s.jpc === 1).length === bots.length, "snapshot complet");
  const gated = await ZoneNpcSim.create("alpha", null);
  assert.ok(!gated || [...gated.entries.values()].filter((e) => e.jpc === true).length === 0, "pas de JPC en gate");
});

test("ciblage NPC : le bot le plus proche, hors safe, dans la portée", () => {  const npc = { hp: 100, x: 0, y: 0 };
  const enemies = [
    { isJpcBot: true, hp: 100, x: 500, y: 0, id: 1 },
    { isJpcBot: true, hp: 100, x: 200, y: 0, id: 2 },
    { isJpcBot: true, hp: 0, x: 50, y: 0, id: 3 },
    { hp: 100, x: 10, y: 0, id: 4 },
  ];
  assert.equal(findJpcPreyForNpc(npc, enemies, 700, () => false)?.id, 2, "le plus proche vivant");
  assert.equal(findJpcPreyForNpc(npc, enemies, 100, () => false), null, "hors portée");
  assert.equal(findJpcPreyForNpc(npc, enemies, 700, (j) => j.id === 2)?.id, 1, "safe ignoré");
  assert.equal(findJpcPreyForNpc({ hp: 0, x: 0, y: 0 }, enemies, 700), null, "NPC mort");
});

test("serveur : dégâts NPC→JPC remontés au feed (chiffres sur le locké)", () => {
  ensureJpcTypes();
  const world = { w: 10000, h: 6000 };
  const sim = new ZoneNpcSim("1-2", world, [], null);
  sim.safe = [];
  sim.walls = [];
  sim.spawnJpcRoster(buildJpcRoster("1-2", world, [], []).slice(0, 1), Date.now());
  const bot = [...sim.entries.values()].find((e) => e.jpc === true);
  const npcUid = "1-2#testnpc3";
  sim.entries.set(npcUid, {
    uid: npcUid, campId: 999, type: "npc_Streuner",
    x: bot.x + 300, y: bot.y, angle: 0,
    hp: 80000, sh: 40000, hpMax: 80000, shMax: 40000,
    speed: 270, dr: 0, spread: 0.8, r: 18,
    passive: false, kamikaze: false, canShoot: true, shootRange: 500, shootRate: 1,
    bulletDmg: 20, burst: 1, shootCd: 0, aggroRange: 700, aggroHoldMs: 3500,
    aggroBy: null, aggroUntil: 0, tx: null, ty: null, killer: null,
    firstBy: null, lastHitBy: null, lockBy: null, lockHitAt: 0, lockReleaseAt: 0, hitHist: [],
    orbitDir: 1, orbitT: 2, seq: 1,
  });
  const hpBefore = bot.hp;
  sim.setPlayer("u_test", bot.x + 2000, bot.y, { dead: false, safe: false });
  for (let i = 0; i < 20 * 10; i++) {
    sim.tick(0.05);
    if (!(sim.entries.get(bot.uid)?.hp > 0)) break;
  }
  assert.ok(bot.hp < hpBefore, "le NPC blesse le bot");
  const entry = sim.snapshot().dmg.find((d) => String(d.uid) === String(bot.uid));
  assert.ok(entry, "feed dégâts pour le bot");
  assert.ok(Number(entry.total) > 0, "total positif");
  assert.equal(String(entry.by), npcUid, "tireur = le NPC");
});

test("multi natif : un NPC aggro un JPC comme un vrai joueur (poursuite + tirs rouges)", () => {
  ensureJpcTypes();
  const world = { w: 10000, h: 6000 };
  const sim = new ZoneNpcSim("1-2", world, [], null);
  sim.safe = [];
  sim.walls = [];
  const now = Date.now();
  sim.spawnJpcRoster(buildJpcRoster("1-2", world, [], []).slice(0, 1), now);
  const bot = [...sim.entries.values()].find((e) => e.jpc === true);
  // NPC classique à portée, aucun joueur sur la map.
  const npcUid = "1-2#testnpc";
  sim.entries.set(npcUid, {
    uid: npcUid, campId: 999, type: "npc_Streuner",
    x: bot.x + 300, y: bot.y, angle: 0,
    hp: 80000, sh: 40000, hpMax: 80000, shMax: 40000,
    speed: 270, dr: 0, spread: 0.8, r: 18,
    passive: false, kamikaze: false, canShoot: true, shootRange: 500, shootRate: 1,
    bulletDmg: 20, burst: 1, shootCd: 0, aggroRange: 700, aggroHoldMs: 3500,
    aggroBy: null, aggroUntil: 0, tx: null, ty: null, killer: null,
    firstBy: null, lastHitBy: null, lockBy: null, lockHitAt: 0, lockReleaseAt: 0, hitHist: [],
    orbitDir: 1, orbitT: 2, seq: 1,
  });
  const hpBefore = bot.hp;
  let chased = false;
  // Un joueur spectateur à 2000 (voit les visuels, hors aggro 700).
  sim.setPlayer("u_test", bot.x + 2000, bot.y, { dead: false, safe: false });
  for (let i = 0; i < 20 * 10; i++) {
    sim.tick(0.05);
    const npc = sim.entries.get(npcUid);
    if (npc && npc.chaseId === bot.uid) chased = true;
    if (!(sim.entries.get(bot.uid)?.hp > 0)) break;
  }
  const npc = sim.entries.get(npcUid);
  assert.ok(chased, "le NPC poursuit le bot (chaseId)");
  assert.ok(bot.hp < hpBefore, "le NPC blesse le bot");
  const fx = sim.drainShotFx().filter((s) => s.npc === true);
  // (drainé après le tick : on revérifie sur de nouveaux ticks)
  for (let i = 0; i < 20 * 3; i++) sim.tick(0.05);
  const fx2 = sim.drainShotFx().filter((s) => s.npc === true);
  assert.ok(fx.length + fx2.length > 0, "visuels rouges émis (shotFx npc)");
  assert.ok([...fx, ...fx2].every(shot => shot.npcType === "npc_Streuner"), "type du tireur transmis pour sa munition native");
  void npc;
});

test("multi natif : celui qui tape a la priorité (passant ignoré, tireur servi)", () => {
  ensureJpcTypes();
  const world = { w: 10000, h: 6000 };
  const sim = new ZoneNpcSim("1-2", world, [], null);
  sim.safe = [];
  sim.walls = [];
  sim.spawnJpcRoster(buildJpcRoster("1-2", world, [], []).slice(0, 1), Date.now());
  const bot = [...sim.entries.values()].find((e) => e.jpc === true);
  const npcUid = "1-2#testnpc2";
  sim.entries.set(npcUid, {
    uid: npcUid, campId: 999, type: "npc_Streuner",
    x: bot.x + 300, y: bot.y, angle: 0,
    hp: 80000, sh: 40000, hpMax: 80000, shMax: 40000,
    speed: 270, dr: 0, spread: 0.8, r: 18,
    passive: false, kamikaze: false, canShoot: true, shootRange: 500, shootRate: 1,
    bulletDmg: 20, burst: 1, shootCd: 0, aggroRange: 700, aggroHoldMs: 3500,
    aggroBy: null, aggroUntil: 0, tx: null, ty: null, killer: null,
    firstBy: null, lastHitBy: null, lockBy: null, lockHitAt: 0, lockReleaseAt: 0, hitHist: [],
    orbitDir: 1, orbitT: 2, seq: 1,
  });
  // Le bot blesse le NPC (provocation), un joueur idle est PLUS PRÈS.
  const npc = sim.entries.get(npcUid);
  npc.jpcAggroUid = bot.uid;
  npc.jpcAggroUntil = Date.now() + 60000;
  sim.setPlayer("u_idle", npc.x + 100, npc.y, { dead: false, safe: false });
  for (let i = 0; i < 20; i++) sim.tick(0.05);
  assert.equal(sim.entries.get(npcUid).chaseId, bot.uid, "le bot qui tape garde l'aggro (passant ignoré)");
  // Le joueur tire à son tour : il prend l'aggro (damager frais).
  sim.applyHit("u_idle", { uid: npcUid, dmg: 10, pen: 0 });
  for (let i = 0; i < 5; i++) sim.tick(0.05);
  assert.equal(sim.entries.get(npcUid).chaseId, "u_idle", "le tireur joueur reprend l'aggro");
});

test("cible collante : le bot finit sa cible avant de changer", () => {
  const { ctx, enemies } = makeCtx("1-2");
  const dt = 1 / 60;
  let bot = null;
  for (let f = 0; f < 60 * 20 && !bot; f++) {
    tickJpcSystem(dt, ctx);
    bot = enemies.find((e) => e?.isJpcBot && e.jpcFarmId != null);
  }
  assert.ok(bot, "bot avec cible");
  const first = bot.jpcFarmId;
  // La cible reste valide plusieurs secondes : pas de switch.
  for (let f = 0; f < 60 * 5; f++) {
    tickJpcSystem(dt, ctx);
    const t = enemies.find((e) => e && e.id === first);
    if (!t || !(t.hp > 0)) break;
  }
  const still = enemies.find((e) => e && e.id === first);
  if (still && still.hp > 0) assert.equal(bot.jpcFarmId, first, "cible conservée");
});

test("exclusions : cibles distinctes, cible gardée au lock (gris), pas de vol", () => {
  const { ctx, enemies } = makeCtx("1-2", { withNpcs: false });
  const dt = 1 / 60;
  for (let f = 0; f < 60 * 20 && enemies.filter(e => e.isJpcBot).length < 2; f++) tickJpcSystem(dt, ctx);
  const bots = enemies.filter(e => e.isJpcBot);
  assert.equal(bots.length, 2);
  bots.forEach((bot, i) => Object.assign(bot, { x: 1000 + i * 100, y: 3000 }));
  for (let i = 0; i < 3; i++) enemies.push({
    id: nextId++, type: "npc_Streuner", hp: 1e6, hpMax: 1e6, x: 1300 + i * 50, y: 3000,
  });
  tickJpcSystem(dt, ctx);
  assert.ok(bots.every(bot => bot.jpcFarmId != null));
  // Deux bots ne partagent jamais la même cible.
  const ids = bots.map((b) => b.jpcFarmId);
  assert.equal(new Set(ids).size, ids.length, "cibles distinctes");
  // Le joueur locke la cible du premier bot : il la GARDE (lock gris,
  // comme un vrai joueur). Un bot SANS cible, lui, ne vole jamais la cible
  // lockée du joueur pour ses nouvelles cibles.
  const victim = bots[0];
  const kept = victim.jpcFarmId;
  ctx.lockedId = kept;
  for (let f = 0; f < 30; f++) tickJpcSystem(dt, ctx);
  assert.equal(victim.jpcFarmId, kept, "cible gardée malgré le lock joueur (gris)");
  const thief = bots[1];
  thief.jpcFarmId = null;
  thief.jpcPostKillScanT = 0;
  ctx.lockedId = enemies.find((e) => !e.isJpcBot && e.id !== kept).id;
  for (let f = 0; f < 30; f++) tickJpcSystem(dt, ctx);
  assert.notEqual(thief.jpcFarmId, ctx.lockedId, "nouvelle cible du joueur non volée");
});

test("formations cohérentes : attaque / fuite / voyage, rien en réparation", () => {
  // Unit : chaque rôle pioche dans sa poche, jamais d'anti-synergie.
  for (const tier of JPC_TIERS) {
    for (const role of ["farm", "riposte", "flee", "travel"]) {
      const f = rollJpcFormation(tier.forms, role, 8);
      assert.ok(JPC_ROLE_FORMS[role].includes(f) || f === "standard", `${role}: ${f}`);
      assert.equal(rollJpcFormation(tier.forms, role, 2), "standard", `${role} <4 drones = standard`);
    }
  }
  // Farm : jamais de formation qui plombe les lasers (veteran/dome/ring),
  // ni roquettes/mines/PvP (arrow/chevron/pincer), ni défensives molles.
  for (const tier of JPC_TIERS) {
    for (let i = 0; i < 30; i++) {
      const f = rollJpcFormation(tier.forms, "farm", 8);
      assert.ok(!["veteran", "dome", "ring", "pincer", "chevron", "arrow", "turtle", "wheel"].includes(f), `farm jamais ${f}`);
    }
  }
  // Fuite : jamais de malus vitesse (crab/ring/bat/dome/drill).
  for (const tier of JPC_TIERS) {
    for (let i = 0; i < 30; i++) {
      const f = rollJpcFormation(tier.forms, "flee", 8);
      assert.ok(!["crab", "ring", "bat", "dome", "drill"].includes(f), `fuite jamais ${f}`);
    }
  }
  // Roster serveur : préférences par rôle présentes et déterministes.
  const world = { w: 10000, h: 6000 };
  for (const d of buildJpcRoster("3-8", world, [], [])) {
    for (const role of ["farm", "riposte", "flee", "travel"]) {
      assert.ok(JPC_ROLE_FORMS[role].includes(d.forms[role]) || d.forms[role] === "standard", `roster ${role}: ${d.forms[role]}`);
    }
  }
  // Intégration solo : la formation suit l'état du bot.
  const { ctx, enemies } = makeCtx("2-3", { withNpcs: false });
  const dt = 1 / 60;
  for (let f = 0; f < 60 * 5; f++) tickJpcSystem(dt, ctx);
  const bot = enemies.find((e) => e?.isJpcBot && e.hp > 0);
  assert.ok(bot, "bot spawné");
  bot.droneCfg.count = 8;
  bot.jpcForms = rollJpcFormSet(JPC_TIERS[1].forms, 8);
  // Patrouille (aucune proie) → voyage.
  bot.droneCfg.formation = "turtle";
  bot.jpcMode = "farm";
  bot.jpcFarmId = null;
  for (let f = 0; f < 30; f++) tickJpcSystem(dt, ctx);
  assert.equal(bot.droneCfg.formation, bot.jpcForms.travel, "patrouille = voyage");
  // Proie à portée → attaque.
  const prey = { id: nextId++, type: "npc_Streuner", x: bot.x + 300, y: bot.y, hp: 1e6, hpMax: 1e6, shootRange: 0 };
  enemies.push(prey);
  for (let f = 0; f < 30; f++) tickJpcSystem(dt, ctx);
  assert.equal(bot.jpcFarmId, prey.id, "cible acquise");
  assert.equal(bot.droneCfg.formation, bot.jpcForms.farm, "combat = attaque");
  // Coque critique → fuite (20 % < seuil min 25 % : déterministe).
  prey.hp = 0;
  bot.hp = bot.hpMax * 0.2;
  bot.sh = bot.shMax;
  bot.jpcIshCd = 9999;
  for (let f = 0; f < 30; f++) tickJpcSystem(dt, ctx);
  assert.equal(bot.jpcMode, "flee", "en fuite");
  assert.equal(bot.droneCfg.formation, bot.jpcForms.flee, "fuite = fuite");
});

test("BL : farm à ~200k par tir (×18), maps normales ×1", () => {
  assert.equal(jpcFarmDmgMult("1-bl"), 18);
  assert.equal(jpcFarmDmgMult("2-BL"), 18);
  assert.equal(jpcFarmDmgMult("1-8"), 1);
  assert.equal(jpcFarmDmgMult("5-2"), 1);
  // Solo : proie 100k HP vite tuée en BL (malgré les MISS), vivante en 1-2.
  for (const [map, dead] of [["1-bl", true], ["1-2", false]]) {
    const t = makeCtx(map, { withNpcs: false });
    for (let f = 0; f < 60 * 5; f++) tickJpcSystem(1 / 60, t.ctx);
    const b = t.enemies.find((e) => e?.isJpcBot && e.hp > 0);
    assert.ok(b, `bot ${map}`);
    b.jpcShootT = 0;
    b.jpcRocketCd = 0;
    b.jpcIshCd = 9999;
    const prey = { id: nextId++, type: "npc_Streuner", x: b.x + 300, y: b.y, hp: 100000, hpMax: 100000 };
    t.enemies.push(prey);
    if (dead) {
      for (let f = 0; f < 40 && prey.hp > 0; f++) {
        b.jpcShootT = 0; b.jpcRocketCd = 0;
        tickJpcSystem(0.05, t.ctx);
      }
    } else {
      for (let f = 0; f < 10; f++) tickJpcSystem(0.05, t.ctx);
    }
    assert.equal(!(prey.hp > 0), dead, `proie 100k ${map} : tuée=${dead}`);
  }
  // Serveur : même bonus via jpcMove.
  const world = { w: 10000, h: 6000 };
  const sim = new ZoneNpcSim("1-bl", world, [], null);
  sim.safe = [];
  sim.walls = [];
  sim.spawnJpcRoster(buildJpcRoster("1-bl", world, [], []).slice(0, 1), Date.now());
  const bot = [...sim.entries.values()].find((e) => e.jpc === true);
  const preyUid = "1-bl#blprey";
  sim.entries.set(preyUid, {
    uid: preyUid, campId: 999, type: "npc_Streuner",
    x: bot.x + 50, y: bot.y, angle: 0,
    hp: 100000, sh: 0, hpMax: 100000, shMax: 0,
    speed: 270, dr: 0, spread: 0.8, r: 18,
    passive: false, kamikaze: false, canShoot: false, shootRange: 0, shootRate: 0,
    bulletDmg: 0, burst: 1, shootCd: 0, aggroRange: 0, aggroHoldMs: 3500,
    aggroBy: null, aggroUntil: 0, tx: null, ty: null, killer: null,
    firstBy: null, lastHitBy: null, lockBy: null, lockHitAt: 0, lockReleaseAt: 0, hitHist: [],
    orbitDir: 1, orbitT: 2, seq: 1,
  });
  for (let i = 0; i < 40 && sim.entries.get(preyUid)?.hp > 0; i++) {
    // Timers muraux gelés en fast-loop : on réarme à chaque tick.
    bot.jpcShootT = 0; bot.jpcRocketAt = 0;
    sim.tick(0.05);
  }
  assert.ok(!(sim.entries.get(preyUid)?.hp > 0), "proie 100k tuée en BL côté serveur");
});

test("roquettes : standards valides par tier, dégâts scalés, sans effets", () => {
  assert.equal(JPC_ROCKET_STD.length, 4);
  assert.deepEqual(JPC_ROCKET_DMG_MULT, [1, 2, 4, 8]);
  for (let t = 0; t < 4; t++) {
    assert.deepEqual([...JPC_ROCKET_STD[t]].sort(), ["plt2021", "plt2026"], `T${t} : PLT-2021 ou PLT-2026`);
    for (const id of JPC_ROCKET_STD[t]) {
      const def = ROCKET_TYPES[id];
      assert.ok(def, `standard ${id} existe`);
      assert.notEqual(def.manual, false, `${id} tirage manuel (pas de lance-roquettes)`);
    }
    const r = rollJpcRockets(t, () => 0.99);
    assert.ok(JPC_ROCKET_STD[t].includes(r.standard));
    assert.equal(r.launcher, undefined, "plus de lance-roquettes");
  }
  assert.equal(jpcRocketDamage("r310", 0), 1000);
  assert.equal(jpcRocketDamage("plt3030", 2), 24000);
  assert.equal(jpcRocketDamage("agt500", 3), 200000);
  assert.equal(jpcRocketDamage("hstrm01", 3), 32000);
  assert.equal(jpcRocketDamage("nope", 1), 2000);
});

test("roquettes solo : standard 1/s en arc fumant, dégâts directs", () => {
  const { ctx, enemies } = makeCtx("2-3", { withNpcs: false });
  const dt = 1 / 60;
  let bot = null;
  for (let f = 0; f < 60 * 20 && !bot; f++) {
    tickJpcSystem(dt, ctx);
    bot = enemies.find((e) => e?.isJpcBot && e.hp > 0);
  }
  assert.ok(bot, "bot spawné");
  assert.ok(bot.jpcRockets?.standard, "roquette standard");
  ctx.addCappedProjectile = (arr, p) => { arr.push(p); };
  const prey = { id: nextId++, type: "npc_Streuner", x: bot.x + 300, y: bot.y, hp: 1e6, hpMax: 1e6 };
  enemies.push(prey);
  for (let f = 0; f < 10; f++) tickJpcSystem(dt, ctx);
  assert.equal(bot.jpcFarmId, prey.id, "cible acquise");
  // Standard seule, toutes les secondes comme les vrais joueurs.
  // Le tir peut rater (maladresse) : on boucle jusqu'au premier impact.
  bot.jpcShootT = 9999;
  ctx.enemyBullets.length = 0;
  const expected = jpcRocketDamage(bot.jpcRockets.standard, bot.jpcTier ?? 1);
  let dealt = 0, shot = null;
  for (let f = 0; f < 10 && dealt <= 0; f++) {
    bot.jpcRocketCd = 0;
    ctx.enemyBullets.length = 0;
    const hpBefore = prey.hp;
    tickJpcSystem(dt, ctx);
    dealt = hpBefore - prey.hp;
    shot = ctx.enemyBullets.find((b) => b.isRocket === true);
  }
  assert.ok(dealt >= expected * 0.89 && dealt <= expected * 1.11, `roquette ${dealt} ≈ ${expected}`);
  assert.ok(shot, "1 visuel standard");
  assert.equal(shot.key, bot.jpcRockets.standard);
  assert.equal(shot.dmg, 0, "visuel seul (dégâts déjà appliqués)");
  assert.equal(shot.target, "npc");
  assert.ok(Number.isFinite(shot.arcKick0) && shot.arcKick0 !== 0, "arc en C");
  assert.ok(Number.isFinite(shot.smokeHue), "fumée colorée");
  assert.equal(shot.rocketEffect, undefined, "aucun effet spécial");
  assert.equal(shot.miss, false, "jamais de MISS sur visuel");
  // Cadence 1 s (dt = 1/60 ici) : rien tout de suite, une 2e au bout d'une seconde.
  bot.jpcRocketCd = 1;
  ctx.enemyBullets.length = 0;
  tickJpcSystem(dt, ctx);
  assert.equal(ctx.enemyBullets.filter((b) => b.isRocket === true).length, 0, "pas de 2e avant 1 s");
  for (let f = 0; f < 65; f++) tickJpcSystem(dt, ctx);
  const shots2 = ctx.enemyBullets.filter((b) => b.isRocket === true);
  assert.ok(shots2.length >= 1, "roquette après 1 s");
  assert.ok(shots2.every((b) => b.key === bot.jpcRockets.standard), "que du standard");
});

test("roquettes solo : riposte = vraies roquettes vers le joueur", () => {
  const { ctx, enemies } = makeCtx("2-3", { withNpcs: false });
  const dt = 1 / 60;
  let bot = null;
  for (let f = 0; f < 60 * 20 && !bot; f++) {
    tickJpcSystem(dt, ctx);
    bot = enemies.find((e) => e?.isJpcBot && e.hp > 0);
  }
  assert.ok(bot, "bot spawné");
  ctx.addCappedProjectile = (arr, p) => { arr.push(p); };
  ctx.player.x = bot.x + 300; ctx.player.y = bot.y;
  ctx.player.sh = 100000; ctx.player.shMax = 100000;
  bot.jpcRocketCd = 0;
  bot.jpcIemCd = 9999; bot.jpcIshCd = 9999;
  bot.hp -= 5000; bot._damagedByPlayer = true;
  tickJpcSystem(dt, ctx);
  assert.ok(bot.jpcRiposte, "riposte");
  const shots = ctx.enemyBullets.filter((b) => b.isRocket === true);
  assert.equal(shots.length, 1, "1 roquette riposte");
  assert.equal(shots[0].target, "player", "vers le joueur");
  assert.ok(shots[0].dmg > 0, "vrais dégâts (impact pipeline)");
  assert.ok(Number.isFinite(shots[0].arcKick0) && shots[0].smokeHue != null, "arc + fumée");
});

test("vitesse : coque + fit + carte, pas uniforme au tier", () => {
  const max = () => 0.999999, min = () => 0;
  // Même fit max : l'intercepteur reste devant la citerne.
  assert.ok(jpcShipSpeed("vengeance", "1-8", max) > jpcShipSpeed("citadel", "1-8", max), "vengeance > citadel à fit égal");
  assert.ok(jpcShipSpeed("vengeance", "1-8", min) > jpcShipSpeed("citadel", "1-8", min), "vengeance > citadel à fit nul");
  // Même coque : mieux équipée en haut de carte.
  assert.ok(jpcShipSpeed("goliath", "1-8", max) > jpcShipSpeed("goliath", "1-1", max), "goliath 1-8 > 1-1");
  // Fit nul = base coque exacte (pas de bonus inventé).
  assert.equal(jpcShipSpeed("vengeance", "1-1", min), 380);
  assert.equal(jpcShipSpeed("citadel", "1-8", min), 240);
  // Moyennes roster : à coque égale, mieux équipée en haut de carte
  // (les fits suivent la map, même si les coques varient désormais).
  for (const hull of ["vengeance", "goliath", "citadel", "spectrum", "solace"]) {
    assert.ok(jpcShipSpeed(hull, "1-8", max) > jpcShipSpeed(hull, "1-1", max), `${hull} 1-8 > 1-1 à fit égal`);
  }
  // Variété intra-carte : pas tous à la même vitesse.
  const world = { w: 10000, h: 6000 };
  const speeds = new Set(buildJpcRoster("1-8", world, [], []).map((d) => d.speed));
  assert.ok(speeds.size > 1, "vitesses variées sur la même carte");
});

test("humain : maladresse, courage variable, pauses et détours en patrouille", () => {
  // MISS : 15 % en 1-8/BL, 30 % en 1-1.
  assert.equal(jpcMissChance(1), 0.15);
  assert.equal(jpcMissChance(0), 0.3);
  assert.ok(Math.abs(jpcMissChance(0.5) - 0.225) < 1e-9);
  // Seuil de fuite : base 25-50 %, +10 % par assaillant sup., plafond 70 %.
  assert.equal(jpcFleeThreshold({ jpcFleeAt: 0.3 }, 0), 0.3);
  assert.equal(jpcFleeThreshold({ jpcFleeAt: 0.3 }, 1), 0.3);
  assert.equal(jpcFleeThreshold({ jpcFleeAt: 0.3 }, 3), 0.5);
  assert.equal(jpcFleeThreshold({ jpcFleeAt: 0.5 }, 10), 0.7);
  assert.equal(jpcFleeThreshold({}, 0), 0.35);
  // Comptage des assaillants : provoqués + accrochés, pas les copains/morts/lointains.
  const bot = { id: 7, x: 0, y: 0 };
  const foes = [
    { id: 1, type: "npc_Streuner", x: 100, y: 0, hp: 10, _jpcAggroBy: 7, _jpcAggro: true },
    { id: 2, type: "npc_Saimon", x: 200, y: 0, hp: 10, _aggro: true },
    { id: 3, type: "npc_Streuner", x: 100, y: 0, hp: 0, _aggro: true },
    { id: 4, type: "npc_Streuner", x: 5000, y: 0, hp: 10, _aggro: true },
    { id: 5, type: "npc_Streuner", x: 100, y: 0, hp: 10 },
    { isJpcBot: true, x: 100, y: 0, hp: 10 },
  ];
  assert.equal(jpcCountFoes(bot, foes), 2, "2 assaillants (provoqué + accroché)");
  assert.equal(jpcCountFoes(bot, foes, 50), 0, "hors portée = 0");
  // Patrouille : grandes lignes droites (détours rares et peu marqués),
  // micro-pauses, allure variable.
  const world = { w: 10000, h: 6000 };
  // Ligne droite : sans écart ni pause forcés, cap fixe = trajectoire pure.
  // (Départ dans les bornes : hors bornes, le contournement recourbe.)
  const straight = { x: 500, y: 500, speed: 300, r: 20, jpcNavigation: { detourIn: 1e9, pauseIn: 1e9 } };
  let maxCross = 0;
  for (let f = 0; f < 60 * 10; f++) {
    const m = jpcTravel(straight, 9000, 3000, 1 / 60, world, [], { human: 1 });
    straight.x += m.mx * m.spd * (1 / 60);
    straight.y += m.my * m.spd * (1 / 60);
    maxCross = Math.max(maxCross, Math.abs((3000 - 500) * (straight.x - 500) - (9000 - 500) * (straight.y - 500)) / Math.hypot(8500, 2500));
  }
  assert.ok(maxCross < 1, `cap tenu (${maxCross.toFixed(3)} m d'écart)`);
  assert.ok(Math.hypot(straight.x - 500, straight.y - 500) > 2900, "avance franche (~3000 m en 10 s)");
  // Écart de cap : réévalué toutes les 8-15 s, latéral contenu (≤ 200 m).
  const weaver = { x: 0, y: 0, speed: 300, r: 20, jpcNavigation: {} };
  let detour = null;
  for (let i = 0; i < 60 && !detour; i++) {
    weaver.jpcNavigation.detourIn = 0;
    jpcTravel(weaver, 9000, 3000, 1 / 60, world, [], { human: 1 });
    detour = weaver.jpcNavigation.detour;
  }
  assert.ok(detour?.x != null, "écart occasionnel");
  const cross = Math.abs(3000 * detour.x - 9000 * detour.y) / Math.hypot(9000, 3000);
  assert.ok(cross <= 250, `écart doux (${Math.round(cross)} m)`);
  assert.ok(weaver.jpcNavigation.detourIn >= 8 && weaver.jpcNavigation.detourIn <= 15, "prochain écart dans 8-15 s");
  // Allure : re-tirée à chaque réévaluation, dans 90-110 %.
  assert.ok(weaver.jpcNavigation.pace >= 0.9 && weaver.jpcNavigation.pace < 1.1, "allure 90-110 %");
  // Micro-pause : arrêt franc quand l'envie prend (pas en fuite).
  const pauser = { x: 0, y: 0, speed: 300, r: 20, jpcNavigation: { pauseIn: 0.01, detourIn: 1e9 } };
  const pm = jpcTravel(pauser, 9000, 3000, 1 / 60, world, [], { human: 1 });
  assert.equal(pm.spd, 0, "micro-pause en patrouille");
  // Fuite : jamais de pause (que du léger zigzag).
  const fleer = { x: 0, y: 0, speed: 300, r: 20 };
  for (let f = 0; f < 60 * 40; f++) {
    const m = jpcTravel(fleer, 9000, 3000, 1 / 60, world, [], { human: 0.3 });
    assert.ok(!((fleer.jpcNavigation?.pauseLeft || 0) > 0), "aucune pause en fuite");
    fleer.x += m.mx * m.spd * (1 / 60);
    fleer.y += m.my * m.spd * (1 / 60);
  }
  // Combat : trajectoire pure, vitesse exacte.
  const fighter = { x: 0, y: 0, speed: 300, r: 20 };
  const cm = jpcTravel(fighter, 9000, 3000, 1 / 60, world, []);
  assert.equal(cm.spd, 300, "vitesse exacte en combat");
});

test("fuite variable : seul on tente, à 3 on fuit à ~50 %", () => {
  const { ctx, enemies } = makeCtx("2-3", { withNpcs: false });
  const dt = 1 / 60;
  let bot = null;
  for (let f = 0; f < 60 * 20 && !bot; f++) {
    tickJpcSystem(dt, ctx);
    bot = enemies.find((e) => e?.isJpcBot && e.hp > 0);
  }
  assert.ok(bot, "bot spawné");
  bot.jpcFleeAt = 0.3;
  bot.jpcIshCd = 9999;
  bot.hp = bot.hpMax * 0.4;
  bot.sh = bot.shMax * 0.4;
  bot.jpcCalmT = 999;
  for (let f = 0; f < 10; f++) tickJpcSystem(dt, ctx);
  assert.ok(bot.jpcMode !== "flee" && bot.jpcMode !== "repair", "seul à 40 % : on reste");
  // 3 NPC accrochés autour : le seuil monte à 50 %, on fuit à 40 %.
  for (let i = 0; i < 3; i++) {
    enemies.push({ id: nextId++, type: "npc_Streuner", x: bot.x + 100 + i * 10, y: bot.y, hp: 1000, hpMax: 1000, _aggro: true });
  }
  for (let f = 0; f < 10; f++) tickJpcSystem(dt, ctx);
  assert.equal(bot.jpcMode, "flee", "à 3 assaillants : fuite à 40 %");
});

test("glandouille portail : 5-15 s sur place une fois réparé", () => {
  const { ctx, enemies } = makeCtx("2-4", { withNpcs: false });
  ctx.npcIsInSafeZone = (e) => {
    const dx = e.x - 9000, dy = e.y - 5000;
    return dx * dx + dy * dy < 400 * 400;
  };
  const dt = 1 / 60;
  for (let f = 0; f < 60 * 10; f++) tickJpcSystem(dt, ctx);
  const bot = enemies.find((e) => e?.isJpcBot && e.hp > 0);
  assert.ok(bot, "bot spawné");
  // Téléporté au portail, full vie : entre en réparation puis glandouille.
  bot.x = 9000; bot.y = 5000; bot.vx = 0; bot.vy = 0;
  bot.hp = bot.hpMax; bot.sh = bot.shMax;
  bot.jpcMode = "flee";
  bot.jpcRepairDest = null;
  bot.jpcIshCd = 9999;
  for (let f = 0; f < 30; f++) tickJpcSystem(dt, ctx);
  assert.equal(bot.jpcMode, "repair", "en réparation au portail");
  for (let f = 0; f < 60 * 4; f++) tickJpcSystem(dt, ctx);
  assert.equal(bot.jpcMode, "repair", "toujours au portail après 4 s (glandouille 5-15 s)");
  let farmed = false;
  for (let f = 0; f < 60 * 20 && !farmed; f++) {
    tickJpcSystem(dt, ctx);
    farmed = bot.jpcMode === "farm";
  }
  assert.ok(farmed, "repart farmer après la pause");
});

test("pause entre kills : parfois direct, parfois 1-10 s de balade", () => {
  // Tirage : 0 = enchaîne, sinon 1-10 s.
  assert.equal(rollJpcBreather(() => 0.1), 0, "30 % : direct");
  assert.ok(Math.abs(rollJpcBreather(() => 0.3) - 3.7) < 1e-9, "juste au-dessus du seuil");
  const mid = rollJpcBreather(() => 0.5);
  assert.ok(mid >= 1 && mid <= 10, `dans 1-10 s (${mid})`);
  let zeros = 0, pauses = 0;
  for (let i = 0; i < 200; i++) {
    const v = rollJpcBreather(Math.random);
    if (v === 0) zeros++;
    else { pauses++; assert.ok(v >= 1 && v <= 10); }
  }
  assert.ok(zeros > 20 && pauses > 100, `mixte direct/pause (${zeros}/200 direct)`);
  // Solo : en pause, pas de nouvelle cible (balade) ; après, ça repart.
  const { ctx, enemies } = makeCtx("2-3", { withNpcs: false });
  const dt = 1 / 60;
  let bot = null;
  for (let f = 0; f < 60 * 20 && !bot; f++) {
    tickJpcSystem(dt, ctx);
    bot = enemies.find((e) => e?.isJpcBot && e.hp > 0);
  }
  assert.ok(bot, "bot spawné");
  // Les autres bots sont écartés (morts) pour ne pas voler la proie du test,
  // à chaque tick car le remplissage en respawne.
  const mowOthers = () => {
    for (const o of enemies) {
      if (o !== bot && o?.isJpcBot && o.hp > 0) o.hp = 0;
    }
  };
  mowOthers();
  const prey = { id: nextId++, type: "npc_Streuner", x: bot.x + 300, y: bot.y, hp: 1e6, hpMax: 1e6 };
  enemies.push(prey);
  for (let f = 0; f < 30; f++) { mowOthers(); tickJpcSystem(dt, ctx); }
  assert.equal(bot.jpcFarmId, prey.id, "cible acquise");
  bot.jpcBreatherT = 5;
  bot.jpcFarmId = null;
  for (let f = 0; f < 60 * 3; f++) { mowOthers(); tickJpcSystem(dt, ctx); }
  assert.equal(bot.jpcFarmId, null, "pas de cible pendant la pause");
  for (let f = 0; f < 60 * 5 && bot.jpcFarmId == null; f++) {
    mowOthers();
    prey.x = bot.x + 300; prey.y = bot.y;
    tickJpcSystem(dt, ctx);
  }
  assert.equal(bot.jpcFarmId, prey.id, "cible reprise après la pause");
  // Serveur : idem via jpcBreatherUntil.
  const { sim, bots } = controlledSim();
  const sb = bots.find((e) => e.hp > 0);
  const nowMs = Date.now();
  sb.jpcBreatherUntil = nowMs + 60000;
  sb.jpcPreyUid = null;
  sim.jpcMove(sb, null, 0.05, nowMs);
  assert.equal(sb.jpcPreyUid, null, "pas de cible serveur pendant la pause");
  sb.jpcBreatherUntil = nowMs - 1000;
  sim.jpcMove(sb, null, 0.05, nowMs);
  assert.ok(sb.jpcPreyUid != null, "cible serveur après la pause");
});

test("variété coques : toutes les coques du tier sortent sur chaque map", () => {
  // 1-5 ne donne plus que du bigboy/leonov, 1-8 plus que du spectrum :
  // chaque map brasse tout son tier (cohérence gardée par les stats).
  for (const [map, tierIdx] of [["1-1", 0], ["1-5", 1], ["1-8", 3], ["1-bl", 3]]) {
    const ships = JPC_TIERS[tierIdx].ships;
    const seen = new Set();
    const rng = mulberry32(hashMapSeed(`var:${map}`));
    for (let i = 0; i < 300; i++) seen.add(tierListPick(ships, tierProgressForMap(map), rng));
    assert.ok(seen.size >= Math.min(3, ships.length), `${map} : variété (${[...seen].join(",")})`);
    for (const s of seen) assert.ok(ships.includes(s), `${map} : ${s} reste du tier`);
  }
});

test("pseudos uniques face aux vivants (renforts horaires sans jumeaux)", () => {
  const world = { w: 10000, h: 6000 };
  const epoch = 479444 * 3600000;
  const first = buildJpcRoster("1-2", world, [], [], epoch);
  assert.ok(first.length >= 2, "roster de base");
  // Les renforts de l'heure suivante ne reprennent aucun pseudo vivant.
  const live = new Set(first.map((d) => d.pseudo));
  const next = buildJpcRoster("1-2", world, [], [], epoch + 3600000, live);
  for (const d of next) {
    assert.ok(!first.some((o) => o.pseudo === d.pseudo), `pas de jumeau ${d.pseudo}`);
  }
  assert.equal(new Set(next.map((d) => d.pseudo)).size, next.length, "pseudos uniques entre eux");
});

test("nombre : 2-6 par map, 4-8 en BL", () => {  assert.equal(jpcCountFromRng("2-3", () => 0), 2, "min normale");
  assert.equal(jpcCountFromRng("2-3", () => 0.9999), 6, "max normale");
  assert.equal(jpcCountFromRng("1-bl", () => 0), 4, "min BL");
  assert.equal(jpcCountFromRng("1-bl", () => 0.9999), 8, "max BL");
  assert.equal(jpcCountFromRng("3-BL", () => 0.5), 6, "milieu BL");
  assert.equal(jpcCountFromRng("1-8", () => 0.5), 4, "milieu normale");
  for (let i = 0; i < 200; i++) {
    const n = jpcCountFromRng("1-2", Math.random);
    assert.ok(n >= 2 && n <= 6, `normale 2-6 (${n})`);
    const b = jpcCountFromRng("2-bl", Math.random);
    assert.ok(b >= 4 && b <= 8, `BL 4-8 (${b})`);
  }
});

test("patrouille : waypoint lointain gardé jusqu'au bout (grandes lignes)", () => {
  const { ctx, enemies } = makeCtx("2-3", { withNpcs: false });
  const dt = 1 / 60;
  let bot = null;
  for (let f = 0; f < 60 * 20 && !bot; f++) {
    tickJpcSystem(dt, ctx);
    bot = enemies.find((e) => e?.isJpcBot && e.hp > 0);
  }
  assert.ok(bot, "bot spawné");
  bot.x = 5000; bot.y = 3000; bot.vx = 0; bot.vy = 0;
  bot.jpcWander = null; bot.jpcWanderT = 0;
  tickJpcSystem(dt, ctx);
  const wx = bot.jpcWander?.x, wy = bot.jpcWander?.y;
  assert.ok(wx != null, "cap pris");
  assert.ok(Math.hypot(wx - bot.x, wy - bot.y) >= 1500, "cap lointain (≥ 1500 m)");
  for (let f = 0; f < 60 * 5; f++) tickJpcSystem(dt, ctx);
  assert.equal(bot.jpcWander?.x, wx, "même cap après 5 s (pas de re-pick)");
  assert.equal(bot.jpcWander?.y, wy, "même cap après 5 s");
  // Serveur : pareil, cap lointain gardé jusqu'à l'arrivée (on force la
  // patrouille via la pause entre kills pour ne pas viser la proie du test).
  const { sim } = controlledSim();
  const sb = [...sim.entries.values()].find((e) => e.jpc === true);
  const nowMs = Date.now();
  sb.x = 5000; sb.y = 3000; sb.tx = null; sb.ty = null;
  sb.jpcBreatherUntil = nowMs + 60000;
  sim.jpcMove(sb, null, 0.05, nowMs);
  assert.ok(Math.hypot(sb.tx - sb.x, sb.ty - sb.y) >= 1500, "cap serveur lointain");
  const stx = sb.tx, sty = sb.ty;
  for (let i = 0; i < 10; i++) sim.jpcMove(sb, null, 0.05, nowMs);
  assert.equal(sb.tx, stx, "cap serveur gardé");
  assert.equal(sb.ty, sty, "cap serveur gardé");
});

test("progression par carte : 1-1 très faible … 1-8 fort", () => {
  const world = { w: 10000, h: 6000 };
  const avg = (arr) => arr.reduce((a, b) => a + b, 0) / Math.max(1, arr.length);
  const pools = [], dmgs = [], counts = [];
  for (let z = 1; z <= 8; z++) {
    const roster = buildJpcRoster(`1-${z}`, world, [], []);
    assert.ok(roster.length >= 2 && roster.length <= 6, `1-${z}: 2-6 bots`);
    pools.push(avg(roster.map((d) => d.hpMax + d.shMax)));
    dmgs.push(avg(roster.map((d) => d.bulletDmg)));
    counts.push(avg(roster.map((d) => d.drones.count)));
    for (const d of roster) {
      const tier = JPC_TIERS[tierForMap(`1-${z}`)];
      assert.ok(d.hpMax >= tier.hp[0] && d.hpMax <= tier.hp[1], `1-${z}: HP dans le tier`);
      assert.ok(d.bulletDmg >= tier.dmg[0] && d.bulletDmg <= tier.dmg[1], `1-${z}: dégâts dans le tier`);
      assert.ok(tier.ships.includes(jpcBaseHull(d.shipId)), `1-${z}: coque du tier`);
      assert.ok(tier.ammo.includes(d.ammo), `1-${z}: munition du tier`);
    }
  }
  for (let i = 1; i < 8; i++) {
    assert.ok(pools[i] > pools[i - 1], `pool 1-${i + 1} (${Math.round(pools[i])}) > 1-${i} (${Math.round(pools[i - 1])})`);
    assert.ok(dmgs[i] > dmgs[i - 1], `dégâts 1-${i + 1} > 1-${i}`);
  }
  assert.ok(counts[7] > counts[0], "plus de drones en 1-8 qu'en 1-1");
  // Extrêmes : 1-1 petits vaisseaux + x1, 1-8 gros + x4/x6.
  const ships11 = new Set(buildJpcRoster("1-1", world, [], []).map((d) => jpcBaseHull(d.shipId)));
  assert.ok([...ships11].every((s) => ["liberator", "piranha"].includes(s)), `1-1 petites coques (${[...ships11]})`);
  const ammo11 = new Set(buildJpcRoster("1-1", world, [], []).map((d) => d.ammo));
  assert.ok(!ammo11.has("x6") && !ammo11.has("x4") && !ammo11.has("x3"), `1-1 munitions faibles (${[...ammo11]})`);
  const ammo18 = new Set(buildJpcRoster("1-8", world, [], []).map((d) => d.ammo));
  assert.ok(!ammo18.has("x1") && !ammo18.has("x2") && !ammo18.has("x3"), `1-8 munitions fortes (${[...ammo18]})`);
});

test("designs : parfois la coque de base, parfois un skin elite/plus", () => {
  assert.equal(jpcBaseHull("vengeance_lightning"), "vengeance");
  assert.equal(jpcBaseHull("goliath_champion_france"), "goliath");
  assert.equal(jpcBaseHull("goliath"), "goliath");
  assert.ok(shipDesignsFor("vengeance").includes("vengeance_lightning"), "skins vengeance");
  assert.ok(shipDesignsFor("goliath").length > 10, "beaucoup de skins goliath");
  assert.deepEqual(shipDesignsFor("leonov"), [], "leonov sans skin");
  assert.deepEqual(shipDesignsFor("piranha"), [], "piranha sans skin");
  assert.equal(rollJpcShip("goliath", 3, () => 0.99), "goliath", "tirage haut = base");
  assert.equal(rollJpcShip("leonov", 3, () => 0), "leonov", "sans skin = base");
  const picked = rollJpcShip("vengeance", 3, () => 0);
  assert.ok(picked !== "vengeance" && picked.startsWith("vengeance_"), `tirage bas = skin (${picked})`);
  // Type NPC enregistré pour le skin (rendu client OK).
  ensureJpcTypes();
  assert.ok(NPC_TYPES[`npc_Jpc_${picked}`], `type enregistré pour ${picked}`);
  // Roster 1-8 : cuirassés avec mélange base/skins.
  const world = { w: 10000, h: 6000 };
  const roster = buildJpcRoster("1-8", world, [], []);
  const bases = new Set(roster.map((d) => jpcBaseHull(d.shipId)));
  assert.ok([...bases].every((s) => ["vengeance", "goliath", "aegis", "citadel", "spectrum", "solace"].includes(s)), `1-8 cuirassés (${[...bases]})`);
  assert.ok(roster.some((d) => d.shipId !== jpcBaseHull(d.shipId)), "au moins un skin en 1-8");
  assert.ok(roster.some((d) => d.shipId === jpcBaseHull(d.shipId)), "au moins une coque de base en 1-8");
  // Petites coques (même skinnées) gardent le cap drones.
  for (const d of buildJpcRoster("1-1", world, [], [])) {
    if (["liberator", "nostromo", "piranha", "yamato"].includes(jpcBaseHull(d.shipId))) {
      assert.ok(d.drones.count <= 5, `petite coque capée (${d.shipId} : ${d.drones.count})`);
    }
  }
});

test("riposte agressive : x4 + salves x6, papillon/foreuse, skill par carte", () => {
  // Skill : 1-1 = 0 (maladroite), 1-8/BL = 1 (agressive).
  assert.equal(jpcSkillForMap("1-1"), 0);
  assert.equal(jpcSkillForMap("1-4"), 3 / 7);
  assert.equal(jpcSkillForMap("1-8"), 1);
  assert.equal(jpcSkillForMap("2-bl"), 1);
  assert.equal(jpcSkillForMap("5-2"), 0.5);
  assert.equal(jpcRiposteDurationForSkill(0), 4);
  assert.equal(jpcRiposteDurationForSkill(1), 12);
  assert.equal(jpcRiposteMultForSkill(0), 2);
  assert.equal(jpcRiposteMultForSkill(1), 4);
  // Durée : à 5 s sans nouveau dégât, la 1-1 a lâché, la 1-8 insiste.
  for (const [map, want] of [["1-1", false], ["1-8", true]]) {
    const t = makeCtx(map, { withNpcs: false });
    for (let f = 0; f < 60 * 3; f++) tickJpcSystem(1 / 60, t.ctx);
    const b = t.enemies.find((e) => e?.isJpcBot && e.hp > 0);
    assert.ok(b, `bot ${map}`);
    b.jpcRiposteT = 5;
    tickJpcSystem(1 / 60, t.ctx);
    assert.equal(b.jpcRiposte, want, `riposte ${map} à 5 s`);
  }
  // Dégâts x4 + formation papillon (gros bouclier adverse) en 3-8.
  const { ctx, enemies } = makeCtx("3-8", { withNpcs: false });
  for (let f = 0; f < 60 * 3; f++) tickJpcSystem(1 / 60, ctx);
  const bot = enemies.find((e) => e?.isJpcBot && e.hp > 0);
  assert.ok(bot, "bot 3-8");
  assert.equal(bot.jpcSkill, 1);
  bot.droneCfg.count = 8;
  bot.droneCfg.level = 5;
  bot.jpcForms = rollJpcFormSet(JPC_TIERS[3].forms, 8);
  bot.jpcX6T = 0; bot.jpcX6Cd = 9999;
  bot.jpcIemCd = 9999; bot.jpcIshCd = 9999;
  const baseDmg = bot.bulletDmg;
  const botSpeed = bot.speed;
  // Dégâts drones : 8 drones lvl 5 = ×1.8 comme un vrai joueur équipé.
  assert.equal(jpcDroneDmgFactor(bot), 1.8);
  assert.equal(jpcDroneDmgFactor({ droneCfg: { count: 2, level: 1 } }), 1.04);
  const calls = [];
  ctx.enemyShoot = (e) => { calls.push({ ammo: e.ammoKey, dmg: e.bulletDmg, sprite: e.bulletSprite?.src }); };
  ctx.player.sh = 100000; ctx.player.shMax = 100000;
  bot.hp -= 5000; bot._damagedByPlayer = true;
  tickJpcSystem(0.05, ctx);
  assert.ok(bot.jpcRiposte, "riposte");
  assert.equal(calls.length, 1, "un tir de riposte");
  assert.equal(calls[0].ammo, "x4", "munition x4");
  // 3-8 : ×4 (skill) ×1.8 (drones) = ×7.2.
  assert.ok(calls[0].dmg >= baseDmg * 7.2 * 0.89 && calls[0].dmg <= baseDmg * 7.2 * 1.11, `dégâts ×7.2 (${calls[0].dmg} vs ${baseDmg})`);
  assert.match(String(calls[0].sprite), /X4/, "visuel x4");
  assert.equal(bot.droneCfg.formation, "butterfly", "papillon contre gros bouclier");
  assert.equal(bot.bulletDmg, baseDmg, "dégâts restaurés après le tir");
  assert.equal(bot.ammoKey, "x1", "munition restaurée après le tir");
  // Bouclier adverse vide → foreuse pour finir.
  ctx.player.sh = 0;
  tickJpcSystem(0.05, ctx);
  assert.equal(bot.droneCfg.formation, "drill", "foreuse pour finir");
  // Salve x6 : RSB orange, ×1.5 → ×10.8 avec les drones.
  bot.jpcX6T = 5;
  tickJpcSystem(0.05, ctx);
  const burst = calls[calls.length - 1];
  assert.equal(burst.ammo, "x6", "salve x6");
  assert.match(String(burst.sprite), /RSB/, "visuel RSB");
  assert.ok(burst.dmg >= baseDmg * 10.8 * 0.89 && burst.dmg <= baseDmg * 10.8 * 1.11, `dégâts ×10.8 (${burst.dmg})`);
  assert.equal(bot.speed, botSpeed, "vitesse restaurée après la riposte");
  // Poursuite : loin du joueur, le bot avance à vitesse boostée (+25 %).
  bot.x = 1000; bot.y = 3000; bot.vx = 0; bot.vy = 0;
  ctx.player.x = 5000; ctx.player.y = 3000;
  tickJpcSystem(0.05, ctx);
  const chaseSpd = Math.hypot(bot.vx, bot.vy);
  assert.ok(Math.abs(chaseSpd - Math.min(botSpeed * 1.25, 450)) < 1, `poursuite à ${chaseSpd.toFixed(0)} (base ${botSpeed})`);
  // Serveur : skill stocké, aggro tenue scalée, lecture bouclier.
  const { sim, bots } = controlledSim();
  const sb = bots[0];
  sb.jpcDrones.count = 8;
  assert.ok(Math.abs(sb.jpcSkill - 1 / 7) < 1e-9, "skill 1-2 stocké");
  assert.equal(sb.aggroHoldMs, Math.round(4000 + 8000 / 7), "aggro tenue scalée");
  sim.setPlayer("u_sh", 0, 0, { shPct: 0.8 });
  assert.equal(sim.jpcFoeShieldFrac("u_sh"), 0.8);
  assert.equal(sim.jpcFoeShieldFrac("nobody"), null);
  assert.equal(jpcRiposteFormation(sb, 0.8), "butterfly");
  assert.equal(jpcRiposteFormation(sb, 0.05), "drill");
});

test("solo : un JPC qui a tué oublie le joueur mort (pas de rancune)", () => {
  const { ctx, enemies } = makeCtx("3-8", { withNpcs: false });
  const dt = 1 / 60;
  let bot = null;
  for (let f = 0; f < 60 * 20 && !bot; f++) {
    tickJpcSystem(dt, ctx);
    bot = enemies.find((e) => e?.isJpcBot && e.hp > 0);
  }
  assert.ok(bot, "bot 3-8");
  bot.jpcIshCd = 9999;
  bot.hp -= 5000; bot._damagedByPlayer = true;
  tickJpcSystem(dt, ctx);
  assert.ok(bot.jpcRiposte, "riposte après attaque joueur");
  // Le joueur meurt : oubli total comme s'il n'avait jamais attaqué.
  ctx.player.dead = true;
  ctx.player.hp = 0;
  tickJpcSystem(dt, ctx);
  assert.equal(bot.jpcRiposte, false, "riposte coupée");
  assert.ok(bot.jpcRiposteT >= 999, "compteur réarmé");
  assert.equal(bot._provoked, false, "provocation effacée");
  assert.equal(bot._aggro, false, "aggro effacée");
  assert.equal(bot.jpcChaseId, null, "poursuite effacée");
  // Respawn à côté du bot : aucune rancune sans nouvelle attaque.
  ctx.player.dead = false;
  ctx.player.hp = 500000;
  tickJpcSystem(dt, ctx);
  assert.equal(bot.jpcRiposte, false, "pas de rancune au respawn");
});

test("riposte jusqu'à la mort : jamais de fuite quand le joueur tape", () => {
  const { ctx, enemies } = makeCtx("3-8", { withNpcs: false });
  const dt = 1 / 60;
  // Attente du spawn (le respawnIn global peut être chargé par le test précédent).
  let bot = null;
  for (let f = 0; f < 60 * 20 && !bot; f++) {
    tickJpcSystem(dt, ctx);
    bot = enemies.find((e) => e?.isJpcBot && e.hp > 0);
  }
  assert.ok(bot, "bot 3-8");
  bot.jpcIshCd = 9999;
  bot.jpcIemCd = 9999;
  // Coque critique + joueur qui tape : en riposte, pas de fuite.
  bot.hp = bot.hpMax * 0.2;
  bot.sh = 0;
  bot.hp -= 1000; bot._damagedByPlayer = true;
  for (let f = 0; f < 60 * 3; f++) {
    bot.hp = Math.max(1, bot.hpMax * 0.2);
    tickJpcSystem(dt, ctx);
    if (!(bot.hp > 0)) break;
  }
  assert.ok(bot.jpcRiposte, "toujours en riposte");
  assert.ok(bot.jpcMode !== "flee" && bot.jpcMode !== "repair", `pas de fuite en riposte (mode ${bot.jpcMode})`);
  assert.equal(bot.jpcRepairDest, null, "aucune destination de réparation");
});

test("regen façon joueur : rien sous le feu, +5 %/s après 10 s calmes", () => {
  const { ctx, enemies } = makeCtx("1-2", { withNpcs: false });
  const dt = 1 / 60;
  let bot = null;
  for (let f = 0; f < 60 * 20 && !bot; f++) {
    tickJpcSystem(dt, ctx);
    bot = enemies.find((e) => e?.isJpcBot);
  }
  assert.ok(bot, "bot spawné");
  bot.hp = bot.hpMax * 0.5;
  bot.sh = bot.shMax * 0.5;
  bot.jpcCalmT = 0;
  // Sous le feu (dégâts continus non létaux) : rien ne remonte.
  for (let f = 0; f < 60 * 3; f++) {
    bot.hp = Math.max(1, bot.hp - bot.hpMax * 0.001);
    bot.sh = Math.max(0, bot.sh - bot.shMax * 0.001);
    tickJpcSystem(dt, ctx);
    if (bot.hp <= 0) break;
  }
  const underFire = bot.hp / bot.hpMax;
  assert.ok(underFire < 0.5, `pas de regen sous le feu (${underFire.toFixed(2)})`);
  // 12 s calmes : coque ET bouclier remontent à +5 %/s.
  const hp0 = bot.hp, sh0 = bot.sh;
  for (let f = 0; f < 60 * 12; f++) tickJpcSystem(dt, ctx);
  assert.ok(bot.hp > hp0, "coque remonte hors combat");
  assert.ok(bot.sh > sh0, "bouclier remonte hors combat");
});

test("multi natif : proie lockée ou déjà prise évitée par les JPC", () => {
  ensureJpcTypes();
  const world = { w: 10000, h: 6000 };
  const sim = new ZoneNpcSim("1-2", world, [], null);
  sim.safe = [];
  sim.walls = [];
  sim.spawnJpcRoster(buildJpcRoster("1-2", world, [], []).slice(0, 2), Date.now());
  const [b1, b2] = [...sim.entries.values()].filter((e) => e.jpc === true);
  // Une proie lockée par un joueur + une proie libre.
  const mkPrey = (uid, x) => sim.entries.set(uid, {
    uid, campId: 999, type: "npc_Streuner", x, y: 3000, angle: 0,
    hp: 80000, sh: 40000, hpMax: 80000, shMax: 40000, speed: 270, dr: 0, spread: 0.8, r: 18,
    passive: false, kamikaze: false, canShoot: false, shootRange: 0, shootRate: 0,
    bulletDmg: 0, burst: 1, shootCd: 0, aggroRange: 0, aggroHoldMs: 3500,
    aggroBy: null, aggroUntil: 0, tx: null, ty: null, killer: null,
    firstBy: null, lastHitBy: null, lockBy: "u_other", lockHitAt: Date.now(),
    lockReleaseAt: 0, hitHist: [], orbitDir: 1, orbitT: 2, seq: 1,
  });
  b1.x = 1000; b1.y = 3000;
  b2.x = 1100; b2.y = 3100;
  mkPrey("1-2#locked", 1200);
  mkPrey("1-2#freeA", 1300);
  mkPrey("1-2#freeB", 1400);
  sim.entries.get("1-2#freeA").lockBy = null;
  sim.entries.get("1-2#freeB").lockBy = null;
  for (let i = 0; i < 20; i++) sim.tick(0.05);
  const t1 = sim.entries.get(b1.jpcPreyUid);
  const t2 = sim.entries.get(b2.jpcPreyUid);
  assert.ok(t1 && t2, "les deux bots ont une cible");
  assert.notEqual(t1.uid, "1-2#locked", "jamais la cible lockée");
  assert.notEqual(t2.uid, "1-2#locked", "jamais la cible lockée (2)");
  assert.notEqual(t1.uid, t2.uid, "jamais la même cible");
});
