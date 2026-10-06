// Jeu et backend reels, compte SQLite temporaire. Les assets sont lus dans
// le workspace ; aucune sauvegarde ne touche les comptes existants.
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { createServer } from "node:net";
import { basename, dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const temporary = await mkdtemp(join(tmpdir(), "orbit-pilot-purchase-"));
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
let browser, page, output = "";
const errors = [], consoleErrors = [];
server.stdout.on("data", b => { output += b; }); server.stderr.on("data", b => { output += b; });
const url = `http://127.0.0.1:${port}`;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const mime = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".gif": "image/gif", ".jpg": "image/jpeg", ".mp3": "audio/mpeg" };

const traced = {
  "/SRC/CORE/ACCOUNT.js": ["prepareCurrentUserMutation", "getCurrentUserFull", "ensureUserShape", "saveUser", "buyLogDiskPack", "updateCurrentUserProgress", "petShieldCapacity"],
  "/SRC/CORE/ACCOUNT_NET.js": ["netStore", "flushAccountCache"],
  "/UI/UI_TDM.js": ["render"],
  "/UI/UI_PILOT_SKILLS.js": ["refreshPilotSummary", "refreshPilotCredits", "livePilot", "onPilotClick"],
  "/SRC/CORE/ORBIT_ENGINE.js": ["saveProgressNow", "saveProgressNowMeasured", "showToast"],
};
async function instrument(path) {
  const key = "/" + path.slice(root.length + 1).split(sep).join("/");
  let body = process.env.PILOT_PURCHASE_BASELINE === "1" && traced[key]
    ? execFileSync("git", ["-c", `safe.directory=${root.split(sep).join("/")}`, "show", `HEAD:${key.slice(1)}`], { cwd: root, windowsHide: true, maxBuffer: 16 * 1024 * 1024 })
    : await readFile(path);
  if (!traced[key]) return body;
  let extra = "";
  {
    for (const name of traced[key]) extra += `
const original_${name} = ${name}; ${name} = function(...args) {
      const startedAt = performance.now(); try { return original_${name}(...args); }
      finally { if(window.__pilotTrace) window.__pilotTrace.push({ name: "${name}", ms: performance.now()-startedAt }); }
    };
`;
  }
  if (key.endsWith("ORBIT_ENGINE.js")) extra += `
window.__pilotDirty = () => { player.credits += 12345; player.ammo.x4--; player.rockets.plt2026--; markProgressDirty(); };
`;
  return Buffer.from(key.endsWith("ORBIT_ENGINE.js")
    ? body.toString().replace("window.__ORBIT_ENGINE__ = {", extra + "\nwindow.__ORBIT_ENGINE__ = {")
    : body.toString() + extra);
}

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
    ship: "goliath", inventory: { ships: ["goliath"], modules: ["shd_sg3nb02"], counts: { shd_sg3nb02: 11 } },
    pilotSkills: { points: 10, disks: 0, resets: 0, spent: { shiphull01: 2 } },
    hangars: [{ id: "sync-hangar", active: true, shipId: "goliath", activeConfig: 1, lastMap: "1-1", lastPos: { x: 1500, y: 1500 },
      fits: { "1": { lasers: [], gens: Array(11).fill("shd_sg3nb02"), extras: [], shipMods: [] },
        "2": { lasers: [], gens: Array(11).fill("shd_sg3nb02"), extras: [], shipMods: [] } } }],
    ammoActive: "x3", ammo: { x3: 10000, x4: 10000 }, rocketActive: "r310", launcherActive: "eco10",
    rockets: { r310: 100, plt2026: 100, eco10: 100, hstrm01: 100 },
    drones: { items: Array.from({ length: 8 }, (_, i) => ({ id: `test-drone-${i}`, type: "iris", level: 1, exp: 0,
      fit: { equipment: [null, null], ability: null } })), formations: ["standard", "butterfly"], activeFormation: "standard", lastFormationChangeAt: 0 },
  };
  seed.credits = 1_000_000_000;
  seed.pet = { owned: true, active: false, exp: 1000000, fuel: 50000, hp: 1000, sh: 0 };
  for (let i = 0; i < 49; i++) seed.hangars.push({ id: `reserve-${i}`, shipId: "goliath", active: false, activeConfig: 1,
    lastMap: "1-1", lastPos: { x: 1500, y: 1500 }, fits: { "1": {}, "2": {} } });
  seed.inventory.moduleRollHistory = Array.from({ length: 500 }, (_, i) => ({ id: `roll-${i}`, at: i, shipId: "goliath", bonuses: [{ stat: "damage", pct: i % 20 }] }));
  seed.inventory.shipModules = Array.from({ length: 500 }, (_, i) => ({ id: `module-${i}`, kind: "shipModule", shipId: "goliath", familyId: "goliath", type: "dmg", bonuses: [{ stat: "damage", pct: 1 }] }));
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
    if (parsed.origin !== url || parsed.pathname.startsWith("/api/")) return route.continue();
    try {
      const path = resolve(root, decodeURIComponent(parsed.pathname).replace(/^\/+/, "") || "index.html");
      assert.ok(path.startsWith(root + sep));
      await route.fulfill({ status: 200, contentType: mime[extname(path)] || "application/octet-stream", body: await instrument(path) });
    } catch { await route.fulfill({ status: 404, body: "Not found" }); }
  });
  await page.addInitScript(({ token, user }) => {
    if (location.pathname.endsWith("/AUTH.html")) return;
    if (localStorage.getItem("orbit_token") !== token) {
      localStorage.setItem("orbit_token", token);
      localStorage.setItem("orbit_user_cache", JSON.stringify({ user }));
      localStorage.setItem("orbit_current_user", JSON.stringify({ id: user.id, pseudo: user.pseudo, email: user.email }));
    }
    sessionStorage.setItem("orbit_assets_preloaded_v1", "ready");
  }, { token: account.token, user: canonical });
  const start = async () => {
    assert.deepEqual(errors, []);
    await page.waitForSelector("#loadingStartBtn:not([disabled])", { timeout: 30000 });
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
  await page.goto(url + "/index.html", { waitUntil: "domcontentloaded" }); await start();
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.locator('[data-window-id="pilotWindow"]').click();
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  const samples = [];
  await page.evaluate(() => {
    window.__pilotSamples = [];
    window.addEventListener("click", event => {
      if (!event.target.closest?.("#pilotBuyDisks")) return;
      window.__pilotStarted = performance.now(); window.__pilotTrace = [];
    }, true);
    window.addEventListener("click", event => {
      if (!event.target.closest?.("#pilotBuyDisks")) return;
      const clickMs = performance.now() - window.__pilotStarted;
      const clickTrace = [...window.__pilotTrace];
      requestAnimationFrame(() => {
        window.__pilotSamples.push({ clickMs, frameMs: performance.now() - window.__pilotStarted, clickTrace, trace: window.__pilotTrace });
        window.__pilotTrace = null;
      });
    });
  });
  for (let i = 0; i < 6; i++) {
    await page.evaluate(() => window.__pilotDirty());
    await page.locator("#pilotBuyDisks").click();
    await page.waitForFunction(count => window.__pilotSamples.length === count, i + 1);
    await page.waitForTimeout(100);
  }
  samples.push(...await page.evaluate(() => window.__pilotSamples));
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  for (let i = 0; i < 3; i++) {
    const result = await page.evaluate(async () => (await import("/SRC/CORE/ACCOUNT_NET.js")).flushNetUser());
    if (result.ok) break;
  }
  const persisted = (await (await fetch(url + "/api/me", { headers })).json()).user;
  assert.equal(persisted.pilotSkills.disks, 60);
  assert.equal(persisted.credits, seed.credits + 6 * 12345 - 6 * 3_000_000);
  assert.equal(persisted.ammo.x4, 9994);
  assert.equal(persisted.rockets.plt2026, 94);
  assert.deepEqual(errors, []);
  if (process.env.PILOT_PURCHASE_BASELINE !== "1") {
    for (const sample of samples) assert.equal(sample.clickTrace.some(entry =>
      ["saveProgressNow", "ensureUserShape", "getCurrentUserFull", "petShieldCapacity", "render"].includes(entry.name)), false,
      "aucune sauvegarde compl?te, migration ou reconstruction d'inventaire au clic");
  }
  console.log(JSON.stringify({ baseline: process.env.PILOT_PURCHASE_BASELINE === "1", cpuThrottle: 4, hangars: 50, modules: 500,
    samples: process.env.PILOT_PURCHASE_TRACE === "1" ? samples : samples.map(({ clickMs, frameMs }) => ({ clickMs, frameMs })),
    credits: persisted.credits, disks: persisted.pilotSkills.disks, errors }));
} catch (error) {
  console.error(JSON.stringify({ errors, consoleErrors: consoleErrors.slice(-10),
    screen: await page?.evaluate(() => document.body.innerText.slice(-2000)).catch(() => "unavailable") }));
  throw error;
} finally {
  if (browser) await browser.close();
  const stopped = server.exitCode === null ? once(server, "exit") : Promise.resolve();
  server.kill(); await stopped;
  assert.equal(dirname(resolve(temporary)), resolve(tmpdir()));
  assert.ok(basename(temporary).startsWith("orbit-pilot-purchase-"));
  await rm(temporary, { recursive: true, force: true });
}
