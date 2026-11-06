// SCRIPTS/WINTER_GATE.js — GG d'hiver partagée : le convoi du Père Noël.
// Session horaire (SRC/CORE/WINTER_CONVOY.js, winterGateSession) :
//   :00 -> :05  lobby : entrée ouverte, le convoi attend au départ ;
//   :05         départ commun pour tous les joueurs présents (personne :
//               la session est sautée) ;
//   30 min      run : étapes + vagues cumulatives, les NPC ne visent que
//               le convoi ;
//   fin         chrono écoulé ou convoi détruit : même récompense pour
//               tous les présents, selon la vague atteinte (course contre la
//               montre), puis fermée jusqu'à l'heure suivante (les joueurs
//               restants sont renvoyés à leur base).
// Le contrôleur est branché sur la boucle 50 ms de MULTI_SERVER (room "winter").

import { isWinterEventActive } from "../NPC/NPC_WINTER.js";
import {
  WINTER_CONVOY_DURATION, WINTER_CONVOY_HP, WINTER_CONVOY_LEG, WINTER_CONVOY_SPEED, WINTER_CONVOY_WAVE_HEAL,
  createWinterConvoyRoute, winterConvoyReward, winterConvoyWave, winterGateSession,
} from "../SRC/CORE/WINTER_CONVOY.js";

// Fin de session affichée avant la fermeture (récompense, retour base).
export const WINTER_GATE_DONE_MS = 12000;
// Diffusion de la position du convoi (le client interpole entre deux).
const SEND_RUN_MS = 100;
const SEND_IDLE_MS = 1000;

const gate = {
  phase: "closed", // closed | lobby | run | done
  hourAt: 0,
  startAt: 0,
  endAt: 0,
  route: null,
  dist: 0,
  stopAt: 0,
  moving: false,
  wave: 0,
  reason: "", // fin : "time" (chrono écoulé) | "destroyed" (convoi tombé)
  doneAt: 0,
  convoy: null, // { x, y, vx, vy, angle, hp, hpMax }
  lastTick: 0,
  lastSentAt: 0,
  sentPhase: "",
};

function presentPlayers(room) {
  const list = [];
  for (const [pid, entry] of room || []) {
    if (entry?.state?._posOk === true) list.push(String(pid));
  }
  return list;
}

function placeConvoy() {
  const p = gate.route.pointAt(gate.dist);
  const c = gate.convoy;
  c.angle = p.angle;
  c.x = p.x;
  c.y = p.y;
}

function openLobby(session, sim) {
  gate.phase = "lobby";
  gate.hourAt = session.hourAt;
  gate.startAt = session.startAt;
  gate.endAt = session.endAt;
  gate.route = createWinterConvoyRoute(session.seed);
  gate.dist = 0;
  gate.stopAt = 0;
  gate.moving = false;
  gate.wave = 0;
  gate.reason = "";
  gate.doneAt = 0;
  gate.convoy = { x: 0, y: 0, vx: 0, vy: 0, angle: 0, hp: WINTER_CONVOY_HP, hpMax: WINTER_CONVOY_HP };
  placeConvoy();
  attachSim(sim);
}

function closeGate(sim) {
  gate.phase = "closed";
  gate.convoy = null;
  gate.route = null;
  if (sim) {
    try { sim.clearConvoyAttackers(); } catch {}
    sim.convoy = null;
  }
}

function attachSim(sim) {
  if (!sim) return;
  sim.convoy = gate.convoy;
}

// Départ d'une étape : vague cumulative + prochain arrêt.
function startLeg(sim, ctx) {
  try { sim.spawnConvoyAttackers(winterConvoyWave(gate.wave)); } catch {}
  gate.stopAt = gate.dist + WINTER_CONVOY_LEG;
  gate.moving = true;
}

function finish(reason, room, sim, ctx, now) {
  gate.phase = "done";
  gate.reason = reason;
  gate.doneAt = now;
  if (gate.convoy) { gate.convoy.vx = 0; gate.convoy.vy = 0; }
  try { sim?.clearConvoyAttackers(); } catch {}
  // Même récompense pour tous les joueurs présents, selon la vague atteinte.
  const finalWave = gate.wave + 1;
  const reward = winterConvoyReward(finalWave);
  for (const pid of presentPlayers(room)) {
    try {
      ctx.sendTo(pid, { t: "winterGateReward", hourAt: gate.hourAt, reason, wave: finalWave, reward });
    } catch {}
  }
}

function statePayload(now) {
  const c = gate.convoy;
  return {
    t: "winterGate",
    phase: gate.phase,
    startAt: gate.startAt,
    endAt: gate.endAt,
    nextOpenAt: winterGateSession(now).nextOpenAt,
    wave: gate.wave + 1,
    reason: gate.reason,
    now,
    ...(c ? {
      x: Math.round(c.x), y: Math.round(c.y),
      vx: Math.round(c.vx), vy: Math.round(c.vy),
      angle: Math.round(c.angle * 1000) / 1000,
      hp: Math.round(c.hp), hpMax: c.hpMax,
    } : null),
  };
}

// Nouvelle heure : nouvelle session (convoi neuf, nouveau circuit). Un run
// finit toujours avant (départ + 30 min) : rien d'autre à conserver.
function rollSession(now, sim) {
  const session = winterGateSession(now);
  if (gate.hourAt === session.hourAt) return false;
  if (gate.phase !== "closed") closeGate(sim);
  if (session.open) openLobby(session, sim);
  else gate.hourAt = session.hourAt;
  return true;
}

// Dernier état (nouveaux arrivants sur la map). Session à jour même si le
// contrôleur n'a pas encore tourné (premier arrivant de l'heure).
export function getWinterGateState(now = Date.now()) {
  if (isWinterEventActive(new Date(now))) rollSession(now, null);
  return statePayload(now);
}

// Entrée autorisée : saison d'hiver et session ouverte (:00 -> :05).
export function winterGateEntryOpen(now = Date.now()) {
  return isWinterEventActive(new Date(now)) && winterGateSession(now).open;
}

export function tickWinterGate(room, sim, ctx) {
  const now = Date.now();
  const dt = gate.lastTick ? Math.max(0, Math.min(0.5, (now - gate.lastTick) / 1000)) : 0;
  gate.lastTick = now;
  try {
    tickInner(room, sim, ctx, now, dt);
  } finally {
    const every = gate.phase === "run" ? SEND_RUN_MS : SEND_IDLE_MS;
    if (gate.phase !== gate.sentPhase || now - gate.lastSentAt >= every) {
      gate.sentPhase = gate.phase;
      gate.lastSentAt = now;
      try { ctx.broadcast(statePayload(now)); } catch {}
    }
  }
}

function tickInner(room, sim, ctx, now, dt) {
  if (!sim || typeof sim.spawnConvoyAttackers !== "function") return;
  const session = winterGateSession(now);
  if (!isWinterEventActive(new Date(now))) {
    if (gate.phase !== "closed") closeGate(sim);
    return;
  }
  if (rollSession(now, sim)) return;
  // Session changée hors tick (arrivant) : restes de l'ancienne retirés.
  if (sim.convoy !== gate.convoy) {
    try { sim.clearConvoyAttackers(); } catch {}
    attachSim(sim);
  }
  const present = presentPlayers(room);

  if (gate.phase === "lobby") {
    if (now < gate.startAt) return;
    // Départ commun ; personne au rendez-vous : session sautée.
    if (!present.length) {
      closeGate(sim);
      return;
    }
    gate.phase = "run";
    gate.wave = 0;
    startLeg(sim, ctx);
    return;
  }

  if (gate.phase === "run") {
    const c = gate.convoy;
    // Tout le monde est parti : session abandonnée.
    if (!present.length) {
      closeGate(sim);
      return;
    }
    if (!(c.hp > 0)) {
      finish("destroyed", room, sim, ctx, now);
      return;
    }
    if (now >= gate.startAt + WINTER_CONVOY_DURATION * 1000) {
      finish("time", room, sim, ctx, now);
      return;
    }
    // Dernier attaquant tué : le convoi récupère 10 % de sa vie max (+0 s'il
    // est plein), puis vague suivante (cumulative) avec une étape.
    if (sim.convoyAttackersAlive() === 0) {
      const healed = Math.min(c.hpMax - c.hp, Math.round(c.hpMax * WINTER_CONVOY_WAVE_HEAL));
      c.hp += healed;
      try { ctx.broadcast({ t: "winterGateHeal", amount: Math.max(0, healed) }); } catch {}
      gate.wave++;
      startLeg(sim, ctx);
    }
    // Bout d'étape atteint, vague encore en vie : le convoi l'attend.
    if (!gate.moving) {
      c.vx = 0;
      c.vy = 0;
      return;
    }
    const x0 = c.x, y0 = c.y;
    gate.dist = Math.min(gate.stopAt, gate.dist + WINTER_CONVOY_SPEED * dt);
    if (gate.dist >= gate.stopAt) gate.moving = false;
    placeConvoy();
    c.vx = dt > 0 ? (c.x - x0) / dt : 0;
    c.vy = dt > 0 ? (c.y - y0) / dt : 0;
    return;
  }

  if (gate.phase === "done") {
    if (now - gate.doneAt >= WINTER_GATE_DONE_MS) {
      closeGate(sim);
      gate.hourAt = session.hourAt;
    }
  }
}
