const rand = (a,b)=>a+Math.random()*(b-a);
const dist2 = (ax,ay,bx,by)=>{ const dx=ax-bx, dy=ay-by; return dx*dx+dy*dy; };

export function getZoneSpawns(WORLD) {
  const pad = 300;
  const N = 100;

  const minDist = 0;
  const minDist2 = minDist * minDist;

  const camps = [];
  let tries = 0;
  const maxTries = 6000;

  // ✅ Quotas EXACTS : 100 Cubikon + 400 Protegit
  const quota = [
    { type: "npc_Lordakia", left: 20 },
    { type: "npc_Saimon", left: 40 },
    { type: "npc_Boss_Saimon", left: 5 },
    { type: "npc_Mordon", left: 40 },
    { type: "npc_Boss_Mordon", left: 5 },
    { type: "npc_Devolarium", left: 15 },
    { type: "npc_Boss_Devolarium", left: 5 },
  ];

  function pickQuotaType() {
    const total = quota.reduce((s, q) => s + Math.max(0, q.left), 0);
    if (total <= 0) return "npc_Lordakia"; // fallback

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
    return "npc_Lordakia";
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
      id: "p_13_to_12",
      x: 1000,   // bas gauche
      y: 6000,
      r: 260,
      toMap: "1-2",
      toPortal: "p_12_to_13",
    },
    {
      id: "p_13_to_14",
      x: 10000,   // bas droite
      y: 6000,
      r: 260,
      toMap: "1-4",
      toPortal: "p_14_to_13",
    },
    {
      id: "p_13_to_low",
      x: 1000,   // bas droite
      y: 1000,
      r: 260,
      toMap: "low",
    },
    {
      id: "p_13_to_23",
      x: 10000,   // bas droite
      y: 1000,
      r: 260,
      toMap: "2-3",
      toPortal: "p_23_to_13",
    },
  ];
}

