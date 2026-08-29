// src/core/ImageLoader.js
"use strict";

export function createImageLoader({
  concurrency = 6,
  maxDpr = 2,
} = {}) {
  const IMG_CACHE = new Map();
  const IMG_PROMISE = new Map();
  const IMG_QUEUE = [];
  let IMG_INFLIGHT = 0;

  function isReady(img) {
    return !!(img && img.complete && img.naturalWidth > 0);
  }

  function _pump() {
    while (IMG_INFLIGHT < concurrency && IMG_QUEUE.length) {
      const { src, img, resolve } = IMG_QUEUE.shift();
      IMG_INFLIGHT++;

      const finish = () => {
        IMG_INFLIGHT--;
        resolve(img);
        _pump();
      };

      img.onload = () => {
        if (img.decode) img.decode().catch(() => {}).finally(finish);
        else finish();
      };
      img.onerror = () => {
        console.warn("Image manquante:", src);
        finish();
      };

      img.src = src;
    }
  }

  function load(src, { priority = false } = {}) {
    if (!src) return Promise.resolve(null);

    let img = IMG_CACHE.get(src);
    if (!img) {
      img = new Image();
      img.decoding = "async";
      IMG_CACHE.set(src, img);
    }

    if (IMG_PROMISE.has(src)) return IMG_PROMISE.get(src);

    const p = new Promise((resolve) => {
      const job = { src, img, resolve };
      if (priority) IMG_QUEUE.unshift(job);
      else IMG_QUEUE.push(job);
      _pump();
    });

    IMG_PROMISE.set(src, p);
    return p;
  }

  function getCached(src) {
    if (!src) return null;
    const img = IMG_CACHE.get(src);
    if (img) return img;
    load(src, { priority: false });
    return IMG_CACHE.get(src) || null;
  }

  // utile si tu veux standardiser ton resize ailleurs
  function computeDpr() {
    return Math.max(1, Math.min(maxDpr, window.devicePixelRatio || 1));
  }

  return { load, getCached, isReady, computeDpr };
}
