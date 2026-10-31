// Serveur et SQLite éphémères : aucun accès aux comptes du workspace.
import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:net";
import { once } from "node:events";
import WebSocket from "ws";

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

test("admin : téléportation en direct sans reconnexion, renvoi à la base, joueur hors ligne", { timeout: 60000 }, async t => {
  const temporary = await mkdtemp(join(tmpdir(), "orbit-admin-teleport-"));
  const reserve = createServer();
  reserve.listen(0, "127.0.0.1");
  await once(reserve, "listening");
  const port = reserve.address().port;
  await new Promise(resolve => reserve.close(resolve));
  const password = "isolated-teleport-test";
  const server = spawn(process.execPath, [fileURLToPath(new URL("./MULTI_SERVER.js", import.meta.url))], {
    cwd: temporary, windowsHide: true, env: { ...process.env, PORT: String(port), ORBIT_ADMIN_PASS: password }, stdio: ["ignore", "pipe", "pipe"],
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
    await rm(temporary, { recursive: true, force: true });
  });
  const url = `http://127.0.0.1:${port}`;
  const api = async (path, options = {}) => (await fetch(url + path, options)).json();
  const admin = (path, body) => api(path, body === undefined ? { headers: { "x-admin-token": password } }
    : { method: "POST", headers: { "content-type": "application/json", "x-admin-token": password }, body: JSON.stringify(body) });
  for (let i = 0; i < 80; i++) {
    try { if ((await api("/api/ping")).ok !== undefined) break; } catch {}
    await pause(100);
  }
  const makeAccount = async (name) => {
    const account = await api("/api/register", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ pseudo: name, email: `${name}@example.test`, password: "test-password-123", faction: "mmo" }) });
    assert.ok(account.token, output);
    const user = { ...account.user, revision: Number(account.user.revision || 1) + 1,
      hangars: [{ id: "test-hangar", active: true, shipId: "PhoenixBleu", activeConfig: 1, lastMap: "1-1", lastPos: { x: 4500, y: 3500 },
        fits: { "1": { lasers: [], gens: [], extras: [], shipMods: [] }, "2": { lasers: [], gens: [], extras: [], shipMods: [] } } }],
      drones: { items: [] }, inventory: { shipModules: [] } };
    await api("/api/save", { method: "POST", headers: { "content-type": "application/json", Authorization: `Bearer ${account.token}` }, body: JSON.stringify({ user }) });
    return { ...account, user };
  };

  const pilot = await makeAccount("teleport-pilot");
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  sockets.push(ws);
  const messages = [];
  ws.on("message", data => { messages.push(JSON.parse(String(data))); });
  const wait = async (predicate, after = 0, timeout = 4000) => {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      const found = messages.slice(after).find(predicate);
      if (found) return found;
      assert.equal(ws.readyState, WebSocket.OPEN, `connexion fermée : ${output}`);
      await pause(20);
    }
    assert.fail(`Message timeout: ${output}`);
  };
  await once(ws, "open");
  ws.send(JSON.stringify({ t: "hello", token: pilot.token, map: "1-1" }));
  await wait(m => m.t === "welcome" && m.authed);
  const id = `u_${pilot.user.id}`;
  const base = { t: "pos", hpPct: 1, shPct: 1, hpMax: 204000, shMax: 0, dead: false, config: 1 };
  ws.send(JSON.stringify({ ...base, map: "1-1", x: 4500, y: 3500 }));
  const seen = (map, x, y, after) => wait(m => m.t === "snapshot" && m.players.some(p => p.id === id && Math.abs(p.x - x) < 2 && Math.abs(p.y - y) < 2), after);
  await seen("1-1", 4500, 3500, 0);

  // Même carte : correction de position, puis le jeu repart de là.
  let mark = messages.length;
  const same = await admin("/api/admin/teleport", { id, map: "1-1", x: 9000, y: 6000 });
  assert.equal(same.ok, true, same.error); assert.equal(same.live, true);
  let correction = await wait(m => m.t === "stateCorrection" && m.x === 9000, mark);
  assert.equal(correction.map, "1-1");
  ws.send(JSON.stringify({ ...base, map: "1-1", x: 4510, y: 3500, cseq: correction.seq - 1 })); // paquet parti avant
  mark = messages.length;
  ws.send(JSON.stringify({ ...base, map: "1-1", x: 9000, y: 6000, cseq: correction.seq }));
  await seen("1-1", 9000, 6000, mark);

  // Autre carte : le joueur change de salle sans se reconnecter.
  mark = messages.length;
  const other = await admin("/api/admin/teleport", { id, map: "1-2", x: 3000, y: 3000 });
  assert.equal(other.ok, true, other.error);
  correction = await wait(m => m.t === "stateCorrection" && m.map === "1-2", mark);
  mark = messages.length;
  ws.send(JSON.stringify({ ...base, map: "1-2", x: 3000, y: 3000, cseq: correction.seq }));
  await seen("1-2", 3000, 3000, mark);
  assert.equal((await admin("/api/admin/accounts")).accounts.find(a => a.id === id).map, "1-2");

  // Renvoi à la base, toujours en direct.
  mark = messages.length;
  const home = await admin("/api/admin/teleport-home", { id });
  assert.equal(home.ok, true, home.error); assert.equal(home.live, true); assert.equal(home.map, "1-1");
  correction = await wait(m => m.t === "stateCorrection" && m.map === "1-1", mark);
  mark = messages.length;
  ws.send(JSON.stringify({ ...base, map: "1-1", x: correction.x, y: correction.y, cseq: correction.seq }));
  await seen("1-1", correction.x, correction.y, mark);
  assert.equal(ws.readyState, WebSocket.OPEN, "jamais déconnecté");
  const suspects = (await admin("/api/admin/cheat")).suspects || [];
  assert.equal(suspects.find(s => s.id === id)?.security?.counts?.movement || 0, 0, "aucun mouvement refusé");

  // Hors ligne : position enregistrée dans le compte.
  const away = await makeAccount("teleport-away");
  const offline = await admin("/api/admin/teleport", { id: `u_${away.user.id}`, map: "1-3", x: 5000, y: 4000 });
  assert.equal(offline.ok, true, offline.error); assert.equal(offline.live, false);
  const inv = await admin(`/api/admin/inventory?id=u_${away.user.id}`);
  assert.equal(inv.hangars.find(h => h.active).lastMap, "1-3");
  assert.equal((await admin("/api/admin/teleport", { id, map: "inconnue" })).ok, false);
});
