// COMBAT/AMMO_TYPES.js
export const AMMO = {
  x1: { mult: 1.0, color: "rgba(255,59,78,0.95)" },
  x2: { mult: 2.0, color: "rgba(74,163,255,0.95)" },
  x3: { mult: 3.0, color: "rgba(61,255,140,0.95)" },
  x4: { mult: 4.0, color: "rgba(246,247,255,0.95)" },
  sab: { mult: 0.5, color: "rgba(0,30,255,0.95)" },
  x6: { mult: 6.0, color: "rgba(255,165,74,0.95)" },
};

export const PLAYER_BULLET_SPRITES = {
  x1: { src: "COMBAT/MUNITIONS/X1.png", w: 52, h: 18, glow: true, rotateOffset: Math.PI },
  x2: { src: "COMBAT/MUNITIONS/X2.png", w: 54, h: 18, glow: true, rotateOffset: Math.PI },
  x3: { src: "COMBAT/MUNITIONS/X3.png", w: 56, h: 18, glow: true, rotateOffset: Math.PI },
  x4: { src: "COMBAT/MUNITIONS/X4.png", w: 58, h: 18, glow: true, rotateOffset: Math.PI },
  sab: { src: "COMBAT/MUNITIONS/SAB.png", w: 47, h: 65, glow: true, rotateOffset: Math.PI },
  x6: { src: "COMBAT/MUNITIONS/RSB.png", w: 58, h: 18, glow: true, rotateOffset: Math.PI },
  // Roquettes : sprites "COMBAT/MUNITIONS/<id>.png" à fournir (voir data/rockets.js).
  // En attendant, le moteur dessine un point de fallback au lieu de planter.
  r310: { src: "COMBAT/MUNITIONS/R310.png", w: 46, h: 20, glow: true, rotateOffset: Math.PI },
  eco10: { src: "COMBAT/MUNITIONS/ECO10.png", w: 46, h: 20, glow: true, rotateOffset: Math.PI },
  plt2021: { src: "COMBAT/MUNITIONS/PLT2021.png", w: 46, h: 20, glow: true, rotateOffset: Math.PI },
  plt2026: { src: "COMBAT/MUNITIONS/PLT2026.png", w: 46, h: 20, glow: true, rotateOffset: Math.PI },
  plt3030: { src: "COMBAT/MUNITIONS/PLT3030.png", w: 46, h: 20, glow: true, rotateOffset: Math.PI },
  ubr100: { src: "COMBAT/MUNITIONS/UBR100.png", w: 46, h: 20, glow: true, rotateOffset: Math.PI },
  dcr250: { src: "COMBAT/MUNITIONS/DCR250.png", w: 46, h: 20, glow: true, rotateOffset: Math.PI },
  cbr: { src: "COMBAT/MUNITIONS/CBR.png", w: 46, h: 20, glow: true, rotateOffset: Math.PI },
  pld8: { src: "COMBAT/MUNITIONS/PLD8.png", w: 46, h: 20, glow: true, rotateOffset: Math.PI },
  sar01: { src: "COMBAT/MUNITIONS/SAR01.png", w: 46, h: 20, glow: true, rotateOffset: Math.PI },
  sar02: { src: "COMBAT/MUNITIONS/SAR02.png", w: 46, h: 20, glow: true, rotateOffset: Math.PI },
  hstrm01: { src: "COMBAT/MUNITIONS/HSTRM01.png", w: 46, h: 20, glow: true, rotateOffset: Math.PI },
};
