// src/data/rockets.js
"use strict";

// Roquettes tirables façon DarkOrbit : stock consommable.
// Le lance-roquettes est natif sur le vaisseau : aucun équipement requis.
// Seule la roquette ACTIVE est tirée (touche F / bouton RKT) ; la touche G
// passe à la suivante possédée.
//
// Dégâts/prix = valeurs par défaut à ajuster : dis-moi les bons chiffres et
// je les change ici, tout le reste (boutique, inventaire, tir) suit tout seul.
//
// Sprites :
//   - boutique : /Roquettes/<file>.png (ex: /Roquettes/r-310_100x100.png)
//   - ingame   : Munitions/<id>.png (ex: Munitions/r310.png, ~46×20).
//     Tant qu'un sprite ingame manque, le moteur dessine un point de fallback
//     et log "Image manquante: Munitions/<id>.png" une fois au chargement.

function def(id, name, short, file, damage, cooldown, packPrice, manual = true, packSize = 10, effect = null) {
  return Object.freeze({ id, name, short, file, damage, cooldown, packPrice, packSize, manual, effect: effect ? Object.freeze(effect) : null });
}

export const ROCKET_TYPES = Object.freeze({
  // Standards : tirables au lanceur natif (ESPACE).
  r310: def("r310", "Roquette R-310", "310", "r-310_100x100.png", 1000, 1.0, 30000),
  plt2021: def("plt2021", "Roquette PLT-2021", "021", "plt-2021_100x100.png", 4000, 1.0, 60000),
  plt2026: def("plt2026", "Roquette PLT-2026", "026", "plt-2026_100x100.png", 2000, 1.0, 120000),
  plt3030: def("plt3030", "Roquette PLT-3030", "030", "plt-3030_100x100.png", 6000, 1.0, 300000),
  dcr250: def("dcr250", "Roquette DCR-250", "DCR", "dcr-250_100x100.png", 0, 1.0, 12000, true, 10, { slowPct: 30, duration: 5 }),
  pld8: def("pld8", "Roquette PLD-8", "PLD", "pld-8_100x100.png", 0, 1.0, 90000, true, 10, { accuracyPenaltyPct: 30, duration: 5 }),
  // Lance-roquettes : pas de tir manuel pour l'instant (mécanique à venir).
  eco10: def("eco10", "Roquette ECO-10", "ECO", "eco-10_100x100.png", 2000, 3.0, 15000, false),
  ubr100: def("ubr100", "Roquette UBR-100", "UBR", "ubr-100_100x100.png", 7500, 3.5, 200000, false),
  cbr: def("cbr", "Roquette CBR", "CBR", "cbr_100x100.png", 3000, 3.0, 40000, false, 10, { shieldDrain: 3000 }),
  sar01: def("sar01", "Roquette SAR-01", "SA1", "sar-01_100x100.png", 0, 3.0, 50000, false, 10, { shieldDrain: 1000 }),
  sar02: def("sar02", "Roquette SAR-02", "SA2", "sar-02_100x100.png", 0, 3.5, 160000, false, 10, { shieldDrain: 4000 }),
  hstrm01: def("hstrm01", "Roquette HSTRM-01", "HST", "hstrm-01_100x100.png", 4000, 4.0, 150000, false),
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
  if (effect?.slowPct) return `Ralentit de ${format(effect.slowPct)} % pendant ${format(effect.duration)} s`;
  if (effect?.accuracyPenaltyPct) return `Précision réduite de ${format(effect.accuracyPenaltyPct)} % pendant ${format(effect.duration)} s`;
  if (effect?.shieldDrain && rocket.damage > 0) {
    return `${format(rocket.damage)} dégâts + ${format(effect.shieldDrain)} de bouclier absorbé par roquette`;
  }
  if (effect?.shieldDrain) return `${format(effect.shieldDrain)} de bouclier absorbé par roquette`;
  return `${format(rocket.damage)} dégâts par roquette`;
}

export function rocketShopIcon(id) {
  const r = getRocketType(id);
  return r ? `/Roquettes/${r.file}` : null;
}

export function rocketBulletSprite(id) {
  return `Munitions/${String(id || "r310").toLowerCase()}.png`;
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
