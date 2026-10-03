// 2-BL : map vide pour l'instant (contenu branché plus tard).
// Triangle BL : 2-8 (retour) + 1-BL + 3-BL.

export function getZoneSpawns(WORLD) {
  return [];
}

export function getZonePortals(WORLD) {
  return [
    {
      id: "p_2BL_to_1BL",
      x: 10895,
      y: 867,
      r: 260,
      toMap: "1-BL",
      toPortal: "p_1BL_to_2BL",
    },
    {
      id: "p_2BL_to_28",
      x: 700,
      y: 6000,
      r: 260,
      toMap: "2-8",
      toPortal: "p_28_to_2BL",
    },
    {
      id: "p_2BL_to_3BL",
      x: 21000,
      y: 8200,
      r: 260,
      toMap: "3-BL",
      toPortal: "p_3BL_to_2BL",
    },
  ];
}

export function getZoneSafeModules(WORLD) {
  return { zone: null, beacons: [], modules: [] };
}

// Murs extraits de la minimap officielle.
// Convention moteur : x/y = CENTRE du mur.
// Les murs au bord (gauche/haut/droite) dépassent de 2500 en radiation
// pour empêcher le contournement par l'extérieur.
export function getZoneWalls(WORLD) {
  return [
    { x: 1062, y: 13780, w: 631, h: 264 },
    { x: 514, y: 4138, w: 6028, h: 822 },
    { x: 1908, y: 11564, w: 1577, h: 646 },
    { x: 2037, y: 12826, w: 631, h: 646 },
    { x: 2238, y: 13663, w: 631, h: 499 },
    { x: 2725, y: 1703, w: 3212, h: 763 },
    { x: 3012, y: 12621, w: 631, h: 645 },
    { x: 3815, y: 11946, w: 631, h: 645 },
    { x: 4389, y: 13633, w: 631, h: 558 },
    { x: 4790, y: 4153, w: 918, h: 5664 },
    { x: 4977, y: 10420, w: 9035, h: 411 },
    { x: 5966, y: 1703, w: 1434, h: 763 },
    { x: 7113.5, y: 6765, w: 3729, h: 440 },
    { x: 9236, y: 2242, w: 516, h: 9485 },
    { x: 12807, y: 10420, w: 6224, h: 411 },
    { x: 13553, y: 5694, w: 430, h: 411 },
    { x: 13983, y: 7793, w: 430, h: 441 },
    { x: 14327, y: 4755, w: 430, h: 411 },
    { x: 14327, y: 6956, w: 430, h: 410 },
    { x: 14399, y: 3684, w: 402, h: 441 },
    { x: 15088, y: 12005, w: 401, h: 411 },
    { x: 15217, y: 6531, w: 431, h: 441 },
    { x: 15618, y: 13457, w: 1062, h: 440 },
    { x: 16020, y: 4755, w: 431, h: 411 },
    { x: 16020, y: 12841, w: 831, h: 440 },
    { x: 16120, y: 6120, w: 402, h: 441 },
    { x: 16235, y: 3889, w: 401, h: 440 },
    { x: 16264, y: 11711, w: 631, h: 646 },
    { x: 17454, y: 11637, w: 430, h: 440 },
    { x: 17597, y: 5914, w: 430, h: 440 },
    { x: 17798, y: 1850, w: 430, h: 411 },
    { x: 17813, y: 12944, w: 631, h: 645 },
    { x: 17913, y: 4329, w: 201, h: 440 },
    { x: 18874, y: 11271, w: 631, h: 645 },
    { x: 19003, y: 954, w: 431, h: 440 },
    { x: 20324, y: 10420, w: 8351, h: 411 },
    { x: 19204, y: 2525, w: 431, h: 411 },
    { x: 19691, y: 3889, w: 430, h: 440 },
    { x: 19777, y: 13002, w: 1578, h: 1292 },
    { x: 19993, y: 11770, w: 631, h: 645 },
    { x: 20064, y: 646, w: 430, h: 411 },
    { x: 20509, y: 1629, w: 631, h: 440 },
    { x: 20609, y: 2744, w: 430, h: 440 },
    { x: 21269, y: 426, w: 431, h: 441 },
    { x: 21699, y: 13531, w: 430, h: 645 },
  ];
}
