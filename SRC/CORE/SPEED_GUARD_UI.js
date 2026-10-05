let active = false;
let previousFocus = null;
const inertBefore = new Map();

// Aucun bouton de fermeture. Les controles derriere le panneau deviennent
// inertes ; Escape, Tab et les raccourcis de jeu ne peuvent pas le masquer.
export function renderSpeedGuard(blocked) {
  const overlay = document.getElementById("speedGuardOverlay");
  if (!overlay) return;
  const next = blocked === true;
  const wasActive = active;
  active = next;
  if (next) {
    if (!wasActive) previousFocus = document.activeElement;
    for (const child of document.body.children) {
      if (child === overlay || child.tagName === "SCRIPT" || child.tagName === "STYLE") continue;
      if (!inertBefore.has(child)) inertBefore.set(child, child.inert);
      child.inert = true;
    }
    overlay.style.display = "flex";
    // La couche modale du navigateur passe devant tous les z-index du jeu.
    if (!overlay.open) overlay.showModal();
    if (!wasActive) overlay.focus({ preventScroll: true });
  } else if (wasActive) {
    overlay.close();
    overlay.style.display = "none";
    for (const [child, wasInert] of inertBefore) child.inert = wasInert;
    inertBefore.clear();
    if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    previousFocus = null;
  }
}

document.addEventListener("cancel", event => {
  if (active && event.target.id === "speedGuardOverlay") event.preventDefault();
}, true);

document.addEventListener("keydown", event => {
  if (!active) return;
  if (event.key === "F5" || ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "r")) return;
  event.preventDefault();
  event.stopImmediatePropagation();
}, true);
document.addEventListener("focusin", event => {
  if (!active) return;
  const overlay = document.getElementById("speedGuardOverlay");
  if (overlay && !overlay.contains(event.target)) overlay.focus({ preventScroll: true });
}, true);
