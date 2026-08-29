"use strict";

export function createWaveSpawnState() {
  return {
    queue: [], remaining: 0, timer: 0,
    load(spawns = [], initialDelay = 0.35) {
      this.queue = spawns.map((spawn) => ({
        type: spawn.type,
        left: Math.max(0, Math.floor(Number(spawn.count) || 0)),
        onKill: spawn.onKill || null,
      })).filter((spawn) => spawn.left > 0);
      this.remaining = this.queue.reduce((sum, spawn) => sum + spawn.left, 0);
      this.timer = initialDelay;
      return this.remaining;
    },
    tick(deltaTime) {
      this.timer -= Math.max(0, Number(deltaTime) || 0);
      return this.timer <= 0;
    },
    peek() { return this.queue[0] || null; },
    consume(delay = 0.05) {
      const current = this.peek();
      if (!current || this.remaining <= 0) return null;
      current.left--;
      this.remaining--;
      if (current.left <= 0) this.queue.shift();
      this.timer = delay;
      return current;
    },
    reset() { this.queue = []; this.remaining = 0; this.timer = 0; },
  };
}
