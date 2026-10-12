import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync, existsSync } from 'node:fs';
import { DRONE_DESIGNS, getDroneDesignBonuses, getDroneDesign, droneDesignBonusLabel, droneDesignCooldown } from '../DRONE/DRONE_DESIGNS.js';
import { getDroneSpritePath, getDroneShopStillPath } from '../DRONE/DRONE_TYPES.js';
import { computeHangarStats } from '../SHIP/SHIP_HANGARS.js';
import { combatProfile } from './COMBAT_PROFILE.js';
import { useMovementAbility, syncMovementAbility } from './MOVEMENT_RULES.js';
import { pruneUnavailableLoadout } from '../SRC/CORE/FIT_INVENTORY.js';
import { CATALOG } from '../SRC/CORE/CATALOG.js';

function fixture(designs = [], shipId = 'goliath') {
  const hangar = { id: 'h1', shipId, active: true, activeConfig: 1,
    fits: { '1': { lasers: ['laser_lf3'], gens: ['shd_mk1'], extras: [], shipMods: [] }, '2': {} } };
  const items = Array.from({ length: 10 }, (_, i) => ({ id: `d${i}`, type: i < 8 ? 'iris' : i === 8 ? 'apis' : 'zeus', level: 6,
    fitsByHangar: { h1: { '1': { equipment: ['laser_lf3', 'shd_mk1'], ability: designs[i] || null }, '2': { equipment: [], ability: null } } } }));
  const user = { ship: shipId, hangars: [hangar], inventory: { counts: {}, shipModules: [] }, drones: { items, activeFormation: 'standard' } };
  return { hangar, user, stats: computeHangarStats(hangar, user) };
}

for (const [id, expected] of Object.entries({ havoc: { damagePct: 10 }, hermes: { cooldownPct: 10 },
  hercules: { shieldPct: 20, hpPct: 20 }, admin: { damagePct: 10, hpPct: 10, cooldownPct: 10, evasionPct: 10 },
  saturn: { hpPct: 25, laserHitPct: 25, rocketHitPct: 25 } })) {
  test(`${id} : bonus de dix designs appliques une seule fois sur tout le vaisseau`, () => {
    const baseline = fixture();
    const fitted = fixture(Array(10).fill(DRONE_DESIGNS[id].itemId));
    const effects = getDroneDesignBonuses(fitted.user, 'h1', 1).effects;
    for (const [key, value] of Object.entries(effects)) assert.equal(value, expected[key] || 0);
    assert.ok(Math.abs(fitted.stats.totalLaserDamage - baseline.stats.totalLaserDamage * (1 + (expected.damagePct || 0) / 100)) < 1e-8);
    assert.ok(Math.abs(fitted.stats.bonusShield - baseline.stats.bonusShield * (1 + (expected.shieldPct || 0) / 100)) < 1e-8);
    assert.equal(fitted.stats.bonusHPPct, expected.hpPct || 0);
    assert.equal(fitted.stats.bonusAbilityCooldownPct, expected.cooldownPct || 0);
    const profile = combatProfile(fitted.user, '1-1');
    const normal = combatProfile(baseline.user, '1-1');
    assert.equal(profile.hpMax, Math.floor(normal.hpMax * (1 + (expected.hpPct || 0) / 100)));
    assert.equal(profile.abilityCooldownMult, 1 - (expected.cooldownPct || 0) / 100);
    assert.equal(profile.evade, (expected.evasionPct || 0) / 100);
    assert.equal(profile.laserHitBonusPct, expected.laserHitPct || 0);
    assert.equal(profile.rocketHitBonusPct, expected.rocketHitPct || 0);
  });
}

test('designs mixtes et partiels : cumuls, label total et isolation entre hangars/configs', () => {
  const f = fixture(['havoc','havoc','hercules','hercules','hermes','hermes','admin','admin','saturn','saturn']);
  const bonuses = getDroneDesignBonuses(f.user, 'h1', 1);
  assert.deepEqual(bonuses.effects, { damagePct: 4, shieldPct: 4, hpPct: 11, cooldownPct: 4, evasionPct: 2, laserHitPct: 5, rocketHitPct: 5 });
  assert.equal(droneDesignBonusLabel('havoc', bonuses), '4 % dégâts bonus');
  assert.equal(droneDesignBonusLabel(null, bonuses), 'Aucun bonus');
  for (const [hid, cfg] of [['h1',2], ['h2',1]]) {
    assert.ok(Object.values(getDroneDesignBonuses(f.user, hid, cfg).effects).every(v => v === 0));
  }
  const partial = fixture(['havoc']);
  assert.equal(partial.stats.droneDesignEffects.damagePct, 1);
  const orcus = fixture(Array(10).fill('admin'), 'orcus_plus');
  assert.equal(orcus.stats.droneDesignEffects.damagePct, 10, 'Orcus ne multiplie pas les bonus des designs');
});

test('chaque design : CPU, image de hangar et 32 frames aux six niveaux pour Iris/Apis/Zeus', () => {
  const manifest = JSON.parse(readFileSync(new URL('../ASSETS_MANIFEST.json', import.meta.url), 'utf8'));
  for (const design of Object.values(DRONE_DESIGNS)) {
    for (const path of [design.icon, design.shopIcon]) {
      assert.ok(existsSync(new URL('../' + path, import.meta.url)), path);
      assert.ok(manifest.assets.includes('./' + path), path);
    }
    for (const type of ['iris', 'apis', 'zeus']) for (let level = 1; level <= 6; level++) for (let frame = 1; frame <= 32; frame++) {
      const path = getDroneSpritePath({ type, level, fit: { ability: design.itemId } }, frame);
      assert.ok(path.startsWith(design.sprite + (level - 1) + '/'), path);
      assert.ok(existsSync(new URL('../' + path, import.meta.url)), path);
    }
    assert.equal(getDroneShopStillPath('zeus', design.itemId), design.shopIcon);
  }
  for (const type of ['iris','apis','zeus']) assert.ok(existsSync(new URL('../' + getDroneShopStillPath(type), import.meta.url)));
  assert.equal(getDroneDesign('green').id, 'admin');
  assert.equal(getDroneDesign('gold').id, 'saturn');
  assert.equal(getDroneDesign('white_turquoise').id, 'hermes');
});

test('Hermes : recharge locale persistante et serveur reduites de 10 %, duree de boost inchangee', () => {
  const engine = readFileSync(new URL('../SRC/CORE/ORBIT_ENGINE.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const start = engine.indexOf('function startSolCooldown('), end = engine.indexOf('function solFx(', start);
  const saved = {};
  const ctx = vm.createContext({ player: { droneCooldownReductionPct: 10 }, SOLACE_COOLDOWN: 90, SOLACE_PLUS_COOLDOWN: 90,
    droneAbilityCooldown: seconds => droneDesignCooldown(seconds, 10), persistCdUntil: (key, seconds) => { saved[key] = seconds; } });
  vm.runInContext(engine.slice(start, end), ctx);
  ctx.startSolCooldown(); assert.equal(ctx.player.solCd, 81); assert.equal(saved.sol, 81);
  const hudStart = engine.indexOf('function getAbilityCooldown('), hudEnd = engine.indexOf('function formatAbilityCd(', hudStart);
  Object.assign(ctx, { isCloakAbility: () => false, isPlayerCloaked: () => false });
  vm.runInContext(engine.slice(hudStart, hudEnd), ctx);
  assert.equal(ctx.getAbilityCooldown('ability_solace').max, 81, 'le voile de recharge utilise aussi le maximum reduit');
  const profile = { shipId: 'lightning', speed: 400, range: 1400, abilityCooldownMult: 0.9 };
  const state = { hp: 1000, sh: 1000, x: 0, y: 0 };
  assert.equal(useMovementAbility(state, profile, 'ability_lightning', true, 1000), true);
  assert.equal(state._moveEffects.ability_lightning.until, 11000);
  assert.equal(state._moveCooldowns.ability_lightning, 65000);
  syncMovementAbility(state, profile, 11000);
  assert.equal(useMovementAbility(state, profile, 'ability_lightning', true, 64999), false);
  assert.equal(useMovementAbility(state, profile, 'ability_lightning', true, 65000), true);
});

test('Havoc : le bonus couvre aussi les supplements conditionnels et l overdrive des canons', () => {
  const cannon = Object.values(CATALOG).flat().find(item => item.module?.overdrive > 0 && !item.petOnly);
  assert.ok(cannon);
  const baseline = fixture(), equipped = fixture(Array(10).fill('havoc'));
  for (const f of [baseline, equipped]) f.hangar.fits['1'].lasers = [cannon.id];
  const normal = combatProfile(baseline.user, '1-1'), bonus = combatProfile(equipped.user, '1-1');
  assert.ok(Math.abs(bonus.laserDamage - normal.laserDamage * 1.1) < 1e-8);
});

test('un CPU retire de l inventaire est retire du brouillon sans perdre les autres designs', () => {
  const drafts = { d1: { equipment: [], ability: 'drone_design_havoc' }, d2: { equipment: [], ability: 'drone_design_havoc' }, d3: { equipment: [], ability: 'drone_design_admin' } };
  const removed = pruneUnavailableLoadout({ drones: drafts }, { inventory: { counts: { drone_design_havoc: 1, drone_design_admin: 1 } } });
  assert.equal(removed, 1); assert.equal(drafts.d1.ability, 'drone_design_havoc'); assert.equal(drafts.d2.ability, null); assert.equal(drafts.d3.ability, 'drone_design_admin');
});
