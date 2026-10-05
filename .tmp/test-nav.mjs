import { computeWallDetour } from "../SRC/CORE/BOT_NAVIGATION.js";
const WORLD = { w: 22000, h: 14000 };
const B = { minX: 100, minY: 100, maxX: WORLD.w - 100, maxY: WORLD.h - 100 };
let fails = 0;
const check = (l, c) => { console.log((c ? "OK  " : "FAIL") + " " + l); if (!c) fails++; };
function run(px, py, tx, ty, walls, maxF = 3600, collide = null) {
  const s = {};
  const speed = 450, dt = 1 / 60;
  let minGap = Infinity, f = 0, outBounds = 0;
  for (; f < maxF; f++) {
    const t = computeWallDetour({ fromX: px, fromY: py, toX: tx, toY: ty, walls, radius: 18, state: s, dt, bounds: B });
    if (t.x < B.minX || t.x > B.maxX || t.y < B.minY || t.y > B.maxY) outBounds++;
    const dx = t.x - px, dy = t.y - py, d = Math.hypot(dx, dy) || 1;
    px += (dx / d) * speed * dt; py += (dy / d) * speed * dt;
    if (collide) [px, py] = collide(px, py);
    for (const w of walls) {
      const cx = Math.max(w.x - w.w / 2, Math.min(px, w.x + w.w / 2));
      const cy = Math.max(w.y - w.h / 2, Math.min(py, w.y + w.h / 2));
      const inside = px > w.x - w.w / 2 && px < w.x + w.w / 2 && py > w.y - w.h / 2 && py < w.y + w.h / 2;
      const gd = Math.hypot(px - cx, py - cy);
      minGap = Math.min(minGap, inside ? -gd : gd);
    }
    if (Math.hypot(tx - px, ty - py) < 150) break;
  }
  return { ok: Math.hypot(tx - px, ty - py) < 150, frames: f, minGap, outBounds };
}
let r = run(5000, 5000, 7000, 5000, [
  { x: 6000, y: 4700, w: 400, h: 500 },
  { x: 6000, y: 5400, w: 400, h: 500 },
]);
check("passage étroit : direct et atteint", r.ok && r.frames < 600);
r = run(6000, 2000, 8000, 2000, [{ x: 7091, y: 3947, w: 471, h: 12895 }]);
check("long mur : atteint, jamais dedans, en map", r.ok && r.minGap >= 17 && r.outBounds === 0);
console.log(`  frames=${r.frames} gap=${r.minGap.toFixed(0)}`);
const U = [
  { x: 5000, y: 5000, w: 200, h: 2000 },
  { x: 6000, y: 6000, w: 2200, h: 200 },
  { x: 7000, y: 5000, w: 200, h: 2000 },
];
const pushOut = (x, y) => {
  for (const w of U) {
    const cx = Math.max(w.x - w.w / 2, Math.min(x, w.x + w.w / 2));
    const cy = Math.max(w.y - w.h / 2, Math.min(y, w.y + w.h / 2));
    const dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy);
    if (d < 18) { if (d < 0.001) x = w.x + w.w / 2 + 18; else { x = cx + dx / d * 18; y = cy + dy / d * 18; } }
  }
  return [x, y];
};
r = run(6000, 4500, 6000, 7500, U, 3600, pushOut);
check("cul-de-sac : sorti et atteint", r.ok);
console.log(`  frames=${r.frames}`);
console.log(fails === 0 ? "ALL OK" : "FAIL");
process.exit(fails ? 1 : 0);
