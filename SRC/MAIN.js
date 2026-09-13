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
 *
 * ✅ ANTI-TRICHE: une ?map= n'est honorée que si elle vient d'une transition
 * du jeu (__GO_TO_MAP__ laisse toujours un jeton spawnMapId en session).
 * Sinon (URL éditée à la main, favori...) on impose la carte sauvegardée
 * (ou la base de la faction pour un nouveau compte) et on retire ?spawn=.
 */

const params = new URLSearchParams(location.search);

// ✅ Map par défaut pour les nouveaux joueurs / nouveaux vaisseaux
const DEFAULT_MAP = getFactionHomeMap(getCurrentUserFull()?.faction) || DEFAULT_MAP_ID;

// ✅ Récupère la map depuis l'URL ou depuis la sauvegarde
let mapName = params.get("map");
let usedSavedMap = false;
let urlTokenOk = false;
try {
  const tokenMap = sessionStorage.getItem("spawnMapId");
  urlTokenOk = !!tokenMap && !!mapName
    && String(tokenMap).toLowerCase() === String(mapName).toLowerCase();
} catch {}

if (!mapName) {
  const state = getActiveHangarState();

  if (state.map) {
    mapName = state.map;
    usedSavedMap = true;
  } else {
    mapName = DEFAULT_MAP;
  }
} else if (!urlTokenOk) {
  const state = getActiveHangarState();
  mapName = state.map || DEFAULT_MAP;
  usedSavedMap = true;
  try {
    const cleanUrl = new URL(location.href);
    cleanUrl.searchParams.set("map", String(mapName));
    cleanUrl.searchParams.delete("spawn");
    history.replaceState(history.state ?? null, "", cleanUrl);
  } catch {}
}

mapName = normalizeMapId(mapName);

const spawnPortalId = urlTokenOk ? params.get("spawn") || null : null;

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

  // ✅ Mémorise le portail d'arrivée (même onglet : survit au rechargement).
  // resetRun le lit en priorité ; l'URL ?map=&spawn= sert de secours.
  // spawnMapId sert AUSSI de jeton anti-triche : au chargement, une ?map=
  // sans jeton correspondant est ignorée (édition manuelle de l'URL).
  try {
    sessionStorage.setItem("spawnMapId", String(normalizeMapId(mapId)));
    if (spawnId) sessionStorage.setItem("spawnPortalId", String(spawnId));
    else sessionStorage.removeItem("spawnPortalId");
  } catch {}

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
