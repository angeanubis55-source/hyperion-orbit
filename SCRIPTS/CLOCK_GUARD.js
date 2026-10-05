// Pause de session reversible, distincte du gel de compte par moderation.
// Les mesures du client sont des indices ; la reprise attend aussi le temps
// serveur et l'absence recente de rejets serveur verifies.
export function updateClockGuard(state, requested, elapsed, now) {
  if (![requested, elapsed, now].every(Number.isFinite) || requested < 0 || elapsed < 5) return null;
  const ratio = requested / elapsed;
  if (ratio > 3) {
    state._clockGuard = { blocked: true, lastAbnormalAt: now };
    return { blocked: true };
  }
  if (!state._clockGuard?.blocked) return { blocked: false };
  const recentRejection = state._security?.history?.some(e =>
    ["movement", "combat"].includes(e.kind) && now - e.at < 5000);
  if (ratio >= 0.5 && ratio <= 1.5 && now - state._clockGuard.lastAbnormalAt >= 5000 && !recentRejection) {
    state._clockGuard = null;
    return { blocked: false, recovered: true };
  }
  return { blocked: true };
}

export function stopRejectedMotion(state) {
  Object.assign(state, { vx: 0, vy: 0, moving: false, mx: state.x, my: state.y, motionBlocked: true });
}
