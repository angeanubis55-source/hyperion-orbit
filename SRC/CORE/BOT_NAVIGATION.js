import { segCircleHit } from "./COLLISION.js";

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function rectEdges(rect, margin = 0) {
  const hw = Number(rect?.w || 0) / 2 + margin, hh = Number(rect?.h || 0) / 2 + margin;
  return { left: Number(rect?.x || 0) - hw, right: Number(rect?.x || 0) + hw,
    top: Number(rect?.y || 0) - hh, bottom: Number(rect?.y || 0) + hh };
}

// Intersection inclusive : les tangentes et les coins ne sont pas des passages.
function segmentHitsRect(ax, ay, bx, by, rect, margin) {
  const e = rectEdges(rect, margin);
  let enter = 0, exit = 1;
  for (const [origin, delta, min, max] of [[ax, bx - ax, e.left, e.right], [ay, by - ay, e.top, e.bottom]]) {
    if (Math.abs(delta) < 1e-9) { if (origin < min || origin > max) return false; }
    else {
      const a = (min - origin) / delta, b = (max - origin) / delta;
      enter = Math.max(enter, Math.min(a, b)); exit = Math.min(exit, Math.max(a, b));
      if (enter > exit) return false;
    }
  }
  return true;
}

export function isPointInWall(x, y, walls, margin = 0) {
  if (!Array.isArray(walls)) return false;
  return walls.some(w => {
    if (!w) return false;
    const e = rectEdges(w, Math.max(0, Number(margin) || 0));
    return x >= e.left && x <= e.right && y >= e.top && y <= e.bottom;
  });
}

export function isSegmentBlocked(ax, ay, bx, by, walls, margin = 0) {
  if (!Array.isArray(walls)) return false;
  return walls.some(w => w && segmentHitsRect(ax, ay, bx, by, w, Math.max(0, Number(margin) || 0)));
}

const geometries = new WeakMap();
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// Pour se decoller d'un coin, le rectangle gonfle est trop conservateur :
// le rayon physique forme un coin arrondi. Tester son volume exact.
function physicalSegmentBlocked(a, b, walls, radius) {
  return walls.some(wall => {
    if (!wall) return false;
    const e = rectEdges(wall);
    if (segmentHitsRect(a.x, a.y, b.x, b.y, { ...wall, w: wall.w + radius * 2 }, 0)
      || segmentHitsRect(a.x, a.y, b.x, b.y, { ...wall, h: wall.h + radius * 2 }, 0)) return true;
    for (const x of [e.left, e.right]) for (const y of [e.top, e.bottom]) {
      if (segCircleHit(a.x, a.y, b.x, b.y, x, y, radius)) return true;
    }
    return false;
  });
}

// Graphe des coins visibles, calcule une seule fois par carte/rayon/limites.
// Pas de grille : les petits passages restent utilisables et chaque segment
// est valide pour tout le rayon du vaisseau, pas seulement son centre.
function wallGeometry(walls, radius, bounds) {
  const margin = radius + 6;
  const limits = { minX: Number(bounds?.minX ?? -Infinity), minY: Number(bounds?.minY ?? -Infinity),
    maxX: Number(bounds?.maxX ?? Infinity), maxY: Number(bounds?.maxY ?? Infinity) };
  const key = [margin, ...Object.values(limits)].join(":");
  let cache = geometries.get(walls);
  if (!cache) { cache = new Map(); geometries.set(walls, cache); }
  if (cache.has(key)) return cache.get(key);
  const inBounds = p => p.x >= limits.minX && p.x <= limits.maxX && p.y >= limits.minY && p.y <= limits.maxY;
  const bound = p => ({ x: clamp(p.x, limits.minX, limits.maxX), y: clamp(p.y, limits.minY, limits.maxY) });
  const free = p => inBounds(p) && !isPointInWall(p.x, p.y, walls, margin);
  const clear = (a, b) => !isSegmentBlocked(a.x, a.y, b.x, b.y, walls, margin);
  const nodes = [], seen = new Set();
  for (const wall of walls) {
    if (!wall) continue;
    const e = rectEdges(wall, margin + 2);
    for (const x of [e.left, e.right]) for (const y of [e.top, e.bottom]) {
      const p = bound({ x, y }), id = p.x + ":" + p.y;
      if (free(p) && !seen.has(id)) { nodes.push(p); seen.add(id); }
    }
  }
  const edges = nodes.map(() => []);
  for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
    if (!clear(nodes[i], nodes[j])) continue;
    const length = distance(nodes[i], nodes[j]);
    edges[i].push([j, length]); edges[j].push([i, length]);
  }
  const result = { nodes, edges, free, clear, bound, margin, limits };
  // Les changements d'equipement ne doivent pas accumuler des graphes sans fin.
  if (cache.size >= 8) cache.delete(cache.keys().next().value);
  cache.set(key, result);
  return result;
}

// Projection hors de l'union des murs. En recuperation, verifier aussi le
// segment avec le rayon physique : on se decolle, on ne traverse pas le mur.
function nearestFreePoint(point, geometry, walls, radius, recovering = false) {
  const p = geometry.bound(point);
  if (geometry.free(p)) return p;
  const candidates = [...geometry.nodes];
  for (const wall of walls) {
    if (!wall) continue;
    const e = rectEdges(wall, geometry.margin + 2);
    candidates.push({ x: e.left, y: p.y }, { x: e.right, y: p.y },
      { x: p.x, y: e.top }, { x: p.x, y: e.bottom });
  }
  let best = null, bestDistance = Infinity;
  for (const raw of candidates) {
    const candidate = geometry.bound(raw), d = distance(p, candidate);
    if (d >= bestDistance || !geometry.free(candidate)) continue;
    if (recovering && physicalSegmentBlocked(point, candidate, walls, Math.max(0, radius - 0.1))) continue;
    best = candidate; bestDistance = d;
  }
  return best;
}

// Dijkstra sur le graphe statique + raccords visibles du depart et de l'arrivee.
function planPath(start, goal, geometry) {
  const n = geometry.nodes.length, end = n, points = [...geometry.nodes, goal];
  const costs = new Float64Array(n + 1).fill(Infinity), previous = new Int32Array(n + 1).fill(-1);
  const closed = new Uint8Array(n + 1);
  for (let i = 0; i <= n; i++) if (geometry.clear(start, points[i])) costs[i] = distance(start, points[i]);
  for (let pass = 0; pass <= n; pass++) {
    let current = -1, best = Infinity;
    for (let i = 0; i <= n; i++) if (!closed[i] && costs[i] < best) { best = costs[i]; current = i; }
    if (current < 0) return null;
    if (current === end) {
      const path = [];
      for (let index = end; index >= 0; index = previous[index]) path.push(points[index]);
      return path.reverse();
    }
    closed[current] = 1;
    const links = geometry.edges[current];
    const relax = (next, length) => {
      const cost = best + length;
      if (cost < costs[next]) { costs[next] = cost; previous[next] = current; }
    };
    for (const [next, length] of links) if (!closed[next]) relax(next, length);
    if (geometry.clear(points[current], goal)) relax(end, distance(points[current], goal));
  }
  return null;
}

// Un seul trajet memorise, valide a chaque pas. Aucun demi-tour au contact,
// ni abandon parce qu'un contour exige de s'eloigner temporairement du NPC.
export function computeWallDetour({ fromX, fromY, toX, toY, walls, radius = 18, state = {}, dt = 1 / 60, bounds = null }) {
  const start = { x: Number(fromX) || 0, y: Number(fromY) || 0 };
  const requested = { x: Number(toX) || 0, y: Number(toY) || 0 };
  const list = Array.isArray(walls) ? walls : [];
  const shipRadius = Math.max(1, Number(radius) || 18);
  const geometry = wallGeometry(list, shipRadius, bounds);
  const elapsed = Math.max(0, Math.min(0.5, Number(dt) || 0));
  const goal = nearestFreePoint(requested, geometry, list, shipRadius);
  const unavailable = () => {
    state.unreachableT = (Number(state.unreachableT) || 0) + elapsed;
    return { ...start, detour: true, unreachable: true };
  };
  if (!goal) return unavailable();
  if (!geometry.free(start)) {
    state.path = null;
    const escape = nearestFreePoint(start, geometry, list, shipRadius, true);
    if (!escape) return unavailable();
    state.unreachableT = 0;
    return { ...escape, detour: true, freeing: true };
  }
  const projected = distance(goal, requested) > 0.01;
  if (geometry.clear(start, goal)) {
    state.path = null; state.unreachableT = 0;
    return { ...goal, detour: projected, adjusted: projected };
  }
  const goalMoved = !state.goal || distance(goal, state.goal) > 100;
  const geometryChanged = state.geometry !== geometry;
  state.replanT = Math.max(0, (Number(state.replanT) || 0) - elapsed);
  let path = state.path;
  const invalid = !path?.length || !geometry.clear(start, path[0]);
  if (geometryChanged || goalMoved || invalid) {
    // Une destination impossible reste memoisee : pas de recherche a chaque frame.
    if (!geometryChanged && !goalMoved && state.failed && state.replanT > 0) return unavailable();
    path = planPath(start, goal, geometry);
    state.path = path; state.goal = goal; state.geometry = geometry;
    state.failed = !path; state.replanT = path ? 0 : 1;
  }
  if (!path?.length) return unavailable();
  state.unreachableT = 0;
  // Le premier coin n'est retire que lorsqu'on l'atteint ou qu'un raccourci
  // entierement degage est devenu disponible. Aucune coupe de coin a 150 m.
  let aim = 0;
  for (let i = path.length - 1; i > 0; i--) if (geometry.clear(start, path[i])) { aim = i; break; }
  if (aim > 0) { path = path.slice(aim); state.path = path; }
  return { ...path[0], detour: true };
}

// Le mur entre la cible et le joueur prime sur l'orbite, meme a portee laser.
// La destination d'origine reste distincte du prochain coin de contournement.
export function computeBotWallMove({ player, target, npc = null, walls, bounds, state = {}, dt = 1 / 60 }) {
  const radius = Math.max(1, Number(player.r) || 18);
  const blockedNpc = npc && Number(npc.hp) > 0 && !isPointInWall(npc.x, npc.y, walls, radius)
    && isSegmentBlocked(player.x, player.y, npc.x, npc.y, walls, radius + 6);
  const goal = blockedNpc ? npc : target;
  return computeWallDetour({ fromX: player.x, fromY: player.y, toX: goal.x, toY: goal.y,
    walls, radius, bounds, state, dt });
}

export const BOT_RANGE = Object.freeze({ desired: 0.82, inner: 0.70, outer: 0.93, minimum: 140 });

function unit(x, y, fallbackX = 1, fallbackY = 0) {
  const length = Math.hypot(x, y);
  return length > 0.001 ? { x: x / length, y: y / length } : { x: fallbackX, y: fallbackY };
}

// Pure, deterministic steering: independent from rendering and frame rate.
export function computeBotCombatMove({ player, npc, range, desiredDistance, bounds, state = {}, dt = 0, walls = null, shipRadius = 18 }) {
  const laserRange = Math.max(BOT_RANGE.minimum, Number(range) || BOT_RANGE.minimum);
  const desired = Math.max(BOT_RANGE.minimum, Math.min(laserRange - 5, Number(desiredDistance) || laserRange * BOT_RANGE.desired));
  const inner = Math.max(90, desired - Math.max(35, laserRange * 0.06));
  const outer = Math.min(laserRange - 2, Math.max(inner + 20, desired + Math.max(18, laserRange * 0.025)));
  const dx = Number(player.x) - Number(npc.x);
  const dy = Number(player.y) - Number(npc.y);
  const distance = Math.hypot(dx, dy);
  const radial = unit(dx, dy);
  let mode = state.mode || "orbit";
  if (distance < inner) mode = "retreat";
  else if (distance > outer) mode = "approach";
  else if ((mode === "retreat" && distance >= desired) || (mode === "approach" && distance <= desired)) mode = "orbit";

  let direction = state.direction === -1 ? -1 : 1;
  if (!state.direction) direction = ((Number(npc.id) || 0) % 2) ? 1 : -1;
  const lead = mode === "approach" ? 0.3 : 0.15;
  const predictedX = Number(npc.x) + (Number(npc.vx) || 0) * lead;
  const predictedY = Number(npc.y) + (Number(npc.vy) || 0) * lead;
  const targetRadius = mode === "retreat" ? desired + 45 : desired;
  const angleStep = mode === "orbit" ? 0.58 : mode === "retreat" ? 0.24 : 0.18;
  const ca = Math.cos(angleStep * direction);
  const sa = Math.sin(angleStep * direction);
  const orbitX = radial.x * ca - radial.y * sa;
  const orbitY = radial.x * sa + radial.y * ca;

  let x = predictedX + orbitX * targetRadius;
  let y = predictedY + orbitY * targetRadius;
  let wallTurnT = Math.max(0, (Number(state.wallTurnT) || 0) - Math.max(0, Number(dt) || 0));
  const margin = Number(bounds?.margin ?? 80);
  const minX = Number(bounds?.minX ?? 0) + margin;
  const minY = Number(bounds?.minY ?? 0) + margin;
  const maxX = Number(bounds?.maxX ?? 10000) - margin;
  const maxY = Number(bounds?.maxY ?? 10000) - margin;
  if (x < minX || x > maxX || y < minY || y > maxY) {
    if (wallTurnT <= 0) {
      direction *= -1;
      wallTurnT = 0.75;
    }
    const tx = -radial.y * direction, ty = radial.x * direction;
    x = clamp(Number(player.x) + radial.x * 260 + tx * 520, minX, maxX);
    y = clamp(Number(player.y) + radial.y * 260 + ty * 520, minY, maxY);
  } else {
    x = clamp(x, minX, maxX);
    y = clamp(y, minY, maxY);
  }
  // Conserver le sens tant que le segment est praticable. La proximite
  // d'un mur seule n'impose pas de demi-tour : on cherche un point d'orbite
  // visible, au meme rayon, puis le navigateur prend le relais si necessaire.
  if (Array.isArray(walls) && walls.length) {
    const px = Number(player.x) || 0, py = Number(player.y) || 0;
    const clearance = Math.max(1, Number(shipRadius) || 18) + 6;
    const usable = (cx, cy) => cx >= minX && cx <= maxX && cy >= minY && cy <= maxY
      && !isPointInWall(cx, cy, walls, clearance)
      && !isSegmentBlocked(px, py, cx, cy, walls, clearance);
    if (!usable(x, y)) {
      const baseAngle = Math.atan2(radial.y, radial.x);
      let best = null, bestScore = Infinity;
      for (const sign of [direction, -direction]) {
        if (sign !== direction && wallTurnT > 0) continue;
        for (let i = 0; i <= 24; i++) {
          const angle = baseAngle + sign * (angleStep + i * 0.1);
          const cx = predictedX + Math.cos(angle) * targetRadius;
          const cy = predictedY + Math.sin(angle) * targetRadius;
          if (!usable(cx, cy)) continue;
          const score = i * 0.1 + (sign !== direction ? 0.35 : 0);
          if (score < bestScore) { best = { x: cx, y: cy, direction: sign }; bestScore = score; }
          break;
        }
      }
      if (best) {
        x = best.x; y = best.y;
        if (best.direction !== direction) { direction = best.direction; wallTurnT = 1; }
      }
    }
  }
  return { x, y, desired, inner, outer, distance, mode, state: { mode, direction, wallTurnT, elapsed: (Number(state.elapsed) || 0) + Math.max(0, Number(dt) || 0) } };
}
