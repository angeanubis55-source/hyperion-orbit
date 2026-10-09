import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { circleRectResolve, clamp } from "../SRC/CORE/COLLISION.js";

// Exerce le spawn de box en zone collectable + le ban anti-freeze du bot,
// sans démarrer une session ou un serveur réel.
const engine = readFileSync(new URL("../SRC/CORE/ORBIT_ENGINE.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");

function engineFunction(name, source = engine) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, name);
  const end = source.indexOf("\n}", start);
  assert.ok(end > start, name);
  return source.slice(start, end + 2);
}

function boxContext({ walls = [], world = { w: 11000, h: 7000 }, radiation = 0 } = {}) {
  const context = vm.createContext({
    clamp, circleRectResolve,
    WORLD: world,
    zoneWalls: walls,
    radiationDepth: () => radiation,
    BOX_SPAWN_BORDER: 150,
    COLLECTABLE_WALL_CLEAR: 140,
    COLLECTABLE_PICKUP_DY: -70,
    COLLECTABLE_COLLECT_CLEAR: 52,
    Bot: {},
  });
  vm.runInContext(engineFunction("clampBoxToPlayable"), context);
  vm.runInContext(engineFunction("resolveBoxOutsideWalls"), context);
  vm.runInContext(engineFunction("botBoxBanned"), context);
  vm.runInContext(engineFunction("botBoxBan"), context);
  return context;
}

test("box hors murs : NPC tué dans un caillou => box déplacée dehors, point de collecte libre", () => {
  const walls = [{ x: 5000, y: 3500, w: 400, h: 400 }];
  const context = boxContext({ walls });
  const fixed = vm.runInContext("resolveBoxOutsideWalls(5000, 3500, 40)", context);
  const half = 200 + 40;
  const outside = fixed.x <= 5000 - half || fixed.x >= 5000 + half
    || fixed.y <= 3500 - half || fixed.y >= 3500 + half;
  assert.ok(outside, `box sortie du mur : ${fixed.x},${fixed.y}`);
  // Point de collecte (70px au-dessus) également hors mur.
  const cx = fixed.x, cy = fixed.y - 70;
  const inWall = cx >= 5000 - 200 - 52 && cx <= 5000 + 200 + 52
    && cy >= 3500 - 200 - 52 && cy <= 3500 + 200 + 52;
  assert.equal(inWall, false);
});

test("box en bord de map : clampée à 150px mini, jamais hors limites", () => {
  const context = boxContext({});
  for (const [x, y] of [[10, 10], [10990, 6990], [-500, 3000], [5500, -200], [5500, 7200]]) {
    const fixed = vm.runInContext(`clampBoxToPlayable(${x}, ${y})`, context);
    assert.ok(fixed.x >= 150 && fixed.x <= 11000 - 150, `x=${fixed.x}`);
    assert.ok(fixed.y >= 150 && fixed.y <= 7000 - 150, `y=${fixed.y}`);
  }
});

test("même en radiation : la box est ramenée en zone jouable (bot compatible)", () => {
  const context = boxContext({ radiation: 500 });
  const fixed = vm.runInContext("clampBoxToPlayable(-300, 3500)", context);
  assert.equal(fixed.x, 150);
  assert.equal(fixed.y, 3500);
});

test("ban anti-freeze : box bannie 30s puis rééligible, autres box OK", () => {
  const context = boxContext({});
  vm.runInContext("botBoxBan({ id: 'box-stuck' })", context);
  assert.equal(vm.runInContext("botBoxBanned({ id: 'box-stuck' })", context), true);
  assert.equal(vm.runInContext("botBoxBanned({ id: 'box-autre' })", context), false);
  // Expiration simulée.
  vm.runInContext("Bot.boxBan['box-stuck'] = Date.now() - 1", context);
  assert.equal(vm.runInContext("botBoxBanned({ id: 'box-stuck' })", context), false);
});
