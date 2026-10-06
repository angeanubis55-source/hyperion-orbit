// Vrai jeu et serveur sur compte SQLite temporaire. Le crochet de simulation
// est injecte uniquement dans la reponse HTTP du test, jamais dans le jeu livre.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { createServer } from "node:net";
import { basename, dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const temporary = await mkdtemp(join(tmpdir(), "orbit-bot-wall-browser-"));
await writeFile(join(temporary, "index.html"), await readFile(join(root, "index.html")));
const reserve = createServer();
await new Promise(resolve => reserve.listen(0, "127.0.0.1", resolve));
const port = reserve.address().port;
await new Promise(resolve => reserve.close(resolve));
const server = spawn(process.execPath, [join(root, "SCRIPTS/MULTI_SERVER.js")], {
  cwd: temporary, windowsHide: true, env: { ...process.env, PORT: String(port) }, stdio: ["ignore", "pipe", "pipe"],
});
let browser, page, output = "";
server.stdout.on("data", b => { output += b; }); server.stderr.on("data", b => { output += b; });
const url = `http://127.0.0.1:${port}`, errors = [];
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".gif": "image/gif", ".jpg": "image/jpeg", ".mp3": "audio/mpeg" };
const hook = `window.__BOT_WALL_TEST__ = () => {
  const previousPlayer = { ...player }, previousBot = { ...Bot }, previousTarget = { ...moveTarget };
  const previousAttack = attackActive;
  try {
    Object.assign(player, { x: 6500, y: 4000, r: 18, baseSpeed: 400, dead: false, freezeT: 0, rocketSlowT: 0 });
    Object.assign(Bot, { active: true, manualT: -1e9, wallSteer: null });
    Object.assign(moveTarget, { active: true, x: 8000, y: 4000 });
    attackActive = false;
    let collisions = 0, arrived = false;
    for (let i = 0; i < 4200; i++) {
      const target = botMovementStep(1 / 60);
      updatePlayerVelocity(player, { x: target.active ? target.x - player.x : 0, y: target.active ? target.y - player.y : 0 }, 1 / 60);
      advancePlayerToTarget(player, target, 1 / 60);
      for (const wall of zoneWalls) if (circleRectResolve(player.x, player.y, player.r, wall)) collisions++;
      if (Math.hypot(player.x - 8000, player.y - 4000) < 2) { arrived = true; break; }
    }
    return { map: currentMapId(), walls: zoneWalls.length, arrived, collisions };
  } finally {
    Object.assign(player, previousPlayer); Object.assign(Bot, previousBot); Object.assign(moveTarget, previousTarget);
    attackActive = previousAttack;
  }
};
window.__BOT_COMBAT_WALL_TEST__ = () => {
  const previousPlayer = { ...player }, previousBot = { ...Bot }, previousMove = { ...moveTarget };
  const previousEnemies = enemies.slice(), previousAttack = attackActive, previousSelected = Target.get();
  const previousRange = playerRange;
  const results = [];
  try {
    for (const scenario of [
      { name: 'corner', start: { x: 4595, y: 7593 }, goal: { x: 4307, y: 6600 }, seconds: 25 },
      { name: 'impulse-corner', type: 'npc_Impulse_II', start: { x: 4595, y: 7593 }, goal: { x: 4800, y: 7150 }, seconds: 25 },
      { name: 'long-wall', start: { x: 6500, y: 4000 }, goal: { x: 7900, y: 4000 }, seconds: 70 },
      { name: 'search-invoke', search: true, type: 'npc_Invoke_XVI', start: { x: 11000, y: 13000 }, goal: { x: 3000, y: 5000 }, seconds: 70 },
      { name: 'search-mindfire', search: true, type: 'npc_Mindfire_Behemoth', start: { x: 11000, y: 13000 }, goal: { x: 21000, y: 6220 }, seconds: 70 },
      { name: 'search-strokelight', search: true, type: 'npc_Strokelight_Barrage', start: { x: 11000, y: 13000 }, goal: { x: 3140, y: 1290 }, seconds: 70 },
    ]) {
      const npc = { id: 987654, type: scenario.type || 'npc_Invoke_XVI', hp: 1e9, hpMax: 1e9, r: 50,
        vx: 0, vy: 0, shootRange: 750, ...scenario.goal };
      enemies.splice(0, enemies.length, ...(scenario.search ? [] : [npc]));
      Object.assign(player, { ...scenario.start, r: 18, baseSpeed: 712, vx: 0, vy: 0, hp: player.hpMax,
        dead: false, freezeT: 0, rocketSlowT: 0 });
      Object.assign(Bot, { active: true, manualT: -1e9, mode: 'kill', module: 'farm', wallSteer: null,
        npcAllow: new Set(['npc_Invoke_XVI', 'npc_Impulse_II']), combatTargetId: null, steering: null,
        npcAmmo: {}, npcForm: {}, npcCfg: {}, npcSab: {}, npcX6: {}, npcPrio: {},
        flee: false, fleeing: false, selling: false, cargo: false,
        targetMap: '', travelOverride: null, petEnabled: false, skillIem: false, skillIsh: false,
        questsAccept: false, questsClaim: false, lastNpcId: null, lastNpcKey: null, moveTag: null,
        npcWallBan: {}, rangeRecoveryId: null, lastBoxId: null, blSearch: {} });
      if (scenario.search) Bot.npcAllow = new Set([scenario.type]);
      moveTarget.active = false; attackActive = false; playerRange = 1000; Target.clear();
      let travelled = 0, collisions = 0, clearFrames = 0, idleFrames = 0, longestIdle = 0;
      tickBot(1 / 60);
      const firstWaypoint = { x: moveTarget.x, y: moveTarget.y }, searchType = Bot.blSearch.target?.type;
      let arrived = false;
      for (let i = 0; i < scenario.seconds * 60; i++) {
        const target = botMovementStep(1 / 60), oldX = player.x, oldY = player.y;
        updatePlayerVelocity(player, { x: target.active ? target.x - player.x : 0,
          y: target.active ? target.y - player.y : 0 }, 1 / 60);
        advancePlayerToTarget(player, target, 1 / 60);
        const step = Math.hypot(player.x - oldX, player.y - oldY); travelled += step;
        idleFrames = step < 0.1 ? idleFrames + 1 : 0; longestIdle = Math.max(longestIdle, idleFrames);
        for (const wall of zoneWalls) if (circleRectResolve(player.x, player.y, player.r, wall)) collisions++;
        if (!isSegmentBlocked(player.x, player.y, npc.x, npc.y, zoneWalls, 24)) clearFrames++;
        tickBot(1 / 60);
        if (scenario.search && Math.hypot(player.x - firstWaypoint.x, player.y - firstWaypoint.y) < 150) { arrived = true; break; }
      }
      results.push({ name: scenario.name, travelled, collisions, clearFrames, longestIdle,
        search: !!scenario.search, arrived, searchType, requestedType: scenario.type, firstWaypoint,
        status: Bot.status, target: Bot.target, x: player.x, y: player.y });
    }
    return results;
  } finally {
    enemies.splice(0, enemies.length, ...previousEnemies);
    Object.assign(player, previousPlayer); Object.assign(Bot, previousBot); Object.assign(moveTarget, previousMove);
    attackActive = previousAttack; playerRange = previousRange;
    if (previousSelected) Target.set(previousSelected); else Target.clear();
  }
};\n`;
try {
  let ready = false;
  for (let i = 0; i < 80; i++) {
    try { ready = (await fetch(url + "/api/ping")).ok; } catch {}
    if (ready || server.exitCode !== null) break;
    await pause(100);
  }
  assert.ok(ready, output);
  const registered = await fetch(url + "/api/register", { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ pseudo: "bot-wall-browser", email: "bot-wall-browser@example.test", password: "test-password-123", faction: "mmo" }) });
  assert.ok(registered.ok); const account = await registered.json();
  const user = { ...account.user, revision: account.user.revision + 1, schemaVersion: 4,
    hangars: [{ id: "browser-hangar", active: true, shipId: "PhoenixBleu", activeConfig: 1,
      lastMap: "1-BL", lastPos: { x: 6500, y: 4000 }, lastHpPct: 1, lastShPct: 1,
      fits: { "1": { lasers: [], gens: [], extras: [], shipMods: [] }, "2": { lasers: [], gens: [], extras: [], shipMods: [] } } }],
  };
  const saved = await fetch(url + "/api/save", { method: "POST", headers: { "content-type": "application/json", Authorization: `Bearer ${account.token}` },
    body: JSON.stringify({ user }) });
  assert.ok(saved.ok); const canonical = (await saved.json()).user;
  browser = await chromium.launch({ channel: "msedge", headless: true });
  page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", message => { if (message.type() === "error") console.error(message.text()); });
  await page.route("**/*", async route => {
    const parsed = new URL(route.request().url());
    if (parsed.origin !== url || parsed.pathname === "/index.html" || parsed.pathname.startsWith("/api/")) return route.continue();
    try {
      const path = resolve(root, decodeURIComponent(parsed.pathname).replace(/^\/+/, ""));
      assert.ok(path.startsWith(root + sep));
      let body = await readFile(path);
      if (parsed.pathname === "/SRC/CORE/ORBIT_ENGINE.js") {
        assert.ok(body.toString().includes("window.__ORBIT_ENGINE__ = {"));
        body = Buffer.from("import { isSegmentBlocked } from './BOT_NAVIGATION.js';\n" +
          body.toString().replace("window.__ORBIT_ENGINE__ = {", hook + "window.__ORBIT_ENGINE__ = {"));
      }
      await route.fulfill({ status: 200, contentType: mime[extname(path)] || "application/octet-stream", body });
    } catch { await route.fulfill({ status: 404, body: "Not found" }); }
  });
  await page.addInitScript(({ token, user }) => {
    localStorage.setItem("orbit_token", token); localStorage.setItem("orbit_user_cache", JSON.stringify({ user }));
    localStorage.setItem("orbit_current_user", JSON.stringify({ id: user.id, pseudo: user.pseudo, email: user.email }));
    sessionStorage.setItem("orbit_assets_preloaded_v1", "ready"); sessionStorage.setItem("spawnMapId", "1-BL");
  }, { token: account.token, user: canonical });
  await page.goto(url + "/index.html?map=1-BL", { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#loadingStartBtn:not([disabled])", { timeout: 90000 }); await page.click("#loadingStartBtn");
  await page.waitForSelector("#game", { state: "visible", timeout: 15000 });
  await page.waitForFunction(() => !document.documentElement.classList.contains("orbitBooting") &&
    getComputedStyle(document.getElementById("loadingOverlay")).display === "none");
  const route = await page.evaluate(() => window.__BOT_WALL_TEST__());
  assert.equal(route.map.toLowerCase(), "1-bl"); assert.equal(route.walls, 18);
  assert.equal(route.arrived, true); assert.equal(route.collisions, 0);
  const combat = await page.evaluate(() => window.__BOT_COMBAT_WALL_TEST__());
  for (const result of combat) {
    assert.equal(result.collisions, 0, result.name);
    if (result.search) {
      assert.equal(result.searchType, result.requestedType, result.name + ': cherche dans le bon habitat');
      assert.equal(result.arrived, true, result.name + ': rejoint le secteur sans NPC visible');
    } else assert.ok(result.clearFrames > 60, result.name + ': rejoint la cible derriere le mur');
    assert.ok(result.longestIdle < 60, result.name + ': reste mobile');
  }
  await page.locator('[data-window-id="botWindow"]').click();
  await page.locator('#botSkillCloak').check();
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('orbit_bot_config_v1')).skillCloak), true,
    'la nouvelle case sauvegarde le camouflage automatique');
  await page.locator('#botSkillCloak').uncheck();
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('orbit_bot_config_v1')).skillCloak), false);
  await page.locator('#botFleeCloak').check();
  assert.deepEqual(await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('orbit_bot_config_v1'));
    return { fleeCloak: saved.fleeCloak, skillCloak: saved.skillCloak };
  }), { fleeCloak: true, skillCloak: false }, 'camouflage de reparation independant du camouflage apres un kill');
  await page.locator('#botFleeCloak').uncheck();
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('orbit_bot_config_v1')).fleeCloak), false);
  const profiles = [
    { config: 'botCfgFlySeg', formation: 'botFormMove', configKey: 'cfgFly', formKey: 'formMove', value: '1' },
    { config: 'botCfgFleeSeg', formation: 'botFormFlee', configKey: 'cfgFlee', formKey: 'formFlee', value: '2' },
    { config: 'botCfgTravelSeg', formation: 'botFormTravel', configKey: 'cfgTravel', formKey: 'formTravel', value: '' },
  ];
  const expectedProfiles = {};
  for (const [index, profile] of profiles.entries()) {
    await page.locator('#' + profile.config + ' button[data-v="2"]').click();
    await page.locator('#' + profile.config + ' button[data-v="' + profile.value + '"]').click();
    const select = page.locator('#' + profile.formation);
    const formation = await select.locator('option').nth(index + 1).getAttribute('value');
    await select.selectOption(formation);
    expectedProfiles[profile.configKey] = profile.value;
    expectedProfiles[profile.formKey] = formation;
    assert.equal(await page.locator('#' + profile.config + ' button.on').getAttribute('data-v'), profile.value);
  }
  const savedProfiles = await page.evaluate(keys => {
    const saved = JSON.parse(localStorage.getItem('orbit_bot_config_v1'));
    return Object.fromEntries(keys.map(key => [key, saved[key]]));
  }, Object.keys(expectedProfiles));
  assert.deepEqual(savedProfiles, expectedProfiles);
  await page.locator("#botPlayBtn").click();
  await page.waitForFunction(() => document.getElementById("botStatusTxt")?.classList.contains("running"));
  await page.waitForTimeout(3000); await page.locator("#botPlayBtn").click();
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ route, combat, profiles: savedProfiles, botUI: "OK", errors }));
} catch (error) {
  console.error(JSON.stringify({ errors, screen: await page?.evaluate(() => document.body.innerText.slice(-2000)).catch(() => "unavailable"), server: output.slice(-2000) }));
  throw error;
} finally {
  if (browser) await browser.close();
  const stopped = server.exitCode === null ? once(server, "exit") : Promise.resolve(); server.kill(); await stopped;
  assert.equal(dirname(resolve(temporary)), resolve(tmpdir())); assert.ok(basename(temporary).startsWith("orbit-bot-wall-browser-"));
  await rm(temporary, { recursive: true, force: true });
}
