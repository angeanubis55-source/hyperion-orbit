import { computeBotCombatMove, computeWallDetour } from "../SRC/CORE/BOT_NAVIGATION.js";

// Même cadence et balistique que BASE_RUN et la salve x1 du joueur.
export const JPC_LASER = Object.freeze({ interval: 1, visualInterval: 0.2, parts: 6, sideOffset: 30, baseSpeed: 4000 });

export function jpcVolleyParts(isPair) {
  return Array.from({ length: JPC_LASER.parts }, (_, i) => ({
    delay: i * JPC_LASER.visualInterval,
    offsets: ((i % 2 === 0) === isPair) ? [-JPC_LASER.sideOffset, JPC_LASER.sideOffset] : [0],
  }));
}

// Portée d'engagement = portée laser réelle (comme botEngageRange).
export function jpcEngageRange(e) {
  return Math.max(0, Number(e?.shootRange) || 700);
}

// Le bot ne fait face et n'engage qu'à partir de cette distance
// (comme BOT_FACE_RANGE / botEngageStartRange : 1400 max).
export function jpcEngageStartRange(e) {
  return Math.min(1400, Math.max(80, jpcEngageRange(e)));
}

// Distance de combat façon bot Kill (cf. botCombatDistance) : on reste hors
// de portée du NPC quand notre laser le permet, sinon collé au max range.
// Sans ça les JPC collaient au 0.82*range par défaut au lieu du 0.90*range
// + marge anti-NPC du vrai bot.
export function jpcCombatDistance(e, target) {
  const laserRange = Math.max(140, Number(e?.shootRange) || 700);
  const npcRange = Math.max(0, Number(target?.shootRange) || 0);
  return Math.max(140, Math.min(laserRange - 5, Math.max(laserRange * 0.90, npcRange + 70)));
}
// Le délai hors combat ne contribue jamais au premier tick de réparation.
// Les gains réellement appliqués sont exposés (jpcRepairGainHp/Sh) pour les
// chiffres flottants +x façon vrai joueur (solo : locké, multi : feed heal).
export function tickJpcRepair(e, dt, calmSeconds) {
  e.jpcRepairGainHp = 0;
  e.jpcRepairGainSh = 0;
  const elapsed = Math.max(0, Number(dt) || 0);
  if (calmSeconds < 10) { e.jpcRepairTick = 0; return; }
  const activeDt = Math.min(elapsed, Math.max(0, calmSeconds - 10));
  e.jpcRepairTick = (Number(e.jpcRepairTick) || 0) + activeDt;
  const ticks = Math.floor(e.jpcRepairTick + 1e-9);
  if (!ticks) return;
  e.jpcRepairTick = Math.max(0, e.jpcRepairTick - ticks);
  const hpBefore = Number(e.hp) || 0, shBefore = Number(e.sh) || 0;
  e.hp = Math.min(e.hpMax, e.hp + e.hpMax * 0.05 * ticks);
  e.sh = Math.min(e.shMax, e.sh + e.shMax * 0.05 * ticks);
  e.jpcRepairGainHp = Math.max(0, Math.round(Number(e.hp) - hpBefore));
  e.jpcRepairGainSh = Math.max(0, Math.round(Number(e.sh) - shBefore));
}

export function jpcTravel(e, tx, ty, dt, world, walls = [], opts = {}) {
  e.jpcNavigation ||= {};
  const nav = e.jpcNavigation;
  const step = Math.max(0, Number(dt) || 0);
  // Facteur humain 0 (combat : trajectoire pure) … 1 (patrouille : pauses,
  // détours, allure irrégulière comme un vrai joueur). Fuite = 0.3 (léger
  // zigzag, jamais d'arrêt).
  const human = Math.max(0, Math.min(1, Number(opts?.human ?? 0)));
  // Micro-pause façon joueur (check carte/soute/chat) : 0.5-1.5 s toutes
  // les 12-25 s, patrouille uniquement.
  if (human >= 1) {
    if (!(Number(nav.pauseIn) > 0)) nav.pauseIn = 12 + Math.random() * 13;
    nav.pauseIn = Math.max(0, nav.pauseIn - step);
    if (nav.pauseIn <= 0) {
      nav.pauseLeft = 0.5 + Math.random();
      nav.pauseIn = 12 + Math.random() * 13;
    }
    if (Number(nav.pauseLeft) > 0) {
      nav.pauseLeft = Math.max(0, Number(nav.pauseLeft) - step);
      return { mx: 0, my: 0, spd: 0 };
    }
  }
  // Écart de cap (on ne vole jamais parfaitement droit) + allure
  // irrégulière (90-110 %). Réévalué au timer uniquement (8-15 s en
  // patrouille, 2-4 s en fuite) : entre deux, cap fixe, grandes lignes
  // droites. En patrouille l'écart est rare (20 %) et doux (≤ 200 m de
  // côté, point lointain) → grandes courbes, pas de zigzag.
  let gx = Number(tx), gy = Number(ty);
  if (human > 0) {
    const patrol = human >= 1;
    nav.detourIn = Math.max(0, Number(nav.detourIn ?? 0) - step);
    if (nav.detour?.x != null
      && Math.hypot(Number(nav.detour.x) - Number(e.x), Number(nav.detour.y) - Number(e.y)) < 60) {
      nav.detour = null;
    }
    if (nav.detour == null && nav.detourIn <= 0) {
      nav.pace = 0.9 + Math.random() * 0.2;
      nav.detourIn = patrol ? 8 + Math.random() * 7 : 2 + Math.random() * 2;
      const p = patrol ? 0.2 : 0.15;
      if (Math.random() < p) {
        const dx = gx - Number(e.x), dy = gy - Number(e.y), d = Math.hypot(dx, dy) || 1;
        const side = Math.random() < 0.5 ? -1 : 1;
        const off = patrol ? 80 + Math.random() * 120 : (150 + Math.random() * 200) * 0.6;
        const along = patrol ? Math.min(d * 0.7, 800 + Math.random() * 800) : Math.min(d * 0.5, 400 + Math.random() * 400);
        nav.detour = {
          x: Number(e.x) + (dx / d) * along + (-dy / d) * side * off,
          y: Number(e.y) + (dy / d) * along + (dx / d) * side * off,
        };
      }
    }
    if (nav.detour?.x != null) { gx = nav.detour.x; gy = nav.detour.y; }
  }
  const goal = computeWallDetour({ fromX: e.x, fromY: e.y, toX: gx, toY: gy,
    radius: e.r || 20, walls, state: e.jpcNavigation, dt,
    bounds: { minX: 60, minY: 60, maxX: world.w - 60, maxY: world.h - 60 } });
  const dx = goal.x - e.x, dy = goal.y - e.y, distance = Math.hypot(dx, dy);
  if (distance <= 0.01 || goal.unreachable) return { mx: 0, my: 0, spd: 0 };
  // Dernier pas limité au point d'arrivée, allure humaine sinon.
  const pace = human > 0 ? Number(nav.pace) || 1 : 1;
  const spd = Math.min(Number(e.speed) * pace, distance / Math.max(1e-6, dt));
  e.angle = Math.atan2(dy, dx);
  return { mx: dx / distance, my: dy / distance, spd };
}

export function jpcCombatMove(e, target, dt, world, walls = [], desiredDistance = null) {
  const range = Math.max(140, Number(e?.shootRange) || 700);
  const move = computeBotCombatMove({ player: e, npc: target, range,
    desiredDistance: desiredDistance ?? undefined,
    state: e.jpcCombatState || {}, dt, walls, shipRadius: e.r || 20,
    bounds: { minX: 0, minY: 0, maxX: world.w, maxY: world.h, margin: 120 } });
  e.jpcCombatState = move.state;
  const result = jpcTravel(e, move.x, move.y, dt, world, walls);
  // Comme le bot Kill : on ne fait face à la cible qu'une fois à portée
  // d'engagement. Au-delà (navigation / contournement), on regarde où on va.
  const d = Math.hypot(Number(target?.y || 0) - e.y, Number(target?.x || 0) - e.x);
  if (d <= Math.min(1400, Math.max(80, range))) e.angle = Math.atan2(target.y - e.y, target.x - e.x);
  return result;
}
