// NPC/NPC_SUNDAY.js — Mini-event dominical [ UFONIT ], indépendant d'Halloween.
// Tous les dimanches 20h30-22h30 (heure de Paris) : 1 seul UFONIT à la fois
// sur 4-1 / 4-2 / 4-3 / 4-4, respawn instantané après sa mort.
// Pur (aucun DOM) : testable sous Node.

export const SUNDAY_TIME_ZONE = "Europe/Paris";
// Fenêtre hebdo : dimanche, 20h30 inclus à 22h30 exclu (heure de Paris),
// exprimée en minutes depuis minuit pour gérer la demi-heure.
export const SUNDAY_WEEKDAY = 0; // 0 = dimanche
export const SUNDAY_START_MINUTES = 20 * 60 + 30;
export const SUNDAY_END_MINUTES = 22 * 60 + 30;

export const SUNDAY_MAPS = Object.freeze(["4-1", "4-2", "4-3", "4-4"]);

export const SUNDAY_UFONIT_TYPE = "npc_Event_Ufonit";

// Loterie (top 10 dégâts) : 10 % module, 35 % ticket de relance module,
// 55 % rien. Module : 25 % rare, 75 % commun (comme la boutique du passe).
export const SUNDAY_MODULE_CHANCE = 0.10;
export const SUNDAY_TICKET_CHANCE = 0.35;
export const SUNDAY_TICKET_QTY = 1;
export const SUNDAY_RARE_CHANCE = 0.25;

const PARIS_DAY_FMT = new Intl.DateTimeFormat("en-US", {
  timeZone: SUNDAY_TIME_ZONE,
  weekday: "short",
  hour: "numeric",
  minute: "numeric",
  second: "numeric",
  hour12: false,
});

function parisParts(date) {
  const out = {};
  try {
    for (const p of PARIS_DAY_FMT.formatToParts(date)) {
      if (p.type !== "literal") out[p.type] = p.value;
    }
  } catch {}
  return out;
}

export function isSundayEventActive(now = new Date()) {
  try {
    // Test / debug serveur : SUNDAY_FORCE=1 simule la fenêtre.
    if (typeof process !== "undefined" && process.env && process.env.SUNDAY_FORCE === "1") return true;
  } catch {}
  try {
    const t = now instanceof Date ? now : new Date(now);
    if (Number.isNaN(t.getTime())) return false;
    const parts = parisParts(t);
    if (parts.weekday !== "Sun") return false;
    // hour12:false peut donner "24" à minuit : on rabat sur 0-23.
    const hour = Number(parts.hour) % 24;
    const minute = Number(parts.minute);
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) return false;
    const total = hour * 60 + minute;
    return total >= SUNDAY_START_MINUTES && total < SUNDAY_END_MINUTES;
  } catch { return false; }
}

export function isSundayMap(mapId) {
  return SUNDAY_MAPS.includes(String(mapId || "").trim().toLowerCase());
}

export function sundayPickMap(random = Math.random) {
  try {
    const r = typeof random === "function" ? random() : Math.random();
    const index = Math.floor(Number(r) * SUNDAY_MAPS.length);
    return SUNDAY_MAPS[Math.max(0, Math.min(SUNDAY_MAPS.length - 1, index))] || SUNDAY_MAPS[0];
  } catch { return SUNDAY_MAPS[0]; }
}

export function isSundayBossVariant(type) {
  return String(type || "") === SUNDAY_UFONIT_TYPE;
}

// Position de camp aléatoire (marge 80, comme les camps Halloween).
export function sundayCampPos(world, random = Math.random) {
  const w = Number(world?.w) || 11000;
  const h = Number(world?.h) || 7000;
  const r = typeof random === "function" ? random : Math.random;
  const rx = 80 + r() * Math.max(1, w - 160);
  const ry = 80 + r() * Math.max(1, h - 160);
  return {
    x: Math.round(Math.min(Math.max(rx, 80), Math.max(80, w - 80))),
    y: Math.round(Math.min(Math.max(ry, 80), Math.max(80, h - 80))),
  };
}

// Construit le camp unique de l'event (1 seul à la fois sur les 4 maps).
export function buildSundayCamp(world, random = Math.random) {
  const pos = sundayCampPos(world, random);
  return {
    type: SUNDAY_UFONIT_TYPE,
    event: "sunday",
    role: "boss",
    x: pos.x,
    y: pos.y,
    radius: 350,
    respawn: 0,
    maxAlive: 1,
    aggroRange: 700,
    leashRange: 1700,
    aggroHold: 8,
    fixed: false,
    speed: null,
    spawnArea: null,
    spawnMinDistance: 0,
    raidWave: 0,
    hunter: false,
    noRespawn: false,
  };
}
