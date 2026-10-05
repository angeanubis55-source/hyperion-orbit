import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { chromium } from "playwright-core";
import { fileURLToPath } from "node:url";

// Serveur statique et stockage navigateur isole : aucun compte reel utilise.
const server = spawn(process.execPath, [fileURLToPath(new URL("./GAME_SERVER.js", import.meta.url))], {
  windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
});
let browser;
try {
  const [line] = await once(server.stdout, "data");
  const url = String(line).trim();
  browser = await chromium.launch({ channel: "msedge", headless: true });
  const context = await browser.newContext({ serviceWorkers: "block" });
  const page = await context.newPage();
  const errors = [];
  let delayedImports = 0;
  page.on("pageerror", error => errors.push(error.message));
  // Les imports arrivent plus tard que les premiers sprites : c'est le cas
  // qui faisait grossir le total pendant que la barre avancait deja.
  await page.route("**/MAPS/1-8/WORLD.js", async route => {
    delayedImports++;
    await new Promise(resolve => setTimeout(resolve, 700));
    await route.continue();
  });
  await page.addInitScript(() => {
    const user = { id: "loading-progress-test", pseudo: "Loading", email: "loading@local", password: "test",
      ship: "PhoenixBleu", inventory: { counts: { laser_lf1: 1 }, ships: ["PhoenixBleu"], shipModules: [] } };
    localStorage.setItem("orbit_users", JSON.stringify([user]));
    localStorage.setItem("orbit_current_user", JSON.stringify({ id: user.id, pseudo: user.pseudo, email: user.email }));
    window.loadingHistory = [];
    const observer = new MutationObserver(() => {
      const track = document.querySelector(".loadingTrack");
      if (!track) return;
      const percent = Number(track.getAttribute("aria-valuenow"));
      const overlay = document.getElementById("loadingOverlay");
      const ready = overlay.classList.contains("isReady");
      const previous = window.loadingHistory.at(-1);
      if (!previous || previous.percent !== percent || previous.ready !== ready) {
        window.loadingHistory.push({ percent, ready });
      }
    });
    observer.observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ["aria-valuenow", "class"] });
  });
  for (const phase of ["delayed imports", "cold", "cached"]) {
    await page.goto(new URL("index.html?map=1-1", url).href, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#loadingStartBtn:not([disabled])", { timeout: 90000 });
    const history = await page.evaluate(() => window.loadingHistory);
    const regressions = history.filter((entry, i) => i > 0 && entry.percent < history[i - 1].percent);
    console.log(JSON.stringify({ phase, updates: history.length, regressions, first: history[0], last: history.at(-1) }));
    assert.equal(regressions.length, 0, "la progression ne recule jamais");
    assert.ok(history.every(entry => Number.isFinite(entry.percent) && entry.percent >= 0 && entry.percent <= 100));
    assert.ok(history.every(entry => entry.percent < 100 || entry.ready), "100 % est reserve au secteur pret");
    assert.equal(history.at(-1).percent, 100);
    assert.equal(history.at(-1).ready, true);
    assert.equal(await page.locator("#loadingPercent").textContent(), "100 %");
    assert.deepEqual(errors, []);
    if (phase === "delayed imports") {
      assert.ok(delayedImports > 0, "un import doit avoir ete retarde");
      // Retirer l'interception pour verifier aussi le cache HTTP natif.
      await page.unroute("**/MAPS/1-8/WORLD.js");
    }
  }
} finally {
  await browser?.close();
  server.kill();
}
