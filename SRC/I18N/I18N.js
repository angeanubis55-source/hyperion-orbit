// SRC/I18N/I18N.js
// Langues du jeu. Le français est la langue source : chaque dictionnaire est
// indexé par le texte français exact ("Afficher les NPC" -> "Show NPCs").
// Seule la langue choisie est chargée. Un texte absent de son dictionnaire
// s'affiche en anglais (EN.js), et à défaut reste en français.
//
// - t(texte)      : traduit un texte (canvas, toasts, notifications).
// - traducteur DOM : en dehors du français, remplace au chargement puis à
//   chaque ajout/modification les textes et attributs (title, placeholder…)
//   qui correspondent à une entrée. Couvre le HTML statique et les fenêtres
//   construites en JS sans toucher à leur code.
// - translate="no" sur un élément : ni lui ni ses enfants ne sont traduits
//   (tchat, pseudos…).
"use strict";

const LANG_KEY = "orbit_lang";
export const LANGUAGES = Object.freeze([
  { id: "fr", label: "Français", flag: "fr" },
  { id: "en", label: "English", flag: "en", file: "EN" },
  { id: "de", label: "Deutsch", flag: "de", file: "DE" },
]);
// Drapeaux officiels DarkOrbit (do_img/global/flaggen/plain), 16x11.
const flagUrl = (code) => new URL(`../../ASSETS/FLAGS/${code}.png`, import.meta.url).href;

function readLang() {
  try {
    const v = String(localStorage.getItem(LANG_KEY) || "").toLowerCase();
    if (LANGUAGES.some((l) => l.id === v)) return v;
  } catch {}
  return "fr";
}

const LANG = readLang();

async function loadDict(file) {
  if (!file) return null;
  try { return (await import(`./${file}.js`)).default; } catch { return null; }
}
const LANG_DEF = LANGUAGES.find((l) => l.id === LANG);
// Anglais en base pour toute langue étrangère, puis la langue par-dessus.
const DICTS = LANG === "fr" ? [] : [await loadDict("EN"), LANG === "en" ? null : await loadDict(LANG_DEF?.file)].filter(Boolean);
const DICT = DICTS.length ? DICTS : null;

export function getLang() {
  return LANG;
}

export function setLang(id) {
  const v = String(id || "").toLowerCase();
  if (!LANGUAGES.some((l) => l.id === v)) return;
  try { localStorage.setItem(LANG_KEY, v); } catch {}
}

// ------------------------------------------------------------
// Traduction d'un texte
// ------------------------------------------------------------
const exact = new Map();
const patterns = [];
if (DICT) {
  const merged = new Map();
  for (const d of DICT) {
    for (const [fr, tr] of Object.entries(d.texts || {})) exact.set(fr, tr);
    for (const [fr, tr] of Object.entries(d.patterns || {})) merged.set(fr, tr);
  }
  // Modèles avec valeurs variables : "{0} crédits" -> "{0} credits".
  for (const [fr, tr] of merged) {
    const src = fr.split(/\{\d+\}/).map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    const ids = [...fr.matchAll(/\{(\d+)\}/g)].map((m) => Number(m[1]));
    const fixed = fr.replace(/\{\d+\}/g, "").length;
    patterns.push({ re: new RegExp(`^${src.join("(.*?)")}$`, "s"), ids, tr, fixed });
  }
  // Le modèle le plus précis (le plus de texte fixe) est testé en premier.
  patterns.sort((a, b) => b.fixed - a.fixed);
}

const cache = new Map();
const LETTER = /[A-Za-zÀ-ÿ]/;
// Préfixe décoratif (emoji, puces, flèches) et suffixe de ponctuation.
const WRAP = /^([^A-Za-zÀ-ÿ0-9]*)(.*?)([\s:.…!?]*)$/su;

function lookup(text) {
  const hit = exact.get(text);
  if (hit !== undefined) return hit;
  for (const p of patterns) {
    const m = p.re.exec(text);
    if (!m) continue;
    return p.tr.replace(/\{(\d+)\}/g, (_, n) => {
      const v = m[p.ids.indexOf(Number(n)) + 1] ?? "";
      return translateText(v) ?? v;
    });
  }
  return null;
}

// Renvoie la traduction, ou null si le texte n'a pas d'entrée.
function translateText(text) {
  if (!DICT || !text || !LETTER.test(text)) return null;
  if (cache.has(text)) return cache.get(text);
  let out = lookup(text);
  if (out == null) {
    const m = WRAP.exec(text);
    if (m && m[2] && (m[1] || m[3])) {
      const core = lookup(m[2]);
      if (core != null) out = m[1] + core + m[3];
    }
  }
  if (cache.size > 5000) cache.clear();
  cache.set(text, out);
  return out;
}

export function t(text) {
  if (!DICT || text == null) return text;
  const s = String(text);
  return translateText(s) ?? s;
}

// ------------------------------------------------------------
// Traducteur DOM
// ------------------------------------------------------------
const ATTRS = ["title", "placeholder", "aria-label", "data-docklabel", "alt"];
const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "TEXTAREA", "CODE", "PRE"]);

function skipped(el) {
  for (let e = el; e && e.nodeType === 1; e = e.parentElement) {
    if (SKIP_TAGS.has(e.tagName) || e.isContentEditable) return true;
    if (e.getAttribute("translate") === "no") return true;
  }
  return false;
}

function translateTextNode(node) {
  const raw = node.nodeValue;
  if (!raw || raw.length > 400 || !LETTER.test(raw)) return;
  if (skipped(node.parentElement)) return;
  const trimmed = raw.replace(/\s+/g, " ").trim();
  const tr = translateText(trimmed);
  if (tr == null || tr === trimmed) return;
  const lead = /^\s*/.exec(raw)[0];
  const trail = /\s*$/.exec(raw)[0];
  node.nodeValue = lead + tr + trail;
}

function translateAttrs(el) {
  for (const a of ATTRS) {
    const v = el.getAttribute(a);
    if (!v) continue;
    const tr = translateText(v.replace(/\s+/g, " ").trim());
    if (tr != null && tr !== v) el.setAttribute(a, tr);
  }
}

function translateTree(root) {
  if (!root) return;
  if (root.nodeType === 3) { translateTextNode(root); return; }
  if (root.nodeType !== 1 && root.nodeType !== 9) return;
  if (root.nodeType === 1) {
    if (skipped(root)) return;
    translateAttrs(root);
  }
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode(n) {
      if (n.nodeType === 1) {
        if (SKIP_TAGS.has(n.tagName) || n.getAttribute("translate") === "no") return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n.nodeType === 3) translateTextNode(n);
    else translateAttrs(n);
  }
}

function startDomTranslator() {
  translateTree(document.documentElement);
  if (typeof MutationObserver === "undefined") return;
  new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === "characterData") translateTextNode(r.target);
      else if (r.type === "attributes") {
        if (!skipped(r.target)) translateAttrs(r.target);
      } else {
        for (const n of r.addedNodes) translateTree(n);
      }
    }
  }).observe(document.documentElement, {
    subtree: true, childList: true, characterData: true,
    attributes: true, attributeFilter: ATTRS,
  });
}

// ------------------------------------------------------------
// Texte hors DOM : boîtes de dialogue natives et canvas
// ------------------------------------------------------------
function hookNativeText() {
  for (const name of ["alert", "confirm", "prompt"]) {
    const orig = window[name];
    if (typeof orig !== "function") continue;
    window[name] = function (msg, ...rest) {
      return orig.call(window, msg == null ? msg : t(msg), ...rest);
    };
  }
  // Canvas : tout texte dessiné (noms, chronos, bannières…) passe par le
  // dictionnaire. measureText suit, pour que les mises en page restent justes.
  const proto = typeof CanvasRenderingContext2D !== "undefined" ? CanvasRenderingContext2D.prototype : null;
  if (!proto) return;
  for (const name of ["fillText", "strokeText", "measureText"]) {
    const orig = proto[name];
    if (typeof orig !== "function") continue;
    proto[name] = function (text, ...rest) {
      return orig.call(this, typeof text === "string" ? (translateText(text) ?? text) : text, ...rest);
    };
  }
}

// ------------------------------------------------------------
// Sélecteur de langue (Paramètres > Général > Langue)
// ------------------------------------------------------------
// Un <select> natif ne peut pas afficher d'image : le <select> reste (caché)
// pour la valeur, et une petite liste maison affiche les drapeaux.
function flagRow(l) {
  return `<img src="${flagUrl(l.flag)}" alt="" width="16" height="11" style="flex:none;image-rendering:pixelated"><span>${l.label}</span>`;
}

function wireLanguageSelect() {
  const sel = document.getElementById("optLang");
  if (!sel || sel.dataset.i18nWired) return;
  sel.dataset.i18nWired = "1";
  sel.innerHTML = "";
  for (const l of LANGUAGES) {
    const o = document.createElement("option");
    o.value = l.id;
    o.textContent = l.label;
    sel.appendChild(o);
  }
  sel.value = LANG;
  sel.style.display = "none";

  const box = document.createElement("div");
  box.setAttribute("translate", "no");
  box.style.cssText = "position:relative;width:100%";
  const btn = document.createElement("button");
  btn.type = "button";
  btn.style.cssText = "display:flex;align-items:center;gap:8px;width:100%;height:34px;box-sizing:border-box;padding:0 10px;"
    + "border:1px solid rgba(124,240,255,.34);border-radius:8px;background:#071b28;color:#eaffff;"
    + "font:800 11px/1 ui-sans-serif,system-ui;cursor:pointer;text-align:left";
  const current = LANGUAGES.find((l) => l.id === LANG) || LANGUAGES[0];
  btn.innerHTML = `${flagRow(current)}<span style="margin-left:auto;opacity:.7">▾</span>`;
  const list = document.createElement("div");
  list.hidden = true;
  list.style.cssText = "position:absolute;left:0;right:0;top:calc(100% + 4px);z-index:50;padding:4px;"
    + "border:1px solid rgba(124,240,255,.34);border-radius:8px;background:#071b28;box-shadow:0 8px 20px rgba(0,0,0,.45)";
  for (const l of LANGUAGES) {
    const item = document.createElement("div");
    item.dataset.lang = l.id;
    item.style.cssText = "display:flex;align-items:center;gap:8px;padding:7px 8px;border-radius:6px;cursor:pointer;"
      + `color:#eaffff;font:800 11px/1 ui-sans-serif,system-ui;${l.id === LANG ? "background:rgba(124,240,255,.14)" : ""}`;
    item.innerHTML = flagRow(l);
    item.addEventListener("mouseenter", () => { if (l.id !== LANG) item.style.background = "rgba(124,240,255,.08)"; });
    item.addEventListener("mouseleave", () => { if (l.id !== LANG) item.style.background = ""; });
    item.addEventListener("click", () => {
      list.hidden = true;
      if (l.id === LANG) return;
      setLang(l.id);
      // Rechargement : tout le jeu repart dans la nouvelle langue.
      location.reload();
    });
    list.appendChild(item);
  }
  btn.addEventListener("click", (e) => { e.stopPropagation(); list.hidden = !list.hidden; });
  document.addEventListener("click", (e) => { if (!box.contains(e.target)) list.hidden = true; });
  box.append(btn, list);
  sel.after(box);
}

function boot() {
  try { document.documentElement.lang = LANG; } catch {}
  wireLanguageSelect();
  if (DICT) startDomTranslator();
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  window.__t = t;
  // Immédiat (avant le premier rendu du jeu), pas au DOMContentLoaded.
  if (DICT) hookNativeText();
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
}
