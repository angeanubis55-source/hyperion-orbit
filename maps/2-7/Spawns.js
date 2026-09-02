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
    { type: "npc_Kristallin", left: 40 },
    { type: "npc_Kristallon", left: 25 },
    { type: "npc_Blighted_Kristallon", left: 20 },
    { type: "npc_Boss_Kristallin", left: 10 },
    { type: "npc_Boss_Kristallon", left: 5 },
    { type: "npc_Emperor_Kristallon", left: 1 },
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
      id: "p_27_to_25",
      x: 1000,   // haut gauche
      y: 6000,
      r: 260,
      toMap: "2-5",
      toPortal: "p_25_to_27",
    },
    {
      id: "p_27_to_28",
      x: 10000,   // haut droite
      y: 1000,
      r: 260,
      toMap: "2-8",
      toPortal: "p_28_to_27",
    },
    {
      id: "p_27_to_26",
      x: 1000,   // haut droite
      y: 1000,
      r: 260,
      toMap: "2-6",
      toPortal: "p_26_to_27",
      shortcutCreditCost: 50000,
    },
    {
      id: "p_27_to_qz",
      x: 5500,   // haut droite
      y: 3500,
      r: 260,
      toMap: "qz",
      entryResource: "hybrid_alloy",
      entryResourceCost: 30,
      escortResourceCost: 10,
      maxEscorts: 7,
    },
  ];
}

