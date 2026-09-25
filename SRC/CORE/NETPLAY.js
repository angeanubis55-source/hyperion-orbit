// SRC/CORE/NETPLAY.js — Etape 1 multi : se voir a 2 sur la meme map.
// Solo-safe : si le WS est injoignable, le jeu continue en solo sans erreur.
// Protocole compatible SCRIPTS/MULTI_SERVER.js (rooms par map, snapshot 20 Hz).

let ws = null;
let myId = "";
let connected = false;
// Authentifie (token compte envoye au hello) : id stable, pseudo du compte.
let netAuthed = false;
export function netIsAuthed() {
  return netAuthed;
}
function netToken() {
  try { return String(localStorage.getItem("orbit_token") || ""); } catch { return ""; }
}
// Instance privee (ex : Galaxy Gates) : ni envoi ni etat partage.
let suspended = false;
export function suspendNetplay(v) {
  const nv = v === true;
  if (nv === suspended) return;
  suspended = nv;
  if (nv) {
    remotes.clear();
    netNpcs.clear();
    netDeaths.clear();
    netGone = [];
    netBoxes.clear();
    netBoxInbox.length = 0;
    pendingNetBoxClaims.clear();
    netDmgInbox.length = 0;
    netShotInbox.length = 0;
    netPvpKillInbox.length = 0;
    netNpcRewardInbox.clear();
    netPvpPetKillInbox.length = 0;
    netPvpLootInbox.length = 0;
    netPvpLootTakeInbox.length = 0;
    netAdminKickInbox.length = 0;
    netAdminBoomInbox.length = 0;
    netAuctionInbox.length = 0;
    netGroup = null;
    netGroupInviteInbox.length = 0;
    netGroupNoticeInbox.length = 0;
    netWhisperInbox.length = 0;
    netFriendRequestInbox.length = 0;
    netFriendsDirty = false;
    netFriendsOnline = [];
    lastNpcSnapMs = 0;
    try { if (ws && ws.readyState === 1) ws.close(); } catch {}
    ws = null;
    connectTried = false;
    connected = false;
    netAuthed = false;
    lastLatencyMs = null;
    netChatInbox.length = 0;
  }
}
export function netSuspended() {
  return suspended;
}
// Instance perso (Galaxy Gates) : socket GARDÉ pour les canaux globaux
// (tchat, enchères), gameplay partagé coupé (pas de présence, pas de
// NPC/PvP distants). Le gameplay gate reste 100 % local comme avant.
let instanceMode = false;
export function netInInstance() {
  return instanceMode === true;
}
export function netConnected() {
  try {
    return connected === true && !!ws && ws.readyState === 1;
  } catch {
    return false;
  }
}
// Heartbeat (vrai jeu multi) : ping 3 s serveur -> pong.
// lastPongMs = preuve de vie ; lastHelloAckMs = hello traité (sas d'entrée).
let lastPongMs = 0;
let lastHelloAckMs = 0;
let lastLatencyMs = null;
// Version du serveur (pong) : le moteur recharge la page si elle diffère
// de celle du boot (mise à jour déployée : git pull + restart serveur).
let srvVersionSeen = "";
export function netServerVersion() {
  return srvVersionSeen;
}
export function netLatencyMs() {
  return netConnected() && Number.isFinite(lastLatencyMs) ? lastLatencyMs : null;
}
export function netPongAge() {
  try {
    if (!lastPongMs) return Infinity;
    return Math.max(0, Date.now() - lastPongMs);
  } catch {
    return Infinity;
  }
}
export function netHelloAckAge() {
  try {
    if (!lastHelloAckMs) return Infinity;
    return Math.max(0, Date.now() - lastHelloAckMs);
  } catch {
    return Infinity;
  }
}
export function sendPing() {
  if (suspended) return false;
  if (!ws || ws.readyState !== 1) return false;
  try {
    ws.send(JSON.stringify({ t: "ping", t0: Date.now() }));
    return true;
  } catch {
    return false;
  }
}
// Reconnexion volontaire (sas / écran de reconnexion) : casse le socket
// douteux puis relance le cycle (hello auto à l'ouverture).
export function forceNetReconnect() {
  try {
    connectTried = false;
    connected = false;
    netAuthed = false;
    try {
      if (ws) ws.close();
    } catch {}
    ws = null;
  } catch {}
  try {
    ensureNetplayConnection();
  } catch {}
}
// Purge du gameplay partagé à l'entrée en instance (distants, NPC, box,
// tirs, PvP) : tchat + enchères conservés, socket conservé.
function clearInstanceGameplay() {
  remotes.clear();
  netNpcs.clear();
  netDeaths.clear();
  netGone = [];
  netBoxes.clear();
  netBoxInbox.length = 0;
  netDmgInbox.length = 0;
  netShotInbox.length = 0;
  netSkillInbox.length = 0;
  netPvpKillInbox.length = 0;
  netNpcRewardInbox.clear();
  netPvpPetKillInbox.length = 0;
  netPvpLootInbox.length = 0;
  netPvpLootTakeInbox.length = 0;
  netAdminKickInbox.length = 0;
  netAdminBoomInbox.length = 0;
  selfServ = null;
  lastNpcSnapMs = 0;
}
export function setNetInstanceMode(v) {
  const nv = v === true;
  if (nv === instanceMode) return;
  instanceMode = nv;
  if (nv) {
    try {
      clearInstanceGameplay();
    } catch {}
    // Force l'annonce {t:"map", instance:true} au prochain envoi.
    lastMapSent = "";
  } else {
    // Au retour : la room est rejointe via le prochain {t:"map"}.
    lastMapSent = "";
  }
}
let lastSendMs = 0;
let lastLocalBuildMs = -Infinity;
let pendingLocal = null;
let lastMapSent = "";
const remotes = new Map(); // id -> { ...state, rx, ry, lastSeen }
// NPC partages (serveur autoritaire) : uid -> snapshot + interpolation.
const netNpcs = new Map();
// Journal des kills serveur : uid -> { killer, at }. Survit au respawn
// instantane pour trancher les recompenses (le killer touche, l'autre non).
const netDeaths = new Map();
// Retraits sans mort (despawn de vague Cubikon) : purge immediate cote client.
let netGone = [];
export function drainNetGone() {
  if (!netGone.length) return [];
  const out = netGone;
  netGone = [];
  return out;
}
let lastNpcSnapMs = 0;
const NET_SEND_INTERVAL_MS = 50;
// Prediction visuelle des mouvements distants. Pleine vitesse pendant les
// petits trous reseau, puis freinage progressif : le joueur ne se fige pas
// net et ne repart pas par bonds lorsque sa connexion fluctue.
// Fenetre elargie pour les onglets en arriere-plan : un navigateur bride les
// timers d'un onglet masque (~1 Hz), donc les positions d'un joueur qui farme
// en onglet reduit arrivent 1x/s. Sans prediction longue, son vaisseau se fige
// puis "teleporte" a chaque paquet. A 20 Hz sain, l'age des samples reste
// sous ~150 ms : cet elargissement ne change rien pour les connexions saines.
const NET_PREDICTION_FULL_MS = 1100;
const NET_PREDICTION_BRAKE_MS = 900;
const NET_MAX_ESTIMATED_SPEED = 1500;
// Taux de virage max pris en compte pour la prediction en arc (rad/s) :
// une orbite de farm typique tourne a ~1-2,5 rad/s.
const NET_MAX_TURN_RATE = 4;
const netPerf = {
  messages: 0, snapshots: 0, bytes: 0, snapshotPlayers: 0, snapshotNpcs: 0,
  maxCorrection: 0, startedAt: Date.now(),
};

function predictionLeadSeconds(sampleAgeMs) {
  const age = Math.max(0, Number(sampleAgeMs) || 0);
  if (age <= NET_PREDICTION_FULL_MS) return age / 1000;
  const extra = Math.min(NET_PREDICTION_BRAKE_MS, age - NET_PREDICTION_FULL_MS);
  // Integrale d'une vitesse qui descend lineairement de 100 % a 0 %.
  const easedExtra = extra * (1 - extra / (2 * NET_PREDICTION_BRAKE_MS));
  return (NET_PREDICTION_FULL_MS + easedExtra) / 1000;
}

function estimateVelocity(prev, x, y, now, xKey = "x", yKey = "y", sourceAt = now) {
  if (!prev) return { vx: 0, vy: 0 };
  // L'horloge serveur evite les pics quand plusieurs snapshots retardes
  // arrivent en rafale dans la meme milliseconde sur le client.
  const previousAt = Number(prev.sourceAt || prev.sampleAt || prev.lastSeen || sourceAt);
  const elapsed = Math.max(1, Number(sourceAt) - previousAt) / 1000;
  const vx = (x - Number(prev[xKey] ?? x)) / elapsed;
  const vy = (y - Number(prev[yKey] ?? y)) / elapsed;
  const speed = Math.hypot(vx, vy);
  if (!(speed > NET_MAX_ESTIMATED_SPEED)) return { vx, vy };
  const scale = NET_MAX_ESTIMATED_SPEED / speed;
  return { vx: vx * scale, vy: vy * scale };
}

// Appelé par le moteur dès qu'un saut/respawn change de carte. La purge ne
// doit pas attendre le prochain paquet 20 Hz, sinon l'ancien snapshot peut
// être rendu une image sur la nouvelle carte.
export function clearNetplayGameplay() {
  clearInstanceGameplay();
  lastNpcSnapMs = performance.now();
  lastMapSent = "";
}
// Box ambiantes : miroir de l'etat entierement autoritaire du serveur.
const netBoxes = new Map(); // slotUid -> { type, x, y }
const netBoxInbox = [];
// Une collecte reste reservee localement jusqu'a la reponse autoritaire du
// serveur. Cela empeche une liste retardee de faire reapparaitre la box.
const pendingNetBoxClaims = new Set();
// Echo de soi pour le PvP (PV autoritaires serveur).
let selfServ = null;
export function getNetSelf() {
  return selfServ;
}
// Feed degats allies : { uid, by, total } (chiffres sur la cible, sans effet).
const netDmgInbox = [];
// Cargo du vaincu PvP : apparition a relayer + collectes a effacer.
const netPvpLootInbox = [];
// Kick admin : { reason } + explosions d'exclusion a afficher.
const netAdminKickInbox = [];
const netAdminBoomInbox = [];
export function drainNetAdminKickInbox() {
  if (!netAdminKickInbox.length) return [];
  return netAdminKickInbox.splice(0, netAdminKickInbox.length);
}
export function drainNetAdminBoomInbox() {
  if (!netAdminBoomInbox.length) return [];
  return netAdminBoomInbox.splice(0, netAdminBoomInbox.length);
}
// Deconnexion volontaire (kick) : ferme sans reconnect auto.
let noReconnect = false;
export function netDisconnect() {
  noReconnect = true;
  try { if (ws && ws.readyState === 1) ws.close(); } catch {}
  ws = null;
  connected = false;
}
// Bannissement temporaire : { reason, until } + popup bloquante moteur.
const netBannedInbox = [];
export function drainNetBannedInbox() {
  if (!netBannedInbox.length) return [];
  return netBannedInbox.splice(0, netBannedInbox.length);
}
const netPvpLootTakeInbox = [];
export function drainNetPvpLootInbox() {
  if (!netPvpLootInbox.length) return [];
  return netPvpLootInbox.splice(0, netPvpLootInbox.length);
}
export function drainNetPvpLootTakeInbox() {
  if (!netPvpLootTakeInbox.length) return [];
  return netPvpLootTakeInbox.splice(0, netPvpLootTakeInbox.length);
}
export function sendPvpLoot(ev) {
  if (suspended) return;
  if (!ws || ws.readyState !== 1 || !ev || typeof ev !== "object") return;
  try {
    const x = Math.round(Number(ev.x)), y = Math.round(Number(ev.y));
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    if (typeof ev.uid !== "string" || !ev.uid.startsWith("pvploot_")) return;
    if (typeof ev.onlyBy !== "string" || !ev.onlyBy) return;
    ws.send(JSON.stringify({ t: "pvpLoot", uid: ev.uid.slice(0, 64), x, y, onlyBy: String(ev.onlyBy).slice(0, 64) }));
  } catch {}
}
export function sendPvpLootTake(ev) {
  if (suspended) return;
  if (!ws || ws.readyState !== 1 || !ev || typeof ev !== "object") return;
  try {
    if (typeof ev.uid !== "string" || !ev.uid.startsWith("pvploot_")) return;
    ws.send(JSON.stringify({ t: "pvpLootTake", uid: ev.uid.slice(0, 64) }));
  } catch {}
}
// Recompenses PvP du serveur : { exp, honneur, mult, victim } a appliquer.
const netPvpKillInbox = [];
const netNpcRewardInbox = new Map();
export function takeNetNpcReward(mapId, uid, seq) {
  const key = `${String(mapId || "").toLowerCase()}:${String(uid || "")}:${Number(seq) || 0}`;
  const reward = netNpcRewardInbox.get(key) || null;
  if (reward) netNpcRewardInbox.delete(key);
  return reward;
}
// PET detruit : { victim, pet } pour le toast du tueur.
const netPvpPetKillInbox = [];
export function drainNetPvpPetKillInbox() {
  if (!netPvpPetKillInbox.length) return [];
  return netPvpPetKillInbox.splice(0, netPvpPetKillInbox.length);
}
export function drainNetPvpKillInbox() {
  if (!netPvpKillInbox.length) return [];
  return netPvpKillInbox.splice(0, netPvpKillInbox.length);
}
// Tirs allies exacts (vrais + faux) : { t:shot/rshot, ... } a jouer aussitot.
const netShotInbox = [];
// IEM / ISH synchronises : evenement immediat pour casser les locks et
// demarrer les animations sans attendre le prochain snapshot.
const netSkillInbox = [];
export function drainNetSkillInbox() {
  if (!netSkillInbox.length) return [];
  return netSkillInbox.splice(0, netSkillInbox.length);
}
// Chat global : { from, text, at } recus ou rejoues (historique).
const netChatInbox = [];
export function drainNetChatInbox() {
  if (!netChatInbox.length) return [];
  return netChatInbox.splice(0, netChatInbox.length);
}
export function sendChat(text) {
  if (suspended) return false;
  if (!ws || ws.readyState !== 1) return false;
  const clean = String(text || "").replace(/\s+/g, " ").trim().slice(0, 200);
  if (!clean) return false;
  try {
    ws.send(JSON.stringify({ t: "chat", text: clean }));
    return true;
  } catch { return false; }
}
function pushChatMessage(m) {
  if (!m || typeof m !== "object") return;
  const from = String(m.from || "Pilote").slice(0, 20);
  const text = String(m.text || "").slice(0, 200);
  if (!text) return;
  if (netChatInbox.length > 100) netChatInbox.shift();
  netChatInbox.push({ from, text, at: Number(m.at) || Date.now(), by: m.by != null ? String(m.by) : "", adminBlast: m.adminBlast === true });
}
// Groupes + murmures + amis : canaux globaux comme le tchat
// (vivants même en Galaxy Gate, coupés seulement en suspend).
let netGroup = null; // null | { id, leader, members:[{id,pseudo,map,online}] }
const netGroupInviteInbox = [];
const netGroupNoticeInbox = [];
const netWhisperInbox = []; // { from, fromPseudo, toPseudo, text, at, mine }
let netFriendsOnline = []; // [{ id, pseudo }] (comptes suivis, en ligne)
export function getNetGroup() {
  return netGroup;
}
export function getNetFriendsOnline() {
  return netFriendsOnline.slice();
}
export function drainNetGroupInviteInbox() {
  if (!netGroupInviteInbox.length) return [];
  return netGroupInviteInbox.splice(0, netGroupInviteInbox.length);
}
export function drainNetGroupNoticeInbox() {
  if (!netGroupNoticeInbox.length) return [];
  return netGroupNoticeInbox.splice(0, netGroupNoticeInbox.length);
}
export function drainNetWhisperInbox() {
  if (!netWhisperInbox.length) return [];
  return netWhisperInbox.splice(0, netWhisperInbox.length);
}
function sendSocialMsg(obj) {
  if (suspended) return false;
  if (!ws || ws.readyState !== 1 || !obj || typeof obj !== "object") return false;
  try { ws.send(JSON.stringify(obj)); return true; } catch { return false; }
}
export function sendGroupCreate() {
  return sendSocialMsg({ t: "groupCreate" });
}
export function sendGroupInvite(to) {
  const target = String(to || "").trim().slice(0, 20);
  if (!target) return false;
  return sendSocialMsg({ t: "groupInvite", to: target });
}
export function sendGroupAccept() {
  return sendSocialMsg({ t: "groupAccept" });
}
export function sendGroupDecline() {
  return sendSocialMsg({ t: "groupDecline" });
}
export function sendGroupLeave() {
  const had = !!netGroup;
  netGroup = null;
  sendSocialMsg({ t: "groupLeave" });
  return had;
}
export function sendGroupKick(target) {
  const id = String(target || "").slice(0, 64);
  if (!id) return false;
  return sendSocialMsg({ t: "groupKick", target: id });
}
export function sendGroupInviteLock(locked) {
  return sendSocialMsg({ t: "groupInviteLock", locked: locked === true });
}
export function sendGroupRally() {
  return sendSocialMsg({ t: "groupRally" });
}
export function sendGroupChat(text) {
  const clean = String(text || "").replace(/\s+/g, " ").trim().slice(0, 200);
  if (!clean) return false;
  return sendSocialMsg({ t: "groupChat", text: clean });
}
export function sendGroupSync() {
  return sendSocialMsg({ t: "groupSync" });
}
export function sendWhisper(to, text) {
  const target = String(to || "").trim().slice(0, 20);
  const clean = String(text || "").replace(/\s+/g, " ").trim().slice(0, 200);
  if (!target || !clean) return false;
  return sendSocialMsg({ t: "whisper", to: target, text: clean });
}
// Demandes d'ami : notification live après le POST HTTP (la demande est
// vérifiée en base côté serveur) + rafraîchissement après accept/refus.
const netFriendRequestInbox = [];
let netFriendsDirty = false;
export function drainNetFriendRequestInbox() {
  if (!netFriendRequestInbox.length) return [];
  return netFriendRequestInbox.splice(0, netFriendRequestInbox.length);
}
export function consumeFriendsDirty() {
  const v = netFriendsDirty;
  netFriendsDirty = false;
  return v;
}
export function sendFriendPing(to) {
  const target = String(to || "").trim().slice(0, 20);
  if (!target) return false;
  return sendSocialMsg({ t: "friendPing", to: target });
}
export function sendFriendResponded(to) {
  const target = String(to || "").trim().slice(0, 20);
  if (!target) return false;
  return sendSocialMsg({ t: "friendResponded", to: target });
}
// Enchères partagées (comme le tchat) : sync/update/settle/reject bruts,
// fusionnés dans user.auction par SRC/CORE/AUCTION_NET.js.
const netAuctionInbox = [];
export function drainNetAuctionInbox() {
  if (!netAuctionInbox.length) return [];
  return netAuctionInbox.splice(0, netAuctionInbox.length);
}
function pushAuctionEvent(m) {
  if (!m || typeof m !== "object") return;
  if (netAuctionInbox.length > 24) netAuctionInbox.shift();
  netAuctionInbox.push(m);
}
export function sendAuctionBid(key, amount) {
  if (suspended) return false;
  if (!ws || ws.readyState !== 1) return false;
  const k = String(key || "").slice(0, 64);
  const bid = Math.max(0, Math.floor(Number(amount) || 0));
  if (!k || !(bid > 0)) return false;
  try {
    ws.send(JSON.stringify({ t: "auctionBid", key: k, amount: bid }));
    return true;
  } catch { return false; }
}
let connectTried = false;

function currentMapId() {
  try {
    return String(window.__CURRENT_MAP_ID__ || "1-1").toLowerCase();
  } catch { return "1-1"; }
}

function wsUrl() {
  try {
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    return `${proto}//${location.host}/ws`;
  } catch { return ""; }
}

export function netplayStatus() {
  return { connected, authed: netAuthed, myId, count: remotes.size, boxAuthority: "server", boxCount: netBoxes.size, instance: instanceMode === true };
}

function prune() {
  const now = performance.now();
  for (const [id, r] of remotes) {
    if (now - Number(r.lastSeen || 0) > 8000) remotes.delete(id);
  }
}

export function ensureNetplayConnection() {
  if (connectTried) return;
  // file:// ou preview sans serveur : reste en solo.
  try {
    if (!/^https?:$/.test(location.protocol)) return;
  } catch { return; }
  const url = wsUrl();
  if (!url) return;
  connectTried = true;
  try {
    ws = new WebSocket(url);
  } catch { ws = null; return; }

  ws.onopen = () => {
    connected = true;
    lastLatencyMs = null;
    lastMapSent = "";
    try {
      ws.send(JSON.stringify({
        t: "hello",
        map: currentMapId(),
        instance: instanceMode === true ? true : undefined,
        pseudo: pendingLocal?.pseudo || "",
        shipId: pendingLocal?.shipId || "",
        token: netToken() || undefined,
      }));
      lastMapSent = currentMapId();
      sendPing();
    } catch {}
  };
  ws.onclose = () => {
    connected = false;
    netAuthed = false;
    lastLatencyMs = null;
    if (noReconnect) return;
    // Reconnect douce apres 3 s (serveur maison qui redemarre).
    setTimeout(() => {
      connectTried = false;
      ensureNetplayConnection();
      if (pendingLocal) sendNow(pendingLocal, true);
    }, 3000);
  };
  ws.onerror = () => { try { ws.close(); } catch {} };
  ws.onmessage = (ev) => {
    netPerf.messages++;
    netPerf.bytes += typeof ev.data === "string" ? ev.data.length : Number(ev.data?.byteLength || 0);
    let msg = null;
    try { msg = JSON.parse(String(ev.data)); } catch { return; }
    if (!msg || typeof msg !== "object") return;
    if (msg.t === "welcome") {
      myId = String(msg.id || "");
      if (msg.authed === true) netAuthed = true;
      return;
    }
    // Depart immediat (portail / changement de map) : supprime le vaisseau
    // sur-le-champ au lieu d'attendre le timeout de 8 s (le "clone" fantome).
    if (msg.t === "leave") {
      try {
        const goneId = String(msg.id || "");
        if (goneId) remotes.delete(goneId);
      } catch {}
      return;
    }
    if (msg.t === "chatMsg") {
      pushChatMessage(msg);
      return;
    }
    // Groupes + murmures + présence amis (miroir tchat pour l'affichage).
    if (msg.t === "groupUpdate") {
      netGroup = msg.group && typeof msg.group === "object" ? msg.group : null;
      return;
    }
    if (msg.t === "groupInvite") {
      if (netGroupInviteInbox.length > 4) netGroupInviteInbox.shift();
      netGroupInviteInbox.push({
        from: String(msg.from || "").slice(0, 64),
        fromPseudo: String(msg.fromPseudo || "Pilote").slice(0, 20),
        groupId: String(msg.groupId || "").slice(0, 16),
        expiresAt: Math.max(Date.now(), Number(msg.expiresAt) || (Date.now() + 15_000)),
      });
      return;
    }
    if (msg.t === "groupInviteSent") {
      if (netGroupNoticeInbox.length > 20) netGroupNoticeInbox.shift();
      netGroupNoticeInbox.push({ text: `Invitation envoyée à ${String(msg.toPseudo || "Pilote").slice(0, 20)}.`, expiresAt: Number(msg.expiresAt) || (Date.now() + 15_000) });
      return;
    }
    if (msg.t === "groupNotice") {
      if (netGroupNoticeInbox.length > 20) netGroupNoticeInbox.shift();
      netGroupNoticeInbox.push({ text: String(msg.text || "").slice(0, 160) });
      pushChatMessage({ from: "[Groupe]", text: String(msg.text || "").slice(0, 160), at: Date.now() });
      return;
    }
    if (msg.t === "groupMsg") {
      pushChatMessage({
        from: `[Groupe] ${String(msg.fromPseudo || "Pilote").slice(0, 20)}`,
        text: String(msg.text || "").slice(0, 200),
        at: Number(msg.at) || Date.now(),
        by: msg.from != null ? String(msg.from) : "",
      });
      return;
    }
    if (msg.t === "whisperMsg") {
      const entry = {
        from: String(msg.from || "").slice(0, 64),
        fromPseudo: String(msg.fromPseudo || "Pilote").slice(0, 20),
        text: String(msg.text || "").slice(0, 200),
        at: Number(msg.at) || Date.now(),
        mine: false,
      };
      if (netWhisperInbox.length > 60) netWhisperInbox.shift();
      netWhisperInbox.push(entry);
      pushChatMessage({ from: `[MP] ${entry.fromPseudo}`, text: entry.text, at: entry.at, by: entry.from });
      return;
    }
    if (msg.t === "whisperSent") {
      const entry = {
        toPseudo: String(msg.toPseudo || "Pilote").slice(0, 20),
        text: String(msg.text || "").slice(0, 200),
        at: Number(msg.at) || Date.now(),
        mine: true,
      };
      if (netWhisperInbox.length > 60) netWhisperInbox.shift();
      netWhisperInbox.push(entry);
      pushChatMessage({ from: `[MP → ${entry.toPseudo}]`, text: entry.text, at: entry.at, by: myId });
      return;
    }
    if (msg.t === "whisperNotice") {
      if (netGroupNoticeInbox.length > 20) netGroupNoticeInbox.shift();
      netGroupNoticeInbox.push({ text: String(msg.text || "").slice(0, 160) });
      return;
    }
    // Demande d'ami reçue : inbox + ligne tchat (accepter : fenêtre Amis).
    if (msg.t === "friendRequest") {
      const entry = {
        from: String(msg.from || "").slice(0, 64),
        fromPseudo: String(msg.fromPseudo || "Pilote").slice(0, 20),
        at: Number(msg.at) || Date.now(),
      };
      if (!netFriendRequestInbox.some((r) => r.from === entry.from)) {
        if (netFriendRequestInbox.length > 8) netFriendRequestInbox.shift();
        netFriendRequestInbox.push(entry);
      }
      netFriendsDirty = true;
      pushChatMessage({ from: "[Amis]", text: `Demande d'ami de ${entry.fromPseudo} (fenêtre Amis pour accepter).`, at: entry.at, by: entry.from });
      return;
    }
    if (msg.t === "friendPingAck") {
      pushChatMessage({ from: "[Amis]", text: `Demande envoyée à ${String(msg.to || "Pilote").slice(0, 20)}.`, at: Date.now(), by: myId });
      return;
    }
    if (msg.t === "friendsChanged") {
      netFriendsDirty = true;
      return;
    }
    if (msg.t === "friendsSync" && Array.isArray(msg.online)) {
      netFriendsOnline = msg.online.slice(0, 200)
        .filter((f) => f && typeof f === "object")
        .map((f) => ({ id: String(f.id || "").slice(0, 64), pseudo: String(f.pseudo || "Pilote").slice(0, 20), map: String(f.map || "").slice(0, 32), shipId: String(f.shipId || "").slice(0, 64), instance: f.instance === true, inGroup: f.inGroup === true }));
      return;
    }
    if (msg.t === "friendOnline") {
      const fid = String(msg.id || "").slice(0, 64);
      if (!fid) return;
      if (msg.online === true) {
        const next = { id: fid, pseudo: String(msg.pseudo || "Pilote").slice(0, 20), map: String(msg.map || "").slice(0, 32), shipId: String(msg.shipId || "").slice(0, 64), instance: msg.instance === true, inGroup: msg.inGroup === true };
        const index = netFriendsOnline.findIndex((f) => f.id === fid);
        if (index >= 0) netFriendsOnline[index] = next;
        else netFriendsOnline.push(next);
      } else {
        netFriendsOnline = netFriendsOnline.filter((f) => f.id !== fid);
      }
      return;
    }
    if (msg.t === "pong") {
      const now = Date.now();
      lastPongMs = now;
      const sentAt = Number(msg.t0);
      if (Number.isFinite(sentAt) && sentAt > 0 && sentAt <= now) {
        lastLatencyMs = Math.max(0, Math.round(now - sentAt));
      }
      if (typeof msg.v === "string" && msg.v) srvVersionSeen = msg.v.slice(0, 32);
      return;
    }
    if (msg.t === "auctionSync" || msg.t === "auctionUpdate" || msg.t === "auctionSettle" || msg.t === "auctionBidReject") {
      if (msg.t === "auctionSync") lastHelloAckMs = Date.now();
      pushAuctionEvent(msg);
      return;
    }
    if (msg.t === "adminKick") {
      if (netAdminKickInbox.length > 4) netAdminKickInbox.shift();
      netAdminKickInbox.push({ reason: String(msg.reason || "Comportement inapproprié.").slice(0, 200) });
      return;
    }
    if (msg.t === "banned") {
      if (netBannedInbox.length > 4) netBannedInbox.shift();
      netBannedInbox.push({
        reason: String(msg.reason || "Comportement inapproprié.").slice(0, 200),
        until: msg.until != null && Number.isFinite(Number(msg.until)) ? Math.max(0, Number(msg.until)) : null,
      });
      return;
    }
    if (msg.t === "adminBoom" && Number.isFinite(Number(msg.x)) && Number.isFinite(Number(msg.y))) {
      if (netAdminBoomInbox.length > 8) netAdminBoomInbox.shift();
      netAdminBoomInbox.push({ x: Math.round(Number(msg.x)), y: Math.round(Number(msg.y)) });
      return;
    }
    if (msg.t === "pvpLoot" && typeof msg.uid === "string" && msg.uid.startsWith("pvploot_")) {
      if (netPvpLootInbox.length > 8) netPvpLootInbox.shift();
      netPvpLootInbox.push({
        uid: String(msg.uid).slice(0, 64),
        x: Math.round(Number(msg.x) || 0),
        y: Math.round(Number(msg.y) || 0),
        onlyBy: typeof msg.onlyBy === "string" ? String(msg.onlyBy).slice(0, 64) : "",
      });
      return;
    }
    if (msg.t === "pvpLootTake" && typeof msg.uid === "string" && msg.uid.startsWith("pvploot_")) {
      if (netPvpLootTakeInbox.length > 16) netPvpLootTakeInbox.shift();
      netPvpLootTakeInbox.push(String(msg.uid).slice(0, 64));
      return;
    }
    if (msg.t === "pvpKill") {
      if (netPvpKillInbox.length > 8) netPvpKillInbox.shift();
      netPvpKillInbox.push({
        exp: Math.max(0, Math.floor(Number(msg.exp) || 0)),
        honneur: Math.max(0, Math.floor(Number(msg.honneur) || 0)),
        mult: Number(msg.mult) > 0 ? Number(msg.mult) : 1,
        victim: String(msg.victim || "Pilote").slice(0, 20),
      });
      return;
    }
    if (msg.t === "pvpPetKill") {
      if (netPvpPetKillInbox.length > 8) netPvpPetKillInbox.shift();
      netPvpPetKillInbox.push({
        victim: String(msg.victim || "Pilote").slice(0, 20),
        pet: String(msg.pet || "REX").slice(0, 32),
      });
      return;
    }
    if (msg.t === "chatHistory" && Array.isArray(msg.list)) {
      for (const m of msg.list.slice(-30)) pushChatMessage(m);
      return;
    }
    if (msg.t === "shot" || msg.t === "rshot") {
      // Tir allie : joue aussitot (map du tireur requise).
      try {
        const shotMap = String(msg.map || "").toLowerCase();
        if (shotMap && shotMap !== currentMapId()) return;
      } catch {}
      if (netShotInbox.length > 96) netShotInbox.shift();
      netShotInbox.push(msg);
      return;
    }
    if (msg.t === "npcReward") {
      const key = `${String(msg.map || "").toLowerCase()}:${String(msg.uid || "")}:${Number(msg.seq) || 0}`;
      netNpcRewardInbox.set(key, {
        credits: Math.max(0, Math.floor(Number(msg.credits) || 0)),
        exp: Math.max(0, Math.floor(Number(msg.exp) || 0)),
        honor: Math.max(0, Math.floor(Number(msg.honor) || 0)),
        baseExp: Math.max(0, Math.floor(Number(msg.baseExp) || 0)),
        baseHonor: Math.max(0, Math.floor(Number(msg.baseHonor) || 0)),
        petExp: Math.max(0, Number(msg.petExp) || 0),
        revision: Math.max(0, Math.floor(Number(msg.revision) || 0)),
        ownsKill: msg.ownsKill === true,
        percent: Math.max(0, Math.min(100, Math.floor(Number(msg.percent) || 0))),
      });
      if (netNpcRewardInbox.size > 64) netNpcRewardInbox.delete(netNpcRewardInbox.keys().next().value);
      return;
    }
    if (msg.t === "skillFx" && (msg.skill === "iem" || msg.skill === "ish")) {
      if (netSkillInbox.length > 24) netSkillInbox.shift();
      netSkillInbox.push({
        skill: msg.skill,
        by: String(msg.by || "").slice(0, 64),
        until: Math.max(0, Number(msg.until) || 0),
        at: Math.max(0, Number(msg.at) || Date.now()),
      });
      return;
    }
    if (msg.t === "boxesSync" && Array.isArray(msg.boxes)) {
      // Etat complet pour le nouveau venu (meme map uniquement).
      try {
        const syncMap = String(msg.map || "").toLowerCase();
        if (syncMap && syncMap !== currentMapId()) return;
      } catch {}
      netBoxes.clear();
      for (const b of msg.boxes.slice(0, 1200)) {
        if (!b || typeof b.uid !== "string" || typeof b.type !== "string") continue;
        if (!Number.isFinite(Number(b.x)) || !Number.isFinite(Number(b.y))) continue;
        const uid = b.uid.slice(0, 64);
        if (pendingNetBoxClaims.has(uid)) continue;
        netBoxes.set(uid, { type: String(b.type).slice(0, 32), x: Math.round(Number(b.x)), y: Math.round(Number(b.y)) });
      }
      return;
    }
    if (msg.t === "box" && msg.op) {
      if (msg.op === "claim" && typeof msg.uid === "string") {
        const uid = msg.uid.slice(0, 64);
        pendingNetBoxClaims.delete(uid);
        netBoxes.delete(uid);
        const b = msg.box;
        if (msg.ok !== true && b && typeof b.type === "string" && Number.isFinite(Number(b.x)) && Number.isFinite(Number(b.y))) {
          netBoxes.set(uid, { type: String(b.type).slice(0, 32), x: Math.round(Number(b.x)), y: Math.round(Number(b.y)) });
        }
        netBoxInbox.push({ op: "claim", uid, ok: msg.ok === true });
      } else if (msg.op === "collect" && typeof msg.uid === "string") {
        const uid = msg.uid.slice(0, 64);
        netBoxes.delete(uid);
        netBoxInbox.push({ op: "collect", uid });
      } else if (msg.op === "list" && Array.isArray(msg.boxes)) {
        netBoxes.clear();
        for (const b of msg.boxes.slice(0, 1200)) {
          if (!b || typeof b.uid !== "string" || typeof b.type !== "string") continue;
          if (!Number.isFinite(Number(b.x)) || !Number.isFinite(Number(b.y))) continue;
          const uid = b.uid.slice(0, 64);
          if (pendingNetBoxClaims.has(uid)) continue;
          netBoxes.set(uid, { type: String(b.type).slice(0, 32), x: Math.round(Number(b.x)), y: Math.round(Number(b.y)) });
        }
      } else if (msg.op === "spawn" && msg.box && typeof msg.box.uid === "string") {
        const b = msg.box, uid = b.uid.slice(0, 64);
        if (!pendingNetBoxClaims.has(uid) && typeof b.type === "string" && Number.isFinite(Number(b.x)) && Number.isFinite(Number(b.y))) {
          netBoxes.set(uid, { type: String(b.type).slice(0, 32), x: Math.round(Number(b.x)), y: Math.round(Number(b.y)) });
        }
      } else if (msg.op === "unspawn" && Array.isArray(msg.uids)) {
        for (const u of msg.uids.slice(0, 200)) {
          if (typeof u !== "string") continue;
          netBoxes.delete(u.slice(0, 64));
        }
      }
      return;
    }
    if (msg.t === "snapshot" && Array.isArray(msg.players)) {
      netPerf.snapshots++;
      netPerf.snapshotPlayers += msg.players.length;
      netPerf.snapshotNpcs += Array.isArray(msg.npc?.list) ? msg.npc.list.length : 0;
      // Snapshot d'une autre map (changement en cours) : ignore.
      try {
        const snapMap = String(msg.map || "").toLowerCase();
        if (snapMap && snapMap !== currentMapId()) return;
      } catch {}
      const now = performance.now();
      const sourceAt = Number.isFinite(Number(msg.at)) ? Number(msg.at) : now;
      const seen = new Set();
      for (const p of msg.players) {
        if (!p || typeof p !== "object") continue;
        const id = String(p.id || "");
        // Echo de soi (PvP) : PV autoritaires + date du dernier coup recu.
        if (id && id === myId) {
          selfServ = {
            hp: Number(p.pvpHp), sh: Number(p.pvpSh), pvpAt: Number(p.pvpAt) || 0,
            pvpFrom: p.pvpFrom != null ? String(p.pvpFrom) : null,
            npcAt: Number(p.npcAt) || 0,
            npcSeq: Math.max(0, Math.floor(Number(p.npcSeq) || 0)),
            npcFrom: p.npcFrom != null ? String(p.npcFrom) : null,
            npcDamage: Math.max(0, Number(p.npcDamage) || 0),
            npcHpDamage: Math.max(0, Number(p.npcHpDamage) || 0),
            npcShDamage: Math.max(0, Number(p.npcShDamage) || 0),
            petHp: Number(p.pvpPetHp), petSh: Number(p.pvpPetSh),
            petPvpAt: Number(p.petPvpAt) || 0,
            slowPct: Math.max(0, Math.min(95, Number(p.slowPct) || 0)),
            slowT: Math.max(0, Number(p.slowT) || 0),
            freezeT: Math.max(0, Number(p.freezeT) || 0),
            iemT: Math.max(0, Number(p.iemT) || 0),
            ishT: Math.max(0, Number(p.ishT) || 0),
            at: now,
          };
          continue;
        }
        if (!id) continue;
        seen.add(id);
        const prev = remotes.get(id);
        const x = Number(p.x) || 0, y = Number(p.y) || 0;
        const revived = !!prev && prev.dead === true && p.dead !== true;
        const vmax = Math.max(50, Math.min(5000, Number(p.vmax) || 400));
        const rawVx = Number(p.vx) || 0, rawVy = Number(p.vy) || 0;
        const rawSpeed = Math.hypot(rawVx, rawVy);
        const velocityScale = rawSpeed > vmax * 1.25 ? (vmax * 1.25) / rawSpeed : 1;
        const positionChanged = !prev || x !== Number(prev.x) || y !== Number(prev.y)
          || Math.abs(rawVx * velocityScale - Number(prev.vx || 0)) > 1
          || Math.abs(rawVy * velocityScale - Number(prev.vy || 0)) > 1;
        const svx = p.dead === true ? 0 : rawVx * velocityScale;
        const svy = p.dead === true ? 0 : rawVy * velocityScale;
        // Cadence d'envoi observee (ms entre snapshots DISTINCTS, lissee) :
        // ~50 ms onglet ouvert, ~1000 ms onglet reduit. Les snapshots repetes
        // par le serveur (20 Hz, memes valeurs) ne touchent a rien.
        let updateInterval = Number(prev?.updateInterval || 60);
        if (!prev) {
          updateInterval = 60;
        } else if (positionChanged) {
          const gap = Math.max(1, now - Number(prev.sampleAt || now));
          const est = Math.max(50, Math.min(2000, updateInterval));
          // Monte vite (onglet qu'on reduit), descend doucement (retour a
          // 20 Hz : un plafond trop large ne gene pas, l'age reste < 50 ms).
          const kUp = gap > est ? 0.5 : 0.15;
          updateInterval = Math.max(50, Math.min(2000, est + (gap - est) * kUp));
        }
        // Taux de virage (rad/s) depuis la rotation du vecteur VITESSE entre
        // deux snapshots distincts (surtout pas l'angle du sprite : le
        // vaisseau regarde sa cible pendant qu'il orbite). Un bot en fenetre
        // reduite n'envoie qu'~1 Hz en tournant sans arret : predire en arc
        // plutot qu'en ligne droite supprime les sauts a chaque paquet.
        // Date a l'horloge serveur (stable en rafale), comme estimateVelocity.
        const prevVx = Number(prev?.vx || 0), prevVy = Number(prev?.vy || 0);
        let turn = Number(prev?.turn || 0);
        let headingAt = Number(prev?.headingAt || sourceAt);
        if (!prev) {
          turn = 0;
          headingAt = Number(sourceAt);
        } else if (positionChanged && Math.hypot(prevVx, prevVy) > 50 && Math.hypot(svx, svy) > 50) {
          const dH = Math.atan2(prevVx * svy - prevVy * svx, prevVx * svx + prevVy * svy);
          const dtH = Math.max(0.05, (Number(sourceAt) - headingAt) / 1000);
          if (Math.abs(dH) > 0.02) {
            const rawTurn = Math.max(-NET_MAX_TURN_RATE, Math.min(NET_MAX_TURN_RATE, dH / dtH));
            turn = turn * 0.4 + rawTurn * 0.6;
            headingAt = Number(sourceAt);
          } else {
            // Direction stable : dissipe l'estimee (pas d'arc fantome en ligne droite).
            turn = turn * Math.exp(-3 * dtH);
          }
        }
        const petx = Number(p.petx) || 0, pety = Number(p.pety) || 0;
        const rawPetVelocity = estimateVelocity(prev, petx, pety, now, "petx", "pety", sourceAt);
        const petVelocity = prev ? {
          vx: Number(prev.petvx || 0) * 0.5 + rawPetVelocity.vx * 0.5,
          vy: Number(prev.petvy || 0) * 0.5 + rawPetVelocity.vy * 0.5,
        } : rawPetVelocity;
        const petPositionChanged = !prev || petx !== Number(prev.petx) || pety !== Number(prev.pety);
        const entry = prev || {};
        Object.assign(entry, {
          id,
          pseudo: String(p.pseudo ?? prev?.pseudo ?? "Pilote").slice(0, 20),
          shipId: String(p.shipId ?? prev?.shipId ?? ""),
          x, y,
          vx: svx,
          vy: svy,
          turn,
          headingAt,
          updateInterval,
          vmax,
          angle: Number(p.angle) || 0,
          dead: p.dead === true,
          hpPct: Number.isFinite(Number(p.hpPct)) ? Math.max(0, Math.min(1, Number(p.hpPct))) : 1,
          shPct: Number.isFinite(Number(p.shPct)) ? Math.max(0, Math.min(1, Number(p.shPct))) : 1,
          collectUid: String(p.collectUid || "").slice(0, 64),
          collectPet: p.collectPet === true,
          background: p.bg === true,
          // Tir en cours + point vise (monde) : rend le laser du copain.
          atk: p.atk === true,
          tx: Number(p.tx) || 0,
          ty: Number(p.ty) || 0,
          ammo: String(p.ammo || "x1").slice(0, 16),
          drones: Math.max(0, Math.min(12, Number(p.drones ?? prev?.drones) || 0)),
          dform: String(p.dform ?? prev?.dform ?? "standard").slice(0, 32),
          // Cadence + vitesse pour les vrais projectiles visuels de l'allie.
          fint: Number(p.fint) > 0 ? Number(p.fint) : 0.25,
          bspd: Number(p.bspd) > 0 ? Number(p.bspd) : 4000,
          dslots: String(p.dslots ?? prev?.dslots ?? "").slice(0, 256),
          droneSlots: prev && p.dslots == null
            ? prev.droneSlots
            : prev && prev.dslots === String(p.dslots || "").slice(0, 256)
            ? prev.droneSlots
            : String(p.dslots || "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 12),
          alt: p.alt === true,
          shots: Math.max(0, Math.floor(Number(p.shots) || 0)),
          rank: String(p.rank ?? prev?.rank ?? "").slice(0, 64),
          firm: String(p.firm ?? prev?.firm ?? "").slice(0, 16),
          dind: String(p.dind ?? prev?.dind ?? "").slice(0, 256),
          ficon: String(p.ficon ?? prev?.ficon ?? "").slice(0, 128),
          mind: String(p.mind ?? prev?.mind ?? "").slice(0, 128),
          droneIndicators: prev && p.dind == null
            ? prev.droneIndicators
            : prev && prev.dind === String(p.dind || "").slice(0, 256)
            ? prev.droneIndicators
            : String(p.dind || "").split("|").map((s) => s.trim()).filter(Boolean),
          moduleIndicators: prev && p.mind == null
            ? prev.moduleIndicators
            : prev && prev.mind === String(p.mind || "").slice(0, 128)
            ? prev.moduleIndicators
            : String(p.mind || "").split("|").map((s) => s.trim()).filter(Boolean),
          rseq: Math.max(0, Math.floor(Number(p.rseq) || 0)),
          rkind: String(p.rkind || "r310").slice(0, 16),
          rspd: Number(p.rspd) > 0 ? Number(p.rspd) : 1500,
          safe: p.safe === true,
          // PvP : max pour la cible + portee + dernier coup recu (anneau Ship_damage).
          hpMax: Math.max(1, Math.round(Number(p.hpMax) || 1)),
          shMax: Math.max(0, Math.round(Number(p.shMax) || 0)),
          range: Math.max(200, Math.min(5000, Number(p.range) || 800)),
          pvpAt: Number(p.pvpAt) || 0,
          pvpFrom: p.pvpFrom != null ? String(p.pvpFrom) : null,
          npcAt: Number(p.npcAt) || 0,
          npcFrom: p.npcFrom != null ? String(p.npcFrom) : null,
          npcDamage: Math.max(0, Number(p.npcDamage) || 0),
          rocketSlowPct: Math.max(0, Math.min(95, Number(p.slowPct) || 0)),
          rocketSlowT: Math.max(0, Number(p.slowT) || 0),
          freezeT: Math.max(0, Number(p.freezeT) || 0),
          iemT: Math.max(0, Number(p.iemT) || 0),
          ishT: Math.max(0, Number(p.ishT) || 0),
          // PET allie : actif, niveau, position.
          peta: p.peta === 1 ? 1 : 0,
          petl: Math.max(1, Math.min(32, Math.round(Number(p.petl ?? prev?.petl) || 1))),
          petx, pety,
          petvx: p.peta === 1 ? (petPositionChanged ? petVelocity.vx : Number(prev?.petvx || 0)) : 0,
          petvy: p.peta === 1 ? (petPositionChanged ? petVelocity.vy : Number(prev?.petvy || 0)) : 0,
          petd: Number(p.petd) || 0,
          petn: String(p.petn ?? prev?.petn ?? "").slice(0, 32),
          petf: String(p.petf ?? prev?.petf ?? "").slice(0, 16),
          petHp: Number.isFinite(Number(p.petHp)) ? Math.max(0, Math.min(1, Number(p.petHp))) : 1,
          petSh: Number.isFinite(Number(p.petSh)) ? Math.max(0, Math.min(1, Number(p.petSh))) : 1,
          petHpM: Math.max(1, Math.round(Number(p.petHpM) || 1)),
          petShM: Math.max(0, Math.round(Number(p.petShM) || 0)),
          // Pool PV du PET (barres du proxy = verite serveur, pas le local regenere).
          pvpPetHp: Math.max(0, Math.round(Number(p.pvpPetHp) || 0)),
          pvpPetSh: Math.max(0, Math.round(Number(p.pvpPetSh) || 0)),
          lastSeen: now,
          sampleAt: positionChanged ? now : Number(prev?.sampleAt || now),
          sourceAt,
          // Position de rendu (interpolee vers x/y pour eviter les sauts).
          rx: prev && !revived ? Number(prev.rx ?? prev.x ?? p.x) : Number(p.x) || 0,
          ry: prev && !revived ? Number(prev.ry ?? prev.y ?? p.y) : Number(p.y) || 0,
          rangle: prev && !revived ? Number(prev.rangle ?? prev.angle ?? p.angle) : Number(p.angle) || 0,
          petrx: prev ? Number(prev.petrx ?? prev.petx ?? p.petx) : Number(p.petx) || 0,
          petry: prev ? Number(prev.petry ?? prev.pety ?? p.pety) : Number(p.pety) || 0,
          _assetWarmSignature: prev?._assetWarmSignature || "",
        });
        if (!prev) remotes.set(id, entry);
      }
      // Retire ceux qui ont quitte la map (absents du snapshot).
      for (const id of [...remotes.keys()]) {
        if (!seen.has(id)) {
          const r = remotes.get(id);
          // Un trou reseau ne doit pas faire disparaitre le joueur ni casser
          // le lock. Le serveur expire lui-meme les pairs silencieux a 10 s.
          if (r && now - Number(r.lastSeen || 0) > 8000) remotes.delete(id);
        }
      }
      // NPC partages (serveur autoritaire). Les morts restent avec leur
      // killer jusqu'au respawn pour trancher les recompenses.
      // Le journal `deaths` survit au respawn instantane des NPC normaux.
      if (msg.npc && typeof msg.npc === "object") {
        lastNpcSnapMs = now;
        if (Array.isArray(msg.npc.gone)) {
          for (const g of msg.npc.gone.slice(0, 200)) {
            if (typeof g !== "string" || !g) continue;
            netNpcs.delete(g.slice(0, 128));
            if (netGone.length < 200) netGone.push(g.slice(0, 128));
          }
        }
        if (!Array.isArray(msg.npc) && Array.isArray(msg.npc.dmg)) {
          for (const d of msg.npc.dmg.slice(0, 24)) {
            if (!d || !d.uid || !(Number(d.total) > 0)) continue;
            if (d.by != null && String(d.by) === String(myId)) continue;
            if (netDmgInbox.length > 48) netDmgInbox.shift();
            netDmgInbox.push({ uid: String(d.uid), by: d.by != null ? String(d.by) : "", total: Math.round(Number(d.total)) });
          }
        }
        const list = Array.isArray(msg.npc) ? msg.npc : msg.npc.list;
        const seenNpc = new Set();
        for (const n of (Array.isArray(list) ? list : [])) {
          if (!n || typeof n !== "object" || !n.uid) continue;
          const uid = String(n.uid);
          seenNpc.add(uid);
          const prev = netNpcs.get(uid);
          const respawned = !!prev && n.alive !== false
            && (Number(prev.seq) || 0) !== (Number(n.seq) || 0);
          const x = Number(n.x) || 0, y = Number(n.y) || 0;
          const motionPrev = respawned ? null : prev;
          const rawVelocity = estimateVelocity(motionPrev, x, y, now, "x", "y", sourceAt);
          const velocity = motionPrev ? {
            vx: Number(prev.vx || 0) * 0.5 + rawVelocity.vx * 0.5,
            vy: Number(prev.vy || 0) * 0.5 + rawVelocity.vy * 0.5,
          } : rawVelocity;
          const positionChanged = !motionPrev || x !== Number(prev.x) || y !== Number(prev.y);
          const npcEntry = prev || {};
          Object.assign(npcEntry, {
            uid,
            type: String(n.type || ""),
            x, y,
            vx: n.alive === false ? 0 : (positionChanged ? velocity.vx : Number(prev?.vx || 0)),
            vy: n.alive === false ? 0 : (positionChanged ? velocity.vy : Number(prev?.vy || 0)),
            angle: Number(n.angle) || 0,
            hp: Number(n.hp) || 0,
            sh: Number(n.sh) || 0,
            hpMax: Number(n.hpMax) || 1,
            shMax: Number(n.shMax) || 0,
            alive: n.alive !== false,
            killer: n.killer != null ? String(n.killer) : null,
            cause: String(n.cause || "gun").slice(0, 8),
            seq: Number(n.seq) || 0,
            aggro: n.aggro != null ? String(n.aggro) : null,
            // Animation d'ouverture du Cubikon (vague partagee) : phase +
            // temps restant, miroir dans ORBIT_ENGINE (syncNetNpcs).
            cube: (n.cube === "delay" || n.cube === "open" || n.cube === "hold") ? String(n.cube) : null,
            cubeT: Math.max(0, Number(n.cubeT) || 0),
            rocketSlowPct: Math.max(0, Math.min(95, Number(n.slowPct) || 0)),
            rocketSlowT: Math.max(0, Number(n.slowT) || 0),
            freezeT: Math.max(0, Number(n.freezeT) || 0),
            lastSeen: now,
            sampleAt: positionChanged ? now : Number(prev?.sampleAt || now),
            sourceAt,
            rx: motionPrev ? Number(prev.rx ?? prev.x ?? n.x) : x,
            ry: motionPrev ? Number(prev.ry ?? prev.y ?? n.y) : y,
          });
          if (!prev) netNpcs.set(uid, npcEntry);
        }
        for (const [uid, npc] of [...netNpcs.entries()]) {
          // Une seule liste incomplete ou retardee ne doit jamais delocker un
          // NPC encore vivant. Les morts sont, elles, envoyees explicitement.
          if (!seenNpc.has(uid) && now - Number(npc?.lastSeen || 0) > 8000) netNpcs.delete(uid);
        }
        if (Array.isArray(msg.npc.deaths)) {
          for (const d of msg.npc.deaths) {
            if (!d || !d.uid || d.killer == null) continue;
            netDeaths.set(String(d.uid), {
              killer: String(d.killer), seq: Number(d.seq) || 0,
              cause: String(d.cause || "gun").slice(0, 8),
              x: Number(d.x) || 0, y: Number(d.y) || 0,
              at: now,
            });
          }
        }
        for (const [uid, d] of [...netDeaths.entries()]) {
          if (now - Number(d.at || 0) > 10000) netDeaths.delete(uid);
        }
      }
    }
  };
}

function sendNow(local, force = false) {
  if (!ws || ws.readyState !== 1) return;
  const now = performance.now();
  if (!force && now - lastSendMs < NET_SEND_INTERVAL_MS) return; // 20 Hz max
  lastSendMs = now;
  const map = currentMapId();
  // Changement de map : annonce (+ flag instance pour les gates).
  // En instance : annonce seule, JAMAIS de pos (aucune présence).
  try {
    if (map !== lastMapSent) {
      // Retire l'ancienne room avant le premier rendu de la nouvelle carte.
      // Sans cette purge, syncNetNpcs pouvait recreer pendant quelques
      // images les NPC du secteur precedent (les "NPC fantomes").
      clearInstanceGameplay();
      // Pendant l'attente du premier snapshot, conserve le mode NPC serveur :
      // le spawner local ne doit pas fabriquer une population provisoire qui
      // disparaitrait 50 ms plus tard. Le repli solo revient apres 3 secondes.
      if (instanceMode !== true) lastNpcSnapMs = performance.now();
      const out = { t: "map", map };
      if (instanceMode === true) out.instance = true;
      ws.send(JSON.stringify(out));
      lastMapSent = map;
    }
  } catch {}
  if (instanceMode === true) return;
  try {
    ws.send(JSON.stringify({
      t: "pos",
      map,
      x: Math.round(Number(local.x) || 0),
      y: Math.round(Number(local.y) || 0),
      vx: Math.round((Number(local.vx) || 0) * 100) / 100,
      vy: Math.round((Number(local.vy) || 0) * 100) / 100,
      angle: Number(local.angle) || 0,
      shipId: String(local.shipId || ""),
      pseudo: String(local.pseudo || "Pilote").slice(0, 20),
      dead: local.dead === true,
      hpPct: Number.isFinite(Number(local.hpPct)) ? local.hpPct : 1,
      shPct: Number.isFinite(Number(local.shPct)) ? local.shPct : 1,
      collectUid: String(local.collectUid || "").slice(0, 64),
      collectPet: local.collectPet === true,
      bg: local.background === true,
      safe: local.safe === true,
      atk: local.atk === true,
      combat: local.combat === "player" ? "player" : (local.combat === "npc" ? "npc" : ""),
      targetName: String(local.targetName || "").slice(0, 64),
      targetHpPct: Math.max(0, Math.min(1, Number(local.targetHpPct) || 0)),
      targetShPct: Math.max(0, Math.min(1, Number(local.targetShPct) || 0)),
      targetHpMax: Math.max(0, Math.round(Number(local.targetHpMax) || 0)),
      targetShMax: Math.max(0, Math.round(Number(local.targetShMax) || 0)),
      tx: Math.round(Number(local.tx) || 0),
      ty: Math.round(Number(local.ty) || 0),
      ammo: String(local.ammo || "x1").slice(0, 16),
      drones: Math.max(0, Math.min(12, Number(local.drones) || 0)),
      dform: String(local.dform || "standard").slice(0, 32),
      fint: Number(local.fint) > 0 ? Number(local.fint) : 0.25,
      bspd: Number(local.bspd) > 0 ? Number(local.bspd) : 4000,
      dslots: String(local.dslots || "").slice(0, 256),
      alt: local.alt === true,
      shots: Math.max(0, Math.floor(Number(local.shots) || 0)),
      rank: String(local.rank || "").slice(0, 64),
      firm: String(local.firm || "").slice(0, 16),
      dind: String(local.dind || "").slice(0, 256),
      ficon: String(local.ficon || "").slice(0, 128),
      mind: String(local.mind || "").slice(0, 128),
      rseq: Math.max(0, Math.floor(Number(local.rseq) || 0)),
      rkind: String(local.rkind || "r310").slice(0, 16),
      rspd: Number(local.rspd) > 0 ? Number(local.rspd) : 1500,
      hpMax: Math.max(1, Math.round(Number(local.hpMax) || 1)),
      shMax: Math.max(0, Math.round(Number(local.shMax) || 0)),
      range: Math.max(200, Math.min(5000, Number(local.range) || 800)),
      peta: local.peta === 1 ? 1 : 0,
      petl: Math.max(1, Math.min(32, Math.round(Number(local.petl) || 1))),
      vmax: Math.max(50, Math.min(5000, Math.round(Number(local.vmax) || 300))),
      petx: Math.round(Number(local.petx) || 0),
      pety: Math.round(Number(local.pety) || 0),
      petd: Number(local.petd) || 0,
      petn: String(local.petn || "").slice(0, 32),
      petf: String(local.petf || "").slice(0, 16),
      petHp: Number.isFinite(Number(local.petHp)) ? Math.max(0, Math.min(1, Number(local.petHp))) : 1,
      petSh: Number.isFinite(Number(local.petSh)) ? Math.max(0, Math.min(1, Number(local.petSh))) : 1,
      petHpMax: Math.max(1, Math.round(Number(local.petHpMax) || 1)),
      petShMax: Math.max(0, Math.round(Number(local.petShMax) || 0)),
    }));
  } catch {}
}

// Appele a chaque frame par ORBIT_ENGINE (cout negligeable, envoi throttle 20 Hz).
// En instance (gate) : socket gardé (tchat/enchères), annonce map seule,
// aucune présence partagée.
export function pushNetplayLocal(local) {
  if (!local || suspended) return;
  lastLocalBuildMs = performance.now();
  pendingLocal = local;
  try {
    const p = String(local.pseudo || "").slice(0, 20);
    if (p) myPseudo = p;
  } catch {}
  ensureNetplayConnection();
  if (instanceMode === true) {
    // Annonce {t:"map", instance:true} si besoin, sans pos.
    try {
      const map = currentMapId();
      if (ws && ws.readyState === 1 && map !== lastMapSent) {
        ws.send(JSON.stringify({ t: "map", map, instance: true }));
        lastMapSent = map;
      }
    } catch {}
    return;
  }
  sendNow(local);
  if ((prune._n = (prune._n || 0) + 1) % 60 === 0) prune();
}

// Firefox prive peut suspendre les timers des le changement d'onglet.
// Envoie l'etat d'arriere-plan sans attendre la prochaine frame du moteur.
export function sendNetplayBackgroundState(background) {
  if (!pendingLocal || suspended || instanceMode === true) return false;
  pendingLocal.background = background === true;
  sendNow(pendingLocal, true);
  return true;
}

export function getNetplayRemotes() {
  return remotes;
}

export function getNetNpcs() {
  return netNpcs;
}

export function getNetDeaths() {
  return netDeaths;
}

export function getNetBoxes() {
  return netBoxes;
}

// Evite au moteur de reconstruire l'etat reseau complet a chaque frame.
// La cadence d'envoi reste strictement identique (20 Hz maximum).
export function netplayLocalUpdateDue() {
  if (suspended) return false;
  const now = performance.now();
  return !pendingLocal || now - lastLocalBuildMs >= NET_SEND_INTERVAL_MS;
}

export function drainNetBoxInbox() {
  if (!netBoxInbox.length) return [];
  return netBoxInbox.splice(0, netBoxInbox.length);
}

export function drainNetDmgInbox() {
  if (!netDmgInbox.length) return [];
  return netDmgInbox.splice(0, netDmgInbox.length);
}

export function drainNetShotEvents() {
  if (!netShotInbox.length) return [];
  return netShotInbox.splice(0, netShotInbox.length);
}

export function clearNetShots() {
  netShotInbox.length = 0;
}

// Evenement de tir exact vers le serveur (retransmis a la room, sans etat).
export function sendShotEvent(ev) {
  if (suspended || instanceMode === true) return;
  if (!ws || ws.readyState !== 1 || !ev || typeof ev !== "object") return;
  try {
    const o = { t: ev.t === "rshot" ? "rshot" : "shot" };
    if (typeof ev.key === "string") o.key = String(ev.key).slice(0, 16);
    if (typeof ev.kind === "string") o.kind = String(ev.kind).slice(0, 16);
    if (typeof ev.petTarget === "string") o.petTarget = String(ev.petTarget).slice(0, 64);
    if (ev.petSource === true) o.petSource = true;
    for (const k of ["x", "y", "ang", "tx", "ty", "spd", "arcScale", "arcBoost", "prange"]) {
      if (Number.isFinite(Number(ev[k]))) o[k] = Number(ev[k]);
    }
    if (Number.isFinite(Number(ev.n))) o.n = Math.max(1, Math.min(4, Math.round(Number(ev.n))));
    if (Number.isFinite(Number(ev.arcDir))) o.arcDir = Number(ev.arcDir) < 0 ? -1 : 1;
    if (ev.sab === true) o.sab = true;
    // MISS partage : le 2e ecran affiche MISS comme le tireur (meme cible lockee).
    if (ev.miss === true) o.miss = true;
    // Volley du tireur (deduplique l'affichage MISS, namespace par expediteur).
    if (Number.isFinite(Number(ev.v))) o.v = Math.max(0, Math.floor(Number(ev.v)));
    ws.send(JSON.stringify(o));
  } catch {}
}

export function clearNetBoxes() {
  netBoxes.clear();
  netBoxInbox.length = 0;
  pendingNetBoxClaims.clear();
}

// Reserve immediatement la box cote client, puis demande au serveur qui a
// gagne la course. La recompense ne doit etre versee qu'apres l'ack `claim`.
export function claimNetBox(uidValue) {
  if (suspended || instanceMode === true || !ws || ws.readyState !== 1) return false;
  const uid = String(uidValue || "").slice(0, 64);
  if (!uid || pendingNetBoxClaims.has(uid)) return false;
  pendingNetBoxClaims.add(uid);
  netBoxes.delete(uid);
  try {
    ws.send(JSON.stringify({ t: "box", op: "collect", uid }));
    return true;
  } catch {
    pendingNetBoxClaims.delete(uid);
    return false;
  }
}

export function netMyId() {
  return myId;
}

// Dernier pseudo envoye au serveur (stable entre deux refresh, contrairement a l'id).
let myPseudo = "";
export function netMyPseudo() {
  return myPseudo;
}

// NPC serveur sains : snapshot recent. Une tolerance de 8 s absorbe les
// micro-coupures sans purger les entites ni casser les locks en combat.
export function netNpcFresh() {
  if (suspended || instanceMode === true || !lastNpcSnapMs) return false;
  try {
    return performance.now() - lastNpcSnapMs < 8000;
  } catch { return false; }
}

// Degats PvP sur PET vers le serveur (cible = id joueur proprietaire).
export function sendPvpPetHit(hit) {
  if (suspended || instanceMode === true) return;
  if (!ws || ws.readyState !== 1 || !hit || !hit.target) return;
  try {
    const h = { t: "pvpPetHit", target: String(hit.target) };
    if (hit.kind === "sab") {
      h.kind = "sab";
      h.dmg = Math.max(0, Number(hit.dmg) || 0);
    } else {
      h.dmg = Math.max(0, Number(hit.dmg) || 0);
      h.pen = Math.max(0, Math.min(1, Number(hit.pen ?? 0)));
      if (Number.isFinite(Number(hit.critChance))) h.critChance = Number(hit.critChance);
      if (Number.isFinite(Number(hit.critMult))) h.critMult = Number(hit.critMult);
      if (Number(hit.slowPct) > 0) h.slowPct = Math.min(95, Number(hit.slowPct));
      if (Number(hit.slowSec) > 0) h.slowSec = Math.min(30, Number(hit.slowSec));
      if (Number(hit.freezeSec) > 0) h.freezeSec = Math.min(5, Number(hit.freezeSec));
    }
    const hasStatus = (h.slowPct > 0 && h.slowSec > 0) || h.freezeSec > 0;
    if ((!(h.dmg > 0) && !hasStatus) || h.dmg > 1e7) return;
    ws.send(JSON.stringify(h));
  } catch {}
}
// Degats PvP vers le serveur (cible = id joueur distant).
export function sendPvpHit(hit) {
  if (suspended || instanceMode === true) return;
  if (!ws || ws.readyState !== 1 || !hit || !hit.target) return;
  try {
    const h = { t: "pvpHit", target: String(hit.target) };
    if (hit.kind === "sab") {
      h.kind = "sab";
      h.dmg = Math.max(0, Number(hit.dmg) || 0);
    } else {
      h.dmg = Math.max(0, Number(hit.dmg) || 0);
      h.pen = Math.max(0, Math.min(1, Number(hit.pen ?? 0)));
      if (Number.isFinite(Number(hit.critChance))) h.critChance = Number(hit.critChance);
      if (Number.isFinite(Number(hit.critMult))) h.critMult = Number(hit.critMult);
      if (Number(hit.slowPct) > 0) h.slowPct = Math.min(95, Number(hit.slowPct));
      if (Number(hit.slowSec) > 0) h.slowSec = Math.min(30, Number(hit.slowSec));
      if (Number(hit.freezeSec) > 0) h.freezeSec = Math.min(5, Number(hit.freezeSec));
    }
    const hasStatus = (h.slowPct > 0 && h.slowSec > 0) || h.freezeSec > 0;
    if ((!(h.dmg > 0) && !hasStatus) || h.dmg > 1e7) return;
    ws.send(JSON.stringify(h));
  } catch {}
}

// Degats sur NPC partage : le serveur tranche (HP, mort, killer).
// La prediction locale reste affichee, le snapshot corrige a 20 Hz.
export function sendNetHit(hit) {
  if (suspended || instanceMode === true) return;
  if (!ws || ws.readyState !== 1 || !hit || !hit.uid) return;
  try {
    const h = { t: "hit", uid: String(hit.uid) };
    if (hit.kind === "sab") {
      h.kind = "sab";
      h.dmg = Math.max(0, Number(hit.dmg) || 0);
    } else {
      h.dmg = Math.max(0, Number(hit.dmg) || 0);
      h.pen = Math.max(0, Math.min(1, Number(hit.pen ?? 0)));
      if (Number.isFinite(Number(hit.critChance))) h.critChance = Number(hit.critChance);
      if (Number.isFinite(Number(hit.critMult))) h.critMult = Number(hit.critMult);
      if (Number(hit.weaken) > 0) h.weaken = Number(hit.weaken);
      if (Number(hit.slowPct) > 0) h.slowPct = Math.min(95, Number(hit.slowPct));
      if (Number(hit.slowSec) > 0) h.slowSec = Math.min(30, Number(hit.slowSec));
      if (Number(hit.freezeSec) > 0) h.freezeSec = Math.min(5, Number(hit.freezeSec));
    }
    const hasStatus = (h.slowPct > 0 && h.slowSec > 0) || h.freezeSec > 0;
    if (!(h.dmg > 0) && !hasStatus) return;
    ws.send(JSON.stringify(h));
    // Diagnostic multi (console) : hits envoyes par type.
    try {
      window.__NETHITS__ = window.__NETHITS__ || { sent: 0, sab: 0, direct: 0, lastDmg: 0, lastUid: "" };
      window.__NETHITS__.sent++;
      if (h.kind === "sab") window.__NETHITS__.sab++;
      else window.__NETHITS__.direct++;
      window.__NETHITS__.lastDmg = h.dmg;
      window.__NETHITS__.lastUid = h.uid;
    } catch {}
  } catch {}
}

// Interpolation + courte extrapolation vers la position predite (avant dessin).
export function tickNetplayRemotes(dt = 0.016) {
  // Lissage independant des FPS.
  const frameDt = Math.max(0, Math.min(0.1, Number(dt) || 0));
  const k = 1 - Math.exp(-18 * frameDt);
  const now = performance.now();
  for (const r of remotes.values()) {
    // Plafond adapte a la cadence observee de l'emetteur : sans lui, un flux
    // a 1 Hz (onglet reduit) depasse systematiquement sa vraie cadence puis
    // revient en arriere a chaque paquet (dent de scie = teleportations).
    const updateInterval = Math.max(50, Math.min(2000, Number(r.updateInterval || 60)));
    const leadCap = r.background === true ? 1.3 : (updateInterval + 120) / 1000;
    const lead = Math.min(predictionLeadSeconds(now - Number(r.sampleAt || now)), leadCap);
    const vx = Number(r.vx || 0), vy = Number(r.vy || 0);
    const spd = Math.hypot(vx, vy);
    const turn = Math.max(-NET_MAX_TURN_RATE, Math.min(NET_MAX_TURN_RATE, Number(r.turn || 0)));
    // Virage regulier (orbite de farm) : prediction en arc de cercle au lieu
    // de la ligne droite, qui raterait chaque virage. Ligne droite sinon.
    let targetX, targetY;
    if (Math.abs(turn) > 0.08 && spd > 60) {
      const th0 = Math.atan2(vy, vx);
      const th1 = th0 + turn * lead;
      const radius = spd / turn;
      targetX = Number(r.x) + radius * (Math.sin(th1) - Math.sin(th0));
      targetY = Number(r.y) + radius * (Math.cos(th0) - Math.cos(th1));
    } else {
      targetX = Number(r.x) + vx * lead;
      targetY = Number(r.y) + vy * lead;
    }
    const rx = Number(r.rx ?? r.x), ry = Number(r.ry ?? r.y);
    const correctionX = targetX - rx, correctionY = targetY - ry;
    const correctionDistance = Math.hypot(correctionX, correctionY);
    if (correctionDistance > netPerf.maxCorrection) netPerf.maxCorrection = Math.round(correctionDistance);
    // Un trou reseau peut faire arriver une correction importante d'un coup.
    // Le lissage exponentiel seul en absorbait ~26 % sur la premiere frame,
    // donnant l'impression d'une teleportation. Le plafond ne touche que le
    // rendu : positions serveur, portee et impacts restent autoritaires.
    const maxCorrection = Math.max(1800, Number(r.vmax) * 2) * frameDt;
    const correctionK = correctionDistance > 0
      ? Math.min(k, maxCorrection / correctionDistance)
      : k;
    r.rx = rx + correctionX * correctionK;
    r.ry = ry + correctionY * correctionK;
    const renderedAngle = Number(r.rangle ?? r.angle) || 0;
    const targetAngle = Number(r.angle) || 0;
    const angleDelta = Math.atan2(Math.sin(targetAngle - renderedAngle), Math.cos(targetAngle - renderedAngle));
    r.rangle = renderedAngle + angleDelta * k;
    const petTargetX = Number(r.petx) + Number(r.petvx || 0) * lead;
    const petTargetY = Number(r.pety) + Number(r.petvy || 0) * lead;
    const prx = Number(r.petrx ?? r.petx), pry = Number(r.petry ?? r.pety);
    r.petrx = prx + (petTargetX - prx) * k;
    r.petry = pry + (petTargetY - pry) * k;
  }
  for (const n of netNpcs.values()) {
    const lead = predictionLeadSeconds(now - Number(n.sampleAt || now));
    const targetX = Number(n.x) + Number(n.vx || 0) * lead;
    const targetY = Number(n.y) + Number(n.vy || 0) * lead;
    const rx = Number(n.rx ?? n.x), ry = Number(n.ry ?? n.y);
    n.rx = rx + (targetX - rx) * k;
    n.ry = ry + (targetY - ry) * k;
  }
}

export function sendSkillUse(skill) {
  if (suspended || instanceMode === true) return false;
  if (!ws || ws.readyState !== 1) return false;
  const key = String(skill || "").toLowerCase();
  if (key !== "iem" && key !== "ish") return false;
  try {
    ws.send(JSON.stringify({ t: "skillUse", skill: key }));
    return true;
  } catch { return false; }
}

// Le rendu des autres joueurs est dans ORBIT_ENGINE (acces aux sprites).
// Ce module ne fait que le reseau : envoi 20 Hz + snapshots + extrapolation.

try {
  window.__NETPLAY__ = { pushNetplayLocal, netplayLocalUpdateDue, getNetplayRemotes, getNetNpcs, getNetDeaths, getNetBoxes, drainNetBoxInbox, drainNetDmgInbox, drainNetShotEvents, clearNetShots, sendShotEvent, sendPvpHit, getNetSelf, suspendNetplay, netSuspended, setNetInstanceMode, netInInstance, netConnected, sendPing, netPongAge, netHelloAckAge, netServerVersion, forceNetReconnect, clearNetBoxes, claimNetBox, sendNetHit, netMyId, netMyPseudo, netIsAuthed, netNpcFresh, netplayStatus, drainNetChatInbox, sendChat, drainNetAuctionInbox, sendAuctionBid, drainNetPvpKillInbox, drainNetPvpPetKillInbox, sendPvpPetHit, sendPvpLoot, sendPvpLootTake, drainNetPvpLootInbox, drainNetPvpLootTakeInbox, drainNetAdminKickInbox, drainNetAdminBoomInbox, drainNetBannedInbox, netDisconnect, getNetGroup, getNetFriendsOnline, drainNetGroupInviteInbox, drainNetGroupNoticeInbox, drainNetWhisperInbox, sendGroupCreate, sendGroupInvite, sendGroupAccept, sendGroupDecline, sendGroupLeave, sendGroupKick, sendGroupChat, sendGroupSync, sendWhisper, drainNetFriendRequestInbox, consumeFriendsDirty, sendFriendPing, sendFriendResponded };
  window.__NETPLAY_REMOTES__ = remotes;
  window.__NETPLAY_NPCS__ = netNpcs;
  window.__NETPLAY_BOXES__ = netBoxes;
  window.__NETPERF__ = netPerf;
} catch {}
