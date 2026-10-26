"use strict";
import { getCurrentUserFull, setCurrentUserTitle, setCurrentUserTitleVisible, refreshCurrentUserTitles } from "../SRC/CORE/ACCOUNT.js";
import { isTitleUnlocked, getAllTitlesSorted } from "../SRC/DATA/TITLES.js";
import { escapeHtml } from "./UI_DOM.js";
import { isWindowShown } from "../SRC/CORE/BACKGROUND_REFRESH.js";

let started = false;

export function initTitlesUI() {
  if (started) return;
  started = true;
  const list = document.getElementById("titleList");
  const status = document.getElementById("titleStatus");
  const toggle = document.getElementById("titleShowToggle");
  if (!list) return;

  // Fenêtre fermée : le déblocage des titres continue (visible par tous en
  // multi), au plus 1x/2 s, sans reconstruire la liste. Chaque sauvegarde
  // relançait sinon déblocage + renormalisation + DOM complet en arrière-plan.
  let lastHiddenRefresh = 0;
  function render() {
    if (!isWindowShown("titleWindow")) {
      const now = Date.now();
      if (now - lastHiddenRefresh < 2000) return;
      lastHiddenRefresh = now;
      try { refreshCurrentUserTitles(); } catch {}
      return;
    }
    try { refreshCurrentUserTitles(); } catch {}
    const user = getCurrentUserFull();
    const unlocked = new Set(Array.isArray(user?.titles?.unlocked) ? user.titles.unlocked.map(String) : []);
    const activeId = user?.titles?.activeId != null ? String(user.titles.activeId) : null;
    const show = user?.titles?.show !== false;
    if (toggle) toggle.checked = show;
    list.innerHTML = "";
    const defs = getAllTitlesSorted(user);
    for (const def of defs) {
      const has = unlocked.has(def.id) || isTitleUnlocked(user, def.id);
      const row = document.createElement("label");
      row.className = "settingsCheck" + (has ? "" : " isLocked") + (activeId === def.id ? " isActive" : "");
      row.setAttribute("for", `title-${def.id}`);
      const input = document.createElement("input");
      input.type = "checkbox";
      input.id = `title-${def.id}`;
      input.value = def.id;
      input.checked = activeId === def.id;
      input.disabled = !has;
      input.addEventListener("change", () => {
        if (!input.checked) { render(); return; }
        try {
          const res = setCurrentUserTitle(def.id);
          if (res?.ok) {
            if (status) status.textContent = `Titre actif : ${def.name}`;
            try { window.dispatchEvent(new CustomEvent("orbit:titles-updated")); } catch {}
          } else if (status) status.textContent = res?.error || "Titre non débloqué.";
        } catch { if (status) status.textContent = "Impossible de changer de titre."; }
        render();
      });
      const txt = document.createElement("span");
      txt.innerHTML = `<b>&lt; ${escapeHtml(def.name)} &gt;</b>` + (has ? `<small>${escapeHtml(def.desc)}</small>` : "");
      // Couleur via variable CSS (prioritaire sur le !important des paramètres).
      try {
        txt.style.setProperty("--tc", def.color);
        txt.querySelector("b")?.style.setProperty("color", def.color, "important");
      } catch {}
      row.appendChild(input);
      row.appendChild(txt);
      list.appendChild(row);
    }
    const n = [...unlocked].length;
    if (status && !status.dataset.pinned) status.textContent = `${n}/${defs.length} titres débloqués`;
  }

  toggle?.addEventListener("change", () => {
    try {
      setCurrentUserTitleVisible(toggle.checked);
      if (status) { status.dataset.pinned = "1"; status.textContent = toggle.checked ? "Titre visible par tous." : "Titre masqué pour tous."; window.setTimeout(() => { delete status.dataset.pinned; render(); }, 1500); }
      try { window.dispatchEvent(new CustomEvent("orbit:titles-updated")); } catch {}
    } catch {}
    render();
  });

  // Jamais PENDANT la diffusion d'une autre mutation : refreshCurrentUserTitles
  // fait sauver la progression du moteur, qui n'a pas encore adopté le solde
  // de cette mutation (ex : achat de disques -> débit écrasé par l'ancien
  // solde = crédits dupliqués). Juste après, regroupé.
  let deferredRender = 0;
  const renderSoon = () => {
    if (deferredRender) return;
    deferredRender = window.setTimeout(() => { deferredRender = 0; render(); }, 0);
  };
  try {
    window.addEventListener("orbit:user-updated", renderSoon);
    window.addEventListener("orbit:titles-updated", renderSoon);
    window.addEventListener("orbit:window-restoring", (e) => { if (e?.detail?.id === "titleWindow") render(); });
  } catch {}
  render();
}
