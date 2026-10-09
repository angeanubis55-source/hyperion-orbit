"use strict";

// Mode téléphone (affiché "Debug mode") : interrupteur central des
// optimisations "fenêtre fermée = zéro calcul" (carte stellaire paresseuse,
// assemblage, groupe/amis/clan, enchères, snapshot des capacités).
// Réglage : Paramètres > Général > Démarrage. Décoché = comportement normal
// d'avant. (Dés)activer redémarre le jeu pour tout réappliquer proprement.
//
// Module feuille (aucun import) pour éviter tout cycle : importé par
// ORBIT_ENGINE.js et par les UI (UI_GROUP, UI_FRIENDS, UI_CLAN, UI_AUCTION).
// La valeur est lue dans le même stockage que GAME_SETTINGS
// ("orbit_game_settings_v1"), avec un cache mémoire pour ne jamais lire
// localStorage à chaque image. Le moteur pousse la valeur via
// setPhoneModeCached() au démarrage, au changement et au reset des réglages.
const SETTINGS_KEY = "orbit_game_settings_v1";

let cached = null;

export function isPhoneMode() {
  if (cached !== null) return cached;
  try {
    if (typeof localStorage === "undefined") {
      cached = false;
      return false;
    }
    const raw = localStorage.getItem(SETTINGS_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    cached = parsed != null && typeof parsed === "object" && parsed.phoneMode === true;
  } catch {
    cached = false;
  }
  return cached;
}

export function setPhoneModeCached(value) {
  cached = value === true;
}

export function resetPhoneModeCache() {
  cached = null;
}
