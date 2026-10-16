import { protegitPatrol } from "../NPC/PROTEGIT_MOVEMENT.js";
import { npcFleeDirection } from "../NPC/NPC_FLEE.js";
import { pickSpacedSpawnPosition } from "../NPC/NPC_SPAWN_POSITION.js";
// SCRIPTS/NPC_ROOM.js — Simulation NPC serveur pour les maps zone.
// Reutilise les modules purs du jeu : UNIVERSE_SIM (slots/respawn),
// NPC_TYPES (stats), COMBAT_RULES (degats), MAPS/<id>/SPAWNS+WORLD (camps).
// Le serveur tranche les PV des NPC et les degats qu'ils infligent aux joueurs.

import { createUniverse, deserializeUniverse, ensureMapSlots, markDead, markAlive, getSlot, serializeUniverse, slotUid } from "../SRC/SIM/UNIVERSE_SIM.js";
import { NPC_TYPES } from "../NPC/NPC_TYPES.js";
import { damageEnemyLayers } from "../COMBAT/COMBAT_RULES.js";
import { JPC_LASER, jpcVolleyParts, tickJpcRepair, jpcTravel, jpcCombatMove, jpcCombatDistance, jpcEngageRange } from "../NPC/JPC_BEHAVIOR.js";
import { buildJpcRoster, ensureJpcTypes, isJpcBotMap, isJpcFarmable, JPC_TIERS, tierForMap, rollJpcFormSet, jpcRoleFormation, jpcSkillForMap, jpcRiposteFormation, jpcRiposteMultForSkill, jpcDroneDmgFactor, JPC_RESPAWN_DELAY_S, jpcFarmDmgMult, rollJpcRockets, jpcRocketDamage, jpcParkingSpot, jpcMissChance, jpcFleeThreshold, rollJpcBreather, jpcHourBucket, jpcRosterCount } from "../NPC/JPC_BOTS.js";
import { createSpatialPairIndex } from "../SRC/CORE/SPATIAL_INDEX.js";
import { DDOL_ACCURACY_PENALTY } from "./DISRUPTOR_RULES.js";

const clamp = (v, a, b) => Math.max(a, Math.min(b, Number(v)));
const TAU = Math.PI * 2;
// Les NPC restent normalement dans la carte, mais une cible deja engagee peut
// etre poursuivie dans la radiation jusqu'a la meme profondeur que le client.
const RADIATION_CHASE_MARGIN = 2500;

// Ancres immobiles (Cubikon + boss BL) : la séparation les ignore dans les
// deux sens — les mobiles passent par-dessus au lieu de les pousser.
const ANCHORED_NPC_TYPES = new Set([
  "npc_Cubikon",
  "npc_Cubikon_maudite",
  "npc_Invoke_XVI",
  "npc_Mindfire_Behemoth",
  "npc_Strokelight_Barrage",
]);
function isAnchoredNpcType(type) {
  return ANCHORED_NPC_TYPES.has(String(type || ""));
}

// Maps doublées (1-BL / 2-BL / 3-BL / 4-5 : 22000x14000 vs 11000x7000
// standard) : distance d'aggro et de poursuite x2.
const DOUBLE_RANGE_MAP_IDS = new Set(["1-bl", "2-bl", "3-bl", "4-5"]);
function aggroRangeMultFor(mapId) {
  return DOUBLE_RANGE_MAP_IDS.has(String(mapId || "").trim().toLowerCase()) ? 2 : 1;
}

// Mindfire / Invoke / Protegit : pas de top dégâts — la cible est
// retirée au hasard parmi les tapeurs toutes les 3 s.
const SHUFFLE_THREAT_TYPES = new Set([
  "npc_Mindfire_Behemoth",
  "npc_Invoke_XVI",
  "npc_Protegit",
  "npc_Protegit_maudite",
  "npc_Protegit_maudite2",
  "npc_Protegit_maudite3",
]);
const THREAT_SHUFFLE_MS = 3000;
// Hystérésis du top dégâts : il faut dépasser la cible actuelle de 25 %.
const THREAT_OVERTAKE_MULT = 1.25;
// Halo Mindfire : pulsation + dévoilage camouflage, toutes les 1 s, rayon 1200.
const MINDFIRE_HALO_PERIOD_S = 1;
const MINDFIRE_HALO_RADIUS = 1200;

// Bouclier uniquement : Mindfire et Invoke ne régénèrent jamais rien, mais
// le Strokelight régénère son bouclier (jamais sa coque).
function isNoShieldRegenBlBossType(type) {
  return String(type || "") === "npc_Mindfire_Behemoth"
    || String(type || "") === "npc_Invoke_XVI";
}

// Blacklight : seuls les dégâts des joueurs sont majorés (x1.25, sauf
// Orcus / Orcus Plus qui restent x1), comme en solo. Les NPC infligent
// leurs dégâts normaux.
const BL_MAP_IDS = new Set(["1-bl", "2-bl", "3-bl"]);
function isOrcusShipId(shipId) {
  const s = String(shipId || "").trim().toLowerCase();
  return s === "orcus" || s === "orcus_plus" || s.startsWith("orcus_") || s.startsWith("orcus-plus");
}
function blDamageMultFor(mapId, shipId) {
  if (!BL_MAP_IDS.has(String(mapId || "").trim().toLowerCase())) return 1;
  return isOrcusShipId(shipId) ? 1 : 1.25;
}

function statsFor(type) {
  const cfg = NPC_TYPES[type];
  if (!cfg) return null;
  return {
    hpMax: Math.max(1, Math.floor(Number(cfg.hp ?? 50))),
    shMax: Math.max(0, Math.floor(Number(cfg.shield ?? 0))),
    speed: Math.max(40, Math.floor(Number(cfg.speed ?? 320))),
    dr: clamp(Number(cfg.dr ?? 0), 0, 1),
    r: Math.max(10, Math.floor(Number(cfg.r ?? 18))),
    spread: clamp(Number(cfg.shieldSpread ?? 0.8), 0, 1),
    passive: !!cfg.passiveNative,
    kamikaze: String(cfg.ai || "") === "kamikaze",
    explodeOnTouch: !!cfg.explodeOnTouch,
    explodeRadius: Number(cfg.explodeRadius ?? 180),
    explodeDmg: Number(cfg.explodeDmg ?? 12000),
    canShoot: cfg.canShoot !== false,
    shootRange: Math.max(0, Number(cfg.shootRange ?? 500)),
    shootRate: Math.max(0, Number(cfg.shootRate ?? 1)),
    bulletDmg: Math.max(0, Number(cfg.bulletDmg ?? 10)),
    burst: Math.max(1, Math.floor(Number(cfg.burst ?? 1))),
  };
}

export class ZoneNpcSim {
  constructor(mapId, world, camps, savedUniverse = null) {
    this.mapId = String(mapId).toLowerCase();
    this.world = { w: Number(world?.w) || 11000, h: Number(world?.h) || 7000 };
    this.camps = camps;
    this.universe = savedUniverse ? deserializeUniverse(savedUniverse) : createUniverse();
    this.entries = new Map(); // uid -> { uid, campId, type, x, y, angle, hp, sh, hpMax, shMax, speed, dr, spread, tx, ty, killer }
    this.campT = new Map(); // campId -> delai avant prochain essai de spawn
    this.players = new Map(); // clientId -> { x, y, dead, safe, hidden }
    this.safe = []; // cercles de non-agression { x, y, r }
    this.feed = new Map(); // "uid|by" -> { uid, by, total } (degats du tick)
    this.healFeed = new Map(); // uid -> { uid, hp, sh } (reparation JPC du tick)
    this.recentGone = []; // uids retires sans mort (despawn vague) : purge immediate cote client
    this.playerHits = []; // impacts NPC autoritaires a appliquer par MULTI_SERVER
    this.decloaks = []; // camouflages dissipés par les halos Mindfire
    this.iemBursts = []; // IEM claquées par les bots JPC : { playerId, npcUid, x, y }
    this.shotFx = []; // Visuels de tir des fights JPC : { by, x, y, tx, ty, key, n, npc }
    this.rocketFx = []; // Visuels roquettes JPC (rshot) : { by, kind, x, y, ang, tx, ty, spd, arcDir, arcScale, arcBoost, prange, miss, v }
    this.separationIndex = createSpatialPairIndex(512);
    // Journal des kills (2.5 s) : le respawn instantane des NPC normaux
    // effacerait sinon la mort avant le snapshot — le killer perdrait sa recompense.
    this.deaths = []; // { uid, type, x, y, killer, at }
    ensureMapSlots(this.universe, this.mapId, camps, Date.now());
  }

  static async create(mapId, savedUniverse = null) {
    const id = String(mapId || "").toLowerCase();
    if (!/^[a-z0-9_-]+$/.test(id)) return null;
    // Alias client -> dossier (casse exacte, systèmes sensibles à la casse) :
    // la Low partagée vit dans MAPS/LOW_MAP, la Maudite dans MAPS/MAUDITE,
    // les BL dans MAPS/1-BL, 2-BL, 3-BL.
    const MAP_DIR_ALIASES = { low: "LOW_MAP", maudite: "MAUDITE", "1-bl": "1-BL", "2-bl": "2-BL", "3-bl": "3-BL" };
    const dir = MAP_DIR_ALIASES[id] || id;
    try {
      const [{ WORLD }, spawns] = await Promise.all([
        import(`../MAPS/${dir}/WORLD.js`),
        import(`../MAPS/${dir}/SPAWNS.js`),
      ]);
      if (!WORLD || typeof spawns?.getZoneSpawns !== "function") return null;
      const world = { w: Number(WORLD.w) || 11000, h: Number(WORLD.h) || 7000 };
      const defs = spawns.getZoneSpawns(world);
      if (!Array.isArray(defs) || !defs.length) return null;
      // Cercles de non-agression (base) : meme calme qu'en solo.
      let safe = [];
      try {
        if (typeof spawns?.getZoneSafeModules === "function") {
          const mods = spawns.getZoneSafeModules(world);
          const z = mods?.zone;
          if (z && String(z.kind || "circle") === "circle" && Number.isFinite(Number(z.r))) {
            // Marge +50 : parité solo (z.r + SAFE_ZONE_MARGIN côté client).
            safe = [{ x: Number(z.x) || 0, y: Number(z.y) || 0, r: Number(z.r) + 50 }];
          }
          // Modules autonomes (controleurs de missions x-4 / x-5). Les x-5
          // n'ont volontairement aucune `zone` globale : leur `safeRadius`
          // est donc la seule source de verite pour la ZNA serveur.
          for (const module of mods?.modules || []) {
            const radius = Number(module?.safeRadius || 0);
            if (!(radius > 0)) continue;
            safe.push({
              x: Number(module.x) || 0,
              y: Number(module.y) || 0,
              r: radius,
            });
          }
        }
        if (typeof spawns?.getZonePortals === "function") {
          for (const portal of spawns.getZonePortals(world) || []) {
            if (!portal || portal.hidden === true) continue;
            const destination = String(portal.toMap || "").trim().toLowerCase();
            // Les portails de Galaxy Gates ne fournissent jamais de zone sure.
            if (["alpha", "beta", "gamma", "delta", "epsilon", "zeta", "kappa", "lambda", "kronos", "awakened"].includes(destination)) continue;
            // Rayon 500 : parité solo (450 + SAFE_ZONE_MARGIN côté client).
            safe.push({ x: Number(portal.x) || 0, y: Number(portal.y) || 0, r: 500 });
          }
        }
      } catch {}
      // Meme identite que le client (ORBIT_ENGINE init zone : id = idx + 1).
      const camps = defs.map((c, idx) => ({
        id: idx + 1,
        type: String(c?.type || "unknown"),
        x: Number(c?.x) || 0,
        y: Number(c?.y) || 0,
        aggroRange: Number(c?.aggroRange ?? 700),
        respawn: Number(c?.respawn ?? 1.5),
        maxAlive: Math.max(1, Number(c?.maxAlive ?? 1)),
        speed: (c?.speed ?? null),
        // Camps fixes (boss BL...) : spawn/respawn au camp, comme le Cubikon.
        fixed: c?.fixed === true,
        // Zone de spawn (ex : Invoke BL) : { x1, y1, x2, y2 }.
        spawnArea: c?.spawnArea || null,
        spawnMinDistance: Math.max(0, Number(c?.spawnMinDistance) || 0),
        // Raid Low : numéro de vague (0/undefined = camp normal permanent).
        raidWave: Math.max(0, Math.floor(Number(c?.raidWave) || 0)) || 0,
        // Raid Low : IA chasseur type gate (traque map-wide, pas de fuite).
        hunter: c?.hunter === true,
        // Raid Low : camp à usage unique par vague (pas de respawn).
        noRespawn: c?.noRespawn === true,
      }));
      const sim = new ZoneNpcSim(id, world, camps, savedUniverse);
      sim.safe = safe;
      // Murs de la map (zones grises) : les spawnArea (Invoke BL) les évitent.
      try {
        sim.walls = typeof spawns?.getZoneWalls === "function" ? spawns.getZoneWalls(world) || [] : [];
      } catch { sim.walls = []; }
      // Raid Low : aucune vague active au démarrage (pas de spawn).
      sim.raidWave = 0;
      sim.raidWaveGen = 0;
      // Bots JPC natifs : roster seedé par map + heure (nouveau roster à
      // chaque heure sans redémarrer). Le serveur est la seule source.
      try {
        ensureJpcTypes();
        if (isJpcBotMap(id)) {
          const nowMs = Date.now();
          sim.spawnJpcRoster(buildJpcRoster(id, world, safe, sim.walls || [], nowMs), nowMs);
          sim.jpcBucket = jpcHourBucket(nowMs);
          sim.jpcTarget = sim.jpcAliveCount();
        }
      } catch {}
      return sim;
    } catch {
      return null; // pas une map zone (gate, base...) : pas de simu NPC
    }
  }

  setPlayer(clientId, x, y, flags = {}) {
    const f = (flags && typeof flags === "object") ? flags : { dead: flags };
    const pid = String(clientId);
    const prev = this.players.get(pid);
    const cloaked = f.cloaked === true;
    this.players.set(pid, {
      x: Number(x) || 0, y: Number(y) || 0,
      dead: f.dead === true,
      safe: f.safe === true,
      shipId: String(f.shipId || prev?.shipId || ""),
      untargetableUntil: Math.max(0, Number(f.untargetableUntil) || 0),
      cloaked,
      lockedTarget: String(f.lockedTarget || "").slice(0, 64),
      // Bouclier (0..1) pour la formation de riposte JPC (papillon/foreuse).
      shPct: Number.isFinite(Number(f.shPct)) ? Math.max(0, Math.min(1, Number(f.shPct))) : (Number.isFinite(Number(prev?.shPct)) ? prev.shPct : null),
    });
    // Camouflage (ultime ou CPU) : les NPC perdent la cible sur le front
    // montant, comme en local (pas de poursuite ni de tir sur l'invisible).
    if (cloaked && !prev?.cloaked) {
      for (const e of this.entries.values()) {
        if (String(e.aggroBy || "") === pid) {
          e.aggroBy = null;
          e.aggroUntil = 0;
        }
        if (String(e.pendingAggroBy || "") === pid) e.pendingAggroBy = null;
        if (String(e.chaseId || "") === pid) e.chaseId = null;
      }
    }
  }

  inSafe(x, y) {
    for (const z of this.safe || []) {
      const dx = Number(x) - z.x, dy = Number(y) - z.y;
      if (dx * dx + dy * dy <= z.r * z.r) return true;
    }
    return false;
  }

  // Repousse un point hors des cercles de non-agression (+marge).
  pushOutSafe(x, y, margin = 250) {
    let px = Number(x), py = Number(y);
    for (const z of this.safe || []) {
      const dx = px - z.x, dy = py - z.y;
      const d = Math.hypot(dx, dy) || 1;
      if (d < z.r + margin) {
        px = z.x + (dx / d) * (z.r + margin);
        py = z.y + (dy / d) * (z.r + margin);
      }
    }
    return {
      x: clamp(px, 80, this.world.w - 80),
      y: clamp(py, 80, this.world.h - 80),
    };
  }

  // Portée de menace : même rayon que l'acquisition (x2 sur BL / 4-5).
  // Un top dégâts hors de portée ne retient plus le NPC : il prend le
  // meilleur tapeur à portée au lieu de le suivre à l'infini.
  threatRangeFor(e) {
    return (Number(e?.aggroRange) || 700) * aggroRangeMultFor(this.mapId);
  }

  threatCandidateOk(e, pid, nowMs) {
    const p = this.players.get(String(pid));
    if (!p) return null;
    if (!this.validTarget(p) && !this.retaliationOpen(e, pid, nowMs)) return null;
    return p;
  }

  // Tirage aléatoire parmi les tapeurs à portée (Mindfire / Invoke /
  // Protegit) : switch toutes les 3 s. Un seul candidat → pas de switch
  // (flux existant). Cible actuelle sortie des candidats → switch immédiat.
  // Retourne { id, x, y } pour un SWITCH, null pour garder le flux existant.
  shuffleThreatTarget(e, nowMs) {
    if (!e || !e.dmgBy || e.dmgSeq !== e.seq) return null;
    const range = this.threatRangeFor(e);
    const cands = [];
    for (const [pid] of e.dmgBy) {
      const p = this.threatCandidateOk(e, pid, nowMs);
      if (!p) continue;
      const d = Math.hypot(Number(p.x) - e.x, Number(p.y) - e.y);
      if (d > range) continue;
      cands.push(String(pid));
    }
    if (cands.length < 2) return null;
    const cur = e.chaseId != null ? String(e.chaseId) : (e.aggroBy != null ? String(e.aggroBy) : null);
    if (cur && cands.includes(cur) && nowMs < Number(e.threatShuffleAt || 0)) return null;
    const pick = cands[(Math.random() * cands.length) | 0] || cands[0];
    e.threatShuffleAt = nowMs + THREAT_SHUFFLE_MS;
    const p = this.players.get(pick);
    return p ? { id: pick, x: p.x, y: p.y } : null;
  }

  // Menace : le plus gros dégâts cumulés de l'incarnation parmi les joueurs
  // attaquables À PORTÉE, avec hystérésis (il faut dépasser la cible
  // actuelle de 25 % pour la détrôner). Sans ça, à plusieurs tapeurs le
  // NPC yoyote entre le dernier tapeur et le plus proche à chaque salve.
  // Retourne { id, x, y } pour un SWITCH, null pour garder le flux existant.
  topThreatTarget(e, nowMs) {
    if (!e || !e.dmgBy || e.dmgSeq !== e.seq) return null;
    const range = this.threatRangeFor(e);
    const inRange = (pid) => {
      const p = this.players.get(String(pid));
      if (!p) return false;
      const d = Math.hypot(Number(p.x) - e.x, Number(p.y) - e.y);
      return d <= range;
    };
    let curId = e.chaseId != null ? String(e.chaseId) : (e.aggroBy != null ? String(e.aggroBy) : null);
    let curDmg = 0;
    if (curId) {
      const p = this.players.get(curId);
      if (p && (this.validTarget(p) || this.retaliationOpen(e, curId, nowMs)) && inRange(curId)) {
        curDmg = Math.max(0, Number(e.dmgBy.get(curId)) || 0);
      } else {
        curId = null;
      }
    }
    let bestId = null, bestDmg = 0;
    for (const [pid, total] of e.dmgBy) {
      if (pid === curId) continue;
      const p = this.players.get(pid);
      if (!p) continue;
      if (!this.validTarget(p) && !this.retaliationOpen(e, pid, nowMs)) continue;
      if (!inRange(pid)) continue;
      const dmg = Math.max(0, Number(total) || 0);
      if (dmg > bestDmg) { bestDmg = dmg; bestId = pid; }
    }
    if (bestId == null) return null;
    if (curId != null && bestDmg < curDmg * THREAT_OVERTAKE_MULT) return null;
    const p = this.players.get(bestId);
    return p ? { id: bestId, x: p.x, y: p.y } : null;
  }

  // Cible valide : vivante, hors zone sure et non camouflée (ultime ou CPU).
  validTarget(p) {
    return !!p && !p.dead && !p.safe && !p.cloaked && Date.now() >= Number(p.untargetableUntil || 0);
  }

  // Riposte depuis une zone sure : le NPC frappé par un joueur protégé
  // garde le droit de le pourchasser et de le toucher tant que son aggro
  // est fraîche (refreshée par les impacts reçus). Parité solo : seul le
  // NPC visé riposte, les autres ignorent le joueur protégé.
  retaliationOpen(e, pid, nowMs) {
    if (!e || pid == null) return false;
    const p = this.players.get(String(pid));
    if (!p || p.dead || p.safe !== true) return false;
    if (String(e.lastHitBy || "") !== String(pid)) return false;
    return Number(nowMs || Date.now()) < Number(e.aggroUntil || 0);
  }

  // MULTI_SERVER : laisse passer les dégâts de riposte vers un joueur
  // protégé (uniquement le NPC qu'il est en train de taper).
  allowsSafeHit(npcUid, pid) {
    if (!npcUid || pid == null) return false;
    const e = this.entries.get(String(npcUid));
    if (!e || !(e.hp > 0)) return false;
    return this.retaliationOpen(e, pid, Date.now());
  }

  breakPlayerLocks(clientId, untilMs) {
    const pid = String(clientId);
    const p = this.players.get(pid);
    if (p) p.untargetableUntil = Math.max(Number(p.untargetableUntil || 0), Number(untilMs) || 0);
    for (const e of this.entries.values()) {
      if (String(e.aggroBy || "") === pid) {
        e.aggroBy = null;
        e.aggroUntil = 0;
      }
      if (String(e.pendingAggroBy || "") === pid) e.pendingAggroBy = null;
      if (String(e.chaseId || "") === pid) e.chaseId = null;
    }
  }

  removePlayer(clientId) {
    this.players.delete(String(clientId));
  }

  // Menage : vire les joueurs qui ne sont plus dans la room (deco, kick,
  // changement de map, migration d'id) pour ne pas laisser de fantomes
  // que les NPC pourchasseraient eternellement.
  prunePlayers(keepIds) {
    try {
      const keep = new Set((Array.isArray(keepIds) ? keepIds : []).map(String));
      for (const pid of [...this.players.keys()]) {
        if (!keep.has(pid)) this.players.delete(pid);
      }
    } catch {}
  }

  // ---- Raid Low : activation de vague ----
  // Les camps raidWave > 0 ne spawnent que si leur vague est active.
  // Changer de vague despawn les NPC des autres vagues (purge partagée
  // immédiate côté client, sans récompense).
  setRaidWave(n) {
    const wave = Math.max(0, Math.floor(Number(n) || 0));
    if (wave === this.raidWave) return;
    this.raidWave = wave;
    // Nouvelle activation de vague : les camps à usage unique peuvent
    // respawner une fois (génération suivante).
    if (wave > 0) this.raidWaveGen = (Number(this.raidWaveGen) || 0) + 1;
    const nowMs = Date.now();
    for (const [uid, e] of [...this.entries]) {
      if (!e || !(e.hp > 0)) continue;
      const camp = this.camps.find((c) => c.id === e.campId);
      if (camp && camp.raidWave > 0 && camp.raidWave !== wave) {
        try { markDead(this.universe, this.mapId, uid, nowMs); } catch {}
        this.entries.delete(uid);
        if (this.recentGone.length < 200) this.recentGone.push(uid);
      }
    }
    for (const camp of this.camps) {
      if (camp.raidWave > 0 && camp.raidWave !== wave) this.campT.set(camp.id, 0);
    }
  }

  // Nombre de NPC de la vague active encore en vie.
  raidWaveAliveCount() {
    let n = 0;
    for (const e of this.entries.values()) {
      if (!e || !(e.hp > 0)) continue;
      const camp = this.camps.find((c) => c.id === e.campId);
      if (camp && camp.raidWave > 0 && camp.raidWave === this.raidWave) n++;
    }
    return n;
  }

  randomPos(pad = 80) {
    // Les NPC peuvent aller partout sur la map, meme sur la base.
    // Aucune exclusion de zone sure (evite les stacks aux bords).
    return {
      x: pad + Math.random() * Math.max(1, this.world.w - pad * 2),
      y: pad + Math.random() * Math.max(1, this.world.h - pad * 2),
    };
  }

  inWall(x, y, margin) {
    const walls = Array.isArray(this.walls) ? this.walls : [];
    if (!walls.length) return false;
    const m = Math.max(0, Number(margin) || 0);
    for (const w of walls) {
      const hw = Number(w?.w || 0) / 2 + m;
      const hh = Number(w?.h || 0) / 2 + m;
      if (Math.abs(Number(x) - Number(w?.x || 0)) <= hw && Math.abs(Number(y) - Number(w?.y || 0)) <= hh) return true;
    }
    return false;
  }

  areaPos(camp, pad = 80) {
    const a = camp?.spawnArea;
    if (camp.spawnMinDistance > 0) {
      return pickSpacedSpawnPosition({ area: a, walls: this.walls || [],
        minDistance: camp.spawnMinDistance,
        occupied: [...this.entries.values()].filter(entry => entry.hp > 0
          && entry.type === camp.type && entry.campId !== camp.id) });
    }
    if (a && [a.x1, a.y1, a.x2, a.y2].every((v) => Number.isFinite(Number(v)))) {
      const ax1 = Math.min(Number(a.x1), Number(a.x2));
      const ax2 = Math.max(Number(a.x1), Number(a.x2));
      const ay1 = Math.min(Number(a.y1), Number(a.y2));
      const ay2 = Math.max(Number(a.y1), Number(a.y2));
      // Jamais dans les zones grises (murs) pour les spawnArea (Invoke BL).
      const stats = statsFor(camp?.type);
      const margin = (Number(stats?.r) || 60) + 30;
      let x = ax1 + Math.random() * Math.max(0, ax2 - ax1);
      let y = ay1 + Math.random() * Math.max(0, ay2 - ay1);
      for (let t = 0; t < 12 && this.inWall(x, y, margin); t++) {
        x = ax1 + Math.random() * Math.max(0, ax2 - ax1);
        y = ay1 + Math.random() * Math.max(0, ay2 - ay1);
      }
      if (this.inWall(x, y, margin) && Number.isFinite(Number(camp?.x)) && Number.isFinite(Number(camp?.y))) {
        x = clamp(Number(camp.x), 80, this.world.w - 80);
        y = clamp(Number(camp.y), 80, this.world.h - 80);
      }
      return { x, y };
    }
    return this.randomPos(pad);
  }

  spawnFor(camp, nowMs) {
    const uid = slotUid(this.mapId, camp.id);
    const stats = statsFor(camp.type);
    if (!stats) return false; // type inconnu : slot ignore definitivement
    const isCubikon = camp.type === "npc_Cubikon";
    const isFixedCamp = isCubikon || camp.fixed === true;
    const pos = isFixedCamp ? { x: camp.x, y: camp.y } : this.areaPos(camp);
    if (!pos) return false;
    markAlive(this.universe, this.mapId, uid, nowMs);
    // Camp à usage unique (raid) : marqué comme spawné pour cette
    // activation de vague (anti-respawn, voir tick).
    if (camp.noRespawn === true) camp._raidGen = Number(this.raidWaveGen) || 0;
    const prev = this.entries.get(uid);
    this.entries.set(uid, {
      uid, campId: camp.id, type: camp.type,
      x: clamp(pos.x, 80, this.world.w - 80),
      y: clamp(pos.y, 80, this.world.h - 80),
      angle: Math.random() * TAU,
      hp: stats.hpMax, sh: stats.shMax,
      hpMax: stats.hpMax, shMax: stats.shMax,
      speed: (camp.speed ?? stats.speed), dr: stats.dr, spread: stats.spread,
      r: stats.r,
      passive: !!stats.passive, kamikaze: !!stats.kamikaze,
      explodeOnTouch: !!stats.explodeOnTouch, explodeRadius: stats.explodeRadius, explodeDmg: stats.explodeDmg,
      canShoot: stats.canShoot, shootRange: stats.shootRange, shootRate: stats.shootRate,
      bulletDmg: stats.bulletDmg, burst: stats.burst, shootCd: 0.2 + Math.random() * 0.5,
      aggroRange: camp.aggroRange, aggroHoldMs: Math.max(1000, (camp.aggroHold ?? 3.5) * 1000),
      hunter: camp.hunter === true,
      aggroBy: null, aggroUntil: 0,
      tx: null, ty: null, killer: null, firstBy: null, lastHitBy: null,
      lockBy: null, lockHitAt: 0, lockReleaseAt: 0, hitHist: [],
      orbitDir: Math.random() < 0.5 ? -1 : 1, orbitT: 2 + Math.random() * 3,
      seq: (Number(prev?.seq) || 0) + 1, // incarnation : anti-confusion au respawn
    });
    return true;
  }

  // ---- Bots JPC natifs (multijoueur) ----
  // Faux joueurs simulés par le serveur : visibles et identiques pour tous
  // (positions, PV, farm, fuite, riposte). Même pipeline que le NPC police
  // Awakened : coque joueur, drones, tir façon joueur.
  spawnJpcRoster(roster, nowMs) {
    if (!Array.isArray(roster) || !roster.length) return;
    // Adresse au combat : 1-1 maladroite (riposte 4 s), 1-8/BL agressive (12 s).
    const mapSkill = jpcSkillForMap(this.mapId);
    for (const def of roster) {
      if (!def || !def.uid) continue;
      const drones = def.drones || { count: 4, formation: "standard", design: "havoc", designs: ["havoc"], level: 1 };
      this.entries.set(String(def.uid), {
        uid: String(def.uid), campId: null, type: String(def.type),
        x: clamp(Number(def.x) || 0, 80, this.world.w - 80),
        y: clamp(Number(def.y) || 0, 80, this.world.h - 80),
        angle: Math.random() * TAU,
        hp: Math.max(1, Number(def.hpMax) || 50000), sh: Math.max(0, Number(def.shMax) || 0),
        hpMax: Math.max(1, Number(def.hpMax) || 50000), shMax: Math.max(0, Number(def.shMax) || 0),
        speed: Math.max(40, Number(def.speed) || 300), dr: 0, spread: 0.8,
        r: 20,
        passive: false, kamikaze: false,
        canShoot: true, shootRange: 700, shootRate: 1,
        bulletDmg: Math.max(1, Number(def.bulletDmg) || 500), burst: 1, shootCd: 0.5 + Math.random() * 0.5,
        // Jamais d'aggro de proximité : riposte aux dégâts uniquement.
        // Tient son agresseur 4 s (1-1) … 12 s (1-8/BL).
        aggroRange: 0, aggroHoldMs: Math.round(4000 + 8000 * mapSkill),
        hunter: false,
        aggroBy: null, aggroUntil: 0,
        tx: null, ty: null, killer: null, firstBy: null, lastHitBy: null,
        lockBy: null, lockHitAt: 0, lockReleaseAt: 0, hitHist: [],
        orbitDir: Math.random() < 0.5 ? -1 : 1, orbitT: 2 + Math.random() * 3,
        seq: 1,
        isJpcBot: true, jpc: true,
        jpcTier: tierForMap(this.mapId),
        jpcPseudo: String(def.pseudo || "JPC"),
        jpcDrones: { count: Math.max(2, Math.min(10, Number(drones.count) || 4)),
          formation: String(drones.formation || "standard"),
          design: String(drones.design || "havoc"),
          designs: (Array.isArray(drones.designs) && drones.designs.length ? drones.designs : [String(drones.design || "havoc")]).slice(0, 12).map(String),
          level: Math.max(1, Math.min(6, Number(drones.level) || 1)) },
        jpcAmmo: String(def.ammo || "x4"), jpcAmmoBase: String(def.ammo || "x4"),
        jpcVisualParts: [], jpcRepairTick: 0, jpcLastHit: 0,
        vx: 0, vy: 0,
        jpcShootT: 0, jpcNpcDpsAt: 0, jpcPreyUid: null, jpcRetargetAt: 0,
        // Roquettes façon vrai joueur.
        jpcRockets: (def.rockets && typeof def.rockets === "object") ? { ...def.rockets } : { standard: "r310" },
        jpcRocketAt: 0, jpcRocketSeq: 0,
        // Courage variable + glandouille portail + pause entre kills (comme en solo).
        jpcFleeAt: Number(def.fleeAt) || 0.35,
        jpcBreatherUntil: 0,
        jpcMullUntil: 0, jpcMulling: false,
        jpcMode: "farm", jpcSafeX: null, jpcSafeY: null,
        jpcIemAt: 0, jpcIshUntil: 0, jpcIshAt: 0,
        jpcSkill: mapSkill,
        jpcX6Until: 0, jpcX6At: 0, jpcRespawnAt: 0,
        // Formations par rôle (préférences du roster, stables pour ce bot).
        jpcForms: (def.forms && typeof def.forms === "object") ? { ...def.forms } : (() => {
          try {
            const t = JPC_TIERS[Number(tierForMap(this.mapId))] || JPC_TIERS[1];
            const c = Math.max(2, Math.min(10, Number(drones.count) || 4));
            return rollJpcFormSet(t.forms, c);
          } catch { return { farm: "standard", riposte: "standard", flee: "standard", travel: "standard" }; }
        })(),
        // Parité bot Kill : poursuite / passif / scan post-kill / ban mur.
        jpcCloseId: null, jpcChaseId: null, jpcAggroId: null,
        jpcPostKillAt: 0, jpcWallBan: {},
      });
    }
    // La cible suit le remplissage réel (spawn initial comme renforts
    // horaires) : les respawns 90 s maintiennent ce nombre, jamais plus.
    try {
      this.jpcTarget = Math.max(Number(this.jpcTarget) || 0, this.jpcAliveCount());
    } catch {}
  }

  // Nombre de JPC vivants sur la map.
  jpcAliveCount() {
    let n = 0;
    try {
      for (const e of this.entries.values()) {
        if (e && e.jpc === true && e.hp > 0) n++;
      }
    } catch {}
    return n;
  }

  // Rotation horaire : à chaque nouvelle heure le nombre de JPC change
  // (nouveau roster seedé). Croissance = renforts immédiats (nouveaux bots,
  // uids uniques) ; décroissance = pas de respawn au-delà de la cible, les
  // bots en vie finissent leur fight (jamais de disparition en combat).
  jpcApplyHourBucket(nowMs) {
    let bucket = null;
    try { bucket = jpcHourBucket(nowMs); } catch { return; }
    if (bucket === this.jpcBucket) return;
    const first = this.jpcBucket == null;
    this.jpcBucket = bucket;
    const alive = this.jpcAliveCount();
    if (first) {
      // Première observation (sim construite à la main, hors factory) : la
      // population actuelle devient la référence, sans renforts surprises.
      try { this.jpcTarget = Math.max(Number(this.jpcTarget) || 0, alive); } catch {}
      return;
    }
    let want = 0;
    try { want = jpcRosterCount(this.mapId, nowMs); } catch { return; }
    if (!(want > 0)) return;
    this.jpcTarget = want;
    const missing = want - alive;
    if (missing <= 0) return;
    // Renforts : bots frais du nouveau roster (jamais d'écrasement d'uid :
    // suffixe d'heure, les anciens bots gardent les leurs ; pseudos uniques
    // face aux vivants, chaque JPC reste identifiable).
    let fresh = [];
    try {
      const livePseudos = new Set();
      for (const o of this.entries.values()) {
        if (o && o.jpc === true && o.hp > 0 && o.jpcPseudo) livePseudos.add(String(o.jpcPseudo));
      }
      fresh = buildJpcRoster(this.mapId, this.world, this.safe || [], this.walls || [], nowMs, livePseudos) || [];
    } catch {}
    const gen = (Number(this.jpcGen) || 0) + 1;
    this.jpcGen = gen;
    const defs = [];
    for (let i = 0; i < fresh.length && defs.length < missing; i++) {
      const def = fresh[i];
      if (!def) continue;
      defs.push({ ...def, uid: `${this.mapId}#jpcH${bucket}g${gen}-${i}` });
    }
    if (defs.length) {
      try { this.spawnJpcRoster(defs, nowMs); } catch {}
    }
  }

  // Proie revendiquée par un JPC vivant (il la farme) : pas de récompense
  // partagée — tuer le bot libère la proie (rouge + récompenses normales).
  jpcPreyClaimed(uid) {
    try {
      const key = String(uid || "");
      if (!key) return false;
      for (const o of this.entries.values()) {
        if (o && o.jpc === true && o.hp > 0 && o.jpcMode === "farm" && String(o.jpcPreyUid) === key) return true;
      }
    } catch {}
    return false;
  }

  // Position de (re)spawn JPC : aléatoire hors zones sûres et murs.
  jpcSpawnPos() {
    for (let i = 0; i < 40; i++) {
      const p = this.randomPos(300);
      if (this.inSafe(p.x, p.y)) continue;
      if (this.inWall(p.x, p.y, 30)) continue;
      return p;
    }
    return { x: this.world.w / 2, y: this.world.h / 2 };
  }

  entryAlive(uid) {
    if (uid == null) return null;
    const e = this.entries.get(String(uid));
    return e && e.hp > 0 ? e : null;
  }

  // Proie toujours valide ? Non si morte, trop loin, lockée par un joueur
  // ou reprise par un autre JPC (cible collante : on finit sa cible sinon).
  jpcPlayerOwnsPrey(prey) {
    if (prey.lockBy != null) return true;
    for (const p of this.players.values()) {
      if (!p.dead && p.lockedTarget === String(prey.uid)) return true;
    }
    return false;
  }

  jpcWallBanActive(e, uid) {
    try {
      const until = Number(e?.jpcWallBan?.[String(uid)] || 0);
      if (!(until > Date.now())) {
        if (until && e?.jpcWallBan) { try { delete e.jpcWallBan[String(uid)]; } catch {} }
        return false;
      }
      return true;
    } catch { return false; }
  }

  jpcNpcInWall(n) {
    try {
      if (!n) return false;
      return this.inWall(Number(n.x) || 0, Number(n.y) || 0, Math.max(0, Number(n.r) || 18));
    } catch { return false; }
  }

  // Stand façon bot Kill : 250 si passif, 120 si poursuite, sinon hors
  // portée NPC (jpcCombatDistance).
  jpcStandD(e, prey) {
    const fullD = jpcCombatDistance(e, prey);
    const canShoot = (Number(prey?.shootRange) || 0) > 0;
    let engaging = false;
    try {
      engaging = (prey?.jpcAggroUid === e.uid) || (prey?.aggroBy === e.uid);
    } catch { engaging = false; }
    if (engaging) e.jpcAggroId = prey.uid;
    if (!canShoot && engaging !== true && e.jpcAggroId !== prey.uid && e.jpcChaseId !== prey.uid) {
      return Math.min(fullD, 250);
    }
    const d = Math.hypot(Number(prey.x) - e.x, Number(prey.y) - e.y);
    if (!canShoot) {
      if (e.jpcCloseId !== prey.uid && d <= fullD + 60) e.jpcCloseId = prey.uid;
      let fleeing = false;
      if (e.jpcCloseId === prey.uid && d > 0.01) {
        if (d > fullD + 150) fleeing = true;
        else if (d > fullD + 60) {
          const rdx = Number(prey.x) - e.x, rdy = Number(prey.y) - e.y;
          const rvx = (Number(prey.vx) || 0) - (Number(e.vx) || 0);
          const rvy = (Number(prey.vy) || 0) - (Number(e.vy) || 0);
          if ((rvx * rdx + rvy * rdy) / Math.max(1, d) > 150) fleeing = true;
        }
      }
      if (fleeing) e.jpcChaseId = prey.uid;
      else if (e.jpcChaseId === prey.uid && d <= 120) e.jpcChaseId = null;
      if (e.jpcChaseId === prey.uid) return 120;
    }
    return fullD;
  }

  // Bouclier de l'adversaire (0..1) pour la formation de riposte : papillon
  // si gros bouclier, foreuse pour finir. null si inconnu (préférence du bot).
  jpcFoeShieldFrac(pid) {
    try {
      const p = this.players.get(String(pid));
      if (!p) return null;
      const pct = Number(p.shPct);
      if (Number.isFinite(pct)) return Math.max(0, Math.min(1, pct));
      const max = Number(p.shMax);
      if (!(max > 0)) return null;
      return Math.max(0, Math.min(1, (Number(p.sh) || 0) / max));
    } catch { return null; }
  }

  // Assaillants du bot : NPC au contact en plein combat (provoqué par lui
  // ou déjà accrochés — ça sent le surnombre, comme un vrai joueur).
  jpcFoeCount(e, maxD = 1200) {
    let n = 0;
    try {
      const lim2 = Math.max(0, Number(maxD) || 0) ** 2;
      const nowMs = Date.now();
      for (const o of this.entries.values()) {
        if (!o || o === e || !(Number(o.hp) > 0) || o.jpc === true) continue;
        if (!isJpcFarmable(o)) continue;
        const dx = Number(o.x) - Number(e.x), dy = Number(o.y) - Number(e.y);
        if (dx * dx + dy * dy > lim2) continue;
        if (o.jpcAggroUid === e.uid && nowMs < Number(o.jpcAggroUntil || 0)) { n++; continue; }
        if (o.chaseId != null || (o.aggroBy != null && nowMs < Number(o.aggroUntil || 0))) n++;
      }
    } catch {}
    return n;
  }

  jpcPreyValid(e) {
    // Cible collante façon vrai joueur : le bot garde sa proie même si un
    // joueur la locke à son tour (lock gris côté joueur, pas d'abandon).
    // Invalide seulement si morte/infarmable, trop loin, ou reprise par un
    // autre JPC. Le lock joueur n'est évité que pour les NOUVELLES proies
    // (jpcPickPrey, politesse anti-vol).
    try {
      const cur = e && e.jpcPreyUid != null ? this.entries.get(String(e.jpcPreyUid)) : null;
      if (!cur || !isJpcFarmable(cur)) return false;
      if (Math.hypot(Number(cur.x) - e.x, Number(cur.y) - e.y) > 3400) return false;
      if (this.jpcNpcInWall(cur)) return false;
      if (cur.uid != null && this.jpcWallBanActive(e, cur.uid)) return false;
      for (const o of this.entries.values()) {
        if (o && o !== e && o.hp > 0 && o.jpc === true && String(o.jpcPreyUid || "") === String(cur.uid)) return false;
      }
      return true;
    } catch { return false; }
  }

  // Proie JPC : NPC classique le plus proche (jamais cubi/emperor/invoke/
  // mind/strokelight, jamais un autre JPC). Légère prime aux petits PV.
  // Jamais la cible lockée d'un joueur, jamais la cible d'un autre JPC.
  // Comme le bot Kill : NPC dans un mur ignoré (pas de glitch).
  jpcPickPrey(e, maxD = 3400) {
    const taken = new Set();
    try {
      for (const o of this.entries.values()) {
        if (o && o !== e && o.hp > 0 && o.jpc === true && o.jpcPreyUid) taken.add(String(o.jpcPreyUid));
      }
    } catch {}    let best = null, bestScore = Infinity;
    const cands = [];
    const lim2 = maxD * maxD;
    for (const n of this.entries.values()) {
      if (!n || n === e || !(n.hp > 0) || n.jpc === true) continue;
      if (!isJpcFarmable(n)) continue;
      if (this.jpcPlayerOwnsPrey(n)) continue;
      if (taken.has(n.uid)) continue;
      if (this.jpcNpcInWall(n)) continue;
      if (this.jpcWallBanActive(e, n.uid)) continue;
      const dx = n.x - e.x, dy = n.y - e.y;
      const d2 = dx * dx + dy * dy;
      if (d2 > lim2) continue;
      cands.push({ n, d2 });
    }
    cands.sort((a, b) => a.d2 - b.d2);
    for (const { n, d2 } of cands.slice(0, 4)) {
      const score = Math.sqrt(d2) + (Number(n.hpMax) || 0) * 0.002 + Math.random() * 400;
      if (score < bestScore) { bestScore = score; best = n; }
    }
    return best ? best.uid : null;
  }

  // Mort d'une proie tuée par un JPC : pas de récompense joueur (killer
  // vide, filtré par queueNpcDeaths), pas de vague onKill.
  jpcKillPrey(prey, nowMs) {
    if (!prey) return;
    prey.hp = 0; prey.sh = 0;
    prey.deadAt = nowMs;
    prey.killer = "";
    prey.cause = "gun";
    try {
      if (prey.campId) markDead(this.universe, this.mapId, prey.uid, nowMs);
    } catch {}
    this.deaths.push({ uid: prey.uid, type: prey.type,
      x: Math.round(prey.x), y: Math.round(prey.y),
      killer: "", cause: "gun", seq: prey.seq || 0, at: nowMs });
  }

  // Mort d'un JPC (tué par un NPC) : respawn programmé dans 90 s
  // (anti-farm en boucle), nouvelle incarnation.
  jpcKillBot(e, nowMs) {
    if (!e) return;
    e.hp = 0; e.sh = 0;
    e.deadAt = nowMs;
    e.killer = "";
    e.cause = "gun";
    e.jpcRespawnAt = nowMs + JPC_RESPAWN_DELAY_S * 1000;
    this.deaths.push({ uid: e.uid, type: e.type,
      x: Math.round(e.x), y: Math.round(e.y),
      killer: "", cause: "gun", seq: e.seq || 0, at: nowMs });
  }

  // IEM claquant par les bots JPC : { playerId, npcUid, x, y }.
  drainIemBursts() {
    if (!this.iemBursts.length) return [];
    return this.iemBursts.splice(0, this.iemBursts.length);
  }

  drainShotFx() {
    if (!this.shotFx.length) return [];
    return this.shotFx.splice(0, this.shotFx.length);
  }

  // Visuels roquettes JPC (joués en rshot : arcs + fumée côté client).
  drainRocketFx() {
    if (!this.rocketFx.length) return [];
    return this.rocketFx.splice(0, this.rocketFx.length);
  }

  // Visuel de tir JPC<->NPC : seulement si un joueur peut le voir (2600).
  // miss : le MISS se voit sur la cible lockée (comme les tirs alliés).
  pushNpcShotFx(fromX, fromY, toX, toY, by, key, n, npc, tuid = null, miss = false) {
    try {
      for (const [, p] of this.players) {
        if (!p || p.dead) continue;
        const dx = Number(p.x) - fromX, dy = Number(p.y) - fromY;
        if (dx * dx + dy * dy > 2600 * 2600) continue;
        if (this.shotFx.length > 48) this.shotFx.shift();
        this.shotFx.push({ by: String(by || ""), x: Math.round(fromX), y: Math.round(fromY),
          tx: Math.round(toX), ty: Math.round(toY),
          key: String(key || "x4").slice(0, 16), n: Math.max(1, Math.min(2, Number(n) || 1)),
          npc: npc === true, tuid: tuid != null ? String(tuid) : null,
          miss: miss === true,
          jpcPart: npc !== true ? true : undefined,
          npcType: npc === true ? String(this.entries.get(String(by))?.type || "") : undefined });
        return;
      }
    } catch {}
  }

  // Déplacement + combat JPC (farm/fuite/repair/riposte). Retourne le
  // vecteur mouvement ; les dégâts aux NPC sont appliqués ici, les tirs
  // vers les joueurs passent par le pipeline générique (playerHits).
  // { mx, my, spd, dead }
  jpcMove(e, chase, dt, nowMs) {
    const dead = () => ({ mx: 0, my: 0, spd: 0, dead: true });
    let riposte = null;
    if (chase) {
      const p = this.players.get(String(chase.id));
      if (p && (this.validTarget(p) || this.retaliationOpen(e, chase.id, nowMs))) {
        riposte = { id: String(chase.id), x: Number(p.x) || 0, y: Number(p.y) || 0 };
      }
    }
    const maxTotal = Math.max(1, (Number(e.hpMax) || 1) + (Number(e.shMax) || 0));
    const total = Math.max(0, Number(e.hp) || 0) + Math.max(0, Number(e.sh) || 0);
    const frac = total / maxTotal;
    const hpFrac = (Number(e.hp) || 0) / Math.max(1, Number(e.hpMax) || 1);
    // Regen façon joueur : coque +5 %/s ET bouclier +5 %/s après 10 s sans
    // dégât (REPAIR). Sous le feu : rien ne remonte, même au portail.
    const lastHit = Number(e.lastHitAt) || 0;
    if (lastHit !== e.jpcLastHit) { e.jpcRepairTick = 0; e.jpcLastHit = lastHit; }
    tickJpcRepair(e, dt, (nowMs - lastHit) / 1000);
    // Chiffres +x de réparation façon vrai joueur (feed heal du snapshot,
    // affichés sur le bot locké uniquement, comme les dégâts alliés).
    try {
      const gainHp = Math.round(Number(e.jpcRepairGainHp) || 0);
      const gainSh = Math.round(Number(e.jpcRepairGainSh) || 0);
      if (gainHp > 0 || gainSh > 0) {
        const prev = this.healFeed.get(String(e.uid)) || { uid: String(e.uid), hp: 0, sh: 0 };
        prev.hp += gainHp;
        prev.sh += gainSh;
        this.healFeed.set(String(e.uid), prev);
      }
    } catch {}
    // Adresse au combat : 1-1 maladroite, 1-8/BL agressive (IEM/ISH/x6).
    const jSkill = Math.max(0, Math.min(1, Number(e.jpcSkill ?? 0.5)));
    // ISH de sauvetage sous 25 % (souvent ratée en 1-1, presque sûre en 1-8/BL).
    if (frac < 0.25 && nowMs >= Number(e.jpcIshUntil || 0) && nowMs >= Number(e.jpcIshAt || 0)) {
      if (Math.random() < 0.15 + 0.55 * jSkill) {
        e.jpcIshUntil = nowMs + 6000;
        if (e.jpcDrones) e.jpcDrones.formation = "turtle";
      }
      e.jpcIshAt = nowMs + 150000;
    }
    const ishing = nowMs < Number(e.jpcIshUntil || 0);
    // IEM en riposte : casse le lock du joueur (drainé par MULTI_SERVER).
    if (riposte && !ishing && nowMs >= Number(e.jpcIemAt || 0)) {
      const ddx = riposte.x - e.x, ddy = riposte.y - e.y;
      if (ddx * ddx + ddy * ddy < 1000 * 1000 && Math.random() < 0.2 + 0.5 * jSkill) {
        this.iemBursts.push({ playerId: riposte.id, npcUid: e.uid, x: Math.round(e.x), y: Math.round(e.y) });
      }
      e.jpcIemAt = nowMs + Math.round(150000 - 105000 * jSkill);
    }
    // Fenêtre x6 : salves fréquentes en 1-8/BL (~20-30 s), rares en 1-1 (~50-70 s).
    if (nowMs >= Number(e.jpcX6Until || 0) && nowMs >= Number(e.jpcX6At || 0)) {
      e.jpcX6Until = nowMs + 6000;
      e.jpcX6At = nowMs + (50000 - 30000 * jSkill) + Math.random() * (20000 - 10000 * jSkill);
    }
    // Formation cohérente façon vrai joueur : fixe par rôle (pas de tirage
    // aléatoire en plein combat). Farm/voyage affinés plus bas, quand la
    // proie est connue ; ici on pose fuite / riposte. En réparation on ne
    // touche à rien (il garde sa formation, pas de switch robotique).
    if (!ishing && e.jpcDrones) {
      try {
        let formation = null;
        if (riposte) formation = jpcRiposteFormation(e, this.jpcFoeShieldFrac(riposte.id));
        else if (e.jpcMode === "flee") formation = jpcRoleFormation(e, "flee");
        else if (e.jpcMode !== "repair") formation = jpcRoleFormation(e, "travel");
        if (formation) e.jpcDrones.formation = formation;
      } catch {}
    }
    // Fuite / réparation comme un vrai joueur (déclencheur coque).
    // SAUF en riposte : on se bat jusqu'à la mort, jamais de fuite quand
    // c'est un joueur qui nous tape (on annule même un repli en cours).
    if (riposte && (e.jpcMode === "flee" || e.jpcMode === "repair")) {
      e.jpcMode = "farm";
      e.jpcSafeX = null; e.jpcSafeY = null;
      e.jpcVisualParts = [];
    }
    // Seuil variable (courage du bot + surnombre) : on tente parfois à 10 %
    // seul, on fuit à 60 %+ quand ça sent le surnombre, comme un vrai joueur.
    const fleeAt = jpcFleeThreshold(e, this.jpcFoeCount(e));
    if (e.jpcMode !== "repair" && e.jpcMode !== "flee" && (frac < fleeAt || hpFrac < fleeAt) && !ishing && !riposte) {
      e.jpcMode = "flee";
      e.jpcPreyUid = null;
      e.jpcVisualParts = [];
      e.jpcSafeX = null;
      e.jpcMullUntil = 0; e.jpcMulling = false;
    }
    if (e.jpcMode === "flee" || e.jpcMode === "repair") {
      if (e.jpcSafeX == null) {
        // Comme le bot du joueur : refuge choisi par son bord (le plus
        // proche). Place de parking propre sur l'anneau (angle stable par
        // uid) : fini l'agglutinement au même point.
        let bx = this.world.w / 2, by = this.world.h / 2, br = 500, bestEdge = Infinity;
        for (const z of this.safe || []) {
          const cx = Number(z.x), cy = Number(z.y), r = Number(z.r) || 0;
          const dx = e.x - cx, dy = e.y - cy;
          const edge = Math.max(0, Math.hypot(dx, dy) - r);
          if (edge < bestEdge) { bestEdge = edge; bx = cx; by = cy; br = r || 500; }
        }
        const spot = jpcParkingSpot(e, bx, by, br, this.world);
        e.jpcSafeX = spot.x;
        e.jpcSafeY = spot.y;
      }
      // Comme le bot du joueur : on va jusqu'au point proche du centre
      // (35 m), on ne s'arrête pas au bord de la zone sûre.
      if (Math.hypot(e.x - e.jpcSafeX, e.y - e.jpcSafeY) <= 35) e.jpcMode = "repair";
      if (e.jpcMode === "repair") {
        if (frac >= 0.999 && hpFrac >= 0.99) {
          // Réparé : on glandouille encore 5-15 s au portail (comme un vrai
          // joueur) avant de repartir farmer.
          if (!e.jpcMulling) {
            e.jpcMulling = true;
            e.jpcMullUntil = nowMs + 5000 + Math.random() * 10000;
          }
          if (nowMs < Number(e.jpcMullUntil || 0)) {
            return { mx: 0, my: 0, spd: 0 };
          }
          e.jpcMode = "farm";
          e.jpcSafeX = null;
          e.jpcPreyUid = null;
          e.jpcMulling = false; e.jpcMullUntil = 0;
        } else {
          // Au portail : on attend la regen façon joueur (globale ci-dessus).
          e.jpcMulling = false;
          return { mx: 0, my: 0, spd: 0 };
        }
      } else {
        return this.jpcSeek(e, e.jpcSafeX, e.jpcSafeY, dt, 0.3);
      }
    }
    // Farm façon bot Kill : cible collante, kiting au standD (hors portée
    // NPC / 250 passif / 120 poursuite), approche silencieuse + tir à portée,
    // scan post-kill 1.5 s comme le vrai bot.
    // Riposte agressive : orbit resserrée (on colle à 450 m) à vitesse de
    // poursuite (+25 %, comme un changement de config rapide).
    if (riposte) {
      e.jpcPreyUid = null;
      const keepSpd = e.speed;
      e.speed = Math.min((Number(keepSpd) || 300) * 1.25, 450);
      const mv = this.jpcOrbit(e, riposte.x, riposte.y, 0, dt, Math.min(jpcCombatDistance(e, riposte), 450));
      e.speed = keepSpd;
      return mv;
    }
    if (!this.jpcPreyValid(e)) {
      if (e.jpcPreyUid != null) e.jpcPostKillAt = nowMs;
      e.jpcPreyUid = null;
    }
    if (!this.entryAlive(e.jpcPreyUid)) {
      // Pause entre deux kills (30 % on enchaîne, sinon 1-10 s de balade
      // comme un vrai joueur) : pendant ce temps on patrouille ci-dessous.
      if (nowMs >= Number(e.jpcBreatherUntil || 0)) {
        let picked = null;
        if (nowMs - Number(e.jpcPostKillAt || 0) < 1500) {
          picked = this.jpcPickPrey(e, Math.max(2200, jpcEngageRange(e) * 3));
        }
        e.jpcPreyUid = picked || this.jpcPickPrey(e);
      } else {
        e.jpcPreyUid = null;
      }
    }
    const prey = this.entryAlive(e.jpcPreyUid);
    let move = null;
    // Rôle farm (proie) ou voyage (patrouille), sauf bulle ISH (turtle).
    if (!ishing && e.jpcDrones) {
      try { e.jpcDrones.formation = jpcRoleFormation(e, prey ? "farm" : "travel"); } catch {}
    }
    if (prey) {
      if (this.jpcNpcInWall(prey)) {
        e.jpcWallBan ||= {};
        e.jpcWallBan[String(prey.uid)] = Date.now() + 8000;
        e.jpcPreyUid = null;
        return this.jpcSeek(e, e.x, e.y, dt);
      }
      const dx = prey.x - e.x, dy = prey.y - e.y;
      const d = Math.hypot(dx, dy) || 1;
      const standD = this.jpcStandD(e, prey);
      // Kiting partout (approche + orbit) : jamais de charge au centre.
      move = this.jpcOrbit(e, prey.x, prey.y, d, dt, standD);
      if (d <= Math.min(1400, Math.max(80, jpcEngageRange(e)))) {
        e.angle = Math.atan2(prey.y - e.y, prey.x - e.x);
      }
      // Tir UNIQUEMENT à portée (hors portée = approche silencieuse).
      // Maladresse : le coup peut rater (le NPC remarque quand même).
      if (!ishing && nowMs >= Number(e.jpcShootT || 0) && d <= jpcEngageRange(e)
        && nowMs >= Number(e.freezeUntil || 0) && nowMs >= Number(e._redirectSilenceUntil || 0)) {
        e.jpcShootT = nowMs + JPC_LASER.interval * 1000;
        const bursting = nowMs < Number(e.jpcX6Until || 0);
        const missed = Math.random() < jpcMissChance(e.jpcSkill);
        const dmg = Math.max(1, Math.round(Number(e.bulletDmg || 500) * (bursting ? 1.5 : 1) * jpcFarmDmgMult(this.mapId) * (0.9 + Math.random() * 0.2)));
        if (!missed) {
          try {
            damageEnemyLayers(prey, dmg, { shieldPenetration: 0.15, shieldSpread: prey.spread ?? 0.8,
              variance: 0.1, critChance: 0.05, critMultiplier: 1.5, random: Math.random });
            // Feed dégâts : les chiffres s'affichent pour qui locke la proie.
            try {
              const key = `${prey.uid}|${e.uid}`;
              this.feed.set(key, { uid: prey.uid, by: e.uid, total: Math.round((this.feed.get(key)?.total || 0) + dmg) });
            } catch {}
          } catch {}
        }
        try {
          // Provocation : la proie aggro le bot comme un vrai joueur.
          prey.jpcAggroUid = e.uid;
          prey.jpcAggroUntil = nowMs + 6000;
          // Visuel bleu façon joueur, TOUJOURS en x1 (canal des tirs alliés).
          // Le MISS suit pour s'écrire sur la cible lockée (comme en solo).
          try {
            this.jpcStartVolley(e, prey.uid, false, nowMs, "x1", missed);
          } catch {}
        } catch {}
        if (!(prey.hp > 0)) { this.jpcKillPrey(prey, nowMs); e.jpcPreyUid = null; e.jpcBreatherUntil = nowMs + rollJpcBreather() * 1000; }
      }
      // Roquette standard toutes les secondes, comme les vrais joueurs
      // (mêmes conditions de tir que les lasers).
      if (prey.hp > 0 && !ishing && d <= jpcEngageRange(e)
        && nowMs >= Number(e.freezeUntil || 0) && nowMs >= Number(e._redirectSilenceUntil || 0)
        && nowMs >= Number(e.jpcRocketAt || 0)) {
        e.jpcRocketAt = nowMs + 1000;
        this.jpcFireRocket(e, prey, false, nowMs);
      }
      // La défense de la proie passe par sa vraie aggro (pipeline générique
      // + shotFx rouges) : pas de double dégât scripté ici.
    } else {
      // Rien à farmer : patrouille façon vrai joueur — cap lointain
      // (2500 m min), gardé jusqu'à l'arrivée : grandes lignes droites.
      if (e.tx == null || Math.hypot(e.tx - e.x, e.ty - e.y) < 100) {
        e.tx = clamp(120 + Math.random() * Math.max(240, this.world.w - 240), 80, this.world.w - 80);
        e.ty = clamp(120 + Math.random() * Math.max(240, this.world.h - 240), 80, this.world.h - 80);
        for (let i = 0; i < 6 && Math.hypot(e.tx - e.x, e.ty - e.y) < 2500; i++) {
          e.tx = clamp(120 + Math.random() * Math.max(240, this.world.w - 240), 80, this.world.w - 80);
          e.ty = clamp(120 + Math.random() * Math.max(240, this.world.h - 240), 80, this.world.h - 80);
        }
      }
      move = this.jpcSeek(e, e.tx, e.ty, dt, 1);
      // Regen : uniquement via la règle globale façon joueur (10 s sans dégât).
    }
    // Riposte : orbite le joueur agresseur (prioritaire, sauf en fuite).
    // Agressive : orbit resserrée (on colle) à vitesse de poursuite (+25 %),
    // formation lue sur son bouclier.
    if (riposte && e.jpcMode !== "flee" && e.jpcMode !== "repair") {
      const dx = riposte.x - e.x, dy = riposte.y - e.y;
      const d = Math.hypot(dx, dy) || 1;
      const keepSpd = e.speed;
      e.speed = Math.min((Number(keepSpd) || 300) * 1.25, 450);
      move = this.jpcOrbit(e, riposte.x, riposte.y, d, dt, Math.min(jpcCombatDistance(e, riposte), 450));
      e.speed = keepSpd;
      e.angle = Math.atan2(dy, dx);
      if (!ishing && e.jpcDrones) {
        try { e.jpcDrones.formation = jpcRiposteFormation(e, this.jpcFoeShieldFrac(riposte.id)); } catch {}
      }
    }
    return move || { mx: 0, my: 0, spd: 0 };
  }

  // Roquette standard façon vrai joueur : dégâts + visuel rshot (arc +
  // fumée côté client). Farm (NPC) : dégâts directs ; riposte (joueur) :
  // playerHits. Jamais d'effets spéciaux — dégâts + visuels seuls.
  jpcFireRocket(e, target, toPlayer, nowMs) {
    const rocketId = String(e.jpcRockets?.standard || "r310").toLowerCase();
    const tierIdx = Number(e.jpcTier ?? 1);
    // Maladresse : le coup peut rater (visuel part quand même).
    const missed = Math.random() < jpcMissChance(e.jpcSkill);
    const mult = toPlayer ? jpcRiposteMultForSkill(e.jpcSkill) : 1;
    const dmg = Math.max(1, Math.round(jpcRocketDamage(rocketId, tierIdx) * mult * (0.9 + Math.random() * 0.2)));
    if (toPlayer) {
      if (!missed) {
        this.playerHits.push({ playerId: String(target.id), npcUid: e.uid, damage: dmg, kind: "rocket" });
      }
    } else {
      if (!missed) {
        try {
          damageEnemyLayers(target, dmg, { shieldPenetration: 0.15, shieldSpread: target.spread ?? 0.8,
            variance: 0.1, critChance: 0.05, critMultiplier: 1.5, random: Math.random });
          try {
            const key = `${target.uid}|${e.uid}`;
            this.feed.set(key, { uid: target.uid, by: e.uid, total: Math.round((this.feed.get(key)?.total || 0) + dmg) });
          } catch {}
        } catch {}
      }
      try {
        target.jpcAggroUid = e.uid;
        target.jpcAggroUntil = nowMs + 6000;
      } catch {}
      if (!(target.hp > 0)) { this.jpcKillPrey(target, nowMs); e.jpcPreyUid = null; e.jpcBreatherUntil = nowMs + rollJpcBreather() * 1000; return; }
    }
    try { this.jpcPushRocketFx(e, target, rocketId, missed); } catch {}
  }

  jpcPushRocketFx(e, target, rocketId, miss) {
    const fx = Number(e.x), fy = Number(e.y);
    const tx = Number(target.x), ty = Number(target.y);
    const d = Math.hypot(tx - fx, ty - fy) || 1;
    const spd = Math.max(500, 900 + d * 1.1);
    if (this.rocketFx.length > 48) this.rocketFx.shift();
    this.rocketFx.push({
      by: String(e.uid || ""), kind: String(rocketId || "r310").slice(0, 16),
      x: Math.round(fx), y: Math.round(fy),
      ang: Math.round(Math.atan2(ty - fy, tx - fx) * 100) / 100,
      tx: Math.round(tx), ty: Math.round(ty), spd: Math.round(spd),
      arcDir: Math.random() < 0.5 ? -1 : 1,
      arcScale: 1, arcBoost: 15, prange: 700, miss: miss === true,
      v: (e.jpcRocketSeq = (Number(e.jpcRocketSeq) || 0) + 1),
    });
  }

  jpcStartVolley(e, targetId, playerTarget, nowMs, key = "x1", miss = false) {
    const pair = e.jpcAltShot === true;
    e.jpcAltShot = !pair;
    const ammo = String(key || "x1").toLowerCase();
    e.jpcVisualParts = [...(e.jpcVisualParts || []), ...jpcVolleyParts(pair).map(part => ({
      at: nowMs + part.delay * 1000, n: part.offsets.length,
      targetId: String(targetId), playerTarget, seq: e.seq, key: ammo,
      miss: miss === true,
    }))];
  }

  jpcTickVisuals(e, nowMs) {
    e.jpcVisualParts = (e.jpcVisualParts || []).filter(part => {
      if (part.at > nowMs) return true;
      const target = part.playerTarget ? this.players.get(part.targetId) : this.entryAlive(part.targetId);
      if (!target || target.dead || e.seq !== part.seq || nowMs < Number(e.jpcIshUntil || 0)
        || nowMs < Number(e.freezeUntil || 0) || nowMs < Number(e._redirectSilenceUntil || 0)) return false;
      // Le bot garde sa proie même lockée par un joueur (lock gris) : les
      // visuels continuent, comme deux vrais joueurs sur le même NPC.
      // La munition suit le tir réel (x1 farm, x4/x6 riposte).
      if (!part.playerTarget && (e.jpcPreyUid !== part.targetId || e.jpcMode !== "farm")) return false;
      if (part.playerTarget && String(e.chaseId || "") !== part.targetId) return false;
      this.pushNpcShotFx(e.x, e.y, target.x, target.y, e.uid, part.key || "x1", part.n, false, part.targetId, part.miss === true);
      return false;
    });
  }

  jpcSeek(e, tx, ty, dt, human = 0) {
    return jpcTravel(e, tx, ty, dt, this.world, this.walls || [], { human });
  }

  jpcOrbit(e, tx, ty, d, dt, standD = null) {
    return jpcCombatMove(e, { x: tx, y: ty }, dt, this.world, this.walls || [], standD);
  }


drainPlayerHits() {
    if (!this.playerHits.length) return [];
    return this.playerHits.splice(0, this.playerHits.length);
  }

  // Camouflages dissipés par les halos Mindfire : { playerId, npcUid }.
  drainDecloaks() {
    if (!this.decloaks || !this.decloaks.length) return [];
    return this.decloaks.splice(0, this.decloaks.length);
  }

  // --- Vague Cubikon partagee (parite solo, visible par tous) ---
  // Le premier impact sur un Cubikon declenche son animation d'ouverture
  // (delay 2 s -> open -> hold 2 s) puis le serveur fait apparaitre 20
  // Protegits ancres au Cubikon. Sans nouveau coup pendant 15 s, les
  // minions sont retires silencieusement et la vague est re-armee.
  static CUBIKON_WAVE_SIZE = 20;
  static CUBIKON_WAVE_MAX = 20;

  // --- Lock premier attaquant (visuel rouge / gris) ---
  // Le détenteur garde le rouge tant qu'il inflige des dégâts, reste en vie
  // et hors ZNA. Sinon grace de 5 s (un nouveau dégât du détenteur l'annule,
  // "re bon"), puis TRANSFERT AUTO au prétendant le plus récent (un autre
  // attaquant qui engage le NPC, hit ≤ 5 s) : pas besoin de taper pour
  // passer rouge. firstBy suit pour que la récompense aille au rouge.
  // Le transfert est "non confirmé" (lockHitAt = 0) : le nouveau détenteur
  // doit taper pour confirmer ; sinon n'importe quel hit le lui reprend
  // instantanément (ex : l'ancien qui re-tape). Pas de ping-pong : le voleur
  // est toujours confirmé + frais, le vol suivant exige 5 s de silence.
  static LOCK_IDLE_MS = 5000;
  static LOCK_GRACE_MS = 5000;
  static LOCK_HISTORY_MAX = 6;

  // Mémorise le hit (ordre = récence). Appelé pour tout impact accepté.
  static lockNoteHit(entry, clientId, nowMs) {
    const id = String(clientId);
    const h = Array.isArray(entry.hitHist) ? entry.hitHist : (entry.hitHist = []);
    for (let i = h.length - 1; i >= 0; i--) {
      if (String(h[i]?.id) === id) h.splice(i, 1);
    }
    h.push({ id, at: nowMs });
    while (h.length > ZoneNpcSim.LOCK_HISTORY_MAX) h.shift();
  }

  // Prétendant au transfert : attaquant le plus récent (hit ≤ 5 s, connecté),
  // hors détenteur sortant. null = personne : le lock devient libre.
  static lockContender(entry, excludeId, nowMs, players) {
    const h = Array.isArray(entry.hitHist) ? entry.hitHist : [];
    for (let i = h.length - 1; i >= 0; i--) {
      const c = h[i];
      if (!c || String(c.id) === String(excludeId)) continue;
      if (nowMs - Number(c.at || 0) > ZoneNpcSim.LOCK_IDLE_MS) continue;
      if (!players.has(String(c.id))) continue;
      return String(c.id);
    }
    return null;
  }

  countCubikonMinions(cubUid) {
    let n = 0;
    for (const e of this.entries.values()) {
      if (e && e.masterUid === cubUid && e.hp > 0) n++;
    }
    return n;
  }

  refillCubikonMinions(cub, nowMs) {
    if (nowMs < Number(cub?.jamUntil || 0)) return;
    if (cub?.type !== "npc_Cubikon" || !(cub.hp > 0) || !cub.cubeArmed || cub.cube) return;
    if (nowMs - Number(cub.lastCubeHitAt || 0) > 15000) return;
    if (this.countCubikonMinions(cub.uid) < 5) {
      cub.cube = { phase: "delay", until: nowMs + 2000, spawnAt: nowMs + 4600 };
    }
  }

  spawnCubikonWave(cub, nowMs) {
    if (nowMs < Number(cub?.jamUntil || 0)) return;
    if (!cub || !(cub.hp > 0)) return;
    const stats = statsFor("npc_Protegit");
    if (!stats) return;
    const linked = this.countCubikonMinions(cub.uid);
    const toSpawn = Math.min(
      ZoneNpcSim.CUBIKON_WAVE_SIZE,
      Math.max(0, ZoneNpcSim.CUBIKON_WAVE_MAX - linked)
    );
    for (let i = 0; i < toSpawn; i++) {
      const ang = Math.random() * TAU;
      const dist = 130 + Math.random() * 520;
      const n = (cub.minionSeq = (Number(cub.minionSeq) || 0) + 1);
      const uid = `${cub.uid}:pg${n}`;
      // Seq unique meme entre deux vies du Cubikon (respawn = meme uid) :
      // le client ne confond jamais deux incarnations (recompenses, locks).
      const seq = n + (Number(cub.seq) || 0) * 100000;
      const x = clamp(cub.x + Math.cos(ang) * dist, 80, this.world.w - 80);
      const y = clamp(cub.y + Math.sin(ang) * dist, 80, this.world.h - 80);
      this.entries.set(uid, {
        uid, campId: null, type: "npc_Protegit",
        masterUid: cub.uid, masterSeq: Number(cub.seq) || 0,
        x, y, angle: Math.random() * TAU,
        hp: stats.hpMax, sh: stats.shMax,
        hpMax: stats.hpMax, shMax: stats.shMax,
        speed: stats.speed, dr: stats.dr, spread: stats.spread,
        passive: false, kamikaze: false,
        explodeOnTouch: false, explodeRadius: 0, explodeDmg: 0,
        canShoot: stats.canShoot, shootRange: stats.shootRange, shootRate: stats.shootRate,
        bulletDmg: stats.bulletDmg, burst: stats.burst, shootCd: 0.1 + Math.random() * 0.3,
        // Minion de Cubikon : plus agressif que la normale (détection élargie,
        // tient l'aggro plus longtemps), mais toujours ancré au Cubikon.
        aggroRange: 1000, aggroHoldMs: 6000,
        aggroBy: null, aggroUntil: 0,
        tx: null, ty: null, killer: null, firstBy: null, lastHitBy: null,
        lockBy: null, lockHitAt: 0, lockReleaseAt: 0, hitHist: [],
        masterKiller: null, decaying: false, decayPerSec: 0, decayAge: 0,
        fleeVx: 0, fleeVy: 0, deadAt: 0,
        orbitDir: Math.random() < 0.5 ? -1 : 1, orbitT: 2 + Math.random() * 3,
        seq,
      });
    }
  }

  // Vague onKill partagee (parite solo) : a la mort d'un NPC dont le type
  // declare onKill.spawn (ex : Blighted Kristallon -> 3 Blighted
  // Gygerthrall), le serveur fait apparaitre les renforts pour TOUS les
  // joueurs. Sans ca, chaque ecran fabriquait ses propres fantomes locaux
  // (invisibles aux autres, recompenses locales = farm infini).
  // Les renforts sont independants (pas d'ancre) : ils chassent comme les
  // autres NPC. Plafond de securite : 200 entites hors-camp vivantes / map.
  static WAVELESS_MAX = 200;

  countCamplessAlive() {
    let n = 0;
    for (const e of this.entries.values()) {
      if (e && e.campId == null && e.jpc !== true && e.hp > 0) n++;
    }
    return n;
  }

  spawnOnKillWave(dead, nowMs) {
    if (nowMs < Number(dead?.jamUntil || 0)) return;
    if (!dead || !(dead.hp <= 0)) return;
    const cfg = NPC_TYPES[dead.type];
    const spawns = cfg?.onKill?.spawn;
    if (!Array.isArray(spawns) || !spawns.length) return;
    // Credit du kill parent pour le journal : premier attaquant, sinon tueur.
    // (Les renforts eux-memes creditent leur propre tueur via firstBy.)
    for (const s of spawns) {
      const type = String(s?.type || "");
      const stats = statsFor(type);
      if (!type || !stats) continue;
      const count = Math.max(1, Math.min(15, Math.floor(Number(s?.count) || 1)));
      const radius = Math.max(40, Number(s?.radius) || 260);
      for (let i = 0; i < count; i++) {
        if (this.countCamplessAlive() >= ZoneNpcSim.WAVELESS_MAX) return;
        const ang = Math.random() * TAU;
        const dist = 60 + Math.random() * radius;
        const seq = (this.waveSeq = (Number(this.waveSeq) || 0) + 1) + (Number(dead.seq) || 0) * 100000;
        const uid = `${this.mapId}#wave${Number(this.waveSeq) || 0}`;
        const x = clamp(dead.x + Math.cos(ang) * dist, 80, this.world.w - 80);
        const y = clamp(dead.y + Math.sin(ang) * dist, 80, this.world.h - 80);
        this.entries.set(uid, {
          uid, campId: null, type,
          masterUid: null, masterSeq: 0,
          x, y, angle: Math.random() * TAU,
          hp: stats.hpMax, sh: stats.shMax,
          hpMax: stats.hpMax, shMax: stats.shMax,
          speed: stats.speed, dr: stats.dr, spread: stats.spread,
          passive: !!stats.passive, kamikaze: !!stats.kamikaze,
          explodeOnTouch: !!stats.explodeOnTouch, explodeRadius: stats.explodeRadius, explodeDmg: stats.explodeDmg,
          canShoot: stats.canShoot, shootRange: stats.shootRange, shootRate: stats.shootRate,
          bulletDmg: stats.bulletDmg, burst: stats.burst, shootCd: 0.2 + Math.random() * 0.5,
          aggroRange: 700, aggroHoldMs: 3500,
          aggroBy: null, aggroUntil: 0,
          tx: null, ty: null, killer: null, firstBy: null, lastHitBy: null,
          lockBy: null, lockHitAt: 0, lockReleaseAt: 0, hitHist: [],
          masterKiller: null, decaying: false, decayPerSec: 0, decayAge: 0,
          fleeVx: 0, fleeVy: 0, deadAt: 0,
          orbitDir: Math.random() < 0.5 ? -1 : 1, orbitT: 2 + Math.random() * 3,
          seq,
        });
      }
    }
  }

  // Mindfire Behemoth : 2 Attend IX à 75 % / 50 % / 25 % de durabilité.
  // Non bloquant : le Mindfire reste vulnérable, les Attend sont indépendants.
  checkMindfireWaves(entry, nowMs) {
    if (nowMs < Number(entry?.jamUntil || 0)) return;
    if (!entry || String(entry.type || "") !== "npc_Mindfire_Behemoth" || !(entry.hp > 0)) return;
    const max = Math.max(0, Number(entry.hpMax) || 0) + Math.max(0, Number(entry.shMax) || 0);
    if (!(max > 0)) return;
    const frac = (Math.max(0, Number(entry.hp) || 0) + Math.max(0, Number(entry.sh) || 0)) / max;
    entry.mindWaves ||= {};
    const stats = statsFor("npc_Attend_IX");
    if (!stats) return;
    for (const [threshold, key] of [[0.75, "p75"], [0.50, "p50"], [0.25, "p25"]]) {
      if (frac <= threshold && !entry.mindWaves[key]) {
        entry.mindWaves[key] = true;
        for (let i = 0; i < 2; i++) {
          if (this.countCamplessAlive() >= ZoneNpcSim.WAVELESS_MAX) return;
          const ang = Math.random() * TAU;
          const dist = 60 + Math.random() * 400;
          const seq = (this.waveSeq = (Number(this.waveSeq) || 0) + 1) + (Number(entry.seq) || 0) * 100000;
          const uid = `${this.mapId}#wave${Number(this.waveSeq) || 0}`;
          const x = clamp(Number(entry.x) + Math.cos(ang) * dist, 80, this.world.w - 80);
          const y = clamp(Number(entry.y) + Math.sin(ang) * dist, 80, this.world.h - 80);
          this.entries.set(uid, {
            uid, campId: null, type: "npc_Attend_IX",
            masterUid: null, masterSeq: 0,
            x, y, angle: Math.random() * TAU,
            hp: stats.hpMax, sh: stats.shMax,
            hpMax: stats.hpMax, shMax: stats.shMax,
            speed: stats.speed, dr: stats.dr, spread: stats.spread,
            passive: !!stats.passive, kamikaze: !!stats.kamikaze,
            explodeOnTouch: !!stats.explodeOnTouch, explodeRadius: stats.explodeRadius, explodeDmg: stats.explodeDmg,
            canShoot: stats.canShoot, shootRange: stats.shootRange, shootRate: stats.shootRate,
            bulletDmg: stats.bulletDmg, burst: stats.burst, shootCd: 0.2 + Math.random() * 0.5,
            aggroRange: 700, aggroHoldMs: 3500,
            aggroBy: null, aggroUntil: 0,
            tx: null, ty: null, killer: null, firstBy: null, lastHitBy: null,
            lockBy: null, lockHitAt: 0, lockReleaseAt: 0, hitHist: [],
            masterKiller: null, decaying: false, decayPerSec: 0, decayAge: 0,
            fleeVx: 0, fleeVy: 0, deadAt: 0,
            orbitDir: Math.random() < 0.5 ? -1 : 1, orbitT: 2 + Math.random() * 3,
            seq,
          });
        }
      }
    }
  }

  // Invoke XVI : 7 Impulse II au premier dégât, une seule fois par incarnation.
  // Non bloquant : l'Invoke reste vulnérable, les Impulse sont indépendants.
  spawnInvokeImpulse(entry, nowMs) {
    if (nowMs < Number(entry?.jamUntil || 0)) return;
    if (!entry) return;
    const stats = statsFor("npc_Impulse_II");
    if (!stats) return;
    for (let i = 0; i < 7; i++) {
      if (this.countCamplessAlive() >= ZoneNpcSim.WAVELESS_MAX) return;
      const ang = Math.random() * TAU;
      const dist = 60 + Math.random() * 400;
      const seq = (this.waveSeq = (Number(this.waveSeq) || 0) + 1) + (Number(entry.seq) || 0) * 100000;
      const uid = `${this.mapId}#wave${Number(this.waveSeq) || 0}`;
      const x = clamp(Number(entry.x) + Math.cos(ang) * dist, 80, this.world.w - 80);
      const y = clamp(Number(entry.y) + Math.sin(ang) * dist, 80, this.world.h - 80);
      this.entries.set(uid, {
        uid, campId: null, type: "npc_Impulse_II",
        masterUid: null, masterSeq: 0,
        x, y, angle: Math.random() * TAU,
        hp: stats.hpMax, sh: stats.shMax,
        hpMax: stats.hpMax, shMax: stats.shMax,
        speed: stats.speed, dr: stats.dr, spread: stats.spread,
        passive: !!stats.passive, kamikaze: !!stats.kamikaze,
        explodeOnTouch: !!stats.explodeOnTouch, explodeRadius: stats.explodeRadius, explodeDmg: stats.explodeDmg,
        canShoot: stats.canShoot, shootRange: stats.shootRange, shootRate: stats.shootRate,
        bulletDmg: stats.bulletDmg, burst: stats.burst, shootCd: 0.2 + Math.random() * 0.5,
        aggroRange: 700, aggroHoldMs: 3500,
        aggroBy: null, aggroUntil: 0,
        tx: null, ty: null, killer: null, firstBy: null, lastHitBy: null,
        lockBy: null, lockHitAt: 0, lockReleaseAt: 0, hitHist: [],
        masterKiller: null, decaying: false, decayPerSec: 0, decayAge: 0,
        fleeVx: 0, fleeVy: 0, deadAt: 0,
        orbitDir: Math.random() < 0.5 ? -1 : 1, orbitT: 2 + Math.random() * 3,
        seq,
      });
    }
  }

  // Strokelight Barrage : 1 Barrage Seeker Rocket verrouillée sur l'agresseur.
  spawnBarrageRocket(entry, nowMs) {
    if (!entry || !(entry.hp > 0)) return;
    const stats = statsFor("npc_Barrage_Seeker_Rocket");
    if (!stats) return;
    if (this.countCamplessAlive() >= ZoneNpcSim.WAVELESS_MAX) return;
    const ang = Math.random() * TAU;
    const dist = 60 + Math.random() * 120;
    const seq = (this.waveSeq = (Number(this.waveSeq) || 0) + 1) + (Number(entry.seq) || 0) * 100000;
    const uid = `${this.mapId}#wave${Number(this.waveSeq) || 0}`;
    const x = clamp(Number(entry.x) + Math.cos(ang) * dist, 80, this.world.w - 80);
    const y = clamp(Number(entry.y) + Math.sin(ang) * dist, 80, this.world.h - 80);
    const target = this.players.has(String(entry.lastHitBy)) ? String(entry.lastHitBy) : null;
    this.entries.set(uid, {
      uid, campId: null, type: "npc_Barrage_Seeker_Rocket",
      masterUid: null, masterSeq: 0,
      x, y, angle: Math.random() * TAU,
      hp: stats.hpMax, sh: stats.shMax,
      hpMax: stats.hpMax, shMax: stats.shMax,
      speed: stats.speed, dr: stats.dr, spread: stats.spread,
      passive: false, kamikaze: !!stats.kamikaze,
      explodeOnTouch: !!stats.explodeOnTouch, explodeRadius: stats.explodeRadius, explodeDmg: stats.explodeDmg,
      canShoot: false, shootRange: stats.shootRange, shootRate: 0,
      bulletDmg: 0, burst: stats.burst, shootCd: 0,
      aggroRange: 8000, aggroHoldMs: 3600000,
      aggroBy: target, aggroUntil: target ? nowMs + 3600000 : 0,
      tx: null, ty: null, killer: null, firstBy: null, lastHitBy: null,
      lockBy: null, lockHitAt: 0, lockReleaseAt: 0, hitHist: [],
      masterKiller: null, decaying: false, decayPerSec: 0, decayAge: 0,
      fleeVx: 0, fleeVy: 0, deadAt: 0,
      orbitDir: Math.random() < 0.5 ? -1 : 1, orbitT: 2 + Math.random() * 3,
      seq,
    });
  }

  // A la mort du Cubikon, ses Protegits fuient en ligne droite pendant 3 s
  // puis errent comme les autres NPC (agro + tirs) tout en continuant de
  // perdre 5 % de leur vie max par seconde, meme sous le feu ennemi.
  releaseCubikonMinions(cub, nowMs) {
    if (!cub) return;
    const killer = cub.killer != null ? String(cub.killer) : null;
    for (const e of this.entries.values()) {
      if (!e || e.masterUid !== cub.uid || !(e.hp > 0) || e.decaying) continue;
      const fleeAngle = Math.random() * TAU;
      const fleeSpeed = Math.max(650, Number(e.speed) || 650);
      e.decaying = true;
      e.decayPerSec = Math.max(1, Number(e.hpMax) || 1) * 0.05;
      e.decayAge = 0;
      e.masterKiller = killer;
      e.aggroBy = null;
      e.aggroUntil = 0;
      e.pendingAggroBy = null;
      e.chaseId = null;
      e.fleeVx = Math.cos(fleeAngle) * fleeSpeed;
      e.fleeVy = Math.sin(fleeAngle) * fleeSpeed;
      e.angle = fleeAngle;
    }
  }

  applyHit(clientId, hit) {
    const uid = String(hit?.uid || "");
    const entry = this.entries.get(uid);
    if (!entry || !(entry.hp > 0)) return;
    // Bulle ISH des bots JPC : invulnérable (comme un vrai joueur).
    if (entry.jpc === true && Date.now() < Number(entry.jpcIshUntil || 0)) return 0;
    // Bots JPC : même protection ZNA que les joueurs (portail/base). Un bot
    // à l'abri ne prend rien et ne donne rien (ni lock, ni aggro) — pas de
    // vol de kill au portail pendant sa réparation.
    if (entry.jpc === true) {
      try { if (this.inSafe(Number(entry.x) || 0, Number(entry.y) || 0)) return 0; } catch {}
    }
    const shooter = this.players.get(String(clientId));
    // La zone sure empeche le PvP, mais le gameplay actuel autorise encore
    // les tirs sur NPC depuis sa bordure. Ne pas rejeter ces impacts : le
    // client predirait sinon la mort avant que le serveur ressuscite le NPC.
    if (!shooter || shooter.dead) return;
    const dx = Number(entry.x) - Number(shooter.x);
    const dy = Number(entry.y) - Number(shooter.y);
    if (dx * dx + dy * dy > 6500 * 6500 && hit?.unlimitedRange !== true) return;
    const raw = Number(hit?.dmg);
    // Conserve le plafond historique : certaines configurations tres haut
    // niveau peuvent legitimement depasser 10 M sur un impact cumule.
    // Hits d'exécution d'aptitude vérifiés côté serveur (execOk, voir
    // MULTI_SERVER : fenêtre/aura contrôlée) : plafond relevé pour les
    // one-shots (Tir chargé, exécutions, bursts) sur gros NPC.
    const rawCap = hit?.execOk === true ? 2e9 : 1e8;
    if (!Number.isFinite(raw) || raw < 0 || raw > rawCap) return;
    // Blacklight : dégâts joueurs x1.25 (sauf Orcus x1), comme en solo.
    // Strokelight Barrage : insensible (NPC normal en map BL).
    const strokNoBonus = String(entry.type || "") === "npc_Strokelight_Barrage";
    const buffed = Math.max(0, raw) * (strokNoBonus ? 1 : blDamageMultFor(this.mapId, shooter?.shipId));
    // Premier attaquant = credit du kill (pas le coup de grace).
    if (entry.firstBy == null) entry.firstBy = String(clientId);
    entry.lastHitBy = String(clientId);
    const nowMs = Date.now();
    entry.lastHitAt = nowMs;
    // Lock premier attaquant : prise si libre (le premier qui tape prend le
    // rouge), refresh si détenteur (un dégât annule la grace, "re bon").
    // Détenteur non confirmé (transfert auto, jamais tapé depuis) : le hit
    // vole le lock instantanément — ex : l'ancien qui re-tape repasse rouge
    // et l'autre gris, sans avoir à attendre.
    ZoneNpcSim.lockNoteHit(entry, clientId, nowMs);
    if (entry.lockBy == null) {
      entry.lockBy = String(clientId);
      entry.lockHitAt = nowMs;
      entry.lockReleaseAt = 0;
    } else if (String(entry.lockBy) === String(clientId)) {
      entry.lockHitAt = nowMs;
      entry.lockReleaseAt = 0;
    } else if (!Number(entry.lockHitAt)) {
      entry.lockBy = String(clientId);
      entry.firstBy = String(clientId);
      entry.lockHitAt = nowMs;
      entry.lockReleaseAt = 0;
    }
    const slowPct = clamp(Number(hit?.slowPct) || 0, 0, 95);
    const slowSec = clamp(Number(hit?.slowSec) || 0, 0, 30);
    const freezeSec = clamp(Number(hit?.freezeSec) || 0, 0, 5);
    if (slowPct > 0 && slowSec > 0) {
      entry.slowPct = Math.max(Number(entry.slowPct) || 0, slowPct);
      entry.slowUntil = Math.max(Number(entry.slowUntil) || 0, nowMs + slowSec * 1000);
    }
    if (freezeSec > 0) entry.freezeUntil = Math.max(Number(entry.freezeUntil) || 0, nowMs + freezeSec * 1000);
    if (Number(hit?.accuracyPenaltyPct) > 0) {
      entry.accuracyPenaltyPct = Math.max(nowMs < Number(entry.accuracyUntil) ? Number(entry.accuracyPenaltyPct) || 0 : 0, Number(hit.accuracyPenaltyPct));
      entry.accuracyUntil = Math.max(Number(entry.accuracyUntil) || 0, nowMs + Number(hit.accuracySec) * 1000);
    }
    let applied = 0;
    if (hit?.kind === "sab") {
      // Drain bouclier seul (miroir drainShield) : jamais de coque.
      const drained = Math.min(Math.max(0, entry.sh), buffed);
      entry.sh -= drained;
      applied = drained;
    } else {
      const res = damageEnemyLayers(entry, buffed, {
        shieldPenetration: clamp(Number(hit?.pen ?? 0), 0, 1),
        weakenShields: clamp(Number(hit?.weaken ?? 0), 0, 10),
        shieldSpread: entry.spread,
        critChance: Number.isFinite(Number(hit?.critChance)) ? clamp(Number(hit.critChance), 0, 1) : 0.05,
        critMultiplier: Number.isFinite(Number(hit?.critMult)) ? clamp(Number(hit.critMult), 1, 2) : 1.5,
        variance: Number.isFinite(hit?.variance) ? hit.variance : 0.05,
        random: Math.random,
      });
      this.redirectShieldDamage?.(entry, res, String(clientId), nowMs);
      applied = Number(res?.total) || 0;
    }
    // Cumul des dégâts par joueur et par incarnation (top dégâts Invoke /
    // Mindfire). Reset automatique si l'entrée est recyclée (seq change).
    if (applied > 0) {
      if (hit?.abilityFinal && (hit.ability === "ability_solaris_inc" || hit.ability === "ability_solaris-plus_incinerate-plus") && entry.hp > 0) {
        const distance = Math.hypot(entry.x - shooter.x, entry.y - shooter.y) || 1;
        const push = hit.ability === "ability_solaris_inc" ? 1200 : 1600;
        entry.x = clamp(entry.x + (entry.x - shooter.x) / distance * push, 80, this.world.w - 80);
        entry.y = clamp(entry.y + (entry.y - shooter.y) / distance * push, 80, this.world.h - 80);
        entry._incHold = null;
      }
      try {
        if (!entry.dmgBy || entry.dmgSeq !== entry.seq) {
          entry.dmgBy = new Map();
          entry.dmgSeq = entry.seq;
        }
        entry.dmgBy.set(String(clientId), Math.max(0, Number(entry.dmgBy.get(String(clientId))) || 0) + applied);
      } catch {}
    }
    // Feed degats (100 ms) : les autres ecrans voient les chiffres.
    if (applied > 0) {
      const key = `${uid}|${clientId}`;
      this.feed.set(key, { uid, by: String(clientId), total: Math.round((this.feed.get(key)?.total || 0) + applied) });
    }
    // Provoque : poursuit son agresseur quelques secondes (comme en solo),
    // même si le tir part depuis une ZNA (seul le NPC visé riposte : les
    // autres ignorent le tireur protégé via validTarget, pas de rancune).
    // Pendant l'IEM, ses tirs peuvent continuer a toucher le NPC mais ne
    // doivent pas recreer silencieusement l'ancien lock.
    if (this.validTarget(shooter) || (shooter.safe === true && nowMs >= Number(shooter.untargetableUntil || 0))) {
      // Un hit ne vole plus l'aggro à chaque salve (c'était le yoyo à
      // plusieurs tapeurs). Le tapeur prend l'aggro si elle est libre ou
      // expirée, la refresh s'il la détient ; sinon le tick tranche via la
      // menace (top dégâts + hystérésis).
      const holdUntil = nowMs + (Number(entry.aggroHoldMs) || 3500);
      const curBy = entry.aggroBy != null ? String(entry.aggroBy) : null;
      if (!curBy || nowMs >= Number(entry.aggroUntil || 0) || curBy === String(clientId)) {
        entry.aggroBy = String(clientId);
        entry.aggroUntil = holdUntil;
      }
      entry.pendingAggroBy = null;
      entry.retreating = false;
    }
    if (applied > 0 && entry.type === "npc_Protegit" && entry.masterUid) {
      const master = this.entries.get(entry.masterUid);
      if (master?.type === "npc_Cubikon" && master.hp > 0) master.lastCubeHitAt = nowMs;
    }
    if (entry.type === "npc_Cubikon") {
      // Premier impact de l'engagement : animation + vague partagees.
      // (Si le coup est fatal, la mort ci-dessous libere les minions.)
      entry.lastCubeHitAt = nowMs;
      if (entry.hp > 0 && nowMs >= Number(entry.jamUntil || 0) && !entry.cubeArmed && !entry.cube) {
        if (this.countCubikonMinions(uid) < ZoneNpcSim.CUBIKON_WAVE_MAX) {
          entry.cubeArmed = true;
          entry.cube = { phase: "delay", until: nowMs + 2000, spawnAt: nowMs + 4600 };
        }
      }
    }
    // Mindfire Behemoth : 2 Attend IX à 75 % / 50 % / 25 % de durabilité.
    // Non bloquant : le Mindfire reste vulnérable (pas d'invulnérabilité).
    if (applied > 0 && entry.type === "npc_Mindfire_Behemoth" && entry.hp > 0) {
      try { this.checkMindfireWaves(entry, nowMs); } catch {}
    }
    // Invoke XVI : 7 Impulse II dès le premier dégât, une seule fois
    // par incarnation (l'entrée serveur persiste aux départs/retours).
    // Non bloquant : l'Invoke reste vulnérable.
    if (applied > 0 && nowMs >= Number(entry.jamUntil || 0) && entry.type === "npc_Invoke_XVI" && !entry.invokeReleased) {
      entry.invokeReleased = true;
      try { this.spawnInvokeImpulse(entry, nowMs); } catch {}
    }
    if (!(entry.hp > 0)) {
      entry.hp = 0;
      entry.sh = 0;
      // Credit au premier attaquant (repli : dernier si parti).
      // Proie d'un JPC vivant : pas de récompense partagée (tueur vide,
      // mort silencieuse côté clients) — tuer le bot libère la proie.
      const claimedByJpc = entry.jpc !== true && this.jpcPreyClaimed(uid);
      const kb = claimedByJpc ? "" : (entry.firstBy != null && this.players.has(entry.firstBy) ? entry.firstBy : entry.lastHitBy);
      entry.killer = claimedByJpc ? "" : String(kb || clientId);
      entry.cause = "gun";
      entry.cube = null;
      // JPC tué : respawn programmé dans 90 s (1ter, anti-farm en boucle),
      // pas de slot univers.
      if (entry.jpc === true) entry.jpcRespawnAt = nowMs + JPC_RESPAWN_DELAY_S * 1000;
      if (!entry.campId) entry.deadAt = nowMs;
      if (entry.type === "npc_Cubikon") {
        try { this.releaseCubikonMinions(entry, nowMs); } catch {}
      }
      try { this.spawnOnKillWave(entry, nowMs); } catch {}
      // Les JPC n'ont pas de slot d'univers (respawn propre, pas persistant).
      try { if (!entry.jpc) markDead(this.universe, this.mapId, uid, Date.now()); } catch {}
      // Mort d'un JPC tué par un joueur : type récompense par tier de map
      // (l'entité garde son type coque pour le rendu client).
      const death = { uid, type: entry.jpc === true ? `npc_Jpc_T${Number(entry.jpcTier) || 1}` : entry.type, x: Math.round(entry.x), y: Math.round(entry.y), killer: entry.killer, cause: "gun", seq: entry.seq || 0, at: Date.now() };
      // Invoke / Mindfire : classement dégâts pour les soleils (top 10) et
      // la récompense de destruction proportionnelle (tous les tapeurs).
      if (entry.type === "npc_Invoke_XVI" || entry.type === "npc_Mindfire_Behemoth") {
        try {
          const shares = [];
          if (entry.dmgBy && entry.dmgSeq === entry.seq) {
            for (const [pid, total] of entry.dmgBy) {
              const dmg = Math.max(0, Math.round(Number(total) || 0));
              if (dmg > 0 && String(pid).startsWith("u_")) shares.push([String(pid), dmg]);
            }
          }
          shares.sort((a, b) => b[1] - a[1]);
          death.shares = shares.slice(0, 24);
        } catch {}
      }
      this.deaths.push(death);
    }
    // Dégâts appliqués par ce coup (audit anticheat côté MULTI_SERVER).
    return applied;
  }

  tick(dtSec = 0.1) {
    const nowMs = Date.now();
    const dt = Math.max(0.01, Math.min(0.5, Number(dtSec) || 0.1));
    // Rotation horaire des JPC : le nombre change toutes les heures, sans
    // redémarrage (renforts immédiats si ça monte, convergence naturelle
    // sinon). Avant le précalcul jpcAlive pour qu'il voie les renforts.
    try { this.jpcApplyHourBucket(nowMs); } catch {}
    // Bots JPC vivants : précalculé une fois par tick pour les scans
    // d'aggro NPC (évite entries × NPC à chaque itération).
    let jpcAlive = null;
    try {
      jpcAlive = [];
      for (const e of this.entries.values()) {
        if (e && e.jpc === true && e.hp > 0) jpcAlive.push(e);
      }
    } catch { jpcAlive = []; }
    // 1) Respawns. Comptage vivant par camp en UNE passe (l'ancienne double
    // boucle camps x entrees coutait ~5 ms/tick sur MAUDITE et bloquait la
    // boucle 50 ms -> pics de ping pour tout le monde).
    const aliveByCamp = new Map();
    for (const e of this.entries.values()) {
      if (e && e.campId != null && e.hp > 0) {
        aliveByCamp.set(e.campId, (aliveByCamp.get(e.campId) || 0) + 1);
      }
    }
    for (const camp of this.camps) {
      // Raid Low : les camps de vague ne spawnent que si leur vague est active.
      if (camp.raidWave > 0 && camp.raidWave !== this.raidWave) continue;
      // Raid Low : camp à usage unique — déjà spawné pendant cette
      // activation de vague = pas de respawn (sinon vague infinie).
      if (camp.noRespawn === true && camp._raidGen === this.raidWaveGen) continue;
      if ((aliveByCamp.get(camp.id) || 0) >= camp.maxAlive) continue;
      const cd = (this.campT.get(camp.id) || 0) - dt;
      if (cd > 0) { this.campT.set(camp.id, cd); continue; }
      const slot = getSlot(this.universe, this.mapId, slotUid(this.mapId, camp.id));
      if (!slot) continue;
      if (slot.alive === false && Number(slot.respawnAtMs) > nowMs) {
        this.campT.set(camp.id, 1);
        continue;
      }
      if (!statsFor(camp.type)) continue; // type inconnu : on n'essaie plus
      const spawned = this.spawnFor(camp, nowMs);
      this.campT.set(camp.id, spawned === false ? 1 : camp.respawn);
    }
    // 1ter) Respawns JPC : même uid, incarnation suivante (seq+1), après
    // 90 s (anti-farm en boucle). Plafonné à la cible horaire : si la
    // nouvelle heure veut moins de bots, les morts restent morts jusqu'à
    // convergence (les vivants ne disparaissent jamais en plein fight).
    // Les clients suivent via le seq (comme les camps).
    let jpcAliveNow = 0;
    try {
      for (const o of this.entries.values()) {
        if (o && o.jpc === true && o.hp > 0) jpcAliveNow++;
      }
    } catch {}
    const jpcTarget = Number(this.jpcTarget);
    for (const e of this.entries.values()) {
      if (!e || e.jpc !== true || e.hp > 0) continue;
      if (nowMs < Number(e.jpcRespawnAt || 0)) continue;
      if (Number.isFinite(jpcTarget) && jpcTarget > 0 && jpcAliveNow >= jpcTarget) continue;
      jpcAliveNow++;
      e.hp = Number(e.hpMax) || 1;
      e.sh = Number(e.shMax) || 0;
      e.seq = (Number(e.seq) || 0) + 1;
      e.killer = null; e.cause = null; e.deadAt = 0;
      e.firstBy = null; e.lastHitBy = null;
      e.lockBy = null; e.lockHitAt = 0; e.lockReleaseAt = 0; e.hitHist = [];
      e.dmgBy = null; e.dmgSeq = 0;
      e.aggroBy = null; e.aggroUntil = 0; e.chaseId = null;
      e.jpcPreyUid = null; e.jpcMode = "farm"; e.jpcSafeX = null;
      e.jpcIshUntil = 0; e.shootCd = 1;
      e.jpcVisualParts = []; e.jpcRepairTick = 0; e.vx = 0; e.vy = 0;
      e.jpcNavigation = {}; e.jpcCombatState = {};
      try {
        const p = this.jpcSpawnPos();
        if (p) { e.x = p.x; e.y = p.y; }
      } catch {}
      e.angle = Math.random() * TAU;
    }
    // 1ter-b) Joueur mort : les JPC l'oublient comme s'il ne les avait
    // jamais attaqués — pas de rancune au respawn (ni chase, ni aggro, ni
    // historique de dégâts frais qui rouvrirait le fight tout seul).
    try {
      for (const [pid, p] of this.players) {
        if (!p || p.dead !== true) continue;
        for (const o of this.entries.values()) {
          if (!o || o.jpc !== true) continue;
          if (String(o.aggroBy || "") === String(pid)) { o.aggroBy = null; o.aggroUntil = 0; }
          if (String(o.chaseId || "") === String(pid)) o.chaseId = null;
          if (String(o.lastHitBy || "") === String(pid)) o.lastHitBy = null;
          if (String(o.pendingAggroBy || "") === String(pid)) o.pendingAggroBy = null;
          try { if (o.dmgBy instanceof Map) o.dmgBy.delete(String(pid)); } catch {}
          try {
            if (Array.isArray(o.hitHist) && o.hitHist.length) {
              o.hitHist = o.hitHist.filter((c) => String(c?.id || "") !== String(pid));
            }
          } catch {}
        }
      }
    } catch {}
    // 1bis) Vagues Cubikon : transitions d'animation, spawn partage,
    // dechet des minions orphelins et re-armement apres 15 s sans coup.
    for (const [muid, m] of [...this.entries]) {
      if (!m) continue;
      if (m.type === "npc_Cubikon" && m.cube) {
        if (!(m.hp > 0)) { m.cube = null; continue; }
        if (nowMs >= Number(m.cube.until) || 0) {
          if (m.cube.phase === "delay") {
            m.cube = { phase: "open", until: nowMs + 1000, spawnAt: Number(m.cube.spawnAt) || (nowMs + 2600) };
          } else if (m.cube.phase === "open") {
            m.cube = { phase: "hold", until: Number(m.cube.spawnAt) || (nowMs + 2000), spawnAt: Number(m.cube.spawnAt) || (nowMs + 2000) };
          } else if (m.cube.phase === "hold") {
            try { this.spawnCubikonWave(m, nowMs); } catch {}
            m.cube = null;
          } else {
            m.cube = null;
          }
        }
      }
      this.refillCubikonMinions(m, nowMs);
      // Entite hors-camp morte (minion ou vague onKill) : purge apres
      // diffusion du journal (3 s). Les JPC ont leur propre respawn (1ter).
      if (!m.campId && !m.jpc && !(m.hp > 0) && nowMs - Number(m.deadAt || 0) > 3000) {
        this.entries.delete(muid);
        continue;
      }
      // Cubikon vivant sans coup depuis 15 s : minions retires
      // silencieusement (parite solo : despawn 0.5 s, sans recompense),
      // la prochaine salve re-arme la vague.
      if (m.type === "npc_Cubikon" && m.cubeArmed && (m.hp > 0)
        && nowMs - Number(m.lastCubeHitAt || 0) > 15000) {
        for (const [muid2, m2] of [...this.entries]) {
          if (m2 && m2.masterUid === m.uid && m2.hp > 0 && !m2.decaying) {
            this.entries.delete(muid2);
            if (this.recentGone.length < 200) this.recentGone.push(muid2);
          }
        }
        m.cubeArmed = false;
        m.cube = null;
      }
    }
    // 2) Mouvements — parite solo :
    // - provocations (tirs) : poursuit l'agresseur quelques secondes ;
    // - proximite : rayon du camp (jamais les passifs non provoques) ;
    // - zone sure / camouflage : aucune poursuite, aucun tir ;
    // - sous 10 % PV : fuite (rattrapable), les tirs continuent ;
    // - kamikaze : fonce au contact puis explose ;
    // - sinon : derive. En poursuite proche : orbite, jamais statique.
    for (const e of this.entries.values()) {
      if (!(e.hp > 0)) continue;
      // Halo Mindfire : pulsation toutes les 1 s (rayon 1200). Les joueurs
      // camouflés dedans perdent leur camouflage (ultime comme CPU).
      if (e.type === "npc_Mindfire_Behemoth") {
        e.haloT = Math.max(0, (Number(e.haloT) || 0) - dt);
        if (e.haloT <= 0) {
          e.haloT = MINDFIRE_HALO_PERIOD_S;
          for (const [pid, p] of this.players) {
            if (!p || p.dead || p.cloaked !== true) continue;
            const dx = Number(p.x) - e.x, dy = Number(p.y) - e.y;
            if (dx * dx + dy * dy > MINDFIRE_HALO_RADIUS * MINDFIRE_HALO_RADIUS) continue;
            this.decloaks.push({ playerId: String(pid), npcUid: e.uid });
          }
        }
      }
      // Lock premier attaquant : le détenteur le perd s'il est mort, en ZNA
      // ou sans dégât depuis 5 s. Grace de 5 s (un dégât du détenteur
      // l'annule, voir applyHit), puis TRANSFERT AUTO au prétendant le plus
      // récent (pas besoin de taper pour passer rouge) ; personne → libre.
      // firstBy suit pour que la récompense aille au nouveau rouge.
      if (e.lockBy != null) {
        const holder = this.players.get(String(e.lockBy));
        const holderIdle = nowMs - Number(e.lockHitAt || 0) > ZoneNpcSim.LOCK_IDLE_MS;
        // En ZNA, le détenteur qui tape encore garde son lock (c'est lui
        // que le NPC riposte). Il ne le perd qu'en restant passif.
        const holderOut = !holder || holder.dead === true || (holder.safe === true && holderIdle);
        if (holderOut || holderIdle) {
          if (!e.lockReleaseAt) e.lockReleaseAt = nowMs + ZoneNpcSim.LOCK_GRACE_MS;
          else if (nowMs >= Number(e.lockReleaseAt) || 0) {
            const ex = String(e.lockBy);
            const next = ZoneNpcSim.lockContender(e, ex, nowMs, this.players);
            e.lockBy = next;
            e.firstBy = next;
            e.lockHitAt = 0; // non confirmé : doit taper pour confirmer
            e.lockReleaseAt = 0;
          }
        } else {
          e.lockReleaseAt = 0;
        }
      }
      // Minion orphelin (Cubikon mort) : perd 5 % de sa vie max par seconde
      // jusqu'a la mort, meme sous le feu ennemi. Fuite en ligne droite
      // pendant 3 s, puis errance + agro comme les autres NPC (tirs inclus).
      if (e.decaying) {
        e.decayAge = (Number(e.decayAge) || 0) + dt;
        e.hp -= Math.max(1, Number(e.decayPerSec) || 0) * dt;
        if (!(e.hp > 0)) {
          e.hp = 0; e.sh = 0; e.deadAt = nowMs;
          // Mort par décomposition (Cubikon tué) sans aucun tir joueur : aucune
          // récompense (parité solo : noRewards = !damagedByPlayer). Le
          // masterKiller ne crédite que si le minion a été tapé.
          const damagedByPlayer = e.firstBy != null || e.lastHitBy != null;
          const kb = (e.firstBy != null && this.players.has(e.firstBy))
            ? e.firstBy : (damagedByPlayer ? (e.masterKiller || e.lastHitBy) : null);
          e.killer = String(kb || "");
          e.cause = "gun";
          this.deaths.push({ uid: e.uid, type: e.type, x: Math.round(e.x), y: Math.round(e.y), killer: e.killer, cause: "gun", seq: e.seq || 0, at: nowMs });
          continue;
        }
        if (e.decayAge < 3) {
          e.aggroBy = null;
          e.aggroUntil = 0;
          e.chaseId = null;
          e.x = clamp(e.x + Number(e.fleeVx || 0) * dt, 80, this.world.w - 80);
          e.y = clamp(e.y + Number(e.fleeVy || 0) * dt, 80, this.world.h - 80);
          continue;
        }
        // Apres 3 s : comportement NPC normal ci-dessous (poursuite + tirs),
        // la perte de vie continue a chaque tick.
      }
      const frozen = nowMs < Number(e.freezeUntil || 0);
      const inc = e._incHold;
      const incCaster = inc && inc.until > nowMs ? this.players.get(String(inc.by)) : null;
      if (incCaster && !incCaster.dead && !incCaster.safe) {
        inc.angle += dt * 2;
        const tx = incCaster.x + Math.cos(inc.angle) * inc.radius, ty = incCaster.y + Math.sin(inc.angle) * inc.radius;
        const k = 1 - Math.exp(-dt * 8);
        e.x += (tx - e.x) * k;
        e.y += (ty - e.y) * k;
        e.angle = Math.atan2(incCaster.y - e.y, incCaster.x - e.x);
        e.shootT = Math.max(Number(e.shootT) || 0, 0.25);
        continue;
      }
      const slowMult = nowMs < Number(e.slowUntil || 0)
        ? Math.max(0.05, 1 - clamp(Number(e.slowPct) || 0, 0, 95) / 100)
        : 1;
      // Strokelight Barrage : 1 Barrage Seeker Rocket / 5 s une fois attaqué.
      // La roquette kamikaze poursuit l'agresseur jusqu'à la mort.
      // Hors de portée de tir : plus d'envoi (les roquettes en vol continuent).
      if (e.hp > 0 && String(e.type || "") === "npc_Strokelight_Barrage" && e.lastHitBy != null && !frozen) {
        const atk = this.players.get(String(e.lastHitBy));
        const sRange = Number(e.shootRange) || 700;
        if (!atk || !this.validTarget(atk)) continue;
        const adx = Number(atk.x) - e.x, ady = Number(atk.y) - e.y;
        if (adx * adx + ady * ady > sRange * sRange) continue;
        e.barrageT = Math.max(0, (Number(e.barrageT) || 0) - dt);
        if (e.barrageT <= 0) {
          e.barrageT = 5;
          try { this.spawnBarrageRocket(e, nowMs); } catch {}
        }
      }
      // Strokelight Barrage : sous 25 % de durabilité il devient mobile (350).
      if (String(e.type || "") === "npc_Strokelight_Barrage") {
        const strokMax = Math.max(0, Number(e.hpMax) || 0) + Math.max(0, Number(e.shMax) || 0);
        const strokFrac = strokMax > 0
          ? (Math.max(0, Number(e.hp) || 0) + Math.max(0, Number(e.sh) || 0)) / strokMax
          : 1;
        e.speed = strokFrac < 0.25 ? 350 : 0;
      }
      // Kamikaze au contact : explose, la victime touche la recompense.
      if (e.kamikaze && e.explodeOnTouch && nowMs >= Number(e.jamUntil || 0)) {
        let victim = null, victimD2 = e.explodeRadius * e.explodeRadius;
        for (const [pid, p] of this.players) {
          if (!this.validTarget(p)) continue;
          const dx = p.x - e.x, dy = p.y - e.y, d2 = dx * dx + dy * dy;
          if (d2 < victimD2) { victimD2 = d2; victim = pid; }
        }
        if (victim != null) {
          this.playerHits.push({ playerId: String(victim), npcUid: e.uid, damage: Math.max(0, Number(e.explodeDmg) || 0), kind: "boom" });
          e.hp = 0; e.sh = 0; e.killer = String(victim); e.cause = "boom";
          e.cube = null;
          if (!e.campId) e.deadAt = nowMs;
          try { this.spawnOnKillWave(e, nowMs); } catch {}
          try { markDead(this.universe, this.mapId, e.uid, nowMs); } catch {}
          this.deaths.push({ uid: e.uid, type: e.type, x: Math.round(e.x), y: Math.round(e.y), killer: String(victim), cause: "boom", seq: e.seq || 0, at: nowMs });
          continue;
        }
      }
      // Agresseur provoque (encore valide). La riposte ZNA est gérée
      // directement dans applyHit + la branche `p?.safe` ci-dessous
      // (plus de rancune différée : le NPC visé réagit tout de suite).
      let attacker = null;
      if (e.pendingAggroBy) e.pendingAggroBy = null;
      if (e.aggroBy) {
        const p = this.players.get(e.aggroBy);
        const targetOutside = !!p && (p.x < 0 || p.x > this.world.w || p.y < 0 || p.y > this.world.h);
        // Une poursuite deja declenchee ne s'annule pas artificiellement au
        // passage de la frontiere. Elle cessera si la cible meurt, se cache,
        // atteint une ZNA ou revient hors des conditions normales d'aggro.
        if (targetOutside && this.validTarget(p)) {
          e.aggroUntil = nowMs + (Number(e.aggroHoldMs) || 3500);
          attacker = { id: e.aggroBy, x: p.x, y: p.y };
        } else if (nowMs < Number(e.aggroUntil || 0) && this.validTarget(p)) attacker = { id: e.aggroBy, x: p.x, y: p.y };
        else if (p?.safe) {
          // Riposte ZNA : seul le NPC visé garde sa poursuite (parité
          // solo). Tous les autres décrochent et se replient.
          if (this.retaliationOpen(e, e.aggroBy, nowMs)) {
            attacker = { id: e.aggroBy, x: p.x, y: p.y };
          } else {
            e.retreating = true;
            e.retreatUntil = nowMs + 3000;
            e.shieldRegenAt = nowMs + 5000;
            e.retreatFromX = p.x;
            e.retreatFromY = p.y;
            e.aggroBy = null;
            e.aggroUntil = 0;
          }
        } else if (nowMs >= Number(e.aggroUntil || 0)) {
          e.aggroBy = null;
          e.aggroUntil = 0;
        }
      }
      // Proximite : rayon du camp (passifs : seulement si provoques).
      // Chasseurs (raid) : traque map-wide type gate, pas de rayon.
      // Maps doublées (BL / 4-5) : portée x2 (acquisition comme poursuite).
      let close = null, closeD = e.hunter === true ? Infinity : (Number(e.aggroRange) || 700) * aggroRangeMultFor(this.mapId);
      if (!e.passive || attacker) {
        for (const [pid, p] of this.players) {
          if (!this.validTarget(p)) continue;
          const d = Math.hypot(p.x - e.x, p.y - e.y);
          if (d < closeD) { closeD = d; close = { id: pid, x: p.x, y: p.y }; }
        }
      }
      // Menace : Mindfire / Invoke / Protegit = tirage aléatoire toutes
      // les 3 s ; tous les autres = top dégâts à portée (+ hystérésis).
      // Ne s'applique qu'en SWITCH ; sinon le flux attacker / close garde
      // la main.
      let threat = null;
      try {
        threat = SHUFFLE_THREAT_TYPES.has(String(e.type || ""))
          ? this.shuffleThreatTarget(e, nowMs)
          : this.topThreatTarget(e, nowMs);
      } catch {}
      // Bots JPC : les NPC les aggro comme de vrais joueurs (proximité ;
      // passifs uniquement sur provocation ; jamais dans les zones sûres).
      // Priorité : damagers (joueur frais, puis bot qui tape), puis le plus
      // proche. Un joueur qui ne fait que passer ne vole pas le fight du bot.
      let jpcChase = null, jpcCloseD = Infinity, jpcProvoked = false;
      try {
        const jpcProvokedFresh = e.jpcAggroUid != null && nowMs < Number(e.jpcAggroUntil || 0);
        if (jpcProvokedFresh) {
          const t = this.entries.get(String(e.jpcAggroUid));
          if (t && t.jpc === true && t.hp > 0 && !this.inSafe(t.x, t.y)) {
            jpcChase = { id: t.uid, x: t.x, y: t.y, jpc: true };
            jpcProvoked = true;
          } else {
            e.jpcAggroUid = null;
            e.jpcAggroUntil = 0;
          }
        }
        if (!jpcChase && (!e.passive || attacker || jpcProvokedFresh)) {
          const range = (Number(e.aggroRange) || 700) * aggroRangeMultFor(this.mapId);
          let bd = range * range;
          for (const n of jpcAlive || []) {
            if (!n || !(n.hp > 0)) continue;
            if (this.inSafe(n.x, n.y)) continue;
            const dx = n.x - e.x, dy = n.y - e.y;
            const d2 = dx * dx + dy * dy;
            if (d2 < bd) { bd = d2; jpcCloseD = Math.sqrt(d2); jpcChase = { id: n.uid, x: n.x, y: n.y, jpc: true }; }
          }
          // Proximité pure (pas de provocation) : le plus proche gagne.
          if (jpcChase && !jpcProvoked && close && jpcCloseD > closeD) jpcChase = null;
        }
      } catch { jpcChase = null; jpcProvoked = false; }
      const taunter = nowMs < Number(e._drawFireUntil) ? this.players.get(String(e._drawFireBy)) : null;
      const taunted = this.validTarget(taunter) && Math.hypot(taunter.x - e.x, taunter.y - e.y) <= 600
        ? { id: String(e._drawFireBy), x: taunter.x, y: taunter.y } : null;
      // Bots JPC : jamais d'aggro spontanée (ni proximité, ni Draw Fire) —
      // uniquement la riposte aux dégâts (attacker) et la menace.
      // Dégât joueur récent (< 4 s) : priorité comme en solo (celui qui
      // tape). Sinon le bot qui farme garde son NPC même si un joueur
      // passe à côté sans tirer — comme entre deux vrais joueurs.
      let pdFresh = false;
      try {
        const h = Array.isArray(e.hitHist) ? e.hitHist : [];
        for (let i = h.length - 1; i >= 0; i--) {
          const c = h[i];
          if (!c || !String(c.id || "").startsWith("u_")) continue;
          pdFresh = nowMs - Number(c.at || 0) < 4000;
          break;
        }
      } catch {}
      let chase = null;
      if (e.jpc) {
        chase = threat || attacker;
      } else if (jpcChase && !pdFresh) {
        // Bot en train de farmer et aucun joueur ne tape : le bot garde sa
        // cible même si un joueur passe à côté (comme entre vrais joueurs).
        chase = taunted || threat || attacker || jpcChase;
      } else {
        chase = taunted || threat || attacker || jpcChase || close;
      }
      if (chase) e.retreating = false;
      if (threat) {
        e.aggroBy = threat.id;
        e.aggroUntil = nowMs + (Number(e.aggroHoldMs) || 3500);
      }
      e.chaseId = chase ? chase.id : null;
      // Desengage par une ZNA : le NPC s'eloigne et recharge seulement son
      // bouclier. Sa coque ne se regenere jamais lors de ce repli.
      // Mindfire / Invoke : aucune regeneration. Strokelight : bouclier
      // oui (ce bloc ne touche que lui), coque jamais.
      if (e.retreating && !chase) {
        if (nowMs >= Number(e.shieldRegenAt || 0) && !isNoShieldRegenBlBossType(e.type)) {
          e.sh = Math.min(e.shMax, e.sh + e.shMax * 0.10 * dt);
        }
        if (e.sh >= e.shMax && nowMs >= Math.max(Number(e.retreatUntil || 0), Number(e.shieldRegenAt || 0))) {
          e.retreating = false;
        }
      }
      // Les NPC peuvent aller partout sur la map, meme sur la base :
      // aucune repulsion / glissade autour des zones sures (c'etait ca
      // qui les faisait se stacker en haut / a gauche de la base).
      // La zone sure reste une protection d'aggro (validTarget), pas un mur.
      // Minion de Cubikon (maitre en vie) : ancre autour du Cubikon, jamais
      // de poursuite a travers la map. Les tirs ci-dessous restent actifs.
      const cubeMaster = e.masterUid ? this.entries.get(e.masterUid) : null;
      const cubeAnchored = !!e.masterUid && cubeMaster && cubeMaster.hp > 0
        && Number(cubeMaster.seq || 0) === Number(e.masterSeq || 0);
      if (!cubeAnchored && e.masterUid && !e.decaying) {
        // Maitre mort ou reincarne : le minion bascule en desagregation
        // (une seule fois : fuite 3 s puis errance + agro, perte continue).
        // Sans ce garde, le chase recalcule juste au-dessus serait efface
        // a chaque tick et le minion n'agroterait jamais.
        e.decaying = true;
        e.decayAge = Number(e.decayAge) || 0;
        e.decayPerSec = Math.max(1, Number(e.hpMax) || 1) * 0.05;
        e.masterKiller = e.masterKiller || (cubeMaster ? (cubeMaster.killer != null ? String(cubeMaster.killer) : null) : null);
        e.aggroBy = null;
        e.aggroUntil = 0;
        e.chaseId = null;
        const fleeAngle = Math.random() * TAU;
        const fleeSpeed = Math.max(650, Number(e.speed) || 650);
        e.fleeVx = Math.cos(fleeAngle) * fleeSpeed;
        e.fleeVy = Math.sin(fleeAngle) * fleeSpeed;
        e.angle = fleeAngle;
      }
      let mx = 0, my = 0, spd = 0;
      // Chasseurs (raid) : jamais de fuite, combat à mort comme en gate.
      // Ancres (Cubikon + boss BL) : jamais de fuite non plus.
      // JPC : fuite propre vers le portail (jpcMove), pas la fuite générique.
      const fleeing = !e.jpc && !e.kamikaze && e.hunter !== true && !isAnchoredNpcType(e.type) && e.hpMax > 0 && e.hp / e.hpMax < 0.10;
      if (!fleeing) e.fleeDirection = null;
      const from = attacker || close;
      // Bots JPC : logique faux-joueur (farm/fuite/repair/riposte). Les tirs
      // vers les joueurs restent génériques ci-dessous (playerHits).
      if (e.jpc) {
        const mv = this.jpcMove(e, chase, dt, nowMs);
        if (mv.dead) continue;
        mx = Number(mv.mx) || 0; my = Number(mv.my) || 0; spd = Math.max(0, Number(mv.spd) || 0);
      } else if (cubeAnchored) {
        const patrol = protegitPatrol(e, cubeMaster, this.world, dt);
        mx = patrol.x; my = patrol.y; spd = e.speed * patrol.speed;
        e.angle = chase ? Math.atan2(chase.y - e.y, chase.x - e.x) : Math.atan2(my, mx);
      } else if (fleeing) {
        const dir = npcFleeDirection(e, this.world);
        mx = dir.x; my = dir.y; spd = e.speed * 0.85;
        e.angle = chase ? Math.atan2(chase.y - e.y, chase.x - e.x) : Math.atan2(my, mx);
      } else if (chase) {
        const dx = chase.x - e.x, dy = chase.y - e.y;
        const d = Math.hypot(dx, dy) || 1;
        e.angle = Math.atan2(dy, dx);
        if (e.kamikaze || d > 320) {
          mx = dx / d; my = dy / d; spd = e.speed * (e.kamikaze ? 1 : 0.7);
        } else {
          e.orbitT -= dt;
          if (e.orbitT <= 0) { e.orbitDir = -(e.orbitDir || 1); e.orbitT = 2 + Math.random() * 4; }
          const s = e.orbitDir || 1;
          mx = (-dy / d) * s; my = (dx / d) * s; spd = e.speed * 0.5;
        }
      } else if (e.retreating) {
        const dx = e.x - Number(e.retreatFromX || 0), dy = e.y - Number(e.retreatFromY || 0);
        const d = Math.hypot(dx, dy) || 1;
        mx = dx / d; my = dy / d; spd = e.speed * 0.75;
        e.angle = Math.atan2(dy, dx);
      } else {
        if (e.tx == null || Math.hypot(e.tx - e.x, e.ty - e.y) < 100) {
          // Derive libre sur toute la map, base incluse.
          const a = Math.random() * TAU, dist = 400 + Math.random() * 800;
          e.tx = clamp(e.x + Math.cos(a) * dist, 80, this.world.w - 80);
          e.ty = clamp(e.y + Math.sin(a) * dist, 80, this.world.h - 80);
        }
        const dx = e.tx - e.x, dy = e.ty - e.y;
        const d = Math.hypot(dx, dy) || 1;
        mx = dx / d; my = dy / d; spd = e.speed * 0.55;
        if (spd > 0) e.angle = Math.atan2(dy, dx);
      }
      const outsideMap = e.x < 80 || e.x > this.world.w - 80 || e.y < 80 || e.y > this.world.h - 80;
      // Sans cible, un NPC deja sorti ne continue jamais son roaming dans la
      // radiation : il rejoint d'abord le point interieur le plus proche.
      if (!chase && outsideMap) {
        const tx = clamp(e.x, 80, this.world.w - 80);
        const ty = clamp(e.y, 80, this.world.h - 80);
        const dx = tx - e.x, dy = ty - e.y;
        const d = Math.hypot(dx, dy) || 1;
        mx = dx / d; my = dy / d; spd = e.speed * 0.7;
        e.angle = Math.atan2(dy, dx);
        e.tx = null; e.ty = null;
      }
      if (frozen) spd = 0;
      else spd *= slowMult;
      const radiationTravel = !!chase || outsideMap;
      const minBound = radiationTravel ? 80 - RADIATION_CHASE_MARGIN : 80;
      const maxBoundX = radiationTravel ? this.world.w - 80 + RADIATION_CHASE_MARGIN : this.world.w - 80;
      const maxBoundY = radiationTravel ? this.world.h - 80 + RADIATION_CHASE_MARGIN : this.world.h - 80;
      if (e.jpc) { e.vx = mx * spd; e.vy = my * spd; }
      e.x = clamp(e.x + mx * spd * dt, minBound, maxBoundX);
      e.y = clamp(e.y + my * spd * dt, minBound, maxBoundY);

      // Tirs NPC autoritaires. Le client conserve les projectiles visuels,
      // mais seul cet impact serveur retire effectivement PV/bouclier.
      // Riposte ZNA : le NPC visé peut toucher son agresseur protégé
      // (parité solo). Tout autre tir sur joueur protégé reste interdit.
      e.shootCd = Math.max(0, Number(e.shootCd || 0) - dt);
      // Tirs vers un bot JPC : dégâts directs + visuels rouges (shotFx).
      // Parité solo (enemyShootAtJpc) : cadence, portée, passifs, ISH.
      if (!e.jpc && chase && chase.jpc === true && !frozen
        && !(nowMs < Number(e._redirectSilenceUntil || 0))
        && e.canShoot !== false && e.shootRate > 0) {
        const tj = this.entries.get(String(chase.id));
        if (tj && tj.jpc === true && tj.hp > 0 && !this.inSafe(tj.x, tj.y)) {
          const jd = Math.hypot(tj.x - e.x, tj.y - e.y);
          if (jd <= Number(e.shootRange || 0) && e.shootCd <= 0) {
            e.shootCd = e.jpc ? JPC_LASER.interval : (1 / Math.max(0.001, e.shootRate)) * (0.85 + Math.random() * 0.3);
            if (!(nowMs < Number(tj.jpcIshUntil || 0))) {
              const damage = Math.max(1, Math.round(Number(e.bulletDmg || 10) * (0.95 + Math.random() * 0.1)));
              try {
                damageEnemyLayers(tj, damage, { shieldPenetration: 0.15, shieldSpread: 0.8,
                  variance: 0.05, critChance: 0.05, critMultiplier: 1.5, random: Math.random });
                // Dernier dégât subi : bloque la regen façon joueur (10 s).
                tj.lastHitAt = nowMs;
                // Chiffres façon vrai joueur locké : feed dégâts (affichés sur
                // la cible verrouillée, comme les dégâts alliés).
                try {
                  const key = `${tj.uid}|${e.uid}`;
                  this.feed.set(key, { uid: tj.uid, by: e.uid, total: Math.round((this.feed.get(key)?.total || 0) + damage) });
                } catch {}
              } catch {}
              if (!(tj.hp > 0)) { try { this.jpcKillBot(tj, nowMs); } catch {} }
              else { try { this.pushNpcShotFx(e.x, e.y, tj.x, tj.y, e.uid, "x1", 1, true, tj.uid); } catch {} }
            }
          }
        }
      }
      const chasePlayer = chase ? this.players.get(String(chase.id)) : null;
      const chaseTargetOk = this.validTarget(chasePlayer) || this.retaliationOpen(e, chase ? chase.id : null, nowMs);
      if (!frozen && !(nowMs < Number(e._redirectSilenceUntil || 0)) && e.canShoot !== false && e.shootRate > 0 && chase && chaseTargetOk
        && (!e.jpc || nowMs >= Number(e.jpcIshUntil || 0))) {
        const distance = Math.hypot(chase.x - e.x, chase.y - e.y);
        if (distance <= e.shootRange && e.shootCd <= 0) {
          e.shootCd = e.jpc ? JPC_LASER.interval : (1 / Math.max(0.001, e.shootRate)) * (0.85 + Math.random() * 0.3);
          if (e.jpc) this.jpcStartVolley(e, chase.id, true, nowMs, nowMs < Number(e.jpcX6Until || 0) ? "x6" : "x4");
          for (let shot = 0; shot < e.burst; shot++) {
            const accuracyPenalty = Math.max(nowMs < Number(e._ddolUntil || 0) ? DDOL_ACCURACY_PENALTY : 0,
              nowMs < Number(e.accuracyUntil || 0) ? Number(e.accuracyPenaltyPct) || 0 : 0);
            // Maladresse JPC (15 % en 1-8/BL, 30 % en 1-1) par-dessus les 15 % de base.
            const missBase = e.jpc ? jpcMissChance(e.jpcSkill) : 0.15;
            if (Math.random() < Math.min(1, missBase + accuracyPenalty / 100)) continue;
            // Riposte JPC : x2 en 1-1 … x4 en 1-8/BL (×1.5 en salve x6),
            // PLUS les dégâts des drones comme un vrai joueur équipé.
            // Les NPC gardent leurs dégâts natifs.
            const jpcMult = e.jpc
              ? jpcRiposteMultForSkill(e.jpcSkill) * (nowMs < Number(e.jpcX6Until || 0) ? 1.5 : 1) * jpcDroneDmgFactor(e)
              : 1;
            const damage = Math.max(1, Math.round(e.bulletDmg * jpcMult * (0.95 + Math.random() * 0.1)));
            this.playerHits.push({ playerId: String(chase.id), npcUid: e.uid, damage, kind: "laser" });
          }
          // Roquette standard toutes les secondes en riposte, comme les
          // vrais joueurs.
          if (e.jpc && chasePlayer && nowMs >= Number(e.jpcRocketAt || 0)) {
            e.jpcRocketAt = nowMs + 1000;
            this.jpcFireRocket(e, chase, true, nowMs);
          }
        }
      }
    }
    for (const e of this.entries.values()) {
      if (e.jpc && e.hp > 0) this.jpcTickVisuals(e, nowMs);
    }
    // 2bis) Séparation (parité gate/Low) sur toutes les maps : les NPC
    // vivants ne peuvent plus se superposer. L'index spatial limite le coût
    // aux voisins immédiats au lieu de comparer toute la map en O(n²).
    try {
      const activeList = [];
      for (const e of this.entries.values()) {
        if (e && e.hp > 0) activeList.push(e);
      }
      this.separationIndex.forEachPair(activeList, (a, b, i, j) => {
        // Ancre impliquée : traversée libre, aucune séparation.
        if (a.jpc || b.jpc || isAnchoredNpcType(a.type) || isAnchoredNpcType(b.type)) return;
        let dx = b.x - a.x, dy = b.y - a.y;
        const minimum = (Number(a.r) || 18) + (Number(b.r) || 18) + 6;
        let squared = dx * dx + dy * dy;
        if (squared >= minimum * minimum) return;
        // Deux centres strictement identiques n'ont aucune direction de
        // répulsion : leur donner un axe stable évite un stack permanent.
        if (squared <= 0.0001) {
          const angle = ((i + 1) * 2.399963 + (j + 1) * 0.754877) % TAU;
          dx = Math.cos(angle) * 0.01;
          dy = Math.sin(angle) * 0.01;
          squared = dx * dx + dy * dy;
        }
        const distance = Math.sqrt(squared);
        const nx = dx / distance, ny = dy / distance;
        const overlap = minimum - distance;
        const push = Math.min(220, overlap * 28) * dt;
        const side = Math.min(220, overlap * 12) * (((i + j) % 2 === 0) ? 1 : -1) * dt;
        const tx = -ny, ty = nx;
        const aRadiation = !!a.chaseId || a.x < 80 || a.x > this.world.w - 80 || a.y < 80 || a.y > this.world.h - 80;
        const bRadiation = !!b.chaseId || b.x < 80 || b.x > this.world.w - 80 || b.y < 80 || b.y > this.world.h - 80;
        const aMin = aRadiation ? 80 - RADIATION_CHASE_MARGIN : 80;
        const bMin = bRadiation ? 80 - RADIATION_CHASE_MARGIN : 80;
        a.x = clamp(a.x + (-nx * push + tx * side), aMin, aRadiation ? this.world.w - 80 + RADIATION_CHASE_MARGIN : this.world.w - 80);
        a.y = clamp(a.y + (-ny * push + ty * side), aMin, aRadiation ? this.world.h - 80 + RADIATION_CHASE_MARGIN : this.world.h - 80);
        b.x = clamp(b.x + (nx * push - tx * side), bMin, bRadiation ? this.world.w - 80 + RADIATION_CHASE_MARGIN : this.world.w - 80);
        b.y = clamp(b.y + (ny * push - ty * side), bMin, bRadiation ? this.world.h - 80 + RADIATION_CHASE_MARGIN : this.world.h - 80);
      });
    } catch {}
  }

  snapshot() {
    const nowMs = Date.now();
    this.deaths = this.deaths.filter((d) => nowMs - Number(d.at || 0) < 2500);
    // Feed degats du tick (plafonne), puis vide.
    const dmg = [];
    try {
      for (const f of this.feed.values()) {
        if (f && f.total > 0 && dmg.length < 24) dmg.push({ uid: f.uid, by: f.by, total: Math.round(f.total) });
      }
    } catch {}
    this.feed.clear();
    // Feed réparation JPC du tick (plafonné), puis vide. Chiffres +x façon
    // vrai joueur, affichés sur le bot locké uniquement.
    const heal = [];
    try {
      for (const f of this.healFeed.values()) {
        if (f && (Number(f.hp) > 0 || Number(f.sh) > 0) && heal.length < 24) {
          heal.push({ uid: f.uid, hp: Math.round(Number(f.hp) || 0), sh: Math.round(Number(f.sh) || 0) });
        }
      }
    } catch {}
    this.healFeed.clear();
    // Claims JPC (lock gris) : uid du bot qui farme chaque proie. Une seule
    // passe : les clients affichent gris tant que le bot est dessus.
    const jpcClaims = new Map();
    try {
      for (const o of this.entries.values()) {
        if (o && o.jpc === true && o.hp > 0 && o.jpcPreyUid != null && o.jpcMode === "farm") {
          jpcClaims.set(String(o.jpcPreyUid), String(o.uid));
        }
      }
    } catch {}
    const list = [];
    for (const e of this.entries.values()) {
      if (e.hp > 0) {
        // Cible partagee : la poursuite en cours si elle est encore valide
        // (tous les ecrans voient le NPC tirer le meme joueur). Inclut la
        // riposte ZNA (sinon dégâts invisibles sur le joueur protégé).
        // Sans closure allouee par entree (pression GC a 20 Hz).
        let aggroId = null;
        if (e.chaseId) {
          const ap = this.players.get(e.chaseId);
          if (this.validTarget(ap)) aggroId = e.chaseId;
          else if (this.retaliationOpen(e, e.chaseId, nowMs)) aggroId = e.chaseId;
        }
        list.push({
          uid: e.uid, type: e.type,
          x: Math.round(e.x), y: Math.round(e.y),
          angle: Math.round(e.angle * 100) / 100,
          hp: Math.max(1, Math.round(e.hp)), sh: Math.max(0, Math.round(e.sh)),
          hpMax: e.hpMax, shMax: e.shMax, alive: true, seq: e.seq || 0,
          slowPct: nowMs < Number(e.slowUntil || 0) ? Number(e.slowPct) || 0 : 0,
          slowT: Math.max(0, (Number(e.slowUntil) || 0) - nowMs) / 1000,
          sprT: Math.max(0, (Number(e._sprUntil) - nowMs) / 1000 || 0),
          jamT: Math.max(0, (Number(e.jamUntil) || 0) - nowMs) / 1000,
          freezeT: Math.max(0, (Number(e.freezeUntil) || 0) - nowMs) / 1000,
          aggro: aggroId,
          // Lock premier attaquant (visuel rouge / gris) : id du détenteur.
          lock: e.lockBy != null ? String(e.lockBy) : null,
          // Proie farmée par un JPC (visuel gris comme un vrai joueur) : uid
          // du bot, null sinon (le client retombe sur rouge / libre).
          jpcBy: e.jpc === true ? null : (jpcClaims.get(String(e.uid)) ?? null),
          // Bots JPC natifs : présentation faux-joueur pour tous les écrans
          // (pseudo, drones, formation, bulle ISH).
          ...(e.jpc === true ? {
            jpc: 1,
            jpVx: Number(e.vx) || 0, jpVy: Number(e.vy) || 0, jpSpeed: e.speed,
            jpMode: e.jpcMode,
            jpPseudo: String(e.jpcPseudo || "JPC"),
            jpDrones: Number(e.jpcDrones?.count) || 0,
            jpForm: String(e.jpcDrones?.formation || "standard"),
            jpLvl: Math.max(1, Math.min(6, Number(e.jpcDrones?.level) || 1)),
            jpDes: (Array.isArray(e.jpcDrones?.designs) ? e.jpcDrones.designs : []).slice(0, 12).map(String),
            jpIsh: nowMs < Number(e.jpcIshUntil || 0) ? 1 : 0,
          } : null),
          // Animation d'ouverture du Cubikon : phase + temps restant pour
          // que tous les ecrans jouent l'ouverture en meme temps.
          cube: (e.type === "npc_Cubikon" && e.cube && e.cube.phase) ? String(e.cube.phase) : null,
          cubeT: (e.type === "npc_Cubikon" && e.cube && e.cube.phase)
            ? Math.max(0, (Number(e.cube.until) || 0) - nowMs) / 1000 : 0,
        });
      } else if (e.killer != null) {
        list.push({ uid: e.uid, type: e.type, alive: false, killer: e.killer, cause: e.cause || "gun", seq: e.seq || 0 });
      }
    }
    // Retraits sans mort (despawn de vague) : le client purge sur-le-champ,
    // sans explosion ni delai. Le WS etant fiable, on vide apres envoi.
    const gone = this.recentGone.slice(-200);
    this.recentGone.length = 0;
    return { list, deaths: this.deaths.slice(), dmg, heal, gone };
  }

  // État léger destiné à survivre aux redémarrages du serveur. Il contient
  // notamment alive/deadAt/respawnAt, donc un Empereur tué ne réapparaît pas
  // simplement parce qu'une mise à jour redémarre le service.
  serializeRespawns() {
    return serializeUniverse(this.universe);
  }
}
