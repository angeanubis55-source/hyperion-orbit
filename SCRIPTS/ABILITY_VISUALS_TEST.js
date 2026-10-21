import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, dirname, basename } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { once } from "node:events";
import WebSocket from "ws";
import vm from "node:vm";
import { droneDesignCooldown } from "../DRONE/DRONE_DESIGNS.js";
import { abilityFxCodeFor, abilityIdForFxCode, healSpecFor, ABILITY_FX_CODES } from "../SRC/CORE/ABILITY_FX.js";
import { getAbilityInfo, ABILITY_IDS, abilityShipKeyFor } from "../SHIP/SHIP_ABILITIES.js";
import { SHIP_PACKS } from "../SHIP/SHIP_PACKS.js";
import { ShipEngine } from "../SHIP/SHIP_ENGINE_RENDERER.js";
import { CATALOG } from "../SRC/CORE/CATALOG.js";
import { isHalloweenVariantType, isHalloweenBossVariant } from "../NPC/NPC_HALLOWEEN.js";
import { npcMapCreditMultiplier } from "../NPC/NPC_BALANCE.js";

// Exécute les vrais chemins du moteur avec un Canvas instrumenté.
const engine = readFileSync(new URL("../SRC/CORE/ORBIT_ENGINE.js", import.meta.url), "utf8");
const server = readFileSync(new URL("./MULTI_SERVER.js", import.meta.url), "utf8");
const numericConstants = Object.fromEntries([...engine.matchAll(/^const ([A-Z][A-Z0-9_]*) = (\d+(?:\.\d+)?);/gm)]
  .map(match => [match[1], Number(match[2])]));
function section(source, start, end) {
  const from = source.indexOf(start), to = source.indexOf(end, from);
  assert.ok(from >= 0 && to > from, start);
  return source.slice(from, to);
}
function visuals() {
  let now = 1000;
  const draws = [], sounds = [], halos = [], translations = [], floats = [], renderErrors = [], strokes = [];
  const image = { complete: true, naturalWidth: 100 };
  const ctx = new Proxy({ globalAlpha: 1 }, { get: (target, key) => key in target ? target[key]
    : key === "translate" ? (...args) => translations.push(args)
    : key === "stroke" ? () => strokes.push({ color: target.strokeStyle })
    : key === "createRadialGradient" || key === "createLinearGradient" ? () => ({ addColorStop() {} })
    : key === "drawImage" ? (img, ...args) => draws.push({ img, args }) : () => {} });
  const shipEngine = new ShipEngine(async () => image);
  const normalDraws = [];
  shipEngine.draw = (...args) => normalDraws.push(args);
  const remotes = new Map();
  const context = vm.createContext({
    droneAbilityCooldown: seconds => droneDesignCooldown(seconds, context.player?.droneCooldownReductionPct),
    ...numericConstants,
    performance: { now: () => now }, Date, Math, ctx, window: {},
    innerWidth: 1000, innerHeight: 800, abilityFxCodeFor, abilityIdForFxCode, getAbilityInfo, healSpecFor,
    netHoloClonesSeen: new Map(), spawnExplosion: () => {},
    drawTbrClones: () => {}, drawRemoteTempestChain: () => {}, getNetSelf: () => null,
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
    renderErrors,
    haloGlowSprite: () => image,
    SHIP_PACKS, playerImgs: [image], contSpriteCache: {},
    displayHalosOn: () => true,
    ensureShieldShimmerLoaded: () => {}, shieldShimmerImgs: Array(30).fill(image),
    SHIELD_SHIMMER_PACK: { frames: 30, fps: 30 },
    clamp: (value, lo, hi) => Math.max(lo, Math.min(hi, value)),
  });
  vm.runInContext(section(engine, "function showRemoteAbilityHeal(", "function drawNetplayRemotes(")
    .replaceAll("catch {}", "catch (error) { renderErrors.push(error); }"), context);
  vm.runInContext(section(engine, "function drawNebulaAt(", "function startHpRepairCooldown("), context);
  vm.runInContext(section(engine, "function drawRepairPodAt(", "const HAMMER_HP_DURATION"), context);
  vm.runInContext(section(engine, "function travelBuffFrame(", "let shipEffectFor ="), context);
  vm.runInContext(section(engine, "function drawFireRing(", "function startIncCooldown("), context);
  vm.runInContext(section(engine, "function drawGravityAnchorFx(", "function startGaCooldown("), context);
  vm.runInContext(section(engine, "function drawJamxHalo(", "function drawJamxHalos("), context);
  vm.runInContext("function renderRemoteBoost(r, eng, pack, remoteFrame) {\n"
    + section(engine, "      const rBoost = remoteBoostInfo(r);", "      // Les flammes seules") + "\n}", context);
  return { api: context, remotes, draws, sounds, halos, translations, floats, normalDraws, renderErrors, strokes, advance: ms => { now += ms; } };
}

test("Orcus / Plus : activation locale 20/24 s, annulation et recharge de 540 s", () => {
  for (const [ship, skill, seconds] of [["orcus", "ability_orcus_assimilate", 20],
    ["orcus_plus", "ability_orcus-plus_assimilate", 24]]) {
    const v = visuals(), casts = [], persisted = [], loads = [];
    Object.assign(v.api, { started: true, ORCUS_PLUS_DURATION: 24, account: { user: {} },
      getActiveHangarFromUser: () => ({ shipId: ship }), getShipDesignBaseId: id => id,
      currentAbilityVariant: () => skill, reportAbilityCast: (...args) => casts.push(args),
      persistCdUntil: (...args) => persisted.push(args), loadImage: path => loads.push(path),
      showNotification() {}, formatAbilityCd: String });
    vm.runInContext(section(engine, "function startOrcusCooldown(", "// --- Lightning Postcombustion"), v.api);
    v.api.activateOrcus();
    assert.equal(v.api.player.orcusT, seconds); assert.equal(v.api.player.orcusDuration, seconds);
    assert.equal(casts[0][0], skill);
    assert.deepEqual(persisted[0], ["orcusFx", seconds]);
    assert.equal(loads.length, 42);
    for (const path of loads) assert.ok(existsSync(new URL("../" + path, import.meta.url)), path);
    v.api.activateOrcus(); assert.equal(casts.length, 1, "pas de double activation");
    v.api.cancelOrcus();
    assert.equal(v.api.player.orcusT, 0); assert.equal(v.api.player.orcusCd, 540);
    assert.deepEqual(casts[1], [skill, false]);
    v.api.activateOrcus(); assert.equal(casts.length, 2, "recharge respectee");
  }
});

test("Orcus / Plus : meme sprite local et distant, une seule aura jusqu a la fin", () => {
  for (const [code, seconds] of [[21, 20], [82, 24]]) {
    const v = visuals(), remote = { id: "orcus", afx: [[code, seconds, 0, 0, ""]],
      fxFlash: { code, until: 2800, startedAt: 1000, sec: seconds } };
    vm.runInContext("function drawLocalAssimilate() {\n" + section(engine,
      "    // Orcus : sprite ORCUS_ASSIMILATE", "    // Paladin Dernier rempart") + "\n}", v.api);
    for (const ms of [0, 1000, 7000, (seconds - 8.1) * 1000]) {
      v.advance(ms); v.draws.length = 0;
      v.api.player.orcusT = 0.1;
      v.api.drawLocalAssimilate(); v.api.drawRemoteAbilityFx(remote);
      assert.equal(v.draws.length, 2, "un dessin local et un distant, sans doublon de flash");
      assert.equal(v.draws[0].img.path, v.draws[1].img.path);
      assert.match(v.draws[0].img.path, /ORCUS_ASSIMILATE/);
      assert.equal(v.draws[0].w, 226); assert.equal(v.draws[1].w, 226);
      assert.equal(v.draws[0].h, 226); assert.equal(v.draws[1].h, 226);
    }
    v.api.player.orcusT = 0; remote.afx[0][1] = 0; v.draws.length = 0;
    v.api.drawLocalAssimilate(); v.api.drawRemoteAbilityFx(remote);
    assert.equal(v.draws.length, 0);
  }
});

test("Orcus / Plus : +X et +0 verts pour le beneficiaire et l observateur qui le verrouille", () => {
  for (const skill of ["ability_orcus_assimilate", "ability_orcus-plus_assimilate"]) {
    const v = visuals(), remote = { id: "friend", x: 300, y: 300 };
    v.remotes.set(remote.id, remote);
    Object.assign(v.api.player, { hp: 90000, hpMax: 100000, sh: 10000, shMax: 10000 });
    let nextEvent;
    v.api.drainNetSkillInbox = () => { const events = nextEvent ? [nextEvent] : []; nextEvent = null; return events; };
    for (const amount of [8000, 0]) {
      nextEvent = { by: "me", target: "me", skill, phase: "heal", amount, healSeq: amount ? 1 : 2, hp: 98000, sh: 10000 };
      v.api.tickNetplayVisuals(0.016);
      assert.equal(v.api.player.hp, 98000);
      assert.equal(v.floats.at(-1)[4].text, `+${amount}`);
      assert.equal(v.floats.at(-1)[3], "rgba(80,255,125,0.98)");
      const count = v.floats.length; v.api.tickNetplayVisuals(0.016);
      assert.equal(v.floats.length, count, "pas de double affichage au tick suivant");
      nextEvent = { by: "friend", target: "friend", skill, phase: "heal", amount };
      v.api.Target.get = () => null; v.api.tickNetplayVisuals(0.016);
      assert.equal(v.floats.length, count, "pas de chiffre distant sans lock");
      nextEvent = { by: "friend", target: "friend", skill, phase: "heal", amount };
      v.api.Target.get = () => ({ _netPlayer: "friend" }); v.api.tickNetplayVisuals(0.016);
      assert.equal(v.floats.at(-1)[4].text, `+${amount}`);
      assert.equal(v.floats.at(-1)[3], "rgba(80,255,125,0.98)");
      assert.equal(remote.fxFlash, undefined);
    }
  }
});

test("tous les codes visuels : rendu sans exception sur toute la duree", () => {
  const failures = [];
  const missing = new Set();
  for (const [code, skill] of Object.entries(ABILITY_FX_CODES)) {
    if (/ultimate-cloak|ultimate-cloaking/.test(skill)) continue;
    const v = visuals(), duration = Number(getAbilityInfo(skill)?.durationSec) || 3;
    v.api.player.x = 300; v.api.player.y = 200;
    const r = { id: "caster", x: 100, y: 100, afx: [[Number(code), duration, 100, 100, "me"]],
      fxFlash: { code: Number(code), sec: duration, until: 3000, startedAt: 1000, target: "me", phase: "fire" } };
    v.remotes.set(r.id, r);
    for (const elapsed of [0, .1, .5, .9]) {
      r.afx[0][1] = duration * (1 - elapsed);
      v.api.drawRemoteAbilityFx(r);
      failures.push(...v.renderErrors.map(e => `${skill}, progression ${elapsed}: ${e}`));
      v.renderErrors.length = 0;
      v.advance(200);
    }
    for (const draw of v.draws) if (draw.img?.path && !existsSync(new URL(`../${draw.img.path.replace(/^\//, "")}`, import.meta.url))) missing.add(draw.img.path);
  }
  assert.deepEqual(failures, []);
  assert.deepEqual([...missing], [], "sprites demandes par les vrais chemins de rendu");
});

test("WebSocket : toutes les aptitudes manuelles partagees, snapshots et annulation", { timeout: 30000 }, async t => {
  const { connect } = await visualServer(t);
  const caster = await connect("all-abilities-caster", "police", { pet: true, shield: true });
  const observer = await connect("all-abilities-observer", "aegis", { shield: true, faction: "eic" });
  caster.send({ ...caster.pos, lockedTarget: observer.id });
  const special = new Set(["ability_admin-ultimate-cloaking", "ability_spearhead_ultimate-cloak", "ability_spearhead-plus_ultimate-cloak",
    "ability_mimesis_phase-out", "ability_paladin_last-stand", "ability_tempest_volt-backup"]);
  for (const skill of ABILITY_IDS.filter(id => !special.has(id))) {
    await t.test(skill, async () => {
      const start = observer.messages.length;
      caster.send({ t: "skillUse", skill, target: observer.id, chain: [observer.id], rocket: "eco10", chargeSec: 3 });
      const cast = await observer.wait(e => e.t === "skillFx" && e.by === caster.id && e.skill === skill && !e.phase, start);
      assert.ok(cast.until > cast.at);
      if (getAbilityInfo(skill).durationSec > 0) {
        await observer.wait(e => e.t === "snapshot" && e.players.some(p => p.id === caster.id
          && p.afx.some(entry => entry[0] === abilityFxCodeFor(skill))), start);
      }
      const end = observer.messages.length;
      caster.send({ t: "skillUse", skill, enabled: false });
      await observer.wait(e => e.t === "skillFx" && e.by === caster.id && e.skill === skill && e.enabled === false, end);
      await observer.wait(e => e.t === "snapshot" && e.players.some(p => p.id === caster.id
        && !p.afx.some(entry => entry[0] === abilityFxCodeFor(skill))), end);
    });
  }
});

test("WebSocket : six reparations verrouillees, +0, mauvais destinataire et delock definitif", { timeout: 15000 }, async t => {
  const { connect, pause } = await visualServer(t);
  const caster = await connect("linked-repairs-caster", "police");
  const target = await connect("linked-repairs-target", "aegis", { shield: true, faction: "eic" });
  const other = await connect("linked-repairs-other", "aegis", { shield: true });
  caster.send({ ...caster.pos, lockedTarget: target.id });
  const skills = ABILITY_IDS.filter(id => healSpecFor(id)?.mode === "hot");
  for (const skill of skills) caster.send({ t: "skillUse", skill, target: target.id });
  await target.wait(e => e.t === "snapshot" && e.players.some(p => p.id === caster.id
    && skills.every(skill => p.afx.some(entry => entry[0] === abilityFxCodeFor(skill) && entry[4] === target.id))));
  await pause(900);
  for (const skill of skills) {
    const spec = healSpecFor(skill), start = target.messages.length;
    caster.send({ t: "heal", ability: skill, target: target.id, amt: spec.cap, sh: spec.shield ? 1 : 0 });
    const event = await target.wait(e => e.t === "skillFx" && e.skill === skill && e.phase === "heal" && e.target === target.id, start);
    assert.equal(event.amount, 0, skill); assert.equal(event.shield, spec.shield);
    const wrong = other.messages.length;
    caster.send({ t: "heal", ability: skill, target: other.id, amt: spec.cap, sh: spec.shield ? 1 : 0 });
    await pause(15);
    assert.equal(other.messages.slice(wrong).some(e => e.phase === "heal" && e.target === other.id && e.skill === skill), false);
  }
  const unlocked = target.messages.length;
  caster.send({ ...caster.pos, lockedTarget: "" });
  await target.wait(e => e.t === "snapshot" && e.players.some(p => p.id === caster.id
    && skills.every(skill => p.afx.some(entry => entry[0] === abilityFxCodeFor(skill) && !entry[4]))), unlocked);
  caster.send({ ...caster.pos, lockedTarget: target.id });
  await pause(850);
  const after = target.messages.length;
  for (const skill of skills) {
    const spec = healSpecFor(skill);
    caster.send({ t: "heal", ability: skill, target: target.id, amt: spec.cap, sh: spec.shield ? 1 : 0 });
  }
  await pause(150);
  assert.equal(target.messages.slice(after).some(e => e.phase === "heal" && e.target === target.id), false);
});

test("WebSocket : Triple barrage et Hologramme transmettent les clones et coupent leurs tirs", { timeout: 12000 }, async t => {
  const { connect, pause } = await visualServer(t);
  const caster = await connect("clones-caster", "police", { pet: true }), observer = await connect("clones-observer", "aegis");
  const pos = { ...caster.pos, peta: 1, petHp: 1, petx: 700, pety: 700 };
  caster.send(pos);
  let start = observer.messages.length;
  caster.send({ t: "skillUse", skill: "ability_zephyr_tbr" });
  await observer.wait(e => e.skill === "ability_zephyr_tbr" && e.t === "skillFx", start);
  caster.send({ ...pos, tbrClones: [[750,700,0], [700,750,1]] });
  const snapshot = await observer.wait(e => e.t === "snapshot" && e.players.some(p => p.id === caster.id && p.tbrClones?.length === 2), start);
  assert.equal(snapshot.players.find(p => p.id === caster.id).tbrClones.length, 2);
  for (const petClone of [0,1]) {
    start = observer.messages.length;
    caster.send({ t: "shot", petClone, x: 700, y: 700, tx: 800, ty: 700, key: "x1", spd: 4000 });
    await observer.wait(e => e.t === "shot" && e.by === caster.id && e.petClone === petClone, start);
  }
  caster.send({ t: "skillUse", skill: "ability_zephyr_tbr", enabled: false });
  await observer.wait(e => e.skill === "ability_zephyr_tbr" && e.enabled === false, start);
  start = observer.messages.length;
  caster.send({ t: "shot", petClone: 0, x: 700, y: 700, tx: 800, ty: 700 });
  await pause(100); assert.equal(observer.messages.slice(start).some(e => e.t === "shot" && e.petClone === 0), false);
  caster.send({ t: "skillUse", skill: "ability_mimesis_hologram", chargeSec: .5 });
  await observer.wait(e => e.skill === "ability_mimesis_hologram" && e.phase === "clones", start);
  caster.send({ ...pos, holoClones: [["c1",700,700,0], ["c2",730,700,0], ["c3",700,730,0], ["c4",730,730,0]] });
  await observer.wait(e => e.t === "snapshot" && e.players.some(p => p.id === caster.id && p.holoClones?.length === 4), start);
  start = observer.messages.length;
  caster.send({ t: "skillUse", skill: "ability_mimesis_hologram", enabled: false });
  await observer.wait(e => e.t === "snapshot" && e.players.some(p => p.id === caster.id && p.holoClones?.length === 0), start);
});

test("Triple barrage : chaque faux laser part du clone interpole et inflige zero degat", () => {
  const v = visuals(), bullets = [];
  Object.assign(v.api, { bullets, addCappedProjectile: (list, bullet) => list.push(bullet),
    netVisualTarget: () => "target", PLAYER_SHOT_SFX: { x1: "laser" }, getNetGroup: () => null,
    ENTITY_LIMITS: { playerBullets: 320 } });
  vm.runInContext(section(engine, "function netVisualShotOrigin(", "function spawnNetRocketVisual("), v.api);
  v.remotes.set("caster", { id: "caster", tbrClones: [{ rx: 100, ry: 200 }, { rx: 300, ry: 400 }] });
  for (const petClone of [0,1]) v.api.spawnNetShotVisual({ by: "caster", petClone, x: 999, y: 999, tx: 500, ty: 500, n: 1, v: 42 });
  assert.equal(bullets.length, 2); assert.equal(v.sounds.length, 1, "la meme salve ne double pas le son");
  assert.ok(bullets[0].x < 200 && bullets[1].x < 400);
  for (const bullet of bullets) assert.equal(bullet.dmg, 0);
});

test("Solaris / Plus : le halo suit le lanceur en mouvement", () => {
  for (const code of [22, 23]) {
    const v = visuals();
    v.api.drawRemoteAbilityFx({ id: "caster", x: 700, y: 800, afx: [[code, 2, 100, 100, ""]] });
    assert.equal(v.strokes.length, 2);
    assert.deepEqual(v.translations, [], "le contexte est deja centre sur le lanceur, aucun decalage vers le point de cast");
  }
});

test("degats clients : berserk, valour, Spectrum, Holo, Scramble, Tartarus et Decharge", () => {
  const v = visuals();
  for (const name of ["berserkDamageMult", "valourDamageMult", "specDamageMult", "holoDamageMult", "scrambleDamageMult", "tartBoostLaserMult", "countTempestDischargeLasers", "tempestDischargeMult"]) {
    const start = engine.indexOf(`function ${name}(`), end = engine.indexOf("\n}", start) + 2;
    assert.ok(start >= 0 && end > start);
    vm.runInContext(engine.slice(start, end), v.api);
  }
  Object.assign(v.api.player, { hp: 50000, hpMax: 100000, bskT: 10, valMult: .5, holoSelfT: 10, scrambleT: 10, specT: 10 });
  assert.equal(v.api.berserkDamageMult(), 1.5); assert.equal(v.api.valourDamageMult(), 1.1);
  assert.equal(v.api.holoDamageMult(), 1.1); assert.equal(v.api.scrambleDamageMult(), 1.25);
  assert.equal(v.api.specDamageMult(), .75); v.api.player.specPlusT = 10; assert.equal(v.api.specDamageMult(), .5);
  v.api.player.tartBoostOn = true; assert.equal(v.api.tartBoostLaserMult(), .95);
  v.api.player.tartPlusBoostOn = true; assert.equal(v.api.tartBoostLaserMult(), .75);
  Object.assign(v.api.player, { tempestDischT: 10, laserMods: [{ damage: 100 }, { damage: 200 }, { damage: 0 }], droneLaserMods: Array(20).fill({ damage: 500 }) });
  assert.equal(v.api.tempestDischargeMult(), 1.02, "uniquement les canons equipes sur le vaisseau");
  Object.assign(v.api.player, { bskT: 0, valMult: 0, holoSelfT: 0, scrambleT: 0, specT: 0, specPlusT: 0, tartBoostOn: false, tartPlusBoostOn: false, tempestDischT: 0 });
  for (const name of ["berserkDamageMult", "valourDamageMult", "specDamageMult", "holoDamageMult", "scrambleDamageMult", "tartBoostLaserMult", "tempestDischargeMult"]) assert.equal(v.api[name](), 1, name);
});

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
    sendSkillUse: (...args) => sent.push(args), DMG_FMT: { format: String }, isSharedZone: () => false });
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

async function visualServer(t, extraFixture = "") {
  const temporary = await mkdtemp(join(tmpdir(), "orbit-ability-visuals-"));
  // Les dégâts aléatoires des NPC ne doivent pas perturber les assertions de soin.
  const fixture = join(temporary, "visual-fixture.mjs");
  await writeFile(fixture, `import { ZoneNpcSim } from ${JSON.stringify(new URL("./NPC_ROOM.js", import.meta.url).href)};
ZoneNpcSim.prototype.drainPlayerHits = function() { this.playerHits.length = 0; return []; };
${extraFixture}
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
      ...(options.pet ? { pet: { ...account.user.pet, owned: true, active: true, hp: 10000, sh: 0, level: 1, fits: { "1": { lasers: [] } } } } : {}),
      hangars: [{ id: "test-hangar", active: true, shipId, activeConfig: 1, lastMap: "1-1", lastPos: position,
        fits: { "1": { lasers: [], gens: options.shield ? [Object.values(CATALOG).flat().find(item => item?.module?.type === "shield" && !item.petOnly).id] : [], extras: [], shipMods: [] }, "2": { lasers: [], gens: [], extras: [], shipMods: [] } } }] };
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
    return { id: welcome.id, messages, send, wait, pos, readUser: async () => (await api("/api/me", account.token)).user };
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
    caster.send({ t: "skillUse", skill, target: observer.id });
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
    droneAbilityCooldown: seconds => droneDesignCooldown(seconds, context.player.droneCooldownReductionPct),
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


for (const legacyJpcPackets of [false, true]) test(`JPC WebSocket : tir serveur dessine (${legacyJpcPackets ? "ancien format sans tuid" : "format avec UID"})`, { timeout: 12000 }, async t => {
  const { connect, pause } = await visualServer(t, `
const originalCreate = ZoneNpcSim.create;
ZoneNpcSim.create = async function(...args) {
  const sim = await originalCreate.apply(this, args);
  if (sim?.mapId === "1-1") {
    const bot = [...sim.entries.values()].find(e => e.jpc);
    sim.camps = []; sim.entries.clear(); sim.safe = []; sim.walls = [];
    if (${legacyJpcPackets}) {
      const pushShot = sim.pushNpcShotFx.bind(sim);
      sim.pushNpcShotFx = function(...args) {
        pushShot(...args);
        for (const shot of this.shotFx) if (!shot.npc) { shot.tuid = null; delete shot.jpcPart; }
      };
      sim.jpcStartVolley = function(e, targetId, playerTarget) {
        const target = playerTarget ? this.players.get(targetId) : this.entries.get(targetId);
        this.pushNpcShotFx(e.x, e.y, target.x, target.y, e.uid, "x1", 2, false);
      };
    }
    Object.assign(bot, { x: 1500, y: 1500, hp: 100000, hpMax: 100000, sh: 100000, shMax: 100000, jpcPreyUid: "pipeline-prey" });
    sim.entries.set(bot.uid, bot);
    sim.entries.set("pipeline-prey", { uid: "pipeline-prey", type: "npc_Streuner", x: 1900, y: 1500,
      hp: 10000000, hpMax: 10000000, sh: 0, shMax: 0, speed: 0, r: 18, spread: .8,
      canShoot: true, shootRate: 1, shootRange: 700, bulletDmg: 1, burst: 1, seq: 1 });
  }
  return sim;
};`);
  const observer = await connect("jpc-pipeline", "goliath");
  const shot = await observer.wait(e => e.t === "shot" && e.by?.includes("#jpc") && e.npcShot === false);
  const snapshot = await observer.wait(e => e.t === "snapshot" && e.npc?.list?.some(n => n.uid === shot.by));
  assert.equal(shot.key, "x1");
  assert.equal(shot.tuid, legacyJpcPackets ? null : "pipeline-prey");
  const v = visuals(), projectiles = [];
  Object.assign(v.api, { enemyBullets: projectiles, PLAYER_BULLET_SPRITES: { x1: { src: "COMBAT/MUNITIONS/X1.png", w: 52, h: 18 } },
    ENTITY_LIMITS: { enemyBullets: 900 }, SIDE_OFFSET: 30, addCappedProjectile: (list, bullet) => list.push(bullet) });
  v.api.enemies.push(...snapshot.npc.list.filter(n => n.alive !== false).map((n, i) => ({ ...n,
    id: i + 1, _netUid: n.uid, isJpcBot: n.jpc === 1, r: 20 })));
  v.api.getEnemyById = id => v.api.enemies.find(e => e.id === id && e.hp > 0);
  vm.runInContext(section(engine, "const pendingNpcFaux = [];", "const pendingEscortSalvo = [];")
    + section(engine, "function netVisualShotOrigin(", "function spawnNetRocketVisual("), v.api);
  v.api.drainNetShotEvents = () => [shot];
  v.api.tickNetplayVisuals(.016);
  assert.deepEqual(v.renderErrors.map(e => e.message), []);
  assert.ok(projectiles.length > 0, "le vrai paquet doit produire un projectile");
  vm.runInContext(section(engine, "function drawBulletSprite(", "let ACTIVE_SHIP ="), v.api);
  const drawStart = engine.indexOf("  for (const b of enemyBullets) {", engine.indexOf("  // Raygun"));
  const drawEnd = engine.indexOf("  for (const s of sparks)", drawStart);
  Object.assign(v.api, { ox: 0, oy: 0, innerWidth: 11000, innerHeight: 7000,
    displayNpcShotsOn: () => true, isBeyondSensorRadius: () => false });
  vm.runInContext("function drawJpcTestShots() {\n" + engine.slice(drawStart, drawEnd) + "\n}", v.api);
  v.api.drawJpcTestShots();
  assert.ok(v.draws.some(d => d.img?.path === "COMBAT/MUNITIONS/X1.png"), "X1 doit etre dessine sur le Canvas");
  if (legacyJpcPackets) {
    const counts = [projectiles.length];
    for (let i = 1; i < 6; i++) {
      const before = projectiles.length;
      v.api.tickPendingNpcFaux(.2);
      counts.push(projectiles.length - before);
      const drawnBefore = v.draws.length;
      v.api.drawJpcTestShots();
      assert.ok(v.draws.slice(drawnBefore).some(d => d.img?.path === "COMBAT/MUNITIONS/X1.png"));
    }
    assert.deepEqual(counts, [1, 2, 1, 2, 1, 2], "un seul paquet ancien produit toute la salve alternee");
    assert.ok(projectiles.every(p => p.dmg === 0));
  } else {
    assert.equal(shot.jpcPart, true);
    const before = projectiles.length;
    v.api.tickPendingNpcFaux(1);
    assert.equal(projectiles.length, before, "aucun faux tir ajoute aux eclairs emis par le nouveau serveur");
  }
  await observer.wait(e => e !== shot && e.t === "shot" && e.by === shot.by);
});


test("credit JPC WebSocket : dernier coup NPC, recompense persistee et quete creditee une seule fois", { timeout: 12000 }, async t => {
  const { connect, pause } = await visualServer(t, `
const originalCreate = ZoneNpcSim.create;
ZoneNpcSim.create = async function(...args) {
  const sim = await originalCreate.apply(this, args);
  if (sim?.mapId !== "1-1") return sim;
  const bot = [...sim.entries.values()].find(e => e.jpc);
  sim.camps = []; sim.entries.clear(); sim.safe = []; sim.walls = [];
  Object.assign(bot, { x: 1500, y: 1500, hp: 100000, hpMax: 100000, sh: 0, shMax: 0,
    canShoot: false, jpcIshAt: Infinity, jpcRocketAt: Infinity });
  sim.entries.set(bot.uid, bot);
  sim.jpcMove = () => ({ mx: 0, my: 0, spd: 0 });
  const tick = sim.tick.bind(sim);
  let armed = false;
  sim.tick = function(dt) {
    if (!armed && this.players.size >= 2) {
      armed = true;
      const [first, helper] = [...this.players.keys()];
      this.applyHit(first, { uid: bot.uid, dmg: 1000 });
      this.applyHit(helper, { uid: bot.uid, dmg: 1000 });
      this.entries.set("fatal-npc", { uid: "fatal-npc", type: "npc_Streuner", x: 1800, y: 1500,
        hp: 1000000, hpMax: 1000000, sh: 0, shMax: 0, speed: 0, r: 18, spread: .8, seq: 1,
        canShoot: true, shootRate: 1, shootRange: 1000, shootCd: 0, bulletDmg: 100000000,
        jpcAggroUid: bot.uid, jpcAggroUntil: Date.now() + 60000 });
    }
    return tick(dt);
  };
  return sim;
};`);
  const hunter = await connect("jpc-kill-owner", "goliath");
  const before = await hunter.readUser();
  const helper = await connect("jpc-kill-helper", "goliath");
  const reward = await hunter.wait(m => m.t === "npcReward" && m.uid?.includes("#jpc"));
  assert.equal(reward.killer, hunter.id);
  assert.equal(reward.ownsKill, true);
  assert.equal(reward.type, "npc_Jpc_T0");
  assert.equal(reward.credits, 5000 * npcMapCreditMultiplier("1-1"));
  assert.equal(reward.baseExp, 2000);
  assert.equal(reward.baseHonor, 10);
  const deathSnapshot = await hunter.wait(m => m.t === "snapshot"
    && m.npc?.deaths?.some(d => d.uid === reward.uid && d.killer === hunter.id));
  const death = deathSnapshot.npc.deaths.find(d => d.uid === reward.uid);
  await pause(300); // Plusieurs snapshots du meme journal ne doivent pas recompter le kill.
  const after = await hunter.readUser();
  assert.equal(after.credits - before.credits, reward.credits);
  assert.equal(after.stats.lifetimeKills - (before.stats?.lifetimeKills || 0), 1);
  assert.equal(after.stats.npcKills.npc_Jpc_T0 - (before.stats?.npcKills?.npc_Jpc_T0 || 0), 1);
  assert.equal(hunter.messages.filter(m => m.t === "npcReward" && m.uid === reward.uid).length, 1);
  assert.equal(helper.messages.some(m => m.t === "npcReward" && m.uid === reward.uid), false);

  // Le vrai chemin client adopte le verdict, puis declenche le credit PvP des quetes.
  const target = { id: 1, _netUid: reward.uid, _netSeq: death.seq, hp: 100000,
    type: "npc_Jpc_liberator", isJpcBot: true, _deathFxPlayed: true, _netReward: reward };
  const quests = [], credited = [];
  const noop = () => {};
  const context = vm.createContext({ enemies: [target], rules: { mode: "zone" }, window: { __CURRENT_MAP_ID__: "1-1" },
    isHalloweenVariantType, isHalloweenBossVariant,
    getNetDeaths: () => new Map([[death.uid, death]]), netMyId: () => hunter.id, getNetGroup: () => null,
    netBoomSelfDamage: noop, playNpcDeathFxOnce: noop, botQueueCloakAfterKill: noop,
    Target: { get: () => target, clear: noop }, COLLECTABLE_DEFS: {}, spawnCollectableAt: noop,
    rollNpcAssemblyBox: () => null, rollNpcAssemblyDirect: () => [],
    measureGameTask: (_, callback) => callback(), advanceQuestProgress: (...args) => quests.push(args),
    killRewards: entity => credited.push(entity._netReward) });
  vm.runInContext(section(engine, "  // Journal des kills serveur D'ABORD", "  // Index uid -> entite"), context);
  assert.equal(target._netKiller, true);
  assert.equal(target._netLootOwner, true);
  vm.runInContext(section(engine, "function processDeathsMeasured()", "let gateCompletionPending"), context);
  context.processDeathsMeasured();
  context.processDeathsMeasured();
  assert.deepEqual(quests, [["kill", target.type], ["pvp", "pvp"]]);
  assert.deepEqual(credited, [reward]);
});

test("lock multi WebSocket : JPC gris puis rouge apres mort, selection conservee", { timeout: 12000 }, async t => {
  const { connect } = await visualServer(t, `
const create = ZoneNpcSim.create;
ZoneNpcSim.create = async function(...args) {
  const sim = await create.apply(this, args);
  if (sim?.mapId !== "1-1") return sim;
  const bot = [...sim.entries.values()].find(e => e.jpc);
  sim.camps = []; sim.entries.clear(); sim.safe = []; sim.walls = [];
  Object.assign(bot, { x: 1500, y: 1500, jpcPreyUid: "lock-prey", jpcShootT: Infinity, jpcRocketAt: Infinity });
  const prey = { uid: "lock-prey", type: "npc_Streuner", x: 1900, y: 1500,
    hp: 10000000, hpMax: 10000000, sh: 0, shMax: 0, speed: 0, r: 18, spread: .8,
    canShoot: false, seq: 1 };
  sim.entries.set(bot.uid, bot); sim.entries.set(prey.uid, prey);
  ZoneNpcSim.lockHit(prey, bot.uid, Date.now(), true);
  const tick = sim.tick.bind(sim);
  let deathAt = null;
  sim.tick = function(dt) {
    if (this.players.size && deathAt == null) deathAt = Date.now() + 1500;
    tick(dt);
    if (deathAt != null && Date.now() >= deathAt && bot.hp > 0) this.jpcKillBot(bot, Date.now());
  };
  return sim;
};`);
  const observer = await connect("jpc-lock-owner", "goliath");
  const grey = await observer.wait(m => m.t === "snapshot" && m.npc?.list?.some(e => e.uid === "lock-prey" && e.jpcBy));
  const prey = grey.npc.list.find(e => e.uid === "lock-prey");
  assert.equal(prey.lock, prey.jpcBy);
  const selectedAt = observer.messages.length;
  observer.send({ ...observer.pos, lockedTarget: "lock-prey" });
  await observer.wait(m => m.t === "snapshot" && m.npc?.list?.some(e => e.uid === "lock-prey" && e.lock === prey.lock), selectedAt);
  const red = await observer.wait(m => m.t === "snapshot" && m.npc?.list?.some(e => e.uid === "lock-prey" && e.lock == null && e.jpcBy == null), selectedAt, 8500);
  assert.equal(red.npc.list.find(e => e.uid === "lock-prey").lock, null);
});


test("High-tech : gains Energy Leech confirmes +X/+0 visibles sur soi et sur le pilote selectionne", () => {
  for (const local of [true, false]) {
    const v = visuals();
    const actor = local ? v.api.player : { id: "friend", x: 100, y: 100 };
    if (!local) v.remotes.set("friend", actor);
    Object.assign(v.api, { leechBeams: [], netGameTimeMs: () => 50000 });
    Object.assign(v.api.player, { hp: 900, hpMax: 1000, sh: 0, shMax: 0 });
    v.api.Target.get = () => ({ _netPlayer: "friend" });
    const by = local ? "me" : "friend";
    v.api.applyTechVisualEvent({ by, skill: "ability_tech_energy_leech", at: 49000, until: 1849000 });
    const start = actor.leechFx.startedAt;
    for (const [index, amount] of [100, 0].entries()) {
      if (local && amount === 0) v.api.player.tempestBackupT = 2;
      let pending = [{ by, target: by, skill: "ability_tech_energy_leech", phase: "heal", amount,
        hp: 1000, sh: 0, healSeq: index + 1, x: 500, y: 600 }];
      v.api.drainNetSkillInbox = () => { const batch = pending; pending = []; return batch; };
      v.api.tickNetplayVisuals(0.016);
      assert.equal(v.floats.at(-1)[4].text, `+${amount}`);
      assert.equal(actor.leechFx.startedAt, start, "un soin ne relance pas l'aura");
      assert.equal(v.api.leechBeams.length, index + 1);
    }
    if (local) assert.equal(v.api.player.hp, 1000);
    assert.deepEqual(v.renderErrors, []);
  }
});

test("High-tech : reconnexion conserve la phase des auras et annulation les retire", () => {
  const v = visuals();
  Object.assign(v.api, { leechBeams: [], netGameTimeMs: () => 50000 });
  const actor = { id: "friend", afx: [[abilityFxCodeFor("ability_tech_energy_leech"), 1799, 0, 0, "", 49000],
    [abilityFxCodeFor("ability_tech_npc_bomb"), 59, 0, 0, "", 49000]] };
  v.remotes.set(actor.id, actor);
  v.api.syncTechVisualSnapshot(actor);
  assert.equal(actor.leechFx.startedAt, 0);
  assert.equal(actor.npcBombFx.startedAt, 0);
  v.advance(200);
  v.api.syncTechVisualSnapshot(actor);
  assert.equal(actor.leechFx.startedAt, 0, "snapshot suivant sans redemarrage");
  v.api.applyTechVisualEvent({ by: actor.id, skill: "ability_tech_energy_leech", enabled: false });
  assert.equal(actor.leechFx, null);
});

test("High-tech : Frost et les six pulses Bomb ont un rendu local et distant identique", () => {
  const v = visuals();
  const pulses = [];
  v.api.drawHaloPulse = (...args) => pulses.push(args);
  for (const name of ["drawRemoteNpcBomb", "drawRemoteFrostHalo", "drawNpcBombFx", "drawFrostHaloFx"]) {
    const from = engine.indexOf(`function ${name}(`);
    const to = engine.indexOf("\n}", from) + 2;
    vm.runInContext(engine.slice(from, to), v.api);
  }
  Object.assign(v.api.player, { npcBombFx: { startedAt: 1000 }, frostFx: { startedAt: 1000 } });
  const remote = { ...v.api.player };
  v.advance(200);
  v.api.drawFrostHaloFx(10, 20); v.api.drawRemoteFrostHalo(remote, 10, 20);
  assert.deepEqual(pulses[0], pulses[1]); pulses.length = 0;
  v.api.drawNpcBombFx(0, 0); assert.equal(pulses.length, 0, "aucune explosion avant 10 secondes");
  for (let tick = 1; tick <= 6; tick++) {
    v.advance(10000);
    v.api.drawNpcBombFx(10, 20); v.api.drawRemoteNpcBomb(remote, 10, 20);
    assert.equal(pulses.length, 2, `pulse ${tick}`);
    assert.deepEqual(pulses[0], pulses[1]); pulses.length = 0;
  }
  assert.deepEqual(v.renderErrors, []);
});


test("Energy Leech WebSocket : un impact NPC envoie +0 aux deux clients et conserve son aura", { timeout: 15000 }, async t => {
  const { connect, pause } = await visualServer(t, `
const originalCreate = ZoneNpcSim.create;
ZoneNpcSim.create = async function(...args) {
  const sim = await originalCreate.apply(this, args);
  if (sim?.mapId !== "1-1") return sim;
  const npc = [...sim.entries.values()][0] || {};
  sim.camps = []; sim.entries.clear(); sim.safe = []; sim.walls = [];
  Object.assign(npc, { type: "npc_Streuner", jpc: false, uid: "leech-test", x: 4800, y: 3500, hp: 1000000, hpMax: 1000000,
    sh: 0, shMax: 0, canShoot: false, speed: 0 });
  sim.entries.set(npc.uid, npc);
  return sim;
};`);
  const caster = await connect("leech-caster", "goliath", { position: { x: 4500, y: 3500 } });
  const observer = await connect("leech-viewer", "goliath", { position: { x: 4500, y: 3600 } });
  const skill = "ability_tech_energy_leech";
  caster.send({ t: "skillUse", skill, phase: "fire" });
  await caster.wait(m => m.t === "skillFx" && m.skill === skill && m.phase !== "heal");
  await observer.wait(m => m.t === "skillFx" && m.skill === skill && m.phase !== "heal");
  const repeatAt = caster.messages.length;
  caster.send({ t: "skillUse", skill, phase: "fire" });
  const repeated = await caster.wait(m => m.t === "skillFx" && m.skill === skill && m.phase !== "heal", repeatAt);
  assert.ok(repeated.until > Date.now(), "la resynchronisation conserve l'aura serveur");
  await pause(500);
  caster.send({ t: "hit", uid: "leech-test", dmg: 100 });
  const heal = await caster.wait(m => m.t === "skillFx" && m.skill === skill && m.phase === "heal");
  const shared = await observer.wait(m => m.t === "skillFx" && m.skill === skill && m.phase === "heal");
  assert.equal(heal.amount, 0);
  assert.ok(heal.healSeq > 0);
  assert.deepEqual(shared, heal);
  assert.equal(heal.x, 4800);
  const snapshot = await observer.wait(m => m.t === "snapshot" && m.players.some(p =>
    p.id === caster.id && p.afx?.some(entry => entry[0] === abilityFxCodeFor(skill) && entry[5] > 0)));
  assert.ok(snapshot);
});


test("High-tech : Energy Leech partage la frame et la taille native, Chain suit les memes cibles vivantes", () => {
  const v = visuals(), beams = [];
  Object.assign(v.api, { netGameTimeMs: () => 50321, techEnergyLeechActive: () => true,
    getCachedImage: path => ({ complete: true, naturalWidth: 100, naturalHeight: 80, path }),
    petLinkBeam: (...args) => beams.push(args) });
  for (const name of ["drawEnergyLeechFx", "drawRemoteEnergyLeech", "drawChainImpulseFx", "drawRemoteChainImpulse"]) {
    const from = engine.indexOf(`function ${name}(`), to = engine.indexOf("\n}", from) + 2;
    vm.runInContext(engine.slice(from, to), v.api);
  }
  const remote = { ...v.api.player, leechFx: { startedAt: 1000 } };
  v.api.drawEnergyLeechFx(); v.api.drawRemoteEnergyLeech(remote, 0, 0);
  assert.equal(v.draws.length, 2);
  assert.deepEqual(v.draws[0], v.draws[1]);
  assert.equal(v.draws[0].w, 100); assert.equal(v.draws[0].h, 80);
  const fx = { startedAt: 1000, chain: [{ id: "npc", x: 1, y: 2 }] };
  v.api.player.chainImpFx = fx; remote.chainImpFx = fx;
  v.api.enemies.push({ _netUid: "npc", hp: 100, x: 800, y: 900 });
  v.api.drawChainImpulseFx(0, 0); v.api.drawRemoteChainImpulse(remote, 0, 0);
  assert.deepEqual(beams[0], beams[1]);
  assert.deepEqual(beams[0], [100, 100, 800, 900]);
  assert.deepEqual(v.renderErrors, []);
});
