// SCRIPTS/STATION_ROOM.js — Base de Combat PARTAGÉE (comme les enchères).
// UNE instance par clan sur le caillou : chaque clan ne voit et ne
// construit que la sienne. Le premier clan qui termine (Cœur + 9 modules)
// et clique Construire remporte le caillou : les modules des autres clans
// sont déposés et remboursés à leurs poseurs. Après construction, la
// station est publique (visible par tous) et indémontable.
// Le serveur tranche l'ordre (placement, retrait, construction,
// remboursements) ; les stocks restent gérés côté client (comme les mises
// d'enchères) : le client débite à l'acceptation, recrédite au retrait /
// remboursement. Solo-safe : sans serveur, le local continue comme avant.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { getAccountGameplayData, clanTagOfUser, clanIdOfTag, diploBetween } from "./ACCOUNT_SERVER.js";
import {
  STATION_HUB,
  STATION_CORE_HP,
  STATION_MODULE_HP,
  STATION_SLOT_OFFSETS,
  STATION_MODULE_SPRITES,
  STATION_SLOT_IDS,
  STATION_UNIQUE_MODULES,
  STATION_WEAPON_STATS,
  STATION_DEFLECT_RATE,
  STATION_DEFLECT_COST,
  STATION_DEFLECT_OFF_MS,
} from "../SRC/DATA/BATTLESTATION.js";
import { STATION_CENTERS } from "../SRC/DATA/STATION_CENTERS.js";

const STATE_FILE = process.env.ORBIT_STATION_FILE || "SERVER_DATA/station_state.json";
const INSTALL_CD_MS = 60000;
// Réparation : 85 000 PV/s sur le cœur, 42 500 PV/s par module, pendant 10 s.
const REPAIR_HUB_RATE = 85000;
const REPAIR_SLOT_RATE = 42500;
const REPAIR_MS = 10000;
// Maps avec station (une base par map). Centres : voir
// SRC/DATA/STATION_CENTERS.js (source unique serveur + client).
export const STATION_MAPS = new Set(STATION_CENTERS.map((s) => String(s.map || "").toLowerCase()));

// --- Défense de la base -------------------------------------------------
// Centre de la station par map (source unique : STATION_CENTERS.js).
const STATION_POS = Object.freeze(
  Object.fromEntries(
    STATION_CENTERS.map((s) => [String(s.map || "").toLowerCase(), Object.freeze({ x: Number(s.x) || 0, y: Number(s.y) || 0 })])
  )
);

// État de tir : mapId -> { slotId: prochain tir autorisé (ms) }. Transitoire.
const combatNext = {};

// Modules d'armes en état de tirer (base construite uniquement) :
// { clan, firm, modules: [{ slot, resourceId, x, y, kind, range, dmg, periodMs }] }.
export function getStationDefense(mapId) {
  const key = String(mapId || "").toLowerCase();
  if (!STATION_MAPS.has(key)) return null;
  const st = getStation(key);
  if (!st.built?.clan) return null;
  const inst = st.instances[st.built.clan];
  if (!inst) return null;
  const center = STATION_POS[key];
  if (!center) return null;
  const modules = [];
  // Module DMG équipé (posé, installation terminée, en vie) : +10 % aux
  // dégâts des lasers et roquettes de la base.
  const nowMs = Date.now();
  const hasDmg = STATION_SLOT_IDS.some((sid) => {
    const q = inst.slots[sid];
    return q && q.resourceId === "station_module_dmg" && Number(q.hp) > 0 && Number(q.cooldownUntil) <= nowMs && !q.replace;
  });
  const dmgMult = hasDmg ? 1.1 : 1;
  STATION_SLOT_IDS.forEach((id, i) => {
    const p = inst.slots[id];
    const spec = p?.resourceId ? STATION_WEAPON_STATS[p.resourceId] : null;
    if (!p?.resourceId || !spec) return;
    if (!(Number(p.hp) > 0)) return;
    if (p.replace) return; // en cours de remplacement : silencieux.
    const off = STATION_SLOT_OFFSETS[i] || { x: 0, y: 0 };
    modules.push({
      slot: id,
      resourceId: String(p.resourceId),
      x: center.x + Number(off.x || 0),
      y: center.y + Number(off.y || 0),
      kind: spec.kind,
      range: spec.range,
      dmg: Math.max(1, Math.round(spec.dmg * dmgMult)),
      periodMs: spec.periodMs,
    });
  });
  if (!modules.length) return null;
  return { clan: String(st.built.clan || ""), firm: String(st.owner?.firm || "").toLowerCase(), modules, dmgBonus: hasDmg };
}

export function stationShotReady(mapId, slot, now) {
  const key = String(mapId || "").toLowerCase();
  return Number(combatNext[key]?.[slot] || 0) <= now;
}

// Proprios des bases construites (toutes maps) : [{map, clan, firm, builtAt}].
// Sert la carte stellaire (couleur relation + panneau d'info). Positions :
// STATION_CENTERS.js (source unique, pas de doublon snapshot). Léger.
export function getStationOwners() {
  const out = [];
  try {
    for (const mapId of STATION_MAPS) {
      const key = String(mapId || "").toLowerCase();
      const st = getStation(key);
      if (!st?.built?.clan) continue;
      out.push({
        map: key,
        clan: String(st.built.clan || "").toUpperCase().slice(0, 5),
        firm: String(st.owner?.firm || st.built?.firm || "").toLowerCase().slice(0, 16),
        builtAt: Math.max(0, Number(st.builtAt) || 0),
      });
    }
  } catch {}
  return out;
}

// Vue temps réel pour tous les joueurs (toutes maps) : bases construites
// avec modules DMG/HON/EXP/REP opérationnels (posés, installation terminée,
// en vie). Sert les bonus de clan (+2 % dégâts, +10 % honneur, +10 % exp,
// +2 % réparation).
export function getClanBaseBonuses() {
  const out = [];
  try {
    for (const mapId of STATION_MAPS) {
      const key = String(mapId || "").toLowerCase();
      const st = getStation(key);
      if (!st?.built?.clan) continue;
      const inst = st.instances[st.built.clan];
      if (!inst) continue;
      const nowMs = Date.now();
      const equipped = (rid) => STATION_SLOT_IDS.some((sid) => {
        const p = inst.slots[sid];
        return p && p.resourceId === rid && Number(p.hp) > 0 && Number(p.cooldownUntil) <= nowMs && !p.replace;
      });
      const mods = {
        dmg: equipped("station_module_dmg"),
        hon: equipped("station_module_hon"),
        exp: equipped("station_module_exp"),
        rep: equipped("station_module_rep"),
      };
      if (!mods.dmg && !mods.hon && !mods.exp && !mods.rep) continue;
      out.push({ map: key, clan: String(st.built.clan || "").toUpperCase(), ...mods });
    }
  } catch {}
  return out;
}

// Déflecteur (banque de temps explicite) :
// st.deflect = { bank (s), active, until (ms), disabledUntil (ms), lastTick }.
// +3 s par seconde hors bouclier (même pendant une coupure) ; bouclier à
// 90 min cumulées (consomme tout le stock). Coupure = pas de déclenchement
// (ni de bouclier forcé) ; à la fin, reprise normale. Couper en plein
// bouclier rend le temps restant à la banque.
function stationDeflectTick(st, nowMs) {
  const d = st.deflect;
  if (!st.built || !d || typeof d !== "object") return false;
  let changed = false;
  const last = Math.max(Number(d.lastTick) || nowMs, 0);
  const dt = Math.max(0, nowMs - last);
  d.lastTick = nowMs;
  const off = Number(d.disabledUntil || 0) > nowMs;
  if (d.active) {
    if (nowMs >= Number(d.until) || 0) {
      d.active = false;
      d.until = 0;
      changed = true;
    }
    return changed;
  }
  if (dt > 0) {
    d.bank = Math.max(0, Number(d.bank) || 0) + STATION_DEFLECT_RATE * (dt / 1000);
    changed = true;
  }
  if (!off && Number(d.bank) >= STATION_DEFLECT_COST) {
    d.active = true;
    d.until = nowMs + Math.round(Number(d.bank)) * 1000;
    d.bank = 0;
    changed = true;
  }
  return changed;
}

export function stationShotFired(mapId, slot, periodMs, now) {
  const key = String(mapId || "").toLowerCase();
  (combatNext[key] ||= {})[String(slot)] = now + Math.max(100, Number(periodMs) || 1000);
}

// Réparation passive du module REP : +5000 PV/s sur le cœur et chaque
// module en vie (module REP posé et installé requis). Retourne true si
// au moins un PV a été rendu (pour diffuser le sync).
export function applyStationPassiveHeal(mapId, nowMs) {
  try {
    const key = String(mapId || "").toLowerCase();
    if (!STATION_MAPS.has(key)) return false;
    const st = getStation(key);
    if (!st.built?.clan) return false;
    const inst = st.instances[st.built.clan];
    if (!inst) return false;
    const hasRep = STATION_SLOT_IDS.some((sid) => {
      const q = inst.slots[sid];
      return q && q.resourceId === "station_module_rep" && Number(q.hp) > 0 && Number(q.cooldownUntil) <= nowMs;
    });
    if (!hasRep) {
      st.repPassiveLast = nowMs;
      return false;
    }
    const from = Math.max(Number(st.repPassiveLast) || 0, nowMs - 1000);
    const to = nowMs;
    st.repPassiveLast = to;
    if (!(to > from)) return false;
    const add = 5000 * (to - from) / 1000;
    if (!(add > 0)) return false;
    let healed = false;
    if (inst.hub && Number(inst.hub.hp) > 0) {
      const cap = Number(inst.hub.hpMax) || STATION_CORE_HP;
      if (Number(inst.hub.hp) < cap) {
        inst.hub.hp = Math.min(cap, Number(inst.hub.hp) + add);
        healed = true;
      }
    }
    for (const sid of STATION_SLOT_IDS) {
      const p = inst.slots[sid];
      if (p && Number(p.hp) > 0) {
        const cap = Number(p.hpMax) || STATION_MODULE_HP;
        if (Number(p.hp) < cap) {
          p.hp = Math.min(cap, Number(p.hp) + add);
          healed = true;
        }
      }
    }
    if (healed) persist();
    return healed;
  } catch { return false; }
}

// Hostile pour la base ? Même clan : non. Guerre (clan connu) : oui.
// NAP/alliance : non. Sinon : autre firme = oui (même sans clan, comme
// le pseudo rouge en jeu), même firme = non (bleu). Sans aucune info : non.
export function isStationFoe(ownerClan, ownerFirm, victimClan, victimFirm) {
  const oc = String(ownerClan || "").toUpperCase();
  const vc = String(victimClan || "").toUpperCase();
  if (vc && vc === oc) return false;
  const of = String(ownerFirm || "").toLowerCase();
  const vf = String(victimFirm || "").toLowerCase();
  if (vc) {
    try {
      const a = clanIdOfTag(oc), b = clanIdOfTag(vc);
      if (a && b) {
        const rows = Array.isArray(diploBetween(a, b)) ? diploBetween(a, b) : [];
        const active = rows.filter((r) => String(r.status) === "active");
        if (active.some((r) => String(r.kind) === "war")) return true;
        if (active.some((r) => String(r.kind) === "nap" || String(r.kind) === "alliance")) return false;
      }
    } catch {}
  }
  if (of && of === vf) return false;
  if (!vc && !vf) return false;
  return true;
}
const VALID_PARTS = new Set([STATION_HUB.resourceId, ...Object.keys(STATION_MODULE_SPRITES || {})]);
const MAX_STR = 64;

let stations = {}; // mapId -> { instances: { CLAN: { hub, slots } }, built: null | { clan, firm }, owner: {} }
// Feed dégâts récents par map (comme le feed NPC) : les chiffres alliés
// s'affichent sur la cible station verrouillée. Fenêtre ~2,5 s (pas de
// consommation : un sync est construit par pair).
const dmgFeeds = {}; // mapId -> [{ target, by, total, at }]
// Riposte : un joueur non-hostile (bleu) qui tape la base devient cible
// des défenses pendant 30 s (prolongé à chaque coup). userId -> until (ms).
// Les ids pairs `u_<compte>` et bruts sont normalisés (sans préfixe).
const stationAggro = {}; // mapId -> Map(rawId -> until)
function normAggroId(uid) {
  return String(uid || "").replace(/^u_/i, "").slice(0, 64);
}
export function isStationRetaliation(mapId, userId, nowMs) {
  try {
    const key = String(mapId || "").toLowerCase();
    const m = stationAggro[key];
    if (!m) return false;
    const nid = normAggroId(userId);
    if (!nid) return false;
    const until = m.get(nid);
    if (!until) return false;
    const now = Number(nowMs) || Date.now();
    if (now >= Number(until)) {
      try { m.delete(nid); } catch {}
      return false;
    }
    return true;
  } catch { return false; }
}
function touchStationAggro(key, userId, nowMs) {
  try {
    const nid = normAggroId(userId);
    if (!nid) return;
    let m = stationAggro[key];
    if (!m) { m = new Map(); stationAggro[key] = m; }
    m.set(nid, Number(nowMs) + 30000);
    if (m.size > 200) {
      const now = Number(nowMs) || Date.now();
      for (const [k, v] of m) {
        if (now >= Number(v)) m.delete(k);
        if (m.size <= 150) break;
      }
    }
  } catch {}
}

function emptyInstance() {
  const slots = {};
  for (const id of STATION_SLOT_IDS) slots[id] = null;
  return { hub: null, slots };
}

function emptyStation() {
  return { instances: {}, built: null, owner: {} };
}

function getStation(mapId) {
  const key = String(mapId || "").toLowerCase();
  if (!stations[key]) stations[key] = emptyStation();
  const st = stations[key];
  if (!st.instances || typeof st.instances !== "object") st.instances = {};
  return st;
}

function getInstance(st, clan) {
  const c = String(clan || "").toUpperCase().slice(0, 5);
  if (!c) return null;
  if (!st.instances[c]) st.instances[c] = emptyInstance();
  return st.instances[c];
}

function cleanStr(v, max = 20) {
  return String(v || "").slice(0, max);
}

function partOf(p) {
  if (!p || typeof p !== "object" || !p.resourceId) return null;
  const resourceId = String(p.resourceId);
  const hpMax = resourceId === STATION_HUB.resourceId ? STATION_CORE_HP : STATION_MODULE_HP;
  return {
    resourceId,
    clan: String(p.clan || "").toUpperCase().slice(0, 5),
    pseudo: String(p.pseudo || "").slice(0, 20),
    userId: String(p.userId || "").slice(0, MAX_STR),
    cooldownUntil: Math.max(0, Number(p.cooldownUntil) || 0),
    hp: Math.max(0, Number(p.hp) || hpMax),
  };
}

function userBusy(inst, userId, now) {
  const uid = String(userId || "");
  if (inst.hub && String(inst.hub.userId || "") === uid && Number(inst.hub.cooldownUntil) > now) return true;
  for (const id of STATION_SLOT_IDS) {
    const p = inst.slots[id];
    if (p && String(p.userId || "") === uid && Number(p.cooldownUntil) > now) return true;
  }
  return false;
}

function instancePlaced(inst) {
  let n = inst.hub?.resourceId ? 1 : 0;
  for (const id of STATION_SLOT_IDS) if (inst.slots[id]?.resourceId) n++;
  return n;
}

function instanceCompleted(inst, now = Date.now()) {
  let n = inst?.hub?.resourceId && Number(inst.hub.cooldownUntil) <= now ? 1 : 0;
  for (const id of STATION_SLOT_IDS) {
    const part = inst?.slots?.[id];
    if (part?.resourceId && Number(part.cooldownUntil) <= now) n++;
  }
  return n;
}

function persist() {
  try {
    mkdirSync(dirname(STATE_FILE), { recursive: true });
    writeFileSync(STATE_FILE, JSON.stringify({ stations }), "utf8");
  } catch {}
}

function restore() {
  try {
    const raw = JSON.parse(readFileSync(STATE_FILE, "utf8") || "{}");
    const saved = raw?.stations;
    if (!saved || typeof saved !== "object") return;
    for (const [mapId, st] of Object.entries(saved)) {
      if (!STATION_MAPS.has(String(mapId).toLowerCase())) continue;
      if (!st || typeof st !== "object") continue;
      const fresh = emptyStation();
      // Migration ancien format (instance unique partagée) : répartition
      // des modules déjà posés vers l'instance de leur clan.
      const migratePart = (p, fallbackClan) => {
        const clean = partOf(p);
        if (!clean || !VALID_PARTS.has(clean.resourceId)) return null;
        if (!clean.clan && fallbackClan) clean.clan = fallbackClan;
        return clean.clan ? clean : null;
      };
      if (st.instances && typeof st.instances === "object" && !st.hub && !st.slots) {
        // Nouveau format.
        for (const [tag, inst] of Object.entries(st.instances)) {
          const c = String(tag || "").toUpperCase().slice(0, 5);
          if (!c || !inst || typeof inst !== "object") continue;
          const mine = emptyInstance();
          const hub = partOf(inst.hub);
          if (hub && VALID_PARTS.has(hub.resourceId)) mine.hub = hub;
          if (inst.slots && typeof inst.slots === "object") {
            for (const id of STATION_SLOT_IDS) {
              const p = partOf(inst.slots[id]);
              if (p && VALID_PARTS.has(p.resourceId)) mine.slots[id] = p;
            }
          }
          fresh.instances[c] = mine;
        }
      } else {
        // Ancien format : tout partagé, ventilé par clan poseur.
        const takeHub = migratePart(st.hub);
        if (takeHub) {
          const inst = getInstance(fresh, takeHub.clan);
          if (inst && !inst.hub) inst.hub = takeHub;
        }
        if (st.slots && typeof st.slots === "object") {
          for (const id of STATION_SLOT_IDS) {
            const p = migratePart(st.slots[id]);
            if (!p) continue;
            const inst = getInstance(fresh, p.clan);
            if (inst && !inst.slots[id]) inst.slots[id] = p;
          }
        }
      }
      if (st.built === true || (st.built && typeof st.built === "object")) {
        const b = st.built === true ? null : st.built;
        const bClan = String(b?.clan || st?.owner?.clan || "").toUpperCase().slice(0, 5);
        if (bClan && fresh.instances[bClan]) {
          fresh.built = { clan: bClan, firm: String(b?.firm || st?.owner?.firm || "").toLowerCase() };
        }
      }
      if (st.owner && typeof st.owner === "object") {
        fresh.owner = {
          firm: String(st.owner.firm || "").toLowerCase(),
          ...(String(st.owner.clan || "") ? { clan: String(st.owner.clan).toUpperCase().slice(0, 5) } : {}),
        };
      }
      // Occupation : reprise telle quelle ; anciennes bases sans date :
      // datées maintenant (la durée repart de zéro une fois).
      if (fresh.built) {
        fresh.builtAt = Number(st.builtAt) > 0 ? Number(st.builtAt) : Date.now();
      }
      // Réparation en cours au redémarrage : reprise (sans rattrapage).
      if (st.repair && typeof st.repair === "object" && Number(st.repair.until) > Date.now()) {
        fresh.repair = {
          until: Number(st.repair.until),
          rateHub: Math.max(1, Number(st.repair.rateHub) || 85000),
          rateSlot: Math.max(1, Number(st.repair.rateSlot) || 42500),
          startedAt: Number(st.repair.startedAt) || Date.now(),
          lastTick: Date.now(),
        };
      }
      // Déflecteur : reprend l'état (banque conservée, pas de rattrapage).
      // Ancien format {disabled} : traité comme non coupé.
      if (fresh.built && st.deflect && typeof st.deflect === "object") {
        fresh.deflect = {
          bank: Math.max(0, Number(st.deflect.bank) || 0),
          active: st.deflect.active === true,
          until: Math.max(0, Number(st.deflect.until) || 0),
          disabledUntil: Math.max(0, Number(st.deflect.disabledUntil) || 0),
          lastTick: Date.now(),
        };
      }
      stations[String(mapId).toLowerCase()] = fresh;
    }
  } catch {}
}

restore();

// --- Vues ---------------------------------------------------------------
// Instance du clan spectateur uniquement (vide si rien posé) ; station
// construite = publique pour tous. Aucune info sur les autres clans.
export function getStationSync(mapId, viewerClan) {
  const key = String(mapId || "").toLowerCase();
  const st = getStation(key);
  const vc = String(viewerClan || "").toUpperCase().slice(0, 5);
  const show = (p) => {
    if (!p || (!p.resourceId && !p.replace?.resourceId)) return null;
    const resId = p.resourceId ? String(p.resourceId) : null;
    const out = {
      resourceId: resId,
      clan: p.clan,
      pseudo: p.pseudo,
      cooldownUntil: p.cooldownUntil,
      userId: p.userId,
      hp: Math.max(0, Number(p.hp) || 0),
      hpMax: resId === STATION_HUB.resourceId ? STATION_CORE_HP : STATION_MODULE_HP,
    };
    // Remplacement en cours : l'ancien reste affiché, le client décompte
    // via replace.cooldownUntil puis resync (application paresseuse).
    if (p.replace && p.replace.resourceId) {
      out.replace = {
        resourceId: String(p.replace.resourceId),
        clan: String(p.replace.clan || "").toUpperCase().slice(0, 5),
        pseudo: String(p.replace.pseudo || "").slice(0, 20),
        cooldownUntil: Math.max(0, Number(p.replace.cooldownUntil) || 0),
      };
    }
    return out;
  };
  let hub = null;
  const slots = {};
  let placed = 0;
  // Réparation en cours : appliquée paresseusement au fil des syncs
  // (pas de tick serveur). Cœur + modules en vie uniquement.
  try {
    if (st.built && st.built.clan && st.instances[st.built.clan] && st.repair) {
      const nowMs = Date.now();
      const rp = st.repair;
      const from = Math.max(Number(rp.lastTick) || 0, Number(rp.startedAt) || 0);
      const to = Math.min(nowMs, Number(rp.until) || 0);
      if (to > from) {
        const dt = (to - from) / 1000;
        const addHub = Math.max(0, Number(rp.rateHub) || 0) * dt;
        const addSlot = Math.max(0, Number(rp.rateSlot) || 0) * dt;
        if (addHub > 0 || addSlot > 0) {
          const inst = st.instances[st.built.clan];
          if (addHub > 0 && inst.hub && Number(inst.hub.hp) > 0) {
            inst.hub.hp = Math.min(Number(inst.hub.hpMax) || STATION_CORE_HP, Number(inst.hub.hp) + addHub);
          }
          if (addSlot > 0) for (const sid of STATION_SLOT_IDS) {
            const p = inst.slots[sid];
            if (p && Number(p.hp) > 0) {
              p.hp = Math.min(Number(p.hpMax) || STATION_MODULE_HP, Number(p.hp) + addSlot);
            }
          }
          rp.lastTick = to;
          persist();
        }
      }
      if (nowMs >= (Number(rp.until) || 0)) {
        st.repair = null;
        persist();
      }
    }
  } catch {}
  // Remplacements terminés : appliqués paresseusement ici (pas de tick
  // serveur) — le client resync quand son décompte local expire.
  try {
    if (st.built && st.built.clan && st.instances[st.built.clan]) {
      const inst = st.instances[st.built.clan];
      let touched = false;
      const nowMs = Date.now();
      for (const sid of STATION_SLOT_IDS) {
        const p = inst.slots[sid];
        if (p?.replace && p.replace.resourceId && Number(p.replace.cooldownUntil) <= nowMs) {
          const r = p.replace;
          inst.slots[sid] = {
            resourceId: String(r.resourceId),
            clan: String(r.clan || "").toUpperCase().slice(0, 5),
            pseudo: String(r.pseudo || "").slice(0, 20),
            userId: String(r.userId || ""),
            cooldownUntil: 0,
            hp: STATION_MODULE_HP,
          };
          touched = true;
        }
      }
      if (touched) persist();
    }
  } catch {}
  if (st.built) {
    const inst = (st.built?.clan && st.instances[st.built.clan]) || null;
    hub = show(inst?.hub);
    for (const id of STATION_SLOT_IDS) slots[id] = show(inst?.slots?.[id]);
    placed = instanceCompleted(inst || emptyInstance());
  } else if (vc && st.instances[vc]) {
    const inst = st.instances[vc];
    hub = show(inst.hub);
    for (const id of STATION_SLOT_IDS) slots[id] = show(inst.slots[id]);
    placed = instanceCompleted(inst);
  } else {
    for (const id of STATION_SLOT_IDS) slots[id] = null;
  }
  const total = 1 + STATION_SLOT_IDS.length;
  // Progression visible par tous (sans détail des modules adverses).
  // Seuls les modules TERMINÉS comptent. Les échéances permettent au client
  // de faire avancer le pourcentage au bon instant, sans libellé intermédiaire.
  const nowMs = Date.now();
  const counts = {};
  const installingUntil = {};
  for (const [tag, inst] of Object.entries(st.instances || {})) {
    if (!inst || typeof inst !== "object") continue;
    const c = String(tag).toUpperCase();
    let n = 0;
    const parts = [];
    if (inst.hub?.resourceId) parts.push(inst.hub);
    for (const id of STATION_SLOT_IDS) if (inst.slots?.[id]?.resourceId) parts.push(inst.slots[id]);
    for (const part of parts) {
      if (Number(part.cooldownUntil) > nowMs) {
        (installingUntil[c] ||= []).push(Number(part.cooldownUntil));
      }
      else n++;
    }
    if (n > 0 || installingUntil[c]?.length) {
      counts[c] = n;
    }
  }
  const perClan = Object.entries(counts)
    .map(([clan, count]) => ({ clan, count, installingUntil: installingUntil[clan] || [] }))
    .sort((a, b) => b.count - a.count);
  // Déflecteur : état évalué paresseusement (banque temps réel).
  // Anciennes bases sans état : cumul démarré maintenant.
  try {
    const nowMs = Date.now();
    if (st.built && !(st.deflect && typeof st.deflect === "object")) {
      st.deflect = { bank: 0, active: false, until: 0, disabledUntil: 0, lastTick: nowMs };
      try { persist(); } catch {}
    }
    if (st.built && st.deflect && typeof st.deflect === "object") {
      const before = String(st.deflect.active) + "|" + String(st.deflect.until) + "|" + Math.round(Number(st.deflect.bank) || 0);
      if (stationDeflectTick(st, nowMs)) {
        const after = String(st.deflect.active) + "|" + String(st.deflect.until) + "|" + Math.round(Number(st.deflect.bank) || 0);
        if (after !== before) persist();
      }
      if (nowMs - Number(st.deflectPersistAt || 0) > 60000) {
        st.deflectPersistAt = nowMs;
        persist();
      }
    }
  } catch {}
  return {
    t: "stationSync",
    map: key,
    hub,
    slots,
    built: !!st.built,
    owner: { ...(st.owner || {}) },
    perClan,
    deflect: (() => {
      try {
        const d = st.deflect;
        if (!st.built || !d || typeof d !== "object") return null;
        const active = d.active === true && Number(d.until) > Date.now();
        return { active, until: Math.max(0, Number(d.until) || 0), bank: Math.max(0, Math.round(Number(d.bank) || 0)), disabledUntil: Math.max(0, Number(d.disabledUntil) || 0) };
      } catch { return null; }
    })(),
    // Réparation en cours : le client décompte et resync pendant 10 s.
    repair: st.repair && Number(st.repair.until) > 0
      ? { until: Number(st.repair.until), rateHub: Math.max(1, Number(st.repair.rateHub) || REPAIR_HUB_RATE), rateSlot: Math.max(1, Number(st.repair.rateSlot) || REPAIR_SLOT_RATE) }
      : null,
    // Chiffres alliés récents (comme msg.npc.dmg) : le client filtre ses
    // propres tirs (déjà affichés en local) et n'affiche que la cible lockée.
    dmg: (() => {
      try {
        const nowMs = Date.now();
        const feed = Array.isArray(dmgFeeds[key]) ? dmgFeeds[key] : [];
        const fresh = feed.filter((f) => f && nowMs - Number(f.at || 0) < 2500 && Number(f.total) > 0);
        if (fresh.length !== feed.length) dmgFeeds[key] = fresh;
        return fresh.slice(-24).map((f) => ({ target: String(f.target), by: String(f.by || ""), total: Math.round(Number(f.total)), at: Number(f.at) || 0 }));
      } catch { return []; }
    })(),
    mine: { clan: vc, count: placed },
    placed,
    total,
    complete: placed >= total,
  };
}

export function hasStationMap(mapId) {
  return STATION_MAPS.has(String(mapId || "").toLowerCase());
}

// --- Actions ------------------------------------------------------------
function stockOf(userId, resourceId) {
  try {
    const rawId = String(userId || "").replace(/^u_/, "");
    const data = getAccountGameplayData(rawId);
    return Math.max(0, Math.floor(Number(data?.inventory?.resources?.[resourceId]) || 0));
  } catch {
    return 0;
  }
}

export function handleStationInstall({ map, slot, resourceId }, who) {
  const now = Date.now();
  const key = String(map || "").toLowerCase();
  if (!STATION_MAPS.has(key)) return { status: "reject", reason: "Pas de station sur cette carte." };
  const userId = String(who?.id || "").slice(0, MAX_STR);
  if (who?.authed !== true || !userId.startsWith("u_")) {
    return { status: "reject", reason: "Connecte-toi pour construire en ligne." };
  }
  const clan = String(who?.clan || "").toUpperCase().slice(0, 5);
  if (!clan) return { status: "reject", reason: "Construction réservée aux clans." };
  const st = getStation(key);
  if (st.built) {
    // Base construite : seule la repose sur un emplacement détruit (vide)
    // est autorisée, par le clan proprio. Jamais le hub (sa destruction
    // réinitialise la station).
    if (String(clan || "") !== String(st.built.clan || "")) {
      return { status: "reject", reason: "Station ennemie." };
    }
    const bSlotId = String(slot || "");
    if (bSlotId === "hub" || !STATION_SLOT_IDS.includes(bSlotId)) {
      return { status: "reject", reason: "Emplacement inconnu." };
    }
    const bId = String(resourceId || "");
    if (!VALID_PARTS.has(bId) || bId === STATION_HUB.resourceId) {
      return { status: "reject", reason: "Module inconnu." };
    }
    const bInst = st.instances[st.built.clan];
    if (!bInst) return { status: "reject", reason: "Station introuvable." };
    // Une seule opération à la fois : un remplacement en cours bloque
    // toute repose, et inversement.
    const bBusy = Object.values(bInst.slots).some((p) => p?.replace);
    if (bBusy) return { status: "reject", reason: "Remplacement déjà en cours." };
    if (bInst.slots[bSlotId]?.resourceId || bInst.slots[bSlotId]?.replace) {
      return { status: "reject", reason: "Emplacement déjà occupé." };
    }
    // Unicité : 1 seul exemplaire de chaque module SPÉCIAL (DMG/EXP/HON/REP),
    // posé ou en cours de remplacement. Lasers et roquettes : cumulables.
    const taken = new Set();
    for (const sid of STATION_SLOT_IDS) {
      const p = bInst.slots[sid];
      if (p?.resourceId) taken.add(String(p.resourceId));
      if (p?.replace?.resourceId) taken.add(String(p.replace.resourceId));
    }
    if (STATION_UNIQUE_MODULES.includes(bId) && taken.has(bId)) {
      return { status: "reject", reason: "Un seul exemplaire par station." };
    }
    if (userBusy(bInst, userId, now)) {
      return { status: "reject", reason: "Installation en cours — patientez." };
    }
    if (stockOf(userId, bId) <= 0) return { status: "reject", reason: "Stock épuisé." };
    // Repose différée : 60 s avant apparition visuelle (comme un
    // remplacement). L'ancien emplacement reste en ruines pendant le décompte.
    bInst.slots[bSlotId] = {
      resourceId: null,
      clan: null,
      pseudo: "",
      userId,
      cooldownUntil: now + INSTALL_CD_MS,
      hp: 0,
      replace: {
        resourceId: bId,
        clan,
        pseudo: cleanStr(who?.pseudo, 20),
        userId,
        cooldownUntil: now + INSTALL_CD_MS,
      },
    };
    persist();
    try { console.log(`[station:${key}] +${bId} ${bSlotId} par ${bInst.slots[bSlotId].replace.pseudo} [${clan}] (repose)`); } catch {}
    return { status: "ok", slot: bSlotId, resourceId: bId };
  }
  const id = String(resourceId || "");
  if (!VALID_PARTS.has(id)) return { status: "reject", reason: "Module inconnu." };
  const isCore = id === STATION_HUB.resourceId;
  const slotId = String(slot || "");
  if (slotId !== "hub" && !STATION_SLOT_IDS.includes(slotId)) {
    return { status: "reject", reason: "Emplacement inconnu." };
  }
  const inst = getInstance(st, clan);
  if (!inst) return { status: "reject", reason: "Construction réservée aux clans." };
  if (slotId === "hub") {
    if (!isCore) return { status: "reject", reason: "Le hub n'accepte que le Cœur de base." };
    if (inst.hub) return { status: "reject", reason: "Un Cœur est déjà posé." };
  } else {
    if (isCore) return { status: "reject", reason: "Le Cœur se pose sur le hub central." };
    if (inst.slots[slotId]) return { status: "reject", reason: "Emplacement déjà occupé." };
    if (STATION_UNIQUE_MODULES.includes(id)) {
      const already = Object.values(inst.slots).some((p) => p?.resourceId === id || p?.replace?.resourceId === id);
      if (already) return { status: "reject", reason: "Un seul exemplaire par station." };
    }
  }
  if (userBusy(inst, userId, now)) {
    return { status: "reject", reason: "Installation en cours — patientez." };
  }
  if (stockOf(userId, id) <= 0) return { status: "reject", reason: "Stock épuisé." };
  const part = {
    resourceId: id,
    clan,
    pseudo: cleanStr(who?.pseudo, 20),
    userId,
    cooldownUntil: now + INSTALL_CD_MS,
    hp: isCore ? STATION_CORE_HP : STATION_MODULE_HP,
  };
  if (slotId === "hub") inst.hub = part;
  else inst.slots[slotId] = part;
  persist();
  try { console.log(`[station:${key}] +${id} ${slotId} par ${part.pseudo} [${clan}]`); } catch {}
  return { status: "ok", slot: slotId, resourceId: id };
}

export function handleStationUninstall({ map, slot }, who) {
  const key = String(map || "").toLowerCase();
  if (!STATION_MAPS.has(key)) return { status: "reject", reason: "Pas de station sur cette carte." };
  const userId = String(who?.id || "").slice(0, MAX_STR);
  if (who?.authed !== true || !userId.startsWith("u_")) {
    return { status: "reject", reason: "Connecte-toi pour construire en ligne." };
  }
  const clan = String(who?.clan || "").toUpperCase().slice(0, 5);
  if (!clan) return { status: "reject", reason: "Construction réservée aux clans." };
  const st = getStation(key);
  if (st.built) return { status: "reject", reason: "Station construite : indémontable." };
  const slotId = String(slot || "");
  const inst = st.instances[clan];
  if (!inst) return { status: "reject", reason: "Emplacement vide." };
  const cur = slotId === "hub" ? inst.hub : inst.slots[slotId];
  if (!cur?.resourceId) return { status: "reject", reason: "Emplacement vide." };
  // Seul le poseur peut retirer son module (pas de vol, même entre alliés).
  if (String(cur.userId || "") !== userId) {
    return { status: "reject", reason: "Module d'un autre joueur." };
  }
  const resourceId = cur.resourceId;
  if (slotId === "hub") inst.hub = null;
  else inst.slots[slotId] = null;
  persist();
  try { console.log(`[station:${key}] -${resourceId} ${slotId} (retrait)`); } catch {}
  return { status: "ok", slot: slotId, resourceId };
}

// Remplacement sur base construite (jamais le Cœur) : l'ancien module reste
// actif 60 s, la bascule a lieu à la fin du décompte (application paresseuse).
export function handleStationReplace({ map, slot, resourceId }, who) {
  const now = Date.now();
  const key = String(map || "").toLowerCase();
  if (!STATION_MAPS.has(key)) return { status: "reject", reason: "Pas de station sur cette carte." };
  const userId = String(who?.id || "").slice(0, MAX_STR);
  if (who?.authed !== true || !userId.startsWith("u_")) {
    return { status: "reject", reason: "Connecte-toi pour construire en ligne." };
  }
  const clan = String(who?.clan || "").toUpperCase().slice(0, 5);
  if (!clan) return { status: "reject", reason: "Construction réservée aux clans." };
  const st = getStation(key);
  if (!st.built) return { status: "reject", reason: "Station pas construite." };
  if (String(clan || "") !== String(st.built.clan || "")) {
    return { status: "reject", reason: "Station ennemie." };
  }
  const slotId = String(slot || "");
  if (slotId === "hub") return { status: "reject", reason: "Le Cœur ne se remplace pas." };
  if (!STATION_SLOT_IDS.includes(slotId)) return { status: "reject", reason: "Emplacement inconnu." };
  const id = String(resourceId || "");
  if (!VALID_PARTS.has(id) || id === STATION_HUB.resourceId) {
    return { status: "reject", reason: "Module inconnu." };
  }
  const inst = st.instances[st.built.clan];
  if (!inst) return { status: "reject", reason: "Station introuvable." };
  const part = inst.slots[slotId];
  if (!part?.resourceId) return { status: "reject", reason: "Emplacement vide." };
  if (String(part.resourceId) === id) return { status: "reject", reason: "Module identique." };
  // Une seule opération à la fois sur la station : un remplacement ou une
  // repose en cours bloque tout autre remplacement/reconstruction.
  const opBusy = Object.values(inst.slots).some((p) => p?.replace);
  if (opBusy) return { status: "reject", reason: "Remplacement déjà en cours." };
  if (Number(part.cooldownUntil) > now) return { status: "reject", reason: "Installation en cours — patientez." };
  if (STATION_UNIQUE_MODULES.includes(id)) {
    const already = Object.entries(inst.slots).some(([sid, p]) => sid !== slotId && (p?.resourceId === id || p?.replace?.resourceId === id));
    if (already) return { status: "reject", reason: "Un seul exemplaire par station." };
  }
  if (userBusy(inst, userId, now)) {
    return { status: "reject", reason: "Installation en cours — patientez." };
  }
  if (stockOf(userId, id) <= 0) return { status: "reject", reason: "Stock épuisé." };
  part.replace = {
    resourceId: id,
    clan,
    pseudo: cleanStr(who?.pseudo, 20),
    userId,
    cooldownUntil: now + INSTALL_CD_MS,
  };
  persist();
  try { console.log(`[station:${key}] ~${id} ${slotId} par ${part.replace.pseudo} [${clan}] (remplace ${part.resourceId})`); } catch {}
  return { status: "ok", slot: slotId, resourceId: id, replaced: String(part.resourceId) };
}

// Annulation d'un remplacement / d'une repose en cours : seul le demandeur
// peut annuler (sinon le remboursement irait au mauvais joueur). L'ancien
// module reste en place, le remplaçant est libéré.
export function handleStationCancelReplace({ map, slot }, who) {
  const key = String(map || "").toLowerCase();
  if (!STATION_MAPS.has(key)) return { status: "reject", reason: "Pas de station sur cette carte." };
  const userId = String(who?.id || "").slice(0, MAX_STR);
  if (who?.authed !== true || !userId.startsWith("u_")) {
    return { status: "reject", reason: "Connecte-toi pour construire en ligne." };
  }
  const clan = String(who?.clan || "").toUpperCase().slice(0, 5);
  if (!clan) return { status: "reject", reason: "Construction réservée aux clans." };
  const st = getStation(key);
  if (!st.built) return { status: "reject", reason: "Station pas construite." };
  if (String(clan || "") !== String(st.built.clan || "")) {
    return { status: "reject", reason: "Station ennemie." };
  }
  const slotId = String(slot || "");
  if (slotId === "hub" || !STATION_SLOT_IDS.includes(slotId)) {
    return { status: "reject", reason: "Emplacement inconnu." };
  }
  const inst = st.instances[st.built.clan];
  const part = inst?.slots?.[slotId];
  if (!part?.replace?.resourceId) return { status: "reject", reason: "Aucun remplacement en cours." };
  if (String(part.replace.userId || "") !== userId) {
    return { status: "reject", reason: "Remplacement d'un autre joueur." };
  }
  const resourceId = String(part.replace.resourceId);
  if (part.resourceId) part.replace = null;
  else inst.slots[slotId] = null;
  persist();
  try { console.log(`[station:${key}] ~${resourceId} ${slotId} annulé par ${String(who?.pseudo || "").slice(0, 20)} [${clan}]`); } catch {}
  return { status: "ok", slot: slotId, resourceId };
}

// Réparation : 25 000 PV/s pendant 10 s sur le cœur et les modules en vie.
// Un seul cycle à la fois, clan proprio uniquement.
export function handleStationRepair({ map }, who) {
  const key = String(map || "").toLowerCase();
  if (!STATION_MAPS.has(key)) return { status: "reject", reason: "Pas de station sur cette carte." };
  const userId = String(who?.id || "").slice(0, MAX_STR);
  if (who?.authed !== true || !userId.startsWith("u_")) {
    return { status: "reject", reason: "Connecte-toi pour construire en ligne." };
  }
  const clan = String(who?.clan || "").toUpperCase().slice(0, 5);
  if (!clan) return { status: "reject", reason: "Construction réservée aux clans." };
  const st = getStation(key);
  if (!st.built) return { status: "reject", reason: "Station pas construite." };
  if (String(clan || "") !== String(st.built.clan || "")) {
    return { status: "reject", reason: "Station ennemie." };
  }
  const now = Date.now();
  if (st.repair && Number(st.repair.until) > now) {
    return { status: "reject", reason: "Réparation déjà en cours." };
  }
  const inst = st.instances[st.built.clan];
  if (!inst) return { status: "reject", reason: "Station introuvable." };
  const needsHeal = (inst.hub && Number(inst.hub.hp) > 0 && Number(inst.hub.hp) < (Number(inst.hub.hpMax) || STATION_CORE_HP))
    || STATION_SLOT_IDS.some((sid) => {
      const p = inst.slots[sid];
      return p && Number(p.hp) > 0 && Number(p.hp) < (Number(p.hpMax) || STATION_MODULE_HP);
    });
  if (!needsHeal) return { status: "reject", reason: "Rien à réparer." };
  st.repair = { until: now + REPAIR_MS, rateHub: REPAIR_HUB_RATE, rateSlot: REPAIR_SLOT_RATE, startedAt: now, lastTick: now };
  persist();
  try { console.log(`[station:${key}] réparation engagée par ${String(who?.pseudo || "").slice(0, 20)} [${clan}]`); } catch {}
  return { status: "ok" };
}

export function handleStationBuild({ map }, who) {
  const key = String(map || "").toLowerCase();
  if (!STATION_MAPS.has(key)) return { status: "reject", reason: "Pas de station sur cette carte." };
  const userId = String(who?.id || "").slice(0, MAX_STR);
  if (who?.authed !== true || !userId.startsWith("u_")) {
    return { status: "reject", reason: "Connecte-toi pour construire en ligne." };
  }
  const clan = String(who?.clan || "").toUpperCase().slice(0, 5);
  if (!clan) return { status: "reject", reason: "Construction réservée aux clans." };
  const st = getStation(key);
  if (st.built) return { status: "reject", reason: "Station déjà construite." };
  const inst = st.instances[clan];
  if (!inst?.hub?.resourceId) return { status: "reject", reason: "Cœur manquant." };
  for (const id of STATION_SLOT_IDS) {
    if (!inst.slots[id]?.resourceId) return { status: "reject", reason: "Modules manquants." };
  }
  const now = Date.now();
  if (inst.hub.cooldownUntil > now || STATION_SLOT_IDS.some((id) => inst.slots[id].cooldownUntil > now)) {
    return { status: "reject", reason: "Installation en cours — patientez." };
  }
  st.built = { clan, firm: String(who?.faction || "").toLowerCase() };
  st.owner = { firm: String(who?.faction || "").toLowerCase(), clan };
  // Occupation : horodatée à la construction (panneau carte stellaire).
  st.builtAt = Date.now();
  // Déflecteur : banque à zéro, charge démarrée à la construction.
  st.deflect = { bank: 0, active: false, until: 0, disabledUntil: 0, lastTick: Date.now() };
  // Les autres clans sont déposés et remboursés à leurs poseurs.
  const refunds = [];
  for (const [tag, other] of Object.entries(st.instances)) {
    if (String(tag || "").toUpperCase() === clan) continue;
    if (!other || typeof other !== "object") continue;
    for (const id of STATION_SLOT_IDS) {
      const p = other.slots?.[id];
      if (p?.resourceId) {
        refunds.push({ userId: p.userId, resourceId: p.resourceId });
        other.slots[id] = null;
      }
    }
    if (other.hub?.resourceId) {
      refunds.push({ userId: other.hub.userId, resourceId: other.hub.resourceId });
      other.hub = null;
    }
  }
  persist();
  try { console.log(`[station:${key}] CONSTRUITE par [${clan}] (${refunds.length} module(s) restitué(s))`); } catch {}
  return {
    status: "ok",
    refunds: refunds.filter((r) => r.userId && r.resourceId),
  };
}

// Interrupteur du déflecteur (membre du clan proprio) : COUPURE 30 min
// uniquement (pas d'activation manuelle). Pendant la coupure le cumul est
// gelé et aucun bouclier ne se déclenche ; à la fin, le cycle reprend où
// il en était. Couper en plein bouclier rend le temps restant à la banque.
// Re-cliquer relance 30 min.
export function handleStationDeflectToggle({ map }, who) {
  const key = String(map || "").toLowerCase();
  if (!STATION_MAPS.has(key)) return { status: "reject", reason: "Pas de station sur cette carte." };
  const userId = String(who?.id || "").slice(0, MAX_STR);
  if (who?.authed !== true || !userId.startsWith("u_")) {
    return { status: "reject", reason: "Connecte-toi pour construire en ligne." };
  }
  const clan = String(who?.clan || "").toUpperCase().slice(0, 5);
  if (!clan) return { status: "reject", reason: "Construction réservée aux clans." };
  const st = getStation(key);
  if (!st.built) return { status: "reject", reason: "Station pas construite." };
  if (String(clan || "") !== String(st.built.clan || "")) {
    return { status: "reject", reason: "Station ennemie." };
  }
  const now = Date.now();
  if (!st.deflect || typeof st.deflect !== "object") {
    st.deflect = { bank: 0, active: false, until: 0, disabledUntil: 0, lastTick: now };
  }
  const d = st.deflect;
  d.lastTick = Number(d.lastTick) || now;
  if (d.active && now < Number(d.until)) {
    // Extinction en plein bouclier : le reliquat retourne à la banque.
    d.bank = Math.max(0, Number(d.bank) || 0) + Math.max(0, (Number(d.until) - now) / 1000);
    d.active = false;
    d.until = 0;
  }
  d.disabledUntil = now + STATION_DEFLECT_OFF_MS;
  delete d.disabled;
  persist();
  try { console.log(`[station:${key}] deflecteur COUPE 30 min par ${String(who?.pseudo || "").slice(0, 20)} [${clan}] (banque ${Math.round(Number(d.bank) || 0)}s)`); } catch {}
  return { status: "ok", disabledUntil: d.disabledUntil };
}

export function handleStationHit({ map, target, dmg }, who) {
  const key = String(map || "").toLowerCase();
  if (!STATION_MAPS.has(key)) return { status: "reject" };
  const st = getStation(key);
  if (!st.built?.clan) return { status: "reject" };
  if (who?.authed !== true || !String(who?.id || "").startsWith("u_")) return { status: "reject" };
  const attackerClan = String(who?.clan || "").toUpperCase().slice(0, 5);
  if (attackerClan && attackerClan === String(st.built.clan).toUpperCase()) return { status: "reject" };
  // Déflecteur actif : cœur + emplacements invincibles (le client bloque
  // déjà en amont, le serveur tranche). État évalué ici même : sans sync
  // récente, un bouclier expiré ne doit pas bloquer.
  try { stationDeflectTick(st, Date.now()); } catch {}
  try {
    const ds = st.deflect;
    const shieldOn = ds && ds.active === true && Date.now() < Number(ds.until);
    if (shieldOn) return { status: "reject", reason: "Déflecteur actif — station invincible." };
  } catch {}
  const amount = Math.max(0, Math.min(10_000_000, Math.round(Number(dmg) || 0)));
  if (!(amount > 0)) return { status: "reject" };
  const inst = st.instances[st.built.clan];
  if (!inst) return { status: "reject" };
  const id = String(target || "");
  const part = id === "hub" ? inst.hub : inst.slots?.[id];
  if (!part?.resourceId) return { status: "reject" };
  const slotIndex = STATION_SLOT_IDS.indexOf(id);
  const offset = slotIndex >= 0 ? STATION_SLOT_OFFSETS[slotIndex] : { x: 0, y: 0 };
  // Centre de la station par map, avec une marge projectile identique aux
  // autres validations multijoueur.
  const center = STATION_POS[key] || { x: 5616, y: 1000 };
  const tx = Number(center.x) + Number(offset.x || 0), ty = Number(center.y) + Number(offset.y || 0);
  const reach = Math.max(800, Number(who?.range) || 800) + 800;
  const dx = tx - Number(who?.x || 0), dy = ty - Number(who?.y || 0);
  if (dx * dx + dy * dy > reach * reach) return { status: "reject" };
  const hpMax = id === "hub" ? STATION_CORE_HP : STATION_MODULE_HP;
  const hp = Math.max(0, Number(part.hp) || hpMax);
  part.hp = Math.max(0, hp - amount);
  const destroyed = part.hp <= 0;
  // Feed chiffres alliés (fenêtre ~2,5 s, plafond 24).
  try {
    const feed = (dmgFeeds[key] ||= []);
    feed.push({ target: id, by: String(who?.id || ""), total: Math.round(amount), at: Date.now() });
    while (feed.length > 24) feed.shift();
  } catch {}
  // Riposte : même bleu, il a tapé -> défenses le ciblent 30 s.
  try { touchStationAggro(key, who?.id, Date.now()); } catch {}
  if (destroyed) {
    if (id === "hub") {
      stations[key] = emptyStation();
      try { delete stationAggro[key]; } catch {}
    } else {
      inst.slots[id] = null;
    }
  }
  persist();
  return { status: "ok", destroyed, target: id };
}

export function stationRoomStatus() {
  const out = {};
  for (const mapId of STATION_MAPS) {
    const st = getStation(mapId);
    let placed = 0;
    for (const inst of Object.values(st.instances || {})) {
      if (!inst || typeof inst !== "object") continue;
      if (inst.hub?.resourceId) placed++;
      for (const id of STATION_SLOT_IDS) if (inst.slots?.[id]?.resourceId) placed++;
    }
    out[mapId] = { placed, built: !!st.built, clans: Object.keys(st.instances || {}).length };
  }
  return out;
}

// Fenêtre clan, onglet Bases : toutes les bases (propriétaire public, comme
// la carte stellaire) + détail complet de celles du clan demandeur (coque,
// déflecteur, modules, bonus apportés) et de ses chantiers en cours.
// Passe par getStationSync : réparations / remplacements / déflecteur sont
// appliqués paresseusement exactement comme pour un joueur sur place.
export function getClanBasesReport(clanTag) {
  const vc = String(clanTag || "").toUpperCase().slice(0, 5);
  const nowMs = Date.now();
  const maps = [], mine = [], building = [];
  for (const center of STATION_CENTERS) {
    const key = String(center.map || "").toLowerCase();
    const st = getStation(key);
    const owner = String(st.built?.clan || "").toUpperCase().slice(0, 5);
    maps.push({
      map: key, owner,
      firm: String(st.owner?.firm || st.built?.firm || "").toLowerCase().slice(0, 16),
      builtAt: Math.max(0, Number(st.builtAt) || 0),
      mine: !!vc && owner === vc,
    });
    if (!vc) continue;
    if (owner === vc) {
      const sync = getStationSync(key, vc);
      const modules = STATION_SLOT_IDS.map((slot, index) => {
        const p = sync.slots?.[slot];
        if (!p) return { slot: index + 1, resourceId: null, state: "empty" };
        const until = Number(p.replace?.cooldownUntil || p.cooldownUntil) || 0;
        const state = !(Number(p.hp) > 0) ? "destroyed"
          : p.replace ? "replacing"
            : Number(p.cooldownUntil) > nowMs ? "installing" : "active";
        return {
          slot: index + 1, resourceId: p.resourceId, state, until: state === "installing" || state === "replacing" ? until : 0,
          next: p.replace?.resourceId || null,
          hp: Math.round(Number(p.hp) || 0), hpMax: Number(p.hpMax) || STATION_MODULE_HP,
          by: String(p.pseudo || "").slice(0, 20),
        };
      });
      const has = (rid) => modules.some((m) => m.resourceId === rid && m.state === "active");
      mine.push({
        map: key, builtAt: Math.max(0, Number(st.builtAt) || 0),
        firm: String(st.owner?.firm || st.built?.firm || "").toLowerCase().slice(0, 16),
        hub: sync.hub ? { hp: Math.round(Number(sync.hub.hp) || 0), hpMax: Number(sync.hub.hpMax) || STATION_CORE_HP } : null,
        deflect: sync.deflect || null,
        repairing: !!(sync.repair && Number(sync.repair.until) > nowMs),
        modules,
        bonus: {
          dmg: has("station_module_dmg"), hon: has("station_module_hon"),
          exp: has("station_module_exp"), rep: has("station_module_rep"),
        },
      });
    } else if (st.instances?.[vc]) {
      const inst = st.instances[vc];
      const placed = instancePlaced(inst);
      if (placed > 0) {
        building.push({
          map: key, placed, completed: instanceCompleted(inst, nowMs),
          total: 1 + STATION_SLOT_IDS.length, hub: !!inst.hub?.resourceId,
          contestedBy: owner || "",
        });
      }
    }
  }
  return { maps, mine, building };
}
