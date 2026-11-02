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
  assert.deepEqual(cleared.inventory.shipModules, [{ id: "m1" }]);
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
  assert.match(server, /Math\.floor\(elapsedMs \/ NPC_STEP_MS\)/);
  assert.match(server, /for \(let step = 0; step < npcSteps; step\+\+\) sim\.tick\(/);
});
