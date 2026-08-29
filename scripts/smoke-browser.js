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
const browser = await chromium.launch({ channel: "msedge", headless: true });
const context = await browser.newContext();
const requestedMap = process.argv.find((arg) => arg.startsWith("--map="))?.slice(6);
const coldStart = process.argv.includes("--cold");
const mapIds = requestedMap ? [requestedMap] : Object.keys(MAP_LOADERS);
const failures = [];

try {
  for (const mapId of mapIds) {
    if (!Object.hasOwn(MAP_LOADERS, mapId)) {
      failures.push(`${mapId}: carte inconnue`);
      continue;
    }

    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error" && !message.text().includes("Failed to load resource")) errors.push(message.text());
    });
    page.on("response", (response) => {
      if (response.status() >= 400 && !response.url().endsWith("/favicon.ico")) errors.push(`${response.status()} ${response.url()}`);
    });

    try {
      await page.addInitScript(({ coldStart }) => {
        const user = { id: "smoke-user", pseudo: "Smoke", email: "smoke@local", password: "test", ship: "PhoenixBleu" };
        localStorage.setItem("orbit_users", JSON.stringify([user]));
        localStorage.setItem("orbit_current_user", JSON.stringify({ id: user.id, pseudo: user.pseudo, email: user.email }));
        if (!coldStart) sessionStorage.setItem("orbit_assets_preloaded_v1", "ready");
      }, { coldStart });
      await page.goto(`http://127.0.0.1:${port}/index.html?map=${encodeURIComponent(mapId)}`, { waitUntil: "domcontentloaded", timeout: 20_000 });
      await page.waitForSelector("#game", { state: "visible", timeout: 10_000 });
      if (coldStart) {
        await page.waitForSelector("#loadingStartBtn:not([disabled])", { timeout: 180_000 });
        await page.click("#loadingStartBtn");
      }
      await page.waitForFunction(() => getComputedStyle(document.getElementById("loadingOverlay")).display === "none", null, { timeout: 30_000 });
      await page.waitForTimeout(500);
      const canvasReady = await page.locator("#game").evaluate((canvas) => canvas.width > 0 && canvas.height > 0);
      if (!canvasReady) errors.push("canvas non initialisé");
    } catch (error) {
      errors.push(error.message);
    } finally {
      await page.close();
    }

    if (errors.length) failures.push(`${mapId}:\n  ${[...new Set(errors)].join("\n  ")}`);
    else console.log(`✓ ${mapId}`);
  }

  if (failures.length) throw new Error(`Échecs du smoke test (${failures.length}/${mapIds.length}):\n${failures.join("\n")}`);
  console.log(`Smoke browser: ${mapIds.length} carte(s) démarrée(s) sans erreur JavaScript.`);
} finally {
  await context.close();
  await browser.close();
  server.close();
}
