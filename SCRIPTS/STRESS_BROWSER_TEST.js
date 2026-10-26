// Stress test : vrai jeu + vrai serveur sur SQLite temporaire, compte géant
// (6000 modules, tous les items x100, milliards d'XP/honneur, tous les
// vaisseaux/designs), CPU bridé (CDP) et RAM bridée (tas V8 borné).
// Compare un petit compte et le compte géant dans les mêmes conditions pour
// isoler ce qui vient du compte. Aucun compte réel n'est touché.
//
//   node SCRIPTS/STRESS_BROWSER_TEST.js [--cpu=4] [--ram=384] [--only=giant] [--profile]
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { createServer } from "node:net";
import { basename, dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright-core";
import { CATALOG } from "../SRC/CORE/CATALOG.js";
import { generateShipModule } from "../SRC/DATA/MODULE_GEN.js";
import { ROCKET_TYPES } from "../COMBAT/ROCKET_TYPES.js";
import { ORE_RESOURCE_IDS } from "../SRC/DATA/RESOURCES.js";
import { DRONE_TYPES } from "../DRONE/DRONE_TYPES.js";

const arg = (name, fallback) => process.argv.find(a => a.startsWith(`--${name}=`))?.split("=")[1] ?? fallback;
const CPU_RATE = Number(arg("cpu", 4));
const RAM_MB = Number(arg("ram", 384));
const ONLY = arg("only", "");
const PROFILE = process.argv.includes("--profile");
const DIAG = process.argv.includes("--diag");
const printDiag = async (page, label) => {
  if (!DIAG) return;
  const d = await page.evaluate(() => { const x = window.__DIAG__ || {}; window.__DIAG__ = {}; return x; }).catch(() => ({}));
  for (const [name, e] of Object.entries(d)) {
    console.log(`   [diag ${label}] ${name}: ${e.n} appels, ${e.ms.toFixed(0)} ms`);
    for (const [c, n] of Object.entries(e.callers).sort((a, b) => b[1] - a[1]).slice(0, 8)) console.log(`        ${String(n).padStart(6)}x ${c}`);
  }
};
const SCENARIO_MS = Number(arg("ms", 6000));

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const temporary = await mkdtemp(join(tmpdir(), "orbit-stress-"));
await writeFile(join(temporary, "index.html"), await readFile(join(root, "index.html")));
const reserve = createServer();
await new Promise(r => reserve.listen(0, "127.0.0.1", r));
const port = reserve.address().port;
await new Promise(r => reserve.close(r));
// Le joueur ne subit aucun tir NPC (il doit survivre à toute la séance).
const fixture = join(temporary, "fixture.mjs");
await writeFile(fixture, "import { ZoneNpcSim } from " + JSON.stringify(new URL("../SCRIPTS/NPC_ROOM.js", import.meta.url).href)
  + "; ZoneNpcSim.prototype.drainPlayerHits = function() { this.playerHits.length = 0; return []; };");
const server = spawn(process.execPath, ["--import", pathToFileURL(fixture).href, join(root, "SCRIPTS/MULTI_SERVER.js")], {
  cwd: temporary, windowsHide: true, env: { ...process.env, PORT: String(port) }, stdio: ["ignore", "pipe", "pipe"],
});
let output = "";
server.stdout.on("data", b => { output += b; }); server.stderr.on("data", b => { output += b; });
const url = `http://127.0.0.1:${port}`;
const pause = ms => new Promise(r => setTimeout(r, ms));
const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".png": "image/png", ".gif": "image/gif", ".jpg": "image/jpeg", ".mp3": "audio/mpeg", ".webp": "image/webp" };

// Pilotage injecté uniquement dans la réponse HTTP du test.
const hook = `window.__STRESS__ = {
  state: () => ({ map: currentMapId(), dead: player.dead, x: Math.round(player.x), y: Math.round(player.y),
    npcs: enemies.length, credits: account.user?.credits, modules: account.user?.inventory?.shipModules?.length }),
  stopAll() {
    for (const id of window.__STRESS_TIMERS__ || []) clearInterval(id);
    window.__STRESS_TIMERS__ = [];
    try { Target.clear(); } catch {}
    attackActive = false; moveTarget.active = false;
  },
  every(ms, fn) { (window.__STRESS_TIMERS__ ||= []).push(setInterval(() => { try { fn(); } catch (e) { console.error("stress", e?.message); } }, ms)); },
  wander() {
    let a = 0; const cx = player.x, cy = player.y;
    this.every(700, () => { a += 0.9; moveTarget.active = true; moveTarget.x = cx + Math.cos(a) * 900; moveTarget.y = cy + Math.sin(a) * 600; });
  },
  fight(chase = true) {
    this.every(300, () => {
      const cur = Target.get();
      if (!cur || !(cur.hp > 0)) {
        let best = null, bd = Infinity;
        for (const e of enemies) {
          if (!(e.hp > 0) || e._netPlayer != null || e._netPet != null || e.isPetTarget) continue;
          const d = Math.hypot(e.x - player.x, e.y - player.y);
          if (d < bd) { bd = d; best = e; }
        }
        if (best) { Target.set(best); attackActive = true; }
      }
      const t = Target.get();
      if (chase && t) { moveTarget.active = true; moveTarget.x = t.x + 260; moveTarget.y = t.y + 40; }
    });
  },
  saveStorm() {
    this.every(400, () => { markProgressDirty(); saveProgressNow(); savePositionNow(); flushNetUser().catch(() => {}); });
    this.every(2500, () => { saveStateImmediate(); });
  },
};
`;

function giantUser(base) {
  const ships = CATALOG.ships.map(s => s.ship.id).filter(id => id !== "police");
  const counts = {};
  for (const key of ["lasers", "speedGen", "shieldGen", "extras", "petGears", "petProtocols", "tickets", "station"]) {
    for (const item of CATALOG[key] || []) counts[item.id] = 100;
  }
  counts.pet_niveau1 = 1;
  const ammo = { x1: -1 };
  for (const item of CATALOG.ammo) for (const k of Object.keys(item.give?.ammo || {})) ammo[k] = 100;
  const rockets = {}; for (const id of Object.keys(ROCKET_TYPES)) rockets[id] = 100;
  const resources = {}; for (const id of ORE_RESOURCE_IDS) resources[id] = 100;
  const shipModules = Array.from({ length: 6000 }, (_, i) => ({ ...generateShipModule(null, { ships: CATALOG.ships }), id: `mod_stress_${i}` }));
  const moduleRollHistory = shipModules.slice(-500).map(m => ({ ...m, rollPayment: { type: "credits", amount: 250000 } }));
  const droneTypes = Object.keys(DRONE_TYPES);
  const drones = { items: Array.from({ length: 10 }, (_, i) => ({ id: `drone_stress_${i}`, type: droneTypes[i % droneTypes.length], exp: 1e9 })),
    formations: CATALOG.formations.map(f => f.formation.id) };
  const shipId = "goliath_x";
  const fit = { lasers: Array(20).fill("laser_lfpx01"), gens: Array(20).fill("shd_sg3na01"), extras: [], shipMods: shipModules.slice(0, 8).map(m => m.id) };
  return { ...base, revision: base.revision + 1, schemaVersion: 4, credits: 50_000_000_000, ship: shipId,
    stats: { exp: 9_000_000_000, honor: 4_000_000_000, npcKills: {} },
    ammo, ammoActive: "x1", rockets,
    inventory: { ...base.inventory, counts, resources, ships: ships, shipDesigns: CATALOG.designs.map(d => d.design.id),
      shipModules, moduleRollHistory },
    drones,
    pet: { owned: true, id: "niveau1", exp: 5e8, active: false, mode: "passive", fuel: 50000 },
    hangars: [{ id: "stress-hangar", active: true, shipId, activeConfig: 1, lastMap: "1-1", lastPos: null, lastHpPct: 1, lastShPct: 1,
      fits: { "1": fit, "2": fit } }],
  };
}
function smallUser(base) {
  const fit = { lasers: Array(20).fill("laser_lfpx01"), gens: [], extras: [], shipMods: [] };
  return { ...base, revision: base.revision + 1, schemaVersion: 4, ship: "goliath_x",
    inventory: { ...base.inventory, counts: { laser_lfpx01: 20 }, ships: ["goliath_x"], shipModules: [], moduleRollHistory: [] },
    ammo: { x1: -1 }, ammoActive: "x1",
    hangars: [{ id: "stress-hangar", active: true, shipId: "goliath_x", activeConfig: 1, lastMap: "1-1", lastPos: null,
      lastHpPct: 1, lastShPct: 1, fits: { "1": fit, "2": fit } }] };
}

// En jeu = écran de chargement masqué (autoStart) ; DÉPART cliqué s'il est proposé.
async function waitInGame(page, timeout) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const s = await page.evaluate(() => {
      const overlay = document.getElementById("loadingOverlay"), btn = document.getElementById("loadingStartBtn");
      const hidden = !overlay || getComputedStyle(overlay).display === "none";
      return { inGame: hidden && !document.documentElement.classList.contains("orbitBooting") && !!window.__STRESS__,
        canStart: !!btn && !btn.disabled && btn.offsetParent !== null && !/CONNEXION/.test(btn.textContent) };
    }).catch(() => ({}));
    if (s.inGame) return;
    if (s.canStart) await page.click("#loadingStartBtn").catch(() => {});
    await pause(250);
  }
  throw new Error("Jeu non demarre dans le delai");
}

const summarize = (deltas) => {
  const s = deltas.slice().sort((a, b) => a - b);
  const q = p => s.length ? Number(s[Math.min(s.length - 1, Math.floor(s.length * p))].toFixed(1)) : 0;
  return { frames: s.length, p50: q(0.5), p95: q(0.95), p99: q(0.99), max: q(1),
    over50: s.filter(v => v > 50).length, over100: s.filter(v => v > 100).length };
};

function topSelf(profile, limit = 14) {
  const byId = new Map(profile.nodes.map(n => [n.id, n]));
  const self = new Map();
  for (let i = 0; i < profile.samples.length; i++) {
    const node = byId.get(profile.samples[i]); const dt = (profile.timeDeltas[i] || 0) / 1000;
    const f = node.callFrame;
    const key = `${f.functionName || "(anonyme)"} ${f.url ? f.url.replace(/^.*?\/\/[^/]+\//, "") + ":" + (f.lineNumber + 1) : ""}`.trim();
    self.set(key, (self.get(key) || 0) + dt);
  }
  return [...self].filter(([k]) => !k.startsWith("(idle)") && !k.startsWith("(program)"))
    .sort((a, b) => b[1] - a[1]).slice(0, limit).map(([k, ms]) => `${ms.toFixed(0).padStart(6)} ms  ${k}`);
}

// Temps inclusif (fonction + tout ce qu'elle appelle) des fonctions du jeu.
function topInclusive(profile, filter = /ACCOUNT|PROFILE|UI_|ORBIT_ENGINE|FIT_|QUEST/, limit = 30) {
  const byId = new Map(profile.nodes.map(n => [n.id, n]));
  const parent = new Map();
  for (const n of profile.nodes) for (const c of n.children || []) parent.set(c, n.id);
  const total = new Map();
  for (let i = 0; i < profile.samples.length; i++) {
    const dt = (profile.timeDeltas[i] || 0) / 1000; const seen = new Set();
    for (let id = profile.samples[i]; id != null; id = parent.get(id)) {
      const f = byId.get(id).callFrame;
      if (!filter.test(f.url || "")) continue;
      const key = `${f.functionName || "(anonyme)"} ${f.url.replace(/^.*?\/\/[^/]+\//, "")}:${f.lineNumber + 1}`;
      if (seen.has(key)) continue; seen.add(key);
      total.set(key, (total.get(key) || 0) + dt);
    }
  }
  return [...total].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([k, ms]) => `${ms.toFixed(0).padStart(6)} ms  ${k}`);
}

let browser;
const report = [];
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try { ready = (await fetch(url + "/api/ping")).ok; } catch {}
    if (ready || server.exitCode !== null) break;
    await pause(100);
  }
  assert.ok(ready, output);
  browser = await chromium.launch({ channel: "msedge", headless: true,
    args: [`--js-flags=--max-old-space-size=${RAM_MB}`, "--disable-dev-shm-usage"] });

  for (const kind of ["small", "giant"]) {
    if (ONLY && ONLY !== kind) continue;
    const registered = await fetch(url + "/api/register", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ pseudo: `stress-${kind}`, email: `stress-${kind}@example.test`, password: "stress-password-123", faction: "mmo" }) });
    assert.ok(registered.ok); const account = await registered.json();
    const seed = (kind === "giant" ? giantUser : smallUser)(account.user);
    const seedJson = JSON.stringify({ user: seed });
    const saved = await fetch(url + "/api/save", { method: "POST", headers: { "content-type": "application/json", Authorization: `Bearer ${account.token}` }, body: seedJson });
    const savedText = await saved.text();
    assert.ok(saved.ok, savedText.slice(0, 500)); const canonical = JSON.parse(savedText).user;
    console.log(`\n=== Compte ${kind} : ${(seedJson.length / 1024).toFixed(0)} Ko, ${canonical.inventory?.shipModules?.length || 0} modules ===`);

    const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
    const page = await context.newPage();
    const errors = [], consoleErrors = [];
    page.on("pageerror", e => errors.push(e.message));
    page.on("console", m => { if (m.type() === "error" && !m.text().includes("Failed to load resource")) consoleErrors.push(m.text()); });
    page.on("crash", () => errors.push("RENDERER CRASH (memoire ?)"));
    const saves = []; // octets envoyés par /api/save
    page.on("request", r => { if (r.url().endsWith("/api/save")) saves.push({ bytes: r.postDataBuffer()?.length || 0, gzip: r.headers()["content-encoding"] === "gzip" }); });
    await page.route("**/*", async route => {
      const parsed = new URL(route.request().url());
      if (parsed.origin !== url || parsed.pathname === "/index.html" || parsed.pathname.startsWith("/api/")) return route.continue();
      try {
        const path = resolve(root, decodeURIComponent(parsed.pathname).replace(/^\/+/, ""));
        assert.ok(path.startsWith(root + sep));
        let body = await readFile(path);
        if (parsed.pathname === "/SRC/CORE/ORBIT_ENGINE.js") {
          body = Buffer.from(body.toString().replace("window.__ORBIT_ENGINE__ = {", hook + "window.__ORBIT_ENGINE__ = {"));
        }
        // --diag : compte les appels/temps des fonctions de compte et leurs appelants.
        const DIAG_FUNCTIONS = {
          "/SRC/CORE/ACCOUNT.js": ["ensureUserShape", "getCurrentUserFull", "saveUser", "updateCurrentUserProgress"],
          "/SRC/CORE/ACCOUNT_NET.js": ["netStore", "flushAccountCache", "pushSnapshotScoped", "adoptServerUser", "copyAccount", "gzipText"],
        };
        if (DIAG && DIAG_FUNCTIONS[parsed.pathname]) {
          let text = body.toString();
          for (const name of DIAG_FUNCTIONS[parsed.pathname]) {
            // Fonction async : seule la partie synchrone (jusqu'au 1er await) est chronométrée.
            const re = new RegExp(`(export )?(async )?function ${name}\\(`);
            assert.ok(re.test(text), name);
            text = text.replace(re, (m, exp, async) => `${exp || ""}function ${name}(...a) { return __diag("${name}", () => ${name}__raw(...a)); }\n${async || ""}function ${name}__raw(`);
          }
          text += `\nfunction __diag(name, fn) {
            const d = (window.__DIAG__ ||= {}); const e = (d[name] ||= { n: 0, ms: 0, callers: {} });
            const caller = (new Error().stack.split("\\n")[3] || "").trim().replace(/^at /, "").replace(/\\(?https?:\\/\\/[^/]+\\//, "").slice(0, 90);
            e.callers[caller] = (e.callers[caller] || 0) + 1;
            const t = performance.now(); try { return fn(); } finally { e.n++; e.ms += performance.now() - t; } }`;
          body = Buffer.from(text);
        }
        await route.fulfill({ status: 200, contentType: mime[extname(path)] || "application/octet-stream", body });
      } catch { await route.fulfill({ status: 404, body: "Not found" }); }
    });
    await page.addInitScript(({ token, user }) => {
      localStorage.setItem("orbit_token", token);
      localStorage.setItem("orbit_user_cache", JSON.stringify({ user }));
      localStorage.setItem("orbit_current_user", JSON.stringify({ id: user.id, pseudo: user.pseudo, email: user.email }));
      sessionStorage.setItem("orbit_assets_preloaded_v1", "ready"); sessionStorage.setItem("spawnMapId", "1-1");
      window.__FRAMES__ = []; let last = 0;
      const tick = t => { if (last) { window.__FRAMES__.push(t - last); if (window.__FRAMES__.length > 4000) window.__FRAMES__.shift(); } last = t; requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
      window.__LT__ = [];
      try { new PerformanceObserver(l => { for (const e of l.getEntries()) window.__LT__.push(Math.round(e.duration)); }).observe({ type: "longtask", buffered: true }); } catch {}
    }, { token: account.token, user: canonical });

    const cdp = await context.newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU_RATE });
    await cdp.send("Performance.enable");
    if (PROFILE) { await cdp.send("Profiler.enable"); await cdp.send("Profiler.setSamplingInterval", { interval: 500 }); }

    const bootStart = Date.now();
    if (PROFILE) await cdp.send("Profiler.start");
    await page.goto(url + "/index.html?map=1-1", { waitUntil: "domcontentloaded" });
    try {
      await waitInGame(page, Number(arg("bootTimeout", 180000)));
    } catch (error) {
      const screen = await page.evaluate(() => document.querySelector(".loadingHint")?.textContent?.slice(0, 300)).catch(() => "?");
      console.log(JSON.stringify({ kind, bootFailed: true, screen, errors, consoleErrors: consoleErrors.slice(0, 15) }));
      await printDiag(page, "boot");
      if (PROFILE) console.log("   profil CPU boot:\n     " + topSelf((await cdp.send("Profiler.stop")).profile, 25).join("\n     "));
      throw error;
    }
    const bootMs = Date.now() - bootStart;
    await printDiag(page, "boot");
    if (PROFILE) console.log("   profil CPU boot:\n     " + topSelf((await cdp.send("Profiler.stop")).profile, 20).join("\n     "));
    await page.waitForFunction(() => window.__STRESS__?.state().npcs > 0, null, { timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(3000);
    console.log(JSON.stringify({ kind, cpu: `${CPU_RATE}x`, ramMb: RAM_MB, bootMs, state: await page.evaluate(() => window.__STRESS__.state()) }));

    const scenarios = {
      idle: () => {},
      movement: () => window.__STRESS__.wander(),
      combat: () => window.__STRESS__.fight(false),
      "moving-combat": () => window.__STRESS__.fight(true),
      "save-storm+combat": () => { window.__STRESS__.fight(true); window.__STRESS__.saveStorm(); },
    };
    for (const [name, start] of Object.entries(scenarios)) {
      await page.evaluate(() => { window.__STRESS__.stopAll(); window.__FRAMES__.length = 0; window.__LT__.length = 0; window.HyperionPerformance?.reset(); });
      await page.evaluate(`(${start.toString()})()`);
      if (PROFILE) await cdp.send("Profiler.start");
      saves.length = 0;
      await page.waitForTimeout(SCENARIO_MS);
      const profile = PROFILE ? (await cdp.send("Profiler.stop")).profile : null;
      const data = await page.evaluate(() => {
        const t = window.HyperionPerformance?.snapshot() || {};
        const tasks = Object.entries(t).filter(([k]) => !k.startsWith("frame.") && k !== "longtask")
          .sort((a, b) => b[1].maxMs - a[1].maxMs).slice(0, 6)
          .map(([k, v]) => `${k} max ${v.maxMs.toFixed(1)}ms x${v.count}`);
        return { frames: window.__FRAMES__.slice(), longTasks: window.__LT__.slice().sort((a, b) => b - a).slice(0, 8),
          frameCpu: t["frame.total"] ? { avg: Number(t["frame.total"].averageMs.toFixed(2)), max: Number(t["frame.total"].maxMs.toFixed(1)) } : null,
          tasks, state: window.__STRESS__.state() };
      });
      const metrics = Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map(m => [m.name, m.value]));
      const row = { kind, scenario: name, ...summarize(data.frames), frameCpu: data.frameCpu,
        heapMb: Math.round(metrics.JSHeapUsedSize / 1048576), longTasks: data.longTasks.join(",") || "-",
        saves: saves.length, saveKo: saves.length ? Math.round(Math.max(...saves.map(s => s.bytes)) / 1024) : 0,
        gzip: saves.length ? saves.every(s => s.gzip) : null, dead: data.state.dead };
      report.push(row);
      console.log(JSON.stringify(row));
      if (data.tasks.length) console.log("   taches:", data.tasks.join(" | "));
      if (profile) console.log("   profil CPU (temps propre):\n     " + topSelf(profile).join("\n     "));
      if (profile && process.argv.includes("--inclusive")) console.log("   profil CPU (inclusif):\n     " + topInclusive(profile, new RegExp(arg("incfilter", "ACCOUNT|PROFILE|UI_|ORBIT_ENGINE|FIT_|QUEST")), 45).join("\n     "));
      await printDiag(page, name);
    }
    await page.evaluate(() => window.__STRESS__.stopAll());

    // Rechargement (changement de carte / F5) avec le compte en l'état.
    const reloadStart = Date.now();
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitInGame(page, 180000);
    console.log(JSON.stringify({ kind, reloadInGameMs: Date.now() - reloadStart, state: await page.evaluate(() => window.__STRESS__.state()) }));
    await printDiag(page, "reload");
    const after = await (await fetch(url + "/api/me", { headers: { Authorization: `Bearer ${account.token}` } })).json();
    if (kind === "giant") assert.equal(after.user.inventory.shipModules.length, 6000, "aucun module perdu");
    console.log(JSON.stringify({ kind, errors: errors.slice(0, 10), consoleErrors: consoleErrors.slice(0, 10) }));
    await context.close();
  }
  console.log("\nResume :");
  console.table(report.map(({ kind, scenario, p50, p95, p99, max, over50, over100, heapMb, saves, saveKo }) =>
    ({ kind, scenario, p50, p95, p99, max, over50, over100, heapMb, saves, saveKo })));
} catch (error) {
  console.error(error);
  console.error(output.slice(-3000));
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  const stopped = server.exitCode === null ? once(server, "exit") : Promise.resolve(); server.kill(); await stopped;
  assert.equal(dirname(resolve(temporary)), resolve(tmpdir())); assert.ok(basename(temporary).startsWith("orbit-stress-"));
  await rm(temporary, { recursive: true, force: true });
}
