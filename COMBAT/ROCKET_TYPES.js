// COMBAT/ROCKET_TYPES.js
"use strict";

// Roquettes tirables façon DarkOrbit : stock consommable.
// Le lance-roquettes est natif sur le vaisseau : aucun équipement requis.
// Seule la roquette ACTIVE est tirée (touche F / bouton RKT) ; la touche G
// passe à la suivante possédée.
//
// 24 types officiels (darkorbitwiki.com, dégâts/effets/cooldowns) :
// standards (tir manuel) : R-310, PLT-2021, PLT-2026, PLT-3030, DCR-250,
//   PLD-8, BDR-1211, WIZ-X, R-IC3 (gel 2 s), RC-100 (gel 3 s), SR-5
//   (vol bouclier 80000, 50 % reversés), AGT-500, SP-100X (perce-bouclier),
//   K-300M (slow + précision) ;
// munitions de lance-roquettes (pas de tir manuel pour l'instant) : ECO-10,
//   UBR-100, CBR, SAR-01, SAR-02, HSTRM-01, PIR-100, BDR-1212, SHG-01
//   (5000, perce 50 %), SHG-02 (7500, perce 75 %).
// Simplifications vs officiel : cooldown manuel unique 1 s (au lieu des
// 30/60/120/240 s par type), pas de bonus Agatus sur AGT-500 (pas de PNJ
// Agatus), pas de self-slow SR-5 ni de changement d'apparence WIZ-X
// (cosmétique, libellé seul), son BDR-1211 standard (soundID 88 introuvable).
// BDR-1212 réutilise l'icône BDR-1211 (aucune icône ammo officielle).
//
// Sprites :
//   - boutique : /COMBAT/ROCKET_SPRITES/<file>.png (CDN officiel darkorbit-22,
//     vérifié byte-identique via resource_items.xml ; DCR/PLD sans CDN gardés).
//   - ingame   : COMBAT/MUNITIONS/<id>.png = images officielles extraites des
//     rocketN.swf (Darkorbit_Download) via FFDec. Mapping validé par l'enum du
//     main.swf (R310,PLT_2026,PLT_2021,PLT_3030,PLD_8,HSTRM01,UBR100,ECO10,
//     ECO10_CPU,DCR_250,BDR_1211,SAR_01,SAR_02,CBR,BDR_1212,R_IC3,PIR_100)
//     croisé avec les couleurs des icônes boutique :
//     R310=r1, PLT2026=r2, PLT2021=r3, PLT3030=r4, PLD8=r5, DCR250=r6,
//     HSTRM01=r9, UBR100=r10, BDR1211=r11, SAR01=r12, SAR02=r13, CBR=r14,
//     ECO10=r20 (bleu), PIR100=r22.

function def(id, name, short, file, damage, cooldown, packPrice, manual = true, packSize = 10, effect = null) {
  return Object.freeze({ id, name, short, file, damage, cooldown, packPrice, packSize, manual, effect: effect ? Object.freeze(effect) : null });
}

export const ROCKET_TYPES = Object.freeze({
  // Standards : tirables au lanceur natif (ESPACE).
  r310: def("r310", "Roquette R-310", "310", "R-310_100X100.png", 1000, 1.0, 30000),
  plt2021: def("plt2021", "Roquette PLT-2021", "021", "PLT-2021_100X100.png", 4000, 1.0, 60000),
  plt2026: def("plt2026", "Roquette PLT-2026", "026", "PLT-2026_100X100.png", 2000, 1.0, 40000),
  plt3030: def("plt3030", "Roquette PLT-3030", "030", "PLT-3030_100X100.png", 6000, 1.0, 170000),
  dcr250: def("dcr250", "Roquette DCR-250", "DCR", "DCR-250_100X100.png", 0, 1.0, 12000, true, 10, { slowPct: 30, duration: 5 }),
  pld8: def("pld8", "Roquette PLD-8", "PLD", "PLD-8_100X100.png", 0, 1.0, 90000, true, 10, { accuracyPenaltyPct: 40, duration: 5 }),
  bdr1211: def("bdr1211", "Roquette BDR-1211", "BDR", "BDR-1211_100X100.png", 7500, 1.0, 250000),
  wizx: def("wizx", "Roquette WIZ-X", "WIZ", "WIZ-X_100X100.png", 0, 1.0, 20000, true, 10, { appearance: true }),
  ric3: def("ric3", "Roquette R-IC3", "IC3", "R-IC3_100X100.png", 0, 1.0, 150000, true, 10, { freezeSec: 2 }),
  rc100: def("rc100", "Roquette RC-100", "RC", "RC-100_100X100.png", 0, 1.0, 150000, true, 10, { freezeSec: 3 }),
  sr5: def("sr5", "Roquette SR-5", "SR5", "SR-5_100X100.png", 0, 1.0, 280000, true, 10, { shieldDrain: 80000, leechPct: 0.5 }),
  agt500: def("agt500", "Roquette AGT-500", "AGT", "AGT-500_100X100.png", 25000, 1.0, 350000),
  sp100x: def("sp100x", "Roquette SP-100X", "SPX", "SP-100X_100X100.png", 7200, 1.0, 200000, true, 10, { pierceShield: true }),
  k300m: def("k300m", "Roquette K-300M", "K3M", "K-300M_100X100.png", 0, 1.0, 120000, true, 10, { slowPct: 20, accuracyPenaltyPct: 5, duration: 2 }),
  // Lance-roquettes : pas de tir manuel pour l'instant (mécanique à venir).
  eco10: def("eco10", "Roquette ECO-10", "ECO", "ECO-10_100X100.png", 2000, 3.0, 30000, false),
  pir100: def("pir100", "Roquette PIR-100", "PIR", "PIR-100_100X100.png", 3500, 3.5, 180000, false, 10, { shieldDrain: 2500 }),
  bdr1212: def("bdr1212", "Roquette BDR-1212", "BD2", "BDR-1212_100X100.png", 4000, 3.5, 220000, false),
  shg01: def("shg01", "Roquette SHG-01", "SH1", "SHG-01_100X100.png", 5000, 3.5, 200000, false, 10, { piercePct: 0.5 }),
  shg02: def("shg02", "Roquette SHG-02", "SH2", "SHG-02_100X100.png", 7500, 3.5, 280000, false, 10, { piercePct: 0.75 }),
  ubr100: def("ubr100", "Roquette UBR-100", "UBR", "UBR-100_100X100.png", 7500, 3.5, 200000, false),
  cbr: def("cbr", "Roquette CBR", "CBR", "CBR_100X100.png", 3000, 3.0, 40000, false, 10, { shieldDrain: 3000 }),
  sar01: def("sar01", "Roquette SAR-01", "SA1", "SAR-01_100X100.png", 0, 3.0, 50000, false, 10, { shieldDrain: 1000 }),
  sar02: def("sar02", "Roquette SAR-02", "SA2", "SAR-02_100X100.png", 0, 3.5, 160000, false, 10, { shieldDrain: 4000 }),
  hstrm01: def("hstrm01", "Roquette HSTRM-01", "HST", "HSTRM-01_100X100.png", 4000, 4.0, 150000, false),
});

export const ROCKET_IDS = Object.freeze(Object.keys(ROCKET_TYPES));

export function getRocketType(id) {
  return ROCKET_TYPES[String(id || "").toLowerCase()] || null;
}

export function rocketEffectLabel(rocketOrId) {
  const rocket = typeof rocketOrId === "string" ? getRocketType(rocketOrId) : rocketOrId;
  if (!rocket) return "Effet inconnu";
  const format = (value) => Math.round(Number(value) || 0).toLocaleString("fr-FR");
  const effect = rocket.effect || null;
  if (effect?.appearance) return "Change l'apparence du vaisseau ciblé (aucun dégât)";
  if (effect?.freezeSec) {
    const base = `Gèle la cible pendant ${format(effect.freezeSec)} s`;
    return rocket.damage > 0 ? `${format(rocket.damage)} dégâts + ${base.toLowerCase()}` : base;
  }
  if (effect?.pierceShield) return `${format(rocket.damage)} dégâts directs coque (ignore le bouclier)`;
  if (effect?.piercePct) return `${format(rocket.damage)} dégâts dont ${format(effect.piercePct * 100)} % ignorent le bouclier`;
  if (effect?.shieldDrain && effect?.leechPct) {
    return `${format(effect.shieldDrain)} de bouclier absorbé par roquette (${format(effect.leechPct * 100)} % reversés)`;
  }
  if (effect?.slowPct && effect?.accuracyPenaltyPct) {
    return `Ralentit de ${format(effect.slowPct)} % et réduit la précision de ${format(effect.accuracyPenaltyPct)} % pendant ${format(effect.duration)} s`;
  }
  if (effect?.accuracyPenaltyPct) return `Précision réduite de ${format(effect.accuracyPenaltyPct)} % pendant ${format(effect.duration)} s`;
  if (effect?.shieldDrain && rocket.damage > 0) {
    return `${format(rocket.damage)} dégâts + ${format(effect.shieldDrain)} de bouclier absorbé par roquette`;
  }
  if (effect?.shieldDrain) return `${format(effect.shieldDrain)} de bouclier absorbé par roquette`;
  return `${format(rocket.damage)} dégâts par roquette`;
}

export function rocketShopIcon(id) {
  const r = getRocketType(id);
  return r ? `/COMBAT/ROCKET_SPRITES/${r.file}` : null;
}

// Icones CONTROL_MENU (officielles) pour dock/slots/HUD : la boutique garde
// rocketShopIcon. Sans correspondance (SHG-01/02) -> fallback boutique.
const ROCKET_DOCK_ICONS = Object.freeze({
  r310: "ASSETS/CONTROL_MENU/AMMUNITION_ROCKET_R-310.PNG",
  plt2021: "ASSETS/CONTROL_MENU/AMMUNITION_ROCKET_PLT-2021.PNG",
  plt2026: "ASSETS/CONTROL_MENU/AMMUNITION_ROCKET_PLT-2026.PNG",
  plt3030: "ASSETS/CONTROL_MENU/AMMUNITION_ROCKET_PLT-3030.PNG",
  dcr250: "ASSETS/CONTROL_MENU/AMMUNITION_SPECIALAMMO_DCR-250.PNG",
  pld8: "ASSETS/CONTROL_MENU/AMMUNITION_SPECIALAMMO_PLD-8.PNG",
  bdr1211: "ASSETS/CONTROL_MENU/AMMUNITION_ROCKET_BDR-1211.PNG",
  wizx: "ASSETS/CONTROL_MENU/AMMUNITION_SPECIALAMMO_WIZ-X.PNG",
  ric3: "ASSETS/CONTROL_MENU/AMMUNITION_SPECIALAMMO_R-IC3.PNG",
  rc100: "ASSETS/CONTROL_MENU/AMMUNITION_SPECIALAMMO_RC-100.PNG",
  sr5: "ASSETS/CONTROL_MENU/AMMUNITION_SPECIALAMMO_SR-5.PNG",
  agt500: "ASSETS/CONTROL_MENU/AMMUNITION_ROCKET_AGT-500.PNG",
  sp100x: "ASSETS/CONTROL_MENU/AMMUNITION_SPECIALAMMO_SP-100X.PNG",
  k300m: "ASSETS/CONTROL_MENU/AMMUNITION_SPECIALAMMO_K-300M.PNG",
  eco10: "ASSETS/CONTROL_MENU/AMMUNITION_ROCKETLAUNCHER_ECO-10.PNG",
  pir100: "ASSETS/CONTROL_MENU/AMMUNITION_ROCKETLAUNCHER_PIR-100.PNG",
  bdr1212: "ASSETS/CONTROL_MENU/AMMUNITION_ROCKET_BDR-1212.PNG",
  ubr100: "ASSETS/CONTROL_MENU/AMMUNITION_ROCKETLAUNCHER_UBR-100.PNG",
  cbr: "ASSETS/CONTROL_MENU/AMMUNITION_ROCKETLAUNCHER_CBR.PNG",
  sar01: "ASSETS/CONTROL_MENU/AMMUNITION_ROCKETLAUNCHER_SAR-01.PNG",
  sar02: "ASSETS/CONTROL_MENU/AMMUNITION_ROCKETLAUNCHER_SAR-02.PNG",
  hstrm01: "ASSETS/CONTROL_MENU/AMMUNITION_ROCKETLAUNCHER_HSTRM-01.PNG",
});

export function rocketDockIcon(id) {
  const key = String(id || "").toLowerCase();
  return ROCKET_DOCK_ICONS[key] || rocketShopIcon(key);
}

export function rocketBulletSprite(id) {
  return `COMBAT/MUNITIONS/${String(id || "r310").toUpperCase()}.png`;
}

export function rocketFlightLife(range, speed = 1500) {
  // Garantit que la roquette atteint toujours sa cible : 3× le temps de
  // traversée directe (l'arc allonge le trajet), minimum 6 s.
  // Le MISS reste possible au contact (pas de dégâts), mais jamais de
  // disparition en vol tant que la cible est en vie.
  const r = Math.max(0, Number(range) || 0);
  const s = Math.max(1, Number(speed) || 1500);
  return Math.max(6, (r / s) * 3);
}

export function rocketLaunchSpeed(distToTarget) {
  // Standards : comme les munitions, loin = accélère, près = ralentit.
  // Garantit l'arrivée en 2000 ms max même si l'arc fait 2.2× la distance.
  const d = Math.max(0, Number(distToTarget) || 0);
  return Math.max(500, 900 + d * 1.1);
}
