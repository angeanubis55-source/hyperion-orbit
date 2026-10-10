import test from "node:test";
import assert from "node:assert/strict";
import {
  ABILITY_FX_CODES,
  abilityFxCodeFor,
  abilityIdForFxCode,
  isAbilityFxBroadcastable,
  sanitizeAbilityFxEntry,
  sanitizeAbilityFxList,
  pruneAbilityFxMap,
  isExecutionAbility,
  abilityHitBypass,
  EXEC_WINDOW_MS,
  EXEC_HIT_CAP_PVP,
  EXEC_HIT_CAP_NPC,
  HEAL_ABILITIES,
  healSpecFor,
  isHealAbility,
  HEAL_MIN_INTERVAL_MS,
} from "../SRC/CORE/ABILITY_FX.js";
import { ABILITIES, ABILITY_IDS, getAbilityInfo } from "../SHIP/SHIP_ABILITIES.js";
import { useMovementAbility, movementSpeed } from "./MOVEMENT_RULES.js";
import { playerSlowMult } from "../SRC/CORE/FRAME_SYSTEMS.js";

// --- Registre : chaque aptitude done a un code, sauf camouflages ---

test("toutes les aptitudes done ont un code fx, sauf camouflages et soins instantanés", () => {
  const noFx = new Set([
    "ability_admin-ultimate-cloaking",
    "ability_spearhead_ultimate-cloak",
    "ability_spearhead-plus_ultimate-cloak",
    // Soins instantanés : barres HP/SH suffisent, pas d'aura.
    "ability_aegis_hp-repair",
    "ability_aegis_shield-repair",
    "ability_hammerclaw_hp-repair",
    "ability_hammerclaw-plus_hp-repair",
    "ability_hammerclaw_shield-repair",
    "ability_hammerclaw-plus_shield-repair",
    "ability_liberator-plus_self-repair",
    "ability_solace",
    "ability_solace-plus_nano-cluster-repairer-plus",
  ]);
  for (const id of ABILITY_IDS) {
    const info = ABILITIES[id];
    if (info.status !== "done") continue;
    if (noFx.has(id)) {
      assert.equal(isAbilityFxBroadcastable(id), false, `${id} ne doit pas être diffusé`);
      continue;
    }
    assert.ok(abilityFxCodeFor(id) > 0, `${id} (done) doit avoir un code fx`);
    assert.equal(isAbilityFxBroadcastable(id), true, `${id} doit être diffusé`);
  }
});

test("aucune aptitude todo restante", () => {
  const todo = ABILITY_IDS.filter((id) => ABILITIES[id].status !== "done");
  assert.deepEqual(todo, [], `aptitudes non branchées : ${todo.join(", ")}`);
});

test("codes uniques et réversibles", () => {
  const seen = new Map();
  for (const [code, id] of Object.entries(ABILITY_FX_CODES)) {
    assert.ok(!seen.has(id), `doublon fx : ${id}`);
    seen.set(id, Number(code));
    assert.equal(abilityIdForFxCode(Number(code)), id);
    assert.equal(abilityFxCodeFor(id), Number(code));
  }
});

// --- Sanitise réseau ---

test("sanitize rejette codes inconnus, camouflages, durées nulles", () => {
  assert.equal(sanitizeAbilityFxEntry([999, 5, 0, 0]), null);
  assert.equal(sanitizeAbilityFxEntry([0, 5, 0, 0]), null);
  assert.equal(sanitizeAbilityFxEntry([abilityFxCodeFor("ability_berserker_bsk"), 0, 0, 0]), null);
  assert.equal(sanitizeAbilityFxEntry("nope"), null);
  // Cloak : code existe mais jamais diffusé.
  assert.equal(sanitizeAbilityFxEntry([1, 5, 0, 0]), null);
});

test("sanitize borne positions et durées, conserve la cible", () => {
  const code = abilityFxCodeFor("ability_spearhead_target-marker");
  const out = sanitizeAbilityFxEntry([code, 9999, 1e9, -1e9, "u_cible trop longue__________________________________________"]);
  assert.ok(out);
  assert.ok(out[1] <= 3600);
  assert.ok(Math.abs(out[2]) <= 50000 && Math.abs(out[3]) <= 50000);
  assert.ok(String(out[4]).length <= 64);
});

test("sanitize liste plafonne à 8 entrées", () => {
  const code = abilityFxCodeFor("ability_berserker_bsk");
  const list = Array.from({ length: 20 }, () => [code, 5, 0, 0]);
  assert.equal(sanitizeAbilityFxList(list).length, 8);
  assert.deepEqual(sanitizeAbilityFxList("nope"), []);
});

// --- Prune serveur ---

test("prune garde les auras actives, purge les expirées et clamps à 8", () => {
  const now = 1_000_000;
  const fx = {
    ability_berserker_bsk: { until: now + 5000, x: 0, y: 0, target: "" },
    ability_admin_ultimate_cloaking: { until: now + 5000, x: 0, y: 0, target: "" },
    ability_sentinel: { until: now - 1000, x: 0, y: 0, target: "" },
  };
  const out = pruneAbilityFxMap(fx, now);
  assert.equal(out.length, 1);
  assert.equal(out[0][0], abilityFxCodeFor("ability_berserker_bsk"));
});

test("venom : la cible est propagée (anneau sur la victime)", () => {
  const now = 1_000_000;
  const fx = {
    ability_venom: { until: now + 35000, x: 0, y: 0, target: "u_victime" },
  };
  const out = pruneAbilityFxMap(fx, now);
  assert.equal(out.length, 1);
  assert.equal(out[0][0], abilityFxCodeFor("ability_venom"));
  assert.equal(out[0][4], "u_victime");
  // Round-trip sanitize : la cible survit au réseau.
  const back = sanitizeAbilityFxList(out);
  assert.equal(back.length, 1);
  assert.equal(back[0][4], "u_victime");
});

test("registre exécution : chs/chsp/venom/cyborg/inc/incPlus, caps", () => {
  for (const id of ["ability_retiarus_chs", "ability_retiarus-plus_chsp",
    "ability_venom", "ability_cyborg_singularity",
    "ability_solaris_inc", "ability_solaris-plus_incinerate-plus"]) {
    assert.equal(isExecutionAbility(id), true, id);
  }
  assert.equal(isExecutionAbility("ability_lightning"), false);
  assert.equal(isExecutionAbility("nimporte-quoi"), false);
  assert.ok(EXEC_HIT_CAP_PVP >= 1e8 && EXEC_HIT_CAP_NPC >= 1e9);
  assert.ok(EXEC_WINDOW_MS >= 10000);
});

test("bypass fenêtre CHS : single-shot consommé, expiré refusé", () => {
  const now = 5_000_000;
  assert.equal(abilityHitBypass({}, "ability_retiarus_chs", now), false);
  const s = { _execWindow: { key: "ability_retiarus_chs", until: now + 5000 } };
  assert.equal(abilityHitBypass(s, "ability_retiarus_chs", now), true);
  assert.equal(s._execWindow, null, "fenêtre consommée");
  assert.equal(abilityHitBypass(s, "ability_retiarus_chs", now), false);
  const s2 = { _execWindow: { key: "ability_retiarus-plus_chsp", until: now - 1 } };
  assert.equal(abilityHitBypass(s2, "ability_retiarus-plus_chsp", now), false);
  const s3 = { _execWindow: { key: "ability_retiarus_chs", until: now + 5000 } };
  assert.equal(abilityHitBypass(s3, "ability_retiarus-plus_chsp", now), false, "mauvaise clé");
});

test("bypass aura : actif ou grâce 2 s, sinon refusé", () => {
  const now = 5_000_000;
  assert.equal(abilityHitBypass({}, "ability_venom", now), false);
  assert.equal(abilityHitBypass({ _abilityFx: { ability_venom: { until: now + 10000 } } }, "ability_venom", now), true);
  assert.equal(abilityHitBypass({ _abilityFx: { ability_venom: { until: now - 1000 } } }, "ability_venom", now), true, "grâce");
  assert.equal(abilityHitBypass({ _abilityFx: { ability_venom: { until: now - 5000 } } }, "ability_venom", now), false);
  assert.equal(abilityHitBypass({ _abilityFx: {} }, "ability_lightning", now), false);
});

test("registre soins groupe : 9 aptitudes, rayons et caps officiels", () => {
  const expected = {
    "ability_aegis_hp-repair": { radius: 1000, cap: 40000, shield: false },
    "ability_aegis_shield-repair": { radius: 1000, cap: 25000, shield: true },
    "ability_aegis_repair-pod": { radius: 400, cap: 18000, shield: false },
    "ability_hammerclaw_hp-repair": { radius: 1000, cap: 50000, shield: false },
    "ability_hammerclaw_shield-repair": { radius: 1000, cap: 60000, shield: true },
    "ability_hammerclaw_repair-pod": { radius: 400, cap: 17500, shield: false },
    "ability_hammerclaw-plus_hp-repair": { radius: 1000, cap: 65000, shield: false },
    "ability_hammerclaw-plus_shield-repair": { radius: 1000, cap: 80000, shield: true },
    "ability_hammerclaw-plus_repair-pod": { radius: 600, cap: 20000, shield: false },
  };
  assert.equal(Object.keys(HEAL_ABILITIES).length, 9);
  for (const [id, spec] of Object.entries(expected)) {
    assert.ok(isHealAbility(id), id);
    assert.deepEqual(healSpecFor(id), { ...spec, mode: spec.radius <= 600 ? "pod" : "hot" }, id);
    // Chaque soin de groupe est une aptitude branchée du registre.
    assert.equal(getAbilityInfo(id)?.status, "done", id);
  }
  assert.equal(isHealAbility("ability_solace"), false, "solace = soi uniquement");
  assert.equal(isHealAbility("ability_orcus_assimilate"), false, "orcus = autre circuit");
  assert.ok(HEAL_MIN_INTERVAL_MS >= 500);
});

// --- Yamato : règle mouvement + multiplicateur local ---

test("yamato voyage : règle serveur x2 5s CD60 comme citadel", () => {
  const p = { shipId: "yamato", speed: 400, hangarId: "h1", config: 1, range: 1400 };
  const s = { id: "u_y", hp: 1000, sh: 100, x: 0, y: 0, moveBuck: 0, moveBuckT: 10000 };
  assert.equal(useMovementAbility(s, p, "ability_yamato_travel", true, 10000), true);
  assert.equal(movementSpeed(s, p, 10000), 800);
  assert.equal(movementSpeed(s, p, 10000 + 5001), 400);
  // Designs héritent.
  const p2 = { ...p, shipId: "yamato_ronin" };
  const s2 = { id: "u_y2", hp: 1000, sh: 100, x: 0, y: 0, moveBuck: 0, moveBuckT: 10000 };
  assert.equal(useMovementAbility(s2, p2, "ability_yamato_travel", true, 10000), true);
});

test("yamato voyage : multiplicateur local x2 via yamatoT séparé", () => {
  assert.equal(playerSlowMult({ travelT: 0, yamatoT: 5 }), 2);
  assert.equal(playerSlowMult({ travelT: 3, yamatoT: 4 }), 4);
  assert.equal(playerSlowMult({ travelT: 0, yamatoT: 0 }), 1);
});

// --- Solaris Plus : spec registre ---

test("solaris plus : spec 3s halo 800 CD80", () => {
  const info = getAbilityInfo("ability_solaris-plus_incinerate-plus");
  assert.equal(info.status, "done");
  assert.equal(info.durationSec, 3);
  assert.equal(info.cooldownSec, 80);
  const base = getAbilityInfo("ability_solaris_inc");
  assert.equal(base.durationSec, 3);
  assert.equal(base.cooldownSec, 90);
});
