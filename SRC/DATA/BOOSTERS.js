// SRC/DATA/BOOSTERS.js
"use strict";

// Boosters officiels DarkOrbit (lexique FR) : chaque achat en boutique
// AJOUTE sa durée au timer actif (prolonge si déjà actif, démarre sinon).
// Effet en temps réel, même hors ligne — comme l'officiel. Les variantes
// d'une meme famille s'additionnent (+10 % et +10 % = +20 %).
// Ordre = rangement boutique + fenêtre : regroupés par famille.
export const BOOSTERS = Object.freeze([
  // ---- Dégâts ----
  {
    id: "dmg",
    code: "DMG-B01",
    name: "Booster Dégâts",
    desc: "Dégâts laser +10 % pendant 1 h.",
    price: 2000000,
    durationSec: 3600,
    icon: "/ASSETS/BOOSTERS/dmg.png",
    iconMini: "/ASSETS/BOOSTERS/CAT/dmg.png",
    effect: Object.freeze({ dmgPct: 10 }),
  },
  {
    id: "dmg2",
    code: "DMG-B02",
    name: "Booster Dégâts B02",
    desc: "Dégâts laser +10 % pendant 1 h. Bonus de groupe : +1 % dégâts. Partage de groupe indisponible en solo.",
    price: 2000000,
    durationSec: 3600,
    icon: "/ASSETS/BOOSTERS/dmg2.png",
    iconMini: "/ASSETS/BOOSTERS/CAT/dmg.png",
    effect: Object.freeze({ dmgPct: 10 }),
  },
  {
    id: "dmgdlb",
    code: "DMG-DLB1",
    name: "Booster Dégâts DLB",
    desc: "Dégâts laser +5 % pendant 1 h.",
    price: 1000000,
    durationSec: 3600,
    icon: "/ASSETS/BOOSTERS/dmgdlb.png",
    iconMini: "/ASSETS/BOOSTERS/CAT/dmg.png",
    effect: Object.freeze({ dmgPct: 5 }),
  },
  {
    id: "dmgdlb2",
    code: "DMG-DLB2",
    name: "Booster Dégâts DLB2",
    desc: "Dégâts laser +5 % pendant 1 h.",
    price: 1000000,
    durationSec: 3600,
    icon: "/ASSETS/BOOSTERS/dmgdlb2.png",
    iconMini: "/ASSETS/BOOSTERS/CAT/dmg.png",
    effect: Object.freeze({ dmgPct: 5 }),
  },
  {
    id: "dmgh",
    code: "DMG-H01",
    name: "Booster Précision",
    desc: "Dégâts +2 % et précision laser +8 % pendant 1 h.",
    price: 2000000,
    durationSec: 3600,
    icon: "/ASSETS/BOOSTERS/dmgh.png",
    iconMini: "/ASSETS/BOOSTERS/CAT/dmg.png",
    effect: Object.freeze({ dmgPct: 2, hitPct: 8 }),
  },
  {
    id: "npc",
    code: "NPC-B01",
    name: "Booster Dégâts NPC",
    desc: "Dégâts +10 % pendant 1 h (toutes les cibles du jeu sont des NPC).",
    price: 1500000,
    durationSec: 3600,
    icon: "/ASSETS/BOOSTERS/npc.png",
    iconMini: "/ASSETS/BOOSTERS/CAT/dmg.png",
    effect: Object.freeze({ dmgPct: 10 }),
  },
  {
    id: "npcb2",
    code: "NPC-B02",
    name: "Booster Dégâts NPC B02",
    desc: "Dégâts +10 % pendant 1 h (toutes les cibles du jeu sont des NPC).",
    price: 1500000,
    durationSec: 3600,
    icon: "/ASSETS/BOOSTERS/npc.png",
    iconMini: "/ASSETS/BOOSTERS/CAT/dmg.png",
    effect: Object.freeze({ dmgPct: 10 }),
  },
  // ---- Bouclier ----
  {
    id: "shd",
    code: "SHD-B01",
    name: "Booster Bouclier",
    desc: "Bouclier max +25 % pendant 1 h.",
    price: 1500000,
    durationSec: 3600,
    icon: "/ASSETS/BOOSTERS/shd.png",
    iconMini: "/ASSETS/BOOSTERS/CAT/shd.png",
    effect: Object.freeze({ shieldPct: 25 }),
  },
  {
    id: "shd2",
    code: "SHD-B02",
    name: "Booster Bouclier B02",
    desc: "Bouclier max +25 % pendant 1 h. Bonus de groupe : +2 % bouclier. Partage de groupe indisponible en solo.",
    price: 1500000,
    durationSec: 3600,
    icon: "/ASSETS/BOOSTERS/shd2.png",
    iconMini: "/ASSETS/BOOSTERS/CAT/shd.png",
    effect: Object.freeze({ shieldPct: 25 }),
  },
  {
    id: "shddlb",
    code: "SHD-DLB",
    name: "Booster Bouclier DLB",
    desc: "Bouclier max +25 % pendant 1 h.",
    price: 1500000,
    durationSec: 3600,
    icon: "/ASSETS/BOOSTERS/shddlb.png",
    iconMini: "/ASSETS/BOOSTERS/CAT/shd.png",
    effect: Object.freeze({ shieldPct: 25 }),
  },
  // ---- Coque ----
  {
    id: "hp",
    code: "HP-B01",
    name: "Booster Coque",
    desc: "Points de vie max +10 % pendant 1 h.",
    price: 1500000,
    durationSec: 3600,
    icon: "/ASSETS/BOOSTERS/hp.png",
    iconMini: "/ASSETS/BOOSTERS/CAT/hp.png",
    effect: Object.freeze({ hpPct: 10 }),
  },
  {
    id: "hp2",
    code: "HP-B02",
    name: "Booster Coque B02",
    desc: "Points de vie max +10 % pendant 1 h. Bonus de groupe : +1 % coque. Partage de groupe indisponible en solo.",
    price: 1500000,
    durationSec: 3600,
    icon: "/ASSETS/BOOSTERS/hp2.png",
    iconMini: "/ASSETS/BOOSTERS/CAT/hp.png",
    effect: Object.freeze({ hpPct: 10 }),
  },
  {
    id: "hpdlb",
    code: "HP-DLB",
    name: "Booster Coque DLB",
    desc: "Points de vie max +10 % pendant 1 h.",
    price: 1500000,
    durationSec: 3600,
    icon: "/ASSETS/BOOSTERS/hpdlb.png",
    iconMini: "/ASSETS/BOOSTERS/CAT/hp.png",
    effect: Object.freeze({ hpPct: 10 }),
  },
  // ---- Expérience ----
  {
    id: "ep",
    code: "EP-B01",
    name: "Booster Expérience",
    desc: "Expérience gagnée +10 % pendant 1 h.",
    price: 1000000,
    durationSec: 3600,
    icon: "/ASSETS/BOOSTERS/ep.png",
    iconMini: "/ASSETS/BOOSTERS/CAT/ep.png",
    effect: Object.freeze({ expPct: 10 }),
  },
  {
    id: "ep2",
    code: "EP-B02",
    name: "Booster Expérience B02",
    desc: "Expérience gagnée +10 % pendant 1 h. Bonus de groupe : +5 % expérience. Partage de groupe indisponible en solo.",
    price: 1000000,
    durationSec: 3600,
    icon: "/ASSETS/BOOSTERS/ep2.png",
    iconMini: "/ASSETS/BOOSTERS/CAT/ep.png",
    effect: Object.freeze({ expPct: 10 }),
  },
  {
    id: "ep50",
    code: "EP-50",
    name: "Booster Expérience 50",
    desc: "Expérience gagnée +50 % pendant 1 h.",
    price: 8000000,
    durationSec: 3600,
    icon: "/ASSETS/BOOSTERS/ep50.png",
    iconMini: "/ASSETS/BOOSTERS/CAT/ep.png",
    effect: Object.freeze({ expPct: 50 }),
  },
  {
    id: "epdlb",
    code: "EP-DLB1",
    name: "Booster Expérience DLB",
    desc: "Expérience gagnée +25 % pendant 1 h.",
    price: 3000000,
    durationSec: 3600,
    icon: "/ASSETS/BOOSTERS/epdlb.png",
    iconMini: "/ASSETS/BOOSTERS/CAT/ep.png",
    effect: Object.freeze({ expPct: 25 }),
  },
  {
    id: "ephon",
    code: "EPHON-1",
    name: "Booster Expérience + Honneur",
    desc: "Expérience +100 % et honneur +100 % pendant 1 h.",
    price: 20000000,
    durationSec: 3600,
    icon: "/ASSETS/BOOSTERS/ephon.png",
    iconMini: "/ASSETS/BOOSTERS/CAT/ep.png",
    effect: Object.freeze({ expPct: 100, honorPct: 100 }),
  },
  // ---- Honneur ----
  {
    id: "hon",
    code: "HON-B01",
    name: "Booster Honneur",
    desc: "Honneur gagné +10 % pendant 1 h.",
    price: 1000000,
    durationSec: 3600,
    icon: "/ASSETS/BOOSTERS/hon.png",
    iconMini: "/ASSETS/BOOSTERS/CAT/hon.png",
    effect: Object.freeze({ honorPct: 10 }),
  },
  {
    id: "hon2",
    code: "HON-B02",
    name: "Booster Honneur B02",
    desc: "Honneur gagné +10 % pendant 1 h. Bonus de groupe : +5 % expérience. Partage de groupe indisponible en solo.",
    price: 1000000,
    durationSec: 3600,
    icon: "/ASSETS/BOOSTERS/hon2.png",
    iconMini: "/ASSETS/BOOSTERS/CAT/hon.png",
    effect: Object.freeze({ honorPct: 10 }),
  },
  {
    id: "hon50",
    code: "HON-50",
    name: "Booster Honneur 50",
    desc: "Honneur gagné +50 % pendant 1 h.",
    price: 8000000,
    durationSec: 3600,
    icon: "/ASSETS/BOOSTERS/hon50.png",
    iconMini: "/ASSETS/BOOSTERS/CAT/hon.png",
    effect: Object.freeze({ honorPct: 50 }),
  },
  {
    id: "hondlb",
    code: "HON-DLB1",
    name: "Booster Honneur DLB",
    desc: "Honneur gagné +10 % pendant 1 h.",
    price: 1000000,
    durationSec: 3600,
    icon: "/ASSETS/BOOSTERS/hon50.png",
    iconMini: "/ASSETS/BOOSTERS/CAT/hon.png",
    effect: Object.freeze({ honorPct: 10 }),
  },
  // ---- Réparation ----
  {
    id: "rep",
    code: "REP-B01",
    name: "Booster Réparation",
    desc: "Vitesse de réparation du robot +10 % pendant 1 h.",
    price: 1500000,
    durationSec: 3600,
    icon: "/ASSETS/BOOSTERS/rep.png",
    iconMini: "/ASSETS/BOOSTERS/CAT/rep.png",
    effect: Object.freeze({ repairPct: 10 }),
  },
  {
    id: "rep2",
    code: "REP-B02",
    name: "Booster Réparation B02",
    desc: "Vitesse de réparation +10 % pendant 1 h. Bonus de groupe : +1 % réparation. Partage de groupe indisponible en solo.",
    price: 1500000,
    durationSec: 3600,
    icon: "/ASSETS/BOOSTERS/rep2.png",
    iconMini: "/ASSETS/BOOSTERS/CAT/rep.png",
    effect: Object.freeze({ repairPct: 10 }),
  },
  {
    id: "reps",
    code: "REP-S01",
    name: "Booster Réparation S01",
    desc: "Vitesse de réparation +10 % pendant 1 h.",
    price: 1500000,
    durationSec: 3600,
    icon: "/ASSETS/BOOSTERS/reps.png",
    iconMini: "/ASSETS/BOOSTERS/CAT/rep.png",
    effect: Object.freeze({ repairPct: 10 }),
  },
  // ---- Ressources ----
  {
    id: "res",
    code: "RES-B01",
    name: "Booster Ressources",
    desc: "Ressources des cargos NPC +25 % pendant 1 h.",
    price: 1500000,
    durationSec: 3600,
    icon: "/ASSETS/BOOSTERS/res.png",
    iconMini: "/ASSETS/BOOSTERS/CAT/res.png",
    effect: Object.freeze({ resPct: 25 }),
  },
  {
    id: "res2",
    code: "RES-B02",
    name: "Booster Ressources B02",
    desc: "Ressources des cargos NPC +25 % pendant 1 h. Bonus de groupe : +10 % ressources. Partage de groupe indisponible en solo.",
    price: 1500000,
    durationSec: 3600,
    icon: "/ASSETS/BOOSTERS/res2.png",
    iconMini: "/ASSETS/BOOSTERS/CAT/res.png",
    effect: Object.freeze({ resPct: 25 }),
  },
  // ---- Régénération bouclier ----
  {
    id: "sreg",
    code: "SREG-B01",
    name: "Booster Régén Bouclier",
    desc: "Recharge du bouclier (robot) +25 % pendant 1 h.",
    price: 2000000,
    durationSec: 3600,
    icon: "/ASSETS/BOOSTERS/sreg.png",
    iconMini: "/ASSETS/BOOSTERS/CAT/sreg.png",
    effect: Object.freeze({ sregPct: 25 }),
  },
  {
    id: "sreg2",
    code: "SREG-B02",
    name: "Booster Régén Bouclier B02",
    desc: "Recharge du bouclier (robot) +25 % pendant 1 h. Bonus de groupe : +1 %. Partage de groupe indisponible en solo.",
    price: 2000000,
    durationSec: 3600,
    icon: "/ASSETS/BOOSTERS/sreg2.png",
    iconMini: "/ASSETS/BOOSTERS/CAT/sreg.png",
    effect: Object.freeze({ sregPct: 25 }),
  },
  // ---- Bonus box ----
  {
    id: "bb",
    code: "BB-01",
    name: "Booster Bonus Box",
    desc: "Contenu des Bonus Box doublé pendant 1 h.",
    price: 3000000,
    durationSec: 3600,
    icon: "/ASSETS/BOOSTERS/bb.png",
    iconMini: "/ASSETS/BOOSTERS/CAT/bb.png",
    effect: Object.freeze({ boxPct: 100 }),
  },
  // ---- Quêtes ----
  {
    id: "qr",
    code: "QR-01",
    name: "Booster Quêtes",
    desc: "Récompenses de quêtes doublées pendant 1 h.",
    price: 5000000,
    durationSec: 3600,
    icon: "/ASSETS/BOOSTERS/qr.png",
    iconMini: "/ASSETS/BOOSTERS/MINI/qr.png",
    effect: Object.freeze({ questPct: 100 }),
  },
  // ---- Multiple ----
  {
    id: "mul",
    code: "MUL-B03",
    name: "Booster Multiple",
    desc: "Dégâts +5 %, bouclier +5 % et expérience +5 % pendant 1 h.",
    price: 5000000,
    durationSec: 3600,
    icon: "/ASSETS/BOOSTERS/mul.png",
    iconMini: "/ASSETS/BOOSTERS/MINI/mul.png",
    effect: Object.freeze({ dmgPct: 5, shieldPct: 5, expPct: 5 }),
  },
  // ---- XP du P.E.T ----
  {
    id: "pep",
    code: "P-EP-B01",
    name: "Booster XP P.E.T",
    desc: "Expérience du P.E.T +5 % pendant 1 h.",
    price: 1000000,
    durationSec: 3600,
    icon: "/ASSETS/BOOSTERS/pep.png",
    iconMini: "/ASSETS/BOOSTERS/CAT/pep.png",
    effect: Object.freeze({ petXpPct: 5 }),
  },
]);

const BOOSTER_BY_ID = new Map(BOOSTERS.map((b) => [b.id, b]));

export function getBooster(id) {
  return BOOSTER_BY_ID.get(String(id || "").toLowerCase()) || null;
}

// Forme persistée sur le compte : { stock: {id: n}, active: {id: expiresAtMs} }.
export function normalizeBoostersState(raw) {
  const out = { stock: {}, active: {} };
  const stock = raw?.stock;
  if (stock && typeof stock === "object") {
    for (const b of BOOSTERS) {
      const n = Math.floor(Number(stock[b.id] ?? 0));
      out.stock[b.id] = Number.isFinite(n) ? Math.max(0, n) : 0;
    }
  }
  const active = raw?.active;
  if (active && typeof active === "object") {
    for (const b of BOOSTERS) {
      const expiresAt = Math.floor(Number(active[b.id] ?? 0));
      if (Number.isFinite(expiresAt) && expiresAt > 0) out.active[b.id] = expiresAt;
    }
  }
  return out;
}

export function isBoosterActive(boosters, id, now = Date.now()) {
  const expiresAt = Number(boosters?.active?.[String(id)] || 0);
  return expiresAt > now;
}

export function boosterTimeLeftMs(boosters, id, now = Date.now()) {
  return Math.max(0, Number(boosters?.active?.[String(id)] || 0) - now);
}

// Multiplicateurs cumulés des boosters actifs.
// dmg/shield/hp/exp/honor/petXp/repair/res/sreg/box/quest : facteurs (×).
// hit : points additifs de précision laser.
export function activeBoosterMults(boosters, now = Date.now()) {
  const mults = { dmg: 1, shield: 1, hp: 1, exp: 1, honor: 1, repair: 1, res: 1, petXp: 1, hit: 0, sreg: 1, box: 1, quest: 1 };
  if (!boosters?.active) return mults;
  for (const b of BOOSTERS) {
    if (Number(boosters.active[b.id] || 0) <= now) continue;
    const effect = b.effect || {};
    // Cumul ADDITIF : +10 % et +10 % = +20 % affichés et appliqués.
    if (effect.dmgPct) mults.dmg += Number(effect.dmgPct) / 100;
    if (effect.shieldPct) mults.shield += Number(effect.shieldPct) / 100;
    if (effect.hpPct) mults.hp += Number(effect.hpPct) / 100;
    if (effect.expPct) mults.exp += Number(effect.expPct) / 100;
    if (effect.honorPct) mults.honor += Number(effect.honorPct) / 100;
    if (effect.repairPct) mults.repair += Number(effect.repairPct) / 100;
    if (effect.resPct) mults.res += Number(effect.resPct) / 100;
    if (effect.petXpPct) mults.petXp += Number(effect.petXpPct) / 100;
    if (effect.hitPct) mults.hit += Number(effect.hitPct);
    if (effect.sregPct) mults.sreg += Number(effect.sregPct) / 100;
    if (effect.boxPct) mults.box += Number(effect.boxPct) / 100;
    if (effect.questPct) mults.quest += Number(effect.questPct) / 100;
  }
  return mults;
}

export function formatBoosterDuration(durationSec) {
  const total = Math.max(0, Math.floor(Number(durationSec) || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (hours > 0) return `${hours} h${minutes > 0 ? ` ${minutes} min` : ""}`;
  if (minutes > 0) return `${minutes} min`;
  return `${total} s`;
}

export function formatBoosterCountdown(ms) {
  const total = Math.max(0, Math.ceil(Number(ms || 0) / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
}
