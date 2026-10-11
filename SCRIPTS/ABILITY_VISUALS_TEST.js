import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, dirname, basename } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { once } from "node:events";
import WebSocket from "ws";
import vm from "node:vm";
import { abilityFxCodeFor, abilityIdForFxCode } from "../SRC/CORE/ABILITY_FX.js";
import { getAbilityInfo } from "../SHIP/SHIP_ABILITIES.js";
import { SHIP_PACKS } from "../SHIP/SHIP_PACKS.js";
import { ShipEngine } from "../SHIP/SHIP_ENGINE_RENDERER.js";

// Exécute les vrais chemins du moteur avec un Canvas instrumenté.
const engine = readFileSync(new URL("../SRC/CORE/ORBIT_ENGINE.js", import.meta.url), "utf8");
const server = readFileSync(new URL("./MULTI_SERVER.js", import.meta.url), "utf8");
function section(source, start, end) {
  const from = source.indexOf(start), to = source.indexOf(end, from);
  assert.ok(from >= 0 && to > from, start);
  return source.slice(from, to);
}
function visuals() {
  let now = 1000;
  const draws = [], sounds = [], halos = [], translations = [], floats = [];
  const image = { complete: true, naturalWidth: 100 };
  const ctx = new Proxy({ globalAlpha: 1 }, { get: (target, key) => key in target ? target[key]
    : key === "translate" ? (...args) => translations.push(args)
    : key === "drawImage" ? (img, ...args) => draws.push({ img, args }) : () => {} });
  const shipEngine = new ShipEngine(async () => image);
  const normalDraws = [];
  shipEngine.draw = (...args) => normalDraws.push(args);
  const remotes = new Map();
  const context = vm.createContext({
    performance: { now: () => now }, Date, Math, ctx, window: {},
    innerWidth: 1000, innerHeight: 800, abilityFxCodeFor, abilityIdForFxCode, getAbilityInfo,
    getNetplayRemotes: () => remotes, netMyId: () => "me", player: { x: 100, y: 100 },
    drainNetSkillInbox: () => [], drainNetSkillDenied: () => [], drainNetShotEvents: () => [],
    playNetSpatialSound: (...args) => sounds.push(args),
    getCachedImage: path => ({ ...image, path }), isImgReady: img => !!img,
    loadImage: () => {}, drawCenteredImage: (ctx, img, w, h) => draws.push({ img, w, h }),
    outlineSilhouette: () => image, strokeOutlineCentered: (...args) => draws.push({ outline: args }),
    netplayPackFor: () => ({ _ready: true, _imgs: [image], frames: 1, w: 170, h: 170 }),
    angleToFrameIndex: () => 0, petLocatorPulse: () => 0.8,
    spawnHaloPulse: (...args) => halos.push(args),
    enemiesById: new Map(), enemies: [],
    REPAIR_POD_FPS: 30, REPAIR_POD_FRAMES: 30, REPAIR_POD_RADIUS: 400, HAMMER_PLUS_POD_RADIUS: 600,
    NEBULA_FPS: 30, NEBULA_FRAMES: 61, NEBULA_RADIUS_FRAMES: 60, NEBULA_DURATION: 10, NEBULA_RADIUS: 500,
    PROTECTION_RADIUS: 1000, RIPPER_RADIUS: 600, TAU: Math.PI * 2,
    Target: { get: () => null }, DMG_FMT: { format: amount => String(amount) },
    addFloatText: (...args) => floats.push(args),
    shipEngine, GAME_SETTINGS: { shipSmoke: true }, ACTIVE_SHIP: null,
    TRAVEL_DURATION: 5, getPlayerSpriteFrame: () => 0,
  });
  vm.runInContext(section(engine, "function showRemoteAbilityHeal(", "function drawNetplayRemotes("), context);
  vm.runInContext(section(engine, "function drawNebulaAt(", "function startHpRepairCooldown("), context);
  vm.runInContext(section(engine, "function drawRepairPodAt(", "const HAMMER_HP_DURATION"), context);
  vm.runInContext(section(engine, "function travelBuffFrame(", "let shipEffectFor ="), context);
  vm.runInContext("function renderRemoteBoost(r, eng, pack, remoteFrame) {\n"
    + section(engine, "      const rBoost = remoteBoostInfo(r);", "      // Les flammes seules") + "\n}", context);
  return { api: context, remotes, draws, sounds, halos, translations, floats, normalDraws, advance: ms => { now += ms; } };
}

test("observateur : annuler un effet l'efface sans flash ni son", () => {
  const v = visuals();
  const r = { id: "caster", afx: [[10, 5, 0, 0, ""], [18, 5, 0, 0, ""]], fxFlash: { code: 10, until: 9000 } };
  v.remotes.set(r.id, r);
  v.api.drainNetSkillInbox = () => [{ by: r.id, skill: "ability_citadel_fortify", enabled: false }];
  v.api.tickNetplayVisuals(0.016);
  assert.equal(r.afx.length, 1);
  assert.equal(r.afx[0][0], 18);
  assert.equal(r.fxFlash, null);
  assert.equal(v.sounds.length, 0);
});

test("observateur : une aptitude ne joue pas le son ISH et garde sa durée pour le premier rendu", () => {
  const v = visuals(), r = { id: "caster", afx: [] };
  v.remotes.set(r.id, r);
  v.api.drainNetSkillInbox = () => [{ by: r.id, skill: "ability_citadel_fortify", at: 10000, until: 15000 }];
  v.api.tickNetplayVisuals(0.016);
  assert.equal(r.fxFlash.sec, 5);
  assert.equal(v.sounds.length, 0);
  v.api.drainNetSkillInbox = () => [{ by: r.id, skill: "ish" }];
  v.api.tickNetplayVisuals(0.016);
  assert.equal(v.sounds[0][0], "ishShield");
});

test("observateur : contour de fortification résolu depuis la coque distante", () => {
  const v = visuals();
  v.api.drawRemoteAbilityFx({ id: "caster", shipId: "citadel", afx: [[10, 5, 0, 0, ""]] });
  assert.equal(v.draws.filter(draw => draw.outline).length, 1);
});

test("observateur : snapshot et flash de Spectrum dessinent une seule aura", () => {
  const v = visuals();
  v.api.drawRemoteAbilityFx({ id: "caster", afx: [[18, 5, 0, 0, ""]], fxFlash: { code: 18, until: 2000 } });
  assert.equal(v.draws.filter(draw => draw.img?.path?.includes("SPECTRUM_PRISMATIC_SHIELDING")).length, 1);
});

test("observateur : un pod reste au point de déploiement avec son halo, même lanceur hors écran", () => {
  const v = visuals(), r = { id: "caster", x: 10000, y: 10000, afx: [[2, 9, 250, 300, ""]] };
  v.remotes.set(r.id, r);
  v.api.drawNetplayAbilityZones(10, 20);
  assert.deepEqual(v.translations[0], [260, 320]);
  assert.equal(v.draws[0].w, 153);
  assert.deepEqual(v.halos[0].slice(0, 3), [250, 300, 400]);
  v.api.drawNetplayAbilityZones(10, 20);
  assert.equal(v.halos.length, 1, "une pulsation par seconde");
  r.afx[0][1] = 8;
  v.api.drawNetplayAbilityZones(10, 20);
  assert.equal(v.halos.length, 2);
});

test("observateur : nébuleuse et miroir utilisent les mêmes sprites que le lanceur", () => {
  const v = visuals();
  v.remotes.set("caster", { x: 10000, y: 10000, afx: [[4, 5, 250, 300, ""]] });
  v.api.drawNetplayAbilityZones(0, 0);
  assert.equal(v.draws.length, 3);
  assert.equal(v.draws[0].img.path, v.draws[1].img.path);
  assert.match(v.draws[2].img.path, /NOXIOUS_NEBULA_RADIUS/);
});

test("observateur : Venom reste visible sur sa cible avec un lanceur hors écran", () => {
  const v = visuals();
  v.remotes.set("caster", { id: "caster", x: 2500, y: 100, afx: [[28, 20, 0, 0, "me"]] });
  v.api.drawNetplayAbilityEffects(0, 0);
  assert.equal(v.draws.length, 1);
  assert.match(v.draws[0].img.path, /VENOM_SINGULARITY/);
});

test("observateur : les flammes de boost ne sont pas doublées par le rendu des auras", () => {
  const v = visuals();
  v.api.drawRemoteAbilityFx({ id: "caster", x: 100, y: 100, afx: [[40, 5, 0, 0, ""]] });
  assert.equal(v.draws.length, 0);
});

test("Liberator Plus : l'animation reste visible après le flash initial et jusqu'à la fin du soin", () => {
  const v = visuals(), r = { id: "caster", x: 100, y: 100, afx: [[73, 7, 0, 0, ""]] };
  v.advance(3000); v.api.drawRemoteAbilityFx(r);
  assert.equal(v.draws.length, 1);
  assert.match(v.draws[0].img.path, /HEAL_EFFECT/);
  r.afx[0][1] = 0; v.draws.length = 0;
  v.api.drawRemoteAbilityFx(r);
  assert.equal(v.draws.length, 0);
});

test("Liberator Plus : les +X et +0 apparaissent seulement sur le joueur sélectionné, sans relancer le flash", () => {
  const v = visuals(), r = { id: "caster", x: 100, y: 100, afx: [[73, 7, 0, 0, ""]] };
  v.remotes.set(r.id, r);
  v.api.drainNetSkillInbox = () => [{ by: r.id, skill: "ability_liberator-plus_self-repair", phase: "heal", amount: 35000 }];
  v.api.tickNetplayVisuals(0.016);
  assert.equal(v.floats.length, 0);
  v.api.Target.get = () => ({ _netPlayer: r.id });
  v.api.tickNetplayVisuals(0.016);
  assert.equal(v.floats[0][4].text, "+35000");
  v.api.drainNetSkillInbox = () => [{ by: r.id, skill: "ability_liberator-plus_self-repair", phase: "heal", amount: 0 }];
  v.api.tickNetplayVisuals(0.016);
  assert.equal(v.floats[1][4].text, "+0");
  assert.equal(r.fxFlash, undefined);
  assert.equal(v.sounds.length, 0);
  r.cloaked = true; v.api.tickNetplayVisuals(0.016);
  assert.equal(v.floats.length, 2);
});

test("pod Aegis : le bénéficiaire adopte le soin et voit son +X sans lock ni dégâts PvP", () => {
  const v = visuals();
  Object.assign(v.api.player, { hp: 95000, hpMax: 100000, pvpAt: 0 });
  v.api.drainNetSkillInbox = () => [{ by: "caster", target: "me", skill: "ability_aegis_repair-pod", phase: "heal", amount: 5000 }];
  v.api.tickNetplayVisuals(0.016);
  assert.equal(v.api.player.hp, 100000);
  assert.equal(v.floats.length, 1);
  assert.equal(v.floats[0][4].text, "+5000");
  assert.equal(v.floats[0][3], "rgba(80,255,125,0.98)");
  assert.equal(v.sounds.length, 0);
  v.api.drainNetSkillInbox = () => [{ by: "caster", target: "me", skill: "ability_aegis_repair-pod", phase: "heal", amount: 0 }];
  v.api.tickNetplayVisuals(0.016);
  assert.equal(v.floats[1][4].text, "+0");
  v.api.player.dead = true;
  v.api.tickNetplayVisuals(0.016);
  assert.equal(v.floats.length, 2);
});

test("pod Aegis : le lanceur voit le gain confirmé sur le bénéficiaire sélectionné", () => {
  const v = visuals(), recipient = { id: "recipient", x: 250, y: 250 };
  v.remotes.set(recipient.id, recipient);
  v.api.Target.get = () => ({ _netPlayer: recipient.id });
  v.api.drainNetSkillInbox = () => [{ by: "me", target: recipient.id, skill: "ability_aegis_repair-pod", phase: "heal", amount: 1000 }];
  v.api.tickNetplayVisuals(0.016);
  assert.equal(v.floats[0][4].text, "+1000");
  v.api.drainNetSkillInbox = () => [{ by: "me", target: recipient.id, skill: "ability_aegis_repair-pod", phase: "heal", amount: 0 }];
  v.api.tickNetplayVisuals(0.016);
  assert.equal(v.floats[1][4].text, "+0");
  assert.equal(recipient.fxFlash, undefined);
});

test("pod Aegis : le lanceur transmet ses +X et +0 uniquement dans le rayon du pod", () => {
  const sent = [], player = { hp: 90000, hpMax: 100000, x: 700, y: 700, podX: 700, podY: 700 };
  const context = vm.createContext({ player, REPAIR_POD_RADIUS: 400, REPAIR_POD_HEAL: 18000,
    dist2: (x, y, ox, oy) => (x - ox) ** 2 + (y - oy) ** 2, escortShips: [],
    sendSkillUse: (...args) => sent.push(args), healPlayerAllies: () => {}, addFloatText: () => {}, DMG_FMT: { format: String } });
  vm.runInContext(section(engine, "function healRepairPodTick(", "function drawDeployedPod("), context);
  context.healRepairPodTick(); context.healRepairPodTick();
  assert.equal(sent[0][0], "ability_aegis_repair-pod");
  assert.equal(sent[0][1].amount, 10000);
  assert.equal(sent[1][1].amount, 0);
  player.x = 1101; context.healRepairPodTick();
  assert.equal(sent.length, 2, "aucun tick sur le lanceur hors du pod");
  player.x = 700; player.tempestBackupT = 1; context.healRepairPodTick();
  assert.equal(sent.length, 2);
});

test("pod Aegis sélectionné : les ticks du lanceur sont visibles avec +X et +0 sans flash doublé", () => {
  const v = visuals(), caster = { id: "caster", x: 700, y: 700 };
  v.remotes.set(caster.id, caster);
  v.api.Target.get = () => ({ _netPlayer: caster.id });
  for (const amount of [18000, 0]) {
    v.api.drainNetSkillInbox = () => [{ by: caster.id, skill: "ability_aegis_repair-pod", phase: "heal", amount, shield: false }];
    v.api.tickNetplayVisuals(0.016);
    assert.equal(v.floats.at(-1)[4].text, `+${amount}`);
    assert.equal(v.floats.at(-1)[3], "rgba(80,255,125,0.98)");
  }
  assert.equal(caster.fxFlash, undefined);
});

test("pod Aegis : tous les membres proches sont demandés, même d'une autre firme, sans soin hors groupe", () => {
  const sent = [], floats = [], remotes = new Map([
    ["ally1", { x: 700, y: 700, firm: "mmo", hpPct: 0.5 }],
    ["ally2", { x: 1099, y: 700, firm: "eic", hpPct: 0.9 }],
    ["full", { x: 700, y: 700, firm: "mmo", hpPct: 1 }],
    ["far", { x: 1101, y: 700, firm: "mmo", hpPct: 0.5 }],
    ["stranger", { x: 700, y: 700, firm: "mmo", hpPct: 0.5 }],
    ["dead", { x: 700, y: 700, firm: "mmo", hpPct: 0.5, dead: true }],
  ]);
  let group = { members: ["me", "ally1", "ally2", "full", "far", "dead"].map(id => ({ id })) };
  const context = vm.createContext({ player: {}, started: true, account: { user: { faction: "mmo" } },
    getNetGroup: () => group, getNetplayRemotes: () => remotes, netMyId: () => "me",
    sendHealAlly: heal => sent.push(heal), addFloatText: (...args) => floats.push(args), DMG_FMT: { format: String } });
  vm.runInContext(section(engine, "function healPlayerAllies(", "function pickHealAlly("), context);
  const tick = () => context.healPlayerAllies("ability_aegis_repair-pod", 18000, false, 700, 700, 400, false);
  tick();
  assert.deepEqual(sent.map(heal => heal.target).sort(), ["ally1", "ally2", "full"]);
  assert.equal(floats.length, 0, "pas de montant prédit avant confirmation serveur");
  group = null; sent.length = 0; tick();
  assert.equal(sent.length, 0, "aucun autre joueur soigné sans groupe");
});

test("Liberator Plus : le tick local transmet le gain réel, plafonné aux PV manquants", () => {
  const sent = [], context = vm.createContext({ player: { hp: 90000, hpMax: 100000 },
    LIBREP_AMOUNT: 35000, DMG_FMT: { format: value => String(value) },
    sendSkillUse: (...args) => sent.push(args), addFloatText: () => {} });
  vm.runInContext(section(engine, "function libRepHealTick(", "function activateLibRep("), context);
  context.libRepHealTick(); context.libRepHealTick();
  assert.equal(context.player.hp, 100000);
  assert.equal(sent[0][1].amount, 10000);
  assert.equal(sent[1][1].amount, 0);
  context.player.tempestBackupT = 1; context.libRepHealTick();
  assert.equal(sent.length, 2);
});

test("Aegis sélectionné : +X et +0 coque verts, bouclier bleus, sans soin ajouté chez l'observateur", () => {
  const v = visuals(), r = { id: "friend", x: 300, y: 300 };
  v.remotes.set(r.id, r);
  Object.assign(v.api.player, { hp: 100, sh: 50 });
  for (const shield of [false, true]) {
    const skill = shield ? "ability_aegis_shield-repair" : "ability_aegis_hp-repair";
    const event = { by: r.id, skill, phase: "heal", amount: shield ? 15000 : 20000, shield };
    v.api.Target.get = () => null;
    v.api.drainNetSkillInbox = () => [event];
    const before = v.floats.length;
    v.api.tickNetplayVisuals(0.016);
    assert.equal(v.floats.length, before, "affichage seulement si l'ami est sélectionné");
    v.api.Target.get = () => ({ _netPlayer: r.id });
    v.api.tickNetplayVisuals(0.016);
    assert.equal(v.floats.at(-1)[4].text, `+${event.amount}`);
    assert.equal(v.floats.at(-1)[3], shield ? "rgba(70,180,255,0.98)" : "rgba(80,255,125,0.98)");
    event.amount = 0; v.api.tickNetplayVisuals(0.016);
    assert.equal(v.floats.at(-1)[4].text, "+0");
  }
  assert.equal(v.api.player.hp, 100);
  assert.equal(v.api.player.sh, 50);
  assert.equal(v.sounds.length, 0);
  assert.equal(r.fxFlash, undefined);
});

test("Aegis : les ticks locaux transmettent les gains réels et +0, sans annoncer un soin d'escorte sur soi", () => {
  const sent = [], player = { hp: 99000, hpMax: 100000, sh: 49000, shMax: 50000 };
  let ally = null;
  const context = vm.createContext({ player, pickHealAlly: () => ally, addFloatText: () => {},
    sendSkillUse: (...args) => sent.push(args), DMG_FMT: { format: String } });
  vm.runInContext(section(engine, "function healAllyOrSelf(", "function drawAegisRepairPod("), context);
  for (const shield of [false, true]) {
    const skill = shield ? "ability_aegis_shield-repair" : "ability_aegis_hp-repair";
    assert.equal(context.healAllyOrSelf(40000, shield ? 15000 : 20000, shield, skill), 1000);
    assert.equal(sent.at(-1)[0], skill);
    assert.equal(sent.at(-1)[1].amount, 1000);
    context.healAllyOrSelf(40000, 20000, shield, skill);
    assert.equal(sent.at(-1)[1].amount, 0);
  }
  player.tempestBackupT = 1;
  context.healAllyOrSelf(40000, 20000, false, "ability_aegis_hp-repair");
  assert.equal(sent.length, 4);
  ally = { hp: 5000, hpMax: 100000 };
  context.healAllyOrSelf(40000, 20000, false, "ability_aegis_hp-repair");
  assert.equal(ally.hp, 45000);
  assert.equal(sent.length, 4);
});

test("Aegis : les gains alliés sont adoptés une seule fois sur la bonne barre, sans dégâts PvP", () => {
  for (const shield of [false, true]) {
    const v = visuals();
    Object.assign(v.api.player, { hp: 50000, hpMax: 100000, sh: 50000, shMax: 100000 });
    v.api.drainNetSkillInbox = () => {
      v.api.drainNetSkillInbox = () => [];
      return [{ by: "caster", target: "me", skill: shield ? "ability_aegis_shield-repair" : "ability_aegis_hp-repair",
        phase: "heal", amount: shield ? 25000 : 40000, shield }];
    };
    v.api.tickNetplayVisuals(0.016); v.api.tickNetplayVisuals(0.016);
    assert.equal(v.api.player.hp, shield ? 50000 : 90000);
    assert.equal(v.api.player.sh, shield ? 75000 : 50000);
    assert.equal(v.floats.length, 1);
  }
});

test("Aegis : relais visuels bornés au cast, cadence, durée et montant, sans modifier les pools", () => {
  const events = [], from = 10000;
  const context = vm.createContext({ HEAL_MIN_INTERVAL_MS: 800, broadcastRoom: (room, raw) => events.push(JSON.parse(raw)) });
  vm.runInContext(section(server, "function relayAbilityHealFx(", "function trackAbilityFx("), context);
  for (const [skill, cap, ticks, shield] of [["ability_aegis_hp-repair", 20000, 7, false], ["ability_aegis_shield-repair", 15000, 5, true], ["ability_aegis_repair-pod", 18000, 10, false]]) {
    const state = { hp: 50000, sh: 10000, x: 700, y: 700, _abilityFx: { [skill]: { from, until: from + ticks * 1000, x: 700, y: 700 } } };
    const relay = (amount, now) => context.relayAbilityHealFx(state, skill, { amount }, new Map(), "caster", now);
    if (skill === "ability_aegis_repair-pod") {
      state.x = 1101;
      assert.equal(relay(cap, from + 1000), false, "pas de tick visuel sur le lanceur hors du pod");
      state.x = 700;
    }
    assert.equal(relay(cap, from + 10), false);
    assert.equal(relay(cap + 1, from + 1000), false);
    assert.equal(relay(cap, from + 1000), true);
    assert.equal(events.at(-1).shield, shield);
    assert.equal(relay(cap, from + 1100), false);
    for (let i = 2; i <= ticks; i++) assert.equal(relay(0, from + i * 1000), true);
    assert.equal(events.at(-1).amount, 0);
    assert.equal(relay(cap, from + (ticks + 1) * 1000), false);
    assert.equal(state.hp, 50000); assert.equal(state.sh, 10000);
    delete state._abilityFx[skill];
    assert.equal(relay(cap, from + (ticks + 1) * 1000), false);
  }
});

test("Liberator Plus : le serveur borne les ticks visuels sans modifier les PV ni la recharge", () => {
  const events = [], skill = "ability_liberator-plus_self-repair", from = 10000;
  const state = { hp: 90000, _abilityFx: { [skill]: { from, until: from + 10000 } }, _abilityCds: { [skill]: 120000 } };
  const context = vm.createContext({ HEAL_MIN_INTERVAL_MS: 800, broadcastRoom: (room, raw) => events.push(JSON.parse(raw)) });
  vm.runInContext(section(server, "function relayAbilityHealFx(", "function trackAbilityFx("), context);
  const relay = (amount, now, key = skill) => context.relayAbilityHealFx(state, key, { amount }, new Map(), "caster", now);
  assert.equal(relay(35000, from + 10), false, "pas de tick immédiat au cast");
  assert.equal(relay(35001, from + 1000), false);
  assert.equal(relay(0, from + 1000), true);
  assert.equal(relay(35000, from + 1050), false, "pas de doublon du tick");
  for (let tick = 2; tick <= 10; tick++) assert.equal(relay(35000, from + tick * 1000), true);
  assert.equal(relay(35000, from + 11000), false, "maximum dix ticks");
  assert.equal(events.length, 10);
  assert.equal(state.hp, 90000);
  assert.equal(state._abilityCds[skill], 120000);
  delete state._abilityFx[skill];
  assert.equal(relay(35000, from + 12000), false);
});

test("serveur : les auras ciblant un NPC vivant passent le filtre du snapshot", () => {
  const now = 10000, fx = [[28, 20, 0, 0, "npc_alive"], [28, 20, 0, 0, "npc_dead"],
    [28, 20, 0, 0, "peer"], [28, 20, 0, 0, "gone"]];
  const context = vm.createContext({ now, key: "1-1", livePeerIds: new Set(["peer"]),
    npcSims: new Map([["1-1", { entries: new Map([["npc_alive", { hp: 100 }], ["npc_dead", { hp: 0 }]]) }]]),
    pruneAbilityFxMap: () => fx });
  vm.runInContext(section(server, "const pruneFxForSnapshot =", "for (const [, entry] of room)")
    + "\nthis.filtered = pruneFxForSnapshot({});", context);
  assert.deepEqual(Array.from(context.filtered, entry => entry[4]), ["npc_alive", "peer"]);
});

async function visualServer(t) {
  const temporary = await mkdtemp(join(tmpdir(), "orbit-ability-visuals-"));
  // Les dégâts aléatoires des NPC ne doivent pas perturber les assertions de soin.
  const fixture = join(temporary, "visual-fixture.mjs");
  await writeFile(fixture, `import { ZoneNpcSim } from ${JSON.stringify(new URL("./NPC_ROOM.js", import.meta.url).href)};
ZoneNpcSim.prototype.drainPlayerHits = function() { this.playerHits.length = 0; return []; };
`);
  const reserve = createServer(); reserve.listen(0, "127.0.0.1"); await once(reserve, "listening");
  const port = reserve.address().port; await new Promise(done => reserve.close(done));
  const processServer = spawn(process.execPath, ["--import", pathToFileURL(fixture).href, fileURLToPath(new URL("./MULTI_SERVER.js", import.meta.url))], {
    cwd: temporary, windowsHide: true, env: { ...process.env, PORT: String(port) }, stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  processServer.stdout.on("data", chunk => { output += chunk; });
  processServer.stderr.on("data", chunk => { output += chunk; });
  const sockets = [];
  t.after(async () => {
    for (const socket of sockets) socket.terminate();
    const stopped = processServer.exitCode === null ? once(processServer, "exit") : Promise.resolve();
    processServer.kill(); await stopped;
    assert.equal(dirname(resolve(temporary)), resolve(tmpdir()));
    assert.ok(basename(temporary).startsWith("orbit-ability-visuals-"));
    await rm(temporary, { recursive: true, force: true });
  });
  const pause = ms => new Promise(done => setTimeout(done, ms));
  const api = async (path, token, body) => {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, { method: body ? "POST" : "GET",
      headers: { ...(body ? { "content-type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined });
    assert.ok(response.ok, `${path}: ${response.status}`);
    return response.json();
  };
  let ready = false;
  for (let attempt = 0; attempt < 80; attempt++) {
    try { await api("/api/ping"); ready = true; break; } catch {}
    if (processServer.exitCode !== null) break;
    await pause(50);
  }
  assert.ok(ready, output);
  const connect = async (pseudo, shipId, options = {}) => {
    const account = await api("/api/register", null, { pseudo, email: `${pseudo}@example.test`, password: "ability-test-123", faction: options.faction || "mmo" });
    const position = options.position || { x: 700, y: 700 };
    const user = { ...account.user, revision: Number(account.user.revision || 1) + 1,
      hangars: [{ id: "test-hangar", active: true, shipId, activeConfig: 1, lastMap: "1-1", lastPos: position,
        fits: { "1": { lasers: [], gens: [], extras: [], shipMods: [] }, "2": { lasers: [], gens: [], extras: [], shipMods: [] } } }] };
    await api("/api/save", account.token, { user });
    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`), messages = [];
    sockets.push(socket);
    socket.on("message", raw => messages.push(JSON.parse(String(raw))));
    await once(socket, "open");
    const send = message => socket.send(JSON.stringify(message));
    const wait = async (predicate, after = 0, timeout = 3000) => {
      const deadline = Date.now() + timeout;
      while (Date.now() < deadline) {
        const message = messages.slice(after).find(predicate);
        if (message) return message;
        assert.equal(socket.readyState, WebSocket.OPEN, output);
        await pause(10);
      }
      assert.fail(`Message attendu absent : ${output}`);
    };
    send({ t: "hello", token: account.token, map: "1-1" });
    const welcome = await wait(message => message.t === "welcome" && message.authed);
    const pos = { t: "pos", map: "1-1", ...position, hpPct: 1, shPct: 0, dead: false, config: 1 };
    send(pos);
    await wait(message => message.t === "snapshot" && message.players.some(player => player.id === welcome.id));
    return { id: welcome.id, messages, send, wait, pos };
  };
  return { connect, pause };
}

test("Aegis WebSocket : soins sur soi +X/+0 coque et bouclier, et gains alliés confirmés", { timeout: 15000 }, async t => {
  const { connect, pause } = await visualServer(t);
  const caster = await connect("aegis-repairs", "aegis"), observer = await connect("aegis-friend", "aegis");
  const hpSkill = "ability_aegis_hp-repair", shSkill = "ability_aegis_shield-repair";
  const baseline = await observer.wait(message => message.t === "snapshot" && message.players.some(entry => entry.id === caster.id));
  const initialHp = baseline.players.find(entry => entry.id === caster.id).pvpHp;
  const observerProfile = await observer.wait(message => message.t === "snapshot" && message.players.some(entry => entry.id === observer.id));
  const observerMax = observerProfile.players.find(entry => entry.id === observer.id).hpMax;
  assert.ok(observerMax > 45000);
  const damagedAt = observer.messages.length;
  observer.send({ ...observer.pos, hpPct: (observerMax - 45000) / observerMax });
  await observer.wait(message => message.t === "snapshot" && message.players.some(entry => entry.id === observer.id && entry.pvpHp === observerMax - 45000), damagedAt);
  for (const skill of [hpSkill, shSkill]) {
    const start = observer.messages.length;
    caster.send({ t: "skillUse", skill });
    await observer.wait(message => message.t === "skillFx" && message.skill === skill && message.phase !== "heal", start);
  }
  await pause(1050);
  for (const [skill, amount, shield] of [[hpSkill, 20000, false], [shSkill, 15000, true]]) {
    const start = observer.messages.length;
    caster.send({ t: "skillUse", skill, phase: "heal", amount });
    const event = await observer.wait(message => message.t === "skillFx" && message.skill === skill && message.phase === "heal", start);
    assert.equal(event.amount, amount); assert.equal(event.shield, shield);
    assert.equal(event.target, undefined, "le tick local est uniquement visuel pour les autres");
  }
  await pause(850);
  for (const skill of [hpSkill, shSkill]) {
    const start = observer.messages.length;
    caster.send({ t: "skillUse", skill, phase: "heal", amount: 0 });
    const event = await observer.wait(message => message.t === "skillFx" && message.skill === skill && message.phase === "heal", start);
    assert.equal(event.amount, 0);
  }
  const start = observer.messages.length;
  caster.send({ t: "heal", ability: hpSkill, target: observer.id, amt: 40000 });
  const confirmed = await observer.wait(message => message.t === "skillFx" && message.target === observer.id && message.phase === "heal", start);
  assert.equal(confirmed.amount, 40000); assert.equal(confirmed.shield, false);
  const healed = await observer.wait(message => message.t === "snapshot" && message.players.some(entry => entry.id === observer.id && entry.pvpHp === observerMax - 5000), start);
  assert.equal(healed.players.find(entry => entry.id === caster.id).pvpHp, initialHp, "aucun second soin serveur pour les ticks locaux");
  await pause(850);
  const cappedAt = observer.messages.length;
  caster.send({ t: "heal", ability: hpSkill, target: observer.id, amt: 40000 });
  const capped = await observer.wait(message => message.t === "skillFx" && message.target === observer.id && message.phase === "heal", cappedAt);
  assert.equal(capped.amount, 5000, "montant borné aux PV manquants");
  await pause(850);
  const fullAt = observer.messages.length;
  caster.send({ t: "heal", ability: hpSkill, target: observer.id, amt: 40000 });
  const full = await observer.wait(message => message.t === "skillFx" && message.target === observer.id && message.phase === "heal", fullAt);
  assert.equal(full.amount, 0);
  const cancelledAt = observer.messages.length;
  caster.send({ t: "skillUse", skill: hpSkill, enabled: false });
  await observer.wait(message => message.t === "skillFx" && message.skill === hpSkill && message.enabled === false, cancelledAt);
  const invalid = observer.messages.length;
  caster.send({ t: "skillUse", skill: hpSkill, phase: "heal", amount: 20000 });
  await pause(150);
  assert.equal(observer.messages.slice(invalid).some(message => message.t === "skillFx" && message.skill === hpSkill && message.phase === "heal"), false);
});

test("deux clients WebSocket : pose du pod, position fixe et annulation partagées", { timeout: 15000 }, async t => {
  const { connect, pause } = await visualServer(t);
  const caster = await connect("visual-caster", "aegis"), observer = await connect("visual-observer", "PhoenixBleu");
  const code = abilityFxCodeFor("ability_aegis_repair-pod");
  const start = observer.messages.length;
  caster.send({ t: "skillUse", skill: "ability_aegis_repair-pod" });
  const activation = await observer.wait(message => message.t === "skillFx" && message.by === caster.id, start);
  assert.equal(activation.skill, "ability_aegis_repair-pod");
  const snapshot = await observer.wait(message => message.t === "snapshot" && message.players.some(player => player.id === caster.id && player.afx.some(entry => entry[0] === code)), start);
  const aura = snapshot.players.find(player => player.id === caster.id).afx.find(entry => entry[0] === code);
  assert.deepEqual(aura.slice(2, 4), [activation.x, activation.y]);
  await pause(300);
  const movedAt = observer.messages.length;
  caster.send({ ...caster.pos, x: 780 });
  const moved = await observer.wait(message => message.t === "snapshot" && message.players.some(player => player.id === caster.id && player.x > 700 && player.afx.some(entry => entry[0] === code)), movedAt);
  assert.deepEqual(moved.players.find(player => player.id === caster.id).afx.find(entry => entry[0] === code).slice(2, 4), [activation.x, activation.y]);
  const stop = observer.messages.length;
  caster.send({ t: "skillUse", skill: "ability_aegis_repair-pod", enabled: false });
  await observer.wait(message => message.t === "skillFx" && message.by === caster.id && message.enabled === false, stop);
  await observer.wait(message => message.t === "snapshot" && message.players.some(player => player.id === caster.id && !player.afx.some(entry => entry[0] === code)), stop);
});

test("Yamato : le rendu local et distant utilise les vrais réacteurs et les mêmes phases", () => {
  const basePack = SHIP_PACKS.find(pack => pack.id === "yamato");
  assert.ok(basePack);
  const pack = { ...basePack, _imgs: Array.from({ length: basePack.frames }, () => ({ naturalWidth: basePack.w, naturalHeight: basePack.h })) };
  for (const [elapsed, remaining, moving, expected] of [[0, 5, true, 1], [0.25, 4.75, true, 2], [1, 4, true, 3], [4.9, 0.1, true, 1], [1, 4, false, 2]]) {
    const v = visuals(), entity = { x: 100, y: 100, angle: 0, vx: moving ? 400 : 0, vy: 0 };
    const spriteFrame = 8;
    Object.assign(v.api.player, entity);
    v.api.ACTIVE_SHIP = pack;
    v.api.getPlayerSpriteFrame = () => spriteFrame;
    v.api.drawTravelEngineFx(elapsed, remaining, 24);
    const localDraws = v.draws.splice(0), localTranslations = v.translations.splice(0);
    v.api.renderRemoteBoost({ moving, vx: entity.vx, vy: 0, afx: [[16, remaining, 0, 0, ""]] }, entity, pack, spriteFrame);
    assert.ok(v.draws.length > 0, "points de réacteur officiels du Yamato disponibles");
    assert.deepEqual(v.draws, localDraws);
    assert.deepEqual(v.translations, localTranslations);
    assert.ok(v.draws.every(draw => draw.img.path.endsWith(`/${expected}.png`)));
    assert.equal(v.normalDraws.length, 0, "le boost remplace les réacteurs normaux");
  }
});

test("Yamato : démarrage dès le cast confirmé, extinction à la fin et respect du réglage visuel", () => {
  const v = visuals(), pack = SHIP_PACKS.find(pack => pack.id === "yamato");
  const r = { vx: 400, vy: 0, afx: [], lastSeen: 950, fxFlash: { code: 16, until: 2800, startedAt: 1000, sec: 5 } };
  assert.equal(v.api.remoteBoostInfo(r).sec, 5);
  v.advance(500);
  assert.equal(v.api.remoteBoostInfo(r).sec, 4.5);
  r.lastSeen = 1500;
  assert.equal(v.api.remoteBoostInfo(r), null, "une aura retirée du snapshot ne revient pas via le flash");
  r.afx = [[16, 0, 0, 0, ""]];
  assert.equal(v.api.remoteBoostInfo(r), null, "pas de boost sur une durée expirée");
  r.afx[0][1] = 3;
  v.api.GAME_SETTINGS.shipSmoke = false;
  v.api.renderRemoteBoost(r, { vx: 400, vy: 0 }, pack, 0);
  assert.equal(v.draws.length, 0);
});

test("Yamato : son activation et son annulation annoncent toujours son propre identifiant", () => {
  const casts = [], context = vm.createContext({ player: {}, started: true,
    YAMATO_TRAVEL_DURATION: 5, YAMATO_TRAVEL_COOLDOWN: 60,
    reportMovementAbility: (...args) => casts.push(args), persistCdUntil: () => {}, showNotification: () => {}, loadImage: () => {} });
  vm.runInContext(section(engine, "function startYamatoTravelCooldown(", "function startFortifyCooldown("), context);
  context.activateYamatoTravel(); context.cancelYamatoTravel();
  assert.deepEqual(casts, [["ability_yamato_travel"], ["ability_yamato_travel", false]]);
});

test("deux clients WebSocket : boost Yamato et Ronin confirmé, refus invisible et fin partagée", { timeout: 15000 }, async t => {
  const { connect } = await visualServer(t);
  const observer = await connect("yamato-observer", "PhoenixBleu");
  const skill = "ability_yamato_travel", code = abilityFxCodeFor(skill);
  for (const ship of ["yamato", "yamato_ronin"]) {
    const caster = await connect(`caster-${ship}`, ship);
    const before = await observer.wait(message => message.t === "snapshot" && message.players.some(player => player.id === caster.id));
    const baseSpeed = before.players.find(player => player.id === caster.id).vmax;
    const start = observer.messages.length;
    caster.send({ t: "skillUse", skill }); caster.send(caster.pos);
    const activation = await observer.wait(message => message.t === "skillFx" && message.by === caster.id && message.skill === skill, start);
    assert.equal(activation.until - activation.at, 5000);
    const boosted = await observer.wait(message => message.t === "snapshot" && message.players.some(player => player.id === caster.id && player.afx.some(entry => entry[0] === code) && player.vmax > baseSpeed), start);
    assert.equal(boosted.players.find(player => player.id === caster.id).vmax, baseSpeed * 2);
    const duplicateAt = observer.messages.length, ownDuplicateAt = caster.messages.length;
    caster.send({ t: "skillUse", skill });
    await caster.wait(message => message.t === "skillDenied" && message.skill === skill, ownDuplicateAt);
    assert.equal(observer.messages.slice(duplicateAt).some(message => message.t === "skillFx" && message.by === caster.id), false);
    const stop = observer.messages.length;
    if (ship === "yamato") {
      caster.send({ t: "skillUse", skill, enabled: false }); caster.send(caster.pos);
      await observer.wait(message => message.t === "skillFx" && message.by === caster.id && message.enabled === false, stop);
    } else {
      await observer.wait(message => message.t === "snapshot" && message.players.some(player => player.id === caster.id && !player.afx.some(entry => entry[0] === code)), stop, 6000);
      caster.send(caster.pos);
    }
    await observer.wait(message => message.t === "snapshot" && message.players.some(player => player.id === caster.id && !player.afx.some(entry => entry[0] === code) && player.vmax === baseSpeed), stop);
  }
});

test("deux clients WebSocket : Liberator Plus garde son aura et transmet ses +X sans doubler le soin", { timeout: 15000 }, async t => {
  const { connect, pause } = await visualServer(t);
  const caster = await connect("librep-caster", "liberator_plus"), observer = await connect("librep-observer", "PhoenixBleu");
  const skill = "ability_liberator-plus_self-repair", code = abilityFxCodeFor(skill);
  const damagedAt = observer.messages.length;
  caster.send({ ...caster.pos, hpPct: 0.2 });
  const damaged = await observer.wait(message => message.t === "snapshot" && message.players.some(player => player.id === caster.id && player.hpPct < 0.3), damagedAt);
  const initial = damaged.players.find(player => player.id === caster.id);
  const start = observer.messages.length;
  caster.send({ t: "skillUse", skill });
  const activation = await observer.wait(message => message.t === "skillFx" && message.by === caster.id && message.skill === skill, start);
  assert.equal(activation.until - activation.at, 10000);
  await pause(2200);
  const afterFlash = observer.messages.length;
  const ongoing = await observer.wait(message => message.t === "snapshot" && message.players.some(player => player.id === caster.id && player.afx.some(entry => entry[0] === code && entry[1] > 5)), afterFlash);
  assert.ok(ongoing.players.find(player => player.id === caster.id).afx.some(entry => entry[0] === code));
  const gain = 10000, healedHp = initial.pvpHp + gain;
  const tick = observer.messages.length;
  caster.send({ ...caster.pos, hpPct: healedHp / initial.hpMax });
  caster.send({ t: "skillUse", skill, phase: "heal", amount: gain });
  const healing = await observer.wait(message => message.t === "skillFx" && message.by === caster.id && message.phase === "heal", tick);
  assert.equal(healing.amount, gain);
  const healed = await observer.wait(message => message.t === "snapshot" && message.players.some(player => player.id === caster.id && player.pvpHp === healedHp), tick);
  assert.equal(healed.players.find(player => player.id === caster.id).pvpHp, healedHp);
  const duplicatedAt = observer.messages.length;
  caster.send({ t: "skillUse", skill, phase: "heal", amount: gain });
  await pause(150);
  assert.equal(observer.messages.slice(duplicatedAt).some(message => message.t === "skillFx" && message.by === caster.id && message.phase === "heal"), false);
  const stop = observer.messages.length;
  caster.send({ t: "skillUse", skill, enabled: false });
  await observer.wait(message => message.t === "skillFx" && message.by === caster.id && message.enabled === false, stop);
  await observer.wait(message => message.t === "snapshot" && message.players.some(player => player.id === caster.id && !player.afx.some(entry => entry[0] === code)), stop);
  const invalidAt = observer.messages.length;
  caster.send({ t: "skillUse", skill, phase: "heal", amount: gain });
  await pause(150);
  assert.equal(observer.messages.slice(invalidAt).some(message => message.t === "skillFx" && message.by === caster.id && message.phase === "heal"), false);
});

test("pod Aegis WebSocket : groupe seul, rayon fixe, gains réels et sortie du groupe", { timeout: 20000 }, async t => {
  const { connect, pause } = await visualServer(t);
  const caster = await connect("pod-caster", "aegis");
  const ally1 = await connect("pod-ally1", "PhoenixBleu");
  const ally2 = await connect("pod-ally2", "PhoenixBleu", { faction: "eic" });
  const far = await connect("pod-far", "PhoenixBleu", { position: { x: 1200, y: 700 } });
  const stranger = await connect("pod-stranger", "PhoenixBleu");
  const joinGroup = async (leader, member, pseudo) => {
    const start = member.messages.length;
    leader.send({ t: "groupInvite", to: pseudo });
    await member.wait(message => message.t === "groupInvite", start);
    member.send({ t: "groupAccept" });
    await leader.wait(message => message.t === "groupUpdate" && message.group?.members.some(entry => entry.id === member.id));
  };
  await joinGroup(caster, ally1, "pod-ally1");
  await joinGroup(caster, ally2, "pod-ally2");
  await joinGroup(caster, far, "pod-far");
  const profiles = new Map();
  for (const peer of [ally1, ally2, far, stranger]) {
    const baseline = await peer.wait(message => message.t === "snapshot" && message.players.some(entry => entry.id === peer.id));
    const max = baseline.players.find(entry => entry.id === peer.id).hpMax;
    const hp = peer === ally2 ? max - 1000 : max * 0.5;
    profiles.set(peer.id, { hp: Math.round(hp), max });
    const start = caster.messages.length;
    peer.send({ ...peer.pos, hpPct: hp / max });
    await caster.wait(message => message.t === "snapshot" && message.players.some(entry => entry.id === peer.id && entry.pvpHp === Math.round(hp)), start);
  }
  const skill = "ability_aegis_repair-pod";
  caster.send({ t: "skillUse", skill });
  await caster.wait(message => message.t === "skillFx" && message.skill === skill && message.by === caster.id);
  const start = caster.messages.length, receivedAt = new Map([ally1, ally2, far, stranger].map(peer => [peer.id, peer.messages.length]));
  for (const peer of [ally1, ally2, far, stranger]) caster.send({ t: "heal", target: peer.id, ability: skill, amt: 18000 });
  for (const [peer, gain] of [[ally1, 18000], [ally2, 1000]]) {
    const event = await peer.wait(message => message.t === "skillFx" && message.phase === "heal" && message.target === peer.id, receivedAt.get(peer.id));
    assert.equal(event.amount, gain);
    await peer.wait(message => message.t === "snapshot" && message.players.some(entry => entry.id === peer.id && entry.pvpHp === profiles.get(peer.id).hp + gain), receivedAt.get(peer.id));
  }
  await pause(150);
  for (const peer of [far, stranger]) {
    assert.equal(caster.messages.slice(start).some(message => message.t === "skillFx" && message.phase === "heal" && message.target === peer.id), false);
    const snapshot = caster.messages.findLast(message => message.t === "snapshot");
    assert.equal(snapshot.players.find(entry => entry.id === peer.id).pvpHp, profiles.get(peer.id).hp);
  }
  // Une requête répétée ne double ni le soin ni le +X.
  const duplicate = ally1.messages.length;
  caster.send({ t: "heal", target: ally1.id, ability: skill, amt: 18000 });
  await pause(150);
  assert.equal(ally1.messages.slice(duplicate).some(message => message.t === "skillFx" && message.phase === "heal" && message.target === ally1.id), false);
  // Le lanceur diffuse ses propres soins ; les membres à PV pleins diffusent +0.
  await pause(850);
  const ownTick = ally2.messages.length;
  caster.send({ t: "skillUse", skill, phase: "heal", amount: 18000 });
  caster.send({ t: "heal", target: ally2.id, ability: skill, amt: 18000 });
  const own = await ally2.wait(message => message.t === "skillFx" && message.phase === "heal" && message.by === caster.id && !message.target, ownTick);
  assert.equal(own.amount, 18000);
  const full = await ally2.wait(message => message.t === "skillFx" && message.phase === "heal" && message.target === ally2.id, ownTick);
  assert.equal(full.amount, 0);
  await pause(850);
  const zeroTick = ally2.messages.length;
  caster.send({ t: "skillUse", skill, phase: "heal", amount: 0 });
  const ownZero = await ally2.wait(message => message.t === "skillFx" && message.phase === "heal" && message.by === caster.id && !message.target, zeroTick);
  assert.equal(ownZero.amount, 0);
  // Un joueur quittant le groupe devient immédiatement inéligible.
  const leftAt = caster.messages.length;
  ally1.send({ t: "groupLeave" });
  await caster.wait(message => message.t === "groupUpdate" && !message.group?.members.some(entry => entry.id === ally1.id), leftAt);
  await pause(850);
  const denied = caster.messages.length;
  caster.send({ t: "heal", target: ally1.id, ability: skill, amt: 18000 });
  caster.send({ t: "heal", target: far.id, ability: skill, amt: 18000 });
  await pause(150);
  assert.equal(caster.messages.slice(denied).some(message => message.t === "skillFx" && message.phase === "heal"), false);
  // Même un autre groupe présent dans le pod reste exclu.
  await joinGroup(stranger, ally1, "pod-ally1");
  const otherGroup = caster.messages.length;
  caster.send({ t: "heal", target: ally1.id, ability: skill, amt: 18000 });
  await pause(150);
  assert.equal(caster.messages.slice(otherGroup).some(message => message.t === "skillFx" && message.phase === "heal"), false);
  const cancelled = caster.messages.length;
  caster.send({ t: "skillUse", skill, enabled: false });
  await caster.wait(message => message.t === "skillFx" && message.skill === skill && message.enabled === false, cancelled);
  const inactive = caster.messages.length;
  caster.send({ t: "heal", target: ally2.id, ability: skill, amt: 18000 });
  await pause(150);
  assert.equal(caster.messages.slice(inactive).some(message => message.t === "skillFx" && message.phase === "heal"), false, "aucun soin sans pod actif");
});
