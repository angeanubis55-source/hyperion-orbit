// API et SQLite éphémères : aucun compte réel n'est modifié.
import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:net";
import { once } from "node:events";

test("API sauvegarde : référence périmée refusée et réponse perdue acquittée une seule fois", { timeout: 20000 }, async t => {
  const temporary = await mkdtemp(join(tmpdir(), "orbit-account-save-"));
  const reserve = createServer(); reserve.listen(0, "127.0.0.1"); await once(reserve, "listening");
  const port = reserve.address().port; await new Promise(resolve => reserve.close(resolve));
  const server = spawn(process.execPath, [fileURLToPath(new URL("./MULTI_SERVER.js", import.meta.url))], {
    cwd: temporary, windowsHide: true, env: { ...process.env, PORT: String(port) }, stdio: ["ignore", "pipe", "pipe"],
  });
  let output = ""; server.stdout.on("data", c => { output += c; }); server.stderr.on("data", c => { output += c; });
  t.after(async () => {
    const stopped = server.exitCode === null ? once(server, "exit") : Promise.resolve(); server.kill(); await stopped;
    assert.equal(dirname(resolve(temporary)), resolve(tmpdir())); assert.ok(basename(temporary).startsWith("orbit-account-save-"));
    await rm(temporary, { recursive: true, force: true });
  });
  const url = `http://127.0.0.1:${port}`;
  const api = async (path, { token, body } = {}) => {
    const response = await fetch(url + path, { method: body ? "POST" : "GET", headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { "content-type": "application/json" } : {}),
    }, body: body ? JSON.stringify(body) : undefined });
    return { status: response.status, ...await response.json() };
  };
  let ready = false;
  for (let i = 0; i < 80; i++) {
    try { ready = (await api("/api/ping")).ok; if (ready) break; } catch {}
    if (server.exitCode !== null) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(ready, output);
  const registered = await api("/api/register", { body: { pseudo: "account-save-test", email: "save@example.test", password: "isolated-password-123", faction: "mmo" } });
  assert.equal(registered.status, 200); const { token, user } = registered;
  const save = body => api("/api/save", { token, body });
  const other = await save({ user: { ...user, revision: user.revision + 10, credits: user.credits + 1000 }, baseRevision: user.revision, saveId: "other-writer" });
  assert.equal(other.ok, true);
  const stale = await save({ user: { ...user, revision: other.user.revision + 999, credits: user.credits - 3_000_000 }, baseRevision: user.revision, saveId: "stale" });
  assert.equal(stale.status, 409); assert.equal(stale.stale, true); assert.equal(stale.user.credits, user.credits + 1000);
  const purchase = { user: { ...other.user, revision: other.user.revision + 1, credits: other.user.credits - 3_000_000,
    pilotSkills: { disks: 10, points: 0, spent: {}, resets: 0 } }, baseRevision: other.user.revision, saveId: "purchase-with-lost-response" };
  const accepted = await save(purchase); assert.equal(accepted.ok, true);
  const reward = await save({ user: { ...accepted.user, revision: accepted.user.revision + 1, credits: accepted.user.credits + 500 },
    baseRevision: accepted.user.revision, saveId: "later-reward" });
  assert.equal(reward.ok, true);
  const duplicate = await save(purchase);
  assert.equal(duplicate.ok, true); assert.equal(duplicate.duplicate, true);
  assert.deepEqual(duplicate.user, accepted.user, "le reçu confirme précisément le snapshot initial, pas un état plus récent");
  const current = await api("/api/me", { token });
  assert.equal(current.user.credits, user.credits + 1000 - 3_000_000 + 500);
  assert.equal(current.user.pilotSkills.disks, 10); assert.equal(current.user.revision, reward.user.revision);
  const reused = await save({ ...purchase, user: { ...purchase.user, credits: 0 } });
  assert.equal(reused.status, 409); assert.match(reused.error, /contenu différent/);
  const otherAccount = await api("/api/register", { body: { pseudo: "account-save-other", email: "other@example.test", password: "isolated-password-123", faction: "eic" } });
  const forbidden = await api("/api/save", { token: otherAccount.token, body: purchase });
  assert.equal(forbidden.status, 403, "un reçu n'autorise jamais une autre identité à acquitter le compte");

  const compactSnapshot = { ...current.user, revision: current.user.revision + 1,
    inventory: { ...current.user.inventory, shipModules: Array.from({ length: 3000 }, (_, i) => ({
      id: `module-${i}`, bonuses: [{ stat: "damage", pct: i % 20 }], description: "module".repeat(40),
    })) } };
  const compactBody = { user: compactSnapshot, baseRevision: current.user.revision, saveId: "compact-modules", compactSave: true };
  const compact = await save(compactBody);
  assert.equal(compact.ok, true); assert.equal(compact.snapshotAccepted, true);
  assert.equal(compact.saveId, compactBody.saveId); assert.equal(compact.user.inventory, undefined);
  assert.ok(JSON.stringify(compact).length < 2000, "le recu ne renvoie pas les 3000 modules");
  const reconstructed = { ...compactSnapshot, ...compact.user };
  assert.deepEqual((await api("/api/me", { token })).user, reconstructed);
  const later = await save({ user: { ...reconstructed, revision: reconstructed.revision + 1, credits: reconstructed.credits + 50 },
    baseRevision: reconstructed.revision, saveId: "after-compact" });
  assert.equal(later.ok, true);
  const compactDuplicate = await save(compactBody);
  assert.equal(compactDuplicate.duplicate, true); assert.equal(compactDuplicate.snapshotAccepted, true);
  assert.deepEqual(compactDuplicate.user, compact.user, "la reponse perdue acquitte le recu initial");
  const fullDuplicate = await save({ ...compactBody, compactSave: false });
  assert.deepEqual(fullDuplicate.user, reconstructed, "les anciens clients recoivent encore le compte complet");
  const compactStale = await save({ ...compactBody, saveId: "compact-stale" });
  assert.equal(compactStale.status, 409); assert.equal(compactStale.snapshotAccepted, undefined);
  assert.equal(compactStale.user.inventory.shipModules.length, 3000, "un conflit renvoie toujours le canon complet");
});
