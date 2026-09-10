// Usage: node SCRIPTS/AUDIT_SPRITE_ATLASES.js CANDIDATE_DIRECTORY
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
import { chromium } from 'playwright-core';
import { NPC_TYPES } from '../NPC/NPC_TYPES.js';
import { SHIP_PACKS } from '../SHIP/SHIP_PACKS.js';
import { SHIP_EFFECTS } from '../SHIP/SHIP_EFFECTS.js';
import { COLLECTABLE_TYPES } from '../SRC/DATA/COLLECTABLES.js';

const root = process.cwd(), candidates = resolve(process.argv[2]);
const inventory = JSON.parse(await readFile(resolve(candidates, 'inventory.json'), 'utf8'));
const output = resolve(root, process.argv[3] || 'TEST/REPORTS/sprite-atlas-audit');
await mkdir(output, { recursive: true });
const report = { date: new Date().toISOString(), environment: 'Headless Microsoft Edge; local HTTP; zero RGBA tolerance',
  method: 'PNG pages <=4096px, 2px edge extrusion, original frame rectangles. Every frame, 4 scale/position cases, smoothing off/on. Matching separate Canvas contexts.',
  inventory: { standaloneImages: inventory.standaloneImages, errors: inventory.errors },
  missingConfiguredFrames: [], groups: [] };
for (const [label, pack] of [...Object.entries(NPC_TYPES).map(([id, value]) => [id, value.sprite]), ...SHIP_PACKS.map(p => [p.id, p]), ...Object.entries(SHIP_EFFECTS), ...Object.entries(COLLECTABLE_TYPES).map(([id, value]) => [id, value.sprite])]) {
  if (!pack?.path || !pack.frames) continue;
  for (let i = 0; i < pack.frames; i++) {
    const src = `${pack.path}${(pack.firstNumber ?? 1) + i}${pack.ext || '.png'}`;
    try { await access(resolve(root, src)); }
    catch { report.missingConfiguredFrames.push({ label, src }); }
  }
}
const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (pathname === '/') { res.setHeader('content-type', 'text/html'); res.end('<!doctype html><title>Atlas audit</title>'); return; }
    const base = pathname.startsWith('/candidates/') ? candidates : root;
    const file = resolve(base, '.' + (base === candidates ? pathname.slice('/candidates'.length) : pathname));
    if (!file.startsWith(base + sep)) throw Error('Invalid path');
    res.setHeader('content-type', extname(file) === '.js' ? 'text/javascript' : 'image/png');
    res.end(await readFile(file));
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
let browser;
try {
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  report.browser = browser.version();
  let cursor = 0;
  await Promise.all(Array.from({ length: 2 }, async () => {
  while (cursor < inventory.groups.length) {
    const group = inventory.groups[cursor++];
    const { pages, ...info } = group;
    if (group.skipped) { report.groups.push(info); continue; }
    const page = await browser.newPage({ serviceWorkers: 'block' });
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    try {
      const result = await page.evaluate(async pages => {
        const { createImageLoader } = await import('/SRC/CORE/IMAGE_LOADER.js');
        const load = createImageLoader({ concurrency: 6 });
        const reference = document.createElement('canvas'), candidate = document.createElement('canvas'), controlCanvas = document.createElement('canvas');
        const refCtx = reference.getContext('2d'), ctx = candidate.getContext('2d'), controlCtx = controlCanvas.getContext('2d');
        let comparisons = 0, failedComparisons = 0, maxChannelDelta = 0, baselineIssues = 0;
        const cases = {};
        const examples = [];
        for (const sheet of pages) {
          const image = await load.load('/candidates/' + sheet.file);
          if (!load.isReady(image)) throw Error('Candidate load failed: ' + sheet.file);
          const originals = await Promise.all(sheet.frames.map(frame => load.load('/' + frame.src.split('/').map(encodeURIComponent).join('/'))));
          for (let frameIndex = 0; frameIndex < sheet.frames.length; frameIndex++) {
            const frame = sheet.frames[frameIndex], original = originals[frameIndex];
            if (!load.isReady(original)) throw Error('Original load failed: ' + frame.src);
            for (const smoothing of [false, true]) for (const [scale, offset] of [[1, 0], [1, .25], [.5, .25], [1.05, .25]]) {
              const w = frame.w * scale, h = frame.h * scale;
              const cw = Math.ceil(w) + 8, ch = Math.ceil(h) + 8;
              // Reset both backing stores equally; no asynchronous readback backend transition between A/B.
              reference.width = candidate.width = controlCanvas.width = cw; reference.height = candidate.height = controlCanvas.height = ch;
              refCtx.imageSmoothingEnabled = ctx.imageSmoothingEnabled = controlCtx.imageSmoothingEnabled = smoothing;
              refCtx.drawImage(original, 3 + offset, 3 + offset, w, h);
              controlCtx.drawImage(original, 3 + offset, 3 + offset, w, h);
              ctx.drawImage(image, frame.x, frame.y, frame.w, frame.h, 3 + offset, 3 + offset, w, h);
              const a = refCtx.getImageData(0, 0, cw, ch).data;
              const b = ctx.getImageData(0, 0, cw, ch).data;
              const key = `${smoothing ? 'smooth' : 'nearest'} scale=${scale} offset=${offset}`;
              cases[key] ||= { comparisons: 0, failures: 0 };
              cases[key].comparisons++;
              {
                const control = controlCtx.getImageData(0, 0, cw, ch).data;
                if (control.some((value, i) => value !== a[i])) baselineIssues++;
              }
              let delta = 0;
              for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) delta = Math.max(delta, Math.abs(a[i] - b[i]));
              comparisons++;
              if (delta) {
                failedComparisons++;
                cases[key].failures++;
                maxChannelDelta = Math.max(maxChannelDelta, delta);
                if (examples.length < 8) examples.push({ src: frame.src, smoothing, scale, offset, maxChannelDelta: delta });
              }
            }
          }
        }
        return { comparisons, failedComparisons, maxChannelDelta, baselineIssues, cases, examples };
      }, pages);
      report.groups.push({ ...info, atlasPages: pages.length, ...result });
    } catch (error) { report.groups.push({ ...info, error: error.message }); }
    await page.close();
    if (report.groups.length % 10 === 0) {
      await writeFile(resolve(output, 'results.json'), JSON.stringify(report, null, 2));
      console.log(JSON.stringify({ completed: report.groups.length, total: inventory.groups.length,
        failingGroups: report.groups.filter(g => g.failedComparisons || g.error).length }));
    }
  }
  }));
  report.groups.sort((a,b) => a.id-b.id);
  report.summary = {
    sequences: report.groups.length, frames: report.groups.reduce((s,g) => s+g.count,0),
    exactGroups: report.groups.filter(g => g.comparisons && !g.failedComparisons && g.rawRgbaEqual).length,
    failingGroups: report.groups.filter(g => g.failedComparisons || g.error || !g.rawRgbaEqual).length,
    skippedGroups: report.groups.filter(g => g.skipped).length,
    comparisons: report.groups.reduce((s,g) => s+(g.comparisons || 0),0),
    failedComparisons: report.groups.reduce((s,g) => s+(g.failedComparisons || 0),0),
    sourceBytes: report.groups.reduce((s,g) => s+g.sourceBytes,0), atlasBytes: report.groups.reduce((s,g) => s+g.atlasBytes,0),
    sourcePixels: report.groups.reduce((s,g) => s+g.sourcePixels,0), atlasPixels: report.groups.reduce((s,g) => s+g.atlasPixels,0),
    variableDimensionGroups: report.groups.filter(g => g.variableDimensions).length,
    taggedColorGroups: report.groups.filter(g => g.colorMetadata).length,
    largerFileGroups: report.groups.filter(g => g.atlasBytes > g.sourceBytes).length,
    atlasPages: report.groups.reduce((s,g) => s+(g.atlasPages || 0),0), missingConfiguredFrames: report.missingConfiguredFrames.length };
  await writeFile(resolve(output, 'results.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report.summary, null, 2));
} finally {
  await browser?.close(); server.closeAllConnections(); await new Promise(r => server.close(r));
}
