// Serveur et SQLite éphémères : aucun accès aux comptes du workspace.
import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:net";
import { once } from "node:events";
import WebSocket from "ws";
import { combatProfile } from "./COMBAT_PROFILE.js";
import { CATALOG } from "../SRC/CORE/CATALOG.js";

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

test("WebSocket : stats forgées, téléports, portails et reconnexion", { timeout: 55000 }, async t => {
  const temporary = await mkdtemp(join(tmpdir(), "orbit-anticheat-"));
  const reserve = createServer();
  reserve.listen(0, "127.0.0.1");
  await once(reserve, "listening");
  const port = reserve.address().port;
  await new Promise(resolve => reserve.close(resolve));
  const password = "isolated-anticheat-test";
  const server = spawn(process.execPath, [fileURLToPath(new URL("./MULTI_SERVER.js", import.meta.url))], {
    cwd: temporary, windowsHide: true,
    env: { ...process.env, PORT: String(port), ORBIT_ADMIN_PASS: password },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  server.stdout.on("data", chunk => { output += chunk; });
  server.stderr.on("data", chunk => { output += chunk; });
  const sockets = [];
  t.after(async () => {
    for (const ws of sockets) ws.terminate();
    const stopped = server.exitCode === null ? once(server, "exit") : Promise.resolve();
    server.kill();
    await stopped;
    assert.equal(dirname(resolve(temporary)), resolve(tmpdir()));
    assert.ok(basename(temporary).startsWith("orbit-anticheat-"));
    await rm(temporary, { recursive: true, force: true });
  });
  const url = `http://127.0.0.1:${port}`;
  const api = async (path, options = {}) => {
    const response = await fetch(url + path, options);
    const result = await response.json();
    assert.ok(response.ok, `${path}: ${JSON.stringify(result)}`);
    return result;
  };
  let ready = false;
  for (let i = 0; i < 80; i++) {
    try { await api("/api/ping"); ready = true; break; } catch {}
    if (server.exitCode !== null) break;
    await pause(100);
  }
  assert.ok(ready, output);
  const items = Object.values(CATALOG).flat().filter(i => i && typeof i === "object");
  const shield = items.find(i => i.module?.type === "shield" && !i.petOnly);
  const makeAccount = async (name, map = "1-1", pos = { x: 4500, y: 3500 }) => {
    const account = await api("/api/register", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ pseudo: name, email: `${name}@example.test`, password: "test-password-123", faction: "mmo" }) });
    const user = { ...account.user, revision: Number(account.user.revision || 1) + 1,
      hangars: [{ id: "test-hangar", active: true, shipId: "PhoenixBleu", activeConfig: 1, lastMap: map, lastPos: pos,
        fits: { "1": { lasers: [], gens: [shield.id], extras: [], shipMods: [] },
          "2": { lasers: [], gens: [], extras: [], shipMods: [] } } }],
      drones: { items: [] }, inventory: { shipModules: [] }, rockets: {} };
    await api("/api/save", { method: "POST", headers: { "content-type": "application/json", Authorization: `Bearer ${account.token}` }, body: JSON.stringify({ user }) });
    return { ...account, user };
  };
  const connect = async (account, map = "1-1") => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    sockets.push(ws);
    const messages = [];
    ws.on("message", data => { messages.push(JSON.parse(String(data))); });
    const wait = async (predicate, after = 0, timeout = 4000) => {
      const end = Date.now() + timeout;
      while (Date.now() < end) {
        const found = messages.slice(after).find(predicate);
        if (found) return found;
        assert.equal(ws.readyState, WebSocket.OPEN, output);
        await pause(20);
      }
      assert.fail(`Message timeout: ${output}`);
    };
    await once(ws, "open");
    ws.send(JSON.stringify({ t: "hello", token: account.token, map }));
    await wait(m => m.t === "welcome" && m.authed);
    const id = `u_${account.user.id}`;
    const pos = { t: "pos", map, ...account.user.hangars[0].lastPos, hpPct: 1, shPct: 1, hpMax: 204000, shMax: 5000, dead: false, config: 1 };
    const send = msg => ws.send(JSON.stringify(msg));
    send(pos);
    const snapshot = (after = messages.length) => wait(m => m.t === "snapshot" && m.players.some(p => p.id === id), after)
      .then(m => m.players.find(p => p.id === id));
    await snapshot(0);
    return { ws, messages, wait, id, pos, send, snapshot };
  };
  const peers = () => api("/api/admin/peers", { headers: { "x-admin-token": password } });
  const alice = await makeAccount("anticheat-alice");
  const bob = await makeAccount("anticheat-bob", "1-1", { x: 4600, y: 3500 });
  const a = await connect(alice), b = await connect(bob);
  const idle = await connect(await makeAccount("anticheat-idle"));
  const idleHeartbeat = setInterval(() => idle.send({ t: "ping", t0: Date.now() }), 3000);
  t.after(() => clearInterval(idleHeartbeat));
  const silent = await connect(await makeAccount("anticheat-silent"));
  const silentClosed = once(silent.ws, "close");
  const expectedHpDamage = Math.round(1000 * (1 - combatProfile(bob.user, "1-1").absorb));
  const original = await b.snapshot();
  const startHit = b.messages.length;
  a.send({ t: "pvpHit", target: b.id, dmg: 1000, pen: 1, critChance: 1, critMult: 1e9 });
  const damaged = await b.wait(m => m.t === "snapshot" && m.players.some(p => p.id === b.id && p.pvpHp < original.pvpHp), startHit)
    .then(m => m.players.find(p => p.id === b.id));
  assert.equal(original.pvpHp - damaged.pvpHp, expectedHpDamage, "pénétration du client ignorée");
  const forgedAt = b.messages.length;
  b.send({ ...b.pos, hpMax: 1e9, shMax: 1e9, evade: 0.9, absorb: 1, range: 5000, hswap: 3 });
  const forged = await b.snapshot(forgedAt);
  assert.equal(forged.pvpHp, damaged.pvpHp, "changer les maxima ne soigne pas sous le feu");
  const followupAt = b.messages.length;
  a.send({ t: "pvpHit", target: b.id, dmg: 1000 });
  const followup = await b.wait(m => m.t === "snapshot" && m.players.some(p => p.id === b.id && p.pvpHp < forged.pvpHp), followupAt)
    .then(m => m.players.find(p => p.id === b.id));
  assert.equal(forged.pvpHp - followup.pvpHp, expectedHpDamage, "hswap, absorption et esquive forgés ignorés");
  const oversizedAt = b.messages.length;
  a.send({ t: "pvpHit", target: b.id, dmg: 1e7 });
  assert.equal((await b.snapshot(oversizedAt)).pvpHp, followup.pvpHp, "impact au-delà du profil refusé");

  a.send({ ...a.pos, dead: true });
  for (let i = 0; i < 30; i++) a.send({ ...a.pos, dead: false, x: 100000, y: 100000, vmax: 5000 });
  await a.wait(m => m.t === "stateCorrection");
  await pause(100);
  const current = (await peers()).peers.find(p => p.id === a.id);
  assert.equal(current.x, a.pos.x);
  assert.equal(current.y, a.pos.y);
  a.send({ t: "map", map: "4-5" });
  await pause(100);
  assert.equal((await peers()).peers.find(p => p.id === a.id).map, "1-1");

  // Le premier tick peut précéder la première fenêtre complète : attendre
  // le deuxième, sans accélérer ni modifier le code serveur livré.
  let suspect;
  const auditDeadline = Date.now() + 23000;
  while (Date.now() < auditDeadline) {
    const audit = await api("/api/admin/cheat", { headers: { "x-admin-token": password } });
    suspect = audit.suspects.find(p => p.id === a.id);
    if (suspect) break;
    a.send(a.pos); b.send({ ...b.pos, hpPct: followup.pvpHp / combatProfile(bob.user, "1-1").hpMax,
      shPct: followup.pvpSh / combatProfile(bob.user, "1-1").shMax });
    await pause(250);
  }
  assert.equal(suspect?.score, 10, output);
  assert.equal(idle.ws.readyState, WebSocket.OPEN, "le joueur immobile reste connecte");
  assert.ok((await peers()).peers.some(p => p.id === idle.id), "les pings maintiennent la presence sans nouvelles positions");
  await idle.snapshot();
  a.ws.close(); await once(a.ws, "close");
  const reconnected = await connect(alice);
  const auditAfter = await api("/api/admin/cheat", { headers: { "x-admin-token": password } });
  assert.equal(auditAfter.suspects.find(p => p.id === a.id)?.score, 10, "reconnexion conserve le score");
  assert.equal((await peers()).peers.filter(p => p.id === a.id).length, 1);
  assert.equal(reconnected.id, a.id);
  const replaced = once(reconnected.ws, "close");
  const replacement = await connect(alice);
  assert.equal((await replaced)[0], 4001, "un autre onglet recoit un motif distinct");
  assert.equal(replacement.ws.readyState, WebSocket.OPEN);
  assert.equal((await peers()).peers.filter(p => p.id === a.id).length, 1);

  const portalAccount = await makeAccount("anticheat-portal", "1-2", { x: 1083, y: 1000 });
  const portalPeer = await connect(portalAccount, "1-2");
  portalPeer.send({ t: "map", map: "1-1" });
  portalPeer.send({ ...portalPeer.pos, map: "1-1", x: 10232, y: 5900 });
  await pause(100);
  const arrived = (await peers()).peers.find(p => p.id === portalPeer.id);
  assert.equal(arrived.map, "1-1");
  assert.equal(arrived.x, 10232);
  assert.equal(arrived.y, 5900);
  const [silentCode, silentReason] = await silentClosed;
  assert.equal(silentCode, 4000, "un socket vraiment silencieux finit par etre ferme");
  assert.equal(String(silentReason), "Heartbeat timeout");
});
