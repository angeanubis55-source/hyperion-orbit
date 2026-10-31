import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer as createNetServer } from "node:net";

async function freePort() {
  const server = createNetServer(); server.listen(0, "127.0.0.1"); await once(server, "listening");
  const port = server.address().port; await new Promise(done => server.close(done)); return port;
}
async function waitForServer(url, child) {
  for (let i = 0; i < 80; i++) {
    if (child.exitCode != null) throw new Error(`serveur arrêté (${child.exitCode})`);
    try { if ((await fetch(`${url}/api/ping`)).ok) return; } catch {}
    await new Promise(done => setTimeout(done, 100));
  }
  throw new Error("serveur indisponible");
}
const linkParam = (mail, key) => new URL(mail.text.match(/https?:\/\/\S+/)[0]).searchParams.get(key);

test("panneau admin : inventaire, objets, actions de compte, journaux et statistiques", { timeout: 60_000 }, async () => {
  const temporary = await mkdtemp(join(tmpdir(), "orbit-admin-tools-"));
  const appPort = await freePort(), mailPort = await freePort(), mails = [];
  const mailServer = createServer((req, res) => {
    const chunks = []; req.on("data", chunk => chunks.push(chunk));
    req.on("end", () => { try { mails.push(JSON.parse(Buffer.concat(chunks).toString("utf8"))); } catch {}
      res.writeHead(200, { "content-type": "application/json" }); res.end('{"id":"mail-test"}'); });
  });
  mailServer.listen(mailPort, "127.0.0.1"); await once(mailServer, "listening");
  const child = spawn(process.execPath, [resolve("SCRIPTS/MULTI_SERVER.js")], { cwd: resolve(), windowsHide: true,
    env: { ...process.env, PORT: String(appPort), ORBIT_DATA_DIR: join(temporary, "data"), ORBIT_ADMIN_PASS: "admin-test-pass",
      ORBIT_AUCTION_FILE: join(temporary, "auction_state.json"), ORBIT_MAIL_API_KEY: "test-key",
      ORBIT_MAIL_FROM: "Hyperion <noreply@hyperion.test>", ORBIT_MAIL_API_URL: `http://127.0.0.1:${mailPort}/emails`,
      ORBIT_PUBLIC_URL: `http://127.0.0.1:${appPort}` }, stdio: ["ignore", "pipe", "pipe"] });
  const origin = `http://127.0.0.1:${appPort}`;
  const api = async (path, body) => {
    const response = await fetch(origin + path, { method: body === undefined ? "GET" : "POST",
      headers: { "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, ...(await response.json()) };
  };
  const admin = async (path, body) => {
    const response = await fetch(origin + path, { method: body === undefined ? "GET" : "POST",
      headers: { "content-type": "application/json", "x-admin-token": "admin-test-pass" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, ...(await response.json()) };
  };
  try {
    await waitForServer(origin, child);
    await api("/api/register", { pseudo: "PiloteAdmin", email: "pilote@admin-example.com", password: "password-initial-1", faction: "mmo" });
    assert.equal((await api("/api/auth/verify-email", { token: linkParam(mails.at(-1), "verify") })).ok, true);
    assert.ok((await api("/api/login", { pseudoOrEmail: "PiloteAdmin", password: "password-initial-1" })).token);
    const id = "PiloteAdmin";

    assert.equal((await fetch(`${origin}/api/admin/inventory?id=${id}`)).status, 401, "mot de passe admin requis");
    const catalog = await admin("/api/admin/catalog");
    assert.ok(catalog.items.some(item => item.id === "laser_lf1") && catalog.resources.length > 0 && catalog.ammo.length > 0);

    const before = await admin(`/api/admin/inventory?id=${id}`);
    assert.equal(before.ok, true);
    assert.equal(before.password, undefined); assert.equal(before.password_hash, undefined);
    assert.notEqual(before.email, "pilote@admin-example.com", "email masqué");

    // Don : effet d'un achat, crédits du joueur intacts.
    const given = await admin("/api/admin/give-item", { id, itemId: "laser_lf1", quantity: 3 });
    assert.equal(given.ok, true, given.error);
    let inv = await admin(`/api/admin/inventory?id=${id}`);
    assert.equal(inv.counts.laser_lf1, 3); assert.equal(inv.credits, before.credits);
    assert.equal((await admin("/api/admin/give-item", { id, itemId: "ship_aegis" })).ok, true);
    inv = await admin(`/api/admin/inventory?id=${id}`);
    assert.ok(inv.ships.includes("aegis") && inv.hangars.some(h => h.shipId === "aegis"), "vaisseau donné avec son hangar");
    assert.equal((await admin("/api/admin/give-item", { id, itemId: "inconnu" })).ok, false);

    // Stocks et retraits.
    assert.equal((await admin("/api/admin/adjust-stock", { id, kind: "resource", key: "palladium", delta: 50 })).after, 50);
    assert.equal((await admin("/api/admin/adjust-stock", { id, kind: "resource", key: "palladium", delta: -100 })).after, 0, "jamais négatif");
    assert.equal((await admin("/api/admin/adjust-stock", { id, kind: "count", key: "laser_lf1", delta: -3 })).after, 0);
    assert.equal((await admin("/api/admin/adjust-stock", { id, kind: "inconnu", key: "x", delta: 1 })).ok, false);
    assert.equal((await admin("/api/admin/remove-owned", { id, kind: "ship", key: "aegis" })).ok, true);
    const activeShip = inv.hangars.find(h => h.active)?.shipId;
    assert.equal((await admin("/api/admin/remove-owned", { id, kind: "ship", key: activeShip })).ok, false, "vaisseau actif protégé");

    // Compte : firme, base, pseudo, mot de passe.
    assert.equal((await admin("/api/admin/set-faction", { id, faction: "eic" })).faction, "eic");
    assert.equal((await admin("/api/admin/teleport-home", { id })).map, "2-1");
    assert.equal((await admin("/api/admin/rename", { id, value: "PiloteRenomme" })).pseudo, "PiloteRenomme");
    const reset = await admin("/api/admin/reset-password", { id: "PiloteRenomme" });
    assert.equal(reset.ok, true);
    assert.equal((await api("/api/login", { pseudoOrEmail: "PiloteRenomme", password: "password-initial-1" })).token, undefined, "ancien mot de passe refusé");
    assert.ok((await api("/api/login", { pseudoOrEmail: "PiloteRenomme", password: reset.password })).token, "mot de passe temporaire accepté");

    // Journaux et statistiques.
    const history = await admin("/api/admin/admin-log");
    assert.ok(history.list.some(row => row.action === "give-item" && row.ok));
    assert.ok(history.list.some(row => row.action === "remove-owned" && !row.ok), "échecs enregistrés aussi");
    assert.ok(!JSON.stringify(history.list).includes(reset.password), "le mot de passe temporaire n'est jamais journalisé");
    assert.ok((await admin("/api/admin/server-log")).lines.some(line => line.text.includes("[multi]")));
    const playerLogs = await admin("/api/admin/player-logs?id=PiloteRenomme");
    assert.equal(playerLogs.ok, true); assert.deepEqual(playerLogs.logs, []);
    const stats = await admin("/api/admin/stats");
    assert.equal(stats.accounts, 1); assert.equal(stats.factions.eic, 1);
  } finally {
    child.kill(); await Promise.race([once(child, "exit"), new Promise(done => setTimeout(done, 2000))]);
    await new Promise(done => mailServer.close(done)); await rm(temporary, { recursive: true, force: true });
  }
});
