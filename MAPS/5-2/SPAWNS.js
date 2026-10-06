const rand = (a,b)=>a+Math.random()*(b-a);
const dist2 = (ax,ay,bx,by)=>{ const dx=ax-bx, dy=ay-by; return dx*dx+dy*dy; };

// Murs extraits de la minimap officielle (anneau autour de la base pirate).
// Convention moteur : x/y = CENTRE du mur (comme en BL).
// Anneau intérieur uniquement : aucun mur de bordure, pas de radiation.
// Positions poussées à +15 % puis +30 % du centre (5500,3500) : la carte est
// plus petite qu'en BL, l'anneau d'origine collait trop la base. Tailles
// inchangées. Tous les murs suivent le scaling (aucun épinglé) : le centre
// du portail p_52_to_45 reste libre.
export function getZoneWalls(WORLD) {
  return [
    { x: 1703, y: 5818, w: 285, h: 277 },
    { x: 1991, y: 3673, w: 414, h: 146 },
    { x: 2098, y: 2043, w: 271, h: 146 },
    { x: 2194, y: 5100, w: 143, h: 422 },
    { x: 2397, y: 2955, w: 414, h: 291 },
    { x: 2492, y: 4077, w: 257, h: 160 },
    { x: 2696, y: 1934, w: 271, h: 291 },
    { x: 2899, y: 1226, w: 285, h: 131 },
    { x: 2995, y: 5197, w: 157, h: 291 },
    { x: 3495, y: 5818, w: 285, h: 277 },
    { x: 3603, y: 1325, w: 143, h: 291 },
    { x: 4092, y: 715, w: 285, h: 291 },
    { x: 4403, y: 5613, w: 157, h: 291 },
    { x: 4604, y: 1226, w: 143, h: 422 },
    { x: 5000, y: 5914, w: 414, h: 146 },
    { x: 5393, y: 813, w: 143, h: 422 },
    { x: 5906, y: 6318, w: 285, h: 422 },
    { x: 6300, y: 910, w: 271, h: 291 },
    { x: 6695, y: 6023, w: 285, h: 291 },
    { x: 7206, y: 715, w: 143, h: 291 },
    { x: 7494, y: 6123, w: 271, h: 160 },
    { x: 7698, y: 1325, w: 285, h: 291 },
    { x: 7698, y: 5415, w: 285, h: 291 },
    { x: 8092, y: 4502, w: 271, h: 146 },
    { x: 8107, y: 3481, w: 271, h: 146 },
    { x: 8304, y: 2347, w: 271, h: 291 },
    { x: 8402, y: 1737, w: 143, h: 291 },
    { x: 8402, y: 5206, w: 143, h: 277 },
    { x: 8699, y: 4175, w: 285, h: 291 },
    { x: 8902, y: 2651, w: 271, h: 146 },
  ];
}

// Les pirates ne spawnent jamais dans les murs (comme les Invoke en BL).
const WALL_SPAWN_MARGIN = 120;
function inWallZone(x, y) {
  const walls = getZoneWalls();
  for (const wl of walls) {
    const hw = Number(wl?.w || 0) / 2 + WALL_SPAWN_MARGIN;
    const hh = Number(wl?.h || 0) / 2 + WALL_SPAWN_MARGIN;
    if (Math.abs(x - Number(wl?.x || 0)) <= hw && Math.abs(y - Number(wl?.y || 0)) <= hh) return true;
  }
  return false;
}

export function getZoneSpawns(WORLD) {
  const pad = 300;
  const N = 101;

  const minDist = 0;
  const minDist2 = minDist * minDist;

  const camps = [];
  let tries = 0;
  const maxTries = 6000;

  // Patrouilles pirates : Interceptor / Barracuda / Saboteur / Annihilator
  // + 1 uber de chaque (anneau rouge en jeu).
  const quota = [
    { type: "npc_Interceptor", left: 60 },
    { type: "npc_Barracuda", left: 20 },
    { type: "npc_Saboteur", left: 10 },
    { type: "npc_Annihilator", left: 7 },
    { type: "npc_Uber_Interceptor", left: 1 },
    { type: "npc_Uber_Barracuda", left: 1 },
    { type: "npc_Uber_Saboteur", left: 1 },
    { type: "npc_Uber_Annihilator", left: 1 },
  ];

  function pickQuotaType() {
    const total = quota.reduce((s, q) => s + Math.max(0, q.left), 0);
    if (total <= 0) return "npc_Interceptor"; // fallback

    let r = Math.random() * total;
    for (const q of quota) {
      if (q.left <= 0) continue;
      r -= q.left;
      if (r <= 0) {
        q.left--;
        return q.type;
      }
    }

    // s�curit�
    for (const q of quota) {
      if (q.left > 0) {
        q.left--;
        return q.type;
      }
    }
    return "npc_Interceptor";
  }

  while (camps.length < N && tries < maxTries) {
    tries++;

    let x = rand(pad, WORLD.w - pad);
    let y = rand(pad, WORLD.h - pad);

    // Jamais dans les murs (anneau autour de la base) : 12 retries comme en BL.
    for (let t = 0; t < 12 && inWallZone(x, y); t++) {
      x = rand(pad, WORLD.w - pad);
      y = rand(pad, WORLD.h - pad);
    }
    if (inWallZone(x, y)) continue;

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

  return camps;
}

export function getZonePortals(WORLD) {
  return [
  {
      id: "p_52_to_45",
      x: 8750,
      y: 3500,
      r: 260,
      toMap: "4-5",
      toPortal: "p_45_to_52",
  },
  {
      id: "p_52_to_44",
      x: 1574,
      y: 2913,
      r: 260,
      toMap: "4-4",
      toPortal: "p_4-4_to_5-2",
  },
  ];
}

export function getZoneSafeModules(WORLD) {
  // ? coin haut-gauche (position du bloc)
  const baseX = 800;
  const baseY = 800;

  const modules = [
    { id: "CENTRE_PIRATES", x: WORLD.w / 2, y: WORLD.h / 2, w: 3000, h: 1985, spr: "CENTRE_PIRATE", oreTrade: true, tradeButtonX: 5000, tradeButtonY: 3350 }, // Centre + comptoir (vente minerais)
  ];

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const m of modules) {
    minX = Math.min(minX, m.x - m.w / 2);
    minY = Math.min(minY, m.y - m.h / 2);
    maxX = Math.max(maxX, m.x + m.w / 2);
    maxY = Math.max(maxY, m.y + m.h / 2);
  }

  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;

  const halfW = (maxX - minX) / 2;
  const halfH = (maxY - minY) / 2;

  const margin = -500; // Zone autour de la base
  const r = Math.hypot(halfW, halfH) + margin;

  const zone = { kind: "circle", x: cx, y: cy, r };

  return { zone, modules };
}
