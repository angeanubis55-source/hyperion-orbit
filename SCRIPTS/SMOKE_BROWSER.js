import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { MAP_LOADERS } from "../SRC/CORE/MAP_REGISTRY.js";

const root = process.cwd();
const temporary = await mkdtemp(join(tmpdir(), "orbit-smoke-"));
const reserve = createServer();
await new Promise(resolve => reserve.listen(0, "127.0.0.1", resolve));
const { port } = reserve.address();
await new Promise(resolve => reserve.close(resolve));
const server = spawn(process.execPath, [join(root, "SCRIPTS/MULTI_SERVER.js")], {
  cwd: root, windowsHide: true,
  env: { ...process.env, PORT: String(port), ORBIT_DATA_DIR: temporary },
  stdio: ["ignore", "pipe", "pipe"],
});
let serverOutput = "";
server.stdout.on("data", chunk => { serverOutput += chunk; });
server.stderr.on("data", chunk => { serverOutput += chunk; });
const baseUrl = `http://127.0.0.1:${port}`;
let ready = false;
for (let i = 0; i < 100; i++) {
  try { ready = (await fetch(baseUrl + "/api/ping")).ok; } catch {}
  if (ready || server.exitCode !== null) break;
  await new Promise(resolve => setTimeout(resolve, 100));
}
if (!ready) throw new Error(`Serveur multi indisponible:\n${serverOutput}`);
const registered = await fetch(baseUrl + "/api/register", {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ pseudo: `Smoke${Date.now()}`, email: `smoke-${Date.now()}@example.test`, password: "smoke-password-123", faction: "mmo" }),
});
if (!registered.ok) throw new Error(`Inscription smoke refusée: ${registered.status}`);
const smokeAccount = await registered.json();
if (process.argv.includes("--profile")) {
  const seededResponse = await fetch(baseUrl + "/api/shop/buy", {
    method: "POST",
    headers: { "content-type": "application/json", Authorization: `Bearer ${smokeAccount.token}` },
    body: JSON.stringify({ itemId: "laser_lf1", quantity: 1 }),
  });
  const seeded = await seededResponse.json();
  if (!seededResponse.ok || !seeded?.user) throw new Error(`Préparation boutique smoke refusée: ${seeded?.error || seededResponse.status}`);
  smokeAccount.user = seeded.user;
}
const browser = await chromium.launch({ channel: "msedge", headless: true });
const context = await browser.newContext();
const requestedMap = process.argv.find((arg) => arg.startsWith("--map="))?.slice(6);
const coldStart = process.argv.includes("--cold");
const inspectProfile = process.argv.includes("--profile");
const captureProfile = process.argv.includes("--profile-screenshot");
const inspectCombat = process.argv.includes("--combat");
const inspectEquipment = process.argv.includes("--equipment");
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
      await page.addInitScript(({ coldStart, token, user }) => {
        localStorage.setItem("orbit_token", token);
        localStorage.setItem("orbit_user_cache", JSON.stringify({ user }));
        localStorage.setItem("orbit_current_user", JSON.stringify({ id: user.id, pseudo: user.pseudo, email: user.email }));
        if (!coldStart) sessionStorage.setItem("orbit_assets_preloaded_v1", "ready");
        // Simule une transition de carte legitime : __GO_TO_MAP__ laisse un
        // jeton spawnMapId en session, sans quoi le boot anti-triche ignore ?map=.
        try {
          const requested = new URLSearchParams(location.search).get("map");
          if (requested) sessionStorage.setItem("spawnMapId", requested);
        } catch {}
      }, { coldStart, token: smokeAccount.token, user: smokeAccount.user });
      await page.goto(`${baseUrl}/index.html?map=${encodeURIComponent(mapId)}`, { waitUntil: "domcontentloaded", timeout: 20_000 });
      await page.waitForFunction(() => {
        const overlay = document.getElementById("loadingOverlay");
        const button = document.getElementById("loadingStartBtn");
        return (overlay && getComputedStyle(overlay).display === "none") || (button && !button.disabled);
      }, null, { timeout: 90_000 });
      const mustStart = await page.locator("#loadingStartBtn").evaluate(button => !button.disabled && getComputedStyle(button).display !== "none");
      if (mustStart) await page.click("#loadingStartBtn");
      await page.waitForSelector("#game", { state: "visible", timeout: 10_000 });
      await page.waitForFunction(() => getComputedStyle(document.getElementById("loadingOverlay")).display === "none", null, { timeout: 30_000 });
      await page.waitForFunction(() => !document.documentElement.classList.contains("orbitBooting"), null, { timeout: 30_000 });
      if (inspectCombat) {
        await page.waitForTimeout(1800);
        await page.locator('.actionPaletteToggle').click();
        await page.locator('[data-action-category="skills"]').click();
        await page.locator('.actionPaletteItems [data-skill="pulse"]').click();
        await page.locator('.actionPaletteToggle').click();
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
        await page.click("#btnHangarHub");
        await page.waitForSelector("#hangarWindow", { state: "visible", timeout: 10_000 });

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
        await page.click("#fitTitlebarSave");
        await page.waitForSelector("#fitCard", { state: "hidden" });
        const savedFit = await page.evaluate(async () => {
          const { getCurrentUserFull } = await import("/SRC/CORE/ACCOUNT.js");
          return getCurrentUserFull().hangars.find(h => h.active).fit.lasers;
        });
        if (!savedFit.includes("laser_lf1")) errors.push("Appliquer n'a pas sauvegardé le laser sans P.E.T");
        await page.click("#hangarGrid [data-fit]");
        await page.waitForSelector("#fitSlotsLasers .slotCell.filled");
        await page.click("#fitBtnResetAll");
        await page.click("#fitTitlebarBack");
        await page.click("#hangarGrid [data-fit]");
        await page.waitForSelector("#fitSlotsLasers .slotCell.filled");
        await page.click("#fitTitlebarBack");

        if (captureProfile) {
          await page.screenshot({ path: join(root, "profile-hangars-preview.png"), fullPage: false });
          await page.click('[data-window-id="tdmWindow"]');
          await page.waitForSelector("#tdmInventorySections .inventorySlot");
          await page.screenshot({ path: join(root, "profile-inventory-preview.png"), fullPage: false });
        }
        await page.click("#btnShopHub");
        await page.waitForSelector("#shopWindow", { state: "visible", timeout: 10_000 });
        for (const category of ["ammo", "generators", "lasers", "extras", "ships"]) {
          await page.click(`#shopWindowTabs .tabBtn[data-shop="${category}"]`);
          if (captureProfile && category === "extras") {
            await page.screenshot({ path: join(root, "profile-extras-preview.png"), fullPage: false });
          }
          if (category !== "extras") {
            await page.waitForFunction(() => document.querySelectorAll("#shopWindowList .shopRow").length > 0);
          }
        }
        await page.waitForFunction(() => document.querySelectorAll("#shopWindowList .shopRow").length > 0);
        const profileIssues = await page.evaluate(() => {
          const issues = [];
          const windowCard = document.getElementById("shopWindow");
          const list = document.getElementById("shopWindowList");
          const preview = document.getElementById("shopWindowPreview");
          const profileMin = getComputedStyle(windowCard?.querySelector(".gameWinMinBtn"));
          const standardMin = getComputedStyle(document.querySelector("#boxVitals .gameWinMinBtn"));
          const listRect = list?.getBoundingClientRect();
          const previewRect = preview?.getBoundingClientRect();
          if (!document.querySelector("#shopWindowList .shopRow img")) issues.push("vaisseaux absents de la boutique");
          if (!document.querySelector("#shopWindowPreview .shipPreviewContainer img")) issues.push("aperçu du vaisseau absent");
          if (listRect && previewRect && listRect.right > previewRect.left) issues.push("liste et aperçu boutique se chevauchent");
          if (profileMin.width !== standardMin.width || profileMin.height !== standardMin.height || profileMin.borderRadius !== standardMin.borderRadius) {
            issues.push(`bouton de réduction Profil différent du HUD (${profileMin.width}×${profileMin.height}, rayon ${profileMin.borderRadius} / ${standardMin.width}×${standardMin.height}, rayon ${standardMin.borderRadius})`);
          }
          return issues;
        });
        errors.push(...profileIssues);
        if (captureProfile) await page.screenshot({ path: join(root, "profile-shop-preview.png"), fullPage: false });
      }
      if (inspectEquipment) {
        await page.evaluate(async () => {
          const api = await import("/SRC/CORE/ACCOUNT.js");
          const { computeHangarStats } = await import("/SHIP/SHIP_HANGARS.js");
          const engine = window.__ORBIT_ENGINE__;
          const originalDocument = document.documentElement;
          const check = (value, message) => { if (!value) throw new Error(message); };
          const ok = result => check(result.ok, result.error || "Échec équipement");
          ok(api.updateCurrentUserProgress({ credits: 100000000 }));
          ok(await api.buyShopItem("laser_lf1", 3));
          ok(await api.buyShopItem("shd_sg3na01", 3));
          ok(await api.buyShopItem("pet_niveau1", 1));
          ok(await api.buyShopItem("drone_iris", 1));
          window.HyperionGameSync.syncFromAccount();
          const user = api.getCurrentUserFull();
          const hid = user.hangars.find(h => h.active).id;
          const did = user.drones.items[0].id;
          // Visit empty config 2 first, reproducing its cached zero shield.
          ok(api.setActiveHangarConfig(hid, 2));
          ok(api.setActiveHangarConfig(hid, 1));
          const loadout = {
            ship: { lasers: ["laser_lf1"], gens: ["shd_sg3na01"] },
            drones: { [did]: { equipment: ["laser_lf1", "shd_sg3na01"] } },
            pet: { lasers: ["laser_lf1"], generators: ["shd_sg3na01"] },
          };
          const verify = cfg => {
            const live = engine.getEquipmentState();
            const saved = api.getCurrentUserFull();
            const stats = computeHangarStats(saved.hangars.find(h => h.id === hid), saved);
            check(live.config === cfg, `Config active incorrecte : ${live.config}/${cfg}`);
            check(live.ship.shieldMax === 2000 && live.ship.shield === 2000, `Bouclier live config ${cfg} : ${JSON.stringify(live.ship)}`);
            check(live.ship.damage === Math.floor(stats.totalLaserDamage), "Dégâts vaisseau/drones non synchronisés");
            check(live.pet.shieldMax === 1000 && live.pet.shield === 1000 && live.pet.damage > 0, "Statistiques REX non synchronisées");
            check(live.drones[0].equipment.includes("shd_sg3na01"), "Fit drone non synchronisé");
            check(engine === window.__ORBIT_ENGINE__ && originalDocument === document.documentElement, "Rechargement inattendu");
          };
          ok(api.saveHangarLoadout(hid, loadout, 2));
          check(engine.getEquipmentState().config === 1, "Appliquer a changé la config active");
          ok(api.setActiveHangarConfig(hid, 2));
          verify(2);
          ok(api.saveHangarLoadout(hid, { ship: {}, drones: { [did]: { equipment: [] } }, pet: {} }, 2));
          check(engine.getEquipmentState().ship.shieldMax === 0 && engine.getEquipmentState().pet.shieldMax === 0, "Retrait non appliqué en direct");
          ok(api.saveHangarLoadout(hid, loadout, 2));
          verify(2);
          ok(api.saveHangarLoadout(hid, loadout, 1));
          ok(api.setActiveHangarConfig(hid, 1));
          verify(1);
          ok(api.setActiveHangarConfig(hid, 2));
          verify(2);
        });
        await page.click("#btnHangarHub");
        await page.click("#hangarGrid [data-fit]");
        await page.click("#fitBtnResetAll");
        await page.click("#fitTitlebarSave");
        await page.waitForSelector("#fitCard", { state: "hidden" });
        await page.waitForFunction(() => {
          const live = window.__ORBIT_ENGINE__.getEquipmentState();
          return live.config === 2 && live.ship.shieldMax === 1000 && live.pet.shieldMax === 1000;
        });
        await page.click("#hangarGrid [data-fit]");
        await page.click('.fitCfgBtn[data-cfg="1"]');
        await page.waitForFunction(() => document.querySelector('.fitCfgBtn[data-cfg="1"]')?.classList.contains("active"));
        await page.click('.fitCfgBtn[data-cfg="2"]');
        await page.waitForFunction(() => document.querySelector('.fitCfgBtn[data-cfg="2"]')?.classList.contains("active"));
        await page.click('[data-fit-section="pet"]');
        await page.waitForSelector("#fitPetWorkspace .petFitSlot.filled");
        const unifiedSlots = await page.evaluate(() => [...document.querySelectorAll("#fitPetWorkspace .petFitSlot, #fitDroneWorkspace .droneFitSlot")]
          .every(slot => slot.classList.contains("slotCell")));
        if (!unifiedSlots) errors.push("Les slots drones/P.E.T n'utilisent pas le cadre du vaisseau");
        await page.dragAndDrop('#fitPetWorkspace .petFitSlot[data-pet-group="generators"].filled', "#fitCard .fitInventoryPane");
        await page.waitForFunction(() => !document.querySelector('#fitPetWorkspace .petFitSlot[data-pet-group="generators"].filled'));
        await page.click("#fitTitlebarSave");
        await page.waitForFunction(() => window.__ORBIT_ENGINE__.getEquipmentState().pet.shieldMax === 0);
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
      try {
        errors.push("diagnostic=" + JSON.stringify(await page.evaluate(() => ({
          url: location.href,
          title: document.title,
          status: document.getElementById("loadingStatus")?.textContent,
          button: document.getElementById("loadingStartBtn")?.textContent,
          disabled: document.getElementById("loadingStartBtn")?.disabled,
          token: !!localStorage.getItem("orbit_token"),
          current: !!localStorage.getItem("orbit_current_user"),
        }))));
      } catch {}
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
  if (server.exitCode === null) {
    server.kill();
    await Promise.race([once(server, "exit"), new Promise(resolve => setTimeout(resolve, 3000))]);
  }
  await rm(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
