// Serveur et comptes éphémères : vrais WebSockets, vraie simulation et SQLite.
import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, dirname, basename } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createServer } from "node:net";
import { once } from "node:events";
import WebSocket from "ws";
import { resolveNpcReward } from "../NPC/NPC_BALANCE.js";

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

test("Boss Cucurbitor : deux joueurs sans groupe, parts de 0.5 % et 20 % versées au second attaquant", { timeout: 20000 }, async t => {
  const temporary = await mkdtemp(join(tmpdir(), "orbit-boss-reward-"));
  const fixture = join(temporary, "fixture.mjs");
  const bossType = "npc_Boss_Curcubitor_1_3";
  // Seuls les combats sont déterministes : toute l'attribution utilise le
  // serveur réel, ses identifiants de transaction et ses comptes SQLite.
  await writeFile(fixture, `
import { ZoneNpcSim } from ${JSON.stringify(new URL("./NPC_ROOM.js", import.meta.url).href)};
import { NPC_TYPES } from ${JSON.stringify(new URL("../NPC/NPC_TYPES.js", import.meta.url).href)};
const bossType = ${JSON.stringify(bossType)};
NPC_TYPES[bossType] = { ...NPC_TYPES[bossType], hp: 10000, shield: 0, dr: 0, canShoot: false };
const create = ZoneNpcSim.create.bind(ZoneNpcSim);
ZoneNpcSim.create = async function(mapId, saved) {
  if (mapId !== "1-1") return create(mapId, saved);
  const camps = [1, 2].map(id => ({ id, type: bossType, x: 5000, y: 3500,
    fixed: true, maxAlive: 1, respawn: 3600 }));
  const sim = new ZoneNpcSim(mapId, { w: 11000, h: 7000 }, camps);
  sim.jpcApplyHourBucket = () => {};
  const tick = sim.tick.bind(sim);
  sim.tick = function(dt) {
    tick(dt);
    if (this.testDone || this.players.size < 2) return;
    this.testDone = true;
    const [first, second] = [...this.players.keys()];
    const bosses = [...this.entries.values()].filter(e => e.type === bossType);
    for (let i = 0; i < bosses.length; i++) {
      const boss = bosses[i];
      const firstDamage = i === 0 ? 9950 : 8000;
      this.applyHit(first, { uid: boss.uid, dmg: firstDamage, variance: 0, critChance: 0, unlimitedRange: true });
      this.applyHit(second, { uid: boss.uid, dmg: 10000 - firstDamage, variance: 0, critChance: 0, unlimitedRange: true });
    }
  };
  return sim;
};
`);
  const reserve = createServer();
  reserve.listen(0, "127.0.0.1");
  await once(reserve, "listening");
  const port = reserve.address().port;
  await new Promise(resolve => reserve.close(resolve));
  const server = spawn(process.execPath, ["--import", pathToFileURL(fixture).href,
    fileURLToPath(new URL("./MULTI_SERVER.js", import.meta.url))], {
    cwd: temporary, env: { ...process.env, PORT: String(port) },
    windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
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
    assert.ok(basename(temporary).startsWith("orbit-boss-reward-"));
    await rm(temporary, { recursive: true, force: true });
  });
  const url = `http://127.0.0.1:${port}`;
  async function api(path, { token, body } = {}) {
    const response = await fetch(url + path, { method: body ? "POST" : "GET", headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { "content-type": "application/json" } : {}),
    }, body: body ? JSON.stringify(body) : undefined });
    assert.ok(response.ok, `${path}: ${response.status}; ${output}`);
    return response.json();
  }
  let ready = false;
  for (let i = 0; i < 80; i++) {
    try { ready = (await api("/api/ping")).ok; if (ready) break; } catch {}
    if (server.exitCode !== null) break;
    await pause(100);
  }
  assert.ok(ready, output);
  async function account(pseudo) {
    return api("/api/register", { body: { pseudo, email: `${pseudo}@example.test`, password: "isolated-password-123", faction: "mmo" } });
  }
  async function connect(account) {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    sockets.push(ws);
    const messages = [];
    ws.on("message", raw => messages.push(JSON.parse(String(raw))));
    await once(ws, "open");
    ws.send(JSON.stringify({ t: "hello", token: account.token, map: "1-1" }));
    const wait = async predicate => {
      const end = Date.now() + 5000;
      while (Date.now() < end) {
        const result = messages.find(predicate);
        if (result) return result;
        assert.equal(ws.readyState, WebSocket.OPEN, output);
        await pause(20);
      }
      assert.fail(`Message manquant : ${JSON.stringify(messages)}; ${output}`);
    };
    await wait(m => m.t === "welcome" && m.authed);
    return { messages, wait };
  }
  const firstAccount = await account("boss-first");
  const secondAccount = await account("boss-later");
  const first = await connect(firstAccount);
  const second = await connect(secondAccount);
  await second.wait(m => m.t === "npcReward" && m.percent === .5);
  await second.wait(m => m.t === "npcReward" && m.percent === 20);
  await first.wait(m => m.t === "npcReward" && m.percent === 80);
  const laterRewards = second.messages.filter(m => m.t === "npcReward");
  assert.equal(laterRewards.length, 2);
  const pool = resolveNpcReward(bossType);
  for (const reward of laterRewards) {
    assert.equal(reward.ownsKill, false, "le premier attaquant garde le crédit personnel du kill");
    assert.equal(reward.killer, `u_${firstAccount.user.id}`);
    assert.equal(reward.killerPseudo, "boss-first");
    assert.equal(reward.credits, Math.floor(pool.credits * reward.percent / 100));
    assert.equal(reward.exp, Math.floor(pool.exp * reward.percent / 100));
    assert.equal(reward.honor, Math.floor(pool.honor * reward.percent / 100));
    assert.ok(reward.credits > 0 && reward.exp > 0 && reward.honor > 0);
  }
  await pause(150); // Les journaux suivants ne doivent pas réattribuer les parts.
  assert.equal(second.messages.filter(m => m.t === "npcReward").length, 2);
  const saved = (await api("/api/me", { token: secondAccount.token })).user;
  const total = name => laterRewards.reduce((sum, reward) => sum + reward[name], 0);
  assert.equal(saved.credits, secondAccount.user.credits + total("credits"));
  assert.equal(saved.stats.exp, (Number(secondAccount.user.stats?.exp) || 0) + total("exp"));
  assert.equal(saved.stats.honor, (Number(secondAccount.user.stats?.honor) || 0) + total("honor"));
});
