const rand = (a,b)=>a+Math.random()*(b-a);
const dist2 = (ax,ay,bx,by)=>{ const dx=ax-bx, dy=ay-by; return dx*dx+dy*dy; };

export function getZoneSpawns(WORLD) {
  const pad = 300;
  const N = 220;

  const minDist = 0;
  const minDist2 = minDist * minDist;

  const camps = [];
  let tries = 0;
  const maxTries = 6000;

  // ✅ Quotas EXACTS : 100 Cubikon + 400 Protegit
  const quota = [
    { type: "npc_Boss_Streuner", left: 10 },
    { type: "npc_Uber_Streuner", left: 10 },

    { type: "npc_Boss_Lordakia", left: 10 },
    { type: "npc_Uber_Lordakia", left: 10 },

    { type: "npc_Boss_Saimon", left: 10 },
    { type: "npc_Uber_Saimon", left: 10 },

    { type: "npc_Boss_Mordon", left: 10 },
    { type: "npc_Uber_Mordon", left: 10 },

    { type: "npc_Boss_Sibelon", left: 10 },
    { type: "npc_Uber_Sibelon", left: 10 },

    { type: "npc_Boss_Devolarium", left: 10 },
    { type: "npc_Uber_Devolarium", left: 10 },

    { type: "npc_Boss_Sibelonit", left: 10 },
    { type: "npc_Uber_Sibelonit", left: 10 },

    { type: "npc_Boss_Lordakium", left: 10 },
    { type: "npc_Uber_Lordakium", left: 10 },

    { type: "npc_Boss_Kristallin", left: 10 },
    { type: "npc_Uber_Kristallin", left: 10 },

    { type: "npc_Boss_Kristallon", left: 10 },
    { type: "npc_Uber_Kristallon", left: 10 },

    { type: "npc_Boss_StreuneR8", left: 10 },
    { type: "npc_Uber_StreuneR8", left: 10 },
    // MANQUE TOUT LES UBERS !!!!
  ];

  function pickQuotaType() {
    const total = quota.reduce((s, q) => s + Math.max(0, q.left), 0);
    if (total <= 0) return " "; // fallback

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
      id: "p_45_to_15",
      x: 1000,   
      y: 7000,
      r: 520,
      toMap: "1-5",
      toPortal: "p_15_to_45",
    },

 //------------------------------------------------

    {
      id: "p_45_to_25",
      x: 11000,   
      y: 1000,
      r: 520,
      toMap: "2-5",
      toPortal: "p_25_to_45",
    },

 //------------------------------------------------

    {
      id: "p_45_to_35",
      x: 11000,   
      y: 13000,
      r: 520,
      toMap: "3-5",
      toPortal: "p_35_to_45",
    },

 //------------------------------------------------

     {
      id: "p_45_to_52",
      x: 11000,   // haut droite
      y: 7000,
      r: 520,
      toMap: "5-2",
      toPortal: "p_52_to_45",
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

  //------------------------------------------------

     {
      id: "p_45_to_MAUDITE",
      x: 21000,   // haut droite
      y: 7000,
      r: 520,
      toMap: "MAUDITE",
    },
  ];
}

