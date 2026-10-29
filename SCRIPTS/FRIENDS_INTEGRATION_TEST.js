// Serveur et SQLite éphémères : aucun accès aux comptes du workspace.
import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:net";
import { once } from "node:events";

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

test("amis : demandes envoyées, stats, blocage", { timeout: 60000 }, async t => {
  const temporary = await mkdtemp(join(tmpdir(), "orbit-friends-"));
  const reserve = createServer();
  reserve.listen(0, "127.0.0.1");
  await once(reserve, "listening");
  const port = reserve.address().port;
  await new Promise(resolve => reserve.close(resolve));
  const server = spawn(process.execPath, [fileURLToPath(new URL("./MULTI_SERVER.js", import.meta.url))], {
    cwd: temporary, windowsHide: true, env: { ...process.env, PORT: String(port) }, stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  server.stdout.on("data", chunk => { output += chunk; });
  server.stderr.on("data", chunk => { output += chunk; });
  t.after(async () => {
    const stopped = server.exitCode === null ? once(server, "exit") : Promise.resolve();
    server.kill();
    await stopped;
    assert.ok(basename(temporary).startsWith("orbit-friends-"));
    await rm(temporary, { recursive: true, force: true });
  });
  const url = `http://127.0.0.1:${port}`;
  const call = async (path, { token, body, method } = {}) => {
    const headers = { "content-type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetch(url + path, { method: method || (body ? "POST" : "GET"), headers, body: body ? JSON.stringify(body) : undefined });
    return { status: response.status, ...(await response.json()) };
  };
  const ok = async (path, options) => {
    const result = await call(path, options);
    assert.equal(result.ok, true, `${path}: ${JSON.stringify(result)} ${output.slice(-400)}`);
    return result;
  };
  for (let i = 0; i < 80; i++) {
    try { if ((await fetch(url + "/api/ping")).ok) break; } catch {}
    await pause(100);
  }
  const register = async pseudo => (await ok("/api/register", {
    body: { pseudo, email: `${pseudo}@example.test`, password: "test-password-123", faction: "eic" },
  })).token;
  const anna = await register("Anna"), boris = await register("Boris");

  // Demande envoyée visible puis annulée.
  await ok("/api/friends", { token: anna, body: { pseudo: "Boris" } });
  assert.deepEqual((await ok("/api/friends/sent", { token: anna })).sent.map(r => r.pseudo), ["Boris"]);
  assert.deepEqual((await ok("/api/friends/requests", { token: boris })).requests.map(r => r.pseudo), ["Anna"]);
  await ok("/api/friends/cancel", { token: anna, body: { pseudo: "Boris" } });
  assert.equal((await ok("/api/friends/sent", { token: anna })).sent.length, 0);
  assert.equal((await ok("/api/friends/requests", { token: boris })).requests.length, 0);

  // Amitié : stats publiques, sans présence de jeu.
  await ok("/api/friends", { token: anna, body: { pseudo: "Boris" } });
  await ok("/api/friends/accept", { token: boris, body: { pseudo: "Anna" } });
  const friend = (await ok("/api/friends", { token: anna })).friends[0];
  assert.equal(friend.pseudo, "Boris");
  assert.equal(friend.faction, "eic");
  for (const key of ["rankPoints", "honor", "exp", "npcKills", "pvpKills", "since", "lastSeen"]) assert.equal(typeof friend[key], "number", key);
  for (const key of ["map", "shipId", "inGroup", "instance"]) assert.equal(key in friend, false, key);

  // Blocage : amitié retirée des deux côtés, plus de demande possible.
  const blockedRes = await ok("/api/friends/blocks", { token: anna, body: { pseudo: "Boris" } });
  assert.equal(blockedRes.wasFriend, true);
  assert.equal((await ok("/api/friends", { token: anna })).friends.length, 0);
  assert.equal((await ok("/api/friends", { token: boris })).friends.length, 0);
  assert.deepEqual((await ok("/api/friends/blocks", { token: anna })).blocked.map(b => b.pseudo), ["Boris"]);
  const refused = await call("/api/friends", { token: boris, body: { pseudo: "Anna" } });
  assert.equal(refused.ok, false);
  assert.equal(refused.error, "Demande impossible.");
  const own = await call("/api/friends", { token: anna, body: { pseudo: "Boris" } });
  assert.match(own.error, /débloque-le/);

  // Déblocage : les demandes redeviennent possibles.
  await ok("/api/friends/blocks", { token: anna, method: "DELETE", body: { pseudo: "Boris" } });
  assert.equal((await ok("/api/friends/blocks", { token: anna })).blocked.length, 0);
  await ok("/api/friends", { token: boris, body: { pseudo: "Anna" } });
});
