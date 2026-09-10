const rand = (a,b)=>a+Math.random()*(b-a);
const dist2 = (ax,ay,bx,by)=>{ const dx=ax-bx, dy=ay-by; return dx*dx+dy*dy; };

export function getZoneSpawns(WORLD) {
  const pad = 300;
  const N = 104;

    // ✅ Cubikons FIXES (coordonnées + respawn exact)
  const FIXED_CUBIKONS = [
    { x: 3350, y: 2350, respawn: 60 }, // respawn = 120s
    { x: 3350, y: 4650, respawn: 60 }, // respawn = 180s
    { x: 7650, y: 2350, respawn: 60  }, // respawn = 90s
    { x: 7650, y: 4650, respawn: 60 }, // respawn = 240s
  ];

  const minDist = 0;
  const minDist2 = minDist * minDist;

  const camps = [];
  let tries = 0;
  const maxTries = 6000;

  // ✅ Quotas EXACTS : 100 Cubikon + 400 Protegit
  const quota = [
    { type: "npc_Kristallin", left: 35 },
    { type: "npc_Kristallon", left: 20 },
    { type: "npc_Blighted_Kristallin", left: 25 },
    { type: "npc_Boss_Kristallin", left: 20 },
  ];

  function pickQuotaType() {
    const total = quota.reduce((s, q) => s + Math.max(0, q.left), 0);
    if (total <= 0) return "npc_Kristallin"; // fallback

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
    return "npc_Kristallin";
  }

    // ✅ On ajoute d'abord les Cubikons fixes
  for (const c of FIXED_CUBIKONS) {
    camps.push({
      type: "npc_Cubikon",
      x: c.x,
      y: c.y,
      fixed: true,          // ✅ IMPORTANT : flag "spawn fixe"
      radius: 0,            // pas besoin de random autour
      respawn: c.respawn,   // ✅ temps exact de repop
      maxAlive: 1,
      aggroRange: 750,
      leashRange: 1700,
      aggroHold: 4,
    });
  }


    while (camps.length < (N + FIXED_CUBIKONS.length) && tries < maxTries) {
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
      id: "p_16_to_15",
      x: 10000,
      y: 6000,
      r: 260,
      toMap: "1-5",
      toPortal: "p_15_to_16",
      },
      {
      id: "p_16_to_18",
      x: 1000,   // haut droite
      y: 6000,
      r: 260,
      toMap: "1-8",
      toPortal: "p_18_to_16",
      },
      {
      id: "p_16_to_17",
      x: 5500,   // haut droite
      y: 6000,
      r: 260,
      toMap: "1-7",
      toPortal: "p_17_to_16",
      shortcutCreditCost: 50000,
},
];
}

