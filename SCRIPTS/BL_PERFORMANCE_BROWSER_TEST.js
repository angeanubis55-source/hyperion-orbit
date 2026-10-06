// Vrai jeu et serveur sur compte SQLite temporaire. Le crochet de simulation
// est injecte uniquement dans la reponse HTTP du test, jamais dans le jeu livre.
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
const temporary = await mkdtemp(join(tmpdir(), "orbit-bl-performance-"));
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
const hook = `window.__BL_PROFILE__ = {
  state: () => ({ map: currentMapId(), player: { x: player.x, y: player.y, dead: player.dead },
    npcs: enemies.length, visible: enemies.filter(e => Math.hypot(e.x-player.x,e.y-player.y)<1800).length,
    mindfire: enemies.filter(e => e.type === 'npc_Mindfire_Behemoth').map(e=>({ x:e.x,y:e.y,hp:e.hp,ready:NPC_TYPES[e.type].sprite._ready })),
    particles: engineTrails.length, locator: petLocator.enemyId,
    outlineCache: spriteOutlineCache.stats() }),
  mark: on => { for (const e of enemies) if(e.type==='npc_Mindfire_Behemoth') e.markT=on?60:0; },
  locator: on => {
    const npc = enemies.find(e => e.type === 'npc_Mindfire_Behemoth');
    Object.assign(account.user.pet, { active: on, activeGear: on ? 'el' : null });
    petState.ready = on; petState.x = player.x - 90; petState.y = player.y + 70;
    petLocator.enemyId = on ? npc.id : null;
    petLocator.manualType = on ? npc.type : null;
  },
  combat: on => {
    const npc = enemies.find(e => e.type === 'npc_Mindfire_Behemoth');
    if (on) Target.set(npc); else Target.clear();
    attackActive = on;
  },
  contours: () => {
    const images = NPC_TYPES.npc_Mindfire_Behemoth.sprite._imgs;
    const target = document.createElement('canvas'); target.width = 900; target.height = 800;
    const g = target.getContext('2d');
    const cache = createSpriteOutlineCache();
    const tint = document.createElement('canvas'); tint.width = 800; tint.height = 640;
    const t = tint.getContext('2d'); t.drawImage(images[0], 0, 0, 800, 640);
    t.globalCompositeOperation = 'source-in'; t.fillStyle = '#ff2e4d'; t.fillRect(0,0,800,640);
    const legacy = alpha => {
      g.globalAlpha = alpha; g.shadowColor = '#ff2e4d'; g.shadowBlur = 16;
      for (let k=0; k<8; k++) {
        const a = k/8*Math.PI*2; g.drawImage(tint,-400+Math.cos(a)*2,-320+Math.sin(a)*2,800,640);
      }
    };
    const sample = draw => {
      const start = performance.now();
      for (let i=0; i<12; i++) {
        g.clearRect(0,0,900,800); g.save(); g.translate(450,400); draw(); g.restore();
        g.getImageData(0,0,900,800); // includes raster work, not just command submission
      }
      return (performance.now()-start)/12;
    };
    cache.draw(g, images[0], 800,640,'#ff2e4d',0.75,16);
    sample(() => legacy(0.75));
    const legacyMs = sample(() => legacy(0.75));
    const cachedMs = sample(() => cache.draw(g,images[0],800,640,'#ff2e4d',0.75,16));
    cache.clear();
    for (let cycle=0; cycle<2; cycle++) for (const image of images) {
      cache.draw(g,image,800,640,'#ff2e4d',0.75,16);
    }
    const stats = cache.stats();
    const first = g.getImageData(0,0,900,800).data.some((v,i) => i%4===3 && v>0);
    g.clearRect(0,0,900,800); g.save(); g.translate(450,400);
    cache.draw(g,images[0],800,640,'#ff2e4d',1,16,true); g.restore();
    const half = g.getImageData(0,0,900,800).data;
    const topVisible = half.subarray(0,900*220*4).some((v,i) => i%4===3 && v>0);
    const bottomVisible = half.subarray(900*480*4).some((v,i) => i%4===3 && v>0);
    return { legacyMs, cachedMs, frames: images.length, stats, first, topVisible, bottomVisible };
  },
};
`;
try {
  let ready = false;
  for (let i = 0; i < 80; i++) {
    try { ready = (await fetch(url + "/api/ping")).ok; } catch {}
    if (ready || server.exitCode !== null) break;
    await pause(100);
  }
  assert.ok(ready, output);
  const registered = await fetch(url + "/api/register", { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ pseudo: "bl-performance", email: "bl-performance@example.test", password: "test-password-123", faction: "mmo" }) });
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
  const saved = await fetch(url + "/api/save", { method: "POST", headers: { "content-type": "application/json", Authorization: `Bearer ${account.token}` },
    body: JSON.stringify({ user }) });
  assert.ok(saved.ok); const canonical = (await saved.json()).user;
  browser = await chromium.launch({ channel: "msedge", headless: true });
  page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", message => { if (message.type() === "error") console.error(message.text()); });
  await page.route("**/*", async route => {
    const parsed = new URL(route.request().url());
    if (parsed.origin !== url || parsed.pathname === "/index.html" || parsed.pathname.startsWith("/api/")) return route.continue();
    try {
      const path = resolve(root, decodeURIComponent(parsed.pathname).replace(/^\/+/, ""));
      assert.ok(path.startsWith(root + sep));
      let body = await readFile(path);
      if (parsed.pathname === "/SRC/CORE/ORBIT_ENGINE.js") {
        assert.ok(body.toString().includes("window.__ORBIT_ENGINE__ = {"));
        body = Buffer.from(body.toString().replace("window.__ORBIT_ENGINE__ = {", hook + "window.__ORBIT_ENGINE__ = {"));
      }
      await route.fulfill({ status: 200, contentType: mime[extname(path)] || "application/octet-stream", body });
    } catch { await route.fulfill({ status: 404, body: "Not found" }); }
  });
  await page.addInitScript(({ token, user }) => {
    localStorage.setItem("orbit_token", token); localStorage.setItem("orbit_user_cache", JSON.stringify({ user }));
    localStorage.setItem("orbit_current_user", JSON.stringify({ id: user.id, pseudo: user.pseudo, email: user.email }));
    sessionStorage.setItem("orbit_assets_preloaded_v1", "ready"); sessionStorage.setItem("spawnMapId", "1-BL");
  }, { token: account.token, user: canonical });
  await page.goto(url + "/index.html?map=1-BL", { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#loadingStartBtn:not([disabled])", { timeout: 90000 }); await page.click("#loadingStartBtn");
  await page.waitForSelector("#game", { state: "visible", timeout: 15000 });
  await page.waitForFunction(() => !document.documentElement.classList.contains("orbitBooting") &&
    getComputedStyle(document.getElementById("loadingOverlay")).display === "none");

  await page.waitForFunction(() => window.__BL_PROFILE__.state().mindfire[0]?.ready === true);
  const contours = await page.evaluate(() => window.__BL_PROFILE__.contours());
  assert.equal(contours.frames, 32); assert.equal(contours.stats.entries, 32);
  assert.ok(contours.stats.pixels <= 8 * 1024 * 1024);
  assert.equal(contours.first, true); assert.equal(contours.topVisible, false); assert.equal(contours.bottomVisible, true);
  console.log(JSON.stringify({ contours }));
  await page.waitForTimeout(2000);
  for (const scenario of ['normal', 'marker', 'pet-locator', 'combat']) {
    await page.evaluate(scenario => {
      window.__BL_PROFILE__.mark(scenario === 'marker');
      window.__BL_PROFILE__.locator(scenario === 'pet-locator');
      window.__BL_PROFILE__.combat(scenario === 'combat');
    }, scenario);
    if (scenario === 'pet-locator') {
      // Activation recalls the PET and clears its previous selection.
      // Pick the NPC after that recall, through the delivered UI handler.
      await page.waitForFunction(() => !document.getElementById('petNpcRow').hidden);
      await page.evaluate(() => document.querySelector('#petNpcList [data-value="npc_Mindfire_Behemoth"]').click());
    }
    await page.evaluate(() => window.HyperionPerformance.reset());
    await page.waitForTimeout(3000);
    const state = await page.evaluate(() => window.__BL_PROFILE__.state());
    const timings = await page.evaluate(() => window.HyperionPerformance.snapshot());
    assert.equal(state.player.dead, false); assert.ok(state.npcs >= 101);
    assert.ok(timings['frame.draw'].count > 30);
    if (scenario === 'pet-locator') assert.notEqual(state.locator, null, 'le vrai localisateur reste actif');
    if (scenario === 'combat') assert.ok(state.mindfire[0].hp < 135000000, 'les tirs atteignent le Mindfire');
    console.log(JSON.stringify({ scenario, state, drawMs: timings['frame.draw'].averageMs,
      updateMs: timings['frame.update'].averageMs, totalMs: timings['frame.total'].averageMs, errors }));
    if (scenario === 'pet-locator' && process.argv.includes('--screenshot')) {
      await page.screenshot({ path: 'SCRIPTS/_BL_QA.png' });
    }
  }
  assert.deepEqual(errors, []);
} catch (error) {
  console.error(JSON.stringify({ errors, screen: await page?.evaluate(() => document.body.innerText.slice(-2000)).catch(() => "unavailable"), server: output.slice(-2000) }));
  throw error;
} finally {
  if (browser) await browser.close();
  const stopped = server.exitCode === null ? once(server, "exit") : Promise.resolve(); server.kill(); await stopped;
  assert.equal(dirname(resolve(temporary)), resolve(tmpdir())); assert.ok(basename(temporary).startsWith("orbit-bl-performance-"));
  await rm(temporary, { recursive: true, force: true });
}
