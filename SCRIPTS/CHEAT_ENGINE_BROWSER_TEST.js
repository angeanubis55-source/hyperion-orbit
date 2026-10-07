// Serveur, comptes et navigateur isoles. Reproduit l'acceleration des
// horloges du navigateur et execute le vrai debut de frame du moteur.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:net";
import { chromium } from "playwright-core";
import { NETWORK_TIMING_GRACE_SEC } from "../SRC/CORE/NETWORK_TIMING.js";

const temporary = await mkdtemp(join(tmpdir(), "orbit-clock-browser-"));
const reserve = createServer();
reserve.listen(0, "127.0.0.1");
await once(reserve, "listening");
const port = reserve.address().port;
await new Promise(resolve => reserve.close(resolve));
await writeFile(join(temporary, "admin.html"), await readFile(new URL("../admin.html", import.meta.url)));
const password = "isolated-clock-browser";
const server = spawn(process.execPath, [fileURLToPath(new URL("./MULTI_SERVER.js", import.meta.url))], {
  cwd: temporary, windowsHide: true, env: { ...process.env, PORT: String(port), ORBIT_ADMIN_PASS: password },
  stdio: ["ignore", "pipe", "pipe"],
});
let browser, output = "";
server.stdout.on("data", b => { output += b; }); server.stderr.on("data", b => { output += b; });
const url = `http://127.0.0.1:${port}`;
try {
  let ready = false;
  for (let i = 0; i < 80; i++) {
    try { ready = (await fetch(url + "/api/ping")).ok; } catch {}
    if (ready || server.exitCode !== null) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(ready, output);
  const registration = await fetch(url + "/api/register", { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ pseudo: "clock-browser", email: "clock-browser@example.test", password: "test-password-123", faction: "mmo" }) });
  assert.ok(registration.ok);
  const account = await registration.json();
  browser = await chromium.launch({ channel: "msedge", headless: true });
  const context = await browser.newContext();
  const game = await context.newPage(), admin = await context.newPage();
  const errors = [];
  game.on("pageerror", e => errors.push(e.message)); admin.on("pageerror", e => errors.push(e.message));
  await game.goto(url + "/admin.html");
  await game.evaluate(token => localStorage.setItem("orbit_token", token), account.token);
  const net = `const NETWORK_TIMING_GRACE_SEC = ${NETWORK_TIMING_GRACE_SEC};\n` + (await readFile(new URL("../SRC/CORE/NETPLAY.js", import.meta.url), "utf8")).replace(/^export /gm, "").replace(/^import .*NETWORK_TIMING.*\r?\n/gm, "");
  const engine = await readFile(new URL("../SRC/CORE/ORBIT_ENGINE.js", import.meta.url), "utf8");
  const ui = (await readFile(new URL("../SRC/CORE/SPEED_GUARD_UI.js", import.meta.url), "utf8")).replace(/^export /gm, "");
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const overlay = html.slice(html.indexOf('<dialog id="speedGuardOverlay"'), html.indexOf('<div id="gameWindowDock"'));
  assert.ok(overlay.length > 0);
  await game.evaluate(markup => document.body.insertAdjacentHTML("beforeend", markup), overlay);
  await game.evaluate(() => {
    const frontWindow = document.createElement("div");
    frontWindow.id = "testFrontWindow";
    frontWindow.style.cssText = "position:fixed;inset:0;z-index:2147483647;background:#ff00ff;pointer-events:none";
    document.body.appendChild(frontWindow);
  });
  await game.addStyleTag({ content: await readFile(new URL("../style.css", import.meta.url), "utf8") });
  // Le vrai handler est utilise ; seul le reload est compte pour conserver
  // cette page instrumentee et pouvoir verifier les controles apres reprise.
  const recovery = engine.slice(engine.indexOf("let speedGuardRecoveryReloading"), engine.indexOf("function frame(t)"))
    .replace("location.reload();", "window.guardRecoveries++;");
  const start = engine.indexOf("function frame(t)");
  const frame = engine.slice(start, engine.indexOf("// Heartbeat serveur (3 s)", start)) + "} catch (error) { throw error; } }";
  await game.addScriptTag({ content: net + ui + `
    let last = 0, lastFrameStart = 0, fpsAcc = 0, fpsFrames = 0, fpsValue = 0, linkDead = false, kickedReason = null;
    window.guardRecoveries = 0;
    ${recovery}
    const performanceMonitor = { record() {} };
    const measureGameTask = (_, fn) => fn();
    window.simulationSeconds = 0; window.shots = 0; window.abilityCd = 90;
    let fireCd = 0;
    function update(dt) {
      window.simulationSeconds += dt; window.abilityCd = Math.max(0, window.abilityCd - dt);
      fireCd -= dt;
      if (fireCd <= 0) { window.shots++; fireCd = 1; }
    }
    ${frame}
    const nativeNow = performance.now.bind(performance), nativeDate = Date.now.bind(Date);
    let timeBase = nativeNow(), timeOffset = timeBase, timeFactor = 1;
    const dateBase = nativeDate();
    Object.defineProperty(performance, "now", { value: () => timeOffset + (nativeNow() - timeBase) * timeFactor });
    Date.now = () => dateBase + performance.now();
    window.setClockFactor = factor => { timeOffset = performance.now(); timeBase = nativeNow(); timeFactor = factor; };
    ensureNetplayConnection();
    last = performance.now();
    window.testFrameTimer = setInterval(() => frame(performance.now()), 16);
  ` });
  await game.waitForFunction(() => netplayStatus().authed);
  // Mesurer apres l'authentification, dont le delai varie avec la charge CPU.
  await game.evaluate(() => { simulationSeconds = 0; shots = 0; abilityCd = 90; fireCd = 0; });
  await game.waitForTimeout(3000);
  const normal = await game.evaluate(() => ({ time: simulationSeconds, shots, abilityCd }));
  assert.ok(normal.time >= 2.7 && normal.time <= 3.5, JSON.stringify(normal));
  await game.evaluate(() => setClockFactor(50));
  await game.waitForTimeout(12000);
  const accelerated = await game.evaluate(() => ({ time: simulationSeconds, shots, abilityCd }));
  assert.ok(accelerated.time - normal.time >= 6.5 && accelerated.time - normal.time <= 7.8, JSON.stringify(accelerated));
  assert.ok(accelerated.shots <= 22, JSON.stringify(accelerated));
  assert.ok(accelerated.abilityCd > 79, JSON.stringify(accelerated));
  assert.equal(await game.evaluate(() => netSpeedGuardActive()), true);
  const panel = game.locator("#speedGuardOverlay");
  assert.equal(await panel.isVisible(), true);
  assert.equal(await game.evaluate(() => {
    const panel = document.getElementById("speedGuardOverlay");
    return panel.open && panel.matches(":modal") && panel.contains(document.elementFromPoint(innerWidth / 2, innerHeight / 2));
  }), true, "le message reste devant toutes les fenetres du jeu");
  if (process.env.ORBIT_GUARD_PREVIEW) await game.screenshot({ path: process.env.ORBIT_GUARD_PREVIEW });
  assert.equal(await panel.locator("button").count(), 0);
  await game.keyboard.press("Escape");
  await panel.click({ position: { x: 10, y: 10 } });
  assert.equal(await panel.isVisible(), true);
  assert.equal(await game.evaluate(() => [...document.body.children].filter(c => !["SCRIPT", "STYLE"].includes(c.tagName) && c.id !== "speedGuardOverlay").every(c => c.inert)), true);
  await game.waitForTimeout(1000);
  assert.deepEqual(await game.evaluate(() => ({ time: simulationSeconds, shots, abilityCd })), accelerated, "la simulation est entierement suspendue");
  await admin.goto(url + "/admin.html");
  await admin.locator("#passInput").fill(password); await admin.locator("#loginBtn").click();
  const row = admin.locator("#suspectRows tr").filter({ hasText: "clock-browser" });
  await row.waitFor();
  assert.match(await row.innerText(), /Horloge acceleree/);
  assert.match(await row.innerText(), /déclaration client, sans sanction automatique/);
  await row.locator("summary").click();
  await admin.waitForTimeout(3200);
  assert.equal(await row.locator("details").getAttribute("open"), "", "les details restent ouverts pendant le rafraichissement");
  await game.evaluate(() => setClockFactor(1));
  await game.waitForFunction(() => !netSpeedGuardActive(), null, { timeout: 12000 });
  assert.equal(await panel.isVisible(), false);
  assert.equal(await game.evaluate(() => window.guardRecoveries), 1, "un seul rechargement demande pour resynchroniser le jeu");
  assert.equal(await game.evaluate(() => [...document.body.children].filter(c => !["SCRIPT", "STYLE"].includes(c.tagName) && c.id !== "speedGuardOverlay").every(c => !c.inert)), true);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ normal, accelerated, popup: "bloquante, reprise automatique", admin: "signal visible, details conserves", errors }));
} finally {
  if (browser) await browser.close();
  const stopped = server.exitCode === null ? once(server, "exit") : Promise.resolve();
  server.kill(); await stopped;
  assert.equal(dirname(resolve(temporary)), resolve(tmpdir()));
  assert.ok(basename(temporary).startsWith("orbit-clock-browser-"));
  await rm(temporary, { recursive: true, force: true });
}
