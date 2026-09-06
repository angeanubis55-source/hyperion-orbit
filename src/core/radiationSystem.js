"use strict";

import { clamp } from "./collision.js";

export function createRadiationSystem(options = {}) {
  const config = {
    warningDuration: Math.max(0, Number(options.warningDuration ?? 5)),
    tickInterval: Math.max(0.05, Number(options.tickInterval ?? 0.5)),
    minPct: Math.max(0, Number(options.minPct ?? 0.01)),
    maxPct: Math.max(0, Number(options.maxPct ?? 0.05)),
    scaleDepth: Math.max(1, Number(options.scaleDepth ?? 2000)),
    visualSettleDuration: Math.max(0.05, Number(options.visualSettleDuration ?? 1)),
    fadeInSpeed: Math.max(0.01, Number(options.fadeInSpeed ?? 2.4)),
    fadeOutSpeed: Math.max(0.01, Number(options.fadeOutSpeed ?? 0.85)),
  };

  const state = {
    active: false,
    exposure: 0,
    edgeFade: 0,
    wasDamaging: false,
    tickAccumulator: 0,
    pct: 0,
  };

  function reset() {
    state.active = false;
    state.exposure = 0;
    state.edgeFade = 0;
    state.wasDamaging = false;
    state.tickAccumulator = 0;
    state.pct = 0;
  }

  function update(dt, context = {}) {
    if (!context.started || context.dead) return 0;
    dt = Math.max(0, Number(dt) || 0);
    state.active = !!context.outside;
    state.edgeFade = clamp(
      state.edgeFade + (state.active ? dt * config.fadeInSpeed : -dt * config.fadeOutSpeed),
      0,
      1
    );

    if (!state.active) {
      state.exposure = 0;
      state.tickAccumulator = 0;
      state.pct = 0;
      if (state.edgeFade <= 0) state.wasDamaging = false;
      return 0;
    }

    // Le pourcentage augmente avec la distance au point de retour (bord de carte).
    const depth = Math.max(0, Number(context.depth) || 0);
    const depthT = clamp(depth / config.scaleDepth, 0, 1);
    state.pct = config.minPct + (config.maxPct - config.minPct) * depthT;

    const previousExposure = state.exposure;
    state.exposure += dt;
    if (state.exposure < config.warningDuration) return 0;
    state.wasDamaging = true;
    const damagingDt = Math.max(0, state.exposure - Math.max(previousExposure, config.warningDuration));
    state.tickAccumulator += damagingDt;
    const tickCount = Math.floor((state.tickAccumulator + 1e-9) / config.tickInterval);
    if (tickCount <= 0) return 0;
    state.tickAccumulator -= tickCount * config.tickInterval;
    return Math.max(0, Number(context.hpMax) || 0)
      * state.pct
      * config.tickInterval
      * tickCount;
  }

  function draw(ctx, width, height, nowSeconds = 0) {
    if (!ctx || state.edgeFade <= 0.001) return;
    const progress = clamp(state.exposure / config.warningDuration, 0, 1);
    const pulseClock = state.active ? state.exposure : nowSeconds;
    const pulse = 0.5 + 0.5 * Math.sin(pulseClock * Math.PI * 2 * 0.6);
    const alpha = (0.07 + pulse * 0.13) * state.edgeFade;
    const edge = Math.max(90, Math.min(width, height) * 0.18);

    ctx.save();
    const paint = (gradient, x, y, w, h) => { ctx.fillStyle = gradient; ctx.fillRect(x, y, w, h); };
    const top = ctx.createLinearGradient(0, 0, 0, edge);
    top.addColorStop(0, `rgba(255,20,35,${alpha})`); top.addColorStop(1, "rgba(255,20,35,0)");
    paint(top, 0, 0, width, edge);
    const bottom = ctx.createLinearGradient(0, height, 0, height - edge);
    bottom.addColorStop(0, `rgba(255,20,35,${alpha})`); bottom.addColorStop(1, "rgba(255,20,35,0)");
    paint(bottom, 0, height - edge, width, edge);
    const left = ctx.createLinearGradient(0, 0, edge, 0);
    left.addColorStop(0, `rgba(255,20,35,${alpha})`); left.addColorStop(1, "rgba(255,20,35,0)");
    paint(left, 0, 0, edge, height);
    const right = ctx.createLinearGradient(width, 0, width - edge, 0);
    right.addColorStop(0, `rgba(255,20,35,${alpha})`); right.addColorStop(1, "rgba(255,20,35,0)");
    paint(right, width - edge, 0, edge, height);
    ctx.restore();
  }

  return { config, state, update, draw, reset };
}
