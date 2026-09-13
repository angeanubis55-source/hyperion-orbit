const rand = (a,b)=>a+Math.random()*(b-a);
const dist2 = (ax,ay,bx,by)=>{ const dx=ax-bx, dy=ay-by; return dx*dx+dy*dy; };

export function getZoneSpawns(WORLD) {
  const pad = 300;
  const N = 124;

  const minDist = 0;
  const minDist2 = minDist * minDist;

  const camps = [];
  let tries = 0;
  const maxTries = 6000;

  // Patrouilles pirates : Interceptor / Barracuda / Saboteur / Annihilator
  // + 1 uber de chaque (anneau rouge en jeu).
  const quota = [
    { type: "npc_Interceptor", left: 60 },
    { type: "npc_Barracuda", left: 30 },
    { type: "npc_Saboteur", left: 20 },
    { type: "npc_Annihilator", left: 10 },
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

    // sécurité
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

  return camps;
}

export function getZonePortals(WORLD) {
  return [
  {
      id: "p_52_to_45",
      x: 10000,
      y: 6000,
      r: 260,
      toMap: "4-5",
      toPortal: "p_45_to_52",
sprites: {
    idle: {
      src: "ASSETS/PIRATES_PORTAL/DESACTIVE.png",
      w: 362,
      h: 387,
      yOff: 0,
    },

    open: {
      src: "ASSETS/PIRATES_PORTAL/ACTIVE.png",
      w: 362,
      h: 387,
      yOff: 0,
    },

    jump: {
      src: "ASSETS/PIRATES_PORTAL/JUMP.png",
      w: 362,
      h: 387,
      yOff: 0,
      scale: 1,
      spinSpeed: 0,
      alpha: 1,
    },
    },
        },
  ];
}

export function getZoneSafeModules(WORLD) {
  // ✅ coin haut-gauche (position du bloc)
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
