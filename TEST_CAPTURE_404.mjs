// Capture les 404 images + leur initiateur (pile) via CDP, contre MULTI_SERVER.
import { chromium } from "playwright-core";

const PORT = Number(process.argv[2] || 18102);
const MAP = process.argv[3] || "1-1";
const base = `http://127.0.0.1:${PORT}`;

// Compte frais via l'API.
const pseudo = `Smoke${Date.now().toString(36)}`;
const email = `${pseudo}@t.tld`;
let reg = await fetch(`${base}/api/register`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ pseudo, email, password: "test1234", faction: "mmo" }),
}).then((r) => r.json());
if (!reg?.ok) throw new Error(`register: ${JSON.stringify(reg)}`);

const browser = await chromium.launch({ channel: "msedge", headless: true });
const context = await browser.newContext();
const page = await context.newPage();

// CDP : initiateurs des requêtes.
const cdp = await context.newCDPSession(page);
await cdp.send("Network.enable");
const initiators = new Map(); // requestId -> { url, stack }
cdp.on("Network.requestWillBeSent", (ev) => {
  try {
    const url = String(ev.request?.url || "");
    if (!/CONTROL|FORMATION|AMMUNITION/i.test(url)) return;
    const stack = ev.initiator?.stack;
    const frames = [];
    let s = stack;
    while (s && frames.length < 6) {
      for (const f of s.callFrames || []) frames.push(`${f.url?.split("/").slice(-2).join("/")}@${f.lineNumber}:${f.columnNumber}::${f.functionName}`);
      s = s.parent;
    }
    initiators.set(ev.requestId, { url, frames });
  } catch {}
});
const failed = [];
page.on("response", (res) => {
  try {
    if (res.status() >= 400 && /CONTROL|FORMATION|AMMUNITION/i.test(res.url())) {
      failed.push({ status: res.status(), url: res.url() });
    }
  } catch {}
});

await page.addInitScript(({ token, user, map }) => {
  try {
    localStorage.setItem("orbit_token", token);
    localStorage.setItem("orbit_user_cache", JSON.stringify(user));
    if (map) sessionStorage.setItem("spawnMapId", map);
  } catch {}
}, { token: reg.token, user: reg.user, map: MAP });

page.on("pageerror", (e) => console.log(`PAGEERROR: ${e?.message || e}`));
page.on("console", (m) => { if (m.type() === "error") console.log(`CONSOLE: ${String(m.text()).slice(0, 300)}`); });
await page.goto(`${base}/index.html?map=${encodeURIComponent(MAP)}`, { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForTimeout(15000);
console.log("loading:", await page.evaluate(() => ({
  pct: document.getElementById("loadingPercent")?.textContent,
  btn: document.getElementById("loadingStartBtn")?.disabled,
  title: document.getElementById("loadingTitle")?.textContent,
  hint: document.querySelector(".loadingHint")?.textContent,
})));
await page.waitForSelector("#loadingStartBtn:not([disabled])", { timeout: 180000 });
await page.click("#loadingStartBtn");
await page.waitForFunction(() => !document.documentElement.classList.contains("orbitBooting"), null, { timeout: 60000 });
await page.waitForTimeout(8000);

console.log(`=== 404 captures: ${failed.length} ===`);
const byUrl = new Map();
for (const f of failed.slice(0, 40)) {
  if (byUrl.has(f.url)) continue;
  byUrl.set(f.url, true);
  console.log(`${f.status} ${decodeURIComponent(f.url)}`);
}
console.log(`=== initiateurs (${initiators.size} requêtes tracées) ===`);
let n = 0;
for (const [, info] of initiators) {
  if (n++ >= 10) break;
  console.log(decodeURIComponent(info.url));
  for (const fr of info.frames) console.log(`   <- ${fr}`);
}
await browser.close();

