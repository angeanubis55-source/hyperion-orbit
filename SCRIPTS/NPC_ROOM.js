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
    this.recentGone = []; // uids retires sans mort (despawn vague) : purge immediate cote client
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
        speed: (c?.speed ?? null),
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
      untargetableUntil: Math.max(0, Number(f.untargetableUntil) || 0),
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
    return !!p && !p.dead && !p.safe && Date.now() >= Number(p.untargetableUntil || 0);
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
      speed: (camp.speed ?? stats.speed), dr: stats.dr, spread: stats.spread,
      passive: !!stats.passive, kamikaze: !!stats.kamikaze,
      explodeOnTouch: !!stats.explodeOnTouch, explodeRadius: stats.explodeRadius, explodeDmg: stats.explodeDmg,
      canShoot: stats.canShoot, shootRange: stats.shootRange, shootRate: stats.shootRate,
      bulletDmg: stats.bulletDmg, burst: stats.burst, shootCd: 0.2 + Math.random() * 0.5,
      aggroRange: camp.aggroRange, aggroHoldMs: Math.max(1000, (camp.aggroHold ?? 3.5) * 1000),
      aggroBy: null, aggroUntil: 0,
      tx: null, ty: null, killer: null, firstBy: null, lastHitBy: null,
      lockBy: null, lockHitAt: 0, lockReleaseAt: 0, hitHist: [],
      orbitDir: Math.random() < 0.5 ? -1 : 1, orbitT: 2 + Math.random() * 3,
      seq: (Number(prev?.seq) || 0) + 1, // incarnation : anti-confusion au respawn
    });
  }


drainPlayerHits() {
    if (!this.playerHits.length) return [];
    return this.playerHits.splice(0, this.playerHits.length);
  }

  // --- Vague Cubikon partagee (parite solo, visible par tous) ---
  // Le premier impact sur un Cubikon declenche son animation d'ouverture
  // (delay 2 s -> open -> hold 2 s) puis le serveur fait apparaitre 20
  // Protegits ancres au Cubikon. Sans nouveau coup pendant 10 s, les
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

  spawnCubikonWave(cub, nowMs) {
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
      if (e && e.campId == null && e.hp > 0) n++;
    }
    return n;
  }

  spawnOnKillWave(dead, nowMs) {
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
    const shooter = this.players.get(String(clientId));
    // La zone sure empeche le PvP, mais le gameplay actuel autorise encore
    // les tirs sur NPC depuis sa bordure. Ne pas rejeter ces impacts : le
    // client predirait sinon la mort avant que le serveur ressuscite le NPC.
    if (!shooter || shooter.dead) return;
    const dx = Number(entry.x) - Number(shooter.x);
    const dy = Number(entry.y) - Number(shooter.y);
    if (dx * dx + dy * dy > 6500 * 6500) return;
    const raw = Number(hit?.dmg);
    // Conserve le plafond historique : certaines configurations tres haut
    // niveau peuvent legitimement depasser 10 M sur un impact cumule.
    if (!Number.isFinite(raw) || raw < 0 || raw > 1e8) return;
    // Premier attaquant = credit du kill (pas le coup de grace).
    if (entry.firstBy == null) entry.firstBy = String(clientId);
    entry.lastHitBy = String(clientId);
    const nowMs = Date.now();
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
    // Pendant l'IEM, ses tirs peuvent continuer a toucher le NPC mais ne
    // doivent pas recreer silencieusement l'ancien lock.
    if (this.validTarget(shooter)) {
      entry.aggroBy = String(clientId);
      entry.aggroUntil = Date.now() + (Number(entry.aggroHoldMs) || 3500);
      entry.pendingAggroBy = null;
      entry.retreating = false;
    } else if (shooter.safe && Date.now() >= Number(shooter.untargetableUntil || 0)) {
      // Le tir depuis une ZNA est memorise : le NPC attend que le pilote
      // perde sa protection avant de reagir.
      entry.pendingAggroBy = String(clientId);
    }
    if (entry.type === "npc_Cubikon") {
      // Premier impact de l'engagement : animation + vague partagees.
      // (Si le coup est fatal, la mort ci-dessous libere les minions.)
      entry.lastCubeHitAt = nowMs;
      if (entry.hp > 0 && !entry.cubeArmed && !entry.cube) {
        if (this.countCubikonMinions(uid) < ZoneNpcSim.CUBIKON_WAVE_MAX) {
          entry.cubeArmed = true;
          entry.cube = { phase: "delay", until: nowMs + 2000, spawnAt: nowMs + 4600 };
        }
      }
    }
    if (!(entry.hp > 0)) {
      entry.hp = 0;
      entry.sh = 0;
      // Credit au premier attaquant (repli : dernier si parti).
      const kb = entry.firstBy != null && this.players.has(entry.firstBy) ? entry.firstBy : entry.lastHitBy;
      entry.killer = String(kb || clientId);
      entry.cause = "gun";
      entry.cube = null;
      if (!entry.campId) entry.deadAt = nowMs;
      if (entry.type === "npc_Cubikon") {
        try { this.releaseCubikonMinions(entry, nowMs); } catch {}
      }
      try { this.spawnOnKillWave(entry, nowMs); } catch {}
      try { markDead(this.universe, this.mapId, uid, Date.now()); } catch {}
      this.deaths.push({ uid, type: entry.type, x: Math.round(entry.x), y: Math.round(entry.y), killer: entry.killer, cause: "gun", seq: entry.seq || 0, at: Date.now() });
    }
  }

  tick(dtSec = 0.1) {
    const nowMs = Date.now();
    const dt = Math.max(0.01, Math.min(0.5, Number(dtSec) || 0.1));
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
      this.spawnFor(camp, nowMs);
      this.campT.set(camp.id, camp.respawn);
    }
    // 1bis) Vagues Cubikon : transitions d'animation, spawn partage,
    // dechet des minions orphelins et re-armement apres 10 s sans coup.
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
      // Entite hors-camp morte (minion ou vague onKill) : purge apres
      // diffusion du journal (3 s).
      if (!m.campId && !(m.hp > 0) && nowMs - Number(m.deadAt || 0) > 3000) {
        this.entries.delete(muid);
        continue;
      }
      // Cubikon vivant sans coup depuis 10 s : minions retires
      // silencieusement (parite solo : despawn 0.5 s, sans recompense),
      // la prochaine salve re-arme la vague.
      if (m.type === "npc_Cubikon" && m.cubeArmed && (m.hp > 0)
        && nowMs - Number(m.lastCubeHitAt || 0) > 10000) {
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
      // Lock premier attaquant : le détenteur le perd s'il est mort, en ZNA
      // ou sans dégât depuis 5 s. Grace de 5 s (un dégât du détenteur
      // l'annule, voir applyHit), puis TRANSFERT AUTO au prétendant le plus
      // récent (pas besoin de taper pour passer rouge) ; personne → libre.
      // firstBy suit pour que la récompense aille au nouveau rouge.
      if (e.lockBy != null) {
        const holder = this.players.get(String(e.lockBy));
        const holderOut = !holder || holder.dead === true || holder.safe === true;
        const holderIdle = nowMs - Number(e.lockHitAt || 0) > ZoneNpcSim.LOCK_IDLE_MS;
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
          e.cube = null;
          if (!e.campId) e.deadAt = nowMs;
          try { this.spawnOnKillWave(e, nowMs); } catch {}
          try { markDead(this.universe, this.mapId, e.uid, nowMs); } catch {}
          this.deaths.push({ uid: e.uid, type: e.type, x: Math.round(e.x), y: Math.round(e.y), killer: String(victim), cause: "boom", seq: e.seq || 0, at: nowMs });
          continue;
        }
      }
      // Agresseur provoque (encore valide).
      let attacker = null;
      if (e.pendingAggroBy) {
        const pending = this.players.get(String(e.pendingAggroBy));
        if (this.validTarget(pending)) {
          e.aggroBy = String(e.pendingAggroBy);
          e.aggroUntil = nowMs + (Number(e.aggroHoldMs) || 3500);
          e.pendingAggroBy = null;
          e.retreating = false;
        }
      }
      if (e.aggroBy) {
        const p = this.players.get(e.aggroBy);
        if (nowMs < Number(e.aggroUntil || 0) && this.validTarget(p)) attacker = { id: e.aggroBy, x: p.x, y: p.y };
        else if (p?.safe) {
          e.retreating = true;
          e.retreatUntil = nowMs + 3000;
          e.shieldRegenAt = nowMs + 5000;
          e.retreatFromX = p.x;
          e.retreatFromY = p.y;
          e.aggroBy = null;
          e.aggroUntil = 0;
        } else if (nowMs >= Number(e.aggroUntil || 0)) {
          e.aggroBy = null;
          e.aggroUntil = 0;
        }
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
      if (chase) e.retreating = false;
      e.chaseId = chase ? chase.id : null;
      // Desengage par une ZNA : le NPC s'eloigne et recharge seulement son
      // bouclier. Sa coque ne se regenere jamais lors de ce repli.
      if (e.retreating && !chase) {
        if (nowMs >= Number(e.shieldRegenAt || 0)) {
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
      const fleeing = !e.kamikaze && e.hpMax > 0 && e.hp / e.hpMax < 0.10;
      const from = attacker || close;
      if (cubeAnchored) {
        if (e.tx == null || Math.hypot(e.tx - e.x, e.ty - e.y) < 100) {
          const a = Math.random() * TAU, dist = 200 + Math.random() * 500;
          e.tx = clamp(cubeMaster.x + Math.cos(a) * dist, 80, this.world.w - 80);
          e.ty = clamp(cubeMaster.y + Math.sin(a) * dist, 80, this.world.h - 80);
        }
        const dx = e.tx - e.x, dy = e.ty - e.y;
        const d = Math.hypot(dx, dy) || 1;
        mx = dx / d; my = dy / d; spd = e.speed * 0.7;
        if (spd > 0) e.angle = Math.atan2(dy, dx);
      } else if (fleeing && from) {
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
        // Cible partagee : la poursuite en cours si elle est encore valide
        // (tous les ecrans voient le NPC tirer le meme joueur). Sans
        // closure allouee par entree (pression GC a 20 Hz).
        let aggroId = null;
        if (e.chaseId) {
          const ap = this.players.get(e.chaseId);
          if (this.validTarget(ap)) aggroId = e.chaseId;
        }
        list.push({
          uid: e.uid, type: e.type,
          x: Math.round(e.x), y: Math.round(e.y),
          angle: Math.round(e.angle * 100) / 100,
          hp: Math.max(1, Math.round(e.hp)), sh: Math.max(0, Math.round(e.sh)),
          hpMax: e.hpMax, shMax: e.shMax, alive: true, seq: e.seq || 0,
          slowPct: nowMs < Number(e.slowUntil || 0) ? Number(e.slowPct) || 0 : 0,
          slowT: Math.max(0, (Number(e.slowUntil) || 0) - nowMs) / 1000,
          freezeT: Math.max(0, (Number(e.freezeUntil) || 0) - nowMs) / 1000,
          aggro: aggroId,
          // Lock premier attaquant (visuel rouge / gris) : id du détenteur.
          lock: e.lockBy != null ? String(e.lockBy) : null,
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
    return { list, deaths: this.deaths.slice(), dmg, gone };
  }
}
