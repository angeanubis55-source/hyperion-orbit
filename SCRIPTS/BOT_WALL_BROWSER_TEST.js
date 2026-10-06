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
  await page.route("**/*", async route => {
    const parsed = new URL(route.request().url());
    if (parsed.origin !== url || parsed.pathname === "/index.html" || parsed.pathname.startsWith("/api/")) return route.continue();
    try {
      const path = resolve(root, decodeURIComponent(parsed.pathname).replace(/^\/+/, ""));
      assert.ok(path.startsWith(root + sep));
      let body = await readFile(path);
      if (parsed.pathname === "/SRC/CORE/ORBIT_ENGINE.js") {
        assert.ok(body.toString().includes("window.__ORBIT_ENGINE__ = {"));
        body = Buffer.from(body.toString().replace("window.__ORBIT_ENGINE__ = {", hook + "window.__ORBIT_ENGINE__ = {"));
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
  await page.locator('[data-window-id="botWindow"]').click(); await page.locator("#botPlayBtn").click();
  await page.waitForFunction(() => document.getElementById("botStatusTxt")?.classList.contains("running"));
  await page.waitForTimeout(3000); await page.locator("#botPlayBtn").click();
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ route, botUI: "OK", errors }));
} catch (error) {
  console.error(JSON.stringify({ errors, screen: await page?.evaluate(() => document.body.innerText.slice(-2000)).catch(() => "unavailable"), server: output.slice(-2000) }));
  throw error;
} finally {
  if (browser) await browser.close();
  const stopped = server.exitCode === null ? once(server, "exit") : Promise.resolve(); server.kill(); await stopped;
  assert.equal(dirname(resolve(temporary)), resolve(tmpdir())); assert.ok(basename(temporary).startsWith("orbit-bot-wall-browser-"));
  await rm(temporary, { recursive: true, force: true });
}
