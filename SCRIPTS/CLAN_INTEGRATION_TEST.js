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

test("clan : banque, annonce, stats des membres et classement", { timeout: 60000 }, async t => {
  const temporary = await mkdtemp(join(tmpdir(), "orbit-clan-"));
  // Bases de Combat de départ : 1-3 tenue par TST (laser + HON + EXP actifs,
  // DMG en installation), chantier TST sur 2-3, 1-4 tenue par un autre clan.
  const part = (resourceId, extra = {}) => ({ resourceId, clan: "TST", pseudo: "ClanChef", userId: "x", cooldownUntil: 0, ...extra });
  await mkdir(join(temporary, "SERVER_DATA"), { recursive: true });
  await writeFile(join(temporary, "SERVER_DATA", "station_state.json"), JSON.stringify({ stations: {
    "1-3": { instances: { TST: { hub: part("station_core"), slots: {
      emplacement1: part("station_laser_1"), emplacement2: part("station_module_hon"),
      emplacement3: part("station_module_exp"), emplacement4: part("station_module_dmg", { cooldownUntil: Date.now() + 3_600_000 }),
    } } }, built: { clan: "TST", firm: "mmo" }, owner: { clan: "TST", firm: "mmo" }, builtAt: Date.now() - 86_400_000 },
    "2-3": { instances: { TST: { hub: part("station_core"), slots: {} } } },
    "1-4": { instances: { OMB: { hub: { ...part("station_core"), clan: "OMB" }, slots: {} } }, built: { clan: "OMB", firm: "eic" }, owner: { clan: "OMB", firm: "eic" } },
  } }));
  const reserve = createServer();
  reserve.listen(0, "127.0.0.1");
  await once(reserve, "listening");
  const port = reserve.address().port;
  await new Promise(resolve => reserve.close(resolve));
  const password = "isolated-clan-test";
  const server = spawn(process.execPath, [fileURLToPath(new URL("./MULTI_SERVER.js", import.meta.url))], {
    cwd: temporary, windowsHide: true,
    env: { ...process.env, PORT: String(port), ORBIT_ADMIN_PASS: password },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  server.stdout.on("data", chunk => { output += chunk; });
  server.stderr.on("data", chunk => { output += chunk; });
  t.after(async () => {
    const stopped = server.exitCode === null ? once(server, "exit") : Promise.resolve();
    server.kill();
    await stopped;
    assert.equal(dirname(resolve(temporary)), resolve(tmpdir()));
    assert.ok(basename(temporary).startsWith("orbit-clan-"));
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
    assert.equal(result.ok, true, `${path}: ${JSON.stringify(result)} ${output.slice(-500)}`);
    return result;
  };
  for (let i = 0; i < 80; i++) {
    try { if ((await fetch(url + "/api/ping")).ok) break; } catch {}
    await pause(100);
  }
  const register = async pseudo => (await ok("/api/register", {
    body: { pseudo, email: `${pseudo}@example.test`, password: "test-password-123", faction: "mmo" },
  })).token;
  const chief = await register("ClanChef");
  const pilot = await register("ClanPilote");
  const credits = async token => Number((await ok("/api/me", { token })).user.credits) || 0;
  const give = async (pseudo, amount) => {
    const response = await fetch(url + "/api/admin/give", {
      method: "POST", headers: { "content-type": "application/json", "x-admin-token": password },
      body: JSON.stringify({ pseudo, amount }),
    });
    assert.equal(response.status, 200, await response.text());
  };
  await give("ClanChef", 2_000_000 - await credits(chief));
  await give("ClanPilote", 100_000 - await credits(pilot));

  const longTag = await call("/api/clans", { token: chief, body: { name: "Trop long", tag: "TROPLONG" } });
  assert.equal(longTag.ok, false);
  assert.match(longTag.error, /5 caractères/);
  const created = await ok("/api/clans", { token: chief, body: { name: "Les Testeurs", tag: "TST", description: "Clan de test" } });
  assert.equal(created.clan.tag, "TST");
  assert.equal(await credits(chief), 1_700_000);
  await ok("/api/clans/apply", { token: pilot, body: { tag: "TST" } });
  await ok("/api/clans/accept", { token: chief, body: { pseudo: "ClanPilote" } });

  // Stats des membres + droits renvoyés avec la fiche.
  let me = (await ok("/api/clans/me", { token: chief })).clan;
  assert.equal(me.members.length, 2);
  for (const member of me.members) {
    for (const key of ["rankPoints", "honor", "exp", "npcKills", "pvpKills", "lastSeen", "joinedAt"]) assert.equal(typeof member[key], "number", key);
    assert.equal(typeof member.online, "boolean");
  }
  assert.equal(me.rights.bank, true);
  assert.equal((await ok("/api/clans/me", { token: pilot })).clan.rights.bank, false);

  // Dépôts : débit du compte, solde de banque, refus sans fonds.
  const deposit = await ok("/api/clans/bank/deposit", { token: chief, body: { amount: 500_000 } });
  assert.equal(deposit.bank, 500_000);
  assert.equal(deposit.user.credits, 1_200_000);
  assert.equal(await credits(chief), 1_200_000);
  await ok("/api/clans/bank/deposit", { token: pilot, body: { amount: 40_000 } });
  assert.equal(await credits(pilot), 60_000);
  const broke = await call("/api/clans/bank/deposit", { token: pilot, body: { amount: 1_000_000 } });
  assert.equal(broke.ok, false);
  assert.equal(await credits(pilot), 60_000);
  assert.equal((await call("/api/clans/bank/deposit", { token: pilot, body: { amount: -5 } })).ok, false);

  // Distribution : droit Banque requis, solde suffisant, crédité au membre.
  const denied = await call("/api/clans/bank/withdraw", { token: pilot, body: { pseudo: "ClanPilote", amount: 10_000 } });
  assert.equal(denied.status, 403);
  const tooMuch = await call("/api/clans/bank/withdraw", { token: chief, body: { pseudo: "ClanPilote", amount: 999_999_999 } });
  assert.equal(tooMuch.ok, false);
  const sent = await ok("/api/clans/bank/withdraw", { token: chief, body: { pseudo: "ClanPilote", amount: 150_000 } });
  assert.equal(sent.bank, 390_000);
  assert.equal(sent.target, "ClanPilote");
  assert.equal(await credits(pilot), 210_000);
  me = (await ok("/api/clans/me", { token: pilot })).clan;
  assert.equal(me.bank, 390_000);
  assert.deepEqual(me.bankLog.map(row => [row.kind, row.amount]), [["withdraw", 150_000], ["deposit", 40_000], ["deposit", 500_000]]);
  assert.equal(me.bankLog[0].target, "ClanPilote");

  // Le rang Officier reçoit le droit Banque : le pilote peut distribuer.
  await ok("/api/clans/assign", { token: chief, body: { pseudo: "ClanPilote", rank: "Officier" } });
  await ok("/api/clans/rank-manage", { token: chief, body: { action: "rights", name: "Officier", rights: 3 | 16 } });
  await ok("/api/clans/bank/withdraw", { token: pilot, body: { pseudo: "ClanPilote", amount: 90_000 } });
  assert.equal(await credits(pilot), 300_000);

  // Plafond de réception : 50 M le jour d'arrivée, reçus déduits.
  await give("ClanChef", 100_000_000);
  await ok("/api/clans/bank/deposit", { token: chief, body: { amount: 60_000_000 } });
  let pilotRow = (await ok("/api/clans/me", { token: chief })).clan.members.find(m => m.pseudo === "ClanPilote");
  assert.equal(pilotRow.bankReceived, 240_000);
  assert.equal(pilotRow.bankAllowance, 50_000_000 - 240_000);
  assert.ok(pilotRow.bankNextAt > Date.now());
  const overLimit = await call("/api/clans/bank/withdraw", { token: chief, body: { pseudo: "ClanPilote", amount: 55_000_000 } });
  assert.equal(overLimit.ok, false);
  assert.match(overLimit.error, /Plafond atteint/);
  assert.equal(await credits(pilot), 300_000);
  await ok("/api/clans/bank/withdraw", { token: chief, body: { pseudo: "ClanPilote", amount: 49_760_000 } });
  assert.equal(await credits(pilot), 50_060_000);
  assert.equal((await call("/api/clans/bank/withdraw", { token: chief, body: { pseudo: "ClanPilote", amount: 1 } })).ok, false);
  pilotRow = (await ok("/api/clans/me", { token: chief })).clan.members.find(m => m.pseudo === "ClanPilote");
  assert.equal(pilotRow.bankAllowance, 0);

  // Annonce : droit Édition, visible par les membres, retirable.
  assert.equal((await call("/api/clans/motd", { token: pilot, body: { text: "pirate" } })).ok, false);
  const motd = await ok("/api/clans/motd", { token: chief, body: { text: "  Raid   ce soir 21h  " } });
  assert.equal(motd.motd, "Raid ce soir 21h");
  me = (await ok("/api/clans/me", { token: pilot })).clan;
  assert.equal(me.motd, "Raid ce soir 21h");
  assert.ok(me.motdAt > 0);

  // Historique des annonces : la plus récente en premier.
  await ok("/api/clans/motd", { token: chief, body: { text: "Deuxième annonce" } });
  me = (await ok("/api/clans/me", { token: pilot })).clan;
  assert.deepEqual(me.announcements.map(a => a.text), ["Deuxième annonce", "Raid ce soir 21h"]);
  assert.equal(me.announcements[0].pseudo, "ClanChef");

  // Bases : toutes les maps, détail des bases du clan, chantiers.
  const bases = await ok("/api/clans/bases", { token: pilot });
  assert.equal(bases.tag, "TST");
  assert.ok(bases.maps.length >= 20);
  assert.equal(bases.maps.find(m => m.map === "1-3").mine, true);
  assert.equal(bases.maps.find(m => m.map === "1-4").owner, "OMB");
  assert.equal(bases.maps.find(m => m.map === "1-4").mine, false);
  assert.equal(bases.mine.length, 1);
  const base = bases.mine[0];
  assert.equal(base.map, "1-3");
  assert.deepEqual(base.bonus, { dmg: false, hon: true, exp: true, rep: false });
  assert.equal(base.modules.length, 9);
  assert.equal(base.modules[0].state, "active");
  assert.equal(base.modules[3].state, "installing");
  assert.ok(base.modules[3].until > Date.now());
  assert.equal(base.modules[8].state, "empty");
  assert.ok(base.hub.hp > 0 && base.hub.hpMax >= base.hub.hp);
  assert.deepEqual(bases.building.map(b => [b.map, b.completed, b.total]), [["2-3", 1, 10]]);

  // Classement : visible même sans clan.
  const outsider = await register("SansClan");
  const ranking = (await ok("/api/clans/ranking", { token: outsider })).ranking;
  assert.equal(ranking.length, 1);
  assert.equal(ranking[0].tag, "TST");
  assert.equal(ranking[0].members, 2);
  assert.equal(ranking[0].position, 1);

  // Dissolution : la banque revient au chef, rien n'est perdu.
  const beforeDissolve = await credits(chief);
  const bankLeft = (await ok("/api/clans/me", { token: chief })).clan.bank;
  assert.ok(bankLeft > 0);
  await ok("/api/clans/dissolve", { token: chief, body: {} });
  assert.equal(await credits(chief), beforeDissolve + bankLeft);
  assert.equal((await ok("/api/clans/me", { token: chief })).clan, null);
});

test("plafond banque : +50 M par jour de clan, le non-reçu reste disponible", async () => {
  process.env.ORBIT_DATA_DIR ||= join(tmpdir(), "orbit-clan-unit");
  const { clanBankAllowance } = await import("./ACCOUNT_SERVER.js");
  const day = 24 * 3600_000, joined = 1_000_000;
  assert.equal(clanBankAllowance(joined, 0, joined).allowance, 50_000_000);
  assert.equal(clanBankAllowance(joined, 0, joined + day + 1).allowance, 100_000_000);
  // Jour 2 : 10 M reçus sur 100 M, il reste 90 M ; jour 3 : +50 M.
  assert.equal(clanBankAllowance(joined, 10_000_000, joined + day + 1).allowance, 90_000_000);
  assert.equal(clanBankAllowance(joined, 10_000_000, joined + 2 * day + 1).allowance, 140_000_000);
  // Tout reçu : repart à 0 puis +50 M le jour suivant.
  assert.equal(clanBankAllowance(joined, 100_000_000, joined + day + 1).allowance, 0);
  assert.equal(clanBankAllowance(joined, 100_000_000, joined + 2 * day + 1).allowance, 50_000_000);
  assert.equal(clanBankAllowance(joined, 0, joined + 5).nextAt, joined + day);
});
