const rand = (a,b)=>a+Math.random()*(b-a);
const dist2 = (ax,ay,bx,by)=>{ const dx=ax-bx, dy=ay-by; return dx*dx+dy*dy; };

export function getZoneSpawns(WORLD) {
  const pad = 300;
  const N = 50;

  const minDist = 0;
  const minDist2 = minDist * minDist;

  const camps = [];
  let tries = 0;
  const maxTries = 6000;

  // ✅ Quotas EXACTS : 100 Cubikon + 400 Protegit
  const quota = [
    { type: "npc_StreuneR8", left: 35 },
    { type: "npc_Boss_StreuneR8", left: 15 },
  ];

  function pickQuotaType() {
    const total = quota.reduce((s, q) => s + Math.max(0, q.left), 0);
    if (total <= 0) return "npc_StreuneR"; // fallback

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
    return "npc_StreuneR";
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
      id: "p_28_to_26",
      x: 1000,
      y: 6000,
      r: 260,
      toMap: "2-6",
      toPortal: "p_26_to_28",
    },
    {
      id: "p_28_to_27",
      x: 10000,
      y: 6000,
      r: 260,
      toMap: "2-7",
      toPortal: "p_27_to_28",
    },
    // Désactivé : map 2-8.1 inexistante (saut -> fallback 1-1 sinon).
    // Ancien bug syntaxe : double toMap ("2-8.1" écrasé par "p_28.1_to_28").
    // {
    //   id: "p_28_to_28.1",
    //   x: 5500,
    //   y: 6000,
    //   r: 260,
    //   toMap: "2-8.1",
    //   toPortal: "p_28.1_to_28",
    // },
    {
      id: "p_28_to_29",
      x: 1000,
      y: 1000,
      r: 260,
      toMap: "2-9",
      toPortal: "p_29_to_28",
    },
    {
      id: "p_28_to_200",
      x: 10000,
      y: 1000,
      r: 260,
      toMap: "2-10",
      toPortal: "p_200_to_28",
    },
  ];
}

export function getZoneSafeModules(WORLD) {
  // ✅ coin haut-gauche (position du bloc)
  const baseX = 800;
  const baseY = 800;

  // ============================================================
  // ✅ MODULES : tu règles ici w/h (taille affichée en jeu)
  // x,y = CENTRE du module
  // ============================================================
  const modules = [
    { id: "CENTRE_EIC", x: 5500, y: 1500, w: 455, h: 1087, spr: "CENTRE_EIC", questTerminal: true },
  ];

  // ============================================================
  // ✅ ZONE RONDE auto (englobe les modules)
  // ============================================================
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

  const margin = 850;
  const r = Math.hypot(halfW, halfH) + margin;

  const zone = { kind: "circle", x: cx, y: cy, r };

  // ============================================================
  // ✅ BEACONS : TU RÈGLES LA TAILLE ICI (comme les modules)
  //
  // IMPORTANT :
  // - imgW/imgH = taille du fichier (INFO seulement)
  // - w/h = taille AFFICHÉE en jeu (ce que tu veux contrôler)
  // - si changer w/h ne change rien à l’écran => ton renderer ignore w/h
  // ============================================================
  const BEACON = {
    spr: "BEACON_EIC",

    // taille du PNG (info/debug)
    imgW: 90,
    imgH: 165,

    // ✅ taille affichée en jeu (mets ici ce que tu veux)
    w: 90,
    h: 165,

    count: 28,
    
    radius: null,      // si null => suit zone.r
    offset: 0,         // ajout au rayon final (ex: 120)
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

      // ✅ taille affichée (comme modules)
      w: BEACON.w,
      h: BEACON.h,

      // ✅ info source (debug)
      imgW: BEACON.imgW,
      imgH: BEACON.imgH,
    });
  }

  return { zone, modules, beacons };
}
