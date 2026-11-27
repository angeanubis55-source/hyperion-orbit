// SRC/DATA/THANKSGIVING.js — Micro-event « Thanksgiving » (1 semaine).
// Du lundi 23/11/2026 00h01 au dimanche 29/11/2026 23h59 (heure de Paris),
// en même temps que le Hitac enneigée :
// 25 Thanksgiving Box par map, partout où il y a des Bonus Box (voir
// COLLECTABLES.js, flag event "thanksgiving").
// Pur (aucun DOM) : importable côté serveur et côté client.

import { winterParisTime } from "../../NPC/NPC_WINTER.js";

// Mois 0-11 (comme HALLOWEEN_START) : lus aussi par les annonces Discord.
export const THANKSGIVING_START_AT = Object.freeze({ year: 2026, month: 10, day: 23, hour: 0, minute: 1 });
export const THANKSGIVING_END_AT = Object.freeze({ year: 2026, month: 10, day: 29, hour: 23, minute: 59 });
export const THANKSGIVING_START = winterParisTime(2026, 10, 23, 0, 1);
export const THANKSGIVING_END = winterParisTime(2026, 10, 29, 23, 59, 59);

export function isThanksgivingActive(now = new Date()) {
  try {
    // Test / debug serveur : THANKSGIVING_FORCE=1 simule l'event.
    if (typeof process !== "undefined" && process.env && process.env.THANKSGIVING_FORCE === "1") return true;
  } catch {}
  const t = now instanceof Date ? now.getTime() : Number(now);
  return Number.isFinite(t) && t >= THANKSGIVING_START && t <= THANKSGIVING_END;
}
