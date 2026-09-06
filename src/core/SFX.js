// src/core/SFX.js
"use strict";

export function createSFX() {
  const api = {
    ctx: null,
    master: null,
buffers: Object.create(null),
    last: Object.create(null),
    active: Object.create(null),
    sources: Object.create(null),
    loops: Object.create(null),
    enabled: true,
    masterVolume: 0.55,
    _preloaded: false,

    init() {
      if (api.ctx) return;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      api.ctx = new AC();
      api.master = api.ctx.createGain();
      api.master.gain.value = api.masterVolume;
      api.master.connect(api.ctx.destination);
    },

    setMasterVolume(value) {
      api.masterVolume = Math.max(0, Math.min(1, Number(value) || 0));
      if (!api.master || !api.ctx) return;
      api.master.gain.setTargetAtTime(api.masterVolume, api.ctx.currentTime, 0.015);
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
        api.load("pShotX6", "Son/sfx_shot_x6.mp3"),
        api.load("pShotSab", "Son/sfx_shot_Sab.mp3"),
        api.load("pulseIEM", "Son/Iem_Instant.mp3"),
        api.load("deathPlayer", "Son/Mort_joueur.mp3"),
        api.load("deathPlayer2", "Son/Mort_joueur_2.mp3"),
        api.load("respawnPlayer", "Son/réapparition.mp3"),
        api.load("radiationLoop", "Son/Radiation.mp3"),
        api.load("repairStart", "Son/Repair_start.mp3"),
        api.load("repairLoop", "Son/Repair.mp3"),
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

      (api.sources[name] = api.sources[name] || []).push(src);
      src.onended = () => {
        const list = api.sources[name];
        if (list) {
          const i = list.indexOf(src);
          if (i >= 0) list.splice(i, 1);
        }
        api.active[name] = Math.max(0, (api.active[name] || 1) - 1);
      };
      src.start();
    },

    // Coupe immédiatement toutes les instances en cours de lecture d'un son.
    stop(name) {
      const list = api.sources[name];
      if (!list) return;
      for (const s of Array.from(list)) {
        try {
          s.onended = null;
          s.stop();
        } catch {}
      }
      api.sources[name] = [];
      api.active[name] = 0;
    },

    // Joue un son en boucle (une seule instance gardée). Utilisé pour les ambiances.
    loop(name, opts = {}) {
      if (!api.enabled || !api.ctx) return;
      if (api.loops[name]) return;
      const buf = api.buffers[name];
      if (!buf) return;

      const { vol = 1, rate = 1, fadeIn = 0.3 } = opts;
      const now = api.ctx.currentTime;

      const src = api.ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      src.playbackRate.value = rate;

      const g = api.ctx.createGain();
      g.gain.setValueAtTime(0, now);
      g.gain.linearRampToValueAtTime(vol, now + fadeIn);

      src.connect(g);
      g.connect(api.master);
      src.start(now);

      api.loops[name] = { src, g, vol };
    },

    // Arrête une boucle, avec fondu de sortie si demandé (0 = coupure instantanée).
    stopLoop(name, opts = {}) {
      const l = api.loops[name];
      if (!l) return;
      const { fadeOut = 0.3 } = opts;
      const now = api.ctx.currentTime;

      try {
        if (fadeOut > 0) {
          l.g.gain.cancelScheduledValues(now);
          l.g.gain.setValueAtTime(l.g.gain.value, now);
          l.g.gain.linearRampToValueAtTime(0, now + fadeOut);
          l.src.stop(now + fadeOut + 0.05);
        } else {
          l.src.stop();
        }
      } catch {}

      delete api.loops[name];
    },

    // Joue `nameA` puis, à `crossAt` (fraction de la durée de A, ex: 0.5 = moitié),
    // démarre `nameB` en diminuant progressivement le volume de A (fondu croisé).
    crossfade(nameA, nameB, opts = {}) {
      if (!api.enabled || !api.ctx) return;
      const bufA = api.buffers[nameA];
      if (!bufA) return;

      const bufB = nameB ? api.buffers[nameB] : null;
      if (!bufB) {
        api.play(nameA, opts);
        return;
      }

      const { vol = 1, rate = 1, crossAt = 0.5 } = opts;
      const now = api.ctx.currentTime;
      const durA = bufA.duration;

      const lead = Math.max(0.001, durA * Math.max(0, Math.min(1, crossAt)));
      const tCross = now + durA * crossAt;
      const fade = Math.max(0.05, durA - durA * crossAt);

      api.active[nameA] = (api.active[nameA] ?? 0) + 1;
      api.active[nameB] = (api.active[nameB] ?? 0) + 1;

      try {
        const srcA = api.ctx.createBufferSource();
        srcA.buffer = bufA;
        srcA.playbackRate.value = rate;
        const gA = api.ctx.createGain();
        srcA.connect(gA);
        gA.connect(api.master);
        gA.gain.setValueAtTime(vol, now);
        gA.gain.linearRampToValueAtTime(0, tCross + fade);
        srcA.start(now);
        srcA.stop(now + durA + 0.05);
        (api.sources[nameA] = api.sources[nameA] || []).push(srcA);
        srcA.onended = () => {
          const list = api.sources[nameA];
          if (list) {
            const i = list.indexOf(srcA);
            if (i >= 0) list.splice(i, 1);
          }
          api.active[nameA] = Math.max(0, (api.active[nameA] || 1) - 1);
        };

        const srcB = api.ctx.createBufferSource();
        srcB.buffer = bufB;
        srcB.playbackRate.value = rate;
        const gB = api.ctx.createGain();
        srcB.connect(gB);
        gB.connect(api.master);
        gB.gain.setValueAtTime(vol, tCross);
        srcB.start(tCross);
        (api.sources[nameB] = api.sources[nameB] || []).push(srcB);
        srcB.onended = () => {
          const list = api.sources[nameB];
          if (list) {
            const i = list.indexOf(srcB);
            if (i >= 0) list.splice(i, 1);
          }
          api.active[nameB] = Math.max(0, (api.active[nameB] || 1) - 1);
        };
      } catch {
        api.active[nameA] = Math.max(0, (api.active[nameA] || 1) - 1);
        api.active[nameB] = Math.max(0, (api.active[nameB] || 1) - 1);
      }
    },
  };

  return api;
}
