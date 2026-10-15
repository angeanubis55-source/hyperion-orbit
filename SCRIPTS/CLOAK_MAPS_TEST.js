// Camouflage interdit en GG / QZ / Low / Maudite : boutons grisés,
// activations refusées côté client, refus autoritaire côté serveur.
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
const cloakMapsSrc = engine.slice(engine.indexOf("const NO_CLOAK_MAPS"), engine.indexOf("\n}", engine.indexOf("function cloakBlockedOnMap(")) + 2);

function cloakContext(mapId, extra = {}) {
  const notes = [];
  const ctx = {
    window: { __CURRENT_MAP_ID__: mapId },
    player: { dead: false, cloakT: 0, cpuCloak: false, cloakCd: 0, credits: 100000 },
    started: true,
    showNotification: (msg) => notes.push(String(msg)),
    showToast: () => {},
    isPlayerCloaked: () => (ctx.player.cloakT || 0) > 0,
    isPlayerCpuCloaked: () => ctx.player.cpuCloak === true,
    persistCpuCloak: () => {},
    persistCdUntil: () => {},
    droneAbilityCooldown: (s) => s,
    POLICE_CLOAK_DURATION: 30,
    POLICE_CLOAK_COOLDOWN: 240,
    CPU_CLOAK_COST: 30000,
    CPU_CLOAK_COOLDOWN: 1,
    enemies: [],
    cloakCd: 0,
    updateSkillUI: () => {},
    noteNetPurchase: () => {},
    getCurrentUserFull: () => null,
    account: {},
    markProgressDirty: () => {},
    ...extra,
  };
  vm.createContext(ctx);
  vm.runInContext(`${cloakMapsSrc}\n${section("function activatePoliceCloak(")}\n${section("function toggleCpuCloak(")}`, ctx);
  return { ctx, notes };
}

test("cloakBlockedOnMap : GG, QZ, Low et Maudite, insensible à la casse", () => {
  const { ctx } = cloakContext("1-1");
  for (const blocked of ["alpha", "beta", "gamma", "delta", "epsilon", "zeta", "kappa",
    "lambda", "kronos", "awakened", "qz", "low", "maudite", "LOW", "Maudite"]) {
    assert.equal(vm.runInContext(`cloakBlockedOnMap(${JSON.stringify(blocked)})`, ctx), true, blocked);
  }
  for (const open of ["1-1", "4-4", "5-2", "1-bl", "pve"]) {
    assert.equal(vm.runInContext(`cloakBlockedOnMap(${JSON.stringify(open)})`, ctx), false, open);
  }
});

test("camouflage ultime : refusé sur carte interdite, actif ailleurs", () => {
  const blocked = cloakContext("low");
  vm.runInContext("activatePoliceCloak()", blocked.ctx);
  assert.equal(blocked.ctx.player.cloakT, 0);
  assert.ok(blocked.notes.some((m) => /interdit/i.test(m)));
  const open = cloakContext("1-1");
  vm.runInContext("activatePoliceCloak()", open.ctx);
  assert.equal(open.ctx.player.cloakT, 30);
});

test("CPU CL04K-XL : activation refusée, sortie toujours possible", () => {
  const blocked = cloakContext("maudite");
  vm.runInContext("toggleCpuCloak()", blocked.ctx);
  assert.equal(blocked.ctx.player.cpuCloak, false);
  assert.equal(blocked.ctx.player.credits, 100000, "aucun débit sans activation");
  // Sortie possible même sur carte interdite.
  blocked.ctx.player.cpuCloak = true;
  vm.runInContext("toggleCpuCloak()", blocked.ctx);
  assert.equal(blocked.ctx.player.cpuCloak, false);
  const open = cloakContext("4-4");
  vm.runInContext("toggleCpuCloak()", open.ctx);
  assert.equal(open.ctx.player.cpuCloak, true);
  assert.equal(open.ctx.player.credits, 70000);
});
