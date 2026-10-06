import test from "node:test";
import assert from "node:assert/strict";
import { BOT_RANGE, computeBotCombatMove, computeBotWallMove, computeWallDetour, isSegmentBlocked } from "../SRC/CORE/BOT_NAVIGATION.js";
import { circleRectResolve } from "../SRC/CORE/COLLISION.js";
import { advancePlayerToTarget, updatePlayerVelocity, playerSlowMult } from "../SRC/CORE/FRAME_SYSTEMS.js";
import { getZoneWalls } from "../MAPS/1-BL/SPAWNS.js";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const bounds = { minX: 0, minY: 0, maxX: 10000, maxY: 6000, margin: 80 };
const npc = { id: 7, x: 5000, y: 3000, vx: 0, vy: 0, hp: 100 };
const run = (x, state = {}) => computeBotCombatMove({ player: { x, y: 3000 }, npc, range: 1000, bounds, state });

test("keeps a safety margin inside laser range", () => {
  const out = run(5800);
  assert.equal(out.desired, 1000 * BOT_RANGE.desired);
  assert.ok(out.desired < 1000);
  assert.equal(out.mode, "orbit");
});

test("retreats close and approaches only when genuinely far", () => {
  assert.equal(run(5200).mode, "retreat");
  assert.equal(run(6100).mode, "approach");
});

test("honors a target-specific safe distance", () => {
  const out = computeBotCombatMove({
    player: { x: 5650, y: 3000 }, npc, range: 700, desiredDistance: 665, bounds,
  });
  assert.equal(out.desired, 665);
  assert.equal(out.mode, "orbit");
  assert.ok(out.inner > 600);
  assert.ok(out.outer < 700);
});

test("hysteresis prevents mode flip-flop", () => {
  const a = run(5690, { mode: "retreat", direction: 1 });
  const b = run(5830, a.state);
  assert.equal(a.mode, "retreat");
  assert.equal(b.mode, "orbit");
  assert.equal(b.state.direction, 1);
});

test("orbit always produces a meaningful bounded waypoint", () => {
  const out = computeBotCombatMove({ player: { x: 5800, y: 3000 }, npc, range: 1000, bounds });
  assert.ok(Math.hypot(out.x - 5800, out.y - 3000) > 100);
  assert.ok(out.x >= 80 && out.x <= 9920 && out.y >= 80 && out.y <= 5920);
});

test("wall handling remains bounded", () => {
  const edgeNpc = { ...npc, x: 120, y: 120 };
  const out = computeBotCombatMove({ player: { x: 250, y: 120 }, npc: edgeNpc, range: 1000, bounds, state: { direction: 1 } });
  assert.ok(out.x >= 80 && out.y >= 80);
  assert.equal(Math.abs(out.state.direction), 1);
});

test("wall avoidance turns once then keeps circling away from radiation", () => {
  const edgeNpc = { ...npc, x: 120, y: 120 };
  const ship = { x: 170, y: 120 };
  const first = computeBotCombatMove({ player: ship, npc: edgeNpc, range: 1000, bounds, state: { direction: 1 }, dt: 1 / 60 });
  const second = computeBotCombatMove({ player: ship, npc: edgeNpc, range: 1000, bounds, state: first.state, dt: 1 / 60 });
  assert.ok(first.x >= 80 && first.y >= 80);
  assert.ok(second.x >= 80 && second.y >= 80);
  assert.equal(second.state.direction, first.state.direction);
});

test("other NPCs never influence movement toward the locked target", () => {
  const input = { player: { x: 5800, y: 3000 }, npc, range: 1000, bounds, state: { direction: 1 } };
  const alone = computeBotCombatMove(input);
  const surrounded = computeBotCombatMove({
    ...input,
    enemies: [
      { id: 20, x: 5790, y: 3000, hp: 100 },
      { id: 21, x: 5810, y: 3000, hp: 100 },
      { id: 22, x: 5800, y: 3010, hp: 100 },
    ],
  });
  assert.equal(surrounded.x, alone.x);
  assert.equal(surrounded.y, alone.y);
  assert.deepEqual(surrounded.state, alone.state);
});

test("long simulation keeps moving without range oscillation", () => {
  const movingNpc = { ...npc };
  const ship = { x: 6200, y: 3000 };
  let state = {};
  let travelled = 0;
  const distances = [];
  for (let frame = 0; frame < 360; frame++) {
    movingNpc.x += 0.7;
    movingNpc.y += Math.sin(frame / 40) * 0.15;
    const out = computeBotCombatMove({ player: ship, npc: movingNpc, range: 1000, bounds, state, dt: 1 / 60 });
    state = out.state;
    const dx = out.x - ship.x, dy = out.y - ship.y;
    const length = Math.hypot(dx, dy) || 1;
    const step = Math.min(7, length);
    ship.x += dx / length * step;
    ship.y += dy / length * step;
    travelled += step;
    if (frame > 120) distances.push(Math.hypot(ship.x - movingNpc.x, ship.y - movingNpc.y));
  }
  assert.ok(travelled > 2000);
  assert.ok(Math.min(...distances) > 650);
  assert.ok(Math.max(...distances) < 970);
});

function followRoute(walls, start, goal, { dt = 1 / 60, seconds = 30, bounds = { minX: 0, minY: 0, maxX: 4000, maxY: 4000 } } = {}) {
  const ship = { ...start, r: 18, baseSpeed: 400, vx: 0, vy: 0 };
  const state = {};
  let arrived = false, collisions = 0, travelled = 0;
  for (let frame = 0; frame < seconds / dt; frame++) {
    const step = computeWallDetour({ fromX: ship.x, fromY: ship.y, toX: goal.x, toY: goal.y,
      walls, radius: ship.r, state, dt, bounds });
    assert.ok(Number.isFinite(step.x) && Number.isFinite(step.y));
    assert.ok(step.x >= bounds.minX && step.x <= bounds.maxX && step.y >= bounds.minY && step.y <= bounds.maxY);
    const target = { ...step, active: !step.unreachable };
    updatePlayerVelocity(ship, { x: target.active ? step.x - ship.x : 0, y: target.active ? step.y - ship.y : 0 }, dt);
    const before = { x: ship.x, y: ship.y };
    advancePlayerToTarget(ship, target, dt);
    for (const wall of walls) {
      const push = circleRectResolve(ship.x, ship.y, ship.r, wall);
      if (push) { collisions++; ship.x += push.x; ship.y += push.y; }
    }
    travelled += Math.hypot(ship.x - before.x, ship.y - before.y);
    if (Math.hypot(ship.x - goal.x, ship.y - goal.y) < 2) { arrived = true; break; }
  }
  return { ship, state, arrived, collisions, travelled };
}

test("un objectif proche derriere un mur reste contourne jusqu'au bout", () => {
  const result = followRoute([{ x: 2000, y: 2000, w: 20, h: 800 }], { x: 1950, y: 2000 }, { x: 2050, y: 2000 });
  assert.equal(result.arrived, true);
  assert.equal(result.collisions, 0);
});

test("un passage praticable plus etroit qu'une cellule de grille reste accessible", () => {
  const walls = [{ x: 2000, y: 945, w: 100, h: 1890 }, { x: 2000, y: 3055, w: 100, h: 1890 }];
  const result = followRoute(walls, { x: 1500, y: 2100 }, { x: 2500, y: 2100 });
  assert.equal(result.arrived, true);
  assert.equal(result.collisions, 0);
});

test("un contact avec le mur permet de sortir sans demi-tour en boucle", () => {
  const result = followRoute([{ x: 2000, y: 2000, w: 100, h: 800 }], { x: 1931.5, y: 2000 }, { x: 2400, y: 2000 });
  assert.equal(result.arrived, true);
  assert.equal(result.collisions, 0);
});

test("un vaisseau colle au coin arrondi peut se decoller de la marge de navigation", () => {
  const wall = { x: 2000, y: 2000, w: 100, h: 800 };
  const result = followRoute([wall], { x: 1937, y: 1587 }, { x: 2400, y: 2000 });
  assert.equal(result.arrived, true); assert.equal(result.collisions, 0);
});

test("la longue paroi BL se contourne meme en s'eloignant temporairement de la cible", () => {
  for (const dt of [1 / 30, 1 / 60, 1 / 144]) {
    const result = followRoute(getZoneWalls({ w: 22000, h: 14000 }), { x: 6500, y: 4000 }, { x: 8000, y: 4000 },
      { dt, seconds: 70, bounds: { minX: 100, minY: 100, maxX: 21900, maxY: 13900 } });
    assert.equal(result.arrived, true, `${1 / dt} FPS`);
    assert.equal(result.collisions, 0);
  }
});

test("les segments tangents ou passant exactement par un coin sont controles", () => {
  const walls = [{ x: 100, y: 100, w: 100, h: 100 }];
  assert.equal(isSegmentBlocked(0, 50, 200, 50, walls), true);
  assert.equal(isSegmentBlocked(0, 0, 50, 50, walls), true);
});

function engineBot(walls, start, goal, npc = null) {
  const source = readFileSync(new URL("../SRC/CORE/ORBIT_ENGINE.js", import.meta.url), "utf8");
  const from = source.indexOf("function botMovementStep("), to = source.indexOf("function botClampCombatTarget(", from);
  const context = vm.createContext({
    hangarSwapFx: null, Bot: { active: true, manualT: 0, combatTargetId: npc?.id },
    moveTarget: { active: true, ...goal }, player: { ...start, r: 18, baseSpeed: 400, vx: 0, vy: 0 },
    pointer: { down: false }, performance: { now: () => 10000 }, isZoneMap: true, zoneWalls: walls,
    WORLD: { w: 4000, h: 4000 }, attackActive: !!npc, enemies: npc ? [npc] : [],
    Target: { get: () => npc, clear: () => {} }, botNpcHasLockKey: (e, key) => e.id === key,
    botNpcInWall: () => false, botNpcBanWall: () => { context.banned = true; },
    stopAttack: () => { context.attackActive = false; }, computeBotWallMove, playerSlowMult,
  });
  vm.runInContext(source.slice(from, to), context);
  return context;
}

test("le vrai pilote bot conserve la destination et suit les coins sans snap a travers le mur", () => {
  const walls = [{ x: 2000, y: 2000, w: 100, h: 800 }], goal = { x: 2400, y: 2000 };
  const c = engineBot(walls, { x: 1600, y: 2000 }, goal);
  for (let frame = 0; frame < 300; frame++) {
    const step = c.botMovementStep(0.1);
    assert.equal(c.moveTarget.x, goal.x); assert.equal(c.moveTarget.y, goal.y);
    updatePlayerVelocity(c.player, { x: step.x - c.player.x, y: step.y - c.player.y }, 0.1);
    advancePlayerToTarget(c.player, step, 0.1);
    assert.equal(circleRectResolve(c.player.x, c.player.y, 18, walls[0]), null);
    if (!c.moveTarget.active) break;
  }
  assert.ok(Math.hypot(c.player.x - goal.x, c.player.y - goal.y) < 1);
});

test("en combat, un NPC derriere le mur est contourne meme deja a portee laser", () => {
  const walls = [{ x: 2000, y: 2000, w: 20, h: 800 }];
  const enemy = { id: 1, x: 2050, y: 2000, hp: 100 };
  const c = engineBot(walls, { x: 1950, y: 2000 }, { x: 1700, y: 2200 }, enemy);
  let steering = {}, travelled = 0, collisions = 0;
  for (let frame = 0; frame < 3000; frame++) {
    const out = computeBotCombatMove({ player: c.player, npc: enemy, range: 600, walls, bounds,
      state: steering, dt: 1 / 60 });
    steering = out.state;
    Object.assign(c.moveTarget, { active: true, x: out.x, y: out.y });
    const step = c.botMovementStep(1 / 60);
    const old = { x: c.player.x, y: c.player.y };
    updatePlayerVelocity(c.player, { x: step.active ? step.x - old.x : 0, y: step.active ? step.y - old.y : 0 }, 1 / 60);
    advancePlayerToTarget(c.player, step, 1 / 60);
    travelled += Math.hypot(c.player.x - old.x, c.player.y - old.y);
    for (const wall of walls) if (circleRectResolve(c.player.x, c.player.y, 18, wall)) collisions++;
  }
  assert.equal(collisions, 0);
  assert.ok(travelled > 15000, `${travelled} u parcourues`);
  assert.equal(c.banned, undefined, "le NPC accessible reste engage");
  assert.ok(Math.hypot(c.player.x - enemy.x, c.player.y - enemy.y) < 600);
});

test("un NPC dans une zone fermee est laisse de cote sans vibration ni teleportation", () => {
  const walls = [{ x: 2000, y: 2000, w: 100, h: 4000 }], enemy = { id: 1, x: 2600, y: 2000, hp: 100 };
  const c = engineBot(walls, { x: 1600, y: 2000 }, enemy, enemy);
  for (let frame = 0; frame < 60; frame++) {
    const step = c.botMovementStep(1 / 60);
    assert.equal(step.active, false);
    assert.equal(c.player.x, 1600);
    if (!c.moveTarget.active) break;
  }
  assert.equal(c.banned, true); assert.equal(c.attackActive, false);
  assert.equal(c.moveTarget.active, false);
});

test("le bot laisse le pilotage manuel intact, pendant et apres le clic", () => {
  const walls = [{ x: 2000, y: 2000, w: 100, h: 800 }];
  for (const mode of ["inactive", "pointer", "manual-pause"]) {
    const c = engineBot(walls, { x: 1600, y: 2000 }, { x: 2400, y: 2000 });
    if (mode === "inactive") c.Bot.active = false;
    if (mode === "pointer") c.pointer.down = true;
    if (mode === "manual-pause") c.Bot.manualT = 9000;
    assert.equal(c.botMovementStep(1 / 60), c.moveTarget);
  }
});
