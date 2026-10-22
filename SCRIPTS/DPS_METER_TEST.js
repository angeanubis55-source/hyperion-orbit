// Compteur DPS : enregistrement par famille d'arme, fenêtre glissante
// fixe, totaux persistants, salves regroupées et fiche du calcul laser.
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";

const engine = readFileSync(new URL("../SRC/CORE/ORBIT_ENGINE.js", import.meta.url), "utf8");
function section(name) {
  const from = engine.indexOf(name);
  assert.ok(from >= 0, name);
  const end = engine.indexOf("\n}", from);
  assert.ok(end > from, name);
  return engine.slice(from, end + 2);
}
const meterSrc = engine.slice(engine.indexOf("const DPS_LOG_MAX"), engine.indexOf("\n}", engine.indexOf("function laserDpsBreakdown(")) + 2);

function meterContext() {
  const ctx = { nowMs: 0, performance: { now: () => ctx.nowMs } };
  vm.createContext(ctx);
  vm.runInContext(meterSrc, ctx);
  return ctx;
}

test("recordDps : familles d'arme et montants nuls ignorés", () => {
  const ctx = meterContext();
  vm.runInContext("recordDps({ total: 1000, rawDamage: 1100 }, {})", ctx);
  vm.runInContext("recordDps({ total: 500, rawDamage: 520 }, { rocket: 'eco10' })", ctx);
  vm.runInContext("recordDps({ total: 250, rawDamage: 250 }, { ability: 'ability_venom' })", ctx);
  vm.runInContext("recordDps({ total: 0, rawDamage: 0 }, {})", ctx);
  vm.runInContext("recordDps(null, {})", ctx);
  const snap = vm.runInContext("dpsSnapshot(5)", ctx);
  assert.equal(snap.total, 1870, "bruts comptés, pas les effectifs");
  assert.equal(snap.byKind.lasers, 1100);
  assert.equal(snap.byKind.rockets, 520);
  assert.equal(snap.byKind.abilities, 250);
  assert.equal(snap.hits, 3);
  assert.equal(snap.last, 1870, "même salve : dernier = cumul");
  assert.equal(snap.plusGros, 1870);
});

test("recordDps : repli sur le total sans brut (prédiction PvP)", () => {
  const ctx = meterContext();
  vm.runInContext("recordDps({ total: 800 }, {})", ctx);
  const snap = vm.runInContext("dpsSnapshot(5)", ctx);
  assert.equal(snap.total, 800);
});

test("salves : regroupement 0,5 s, plus gros et dernier", () => {
  const ctx = meterContext();
  ctx.nowMs = 0;
  vm.runInContext("recordDps({ total: 30000, rawDamage: 30000 }, {})", ctx);
  ctx.nowMs = 200;
  vm.runInContext("recordDps({ total: 23000, rawDamage: 23000 }, {})", ctx);
  ctx.nowMs = 300;
  vm.runInContext("recordDps({ total: 3200, rawDamage: 3200 }, {})", ctx);
  let snap = vm.runInContext("dpsSnapshot(5)", ctx);
  assert.equal(snap.last, 56200, "la salve cumule ses impacts");
  assert.equal(snap.plusGros, 56200);
  ctx.nowMs = 2000;
  vm.runInContext("recordDps({ total: 5000, rawDamage: 5000 }, {})", ctx);
  snap = vm.runInContext("dpsSnapshot(5)", ctx);
  assert.equal(snap.last, 5000, "nouvelle salve après le trou");
  assert.equal(snap.plusGros, 56200, "le record survit");
  assert.equal(snap.total, 61200);
  assert.equal(snap.hits, 4);
});

test("dpsSnapshot : fenêtre glissante fixe de 5 s, totaux persistants et reset bouton", () => {
  const ctx = meterContext();
  ctx.nowMs = 0;
  vm.runInContext("recordDps({ total: 5000 }, {})", ctx);
  ctx.nowMs = 4000;
  vm.runInContext("recordDps({ total: 1000 }, {})", ctx);
  ctx.nowMs = 6000;
  let snap = vm.runInContext("dpsSnapshot(5)", ctx);
  assert.equal(snap.total, 6000, "le total ne décroît jamais seul");
  assert.equal(snap.dps, 1000 / 5, "seul le hit récent compte dans la fenêtre");
  vm.runInContext("resetDpsLog()", ctx);
  snap = vm.runInContext("dpsSnapshot(5)", ctx);
  assert.equal(snap.total, 0);
  assert.equal(snap.dps, 0);
  assert.equal(snap.plusGros, 0);
  assert.equal(snap.hits, 0);
  assert.equal(snap.last, 0);
});

test("laserDpsBreakdown : base et produit des multiplicateurs, sans double comptage", () => {
  const ctx = {
    player: { baseDamage: 8000, droneDamageBonusPct: 12, laserMods: [{ damage: 5000 }], droneLaserMods: [{ damage: 1000 }] },
    account: { user: {} },
    formatInteger: (n) => String(n),
    playerBoosterMults: () => ({ dmg: 1.1 }),
    getActiveDroneFormation: () => ({ name: "Cœur", effects: { laserDamagePct: 8 } }),
    playerPilotMults: () => ({ alienDmg: 1.05 }),
    playerUpgradeMults: () => ({ laser: 1 }),
  };
  vm.createContext(ctx);
  const from = engine.indexOf("function laserDpsBreakdown(");
  vm.runInContext(engine.slice(from, engine.indexOf("\n}", from) + 2), ctx);
  const out = vm.runInContext("laserDpsBreakdown()", ctx);
  assert.equal(out.rows.length, 7);
  assert.equal(out.rows[0].label, "Base laser");
  assert.equal(out.rows[0].npc, "6000");
  assert.equal(out.rows[0].pvp, "6000");
  assert.equal(out.rows[1].label, "Modules");
  assert.equal(out.rows[3].label, "Cœur");
  assert.equal(out.rows[3].npc, "×1,08", "facteur avec virgule, jamais de +-");
  assert.equal(out.rows[4].label, "Arbre pilote");
  assert.equal(out.rows[4].npc, "×1,05");
  assert.equal(out.rows[4].pvp, "×1,00");
  assert.ok(Math.abs(out.npc.totalMult - (8000 / 6000) * 1.1 * 1.05) < 1e-6, "base × boosters × pilote, designs non recomptés");
  assert.equal(out.npc.perVolley, Math.round(6000 * out.npc.totalMult));
  assert.ok(Math.abs(out.pvp.totalMult - (8000 / 6000) * 1.1) < 1e-6, "pas de bonus pilote vs joueurs");
  assert.equal(out.pvp.perVolley, Math.round(6000 * out.pvp.totalMult));
});

test("laserDpsBreakdown : malus formation en ×0,80 sans double comptage", () => {
  const ctx = {
    player: { baseDamage: 8000, droneDamageBonusPct: 0 },
    account: { user: {} },
    formatInteger: (n) => String(n),
    playerBoosterMults: () => ({ dmg: 1 }),
    getActiveDroneFormation: () => ({ name: "Formation Roue", effects: { laserDamagePct: -20 } }),
    playerPilotMults: () => ({ alienDmg: 1 }),
    playerUpgradeMults: () => ({ laser: 1 }),
  };
  vm.createContext(ctx);
  const from = engine.indexOf("function laserDpsBreakdown(");
  vm.runInContext(engine.slice(from, engine.indexOf("\n}", from) + 2), ctx);
  const out = vm.runInContext("laserDpsBreakdown()", ctx);
  assert.equal(out.rows[0].label, "Base coque + modules");
  assert.equal(out.rows[1].label, "Formation Roue");
  assert.equal(out.rows[1].npc, "×0,80");
  assert.equal(out.rows[1].pvp, "×0,80");
  assert.ok(!JSON.stringify(out.rows).includes("+-"), "aucun +- nulle part");
  assert.equal(out.npc.perVolley, 8000, "base déjà à -20 % : estimation inchangée");
  assert.equal(out.pvp.perVolley, 8000);
});
