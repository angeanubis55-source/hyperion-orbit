import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { WebSocketServer } from "ws";
import { ZoneNpcSim } from "./NPC_ROOM.js";
import { damagePlayerLayers } from "../COMBAT/COMBAT_RULES.js";
import { handleAccountApi, verifyWsToken, recordPvpKill } from "./ACCOUNT_SERVER.js";

const root = resolve(process.cwd());
const portArg = process.argv.find((arg) => arg.startsWith("--port="))?.slice(7);
const PORT = Number(portArg || process.env.PORT || 8080) || 8080;

// --- Panneau admin (/admin.html) : mot de passe via ORBIT_ADMIN_PASS,
// sinon genere aleatoirement et affiche dans la console (jamais dans git).
const ADMIN_PASS = String(process.env.ORBIT_ADMIN_PASS || "").trim() || `admin_${randomBytes(8).toString("hex")}`;
const chatMutes = new Set(); // ids prives de chat (persistants, ids stables)
function adminAuthed(request) {
  const tok = String(request.headers?.["x-admin-token"] || "").trim();
  return tok !== "" && tok.length <= 256 && tok === ADMIN_PASS;
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
    adminJson(response, 200, { ok: true, peers, count: peers.length });
    return true;
  }
  if ((pathname === "/api/admin/broadcast" || pathname === "/api/admin/kick" || pathname === "/api/admin/mute") && request.method === "POST") {
    readJsonBody(request).then((body) => {
      try {
        if (pathname === "/api/admin/broadcast") {
          const text = String(body?.text || "").replace(/\s+/g, " ").trim().slice(0, 200);
          if (!text) { adminJson(response, 400, { ok: false, error: "Message vide." }); return; }
          const entry = { from: "[ADMIN]", text, at: Date.now(), by: "admin" };
          chatHistory.push(entry);
          if (chatHistory.length > 40) chatHistory.splice(0, chatHistory.length - 40);
          broadcastAll(JSON.stringify({ t: "chatMsg", ...entry }));
          adminJson(response, 200, { ok: true });
          return;
        }
        const pid = String(body?.id || "");
        if (!pid) { adminJson(response, 400, { ok: false, error: "Id manquant." }); return; }
        if (pathname === "/api/admin/kick") {
          let found = false;
          for (const room of rooms.values()) {
            const entry = room.get(pid);
            if (entry && entry.ws) { found = true; try { entry.ws.close(); } catch {} }
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
    const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
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

// --- Multi minimal Etape 1 : rooms par map, broadcast positions 10 Hz ---
// Etape 3 : simu NPC serveur par map zone (positions, HP, mort, killer).
// Protocole (JSON) :
//  client -> serveur : { t:"hello", map, pseudo, shipId } puis { t:"pos", x,y,angle,shipId,pseudo,dead,hpPct,shPct,atk,tx,ty },
//    { t:"map", map } et { t:"hit", uid, dmg, pen, critChance, critMult, weaken, kind }
//  serveur -> client : { t:"welcome", id } puis { t:"snapshot", players:[...], npc:[...] } 10x/s
const wss = new WebSocketServer({ noServer: true });
const rooms = new Map(); // mapId(lower) -> Map(id -> { ws, state })
const npcSims = new Map(); // mapId(lower) -> ZoneNpcSim | null | Promise
const boxRooms = new Map(); // mapId(lower) -> Map(uid -> { type, x, y, by })
const pvpFeeds = new Map(); // mapId(lower) -> Map("victime|attaquant" -> { uid, by, total })
const pvpFarm = new Map(); // anti-farm : "tueur|victime" -> { n, t0 } (rendement decroissant 60 min)
const chatHistory = []; // global : [{ from, text, at }] (40 derniers)
const chatLastById = new Map(); // anti-spam : id -> timestamp dernier message
const hitStats = { count: 0, byMap: new Map() }; // diagnostic multi
setInterval(() => {
  if (hitStats.count > 0) {
    const detail = [...hitStats.byMap.entries()].map(([m, n]) => `${m}:${n}`).join(" ");
    console.log(`[multi:npc] hits recus: ${hitStats.count} (${detail})`);
  }
  hitStats.count = 0;
  hitStats.byMap.clear();
}, 30000);
let nextId = 1;

function roomHostId(room) {
  let best = null;
  for (const pid of room.keys()) {
    if (best == null || String(pid) < String(best)) best = pid;
  }
  return best;
}

function boxSet(mapId) {
  const key = String(mapId || "1-1").toLowerCase();
  if (!boxRooms.has(key)) boxRooms.set(key, new Map());
  return boxRooms.get(key);
}

function broadcastRoom(room, payload, excludeId = null) {
  for (const [pid, entry] of room) {
    if (excludeId != null && String(pid) === String(excludeId)) continue;
    try { if (entry.ws.readyState === 1) entry.ws.send(payload); } catch {}
  }
}

// Chat global : toutes les maps (le salon est commun au serveur).
function broadcastAll(payload) {
  for (const room of rooms.values()) broadcastRoom(room, payload);
}

// Retire les box posees par un joueur parti + previent la room.
function dropPlayerBoxes(mapId, pid) {
  try {
    const set = boxRooms.get(String(mapId || "").toLowerCase());
    if (!set) return;
    const gone = [];
    for (const [uid, b] of set) {
      if (String(b?.by) === String(pid)) { set.delete(uid); gone.push(uid); }
    }
    if (gone.length) {
      const room = rooms.get(String(mapId || "").toLowerCase());
      if (room && room.size) {
        broadcastRoom(room, JSON.stringify({ t: "box", op: "unspawn", uids: gone.slice(0, 200) }));
      }
    }
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

function removeFromAllRooms(id) {
  for (const [mkey, room] of rooms) {
    if (room.delete(id)) dropPlayerBoxes(mkey, id);
  }
  // Menage : set de box vide si room vide.
  for (const [mkey, room] of rooms) {
    if (!room.size) boxRooms.delete(mkey);
  }
}

server.on("upgrade", (request, socket, head) => {
  const url = new URL(request.url || "/ws", "http://localhost");
  if (!url.pathname.startsWith("/ws")) {
    socket.destroy();
    return;
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
    hpMax: 1, shMax: 0, hp: 1, sh: 0, range: 800, pvpAt: 0, pvpFrom: null, pvpWin: 0, pvpWinT: 0 };
  roomFor(mapId).set(id, { ws, state });
  ws.send(JSON.stringify({ t: "welcome", id, authed: false }));

  ws.on("message", (raw) => {
    let msg = null;
    try { msg = JSON.parse(String(raw)); } catch { return; }
    if (!msg || typeof msg !== "object") return;
    if (msg.t === "box") {
      // Bonus box partagees : l'hote (plus petit id) publie la liste,
      // n'importe qui signale une collecte (premier arrive).
      try {
        const room = rooms.get(mapId);
        if (!room || !room.has(id)) return;
        const set = boxSet(mapId);
        if (msg.op === "collect" && typeof msg.uid === "string") {
          const uid = msg.uid.slice(0, 64);
          if (set.delete(uid)) {
            broadcastRoom(room, JSON.stringify({ t: "box", op: "collect", uid }), id);
          }
          return;
        }
        if (roomHostId(room) !== id) return;
        if (msg.op === "list" && Array.isArray(msg.boxes)) {
          const next = new Map();
          for (const b of msg.boxes.slice(0, 200)) {
            if (!b || typeof b.uid !== "string" || typeof b.type !== "string") continue;
            if (!Number.isFinite(Number(b.x)) || !Number.isFinite(Number(b.y))) continue;
            next.set(b.uid.slice(0, 64), { type: String(b.type).slice(0, 32), x: Math.round(Number(b.x)), y: Math.round(Number(b.y)), by: id });
          }
          boxRooms.set(mapId, next);
          broadcastRoom(room, JSON.stringify({
            t: "box", op: "list", by: id,
            boxes: [...next].slice(0, 200).map(([uid, b]) => ({ uid, type: b.type, x: b.x, y: b.y })),
          }), id);
        }
      } catch {}
      return;
    }
    if (msg.t === "hit") {
      // Degats sur NPC partage : le serveur tranche (HP, mort, killer).
      try {
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
    if (msg.t === "pvpHit") {
      // PvP : degats d'un joueur sur un autre, tranches ici.
      try {
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
        if (!Number.isFinite(dmg) || dmg <= 0 || dmg > 1e7) return;
        if (foe.state.dead) return;
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
          const res = damagePlayerLayers(foe.state, dmg, 0.8, pen, 0);
          applied = Number(res?.total) || 0;
          foe.state.hp = Math.max(0, Number(foe.state.hp) || 0);
          foe.state.sh = Math.max(0, Number(foe.state.sh) || 0);
        }
        foe.state.pvpAt = now;
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
    if (msg.t === "shot" || msg.t === "rshot") {      // Tirs allies : retransmis tels quels a la room (aucun etat).
      try {
        const room = rooms.get(mapId);
        if (!room || !room.has(id)) return;
        const out = { t: msg.t, by: id, map: mapId };
        if (typeof msg.key === "string") out.key = String(msg.key).slice(0, 16);
        if (typeof msg.kind === "string") out.kind = String(msg.kind).slice(0, 16);
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
      const nextMap = String(msg.map || mapId || "1-1").toLowerCase();
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
      try {
        const set = boxRooms.get(mapId);
        const boxes = set ? [...set].slice(0, 200).map(([uid, b]) => ({ uid, type: b.type, x: b.x, y: b.y })) : [];
        ws.send(JSON.stringify({ t: "boxesSync", map: mapId, boxes }));
      } catch {}
      // Historique du chat global pour le nouveau venu.
      try {
        ws.send(JSON.stringify({ t: "chatHistory", list: chatHistory.slice(-30) }));
      } catch {}
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
    if (msg.t === "pos") {
      // Anti-cheat positions : deplacement credible vs vmax declaree
      // (plafonnee). Rejet doux (on garde l'ancienne position) + log,
      // jamais de kick (lags = faux positifs).
      // Auto-guerison : un point rejete mais STABLE 5x de suite (= 0.5 s,
      // reaparition base/portail same-map que le serveur n'a pas vue)
      // est accepte. Un speed-hacker (jamais stable) reste bloque.
      if (Number.isFinite(Number(msg.vmax))) state.vmax = Math.max(50, Math.min(5000, Math.round(Number(msg.vmax))));
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
      if (typeof msg.hidden === "boolean") state.hidden = msg.hidden;
      if (Number.isFinite(Number(msg.hpPct))) state.hpPct = Math.max(0, Math.min(1, Number(msg.hpPct)));
      if (Number.isFinite(Number(msg.shPct))) state.shPct = Math.max(0, Math.min(1, Number(msg.shPct)));
      if (typeof msg.atk === "boolean") state.atk = msg.atk;
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
      // - Jamais de montee via pos (anti-triche), sauf revive et nouveau max.
      // - Cliquet bas : les degats NPC locaux repercutent (sinon dieu du PvP).
      if (Number.isFinite(Number(msg.hpMax)) && Number(msg.hpMax) > 0) {
        const hm = Math.min(50_000_000, Math.round(Number(msg.hpMax)));
        const sm = Math.min(50_000_000, Math.round(Number(msg.shMax) || 0));
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
          if (cHp < state.hp) state.hp = cHp;
          if (cSh < state.sh) state.sh = cSh;
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
      if (typeof msg.map === "string" && msg.map.toLowerCase() !== mapId) {
        removeFromAllRooms(id);
        mapId = String(msg.map).toLowerCase();
        state._teleSkip = true; // portail : saut legitime
        roomFor(mapId).set(id, { ws, state });
        try {
          const set = boxRooms.get(mapId);
          const boxes = set ? [...set].slice(0, 200).map(([uid, b]) => ({ uid, type: b.type, x: b.x, y: b.y })) : [];
          ws.send(JSON.stringify({ t: "boxesSync", map: mapId, boxes }));
        } catch {}
      }
      state.updatedAt = Date.now();
    }
  });

  ws.on("close", () => { chatLastById.delete(id); removeFromAllRooms(id); });
  ws.on("error", () => { try { ws.close(); } catch {} chatLastById.delete(id); removeFromAllRooms(id); });
});

// Broadcast + simu NPC 10 Hz par room, uniquement aux sockets ouvertes.
setInterval(() => {
  const now = Date.now();
  for (const [key, room] of rooms) {
    if (!room.size) continue;
    // Expire les joueurs silencieux depuis > 10 s (onglet ferme sans close propre).
    for (const [pid, entry] of room) {
      if (now - Number(entry?.state?.updatedAt || 0) > 10000) {
        room.delete(pid);
        dropPlayerBoxes(key, pid);
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
          if (s) sim.setPlayer(pid, s.x, s.y, { dead: s.dead === true, safe: s.safe === true, hidden: s.hidden === true });
        }
        sim.tick(0.1);
        npc = sim.snapshot();
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
      players.push({ id: s.id, pseudo: s.pseudo, shipId: s.shipId, x: Math.round(s.x), y: Math.round(s.y), angle: Number(s.angle) || 0, dead: s.dead === true, hpPct: s.hpPct ?? 1, shPct: s.shPct ?? 1, atk: s.atk === true, tx: Math.round(Number(s.tx) || 0), ty: Math.round(Number(s.ty) || 0), ammo: String(s.ammo || "x1").slice(0, 16), drones: Number(s.drones) || 0, dform: String(s.dform || "standard").slice(0, 32), fint: Number(s.fint) || 0.25, bspd: Math.round(Number(s.bspd) || 4000), dslots: String(s.dslots || ""), alt: s.alt === true, shots: Math.max(0, Math.floor(Number(s.shots) || 0)), rank: String(s.rank || ""), firm: String(s.firm || ""), dind: String(s.dind || ""), ficon: String(s.ficon || ""), mind: String(s.mind || ""), rseq: Math.max(0, Math.floor(Number(s.rseq) || 0)), rkind: String(s.rkind || "r310").slice(0, 16), rspd: Math.round(Number(s.rspd) || 1500),
        // PvP : PV autoritaires + date du dernier coup recu + attaquant (anneau Ship_damage).
        pvpAt: Number(s.pvpAt) || 0, pvpFrom: s.pvpFrom != null ? String(s.pvpFrom) : null, pvpHp: Math.max(0, Math.round(Number(s.hp) || 0)), pvpSh: Math.max(0, Math.round(Number(s.sh) || 0)),
        hpMax: Math.max(1, Math.round(Number(s.hpMax) || 1)), shMax: Math.max(0, Math.round(Number(s.shMax) || 0)),
        range: Math.max(200, Math.min(5000, Number(s.range) || 800)),
        peta: s.peta === 1 ? 1 : 0, petl: Math.max(1, Math.min(32, Math.round(Number(s.petl) || 1))),
        petx: Math.round(Number(s.petx) || 0), pety: Math.round(Number(s.pety) || 0),
        petd: Math.round(Number(s.petd || 0) * 100) / 100,
        petn: String(s.petn || "").slice(0, 32), petf: String(s.petf || "").slice(0, 16),
        safe: s.safe === true });
    }
    const payload = JSON.stringify({ t: "snapshot", map: key, players, npc, host: roomHostId(room) });
    for (const [, entry] of room) {
      try { if (entry.ws.readyState === 1) entry.ws.send(payload); } catch {}
    }
  }
}, 100);

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[multi] HTTP+WS sur http://0.0.0.0:${PORT}/  (WS: /ws)`);
  if (process.env.ORBIT_ADMIN_PASS) console.log("[multi] Panneau admin : /admin.html (pass ORBIT_ADMIN_PASS)");
  else console.log(`[multi] Panneau admin : /admin.html (mot de passe : ${ADMIN_PASS})`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
