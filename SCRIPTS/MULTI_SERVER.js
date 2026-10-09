import { createServer } from "node:http";
import { readFile, stat, mkdir, writeFile, rename } from "node:fs/promises";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { WebSocketServer } from "ws";
import { ZoneNpcSim } from "./NPC_ROOM.js";
import { setCubikonFouActive, isCubikonFouActive } from "./NPC_ROOM.js";
import {
  ANTICHEAT as AC,
  acBucket,
  acStrike,
  acHealTake,
  acAuditWindow,
  acRecordCollection,
  acPoolResize,
  acRecordViolation,
} from "./ANTICHEAT.js";
const {
  AC_HIT_CAP, AC_HIT_REFILL, AC_DMG_CAP, AC_DMG_REFILL,
  AC_PVP_HIT_CAP, AC_PVP_HIT_REFILL, AC_PVP_DMG_CAP, AC_PVP_DMG_REFILL,
  HEAL_BUDGET_RATE, HEAL_BUDGET_CAP,
  PET_LEASH,
} = AC;
import { tickLowRaid, getLowRaidState } from "./LOW_RAID.js";
import { damagePlayerLayers } from "../COMBAT/COMBAT_RULES.js";
import { handleAccountApi, getAccountGameplayData, verifyWsToken, recordPvpKill, recordPvpPetKill, awardNpcKill, listFriends, friendFollowers, findUserByPseudo, hasFriendRequest, clanIdOfUser, clanTagOfUser, clanMemberUserIds, recordClanWarKill, adminGiveCredits, adminGiveExperience, adminGiveHonor, adminGiveModule, adminListAccounts, adminDeleteAccount, adminShipFamilies } from "./ACCOUNT_SERVER.js";
import { combatProfile, validateCombatHit } from "./COMBAT_PROFILE.js";
import { selectNpcSnapshot } from "./NPC_SNAPSHOT.js";
import { updateClockGuard, stopRejectedMotion } from "./CLOCK_GUARD.js";
import { takeMovement, useMovementAbility, syncMovementAbility, movementSpeed, usePhaseOut } from "./MOVEMENT_RULES.js";
import { loadServerMaps, mapTransition, validArrival, reviveArrival, baseArrival, respawnMap } from "./MAP_RULES.js";
import { getFactionHomeMap } from "../SRC/CORE/FACTIONS.js";
import { handleSocialMessage, socialPeerGone, socialPeerChanged, socialDescribeGroup, socialGroupOf } from "./SOCIAL_ROOM.js";
import { getAuctionSync, handleAuctionBid, pollAuctionCycle, auctionRoomStatus } from "./AUCTION_ROOM.js";
import { GAME_VERSION } from "../SRC/DATA/VERSION.js";
import { COLLECTABLE_TYPES } from "../SRC/DATA/COLLECTABLES.js";
import { GROUP_BOOSTER_BONUS } from "../SRC/DATA/BOOSTERS.js";
import { STARMAP_JUMP_REUSE_SEC } from "../SRC/DATA/STARMAP.js";

const serverMaps = await loadServerMaps();
const securityStates = new Map();
const accountSockets = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [pid, saved] of securityStates) {
    if (!accountSockets.has(pid) && now - Number(saved.updatedAt || 0) > 24 * 3600_000) securityStates.delete(pid);
  }
}, 60_000).unref?.();

function refreshCombatProfile(state, accountId, map, message = {}) {
  if (!accountId) return null;
  const now = Date.now();
  const requestedConfig = Number(message.config) === 2 ? 2 : Number(message.config) === 1 ? 1 : null;
  if (!state._account || now - Number(state._accountAt || 0) >= 1000
    || (message.shipId && message.shipId !== state.shipId)) {
    state._account = getAccountGameplayData(accountId, state._account);
    state._accountAt = now;
  }
  if (!state._account) return null;
  if (requestedConfig && requestedConfig !== state._config && now >= Number(state._configCdUntil || 0)) {
    state._config = requestedConfig;
    state._configCdUntil = now + 5000;
  }
  if (!state._combat || state._combatRev !== state._account.revision || state._combatMap !== map
    || (state._config && state._combat.config !== state._config)
    || now - Number(state._combatAt || 0) >= 1000) {
    const groupBoosters = {};
    for (const peer of socialDescribeGroup(state.id, { describe: describePeer })?.members || []) {
      if (peer.id === state.id || peer.online === false || peer.map !== map) continue;
      const member = findPeerState(peer.id);
      for (const id of Object.keys(GROUP_BOOSTER_BONUS)) {
        if (now < Number(member?._account?.boosters?.active?.[id] || 0)) groupBoosters[id] = (groupBoosters[id] || 0) + 1;
      }
    }
    // Les compteurs/positions du compte sont souvent inchanges. Le controle
    // d'une seconde verifie les expirations et le groupe sans reconstruire
    // tout l'equipement si les droits de combat sont toujours les memes.
    const boosterSignature = Object.entries(state._account.boosters?.active || {})
      .filter(([, until]) => now < Number(until)).map(([id]) => id).sort().join(",")
      + "|" + Object.entries(groupBoosters).sort(([a], [b]) => a.localeCompare(b)).map(([id, count]) => `${id}:${count}`).join(",");
    if (state._combat && state._combatRev === state._account.revision && state._combatMap === map
      && (!state._config || state._combat.config === state._config)
      && state._combatBoosterSignature === boosterSignature) {
      state._combatAt = now;
      state.hswap = Math.max(0, (Number(state._swapFxUntil || 0) - now) / 1000);
      return state._combat;
    }
    const profile = combatProfile(state._account, map, state._config, groupBoosters);
    if (!profile) return null;
    const prior = state._combat;
    const shields = state._configShields || (state._configShields = {});
    const key = `${profile.hangarId}:${profile.config}`;
    if (prior) shields[`${prior.hangarId}:${prior.config}`] = Math.max(0, Number(state.sh) || 0);
    acPoolResize(state, profile.hpMax, profile.shMax);
    if (prior && (prior.hangarId !== profile.hangarId || prior.config !== profile.config) && !state.pvpDead && state.hp > 0) {
      state.sh = Math.min(profile.shMax, shields[key] ?? profile.shMax);
    }
    // Duree de l'effet portail distant, sans protection contre les degats.
    if (prior && prior.shipId !== profile.shipId) state._swapFxUntil = now + 3000;
    state._combat = profile;
    state._config = profile.config;
    state._combatRev = state._account.revision;
    state._combatMap = map;
    state._combatAt = now;
    state._combatBoosterSignature = boosterSignature;
    state.shipId = profile.shipId;
    state.absorb = profile.absorb;
    state.evade = profile.evade;
    state.range = profile.range;
    state.vmax = profile.speed;
    state.moveSpeed = profile.speed;
    state.b2 = Object.keys(GROUP_BOOSTER_BONUS).filter(id => now < Number(state._account.boosters?.active?.[id] || 0));
  }
  state.hswap = Math.max(0, (Number(state._swapFxUntil || 0) - now) / 1000);
  return state._combat;
}

const root = resolve(process.cwd());
const portArg = process.argv.find((arg) => arg.startsWith("--port="))?.slice(7);
const PORT = Number(portArg || process.env.PORT || 8080) || 8080;
const PUBLIC_DIRS = new Set(["ASSETS", "AUDIO", "COMBAT", "DRONE", "MAPS", "NPC", "PET", "PUBLIC", "QUEST", "SHIP", "SRC", "UI"]);
const PUBLIC_FILES = new Set(["index.html", "admin.html", "style.css", "ASSETS_MANIFEST.json"]);
// Anti-cheat : voir SCRIPTS/ANTICHEAT.js (module pur, testable).
// Les constantes/helpers locaux ont migré là-bas.

// Compteurs d'audit anticheat par joueur (strictement serveur : kills
// crédités, boxes acceptées, dégâts appliqués). Fenêtre 10 s, voir
// acAuditScore dans ANTICHEAT.js.
function audOf(state) {
  const a = state && state._audit && typeof state._audit === "object" ? state._audit : null;
  if (a) return a;
  const fresh = { t: Date.now(), kills: 0, boxes: 0, dmg: 0, score: 0, strikes: 0, last: null, teleAt: 0 };
  if (state && typeof state === "object") state._audit = fresh;
  return fresh;
}
function findPeerState(pid) {
  const id = String(pid || "");
  if (!id) return null;
  for (const [, room] of rooms) {
    const e = room.get(id);
    if (e && e.state) return e.state;
  }
  const ie = instancePeers.get(id);
  return ie && ie.state ? ie.state : null;
}

function publicRelativePath(pathname) {
  const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const parts = relative.split(/[\\/]+/).filter(Boolean);
  if (!parts.length) return "index.html";
  if (!PUBLIC_FILES.has(parts[0]) && !PUBLIC_DIRS.has(parts[0])) throw new Error("Private path");
  if (parts.some((part) => part.startsWith(".") || part === "node_modules" || part === "SERVER_DATA" || part === "SCRIPTS")) throw new Error("Private path");
  return relative;
}

function setSecurityHeaders(response) {
  response.setHeader("x-content-type-options", "nosniff");
  response.setHeader("referrer-policy", "same-origin");
  response.setHeader("x-frame-options", "DENY");
  response.setHeader("permissions-policy", "camera=(), microphone=(), geolocation=()");
  response.setHeader("cross-origin-resource-policy", "same-origin");
}

// --- Panneau admin (/admin.html) : mot de passe via ORBIT_ADMIN_PASS,
// sinon genere une fois et persiste dans SERVER_DATA/.admin_pass
// (retrouvable en SSH via `cat SERVER_DATA/.admin_pass`, jamais dans git).
const ADMIN_PASS_FILE = join(root, "SERVER_DATA", ".admin_pass");
function loadOrCreateAdminPass() {
  const env = String(process.env.ORBIT_ADMIN_PASS || "").trim();
  if (env) return { pass: env, fromFile: false };
  try {
    const saved = String(readFileSync(ADMIN_PASS_FILE, "utf8") || "").trim();
    if (saved && saved.length <= 256) return { pass: saved, fromFile: true };
  } catch {}
  const gen = `admin_${randomBytes(8).toString("hex")}`;
  try {
    mkdirSync(dirname(ADMIN_PASS_FILE), { recursive: true });
    writeFileSync(ADMIN_PASS_FILE, gen, { mode: 0o600 });
  } catch {}
  return { pass: gen, fromFile: true };
}
const { pass: ADMIN_PASS, fromFile: ADMIN_PASS_PERSISTED } = loadOrCreateAdminPass();
const adminFailures = new Map();
const chatMutes = new Set(); // ids prives de chat (persistants, ids stables)

// --- Bannissements temporaires (panneau admin) : bloques par compte (id
// stable) + par pseudo (anti-evasion par deconnexion). Persistes dans
// SERVER_DATA/bans.json, expiration paresseuse (nettoyes a la lecture).
const BANS_FILE = join(root, "SERVER_DATA", "bans.json");
let bans = new Map(); // key -> { key, pseudo, reason, until (ms|null), at }
try {
  const raw = JSON.parse(readFileSync(BANS_FILE, "utf8") || "{}");
  if (raw && typeof raw === "object") {
    for (const [k, v] of Object.entries(raw)) {
      if (!v || typeof v !== "object") continue;
      bans.set(String(k).slice(0, 128), {
        key: String(k).slice(0, 128),
        pseudo: String(v.pseudo || "?").slice(0, 20),
        reason: String(v.reason || "Comportement inapproprié.").slice(0, 200),
        until: v.until == null ? null : Math.max(0, Number(v.until) || 0),
        at: Math.max(0, Number(v.at) || 0),
      });
    }
  }
} catch {}
function saveBans() {
  try { writeFileSync(BANS_FILE, JSON.stringify(Object.fromEntries(bans))); } catch {}
}
function banKeysFor(id, pseudo) {
  const keys = [];
  if (String(id || "").startsWith("u_")) keys.push(String(id).slice(0, 128));
  const pn = String(pseudo || "").trim().toLowerCase();
  if (pn) keys.push(`pseudo:${pn}`.slice(0, 128));
  return keys;
}
function getActiveBan(id, pseudo) {
  const now = Date.now();
  let changed = false, found = null;
  for (const k of banKeysFor(id, pseudo)) {
    const b = bans.get(k);
    if (!b) continue;
    if (b.until != null && Number(b.until) <= now) { bans.delete(k); changed = true; continue; }
    if (!found) found = b;
  }
  if (changed) saveBans();
  return found;
}
function adminAuthed(request) {
  const ip = String(request.socket?.remoteAddress || "unknown");
  const now = Date.now();
  const failure = adminFailures.get(ip);
  if (failure && now < failure.reset && failure.count >= 10) return false;
  const tok = String(request.headers?.["x-admin-token"] || "").trim();
  let ok = false;
  if (tok !== "" && tok.length <= 256) {
    try {
      const actual = Buffer.from(tok, "utf8");
      const expected = Buffer.from(ADMIN_PASS, "utf8");
      ok = actual.length === expected.length && timingSafeEqual(actual, expected);
    } catch {}
  }
  if (ok) {
    adminFailures.delete(ip);
    return true;
  }
  if (!failure || now >= failure.reset) adminFailures.set(ip, { count: 1, reset: now + 60_000 });
  else failure.count++;
  return false;
}
function adminJson(response, code, obj) {
  response.writeHead(code, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  response.end(JSON.stringify(obj));
}
function readJsonBody(request) {
  return new Promise((resolve) => {
    let size = 0;
    const chunks = [];
    request.on("data", (c) => {
      size += c.length;
      if (size > 100_000) { resolve(null); try { request.destroy(); } catch {} return; }
      chunks.push(c);
    });
    request.on("end", () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))); }
      catch { resolve(null); }
    });
    request.on("error", () => resolve(null));
  });
}
function handleAdminApi(request, response, pathname) {
  if (!pathname.startsWith("/api/admin/")) return false;
  if (!adminAuthed(request)) { adminJson(response, 401, { ok: false, error: "Non autorise." }); return true; }
  const now = Date.now();
  if (pathname === "/api/admin/peers" && request.method === "GET") {
    const peers = [];
    for (const [map, room] of rooms) {
      for (const [pid, entry] of room) {
        const s = entry?.state || {};
        peers.push({
          id: String(pid), pseudo: String(s.pseudo || "Pilote").slice(0, 20),
          authed: String(pid).startsWith("u_"), map,
          x: Math.round(Number(s.x) || 0), y: Math.round(Number(s.y) || 0),
          dead: s.dead === true, muted: chatMutes.has(String(pid)),
          connectedSec: Math.max(0, Math.round((now - Number(s.connectedAt || now)) / 1000)),
        });
      }
    }
    // Joueurs en instance perso (Galaxy Gates : alpha/beta/gamma/delta/epsilon/zeta/kappa/lambda/kronos) : hors
    // room mais connectés — visibles ici avec le badge gate.
    for (const [pid, entry] of instancePeers) {
      const s = entry?.state || {};
      peers.push({
        id: String(pid), pseudo: String(s.pseudo || "Pilote").slice(0, 20),
        authed: String(pid).startsWith("u_"), map: String(entry.mapId || s.map || "?"),
        x: Math.round(Number(s.x) || 0), y: Math.round(Number(s.y) || 0),
        dead: s.dead === true, muted: chatMutes.has(String(pid)),
        connectedSec: Math.max(0, Math.round((now - Number(s.connectedAt || now)) / 1000)),
        instance: true,
      });
    }
    adminJson(response, 200, { ok: true, peers, count: peers.length });
    return true;
  }
  if (pathname === "/api/admin/chat" && request.method === "GET") {
    // Tchat en direct pour le panneau admin (lire l'historique global).
    // Répondre = POST /api/admin/broadcast (message [ADMIN] à tous).
    adminJson(response, 200, { ok: true, list: chatHistory.slice(-40) });
    return true;
  }
  if (pathname === "/api/admin/bans" && request.method === "GET") {
    // Liste des bannissements actifs (expirés purgés).
    getActiveBan("", "");
    adminJson(response, 200, { ok: true, bans: [...bans.values()] });
    return true;
  }
  if (pathname === "/api/admin/cheat" && request.method === "GET") {
    // Anticheat : dossiers gelés en attente de modération + suspects live
    // (score d'audit > 0). Libérer = unban existant ; bannir définitif =
    // ban existant (écrase le gel).
    getActiveBan("", "");
    const holds = [];
    for (const [key, b] of bans) {
      if (!b || b.cheatHold !== true) continue;
      holds.push({
        key, pseudo: String(b.pseudo || ""), reason: String(b.reason || ""),
        at: Number(b.at) || 0,
        evidence: b.evidence && typeof b.evidence === "object" ? b.evidence : null,
      });
    }
    holds.sort((x, y) => y.at - x.at);
    const suspects = [];
    const seen = new Set();
    const collect = (pid, st, map, online = true) => {
      const a = st && st._audit;
      const recent = st?._security && Date.now() - st._security.last.at < 300000;
      if (!a || (!(Number(a.score) > 0) && !recent)) return;
      if (seen.has(pid)) return;
      seen.add(pid);
      suspects.push({
        id: pid, pseudo: String(st.pseudo || ""), online, map: map || null,
        score: Math.round(Number(a.score) || 0), strikes: Number(a.strikes || 0),
        last: a.last && typeof a.last === "object" ? a.last : null,
        security: st._security || null,
        clockBlocked: st._clockGuard?.blocked === true,
      });
    };
    for (const [map, room] of rooms) {
      for (const [pid, e] of room) { if (e && e.state) collect(pid, e.state, map, e.ws?.readyState === 1); }
    }
    for (const [pid, e] of instancePeers) {
      if (e && e.state) collect(pid, e.state, e.mapId || null, e.ws?.readyState === 1);
    }
    // Une deconnexion ne fait pas disparaitre les derniers signalements.
    for (const [pid, st] of securityStates) collect(pid, st, st.serverMap, false);
    suspects.sort((x, y) => y.score - x.score);
    adminJson(response, 200, { ok: true, holds, suspects: suspects.slice(0, 100) });
    return true;
  }
  if (pathname === "/api/admin/ships" && request.method === "GET") {
    // Familles de vaisseaux pour le select "give module" du panneau admin.
    adminJson(response, 200, { ok: true, ships: adminShipFamilies() });
    return true;
  }
  if (pathname === "/api/admin/accounts" && request.method === "GET") {
    // Tous les comptes (connectés + hors ligne) + invités connectés.
    // Mêmes actions que les connectés : mute/ban/give par id/pseudo.
    // Kick réservé aux connectés (ok:false si hors ligne).
    const liveById = new Map();
    for (const [map, room] of rooms) {
      for (const [pid, entry] of room) {
        const s = entry?.state || {};
        liveById.set(String(pid), {
          id: String(pid), pseudo: String(s.pseudo || "Pilote").slice(0, 20),
          authed: String(pid).startsWith("u_"), map,
          x: Math.round(Number(s.x) || 0), y: Math.round(Number(s.y) || 0),
          dead: s.dead === true, muted: chatMutes.has(String(pid)),
          connectedSec: Math.max(0, Math.round((now - Number(s.connectedAt || now)) / 1000)),
          instance: false,
        });
      }
    }
    for (const [pid, entry] of instancePeers) {
      const s = entry?.state || {};
      liveById.set(String(pid), {
        id: String(pid), pseudo: String(s.pseudo || "Pilote").slice(0, 20),
        authed: String(pid).startsWith("u_"), map: String(entry.mapId || s.map || "?"),
        x: Math.round(Number(s.x) || 0), y: Math.round(Number(s.y) || 0),
        dead: s.dead === true, muted: chatMutes.has(String(pid)),
        connectedSec: Math.max(0, Math.round((now - Number(s.connectedAt || now)) / 1000)),
        instance: true,
      });
    }
    let accounts = [];
    try { accounts = adminListAccounts() || []; } catch { accounts = []; }
    const out = accounts.map((a) => {
      const live = liveById.get(String(a.id)) || null;
      const ban = getActiveBan(String(a.id), String(a.pseudo));
      return {
        ...a,
        online: !!live,
        map: live ? live.map : null,
        x: live ? live.x : null,
        y: live ? live.y : null,
        dead: live ? live.dead : null,
        muted: chatMutes.has(String(a.id)),
        connectedSec: live ? live.connectedSec : null,
        instance: live ? live.instance === true : false,
        banned: !!ban,
        banUntil: ban ? (ban.until != null ? Number(ban.until) : null) : null,
        banReason: ban ? String(ban.reason || "") : null,
      };
    });
    // Invités connectés (sans compte) : pas de fiche hors ligne possible.
    const guests = [...liveById.values()].filter((p) => !String(p.id).startsWith("u_"));
    const onlineCount = [...liveById.keys()].length;
    adminJson(response, 200, { ok: true, accounts: out, guests, onlineCount, total: out.length });
    return true;
  }
  if (pathname === "/api/admin/cubikon-fou" && request.method === "GET") {
    adminJson(response, 200, { ok: true, active: isCubikonFouActive(), countdown: cubikonFouCountdownTimer != null });
    return true;
  }
  if ((pathname === "/api/admin/broadcast" || pathname === "/api/admin/kick" || pathname === "/api/admin/mute" || pathname === "/api/admin/give" || pathname === "/api/admin/give-exp" || pathname === "/api/admin/give-honor" || pathname === "/api/admin/give-module" || pathname === "/api/admin/ban" || pathname === "/api/admin/unban" || pathname === "/api/admin/delete" || pathname === "/api/admin/cheat-hold" || pathname === "/api/admin/cubikon-fou") && request.method === "POST") {
    readJsonBody(request).then((body) => {
      try {
        if (pathname === "/api/admin/delete") {
          // Suppression DEFINITIVE d'un compte : users, sessions, pvp_stats,
          // npc_reward_tx, amis + demandes (les deux sens). Le classement et
          // les listes d'amis sont dérivés de ces tables : le joueur
          // disparaît partout comme s'il n'avait jamais existé.
          const res = adminDeleteAccount(String(body?.id || body?.pseudo || ""));
          if (!res || res.ok !== true) {
            adminJson(response, 404, res || { ok: false, error: "Compte introuvable." });
            return;
          }
          try {
            const pid = String(res.pid || "");
            const pseudoNorm = String(res.pseudo || "").trim().toLowerCase();
            // Purge bannissements + mute liés au compte supprimé.
            let bansChanged = false;
            if (pid && bans.delete(pid)) bansChanged = true;
            const pseudoKey = pseudoNorm ? `pseudo:${pseudoNorm}`.slice(0, 128) : "";
            if (pseudoKey && bans.delete(pseudoKey)) bansChanged = true;
            if (bansChanged) saveBans();
            if (pid) chatMutes.delete(pid);
            // Déconnexion live si connecté (rooms + instances).
            let victimWs = null;
            for (const [, room] of rooms) {
              const entry = room.get(pid);
              if (entry?.ws) { victimWs = entry.ws; break; }
            }
            if (!victimWs) {
              const ie = instancePeers.get(pid);
              if (ie?.ws) victimWs = ie.ws;
            }
            if (victimWs) {
              try {
                if (victimWs.readyState === 1) victimWs.send(JSON.stringify({ t: "adminKick", reason: "Compte supprimé par l'admin." }));
              } catch {}
            }
            if (pid) removeFromAllRooms(pid);
            if (pid) peerNoGrace.set(pid, Date.now());
            if (victimWs) {
              const ws = victimWs;
              setTimeout(() => { try { ws.close(); } catch {} }, 500);
            }
            // Groupes : éjecte le fantôme des groupes en mémoire.
            try {
              socialPeerGone(pid, {
                id: pid, state: { pseudo: res.pseudo }, authed: true,
                send: () => {},
                sendTo: (to, obj) => sendToPeer(to, obj),
                findByPseudo: (pseudo) => findPeerByPseudo(pseudo),
                describe: (p) => (String(p) === pid
                  ? { id: pid, pseudo: String(res.pseudo || "Pilote").slice(0, 20), online: false }
                  : describePeer(p)),
              }, { graceMs: 0 });
            } catch {}
            // Amis : refresh live de leur liste + présence hors ligne.
            try {
              for (const fid of (res.affected || [])) {
                const fpid = `u_${String(fid)}`;
                sendToPeer(fpid, { t: "friendsChanged" });
                sendToPeer(fpid, { t: "friendOnline", id: pid, pseudo: String(res.pseudo || "Pilote").slice(0, 20), online: false, map: "", shipId: "", instance: false, inGroup: false });
              }
            } catch {}
            try {
              const rawUid = String(res.id || "");
              if (rawUid) notifyFriendPresence(rawUid, false);
            } catch {}
          } catch {}
          adminJson(response, 200, res);
          return;
        }
        if (pathname === "/api/admin/give") {
          // GiveCredit : pseudo + quantité (négatif = retirer). Notifie le
          // joueur s'il est connecté ; sinon récupéré à sa prochaine synchro.
          const res = adminGiveCredits(String(body?.pseudo || ""), body?.amount);
          if (!res || res.ok !== true) {
            adminJson(response, res?.error === "Compte introuvable." ? 404 : 400, res || { ok: false, error: "Montant invalide." });
            return;
          }
          try {
            const peer = findPeerByPseudo(res.pseudo);
            if (peer) {
              const txt = `L'admin t'a ${res.given > 0 ? "donné" : "retiré"} ${Math.abs(res.given).toLocaleString("fr-FR")} crédits. Nouveau solde : ${res.after.toLocaleString("fr-FR")}.`;
              sendToPeer(peer.id, { t: "chatMsg", from: "[ADMIN]", text: txt, at: Date.now(), by: "admin" });
            }
          } catch {}
          adminJson(response, 200, res);
          return;
        }
        if (pathname === "/api/admin/give-exp") {
          const res = adminGiveExperience(String(body?.pseudo || ""), body?.amount);
          if (!res || res.ok !== true) {
            adminJson(response, res?.error === "Compte introuvable." ? 404 : 400, res || { ok: false, error: "Montant invalide." });
            return;
          }
          try {
            const peer = findPeerByPseudo(res.pseudo);
            if (peer) {
              const txt = `L'admin t'a ${res.given > 0 ? "donné" : "retiré"} ${Math.abs(res.given).toLocaleString("fr-FR")} EXP. Nouveau total : ${res.after.toLocaleString("fr-FR")}.`;
              sendToPeer(peer.id, { t: "chatMsg", from: "[ADMIN]", text: txt, at: Date.now(), by: "admin" });
            }
          } catch {}
          adminJson(response, 200, res);
          return;
        }
        if (pathname === "/api/admin/give-honor") {
          const res = adminGiveHonor(String(body?.pseudo || ""), body?.amount);
          if (!res || res.ok !== true) {
            adminJson(response, res?.error === "Compte introuvable." ? 404 : 400, res || { ok: false, error: "Montant invalide." });
            return;
          }
          try {
            const peer = findPeerByPseudo(res.pseudo);
            if (peer) {
              const txt = `L'admin t'a ${res.given > 0 ? "donné" : "retiré"} ${Math.abs(res.given).toLocaleString("fr-FR")} honneur. Nouveau total : ${res.after.toLocaleString("fr-FR")}.`;
              sendToPeer(peer.id, { t: "chatMsg", from: "[ADMIN]", text: txt, at: Date.now(), by: "admin" });
            }
          } catch {}
          adminJson(response, 200, res);
          return;
        }
        if (pathname === "/api/admin/give-module") {
          // Give module roulette : pseudo + famille vaisseau + stat + %.
          // Notifie le joueur s'il est connecté ; sinon récupéré à sa synchro.
          const res = adminGiveModule(String(body?.pseudo || ""), String(body?.shipId || ""), String(body?.stat || ""), body?.pct);
          if (!res || res.ok !== true) {
            adminJson(response, res?.error === "Compte introuvable." ? 404 : 400, res || { ok: false, error: "Paramètres invalides." });
            return;
          }
          try {
            const peer = findPeerByPseudo(res.pseudo);
            if (peer) {
              const b = res.module?.bonuses?.[0] || {};
              const txt = `L'admin t'a donné un module ${res.module?.shipId} : ${b.pct > 0 ? "+" : ""}${b.pct}% ${b.stat}.`;
              sendToPeer(peer.id, { t: "chatMsg", from: "[ADMIN]", text: txt, at: Date.now(), by: "admin" });
            }
          } catch {}
          adminJson(response, 200, res);
          return;
        }
        if (pathname === "/api/admin/broadcast") {
          const text = String(body?.text || "").replace(/\s+/g, " ").trim().slice(0, 200);
          if (!text) { adminJson(response, 400, { ok: false, error: "Message vide." }); return; }
          const entry = { from: "[ADMIN]", text, at: Date.now(), by: "admin", adminBlast: true };
          chatHistory.push(entry);
          if (chatHistory.length > 40) chatHistory.splice(0, chatHistory.length - 40);
          broadcastAll(JSON.stringify({ t: "chatMsg", ...entry }));
          adminJson(response, 200, { ok: true });
          return;
        }
        if (pathname === "/api/admin/cubikon-fou") {
          const want = body?.active;
          // Désactivation : immédiate (annule aussi un décompte en cours).
          if (want !== true) {
            cubikonFouCancelCountdown();
            const wasActive = isCubikonFouActive();
            setCubikonFouActive(false);
            let detonated = 0;
            if (wasActive) {
              try { detonated = cubikonFouDetonateEverywhere(); } catch {}
              cubikonFouBlast("⚡ Événement Cubikon Fou terminé ! Les Cubikons explosent, retour à la normale.");
            }
            adminJson(response, 200, { ok: true, active: false, detonated });
            return;
          }
          // Activation (déjà actif / décompte en cours : rien à relancer).
          if (isCubikonFouActive()) {
            adminJson(response, 200, { ok: true, active: true });
            return;
          }
          if (cubikonFouCountdownTimer != null) {
            adminJson(response, 200, { ok: true, active: false, countdown: true });
            return;
          }
          cubikonFouBlast(`⚡ ÉVÉNEMENT Cubikon Fou dans ${CUBIKON_FOU_COUNTDOWN_FROM}…`);
          let left = CUBIKON_FOU_COUNTDOWN_FROM;
          const tickCountdown = () => {
            cubikonFouCountdownTimer = null;
            left -= 1;
            if (left > 0) {
              cubikonFouBlast(`⚡ Cubikon Fou dans ${left}…`);
              cubikonFouCountdownTimer = setTimeout(tickCountdown, 1000);
              return;
            }
            setCubikonFouActive(true);
            cubikonFouBlast("⚡ Cubikon Fou — C'EST PARTI ! 200 Protegit !");
          };
          cubikonFouCountdownTimer = setTimeout(tickCountdown, 1000);
          adminJson(response, 200, { ok: true, active: false, countdown: true });
          return;
        }
        if (pathname === "/api/admin/unban") {
          const key = String(body?.key || "").slice(0, 128);
          const removed = key ? bans.delete(key) : false;
          if (removed) saveBans();
          if (key && key.startsWith("u_")) chatMutes.delete(key);
          adminJson(response, 200, { ok: removed });
          return;
        }
        if (pathname === "/api/admin/ban") {
          // Bannissement temporaire : id (connecté) ou pseudo (connecté ou
          // non). Bloque la CONNEXION jusqu'à expiration (null = définitif).
          // Victime déconnectée aussitôt (popup motif + date), message
          // [Système] public, persistance bans.json.
          let targetId = String(body?.id || "").slice(0, 128);
          let targetPseudo = String(body?.pseudo || "").trim().slice(0, 20);
          let peerWs = null;
          if (targetId || targetPseudo) {
            outer: {
              for (const [, room] of rooms) {
                for (const [pid, entry] of room) {
                  if ((targetId && String(pid) === targetId)
                    || (targetPseudo && String(entry?.state?.pseudo || "").trim().toLowerCase() === targetPseudo.toLowerCase())) {
                    targetId = String(pid);
                    targetPseudo = String(entry?.state?.pseudo || targetPseudo || "Pilote").slice(0, 20);
                    peerWs = entry?.ws || null;
                    break outer;
                  }
                }
              }
              for (const [pid, entry] of instancePeers) {
                if ((targetId && String(pid) === targetId)
                  || (targetPseudo && String(entry?.state?.pseudo || "").trim().toLowerCase() === targetPseudo.toLowerCase())) {
                  targetId = String(pid);
                  targetPseudo = String(entry?.state?.pseudo || targetPseudo || "Pilote").slice(0, 20);
                  peerWs = entry?.ws || null;
                  break outer;
                }
              }
            }
          }
          const keys = banKeysFor(targetId.startsWith("u_") ? targetId : "", targetPseudo);
          if (!keys.length) { adminJson(response, 400, { ok: false, error: "Pseudo ou id manquant." }); return; }
          let durationMs = body?.durationMs == null ? null : Math.floor(Number(body.durationMs));
          if (durationMs != null) {
            if (!Number.isFinite(durationMs) || durationMs <= 0) { adminJson(response, 400, { ok: false, error: "Durée invalide." }); return; }
            durationMs = Math.min(durationMs, 5 * 365 * 86400_000); // plafond 5 ans
          }
          const reason = String(body?.reason || "Comportement inapproprié.").replace(/\s+/g, " ").trim().slice(0, 200) || "Comportement inapproprié.";
          const until = durationMs == null ? null : Date.now() + durationMs;
          for (const k of keys) {
            bans.set(k, { key: k, pseudo: targetPseudo || k, reason, until, at: Date.now() });
          }
          saveBans();
          if (targetId) chatMutes.add(targetId);
          // Déconnexion immédiate si connecté (popup motif + date côté client).
          if (peerWs) {
            try {
              if (peerWs.readyState === 1) peerWs.send(JSON.stringify({ t: "banned", reason, until }));
            } catch {}
            if (targetId) removeFromAllRooms(targetId);
            if (targetId) peerNoGrace.set(targetId, Date.now());
            const victimWs = peerWs;
            setTimeout(() => { try { victimWs.close(); } catch {} }, 800);
          }
          // Message [Système] public (tchat seul, pas de bannière).
          const sysEntry = { from: "[Système]", text: `Un joueur a été banni. Motif : ${reason}`, at: Date.now(), by: "admin" };
          chatHistory.push(sysEntry);
          if (chatHistory.length > 40) chatHistory.splice(0, chatHistory.length - 40);
          broadcastAll(JSON.stringify({ t: "chatMsg", ...sysEntry }));
          adminJson(response, 200, { ok: true, pseudo: targetPseudo, reason, until });
          return;
        }
        if (pathname === "/api/admin/cheat-hold") {
          // Gel manuel anticheat (modération) : kick + gel du compte en
          // attente d'examen, comme la sanction auto. Pseudo ou id.
          const targetId = String(body?.id || "").slice(0, 128);
          const targetPseudo = String(body?.pseudo || "").trim().slice(0, 20);
          const reason = String(body?.reason || "Dossier anticheat — en cours d'examen par la modération.").replace(/\s+/g, " ").trim().slice(0, 200);
          let pid = "";
          if (targetId) {
            pid = targetId;
          } else if (targetPseudo) {
            const low = targetPseudo.toLowerCase();
            outer: {
              for (const [, room] of rooms) {
                for (const [rid, entry] of room) {
                  if (String(entry?.state?.pseudo || "").trim().toLowerCase() === low) { pid = String(rid); break outer; }
                }
              }
              for (const [rid, entry] of instancePeers) {
                if (String(entry?.state?.pseudo || "").trim().toLowerCase() === low) { pid = String(rid); break outer; }
              }
            }
          }
          if (!pid) {
            // Hors ligne : gel par clé pseudo (bloqué à la prochaine connexion).
            if (!targetPseudo) { adminJson(response, 400, { ok: false, error: "Pseudo ou id manquant." }); return; }
            const key = `pseudo:${targetPseudo.toLowerCase()}`.slice(0, 128);
            bans.set(key, { key, pseudo: targetPseudo, reason, until: null, at: Date.now(), cheatHold: true, evidence: { manual: true } });
            saveBans();
            adminJson(response, 200, { ok: true, pseudo: targetPseudo, offline: true });
            return;
          }
          const res = punishCheater(pid, { manual: true, at: Date.now() }, reason);
          adminJson(response, 200, res);
          return;
        }
        const pid = String(body?.id || "");
        if (!pid) { adminJson(response, 400, { ok: false, error: "Id manquant." }); return; }
        if (pathname === "/api/admin/kick") {
          let found = false;
          const reason = String(body?.reason || "Comportement inapproprié.").slice(0, 200);
          if (pid) peerNoGrace.set(pid, Date.now());
          for (const [map, room] of rooms) {
            const entry = room.get(pid);
            if (!entry || !entry.ws) continue;
            found = true;
            // La victime pète (visible par tous) puis est déconnectée
            // avec le motif. Fermeture différée : laisse passer les messages.
            try {
              if (entry.ws.readyState === 1) entry.ws.send(JSON.stringify({ t: "adminKick", reason }));
            } catch {}
            try {
              broadcastRoom(room, JSON.stringify({ t: "adminBoom", id: pid, x: Math.round(Number(entry.state?.x) || 0), y: Math.round(Number(entry.state?.y) || 0) }), pid);
            } catch {}
            const victimWs = entry.ws;
            setTimeout(() => { try { victimWs.close(); } catch {} }, 500);
          }
          // Joueur en instance perso (gate) : même sanction (pas d'explosion
          // visible, il est seul sur sa map).
          if (!found) {
            const entry = instancePeers.get(pid);
            if (entry?.ws) {
              found = true;
              try {
                if (entry.ws.readyState === 1) entry.ws.send(JSON.stringify({ t: "adminKick", reason }));
              } catch {}
              const victimWs = entry.ws;
              setTimeout(() => { try { victimWs.close(); } catch {} }, 500);
            }
          }
          adminJson(response, 200, { ok: !!found });
          return;
        }
        // mute
        if (body?.muted === false) chatMutes.delete(pid);
        else chatMutes.add(pid);
        adminJson(response, 200, { ok: true, muted: chatMutes.has(pid) });
      } catch {
        adminJson(response, 500, { ok: false, error: "Erreur serveur." });
      }
    });
    return true;
  }
  adminJson(response, 404, { ok: false, error: "Inconnu." });
  return true;
}

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".gif": "image/gif",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

// --- HTTP statique (meme comportement que GAME_SERVER.js) + API comptes ---
const server = createServer(async (request, response) => {
  try {
    setSecurityHeaders(response);
    // Laisse passer les upgrades WS vers le WebSocketServer (noServer)
    if (request.headers.upgrade) return;
    // Panneau admin : /api/admin/* (token ORBIT_ADMIN_PASS, avant /api/*).
    try {
      const adminPath = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
      if (handleAdminApi(request, response, adminPath)) return;
    } catch (e) {
      console.error("[admin]", e?.message || e);
      response.writeHead(500, { "content-type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ ok: false, error: "Erreur serveur." }));
      return;
    }
    // Comptes serveur : /api/* (register, login, me, save, logout, ping).
    try {
      if (handleAccountApi(request, response)) return;
    } catch (e) {
      console.error("[api]", e?.message || e);
      response.writeHead(500, { "content-type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ ok: false, error: "Erreur serveur." }));
      return;
    }
    const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    const relative = publicRelativePath(pathname);
    const file = normalize(join(root, relative));
    if (file !== root && !file.startsWith(`${root}\\`) && !file.startsWith(`${root}/`)) throw new Error("Invalid path");
    const info = await stat(file);
    if (!info.isFile()) throw new Error("Not a file");
    const etag = `W/"${info.size.toString(16)}-${info.mtimeMs.toString(16)}"`;
    response.setHeader("etag", etag);
    response.setHeader("cache-control", "no-cache");
    if (request.headers["if-none-match"]?.split(/\s*,\s*/).includes(etag)) {
      response.writeHead(304);
      response.end();
      return;
    }
    response.writeHead(200, {
      "content-type": mimeTypes[extname(file).toLowerCase()] || "application/octet-stream",
      "cache-control": "no-cache",
    });
    response.end(request.method === "HEAD" ? undefined : await readFile(file));
  } catch {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Fichier introuvable");
  }
});

// --- Multi minimal Etape 1 : rooms par map, broadcast positions 20 Hz ---
// Etape 3 : simu NPC serveur par map zone (positions, HP, mort, killer).
// Protocole (JSON) :
//  client -> serveur : { t:"hello", map, pseudo, shipId } puis { t:"pos", x,y,angle,shipId,pseudo,dead,hpPct,shPct,atk,tx,ty },
//    { t:"map", map } et { t:"hit", uid, dmg, pen, critChance, critMult, weaken, kind }
//  serveur -> client : { t:"welcome", id } puis { t:"snapshot", players:[...], npc:[...] } 20x/s
const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });
// Un snapshot complet est remplace 50 ms plus tard : ne jamais empiler des
// etats obsoletes pour un client dont la connexion ne suit plus.
const SNAPSHOT_BACKPRESSURE_LIMIT = 256 * 1024;
const NPC_NEAR_PLAYER_RADIUS = 2000;
const PLAYER_NEAR_PLAYER_RADIUS = 2600;
const PLAYER_STATIC_REFRESH_TICKS = 10; // garde-fou de resynchronisation : 500 ms
const rooms = new Map(); // mapId(lower) -> Map(id -> { ws, state })
const npcSims = new Map(); // mapId(lower) -> ZoneNpcSim | null | Promise
const NPC_RESPAWNS_FILE = join(root, "SERVER_DATA", "npc_respawns.json");
let savedNpcRespawns = {};
try {
  const parsed = JSON.parse(readFileSync(NPC_RESPAWNS_FILE, "utf8") || "{}");
  if (parsed && typeof parsed === "object" && parsed.maps && typeof parsed.maps === "object") {
    savedNpcRespawns = parsed.maps;
  }
} catch {}

let npcRespawnSavePending = null;
function saveNpcRespawns() {
  // Un seul fichier temporaire : aucune ecriture concurrente, y compris
  // lorsque l'arret arrive pendant la sauvegarde periodique.
  if (npcRespawnSavePending) return npcRespawnSavePending;
  npcRespawnSavePending = persistNpcRespawns().finally(() => { npcRespawnSavePending = null; });
  return npcRespawnSavePending;
}
async function persistNpcRespawns() {
  const maps = {};
  for (const [mapId, sim] of npcSims) {
    if (!sim || typeof sim.then === "function" || typeof sim.serializeRespawns !== "function") continue;
    try { maps[mapId] = JSON.parse(sim.serializeRespawns()); } catch {}
  }
  // Conserve également les cartes pas encore chargées pendant cette session.
  for (const [mapId, state] of Object.entries(savedNpcRespawns)) {
    if (!(mapId in maps)) maps[mapId] = state;
  }
  try {
    await mkdir(dirname(NPC_RESPAWNS_FILE), { recursive: true });
    const temporary = `${NPC_RESPAWNS_FILE}.tmp`;
    await writeFile(temporary, JSON.stringify({ v: 1, savedAt: Date.now(), maps }));
    await rename(temporary, NPC_RESPAWNS_FILE);
    savedNpcRespawns = maps;
  } catch {}
}

setInterval(saveNpcRespawns, 5000).unref?.();
// Refresh (F5) : le socket se ferme mais le joueur revient aussitôt.
// Grâce de 12 s (même durée que le groupe) : room, amis et groupe le
// gardent ; s'il revient (pid stable u_<id>), rattachement silencieux
// sans leave/join. Seul un vrai départ purge (leave + hors ligne).
const PEER_GRACE_MS = 12_000;
const peerGrace = new Map(); // pid -> timeout
const peerNoGrace = new Map(); // pid -> at (kick/ban/suppression : purge immédiate, flag expiré à 60 s)

function cancelPeerGrace(pid) {
  const t = peerGrace.get(String(pid));
  if (!t) return false;
  clearTimeout(t);
  peerGrace.delete(String(pid));
  return true;
}

// Retire l'entrée fantôme SANS broadcast (rattachement en cours).
function dropStaleEntry(pid) {
  const key = String(pid);
  for (const [, room] of rooms) room.delete(key);
  instancePeers.delete(key);
}

function finalizePeerGone(pid, snap) {
  const key = String(pid);
  const ctx = {
    id: key, state: snap?.state, authed: !!snap?.authed,
    send: () => {},
    sendTo: (to, obj) => sendToPeer(to, obj),
    findByPseudo: (pseudo) => findPeerByPseudo(pseudo),
    describe: (p) => describePeer(p),
  };
  try { socialPeerGone(key, ctx, { graceMs: 0 }); } catch {}
  try { if (snap?.authed && snap?.accountId) notifyFriendPresence(snap.accountId, false); } catch {}
  try { removeFromAllRooms(key); } catch {}
}

function schedulePeerGrace(pid, snap) {
  const key = String(pid);
  const ng = peerNoGrace.get(key);
  if (ng != null) {
    peerNoGrace.delete(key);
    if (Date.now() - Number(ng) < 60_000) {
      finalizePeerGone(key, snap);
      return;
    }
  }
  if (peerGrace.has(key)) return;
  // Tag : la boucle 10 s et la simu NPC ignorent le fantôme.
  try {
    for (const [, room] of rooms) {
      const e = room.get(key);
      if (e?.state) { e.state._graceUntil = Date.now() + PEER_GRACE_MS; break; }
    }
    const ie = instancePeers.get(key);
    if (ie?.state) ie.state._graceUntil = Date.now() + PEER_GRACE_MS;
  } catch {}
  peerGrace.set(key, setTimeout(() => {
    peerGrace.delete(key);
    finalizePeerGone(key, snap);
  }, PEER_GRACE_MS));
}const boxRooms = new Map(); // mapId(lower) -> Map(uid -> { type, x, y })
const boxRoomLoads = new Map(); // mapId -> Promise<Map>
const boxRespawns = new Map(); // mapId -> [{ uid, type, at }]
const pvpFeeds = new Map(); // mapId(lower) -> Map("victime|attaquant" -> { uid, by, total })
const pvpFarm = new Map(); // anti-farm : "tueur|victime" -> { n, t0 } (rendement decroissant 60 min)
const chatHistory = []; // global : [{ from, text, at }] (40 derniers)
const chatLastById = new Map(); // anti-spam : id -> timestamp dernier message
const clanChatLast = new Map(); // anti-spam tchat de clan : id -> timestamp

// ---------------------------
// Événement "Cubikon Fou" (admin) : Cubikons normaux mais 25x plus de
// Protegit (voir NPC_ROOM). État mémoire seule (restart = retour normal).
// Activation : décompte 5→1 en annonce globale puis GO.
// Désactivation : annonce + explosion de TOUS les Cubikons (respawn normaux).
// ---------------------------
const CUBIKON_FOU_COUNTDOWN_FROM = 5;
let cubikonFouCountdownTimer = null;

function cubikonFouBlast(text) {
  try {
    const entry = { from: "[ADMIN]", text: String(text || "").slice(0, 200), at: Date.now(), by: "admin", adminBlast: true };
    chatHistory.push(entry);
    if (chatHistory.length > 40) chatHistory.splice(0, chatHistory.length - 40);
    broadcastAll(JSON.stringify({ t: "chatMsg", ...entry }));
  } catch {}
}

function cubikonFouCancelCountdown() {
  if (cubikonFouCountdownTimer) {
    try { clearTimeout(cubikonFouCountdownTimer); } catch {}
    cubikonFouCountdownTimer = null;
  }
}

function cubikonFouDetonateEverywhere() {
  let total = 0;
  const nowMs = Date.now();
  try {
    for (const [, sim] of npcSims) {
      if (!sim || typeof sim.detonateAllCubikons !== "function") continue;
      // Les sims peuvent être des promesses en cours de chargement.
      if (typeof sim.then === "function") continue;
      try { total += sim.detonateAllCubikons(nowMs) || 0; } catch {}
    }
  } catch {}
  return total;
}

// Tchat de clan : diffusé aux membres connectés (rooms + instances).
// Comparaison sur le tag en mémoire (rafraîchi au hello + ping 15 s).
function broadcastToClan(tag, obj, excludeId = null) {
  const clean = String(tag || "").toUpperCase().slice(0, 5);
  if (!clean) return 0;
  let payload = null;
  try { payload = JSON.stringify(obj); } catch { return 0; }
  let n = 0;
  const matches = (s) => String(s?.clanTag || "").toUpperCase().slice(0, 5) === clean;
  for (const [, room] of rooms) {
    for (const [pid, entry] of room) {
      if (excludeId != null && String(pid) === String(excludeId)) continue;
      if (!matches(entry?.state)) continue;
      try { if (entry.ws.readyState === 1) { entry.ws.send(payload); n++; } } catch {}
    }
  }
  for (const [pid, entry] of instancePeers) {
    if (excludeId != null && String(pid) === String(excludeId)) continue;
    if (!matches(entry?.state)) continue;
    try { if (entry.ws.readyState === 1) { entry.ws.send(payload); n++; } } catch {}
  }
  return n;
}

// Rafraîchit le tag de clan en mémoire depuis la base (mutations HTTP).
function refreshClanTag(state, accountId) {
  try {
    if (!accountId) { state.clanTag = ""; return ""; }
    const tag = clanTagOfUser(accountId) || "";
    state.clanTag = String(tag).slice(0, 5);
    return state.clanTag;
  } catch { return String(state?.clanTag || ""); }
}
const friendPingLast = new Map(); // anti-spam demandes d'ami : id -> timestamp
const hitStats = { count: 0, byMap: new Map() }; // diagnostic multi
const rewardedNpcDeaths = new Map(); // map:uid:seq -> timestamp (anti-double diffusion)
const serverRunId = randomBytes(8).toString("hex");
setInterval(() => {
  if (hitStats.count > 0) {
    const detail = [...hitStats.byMap.entries()].map(([m, n]) => `${m}:${n}`).join(" ");
    console.log(`[multi:npc] hits recus: ${hitStats.count} (${detail})`);
  }
  hitStats.count = 0;
  hitStats.byMap.clear();
}, 30000);
let nextId = 1;

function collectableAllowedOnMap(cfg, mapId) {
  const id = String(mapId || "").toLowerCase();
  const deny = cfg?.denyMaps ?? cfg?.blockedMaps ?? cfg?.disabledMaps ?? cfg?.excludeMaps;
  for (const value of (Array.isArray(deny) ? deny : deny != null ? [deny] : [])) {
    const denied = String(value || "").toLowerCase();
    if (denied === "*" || denied === "all" || denied === id) return false;
  }
  const maps = cfg?.maps ?? cfg?.map ?? cfg?.onlyMaps ?? cfg?.allowedMaps;
  if (maps == null || maps === "*" || maps === "all") return true;
  return (Array.isArray(maps) ? maps : [maps]).some((value) => String(value || "").toLowerCase() === id);
}

// Marge anti-murs des box : le client récolte au point (x, y-70) avec un
// vaisseau de rayon ~14 + tolérance 18. Une box à 40px du mur laissait son
// point de collecte dans le mur => non récoltable (cargo / palladium...).
// 140px garantit box + point de collecte atteignables.
const BOX_WALL_CLEAR = 140;
const BOX_COLLECT_DY = -70;
const BOX_COLLECT_CLEAR = 52;

function boxPosInWall(x, y, walls, clear = BOX_WALL_CLEAR) {
  if (!Array.isArray(walls) || !walls.length) return false;
  const m = Math.max(0, Number(clear) || 0);
  for (const w of walls) {
    const hw = Number(w?.w || 0) / 2 + m, hh = Number(w?.h || 0) / 2 + m;
    if (Math.abs(Number(x) - Number(w?.x || 0)) <= hw && Math.abs(Number(y) - Number(w?.y || 0)) <= hh) return true;
  }
  return false;
}

function boxCollectPointInWall(x, y, walls) {
  return boxPosInWall(Number(x) || 0, (Number(y) || 0) + BOX_COLLECT_DY, walls, BOX_COLLECT_CLEAR);
}

function randomBoxPosition(sim) {
  const world = sim?.world || { w: 11000, h: 7000 };
  // La sim NPC charge déjà les murs de la map (sim.walls) : jamais de box
  // bonus / palladium / cargo dedans ni trop près, sinon le point de
  // collecte (70px au-dessus) est dans le mur et la box non récoltable.
  const walls = sim?.walls || [];
  for (let t = 0; t < 24; t++) {
    const pos = { x: Math.round(80 + Math.random() * Math.max(1, world.w - 160)), y: Math.round(80 + Math.random() * Math.max(1, world.h - 160)) };
    if (boxPosInWall(pos.x, pos.y, walls)) continue;
    if (boxCollectPointInWall(pos.x, pos.y, walls)) continue;
    return pos;
  }
  return { x: Math.round(80 + Math.random() * Math.max(1, world.w - 160)), y: Math.round(80 + Math.random() * Math.max(1, world.h - 160)) };
}

function ensureBoxRoom(mapId) {
  const key = String(mapId || "1-1").toLowerCase();
  if (boxRooms.has(key)) return Promise.resolve(boxRooms.get(key));
  if (boxRoomLoads.has(key)) return boxRoomLoads.get(key);
  const pending = Promise.resolve(ensureNpcSim(key)).then((sim) => {
    const boxes = new Map();
    for (const [type, cfg] of Object.entries(COLLECTABLE_TYPES)) {
      if (!cfg || cfg.enabled === false || !collectableAllowedOnMap(cfg, key)) continue;
      const qty = Math.max(0, Math.floor(Number(cfg.qty ?? cfg.count ?? cfg.amount ?? cfg.maxAlive) || 0));
      for (let index = 0; index < qty; index++) {
        const pos = randomBoxPosition(sim);
        boxes.set(`${type}#${index}`, { type, ...pos });
      }
    }
    boxRooms.set(key, boxes);
    boxRoomLoads.delete(key);
    const room = rooms.get(key);
    if (room?.size) broadcastRoom(room, JSON.stringify({ t: "box", op: "list", boxes: [...boxes].map(([uid, b]) => ({ uid, ...b })) }));
    return boxes;
  }).catch(() => {
    boxRoomLoads.delete(key);
    const boxes = new Map();
    // La simulation NPC ne doit jamais conditionner l'existence des box.
    // En cas d'echec de chargement, generation native immediate avec les
    // dimensions de secours ; une room vide ne reste plus mise en cache.
    for (const [type, cfg] of Object.entries(COLLECTABLE_TYPES)) {
      if (!cfg || cfg.enabled === false || !collectableAllowedOnMap(cfg, key)) continue;
      const qty = Math.max(0, Math.floor(Number(cfg.qty ?? cfg.count ?? cfg.amount ?? cfg.maxAlive) || 0));
      for (let index = 0; index < qty; index++) {
        boxes.set(`${type}#${index}`, { type, ...randomBoxPosition(null) });
      }
    }
    boxRooms.set(key, boxes);
    const room = rooms.get(key);
    if (room?.size) broadcastRoom(room, JSON.stringify({ t: "box", op: "list", boxes: [...boxes].map(([uid, b]) => ({ uid, ...b })) }));
    return boxes;
  });
  boxRoomLoads.set(key, pending);
  return pending;
}

function sendBoxSync(ws, mapId) {
  const key = String(mapId || "1-1").toLowerCase();
  ensureBoxRoom(key).then((set) => {
    try {
      if (ws.readyState === 1) ws.send(JSON.stringify({ t: "boxesSync", map: key, boxes: [...set].map(([uid, b]) => ({ uid, ...b })) }));
    } catch {}
  });
}

// Star jump (Carte Stellaire) : aller validé sans portail. Le client attend
// {t:"starJump"} avec les coordonnées AVANT de changer de map ; son {t:"map"}
// suivant est alors un no-op (déjà sur place côté serveur).
// Refusé : instances, gates, raid Low, même map, cooldowns.
// Refusé : instances, gates, raid Low, Maudite, 5-2, Blacklight, même map, cooldowns.
const STAR_JUMP_BLOCKED_MAPS = new Set(["alpha", "beta", "gamma", "delta", "epsilon", "zeta", "kappa", "lambda", "kronos", "qz", "low", "maudite", "5-2", "1-bl", "2-bl", "3-bl"]);
const STAR_JUMP_REUSE_MS = STARMAP_JUMP_REUSE_SEC * 1000;
const STAR_JUMP_MAP_ALIASES = { low: "LOW_MAP", maudite: "MAUDITE", "1-bl": "1-BL", "2-bl": "2-BL", "3-bl": "3-BL" };

async function handleStarJumpRequest(ws, peer, fromMap, target, setMapId) {
  const now = Date.now();
  const deny = (reason) => {
    try { if (ws.readyState === 1) ws.send(JSON.stringify({ t: "starJump", ok: false, map: target, reason })); } catch {}
  };
  try {
    const { id, state } = peer;
    if (!target || !serverMaps.has(target) || STAR_JUMP_BLOCKED_MAPS.has(target)) return deny("unreachable");
    if (target === String(fromMap || "").toLowerCase()) return deny("same-map");
    if (now < Number(state.starJumpCdUntil || 0) || now < Number(state.portalCdUntil || 0)) return deny("cooldown");
    const world = serverMaps.get(target)?.world || { w: 11000, h: 7000 };
    // Murs de la map d'arrivée (jamais dedans) : sim NPC si dispo, sinon import direct.
    let walls = [];
    try {
      const sim = await Promise.resolve(ensureNpcSim(target)).catch(() => null);
      if (sim && typeof sim.then !== "function" && Array.isArray(sim.walls)) walls = sim.walls;
    } catch {}
    if (!walls.length) {
      try {
        const dir = STAR_JUMP_MAP_ALIASES[target] || target;
        const spawns = await import(`../MAPS/${dir}/SPAWNS.js`);
        if (typeof spawns?.getZoneWalls === "function") walls = spawns.getZoneWalls(world) || [];
      } catch {}
    }
    let ax = Math.round(world.w / 2), ay = Math.round(world.h / 2);
    for (let t = 0; t < 12; t++) {
      const cx = Math.round(300 + Math.random() * Math.max(1, world.w - 600));
      const cy = Math.round(300 + Math.random() * Math.max(1, world.h - 600));
      let blocked = false;
      for (const wl of walls) {
        const hw = Number(wl?.w || 0) / 2 + 60, hh = Number(wl?.h || 0) / 2 + 60;
        if (Math.abs(cx - Number(wl?.x || 0)) <= hw && Math.abs(cy - Number(wl?.y || 0)) <= hh) { blocked = true; break; }
      }
      if (!blocked) { ax = cx; ay = cy; break; }
    }
    state._arrival = { x: ax, y: ay, until: now + 15000 };
    state.x = ax;
    state.y = ay;
    state.vx = 0; state.vy = 0; state.moving = false;
    state.teleportSeq = (Number(state.teleportSeq) || 0) + 1;
    state.starJumpCdUntil = now + STAR_JUMP_REUSE_MS;
    state.portalCdUntil = now + 5000;
    state.serverMap = target;
    try {
      removeFromAllRooms(id);
      setMapId({ mapId: target });
      roomFor(target).set(id, { ws, state });
      ensureNpcSim(target);
      sendBoxSync(ws, target);
    } catch {}
    if (ws.readyState === 1) ws.send(JSON.stringify({ t: "starJump", ok: true, map: target, x: ax, y: ay }));
  } catch {
    deny("error");
  }
}

function handleHangarArrivalRequest(ws, peer, accountId, fromMap, hangarId, setMapId) {
  const { id, state } = peer, now = Date.now();
  const reply = body => { if (ws.readyState === 1) ws.send(JSON.stringify({ t: 'hangarArrival', hangarId, ...body })); };
  const deny = reason => reply({ ok: false, reason });
  if (!accountId || state.instance || state._clockGuard?.blocked || state.pvpDead || !(state.hp > 0)) return deny('unavailable');
  if (now < Number(state.hangarArrivalCdUntil || 0)) return deny('cooldown');
  const sourceSim = npcSims.get(fromMap);
  if (state.safe !== true || !sourceSim?.inSafe(state.x, state.y)) return deny('unsafe');
  if (now - Math.max(Number(state.pvpAt) || 0, Number(state.npcAt) || 0) < 5000) return deny('combat');
  const user = getAccountGameplayData(accountId);
  const current = user?.hangars?.find(h => h?.active);
  const target = user?.hangars?.find(h => String(h?.id) === hangarId);
  if (!target || target === current) return deny('hangar');
  const map = String(target.lastMap || getFactionHomeMap(user.faction)).toLowerCase();
  const world = serverMaps.get(map)?.world;
  if (!world) return deny('destination');
  const base = baseArrival(serverMaps, map, user.faction);
  const x = Number(target.lastPos?.x ?? base.x), y = Number(target.lastPos?.y ?? base.y);
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < 18 || y < 18 || x > world.w - 18 || y > world.h - 18) return deny('destination');
  // Seule la position du hangar possede et sauvegarde donne droit au transfert.
  // Le client ne fournit aucune coordonnee ni exemption de mouvement.
  state._arrival = { x, y, until: now + 15000 };
  Object.assign(state, { x, y, vx: 0, vy: 0, moving: false, motionBlocked: false,
    teleportSeq: (Number(state.teleportSeq) || 0) + 1, moveBuck: 0, moveBuckT: now,
    serverMap: map, hangarArrivalCdUntil: now + 5000, updatedAt: now });
  removeFromAllRooms(id);
  setMapId(map);
  roomFor(map).set(id, { ws, state });
  ensureNpcSim(map);
  sendBoxSync(ws, map);
  reply({ ok: true, map, x, y });
}

function broadcastRoom(room, payload, excludeId = null) {
  for (const [pid, entry] of room) {
    if (excludeId != null && String(pid) === String(excludeId)) continue;
    try { if (entry.ws.readyState === 1) entry.ws.send(payload); } catch {}
  }
}

// Canaux globaux (tchat, enchères, annonces admin) : TOUS les sockets,
// y compris les joueurs en instance perso (Galaxy Gates, hors room).
const allWs = new Set();
// La vie du socket est distincte de la derniere position de combat.
// Cela couvre aussi les instances, qui n'envoient pas de positions.
setInterval(() => {
  const now = Date.now();
  for (const ws of allWs) {
    if (ws.readyState !== 1 || now - ws.lastHeardAt <= 30000) continue;
    try { ws.close(4000, "Heartbeat timeout"); } catch {}
    const timer = setTimeout(() => { if (ws.readyState !== 3) ws.terminate(); }, 1000);
    timer.unref();
  }
}, 1000);
function broadcastAll(payload) {
  for (const ws of allWs) {
    try { if (ws.readyState === 1) ws.send(payload); } catch {}
  }
}

// Joueurs en instance perso (hors room) : suivis ici pour les messages
// dirigés (murmures, groupes) et la présence amis, cross-map.
const instancePeers = new Map(); // pid -> { ws, state, mapId }

// Recherche d'un pilote connecté par pseudo (rooms + instances).
function findPeerByPseudo(pseudo) {
  const key = String(pseudo || "").trim().toLowerCase();
  if (!key) return null;
  for (const [, room] of rooms) {
    for (const [pid, entry] of room) {
      if (String(entry?.state?.pseudo || "").trim().toLowerCase() === key) {
        return { id: String(pid), pseudo: String(entry.state.pseudo || "Pilote").slice(0, 20) };
      }
    }
  }
  for (const [pid, entry] of instancePeers) {
    if (String(entry?.state?.pseudo || "").trim().toLowerCase() === key) {
      return { id: String(pid), pseudo: String(entry.state.pseudo || "Pilote").slice(0, 20) };
    }
  }
  return null;
}

// Fiche d'un pilote présent, y compris pendant la grâce de reconnexion.
function describePeer(pid) {
  const id = String(pid);
  let entry = null, map = "", instance = false;
  for (const [mkey, room] of rooms) {
    const e = room.get(id);
    if (e) {
      entry = e; map = mkey;
      break;
    }
  }
  if (!entry) {
    entry = instancePeers.get(id);
    if (entry) { map = String(entry.mapId || ""); instance = true; }
  }
  if (!entry) return null;
  const s = entry.state || {};
  return {
    id, pseudo: String(s.pseudo || "Pilote").slice(0, 20), map, online: entry.ws?.readyState === 1, instance, clanTag: String(s.clanTag || "").slice(0, 5),
    x: Number(s.x) || 0, y: Number(s.y) || 0, hpPct: Number(s.hpPct ?? 1), shPct: Number(s.shPct ?? 1),
    hpMax: Number(s.hpMax) || 1, shMax: Number(s.shMax) || 0, dead: s.dead === true,
    shipId: String(s.shipId || "").slice(0, 64), petActive: s.peta === 1,
    b2: Array.isArray(s.b2) ? s.b2.map((v) => String(v || "")).filter((v) => ["dmg2", "shd2", "hp2", "ep2", "hon2", "rep2", "res2", "sreg2"].includes(v)).slice(0, 8) : [],
    combat: s.combat === "npc" || s.combat === "player" ? s.combat : "",
    targetName: String(s.targetName || "").slice(0, 64),
    targetHpPct: Number(s.targetHpPct ?? 0), targetShPct: Number(s.targetShPct ?? 0),
    targetHpMax: Number(s.targetHpMax) || 0, targetShMax: Number(s.targetShMax) || 0,
  };
}

function sendToPeer(pid, obj) {
  const id = String(pid);
  let payload = null;
  try { payload = JSON.stringify(obj); } catch { return false; }
  for (const [, room] of rooms) {
    const e = room.get(id);
    if (e?.ws) {
      try { if (e.ws.readyState === 1) e.ws.send(payload); return true; } catch {}
    }
  }
  const ie = instancePeers.get(id);
  if (ie?.ws) {
    try { if (ie.ws.readyState === 1) ie.ws.send(payload); return true; } catch {}
  }
  return false;
}

// Présence amis : prévient les abonnés connectés + sync initiale au hello.
function notifyFriendPresence(accountId, online) {
  try {
    const selfPid = `u_${String(accountId)}`;
    let selfPseudo = "Pilote";
    let presence = null;
    try { presence = describePeer(selfPid); selfPseudo = presence?.pseudo || selfPseudo; } catch {}
    for (const followerId of friendFollowers(accountId)) {
      const fpid = `u_${String(followerId)}`;
      if (fpid === selfPid) continue;
      sendToPeer(fpid, { t: "friendOnline", id: selfPid, pseudo: selfPseudo, online: online === true, map: String(presence?.map || ""), shipId: String(presence?.shipId || ""), instance: presence?.instance === true, inGroup: !!socialGroupOf(selfPid) });
    }
  } catch {}
}
function sendFriendsSync(ws, accountId) {
  try {
    const online = listFriends(accountId).map((f) => {
      const id = `u_${String(f.id)}`;
      const d = describePeer(id);
      return d ? { id, pseudo: f.pseudo, map: String(d.map || ""), shipId: String(d.shipId || ""), instance: d.instance === true, inGroup: !!socialGroupOf(id) } : null;
    }).filter(Boolean);
    try { ws.send(JSON.stringify({ t: "friendsSync", online })); } catch {}
  } catch {}
}

function ensureNpcSim(mapId) {
  const key = String(mapId || "1-1").toLowerCase();
  if (npcSims.has(key)) return npcSims.get(key);
  const pending = ZoneNpcSim.create(key, savedNpcRespawns[key] || null).then((sim) => {
    npcSims.set(key, sim || null);
    return sim || null;
  }).catch(() => {
    npcSims.set(key, null);
    return null;
  });
  npcSims.set(key, pending);
  return pending;
}

// Dernier essai de (re)création de simu par map (une simu nulle — échec de
// chargement — n'est pas réessayée par ensureNpcSim : purge définitive sinon).
const npcSimRetryAt = new Map();
function retryNpcSim(key, nowMs) {
  const keyLc = String(key || "1-1").toLowerCase();
  const at = Number(npcSimRetryAt.get(keyLc) || 0);
  if (nowMs < at) return;
  npcSimRetryAt.set(keyLc, nowMs + 10000);
  try { npcSims.delete(keyLc); } catch {}
  try { ensureNpcSim(keyLc); } catch {}
}

function roomFor(mapId) {
  const key = String(mapId || "1-1").toLowerCase();
  if (!rooms.has(key)) rooms.set(key, new Map());
  return rooms.get(key);
}

// Depart immediat (portail / changement de map) : previent l'ancienne room
// pour que les observateurs suppriment le vaisseau sur-le-champ au lieu de
// le garder en extrapolation jusqu'au timeout (le "clone" de 2-3 secondes).
function announceLeave(id) {
  const key = String(id);
  let payload = null;
  try { payload = JSON.stringify({ t: "leave", id: key }); } catch { return; }
  for (const [, room] of rooms) {
    if (!room.has(key)) continue;
    try { broadcastRoom(room, payload, key); } catch {}
  }
}

function removeFromAllRooms(id) {
  try { announceLeave(id); } catch {}
  for (const [mkey, room] of rooms) {
    room.delete(id);
  }
  instancePeers.delete(String(id));
}

// Top 10 dégâts Invoke / Mindfire (soleils personnels, même partis).
function sunTopIds(death) {
  try {
    if (death?.type !== "npc_Invoke_XVI" && death?.type !== "npc_Mindfire_Behemoth") return [];
    if (!Array.isArray(death?.shares) || !death.shares.length) return [];
    return death.shares
      .filter((s) => Array.isArray(s) && String(s[0]).startsWith("u_") && Number(s[1]) > 0)
      .map((s) => [String(s[0]), Math.max(0, Number(s[1]) || 0)])
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map((s) => s[0]);
  } catch { return []; }
}

function npcRewardShares(killerId, mapId, death) {
  // Invoke XVI / Mindfire Behemoth : pas de partage de groupe.
  // - Destruction (credits/EXP/honneur) : TOUS les tapeurs présents sur la
  //   map, au prorata des dégâts (floor + reste au top dégâts).
  // - Soleil : top 10 dégâts (même s'ils ont quitté la map), même contenu.
  if ((death?.type === "npc_Invoke_XVI" || death?.type === "npc_Mindfire_Behemoth")
    && Array.isArray(death?.shares) && death.shares.length) {
    try {
      const ranked = death.shares
        .filter((s) => Array.isArray(s) && String(s[0]).startsWith("u_") && Number(s[1]) > 0)
        .map((s) => [String(s[0]), Math.max(0, Number(s[1]) || 0)])
        .sort((a, b) => b[1] - a[1])
        .slice(0, 24);
      if (ranked.length) {
        const sunIds = new Set(ranked.slice(0, 10).map((s) => s[0]));
        let room = null;
        try { room = rooms.get(String(mapId)); } catch {}
        const present = ranked.filter(([pid]) => { try { return !!room && room.has(pid); } catch { return false; } });
        const eligible = present.length ? present : [[String(killerId), 1]];
        const total = eligible.reduce((s, [, d]) => s + d, 0) || 1;
        const floors = eligible.map(([, d]) => Math.max(0, Math.floor(d * 100 / total)));
        const acc = floors.reduce((s, v) => s + v, 0);
        floors[0] = Math.max(0, floors[0] + (100 - acc));
        return eligible.map(([pid], i) => ({ pid, percent: floors[i], sun: sunIds.has(pid) }));
      }
    } catch {}
  }
  let eligible = [String(killerId)];
  try {
    const group = socialDescribeGroup(killerId, { describe: (pid) => describePeer(pid) });
    const grouped = (group?.members || [])
      .filter((m) => m?.online !== false && m?.instance !== true && String(m.map).toLowerCase() === String(mapId).toLowerCase())
      .map((m) => String(m.id))
      .filter((pid) => pid.startsWith("u_"))
      .sort();
    if (grouped.includes(String(killerId))) eligible = grouped;
  } catch {}
  const base = Math.floor(100 / eligible.length);
  const remainder = 100 - base * eligible.length;
  let seed = 2166136261;
  const hashKey = `${death.uid}:${death.seq || 0}`;
  for (let i = 0; i < hashKey.length; i++) {
    seed ^= hashKey.charCodeAt(i);
    seed = Math.imul(seed, 16777619);
  }
  const start = (seed >>> 0) % eligible.length;
  return eligible.map((pid, index) => ({
    pid,
    percent: base + (((index - start + eligible.length) % eligible.length) < remainder ? 1 : 0),
  }));
}

// Recompenses NPC : ~8 ms de SQLite synchrone PAR PART. Execute dans la
// boucle 50 ms, quelques kills simultanes bloquaient l'event loop des
// dizaines de ms -> pong en retard -> pics de ping pour tout le monde.
// Les morts sont donc filees ici et traitees par lot hors boucle chaude
// (le client attend la recompense avant d'afficher le gain, delai invisible).
const pendingNpcRewards = []; // { mapId, death }
const queuedNpcRewardKeys = new Set();
function npcDeathKey(mapId, death) {
  return `${String(mapId).toLowerCase()}:${String(death?.uid || "")}:${Number(death?.seq) || 0}`;
}
function queueNpcDeaths(mapId, deaths) {
  if (!Array.isArray(deaths) || !deaths.length) return;
  for (const death of deaths) {
    if (!death || typeof death !== "object") continue;
    const killerId = String(death.killer || "");
    if (!killerId.startsWith("u_") || death.cause !== "gun") continue;
    const deathKey = npcDeathKey(mapId, death);
    if (rewardedNpcDeaths.has(deathKey) || queuedNpcRewardKeys.has(deathKey)) continue;
    if (pendingNpcRewards.length >= 2000) {
      const dropped = pendingNpcRewards.shift();
      if (dropped) queuedNpcRewardKeys.delete(dropped.deathKey);
    }
    queuedNpcRewardKeys.add(deathKey);
    pendingNpcRewards.push({ mapId: String(mapId), death, deathKey });
  }
}
function awardNpcDeaths(mapId, deaths) {
  queueNpcDeaths(mapId, deaths);
}
function pumpNpcRewards(budgetMs = 16) {
  const start = Date.now();
  const now = Date.now();
  for (const [key, at] of rewardedNpcDeaths) if (now - at > 10 * 60_000) rewardedNpcDeaths.delete(key);
  while (pendingNpcRewards.length && Date.now() - start < budgetMs) {
    const item = pendingNpcRewards.shift();
    if (!item) continue;
    const { mapId, death } = item;
    const killerId = String(death?.killer || "");
    const deathKey = item.deathKey || npcDeathKey(mapId, death);
    if (!killerId.startsWith("u_") || death?.cause !== "gun") { queuedNpcRewardKeys.delete(deathKey); continue; }
    if (rewardedNpcDeaths.has(deathKey)) { queuedNpcRewardKeys.delete(deathKey); continue; }
    let complete = true;
    const isSunBoss = death?.type === "npc_Invoke_XVI" || death?.type === "npc_Mindfire_Behemoth";
    const sunType = death?.type === "npc_Mindfire_Behemoth" ? "Mindfire_Sun_Box"
      : death?.type === "npc_Invoke_XVI" ? "Sun_Box" : null;
    // Soleils : annoncés à TOUS les top 10 (présents ou partis) via un
    // message dédié ; le client déduplique (un joueur présent reçoit aussi
    // son npcReward avec sun:true). Une seule annonce par mort.
    if (isSunBoss && item.sunSent !== true) {
      item.sunSent = true;
      try {
        const sunMsg = {
          t: "npcSun", map: String(mapId),
          uid: String(death.uid), seq: Number(death.seq) || 0,
          sunType, x: Math.round(Number(death?.x) || 0), y: Math.round(Number(death?.y) || 0),
        };
        for (const pid of sunTopIds(death)) {
          try { sendToPeer(pid, sunMsg); } catch {}
        }
      } catch {}
    }
    for (const share of npcRewardShares(killerId, mapId, death)) {
      const accountId = share.pid.slice(2);
      const txKey = `npc:${serverRunId}:${deathKey}:${accountId}`;
      const reward = awardNpcKill(accountId, death.type, mapId, share.percent, share.pid === killerId, txKey);
      if (!reward) { complete = false; continue; }
      if (reward.duplicate) continue;
      // Audit anticheat : kill crédité au tueur (strictement serveur).
      if (share.pid === killerId) {
        try {
          const ps = findPeerState(share.pid);
          if (ps) audOf(ps).kills += 1;
        } catch {}
      }
      sendToPeer(share.pid, {
        t: "npcReward", map: String(mapId), uid: String(death.uid), seq: Number(death.seq) || 0,
        killer: killerId, percent: share.percent, ...reward,
        // Soleil personnel (top 10 dégâts, même parti de la map).
        sun: isSunBoss && share.sun === true,
        sunType,
        sunX: isSunBoss ? Math.round(Number(death?.x) || 0) : 0,
        sunY: isSunBoss ? Math.round(Number(death?.y) || 0) : 0,
      });
      // Une part SQLite (~8 ms) peut deja depasser le budget : on sort pour
      // laisser respirer l'event loop, la suite passe au prochain tour.
      if (Date.now() - start >= budgetMs) { complete = false; break; }
    }
    // Une erreur SQLite transitoire sera retentee au tour suivant (en fin de
    // file pour ne pas bloquer les autres). Les parts deja commitees sont
    // protegees par npc_reward_tx et ignorees via duplicate.
    if (complete) {
      queuedNpcRewardKeys.delete(deathKey);
      rewardedNpcDeaths.set(deathKey, now);
    } else pendingNpcRewards.push({ mapId, death, deathKey });
  }
  if (pendingNpcRewards.length > 1500) {
    try { console.log(`[multi:npc] file recompenses saturee (${pendingNpcRewards.length}), delestage des plus anciennes`); } catch {}
    const dropped = pendingNpcRewards.splice(0, pendingNpcRewards.length - 1500);
    for (const item of dropped) queuedNpcRewardKeys.delete(item?.deathKey);
  }
}
setInterval(() => {
  try { pumpNpcRewards(16); } catch {}
}, 80);

// --- Audit anticheat périodique (10 s) + sanction (kick + gel, JAMAIS de
// ban auto : l'admin tranche après inspection). Voir ANTICHEAT.js.
const CHEAT_KICK_MESSAGE = "Vous avez triché. La modération étudie actuellement votre cas. Si cela est avéré, vous serez définitivement banni.";
function punishCheater(pid, evidence, manualReason = null) {
  const id = String(pid || "");
  if (!id) return { ok: false };
  let entry = null;
  for (const [, room] of rooms) {
    const e = room.get(id);
    if (e) { entry = e; break; }
  }
  if (!entry) entry = instancePeers.get(id) || null;
  const pseudo = String(entry?.state?.pseudo || "").slice(0, 20) || id;
  const reason = String(manualReason || "Triche détectée automatiquement — dossier en cours d'examen par la modération.").slice(0, 200);
  try {
    if (entry?.ws && entry.ws.readyState === 1) entry.ws.send(JSON.stringify({ t: "cheatKick", reason: CHEAT_KICK_MESSAGE }));
  } catch {}
  try { removeFromAllRooms(id); } catch {}
  try { peerNoGrace.set(id, Date.now()); } catch {}
  const victimWs = entry?.ws || null;
  setTimeout(() => { try { victimWs && victimWs.close(); } catch {} }, 800);
  // Gel du compte (comptes uniquement) : PAS de ban définitif auto.
  if (id.startsWith("u_")) {
    const at = Date.now();
    const ev = evidence && typeof evidence === "object" ? evidence : {};
    for (const k of banKeysFor(id, pseudo)) {
      bans.set(k, { key: k, pseudo, reason, until: null, at, cheatHold: true, evidence: ev });
    }
    saveBans();
  }
  try { console.log(`[multi:anticheat] sanction ${pseudo} (${id}) : ${reason}`); } catch {}
  return { ok: true, pseudo };
}
function runCheatAudit() {
  const now = Date.now();
  const peers = [];
  for (const [, room] of rooms) {
    for (const [pid, e] of room) { if (e && e.state) peers.push([pid, e.state]); }
  }
  for (const [pid, e] of instancePeers) {
    if (e && e.state) peers.push([pid, e.state]);
  }
  for (const [pid, st] of peers) {
    const a = st._audit;
    if (!a || typeof a !== "object") continue;
    const r = acAuditWindow(a, now, Number(st.teleStrike || 0), isCubikonFouActive() ? { soft: 1000, hard: 1500 } : 1);
    if (!r) continue;
    const rates = r.rates;
    const score = r.score;
    const triggers = [...r.triggers];
    if (!triggers.length) continue;
    a.strikes = Number(a.strikes || 0) + 1;
    a.last = { at: now, triggers: triggers.slice(-6) };
    try { console.log(`[multi:anticheat] audit ${st.pseudo} (${pid}) score ${score} : ${triggers.join(" · ")}`); } catch {}
    if (score >= AC.AUDIT_PUNISH_SCORE) {
      try {
        punishCheater(pid, {
          score, strikes: a.strikes,
          kills10s: Math.round(rates.kills), boxes10s: Math.round(rates.boxes),
          dmg10s: Math.round(rates.dmg), triggers: triggers.slice(-6), at: now,
          security: st._security || null,
        });
      } catch {}
      a.score = 0;
    }
  }
}
setInterval(() => {
  try { runCheatAudit(); } catch {}
}, AC.AUDIT_WIN_MS);

server.on("upgrade", (request, socket, head) => {
  const url = new URL(request.url || "/ws", "http://localhost");
  if (!url.pathname.startsWith("/ws")) {
    socket.destroy();
    return;
  }
  // Un navigateur ne peut ouvrir le WS que depuis la meme origine. Les
  // clients non navigateur sans Origin restent autorises (outils/admin).
  const origin = String(request.headers.origin || "");
  if (origin) {
    let originHost = "";
    try { originHost = new URL(origin).host; } catch {}
    if (!originHost || originHost !== String(request.headers.host || "")) {
      socket.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }
  }
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit("connection", ws, request);
  });
});

wss.on("connection", (ws) => {
  ws.lastHeardAt = Date.now();
  let messageRateAt = ws.lastHeardAt;
  let messageRateCount = 0;
  // Invite par defaut ; le hello authentifie (token compte) et fige
  // l'identite stable `u_<accountId>` (meme id apres refresh/restart).
  let id = `p${nextId++}`;
  let authed = false;
  let accountId = null;
  let mapId = "1-1";
  let state = { id, pseudo: "Pilote", shipId: "", x: 0, y: 0, angle: 0, dead: false, hpPct: 1, shPct: 1, atk: false, tx: 0, ty: 0, updatedAt: Date.now(), connectedAt: Date.now(),
    // PvP : PV autoritaires (init depuis la fiche vaisseau, sinon 1/1).
    hpMax: 1, shMax: 0, hp: 1, sh: 0, range: 800, pvpAt: 0, pvpFrom: null, npcAt: 0, npcFrom: null, pvpWin: 0, pvpWinT: 0 };
  roomFor(mapId).set(id, { ws, state });
  allWs.add(ws);
  ws.send(JSON.stringify({ t: "welcome", id, authed: false, run: serverRunId }));

  const correctState = () => {
    const now = Date.now();
    if (now - Number(state._correctionAt || 0) < 500) return;
    state._correctionAt = now;
    if (ws.readyState === 1) ws.send(JSON.stringify({ t: "stateCorrection", map: mapId, x: state.x, y: state.y }));
  };
  const movementTarget = key => rooms.get(mapId)?.get(String(key))?.state || npcSims.get(mapId)?.entries?.get(String(key)) || null;
  const changeMap = (nextMap, instance = false) => {
    if (nextMap === mapId && instance === (state.instance === true)) return true;
    if (!authed || !accountId) return false;
    const now = Date.now();
    let arrival;
    if (state.instance === true) {
      if (instance || nextMap !== state._instanceReturn?.map) return false;
      arrival = state._instanceReturn;
    } else {
      arrival = mapTransition(serverMaps, state, mapId, nextMap, state._account?.faction, now);
      // Reprise d'une instance sauvegardée : son économie reste locale.
      const savedMap = state._account?.hangars?.find(h => h?.active)?.lastMap;
      if (!arrival && !state._joined && instance && String(savedMap).toLowerCase() === nextMap
        && ["alpha", "beta", "gamma", "delta", "epsilon", "zeta", "kappa", "qz"].includes(nextMap)) arrival = { instance: true };
    }
    if (!arrival || instance !== (arrival.instance === true)) return false;
    if (instance) {
      const home = respawnMap(state._account?.faction, nextMap);
      state._instanceReturn = { map: home, ...baseArrival(serverMaps, home, state._account?.faction) };
    } else {
      state._arrival = { ...arrival, until: now + 15000 };
      state.x = arrival.x;
      state.y = arrival.y;
    }
    state.serverMap = nextMap;
    state.portalCdUntil = now + 5000;
    return true;
  };

  ws.on("message", (raw) => {
    if (authed && accountSockets.get(id) !== ws) return;
    const rateNow = Date.now();
    if (rateNow - messageRateAt >= 1000) {
      messageRateAt = rateNow;
      messageRateCount = 0;
    }
    messageRateCount++;
    if (messageRateCount > 250) {
      try { ws.close(1008, "Message rate exceeded"); } catch {}
      return;
    }
    let msg = null;
    try { msg = JSON.parse(String(raw)); } catch { return; }
    if (!msg || typeof msg !== "object") return;
    ws.lastHeardAt = rateNow;
    // La pause est appliquee aussi par le serveur, meme si le DOM est retire.
    if (state._clockGuard?.blocked && ["pos", "map", "box", "hit", "pvpHit", "pvpPetHit", "skillUse", "shot", "rshot", "pvpLoot", "pvpLootTake"].includes(msg.t)) {
      stopRejectedMotion(state);
      if (msg.t === "pos" || msg.t === "map") correctState();
      return;
    }
    if (msg.t === "boxSyncReq") {
      // Resync explicite (le client a perdu la sync initiale : refresh,
      // purge, paquet perdu). Throttle anti-spam par connexion.
      try {
        if (state.instance === true) return;
        const now = Date.now();
        if (now - Number(state._boxSyncAt || 0) < 2000) return;
        state._boxSyncAt = now;
        sendBoxSync(ws, mapId);
      } catch {}
      return;
    }
    if (msg.t === "box") {
      // Box ambiantes entierement autoritaires : le serveur genere, valide la
      // distance, tranche le premier collecteur et programme le respawn.
      try {
        const room = rooms.get(mapId);
        if (!room || !room.has(id)) return;
        if (msg.op === "collect" && typeof msg.uid === "string") {
          const uid = msg.uid.slice(0, 64);
          const set = boxRooms.get(mapId);
          const box = set?.get(uid) || null;
          const shipDist = box && state._posOk === true ? Math.hypot(Number(state.x) - box.x, Number(state.y) - box.y) : Infinity;
          const petDist = box && state.peta === 1 ? Math.hypot(Number(state.petx ?? state.x) - box.x, Number(state.pety ?? state.y) - box.y) : Infinity;
          const accepted = !!box && Math.min(shipDist, petDist) <= 260 && set.delete(uid);
          if (accepted) {
            try { acRecordCollection(audOf(state), state._combat); } catch {}
            broadcastRoom(room, JSON.stringify({ t: "box", op: "collect", uid }), id);
            const cfg = COLLECTABLE_TYPES[box.type] || {};
            const delayMs = Math.max(250, Math.floor((Number(cfg.respawnDelaySec ?? 60) || 0) * 1000));
            if (!boxRespawns.has(mapId)) boxRespawns.set(mapId, []);
            boxRespawns.get(mapId).push({ uid, type: box.type, at: Date.now() + delayMs });
          }
          // Le demandeur ne touche la recompense qu'apres cette confirmation.
          try { ws.send(JSON.stringify({ t: "box", op: "claim", uid, ok: accepted, box: !accepted && box ? { uid, type: box.type, x: box.x, y: box.y } : undefined })); } catch {}
          return;
        }
      } catch {}
      return;
    }
    // Demande d'ami envoyée (HTTP) : notification live au destinataire
    // connecté. Vérifiée en base (anti-usurpation : la demande doit exister).
    if (msg.t === "friendPing") {
      try {
        if (!authed || !accountId) return;
        const now = Date.now();
        if (now - Number(friendPingLast.get(id) || 0) < 1000) return;
        friendPingLast.set(id, now);
        const target = String(msg.to || "").trim().slice(0, 20);
        if (!target) return;
        const who = findUserByPseudo(target);
        if (!who || !hasFriendRequest(accountId, who.id)) return;
        const peer = findPeerByPseudo(who.pseudo);
        if (peer) sendToPeer(peer.id, { t: "friendRequest", from: id, fromPseudo: String(state.pseudo || "Pilote").slice(0, 20), at: now });
        try { if (ws.readyState === 1) ws.send(JSON.stringify({ t: "friendPingAck", to: who.pseudo })); } catch {}
      } catch {}
      return;
    }
    // Réponse à une demande (HTTP accept/decline) : l'autre rafraîchit.
    if (msg.t === "friendResponded") {
      try {
        if (!authed || !accountId) return;
        const target = String(msg.to || "").trim().slice(0, 20);
        if (!target) return;
        const peer = findPeerByPseudo(target);
        if (peer) sendToPeer(peer.id, { t: "friendsChanged" });
      } catch {}
      return;
    }
    // Clan : tchat réservé aux membres (rooms + instances, comme le
    // tchat global). 1 message / 500 ms, 200 caractères.
    if (msg.t === "clanChat") {
      try {
        if (!authed || !accountId) return;
        const now = Date.now();
        if (now - Number(clanChatLast.get(id) || 0) < 500) return;
        const text = String(msg.text || "").replace(/\s+/g, " ").trim().slice(0, 200);
        if (!text) return;
        const tag = refreshClanTag(state, accountId);
        if (!tag) return;
        clanChatLast.set(id, now);
        broadcastToClan(tag, { t: "clanMsg", from: id, fromPseudo: String(state.pseudo || "Pilote").slice(0, 20), tag, text, at: now });
      } catch {}
      return;
    }
    // Clan : après une mutation HTTP (invite, accept, kick, leave, rang),
    // le client prévient les membres connectés (rechargent via /api).
    if (msg.t === "clanNotify") {
      try {
        if (!authed || !accountId) return;
        const now = Date.now();
        if (now - Number(clanChatLast.get(`${id}:notify`) || 0) < 500) return;
        clanChatLast.set(`${id}:notify`, now);
        const tag = refreshClanTag(state, accountId);
        try {
          if (ws.readyState === 1) ws.send(JSON.stringify({ t: "clanTag", tag: String(tag || "") }));
        } catch {}
        if (tag) broadcastToClan(tag, { t: "clanChanged", tag }, id);
        const target = String(msg.to || "").trim().slice(0, 20);
        if (target) {
          const peer = findPeerByPseudo(target);
          if (peer && String(peer.id) !== String(id)) sendToPeer(peer.id, { t: "clanChanged", tag: String(tag || "") });
        }
      } catch {}
      return;
    }
    // Clan : resync du tag en mémoire (après accept/kick/leave).
    if (msg.t === "clanRefresh") {
      try {
        if (!authed || !accountId) return;
        const tag = refreshClanTag(state, accountId);
        try {
          if (ws.readyState === 1) ws.send(JSON.stringify({ t: "clanTag", tag: String(tag || "") }));
        } catch {}
      } catch {}
      return;
    }
    // Diplomatie : après une mutation HTTP, prévient les deux clans
    // (rechargent relations + roster via /api) + annonce système.
    if (msg.t === "diploNotify") {
      try {
        if (!authed || !accountId) return;
        const now = Date.now();
        if (now - Number(clanChatLast.get(`${id}:diplo`) || 0) < 500) return;
        clanChatLast.set(`${id}:diplo`, now);
        const tag = refreshClanTag(state, accountId);
        try {
          if (ws.readyState === 1) ws.send(JSON.stringify({ t: "clanTag", tag: String(tag || "") }));
        } catch {}
        const other = String(msg.tag || "").toUpperCase().slice(0, 5);
        const text = String(msg.text || "").replace(/\s+/g, " ").trim().slice(0, 200);
        if (tag) {
          broadcastToClan(tag, { t: "clanChanged", tag });
          if (text) broadcastToClan(tag, { t: "clanMsg", from: "", fromPseudo: "[Diplomatie]", tag, text, at: now });
        }
        if (other && other !== String(tag || "").toUpperCase()) {
          broadcastToClan(other, { t: "clanChanged", tag: other });
          if (text) broadcastToClan(other, { t: "clanMsg", from: "", fromPseudo: "[Diplomatie]", tag: other, text, at: now });
        }
      } catch {}
      return;
    }
    // Groupes + murmures : messages dirigés cross-map (rooms + instances).
    if (msg.t === "groupCreate" || msg.t === "groupInvite" || msg.t === "groupAccept" || msg.t === "groupDecline"
      || msg.t === "groupLeave" || msg.t === "groupKick" || msg.t === "groupChat" || msg.t === "groupSync"
      || msg.t === "groupInviteLock" || msg.t === "groupRally" || msg.t === "whisper") {
      try {
        handleSocialMessage({
          id, state, authed,
          send: (obj) => { try { if (ws.readyState === 1) ws.send(JSON.stringify(obj)); } catch {} },
          sendTo: (pid, obj) => sendToPeer(pid, obj),
          findByPseudo: (pseudo) => findPeerByPseudo(pseudo),
          describe: (pid) => describePeer(pid),
        }, msg);
      } catch {}
      return;
    }
    if (msg.t === "hit") {
      // Degats sur NPC partage : le serveur tranche (HP, mort, killer).
      try {
        if (!authed || !accountId) return;
        const shooter = rooms.get(mapId)?.get(id)?.state;
        if (!shooter || shooter.pvpDead === true || !(Number(shooter.hp) > 0)) return;
        const now = Date.now();
        const profile = refreshCombatProfile(shooter, accountId, mapId);
        msg = validateCombatHit(profile, msg, shooter, now);
        if (!msg) {
          acStrike(shooter, "hitStrike");
          acRecordViolation(shooter, "profile", now, { reason: "Impact NPC hors du profil autorise", unverified: true });
          return;
        }
        // Anti-rafale : seaux par attaquant (horloge serveur). Rafales AoE
        // légitimes OK, spam Cheat Engine étouffé (mitigation + log).
        // Dégâts nuls (spam de freeze/ralentissement) : coût x5.
        const hitDmg = Math.max(0, Number(msg.dmg) || 0) * profile.critMult * 1.05 * 1.25;
        const hitCost = hitDmg > 0 ? 1 : 5;
        if (!acBucket(shooter, "HitN", now, AC_HIT_CAP, AC_HIT_REFILL, hitCost)
          || !acBucket(shooter, "HitD", now, AC_DMG_CAP, AC_DMG_REFILL, hitDmg)) {
          acRecordViolation(shooter, "combat", now, { reason: "Rafale d'impacts NPC depassant le budget" });
          if (acStrike(shooter, "hitStrike")) {
            try { console.log(`[multi:anticheat] rafale degats ${shooter.pseudo} (${mapId})`); } catch {}
          }
          return;
        }
        const sim = npcSims.get(mapId);
        if (sim && typeof sim.applyHit === "function") {
          const appliedHit = Number(sim.applyHit(id, msg)) || 0;
          if (appliedHit > 0) { try { audOf(shooter).dmg += appliedHit; } catch {} }
          // Diagnostic multi (console serveur) : hits recus par map.
          hitStats.count++;
          hitStats.byMap.set(mapId, (hitStats.byMap.get(mapId) || 0) + 1);
        }
      } catch {}
      return;
    }
    if (msg.t === "clockReport") {
      // Declaration du client : pause reversible, aucun score ni gel de compte.
      const now = Date.now();
      if (!authed || !accountId || !acBucket(state, "ClockReport", now, 1, 0.25, 1)) return;
      const requested = Number(msg.requestedSeconds), elapsed = Number(msg.serverSeconds);
      const guard = updateClockGuard(state, requested, elapsed, now);
      if (!guard) return;
      if (requested > elapsed * 3) {
        acRecordViolation(state, "clock", now, { reason: "Horloge acceleree signalee par le client",
          scale: Math.min(1000, requested / elapsed), declared: true });
      }
      if (guard.blocked) stopRejectedMotion(state);
      try { ws.send(JSON.stringify({ t: "speedGuard", ...guard })); } catch {}
      return;
    }
    if (msg.t === "skillUse") {
      try {
        if (!authed || !accountId || state.instance === true) return;
        const room = rooms.get(mapId);
        if (!room || !room.has(id)) return;
        const skill = String(msg.skill || "").toLowerCase();
        if (skill.startsWith("ability_")) {
          const profile = refreshCombatProfile(state, accountId, mapId);
          if (skill === "ability_mimesis_phase-out") {
            const now = Date.now();
            const arrival = usePhaseOut(state, profile, mapId, serverMaps.get(mapId)?.world, now);
            if (arrival) {
              Object.assign(state, arrival, { vx: 0, vy: 0, moving: false, motionBlocked: false, teleportSeq: (state.teleportSeq || 0) + 1, moveBuck: 0, moveBuckT: now, _arrival: null });
              ws.send(JSON.stringify({ t: "stateCorrection", map: mapId, ...arrival }));
            }
            return;
          }
          if (useMovementAbility(state, profile, skill, msg.enabled !== false, Date.now(), movementTarget(msg.target), String(msg.target || ""))) {
            state.moveSpeed = movementSpeed(state, profile, Date.now());
          }
          return;
        }
        if (skill !== "iem" && skill !== "ish" && skill !== "smb") return;
        const now = Date.now();
        const cdKey = skill === "iem" ? "iemCdUntil" : skill === "ish" ? "ishCdUntil" : "smbCdUntil";
        if (now < Number(state[cdKey] || 0)) return;
        state[cdKey] = now + 10_000;
        const until = now + 3_000;
        if (skill === "iem") {
          takeMovement(state, refreshCombatProfile(state, accountId, mapId), state.x, state.y, now);
          state.iemUntil = until;
          // L'IEM dissipe les ralentissements et gels déjà actifs. Ces champs
          // sont autoritaires : leur remise à zéro empêche un ancien effet de
          // revenir dans le snapshot suivant.
          state.slowPct = 0;
          state.slowUntil = 0;
          state.freezeUntil = 0;
          const sim = npcSims.get(mapId);
          if (sim && typeof sim.breakPlayerLocks === "function") sim.breakPlayerLocks(id, until);
        } else if (skill === "ish") {
          state.ishUntil = until;
        }
        // smb : pas d'invincibilité (pas de ishUntil -> pas de bulle ISH
        // affichée sur le lanceur par les autres clients). Le skillFx part
        // quand même (explosion + son visibles par la room).
        broadcastRoom(room, JSON.stringify({ t: "skillFx", skill, by: id, at: now, until }));
      } catch {}
      return;
    }
    if (msg.t === "pvpHit") {
      // PvP : degats d'un joueur sur un autre, tranches ici.
      try {
        if (!authed || !accountId) return;
        const room = rooms.get(mapId);
        if (!room || !room.has(id)) return;
        const foe = room.get(String(msg.target));
        const me = room.get(id);
        if (!foe || !me) return;
        if (foe === me || me.state.pvpDead === true || !(me.state.hp > 0)) return;
        const profile = refreshCombatProfile(me.state, accountId, mapId);
        msg = validateCombatHit(profile, msg, me.state);
        if (!msg) {
          acStrike(me.state, "pvpStrike");
          acRecordViolation(me.state, "profile", Date.now(), { reason: "Impact PvP hors du profil autorise", unverified: true });
          return;
        }
        const now = Date.now();
        // Anti-rafale PvP : mêmes seaux (plus stricts : TTK faibles).
        const pvpDmg = Math.max(0, Number(msg.dmg) || 0);
        const pvpCost = pvpDmg > 0 ? 1 : 5;
        if (!acBucket(me.state, "PvpN", now, AC_PVP_HIT_CAP, AC_PVP_HIT_REFILL, pvpCost)
          || !acBucket(me.state, "PvpD", now, AC_PVP_DMG_CAP, AC_PVP_DMG_REFILL, pvpDmg)) {
          acRecordViolation(me.state, "combat", now, { reason: "Rafale d'impacts PvP depassant le budget" });
          if (acStrike(me.state, "pvpStrike")) {
            try { console.log(`[multi:anticheat] rafale pvp ${me.state.pseudo} (${mapId})`); } catch {}
          }
          return;
        }
        const dmg = Number(msg.dmg);
        const hasStatus = (Number(msg.slowPct) > 0 && Number(msg.slowSec) > 0) || Number(msg.freezeSec) > 0;
        if (!Number.isFinite(dmg) || dmg < 0 || dmg > 1e7 || (dmg === 0 && !hasStatus)) return;
        if (foe.state.dead) return;
        if (now < Number(foe.state.ishUntil || 0)) return;
        if (now < Number(foe.state.iemUntil || 0)) return;
        // Deja tue (pos de mort pas encore arrivee) : pas de double kill.
        if (foe.state.pvpDead === true) return;
        const wasAlive = Number(foe.state.hp) > 0;
        // Revive rate (reparation entre le pos et le tir) : rebase d'abord,
        // plafonné au budget de remontée (sinon vie figée pleine = dieu).
        if (!wasAlive) return;
        // Anti-teleport : projectile credible depuis la position de l'attaquant.
        const reach = (Number(me.state.range) || 800) + 800;
        const dx = Number(foe.state.x) - Number(me.state.x);
        const dy = Number(foe.state.y) - Number(me.state.y);
        if (dx * dx + dy * dy > reach * reach) return;
        const pen = Math.max(0, Math.min(1, Number(msg.pen ?? 0)));
        let applied = 0;
        if (msg.kind === "sab") {
          const drained = Math.min(Math.max(0, Number(foe.state.sh) || 0), dmg);
          foe.state.sh = Math.max(0, Number(foe.state.sh) - drained);
          applied = drained;
        } else {
          if (Math.random() < Math.max(0, Math.min(0.9, Number(foe.state.evade) || 0))) return;
          const res = damagePlayerLayers(foe.state, dmg, Math.max(0, Math.min(1, Number(foe.state.absorb) || 0.8)), pen, 0);
          applied = Number(res?.total) || 0;
          foe.state.hp = Math.max(0, Number(foe.state.hp) || 0);
          foe.state.sh = Math.max(0, Number(foe.state.sh) || 0);
        }
        foe.state.pvpAt = now;
        // Blackout remontées : un soin (pos) qui arrive juste après ce coup
        // ne doit pas l'effacer avant que la victime l'ait adopté (sinon
        // le tireur voit des chiffres mais la barre ne bouge pas).
        if (Number(msg.dmg) > 0) foe.state.dmgBlockUntil = now + 500;
        const slowPct = Math.max(0, Math.min(95, Number(msg.slowPct) || 0));
        const slowSec = Math.max(0, Math.min(30, Number(msg.slowSec) || 0));
        const freezeSec = Math.max(0, Math.min(5, Number(msg.freezeSec) || 0));
        if (slowPct > 0 && slowSec > 0) {
          takeMovement(foe.state, foe.state._combat, foe.state.x, foe.state.y, now);
          foe.state.slowPct = Math.max(Number(foe.state.slowPct) || 0, slowPct);
          foe.state.slowUntil = Math.max(Number(foe.state.slowUntil) || 0, now + slowSec * 1000);
        }
        if (freezeSec > 0) {
          takeMovement(foe.state, foe.state._combat, foe.state.x, foe.state.y, now);
          foe.state.moveBuck = 0;
          foe.state.freezeUntil = Math.max(Number(foe.state.freezeUntil) || 0, now + freezeSec * 1000);
        }
        // Feed degats : la victime voit les chiffres (comme les NPC).
        if (applied > 0) {
          try { audOf(me.state).dmg += applied; } catch {}
          const fkey = `${foe.state.id}|${id}`;
          let feed = pvpFeeds.get(mapId);
          if (!feed) { feed = new Map(); pvpFeeds.set(mapId, feed); }
          const prev = feed.get(fkey);
          feed.set(fkey, { uid: String(foe.state.id), by: String(id), total: Math.round((prev?.total || 0) + applied) });
        }
        // Dernier attaquant : affichage de l'anneau de degats (Ship_damage)
        // sur les autres ecrans (victime + observateurs).
        foe.state.pvpFrom = id;
        // Kill PvP : la cible passe sous 0 PV sur ce coup (etait en vie).
        try {
          if (Number(foe.state.hp) <= 0 && wasAlive !== false) {
            foe.state.pvpDead = true;
            const total = Math.max(1, Number(foe.state.hpMax) || 1) + Math.max(0, Number(foe.state.shMax) || 0);
            // Anti-farm meme victime : 100 % / 50 % / 25 % / 0 sur 60 min.
            const fkey = `${id}|${foe.state.id}`;
            let farm = pvpFarm.get(fkey);
            if (!farm || now - Number(farm.t0 || 0) > 3600_000) farm = { n: 0, t0: now };
            farm.n++;
            pvpFarm.set(fkey, farm);
            const mult = farm.n <= 1 ? 1 : farm.n === 2 ? 0.5 : farm.n === 3 ? 0.25 : 0;
            const exp = Math.round(total / 50 * mult);
            const honneur = Math.round(total / 500 * mult);
            // Stats persistantes du tueur (classement), si compte authentifie.
            try {
              if (String(id).startsWith("u_")) recordPvpKill(String(id).slice(2), exp, honneur, foe.state.shipId);
            } catch {}
            // Guerres de clans : +1 au score si les deux clans sont en guerre.
            try {
              const victimPid = String(foe.state.id || "");
              if (String(id).startsWith("u_") && victimPid.startsWith("u_")) {
                recordClanWarKill(String(id).slice(2), victimPid.slice(2));
              }
            } catch {}
            // Gains au tueur connecte (xp/honneur appliques par son client).
            try {
              const killer = room.get(id);
              if (killer && killer.ws && killer.ws.readyState === 1) {
                killer.ws.send(JSON.stringify({ t: "pvpKill", exp, honneur, mult, victim: String(foe.state.pseudo || "Pilote").slice(0, 20) }));
              }
            } catch {}
          }
        } catch {}
      } catch {}
      return;
    }
    if (msg.t === "pvpLoot" || msg.t === "pvpLootTake") {
      // Cargo du vaincu : la victime annonce, les autres affichent ;
      // le ramassage du tueur efface les copies (uid partage).
      try {
        if (!authed || !accountId) return;
        const room = rooms.get(mapId);
        if (!room || !room.has(id)) return;
        if (typeof msg.uid !== "string" || !msg.uid.startsWith("pvploot_")) return;
        if (msg.t === "pvpLootTake") {
          broadcastRoom(room, JSON.stringify({ t: "pvpLootTake", uid: msg.uid.slice(0, 64) }), id);
          return;
        }
        const x = Math.round(Number(msg.x)), y = Math.round(Number(msg.y));
        if (!Number.isFinite(x) || !Number.isFinite(y)) return;
        if (typeof msg.onlyBy !== "string" || !msg.onlyBy) return;
        broadcastRoom(room, JSON.stringify({ t: "pvpLoot", uid: msg.uid.slice(0, 64), x, y, onlyBy: String(msg.onlyBy).slice(0, 64) }), id);
      } catch {}
      return;
    }
    if (msg.t === "pvpPetHit") {
      // Degats PvP sur le PET : pool dedie, meme arbitrage que les vaisseaux.
      // Pas de recompenses, pas d'anti-farm : juste destruction + toast.
      try {
        if (!authed || !accountId) return;
        const room = rooms.get(mapId);
        if (!room || !room.has(id)) return;
        const foe = room.get(String(msg.target));
        const me = room.get(id);
        if (!foe || !me) return;
        if (foe === me || me.state.pvpDead === true || !(me.state.hp > 0)) return;
        const profile = refreshCombatProfile(me.state, accountId, mapId);
        msg = validateCombatHit(profile, msg, me.state);
        if (!msg) {
          acStrike(me.state, "pvpStrike");
          acRecordViolation(me.state, "profile", Date.now(), { reason: "Impact PET hors du profil autorise", unverified: true });
          return;
        }
        if (foe.state.peta !== 1) return;
        const now = Date.now();
        // Le PET beneficie de la zone de non-agression de son proprietaire.
        if (foe.state.serverSafe === true || me.state.serverSafe === true) return;
        const pvpPetDmg = Math.max(0, Number(msg.dmg) || 0);
        const pvpPetCost = pvpPetDmg > 0 ? 1 : 5;
        if (!acBucket(me.state, "PvpN", now, AC_PVP_HIT_CAP, AC_PVP_HIT_REFILL, pvpPetCost)
          || !acBucket(me.state, "PvpD", now, AC_PVP_DMG_CAP, AC_PVP_DMG_REFILL, pvpPetDmg)) {
          acRecordViolation(me.state, "combat", now, { reason: "Rafale d'impacts PET depassant le budget" });
          return;
        }
        const dmg = Number(msg.dmg);
        if (!Number.isFinite(dmg) || dmg <= 0 || dmg > 1e7) return;
        if (foe.state.petDead === true) return;
        const wasPetAlive = Number(foe.state.petPoolHp) > 0;
        if (!wasPetAlive) return;
        const reach = (Number(me.state.range) || 800) + 800;
        const dx = Number(foe.state.petx ?? foe.state.x) - Number(me.state.x);
        const dy = Number(foe.state.pety ?? foe.state.y) - Number(me.state.y);
        if (dx * dx + dy * dy > reach * reach) return;
        const pen = Math.max(0, Math.min(1, Number(msg.pen ?? 0)));
        const pool = { hp: Number(foe.state.petPoolHp) || 0, sh: Number(foe.state.petPoolSh) || 0 };
        let applied = 0;
        if (msg.kind === "sab") {
          const drained = Math.min(Math.max(0, pool.sh), dmg);
          pool.sh = Math.max(0, pool.sh - drained);
          applied = drained;
        } else {
          const res = damagePlayerLayers(pool, dmg, 0.8, pen, 0);
          applied = Number(res?.total) || 0;
        }
        foe.state.petPoolHp = Math.max(0, Number(pool.hp) || 0);
        foe.state.petPoolSh = Math.max(0, Number(pool.sh) || 0);
        // Revision strictement croissante : plusieurs impacts d'une meme
        // salve peuvent tomber dans la meme milliseconde. Avec Date.now()
        // seul, le proprietaire pouvait ignorer le dernier impact (celui a 0).
        foe.state.petPvpAt = Math.max(now, Number(foe.state.petPvpAt || 0) + 1);
        foe.state._petHpRegenBudget = 0;
        foe.state._petShRegenBudget = 0;
        foe.state._petRegenAt = now;
        if (applied > 0) {
          try { audOf(me.state).dmg += applied; } catch {}
          const fkey = `${foe.state.id}|pet|${id}`;
          let feed = pvpFeeds.get(mapId);
          if (!feed) { feed = new Map(); pvpFeeds.set(mapId, feed); }
          const prev = feed.get(fkey);
          feed.set(fkey, { uid: `pet:${String(foe.state.id)}`, by: String(id), total: Math.round((prev?.total || 0) + applied) });
        }
        if (Number(foe.state.petPoolHp) <= 0 && wasPetAlive !== false) {
          foe.state.petDead = true;
          try {
            if (String(id).startsWith("u_")) recordPvpPetKill(String(id).slice(2));
          } catch {}
          try {
            const killer = room.get(id);
            if (killer && killer.ws && killer.ws.readyState === 1) {
              killer.ws.send(JSON.stringify({ t: "pvpPetKill", victim: String(foe.state.pseudo || "Pilote").slice(0, 20), pet: String(foe.state.petn || "REX").slice(0, 32) }));
            }
          } catch {}
        }
      } catch {}
      return;
    }
    if (msg.t === "shot" || msg.t === "rshot") {      // Tirs allies : retransmis tels quels a la room (aucun etat).
      if (state.instance === true) return; // gate : tirs 100 % locaux.
      try {
        const room = rooms.get(mapId);
        if (!room || !room.has(id)) return;
        const out = { t: msg.t, by: id, map: mapId };
        if (msg.t === "rshot" && authed) {
          const profile = refreshCombatProfile(state, accountId, mapId);
          const key = String(msg.key || "");
          if (profile?.rocketIds.includes(key)) {
            state._launchedRocketIds ||= {};
            state._launchedRocketIds[key] = Date.now() + 20000;
          }
        }
        if (typeof msg.key === "string") out.key = String(msg.key).slice(0, 16);
        if (typeof msg.kind === "string") out.kind = String(msg.kind).slice(0, 16);
        if (typeof msg.petTarget === "string") out.petTarget = String(msg.petTarget).slice(0, 64);
        if (msg.petSource === true) out.petSource = true;
        for (const k of ["x", "y", "ang", "tx", "ty", "spd", "arcScale", "arcBoost", "prange"]) {
          if (Number.isFinite(Number(msg[k]))) out[k] = Number(msg[k]);
        }
        if (Number.isFinite(Number(msg.n))) out.n = Math.max(1, Math.min(4, Math.round(Number(msg.n))));
        if (Number.isFinite(Number(msg.arcDir))) out.arcDir = Number(msg.arcDir) < 0 ? -1 : 1;
        if (msg.sab === true) out.sab = true;
        // MISS + volley : retransmis pour l'affichage MISS sur les autres ecrans.
        if (msg.miss === true) out.miss = true;
        if (Number.isFinite(Number(msg.v))) out.v = Math.max(0, Math.floor(Number(msg.v)));
        broadcastRoom(room, JSON.stringify(out), id);
      } catch {}
      return;
    }
    if (msg.t === "hello" || msg.t === "map") {
      // Authentification (hello) : token compte -> identite stable.
      // Le pseudo du compte fait foi (anti-usurpation), l'id devient
      // `u_<accountId>` (stable entre refresh). Sans token : invite.
      if (msg.t === "hello" && !authed && typeof msg.token === "string" && msg.token) {
        try {
          const who = verifyWsToken(msg.token);
          if (who && who.id) {
            const stableId = `u_${String(who.id).slice(0, 64)}`;
            const previousState = securityStates.get(stableId) || findPeerState(stableId);
            // Reconnexion et refresh reprennent les effets encore actifs.
            // Conserver leurs echeances serveur : aucun relaunch ni temps ajoute.
            const previousSocket = accountSockets.get(stableId);
            accountSockets.set(stableId, ws);
            if (previousSocket && previousSocket !== ws) { try { previousSocket.close(4001, "Session replaced"); } catch {} }
            // Refresh : rattachement silencieux (pas de leave/join).
            if (cancelPeerGrace(stableId)) dropStaleEntry(stableId);
            const room = rooms.get(mapId);
            if (room) {
              if (room.has(id) && room.get(id)?.ws === ws) room.delete(id);
              const prev = room.get(stableId);
              if (prev && prev.ws !== ws) { try { prev.ws.close(4001, "Session replaced"); } catch {} }
              room.delete(stableId);
              if (previousState) state = previousState;
              state.id = stableId;
              id = stableId;
              room.set(id, { ws, state });
            } else {
              state.id = stableId;
              id = stableId;
            }
            accountId = String(who.id);
            authed = true;
            if (previousState) {
              mapId = String(state.serverMap || mapId);
            } else {
              state._account = getAccountGameplayData(accountId);
              state._accountAt = Date.now();
              const saved = state._account?.hangars.find(h => h?.active) || state._account?.hangars[0];
              mapId = serverMaps.has(String(saved?.lastMap).toLowerCase()) ? String(saved.lastMap).toLowerCase()
                : getFactionHomeMap(state._account?.faction);
            }
            const profile = refreshCombatProfile(state, accountId, mapId);
            if (!profile) { ws.close(1008, "Invalid combat profile"); return; }
            if (!previousState) {
              const saved = state._account.hangars.find(h => h?.active) || state._account.hangars[0];
              const base = baseArrival(serverMaps, mapId, state._account.faction);
              const position = saved.lastPos;
              state.x = Number.isFinite(Number(position?.x)) ? Number(position.x) : base.x;
              state.y = Number.isFinite(Number(position?.y)) ? Number(position.y) : base.y;
              state.hp = state.hpMax * Math.max(0, Math.min(1, Number(saved.lastHpPct ?? 1)));
              state.sh = state.shMax * Math.max(0, Math.min(1, Number(saved.lastShPct ?? 1)));
              state.pvpDead = !(state.hp > 0);
              state._posOk = true;
            }
            state.serverMap = mapId;
            removeFromAllRooms(id);
            if (state.instance === true) instancePeers.set(id, { ws, state, mapId });
            else roomFor(mapId).set(id, { ws, state });
            securityStates.set(id, state);
            audOf(state);
            state.pseudo = String(who.pseudo || "Pilote").slice(0, 20);
            refreshClanTag(state, accountId);
            try { ws.send(JSON.stringify({ t: "welcome", id, authed: true, run: serverRunId, at: Date.now(), clockBlocked: state._clockGuard?.blocked === true })); } catch {}
          }
        } catch {}
      }
      // Banni : rejet avec motif + date, sans rejoindre (ni room ni gate).
      try {
        const claimed = (!authed && typeof msg.pseudo === "string" && String(msg.pseudo).trim())
          ? String(msg.pseudo).slice(0, 20)
          : String(state.pseudo || "Pilote").slice(0, 20);
        const ban = getActiveBan(id, claimed);
        if (ban) {
          try {
            if (ws.readyState === 1) {
              // Gel anticheat en attente de modération : message dédié
              // (pas de date, pas de "banni" définitif).
              if (ban.cheatHold === true) {
                ws.send(JSON.stringify({ t: "cheatHold", reason: CHEAT_KICK_MESSAGE }));
              } else {
                ws.send(JSON.stringify({
                  t: "banned",
                  reason: String(ban.reason || "Comportement inapproprié.").slice(0, 200),
                  until: ban.until != null ? Number(ban.until) : null,
                }));
              }
            }
          } catch {}          removeFromAllRooms(id);
          const bannedWs = ws;
          setTimeout(() => { try { bannedWs.close(); } catch {} }, 800);
          return;
        }
      } catch {}
      if (state._clockGuard?.blocked) { stopRejectedMotion(state); correctState(); return; }
      const nextMap = String(msg.map || mapId || "1-1").toLowerCase();
      // Star jump (Carte Stellaire) : arrivée validée côté serveur, sans portail.
      // Le client attend {t:"starJump"} avec les coordonnées d'arrivée AVANT
      // de changer de map ; son {t:"map"} suivant est alors un no-op.
      if (msg.starJump === true && msg.instance !== true) {
        handleStarJumpRequest(ws, { id, state }, mapId, nextMap, (obj) => {
          mapId = obj.mapId;
        });
        return;
      }
      if (!changeMap(nextMap, msg.instance === true)) { correctState(); return; }
      state._joined = true;
      const socialCtx = () => ({
        id, state, authed,
        send: (obj) => { try { if (ws.readyState === 1) ws.send(JSON.stringify(obj)); } catch {} },
        sendTo: (pid, obj) => sendToPeer(pid, obj),
        findByPseudo: (pseudo) => findPeerByPseudo(pseudo),
        describe: (pid) => describePeer(pid),
      });
      // Instance perso (Galaxy Gates) : hors room (invisible, pas de NPC
      // partagés, pas de PvP) mais socket gardé pour les canaux globaux
      // (tchat, enchères). Gameplay 100 % local comme avant.
      if (msg.instance === true) {
        removeFromAllRooms(id);
        mapId = nextMap;
        state.instance = true;
        state.updatedAt = Date.now();
        instancePeers.set(id, { ws, state, mapId });
        try {
          ws.send(JSON.stringify({ t: "chatHistory", list: chatHistory.slice(-30) }));
        } catch {}
        try {
          ws.send(JSON.stringify(getAuctionSync()));
        } catch {}
        // Groupe + amis : état perso renvoyé (membres voient la map gate).
        try {
          ws.send(JSON.stringify({ t: "groupUpdate", group: socialDescribeGroup(id, socialCtx()) }));
        } catch {}
        if (authed && accountId) {
          sendFriendsSync(ws, accountId);
          try { notifyFriendPresence(accountId, true); } catch {}
        }
        try { socialPeerChanged(id, socialCtx()); } catch {}
        return;
      }
      state.instance = false;
      instancePeers.delete(id);
      if (nextMap !== mapId) {
        removeFromAllRooms(id);
        mapId = nextMap;
        roomFor(mapId).set(id, { ws, state });
        ensureNpcSim(mapId);
      } else {
        ensureNpcSim(mapId);
      }
      // Authentifie : pseudo du compte uniquement (declare ignore).
      if (!authed && typeof msg.pseudo === "string" && msg.pseudo.trim()) state.pseudo = String(msg.pseudo).slice(0, 20);
      if (!authed && typeof msg.shipId === "string" && msg.shipId) state.shipId = String(msg.shipId).slice(0, 64);
      state.updatedAt = Date.now();
      // Etat des box pour le nouveau venu.
      sendBoxSync(ws, mapId);
      // Historique du chat global pour le nouveau venu.
      try {
        ws.send(JSON.stringify({ t: "chatHistory", list: chatHistory.slice(-30) }));
      } catch {}
      // Enchères partagées : état complet du cycle pour le nouveau venu.
      try {
        ws.send(JSON.stringify(getAuctionSync()));
      } catch {}
      // Groupe : resync après (re)connexion ou changement de map.
      try {
        ws.send(JSON.stringify({ t: "groupUpdate", group: socialDescribeGroup(id, socialCtx()) }));
      } catch {}
      // Raid Low : état courant pour le nouvel arrivant (vague en cours, etc.).
      if (nextMap === "low") {
        try { ws.send(JSON.stringify(getLowRaidState())); } catch {}
      }
      if (authed && accountId) {
        sendFriendsSync(ws, accountId);
        try { notifyFriendPresence(accountId, true); } catch {}
      }
      try { socialPeerChanged(id, socialCtx()); } catch {}
      return;
    }
    if (msg.t === "ping") {
      // Heartbeat client (3 s) : preuve de vie, reprise après coupure.
      // lastHeardAt maintient la liaison ; updatedAt reste la date de position.
      // Le pong porte la version serveur : le client recharge tout seul
      // quand le jeu a été mis à jour (git pull + restart).
      try {
        ws.send(JSON.stringify({ t: "pong", t0: Math.max(0, Number(msg.t0) || 0), v: String(GAME_VERSION || ""), at: Date.now() }));
      } catch {}
      if (authed && accountId && Date.now() - Number(state._friendsSyncAt || 0) >= 15_000) {
        state._friendsSyncAt = Date.now();
        sendFriendsSync(ws, accountId);
        try {
          const tag = refreshClanTag(state, accountId);
          if (ws.readyState === 1) ws.send(JSON.stringify({ t: "clanTag", tag: String(tag || "") }));
        } catch {}
      }
      return;
    }
    if (msg.t === "chat") {
      // Chat global : 1 message / 800 ms, 200 caracteres, pseudo du pos.
      // Mute admin : ignore silencieux.
      try {
        if (chatMutes.has(id)) return;
        const now = Date.now();
        if (now - Number(chatLastById.get(id) || 0) < 800) return;
        const text = String(msg.text || "").replace(/\s+/g, " ").trim().slice(0, 200);
        if (!text) return;
        chatLastById.set(id, now);
        const entry = { from: String(state.pseudo || "Pilote").slice(0, 20), text, at: now, by: id };
        chatHistory.push(entry);
        if (chatHistory.length > 40) chatHistory.splice(0, chatHistory.length - 40);
        broadcastAll(JSON.stringify({ t: "chatMsg", ...entry }));
      } catch {}
      return;
    }
    if (msg.t === "auctionBid") {
      // Enchère partagée : compte authentifié uniquement, montant mini,
      // gagnant diffusé à tous (comme les messages du tchat).
      try {
        const res = handleAuctionBid(
          { key: msg.key, amount: msg.amount },
          { id, pseudo: state.pseudo, authed },
        );
        if (res.status === "ok") {
          broadcastAll(JSON.stringify(res.update));
        } else {
          try {
            ws.send(JSON.stringify({
              t: "auctionBidReject",
              key: String(msg.key || "").slice(0, 64),
              amount: Math.max(0, Math.floor(Number(msg.amount) || 0)),
              reason: String(res.reason || "Mise refusée."),
              lot: res.lot || null,
            }));
          } catch {}
        }
      } catch {}
      return;
    }
    if (msg.t === 'hangarArrival') {
      handleHangarArrivalRequest(ws, { id, state }, authed ? accountId : null, mapId,
        String(msg.hangarId || '').slice(0, 64), next => { mapId = next; });
      return;
    }
    if (msg.t === "pos") {
      // Instance perso : aucune présence partagée (le client ne devrait
      // déjà plus envoyer de pos en gate).
      if (state.instance === true) return;
      if (!authed || !accountId) return;
      const requestedMap = String(msg.map || mapId).toLowerCase();
      if (requestedMap !== mapId) {
        if (!changeMap(requestedMap)) { correctState(); return; }
        removeFromAllRooms(id);
        mapId = requestedMap;
        roomFor(mapId).set(id, { ws, state });
        ensureNpcSim(mapId);
        sendBoxSync(ws, mapId);
      }
      const profile = refreshCombatProfile(state, accountId, mapId, msg);
      if (!profile) return;
      syncMovementAbility(state, profile, Date.now(), movementTarget(state._moveEffect?.targetKey));
      // Vitesse de l'equipement + aptitude autorisee, selon le temps serveur.
      // Les timestamps et vmax du client n'accordent aucun droit de mouvement.
      const declaredVmax = movementSpeed(state, profile, Date.now());
      const nextVx = Number(msg.vx), nextVy = Number(msg.vy);
      if (Number.isFinite(nextVx) && Number.isFinite(nextVy)) {
        const speed = Math.hypot(nextVx, nextVy);
        const scale = speed > declaredVmax ? declaredVmax / speed : 1;
        state.vx = nextVx * scale;
        state.vy = nextVy * scale;
      }
      let movementAccepted = false;
      const nx = Number(msg.x), ny = Number(msg.y);
      if (Number.isFinite(nx) && Number.isFinite(ny)) {
        const nowMove = Date.now();
        const revival = msg.dead !== true && (state.pvpDead === true || !(state.hp > 0))
          && ((state._arrival?.revive === true && validArrival(state._arrival, nx, ny, nowMove))
            || reviveArrival(serverMaps, state, mapId, state._account.faction, nx, ny));
        const legitJump = validArrival(state._arrival, nx, ny, nowMove) || !!revival;
        if (legitJump) {
          movementAccepted = true;
          state.teleportSeq = (state.teleportSeq || 0) + 1;
          state.x = nx;
          state.y = ny;
          state._posOk = true;
          state._rejPos = null;
          state._arrival = null;
          state.moveBuck = 0;
          state.moveBuckT = Date.now();
          if (revival) {
            state.hp = Math.max(1, Math.floor(state.hpMax * 0.1));
            state.sh = Math.floor(state.shMax * 0.1);
            state.dead = false;
            state.pvpDead = false;
            state.healBudHp = 0;
            state.healBudSh = 0;
            state.healBudT = nowMove;
            state.dmgBlockUntil = nowMove + 500;
            state.ishUntil = nowMove + 3000;
            state.portalCdUntil = nowMove + 5000;
          }
        } else {
          // Décision de déplacement : voir SCRIPTS/ANTICHEAT.js (testable).
          const mv = takeMovement(state, profile, nx, ny, nowMove, movementTarget(state._moveEffect?.targetKey));
          state.x = mv.x;
          state.y = mv.y;
          movementAccepted = mv.accepted;
        }
      }
      if (!movementAccepted) { stopRejectedMotion(state); correctState(); }
      else state.motionBlocked = false;
      if (Number.isFinite(Number(msg.angle))) state.angle = Number(msg.angle);
      // B02 actifs (bonus de groupe) : ids validés, diffusés au groupe.
      if (!authed && typeof msg.pseudo === "string" && msg.pseudo.trim()) state.pseudo = String(msg.pseudo).slice(0, 20);
      state.dead = state.pvpDead === true || !(state.hp > 0);
      // CPU CL04K-XL : vaisseau masqué aux autres (point minimap conservé).
      // CPU natif : son coût en crédits sera validé lors de la migration
      // économique, comme les coûts IEM/ISH/SMB existants.
      if (typeof msg.cloakCpu === "boolean") state.cloakCpu = msg.cloakCpu;
      // Camouflage (ultime ou CPU) : les NPC partagés perdent la cible.
      if (typeof msg.cloaked === "boolean") {
        const nowCloak = Date.now();
        if (msg.cloaked && !state.cloaked && profile.cloakSkill && nowCloak >= Number(state._cloakCdUntil || 0)) {
          state._cloakUntil = nowCloak + (Number(profile.cloakSkill.durationSec) || 30) * 1000;
          state._cloakCdUntil = nowCloak + (Number(profile.cloakSkill.cooldownSec) || 240) * 1000;
        }
        state.cloaked = msg.cloaked && (state.cloakCpu || nowCloak < Number(state._cloakUntil || 0));
      }
      if (typeof msg.safe === "boolean") state.safe = msg.safe;
      if (Number.isFinite(Number(msg.hpPct))) state.hpPct = Math.max(0, Math.min(1, Number(msg.hpPct)));
      if (Number.isFinite(Number(msg.shPct))) state.shPct = Math.max(0, Math.min(1, Number(msg.shPct)));
      if (typeof msg.collectUid === "string") state.collectUid = String(msg.collectUid).slice(0, 64);
      if (typeof msg.collectPet === "boolean") state.collectPet = msg.collectPet;
      if (typeof msg.bg === "boolean") state.bg = msg.bg;
      if (typeof msg.atk === "boolean") state.atk = msg.atk;
      if (msg.combat === "npc" || msg.combat === "player" || msg.combat === "") state.combat = msg.combat;
      if (typeof msg.targetName === "string") state.targetName = String(msg.targetName).slice(0, 64);
      if (Number.isFinite(Number(msg.targetHpPct))) state.targetHpPct = Math.max(0, Math.min(1, Number(msg.targetHpPct)));
      if (Number.isFinite(Number(msg.targetShPct))) state.targetShPct = Math.max(0, Math.min(1, Number(msg.targetShPct)));
      if (Number.isFinite(Number(msg.targetHpMax))) state.targetHpMax = Math.max(0, Math.min(1e12, Math.round(Number(msg.targetHpMax))));
      if (Number.isFinite(Number(msg.targetShMax))) state.targetShMax = Math.max(0, Math.min(1e12, Math.round(Number(msg.targetShMax))));
      if (Number.isFinite(Number(msg.tx))) state.tx = Math.round(Number(msg.tx));
      if (Number.isFinite(Number(msg.ty))) state.ty = Math.round(Number(msg.ty));
      // Destination de deplacement (prediction cote receveur). Bornee large
      // (monde + marges), jamais de kick (lags = faux positifs).
      if (movementAccepted) {
        if (typeof msg.moving === "boolean") state.moving = msg.moving;
        if (Number.isFinite(Number(msg.mx))) state.mx = Math.max(-100000, Math.min(100000, Math.round(Number(msg.mx))));
        if (Number.isFinite(Number(msg.my))) state.my = Math.max(-100000, Math.min(100000, Math.round(Number(msg.my))));
      }
      if (typeof msg.ammo === "string" && msg.ammo) state.ammo = String(msg.ammo).slice(0, 16);
      if (Number.isFinite(Number(msg.drones))) state.drones = Math.max(0, Math.min(12, Math.round(Number(msg.drones))));
      if (typeof msg.dform === "string" && msg.dform) state.dform = String(msg.dform).slice(0, 32);
      if (Number.isFinite(Number(msg.fint))) state.fint = Math.max(0.05, Math.min(6, Number(msg.fint)));
      if (Number.isFinite(Number(msg.bspd))) state.bspd = Math.max(500, Math.min(20000, Number(msg.bspd)));
      if (typeof msg.dslots === "string" && msg.dslots) state.dslots = String(msg.dslots).slice(0, 256);
      if (typeof msg.alt === "boolean") state.alt = msg.alt;
      if (Number.isFinite(Number(msg.shots))) state.shots = Math.max(0, Math.floor(Number(msg.shots)));
      if (typeof msg.rank === "string" && msg.rank) state.rank = String(msg.rank).slice(0, 64);
      if (typeof msg.firm === "string" && msg.firm) state.firm = String(msg.firm).slice(0, 16);
      if (typeof msg.dind === "string" && msg.dind) state.dind = String(msg.dind).slice(0, 256);
      if (typeof msg.ficon === "string" && msg.ficon) state.ficon = String(msg.ficon).slice(0, 128);
      if (typeof msg.mind === "string" && msg.mind) state.mind = String(msg.mind).slice(0, 128);
      if (Number.isFinite(Number(msg.rseq))) state.rseq = Math.max(0, Math.floor(Number(msg.rseq)));
      if (typeof msg.rkind === "string" && msg.rkind) state.rkind = String(msg.rkind).slice(0, 16);
      if (Number.isFinite(Number(msg.rspd))) state.rspd = Math.max(500, Math.min(20000, Math.round(Number(msg.rspd))));
      // PvP : PV serveur autoritaires.
      // - Les BAISSES via pos sont adoptees aussitot (cliquet bas : les
      //   degats NPC locaux repercutent, sinon dieu du PvP).
      // - Les MONTEES (robot reparateur, reparations, regen bouclier) sont
      //   aussi suivies (plafonnees au max) : sans ca, le pool serveur
      //   restait bas apres un soin local et le prochain coup NPC
      //   reimposait l'ancien pool au client (vie "qui revient en arriere
      //   apres reparation"). Montees suspectes (>50 % du max hors revive)
      //   loggees, sans kick (serveur prive : pas de faux positif).
      {
        const hm = profile.hpMax;
        const sm = profile.shMax;
        // Télémétrie : pools absurdes (= hpMax forgé, dieu du PvP).
        if ((hm > 50e6 || sm > 50e6) && acStrike(state, "poolStrike", 10)) {
          try { console.log(`[multi:anticheat] pool suspect ${state.pseudo} (hpMax ${hm}, shMax ${sm})`); } catch {}
        }
        const cHp = Math.max(0, Math.min(hm, hm * Math.max(0, Math.min(1, Number(msg.hpPct ?? 1)))));
        const cSh = Math.max(0, Math.min(sm, sm * Math.max(0, Math.min(1, Number(msg.shPct ?? 1)))));
        // Budget de remontée (horloge serveur) : les réparations légitimes
        // sont graduelles, la vie figée pleine (Cheat Engine) est étouffée.
        const nowH = Date.now();
        const hDt = Math.max(0, Math.min(5, (nowH - Number(state.healBudT || 0)) / 1000));
        state.healBudT = nowH;
        state.healBudHp = Math.min(hm * HEAL_BUDGET_CAP, Number(state.healBudHp || 0) + hm * HEAL_BUDGET_RATE * hDt);
        state.healBudSh = Math.min(sm * HEAL_BUDGET_CAP, Number(state.healBudSh || 0) + sm * HEAL_BUDGET_RATE * hDt);
        const healTake = (cur, want, max, key) => acHealTake(state, cur, want, max, key);
        if (state.dead === true || state.pvpDead === true) {
          state.hp = 0;
          state.sh = 0;
        } else {
          // Blackout : un coup vient d'être appliqué (dmgBlockUntil) — les
          // remontées sont ignorées le temps que la victime l'adopte
          // (snapshot 20 Hz). Sinon un soin effacerait le coup avant son
          // adoption : chiffres affichés côté tireur, barre immobile.
          // Les baisses restent acceptées. Cohérent avec le jeu (pas de
          // soin efficace sous le feu direct).
          const blocked = Date.now() < Number(state.dmgBlockUntil || 0);
          if (cHp < state.hp) state.hp = cHp;
          else if (cHp > state.hp && !blocked) {
            if (cHp - state.hp > hm * 0.5) {
              state.healWarn = Number(state.healWarn || 0) + 1;
              if (state.healWarn % 10 === 1) {
                try { console.log(`[multi:anticheat] soin suspect ${state.pseudo} (+${Math.round(cHp - state.hp)} HP en un pos, max ${hm})`); } catch {}
              }
            }
            // Plafonné au budget (voir ci-dessus).
            state.hp = healTake(state.hp, cHp, hm, "healBudHp");
          }
          if (cSh < state.sh) state.sh = cSh;
          else if (cSh > state.sh && !blocked) {
            if (sm > 0 && cSh - state.sh > sm * 0.5) {
              state.healWarn = Number(state.healWarn || 0) + 1;
              if (state.healWarn % 10 === 1) {
                try { console.log(`[multi:anticheat] soin suspect ${state.pseudo} (+${Math.round(cSh - state.sh)} SH en un pos, max ${sm})`); } catch {}
              }
            }
            state.sh = healTake(state.sh, cSh, sm, "healBudSh");
          }
        }
      }
      if (!(state.hp > 0)) { state.pvpDead = true; state.dead = true; }
      if (msg.peta === 1 || msg.peta === 0) state.peta = profile.petOwned && msg.peta === 1 ? 1 : 0;
      if (Number.isFinite(Number(msg.petl))) state.petl = Math.max(1, Math.min(32, Math.round(Number(msg.petl))));
      if (Number.isFinite(Number(msg.petx)) && Number.isFinite(Number(msg.pety))) {
        // Laisse PET : le pet colle son vaisseau. Sans ça, petx/pety forgés
        // sur chaque box = ramassage de toute la map (boxes validées dessus).
        const ppx = Math.round(Number(msg.petx)), ppy = Math.round(Number(msg.pety));
        const ldx = ppx - Number(state.x), ldy = ppy - Number(state.y);
        if (ldx * ldx + ldy * ldy <= PET_LEASH * PET_LEASH) {
          state.petx = ppx;
          state.pety = ppy;
        }
      }
      if (Number.isFinite(Number(msg.petd))) state.petd = Math.round(Number(msg.petd) * 100) / 100;
      if (typeof msg.petn === "string") state.petn = String(msg.petn).slice(0, 32);
      if (typeof msg.petf === "string") state.petf = String(msg.petf).slice(0, 16);
      // PV du PET (lock info allie) : 0..1 declare, jamais de montee serveur.
      if (Number.isFinite(Number(msg.petHp))) state.petHp = Math.max(0, Math.min(1, Number(msg.petHp)));
      if (Number.isFinite(Number(msg.petSh))) state.petSh = Math.max(0, Math.min(1, Number(msg.petSh)));
      // Pool PV du PET (degats PvP) : meme regles que le pool joueur.
      if (profile.petOwned) {
        const phm = profile.petHpMax;
        const psm = profile.petShMax;
        const cPHp = Math.max(0, Math.min(phm, phm * Math.max(0, Math.min(1, Number(msg.petHp ?? 1)))));
        const cPSh = Math.max(0, Math.min(psm, psm * Math.max(0, Math.min(1, Number(msg.petSh ?? 1)))));
        if (!state._petInit) {
          state.petHpM = phm;
          state.petShM = psm;
          state.petPoolHp = Math.min(phm, Number(state._account.pet.hp) || 0);
          state.petPoolSh = Math.min(psm, Math.max(0, Number(state._account.pet.sh ?? psm) || 0));
          state._petInit = true;
          state.petDead = !(state.petPoolHp > 0);
        } else if (!(cPHp > 0)) {
          state.petPoolHp = 0;
          state.petPoolSh = 0;
        } else if (!(state.petPoolHp > 0)) {
          // Réparation enregistrée dans le compte (10 %), jamais un ratio
          // arbitraire dans pos. L'économie sera migrée séparément.
          if (state._account.revision !== state._petDeathRevision && state._account.pet.active === false
            && Number(state._account.pet.hp) > 0) {
            state.petPoolHp = Math.min(phm * 0.1, Number(state._account.pet.hp));
            state.petPoolSh = 0;
            state.petDead = false;
          }
        } else {
          if (cPHp < state.petPoolHp) state.petPoolHp = cPHp;
          if (cPSh < state.petPoolSh) state.petPoolSh = cPSh;
          // Regeneration legitime du REX : G-REP repare jusqu'a 5 %/s et le
          // bouclier recharge a 5 %/s. Les valeurs arrivent par paliers de
          // 1 s, donc on utilise un petit budget accumule plutot qu'un cliquet
          // strictement descendant qui figeait les barres multijoueur.
          const syncNow = Date.now();
          const syncDt = Math.max(0, Math.min(2, (syncNow - Number(state._petRegenAt || syncNow)) / 1000));
          state._petRegenAt = syncNow;
          state._petHpRegenBudget = Math.min(phm * 0.055, Math.max(0, Number(state._petHpRegenBudget) || 0) + phm * 0.055 * syncDt);
          state._petShRegenBudget = Math.min(psm * 0.055, Math.max(0, Number(state._petShRegenBudget) || 0) + psm * 0.055 * syncDt);
          if (cPHp > state.petPoolHp && state._petHpRegenBudget > 0) {
            const gain = Math.min(cPHp - state.petPoolHp, state._petHpRegenBudget);
            state.petPoolHp += gain;
            state._petHpRegenBudget -= gain;
          }
          if (cPSh > state.petPoolSh && state._petShRegenBudget > 0
            && syncNow - Number(state.petPvpAt || 0) >= 5000) {
            const gain = Math.min(cPSh - state.petPoolSh, state._petShRegenBudget);
            state.petPoolSh += gain;
            state._petShRegenBudget -= gain;
          }
        }
        state.petHpM = phm; state.petShM = psm;
        state.petPoolHp = Math.min(phm, state.petPoolHp);
        state.petPoolSh = Math.min(psm, state.petPoolSh);
        if (!(state.petPoolHp > 0)) {
          state.petDead = true;
          state._petDeathRevision ??= state._account.revision;
        } else state._petDeathRevision = null;
      }
      state.updatedAt = Date.now();
    }
  });

  // Groupes : départ propre + amis : présence hors ligne.
  const onPeerGone = () => {
    try {
      socialPeerGone(id, {
        id, state, authed,
        send: () => {},
        sendTo: (pid, obj) => sendToPeer(pid, obj),
        findByPseudo: (pseudo) => findPeerByPseudo(pseudo),
        describe: (pid) => describePeer(pid),
      });
    } catch {}
    try { if (authed && accountId) notifyFriendPresence(accountId, false); } catch {}
  };
  ws.on("close", (code, reason) => {
    allWs.delete(ws);
    if (code !== 1000 && code !== 1001) {
      console.log(`[multi:connection] ${id} closed ${code}: ${String(reason).slice(0, 120)}`);
    }
    if (authed && accountSockets.get(id) !== ws) return;
    accountSockets.delete(id);
    chatLastById.delete(id); friendPingLast.delete(id); clanChatLast.delete(id);
    clanChatLast.delete(`${id}:notify`); clanChatLast.delete(`${id}:diplo`);
    if (String(id).startsWith("u_")) schedulePeerGrace(id, { state, authed, accountId });
    else { onPeerGone(); removeFromAllRooms(id); }
  });
  ws.on("error", () => { try { ws.close(); } catch {} });
});

// Enchères partagées : clôture à chaque heure pile de Paris (:00),
// gagnants diffusés puis nouveau cycle pour tous.
setInterval(() => {
  try {
    const rolled = pollAuctionCycle();
    if (!rolled) return;
    broadcastAll(JSON.stringify(rolled.settle));
    broadcastAll(JSON.stringify(rolled.sync));
    console.log(`[multi:auction] cycle ${rolled.settle.cycle} clôturé (${rolled.settle.results.filter((r) => r.amount > 0).length} lots vendus).`);
  } catch (err) {
    console.warn("[multi:auction]", err?.message || err);
  }
}, 5000);

// Enchères partagées : heartbeat 60 s (garde-fou : les clients en
// instance perso restent synchronisés même sans mises dans l'heure).
setInterval(() => {
  try {
    broadcastAll(JSON.stringify(getAuctionSync()));
  } catch {}
}, 60000);

// Respawn des box gere meme si aucun joueur n'est present sur la carte.
setInterval(() => {
  const now = Date.now();
  for (const [mapId, queue] of boxRespawns) {
    const set = boxRooms.get(mapId);
    if (!set) continue;
    const sim = npcSims.get(mapId);
    for (let i = queue.length - 1; i >= 0; i--) {
      const pending = queue[i];
      if (!pending || Number(pending.at) > now) continue;
      queue.splice(i, 1);
      if (set.has(pending.uid)) continue;
      const cfg = COLLECTABLE_TYPES[pending.type] || {};
      const pos = randomBoxPosition(sim && typeof sim.then !== "function" ? sim : null);
      const box = { type: pending.type, ...pos };
      set.set(pending.uid, box);
      const room = rooms.get(mapId);
      if (room?.size) broadcastRoom(room, JSON.stringify({ t: "box", op: "spawn", box: { uid: pending.uid, ...box } }));
    }
    if (!queue.length) boxRespawns.delete(mapId);
  }
}, 250);

// Broadcast + simu NPC 20 Hz par room, uniquement aux sockets ouvertes.
// Les NPC inactifs a plus de 2 000 unites voyagent a 1 Hz, repartis sur les ticks ;
// leur simulation reste à 20 Hz et les NPC actifs/proches restent toujours
// dans chaque snapshot. Les joueurs lointains restent, eux, à 10 Hz.
let snapshotTick = 0;
setInterval(() => {
  const now = Date.now();
  snapshotTick++;
  const fullPlayerTick = (snapshotTick & 1) === 0;
  const includePlayerStatic = snapshotTick % PLAYER_STATIC_REFRESH_TICKS === 0;
  // Les instances n'ont pas de snapshot partage, mais gardent le meme rythme
  // de simulation. Aucun mouvement ni gain d'economie n'est adopte ici.
  const clockPayload = JSON.stringify({ t: "clock", at: now });
  for (const [, entry] of instancePeers) {
    try {
      if (entry.ws.readyState === 1 && entry.ws.bufferedAmount < SNAPSHOT_BACKPRESSURE_LIMIT) entry.ws.send(clockPayload);
    } catch {}
  }
  for (const [key, room] of rooms) {
    if (!room.size) continue;
    // Les sockets silencieux sont fermes par le heartbeat. Le handler close
    // retire ensuite la presence via la grace habituelle de reconnexion.
    // Simu NPC : positions des joueurs pour la poursuite, tick, snapshot.
    let npc = { list: [], deaths: [], dmg: [] };
    try {
      const sim = npcSims.get(key);
      if (sim && typeof sim.tick === "function") {
        for (const [pid, entry] of room) {
          const s = entry?.state;
          // Anti-fantôme : jamais positionné (chargement, pas de pos)
          // = ignoré par la simu NPC (ni poursuite ni ciblage).
          // Refresh : le fantôme en grâce n'est ni poursuivi ni ciblé.
          if (s && s._posOk === true && !(Number(s._graceUntil || 0) > now)) {
            const serverSafe = typeof sim.inSafe === "function" ? sim.inSafe(s.x, s.y) : false;
            s.serverSafe = serverSafe && s.safe === true;
            const serverDead = s.pvpDead === true || !(Number(s.hp) > 0);
            sim.setPlayer(pid, s.x, s.y, { dead: serverDead, safe: s.serverSafe, untargetableUntil: Number(s.iemUntil) || 0, cloaked: s.cloaked === true || s.cloakCpu === true, shipId: s.shipId });
          }
        }
        if (typeof sim.prunePlayers === "function") {
          try { sim.prunePlayers([...room.keys()]); } catch {}
        }
        sim.tick(0.05);
        // Les tirs NPC partages retirent les PV dans le meme pool autoritaire
        // que le PvP. Les soins du client (reparateur, regen) remontent ce
        // pool via les pos ; les degats serveur restent prioritaires.
        if (typeof sim.drainPlayerHits === "function") {
          const npcHitVictims = new Set();
          for (const hit of sim.drainPlayerHits()) {
            const victim = room.get(String(hit?.playerId));
            const s = victim?.state;
            if (!s || s.pvpDead === true || !(Number(s.hp) > 0)) continue;
            if (Date.now() < Number(s.ishUntil || 0) || Date.now() < Number(s.iemUntil || 0)) continue;
            if (s.serverSafe === true) {
              // Riposte ZNA : seul le NPC visé peut blesser un joueur
              // protégé (parité solo). Tous les autres impacts sont ignorés.
              let safeHitOk = false;
              try { safeHitOk = typeof sim.allowsSafeHit === "function" && sim.allowsSafeHit(hit?.npcUid, String(hit?.playerId)) === true; } catch {}
              if (!safeHitOk) continue;
            }
            if (Math.random() < Math.max(0, Math.min(0.9, Number(s.evade) || 0))) continue;
            const hitNow = Date.now();
            const damage = Math.max(0, Math.min(1e8, Number(hit?.damage) || 0));
            if (!(damage > 0)) continue;
            const result = damagePlayerLayers(s, damage, Math.max(0, Math.min(1, Number(s.absorb) || 0.8)), 0, 0);
            s.hp = Math.max(0, Number(s.hp) || 0);
            s.sh = Math.max(0, Number(s.sh) || 0);
            if (!npcHitVictims.has(s)) {
              npcHitVictims.add(s);
              s.npcDamage = 0;
              s.npcHpDamage = 0;
              s.npcShDamage = 0;
            }
            s.npcAt = hitNow;
            // Blackout remontées (comme en PvP) : le coup doit survivre
            // aux soins qui arrivent avant son adoption par la victime.
            s.dmgBlockUntil = hitNow + 500;
            s.npcFrom = String(hit?.npcUid || "").slice(0, 64);
            s.npcDamage += Math.max(0, Number(result?.total) || 0);
            s.npcHpDamage += Math.max(0, Number(result?.hp) || 0);
            s.npcShDamage += Math.max(0, Number(result?.sh) || 0);
            if (s.hp <= 0) { s.pvpDead = true; s.dead = true; }
          }
          for (const s of npcHitVictims) {
            s.npcSeq = Math.max(0, Math.floor(Number(s.npcSeq) || 0)) + 1;
            s.npcDamage = Math.max(0, Math.round(Number(s.npcDamage) || 0));
            s.npcHpDamage = Math.max(0, Math.round(Number(s.npcHpDamage) || 0));
            s.npcShDamage = Math.max(0, Math.round(Number(s.npcShDamage) || 0));
          }
        }
        npc = sim.snapshot();
        // Halos Mindfire : camouflages dissipés (message ciblé, le client
        // casse son camouflage à réception).
        if (typeof sim.drainDecloaks === "function") {
          try {
            for (const d of sim.drainDecloaks()) {
              if (!d || !String(d.playerId || "").startsWith("u_")) continue;
              sendToPeer(String(d.playerId), { t: "mindfireDecloak", uid: String(d.npcUid || "") });
            }
          } catch {}
        }
        // Recompenses filees hors boucle chaude (SQLite ~8 ms/part) : le
        // client attend le gain avant d'afficher l'explosion, delai invisible.
        awardNpcDeaths(key, npc.deaths);
      } else if (sim === undefined) {
        ensureNpcSim(key);
      } else if (sim === null) {
        // Simu en échec (ex : import de map) : réessaye toutes les 10 s
        // au lieu de laisser la map vide définitivement.
        try { retryNpcSim(key, now); } catch {}
      }
    } catch {}
    // Raid Low : contrôleur de vagues en groupe (ralliement -> 5 s ->
    // vagues enchaînées -> Century Falcon -> récompense fixe).
    if (key === "low") {
      try {
        const lowSim = npcSims.get(key);
        if (lowSim && typeof lowSim.setRaidWave === "function") {
          tickLowRaid(room, lowSim, {
            describe: (pid) => describePeer(pid),
            sendTo: (pid, obj) => sendToPeer(pid, obj),
            broadcast: (obj) => broadcastRoom(room, JSON.stringify(obj)),
          });
        }
      } catch {}
    }
    // Feed degats PvP du tick, fusionne avec le feed NPC (plafond commun).
    try {
      const pf = pvpFeeds.get(key);
      if (pf && pf.size) {
        const base = Array.isArray(npc.dmg) ? npc.dmg : [];
        for (const f of pf.values()) {
          if (base.length >= 24) break;
          if (f && f.total > 0) base.push({ uid: f.uid, by: f.by, total: f.total });
        }
        npc.dmg = base;
        pf.clear();
      }
    } catch {}
    const players = [];
    for (const [, entry] of room) {
      const s = entry?.state;
      if (!s) continue;
      // Anti-fantôme : pas de pos envoyée = invisible pour les autres.
      if (s._posOk !== true) continue;
      players.push({ id: s.id, pseudo: s.pseudo, clan: String(s.clanTag || "").slice(0, 5), shipId: s.shipId, hswap: Math.max(0, Math.min(3, Number(s.hswap) || 0)), x: Math.round(s.x), y: Math.round(s.y), vx: Math.round((Number(s.vx) || 0) * 100) / 100, vy: Math.round((Number(s.vy) || 0) * 100) / 100, moving: s.moving === true, motionBlocked: s.motionBlocked === true, teleportSeq: Number(s.teleportSeq) || 0, mx: Math.round(Number(s.mx) || 0), my: Math.round(Number(s.my) || 0), cloakCpu: s.cloakCpu === true, vmax: Math.max(50, Math.min(7500, Math.round(Number(s.vmax) || 400))), angle: Number(s.angle) || 0, dead: s.dead === true, hpPct: s.hpPct ?? 1, shPct: s.shPct ?? 1, collectUid: String(s.collectUid || "").slice(0, 64), collectPet: s.collectPet === true, bg: s.bg === true, atk: s.atk === true, tx: Math.round(Number(s.tx) || 0), ty: Math.round(Number(s.ty) || 0), ammo: String(s.ammo || "x1").slice(0, 16), drones: Number(s.drones) || 0, dform: String(s.dform || "standard").slice(0, 32), fint: Number(s.fint) || 0.25, bspd: Math.round(Number(s.bspd) || 4000), dslots: String(s.dslots || ""), alt: s.alt === true, shots: Math.max(0, Math.floor(Number(s.shots) || 0)), rank: String(s.rank || ""), firm: String(s.firm || ""), dind: String(s.dind || ""), ficon: String(s.ficon || ""), mind: String(s.mind || ""), rseq: Math.max(0, Math.floor(Number(s.rseq) || 0)), rkind: String(s.rkind || "r310").slice(0, 16), rspd: Math.round(Number(s.rspd) || 1500),
        // PvP : PV autoritaires + date du dernier coup recu + attaquant (anneau Ship_damage).
        pvpAt: Number(s.pvpAt) || 0, pvpFrom: s.pvpFrom != null ? String(s.pvpFrom) : null, pvpHp: Math.max(0, Math.round(Number(s.hp) || 0)), pvpSh: Math.max(0, Math.round(Number(s.sh) || 0)),
        npcAt: Number(s.npcAt) || 0, npcSeq: Math.max(0, Math.floor(Number(s.npcSeq) || 0)), npcFrom: s.npcFrom != null ? String(s.npcFrom) : null,
        npcDamage: Math.max(0, Math.round(Number(s.npcDamage) || 0)), npcHpDamage: Math.max(0, Math.round(Number(s.npcHpDamage) || 0)), npcShDamage: Math.max(0, Math.round(Number(s.npcShDamage) || 0)),
        slowPct: now < Number(s.slowUntil || 0) ? Number(s.slowPct) || 0 : 0,
        slowT: Math.max(0, (Number(s.slowUntil) || 0) - now) / 1000,
        freezeT: Math.max(0, (Number(s.freezeUntil) || 0) - now) / 1000,
        hpMax: Math.max(1, Math.round(Number(s.hpMax) || 1)), shMax: Math.max(0, Math.round(Number(s.shMax) || 0)),
        range: Math.max(200, Math.min(5000, Number(s.range) || 800)),
        peta: s.peta === 1 ? 1 : 0, petl: Math.max(1, Math.min(32, Math.round(Number(s.petl) || 1))),
        petx: Math.round(Number(s.petx) || 0), pety: Math.round(Number(s.pety) || 0),
        petd: Math.round(Number(s.petd || 0) * 100) / 100,
        petn: String(s.petn || "").slice(0, 32), petf: String(s.petf || "").slice(0, 16),
        petHp: Number.isFinite(Number(s.petHp)) ? Math.max(0, Math.min(1, Number(s.petHp))) : 1,
        petSh: Number.isFinite(Number(s.petSh)) ? Math.max(0, Math.min(1, Number(s.petSh))) : 1,
        // Pool PV du PET (adoption cote proprietaire).
        pvpPetHp: Math.max(0, Math.round(Number(s.petPoolHp ?? 1) || 0)),
        pvpPetSh: Math.max(0, Math.round(Number(s.petPoolSh ?? 0) || 0)),
        petPvpAt: Number(s.petPvpAt) || 0,
        petHpM: Math.max(1, Math.round(Number(s.petHpM) || 1)),
        petShM: Math.max(0, Math.round(Number(s.petShM) || 0)),
        safe: s.safe === true,
        combat: s.combat === "player" ? "player" : (s.combat === "npc" ? "npc" : ""),
        iemT: Math.max(0, (Number(s.iemUntil) || 0) - now) / 1000,
        ishT: Math.max(0, (Number(s.ishUntil) || 0) - now) / 1000 });
      const output = players[players.length - 1];
      const staticSignature = [output.pseudo, output.clan, output.shipId, output.drones, output.dform, output.dslots,
        output.rank, output.firm, output.dind, output.ficon, output.mind, output.petl, output.petn, output.petf].join("|");
      output._staticChanged = staticSignature !== s._lastStaticSignature;
      output._staticSignature = staticSignature;
    }
    let playersForNetwork = players;
    if (!fullPlayerTick && players.length > 1) {
      const nearRadiusSq = PLAYER_NEAR_PLAYER_RADIUS * PLAYER_NEAR_PLAYER_RADIUS;
      playersForNetwork = players.filter((entry, index) => {
        if (entry.dead || entry.atk || entry.combat === "player"
          || Number(entry.slowT) > 0 || Number(entry.freezeT) > 0
          || Number(entry.iemT) > 0 || Number(entry.ishT) > 0) return true;
        for (let otherIndex = 0; otherIndex < players.length; otherIndex++) {
          if (otherIndex === index) continue;
          const other = players[otherIndex];
          const dx = Number(entry.x) - Number(other.x), dy = Number(entry.y) - Number(other.y);
          if (dx * dx + dy * dy <= nearRadiusSq) return true;
        }
        return false;
      });
    }
    // Les donnees d'apparence changent rarement. Elles sont rafraichies a
    // faible cadence ; le client conserve entre-temps sa derniere valeur.
    for (const entry of playersForNetwork) {
      if (!includePlayerStatic && entry._staticChanged !== true) {
        delete entry.pseudo;
        delete entry.clan;
        delete entry.shipId;
        delete entry.drones;
        delete entry.dform;
        delete entry.dslots;
        delete entry.rank;
        delete entry.firm;
        delete entry.dind;
        delete entry.ficon;
        delete entry.mind;
        delete entry.petl;
        delete entry.petn;
        delete entry.petf;
      } else {
        const sourceState = room.get(String(entry.id))?.state;
        if (sourceState) sourceState._lastStaticSignature = entry._staticSignature;
      }
      delete entry._staticChanged;
      delete entry._staticSignature;
    }
    const npcForNetwork = selectNpcSnapshot(npc, players, snapshotTick, NPC_NEAR_PLAYER_RADIUS);
    const payload = JSON.stringify({ t: "snapshot", map: key, at: now, players: playersForNetwork, npc: npcForNetwork });
    for (const [, entry] of room) {
      try {
        if (entry.ws.readyState === 1 && entry.ws.bufferedAmount < SNAPSHOT_BACKPRESSURE_LIMIT) entry.ws.send(payload);
      } catch {}
    }
  }
}, 50);

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[multi] HTTP+WS sur http://0.0.0.0:${PORT}/  (WS: /ws)`);
  try {
    getAuctionSync();
    const st = auctionRoomStatus();
    console.log(`[multi:auction] cycle ${st.cycle} (${st.lots} lots partagés${st.withBids ? `, ${st.withBids} avec mises` : ""}).`);
  } catch {}
  if (process.env.ORBIT_ADMIN_PASS) console.log("[multi] Panneau admin : /admin.html (pass ORBIT_ADMIN_PASS)");
  else console.log(`[multi] Panneau admin : /admin.html (mot de passe généré${ADMIN_PASS_PERSISTED ? " dans SERVER_DATA/.admin_pass" : ""}, valeur non affichée)`);
});

let shuttingDown = false;
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    if (shuttingDown) return;
    shuttingDown = true;
    // Maintenance ordonnée : demande d'abord aux navigateurs de sauvegarder,
    // puis ferme toutes les sockets avec le code standard "service restart".
    try { broadcastAll(JSON.stringify({ t: "maintenance", reason: "deploy", retryMs: 3000 })); } catch {}
    try { saveNpcRespawns(); } catch {}
    setTimeout(() => {
      try {
        for (const client of wss.clients) {
          try { client.close(1012, "Mise à jour du serveur"); } catch {}
        }
      } catch {}
      try { server.closeAllConnections?.(); } catch {}
      try { wss.close?.(() => {}); } catch {}
      try { server.close(() => process.exit(0)); } catch { process.exit(0); }
    }, 750).unref?.();
    setTimeout(() => process.exit(0), 3000).unref?.();
  });
}
