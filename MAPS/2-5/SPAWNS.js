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
    { type: "npc_Lordakia", left: 25 },
    { type: "npc_Sibelonit", left: 50 },
    { type: "npc_Boss_Sibelonit", left: 10 },
    { type: "npc_Lordakium", left: 10 },
    { type: "npc_Boss_Lordakium", left: 5 },
    { type: "npc_Emperor_Lordakium", left: 1 },
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
      id: "p_25_to_4-4.123",
      x: 1000,   // bas gauche
      y: 6000,
      r: 260,
      toMap: "4-4.123",
      toPortal: "p_4-4.123_to_25",
    },
    {
      id: "p_25_to_26",
      x: 1000,   // haut droite
      y: 1000,
      r: 260,
      toMap: "2-6",
      toPortal: "p_26_to_25",
    },
    {
      id: "p_25_to_27",
      x: 10000,   // haut droite
      y: 1000,
      r: 260,
      toMap: "2-7",
      toPortal: "p_27_to_25",
    },
    {
      id: "p_25_to_45",
      x: 10000,   // haut droite
      y: 6000,
      r: 260,
      toMap: "4-5",
      toPortal: "p_45_to_25",
    },
  ];
}

export function getZoneSafeModules() {
  return { zone: null, beacons: [], modules: [
    { id: "QUEST_EIC_25", x: 1950, y: 5470, w: 515, h: 728, spr: "QUEST_EIC", safeRadius: 400 },
  ] };
}

