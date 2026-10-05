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
