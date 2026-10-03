// 1-BL : map vide pour l'instant (contenu branché plus tard).
// Triangle BL : 1-8 (retour) + 2-BL + 3-BL.

export function getZoneSpawns(WORLD) {
  return [];
}

export function getZonePortals(WORLD) {
  return [
    {
      id: "p_1BL_to_2BL",
      x: 8381,
      y: 1467,
      r: 260,
      toMap: "2-BL",
      toPortal: "p_2BL_to_1BL",
    },
    {
      id: "p_1BL_to_18",
      x: 838,
      y: 11733,
      r: 260,
      toMap: "1-8",
      toPortal: "p_18_to_1BL",
    },
    {
      id: "p_1BL_to_3BL",
      x: 21100,
      y: 12000,
      r: 260,
      toMap: "3-BL",
      toPortal: "p_3BL_to_1BL",
    },
  ];
}

export function getZoneSafeModules(WORLD) {
  return { zone: null, beacons: [], modules: [] };
}

// Murs extraits de la minimap officielle (18 cadres).
// Convention moteur : x/y = CENTRE du mur.
// Les 3 murs au bord (haut/gauche/droite) dépassent de 2500 en radiation
// pour empêcher le contournement par l'extérieur.
export function getZoneWalls(WORLD) {
  return [
    { x: 7091, y: 3947, w: 471, h: 12895 },
    { x: 1868, y: 10185, w: 8737, h: 420 },
    { x: 19683, y: 5363, w: 1090, h: 7708 },
    { x: 22364, y: 8895, w: 4272, h: 645 },
    { x: 14499, y: 5027, w: 913, h: 869 },
    { x: 10478, y: 9848, w: 884, h: 869 },
    { x: 13203, y: 10016, w: 1090, h: 981 },
    { x: 6045, y: 879, w: 677, h: 869 },
    { x: 13807, y: 11558, w: 884, h: 869 },
    { x: 5839, y: 5532, w: 677, h: 645 },
    { x: 16399, y: 11040, w: 884, h: 841 },
    { x: 9860, y: 3724, w: 766, h: 841 },
    { x: 17356, y: 5181, w: 677, h: 448 },
    { x: 18269, y: 12861, w: 677, h: 729 },
    { x: 5603, y: 3962, w: 677, h: 645 },
    { x: 5795, y: 7550, w: 766, h: 589 },
    { x: 4307, y: 7129, w: 677, h: 645 },
    { x: 5780, y: 2420, w: 677, h: 645 },
  ];
}
