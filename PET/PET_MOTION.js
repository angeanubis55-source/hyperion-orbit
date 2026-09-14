// Le point de repos reste fixe dans le monde tant qu'il est dans la zone.
// Le suivi d?pend de la position r?elle, ind?pendamment du mode de clic.
export function petEscortTarget(state, player, dt, radius = 300) {
  if (!Number.isFinite(state.escortX) || !Number.isFinite(state.escortY)) {
    const dx = Number.isFinite(state.x) ? state.x - player.x : -radius * 0.75;
    const dy = Number.isFinite(state.y) ? state.y - player.y : 0;
    const distance = Math.hypot(dx, dy);
    const scale = distance > radius ? radius * 0.75 / distance : 1;
    state.escortX = player.x + dx * scale;
    state.escortY = player.y + dy * scale;
    state.ownerMoveDelay = 0.42;
  }
  // Une pause durable termine le trajet ; les pauses entre clics restent ignorees.
  state.escortLastX ??= player.x;
  state.escortLastY ??= player.y;
  const moved = Math.hypot(player.x - state.escortLastX, player.y - state.escortLastY);
  state.escortLastX = player.x;
  state.escortLastY = player.y;
  state.escortIdleTime = moved > 0.1 ? 0 : (state.escortIdleTime || 0) + dt;
  if (state.escortNeedsRest && state.escortIdleTime >= 0.6) {
    const angle = Math.random() * Math.PI * 2;
    const restRadius = radius * (0.4 + Math.random() * 0.45);
    state.escortX = player.x + Math.cos(angle) * restRadius;
    state.escortY = player.y + Math.sin(angle) * restRadius;
    state.escortNeedsRest = false;
  }
  const dx = state.escortX - player.x;
  const dy = state.escortY - player.y;
  const distance = Math.hypot(dx, dy);
  state.ownerFollowing = false;
  if (distance > radius) {
    // Les pauses entre clics ne r?initialisent pas une demande de suivi.
    state.ownerMoveDelay = Math.max(0, state.ownerMoveDelay - dt);
    if (state.ownerMoveDelay <= 0) {
      const offset = radius * 0.75 / distance;
      state.escortX = player.x + dx * offset;
      state.escortY = player.y + dy * offset;
      state.ownerFollowing = true;
      if (moved > 0.1) state.escortNeedsRest = true;
    }
  } else {
    state.ownerMoveDelay = 0.42;
  }
  return { x: state.escortX, y: state.escortY };
}

export function stepPetMotion(state, vx, vy, dt, world, outside = 0) {
  const requestedSpeed = Math.hypot(vx, vy);
  if (requestedSpeed > 1) {
    const requestedDirection = Math.atan2(vy, vx);
    state.courseTime = Math.max(0, (state.courseTime || 0) - dt);
    const courseError = Number.isFinite(state.courseDirection)
      ? Math.abs(Math.atan2(Math.sin(requestedDirection - state.courseDirection), Math.cos(requestedDirection - state.courseDirection)))
      : Infinity;
    // Le PET vole par petits segments. Il ne courbe pas sa trajectoire à
    // chaque frame : à intervalle court, son nouveau cap est pris sèchement.
    if (!Number.isFinite(state.courseDirection) || state.courseTime <= 0 || courseError > 1.15) {
      state.courseDirection = requestedDirection;
      state.courseTime = 0.28;
    }
    vx = Math.cos(state.courseDirection) * requestedSpeed;
    vy = Math.sin(state.courseDirection) * requestedSpeed;
  }
  // Substeps bound integration error during frame drops and smooth mode changes.
  let remaining = Math.max(0, Math.min(dt, 0.25));
  while (remaining > 1e-9) {
    const step = Math.min(remaining, 1 / 120);
    const blend = 1 - Math.exp(-8 * step);
    // Change course immediately; smooth only thrust/braking, not the turn.
    const requestedSpeed = Math.hypot(vx, vy);
    const currentSpeed = Math.hypot(state.vx || 0, state.vy || 0);
    const speed = currentSpeed + (requestedSpeed - currentSpeed) * blend;
    const direction = requestedSpeed > 1 ? Math.atan2(vy, vx)
      : Math.atan2(state.vy || 0, state.vx || 0);
    state.vx = Math.cos(direction) * speed;
    state.vy = Math.sin(direction) * speed;
    const x = state.x + state.vx * step, y = state.y + state.vy * step;
    // outside > 0 : le REX peut suivre hors-carte (zone de radiation).
    state.x = Math.max(80 - outside, Math.min(world.w - 80 + outside, x));
    state.y = Math.max(80 - outside, Math.min(world.h - 80 + outside, y));
    if (state.x !== x) state.vx = 0;
    if (state.y !== y) state.vy = 0;
    remaining -= step;
  }
}

// Keep a broad annulus and move between nearby bearings, never aim at the centre.
export function petCombatVelocity(state, target, range, dt, owner = null) {
  const dx = state.x - target.x, dy = state.y - target.y;
  const distance = Math.hypot(dx, dy);
  const bearing = Math.atan2(dy, dx);
  if (state.combatTarget !== target) {
    state.combatTarget = target;
    state.combatBearing = bearing;
    state.combatRangeGoal = range * 0.94;
    state.combatRangeFar = true;
    state.combatWait = 0;
    state.nearSideWait = 2;
  }
  const radialError = state.combatRangeGoal - distance;
  // Le délai ne s'écoule qu'une fois la position atteinte. Le REX évite ainsi
  // de changer d'avis au milieu du trajet et ne reste que brièvement immobile.
  if (Math.abs(radialError) <= 10) state.combatWait -= dt;
  if (Math.abs(radialError) <= 10 && state.combatWait <= 0) {
    state.combatWait = 0.14 + Math.random() * 0.2;
    state.combatRangeFar = !state.combatRangeFar;
    // Va-et-vient en gardant au moins 75 % du rayon comme distance cible.
    state.combatRangeGoal = range * (state.combatRangeFar
      ? 0.91 + Math.random() * 0.07
      : 0.75 + Math.random() * 0.10);
    // Petit changement d'axe entre deux va-et-vient, appliqué sèchement.
    state.combatBearing = bearing + (Math.random() - 0.5) * 0.28;
  }
  state.nearSideWait -= dt;
  if (state.nearSideWait <= 0) {
    state.nearSideWait = 1.7 + Math.random() * 0.6;
    // Décision espacée et aléatoire : parfois le REX choisit le point du
    // cercle de combat situé du côté de son propriétaire.
    if (owner && Math.random() < 0.6) {
      state.combatBearing = Math.atan2(owner.y - target.y, owner.x - target.x);
    }
  }
  const error = Math.atan2(Math.sin(state.combatBearing - bearing), Math.cos(state.combatBearing - bearing));
  const currentRadialError = state.combatRangeGoal - distance;
  const radial = Math.abs(currentRadialError) > 8 ? currentRadialError * 5.2 : 0;
  const tangent = Math.max(-120, Math.min(120, error * range * 1.5));
  return { vx: Math.cos(bearing) * radial - Math.sin(bearing) * tangent + (target.vx || 0),
    vy: Math.sin(bearing) * radial + Math.cos(bearing) * tangent + (target.vy || 0) };
}

export function orientPet(state) {
  if (Math.hypot(state.vx || 0, state.vy || 0) < 12) return;
  state.angle = Math.atan2(state.vy, state.vx);
}
