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
const page = await (await browser.newContext({ viewport: { width: 1600, height: 900 } })).newPage();
const errors = [];
page.on("pageerror", (e) => errors.push("PAGEERROR: " + e.message));
await page.addInitScript(() => {
  const user = { id: "shot-user", pseudo: "Shot", email: "shot@local", password: "test", ship: "PhoenixBleu", inventory: { counts: { laser_lf1: 1 }, ships: ["PhoenixBleu"], shipModules: [] } };
  localStorage.setItem("orbit_users", JSON.stringify([user]));
  localStorage.setItem("orbit_current_user", JSON.stringify({ id: user.id, pseudo: user.pseudo, email: user.email }));
  sessionStorage.setItem("orbit_assets_preloaded_v1", "ready");
});
await page.goto(`http://127.0.0.1:${port}/index.html?map=1-1`, { waitUntil: "domcontentloaded", timeout: 20000 });
// DEPART si présent
await page.waitForTimeout(3000);
const depart = await page.$("#loadingStartBtn:not([disabled])");
if (depart) await depart.click();
await page.waitForTimeout(2000);
const jouer = await page.$("#startBtn:not([disabled])");
if (jouer) await jouer.click();
await page.waitForTimeout(4000);
console.log("booting:", await page.evaluate(() => document.documentElement.className));
console.log("dock children:", await page.evaluate(() => document.getElementById("gameWindowDock")?.children.length));
const dock = await page.$("#gameWindowDock");
if (dock) await dock.screenshot({ path: "C:/Users/dilan/Desktop/SWF_IMAGES/dock_shot.png" });
await page.screenshot({ path: "C:/Users/dilan/Desktop/SWF_IMAGES/full_shot.png" });
console.log("errors:", JSON.stringify(errors.slice(0, 5)));
await browser.close();
server.close();
