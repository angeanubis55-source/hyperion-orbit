import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { planAutoUpgradeCharges, REFINERY_RECIPES } from '../SRC/DATA/RESOURCES.js';
import { chargeShipUpgradesAutomatically, refineCurrentUserOre } from '../SRC/CORE/ACCOUNT.js';

const all = { laser: 'promerium', rocket: 'promerium', speed: 'promerium', shield: 'promerium' };
test('une meme ressource se repartit en parts egales sur les quatre slots', () => {
  const { charges } = planAutoUpgradeCharges({ promerium: 120 }, all);
  assert.equal(charges.length, 4);
  assert.ok(charges.every(c => c.amount === 30));
});
test('les minerais differents se partagent seulement entre leurs slots compatibles', () => {
  const result = planAutoUpgradeCharges({ seprom: 10, duranium: 7, palladium: 99 },
    { laser: 'seprom', rocket: 'seprom', shield: 'duranium', speed: 'duranium', fake: 'palladium' });
  assert.deepEqual(result.charges.map(c => c.amount), [5, 5, 4, 3]);
  assert.equal(result.charges.reduce((n, c) => n + c.amount, 0), 17);
});
test('Aucun, les choix incompatibles et les stocks invalides ne consomment rien', () => {
  for (const value of [undefined, 0, -5, Infinity, NaN])
    assert.deepEqual(planAutoUpgradeCharges({ seprom: value }, { laser: 'seprom', speed: 'seprom', shield: '' }).charges, []);
  assert.deepEqual(planAutoUpgradeCharges({ seprom: 20 }, { speed: 'seprom', laser: 'duranium', rocket: '' }).charges, []);
});
test('les petites collectes tournent entre les slots et aucun minerai ne se perd', () => {
  let cursors = {}, totals = { laser: 0, rocket: 0, speed: 0, shield: 0 };
  for (let i = 0; i < 20; i++) {
    const plan = planAutoUpgradeCharges({ promerium: 1 }, all, cursors); cursors = plan.cursors;
    assert.equal(plan.charges.length, 1); totals[plan.charges[0].slot] += plan.charges[0].amount;
  }
  assert.deepEqual(Object.values(totals), [5, 5, 5, 5]);
});
test('le plan laisse les entrees intactes et ne distribue que des unites entieres', () => {
  const resources = { promerium: 5.5 }, cursors = { promerium: 1 };
  const plan = planAutoUpgradeCharges(resources, all, cursors);
  assert.equal(plan.charges.reduce((n, c) => n + c.amount, 0), 5);
  assert.deepEqual(resources, { promerium: 5.5 }); assert.deepEqual(cursors, { promerium: 1 });
});

const engine = readFileSync(new URL('../SRC/CORE/ORBIT_ENGINE.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
function engineFunction(name) {
  const from = engine.indexOf(`function ${name}(`), end = from + engine.slice(from).search(/^}$/m);
  assert.ok(from >= 0 && end > from); return engine.slice(from, end + 1);
}
function refinery(resources, selections, equipment = true, ores = false) {
  const user = { id: 'refinery-test', inventory: { resources: { ...resources } }, upgrades: {} };
  const saved = [], ctx = vm.createContext({
    account: { user }, ui: { refineryAuto: { checked: ores }, refineryAutoUpgrades: { checked: equipment } },
    REFINERY_RECIPES, chargeShipUpgradesAutomatically, refineCurrentUserOre,
    localStorage: { setItem() {} }, loadAccountUser() {}, applyCurrentConfigStats() { ctx.stats++; },
    saveUser(user) { saved.push(structuredClone(user)); }, stats: 0,
  });
  vm.runInContext(`const refineryEquipmentPrefs = { ores: ${JSON.stringify(selections)}, cursors: {} };\n` +
    ['refineryEquipmentPrefsKey', 'saveRefineryEquipmentPrefs', 'refineryChargeEquipment', 'refineryRefineAll', 'maybeRefineryAuto'].map(engineFunction).join('\n'), ctx);
  return { ctx, user, saved };
}
test('les deux automatismes decoches ne touchent ni minerais ni equipement', () => {
  const { ctx, user } = refinery({ promerium: 100 }, all, false, false);
  assert.equal(ctx.maybeRefineryAuto(), 0);
  assert.equal(user.inventory.resources.promerium, 100); assert.deepEqual(user.upgrades, {});
});
test('auto-raffinage charge le produit choisi avant la transformation suivante et sauvegarde une seule fois', () => {
  const { ctx, user, saved } = refinery({ prometid: 400, duranium: 400, xenomit: 40 }, all, true, true);
  ctx.maybeRefineryAuto();
  for (const slot of Object.keys(all)) assert.equal(user.upgrades[slot].stock, 100);
  assert.equal(user.inventory.resources.promerium, 0);
  assert.equal(user.inventory.resources.seprom || 0, 0);
  assert.equal(saved.length, 1); assert.equal(ctx.stats, 1);
});
test('le chargement automatique cumule le stock existant du meme minerai', () => {
  const user = { inventory: { resources: { seprom: 6 } }, upgrades: { laser: { ore: 'seprom', stock: 99 } } };
  const result = chargeShipUpgradesAutomatically({ laser: 'seprom', rocket: 'seprom' }, { user, deferSave: true });
  assert.equal(result.consumed, 6); assert.equal(user.upgrades.laser.stock, 129); assert.equal(user.upgrades.rocket.stock, 30);
});

test('les preferences sont liees au compte reseau avant le chargement du compte moteur', () => {
  const ctx = vm.createContext({ account: { user: null }, netList: () => [{ id: 'network-user' }], getCurrentUserFull: () => ({ id: 'legacy-user' }) });
  vm.runInContext(engineFunction('refineryEquipmentPrefsKey'), ctx);
  assert.equal(ctx.refineryEquipmentPrefsKey(), 'orbit_refinery_equipment:network-user');
  ctx.netList = () => [];
  assert.equal(ctx.refineryEquipmentPrefsKey(), 'orbit_refinery_equipment:legacy-user');
  ctx.account.user = { id: 'engine-user' };
  assert.equal(ctx.refineryEquipmentPrefsKey(), 'orbit_refinery_equipment:engine-user');
});

test('le montage restaure les preferences apres l initialisation tardive du compte moteur', () => {
  const tasks = [], prefs = { enabled: true, ores: { laser: 'seprom', rocket: 'seprom' }, cursors: { seprom: 1 } };
  const ctx = vm.createContext({ queueMicrotask: fn => tasks.push(fn), UPGRADE_SLOTS: [{ id: 'laser' }, { id: 'rocket' }],
    UPGRADE_SLOT_ORES: { laser: ['seprom'], rocket: ['seprom'] }, ui: { refineryAuto: {}, refineryAutoUpgrades: {} },
    localStorage: { getItem: key => key === 'orbit_refinery_equipment:late-account' ? JSON.stringify(prefs) : null } });
  const from = engine.indexOf('// Le compte est initialise plus bas : restaurer les preferences'),
    to = engine.indexOf('ui.refineryAutoUpgrades?.addEventListener', from);
  vm.runInContext(`const refineryEquipmentPrefs = { ores: {}, cursors: {} };\n` + engineFunction('refineryEquipmentPrefsKey') +
    '\n' + engine.slice(from, to) + '\nconst account = { user: { id: "late-account" } };', ctx);
  assert.equal(ctx.ui.refineryAutoUpgrades.checked, undefined);
  tasks.forEach(fn => fn());
  assert.equal(ctx.ui.refineryAutoUpgrades.checked, true);
  assert.equal(vm.runInContext('refineryEquipmentPrefs.ores.laser', ctx), 'seprom');
});
