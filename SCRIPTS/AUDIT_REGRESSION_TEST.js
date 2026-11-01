// Garde-fous des bugs relevés par l'audit en jeu du 1er novembre 2026.
// Les tests d'aptitudes simulent les fonctions d'envoi : ces erreurs de portée
// passaient au travers. Ici, on lit le vrai code du moteur.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
