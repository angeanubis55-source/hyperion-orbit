const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export const BOT_RANGE = Object.freeze({ desired: 0.82, inner: 0.70, outer: 0.93, minimum: 140 });

function unit(x, y, fallbackX = 1, fallbackY = 0) {
  const length = Math.hypot(x, y);
  return length > 0.001 ? { x: x / length, y: y / length } : { x: fallbackX, y: fallbackY };
}

// Pure, deterministic steering: independent from rendering and frame rate.
export function computeBotCombatMove({ player, npc, range, desiredDistance, bounds, state = {}, dt = 0 }) {
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
  const margin = Number(bounds?.margin ?? 80);
  const minX = Number(bounds?.minX ?? 0) + margin;
  const minY = Number(bounds?.minY ?? 0) + margin;
  const maxX = Number(bounds?.maxX ?? 10000) - margin;
  const maxY = Number(bounds?.maxY ?? 10000) - margin;
  if (x < minX || x > maxX || y < minY || y > maxY) {
    direction *= -1;
    const tx = -radial.y * direction, ty = radial.x * direction;
    x = clamp(Number(player.x) + radial.x * 260 + tx * 520, minX, maxX);
    y = clamp(Number(player.y) + radial.y * 260 + ty * 520, minY, maxY);
  } else {
    x = clamp(x, minX, maxX);
    y = clamp(y, minY, maxY);
  }
  return { x, y, desired, inner, outer, distance, mode, state: { mode, direction, elapsed: (Number(state.elapsed) || 0) + Math.max(0, Number(dt) || 0) } };
}
