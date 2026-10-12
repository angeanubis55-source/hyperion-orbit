// Hangar reel, compte et serveur temporaires : equipement des CPU et visuels reseau.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createServer } from 'node:net';
import { basename, dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import WebSocket from 'ws';
import { DRONE_DESIGNS } from '../DRONE/DRONE_DESIGNS.js';
import { createDrone } from '../DRONE/DRONE_TYPES.js';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const temporary = await mkdtemp(join(tmpdir(), 'orbit-drone-audit-'));
await writeFile(join(temporary, 'index.html'), await readFile(join(root, 'index.html')));
const reserve = createServer();
await new Promise(resolve => reserve.listen(0, '127.0.0.1', resolve));
const port = reserve.address().port;
await new Promise(resolve => reserve.close(resolve));
const fixture = join(temporary, 'fixture.mjs');
await writeFile(fixture, 'import { ZoneNpcSim } from ' + JSON.stringify(new URL('./NPC_ROOM.js', import.meta.url).href)
  + '; ZoneNpcSim.prototype.drainPlayerHits = function() { this.playerHits.length = 0; return []; };');
const server = spawn(process.execPath, ['--import', pathToFileURL(fixture).href, join(root, 'SCRIPTS/MULTI_SERVER.js')], {
  cwd: temporary, windowsHide: true, env: { ...process.env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'],
});
const url = `http://127.0.0.1:${port}`, errors = [], messages = [];
let browser, observer, output = '';
server.stdout.on('data', b => { output += b; }); server.stderr.on('data', b => { output += b; });
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.gif': 'image/gif', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg' };
const api = async (path, token, body) => {
  const response = await fetch(url + path, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  assert.ok(response.ok, path); return response.json();
};
try {
  let ready = false;
  for (let i = 0; i < 80; i++) {
    try { ready = (await fetch(url + '/api/ping')).ok; } catch {}
    if (ready || server.exitCode !== null) break;
    await pause(100);
  }
  assert.ok(ready, output);
  const account = await api('/api/register', null, { pseudo: 'drone-audit', email: 'drone@example.test', password: 'test-password-123', faction: 'mmo' });
  const user = { ...account.user, ship: 'goliath', revision: account.user.revision + 1, schemaVersion: 4,
    inventory: { ...account.user.inventory, ships: ['goliath'], counts: Object.fromEntries(Object.values(DRONE_DESIGNS).map(d => [d.itemId, 10])) },
    drones: { items: Array.from({ length: 10 }, (_, i) => ({ ...createDrone(i < 8 ? 'iris' : i === 8 ? 'apis' : 'zeus', `d${i}`), exp: 1500000, level: 6 })), formations: ['standard'], activeFormation: 'standard', designs: [] },
    hangars: [{ id: 'drone-hangar', active: true, shipId: 'goliath', activeConfig: 1, lastMap: '1-1', lastPos: { x: 1500, y: 1500 }, lastHpPct: 1, lastShPct: 1,
      fits: { '1': { lasers: [], gens: [], extras: [], shipMods: [] }, '2': { lasers: [], gens: [], extras: [], shipMods: [] } } }],
  };
  const canonical = (await api('/api/save', account.token, { user })).user;
  const friend = await api('/api/register', null, { pseudo: 'drone-observer', email: 'observer@example.test', password: 'test-password-123', faction: 'mmo' });
  observer = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  observer.on('message', raw => messages.push(JSON.parse(String(raw))));
  await once(observer, 'open');
  observer.send(JSON.stringify({ t: 'hello', token: friend.token, map: '1-1' }));
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/*', async route => {
    const parsed = new URL(route.request().url());
    if (parsed.origin !== url || parsed.pathname === '/index.html' || parsed.pathname.startsWith('/api/')) return route.continue();
    try {
      const path = resolve(root, decodeURIComponent(parsed.pathname).replace(/^\/+/, ''));
      assert.ok(path.startsWith(root + sep));
      let body = await readFile(path);
      if (parsed.pathname === '/PUBLIC/PROFILE.js') body = body.toString('utf8') + `\nwindow.__droneProfileAudit = {
        open() { openHangarOverlay(); openFitModal('drone-hangar'); setFitSection('drones'); },
        clear() { for (const draft of Object.values(fitState.droneDrafts || {})) draft.ability = null; renderDroneEquipment(user); renderInventoryPalette(); },
        save() { saveFitModal(); },
        snapshot() { return structuredClone(fitState.droneDrafts); }
      };`;
      if (parsed.pathname === '/SRC/CORE/ORBIT_ENGINE.js') {
        const source = body.toString('utf8'), end = source.lastIndexOf('\n}');
        body = source.slice(0, end) + `\nwindow.__droneEngineAudit = {
          pause() { started = false; },
          resume() { started = true; },
          base() { player.x = zoneSafe.zone.x; player.y = zoneSafe.zone.y; player.vx = 0; player.vy = 0; moveTarget.active = false; return getHangarAccess(); },
          snapshot() { const h = getActiveHangarFromUser(account.user); return { hp: player.hpMax,
            cooldown: player.droneCooldownReductionPct,
            drones: structuredClone(account.user.drones.items),
            sprites: account.user.drones.items.map(d => getDroneSpritePath(d, 29)),
            stats: computeHangarStats(h, account.user) }; }
        };` + source.slice(end);
      }
      await route.fulfill({ status: 200, contentType: mime[extname(path)] || 'application/octet-stream', body });
    } catch { await route.fulfill({ status: 404, body: 'Not found' }); }
  });
  await page.addInitScript(({ token, user }) => {
    if (localStorage.getItem('orbit_token')) return;
    localStorage.setItem('orbit_token', token); localStorage.setItem('orbit_user_cache', JSON.stringify({ user }));
    localStorage.setItem('orbit_current_user', JSON.stringify({ id: user.id, pseudo: user.pseudo, email: user.email }));
    sessionStorage.setItem('orbit_assets_preloaded_v1', 'ready'); sessionStorage.setItem('spawnMapId', '1-1');
  }, { token: account.token, user: canonical });
  await page.goto(url + '/index.html?map=1-1', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#loadingStartBtn:not([disabled])', { timeout: 90000 }); await page.click('#loadingStartBtn');
  await page.waitForFunction(() => window.__droneProfileAudit && window.__droneEngineAudit
    && getComputedStyle(document.getElementById('loadingOverlay')).display === 'none');
  const access = await page.evaluate(() => window.__droneEngineAudit.base()); assert.ok(access.canEquip);
  await page.evaluate(() => window.__droneProfileAudit.open());
  assert.equal(await page.locator('.droneCardDesignBonus').filter({ hasText: 'Aucun bonus' }).count(), 10);
  const results = [];
  for (const design of Object.values(DRONE_DESIGNS)) {
    await page.evaluate(() => window.__droneProfileAudit.clear());
    const cells = page.locator(`#fitInvGrid .invCell[data-item-id="${design.itemId}"]:not(.disabled)`);
    // Double-clic natif sur chaque CPU : dix vrais placements dans les slots DESIGN.
    for (let copy = 0; copy < 10; copy++) await cells.first().dblclick();
    assert.equal(await page.locator('.droneDesignSlot.filled').count(), 10, design.id);
    assert.ok((await page.locator('.droneCardDesignBonus').allTextContents()).every(text => !text.includes('Aucun bonus')));
    for (const image of await page.locator('.droneCardSprite').evaluateAll(images => images.map(i => i.getAttribute('src')))) assert.equal(image, design.shopIcon);
    assert.deepEqual(Object.values(await page.evaluate(() => window.__droneProfileAudit.snapshot())).map(f => f.ability), Array(10).fill(design.itemId));
    const badLayout = await page.locator('.droneEquipmentCard').evaluateAll(cards => cards.some(card => {
      const label = card.querySelector('.droneCardDesignBonus').getBoundingClientRect(), slot = card.querySelector('.droneDesignSlot').getBoundingClientRect();
      return label.right > slot.left + 1;
    })); assert.equal(badLayout, false, 'label place a gauche du design');
    if (design.id === 'admin') await page.screenshot({ path: join(root, '.tmp', 'DRONE_DESIGN_PREVIEW.png') });
    await page.evaluate(() => { window.__droneProfileAudit.save(); window.__droneEngineAudit.pause(); });
    await page.evaluate(async () => {
      const net = await import('/SRC/CORE/ACCOUNT_NET.js');
      await net.flushNetUser();
      for (let i = 0; i < 10 && net.netHasPendingSave(); i++) await net.flushNetUser();
      if (net.netHasPendingSave()) throw new Error('Sauvegarde design non confirmee');
    });
    const stored = (await api('/api/me', account.token)).user;
    assert.ok(stored.drones.items.every(d => d.fitsByHangar['drone-hangar']['1'].ability === design.itemId));
    assert.ok(stored.drones.items.every(d => !d.fitsByHangar['drone-hangar']['2'].ability));
    await page.evaluate(() => window.__droneEngineAudit.resume());
    await page.waitForTimeout(100);
    const local = await page.evaluate(() => window.__droneEngineAudit.snapshot());
    assert.ok(local.sprites.every(path => path.startsWith(design.sprite + '5/')), design.id + ': sprites niveau 6 ' + JSON.stringify(local.drones[0]));
    assert.equal(local.cooldown, design.effects.cooldownPct ? 10 : 0, 'bonus recharge applique au moteur');
    const deadline = Date.now() + 5000;
    let remote;
    while (Date.now() < deadline) {
      remote = messages.filter(m => m.t === 'snapshot').flatMap(m => m.players || []).findLast(p => p.pseudo === 'drone-audit' && p.dslots?.split(',').every(s => s.endsWith(':' + design.id)));
      if (remote) break;
      await pause(50);
    }
    assert.ok(remote, design.id + ': design recu par un autre joueur');
    assert.equal(remote.dslots.split(',').length, 10);
    results.push(design.id);
    await page.evaluate(() => { window.__droneEngineAudit.base(); window.__droneProfileAudit.open(); });
  }
  // Retrait natif : le CPU redevient disponible et le label se vide.
  await page.locator('[data-drone-design="d0"]').dblclick();
  assert.equal(await page.locator('.droneDesignSlot.filled').count(), 9);
  assert.ok((await page.locator('.droneCardDesignBonus').first().textContent()).includes('Aucun bonus'));
  assert.equal(await page.locator('#fitInvGrid .invCell[data-item-id="drone_design_saturn"]:not(.disabled)').count(), 1);
  await page.locator('#fitInvGrid .invCell[data-item-id="drone_design_saturn"]:not(.disabled)').first()
    .dragTo(page.locator('[data-drone-design="d0"]'));
  assert.equal(await page.locator('.droneDesignSlot.filled').count(), 10, 'glisser un CPU dans son slot');
  await page.locator('[data-drone-design="d1"]').dblclick();
  await page.locator('[data-drone-design="d0"]').dragTo(page.locator('[data-drone-design="d1"]'));
  const moved = await page.evaluate(() => window.__droneProfileAudit.snapshot());
  assert.equal(moved.d0.ability, null); assert.equal(moved.d1.ability, 'drone_design_saturn');
  assert.equal(await page.locator('.droneDesignSlot.filled').count(), 9, 'deplacer un design ne duplique pas le CPU');
  await page.setViewportSize({ width: 1280, height: 720 });
  assert.ok(await page.locator('[data-drone-design="d1"]').isVisible());
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ results, validation: 'CPU, labels, sauvegarde, configuration et visuels multijoueur : OK' }));
} finally {
  observer?.close();
  if (browser) await browser.close();
  const stopped = server.exitCode === null ? once(server, 'exit') : Promise.resolve(); server.kill(); await stopped;
  assert.equal(dirname(resolve(temporary)), resolve(tmpdir())); assert.ok(basename(temporary).startsWith('orbit-drone-audit-'));
  await rm(temporary, { recursive: true, force: true });
}
