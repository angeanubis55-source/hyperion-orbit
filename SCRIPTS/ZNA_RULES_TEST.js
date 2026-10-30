import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { ZoneNpcSim } from "./NPC_ROOM.js";

// Règles ZNA serveur extraites de MULTI_SERVER.js (playerZna + noteZnaHit).
const source = readFileSync(new URL("./MULTI_SERVER.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const from = source.indexOf("const ZNA_COMBAT_LOCK_MS");
const to = source.indexOf("function hyperionSafeBlocked(");
assert.ok(from >= 0 && to > from);
const ctx = vm.createContext({});
vm.runInContext(`${source.slice(from, to)}; this.playerZna = playerZna; this.noteZnaHit = noteZnaHit;`, ctx);
const { playerZna, noteZnaHit } = ctx;

const sim = kind => ({ safeKindAt: () => kind, entries: new Map([["jpc1", { jpc: true }], ["npc1", {}]]) });
const pilot = (extra = {}) => ({ x: 0, y: 0, hp: 100, safeClaim: true, ...extra });

test("ZNA portail : sans combat, protection immédiate", () => {
  assert.equal(playerZna(pilot(), sim("portal"), 10_000), true);
});

test("ZNA portail : chaque tir de joueur relance les 5 s", () => {
  const s = pilot({ _znaPlayerHitAt: 10_000 });
  assert.equal(playerZna(s, sim("portal"), 10_000), false);
  assert.equal(playerZna(s, sim("portal"), 14_900), false);
  s._znaPlayerHitAt = 13_000; // nouveau tir pendant le délai
  assert.equal(playerZna(s, sim("portal"), 15_500), false, "relancé jusqu'à 18 s");
  assert.equal(playerZna(s, sim("portal"), 18_000), true);
});

test("ZNA portail : NPC juste avant l'entrée = 5 s fixes, ses tirs ne relancent pas", () => {
  const s = pilot({ _znaNpcHitAt: 9_000 });
  assert.equal(playerZna(s, sim("portal"), 10_000), false, "entrée à 10 s");
  s._znaNpcHitAt = 14_000; // tir NPC pendant le délai : aucun effet
  assert.equal(playerZna(s, sim("portal"), 14_999), false);
  assert.equal(playerZna(s, sim("portal"), 15_000), true);
});

test("ZNA portail : NPC ancien (plus de 5 s avant l'entrée) = immédiat", () => {
  assert.equal(playerZna(pilot({ _znaNpcHitAt: 1_000 }), sim("portal"), 10_000), true);
});

test("ZNA portail : sortir puis revenir recommence le délai d'entrée", () => {
  const s = pilot({ _znaNpcHitAt: 9_500 });
  assert.equal(playerZna(s, sim("portal"), 10_000), false);
  assert.equal(playerZna(s, sim(null), 11_000), false, "hors zone");
  s._znaNpcHitAt = 12_000;
  assert.equal(playerZna(s, sim("portal"), 12_500), false, "nouvelle entrée à 12,5 s");
  assert.equal(playerZna(s, sim("portal"), 17_500), true);
});

test("ZNA base : immédiate même sous le feu d'un joueur ou d'un NPC", () => {
  assert.equal(playerZna(pilot({ _znaPlayerHitAt: 10_000, _znaNpcHitAt: 10_000 }), sim("base"), 10_000), true);
});

test("ZNA : attaquer retire la protection 5 s, base comprise", () => {
  const s = pilot({ _znaAttackAt: 10_000 });
  assert.equal(playerZna(s, sim("base"), 12_000), false);
  assert.equal(playerZna(s, sim("base"), 15_000), true);
  assert.equal(playerZna(pilot({ _znaAttackAt: 10_000 }), sim("portal"), 12_000), false);
});

test("ZNA : sans signal client, hors zone ou mort, jamais protégé", () => {
  assert.equal(playerZna(pilot({ safeClaim: false }), sim("base"), 10_000), false);
  assert.equal(playerZna(pilot(), sim(null), 10_000), false);
  assert.equal(playerZna(pilot({ hp: 0 }), sim("base"), 10_000), false);
  assert.equal(playerZna(pilot({ pvpDead: true }), sim("base"), 10_000), false);
});

test("ZNA : origine des coups (joueur, bot JPC, NPC) et attaque du tireur", () => {
  const shooter = { id: "u_a" }, room = new Map([["u_a", { state: shooter }]]);
  const victim = {};
  noteZnaHit(victim, room, sim("portal"), "u_a", 1_000);
  assert.equal(victim._znaPlayerHitAt, 1_000); assert.equal(shooter._znaAttackAt, 1_000);
  noteZnaHit(victim, room, sim("portal"), "jpc1", 2_000);
  assert.equal(victim._znaPlayerHitAt, 2_000, "un bot JPC compte comme un joueur");
  noteZnaHit(victim, room, sim("portal"), "npc1", 3_000);
  assert.equal(victim._znaNpcHitAt, 3_000); assert.equal(victim._znaPlayerHitAt, 2_000);
});

test("bot JPC : à l'abri au portail seulement s'il ne tire pas et n'est pas touché par un joueur", () => {
  const zone = new ZoneNpcSim("1-7", { w: 10000, h: 10000 }, []);
  zone.safe = [{ x: 0, y: 0, r: 500, kind: "portal" }, { x: 5000, y: 0, r: 500, kind: "base" }];
  const bot = { jpc: true, x: 0, y: 0 };
  assert.equal(zone.jpcSheltered(bot, 10_000), true, "posé au portail sans combat");
  bot.jpcAttackAt = 10_000;
  assert.equal(zone.jpcSheltered(bot, 12_000), false, "il tire : on peut le toucher");
  assert.equal(zone.jpcSheltered(bot, 15_000), true);
  bot.jpcPlayerHitAt = 15_000;
  assert.equal(zone.jpcSheltered(bot, 17_000), false, "touché par un joueur au portail");
  Object.assign(bot, { x: 5000 });
  assert.equal(zone.jpcSheltered(bot, 17_000), true, "base : immédiate s'il ne tire plus");
  assert.equal(zone.jpcSheltered({ jpc: true, x: 9000, y: 9000 }, 17_000), false, "hors zone");
});

test("simulation : la base prime sur le portail, null hors zone", () => {
  const zone = new ZoneNpcSim("1-1", { w: 10000, h: 10000 }, []);
  zone.safe = [{ x: 0, y: 0, r: 500, kind: "portal" }, { x: 300, y: 0, r: 500, kind: "base" }, { x: 5000, y: 0, r: 500, kind: "portal" }];
  assert.equal(zone.safeKindAt(5000, 0), "portal");
  assert.equal(zone.safeKindAt(200, 0), "base");
  assert.equal(zone.safeKindAt(9000, 9000), null);
});
