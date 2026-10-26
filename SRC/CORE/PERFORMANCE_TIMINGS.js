// Bounded, aggregate CPU timings. Nested measurements are inclusive.
const timings = new Map();

export function recordGameTask(name, durationMs) {
  const duration = Math.max(0, Number(durationMs) || 0);
  const entry = timings.get(name) || { count: 0, totalMs: 0, maxMs: 0, lastMs: 0 };
  entry.count++;
  entry.totalMs += duration;
  entry.lastMs = duration;
  entry.maxMs = Math.max(entry.maxMs, duration);
  timings.set(name, entry);
}

export function measureGameTask(name, callback) {
  const start = performance.now();
  try {
    return callback();
  } finally {
    recordGameTask(name, performance.now() - start);
  }
}

export const gamePerformanceTimings = {
  snapshot: () => Object.fromEntries([...timings].map(([name, entry]) => [name, {
    ...entry, averageMs: entry.totalMs / entry.count,
  }])),
  reset: () => timings.clear(),
};

if (typeof window !== "undefined") window.HyperionPerformance = gamePerformanceTimings;

// Micro-freeze : le navigateur signale toute tache > 50 ms du thread
// principal (Chromium). Agrege sous "longtask" ; les plus recentes restent
// lisibles via HyperionPerformance.longTasks() pour les recouper avec les
// timings ci-dessus. Passif et borne, sans effet si l'API est absente.
const recentLongTasks = [];
gamePerformanceTimings.longTasks = () => recentLongTasks.slice();
try {
  if (typeof PerformanceObserver === "function"
    && (PerformanceObserver.supportedEntryTypes || []).includes("longtask")) {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        recordGameTask("longtask", entry.duration);
        recentLongTasks.push({ at: Math.round(entry.startTime), ms: Math.round(entry.duration) });
        if (recentLongTasks.length > 50) recentLongTasks.shift();
      }
    }).observe({ type: "longtask", buffered: true });
  }
} catch {}
