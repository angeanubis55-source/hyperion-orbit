import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { NETWORK_TIMING_GRACE_SEC } from "../SRC/CORE/NETWORK_TIMING.js";
import { sanitizeAbilityFxList } from "../SRC/CORE/ABILITY_FX.js";
import { NPC_TYPES } from "../NPC/NPC_TYPES.js";
import { isJpcBotSheltered } from "../NPC/JPC_BOTS.js";

// Execute les vrais handlers du client avec sockets et horloge controles.
const source = readFileSync(new URL("../SRC/CORE/NETPLAY.js", import.meta.url), "utf8").replace(/^export /gm, "").replace(/^import .*NETWORK_TIMING.*\r?\n/gm, "").replace(/^import .*ABILITY_FX.*\r?\n/gm, "");
const engine = readFileSync(new URL("../SRC/CORE/ORBIT_ENGINE.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const linkCheck = engine.slice(engine.indexOf("function netLinkAliveInGame()"), engine.indexOf("function setLinkOverlay("));

function client() {
  let now = 1000, nextTimer = 0;
  const intervals = new Map(), timeouts = new Map(), sockets = [];
  class Socket {
    constructor() { this.readyState = 0; this.sent = []; sockets.push(this); }
    open() { this.readyState = 1; this.onopen(); }
    send(raw) { assert.equal(this.readyState, 1); this.sent.push(JSON.parse(raw)); }
    receive(message) { this.onmessage({ data: JSON.stringify(message) }); }
    close(code = 1000, reason = "") { this.readyState = 3; this.onclose({ code, reason }); }
  }
  const context = vm.createContext({
    NETWORK_TIMING_GRACE_SEC, sanitizeAbilityFxList, window: {}, location: { protocol: "http:", host: "localhost" },
    localStorage: { getItem: () => "test-token" },
    performance: { now: () => now }, Date: { now: () => now }, WebSocket: Socket,
    setInterval: (fn, ms) => { const id = ++nextTimer; intervals.set(id, { fn, ms }); return id; },
    clearInterval: id => intervals.delete(id),
    setTimeout: (fn, ms) => { const id = ++nextTimer; timeouts.set(id, { fn, ms }); return id; },
    clearTimeout: id => timeouts.delete(id),
  });
  vm.runInContext(source + "\n" + linkCheck, context);
  context.ensureNetplayConnection();
  sockets[0].open();
  return { api: context, sockets, intervals, timeouts, advance: ms => { now += ms; } };
}

test("1000 récompenses : appliquées dans chaque réception, sans attendre de frame", () => {
  const c = client(), socket = c.sockets[0];
  const received = [];
  c.api.setNetNpcRewardHandler(reward => { received.push(reward); reward._progressApplied = true; });
  for (let i = 0; i < 1000; i++) {
    socket.receive({ t: "npcReward", map: "1-3", uid: `npc#${i}`,
    seq: 1, type: "npc_Streuner", txKey: `run:${i}`, credits: 10, ownsKill: true });
    assert.equal(received.length, i + 1);
  }
  socket.receive({ t: "npcReward", map: "low", uid: "low-raid-cache", seq: 1, credits: 100 });
  assert.equal(received.length, 1000);
  assert.equal(c.api.takeNetLowRaidReward().credits, 100);
  socket.receive({ t: "npcReward", map: "1-3", uid: "npc#0", seq: 1,
    type: "npc_Streuner", txKey: "run:0", credits: 10 });
  assert.equal(received.length, 1000);
  socket.receive({ t: "npcReward", map: "1-3", uid: "npc#0", seq: 2,
    type: "npc_Streuner", txKey: "run:new", credits: 10 });
  assert.equal(c.api.takeNetNpcReward("1-3", "npc#0", 2).credits, 10);
  assert.equal(received.length, 1001);
});

test("Boss Cucurbitor : la part de 0.5 % d'un second attaquant est transmise sans arrondi", () => {
  const c = client();
  let received = null;
  c.api.setNetNpcRewardHandler(reward => { received = reward; });
  c.sockets[0].receive({ t: "npcReward", map: "1-3", uid: "boss", seq: 1,
    type: "npc_Boss_Curcubitor_1_3", killer: "first", killerPseudo: "Mira", ownsKill: false,
    percent: .5, credits: 16384, exp: 2048, honor: 6 });
  assert.equal(received.percent, .5);
  assert.equal(received.ownsKill, false);
  assert.equal(received.credits, 16384);
  assert.equal(received.killerPseudo, "Mira");
});

test("JPC : protection portail/base transmise, attaque refusee puis autorisee a la sortie", () => {
  const c = client(), socket = c.sockets[0];
  const target = { id: "bot", isJpcBot: true, x: 100, y: 100 };
  const context = vm.createContext({ e: target, isJpcBotSheltered,
    npcIsInSafeZone: () => false, // Joueur d'une autre firme.
    performance: { now: () => 10000 }, lastPvpSafeToastAt: 0, showToast: () => {},
    isOwnPetTarget: () => false, isSharedZone: () => true });
  const start = engine.indexOf("function netPvpBlocked(");
  const end = engine.indexOf("// Propre REX (", start);
  vm.runInContext(engine.slice(start, end), context);
  const adoptFrom = engine.indexOf("      e._netSafe = typeof s.jpSafe");
  const adoptTo = engine.indexOf("\n", adoptFrom);
  for (const safe of [true, false, true]) {
    socket.receive({ t: "snapshot", at: 10000, players: [], npc: { list: [{
      uid: "bot", type: "npc_Jpc_goliath", jpc: 1, jpSafe: safe, x: 100, y: 100, hp: 100,
    }] } });
    context.s = c.api.getNetNpcs().get("bot");
    assert.equal(context.s.jpSafe, safe);
    vm.runInContext(engine.slice(adoptFrom, adoptTo), context);
    assert.equal(context.netPvpBlocked(target), safe);
    assert.equal(context.netPvpBlocked({ _netPlayer: "other", _netSafe: safe }), safe, "meme regle joueur/JPC");
  }
  socket.receive({ t: "snapshot", at: 10050, players: [], npc: { list: [{ uid: "bot", jpc: 1 }] } });
  assert.equal(c.api.getNetNpcs().get("bot").jpSafe, null, "ancien serveur : repli geometrique");
});

test("JPC : ZNA locale de leur portail/base independante de la firme de l'observateur", () => {
  const context = vm.createContext({ isZoneMap: true, window: { __CURRENT_MAP_ID__: "1-1" },
    rules: {}, account: { user: { faction: "eic" } }, getFaction: () => ({ sector: "2", id: "eic" }),
    zonePortals: [{ x: 1000, y: 1000, toMap: "1-2" }],
    zoneSafe: { modules: [{ id: "CENTRE_mmo" }], zone: { kind: "circle", x: 3000, y: 3000, r: 600 } },
    DEFAULT_PORTAL_RADIUS: 450, SAFE_ZONE_MARGIN: 50,
    canUseStation: () => false,
    dist2: (x, y, tx, ty) => (x - tx) ** 2 + (y - ty) ** 2 });
  context.getInteractivePortals = () => context.zonePortals;
  vm.runInContext(engine.slice(engine.indexOf("function getCurrentZoneMapId("), engine.indexOf("// Wave system")), context);
  for (const [x, y] of [[1000, 1000], [3000, 3000]]) {
    assert.equal(context.npcIsInSafeZone({ isJpcBot: true, x, y }), true);
    assert.equal(context.npcIsInSafeZone({ x, y }), false, "regle de firme des autres entites conservee");
  }
  assert.equal(context.npcIsInSafeZone({ isJpcBot: true, x: 6000, y: 6000 }), false);
  context.zonePortals[0].toMap = "alpha";
  assert.equal(context.npcIsInSafeZone({ isJpcBot: true, x: 1000, y: 1000 }), false, "Galaxy Gate sans ZNA");
  context.zoneSafe = { modules: [{ id: "CONTROLEUR_mmo", x: 5000, y: 5000, safeRadius: 200 }] };
  assert.equal(context.npcIsInSafeZone({ isJpcBot: true, x: 5000, y: 5000 }), true);
  assert.equal(context.npcIsInSafeZone({ isJpcBot: true, _netSafe: true, x: 6000, y: 6000 }), true);
  assert.equal(context.npcIsInSafeZone({ isJpcBot: true, _netSafe: false, x: 5000, y: 5000 }), false);
});

test("lock multi : gris JPC transmis puis rouge apres liberation sans changer de selection", () => {
  const c = client(), socket = c.sockets[0];
  const botUid = "1-1#jpc0";
  const render = vm.createContext({ LOCK_SPR: { src: "red" }, LOCK_GREY_SPR: { src: "grey" },
    netMyId: () => "me", getNetGroup: () => null, rules: { mode: "zone" },
    window: { __CURRENT_MAP_ID__: "1-1" }, jpcPreyClaimedByLiveBot: () => false });
  const start = engine.indexOf("function targetLockSprite("), end = engine.indexOf("function drawLaserBeam(", start);
  vm.runInContext(engine.slice(start, end), render);
  const target = { _netUid: "prey" };
  let at = 10000;
  const adopt = (lock, jpcBy) => {
    socket.receive({ t: "snapshot", at: at += 50, players: [], npc: { list: [{
      uid: "prey", type: "npc_Streuner", x: 100, y: 100, hp: 100, hpMax: 100, lock, jpcBy,
    }] } });
    const npc = c.api.getNetNpcs().get("prey");
    // Exercer l'adoption des champs telle qu'elle est livree dans syncNetNpcs.
    const from = engine.indexOf("    e._netLockBy = s.lock");
    const to = engine.indexOf("    // Bots JPC natifs", from);
    render.e = target; render.s = npc;
    vm.runInContext(engine.slice(from, to), render);
    return render.targetLockSprite(target).src;
  };
  assert.equal(adopt(botUid, botUid), "grey");
  assert.equal(target._netJpcBy, botUid);
  assert.equal(adopt(null, null), "red");
  assert.equal(target._netJpcBy, null);
  assert.equal(adopt("me", null), "red");
  assert.equal(adopt("other-player", null), "grey");
});

test("JPC : pseudo, drones et arret survivent au protocole, reprise sans dash", () => {
  const c = client(), socket = c.sockets[0];
  let serverAt = 10000;
  const snap = (x, vx) => {
    serverAt += 50;
    socket.receive({ t: "snapshot", at: serverAt, players: [], npc: { list: [{
      uid: "1-1#jpc0", type: "npc_Jpc_goliath", jpc: 1, seq: 1,
      x, y: 100, hp: 800, sh: 400, hpMax: 1000, shMax: 500,
      jpPseudo: "Orion_FR", jpDrones: 8, jpForm: "heart", jpLvl: 6,
      jpDes: ["havoc", "hercules"], jpIsh: 1,
      jpVx: vx, jpVy: 0, jpSpeed: 300, jpMode: vx ? "farm" : "repair",
    }] } });
  };
  snap(100, 300);
  const bot = c.api.getNetNpcs().get("1-1#jpc0");
  assert.equal(bot.jpPseudo, "Orion_FR");
  assert.equal(bot.jpDrones, 8);
  assert.equal(bot.jpForm, "heart");
  assert.equal(bot.jpLvl, 6);
  assert.equal(bot.jpDes.join(","), "havoc,hercules");
  assert.equal(bot.jpIsh, 1);
  c.advance(50); snap(115, 300);
  c.advance(50); snap(115, 0);
  assert.equal(bot.vx, 0);
  for (let i = 0; i < 600; i++) {
    c.advance(16);
    if (i % 3 === 0) snap(115, 0);
    c.api.tickNetplayRemotes(0.016);
  }
  assert.equal(bot.rx, 115);
  c.advance(50); snap(130, 300);
  const previous = bot.rx;
  c.api.tickNetplayRemotes(0.016);
  assert.ok(bot.rx - previous <= 300 * 0.016 + 1e-8);
  assert.ok(bot.rx > previous);
});

test("JPC : les lasers suivent la coque rendue et la cible exacte en x1", () => {
  const start = engine.indexOf("function spawnNetShotVisual(ev)"), end = engine.indexOf("function netVisualSabHome(", start);
  const shots = [];
  const shooter = { id: 1, hp: 100, isJpcBot: true, _netUid: "1-1#jpc0", x: 100, y: 200, r: 20 };
  const target = { id: 2, hp: 100, _netUid: "prey", x: 500, y: 200 };
  const context = vm.createContext({ enemies: [shooter, target], player: { hp: 100 },
    netMyId: () => "me", SIDE_OFFSET: 30, enemyBullets: [], PLAYER_BULLET_SPRITES: { x1: { src: "X1.png" } },
    ENTITY_LIMITS: { enemyBullets: 900 }, addCappedProjectile: (_, bullet) => shots.push(bullet) });
  vm.runInContext(engine.slice(start, end), context);
  context.spawnNetShotVisual({ by: shooter._netUid, tuid: "prey", x: 2000, y: 2000, tx: 0, ty: 0, n: 2, key: "x6" });
  assert.equal(shots.length, 2);
  assert.deepEqual(shots.map(s => [s.x, s.y]), [[130, 170], [130, 230]]);
  assert.ok(shots.every(s => s.key === "x1" && s.dmg === 0 && s.targetId === 2 && s.sprite.src === "X1.png"));
  shooter.x = 120;
  context.spawnNetShotVisual({ by: shooter._netUid, tuid: "prey", n: 1, key: "x4" });
  assert.equal(shots[2].x, 150);
  assert.equal(shots[2].y, 200);
});

test("JPC : les paquets du serveur deja lance sans tuid affichent aussi les tirs", () => {
  const start = engine.indexOf("function spawnNetShotVisual(ev)"), end = engine.indexOf("function netVisualSabHome(", start);
  const shots = [];
  const shooter = { id: 1, hp: 100, isJpcBot: true, _netUid: "1-1#jpc0", x: 100, y: 200, r: 20 };
  const target = { id: 2, hp: 100, _netUid: "prey", x: 500, y: 200 };
  const player = { hp: 100, x: 1000, y: 200 };
  const context = vm.createContext({ enemies: [shooter, target], player,
    netMyId: () => "me", SIDE_OFFSET: 30, enemyBullets: [], PLAYER_BULLET_SPRITES: { x1: { src: "X1.png" } },
    ENTITY_LIMITS: { enemyBullets: 900 }, addCappedProjectile: (_, bullet) => shots.push(bullet) });
  context.getEnemyById = id => context.enemies.find(e => e.id === id && e.hp > 0);
  const queueStart = engine.indexOf("const pendingNpcFaux = [];");
  const queueEnd = engine.indexOf("const pendingEscortSalvo = [];");
  vm.runInContext(engine.slice(queueStart, queueEnd) + "\n" + engine.slice(start, end), context);
  context.spawnNetShotVisual({ t: "shot", by: shooter._netUid, tuid: null, x: 100, y: 200, tx: 500, ty: 200, key: "x1", n: 2, npcShot: false });
  assert.equal(shots.length, 1, "premier vrai tir central");
  const counts = [shots.length];
  for (let i = 1; i < 6; i++) {
    const before = shots.length;
    shooter.x += 10;
    context.tickPendingNpcFaux(.199);
    assert.equal(shots.length, before, "aucun faux tir avant son echeance");
    context.tickPendingNpcFaux(.001);
    const part = shots.slice(before);
    counts.push(part.length);
    assert.ok(part.every(s => s.x === shooter.x + 30), "depart depuis la coque actuelle");
  }
  assert.deepEqual(counts, [1, 2, 1, 2, 1, 2]);
  assert.ok(shots.every(s => s.targetId === target.id && s.dmg === 0 && s._jpcShot));
  shots.length = 0;
  context.spawnNetShotVisual({ t: "shot", by: shooter._netUid, x: 100, y: 200, tx: 1000, ty: 200, key: "x1", n: 1, npcShot: false });
  assert.equal(shots.length, 2, "le vrai tir suivant part des deux cotes");
  assert.equal(shots[0].target, "player");
  shots.length = 0;
  context.spawnNetShotVisual({ by: shooter._netUid, tuid: "absent", tx: 500, ty: 200, n: 2 });
  assert.equal(shots.length, 0, "un UID explicite ne doit jamais etre rattache a une autre cible");
  context.clearPendingNpcFaux();
  context.spawnNetShotVisual({ by: shooter._netUid, jpcPart: true, tx: 500, ty: 200, n: 2 });
  assert.equal(shots.length, 2);
  context.tickPendingNpcFaux(1);
  assert.equal(shots.length, 2, "les eclairs deja emis par le serveur ne sont pas doubles");
});

test("NPC vers JPC : sprite, vitesse et taille natifs, meme avant le snapshot du tireur", () => {
  const start = engine.indexOf("function spawnNetShotVisual(ev)"), end = engine.indexOf("function netVisualSabHome(", start);
  const target = { id: 2, hp: 100, _netUid: "jpc", x: 500, y: 200 };
  const shots = [], loaded = [];
  const enemies = [target];
  const context = vm.createContext({ enemies, NPC_TYPES, enemyBullets: [],
    ENTITY_LIMITS: { enemyBullets: 900 }, addCappedProjectile: (_, shot) => shots.push(shot),
    loadImage: src => loaded.push(src) });
  vm.runInContext(engine.slice(start, end), context);
  for (const type of ["npc_Streuner", "npc_Mordon", "npc_Lordakium", "npc_Kristallin"]) {
    const cfg = NPC_TYPES[type];
    assert.ok(cfg?.bulletSprite?.src, type);
    context.spawnNetShotVisual({ npcShot: true, by: "npc", npcType: type, tuid: "jpc", x: 100, y: 200 });
    const shot = shots.at(-1);
    assert.equal(shot.sprite.src, cfg.bulletSprite.src);
    assert.equal(shot.spd, cfg.bulletSpeed);
    assert.equal(shot.targetId, target.id);
    assert.equal(shot.dmg, 0);
    assert.notEqual(shot._jpcShot, true);
    assert.ok(loaded.includes(cfg.bulletSprite.src));
  }
  enemies.push({ id: 3, hp: 100, _netUid: "npc", type: "npc_Mordon", x: 150, y: 200,
    r: 18, bulletSpeed: 4321, bulletScale: 2, bulletSprite: NPC_TYPES.npc_Mordon.bulletSprite });
  context.spawnNetShotVisual({ npcShot: true, by: "npc", tuid: "jpc", x: 999, y: 999 });
  assert.equal(shots.at(-1).x, 180);
  assert.equal(shots.at(-1).y, 200);
  assert.equal(shots.at(-1).spd, 4321);
  assert.equal(shots.at(-1).scale, 2);
});

test("rendu : masquer les tirs NPC conserve les lasers x1 des JPC", () => {
  const start = engine.indexOf("  for (const b of enemyBullets) {", engine.indexOf("  // Raygun"));
  const end = engine.indexOf("  for (const s of sparks)", start);
  assert.ok(start > 0 && end > start);
  const shots = [], drawn = [];
  const shooter = { id: 1, hp: 100, isJpcBot: true, _netUid: "jpc", x: 100, y: 200, r: 20 };
  const target = { id: 2, hp: 100, _netUid: "prey", x: 500, y: 200 };
  let npcShotsOn = false;
  const context = vm.createContext({ enemies: [shooter, target], enemyBullets: shots,
    player: { hp: 100 }, netMyId: () => "me", SIDE_OFFSET: 30,
    PLAYER_BULLET_SPRITES: { x1: { src: "X1.png" } },
    ENTITY_LIMITS: { enemyBullets: 900 }, addCappedProjectile: (_, shot) => shots.push(shot),
    displayNpcShotsOn: () => npcShotsOn, isBeyondSensorRadius: () => false,
    ox: 0, oy: 0, innerWidth: 1000, innerHeight: 800,
    drawBulletSprite: (...args) => drawn.push(args),
  });
  const spawnStart = engine.indexOf("function spawnNetShotVisual(ev)"), spawnEnd = engine.indexOf("function netVisualSabHome(", spawnStart);
  vm.runInContext(engine.slice(spawnStart, spawnEnd) + "\nfunction drawShots() {\n" + engine.slice(start, end) + "\n}", context);
  context.spawnNetShotVisual({ by: "jpc", tuid: "prey", n: 2 });
  shots.push({ x: 100, y: 200, vx: 4000, vy: 0, sprite: NPC_TYPES.npc_Mordon.bulletSprite });
  context.drawShots();
  assert.equal(drawn.length, 2);
  assert.ok(drawn.every(args => args[3] === "x1" && args[4] === "player" && args[5] === 1.6));
  drawn.length = 0;
  npcShotsOn = true;
  context.drawShots();
  assert.equal(drawn.length, 3);
  assert.equal(drawn[2][4], "npc");
  assert.equal(drawn[2][6].src, NPC_TYPES.npc_Mordon.bulletSprite.src);
});

test("Depart : un hello ancien reste valide avec du trafic recent, mais pas apres coupure", () => {
  const from = engine.indexOf("function netLinkReadyForEntry()"), to = engine.indexOf("function waitNetLink(", from);
  let connected = true, ackAge = 45000, messageAge = 100;
  const context = vm.createContext({ netConnected: () => connected,
    netHelloAckAge: () => ackAge, netServerMessageAge: () => messageAge });
  vm.runInContext(engine.slice(from, to), context);
  assert.equal(context.netLinkReadyForEntry(), true);
  ackAge = Infinity; assert.equal(context.netLinkReadyForEntry(), false);
  ackAge = 45000; messageAge = 30000; assert.equal(context.netLinkReadyForEntry(), false);
  messageAge = 0; connected = false; assert.equal(context.netLinkReadyForEntry(), false);
});

test("version : aucun rechargement vers un serveur plus ancien pendant le deploiement", () => {
  const from = engine.indexOf("function isNewerGameVersion("), to = engine.indexOf("function forceReloadAfterServerRestart(", from);
  const context = vm.createContext({});
  vm.runInContext(engine.slice(from, to), context);
  for (const [next, current, expected] of [["0.327", "0.328", false], ["0.328", "0.328", false],
    ["0.329", "0.328", true], ["0.10", "0.9", true], ["invalide", "0.328", false]]) {
    assert.equal(context.isNewerGameVersion(next, current), expected);
  }
  const start = engine.indexOf("function armVersionReload("), end = engine.indexOf("// Retour d'onglet", start);
  vm.runInContext("let versionReloadArmed = false;\n" + engine.slice(start, end), context);
  context.armVersionReload("0.327", "0.328"); // Aucun timer ni appel UI ne doit être tenté.
  assert.equal(vm.runInContext("versionReloadArmed", context), false);
});

test("un retard reseau ponctuel de 200 ms ne coupe pas les frames normales", () => {
  const c = client(), socket = c.sockets[0];
  socket.receive({ t: "welcome", authed: true, id: "test", at: 10000 });
  let simulated = 0;
  for (let frame = 1; frame <= 120; frame++) {
    c.advance(1000 / 60);
    // Un paquet toutes les 50 ms, puis quatre paquets retenus et livres ensemble.
    if (frame % 3 === 0 && (frame < 30 || frame >= 42)) {
      socket.receive({ t: "clock", at: 10000 + frame * 1000 / 60 });
    }
    const step = c.api.netSimulationStep(1 / 60);
    assert.ok(Math.abs(step - 1 / 60) < 1e-8, `frame ${frame} interrompue`);
    simulated += step;
  }
  assert.ok(Math.abs(simulated - 2) < 1e-8);
  assert.equal(c.api.netSpeedGuardActive(), false);
});

test('activation : les anciennes positions restent bloquees jusqu a l adoption de l arrivee serveur', async () => {
  const c = client(), socket = c.sockets[0];
  socket.receive({ t: 'welcome', authed: true, id: 'test', at: 1000 });
  c.api.pushNetplayLocal({ x: 100, y: 100 });
  const arrival = c.api.requestHangarArrival('target');
  const sent = socket.sent.length;
  c.advance(100);
  c.api.pushNetplayLocal({ x: 100, y: 100 });
  assert.equal(socket.sent.length, sent);
  assert.equal(socket.sent.at(-1).hangarId, 'target');
  socket.receive({ t: 'hangarArrival', hangarId: 'another', ok: true, x: 10, y: 10, map: '1-2' });
  c.api.pushNetplayLocal({ x: 100, y: 100 });
  assert.equal(socket.sent.length, sent, 'une reponse pour un autre hangar ne libere pas le transfert');
  socket.receive({ t: 'hangarArrival', hangarId: 'target', ok: true, x: 4200, y: 3500, map: '1-1' });
  assert.equal((await arrival).x, 4200);
  c.api.pushNetplayLocal({ x: 100, y: 100 });
  assert.equal(socket.sent.length, sent, 'le chargement de la carte ne renvoie pas la position du depart');
  c.api.finishHangarArrival();
  assert.equal(c.api.sendNetplayBackgroundState(true), false, 'aucun ancien paquet conserve a la liberation');
  c.api.pushNetplayLocal({ x: 4200, y: 3500 });
  assert.equal(socket.sent.at(-1).x, 4200);
});

test('activation : une coupure libere immediatement la requete en attente', async () => {
  const c = client(), socket = c.sockets[0];
  socket.receive({ t: 'welcome', authed: true, id: 'test', at: 1000 });
  const arrival = c.api.requestHangarArrival('target');
  socket.close();
  assert.equal((await arrival).ok, false);
});

test("l'horloge x50 ne multiplie ni la simulation ni les recharges", () => {
  const c = client();
  c.sockets[0].receive({ t: "welcome", authed: true, id: "test", at: 10000 });
  let simulated = 0;
  for (let frame = 1; frame <= 720; frame++) {
    // 60 frames par seconde reelle ; performance.now et Date.now vont x50.
    c.advance(50 * 1000 / 60);
    if (frame % 3 === 0) c.sockets[0].receive({ t: "clock", at: 10000 + frame * 1000 / 60 });
    simulated += c.api.netSimulationStep(50 / 60);
  }
  assert.ok(simulated <= 12.1 + 1e-8);
  assert.ok(simulated >= 9.8 && simulated <= 10 + NETWORK_TIMING_GRACE_SEC, "le rythme reste normal jusqu'a la confirmation sur deux fenetres");
  assert.equal(c.api.netSpeedGuardActive(), true);
  assert.ok(90 - simulated > 79, "une recharge de 90 s ne peut pas finir en douze secondes");
  assert.equal(c.api.netGameTimeMs(), 22000, "les timestamps d'aptitude suivent aussi le serveur");
  const report = c.sockets[0].sent.find(m => m.t === "clockReport");
  assert.ok(report.requestedSeconds / report.serverSeconds > 3);
});

test("un paquet ancien apres vingt secondes de lag ne declenche pas la popup anti-triche", () => {
  const c = client(), socket = c.sockets[0];
  socket.receive({ t: "welcome", authed: true, id: "test", at: 10000 });
  for (let frame = 0; frame < 1200; frame++) { c.advance(1000 / 60); c.api.netSimulationStep(1 / 60); }
  // Les premiers snapshots retenus arrivent avant les derniers, dans l'ordre TCP.
  socket.receive({ t: "clock", at: 15000 });
  assert.equal(c.api.netSpeedGuardActive(), false);
  for (let at = 20000; at <= 30000; at += 5000) socket.receive({ t: "clock", at });
  for (let frame = 1; frame <= 360; frame++) {
    c.advance(1000 / 60);
    if (frame % 3 === 0) socket.receive({ t: "clock", at: 30000 + frame * 1000 / 60 });
    c.api.netSimulationStep(1 / 60);
  }
  assert.equal(c.api.netSpeedGuardActive(), false);
  assert.equal(socket.sent.some(m => m.t === "clockReport"), false);
});

test("un gel et un ralentissement recus une seule fois expirent pendant un trou reseau", () => {
  const c = client(), socket = c.sockets[0];
  socket.receive({ t: "welcome", authed: true, id: "test", at: 10000 });
  socket.receive({ t: "snapshot", at: 10000, players: [{ id: "test", freezeT: 2, slowT: 4, slowPct: 50, iemT: 3, ishT: 5 }] });
  c.advance(1500);
  assert.equal(c.api.getNetSelf().freezeT, 0.5);
  assert.equal(c.api.getNetSelf().slowT, 2.5);
  c.advance(3500);
  const self = c.api.getNetSelf();
  for (const key of ["freezeT", "slowT", "iemT", "ishT"]) assert.equal(self[key], 0);
  assert.equal(c.api.getNetSelf().freezeT, 0, "relire l'etat ne renouvelle pas le gel");
});

test("une mort NPC recue apres des paquets manques est adoptee une seule fois", () => {
  const damageEvents = [];
  const from = engine.indexOf("    const npcDamageSeq =");
  const to = engine.indexOf("  } catch {}\n  // Multi PvP : pool PET", from);
  assert.ok(from > 0 && to > from);
  const context = vm.createContext({ self: { dead: true, npcAt: 20000, npcSeq: 20, npcHpDamage: 10, npcShDamage: 0 },
    player: { hp: 800, sh: 0, hpMax: 1000, shMax: 0, dead: false }, lastNpcDamageAdoptSeq: 1, lastNpcDamageAdoptAt: 10000,
    netHealAdopted: false,
    REPAIR: { cooldown: 10 }, enemies: [], die: () => { context.player.dead = true; },
    onPlayerPreparationDamage: (hp, shield) => damageEvents.push([hp, shield]),
  });
  const adopt = () => vm.runInContext(`(() => {${engine.slice(from, to)}})()`, context);
  adopt(); assert.equal(context.player.dead, true); assert.equal(context.player.hp, 0);
  context.player.dead = false; context.player.hp = 100;
  adopt(); assert.equal(context.player.hp, 100, "le meme paquet ne tue pas de nouveau apres reparation");
  assert.deepEqual(damageEvents, [[800, 0]], "la preparation n est notifiee qu une fois des degats serveur");
});

test("un soin absolu adopte sur le meme tick n est pas re-soustrait en differentiel NPC", () => {
  const from = engine.indexOf("    const npcDamageSeq =");
  const to = engine.indexOf("  } catch {}\n  // Multi PvP : pool PET", from);
  assert.ok(from > 0 && to > from);
  const damageEvents = [];
  const context = vm.createContext({ self: { npcAt: 20000, npcSeq: 20, npcHpDamage: 2000, npcShDamage: 0, npcDamage: 2000 },
    player: { hp: 106000, sh: 0, hpMax: 1000000, shMax: 0, dead: false, attackedT: 0 },
    lastNpcDamageAdoptSeq: 1, lastNpcDamageAdoptAt: 10000, netHealAdopted: true,
    REPAIR: { cooldown: 10 }, enemies: [], die: () => { context.player.dead = true; },
    resetRepairCooldown: () => {},
    onPlayerPreparationDamage: (hp, shield) => damageEvents.push([hp, shield]),
  });
  vm.runInContext(`(() => {${engine.slice(from, to)}})()`, context);
  assert.equal(context.player.hp, 106000, "PV absolus serveur conserves (Orcus 20 %, pas 40 %)");
  assert.equal(context.player.attackedT, 10, "le statut combat suit quand meme");
});

test("un coup PvP sur le bouclier notifie la preparation une seule fois", () => {
  const from = engine.indexOf('    if (self && Number(self.pvpAt) > 0'), to = engine.indexOf('    const npcDamageSeq =', from);
  assert.ok(from > 0 && to > from);
  const damageEvents = [];
  const context = vm.createContext({ self: { pvpAt: 10000, hp: 100, sh: 90 },
    player: { hp: 100, hpMax: 100, sh: 100, shMax: 100, dead: false }, lastPvpAdoptAt: 0,
    REPAIR: { cooldown: 10 }, onPlayerPreparationDamage: (hp, shield) => damageEvents.push([hp, shield]),
  });
  const adopt = () => vm.runInContext(`(() => {${engine.slice(from, to)}})()`, context);
  adopt(); adopt();
  assert.equal(context.player.sh, 90);
  assert.deepEqual(damageEvents, [[0, 10]]);
});

test("la pause mesure le retour a la normale sans accumuler de temps de rattrapage", () => {
  const c = client(), socket = c.sockets[0];
  socket.receive({ t: "welcome", authed: true, id: "test", at: 10000, clockBlocked: true });
  for (let frame = 1; frame <= 360; frame++) {
    if (frame % 3 === 0) socket.receive({ t: "clock", at: 10000 + frame * 1000 / 60 });
    assert.equal(c.api.netSimulationStep(1 / 60), 0);
  }
  const report = socket.sent.find(m => m.t === "clockReport");
  assert.ok(report.requestedSeconds / report.serverSeconds > 0.95);
  socket.receive({ t: "speedGuard", blocked: false, recovered: true });
  assert.equal(c.api.netSpeedGuardActive(), false);
  assert.ok(c.api.netSimulationStep(1) <= NETWORK_TIMING_GRACE_SEC, "aucun rattrapage des six secondes de pause");
});

test("les observateurs ignorent la prediction refusee et limitent le rendu a la vitesse valide", () => {
  const c = client(), socket = c.sockets[0];
  const snap = (x, extra = {}) => socket.receive({ t: "snapshot", at: 10000, players: [
    { id: "remote", x, y: 100, vx: 400, vy: 0, vmax: 400, moving: true, mx: 10000, my: 100, ...extra },
  ] });
  snap(100); c.advance(50); snap(120);
  const remote = c.api.getNetplayRemotes().get("remote");
  assert.ok(remote.motionSamples.length > 1);
  c.advance(50); snap(120, { motionBlocked: true, vx: 20000 });
  assert.equal(remote.vx, 0);
  assert.equal(remote.moving, false);
  assert.equal(remote.turn, 0);
  assert.ok(remote.motionSamples.length <= 1);
  remote.rx = 1000;
  const before = remote.rx;
  c.api.tickNetplayRemotes(0.016);
  assert.ok(Math.abs(remote.rx - before) <= 400 * 0.016 + 1e-8);
  for (let i = 0; i < 300; i++) { c.advance(16); c.api.tickNetplayRemotes(0.016); }
  assert.ok(Math.abs(remote.rx - 120) < 0.01);
  c.advance(50); snap(620, { teleportSeq: 1, vx: 0, moving: false });
  assert.equal(remote.rx, 620, "la teleportation valide de Mimesis reste immediate");
  c.advance(50); snap(900, { teleportSeq: 1, vmax: 2000 });
  const boostedBefore = remote.rx;
  c.api.tickNetplayRemotes(0.016);
  assert.ok(remote.rx - boostedBefore > 400 * 0.016, "le vrai bonus de vitesse reste visible");
  assert.ok(remote.rx - boostedBefore <= 2000 * 0.016 + 1e-8);
});

test("le rythme normal reste fluide entre les ticks et les doublons ne creent pas de temps", () => {
  const c = client();
  c.sockets[0].receive({ t: "welcome", authed: true, id: "test", at: 10000 });
  for (let frame = 1; frame <= 180; frame++) {
    if (frame % 3 === 0) c.sockets[0].receive({ t: "clock", at: 10000 + frame * 1000 / 60 });
    assert.ok(Math.abs(c.api.netSimulationStep(1 / 60) - 1 / 60) < 1e-8);
  }
  c.api.netSimulationStep(1);
  for (const at of [13000, 12900, 13000]) c.sockets[0].receive({ t: "clock", at });
  assert.equal(c.api.netSimulationStep(1), 0);
  c.sockets[0].receive({ t: "groupUpdate", at: 1e12 });
  assert.equal(c.api.netSimulationStep(1), 0);
});

test("les reconnexions ne renouvellent pas la marge d'interpolation", () => {
  const c = client();
  c.sockets[0].receive({ t: "welcome", authed: true, id: "test", at: 10000 });
  let simulated = c.api.netSimulationStep(1);
  for (let i = 0; i < 20; i++) {
    c.api.forceNetReconnect();
    const socket = c.sockets[c.sockets.length - 1];
    socket.open(); socket.receive({ t: "welcome", authed: true, id: "test", at: 10000 });
    simulated += c.api.netSimulationStep(1);
  }
  assert.ok(simulated <= NETWORK_TIMING_GRACE_SEC + 1e-8);
});

test("une coupure ne repasse pas la simulation en horloge locale accelerable", () => {
  const c = client();
  c.sockets[0].receive({ t: "welcome", authed: true, id: "test", at: 10000 });
  c.api.netSimulationStep(1);
  c.sockets[0].close(1006);
  c.advance(500000);
  for (let i = 0; i < 100; i++) assert.equal(c.api.netSimulationStep(1), 0);
  assert.equal(c.api.netGameTimeMs(), 10000);
});

test("une instance utilise le meme temps serveur et un retard permet un rattrapage borne", () => {
  const c = client();
  c.api.setNetInstanceMode(true);
  c.sockets[0].receive({ t: "welcome", authed: true, id: "test", at: 10000 });
  c.api.netSimulationStep(1);
  assert.equal(c.api.netSimulationStep(1), 0);
  c.sockets[0].receive({ t: "clock", at: 10400 });
  assert.ok(Math.abs(c.api.netSimulationStep(1) - 0.4) < 1e-8);
  c.sockets[0].receive({ t: "clock", at: 20400 });
  assert.ok(c.api.netSimulationStep(100) <= 1.25);
});

test("les pings continuent sans frames, y compris en instance", () => {
  const c = client();
  c.api.setNetInstanceMode(true);
  const before = c.sockets[0].sent.filter(m => m.t === "ping").length;
  const timer = [...c.intervals.values()][0];
  assert.equal(timer.ms, 3000);
  c.advance(3000); timer.fn();
  assert.equal(c.sockets[0].sent.filter(m => m.t === "ping").length, before + 1);
  c.api.netDisconnect();
  assert.equal(c.intervals.size, 0);
});

test("le trafic serveur maintient la liaison et une vraie absence expire", () => {
  const c = client();
  c.sockets[0].receive({ t: "pong", t0: 1000 });
  c.advance(12000);
  c.sockets[0].receive({ t: "groupUpdate", group: null });
  assert.equal(c.api.netLinkAliveInGame(), true, "un pong ancien ne doit pas couper un flux sain");
  c.advance(29999);
  assert.equal(c.api.netLinkAliveInGame(), true);
  c.advance(1);
  assert.equal(c.api.netLinkAliveInGame(), false);
});

test("les callbacks d'un ancien socket ne perturbent pas la reconnexion", () => {
  const c = client(), old = c.sockets[0];
  const oldMessage = old.onmessage, oldError = old.onerror;
  c.api.forceNetReconnect();
  c.sockets[1].open();
  c.sockets[1].receive({ t: "welcome", id: "current", authed: true });
  oldMessage({ data: JSON.stringify({ t: "welcome", id: "stale" }) });
  oldError(); old.close();
  assert.equal(c.api.netMyId(), "current");
  assert.equal(c.api.netConnected(), true);
  assert.equal(c.intervals.size, 1);
  assert.equal(c.timeouts.size, 0, "pas de reconnexion supplementaire de l'ancien socket");
});

test("une session remplacee ne se reconnecte plus en boucle", () => {
  const c = client();
  c.sockets[0].close(4001, "Session replaced");
  c.api.forceNetReconnect(); c.api.ensureNetplayConnection();
  assert.equal(c.sockets.length, 1);
  assert.equal(c.timeouts.size, 0);
  assert.equal(c.intervals.size, 0);
  assert.equal(c.api.drainNetAdminKickInbox()[0].title, "Session ouverte ailleurs");
  assert.equal(c.api.netplayStatus().lastDisconnect.code, 4001);
});

test("une coupure reseau conserve la reconnexion automatique", () => {
  const c = client();
  c.sockets[0].close(1006);
  assert.equal(c.intervals.size, 0);
  const retry = [...c.timeouts.values()][0];
  assert.equal(retry.ms, 3000);
  retry.fn(); c.sockets[1].open();
  assert.equal(c.api.netConnected(), true);
  assert.equal(c.intervals.size, 1);
});

test("aptitudes distantes : annulation transmise et auras expirées sans nouveau snapshot", () => {
  const c = client(), socket = c.sockets[0];
  socket.receive({ t: "snapshot", at: 10000, players: [{ id: "remote", x: 100, y: 100, afx: [[10, 1, 0, 0, ""]] }] });
  const remote = c.api.getNetplayRemotes().get("remote");
  c.advance(400); c.api.tickNetplayRemotes(0.016);
  assert.ok(Math.abs(remote.afx[0][1] - 0.6) < 1e-8);
  c.api.tickNetplayRemotes(0.016);
  assert.ok(Math.abs(remote.afx[0][1] - 0.6) < 1e-8, "pas de double décompte dans la même frame");
  socket.receive({ t: "skillFx", skill: "ability_citadel_fortify", by: "remote", enabled: false, at: 10400, until: 10400 });
  assert.equal(c.api.drainNetSkillInbox()[0].enabled, false);
  c.advance(800); c.api.tickNetplayRemotes(0.016);
  assert.equal(remote.afx.length, 0);
});

test("Liberator Plus : le protocole conserve l'aura complète et les montants des ticks", () => {
  const c = client(), socket = c.sockets[0];
  c.api.sendSkillUse("ability_liberator-plus_self-repair", { phase: "heal", amount: 10000 });
  assert.equal(socket.sent.at(-1).phase, "heal");
  assert.equal(socket.sent.at(-1).amount, 10000);
  socket.receive({ t: "snapshot", at: 10000, players: [{ id: "remote", x: 100, y: 100, afx: [[73, 10, 0, 0, ""]] }] });
  assert.equal(c.api.getNetplayRemotes().get("remote").afx[0][1], 10);
  socket.receive({ t: "skillFx", by: "remote", skill: "ability_liberator-plus_self-repair", phase: "heal", amount: 10000, at: 11000, until: 11000 });
  const event = c.api.drainNetSkillInbox()[0];
  assert.equal(event.phase, "heal");
  assert.equal(event.amount, 10000);
});

test("aptitudes distantes : mort et camouflage effacent les visuels précédents", () => {
  for (const state of [{ dead: true }, { cloaked: true }, { cloakCpu: true }]) {
    const c = client(), socket = c.sockets[0];
    socket.receive({ t: "snapshot", at: 10000, players: [{ id: "remote", x: 100, y: 100, afx: [[10, 10, 0, 0, ""]], ...state }] });
    const remote = c.api.getNetplayRemotes().get("remote");
    remote.fxFlash = { code: 10, until: 99999 };
    c.api.tickNetplayRemotes(0.016);
    assert.equal(remote.afx.length, 0);
    assert.equal(remote.fxFlash, null);
  }
});

test("pod Aegis : le protocole livre le gain confirmé avec son bénéficiaire", () => {
  const c = client(), socket = c.sockets[0];
  c.api.sendHealAlly({ target: "recipient", ability: "ability_aegis_repair-pod", amt: 18000 });
  assert.equal(socket.sent.at(-1).target, "recipient");
  assert.equal(socket.sent.at(-1).amt, 18000);
  socket.receive({ t: "skillFx", by: "caster", target: "recipient", skill: "ability_aegis_repair-pod",
    phase: "heal", amount: 1000, at: 11000, until: 11000 });
  const event = c.api.drainNetSkillInbox()[0];
  assert.equal(event.target, "recipient");
  assert.equal(event.phase, "heal");
  assert.equal(event.amount, 1000);
  assert.equal(c.api.drainNetSkillInbox().length, 0, "événement consommé une seule fois");
});

test("réparations Aegis : montants coque complets, +0 et indicateur bouclier conservés", () => {
  const c = client(), socket = c.sockets[0];
  socket.receive({ t: "skillFx", by: "friend", target: "recipient", skill: "ability_aegis_hp-repair",
    phase: "heal", amount: 40000, shield: false });
  socket.receive({ t: "skillFx", by: "friend", skill: "ability_aegis_shield-repair", phase: "heal", amount: 0, shield: true });
  const [hp, shield] = c.api.drainNetSkillInbox();
  assert.equal(hp.amount, 40000); assert.equal(hp.shield, false);
  assert.equal(hp.target, "recipient");
  assert.equal(shield.amount, 0); assert.equal(shield.shield, true);
});

test("une session remplacee affiche son motif meme si la simulation est gelee", () => {
  const c = client();
  Object.assign(c.api, { started: true, starting: false, linkDead: true, kickedReason: null,
    setKickOverlay: reason => { c.api.kickedReason = reason; } });
  const heartbeat = engine.slice(engine.indexOf("function tickLinkHeartbeat("), engine.indexOf("// Mise à jour déployée"));
  vm.runInContext(heartbeat, c.api);
  c.sockets[0].close(4001, "Session replaced");
  c.api.tickLinkHeartbeat(0.016);
  assert.match(c.api.kickedReason, /autre onglet/);
  assert.equal(c.sockets.length, 1);
});

for (const [type, expected] of [["cheatHold", /examen/], ["banned", /banni/]]) {
  test(`${type} reste affiche pendant la pause de vitesse`, () => {
    const c = client();
    Object.assign(c.api, { started: true, starting: false, linkDead: true, kickedReason: null,
      setKickOverlay: reason => { c.api.kickedReason = reason; } });
    const heartbeat = engine.slice(engine.indexOf("function tickLinkHeartbeat("), engine.indexOf("// Mise à jour déployée"));
    vm.runInContext(heartbeat, c.api);
    c.sockets[0].receive({ t: "welcome", authed: true, id: "test", at: 10000, clockBlocked: true });
    c.sockets[0].receive({ t: type, reason: type === "cheatHold" ? "Dossier en examen" : "Triche", until: 0 });
    c.api.tickLinkHeartbeat(0.016);
    assert.match(c.api.kickedReason, expected);
    assert.equal(c.sockets.length, 1);
  });
}
