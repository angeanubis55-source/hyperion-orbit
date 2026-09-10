"use strict";

export function createPerformanceMonitor(sampleSize = 180) {
  const capacity = Math.max(10, Math.floor(sampleSize));
  const samples = new Float64Array(capacity);
  let count = 0;
  let cursor = 0;
  return {
    record(deltaSeconds) {
      samples[cursor] = Math.max(0, Number(deltaSeconds) || 0) * 1000;
      cursor = (cursor + 1) % capacity;
      count = Math.min(capacity, count + 1);
    },
    snapshot() {
      if (!count) return { fps: 0, averageMs: 0, p95Ms: 0, longFrames: 0, samples: 0 };
      const values = Array.from(samples.subarray(0, count)).sort((a, b) => a - b);
      const averageMs = values.reduce((sum, value) => sum + value, 0) / count;
      return {
        fps: averageMs > 0 ? Math.round(1000 / averageMs) : 0,
        averageMs,
        p95Ms: values[Math.min(count - 1, Math.floor(count * 0.95))],
        longFrames: values.filter((value) => value > 25).length,
        samples: count,
      };
    },
  };
}
