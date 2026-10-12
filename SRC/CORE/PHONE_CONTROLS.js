export const PHONE_AIM_HALF_ANGLE = Math.PI / 9;

export function joystickVector(dx, dy, radius, deadZone = 0.14) {
  const distance = Math.hypot(dx, dy);
  const fraction = Math.min(1, distance / Math.max(1, radius));
  const strength = Math.max(0, (fraction - deadZone) / (1 - deadZone));
  return { x: distance ? dx / distance : 0, y: distance ? dy / distance : 0, strength,
    knobX: distance ? dx / distance * fraction * radius : 0,
    knobY: distance ? dy / distance * fraction * radius : 0 };
}

export function pickPhoneAimTarget(player, enemies, angle, range, isVisible = () => true) {
  if (!Number.isFinite(angle) || !(range > 0)) return null;
  const ux = Math.cos(angle), uy = Math.sin(angle), limit = Math.cos(PHONE_AIM_HALF_ANGLE);
  let best = null, bestAlignment = -1, bestDistance = Infinity;
  for (const enemy of enemies || []) {
    if (!enemy || !(enemy.hp > 0) || enemy._netPlayer || enemy._netPet || enemy.isPetTarget) continue;
    const dx = enemy.x - player.x, dy = enemy.y - player.y, d2 = dx * dx + dy * dy;
    if (!(d2 > 0 && d2 <= range * range) || !isVisible(enemy)) continue;
    const alignment = (dx * ux + dy * uy) / Math.sqrt(d2);
    if (alignment < limit) continue;
    if (alignment > bestAlignment + 1e-9 || (Math.abs(alignment - bestAlignment) <= 1e-9 && d2 < bestDistance)) {
      best = enemy; bestAlignment = alignment; bestDistance = d2;
    }
  }
  return best;
}

export function drawPhoneAimCone(ctx, player, angle, range, target, ox, oy) {
  if (!Number.isFinite(angle) || !(range > 0)) return;
  const x = player.x + ox, y = player.y + oy;
  ctx.save();
  ctx.beginPath(); ctx.moveTo(x, y);
  ctx.arc(x, y, range, angle - PHONE_AIM_HALF_ANGLE, angle + PHONE_AIM_HALF_ANGLE);
  ctx.closePath();
  ctx.fillStyle = target ? 'rgba(255,130,80,0.12)' : 'rgba(100,210,255,0.10)'; ctx.fill();
  ctx.strokeStyle = target ? 'rgba(255,160,100,0.85)' : 'rgba(124,240,255,0.65)';
  ctx.lineWidth = 1.5; ctx.stroke();
  if (target) {
    ctx.beginPath(); ctx.arc(target.x + ox, target.y + oy, Math.max(22, Number(target.r) || 18) + 10, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,190,100,0.95)'; ctx.lineWidth = 2; ctx.stroke();
  }
  ctx.restore();
}

// Keep the thumb controls near the edges, leaving the dock and its menu clear.
// The label below each circle also needs room. In cramped views the UI remains
// above the controls even when there is no free rectangle large enough.
export function placePhoneJoystick(preferred, obstacles, viewport, side) {
  const gap = 10, label = 24, minimum = 88;
  const original = preferred.width;
  const edge = side === 'move' ? preferred.left : viewport.width - preferred.right;
  const sizes = [...new Set([original, Math.max(minimum, original - 16), minimum])];
  const overlaps = (left, top, size, obstacle) => left < obstacle.right + gap && left + size > obstacle.left - gap
    && top < obstacle.bottom + gap && top + size + label > obstacle.top - gap;
  const inside = (left, top, size) => left >= 0 && left + size <= viewport.width
    && top >= 8 && top + size + label <= viewport.height - 8;
  const positions = sizes.flatMap(size => [edge, Math.max(8, edge - 10)].map(inset => ({
    left: side === 'move' ? inset : viewport.width - inset - size,
    top: preferred.bottom - size, size,
  })));
  for (const position of positions) {
    if (inside(position.left, position.top, position.size)
      && !obstacles.some(o => overlaps(position.left, position.top, position.size, o))) return position;
  }
  for (const position of positions) {
    for (let i = 0; i <= obstacles.length; i++) {
      const blocking = obstacles.filter(o => overlaps(position.left, position.top, position.size, o));
      if (!blocking.length) {
        if (inside(position.left, position.top, position.size)) return position;
        break;
      }
      position.top = Math.min(...blocking.map(o => o.top - position.size - label - gap));
      if (position.top < 8) break;
    }
  }
  return { left: preferred.left, top: preferred.top, size: original };
}

// Each hand owns its pointer until release, including outside the joystick.
export function createPhoneControls(root, { onMoveStart = () => {}, onMoveStop = () => {}, onAimRelease = () => {} } = {}) {
  const sides = ['move', 'aim'].map(name => ({ name, element: root.querySelector(`[data-phone-stick="${name}"]`),
    pointerId: null, vector: null, angle: null }));
  let enabled = false, blocked = false, configured = false;

  function position(side, event) {
    const rect = side.element.getBoundingClientRect();
    side.vector = joystickVector(event.clientX - rect.left - rect.width / 2,
      event.clientY - rect.top - rect.height / 2, Math.min(rect.width, rect.height) * 0.34);
    if (side.vector.strength > 0) side.angle = Math.atan2(side.vector.y, side.vector.x);
    side.element.querySelector('.phoneJoystickKnob').style.transform =
      `translate(${side.vector.knobX}px, ${side.vector.knobY}px)`;
  }

  function end(side, fire = false) {
    if (side.pointerId == null) return;
    const id = side.pointerId, angle = side.angle;
    side.pointerId = null; side.vector = null; side.angle = null;
    side.element.classList.remove('active');
    side.element.querySelector('.phoneJoystickKnob').style.transform = 'translate(0px, 0px)';
    try { side.element.releasePointerCapture(id); } catch {}
    if (side.name === 'move') onMoveStop();
    else if (fire && enabled && !blocked) onAimRelease(angle);
  }

  for (const side of sides) {
    side.element.addEventListener('pointerdown', event => {
      if (!enabled || blocked || event.button !== 0 || side.pointerId != null) return;
      event.preventDefault(); event.stopPropagation();
      side.pointerId = event.pointerId; side.angle = null;
      side.element.setPointerCapture(event.pointerId);
      side.element.classList.add('active'); position(side, event);
      if (side.name === 'move') onMoveStart();
    }, { passive: false });
    side.element.addEventListener('pointermove', event => {
      if (event.pointerId !== side.pointerId) return;
      event.preventDefault(); event.stopPropagation(); position(side, event);
    }, { passive: false });
    side.element.addEventListener('pointerup', event => {
      if (event.pointerId !== side.pointerId) return;
      event.preventDefault(); event.stopPropagation(); position(side, event); end(side, true);
    }, { passive: false });
    for (const type of ['pointercancel', 'lostpointercapture']) {
      side.element.addEventListener(type, event => { if (event.pointerId === side.pointerId) end(side); });
    }
    side.element.addEventListener('contextmenu', event => event.preventDefault());
  }
  const cancel = () => { for (const side of sides) end(side); };
  const doc = root.ownerDocument, view = doc.defaultView;
  view.addEventListener('blur', cancel);
  view.addEventListener('resize', () => { cancel(); queueLayout(); });
  doc.addEventListener('visibilitychange', () => { if (doc.hidden) cancel(); });

  const dock = doc.getElementById?.('ammoBar'), palette = dock?.querySelector('.actionPalette');
  const dockToggle = dock?.querySelector('.actionPaletteToggle');
  let layoutQueued = false;
  function queueLayout() {
    if (!enabled || !dock || layoutQueued) return;
    layoutQueued = true;
    view.requestAnimationFrame(() => { layoutQueued = false; updateLayout(); });
  }
  function updateLayout() {
    if (!enabled || root.hidden) return;
    const obstacles = [dock, palette, dockToggle].filter(element => {
      if (!element || element.hidden) return false;
      const style = view.getComputedStyle(element);
      // Opening uses a visibility transition: reserve its space immediately,
      // rather than measuring it as hidden during the first animation frame.
      return style.display !== 'none' && (element === palette || style.visibility !== 'hidden');
    }).map(element => element.getBoundingClientRect()).filter(rect => rect.width > 0 && rect.height > 0);
    const before = sides.map(side => side.element.getBoundingClientRect());
    // Restore the CSS anchors before measuring, so a closing menu also lowers
    // the controls and an orientation change uses the new responsive sizes.
    for (const side of sides) {
      for (const property of ['left', 'right', 'top', 'bottom', 'width', 'height']) side.element.style.removeProperty(property);
    }
    const positions = sides.map(side => placePhoneJoystick(side.element.getBoundingClientRect(), obstacles,
      { width: view.innerWidth, height: view.innerHeight }, side.name));
    sides.forEach((side, index) => {
      const position = positions[index], old = before[index];
      Object.assign(side.element.style, { left: `${position.left}px`, right: 'auto', top: `${position.top}px`, bottom: 'auto',
        width: `${position.size}px`, height: `${position.size}px` });
      if (Math.abs(old.left - position.left) > 0.5 || Math.abs(old.top - position.top) > 0.5 || Math.abs(old.width - position.size) > 0.5) end(side);
    });
  }
  if (dock) {
    if (view.ResizeObserver) {
      const observer = new view.ResizeObserver(queueLayout);
      observer.observe(dock); if (palette) observer.observe(palette);
    }
    if (view.MutationObserver) {
      const observer = new view.MutationObserver(queueLayout);
      const options = { attributes: true, attributeFilter: ['hidden', 'style', 'class'] };
      observer.observe(dock, options); if (palette) observer.observe(palette, options);
    }
  }

  return {
    configure(on, locked = false) {
      const next = on === true, lock = locked === true;
      if (configured && next === enabled && lock === blocked) return;
      configured = true;
      if ((!next && enabled) || (lock && !blocked)) cancel();
      enabled = next; blocked = lock;
      root.hidden = !enabled;
      root.classList.toggle('blocked', blocked);
      for (const side of sides) side.element.disabled = !enabled || blocked;
      queueLayout();
    },
    movement: () => enabled && !blocked && sides[0].pointerId != null ? sides[0].vector : null,
    aimAngle: () => enabled && !blocked && sides[1].pointerId != null ? sides[1].angle : null,
    cancel,
  };
}
