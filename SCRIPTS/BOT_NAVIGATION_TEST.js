import test from "node:test";
import assert from "node:assert/strict";
import { BOT_RANGE, computeBotCombatMove } from "../SRC/CORE/BOT_NAVIGATION.js";

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
