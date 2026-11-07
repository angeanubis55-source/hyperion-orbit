// SCRIPTS/WINTER_GATE.js — GG d'hiver partagée : le convoi du Père Noël.
// Deux sessions par heure (SRC/CORE/WINTER_CONVOY.js, winterGateSession) :
//   :00 -> :05  lobby : entrée ouverte, le convoi attend au départ (idem
//               :30 -> :35) ;
//   :05 / :35   départ commun pour tous les joueurs présents (personne :
//               la session est sautée) ;
//   25 min      run : étapes + vagues, les NPC ne visent que le convoi ;
//   fin         chrono écoulé ou convoi détruit : même récompense pour
//               tous les présents, selon la vague atteinte (course contre la
//               montre), puis fermée jusqu'à la session suivante (les joueurs
//               restants sont renvoyés à leur base).
// Le contrôleur est branché sur la boucle 50 ms de MULTI_SERVER (room "winter").

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { isWinterEventActive } from "../NPC/NPC_WINTER.js";
import {
  WINTER_CONVOY_DURATION, WINTER_CONVOY_HP, WINTER_CONVOY_LEG, WINTER_CONVOY_SPEED, WINTER_CONVOY_WORLD,
  createWinterConvoyRoute, winterConvoyReward, winterConvoyWave, winterGateSession,
} from "../SRC/CORE/WINTER_CONVOY.js";

// Fin de session affichée avant la fermeture (récompense, retour base).
export const WINTER_GATE_DONE_MS = 12000;
// Diffusion de la position du convoi (le client interpole entre deux).
const SEND_RUN_MS = 100;
const SEND_IDLE_MS = 1000;
// Session sauvegardée sur disque : un redémarrage serveur pendant la GG la
// reprend (même convoi, même vague) au lieu de renvoyer tout le monde à la base.
const STATE_FILE = process.env.ORBIT_WINTER_GATE_FILE || join(process.env.ORBIT_DATA_DIR || "SERVER_DATA", "winter_gate.json");
const PERSIST_MS = 2000;
// Après une reprise : le temps que les navigateurs rechargent et se reconnectent.
const RESTORE_GRACE_MS = 120000;

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
  savedAt: 0,
  savedPhase: "",
  restoredUntil: 0, // reprise : absents tolérés jusqu'à cette date
  respawnWave: false, // reprise en run : vague en cours à refaire apparaître
  players: [], // ids des joueurs présents (sauvegardés avec la session)
  restoredPlayers: new Set(), // reprise : joueurs qui retournent dans la GG
};

// final : arrêt du serveur. La sauvegarde est figée, sinon les déconnexions
// de l'arrêt fermeraient la session et l'écraseraient avant la sortie.
let persistFrozen = false;
export function persistWinterGate(now = Date.now(), { final = false } = {}) {
  if (persistFrozen) return;
  if (final) persistFrozen = true;
  gate.savedAt = now;
  gate.savedPhase = gate.phase;
  try {
    const { phase, hourAt, dist, stopAt, moving, wave, reason, doneAt, convoy, players } = gate;
    mkdirSync(dirname(STATE_FILE), { recursive: true });
    writeFileSync(STATE_FILE, JSON.stringify({ phase, hourAt, dist, stopAt, moving, wave, reason, doneAt, players,
      convoy: convoy ? { hp: convoy.hp, hpMax: convoy.hpMax } : null }), "utf8");
  } catch {}
}

function restore(now = Date.now()) {
  try {
    const saved = JSON.parse(readFileSync(STATE_FILE, "utf8") || "{}");
    if (!["lobby", "run", "done"].includes(saved?.phase)) return;
    if (!isWinterEventActive(new Date(now))) return;
    // Même session horaire seulement (circuit et horaires en découlent).
    const session = winterGateSession(now);
    if (Number(saved.hourAt) !== session.hourAt || !(Number(saved.convoy?.hp) >= 0)) return;
    const players = (Array.isArray(saved.players) ? saved.players : []).map(String).slice(0, 200);
    Object.assign(gate, {
      players,
      restoredPlayers: new Set(players),
      phase: saved.phase,
      hourAt: session.hourAt,
      startAt: session.startAt,
      endAt: session.endAt,
      route: createWinterConvoyRoute(session.seed),
      dist: Math.max(0, Number(saved.dist) || 0),
      stopAt: Math.max(0, Number(saved.stopAt) || 0),
      moving: saved.moving === true,
      wave: Math.max(0, Math.floor(Number(saved.wave) || 0)),
      reason: String(saved.reason || ""),
      doneAt: Number(saved.doneAt) || 0,
      convoy: { x: 0, y: 0, vx: 0, vy: 0, angle: 0, hp: Number(saved.convoy.hp), hpMax: Number(saved.convoy.hpMax) || WINTER_CONVOY_HP },
      restoredUntil: now + RESTORE_GRACE_MS,
      respawnWave: saved.phase === "run",
      savedPhase: saved.phase,
    });
    placeConvoy();
  } catch {}
}

// Reprise : ce joueur était dans la GG au redémarrage. Il y retourne même si
// sa dernière sauvegarde de compte n'avait pas encore « winter » (sinon le
// serveur le replaçait sur sa map précédente, ex. 1-1).
export function winterGateRejoin(pid, now = Date.now()) {
  return (gate.phase === "lobby" || gate.phase === "run") && now < gate.restoredUntil
    && gate.restoredPlayers.has(String(pid));
}

// Point de retour : juste derrière le convoi, à sa position actuelle.
export function winterGateRejoinSpot() {
  const c = gate.convoy;
  const margin = 400;
  return {
    x: Math.max(margin, Math.min(WINTER_CONVOY_WORLD.w - margin, c.x - Math.cos(c.angle) * 500)),
    y: Math.max(margin, Math.min(WINTER_CONVOY_WORLD.h - margin, c.y - Math.sin(c.angle) * 500)),
  };
}

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
  gate.players = [];
  gate.restoredPlayers = new Set();
  gate.convoy = { x: 0, y: 0, vx: 0, vy: 0, angle: 0, hp: WINTER_CONVOY_HP, hpMax: WINTER_CONVOY_HP };
  placeConvoy();
  attachSim(sim);
}

function closeGate(sim) {
  gate.phase = "closed";
  gate.convoy = null;
  gate.route = null;
  gate.players = [];
  gate.restoredPlayers = new Set();
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

// Nouvelle période : nouvelle session (convoi neuf, nouveau circuit). Un run
// finit au plus tard à ce moment (départ + 25 min) : rien d'autre à conserver.
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

// Entrée autorisée : saison d'hiver et session ouverte (:00 -> :05, :30 -> :35).
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
    if (gate.phase !== gate.savedPhase || (gate.phase === "run" && now - gate.savedAt >= PERSIST_MS)) persistWinterGate(now);
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
  // Fin du chrono : récompense avant de passer à la session suivante (le run
  // finit pile à l'ouverture d'après).
  if (gate.phase === "run" && gate.convoy && now >= gate.startAt + WINTER_CONVOY_DURATION * 1000) {
    finish("time", room, sim, ctx, now);
    return;
  }
  if (rollSession(now, sim)) return;
  // Session changée hors tick (arrivant) : restes de l'ancienne retirés.
  if (sim.convoy !== gate.convoy) {
    try { sim.clearConvoyAttackers(); } catch {}
    attachSim(sim);
  }
  const present = presentPlayers(room);
  // Participants sauvegardés avec la session. Pendant la reprise, ceux qui
  // ne sont pas encore revenus restent dans la liste (second redémarrage).
  if (present.length && (gate.phase === "lobby" || gate.phase === "run")) {
    gate.players = now < gate.restoredUntil ? [...new Set([...gate.restoredPlayers, ...present])] : present;
  }

  if (gate.phase === "lobby") {
    if (now < gate.startAt) return;
    // Départ commun ; personne au rendez-vous : session sautée.
    if (!present.length) {
      if (now < gate.restoredUntil) return;
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
    // Tout le monde est parti : session abandonnée (sauf juste après une
    // reprise, le temps que les joueurs se reconnectent).
    if (!present.length) {
      if (now < gate.restoredUntil) return;
      closeGate(sim);
      return;
    }
    // Reprise : les attaquants ont disparu avec le redémarrage, la vague en
    // cours réapparaît (sinon elle compterait comme tuée).
    if (gate.respawnWave) {
      gate.respawnWave = false;
      try { sim.spawnConvoyAttackers(winterConvoyWave(gate.wave)); } catch {}
    }
    if (!(c.hp > 0)) {
      finish("destroyed", room, sim, ctx, now);
      return;
    }
    if (now >= gate.startAt + WINTER_CONVOY_DURATION * 1000) {
      finish("time", room, sim, ctx, now);
      return;
    }
    // Dernier attaquant tué : vague suivante avec une étape (le convoi ne
    // récupère jamais de vie).
    if (sim.convoyAttackersAlive() === 0) {
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

// Reprise de la session en cours après un redémarrage du serveur.
restore();
