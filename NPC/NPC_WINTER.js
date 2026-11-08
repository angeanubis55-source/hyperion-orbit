// NPC/NPC_WINTER.js — Saison d'hiver, indépendante d'Halloween et du dimanche.
// Du 02/11 00h01 au 31/01 23h59 (heure de Paris, chaque année) :
//   - neige/verglas par-dessus les portails NORMAUX (SRC/CORE/PORTAL_SKINS.js) ;
//   - en plus des NPC classiques, 1 seul NPC d'hiver à la fois par paire de
//     maps, sur une map de la paire tirée au hasard (comme l'UFONIT du
//     dimanche), respawn instantané après sa mort :
//       Ice Meteoroid en 1-6/1-7, 2-6/2-7 et 3-6/3-7 ;
//       Super Ice Meteoroid en 4-4/4-5.
// Pur (aucun DOM) : testable sous Node, importable côté client.

export const WINTER_TIME_ZONE = "Europe/Paris";
export const WINTER_START = Object.freeze({ month: 10, day: 2, hour: 0, minute: 1 });
export const WINTER_END = Object.freeze({ month: 0, day: 31, hour: 23, minute: 59 });

export const WINTER_METEOROID_TYPE = "npc_Ice_Meteoroid";
export const WINTER_SUPER_METEOROID_TYPE = "npc_Super_Ice_Meteoroid";

// Une paire = un NPC d'hiver (contrôleur indépendant par paire).
export const WINTER_SPAWN_GROUPS = Object.freeze([
  Object.freeze({ maps: Object.freeze(["1-6", "1-7"]), type: WINTER_METEOROID_TYPE }),
  Object.freeze({ maps: Object.freeze(["2-6", "2-7"]), type: WINTER_METEOROID_TYPE }),
  Object.freeze({ maps: Object.freeze(["3-6", "3-7"]), type: WINTER_METEOROID_TYPE }),
  Object.freeze({ maps: Object.freeze(["4-4", "4-5"]), type: WINTER_SUPER_METEOROID_TYPE }),
]);
export const WINTER_MAP_GROUPS = Object.freeze(WINTER_SPAWN_GROUPS.map((g) => g.maps));
export const WINTER_MAPS = Object.freeze(WINTER_MAP_GROUPS.flat());
export const WINTER_TYPES = Object.freeze([...new Set(WINTER_SPAWN_GROUPS.map((g) => g.type))]);

const winterDateFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: WINTER_TIME_ZONE,
  year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
});

export function winterDateParts(date) {
  return Object.fromEntries(winterDateFormat.formatToParts(date)
    .filter((part) => part.type !== "literal")
    .map((part) => [part.type, Number(part.value)]));
}

// Date civile de Paris -> instant UTC (offset recalculé : hiver UTC+1).
export function winterParisTime(year, month, day, hour = 0, minute = 0, second = 0) {
  const target = Date.UTC(year, month, day, hour, minute, second);
  let timestamp = target;
  for (let i = 0; i < 3; i++) {
    const p = winterDateParts(new Date(timestamp));
    const delta = target - Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    timestamp += delta;
    if (!delta) break;
  }
  return timestamp;
}

// Appelé à chaque frame (portails) et à chaque tick serveur : conversions
// Intl seulement au changement d'année. La saison chevauche deux années :
// on garde la fenêtre qui finit en janvier de l'année courante et celle
// qui commence en novembre de l'année courante.
let winterWindowCache = null;
function winterWindows(date) {
  const timestamp = date.getTime();
  if (!Number.isFinite(timestamp)) return null;
  if (!winterWindowCache || timestamp < winterWindowCache.yearStart
      || timestamp >= winterWindowCache.yearEnd) {
    const { year } = winterDateParts(date);
    const s = WINTER_START, e = WINTER_END;
    winterWindowCache = {
      yearStart: winterParisTime(year, 0, 1),
      yearEnd: winterParisTime(year + 1, 0, 1),
      windows: [
        [winterParisTime(year - 1, s.month, s.day, s.hour, s.minute), winterParisTime(year, e.month, e.day, e.hour, e.minute, 59)],
        [winterParisTime(year, s.month, s.day, s.hour, s.minute), winterParisTime(year + 1, e.month, e.day, e.hour, e.minute, 59)],
      ],
    };
  }
  return winterWindowCache.windows;
}

export function isWinterEventActive(now = new Date()) {
  try {
    // Test / debug serveur : WINTER_FORCE=1 simule la saison.
    if (typeof process !== "undefined" && process.env && process.env.WINTER_FORCE === "1") return true;
  } catch {}
  try {
    const t = now instanceof Date ? now : new Date(now);
    const windows = winterWindows(t);
    if (!windows) return false;
    const ms = t.getTime();
    return windows.some(([start, end]) => ms >= start && ms <= end);
  } catch { return false; }
}

export function isWinterMap(mapId) {
  return WINTER_MAPS.includes(String(mapId || "").trim().toLowerCase());
}

// Tirage équiprobable d'une map dans la paire donnée.
export function winterPickMap(group, random = Math.random) {
  const maps = Array.isArray(group) && group.length ? group : WINTER_MAP_GROUPS[0];
  try {
    const r = typeof random === "function" ? random() : Math.random();
    const index = Math.floor(Number(r) * maps.length);
    return maps[Math.max(0, Math.min(maps.length - 1, index))] || maps[0];
  } catch { return maps[0]; }
}

// NPC d'hiver de la paire qui contient cette map (null hors paires).
export function winterTypeForMap(mapId) {
  const id = String(mapId || "").trim().toLowerCase();
  return WINTER_SPAWN_GROUPS.find((g) => g.maps.includes(id))?.type || null;
}

// Types à précharger côté client sur une map d'hiver pendant la saison.
export function winterPreloadTypes(mapId, now = new Date()) {
  const type = winterTypeForMap(mapId);
  return type && isWinterEventActive(now) ? [type] : [];
}

// Camp de la saison (1 seul à la fois par paire de maps). Réglages
// d'un camp classique de map ; position tirée au hasard (marge 300).
export function buildWinterCamp(world, random = Math.random, type = WINTER_METEOROID_TYPE) {
  const w = Number(world?.w) || 11000;
  const h = Number(world?.h) || 7000;
  const r = typeof random === "function" ? random : Math.random;
  const pad = 300;
  return {
    type,
    event: "winter",
    roaming: true,
    x: Math.round(pad + r() * Math.max(1, w - 2 * pad)),
    y: Math.round(pad + r() * Math.max(1, h - 2 * pad)),
    radius: 350,
    respawn: 0,
    maxAlive: 1,
    aggroRange: 750,
    leashRange: 1700,
    aggroHold: 8,
  };
}
