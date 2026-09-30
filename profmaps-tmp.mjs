import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { chromium } from "playwright-core";

const root = process.cwd();
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".jpg": "image/jpeg", ".mp3": "audio/mpeg" };
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
    const file = normalize(join(root, relative));
    if (!file.startsWith(root)) throw new Error("Invalid path");
    if (!(await stat(file)).isFile()) throw new Error("Not a file");
    response.writeHead(200, { "content-type": types[extname(file).toLowerCase()] || "application/octet-stream" });
    response.end(await readFile(file));
  } catch {
    response.writeHead(404);
    response.end("Not found");
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const { port } = server.address();

const maps = (process.argv.find((a) => a.startsWith("--maps="))?.slice(7) || "1-1,5-2").split(",");
const browser = await chromium.launch({ channel: "msedge", headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
try {
  for (const mapId of maps) {
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e.message).slice(0, 160)));
    await page.addInitScript(() => {
      const user = { id: "profile-user", pseudo: "Profiler", email: "profile@local", password: "test", ship: "PhoenixBleu", inventory: { counts: { laser_lf1: 1 }, ships: ["PhoenixBleu"], shipModules: [] } };
      localStorage.setItem("orbit_users", JSON.stringify([user]));
      localStorage.setItem("orbit_current_user", JSON.stringify({ id: user.id, pseudo: user.pseudo, email: user.email }));
      localStorage.setItem("orbit_game_settings_v1", JSON.stringify({ autoStart: true }));
      sessionStorage.setItem("orbit_assets_preloaded_v1", "ready");
      const proto = globalThis.CanvasRenderingContext2D?.prototype;
      globalThis.__canvasCounts = {};
      globalThis.__canvasCountKey = "main";
      if (proto) for (const name of ["drawImage", "fill", "stroke", "fillRect", "fillText", "save", "restore", "translate", "rotate", "scale", "createRadialGradient", "createLinearGradient", "arc"]) {
        if (typeof proto[name] !== "function") continue;
        const o = proto[name];
        proto[name] = function (...a) {
          const k = globalThis.__canvasCountKey || "main";
          (globalThis.__canvasCounts[k] ||= {})[name] = ((globalThis.__canvasCounts[k] || {})[name] || 0) + 1;
          return o.apply(this, a);
        };
      }
      globalThis.__rAFDurations = [];
      const raf = globalThis.requestAnimationFrame.bind(globalThis);
      globalThis.requestAnimationFrame = (cb) => raf((t) => {
        const s = performance.now();
        try { cb(t); } finally { globalThis.__rAFDurations.push(performance.now() - s); }
      });
    });
    try {
      await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: "domcontentloaded", timeout: 20000 });
      await page.waitForFunction(() => !document.documentElement.classList.contains("orbitBooting"), null, { timeout: 60000 });
      await page.waitForTimeout(2000);
      if (mapId !== "1-1") {
        await page.evaluate((m) => window.__GO_TO_MAP__?.(m), mapId);
        await page.waitForTimeout(12000);
      } else {
        await page.waitForTimeout(4000);
      }
      const info = await page.evaluate(() => ({
        map: window.__CURRENT_MAP_ID__,
        started: !!document.querySelector("#game") && getComputedStyle(document.querySelector("#game")).display !== "none",
        fpsTxt: document.querySelector("#fpsTxt")?.textContent || null,
        dbg: window.__NETBOXDBG__ || null,
      }));
      await page.evaluate(() => { globalThis.__canvasCountKey = "sample"; globalThis.__canvasCounts = { sample: {} }; globalThis.__rAFDurations.length = 0; });
      const res = await page.evaluate(async ({ ms }) => new Promise((resolve) => {
        let n = 0; const t0 = performance.now();
        const tick = () => { n++; if (performance.now() - t0 < ms) requestAnimationFrame(tick); else {
          const d = globalThis.__rAFDurations; const s = [...d].sort((a, b) => a - b);
          const avg = d.length ? d.reduce((x, v) => x + v, 0) / d.length : 0;
          resolve({ frames: n, ms: performance.now() - t0, jsAvg: avg, jsP95: d.length ? s[Math.floor(d.length * 0.95)] : 0, jsMax: d.length ? s[s.length - 1] : 0, counts: globalThis.__canvasCounts.sample || {} });
        } };
        requestAnimationFrame(tick);
      }), { ms: 4000 });
      const heavy = Object.entries(res.counts).map(([k, v]) => [k, v / res.frames]).sort((a, b) => b[1] - a[1]).slice(0, 10);
      console.log(`\n=== ${mapId} (current=${info.map}, fpsHud=${info.fpsTxt}) ===`);
      console.log(`FPS: ${(res.frames / (res.ms / 1000)).toFixed(1)} | JS/frame: moy ${res.jsAvg.toFixed(2)}ms p95 ${res.jsP95.toFixed(2)}ms max ${res.jsMax.toFixed(2)}ms`);
      for (const [k, v] of heavy) console.log(`  ${k.padEnd(22)} ${v.toFixed(1)}/frame`);
      if (info.dbg) console.log(`  boxes: known=${info.dbg.knownSize} local=${info.dbg.ambientLocal}`);
      if (errors.length) console.log(`Erreurs: ${[...new Set(errors)].slice(0, 4).join(" | ")}`);
    } catch (e) { console.log(`${mapId}: ${e.message?.slice(0, 200)}`); }
    finally { await page.close(); }
  }
} finally { await context.close(); await browser.close(); server.close(); }
