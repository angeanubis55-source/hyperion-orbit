import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { chromium } from "playwright-core";
import { MAP_LOADERS } from "../src/core/mapRegistry.js";

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

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const { port } = server.address();

const WARMUP_MS = 1500;
const SAMPLE_MS = 2000;

const requestedMap = process.argv.find((arg) => arg.startsWith("--map="))?.slice(6);
const combat = process.argv.includes("--combat");
const mapIds = requestedMap ? [requestedMap] : Object.keys(MAP_LOADERS).slice(0, 1);

const browser = await chromium.launch({
  channel: "msedge",
  headless: true,
  args: ["--enable-gpu", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader", "--disable-frame-rate-limit", "--disable-dev-shm-usage"],
});
const context = await browser.newContext();

try {
  for (const mapId of mapIds) {
    if (!Object.hasOwn(MAP_LOADERS, mapId)) {
      console.log(`${mapId}: carte inconnue`);
      continue;
    }
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error" && !message.text().includes("Failed to load resource")) errors.push(message.text());
    });

    await page.addInitScript(() => {
      const user = {
        id: "profile-user",
        pseudo: "Profiler",
        email: "profile@local",
        password: "test",
        ship: "PhoenixBleu",
        inventory: { counts: { laser_lf1: 1 }, ships: ["PhoenixBleu"], shipModules: [] },
      };
      localStorage.setItem("orbit_users", JSON.stringify([user]));
      localStorage.setItem("orbit_current_user", JSON.stringify({ id: user.id, pseudo: user.pseudo, email: user.email }));
      sessionStorage.setItem("orbit_assets_preloaded_v1", "ready");

      const proto = globalThis.CanvasRenderingContext2D && globalThis.CanvasRenderingContext2D.prototype;
      if (!proto) return;
      const counted = [
        "drawImage", "fill", "stroke", "fillRect", "strokeRect", "fillText", "strokeText",
        "beginPath", "arc", "moveTo", "lineTo", "arcTo", "quadraticCurveTo", "bezierCurveTo",
        "save", "restore", "translate", "rotate", "scale", "setTransform", "clearRect",
        "createRadialGradient", "createLinearGradient", "createPattern", "clip",
      ];
      globalThis.__canvasCounts = {};
      globalThis.__canvasCountKey = "main";
      for (const name of counted) {
        if (typeof proto[name] !== "function") continue;
        const original = proto[name];
        proto[name] = function (...args) {
          const key = globalThis.__canvasCountKey || "main";
          const counts = (globalThis.__canvasCounts[key] ||= {});
          counts[name] = (counts[name] || 0) + 1;
          return original.apply(this, args);
        };
      }

      globalThis.__rAFDurations = [];
      const raf = globalThis.requestAnimationFrame.bind(globalThis);
      globalThis.requestAnimationFrame = (cb) => raf((t) => {
        const s = performance.now();
        try { cb(t); } finally {
          globalThis.__rAFDurations.push(performance.now() - s);
        }
      });
    });

    try {
      await page.goto(`http://127.0.0.1:${port}/index.html?map=${encodeURIComponent(mapId)}`, { waitUntil: "domcontentloaded", timeout: 20_000 });
      await page.waitForSelector("#game", { state: "visible", timeout: 10_000 });
      await page.waitForFunction(() => !document.documentElement.classList.contains("orbitBooting"), null, { timeout: 30_000 });
      if (combat) {
        await page.waitForTimeout(1200);
        await page.locator('#ammoBar [data-skill="pulse"]').first().click().catch(() => {});
        await page.locator('#ammoBar [data-skill="rockets"]').first().click().catch(() => {});
      }
      await page.evaluate(() => { globalThis.__canvasCountKey = "idle"; globalThis.__canvasCounts = { idle: {} }; });
      await page.waitForTimeout(WARMUP_MS);
      await page.evaluate(() => {
        globalThis.__canvasCountKey = "sample";
        globalThis.__canvasCounts = { sample: {} };
        globalThis.__rAFDurations.length = 0;
      });
      const result = await page.evaluate(async ({ sampleMs }) => {
        return new Promise((resolve) => {
          let count = 0;
          const t0 = performance.now();
          const tick = () => {
            const now = performance.now();
            count++;
            if (now - t0 < sampleMs) requestAnimationFrame(tick);
            else {
              const d = globalThis.__rAFDurations;
              const sorted = [...d].sort((a, b) => a - b);
              const avg = d.length ? d.reduce((s, v) => s + v, 0) / d.length : 0;
              const peak = d.length ? sorted[sorted.length - 1] : 0;
              const p95 = d.length ? sorted[Math.floor(sorted.length * 0.95)] : 0;
              resolve({
                sampledMs: now - t0,
                frames: count,
                fps: count / ((now - t0) / 1000),
                jsAvgMs: avg,
                jsPeakMs: peak,
                jsP95Ms: p95,
                jsSamples: d.length,
                counts: globalThis.__canvasCounts.sample || {},
              });
            }
          };
          requestAnimationFrame(tick);
        });
      }, { sampleMs: SAMPLE_MS });

      const { frames, fps, counts, jsAvgMs, jsPeakMs, jsP95Ms, jsSamples } = result;
      const heaviest = Object.entries(counts)
        .map(([name, n]) => [name, n / frames])
        .sort((a, b) => b[1] - a[1]);
      console.log(`\n=== ${mapId}${combat ? " (combat)" : ""} ===`);
      console.log(`FPS moyen : ${fps.toFixed(1)}  (${frames} frames sur ${result.sampledMs.toFixed(0)} ms)`);
      console.log(`JS par frame : moy ${jsAvgMs.toFixed(3)} ms | p95 ${jsP95Ms.toFixed(3)} ms | pic ${jsPeakMs.toFixed(3)} ms (${jsSamples} frames JS)`);
      console.log("Appels Canvas par frame (triés) :");
      for (const [name, per] of heaviest) {
        console.log(`  ${String(name).padEnd(24)} ${per.toFixed(1)}`);
      }
      if (errors.length) console.log(`Erreurs: ${[...new Set(errors)].join(" | ")}`);
    } catch (error) {
      console.log(`${mapId}: ${error.message}`);
    } finally {
      await page.close();
    }
  }
} finally {
  await context.close();
  await browser.close();
  server.close();
}
