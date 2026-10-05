// Jeu et backend reels, compte SQLite temporaire. Les assets sont lus dans
// le workspace ; aucune sauvegarde ne touche les comptes existants.
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
const temporary = await mkdtemp(join(tmpdir(), "orbit-selection-browser-"));
// La navigation HTML passe vraiment par le serveur local : une page HTML
// entierement interceptee n'a pas d'adresse reseau locale pour Chromium.
await writeFile(join(temporary, "index.html"), await readFile(join(root, "index.html")));
const reserve = createServer();
await new Promise(resolve => reserve.listen(0, "127.0.0.1", resolve));
const port = reserve.address().port;
await new Promise(resolve => reserve.close(resolve));
const server = spawn(process.execPath, [join(root, "SCRIPTS/MULTI_SERVER.js")], {
  cwd: temporary, windowsHide: true, env: { ...process.env, PORT: String(port) }, stdio: ["ignore", "pipe", "pipe"],
});
let browser, page, held, output = "", interceptNextSave = false;
const errors = [], consoleErrors = [];
server.stdout.on("data", b => { output += b; }); server.stderr.on("data", b => { output += b; });
const url = `http://127.0.0.1:${port}`;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const mime = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".gif": "image/gif", ".jpg": "image/jpeg", ".mp3": "audio/mpeg" };
const wanted = { ammoActive: "x4", rocketActive: "plt2026", launcherActive: "hstrm01", formation: "butterfly" };
const selections = u => ({ ammoActive: u.ammoActive, rocketActive: u.rocketActive, launcherActive: u.launcherActive, formation: u.drones.activeFormation });
try {
  let ready = false;
  for (let i = 0; i < 80; i++) {
    try { ready = (await fetch(url + "/api/ping")).ok; } catch {}
    if (ready || server.exitCode !== null) break;
    await pause(100);
  }
  assert.ok(ready, output);
  const registration = await fetch(url + "/api/register", { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ pseudo: "selection-browser", email: "selection-browser@example.test", password: "test-password-123", faction: "mmo" }) });
  assert.ok(registration.ok);
  const account = await registration.json();
  const seed = { ...account.user, revision: account.user.revision + 1, schemaVersion: 4,
    ammoActive: "x3", ammo: { x3: 10000, x4: 10000 }, rocketActive: "r310", launcherActive: "eco10",
    rockets: { r310: 100, plt2026: 100, eco10: 100, hstrm01: 100 },
    drones: { items: Array.from({ length: 8 }, (_, i) => ({ id: `test-drone-${i}`, type: "iris", level: 1, exp: 0,
      fit: { equipment: [null, null], ability: null } })), formations: ["standard", "butterfly"], activeFormation: "standard", lastFormationChangeAt: 0 },
  };
  const headers = { "content-type": "application/json", Authorization: `Bearer ${account.token}` };
  const saved = await fetch(url + "/api/save", { method: "POST", headers, body: JSON.stringify({ user: seed }) });
  assert.ok(saved.ok); const canonical = (await saved.json()).user;
  browser = await chromium.launch({ channel: "msedge", headless: true });
  page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", e => { if (e.type() === "error") consoleErrors.push(e.text()); });
  await page.route("**/*", async route => {
    const parsed = new URL(route.request().url());
    if (parsed.origin === url && parsed.pathname === "/index.html") return route.continue();
    if (parsed.origin !== url || parsed.pathname.startsWith("/api/")) {
      if (parsed.pathname === "/api/save" && interceptNextSave) {
        interceptNextSave = false;
        // Le serveur accepte la sauvegarde ; sa reponse arrive apres les clics.
        const response = await route.fetch();
        held = { route, response };
        return;
      }
      return route.continue();
    }
    try {
      const path = resolve(root, decodeURIComponent(parsed.pathname).replace(/^\/+/, "") || "index.html");
      assert.ok(path.startsWith(root + sep));
      await route.fulfill({ status: 200, contentType: mime[extname(path)] || "application/octet-stream", body: await readFile(path) });
    } catch { await route.fulfill({ status: 404, body: "Not found" }); }
  });
  await page.addInitScript(({ token, user }) => {
    if (localStorage.getItem("orbit_token") !== token) {
      localStorage.setItem("orbit_token", token);
      localStorage.setItem("orbit_user_cache", JSON.stringify({ user }));
      localStorage.setItem("orbit_current_user", JSON.stringify({ id: user.id, pseudo: user.pseudo, email: user.email }));
    }
    sessionStorage.setItem("orbit_assets_preloaded_v1", "ready");
  }, { token: account.token, user: canonical });
  const start = async () => {
    await page.waitForSelector("#loadingStartBtn:not([disabled])", { timeout: 90000 });
    await page.click("#loadingStartBtn");
    await page.waitForSelector("#game", { state: "visible", timeout: 15000 });
    await page.waitForFunction(() => !document.documentElement.classList.contains("orbitBooting") &&
      getComputedStyle(document.getElementById("loadingOverlay")).display === "none");
    // Les fenetres flottantes de la disposition initiale peuvent couvrir
    // la palette sur un petit viewport. Les fermer via leurs vrais boutons.
    for (const id of ["chatWindow", "minimap"]) {
      if (await page.locator(`#${id}`).isVisible()) await page.locator(`[data-window-id="${id}"]`).click();
    }
  };
  const openPalette = async () => {
    if (!(await page.locator(".actionPalette").isVisible())) await page.locator(".actionPaletteToggle").click();
    await page.locator(".actionPalette").waitFor({ state: "visible" });
  };
  await page.goto(url + "/index.html", { waitUntil: "domcontentloaded" }); await start();
  await page.waitForTimeout(2200);
  interceptNextSave = true;
  await page.evaluate(() => { window.selectionFlush = import("/SRC/CORE/ACCOUNT_NET.js").then(m => m.flushNetUser()); });
  for (let i = 0; i < 80 && !held; i++) await pause(50);
  assert.ok(held, "la sauvegarde precedente est en vol");
  await openPalette();
  await page.locator('[data-action-category="ammo"]').click();
  await page.locator('.actionPaletteItems [data-ammo="x4"]').click();
  await page.locator('[data-action-category="rockets"]').click();
  await page.locator('.actionPaletteItems [data-action-id="rocket:plt2026"]').click();
  await page.locator('[data-action-category="launchers"]').click();
  await page.locator('.actionPaletteItems [data-action-id="rocket:hstrm01"]').click();
  await page.locator('[data-action-category="formations"]').click();
  await page.locator('.actionPaletteItems [data-action-id="formation:butterfly"]').click();
  const check = async () => {
    const actual = await page.evaluate(async () => {
      window.__ORBIT_ENGINE__.syncPlayerFromAccount();
      const u = (await import("/SRC/CORE/ACCOUNT.js")).getCurrentUserFull();
      return { ammoActive: u.ammoActive, rocketActive: u.rocketActive, launcherActive: u.launcherActive, formation: u.drones.activeFormation };
    });
    assert.deepEqual(actual, wanted);
    assert.ok(await page.locator('.actionPaletteItems [data-action-id="formation:butterfly"]').getAttribute("class").then(c => c.includes("active")));
  };
  await check();
  await held.route.fulfill({ response: held.response }); held = null;
  await page.evaluate(() => window.selectionFlush); await check();
  // Une revision serveur plus recente force un vrai conflit HTTP 409.
  const remote = (await (await fetch(url + "/api/me", { headers })).json()).user;
  const update = await fetch(url + "/api/save", { method: "POST", headers,
    body: JSON.stringify({ user: { ...remote, revision: remote.revision + 100, credits: remote.credits + 10 } }) });
  assert.ok(update.ok);
  const conflict = await page.evaluate(async () => (await import("/SRC/CORE/ACCOUNT_NET.js")).flushNetUser());
  assert.equal(conflict.status, 409); await check();
  await page.evaluate(async () => (await import("/SRC/CORE/ACCOUNT_NET.js")).flushNetUser());
  assert.deepEqual(selections((await (await fetch(url + "/api/me", { headers })).json()).user), wanted);
  await page.reload({ waitUntil: "domcontentloaded" }); await start();
  await openPalette(); await page.locator('[data-action-category="formations"]').click();
  await check(); assert.deepEqual(errors, []);
  console.log(JSON.stringify({ selections: wanted, delayedResponse: "OK", conflict409: "OK", reload: "OK", errors }));
} catch (error) {
  console.error(JSON.stringify({ errors, consoleErrors: consoleErrors.slice(-10),
    screen: await page?.evaluate(() => document.body.innerText.slice(-2500)).catch(() => "unavailable"), server: output.slice(-2000) }));
  throw error;
} finally {
  if (browser) await browser.close();
  const stopped = server.exitCode === null ? once(server, "exit") : Promise.resolve();
  server.kill(); await stopped;
  assert.equal(dirname(resolve(temporary)), resolve(tmpdir()));
  assert.ok(basename(temporary).startsWith("orbit-selection-browser-"));
  await rm(temporary, { recursive: true, force: true });
}
