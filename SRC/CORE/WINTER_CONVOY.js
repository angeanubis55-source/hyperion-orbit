"use strict";

// ============================================================================
// GG D'HIVER : LE CONVOI DU PÈRE NOËL (map partagée, pilotée par le serveur :
// SCRIPTS/WINTER_GATE.js).
// ============================================================================
// Session horaire commune : entrée ouverte de :00 à :05, départ du convoi à
// :05 pour tous les joueurs présents, fermée le reste de l'heure. Pas de PvP,
// les NPC ne visent que le convoi. Récompense de victoire partagée selon les
// dégâts infligés aux attaquants.
// Survie : le Santa-1100101 tourne sur un circuit fermé (tiré pour chaque
// session, même graine pour tout le monde), en ondulant de gauche à
// droite, par étapes : au départ d'une étape une vague apparaît autour de
// lui et il roule WINTER_CONVOY_LEG px. Dès que le dernier NPC de la vague
// meurt, la vague suivante (un peu plus forte) part aussitôt avec une
// nouvelle étape ; si la vague vit encore au bout de l'étape, il l'attend
// arrêté. Une seule vague à la fois. Les NPC visent le convoi (escorte,
// voir NPC_COMBAT.js).
// Course contre la montre : la GG s'arrête au bout de WINTER_CONVOY_DURATION
// ou quand le convoi tombe ; la récompense dépend de la vague atteinte.
// ============================================================================

export const WINTER_CONVOY_WORLD = Object.freeze({ w: 30000, h: 12000 });

// Durée de la survie (secondes).
export const WINTER_CONVOY_DURATION = 30 * 60;

// Circuit : points répartis autour du centre de la map sur une ellipse,
// rayons et angles perturbés.
export const WINTER_CONVOY_LOOP_POINTS = 8;
const LOOP_RADIUS = Object.freeze({ x: 11000, y: 3800 });
const LOOP_RADIUS_JITTER = 0.25;
const LOOP_ANGLE_JITTER = 0.25;
// Ondulation de part et d'autre du circuit (nulle à chaque virage).
export const WINTER_CONVOY_SWAY = 350;
export const WINTER_CONVOY_SWAY_HALF_WAVE = 1600;

// Lent : bien moins vite que tous ses attaquants (250 au plus lent).
export const WINTER_CONVOY_SPEED = 100;
// Coque seule, pas de bouclier.
export const WINTER_CONVOY_HP = 1000000000;
// Pendant qu'il roule (entre deux arrêts), le convoi regagne cette vie par
// seconde, sans dépasser son maximum.
export const WINTER_CONVOY_MOVE_REGEN = 1000000;
// Taille d'affichage du Santa (sprite natif 289 x 256, pas de source plus
// grande) : au-delà de ~1,3 il devient flou.
export const WINTER_CONVOY_SCALE = 1.3;
export const WINTER_CONVOY_RADIUS = Math.round(60 * WINTER_CONVOY_SCALE);
// Identifiant partagé du convoi (cible serveur des attaquants).
export const WINTER_CONVOY_ID = "winter_convoy";
// Entrée ouverte pendant 5 minutes chaque heure, à partir de la minute
// WINTER_GATE_OPEN_MINUTE (0 : entrée de :00 à :05, départ à :05).
export const WINTER_GATE_OPEN_MINUTE = 0;
export const WINTER_GATE_ENTRY_MS = 5 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const OPEN_OFFSET_MS = WINTER_GATE_OPEN_MINUTE * 60 * 1000;

// Étape : distance roulée avant l'arrêt suivant.
export const WINTER_CONVOY_LEG = 3000;
// Vagues (une par étape), autour du convoi, hors écran. Chaque type arrive à
// sa vague de départ avec son nombre initial, puis gagne 1 NPC toutes les
// `every` vagues (sans plafond).
export const WINTER_CONVOY_SPAWN_DISTANCE = Object.freeze([1100, 1500]);
// [type, vague de départ, nombre initial, +1 toutes les N vagues]
export const WINTER_CONVOY_WAVE_TYPES = Object.freeze([
  ["npc_Convoy_Kristallin", 1, 10, 1],
  ["npc_Convoy_Boss_Kristallin", 3, 3, 2],
  ["npc_Convoy_Kristallon", 5, 1, 3],
  ["npc_Convoy_Boss_Kristallon", 7, 1, 4],
  ["npc_Convoy_Uber_Kristallin", 9, 1, 3],
  ["npc_Convoy_Ice_Meteoroid", 11, 1, 5],
  ["npc_Convoy_Uber_Kristallon", 13, 1, 5],
  ["npc_Convoy_Super_Ice_Meteoroid", 15, 1, 7],
  ["npc_Convoy_Emperor_Kristallon", 17, 1, 9],
  ["npc_Convoy_Ultra_Kristallon", 20, 1, 15],
  ["npc_Convoy_Kristalidzione", 25, 1, 25],
].map((entry) => Object.freeze(entry)));

// Récompense de fin, la même pour tous les joueurs présents : base
// multipliée par la vague finale (vague en cours quand le chrono finit ou
// quand le convoi tombe).
export const WINTER_CONVOY_REWARD = Object.freeze({ credits: 100000, exp: 5000000, honor: 5000, ice: 4000 });

function seededRandom(seed) {
  let a = (Number(seed) >>> 0) || 1;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function newWinterConvoySeed(random = Math.random) {
  return Math.floor(random() * 0x7fffffff) + 1;
}

// Circuit d'une GG (même graine = même circuit) : points de passage,
// longueur d'un tour, et position ondulée (plus cap) après `dist` px
// (tours sans fin : dist modulo la longueur).
export function createWinterConvoyRoute(seed) {
  const rand = seededRandom(seed);
  const { w: W, h: H } = WINTER_CONVOY_WORLD;
  const n = WINTER_CONVOY_LOOP_POINTS;
  const start = rand() * Math.PI * 2;
  const points = Array.from({ length: n }, (_, i) => {
    const a = start + (i + (rand() - 0.5) * LOOP_ANGLE_JITTER) * (Math.PI * 2 / n);
    const k = 1 + (rand() - 0.5) * 2 * LOOP_RADIUS_JITTER;
    return { x: W / 2 + Math.cos(a) * LOOP_RADIUS.x * k, y: H / 2 + Math.sin(a) * LOOP_RADIUS.y * k };
  });

  const segments = [];
  let from = 0;
  for (let i = 0; i < n; i++) {
    const a = points[i], b = points[(i + 1) % n];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    segments.push({
      a, b, from, len, angle: Math.atan2(b.y - a.y, b.x - a.x),
      halfWaves: Math.max(1, Math.round(len / WINTER_CONVOY_SWAY_HALF_WAVE)),
    });
    from += len;
  }
  const length = from;

  const pointAt = (dist) => {
    const d = ((Number(dist) || 0) % length + length) % length;
    const seg = segments.find((s) => d <= s.from + s.len) || segments[segments.length - 1];
    const t = seg.len > 0 ? (d - seg.from) / seg.len : 0;
    // Ondulation : sin(π k t), nulle aux deux bouts du segment (aucun saut
    // de position au virage).
    const k = seg.halfWaves;
    const sway = WINTER_CONVOY_SWAY * Math.sin(Math.PI * k * t);
    const slope = seg.len > 0 ? WINTER_CONVOY_SWAY * Math.PI * k / seg.len * Math.cos(Math.PI * k * t) : 0;
    const nx = -Math.sin(seg.angle), ny = Math.cos(seg.angle);
    return {
      x: seg.a.x + (seg.b.x - seg.a.x) * t + nx * sway,
      y: seg.a.y + (seg.b.y - seg.a.y) * t + ny * sway,
      angle: seg.angle + Math.atan(slope),
    };
  };

  return Object.freeze({ seed, points: Object.freeze(points.map((p) => Object.freeze(p))), length, pointAt });
}

// Nombre de `type` dans la vague n° `n` (1 = première).
export function winterConvoyTypeCount(type, n) {
  const wave = Math.max(1, Math.floor(Number(n) || 1));
  const entry = WINTER_CONVOY_WAVE_TYPES.find(([t]) => t === type);
  if (!entry || wave < entry[1]) return 0;
  const [, from, start, every] = entry;
  return start + Math.floor((wave - from) / every);
}

// Taille de la vague n° `n` (1 = première).
export function winterConvoyWaveCount(n) {
  return WINTER_CONVOY_WAVE_TYPES.reduce((sum, [type]) => sum + winterConvoyTypeCount(type, n), 0);
}

// Vague n° `index` (0 = première) : liste de types à faire apparaître.
export function winterConvoyWave(index) {
  const n = Math.max(0, Math.floor(Number(index) || 0)) + 1;
  const types = [];
  for (const [type] of WINTER_CONVOY_WAVE_TYPES) {
    for (let k = winterConvoyTypeCount(type, n); k > 0; k--) types.push(type);
  }
  return types;
}

// Point d'apparition autour du convoi (dans la map, hors écran).
export function winterConvoySpawnPoint(x, y, random = Math.random) {
  const [d0, d1] = WINTER_CONVOY_SPAWN_DISTANCE;
  const a = random() * Math.PI * 2, d = d0 + random() * (d1 - d0);
  const margin = 400;
  return {
    x: Math.max(margin, Math.min(WINTER_CONVOY_WORLD.w - margin, x + Math.cos(a) * d)),
    y: Math.max(margin, Math.min(WINTER_CONVOY_WORLD.h - margin, y + Math.sin(a) * d)),
  };
}

export function winterConvoyReward(finalWave) {
  const wave = Math.max(0, Math.floor(Number(finalWave) || 0));
  return Object.fromEntries(Object.entries(WINTER_CONVOY_REWARD).map(([k, v]) => [k, v * wave]));
}

// Points givrés d'une box de Noël : 1 par tranche de
// WINTER_FROST_POINT_HP PV max du NPC tué (1 au moins).
export const WINTER_FROST_POINT_HP = 50000;
export function winterFrostPoints(hpMax) {
  return Math.max(1, Math.round(Math.max(0, Number(hpMax) || 0) / WINTER_FROST_POINT_HP));
}

// Session de l'heure en cours (heures pleines : identiques à Paris).
// open = entrée autorisée (avant le départ de :35).
export function winterGateSession(nowMs = Date.now()) {
  // hourAt = ouverture de la session en cours (ou de la dernière).
  const hourAt = Math.floor((Number(nowMs) - OPEN_OFFSET_MS) / HOUR_MS) * HOUR_MS + OPEN_OFFSET_MS;
  const startAt = hourAt + WINTER_GATE_ENTRY_MS;
  return {
    hourAt, startAt,
    endAt: startAt + WINTER_CONVOY_DURATION * 1000,
    nextOpenAt: hourAt + HOUR_MS,
    open: Number(nowMs) < startAt,
    seed: (Math.floor(hourAt / HOUR_MS) % 0x7ffffffe) + 1,
  };
}

// Créneau affiché aux joueurs : { open: ":20", start: ":25" }.
export function winterGateWindowLabel() {
  const mm = (minute) => `:${String(minute % 60).padStart(2, "0")}`;
  return { open: mm(WINTER_GATE_OPEN_MINUTE), start: mm(WINTER_GATE_OPEN_MINUTE + WINTER_GATE_ENTRY_MS / 60000) };
}

// Point d'arrivée des joueurs : juste derrière le convoi à son départ.
export function winterGateArrival(nowMs = Date.now()) {
  const p = createWinterConvoyRoute(winterGateSession(nowMs).seed).pointAt(0);
  const margin = 400;
  return {
    x: Math.max(margin, Math.min(WINTER_CONVOY_WORLD.w - margin, p.x - Math.cos(p.angle) * 500)),
    y: Math.max(margin, Math.min(WINTER_CONVOY_WORLD.h - margin, p.y - Math.sin(p.angle) * 500)),
  };
}

