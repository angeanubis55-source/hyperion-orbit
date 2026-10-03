// Session navigateur isolee : protocole reseau simule, aucun compte reel.
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { resolve, join, extname } from "node:path";
import { chromium } from "playwright-core";

const root = resolve(process.cwd());
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".mp3": "audio/mpeg" };
const server = createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, "http://localhost").pathname;
    if (pathname.startsWith("/api/")) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, rows: [], rankings: [], online: 1 })); return;
    }
    const file = resolve(join(root, pathname === "/" ? "index.html" : decodeURIComponent(pathname).slice(1)));
    if (!file.startsWith(root + "\\") || !(await stat(file)).isFile()) throw new Error("404");
    res.writeHead(200, { "content-type": types[extname(file)] || "application/octet-stream" });
    res.end(await readFile(file));
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
let browser;
try {
  browser = await chromium.launch({ channel: "msedge", headless: true });
  const context = await browser.newContext();
  await context.routeWebSocket("**/ws", socket => {
    socket.onMessage(raw => {
      const msg = JSON.parse(raw);
      if (msg.t === "hello") {
        socket.send(JSON.stringify({ t: "welcome", id: "audit-peer", run: "audit" }));
        socket.send(JSON.stringify({ t: "auctionSync", lots: [], at: Date.now() }));
      }
      if (msg.t === "ping") socket.send(JSON.stringify({ t: "pong", t0: msg.t0 }));
    });
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.route("**/SRC/CORE/ORBIT_ENGINE.js*", async route => {
    const source = await readFile(join(root, "SRC/CORE/ORBIT_ENGINE.js"), "utf8");
    await route.fulfill({ contentType: "text/javascript", body: source.replace("window.__ORBIT_ENGINE__ = {", `
      window.__deathAudit = {
        ready: () => started,
        kill() {
          const e = makeEnemy('npc_StreuneR8', player.x + 250, player.y);
          if (!e) throw new Error('NPC fixture missing');
          player.iFrames = 100; enemies.push(e);
          damageEnemy(e, (e.hp + e.sh) * 10);
          const before = player.kills;
          const start = performance.now(); processDeaths();
          return { processDeathsMs: performance.now() - start, kills: player.kills - before };
        }
      };
      window.__ORBIT_ENGINE__ = {`) });
  });
  await page.addInitScript(() => {
    const user = { id: "death-audit", pseudo: "Audit", email: "audit@local", ship: "PhoenixBleu",
      inventory: { counts: { laser_lf1: 1 }, ships: ["PhoenixBleu"], shipModules: [] } };
    localStorage.setItem("orbit_users", JSON.stringify([user]));
    localStorage.setItem("orbit_current_user", JSON.stringify({ id: user.id }));
    sessionStorage.setItem("orbit_assets_preloaded_v1", "ready");
    sessionStorage.setItem("spawnMapId", "1-1");
    localStorage.setItem("orbit_game_settings_v1", JSON.stringify({ npcExplosions: false, rocketSmoke: false }));
  });
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html?map=1-1`);
  await page.waitForSelector("#loadingStartBtn:not([disabled])", { timeout: 60000 });
  await page.click("#loadingStartBtn");
  await page.waitForFunction(() => window.__deathAudit?.ready(), null, { timeout: 60000 });
  await page.waitForTimeout(1500);
  const session = await context.newCDPSession(page);
  await session.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await page.evaluate(() => window.HyperionPerformance.reset());
  const results = [];
  for (let i = 0; i < 5; i++) {
    results.push(await page.evaluate(() => window.__deathAudit.kill()));
    await page.waitForTimeout(500);
  }
  if (results.some(r => r.kills !== 1)) throw new Error("Kill pipeline incomplete");
  if (errors.length) throw new Error(errors.join("\n"));
  console.log(JSON.stringify({ cpuThrottle: 4, simulatedNetwork: true, results,
    timings: await page.evaluate(() => window.HyperionPerformance.snapshot()) }, null, 2));
} finally {
  if (browser) await browser.close();
  await new Promise(r => server.close(r));
}
