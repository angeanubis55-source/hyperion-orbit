import { isPointInWall } from './BOT_NAVIGATION.js';

const BL_TYPES = new Set(['npc_Invoke_XVI', 'npc_Mindfire_Behemoth', 'npc_Strokelight_Barrage']);
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// Les habitats connus suffisent : aucune position de NPC invisible n'est lue.
// Chaque zone garde son parcours, et les types coches passent a tour de role.
export function blacklightSearchTarget({ mapId, camps, allowed, world, walls = [], player,
  sensorRange = 1800, state, dt = 0, failed = false }) {
  const types = [...allowed].filter(type => BL_TYPES.has(type)).sort();
  if (!/^[123]-bl$/i.test(mapId) || !types.length) { state.target = null; return null; }
  const signature = `${mapId.toLowerCase()}:${types.join(',')}:${sensorRange}`;
  if (state.signature !== signature || state.camps !== camps || state.walls !== walls) {
    Object.assign(state, { signature, camps, walls, target: null, serial: 0, groups: [] });
    const seen = new Set(), spacing = Math.max(400, Math.min(2000, sensorRange));
    const free = p => p.x >= 100 && p.y >= 100 && p.x <= world.w - 100 && p.y <= world.h - 100
      && !isPointInWall(p.x, p.y, walls, Math.max(18, Number(player.r) || 18) + 12);
    for (const camp of camps) {
      if (!types.includes(camp.type)) continue;
      const area = camp.spawnArea;
      // Invoke : utiliser la zone officielle, pas les positions aleatoires des slots.
      const key = `${camp.type}:${area ? [area.x1, area.y1, area.x2, area.y2].join(':') : `${camp.x}:${camp.y}`}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const points = [];
      if (area) {
        const cols = Math.max(1, Math.ceil((area.x2 - area.x1) / spacing));
        const rows = Math.max(1, Math.ceil((area.y2 - area.y1) / spacing));
        for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
          const left = area.x1 + col / cols * (area.x2 - area.x1), top = area.y1 + row / rows * (area.y2 - area.y1);
          const width = (area.x2 - area.x1) / cols, height = (area.y2 - area.y1) / rows;
          // Si le centre est dans un mur, inspecter la partie libre de cette cellule.
          for (const [fx, fy] of [[.5, .5], [.2, .2], [.8, .2], [.2, .8], [.8, .8]]) {
            const p = { x: left + width * fx, y: top + height * fy };
            if (free(p)) { points.push(p); break; }
          }
        }
      } else if (camp.fixed) {
        points.push({ x: camp.x, y: camp.y });
        // Un boss absent : faire une petite ronde dans son secteur plutot que camper.
        for (const [dx, dy] of [[600, 0], [0, 600], [-600, 0], [0, -600]])
          points.push({ x: camp.x + dx, y: camp.y + dy });
      }
      const valid = points.filter(free);
      if (valid.length) state.groups.push({ type: camp.type, points: valid, visited: new Set(), last: -1 });
    }
  }
  if (state.target) {
    const remaining = distance(player, state.target);
    // Un detour peut nous eloigner du point : mesurer le mouvement reel,
    // sinon une longue paroi ferait abandonner un trajet pourtant praticable.
    if (distance(player, state.progressPosition) > 40) { state.progressPosition = { x: player.x, y: player.y }; state.stalled = 0; }
    else state.stalled += Math.max(0, dt);
    if (remaining > 120 && !failed && state.stalled < 20) return state.target;
    state.target = null;
  }
  const groups = state.groups;
  if (!groups.length) return null;
  const nearest = group => Math.min(...group.points.filter((_, i) => !group.visited.has(i)).map(p => distance(player, p)));
  for (const group of groups) if (group.visited.size === group.points.length) group.visited.clear();
  const group = [...groups].sort((a, b) => a.last - b.last || nearest(a) - nearest(b))[0];
  let index = -1, best = Infinity;
  group.points.forEach((p, i) => {
    if (group.visited.has(i)) return;
    // Ne pas rechoisir immediatement le point sur lequel on vient d'arriver.
    const d = distance(player, p), score = d <= 120 ? Infinity : d;
    if (score < best) { best = score; index = i; }
  });
  if (index < 0) index = group.points.findIndex((_, i) => !group.visited.has(i));
  group.visited.add(index); group.last = state.serial++;
  state.target = { ...group.points[index], type: group.type };
  state.progressPosition = { x: player.x, y: player.y }; state.stalled = 0;
  return state.target;
}
