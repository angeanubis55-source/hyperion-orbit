 export const NPC_TYPES = {

  npc_Streuner: {
    name: "-=[ Streuner ]=-",
    sprite: { path: "Npc/Streuner/", frames: 32, firstNumber: 1, ext: ".png", w: 109, h: 96, angleOffset: Math.PI, flipX: false, flipY: false },
    playSprite: false,
    spriteSpeed: 0,
    bulletSprite: { src: "Munitions/x1.png", w: 78, h: 20, glow: true, invert: true },
    r: 18, hp: 800, shield: 400, speed: 240, bulletDmg: 20, bulletSpeed: 4500, value: 400,
    shootRange: 500, shootRate: 1.0, bulletSpread: 0.05, burst: 1, bulletR: 7, bulletScale: 1.5, orbit: 0.45,
  },
  npc_Boss_Streuner: {
    name: "..::{ Boss Streuner }::..",
    sprite: { path: "Npc/Boss_Streuner/", frames: 32, firstNumber: 1, ext: ".png", w: 165, h: 146, angleOffset: Math.PI, flipX: false, flipY: false },
    playSprite: false,
    spriteSpeed: 0,
    bulletSprite: { src: "Munitions/x2.png", w: 46, h: 16, glow: true, invert: true },
    r: 18, hp: 3200, shield: 1600, speed: 260, bulletDmg: 80, bulletSpeed: 4500, value: 1600,
    shootRange: 500, shootRate: 1.0, bulletSpread: 0.05, burst: 1, bulletR: 7, bulletScale: 1.5, orbit: 0.45,
  },
  npc_Uber_Streuner: {
    name: "[ Uber Streuner ]",
    sprite: { path: "Npc/Uber_Streuner/", frames: 32, firstNumber: 1, ext: ".png", w: 165, h: 146, angleOffset: Math.PI, flipX: false, flipY: false },
    playSprite: false,
    spriteSpeed: 0,
    bulletSprite: { src: "Munitions/x4.png", w: 78, h: 20, glow: true, invert: true },
    r: 18, hp: 6400, shield: 3200, speed: 280, bulletDmg: 160, bulletSpeed: 4500, value: 3200,
    shootRange: 500, shootRate: 1.0, bulletSpread: 0.05, burst: 1, bulletR: 7, bulletScale: 1.5, orbit: 0.45,
  },

  npc_Lordakia: {
    name: "-=[ Lordakia ]=-",
    sprite: { path: "Npc/Lordakia/", frames: 32, firstNumber: 1, ext: ".png", w: 71, h: 64, angleOffset: Math.PI, flipX: false, flipY: false },
    playSprite: true,
    spriteSpeed: 20,
    bulletSprite: { src: "Munitions/Special8.png", w: 55, h: 17, glow: true, invert: true },
    r: 18, hp: 2000, shield: 2000, speed: 320, bulletDmg: 80, bulletSpeed: 4500, value: 800,
    shootRange: 500, shootRate: 1.0, bulletSpread: 0.05, burst: 1, bulletR: 7, bulletScale: 1.5, orbit: 0.45,
  },
  npc_Boss_Lordakia: {
    name: "..::{ Boss Lordakia }::..",
    sprite: { path: "Npc/Boss_Lordakia/", frames: 32, firstNumber: 1, ext: ".png", w: 86, h: 77, angleOffset: Math.PI, flipX: false, flipY: false },
    playSprite: true,
    spriteSpeed: 20,
    bulletSprite: { src: "Munitions/Special8.png", w: 55, h: 17, glow: true, invert: true },
    r: 18, hp: 8000, shield: 8000, speed: 340, bulletDmg: 320, bulletSpeed: 4500, value: 3200,
    shootRange: 500, shootRate: 1.0, bulletSpread: 0.05, burst: 1, bulletR: 7, bulletScale: 1.5, orbit: 0.45,
  },
  npc_Uber_Lordakia: {
    name: "[ Uber Lordakia ]",
    sprite: { path: "Npc/Uber_Lordakia/", frames: 32, firstNumber: 1, ext: ".png", w: 98, h: 89, angleOffset: Math.PI, flipX: false, flipY: false },
    playSprite: true,
    spriteSpeed: 20,
    bulletSprite: { src: "Munitions/Special8.png", w: 55, h: 17, glow: true, invert: true },
    r: 18, hp: 16000, shield: 16000, speed: 360, bulletDmg: 640, bulletSpeed: 4500, value: 6400,
    shootRange: 500, shootRate: 1.0, bulletSpread: 0.05, burst: 1, bulletR: 7, bulletScale: 1.5, orbit: 0.45,
  },

  npc_Saimon: {
    name: "-=[ Saimon ]=-",
    sprite: { path: "Npc/Saimon/", frames: 32, firstNumber: 1, ext: ".png", w: 90, h: 80, angleOffset: Math.PI, flipX: false, flipY: false },
    playSprite: false,
    spriteSpeed: 0,
    bulletSprite: { src: "Munitions/Special8.png", w: 55, h: 17, glow: true, invert: true },
    r: 18, hp: 6000, shield: 3000, speed: 320, bulletDmg: 200, bulletSpeed: 4500, value: 1600,
    shootRange: 500, shootRate: 1.0, bulletSpread: 0.05, burst: 1, bulletR: 7, bulletScale: 1.5, orbit: 0.45,
  },
    npc_Boss_Saimon: {
    name: "..::{ Boss Saimon }::..",
    sprite: { path: "Npc/Boss_Saimon/", frames: 32, firstNumber: 1, ext: ".png", w: 113, h: 100, angleOffset: Math.PI, flipX: false, flipY: false },
    playSprite: false,
    spriteSpeed: 0,
    bulletSprite: { src: "Munitions/Special8.png", w: 55, h: 17, glow: true, invert: true },
    r: 18, hp: 24000, shield: 12000, speed: 340, bulletDmg: 800, bulletSpeed: 4500, value: 6400,
    shootRange: 550, shootRate: 1.0, bulletSpread: 0.05, burst: 1, bulletR: 7, bulletScale: 1.5, orbit: 0.45,
  },
    npc_Uber_Saimon: {
    name: "[ Uber Saimon ]",
    sprite: { path: "Npc/Uber_Saimon/", frames: 32, firstNumber: 1, ext: ".png", w: 125, h: 112, angleOffset: Math.PI, flipX: false, flipY: false },
    playSprite: false,
    spriteSpeed: 0,
    bulletSprite: { src: "Munitions/Special8.png", w: 55, h: 17, glow: true, invert: true },
    r: 18, hp: 48000, shield: 24000, speed: 360, bulletDmg: 1600, bulletSpeed: 4500, value: 12800,
    shootRange: 600, shootRate: 1.0, bulletSpread: 0.05, burst: 1, bulletR: 7, bulletScale: 1.5, orbit: 0.45,
  },

  npc_Mordon: {
    name: "-=[ Mordon ]=-",
    sprite: { path: "Npc/Mordon/", frames: 16, firstNumber: 1, ext: ".png", w: 150, h: 120, angleOffset: Math.PI, flipX: false, flipY: false },
    playSprite: true,
    spriteSpeed: 20,
    bulletSprite: { src: "Munitions/Special8.png", w: 55, h: 17, glow: true, invert: true },
    r: 18, hp: 20000, shield: 10000, speed: 125, bulletDmg: 400, bulletSpeed: 4500, value: 3200,
    shootRange: 500, shootRate: 1.0, bulletSpread: 0.05, burst: 1, bulletR: 7, bulletScale: 1.5, orbit: 0.45,
  },
  npc_Boss_Mordon: {
    name: "..::{ Boss Mordon }::..",
    sprite: { path: "Npc/Boss_Mordon/", frames: 16, firstNumber: 1, ext: ".png", w: 188, h: 164, angleOffset: Math.PI, flipX: false, flipY: false },
    playSprite: true,
    spriteSpeed: 20,
    bulletSprite: { src: "Munitions/Special8.png", w: 55, h: 17, glow: true, invert: true },
    r: 18, hp: 80000, shield: 40000, speed: 145, bulletDmg: 1600, bulletSpeed: 4500, value: 12800,
    shootRange: 550, shootRate: 1.0, bulletSpread: 0.05, burst: 1, bulletR: 7, bulletScale: 1.5, orbit: 0.45,
  },
  npc_Uber_Mordon: {
    name: "[ Uber Mordon ]",
    sprite: { path: "Npc/Uber_Mordon/", frames: 16, firstNumber: 1, ext: ".png", w: 208, h: 184, angleOffset: Math.PI, flipX: false, flipY: false },
    playSprite: true,
    spriteSpeed: 30,
    bulletSprite: { src: "Munitions/Special8.png", w: 55, h: 17, glow: true, invert: true },
    r: 18, hp: 160000, shield: 80000, speed: 165, bulletDmg: 3200, bulletSpeed: 4500, value: 25600,
    shootRange: 600, shootRate: 1.0, bulletSpread: 0.05, burst: 1, bulletR: 7, bulletScale: 1.5, orbit: 0.45,
  },

  npc_Sibelon: {
    name: "-=[ Sibelon ]=-",
    sprite: { path: "Npc/Sibelon/", frames: 32, firstNumber: 1, ext: ".png", w: 338, h: 300, angleOffset: Math.PI, flipX: false, flipY: false },
    playSprite: false,
    spriteSpeed: 0,
    bulletSprite: { src: "Munitions/Special8.png", w: 55, h: 17, glow: true, invert: true },
    r: 18, hp: 200000, shield: 200000, speed: 100, bulletDmg: 2500, bulletSpeed: 4500, value: 12800,
    shootRange: 500, shootRate: 1.0, bulletSpread: 0.05, burst: 1, bulletR: 7, bulletScale: 1.5, orbit: 0.45,
  },
  npc_Boss_Sibelon: {
    name: "..::{ Boss Sibelon }::..",
    sprite: { path: "Npc/Boss_Sibelon/", frames: 32, firstNumber: 1, ext: ".png", w: 353, h: 313, angleOffset: Math.PI, flipX: false, flipY: false },
    playSprite: false,
    spriteSpeed: 0,
    bulletSprite: { src: "Munitions/Special8.png", w: 55, h: 17, glow: true, invert: true },
    r: 18, hp: 800000, shield: 800000, speed: 120, bulletDmg: 10000, bulletSpeed: 4500, value: 51200,
    shootRange: 550, shootRate: 1.0, bulletSpread: 0.05, burst: 1, bulletR: 7, bulletScale: 1.5, orbit: 0.45,
  },
  npc_Uber_Sibelon: {
    name: "[ Uber Sibelon ]",
    sprite: { path: "Npc/Uber_Sibelon/", frames: 32, firstNumber: 1, ext: ".png", w: 369, h: 329, angleOffset: Math.PI, flipX: false, flipY: false },
    playSprite: false,
    spriteSpeed: 0,
    bulletSprite: { src: "Munitions/Special8.png", w: 55, h: 17, glow: true, invert: true },
    r: 18, hp: 1200000, shield: 800000, speed: 140, bulletDmg: 20000, bulletSpeed: 4500, value: 102400,
    shootRange: 600, shootRate: 1.0, bulletSpread: 0.05, burst: 1, bulletR: 7, bulletScale: 1.5, orbit: 0.45,
  },

  npc_Devolarium: {
    name: "-=[ Devolarium ]=-",
    sprite: { path: "Npc/Devolarium/", frames: 32, firstNumber: 1, ext: ".png", w: 228, h: 228, angleOffset: Math.PI, flipX: false, flipY: false },
    playSprite: false,
    spriteSpeed: 0,
    bulletSprite: { src: "Munitions/Special8.png", w: 55, h: 17, glow: true, invert: true },
    r: 18, hp: 100000, shield: 100000, speed: 200, bulletDmg: 1200, bulletSpeed: 4500, value: 6400,
    shootRange: 500, shootRate: 1.0, bulletSpread: 0.05, burst: 1, bulletR: 7, bulletScale: 1.5, orbit: 0.45,
  },
  npc_Boss_Devolarium: {
    name: "..::{ Boss Devolarium }::..",
    sprite: { path: "Npc/Boss_Devolarium/", frames: 32, firstNumber: 1, ext: ".png", w: 306, h: 306, angleOffset: Math.PI, flipX: false, flipY: false },
    playSprite: false,
    spriteSpeed: 0,
    bulletSprite: { src: "Munitions/Special8.png", w: 55, h: 17, glow: true, invert: true },
    r: 18, hp: 400000, shield: 400000, speed: 220, bulletDmg: 4800, bulletSpeed: 4500, value: 25600,
    shootRange: 500, shootRate: 1.0, bulletSpread: 0.05, burst: 1, bulletR: 7, bulletScale: 1.5, orbit: 0.45,
  },
  npc_Uber_Devolarium: {
    name: "[ Uber Devolarium ]",
    sprite: { path: "Npc/Uber_Devolarium/", frames: 32, firstNumber: 1, ext: ".png", w: 322, h: 322, angleOffset: Math.PI, flipX: false, flipY: false },
    playSprite: false,
    spriteSpeed: 0,
    bulletSprite: { src: "Munitions/Special8.png", w: 55, h: 17, glow: true, invert: true },
    r: 18, hp: 800000, shield: 800000, speed: 240, bulletDmg: 9600, bulletSpeed: 4500, value: 51200,
    shootRange: 550, shootRate: 1.0, bulletSpread: 0.05, burst: 1, bulletR: 7, bulletScale: 1.5, orbit: 0.45,
  },

  npc_Sibelonit: {
    name: "-=[ Sibelonit ]=-",
    sprite: { path: "Npc/Sibelonit/", frames: 32, firstNumber: 1, ext: ".png", w: 90, h: 80, angleOffset: Math.PI, flipX: false, flipY: false },
    playSprite: true,
    spriteSpeed: 20,
    bulletSprite: { src: "Munitions/Special8.png", w: 55, h: 17, glow: true, invert: true },
    r: 18, hp: 40000, shield: 40000, speed: 320, bulletDmg: 1250, bulletSpeed: 4500, value: 3200,
    shootRange: 500, shootRate: 1.0, bulletSpread: 0.05, burst: 1, bulletR: 7, bulletScale: 1.5, orbit: 0.45,
  },
  npc_Boss_Sibelonit: {
    name: "..::{ Boss Sibelonit }::..",
    sprite: { path: "Npc/Boss_Sibelonit/", frames: 32, firstNumber: 1, ext: ".png", w: 113, h: 101, angleOffset: Math.PI, flipX: false, flipY: false },
    playSprite: true,
    spriteSpeed: 20,
    bulletSprite: { src: "Munitions/Special8.png", w: 55, h: 17, glow: true, invert: true },
    r: 18, hp: 160000, shield: 160000, speed: 340, bulletDmg: 5000, bulletSpeed: 4500, value: 12800,
    shootRange: 500, shootRate: 1.0, bulletSpread: 0.05, burst: 1, bulletR: 7, bulletScale: 1.5, orbit: 0.45,
  },
  npc_Uber_Sibelonit: {
    name: "[ Uber Sibelonit ]",
    sprite: { path: "Npc/Uber_Sibelonit/", frames: 32, firstNumber: 1, ext: ".png", w: 129, h: 117, angleOffset: Math.PI, flipX: false, flipY: false },
    playSprite: true,
    spriteSpeed: 20,
    bulletSprite: { src: "Munitions/Special8.png", w: 55, h: 17, glow: true, invert: true },
    r: 18, hp: 320000, shield: 320000, speed: 360, bulletDmg: 10000, bulletSpeed: 4500, value: 25600,
    shootRange: 500, shootRate: 1.0, bulletSpread: 0.05, burst: 1, bulletR: 7, bulletScale: 1.5, orbit: 0.45,
  },

  npc_Lordakium: {
    name: "-=[ Lordakium ]=-",
    sprite: { path: "Npc/Lordakium/", frames: 32, firstNumber: 1, ext: ".png", w: 244, h: 218, angleOffset: Math.PI, flipX: false, flipY: false },
    playSprite: true,
    passiveNative: true,
    spriteSpeed: 20,
    bulletSprite: { src: "Munitions/Lordakium.png", w: 97, h: 37, glow: true, invert: true },
    r: 18, hp: 300000, shield: 200000, speed: 230, bulletDmg: 3000, bulletSpeed: 4500, value: 25600,
    shootRange: 500, shootRate: 1.0, bulletSpread: 0.05, burst: 1, bulletR: 7, bulletScale: 1.5, orbit: 0.45,
    
    onKill: {
      spawn: [
        { type: "npc_Lordakia", count: 3, radius: 120 }
    ]
  },
  },
  npc_Boss_Lordakium: {
    name: "..::{ Boss Lordakium }::..",
    sprite: { path: "Npc/Boss_Lordakium/", frames: 22, firstNumber: 1, ext: ".png", w: 263, h: 235, angleOffset: Math.PI, flipX: false, flipY: false },
    playSprite: true,
    passiveNative: true,
    spriteSpeed: 20,
    bulletSprite: { src: "Munitions/Lordakium.png", w: 97, h: 37, glow: true, invert: true },
    r: 18, hp: 1200000, shield: 800000, speed: 250, bulletDmg: 12000, bulletSpeed: 4500, value: 102400,
    shootRange: 550, shootRate: 1.0, bulletSpread: 0.05, burst: 1, bulletR: 7, bulletScale: 1.5, orbit: 0.45,
    
    onKill: {
      spawn: [
        { type: "npc_Boss_Lordakia", count: 4, radius: 120 }
    ]
  },
  },
  npc_Uber_Lordakium: {
    name: "[ Uber Lordakium ]",
    sprite: { path: "Npc/Uber_Lordakium/", frames: 22, firstNumber: 1, ext: ".png", w: 279, h: 251, angleOffset: Math.PI, flipX: false, flipY: false },
    playSprite: true,
    passiveNative: true,
    spriteSpeed: 20,
    bulletSprite: { src: "Munitions/Lordakium.png", w: 97, h: 37, glow: true, invert: true },
    r: 18, hp: 2400000, shield: 1600000, speed: 270, bulletDmg: 24000, bulletSpeed: 4500, value: 204800,
    shootRange: 600, shootRate: 1.0, bulletSpread: 0.05, burst: 1, bulletR: 7, bulletScale: 1.5, orbit: 0.45,
    
    onKill: {
      spawn: [
        { type: "npc_Uber_Lordakia", count: 5, radius: 120 }
    ]
  },
  },

  npc_Kristallin: {
    name: "-=[ Kristallin ]=-",
    sprite: { path: "Npc/Kristallin/", frames: 83, firstNumber: 1, ext: ".png", w: 113, h: 113, angleOffset: Math.PI, flipX: false, flipY: false },
    playSprite: true,
    spriteSpeed: 20,
    bulletSprite: { src: "Munitions/Kristallin.png", w: 40, h: 15, glow: true , invert: true},
    r: 18, hp: 50000, shield: 40000, speed: 320, bulletDmg: 1500, bulletSpeed: 4500, value: 6400,
    shootRange: 500, shootRate: 1.0, bulletSpread: 0.05, burst: 1, bulletR: 7, bulletScale: 1.5, orbit: 0.45,
  },
  npc_Boss_Kristallin: {
    name: "..::{ Boss Kristallin }::..",
    sprite: { path: "Npc/Boss_Kristallin/", frames: 83, firstNumber: 1, ext: ".png", w: 107, h: 107, angleOffset: Math.PI, flipX: false, flipY: false },
    playSprite: true,
    spriteSpeed: 20,
    bulletSprite: { src: "Munitions/Kristallin.png", w: 40, h: 15, glow: true, invert: true },
    r: 18, hp: 200000, shield: 160000, speed: 340, bulletDmg: 6000, bulletSpeed: 4500, value: 25600,
    shootRange: 550, shootRate: 1.0, bulletSpread: 0.05, burst: 1, bulletR: 7, bulletScale: 1.5, orbit: 0.45,
  },
  npc_Uber_Kristallin: {
    name: "[ Uber Kristallin ]",
    sprite: { path: "Npc/Uber_Kristallin/", frames: 83, firstNumber: 1, ext: ".png", w: 113, h: 113, angleOffset: Math.PI, flipX: false, flipY: false },
    playSprite: true,
    spriteSpeed: 20,
    bulletSprite: { src: "Munitions/Kristallin.png", w: 40, h: 15, glow: true, invert: true },
    r: 18, hp: 400000, shield: 320000, speed: 360, bulletDmg: 12000, bulletSpeed: 4500, value: 51200,
    shootRange: 600, shootRate: 1.0, bulletSpread: 0.05, burst: 1, bulletR: 7, bulletScale: 1.5, orbit: 0.45,
  },

  npc_Kristallon: {
    name: "-=[ Kristallon ]=-",
    sprite: { path: "Npc/Kristallon/", frames: 83, firstNumber: 1, ext: ".png", w: 188, h: 188, angleOffset: Math.PI, flipX: false, flipY: false },
    playSprite: true,
    passiveNative: true,
    spriteSpeed: 20,
    bulletSprite: { src: "Munitions/Kristallon.png", w: 40, h: 15, glow: true, invert: true },
    r: 18, hp: 400000, shield: 300000, speed: 250, bulletDmg: 4500, bulletSpeed: 4500, value: 51200,
    shootRange: 500, shootRate: 1.0, bulletSpread: 0.05, burst: 1, bulletR: 7, bulletScale: 1.5, orbit: 0.45,
  },
  npc_Boss_Kristallon: {
    name: "..::{ Boss Kristallon }::..",
    sprite: { path: "Npc/Boss_Kristallon/", frames: 83, firstNumber: 1, ext: ".png", w: 188, h: 188, angleOffset: Math.PI, flipX: false, flipY: false },
    playSprite: true,
    passiveNative: true,
    spriteSpeed: 20,
    bulletSprite: { src: "Munitions/Kristallon.png", w: 40, h: 15, glow: true, invert: true },
    r: 18, hp: 1200000, shield: 1600000, speed: 270, bulletDmg: 18000, bulletSpeed: 4500, value: 204800,
    shootRange: 550, shootRate: 1.0, bulletSpread: 0.05, burst: 1, bulletR: 7, bulletScale: 1.5, orbit: 0.45,
  },
  npc_Uber_Kristallon: {
    name: "[ Uber Kristallon ]",
    sprite: { path: "Npc/Uber_Kristallon/", frames: 83, firstNumber: 1, ext: ".png", w: 188, h: 188, angleOffset: Math.PI, flipX: false, flipY: false },
    playSprite: true,
    passiveNative: true,
    spriteSpeed: 20,
    bulletSprite: { src: "Munitions/Kristallon.png", w: 40, h: 15, glow: true, invert: true },
    r: 18, hp: 3200000, shield: 2400000, speed: 290, bulletDmg: 36000, bulletSpeed: 4500, value: 409600,
    shootRange: 700, shootRate: 1.0, bulletSpread: 0.05, burst: 1, bulletR: 7, bulletScale: 1.5, orbit: 0.45,
  },

  npc_StreuneR8: {
    name: "-=[ StreuneR ]=-",
    sprite: { path: "Npc/StreuneR8/", frames: 32, firstNumber: 1, ext: ".png", w: 135, h: 120, angleOffset: Math.PI, flipX: false, flipY: false },
    playSprite: false,
    spriteSpeed: 0,
    bulletSprite: { src: "Munitions/x1.png", w: 78, h: 20, glow: true, invert: true },
    r: 18, hp: 20000, shield: 10000, speed: 550, bulletDmg: 450, bulletSpeed: 4500, value: 3200,
    shootRange: 500, shootRate: 1.0, bulletSpread: 0.05, burst: 1, bulletR: 7, bulletScale: 1.5, orbit: 0.45,
  },
  npc_Boss_StreuneR8: {
    name: "..::{ Boss StreuneR }::..",
    sprite: { path: "Npc/StreuneR8/", frames: 32, firstNumber: 1, ext: ".png", w: 155, h: 140, angleOffset: Math.PI, flipX: false, flipY: false },
    playSprite: false,
    spriteSpeed: 0,
    bulletSprite: { src: "Munitions/x3.png", w: 78, h: 20, glow: true, invert: true },
    r: 18, hp: 80000, shield: 40000, speed: 550, bulletDmg: 1800, bulletSpeed: 4500, value: 12800,
    shootRange: 500, shootRate: 1.0, bulletSpread: 0.05, burst: 1, bulletR: 7, bulletScale: 1.5, orbit: 0.45,
  },
  npc_Uber_StreuneR8: {
    name: "[ Uber StreuneR ]",
    sprite: { path: "Npc/Uber_StreuneR8/", frames: 32, firstNumber: 1, ext: ".png", w: 165, h: 150, angleOffset: Math.PI, flipX: false, flipY: false },
    playSprite: false,
    spriteSpeed: 0,
    bulletSprite: { src: "Munitions/x4.png", w: 78, h: 20, glow: true, invert: true },
    r: 18, hp: 160000, shield: 80000, speed: 550, bulletDmg: 3600, bulletSpeed: 4500, value: 25600,
    shootRange: 500, shootRate: 1.0, bulletSpread: 0.05, burst: 1, bulletR: 7, bulletScale: 1.5, orbit: 0.45,
  },


  npc_Blighted_Kristallon: {
  name: "-=[ Blighted Kristallon ]=-",
  sprite: { path: "Npc/Blighted_Kristallon/", frames: 83, firstNumber: 1, ext: ".png", w: 188, h: 188, angleOffset: Math.PI, flipX: false, flipY: false },
  playSprite: true,
  passiveNative: true,
  spriteSpeed: 20,
  bulletSprite: { src: "Munitions/Kristallon.png", w: 40, h: 15, glow: true, invert: true },
    r: 18, hp: 600000, shield: 400000, speed: 450, bulletDmg: 4000, bulletSpeed: 4500, value: 500000,
    shootRange: 580, shootRate: 1.0, bulletSpread: 0.05, burst: 1, bulletR: 7, bulletScale: 1.5, orbit: 0.45,

  onKill: {
    spawn: [
      { type: "npc_Blighted_Gygerthrall", count: 3, radius: 120 }
    ]
  },
  },
  npc_Blighted_Gygerthrall: {
    name: "-=[ Blighted Gygerthrall ]=-",
    sprite: { path: "Npc/Blighted_Gygerthrall/", frames: 32, firstNumber: 1, ext: ".png", w: 100, h: 100, angleOffset: Math.PI, flipX: false, flipY: false },
    playSprite: false,
    spriteSpeed: 0,
    bulletSprite: { src: "Munitions/Kristallon.png", w: 40, h: 15, glow: true, invert: true },
    r: 18, hp: 240000, shield: 200000, speed: 550, bulletDmg: 2500, bulletSpeed: 4500, value: 18800,
    shootRange: 620, shootRate: 1.0, bulletSpread: 0.05, burst: 1, bulletR: 7, bulletScale: 1.5, orbit: 0.45,
  },
  npc_Blighted_Kristallin: {
    name: "-=[ Plagued Kristallin ]=-",
    sprite: { path: "Npc/Blighted_Kristallin/", frames: 83, firstNumber: 1, ext: ".png", w: 113, h: 113, angleOffset: Math.PI, flipX: false, flipY: false },
    playSprite: true,
    passiveNative: true,
    spriteSpeed: 20,
    bulletSprite: { src: "Munitions/Kristallin.png", w: 40, h: 15, glow: true, invert: true },
    r: 18, hp: 75000, shield: 60000, speed: 320, bulletDmg: 1700, bulletSpeed: 4500, value: 12800,
    shootRange: 500, shootRate: 1.0, bulletSpread: 0.05, burst: 1, bulletR: 7, bulletScale: 1.5, orbit: 0.45,
  },


  npc_Streuner_Aider: {
    name: "-=[ Aider Streuner ]=-",
    sprite: { path: "Npc/Streuner_Aider/", frames: 32, firstNumber: 1, ext: ".png", w: 200, h: 200, angleOffset: Math.PI, flipX: false, flipY: false },
    playSprite: false,
    spriteSpeed: 0,
    bulletSprite: { src: "Munitions/x1.png", w: 78, h: 20, glow: true, invert: true },
    r: 18, hp: 600, shield: 800, speed: 300, bulletDmg: 40, bulletSpeed: 4500, value: 600,
    isHealer: true, healPulseInterval: 2, healPulseRadius: 300, healPulsePct: 0.12,
    shootRange: 500, shootRate: 1.0, bulletSpread: 0.05, burst: 1, bulletR: 7, bulletScale: 1.5, orbit: 0.45,
  },
  npc_Streuner_Recruit: {
    name: "-=[ Recruit Streuner ]=-",
    sprite: { path: "Npc/Streuner_Recruit/", frames: 32, firstNumber: 1, ext: ".png", w: 160, h: 160, angleOffset: Math.PI, flipX: false, flipY: false },
    playSprite: false,
    spriteSpeed: 0,
    bulletSprite: { src: "Munitions/x1.png", w: 78, h: 20, glow: true, invert: true },
    r: 18, hp: 600, shield: 800, speed: 300, bulletDmg: 40, bulletSpeed: 4500, value: 600,
    shootRange: 500, shootRate: 1.0, bulletSpread: 0.05, burst: 1, bulletR: 7, bulletScale: 1.5, orbit: 0.45,
  },
  npc_Baby_Streuner: {
    name: "* Baby Streuner *",
    sprite: { path: "Npc/Streuner/", frames: 32, firstNumber: 1, ext: ".png", w: 54.5, h: 48, angleOffset: Math.PI, flipX: false, flipY: false },
    playSprite: false,
    spriteSpeed: 0,
    bulletSprite: { src: "Munitions/x1.png", w: 78, h: 20, glow: true, invert: true },
    r: 18, hp: 400, shield: 200, speed: 120, bulletDmg: 10, bulletSpeed: 4500, value: 200,
    shootRange: 500, shootRate: 1.0, bulletSpread: 0.05, burst: 1, bulletR: 7, bulletScale: 1.5, orbit: 0.45,
  },
  npc_Boss_Streuner_Recruit: {
    name: "* Protecteur Streuner *",
    sprite: { path: "Npc/Boss_Streuner_Recruit/", frames: 32, firstNumber: 1, ext: ".png", w: 220, h: 220, angleOffset: Math.PI, flipX: false, flipY: false },
    playSprite: false,
    spriteSpeed: 20,
    bulletSprite: { src: "Munitions/x4.png", w: 46, h: 16, glow: true, invert: true },
    r: 18, hp: 25600, shield: 12800, speed: 280, bulletDmg: 320, bulletSpeed: 4500, value: 12800,
    shootRange: 700, shootRate: 1.0, bulletSpread: 0.05, burst: 1, bulletR: 7, bulletScale: 1.5, orbit: 0.45,
  },


  npc_Streuner_Creeper: {
  name: "* Creeper Streuner *",
  sprite: {
    path: "Npc/Streuner_Creeper/",
    frames: 32,
    firstNumber: 1,
    ext: ".png",
    w: 109,
    h: 96,
    angleOffset: Math.PI,
    flipX: false,
    flipY: false
  },
  playSprite: false,
  spriteSpeed: 0,

  // il ne tire pas
  shootRate: 0,

  // stats
  r: 18,
  hp: 1,
  shield: 0,
  speed: 2200,
  value: 0,

  // ✅ kamikaze
  ai: "kamikaze",          // ✅ nouveau flag
  explodeOnTouch: true,    // ✅ explose au contact
  explodeRadius: 220,      // ✅ rayon monde (collision distance)
  explodeDmg: 1000,       // ✅ dégâts à l'explosion
  touchDmg: 0,             // pas de dégâts "contact" standard, on gère via explosion

  // (optionnel) look des bullets si jamais tu le réactives plus tard
  bulletSprite: { src: "Munitions/x1.png", w: 78, h: 20, glow: true, invert: true },
  bulletDmg: 1,
  bulletSpeed: 4500,
  shootRange: 500,
  bulletSpread: 0.05,
  burst: 1,
  bulletR: 7,
  bulletScale: 1.5,
  orbit: 0.45,
  },


  npc_Protegit: {
    name: "-=[ Protegit ]=-",
    sprite: { path: "Npc/Protegit/", frames: 32, firstNumber: 1, ext: ".png", w: 75, h: 66, angleOffset: Math.PI, flipX: false, flipY: false },
    playSprite: false,
    spriteSpeed: 0,
    bulletSprite: { src: "Munitions/Special6.png", w: 64, h: 25, glow: true, invert: true },
    r: 18, hp: 50000, shield: 40000, speed: 1000, bulletDmg: 1500, bulletSpeed: 4500, value: 12800,
    shootRange: 620, shootRate: 1.0, bulletSpread: 0.05, burst: 1, bulletR: 7, bulletScale: 1.5, orbit: 0.45,
  },
  npc_Cubikon: {
  name: "-=[ Cubikon ]=-",
  sprite: {
    path: "Npc/Cubikon/",
    frames: 13,          // ✅ 13 frames
    firstNumber: 1,
    ext: ".png",
    w: 383,
    h: 384,
    angleOffset: 0,      // ✅ IMPORTANT (sinon frame idle ≠ frame1)
    flipX: false,
    flipY: false
  },
  playSprite: false,     // ✅ idle = PAS d’anim
  passiveNative: true,
  spriteSpeed: 20,
  bulletSprite: { src: "Munitions/x0.png", w: 0, h: 0, glow: true, invert: true },
    r: 18, hp: 1600000, shield: 1200000, speed: 0, bulletDmg: 0, bulletSpeed: 0, value: 1638400,
    shootRange: 0, shootRate: 0.0, bulletSpread: 0.05, burst: 1, bulletR: 7, bulletScale: 1.5, orbit: 0.45,
  },


  npc_Protegit_maudite: {
    name: "-=[ Chaos Protegit ]=-",
    sprite: { path: "Npc/Protegit/", frames: 32, firstNumber: 1, ext: ".png", w: 75, h: 66, angleOffset: Math.PI, flipX: false, flipY: false },
    playSprite: false,
    spriteSpeed: 0,
    bulletSprite: { src: "Munitions/Special6.png", w: 64, h: 25, glow: true, invert: true },
    r: 18, hp: 50000, shield: 40000, speed: 500, bulletDmg: 1500, bulletSpeed: 4500, value: 12800,
    shootRange: 620, shootRate: 1.0, bulletSpread: 0.05, burst: 1, bulletR: 7, bulletScale: 1.5, orbit: 0.45,
  },
  npc_Protegit_maudite2: {
    name: "..::{ Boss Chaos Protegit }::..",
    sprite: { path: "Npc/Protegit/", frames: 32, firstNumber: 1, ext: ".png", w: 75, h: 66, angleOffset: Math.PI, flipX: false, flipY: false },
    playSprite: false,
    spriteSpeed: 0,
    bulletSprite: { src: "Munitions/Special6.png", w: 64, h: 25, glow: true, invert: true },
    r: 18, hp: 200000, shield: 160000, speed: 500, bulletDmg: 6000, bulletSpeed: 4500, value: 25600,
    shootRange: 640, shootRate: 1.0, bulletSpread: 0.05, burst: 1, bulletR: 7, bulletScale: 1.5, orbit: 0.45,
  },
  npc_Protegit_maudite3: {
    name: "[ Uber Chaos Protegit ]",
    sprite: { path: "Npc/Protegit/", frames: 32, firstNumber: 1, ext: ".png", w: 75, h: 66, angleOffset: Math.PI, flipX: false, flipY: false },
    playSprite: false,
    spriteSpeed: 0,
    bulletSprite: { src: "Munitions/Special6.png", w: 64, h: 25, glow: true, invert: true },
    r: 18, hp: 400000, shield: 320000, speed: 500, bulletDmg: 12000, bulletSpeed: 4500, value: 51200,
    shootRange: 660, shootRate: 1.0, bulletSpread: 0.05, burst: 1, bulletR: 7, bulletScale: 1.5, orbit: 0.45,
  },
  npc_Cubikon_maudite: {
    name: "-=[ Chaos Cubikon ]=-",
    sprite: { path: "Npc/Cubikon/", frames: 1, firstNumber: 1, ext: ".png", w: 383, h: 384, angleOffset: Math.PI, flipX: false, flipY: false },
    playSprite: false,
    spriteSpeed: 20,
    bulletSprite: { src: "Munitions/x0.png", w: 0, h: 0, glow: true, invert: true },
    r: 18, hp: 3200000, shield: 2400000, speed: 0, bulletDmg: 0, bulletSpeed: 0, value: 3276800,
    shootRange: 0, shootRate: 0.0, bulletSpread: 0.05, burst: 1, bulletR: 7, bulletScale: 1.5, orbit: 0.45,
  },


  npc_Emperor_Sibelon: {
    name: "* Emperor Sibelon *",
    sprite: { path: "Npc/Emperor_Sibelon/", frames: 32, firstNumber: 1, ext: ".png", w: 375, h: 333, angleOffset: Math.PI, flipX: false, flipY: false },
    playSprite: false,
    passiveNative: true,
    spriteSpeed: 20,
    bulletSprite: { src: "Munitions/Special8.png", w: 55, h: 17, glow: true, invert: true },
    r: 18, hp: 6400000, shield: 6400000, speed: 100, bulletDmg: 35000, bulletSpeed: 4500, value: 8400000,
    shootRange: 700, shootRate: 1, bulletSpread: 0.05, burst: 1, bulletR: 7, bulletScale: 1.5, orbit: 0.45,
    
    onKill: {
      spawn: [
        { type: "npc_Lordakia", count: 4, radius: 260 }
    ]
  },
  },
  npc_Emperor_Lordakium: {
    name: "* Emperor Lordakium *",
    sprite: { path: "Npc/Emperor_Lordakium/", frames: 33, firstNumber: 1, ext: ".png", w: 338, h: 302, angleOffset: Math.PI, flipX: false, flipY: false },
    playSprite: true,
    passiveNative: true,
    spriteSpeed: 30,
    bulletSprite: { src: "Munitions/Lordakium.png", w: 97, h: 37, glow: true, invert: true },
    r: 18, hp: 9600000, shield: 6400000, speed: 100, bulletDmg: 45000, bulletSpeed: 4500, value: 2400000,
    shootRange: 700, shootRate: 1, bulletSpread: 0.05, burst: 1, bulletR: 7, bulletScale: 1.5, orbit: 0.45,
    
    onKill: {
      spawn: [
        { type: "npc_Lordakia", count: 15, radius: 260 }
    ]
  },
  },
  npc_Emperor_Kristallon: {
    name: "* Emperor Kristallon *",
    sprite: { path: "Npc/Emperor_Kristallon/", frames: 1, firstNumber: 1, ext: ".png", w: 300, h: 338, angleOffset: Math.PI, flipX: false, flipY: false },
    playSprite: true,
    passiveNative: true,
    spriteSpeed: 60,
    bulletSprite: { src: "Munitions/Kristallon.png", w: 97, h: 37, glow: true, invert: true },
    r: 18, hp: 14080000, shield: 11100000, speed: 100, bulletDmg: 640000, bulletSpeed: 4500, value: 180000000,
    shootRange: 700, shootRate: 0.25, bulletSpread: 0.05, burst: 1, bulletR: 7, bulletScale: 1.5, orbit: 0.45,
    
    onKill: {
      spawn: [
        { type: "npc_Kristallin", count: 5, radius: 260 }
    ]
  },
  },





  npc_Vagrant: {
    name: "-=[ Vagrant ]=-",
    sprite: { path: "Npc/Vagrant/", frames: 32, firstNumber: 1, ext: ".png", w: 64, h: 49, angleOffset: Math.PI, flipX: false, flipY: false },
    playSprite: false,
    spriteSpeed: 0,
    bulletSprite: { src: "Munitions/x1.png", w: 46, h: 16, glow: true, invert: true },
    r: 18, hp: 45000, shield: 45000, speed: 650, bulletDmg: 2500, bulletSpeed: 4500, value: 15000,
    shootRange: 500, shootRate: 1.0, bulletSpread: 0.05, burst: 1, bulletR: 7, bulletScale: 1.5, orbit: 0.45,
  },
  npc_Marauder: {
    name: "-=[ Marauder ]=-",
    sprite: { path: "Npc/Outcast/", frames: 32, firstNumber: 1, ext: ".png", w: 114, h: 87, angleOffset: Math.PI, flipX: false, flipY: false },
    playSprite: false,
    spriteSpeed: 0,
    bulletSprite: { src: "Munitions/x1.png", w: 46, h: 16, glow: true, invert: true },
    r: 18, hp: 45000, shield: 60000, speed: 650, bulletDmg: 4500, bulletSpeed: 4500, value: 45000,
    shootRange: 500, shootRate: 1.0, bulletSpread: 0.05, burst: 1, bulletR: 7, bulletScale: 1.5, orbit: 0.45,
  },
  npc_Outcast: {
    name: "-=[ Outcast ]=-",
    sprite: { path: "Npc/Outcast/", frames: 32, firstNumber: 1, ext: ".png", w: 114, h: 87, angleOffset: Math.PI, flipX: false, flipY: false },
    playSprite: false,
    spriteSpeed: 0,
    bulletSprite: { src: "Munitions/x1.png", w: 46, h: 16, glow: true, invert: true },
    r: 18, hp: 45000, shield: 60000, speed: 650, bulletDmg: 4500, bulletSpeed: 4500, value: 45000,
    shootRange: 500, shootRate: 1.0, bulletSpread: 0.05, burst: 1, bulletR: 7, bulletScale: 1.5, orbit: 0.45,
  },
  npc_Corsair: {
    name: "-=[ Corsair ]=-",
    sprite: { path: "Npc/Ravager/", frames: 32, firstNumber: 1, ext: ".png", w: 159, h: 119, angleOffset: Math.PI, flipX: false, flipY: false },
    playSprite: false,
    spriteSpeed: 0,
    bulletSprite: { src: "Munitions/x2.png", w: 46, h: 16, glow: true, invert: true },
    r: 18, hp: 45000, shield: 60000, speed: 650, bulletDmg: 4500, bulletSpeed: 4500, value: 80000,
    shootRange: 500, shootRate: 1.0, bulletSpread: 0.05, burst: 1, bulletR: 7, bulletScale: 1.5, orbit: 0.45,
  },
  npc_Convict: {
    name: "-=[ Convict ]=-",
    sprite: { path: "Npc/Outcast/", frames: 32, firstNumber: 1, ext: ".png", w: 114, h: 87, angleOffset: Math.PI, flipX: false, flipY: false },
    playSprite: false,
    spriteSpeed: 0,
    bulletSprite: { src: "Munitions/x3.png", w: 46, h: 16, glow: true, invert: true },
    r: 18, hp: 450000, shield: 450000, speed: 650, bulletDmg: 13500, bulletSpeed: 4500, value: 245000,
    shootRange: 500, shootRate: 1.0, bulletSpread: 0.05, burst: 1, bulletR: 7, bulletScale: 1.5, orbit: 0.45,
  },
  npc_Hooligan: {
    name: "-=[ Hooligan ]=-",
    sprite: { path: "Npc/Ravager/", frames: 32, firstNumber: 1, ext: ".png", w: 159, h: 119, angleOffset: Math.PI, flipX: false, flipY: false },
    playSprite: false,
    spriteSpeed: 0,
    bulletSprite: { src: "Munitions/x2.png", w: 46, h: 16, glow: true, invert: true },
    r: 18, hp: 45000, shield: 60000, speed: 650, bulletDmg: 5000, bulletSpeed: 4500, value: 125000,
    shootRange: 500, shootRate: 1.0, bulletSpread: 0.05, burst: 1, bulletR: 7, bulletScale: 1.5, orbit: 0.45,
  },
  npc_Ravager: {
    name: "-=[ Ravager ]=-",
    sprite: { path: "Npc/Ravager/", frames: 32, firstNumber: 1, ext: ".png", w: 159, h: 119, angleOffset: Math.PI, flipX: false, flipY: false },
    playSprite: false,
    spriteSpeed: 0,
    bulletSprite: { src: "Munitions/x2.png", w: 46, h: 16, glow: true, invert: true },
    r: 18, hp: 450000, shield: 450000, speed: 650, bulletDmg: 1100, bulletSpeed: 4500, value: 160000,
    shootRange: 500, shootRate: 1.0, bulletSpread: 0.05, burst: 1, bulletR: 7, bulletScale: 1.5, orbit: 0.45,
  },
  npc_Century_Falcon: {
    name: "-=[ Century Falcon ]=-",
    sprite: { path: "Npc/Century_Falcon/", frames: 32, firstNumber: 1, ext: ".png", w: 333, h: 237, angleOffset: Math.PI, flipX: false, flipY: false },
    playSprite: false,
    spriteSpeed: 0,
    bulletSprite: { src: "Munitions/x4.png", w: 46, h: 16, glow: true, invert: true },
    r: 18, hp: 4500000, shield: 4500000, speed: 200, bulletDmg: 24500, bulletSpeed: 4500, value: 1500000,
    shootRange: 700, shootRate: 1.0, bulletSpread: 0.05, burst: 1, bulletR: 7, bulletScale: 1.5, orbit: 0.45,
  },





  npc_Streuner_alpha: {
    name: "[α] -=[ Streuner ]=-",
    sprite: { path: "Npc/Streuner/", frames: 32, firstNumber: 1, ext: ".png", w: 109, h: 96, angleOffset: Math.PI, flipX: false, flipY: false },
    playSprite: false,
    spriteSpeed: 0,
    bulletSprite: { src: "Munitions/x1.png", w: 46, h: 16, glow: true, invert: true },
    r: 18, hp: 800, shield: 400, speed: 800, bulletDmg: 20, bulletSpeed: 4500, value: 400,
    shootRange: 500, shootRate: 1.0, bulletSpread: 0.05, burst: 1, bulletR: 7, bulletScale: 1.5, orbit: 0.45,
  },
  npc_Lordakia_alpha: {
    name: "[α] -=[ Lordakia ]=-",
    sprite: { path: "Npc/Lordakia/", frames: 32, firstNumber: 1, ext: ".png", w: 71, h: 64, angleOffset: Math.PI, flipX: false, flipY: false },
    playSprite: true,
    spriteSpeed: 20,
    bulletSprite: { src: "Munitions/Special8.png", w: 55, h: 17, glow: true, invert: true },
    r: 18, hp: 4500, shield: 4500, speed: 800, bulletDmg: 80, bulletSpeed: 4500, value: 800,
    shootRange: 500, shootRate: 1.0, bulletSpread: 0.05, burst: 1, bulletR: 7, bulletScale: 1.5, orbit: 0.45,
  },
  npc_Mordon_alpha: {
    name: "[α] -=[ Mordon ]=-",
    sprite: { path: "Npc/Mordon/", frames: 16, firstNumber: 1, ext: ".png", w: 150, h: 120, angleOffset: Math.PI, flipX: false, flipY: false },
    playSprite: true,
    spriteSpeed: 20,
    bulletSprite: { src: "Munitions/Special8.png", w: 55, h: 17, glow: true, invert: true },
    r: 18, hp: 45000, shield: 4500, speed: 750, bulletDmg: 390, bulletSpeed: 4500, value: 6400,
    shootRange: 500, shootRate: 1.0, bulletSpread: 0.05, burst: 1, bulletR: 7, bulletScale: 1.5, orbit: 0.45,
  },
  npc_Saimon_alpha: {
    name: "[α] -=[ Saimon ]=-",
    sprite: { path: "Npc/Saimon/", frames: 32, firstNumber: 1, ext: ".png", w: 90, h: 80, angleOffset: Math.PI, flipX: false, flipY: false },
    playSprite: false,
    spriteSpeed: 0,
    bulletSprite: { src: "Munitions/Special8.png", w: 55, h: 17, glow: true, invert: true },
    r: 18, hp: 6000, shield: 6000, speed: 900, bulletDmg: 200, bulletSpeed: 4500, value: 1600,
    shootRange: 500, shootRate: 1.0, bulletSpread: 0.05, burst: 1, bulletR: 7, bulletScale: 1.5, orbit: 0.45,
  },
  npc_Devolarium_alpha: {
    name: "[α] -=[ Devolarium ]=-",
    sprite: { path: "Npc/Devolarium/", frames: 32, firstNumber: 1, ext: ".png", w: 228, h: 228, angleOffset: Math.PI, flipX: false, flipY: false },
    playSprite: false,
    spriteSpeed: 0,
    bulletSprite: { src: "Munitions/Special8.png", w: 55, h: 17, glow: true, invert: true },
    r: 18, hp: 45000, shield: 45000, speed: 750, bulletDmg: 1200, bulletSpeed: 4500, value: 51200,
    shootRange: 480, shootRate: 1.0, bulletSpread: 0.05, burst: 1, bulletR: 7, bulletScale: 1.5, orbit: 0.45,
  },
  npc_Kristallin_alpha: {
    name: "[α] -=[ Kristallin ]=-",
    sprite: { path: "Npc/Kristallin/", frames: 83, firstNumber: 1, ext: ".png", w: 113, h: 113, angleOffset: Math.PI, flipX: false, flipY: false },
    playSprite: true,
    spriteSpeed: 20,
    bulletSprite: { src: "Munitions/Kristallin.png", w: 46, h: 16, glow: true , invert: true},
    r: 18, hp: 50000, shield: 45000, speed: 900, value: 12800,
    bulletDmg: 1200, bulletSpeed: 4500, shootRange: 500,
    shootRate: 1.0, bulletSpread: 0.05, burst: 1, bulletR: 7, bulletScale: 1.5, orbit: 0.45,
  },
  npc_Sibelon_alpha: {
    name: "[α] -=[ Sibelon ]=-",
    sprite: { path: "Npc/Sibelon/", frames: 32, firstNumber: 1, ext: ".png", w: 338, h: 300, angleOffset: Math.PI, flipX: false, flipY: false },
    playSprite: false,
    spriteSpeed: 0,
    bulletSprite: { src: "Munitions/Special8.png", w: 55, h: 17, glow: true, invert: true },
    r: 18, hp: 450000, shield: 450000, speed: 750, bulletDmg: 2650, bulletSpeed: 4500, value: 102400,
    shootRange: 480, shootRate: 1.0, bulletSpread: 0.05, burst: 1, bulletR: 7, bulletScale: 1.5, orbit: 0.45,
  },
  npc_Sibelonit_alpha: {
    name: "[α] -=[ Sibelonit ]=-",
    sprite: { path: "Npc/Sibelonit/", frames: 32, firstNumber: 1, ext: ".png", w: 90, h: 80, angleOffset: Math.PI, flipX: false, flipY: false },
    playSprite: true,
    spriteSpeed: 20,
    bulletSprite: { src: "Munitions/Special8.png", w: 55, h: 17, glow: true, invert: true },
    r: 18, hp: 45000, shield: 45000, speed: 900, bulletDmg: 3200, bulletSpeed: 4500, value: 3200,
    shootRange: 500, shootRate: 1.0, bulletSpread: 0.05, burst: 1, bulletR: 7, bulletScale: 1.5, orbit: 0.45,
  },
  npc_Kristallon_alpha: {
    name: "[α] -=[ Kristallon ]=-",
    sprite: { path: "Npc/Kristallon/", frames: 83, firstNumber: 1, ext: ".png", w: 188, h: 188, angleOffset: Math.PI, flipX: false, flipY: false },
    playSprite: true,
    spriteSpeed: 20,
    bulletSprite: { src: "Munitions/Kristallon.png", w: 46, h: 16, glow: true, invert: true },
    r: 18, hp: 450000, shield: 450000, speed: 750, bulletDmg: 4450, bulletSpeed: 4500, value: 409600,
    shootRange: 500, shootRate: 1.0, bulletSpread: 0.05, burst: 1, bulletR: 7, bulletScale: 1.5, orbit: 0.45,
  },
  npc_Protegit_alpha: {
    name: "[α] -=[ Protegit ]=-",
    sprite: { path: "Npc/Protegit/", frames: 32, firstNumber: 1, ext: ".png", w: 75, h: 66, angleOffset: Math.PI, flipX: false, flipY: false },
    playSprite: false,
    spriteSpeed: 0,
    bulletSprite: { src: "Munitions/Special6.png", w: 46, h: 16, glow: true, invert: true },
    r: 18, hp: 50000, shield: 45000, speed: 1100, bulletDmg: 1500, bulletSpeed: 4500, value: 12800,
    shootRange: 620, shootRate: 1.0, bulletSpread: 0.05, burst: 1, bulletR: 7, bulletScale: 1.5, orbit: 0.45,
  },
  npc_Cubikon_alpha: {
    name: "[α] -=[ Cubikon ]=-",
    sprite: { path: "Npc/Cubikon/", frames: 1, firstNumber: 1, ext: ".png", w: 383, h: 384, angleOffset: Math.PI, flipX: false, flipY: false },
    playSprite: false,
    spriteSpeed: 20,
    bulletSprite: { src: "Munitions/x0.png", w: 46, h: 16, glow: true, invert: true },
    r: 18, hp: 1600000, shield: 1450000, speed: 0, value: 1638400,
    bulletDmg: 0, bulletSpeed: 1,
    shootRange: -100, shootRate: 0, bulletSpread: 0.05, burst: 1, bulletR: 7, bulletScale: 1.5, orbit: 0.45,
  },





  npc_Streuner_beta: {
    name: "[β] -=[ Streuner ]=-",
    sprite: { path: "Npc/Streuner/", frames: 32, firstNumber: 1, ext: ".png", w: 109, h: 96, angleOffset: Math.PI, flipX: false, flipY: false },
    playSprite: false,
    spriteSpeed: 0,
    bulletSprite: { src: "Munitions/x1.png", w: 46, h: 16, glow: true, invert: true },
    r: 18, hp: 1600, shield: 800, speed: 800, bulletDmg: 40, bulletSpeed: 4500, value: 800,
    shootRange: 500, shootRate: 1.0, bulletSpread: 0.05, burst: 1, bulletR: 7, bulletScale: 1.5, orbit: 0.45,
  },
  npc_Lordakia_beta: {
    name: "[β] -=[ Lordakia ]=-",
    sprite: { path: "Npc/Lordakia/", frames: 32, firstNumber: 1, ext: ".png", w: 71, h: 64, angleOffset: Math.PI, flipX: false, flipY: false },
    playSprite: true,
    spriteSpeed: 20,
    bulletSprite: { src: "Munitions/Special8.png", w: 55, h: 17, glow: true, invert: true },
    r: 18, hp: 4500, shield: 4500, speed: 800, bulletDmg: 160, bulletSpeed: 4500, value: 1600,
    shootRange: 500, shootRate: 1.0, bulletSpread: 0.05, burst: 1, bulletR: 7, bulletScale: 1.5, orbit: 0.45,
  },
  npc_Mordon_beta: {
    name: "[β] -=[ Mordon ]=-",
    sprite: { path: "Npc/Mordon/", frames: 16, firstNumber: 1, ext: ".png", w: 150, h: 120, angleOffset: Math.PI, flipX: false, flipY: false },
    playSprite: true,
    spriteSpeed: 20,
    bulletSprite: { src: "Munitions/Special8.png", w: 55, h: 17, glow: true, invert: true },
    r: 18, hp: 45000, shield: 45000, speed: 750, bulletDmg: 780, bulletSpeed: 4500, value: 12800,
    shootRange: 500, shootRate: 1.0, bulletSpread: 0.05, burst: 1, bulletR: 7, bulletScale: 1.5, orbit: 0.45,
  },
  npc_Saimon_beta: {
    name: "[β] -=[ Saimon ]=-",
    sprite: { path: "Npc/Saimon/", frames: 32, firstNumber: 1, ext: ".png", w: 90, h: 80, angleOffset: Math.PI, flipX: false, flipY: false },
    playSprite: false,
    spriteSpeed: 0,
    bulletSprite: { src: "Munitions/Special8.png", w: 55, h: 17, glow: true, invert: true },
    r: 18, hp: 14500, shield: 14500, speed: 900, bulletDmg: 400, bulletSpeed: 4500, value: 3200,
    shootRange: 500, shootRate: 1.0, bulletSpread: 0.05, burst: 1, bulletR: 7, bulletScale: 1.5, orbit: 0.45,
  },
  npc_Devolarium_beta: {
    name: "[β] -=[ Devolarium ]=-",
    sprite: { path: "Npc/Devolarium/", frames: 32, firstNumber: 1, ext: ".png", w: 228, h: 228, angleOffset: Math.PI, flipX: false, flipY: false },
    playSprite: false,
    spriteSpeed: 0,
    bulletSprite: { src: "Munitions/Special8.png", w: 55, h: 17, glow: true, invert: true },
    r: 18, hp: 450000, shield: 450000, speed: 750, bulletDmg: 2400, bulletSpeed: 4500, value: 102400,
    shootRange: 480, shootRate: 1.0, bulletSpread: 0.05, burst: 1, bulletR: 7, bulletScale: 1.5, orbit: 0.45,
  },
  npc_Kristallin_beta: {
    name: "[β] -=[ Kristallin ]=-",
    sprite: { path: "Npc/Kristallin/", frames: 83, firstNumber: 1, ext: ".png", w: 113, h: 113, angleOffset: Math.PI, flipX: false, flipY: false },
    playSprite: true,
    spriteSpeed: 20,
    bulletSprite: { src: "Munitions/Kristallin.png", w: 46, h: 16, glow: true , invert: true},
    r: 18, hp: 45000, shield: 80000, speed: 900, value: 25600, bulletDmg: 2400, bulletSpeed: 4500, 
    shootRange: 500, shootRate: 1.0, bulletSpread: 0.05, burst: 1, bulletR: 7, bulletScale: 1.5, orbit: 0.45,
  },
  npc_Sibelon_beta: {
    name: "[β] -=[ Sibelon ]=-",
    sprite: { path: "Npc/Sibelon/", frames: 32, firstNumber: 1, ext: ".png", w: 338, h: 300, angleOffset: Math.PI, flipX: false, flipY: false },
    playSprite: false,
    spriteSpeed: 0,
    bulletSprite: { src: "Munitions/Special8.png", w: 55, h: 17, glow: true, invert: true },
    r: 18, hp: 450000, shield: 450000, speed: 750, bulletDmg: 5300, bulletSpeed: 4500, value: 204800,
    shootRange: 480, shootRate: 1.0, bulletSpread: 0.05, burst: 1, bulletR: 7, bulletScale: 1.5, orbit: 0.45,
  },
  npc_Sibelonit_beta: {
    name: "[β] -=[ Sibelonit ]=-",
    sprite: { path: "Npc/Sibelonit/", frames: 32, firstNumber: 1, ext: ".png", w: 90, h: 80, angleOffset: Math.PI, flipX: false, flipY: false },
    playSprite: true,
    spriteSpeed: 20,
    bulletSprite: { src: "Munitions/Special8.png", w: 55, h: 17, glow: true, invert: true },
    r: 18, hp: 80000, shield: 80000, speed: 900, bulletDmg: 6400, bulletSpeed: 4500, value: 6400,
    shootRange: 500, shootRate: 1.0, bulletSpread: 0.05, burst: 1, bulletR: 7, bulletScale: 1.5, orbit: 0.45,
  },
  npc_Kristallon_beta: {
    name: "[β] -=[ Kristallon ]=-",
    sprite: { path: "Npc/Kristallon/", frames: 83, firstNumber: 1, ext: ".png", w: 188, h: 188, angleOffset: Math.PI, flipX: false, flipY: false },
    playSprite: true,
    spriteSpeed: 20,
    bulletSprite: { src: "Munitions/Kristallon.png", w: 46, h: 16, glow: true, invert: true },
    r: 18, hp: 800000, shield: 600000, speed: 750, bulletDmg: 8900, bulletSpeed: 4500, value:  819200,
    shootRange: 500, shootRate: 1.0, bulletSpread: 0.05, burst: 1, bulletR: 7, bulletScale: 1.5, orbit: 0.45,
  },
  npc_Protegit_beta: {
    name: "[β] -=[ Protegit ]=-",
    sprite: { path: "Npc/Protegit/", frames: 32, firstNumber: 1, ext: ".png", w: 75, h: 66, angleOffset: Math.PI, flipX: false, flipY: false },
    playSprite: false,
    spriteSpeed: 0,
    bulletSprite: { src: "Munitions/Special6.png", w: 46, h: 16, glow: true, invert: true },
    r: 18, hp: 45000, shield: 80000, speed: 1100, bulletDmg: 4500, bulletSpeed: 4500, value: 25600,
    shootRange: 620, shootRate: 1.0, bulletSpread: 0.05, burst: 1, bulletR: 7, bulletScale: 1.5, orbit: 0.45,
  },
  npc_Cubikon_beta: {
    name: "[β] -=[ Cubikon ]=-",
    sprite: { path: "Npc/Cubikon/", frames: 1, firstNumber: 1, ext: ".png", w: 383, h: 384, angleOffset: Math.PI, flipX: false, flipY: false },
    playSprite: false,
    spriteSpeed: 20,
    bulletSprite: { src: "Munitions/x0.png", w: 46, h: 16, glow: true, invert: true },
    r: 18, hp: 3450000, shield: 2450000, speed: 0, value: 3276800,
    bulletDmg: 0, bulletSpeed: 1,
    shootRange: -100, shootRate: 0, bulletSpread: 0.05, burst: 1, bulletR: 7, bulletScale: 1.5, orbit: 0.45,
  },





  npc_Streuner_gamma: {
    name: "[γ] -=[ Streuner ]=-",
    sprite: { path: "Npc/Streuner/", frames: 32, firstNumber: 1, ext: ".png", w: 109, h: 96, angleOffset: Math.PI, flipX: false, flipY: false },
    playSprite: false,
    spriteSpeed: 0,
    bulletSprite: { src: "Munitions/x1.png", w: 46, h: 16, glow: true, invert: true },
    r: 18, hp: 3200, shield: 1600, speed: 800, bulletDmg: 80, bulletSpeed: 4500, value: 1600,
    shootRange: 500, shootRate: 1.0, bulletSpread: 0.05, burst: 1, bulletR: 7, bulletScale: 1.5, orbit: 0.45,
  },
  npc_Lordakia_gamma: {
    name: "[γ] -=[ Lordakia ]=-",
    sprite: { path: "Npc/Lordakia/", frames: 32, firstNumber: 1, ext: ".png", w: 71, h: 64, angleOffset: Math.PI, flipX: false, flipY: false },
    playSprite: true,
    spriteSpeed: 20,
    bulletSprite: { src: "Munitions/Special8.png", w: 55, h: 17, glow: true, invert: true },
    r: 18, hp: 8000, shield: 8000, speed: 800, bulletDmg: 320, bulletSpeed: 4500, value: 3200,
    shootRange: 500, shootRate: 1.0, bulletSpread: 0.05, burst: 1, bulletR: 7, bulletScale: 1.5, orbit: 0.45,
  },
  npc_Mordon_gamma: {
    name: "[γ] -=[ Mordon ]=-",
    sprite: { path: "Npc/Mordon/", frames: 16, firstNumber: 1, ext: ".png", w: 150, h: 120, angleOffset: Math.PI, flipX: false, flipY: false },
    playSprite: true,
    spriteSpeed: 20,
    bulletSprite: { src: "Munitions/Special8.png", w: 55, h: 17, glow: true, invert: true },
    r: 18, hp: 80000, shield: 45000, speed: 750, bulletDmg: 1560, bulletSpeed: 4500, value: 25600,
    shootRange: 500, shootRate: 1.0, bulletSpread: 0.05, burst: 1, bulletR: 7, bulletScale: 1.5, orbit: 0.45,
  },
  npc_Saimon_gamma: {
    name: "[γ] -=[ Saimon ]=-",
    sprite: { path: "Npc/Saimon/", frames: 32, firstNumber: 1, ext: ".png", w: 90, h: 80, angleOffset: Math.PI, flipX: false, flipY: false },
    playSprite: false,
    spriteSpeed: 0,
    bulletSprite: { src: "Munitions/Special8.png", w: 55, h: 17, glow: true, invert: true },
    r: 18, hp: 24500, shield: 24500, speed: 900, bulletDmg: 800, bulletSpeed: 4500, value: 6400,
    shootRange: 500, shootRate: 1.0, bulletSpread: 0.05, burst: 1, bulletR: 7, bulletScale: 1.5, orbit: 0.45,
  },
  npc_Devolarium_gamma: {
    name: "[γ] -=[ Devolarium ]=-",
    sprite: { path: "Npc/Devolarium/", frames: 32, firstNumber: 1, ext: ".png", w: 228, h: 228, angleOffset: Math.PI, flipX: false, flipY: false },
    playSprite: false,
    spriteSpeed: 0,
    bulletSprite: { src: "Munitions/Special8.png", w: 55, h: 17, glow: true, invert: true },
    r: 18, hp: 450000, shield: 450000, speed: 750, bulletDmg: 4800, bulletSpeed: 4500, value: 204800,
    shootRange: 480, shootRate: 1.0, bulletSpread: 0.05, burst: 1, bulletR: 7, bulletScale: 1.5, orbit: 0.45,
  },
  npc_Kristallin_gamma: {
    name: "[γ] -=[ Kristallin ]=-",
    sprite: { path: "Npc/Kristallin/", frames: 83, firstNumber: 1, ext: ".png", w: 113, h: 113, angleOffset: Math.PI, flipX: false, flipY: false },
    playSprite: true,
    spriteSpeed: 20,
    bulletSprite: { src: "Munitions/Kristallin.png", w: 46, h: 16, glow: true , invert: true},
    r: 18, hp: 450000, shield: 160000, speed: 900, value: 51200, bulletDmg: 4800, bulletSpeed: 4500, 
    shootRange: 500, shootRate: 1.0, bulletSpread: 0.05, burst: 1, bulletR: 7, bulletScale: 1.5, orbit: 0.45,
  },
  npc_Sibelon_gamma: {
    name: "[γ] -=[ Sibelon ]=-",
    sprite: { path: "Npc/Sibelon/", frames: 32, firstNumber: 1, ext: ".png", w: 338, h: 300, angleOffset: Math.PI, flipX: false, flipY: false },
    playSprite: false,
    spriteSpeed: 0,
    bulletSprite: { src: "Munitions/Special8.png", w: 55, h: 17, glow: true, invert: true },
    r: 18, hp: 800000, shield: 800000, speed: 750, bulletDmg: 10600, bulletSpeed: 4500, value: 409600,
    shootRange: 480, shootRate: 1.0, bulletSpread: 0.05, burst: 1, bulletR: 7, bulletScale: 1.5, orbit: 0.45,
  },
  npc_Sibelonit_gamma: {
    name: "[γ] -=[ Sibelonit ]=-",
    sprite: { path: "Npc/Sibelonit/", frames: 32, firstNumber: 1, ext: ".png", w: 90, h: 80, angleOffset: Math.PI, flipX: false, flipY: false },
    playSprite: true,
    spriteSpeed: 20,
    bulletSprite: { src: "Munitions/Special8.png", w: 55, h: 17, glow: true, invert: true },
    r: 18, hp: 160000, shield: 160000, speed: 900, bulletDmg: 12800, bulletSpeed: 4500, value: 12800,
    shootRange: 500, shootRate: 1.0, bulletSpread: 0.05, burst: 1, bulletR: 7, bulletScale: 1.5, orbit: 0.45,
  },
  npc_Kristallon_gamma: {
    name: "[γ] -=[ Kristallon ]=-",
    sprite: { path: "Npc/Kristallon/", frames: 83, firstNumber: 1, ext: ".png", w: 188, h: 188, angleOffset: Math.PI, flipX: false, flipY: false },
    playSprite: true,
    spriteSpeed: 20,
    bulletSprite: { src: "Munitions/Kristallon.png", w: 46, h: 16, glow: true, invert: true },
    r: 18, hp: 1600000, shield: 1450000, speed: 750, bulletDmg: 17800, bulletSpeed: 4500, value:  1638400,
    shootRange: 500, shootRate: 1.0, bulletSpread: 0.05, burst: 1, bulletR: 7, bulletScale: 1.5, orbit: 0.45,
  },
  npc_Protegit_gamma: {
    name: "[γ] -=[ Protegit ]=-",
    sprite: { path: "Npc/Protegit/", frames: 32, firstNumber: 1, ext: ".png", w: 75, h: 66, angleOffset: Math.PI, flipX: false, flipY: false },
    playSprite: false,
    spriteSpeed: 0,
    bulletSprite: { src: "Munitions/Special6.png", w: 46, h: 16, glow: true, invert: true },
    r: 18, hp: 450000, shield: 160000, speed: 1100, bulletDmg: 6000, bulletSpeed: 4500, value: 51200,
    shootRange: 620, shootRate: 1.0, bulletSpread: 0.05, burst: 1, bulletR: 7, bulletScale: 1.5, orbit: 0.45,
  },
  npc_Cubikon_gamma: {
    name: "[γ] -=[ Cubikon ]=-",
    sprite: { path: "Npc/Cubikon/", frames: 1, firstNumber: 1, ext: ".png", w: 383, h: 384, angleOffset: Math.PI, flipX: false, flipY: false },
    playSprite: false,
    spriteSpeed: 20,
    bulletSprite: { src: "Munitions/x0.png", w: 46, h: 16, glow: true, invert: true },
    r: 18, hp: 6450000, shield: 4800000, speed: 0, value: 6553600,
    bulletDmg: 0, bulletSpeed: 1,
    shootRange: -100, shootRate: 0, bulletSpread: 0.05, burst: 1, bulletR: 7, bulletScale: 1.5, orbit: 0.45,
  },





  npc_Cote_Lo : {
    name: "-=[ Cote Lo ]=-",
    sprite: { path: "Npc/Cote_Lo/", frames: 1, firstNumber: 1, ext: ".png", w: 120, h: 96, angleOffset: Math.PI, flipX: false, flipY: false },
    playSprite: false,
    spriteSpeed: 20,
    bulletSprite: { src: "Munitions/Phoenix.png", w: 46, h: 16, glow: true, invert: true },
    r: 18, hp: 6450000, shield: 4800000, speed: 0, value: 6553600,
    bulletDmg: 0, bulletSpeed: 1,
    shootRange: 720, shootRate: 0, bulletSpread: 0.05, burst: 1, bulletR: 7, bulletScale: 1.5, orbit: 0.45,
  },
  npc_Aura_Dun_Jig: {
    name: "-=[ Aura Dun Jig ]=-",
    sprite: { path: "Npc/Aura_Dun_Jig/", frames: 1, firstNumber: 1, ext: ".png", w: 240, h: 192, angleOffset: Math.PI, flipX: false, flipY: false },
    playSprite: false,
    spriteSpeed: 20,
    bulletSprite: { src: "Munitions/Phoenix.png", w: 46, h: 16, glow: true, invert: true },
    r: 18, hp: 6450000, shield: 4800000, speed: 0, value: 6553600,
    bulletDmg: 0, bulletSpeed: 1,
    shootRange: -100, shootRate: 0, bulletSpread: 0.05, burst: 1, bulletR: 7, bulletScale: 1.5, orbit: 0.45,
  },





  npc_Demaner_Freighter : {
    name: "[ψ] Demaner Freighter",
    sprite: { path: "Npc/Demaner_Freighter/", frames: 32, firstNumber: 1, ext: ".png", w: 500, h: 444, angleOffset: Math.PI, flipX: false, flipY: false },
    playSprite: false,
    spriteSpeed: 20,
    bulletSprite: { src: "Munitions/special9.png", w: 46, h: 16, glow: true, invert: true },
    r: 18, hp: 4500000, shield: 0, speed: 140, value: 0,
    bulletDmg: 45000000, bulletSpeed: 4500,
    shootRange: 400, shootRate: 1, bulletSpread: 0.05, burst: 1, bulletR: 7, bulletScale: 1.5, orbit: 0.45,
  },
  npc_Devolarium_Corrupted : {
    name: "[ψ] Corrupted Devolarium",
    sprite: { path: "Npc/Devolarium_corrupted/", frames: 32, firstNumber: 1, ext: ".png", w: 304, h: 304, angleOffset: Math.PI, flipX: false, flipY: false },
    playSprite: false,
    spriteSpeed: 20,
    bulletSprite: { src: "Munitions/special9.png", w: 46, h: 16, glow: true, invert: true },
    r: 18, hp: 450000, shield: 450000, speed: 800, value: 0,
    bulletDmg: 15000, bulletSpeed: 4500,
    shootRange: 600, shootRate: 1.0, bulletSpread: 0.05, burst: 1, bulletR: 7, bulletScale: 1.5, orbit: 0.45,
  },
  npc_Devourer_Corrupted : {
    name: "[ψ] Corrupted Devourer",
    sprite: { path: "Npc/Devourer_corrupted/", frames: 16, firstNumber: 1, ext: ".png", w: 910, h: 910, angleOffset: Math.PI, flipX: false, flipY: false },
    playSprite: true,
    spriteSpeed: 40,
    bulletSprite: { src: "Munitions/special9.png", w: 46, h: 16, glow: true, invert: true },
    r: 18, hp: 4500000, shield: 450000, speed: 370, value: 0,
    bulletDmg: 95000, bulletSpeed: 4500,
    shootRange: 600, shootRate: 1, bulletSpread: 0.05, burst: 1, bulletR: 7, bulletScale: 1.5, orbit: 0.45,
  },
  npc_Lordakium_Corrupted : {
    name: "[ψ] Corrupted Lordakium",
    sprite: { path: "Npc/Lordakium_corrupted/", frames: 32, firstNumber: 1, ext: ".png", w: 325, h: 291, angleOffset: Math.PI, flipX: false, flipY: false },
    playSprite: true,
    spriteSpeed: 20,
    bulletSprite: { src: "Munitions/special9.png", w: 46, h: 16, glow: true, invert: true },
    r: 18, hp: 1450000, shield: 1450000, speed: 720, value: 0,
    bulletDmg: 45000, bulletSpeed: 4500,
    shootRange: 600, shootRate: 1, bulletSpread: 0.05, burst: 1, bulletR: 7, bulletScale: 1.5, orbit: 0.45,
  },
  npc_Saimon_Corrupted : {
    name: "[ψ] Corrupted Saimon",
    sprite: { path: "Npc/Saimon_corrupted/", frames: 32, firstNumber: 1, ext: ".png", w: 160, h: 143, angleOffset: Math.PI, flipX: false, flipY: false },
    playSprite: false,
    spriteSpeed: 20,
    bulletSprite: { src: "Munitions/special9.png", w: 46, h: 16, glow: true, invert: true },
    r: 18, hp: 75000, shield: 75000, speed: 920, value: 0,
    bulletDmg: 12500, bulletSpeed: 4500,
    shootRange: 600, shootRate: 1, bulletSpread: 0.05, burst: 1, bulletR: 7, bulletScale: 1.5, orbit: 0.45,
  },
  npc_SaNeJiEwZ : {
    name: "[ψ] SaNeJiEwZ",
    sprite: { path: "Npc/SaNeJiEwZ/", frames: 32, firstNumber: 1, ext: ".png", w: 160, h: 143, angleOffset: Math.PI, flipX: false, flipY: false },
    playSprite: false,
    spriteSpeed: 20,
    bulletSprite: { src: "Munitions/special9.png", w: 46, h: 16, glow: true, invert: true },
    r: 18, hp: 50000, shield: 50000, speed: 1100, value: 0,
    bulletDmg: 4500, bulletSpeed: 4500,
    shootRange: 550, shootRate: 1, bulletSpread: 0.05, burst: 1, bulletR: 7, bulletScale: 1.5, orbit: 0.45,
  },




  npc_Vinespire : {
    name: "-=[ Vinespire ]=-",
    sprite: { path: "Npc/Vinespire/", frames: 32, firstNumber: 1, ext: ".png", w: 350, h: 300, angleOffset: Math.PI, flipX: false, flipY: false },
    playSprite: false,
    spriteSpeed: 20,
    bulletSprite: { src: "Munitions/Scatter_green.png", w: 86, h: 22, glow: true, invert: true },
    r: 18, hp: 3750000, shield: 3750000, speed: 350, value: 3750000,
    bulletDmg: 15000, bulletSpeed: 4500,
    shootRange: 650, shootRate: 1, bulletSpread: 0.05, burst: 1, bulletR: 7, bulletScale: 1.5, orbit: 0.45,
  },
  npc_Chronospire : {
    name: "-=[ Chronospire ]=-",
    sprite: { path: "Npc/Chronospire/", frames: 32, firstNumber: 1, ext: ".png", w: 350, h: 300, angleOffset: Math.PI, flipX: false, flipY: false },
    playSprite: false,
    spriteSpeed: 20,
    bulletSprite: { src: "Munitions/Scatter_purple.png", w: 86, h: 22, glow: true, invert: true },
    r: 18, hp: 2500000, shield: 2500000, speed: 350, value: 2500000,
    bulletDmg: 12500, bulletSpeed: 4500,
    shootRange: 550, shootRate: 1, bulletSpread: 0.05, burst: 1, bulletR: 7, bulletScale: 1.5, orbit: 0.45,
  },
  npc_Pyrospire : {
    name: "-=[ Pyrospire ]=-",
    sprite: { path: "Npc/Pyrospire/", frames: 32, firstNumber: 1, ext: ".png", w: 350, h: 300, angleOffset: Math.PI, flipX: false, flipY: false },
    playSprite: false,
    spriteSpeed: 20,
    bulletSprite: { src: "Munitions/x1.png", w: 78, h: 20, glow: true, invert: true },
    r: 18, hp: 1250000, shield: 1250000, speed: 350, value: 1250000,
    bulletDmg: 4500, bulletSpeed: 4500,
    shootRange: 450, shootRate: 1, bulletSpread: 0.05, burst: 1, bulletR: 7, bulletScale: 1.5, orbit: 0.45,
  },
  npc_Magma_Stalker : {
    name: "-=[ Stalker ]=-",
    sprite: { path: "Npc/Magma_Stalker/", frames: 32, firstNumber: 1, ext: ".png", w: 170, h: 136, angleOffset: Math.PI, flipX: false, flipY: false },
    playSprite: false,
    spriteSpeed: 20,
    bulletSprite: { src: "Munitions/x1.png", w: 78, h: 20, glow: true, invert: true },
    r: 18, hp: 50000, shield: 50000, speed: 750, value: 50000,
    bulletDmg: 4500, bulletSpeed: 4500,
    shootRange: 550, shootRate: 1, bulletSpread: 0.05, burst: 1, bulletR: 7, bulletScale: 1.5, orbit: 0.45,
  },
  npc_Veil_Stalker : {
    name: "-=[ Veil Stalker ]=-",
    sprite: { path: "Npc/Veil_Stalker/", frames: 32, firstNumber: 1, ext: ".png", w: 170, h: 136, angleOffset: Math.PI, flipX: false, flipY: false },
    playSprite: false,
    spriteSpeed: 20,
    bulletSprite: { src: "Munitions/Scatter_purple.png", w: 86, h: 22, glow: true, invert: true },
    r: 18, hp: 75000, shield: 75000, speed: 750, value: 75000,
    bulletDmg: 4500, bulletSpeed: 4500,
    shootRange: 550, shootRate: 1, bulletSpread: 0.05, burst: 1, bulletR: 7, bulletScale: 1.5, orbit: 0.45,
  },
  npc_Spore_Stalker : {
    name: "-=[ Spore Stalker ]=-",
    sprite: { path: "Npc/Spore_Stalker/", frames: 32, firstNumber: 1, ext: ".png", w: 170, h: 136, angleOffset: Math.PI, flipX: false, flipY: false },
    playSprite: false,
    spriteSpeed: 20,
    bulletSprite: { src: "Munitions/Scatter_green.png", w: 86, h: 22, glow: true, invert: true },
    r: 18, hp: 45000, shield: 45000, speed: 750, value: 45000,
    bulletDmg: 4500, bulletSpeed: 4500,
    shootRange: 550, shootRate: 1, bulletSpread: 0.05, burst: 1, bulletR: 7, bulletScale: 1.5, orbit: 0.45,
  },





  npc_Styxus : {
    name: "-=[ Styxus ]=-",
    sprite: { path: "Npc/Styxus/", frames: 32, firstNumber: 1, ext: ".png", w: 350, h: 280, angleOffset: Math.PI, flipX: false, flipY: false },
    playSprite: false,
    spriteSpeed: 20,
    bulletSprite: { src: "Munitions/stxharlan.png", w: 54, h: 54, glow: true, invert: true },
    r: 18, hp: 450000, shield: 500000, speed: 200, value: 500000,
    bulletDmg: 4500, bulletSpeed: 4500,
    shootRange: 920, shootRate: 3, bulletSpread: 0.05, burst: 1, bulletR: 7, bulletScale: 1.5, orbit: 0.45,
  },
  npc_Charopos : {
    name: "-=[ Charopos ]=-",
    sprite: { path: "Npc/Charopos/", frames: 32, firstNumber: 1, ext: ".png", w: 350, h: 280, angleOffset: Math.PI, flipX: false, flipY: false },
    playSprite: false,
    spriteSpeed: 20,
    bulletSprite: { src: "Munitions/stxharlan.png", w: 54, h: 54, glow: true, invert: true },
    r: 18, hp: 450000, shield: 500000, speed: 200, value: 500000,
    bulletDmg: 4500, bulletSpeed: 4500,
    shootRange: 920, shootRate: 3, bulletSpread: 0.05, burst: 1, bulletR: 7, bulletScale: 1.5, orbit: 0.45,
  },
  npc_Lanatum : {
    name: "-=[ Lanatum ]=-",
    sprite: { path: "Npc/Lanatum/", frames: 32, firstNumber: 1, ext: ".png", w: 400, h: 320, angleOffset: Math.PI, flipX: false, flipY: false },
    playSprite: false,
    spriteSpeed: 20,
    bulletSprite: { src: "Munitions/Special7.png", w: 50, h: 15, glow: true, invert: true },
    r: 18, hp: 45000, shield: 45000, speed: 650, value: 125000,
    bulletDmg: 4500, bulletSpeed: 4500,
    shootRange: 540, shootRate: 1, bulletSpread: 0.05, burst: 1, bulletR: 7, bulletScale: 1.5, orbit: 0.45,
  },





  npc_Viral_Kristallon: {
  name: "-=[ Viral Kristallon ]=-",
  sprite: { path: "Npc/Blighted_Kristallon/", frames: 83, firstNumber: 1, ext: ".png", w: 188, h: 188, angleOffset: Math.PI, flipX: false, flipY: false },
  playSprite: true,
  passiveNative: true,
  spriteSpeed: 20,
  bulletSprite: { src: "Munitions/Kristallon.png", w: 40, h: 15, glow: true, invert: true },
  r: 18, hp: 600000, shield: 450000, speed: 700, value: 500000,
  bulletDmg: 4500, bulletSpeed: 4500, shootRange: 500,
  shootRate: 1.0, bulletSpread: 0.05, burst: 1, bulletR: 7, bulletScale: 1.5, orbit: 0.45,

  onKill: {
    spawn: [
      { type: "npc_Viral_Gygerthrall", count: 5, radius: 260 }
    ]
  },
  },
  npc_Viral_Gygerthrall: {
    name: "-=[ Viral Gygerthrall ]=-",
    sprite: { path: "Npc/Blighted_Gygerthrall/", frames: 32, firstNumber: 1, ext: ".png", w: 100, h: 100, angleOffset: Math.PI, flipX: false, flipY: false },
    playSprite: false,
    spriteSpeed: 0,
    bulletSprite: { src: "Munitions/Special8.png", w: 55, h: 17, glow: true, invert: true },
    r: 18, hp: 245000, shield: 450000, speed: 1000, bulletDmg: 2500, bulletSpeed: 4500, value: 18800,
    shootRange: 620, shootRate: 1.0, bulletSpread: 0.05, burst: 1, bulletR: 7, bulletScale: 1.5, orbit: 0.45,
  },
  npc_Gygerim_Overlord: {
    name: "-=[ Gygerim Overlord ]=-",
    sprite: { path: "Npc/Gygerim_Overlord/", frames: 32, firstNumber: 1, ext: ".png", w: 572, h: 572, angleOffset: Math.PI, flipX: false, flipY: false },
    playSprite: false,
    spriteSpeed: 0,
    bulletSprite: { src: "Munitions/Special8.png", w: 55, h: 17, glow: true, invert: true },
    r: 18, hp: 80000000, shield: 80000000, speed: 0, bulletDmg: 60000, bulletSpeed: 4500, value: 0,
    shootRange: 1100, shootRate: 0.5, bulletSpread: 0.05, burst: 1, bulletR: 7, bulletScale: 1.5, orbit: 0.45,
  },



  

  npc_Explosif: {
  name: "☢",
  sprite: {
    path: "Npc/Explosif/",
    frames: 32,
    firstNumber: 1,
    ext: ".png",
    w: 300,
    h: 240,
    angleOffset: Math.PI,
    flipX: false,
    flipY: false
  },
  playSprite: true,
  spriteSpeed: 20,

  // il ne tire pas
  shootRate: 0,

  // stats
  r: 18,
  hp: 1,
  shield: 0,
  speed: 700,
  value: 0,

  // ✅ kamikaze
  ai: "kamikaze",          // ✅ nouveau flag
  explodeOnTouch: true,    // ✅ explose au contact
  explodeRadius: 220,      // ✅ rayon monde (collision distance)
  explodeDmg: 45000,       // ✅ dégâts à l'explosion
  touchDmg: 0,             // pas de dégâts "contact" standard, on gère via explosion

  // (optionnel) look des bullets si jamais tu le réactives plus tard
  bulletSprite: { src: "Munitions/x1.png", w: 78, h: 20, glow: true, invert: true },
  bulletDmg: 1,
  bulletSpeed: 4500,
  shootRange: 500,
  bulletSpread: 0.05,
  burst: 1,
  bulletR: 7,
  bulletScale: 1.5,
  orbit: 0.45,
  },





  npc_Annihilator : {
    name: "-=[ Annihilator ]=-",
    sprite: { path: "Npc/Annihilator/", frames: 32, firstNumber: 1, ext: ".png", w: 285, h: 253, angleOffset: Math.PI, flipX: false, flipY: false },
    playSprite: false,
    spriteSpeed: 0,
    bulletSprite: { src: "Munitions/x3.png", w: 78, h: 20, glow: true, invert: true },
    r: 18, hp: 300000, shield: 200000, speed: 430, bulletDmg: 17500, bulletSpeed: 4500, value: 250000,
    shootRange: 450, shootRate: 1.0, bulletSpread: 0.05, burst: 1, bulletR: 7, bulletScale: 1.5, orbit: 0.45,
  },
  npc_Saboteur : {
    name: "-=[ Saboteur ]=-",
    sprite: { path: "Npc/Saboteur/", frames: 32, firstNumber: 1, ext: ".png", w: 131, h: 116, angleOffset: Math.PI, flipX: false, flipY: false },
    playSprite: false,
    spriteSpeed: 0,
    bulletSprite: { src: "Munitions/Special8.png", w: 55, h: 17, glow: true, invert: true },
    r: 18, hp: 200000, shield: 150000, speed: 430, bulletDmg: 4000, bulletSpeed: 4500, value: 125000,
    shootRange: 350, shootRate: 0.25, bulletSpread: 0.05, burst: 1, bulletR: 7, bulletScale: 1.5, orbit: 0.45,
  },
  npc_Barracuda : {
    name: "-=[ Barracuda ]=-",
    sprite: { path: "Npc/Barracuda/", frames: 32, firstNumber: 1, ext: ".png", w: 128, h: 113, angleOffset: Math.PI, flipX: false, flipY: false },
    playSprite: false,
    spriteSpeed: 0,
    bulletSprite: { src: "Munitions/x3.png", w: 78, h: 20, glow: true, invert: true },
    r: 18, hp: 180000, shield: 100000, speed: 430, bulletDmg: 6000, bulletSpeed: 4500, value: 90000,
    shootRange: 500, shootRate: 1.0, bulletSpread: 0.05, burst: 1, bulletR: 7, bulletScale: 1.5, orbit: 0.45,
  },
  npc_Interceptor : {
    name: "-=[ Interceptor ]=-",
    sprite: { path: "Npc/Interceptor/", frames: 32, firstNumber: 1, ext: ".png", w: 94, h: 83, angleOffset: Math.PI, flipX: false, flipY: false },
    playSprite: false,
    spriteSpeed: 0,
    bulletSprite: { src: "Munitions/x1.png", w: 78, h: 20, glow: true, invert: true },
    r: 18, hp: 60000, shield: 40000, speed: 500, bulletDmg: 300, bulletSpeed: 4500, value: 25000,
    shootRange: 550, shootRate: 1.0, bulletSpread: 0.05, burst: 1, bulletR: 7, bulletScale: 1.5, orbit: 0.45,
  },
  npc_Battleray : {
    name: "-=[ Battleray ]=-",
    sprite: { path: "Npc/Battleray/", frames: 32, firstNumber: 1, ext: ".png", w: 428, h: 380, angleOffset: Math.PI, flipX: false, flipY: false },
    playSprite: false,
    passiveNative: true,
    spriteSpeed: 0,
    bulletSprite: { src: "Munitions/Special8.png", w: 55, h: 17, glow: true, invert: true },
    r: 18, hp: 500000, shield: 400000, speed: 220, bulletDmg: 8750, bulletSpeed: 4500, value: 1750000,
    shootRange: 700, shootRate: 1.0, bulletSpread: 0.05, burst: 1, bulletR: 7, bulletScale: 1.5, orbit: 0.45,
  },
};
