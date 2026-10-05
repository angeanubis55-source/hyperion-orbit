// Serveur et SQLite éphémères : aucun accès aux comptes du workspace.
import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:net";
import { once } from "node:events";
import WebSocket from "ws";
import { combatProfile } from "./COMBAT_PROFILE.js";
import { CATALOG } from "../SRC/CORE/CATALOG.js";
import { SHIP_PACKS } from "../SHIP/SHIP_PACKS.js";
import { abilityShipKeyFor } from "../SHIP/SHIP_ABILITIES.js";

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

test("WebSocket : stats forgées, téléports, portails et reconnexion", { timeout: 65000 }, async t => {
  const temporary = await mkdtemp(join(tmpdir(), "orbit-anticheat-"));
  const reserve = createServer();
  reserve.listen(0, "127.0.0.1");
  await once(reserve, "listening");
  const port = reserve.address().port;
  await new Promise(resolve => reserve.close(resolve));
  const password = "isolated-anticheat-test";
  const server = spawn(process.execPath, [fileURLToPath(new URL("./MULTI_SERVER.js", import.meta.url))], {
    cwd: temporary, windowsHide: true,
    env: { ...process.env, PORT: String(port), ORBIT_ADMIN_PASS: password },
    stdio: ["ignore", "pipe", "pipe"],
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
    assert.equal(dirname(resolve(temporary)), resolve(tmpdir()));
    assert.ok(basename(temporary).startsWith("orbit-anticheat-"));
    await rm(temporary, { recursive: true, force: true });
  });
  const url = `http://127.0.0.1:${port}`;
  const api = async (path, options = {}) => {
    const response = await fetch(url + path, options);
    const result = await response.json();
    assert.ok(response.ok, `${path}: ${JSON.stringify(result)}`);
    return result;
  };
  let ready = false;
  for (let i = 0; i < 80; i++) {
    try { await api("/api/ping"); ready = true; break; } catch {}
    if (server.exitCode !== null) break;
    await pause(100);
  }
  assert.ok(ready, output);
  const items = Object.values(CATALOG).flat().filter(i => i && typeof i === "object");
  const shield = items.find(i => i.module?.type === "shield" && !i.petOnly);
  const makeAccount = async (name, map = "1-1", pos = { x: 4500, y: 3500 }, shipId = "PhoenixBleu") => {
    const account = await api("/api/register", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ pseudo: name, email: `${name}@example.test`, password: "test-password-123", faction: "mmo" }) });
    const user = { ...account.user, revision: Number(account.user.revision || 1) + 1,
      hangars: [{ id: "test-hangar", active: true, shipId, activeConfig: 1, lastMap: map, lastPos: pos,
        fits: { "1": { lasers: [], gens: [shield.id], extras: [], shipMods: [] },
          "2": { lasers: [], gens: [], extras: [], shipMods: [] } } }],
      drones: { items: [] }, inventory: { shipModules: [] }, rockets: { ric3: 2 } };
    await api("/api/save", { method: "POST", headers: { "content-type": "application/json", Authorization: `Bearer ${account.token}` }, body: JSON.stringify({ user }) });
    return { ...account, user };
  };
  const connect = async (account, map = "1-1") => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    sockets.push(ws);
    const messages = [];
    ws.on("message", data => { messages.push(JSON.parse(String(data))); });
    const wait = async (predicate, after = 0, timeout = 4000) => {
      const end = Date.now() + timeout;
      while (Date.now() < end) {
        const found = messages.slice(after).find(predicate);
        if (found) return found;
        assert.equal(ws.readyState, WebSocket.OPEN, output);
        await pause(20);
      }
      assert.fail(`Message timeout: ${output}`);
    };
    await once(ws, "open");
    ws.send(JSON.stringify({ t: "hello", token: account.token, map }));
    await wait(m => m.t === "welcome" && m.authed);
    const id = `u_${account.user.id}`;
    const pos = { t: "pos", map, ...account.user.hangars[0].lastPos, hpPct: 1, shPct: 1, hpMax: 204000, shMax: 5000, dead: false, config: 1 };
    const send = msg => ws.send(JSON.stringify(msg));
    send(pos);
    const snapshot = (after = messages.length) => wait(m => m.t === "snapshot" && m.players.some(p => p.id === id), after)
      .then(m => m.players.find(p => p.id === id));
    await snapshot(0);
    return { ws, messages, wait, id, pos, send, snapshot };
  };
  const peers = () => api("/api/admin/peers", { headers: { "x-admin-token": password } });
  const alice = await makeAccount("anticheat-alice");
  const bob = await makeAccount("anticheat-bob", "1-1", { x: 4600, y: 3500 });
  const a = await connect(alice), b = await connect(bob);
  const idle = await connect(await makeAccount("anticheat-idle"));
  const idleHeartbeat = setInterval(() => idle.send({ t: "ping", t0: Date.now() }), 3000);
  t.after(() => clearInterval(idleHeartbeat));
  const silent = await connect(await makeAccount("anticheat-silent"));
  const silentClosed = once(silent.ws, "close");
  const speedAccount = await makeAccount("anticheat-speed50");
  const speed = await connect(speedAccount);
  const speedClosed = once(speed.ws, "close");
  // Des sauts frequents, tous sous l'ancien seuil de telemetry de 4000 u.
  const speedTimer = setInterval(() => {
    if (speed.ws.readyState === WebSocket.OPEN) speed.send({ ...speed.pos, x: speed.pos.x + 2000, vx: 1e9, moving: true, mx: 99999, my: 99999, time: 1e15 });
  }, 100);
  t.after(() => clearInterval(speedTimer));
  const clockAccount = await makeAccount("anticheat-clock50");
  const clockPeer = await connect(clockAccount);
  clockPeer.send({ t: "clockReport", requestedSeconds: 250, serverSeconds: 5 });
  await clockPeer.wait(m => m.t === "speedGuard" && m.blocked === true);
  const beforePausedAttack = await b.snapshot();
  clockPeer.send({ t: "pvpHit", target: b.id, dmg: 1000 });
  assert.equal((await b.snapshot()).pvpAt, beforePausedAttack.pvpAt, "le serveur refuse aussi les tirs pendant la pause, independamment des attaques NPC");
  const observedSpeed = await b.wait(m => m.t === "snapshot" && m.players.some(p => p.id === speed.id && p.motionBlocked));
  const stoppedSpeed = observedSpeed.players.find(p => p.id === speed.id);
  assert.equal(stoppedSpeed.vx, 0, "les autres joueurs ne recoivent plus la vitesse refusee");
  assert.equal(stoppedSpeed.moving, false);
  assert.equal(stoppedSpeed.mx, stoppedSpeed.x);
  const diagnosticDeadline = Date.now() + 4000;
  let clockDiagnostic, speedDiagnostic;
  while (Date.now() < diagnosticDeadline) {
    const audit = await api("/api/admin/cheat", { headers: { "x-admin-token": password } });
    clockDiagnostic = audit.suspects.find(p => p.id === clockPeer.id);
    speedDiagnostic = audit.suspects.find(p => p.id === speed.id);
    if (clockDiagnostic && speedDiagnostic) break;
    await pause(50);
  }
  assert.equal(clockDiagnostic?.score, 0, "une declaration client seule ne sanctionne pas");
  assert.equal(clockDiagnostic?.security.last.declared, true);
  assert.equal(speedDiagnostic?.security.last.distance, 2000, "les petits sauts sont visibles avant l'audit");
  assert.ok(speedDiagnostic.security.last.allowedDistance < 2000);
  clockPeer.ws.close(); await once(clockPeer.ws, "close");
  assert.equal((await api("/api/admin/cheat", { headers: { "x-admin-token": password } })).suspects.find(p => p.id === clockPeer.id)?.online, false);
  const clockReconnected = await connect(clockAccount);
  assert.equal(clockReconnected.messages.find(m => m.t === "welcome" && m.authed).clockBlocked, true, "un refresh ne contourne pas la pause");
  const prematureRecoveryAt = clockReconnected.messages.length;
  clockReconnected.send({ t: "clockReport", requestedSeconds: 5, serverSeconds: 5 });
  // Le throttle peut ignorer un rapport immediat ; dans tous les cas aucun deblocage.
  await pause(100);
  assert.equal(clockReconnected.messages.slice(prematureRecoveryAt).some(m => m.t === "speedGuard" && !m.blocked), false);
  const lightningShip = SHIP_PACKS.find(p => abilityShipKeyFor(p.id) === "lightning");
  assert.ok(lightningShip);
  const lightning = await makeAccount("anticheat-lightning", "1-1", { x: 4500, y: 3500 }, lightningShip.id);
  let light = await connect(lightning);
  const lightProfile = combatProfile(lightning.user, "1-1");
  light.send({ t: "skillUse", skill: "ability_lightning", enabled: true, duration: 99999, multiplier: 99999 });
  await pause(150);
  light.pos.x += Math.round(lightProfile.speed * 1.7 * 0.15);
  const boostAt = light.messages.length;
  light.send({ ...light.pos, vx: 1e9, vmax: 1e9 });
  const boosted = await light.wait(m => m.t === "snapshot" && m.players.some(p => p.id === light.id && p.x === light.pos.x), boostAt)
    .then(m => m.players.find(p => p.id === light.id));
  assert.equal(boosted.x, light.pos.x, "un vrai bonus de vitesse reste utilisable");
  assert.equal(boosted.vmax, Math.floor(lightProfile.speed) * 2, "le multiplicateur forge est ignore");
  assert.ok(Math.abs(boosted.vx) <= boosted.vmax);
  // Une reconnexion ne coupe ni ne renouvelle une aptitude en cours.
  const beforeReconnect = light;
  lightning.user.hangars[0].lastPos = { x: light.pos.x, y: light.pos.y };
  light.ws.close();
  await once(light.ws, "close");
  light = await connect(lightning);
  assert.equal(light.id, beforeReconnect.id);
  assert.equal((await light.snapshot()).vmax, Math.floor(lightProfile.speed) * 2, "le bonus continue apres reconnexion");
  await pause(150);
  light.pos.x += Math.round(lightProfile.speed * 2 * 0.15);
  const resumedAt = light.messages.length;
  light.send(light.pos);
  await light.wait(m => m.t === "snapshot" && m.players.some(p => p.id === light.id && p.x === light.pos.x), resumedAt);
  assert.equal(light.messages.slice(resumedAt).some(m => m.t === "stateCorrection"), false, "pas de rollback pour le mouvement accelere valide");
  a.send({ t: "skillUse", skill: "ability_lightning", enabled: true });
  a.send({ ...a.pos, x: a.pos.x + 2000, vmax: 1e9, vx: 1e9, time: 1e15 });
  const deniedBoost = await a.snapshot();
  assert.equal(deniedBoost.x, a.pos.x, "une coque sans cette aptitude ne peut pas accelerer");
  const expectedHpDamage = Math.round(1000 * (1 - combatProfile(bob.user, "1-1").absorb));
  const original = await b.snapshot();
  const startHit = b.messages.length;
  a.send({ t: "pvpHit", target: b.id, dmg: 1000, pen: 1, critChance: 1, critMult: 1e9 });
  const damaged = await b.wait(m => m.t === "snapshot" && m.players.some(p => p.id === b.id && p.pvpHp < original.pvpHp), startHit)
    .then(m => m.players.find(p => p.id === b.id));
  assert.equal(original.pvpHp - damaged.pvpHp, expectedHpDamage, "pénétration du client ignorée");
  const forgedAt = b.messages.length;
  b.send({ ...b.pos, hpMax: 1e9, shMax: 1e9, evade: 0.9, absorb: 1, range: 5000, hswap: 3 });
  const forged = await b.snapshot(forgedAt);
  assert.equal(forged.pvpHp, damaged.pvpHp, "changer les maxima ne soigne pas sous le feu");
  const followupAt = b.messages.length;
  a.send({ t: "pvpHit", target: b.id, dmg: 1000 });
  const followup = await b.wait(m => m.t === "snapshot" && m.players.some(p => p.id === b.id && p.pvpHp < forged.pvpHp), followupAt)
    .then(m => m.players.find(p => p.id === b.id));
  assert.equal(forged.pvpHp - followup.pvpHp, expectedHpDamage, "hswap, absorption et esquive forgés ignorés");
  const oversizedAt = b.messages.length;
  a.send({ t: "pvpHit", target: b.id, dmg: 1e7 });
  assert.equal((await b.snapshot(oversizedAt)).pvpHp, followup.pvpHp, "impact au-delà du profil refusé");
  const freezeAt = b.messages.length;
  a.send({ t: "pvpHit", target: b.id, dmg: 0, rocket: "ric3" });
  await b.wait(m => m.t === "snapshot" && m.players.some(p => p.id === b.id && p.freezeT > 0), freezeAt);
  const freezeCorrectionAt = b.messages.length;
  b.send({ ...b.pos, x: b.pos.x + 5, vx: 1e9 });
  await b.wait(m => m.t === "stateCorrection", freezeCorrectionAt);
  const frozen = await b.snapshot();
  assert.equal(frozen.x, b.pos.x, "un client modifie ne peut pas ignorer le gel");
  assert.equal(frozen.vx, 0);

  a.send({ ...a.pos, dead: true });
  for (let i = 0; i < 30; i++) a.send({ ...a.pos, dead: false, x: 100000, y: 100000, vmax: 5000 });
  await a.wait(m => m.t === "stateCorrection");
  await pause(100);
  const current = (await peers()).peers.find(p => p.id === a.id);
  assert.equal(current.x, a.pos.x);
  assert.equal(current.y, a.pos.y);
  a.send({ t: "map", map: "4-5" });
  await pause(100);
  assert.equal((await peers()).peers.find(p => p.id === a.id).map, "1-1");

  // Le premier tick peut précéder la première fenêtre complète : attendre
  // le deuxième, sans accélérer ni modifier le code serveur livré.
  let suspect;
  const auditDeadline = Date.now() + 23000;
  while (Date.now() < auditDeadline) {
    const audit = await api("/api/admin/cheat", { headers: { "x-admin-token": password } });
    suspect = audit.suspects.find(p => p.id === a.id);
    if (suspect?.score > 0) break;
    a.send(a.pos); b.send({ ...b.pos, hpPct: followup.pvpHp / combatProfile(bob.user, "1-1").hpMax,
      shPct: followup.pvpSh / combatProfile(bob.user, "1-1").shMax });
    light.send(light.pos);
    await pause(250);
  }
  assert.equal(suspect?.score, 10, output);
  const recoveryAt = clockReconnected.messages.length;
  clockReconnected.send({ t: "clockReport", requestedSeconds: 5, serverSeconds: 5 });
  await clockReconnected.wait(m => m.t === "speedGuard" && m.recovered === true && !m.blocked, recoveryAt);
  light.send({ t: "skillUse", skill: "ability_lightning", enabled: true });
  const expired = await light.snapshot();
  assert.equal(expired.vmax, Math.floor(lightProfile.speed), "expiration et cooldown appliques sur le vrai serveur");
  assert.equal(idle.ws.readyState, WebSocket.OPEN, "le joueur immobile reste connecte");
  assert.ok((await peers()).peers.some(p => p.id === idle.id), "les pings maintiennent la presence sans nouvelles positions");
  await idle.snapshot();
  a.ws.close(); await once(a.ws, "close");
  const reconnected = await connect(alice);
  const auditAfter = await api("/api/admin/cheat", { headers: { "x-admin-token": password } });
  assert.equal(auditAfter.suspects.find(p => p.id === a.id)?.score, 10, "reconnexion conserve le score");
  assert.equal((await peers()).peers.filter(p => p.id === a.id).length, 1);
  assert.equal(reconnected.id, a.id);
  const replaced = once(reconnected.ws, "close");
  const replacement = await connect(alice);
  assert.equal((await replaced)[0], 4001, "un autre onglet recoit un motif distinct");
  assert.equal(replacement.ws.readyState, WebSocket.OPEN);
  assert.equal((await peers()).peers.filter(p => p.id === a.id).length, 1);

  const portalAccount = await makeAccount("anticheat-portal", "1-2", { x: 1083, y: 1000 });
  const portalPeer = await connect(portalAccount, "1-2");
  portalPeer.send({ t: "map", map: "1-1" });
  portalPeer.send({ ...portalPeer.pos, map: "1-1", x: 10232, y: 5900 });
  await pause(100);
  const arrived = (await peers()).peers.find(p => p.id === portalPeer.id);
  assert.equal(arrived.map, "1-1");
  assert.equal(arrived.x, 10232);
  assert.equal(arrived.y, 5900);
  const mimesisShip = SHIP_PACKS.find(p => abilityShipKeyFor(p.id) === "mimesis");
  const mimesis = await connect(await makeAccount("anticheat-phase", "1-1", { x: 4500, y: 3500 }, mimesisShip.id));
  const phaseAt = mimesis.messages.length;
  mimesis.send({ t: "skillUse", skill: "ability_mimesis_phase-out", x: 100000, y: 100000 });
  const phase = await mimesis.wait(m => m.t === "stateCorrection", phaseAt);
  assert.ok(Math.abs(Math.hypot(phase.x - 4500, phase.y - 3500) - 500) < 0.01);
  Object.assign(mimesis.pos, { x: phase.x, y: phase.y });
  mimesis.send(mimesis.pos);
  const phased = await mimesis.snapshot();
  assert.equal(phased.x, Math.round(phase.x));
  assert.equal(phased.y, Math.round(phase.y));
  assert.equal(phased.teleportSeq, 1, "la teleportation autorisee est identifiable par les observateurs");
  const repeatPhaseAt = mimesis.messages.length;
  mimesis.send({ t: "skillUse", skill: "ability_mimesis_phase-out" });
  await pause(100);
  assert.equal(mimesis.messages.slice(repeatPhaseAt).some(m => m.t === "stateCorrection"), false, "pas de teleportation repetee sans recharge");
  const [silentCode, silentReason] = await silentClosed;
  assert.equal(silentCode, 4000, "un socket vraiment silencieux finit par etre ferme");
  assert.equal(String(silentReason), "Heartbeat timeout");
  await speedClosed;
  const held = (await api("/api/admin/cheat", { headers: { "x-admin-token": password } })).holds.find(h => h.pseudo === "anticheat-speed50");
  assert.ok(held, "les rejets repetes aboutissent a un dossier en examen");
  assert.ok(held.evidence.score >= 100);
  assert.equal(held.evidence.security.last.distance, 2000);
});
