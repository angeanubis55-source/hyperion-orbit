// Audit reel des finales des neuf GG sur compte et serveur temporaires.
// Les commandes de simulation et horloges controlees sont injectees par le test uniquement.
import assert from "node:assert/strict";
import { enterGame } from "./BROWSER_GAME_START.js";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { createServer } from "node:net";
import { basename, dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright-core";
import { GALAXY_GATE_DEFINITIONS, KRONOS_PARTS_BY_GATE } from '../SRC/CORE/GALAXY_GATES.js';
import { GALAXY_GATE_DRONE_DESIGN_DROPS, galaxyGateDroneDesignRewardMessage } from '../SRC/CORE/GALAXY_GATES.js';

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
          notify: showNotificationGroup,
          async prepareKronos(completedId = null) {
            started = false;
            const mod = await import('./ACCOUNT.js');
            const gg = await import('./GALAXY_GATES.js');
            const user = getCurrentUserFull();
            const kronosParts = { alpha: 1, beta: 2, epsilon: 3, kappa: 1, lambda: 4 };
            if (completedId) kronosParts[completedId] = KRONOS_PARTS_BY_GATE[completedId];
            user.galaxyGates = gg.normalizeGalaxyGateState({ lastOpenedGate: 'kronos', kronosParts });
            mod.saveUser(user, { source: 'progress' });
            account.user = user;
            selectedGalaxyGateId = 'kronos';
            window.GameWindowManager.restore('galaxyGateWindow');
            renderGalaxyGateWindow();
            await flushNetUser();
          },
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
            energy: account.user.galaxyGates.energy, energyPhase: this.energyPhase,
            anchorlock: Number(account.user.inventory?.counts?.laser_lf5al) || 0, equipmentPhase: this.equipmentPhase,
            materials: Object.fromEntries(['kyhalon', 'tetrathrin', 'bifenon', 'schism', 'diametrion'].map(id => [id, Number(account.user.inventory?.resources?.[id]) || 0])),
            designs: Object.fromEntries(['drone_design_hermes', 'drone_design_havoc', 'drone_design_hercules', 'drone_design_saturn'].map(id => [id, Number(account.user.inventory?.counts?.[id]) || 0])),
            designPhase: this.designPhase, rewardMessages: this.rewardMessages,
            materialPhase: this.materialPhase }; },
          async prepare(id, win = true) {
            started = false;
            this.designRoll = win ? 0 : 0.99;
            this.rewardMessages = [];
            this.designPhase = null;
            this.rewardPhase = null;
            this.energyPhase = null;
            this.equipmentPhase = null;
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
              const energyBefore = timer.delay === 3000 ? this.snapshot().energy : null;
              const equipmentBefore = timer.delay === 3000 ? this.snapshot().anchorlock : null;
              const materialsBefore = timer.delay === 3000 ? this.snapshot().materials : null;
              const designsBefore = timer.delay === 3000 ? this.snapshot().designs : null;
              const wasStarted = started;
              if (timer.delay === 3000) started = true;
              try { await timer.callback(); } finally { started = wasStarted; }
              if (before !== null) this.rewardPhase = { delay: timer.delay, before, after: this.snapshot().xenomit };
              if (energyBefore !== null) this.energyPhase = { delay: timer.delay, before: energyBefore, after: this.snapshot().energy };
              if (equipmentBefore !== null) this.equipmentPhase = { delay: timer.delay, before: equipmentBefore, after: this.snapshot().anchorlock };
              if (materialsBefore) this.materialPhase = { before: materialsBefore, after: this.snapshot().materials };
              if (designsBefore) this.designPhase = { before: designsBefore, after: this.snapshot().designs };
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
          'function scheduleGalaxyGateCompletion(gateId, completion) { const setTimeout = (callback, delay) => window.__ggAudit.timers.push({ callback, delay }); const showNotificationGroup = (messages, ...args) => { window.__ggAudit.rewardMessages = [...messages]; return window.__ggAudit.notify(messages, ...args); };');
        body = body.replace('completeCurrentUserGalaxyGate(currentGateId, account.user, { deferReward: true })',
          'completeCurrentUserGalaxyGate(currentGateId, account.user, { deferReward: true, rng: () => window.__ggAudit.designRoll })');
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
  await enterGame(page, 90000);
  await page.waitForSelector("#game", { state: "visible", timeout: 15000 });
  await page.waitForFunction(() => !document.documentElement.classList.contains("orbitBooting") &&
    getComputedStyle(document.getElementById("loadingOverlay")).display === "none");

  await page.waitForTimeout(1500);

  const results = [];
  await page.evaluate(() => window.__ggAudit.prepareKronos());
  await page.waitForFunction(() => !document.getElementById('galaxyGateWindow').classList.contains('gameWinOpening'));
  for (const width of [1600, 800]) {
    await page.setViewportSize({ width, height: 900 });
    const reference = await page.evaluate(() => {
      document.querySelector('[data-gg-gate="alpha"]').click();
      const geometry = Object.fromEntries(['.ggBuiltLine', '.ggDetailsBottom', '#ggSpinControls', '#ggPortalImage', '#galaxyGateWindow'].map(selector => {
        const bounds = document.querySelector(selector).getBoundingClientRect();
        return [selector, { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height }];
      }));
      document.querySelector('[data-gg-gate="kronos"]').click();
      return geometry;
    });
    const layout = await page.evaluate(() => {
      const controls = document.getElementById('ggSpinControls');
      const panel = document.getElementById('ggKronosParts');
      const stats = document.querySelector('.ggDetailsBottom').getBoundingClientRect();
      const bounds = panel.getBoundingClientRect();
      const rewards = document.querySelector('.ggPreviewTop').getBoundingClientRect();
      const multiplier = document.getElementById('ggMultiplierBtn').getBoundingClientRect();
      return {
        controlsHidden: [...controls.querySelectorAll('label, select, button')].every(node => getComputedStyle(node).display === 'none'),
        countersVisible: getComputedStyle(panel).display === 'grid',
        rows: [...panel.children].map(row => ({ text: row.textContent, x: row.getBoundingClientRect().x,
          y: row.getBoundingClientRect().y })),
        total: document.getElementById('ggParts').textContent,
        statsBottom: stats.bottom, countersTop: bounds.top,
        statsOverlapCounters: stats.bottom > bounds.top && stats.top < bounds.bottom,
        countersOverflow: bounds.bottom > panel.parentElement.getBoundingClientRect().bottom,
        headerOverlaps: rewards.right > multiplier.left,
        separator: getComputedStyle(controls).borderTopWidth,
        geometry: Object.fromEntries(['.ggBuiltLine', '.ggDetailsBottom', '#ggSpinControls', '#ggPortalImage', '#galaxyGateWindow'].map(selector => {
          const rect = document.querySelector(selector).getBoundingClientRect();
          return [selector, { x: rect.x, y: rect.y, width: rect.width, height: rect.height }];
        })),
      };
    });
    assert.equal(layout.controlsHidden, true, 'label, selection et bouton caches sur Kronos');
    assert.equal(layout.countersVisible, true);
    assert.deepEqual(layout.rows.map(row => row.text), ['Alpha1/4', 'Beta2/3', 'Gamma0/1', 'Delta0/1', 'Epsilon3/4', 'Zeta0/1', 'Kappa1/2', 'Lambda4/5']);
    assert.equal(new Set(layout.rows.map(row => Math.round(row.x))).size, 4, 'quatre colonnes');
    assert.equal(new Set(layout.rows.map(row => Math.round(row.y))).size, 2, 'deux lignes');
    assert.equal(layout.total, '11 / 21');
    assert.equal(layout.statsOverlapCounters, false, `les informations ne recouvrent pas les pieces (${layout.statsBottom} vs ${layout.countersTop})`);
    assert.equal(layout.countersOverflow, false, 'tous les compteurs restent dans la fenetre');
    assert.equal(layout.headerOverlaps, false, 'le multiplicateur ne recouvre pas les recompenses NPC');
    assert.equal(layout.separator, '1px', 'le separateur du bloc de spin est conserve');
    for (const [selector, bounds] of Object.entries(reference)) for (const key of ['x', 'y', 'width', 'height']) {
      assert.ok(Math.abs(layout.geometry[selector][key] - bounds[key]) < 1, `${width}px ${selector} ${key} : meme disposition que les autres GG (${layout.geometry[selector][key]} vs ${bounds[key]})`);
    }
  }
  await page.setViewportSize({ width: 1600, height: 900 });
  for (const [id, required] of Object.entries(KRONOS_PARTS_BY_GATE)) {
    await page.evaluate(id => window.__ggAudit.prepareKronos(id), id);
    const check = await page.locator(`[data-gg-kronos-part="${id}"]`).evaluate(row => {
      const icon = row.querySelector('.ggKronosCompleteCheck');
      return { text: row.textContent, accessible: icon?.getAttribute('aria-label'),
        color: icon && getComputedStyle(icon).color,
        sizedToText: icon && getComputedStyle(icon).fontSize === getComputedStyle(row).fontSize };
    });
    assert.equal(check.text, GALAXY_GATE_DEFINITIONS[id].name + '✓');
    assert.ok(check.accessible.includes(`${required}/${required}`));
    assert.equal(check.color, 'rgb(0, 255, 136)', 'meme coche verte que la boutique');
    assert.equal(check.sizedToText, true, 'coche a la taille du texte');
  }
  await page.evaluate(() => window.__ggAudit.prepareKronos('alpha'));
  await page.waitForFunction(() => !document.getElementById('galaxyGateWindow').classList.contains('gameWinOpening'));
  await page.locator('#ggRewardsHelp').hover();
  assert.equal(await page.locator('#ggRewards').isVisible(), true, 'recompenses ouvertes au survol');
  const rewardPosition = await page.evaluate(() => {
    const tip = document.getElementById('ggRewards');
    const bounds = tip.getBoundingClientRect();
    const gate = document.getElementById('ggPortalImage').getBoundingClientRect();
    const cover = document.createElement('div');
    cover.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:#000';
    document.body.appendChild(cover);
    const onTop = tip.contains(document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2));
    cover.remove();
    return { dx: Math.abs(bounds.x + bounds.width / 2 - gate.x - gate.width / 2),
      dy: Math.abs(bounds.y + bounds.height / 2 - gate.y - gate.height / 2),
      onTop, centeredText: getComputedStyle(tip).textAlign === 'center' };
  });
  assert.ok(rewardPosition.dx < 2 && rewardPosition.dy < 2, 'panneau centre sur l image du portail GG');
  assert.equal(rewardPosition.centeredText, true);
  assert.equal(rewardPosition.onTop, true, 'panneau devant toutes les fenetres du jeu');
  if (process.env.GG_REWARDS_SCREENSHOT) await page.locator('#galaxyGateWindow').screenshot({ path: process.env.GG_REWARDS_SCREENSHOT });
  await page.locator('#ggRewards').hover();
  assert.equal(await page.locator('#ggRewards').isVisible(), true, 'panneau reste ouvert pendant la lecture');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#ggRewards').isVisible(), false, 'Echap referme le panneau');
  await page.locator('#ggRewardsHelp').click();
  assert.equal(await page.locator('#ggRewards').isVisible(), true, 'recompenses accessibles au clic');
  await page.evaluate(() => window.GameWindowManager.minimize('galaxyGateWindow'));
  assert.equal(await page.locator('#ggRewards').isVisible(), false, 'recompenses masquees avec la fenetre GG');
  await page.evaluate(() => window.GameWindowManager.restore('galaxyGateWindow'));
  await page.locator('#ggRewardsHelp').click();
  await page.evaluate(() => window.GameWindowManager.close('galaxyGateWindow'));
  assert.equal(await page.locator('#ggRewards').isVisible(), false, 'fermer la fenetre ferme aussi les recompenses');
  await page.evaluate(() => window.GameWindowManager.restore('galaxyGateWindow'));
  await page.waitForFunction(() => !document.getElementById('galaxyGateWindow').classList.contains('gameWinOpening'));
  if (process.env.KRONOS_AUDIT_SCREENSHOT) await page.locator('#galaxyGateWindow').screenshot({ path: process.env.KRONOS_AUDIT_SCREENSHOT });
  await page.evaluate(() => document.querySelector('[data-gg-gate="alpha"]').click());
  assert.equal(await page.locator('#ggSpinControls').isVisible(), true, 'les spins reviennent pour Alpha');
  assert.equal(await page.locator('#ggKronosParts').isVisible(), false);
  const spinResults = [];
  for (const id of (process.env.KRONOS_LAYOUT_ONLY ? [] : ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'kappa', 'lambda'])) {
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
  for (const id of (process.env.KRONOS_LAYOUT_ONLY ? [] : ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'kappa', 'lambda', 'kronos'])) for (const bossFirst of [true, false]) {
    await page.evaluate(({ id, win }) => window.__ggAudit.prepare(id, win), { id, win: bossFirst });
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
    assert.equal(killed.energy, spawned.energy, id + ': energies attendues avec les autres recompenses');
    assert.equal(killed.anchorlock, spawned.anchorlock, id + ': laser attendu avec les autres recompenses');
    assert.deepEqual(killed.materials, spawned.materials, id + ': materiaux attendus avec les autres recompenses');
    assert.deepEqual(killed.designs, spawned.designs, id + ': CPU attendu avec les autres recompenses');
    const finished = await page.evaluate(() => window.__ggAudit.finish());
    const xenomit = GALAXY_GATE_DEFINITIONS[id].completion.credits / 40000;
    assert.equal(finished.map, '1-1', id + ': retour effectif a la base');
    assert.equal(finished.pending, false, id + ': verrou libere sur la nouvelle carte');
    assert.equal(finished.gates.completed[id], count, id + ': pas de double validation');
    assert.equal(finished.xenomit, killed.xenomit + xenomit, id + ': Xenomit proportionnel aux credits dans la soute');
    const energy = GALAXY_GATE_DEFINITIONS[id].completion.energy || 0;
    assert.equal(finished.energy, killed.energy + energy, id + ': gain energie');
    assert.deepEqual(finished.energyPhase, { delay: 3000, before: killed.energy, after: killed.energy + energy });
    assert.deepEqual(finished.rewardMessages.filter(message => message.includes('énergies Galaxy')),
      energy ? [`Vous avez reçu ${energy} énergies Galaxy`] : [], 'gain energie annonce une fois');
    if (energy) assert.ok((await page.locator('#ggRewards').textContent()).includes(`${energy} énergies Galaxy`));
    assert.deepEqual(finished.rewardPhase, { delay: 3000, before: killed.xenomit, after: killed.xenomit + xenomit },
      id + ': gain au moment de la recompense');
    assert.ok((await page.locator('#ggRewards').textContent()).replace(/\s/g, '').includes(`${xenomit}Xénomit`),
      'montant proportionnel visible dans les recompenses de la gate');
    const stored = (await (await fetch(url + '/api/me', { headers: { Authorization: `Bearer ${account.token}` } })).json()).user;
    assert.equal(stored.galaxyGates.completed[id], count, id + ': fin persistante sur le serveur');
    assert.equal(stored.galaxyGates.energy, finished.energy, id + ': energies sauvegardees serveur');
    const equipmentAmount = id === 'epsilon' && bossFirst ? 1 : 0;
    assert.equal(finished.anchorlock, killed.anchorlock + equipmentAmount, id + ': un Anchorlock sur un tirage gagne');
    assert.equal(Number(stored.inventory.counts.laser_lf5al) || 0, finished.anchorlock, 'laser sauvegarde serveur');
    assert.deepEqual(finished.equipmentPhase, { delay: 3000, before: killed.anchorlock, after: killed.anchorlock + equipmentAmount });
    assert.deepEqual(finished.rewardMessages.filter(message => message.includes('Anchorlock') || message === 'Aucun équipement reçu'),
      id === 'epsilon' ? [equipmentAmount ? '1x LF-5 Anchorlock reçu' : 'Aucun équipement reçu'] : []);
    if (id === 'epsilon') assert.ok((await page.locator('#ggRewards').textContent()).includes('50% LF-5 Anchorlock'));
    assert.equal(stored.inventory.resources.xenomit, finished.xenomit, id + ': Xenomit sauvegarde serveur');
    assert.deepEqual(finished.materialPhase, { before: killed.materials, after: finished.materials });
    assert.deepEqual(finished.designPhase, { before: killed.designs, after: finished.designs });
    const drop = GALAXY_GATE_DRONE_DESIGN_DROPS[id];
    const amount = drop && (bossFirst || drop.chance === 1) ? 1 : 0;
    for (const [itemId, before] of Object.entries(killed.designs)) {
      assert.equal(finished.designs[itemId], before + (drop?.itemId === itemId ? amount : 0));
      assert.equal(Number(stored.inventory.counts[itemId]) || 0, finished.designs[itemId], itemId + ': CPU sauvegarde serveur');
    }
    const expectedDesignMessage = drop ? galaxyGateDroneDesignRewardMessage({ itemId: drop.itemId, amount }) : null;
    const designMessages = finished.rewardMessages.filter(message => message.includes('Design de drones'));
    assert.deepEqual(designMessages, expectedDesignMessage ? [expectedDesignMessage] : [], 'resultat du tirage annonce exactement une fois');
    if (drop) assert.ok((await page.locator('#ggRewards').textContent()).includes(`${Math.round(drop.chance * 100)}% Design de drones ( ${drop.itemId.replace('drone_design_', '')} )`));
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
  console.log(JSON.stringify({ spinResults, results, completion: process.env.KRONOS_LAYOUT_ONLY
    ? 'Kronos : compteurs, quatre colonnes, deux lignes, aucun chevauchement et retour aux spins : OK'
    : 'Kronos, selection spin, reprise, validation unique, sauvegarde et retour base : OK' }));
} finally {
  if (browser) await browser.close();
  const stopped = server.exitCode === null ? once(server, 'exit') : Promise.resolve(); server.kill(); await stopped;
  assert.equal(dirname(resolve(temporary)), resolve(tmpdir())); assert.ok(basename(temporary).startsWith('orbit-gg-audit-'));
  await rm(temporary, { recursive: true, force: true });
}
