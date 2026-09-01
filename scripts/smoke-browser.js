import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { chromium } from "playwright-core";
import { MAP_LOADERS } from "../src/core/mapRegistry.js";

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
const browser = await chromium.launch({ channel: "msedge", headless: true });
const context = await browser.newContext();
const requestedMap = process.argv.find((arg) => arg.startsWith("--map="))?.slice(6);
const coldStart = process.argv.includes("--cold");
const inspectProfile = process.argv.includes("--profile");
const captureProfile = process.argv.includes("--profile-screenshot");
const inspectCombat = process.argv.includes("--combat");
const inspectWindows = process.argv.includes("--windows");
const switchTargets = process.argv.find((arg) => arg.startsWith("--switch="))?.slice(9).split(",").filter(Boolean) || [];
const mapIds = requestedMap ? [requestedMap] : Object.keys(MAP_LOADERS);
const failures = [];

try {
  for (const mapId of mapIds) {
    if (!Object.hasOwn(MAP_LOADERS, mapId)) {
      failures.push(`${mapId}: carte inconnue`);
      continue;
    }

    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error" && !message.text().includes("Failed to load resource")) errors.push(message.text());
    });
    page.on("response", (response) => {
      if (response.status() >= 400 && !response.url().endsWith("/favicon.ico")) errors.push(`${response.status()} ${response.url()}`);
    });

    try {
      await page.addInitScript(({ coldStart }) => {
        const user = {
          id: "smoke-user",
          pseudo: "Smoke",
          email: "smoke@local",
          password: "test",
          ship: "PhoenixBleu",
          inventory: { counts: { laser_lf1: 1 }, ships: ["PhoenixBleu"], shipModules: [] },
        };
        localStorage.setItem("orbit_users", JSON.stringify([user]));
        localStorage.setItem("orbit_current_user", JSON.stringify({ id: user.id, pseudo: user.pseudo, email: user.email }));
        if (!coldStart) sessionStorage.setItem("orbit_assets_preloaded_v1", "ready");
      }, { coldStart });
      await page.goto(`http://127.0.0.1:${port}/index.html?map=${encodeURIComponent(mapId)}`, { waitUntil: "domcontentloaded", timeout: 20_000 });
      await page.waitForSelector("#game", { state: "visible", timeout: 10_000 });
      if (coldStart) {
        await page.waitForSelector("#loadingStartBtn:not([disabled])", { timeout: 180_000 });
        await page.click("#loadingStartBtn");
      }
      await page.waitForFunction(() => getComputedStyle(document.getElementById("loadingOverlay")).display === "none", null, { timeout: 30_000 });
      await page.waitForFunction(() => !document.documentElement.classList.contains("orbitBooting"), null, { timeout: 30_000 });
      if (inspectCombat) {
        await page.waitForTimeout(1800);
        await page.click("#btnNuke");
        await page.waitForTimeout(500);
      }
      if (inspectWindows) {
        await page.click('[data-window-id="galaxyGateWindow"]');
        await page.waitForSelector("#galaxyGateWindow", { state: "visible", timeout: 10_000 });
        const windowIssue = await page.locator("#galaxyGateWindow").evaluate((card) => {
          const r = card.getBoundingClientRect();
          return r.left < 0 || r.top < 0 || r.right > innerWidth + 1 || r.bottom > innerHeight + 1
            ? `Galaxy Spinner hors écran: ${Math.round(r.left)},${Math.round(r.top)} → ${Math.round(r.right)},${Math.round(r.bottom)}`
            : "";
        });
        if (windowIssue) errors.push(windowIssue);
      }
      if (inspectProfile) {
        await page.click("#btnGameHub");
        await page.waitForSelector("#profileWindow", { state: "visible", timeout: 10_000 });

        for (const section of ["stats", "hangars", "shop"]) {
          await page.click(`#profileOverlay .tabBtn[data-tab="${section}"]`);
          await page.waitForFunction((name) => document.getElementById(`panel_${name}`)?.classList.contains("active"), section);
        }

        await page.click('#profileOverlay .tabBtn[data-tab="hangars"]');
        await page.click("#hangarGrid [data-fit]");
        await page.waitForSelector("#fitCard", { state: "visible", timeout: 10_000 });
        await page.dragAndDrop("#fitInvGrid .invCell:not(.disabled)", "#fitSlotsLasers .slotCell");
        await page.waitForSelector("#fitSlotsLasers .slotCell.filled");
        await page.click('.fitCfgBtn[data-cfg="2"]');
        await page.click('.fitCfgBtn[data-cfg="1"]');
        await page.waitForSelector("#fitSlotsLasers .slotCell.filled");
        const fitIssues = await page.evaluate(() => {
          const issues = [];
          const workspace = document.querySelector("#fitCard .fitWorkspace");
          const ship = document.querySelector("#fitCard .fitShipPane");
          const loadout = document.querySelector("#fitCard .fitLoadoutPane");
          const inventory = document.querySelector("#fitCard .fitInventoryPane");
          if (!workspace || !ship || !loadout || !inventory) issues.push("structure de la fenêtre Équiper incomplète");
          if (workspace && workspace.scrollWidth > workspace.clientWidth + 2) issues.push("débordement horizontal dans Équiper");
          return issues;
        });
        errors.push(...fitIssues);
        if (captureProfile) await page.screenshot({ path: join(root, "profile-fit-preview.png"), fullPage: false });
        await page.click("#fitBtnCancel");
        await page.waitForSelector("#fitCard", { state: "hidden" });

        if (captureProfile) {
          await page.click('#profileOverlay .tabBtn[data-tab="stats"]');
          await page.screenshot({ path: join(root, "profile-stats-preview.png"), fullPage: false });
          await page.click('#profileOverlay .tabBtn[data-tab="npcs"]');
          await page.screenshot({ path: join(root, "profile-npcs-preview.png"), fullPage: false });
          await page.click('#profileOverlay .tabBtn[data-tab="account"]');
          await page.screenshot({ path: join(root, "profile-account-preview.png"), fullPage: false });
          await page.click('#profileOverlay .tabBtn[data-tab="hangars"]');
          await page.screenshot({ path: join(root, "profile-hangars-preview.png"), fullPage: false });
          await page.click('#profileOverlay .tabBtn[data-tab="inventory"]');
          await page.waitForSelector("#inventorySections .inventorySlot");
          await page.screenshot({ path: join(root, "profile-inventory-preview.png"), fullPage: false });
        }
        await page.click('#profileOverlay .tabBtn[data-tab="shop"]');
        for (const category of ["ammo", "speedGen", "shieldGen", "lasers", "extras", "ships"]) {
          await page.click(`#shopTabs .subtabBtn[data-shop="${category}"]`);
          if (captureProfile && category === "extras") {
            await page.screenshot({ path: join(root, "profile-extras-preview.png"), fullPage: false });
          }
          if (category !== "extras") {
            await page.waitForFunction(() => document.querySelectorAll("#shopList .shopRow").length > 0);
          }
        }
        await page.waitForFunction(() => document.querySelectorAll("#shopList .shopRow").length > 0);
        const profileIssues = await page.evaluate(() => {
          const issues = [];
          const windowCard = document.getElementById("profileWindow");
          const list = document.getElementById("shopList");
          const preview = document.getElementById("shopPreview");
          const profileMin = getComputedStyle(windowCard?.querySelector(".gameWinMinBtn"));
          const standardMin = getComputedStyle(document.querySelector("#boxVitals .gameWinMinBtn"));
          const listRect = list?.getBoundingClientRect();
          const previewRect = preview?.getBoundingClientRect();
          if (!document.querySelector("#shopList .shopRow img")) issues.push("vaisseaux absents de la boutique");
          if (!document.querySelector("#shopPreview .shipPreviewContainer img")) issues.push("aperçu du vaisseau absent");
          if (listRect && previewRect && listRect.right > previewRect.left) issues.push("liste et aperçu boutique se chevauchent");
          if (profileMin.width !== standardMin.width || profileMin.height !== standardMin.height || profileMin.borderRadius !== standardMin.borderRadius) {
            issues.push(`bouton de réduction Profil différent du HUD (${profileMin.width}×${profileMin.height}, rayon ${profileMin.borderRadius} / ${standardMin.width}×${standardMin.height}, rayon ${standardMin.borderRadius})`);
          }
          return issues;
        });
        errors.push(...profileIssues);
        if (captureProfile) await page.screenshot({ path: join(root, "profile-shop-preview.png"), fullPage: false });
      }
      if (switchTargets.length) {
        await page.evaluate(async (targets) => {
          const engineIdentity = window.__ORBIT_ENGINE__;
          const documentIdentity = document.documentElement;
          for (const target of targets) {
            await window.__SWITCH_MAP__(target);
            if (window.__CURRENT_MAP_ID__ !== target) throw new Error(`Carte interne incorrecte: ${window.__CURRENT_MAP_ID__}`);
            if (window.__ORBIT_ENGINE__ !== engineIdentity) throw new Error("Le moteur a été recréé");
            if (document.documentElement !== documentIdentity) throw new Error("Le document a été rechargé");
          }
        }, switchTargets);
      }
      await page.waitForTimeout(500);
      const canvasReady = await page.locator("#game").evaluate((canvas) => canvas.width > 0 && canvas.height > 0);
      if (!canvasReady) errors.push("canvas non initialisé");
    } catch (error) {
      errors.push(error.message);
    } finally {
      await page.close();
    }

    if (errors.length) failures.push(`${mapId}:\n  ${[...new Set(errors)].join("\n  ")}`);
    else console.log(`✓ ${mapId}`);
  }

  if (failures.length) throw new Error(`Échecs du smoke test (${failures.length}/${mapIds.length}):\n${failures.join("\n")}`);
  console.log(`Smoke browser: ${mapIds.length} carte(s) démarrée(s) sans erreur JavaScript.`);
} finally {
  await context.close();
  await browser.close();
  server.close();
}
