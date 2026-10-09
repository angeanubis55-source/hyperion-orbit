"use strict";

// Enregistreur de saccades (Debug mode) : note chaque freeze ressenti
// (trou d'images ou tâche longue bloquante) avec heure, durée, carte et FPS,
// pour diagnostiquer un téléphone sans le brancher à un PC. Le rapport se lit
// dans Paramètres > Général > Démarrage ("Copier le rapport").
//
// Module feuille (aucun import) : le moteur pousse le contexte (carte, FPS)
// via startJankRecorder(provider) et signale les trous via noteJankFrame().
// Coût nul quand inactif : un booléen testé par image, rien d'autre.
// TOUT est retenu (ordre chronologique) : le plafond (5000 = plus d'une heure
// de freeze non-stop) n'est qu'une sécurité anti-fuite mémoire.
const MAX_ENTRIES = 5000;
const GAP_THRESHOLD_MS = 80;
const LONGTASK_THRESHOLD_MS = 50;
const BACKGROUND_GAP_IGNORE_MS = 5000;

let active = false;
let entries = [];
let contextProvider = null;
let listener = null;
let observer = null;
let sessionStart = 0;
let maxMs = 0;

function context() {
  try {
    const c = contextProvider ? contextProvider() : null;
    return {
      map: String(c?.map || "?"),
      fps: Math.max(0, Math.round(Number(c?.fps) || 0)),
      npcs: Math.max(0, Math.round(Number(c?.npcs) || 0)),
      players: Math.max(0, Math.round(Number(c?.players) || 0)),
    };
  } catch {
    return { map: "?", fps: 0, npcs: 0, players: 0 };
  }
}

function clock() {
  try {
    const d = new Date();
    const p = (n) => String(n).padStart(2, "0");
    return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  } catch {
    return "?";
  }
}

function record(kind, ms) {
  if (!active) return;
  const duration = Math.max(0, Math.round(Number(ms) || 0));
  if (!(duration > 0)) return;
  const c = context();
  entries.push({ at: clock(), ms: duration, kind, map: c.map, fps: c.fps, npcs: c.npcs, players: c.players });
  if (entries.length > MAX_ENTRIES) entries.splice(0, entries.length - MAX_ENTRIES);
  if (duration > maxMs) maxMs = duration;
  try {
    if (typeof listener === "function") listener();
  } catch {}
}

export function startJankRecorder(provider) {
  if (active) return;
  active = true;
  sessionStart = Date.now();
  contextProvider = typeof provider === "function" ? provider : null;
  try {
    if (typeof PerformanceObserver !== "undefined") {
      observer = new PerformanceObserver((list) => {
        try {
          const got = list.getEntries();
          for (const entry of got) {
            if (entry && Number(entry.duration) >= LONGTASK_THRESHOLD_MS) {
              record("tache", Number(entry.duration));
            }
          }
        } catch {}
      });
      observer.observe({ entryTypes: ["longtask"] });
    }
  } catch {
    observer = null;
  }
}

export function stopJankRecorder() {
  active = false;
  try {
    if (observer) observer.disconnect();
  } catch {}
  observer = null;
}

// Appelé à chaque image par le moteur (Debug mode seulement).
// dtSec = temps réel écoulé depuis l'image précédente.
export function noteJankFrame(dtSec) {
  if (!active) return;
  const ms = Number(dtSec) * 1000;
  if (!Number.isFinite(ms)) return;
  // Retour d'arrière-plan (onglet masqué) : pas une saccade de jeu.
  if (ms >= BACKGROUND_GAP_IGNORE_MS) return;
  if (ms >= GAP_THRESHOLD_MS) record("image", ms);
}

export function setJankListener(fn) {
  listener = typeof fn === "function" ? fn : null;
}

// Contexte live (pour l'envoi : mêmes champs que chaque ligne du rapport).
export function getJankContext() {
  try {
    return context();
  } catch {
    return { map: "?", fps: 0, npcs: 0, players: 0 };
  }
}

// Télémétrie sauvegardes : chaque écriture lourde est notée (nom, durée,
// taille, heure, note). Coût négligeable (quelques nombres, que sur écriture).
// Inactif = coût nul (un booléen testé par l'appelant).
// Comme les saccades : tout retenu, même plafond de sécurité.
const SAVE_MAX = 5000;
let saveOps = [];
let timingsProvider = null;

export function setJankTimingsProvider(fn) {
  timingsProvider = typeof fn === "function" ? fn : null;
}

export function noteSaveOp(name, ms, bytes, note) {
  if (!active) return;
  try {
    saveOps.push({
      name: String(name || "?"),
      ms: Math.max(0, Math.round(Number(ms) || 0)),
      bytes: Math.max(0, Math.round(Number(bytes) || 0)),
      at: clock(),
      note: note != null ? String(note) : "",
    });
    if (saveOps.length > SAVE_MAX) saveOps.splice(0, saveOps.length - SAVE_MAX);
  } catch {}
}

function formatKo(bytes) {
  const b = Math.max(0, Math.round(Number(bytes) || 0));
  if (b < 1024) return `${b}o`;
  if (b < 1024 * 1024) return `${Math.round(b / 1024)}Ko`;
  return `${(b / (1024 * 1024)).toFixed(1)}Mo`;
}

function saveOpsSection() {
  const lines = [];
  try {
    if (!saveOps.length) {
      lines.push("--- Sauvegardes ---");
      lines.push("(aucune écriture tracée — jeu à peine démarré ?)");
      return lines;
    }
    lines.push("--- Sauvegardes (nombre · moyenne · max · taille) ---");
    const byName = new Map();
    for (const op of saveOps) {
      let e = byName.get(op.name);
      if (!e) {
        e = { count: 0, total: 0, max: 0, bytesMax: 0, bytesLast: 0, times: [] };
        byName.set(op.name, e);
      }
      e.count++;
      e.total += op.ms;
      if (op.ms > e.max) e.max = op.ms;
      if (op.bytes > e.bytesMax) e.bytesMax = op.bytes;
      e.bytesLast = op.bytes;
      e.times.push(op.at + (op.note ? `(${op.note})` : ""));
      if (e.times.length > 3) e.times.shift();
    }
    for (const [name, e] of byName) {
      lines.push(`${name} : ${e.count}× · moy ${Math.round(e.total / Math.max(1, e.count))}ms · max ${e.max}ms · ~${formatKo(e.bytesMax)} · ${e.times.join(" ")}`);
    }
    // Détail complet, ordre chronologique (aucune écriture n'est jetée).
    lines.push(`--- Écritures (toutes, ordre chrono) ---`);
    for (const op of saveOps) {
      lines.push(`${op.at} · ${op.name} · ${op.ms}ms · ~${formatKo(op.bytes)}${op.note ? ` · ${op.note}` : ""}`);
    }
  } catch {}
  return lines;
}

function engineSection() {
  const lines = [];
  try {
    const snap = timingsProvider ? timingsProvider() : null;
    if (!snap || typeof snap !== "object") return lines;
    lines.push("--- Moteur (moyenne / max par image ou appel) ---");
    const pick = ["frame.total", "frame.update", "syncNetNpcs", "updatePet", "frame.draw", "frame.ui", "frame.netPush", "frame.netVisuals", "saveProgressNow", "persistUniverse", "persistCollectables", "processDeaths", "npcDeath.rewards"];
    for (const key of pick) {
      const e = snap[key];
      if (!e || !(Number(e.count) > 0)) continue;
      const avg = Number(e.averageMs ?? (Number(e.totalMs) || 0) / Math.max(1, Number(e.count) || 1)) || 0;
      lines.push(`${key} : ${e.count}× · moy ${avg.toFixed(1)}ms · max ${Math.round(Number(e.maxMs) || 0)}ms`);
    }
  } catch {}
  return lines;
}

// Garde anti-vitesse : ses blocages (jeu gelé, overlay "Partie suspendue")
// doivent apparaître dans le rapport même si la récupération recharge la
// page (le rapport mémoire est perdu au reload, pas celui-ci).
const GUARD_KEY = "orbit_jank_guard_v1";
const GUARD_MAX = 50;

function readGuardLog() {
  try {
    if (typeof localStorage === "undefined") return [];
    const parsed = JSON.parse(localStorage.getItem(GUARD_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function noteGuardBlock(ms) {
  const duration = Math.max(0, Math.round(Number(ms) || 0));
  if (!(duration > 0)) return;
  record("garde", duration);
  try {
    if (typeof localStorage === "undefined") return;
    const log = readGuardLog();
    log.push({ at: clock(), ms: duration });
    while (log.length > GUARD_MAX) log.shift();
    localStorage.setItem(GUARD_KEY, JSON.stringify(log));
  } catch {}
}

export function getJankSummary() {
  try {
    const count = entries.length;
    const avg = count
      ? Math.round(entries.reduce((s, e) => s + e.ms, 0) / count)
      : 0;
    return {
      active,
      count,
      max: Math.round(maxMs),
      avg,
      sessionSec: Math.max(0, Math.round((Date.now() - sessionStart) / 1000)),
    };
  } catch {
    return { active, count: 0, max: 0, avg: 0, sessionSec: 0 };
  }
}

function formatDuration(totalSec) {
  const s = Math.max(0, Math.floor(Number(totalSec) || 0));
  const m = Math.floor(s / 60);
  if (m <= 0) return `${s}s`;
  return `${m}min${String(s % 60).padStart(2, "0")}`;
}

export function getJankReport(version) {
  try {
    const s = getJankSummary();
    const lines = [];
    lines.push(`Rapport saccades — v${version || "?"} — session ${formatDuration(s.sessionSec)}`);
    lines.push(`${s.count} saccade${s.count > 1 ? "s" : ""} · max ${s.max}ms · moyenne ${s.avg}ms`);
    // TOUTES les saccades, dans l'ordre chronologique (le rythme — métronome
    // ou hasard — se lit directement dans les heures).
    const formatJank = (e) => {
      const ctx = `carte ${e.map} · ${e.fps} FPS`
        + (Number(e.npcs) > 0 ? ` · ${e.npcs} NPC` : "")
        + (Number(e.players) > 0 ? ` · ${e.players} joueurs` : "");
      return `${e.at} · ${e.ms}ms · ${e.kind} · ${ctx}`;
    };
    if (!entries.length) {
      lines.push("(aucune saccade ≥80ms détectée)");
    } else {
      lines.push(`--- Saccades (toutes, ordre chrono) ---`);
      for (const e of entries) lines.push(formatJank(e));
    }
    for (const l of saveOpsSection()) lines.push(l);
    for (const l of engineSection()) lines.push(l);
    try {
      const c = context();
      lines.push(`--- Contexte (fin de session) ---`);
      lines.push(`Debug ON · carte ${c.map} · ${c.npcs} NPC · ${c.players} joueurs · ${c.fps} FPS`);
    } catch {}
    try {
      const guardLog = readGuardLog();
      if (guardLog.length) {
        lines.push(`Garde vitesse : ${guardLog.length} blocage${guardLog.length > 1 ? "s" : ""} (même après reload)`);
        for (const g of guardLog) lines.push(`${g.at} · blocage ${g.ms}ms`);
      }
    } catch {}
    return lines.join("\n");
  } catch {
    return "Rapport indisponible.";
  }
}

export function clearJankReport() {
  entries = [];
  saveOps = [];
  maxMs = 0;
  sessionStart = Date.now();
}

// Bouton "Recommencer" : vide aussi l'historique persistant du garde
// (sinon il reviendrait dans le prochain rapport).
export function clearGuardLog() {
  try {
    if (typeof localStorage !== "undefined") localStorage.removeItem(GUARD_KEY);
  } catch {}
}
