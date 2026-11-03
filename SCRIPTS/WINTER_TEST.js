import test from "node:test";
import assert from "node:assert/strict";
import {
  WINTER_MAPS,
  WINTER_MAP_GROUPS,
  WINTER_METEOROID_TYPE,
  WINTER_SUPER_METEOROID_TYPE,
  WINTER_TYPES,
  buildWinterCamp,
  isWinterEventActive,
  isWinterMap,
  winterPickMap,
  winterPreloadTypes,
  winterTypeForMap,
} from "../NPC/NPC_WINTER.js";
import { NPC_TYPES } from "../NPC/NPC_TYPES.js";
import { getPortalSkinForMap } from "../SRC/CORE/PORTAL_SKINS.js";
import { ZoneNpcSim, syncWinterEvent } from "./NPC_ROOM.js";

// Saison : 02/11 00h01 -> 31/01 23h59 (Paris, UTC+1 tout l'hiver).
const BEFORE = Date.parse("2026-11-01T23:00:59Z"); // 02/11 00h00:59 Paris
const START = Date.parse("2026-11-01T23:01:00Z"); // 02/11 00h01 Paris
const MID = Date.parse("2026-12-15T12:00:00Z");
const LAST = Date.parse("2027-01-31T22:59:59Z"); // 31/01 23h59:59 Paris
const AFTER = Date.parse("2027-01-31T23:00:00Z"); // 01/02 00h00 Paris
const SUMMER = Date.parse("2027-07-01T12:00:00Z");

test("Hiver : fenêtre 02/11 00h01 -> 31/01 23h59 Paris, chaque année", () => {
  // Plus de chevauchement avec Halloween (fin 01/11 23h59).
  assert.equal(isWinterEventActive(new Date(Date.parse("2026-11-01T12:00:00Z"))), false);
  assert.equal(isWinterEventActive(new Date(BEFORE)), false);
  assert.equal(isWinterEventActive(new Date(START)), true);
  assert.equal(isWinterEventActive(new Date(MID)), true);
  assert.equal(isWinterEventActive(new Date(Date.parse("2027-01-10T12:00:00Z"))), true);
  assert.equal(isWinterEventActive(new Date(LAST)), true);
  assert.equal(isWinterEventActive(new Date(AFTER)), false);
  assert.equal(isWinterEventActive(new Date(SUMMER)), false);
  assert.equal(isWinterEventActive(new Date(Date.parse("2027-11-15T12:00:00Z"))), true);
});

test("Hiver : 4 paires (Ice x3, Super Ice en 4-4/4-5), tirage dans la paire", () => {
  assert.deepEqual(WINTER_MAP_GROUPS.map((g) => [...g]), [["1-6", "1-7"], ["2-6", "2-7"], ["3-6", "3-7"], ["4-4", "4-5"]]);
  assert.deepEqual([...WINTER_MAPS], ["1-6", "1-7", "2-6", "2-7", "3-6", "3-7", "4-4", "4-5"]);
  assert.deepEqual([...WINTER_TYPES], [WINTER_METEOROID_TYPE, WINTER_SUPER_METEOROID_TYPE]);
  for (const m of ["1-6", "2-7", "3-6"]) assert.equal(winterTypeForMap(m), WINTER_METEOROID_TYPE);
  for (const m of ["4-4", "4-5"]) assert.equal(winterTypeForMap(m), WINTER_SUPER_METEOROID_TYPE);
  assert.equal(winterTypeForMap("4-1"), null);
  assert.ok(NPC_TYPES[WINTER_SUPER_METEOROID_TYPE]);
  assert.equal(buildWinterCamp({ w: 22000, h: 14000 }, () => 0.5, WINTER_SUPER_METEOROID_TYPE).type, WINTER_SUPER_METEOROID_TYPE);
  assert.deepEqual(winterPreloadTypes("4-5", new Date(MID)), [WINTER_SUPER_METEOROID_TYPE]);
  assert.equal(isWinterMap("2-7"), true);
  assert.equal(isWinterMap("1-3"), false);
  for (const group of WINTER_MAP_GROUPS) {
    assert.equal(winterPickMap(group, () => 0), group[0]);
    assert.equal(winterPickMap(group, () => 0.99), group[1]);
  }
  assert.ok(NPC_TYPES[WINTER_METEOROID_TYPE]);
  const camp = buildWinterCamp({ w: 11000, h: 7000 }, () => 0.5);
  assert.equal(camp.type, WINTER_METEOROID_TYPE);
  assert.equal(camp.event, "winter");
  assert.equal(camp.roaming, true);
  assert.deepEqual([camp.maxAlive, camp.respawn], [1, 0]);
  assert.deepEqual(winterPreloadTypes("1-6", new Date(MID)), [WINTER_METEOROID_TYPE]);
  assert.deepEqual(winterPreloadTypes("1-6", new Date(SUMMER)), []);
  assert.deepEqual(winterPreloadTypes("1-3", new Date(MID)), []);
});

test("Hiver : neige sur les portails NORMAUX, BATTLE, BL, QZ et MAUDITE ; LOW en skin pirate", () => {
  // Dépend de l'heure réelle : on vérifie la cohérence avec la saison.
  const on = isWinterEventActive(new Date());
  for (const m of ["1-2", "3-8", "4-2", "4-5", "1-BL", "3-BL", "qz", "MAUDITE"]) {
    assert.equal(!!getPortalSkinForMap(m)?.seasonalOverlay, on, m);
  }
  for (const m of ["5-2", "low", "alpha", "kronos", "eternal"]) {
    assert.equal(getPortalSkinForMap(m)?.seasonalOverlay ?? null, null, m);
  }
  // MAUDITE garde le visuel standard sous la neige.
  if (on) {
    assert.equal(getPortalSkinForMap("MAUDITE").idle.src, "ASSETS/STANDARD_PORTAL/DESACTIVE.png");
  }
  // LOW : skin pirate, comme 5-2.
  assert.equal(getPortalSkinForMap("low").idle.src, "ASSETS/PIRATES_PORTAL/DESACTIVE.png");
  assert.equal(getPortalSkinForMap("LOW").idle.src, "ASSETS/PIRATES_PORTAL/DESACTIVE.png");
});

function makeSims() {
  const sims = new Map();
  for (const m of WINTER_MAPS) sims.set(m, new ZoneNpcSim(m, { w: 11000, h: 7000 }, []));
  return sims;
}
const liveIn = (sims, maps) => {
  let n = 0;
  for (const m of maps) {
    for (const e of sims.get(m).entries.values()) {
      if (e && WINTER_TYPES.includes(e.type) && e.hp > 0) n++;
    }
  }
  return n;
};
const liveEntryIn = (sims, maps) => {
  for (const m of maps) {
    const sim = sims.get(m);
    for (const e of sim.entries.values()) {
      if (e && WINTER_TYPES.includes(e.type) && e.hp > 0) return { sim, e, map: m };
    }
  }
  return null;
};

test("Hiver : 1 Ice Meteoroid par paire (3 en tout), respawn dans la paire, purge hors saison", () => {
  const sims = makeSims();
  const getSim = (m) => sims.get(String(m).toLowerCase()) || null;
  let t = MID;
  const step = () => { t += 3000; return t; };

  // Hors saison : rien.
  let res = syncWinterEvent(getSim, BEFORE);
  assert.equal(res.active, false);
  assert.equal(liveIn(sims, WINTER_MAPS), 0);

  // Pendant : exactement 1 par paire.
  res = syncWinterEvent(getSim, step());
  assert.equal(res.active, true);
  assert.equal(res.events.filter((e) => e.t === "start").length, 1);
  assert.equal(res.events.filter((e) => e.t === "spawn").length, 4);
  for (const group of WINTER_MAP_GROUPS) assert.equal(liveIn(sims, group), 1);
  assert.equal(res.liveMaps.length, 4);
  // Bon type par paire : Super Ice Meteoroid en 4-4/4-5 seulement.
  assert.equal(liveEntryIn(sims, WINTER_MAP_GROUPS[3]).e.type, WINTER_SUPER_METEOROID_TYPE);
  for (const group of WINTER_MAP_GROUPS.slice(0, 3)) assert.equal(liveEntryIn(sims, group).e.type, WINTER_METEOROID_TYPE);

  // Stable : pas de doublon tant qu'ils vivent.
  res = syncWinterEvent(getSim, step());
  assert.equal(res.events.filter((e) => e.t === "spawn").length, 0);
  assert.equal(liveIn(sims, WINTER_MAPS), 4);

  // Kills : jamais de respawn local par le tick, le contrôleur respawn
  // dans la même paire, sur des maps variées.
  const group = WINTER_MAP_GROUPS[1];
  const seen = new Set();
  for (let cycle = 0; cycle < 8; cycle++) {
    const found = liveEntryIn(sims, group);
    assert.ok(found);
    seen.add(found.map);
    found.sim.setPlayer("u_1", found.e.x + 100, found.e.y, { dead: false });
    found.sim.applyHit("u_1", { uid: found.e.uid, dmg: 2e9, execOk: true, critChance: 0, variance: 0 });
    assert.equal(liveIn(sims, group), 0);
    for (let i = 0; i < 5; i++) found.sim.tick(0.1);
    assert.equal(liveIn(sims, group), 0);
    res = syncWinterEvent(getSim, step());
    assert.equal(liveIn(sims, group), 1);
    assert.equal(res.events.filter((e) => e.t === "spawn").length, 1);
    // Les autres paires ne bougent pas.
    assert.equal(liveIn(sims, WINTER_MAP_GROUPS[0]), 1);
    assert.equal(liveIn(sims, WINTER_MAP_GROUPS[2]), 1);
    assert.equal(liveIn(sims, WINTER_MAP_GROUPS[3]), 1);
  }
  assert.ok(seen.size >= 2);

  // Mort hors tir joueur (proie d'un JPC) : pas de respawn local non plus.
  const prey = liveEntryIn(sims, WINTER_MAP_GROUPS[0]);
  prey.sim.jpcKillPrey(prey.e, t);
  for (let i = 0; i < 30; i++) prey.sim.tick(0.1);
  assert.equal(liveIn(sims, WINTER_MAP_GROUPS[0]), 0);
  syncWinterEvent(getSim, step());
  assert.equal(liveIn(sims, WINTER_MAP_GROUPS[0]), 1);

  // Fin de saison : purge, camps retirés, une seule annonce de fin.
  res = syncWinterEvent(getSim, AFTER + 3000);
  assert.equal(res.active, false);
  assert.equal(liveIn(sims, WINTER_MAPS), 0);
  for (const sim of sims.values()) assert.equal(sim.camps.some((c) => c?.event === "winter"), false);
  assert.equal(res.events.filter((e) => e.t === "end").length, 1);
});

// Horloge contrôlée : la sim lit Date.now() pour les vagues et le reset 15 s.
function withClock(startMs, fn) {
  const realNow = Date.now;
  let now = startMs;
  Date.now = () => now;
  try { return fn({ advance: (ms) => { now += ms; return now; }, now: () => now }); }
  finally { Date.now = realNow; }
}
function iceSim() {
  const camp = { id: 1, ...buildWinterCamp({ w: 11000, h: 7000 }, () => 0.5) };
  const sim = new ZoneNpcSim("1-6", { w: 11000, h: 7000 }, [camp]);
  assert.equal(sim.spawnFor(camp, Date.now()), true);
  const ice = [...sim.entries.values()].find((e) => e.type === WINTER_METEOROID_TYPE);
  return { sim, ice };
}
const icyOf = (sim, ice) => [...sim.entries.values()].filter((e) => e && e.masterUid === ice.uid && e.hp > 0);

test("Ice Meteoroid : comme le Cubikon, vague de 20 Icy au premier impact, immobile tant qu'attaqué", () => {
  withClock(MID, (clock) => {
    const { sim, ice } = iceSim();
    // Sans attaque : il se déplace.
    let x0 = ice.x, y0 = ice.y;
    for (let i = 0; i < 10; i++) sim.tick(0.1);
    assert.ok(Math.hypot(ice.x - x0, ice.y - y0) > 1, "doit bouger hors combat");
    // Premier impact : vague 1 s plus tard (pas d'animation d'ouverture).
    sim.setPlayer("u_1", ice.x + 400, ice.y, { dead: false });
    sim.applyHit("u_1", { uid: ice.uid, dmg: 1000, critChance: 0, variance: 0 });
    assert.equal(ice.cubeArmed, true);
    assert.equal(icyOf(sim, ice).length, 0);
    clock.advance(1100);
    sim.tick(0.1);
    const icy = icyOf(sim, ice);
    assert.equal(icy.length, 20);
    assert.ok(icy.every((e) => e.type === "npc_Meteoroid_Icy"));
    // Attaqué : ne bouge plus, même en encaissant pendant plusieurs secondes.
    x0 = ice.x; y0 = ice.y;
    for (let i = 0; i < 50; i++) {
      clock.advance(100);
      if (i % 10 === 0) sim.applyHit("u_1", { uid: ice.uid, dmg: 1000, critChance: 0, variance: 0 });
      sim.tick(0.1);
    }
    assert.equal(ice.x, x0);
    assert.equal(ice.y, y0);
    // Taper un Icy compte aussi comme une attaque.
    const hitAt = clock.advance(10000);
    sim.applyHit("u_1", { uid: icyOf(sim, ice)[0].uid, dmg: 10, critChance: 0, variance: 0 });
    assert.equal(ice.lastCubeHitAt, hitAt);
    // 15 s sans coup : Icy retirés, il repart.
    clock.advance(15100);
    sim.tick(0.1);
    assert.equal(icyOf(sim, ice).length, 0);
    assert.equal(ice.cubeArmed, false);
    x0 = ice.x; y0 = ice.y;
    for (let i = 0; i < 10; i++) { clock.advance(100); sim.tick(0.1); }
    assert.ok(Math.hypot(ice.x - x0, ice.y - y0) > 1, "doit repartir après 15 s sans coup");
  });
});

test("Ice Meteoroid : renfort sous 5 Icy, Icy désagrégés à sa mort, retirés à la purge", () => {
  withClock(MID, (clock) => {
    const { sim, ice } = iceSim();
    sim.setPlayer("u_1", ice.x + 400, ice.y, { dead: false });
    sim.applyHit("u_1", { uid: ice.uid, dmg: 1000, critChance: 0, variance: 0 });
    clock.advance(1100); sim.tick(0.1);
    // Tue 16 Icy : il en reste 4 -> renfort jusqu'à 20.
    for (const e of icyOf(sim, ice).slice(0, 16)) {
      sim.applyHit("u_1", { uid: e.uid, dmg: 2e9, execOk: true, critChance: 0, variance: 0 });
    }
    assert.equal(icyOf(sim, ice).length, 4);
    sim.tick(0.1);
    clock.advance(1100); sim.tick(0.1);
    assert.equal(icyOf(sim, ice).length, 20);
    // Mort du maître : les Icy se désagrègent.
    sim.applyHit("u_1", { uid: ice.uid, dmg: 2e9, execOk: true, critChance: 0, variance: 0 });
    assert.ok(!(ice.hp > 0));
    assert.ok(icyOf(sim, ice).every((e) => e.decaying === true));

    // Purge hors saison : maître et Icy partent ensemble.
    const fresh = iceSim();
    fresh.sim.setPlayer("u_1", fresh.ice.x + 400, fresh.ice.y, { dead: false });
    fresh.sim.applyHit("u_1", { uid: fresh.ice.uid, dmg: 1000, critChance: 0, variance: 0 });
    clock.advance(1100); fresh.sim.tick(0.1);
    assert.equal(icyOf(fresh.sim, fresh.ice).length, 20);
    fresh.sim.purgeWinter();
    assert.equal([...fresh.sim.entries.values()].filter((e) => e.type === WINTER_METEOROID_TYPE || e.masterUid === fresh.ice.uid).length, 0);
  });
});

test("Ice Meteoroid : accolades <=< >=> et variante d'Icy", () => {
  assert.equal(NPC_TYPES.npc_Ice_Meteoroid.name, "<=< Ice Meteoroid >=>");
  assert.equal(NPC_TYPES.npc_Super_Ice_Meteoroid.name, "<=< Super Ice Meteoroid >=>");
  const icy = NPC_TYPES.npc_Meteoroid_Icy;
  assert.equal(icy.name, "<=< Icy >=>");
  // Mêmes stats et sprite que l'Icy de base (qui garde son nom), sauf la
  // vitesse : celle des Protegit du Cubikon.
  for (const k of ["r", "hp", "shield", "bulletDmg", "shootRange"]) assert.equal(icy[k], NPC_TYPES.npc_Icy[k]);
  assert.equal(icy.speed, NPC_TYPES.npc_Protegit.speed);
  assert.equal(NPC_TYPES.npc_Icy.speed, 250);
  assert.equal(icy.sprite.path, NPC_TYPES.npc_Icy.sprite.path);
  assert.equal(NPC_TYPES.npc_Icy.name, "-=[ Icy ]=-");
});

test("Ice Meteoroid : signal hold envoyé tant qu'il est attaqué, Icy patrouillent comme les Protegit", () => {
  withClock(MID, (clock) => {
    const { sim, ice } = iceSim();
    const snapIce = () => sim.snapshot().list.find((n) => n.uid === ice.uid);
    assert.equal(snapIce().hold, undefined);
    sim.setPlayer("u_1", ice.x + 400, ice.y, { dead: false });
    sim.applyHit("u_1", { uid: ice.uid, dmg: 1000, critChance: 0, variance: 0 });
    // Dès le premier impact, avant même la vague d'Icy.
    assert.equal(snapIce().hold, 1);
    clock.advance(1100); sim.tick(0.1);
    // Icy : patrouille Protegit (cap 0,6-1,4 s, 180-700 du maître, x0,85-1).
    const icy = icyOf(sim, ice);
    assert.equal(icy.length, 20);
    for (let i = 0; i < 3; i++) { clock.advance(100); sim.tick(0.1); }
    for (const e of icy) {
      assert.ok(e.patrolTime <= 1.4);
      assert.ok(e.patrolSpeed >= 0.85 && e.patrolSpeed <= 1);
      assert.ok(Math.hypot(e.patrolX - ice.x, e.patrolY - ice.y) <= 700 + 1);
    }
    // 15 s sans coup : plus de hold.
    clock.advance(15100); sim.tick(0.1);
    assert.equal(snapIce().hold, undefined);
  });
});

test("Icy de l'Ice Meteoroid : munition du Kristallin", () => {
  assert.deepEqual(NPC_TYPES.npc_Meteoroid_Icy.bulletSprite, NPC_TYPES.npc_Kristallin.bulletSprite);
  assert.equal(NPC_TYPES.npc_Icy.bulletSprite.src, "COMBAT/MUNITIONS/SPECIAL8.png");
});

test("Super Ice Meteoroid : même mécanique que l'Ice, 2x plus d'Icy, immobile tant qu'attaqué", () => {
  withClock(MID, (clock) => {
    const camp = { id: 1, ...buildWinterCamp({ w: 22000, h: 14000 }, () => 0.5, WINTER_SUPER_METEOROID_TYPE) };
    const sim = new ZoneNpcSim("4-5", { w: 22000, h: 14000 }, [camp]);
    assert.equal(sim.spawnFor(camp, Date.now()), true);
    const sup = [...sim.entries.values()].find((e) => e.type === WINTER_SUPER_METEOROID_TYPE);
    sim.setPlayer("u_1", sup.x + 400, sup.y, { dead: false });
    sim.applyHit("u_1", { uid: sup.uid, dmg: 1000, critChance: 0, variance: 0 });
    clock.advance(1100); sim.tick(0.1);
    const icy = icyOf(sim, sup);
    assert.equal(icy.length, 40);
    assert.ok(icy.every((e) => e.type === "npc_Meteoroid_Icy"));
    const x0 = sup.x, y0 = sup.y;
    for (let i = 0; i < 20; i++) { clock.advance(100); sim.tick(0.1); }
    assert.deepEqual([sup.x, sup.y], [x0, y0]);
    sim.purgeWinter();
    assert.equal([...sim.entries.values()].filter((e) => e.uid === sup.uid || e.masterUid === sup.uid).length, 0);
  });
});

test("Super Ice Meteoroid : récompenses, cargaison et stats", async () => {
  const { resolveNpcReward } = await import("../NPC/NPC_BALANCE.js");
  const { getNpcCargoOres } = await import("../NPC/NPC_CARGO.js");
  assert.deepEqual(resolveNpcReward(WINTER_SUPER_METEOROID_TYPE), { credits: 42553600, exp: 2000000, honor: 8000 });
  assert.deepEqual(getNpcCargoOres(WINTER_SUPER_METEOROID_TYPE, "4-4"),
    { prometium: 2400, endurium: 2400, terbium: 2400, prometid: 1024, duranium: 1024, promerium: 128, xenomit: 512 });
  const t = NPC_TYPES[WINTER_SUPER_METEOROID_TYPE];
  assert.deepEqual([t.hp, t.shield, t.bulletDmg], [3200000, 2400000, 0]);
});

test("Icy de l'Ice et du Super Ice : 100k PV, 80k bouclier, 2k dégâts", () => {
  for (const [map, type] of [["1-6", WINTER_METEOROID_TYPE], ["4-5", WINTER_SUPER_METEOROID_TYPE]]) {
    const camp = { id: 1, ...buildWinterCamp({ w: 11000, h: 7000 }, () => 0.5, type) };
    const sim = new ZoneNpcSim(map, { w: 11000, h: 7000 }, [camp]);
    sim.spawnFor(camp, Date.now());
    const master = [...sim.entries.values()].find((e) => e.type === type);
    sim.spawnCubikonWave(master, Date.now());
    for (const e of icyOf(sim, master)) {
      assert.deepEqual([e.hpMax, e.shMax, e.bulletDmg], [100000, 80000, 2000]);
    }
  }
});

test("Hiver : Bonus Box classiques en visuel glace, autres box inchangées", async () => {
  const { readFileSync, existsSync } = await import("node:fs");
  const vm = await import("node:vm");
  const engine = readFileSync(new URL("../SRC/CORE/ORBIT_ENGINE.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  const start = engine.indexOf("const WINTER_BONUS_BOX_SPRITE = {");
  const fnStart = engine.indexOf("function collectableSpriteFor(type) {");
  const end = engine.indexOf("\n}\n", fnStart) + 3;
  const candy = engine.slice(engine.indexOf("const CANDY_BOX_SPRITE = {"), engine.indexOf("};", engine.indexOf("const CANDY_BOX_SPRITE = {")) + 2);
  const run = (winter, halloween) => {
    const ctx = vm.createContext({
      isWinterEventActive: () => winter, isHalloweenEventActive: () => halloween,
      COLLECTABLE_DEFS: { Bonus_Box: { sprite: { path: "ASSETS/COLLECTABLES/BONUS_BOX/" } }, Green_Booty_Box: { sprite: { path: "GREEN/" } }, Cargo_Box: { sprite: { path: "CARGO/" } } },
    });
    vm.runInContext(candy + "\n" + engine.slice(start, end) + "\nglobalThis.f = collectableSpriteFor;", ctx);
    return ctx.f;
  };
  const on = run(true, false), off = run(false, false);
  assert.equal(on("Bonus_Box").path, "ASSETS/COLLECTABLES/BONUS_BOX_HIVER_GLACE/");
  assert.equal(off("Bonus_Box").path, "ASSETS/COLLECTABLES/BONUS_BOX/");
  assert.equal(on("Green_Booty_Box").path, "GREEN/");
  assert.equal(on("Cargo_Box").path, "CARGO/");
  const sp = on("Bonus_Box");
  for (let i = sp.firstNumber; i < sp.firstNumber + sp.frames; i++) {
    assert.ok(existsSync(new URL(`../${sp.path}${i}${sp.ext}`, import.meta.url)), `frame ${i} manquante`);
  }
});

test("Bot : Ice, Super Ice et Icy listés pendant l'hiver seulement", async () => {
  const { buildBotNpcCatalog } = await import("../SRC/CORE/BOT_NPC_CATALOG.js");
  const rows = buildBotNpcCatalog({ locations: {}, npcTypes: NPC_TYPES, now: new Date(MID) });
  const byType = Object.fromEntries(rows.map((r) => [r.types[0], r]));
  assert.deepEqual(byType.npc_Ice_Meteoroid.maps, ["1-6", "1-7", "2-6", "2-7", "3-6", "3-7"]);
  assert.deepEqual(byType.npc_Super_Ice_Meteoroid.maps, ["4-4", "4-5"]);
  assert.deepEqual(byType.npc_Meteoroid_Icy.maps, [...WINTER_MAPS]);
  for (const r of Object.values(byType)) assert.equal(r.event, "Hiver");
  assert.equal(buildBotNpcCatalog({ locations: {}, npcTypes: NPC_TYPES, now: new Date(SUMMER) }).length, 0);
});

test("Écran de chargement : image d'hiver du 02/11 00h01 au 31/01 23h59 (Paris), Halloween avant", async () => {
  const { readFileSync, existsSync } = await import("node:fs");
  const vm = await import("node:vm");
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const i = html.indexOf("// Hiver : memes bornes que NPC_WINTER.js");
  const script = html.slice(html.lastIndexOf("<script>", i) + 8, html.indexOf("</script>", i));
  const classAt = (iso) => {
    const classes = new Set();
    const RealDate = Date;
    const FakeDate = class extends RealDate { constructor(...a) { super(...(a.length ? a : [iso])); } };
    vm.runInNewContext(script, {
      Date: FakeDate, Intl, Number, Image: class {},
      document: { getElementById: () => ({ classList: { add: (c) => classes.add(c) } }) },
    });
    return [...classes].join(",");
  };
  assert.equal(classAt("2026-10-20T12:00:00Z"), "halloween");
  assert.equal(classAt("2026-11-01T22:59:59Z"), "halloween"); // 01/11 23h59 Paris
  assert.equal(classAt("2026-11-01T23:00:59Z"), ""); // 02/11 00h00 Paris
  assert.equal(classAt("2026-11-01T23:01:00Z"), "winter"); // 02/11 00h01 Paris
  assert.equal(classAt("2026-12-25T12:00:00Z"), "winter");
  assert.equal(classAt("2027-01-31T22:59:00Z"), "winter"); // 31/01 23h59 Paris
  assert.equal(classAt("2027-01-31T23:00:00Z"), ""); // 01/02 00h00 Paris
  assert.equal(classAt("2027-06-15T12:00:00Z"), "");
  assert.ok(existsSync(new URL("../ASSETS/UI/LOADING_SCREEN_WINTER.webp", import.meta.url)));
  assert.match(readFileSync(new URL("../style.css", import.meta.url), "utf8"), /\.loadingOverlay\.winter\s*\{[^}]*LOADING_SCREEN_WINTER\.webp/);
});
