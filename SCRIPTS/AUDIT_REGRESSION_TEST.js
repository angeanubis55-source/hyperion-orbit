// Garde-fous des bugs relevés par l'audit en jeu du 1er novembre 2026.
// Les tests d'aptitudes simulent les fonctions d'envoi : ces erreurs de portée
// passaient au travers. Ici, on lit le vrai code du moteur.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import vm from "node:vm";

const read = path => readFileSync(new URL(path, import.meta.url), "utf8");
const engine = read("../SRC/CORE/ORBIT_ENGINE.js");
const account = read("../SRC/CORE/ACCOUNT.js");
const netplay = read("../SRC/CORE/NETPLAY.js");

function section(source, start, end) {
  const from = source.indexOf(start), to = source.indexOf(end, from);
  assert.ok(from >= 0 && to > from, start);
  return source.slice(from, to);
}

test("l'hologramme distant n'utilise aucune variable de la boucle des joueurs", () => {
  const ghosts = section(engine, "const drawHoloGhosts = () => {", "const rfxStatusIcon = ");
  assert.doesNotMatch(ghosts, /swayBob/);
});

test("les aptitudes reportées au serveur retrouvent le vaisseau au niveau du moteur", () => {
  assert.match(engine, /^function currentAbilityShipMatch\(\) \{/m);
  assert.match(engine, /^const ABILITY_GROUPS = \[/m);
  const outside = engine.slice(0, engine.indexOf("function initializeCustomActionBar() {"));
  assert.ok(outside.includes("function reportAbilityCast("), "l'envoi reste hors de la barre d'action");
  assert.ok(engine.indexOf("const ABILITY_GROUPS = [") < engine.indexOf("\ninitializeCustomActionBar();"),
    "le registre existe avant l'initialisation de la barre");
});

test("Hecate choisit sa variante avec une fonction qui existe", () => {
  assert.doesNotMatch(engine, /hecatePlusShip/);
  assert.match(engine, /^function isHecatePlusBase\(\) \{/m);
});

test("un ratio de vie absent ne vaut jamais zéro", () => {
  const context = {};
  vm.createContext(context);
  vm.runInContext(section(account, "function vitalityRatio(value) {", "function stageLiveHangarState("), context);
  for (const absent of [null, undefined, "", "abc"]) assert.equal(context.vitalityRatio(absent), null);
  assert.equal(context.vitalityRatio(0), 0);
  assert.equal(context.vitalityRatio(0.5), 0.5);
  assert.match(engine, /restored\?\.hpPct != null/);
  assert.match(engine, /restored\?\.shPct != null/);
});

test("le marqueur de ralliement vit dans la mini-carte, pas dans le son", () => {
  assert.doesNotMatch(section(engine, "function shouldPlayNetVolleySound(ev) {", "function spawnNetShotVisual("), /petLocatorMarkers/);
  const minimap = section(engine, "const petLocatorMarkers = [];", "renderMinimap(mctx, {");
  assert.match(minimap, /getNetGroup\(\)\?\.rally/);
});

test("le nuage toxique touche aussi sa moitié miroir", () => {
  const start = "const inside = (x, y) => {";
  const inside = section(engine, start, "const tickTarget = (t, applyDamage) => {");
  const context = { player: { nebX: 1000, nebY: 1000 }, mask: { w: 100, h: 100, data: new Uint8Array(10000) } };
  vm.createContext(context);
  vm.runInContext(`${inside}\nglobalThis.inside = inside;`, context);
  context.mask.data[50 * 100 + 80] = 1; // Seul le côté droit de l'image est plein.
  assert.equal(context.inside(1000 + 152, 1000), true, "côté dessiné");
  assert.equal(context.inside(1000 - 152, 1000), true, "côté miroir");
  assert.equal(context.inside(1000 + 300, 1000), false, "hors du dessin");
});

test("une session remplacée attend le code de fermeture avant de reconnecter", () => {
  const reconnect = section(netplay, "export function forceNetReconnect() {", "// Purge du gameplay partagé");
  assert.match(reconnect, /ws\.readyState === 2/);
  assert.ok(reconnect.indexOf("ws.readyState === 2") < reconnect.indexOf("wsGen++"),
    "le socket en fermeture garde sa génération pour que onclose lise 4001");
});

test("le bouton du passe disparaît malgré le display forcé du dock", () => {
  const sync = section(read("../UI/UI_BATTLEPASS.js"), "function syncPassVisibility() {", 'window.addEventListener("orbit:user-updated"');
  assert.match(sync, /setProperty\("display", "none", "important"\)/);
});

test("fin de l'event : clés et progression effacées pour un compte hors ligne, bonbons conservés", async t => {
  const dir = mkdtempSync(join(tmpdir(), "orbit-pass-end-"));
  process.env.ORBIT_DATA_DIR = dir;
  const { clearExpiredBattlepass, initAccountDb, sweepExpiredBattlepass } = await import("./ACCOUNT_SERVER.js");
  const db = initAccountDb();
  t.after(() => { db.close(); rmSync(dir, { recursive: true, force: true }); });
  const during = new Date(Date.UTC(2026, 9, 31, 12)), after = new Date(Date.UTC(2026, 10, 2, 12));
  const data = { revision: 4, inventory: { resources: { battlepass_key: 7, candy: 900 }, shipModules: [{ id: "m1" }] },
    battlepass: { eventId: "hw2026", progress: { hw_kill_1: 5 }, claimed: ["hw_kill_1"] } };
  const now = Date.now();
  db.prepare(`INSERT INTO users (id, pseudo, pseudo_norm, email, password_hash, data, revision, created_at, updated_at, email_verified_at)
    VALUES ('hors-ligne', 'Pilote', 'pilote', 'p@example.test', 'x', ?, 4, ?, ?, ?)`).run(JSON.stringify(data), now, now, now);
  const row = () => { const r = db.prepare("SELECT data, revision FROM users WHERE id = 'hors-ligne'").get(); return { ...JSON.parse(r.data), rev: r.revision }; };

  assert.equal(sweepExpiredBattlepass(during), 0, "pendant l'event, rien ne bouge");
  assert.equal(row().inventory.resources.battlepass_key, 7);
  assert.equal(sweepExpiredBattlepass(after), 1, "la fin nettoie le compte hors ligne");
  const cleared = row();
  assert.equal(cleared.inventory.resources.battlepass_key, undefined);
  assert.equal(cleared.inventory.resources.candy, 900);
  // Les modules vivent dans la table ship_modules, jamais dans le JSON du compte.
  assert.equal(cleared.inventory.shipModules, undefined);
  assert.deepEqual(db.prepare("SELECT data FROM ship_modules WHERE user_id = 'hors-ligne'").all().map(r => JSON.parse(r.data)), [{ id: "m1" }]);
  assert.equal(cleared.battlepass.progress.hw_kill_1, 0);
  assert.deepEqual(cleared.battlepass.claimed, []);
  assert.equal(cleared.rev, 5);
  assert.equal(sweepExpiredBattlepass(after), 0, "une seule passe par fin d'event");

  const stale = { inventory: { resources: { battlepass_key: 3 } }, battlepass: { progress: {}, claimed: [] } };
  assert.equal(clearExpiredBattlepass(stale, during), false, "une sauvegarde pendant l'event garde ses clés");
  assert.equal(clearExpiredBattlepass(stale, after), true, "une sauvegarde tardive ne recrée pas de clés");
  assert.equal(stale.inventory.resources.battlepass_key, undefined);
  assert.equal(clearExpiredBattlepass(stale, after), false);
});

test("l'écran de chargement Halloween suit exactement les bornes de l'event", async () => {
  const { isHalloweenEventActive } = await import("../NPC/NPC_HALLOWEEN.js");
  const script = section(read("../index.html"), "// Halloween : memes bornes", "})();");
  const shownAt = iso => {
    const classes = new Set();
    const fixed = new Date(iso);
    class FixedDate extends Date { constructor() { super(fixed.getTime()); } }
    vm.runInNewContext(script, { Date: FixedDate, Intl, Image: class {},
      document: { getElementById: () => ({ classList: { add: name => classes.add(name) } }) } });
    return classes.has("halloween");
  };
  const cases = [["2026-10-16T21:58:59Z", false], ["2026-10-16T21:59:00Z", true],
    ["2026-11-01T22:59:59Z", true], ["2026-11-01T23:00:00Z", false], ["2027-10-16T21:59:00Z", true]];
  for (const [iso, shown] of cases) {
    assert.equal(shownAt(iso), shown, iso);
    assert.equal(isHalloweenEventActive(new Date(iso)), shown, iso);
  }
});

test("un blocage du serveur est rattrapé par les NPC au lieu de les faire reculer", () => {
  const server = read("./MULTI_SERVER.js");
  const start = server.indexOf("const NPC_STEP_MS =");
  const end = server.indexOf("  if (elapsedMs >= SERVER_LAG_LOG_MS", start);
  assert.ok(start >= 0 && end > start);
  let now = 10000, tick;
  const context = vm.createContext({ Date: { now: () => now }, setInterval: fn => { tick = fn; } });
  vm.runInContext(server.slice(start, end) + "\nreturn { npcSteps, npcStepSec };\n});", context);
  let elapsed = 0, simulated = 0;
  for (const ms of [99, 1, 49, 51, 51, 49, 1300, ...Array(30).fill(51)]) {
    now += ms; elapsed += ms;
    const { npcSteps, npcStepSec } = tick(); simulated += npcSteps * npcStepSec * 1000;
    assert.ok(npcSteps >= 1 && npcSteps <= 12, "rattrapage borne par tour");
    assert.ok(npcStepSec <= 0.05 + 1e-9, "sous-pas de 50 ms max");
    assert.ok(simulated <= elapsed + 1e-6, `${simulated} ms simulees pour ${elapsed} ms reelles`);
  }
  assert.ok(elapsed - simulated < 1e-6, "le reliquat et les longs blocages sont rattrapes");
  assert.match(server, /for \(let step = 0; step < npcSteps; step\+\+\) sim\.tick\(/);
});

// --- Audit P.E.T du 3 novembre 2026 ---

test("les recharges du P.E.T partent même fenêtre fermée", () => {
  const hud = section(engine, "function updatePetHud() {", "\nfunction ");
  assert.doesNotMatch(hud, /endTraSession|endHplLink|endBuoySession|tickBuoyHpAura/);
  const sessions = section(engine, "function tickPetSessions() {", "\nfunction updatePetHud() {");
  for (const call of ["endTraSession()", 'endHplLink("expired")', 'endBuoySession("expired")', "tickBuoyHpAura()"]) {
    assert.ok(sessions.includes(call), call);
  }
  const loop = section(engine, "function update(dt) {", "\nfunction ");
  assert.match(loop, /tickPetSessions\(\);\s*updatePet\(dt\);/);
});

test("un kamikaze refusé ne consomme pas de carburant", () => {
  const source = section(engine, "function triggerPetKamikaze() {", "\n// Fait voler le REX");
  const pet = { owned: true, active: true, hp: 1000, fuel: 10, mode: "passive" };
  const toasts = [];
  const context = {
    petKamikaze: { active: false }, account: { user: { pet } }, player: { dead: false }, started: true,
    petGearLevels: () => ({ kk: 1 }), kkCooldownLeftSec: () => 0, loadAccountUser() {},
    showToast: text => toasts.push(text), pickKamikazeTarget: () => null,
    consumePetOneshotFuel: p => { p.fuel -= 3; return { ok: true, cost: 3 }; },
  };
  vm.runInNewContext(`${source}\ntriggerPetKamikaze();`, context);
  assert.equal(pet.fuel, 10, "sans cible");
  assert.match(toasts.at(-1), /verrouille une cible/);
  context.pickKamikazeTarget = () => ({ id: 1 });
  context.player.dead = true;
  vm.runInNewContext(`${source}\ntriggerPetKamikaze();`, context);
  assert.equal(pet.fuel, 10, "joueur mort");
});

test("la bouée coque augmente les PV max sans soigner en entrant et sortant", () => {
  const source = section(engine, "function tickBuoyHpAura() {", "\n// Recalcul de vie");
  let inside = false;
  const player = { hp: 50000, hpMax: 100000 };
  const context = { petBuoy: { key: "bh" }, buoyPlayerInside: () => inside, player, PET_BUOY_HP_PCT: 5, markProgressDirty() {} };
  vm.runInNewContext(source, context);
  for (let i = 0; i < 10; i++) {
    inside = true; vm.runInNewContext("tickBuoyHpAura()", context);
    assert.equal(player.hpMax, 105000);
    inside = false; vm.runInNewContext("tickBuoyHpAura()", context);
  }
  assert.equal(player.hp, 50000);
  assert.equal(player.hpMax, 100000);
});

test("le serveur accepte le P.E.T aussi loin que porte l'auto-loot", async () => {
  const { ANTICHEAT } = await import("./ANTICHEAT.js");
  const { PET_GEAR_RANGES } = await import("../PET/PET_GEARS.js");
  const radar = Math.max(...[...read("../SRC/CORE/CATALOG.js").matchAll(/petProtocol: \{ key: "radar", level: \d+, pct: ([\d.]+)/g)].map(m => Number(m[1])));
  assert.ok(radar > 0, "protocole radar introuvable");
  const reach = Math.max(...PET_GEAR_RANGES.al, ...PET_GEAR_RANGES.ar) * (1 + radar / 100);
  assert.ok(ANTICHEAT.PET_LEASH >= reach, `${ANTICHEAT.PET_LEASH} < ${Math.ceil(reach)}`);
});

test("la régénération du pool PET serveur couvre le G-REP le plus fort", async () => {
  const { PET_GEAR_REPAIR_PCT } = await import("../PET/PET_GEARS.js");
  const rate = Number(read("./MULTI_SERVER.js").match(/_petHpRegenBudget = Math\.min\(phm \* ([\d.]+)/)?.[1]);
  assert.ok(rate >= Math.max(...PET_GEAR_REPAIR_PCT) / 100, String(rate));
});

test("un P.E.T distancé réapparaît à côté du vaisseau, sauf en pleine collecte", () => {
  const update = section(engine, "function updatePet(dt) {", "\nconst petCombinedFrames");
  assert.match(update, /ownerDistance > PET_MAX_CHASE_DIST && preFetch == null\) \{\s*petState\.ready = false;/);
  assert.ok(update.indexOf("const preFetch =") < update.indexOf("ownerDistance > PET_MAX_CHASE_DIST"), "la collecte est connue avant");
  const recovery = section(engine, "function tickPetRecovery(", "\n// Carburant du REX");
  assert.doesNotMatch(recovery, /tickPetLocator/);
});

test("l'auto-loot vise la box la plus proche du P.E.T, pas du vaisseau", async () => {
  const { pickNearestWithin } = await import("../PET/PET_GEARS.js");
  const source = section(engine, "function scanPetFetch(gears) {", "\n// Collecte des clones TBR");
  const nearShip = { id: "a", x: 1100, y: 1000 }, nearPet = { id: "b", x: 2900, y: 1000 };
  const petState = { x: 3000, y: 1000, fetchId: null };
  const context = {
    account: { user: { pet: {} } }, player: { x: 1000, y: 1000 }, petState, pickNearestWithin,
    getPetGearRangeWithRadar: key => (key === "al" ? 3000 : 0),
    spatialCollectablesNear: () => [nearShip, nearPet], isPetFetchEligible: () => true,
  };
  vm.runInNewContext(`${source}\nthis.picked = scanPetFetch({ al: 4, ar: 0 });`, context);
  assert.equal(context.picked, nearPet);
  assert.equal(petState.fetchId, "b");
});

test("une box refusée est ignorée 30 s puis retentée", () => {
  const helpers = section(engine, "const PET_REFUSED_BOX_SEC = 30;", "\n// Cible de collecte du P.E.T");
  const collect = section(engine, "function collectPetBox(box, st = petState) {", "\nfunction tickPetLocator(");
  let now = 1000;
  const box = { id: 7, type: "Cargo_Box", x: 0, y: 0 };
  const st = { pickCd: 0 };
  const context = {
    performance: { now: () => now * 1000 }, collectableTargetId: null, player: { x: 0, y: 0 }, account: { user: { pet: {} } },
    PET_GEAR_AUTOLOOT_TYPES: ["Cargo_Box"], PET_GEAR_ORE_TYPES: [], PET_GEAR_PICK_DELAY: 0.3,
    getPetProtocolPct: () => 0, applyCollectableReward: () => ({ kept: true }), SFX: { play() {} },
    takeCollectableInstance() { throw new Error("box refusée retirée"); }, collectables: [box], st, box,
  };
  vm.runInNewContext(`${helpers}\n${collect}\ncollectPetBox(box, st);`, context);
  const eligible = () => vm.runInNewContext("isPetFetchEligible(box, { al: 1, ar: 0 }, 3000, 0)", context);
  assert.equal(st.pickCd, 0.3, "pas d'attente de 10 s sur les box suivantes");
  assert.equal(eligible(), false);
  now += 29; assert.equal(eligible(), false);
  now += 2; assert.equal(eligible(), true);
});

test("le P.E.T n'attaque pas tout seul pendant le camouflage", () => {
  const update = section(engine, "function updatePet(dt) {", "\nconst petCombinedFrames");
  const guard = update.indexOf("if (target && isPlayerUntargetable()) target = null;");
  assert.ok(guard > 0, "garde camouflage");
  assert.ok(guard < update.indexOf("petState.target = target;"), "avant la cible du REX et des clones");
  assert.match(engine, /function isPlayerUntargetable\(\) \{ return isPlayerCloaked\(\) \|\| isPlayerCpuCloaked\(\) \|\| isPlayerHoloHidden\(\); \}/);
});

test("la Flamme sacrificielle exige un P.E.T actif et en vie", () => {
  const source = section(engine, "function triggerSacrificeFlame() {", "\nfunction openTraTradeWindow");
  for (const pet of [{ owned: true, active: false, hp: 1000, sh: 500 }, { owned: true, active: false, hp: 0, sh: 500 }]) {
    const player = { sh: 0, shMax: 1000 };
    const context = { account: { user: { pet } }, player, petGearLevels: () => ({ fs: 1 }), loadAccountUser() {}, showToast() {},
      petShieldMaxForHud: () => 500, consumePetOneshotFuel: () => ({ ok: true }) };
    vm.runInNewContext(`${source}\ntriggerSacrificeFlame();`, context);
    assert.equal(player.sh, 0);
    assert.equal(pet.sh, 500);
  }
});

test("un P.E.T détruit perd son bouclier", () => {
  const source = section(engine, "function onPetDestroyed() {", "\n// Part coque redirigée");
  const pet = { owned: true, active: true, hp: 0, sh: 800, activeGear: "hpl" };
  const context = { account: { user: { pet } }, markProgressDirty() {}, cancelKamikazeRun() {}, petState: {}, petLocator: {},
    petEngine: { states: new Map() }, engineTrails: [] };
  vm.runInNewContext(`${source}\nonPetDestroyed();`, context);
  assert.equal(pet.sh, 0);
  assert.equal(pet.active, false);
});

test("en collecte, le P.E.T rattrape jusqu'à x1,35 loin de la box", () => {
  const update = section(engine, "function updatePet(dt) {", "\nconst petCombinedFrames");
  assert.match(update, /const fetchSpeed = ownerSpeed \* \(1 \+ 0\.35 \* clamp\(\(trueDist - 400\) \/ 600, 0, 1\)\);/);
  assert.match(update, /Math\.min\(1, fetchSpeed \/ speed\)/);
});

test("le localisateur G-EL marque sans faire attaquer le P.E.T", () => {
  const update = section(engine, "function updatePet(dt) {", "\nconst petCombinedFrames");
  assert.doesNotMatch(update, /getEnemyById\(petLocator\.enemyId\)/);
  assert.doesNotMatch(engine, /petHasGuns/);
  assert.match(engine, /if \(isPetActive && petLocator\.enemyId != null\) \{/, "le marqueur mini-carte reste");
});
