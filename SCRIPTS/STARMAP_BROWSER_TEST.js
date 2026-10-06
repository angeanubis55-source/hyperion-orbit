// Smoke test Carte Stellaire : boot réel, ouvre la fenêtre, vérifie l'arbre,
// sélectionne 1-2 et fait un vrai star jump (10 s + switch).
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { createServer } from "node:net";
import { join, resolve, dirname, basename, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright-core";
import { loadServerMaps } from './MAP_RULES.js';

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const temporary = await mkdtemp(join(tmpdir(), "orbit-starmap-"));
await writeFile(join(temporary, "index.html"), await readFile(join(root, "index.html")));
// Les voyages de controle doivent etre independants d'un NPC tire au hasard.
// Cette neutralisation ne s'applique qu'au processus serveur ephemere du test.
const serverFixture = join(temporary, 'server-fixture.mjs');
await writeFile(serverFixture, `import { ZoneNpcSim } from ${JSON.stringify(pathToFileURL(join(root, 'SCRIPTS/NPC_ROOM.js')).href)};
ZoneNpcSim.prototype.drainPlayerHits = function() { this.playerHits.length = 0; return []; };
`);
const reserve = createServer();
await new Promise((r) => reserve.listen(0, "127.0.0.1", r));
const port = reserve.address().port;
await new Promise((r) => reserve.close(r));
const server = spawn(process.execPath, ['--import', pathToFileURL(serverFixture).href, join(root, "SCRIPTS/MULTI_SERVER.js")], {
  cwd: temporary, windowsHide: true, env: { ...process.env, PORT: String(port) }, stdio: ["ignore", "pipe", "pipe"],
});
let browser, page, output = "";
server.stdout.on("data", (b) => { output += b; });
server.stderr.on("data", (b) => { output += b; });
const url = `http://127.0.0.1:${port}`, errors = [];
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
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
    body: JSON.stringify({ pseudo: "starmap-smoke", email: "starmap-smoke@example.test", password: "test-password-123", faction: "mmo" }) });
  assert.ok(registered.ok);
  const account = await registered.json();
  const fixtureMaps = await loadServerMaps();
  account.user.ship = 'PhoenixBleu';
  account.user.hangars = [{ id: 'source', shipId: 'PhoenixBleu', active: true, activeConfig: 1,
    fits: { '1': { lasers: [], gens: [], extras: [], shipMods: [] }, '2': { lasers: [], gens: [], extras: [], shipMods: [] } } }];
  account.user.inventory ||= {};
  account.user.inventory.ships = ['PhoenixBleu'];
  const sourceHangar = account.user.hangars.find(h => h.active);
  const sourceBase = fixtureMaps.get('1-1').base;
  const samePortal = fixtureMaps.get('1-1').portals.find(p => p.id === 'p_11_to_12');
  const otherPortal = fixtureMaps.get('1-2').portals.find(p => String(p.toMap) === '1-1');
  assert.ok(sourceBase && samePortal && otherPortal);
  sourceHangar.lastMap = '1-1'; sourceHangar.lastPos = { ...sourceBase };
  account.user.inventory.ships.push('goliath', 'vengeance');
  const parked = [
    { id: 'parked-same', shipId: 'goliath', lastMap: '1-1', lastPos: { x: samePortal.x, y: samePortal.y } },
    { id: 'parked-other', shipId: 'vengeance', lastMap: '1-2', lastPos: { x: otherPortal.x, y: otherPortal.y } },
  ];
  for (const h of parked) account.user.hangars.push({ ...h, active: false, activeConfig: 1, lastHpPct: 1, lastShPct: 1,
    fits: { '1': { lasers: [], gens: [], extras: [], shipMods: [] }, '2': { lasers: [], gens: [], extras: [], shipMods: [] } } });
  account.user.revision = Number(account.user.revision || 0) + 1;
  const savedFixture = await fetch(url + '/api/save', { method: 'POST', headers: { Authorization: `Bearer ${account.token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ user: account.user }) });
  assert.ok(savedFixture.ok);
  account.user = (await savedFixture.json()).user;
  browser = await chromium.launch({ channel: "msedge", headless: true });
  page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  page.on("pageerror", (e) => errors.push(e.message));
  page.on('websocket', socket => socket.on('framereceived', frame => {
    try { const msg = JSON.parse(String(frame.payload)); if (msg.t === 'hangarArrival' || msg.t === 'stateCorrection') console.log('reponse transfert:', msg); } catch {}
  }));
  // Servir egalement les modules demandes par le Worker de routage.
  await page.context().route("**/*", async (route) => {
    const parsed = new URL(route.request().url());
    if (parsed.origin !== url || parsed.pathname === "/index.html" || parsed.pathname.startsWith("/api/")) return route.continue();
    try {
      const path = resolve(root, decodeURIComponent(parsed.pathname).replace(/^\/+/, ""));
      assert.ok(path.startsWith(root + sep));
      let body = await readFile(path);
      // Acces aux vrais degats uniquement dans la reponse HTTP de ce test.
      if (parsed.pathname === '/SRC/CORE/ORBIT_ENGINE.js') {
        assert.ok(body.toString().includes('window.__ORBIT_ENGINE__ = {'));
        body = Buffer.from(body.toString().replace('worker.onmessage = ({ data }) => {',
          'worker.onmessage = ({ data }) => { window.__STARMAP_WORKER_READY__ = !data.error;'));
        body = Buffer.from(body.toString().replace('window.__ORBIT_ENGINE__ = {', `
window.__STARMAP_DAMAGE_TEST__ = amount => { hurtPlayer(amount); return { preparing: !!StarJump.channel, hp: player.hp, shield: player.sh }; };
window.__STARMAP_MOVEMENT_TEST__ = {
  state: () => ({ x: player.x, y: player.y, vx: player.vx, vy: player.vy, moving: moveTarget.active,
    hangar: SESSION_HANGAR_ID, transfer: hangarSwapFx?.mode, transitioning: hangarSwapFx?.transitioning }),
  order: () => { moveTarget.active = true; moveTarget.x = player.x + 1000; moveTarget.y = player.y + 1000; player.vx = 300; player.vy = 300; },
};
window.__ORBIT_ENGINE__ = {`));
      }
      await route.fulfill({ status: 200, contentType: mime[".js"] && parsed.pathname.endsWith(".js") ? "text/javascript" : mime[parsed.pathname.slice(parsed.pathname.lastIndexOf("."))] || "application/octet-stream", body });
    } catch { await route.fulfill({ status: 404, body: "Not found" }); }
  });
  await page.addInitScript(({ token, user }) => {
    // Un refresh doit relire le cache du jeu, jamais reinstaller la fixture.
    if (localStorage.getItem("orbit_token")) return;
    localStorage.setItem("orbit_token", token);
    localStorage.setItem("orbit_user_cache", JSON.stringify({ user }));
    localStorage.setItem("orbit_current_user", JSON.stringify({ id: user.id, pseudo: user.pseudo, email: user.email }));
    sessionStorage.setItem("orbit_assets_preloaded_v1", "ready");
    sessionStorage.setItem("spawnMapId", "1-1");
  }, { token: account.token, user: account.user });
  await page.goto(url + "/index.html?map=1-1", { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#loadingStartBtn:not([disabled])", { timeout: 90000 });
  await page.click("#loadingStartBtn");
  await page.waitForSelector("#game", { state: "visible", timeout: 15000 });
  await page.waitForFunction(() => !document.documentElement.classList.contains("orbitBooting") &&
    getComputedStyle(document.getElementById("loadingOverlay")).display === "none", null, { timeout: 60000 });

  // Activation reelle : position distante sur la meme carte, autre carte,
  // puis retour au hangar initial. Les snapshots restent actifs pendant tout le test.
  await page.evaluate(() => {
    window.__hangarCorrections = [];
    window.addEventListener('orbit:server-position', e => window.__hangarCorrections.push(e.detail));
  });
  for (const target of [...parked, { id: sourceHangar.id, lastMap: '1-1', lastPos: sourceBase }]) {
    console.log('activation vers', target.id, target.lastMap, target.lastPos);
    await page.waitForFunction(() => window.__ORBIT_ENGINE__.getHangarAccess().canActivate, null, { timeout: 12000 });
    await page.click('[data-window-id="hangarWindow"]');
    await page.locator(`[data-travel="${target.id}"]`).click();
    await page.waitForFunction(({ id, map, x, y }) => {
      const pos = window.__STARMAP_MOVEMENT_TEST__.state();
      return window.__ORBIT_ENGINE__.getEquipmentState().hangarId === id && window.__CURRENT_MAP_ID__ === map
        && Math.abs(pos.x - x) < 1 && Math.abs(pos.y - y) < 1;
    }, { id: target.id, map: target.lastMap, ...target.lastPos }, { timeout: 20000 });
    await pause(2000);
    const actual = await page.evaluate(() => window.__STARMAP_MOVEMENT_TEST__.state());
    assert.equal(actual.x, target.lastPos.x); assert.equal(actual.y, target.lastPos.y);
    const stored = (await (await fetch(url + '/api/me', { headers: { Authorization: `Bearer ${account.token}` } })).json()).user;
    const active = stored.hangars.find(h => h.active);
    assert.equal(active.id, target.id); assert.equal(active.lastMap, target.lastMap);
    assert.deepEqual(active.lastPos, target.lastPos, 'la destination ne devient jamais la position du depart');
  }
  assert.deepEqual(await page.evaluate(() => window.__hangarCorrections), [], 'aucun rollback anti-cheat pendant les activations');
  console.log('activations meme carte et autre carte : arrivees et sauvegardes valides sans rollback');

  // 1. Icône dock + ouverture fenêtre.
  const dockBtn = await page.waitForSelector('[data-window-id="starMapWindow"]', { timeout: 15000 });
  assert.ok(dockBtn, "dock starMap");
  await page.evaluate(() => {
    window.__STAR_MAP_OPENING_CHECK__ = null;
    window.addEventListener('orbit:window-restored', e => {
      if (e.detail?.id !== 'starMapWindow') return;
      const card = document.getElementById('starMapWindow'), tree = document.getElementById('starMapTree');
      window.__STAR_MAP_OPENING_CHECK__ = { animation: getComputedStyle(card).animationName,
        nodes: document.querySelectorAll('.starMapNode').length, scale: new DOMMatrix(getComputedStyle(tree).transform).a };
    });
  });
  await dockBtn.click();
  const opening = await page.evaluate(() => window.__STAR_MAP_OPENING_CHECK__);
  assert.equal(opening.animation, 'gameWindowOpen', 'animation appliquee avant le premier affichage');
  assert.equal(opening.nodes, 35, 'schema construit avant ouverture');
  assert.ok(opening.scale > 0 && opening.scale < 1, 'schema ajuste des la premiere image');
  await page.waitForFunction(() => !document.getElementById('starMapWindow').classList.contains('gameWinOpening'));
  await page.waitForSelector("#starMapWindow:not(.gameWinMinimized)", { timeout: 10000 });
  await page.waitForFunction(() => document.querySelectorAll(".starMapNode").length === 35 &&
    document.querySelectorAll("#starMapEdges polyline").length === 59, null, { timeout: 20000 });
  const closeInfo = async () => {
    if (await page.locator('#starMapInfoWindow').isVisible()) {
      await page.click('#starMapInfoMinimize');
      assert.equal(await page.$eval('#starMapInfoWindow', el =>
        el.classList.contains('gameWinClosing') && getComputedStyle(el).display !== 'none'
        && getComputedStyle(el).animationName === 'gameWindowClose'), true, 'les details se reduisent avec animation');
      await page.waitForSelector('#starMapInfoWindow', { state: 'hidden' });
    }
  };
  const fitMap = async () => {
    await closeInfo();
    await page.locator('.starMapNode[data-map-id="1-1"] .starMapPortal[data-portal-id="p_11_to_12"]').click();
    await closeInfo();
  };
  const zoomTo = async target => {
    await closeInfo();
    const bounds = await page.locator('#starMapViewport').boundingBox();
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    for (let i = 0; i < 12; i++) {
      const scale = await page.$eval('#starMapTree', el => new DOMMatrix(getComputedStyle(el).transform).a);
      if (Math.abs(scale - target) < 0.00005) return;
      await page.mouse.wheel(0, Math.max(-140, Math.min(140, Math.log(scale / target) / 0.002)));
      await page.waitForFunction(previous => Math.abs(new DOMMatrix(getComputedStyle(document.getElementById('starMapTree')).transform).a - previous) > 0.000001, scale);
    }
    assert.fail('zoom molette non atteint');
  };
  const readableView = async () => {
    await zoomTo(1);
    await page.click('.starMapNode[data-map-id="1-1"] .starMapLabel');
    await closeInfo();
  };
  assert.equal(await page.locator('#starMapInfoWindow').isVisible(), false, 'details caches avant un clic');
  assert.equal(await page.locator('#starMapZoomOut, #starMapZoomIn, #starMapZoomValue, #starMapFit, #starMapDetail').count(), 0, 'commandes du haut retirees');
  assert.equal(await page.locator('[data-window-id="starMapInfoWindow"]').count(), 0, 'les details ne creent pas une icone du dock');
  const standardWindow = await page.locator('#starMapWindow').boundingBox();
  assert.equal(standardWindow.width, 1500, 'fenetre agrandie en largeur');
  assert.equal(standardWindow.height, 804, 'fenetre plus haute avec une marge a lecran');
  const nodes = await page.$$eval(".starMapNode", (els) => els.map((e) => e.dataset.mapId));
  console.log("nodes:", nodes.length);
  assert.equal(nodes.length, 35);
  const edges = await page.$$eval("#starMapEdges polyline", (els) => els.length);
  console.log("edges:", edges);
  assert.equal(edges, 59);
  assert.equal(await page.evaluate(() => window.__STARMAP_WORKER_READY__), true, 'les liaisons sont calculees hors du fil du jeu');
  assert.equal(await page.locator('.starMapArrival').count(), 0, 'aucun faux portail d arrivee en 4-4 ni QZ');
  assert.equal(await page.locator('#starMapEdges mask, #starMapEdges polyline[mask]').count(), 0, 'les liaisons restent entieres aux croisements');
  // Exclues du système : gates, low, qz, maudite, 5-2, BL.
  const labels = nodes.join(" ");
  for (const banned of ["alpha", "beta", "gamma", "maudite"]) {
    assert.ok(!labels.toLowerCase().split(" ").includes(banned), "exclue absente: " + banned);
  }
  const disabled = await page.$$eval(".starMapNode.disabled", (els) => els.length);
  assert.equal(disabled, 6);
  // Chaque nœud a son mini canvas façon minimap.
  const canvases = await page.$$eval(".starMapNode canvas.starMapArt", (els) => els.length);
  assert.equal(canvases, 35);
  // Le schema entier reste visible sans chevauchement, aux tailles courantes.
  const layouts = [];
  for (const viewport of [{ width: 1920, height: 1080 }, { width: 1600, height: 900 }, { width: 1280, height: 720 }]) {
    await page.setViewportSize(viewport);
    await fitMap();
    await page.waitForTimeout(350);
    const fitScale = await page.$eval('#starMapTree', el => new DOMMatrix(getComputedStyle(el).transform).a);
    const bounds = await page.locator('#starMapViewport').boundingBox();
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    await page.mouse.wheel(0, -120);
    await page.waitForFunction(minimum => new DOMMatrix(getComputedStyle(document.getElementById('starMapTree')).transform).a > minimum, fitScale);
    await page.mouse.wheel(0, 1000);
    await page.waitForFunction(minimum => Math.abs(new DOMMatrix(getComputedStyle(document.getElementById('starMapTree')).transform).a - minimum) < 0.000001, fitScale);
    await page.mouse.wheel(0, 1000);
    await page.waitForTimeout(100);
    assert.equal(await page.$eval('#starMapTree', el => new DOMMatrix(getComputedStyle(el).transform).a), fitScale, 'le dezoom s arrete a la vue complete selon la taille de la fenetre');
    const layout = await page.evaluate(() => {
      const viewport = document.getElementById('starMapViewport'), bounds = viewport.getBoundingClientRect();
      const nodes = [...document.querySelectorAll('.starMapNode')].map(el => ({ id: el.dataset.mapId, rect: el.getBoundingClientRect(),
        x: parseFloat(el.style.left), y: parseFloat(el.style.top), w: el.offsetWidth, h: el.offsetHeight }));
      const overlaps = [], hidden = [], crossed = [], detached = [];
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i], r = a.rect;
        if (r.left < bounds.left - 1 || r.top < bounds.top - 1 || r.right > bounds.right + 1 || r.bottom > bounds.bottom + 1) hidden.push(a.id);
        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j].rect;
          if (r.left < b.right && r.right > b.left && r.top < b.bottom && r.bottom > b.top) overlaps.push([a.id, nodes[j].id]);
        }
      }
      for (const line of document.querySelectorAll('#starMapEdges polyline')) {
        const points = Array.from({ length: line.points.numberOfItems }, (_, i) => line.points.getItem(i));
        for (const [map, portal, point] of [[line.dataset.from, line.dataset.sourcePortal, points[0]],
          [line.dataset.to, line.dataset.targetPortal, points.at(-1)]]) {
          const marker = [...document.querySelectorAll('.starMapPortal, .starMapArrival')]
            .find(el => el.dataset.mapId.toLowerCase() === map.toLowerCase() && el.dataset.portalId === portal);
          if (!marker && ((map === 'qz' && portal === 'qz_entry') || (map === '4-4' && line.dataset.oneWay === 'true'))) continue;
          if (!marker) { detached.push([map, portal, 'missing']); continue; }
          const rect = marker.getBoundingClientRect();
          const screen = new DOMPoint(point.x, point.y).matrixTransform(line.getScreenCTM());
          if (Math.hypot(screen.x - (rect.left + rect.width / 2), screen.y - (rect.top + rect.height / 2)) > 1)
            detached.push([map, portal, screen.x, screen.y, rect.left, rect.top]);
        }
        for (let i = 1; i < points.length; i++) for (const node of nodes) {
          if (node.id.toLowerCase() === line.dataset.from.toLowerCase() || node.id.toLowerCase() === line.dataset.to.toLowerCase()) continue;
          const a = points[i - 1], b = points[i], left = node.x - node.w / 2, right = node.x + node.w / 2,
            top = node.y - node.h / 2, bottom = node.y + node.h / 2;
          if ((a.x === b.x && a.x > left && a.x < right && Math.max(a.y, b.y) > top && Math.min(a.y, b.y) < bottom)
            || (a.y === b.y && a.y > top && a.y < bottom && Math.max(a.x, b.x) > left && Math.min(a.x, b.x) < right))
            crossed.push([line.dataset.from, line.dataset.to, node.id]);
        }
      }
      return { overlaps, hidden, crossed, detached, zoom: new DOMMatrix(getComputedStyle(document.getElementById('starMapTree')).transform).a,
        width: viewport.clientWidth, height: viewport.clientHeight, scrollWidth: viewport.scrollWidth, scrollHeight: viewport.scrollHeight };
    });
    assert.deepEqual(layout.overlaps, [], 'vignettes separees');
    assert.deepEqual(layout.hidden, [], '35 cartes visibles dans la vue complete');
    assert.deepEqual(layout.crossed, [], 'liaisons hors des autres vignettes');
    assert.deepEqual(layout.detached, [], 'liaisons attachees aux vrais portails');
    assert.ok(layout.scrollWidth <= layout.width + 1 && layout.scrollHeight <= layout.height + 1, 'vue complete sans defilement');
    layouts.push({ viewport, ...layout });
    await page.locator('#starMapWindow').screenshot({ path: join(tmpdir(), `orbit-starmap-layout-${viewport.width}.png`) });
  }
  console.log('layouts:', JSON.stringify(layouts));
  // Une carte avec davantage de details ne doit pas pousser la fenetre hors ecran.
  await page.click('.starMapNode[data-map-id="1-1"] .starMapLabel');
  await page.click('.starMapNode[data-map-id="1-8"] .starMapLabel');
  await page.locator('#starMapConnections .starMapConnection').filter({ hasText: '1-BL' }).click();
  await page.waitForFunction(() => !document.getElementById('starMapInfoWindow').classList.contains('gameWinOpening'));
  const expanded = await page.locator('#starMapInfoWindow').boundingBox();
  assert.ok(expanded.y >= 8 && expanded.y + expanded.height <= 720 - 7, 'details longs restent dans le petit ecran');
  await page.click('[data-window-id="starMapWindow"]');
  await page.waitForFunction(() => document.getElementById('starMapInfoWindow').classList.contains('gameWinClosing'));
  assert.equal(await page.evaluate(() => ['starMapWindow', 'starMapInfoWindow'].every(id => {
    const el = document.getElementById(id), style = getComputedStyle(el);
    return style.display !== 'none' && style.animationName === 'gameWindowClose';
  })), true, 'carte et details se reduisent ensemble avec animation');
  await page.waitForSelector('#starMapWindow', { state: 'hidden' });
  await page.waitForSelector('#starMapInfoWindow', { state: 'hidden' });
  await page.click('[data-window-id="starMapWindow"]');
  await page.waitForFunction(() => !document.getElementById('starMapWindow').classList.contains('gameWinOpening'));
  await page.waitForSelector('#starMapInfoWindow', { state: 'visible' });
  assert.equal((await page.$eval('#starMapSelName', el => el.textContent)).toLowerCase(), '1-bl', 'la carte selectionnee reste affichee a la reouverture');
  await closeInfo();
  await page.click('[data-window-id="starMapWindow"]');
  await page.waitForSelector('#starMapWindow', { state: 'hidden' });
  await page.click('[data-window-id="starMapWindow"]');
  await page.waitForFunction(() => !document.getElementById('starMapWindow').classList.contains('gameWinOpening'));
  assert.equal(await page.locator('#starMapInfoWindow').isVisible(), false, 'les details reduits separement restent fermes a la reouverture');
  for (const id of ['1-BL', '2-BL', '3-BL', '5-2', 'qz', 'low']) {
    await page.click(`.starMapNode[data-map-id="${id}"] .starMapLabel`);
    assert.equal((await page.$eval('#starMapSelName', el => el.textContent)).toLowerCase(), id.toLowerCase());
    assert.equal(await page.$eval('#starMapJumpBtn', el => el.disabled), true, 'Jump bloque vers ' + id);
    assert.equal(await page.locator('#starMapInfoWindow').isVisible(), true, 'clic carte ouvre les details');
    await closeInfo();
  }
  await page.setViewportSize({ width: 1920, height: 1080 });
  await fitMap();
  await page.locator('.starMapNode[data-map-id="1-8"] .starMapPortal[data-portal-id="p_18_to_1BL"]').click();
  const itinerary = await page.$$eval('#starMapItinerary li', els => els.map(el => ({ from: el.dataset.from,
    to: el.dataset.to, portal: el.dataset.portalId })));
  assert.ok(itinerary.length > 2, 'trajet complet avec plusieurs cartes');
  assert.equal(itinerary[0].from, '1-1');
  assert.deepEqual(itinerary.at(-1), { from: '1-8', to: '1-BL', portal: 'p_18_to_1BL' });
  assert.equal(await page.$$eval('.starMapWire.itinerary', els => els.length), itinerary.length, 'toutes les liaisons du trajet sont visibles');
  await page.waitForFunction(() => document.querySelector('.starMapRouteFlow')?.getAnimations()[0]?.startTime != null);
  const flow = await page.evaluate(() => {
    const path = document.querySelector('.starMapRouteFlow');
    const expected = [...document.querySelectorAll('#starMapItinerary li')].flatMap(step => {
      const wire = [...document.querySelectorAll('.starMapWire.itinerary')].find(line =>
        (line.dataset.from === step.dataset.from && line.dataset.sourcePortal === step.dataset.portalId)
        || (line.dataset.to === step.dataset.from && line.dataset.targetPortal === step.dataset.portalId));
      const points = wire.getAttribute('points').trim().split(/\s+/).map(pair => {
        const [x, y] = pair.split(',').map(Number); return { x, y };
      });
      if (wire.dataset.from !== step.dataset.from) points.reverse();
      return points;
    }).filter((p, i, points) => !i || p.x !== points[i - 1].x || p.y !== points[i - 1].y)
      .map((p, i) => `${i ? 'L' : 'M'}${p.x},${p.y}`).join(' ');
    window.__STAR_MAP_FLOW_TEST__ = path;
    const animation = path.getAnimations()[0], matrix = path.getCTM();
    return { d: path.dataset.routePath, expected, x: matrix.e, y: matrix.f,
      start: animation.startTime, repeat: animation.effect.getTiming().iterations };
  });
  assert.equal(flow.d, flow.expected, 'la lumiere suit toutes les etapes dans le sens depart-destination');
  assert.equal((flow.d.match(/M/g) || []).length, 1, 'un seul depart pour le trajet entier');
  assert.equal(flow.repeat, Infinity, 'le trajet anime recommence en boucle');
  await page.waitForTimeout(450);
  assert.ok(await page.evaluate(previous => {
    const path = document.querySelector('.starMapRouteFlow');
    const matrix = path.getCTM();
    return path === window.__STAR_MAP_FLOW_TEST__ && path.getAnimations()[0].startTime === previous.start
      && Math.hypot(matrix.e - previous.x, matrix.f - previous.y) > 5;
  }, flow), 'l animation avance sans redemarrer a chaque rafraichissement');
  const motionSamples = await page.evaluate(async () => {
    const svg = document.getElementById('starMapEdges'), flow = document.querySelector('.starMapRouteFlow');
    const animation = flow.getAnimations()[0], duration = animation.effect.getTiming().duration;
    const clock = animation.currentTime, probe = document.createElementNS(svg.namespaceURI, 'path');
    probe.setAttribute('d', flow.dataset.routePath); svg.querySelector('defs').appendChild(probe);
    const length = probe.getTotalLength(), samples = [];
    animation.pause();
    try {
      // Juste avant et juste apres B : verifier le retour immediat a A.
      for (const progress of [0, .25, .55, .999, 1.001]) {
        animation.currentTime = duration * progress;
        await new Promise(requestAnimationFrame);
        const matrix = svg.getCTM().inverse().multiply(flow.getCTM());
        const expected = probe.getPointAtLength(length * (progress % 1));
        samples.push({ progress, error: Math.hypot(matrix.e - expected.x, matrix.f - expected.y) });
      }
    } finally {
      probe.remove(); animation.currentTime = clock; animation.play();
    }
    return samples;
  });
  for (const sample of motionSamples) assert.ok(sample.error < 1, `progression continue sans attente : ${JSON.stringify(sample)}`);
  const assertRouteAnimationMoving = async () => {
    assert.equal(await page.locator('.starMapRouteFlow').count(), 1);
    await page.waitForFunction(() => document.querySelector('.starMapRouteFlow')?.getAnimations()[0]?.startTime != null);
    const sample = () => page.$eval('.starMapRouteFlow', flow => {
      const matrix = flow.ownerSVGElement.getCTM().inverse().multiply(flow.getCTM());
      return { x: matrix.e, y: matrix.f, start: flow.getAnimations()[0].startTime };
    });
    const before = await sample();
    await page.waitForTimeout(450);
    const after = await sample();
    assert.equal(after.start, before.start, 'le rafraichissement ne relance pas la boucle');
    assert.ok(Math.hypot(after.x - before.x, after.y - before.y) > 5,
      'le point dore avance aussi apres la reouverture');
  };
  assert.equal(await page.$$eval('.starMapNode.on-route', els => els.length), itinerary.length + 1, 'toutes les etapes sont marquees');
  assert.equal(await page.evaluate(() => window.__CURRENT_MAP_ID__), '1-1', 'le clic affiche le trajet sans lancer de voyage');
  assert.equal(await page.$eval('#starMapJumpBtn', el => el.disabled), true);
  await page.mouse.move(20, 65);
  await page.screenshot({ path: join(tmpdir(), 'orbit-starmap-itinerary-1920.png') });
  await page.click('[data-window-id="starMapWindow"]');
  await page.waitForSelector('#starMapInfoWindow', { state: 'hidden' });
  await page.click('[data-window-id="starMapWindow"]');
  await page.waitForFunction(() => !document.getElementById('starMapInfoWindow').classList.contains('gameWinOpening')
    && getComputedStyle(document.getElementById('starMapInfoWindow')).display !== 'none');
  assert.equal(await page.locator('.starMapWire.itinerary').count(), itinerary.length, 'reduire la carte conserve le trajet pour sa reouverture');
  await assertRouteAnimationMoving();
  for (const delay of [0, 20, 60]) {
    const retiredAnimations = await page.evaluate(async delay => {
      const retired = [];
      for (const id of ['1-5', '1-6', '2-7', '1-1', '4-4', '1-8', '1-5']) {
        const previous = document.querySelector('.starMapRouteFlow'), animation = previous?.getAnimations()[0];
        document.querySelector(`.starMapNode[data-map-id="${id}"] .starMapLabel`).click();
        if (animation && previous !== document.querySelector('.starMapRouteFlow')) retired.push(animation.playState);
        if (delay) await new Promise(resolve => setTimeout(resolve, delay));
      }
      return retired;
    }, delay);
    assert.ok(retiredAnimations.length > 0 && retiredAnimations.every(state => state === 'idle'),
      'les anciennes animations sont annulees a chaque changement de destination');
    await assertRouteAnimationMoving();
  }
  await page.click('.starMapHint');
  await page.waitForTimeout(650);
  assert.equal(await page.locator('.starMapWire.itinerary').count(), 0, 'clic sur le fond efface durablement le trajet');
  assert.equal(await page.locator('.starMapRouteFlow').count(), 0, 'effacer le trajet retire aussi son animation');
  assert.equal(await page.locator('.starMapNode.on-route').count(), 0, 'les etapes sont effacees aussi');
  await page.locator('.starMapNode[data-map-id="1-8"] .starMapPortal[data-portal-id="p_18_to_1BL"]').click();
  assert.equal(await page.locator('.starMapWire.itinerary').count(), itinerary.length, 'un clic portail affiche de nouveau le trajet');
  await closeInfo();
  await page.waitForTimeout(650);
  assert.equal(await page.locator('.starMapWire.itinerary').count(), 0, 'reduire les details seuls efface durablement le trajet');
  assert.equal(await page.locator('.starMapRouteFlow').count(), 0, 'fermer les details retire aussi son animation');
  await page.locator('.starMapNode[data-map-id="1-8"] .starMapPortal[data-portal-id="p_18_to_1BL"]').click();
  await page.waitForFunction(() => !document.getElementById('starMapInfoWindow').classList.contains('gameWinOpening'));
  const infoBefore = await page.locator('#starMapInfoWindow').boundingBox();
  await page.mouse.move(infoBefore.x + 120, infoBefore.y + 13); await page.mouse.down();
  await page.mouse.move(infoBefore.x + 20, infoBefore.y + 73, { steps: 8 }); await page.mouse.up();
  const infoAfter = await page.locator('#starMapInfoWindow').boundingBox();
  assert.ok(infoAfter.x < infoBefore.x - 80 && infoAfter.y > infoBefore.y + 40, 'details deplacables par leur barre');
  assert.equal(await page.locator('.starMapWire.itinerary').count(), itinerary.length, 'deplacer les details conserve le trajet');
  await closeInfo();
  await readableView();
  await page.waitForTimeout(350);
  const readable = await page.locator('.starMapNode[data-map-id="1-1"]').boundingBox();
  assert.ok(Math.abs(readable.width - 224) < 0.1, 'cartes lisibles a taille native');

  // Les barres sont cachees ; le schema reste navigable par glisser et zoom.
  assert.equal(await page.locator('#starMapScrollX').isVisible(), false, 'barre horizontale cachee');
  assert.equal(await page.locator('#starMapScrollY').isVisible(), false, 'barre verticale cachee');
  await page.$eval('#starMapViewport', el => { el.scrollLeft = 220; el.scrollTop = 150; });
  const scroll = await page.$eval('#starMapViewport', el => [el.scrollLeft, el.scrollTop]);
  await page.waitForTimeout(300);
  assert.deepEqual(await page.$eval('#starMapViewport', el => [el.scrollLeft, el.scrollTop]), scroll, 'le defilement ne revient pas en arriere');

  // La molette zoome autour du pointeur, au lieu de faire defiler la carte.
  const wheelPoint = await page.$eval('#starMapViewport', el => {
    const r = el.getBoundingClientRect(); return { x: r.left + el.clientWidth / 2, y: r.top + el.clientHeight / 2 };
  });
  const wheelState = () => page.evaluate(point => {
    const viewport = document.getElementById('starMapViewport'), tree = document.getElementById('starMapTree');
    const bounds = viewport.getBoundingClientRect(), scale = new DOMMatrix(getComputedStyle(tree).transform).a;
    return { scale,
      x: (viewport.scrollLeft + point.x - bounds.left - (parseFloat(tree.style.left) || 0)) / scale,
      y: (viewport.scrollTop + point.y - bounds.top - (parseFloat(tree.style.top) || 0)) / scale,
      sliders: [Number(document.getElementById('starMapScrollX').value), Number(document.getElementById('starMapScrollY').value)],
      scroll: [Math.round(viewport.scrollLeft), Math.round(viewport.scrollTop)] };
  }, wheelPoint);
  await page.mouse.move(wheelPoint.x, wheelPoint.y);
  const beforeWheel = await wheelState();
  await page.mouse.wheel(0, -120);
  await page.waitForFunction(() => new DOMMatrix(getComputedStyle(document.getElementById('starMapTree')).transform).a > 1.1);
  const zoomed = await wheelState();
  assert.ok(zoomed.scale > beforeWheel.scale, 'molette vers le haut zoome');
  assert.ok(Math.hypot(zoomed.x - beforeWheel.x, zoomed.y - beforeWheel.y) < 1.5, 'le point sous la souris reste fixe au zoom');
  assert.deepEqual(zoomed.sliders, zoomed.scroll, 'curseurs synchronises apres zoom molette');
  await page.mouse.wheel(0, 120);
  await page.waitForFunction(() => Math.abs(new DOMMatrix(getComputedStyle(document.getElementById('starMapTree')).transform).a - 1) < 0.00005);
  const unzoomed = await wheelState();
  assert.ok(unzoomed.scale < zoomed.scale, 'molette vers le bas dezoome');
  assert.ok(Math.hypot(unzoomed.x - beforeWheel.x, unzoomed.y - beforeWheel.y) < 2, 'le point sous la souris reste fixe au dezoom');
  await readableView();
  const empty = await page.$eval('#starMapViewport', el => {
    const r = el.getBoundingClientRect();
    for (let y = r.top + 40; y < r.bottom - 80; y += 40) for (let x = r.left + 300; x < r.right - 80; x += 40) {
      const target = document.elementFromPoint(x, y);
      if (target?.closest('#starMapStage') && !target.closest('.starMapNode')) return { x, y };
    }
  });
  assert.ok(empty, 'fond accessible pour glisser');
  const beforePan = await page.$eval('#starMapViewport', el => el.scrollLeft);
  await page.mouse.move(empty.x, empty.y); await page.mouse.down();
  assert.equal(await page.$eval('#starMapViewport', el => el.classList.contains('panning')), true);
  await page.mouse.move(empty.x - 150, empty.y, { steps: 8 }); await page.mouse.up();
  assert.ok(await page.$eval('#starMapViewport', el => el.scrollLeft) > beforePan + 100, 'glisser du schema conserve');
  await readableView();

  // Vrais contacts tactiles, y compris quand les doigts commencent sur
  // une carte : zoom local, ancrage, limites et retour au glisser simple.
  const desktopSize = page.viewportSize();
  const touchSession = await page.context().newCDPSession(page);
  await touchSession.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await page.setViewportSize({ width: 390, height: 844 });
  await readableView();
  const touchCenter = await page.locator('.starMapNode[data-map-id="1-1"] .starMapArt').boundingBox();
  const fingerCenter = { x: touchCenter.x + touchCenter.width / 2, y: touchCenter.y + touchCenter.height / 2 };
  const mapAt = point => page.evaluate(point => {
    const viewport = document.getElementById('starMapViewport'), tree = document.getElementById('starMapTree');
    const bounds = viewport.getBoundingClientRect(), scale = new DOMMatrix(getComputedStyle(tree).transform).a;
    return { scale, x: (viewport.scrollLeft + point.x - bounds.left - viewport.clientLeft - (parseFloat(tree.style.left) || 0)) / scale,
      y: (viewport.scrollTop + point.y - bounds.top - viewport.clientTop - (parseFloat(tree.style.top) || 0)) / scale };
  }, point);
  const contact = (id, x, y) => ({ id, x, y, radiusX: 3, radiusY: 3, force: 1 });
  const pair = distance => [contact(1, fingerCenter.x - distance / 2, fingerCenter.y), contact(2, fingerCenter.x + distance / 2, fingerCenter.y)];
  const touch = async (type, touchPoints) => {
    await touchSession.send('Input.dispatchTouchEvent', { type, touchPoints });
    // Chromium peut regrouper les mouvements jusqu'a la frame suivante.
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  };
  assert.equal(await page.evaluate(points => points.every(point => document.elementFromPoint(point.x, point.y)?.closest('.starMapNode')),
    pair(60)), true, 'les doigts commencent sur la carte');
  const beforePinch = await mapAt(fingerCenter);
  await touch('touchStart', pair(60));
  await touch('touchMove', pair(84));
  await page.waitForFunction(() => new DOMMatrix(getComputedStyle(document.getElementById('starMapTree')).transform).a > 1.3);
  const pinched = await mapAt(fingerCenter);
  assert.ok(Math.abs(pinched.scale - 1.4) < .01, 'ecarter les doigts zoome selon leur distance');
  assert.ok(Math.hypot(pinched.x - beforePinch.x, pinched.y - beforePinch.y) < 2, 'le point entre les doigts reste fixe');
  assert.equal(await page.evaluate(() => window.visualViewport.scale), 1, 'le geste ne zoome pas la page du jeu');
  await touch('touchMove', pair(110));
  assert.equal((await mapAt(fingerCenter)).scale, 1.5, 'limite de zoom maximum respectee');
  await touch('touchMove', pair(60));
  assert.ok(Math.abs((await mapAt(fingerCenter)).scale - 1) < .01, 'rapprocher les doigts dezoome');
  const viewportFit = await page.$eval('#starMapViewport', el => {
    const tree = document.getElementById('starMapTree');
    return Math.min(1, el.clientWidth / tree.offsetWidth, el.clientHeight / tree.offsetHeight);
  });
  await touch('touchMove', pair(4));
  assert.ok(Math.abs((await mapAt(fingerCenter)).scale - viewportFit) < .00001, 'le dezoom tactile s arrete quand tout est visible');
  await touch('touchMove', pair(60));
  await touch('touchEnd', [pair(60)[1]]);
  const beforeSingleFinger = await page.$eval('#starMapViewport', el => el.scrollLeft);
  const remaining = contact(1, fingerCenter.x - 65, fingerCenter.y);
  await touch('touchMove', [remaining]);
  await touch('touchEnd', []);
  assert.ok(await page.$eval('#starMapViewport', el => el.scrollLeft) > beforeSingleFinger + 30,
    'le doigt restant peut glisser la carte apres un pincement');
  assert.equal(await page.locator('#starMapInfoWindow').isVisible(), false, 'aucune selection parasite apres le geste');
  assert.equal(await page.$eval('#starMapViewport', el => el.classList.contains('panning')), false);

  await touch('touchStart', pair(60)); await touch('touchMove', pair(72));
  await touch('touchCancel', []);
  assert.equal(await page.$eval('#starMapViewport', el => el.classList.contains('panning')), false, 'un geste interrompu libere le glisser');
  await page.setViewportSize(desktopSize);
  await readableView();
  const tapCard = await page.locator('.starMapNode[data-map-id="1-1"] .starMapLabel').boundingBox();
  await touch('touchStart', [contact(1, tapCard.x + tapCard.width / 2, tapCard.y + tapCard.height / 2)]);
  await touch('touchEnd', []);
  assert.equal(await page.locator('#starMapInfoWindow').isVisible(), true, 'un appui simple selectionne encore une carte');
  await closeInfo();
  await touchSession.send('Emulation.setTouchEmulationEnabled', { enabled: false });
  await touchSession.detach();
  console.log('zoom tactile sur telephone : ancrage, limites, glisser, annulation et selection valides');

  const portal = page.locator('.starMapNode[data-map-id="1-1"] .starMapPortal[data-portal-id="p_11_to_12"]');
  await portal.hover();
  assert.equal(await page.$$eval('.starMapWire.highlighted', els => els.length), 1, 'survol isole la liaison du portail');
  await page.locator('#starMapWindow').screenshot({ path: join(tmpdir(), 'orbit-starmap-detail-1920.png') });
  await portal.click();
  assert.equal(await page.$eval('#starMapSelName', el => el.textContent), '1-2', 'clic portail selectionne sa destination');
  await closeInfo();

  // 2. Sélection 1-2 puis Jump (vrai channel 10 s + switch multi validé serveur).
  await page.click('.starMapNode[data-map-id="1-2"] .starMapLabel');
  assert.equal(await page.locator('#starMapInfoWindow').isVisible(), true, 'un nouveau clic rouvre les details');
  const selName = await page.$eval("#starMapSelName", (e) => e.textContent);
  assert.equal(selName, "1-2");
  const btnDisabled = await page.$eval("#starMapJumpBtn", (e) => e.disabled);
  assert.equal(btnDisabled, false, "bouton jump actif vers 1-2");
  await page.evaluate(() => {
    window.__starJumpDraws = { texts: [], swipeFrames: 0, countdowns: [] };
    new MutationObserver(records => {
      for (const record of records) for (const node of record.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE && /^\d+$/.test(node.textContent)) {
          window.__starJumpDraws.countdowns.push(node.textContent);
        }
      }
    }).observe(document.getElementById('orbitNotifications'), { childList: true });
    const fillText = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function(text, ...args) {
      if (this.canvas.id === 'game' && String(text).startsWith('Jump vers ')
        && !window.__starJumpDraws.texts.includes(String(text))) window.__starJumpDraws.texts.push(String(text));
      return fillText.call(this, text, ...args);
    };
    const drawImage = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function(image, ...args) {
      if (this.canvas.id === 'game' && this.globalAlpha > 0.1
        && String(image?.src || '').includes('/PORTAL/NORMAUX/JUMP/')) window.__starJumpDraws.swipeFrames++;
      return drawImage.call(this, image, ...args);
    };
  });
  await page.click("#starMapJumpBtn");
  assert.equal(await page.evaluate(() => ['starMapWindow', 'starMapInfoWindow'].every(id => {
    const el = document.getElementById(id);
    return el.classList.contains('gameWinClosing') && getComputedStyle(el).animationName === 'gameWindowClose';
  })), true, 'Jump reduit immediatement les deux fenetres avec animation');
  const stationary = await page.evaluate(() => window.__STARMAP_MOVEMENT_TEST__.state());
  assert.equal(stationary.vx, 0); assert.equal(stationary.vy, 0); assert.equal(stationary.moving, false);
  await page.waitForSelector('#starMapWindow', { state: 'hidden' });
  await page.waitForSelector('#starMapInfoWindow', { state: 'hidden' });
  await page.waitForFunction(() => window.__starJumpDraws.countdowns.includes('10') &&
    [...document.querySelectorAll('#orbitNotifications .orbitNotification:not(.leaving)')].some(node => /^(10|9)$/.test(node.textContent)));
  await page.mouse.click(350, 400);
  const miniBounds = await page.locator('#miniCanvas').boundingBox();
  assert.ok(miniBounds, 'minimap visible');
  await page.mouse.click(miniBounds.x + miniBounds.width / 2, miniBounds.y + miniBounds.height / 2);
  // Un ordre de bot deja en vol ne doit pas non plus deplacer le vaisseau.
  await page.evaluate(() => window.__STARMAP_MOVEMENT_TEST__.order());
  await pause(300);
  const locked = await page.evaluate(() => window.__STARMAP_MOVEMENT_TEST__.state());
  assert.equal(locked.x, stationary.x); assert.equal(locked.y, stationary.y);
  assert.equal(locked.vx, 0); assert.equal(locked.vy, 0); assert.equal(locked.moving, false);
  await page.screenshot({ path: join(tmpdir(), 'orbit-starmap-jump-countdown.png') });
  await pause(1000);
  await page.click('[data-window-id="starMapWindow"]');
  await page.waitForFunction(() => !document.getElementById('starMapInfoWindow').classList.contains('gameWinOpening')
    && getComputedStyle(document.getElementById('starMapInfoWindow')).display !== 'none');
  const btnText = await page.$eval("#starMapJumpBtn", (e) => e.textContent);
  console.log("bouton pendant charge:", btnText);
  assert.ok(/^Jump \([1-9]s\)$/.test(btnText), btnText);
  // Garder une destination plus lointaine pendant le saut deja lance.
  // A l'arrivee, le trajet se recalcule alors que la fenetre est reduite.
  await closeInfo();
  await page.click('.starMapNode[data-map-id="1-BL"] .starMapLabel');
  await page.click('[data-window-id="starMapWindow"]');
  await page.waitForSelector('#starMapInfoWindow', { state: 'hidden' });
  await page.waitForFunction(() => window.__starJumpDraws.swipeFrames > 0, null, { timeout: 15000 });
  await page.screenshot({ path: join(tmpdir(), 'orbit-starmap-jump-swipe.png') });
  await page.waitForFunction(() => String(window.__CURRENT_MAP_ID__ || "").toLowerCase() === "1-2", null, { timeout: 30000 });
  const pos = await page.evaluate(() => ({ x: window.__ORBIT_DEBUG_POS__?.x }));
  console.log("arrivé en 1-2");
  const jumpDisplay = await page.evaluate(() => window.__starJumpDraws);
  assert.deepEqual(jumpDisplay.countdowns, ['10', '9', '8', '7', '6', '5', '4', '3', '2', '1'], 'decompte complet dans l affichage rapide du haut');
  assert.deepEqual(jumpDisplay.texts, [], 'aucun ancien decompte au-dessus du vaisseau');
  console.log('deplacement verrouille et decompte affichage rapide valides');
  const jumpLogs = await page.evaluate(async userId => {
    const { readGameLogs } = await import('/SRC/CORE/GAME_LOG_STORE.js');
    const { entries } = await readGameLogs(String(userId), { pageSize: 100 });
    return entries.map(entry => entry.text);
  }, account.user.id);
  const countdownLogs = jumpLogs.filter(text => /^Jump vers 1-2 dans \d+ secondes?\.$/.test(text));
  assert.ok(countdownLogs.includes('Jump vers 1-2 dans 10 secondes.') && countdownLogs.includes('Jump vers 1-2 dans 1 seconde.'), 'le journal contient le decompte complet');
  assert.equal(new Set(countdownLogs).size, countdownLogs.length, 'chaque seconde est journalisee une seule fois');
  assert.ok(jumpLogs.includes('Jump vers 1-2 : portail activé.'), 'activation du swipe dans le journal');
  await page.click('[data-window-id="starMapWindow"]');
  await page.waitForFunction(() => !document.getElementById('starMapWindow').classList.contains('gameWinOpening'));
  assert.equal(await page.locator('#starMapItinerary li').first().getAttribute('data-from'), '1-2',
    'le trajet repart de la nouvelle carte apres le saut');
  await assertRouteAnimationMoving();
  await page.click('.starMapNode[data-map-id="1-1"] .starMapLabel');
  assert.equal(await page.$eval('#starMapJumpBtn', el => el.disabled), true, 'Jump en recharge apres arrivee');
  await page.waitForFunction(() => !document.getElementById('starMapJumpBtn').disabled, null, { timeout: 6500 });
  // Un nouveau saut doit aussi etre accepte par le serveur avant l ancien CD de 30 s.
  await page.click('#starMapJumpBtn');
  await page.waitForSelector('#starMapWindow', { state: 'hidden' });
  await page.waitForSelector('#starMapInfoWindow', { state: 'hidden' });
  await page.waitForFunction(() => String(window.__CURRENT_MAP_ID__ || '').toLowerCase() === '1-1', null, { timeout: 20000 });
  console.log('recharge 5s + retour en 1-1 valides');
  await page.click('[data-window-id="starMapWindow"]');
  await page.waitForFunction(() => !document.getElementById('starMapWindow').classList.contains('gameWinOpening'));
  await page.click('.starMapNode[data-map-id="1-2"] .starMapLabel');
  await page.waitForFunction(() => !document.getElementById('starMapJumpBtn').disabled, null, { timeout: 6500 });
  await page.click('#starMapJumpBtn');
  const hit = await page.evaluate(() => window.__STARMAP_DAMAGE_TEST__(10));
  assert.equal(hit.preparing, false, 'un vrai degat coupe immediatement la preparation du Jump');
  await page.evaluate(() => window.__STARMAP_MOVEMENT_TEST__.order());
  const afterCancel = await page.evaluate(() => window.__STARMAP_MOVEMENT_TEST__.state());
  await pause(300);
  const resumed = await page.evaluate(() => window.__STARMAP_MOVEMENT_TEST__.state());
  assert.ok(resumed.x > afterCancel.x && resumed.y > afterCancel.y, 'le deplacement reprend apres annulation');
  await page.waitForFunction(async userId => {
    const { readGameLogs } = await import('/SRC/CORE/GAME_LOG_STORE.js');
    return (await readGameLogs(String(userId), { pageSize: 100 })).entries.some(entry => entry.text === 'Jump annulé.');
  }, account.user.id);
  assert.equal(await page.evaluate(() => window.__CURRENT_MAP_ID__), '1-1', 'le Jump annule ne change pas la carte');
  console.log('Jump annule sur degats et message journal verifie');
  // Recharger en mouvement avant l'autosave conserve le dernier snapshot,
  // puis la reconnexion et le prochain save ne doivent pas le remplacer.
  await page.addInitScript(() => {
    const cache = JSON.parse(localStorage.getItem('orbit_user_cache') || 'null');
    window.__REFRESH_POSITION_EXPECTED__ = cache?.user?.hangars?.find(h => h.active)?.lastPos;
  });
  const refreshDeparture = await page.evaluate(() => window.__STARMAP_MOVEMENT_TEST__.state());
  await page.evaluate(() => window.__STARMAP_MOVEMENT_TEST__.order());
  await page.waitForFunction(start => {
    const current = window.__STARMAP_MOVEMENT_TEST__.state();
    return Math.hypot(current.x - start.x, current.y - start.y) > 150;
  }, refreshDeparture, { timeout: 10000 });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#loadingStartBtn:not([disabled])', { timeout: 90000 });
  await page.click('#loadingStartBtn');
  await page.waitForFunction(() => getComputedStyle(document.getElementById('loadingOverlay')).display === 'none', null, { timeout: 60000 });
  const refreshedPosition = await page.evaluate(() => ({
    ...window.__STARMAP_MOVEMENT_TEST__.state(), expected: window.__REFRESH_POSITION_EXPECTED__, map: window.__CURRENT_MAP_ID__,
  }));
  assert.equal(refreshedPosition.map, '1-1');
  assert.equal(refreshedPosition.x, refreshedPosition.expected.x, 'le demarrage conserve le snapshot de fermeture');
  assert.equal(refreshedPosition.y, refreshedPosition.expected.y);
  await page.waitForTimeout(1500);
  await page.evaluate(async () => { const { flushNetUser } = await import('/SRC/CORE/ACCOUNT_NET.js'); await flushNetUser(); });
  const refreshStored = (await (await fetch(url + '/api/me', { headers: { Authorization: `Bearer ${account.token}` } })).json()).user;
  assert.deepEqual(refreshStored.hangars.find(h => h.active).lastPos, refreshedPosition.expected,
    'le prochain save serveur conserve aussi la position restauree');
  console.log('refresh en mouvement : position exacte restauree et confirmee serveur');
  assert.ok(errors.length === 0, "erreurs page: " + errors.slice(0, 3).join(" | "));
  console.log("STARMAP SMOKE OK");
} catch (error) {
  if (page) console.log('diagnostic navigateur:', await page.evaluate(() => ({
    state: window.__STARMAP_MOVEMENT_TEST__?.state(), map: window.__CURRENT_MAP_ID__,
    equipment: window.__ORBIT_ENGINE__?.getEquipmentState(),
    notices: document.getElementById('orbitNotifications')?.textContent, errors: window.__STARJUMP_ERR__,
  })).catch(() => null));
  if (page) console.log('journal navigateur:', await page.evaluate(async () => {
    const { getCurrentUserFull } = await import('/SRC/CORE/ACCOUNT.js');
    const { readGameLogs } = await import('/SRC/CORE/GAME_LOG_STORE.js');
    return (await readGameLogs(String(getCurrentUserFull().id), { pageSize: 25 })).entries.map(e => e.text);
  }).catch(() => null));
  throw error;
} finally {
  try { await browser?.close(); } catch {}
  const stopped = server.exitCode === null ? once(server, 'exit') : Promise.resolve();
  server.kill(); await stopped;
  assert.equal(dirname(resolve(temporary)), resolve(tmpdir()));
  assert.ok(basename(temporary).startsWith('orbit-starmap-'));
  await rm(temporary, { recursive: true, force: true });
}
