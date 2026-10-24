import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:net";
import { once } from "node:events";

test("ticket tirage module : craft 3 Mds puis tirage hors quota", { timeout: 60000 }, async t => {
  const temporary = await mkdtemp(join(tmpdir(), "orbit-module-ticket-"));
  const reserve = createServer(); reserve.listen(0, "127.0.0.1"); await once(reserve, "listening");
  const port = reserve.address().port; await new Promise(done => reserve.close(done));
  const server = spawn(process.execPath, [fileURLToPath(new URL("./MULTI_SERVER.js", import.meta.url))], {
    cwd: temporary, windowsHide: true, env: { ...process.env, PORT: String(port) }, stdio: ["ignore", "pipe", "pipe"],
  });
  let output = ""; server.stdout.on("data", chunk => { output += chunk; }); server.stderr.on("data", chunk => { output += chunk; });
  t.after(async () => {
    const stopped = server.exitCode === null ? once(server, "exit") : Promise.resolve(); server.kill(); await stopped;
    assert.equal(dirname(resolve(temporary)), resolve(tmpdir()));
    assert.ok(basename(temporary).startsWith("orbit-module-ticket-"));
    await rm(temporary, { recursive: true, force: true });
  });
  const baseUrl = `http://127.0.0.1:${port}`;
  const api = async (path, { token, body } = {}) => {
    const response = await fetch(baseUrl + path, { method: body ? "POST" : "GET", headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { "content-type": "application/json" } : {}),
    }, body: body ? JSON.stringify(body) : undefined });
    return { status: response.status, ...await response.json() };
  };
  let ready = false;
  for (let i = 0; i < 80; i++) {
    try { ready = (await api("/api/ping")).ok; if (ready) break; } catch {}
    if (server.exitCode !== null) break;
    await new Promise(done => setTimeout(done, 100));
  }
  assert.ok(ready, output);

  const registered = await api("/api/register", { body: {
    pseudo: "ticket-test", email: "ticket@example.test", password: "isolated-password-123", faction: "mmo",
  } });
  assert.equal(registered.status, 200);
  const { token } = registered;

  // Fonds pour 20 tirages (20M) + craft 3 Mds + débris NPC requis.
  const funded = await api("/api/save", { token, body: {
    user: { ...registered.user, credits: 10_000_000_000,
      inventory: { ...registered.user.inventory, resources: { ...(registered.user.inventory?.resources || {}), npc_debris: 5000 } },
      revision: registered.user.revision + 1 },
    baseRevision: registered.user.revision, saveId: "fund-ticket-test",
  } });
  assert.equal(funded.status, 200);

  // 20 tirages crédits OK (quota 20/jour).
  for (let i = 0; i < 20; i++) {
    const rolled = await api("/api/modules", { token, body: { action: "roll" } });
    assert.equal(rolled.status, 200, `tirage ${i + 1} refusé : ${rolled.error}`);
    assert.ok(rolled.module?.id);
    assert.equal(rolled.payment?.type, "credits");
  }
  // 21e refusé : quota épuisé, sans ticket.
  const blocked = await api("/api/modules", { token, body: { action: "roll" } });
  assert.equal(blocked.status, 409);

  // Craft du ticket à 3 Mds.
  const before = await api("/api/me", { token });
  const crafted = await api("/api/production", { token, body: { action: "craft", recipeId: "craft_ticket_roll", quantity: 1 } });
  assert.equal(crafted.status, 200, `craft refusé : ${crafted.error}`);
  const afterCraft = await api("/api/me", { token });
  assert.equal(afterCraft.user.inventory.counts.ticket_module_roll, 1);
  assert.equal(afterCraft.user.credits, before.user.credits - 3_000_000_000);

  // Tirage supplémentaire au ticket : OK, paiement ticket, quota inchangé.
  const extra = await api("/api/modules", { token, body: { action: "roll" } });
  assert.equal(extra.status, 200, `tirage ticket refusé : ${extra.error}`);
  assert.ok(extra.module?.id);
  assert.equal(extra.payment?.type, "ticket");
  const afterRoll = await api("/api/me", { token });
  assert.equal(afterRoll.user.inventory.counts.ticket_module_roll || 0, 0, "ticket consommé");
  assert.equal(afterRoll.user.stats.moduleDailyRolls.count, 20, "quota intact");
  assert.equal(afterRoll.user.inventory.shipModules.length, 21);

  // Sans ticket : de nouveau refusé.
  const blocked2 = await api("/api/modules", { token, body: { action: "roll" } });
  assert.equal(blocked2.status, 409);
});

test("relance modules : choix explicite crédits ou ticket", { timeout: 60000 }, async t => {
  const temporary = await mkdtemp(join(tmpdir(), "orbit-module-reroll-"));
  const reserve = createServer(); reserve.listen(0, "127.0.0.1"); await once(reserve, "listening");
  const port = reserve.address().port; await new Promise(done => reserve.close(done));
  const server = spawn(process.execPath, [fileURLToPath(new URL("./MULTI_SERVER.js", import.meta.url))], {
    cwd: temporary, windowsHide: true, env: { ...process.env, PORT: String(port) }, stdio: ["ignore", "pipe", "pipe"],
  });
  let output = ""; server.stdout.on("data", chunk => { output += chunk; }); server.stderr.on("data", chunk => { output += chunk; });
  t.after(async () => {
    const stopped = server.exitCode === null ? once(server, "exit") : Promise.resolve(); server.kill(); await stopped;
    assert.equal(dirname(resolve(temporary)), resolve(tmpdir()));
    assert.ok(basename(temporary).startsWith("orbit-module-reroll-"));
    await rm(temporary, { recursive: true, force: true });
  });
  const baseUrl = `http://127.0.0.1:${port}`;
  const api = async (path, { token, body } = {}) => {
    const response = await fetch(baseUrl + path, { method: body ? "POST" : "GET", headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { "content-type": "application/json" } : {}),
    }, body: body ? JSON.stringify(body) : undefined });
    return { status: response.status, ...await response.json() };
  };
  let ready = false;
  for (let i = 0; i < 80; i++) {
    try { ready = (await api("/api/ping")).ok; if (ready) break; } catch {}
    if (server.exitCode !== null) break;
    await new Promise(done => setTimeout(done, 100));
  }
  assert.ok(ready, output);

  const registered = await api("/api/register", { body: {
    pseudo: "reroll-test", email: "reroll@example.test", password: "isolated-password-123", faction: "mmo",
  } });
  assert.equal(registered.status, 200);
  const { token } = registered;
  const funded = await api("/api/save", { token, body: {
    user: { ...registered.user, credits: 10_000_000_000, revision: registered.user.revision + 1 },
    baseRevision: registered.user.revision, saveId: "fund-reroll-test",
  } });
  assert.equal(funded.status, 200);

  const rolled = await api("/api/modules", { token, body: { action: "roll" } });
  assert.equal(rolled.status, 200);
  const moduleId = rolled.module.id;

  // 1 ticket de relance en stock.
  const bought = await api("/api/shop/buy", { token, body: { itemId: "ticket_module_reroll", quantity: 1 } });
  assert.equal(bought.status, 200);
  const withTicket = await api("/api/me", { token });

  // Relance FORCÉE en crédits malgré le ticket : crédits -5M, ticket gardé.
  const r1 = await api("/api/modules", { token, body: { action: "reroll", moduleId, payWith: "credits" } });
  assert.equal(r1.status, 200, `reroll crédits refusé : ${r1.error}`);
  assert.equal(r1.payment?.type, "credits");
  assert.equal(r1.module.rerolls, 1);
  const afterCredits = await api("/api/me", { token });
  assert.equal(afterCredits.user.inventory.counts.ticket_module_reroll, 1, "ticket conservé");
  assert.equal(afterCredits.user.credits, withTicket.user.credits - 5_000_000);

  // Relance FORCÉE au ticket : ticket consommé, crédits intacts.
  const r2 = await api("/api/modules", { token, body: { action: "reroll", moduleId: r1.module.id, payWith: "ticket" } });
  assert.equal(r2.status, 200, `reroll ticket refusé : ${r2.error}`);
  assert.equal(r2.payment?.type, "ticket");
  assert.equal(r2.module.rerolls, 2);
  const afterTicket = await api("/api/me", { token });
  assert.equal(afterTicket.user.inventory.counts.ticket_module_reroll || 0, 0, "ticket consommé");
  assert.equal(afterTicket.user.credits, afterCredits.user.credits);

  // Ticket exigé mais absent : refus net (pas de bascule silencieuse en crédits).
  const r3 = await api("/api/modules", { token, body: { action: "reroll", moduleId: r2.module.id, payWith: "ticket" } });
  assert.equal(r3.status, 409);
});
