// Les Invoke immobiles doivent rester assez espaces pour leurs sprites.
export const INVOKE_SPAWN_MIN_DISTANCE = 700;

export function pickSpacedSpawnPosition({ area, occupied = [], walls = [], margin = 120,
  minDistance = INVOKE_SPAWN_MIN_DISTANCE, preferred = null, random = Math.random }) {
  if (!area || ![area.x1, area.y1, area.x2, area.y2].every(value => Number.isFinite(Number(value)))) return null;
  const x1 = Math.min(Number(area.x1), Number(area.x2)), x2 = Math.max(Number(area.x1), Number(area.x2));
  const y1 = Math.min(Number(area.y1), Number(area.y2)), y2 = Math.max(Number(area.y1), Number(area.y2));
  const minimum2 = minDistance * minDistance;
  const valid = ({ x, y }) => x >= x1 && x <= x2 && y >= y1 && y <= y2
    && !walls.some(wall => Math.abs(x - wall.x) <= wall.w / 2 + margin
      && Math.abs(y - wall.y) <= wall.h / 2 + margin)
    && !occupied.some(other => (x - other.x) ** 2 + (y - other.y) ** 2 < minimum2);
  if (preferred && valid(preferred)) return { x: preferred.x, y: preferred.y };
  for (let attempt = 0; attempt < 64; attempt++) {
    const point = { x: x1 + random() * (x2 - x1), y: y1 + random() * (y2 - y1) };
    if (valid(point)) return point;
  }
  // Repli deterministe : ne jamais accepter un chevauchement faute de chance.
  const step = Math.max(80, minDistance / 2);
  const cols = Math.max(1, Math.ceil((x2 - x1) / step));
  const rows = Math.max(1, Math.ceil((y2 - y1) / step));
  for (let row = 0; row <= rows; row++) {
    for (let col = 0; col <= cols; col++) {
      const point = { x: x1 + col * (x2 - x1) / cols, y: y1 + row * (y2 - y1) / rows };
      if (valid(point)) return point;
    }
  }
  return null;
}
