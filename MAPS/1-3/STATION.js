// MAPS/1-3/STATION.js — Base de Combat de test (station complète).
// Milieu entre le portail LOW (1000,1000) et le portail 2-3 (10232,1000).

import { STATION_SLOT_IDS, STATION_SLOT_OFFSETS } from "../../SRC/DATA/BATTLESTATION.js";

export function getZoneStation(WORLD) {
  const cx = Math.round((1000 + 10232) / 2);
  const cy = 1000;
  return {
    x: cx,
    y: cy,
    // État vide : astéroïde non conquis (BASE_VIDE). Les 9 coordonnées de
    // slots sont gardées pour la construction, mais aucun module posé.
    hub: null,
    hubClan: null,
    owner: {},
    slots: STATION_SLOT_OFFSETS.map((offset, i) => ({
      id: STATION_SLOT_IDS[i],
      resourceId: null,
      clan: null,
      dx: offset.x,
      dy: offset.y,
    })),
  };
}
