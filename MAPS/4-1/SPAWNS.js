const rand = (a,b)=>a+Math.random()*(b-a);
const dist2 = (ax,ay,bx,by)=>{ const dx=ax-bx, dy=ay-by; return dx*dx+dy*dy; };

export function getZoneSpawns(WORLD) {
  const pad = 300;
  const N = 10;

  const minDist = 0;
  const minDist2 = minDist * minDist;

  const camps = [];
  let tries = 0;
  const maxTries = 6000;

  // ✅ Quotas EXACTS : 100 Cubikon + 400 Protegit
  const quota = [
    { type: "npc_Explosif", left: 10 },
  ];

  function pickQuotaType() {
    const total = quota.reduce((s, q) => s + Math.max(0, q.left), 0);
    if (total <= 0) return "npc_Explosif"; // fallback

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
    return "npc_Explosif";
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
      respawn: 10,
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
      id: "p_4-1_to_14",
      x: 1000,   
      y: 3500,
      r: 260,
      toMap: "1-4",
      toPortal: "p_14_to_4-1",
    },
    {
      id: "p_4-1_to_4-2",
      x: 10000,   
      y: 1000,
      r: 260,
      toMap: "4-2",
      toPortal: "p_4-2_to_4-1",
    },
    {
      id: "p_4-1_to_4-3",
      x: 10000,   
      y: 6000,
      r: 260,
      toMap: "4-3",
      toPortal: "p_4-3_to_4-1",
    },
    {
      id: "p_4-1_to_4-4",
      x: 5500,   // haut gauche
      y: 3500,
      r: 260,
      toMap: "4-4",
      toPortal: "p_4-4_to_4-1",
    },
  ];
}

