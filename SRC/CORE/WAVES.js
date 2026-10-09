"use strict";

// Reprise d'une vague : retirer les NPC effectivement tues, sans supprimer
// un boss parce que des escortes ont ete tuees avant lui. Les anciennes
// sauvegardes sans detail par type conservent leur reprise par compteur.
export function remainingWaveSpawns(spawns, progress) {
  const byType = { ...(progress?.byType || {}) };
  const typedKills = Object.values(byType).reduce((sum, count) => sum + Math.max(0, Math.floor(Number(count) || 0)), 0);
  let legacyKills = Math.max(0, Math.floor(Number(progress?.killed) || 0) - typedKills);
  return spawns.map(spawn => {
    const count = Math.max(0, Math.floor(Number(spawn.count) || 0));
    const typedSkip = Math.min(count, Math.max(0, Math.floor(Number(byType[spawn.type]) || 0)));
    byType[spawn.type] = Math.max(0, (Number(byType[spawn.type]) || 0) - typedSkip);
    const legacySkip = Math.min(count - typedSkip, legacyKills);
    legacyKills -= legacySkip;
    return { ...spawn, count: count - typedSkip - legacySkip };
  }).filter(spawn => spawn.count > 0);
}

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
