// SRC/CORE/STATION_NET.js — Base de Combat PARTAGÉE (comme les enchères).
// Le serveur tranche (placement, retrait, construction, remboursements) ;
// ce module fusionne la vue filtrée par clan dans zoneStation.
// Sans snapshot serveur, les actions de station restent verrouillées.

import {
  drainNetStationInbox,
  netConnected,
  netIsAuthed,
  netMyId,
  requestStationSync,
} from "./NETPLAY.js";

let sharedMap = ""; // mapId dont le premier état serveur a été reçu
let sharedZone = null; // objet zoneStation ayant réellement reçu ce sync

// Partagée si le serveur a envoyé un état pour la carte courante et qu'on
// est encore connecté. Le tick demande le sync jusqu'au premier reçu.
export function isSharedStation(mapId) {
  try {
    if (!sharedMap) return false;
    if (!netConnected()) return false;
    if (mapId && String(mapId).toLowerCase() !== sharedMap) return false;
    return true;
  } catch {
    return false;
  }
}

export function sharedStationMap() {
  return sharedMap;
}

// Oublié après une coupure/reconnexion : force une nouvelle sync complète.
export function resetSharedStation() {
  sharedMap = "";
  sharedZone = null;
}

function meId() {
  try {
    return String(netMyId() || "");
  } catch {
    return "";
  }
}

// Demande l'état au serveur (jusqu'au premier sync reçu, max 1 / 2 s).
let lastStationSyncReq = 0;
export function ensureStationSync(mapId, zoneStation) {
  try {
    const map = String(mapId || "").toLowerCase();
    if (!map || !zoneStation) return;
    // Une bascule/reconstruction de map recrée `zoneStation`. Même si son
    // identifiant est identique, ce nouvel objet doit recevoir un snapshot ;
    // sinon il reste vide/non construit jusqu'au prochain Ctrl+F5.
    if (sharedMap === map && sharedZone === zoneStation) return;
    if (!netConnected()) return;
    const now = Date.now();
    if (now - lastStationSyncReq < 2000) return;
    lastStationSyncReq = now;
    requestStationSync(map);
  } catch {}
}

// Fusionne la vue serveur (filtrée par clan) dans la station locale.
// Les dx/dy restent ceux de la map (positions connues) ; le serveur ne
// donne que le contenu : hub, slots, built, owner.
export function pumpStationNet(zoneStation, mapId) {
  let inbox = [];
  try {
    inbox = drainNetStationInbox();
  } catch {
    inbox = [];
  }
  if (!inbox.length) return { dirty: false, events: [] };
  const events = [];
  let dirty = false;
  const map = String(mapId || "").toLowerCase();
  for (const msg of inbox) {
    if (!msg || typeof msg !== "object") continue;
    try {
      if (msg.t === "stationSync") {
        if (String(msg.map || "").toLowerCase() !== map) continue;
        if (!zoneStation) continue;
        if (sharedMap === map && zoneStation.built) {
          if (zoneStation.hub && !(msg.hub && msg.hub.resourceId)) {
            events.push({ type: "stationDestroyed", target: "hub" });
          } else {
            const nextSlots = msg.slots && typeof msg.slots === "object" ? msg.slots : {};
            for (const slot of zoneStation.slots || []) {
              if (slot?.resourceId && !nextSlots[slot.id]?.resourceId) {
                events.push({ type: "stationDestroyed", target: String(slot.id) });
              }
            }
          }
        }
        // La vue du serveur fait autorité. Une reconnexion ou un redémarrage
        // ne recrédite jamais un module : seuls un retrait confirmé ou la
        // victoire d'un autre clan peuvent le rendre à son poseur.
        sharedMap = map;
        sharedZone = zoneStation;
        applyStationView(zoneStation, msg);
        dirty = true;
      } else if (msg.t === "stationInstallOk") {
        if (String(msg.map || "").toLowerCase() !== map) continue;
        events.push({ type: "installed", slot: String(msg.slot || ""), resourceId: String(msg.resourceId || "") });
        dirty = true;
      } else if (msg.t === "stationReplaceOk") {
        if (String(msg.map || "").toLowerCase() !== map) continue;
        events.push({ type: "replaced", slot: String(msg.slot || ""), resourceId: String(msg.resourceId || ""), replaced: String(msg.replaced || "") });
        dirty = true;
      } else if (msg.t === "stationReplaceCancelOk") {
        if (String(msg.map || "").toLowerCase() !== map) continue;
        events.push({ type: "replaceCancelled", slot: String(msg.slot || ""), resourceId: String(msg.resourceId || "") });
        dirty = true;
      } else if (msg.t === "stationUninstallOk") {
        if (String(msg.map || "").toLowerCase() !== map) continue;
        events.push({ type: "uninstalled", slot: String(msg.slot || ""), resourceId: String(msg.resourceId || "") });
        dirty = true;
      } else if (msg.t === "stationBuildSettle") {
        if (String(msg.map || "").toLowerCase() !== map) continue;
        const me = meId();
        for (const r of Array.isArray(msg.refunds) ? msg.refunds : []) {
          if (r && String(r.userId || "") === me && r.resourceId) {
            events.push({ type: "refunded", resourceId: String(r.resourceId) });
          }
        }
        dirty = true;
      } else if (msg.t === "stationReject") {
        events.push({ type: "reject", reason: String(msg.reason || "Action refusée.") });
      }
    } catch {}
  }
  return { dirty, events };
}

function applyStationView(zoneStation, msg) {
  // Hub (null si vide ou masqué).
  if (msg.hub && typeof msg.hub === "object" && msg.hub.resourceId) {
    zoneStation.hub = String(msg.hub.resourceId);
    zoneStation.hubClan = String(msg.hub.clan || "").toUpperCase() || null;
    zoneStation.hubCd = Math.max(0, Number(msg.hub.cooldownUntil) || 0);
    zoneStation.hubPseudo = String(msg.hub.pseudo || "");
    zoneStation.hubPlacer = String(msg.hub.userId || "") || null;
    zoneStation.hubHp = Math.max(0, Number(msg.hub.hp) || 0);
    zoneStation.hubHpMax = Math.max(1, Number(msg.hub.hpMax) || 1);
  } else {
    zoneStation.hub = null;
    zoneStation.hubClan = null;
    zoneStation.hubCd = 0;
    zoneStation.hubPseudo = "";
    zoneStation.hubPlacer = null;
    zoneStation.hubHp = 0;
    zoneStation.hubHpMax = 1;
  }
  // Slots : le serveur ne connaît que les contenus, pas les positions.
  // (une instance par clan : pas de masquage, ce qui arrive est à nous
  // ou appartient à la station construite, publique).
  const seen = msg.slots && typeof msg.slots === "object" ? msg.slots : {};
  for (const slot of zoneStation.slots || []) {
    if (!slot?.id) continue;
    const s = seen[slot.id];
    const hasReplace = s && typeof s === "object" && s.replace && typeof s.replace === "object" && s.replace.resourceId;
    if (s && typeof s === "object" && (s.resourceId || hasReplace)) {
      if (s.resourceId) {
        slot.resourceId = String(s.resourceId);
        slot.clan = String(s.clan || "").toUpperCase() || null;
        slot.pseudo = String(s.pseudo || "");
        slot.cooldownUntil = Math.max(0, Number(s.cooldownUntil) || 0);
        slot.placerId = String(s.userId || "") || null;
        slot.hp = Math.max(0, Number(s.hp) || 0);
        slot.hpMax = Math.max(1, Number(s.hpMax) || 1);
        slot.occupied = false;
      } else {
        // Repose en cours : ruines affichées, le module arrive à l'échéance.
        slot.resourceId = null;
        slot.clan = null;
        slot.pseudo = "";
        slot.cooldownUntil = 0;
        slot.placerId = null;
        slot.hp = 0;
        slot.hpMax = 1;
        slot.occupied = false;
      }
      // Remplacement en cours : l'ancien reste affiché, le décompte vient du remplaçant.
      if (s.replace && typeof s.replace === "object" && s.replace.resourceId) {
        slot.replace = {
          resourceId: String(s.replace.resourceId),
          clan: String(s.replace.clan || "").toUpperCase() || null,
          pseudo: String(s.replace.pseudo || ""),
          cooldownUntil: Math.max(0, Number(s.replace.cooldownUntil) || 0),
        };
        slot.cooldownUntil = Math.max(Number(slot.cooldownUntil) || 0, Number(s.replace.cooldownUntil) || 0);
      } else {
        slot.replace = null;
      }
    } else {
      slot.resourceId = null;
      slot.clan = null;
      slot.pseudo = "";
      slot.cooldownUntil = 0;
      slot.placerId = null;
      slot.hp = 0;
      slot.hpMax = 1;
      slot.occupied = false;
      slot.replace = null;
    }
  }
  zoneStation.built = msg.built === true;
  zoneStation.owner = msg.owner && typeof msg.owner === "object" ? { ...msg.owner } : {};
  zoneStation.repair = (msg.repair && typeof msg.repair === "object" && Number(msg.repair.until) > 0)
    ? { until: Number(msg.repair.until), rateHub: Math.max(1, Number(msg.repair.rateHub) || 85000), rateSlot: Math.max(1, Number(msg.repair.rateSlot) || 42500) }
    : null;
  zoneStation.placed = Math.max(0, Number(msg.placed) || 0);
  zoneStation.total = Math.max(1, Number(msg.total) || 10);
  zoneStation.perClan = Array.isArray(msg.perClan) ? msg.perClan : null;
}
