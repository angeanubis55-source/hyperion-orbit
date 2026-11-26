// SCRIPTS/LEVIATHAN_GATE.js — Leviathan Gate partagée (SRC/CORE/LEVIATHAN_GATE.js).
// Une session par heure (leviathanGateSession) :
//   ouverture -> +5 min  lobby : entrée ouverte, le boss attend au centre ;
//   +5 min               départ commun (personne : session sautée) ;
//   run                  combat contre le boss fixe (voir LEVIATHAN_BOSS) :
//                        Guardian invulnérable -> lâcher de Harbinger -> tous
//                        tués : 15 s de dégâts -> nouveau lâcher (+2)… ;
//                        Guardian sous 10 % : il explose, la Fortress prend sa
//                        place (+6 par lâcher, impulsions plus fréquentes) ;
//                        impulsions régulières : ralenti + poussée, sans dégât ;
//   fin                  Fortress détruite (victoire), heure pleine, ou plus
//                        personne de vivant : tout le monde rentre à sa base.
// Le contrôleur est branché sur la boucle 50 ms de MULTI_SERVER (room "leviathan").

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  LEVIATHAN_BOSS, LEVIATHAN_BOSS_POS, LEVIATHAN_FORTRESS_TYPE, LEVIATHAN_GUARDIAN_TYPE, LEVIATHAN_HARBINGER_TYPE,
  isLeviathanGateActive, leviathanGateSession, leviathanNextAdds, leviathanPulseHitAt,
} from "../SRC/CORE/LEVIATHAN_GATE.js";

// Fin de session affichée avant la fermeture (retour base).
export const LEVIATHAN_GATE_DONE_MS = 12000;
const SEND_RUN_MS = 500;
const SEND_IDLE_MS = 1000;
// Session sauvegardée sur disque : un redémarrage serveur pendant la gate la
// reprend (même boss, même vie, même lâcher) au lieu de renvoyer tout le monde.
const STATE_FILE = process.env.ORBIT_LEVIATHAN_GATE_FILE || join(process.env.ORBIT_DATA_DIR || "SERVER_DATA", "leviathan_gate.json");
const PERSIST_MS = 2000;
// Après une reprise : le temps que les navigateurs rechargent et se reconnectent.
const RESTORE_GRACE_MS = 120000;

const gate = {
  phase: "closed", // closed | lobby | run | done
  hourAt: 0,
  startAt: 0,
  endAt: 0,
  reason: "", // fin : "victory" | "time" | "empty"
  doneAt: 0,
  // Boss : stage guardian | fortress ; fight adds (invulnérable, Harbinger en
  // vie) | window (vulnérable jusqu'à windowUntil).
  boss: null, // { uid, stage, fight, adds, cycle, windowUntil, hp, hpMax }
  nextPulseAt: 0,
  pulseQueue: [], // impulsions programmées : [at]
  pushes: [], // poussées en attente : [{ pid, at, bx, by }]
  lastSentAt: 0,
  sentKey: "",
  savedAt: 0,
  savedPhase: "",
  restoredUntil: 0,
  restoredBoss: null,
  players: [],
  restoredPlayers: new Set(),
};

let persistFrozen = false;
export function persistLeviathanGate(now = Date.now(), { final = false } = {}) {
  if (persistFrozen) return;
  if (final) persistFrozen = true;
  gate.savedAt = now;
  gate.savedPhase = gate.phase;
  try {
    const { phase, hourAt, reason, doneAt, players } = gate;
    const b = gate.boss;
    mkdirSync(dirname(STATE_FILE), { recursive: true });
    writeFileSync(STATE_FILE, JSON.stringify({ phase, hourAt, reason, doneAt, players,
      boss: b ? { stage: b.stage, adds: b.adds, cycle: b.cycle, hp: b.hp, hpMax: b.hpMax } : null }), "utf8");
  } catch {}
}

function restore(now = Date.now()) {
  try {
    const saved = JSON.parse(readFileSync(STATE_FILE, "utf8") || "{}");
    if (!["lobby", "run"].includes(saved?.phase)) return;
    if (!isLeviathanGateActive(now)) return;
    const session = leviathanGateSession(now);
    if (Number(saved.hourAt) !== session.hourAt) return;
    const players = (Array.isArray(saved.players) ? saved.players : []).map(String).slice(0, 200);
    Object.assign(gate, {
      players,
      restoredPlayers: new Set(players),
      phase: saved.phase,
      hourAt: session.hourAt,
      startAt: session.startAt,
      endAt: session.endAt,
      reason: "",
      doneAt: 0,
      restoredUntil: now + RESTORE_GRACE_MS,
      // Boss recréé au premier tick (la simulation NPC n'existe pas encore).
      restoredBoss: saved.boss && typeof saved.boss === "object" ? saved.boss : null,
      savedPhase: saved.phase,
    });
  } catch {}
}

// Reprise : ce joueur était dans la gate au redémarrage, il y retourne.
export function leviathanGateRejoin(pid, now = Date.now()) {
  return (gate.phase === "lobby" || gate.phase === "run") && now < gate.restoredUntil
    && gate.restoredPlayers.has(String(pid));
}

function alive(state) {
  return state?._posOk === true && !(state.pvpDead === true) && Number(state.hp) > 0;
}

function presentPlayers(room) {
  const list = [];
  for (const [pid, entry] of room || []) if (alive(entry?.state)) list.push(String(pid));
  return list;
}

// --- Boss ---------------------------------------------------------------------
function bossEntry(sim) {
  const b = gate.boss;
  return b && sim ? sim.entries.get(String(b.uid)) || null : null;
}

function spawnBoss(sim, stage, { hp = null, invulnerable = true } = {}) {
  const type = stage === "fortress" ? LEVIATHAN_FORTRESS_TYPE : LEVIATHAN_GUARDIAN_TYPE;
  const e = sim.spawnGateBoss(type, LEVIATHAN_BOSS_POS.x, LEVIATHAN_BOSS_POS.y, { invulnerable });
  if (!e) return null;
  if (Number(hp) > 0) e.hp = Math.min(e.hpMax, Number(hp));
  return e;
}

function setInvulnerable(sim, on) {
  const e = bossEntry(sim);
  if (e) e.escortShieldOn = on === true;
}

// Nouveau lâcher : boss invulnérable, N Harbinger autour de lui.
function releaseAdds(sim) {
  const b = gate.boss;
  b.adds = leviathanNextAdds(b.adds, b.stage);
  b.cycle += 1;
  b.fight = "adds";
  b.windowUntil = 0;
  setInvulnerable(sim, true);
  const types = Array.from({ length: b.adds }, () => LEVIATHAN_HARBINGER_TYPE);
  try { sim.spawnGateWave(types, [LEVIATHAN_BOSS_POS], { distance: LEVIATHAN_BOSS.addsDistance }); } catch {}
}

function startFight(sim, now, restored = null) {
  const stage = restored?.stage === "fortress" ? "fortress" : "guardian";
  const e = spawnBoss(sim, stage, { hp: restored?.hp });
  if (!e) return false;
  gate.boss = { uid: e.uid, stage, fight: "adds", adds: Math.max(0, Math.floor(Number(restored?.adds) || 0)),
    cycle: Math.max(0, Math.floor(Number(restored?.cycle) || 0)), windowUntil: 0, hp: e.hp, hpMax: e.hpMax };
  // Reprise : le lâcher en cours est refait à l'identique (pas de +2/+6).
  if (restored && gate.boss.adds > 0) {
    gate.boss.adds -= LEVIATHAN_BOSS.addsStep[stage] || 0;
    gate.boss.cycle -= 1;
  }
  releaseAdds(sim);
  gate.nextPulseAt = now + LEVIATHAN_BOSS.pulseEveryMs[stage];
  gate.pulseQueue = [];
  gate.pushes = [];
  return true;
}

// Guardian sous 10 % : il explose, la Fortress apparaît à sa place.
function guardianExplodes(sim, ctx, now) {
  const b = gate.boss;
  try { sim.removeGateBoss(b.uid); } catch {}
  try { ctx.broadcast({ t: "leviathanBoss", ev: "explode", type: LEVIATHAN_GUARDIAN_TYPE, x: LEVIATHAN_BOSS_POS.x, y: LEVIATHAN_BOSS_POS.y, at: now }); } catch {}
  const e = spawnBoss(sim, "fortress");
  if (!e) return;
  b.uid = e.uid;
  b.stage = "fortress";
  b.hp = e.hp;
  b.hpMax = e.hpMax;
  releaseAdds(sim);
  gate.nextPulseAt = now + LEVIATHAN_BOSS.pulseEveryMs.fortress;
  gate.pulseQueue = [];
}

// --- Impulsions ---------------------------------------------------------------
function emitPulse(room, ctx, now) {
  const { x: bx, y: by } = LEVIATHAN_BOSS_POS;
  try { ctx.broadcast({ t: "leviathanPulse", x: bx, y: by, at: now, speed: LEVIATHAN_BOSS.pulseSpeed,
    slowPct: LEVIATHAN_BOSS.pulseSlowPct, slowSec: LEVIATHAN_BOSS.pulseSlowSec }); } catch {}
  // Poussée de chaque joueur quand l'onde l'atteint (même calcul que le client).
  for (const [pid, entry] of room || []) {
    const s = entry?.state;
    if (!alive(s)) continue;
    gate.pushes.push({ pid: String(pid), at: leviathanPulseHitAt(now, bx, by, s.x, s.y), bx, by });
  }
}

function tickPulses(room, ctx, now) {
  const b = gate.boss;
  if (!b) return;
  if (now >= gate.nextPulseAt) {
    gate.pulseQueue.push(now);
    if (b.stage === "fortress" && Math.random() < LEVIATHAN_BOSS.doublePulseChance) {
      gate.pulseQueue.push(now + LEVIATHAN_BOSS.doublePulseDelayMs);
    }
    gate.nextPulseAt = now + LEVIATHAN_BOSS.pulseEveryMs[b.stage];
  }
  while (gate.pulseQueue.length && now >= gate.pulseQueue[0]) {
    gate.pulseQueue.shift();
    emitPulse(room, ctx, now);
  }
  if (!gate.pushes.length) return;
  const due = gate.pushes.filter((p) => now >= p.at);
  if (!due.length) return;
  gate.pushes = gate.pushes.filter((p) => now < p.at);
  for (const p of due) {
    try { ctx.push(p.pid, p.bx, p.by, LEVIATHAN_BOSS.pulsePush); } catch {}
  }
}

// --- Session ------------------------------------------------------------------
function openLobby(session, sim) {
  gate.phase = "lobby";
  gate.hourAt = session.hourAt;
  gate.startAt = session.startAt;
  gate.endAt = session.endAt;
  gate.reason = "";
  gate.doneAt = 0;
  gate.boss = null;
  gate.pulseQueue = [];
  gate.pushes = [];
  gate.players = [];
  gate.restoredPlayers = new Set();
  try { sim?.clearGateWave(); } catch {}
}

function closeGate(sim) {
  gate.phase = "closed";
  gate.boss = null;
  gate.pulseQueue = [];
  gate.pushes = [];
  gate.players = [];
  gate.restoredPlayers = new Set();
  try { sim?.clearGateWave(); } catch {}
}

function finish(reason, sim, now) {
  gate.phase = "done";
  gate.reason = reason;
  gate.doneAt = now;
  gate.pulseQueue = [];
  gate.pushes = [];
  try { sim?.clearGateWave(); } catch {}
}

function statePayload(now, sim = null) {
  const b = gate.boss;
  let harbingers = 0;
  try { harbingers = sim ? sim.gateWaveAlive() : 0; } catch {}
  return {
    t: "leviathanGate",
    phase: gate.phase,
    startAt: gate.startAt,
    endAt: gate.endAt,
    nextOpenAt: leviathanGateSession(now).nextOpenAt,
    reason: gate.reason,
    now,
    ...(b ? {
      stage: b.stage, fight: b.fight, windowUntil: b.windowUntil, cycle: b.cycle, adds: b.adds,
      harbingers, hp: Math.round(b.hp), hpMax: b.hpMax,
    } : null),
  };
}

function rollSession(now, sim) {
  const session = leviathanGateSession(now);
  if (gate.hourAt === session.hourAt) return false;
  if (gate.phase !== "closed") closeGate(sim);
  if (session.open) openLobby(session, sim);
  else gate.hourAt = session.hourAt;
  return true;
}

// Dernier état (nouveaux arrivants sur la map).
export function getLeviathanGateState(now = Date.now()) {
  if (isLeviathanGateActive(now)) rollSession(now, null);
  return statePayload(now);
}

// Entrée autorisée : événement en cours et session ouverte.
export function leviathanGateEntryOpen(now = Date.now()) {
  return isLeviathanGateActive(now) && leviathanGateSession(now).open;
}

export function tickLeviathanGate(room, sim, ctx) {
  const now = Date.now();
  try {
    tickInner(room, sim, ctx, now);
  } finally {
    if (gate.phase !== gate.savedPhase || (gate.phase === "run" && now - gate.savedAt >= PERSIST_MS)) persistLeviathanGate(now);
    const b = gate.boss;
    const key = `${gate.phase}:${b?.stage || ""}:${b?.fight || ""}:${b?.cycle || 0}`;
    const every = gate.phase === "run" ? SEND_RUN_MS : SEND_IDLE_MS;
    if (key !== gate.sentKey || now - gate.lastSentAt >= every) {
      gate.sentKey = key;
      gate.lastSentAt = now;
      try { ctx.broadcast(statePayload(now, sim)); } catch {}
    }
  }
}

function tickInner(room, sim, ctx, now) {
  if (!sim || typeof sim.spawnGateBoss !== "function") return;
  const session = leviathanGateSession(now);
  if (!isLeviathanGateActive(now)) {
    if (gate.phase !== "closed") closeGate(sim);
    return;
  }
  if (gate.phase === "run" && now >= gate.endAt) {
    finish("time", sim, now);
    return;
  }
  if (rollSession(now, sim)) return;
  const present = presentPlayers(room);
  if (present.length && (gate.phase === "lobby" || gate.phase === "run")) {
    gate.players = now < gate.restoredUntil ? [...new Set([...gate.restoredPlayers, ...present])] : present;
  }

  if (gate.phase === "lobby") {
    if (now < gate.startAt) return;
    if (!present.length) {
      if (now < gate.restoredUntil) return;
      closeGate(sim);
      return;
    }
    gate.phase = "run";
    startFight(sim, now);
    return;
  }

  if (gate.phase === "run") {
    // Reprise après redémarrage : boss recréé avec sa vie et son lâcher.
    if (!gate.boss) {
      const restored = gate.restoredBoss;
      gate.restoredBoss = null;
      if (!startFight(sim, now, restored)) return;
    }
    if (!present.length) {
      if (now < gate.restoredUntil) return;
      finish("empty", sim, now);
      return;
    }
    const b = gate.boss;
    const e = bossEntry(sim);
    // Fortress détruite (tuée par un joueur) : victoire.
    if (!e || !(e.hp > 0)) {
      if (b.stage === "fortress") { finish("victory", sim, now); return; }
      // Guardian disparu sans passer par l'explosion : on enchaîne quand même.
      guardianExplodes(sim, ctx, now);
      return;
    }
    b.hp = e.hp;
    b.hpMax = e.hpMax;
    if (b.stage === "guardian" && e.hp <= e.hpMax * LEVIATHAN_BOSS.guardianExplodePct) {
      guardianExplodes(sim, ctx, now);
      return;
    }
    if (b.fight === "adds" && sim.gateWaveAlive() === 0) {
      // Tous les Harbinger tués : fenêtre de dégâts.
      b.fight = "window";
      b.windowUntil = now + LEVIATHAN_BOSS.windowMs;
      setInvulnerable(sim, false);
    } else if (b.fight === "window" && now >= b.windowUntil) {
      releaseAdds(sim);
    }
    tickPulses(room, ctx, now);
    return;
  }

  if (gate.phase === "done") {
    if (now - gate.doneAt >= LEVIATHAN_GATE_DONE_MS) {
      closeGate(sim);
      gate.hourAt = session.hourAt;
    }
  }
}

// Reprise de la session en cours après un redémarrage du serveur.
restore();
