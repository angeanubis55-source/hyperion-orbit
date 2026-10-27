"use strict";

// Listes déroulantes au style « Tous les vaisseaux » (historique des
// modules, classes tdmShip*). Chaque <select> du conteneur est habillé : le
// <select> reste caché dans le combo et garde la valeur, les événements
// "change" et tout le code existant. Les <select> ajoutés plus tard (lignes
// recréées) sont habillés automatiquement.
//
// La liste ouverte est UNE seule liste partagée, attachée à <body> en
// position fixe : elle passe au-dessus de tout et n'est jamais coupée par
// une zone qui défile (contenu de fenêtre en overflow).

const valueDescriptor = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value");
const DEFAULT_MAX_HEIGHT = 258;
let popup = null;
let active = null; // { combo, select, btn }

function escapeText(text) {
  return String(text ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function setImportant(el, styles) {
  for (const [prop, value] of Object.entries(styles)) el.style.setProperty(prop, value, "important");
}

function sharedPopup() {
  if (popup) return popup;
  popup = document.createElement("div");
  popup.className = "tdmShipPopup";
  popup.setAttribute("role", "listbox");
  popup.hidden = true;
  setImportant(popup, { position: "fixed", "z-index": "100000", right: "auto" });
  popup.addEventListener("click", (event) => {
    const opt = event.target.closest?.(".tdmShipOpt");
    if (!opt || !active) return;
    const { select } = active;
    closePopup();
    if (opt.dataset.value === valueDescriptor.get.call(select)) return;
    select.value = opt.dataset.value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  document.body.appendChild(popup);
  return popup;
}

function closePopup() {
  if (!active) return;
  active.btn.setAttribute("aria-expanded", "false");
  active = null;
  if (popup) popup.hidden = true;
}

// Sous le bouton, ou au-dessus s'il n'y a pas la place en bas de l'écran.
function placePopup(btn, maxHeight) {
  const rect = btn.getBoundingClientRect();
  const below = window.innerHeight - rect.bottom - 8;
  const above = rect.top - 8;
  const height = Math.min(maxHeight, popup.scrollHeight);
  const openUp = below < height && above > below;
  setImportant(popup, {
    left: `${Math.round(rect.left)}px`,
    width: `${Math.round(rect.width)}px`,
    "max-height": `${Math.max(80, Math.min(maxHeight, openUp ? above : below))}px`,
    top: openUp ? "auto" : `${Math.round(rect.bottom + 4)}px`,
    bottom: openUp ? `${Math.round(window.innerHeight - rect.top + 4)}px` : "auto",
  });
}

function openPopup(combo, select, btn) {
  const list = sharedPopup();
  const current = valueDescriptor.get.call(select);
  list.innerHTML = [...select.options].filter((o) => !o.disabled).map((o) =>
    `<div class="tdmShipOpt${o.value === current ? " selected" : ""}" role="option" data-value="${escapeText(o.value)}"`
    + `${o.title ? ` title="${escapeText(o.title)}"` : ""} aria-selected="${o.value === current}">${escapeText(o.textContent)}</div>`).join("");
  list.hidden = false;
  placePopup(btn, Number(combo.dataset.maxHeight) || DEFAULT_MAX_HEIGHT);
  active = { combo, select, btn };
  btn.setAttribute("aria-expanded", "true");
  // Seule la liste défile jusqu'à l'élément choisi (jamais la fenêtre).
  const selected = list.querySelector(".selected");
  list.scrollTop = selected ? Math.max(0, selected.offsetTop - (list.clientHeight - selected.offsetHeight) / 2) : 0;
}

function enhance(select, maxHeight) {
  select.dataset.combo = "1";
  const combo = document.createElement("div");
  combo.className = "tdmShipCombo";
  if (maxHeight) combo.dataset.maxHeight = String(maxHeight);
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "tdmShipBtn";
  btn.setAttribute("aria-haspopup", "listbox");
  btn.setAttribute("aria-expanded", "false");
  if (select.title) btn.title = select.title;
  const aria = select.getAttribute("aria-label");
  if (aria) btn.setAttribute("aria-label", aria);
  btn.innerHTML = `<span class="tdmShipBtnLabel"></span><span class="tdmShipChevron" aria-hidden="true">▾</span>`;
  select.replaceWith(combo);
  select.hidden = true;
  combo.append(select, btn);

  const paint = () => {
    const label = btn.querySelector(".tdmShipBtnLabel");
    const text = select.selectedOptions[0]?.textContent || "";
    if (label && label.textContent !== text) label.textContent = text;
  };
  select._comboPaint = paint;
  // Valeur changée par le code (select.value = ...) : le bouton suit.
  Object.defineProperty(select, "value", {
    configurable: true,
    get() { return valueDescriptor.get.call(this); },
    set(v) { valueDescriptor.set.call(this, v); paint(); },
  });
  btn.addEventListener("click", () => {
    if (active?.combo === combo) { closePopup(); return; }
    closePopup();
    openPopup(combo, select, btn);
  });
  paint();
}

export function enhanceSelects(root, { maxHeight = 0 } = {}) {
  if (!root) return;
  for (const select of root.querySelectorAll("select:not([data-combo])")) enhance(select, maxHeight);
}

// Habille le conteneur et tout <select> ajouté ensuite ; les options
// reconstruites (innerHTML) mettent aussi le bouton à jour.
export function watchSelects(root, options = {}) {
  if (!root || root.dataset.comboWatch) return;
  root.dataset.comboWatch = "1";
  enhanceSelects(root, options);
  new MutationObserver((records) => {
    let added = false;
    for (const record of records) {
      if (record.target instanceof HTMLSelectElement) record.target._comboPaint?.();
      else if (record.addedNodes.length) added = true;
    }
    // Ligne recréée pendant que sa liste est ouverte : on la referme.
    if (active && !active.combo.isConnected) closePopup();
    if (added) enhanceSelects(root, options);
  }).observe(root, { childList: true, subtree: true });
}

document.addEventListener("click", (event) => {
  if (!active) return;
  if (active.combo.contains(event.target) || popup?.contains(event.target)) return;
  closePopup();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closePopup();
});
// La liste est en position fixe : si la fenêtre défile ou change de taille,
// elle ne suivrait plus son bouton, on la referme.
document.addEventListener("scroll", (event) => {
  if (active && event.target !== popup) closePopup();
}, true);
window.addEventListener("resize", () => closePopup());
