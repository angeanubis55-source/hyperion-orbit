import test from "node:test";
import assert from "node:assert/strict";
import { SHIP_PACKS } from "../SHIP/SHIP_PACKS.js";
import { abilityShipKeyFor } from "../SHIP/SHIP_ABILITIES.js";
import { playerSlowMult } from "../SRC/CORE/FRAME_SYSTEMS.js";
import { acAuditWindow } from "./ANTICHEAT.js";
import { NETWORK_TIMING_GRACE_SEC } from "../SRC/CORE/NETWORK_TIMING.js";
import { movementSpeed, movementWindow, takeMovement, useMovementAbility, stopMovementAbility, syncMovementAbility, usePhaseOut } from "./MOVEMENT_RULES.js";

const profile = (ship = "phoenixbleu") => ({ shipId: SHIP_PACKS.find(p => abilityShipKeyFor(p.id) === ship || p.id.toLowerCase() === ship)?.id || ship,
  speed: 400, hangarId: "h1", config: 1, range: 1400 });
const state = () => ({ id: "u_test", hp: 1000, sh: 1000, x: 0, y: 0, moveBuck: 0, moveBuckT: 10000 });
const move = (s, p, x, y, now) => { const result = takeMovement(s, p, x, y, now); Object.assign(s, { x: result.x, y: result.y }); return result; };

test("un speed hack modere reste bloque sur une duree longue", t => {
  t.mock.method(console, "log", () => {});
  const s = state(), p = profile();
  let rejections = 0;
  for (let i = 1; i <= 400; i++) {
    // +30 % avec une vmax et des timestamps client mensongers.
    s.vmax = 1e9; s.clientTime = 10000 + i * 5000;
    if (!move(s, p, i * 26, 0, 10000 + i * 50).accepted) rejections++;
  }
  assert.ok(rejections > 0);
  assert.ok(s.x <= 400 * 20 * 1.01 + 400 * NETWORK_TIMING_GRACE_SEC + 2);
});

test("les rafales de messages ne donnent pas du temps supplementaire", t => {
  t.mock.method(console, "log", () => {});
  const s = state(), p = profile();
  for (let i = 1; i <= 300; i++) move(s, p, i, 0, 10000);
  assert.equal(s.x, p.speed * NETWORK_TIMING_GRACE_SEC + 2, "la dette fixe et l'arrondi ne se multiplient pas avec les paquets");
});

test("la marge d'interpolation du client est acceptee aussi pendant un bonus", () => {
  const s = state(), p = profile("lightning");
  useMovementAbility(s, p, "ability_lightning", true, 10000);
  const lead = 800 * NETWORK_TIMING_GRACE_SEC;
  assert.equal(move(s, p, lead, 0, 10000).accepted, true);
  assert.equal(move(s, p, lead + 40, 0, 10050).accepted, true);
  assert.equal(move(s, p, lead + 80, 0, 10100).accepted, true);
  assert.equal(move(s, p, lead + 120, 0, 10100).accepted, false, "une rafale ne renouvelle pas la marge");
});

test("les coordonnees arrondies et les orbites restent valides a plusieurs cadences", () => {
  for (const dt of [50, 100, 1000]) {
    const s = state(), p = profile();
    let x = 0, y = 0;
    for (let i = 1; i <= 100; i++) {
      const angle = i * 0.1;
      x += 400 * dt / 1000 * Math.cos(angle);
      y += 400 * dt / 1000 * Math.sin(angle);
      assert.equal(move(s, p, Math.round(x), Math.round(y), 10000 + i * dt).accepted, true, `${dt} ms, pas ${i}`);
    }
  }
});

test("un retard reseau de deux secondes conserve le deplacement legitime", () => {
  assert.equal(move(state(), profile(), 800, 0, 12000).accepted, true);
});

test("une connexion irreguliere conserve cinq secondes de mouvement sans signalement", () => {
  const s = state(), p = profile();
  s._audit = { t: 10000, score: 0 };
  let now = 10000, x = 0;
  for (const delay of [1115, 3302, 2111, 4195, 1123, 5000, 1053]) {
    now += delay; x += p.speed * delay / 1000;
    assert.equal(move(s, p, Math.round(x), 0, now).accepted, true, `${delay} ms`);
  }
  assert.equal(s._security, undefined);
  assert.equal(acAuditWindow(s._audit, now).score, 0);
});

test("les positions en attente se rattrapent en rafale sans multiplier le budget", () => {
  const s = state(), p = profile();
  for (let x = 200; x <= 1800; x += 200) assert.equal(move(s, p, x, 0, 14500).accepted, true);
  assert.equal(move(s, p, 2200, 0, 14500).accepted, false);
});

test("un gel ou une mort desynchronises corrigent la position sans dossier de triche", t => {
  t.mock.method(console, "log", () => {});
  for (const blocked of [{ freezeUntil: 50000 }, { hp: 0, pvpDead: true }]) {
    const s = Object.assign(state(), blocked, { _audit: { t: 10000, score: 0 } });
    for (let i = 1; i <= 20; i++) assert.equal(move(s, profile(), 682, 0, 10000 + i * 1100).accepted, false);
    assert.equal(s.x, 0);
    assert.equal(s._security, undefined);
    assert.equal(acAuditWindow(s._audit, 32000).score, 0);
  }
});

test("un bonus forge ou emprunte a une autre coque est refuse", () => {
  assert.equal(useMovementAbility(state(), profile(), "ability_lightning", true, 10000), false);
  assert.equal(useMovementAbility(state(), profile("lightning"), "ability_citadel_travel", true, 10000), false);
});

test("Lightning est borne par une duree et une recharge serveur", () => {
  const s = state(), p = profile("lightning");
  assert.equal(useMovementAbility(s, p, "ability_lightning", true, 10000), true);
  assert.equal(movementSpeed(s, p, 10001), 800);
  assert.equal(useMovementAbility(s, p, "ability_lightning", true, 10001), false);
  assert.equal(movementSpeed(s, p, 20000), 400);
  assert.equal(useMovementAbility(s, p, "ability_lightning", true, 20001), false);
  assert.equal(useMovementAbility(s, p, "ability_lightning", true, 80000), true);
});

test("l'expiration d'un bonus est integree sans accorder sa vitesse apres la fin", () => {
  const s = state(), p = profile("lightning");
  useMovementAbility(s, p, "ability_lightning", true, 10000);
  s.moveBuckT = 19500;
  assert.equal(movementWindow(s, p, 20500).distance, 600 * 1.01);
});

test("activer un bonus ne remunere pas le temps avant son activation", () => {
  const s = state(), p = profile("lightning");
  assert.equal(useMovementAbility(s, p, "ability_lightning", true, 11000), true);
  assert.equal(s.moveBuck, 404);
  assert.equal(s.moveBuckT, 11000);
});

test("un gel bloque tout mouvement et un ralentissement reduit la vitesse", () => {
  const s = state(), p = profile();
  s.freezeUntil = 15000; s.moveBuck = 10000;
  assert.equal(move(s, p, 1, 0, 11000).accepted, false);
  assert.equal(s.moveBuck, 0);
  s.freezeUntil = 0; s.slowPct = 80; s.slowUntil = 20000;
  assert.ok(Math.abs(movementSpeed(s, p, 11000) - 80) < 1e-9);
  assert.equal(move(s, p, 80, 0, 12000).accepted, true);
});

test("Tartarus Plus permet OFF immediatement mais garde dix secondes avant ON", () => {
  const s = state(), p = profile("tartarus_plus"), key = "ability_tartarus-plus_speed-boost-plus";
  assert.equal(useMovementAbility(s, p, key, true, 10000), true);
  assert.equal(useMovementAbility(s, p, key, false, 10001), true);
  assert.equal(useMovementAbility(s, p, key, true, 10002), false);
  assert.equal(useMovementAbility(s, p, key, true, 20001), true);
});

test("annulation et changement de coque coupent le boost sans effacer la recharge", () => {
  const s = state(), p = profile("lightning");
  useMovementAbility(s, p, "ability_lightning", true, 10000);
  stopMovementAbility(s, p, 11000);
  assert.equal(movementSpeed(s, p, 11000), 400);
  assert.equal(useMovementAbility(s, p, "ability_lightning", true, 11001), false);
  useMovementAbility(s, p, "ability_lightning", true, 80000);
  syncMovementAbility(s, profile(), 81000);
  assert.deepEqual(s._moveEffects || {}, {});
});

test("un paquet retarde garde le credit gagne avant la coupure d'un bonus", () => {
  const s = state(), p = profile("tartarus_plus"), key = "ability_tartarus-plus_speed-boost-plus";
  useMovementAbility(s, p, key, true, 10000);
  assert.equal(useMovementAbility(s, p, key, false, 12000), true);
  // OFF arrive avant la position calculee durant les deux secondes de boost.
  assert.equal(move(s, p, 1160, 0, 12000).accepted, true);
  assert.equal(movementSpeed(s, p, 12000), 400);
  assert.equal(move(s, p, 1560, 0, 13000).accepted, true);
  assert.equal(move(s, p, 2140, 0, 14000).accepted, false, "l'ancien bonus ne continue pas a remplir le budget");
});

test("la poursuite Keres ne perd pas son bonus si la cible reste mobile", () => {
  const s = state(), p = profile("keres");
  const target = { id: "npc", hp: 100, x: 3000, y: 0 };
  useMovementAbility(s, p, "ability_keres_sle", true, 10000, target, "npc");
  for (let i = 1; i <= 160; i++) {
    target.x += 2000;
    const now = 10000 + i * 1000;
    syncMovementAbility(s, p, now, target);
    const result = takeMovement(s, p, s.x + 2000, 0, now, target);
    assert.equal(result.accepted, true);
    s.x = result.x;
    assert.equal(movementSpeed(s, p, now), 2000);
  }
  target.hp = 0;
  syncMovementAbility(s, p, 170001, target);
  assert.equal(movementSpeed(s, p, 170001), 400);
  assert.equal(useMovementAbility(s, p, "ability_keres_sle", true, 170002, { ...target, hp: 100 }, "npc"), false);
});

// Comparer aux vrais multiplicateurs du moteur client, y compris les variantes
// Plus, avec des positions arrondies et des arrivees reseau irregulieres.
for (const [ship, key, field, duration, toggle] of [
  ["lightning", "ability_lightning", "lightT", 10],
  ["citadel", "ability_citadel_travel", "travelT", 5],
  ["citadel_plus", "ability_citadel-plus_travel", "travelT", 5],
  ["holo", "ability_holo_self-reversal", "holoSelfT", 15],
  ["retiarus", "ability_retiarus_spc", "spcT", 10],
  ["retiarus_plus", "ability_retiarus-plus_spcp", "spcPlusT", 10],
  ["pusat_plus", "ability_pusat-plus_speed-sap", "sapT", 10],
  ["solace_plus", "ability_solace-plus_nano-cluster-repairer-plus", "solBoostT", 1],
  ["tartarus", "ability_tartarus_speed-boost", "tartBoostOn", Infinity, true],
  ["tartarus_plus", "ability_tartarus-plus_speed-boost-plus", "tartPlusBoostOn", Infinity, true],
  ["mimesis", "ability_mimesis_scramble", "scrambleT", Infinity],
  ["keres", "ability_keres_sle", "sleightT", Infinity],
]) {
  test(`${ship} : deplacement natif accepte avec son aptitude, meme en rafale`, () => {
    const s = state(), p = profile(ship), target = { id: "npc", hp: 100, x: 1000, y: 0 };
    assert.equal(useMovementAbility(s, p, key, true, 10000, target, "npc"), true);
    const native = { [field]: toggle ? true : 1 };
    assert.equal(movementSpeed(s, p, 10001), p.speed * playerSlowMult(native));
    let x = 0;
    // Jitter de 30 ms, suivi de rafales de paquets conservant leur ordre.
    const jitter = [30, 0, 0, 20, 0];
    for (let i = 1; i <= 400; i++) {
      const elapsed = i * 50;
      native[field] = elapsed < duration * 1000 ? (toggle ? true : 1) : (toggle ? false : 0);
      x += p.speed * playerSlowMult(native) * 0.05;
      target.x = x + 1000;
      const now = 10000 + elapsed + jitter[i % jitter.length];
      syncMovementAbility(s, p, now, target);
      const result = takeMovement(s, p, Math.round(x), 0, now, target);
      assert.equal(result.accepted, true, `paquet ${i}`);
      s.x = result.x;
    }
    assert.equal(s.teleWarn || 0, 0);
  });
}

test("Mimesis exige un bouclier et se coupe lors d'un changement de configuration", () => {
  const s = state(), p = profile("mimesis"), key = "ability_mimesis_scramble";
  s.sh = 0;
  assert.equal(useMovementAbility(s, p, key, true, 10000), false);
  s.sh = 100;
  assert.equal(useMovementAbility(s, p, key, true, 10000), true);
  syncMovementAbility(s, { ...p, config: 2 }, 10001);
  assert.deepEqual(s._moveEffects || {}, {});
  assert.equal(useMovementAbility(s, p, key, true, 10002), false);
});

test("Keres exige une cible reelle et son dash doit la rejoindre", () => {
  const s = state(), p = profile("keres"), key = "ability_keres_sle";
  const target = { id: "npc", hp: 100, x: 3000, y: 0 };
  assert.equal(useMovementAbility(s, p, key, true, 10000), false);
  assert.equal(useMovementAbility(s, p, key, true, 10000, target, "npc"), true);
  assert.equal(takeMovement(s, p, 0, 200, 10100, target).accepted, false);
  assert.equal(takeMovement(s, p, 200, 0, 10100, target).accepted, true);
  target.hp = 0;
  syncMovementAbility(s, p, 10101, target);
  assert.deepEqual(s._moveEffects || {}, {});
});

test("la teleportation Mimesis est choisie par le serveur et respecte son cooldown et les cartes", () => {
  const s = { ...state(), x: 1000, y: 1000 }, p = profile("mimesis"), world = { w: 5000, h: 5000 };
  assert.equal(usePhaseOut(s, profile(), "1-1", world, 10000), null);
  for (const map of ["low", "uba", "5-2", "alpha", "qz"]) assert.equal(usePhaseOut(s, p, map, world, 10000), null);
  assert.deepEqual(usePhaseOut(s, p, "1-1", world, 10000, () => 0), { x: 1500, y: 1000 });
  assert.equal(usePhaseOut(s, p, "1-1", world, 10001), null);
  const next = usePhaseOut(s, p, "1-1", world, 310000, () => 0.5);
  assert.equal(next.x, 500);
  assert.ok(Math.abs(next.y - 1000) < 1e-9);
});

test("police : tous ses boosts de mouvement sont acceptés (pas de rollback)", () => {
  const p = profile("police");
  for (const key of ["ability_tartarus_speed-boost", "ability_citadel_travel",
    "ability_lightning", "ability_keres_sle"]) {
    const s = state();
    const target = { id: "npc", hp: 100, x: 2000, y: 0 };
    assert.equal(useMovementAbility(s, p, key, true, 10000, target, "npc"), true, key);
  }
});

test("cumul : toggle tartarus + voyage multiplient (pas de refus)", () => {
  const s = state(), p = profile("police");
  assert.equal(useMovementAbility(s, p, "ability_tartarus_speed-boost", true, 10000), true);
  assert.equal(useMovementAbility(s, p, "ability_citadel_travel", true, 10010), true);
  assert.equal(movementSpeed(s, p, 10020), Math.floor(400 * 1.3 * 2));
  // Couper l'un garde l'autre.
  assert.equal(useMovementAbility(s, p, "ability_tartarus_speed-boost", false, 10030), true);
  assert.equal(movementSpeed(s, p, 10040), 800);
  assert.equal(movementSpeed(s, p, 20000), 400);
});

test("dash keres : 20 pas soutenus sans rejet (pas de rollback)", () => {
  const s = state(), p = profile("keres");
  const target = { id: "npc", hp: 100, x: 3000, y: 0 };
  assert.equal(useMovementAbility(s, p, "ability_keres_sle", true, 10000, target, "npc"), true);
  let rej = 0;
  let x = 0;
  for (let i = 1; i <= 20; i++) {
    const now = 10000 + i * 50;
    target.x = x + 1500;
    syncMovementAbility(s, p, now, target);
    // x5 réel : 400 * 5 * 0.05 = 100 / pos.
    const r = takeMovement(s, p, x + 100, 0, now, target);
    if (r.accepted) x = r.x; else rej++;
    s.x = x;
  }
  assert.equal(rej, 0, `${rej} rejets sur 20 pas de dash`);
  assert.equal(s.teleWarn || 0, 0);
});

test("grâce d'activation : positions en vol avant traitement serveur acceptées", () => {
  const s = state(), p = profile("citadel");
  let t = 0;
  for (let i = 1; i <= 40; i++) { t = i * 50; const r = takeMovement(s, p, i * 20, 0, t, null); if (r.accepted) s.x = r.x; }
  // 2 positions boostées avant que le serveur ne traite le skillUse (+120 ms).
  assert.equal(takeMovement(s, p, s.x + 40, 0, 2050, null).accepted, true);
  const r2 = takeMovement(s, p, s.x + 40, 0, 2100, null);
  if (r2.accepted) s.x = r2.x;
  assert.equal(useMovementAbility(s, p, "ability_citadel_travel", true, 2120), true);
  for (let i = 43; i <= 52; i++) {
    const now = i * 50;
    const r = takeMovement(s, p, s.x + 40, 0, now, null);
    assert.equal(r.accepted, true, `pos ${now}`);
    s.x = r.x;
  }
  // 800 (base) + 40 (2e pos en vol avancée) + 400 (boost) : aucun rollback.
  assert.equal(Math.round(s.x), 40 * 20 + 1 * 40 + 10 * 40);
});
