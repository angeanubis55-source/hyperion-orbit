// Politique d'actualisation des panneaux ; les simulations et sauvegardes
// ne passent pas par ce filtre. La valeur reste en memoire pendant la session.
let backgroundRefresh = "enabled";

export function normalizeBackgroundRefresh(value) {
  return value === "disabled" ? "disabled" : "enabled";
}

export function setBackgroundRefresh(value) {
  backgroundRefresh = normalizeBackgroundRefresh(value);
  return backgroundRefresh;
}

export function shouldRefreshWindow(target) {
  if (backgroundRefresh === "enabled") return true;
  const root = typeof target === "string" ? document.getElementById(target) : target;
  if (!root) return false;
  // Lire les marqueurs DOM, sans provoquer de calcul de style ou de layout.
  for (let node = root; node; node = node.parentElement) {
    if (node.hidden || node.style?.display === "none"
      || node.classList?.contains("gameWinMinimized")
      || node.classList?.contains("gameWinClosing")) return false;
  }
  return true;
}
