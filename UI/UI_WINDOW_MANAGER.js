(() => {
  if (window.GameWindowManager) return;

  let topZ = 90000;

  const windows = new Map();

  function bringWindowToFront(card) {
    if (!card || card.classList.contains("gameWinMinimized")) return;

    // L'Espace pilote vit dans #profileOverlay, la Boutique dans
    // #shopOverlay et les Hangars dans #hangarOverlay : on remonte le
    // conteneur avec la carte, sinon son z-index fixe (90000) le garderait
    // toujours derrière les fenêtres HUD déjà remontées.
    const overlay = card.closest("#profileOverlay, #shopOverlay, #hangarOverlay");
    if (overlay) overlay.style.setProperty("z-index", String(++topZ), "important");

    // Le dock reste au-dessus des fenêtres. Si la pile devient trop haute,
    // on la compacte en conservant exactement l'ordre visuel actuel.
    if (topZ >= 95000) {
      [...document.querySelectorAll(".gameWindow"), document.getElementById("profileOverlay"), document.getElementById("shopOverlay"), document.getElementById("hangarOverlay")]
        .filter((windowCard) => windowCard && windowCard.style.display !== "none")
        .sort((a, b) => (Number(a.style.zIndex) || 90000) - (Number(b.style.zIndex) || 90000))
        .forEach((windowCard, index) => windowCard.style.setProperty("z-index", String(90001 + index), "important"));
      topZ = 90000 + document.querySelectorAll(".gameWindow").length;
    }

    card.style.setProperty("z-index", String(++topZ), "important");
  }

  // Capture également les fenêtres ajoutées plus tard : tout clic dans une
  // fenêtre, son contenu ou sa barre de déplacement la remet au premier plan.
  document.addEventListener("pointerdown", (event) => {
    const card = event.target instanceof Element ? event.target.closest(".gameWindow") : null;
    if (card) bringWindowToFront(card);
  }, { capture: true });

  const WIN_POS_PREFIX = "orbit_hud_window_pos:";
  const WIN_STATE_PREFIX = "orbit_hud_window_state:";

function posKey(id) {
  return WIN_POS_PREFIX + id;
}

function stateKey(id) {
  return WIN_STATE_PREFIX + id;
}

function loadWindowOpenState(id) {
  try {
    const raw = localStorage.getItem(stateKey(id));
    if (raw === null) return null;
    const data = JSON.parse(raw);
    return typeof data?.open === "boolean" ? data.open : null;
  } catch {
    return null;
  }
}

function saveWindowOpenState(id, open) {
  try {
    localStorage.setItem(stateKey(id), JSON.stringify({ open: !!open, savedAt: Date.now() }));
  } catch {}
}

function loadWindowPosition(id) {
  try {
    const raw = localStorage.getItem(posKey(id));
    if (!raw) return null;

    const data = JSON.parse(raw);
    if (!data || typeof data !== "object") return null;

    return {
      left: Number(data.left),
      top: Number(data.top),
      width: Number(data.width),
    };
  } catch {
    return null;
  }
}

function saveWindowPosition(id, card) {
  if (!id || !card) return;
  // Ne jamais persister une géométrie mesurée pendant une animation
  // d'ouverture/fermeture (scale) : ça figerait une largeur écrasée
  // ("trait") restaurée ensuite à chaque ouverture.
  try {
    if (card.classList.contains("gameWinOpening") || card.classList.contains("gameWinClosing")) return;
  } catch {}
  const r = card.getBoundingClientRect();
  if (!(r.width >= 160) || !(r.height >= 40)) return;

  try {
    localStorage.setItem(
      posKey(id),
      JSON.stringify({
        left: Math.round(r.left),
        top: Math.round(r.top),
        width: Math.round(r.width),
        savedAt: Date.now(),
      })
    );
  } catch {}
}

function applySavedWindowPosition(id, card) {
  if (!id || !card) return false;

  const saved = loadWindowPosition(id);
  if (!saved) return false;

  // Auto-réparation : une largeur sauvegardée anormalement petite
  // (mesurée écrasée par le passé) est ignorée, le CSS reprend la main.
  const savedWidth = Number(saved.width);
  const width = Number.isFinite(savedWidth) && savedWidth >= 200
    ? Math.max(
      140,
      Math.min(savedWidth, window.innerWidth - 20)
    )
    : null;

  const p = clampToScreen(
    card,
    Number.isFinite(saved.left) ? saved.left : 14,
    Number.isFinite(saved.top) ? saved.top : 14
  );

  card.classList.add("floating");

  card.style.position = "fixed";
  card.style.left = `${Math.round(p.left)}px`;
  card.style.top = `${Math.round(p.top)}px`;
  card.style.right = "auto";
  card.style.bottom = "auto";
  if (width !== null) {
    card.style.width = `${Math.round(width)}px`;
    card.style.minWidth = "0";
    card.style.maxWidth = "none";
  } else {
    card.style.width = "";
    card.style.minWidth = "";
    card.style.maxWidth = "";
  }
  card.style.boxSizing = "border-box";
  bringWindowToFront(card);

  return true;
}

function clearSavedWindowPositions() {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && k.startsWith(WIN_POS_PREFIX)) {
        localStorage.removeItem(k);
      }
    }
  } catch {}
}

  function getDock() {
    let dock = document.getElementById("gameWindowDock");

    if (!dock) {
      dock = document.createElement("div");
      dock.id = "gameWindowDock";
      document.body.appendChild(dock);
    }

    return dock;
  }

  function isInteractive(el) {
    return !!el.closest(`
      button,
      input,
      textarea,
      select,
      option,
      a,
      canvas,
      .gameWinIcon,
      .slot,
      .slotBox,
      .itemRow,
      .shipCard,
      .shipModRow,
      .fitCfgBtn,
      [data-no-drag]
    `);
  }

function ensureWindowBar(card, title, icon, minimizable = true) {
  let bar = card.querySelector(":scope > .gameWinBar");

  if (bar) return bar;

  bar = document.createElement("div");
  bar.className = "gameWinBar";

  bar.innerHTML = `
    <div class="gameWinIcon" aria-hidden="true">${icon}</div>
    <div class="gameWinTitle">${title}</div>
    ${minimizable ? '<button class="gameWinMinBtn" type="button" title="Réduire" data-no-drag>−</button>' : ''}
  `;

  card.insertBefore(bar, card.firstChild);

  return bar;
}

  function makeDockIcon(id, title, icon) {
    const dock = getDock();

    let btn = dock.querySelector(`[data-window-id="${id}"]`);
    if (btn) { wireDockIconButton(btn); return btn; }

    btn = document.createElement("button");
    btn.type = "button";
    btn.className = "gameDockIcon";
    btn.dataset.windowId = id;
    btn.title = title;
    btn.innerHTML = `<span>${icon}</span>`;

    dock.appendChild(btn);
    wireDockIconButton(btn);

    return btn;
  }

  // États officiels des icônes (featuresMenu_texture) : idle / hover /
  // select doré (fenêtre ouverte). Le nom est lu une fois puis figé en
  // data-menu-icon (le src change à chaque état).
  function dockMenuIconName(btn) {
    const img = btn ? btn.querySelector("span img") : null;
    if (!img) return null;
    if (img.dataset.menuIcon) return img.dataset.menuIcon;
    const match = String(img.getAttribute("src") || "").match(/\/MENU\/([A-Za-z0-9_]+)\.png/i);
    const base = match ? match[1] : null;
    if (!base || /_(hover|select)$/i.test(base)) return null;
    img.dataset.menuIcon = base;
    return base;
  }

  function setDockIconVariant(btn, variant) {
    const img = btn ? btn.querySelector("span img") : null;
    const name = btn && img ? (img.dataset.menuIcon || dockMenuIconName(btn)) : null;
    if (!img || !name) return;
    const key = variant ? `${name}_${variant}` : name;
    if (img.dataset.iconState === key) return;
    img.dataset.iconState = key;
    const base = "ASSETS/UI/MENU/";
    img.onerror = () => {
      // Pas de variante officielle (ex : booster) : on reste sur idle.
      img.onerror = null;
      img.dataset.iconState = name;
      img.src = base + name + ".png";
    };
    img.src = base + key + ".png";
  }

  function refreshDockIcon(btn) {
    if (!btn) return;
    let hover = false;
    try { hover = btn.matches(":hover"); } catch {}
    const active = btn.classList.contains("dockIconActive");
    setDockIconVariant(btn, active ? "select" : (hover ? "hover" : ""));
  }

  // Boutons gérés par leur propre logique d'ouverture (overlays profil/boutique/hangars) :
  // on ne leur ajoute PAS le toggle générique pour éviter un double basculement.
  const DOCK_ICONS_WITH_CUSTOM_TOGGLE = new Set(["btnGameHub", "btnShopHub", "btnHangarHub"]);

  function wireDockIconButton(btn) {
    if (!btn || btn.__dockIconWired) return;
    btn.__dockIconWired = true;
    const name = dockMenuIconName(btn);
    if (name) {
      // Précharge les 3 états pour un survol sans flash.
      for (const suffix of ["", "_hover", "_select"]) {
        const pre = new Image();
        pre.src = `ASSETS/UI/MENU/${name}${suffix}.png`;
      }
    }
    btn.addEventListener("mouseenter", () => refreshDockIcon(btn));
    btn.addEventListener("mouseleave", () => refreshDockIcon(btn));
    refreshDockIcon(btn);
    // Toggle générique ouvrir / réduire. S'applique aux boutons créés par le
    // manager COMME aux boutons déjà présents dans le HTML (ex : Paramètres),
    // qui n'avaient sinon aucun handler et ne s'ouvraient plus.
    if (!DOCK_ICONS_WITH_CUSTOM_TOGGLE.has(btn.id)) {
      btn.addEventListener("click", () => {
        const windowId = btn.dataset?.windowId;
        if (!windowId || !window.GameWindowManager) return;
        const w = windows.get(windowId);
        const open = !!w
          && !w.card.classList.contains("gameWinMinimized")
          && w.card.style.display !== "none"
          && w.root.style.display !== "none";
        if (open) window.GameWindowManager.minimize(windowId);
        else window.GameWindowManager.restore(windowId);
      });
    }
  }

  function wireExistingDockIcons() {
    getDock().querySelectorAll(".gameDockIcon").forEach(wireDockIconButton);
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", wireExistingDockIcons, { once: true });
    } else {
      wireExistingDockIcons();
    }
  }

function prepareFloating(card) {
  const r = card.getBoundingClientRect();

  card.classList.add("floating");

  card.style.position = "fixed";
  card.style.left = `${Math.round(r.left)}px`;
  card.style.top = `${Math.round(r.top)}px`;
  card.style.right = "auto";
  card.style.bottom = "auto";

  // ✅ largeur verrouillée pour éviter l'étirement (jamais une mesure
  // écrasée : une largeur suspecte laisse le CSS dimensionner).
  if (r.width >= 160) {
    card.style.width = `${Math.round(r.width)}px`;
    card.style.minWidth = "0";
    card.style.maxWidth = "none";
  } else {
    card.style.width = "";
    card.style.minWidth = "";
    card.style.maxWidth = "";
  }
  card.style.boxSizing = "border-box";

  bringWindowToFront(card);
}

  function clampToScreen(card, left, top) {
    const margin = 8;
    const rect = card.getBoundingClientRect();
    const maxLeft = Math.max(margin, window.innerWidth - rect.width - margin);
    const maxTop = Math.max(margin, window.innerHeight - rect.height - margin);

    return {
      left: Math.max(margin, Math.min(Number(left) || margin, maxLeft)),
      top: Math.max(margin, Math.min(Number(top) || margin, maxTop)),
    };
  }

  function keepWindowInsideViewport(card, { centerIfUnpositioned = false } = {}) {
    if (!card) return;
    const margin = 8;
    let rect = card.getBoundingClientRect();
    if (rect.width > window.innerWidth - margin * 2) {
      card.style.width = `${Math.max(140, window.innerWidth - margin * 2)}px`;
      rect = card.getBoundingClientRect();
    }
    card.style.maxHeight = `${Math.max(120, window.innerHeight - margin * 2)}px`;
    const hasPosition = card.classList.contains("floating") && Number.isFinite(parseFloat(card.style.left)) && Number.isFinite(parseFloat(card.style.top));
    if (!hasPosition) prepareFloating(card);
    rect = card.getBoundingClientRect();
    const requestedLeft = centerIfUnpositioned && !hasPosition ? (window.innerWidth - rect.width) / 2 : rect.left;
    const requestedTop = centerIfUnpositioned && !hasPosition ? (window.innerHeight - rect.height) / 2 : rect.top;
    const p = clampToScreen(card, requestedLeft, requestedTop);
    card.style.left = `${Math.round(p.left)}px`;
    card.style.top = `${Math.round(p.top)}px`;
    card.style.right = "auto";
    card.style.bottom = "auto";
  }

  function applyMinimapProportions(card, width) {
  if (!card || card.id !== "minimap") return;

  const minW = 220;
  const maxW = Math.min(620, window.innerWidth - 28);
  const w = Math.max(minW, Math.min(Number(width) || 250, maxW));

  card.style.width = `${Math.round(w)}px`;
  card.style.minWidth = "0";
  card.style.maxWidth = "none";
  card.style.boxSizing = "border-box";

  const canvas = card.querySelector("#miniCanvas");

  if (canvas) {
    // ratio actuel : 250px de large / 155px de haut
    const canvasH = Math.round(w * 155 / 250);

    canvas.style.width = "100%";
    canvas.style.height = `${canvasH}px`;

    // Le bitmap suit la taille affichée (× DPR) : sinon le navigateur
    // étire un bitmap 300x205 fixe et tout devient flou dès qu'on
    // agrandit avec +.
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    const cssW = Math.max(1, Math.round(canvas.clientWidth || w));
    const cssH = Math.max(1, Math.round(canvas.clientHeight || canvasH));
    const nextW = Math.round(cssW * dpr);
    const nextH = Math.round(cssH * dpr);
    if (canvas.width !== nextW || canvas.height !== nextH) {
      canvas.width = nextW;
      canvas.height = nextH;
    }
  }
}

function ensureResizeHandle(card) {
  let handle = card.querySelector(":scope > .gameWinResizeHandle");

  if (handle) return handle;

  handle = document.createElement("div");
  handle.className = "gameWinResizeHandle";
  handle.dataset.noDrag = "1";
  handle.title = "Agrandir / réduire la mini-carte";

  card.appendChild(handle);

  return handle;
}

function makeMinimapResizable(id, card) {
  if (!card || card.id !== "minimap") return;
  if (card.__miniResizeReady) return;

  card.__miniResizeReady = true;

  const handle = ensureResizeHandle(card);
  handle.remove();
  const zoomOut = card.querySelector("#miniZoomOut");
  const zoomIn = card.querySelector("#miniZoomIn");
  const zoomActions = card.querySelector(".miniZoomActions");
  const windowBar = card.querySelector(":scope > .gameWinBar");
  const minimizeButton = windowBar?.querySelector(".gameWinMinBtn:not(.miniZoomBtn)");
  if (zoomActions && windowBar) {
    const zoomBar = zoomActions.parentElement;
    windowBar.insertBefore(zoomActions, minimizeButton || null);
    // La barre d'origine est vide après le déplacement : on la masque
    // pour supprimer le trait entre "Map : X-X" et la mini-carte.
    if (zoomBar && zoomBar !== windowBar) zoomBar.style.display = "none";
  }

  const resizeFromButton = (delta) => {
    prepareFloating(card);
    const rect = card.getBoundingClientRect();
    const minW = 220;
    // Largeur max absolue (viewport) : on grandit toujours, puis on
    // recale la fenêtre pour qu'elle reste entièrement visible,
    // même collée contre un bord droit / bas.
    const hardMaxW = Math.max(minW, Math.min(620, window.innerWidth - 28));
    applyMinimapProportions(card, Math.max(minW, Math.min(rect.width + delta, hardMaxW)));
    keepWindowInsideViewport(card);
    saveWindowPosition(id, card);
  };

  zoomOut?.addEventListener("click", (event) => {
    event.stopPropagation();
    resizeFromButton(-40);
  });
  zoomIn?.addEventListener("click", (event) => {
    event.stopPropagation();
    resizeFromButton(40);
  });

  let resizing = false;
  let startX = 0;
  let startY = 0;
  let startW = 0;
  let startH = 0;
  let startLeft = 0;
  let startTop = 0;
  let chromeH = 0;
  let canvasRatio = 155 / 250;

  handle.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;

    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    prepareFloating(card);

    const r = card.getBoundingClientRect();
    const canvas = card.querySelector("#miniCanvas");
    const cr = canvas ? canvas.getBoundingClientRect() : null;

    resizing = true;

    startX = e.clientX;
    startY = e.clientY;

    startW = r.width;
    startH = r.height;

    startLeft = r.left;
    startTop = r.top;

    const canvasH = cr?.height || Math.round(startW * 155 / 250);
    chromeH = Math.max(0, startH - canvasH);
    canvasRatio = canvasH / startW || 155 / 250;

    try {
      handle.setPointerCapture(e.pointerId);
    } catch {}
  });

  handle.addEventListener("pointermove", (e) => {
    if (!resizing) return;

    e.preventDefault();
    e.stopPropagation();

    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    // ✅ garde les proportions : on prend le mouvement dominant
    let nextW = startW + Math.max(dx, dy / canvasRatio);

    const minW = 220;

    // ✅ ne dépasse pas à droite
    const maxWByRight = window.innerWidth - startLeft - 14;

    // ✅ ne dépasse pas en bas
    const maxWByBottom =
      (window.innerHeight - startTop - 14 - chromeH) / canvasRatio;

    const maxW = Math.max(
      minW,
      Math.min(620, maxWByRight, maxWByBottom)
    );

    nextW = Math.max(minW, Math.min(nextW, maxW));

    applyMinimapProportions(card, nextW);
  });

  function stopResize(e) {
    if (!resizing) return;

    resizing = false;

    // ✅ sauvegarde aussi la nouvelle taille
    saveWindowPosition(id, card);

    try {
      handle.releasePointerCapture(e.pointerId);
    } catch {}
  }

  handle.addEventListener("pointerup", stopResize);
  handle.addEventListener("pointercancel", stopResize);
}

  function makeDraggable(card, bar) {
    if (!card || !bar || card.__gameWinDragReady) return;
    card.__gameWinDragReady = true;

    let dragging = false;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;

    bar.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      if (isInteractive(e.target)) return;

      e.preventDefault();

      prepareFloating(card);

      const r = card.getBoundingClientRect();

      dragging = true;
      startX = e.clientX;
      startY = e.clientY;
      startLeft = r.left;
      startTop = r.top;

      try {
        bar.setPointerCapture(e.pointerId);
      } catch {}
    });

    bar.addEventListener("pointermove", (e) => {
      if (!dragging) return;

      const nextLeft = startLeft + (e.clientX - startX);
      const nextTop = startTop + (e.clientY - startY);

      const p = clampToScreen(card, nextLeft, nextTop);

      card.style.left = `${p.left}px`;
      card.style.top = `${p.top}px`;
    });

    function stop(e) {
  if (!dragging) return;

  dragging = false;

  // ✅ sauvegarde la position quand tu relâches la fenêtre
  saveWindowPosition(card.dataset.gameWindowId, card);

  try {
    bar.releasePointerCapture(e.pointerId);
  } catch {}
}

    bar.addEventListener("pointerup", stop);
    bar.addEventListener("pointercancel", stop);
  }

  window.GameWindowManager = {
    register({ id, title, icon = "▣", root, card, defaultOpen = true, minimizable = true }) {
      if (!id || !root || !card) return null;

card.classList.add("gameWindow");
card.dataset.gameWindowId = id;

      const bar = ensureWindowBar(card, title, icon, minimizable);
      const minBtn = bar.querySelector(".gameWinMinBtn");

      makeDraggable(card, bar);
applySavedWindowPosition(id, card);

// ✅ resize proportionnel uniquement pour la mini-carte
if (id === "minimap") {
  applyMinimapProportions(card, card.getBoundingClientRect().width || 250);
  makeMinimapResizable(id, card);
}

if (minBtn) minBtn.onpointerdown = (e) => {
  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();
};

if (minBtn) minBtn.onclick = (e) => {
  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();

  window.GameWindowManager.minimize(id);
};

// Clic sur l'icône de la barre = comme le bouton réduire (toggle).
const barIcon = bar.querySelector(".gameWinIcon");
if (barIcon && minimizable !== false) {
  barIcon.title = "Réduire / Restaurer";
  barIcon.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const current = windows.get(id);
    const open = !!current
      && !current.card.classList.contains("gameWinMinimized")
      && current.card.style.display !== "none"
      && current.root.style.display !== "none";
    if (open) window.GameWindowManager.minimize(id);
    else window.GameWindowManager.restore(id);
  };
}

      const state = windows.get(id) || {};
      windows.set(id, {
        ...state,
        id,
        title,
        icon,
        root,
        card,
        bar,
        minimizable,
        lastDisplay: state.lastDisplay || "grid",
      });

      const savedOpen = loadWindowOpenState(id);
      const shouldOpen = minimizable === false ? true : (savedOpen === null ? !!defaultOpen : savedOpen);
      if (shouldOpen) {
        root.classList.remove("gameWinMinimized");
        card.classList.remove("gameWinMinimized");
        root.style.display = "block";
        card.style.display = "block";
        requestAnimationFrame(() => keepWindowInsideViewport(card, { centerIfUnpositioned: true }));
        // Barre des tâches : l'icône reste visible, état actif.
        if (minimizable !== false) {
          const dockBtn = makeDockIcon(id, title, icon);
          dockBtn?.classList.add("dockIconActive");
          refreshDockIcon(dockBtn);
        }
      } else {
        root.classList.add("gameWinMinimized");
        card.classList.add("gameWinMinimized");
        root.style.display = "none";
        card.style.display = "none";
        if (minimizable !== false) {
          const dockBtn = makeDockIcon(id, title, icon);
          dockBtn?.classList.remove("dockIconActive");
          refreshDockIcon(dockBtn);
        }
      }

      return windows.get(id);
    },

minimize(id) {
  const w = windows.get(id);
  if (!w || w.minimizable === false) return;
  saveWindowOpenState(id, false);

  w.lastDisplay = "block";
  clearTimeout(w.animationTimer);
  clearTimeout(w.animationIconTimer);
  w.card.classList.remove("gameWinOpening");
  w.card.classList.add("gameWinClosing");
  // Barre des tâches : si l'icône est déjà rangée dans le dock, on ne
  // rejoue pas son animation d'arrivée (ça faisait glitcher).
  const preExistingBtn = getDock().querySelector(`[data-window-id="${id}"]`);
  const dockBtn = makeDockIcon(id, w.title, w.icon);
  dockBtn.classList.remove("dockIconActive");
  refreshDockIcon(dockBtn);
  const cardRect = w.card.getBoundingClientRect();
  const dockRect = dockBtn.getBoundingClientRect();
  w.card.style.setProperty("--dock-x", `${dockRect.left + dockRect.width / 2 - (cardRect.left + cardRect.width / 2)}px`);
  w.card.style.setProperty("--dock-y", `${dockRect.top + dockRect.height / 2 - (cardRect.top + cardRect.height / 2)}px`);
  w.card.style.setProperty("--dock-scale", String(Math.max(0.08, Math.min(0.25, dockRect.width / cardRect.width))));
  w.card.style.setProperty("--dock-origin-x", `${dockRect.left + dockRect.width / 2 - cardRect.left}px`);
  w.card.style.setProperty("--dock-origin-y", `${dockRect.top + dockRect.height / 2 - cardRect.top}px`);
  w.card.style.setProperty("--dock-x-mid", `${(dockRect.left + dockRect.width / 2 - (cardRect.left + cardRect.width / 2)) * 0.58}px`);
  w.card.style.setProperty("--dock-y-mid", `${(dockRect.top + dockRect.height / 2 - (cardRect.top + cardRect.height / 2)) * 0.58}px`);
  w.card.style.setProperty("--dock-x-near", `${(dockRect.left + dockRect.width / 2 - (cardRect.left + cardRect.width / 2)) * 0.68}px`);
  w.card.style.setProperty("--dock-y-near", `${(dockRect.top + dockRect.height / 2 - (cardRect.top + cardRect.height / 2)) * 0.68}px`);
  w.dockBtnAnimated = !preExistingBtn;
  if (w.dockBtnAnimated) {
    dockBtn.classList.add("dockIconFromWindow");
    dockBtn.style.setProperty("--icon-start-x", `${cardRect.left + cardRect.width / 2 - dockRect.width / 2}px`);
    dockBtn.style.setProperty("--icon-start-y", `${cardRect.top + cardRect.height / 2 - dockRect.height / 2}px`);
    dockBtn.style.setProperty("--icon-end-x", `${dockRect.left}px`);
    dockBtn.style.setProperty("--icon-end-y", `${dockRect.top}px`);
    dockBtn.style.width = `${dockRect.width}px`;
    dockBtn.style.height = `${dockRect.height}px`;
    dockBtn.style.opacity = "0";
  }
  w.animationTimer = setTimeout(() => {

  // ✅ root et card sont parfois le même élément, mais on sécurise les deux
  w.root.classList.add("gameWinMinimized");
  w.card.classList.add("gameWinMinimized");

  w.root.style.display = "none";
    w.card.style.display = "none";
    if (w.dockBtnAnimated) {
      dockBtn.classList.remove("dockIconFromWindow");
      dockBtn.removeAttribute("style");
    }

  }, 380);
},

restore(id) {
  const w = windows.get(id);
  if (!w) return;
  saveWindowOpenState(id, true);
  clearTimeout(w.animationTimer);
  w.card.classList.remove("gameWinClosing");

  // ✅ on retire l'état réduit sur root ET card
  w.root.classList.remove("gameWinMinimized");
  w.card.classList.remove("gameWinMinimized");

  // ✅ pour les fenêtres HUD, on force block
  w.root.style.display = "block";
  w.card.style.display = "block";

  const restoredSavedPosition = applySavedWindowPosition(id, w.card);
  keepWindowInsideViewport(w.card, { centerIfUnpositioned: !restoredSavedPosition });

  w.card.style.visibility = "visible";
  w.card.style.opacity = "1";
  bringWindowToFront(w.card);
  const dockBtn = getDock().querySelector(`[data-window-id="${id}"]`);
  if (dockBtn) {
    const cardRect = w.card.getBoundingClientRect();
    const dockRect = dockBtn.getBoundingClientRect();
    w.card.style.setProperty("--dock-x", `${dockRect.left + dockRect.width / 2 - (cardRect.left + cardRect.width / 2)}px`);
    w.card.style.setProperty("--dock-y", `${dockRect.top + dockRect.height / 2 - (cardRect.top + cardRect.height / 2)}px`);
    w.card.style.setProperty("--dock-scale", String(Math.max(0.08, Math.min(0.25, dockRect.width / cardRect.width))));
    w.card.style.setProperty("--dock-origin-x", `${dockRect.left + dockRect.width / 2 - cardRect.left}px`);
    w.card.style.setProperty("--dock-origin-y", `${dockRect.top + dockRect.height / 2 - cardRect.top}px`);
    w.card.style.setProperty("--dock-x-mid", `${(dockRect.left + dockRect.width / 2 - (cardRect.left + cardRect.width / 2)) * 0.58}px`);
    w.card.style.setProperty("--dock-y-mid", `${(dockRect.top + dockRect.height / 2 - (cardRect.top + cardRect.height / 2)) * 0.58}px`);
    w.card.style.setProperty("--dock-x-near", `${(dockRect.left + dockRect.width / 2 - (cardRect.left + cardRect.width / 2)) * 0.68}px`);
    w.card.style.setProperty("--dock-y-near", `${(dockRect.top + dockRect.height / 2 - (cardRect.top + cardRect.height / 2)) * 0.68}px`);
  }
  w.card.classList.remove("gameWinOpening");
  requestAnimationFrame(() => w.card.classList.add("gameWinOpening"));
  w.animationTimer = setTimeout(() => w.card.classList.remove("gameWinOpening"), 300);

  // ✅ sécurité : si le moteur remet display none/block au mauvais moment
  requestAnimationFrame(() => {
    w.root.classList.remove("gameWinMinimized");
    w.card.classList.remove("gameWinMinimized");

    w.root.style.display = "block";
    w.card.style.display = "block";
    w.card.style.visibility = "visible";
    w.card.style.opacity = "1";
  });

  window.dispatchEvent(new CustomEvent("orbit:window-restored", { detail: { id } }));

  if (dockBtn) {
    dockBtn.classList.add("dockIconActive");
    refreshDockIcon(dockBtn);
  }
},

    toggleAll() {
      this._hiddenWindowOrder ||= [];
      if (this._hiddenWindowOrder.length) {
        const order = [...this._hiddenWindowOrder];
        this._hiddenWindowOrder = [];
        order.forEach(id => this.restore(id));
        return;
      }
      this._hiddenWindowOrder = [...windows.values()]
        .filter(w => w?.minimizable !== false && w.card?.style.display !== "none" && !w.card?.classList.contains("gameWinMinimized"))
        .sort((a, b) => (Number(a.card.style.zIndex) || 0) - (Number(b.card.style.zIndex) || 0))
        .map(w => w.id);
      this._hiddenWindowOrder.forEach(id => this.minimize(id));
    },

    resetPositions() {
  clearSavedWindowPositions();

  const dock = getDock();

  for (const [id, w] of windows.entries()) {
    if (!w || !w.card || !w.root) continue;

    const card = w.card;
    const root = w.root;

    root.classList.remove("gameWinMinimized");
    card.classList.remove("gameWinMinimized");
    card.classList.remove("floating");

    root.style.display = "block";
    card.style.display = "block";

    card.style.position = "";
    card.style.left = "";
    card.style.top = "";
    card.style.right = "";
    card.style.bottom = "";
    card.style.width = "";
    card.style.minWidth = "";
    card.style.maxWidth = "";
    card.style.margin = "";
    card.style.transform = "";
    card.style.visibility = "visible";
    card.style.opacity = "1";
    bringWindowToFront(card);

    const dockBtn = dock.querySelector(`[data-window-id="${id}"]`);
    if (w.minimizable === false) {
      if (dockBtn) dockBtn.remove();
    } else {
      const btn2 = makeDockIcon(id, w.title, w.icon);
      btn2?.classList.add("dockIconActive");
      refreshDockIcon(btn2);
    }

    if (id === "minimap" && typeof applyMinimapProportions === "function") {
      requestAnimationFrame(() => {
        applyMinimapProportions(card, card.getBoundingClientRect().width || 250);
      });
    }
  }
},

    close(id) {
      const w = windows.get(id);
      if (!w) return;
      saveWindowOpenState(id, false);

      w.root.style.display = "none";

      const dockBtn = getDock().querySelector(`[data-window-id="${id}"]`);
      if (dockBtn) dockBtn.remove();
    },

    isOpen(id) {
      const w = windows.get(id);
      if (!w) return false;
      const savedOpen = loadWindowOpenState(id);
      return savedOpen === null ? !w.root.classList.contains("gameWinMinimized") : savedOpen;
    },

    setTitle(id, title) {
      const w = windows.get(id);
      if (!w) return;

      w.title = title;

      const titleEl = w.bar?.querySelector(".gameWinTitle");
      if (titleEl) titleEl.textContent = title;

      const dockBtn = getDock().querySelector(`[data-window-id="${id}"]`);
      if (dockBtn) dockBtn.title = title;
    },
  };

  window.addEventListener("resize", () => {
    for (const w of windows.values()) {
      if (!w?.card || w.card.style.display === "none") continue;
      keepWindowInsideViewport(w.card);
      saveWindowPosition(w.id, w.card);
    }
  });
})();
