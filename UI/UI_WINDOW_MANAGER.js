(() => {
  if (window.GameWindowManager) return;

  let topZ = 96000;

  const windows = new Map();

  function bringWindowToFront(card) {
    if (!card || card.classList.contains("gameWinMinimized")) return;

    // L'éditeur mobile utilise un voile au-dessus du HUD. Paramètres doit
    // rester manipulable pendant toute l'édition : ne jamais le rabattre dans
    // la pile HUD normale au premier pointerdown (sinon seul le premier clic
    // passe, puis la fenêtre retombe sous le voile).
    if (card.id === "settingsWindow"
      && (document.body.classList.contains("phoneDockEditorOpen")
        || document.body.classList.contains("phoneJoystickLayoutOpen"))) {
      card.style.setProperty("z-index", "2147483646", "important");
      return;
    }

    // La Boutique vit dans #shopOverlay et les Hangars dans
    // #hangarOverlay : on remonte le conteneur avec la carte, sinon son
    // z-index fixe (90000) le garderait toujours derrière les fenêtres HUD
    // déjà remontées.
    const overlay = card.closest("#shopOverlay, #hangarOverlay");
    if (overlay) overlay.style.setProperty("z-index", String(++topZ), "important");

    // Les fenêtres passent aussi par-dessus le dock (96000). Si la pile
    // devient trop haute, on la compacte en conservant exactement l'ordre
    // visuel actuel.
    if (topZ >= 99500) {
      [...document.querySelectorAll(".gameWindow"), document.getElementById("shopOverlay"), document.getElementById("hangarOverlay")]
        .filter((windowCard) => windowCard && windowCard.style.display !== "none")
        .sort((a, b) => (Number(a.style.zIndex) || 96000) - (Number(b.style.zIndex) || 96000))
        .forEach((windowCard, index) => windowCard.style.setProperty("z-index", String(96001 + index), "important"));
      topZ = 96000 + document.querySelectorAll(".gameWindow").length;
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

    const rx = Number(data.rx);
    const ry = Number(data.ry);
    return {
      left: Number(data.left),
      top: Number(data.top),
      width: Number(data.width),
      // Position relative (fraction du viewport au moment de la sauvegarde).
      // Absente des sauvegardes anciennes : on retombe sur left/top absolus.
      rx: Number.isFinite(rx) ? rx : null,
      ry: Number.isFinite(ry) ? ry : null,
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
        // Fraction du viewport : permet de suivre le redimensionnement
        // (une fenêtre en bas à droite y reste, proportionnellement).
        rx: r.left / Math.max(1, window.innerWidth),
        ry: r.top / Math.max(1, window.innerHeight),
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

  // DPS : fenetre compacte auto-ajustee. On n'applique jamais une largeur
  // sauvegardee (souvent ~300px fige au premier drag) : elle empecherait
  // de retrecir meme apres une reduction du CSS. Le CSS reprend la main.
  const isDpsWindow = id === "dpsWindow" || card?.id === "dpsWindow";
  const effectiveWidth = isDpsWindow ? null : width;

  // Le viewport est borne apres application de la largeur sauvegardee.
  // Mesurer ici forcerait une mise en page avec l'ancienne geometrie.
  // Résolution proportionnelle : la position sauvegardée (fraction du
  // viewport de l'époque) est reconvertie dans le viewport actuel, pour
  // que la fenêtre suive le redimensionnement (ex : bas-droite conservé).
  const vw = Math.max(1, window.innerWidth);
  const vh = Math.max(1, window.innerHeight);
  const p = {
    left: Number.isFinite(saved.rx) ? saved.rx * vw
      : Number.isFinite(saved.left) ? saved.left : 14,
    top: Number.isFinite(saved.ry) ? saved.ry * vh
      : Number.isFinite(saved.top) ? saved.top : 14,
  };

  card.classList.add("floating");

  card.style.position = "fixed";
  card.style.left = `${Math.round(p.left)}px`;
  card.style.top = `${Math.round(p.top)}px`;
  card.style.right = "auto";
  card.style.bottom = "auto";
  if (effectiveWidth !== null) {
    card.style.width = `${Math.round(effectiveWidth)}px`;
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

function clearSavedWindowStates() {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && k.startsWith(WIN_STATE_PREFIX)) {
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
    // Bouton créé pendant un collapse : caché d'office (état inline,
    // identique à la fin du fondu).
    try {
      if (dock.classList.contains("dock-collapsed")
        && btn.id !== "btnSettingsHub"
        && btn.id !== "btnCollapseHub") {
        try { btn._collapseNatW = btn.offsetWidth || 60; } catch {}
        const gap = parseFloat(getComputedStyle(dock).columnGap) || 0;
        btn.style.overflow = "hidden";
        btn.style.opacity = "0";
        btn.style.maxWidth = "0px";
        btn.style.minWidth = "0px";
        btn.style.marginRight = `${-gap}px`;
        btn.style.visibility = "hidden";
        btn.style.pointerEvents = "none";
      }
    } catch {}

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
    // Conserve le query de version (?v=) éventuel pour ne pas resservir
    // un cache périmé après une mise à jour des PNG.
    let versionSuffix = "";
    try {
      const current = String(img.getAttribute("src") || "");
      const qi = current.indexOf("?");
      if (qi >= 0) versionSuffix = current.slice(qi);
    } catch {}
    const base = "ASSETS/UI/MENU/";
    img.onerror = () => {
      // Pas de variante officielle (ex : booster) : on reste sur idle.
      img.onerror = null;
      img.dataset.iconState = name;
      img.src = base + name + ".png" + versionSuffix;
    };
    img.src = base + key + ".png" + versionSuffix;
  }

  function refreshDockIcon(btn) {
    if (!btn) return;
    let hover = false;
    try { hover = btn.matches(":hover"); } catch {}
    const active = btn.classList.contains("dockIconActive");
    setDockIconVariant(btn, active ? "select" : (hover ? "hover" : ""));
  }

  // Boutons gérés par leur propre logique d'ouverture (overlays boutique/hangars) :
  // on ne leur ajoute PAS le toggle générique pour éviter un double basculement.
  const DOCK_ICONS_WITH_CUSTOM_TOGGLE = new Set(["btnShopHub", "btnHangarHub"]);

  function wireDockIconButton(btn) {
    if (!btn || btn.__dockIconWired) return;
    btn.__dockIconWired = true;
    // Libellé custom sous le bouton : migre title -> data-docklabel
    // pour ne plus afficher l'infobulle native du navigateur.
    try {
      const t = btn.getAttribute("title");
      if (t && !btn.hasAttribute("data-docklabel")) btn.setAttribute("data-docklabel", t);
      if (t) btn.removeAttribute("title");
    } catch {}
    const name = dockMenuIconName(btn);
    if (name) {
      // Précharge les 3 états pour un survol sans flash.
      let versionSuffix = "";
      try {
        const current = String(btn.querySelector("span img")?.getAttribute("src") || "");
        const qi = current.indexOf("?");
        if (qi >= 0) versionSuffix = current.slice(qi);
      } catch {}
      for (const suffix of ["", "_hover", "_select"]) {
        const pre = new Image();
        pre.src = `ASSETS/UI/MENU/${name}${suffix}.png${versionSuffix}`;
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

  // État réduit/agrandi persistant : restauré instantanément au chargement.
  function restoreCollapseState() {
    let collapsed = false;
    try { collapsed = localStorage.getItem("orbit_dock_collapsed") === "1"; } catch {}
    if (!collapsed) return;
    const dock = getDock();
    const btn = document.getElementById("btnCollapseHub");
    const gap = (() => { try { return parseFloat(getComputedStyle(dock).columnGap) || 0; } catch { return 0; } })();
    dock.classList.add("dock-collapsed");
    try { btn?.classList.add("collapsed"); } catch {}
    [...dock.children]
      .filter(el => el !== btn && el.id !== "btnSettingsHub" && !el.classList?.contains("sessionDockMenu"))
      .forEach(el => {
        try {
          el._collapseNatW = el.offsetWidth || 60;
          el.style.transition = "none";
          el.style.overflow = "hidden";
          el.style.opacity = "0";
          el.style.maxWidth = "0px";
          el.style.minWidth = "0px";
          el.style.marginRight = `${-gap}px`;
          el.style.visibility = "hidden";
          el.style.pointerEvents = "none";
        } catch {}
      });
  }

  function wireExistingDockIcons() {
    getDock().querySelectorAll(".gameDockIcon").forEach(wireDockIconButton);
    document.getElementById("btnCollapseHub")?.addEventListener("click", () => {
      try { window.GameWindowManager?.toggleCollapse?.(); } catch {}
    });
    preloadDockBackgrounds();
    restoreCollapseState();
  }

  // Les boutons convertis en background-image CSS (modèle CPU) n'ont plus
  // d'<img> : on précharge quand même les 3 états pour éviter tout pop
  // à la fin des animations / au premier survol.
  function preloadDockBackgrounds() {
    const menu = ["hangar", "logout", "settings", "shop", "refinement", "skylab", "auction", "skilltree", "bot", "help", "inventory", "titles", "rank", "profile", "ship", "cross", "missions", "portal", "starmap", "text", "chat", "crew", "addfriend", "clan", "ranking", "tech", "gauge", "dps", "dock", "collapse", "expand"];
    for (const name of menu) {
      for (const suffix of ["", "_hover", "_select"]) {
        try { const pre = new Image(); pre.src = `ASSETS/UI/MENU/${name}${suffix}.png`; } catch {}
      }
    }
    for (const name of ["pet_normal", "pet_hover", "pet_select", "tech_items_normal", "tech_items_hover", "tech_items_select"]) {
      try { const pre = new Image(); pre.src = `ASSETS/CONTROL_MENU/${name}.png`; } catch {}
    }
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", wireExistingDockIcons, { once: true });
    } else {
      wireExistingDockIcons();
    }
  }

function prepareFloating(card, r = card.getBoundingClientRect()) {

  card.classList.add("floating");

  card.style.position = "fixed";
  card.style.left = `${Math.round(r.left)}px`;
  card.style.top = `${Math.round(r.top)}px`;
  card.style.right = "auto";
  card.style.bottom = "auto";

  // DPS : on ne verrouille jamais la largeur en inline (ca ecraserait
  // le max-width CSS et empecherait la fenetre de retrecir).
  if (card?.id === "dpsWindow") {
    card.style.width = "";
    card.style.minWidth = "";
    card.style.maxWidth = "";
  } else if (r.width >= 160) {
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

  function clampToScreen(card, left, top, rect = card.getBoundingClientRect()) {
    const margin = 8;
    const maxLeft = Math.max(margin, window.innerWidth - rect.width - margin);
    const maxTop = Math.max(margin, window.innerHeight - rect.height - margin);

    return {
      left: Math.max(margin, Math.min(Number(left) || margin, maxLeft)),
      top: Math.max(margin, Math.min(Number(top) || margin, maxTop)),
    };
  }

  function keepWindowInsideViewport(card, { centerIfUnpositioned = false, anchor = null } = {}) {
    if (!card) return null;
    const margin = 8;
    // Regrouper les contraintes avant la mesure ; reutiliser ensuite cette
    // geometrie pour le placement et l'animation d'ouverture.
    card.style.maxHeight = `${Math.max(120, window.innerHeight - margin * 2)}px`;
    const hasPosition = card.classList.contains("floating") && Number.isFinite(parseFloat(card.style.left)) && Number.isFinite(parseFloat(card.style.top));
    let rect = card.getBoundingClientRect();
    if (!hasPosition) {
      prepareFloating(card, rect);
      rect = card.getBoundingClientRect();
    }
    if (rect.width > window.innerWidth - margin * 2) {
      card.style.width = `${Math.max(140, window.innerWidth - margin * 2)}px`;
      rect = card.getBoundingClientRect();
    }
    // Ancrage relatif (redimensionnement) prioritaire : la position
    // sauvegardée en fraction de viewport est reconvertie ici, la fenêtre
    // suit le redimensionnement au lieu de rester à ses pixels absolus.
    let requestedLeft = rect.left;
    let requestedTop = rect.top;
    if (anchor && Number.isFinite(anchor.rx) && Number.isFinite(anchor.ry)) {
      requestedLeft = anchor.rx * window.innerWidth;
      requestedTop = anchor.ry * window.innerHeight;
    } else if (centerIfUnpositioned && !hasPosition) {
      requestedLeft = (window.innerWidth - rect.width) / 2;
      requestedTop = (window.innerHeight - rect.height) / 2;
    }
    const p = clampToScreen(card, requestedLeft, requestedTop, rect);
    const left = Math.round(p.left), top = Math.round(p.top);
    card.style.left = `${left}px`;
    card.style.top = `${top}px`;
    card.style.right = "auto";
    card.style.bottom = "auto";
    return { left, top, width: rect.width, height: rect.height };
  }

  function applyMinimapProportions(card, width) {
  if (!card || card.id !== "minimap") return;

  const minW = 260;
  const maxW = Math.min(620, window.innerWidth - 28);
  const w = Math.max(minW, Math.min(Number(width) || 250, maxW));

  card.style.width = `${Math.round(w)}px`;
  card.style.minWidth = "0";
  card.style.maxWidth = "none";
  card.style.boxSizing = "border-box";

  const canvas = card.querySelector("#miniCanvas");

  if (canvas) {
    // Zone intérieure légèrement plus compacte que le cadre de la fenêtre.
    const canvasH = Math.round(w * 145 / 250);

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
  if (windowBar) {
    windowBar.querySelector(":scope > .miniStarmapBtn")?.remove();
  }
  if (windowBar && !windowBar.querySelector(":scope > .miniStarmapIcon")) {
    const starIcon = document.createElement("div");
    starIcon.className = "gameWinIcon miniStarmapIcon";
    starIcon.title = "Ouvrir la carte stellaire";
    starIcon.setAttribute("role", "button");
    starIcon.setAttribute("aria-label", "Ouvrir la carte stellaire");
    starIcon.dataset.noDrag = "1";
    starIcon.innerHTML = '<img class="menuIconImg" src="ASSETS/UI/MENU/starmap_hover.png" alt="" draggable="false">';
    starIcon.addEventListener("pointerdown", (e) => { e.stopPropagation(); });
    starIcon.addEventListener("click", (event) => {
      event.stopPropagation();
      try {
        const w = windows.get("starMapWindow");
        const open = !!w
          && !w.card.classList.contains("gameWinMinimized")
          && w.card.style.display !== "none"
          && w.root.style.display !== "none";
        if (open) window.GameWindowManager.minimize("starMapWindow");
        else window.GameWindowManager.restore("starMapWindow");
      } catch {}
    });
    windowBar.insertBefore(starIcon, zoomActions || minimizeButton || null);
  }

  const resizeFromButton = (delta) => {
    prepareFloating(card);
    const rect = card.getBoundingClientRect();
    const minW = 260;
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

    const minW = 260;

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
    register({ id, title, icon = "▣", root, card, defaultOpen = true, minimizable = true, dock = true }) {
      if (!id || !root || !card) return null;
      // dock:false = jamais d'icône dans le dock (ex : terminal de quêtes :
      // il s'ouvre à proximité et se réduit sans passer par le dock).
      const wantDock = dock !== false;

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
        defaultOpen: !!defaultOpen,
        dock: wantDock,
        lastDisplay: state.lastDisplay || "grid",
      });

      const savedOpen = loadWindowOpenState(id);
      let shouldOpen = minimizable === false ? true : (savedOpen === null ? !!defaultOpen : savedOpen);
      // Garde d'ouverture (ex : passe de combat hors event) : reste fermée.
      try {
        if (typeof window.__windowOpenGuard === "function" && window.__windowOpenGuard(id) === false) shouldOpen = false;
      } catch {}
      if (shouldOpen) {
        root.classList.remove("gameWinMinimized");
        card.classList.remove("gameWinMinimized");
        root.style.display = "block";
        card.style.display = "block";
        // Une fenêtre restaurée dès son enregistrement doit suivre le même
        // cycle qu'un restore() manuel. Les panneaux dont le contenu est
        // construit à l'ouverture (Modules, Boutique, etc.) ne doivent pas
        // rester vides après un rechargement de page.
        window.dispatchEvent(new CustomEvent("orbit:window-restoring", { detail: { id } }));
        requestAnimationFrame(() => keepWindowInsideViewport(card, { centerIfUnpositioned: true }));
        // Barre des tâches : l'icône reste visible, état actif.
        if (minimizable !== false && wantDock) {
          const dockBtn = makeDockIcon(id, title, icon);
          dockBtn?.classList.add("dockIconActive");
          refreshDockIcon(dockBtn);
        } else {
          const dockBtn = getDock().querySelector(`[data-window-id="${id}"]`);
          if (dockBtn) dockBtn.remove();
        }
        window.dispatchEvent(new CustomEvent("orbit:window-restored", { detail: { id } }));
      } else {
        root.classList.add("gameWinMinimized");
        card.classList.add("gameWinMinimized");
        root.style.display = "none";
        card.style.display = "none";
        if (minimizable !== false && wantDock) {
          const dockBtn = makeDockIcon(id, title, icon);
          dockBtn?.classList.remove("dockIconActive");
          refreshDockIcon(dockBtn);
        } else {
          const dockBtn = getDock().querySelector(`[data-window-id="${id}"]`);
          if (dockBtn) dockBtn.remove();
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
  // Sans dock (terminal de quêtes) : aucune icône créée, l'animation vise
  // simplement le bas de l'écran.
  let dockBtn = null;
  if (w.dock !== false) {
    const preExistingBtn = getDock().querySelector(`[data-window-id="${id}"]`);
    dockBtn = makeDockIcon(id, w.title, w.icon);
    dockBtn.classList.remove("dockIconActive");
    refreshDockIcon(dockBtn);
    w.dockBtnAnimated = !preExistingBtn;
  } else {
    const stale = getDock().querySelector(`[data-window-id="${id}"]`);
    if (stale) stale.remove();
    w.dockBtnAnimated = false;
  }
  const cardRect = w.card.getBoundingClientRect();
  const dockRect = dockBtn ? dockBtn.getBoundingClientRect() : getDock().getBoundingClientRect();
  w.card.style.setProperty("--dock-x", `${dockRect.left + dockRect.width / 2 - (cardRect.left + cardRect.width / 2)}px`);
  w.card.style.setProperty("--dock-y", `${dockRect.top + dockRect.height / 2 - (cardRect.top + cardRect.height / 2)}px`);
  w.card.style.setProperty("--dock-scale", String(Math.max(0.08, Math.min(0.25, dockRect.width / cardRect.width))));
  w.card.style.setProperty("--dock-origin-x", `${dockRect.left + dockRect.width / 2 - cardRect.left}px`);
  w.card.style.setProperty("--dock-origin-y", `${dockRect.top + dockRect.height / 2 - cardRect.top}px`);
  w.card.style.setProperty("--dock-x-mid", `${(dockRect.left + dockRect.width / 2 - (cardRect.left + cardRect.width / 2)) * 0.58}px`);
  w.card.style.setProperty("--dock-y-mid", `${(dockRect.top + dockRect.height / 2 - (cardRect.top + cardRect.height / 2)) * 0.58}px`);
  w.card.style.setProperty("--dock-x-near", `${(dockRect.left + dockRect.width / 2 - (cardRect.left + cardRect.width / 2)) * 0.68}px`);
  w.card.style.setProperty("--dock-y-near", `${(dockRect.top + dockRect.height / 2 - (cardRect.top + cardRect.height / 2)) * 0.68}px`);
  if (w.dockBtnAnimated && dockBtn) {
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
    if (w.dockBtnAnimated && dockBtn) {
      dockBtn.classList.remove("dockIconFromWindow");
      dockBtn.removeAttribute("style");
    }

  }, 380);
  window.dispatchEvent(new CustomEvent("orbit:window-minimized", { detail: { id } }));
},

restore(id) {
  const w = windows.get(id);
  if (!w) return;
  // Garde d'ouverture (ex : passe de combat hors event) : refus silencieux.
  try {
    if (typeof window.__windowOpenGuard === "function" && window.__windowOpenGuard(id) === false) return;
  } catch {}
  // Lire le dock avant de rendre la fenetre visible : aucune mesure apres
  // les ecritures de position qui declencherait une nouvelle mise en page.
  const dockBtn = getDock().querySelector(`[data-window-id="${id}"]`);
  const dockRect = dockBtn?.getBoundingClientRect();
  saveWindowOpenState(id, true);
  clearTimeout(w.animationTimer);
  w.card.classList.remove("gameWinClosing");
  w.card.classList.remove("gameWinOpening");

  // ✅ on retire l'état réduit sur root ET card
  w.root.classList.remove("gameWinMinimized");
  w.card.classList.remove("gameWinMinimized");

  // ✅ pour les fenêtres HUD, on force block
  w.root.style.display = "block";
  w.card.style.display = "block";

  const restoredSavedPosition = applySavedWindowPosition(id, w.card);
  w.card.style.visibility = "visible";
  w.card.style.opacity = "1";
  // Le contenu peut changer la taille (parametres, arbre, raffinage).
  // Le construire avant de mesurer evite une seconde mise en page pendant
  // l'animation, et le placement tient compte de la taille finale.
  window.dispatchEvent(new CustomEvent("orbit:window-restoring", { detail: { id } }));
  const cardRect = keepWindowInsideViewport(w.card, { centerIfUnpositioned: !restoredSavedPosition });
  bringWindowToFront(w.card);
  if (dockRect && cardRect) {
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
  // Demarrer avant le premier affichage : sinon la fenetre apparait une
  // image a sa taille finale avant de repartir du dock.
  w.card.classList.add("gameWinOpening");
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

    isCollapsed() {
      try { return getDock().classList.contains("dock-collapsed"); } catch { return false; }
    },

    // Collapse : les boutons (sauf Session, Paramètres et celui-ci) s'effacent
    // ET se replient en largeur en même temps : le flex fait glisser les
    // icônes restantes en continu pendant le fondu. L'état final reste en
    // inline (largeur 0 + invisible), pixel-identique à la fin du fondu :
    // aucun display:none, donc aucun tick. Expand : l'inverse.
    // Les fenêtres restent ouvertes dans les deux cas.
    toggleCollapse() {
      const dock = getDock();
      const btn = document.getElementById("btnCollapseHub");
      const survivors = () => [...dock.children].filter(el =>
        el === btn || el.id === "btnSettingsHub" || el.classList?.contains("sessionDockMenu"));
      const targets = () => [...dock.children].filter(el =>
        el !== btn && el.id !== "btnSettingsHub" && !el.classList?.contains("sessionDockMenu"));
      const tk = (this._collapseAnim = (this._collapseAnim || 0) + 1);
      const gap = (() => { try { return parseFloat(getComputedStyle(dock).columnGap) || 0; } catch { return 0; } })();
      const cleanupTrans = (el) => {
        try { el.style.transition = ""; el.style.transitionDelay = ""; } catch {}
      };
      const fullCleanup = (el) => {
        try { el.style.transition = ""; el.style.transitionDelay = ""; el.style.opacity = ""; el.style.transform = ""; el.style.maxWidth = ""; el.style.minWidth = ""; el.style.marginRight = ""; el.style.overflow = ""; el.style.visibility = ""; el.style.pointerEvents = ""; } catch {}
      };
      if (dock.classList.contains("dock-collapsed")) {
        // Expand : les survivants s'écartent pendant que les boutons
        // réapparaissent (largeur + fondu), tout en même temps.
        dock.classList.remove("dock-collapsed");
        try { localStorage.setItem("orbit_dock_collapsed", "0"); } catch {}
        try { btn?.classList.remove("collapsed"); } catch {}
        targets().forEach((el, i) => {
          try {
            const natW = el._collapseNatW || 60;
            el.style.transition = "none";
            el.style.transitionDelay = "0ms";
            el.style.overflow = "hidden";
            el.style.visibility = "";
            el.style.pointerEvents = "";
            el.style.opacity = "0";
            el.style.maxWidth = "0px";
            el.style.minWidth = "0px";
            el.style.marginRight = `${-gap}px`;
            void el.offsetWidth;
            el.style.transition = "opacity .12s ease-out, max-width .16s ease-out, min-width .16s ease-out, margin-right .16s ease-out";
            el.style.transitionDelay = `${i * 8}ms`;
            el.style.opacity = "";
            el.style.maxWidth = `${natW}px`;
            el.style.minWidth = "";
            el.style.marginRight = "";
          } catch {}
          setTimeout(() => { if (this._collapseAnim === tk) fullCleanup(el); }, i * 8 + 260);
        });
        return;
      }
      // Collapse : fondu + repli simultanés, les survivants suivent le reflow.
      try { btn?.classList.add("collapsed"); } catch {}
      const list = targets();
      list.forEach((el, i) => {
        try {
          el._collapseNatW = el.offsetWidth || 60;
          el.style.transition = "none";
          el.style.transitionDelay = "0ms";
          el.style.overflow = "hidden";
          el.style.maxWidth = `${el._collapseNatW}px`;
          void el.offsetWidth;
          el.style.transition = "opacity .12s ease-out, max-width .16s ease-out, min-width .16s ease-out, margin-right .16s ease-out";
          el.style.transitionDelay = `${i * 8}ms`;
          el.style.opacity = "0";
          el.style.maxWidth = "0px";
          el.style.minWidth = "0px";
          el.style.marginRight = `${-gap}px`;
        } catch {}
      });
      setTimeout(() => {
        if (this._collapseAnim !== tk) return;
        // État final = état animé + invisible : aucun changement layout.
        list.forEach(el => {
          try {
            el.style.transition = "";
            el.style.transitionDelay = "";
            el.style.visibility = "hidden";
            el.style.pointerEvents = "none";
          } catch {}
        });
        dock.classList.add("dock-collapsed");
        try { localStorage.setItem("orbit_dock_collapsed", "1"); } catch {}
      }, list.length * 8 + 260);
    },

    resetPositions() {
  // Séquence : purge positions + états -> TOUT ouvrir recentré ->
  // tout refermer -> refresh. Le reload recharge la disposition par
  // défaut (positions purgées = centrées, états purgés = defaultOpen).
  // Les phases ouvrir/fermer ne persistent rien (pas de saveWindowOpenState
  // ni saveWindowPosition) : seul le reload final applique le défaut.
  clearSavedWindowPositions();
  clearSavedWindowStates();

  const dock = getDock();
  const list = [...windows.values()].filter((w) => w && w.card && w.root);

  const showAll = () => {
    for (const w of list) {
      const card = w.card;
      const root = w.root;
      clearTimeout(w.animationTimer);
      clearTimeout(w.animationIconTimer);
      card.classList.remove("gameWinOpening");
      card.classList.remove("gameWinClosing");
      card.classList.remove("floating");
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

      root.classList.remove("gameWinMinimized");
      card.classList.remove("gameWinMinimized");
      root.style.display = "block";
      card.style.display = "block";
      bringWindowToFront(card);

      if (w.minimizable === false || w.dock === false) {
        const dockBtn = dock.querySelector(`[data-window-id="${w.id}"]`);
        if (dockBtn) dockBtn.remove();
      } else {
        const btn2 = makeDockIcon(w.id, w.title, w.icon);
        btn2?.classList.add("dockIconActive");
        refreshDockIcon(btn2);
      }

      if (w.id === "minimap" && typeof applyMinimapProportions === "function") {
        applyMinimapProportions(card, card.getBoundingClientRect().width || 250);
      }
      keepWindowInsideViewport(card, { centerIfUnpositioned: true });
    }
  };

  const hideAll = () => {
    for (const w of list) {
      clearTimeout(w.animationTimer);
      clearTimeout(w.animationIconTimer);
      w.card.classList.remove("gameWinOpening");
      w.card.classList.remove("gameWinClosing");
      w.root.classList.add("gameWinMinimized");
      w.card.classList.add("gameWinMinimized");
      w.root.style.display = "none";
      w.card.style.display = "none";
      const btn2 = dock.querySelector(`[data-window-id="${w.id}"]`);
      if (w.minimizable === false || w.dock === false) {
        if (btn2) btn2.remove();
      } else if (btn2) {
        btn2.classList.remove("dockIconActive");
        refreshDockIcon(btn2);
      }
    }
  };

  showAll();
  setTimeout(hideAll, 700);
  setTimeout(() => { try { location.reload(); } catch {} }, 1200);
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

    focus(id) {
      const w = windows.get(id);
      if (w && w.card.style.display !== 'none') {
        keepWindowInsideViewport(w.card);
        bringWindowToFront(w.card);
      }
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
      // Re-résout depuis la position relative sauvegardée : la fenêtre
      // suit le redimensionnement (ex : reste en bas à droite) au lieu
      // de rester figée à ses anciens pixels. On re-sauvegarde ensuite
      // pour figer la fraction (inchangée si suivi parfait).
      keepWindowInsideViewport(w.card, { anchor: loadWindowPosition(w.id) });
      saveWindowPosition(w.id, w.card);
    }
  });

  // Disposition du dock : ligne centrée (départ) -> ligne à gauche ->
  // 3 lignes à gauche -> ligne à droite -> 3 lignes à droite -> départ...
  // Bouton SVG en fin de dock, préférence persistée.
  // Les boutons s'animent vers leur nouvelle place.
  (() => {
    const dock = document.getElementById("gameWindowDock");
    if (!dock) return;
    const KEY = "orbit_dock_layout";
    const MODES = ["center", "left", "left3", "right", "right3"];
    const LABELS = { "center": "centrée", "left": "ligne à gauche", "left3": "3 lignes à gauche", "right": "ligne à droite", "right3": "3 lignes à droite" };
    const btn = document.createElement("button");
    btn.type = "button";
    btn.id = "btnDockLayout";
    btn.className = "dockLayoutBtn";
    btn.setAttribute("aria-label", "Changer la disposition du dock");
    btn.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><g fill="#9eeeff"><circle cx="3.5" cy="4" r="1.7"/><circle cx="8" cy="4" r="1.7"/><circle cx="12.5" cy="4" r="1.7"/><circle cx="5.75" cy="8.5" r="1.7"/><circle cx="10.25" cy="8.5" r="1.7"/><circle cx="3.5" cy="13" r="1.7"/><circle cx="8" cy="13" r="1.7"/><circle cx="12.5" cy="13" r="1.7"/></g></svg>';
    dock.appendChild(btn);
    const apply = (mode, animate) => {
      const all = [...dock.children];
      const first = new Map();
      if (animate) for (const el of all) { try { first.set(el, el.getBoundingClientRect()); } catch {} }
      dock.classList.toggle("mode-left", mode === "left");
      dock.classList.toggle("mode-left3", mode === "left3");
      dock.classList.toggle("mode-right", mode === "right");
      dock.classList.toggle("mode-right3", mode === "right3");
      try { localStorage.setItem(KEY, mode); } catch {}
      btn.title = `Disposition du dock : ${LABELS[mode] || mode}`;
      if (!animate) return;
      void dock.offsetWidth;
      // Placement en cascade : chaque icône se replace l'une après l'autre
      // en fondu rapide (délai progressif), au lieu d'un décalage groupé.
      for (const [i, el] of all.entries()) {
        const f = first.get(el);
        if (!f) continue;
        let l;
        try { l = el.getBoundingClientRect(); } catch { continue; }
        const dx = f.left - l.left;
        const dy = f.top - l.top;
        const tk = (el._dockFlip = (el._dockFlip || 0) + 1);
        // Le bouton disposition est visuellement dernier : il ferme l'animation.
        const delay = (el === btn) ? (all.length * 14) : (i * 14);
        try {
          el.style.transition = "none";
          el.style.transitionDelay = "0ms";
          if (dx || dy) el.style.transform = `translate(${dx}px,${dy}px)`;
          el.style.opacity = "0";
          void el.offsetWidth;
          el.style.transition = "transform .14s ease-out, opacity .12s ease-out";
          el.style.transitionDelay = `${delay}ms`;
          el.style.transform = "";
          el.style.opacity = "";
        } catch {}
        setTimeout(() => { if (el._dockFlip === tk) { el.style.transition = ""; el.style.transitionDelay = ""; el.style.transform = ""; el.style.opacity = ""; } }, delay + 200);
      }
    };
    let cur = "center";
    try { cur = localStorage.getItem(KEY) || "center"; } catch {}
    if (!MODES.includes(cur)) cur = "center";
    apply(cur, false);
    btn.addEventListener("click", () => {
      cur = MODES[(MODES.indexOf(cur) + 1) % MODES.length];
      apply(cur, true);
    });
    // Reset externe (bouton "Réinitialiser le dock" des paramètres).
    window.resetDockLayout = () => { cur = "center"; apply(cur, true); };
  })();
})();
