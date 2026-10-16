import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { isHalloweenEventActive, halloweenEventEnd, halloweenCountdown,
  isHalloweenVariantType, halloweenRoleOf } from "../NPC/NPC_HALLOWEEN.js";
import { COLLECTABLE_TYPES } from "../SRC/DATA/COLLECTABLES.js";
import { ZoneNpcSim } from "./NPC_ROOM.js";

const beforeStart = Date.parse("2026-10-16T20:49:59Z");
const start = Date.parse("2026-10-16T20:50:00Z"); // 22h50 à Paris (UTC+2).
const end = Date.parse("2026-11-01T22:59:59Z"); // 23h59 à Paris (UTC+1).

test("Halloween : bornes en heure de Paris et fin après le changement d'heure", () => {
  assert.equal(isHalloweenEventActive(beforeStart), false);
  assert.equal(isHalloweenEventActive(start), true);
  assert.equal(isHalloweenEventActive("2026-10-16T20:54:27Z"), true, "heure du déploiement VPS");
  assert.equal(isHalloweenEventActive("2026-10-25T01:30:00Z"), true);
  assert.equal(isHalloweenEventActive(end), true);
  assert.equal(isHalloweenEventActive(end + 1), false);
  assert.equal(halloweenEventEnd(start).getTime(), end);
  const countdown = halloweenCountdown(end - 3600000);
  assert.equal(countdown.active, true);
  assert.equal(countdown.hours, 1);
  assert.equal(countdown.endsAt, end);
  assert.equal(halloweenCountdown(end + 1000).seconds, 0);
});

test("Halloween : calendrier annuel, dates invalides et cache entre années", () => {
  for (const year of [2026, 2027, 2026]) {
    assert.equal(isHalloweenEventActive(`${year}-10-16T20:50:00Z`), true);
    assert.equal(halloweenEventEnd(`${year}-10-16T20:50:00Z`).toISOString(), `${year}-11-01T22:59:59.000Z`);
  }
  assert.equal(halloweenEventEnd("2026-12-31T23:30:00Z").getUTCFullYear(), 2027);
  assert.equal(isHalloweenEventActive("invalide"), false);
  assert.equal(halloweenEventEnd(new Date(NaN)), null);
  assert.equal(halloweenCountdown(NaN).endsAt, 0);
});

for (const timezone of ["UTC", "Europe/Paris", "America/New_York"]) {
  test(`Halloween : même activation et même compte à rebours avec TZ=${timezone}`, () => {
    const moduleUrl = new URL("../NPC/NPC_HALLOWEEN.js", import.meta.url).href;
    const output = execFileSync(process.execPath, ["--input-type=module", "-e", `
      import { isHalloweenEventActive, halloweenEventEnd } from ${JSON.stringify(moduleUrl)};
      console.log(JSON.stringify({
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        before: isHalloweenEventActive(${beforeStart}),
        active: isHalloweenEventActive(${start}),
        end: halloweenEventEnd(${start}).getTime(),
        after: isHalloweenEventActive(${end + 1}),
      }));
    `], { env: { ...process.env, TZ: timezone }, encoding: "utf8", windowsHide: true });
    const result = JSON.parse(output);
    assert.equal(result.timezone, timezone);
    assert.equal(result.before, false);
    assert.equal(result.active, true);
    assert.equal(result.end, end);
    assert.equal(result.after, false);
  });
}

test("serveur : apparition en direct, 50 kills, trois boss, retour aux normaux et fin", async t => {
  t.mock.timers.enable({ apis: ["Date"], now: beforeStart });
  const sim = await ZoneNpcSim.create("1-3");
  assert.ok(sim);
  sim.tick(.1);
  const live = role => [...sim.entries.values()].filter(e => e.hp > 0
    && isHalloweenVariantType(e.type) && halloweenRoleOf(e.type) === role);
  assert.equal(live("normal").length, 0);
  t.mock.timers.setTime(start + 5000);
  sim.tick(.1);
  assert.equal(live("normal").length, 16);
  assert.equal(live("boss").length, 0);
  function kill(entry) {
    sim.players.set("u_halloween-test", { x: entry.x, y: entry.y, dead: false });
    sim.applyHit("u_halloween-test", { uid: entry.uid, dmg: 100000000, variance: 0, critChance: 0 });
    assert.equal(entry.hp, 0);
    sim.players.clear();
    sim.tick(.1);
  }
  for (let i = 0; i < 50; i++) kill(live("normal")[0]);
  assert.equal(sim.halloween.phase, "boss");
  assert.equal(live("normal").length, 0);
  assert.equal(live("boss").length, 3);
  kill(live("boss")[0]);
  assert.equal(live("boss").length, 2, "un boss tué ne réapparaît pas dans le même cycle");
  kill(live("boss")[0]);
  kill(live("boss")[0]);
  assert.equal(sim.halloween.phase, "normal");
  assert.equal(live("normal").length, 16);
  assert.equal(live("boss").length, 0);
  t.mock.timers.setTime(end + 1000);
  sim.tick(.1);
  assert.equal(live("normal").length, 0);
  assert.equal(live("boss").length, 0);
});

test("serveur : 50 Pumpkin Box à l'ouverture et en direct, exclusions et fin respectées", async t => {
  t.mock.timers.enable({ apis: ["Date"], now: beforeStart });
  const source = readFileSync(new URL("./MULTI_SERVER.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  const functionSource = name => {
    const start = source.indexOf(`function ${name}(`);
    assert.ok(start >= 0, name);
    const end = source.indexOf("\n}", start);
    assert.ok(end > start, name);
    return source.slice(start, end + 2);
  };
  const intervals = [];
  const context = vm.createContext({ Map, COLLECTABLE_TYPES, isHalloweenEventActive,
    boxRooms: new Map(), boxRoomLoads: new Map(), boxRespawns: new Map(), rooms: new Map(), npcSims: new Map(),
    ensureNpcSim: async () => null, randomBoxPosition: () => ({ x: 500, y: 500 }),
    setInterval: fn => intervals.push(fn),
  });
  vm.runInContext(functionSource("collectableAllowedOnMap") + "\n" + functionSource("ensureBoxRoom"), context);
  const intervalStart = source.indexOf("// Event Halloween : apparition / disparition des Pumpkin Box en direct");
  const intervalEnd = source.indexOf("}, 5000);", intervalStart);
  assert.ok(intervalStart >= 0 && intervalEnd > intervalStart);
  vm.runInContext(source.slice(intervalStart, intervalEnd + "}, 5000);".length), context);
  const pumpkins = boxes => [...boxes.values()].filter(b => b.type === "Pumpkin_Box");
  const boxes = await context.ensureBoxRoom("1-3");
  assert.equal(pumpkins(boxes).length, 0);
  t.mock.timers.setTime(start);
  intervals[0]();
  assert.equal(pumpkins(boxes).length, 50, "room déjà ouverte avant l'event");
  intervals[0]();
  assert.equal(pumpkins(boxes).length, 50, "aucun doublon");
  assert.equal(pumpkins(await context.ensureBoxRoom("2-4")).length, 50, "nouvelle room pendant l'event");
  assert.equal(pumpkins(await context.ensureBoxRoom("1-bl")).length, 0);
  t.mock.timers.setTime(end + 1000);
  intervals[0]();
  assert.equal(pumpkins(boxes).length, 0);
});
