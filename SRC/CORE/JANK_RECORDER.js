"use strict";

// Enregistreur de saccades (Debug mode) : note chaque freeze ressenti
// (trou d'images ou tâche longue bloquante) avec heure, durée, carte et FPS,
// pour diagnostiquer un téléphone sans le brancher à un PC. Le rapport se lit
// dans Paramètres > Général > Démarrage ("Copier le rapport").
//
// Module feuille (aucun import) : le moteur pousse le contexte (carte, FPS)
// via startJankRecorder(provider) et signale les trous via noteJankFrame().
// Coût nul quand inactif : un booléen testé par image, rien d'autre.
const MAX_ENTRIES = 60;
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
    };
  } catch {
    return { map: "?", fps: 0 };
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
  entries.push({ at: clock(), ms: duration, kind, map: c.map, fps: c.fps });
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
    const worst = [...entries].sort((a, b) => b.ms - a.ms).slice(0, 15);
    for (const e of worst) {
      lines.push(`${e.at} · ${e.ms}ms · ${e.kind} · carte ${e.map} · ${e.fps} FPS`);
    }
    if (!worst.length) lines.push("(aucune saccade ≥80ms détectée)");
    return lines.join("\n");
  } catch {
    return "Rapport indisponible.";
  }
}

export function clearJankReport() {
  entries = [];
  maxMs = 0;
  sessionStart = Date.now();
}
