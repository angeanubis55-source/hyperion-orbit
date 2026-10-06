import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { INVOKE_SPAWN_MIN_DISTANCE, pickSpacedSpawnPosition } from '../NPC/NPC_SPAWN_POSITION.js';
import { ZoneNpcSim } from './NPC_ROOM.js';
import { createUniverse, ensureMapSlots, getSlot, markAlive, markDead, slotUid, snapshotEnemy } from '../SRC/SIM/UNIVERSE_SIM.js';
import { NPC_TYPES } from '../NPC/NPC_TYPES.js';

const type = 'npc_Invoke_XVI';
const maps = await Promise.all(['1-BL', '2-BL', '3-BL'].map(async id => ({ id,
  ...(await import(`../MAPS/${id}/SPAWNS.js`)), ...(await import(`../MAPS/${id}/WORLD.js`)),
})));
function verifyPositions(points, area, walls) {
  assert.equal(points.length, 10, 'les dix Invoke restent presents');
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    assert.ok(p.x >= area.x1 && p.x <= area.x2 && p.y >= area.y1 && p.y <= area.y2);
    assert.ok(!walls.some(w => Math.abs(p.x - w.x) <= w.w / 2 + 120
      && Math.abs(p.y - w.y) <= w.h / 2 + 120), 'aucun Invoke dans un mur');
    for (const q of points.slice(i + 1)) assert.ok(Math.hypot(p.x - q.x, p.y - q.y)
      >= INVOKE_SPAWN_MIN_DISTANCE - .000001, 'au moins 700 unites entre Invoke');
  }
}

for (const map of maps) {
  test(`${map.id} : dix camps espaces meme si le hasard tire toujours le meme point`, t => {
    t.mock.method(Math, 'random', () => .5);
    const invokes = map.getZoneSpawns(map.WORLD).filter(c => c.type === type);
    assert.ok(invokes.every(c => c.spawnMinDistance === INVOKE_SPAWN_MIN_DISTANCE));
    verifyPositions(invokes, invokes[0].spawnArea, map.getZoneWalls(map.WORLD));
  });
  test(`${map.id} : spawns et reapparitions serveur gardent leurs distances`, async () => {
    const sim = await ZoneNpcSim.create(map.id);
    assert.ok(sim);
    sim.tick(.1);
    const camps = sim.camps.filter(c => c.type === type);
    const live = () => [...sim.entries.values()].filter(e => e.type === type && e.hp > 0);
    verifyPositions(live(), camps[0].spawnArea, sim.walls);
    for (let cycle = 0; cycle < 60; cycle++) {
      const dead = live()[cycle % 10], sequence = dead.seq;
      dead.hp = 0;
      markDead(sim.universe, map.id, dead.uid, Date.now(), 0);
      sim.campT.set(dead.campId, 0);
      sim.tick(.1);
      assert.equal(sim.entries.get(dead.uid).seq, sequence + 1);
      verifyPositions(live(), camps[0].spawnArea, sim.walls);
    }
  });
  test(`${map.id} : le vrai spawner solo espace aussi les reapparitions`, () => {
    const source = readFileSync(new URL('../SRC/CORE/ORBIT_ENGINE.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
    const start = source.indexOf('function zoneController(');
    const end = source.indexOf('\n// ============================================================\n// Death / Respawn', start);
    assert.ok(start > 0 && end > start);
    const camps = map.getZoneSpawns(map.WORLD).filter(c => c.type === type)
      .map((c, i) => ({ ...c, id: i + 1, t: 0 }));
    const universe = createUniverse();
    ensureMapSlots(universe, map.id, camps, Date.now());
    const enemies = [];
    const ctx = vm.createContext({ started: true, player: { dead: false }, isZoneMap: true,
      netplayNpcActive: () => false, currentMapId: () => map.id, collectables: [], zoneCamps: camps,
      universe, slotUid, getSlot, markAlive, snapshotUniverseEnemy: snapshotEnemy,
      worldClock: { now: () => Date.now(), isDue: time => time <= Date.now() },
      WORLD: map.WORLD, NPC_TYPES, zoneWalls: map.getZoneWalls(map.WORLD), enemies,
      rand: (a, b) => (a + b) / 2, clamp: (v, lo, hi) => Math.max(lo, Math.min(hi, v)),
      spawnPosInWall: () => false, pickSpacedSpawnPosition,
      makeEnemy: (type, x, y) => ({ type, x, y, hp: 1000, hpMax: 1000, sh: 0, shMax: 0 }),
    });
    vm.runInContext(source.slice(start, end), ctx);
    ctx.zoneController(.1);
    verifyPositions(enemies, camps[0].spawnArea, ctx.zoneWalls);
    const dead = enemies.pop();
    markDead(universe, map.id, dead.universeUid, Date.now(), 0);
    ctx.zoneController(1);
    verifyPositions(enemies, camps[0].spawnArea, ctx.zoneWalls);
  });
}

test('zone saturee : attendre une place plutot que creer deux Invoke superposes', () => {
  const area = { x1: 200, y1: 200, x2: 300, y2: 300 };
  assert.equal(pickSpacedSpawnPosition({ area, occupied: [{ x: 250, y: 250 }] }), null);
  const camps = [1, 2].map(id => ({ id, type, x: 250, y: 250, spawnArea: area,
    spawnMinDistance: 700, maxAlive: 1, respawn: 0 }));
  const sim = new ZoneNpcSim('spawn-test', { w: 1000, h: 1000 }, camps);
  const blockedUid = slotUid('spawn-test', 2);
  markDead(sim.universe, 'spawn-test', blockedUid, Date.now(), 0);
  sim.tick(.1);
  assert.equal(sim.entries.size, 1);
  assert.equal(getSlot(sim.universe, 'spawn-test', blockedUid).alive, false);
  assert.equal(sim.campT.get(2), 1, 'nouvel essai borne a une seconde');
});

test('une position sauvegardee valide est conservee', () => {
  const preferred = { x: 1500, y: 1500 };
  assert.deepEqual(pickSpacedSpawnPosition({ area: { x1: 300, y1: 300, x2: 5000, y2: 8000 },
    occupied: [{ x: 2500, y: 1500 }], preferred }), preferred);
});
