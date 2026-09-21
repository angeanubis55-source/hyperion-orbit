// SCRIPTS/NPC_ROOM.js — Simulation NPC serveur pour les maps zone.
// Reutilise les modules purs du jeu : UNIVERSE_SIM (slots/respawn),
// NPC_TYPES (stats), COMBAT_RULES (degats), MAPS/<id>/SPAWNS+WORLD (camps).
// Le serveur tranche les PV des NPC et les degats qu'ils infligent aux joueurs.

import { createUniverse, ensureMapSlots, markDead, markAlive, getSlot, slotUid } from "../SRC/SIM/UNIVERSE_SIM.js";
import { NPC_TYPES } from "../NPC/NPC_TYPES.js";
import { damageEnemyLayers } from "../COMBAT/COMBAT_RULES.js";

const clamp = (v, a, b) => Math.max(a, Math.min(b, Number(v)));
const TAU = Math.PI * 2;

function statsFor(type) {
  const cfg = NPC_TYPES[type];
  if (!cfg) return null;
  return {
    hpMax: Math.max(1, Math.floor(Number(cfg.hp ?? 50))),
    shMax: Math.max(0, Math.floor(Number(cfg.shield ?? 0))),
    speed: Math.max(40, Math.floor(Number(cfg.speed ?? 320))),
    dr: clamp(Number(cfg.dr ?? 0), 0, 1),
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
  constructor(mapId, world, camps) {
    this.mapId = String(mapId).toLowerCase();
    this.world = { w: Number(world?.w) || 11000, h: Number(world?.h) || 7000 };
    this.camps = camps;
    this.universe = createUniverse();
    this.entries = new Map(); // uid -> { uid, campId, type, x, y, angle, hp, sh, hpMax, shMax, speed, dr, spread, tx, ty, killer }
    this.campT = new Map(); // campId -> delai avant prochain essai de spawn
    this.players = new Map(); // clientId -> { x, y, dead, safe, hidden }
    this.safe = []; // cercles de non-agression { x, y, r }
    this.feed = new Map(); // "uid|by" -> { uid, by, total } (degats du tick)
    this.playerHits = []; // impacts NPC autoritaires a appliquer par MULTI_SERVER
    // Journal des kills (2.5 s) : le respawn instantane des NPC normaux
    // effacerait sinon la mort avant le snapshot — le killer perdrait sa recompense.
    this.deaths = []; // { uid, type, x, y, killer, at }
    ensureMapSlots(this.universe, this.mapId, camps, Date.now());
  }

  static async create(mapId) {
    const id = String(mapId || "").toLowerCase();
    if (!/^[a-z0-9_-]+$/.test(id)) return null;
    try {
      const [{ WORLD }, spawns] = await Promise.all([
        import(`../MAPS/${id}/WORLD.js`),
        import(`../MAPS/${id}/SPAWNS.js`),
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
            safe = [{ x: Number(z.x) || 0, y: Number(z.y) || 0, r: Number(z.r) }];
          }
        }
        if (typeof spawns?.getZonePortals === "function") {
          for (const portal of spawns.getZonePortals(world) || []) {
            if (!portal) continue;
            const destination = String(portal.toMap || "").trim().toLowerCase();
            // Les portails de Galaxy Gates ne fournissent jamais de zone sure.
            if (["alpha", "beta", "gamma"].includes(destination)) continue;
            safe.push({ x: Number(portal.x) || 0, y: Number(portal.y) || 0, r: 900 });
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
      }));
      const sim = new ZoneNpcSim(id, world, camps);
      sim.safe = safe;
      return sim;
    } catch {
      return null; // pas une map zone (gate, base...) : pas de simu NPC
    }
  }

  setPlayer(clientId, x, y, flags = {}) {
    const f = (flags && typeof flags === "object") ? flags : { dead: flags };
    this.players.set(String(clientId), {
      x: Number(x) || 0, y: Number(y) || 0,
      dead: f.dead === true,
      safe: f.safe === true,
    });
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

  // Cible valide : vivante et hors zone sure.
  validTarget(p) {
    return !!p && !p.dead && !p.safe;
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

  randomPos(pad = 80) {
    // Les NPC peuvent aller partout sur la map, meme sur la base.
    // Aucune exclusion de zone sure (evite les stacks aux bords).
    return {
      x: pad + Math.random() * Math.max(1, this.world.w - pad * 2),
      y: pad + Math.random() * Math.max(1, this.world.h - pad * 2),
    };
  }

  spawnFor(camp, nowMs) {
    const uid = slotUid(this.mapId, camp.id);
    const stats = statsFor(camp.type);
    if (!stats) return; // type inconnu : slot ignore definitivement
    const isCubikon = camp.type === "npc_Cubikon";
    const pos = isCubikon ? { x: camp.x, y: camp.y } : this.randomPos();
    markAlive(this.universe, this.mapId, uid, nowMs);
    const prev = this.entries.get(uid);
    this.entries.set(uid, {
      uid, campId: camp.id, type: camp.type,
      x: clamp(pos.x, 80, this.world.w - 80),
      y: clamp(pos.y, 80, this.world.h - 80),
      angle: Math.random() * TAU,
      hp: stats.hpMax, sh: stats.shMax,
      hpMax: stats.hpMax, shMax: stats.shMax,
      speed: stats.speed, dr: stats.dr, spread: stats.spread,
      passive: !!stats.passive, kamikaze: !!stats.kamikaze,
      explodeOnTouch: !!stats.explodeOnTouch, explodeRadius: stats.explodeRadius, explodeDmg: stats.explodeDmg,
      canShoot: stats.canShoot, shootRange: stats.shootRange, shootRate: stats.shootRate,
      bulletDmg: stats.bulletDmg, burst: stats.burst, shootCd: 0.2 + Math.random() * 0.5,
      aggroRange: camp.aggroRange, aggroHoldMs: Math.max(1000, (camp.aggroHold ?? 3.5) * 1000),
      aggroBy: null, aggroUntil: 0,
      tx: null, ty: null, killer: null, firstBy: null, lastHitBy: null,
      orbitDir: Math.random() < 0.5 ? -1 : 1, orbitT: 2 + Math.random() * 3,
      seq: (Number(prev?.seq) || 0) + 1, // incarnation : anti-confusion au respawn
    });
  }


  drainPlayerHits() {
    if (!this.playerHits.length) return [];
    return this.playerHits.splice(0, this.playerHits.length);
  }

  applyHit(clientId, hit) {
    const uid = String(hit?.uid || "");
    const entry = this.entries.get(uid);
    if (!entry || !(entry.hp > 0)) return;
    const raw = Number(hit?.dmg);
    if (!Number.isFinite(raw) || raw < 0 || raw > 1e8) return;
    // Premier attaquant = credit du kill (pas le coup de grace).
    if (entry.firstBy == null) entry.firstBy = String(clientId);
    entry.lastHitBy = String(clientId);
    const nowMs = Date.now();
    const slowPct = clamp(Number(hit?.slowPct) || 0, 0, 95);
    const slowSec = clamp(Number(hit?.slowSec) || 0, 0, 30);
    const freezeSec = clamp(Number(hit?.freezeSec) || 0, 0, 5);
    if (slowPct > 0 && slowSec > 0) {
      entry.slowPct = Math.max(Number(entry.slowPct) || 0, slowPct);
      entry.slowUntil = Math.max(Number(entry.slowUntil) || 0, nowMs + slowSec * 1000);
    }
    if (freezeSec > 0) entry.freezeUntil = Math.max(Number(entry.freezeUntil) || 0, nowMs + freezeSec * 1000);
    let applied = 0;
    if (hit?.kind === "sab") {
      // Drain bouclier seul (miroir drainShield) : jamais de coque.
      const drained = Math.min(Math.max(0, entry.sh), Math.max(0, raw));
      entry.sh -= drained;
      applied = drained;
    } else {
      const res = damageEnemyLayers(entry, Math.max(0, raw), {
        shieldPenetration: clamp(Number(hit?.pen ?? 0), 0, 1),
        weakenShields: clamp(Number(hit?.weaken ?? 0), 0, 10),
        shieldSpread: entry.spread,
        critChance: Number.isFinite(Number(hit?.critChance)) ? Number(hit.critChance) : 0.05,
        critMultiplier: Number.isFinite(Number(hit?.critMult)) ? Number(hit.critMult) : 1.5,
        variance: 0.05,
        random: Math.random,
      });
      applied = Number(res?.total) || 0;
    }
    // Feed degats (100 ms) : les autres ecrans voient les chiffres.
    if (applied > 0) {
      const key = `${uid}|${clientId}`;
      this.feed.set(key, { uid, by: String(clientId), total: Math.round((this.feed.get(key)?.total || 0) + applied) });
    }
    // Provoque : poursuit son agresseur quelques secondes (comme en solo).
    entry.aggroBy = String(clientId);
    entry.aggroUntil = Date.now() + (Number(entry.aggroHoldMs) || 3500);
    if (!(entry.hp > 0)) {
      entry.hp = 0;
      entry.sh = 0;
      // Credit au premier attaquant (repli : dernier si parti).
      const kb = entry.firstBy != null && this.players.has(entry.firstBy) ? entry.firstBy : entry.lastHitBy;
      entry.killer = String(kb || clientId);
      entry.cause = "gun";
      try { markDead(this.universe, this.mapId, uid, Date.now()); } catch {}
      this.deaths.push({ uid, type: entry.type, x: Math.round(entry.x), y: Math.round(entry.y), killer: entry.killer, cause: "gun", seq: entry.seq || 0, at: Date.now() });
    }
  }

  tick(dtSec = 0.1) {
    const nowMs = Date.now();
    const dt = Math.max(0.01, Math.min(0.5, Number(dtSec) || 0.1));
    // 1) Respawns.
    for (const camp of this.camps) {
      let alive = 0;
      for (const e of this.entries.values()) {
        if (e.campId === camp.id && e.hp > 0) alive++;
      }
      if (alive >= camp.maxAlive) continue;
      const cd = (this.campT.get(camp.id) || 0) - dt;
      if (cd > 0) { this.campT.set(camp.id, cd); continue; }
      const slot = getSlot(this.universe, this.mapId, slotUid(this.mapId, camp.id));
      if (!slot) continue;
      if (slot.alive === false && Number(slot.respawnAtMs) > nowMs) {
        this.campT.set(camp.id, 1);
        continue;
      }
      if (!statsFor(camp.type)) continue; // type inconnu : on n'essaie plus
      this.spawnFor(camp, nowMs);
      this.campT.set(camp.id, camp.respawn);
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
      const frozen = nowMs < Number(e.freezeUntil || 0);
      const slowMult = nowMs < Number(e.slowUntil || 0)
        ? Math.max(0.05, 1 - clamp(Number(e.slowPct) || 0, 0, 95) / 100)
        : 1;
      // Kamikaze au contact : explose, la victime touche la recompense.
      if (e.kamikaze && e.explodeOnTouch) {
        let victim = null, victimD2 = e.explodeRadius * e.explodeRadius;
        for (const [pid, p] of this.players) {
          if (!this.validTarget(p)) continue;
          const dx = p.x - e.x, dy = p.y - e.y, d2 = dx * dx + dy * dy;
          if (d2 < victimD2) { victimD2 = d2; victim = pid; }
        }
        if (victim != null) {
          this.playerHits.push({ playerId: String(victim), npcUid: e.uid, damage: Math.max(0, Number(e.explodeDmg) || 0), kind: "boom" });
          e.hp = 0; e.sh = 0; e.killer = String(victim); e.cause = "boom";
          try { markDead(this.universe, this.mapId, e.uid, nowMs); } catch {}
          this.deaths.push({ uid: e.uid, type: e.type, x: Math.round(e.x), y: Math.round(e.y), killer: String(victim), cause: "boom", seq: e.seq || 0, at: nowMs });
          continue;
        }
      }
      // Agresseur provoque (encore valide).
      let attacker = null;
      if (e.aggroBy && nowMs < Number(e.aggroUntil || 0)) {
        const p = this.players.get(e.aggroBy);
        if (this.validTarget(p)) attacker = { id: e.aggroBy, x: p.x, y: p.y };
      }
      // Proximite : rayon du camp (passifs : seulement si provoques).
      let close = null, closeD = Number(e.aggroRange) || 700;
      if (!e.passive || attacker) {
        for (const [pid, p] of this.players) {
          if (!this.validTarget(p)) continue;
          const d = Math.hypot(p.x - e.x, p.y - e.y);
          if (d < closeD) { closeD = d; close = { id: pid, x: p.x, y: p.y }; }
        }
      }
      const chase = attacker || close;
      e.chaseId = chase ? chase.id : null;
      // Les NPC peuvent aller partout sur la map, meme sur la base :
      // aucune repulsion / glissade autour des zones sures (c'etait ca
      // qui les faisait se stacker en haut / a gauche de la base).
      // La zone sure reste une protection d'aggro (validTarget), pas un mur.
      let mx = 0, my = 0, spd = 0;
      const fleeing = !e.kamikaze && e.hpMax > 0 && e.hp / e.hpMax < 0.10;
      const from = attacker || close;
      if (fleeing && from) {
        // Fuite : s'eloigne de la menace, rattrapable.
        const dx = e.x - from.x, dy = e.y - from.y;
        const d = Math.hypot(dx, dy) || 1;
        mx = dx / d; my = dy / d; spd = e.speed * 0.85;
        e.angle = Math.atan2(dy, dx);
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
      if (frozen) spd = 0;
      else spd *= slowMult;
      e.x = clamp(e.x + mx * spd * dt, 80, this.world.w - 80);
      e.y = clamp(e.y + my * spd * dt, 80, this.world.h - 80);

      // Tirs NPC autoritaires. Le client conserve les projectiles visuels,
      // mais seul cet impact serveur retire effectivement PV/bouclier.
      e.shootCd = Math.max(0, Number(e.shootCd || 0) - dt);
      if (!frozen && e.canShoot !== false && e.shootRate > 0 && chase && this.validTarget(this.players.get(String(chase.id)))) {
        const distance = Math.hypot(chase.x - e.x, chase.y - e.y);
        if (distance <= e.shootRange && e.shootCd <= 0) {
          e.shootCd = (1 / Math.max(0.001, e.shootRate)) * (0.85 + Math.random() * 0.3);
          for (let shot = 0; shot < e.burst; shot++) {
            if (Math.random() < 0.15) continue;
            const damage = Math.max(1, Math.round(e.bulletDmg * (0.95 + Math.random() * 0.1)));
            this.playerHits.push({ playerId: String(chase.id), npcUid: e.uid, damage, kind: "laser" });
          }
        }
      }
    }
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
    const list = [];
    for (const e of this.entries.values()) {
      if (e.hp > 0) {
        list.push({
          uid: e.uid, type: e.type,
          x: Math.round(e.x), y: Math.round(e.y),
          angle: Math.round(e.angle * 100) / 100,
          hp: Math.max(1, Math.round(e.hp)), sh: Math.max(0, Math.round(e.sh)),
          hpMax: e.hpMax, shMax: e.shMax, alive: true, seq: e.seq || 0,
          slowPct: nowMs < Number(e.slowUntil || 0) ? Number(e.slowPct) || 0 : 0,
          slowT: Math.max(0, (Number(e.slowUntil) || 0) - nowMs) / 1000,
          freezeT: Math.max(0, (Number(e.freezeUntil) || 0) - nowMs) / 1000,
          // Cible partagee : la poursuite en cours si elle est encore valide
          // (tous les ecrans voient le NPC tirer le meme joueur).
          aggro: (() => {
            if (!e.chaseId) return null;
            const p = this.players.get(e.chaseId);
            return this.validTarget(p) ? e.chaseId : null;
          })(),
        });
      } else if (e.killer != null) {
        list.push({ uid: e.uid, type: e.type, alive: false, killer: e.killer, cause: e.cause || "gun", seq: e.seq || 0 });
      }
    }
    return { list, deaths: this.deaths.slice(), dmg };
  }
}
