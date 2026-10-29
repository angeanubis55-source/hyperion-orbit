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

test("inscription confirmée, identifiant oublié et réinitialisation sécurisée", { timeout: 30_000 }, async () => {
  const temporary = await mkdtemp(join(tmpdir(), "orbit-account-auth-"));
  const appPort = await freePort(), mailPort = await freePort(), mails = [];
  const mailServer = createServer((req, res) => {
    const chunks = []; req.on("data", chunk => chunks.push(chunk));
    req.on("end", () => { try { mails.push(JSON.parse(Buffer.concat(chunks).toString("utf8"))); } catch {}
      res.writeHead(200, { "content-type": "application/json" }); res.end('{"id":"mail-test"}'); });
  });
  mailServer.listen(mailPort, "127.0.0.1"); await once(mailServer, "listening");
  const child = spawn(process.execPath, [resolve("SCRIPTS/MULTI_SERVER.js")], { cwd: resolve(), windowsHide: true,
    env: { ...process.env, PORT: String(appPort), ORBIT_DATA_DIR: join(temporary, "data"), ORBIT_MAIL_API_KEY: "test-key",
      ORBIT_MAIL_FROM: "Hyperion <noreply@hyperion.test>", ORBIT_MAIL_API_URL: `http://127.0.0.1:${mailPort}/emails`,
      ORBIT_PUBLIC_URL: `http://127.0.0.1:${appPort}` }, stdio: ["ignore", "pipe", "pipe"] });
  const origin = `http://127.0.0.1:${appPort}`;
  const api = async (path, body, token = "") => {
    const response = await fetch(origin + path, { method: body === undefined ? "GET" : "POST",
      headers: { ...(body === undefined ? {} : { "content-type": "application/json" }), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, ...(await response.json()) };
  };
  try {
    await waitForServer(origin, child);
    for (const route of ["/login", "/register", "/game"]) {
      const page = await fetch(origin + route);
      assert.equal(page.status, 200, `${route} doit être une route publique valide`);
      assert.match(page.headers.get("content-type") || "", /text\/html/);
      if (route !== "/game") assert.match(await page.text(), /src="\/PUBLIC\/AUTH\.js"/);
    }
    const legacyAuth = await fetch(origin + "/PUBLIC/AUTH.html?reset=test", { redirect: "manual" });
    assert.equal(legacyAuth.status, 308);
    assert.equal(legacyAuth.headers.get("location"), "/login?reset=test");
    const legacyGame = await fetch(origin + "/index.html", { redirect: "manual" });
    assert.equal(legacyGame.status, 308);
    assert.equal(legacyGame.headers.get("location"), "/game");
    const registration = await api("/api/register", { pseudo: "PiloteRecup", email: "pilote@auth-example.com", password: "ancien-password-123", faction: "mmo" });
    assert.equal(registration.status, 202); assert.equal(registration.pendingVerification, true); assert.equal(registration.token, undefined);
    assert.equal((await api("/api/login", { pseudoOrEmail: "PiloteRecup", password: "ancien-password-123" })).code, "EMAIL_UNVERIFIED");
    assert.equal(mails.length, 1);
    const verify = new URL(mails[0].text.match(/https?:\/\/\S+/)[0]).searchParams.get("verify");
    assert.ok(verify); assert.equal((await api("/api/auth/verify-email", { token: verify })).ok, true);
    assert.equal((await api("/api/auth/verify-email", { token: verify })).ok, false);
    const login = await api("/api/login", { pseudoOrEmail: "PiloteRecup", password: "ancien-password-123" }); assert.ok(login.token);
    const unknownUser = await api("/api/auth/forgot-username", { email: "absent@auth-example.com" });
    const knownUser = await api("/api/auth/forgot-username", { email: "pilote@auth-example.com" });
    assert.equal(unknownUser.message, knownUser.message); assert.match(mails.at(-1).text, /PiloteRecup/);
    const unknownPassword = await api("/api/auth/forgot-password", { email: "absent@auth-example.com" });
    const knownPassword = await api("/api/auth/forgot-password", { email: "pilote@auth-example.com" });
    assert.equal(unknownPassword.message, knownPassword.message);
    const reset = new URL(mails.at(-1).text.match(/https?:\/\/\S+/)[0]).searchParams.get("reset"); assert.ok(reset);
    assert.equal((await api("/api/auth/reset-password", { token: reset, password: "nouveau-password-456" })).ok, true);
    assert.equal((await api("/api/me", undefined, login.token)).status, 401);
    assert.equal((await api("/api/login", { pseudoOrEmail: "PiloteRecup", password: "ancien-password-123" })).status, 401);
    assert.ok((await api("/api/login", { pseudoOrEmail: "PiloteRecup", password: "nouveau-password-456" })).token);
    assert.equal((await api("/api/auth/reset-password", { token: reset, password: "encore-password-789" })).ok, false);
  } finally {
    child.kill(); await Promise.race([once(child, "exit"), new Promise(done => setTimeout(done, 2000))]);
    await new Promise(done => mailServer.close(done)); await rm(temporary, { recursive: true, force: true });
  }
});
