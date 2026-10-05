import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

// Execute les vrais handlers du client avec sockets et horloge controles.
const source = readFileSync(new URL("../SRC/CORE/NETPLAY.js", import.meta.url), "utf8").replace(/^export /gm, "");
const engine = readFileSync(new URL("../SRC/CORE/ORBIT_ENGINE.js", import.meta.url), "utf8");
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
    window: {}, location: { protocol: "http:", host: "localhost" },
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

test("l'horloge x50 ne multiplie ni la simulation ni les recharges", () => {
  const c = client();
  c.sockets[0].receive({ t: "welcome", authed: true, id: "test", at: 10000 });
  let simulated = 0;
  for (let frame = 1; frame <= 360; frame++) {
    // 60 frames par seconde reelle ; performance.now et Date.now vont x50.
    c.advance(50 * 1000 / 60);
    if (frame % 3 === 0) c.sockets[0].receive({ t: "clock", at: 10000 + frame * 1000 / 60 });
    simulated += c.api.netSimulationStep(50 / 60);
  }
  assert.ok(simulated <= 6.1 + 1e-8);
  assert.ok(simulated >= 4.8 && simulated <= 5.1, "le rythme reste normal jusqu'a la suspension");
  assert.equal(c.api.netSpeedGuardActive(), true);
  assert.ok(90 - simulated > 83, "une recharge de 90 s ne peut pas finir en six secondes");
  assert.equal(c.api.netGameTimeMs(), 16000, "les timestamps d'aptitude suivent aussi le serveur");
  const report = c.sockets[0].sent.find(m => m.t === "clockReport");
  assert.ok(report.requestedSeconds / report.serverSeconds > 3);
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
  assert.ok(c.api.netSimulationStep(1) <= 0.1, "aucun rattrapage des six secondes de pause");
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
  assert.ok(simulated <= 0.1 + 1e-8);
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
