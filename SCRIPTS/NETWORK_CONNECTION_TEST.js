import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { NETWORK_TIMING_GRACE_SEC } from "../SRC/CORE/NETWORK_TIMING.js";
import { sanitizeAbilityFxList } from "../SRC/CORE/ABILITY_FX.js";

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
    REPAIR: { cooldown: 10 }, enemies: [], die: () => { context.player.dead = true; },
    onPlayerPreparationDamage: (hp, shield) => damageEvents.push([hp, shield]),
  });
  const adopt = () => vm.runInContext(`(() => {${engine.slice(from, to)}})()`, context);
  adopt(); assert.equal(context.player.dead, true); assert.equal(context.player.hp, 0);
  context.player.dead = false; context.player.hp = 100;
  adopt(); assert.equal(context.player.hp, 100, "le meme paquet ne tue pas de nouveau apres reparation");
  assert.deepEqual(damageEvents, [[800, 0]], "la preparation n est notifiee qu une fois des degats serveur");
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
