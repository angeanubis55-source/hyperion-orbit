import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { join, normalize, extname } from "node:path";
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
const browser = await chromium.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
  args: ["--no-sandbox", "--use-angle=swiftshader"],
});
const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
const page = await context.newPage();
try {
  await page.addInitScript(() => {
    const user = {
      id: "shot-user", pseudo: "Shot", email: "shot@local", password: "test", ship: "PhoenixBleu",
      inventory: { counts: { laser_lf1: 1 }, ships: ["PhoenixBleu"], shipModules: [] },
    };
    localStorage.setItem("orbit_users", JSON.stringify([user]));
    localStorage.setItem("orbit_current_user", JSON.stringify({ id: user.id, pseudo: user.pseudo, email: user.email }));
    sessionStorage.setItem("orbit_assets_preloaded_v1", "ready");
  });
  await page.goto(`http://127.0.0.1:${port}/index.html?map=1-1`, { waitUntil: "domcontentloaded", timeout: 20000 });
  await page.waitForSelector("#loadingStartBtn:not([disabled])", { timeout: 180000 });
  await page.click("#loadingStartBtn");
  await page.waitForFunction(() => getComputedStyle(document.getElementById("loadingOverlay")).display === "none", null, { timeout: 30000 });
  await page.waitForFunction(() => !document.documentElement.classList.contains("orbitBooting"), null, { timeout: 30000 });
  await page.waitForTimeout(1000);
  await page.click("#btnGameHub");
  await page.waitForSelector("#profileWindow", { state: "visible", timeout: 10000 });
  await page.click("#btnShopHub");
  await page.waitForSelector("#shopWindow", { state: "visible", timeout: 10000 });
  await page.waitForTimeout(800);
  const info = await page.evaluate(() => {
    const out = {};
    const grab = (name, sel) => {
      const el = document.querySelector(sel);
      if (!el) { out[name] = "MISSING"; return; }
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      out[name] = {
        rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
        minHeight: cs.minHeight, height: cs.height, padding: cs.padding,
        fontSize: cs.fontSize, margin: cs.margin, gap: cs.gap,
        borderRadius: cs.borderRadius, background: cs.background.slice(0, 80),
        border: cs.border.slice(0, 60),
      };
    };
    grab("piloteCard", "#profileOverlay .profileHeaderCard");
    grab("shopCard", "#shopOverlay .profileHeaderCard");
    grab("piloteTabs", "#profileOverlay .profileTabs");
    grab("shopTabs", "#shopOverlay .profileTabs");
    grab("piloteBtn", "#profileOverlay .profileTabs .tabBtn");
    grab("shopBtn", "#shopOverlay .profileTabs .tabBtn");
    grab("piloteWin", "#profileWindow");
    grab("shopWin", "#shopWindow");
    return out;
  });
  console.log(JSON.stringify(info, null, 1));
} catch (e) {
  console.log("FAIL: " + (e?.message || e));
} finally {
  await browser.close();
  server.close();
}
