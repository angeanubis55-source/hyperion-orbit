// Mesure le code client reel dans Chromium, avec transport HTTP isole.
// Aucun compte existant n'est utilise. MODULE_SAVE_BASELINE peut designer
// une ancienne copie d'ACCOUNT_NET.js pour comparer le travail synchrone.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { chromium } from "playwright-core";

const current = await readFile(new URL("../SRC/CORE/ACCOUNT_NET.js", import.meta.url), "utf8");
const sources = { current };
if (process.env.MODULE_SAVE_BASELINE) sources.baseline = await readFile(process.env.MODULE_SAVE_BASELINE, "utf8");
const stored = new Map();
function instrument(source) {
  for (const name of ["netStore", "flushAccountCache", "pushSnapshot", "adoptServerUser"]) {
    source += `\nconst measured_${name} = ${name}; ${name} = function(...args) {
      const start = performance.now(); try { return measured_${name}(...args); }
      finally { globalThis.__moduleTimes?.push({name: "${name}", ms: performance.now() - start}); }
    };`;
  }
  return source;
}
const server = createServer(async (req, res) => {
  try {
    const path = new URL(req.url, "http://localhost").pathname;
    if (path.startsWith("/client/")) {
      const name = path.slice(8).replace(/\.js$/, "");
      res.writeHead(200, { "content-type": "text/javascript; charset=utf-8" });
      res.end(instrument(sources[name])); return;
    }
    if (path.startsWith("/api/")) {
      const token = req.headers.authorization?.slice(7);
      let user = stored.get(token), saved;
      if (path === "/api/save") {
        let body = ""; for await (const chunk of req) body += chunk;
        saved = JSON.parse(body); user = saved.user; stored.set(token, user);
      }
      res.writeHead(200, { "content-type": "application/json" });
      const response = saved?.compactSave ? { ok: true, snapshotAccepted: true, saveId: saved.saveId,
        user: { id: user.id, revision: user.revision, pseudo: user.pseudo } } : { ok: true, user };
      res.end(JSON.stringify(response)); return;
    }
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); res.end("<!doctype html><title>Module save test</title>");
  } catch (error) { res.writeHead(500); res.end(error.message); }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
const results = [];
try {
  browser = await chromium.launch({ channel: "msedge", headless: true });
  for (const [label] of Object.entries(sources)) {
    for (const count of [32, 3000, 6000]) {
      const page = await browser.newPage();
      const errors = []; page.on("pageerror", error => errors.push(error.message));
      await page.goto(origin);
      const token = `${label}-${count}`;
      const user = { id: token, pseudo: "ModuleTest", revision: 1, credits: 1000000,
        ammo: { x1: -1, x4: 500 }, pet: { fuel: 1000 }, galaxyGates: { energy: 0 },
        inventory: { shipModules: Array.from({ length: count }, (_, i) => ({ id: `m-${i}`,
          kind: "shipModule", shipId: "goliath", familyId: "goliath", type: "dmg",
          bonuses: [{ stat: "damage", pct: i % 20 }, { stat: "shield", pct: i % 10 }],
          rollPayment: { type: "credits", amount: 250000 }, at: i })), moduleRollHistory: [] } };
      stored.set(token, user);
      const measured = await page.evaluate(async ({ label, token, user }) => {
        const api = await import(`/client/${label}.js`);
        api.enterNetMode(token, user);
        await api.flushNetUser();
        const live = api.netList()[0], list = live.inventory.shipModules;
        globalThis.__moduleTimes = [];
        for (let i = 0; i < 7; i++) {
          live.pet.fuel--; live.credits++; live.revision++; api.netStore([live]);
          await api.flushNetUser();
          if (live.inventory.shipModules !== list) throw new Error("Liste live detachee");
        }
        const trace = globalThis.__moduleTimes; globalThis.__moduleTimes = null;
        // Verifier une vraie modification de bonus et une vente apres les
        // mesures, puis recharger le cache avec une nouvelle instance client.
        live.inventory.shipModules[0].bonuses[0].pct = 42;
        live.inventory.shipModules.splice(1, 1); live.revision++; api.netStore([live]);
        await api.flushNetUser();
        const loaded = await import(`/client/${label}.js?reload=1`);
        if (!loaded.bootNetFromCache()) throw new Error("Cache illisible");
        const recovered = loaded.netList()[0];
        return { trace, fuel: recovered.pet.fuel, credits: recovered.credits,
          count: recovered.inventory.shipModules.length, pct: recovered.inventory.shipModules[0].bonuses[0].pct };
      }, { label, token, user });
      assert.equal(measured.count, count - 1); assert.equal(measured.pct, 42);
      assert.equal(measured.fuel, 993); assert.equal(measured.credits, 1000007);
      assert.equal(stored.get(token).inventory.shipModules[0].bonuses[0].pct, 42);
      assert.deepEqual(errors, []);
      const median = name => {
        const values = measured.trace.filter(row => row.name === name).map(row => row.ms).sort((a, b) => a - b);
        return Number(values[Math.floor(values.length / 2)].toFixed(2));
      };
      results.push({ label, modules: count, mutationMs: median("netStore"),
        cacheMs: median("flushAccountCache"), prepareMs: median("pushSnapshot"), confirmationMs: median("adoptServerUser") });
      await page.close();
    }
  }
  console.table(results);
  console.log("PASS: sauvegarde, bonus modifie, vente et recharge pour 32, 3000 et 6000 modules.");
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
