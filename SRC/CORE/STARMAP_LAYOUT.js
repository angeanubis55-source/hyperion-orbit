// Les liaisons viennent des id/toPortal reels, jamais des centres de cartes.
export function pairStarMapPortals(nodes, maps) {
  const ids = new Map(nodes.map(n => [n.id.toLowerCase(), n.id])), pairs = [], seen = new Set();
  for (const node of nodes) {
    const source = maps.get(node.id);
    if (!source) continue;
    for (const portal of source.portals || []) {
      if (portal.hidden || portal.factionReturn || portal.arrival) continue;
      const targetId = ids.get(String(portal.toMap || '').toLowerCase()), target = maps.get(targetId);
      if (!target) continue;
      const destination = portal.toPortal
        ? target.portals.find(p => p.id === portal.toPortal)
        : target.portals.find(p => p.arrival) || target.portals.find(p => String(p.toMap).toLowerCase() === node.id.toLowerCase());
      if (!destination) continue;
      const key = [node.id + ':' + portal.id, targetId + ':' + destination.id].sort().join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      const conditional = destination.factionReturn === true;
      const reciprocal = !destination.hidden && (conditional || (String(destination.toMap).toLowerCase() === node.id.toLowerCase()
        && (!destination.toPortal || destination.toPortal === portal.id)));
      pairs.push({ key, a: node.id, b: targetId, source: portal, destination,
        oneWay: !reciprocal, conditional, cost: Math.max(Number(portal.shortcutCreditCost) || 0, Number(destination.shortcutCreditCost) || 0) });
    }
  }
  return pairs;
}

export function projectStarMapPortal(center, portal, world, size, art) {
  return { x: center.x - size.w / 2 + art.x + Number(portal.x) / world.w * art.w,
    y: center.y - size.h / 2 + art.y + Number(portal.y) / world.h * art.h };
}

// Itineraire physique : sens uniques, portail impose au dernier saut et
// retour LOW selon la firme. Preferer un trajet gratuit avant les raccourcis.
export function findStarMapItinerary(routes, from, to, { sector = '1', via = null } = {}) {
  const ids = new Map(routes.flatMap(r => [r.a, r.b]).map(id => [id.toLowerCase(), id]));
  from = ids.get(String(from).toLowerCase()); to = ids.get(String(to).toLowerCase());
  if (!from || !to) return null;
  const edges = [];
  const add = (r, reverse) => {
    const source = reverse ? r.destination : r.source, destination = reverse ? r.source : r.destination;
    const a = reverse ? r.b : r.a, b = reverse ? r.a : r.b;
    if (source.hidden || source.arrival || (source.factionReturn && b.toLowerCase() !== `${sector}-3`)) return;
    edges.push({ key: r.key, from: a, to: b, portalId: source.id, arrivalPortalId: destination.id,
      cost: Math.max(0, Number(source.shortcutCreditCost) || 0), conditional: r.conditional });
  };
  for (const r of routes) { add(r, false); if (!r.oneWay) add(r, true); }
  const last = via ? edges.find(e => e.from.toLowerCase() === String(via.from).toLowerCase()
    && e.portalId === via.portalId && e.to === to) : null;
  if (via && !last) return null;
  const goal = last ? last.from : to;
  const pending = [{ map: from, steps: [], cost: 0 }], best = new Map([[from, [0, 0]]]);
  while (pending.length) {
    pending.sort((a, b) => a.cost - b.cost || a.steps.length - b.steps.length);
    const current = pending.shift(), score = best.get(current.map);
    if (current.cost !== score[0] || current.steps.length !== score[1]) continue;
    if (current.map === goal) {
      const steps = last ? [...current.steps, last] : current.steps;
      return { maps: [from, ...steps.map(e => e.to)], steps,
        totalCost: current.cost + (last?.cost || 0) };
    }
    for (const edge of edges) {
      if (edge.from !== current.map) continue;
      const cost = current.cost + edge.cost, hops = current.steps.length + 1, previous = best.get(edge.to);
      if (previous && (previous[0] < cost || (previous[0] === cost && previous[1] <= hops))) continue;
      best.set(edge.to, [cost, hops]);
      pending.push({ map: edge.to, steps: [...current.steps, edge], cost });
    }
  }
  return null;
}

export function createStarMapLayout(nodes, unit, size, art, maps = new Map()) {
  const pad = 48, gap = 18;
  const minCol = Math.min(0, ...nodes.map(n => Number(n.col)));
  const minRow = Math.min(0, ...nodes.map(n => Number(n.row)));
  const positions = new Map(nodes.map(n => [n.id, {
    x: pad + size.w / 2 + (Number(n.col) - minCol) * unit.w,
    y: pad + size.h / 2 + (Number(n.row) - minRow) * unit.h,
  }]));
  const width = Math.ceil(Math.max(...[...positions.values()].map(p => p.x)) + size.w / 2 + pad);
  const height = Math.ceil(Math.max(...[...positions.values()].map(p => p.y)) + size.h / 2 + pad);
  const boxes = nodes.map(n => {
    const p = positions.get(n.id);
    return { id: n.id, ...p, left: p.x - size.w / 2, right: p.x + size.w / 2,
      top: p.y - size.h / 2, bottom: p.y + size.h / 2 };
  });
  const byId = new Map(boxes.map(b => [b.id, b]));
  const pairs = pairStarMapPortals(nodes, maps).map(pair => ({ ...pair,
    start: projectStarMapPortal(positions.get(pair.a), pair.source, maps.get(pair.a), size, art),
    end: projectStarMapPortal(positions.get(pair.b), pair.destination, maps.get(pair.b), size, art),
  }));
  // Les sorties laterales et basses gardent les fils hors du titre de la carte.
  const ports = (box, anchor) => [0, -8, 8].flatMap(offset => [
    { x: box.left - gap, y: anchor.y + offset, direction: 1 },
    { x: box.right + gap, y: anchor.y + offset, direction: 1 },
    { x: anchor.x + offset, y: box.bottom + gap, direction: 2 },
  ]).map(p => ({ ...p, length: Math.abs(p.x - anchor.x) + Math.abs(p.y - anchor.y),
    connector: [anchor, p.direction === 1 ? { x: anchor.x, y: p.y } : { x: p.x, y: anchor.y }, { x: p.x, y: p.y }] }));
  for (const pair of pairs) {
    pair.starts = ports(byId.get(pair.a), pair.start);
    pair.ends = ports(byId.get(pair.b), pair.end);
  }
  const xSet = new Set([gap, width - gap]), ySet = new Set([gap, height - gap]);
  // Plusieurs voies paralleles : deux liens ne doivent pas partager un fil.
  for (const b of boxes) for (const lane of [gap, gap + 8, gap + 16]) {
    xSet.add(b.left - lane); xSet.add(b.right + lane);
    ySet.add(b.top - lane); ySet.add(b.bottom + lane);
  }
  for (const pair of pairs) for (const p of [...pair.starts, ...pair.ends]) { xSet.add(p.x); ySet.add(p.y); }
  const xs = [...xSet].sort((a, b) => a - b), ys = [...ySet].sort((a, b) => a - b);
  const xIndex = new Map(xs.map((x, i) => [x, i])), yIndex = new Map(ys.map((y, i) => [y, i]));
  const cols = xs.length, count = cols * ys.length;
  const indexOf = p => yIndex.get(p.y) * cols + xIndex.get(p.x);
  const pointAt = i => ({ x: xs[i % cols], y: ys[Math.floor(i / cols)] });
  const inside = (x, y) => boxes.some(b => x > b.left - gap + 0.01 && x < b.right + gap - 0.01
    && y > b.top - gap + 0.01 && y < b.bottom + gap - 0.01);
  const free = new Uint8Array(count), neighbors = Array.from({ length: count }, () => []);
  for (let i = 0; i < count; i++) { const p = pointAt(i); free[i] = !inside(p.x, p.y); }
  for (let i = 0; i < count; i++) {
    if (!free[i]) continue;
    const p = pointAt(i), col = i % cols, row = Math.floor(i / cols);
    for (const j of [col + 1 < cols ? i + 1 : -1, row + 1 < ys.length ? i + cols : -1]) {
      if (j < 0 || !free[j]) continue;
      const q = pointAt(j);
      if (inside((p.x + q.x) / 2, (p.y + q.y) / 2)) continue;
      const length = Math.abs(p.x - q.x) + Math.abs(p.y - q.y), direction = p.x === q.x ? 2 : 1;
      neighbors[i].push([j, length, direction]); neighbors[j].push([i, length, direction]);
    }
  }
  const push = (heap, item) => {
    let i = heap.length; heap.push(item);
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (heap[parent].cost <= item.cost) break;
      heap[i] = heap[parent]; i = parent;
    }
    heap[i] = item;
  };
  const pop = heap => {
    const first = heap[0], last = heap.pop();
    if (heap.length) {
      let i = 0;
      while (i * 2 + 1 < heap.length) {
        let child = i * 2 + 1;
        if (child + 1 < heap.length && heap[child + 1].cost < heap[child].cost) child++;
        if (heap[child].cost >= last.cost) break;
        heap[i] = heap[child]; i = child;
      }
      heap[i] = last;
    }
    return first;
  };
  const usage = new Map(), occupied = [], usedDirections = new Uint8Array(count);
  const overlaps = (a, b, c, d) => (a.x === b.x && c.x === d.x && a.x === c.x
    && Math.min(Math.max(a.y, b.y), Math.max(c.y, d.y)) - Math.max(Math.min(a.y, b.y), Math.min(c.y, d.y)) > .01)
    || (a.y === b.y && c.y === d.y && a.y === c.y
      && Math.min(Math.max(a.x, b.x), Math.max(c.x, d.x)) - Math.max(Math.min(a.x, b.x), Math.min(c.x, d.x)) > .01);
  const connectorFree = p => p.connector.every((q, i, points) => !i || !occupied.some(([a, b]) => overlaps(points[i - 1], q, a, b)));
  const route = (pair, allowOverlap = false) => {
    const starts = pair.starts.filter(p => free[indexOf(p)] && (allowOverlap || connectorFree(p))),
      ends = pair.ends.filter(p => free[indexOf(p)] && (allowOverlap || connectorFree(p)));
    if (!starts.length || !ends.length) return [];
    const goals = new Map(ends.map(p => [indexOf(p), p]));
    const heuristic = i => {
      const p = pointAt(i);
      return Math.min(...ends.map(q => Math.abs(p.x - q.x) + Math.abs(p.y - q.y) + q.length));
    };
    const costs = new Float64Array(count * 3).fill(Infinity), previous = new Int32Array(count * 3).fill(-1);
    const heap = [];
    for (const p of starts) {
      const i = indexOf(p), state = i * 3 + p.direction;
      costs[state] = p.length;
      push(heap, { state, cost: p.length + heuristic(i), travelled: p.length });
    }
    while (heap.length) {
      const current = pop(heap), state = current.state, i = Math.floor(state / 3), direction = state % 3;
      if (current.travelled !== costs[state]) continue;
      if (goals.has(i)) {
        const points = [];
        for (let j = state; j >= 0; j = previous[j]) points.push(pointAt(Math.floor(j / 3)));
        points.reverse();
        let root = state; while (previous[root] >= 0) root = previous[root];
        const first = starts.find(p => indexOf(p) === indexOf(points[0]) && p.direction === root % 3);
        const last = goals.get(i);
        points.unshift(...first.connector.slice(0, -1));
        points.push(...last.connector.slice(0, -1).reverse());
        for (let j = state; previous[j] >= 0; j = previous[j]) {
          const here = Math.floor(j / 3), before = Math.floor(previous[j] / 3);
          const key = [here, before].sort((x, y) => x - y).join(':');
          usage.set(key, (usage.get(key) || 0) + 1);
          usedDirections[here] |= j % 3; usedDirections[before] |= j % 3;
        }
        for (let j = 1; j < points.length; j++) occupied.push([points[j - 1], points[j]]);
        const unique = points.filter((p, j) => !j || p.x !== points[j - 1].x || p.y !== points[j - 1].y);
        return unique.filter((p, j) => j === 0 || j === unique.length - 1
          || !((unique[j - 1].x === p.x && p.x === unique[j + 1].x)
            || (unique[j - 1].y === p.y && p.y === unique[j + 1].y)));
      }
      for (const [next, length, nextDirection] of neighbors[i]) {
        const key = [i, next].sort((x, y) => x - y).join(':');
        if (!allowOverlap && usage.has(key)) continue;
        const crossing = (usedDirections[next] & (3 ^ nextDirection)) || (usedDirections[i] & (3 ^ nextDirection));
        const cost = costs[state] + length + (usage.get(key) || 0) * length * 100
          + (direction !== nextDirection ? 32 : 0) + (crossing ? 250 : 0);
        const nextState = next * 3 + nextDirection;
        if (cost >= costs[nextState]) continue;
        costs[nextState] = cost; previous[nextState] = state;
        push(heap, { state: nextState, cost: cost + heuristic(next), travelled: cost });
      }
    }
    return [];
  };
  const routes = pairs.sort((a, b) => Math.abs(a.start.x - a.end.x) + Math.abs(a.start.y - a.end.y)
    - Math.abs(b.start.x - b.end.x) - Math.abs(b.start.y - b.end.y)).map(pair => {
      const points = route(pair);
      return { ...pair, points: points.length ? points : route(pair, true) };
    });
  return { width, height, positions, routes };
}
