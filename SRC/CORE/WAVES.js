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
    queue: [], staged: [], remaining: 0, timer: 0,
    load(spawns = [], initialDelay = 0.35) {
      const all = spawns.map((spawn) => ({
        type: spawn.type,
        left: Math.max(0, Math.floor(Number(spawn.count) || 0)),
        onKill: spawn.onKill || null,
        // ✅ paliers de vague : phase 1 d'abord, les suivantes libérées
        // quand il ne reste aucun NPC en vie (voir releaseStaged).
        phase: Math.max(1, Math.floor(Number(spawn.phase) || 1)),
      })).filter((spawn) => spawn.left > 0);
      this.queue = all.filter((spawn) => spawn.phase <= 1);
      this.staged = all.filter((spawn) => spawn.phase > 1);
      this.remaining = all.reduce((sum, spawn) => sum + spawn.left, 0);
      this.timer = initialDelay;
      return this.remaining;
    },
    // ✅ libère le palier en attente le plus bas (sans toucher à remaining,
    // déjà compté au load).
    releaseStaged() {
      if (!this.staged.length) return 0;
      const next = Math.min(...this.staged.map((spawn) => spawn.phase));
      const moving = this.staged.filter((spawn) => spawn.phase === next);
      this.staged = this.staged.filter((spawn) => spawn.phase !== next);
      for (const spawn of moving) this.queue.push(spawn);
      return moving.reduce((sum, spawn) => sum + spawn.left, 0);
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
    reset() { this.queue = []; this.staged = []; this.remaining = 0; this.timer = 0; },
  };
}
