// Bounded, aggregate CPU timings. Nested measurements are inclusive.
const timings = new Map();

export function measureGameTask(name, callback) {
  const start = performance.now();
  try {
    return callback();
  } finally {
    const duration = performance.now() - start;
    const entry = timings.get(name) || { count: 0, totalMs: 0, maxMs: 0, lastMs: 0 };
    entry.count++;
    entry.totalMs += duration;
    entry.lastMs = duration;
    entry.maxMs = Math.max(entry.maxMs, duration);
    timings.set(name, entry);
  }
}

export const gamePerformanceTimings = {
  snapshot: () => Object.fromEntries([...timings].map(([name, entry]) => [name, {
    ...entry, averageMs: entry.totalMs / entry.count,
  }])),
  reset: () => timings.clear(),
};

if (typeof window !== "undefined") window.HyperionPerformance = gamePerformanceTimings;
