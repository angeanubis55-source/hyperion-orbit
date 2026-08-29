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
};