import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { chromium } from "playwright-core";
import { MAP_LOADERS } from "../SRC/CORE/MAP_REGISTRY.js";

const root = process.cwd();
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".jpg": "image/jpeg", ".mp3": "audio/mpeg" };

const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
    const file = normalize(join(root, relative));
    if (!file.startsWith(root)) throw new Error("Invalid path");
    if (!(await stat(file)).isFile()) throw new Error("Not a file");
    response.writeHead(200, { "content-type": types[extname(file).toLowerCase()] || "application/octet-stream" });
    response.end(await readFile(file));
  } catch {
    response.writeHead(404);
    response.end("Not found");
  }
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const { port } = server.address();

// Test-only module instrumentation is injected through Playwright routing.
// No debug/kill API is added to the shipped game.
const browser = await chromium.launch({channel: 'msedge', headless: true});
const context = await browser.newContext();
const page = await context.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.route('**/SRC/CORE/ORBIT_ENGINE.js*', async route => {
  let source = await readFile(join(root, 'SRC/CORE/ORBIT_ENGINE.js'), 'utf8');
  for (const name of ['zoneController', 'drawExplosions', 'update', 'draw', 'drawUI']) {
    source = source.replace(`function ${name}(`, `function ${name}(...args) { return measureGameTask('${name}', () => ${name}Measured(...args)); }\nfunction ${name}Measured(`);
  }
  source = source.replace("window.__ORBIT_ENGINE__ = {", `
window.__killAudit = {
  prepare(type) {
    player.iFrames = 100;
    const e = makeEnemy(type, player.x + 250, player.y);
    enemies.push(e);
    if (type === 'npc_Cubikon') { e._spawnedOnce = true; spawnProtegitOnCubikonHit(e, 80); }
    return e.id;
  },
  hit(id) {
    const e = enemies.find(e => e.id === id);
    if (!e) throw new Error('Missing audit target');
    damageEnemy(e, (e.hp + e.sh) * 10);
    if (e.hp > 0) throw new Error('Target survived');
  },
  state() { return { started, kills: player.kills, dirty: account.dirty,
    pendingSave: !!progressSaveIdleHandle, enemies: enemies.length,
    dead: enemies.filter(e => e.hp <= 0).length }; },
  base() { moveTarget.active = false; player.vx = 0; player.vy = 0; player.x = zoneSafe.zone.x; player.y = zoneSafe.zone.y; return getHangarAccess(); },
};\nwindow.__ORBIT_ENGINE__ = {`);
  await route.fulfill({contentType:'text/javascript',body:source});
});
await page.addInitScript(() => {
  const u = {id:'kill-audit',pseudo:'KillAudit',email:'audit@local',ship:'PhoenixBleu',inventory:{counts:{laser_lf1:5000},ships:['PhoenixBleu'],shipModules:[]}};
  localStorage.setItem('orbit_users',JSON.stringify([u]));
  localStorage.setItem('orbit_current_user',JSON.stringify({id:u.id,pseudo:u.pseudo,email:u.email}));
  sessionStorage.setItem('orbit_assets_preloaded_v1','ready');
  window.__frameGaps=[];
  window.__longTasks=[];
  let last=performance.now();
  const frame=t=>{ window.__frameGaps.push({t,ms:t-last}); if(window.__frameGaps.length>2000)window.__frameGaps.shift(); last=t; requestAnimationFrame(frame); };
  requestAnimationFrame(frame);
  new PerformanceObserver(list=>{for(const e of list.getEntries())window.__longTasks.push({t:e.startTime,ms:e.duration});}).observe({type:'longtask',buffered:true});
});
try {
  await page.goto(`http://127.0.0.1:${port}/index.html?map=1-8`);
  await page.waitForFunction(()=>window.__killAudit?.state().started && !document.documentElement.classList.contains('orbitBooting'),null,{timeout:60000});
  await page.mouse.click(10, 10); // Unlock audio in the isolated session.
  await page.waitForTimeout(2000);
  for (const panel of ['closed','inventory']) {
    await page.evaluate(panel=>{
      if(panel==='closed')window.HyperionProfile.close({immediate:true});
      else {window.HyperionProfile.open();document.querySelector('[data-tab="inventory"]').click();}
    },panel);
    await page.waitForTimeout(1500);
    for(const type of ['idle','npc_StreuneR8','npc_Cubikon']) {
      for(let repeat=0;repeat<2;repeat++) {
        const id=type==='idle'?null:await page.evaluate(type=>window.__killAudit.prepare(type),type);
        await page.waitForTimeout(500);
        const before=await page.evaluate(()=>{window.HyperionPerformance.reset();return {t:performance.now(),state:window.__killAudit.state()};});
        if(id!==null)await page.evaluate(id=>window.__killAudit.hit(id),id);
        await page.waitForTimeout(2200);
        if(id!==null) await page.waitForFunction(()=>!window.__killAudit.state().dirty && !window.__killAudit.state().pendingSave,null,{timeout:15000});
        const result=await page.evaluate(before=>{
          const gaps=window.__frameGaps.filter(e=>e.t>=before.t).map(e=>e.ms).sort((a,b)=>a-b);
          const state=window.__killAudit.state();
          return {durationMs:performance.now()-before.t,kills:state.kills-before.state.kills,state,gapMaxMs:gaps.at(-1),gapP95Ms:gaps[Math.floor(gaps.length*.95)],
            longTasks:window.__longTasks.filter(e=>e.t>=before.t),timings:window.HyperionPerformance.snapshot()};
        },before);
        if(type!=='idle'&&(result.kills!==1||result.state.dead!==0))throw new Error('Kill pipeline incomplete: '+JSON.stringify(result));
        console.log(JSON.stringify({panel,type,repeat,...result}));
      }
    }
  }
  await page.evaluate(()=>{window.__killAudit.base();window.HyperionProfile.open();document.querySelector('[data-tab="hangars"]').click();});
  await page.waitForTimeout(300);
  console.log('Base access: '+JSON.stringify(await page.evaluate(()=>window.__killAudit.base())));
  await page.click('#hangarGrid [data-fit]');
  await page.waitForSelector('#fitCard',{state:'visible'});
  console.log('Equipment access on 1-8 from base: OK');
  if(errors.length)throw new Error(errors.join('\n'));
} finally {
  await context.close(); await browser.close(); await new Promise(r=>server.close(r));
}

