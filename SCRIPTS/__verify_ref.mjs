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

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const { port } = server.address();
const browser = await chromium.launch({ channel: "msedge", headless: true });
const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
const page = await context.newPage();

try {
  await page.addInitScript(() => {
    const user = {
      id: "style-user", pseudo: "Style", email: "style@local", password: "test",
      ship: "PhoenixBleu", credits: 50000000,
      inventory: { counts: {}, ships: ["PhoenixBleu"], shipModules: [] },
    };
    localStorage.setItem("orbit_users", JSON.stringify([user]));
    localStorage.setItem("orbit_current_user", JSON.stringify({ id: user.id, pseudo: user.pseudo, email: user.email }));
    sessionStorage.setItem("orbit_assets_preloaded_v1", "ready");
    sessionStorage.setItem("spawnMapId", "1-1");
  });
  await page.goto(`http://127.0.0.1:${port}/index.html?map=1-1`, { waitUntil: "domcontentloaded", timeout: 20000 });
  await page.waitForSelector("#loadingStartBtn:not([disabled])", { timeout: 180000 });
  await page.click("#loadingStartBtn");
  await page.waitForSelector("#game", { state: "visible", timeout: 15000 });
  await page.waitForFunction(() => getComputedStyle(document.getElementById("loadingOverlay")).display === "none", null, { timeout: 30000 });
  await page.waitForFunction(() => !document.documentElement.classList.contains("orbitBooting"), null, { timeout: 30000 });
  await page.waitForTimeout(1000);

  // Ouvre PET pour son bouton réduire.
  await page.click('[data-window-id="petWindow"]');
  await page.waitForTimeout(500);

  const info = await page.evaluate(() => {
    const fmt = (el) => {
      if (!el) return "ABSENT";
      const cs = getComputedStyle(el);
      return {
        bgImage: cs.backgroundImage.slice(0, 120),
        bgColor: cs.backgroundColor,
        color: cs.color,
        border: `${cs.borderTopWidth} ${cs.borderTopStyle} ${cs.borderTopColor}`,
        radius: cs.borderRadius,
        shadow: cs.boxShadow.slice(0, 120),
        font: `${cs.fontWeight} ${cs.fontSize}/${cs.lineHeight}`,
        padding: cs.padding,
      };
    };
    return {
      cfgToggle: fmt(document.querySelector("#cfgToggleBtn")),
      petMinBtn: fmt(document.querySelector("#petWindow .gameWinMinBtn")),
    };
  });
  console.log(JSON.stringify(info, null, 1));
} catch (e) {
  console.log("FATAL: " + (e.message || e));
}
await browser.close();
server.close();
