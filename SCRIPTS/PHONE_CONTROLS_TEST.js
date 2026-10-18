import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createPhoneControls, joystickVector, phoneAimRing, phoneQuickRing, phoneQuickSlot, pickPhoneAimTarget, placePhoneJoystick, PHONE_AIM_HALF_ANGLE } from '../SRC/CORE/PHONE_CONTROLS.js';
import { advancePlayerToTarget, updatePlayerVelocity } from '../SRC/CORE/FRAME_SYSTEMS.js';

function eventTarget() {
  const listeners = new Map(), classes = new Set();
  return {
    addEventListener(type, fn) { (listeners.get(type) || listeners.set(type, []).get(type)).push(fn); },
    emit(type, extra = {}) {
      const event = { button: 0, pointerId: 1, clientX: 60, clientY: 60, preventDefault() {}, stopPropagation() {}, ...extra };
      for (const listener of listeners.get(type) || []) listener(event);
    },
    classList: { add: c => classes.add(c), remove: c => classes.delete(c),
      toggle(c, on) { if (on) classes.add(c); else classes.delete(c); }, contains: c => classes.has(c) },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 120, height: 120 }),
    querySelectorAll: () => [],
    dataset: {},
    style: { removeProperty(name) { delete this[name]; } },
    setPointerCapture() {}, releasePointerCapture() {},
  };
}
function controlsHarness() {
  const document = eventTarget(); document.defaultView = eventTarget(); document.hidden = false;
  const saved = new Map();
  Object.assign(document.defaultView, { innerWidth: 400, innerHeight: 300,
    requestAnimationFrame: callback => { callback(); return 1; },
    localStorage: { getItem: key => saved.get(key) || null, setItem: (key, value) => saved.set(key, value), removeItem: key => saved.delete(key) } });
  const move = eventTarget(), aim = eventTarget(), quick = eventTarget(), root = eventTarget();
  for (const side of [move, aim, quick]) {
    const knob = { style: {} };
    const quickItem = { dataset: { quickLabel: 'Munition UCB-100', quickQuantity: '200', quickLaser: '1' } };
    side.querySelector = selector => selector.includes('.phoneQuickItem') ? quickItem : knob;
  }
  root.ownerDocument = document;
  root.querySelector = selector => selector.includes('data-phone-size') ? null
    : selector.includes('"move"') ? move : selector.includes('"aim"') ? aim : quick;
  const shots = [], moves = [], quickSlots = [];
  const controls = createPhoneControls(root, { onMoveStart: () => moves.push('start'), onMoveStop: () => moves.push('stop'), onAimRelease: (a, ring) => shots.push([a, ring]), onQuickRelease: slot => quickSlots.push(slot) });
  controls.configure(true);
  return { controls, move, aim, quick, root, document, shots, moves, quickSlots, saved };
}

test('joystick : zone morte, vitesse progressive et limite circulaire', () => {
  assert.equal(joystickVector(2, 2, 40).strength, 0);
  const half = joystickVector(20, 0, 40);
  assert.ok(half.strength > 0 && half.strength < 0.5);
  const full = joystickVector(90, 120, 40);
  assert.equal(full.strength, 1);
  assert.equal(Math.hypot(full.x, full.y), 1);
  assert.equal(Math.hypot(full.knobX, full.knobY), 40);
});

test('roue droite : centre, première couronne et seconde couronne', () => {
  assert.equal(phoneAimRing(0), 0);
  assert.equal(phoneAimRing(0.4), 1);
  assert.equal(phoneAimRing(0.89), 1);
  assert.equal(phoneAimRing(0.90), 2);
  assert.equal(phoneAimRing(1), 2);
});

test('roue centrale : dix directions par barre, barre 1 puis barre 2', () => {
  assert.equal(phoneQuickSlot(-Math.PI / 2, 1), 0);
  assert.equal(phoneQuickSlot(-Math.PI / 2, 2), 10);
  assert.equal(phoneQuickSlot(-Math.PI / 2 + Math.PI * 2 / 10, 1), 1);
  assert.equal(phoneQuickSlot(-Math.PI / 2 - Math.PI * 2 / 10, 2), 19);
  assert.equal(phoneQuickSlot(NaN, 1), -1);
  assert.equal(phoneQuickSlot(0, 0), -1);
});

test('roue centrale : passage stable entre les deux barres', () => {
  assert.equal(phoneQuickRing(0, 0), 1, 'la barre 1 apparaît dès la prise en main');
  assert.equal(phoneQuickRing(0.95, 1), 1, 'une poussée presque complète reste en barre 1');
  assert.equal(phoneQuickRing(0.96, 1), 2, 'la poussée franche atteint la barre 2');
  assert.equal(phoneQuickRing(0.90, 2), 2, 'un petit tremblement conserve la barre 2');
  assert.equal(phoneQuickRing(0.77, 2), 1, 'il faut revenir nettement pour retrouver la barre 1');
});

test('roue centrale : relacher confirme la case visible de la seconde barre', () => {
  const h = controlsHarness();
  h.quick.emit('pointerdown', { clientX: 60, clientY: 0 });
  h.quick.emit('pointerup', { clientX: 60, clientY: 0 });
  assert.deepEqual(h.quickSlots, [10]);
  assert.equal(h.quick.dataset.quickSlot, 'Barre 2 : Munition UCB-100 : quantité 200');
});

test('roue centrale : revenir sur Annuler ne déclenche aucun raccourci', () => {
  const h = controlsHarness();
  h.quick.emit('pointerdown', { clientX: 60, clientY: 0 });
  h.quick.emit('pointermove', { clientX: 60, clientY: 60 });
  h.quick.emit('pointerup', { clientX: 60, clientY: 60 });
  assert.deepEqual(h.quickSlots, []);
  assert.equal(h.quick.dataset.quickSlot, 'Sélection annulée');
});

test('placement téléphone : déplacer puis sauvegarder les trois joysticks sans action de jeu', () => {
  const h = controlsHarness();
  h.controls.setLayoutEditing(true);
  h.quick.emit('pointerdown', { clientX: 60, clientY: 60 });
  h.quick.emit('pointermove', { clientX: 200, clientY: 150 });
  h.quick.emit('pointerup', { clientX: 200, clientY: 150 });
  assert.equal(h.quick.style.left, '140px');
  assert.equal(h.quick.style.top, '90px');
  assert.deepEqual(h.quickSlots, []);
  h.controls.setLayoutScale('quick', 150);
  assert.equal(h.quick.style.width, '180px');
  assert.equal(h.controls.layoutScale('quick'), 150);
  h.controls.setLayoutEditing(false);
  assert.ok(h.saved.has('orbit_phone_joystick_layout_v1'));
  h.controls.resetLayout();
  assert.equal(h.saved.has('orbit_phone_joystick_layout_v1'), false);
});

test('deux doigts : viser et tirer ne coupe pas le joystick de deplacement', () => {
  const h = controlsHarness();
  h.move.emit('pointerdown', { pointerId: 10, clientX: 120 });
  h.aim.emit('pointerdown', { pointerId: 20, clientY: 0 });
  assert.equal(h.controls.movement().x, 1);
  assert.equal(h.controls.aimAngle(), -Math.PI / 2);
  assert.equal(h.shots.length, 0, 'le tir attend le relachement');
  h.aim.emit('pointerup', { pointerId: 20, clientY: 0 });
  assert.deepEqual(h.shots, [[-Math.PI / 2, 2]]);
  assert.equal(h.controls.movement().strength, 1);
  h.move.emit('pointerup', { pointerId: 10, clientX: 500 });
  assert.equal(h.controls.movement(), null);
  assert.deepEqual(h.moves, ['start', 'stop']);
});

test('un autre doigt ne remplace pas ou ne relache pas une poignee deja tenue', () => {
  const h = controlsHarness();
  h.move.emit('pointerdown', { pointerId: 10, clientX: 120 });
  h.move.emit('pointerdown', { pointerId: 11, clientX: 0 });
  h.move.emit('pointermove', { pointerId: 11, clientX: 0 });
  h.move.emit('pointerup', { pointerId: 11 });
  assert.equal(h.controls.movement().x, 1);
  assert.deepEqual(h.moves, ['start']);
});

for (const type of ['pointercancel', 'lostpointercapture', 'blur', 'resize', 'visibilitychange', 'disabled', 'portal']) {
  test(`${type} annule les gestes sans declencher le tir ni le reprendre`, () => {
    const h = controlsHarness();
    h.move.emit('pointerdown', { pointerId: 10, clientX: 120 });
    h.aim.emit('pointerdown', { pointerId: 20, clientX: 120 });
    if (type === 'disabled') h.controls.configure(false);
    else if (type === 'portal') h.controls.configure(true, true);
    else if (type === 'visibilitychange') { h.document.hidden = true; h.document.emit(type); }
    else if (type === 'blur' || type === 'resize') h.document.defaultView.emit(type);
    else { h.move.emit(type, { pointerId: 10 }); h.aim.emit(type, { pointerId: 20 }); }
    h.controls.configure(true);
    h.aim.emit('pointerup', { pointerId: 20, clientX: 120 });
    assert.equal(h.controls.movement(), null);
    assert.equal(h.controls.aimAngle(), null);
    assert.deepEqual(h.shots, []);
    assert.deepEqual(h.moves, ['start', 'stop']);
  });
}

test('poignee bloquee et mode desactive ignorent les nouvelles pressions', () => {
  const h = controlsHarness();
  for (const [enabled, blocked] of [[false, false], [true, true]]) {
    h.controls.configure(enabled, blocked);
    h.move.emit('pointerdown', { clientX: 120 }); h.aim.emit('pointerdown', { clientX: 120 });
    h.aim.emit('pointerup', { clientX: 120 });
    assert.equal(h.controls.movement(), null); assert.equal(h.shots.length, 0);
    assert.equal(h.move.disabled, true);
    assert.equal(h.root.hidden, !enabled);
  }
});

test('retour au centre annule la roue ; relâcher sur une couronne confirme', () => {
  const h = controlsHarness();
  h.aim.emit('pointerdown', { clientX: 120 }); h.aim.emit('pointerup');
  h.aim.emit('pointerdown'); h.aim.emit('pointerup');
  assert.deepEqual(h.shots, [[0, 0], [null, 0]]);
});

const rect = (left, top, width, height = width) => ({ left, top, width, height, right: left + width, bottom: top + height });
const clearOf = (position, obstacle) => position.left + position.size <= obstacle.left - 10 || position.left >= obstacle.right + 10
  || position.top + position.size + 24 <= obstacle.top - 10 || position.top >= obstacle.bottom + 10;
test('portrait : les deux poignees et leurs labels remontent au-dessus du dock', () => {
  const dock = rect(16, 686, 358, 140), viewport = { width: 390, height: 844 };
  for (const [side, left] of [['move', 18], ['aim', 268]]) {
    const preferred = rect(left, 664, 104), placed = placePhoneJoystick(preferred, [dock], viewport, side);
    assert.ok(placed.top < preferred.top);
    assert.ok(clearOf(placed, dock)); assert.equal(placed.size, 104);
  }
});
test('portrait : ouverture du menu, changement de hauteur puis fermeture recalculent l espace', () => {
  const dock = rect(16, 686, 358, 140), menu = rect(8, 380, 374, 300);
  const preferred = rect(268, 664, 104), viewport = { width: 390, height: 844 };
  const opened = placePhoneJoystick(preferred, [dock, menu], viewport, 'aim');
  const taller = placePhoneJoystick(preferred, [dock, rect(8, 300, 374, 380)], viewport, 'aim');
  const closed = placePhoneJoystick(preferred, [dock], viewport, 'aim');
  assert.ok(clearOf(opened, dock) && clearOf(opened, menu));
  assert.ok(taller.top < opened.top && opened.top < closed.top);
});
test('paysage : ecarte et compacte une poignee si le menu laisse de la place sur le cote', () => {
  const menu = rect(342, 76, 390, 244), dock = rect(174, 274, 536, 98), viewport = { width: 844, height: 390 };
  const preferred = rect(714, 244, 112), placed = placePhoneJoystick(preferred, [dock, menu], viewport, 'aim');
  assert.ok(placed.left > preferred.left && placed.size < preferred.width);
  assert.ok(clearOf(placed, dock) && clearOf(placed, menu));
  assert.ok(placed.left + placed.size <= viewport.width - 8 && placed.top >= 8);
  const left = placePhoneJoystick(rect(18, 244, 112), [dock, menu], viewport, 'move');
  assert.deepEqual(left, { left: 18, top: 244, size: 112 });
});
test('aucun obstacle : conserve les ancres ; ecran plein : ne pousse pas les poignees hors ecran', () => {
  const preferred = rect(18, 244, 112), viewport = { width: 844, height: 390 };
  for (const obstacles of [[], [rect(0, 0, 844, 390)]]) {
    assert.deepEqual(placePhoneJoystick(preferred, obstacles, viewport, 'move'), { left: 18, top: 244, size: 112 });
  }
});

const player = { x: 0, y: 0 };
const npc = (id, x, y, extra = {}) => ({ id, x, y, hp: 100, ...extra });
test('cone : NPC le plus aligne puis le plus proche, independamment de l ordre', () => {
  const aligned = npc('aligned', 500, 0), near = npc('near', 200, 0), off = npc('off', 100, 15);
  for (const list of [[off, aligned, near], [near, off, aligned]]) assert.equal(pickPhoneAimTarget(player, list, 0, 700), near);
});
test('cone : aucune selection hors angle/portee, invisible, mort, joueur ou PET', () => {
  const invalid = [npc('angle', 50, 50), npc('far', 701, 0), npc('dead', 100, 0, { hp: 0 }),
    npc('player', 100, 0, { _netPlayer: true }), npc('pet', 100, 0, { _netPet: true }),
    npc('local-pet', 100, 0, { isPetTarget: true }), npc('hidden', 100, 0)];
  assert.equal(pickPhoneAimTarget(player, invalid, 0, 700, e => e.id !== 'hidden'), null);
  const edge = npc('edge', 700 * Math.cos(PHONE_AIM_HALF_ANGLE - 1e-8), 700 * Math.sin(PHONE_AIM_HALF_ANGLE - 1e-8));
  assert.equal(pickPhoneAimTarget(player, [edge], 0, 701), edge);
  assert.equal(pickPhoneAimTarget(player, [edge], NaN, 700), null);
});

// Execute les points de branchement reels du moteur, et son deplacement normal.
const source = readFileSync(new URL('../SRC/CORE/ORBIT_ENGINE.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
function engineFunction(name) {
  const start = source.indexOf(`function ${name}(`), end = source.indexOf('\n}', start);
  assert.ok(start >= 0 && end > start, name);
  return source.slice(start, end + 2);
}
test('relachement moteur : couronne 1 sélectionne, couronne 2 attaque', () => {
  const commands = [], candidate = npc('npc', 100, 0);
  const context = vm.createContext({ GAME_SETTINGS: { phoneMode: true }, started: true, player: { dead: false },
    isPlayerMovementLocked: () => false, phoneAimTarget: () => candidate,
    Target: { get: () => candidate, set: value => commands.push(value.id) },
    botNotifyManual() {}, toggleAttack: () => commands.push('toggle') });
  vm.runInContext(engineFunction('releasePhoneAim'), context);
  context.releasePhoneAim(0, 1); context.releasePhoneAim(0, 2); context.releasePhoneAim(null, 2);
  assert.deepEqual(commands, ['npc', 'npc', 'toggle']);
  for (const value of [null, npc('dead', 0, 0, { hp: 0 }), npc('player', 0, 0, { _netPlayer: true }), npc('pet', 0, 0, { _netPet: true })]) {
    context.phoneAimTarget = () => value; context.releasePhoneAim(0, 2);
  }
  context.phoneAimTarget = () => candidate;
  context.isPlayerMovementLocked = () => true; context.releasePhoneAim(0, 2);
  context.isPlayerMovementLocked = () => false; context.player.dead = true; context.releasePhoneAim(0, 2);
  context.player.dead = false; context.GAME_SETTINGS.phoneMode = false; context.releasePhoneAim(0, 2);
  assert.equal(commands.length, 3);
});

const moveStart = source.indexOf('  refreshHoldMoveTarget();\n');
const moveEnd = source.indexOf('  updateShipMoveSound();', moveStart);
assert.ok(moveStart >= 0 && moveEnd > moveStart);
function movementHarness(vector, extra = {}) {
  let walls = 0;
  const context = vm.createContext({ player: { x: 100, y: 100, baseSpeed: 400, vx: 0, vy: 0, ...extra },
    moveTarget: { active: true, x: 100, y: 100 }, phoneControls: { movement: () => vector }, dt: 1,
    refreshHoldMoveTarget() {}, syncPhoneControls() {}, botNotifyManual() {}, isPlayerMovementLocked: () => false,
    botMovementStep: () => context.moveTarget, updatePlayerVelocity, advancePlayerToTarget,
    FORTIFY_MAX_SPEED: 200, isZoneMap: true, resolvePlayerWalls: () => { walls++; } });
  return { context, step: () => vm.runInContext(`{${source.slice(moveStart, moveEnd)}}`, context), walls: () => walls };
}
for (const [name, extra, speed] of [['normal', {}, 400], ['ralenti', { rocketSlowT: 5, rocketSlowPct: 50 }, 200],
  ['gele', { freezeT: 5 }, 0], ['fortification', { fortifyT: 5, baseSpeed: 1000 }, 200]]) {
  test(`deplacement ${name} : vitesse maximale et collisions du moteur`, () => {
    const h = movementHarness({ x: 1, y: 0, strength: 0.5 }, extra); h.step();
    assert.equal(h.context.player.vx, speed); assert.equal(h.context.player.x, 100 + speed);
    assert.equal(h.context.moveTarget.active, false, 'aucune ancienne destination ne reprend la main');
    assert.equal(h.walls(), 1);
  });
}
test('un portail bloque le deplacement du joystick sans collision ni reprise', () => {
  const h = movementHarness({ x: 1, y: 0, strength: 1 }); h.context.isPlayerMovementLocked = () => true; h.step();
  assert.equal(h.context.player.x, 100); assert.equal(h.context.player.vx, 0); assert.equal(h.walls(), 0);
});
