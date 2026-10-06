import test from 'node:test';
import assert from 'node:assert/strict';
import { STARMAP_NODES as nodes, STARMAP_UNIT as unit, STARMAP_NODE as size, STARMAP_ART as art } from '../SRC/DATA/STARMAP.js';
import { createStarMapLayout, pairStarMapPortals, projectStarMapPortal, findStarMapItinerary } from '../SRC/CORE/STARMAP_LAYOUT.js';

const maps = new Map(await Promise.all(nodes.map(async n => {
  const world = await import(`../MAPS/${n.folder}/WORLD.js`);
  const portals = n.id === 'qz'
    ? [{ id: 'qz_entry', x: world.QZ_ENTRY.x, y: world.WORLD.h * world.QZ_ENTRY.yRatio, arrival: true, hidden: true }]
    : (await import(`../MAPS/${n.folder}/SPAWNS.js`)).getZonePortals(world.WORLD);
  return [n.id, { ...world.WORLD, portals }];
})));
const layout = createStarMapLayout(nodes, unit, size, art, maps);

test('le groupe MMO superieur libere le centre de la 4-4', () => {
  for (const id of ['1-5', '1-6', '1-7', '1-8']) assert.ok(layout.positions.get(id).y < layout.positions.get('4-4').y, id);
  for (const node of nodes) assert.ok(layout.positions.get(node.id).y - size.h / 2 >= 48, 'marge haute conservee');
});

test('deux liaisons ne partagent aucun segment de ligne', () => {
  const overlaps = [];
  const segments = layout.routes.flatMap(r => r.points.slice(1).map((p, i) => ({ key: r.key, a: r.points[i], b: p })));
  for (let i = 0; i < segments.length; i++) for (let j = i + 1; j < segments.length; j++) {
    const { key: ka, a, b } = segments[i], { key: kb, a: c, b: d } = segments[j];
    if (ka === kb) continue;
    const horizontal = a.y === b.y && c.y === d.y && Math.abs(a.y - c.y) < .01;
    const vertical = a.x === b.x && c.x === d.x && Math.abs(a.x - c.x) < .01;
    const axis = horizontal ? 'x' : 'y';
    if ((horizontal || vertical) && Math.min(Math.max(a[axis], b[axis]), Math.max(c[axis], d[axis]))
      - Math.max(Math.min(a[axis], b[axis]), Math.min(c[axis], d[axis])) > .01) overlaps.push([ka, kb, a, b, c, d]);
  }
  assert.deepEqual(overlaps, []);
});

test('les six cartes annexes sont visibles sans autoriser Jump', () => {
  assert.equal(nodes.length, 35);
  for (const id of ['1-BL', '2-BL', '3-BL', '5-2', 'low', 'qz']) assert.equal(nodes.find(n => n.id === id)?.jumpable, false, id);
  assert.equal(nodes.filter(n => n.jumpable).length, 29);
});

test('chaque portail du jeu vers une carte visible possede sa vraie liaison', () => {
  assert.equal(layout.routes.length, 59);
  for (const node of nodes) for (const portal of maps.get(node.id).portals) {
    if (portal.hidden || portal.factionReturn || !nodes.some(n => n.id.toLowerCase() === String(portal.toMap).toLowerCase())) continue;
    const route = layout.routes.find(r => (r.a === node.id && r.source.id === portal.id) || (r.b === node.id && r.destination.id === portal.id));
    assert.ok(route, node.id + '/' + portal.id);
    if (portal.toPortal) assert.equal(route.a === node.id ? route.destination.id : route.source.id, portal.toPortal);
  }
});

test('les fils rejoignent les coordonnees exactes des portails sans traverser une autre carte', () => {
  for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
    const a = layout.positions.get(nodes[i].id), b = layout.positions.get(nodes[j].id);
    assert.ok(Math.abs(a.x - b.x) >= size.w || Math.abs(a.y - b.y) >= size.h, `${nodes[i].id}/${nodes[j].id}`);
  }
  for (const route of layout.routes) {
    assert.ok(route.points.length >= 2, route.key);
    assert.deepEqual(route.points[0], projectStarMapPortal(layout.positions.get(route.a), route.source, maps.get(route.a), size, art));
    assert.deepEqual(route.points.at(-1), projectStarMapPortal(layout.positions.get(route.b), route.destination, maps.get(route.b), size, art));
    for (let i = 1; i < route.points.length; i++) {
      const a = route.points[i - 1], b = route.points[i];
      assert.ok(a.x === b.x || a.y === b.y, 'liaison orthogonale');
      for (const node of nodes) {
        if (node.id === route.a || node.id === route.b) continue;
        const p = layout.positions.get(node.id), left = p.x - size.w / 2, right = p.x + size.w / 2,
          top = p.y - size.h / 2, bottom = p.y + size.h / 2;
        const crosses = (a.x === b.x && a.x > left && a.x < right && Math.max(a.y, b.y) > top && Math.min(a.y, b.y) < bottom)
          || (a.y === b.y && a.y > top && a.y < bottom && Math.max(a.x, b.x) > left && Math.min(a.x, b.x) < right);
        assert.equal(crosses, false, `${route.key} traverse ${node.id}`);
      }
    }
  }
});

test('LOW, QZ et le sens unique de 5-2 respectent les regles reelles', () => {
  const low = layout.routes.filter(r => r.b === 'low');
  assert.equal(low.length, 3);
  assert.ok(low.every(r => r.conditional && !r.oneWay && r.destination.id === 'p_low_return'));
  const qz = layout.routes.filter(r => r.b === 'qz');
  assert.equal(qz.length, 3); assert.ok(qz.every(r => r.oneWay && r.destination.arrival));
  const pirate = layout.routes.find(r => r.a === '5-2' && r.b === '4-4');
  assert.ok(pirate.oneWay && pirate.destination.hidden);
  assert.equal(layout.routes.find(r => [r.a, r.b].includes('5-2') && [r.a, r.b].includes('4-5')).oneWay, false);
});

test('un identifiant de portail absent ne cree pas une fausse liaison', () => {
  const testNodes = [{ id: 'a' }, { id: 'b' }];
  const testMaps = new Map([['a', { portals: [{ id: 'out', toMap: 'b', toPortal: 'absent' }] }],
    ['b', { portals: [{ id: 'other', toMap: 'a', hidden: true }] }]]);
  assert.deepEqual(pairStarMapPortals(testNodes, testMaps), []);
});

test('le trajet part de la carte actuelle et se termine par le portail BL choisi', () => {
  const route = findStarMapItinerary(layout.routes, '1-1', '1-BL', { via: { from: '1-8', portalId: 'p_18_to_1BL' } });
  assert.ok(route.steps.length > 2);
  assert.equal(route.maps[0], '1-1');
  assert.equal(route.maps.at(-2), '1-8'); assert.equal(route.maps.at(-1), '1-BL');
  assert.equal(route.steps.at(-1).portalId, 'p_18_to_1BL');
  assert.equal(route.totalCost, 0);
  for (let i = 0; i < route.steps.length; i++) {
    const step = route.steps[i];
    assert.equal(step.from, route.maps[i]); assert.equal(step.to, route.maps[i + 1]);
    const portal = maps.get(step.from).portals.find(p => p.id === step.portalId);
    assert.ok(portal && !portal.hidden && !portal.arrival);
    assert.equal(portal.toMap.toLowerCase(), step.to.toLowerCase());
  }
});

test('QZ ne devient jamais un raccourci de retour et les arrivees cachees restent a sens unique', () => {
  assert.equal(findStarMapItinerary(layout.routes, 'qz', '1-1'), null);
  const pirate = layout.routes.find(r => r.a === '5-2' && r.b === '4-4');
  assert.ok(findStarMapItinerary(layout.routes, '5-2', '4-4', { via: { from: '5-2', portalId: pirate.source.id } }));
  assert.equal(findStarMapItinerary(layout.routes, '4-4', '5-2', { via: { from: '4-4', portalId: pirate.destination.id } }), null);
});

test('le retour LOW du trajet est celui de la firme du joueur', () => {
  for (const sector of ['1', '2', '3']) {
    const route = findStarMapItinerary(layout.routes, 'low', `${sector}-3`, { sector });
    assert.equal(route.steps.length, 1); assert.equal(route.steps[0].portalId, 'p_low_return');
    assert.equal(route.steps[0].to, `${sector}-3`);
    const other = sector === '1' ? '2' : '1';
    assert.equal(findStarMapItinerary(layout.routes, 'low', `${other}-3`,
      { sector, via: { from: 'low', portalId: 'p_low_return' } }), null);
  }
});

test('le trajet prefere les portails gratuits mais conserve un raccourci payant explicitement choisi', () => {
  const edge = (a, b, cost = 0) => ({ a, b, key: `${a}-${b}`, source: { id: a + b, shortcutCreditCost: cost },
    destination: { id: b + a, shortcutCreditCost: cost }, oneWay: false });
  const routes = [edge('a', 'c', 100), edge('a', 'b'), edge('b', 'c')];
  assert.deepEqual(findStarMapItinerary(routes, 'a', 'c').maps, ['a', 'b', 'c']);
  const paid = findStarMapItinerary(routes, 'a', 'c', { via: { from: 'a', portalId: 'ac' } });
  assert.deepEqual(paid.maps, ['a', 'c']); assert.equal(paid.totalCost, 100);
  assert.deepEqual(findStarMapItinerary(routes, 'a', 'a').steps, []);
  assert.equal(findStarMapItinerary(routes, 'a', 'c', { via: { from: 'a', portalId: 'absent' } }), null);
});
