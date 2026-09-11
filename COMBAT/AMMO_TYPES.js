// COMBAT/AMMO_TYPES.js
// Munitions lasers officielles (darkorbitwiki.com) :
// - mult = dégâts de base ; vsMatch/vsMult = bonus contre certaines cibles
//   (lecture seule du type de cible, aucun changement côté NPC).
// - leechMult = vol de bouclier (comme SAB-50) en plus des dégâts.
// - ramp = IDB-125 (monte en puissance à chaque tir, moteur).
// - slowPct/slowDuration = PIB-100 (ralentit la cible, moteur).
export const AMMO = {
  x1: { mult: 1.0, color: "rgba(255,59,78,0.95)" },
  x2: { mult: 2.0, color: "rgba(74,163,255,0.95)" },
  x3: { mult: 3.0, color: "rgba(61,255,140,0.95)" },
  x4: { mult: 4.0, color: "rgba(246,247,255,0.95)" },
  sab: { mult: 0.5, color: "rgba(0,30,255,0.95)" },
  x6: { mult: 6.0, color: "rgba(255,165,74,0.95)" },
  rcb: { mult: 7.0, color: "rgba(200,60,255,0.95)" },
  cbo: { mult: 3.0, leechMult: 1.0, color: "rgba(150,90,255,0.95)" },
  job: { mult: 2.0, vsNpcMult: 3.5, color: "rgba(220,255,80,0.95)" },
  rb: { mult: 4.0, vsMatch: [/^npc_Demaner/], vsMult: 8.0, color: "rgba(255,210,80,0.95)" },
  pib: { mult: 4.0, slowPct: 10, slowDuration: 15, color: "rgba(61,255,140,0.95)" },
  idb: { mult: 1.0, ramp: true, rampStep: 1.25, rampMax: 6.0, rampResetMs: 3000, color: "rgba(255,80,200,0.95)" },
  vb: { mult: 4.0, vsMatch: [/Styxus/, /Charopos/], vsMult: 7.0, color: "rgba(170,80,255,0.95)" },
  emaa: { mult: 4.0, vsMatch: [/Mimesis/], vsMult: 7.0, color: "rgba(140,255,120,0.95)" },
  sbl: { mult: 4.0, vsMatch: [/^npc_Sibelon/], vsMult: 8.0, color: "rgba(80,220,255,0.95)" },
  abl: { mult: 4.0, vsMatch: [/Invoke/, /Mindfire/], vsMult: 8.0, color: "rgba(255,110,180,0.95)" },
};

export const PLAYER_BULLET_SPRITES = {
  x1: { src: "COMBAT/MUNITIONS/X1.png", w: 52, h: 18, glow: true, rotateOffset: Math.PI },
  x2: { src: "COMBAT/MUNITIONS/X2.png", w: 54, h: 18, glow: true, rotateOffset: Math.PI },
  x3: { src: "COMBAT/MUNITIONS/X3.png", w: 56, h: 18, glow: true, rotateOffset: Math.PI },
  x4: { src: "COMBAT/MUNITIONS/X4.png", w: 58, h: 18, glow: true, rotateOffset: Math.PI },
  // SAB/CBO : anneau d'absorption dessiné petit (comme les bolts standards),
  // sinon le tir paraît énorme en jeu.
  sab: { src: "COMBAT/MUNITIONS/SAB.png", w: 30, h: 42, glow: true, rotateOffset: Math.PI },
  x6: { src: "COMBAT/MUNITIONS/RSB.png", w: 58, h: 18, glow: true, rotateOffset: Math.PI },
  // Nouvelles munitions : tirs officiels extraits (main.swf : laser0-6,
  // idb-125, sbl-100, vb-142, rb214, rcb-140, am-l, os-l, spacecup).
  rcb: { src: "COMBAT/MUNITIONS/RCB.png", w: 60, h: 14, glow: true, rotateOffset: Math.PI },
  cbo: { src: "COMBAT/MUNITIONS/CBO.png", w: 30, h: 42, glow: true, rotateOffset: Math.PI },
  job: { src: "COMBAT/MUNITIONS/JOB.png", w: 43, h: 12, glow: true, rotateOffset: Math.PI },
  rb: { src: "COMBAT/MUNITIONS/RB.png", w: 78, h: 18, glow: true, rotateOffset: Math.PI },
  // PIB-100 : pas de tir dédié côté officiel → bolt vert X3 (officiel : tirs verts).
  pib: { src: "COMBAT/MUNITIONS/X3.png", w: 56, h: 18, glow: true, rotateOffset: Math.PI },
  idb: { src: "COMBAT/MUNITIONS/IDB.png", w: 78, h: 18, glow: true, rotateOffset: Math.PI },
  vb: { src: "COMBAT/MUNITIONS/VB.png", w: 114, h: 18, glow: true, rotateOffset: Math.PI },
  emaa: { src: "COMBAT/MUNITIONS/EMAA.png", w: 74, h: 12, glow: true, rotateOffset: Math.PI },
  sbl: { src: "COMBAT/MUNITIONS/SBL.png", w: 114, h: 18, glow: true, rotateOffset: Math.PI },
  abl: { src: "COMBAT/MUNITIONS/ABL.png", w: 43, h: 12, glow: true, rotateOffset: Math.PI },
  // Roquettes : sprites officiels extraits des rocketN.swf (voir COMBAT/ROCKET_TYPES.js
//   pour le mapping). w/h = tailles natives : pas de déformation au rendu.
  r310: { src: "COMBAT/MUNITIONS/R310.png", w: 26, h: 5, glow: true, rotateOffset: Math.PI },
  eco10: { src: "COMBAT/MUNITIONS/ECO10.png", w: 34, h: 9, glow: true, rotateOffset: Math.PI },
  plt2021: { src: "COMBAT/MUNITIONS/PLT2021.png", w: 34, h: 9, glow: true, rotateOffset: Math.PI },
  plt2026: { src: "COMBAT/MUNITIONS/PLT2026.png", w: 41, h: 41, glow: true, rotateOffset: Math.PI },
  plt3030: { src: "COMBAT/MUNITIONS/PLT3030.png", w: 25, h: 7, glow: true, rotateOffset: Math.PI },
  ubr100: { src: "COMBAT/MUNITIONS/UBR100.png", w: 25, h: 7, glow: true, rotateOffset: Math.PI },
  dcr250: { src: "COMBAT/MUNITIONS/DCR250.png", w: 22, h: 5, glow: true, rotateOffset: Math.PI },
  cbr: { src: "COMBAT/MUNITIONS/CBR.png", w: 23, h: 9, glow: true, rotateOffset: Math.PI },
  pld8: { src: "COMBAT/MUNITIONS/PLD8.png", w: 22, h: 5, glow: true, rotateOffset: Math.PI },
  sar01: { src: "COMBAT/MUNITIONS/SAR01.png", w: 25, h: 7, glow: true, rotateOffset: Math.PI },
  sar02: { src: "COMBAT/MUNITIONS/SAR02.png", w: 25, h: 7, glow: true, rotateOffset: Math.PI },
  hstrm01: { src: "COMBAT/MUNITIONS/HSTRM01.png", w: 25, h: 7, glow: true, rotateOffset: Math.PI },
  bdr1211: { src: "COMBAT/MUNITIONS/BDR1211.png", w: 22, h: 5, glow: true, rotateOffset: Math.PI },
  pir100: { src: "COMBAT/MUNITIONS/PIR100.png", w: 34, h: 9, glow: true, rotateOffset: Math.PI },
  wizx: { src: "COMBAT/MUNITIONS/WIZX.png", w: 97, h: 67, glow: true, rotateOffset: Math.PI },
  ric3: { src: "COMBAT/MUNITIONS/RIC3.png", w: 32, h: 35, glow: true, rotateOffset: Math.PI },
  rc100: { src: "COMBAT/MUNITIONS/RC100.png", w: 34, h: 9, glow: true, rotateOffset: Math.PI },
  sp100x: { src: "COMBAT/MUNITIONS/SP100X.png", w: 25, h: 7, glow: true, rotateOffset: Math.PI },
  k300m: { src: "COMBAT/MUNITIONS/K300M.png", w: 27, h: 7, glow: true, rotateOffset: Math.PI },
  agt500: { src: "COMBAT/MUNITIONS/AGT500.png", w: 50, h: 15, glow: true, rotateOffset: Math.PI },
  sr5: { src: "COMBAT/MUNITIONS/SR5.png", w: 35, h: 19, glow: true, rotateOffset: Math.PI },
  bdr1212: { src: "COMBAT/MUNITIONS/BDR1212.png", w: 34, h: 9, glow: true, rotateOffset: Math.PI },
  shg01: { src: "COMBAT/MUNITIONS/SHG01.png", w: 25, h: 7, glow: true, rotateOffset: Math.PI },
  shg02: { src: "COMBAT/MUNITIONS/SHG02.png", w: 34, h: 9, glow: true, rotateOffset: Math.PI },
};
