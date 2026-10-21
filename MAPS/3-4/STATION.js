// MAPS/3-4/STATION.js — Base de Combat (centre 2646,4891).
import { STATION_SLOT_IDS, STATION_SLOT_OFFSETS } from "../../SRC/DATA/BATTLESTATION.js";

export function getZoneStation(WORLD) {
  const cx = 2646;
  const cy = 4891;
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
