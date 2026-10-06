import test from "node:test";
import assert from "node:assert/strict";
import { BOT_RANGE, computeBotCombatMove, computeBotWallMove, computeWallDetour, isSegmentBlocked, isPointInWall } from "../SRC/CORE/BOT_NAVIGATION.js";
import { blacklightSearchTarget } from '../SRC/CORE/BOT_SEARCH.js';
import { circleRectResolve } from "../SRC/CORE/COLLISION.js";
import { advancePlayerToTarget, updatePlayerVelocity, playerSlowMult } from "../SRC/CORE/FRAME_SYSTEMS.js";
import { getZoneWalls } from "../MAPS/1-BL/SPAWNS.js";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const bounds = { minX: 0, minY: 0, maxX: 10000, maxY: 6000, margin: 80 };
const npc = { id: 7, x: 5000, y: 3000, vx: 0, vy: 0, hp: 100 };

for (const mapId of ['1-BL', '2-BL', '3-BL']) {
  const { WORLD: world } = await import(`../MAPS/${mapId}/WORLD.js`);
  const spawns = await import(`../MAPS/${mapId}/SPAWNS.js`);
  const camps = spawns.getZoneSpawns(world), walls = spawns.getZoneWalls(world);
  test(`${mapId} : la recherche reste dans les habitats coches et contourne les murs`, () => {
    const types = ['npc_Invoke_XVI', 'npc_Mindfire_Behemoth', 'npc_Strokelight_Barrage'];
    const state = {}, player = { x: world.w / 2, y: world.h / 2, r: 18 };
    const args = { mapId, world, camps, walls, player, allowed: new Set(types), state };
    const visits = new Set();
    for (let i = 0; i < 45; i++) {
      const target = blacklightSearchTarget(args);
      assert.ok(target && types.includes(target.type));
      assert.equal(isPointInWall(target.x, target.y, walls, 30), false);
      assert.ok(target.x >= 100 && target.x <= world.w - 100 && target.y >= 100 && target.y <= world.h - 100);
      const camp = camps.find(c => c.type === target.type), area = camp.spawnArea;
      if (area) assert.ok(target.x >= area.x1 && target.x <= area.x2 && target.y >= area.y1 && target.y <= area.y2);
      else assert.ok(Math.hypot(target.x - camp.x, target.y - camp.y) <= 600);
      visits.add(target.type); Object.assign(player, target);
    }
    assert.equal(visits.size, 3, 'aucun boss coche ne reste oublie');
    args.allowed = new Set(['npc_Mindfire_Behemoth']);
    assert.equal(blacklightSearchTarget(args).type, 'npc_Mindfire_Behemoth', 'un changement de selection remplace le parcours');
    args.allowed.clear(); assert.equal(blacklightSearchTarget(args), null);
    args.allowed.add(types[0]); args.mapId = '1-1'; assert.equal(blacklightSearchTarget(args), null);
  });
}

test('un long trajet BL ne change pas de destination toutes les six secondes', () => {
  const player = { x: 100, y: 100 }, state = {}, walls = [];
  const args = { mapId: '1-BL', world: { w: 30000, h: 20000 }, player, walls, state,
    allowed: new Set(['npc_Mindfire_Behemoth']), camps: [{ type: 'npc_Mindfire_Behemoth', fixed: true, x: 20000, y: 8000 }] };
  const target = blacklightSearchTarget(args);
  for (let i = 0; i < 30; i++) {
    player.x += 200;
    assert.equal(blacklightSearchTarget({ ...args, dt: 1 }), target);
  }
  for (let i = 0; i < 30; i++) {
    player.y += 400;
    assert.equal(blacklightSearchTarget({ ...args, dt: 1 }), target, 'un detour qui eloigne du but reste suivi');
  }
  const next = blacklightSearchTarget({ ...args, dt: 1, failed: true });
  assert.notDeepEqual(next, target, 'un trajet inatteignable est abandonne');
});

test('une recherche BL immobile finit par changer de point', () => {
  const args = { mapId: '1-BL', world: { w: 30000, h: 20000 }, player: { x: 100, y: 100 }, walls: [], state: {},
    allowed: new Set(['npc_Mindfire_Behemoth']), camps: [{ type: 'npc_Mindfire_Behemoth', fixed: true, x: 20000, y: 8000 }] };
  const target = blacklightSearchTarget(args);
  for (let i = 0; i < 19; i++) assert.equal(blacklightSearchTarget({ ...args, dt: 1 }), target);
  assert.notDeepEqual(blacklightSearchTarget({ ...args, dt: 1 }), target);
});

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
    hangarSwapFx: null, StarJump: { channel: null }, Bot: { active: true, manualT: 0, combatTargetId: npc?.id, combatMoveTargetId: npc?.id },
    moveTarget: { active: true, ...goal }, player: { ...start, r: 18, baseSpeed: 400, vx: 0, vy: 0 },
    pointer: { down: false }, performance: { now: () => 10000 }, isZoneMap: true, zoneWalls: walls,
    WORLD: { w: 4000, h: 4000 }, attackActive: !!npc, enemies: npc ? [npc] : [],
    Target: { get: () => npc, clear: () => {} }, botNpcHasLockKey: (e, key) => e.id === key,
    botNpcInWall: () => false, botNpcBanWall: () => { context.banned = true; },
    stopAttack: () => { context.attackActive = false; }, computeBotWallMove, playerSlowMult,
  });
  const lockFrom = source.indexOf("function isPlayerMovementLocked("), lockTo = source.indexOf("\n}", lockFrom);
  vm.runInContext(source.slice(lockFrom, lockTo + 2) + "\n" + source.slice(from, to), context);
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

test("la poursuite contourne le NPC derriere le mur avec les tirs coupes hors de portee", () => {
  const walls = [{ x: 2000, y: 2000, w: 100, h: 800 }];
  const enemy = { id: 1, x: 2600, y: 2000, hp: 100 };
  const c = engineBot(walls, { x: 1600, y: 2000 }, { x: 1700, y: 2000 }, enemy);
  c.attackActive = false;
  const step = c.botMovementStep(1 / 60);
  assert.equal(step.active, true);
  assert.ok(step.x > 1900, "le navigateur vise le contour du NPC, pas l'orbite du cote du joueur");
  assert.ok(Math.abs(step.y - 2000) > 400);
});

test("une collecte ou une fuite conserve sa destination malgre un NPC verrouille", () => {
  const walls = [{ x: 2000, y: 2000, w: 100, h: 800 }];
  const enemy = { id: 1, x: 2600, y: 2000, hp: 100 };
  const c = engineBot(walls, { x: 1600, y: 2000 }, { x: 1700, y: 2000 }, enemy);
  c.Bot.combatMoveTargetId = null;
  assert.equal(c.botMovementStep(1 / 60), c.moveTarget);
  c.Bot.combatMoveTargetId = 2;
  assert.equal(c.botMovementStep(1 / 60), c.moveTarget);
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

function botProfileContext(saved = {}) {
  const source = readFileSync(new URL("../SRC/CORE/ORBIT_ENGINE.js", import.meta.url), "utf8");
  const from = source.indexOf("const Bot = {"), to = source.indexOf("function botLog(", from);
  let stored = JSON.stringify(saved);
  const context = vm.createContext({
    BOT_STORE_KEY: "bot-test", BOT_TAB_LEGACY: {}, BOT_AMMO_IDS: [],
    document: { querySelector: () => null },
    localStorage: { getItem: () => stored, setItem: (key, value) => { stored = value; } },
    performance: { now: () => 10000 },
    botApplyFormation: value => { context.appliedFormation = value; },
    botApplyConfig: value => { context.appliedConfig = value; },
  });
  vm.runInContext(source.slice(from, to) + "\nglobalThis.Bot = Bot;", context);
  const profileFrom = source.indexOf("function botApplyMoveProfile("), profileTo = source.indexOf("function botApplyConfig(", profileFrom);
  vm.runInContext(source.slice(profileFrom, profileTo), context);
  context.saved = () => JSON.parse(stored);
  return { context, source };
}

test("les anciens choix de deplacement migrent vers fuite et navigation", () => {
  const { context: c } = botProfileContext({ formMove: "wheel", cfgFly: "2" });
  c.botLoadConfig();
  assert.equal(c.Bot.formFlee, "wheel"); assert.equal(c.Bot.cfgFlee, "2");
  assert.equal(c.Bot.formTravel, "wheel"); assert.equal(c.Bot.cfgTravel, "2");
});

test("les trois profils se sauvegardent separement et le choix vide reste explicite", () => {
  const { context: c } = botProfileContext({ formMove: "wheel", cfgFly: "2",
    formFlee: "", cfgFlee: "", formTravel: "ring", cfgTravel: "1" });
  c.botLoadConfig();
  c.botSaveConfig();
  const { context: restored } = botProfileContext(c.saved());
  restored.botLoadConfig();
  assert.equal(restored.Bot.formMove, "wheel"); assert.equal(restored.Bot.cfgFly, "2");
  assert.equal(restored.Bot.formFlee, ""); assert.equal(restored.Bot.cfgFlee, "");
  assert.equal(restored.Bot.formTravel, "ring"); assert.equal(restored.Bot.cfgTravel, "1");
  restored.botApplyMoveProfile("travel");
  assert.equal(restored.appliedFormation, "ring"); assert.equal(restored.appliedConfig, "1");
  restored.botApplyMoveProfile("flee");
  assert.equal(restored.appliedFormation, ""); assert.equal(restored.appliedConfig, "");
});

test("le vrai tick passe entre exploration, navigation et fuite puis reprend la recherche", () => {
  const { context: c, source } = botProfileContext();
  Object.assign(c.Bot, { active: true, manualT: 0, mode: "kill", formMove: "wheel", cfgFly: "1",
    formFlee: "ring", cfgFlee: "2", formTravel: "heart", cfgTravel: "", flee: true });
  Object.assign(c, {
    started: true, StarJump: { channel: null }, player: { x: 1000, y: 1000, hp: 100, hpMax: 100 }, WORLD: { w: 4000, h: 4000 },
    window: { __CURRENT_MAP_ID__: "1-1" }, rules: {}, moveTarget: { active: false },
    enemies: [], collectables: [], attackActive: false, Target: { get: () => null },
    botNearestNpc: () => null, botBlacklightSearch: () => null, botPortalIndex: null, botClearSpecialAmmo: () => {},
    botApplyRocketFlags: () => {}, botRefreshHudThrottled: () => {}, botLog: () => {},
    stopAttack: () => {}, cancelCollectableTarget: () => {},
    botNearestSafeRefuge: () => ({ x: 1500, y: 1500, label: "Zone sure" }),
    clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
  });
  const from = source.indexOf("function tickBot("), to = source.indexOf("function botRefreshHudThrottled(", from);
  vm.runInContext(source.slice(from, to), c);
  c.tickBot(1 / 60);
  assert.equal(c.appliedFormation, "wheel"); assert.equal(c.appliedConfig, "1");
  assert.equal(c.moveTarget.active, true, "la recherche continue de deplacer le bot");
  c.Bot.targetMap = "1-2";
  c.tickBot(1 / 60);
  assert.equal(c.appliedFormation, "heart"); assert.equal(c.appliedConfig, "");
  c.player.hp = 20;
  c.tickBot(1 / 60);
  assert.equal(c.Bot.fleeing, true);
  assert.equal(c.appliedFormation, "ring"); assert.equal(c.appliedConfig, "2");
  assert.equal(c.moveTarget.x, 1500);
  c.Bot.targetMap = ""; c.player.hp = 50;
  c.tickBot(1 / 60);
  assert.equal(c.Bot.fleeing, false);
  assert.equal(c.appliedFormation, "wheel"); assert.equal(c.appliedConfig, "1");
});

function autoCloakContext() {
  const { context: c, source } = botProfileContext();
  Object.assign(c.Bot, { active: true, skillCloak: true, manualT: 0, lastNpcKey: 'local:7' });
  const user = { credits: 60000 };
  Object.assign(c, { started: true, player: { dead: false, credits: 60000, cpuCloak: false },
    cloakCd: 0, CPU_CLOAK_COST: 30000, CPU_CLOAK_COOLDOWN: 1, enemies: [],
    currentMapId: () => '1-7', isPlayerCloaked: () => false,
    isPlayerCpuCloaked: () => c.player.cpuCloak === true, persistCpuCloak: () => {},
    account: { user }, getCurrentUserFull: () => user, markProgressDirty: () => {},
    purchases: [], noteNetPurchase: amount => c.purchases.push(amount),
    notifications: [], showNotification: message => c.notifications.push(message), updateSkillUI: () => {},
    stopAttack: () => { c.attackStopped = true; }, botLog: message => { c.lastLog = message; },
  });
  const locks = source.slice(source.indexOf('function botNpcLockKey('), source.indexOf('function botLockNpc('));
  const auto = source.slice(source.indexOf('function botQueueCloakAfterKill('), source.indexOf('function tickBot('));
  const cpu = source.slice(source.indexOf('function toggleCpuCloak('), source.indexOf('function activatePoliceCloak('));
  vm.runInContext(locks + auto + cpu, c);
  return c;
}

test('camouflage bot : mort confirmee de la cible, une seule activation et un seul debit', () => {
  const c = autoCloakContext(), npc = { id: 7, hp: 0 };
  c.botQueueCloakAfterKill(npc);
  assert.equal(c.Bot.cloakPendingMap, '1-7'); assert.equal(c.attackStopped, true);
  assert.equal(c.botTickAutoCloak(), true);
  assert.equal(c.player.cpuCloak, true); assert.equal(c.player.credits, 30000);
  assert.equal(c.account.user.credits, 30000); assert.deepEqual(c.purchases, [30000]);
  c.botQueueCloakAfterKill(npc); c.botTickAutoCloak();
  assert.equal(c.player.cpuCloak, true); assert.deepEqual(c.purchases, [30000]);
});

test('camouflage bot : attend la recharge du CPU sans payer ni spammer de messages', () => {
  const c = autoCloakContext(); c.cloakCd = .5;
  c.botQueueCloakAfterKill({ id: 7, hp: 0 });
  for (let i = 0; i < 20; i++) assert.equal(c.botTickAutoCloak(), true);
  assert.equal(c.player.credits, 60000); assert.deepEqual(c.notifications, []);
  c.cloakCd = 0; c.botTickAutoCloak();
  assert.equal(c.player.credits, 30000); assert.equal(c.Bot.cloakPendingMap, null);
});

test('camouflage bot : ignore NPC vivants, autres cibles, predictions serveur et retraits sans mort', () => {
  for (const npc of [{ id: 7, hp: 1 }, { id: 8, hp: 0 }, { id: 7, hp: 0, suppressDeathExplosion: true },
    { id: 7, hp: 0, _netUid: 'shared', _netSeq: 1, _netKiller: null }]) {
    const c = autoCloakContext(); c.botQueueCloakAfterKill(npc);
    assert.equal(c.Bot.cloakPendingMap, null); assert.equal(c.botTickAutoCloak(), false);
    assert.deepEqual(c.purchases, []);
  }
});

test('camouflage bot : la reapparition du meme NPC reseau permet une nouvelle activation', () => {
  const c = autoCloakContext(), npc = { id: 7, hp: 0, _netUid: 'shared', _netSeq: 1, _netKiller: true };
  c.Bot.lastNpcKey = 'net:shared:1'; c.botQueueCloakAfterKill(npc); c.botTickAutoCloak();
  c.player.cpuCloak = false; npc._netSeq = 2; c.Bot.lastNpcKey = 'net:shared:2';
  c.botQueueCloakAfterKill(npc); c.botTickAutoCloak();
  assert.deepEqual(c.purchases, [30000, 30000]); assert.equal(c.player.credits, 0);
});

test('camouflage bot : pas de debit si deja camoufle, pauvre, mort, arrete ou sur une autre carte', () => {
  for (const condition of ['cloaked', 'credits', 'dead', 'stopped', 'disabled', 'map']) {
    const c = autoCloakContext(); c.botQueueCloakAfterKill({ id: 7, hp: 0 });
    if (condition === 'cloaked') c.player.cpuCloak = true;
    if (condition === 'credits') c.player.credits = 29999;
    if (condition === 'dead') c.player.dead = true;
    if (condition === 'stopped') c.Bot.active = false;
    if (condition === 'disabled') c.Bot.skillCloak = false;
    if (condition === 'map') c.currentMapId = () => '1-6';
    assert.equal(c.botTickAutoCloak(), false); assert.equal(c.Bot.cloakPendingMap, null);
    assert.deepEqual(c.purchases, []);
  }
});

test('camouflage bot : option desactivee par defaut et conservee dans les reglages', () => {
  const { context: c } = botProfileContext(); c.botLoadConfig();
  assert.equal(c.Bot.skillCloak, false);
  c.Bot.skillCloak = true; c.botSaveConfig();
  const { context: restored } = botProfileContext(c.saved()); restored.botLoadConfig();
  assert.equal(restored.Bot.skillCloak, true); assert.equal(restored.Bot.cloakPendingMap, null);
});

function repairCloakContext() {
  const c = autoCloakContext();
  Object.assign(c.Bot, { skillCloak: false, lastNpcKey: null, fleeCloak: true, mode: 'kill' });
  Object.assign(c.player, { x: 1000, y: 1000, hp: 20, hpMax: 100 });
  Object.assign(c, {
    StarJump: { channel: null }, WORLD: { w: 4000, h: 4000 },
    window: { __CURRENT_MAP_ID__: '1-7' }, rules: {}, moveTarget: { active: false },
    collectables: [], attackActive: true, Target: { get: () => null },
    botNearestNpc: () => null, botBlacklightSearch: () => null, botPortalIndex: null, botClearSpecialAmmo: () => {},
    botApplyRocketFlags: () => {}, botRefreshHudThrottled: () => {}, cancelCollectableTarget: () => {},
    stopAttack: () => { c.attackActive = false; },
    botNearestSafeRefuge: () => ({ x: 1500, y: 1500, label: 'Zone sure' }),
    clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
  });
  const source = readFileSync(new URL('../SRC/CORE/ORBIT_ENGINE.js', import.meta.url), 'utf8');
  const from = source.indexOf('function tickBot('), to = source.indexOf('function botRefreshHudThrottled(', from);
  vm.runInContext(source.slice(from, to), c);
  return c;
}

test('camouflage reparation : attend le CPU en continuant la fuite, puis un seul debit par repli', () => {
  const c = repairCloakContext(); c.cloakCd = .5;
  for (let i = 0; i < 20; i++) c.tickBot(1 / 60);
  assert.equal(c.Bot.fleeing, true); assert.equal(c.attackActive, false);
  assert.equal(c.moveTarget.active, true); assert.equal(c.moveTarget.x, 1500);
  assert.equal(c.player.cpuCloak, false); assert.deepEqual(c.purchases, []);
  assert.deepEqual(c.notifications, []);
  c.cloakCd = 0; c.tickBot(1 / 60);
  assert.equal(c.player.cpuCloak, true); assert.equal(c.account.user.credits, 30000);
  assert.equal(c.Bot.fleeCloakUsed, true);
  c.player.cpuCloak = false; // IEM ou Mindfire : pas d'achat en boucle.
  for (let i = 0; i < 20; i++) c.tickBot(1 / 60);
  assert.deepEqual(c.purchases, [30000]);
  c.player.hp = 50; c.tickBot(1 / 60);
  assert.equal(c.Bot.fleeing, false); assert.equal(c.Bot.fleeCloakUsed, false);
  c.player.hp = 20; c.tickBot(1 / 60);
  assert.equal(c.player.cpuCloak, true); assert.deepEqual(c.purchases, [30000, 30000]);
});

test('camouflage reparation : deja camoufle, pas de paiement ni de desactivation', () => {
  for (const kind of ['cpu', 'ultimate']) {
    const c = repairCloakContext();
    if (kind === 'cpu') c.player.cpuCloak = true;
    else c.isPlayerCloaked = () => true;
    c.tickBot(1 / 60);
    assert.equal(c.Bot.fleeing, true); assert.equal(c.Bot.fleeCloakUsed, true);
    assert.equal(c.player.cpuCloak, kind === 'cpu'); assert.deepEqual(c.purchases, []);
  }
});

test('camouflage reparation : aucun achat hors reparation ou si desactive, pauvre, mort ou arrete', () => {
  for (const condition of ['disabled', 'no-flee', 'healthy', 'credits', 'dead', 'stopped', 'manual']) {
    const c = repairCloakContext();
    if (condition === 'disabled') c.Bot.fleeCloak = false;
    if (condition === 'no-flee') c.Bot.flee = false;
    if (condition === 'healthy') c.player.hp = 100;
    if (condition === 'credits') c.player.credits = 29999;
    if (condition === 'dead') c.player.dead = true;
    if (condition === 'stopped') c.Bot.active = false;
    if (condition === 'manual') c.Bot.manualT = 9999;
    c.botTickRepairCloak();
    if (condition !== 'dead') c.tickBot(1 / 60);
    assert.equal(c.player.cpuCloak, false); assert.deepEqual(c.purchases, []);
    assert.deepEqual(c.notifications, []);
  }
});

test('camouflage reparation : reglage independant sauvegarde, etat du repli non persiste', () => {
  const { context: c } = botProfileContext(); c.botLoadConfig();
  assert.equal(c.Bot.fleeCloak, false); assert.equal(c.Bot.skillCloak, false);
  c.Bot.fleeCloak = true; c.Bot.fleeCloakUsed = true; c.botSaveConfig();
  assert.equal(c.saved().fleeCloakUsed, undefined);
  const { context: restored } = botProfileContext(c.saved()); restored.botLoadConfig();
  assert.equal(restored.Bot.fleeCloak, true); assert.equal(restored.Bot.skillCloak, false);
  assert.equal(restored.Bot.fleeCloakUsed, false);
});
