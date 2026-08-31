const rand = (a,b)=>a+Math.random()*(b-a);
const dist2 = (ax,ay,bx,by)=>{ const dx=ax-bx, dy=ay-by; return dx*dx+dy*dy; };

export function getZoneSpawns(WORLD) {
  const pad = 300;
  const N = 51;

  const minDist = 0;
  const minDist2 = minDist * minDist;

  const camps = [];
  let tries = 0;
  const maxTries = 6000;

  // ✅ Quotas EXACTS : 100 Cubikon + 400 Protegit
  const quota = [
    { type: "npc_Baby_Streuner", left: 10 },
    { type: "npc_Streuner_Recruit", left: 10 },
    { type: "npc_Streuner_Aider", left: 10 },
    { type: "npc_Boss_Streuner_Recruit", left: 1 },
    { type: "npc_Streuner", left: 20 },
  ];

  function pickQuotaType() {
    const total = quota.reduce((s, q) => s + Math.max(0, q.left), 0);
    if (total <= 0) return "npc_Baby_Streuner"; // fallback

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
    return "npc_Baby_Streuner";
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
      id: "p_21_to_22",
      x: 1000,
      y: 6000,
      r: 260,
      toMap: "2-2",
      toPortal: "p_22_to_21",
    },
    {
      id: "p_11_to_alpha",
      x: 7750,
      y: 500,
      r: 260,
      toMap: "alpha",
 sprites: {
    idle: {
      src: "assets/Alpha_Portal/désactivé.png",
      w: 500,
      h: 500,
      yOff: 0,
    },

    open: {
      src: "assets/Alpha_Portal/activé.png",
      w: 500,
      h: 500,
      yOff: 0,
    },

    jump: {
      src: "assets/Alpha_Portal/jump.png",
      w: 500,
      h: 500,
      yOff: 0,
      scale: 1,
      spinSpeed: 0,
      alpha: 1,
    },
  },
    },
    {
      id: "p_11_to_beta",
      x: 8075,
      y: 2925,
      r: 260,
      toMap: "beta",
 sprites: {
    idle: {
      src: "assets/Beta_Portal/désactivé.png",
      w: 437,
      h: 456,
      yOff: 0,
    },

    open: {
      src: "assets/Beta_Portal/activé.png",
      w: 437,
      h: 456,
      yOff: 0,
    },

    jump: {
      src: "assets/Beta_Portal/jump.png",
      w: 437,
      h: 456,
      yOff: 0,
      scale: 1,
      spinSpeed: 0,
      alpha: 1,
    },
  },
    },
    {
      id: "p_11_to_gamma",
      x: 10500,
      y: 3250,
      r: 260,
      toMap: "gamma",
 sprites: {
    idle: {
      src: "assets/Gamma_Portal/désactivé.png",
      w: 360,
      h: 421,
      yOff: 0,
    },

    open: {
      src: "assets/Gamma_Portal/activé.png",
      w: 360,
      h: 421,
      yOff: 0,
    },

    jump: {
      src: "assets/Gamma_Portal/jump.png",
      w: 360,
      h: 421,
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
    { id: "CENTRE_EIC", x: 9500, y: 1500, w: 455, h: 1087, spr: "CENTRE_EIC", questTerminal: true },
  ];

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const m of modules.slice(0, 1)) {
    minX = Math.min(minX, m.x - m.w / 2);
    minY = Math.min(minY, m.y - m.h / 2);
    maxX = Math.max(maxX, m.x + m.w / 2);
    maxY = Math.max(maxY, m.y + m.h / 2);
  }

  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;

  const halfW = (maxX - minX) / 2;
  const halfH = (maxY - minY) / 2;

  const margin = 850; // Zone autour de la base
  const r = Math.hypot(halfW, halfH) + margin;

  const zone = { kind: "circle", x: cx, y: cy, r };

  const BEACON = {
    spr: "BEACON_EIC",

    imgW: 90,
    imgH: 165,

    w: 90,
    h: 165,

    count: 28,
    
    radius: null, 
    offset: 0,         
  };

  const beacons = [];
  for (let i = 0; i < BEACON.count; i++) {
    const a = (i / BEACON.count) * Math.PI * 2;
    const rr = zone.r + BEACON.offset;

    beacons.push({
      id: `b${i + 1}`,
      x: zone.x + Math.cos(a) * rr,
      y: zone.y + Math.sin(a) * rr,
      spr: BEACON.spr,

      w: BEACON.w,
      h: BEACON.h,

      imgW: BEACON.imgW,
      imgH: BEACON.imgH,
    });
  }

  return { zone, modules, beacons };
}
