// src/core/SFX.js
"use strict";

// Tous les sons chargeables du jeu (mêmes clés que preload()).
// Sert aussi à générer les réglages de volume individuels.
export const SFX_SOUND_NAMES = Object.freeze([
  "pShotX1",
  "pShotX2",
  "pShotX3",
  "pShotX4",
  "pShotX6",
  "sfx_shot_roquettes",
  "sfx_shot_lance_roquettes",
  "rocketsLoadStart",
  "rocketLoad",
  "rocketsLoaded",
  "pShotSab",
  "pulseIEM",
  "ishShield",
  "deathPlayer",
  "deathPlayer2",
  "respawnPlayer",
  "radiationLoop",
  "repairStart",
  "repairLoop",
  "swReady",
  "swJump",
  "swDone",
  "swDeny",
  "shipMove",
  "npcDeath",
  "collect",
  "laserHit1",
  "laserHit2",
  "laserHit3",
  "selectNew",
  "selectAgain",
  "outOfRange",
  "escortX1",
  "escortX2",
  "escortX3",
  "escortX4",
  "escortX6",
  "escortSab",
]);

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
    masterVolume: 0.5,
    // Volume (0..1) et muet par son. Appliqués via un nœud de gain
    // dédié : les boucles en cours suivent aussi les réglages en direct.
    soundGains: Object.create(null),
    soundVolumes: Object.create(null),
    soundMuted: Object.create(null),
    _preloaded: false,
    preloaded: null,
    _gestureSeen: false,
    _preloadDeferred: false,

    _hasGesture() {
      if (api._gestureSeen) return true;
      try {
        const nav = typeof navigator !== "undefined" ? navigator : globalThis?.navigator;
        if (nav?.userActivation?.hasBeenActive === true) return true;
      } catch {}
      return false;
    },

    _markGesture() {
      api._gestureSeen = true;
    },

    _armGesture() {
      if (api._gestureArmed || typeof window === "undefined") return;
      api._gestureArmed = true;
      const onGesture = () => {
        api._markGesture();
        api.resume();
        // Si preload() avait été différé avant le premier geste, on le rejoue maintenant.
        if (api._preloadDeferred && !api._preloaded) {
          api._preloadDeferred = false;
          api.preload();
        }
      };
      for (const evt of ["pointerdown", "keydown", "touchstart", "click"]) {
        try { window.addEventListener(evt, onGesture, { once: true, passive: true }); }
        catch { try { window.addEventListener(evt, onGesture); } catch {} }
      }
    },

    init(opts = {}) {
      if (api.ctx) return;
      if (!opts.fromGesture && !opts.tryAutoplay && !api._hasGesture()) {
        api._armGesture();
        return;
      }
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

    // Nœud de gain dédié à un son (créé à la demande, branché sur le master).
    _soundGain(name) {
      if (!api.ctx || !api.master) return api.master;
      let g = api.soundGains[name];
      if (!g) {
        g = api.ctx.createGain();
        g.gain.value = api.soundMuted[name] ? 0 : Math.max(0, Math.min(1, Number(api.soundVolumes[name] ?? 1)));
        g.connect(api.master);
        api.soundGains[name] = g;
      }
      return g;
    },

    _applySoundGain(name) {
      const g = api.soundGains[name];
      if (!g || !api.ctx) return;
      const v = api.soundMuted[name] ? 0 : Math.max(0, Math.min(1, Number(api.soundVolumes[name] ?? 1)));
      try {
        g.gain.setTargetAtTime(v, api.ctx.currentTime, 0.015);
      } catch {
        try { g.gain.value = v; } catch {}
      }
    },

    // Volume individuel d'un son (0..1). Fonctionne avant init : appliqué
    // dès que le nœud de gain est créé.
    setSoundVolume(name, value) {
      api.soundVolumes[name] = Math.max(0, Math.min(1, Number(value) || 0));
      api._applySoundGain(name);
    },

    getSoundVolume(name) {
      return Math.max(0, Math.min(1, Number(api.soundVolumes[name] ?? 1)));
    },

    setSoundMuted(name, muted) {
      api.soundMuted[name] = muted === true;
      api._applySoundGain(name);
    },

    isSoundMuted(name) {
      return api.soundMuted[name] === true;
    },

    resume() {
      api._markGesture();
      api.init({ fromGesture: true });
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
      // Tente le démarrage immédiatement. Il réussit sans interaction lorsque
      // le navigateur a déjà accordé l'autoplay à ce site. Sinon les buffers
      // sont tout de même prêts et le premier vrai geste reprend le contexte.
      api.init({ tryAutoplay: true });
      if (!api.ctx) return;
      api._preloaded = true;
      if (api.ctx.state !== "running") api.ctx.resume().catch(() => {});
      if (!api._hasGesture()) api._armGesture();

      api.preloaded = Promise.all([
        api.load("pShotX1", "Son/sfx_shot_x1.mp3"),
        api.load("pShotX2", "Son/sfx_shot_x2.mp3"),
        api.load("pShotX3", "Son/sfx_shot_x3.mp3"),
        api.load("pShotX4", "Son/sfx_shot_x4.mp3"),
        api.load("pShotX6", "Son/sfx_shot_x6.mp3"),
        api.load("sfx_shot_roquettes", "Son/sfx_shot_roquettes.mp3"),
        api.load("sfx_shot_lance_roquettes", "Son/sfx_shot_Lance_roquettes.mp3"),
        api.load("rocketsLoadStart", "Son/RocketsLoadStart.mp3"),
        api.load("rocketLoad", "Son/RocketLoad.mp3"),
        api.load("rocketsLoaded", "Son/RocketsLoaded.mp3"),
        api.load("pShotSab", "Son/sfx_shot_Sab.mp3"),
        api.load("pulseIEM", "Son/Iem_Instant.mp3"),
        api.load("ishShield", "Son/Bouclier_Instant.mp3"),
        api.load("deathPlayer", "Son/Mort_joueur.mp3"),
        api.load("deathPlayer2", "Son/Mort_joueur_2.mp3"),
        api.load("respawnPlayer", "Son/réapparition.mp3"),
        api.load("radiationLoop", "Son/Radiation.mp3"),
        api.load("repairStart", "Son/Repair_start.mp3"),
        api.load("repairLoop", "Son/Repair.mp3"),
        api.load("swReady", "Son/Saut_possible.mp3"),
        api.load("swJump", "Son/Saut_en_cours.mp3"),
        api.load("swDone", "Son/Saut_terminee.mp3"),
        api.load("swDeny", "Son/Saut_impossible.mp3"),
        api.load("shipMove", "Son/Ship_move.mp3"),
        api.load("npcDeath", "Son/Mort_autre.mp3"),
        api.load("collect", "Son/recolte.mp3"),
        api.load("laserHit1", "Son/LaserHit_1.mp3"),
        api.load("laserHit2", "Son/LaserHit_2.mp3"),
        api.load("laserHit3", "Son/Laser_Hit_3.mp3"),
        api.load("selectNew", "Son/Selection_nouvelle.mp3"),
        api.load("selectAgain", "Son/selection_deja.mp3"),
        api.load("outOfRange", "Son/Out_Of_Range.mp3"),
        api.load("escortX1", "Son/sfx_shot_x1.mp3"),
        api.load("escortX2", "Son/sfx_shot_x2.mp3"),
        api.load("escortX3", "Son/sfx_shot_x3.mp3"),
        api.load("escortX4", "Son/sfx_shot_x4.mp3"),
        api.load("escortX6", "Son/sfx_shot_x6.mp3"),
        api.load("escortSab", "Son/sfx_shot_Sab.mp3"),
      ]).catch(() => {});
    },

    play(name, opts = {}) {
      if (!api.enabled || !api.ctx) return;
      const buf = api.buffers[name];
      if (!buf) return;

      const { vol = 1, rate = 1, detune = 0, cooldown = 0, maxVoices = 4, cut = false } = opts;
      const now = api.ctx.currentTime;

      const last = api.last[name] ?? -999;
      if (cooldown && now - last < cooldown) return;

      // ✅ coupe immédiatement l'instance précédente avant de jouer (tirs serrés)
      if (cut) api.stop(name);

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
      g.connect(api._soundGain(name));

      const node = { src, g };
      (api.sources[name] = api.sources[name] || []).push(node);
      src.onended = () => {
        const list = api.sources[name];
        if (list) {
          const i = list.indexOf(node);
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
      for (const n of Array.from(list)) {
        try {
          n.src.onended = null;
          n.src.stop();
        } catch {}
      }
      api.sources[name] = [];
      api.active[name] = 0;
    },

    // Atténue toutes les instances en cours d'un son en fondu, sans coupure.
    // Ne baisse jamais à 0 : `to` est le volume cible (encore audible par défaut).
    fadeOut(name, opts = {}) {
      const list = api.sources[name];
      if (!list || !list.length) return;
      const { dur = 0.35, to = 0.35 } = opts;
      const now = api.ctx.currentTime;
      for (const n of Array.from(list)) {
        try {
          const cur = Math.max(0, n.g.gain.value);
          n.g.gain.cancelScheduledValues(now);
          n.g.gain.setValueAtTime(cur, now);
          n.g.gain.linearRampToValueAtTime(Math.min(cur, to), now + dur);
        } catch {}
      }
      api.active[name] = 0;
    },

    // Boucle sonore avec crossfade : chaque copie démarre légèrement avant la fin
    // de la précédente et se fond avec elle, ce qui élimine les coupures
    // perceptibles au point de boucle des MP3 non bouclables.
    // Toutes les copies sont identiques : aucune différence audible au démarrage.
    loop(name, opts = {}) {
      if (!api.enabled || !api.ctx) return;
      if (api.loops[name]) return;
      const buf = api.buffers[name];
      if (!buf) return;

      const { vol = 1, rate = 1, fadeIn = 0.3, crossfade = 0.18, instantFirst = false } = opts;
      const dur = buf.duration;
      const step = Math.max(0.05, dur - crossfade);
      const xfade = Math.min(crossfade, step * 0.9);
      const now = api.ctx.currentTime;

      const state = {
        nodes: [],
        vol,
        step,
        xfade,
        nextAt: now + Math.max(0.02, fadeIn),
        fadeOut: 0.3,
        keeper: null,
        stopped: false,
        first: true,
      };

      const spawn = (when) => {
        const src = api.ctx.createBufferSource();
        src.buffer = buf;
        src.playbackRate.value = rate;
        const g = api.ctx.createGain();
        // ✅ première copie : volume total immédiat (aucun fondu d'entrée)
        if (state.first && instantFirst) {
          g.gain.setValueAtTime(vol, when);
        } else {
          g.gain.setValueAtTime(0, when);
          g.gain.linearRampToValueAtTime(vol, when + xfade);
        }
        g.gain.setValueAtTime(vol, when + dur - xfade);
        g.gain.linearRampToValueAtTime(0, when + dur);
        src.connect(g);
        g.connect(api._soundGain(name));
        src.start(when);
        src.stop(when + dur + 0.02);
        const node = { src, g };
        state.nodes.push(node);
        state.first = false;
        src.onended = () => {
          const i = state.nodes.indexOf(node);
          if (i >= 0) state.nodes.splice(i, 1);
        };
      };

      api.loops[name] = state;

      const scheduleAhead = () => {
        if (api.loops[name] !== state || state.stopped) return;
        const horizon = api.ctx.currentTime + 8;
        while (state.nextAt < horizon) {
          spawn(state.nextAt);
          state.nextAt += state.step;
        }
        state.keeper = window.setTimeout(scheduleAhead, 1000);
      };
      scheduleAhead();
    },

    // Arrête une boucle, avec fondu de sortie si demandé (0 = coupure instantanée).
    stopLoop(name, opts = {}) {
      const l = api.loops[name];
      if (!l) return;
      if (l.stopped) return;
      l.stopped = true;

      if (l.keeper) {
        clearTimeout(l.keeper);
        l.keeper = null;
      }

      const { fadeOut } = opts;
      const f = Number.isFinite(fadeOut) ? fadeOut : l.fadeOut;
      const now = api.ctx.currentTime;

      for (const n of l.nodes) {
        try {
          if (f > 0) {
            n.g.gain.cancelScheduledValues(now);
            n.g.gain.setValueAtTime(Math.max(0, n.g.gain.value), now);
            n.g.gain.linearRampToValueAtTime(0, now + f);
          }
        } catch {}
      }
      for (const n of l.nodes) {
        try {
          if (f > 0) n.src.stop(now + f + 0.02);
          else n.src.stop();
        } catch {}
      }

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
        gA.connect(api._soundGain(nameA));
        gA.gain.setValueAtTime(vol, now);
        gA.gain.linearRampToValueAtTime(0, tCross + fade);
        srcA.start(now);
        srcA.stop(now + durA + 0.05);
        const nodeA = { src: srcA, g: gA };
        (api.sources[nameA] = api.sources[nameA] || []).push(nodeA);
        srcA.onended = () => {
          const list = api.sources[nameA];
          if (list) {
            const i = list.indexOf(nodeA);
            if (i >= 0) list.splice(i, 1);
          }
          api.active[nameA] = Math.max(0, (api.active[nameA] || 1) - 1);
        };

        const srcB = api.ctx.createBufferSource();
        srcB.buffer = bufB;
        srcB.playbackRate.value = rate;
        const gB = api.ctx.createGain();
        srcB.connect(gB);
        gB.connect(api._soundGain(nameB));
        gB.gain.setValueAtTime(vol, tCross);
        srcB.start(tCross);
        const nodeB = { src: srcB, g: gB };
        (api.sources[nameB] = api.sources[nameB] || []).push(nodeB);
        srcB.onended = () => {
          const list = api.sources[nameB];
          if (list) {
            const i = list.indexOf(nodeB);
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
