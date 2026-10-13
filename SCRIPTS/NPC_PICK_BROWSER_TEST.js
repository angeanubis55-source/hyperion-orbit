// Real Canvas alpha and production NPC picking, with local PNGs and no account.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const engine = (await readFile(resolve(root, 'SRC/CORE/ORBIT_ENGINE.js'), 'utf8')).replace(/\r\n/g, '\n');
const functions = ['angleToFrameIndex', 'getEnemySpriteFrame', 'enemySpriteSize',
  'enemySpriteContainsPoint', 'pickEnemyAtScreen', 'drawEnemyBody'].map(name => {
  const start = engine.indexOf(`function ${name}(`), end = engine.indexOf('\n}', start);
  assert.ok(start >= 0 && end > start, name);
  return engine.slice(start, end + 2);
}).join('\n');
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (pathname === '/') {
      response.writeHead(200, { 'content-type': 'text/html' });
      response.end('<!doctype html><canvas id="fixture" width="1000" height="900"></canvas>');
      return;
    }
    const file = resolve(root, '.' + pathname);
    if (!file.startsWith(root + sep)) throw new Error('outside workspace');
    const mime = { '.js': 'text/javascript', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif' };
    const content = await readFile(file);
    response.writeHead(200, { 'content-type': mime[extname(file)] || 'application/octet-stream' });
    response.end(content);
  } catch {
    response.writeHead(404); response.end();
  }
});

let browser;
try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  const results = await page.evaluate(async functions => {
    const { createSpriteHitCache } = await import('/SRC/CORE/SPRITE_HIT_CACHE.js');
    const { NPC_TYPES } = await import('/NPC/NPC_TYPES.js');
    const { getNpcSpriteFrame } = await import('/NPC/NPC_RENDERER.js');
    const { drawCenteredImage, screenToWorldPoint, worldToScreenPoint } = await import('/SRC/CORE/RENDERING.js');
    let maskReads = 0, lastDrawing;
    const cache = createSpriteHitCache({ createCanvas() {
      const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d', { willReadFrequently: true });
      const read = ctx.getImageData.bind(ctx);
      ctx.getImageData = (...args) => { maskReads++; return read(...args); };
      return canvas;
    } });
    Object.assign(window, {
      NPC_TYPES, getNpcSpriteFrame, spriteHitCache: cache, enemies: [], TAU: Math.PI * 2,
      normAng: angle => ((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2),
      isImgReady: img => !!(img?.complete && img.naturalWidth > 0),
      ctx: document.getElementById('fixture').getContext('2d'),
      camera: { x: 12000, y: 7000 }, petLockValid: () => false, netplayNpcActive: () => false,
      drawCenteredImage: (ctx, image, w, h) => {
        lastDrawing = { image, w, h }; return drawCenteredImage(ctx, image, w, h);
      },
    });
    window.screenToWorld = (sx, sy) => screenToWorldPoint(sx, sy, camera, innerWidth, innerHeight);
    const production = new Function(functions + '\nreturn { pickEnemyAtScreen, drawEnemyBody };')();
    const loaded = new Map();
    async function load(src) {
      if (!loaded.has(src)) loaded.set(src, (async () => {
        const img = new Image(); img.src = '/' + src;
        await img.decode(); return img;
      })());
      return loaded.get(src);
    }
    const oracle = document.createElement('canvas'), oracleCtx = oracle.getContext('2d', { willReadFrequently: true });
    let types = 0, frames = 0, samples = 0, mindfireFrames = 0;
    const failures = [], unavailable = [];
    for (const [type, cfg] of Object.entries(NPC_TYPES)) {
      const sp = cfg.sprite;
      if (!sp?.path) continue;
      const count = type === 'npc_Mindfire_Behemoth' ? sp.frames : 1;
      sp._imgs = []; sp._ready = true;
      for (let frame = 0; frame < count; frame++) {
        const src = `${sp.path}${sp.firstNumber + frame}${sp.ext}`;
        let img;
        try { img = await load(src); } catch { unavailable.push({ type, src }); continue; }
        sp._imgs[frame] = img;
        const npc = { type, x: 12000, y: 7000, hp: 100, r: cfg.r || 18,
          angle: 0, spritePlay: true, spriteIdx: frame };
        window.enemies = [npc];
        oracle.width = img.naturalWidth; oracle.height = img.naturalHeight;
        oracleCtx.drawImage(img, 0, 0);
        const rgba = oracleCtx.getImageData(0, 0, oracle.width, oracle.height).data;
        // Zone cliquable pleine (sprite + anneau) : chaque pixel du sprite
        // verrouille le NPC, opaque comme transparent (aucun clic à travers).
        const indexes = new Set();
        for (let y = 0; y < oracle.height; y += Math.max(1, Math.floor(oracle.height / 20))) {
          for (let x = 0; x < oracle.width; x += Math.max(1, Math.floor(oracle.width / 20))) {
            indexes.add(y * oracle.width + x);
          }
        }
        for (const opaque of [false, true]) {
          for (let index = 0; index < oracle.width * oracle.height; index++) {
            if ((rgba[index * 4 + 3] > 0) === opaque) { indexes.add(index); break; }
          }
        }
        for (const boss of [false, true]) {
          npc.isBoss = boss;
          production.drawEnemyBody(npc, frame);
          const w = (sp.w ?? sp.size ?? 160) * (boss ? 1.05 : 1);
          const h = (sp.h ?? sp.size ?? 160) * (boss ? 1.05 : 1);
          if (lastDrawing?.image !== img || lastDrawing.w !== w || lastDrawing.h !== h) {
            failures.push(`${type}:${frame} mismatched rendering`);
          }
          for (const index of indexes) {
            const px = index % oracle.width, py = Math.floor(index / oracle.width);
            const screen = worldToScreenPoint(npc.x + ((px + 0.5) / oracle.width - 0.5) * w,
              npc.y + ((py + 0.5) / oracle.height - 0.5) * h, camera, innerWidth, innerHeight);
            const hit = production.pickEnemyAtScreen(screen.x, screen.y) === npc;
            const expected = true;
            samples++;
            if (hit !== expected && failures.length < 20) failures.push(`${type}:${frame}:${px},${py}:boss=${boss}`);
          }
        }
        frames++; if (type === 'npc_Mindfire_Behemoth') mindfireFrames++;
      }
      types++;
    }
    return { types, frames, samples, mindfireFrames, maskReads, cache: cache.stats(), unavailable, failures };
  }, functions);
  assert.deepEqual(results.failures, []);
  assert.equal(results.mindfireFrames, 32);
  assert.equal(results.unavailable.length, 0, JSON.stringify(results.unavailable));
  assert.ok(results.types > 300);
  assert.ok(results.cache.bytes <= 4 * 1024 * 1024);
  console.log(JSON.stringify(results, null, 2));
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
