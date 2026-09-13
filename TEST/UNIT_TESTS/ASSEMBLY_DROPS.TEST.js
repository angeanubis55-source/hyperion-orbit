import test from "node:test";
import assert from "node:assert/strict";

import {
  ASSEMBLY_BOX_TABLE,
  ASSEMBLY_DIRECT_TABLE,
  assemblyBaseFamily,
  rollNpcAssemblyBox,
  rollNpcAssemblyDirect,
} from "../../NPC/NPC_ASSEMBLY.js";
import { COLLECTABLE_TYPES } from "../../SRC/DATA/COLLECTABLES.js";
import { RESOURCE_TYPES } from "../../SRC/DATA/RESOURCES.js";

const always = () => 0;
const never = () => 0.999999;

test("familles de base : paliers, gates et reskins retirés", () => {
  assert.equal(assemblyBaseFamily("npc_Saimon"), "npc_Saimon");
  assert.equal(assemblyBaseFamily("npc_Boss_Saimon"), "npc_Saimon");
  assert.equal(assemblyBaseFamily("npc_Uber_Kristallon"), "npc_Kristallon");
  assert.equal(assemblyBaseFamily("npc_Saimon_alpha"), "npc_Saimon");
  assert.equal(assemblyBaseFamily("npc_Mordon_gamma"), "npc_Mordon");
  assert.equal(assemblyBaseFamily("npc_Saimon_Corrupted"), "npc_Saimon");
  assert.equal(assemblyBaseFamily("npc_Boss_Saimon_Aberration"), "npc_Saimon");
  assert.equal(assemblyBaseFamily("npc_Lordakia_maudite2"), "npc_Lordakia");
});

test("taux uniformes 25 % partout", () => {
  const scrap = ASSEMBLY_BOX_TABLE.find((e) => e.resource === "scrap");
  assert.deepEqual(scrap.rates.npc_Saimon, { regular: 0.25, boss: 0.25, uber: 0.25 });
  assert.deepEqual(scrap.rates.npc_Mordon, { regular: 0.25, boss: 0.25, uber: 0.25 });
  const aurus = ASSEMBLY_BOX_TABLE.find((e) => e.resource === "aurus");
  assert.equal(aurus.rates.npc_Interceptor.regular, 0.25);
  assert.equal(aurus.rates.npc_Barracuda.regular, 0.25);
  assert.equal(aurus.rates.npc_Battleray.uber, 0.25);
  for (const entry of ASSEMBLY_BOX_TABLE) {
    for (const rates of Object.values(entry.rates)) {
      for (const chance of Object.values(rates)) {
        assert.ok(chance === 0 || chance === 0.25, `${entry.resource}: taux inattendu ${chance}`);
      }
    }
  }
});

test("box à collecter : drop garanti avec random=0, rien avec random=1", () => {
  const drop = rollNpcAssemblyBox("npc_Saimon", always);
  assert.equal(drop.box, "Scrap_Box");
  assert.equal(drop.resource, "scrap");
  assert.ok(drop.amount >= 1);
  assert.equal(rollNpcAssemblyBox("npc_Saimon", never), null);
  assert.equal(rollNpcAssemblyBox("npc_Streuner", always), null);
  assert.equal(rollNpcAssemblyBox("npc_Boss_Mordon", always).resource, "scrap");
  assert.equal(rollNpcAssemblyBox("npc_Uber_Kristallon", always).resource, "prismatium");
  assert.equal(rollNpcAssemblyBox("npc_Saimon_Corrupted", always).resource, "scrap");
  assert.equal(rollNpcAssemblyBox("npc_Devolarium", always).resource, "plasmide");
  assert.equal(rollNpcAssemblyBox("npc_Interceptor", always).resource, "aurus");
});

test("tetrathrin uniquement sur uber, bifenon cubikon inclus", () => {
  assert.equal(rollNpcAssemblyBox("npc_Interceptor", always).resource, "aurus");
  const uber = rollNpcAssemblyBox("npc_Uber_Interceptor", always);
  assert.ok(["aurus", "bifenon", "tetrathrin"].includes(uber.resource));
  assert.equal(rollNpcAssemblyBox("npc_Cubikon", always).resource, "bifenon");
});

test("direct inventaire : rinusk / trace / cerebrum sans collecte", () => {
  const impulse = rollNpcAssemblyDirect("npc_Impulse_II");
  assert.deepEqual(impulse, [{ resource: "rinusk", qty: 1 }]);
  const attend = rollNpcAssemblyDirect("npc_Attend_IX");
  assert.ok(attend.some((d) => d.resource === "rinusk"));
  assert.ok(attend.some((d) => d.resource === "blacklight_trace"));
  const behemoth = rollNpcAssemblyDirect("npc_Mindfire_Behemoth");
  assert.ok(behemoth.some((d) => d.resource === "rinusk"));
  assert.ok(behemoth.some((d) => d.resource === "blacklight_trace"));
  assert.ok(behemoth.some((d) => d.resource === "mindfire_cerebrum"));
  assert.deepEqual(rollNpcAssemblyDirect("npc_Saimon"), []);
});

test("chaque box a sa définition collectable et sa ressource", () => {
  for (const entry of ASSEMBLY_BOX_TABLE) {
    const def = COLLECTABLE_TYPES[entry.box];
    assert.ok(def, `définition manquante pour ${entry.box}`);
    assert.equal(def.qty, 0);
    assert.ok(def.sprite?.path, `sprite manquant pour ${entry.box}`);
    assert.ok(Number(def.sprite.frames) >= 1);
    assert.ok(RESOURCE_TYPES[entry.resource], `ressource manquante: ${entry.resource}`);
    assert.ok(def.rewards?.resources?.[entry.resource], `récompense manquante: ${entry.resource}`);
  }
  for (const entry of ASSEMBLY_DIRECT_TABLE) {
    assert.ok(RESOURCE_TYPES[entry.resource], `ressource manquante: ${entry.resource}`);
  }
});
