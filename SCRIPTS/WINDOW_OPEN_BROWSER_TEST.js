// Ouverture des fenetres avec un gros inventaire, sur compte/serveur temporaires.
// Verifie les mesures de geometrie et le placement apres rendu et redimensionnement.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { createServer } from "node:net";
import { basename, dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright-core";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const temporary = await mkdtemp(join(tmpdir(), "orbit-window-open-"));
await writeFile(join(temporary, "index.html"), await readFile(join(root, "index.html")));
const reserve = createServer();
await new Promise(resolve => reserve.listen(0, "127.0.0.1", resolve));
const port = reserve.address().port;
await new Promise(resolve => reserve.close(resolve));
const fixture = join(temporary, 'fixture.mjs');
await writeFile(fixture, 'import { ZoneNpcSim } from ' + JSON.stringify(new URL('../SCRIPTS/NPC_ROOM.js', import.meta.url).href) + '; ZoneNpcSim.prototype.drainPlayerHits = function() { this.playerHits.length = 0; return []; };');
const server = spawn(process.execPath, ['--import', pathToFileURL(fixture).href, join(root, 'SCRIPTS/MULTI_SERVER.js')], {
  cwd: temporary, windowsHide: true, env: { ...process.env, PORT: String(port) }, stdio: ["ignore", "pipe", "pipe"],
});
let browser, page, output = "";
server.stdout.on("data", b => { output += b; }); server.stderr.on("data", b => { output += b; });
const url = `http://127.0.0.1:${port}`, errors = [];
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".gif": "image/gif", ".jpg": "image/jpeg", ".mp3": "audio/mpeg" };
try {
  let ready = false;
  for (let i = 0; i < 80; i++) {
    try { ready = (await fetch(url + "/api/ping")).ok; } catch {}
    if (ready || server.exitCode !== null) break;
    await pause(100);
  }
  assert.ok(ready, output);
  const registered = await fetch(url + "/api/register", { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ pseudo: "window-open", email: "window-open@example.test", password: "test-password-123", faction: "mmo" }) });
  assert.ok(registered.ok); const account = await registered.json();
  const petFit = { lasers: [null], generators: [null, null], gears: ['gear_gel1'], protocols: [null, null] };
  const user = { ...account.user, revision: account.user.revision + 1, schemaVersion: 4,
    inventory: { ...account.user.inventory, counts: { laser_lf1: 1, gear_gel1: 1 } },
    ammo: { x1: 10000 }, ammoActive: 'x1',
    pet: { owned: true, id: 'niveau1', exp: 0, hp: 4000, active: false, mode: 'passive', fuel: 50000,
      fitsByHangar: { 'browser-hangar': { '1': petFit, '2': petFit } } },
    hangars: [{ id: "browser-hangar", active: true, shipId: "PhoenixBleu", activeConfig: 1,
      lastMap: "1-BL", lastPos: { x: 20600, y: 6220 }, lastHpPct: 1, lastShPct: 1,
      fits: { "1": { lasers: ['laser_lf1'], gens: [], extras: [], shipMods: [] }, "2": { lasers: [], gens: [], extras: [], shipMods: [] } } }],
  };
  user.inventory.shipModules = Array.from({ length: 1200 }, (_, i) => ({
    id: `module-${i}`, stats: { damage: i, shield: 10 }, description: 'module'.repeat(95),
  }));
  user.inventory.moduleRollHistory = [];
  const saved = await fetch(url + "/api/save", { method: "POST", headers: { "content-type": "application/json", Authorization: `Bearer ${account.token}` },
    body: JSON.stringify({ user }) });
  assert.ok(saved.ok); const canonical = (await saved.json()).user;
  browser = await chromium.launch({ channel: "msedge", headless: true });
  page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  page.on("pageerror", e => errors.push(e.message));
  await page.route("**/*", async route => {
    const parsed = new URL(route.request().url());
    if (parsed.origin !== url || parsed.pathname === "/index.html" || parsed.pathname.startsWith("/api/")) return route.continue();
    try {
      const path = resolve(root, decodeURIComponent(parsed.pathname).replace(/^\/+/, ""));
      assert.ok(path.startsWith(root + sep));
      let body = await readFile(path);
      if (parsed.pathname === "/SRC/CORE/ORBIT_ENGINE.js") {
        const source = body.toString("utf8"), end = source.lastIndexOf("\n}");
        assert.ok(end > 0);
        body = source.slice(0, end) + `\nwindow.__backgroundRefreshTest = {
          refresh() { renderGalaxyGateWindow(); renderRefineryWindow(); renderBoosterWindow(); updatePetHud(); drawMinimap(); },
          allowed(id) { return shouldRefreshWindow(id); }
        };` + source.slice(end);
      }
      await route.fulfill({ status: 200, contentType: mime[extname(path)] || "application/octet-stream", body });
    } catch { await route.fulfill({ status: 404, body: "Not found" }); }
  });
  await page.addInitScript(({ token, user }) => {
    if (localStorage.getItem("orbit_token")) return;
    localStorage.setItem("orbit_token", token); localStorage.setItem("orbit_user_cache", JSON.stringify({ user }));
    localStorage.setItem("orbit_current_user", JSON.stringify({ id: user.id, pseudo: user.pseudo, email: user.email }));
    sessionStorage.setItem("orbit_assets_preloaded_v1", "ready"); sessionStorage.setItem("spawnMapId", "1-BL");
  }, { token: account.token, user: canonical });
  await page.goto(url + "/index.html?map=1-BL", { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#loadingStartBtn:not([disabled])", { timeout: 90000 }); await page.click("#loadingStartBtn");
  await page.waitForSelector("#game", { state: "visible", timeout: 15000 });
  await page.waitForFunction(() => !document.documentElement.classList.contains("orbitBooting") &&
    getComputedStyle(document.getElementById("loadingOverlay")).display === "none");

  await page.waitForTimeout(1500);

  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const results = [];
  for (const id of ['galaxyGateWindow', 'settingsWindow', 'refineryWindow', 'pilotWindow']) {
    await page.evaluate(id => {
      window.GameWindowManager.close(id);
      localStorage.setItem(`orbit_hud_window_pos:${id}`, JSON.stringify({ left: 99999, top: 99999, width: 900 }));
    }, id);
    const times = [], reads = [];
    for (let repeat = 0; repeat < 3; repeat++) {
      const measurement = await page.evaluate(id => {
        const card = document.getElementById(id), original = Element.prototype.getBoundingClientRect;
        let reads = 0;
        Element.prototype.getBoundingClientRect = function() {
          if (this === card) reads++;
          return original.call(this);
        };
        const start = performance.now();
        try {
          window.GameWindowManager.restore(id);
          return { ms: performance.now() - start, reads };
        } finally { Element.prototype.getBoundingClientRect = original; }
      }, id);
      times.push(measurement.ms); reads.push(measurement.reads);
      assert.equal(measurement.reads, 1, `${id}: une mesure suffit apres application de la position`);
      await page.waitForFunction(id => !document.getElementById(id).classList.contains('gameWinOpening'), id);
      const position = await page.evaluate(id => {
        const el = document.getElementById(id), r = el.getBoundingClientRect();
        return { left: r.left, top: r.top, right: r.right, bottom: r.bottom,
          width: r.width, height: r.height, maxRight: innerWidth - 8, maxBottom: innerHeight - 8,
          open: window.GameWindowManager.isOpen(id), animating: el.classList.contains('gameWinOpening') };
      }, id);
      assert.equal(position.open, true); assert.equal(position.animating, false);
      assert.ok(position.width >= 160 && position.height >= 40, `${id}: taille visible`);
      assert.ok(position.left >= 7 && position.top >= 7 && position.right <= position.maxRight + 1 &&
        position.bottom <= position.maxBottom + 1, `${id}: ${JSON.stringify(position)}`);
      await page.evaluate(id => window.GameWindowManager.close(id), id);
      await page.waitForTimeout(100);
    }
    results.push({ id, reads, timesMs: times.map(t => Math.round(t * 10) / 10) });
  }
  // La position sauvegardee reste bornee apres un changement de viewport.
  await page.setViewportSize({ width: 900, height: 700 });
  await page.evaluate(() => window.GameWindowManager.restore('galaxyGateWindow'));
  await page.waitForFunction(() => !document.getElementById('galaxyGateWindow').classList.contains('gameWinOpening'));
  const visible = await page.evaluate(() => {
    const r = document.getElementById('galaxyGateWindow').getBoundingClientRect();
    return r.left >= 7 && r.top >= 7 && r.right <= innerWidth - 7 && r.bottom <= innerHeight - 7;
  });
  assert.equal(visible, true);

  // Le select garde le comportement actuel par defaut, puis suspend les
  // rendus fermes sans rechargement. Le contenu se reconstruit a l'ouverture.
  await page.evaluate(() => window.GameWindowManager.restore('settingsWindow'));
  assert.equal(await page.locator('#optBackgroundRefresh').inputValue(), 'enabled');
  assert.deepEqual(await page.locator('#optBackgroundRefresh option').allTextContents(), ['Activée', 'Désactivée']);
  assert.ok((await page.locator('#settingsWindow').textContent()).includes('Affichage & Performances'));
  const ids = ['galaxyGateWindow', 'refineryWindow', 'boosterWindow', 'petWindow', 'minimap'];
  await page.evaluate(ids => ids.forEach(id => window.GameWindowManager.close(id)), ids);
  await page.waitForTimeout(500);
  const contentWrites = () => page.evaluate(async ids => {
    let writes = 0;
    const observer = new MutationObserver(changes => { writes += changes.length; });
    for (const id of ids) observer.observe(document.getElementById(id), { subtree: true, childList: true, characterData: true });
    window.__backgroundRefreshTest.refresh();
    await Promise.resolve();
    observer.disconnect();
    return writes;
  }, ids);
  assert.ok(await contentWrites() > 0, 'active : le comportement de rendu existant est conserve');
  await page.selectOption('#optBackgroundRefresh', 'disabled');
  assert.equal(await contentWrites(), 0, 'desactive : aucune reconstruction de contenu ferme');
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('orbit_game_settings_v1')).backgroundRefresh), 'disabled');
  assert.equal(await page.evaluate(() => window.__backgroundRefreshTest.allowed('galaxyGateWindow')), false);
  await page.evaluate(() => {
    document.getElementById('ggRewards').innerHTML = '<i>contenu perime</i>';
    window.GameWindowManager.restore('galaxyGateWindow');
  });
  assert.ok(!(await page.locator('#ggRewards').textContent()).includes('contenu perime'), 'reouverture : contenu actualise immediatement');
  assert.equal(await page.evaluate(() => window.__backgroundRefreshTest.allowed('galaxyGateWindow')), true);
  await page.evaluate(() => window.GameWindowManager.minimize('galaxyGateWindow'));
  assert.equal(await contentWrites(), 0, 'une fenetre reduite est aussi suspendue');

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#loadingStartBtn:not([disabled])', { timeout: 90000 });
  await page.click('#loadingStartBtn');
  await page.waitForFunction(() => getComputedStyle(document.getElementById('loadingOverlay')).display === 'none');
  await page.evaluate(() => window.GameWindowManager.restore('settingsWindow'));
  assert.equal(await page.locator('#optBackgroundRefresh').inputValue(), 'disabled', 'reglage conserve apres rechargement');
  assert.equal(await page.evaluate(() => window.__backgroundRefreshTest.allowed('galaxyGateWindow')), false);
  assert.equal(await page.locator('#starMapNodes .starMapNode').count(), 0, 'carte fermee : aucune construction au demarrage');
  await page.evaluate(() => window.GameWindowManager.restore('starMapWindow'));
  assert.ok(await page.locator('#starMapNodes .starMapNode').count() > 20, 'carte stellaire construite a la premiere ouverture');
  await page.evaluate(() => window.GameWindowManager.restore('botWindow'));
  assert.ok(await page.locator('#botNpcList .botNpcRow').count() > 0, 'liste du bot construite a la premiere ouverture');
  await page.evaluate(() => window.GameWindowManager.close('botWindow'));
  await page.evaluate(() => window.GameWindowManager.restore('settingsWindow'));
  await page.click('#btnResetAllSettings');
  assert.equal(await page.locator('#optBackgroundRefresh').inputValue(), 'enabled');
  assert.equal(await page.evaluate(() => window.__backgroundRefreshTest.allowed('galaxyGateWindow')), true, 'reinitialisation appliquee immediatement');
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ results, backgroundRefresh: 'default, closed, reopened, minimized, persisted, reset: OK' }));
} finally {
  if (browser) await browser.close();
  const stopped = server.exitCode === null ? once(server, "exit") : Promise.resolve(); server.kill(); await stopped;
  assert.equal(dirname(resolve(temporary)), resolve(tmpdir())); assert.ok(basename(temporary).startsWith("orbit-window-open-"));
  await rm(temporary, { recursive: true, force: true });
}
