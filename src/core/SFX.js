// src/core/SFX.js
"use strict";

export function createSFX() {
  const api = {
    ctx: null,
    master: null,
    buffers: Object.create(null),
    last: Object.create(null),
    active: Object.create(null),
    enabled: true,
    _preloaded: false,

    init() {
      if (api.ctx) return;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      api.ctx = new AC();
      api.master = api.ctx.createGain();
      api.master.gain.value = 0.55;
      api.master.connect(api.ctx.destination);
    },

    resume() {
      api.init();
      if (!api.ctx) return;
      if (api.ctx.state !== "running") api.ctx.resume().catch(() => {});
    },

    async load(name, url) {
      if (!api.ctx) return;
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        const ab = await res.arrayBuffer();
        const buf = await api.ctx.decodeAudioData(ab);
        api.buffers[name] = buf;
      } catch (err) {
        console.warn(`[SFX] manquant: ${url}`, err?.message || err);
      }
    },

    preload() {
      if (api._preloaded) return;
      api._preloaded = true;
      api.resume();
      if (!api.ctx) return;

      Promise.all([
        api.load("pShotX1", "Son/sfx_shot_x1.mp3"),
        api.load("pShotX2", "Son/sfx_shot_x2.mp3"),
        api.load("pShotX3", "Son/sfx_shot_x3.mp3"),
        api.load("pShotX4", "Son/sfx_shot_x4.mp3"),
      ]).catch(() => {});
    },

    play(name, opts = {}) {
      if (!api.enabled || !api.ctx) return;
      const buf = api.buffers[name];
      if (!buf) return;

      const { vol = 1, rate = 1, detune = 0, cooldown = 0, maxVoices = 4 } = opts;
      const now = api.ctx.currentTime;

      const last = api.last[name] ?? -999;
      if (cooldown && now - last < cooldown) return;

      api.active[name] = api.active[name] ?? 0;
      if (api.active[name] >= maxVoices) return;

      api.last[name] = now;
      api.active[name]++;

      const src = api.ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = rate;
      src.detune.value = detune;

      const g = api.ctx.createGain();
      g.gain.value = vol;

      src.connect(g);
      g.connect(api.master);

      src.onended = () => (api.active[name] = Math.max(0, (api.active[name] || 1) - 1));
      src.start();
    },
  };

  return api;
}
