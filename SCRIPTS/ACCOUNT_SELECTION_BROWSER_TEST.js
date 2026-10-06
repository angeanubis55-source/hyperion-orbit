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
    if (location.pathname.endsWith("/AUTH.html")) return;
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
  await check();
  await page.setViewportSize({ width: 1920, height: 1080 });
  const readUser = () => page.evaluate(async () => (await import("/SRC/CORE/ACCOUNT.js")).getCurrentUserFull());
  const flush = () => page.evaluate(async () => (await import("/SRC/CORE/ACCOUNT_NET.js")).flushNetUser());
  const beforeBuy = await readUser();
  interceptNextSave = true;
  await page.evaluate(() => { window.economyFlush = import("/SRC/CORE/ACCOUNT_NET.js").then(m => m.flushNetUser()); });
  for (let i = 0; i < 80 && !held; i++) await pause(50);
  assert.ok(held);
  await page.locator('[data-window-id="pilotWindow"]').click();
  const displayedPilotCredits = async () => Number((await page.locator("#pilotCredits").innerText()).replace(/\D/g, ""));
  assert.equal(await displayedPilotCredits(), beforeBuy.credits);
  await page.evaluate(() => {
    window.pilotClickPerf = { node: document.querySelector("#pilotPanels [data-pilot-node]"), clickMs: null };
    window.addEventListener("click", event => {
      if (event.target.closest?.("#pilotBuyDisks")) window.pilotClickPerf.start = performance.now();
    }, true);
    window.addEventListener("click", event => {
      if (event.target.closest?.("#pilotBuyDisks")) window.pilotClickPerf.clickMs = performance.now() - window.pilotClickPerf.start;
    });
  });
  await page.locator("#pilotBuyDisks").click();
  const pilotClickPerf = await page.evaluate(() => ({ clickMs: window.pilotClickPerf.clickMs,
    nodesReused: window.pilotClickPerf.node === document.querySelector("#pilotPanels [data-pilot-node]") }));
  console.log(JSON.stringify({ pilotClickPerf }));
  assert.equal(pilotClickPerf.nodesReused, true, "l'achat conserve les noeuds de l'arbre et leurs images");
  assert.equal(await displayedPilotCredits(), beforeBuy.credits - 3_000_000);
  await page.locator('[data-pilot-node="engineering"]').click();
  await page.locator('[data-pilot-invest="engineering"]').click();
  await page.locator('[data-pilot-invest="engineering"]').click();
  assert.equal((await readUser()).pilotSkills.spent.engineering, 2);
  await held.route.fulfill({ response: held.response }); held = null;
  await page.evaluate(() => window.economyFlush);
  for (let i = 0; i < 2; i++) {
    const remote = (await (await fetch(url + "/api/me", { headers })).json()).user;
    const update = await fetch(url + "/api/save", { method: "POST", headers,
      body: JSON.stringify({ user: { ...remote, revision: remote.revision + 100, credits: remote.credits + 500 } }) });
    assert.ok(update.ok); assert.equal((await flush()).status, 409);
    const local = await readUser();
    assert.equal(local.pilotSkills.disks, beforeBuy.pilotSkills.disks + 10);
    assert.equal(local.pilotSkills.spent.engineering, 2);
    assert.equal(local.credits, beforeBuy.credits - 3_000_000 + (i + 1) * 500);
    assert.equal(await displayedPilotCredits(), local.credits);
    assert.ok((await page.locator('[data-pilot-node="engineering"]').getAttribute("title")).includes("2/5"));
  }
  await flush();
  await page.locator('[data-window-id="pilotWindow"]').click();
  await page.locator('[data-window-id="hangarWindow"]').click();
  await page.locator('[data-fit="sync-hangar"]').click();
  assert.equal(await page.locator("#fitSlotsGens .slotCell.filled").count(), 11);
  await page.locator('#fitCard [data-cfg="2"]').click();
  await page.locator('#fitCard [data-cfg="1"]').click();
  const beforeSale = await readUser();
  const sold = await page.evaluate(async () => (await import("/SRC/CORE/ACCOUNT.js")).sellItem("shd_sg3nb02", 11, { force: true }));
  assert.equal(sold.ok, true); assert.equal(sold.stripped, 22);
  await page.waitForFunction(() => document.querySelectorAll("#fitSlotsGens .slotCell.filled").length === 0);
  await page.locator('#fitCard [data-cfg="2"]').click();
  assert.equal(await page.locator("#fitSlotsGens .slotCell.filled").count(), 0, "le brouillon de la deuxième configuration est aussi nettoyé");
  await page.locator("#fitTitlebarSave").click();
  const afterSale = await readUser(); assert.equal(afterSale.credits, beforeSale.credits + 55_000_000);
  for (let i = 0; i < 3; i++) { const result = await flush(); if (result.ok) break; }
  const persisted = (await (await fetch(url + "/api/me", { headers })).json()).user;
  assert.equal(persisted.credits, afterSale.credits); assert.equal(persisted.inventory.counts.shd_sg3nb02 || 0, 0);
  assert.equal(persisted.pilotSkills.disks, 10); assert.equal(persisted.pilotSkills.spent.engineering, 2);
  for (const cfg of ["1", "2"]) assert.ok(persisted.hangars[0].fits[cfg].gens.every(v => !v));
  await page.reload({ waitUntil: "domcontentloaded" }); await start();
  const restored = await readUser(); assert.equal(restored.credits, afterSale.credits);
  assert.equal(restored.pilotSkills.spent.engineering, 2); assert.equal(restored.pilotSkills.disks, 10);
  await page.locator('[data-window-id="pilotWindow"]').click();
  assert.equal(await displayedPilotCredits(), restored.credits);
  const pilotScreenshot = join(tmpdir(), "orbit-pilot-window.png");
  await page.locator("#pilotWindow").screenshot({ path: pilotScreenshot });
  await page.locator('[data-window-id="pilotWindow"]').click();
  await page.locator('[data-window-id="skylabWindow"]').click();
  await page.locator('[data-sky-action="select"][data-module="transport"]').click();
  const sendInput = page.locator('#skylabPopup input[data-sky-send="prometium"]');
  await sendInput.fill("1234");
  await sendInput.press("Control+a");
  const focusSurvived = await page.evaluate(async () => {
    const input = document.querySelector('#skylabPopup input[data-sky-send="prometium"]');
    const { getCurrentUserFull } = await import("/SRC/CORE/ACCOUNT.js");
    const { renderSkylabWindow } = await import("/UI/UI_SKYLAB.js");
    window.__ORBIT_ENGINE__.syncPlayerFromAccount();
    const user = getCurrentUserFull();
    // Stocks, solde et délai changent pendant la saisie.
    user.skylab.stock.prometium += 100;
    user.credits += 5000;
    user.skylab.transportReadyAt = Date.now() + 60000;
    renderSkylabWindow();
    const sameAfterStock = input === document.querySelector('#skylabPopup input[data-sky-send="prometium"]')
      && document.activeElement === input;
    // Un module termine son amélioration : la carte doit aussi se rafraîchir.
    user.skylab.modules.prometium_collector.level = 2;
    renderSkylabWindow();
    const sameAfterMap = input === document.querySelector('#skylabPopup input[data-sky-send="prometium"]')
      && document.activeElement === input;
    const sendDisabled = document.querySelector('#skylabPopup [data-sky-action="send"]').disabled;
    user.skylab.transportReadyAt = 0;
    renderSkylabWindow();
    const sendEnabled = !document.querySelector('#skylabPopup [data-sky-action="send"]').disabled;
    return { sameAfterStock, sameAfterMap, sendDisabled, sendEnabled, value: input.value };
  });
  assert.deepEqual(focusSurvived, { sameAfterStock: true, sameAfterMap: true, sendDisabled: true, sendEnabled: true, value: "1234" });
  // Ctrl+A doit rester sélectionné malgré les rafraîchissements : 42 remplace 1234.
  await page.keyboard.type("42");
  assert.equal(await sendInput.inputValue(), "42");
  await page.waitForTimeout(1500);
  assert.equal(await sendInput.evaluate(el => el === document.activeElement), true);
  assert.equal(await sendInput.inputValue(), "42");
  await page.locator('[data-window-id="skylabWindow"]').click();
  await page.locator('[data-window-id="auctionWindow"]').click();
  const auctionInput = page.locator('#auctionWindow input[data-auction-bid]').first();
  await auctionInput.waitFor({ state: "visible" });
  await auctionInput.fill("123456"); await auctionInput.press("Control+a");
  assert.equal(await page.evaluate(async () => {
    const input = document.querySelector('#auctionWindow input[data-auction-bid]');
    const { renderAuctionWindow } = await import("/UI/UI_AUCTION.js");
    // Mise serveur / rattrapage de l'affichage pendant une saisie.
    renderAuctionWindow();
    return document.activeElement === input && document.querySelector('#auctionWindow input[data-auction-bid]') === input;
  }), true);
  await page.keyboard.type("42"); assert.equal(await auctionInput.inputValue(), "42");
  // Une confirmation ne doit pas détacher les objets employés par le jeu.
  assert.equal(await page.evaluate(async () => {
    const { getCurrentUserFull } = await import("/SRC/CORE/ACCOUNT.js");
    const { flushNetUser } = await import("/SRC/CORE/ACCOUNT_NET.js");
    const user = getCurrentUserFull(), pet = user.pet, resources = user.inventory.resources;
    const result = await flushNetUser();
    const after = getCurrentUserFull();
    return result.ok && user === after && pet === after.pet && resources === after.inventory.resources;
  }), true);
  await page.locator('[data-window-id="auctionWindow"]').click();
  interceptNextSave = true;
  const logoutPurchase = await page.evaluate(async () => {
    const account = await import("/SRC/CORE/ACCOUNT.js");
    const bought = account.buyLogDiskPack();
    return { bought, credits: account.getCurrentUserFull().credits, disks: account.getCurrentUserFull().pilotSkills.disks };
  });
  assert.equal(logoutPurchase.bought.ok, true);
  await page.locator("#btnSessionMenu").click();
  await page.locator("#btnLogout").click();
  for (let i = 0; i < 80 && !held; i++) await pause(50);
  assert.ok(held, "la déconnexion attend la sauvegarde de l'achat");
  assert.equal(await page.locator("#btnLogout").isDisabled(), true);
  assert.equal(await page.locator("#btnLogout").innerText(), "Sauvegarde…");
  assert.equal(await page.evaluate(() => localStorage.getItem("orbit_token")), account.token);
  const savedAtLogout = (await (await fetch(url + "/api/me", { headers })).json()).user;
  assert.equal(savedAtLogout.credits, logoutPurchase.credits);
  assert.equal(savedAtLogout.pilotSkills.disks, logoutPurchase.disks);
  await held.route.fulfill({ response: held.response }); held = null;
  await page.waitForURL("**/PUBLIC/AUTH.html");
  assert.equal(await page.evaluate(() => localStorage.getItem("orbit_token")), null);
  let revoked;
  for (let i = 0; i < 30; i++) {
    revoked = await fetch(url + "/api/me", { headers });
    if (revoked.status === 401) break;
    await pause(50);
  }
  assert.equal(revoked.status, 401);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ selections: wanted, delayedResponse: "OK", conflict409: "OK", reload: "OK",
    pilotSkills: "OK", logDisks: "OK", pilotCreditBalance: "OK", pilotScreenshot,
    saleWithOpenDraft: "OK", bothConfigurations: "OK", skylabInputFocus: "OK", auctionInputFocus: "OK",
    liveAccountReferences: "OK", logoutWaitsForSave: "OK", credits: restored.credits, errors }));
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
