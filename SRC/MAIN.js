// SRC/MAIN.js
"use strict";

import { getCurrentUserFull, getActiveHangarState } from "./CORE/ACCOUNT.js";
import { DEFAULT_MAP_ID, getMapLoader, normalizeMapId } from "./CORE/MAP_REGISTRY.js";
import { getFactionHomeMap } from "./CORE/FACTIONS.js";

window.addEventListener("storage", (e) => {
  if (e.key !== "orbit_sync") return;
  // ✅ quand un vaisseau est activé dans profile, on reload le jeu
  location.reload();
});


function bootGame() {
  const u = getCurrentUserFull();
  const st = getActiveHangarState(); // { pos, map }

  // ✅ nouveau compte / jamais joué
  const targetMap = st?.map || getFactionHomeMap(u?.faction);

  // ✅ si on n'est pas déjà sur la bonne map => naviguer
  if (window.__CURRENT_MAP_ID__ !== targetMap && typeof window.__GO_TO_MAP__ === "function") {
    window.__GO_TO_MAP__(targetMap);
    return; // IMPORTANT: on sort, le reload de map relancera bootGame
  }

  // ✅ ici seulement tu démarres startOrbitGame(...) sur la map courante
  // startOrbitGame({ rules: MAP_RULES[window.__CURRENT_MAP_ID__], ... })
}


/**
 * Choix de map :
 * - index.html?map=1-1
 * - index.html?map=1-2
 * + spawn optionnel: &spawn=p_12_to_11
 * 
 * ✅ NOUVEAU: Si pas de ?map= dans l'URL, on charge la dernière map sauvegardée du hangar actif
 */

const params = new URLSearchParams(location.search);

// ✅ Map par défaut pour les nouveaux joueurs / nouveaux vaisseaux
const DEFAULT_MAP = getFactionHomeMap(getCurrentUserFull()?.faction) || DEFAULT_MAP_ID;

// ✅ Récupère la map depuis l'URL ou depuis la sauvegarde
let mapName = params.get("map");
let usedSavedMap = false;

if (!mapName) {
  const state = getActiveHangarState();
  
  if (state.map) {
    mapName = state.map;
    usedSavedMap = true;
  } else {
    mapName = DEFAULT_MAP;
  }
}

mapName = normalizeMapId(mapName);

const spawnPortalId = params.get("spawn") || null;

// accessible depuis OrbitEngine
window.__SPAWN_PORTAL_ID__ = spawnPortalId;
window.__CURRENT_MAP_ID__ = mapName; // ✅ pour que OrbitEngine puisse sauvegarder
window.__ORBIT_MAP_TRANSITION__ = false;

const mapPreloads = new Map();
window.__PRELOAD_MAP__ = (mapId, spawnId = null) => {
  const normalizedId = normalizeMapId(mapId);
  const key = normalizedId;
  if (!mapPreloads.has(key)) {
    mapPreloads.set(key, getMapLoader(normalizedId)());
  }
  return mapPreloads.get(key);
};

window.__SWITCH_MAP__ = async (mapId, spawnId = null) => {
  const normalizedId = normalizeMapId(mapId);
  const mod = await window.__PRELOAD_MAP__(normalizedId, spawnId);
  if (!mod || typeof mod.init !== "function") throw new Error("La destination ne peut pas être initialisée");
  window.__PENDING_MAP_SWITCH__ = { mapId: normalizedId, spawnId };
  window.__ORBIT_SWITCH_PROMISE__ = null;
  mod.init();
  const pending = window.__ORBIT_SWITCH_PROMISE__;
  if (!pending) throw new Error("Le moteur n'a pas accepté le changement interne de carte");
  try {
    await pending;
  } finally {
    window.__PENDING_MAP_SWITCH__ = null;
  }
};

// fonction globale pour changer de map (recharge la page)
window.__GO_TO_MAP__ = (mapId, spawnId = null) => {
  // ✅ Trigger sauvegarde avant de quitter la map
  if (typeof window.__SAVE_BEFORE_LEAVE__ === "function") {
    try {
      window.__SAVE_BEFORE_LEAVE__();
    } catch (e) {
      console.warn("[GO_TO_MAP] Erreur sauvegarde:", e);
    }
  }
  
  const url = new URL(location.href);
  url.searchParams.set("map", String(mapId));
  if (spawnId) url.searchParams.set("spawn", String(spawnId));
  else url.searchParams.delete("spawn");
  location.href = url.toString();
};

// ✅ guard : si pas connecté → auth
if (!localStorage.getItem("orbit_current_user")) {
  location.href = "./PUBLIC/AUTH.html";
}


const loader = getMapLoader(mapName);

loader()
  .then((mod) => {
    if (!mod || typeof mod.init !== "function") {
      throw new Error("La map ne contient pas export function init()");
    }
    mod.init();
  })
  .catch((err) => {
    console.error(err);
    alert("Erreur chargement map. Ouvre la console (F12).");
  });
