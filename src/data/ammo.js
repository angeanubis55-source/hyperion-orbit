// src/data/ammo.js
export const AMMO = {
  x1: { mult: 1.0, color: "rgba(255,59,78,0.95)" },
  x2: { mult: 2.0, color: "rgba(74,163,255,0.95)" },
  x3: { mult: 3.0, color: "rgba(61,255,140,0.95)" },
  x4: { mult: 4.0, color: "rgba(246,247,255,0.95)" },
  sab: { mult: 0.5, color: "rgba(0,30,255,0.95)" },
  x6: { mult: 6.0, color: "rgba(255,165,74,0.95)" },
};

export const PLAYER_BULLET_SPRITES = {
  x1: { src: "Munitions/x1.png", w: 52, h: 18, glow: true, rotateOffset: Math.PI },
  x2: { src: "Munitions/x2.png", w: 54, h: 18, glow: true, rotateOffset: Math.PI },
  x3: { src: "Munitions/x3.png", w: 56, h: 18, glow: true, rotateOffset: Math.PI },
  x4: { src: "Munitions/x4.png", w: 58, h: 18, glow: true, rotateOffset: Math.PI },
  sab: { src: "Munitions/Special1.png", w: 150, h: 24, glow: true, rotateOffset: Math.PI },
  x6: { src: "Munitions/rsb.png", w: 58, h: 18, glow: true, rotateOffset: Math.PI },
  // Roquettes : sprites "Munitions/<id>.png" à fournir (voir data/rockets.js).
  // En attendant, le moteur dessine un point de fallback au lieu de planter.
  r310: { src: "Munitions/r310.png", w: 46, h: 20, glow: true, rotateOffset: Math.PI },
  eco10: { src: "Munitions/eco10.png", w: 46, h: 20, glow: true, rotateOffset: Math.PI },
  plt2021: { src: "Munitions/plt2021.png", w: 46, h: 20, glow: true, rotateOffset: Math.PI },
  plt2026: { src: "Munitions/plt2026.png", w: 46, h: 20, glow: true, rotateOffset: Math.PI },
  plt3030: { src: "Munitions/plt3030.png", w: 46, h: 20, glow: true, rotateOffset: Math.PI },
  ubr100: { src: "Munitions/ubr100.png", w: 46, h: 20, glow: true, rotateOffset: Math.PI },
  dcr250: { src: "Munitions/dcr250.png", w: 46, h: 20, glow: true, rotateOffset: Math.PI },
  cbr: { src: "Munitions/cbr.png", w: 46, h: 20, glow: true, rotateOffset: Math.PI },
  pld8: { src: "Munitions/pld8.png", w: 46, h: 20, glow: true, rotateOffset: Math.PI },
  sar01: { src: "Munitions/sar01.png", w: 46, h: 20, glow: true, rotateOffset: Math.PI },
  sar02: { src: "Munitions/sar02.png", w: 46, h: 20, glow: true, rotateOffset: Math.PI },
  hstrm01: { src: "Munitions/hstrm01.png", w: 46, h: 20, glow: true, rotateOffset: Math.PI },
};