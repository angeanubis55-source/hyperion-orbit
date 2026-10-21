// MAPS/2-7/STATION.js — Base de Combat (centre 5500,2350).
import { STATION_SLOT_IDS, STATION_SLOT_OFFSETS } from "../../SRC/DATA/BATTLESTATION.js";

export function getZoneStation(WORLD) {
  const cx = 5500;
  const cy = 2350;
  return {
    x: cx,
    y: cy,
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
