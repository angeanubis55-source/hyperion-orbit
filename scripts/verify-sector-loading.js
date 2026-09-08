import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { chromium } from 'playwright-core';
import { writeFile, mkdir, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { NPC_TYPES } from '../src/data/npcTypes.js';
import { ROCKET_IDS } from '../src/data/rockets.js';

const networkName = process.argv.find(arg => arg.startsWith('--network='))?.split('=')[1] || 'local';
const networks = {
  local: { latency: 0, downloadThroughput: -1, uploadThroughput: -1 },
  limited: { latency: 80, downloadThroughput: 5_000_000 / 8, uploadThroughput: 1_000_000 / 8 },
  slow: { latency: 150, downloadThroughput: 1_500_000 / 8, uploadThroughput: 500_000 / 8 },
};
assert.ok(networks[networkName], 'Unknown network profile');

const server = spawn(process.execPath, ['scripts/game-server.js'], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
const serverErrors = [];
server.stderr.on('data', data => serverErrors.push(String(data)));
let browser;
try {
  const [line] = await once(server.stdout, 'data');
  const url = String(line).trim();
  const resource = new URL('Npc/Streuner/1.png', url);
  const first = await fetch(resource);
  assert.equal(first.status, 200);
  const etag = first.headers.get('etag');
  assert.ok(etag);
  await first.arrayBuffer();
  const validated = await fetch(resource, { headers: { 'If-None-Match': etag } });
  assert.equal(validated.status, 304);
  assert.equal((await validated.arrayBuffer()).byteLength, 0);
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const page = await context.newPage();
  page.setDefaultTimeout(300000);
  page.setDefaultNavigationTimeout(300000);
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', { offline: false, ...networks[networkName] });
  const errors = [], requests = [];
  // These optional in-game sprites are documented as absent in rockets.js;
  // retain their diagnostics while rejecting every other missing resource.
  const optionalRocketPaths = new Set(ROCKET_IDS.map(id => `/Munitions/${id}.png`));
  const missingOptionalSprites = new Set();
  const destinationNpcPath = '/' + NPC_TYPES.npc_StreuneR8.sprite.path;
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => requests.push(new URL(request.url()).pathname));
  page.on('response', response => {
    const path = new URL(response.url()).pathname;
    if (response.status() === 404 && optionalRocketPaths.has(path)) missingOptionalSprites.add(path);
    else if (response.status() >= 400 && !path.endsWith('favicon.ico')) errors.push(`${response.status()} ${response.url()}`);
  });
  await page.addInitScript(() => {
    const user = { id: 'loading-test', pseudo: 'Loading', email: 'loading@local', password: 'test', ship: 'PhoenixBleu', inventory: { counts: { laser_lf1: 1 }, ships: ['PhoenixBleu'], shipModules: [] } };
    localStorage.setItem('orbit_users', JSON.stringify([user]));
    localStorage.setItem('orbit_current_user', JSON.stringify({ id: user.id, pseudo: user.pseudo, email: user.email }));
  });
  const results = { date: new Date().toISOString(), browser: browser.version(), network: networkName,
    networkConditions: networks[networkName], cacheValidationStatus: validated.status, phases: [] };
  const boot = async label => {
    requests.length = 0;
    const start = Date.now();
    await page.goto(new URL('index.html?map=1-1', url).href, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#loadingStartBtn:not([disabled])', { timeout: 300000 });
    const readyMs = Date.now() - start;
    assert.equal(requests.includes('/assets-manifest.json'), false, 'Global asset manifest must not be fetched');
    assert.equal(new Set(requests.filter(p => /^\/Npc\/Streuner\/\d+\.png$/.test(p))).size, 32, 'All original Streuner frames must be prepared');
    assert.equal(requests.some(p => /\/Npc\/Streuner\/sheet\./.test(p)), false);
    assert.equal(requests.some(p => p.startsWith(destinationNpcPath)), false, 'Remote-sector NPC must stay unloaded');
    assert.ok(requests.includes('/assets/MMO/Centre.png'));
    assert.ok(requests.includes('/assets/MMO/Beacon.png'));
    assert.equal(requests.some(p => /^\/assets\/(EIC|VRU|PIRATES)\//.test(p)), false, 'Other sectors bases must not load at boot');
    assert.equal(requests.includes('/assets/MMO/Quest.png'), false);
    assert.ok(requests.length < 2000, `Excessive boot resources: ${requests.length}`);
    const progress = await page.locator('#loadingOverlay .loadingTrack').getAttribute('aria-valuenow');
    assert.equal(progress, '100');
    const resources = await Promise.all([...new Set(requests)].map(async path => {
      try { return { path, bytes: (await stat(resolve(process.cwd(), '.' + decodeURIComponent(path)))).size }; }
      catch { return { path, bytes: 0 }; }
    }));
    results.phases.push({ label, readyMs, requests: requests.length, pngRequests: requests.filter(p => p.endsWith('.png')).length,
      uniqueResourceBytes: resources.reduce((sum, item) => sum + item.bytes, 0),
      largestResources: resources.sort((a,b) => b.bytes-a.bytes).slice(0, 8) });
    console.log(JSON.stringify({ network: networkName, ...results.phases.at(-1) }));
    await page.click('#loadingStartBtn');
    await page.waitForSelector('#game', { state: 'visible' });
  };
  await boot('cold 1-1');
  await page.evaluate(() => sessionStorage.setItem('orbit_assets_preloaded_v1', 'ready'));
  await boot('reload with legacy cache flag');
  requests.length = 0;
  const transitionStart = Date.now();
  await page.evaluate(async () => { await window.__SWITCH_MAP__('1-8'); });
  assert.equal(await page.evaluate(() => window.__CURRENT_MAP_ID__), '1-8');
  assert.ok(requests.some(p => p.startsWith(destinationNpcPath)), 'Destination NPC must load on sector transition');
  results.phases.push({ label: 'transition 1-8', readyMs: Date.now() - transitionStart, requests: requests.length });
  console.log(JSON.stringify({ network: networkName, ...results.phases.at(-1) }));
  requests.length = 0;
  const returnStart = Date.now();
  await page.evaluate(async () => { await window.__SWITCH_MAP__('1-1'); });
  assert.equal(await page.evaluate(() => window.__CURRENT_MAP_ID__), '1-1');
  assert.equal(requests.filter(p => p.startsWith('/Npc/')).length, 0, 'Loaded NPC images must be reused on return');
  assert.equal(requests.includes('/assets-manifest.json'), false);
  results.phases.push({ label: 'return 1-1', readyMs: Date.now() - returnStart, requests: requests.length });
  requests.length = 0;
  await page.evaluate(async () => { await window.__SWITCH_MAP__('5-2'); });
  assert.equal(await page.evaluate(() => window.__CURRENT_MAP_ID__), '5-2');
  assert.ok(requests.includes('/assets/PIRATES/Centre.png'), 'Pirate base must be prepared on entry to its sector');
  results.phases.push({ label: 'pirate sector 5-2', requests: requests.length });
  requests.length = 0;
  await page.evaluate(async () => { await window.__SWITCH_MAP__('1-1'); });
  assert.equal(requests.some(p => /^\/assets\/(MMO|EIC|VRU|PIRATES)\//.test(p)), false, 'Visited bases must be reused');
  assert.deepEqual(errors, []);
  results.errors = errors;
  results.missingOptionalSprites = [...missingOptionalSprites];
  assert.deepEqual(serverErrors, []);
  await mkdir('reports/sector-loading', { recursive: true });
  await writeFile(`reports/sector-loading/${networkName === 'local' ? 'results' : networkName}.json`, JSON.stringify(results, null, 2) + '\n');
  console.log(JSON.stringify(results, null, 2));
} finally {
  await browser?.close();
  server.kill();
}
