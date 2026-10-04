// 1-BL : 40 Impulse II + 20 Attend IX (boss : cas par cas plus tard).
// Triangle BL : 1-8 (retour) + 2-BL + 3-BL.

const rand = (a,b)=>a+Math.random()*(b-a);
const dist2 = (ax,ay,bx,by)=>{ const dx=ax-bx, dy=ay-by; return dx*dx+dy*dy; };

export function getZoneSpawns(WORLD) {
  const pad = 300;
  const N = 60;

  const minDist = 0;
  const minDist2 = minDist * minDist;

  const camps = [];
  let tries = 0;
  const maxTries = 6000;

  // ✅ Quotas EXACTS : 40 Impulse II + 20 Attend IX
  const quota = [
    { type: "npc_Impulse_II", left: 40 },
    { type: "npc_Attend_IX", left: 20 },
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
      aggroHold: 4,
    });
  }

  // ✅ Boss BL : 10 Invoke (zone 300,300 -> 5000,8000) + Strok + Mindfire fixes.
  // Tous immobiles (speed 0, comme le Cubikon). Respawn : Invoke 30 s,
  // Strok/Mindfire 5 min (délais dans UNIVERSE_SIM).
  // Les Invoke ne spawnent jamais dans les zones grises (murs).
  const INVOKE_AREA = { x1: 300, y1: 300, x2: 5000, y2: 8000 };
  const INVOKE_WALLS = getZoneWalls(WORLD);
  const INVOKE_MARGIN = 120;
  function inGreyZone(x, y) {
    for (const wl of INVOKE_WALLS) {
      const hw = Number(wl?.w || 0) / 2 + INVOKE_MARGIN;
      const hh = Number(wl?.h || 0) / 2 + INVOKE_MARGIN;
      if (Math.abs(x - Number(wl?.x || 0)) <= hw && Math.abs(y - Number(wl?.y || 0)) <= hh) return true;
    }
    return false;
  }
  function pickInvokePos() {
    let x = rand(INVOKE_AREA.x1, INVOKE_AREA.x2);
    let y = rand(INVOKE_AREA.y1, INVOKE_AREA.y2);
    for (let t = 0; t < 12 && inGreyZone(x, y); t++) {
      x = rand(INVOKE_AREA.x1, INVOKE_AREA.x2);
      y = rand(INVOKE_AREA.y1, INVOKE_AREA.y2);
    }
    return { x, y };
  }
  for (let i = 0; i < 10; i++) {
    const pos = pickInvokePos();
    camps.push({
      type: "npc_Invoke_XVI",
      x: pos.x,
      y: pos.y,
      spawnArea: { ...INVOKE_AREA },
      speed: 0,
      radius: 350,
      respawn: 0,
      maxAlive: 1,
      aggroRange: 750,
      leashRange: 1700,
      aggroHold: 4,
    });
  }
  camps.push({
    type: "npc_Strokelight_Barrage",
    x: 3140, y: 1290,
    fixed: true,
    speed: 0,
    radius: 350,
    respawn: 0,
    maxAlive: 1,
    aggroRange: 750,
    leashRange: 1700,
    aggroHold: 4,
  });
  camps.push({
    type: "npc_Mindfire_Behemoth",
    x: 21000, y: 6220,
    fixed: true,
    speed: 0,
    radius: 350,
    respawn: 0,
    maxAlive: 1,
    aggroRange: 750,
    leashRange: 1700,
    aggroHold: 4,
  });

  return camps;
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
