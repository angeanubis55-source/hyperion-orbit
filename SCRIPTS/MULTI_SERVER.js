import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { WebSocketServer } from "ws";
import { ZoneNpcSim } from "./NPC_ROOM.js";
import { damagePlayerLayers } from "../COMBAT/COMBAT_RULES.js";
import { handleAccountApi, verifyWsToken, recordPvpKill, awardNpcKill, listFriends, friendFollowers, findUserByPseudo, hasFriendRequest, adminGiveCredits, adminGiveExperience, adminGiveHonor } from "./ACCOUNT_SERVER.js";
import { handleSocialMessage, socialPeerGone, socialPeerChanged, socialDescribeGroup, socialGroupOf } from "./SOCIAL_ROOM.js";
import { getAuctionSync, handleAuctionBid, pollAuctionCycle, auctionRoomStatus } from "./AUCTION_ROOM.js";
import { GAME_VERSION } from "../SRC/DATA/VERSION.js";
import { COLLECTABLE_TYPES } from "../SRC/DATA/COLLECTABLES.js";

const root = resolve(process.cwd());
const portArg = process.argv.find((arg) => arg.startsWith("--port="))?.slice(7);
const PORT = Number(portArg || process.env.PORT || 8080) || 8080;
const PUBLIC_DIRS = new Set(["ASSETS", "AUDIO", "COMBAT", "DRONE", "MAPS", "NPC", "PET", "PUBLIC", "QUEST", "SHIP", "SRC", "UI"]);
const PUBLIC_FILES = new Set(["index.html", "admin.html", "style.css", "ASSETS_MANIFEST.json"]);
// Les vaisseaux speciaux (notamment Police) depassent largement l'ancien
// plafond de 50 M. Le pool combat serveur doit couvrir leurs vraies stats,
// sinon le premier impact remplace leur bouclier par le pool tronque.
const MAX_PLAYER_COMBAT_LAYER = 1_000_000_000;

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
    // Joueurs en instance perso (Galaxy Gates : alpha/beta/gamma) : hors
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
  if ((pathname === "/api/admin/broadcast" || pathname === "/api/admin/kick" || pathname === "/api/admin/mute" || pathname === "/api/admin/give" || pathname === "/api/admin/give-exp" || pathname === "/api/admin/give-honor" || pathname === "/api/admin/ban" || pathname === "/api/admin/unban") && request.method === "POST") {
    readJsonBody(request).then((body) => {
      try {
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
        const pid = String(body?.id || "");
        if (!pid) { adminJson(response, 400, { ok: false, error: "Id manquant." }); return; }
        if (pathname === "/api/admin/kick") {
          let found = false;
          const reason = String(body?.reason || "Comportement inapproprié.").slice(0, 200);
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
const NPC_NEAR_PLAYER_RADIUS = 2600;
const PLAYER_NEAR_PLAYER_RADIUS = 2600;
const PLAYER_STATIC_REFRESH_TICKS = 10; // garde-fou de resynchronisation : 500 ms
const rooms = new Map(); // mapId(lower) -> Map(id -> { ws, state })
const npcSims = new Map(); // mapId(lower) -> ZoneNpcSim | null | Promise
const boxRooms = new Map(); // mapId(lower) -> Map(uid -> { type, x, y })
const boxRoomLoads = new Map(); // mapId -> Promise<Map>
const boxRespawns = new Map(); // mapId -> [{ uid, type, at }]
const pvpFeeds = new Map(); // mapId(lower) -> Map("victime|attaquant" -> { uid, by, total })
const pvpFarm = new Map(); // anti-farm : "tueur|victime" -> { n, t0 } (rendement decroissant 60 min)
const chatHistory = []; // global : [{ from, text, at }] (40 derniers)
const chatLastById = new Map(); // anti-spam : id -> timestamp dernier message
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

function randomBoxPosition(sim, taken, minSpacing) {
  const world = sim?.world || { w: 11000, h: 7000 };
  for (let attempt = 0; attempt < 80; attempt++) {
    const pos = { x: Math.round(80 + Math.random() * Math.max(1, world.w - 160)), y: Math.round(80 + Math.random() * Math.max(1, world.h - 160)) };
    if (typeof sim?.inSafe === "function" && sim.inSafe(pos.x, pos.y)) continue;
    if (minSpacing > 0 && taken.some((other) => Math.hypot(pos.x - other.x, pos.y - other.y) < minSpacing)) continue;
    return pos;
  }
  return { x: Math.round(80 + Math.random() * Math.max(1, world.w - 160)), y: Math.round(80 + Math.random() * Math.max(1, world.h - 160)) };
}

function ensureBoxRoom(mapId) {
  const key = String(mapId || "1-1").toLowerCase();
  if (boxRooms.has(key)) return Promise.resolve(boxRooms.get(key));
  if (boxRoomLoads.has(key)) return boxRoomLoads.get(key);
  const pending = Promise.resolve(ensureNpcSim(key)).then((sim) => {
    const boxes = new Map(), taken = [];
    for (const [type, cfg] of Object.entries(COLLECTABLE_TYPES)) {
      if (!cfg || cfg.enabled === false || !collectableAllowedOnMap(cfg, key)) continue;
      const qty = Math.max(0, Math.min(1200, Math.floor(Number(cfg.qty ?? cfg.count ?? cfg.amount ?? cfg.maxAlive) || 0)));
      const spacing = Math.max(0, Number(cfg.minSpacing) || 0);
      for (let index = 0; index < qty; index++) {
        const pos = randomBoxPosition(sim, taken, spacing);
        taken.push(pos);
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
    boxRooms.set(key, boxes);
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

function broadcastRoom(room, payload, excludeId = null) {
  for (const [pid, entry] of room) {
    if (excludeId != null && String(pid) === String(excludeId)) continue;
    try { if (entry.ws.readyState === 1) entry.ws.send(payload); } catch {}
  }
}

// Canaux globaux (tchat, enchères, annonces admin) : TOUS les sockets,
// y compris les joueurs en instance perso (Galaxy Gates, hors room).
const allWs = new Set();
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

// Fiche d'un pilote connecté (pseudo + map, même en instance).
function describePeer(pid) {
  const id = String(pid);
  for (const [mkey, room] of rooms) {
    const e = room.get(id);
    if (e) {
      const s = e.state || {};
      return {
        id, pseudo: String(s.pseudo || "Pilote").slice(0, 20), map: mkey, online: true, instance: false,
        x: Number(s.x) || 0, y: Number(s.y) || 0, hpPct: Number(s.hpPct ?? 1), shPct: Number(s.shPct ?? 1),
        hpMax: Number(s.hpMax) || 1, shMax: Number(s.shMax) || 0, dead: s.dead === true,
        shipId: String(s.shipId || "").slice(0, 64), petActive: s.peta === 1,
        combat: s.combat === "npc" || s.combat === "player" ? s.combat : "",
        targetName: String(s.targetName || "").slice(0, 64),
        targetHpPct: Number(s.targetHpPct ?? 0), targetShPct: Number(s.targetShPct ?? 0),
        targetHpMax: Number(s.targetHpMax) || 0, targetShMax: Number(s.targetShMax) || 0,
      };
    }
  }
  const ie = instancePeers.get(id);
  if (ie) return { id, pseudo: String(ie.state?.pseudo || "Pilote").slice(0, 20), map: String(ie.mapId || ""), online: true, instance: true, dead: ie.state?.dead === true, shipId: String(ie.state?.shipId || "").slice(0, 64), petActive: ie.state?.peta === 1 };
  return null;
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
  const pending = ZoneNpcSim.create(key).then((sim) => {
    npcSims.set(key, sim || null);
    return sim || null;
  }).catch(() => {
    npcSims.set(key, null);
    return null;
  });
  npcSims.set(key, pending);
  return pending;
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

function npcRewardShares(killerId, mapId, death) {
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
function queueNpcDeaths(mapId, deaths) {
  if (!Array.isArray(deaths) || !deaths.length) return;
  for (const death of deaths) {
    if (!death || typeof death !== "object") continue;
    const killerId = String(death.killer || "");
    if (!killerId.startsWith("u_") || death.cause !== "gun") continue;
    if (pendingNpcRewards.length >= 500) pendingNpcRewards.shift();
    pendingNpcRewards.push({ mapId: String(mapId), death });
  }
}
function awardNpcDeaths(mapId, deaths) {
  queueNpcDeaths(mapId, deaths);
}
function pumpNpcRewards(budgetMs = 12) {
  const start = Date.now();
  const now = Date.now();
  for (const [key, at] of rewardedNpcDeaths) if (now - at > 10 * 60_000) rewardedNpcDeaths.delete(key);
  while (pendingNpcRewards.length && Date.now() - start < budgetMs) {
    const item = pendingNpcRewards.shift();
    if (!item) continue;
    const { mapId, death } = item;
    const killerId = String(death?.killer || "");
    if (!killerId.startsWith("u_") || death?.cause !== "gun") continue;
    const deathKey = `${String(mapId).toLowerCase()}:${String(death.uid)}:${Number(death.seq) || 0}`;
    if (rewardedNpcDeaths.has(deathKey)) continue;
    let complete = true;
    for (const share of npcRewardShares(killerId, mapId, death)) {
      const accountId = share.pid.slice(2);
      const txKey = `npc:${serverRunId}:${deathKey}:${accountId}`;
      const reward = awardNpcKill(accountId, death.type, mapId, share.percent, share.pid === killerId, txKey);
      if (!reward) { complete = false; continue; }
      if (reward.duplicate) continue;
      sendToPeer(share.pid, {
        t: "npcReward", map: String(mapId), uid: String(death.uid), seq: Number(death.seq) || 0,
        killer: killerId, percent: share.percent, ...reward,
      });
      // Une part SQLite (~8 ms) peut deja depasser le budget : on sort pour
      // laisser respirer l'event loop, la suite passe au prochain tour.
      if (Date.now() - start >= budgetMs) { complete = false; break; }
    }
    // Une erreur SQLite transitoire sera retentee au tour suivant (en fin de
    // file pour ne pas bloquer les autres). Les parts deja commitees sont
    // protegees par npc_reward_tx et ignorees via duplicate.
    if (complete) rewardedNpcDeaths.set(deathKey, now);
    else pendingNpcRewards.push({ mapId, death });
  }
  if (pendingNpcRewards.length > 400) {
    try { console.log(`[multi:npc] file recompenses saturee (${pendingNpcRewards.length}), delestage des plus anciennes`); } catch {}
    pendingNpcRewards.splice(0, pendingNpcRewards.length - 400);
  }
}
setInterval(() => {
  try { pumpNpcRewards(12); } catch {}
}, 100);

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
  ws.send(JSON.stringify({ t: "welcome", id, authed: false }));

  ws.on("message", (raw) => {
    const rateNow = Date.now();
    if (rateNow - Number(state._msgRateAt || 0) >= 1000) {
      state._msgRateAt = rateNow;
      state._msgRateCount = 0;
    }
    state._msgRateCount = Number(state._msgRateCount || 0) + 1;
    if (state._msgRateCount > 250) {
      try { ws.close(1008, "Message rate exceeded"); } catch {}
      return;
    }
    let msg = null;
    try { msg = JSON.parse(String(raw)); } catch { return; }
    if (!msg || typeof msg !== "object") return;
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
        if (now - Number(shooter.npcHitWinT || 0) > 1000) { shooter.npcHitWinT = now; shooter.npcHitN = 0; }
        shooter.npcHitN = Number(shooter.npcHitN || 0) + 1;
        if (shooter.npcHitN > 100) return;
        const sim = npcSims.get(mapId);
        if (sim && typeof sim.applyHit === "function") {
          sim.applyHit(id, msg);
          // Diagnostic multi (console serveur) : hits recus par map.
          hitStats.count++;
          hitStats.byMap.set(mapId, (hitStats.byMap.get(mapId) || 0) + 1);
        }
      } catch {}
      return;
    }
    if (msg.t === "skillUse") {
      try {
        if (!authed || !accountId || state.instance === true) return;
        const room = rooms.get(mapId);
        if (!room || !room.has(id)) return;
        const skill = String(msg.skill || "").toLowerCase();
        if (skill !== "iem" && skill !== "ish") return;
        const now = Date.now();
        const cdKey = skill === "iem" ? "iemCdUntil" : "ishCdUntil";
        if (now < Number(state[cdKey] || 0)) return;
        state[cdKey] = now + 10_000;
        const until = now + 3_000;
        if (skill === "iem") {
          state.iemUntil = until;
          // L'IEM dissipe les ralentissements et gels déjà actifs. Ces champs
          // sont autoritaires : leur remise à zéro empêche un ancien effet de
          // revenir dans le snapshot suivant.
          state.slowPct = 0;
          state.slowUntil = 0;
          state.freezeUntil = 0;
          const sim = npcSims.get(mapId);
          if (sim && typeof sim.breakPlayerLocks === "function") sim.breakPlayerLocks(id, until);
        } else {
          state.ishUntil = until;
        }
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
        const now = Date.now();
        // Anti-rafale : 80 coups/s max par attaquant.
        if (now - Number(me.state.pvpWinT || 0) > 1000) { me.state.pvpWinT = now; me.state.pvpN = 0; }
        me.state.pvpN = Number(me.state.pvpN || 0) + 1;
        if (me.state.pvpN > 80) return;
        const dmg = Number(msg.dmg);
        const hasStatus = (Number(msg.slowPct) > 0 && Number(msg.slowSec) > 0) || Number(msg.freezeSec) > 0;
        if (!Number.isFinite(dmg) || dmg < 0 || dmg > 1e7 || (dmg === 0 && !hasStatus)) return;
        if (foe.state.dead) return;
        if (now < Number(foe.state.ishUntil || 0)) return;
        if (now < Number(foe.state.iemUntil || 0)) return;
        // Deja tue (pos de mort pas encore arrivee) : pas de double kill.
        if (foe.state.pvpDead === true) return;
        let wasAlive = Number(foe.state.hp) > 0;
        // Revive rate (reparation entre le pos et le tir) : rebase d'abord.
        if (!(Number(foe.state.hp) > 0)) {
          wasAlive = true; // le client est vivant : le kill compte si ce coup tue.
          const hm = Math.max(1, Number(foe.state.hpMax) || 1);
          const sm = Math.max(0, Number(foe.state.shMax) || 0);
          foe.state.hp = Math.max(0, Math.min(hm, hm * Math.max(0, Math.min(1, Number(foe.state.hpPct ?? 1)))));
          foe.state.sh = Math.max(0, Math.min(sm, sm * Math.max(0, Math.min(1, Number(foe.state.shPct ?? 1)))));
        }
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
          foe.state.slowPct = Math.max(Number(foe.state.slowPct) || 0, slowPct);
          foe.state.slowUntil = Math.max(Number(foe.state.slowUntil) || 0, now + slowSec * 1000);
        }
        if (freezeSec > 0) foe.state.freezeUntil = Math.max(Number(foe.state.freezeUntil) || 0, now + freezeSec * 1000);
        // Feed degats : la victime voit les chiffres (comme les NPC).
        if (applied > 0) {
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
              if (String(id).startsWith("u_")) recordPvpKill(String(id).slice(2), exp, honneur);
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
        if (foe.state.peta !== 1) return;
        const now = Date.now();
        // Le PET beneficie de la zone de non-agression de son proprietaire.
        if (foe.state.safe === true || me.state.safe === true) return;
        if (now - Number(me.state.pvpPetWinT || 0) > 1000) { me.state.pvpPetWinT = now; me.state.pvpPetN = 0; }
        me.state.pvpPetN = Number(me.state.pvpPetN || 0) + 1;
        if (me.state.pvpPetN > 80) return;
        const dmg = Number(msg.dmg);
        if (!Number.isFinite(dmg) || dmg <= 0 || dmg > 1e7) return;
        if (foe.state.petDead === true) return;
        let wasPetAlive = Number(foe.state.petPoolHp) > 0;
        if (!(Number(foe.state.petPoolHp) > 0)) {
          wasPetAlive = true;
          const hm = Math.max(1, Number(foe.state.petHpM) || 1);
          const sm = Math.max(0, Number(foe.state.petShM) || 0);
          foe.state.petPoolHp = Math.max(0, Math.min(hm, hm * Math.max(0, Math.min(1, Number(foe.state.petHp ?? 1)))));
          foe.state.petPoolSh = Math.max(0, Math.min(sm, sm * Math.max(0, Math.min(1, Number(foe.state.petSh ?? 1)))));
        }
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
          const fkey = `${foe.state.id}|pet|${id}`;
          let feed = pvpFeeds.get(mapId);
          if (!feed) { feed = new Map(); pvpFeeds.set(mapId, feed); }
          const prev = feed.get(fkey);
          feed.set(fkey, { uid: `pet:${String(foe.state.id)}`, by: String(id), total: Math.round((prev?.total || 0) + applied) });
        }
        if (Number(foe.state.petPoolHp) <= 0 && wasPetAlive !== false) {
          foe.state.petDead = true;
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
            const room = rooms.get(mapId);
            if (room) {
              if (room.has(id) && room.get(id)?.ws === ws) room.delete(id);
              const prev = room.get(stableId);
              if (prev && prev.ws !== ws) { try { prev.ws.close(); } catch {} }
              room.delete(stableId);
              state.id = stableId;
              id = stableId;
              room.set(id, { ws, state });
            } else {
              state.id = stableId;
              id = stableId;
            }
            accountId = String(who.id);
            authed = true;
            state.pseudo = String(who.pseudo || "Pilote").slice(0, 20);
            try { ws.send(JSON.stringify({ t: "welcome", id, authed: true })); } catch {}
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
              ws.send(JSON.stringify({
                t: "banned",
                reason: String(ban.reason || "Comportement inapproprié.").slice(0, 200),
                until: ban.until != null ? Number(ban.until) : null,
              }));
            }
          } catch {}
          removeFromAllRooms(id);
          const bannedWs = ws;
          setTimeout(() => { try { bannedWs.close(); } catch {} }, 800);
          return;
        }
      } catch {}
      const nextMap = String(msg.map || mapId || "1-1").toLowerCase();
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
        state._teleSkip = true; // portail : saut legitime
        roomFor(mapId).set(id, { ws, state });
        ensureNpcSim(mapId);
      } else {
        ensureNpcSim(mapId);
      }
      // Authentifie : pseudo du compte uniquement (declare ignore).
      if (!authed && typeof msg.pseudo === "string" && msg.pseudo.trim()) state.pseudo = String(msg.pseudo).slice(0, 20);
      if (typeof msg.shipId === "string" && msg.shipId) state.shipId = String(msg.shipId).slice(0, 64);
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
      if (authed && accountId) {
        sendFriendsSync(ws, accountId);
        try { notifyFriendPresence(accountId, true); } catch {}
      }
      try { socialPeerChanged(id, socialCtx()); } catch {}
      return;
    }
    if (msg.t === "ping") {
      // Heartbeat client (3 s) : preuve de vie, reprise après coupure.
      // Ne touche PAS updatedAt (l'expiration des silencieux reste à 10 s).
      // Le pong porte la version serveur : le client recharge tout seul
      // quand le jeu a été mis à jour (git pull + restart).
      try {
        ws.send(JSON.stringify({ t: "pong", t0: Math.max(0, Number(msg.t0) || 0), v: String(GAME_VERSION || "") }));
      } catch {}
      if (authed && accountId && Date.now() - Number(state._friendsSyncAt || 0) >= 15_000) {
        state._friendsSyncAt = Date.now();
        sendFriendsSync(ws, accountId);
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
    if (msg.t === "pos") {
      // Instance perso : aucune présence partagée (le client ne devrait
      // déjà plus envoyer de pos en gate).
      if (state.instance === true) return;
      // Anti-cheat positions : deplacement credible vs vmax declaree
      // (plafonnee). Rejet doux (on garde l'ancienne position) + log,
      // jamais de kick (lags = faux positifs).
      // Auto-guerison : un point rejete mais STABLE 5x de suite (= 0.5 s,
      // reaparition base/portail same-map que le serveur n'a pas vue)
      // est accepte. Un speed-hacker (jamais stable) reste bloque.
      if (Number.isFinite(Number(msg.vmax))) state.vmax = Math.max(50, Math.min(5000, Math.round(Number(msg.vmax))));
      const declaredVmax = Math.max(50, Math.min(5000, Number(state.vmax) || 400));
      const nextVx = Number(msg.vx), nextVy = Number(msg.vy);
      if (Number.isFinite(nextVx) && Number.isFinite(nextVy)) {
        const speed = Math.hypot(nextVx, nextVy);
        const scale = speed > declaredVmax * 1.25 ? (declaredVmax * 1.25) / speed : 1;
        state.vx = nextVx * scale;
        state.vy = nextVy * scale;
      }
      const nx = Number(msg.x), ny = Number(msg.y);
      if (Number.isFinite(nx) && Number.isFinite(ny)) {
        const legitJump = state._teleSkip === true || state._posOk !== true || (state.dead === true && msg.dead !== true);
        state._teleSkip = false;
        if (legitJump) {
          state.x = nx;
          state.y = ny;
          state._posOk = true;
          state._rejPos = null;
        } else {
          const dt = Math.max(0.05, Math.min(3, (Date.now() - Number(state.updatedAt || 0)) / 1000));
          const vmax = Math.max(50, Math.min(5000, Number(state.vmax) || 400));
          const allowed = vmax * dt * 1.6 + 600;
          const dx = nx - Number(state.x), dy = ny - Number(state.y);
          if (dx * dx + dy * dy <= allowed * allowed) {
            state.x = nx;
            state.y = ny;
            state._rejPos = null;
          } else {
            const prev = state._rejPos;
            const sameSpot = prev && (nx - prev.x) * (nx - prev.x) + (ny - prev.y) * (ny - prev.y) <= 300 * 300;
            const n = sameSpot ? Number(prev.n || 0) + 1 : 1;
            if (n >= 5) {
              // Stable : reaparition legitime ratee, on resynchronise.
              state.x = nx;
              state.y = ny;
              state._rejPos = null;
              state.teleHeal = Number(state.teleHeal || 0) + 1;
              try { console.log(`[multi:anticheat] resync ${state.pseudo} (${Math.round(Math.hypot(dx, dy))}u, stable)`); } catch {}
            } else {
              state._rejPos = { x: nx, y: ny, n };
              state.teleWarn = Number(state.teleWarn || 0) + 1;
              if (state.teleWarn % 20 === 1) {
                try { console.log(`[multi:anticheat] teleport suspect ${state.pseudo} (${Math.round(Math.hypot(dx, dy))}u en ${Math.round(dt * 1000)}ms, vmax ${vmax})`); } catch {}
              }
            }
          }
        }
      }
      if (Number.isFinite(Number(msg.angle))) state.angle = Number(msg.angle);
      if (typeof msg.shipId === "string" && msg.shipId) state.shipId = String(msg.shipId).slice(0, 64);
      if (!authed && typeof msg.pseudo === "string" && msg.pseudo.trim()) state.pseudo = String(msg.pseudo).slice(0, 20);
      if (typeof msg.dead === "boolean") state.dead = msg.dead;
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
      if (Number.isFinite(Number(msg.absorb))) state.absorb = Math.max(0, Math.min(1, Number(msg.absorb)));
      if (Number.isFinite(Number(msg.evade))) state.evade = Math.max(0, Math.min(0.9, Number(msg.evade)));
      if (Number.isFinite(Number(msg.tx))) state.tx = Math.round(Number(msg.tx));
      if (Number.isFinite(Number(msg.ty))) state.ty = Math.round(Number(msg.ty));
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
      if (Number.isFinite(Number(msg.hpMax)) && Number(msg.hpMax) > 0) {
        const hm = Math.min(MAX_PLAYER_COMBAT_LAYER, Math.round(Number(msg.hpMax)));
        const sm = Math.min(MAX_PLAYER_COMBAT_LAYER, Math.round(Number(msg.shMax) || 0));
        const cHp = Math.max(0, Math.min(hm, hm * Math.max(0, Math.min(1, Number(msg.hpPct ?? 1)))));
        const cSh = Math.max(0, Math.min(sm, sm * Math.max(0, Math.min(1, Number(msg.shPct ?? 1)))));
        if (!state._init || hm !== state.hpMax || sm !== state.shMax) {
          state.hpMax = hm;
          state.shMax = sm;
          state.hp = cHp;
          state.sh = cSh;
          state._init = true;
          state.pvpDead = false;
        } else if (state.dead === true) {
          state.hp = 0;
          state.sh = 0;
        } else if (!(state.hp > 0)) {
          // Revive (reparation) : le client est vivant avec des PV.
          state.hp = cHp;
          state.sh = cSh;
          state.pvpDead = false;
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
            state.hp = Math.min(hm, cHp);
          }
          if (cSh < state.sh) state.sh = cSh;
          else if (cSh > state.sh && !blocked) {
            if (sm > 0 && cSh - state.sh > sm * 0.5) {
              state.healWarn = Number(state.healWarn || 0) + 1;
              if (state.healWarn % 10 === 1) {
                try { console.log(`[multi:anticheat] soin suspect ${state.pseudo} (+${Math.round(cSh - state.sh)} SH en un pos, max ${sm})`); } catch {}
              }
            }
            state.sh = Math.min(sm, cSh);
          }
        }
      }
      if (Number.isFinite(Number(msg.range))) state.range = Math.max(200, Math.min(5000, Number(msg.range)));
      if (msg.peta === 1 || msg.peta === 0) state.peta = msg.peta === 1 ? 1 : 0;
      if (Number.isFinite(Number(msg.petl))) state.petl = Math.max(1, Math.min(32, Math.round(Number(msg.petl))));
      if (Number.isFinite(Number(msg.petx))) state.petx = Math.round(Number(msg.petx));
      if (Number.isFinite(Number(msg.pety))) state.pety = Math.round(Number(msg.pety));
      if (Number.isFinite(Number(msg.petd))) state.petd = Math.round(Number(msg.petd) * 100) / 100;
      if (typeof msg.petn === "string") state.petn = String(msg.petn).slice(0, 32);
      if (typeof msg.petf === "string") state.petf = String(msg.petf).slice(0, 16);
      // PV du PET (lock info allie) : 0..1 declare, jamais de montee serveur.
      if (Number.isFinite(Number(msg.petHp))) state.petHp = Math.max(0, Math.min(1, Number(msg.petHp)));
      if (Number.isFinite(Number(msg.petSh))) state.petSh = Math.max(0, Math.min(1, Number(msg.petSh)));
      // Pool PV du PET (degats PvP) : meme regles que le pool joueur.
      if (Number.isFinite(Number(msg.petHpMax)) && Number(msg.petHpMax) > 0) {
        const phm = Math.min(50_000_000, Math.round(Number(msg.petHpMax)));
        const psm = Math.min(50_000_000, Math.round(Number(msg.petShMax) || 0));
        const cPHp = Math.max(0, Math.min(phm, phm * Math.max(0, Math.min(1, Number(msg.petHp ?? 1)))));
        const cPSh = Math.max(0, Math.min(psm, psm * Math.max(0, Math.min(1, Number(msg.petSh ?? 1)))));
        if (!state._petInit || phm !== state.petHpM || psm !== state.petShM) {
          state.petHpM = phm;
          state.petShM = psm;
          state.petPoolHp = cPHp;
          state.petPoolSh = cPSh;
          state._petInit = true;
          state.petDead = false;
        } else if (!(cPHp > 0)) {
          state.petPoolHp = 0;
          state.petPoolSh = 0;
        } else if (!(state.petPoolHp > 0)) {
          // Reparation du PET : le client est en vie avec des PV.
          state.petPoolHp = cPHp;
          state.petPoolSh = cPSh;
          state.petDead = false;
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
      }
      if (typeof msg.map === "string" && msg.map.toLowerCase() !== mapId) {
        removeFromAllRooms(id);
        mapId = String(msg.map).toLowerCase();
        state._teleSkip = true; // portail : saut legitime
        roomFor(mapId).set(id, { ws, state });
        sendBoxSync(ws, mapId);
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
  ws.on("close", () => { allWs.delete(ws); chatLastById.delete(id); friendPingLast.delete(id); onPeerGone(); removeFromAllRooms(id); });
  ws.on("error", () => { try { ws.close(); } catch {} allWs.delete(ws); chatLastById.delete(id); friendPingLast.delete(id); onPeerGone(); removeFromAllRooms(id); });
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
    const taken = [...set.values()].map((b) => ({ x: b.x, y: b.y }));
    for (let i = queue.length - 1; i >= 0; i--) {
      const pending = queue[i];
      if (!pending || Number(pending.at) > now) continue;
      queue.splice(i, 1);
      if (set.has(pending.uid)) continue;
      const cfg = COLLECTABLE_TYPES[pending.type] || {};
      const pos = randomBoxPosition(sim && typeof sim.then !== "function" ? sim : null, taken, Math.max(0, Number(cfg.minSpacing) || 0));
      taken.push(pos);
      const box = { type: pending.type, ...pos };
      set.set(pending.uid, box);
      const room = rooms.get(mapId);
      if (room?.size) broadcastRoom(room, JSON.stringify({ t: "box", op: "spawn", box: { uid: pending.uid, ...box } }));
    }
    if (!queue.length) boxRespawns.delete(mapId);
  }
}, 250);

// Broadcast + simu NPC 20 Hz par room, uniquement aux sockets ouvertes.
// Les NPC loin de tous les joueurs voyagent a 10 Hz ; leur simulation reste
// a 20 Hz et les NPC actifs/proches restent toujours dans chaque snapshot.
let snapshotTick = 0;
setInterval(() => {
  const now = Date.now();
  const fullNpcTick = (++snapshotTick & 1) === 0;
  const fullPlayerTick = fullNpcTick;
  const includePlayerStatic = snapshotTick % PLAYER_STATIC_REFRESH_TICKS === 0;
  for (const [key, room] of rooms) {
    if (!room.size) continue;
    // Expire les joueurs silencieux depuis > 10 s (onglet ferme sans close propre).
    for (const [pid, entry] of room) {
      if (now - Number(entry?.state?.updatedAt || 0) > 10000) {
        try { announceLeave(pid); } catch {}
        room.delete(pid);
        try {
          const goneState = entry?.state || {};
          socialPeerGone(String(pid), {
            id: String(pid), state: goneState, authed: String(pid).startsWith("u_"),
            send: () => {},
            sendTo: (to, obj) => sendToPeer(to, obj),
            findByPseudo: (pseudo) => findPeerByPseudo(pseudo),
            // Pair déjà retiré de la room : fiche locale d'abord.
            describe: (p) => (String(p) === String(pid)
              ? { id: String(pid), pseudo: String(goneState.pseudo || "Pilote").slice(0, 20), map: key, online: false }
              : describePeer(p)),
          });
        } catch {}
        try {
          if (String(pid).startsWith("u_")) notifyFriendPresence(String(pid).slice(2), false);
        } catch {}
      }
    }
    if (!room.size) continue;
    // Simu NPC : positions des joueurs pour la poursuite, tick, snapshot.
    let npc = { list: [], deaths: [], dmg: [] };
    try {
      const sim = npcSims.get(key);
      if (sim && typeof sim.tick === "function") {
        for (const [pid, entry] of room) {
          const s = entry?.state;
          // Anti-fantôme : jamais positionné (chargement, pas de pos)
          // = ignoré par la simu NPC (ni poursuite ni ciblage).
          if (s && s._posOk === true) {
            const serverSafe = typeof sim.inSafe === "function" ? sim.inSafe(s.x, s.y) : false;
            s.serverSafe = serverSafe && s.safe === true;
            const serverDead = s.pvpDead === true || !(Number(s.hp) > 0);
            sim.setPlayer(pid, s.x, s.y, { dead: serverDead, safe: s.serverSafe, untargetableUntil: s.iemUntil });
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
            if (s.serverSafe === true) continue;
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
            if (s.hp <= 0) s.pvpDead = true;
          }
          for (const s of npcHitVictims) {
            s.npcSeq = Math.max(0, Math.floor(Number(s.npcSeq) || 0)) + 1;
            s.npcDamage = Math.max(0, Math.round(Number(s.npcDamage) || 0));
            s.npcHpDamage = Math.max(0, Math.round(Number(s.npcHpDamage) || 0));
            s.npcShDamage = Math.max(0, Math.round(Number(s.npcShDamage) || 0));
          }
        }
        npc = sim.snapshot();
        // Recompenses filees hors boucle chaude (SQLite ~8 ms/part) : le
        // client attend le gain avant d'afficher l'explosion, delai invisible.
        awardNpcDeaths(key, npc.deaths);
      } else if (sim === undefined) {
        ensureNpcSim(key);
      }
    } catch {}
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
      players.push({ id: s.id, pseudo: s.pseudo, shipId: s.shipId, x: Math.round(s.x), y: Math.round(s.y), vx: Math.round((Number(s.vx) || 0) * 100) / 100, vy: Math.round((Number(s.vy) || 0) * 100) / 100, vmax: Math.max(50, Math.min(5000, Math.round(Number(s.vmax) || 400))), angle: Number(s.angle) || 0, dead: s.dead === true, hpPct: s.hpPct ?? 1, shPct: s.shPct ?? 1, collectUid: String(s.collectUid || "").slice(0, 64), collectPet: s.collectPet === true, bg: s.bg === true, atk: s.atk === true, tx: Math.round(Number(s.tx) || 0), ty: Math.round(Number(s.ty) || 0), ammo: String(s.ammo || "x1").slice(0, 16), drones: Number(s.drones) || 0, dform: String(s.dform || "standard").slice(0, 32), fint: Number(s.fint) || 0.25, bspd: Math.round(Number(s.bspd) || 4000), dslots: String(s.dslots || ""), alt: s.alt === true, shots: Math.max(0, Math.floor(Number(s.shots) || 0)), rank: String(s.rank || ""), firm: String(s.firm || ""), dind: String(s.dind || ""), ficon: String(s.ficon || ""), mind: String(s.mind || ""), rseq: Math.max(0, Math.floor(Number(s.rseq) || 0)), rkind: String(s.rkind || "r310").slice(0, 16), rspd: Math.round(Number(s.rspd) || 1500),
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
      const staticSignature = [output.pseudo, output.shipId, output.drones, output.dform, output.dslots,
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
    let npcForNetwork = npc;
    if (!fullNpcTick && Array.isArray(npc?.list) && npc.list.length) {
      const nearRadiusSq = NPC_NEAR_PLAYER_RADIUS * NPC_NEAR_PLAYER_RADIUS;
      const damaged = new Set(Array.isArray(npc.dmg) ? npc.dmg.map((entry) => String(entry?.uid || "")) : []);
      const activeList = npc.list.filter((entry) => {
        if (!entry || entry.alive === false || entry.aggro != null || entry.cube || damaged.has(String(entry.uid || ""))) return true;
        if (Number(entry.slowT) > 0 || Number(entry.freezeT) > 0) return true;
        const nx = Number(entry.x) || 0, ny = Number(entry.y) || 0;
        for (const playerState of players) {
          const dx = nx - Number(playerState.x || 0), dy = ny - Number(playerState.y || 0);
          if (dx * dx + dy * dy <= nearRadiusSq) return true;
        }
        return false;
      });
      npcForNetwork = { ...npc, list: activeList };
    }
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

for (const signal of ["SIGINT", "SIGTERM"]) {
  // Arrêt franc : coupe les connexions (sinon server.close attend les
  // joueurs connectés et le reboot/Ctrl+C reste bloqué 90 s).
  process.on(signal, () => {
    try { server.closeAllConnections?.(); } catch {}
    try { wss.close?.(() => {}); } catch {}
    try { server.close(() => process.exit(0)); } catch { process.exit(0); }
    setTimeout(() => process.exit(0), 2000).unref?.();
  });
}
