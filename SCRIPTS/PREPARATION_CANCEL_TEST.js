import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { damagePlayerLayers } from '../COMBAT/COMBAT_RULES.js';
import { advancePlayerToTarget, updatePlayerVelocity } from '../SRC/CORE/FRAME_SYSTEMS.js';

// Exerce les fonctions du moteur livre, avec des horloges et comptes isoles.
const source = readFileSync(new URL('../SRC/CORE/ORBIT_ENGINE.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
function engineFunction(name, asynchronous = false) {
  const start = source.indexOf(`function ${name}(`), end = source.indexOf('\n}', start);
  assert.ok(start >= 0 && end > start, name);
  return `${asynchronous ? 'async ' : ''}${source.slice(start, end + 2)}`;
}
const functions = ['onPlayerPreparationDamage', 'cancelHangarPreparation', 'cancelStarJump', 'isPlayerMovementLocked', 'requestHangarSwap', 'tickHangarSwap', 'hurtPlayer']
  .map(name => engineFunction(name)).concat(['activateHangarAtSavedLocation', 'completeHangarTravelMidpoint'].map(name => engineFunction(name, true))).join('\n');

function harness() {
  const messages = [], sounds = [], changes = [], timers = new Map();
  let timerId = 0;
  const user = { hangars: [{ id: 'current', active: true }, { id: 'target', active: false }] };
  const noop = () => {};
  const context = vm.createContext({
    StarJump: { channel: null }, hangarSwapFx: null, hangarActivationPreparation: null,
    player: { hp: 100, hpMax: 100, sh: 100, shMax: 100, shAbsorb: 1, dead: false, iFrames: 0, invincibleT: 0, x: 100, y: 100, r: 18 },
    started: true, account: { user }, window: { __CURRENT_MAP_ID__: '1-1' },
    structuredClone, netActive: () => false,
    HANGAR_SWAP_DURATION: 3, HANGAR_SWAP_HALF_DURATION: 1.5, HANGAR_SWAP_FX: { frames: 1 },
    WORLD: { w: 10000, h: 10000 }, camera: {}, moveTarget: {}, REPAIR: { cooldown: 5 },
    Math: Object.assign(Object.create(Math), { random: () => 0.99 }),
    setTimeout: fn => { timers.set(++timerId, fn); return timerId; }, clearTimeout: id => timers.delete(id),
    SFX: { play: name => sounds.push(name), stop: noop },
    showToast: text => messages.push(text), showNotification: noop, refreshStarMap: noop,
    getCurrentUserFull: () => user, getActiveHangarFromUser: () => user.hangars.find(h => h.active),
    getHangarAccess: () => ({ canSwap: true, canActivate: true }), getHangarStateById: () => ({ map: '1-1', pos: { x: 100, y: 100 } }),
    setActiveHangar: id => { changes.push(id); user.hangars.forEach(h => { h.active = h.id === id; }); return { ok: true }; },
    savedHpPct: () => 1, savedShPct: () => 1, saveHangarStateById: noop,
    getPortalFrameSrc: () => 'frame.png', loadImage: noop, ensureInstaShieldLoaded: noop, markHangarChanged: noop, drawUI: noop,
    clamp: (v, min, max) => Math.max(min, Math.min(max, v)),
    damagePlayerLayers, playerPilotMults: () => ({ evade: 0, tough: 0 }), resetRepairCooldown: noop,
    attackerPenetration: () => 0, absorbPetLinkDamage: amount => amount, addPlayerCombatFloat: noop,
    die: () => { context.player.dead = true; },
  });
  vm.runInContext(functions, context);
  return { context, messages, sounds, changes, timers };
}

for (const [name, hp, shield] of [['coque', 1, 0], ['bouclier', 0, 1]]) {
  test(`Jump : degats ${name} annulent une seule fois la preparation`, () => {
    const h = harness();
    h.context.StarJump.channel = { validating: false };
    h.context.onPlayerPreparationDamage(hp, shield);
    h.context.onPlayerPreparationDamage(hp, shield);
    assert.equal(h.context.StarJump.channel, null);
    assert.deepEqual(h.messages, ['Jump annulé.']);
  });
}

test('une esquive ou zero degat laisse la preparation en cours', () => {
  const h = harness();
  h.context.StarJump.channel = { validating: false };
  h.context.onPlayerPreparationDamage(0, 0);
  h.context.onPlayerPreparationDamage(-1, 0);
  h.context.playerPilotMults = () => ({ evade: 0.9 });
  h.context.Math.random = () => 0;
  h.context.hurtPlayer(10);
  assert.ok(h.context.StarJump.channel);
  assert.equal(h.messages.length, 0);
});

test('Swipe : reste vulnerable avant la bascule et un coup sur le bouclier empeche le changement', () => {
  const h = harness();
  assert.equal(h.context.requestHangarSwap('target'), true);
  assert.equal(h.context.player.invincibleT, 0);
  assert.equal(h.context.player.iFrames, 0);
  h.context.hurtPlayer(10);
  assert.equal(h.context.player.sh, 90);
  assert.equal(h.context.hangarSwapFx, null);
  h.context.tickHangarSwap(5);
  assert.deepEqual(h.changes, []);
  assert.deepEqual(h.messages, ['Swipe annulé.']);
  assert.equal(h.timers.size, 0, 'le son differe est annule aussi');
});

test('une immunite provenant d une aptitude ne devient pas un faux degat', () => {
  const h = harness();
  h.context.player.invincibleT = 2;
  h.context.requestHangarSwap('target');
  h.context.hurtPlayer(10);
  assert.equal(h.context.player.sh, 100);
  assert.ok(h.context.hangarSwapFx);
  assert.equal(h.messages.length, 0);
});

test('Swipe : la bascule ne donne aucune invincibilite et les degats restent appliques sur la nouvelle coque', () => {
  const h = harness();
  h.context.requestHangarSwap('target');
  h.context.tickHangarSwap(1.5);
  assert.deepEqual(h.changes, ['target']);
  assert.equal(h.context.player.invincibleT, 0);
  assert.equal(h.context.player.iFrames, 0);
  h.context.hurtPlayer(10);
  assert.equal(h.context.player.sh, 90);
  assert.ok(h.context.hangarSwapFx, 'une bascule deja effectuee ne doit pas etre annulee retroactivement');
  h.context.tickHangarSwap(1.5);
  assert.equal(h.context.hangarSwapFx, null);
});

test('Activation : un coup pendant le preload resout immediatement l action et ne reprend pas apres chargement', async () => {
  const h = harness();
  let finishPreload;
  h.context.getHangarStateById = () => ({ map: '1-2', pos: { x: 100, y: 100 } });
  h.context.window.__PRELOAD_MAP__ = () => new Promise(resolve => { finishPreload = resolve; });
  const activation = h.context.activateHangarAtSavedLocation('target');
  assert.ok(h.context.hangarActivationPreparation);
  h.context.onPlayerPreparationDamage(0, 1);
  const result = await activation;
  assert.equal(result.ok, false);
  assert.equal(result.error, 'Activation annulée.');
  finishPreload();
  await Promise.resolve();
  assert.equal(h.context.hangarSwapFx, null);
  assert.equal(h.context.hangarActivationPreparation, null);
  assert.deepEqual(h.changes, []);
  assert.deepEqual(h.messages, ['Activation annulée.']);
});

test('Activation : degats pendant l animation avant bascule liberent la promesse et conservent le hangar', async () => {
  const h = harness();
  const activation = h.context.activateHangarAtSavedLocation('target');
  assert.ok(h.context.hangarSwapFx);
  assert.equal(h.context.player.invincibleT, 0);
  h.context.hurtPlayer(10);
  const result = await activation;
  assert.equal(result.error, 'Activation annulée.');
  assert.deepEqual(h.changes, []);
  assert.deepEqual(h.messages, ['Activation annulée.']);
  assert.equal(h.timers.size, 0);
});

test('un preload echoue libere l activation pour une nouvelle tentative', async () => {
  const h = harness();
  h.context.getHangarStateById = () => ({ map: '1-2', pos: { x: 100, y: 100 } });
  h.context.window.__PRELOAD_MAP__ = () => Promise.reject(new Error('offline'));
  assert.equal((await h.context.activateHangarAtSavedLocation('target')).ok, false);
  assert.equal(h.context.hangarActivationPreparation, null);
  assert.equal(h.context.requestHangarSwap('target'), true);
});

test('Activation sans degats : le hangar change et la promesse se termine normalement', async () => {
  const h = harness();
  const activation = h.context.activateHangarAtSavedLocation('target');
  h.context.tickHangarSwap(1.5);
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(h.context.player.invincibleT, 0);
  assert.equal(h.context.player.iFrames, 0);
  h.context.hurtPlayer(10);
  assert.equal(h.context.player.sh, 90, 'la nouvelle coque reste vulnerable pendant la fin de l animation');
  h.context.tickHangarSwap(1.5);
  const result = await activation;
  assert.equal(result.ok, true);
  assert.deepEqual(h.changes, ['target']);
  assert.equal(h.context.hangarSwapFx, null);
  assert.deepEqual(h.messages, []);
});

test('Activation : la position du hangar reste figee pendant les resynchronisations et la bascule de carte', async () => {
  const h = harness(), c = h.context;
  const parked = { map: '1-2', pos: { x: 4200, y: 3500 }, hpPct: 0.5, shPct: 0.6 };
  c.getHangarStateById = () => parked;
  c.window.__PRELOAD_MAP__ = () => Promise.resolve();
  c.setActiveHangar = () => { parked.pos.x = 100; parked.pos.y = 100; return { ok: true }; };
  c.window.__SWITCH_MAP__ = async map => { c.window.__CURRENT_MAP_ID__ = map; c.player.x = 1500; c.player.y = 1500; };
  const activation = c.activateHangarAtSavedLocation('target');
  await new Promise(resolve => setImmediate(resolve));
  c.tickHangarSwap(1.5);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(c.player.x, 4200); assert.equal(c.player.y, 3500);
  c.tickHangarSwap(1.5);
  assert.equal((await activation).ok, true);
});

test('Activation multi : attend la preuve serveur avant de changer de coque et adopte l arrivee validee', async () => {
  const h = harness(), c = h.context;
  c.netActive = () => true;
  let saves = 0;
  c.flushNetUser = async () => ++saves === 1 ? { ok: false, stale: true } : { ok: true };
  let approveArrival, released = false;
  c.requestHangarArrival = () => new Promise(resolve => { approveArrival = resolve; });
  c.finishHangarArrival = () => { released = true; };
  c.window.__SWITCH_MAP__ = async map => { c.window.__CURRENT_MAP_ID__ = map; };
  const activation = c.activateHangarAtSavedLocation('target');
  c.tickHangarSwap(1.5);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(h.changes, [], 'aucun swipe provisoire avant la reponse serveur');
  assert.equal(c.player.x, 100);
  approveArrival({ ok: true, map: '1-2', x: 4200, y: 3500 });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(h.changes, ['target']);
  assert.equal(c.player.x, 4200); assert.equal(c.player.y, 3500);
  assert.equal(released, true);
  assert.equal(saves, 3, 'un conflit de revision est resolu avant le transfert puis l arrivee est sauvegardee');
  c.tickHangarSwap(1.5);
  assert.equal((await activation).map, '1-2');
});

test('Activation multi : un refus serveur conserve le vaisseau et la position de depart', async () => {
  const h = harness(), c = h.context;
  c.netActive = () => true;
  c.flushNetUser = async () => ({ ok: true });
  c.requestHangarArrival = async () => ({ ok: false, reason: 'offline' });
  c.finishHangarArrival = () => {};
  const activation = c.activateHangarAtSavedLocation('target');
  c.tickHangarSwap(1.5);
  const result = await activation;
  assert.equal(result.ok, false);
  assert.deepEqual(h.changes, []);
  assert.equal(c.player.x, 100); assert.equal(c.player.y, 100);
  assert.equal(c.hangarSwapFx, null);
});

test('les preparations Jump et hangar ne peuvent pas se superposer', async () => {
  const h = harness();
  h.context.StarJump.channel = { validating: false };
  assert.equal(h.context.requestHangarSwap('target'), false);
  assert.equal((await h.context.activateHangarAtSavedLocation('target')).ok, false);
  assert.equal(h.context.hangarSwapFx, null);
});

test('Swipe hors ZNA : le bouton et le moteur autorisent le swipe mais gardent les conditions de l activation', async () => {
  const h = harness(), c = h.context;
  Object.assign(c, {
    safeZoneActive: false, playerIsInSafeZone: () => false, playerIsInBaseZone: () => false,
    getFaction: () => ({ sector: 1 }), rules: {},
    sessionStorage: { getItem: () => null }, HANGAR_SWITCH_TIME_KEY: 'last-switch', HANGAR_ACTION_DELAY_MS: 5000,
  });
  vm.runInContext(engineFunction('getHangarAccess'), c);
  const profile = readFileSync(new URL('../PUBLIC/PROFILE.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const from = profile.indexOf('function getHangarActionAccess('), to = profile.indexOf('\n}', from);
  assert.ok(from >= 0 && to > from);
  c.hasIntegratedHangarWindow = () => true;
  c.window.__ORBIT_ENGINE__ = { getHangarAccess: () => c.getHangarAccess() };
  vm.runInContext(profile.slice(from, to + 2), c);
  assert.equal(c.getHangarActionAccess('swipe').ok, true);
  assert.equal(c.getHangarActionAccess('activate').ok, false);
  assert.equal((await c.activateHangarAtSavedLocation('target')).ok, false);
  assert.equal(c.requestHangarSwap('target'), true);
  c.hurtPlayer(10);
  assert.equal(c.hangarSwapFx, null);
  assert.deepEqual(h.messages, ['Swipe annulé.']);
  c.player.attackedT = 5;
  assert.equal(c.getHangarActionAccess('swipe').ok, false, 'le delai apres attaque reste applique');
  c.player.attackedT = 0;
  c.sessionStorage.getItem = () => String(Date.now());
  assert.equal(c.requestHangarSwap('target'), false, 'le delai entre changements reste applique');
});

test('Jump : les ordres map, minimap et collecte sont ignores pendant la preparation et la validation', () => {
  const h = harness(), c = h.context;
  vm.runInContext(['setMoveTargetFromScreen', 'setMoveTargetFromMiniEvent', 'selectCollectable', 'activatePhaseOut']
    .map(name => engineFunction(name)).join('\n'), c);
  for (const validating of [false, true]) {
    c.StarJump.channel = { validating };
    c.moveTarget.active = false;
    c.setMoveTargetFromScreen(500, 500);
    c.setMoveTargetFromMiniEvent(500, 500);
    c.selectCollectable({ id: 'box', x: 500, y: 500 });
    c.activatePhaseOut();
    assert.equal(c.moveTarget.active, false);
    assert.equal(c.player.x, 100);
    assert.equal(c.player.y, 100);
  }
  c.cancelStarJump('Jump annulé.');
  assert.equal(c.isPlayerMovementLocked(), false, 'annuler libere immediatement le deplacement');
});

test('Jump : le vrai pas de mouvement arrete l inertie et les destinations du bot puis reprend apres annulation', () => {
  const h = harness(), c = h.context;
  const from = source.indexOf('  refreshHoldMoveTarget();\n  const movementStepTarget = botMovementStep(dt);');
  const to = source.indexOf('\n  updateShipMoveSound();', from);
  assert.ok(from >= 0 && to > from);
  Object.assign(c, {
    dt: 0.1, refreshHoldMoveTarget: () => {}, botMovementStep: () => c.moveTarget,
    updatePlayerVelocity, advancePlayerToTarget, isZoneMap: false,
  });
  vm.runInContext(`function movementFrame() {${source.slice(from, to)}\n}`, c);
  c.player.baseSpeed = 400;
  c.StarJump.channel = { validating: false };
  for (let frame = 0; frame < 100; frame++) {
    Object.assign(c.moveTarget, { active: true, x: 500, y: 500 });
    c.player.vx = 400; c.player.vy = 400;
    c.movementFrame();
    assert.equal(c.player.x, 100); assert.equal(c.player.y, 100);
    assert.equal(c.player.vx, 0); assert.equal(c.player.vy, 0);
    assert.equal(c.moveTarget.active, false);
    if (frame === 50) c.StarJump.channel.validating = true;
  }
  c.onPlayerPreparationDamage(0, 1);
  // La validation est deja engagee : le verrou reste jusqu'a la fin du saut.
  assert.ok(c.isPlayerMovementLocked());
  c.cancelStarJump('Jump annulé.');
  Object.assign(c.moveTarget, { active: true, x: 500, y: 500 });
  c.movementFrame();
  assert.ok(c.player.x > 100 && c.player.y > 100);
});

test('Jump : decompte de 10 a 1 dans l affichage rapide, sans doublon et sans faux zero', () => {
  const notices = [], logs = [];
  const c = vm.createContext({
    showNotification: (...args) => notices.push(args), addGameLog: (...args) => logs.push(args),
  });
  vm.runInContext(engineFunction('updateStarJumpCountdown'), c);
  const channel = { target: '1-2', dur: 10, t: 0 };
  for (let frame = 0; frame <= 100; frame++) {
    channel.t = frame / 10;
    c.updateStarJumpCountdown(channel);
  }
  assert.deepEqual(notices.map(args => args[0]), ['10', '9', '8', '7', '6', '5', '4', '3', '2', '1']);
  assert.ok(notices.every(args => args[3].log === false && args[3].stagger === false));
  assert.equal(logs.length, 11, 'une ligne par seconde, puis depart');
});
