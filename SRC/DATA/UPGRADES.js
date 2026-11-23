"use strict";

// Amélioration des équipements (fenêtre "Amélioration").
// Lasers, générateurs de bouclier et générateurs de vitesse : niveaux 1 à 16,
// +2 % par niveau sur la stat principale de l'objet (lvl.16 = +30 %).
//
// Stockage : un exemplaire amélioré garde l'ID du catalogue suivi de
// "@<niveau>" (ex. "laser_lf4@5"). Le niveau 1 reste l'ID nu : les comptes
// existants n'ont rien à migrer. inventory.counts et les fits stockent ces
// IDs tels quels, donc chaque niveau forme sa propre pile. findCatalogItem
// retire le suffixe pour retrouver l'objet du catalogue.
//
// Aucun import du catalogue ici (CATALOG.js importe ce fichier).

export const UPGRADE_MAX_LEVEL = 16;
export const UPGRADE_PCT_PER_LEVEL = 2;
export const UPGRADE_TYPES = Object.freeze(["laser", "shield", "speed"]);
const SUFFIX_RE = /^(.+)@([1-9]\d?)$/;

// Découpe "laser_lf4@5" -> { base: "laser_lf4", level: 5 }. Un suffixe hors
// 2..16 n'est pas un niveau : l'ID est rendu tel quel (niveau 1).
export function parseUpgradeId(itemId) {
  const raw = String(itemId ?? "");
  const m = SUFFIX_RE.exec(raw);
  if (m) {
    const level = Number(m[2]);
    if (level >= 2 && level <= UPGRADE_MAX_LEVEL) return { base: m[1], level, suffixed: true };
  }
  return { base: raw, level: 1, suffixed: false };
}

export function itemBaseId(itemId) {
  return parseUpgradeId(itemId).base;
}

export function itemUpgradeLevel(itemId) {
  return parseUpgradeId(itemId).level;
}

export function itemIdAtLevel(baseId, level) {
  const base = itemBaseId(baseId);
  const lv = Math.max(1, Math.min(UPGRADE_MAX_LEVEL, Math.floor(Number(level) || 1)));
  return lv <= 1 ? base : `${base}@${lv}`;
}

// Multiplicateur de la stat principale (dégâts / bouclier / vitesse).
export function upgradeMult(itemId) {
  return 1 + (itemUpgradeLevel(itemId) - 1) * UPGRADE_PCT_PER_LEVEL / 100;
}

export function upgradeBonusPct(level) {
  return (Math.max(1, Math.min(UPGRADE_MAX_LEVEL, Math.floor(Number(level) || 1))) - 1) * UPGRADE_PCT_PER_LEVEL;
}

export function isUpgradableItem(item) {
  return !!item && UPGRADE_TYPES.includes(item?.module?.type);
}

// Coût du passage fromLevel -> fromLevel + 1 (un exemplaire), en crédits
// uniquement : 5 % du prix boutique pour lvl.1 -> lvl.2, puis x2 à chaque
// niveau (lvl.2 -> lvl.3 = 10 %, lvl.3 -> lvl.4 = 20 %...). Min 1 000.
export function upgradeCost(item, fromLevel) {
  const level = Math.max(1, Math.min(UPGRADE_MAX_LEVEL - 1, Math.floor(Number(fromLevel) || 1)));
  const price = Math.max(0, Number(item?.price) || 0);
  const credits = Math.max(1000, Math.round(price * 0.05 * 2 ** (level - 1) / 1000) * 1000);
  return { credits, resources: {} };
}

// Exemplaires d'un ID réservés par les équipements : même règle que le
// serveur (reservedCatalogCopies) = max, par hangar et configuration, des
// copies montées sur le vaisseau + drones + P.E.T.
export function reservedEquippedCopies(user, itemId) {
  const id = String(itemId || "");
  let reserved = 0;
  const count = values => Array.isArray(values) ? values.filter(value => String(value || "") === id).length : 0;
  for (const hangar of user?.hangars || []) for (const config of ["1", "2"]) {
    let used = 0;
    const shipFit = hangar?.fits?.[config] || {};
    for (const group of ["lasers", "gens", "extras", "particle"]) used += count(shipFit[group]);
    for (const drone of user?.drones?.items || []) {
      const fit = drone?.fitsByHangar?.[String(hangar.id)]?.[config] || drone?.fits?.[config] || drone?.fit;
      used += count(fit?.equipment);
    }
    if (user?.pet?.owned === true) {
      const fit = user?.pet?.fitsByHangar?.[String(hangar.id)]?.[config] || user?.pet?.fits?.[config] || user?.pet?.fit;
      for (const group of ["lasers", "generators", "gears", "protocols"]) used += count(fit?.[group]);
    }
    reserved = Math.max(reserved, used);
  }
  return reserved;
}

// Tableaux d'équipement d'un hangar / configuration où un laser ou un
// générateur peut être monté (vaisseau, drones, P.E.T). Mêmes sources que
// reservedEquippedCopies.
function upgradableFitArrays(user, hangar, config) {
  const out = [];
  const ship = hangar?.fits?.[config];
  for (const group of ["lasers", "gens"]) if (Array.isArray(ship?.[group])) out.push(ship[group]);
  for (const drone of user?.drones?.items || []) {
    const fit = drone?.fitsByHangar?.[String(hangar.id)]?.[config] || drone?.fits?.[config] || drone?.fit;
    if (Array.isArray(fit?.equipment)) out.push(fit.equipment);
  }
  if (user?.pet?.owned === true) {
    const fit = user?.pet?.fitsByHangar?.[String(hangar.id)]?.[config] || user?.pet?.fits?.[config] || user?.pet?.fit;
    for (const group of ["lasers", "generators"]) if (Array.isArray(fit?.[group])) out.push(fit[group]);
  }
  return out;
}

// Exemplaires montés améliorés : dans chaque hangar / configuration qui
// utilise plus de `ownedAfter` copies de `id`, l'excédent devient `nextId`
// (vaisseau d'abord, puis drones, puis P.E.T).
function promoteEquippedCopies(data, id, nextId, ownedAfter) {
  let promoted = 0;
  for (const hangar of data?.hangars || []) for (const config of ["1", "2"]) {
    const arrays = upgradableFitArrays(data, hangar, config);
    let used = 0;
    for (const arr of arrays) for (const v of arr) if (String(v || "") === id) used++;
    let excess = used - ownedAfter;
    for (const arr of arrays) {
      for (let i = 0; i < arr.length && excess > 0; i++) {
        if (String(arr[i] || "") === id) { arr[i] = nextId; excess--; promoted++; }
      }
    }
  }
  return promoted;
}

// Applique l'amélioration de `quantity` exemplaires de itemId : les libres
// d'abord, puis les exemplaires équipés (remplacés sur place).
// Mutation directe de `data` (compte serveur ou local). Retourne
// { error } ou { ok, from, to, quantity, cost }.
// options.equipped : l'exemplaire choisi est un exemplaire monté -> c'est
// lui qui est remplacé dans l'équipement, même s'il reste des copies libres.
export function applyItemUpgrade(data, itemId, quantity, findItem, options = {}) {
  const id = String(itemId || "");
  const { base, level } = parseUpgradeId(id);
  const item = findItem(base);
  if (!isUpgradableItem(item)) return { error: "Cet objet ne s'améliore pas." };
  if (level >= UPGRADE_MAX_LEVEL) return { error: "Niveau maximal atteint." };
  const qty = Math.floor(Number(quantity) || 0);
  if (!Number.isSafeInteger(qty) || qty < 1 || qty > 10_000) return { error: "Quantité invalide." };
  data.inventory ||= {};
  data.inventory.counts ||= {};
  data.inventory.resources ||= {};
  const owned = Math.max(0, Math.floor(Number(data.inventory.counts[id]) || 0));
  if (owned < qty) return { error: "Pas assez d'exemplaires." };
  const unit = upgradeCost(item, level);
  const credits = unit.credits * qty;
  if (Math.max(0, Math.floor(Number(data.credits) || 0)) < credits) return { error: "Crédits insuffisants." };
  for (const [res, amount] of Object.entries(unit.resources)) {
    if (Math.max(0, Math.floor(Number(data.inventory.resources[res]) || 0)) < amount * qty) return { error: `Ressource insuffisante : ${res}.` };
  }
  data.credits = Math.max(0, Math.floor(Number(data.credits) || 0)) - credits;
  for (const [res, amount] of Object.entries(unit.resources)) {
    data.inventory.resources[res] = Math.max(0, Math.floor(Number(data.inventory.resources[res]) || 0)) - amount * qty;
  }
  const next = itemIdAtLevel(base, level + 1);
  data.inventory.counts[id] = owned - qty;
  if (data.inventory.counts[id] <= 0) {
    delete data.inventory.counts[id];
    // Ancienne liste inventory.modules : sinon la migration de chargement
    // recrée counts[id] = 1 (copie fantôme).
    if (Array.isArray(data.inventory.modules)) data.inventory.modules = data.inventory.modules.filter(value => value !== id);
  }
  data.inventory.counts[next] = Math.max(0, Math.floor(Number(data.inventory.counts[next]) || 0)) + qty;
  const reserved = reservedEquippedCopies(data, id);
  const threshold = options?.equipped === true && reserved > 0
    ? Math.max(0, Math.min(owned - qty, reserved - qty))
    : owned - qty;
  const promoted = promoteEquippedCopies(data, id, next, threshold);
  return { ok: true, from: id, to: next, quantity: qty, promoted, cost: { credits, resources: Object.fromEntries(Object.entries(unit.resources).map(([k, v]) => [k, v * qty])) } };
}
