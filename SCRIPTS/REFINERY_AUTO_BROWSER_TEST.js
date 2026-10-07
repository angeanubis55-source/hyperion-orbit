import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createServer } from 'node:net';
import { basename, dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const temporary = await mkdtemp(join(tmpdir(), 'orbit-refinery-auto-'));
await writeFile(join(temporary, 'index.html'), await readFile(join(root, 'index.html')));
const fixture = join(temporary, 'fixture.mjs');
await writeFile(fixture, `import { ZoneNpcSim } from ${JSON.stringify(pathToFileURL(join(root, 'SCRIPTS/NPC_ROOM.js')).href)};
ZoneNpcSim.prototype.drainPlayerHits = function() { this.playerHits.length = 0; return []; };`);
const reserve = createServer();
await new Promise(resolve => reserve.listen(0, '127.0.0.1', resolve));
const port = reserve.address().port; await new Promise(resolve => reserve.close(resolve));
const server = spawn(process.execPath, ['--import', pathToFileURL(fixture).href, join(root, 'SCRIPTS/MULTI_SERVER.js')], {
  cwd: temporary, windowsHide: true, env: { ...process.env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'],
});
let browser, page, output = '';
server.stdout.on('data', b => { output += b; }); server.stderr.on('data', b => { output += b; });
const url = `http://127.0.0.1:${port}`, errors = [];
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.gif': 'image/gif', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg' };
try {
  let ready = false;
  for (let i = 0; i < 80; i++) {
    try { ready = (await fetch(url + '/api/ping')).ok; } catch {}
    if (ready || server.exitCode !== null) break; await pause(100);
  }
  assert.ok(ready, output);
  const registration = await fetch(url + '/api/register', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ pseudo: 'RefineryTest', email: 'refinery@example.test', password: 'test-password-123', faction: 'mmo' }) });
  assert.ok(registration.ok); const account = await registration.json();
  const headers = { 'content-type': 'application/json', Authorization: `Bearer ${account.token}` };
  const seed = { ...account.user, revision: account.user.revision + 1, schemaVersion: 4, credits: 5000000, ship: 'goliath',
    ammoActive: 'x4', ammo: { x4: 100 }, inventory: { ships: ['goliath'], resources: { promerium: 12, seprom: 9, duranium: 8 } },
    hangars: [{ id: 'refinery', active: true, shipId: 'goliath', activeConfig: 1, lastMap: '1-1', lastPos: { x: 1500, y: 1500 },
      fits: { '1': { lasers: [], gens: [], extras: [], shipMods: [] }, '2': {} } }], upgrades: {} };
  const saved = await fetch(url + '/api/save', { method: 'POST', headers, body: JSON.stringify({ user: seed }) });
  assert.ok(saved.ok); const canonical = (await saved.json()).user;
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  page.on('pageerror', error => errors.push(error.message));
  await page.context().route('**/*', async route => {
    const parsed = new URL(route.request().url());
    if (parsed.origin !== url || parsed.pathname === '/index.html' || parsed.pathname.startsWith('/api/')) return route.continue();
    try {
      const path = resolve(root, decodeURIComponent(parsed.pathname).replace(/^\/+/, ''));
      assert.ok(path.startsWith(root + sep)); let body = await readFile(path);
      if (parsed.pathname === '/SRC/CORE/ORBIT_ENGINE.js') body = Buffer.from(body.toString().replace('window.__ORBIT_ENGINE__ = {', `
window.__REFINERY_TEST__ = {
  state: () => structuredClone({ resources: account.user.inventory.resources, upgrades: account.user.upgrades, credits: player.credits, ammo: player.ammo.x4,
    key: refineryEquipmentPrefsKey(), preferences: refineryEquipmentPrefs, stored: localStorage.getItem(refineryEquipmentPrefsKey()), enabled: ui.refineryAutoUpgrades.checked }),
  dirty: () => { player.credits += 12345; player.ammo.x4--; markProgressDirty(); },
  fundCraft: () => { player.credits += 50000000; noteNetCreditGain(50000000); markProgressDirty(); },
  give: ores => { for (const [ore, amount] of Object.entries(ores)) {
    account.user.inventory.resources[ore] = (account.user.inventory.resources[ore] || 0) + amount;
    noteNetResourceGain(ore, amount);
  } markProgressDirty(); },
};
window.__ORBIT_ENGINE__ = {`));
      await route.fulfill({ status: 200, contentType: mime[extname(path)] || 'application/octet-stream', body });
    } catch { await route.fulfill({ status: 404, body: 'Not found' }); }
  });
  await page.addInitScript(({ token, user }) => {
    if (!localStorage.getItem('orbit_token')) {
      localStorage.setItem('orbit_token', token); localStorage.setItem('orbit_user_cache', JSON.stringify({ user }));
      localStorage.setItem('orbit_current_user', JSON.stringify({ id: user.id, pseudo: user.pseudo, email: user.email }));
    }
    sessionStorage.setItem('orbit_assets_preloaded_v1', 'ready'); sessionStorage.setItem('spawnMapId', '1-1');
  }, { token: account.token, user: canonical });
  const start = async () => {
    await page.waitForSelector('#loadingStartBtn:not([disabled])', { timeout: 90000 }); await page.click('#loadingStartBtn');
    await page.waitForFunction(() => !document.documentElement.classList.contains('orbitBooting') &&
      getComputedStyle(document.getElementById('loadingOverlay')).display === 'none');
  };
  await page.goto(url + '/index.html?map=1-1', { waitUntil: 'domcontentloaded' }); await start();
  await page.click('[data-window-id="refineryWindow"]');
  const slots = ['laser', 'rocket', 'speed', 'shield'];
  const select = slot => page.locator(`[data-upgrade-auto-ore="${slot}"]`);
  assert.equal(await page.locator('.upgAutoOre').count(), 4);
  assert.equal(await page.locator('#refineryAutoUpgrades').isChecked(), false);
  assert.deepEqual(await select('speed').locator('option').evaluateAll(els => els.map(el => el.value)), ['', 'duranium', 'promerium']);
  const labels = await page.locator('.refineryFooter label').allTextContents();
  assert.deepEqual(labels, ['Raffinage auto des équipements', 'Auto-raffinage']);
  const originalSpeed = (await page.evaluate(() => window.__ORBIT_ENGINE__.getEquipmentState())).ship.speed;
  for (const slot of slots) await select(slot).selectOption('promerium');
  await page.evaluate(() => window.__REFINERY_TEST__.dirty());
  await page.locator('#refineryAutoUpgrades').check();
  await page.waitForFunction(() => Object.values(window.__REFINERY_TEST__.state().upgrades).filter(x => x.stock === 30).length === 4);
  let state = await page.evaluate(() => window.__REFINERY_TEST__.state());
  assert.equal(state.resources.promerium || 0, 0); assert.equal(state.credits, 5012345); assert.equal(state.ammo, 99);
  const boosted = (await page.evaluate(() => window.__ORBIT_ENGINE__.getEquipmentState())).ship.speed;
  assert.equal(boosted, originalSpeed * 1.2, 'bonus vitesse applique immediatement');
  await select('laser').focus();
  await page.evaluate(() => { window.__refinerySelect = document.activeElement; window.__REFINERY_TEST__.give({ promerium: 4 }); });
  await page.waitForFunction(() => window.__REFINERY_TEST__.state().upgrades.laser.stock === 40);
  await page.waitForTimeout(1700);
  assert.equal(await page.evaluate(() => document.activeElement === window.__refinerySelect && window.__refinerySelect.isConnected), true, 'rafraichissement conserve le select et le focus');
  await page.locator('#refineryAutoUpgrades').uncheck();
  for (const slot of slots) await select(slot).selectOption(slot === 'speed' ? '' : 'seprom');
  await page.locator('#refineryAutoUpgrades').check();
  state = await page.evaluate(() => window.__REFINERY_TEST__.state());
  for (const slot of ['laser', 'rocket', 'shield']) assert.equal(state.upgrades[slot].stock, 30);
  assert.equal(state.upgrades.speed.stock, 40); assert.equal(state.resources.duranium, 8);
  await page.locator('#refineryWindow').screenshot({ path: join(tmpdir(), 'orbit-refinery-auto.png') });
  await page.click('[data-window-id="refineryWindow"]'); await page.waitForSelector('#refineryWindow', { state: 'hidden' });
  await page.evaluate(() => window.__REFINERY_TEST__.give({ seprom: 3 }));
  await page.waitForFunction(() => window.__REFINERY_TEST__.state().upgrades.shield.stock === 40);
  const net = await page.evaluate(() => import('/SRC/CORE/ACCOUNT_NET.js').then(async m => { await m.flushNetUser(); return m.netList()[0]; }));
  assert.equal(net.credits, 5012345); assert.equal(net.ammo.x4, 99);
  assert.equal(net.inventory.resources.seprom || 0, 0); assert.equal(net.upgrades.laser.stock, 40);
  await page.reload({ waitUntil: 'domcontentloaded' }); await start();
  await page.click('[data-window-id="refineryWindow"]');
  console.log('preferences apres refresh:', await page.evaluate(() => ({ state: window.__REFINERY_TEST__.state(),
    keys: Object.keys(localStorage).filter(k => k.startsWith('orbit_refinery')).map(k => [k, localStorage.getItem(k)]) })));
  assert.equal(await page.locator('#refineryAutoUpgrades').isChecked(), true, 'activation memorisee');
  for (const slot of slots) assert.equal(await select(slot).inputValue(), slot === 'speed' ? '' : 'seprom');
  state = await page.evaluate(() => window.__REFINERY_TEST__.state());
  for (const slot of ['laser', 'rocket', 'shield']) assert.equal(state.upgrades[slot].stock, 40);
  // Craft reel depuis la fenetre, puis confirmation serveur et rechargement.
  await page.locator('#refineryAutoUpgrades').uncheck();
  await page.locator('#refineryAuto').uncheck();
  await page.evaluate(() => {
    window.__REFINERY_TEST__.fundCraft();
    window.__REFINERY_TEST__.give({ rinusk: 6250, blacklight_trace: 1250 });
  });
  await page.click('[data-window-id="craftingWindow"]');
  await page.locator('[data-recipe-id="craft_seprom_5000"]').click();
  await page.locator('#craftingQuantity').selectOption('5');
  await page.locator('#craftingBuildBtn').click();
  state = await page.evaluate(() => window.__REFINERY_TEST__.state());
  assert.equal(state.resources.seprom, 25000);
  assert.equal(state.credits, 5012345);
  assert.match((await page.locator('#craftingMessage').innerText()).replace(/\s/g, ''), /25000Seprom/);
  await page.evaluate(() => import('/SRC/CORE/ACCOUNT_NET.js').then(m => m.flushNetUser()));
  const canonicalCraft = (await (await fetch(url + '/api/me', { headers })).json()).user;
  assert.equal(canonicalCraft.inventory.resources.seprom, 25000);
  assert.equal(canonicalCraft.inventory.resources.rinusk || 0, 0);
  await page.reload({ waitUntil: 'domcontentloaded' }); await start();
  state = await page.evaluate(() => window.__REFINERY_TEST__.state());
  assert.equal(state.resources.seprom, 25000, 'les cinq packs restent apres reconnexion');
  // Avec le chargement automatique, la soute se vide mais tout passe en charges.
  if (!await page.locator('#refineryWindow').isVisible()) await page.click('[data-window-id="refineryWindow"]');
  await page.locator('#refineryAutoUpgrades').check();
  state = await page.evaluate(() => window.__REFINERY_TEST__.state());
  assert.equal(state.resources.seprom || 0, 0);
  assert.equal(['laser', 'rocket', 'shield'].reduce((n, slot) => n + state.upgrades[slot].stock - 40, 0), 250000);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ sharedOre: 'OK', compatibleLists: 'OK', focus: 'OK', closedWindow: 'OK', persistence: 'OK', state, errors }));
} finally {
  if (browser) await browser.close();
  const stopped = server.exitCode === null ? once(server, 'exit') : Promise.resolve(); server.kill(); await stopped;
  assert.equal(dirname(resolve(temporary)), resolve(tmpdir())); assert.ok(basename(temporary).startsWith('orbit-refinery-auto-'));
  await rm(temporary, { recursive: true, force: true });
}
