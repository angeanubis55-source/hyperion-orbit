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

test("pseudo, P.E.T, email et mot de passe : délais, unicité, confirmations et déconnexion", { timeout: 60_000 }, async () => {
  const temporary = await mkdtemp(join(tmpdir(), "orbit-account-identity-"));
  const appPort = await freePort(), mailPort = await freePort(), mails = [];
  const mailServer = createServer((req, res) => {
    const chunks = []; req.on("data", chunk => chunks.push(chunk));
    req.on("end", () => { try { mails.push(JSON.parse(Buffer.concat(chunks).toString("utf8"))); } catch {}
      res.writeHead(200, { "content-type": "application/json" }); res.end('{"id":"mail-test"}'); });
  });
  mailServer.listen(mailPort, "127.0.0.1"); await once(mailServer, "listening");
  const child = spawn(process.execPath, [resolve("SCRIPTS/MULTI_SERVER.js")], { cwd: resolve(), windowsHide: true,
    env: { ...process.env, PORT: String(appPort), ORBIT_DATA_DIR: join(temporary, "data"),
      ORBIT_AUCTION_FILE: join(temporary, "auction_state.json"), ORBIT_MAIL_API_KEY: "test-key",
      ORBIT_MAIL_FROM: "Hyperion <noreply@hyperion.test>", ORBIT_MAIL_API_URL: `http://127.0.0.1:${mailPort}/emails`,
      ORBIT_PUBLIC_URL: `http://127.0.0.1:${appPort}` }, stdio: ["ignore", "pipe", "pipe"] });
  const origin = `http://127.0.0.1:${appPort}`;
  const api = async (path, body, token = "") => {
    const response = await fetch(origin + path, { method: body === undefined ? "GET" : "POST",
      headers: { ...(body === undefined ? {} : { "content-type": "application/json" }), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, ...(await response.json()) };
  };
  const signUp = async (pseudo, email) => {
    await api("/api/register", { pseudo, email, password: "password-initial-1", faction: "mmo" });
    assert.equal((await api("/api/auth/verify-email", { token: linkParam(mails.at(-1), "verify") })).ok, true);
    const login = await api("/api/login", { pseudoOrEmail: pseudo, password: "password-initial-1" });
    assert.ok(login.token, `${pseudo} doit pouvoir se connecter`);
    return login.token;
  };
  // Sauvegarde de jeu complète (le client contrôle tout le blob).
  const save = async (token, mutate) => {
    const me = (await api("/api/me", undefined, token)).user;
    const user = structuredClone(me); mutate(user); user.revision = Number(me.revision) + 1;
    return api("/api/save", { user, baseRevision: Number(me.revision) }, token);
  };
  try {
    await waitForServer(origin, child);
    let tokenA = await signUp("PiloteA", "a@identity-example.com");
    const tokenB = await signUp("PiloteB", "b@identity-example.com");

    // --- Pseudo : mot de passe, doublon, délai de 24 h ---
    assert.equal((await api("/api/account/pseudo", { value: "PiloteNeuf", currentPassword: "faux-password" }, tokenA)).status, 403);
    assert.equal((await api("/api/account/pseudo", { value: "PiloteB", currentPassword: "password-initial-1" }, tokenA)).status, 409);
    // Casse différente = autre pseudo : "PILOTEB" peut exister à côté de "PiloteB".
    const tokenC = await signUp("PILOTEB", "c@identity-example.com");
    assert.equal((await api("/api/me", undefined, tokenC)).user.pseudo, "PILOTEB");
    assert.equal((await api("/api/login", { pseudoOrEmail: "PiloteB", password: "password-initial-1" })).user.email, "b@identity-example.com");
    assert.equal((await api("/api/login", { pseudoOrEmail: "piloteB", password: "password-initial-1" })).status, 401, "pseudo ambigu : casse exacte requise");
    // Changer seulement la casse de son propre pseudo est permis.
    const tokenD = await signUp("pilotecase", "d@identity-example.com");
    assert.equal((await api("/api/account/pseudo", { value: "pilotecase", currentPassword: "password-initial-1" }, tokenD)).status, 400);
    assert.equal((await api("/api/account/pseudo", { value: "PiloteCase", currentPassword: "password-initial-1" }, tokenD)).user.pseudo, "PiloteCase");
    const renamed = await api("/api/account/pseudo", { value: "PiloteNeuf", currentPassword: "password-initial-1" }, tokenA);
    assert.equal(renamed.ok, true); assert.equal(renamed.user.pseudo, "PiloteNeuf");
    const again = await api("/api/account/pseudo", { value: "PiloteEncore", currentPassword: "password-initial-1" }, tokenA);
    assert.equal(again.status, 429); assert.ok(again.nextAt > Date.now() + 23 * 3600_000);
    assert.ok((await api("/api/account/status", undefined, tokenA)).pseudoNextAt > Date.now());

    // --- La sauvegarde de jeu ne peut changer ni pseudo, ni email, ni mot de passe ---
    assert.equal((await save(tokenA, u => { u.pseudo = "Pirate"; u.email = "pirate@identity-example.com"; u.password = "password-pirate-1"; })).ok, true);
    const afterSave = (await api("/api/me", undefined, tokenA)).user;
    assert.equal(afterSave.pseudo, "PiloteNeuf"); assert.equal(afterSave.email, "a@identity-example.com");
    assert.equal((await api("/api/login", { pseudoOrEmail: "PiloteNeuf", password: "password-pirate-1" })).status, 401);

    // --- P.E.T : crédits serveur, doublon, délai, verrou de la sauvegarde ---
    assert.equal((await api("/api/account/pet-pseudo", { value: "Brutus" }, tokenA)).error, "P.E.T non possédé.");
    for (const token of [tokenA, tokenB]) assert.equal((await save(token, u => { u.pet = { owned: true, pseudo: "REX" }; u.credits = 5_000_000; })).ok, true);
    const pet = await api("/api/account/pet-pseudo", { value: "Brutus" }, tokenA);
    assert.equal(pet.ok, true); assert.equal(pet.user.pet.pseudo, "Brutus"); assert.equal(pet.user.credits, 4_000_000);
    assert.equal((await api("/api/account/pet-pseudo", { value: "Brutus2" }, tokenA)).status, 429);
    assert.equal((await api("/api/account/pet-pseudo", { value: "brutus" }, tokenB)).status, 409);
    await save(tokenA, u => { u.pet.pseudo = "Triche"; });
    assert.equal((await api("/api/me", undefined, tokenA)).user.pet.pseudo, "Brutus");

    // --- Email : ancienne adresse, doublon, double confirmation, déconnexion ---
    const emailBody = { oldEmail: "a@identity-example.com", value: "nouvelle@identity-example.com", currentPassword: "password-initial-1" };
    assert.equal((await api("/api/account/email", { ...emailBody, oldEmail: "autre@identity-example.com" }, tokenA)).status, 400);
    assert.equal((await api("/api/account/email", { ...emailBody, value: "b@identity-example.com" }, tokenA)).status, 409);
    const asked = await api("/api/account/email", emailBody, tokenA);
    assert.equal(asked.ok, true); assert.equal(asked.step, "old");
    assert.deepEqual(mails.at(-1).to, ["a@identity-example.com"]);
    assert.ok((await api("/api/account/status", undefined, tokenA)).emailPending);
    const oldStep = await api("/api/auth/email-change-old", { token: linkParam(mails.at(-1), "emailOld") });
    assert.equal(oldStep.ok, true); assert.deepEqual(mails.at(-1).to, ["nouvelle@identity-example.com"]);
    assert.equal((await api("/api/session", undefined, tokenA)).status, 200, "toujours connecté avant la 2e confirmation");
    const newToken = linkParam(mails.at(-1), "emailNew");
    assert.equal((await api("/api/auth/email-change-new", { token: newToken })).ok, true);
    assert.equal((await api("/api/auth/email-change-new", { token: newToken })).ok, false, "lien à usage unique");
    assert.equal((await api("/api/session", undefined, tokenA)).status, 401, "déconnecté après le changement d'email");
    const relog = await api("/api/login", { pseudoOrEmail: "nouvelle@identity-example.com", password: "password-initial-1" });
    assert.ok(relog.token); tokenA = relog.token;

    // --- Mot de passe : lien envoyé à l'adresse du compte, puis déconnexion ---
    const link = await api("/api/account/password", {}, tokenA);
    assert.equal(link.ok, true); assert.deepEqual(mails.at(-1).to, ["nouvelle@identity-example.com"]);
    assert.equal((await api("/api/auth/reset-password", { token: linkParam(mails.at(-1), "reset"), password: "password-final-22" })).ok, true);
    assert.equal((await api("/api/session", undefined, tokenA)).status, 401, "déconnecté après le changement de mot de passe");
    assert.ok((await api("/api/login", { pseudoOrEmail: "PiloteNeuf", password: "password-final-22" })).token);
  } finally {
    child.kill(); await Promise.race([once(child, "exit"), new Promise(done => setTimeout(done, 2000))]);
    await new Promise(done => mailServer.close(done)); await rm(temporary, { recursive: true, force: true });
  }
});
