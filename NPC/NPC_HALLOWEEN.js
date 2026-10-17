"use strict";

// Event Halloween : entre x-3 et x-8 uniquement (1-3..1-8, 2-3..2-8,
// 3-3..3-8 — jamais x-1/x-2, BL, GG, maps spéciales, 4-x, 5-2), du 16/10
// 22h50 au 01/11 23h59 (heure de Paris, chaque année).
//
// Mécanique par map : des Curcubitors spawnent en continu avec des stats
// calibrées à la map. Quand 50 sont tués, tous les normaux sont purgés et
// 3 Boss Curcubitors apparaissent ; une fois les 3 tués, les normaux
// reviennent (compteur remis à zéro).
//
// Pur (aucun DOM/Canvas/window) : testable tel quel sous Node. Le stockage
// localStorage est géré côté moteur.

export const HALLOWEEN_NORMAL_COUNT = 16;
export const HALLOWEEN_BOSS_COUNT = 3;
export const HALLOWEEN_KILLS_FOR_BOSS = 50;
// Barèmes du wiki ; seul le gain en crédits est majoré de 50 % en jeu.
export const HALLOWEEN_CREDIT_MULT = 1.5;

// https://darkorbitwiki.com/aliens/curcubitor/
export const HALLOWEEN_NORMAL_MAP_STATS = Object.freeze({
  3: Object.freeze({ hp: 20000, shield: 15000, bulletDmg: 300, credits: 2500, exp: 2000, honor: 12 }),
  4: Object.freeze({ hp: 32000, shield: 24000, bulletDmg: 600, credits: 4001, exp: 3200, honor: 20 }),
  5: Object.freeze({ hp: 94000, shield: 70500, bulletDmg: 1200, credits: 10751, exp: 8600, honor: 52 }),
  6: Object.freeze({ hp: 180000, shield: 135000, bulletDmg: 3100, credits: 22001, exp: 17601, honor: 106 }),
  7: Object.freeze({ hp: 270000, shield: 202500, bulletDmg: 4300, credits: 33251, exp: 26601, honor: 160 }),
  8: Object.freeze({ hp: 360000, shield: 270000, bulletDmg: 5700, credits: 45000, exp: 36000, honor: 216 }),
});

// https://darkorbitwiki.com/aliens/boss-curcubitor/
// X-2 exclue de l'événement ; mêmes valeurs pour les trois firmes.
export const HALLOWEEN_BOSS_MAP_STATS = Object.freeze({
  3: Object.freeze({ hp: 400000, shield: 300000, bulletDmg: 4000, credits: 409600, exp: 51200, honor: 156 }),
  4: Object.freeze({ hp: 640000, shield: 480000, bulletDmg: 10000, credits: 655361, exp: 81920, honor: 250 }),
  5: Object.freeze({ hp: 1880000, shield: 1410000, bulletDmg: 20000, credits: 1761281, exp: 220160, honor: 672 }),
  6: Object.freeze({ hp: 3600000, shield: 2700000, bulletDmg: 40000, credits: 3604461, exp: 335600, honor: 1246 }),
  7: Object.freeze({ hp: 5400000, shield: 4050000, bulletDmg: 55000, credits: 4447681, exp: 507200, honor: 1884 }),
  8: Object.freeze({ hp: 7200000, shield: 5400000, bulletDmg: 80000, credits: 7400000, exp: 922000, honor: 2864 }),
});

export function halloweenMapStats(level, role) {
  const table = role === "boss" ? HALLOWEEN_BOSS_MAP_STATS
    : role === "normal" ? HALLOWEEN_NORMAL_MAP_STATS : null;
  const stats = table?.[level];
  return stats ? { ...stats, credits: Math.round(stats.credits * HALLOWEEN_CREDIT_MULT) } : null;
}
// Taux de drop des box à bonbons sur les NPC : boss et normaux 100 %.
export const HALLOWEEN_DROP_BOSS_RATE = 1;
export const HALLOWEEN_DROP_NORMAL_RATE = 1;

export const HALLOWEEN_TIME_ZONE = "Europe/Paris";
export const HALLOWEEN_START = Object.freeze({ month: 9, day: 16, hour: 22, minute: 50 }); // TEST : remettre 23h59 apres essai
export const HALLOWEEN_END = Object.freeze({ month: 10, day: 1, hour: 23, minute: 59 });

const halloweenDateFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: HALLOWEEN_TIME_ZONE,
  year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
});

function halloweenDateParts(date) {
  return Object.fromEntries(halloweenDateFormat.formatToParts(date)
    .filter((part) => part.type !== "literal")
    .map((part) => [part.type, Number(part.value)]));
}

// Convertit une date civile de Paris en instant UTC. L'offset est calculé
// pour chaque borne : octobre est en UTC+2, novembre en UTC+1.
function halloweenParisTime(year, month, day, hour = 0, minute = 0, second = 0) {
  const target = Date.UTC(year, month, day, hour, minute, second);
  let timestamp = target;
  for (let i = 0; i < 3; i++) {
    const p = halloweenDateParts(new Date(timestamp));
    const delta = target - Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    timestamp += delta;
    if (!delta) break;
  }
  return timestamp;
}

// Les spawners interrogent ce calendrier à chaque tick : les conversions
// Intl ne sont faites qu'au changement d'année, jamais pour chaque NPC.
let halloweenWindowCache = null;
function halloweenEventWindow(date) {
  const timestamp = date.getTime();
  if (!Number.isFinite(timestamp)) return null;
  if (!halloweenWindowCache || timestamp < halloweenWindowCache.yearStart
      || timestamp >= halloweenWindowCache.yearEnd) {
    const { year } = halloweenDateParts(date);
    const start = HALLOWEEN_START, end = HALLOWEEN_END;
    halloweenWindowCache = {
      yearStart: halloweenParisTime(year, 0, 1),
      yearEnd: halloweenParisTime(year + 1, 0, 1),
      start: halloweenParisTime(year, start.month, start.day, start.hour, start.minute),
      end: halloweenParisTime(year, end.month, end.day, end.hour, end.minute, 59),
    };
  }
  return halloweenWindowCache;
}

const HALLOWEEN_MAP_RE = /^[123]-[3-8]$/;
// Types de l'event : bases + variantes par map (npc_Curcubitor_1_3...).
const HALLOWEEN_TYPE_RE = /^npc_(Boss_)?Curcubitor(_\d+_\d+)?$/;
// Variantes seules (jamais dans les defs de maps) : à purger hors event.
const HALLOWEEN_VARIANT_RE = /^npc_(Boss_)?Curcubitor_\d+_\d+$/;

export function isHalloweenVariantType(type) {
  return HALLOWEEN_VARIANT_RE.test(String(type || ""));
}

// Variante boss uniquement (récompenses façon Invoke : partage + box perso).
export function isHalloweenBossVariant(type) {
  return isHalloweenVariantType(type) && halloweenRoleOf(type) === "boss";
}

export function normalizeHalloweenMapId(mapId) {
  return String(mapId || "").trim().toLowerCase();
}

// Allowlist stricte : x-3..x-8 uniquement.
export function isHalloweenMap(mapId) {
  return HALLOWEEN_MAP_RE.test(normalizeHalloweenMapId(mapId));
}

// Niveau de la map (3..8) pour calibrer vie / dégâts / récompenses.
export function halloweenMapLevel(mapId) {
  const m = normalizeHalloweenMapId(mapId).match(HALLOWEEN_MAP_RE);
  return m ? Number(m[0].split("-")[1]) : null;
}

export function isHalloweenEventActive(now = new Date()) {
  const t = now instanceof Date ? now : new Date(now);
  const window = halloweenEventWindow(t);
  return !!window && t.getTime() >= window.start && t.getTime() <= window.end;
}

// Fin d'event (heure de Paris, chaque année) + compte à rebours.
export function halloweenEventEnd(now = new Date()) {
  const t = now instanceof Date ? now : new Date(now);
  const window = halloweenEventWindow(t);
  return window ? new Date(window.end) : null;
}

export function halloweenCountdown(now = new Date()) {
  const t = now instanceof Date ? now : new Date(now);
  const end = halloweenEventEnd(t);
  if (!end) return { active: false, days: 0, hours: 0, minutes: 0, seconds: 0, endsAt: 0 };
  const s = Math.max(0, Math.floor((end.getTime() - t.getTime()) / 1000));
  return {
    active: isHalloweenEventActive(t),
    days: Math.floor(s / 86400),
    hours: Math.floor(s % 86400 / 3600),
    minutes: Math.floor(s % 3600 / 60),
    seconds: s % 60,
    endsAt: end.getTime(),
  };
}

export function isHalloweenMapActive(mapId, now = new Date()) {
  return isHalloweenMap(mapId) && isHalloweenEventActive(now);
}

// "normal" | "boss" | null (bases + variantes).
export function halloweenRoleOf(type) {
  const t = String(type || "");
  if (!HALLOWEEN_TYPE_RE.test(t)) return null;
  return t.includes("Boss_") ? "boss" : "normal";
}

// "npc_Curcubitor_1_3" -> { role: "normal", level: 3 } ; null sinon.
// Sert aussi aux récompenses serveur (sans NPC_TYPES sous la main).
export function parseHalloweenVariant(type) {
  const m = String(type || "").match(/^npc_(Boss_)?Curcubitor_(\d+)_(\d+)$/);
  if (!m) return null;
  const level = Number(m[3]);
  if (![1, 2, 3].includes(Number(m[2])) || !(level >= 3 && level <= 8)) return null;
  return { role: m[1] ? "boss" : "normal", level };
}

// Nom déterministe de variante (+ les 36 specs x-3..x-8 × normal/boss).
export function halloweenVariantKey(mapId, role) {
  const id = normalizeHalloweenMapId(mapId);
  if (!isHalloweenMap(id) || (role !== "normal" && role !== "boss")) return null;
  const tag = id.replace("-", "_");
  return role === "boss" ? `npc_Boss_Curcubitor_${tag}` : `npc_Curcubitor_${tag}`;
}

export const HALLOWEEN_VARIANT_SPECS = (() => {
  const out = [];
  for (const company of [1, 2, 3]) {
    for (let level = 3; level <= 8; level++) {
      for (const role of ["normal", "boss"]) out.push({ mapId: `${company}-${level}`, role });
    }
  }
  return Object.freeze(out);
})();

function buildHalloweenVariant(base, level, role) {
  const stats = halloweenMapStats(level, role);
  if (!stats) throw new Error(`Barème Halloween introuvable : ${role} x-${level}`);
  const cfg = JSON.parse(JSON.stringify(base));
  // Convention d'affichage : "..::{ Boss X }::.." pour les boss.
  cfg.name = role === "boss" ? "..::{ Boss Curcubitor }::.." : "-=[ Curcubitor ]=-";
  cfg.hp = stats.hp;
  cfg.shield = stats.shield;
  cfg.bulletDmg = stats.bulletDmg;
  cfg.value = stats.credits;
  cfg.exp = stats.exp;
  cfg.honor = stats.honor;
  // Portée : 600 pour les boss, 500 pour les petits (comme le Kristallin).
  cfg.shootRange = role === "boss" ? 600 : 500;
  // Sprite PARTAGE avec la base : un seul chargement pour les 36 variantes.
  cfg.sprite = base.sprite;
  return cfg;
}

export { buildHalloweenVariant };

// Enregistre (une fois) la variante calibrée et retourne son nom de type.
// (Enregistrement statique au chargement de NPC_TYPES : ici, simple lookup.)
export function halloweenVariantFor(mapId, role, npcTypes) {
  const key = halloweenVariantKey(mapId, role);
  if (!key || !npcTypes || typeof npcTypes !== "object") return null;
  if (!npcTypes[key]) {
    const base = npcTypes[role === "boss" ? "npc_Boss_Curcubitor" : "npc_Curcubitor"];
    if (!base) return null;
    npcTypes[key] = buildHalloweenVariant(base, halloweenMapLevel(mapId), role);
  }
  return key;
}

// Types à précharger pour une map (variantes enregistrées au passage).
export function halloweenPreloadTypes(mapId, npcTypes, now = new Date()) {
  if (!isHalloweenMapActive(mapId, now)) return [];
  const out = [];
  for (const role of ["normal", "boss"]) {
    const t = halloweenVariantFor(mapId, role, npcTypes);
    if (t) out.push(t);
  }
  return out;
}

function halloweenCampPos(WORLD, random) {
  const w = Number(WORLD?.w);
  const h = Number(WORLD?.h);
  const pad = 400;
  const rx = pad + random() * Math.max(1, w - pad * 2);
  const ry = pad + random() * Math.max(1, h - pad * 2);
  return {
    x: Math.round(Math.min(Math.max(rx, 80), Math.max(80, w - 80))),
    y: Math.round(Math.min(Math.max(ry, 80), Math.max(80, h - 80))),
  };
}

// Ajoute les camps Halloween à la fin (slots des NPC normaux intacts).
// Camps `fixed` : la densité globale ne les coupe jamais.
export function appendHalloweenCamps(camps = [], WORLD = null, opts = {}) {
  const { random = Math.random, now = new Date(), npcTypes = null, mapId = null } = opts;
  const list = Array.isArray(camps) ? camps.slice() : [];
  if (!isHalloweenMapActive(mapId, now)) return list;
  if (!WORLD || !Number.isFinite(Number(WORLD.w)) || !Number.isFinite(Number(WORLD.h))) return list;
  // Jamais sur les maps de raid (LOW...) : ne pas casser les progressions.
  if (list.some((c) => c && c.raidWave != null)) return list;
  // Idempotent : ne jamais doubler si déjà appliqué.
  if (list.some((c) => c && c.event === "halloween")) return list;
  const normal = halloweenVariantFor(mapId, "normal", npcTypes);
  const boss = halloweenVariantFor(mapId, "boss", npcTypes);
  if (!normal || !boss) return list;
  const push = (type, role) => {
    const pos = halloweenCampPos(WORLD, random);
    list.push({
      type,
      event: "halloween",
      role,
      x: pos.x,
      y: pos.y,
      radius: 350,
      respawn: 0,
      maxAlive: 1,
      aggroRange: 750,
      leashRange: 1700,
      aggroHold: 8,
      // Pas `fixed` : respawn aléatoire sur la map comme les NPC classiques.
      // La densité les garde via le flag `event` (voir UNIVERSE_SIM).
    });
  };
  for (let i = 0; i < HALLOWEEN_NORMAL_COUNT; i++) push(normal, "normal");
  for (let i = 0; i < HALLOWEEN_BOSS_COUNT; i++) push(boss, "boss");
  return list;
}

// État canonique { phase, kills, dead } (recharge fichier / localStorage).
// dead = ids des camps boss déjà tués pendant la phase boss en cours.
export function normalizeHalloweenState(raw) {
  const dead = Array.isArray(raw?.dead)
    ? raw.dead.map((v) => Math.floor(Number(v))).filter((v) => Number.isFinite(v)).slice(0, 8)
    : [];
  return {
    phase: raw?.phase === "boss" ? "boss" : "normal",
    kills: Math.max(0, Math.floor(Number(raw?.kills) || 0)),
    dead,
  };
}
// Machine à états par map : 50 normaux tués -> phase boss (purge + 3 boss) ;
// 3 boss tués -> retour aux normaux. Un boss tué ne respawn PAS pendant sa
// phase (camp mémorisé) : exactement 3 boss par cycle, puis retour aux 50.
export function applyHalloweenKill(state, role, campId = null) {
  const st = normalizeHalloweenState(state);
  if (role === "normal") {
    if (st.phase !== "normal") return { state: st, transition: null };
    st.kills += 1;
    if (st.kills >= HALLOWEEN_KILLS_FOR_BOSS) {
      return { state: { phase: "boss", kills: 0, dead: [] }, transition: "toBoss" };
    }
    return { state: st, transition: null };
  }
  if (role === "boss") {
    if (st.phase !== "boss") return { state: st, transition: null };
    st.kills += 1;
    const id = Math.floor(Number(campId));
    if (Number.isFinite(id) && !st.dead.includes(id)) st.dead.push(id);
    if (st.kills >= HALLOWEEN_BOSS_COUNT) {
      return { state: { phase: "normal", kills: 0, dead: [] }, transition: "toNormal" };
    }
    return { state: st, transition: null };
  }
  return { state: st, transition: null };
}

// Gate de spawn : un camp Halloween ne spawn que dans sa phase, et un camp
// boss déjà tué attend la prochaine phase boss.
export function halloweenCampBlocked(camp, hw) {
  if (!camp || camp.event !== "halloween") return false;
  const phase = hw?.phase === "boss" ? "boss" : "normal";
  if (camp.role === "boss") {
    if (phase !== "boss") return true;
    const id = Math.floor(Number(camp.id));
    return Array.isArray(hw?.dead) && hw.dead.includes(id);
  }
  return phase !== "normal";
}

// Après l'event, les slots persistés peuvent contenir des variantes :
// les retirer pour qu'elles disparaissent vraiment.
export function stripInactiveEventSlots(slots = [], now = new Date()) {
  if (!Array.isArray(slots)) return slots;
  if (isHalloweenEventActive(now)) return slots;
  return slots.filter((s) => !HALLOWEEN_VARIANT_RE.test(String(s?.type)));
}
