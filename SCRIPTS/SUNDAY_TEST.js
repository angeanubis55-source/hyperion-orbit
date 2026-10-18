import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import {
  SUNDAY_MAPS,
  SUNDAY_UFONIT_TYPE,
  SUNDAY_MODULE_CHANCE,
  SUNDAY_TICKET_CHANCE,
  SUNDAY_TICKET_QTY,
  SUNDAY_AMMO_CHANCE,
  SUNDAY_AMMO_QTY,
  SUNDAY_DMG_MULT,
  SUNDAY_RARE_CHANCE,
  buildSundayCamp,
  isSundayBossVariant,
  isSundayEventActive,
  isSundayMap,
  sundayPickMap,
} from "../NPC/NPC_SUNDAY.js";
import { NPC_TYPES } from "../NPC/NPC_TYPES.js";
import { getZoneSpawns as getZoneSpawns44 } from "../MAPS/4-4/SPAWNS.js";
import { ZoneNpcSim, syncSundayEvent } from "./NPC_ROOM.js";

// Dimanches : 18 oct 2026 (UTC+2), 1er nov 2026 (UTC+1) et 29 mars 2026
// (dimanche du passage à l'heure d'été, UTC+2 dès 2h).
// 20h30 Paris = 18h30Z en octobre/mars, 19h30Z en novembre.
const SUN_OCT_BEFORE = Date.parse("2026-10-18T18:29:59Z");
const SUN_OCT_START = Date.parse("2026-10-18T18:30:00Z");
const SUN_OCT_MID = Date.parse("2026-10-18T19:30:00Z");
const SUN_OCT_LAST = Date.parse("2026-10-18T20:29:59Z");
const SUN_OCT_END = Date.parse("2026-10-18T20:30:00Z");
const SAT_OCT = Date.parse("2026-10-17T18:00:00Z");
const MON_OCT = Date.parse("2026-10-19T18:00:00Z");
const SUN_NOV_START = Date.parse("2026-11-01T19:30:00Z");
const SUN_NOV_END = Date.parse("2026-11-01T21:30:00Z");
const SUN_MAR_START = Date.parse("2026-03-29T18:30:00Z");
const SUN_MAR_END = Date.parse("2026-03-29T20:30:00Z");

test("UFONIT : fenêtre dimanche 20h30-22h30 Paris (été comme hiver)", () => {
  assert.equal(isSundayEventActive(new Date(SUN_OCT_BEFORE)), false);
  assert.equal(isSundayEventActive(new Date(SUN_OCT_START)), true);
  assert.equal(isSundayEventActive(new Date(SUN_OCT_MID)), true);
  assert.equal(isSundayEventActive(new Date(SUN_OCT_LAST)), true);
  assert.equal(isSundayEventActive(new Date(SUN_OCT_END)), false);
  assert.equal(isSundayEventActive(new Date(SAT_OCT)), false);
  assert.equal(isSundayEventActive(new Date(MON_OCT)), false);
  assert.equal(isSundayEventActive(new Date(SUN_NOV_START)), true);
  assert.equal(isSundayEventActive(new Date(SUN_NOV_END)), false);
  assert.equal(isSundayEventActive(new Date(SUN_MAR_START)), true);
  assert.equal(isSundayEventActive(new Date(SUN_MAR_END)), false);
  assert.equal(isSundayEventActive(new Date("invalid")), false);
});

test("UFONIT : forçage SUNDAY_FORCE=1 pour tester hors dimanche", () => {
  process.env.SUNDAY_FORCE = "1";
  try {
    assert.equal(isSundayEventActive(new Date(MON_OCT)), true);
  } finally {
    delete process.env.SUNDAY_FORCE;
  }
  assert.equal(isSundayEventActive(new Date(MON_OCT)), false);
});

test("UFONIT : maps 4-1 à 4-4 uniquement, tirage équiprobable", () => {
  for (const m of ["4-1", "4-2", "4-3", "4-4"]) assert.equal(isSundayMap(m), true);
  assert.equal(isSundayMap(" 4-4 "), true);
  for (const m of ["1-1", "4-5", "3-3", "5-1", "", null]) assert.equal(isSundayMap(m), false);
  const seen = new Set();
  for (let i = 0; i < 200; i++) {
    const pick = sundayPickMap(Math.random);
    assert.ok(SUNDAY_MAPS.includes(pick), pick);
    seen.add(pick);
  }
  assert.deepEqual([...seen].sort(), ["4-1", "4-2", "4-3", "4-4"]);
  assert.equal(isSundayBossVariant(SUNDAY_UFONIT_TYPE), true);
  assert.equal(isSundayBossVariant("npc_UFONIT"), false);
  assert.equal(SUNDAY_MODULE_CHANCE, 0.25);
  assert.equal(SUNDAY_TICKET_CHANCE, 0.25);
  assert.equal(SUNDAY_TICKET_QTY, 1);
  assert.equal(SUNDAY_AMMO_CHANCE, 0.10);
  assert.equal(SUNDAY_AMMO_QTY, 50000);
  assert.equal(SUNDAY_DMG_MULT, 15);
  assert.equal(SUNDAY_RARE_CHANCE, 0.25);
});

test("UFONIT : 4-4 peuplée de 10 kamikazes", () => {
  const camps = getZoneSpawns44({ w: 22000, h: 14000 });
  assert.equal(camps.length, 10);
  assert.ok(camps.every((c) => c.type === "npc_Explosif" && c.maxAlive === 1));
});

test("UFONIT : type 350M/350M, vitesse 540, 0 dégât, sprite continu", () => {
  const cfg = NPC_TYPES[SUNDAY_UFONIT_TYPE];
  assert.equal(cfg.name, "[ UFONIT ]");
  assert.deepEqual([cfg.hp, cfg.shield, cfg.speed], [350000000, 350000000, 540]);
  assert.equal(cfg.passiveNative, true);
  assert.equal(cfg.playSprite, true);
  assert.equal(cfg.spriteSpeed, 25);
  // Inoffensif total : ne tire jamais.
  assert.equal(cfg.canShoot, false);
  assert.deepEqual([cfg.shootRange, cfg.shootRate, cfg.bulletDmg], [0, 0, 0]);
  // L'ancien UFONIT classique reste intact (agressif, 250k).
  assert.equal(NPC_TYPES.npc_UFONIT.hp, 250000);
  assert.equal(NPC_TYPES.npc_UFONIT.passiveNative, false);
});

test("UFONIT : camp unique instantané + entrée passive inoffensive", () => {
  const camp = { id: 7, ...buildSundayCamp({ w: 22000, h: 14000 }, () => 0.5) };
  assert.equal(camp.type, SUNDAY_UFONIT_TYPE);
  assert.equal(camp.event, "sunday");
  assert.deepEqual([camp.maxAlive, camp.respawn, camp.fixed], [1, 0, false]);
  const sim = new ZoneNpcSim("4-4", { w: 22000, h: 14000 }, [camp]);
  assert.equal(sim.spawnFor(camp, Date.now()), true);
  const npc = [...sim.entries.values()][0];
  assert.deepEqual([npc.hpMax, npc.shMax, npc.speed], [350000000, 350000000, 540]);
  assert.equal(npc.passive, true);
  assert.equal(npc.canShoot, false);
  assert.equal(npc.shootRange, 0);
});

test("UFONIT : tapé, il s'en fout et continue sa route (top dégâts intacts)", () => {
  const camp = { id: 3, ...buildSundayCamp({ w: 11000, h: 7000 }, () => 0.5) };
  const sim = new ZoneNpcSim("4-1", { w: 11000, h: 7000 }, [camp]);
  assert.equal(sim.spawnFor(camp, Date.now()), true);
  const npc = [...sim.entries.values()][0];
  const before = npc.hp + npc.sh;
  sim.setPlayer("u_1", npc.x + 100, npc.y, { dead: false });
  // Dégâts x15 : 1000 -> 15000 nets (crit et variance neutralisés).
  const applied = sim.applyHit("u_1", { uid: npc.uid, dmg: 1000, kind: "laser", critChance: 0, variance: 0 });
  assert.equal(applied, 15000);
  assert.ok(npc.hp + npc.sh < before);
  // Dégâts comptés pour le top 10, mais aucune aggro ni poursuite.
  assert.ok(npc.dmgBy && npc.dmgBy.get("u_1") > 0);
  assert.equal(npc.aggroBy, null);
  for (let i = 0; i < 20; i++) sim.tick(0.1);
  assert.equal(npc.chaseId, null);
  assert.equal(npc.aggroBy, null);
});

function makeSims() {
  const sims = new Map();
  for (const m of SUNDAY_MAPS) sims.set(m, new ZoneNpcSim(m, { w: 11000, h: 7000 }, []));
  return sims;
}
const liveTotal = (sims) => {
  let n = 0;
  for (const sim of sims.values()) {
    for (const e of sim.entries.values()) {
      if (e && e.type === SUNDAY_UFONIT_TYPE && e.hp > 0) n++;
    }
  }
  return n;
};

test("UFONIT : 1 seul sur les 4 maps, respawn instant, purge hors fenêtre", () => {
  const sims = makeSims();
  const getSim = (m) => sims.get(String(m).toLowerCase()) || null;
  let t = SUN_OCT_MID;
  const step = () => { t += 3000; return t; };
  // Hors fenêtre : rien.
  let res = syncSundayEvent(getSim, SUN_OCT_BEFORE);
  assert.equal(res.active, false);
  assert.equal(liveTotal(sims), 0);
  // Pendant : exactement 1, avec annonce de spawn.
  res = syncSundayEvent(getSim, step());
  assert.equal(res.active, true);
  assert.equal(liveTotal(sims), 1);
  assert.ok(res.events.some((e) => e.t === "spawn" && SUNDAY_MAPS.includes(e.map)));
  assert.equal(res.liveMap, [...sims.keys()].find((m) => sims.get(m).sundayLiveCount() > 0));
  // Stable : pas de doublon tant qu'il vit.
  res = syncSundayEvent(getSim, step());
  assert.equal(liveTotal(sims), 1);
  assert.equal(res.events.filter((e) => e.t === "spawn").length, 0);
  // Kill -> respawn immédiat (≤1 tick contrôleur), toujours 1 seul.
  for (const sim of sims.values()) {
    for (const [uid, e] of [...sim.entries]) {
      if (e && e.type === SUNDAY_UFONIT_TYPE) { e.hp = 0; e.sh = 0; sim.entries.delete(uid); }
    }
  }
  res = syncSundayEvent(getSim, step());
  assert.equal(liveTotal(sims), 1);
  assert.equal(res.events.filter((e) => e.t === "spawn").length, 1);
  // Fin de fenêtre : purge + annonce, zéro vivant, camps retirés.
  res = syncSundayEvent(getSim, SUN_OCT_END + 3000);
  assert.equal(res.active, false);
  assert.equal(liveTotal(sims), 0);
  for (const sim of sims.values()) {
    assert.equal(sim.camps.some((c) => c?.event === "sunday"), false);
  }
  assert.ok(res.events.some((e) => e.t === "end"));
});

test("UFONIT : affichage local x15, autres NPC x1 (envoi base intact)", () => {
  const src = readFileSync(new URL("../SRC/CORE/ORBIT_ENGINE.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  const start = src.indexOf("function sundayDamageMult(");
  assert.ok(start >= 0);
  let fn = null;
  for (let end = src.indexOf("\n}", start); end >= 0; end = src.indexOf("\n}", end + 2)) {
    try { new vm.Script(src.slice(start, end + 2)); fn = src.slice(start, end + 2); break; } catch {}
  }
  assert.ok(fn);
  const ctx = vm.createContext({ SUNDAY_DMG_MULT, SUNDAY_UFONIT_TYPE });
  vm.runInContext(`${fn}\nresult = [sundayDamageMult("npc_Event_Ufonit"), sundayDamageMult("npc_Streuner"), sundayDamageMult("")];`, ctx);
  assert.deepEqual([...ctx.result], [15, 1, 1]);
});
