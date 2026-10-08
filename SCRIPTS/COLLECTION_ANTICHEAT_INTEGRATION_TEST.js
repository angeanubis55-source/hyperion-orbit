import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, dirname, basename } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import WebSocket from "ws";
import { loadServerMaps } from "./MAP_RULES.js";

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

test("recolte dense vaisseau + PET : aucun dossier, doublons et PET forge refuses", { timeout: 45000 }, async t => {
  const temporary = await mkdtemp(join(tmpdir(), "orbit-collection-anticheat-"));
  // Ressources au centre, sans tirs NPC, uniquement dans ce serveur ephemere.
  const fixture = join(temporary, "fixture.mjs");
  await writeFile(fixture, `
import { COLLECTABLE_TYPES } from ${JSON.stringify(new URL("../SRC/DATA/COLLECTABLES.js", import.meta.url).href)};
import { ZoneNpcSim } from ${JSON.stringify(new URL("./NPC_ROOM.js", import.meta.url).href)};
COLLECTABLE_TYPES.Palladium_Ore.maps = ['1-1'];
COLLECTABLE_TYPES.Palladium_Ore.qty = 600;
COLLECTABLE_TYPES.Palladium_Ore.respawnDelaySec = 60;
Math.random = () => 0.5;
ZoneNpcSim.prototype.drainPlayerHits = function() { this.playerHits.length = 0; return []; };
`);
  const adminPassword = "isolated-collection-anticheat";
  const reserve = createServer();
  await new Promise(resolve => reserve.listen(0, "127.0.0.1", resolve));
  const port = reserve.address().port;
  await new Promise(resolve => reserve.close(resolve));
  const server = spawn(process.execPath, ["--import", pathToFileURL(fixture).href,
    fileURLToPath(new URL("./MULTI_SERVER.js", import.meta.url))], {
    cwd: temporary, windowsHide: true, env: { ...process.env, PORT: String(port), ORBIT_ADMIN_PASS: adminPassword },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  server.stdout.on("data", chunk => { output += chunk; });
  server.stderr.on("data", chunk => { output += chunk; });
  const sockets = [];
  t.after(async () => {
    for (const ws of sockets) ws.terminate();
    const stopped = server.exitCode === null ? once(server, "exit") : Promise.resolve();
    server.kill(); await stopped;
    assert.equal(dirname(resolve(temporary)), resolve(tmpdir()));
    assert.ok(basename(temporary).startsWith("orbit-collection-anticheat-"));
    await rm(temporary, { recursive: true, force: true });
  });
  const url = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 10000;
  let ready = false;
  while (Date.now() < deadline && !ready) {
    try { ready = (await fetch(url + "/api/ping")).ok; } catch {}
    if (server.exitCode !== null) break;
    await pause(30);
  }
  assert.ok(ready, output);
  const api = async (path, options) => {
    const response = await fetch(url + path, options);
    const data = await response.json();
    assert.ok(response.ok, JSON.stringify(data));
    return data;
  };
  const world = (await loadServerMaps()).get("1-1").world;
  const centre = { x: world.w / 2, y: world.h / 2 };
  const connect = async (pseudo, petOwned, offset) => {
    const account = await api("/api/register", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ pseudo, email: `${pseudo}@example.test`, password: "test-password-123", faction: "mmo" }) });
    const position = { x: centre.x - offset, y: centre.y };
    const user = { ...account.user, revision: account.user.revision + 1,
      pet: { owned: petOwned, id: "niveau1", exp: 0, hp: 4000, active: petOwned },
      hangars: [{ id: "collection-hangar", active: true, shipId: "PhoenixBleu", activeConfig: 1,
        lastMap: "1-1", lastPos: position, fits: { "1": { lasers: [], gens: [], extras: [], shipMods: [] } } }] };
    await api("/api/save", { method: "POST", headers: { "content-type": "application/json", Authorization: `Bearer ${account.token}` },
      body: JSON.stringify({ user }) });
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`); sockets.push(ws);
    const messages = [];
    ws.on("message", raw => { messages.push(JSON.parse(String(raw))); });
    const wait = async (predicate, after = 0) => {
      const end = Date.now() + 4000;
      while (Date.now() < end) {
        const found = messages.slice(after).find(predicate);
        if (found) return found;
        assert.equal(ws.readyState, WebSocket.OPEN, output);
        await pause(10);
      }
      assert.fail(`Message manquant : ${output}`);
    };
    await once(ws, "open");
    const send = data => ws.send(JSON.stringify(data));
    send({ t: "hello", token: account.token, map: "1-1" });
    await wait(m => m.t === "welcome");
    const pos = { t: "pos", map: "1-1", ...position, hpPct: 1, shPct: 1,
      peta: 1, petx: centre.x, pety: centre.y, boxLimit: 1e9, petCollectors: 999 };
    send(pos);
    const id = `u_${account.user.id}`;
    const snapshot = await wait(m => m.t === "snapshot" && m.players.some(p => p.id === id));
    assert.equal(snapshot.players.find(p => p.id === id).peta, petOwned ? 1 : 0);
    const list = await wait(m => m.t === "boxesSync");
    return { ws, send, wait, messages, id, pos, boxes: list.boxes.filter(b => b.type === "Palladium_Ore") };
  };
  const legitimate = await connect("collection-pet", true, 150);
  assert.ok(legitimate.boxes.length >= 300);
  const forged = await connect("collection-forged", false, 1500);
  const uid = legitimate.boxes[0].uid;
  forged.send({ t: "box", op: "collect", uid, peta: 1, petCollectors: 999, boxLimit: 1e9 });
  assert.equal((await forged.wait(m => m.t === "box" && m.op === "claim" && m.uid === uid)).ok, false);
  legitimate.send({ t: "box", op: "collect", uid });
  assert.equal((await legitimate.wait(m => m.t === "box" && m.op === "claim" && m.uid === uid)).ok, true);
  const duplicateAt = legitimate.messages.length;
  legitimate.send({ t: "box", op: "collect", uid });
  assert.equal((await legitimate.wait(m => m.t === "box" && m.op === "claim" && m.uid === uid, duplicateAt)).ok, false);
  // 8 collectes/s < 5/s vaisseau + 3,33/s PET, au-dessus de l'ancien seuil.
  let accepted = 1;
  const finish = Date.now() + 22000;
  for (const box of legitimate.boxes.slice(1)) {
    if (Date.now() >= finish) break;
    legitimate.send(legitimate.pos);
    legitimate.send({ t: "box", op: "collect", uid: box.uid });
    assert.equal((await legitimate.wait(m => m.t === "box" && m.op === "claim" && m.uid === box.uid)).ok, true);
    accepted++;
    await pause(125);
  }
  assert.ok(accepted >= 140, `${accepted} collectes seulement`);
  const audit = await api("/api/admin/cheat", { headers: { "x-admin-token": adminPassword } });
  assert.equal(audit.suspects.some(s => s.id === legitimate.id && s.score > 0), false);
  assert.equal(audit.holds.some(h => h.pseudo === "collection-pet"), false);
  assert.equal(legitimate.messages.some(m => m.t === "cheatKick"), false);
  assert.equal(legitimate.ws.readyState, WebSocket.OPEN);
});
