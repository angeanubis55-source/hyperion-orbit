export const PHONE_AIM_HALF_ANGLE = Math.PI / 9;
// La sélection occupe presque toute la course. L'attaque ne s'arme que
// lorsque le joystick est réellement poussé contre son bord extérieur.
export const PHONE_AIM_OUTER_RING = 0.90;

export function phoneAimRing(strength) {
  const value = Number(strength) || 0;
  if (value <= 0) return 0;
  return value >= PHONE_AIM_OUTER_RING ? 2 : 1;
}

// La roue des raccourcis demande une poussée franche pour atteindre la barre 2
// et utilise une hystérésis pour éviter les bascules dues aux tremblements.
export function phoneQuickRing(strength, currentRing = 0) {
  const value = Number(strength) || 0;
  // Dès la prise en main, la barre 1 est ouverte. La distance ne sert ensuite
  // qu'à décider du passage volontaire vers la barre 2.
  if (value <= 0) return 1;
  if (currentRing === 2) return value >= 0.78 ? 2 : 1;
  return value >= 0.96 ? 2 : 1;
}

export function phoneQuickSlot(angle, ring, slotsPerBar = 10) {
  if (!Number.isFinite(angle) || !(ring === 1 || ring === 2) || !(slotsPerBar > 0)) return -1;
  const turn = Math.PI * 2;
  const clockwiseFromTop = ((angle + Math.PI / 2) % turn + turn) % turn;
  const slot = Math.round(clockwiseFromTop / turn * slotsPerBar) % slotsPerBar;
  return slot + (ring - 1) * slotsPerBar;
}

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
    // Les joueurs et PET réseau sont des cibles valides. Le PET local garde
    // son verrouillage dédié et ne doit pas être sélectionné comme ennemi.
    if (!enemy || !(enemy.hp > 0) || enemy.isPetTarget) continue;
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
export function createPhoneControls(root, { onMoveStart = () => {}, onMoveStop = () => {}, onAimRelease = () => {},
  onQuickRelease = () => {} } = {}) {
  const sides = ['move', 'aim', 'quick'].map(name => ({ name, element: root.querySelector(`[data-phone-stick="${name}"]`),
    pointerId: null, vector: null, angle: null, ring: 0, quickSlot: -1, dragDX: 0, dragDY: 0 }));
  let enabled = false, blocked = false, configured = false, layoutEditing = false, customLayout = null;
  const layoutScales = { move: 1, aim: 1, quick: 1 };

  function sizeKnob(side, outerSize, scale = layoutScales[side.name]) {
    const ratio = side.name === 'quick' ? 0.24 : 0.4;
    const cap = side.name === 'quick' ? 46 : 58;
    const baseOuterSize = outerSize / Math.max(0.01, scale);
    const size = Math.min(cap, baseOuterSize * ratio) * Math.min(1, scale);
    const knob = side.element.querySelector('.phoneJoystickKnob');
    knob.style.width = `${size}px`;
    knob.style.height = `${size}px`;
  }

  function positionSizeControls() {
    if (!layoutEditing) return;
    const view = root.ownerDocument.defaultView;
    for (const side of sides) {
      const control = root.querySelector(`[data-phone-size="${side.name}"]`);
      if (!control) continue;
      const joystick = side.element.getBoundingClientRect();
      const box = control.getBoundingClientRect();
      const left = Math.max(4, Math.min(view.innerWidth - box.width - 4, joystick.left + (joystick.width - box.width) / 2));
      const above = joystick.top - box.height - 8;
      const top = above >= 4 ? above : Math.min(view.innerHeight - box.height - 4, joystick.bottom + 8);
      Object.assign(control.style, { left: `${left}px`, top: `${top}px` });
    }
  }

  function moveLayoutSide(side, event) {
    const view = root.ownerDocument.defaultView;
    const rect = side.element.getBoundingClientRect();
    const left = Math.max(0, Math.min(view.innerWidth - rect.width, event.clientX - side.dragDX));
    const top = Math.max(0, Math.min(view.innerHeight - rect.height, event.clientY - side.dragDY));
    Object.assign(side.element.style, { left: `${left}px`, right: 'auto', top: `${top}px`, bottom: 'auto', transform: 'none' });
    positionSizeControls();
  }

  function endLayoutDrag(side) {
    if (side.pointerId == null) return;
    const id = side.pointerId;
    side.pointerId = null;
    side.element.classList.remove('active', 'layoutDragging');
    try { side.element.releasePointerCapture(id); } catch {}
  }

  function position(side, event) {
    const rect = side.element.getBoundingClientRect();
    const dx = event.clientX - rect.left - rect.width / 2;
    const dy = event.clientY - rect.top - rect.height / 2;
    const quickCancel = side.name === 'quick' && Math.hypot(dx, dy) <= Math.min(rect.width, rect.height) * 0.04;
    side.vector = joystickVector(dx, dy, Math.min(rect.width, rect.height) * 0.34);
    // La roue centrale n'a aucune zone morte directionnelle : le moindre
    // déplacement du doigt choisit déjà une case de la barre 1.
    if (side.vector.strength > 0 || (side.name === 'quick' && Math.hypot(dx, dy) > 0)) {
      side.angle = Math.atan2(dy, dx);
    }
    if (side.name === 'aim' || side.name === 'quick') {
      const nextRing = side.name === 'quick'
        ? phoneQuickRing(side.vector.strength, side.ring)
        : phoneAimRing(side.vector.strength);
      if (nextRing !== side.ring) {
        side.ring = nextRing;
        side.element.classList.toggle('ringOne', nextRing === 1);
        side.element.classList.toggle('ringTwo', nextRing === 2);
        try { if (nextRing > 0) root.ownerDocument.defaultView.navigator?.vibrate?.(8); } catch {}
      }
      if (side.name === 'quick') {
        const slot = quickCancel ? -1 : phoneQuickSlot(side.angle, nextRing);
        side.quickSlot = slot;
        const quickItem = side.element.querySelector(`.phoneQuickItem[data-index="${slot}"]`);
        const label = quickItem?.dataset?.quickLabel || `Case ${slot % 10 + 1}`;
        const quantity = quickItem?.dataset?.quickQuantity || "";
        if (slot >= 0) {
          side.element.dataset.quickIndex = String(slot);
          side.element.dataset.quickBar = String(nextRing);
        }
        if (slot < 0) side.element.dataset.quickSlot = "Sélection annulée";
        else if (quickItem?.dataset?.quickLaser === "1") {
          side.element.dataset.quickSlot = `Barre ${nextRing} : ${label}${quantity ? ` : quantité ${quantity}` : ""}`;
        }
        side.element.querySelectorAll('.phoneQuickItem').forEach((item, index) =>
          item.classList.toggle('selected', index === slot));
        side.element.querySelectorAll('.phoneQuickCancel').forEach(item =>
          item.classList.toggle('selected', slot < 0));
      }
    }
    side.element.querySelector('.phoneJoystickKnob').style.transform =
      `translate(${side.vector.knobX}px, ${side.vector.knobY}px)`;
  }

  function end(side, fire = false) {
    if (side.pointerId == null) return;
    const id = side.pointerId, angle = side.angle, ring = side.ring, quickSlot = side.quickSlot;
    side.pointerId = null; side.vector = null; side.angle = null; side.ring = 0; side.quickSlot = -1;
    side.element.classList.remove('active');
    side.element.classList.remove('ringOne', 'ringTwo');
    if (side.name === 'quick') {
      side.element.querySelectorAll('.phoneQuickItem').forEach(item => item.classList.remove('selected'));
      side.element.querySelectorAll('.phoneQuickCancel').forEach(item => item.classList.remove('selected'));
    }
    side.element.querySelector('.phoneJoystickKnob').style.transform = 'translate(0px, 0px)';
    try { side.element.releasePointerCapture(id); } catch {}
    if (side.name === 'move') onMoveStop();
    else if (side.name === 'aim' && fire && enabled && !blocked) onAimRelease(angle, ring);
    else if (side.name === 'quick' && fire && enabled && !blocked && quickSlot >= 0) onQuickRelease(quickSlot);
  }

  for (const side of sides) {
    side.element.addEventListener('pointerdown', event => {
      if (layoutEditing && enabled && event.button === 0 && side.pointerId == null) {
        event.preventDefault(); event.stopPropagation();
        const rect = side.element.getBoundingClientRect();
        side.pointerId = event.pointerId;
        side.dragDX = event.clientX - rect.left;
        side.dragDY = event.clientY - rect.top;
        side.element.setPointerCapture(event.pointerId);
        side.element.classList.add('active', 'layoutDragging');
        return;
      }
      if (!enabled || blocked || event.button !== 0 || side.pointerId != null) return;
      event.preventDefault(); event.stopPropagation();
      side.pointerId = event.pointerId; side.angle = null;
      side.element.setPointerCapture(event.pointerId);
      side.element.classList.add('active'); position(side, event);
      if (side.name === 'move') onMoveStart();
    }, { passive: false });
    side.element.addEventListener('pointermove', event => {
      if (event.pointerId !== side.pointerId) return;
      if (layoutEditing) {
        event.preventDefault(); event.stopPropagation(); moveLayoutSide(side, event); return;
      }
      event.preventDefault(); event.stopPropagation(); position(side, event);
    }, { passive: false });
    side.element.addEventListener('pointerup', event => {
      if (event.pointerId !== side.pointerId) return;
      if (layoutEditing) {
        event.preventDefault(); event.stopPropagation(); moveLayoutSide(side, event); endLayoutDrag(side); return;
      }
      event.preventDefault(); event.stopPropagation(); position(side, event); end(side, true);
    }, { passive: false });
    for (const type of ['pointercancel', 'lostpointercapture']) {
      side.element.addEventListener(type, event => {
        if (event.pointerId !== side.pointerId) return;
        if (layoutEditing) endLayoutDrag(side); else end(side);
      });
    }
    side.element.addEventListener('contextmenu', event => event.preventDefault());
  }
  const cancel = () => { for (const side of sides) layoutEditing ? endLayoutDrag(side) : end(side); };
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
    // Resizing or dragging a stick mutates its inline style. The dock observers
    // can run in the same frame; while editing, never let the persisted layout
    // overwrite the live size (this was especially visible on the quick wheel).
    if (layoutEditing) {
      positionSizeControls();
      return;
    }
    if (customLayout) {
      for (const side of sides) {
        const saved = customLayout[side.name];
        if (!saved) continue;
        if (Number(saved.size) > 0) {
          side.element.style.width = `${saved.size}px`;
          side.element.style.height = `${saved.size}px`;
          sizeKnob(side, saved.size, Number(saved.scale) || 1);
        }
        const rect = side.element.getBoundingClientRect();
        const left = Math.max(0, Math.min(view.innerWidth - rect.width, saved.x * view.innerWidth));
        const top = Math.max(0, Math.min(view.innerHeight - rect.height, saved.y * view.innerHeight));
        Object.assign(side.element.style, { left: `${left}px`, right: 'auto', top: `${top}px`, bottom: 'auto', transform: 'none' });
      }
      positionSizeControls();
      return;
    }
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
    const layoutSides = sides.filter(side => side.name !== 'quick');
    const positions = layoutSides.map(side => placePhoneJoystick(side.element.getBoundingClientRect(), obstacles,
      { width: view.innerWidth, height: view.innerHeight }, side.name));
    layoutSides.forEach((side, index) => {
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
  try {
    customLayout = JSON.parse(view.localStorage.getItem('orbit_phone_joystick_layout_v1') || 'null');
    for (const side of sides) layoutScales[side.name] = Math.max(0.6, Math.min(1.6, Number(customLayout?.[side.name]?.scale) || 1));
  } catch {}

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
    movement: () => {
      if (!enabled || blocked || layoutEditing || sides[0].pointerId == null || !sides[0].vector) return null;
      return { ...sides[0].vector, strength: sides[0].vector.strength > 0 ? 1 : 0 };
    },
    aimAngle: () => enabled && !blocked && !layoutEditing && sides[1].pointerId != null ? sides[1].angle : null,
    aimRing: () => enabled && !blocked && !layoutEditing && sides[1].pointerId != null ? sides[1].ring : 0,
    setLayoutEditing(on) {
      cancel();
      layoutEditing = on === true;
      root.classList.toggle('layoutEditing', layoutEditing);
      if (layoutEditing) view.requestAnimationFrame(positionSizeControls);
      if (!layoutEditing) {
        customLayout = Object.fromEntries(sides.map(side => {
          const rect = side.element.getBoundingClientRect();
          return [side.name, { x: rect.left / Math.max(1, view.innerWidth), y: rect.top / Math.max(1, view.innerHeight),
            size: rect.width, scale: layoutScales[side.name] }];
        }));
        try { view.localStorage.setItem('orbit_phone_joystick_layout_v1', JSON.stringify(customLayout)); } catch {}
      }
    },
    setLayoutScale(name, percent) {
      const side = sides.find(candidate => candidate.name === name);
      if (!side) return;
      const next = Math.max(0.6, Math.min(1.6, (Number(percent) || 100) / 100));
      const ratio = next / Math.max(0.01, layoutScales[name]);
      layoutScales[name] = next;
      const rect = side.element.getBoundingClientRect();
      const size = Math.max(64, rect.width * ratio);
      const left = Math.max(0, Math.min(view.innerWidth - size, rect.left + (rect.width - size) / 2));
      const top = Math.max(0, Math.min(view.innerHeight - size, rect.top + (rect.height - size) / 2));
      Object.assign(side.element.style, { width: `${size}px`, height: `${size}px`, left: `${left}px`, right: 'auto',
        top: `${top}px`, bottom: 'auto', transform: 'none' });
      sizeKnob(side, size, next);
      if (customLayout?.[name]) {
        customLayout[name] = { x: left / Math.max(1, view.innerWidth), y: top / Math.max(1, view.innerHeight),
          size, scale: next };
      }
      positionSizeControls();
    },
    layoutScale: name => Math.round((layoutScales[name] || 1) * 100),
    resetLayout() {
      cancel();
      customLayout = null;
      for (const side of sides) {
        layoutScales[side.name] = 1;
        for (const property of ['left', 'right', 'top', 'bottom', 'width', 'height', 'transform']) side.element.style.removeProperty(property);
        const knob = side.element.querySelector('.phoneJoystickKnob');
        knob.style.width = '';
        knob.style.height = '';
      }
      try { view.localStorage.removeItem('orbit_phone_joystick_layout_v1'); } catch {}
      updateLayout();
      view.requestAnimationFrame(positionSizeControls);
    },
    cancel,
  };
}
