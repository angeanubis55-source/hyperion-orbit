// Vrai moteur et vrais gestes a deux doigts ; compte et serveur ephemeres.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createServer } from 'node:net';
import { join, resolve, dirname, basename, sep, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const temporary = await mkdtemp(join(tmpdir(), 'orbit-phone-'));
await writeFile(join(temporary, 'index.html'), await readFile(join(root, 'index.html')));
const fixture = join(temporary, 'fixture.mjs');
await writeFile(fixture, `import { ZoneNpcSim } from ${JSON.stringify(pathToFileURL(join(root, 'SCRIPTS/NPC_ROOM.js')).href)};
ZoneNpcSim.prototype.drainPlayerHits = function() { this.playerHits.length = 0; return []; };`);
const reserve = createServer();
await new Promise(r => reserve.listen(0, '127.0.0.1', r));
const port = reserve.address().port;
await new Promise(r => reserve.close(r));
const server = spawn(process.execPath, ['--import', pathToFileURL(fixture).href, join(root, 'SCRIPTS/MULTI_SERVER.js')], {
  cwd: temporary, windowsHide: true, env: { ...process.env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'],
});
let browser, page, output = '';
server.stdout.on('data', b => { output += b; }); server.stderr.on('data', b => { output += b; });
const origin = `http://127.0.0.1:${port}`, errors = [];
const pause = ms => new Promise(r => setTimeout(r, ms));
const mime = { '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.gif': 'image/gif', '.mp3': 'audio/mpeg' };
try {
  let ready = false;
  for (let i = 0; i < 80; i++) {
    try { ready = (await fetch(origin + '/api/ping')).ok; } catch {}
    if (ready || server.exitCode !== null) break;
    await pause(100);
  }
  assert.ok(ready, output);
  const response = await fetch(origin + '/api/register', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ pseudo: 'phone-check', email: 'phone-check@example.test', password: 'test-password-123', faction: 'mmo' }) });
  assert.ok(response.ok);
  const account = await response.json();
  account.user.ship = 'PhoenixBleu';
  account.user.hangars = [{ id: 'phone-source', shipId: 'PhoenixBleu', active: true, activeConfig: 1,
    fits: { '1': { lasers: [], gens: [], extras: [], shipMods: [] }, '2': { lasers: [], gens: [], extras: [], shipMods: [] } } }];
  account.user.inventory ||= {}; account.user.inventory.ships = ['PhoenixBleu'];
  account.user.revision = Number(account.user.revision || 0) + 1;
  const saved = await fetch(origin + '/api/save', { method: 'POST', headers: { Authorization: `Bearer ${account.token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ user: account.user }) });
  assert.ok(saved.ok); account.user = (await saved.json()).user;
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  page.on('pageerror', error => { errors.push(error.stack || error.message); console.log('Erreur page :', error.stack); });
  await page.context().route('**/*', async route => {
    const parsed = new URL(route.request().url());
    if (parsed.origin !== origin || parsed.pathname === '/index.html' || parsed.pathname.startsWith('/api/')) return route.continue();
    try {
      const file = resolve(root, decodeURIComponent(parsed.pathname).replace(/^\/+/, ''));
      assert.ok(file.startsWith(root + sep));
      let body = await readFile(file);
      if (parsed.pathname === '/SRC/CORE/ORBIT_ENGINE.js') {
        assert.ok(body.toString().includes('window.__ORBIT_ENGINE__ = {'));
        body = Buffer.from(body.toString().replace('window.__ORBIT_ENGINE__ = {', `
window.__PHONE_TEST__ = {
  state: () => ({ x: player.x, y: player.y, vx: player.vx, vy: player.vy, angle: player.angle, attacking: attackActive,
    target: Target.get()?.id, aim: phoneControls.aimAngle(), move: phoneControls.movement(), locked: isPlayerMovementLocked() }),
  prepare: () => {
    stopAttack(); Target.clear(); phoneControls.cancel(); moveTarget.active = false; player.angle = 0;
    const type = Object.keys(NPC_TYPES).find(key => /streuner/i.test(key));
    const enemy = makeEnemy(type, player.x + 150, player.y);
    // Un renfort local de fixture reste present parmi les NPC serveur.
    Object.assign(enemy, { hp: 10000000, hpMax: 10000000, freezeT: 60, speed: 0, damage: 0, _bossPhaseMinion: true });
    enemies.push(enemy); return enemy.id;
  },
  portal: on => { portalJumpActive = on; syncPhoneControls(); },
};
window.__ORBIT_ENGINE__ = {`));
      }
      await route.fulfill({ status: 200, contentType: mime[extname(file)] || 'application/octet-stream', body });
    } catch { await route.fulfill({ status: 404, body: 'Not found' }); }
  });
  await page.addInitScript(({ token, user }) => {
    if (localStorage.getItem('orbit_token')) return;
    localStorage.setItem('orbit_token', token);
    localStorage.setItem('orbit_user_cache', JSON.stringify({ user }));
    localStorage.setItem('orbit_current_user', JSON.stringify({ id: user.id, pseudo: user.pseudo, email: user.email }));
    sessionStorage.setItem('orbit_assets_preloaded_v1', 'ready'); sessionStorage.setItem('spawnMapId', '1-1');
  }, account);
  const boot = async () => {
    await page.waitForSelector('#loadingStartBtn:not([disabled])', { timeout: 90000 });
    await page.click('#loadingStartBtn');
    await page.waitForFunction(() => !document.documentElement.classList.contains('orbitBooting') &&
      getComputedStyle(document.getElementById('loadingOverlay')).display === 'none', null, { timeout: 60000 });
  };
  await page.goto(origin + '/index.html?map=1-1', { waitUntil: 'domcontentloaded' });
  console.log('Chargement du jeu mobile');
  await boot();
  console.log('Jeu demarre, verification des controles');
  assert.equal(await page.locator('#phoneControls').isVisible(), false, 'mode desactive par defaut');
  await page.evaluate(() => window.GameWindowManager.restore('settingsWindow'));
  await page.locator('#optPhoneMode').check();
  console.log('Option activee');
  assert.equal(await page.locator('#phoneControls').isVisible(), true);
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('orbit_game_settings_v1')).phoneMode), true);
  await page.evaluate(() => window.GameWindowManager.minimize('settingsWindow'));
  await page.waitForSelector('#settingsWindow', { state: 'hidden' });
  // Fermer les fenetres initiales pour inspecter aussi le cone sur le jeu.
  await page.evaluate(() => { for (const id of ['chatWindow', 'minimap', 'boxWave', 'boxMeta', 'boxVitals']) window.GameWindowManager.minimize(id); });
  await page.waitForTimeout(400);
  const session = await page.context().newCDPSession(page);
  const touch = (type, points) => session.send('Input.dispatchTouchEvent', { type, touchPoints: points });
  const state = () => page.evaluate(() => window.__PHONE_TEST__.state());
  const inspectLayout = () => page.evaluate(() => {
    const bounds = element => { const r = element.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }; };
    const dock = document.getElementById('ammoBar'), palette = dock.querySelector('.actionPalette');
    const obstacles = [bounds(dock), bounds(dock.querySelector('.actionPaletteToggle')), ...(palette.hidden ? [] : [bounds(palette)])];
    const overlaps = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    return [...document.querySelectorAll('.phoneJoystick')].map(element => {
      const rect = bounds(element), label = bounds(element.querySelector('.phoneJoystickLabel'));
      return { side: element.dataset.phoneStick, rect, label,
        blocked: obstacles.some(o => overlaps(rect, o) || overlaps(label, o)) };
    });
  });
  const center = async side => {
    const r = await page.locator(`[data-phone-stick="${side}"]`).boundingBox();
    assert.ok(r && r.x >= 0 && r.y >= 0 && r.x + r.width <= page.viewportSize().width && r.y + r.height <= page.viewportSize().height);
    const point = { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    assert.equal(await page.evaluate(p => document.elementFromPoint(p.x, p.y)?.closest('.phoneJoystick')?.dataset.phoneStick, point), side,
      'la poignee doit recevoir le toucher sans HUD devant');
    return point;
  };
  for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }, { width: 667, height: 375 }]) {
    await page.setViewportSize(viewport); await page.waitForTimeout(100);
    const closedLayout = await inspectLayout();
    assert.ok(closedLayout.every(stick => !stick.blocked), 'dock ferme accessible et poignees degagees : ' + JSON.stringify(closedLayout));
    await page.locator('#ammoBar .actionPaletteToggle').tap();
    for (const category of ['ammo', 'rockets', 'formations', 'skills']) {
      await page.locator(`#ammoBar [data-action-category="${category}"]`).tap();
      await page.waitForTimeout(100);
      const layout = await inspectLayout();
      assert.ok(layout.every(stick => !stick.blocked), `${category} : dock et menu degages : ` + JSON.stringify(layout));
    }
    await page.locator('#ammoBar [data-action-category="ammo"]').tap();
    await page.waitForTimeout(100);
    const move = { id: 10, ...await center('move') }, aim = { id: 20, ...await center('aim') };
    const target = await page.evaluate(() => window.__PHONE_TEST__.prepare());
    const before = await state();
    await touch('touchStart', [move, aim]);
    move.x -= 38; aim.x += 38;
    await touch('touchMove', [move, aim]);
    await page.waitForFunction(() => window.__PHONE_TEST__.state().vx < 0 && window.__PHONE_TEST__.state().aim === 0);
    assert.equal((await state()).attacking, false, 'tenir le joystick droit ne tire pas');
    assert.ok(Math.abs(Math.abs((await state()).angle) - Math.PI) < 0.001, 'le vaisseau regarde vers le deplacement a gauche');
    const moveCenter = await center('move');
    move.x = moveCenter.x; move.y = moveCenter.y - 10;
    await touch('touchMove', [move, aim]);
    await page.waitForFunction(() => { const s = window.__PHONE_TEST__.state(); return s.vy < 0 && Math.abs(s.angle + Math.PI / 2) < 0.001; });
    move.x = moveCenter.x - 38; move.y = moveCenter.y;
    await touch('touchMove', [move, aim]);
    await page.waitForFunction(() => { const s = window.__PHONE_TEST__.state(); return s.vx < 0 && Math.abs(Math.abs(s.angle) - Math.PI) < 0.001; });
    await page.waitForTimeout(120);
    assert.ok((await state()).x < before.x, 'le joystick gauche deplace pendant la visee');
    if (process.env.PHONE_SCREENSHOTS === '1') await page.screenshot({ path: join(root, `SCRIPTS/_TMP_PHONE_${viewport.width}.png`) });
    await touch('touchEnd', [aim]); // relache seulement le doigt droit
    await page.waitForFunction(id => { const s = window.__PHONE_TEST__.state(); return s.attacking && s.target === id && s.move != null; }, target);
    await page.waitForFunction(() => { const s = window.__PHONE_TEST__.state(); return s.vx < 0 && Math.abs(s.angle) < 0.35; });
    await touch('touchEnd', []);
    await page.waitForFunction(() => { const s = window.__PHONE_TEST__.state(); return s.vx === 0 && s.vy === 0 && s.move == null; });
    const stopped = await state(); await page.waitForTimeout(120);
    assert.ok(Math.abs((await state()).x - stopped.x) < 1, 'pas de deplacement apres relachement');
    const tap = { id: 21, ...await center('aim') };
    await touch('touchStart', [tap]); await touch('touchEnd', []);
    assert.equal((await state()).attacking, false, 'toucher de nouveau bascule le tir comme CTRL');
    await touch('touchStart', [tap]); tap.x += 38; await touch('touchMove', [tap]);
    await touch('touchCancel', []);
    assert.equal((await state()).attacking, false, 'annulation ne tire pas');
    await touch('touchStart', [move, aim]);
    await page.evaluate(() => window.__PHONE_TEST__.portal(true));
    const locked = await state(); assert.equal(locked.move, null); assert.equal(locked.aim, null);
    await touch('touchEnd', []);
    await page.evaluate(() => window.__PHONE_TEST__.portal(false));
    assert.equal((await state()).attacking, false, 'sortie du portail ne reprend pas le geste');
    await page.locator('#ammoBar .actionPaletteToggle').tap();
    await page.waitForTimeout(100);
    const restoredLayout = await inspectLayout();
    for (let i = 0; i < closedLayout.length; i++) {
      assert.deepEqual(restoredLayout[i].rect, closedLayout[i].rect, 'fermer le menu restitue les positions normales');
    }
    // Une vraie fenetre couvrant la poignee garde la priorite au toucher.
    const point = await center('move');
    await page.evaluate(p => {
      window.GameWindowManager.restore('chatWindow');
      const card = document.getElementById('chatWindow');
      for (const [property, value] of Object.entries({ left: `${p.x - 55}px`, top: `${p.y - 55}px`, right: 'auto', bottom: 'auto', width: '110px', height: '110px', 'min-width': '0', 'min-height': '0' })) card.style.setProperty(property, value, 'important');
      const button = document.createElement('button'); button.id = 'phoneWindowProbe'; button.textContent = 'Fenetre';
      Object.assign(button.style, { position: 'absolute', left: '15px', top: '35px', width: '80px', height: '40px', zIndex: '10', pointerEvents: 'auto' });
      button.onclick = () => { window.__PHONE_WINDOW_CLICKED__ = true; }; card.appendChild(button);
    }, point);
    await page.waitForTimeout(400);
    assert.equal(await page.evaluate(p => document.elementFromPoint(p.x, p.y)?.closest('#chatWindow') != null, point), true);
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 30, ...point }] });
    await touch('touchEnd', []);
    assert.equal(await page.evaluate(() => window.__PHONE_WINDOW_CLICKED__), true, 'fenetre cliquable au-dessus de la poignee');
    assert.equal((await state()).move, null, 'cliquer la fenetre ne deplace pas le vaisseau');
    await page.evaluate(() => {
      document.getElementById('phoneWindowProbe').remove();
      const card = document.getElementById('chatWindow');
      for (const property of ['left', 'top', 'right', 'bottom', 'width', 'height', 'min-width', 'min-height']) card.style.removeProperty(property);
      window.GameWindowManager.minimize('chatWindow'); window.__PHONE_WINDOW_CLICKED__ = false;
    });
    await page.waitForSelector('#chatWindow', { state: 'hidden' });
    console.log(`Deux doigts, cone, tir au relachement, arret et annulation OK : ${viewport.width}x${viewport.height}`);
    console.log('Dock, quatre menus et fenetre devant les poignees OK');
  }
  await page.reload({ waitUntil: 'domcontentloaded' }); await boot();
  assert.equal(await page.locator('#phoneControls').isVisible(), true, 'mode conserve apres refresh');
  await page.evaluate(() => window.GameWindowManager.restore('settingsWindow'));
  assert.equal(await page.locator('#optPhoneMode').isChecked(), true);
  await page.locator('#optPhoneMode').uncheck();
  assert.equal(await page.locator('#phoneControls').isVisible(), false);
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('orbit_game_settings_v1')).phoneMode), false);
  assert.deepEqual(errors, [], 'aucune erreur JavaScript');
  console.log('PHONE CONTROLS BROWSER OK : option, persistance, portrait et paysage');
} catch (error) {
  if (page && process.env.PHONE_SCREENSHOTS === '1') await page.screenshot({ path: join(root, 'SCRIPTS/_TMP_PHONE_FAILURE.png') }).catch(() => {});
  if (page) console.log('Diagnostic :', await page.evaluate(() => ({ state: window.__PHONE_TEST__?.state(),
    notices: document.getElementById('orbitNotifications')?.textContent })).catch(() => null), errors);
  throw error;
} finally {
  try { await browser?.close(); } catch {}
  const stopped = server.exitCode === null ? once(server, 'exit') : Promise.resolve(); server.kill(); await stopped;
  assert.equal(dirname(resolve(temporary)), resolve(tmpdir())); assert.ok(basename(temporary).startsWith('orbit-phone-'));
  await rm(temporary, { recursive: true, force: true });
}
