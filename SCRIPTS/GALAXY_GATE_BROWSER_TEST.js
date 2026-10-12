// Audit reel des finales des neuf GG sur compte et serveur temporaires.
// Les commandes de simulation et horloges controlees sont injectees par le test uniquement.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { createServer } from "node:net";
import { basename, dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright-core";
import { GALAXY_GATE_DEFINITIONS } from '../SRC/CORE/GALAXY_GATES.js';

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const temporary = await mkdtemp(join(tmpdir(), "orbit-gg-audit-"));
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
    body: JSON.stringify({ pseudo: "gg-audit", email: "gg-audit@example.test", password: "test-password-123", faction: "mmo" }) });
  assert.ok(registered.ok); const account = await registered.json();
  const petFit = { lasers: [null], generators: [null, null], gears: ['gear_gel1'], protocols: [null, null] };
  const user = { ...account.user, revision: account.user.revision + 1, schemaVersion: 4,
    inventory: { ...account.user.inventory, counts: { laser_lf1: 1, gear_gel1: 1 }, resources: { prometium: 3000, xenomit: 17, kyhalon: 11, tetrathrin: 12, bifenon: 13, schism: 14, diametrion: 15 } },
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
        body = source.slice(0, end) + `\nwindow.__ggAudit = {
          timers: [],
          async prepareSpin() {
            started = false;
            const mod = await import('./ACCOUNT.js');
            const gg = await import('./GALAXY_GATES.js');
            const user = getCurrentUserFull();
            user.galaxyGates = gg.normalizeGalaxyGateState({ energy: 10, lastOpenedGate: 'alpha' });
            mod.saveUser(user, { source: 'progress' });
            account.user = user;
            await flushNetUser();
          },
          spin(roll) {
            const previousRandom = Math.random;
            Math.random = () => roll;
            try { document.getElementById('ggSpinBtn').click(); }
            finally { Math.random = previousRandom; }
            return { selected: selectedGalaxyGateId,
              tab: document.querySelector('[data-gg-gate].active')?.dataset.ggGate,
              state: structuredClone(account.user.galaxyGates) };
          },
          snapshot() { return { map: window.__CURRENT_MAP_ID__, wave, remaining: waveSpawns.remaining,
            enemies: enemies.map(e => ({ type: e.type, boss: !!e._onKill?.tp?.factionBase })),
            pending: gateCompletionPending, betweenWaves, gates: structuredClone(account.user.galaxyGates),
            xenomit: Number(account.user.inventory?.resources?.xenomit) || 0, rewardPhase: this.rewardPhase,
            materials: Object.fromEntries(['kyhalon', 'tetrathrin', 'bifenon', 'schism', 'diametrion'].map(id => [id, Number(account.user.inventory?.resources?.[id]) || 0])),
            materialPhase: this.materialPhase }; },
          async prepare(id) {
            started = false;
            this.rewardPhase = null;
            this.materialPhase = null;
            const mod = await import('./ACCOUNT.js');
            const user = getCurrentUserFull(), last = GALAXY_GATE_DEFINITIONS[id].maxWaves;
            user.galaxyGates.active = id;
            user.galaxyGates.activeWave = last;
            user.galaxyGates.waves[id] = last;
            user.galaxyGates.waveKills[id] = { wave: last, killed: 0 };
            user.galaxyGates.deployed[id] = false;
            mod.saveUser(user, { source: 'progress' });
            account.user = user;
            await flushNetUser();
            await window.__SWITCH_MAP__(id);
            started = false;
            waveStartCountdown = 0;
            return this.snapshot();
          },
          spawn() {
            const before = started; started = true; waveStartCountdown = 0;
            try {
              for (let safety = 0; waveSpawns.remaining && safety < 200; safety++) {
                waveSpawns.timer = 0; waveController(0.1);
              }
            } finally { started = before; }
            return this.snapshot();
          },
          kill(bosses) {
            for (const enemy of enemies) if (!!enemy._onKill?.tp?.factionBase === bosses) { enemy.hp = 0; enemy.sh = 0; }
            processDeathsMeasured();
            const before = started; started = true;
            try { waveController(0.1); } finally { started = before; }
            return this.snapshot();
          },
          resume() {
            enemies.length = 0; loadAccountUser(); resetRun({ randomSpawn: false });
            return this.spawn();
          },
          async finish() {
            const timers = this.timers.splice(0).sort((a, b) => a.delay - b.delay);
            for (const timer of timers) {
              const before = timer.delay === 3000 ? this.snapshot().xenomit : null;
              const materialsBefore = timer.delay === 3000 ? this.snapshot().materials : null;
              const wasStarted = started;
              if (timer.delay === 3000) started = true;
              try { await timer.callback(); } finally { started = wasStarted; }
              if (before !== null) this.rewardPhase = { delay: timer.delay, before, after: this.snapshot().xenomit };
              if (materialsBefore) this.materialPhase = { before: materialsBefore, after: this.snapshot().materials };
            }
            await flushNetUser();
            // Le premier envoi peut porter la validation seule ; attendre
            // également le snapshot suivant contenant les gains différés.
            const net = await import('./ACCOUNT_NET.js');
            for (let attempt = 0; attempt < 10 && net.netHasPendingSave(); attempt++) await net.flushNetUser();
            if (net.netHasPendingSave()) throw new Error('Sauvegarde GG non confirmee');
            return this.snapshot();
          }
        };` + source.slice(end);
        body = body.replace('function scheduleGalaxyGateCompletion(gateId, completion) {',
          'function scheduleGalaxyGateCompletion(gateId, completion) { const setTimeout = (callback, delay) => window.__ggAudit.timers.push({ callback, delay });');
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

  const results = [];
  const spinResults = [];
  for (const id of ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'kappa', 'lambda']) {
    for (const roll of [0.4, 0.1, 0.25]) {
      await page.evaluate(() => window.__ggAudit.prepareSpin());
      await page.evaluate(id => {
        document.querySelector(`[data-gg-gate="${id}"]`).click();
        document.getElementById('ggSpinCount').value = '1';
      }, id);
      for (let spin = 1; spin <= 2; spin++) {
        const spun = await page.evaluate(roll => window.__ggAudit.spin(roll), roll);
        assert.equal(spun.selected, id, `${id} : selection au spin ${spin}, tirage ${roll}`);
        assert.equal(spun.tab, id, `${id} : onglet toujours actif`);
        assert.equal(spun.state.lastOpenedGate, id, `${id} : selection memorisee`);
        assert.equal(spun.state.history.at(-1).gate, id, `${id} : spin de la bonne roue`);
        assert.equal(spun.state.energy, 10 - spin, 'un seul spin par clic');
      }
      await page.evaluate(async () => {
        const net = await import('/SRC/CORE/ACCOUNT_NET.js');
        await net.flushNetUser();
        for (let i = 0; i < 10 && net.netHasPendingSave(); i++) await net.flushNetUser();
        if (net.netHasPendingSave()) throw new Error('Sauvegarde spin non confirmee');
      });
      const stored = (await (await fetch(url + '/api/me', { headers: { Authorization: `Bearer ${account.token}` } })).json()).user;
      assert.equal(stored.galaxyGates.lastOpenedGate, id, `${id} : selection sauvegardee serveur`);
      spinResults.push({ id, roll });
    }
  }
  for (const icon of ['SCHISM', 'DIAMETRION']) {
    const loaded = await page.evaluate(src => new Promise(resolve => {
      const image = new Image(); image.onload = () => resolve(image.naturalWidth > 0); image.onerror = () => resolve(false); image.src = src;
    }), `/ASSETS/ORES/${icon}.png`);
    assert.ok(loaded, icon + ': icone chargee dans le navigateur');
  }
  for (const id of ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'kappa', 'lambda', 'kronos']) for (const bossFirst of [true, false]) {
    await page.evaluate(id => window.__ggAudit.prepare(id), id);
    await page.evaluate(id => document.querySelector(`[data-gg-gate="${id}"]`).click(), id);
    const spawned = await page.evaluate(() => window.__ggAudit.spawn());
    assert.ok(spawned.enemies.length > 0, id + ': finale peuplee');
    assert.equal(spawned.remaining, 0);
    assert.equal(spawned.pending, false);
    let killed = await page.evaluate(bossFirst => window.__ggAudit.kill(bossFirst), bossFirst);
    if (killed.enemies.length) {
      assert.equal(killed.pending, false, id + ': le boss seul ne termine pas la vague');
      if (id === 'lambda' || id === 'kronos') {
        killed = await page.evaluate(() => window.__ggAudit.resume());
        assert.ok(killed.enemies.every(e => e.boss !== bossFirst), id + ': seuls les NPC restants reapparaissent apres reprise');
        assert.equal(killed.pending, false);
      }
      killed = await page.evaluate(bossFirst => window.__ggAudit.kill(!bossFirst), bossFirst);
    }
    assert.equal(killed.pending, true, id + ': finale detectee');
    assert.equal(killed.betweenWaves, false, id + ': aucun portail vers une vague supplementaire');
    const count = killed.gates.completed[id];
    assert.equal(killed.xenomit, spawned.xenomit, id + ': bonus attendu avec les autres recompenses');
    assert.deepEqual(killed.materials, spawned.materials, id + ': materiaux attendus avec les autres recompenses');
    const finished = await page.evaluate(() => window.__ggAudit.finish());
    const xenomit = GALAXY_GATE_DEFINITIONS[id].completion.credits / 40000;
    assert.equal(finished.map, '1-1', id + ': retour effectif a la base');
    assert.equal(finished.pending, false, id + ': verrou libere sur la nouvelle carte');
    assert.equal(finished.gates.completed[id], count, id + ': pas de double validation');
    assert.equal(finished.xenomit, killed.xenomit + xenomit, id + ': Xenomit proportionnel aux credits dans la soute');
    assert.deepEqual(finished.rewardPhase, { delay: 3000, before: killed.xenomit, after: killed.xenomit + xenomit },
      id + ': gain au moment de la recompense');
    assert.ok((await page.locator('#ggRewards').textContent()).replace(/\s/g, '').includes(`${xenomit}Xénomit`),
      'montant proportionnel visible dans les recompenses de la gate');
    const stored = (await (await fetch(url + '/api/me', { headers: { Authorization: `Bearer ${account.token}` } })).json()).user;
    assert.equal(stored.galaxyGates.completed[id], count, id + ': fin persistante sur le serveur');
    assert.equal(stored.inventory.resources.xenomit, finished.xenomit, id + ': Xenomit sauvegarde serveur');
    assert.deepEqual(finished.materialPhase, { before: killed.materials, after: finished.materials });
    for (const [material, label] of [['kyhalon', 'Kyhalon'], ['tetrathrin', 'Tetrathrin'], ['bifenon', 'Bifenon'], ['schism', 'Schism'], ['diametrion', 'Diamétrion']]) {
      const gained = finished.materials[material] - killed.materials[material];
      const creditsPerUnit = material === 'schism' ? 10000000 : material === 'diametrion' ? 2000000 : 1000000;
      const expected = Math.floor(GALAXY_GATE_DEFINITIONS[id].completion.credits / creditsPerUnit);
      assert.equal(gained, expected, `${id} : ${material} proportionnel aux credits`);
      assert.equal(stored.inventory.resources[material], finished.materials[material], `${id} : ${material} sauvegarde serveur`);
      assert.ok((await page.locator('#ggRewards').textContent()).includes(expected + ' ' + label), `${material} visible dans la gate`);
    }
    results.push({ id, bossFirst, wave: spawned.wave, npc: spawned.enemies.length, completed: count });
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ spinResults, results, completion: 'selection spin, reprise, validation unique, sauvegarde et retour base : OK' }));
} finally {
  if (browser) await browser.close();
  const stopped = server.exitCode === null ? once(server, 'exit') : Promise.resolve(); server.kill(); await stopped;
  assert.equal(dirname(resolve(temporary)), resolve(tmpdir())); assert.ok(basename(temporary).startsWith('orbit-gg-audit-'));
  await rm(temporary, { recursive: true, force: true });
}
