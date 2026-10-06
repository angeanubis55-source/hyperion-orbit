// 3-BL : 60 Impulse II + 29 Attend IX (boss : cas par cas plus tard).
// Triangle BL : 3-8 (retour) + 1-BL + 2-BL.

import { INVOKE_SPAWN_MIN_DISTANCE, pickSpacedSpawnPosition } from "../../NPC/NPC_SPAWN_POSITION.js";

const rand = (a,b)=>a+Math.random()*(b-a);
const dist2 = (ax,ay,bx,by)=>{ const dx=ax-bx, dy=ay-by; return dx*dx+dy*dy; };

export function getZoneSpawns(WORLD) {
  const pad = 300;
  const N = 89;

  const minDist = 0;
  const minDist2 = minDist * minDist;

  const camps = [];
  let tries = 0;
  const maxTries = 6000;

  // ✅ Quotas EXACTS : 60 Impulse II + 29 Attend IX
  const quota = [
    { type: "npc_Impulse_II", left: 60 },
    { type: "npc_Attend_IX", left: 29 },
  ];

  function pickQuotaType() {
    const total = quota.reduce((s, q) => s + Math.max(0, q.left), 0);
    if (total <= 0) return "npc_Impulse_II"; // fallback

    let r = Math.random() * total;
    for (const q of quota) {
      if (q.left <= 0) continue;
      r -= q.left;
      if (r <= 0) {
        q.left--;
        return q.type;
      }
    }

    // sécurité
    for (const q of quota) {
      if (q.left > 0) {
        q.left--;
        return q.type;
      }
    }
    return "npc_Impulse_II";
  }

  while (camps.length < N && tries < maxTries) {
    tries++;

    const x = rand(pad, WORLD.w - pad);
    const y = rand(pad, WORLD.h - pad);

    let ok = true;
    for (const c of camps) {
      if (dist2(x, y, c.x, c.y) < minDist2) { ok = false; break; }
    }
    if (!ok) continue;

    const type = pickQuotaType();

    camps.push({
      type,
      x, y,
      radius: 350,
      respawn: 0,
      maxAlive: 1,
      aggroRange: 750,
      leashRange: 1700,
      aggroHold: 8,
    });
  }

  // ✅ Boss BL : 10 Invoke (zone 16900,1000 -> 21325,7135) + Mindfire fixe.
  // Tous immobiles (speed 0, comme le Cubikon). Respawn : Invoke 90 s,
  // Mindfire 5 min (délais dans UNIVERSE_SIM).
  // Les Invoke ne spawnent jamais dans les zones grises (murs).
  const INVOKE_AREA = { x1: 16900, y1: 1000, x2: 21325, y2: 7135 };
  const INVOKE_WALLS = getZoneWalls(WORLD);
  function pickInvokePos() {
    const point = pickSpacedSpawnPosition({ area: INVOKE_AREA, walls: INVOKE_WALLS,
      occupied: camps.filter(camp => camp.type === "npc_Invoke_XVI") });
    if (!point) throw new Error("Aucune position libre pour un Invoke sur 3-BL");
    return point;
  }
  for (let i = 0; i < 10; i++) {
    const pos = pickInvokePos();
    camps.push({
      type: "npc_Invoke_XVI",
      x: pos.x,
      y: pos.y,
      spawnArea: { ...INVOKE_AREA },
      spawnMinDistance: INVOKE_SPAWN_MIN_DISTANCE,
      speed: 0,
      radius: 350,
      respawn: 0,
      maxAlive: 1,
      aggroRange: 750,
      leashRange: 1700,
      aggroHold: 8,
    });
  }
  camps.push({
    type: "npc_Strokelight_Barrage",
    x: 19000, y: 7000,
    fixed: true,
    speed: 0,
    radius: 350,
    respawn: 0,
    maxAlive: 1,
    aggroRange: 750,
    leashRange: 1700,
    aggroHold: 8,
  });
  camps.push({
    type: "npc_Mindfire_Behemoth",
    x: 5500, y: 3500,
    fixed: true,
    speed: 0,
    radius: 350,
    respawn: 0,
    maxAlive: 1,
    aggroRange: 750,
    leashRange: 1700,
    aggroHold: 8,
  });

  return camps;
}

export function getZonePortals(WORLD) {
  return [
    {
      id: "p_3BL_to_38",
      x: 14795,
      y: 3269,
      r: 260,
      toMap: "3-8",
      toPortal: "p_38_to_3BL",
    },
    {
      id: "p_3BL_to_1BL",
      x: 1451,
      y: 13232,
      r: 260,
      toMap: "1-BL",
      toPortal: "p_1BL_to_3BL",
    },
    {
      id: "p_3BL_to_2BL",
      x: 21100,
      y: 12000,
      r: 260,
      toMap: "2-BL",
      toPortal: "p_2BL_to_3BL",
    },
  ];
}

export function getZoneSafeModules(WORLD) {
  return { zone: null, beacons: [], modules: [] };
}

// Murs extraits de la minimap officielle.
// Convention moteur : x/y = CENTRE du mur.
// Le mur au bord droit dépasse de 2500 en radiation
// pour empêcher le contournement par l'extérieur.
export function getZoneWalls(WORLD) {
  return [
    { x: 847, y: 10111, w: 1061, h: 1086 },
    { x: 1377, y: 7969, w: 1033, h: 1086 },
    { x: 1377, y: 11901, w: 1033, h: 1086 },
    { x: 2940, y: 10111, w: 1062, h: 1086 },
    { x: 3471, y: 13399, w: 1033, h: 1027 },
    { x: 5006, y: 11314, w: 1061, h: 1086 },
    { x: 6124, y: 12841, w: 1061, h: 1086 },
    { x: 7085, y: 7132.5, w: 1033, h: 9450 },
    { x: 7673, y: 13428, w: 1061, h: 969 },
    { x: 7917, y: 1879, w: 13653, h: 1057 },
    { x: 9365, y: 11901, w: 1062, h: 1086 },
    { x: 9925, y: 9788, w: 1033, h: 1086 },
    { x: 16106, y: 1527, w: 431, h: 411 },
    { x: 16120, y: 6736, w: 746, h: 9069 },
    { x: 16507, y: 837, w: 430, h: 441 },
    { x: 16938, y: 2143, w: 431, h: 411 },
    { x: 17239, y: 1189, w: 401, h: 440 },
    { x: 17411, y: 9700, w: 401, h: 440 },
    { x: 17454, y: 11138, w: 430, h: 440 },
    { x: 17727, y: 7998, w: 631, h: 440 },
    { x: 18042, y: 9084, w: 402, h: 440 },
    { x: 18142, y: 11051, w: 430, h: 323 },
    { x: 18630, y: 8614, w: 430, h: 440 },
    { x: 18673, y: 10493, w: 516, h: 323 },
    { x: 18831, y: 9289, w: 431, h: 440 },
    { x: 19032, y: 7573, w: 1061, h: 411 },
    { x: 19462, y: 8395, w: 431, h: 411 },
    { x: 20136, y: 8790, w: 459, h: 440 },
    { x: 20207, y: 7998, w: 430, h: 440 },
    { x: 21930, y: 10287, w: 5139, h: 734 },
    { x: 20810, y: 9289, w: 258, h: 440 },
    { x: 21383, y: 9510, w: 430, h: 411 },
  ];
}
