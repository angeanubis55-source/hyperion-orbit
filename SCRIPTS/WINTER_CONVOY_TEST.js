import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  WINTER_CONVOY_DURATION, WINTER_CONVOY_HP, WINTER_CONVOY_LEG, WINTER_CONVOY_LOOP_POINTS,
  WINTER_CONVOY_REWARD, WINTER_CONVOY_SPAWN_DISTANCE, WINTER_CONVOY_SPEED, WINTER_CONVOY_SWAY,
  WINTER_CONVOY_WAVE_ADDS, WINTER_CONVOY_WAVE_GROWTH_MAX, WINTER_CONVOY_WORLD, WINTER_CONVOY_ID, WINTER_GATE_ENTRY_MS, WINTER_GATE_OPEN_MINUTE,
  createWinterConvoyRoute, newWinterConvoySeed, winterConvoyReward, winterConvoySpawnPoint, winterConvoyWave,
  winterGateArrival, winterGateSession, winterGateShares,
} from "../SRC/CORE/WINTER_CONVOY.js";
import { ZoneNpcSim } from "./NPC_ROOM.js";
import { selectNpcCombatTarget } from "../NPC/NPC_COMBAT.js";
import { computeNpcKiteMove, NPC_DIRECT_SPEED_FACTOR, NPC_KITE } from "../NPC/NPC_AI.js";
import { applyNpcSeparation } from "../NPC/NPC_MOVEMENT.js";
import { NPC_TYPES, WINTER_CONVOY_NPC_BASES } from "../NPC/NPC_TYPES.js";
import { resolveNpcReward } from "../NPC/NPC_BALANCE.js";
import { getNpcCargoOres } from "../NPC/NPC_CARGO.js";
import { WORLD } from "../MAPS/WINTER_MAP/WORLD.js";
import { normalizeMapId } from "../SRC/CORE/MAP_REGISTRY.js";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const engine = read("../SRC/CORE/ORBIT_ENGINE.js");
const server = read("./MULTI_SERVER.js");
const npcRoom = read("./NPC_ROOM.js");
const mapRules = read("./MAP_RULES.js");
// Graines fixes (reproductibles) + quelques graines tirées au hasard.
const SEEDS = [1, 42, 123456, 2147483647, ...Array.from({ length: 6 }, () => newWinterConvoySeed())];

test("Convoi : map WINTER partagée (zone), survie de 30 minutes", () => {
  assert.equal(normalizeMapId("winter"), "winter");
  assert.deepEqual([WORLD.w, WORLD.h], [WINTER_CONVOY_WORLD.w, WINTER_CONVOY_WORLD.h]);
  const map = read("../MAPS/WINTER_MAP/MAP.js");
  assert.match(map, /mode: "zone"/);
  assert.match(map, /convoy: true/);
  assert.equal(WINTER_CONVOY_DURATION, 30 * 60);
  assert.equal(WINTER_CONVOY_HP, 450000000);
});

test("Convoi : circuit différent à chaque GG, identique pour une même graine", () => {
  assert.deepEqual(createWinterConvoyRoute(42).points, createWinterConvoyRoute(42).points);
  const firsts = new Set(SEEDS.map((seed) => JSON.stringify(createWinterConvoyRoute(seed).points[0])));
  assert.ok(firsts.size > 1);
});

for (const seed of SEEDS) {
  test(`Convoi (graine ${seed}) : circuit fermé sans fin, ondulé, sans saut, dans la map`, () => {
    const route = createWinterConvoyRoute(seed);
    assert.equal(route.points.length, WINTER_CONVOY_LOOP_POINTS);
    // Tours sans fin : un tour plus loin = même position, aucun saut au bouclage.
    for (const d of [0, 1234, route.length / 2]) {
      const a = route.pointAt(d), b = route.pointAt(d + route.length);
      assert.ok(Math.hypot(a.x - b.x, a.y - b.y) < 1e-6);
    }
    let prev = route.pointAt(0), maxStep = 0, maxSway = 0;
    for (let d = 10; d <= route.length * 1.2; d += 10) {
      const p = route.pointAt(d);
      assert.ok(p.x > 0 && p.x < WORLD.w && p.y > 0 && p.y < WORLD.h, `hors map à ${d}`);
      maxStep = Math.max(maxStep, Math.hypot(p.x - prev.x, p.y - prev.y));
      prev = p;
    }
    // Pas de saut : 10 px de circuit = au plus ~13 px de déplacement.
    assert.ok(maxStep < 14, `saut de ${maxStep}`);
    // Il ondule vraiment (écart à la ligne droite du 1er segment).
    const a = route.points[0], b = route.points[1];
    const segLen = Math.hypot(b.x - a.x, b.y - a.y);
    for (let d = 0; d <= segLen; d += 50) {
      const p = route.pointAt(d);
      maxSway = Math.max(maxSway, Math.abs((b.x - a.x) * (a.y - p.y) - (a.x - p.x) * (b.y - a.y)) / segLen);
    }
    assert.ok(maxSway > WINTER_CONVOY_SWAY * 0.9 && maxSway <= WINTER_CONVOY_SWAY + 1, `ondulation ${maxSway}`);
  });
}

test("Convoi : vagues de plus en plus nombreuses et grosses", () => {
  const durability = (types) => types.reduce((sum, type) => sum + NPC_TYPES[type].hp + NPC_TYPES[type].shield, 0);
  // Début : 12 Kristallin.
  assert.deepEqual(winterConvoyWave(0), Array(12).fill("npc_Convoy_Kristallin"));
  let prev = 0, prevCount = 0;
  for (let i = 0; i < WINTER_CONVOY_WAVE_ADDS.length + WINTER_CONVOY_WAVE_GROWTH_MAX + 3; i++) {
    const wave = winterConvoyWave(i);
    assert.ok(wave.length > 0 && wave.length <= 120, `taille vague ${i + 1}`);
    // Cumulative : contient toute la vague précédente.
    if (i > 0) {
      const left = [...wave];
      for (const type of winterConvoyWave(i - 1)) {
        const at = left.indexOf(type);
        assert.ok(at >= 0, `vague ${i + 1} garde ${type}`);
        left.splice(at, 1);
      }
    }
    for (const type of wave) {
      assert.ok(NPC_TYPES[type], type);
    }
    // Chaque vague est au moins aussi solide que la précédente.
    const d = durability(wave);
    assert.ok(d >= prev, `crescendo vague ${i + 1}`);
    prev = d;
    // De plus en plus de NPC sur la durée (jamais beaucoup moins).
    assert.ok(wave.length >= prevCount - 3, `nombre vague ${i + 1}`);
    prevCount = Math.max(prevCount, wave.length);
  }
  // Au-delà de la dernière : plafonnée (plus de croissance infinie).
  const cap = WINTER_CONVOY_WAVE_ADDS.length - 1 + WINTER_CONVOY_WAVE_GROWTH_MAX;
  assert.deepEqual(winterConvoyWave(cap + 10), winterConvoyWave(cap));
  // Étape : le convoi roule un moment entre deux vagues.
  assert.ok(WINTER_CONVOY_LEG / WINTER_CONVOY_SPEED >= 20);
});

test("Convoi : les NPC apparaissent autour du convoi, hors écran, dans la map", () => {
  const [d0, d1] = WINTER_CONVOY_SPAWN_DISTANCE;
  for (const [x, y] of [[15000, 6000], [2000, 2000], [28000, 10000]]) {
    for (let i = 0; i < 50; i++) {
      const p = winterConvoySpawnPoint(x, y);
      assert.ok(p.x >= 0 && p.x <= WORLD.w && p.y >= 0 && p.y <= WORLD.h);
      if (x === 15000) {
        const d = Math.hypot(p.x - x, p.y - y);
        assert.ok(d >= d0 - 1 && d <= d1 + 1, `distance ${d}`);
      }
    }
  }
});

test("Convoi : récompense proportionnelle à la vie restante", () => {
  assert.deepEqual(winterConvoyReward(1), { ...WINTER_CONVOY_REWARD });
  assert.deepEqual(winterConvoyReward(0.5), Object.fromEntries(Object.entries(WINTER_CONVOY_REWARD).map(([k, v]) => [k, Math.floor(v / 2)])));
  assert.deepEqual(winterConvoyReward(0), Object.fromEntries(Object.keys(WINTER_CONVOY_REWARD).map((k) => [k, 0])));
  assert.deepEqual(winterConvoyReward(2), winterConvoyReward(1));
});

test("Convoi : les NPC visent le convoi plutôt que le joueur", () => {
  const player = { x: 0, y: 0, hp: 1 };
  const convoy = { id: "winter_convoy", convoy: true, x: 900, y: 900, hp: 10 };
  const npc = { x: 10, y: 10 };
  assert.equal(selectNpcCombatTarget(npc, player, [convoy]), convoy);
  assert.equal(npc._combatTargetId, "winter_convoy");
  // Draw Fire (provocation) reste prioritaire.
  assert.equal(selectNpcCombatTarget({ ...npc, drawFireLock: true }, player, [convoy]), player);
  // Convoi détruit (ou hors GG d'hiver) : le joueur, comme avant.
  assert.equal(selectNpcCombatTarget(npc, player, [{ ...convoy, hp: 0 }]), player);
  assert.equal(selectNpcCombatTarget(npc, player, []), player);
});

test("Convoi : kiting à portée (distance tenue, tourne un peu, change de sens)", () => {
  const convoy = { x: 0, y: 0, vx: 0, vy: 0 };
  const fixed = () => 0.5;
  // Pile à la distance voulue (80 % de la portée) : surtout tangentiel, mais
  // pas une orbite pleine (tourne "un peu").
  const ai = { kite: { dir: 1, flipT: 99, phase: 0 } };
  const at = computeNpcKiteMove({ x: 800, y: 0 }, convoy, 1000, ai, 0, 300, fixed);
  assert.ok(Math.abs(at.mxv) < 1e-9);
  assert.ok(Math.abs(Math.abs(at.myv) - NPC_KITE.tangent) < 1e-9);
  // Trop près : recule (kiting) ; trop loin : revient.
  assert.ok(computeNpcKiteMove({ x: 200, y: 0 }, convoy, 1000, { kite: { dir: 1, flipT: 99, phase: 0 } }, 0, 300, fixed).mxv > 0);
  assert.ok(computeNpcKiteMove({ x: 3000, y: 0 }, convoy, 1000, { kite: { dir: 1, flipT: 99, phase: 0 } }, 0, 300, fixed).mxv < 0);
  // Change de sens au bout du délai (selon le tirage).
  const flip = { kite: { dir: 1, flipT: 0.1, phase: 0 } };
  computeNpcKiteMove({ x: 800, y: 0 }, convoy, 1000, flip, 0.2, 300, () => 0);
  assert.equal(flip.kite.dir, -1);
  assert.ok(flip.kite.flipT >= NPC_KITE.flipEvery[0]);
  // Convoi en mouvement : sa vitesse est ajoutée (il ne le laisse pas filer).
  const still = computeNpcKiteMove({ x: 0, y: -800 }, convoy, 1000, { kite: { dir: 1, flipT: 99, phase: 0 } }, 0, 250, fixed);
  const moving = computeNpcKiteMove({ x: 0, y: -800 }, { ...convoy, vx: 100 }, 1000, { kite: { dir: 1, flipT: 99, phase: 0 } }, 0, 250, fixed);
  assert.ok(Math.abs((moving.mxv - still.mxv) - 100 / (250 * NPC_DIRECT_SPEED_FACTOR)) < 1e-9);
  assert.ok(Math.hypot(moving.mxv, moving.myv) <= 1 + 1e-9);
  // Serveur : les attaquants kitent autour du convoi partagé.
  assert.match(npcRoom, /computeNpcKiteMove\(e, c, range, e\.ai \|\| \(e\.ai = \{\}\), dt, e\.speed\)/);
});

test("Convoi : Mimesis aux stats officielles (wiki), hors du convoi", () => {
  // [PV, bouclier, dégâts max, crédits, EXP, honneur] (darkorbitwiki.com).
  const wiki = {
    npc_Hexor_Mimesis: [495000, 200000, 6500, 128000, 25600, 128],
    npc_Terror_Mimesis: [3000000, 1800000, 65000, 2048000, 409600, 2048],
    npc_Reflector_Mimesis: [4500000, 2500000, 50000, 4096000, 819200, 4096],
    npc_Marker_Mimesis: [6750000, 4500000, 30000, 4096000, 819200, 4096],
  };
  for (const [type, [hp, shield, dmg, credits, exp, honor]] of Object.entries(wiki)) {
    const npc = NPC_TYPES[type];
    assert.deepEqual([npc.hp, npc.shield, npc.bulletDmg], [hp, shield, dmg], type);
    assert.deepEqual(resolveNpcReward(type), { credits, exp, honor }, type);
  }
  const used = new Set(WINTER_CONVOY_WAVE_ADDS.flatMap((adds) => adds.map(([type]) => type)));
  assert.ok(![...used].some((type) => /Mimesis/.test(type)));
  assert.ok(!Object.keys(NPC_TYPES).some((type) => /^npc_(Xmas|Frost)_/.test(type)));
});

test("Convoi : attaquants <=< Kristallin >=> & co (stats, récompenses, soute de la base)", () => {
  const expected = {
    npc_Convoy_Kristallin: "<=< Kristallin >=>",
    npc_Convoy_Boss_Kristallin: "<=< Boss Kristallin >=>",
    npc_Convoy_Kristallon: "<=< Kristallon >=>",
    npc_Convoy_Boss_Kristallon: "<=< Boss Kristallon >=>",
    npc_Convoy_Ice_Meteoroid: "<=< Ice Meteoroid >=>",
    npc_Convoy_Super_Ice_Meteoroid: "<=< Super Ice Meteoroid >=>",
    npc_Convoy_Uber_Kristallin: "<=< Uber Kristallin >=>",
    npc_Convoy_Uber_Kristallon: "<=< Uber Kristallon >=>",
    npc_Convoy_Emperor_Kristallon: "<=< Emperor Kristallon >=>",
  };
  assert.deepEqual(Object.keys(WINTER_CONVOY_NPC_BASES).sort(), Object.keys(expected).sort());
  for (const [type, name] of Object.entries(expected)) {
    const npc = NPC_TYPES[type], base = NPC_TYPES[WINTER_CONVOY_NPC_BASES[type]];
    assert.equal(npc.name, name);
    for (const k of ["hp", "shield", "speed", "shootRange", "value", "exp", "honor"]) if (!(k === "speed" && type === "npc_Convoy_Emperor_Kristallon")) assert.equal(npc[k], base[k], `${type}.${k}`);
    if (!/Ice_Meteoroid/.test(type)) assert.equal(npc.bulletDmg, base.bulletDmg, type);
    assert.equal(npc.sprite.path, base.sprite.path);
    assert.deepEqual(resolveNpcReward(type), resolveNpcReward(WINTER_CONVOY_NPC_BASES[type]));
    assert.deepEqual(getNpcCargoOres(type), getNpcCargoOres(WINTER_CONVOY_NPC_BASES[type]));
    assert.equal(npc.onKill, undefined, type);
    assert.ok(npc.speed > WINTER_CONVOY_SPEED, type);
  }
  assert.equal(NPC_TYPES.npc_Convoy_Ice_Meteoroid.bulletDmg, 25000);
  assert.equal(NPC_TYPES.npc_Convoy_Super_Ice_Meteoroid.bulletDmg, 75000);
  // Toutes les vagues n'utilisent que ces variantes + l'Icy.
  const used = new Set(WINTER_CONVOY_WAVE_ADDS.flatMap((adds) => adds.map(([type]) => type)));
  assert.deepEqual([...used].sort(), [...Object.keys(expected), "npc_Meteoroid_Icy"].sort());
});

test("Convoi : les attaquants se traversent (aucune collision entre eux)", () => {
  const world = { w: 10000, h: 10000 };
  const a = { x: 500, y: 500, r: 18, passThrough: true }, b = { x: 505, y: 500, r: 18, passThrough: true };
  applyNpcSeparation([a, b], 1, world);
  assert.deepEqual([a.x, b.x], [500, 505]);
  assert.match(npcRoom, /if \(a\.convoyAttacker === true \|\| b\.convoyAttacker === true\) return;/);
  // Plus de tirs façon joueur ni de filtre blanc (Mimesis de Noël retirés).
  assert.doesNotMatch(engine, /fauxVisualOnly|_playerSprite|cfg\.spriteFilter/);
});

test("Session : entrée de :00 à :05, départ commun à :05, 30 minutes, même circuit pour tous", () => {
  // Ouverture de la session (minute WINTER_GATE_OPEN_MINUTE de l'heure).
  const hour = Date.UTC(2026, 11, 20, 14, 0, 0) + WINTER_GATE_OPEN_MINUTE * 60000;
  const at = (min, sec = 0) => winterGateSession(hour + min * 60000 + sec * 1000);
  assert.equal(WINTER_GATE_ENTRY_MS, 5 * 60 * 1000);
  assert.ok(at(0).open && at(4, 59).open);
  assert.ok(!at(5).open && !at(30).open && !at(59, 59).open);
  assert.equal(at(0).startAt, hour + 5 * 60000);
  assert.equal(at(0).endAt, hour + 35 * 60000);
  assert.equal(at(30).nextOpenAt, hour + 60 * 60000);
  // Même session = même graine (même circuit) ; heure suivante = autre circuit.
  assert.equal(at(0).seed, at(4, 59).seed);
  assert.notEqual(at(0).seed, winterGateSession(hour + 3600000).seed);
  // Arrivée : dans la map, juste derrière le convoi au départ.
  const p = createWinterConvoyRoute(at(0).seed).pointAt(0);
  const a = winterGateArrival(hour);
  assert.ok(a.x >= 400 && a.x <= WINTER_CONVOY_WORLD.w - 400 && a.y >= 400 && a.y <= WINTER_CONVOY_WORLD.h - 400);
  assert.ok(Math.hypot(a.x - p.x, a.y - p.y) <= 501);
});

test("Récompense : partagée selon les dégâts infligés aux attaquants", () => {
  const shares = winterGateShares([["u_a", 300], ["u_b", 100], ["u_c", 0]], 1);
  assert.deepEqual(shares.map(([id, share]) => [id, share]), [["u_a", 0.75], ["u_b", 0.25]]);
  assert.equal(shares[0][2].credits, Math.floor(WINTER_CONVOY_REWARD.credits * 0.75));
  for (const key of Object.keys(WINTER_CONVOY_REWARD)) {
    assert.ok(shares.reduce((sum, [, , r]) => sum + r[key], 0) <= WINTER_CONVOY_REWARD[key]);
  }
  // Vie restante : la cagnotte baisse d'autant.
  assert.equal(winterGateShares([["u_a", 1]], 0.5)[0][2].credits, Math.floor(WINTER_CONVOY_REWARD.credits / 2));
  assert.deepEqual(winterGateShares([], 1), []);
});

test("Serveur : les attaquants visent le convoi, jamais les joueurs", async () => {
  const sim = await ZoneNpcSim.create("winter");
  assert.ok(sim, "simulation NPC de la GG d'hiver");
  assert.equal(sim.camps.length, 0);
  const convoy = { x: 15000, y: 6000, vx: 0, vy: 0, angle: 0, hp: 1e9, hpMax: 1e9 };
  sim.convoy = convoy;
  sim.setPlayer("u_1", 15000, 6100, {});
  sim.spawnConvoyAttackers(Array(6).fill("npc_Convoy_Kristallin"));
  assert.equal(sim.convoyAttackersAlive(), 6);
  for (let i = 0; i < 600; i++) sim.tick(0.1);
  assert.ok(convoy.hp < 1e9, "le convoi a pris des dégâts");
  assert.equal(sim.playerHits.length, 0, "aucun tir sur le joueur");
  const snap = sim.snapshot();
  assert.ok(snap.list.length === 6 && snap.list.every((e) => e.aggro === WINTER_CONVOY_ID));
  // Dégâts des joueurs comptés pour le partage.
  const dmg = new Map();
  sim.onConvoyDamage = (pid, d) => dmg.set(pid, (dmg.get(pid) || 0) + d);
  sim.applyHit("u_1", { uid: snap.list[0].uid, dmg: 1000 });
  assert.ok(dmg.get("u_1") > 0);
  sim.clearConvoyAttackers();
  assert.equal(sim.convoyAttackersAlive(), 0);
});

test("Convoi : branché (serveur : session, PvP coupé ; client : affichage de l'état serveur)", () => {
  // Serveur : contrôleur sur la room "winter", état aux arrivants, plus d'instance.
  assert.match(server, /if \(key === "winter"\) \{[\s\S]{0,200}?tickWinterGate\(room, winterSim,/);
  assert.match(server, /if \(nextMap === "winter"\) \{\s+try \{ ws\.send\(JSON\.stringify\(getWinterGateState\(\)\)\); \} catch \{\}/);
  assert.equal((server.match(/if \(mapId === "winter"\) return;/g) || []).length, 2, "pvpHit + pvpPetHit");
  assert.match(server, /=== "winter" && !sim\?\.entries\?\.has\(String\(sourceId\)\)\) \{\s+return \{ total: 0, hp: 0, sh: 0, bypass: 0 \};/);
  assert.match(mapRules, /if \(toMap === "winter" && !winterGateEntryOpen\(now\)\) return null;/);
  assert.match(mapRules, /toMap === "winter" \? \{ \.\.\.winterGateArrival\(now\), radius: 1500 \}/);
  assert.match(mapRules, /if \(fromMap === "winter" && toMap === respawnMap\(faction, fromMap\)/);
  // Client : convoi = escorte réseau, tirs visuels, sortie / récompense.
  assert.match(engine, /if \(rules\?\.convoy\) startWinterConvoy\(\);/);
  assert.match(engine, /tickWinterConvoy\(dt\);/);
  assert.match(engine, /drawWinterConvoy\(ox, oy\);/);
  assert.match(engine, /escortShips\.push\(esc\);/);
  assert.match(engine, /_netConvoy: true,/);
  assert.match(engine, /for \(let i = 0; i < sp\.frames; i\+\+\) loadImage\(/);
  assert.match(engine, /sh: 0,\s+shMax: 0,/);
  assert.match(engine, /ctx\.fillText\(`Convoi du Père Noël — \$\{winterConvoyTimeLeft\(\)\}`, sx, by - 12\);/);
  assert.match(engine, /if \(String\(aggro\) === WINTER_CONVOY_ID\) return winterConvoy\?\.esc\?\.hp > 0 \? winterConvoy\.esc : null;/);
  assert.match(engine, /else if \(bulletTarget\._netConvoy !== true\) \{/);
  assert.match(engine, /completeSpecialGate: \{ gateId: "winter", name: "Convoi d'hiver", reward: won\.reward \}/);
  assert.match(engine, /leaveWinterGate\("Le convoi a été détruit — GG d'hiver ratée"\);/);
  assert.match(engine, /if \(!session\.open\) \{\s+SFX\.play\("swDeny"\);/);
  assert.match(engine, /if \(\(t\._netPlayer \|\| t\._netPet\) && rules\?\.convoy === true\) \{/);
  assert.match(engine, /"rgba\(255,80,100,0\.95\)", \{ text: DMG_FMT\.format\(dmg\), size: 21/);
  // Divers : bot coupé, attaquants visibles en minimap.
  assert.match(engine, /Bot\.status = "Indisponible dans la GG d'hiver";/);
  assert.match(engine, /rules\?\.convoy === true \|\| shouldDetectNpc/);
  // Plus de simulation locale du convoi.
  assert.doesNotMatch(engine, /WINTER_CONVOY_STORAGE|spawnWinterConvoyAttackers|startWinterConvoyLeg|_convoyAttacker/);
  assert.doesNotMatch(engine, /ARRIVÉE DU CONVOI|_convoyAmbush|WINTER_CONVOY_AMBUSHES|attaqué !|zoneMaze/);
});
