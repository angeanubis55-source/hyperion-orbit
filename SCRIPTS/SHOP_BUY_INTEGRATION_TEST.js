import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:net";
import { once } from "node:events";
import { ORE_SELL_PRICES } from "../SRC/DATA/RESOURCES.js";
import { normalizeGalaxyGateState } from "../SRC/CORE/GALAXY_GATES.js";

test("achat de munitions laser autoritaire côté serveur", { timeout: 20000 }, async t => {
  const temporary = await mkdtemp(join(tmpdir(), "orbit-shop-buy-"));
  const reserve = createServer(); reserve.listen(0, "127.0.0.1"); await once(reserve, "listening");
  const port = reserve.address().port; await new Promise(done => reserve.close(done));
  const server = spawn(process.execPath, [fileURLToPath(new URL("./MULTI_SERVER.js", import.meta.url))], {
    cwd: temporary, windowsHide: true, env: { ...process.env, PORT: String(port) }, stdio: ["ignore", "pipe", "pipe"],
  });
  let output = ""; server.stdout.on("data", chunk => { output += chunk; }); server.stderr.on("data", chunk => { output += chunk; });
  t.after(async () => {
    const stopped = server.exitCode === null ? once(server, "exit") : Promise.resolve(); server.kill(); await stopped;
    assert.equal(dirname(resolve(temporary)), resolve(tmpdir()));
    assert.ok(basename(temporary).startsWith("orbit-shop-buy-"));
    await rm(temporary, { recursive: true, force: true });
  });
  const baseUrl = `http://127.0.0.1:${port}`;
  const api = async (path, { token, body } = {}) => {
    const response = await fetch(baseUrl + path, { method: body ? "POST" : "GET", headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { "content-type": "application/json" } : {}),
    }, body: body ? JSON.stringify(body) : undefined });
    return { status: response.status, ...await response.json() };
  };
  let ready = false;
  for (let i = 0; i < 80; i++) {
    try { ready = (await api("/api/ping")).ok; if (ready) break; } catch {}
    if (server.exitCode !== null) break;
    await new Promise(done => setTimeout(done, 100));
  }
  assert.ok(ready, output);

  const registered = await api("/api/register", { body: {
    pseudo: "shop-buy-test", email: "shop@example.test", password: "isolated-password-123", faction: "mmo",
  } });
  assert.equal(registered.status, 200);
  const { token, user } = registered;
  const initialX2 = Number(user.ammo?.x2 || 0);
  const bought = await api("/api/shop/buy", { token, body: {
    itemId: "ammo_x2", quantity: 2, price: 0, credits: 999_999_999,
  } });
  assert.equal(bought.status, 200);
  assert.equal(bought.totalPrice, 1_000_000, "le serveur ignore le prix fourni par le navigateur");
  assert.equal(bought.user.credits, user.credits - 1_000_000);
  assert.equal(bought.user.ammo.x2, initialX2 + 2_000);
  assert.equal(bought.user.inventory.counts.ammo_x2, 2);

  const hidden = await api("/api/shop/buy", { token, body: { itemId: "ammo_x4", quantity: 1 } });
  assert.equal(hidden.status, 400, "une munition cachée ne peut pas être achetée par appel direct");
  const tooExpensive = await api("/api/shop/buy", { token, body: { itemId: "ammo_x2", quantity: 1_000_000 } });
  assert.equal(tooExpensive.status, 409);
  const current = await api("/api/me", { token });
  assert.equal(current.user.credits, bought.user.credits, "un achat refusé ne modifie pas le compte");
  assert.equal(current.user.ammo.x2, bought.user.ammo.x2);

  const funded = await api("/api/save", { token, body: {
    user: { ...current.user, credits: 5_000_000_000, revision: current.user.revision + 1 },
    baseRevision: current.user.revision, saveId: "fund-shop-categories",
  } });
  assert.equal(funded.status, 200);
  let canonical = funded.user;
  const buy = async (itemId, quantity = 1, extra = {}) => {
    const result = await api("/api/shop/buy", { token, body: { itemId, quantity, price: 1, ...extra } });
    assert.equal(result.status, 200, `${itemId}: ${result.error || "achat refusé"}`);
    canonical = result.user;
    return result;
  };
  const rocketBefore = Number(canonical.rockets?.r310 || 0);
  await buy("rocket_r310", 3);
  assert.ok(canonical.rockets.r310 > rocketBefore);
  await buy("laser_lf1", 2);
  assert.equal(canonical.inventory.counts.laser_lf1, 2);
  await buy("station_laser_1", 2);
  assert.equal(canonical.inventory.resources.station_laser_1, 2);
  await buy("ticket_module_reroll", 1);
  assert.equal(canonical.inventory.counts.ticket_module_reroll, 1);
  const booster = await buy("booster_dmg", 2);
  assert.ok(booster.user.boosters.active.dmg > Date.now() + 7_000_000);
  await buy("ship_aegis");
  assert.ok(canonical.inventory.ships.includes("aegis"));
  assert.ok(canonical.hangars.some(hangar => hangar.shipId === "aegis"));
  await buy("design_aegis_eic");
  assert.ok(canonical.inventory.shipDesigns.includes("aegis_eic"));
  await buy("pet_niveau1", 1, { petPseudo: "Serveur REX" });
  assert.equal(canonical.pet.pseudo, "Serveur REX");
  const fuelBefore = canonical.pet.fuel;
  canonical.pet.fuel = fuelBefore - 10;
  const fuelBase = await api("/api/save", { token, body: {
    user: { ...canonical, revision: canonical.revision + 1 }, baseRevision: canonical.revision, saveId: "pet-fuel-space",
  } });
  assert.equal(fuelBase.status, 200); canonical = fuelBase.user;
  await buy("pet_fuel", 5);
  assert.equal(canonical.pet.fuel, fuelBefore - 5);
  await buy("pet_hull", 2);
  assert.equal(canonical.pet.hullUpgrades, 2);
  await buy("gear_gal1");
  await buy("proto_aicr1");
  assert.equal(canonical.inventory.counts.gear_gal1, 1);
  assert.equal(canonical.inventory.counts.proto_aicr1, 1);
  await buy("drone_iris");
  assert.equal(canonical.drones.items.filter(drone => drone.type === "iris").length, 1);
  await buy("formation_turtle");
  assert.ok(canonical.drones.formations.includes("turtle"));

  const duplicateShip = await api("/api/shop/buy", { token, body: { itemId: "ship_aegis", quantity: 1 } });
  assert.equal(duplicateShip.status, 409);
  const genericHidden = await api("/api/shop/buy", { token, body: { itemId: "ammo_x4", quantity: 1 } });
  assert.equal(genericHidden.status, 400);
  const finalState = await api("/api/me", { token });
  assert.equal(finalState.user.credits, canonical.credits, "les refus ne débitent jamais les crédits");

  const sell = async (kind, id, quantity = 1, extra = {}) => {
    const result = await api("/api/shop/sell", { token, body: { kind, id, quantity, gain: 999_999_999, ...extra } });
    assert.equal(result.status, 200, `${kind}/${id}: ${result.error || "vente refusée"}`);
    canonical = result.user;
    return result;
  };
  const equipmentCredits = canonical.credits;
  const soldEquipment = await sell("equipment", "laser_lf1", 1, { force: true });
  assert.equal(soldEquipment.gain, 7_500);
  assert.equal(canonical.inventory.counts.laser_lf1, 1);
  assert.equal(canonical.credits, equipmentCredits + 7_500, "le gain envoyé par le navigateur est ignoré");
  const ammoBeforeSale = canonical.ammo.x2;
  const soldAmmo = await sell("ammo", "x2", 100);
  assert.equal(canonical.ammo.x2, ammoBeforeSale - 100);
  assert.equal(soldAmmo.gain, soldAmmo.gainEach * 100);

  const generatedModule = { id: "module-sell-test", type: "damage", tier: "a", shipId: "aegis",
    bonuses: [{ stat: "damage", pct: 1 }], rerolls: 0, rerollCredits: 0 };
  const moduleKey = JSON.stringify({ t: "damage", tier: "a", ship: "aegis", b: generatedModule.bonuses, r: 0, c: 0 });
  const activeIndex = Math.max(0, canonical.hangars.findIndex(hangar => hangar.active));
  const hangars = structuredClone(canonical.hangars);
  hangars[activeIndex].fits ||= {};
  hangars[activeIndex].fits["1"] ||= { lasers: [], gens: [], extras: [], shipMods: [] };
  hangars[activeIndex].fits["1"].shipMods = [generatedModule.id];
  const stocked = await api("/api/save", { token, body: {
    user: { ...canonical, revision: canonical.revision + 1, hangars,
      inventory: { ...canonical.inventory, resources: { ...canonical.inventory.resources, prometium: 10 }, shipModules: [generatedModule] } },
    baseRevision: canonical.revision, saveId: "stock-server-sales",
  } });
  assert.equal(stocked.status, 200); canonical = stocked.user;
  const mountedRefusal = await api("/api/shop/sell", { token, body: { kind: "module", id: moduleKey, quantity: 1 } });
  assert.equal(mountedRefusal.status, 409);
  const soldModule = await sell("module", moduleKey, 1, { force: true });
  assert.equal(canonical.inventory.shipModules.length, 0);
  assert.ok(soldModule.stripped > 0);
  const oreCredits = canonical.credits;
  const soldOre = await sell("ore", "prometium", 1, { trader: true });
  assert.equal(soldOre.quantity, 10);
  assert.equal(soldOre.gain, 10 * ORE_SELL_PRICES.prometium, "un bonus Trader non équipé est ignoré");
  assert.equal(canonical.credits, oreCredits + soldOre.gain);
  assert.equal(canonical.inventory.resources.prometium, 0);

  const productionStock = await api("/api/save", { token, body: {
    user: { ...canonical, revision: canonical.revision + 1, inventory: { ...canonical.inventory,
      resources: { ...canonical.inventory.resources, prometium: 40, endurium: 20, mucosum: 12, scrap: 2, plasmide: 4 } } },
    baseRevision: canonical.revision, saveId: "stock-server-production",
  } });
  assert.equal(productionStock.status, 200); canonical = productionStock.user;
  const refined = await api("/api/production", { token, body: {
    action: "refine", recipeId: "prometid", quantity: 1_000_000, gained: 999_999,
  } });
  assert.equal(refined.status, 200); canonical = refined.user;
  assert.equal(refined.quantity, 2);
  assert.equal(refined.gained, 2, "le résultat de raffinage annoncé par le navigateur est ignoré");
  assert.equal(canonical.inventory.resources.prometium, 0);
  assert.equal(canonical.inventory.resources.endurium, 0);
  assert.equal(canonical.inventory.resources.prometid, 2);
  const x2BeforeCraft = Number(canonical.ammo.x2 || 0);
  const crafted = await api("/api/production", { token, body: {
    action: "craft", recipeId: "craft_x2", quantity: 2, output: { ammo: { x2: 999_999_999 } },
  } });
  assert.equal(crafted.status, 200); canonical = crafted.user;
  assert.equal(canonical.ammo.x2, x2BeforeCraft + 20_000);
  assert.equal(canonical.inventory.resources.mucosum, 0);
  assert.equal(canonical.inventory.resources.scrap, 0);
  assert.equal(canonical.inventory.resources.plasmide, 0);
  const refusedCraft = await api("/api/production", { token, body: { action: "craft", recipeId: "craft_x2", quantity: 1 } });
  assert.equal(refusedCraft.status, 409);
  const afterRefusal = await api("/api/me", { token });
  assert.equal(afterRefusal.user.ammo.x2, canonical.ammo.x2, "un craft refusé ne crée aucun objet");
  canonical = afterRefusal.user;
  const creditsBeforeUpgrade = canonical.credits;
  const upgraded = await api("/api/skylab", { token, body: {
    action: "upgrade", moduleId: "basic", cost: 0, finishesAt: 1,
  } });
  assert.equal(upgraded.status, 200); canonical = upgraded.user;
  assert.equal(upgraded.to, 2);
  assert.equal(canonical.credits, creditsBeforeUpgrade - upgraded.cost.credits, "le serveur impose le cout Skylab");
  assert.ok(canonical.skylab.modules.basic.upgrading.finishesAt > Date.now());

  const seededSkylab = structuredClone(canonical.skylab);
  seededSkylab.modules.prometium_collector.level = 1;
  seededSkylab.modules.prometium_collector.upgrading = null;
  seededSkylab.stock.prometium = Math.max(100, Number(seededSkylab.stock.prometium) || 0);
  const skySeed = await api("/api/save", { token, body: {
    user: { ...canonical, revision: canonical.revision + 1, skylab: seededSkylab },
    baseRevision: canonical.revision, saveId: "stock-server-skylab",
  } });
  assert.equal(skySeed.status, 200); canonical = skySeed.user;
  const toggled = await api("/api/skylab", { token, body: { action: "toggle", moduleId: "prometium_collector", enabled: false } });
  assert.equal(toggled.status, 200); canonical = toggled.user;
  assert.equal(canonical.skylab.modules.prometium_collector.enabled, false);
  const robotCredits = canonical.credits;
  const robot = await api("/api/skylab", { token, body: { action: "robot", moduleId: "prometium_collector", price: 0 } });
  assert.equal(robot.status, 200); canonical = robot.user;
  assert.equal(canonical.credits, robotCredits - robot.price);
  assert.equal(canonical.skylab.modules.prometium_collector.robots.length, 1);
  const productionSky = structuredClone(canonical.skylab);
  productionSky.modules.prometium_collector.enabled = true;
  productionSky.lastTickAt = Date.now() - 10_000;
  const stockBeforeProduction = Number(productionSky.stock.prometium || 0);
  const productionSeed = await api("/api/save", { token, body: {
    user: { ...canonical, revision: canonical.revision + 1, skylab: productionSky },
    baseRevision: canonical.revision, saveId: "tick-server-skylab",
  } });
  assert.equal(productionSeed.status, 200); canonical = productionSeed.user;
  const syncedSkylab = await api("/api/skylab", { token, body: { action: "sync", elapsed: 999_999 } });
  assert.equal(syncedSkylab.status, 200); canonical = syncedSkylab.user;
  assert.ok(Number(canonical.skylab.stock.prometium) > stockBeforeProduction, "la production est calculee avec l'horloge serveur");
  const prometiumBeforeTransport = Number(canonical.inventory.resources.prometium || 0);
  const sent = await api("/api/skylab", { token, body: { action: "transport", amounts: { prometium: 10 }, toSky: false } });
  assert.equal(sent.status, 200); canonical = sent.user;
  assert.equal(sent.totalMoved, 10);
  assert.equal(canonical.inventory.resources.prometium, prometiumBeforeTransport + 10);
  const instantCredits = canonical.credits;
  const loaded = await api("/api/skylab", { token, body: { action: "instant", amounts: { prometium: 5 }, toSky: true, cost: 0 } });
  assert.equal(loaded.status, 200); canonical = loaded.user;
  assert.equal(loaded.totalMoved, 5);
  assert.equal(canonical.credits, instantCredits - loaded.cost, "le cout du transport instantane vient du serveur");

  const gateSeedState = normalizeGalaxyGateState(canonical.galaxyGates);
  gateSeedState.energy = 20;
  gateSeedState.multipliers ||= {};
  gateSeedState.multiplierArmed ||= {};
  gateSeedState.multipliers.delta = 3;
  gateSeedState.multiplierArmed.delta = false;
  gateSeedState.built ||= {};
  gateSeedState.deployed ||= {};
  gateSeedState.built.delta = 1;
  gateSeedState.deployed.delta = false;
  const gateSeed = await api("/api/save", { token, body: {
    user: { ...canonical, revision: canonical.revision + 1, galaxyGates: gateSeedState,
      inventory: { ...canonical.inventory, resources: { ...canonical.inventory.resources, palladium: 25 } } },
    baseRevision: canonical.revision, saveId: "stock-server-galaxy-gates",
  } });
  assert.equal(gateSeed.status, 200); canonical = gateSeed.user;
  const armedGate = await api("/api/galaxy-gates", { token, body: { action: "multiplier", gateId: "delta", armed: true, multiplier: 5 } });
  assert.equal(armedGate.status, 200); canonical = armedGate.user;
  assert.equal(canonical.galaxyGates.multiplierArmed.delta, true);
  const deployedGate = await api("/api/galaxy-gates", { token, body: { action: "deploy", gateId: "delta", built: 999 } });
  assert.equal(deployedGate.status, 409, "un stock invente par le client ne permet pas un deploiement");
  assert.equal(canonical.galaxyGates.built.delta, 0);
  assert.equal(canonical.galaxyGates.deployed.delta, true);
  const energyBeforeSpin = canonical.galaxyGates.energy;
  const spunGate = await api("/api/galaxy-gates", { token, body: {
    action: "spin", gateId: "alpha", count: 1, rewards: { credits: 999_999_999, ammo: { x6: 999_999_999 } },
  } });
  assert.equal(spunGate.status, 200); canonical = spunGate.user;
  assert.equal(spunGate.performed, 1);
  assert.ok(canonical.galaxyGates.energy >= energyBeforeSpin - 1 && canonical.galaxyGates.energy <= energyBeforeSpin + 1);
  assert.ok(Number(spunGate.rewards.credits || 0) <= 50_000);
  assert.ok(Number(spunGate.rewards.ammo?.x6 || 0) <= 20, "les recompenses GG envoyees par le client sont ignorees");
  const exchangedGate = await api("/api/galaxy-gates", { token, body: { action: "palladium", rate: 1, energies: 999_999 } });
  assert.equal(exchangedGate.status, 200); canonical = exchangedGate.user;
  assert.equal(exchangedGate.energies, 2);
  assert.equal(exchangedGate.cost, 20);
  assert.equal(canonical.inventory.resources.palladium, 5);

  const modulesBefore = canonical.inventory.shipModules.length;
  const rolled = await api("/api/modules", { token, body: {
    action: "roll", cost: 0, module: { id: "fake-client-module", bonuses: [{ stat: "damage", pct: 999 }] },
  } });
  assert.equal(rolled.status, 200); canonical = rolled.user;
  assert.equal(canonical.inventory.shipModules.length, modulesBefore + 1);
  assert.notEqual(rolled.module.id, "fake-client-module", "le module fourni par le navigateur est ignore");
  assert.equal(rolled.payment.amount, 1_000_000, "le serveur impose le prix du tirage");
  const rerolled = await api("/api/modules", { token, body: {
    action: "reroll", moduleId: rolled.module.id, cost: 0, module: { id: "fake-reroll" },
  } });
  assert.equal(rerolled.status, 200); canonical = rerolled.user;
  assert.notEqual(rerolled.module.id, "fake-reroll");
  assert.equal(rerolled.module.rerolls, 1);
  assert.equal(rerolled.payment.type, "ticket", "le ticket possede est consomme en priorite");

  const investedBeforeUnlimitedReroll = Number(rerolled.module.rerollCredits || 0);
  const unlimitedModule = { ...rerolled.module, rerolls: 49 };
  const unlimitedSeed = await api("/api/save", { token, body: {
    user: { ...canonical, revision: canonical.revision + 1, inventory: { ...canonical.inventory,
      shipModules: canonical.inventory.shipModules.map(module => module.id === rerolled.module.id ? unlimitedModule : module),
      counts: { ...canonical.inventory.counts, ticket_module_reroll: 1 } } },
    baseRevision: canonical.revision, saveId: "module-unlimited-reroll",
  } });
  assert.equal(unlimitedSeed.status, 200); canonical = unlimitedSeed.user;
  const unlimitedReroll = await api("/api/modules", { token, body: { action: "reroll", moduleId: unlimitedModule.id } });
  assert.equal(unlimitedReroll.status, 200); canonical = unlimitedReroll.user;
  assert.equal(unlimitedReroll.module.rerolls, 50, "les tickets permettent de relancer sans limite technique");
  assert.equal(unlimitedReroll.payment.type, "ticket");
  assert.equal(unlimitedReroll.module.rerollCredits, investedBeforeUnlimitedReroll,
    "la cinquantieme relance par ticket n'augmente pas la valeur de revente");

  const moduleDay = canonical.stats.moduleDailyRolls.day;
  const nearLimit = await api("/api/save", { token, body: {
    user: { ...canonical, revision: canonical.revision + 1, stats: { ...canonical.stats,
      moduleDailyRolls: { day: moduleDay, count: 18 } } },
    baseRevision: canonical.revision, saveId: "module-limit-18",
  } });
  assert.equal(nearLimit.status, 200); canonical = nearLimit.user;
  for (let count = 19; count <= 20; count++) {
    const result = await api("/api/modules", { token, body: { action: "roll" } });
    assert.equal(result.status, 200); canonical = result.user;
    assert.equal(canonical.stats.moduleDailyRolls.count, count);
  }
  const staleCounter = await api("/api/save", { token, body: {
    user: { ...canonical, revision: canonical.revision + 1, stats: { ...canonical.stats,
      moduleDailyRolls: { day: moduleDay, count: 18 } } },
    baseRevision: canonical.revision, saveId: "module-limit-stale-18", compactSave: true,
  } });
  assert.equal(staleCounter.status, 200); canonical = staleCounter.user;
  assert.equal(staleCounter.snapshotAccepted, undefined, "une correction serveur renvoie le compte canonique complet");
  assert.equal(canonical.stats.moduleDailyRolls.count, 20, "une sauvegarde retardee ne baisse pas le compteur");
  const overLimit = await api("/api/modules", { token, body: { action: "roll" } });
  assert.equal(overLimit.status, 409, "le vingt-et-unieme tirage reste refuse apres une sauvegarde retardee");

  const keyed = await api("/api/save", { token, body: {
    user: { ...canonical, revision: canonical.revision + 1, inventory: { ...canonical.inventory,
      resources: { ...canonical.inventory.resources, battlepass_key: 3 } } },
    baseRevision: canonical.revision, saveId: "stock-pass-shop",
  } });
  assert.equal(keyed.status, 200); canonical = keyed.user;
  const scrapBefore = Number(canonical.inventory.resources.scrap || 0);
  const passBought = await api("/api/modules", { token, body: {
    action: "pass", offerId: "res_scrap", cost: 0, resources: { scrap: 999_999 },
  } });
  assert.equal(passBought.status, 200); canonical = passBought.user;
  assert.equal(canonical.inventory.resources.battlepass_key, 2);
  assert.equal(canonical.inventory.resources.scrap, scrapBefore + 25, "le gain Pass Shop fourni par le navigateur est ignore");
});
