// SCRIPTS/LOW_RAID.js — Raid Low en groupe (2 à 10 joueurs).
// Boucle : zone de ralliement -> compte à rebours 5 s -> vagues enchaînées
// (retour en zone entre chaque vague) -> Century Falcon -> récompense fixe
// versée à chaque membre du groupe présent sur la map.
// Le contrôleur est branché sur la boucle 50 ms de MULTI_SERVER (room "low").

import { awardNpcKill } from "./ACCOUNT_SERVER.js";
import { socialDescribeGroup } from "./SOCIAL_ROOM.js";

export const LOW_RAID_ZONE = Object.freeze({ x: 5500, y: 3500, r: 800 });
export const LOW_RAID_MIN = 2;
export const LOW_RAID_MAX = 10;
export const LOW_RAID_COUNTDOWN_MS = 5000;
export const LOW_RAID_BOSS_WAVE = 8;
export const LOW_RAID_TOTAL_WAVES = 8;
export const LOW_RAID_REWARD_TYPE = "npc_Low_Raid_Cache";
export const LOW_RAID_DONE_MS = 15000;

const raid = {
  phase: "idle", // idle | countdown | wave | done
  groupId: null,
  wave: 0, // vague en cours (1..6) ou 0
  nextWave: 1, // prochaine vague à lancer
  endsAt: 0, // fin du compte à rebours / fin de phase done (ms epoch)
  raidSeq: 0, // identifiant du run (anti-rejeu récompense)
  readyCount: 0, // membres en zone (affichage)
  readyNeed: 0, // taille du groupe suivi (affichage)
  lastSent: "",
  lastTick: 0,
};

function resetRaid(sim) {
  raid.phase = "idle";
  raid.groupId = null;
  raid.wave = 0;
  raid.nextWave = 1;
  raid.endsAt = 0;
  raid.readyCount = 0;
  raid.readyNeed = 0;
  try { if (sim && typeof sim.setRaidWave === "function") sim.setRaidWave(0); } catch {}
}

function inZone(x, y) {
  const dx = Number(x) - LOW_RAID_ZONE.x;
  const dy = Number(y) - LOW_RAID_ZONE.y;
  return dx * dx + dy * dy <= LOW_RAID_ZONE.r * LOW_RAID_ZONE.r;
}

function aliveState(s) {
  if (!s) return false;
  if (s.pvpDead === true) return false;
  if (!(Number(s.hp) > 0)) return false;
  return true;
}

// pid -> { x, y } des joueurs positionnés et vivants de la room.
function presentPlayers(room) {
  const list = [];
  for (const [pid, entry] of room) {
    const s = entry?.state;
    if (!s || s._posOk !== true) continue;
    if (!aliveState(s)) continue;
    list.push({ pid: String(pid), x: Number(s.x) || 0, y: Number(s.y) || 0 });
  }
  return list;
}

// Regroupe les présents par groupe social (seuls les groupes avec 2+
// membres sont visibles côté serveur comme côté client).
function groupsOnLow(present, ctx) {
  const byGroup = new Map(); // gid -> { id, members: [present] }
  for (const p of present) {
    let g = null;
    try { g = socialDescribeGroup(p.pid, { describe: (x) => ctx.describe(x) }); } catch { g = null; }
    if (!g || !g.id) continue;
    if (!byGroup.has(String(g.id))) byGroup.set(String(g.id), { id: String(g.id), members: [] });
    byGroup.get(String(g.id)).members.push(p);
  }
  return [...byGroup.values()];
}

function groupReady(members) {
  if (!Array.isArray(members)) return { ok: false, count: 0 };
  const inside = members.filter((m) => inZone(m.x, m.y));
  return { ok: members.length >= LOW_RAID_MIN && inside.length === members.length && members.length > 0, count: inside.length, need: members.length };
}

function statePayload() {
  return {
    t: "lowRaid",
    phase: raid.phase,
    wave: raid.wave,
    totalWaves: LOW_RAID_TOTAL_WAVES,
    nextWave: raid.nextWave,
    endsAt: raid.endsAt,
    groupId: raid.groupId,
    ready: raid.readyCount,
    need: raid.readyNeed,
    min: LOW_RAID_MIN,
    max: LOW_RAID_MAX,
    zone: { x: LOW_RAID_ZONE.x, y: LOW_RAID_ZONE.y, r: LOW_RAID_ZONE.r },
  };
}

function broadcastState(ctx) {
  const payload = statePayload();
  const key = JSON.stringify(payload);
  if (key === raid.lastSent) return;
  raid.lastSent = key;
  try { ctx.broadcast(payload); } catch {}
}

export function getLowRaidPhase() {
  return raid.phase;
}

// Dernier état (pour les nouveaux arrivants sur la map).
export function getLowRaidState() {
  return statePayload();
}

export function tickLowRaid(room, sim, ctx) {
  try {
    tickLowRaidInner(room, sim, ctx);
  } finally {
    // Diffuse aussi les compteurs (PRÊTS x/y) qui changent sans transition.
    // broadcastState déduplique : aucun spam quand rien ne bouge.
    try { broadcastState(ctx); } catch {}
  }
}

function tickLowRaidInner(room, sim, ctx) {
  const now = Date.now();
  // ~4 Hz suffisent (positions 20 Hz, compte à rebours à la seconde).
  if (now - raid.lastTick < 250) return;
  raid.lastTick = now;

  if (!room || room.size === 0) {
    if (raid.phase !== "idle") { resetRaid(sim); raid.lastSent = ""; }
    return;
  }
  if (!sim || typeof sim.setRaidWave !== "function" || typeof sim.raidWaveAliveCount !== "function") return;

  const present = presentPlayers(room);
  const groups = groupsOnLow(present, ctx);
  const active = raid.groupId ? groups.find((g) => g.id === raid.groupId) : null;
  // Run en cours (vague 2+ ou vague active) : on continue avec les joueurs
  // présents, même en solo (un départ / une mort ne casse plus le run).
  const runActive = raid.nextWave > 1 || raid.wave > 0;
  const presentReady = present.length > 0 && present.every((m) => inZone(m.x, m.y));

  if (raid.phase === "done") {
    if (now >= raid.endsAt) {
      resetRaid(sim);
      broadcastState(ctx);
    }
    return;
  }

  if (raid.phase === "countdown") {
    if (!runActive) {
      const ready = active ? groupReady(active.members) : { ok: false };
      if (active) { raid.readyNeed = active.members.length; raid.readyCount = ready.count || 0; }
      if (!active || !ready.ok) {
        // Condition rompue (sortie de zone, mort, départ) : on annule.
        raid.phase = active ? "waiting" : "idle";
        if (!active) { raid.groupId = null; raid.nextWave = 1; raid.wave = 0; }
        raid.endsAt = 0;
        broadcastState(ctx);
        return;
      }
    } else {
      // Inter-vagues : enchaînement automatique, sans condition
      // (le run n'est jamais bloqué par un joueur absent).
      raid.readyNeed = present.length;
      raid.readyCount = present.filter((m) => inZone(m.x, m.y)).length;
    }
    if (now >= raid.endsAt) {
      raid.phase = "wave";
      raid.wave = raid.nextWave;
      try { sim.setRaidWave(raid.wave); } catch {}
      broadcastState(ctx);
    }
    return;
  }

  if (raid.phase === "wave") {
    raid.readyNeed = present.length;
    raid.readyCount = present.filter((m) => inZone(m.x, m.y)).length;
    let alive = 0;
    try { alive = sim.raidWaveAliveCount(); } catch { alive = 0; }
    if (alive > 0) return;
    // Vague nettoyée : on coupe le spawn puis on attend le ralliement.
    try { sim.setRaidWave(0); } catch {}
    if (raid.wave >= LOW_RAID_BOSS_WAVE) {
      // Boss tombé : récompense fixe à chaque joueur présent sur la map.
      raid.raidSeq += 1;
      const seq = raid.raidSeq;
      for (const m of present) {
        const pid = String(m.pid);
        if (!pid.startsWith("u_")) continue;
        const accountId = pid.slice(2);
        const txKey = `lowraid:${seq}:${accountId}`;
        let reward = null;
        try { reward = awardNpcKill(accountId, LOW_RAID_REWARD_TYPE, "low", 100, false, txKey); } catch { reward = null; }
        if (!reward || reward.duplicate) continue;
        try {
          ctx.sendTo(pid, {
            t: "npcReward", map: "low", uid: "low-raid-cache", seq,
            killer: "", percent: 100, ...reward,
          });
        } catch {}
      }
      raid.phase = "done";
      raid.endsAt = now + LOW_RAID_DONE_MS;
      broadcastState(ctx);
      return;
    }
    // Vague nettoyée : décompte auto de 5 s puis vague suivante.
    raid.phase = "countdown";
    raid.nextWave = raid.wave + 1;
    raid.wave = 0;
    raid.endsAt = now + LOW_RAID_COUNTDOWN_MS;
    broadcastState(ctx);
    return;
  }

  // idle | waiting.
  // Run en cours : ralliement des présents (même en solo), sans groupe requis.
  if (runActive) {
    raid.readyNeed = present.length;
    raid.readyCount = present.filter((m) => inZone(m.x, m.y)).length;
    if (presentReady) {
      raid.phase = "countdown";
      raid.endsAt = now + LOW_RAID_COUNTDOWN_MS;
      broadcastState(ctx);
    }
    return;
  }
  // Nouveau run : cherche un groupe prêt (priorité au groupe en cours).
  const candidates = [];
  if (active && active.members.length >= LOW_RAID_MIN) candidates.push(active);
  for (const g of groups) {
    if (raid.groupId && g.id === raid.groupId) continue;
    if (g.members.length >= LOW_RAID_MIN && g.members.length <= LOW_RAID_MAX) candidates.push(g);
  }
  // Affichage : groupe suivi ou plus gros groupe présent.
  const shown = active || [...groups].sort((a, b) => b.members.length - a.members.length)[0] || null;
  if (shown) {
    raid.readyNeed = shown.members.length;
    raid.readyCount = shown.members.filter((m) => inZone(m.x, m.y)).length;
  } else {
    raid.readyNeed = 0;
    raid.readyCount = 0;
  }
  for (const g of candidates) {
    const ready = groupReady(g.members);
    if (!ready.ok) continue;
    raid.groupId = g.id;
    raid.phase = "countdown";
    raid.endsAt = now + LOW_RAID_COUNTDOWN_MS;
    if (!(raid.nextWave >= 1 && raid.nextWave <= LOW_RAID_TOTAL_WAVES)) raid.nextWave = 1;
    broadcastState(ctx);
    return;
  }
  // Rien de prêt : en waiting on garde le groupe épinglé, en idle rien.
  if (raid.phase === "waiting" && (!active || active.members.length < LOW_RAID_MIN)) {
    resetRaid(sim);
    broadcastState(ctx);
  }
}
