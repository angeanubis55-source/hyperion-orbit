const rand = (a,b)=>a+Math.random()*(b-a);
const dist2 = (ax,ay,bx,by)=>{ const dx=ax-bx, dy=ay-by; return dx*dx+dy*dy; };

export function getZoneSpawns(WORLD) {
  const pad = 300;
  const N = 101;

  const minDist = 0;
  const minDist2 = minDist * minDist;

  const camps = [];
  let tries = 0;
  const maxTries = 6000;

  // ✅ Quotas EXACTS : 100 Cubikon + 400 Protegit
  const quota = [
    { type: "npc_Boss_Streuner", left: 5 },
    { type: "npc_Boss_Lordakia", left: 5 },
    { type: "npc_Boss_Streuner_Recruit", left: 1 },
    { type: "npc_Streuner_Recruit", left: 15 },
    { type: "npc_Streuner_Aider", left: 15 },
    { type: "npc_Streuner", left: 30 },
    { type: "npc_Lordakia", left: 30 },
  ];

  function pickQuotaType() {
    const total = quota.reduce((s, q) => s + Math.max(0, q.left), 0);
    if (total <= 0) return "npc_Streuner"; // fallback

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
    return "npc_Streuner";
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
      id: "p_12_to_11",
      x: 1000,   // haut gauche
      y: 1000,
      r: 260,
      toMap: "1-1",
      toPortal: "p_11_to_12",
    },
    {
      id: "p_12_to_13",
      x: 10000,   // haut droite
      y: 1000,
      r: 260,
      toMap: "1-3",
      toPortal: "p_13_to_12",
    },
    {
      id: "p_12_to_14",
      x: 10000,   // bas droite
      y: 6000,
      r: 260,
      toMap: "1-4",
      toPortal: "p_14_to_12",
    },
  ];
}

