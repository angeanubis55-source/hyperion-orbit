"use strict";
import { buyPassShopOfferOnline, claimBattlepassObjective, getCurrentUserFull, PASS_SHOP_OFFERS } from "../SRC/CORE/ACCOUNT.js";
import { BATTLEPASS_OBJECTIVES, normalizeBattlepassState } from "../QUEST/BATTLEPASS.js";
import { ITEM_RARITIES } from "../SRC/DATA/ITEM_RARITIES.js";
import { halloweenCountdown, isHalloweenEventActive } from "../NPC/NPC_HALLOWEEN.js";
import { escapeHtml } from "./UI_DOM.js";
import { refreshTdmWindow } from "./UI_TDM.js";
import { isWindowShown } from "../SRC/CORE/BACKGROUND_REFRESH.js";

let started = false;
let countdownTimer = null;

function formatPassCountdown() {
  try {
    const cd = halloweenCountdown();
    const p2 = (v) => String(v).padStart(2, "0");
    return `Se termine dans ${cd.days}j ${p2(cd.hours)}h ${p2(cd.minutes)}m ${p2(cd.seconds)}s`;
  } catch { return ""; }
}

function tickPassCountdown() {
  try {
    const el = document.getElementById("passCountdown");
    if (el) el.textContent = formatPassCountdown();
  } catch {}
}

export function initBattlepassUI() {
  if (started) return;
  started = true;
  const list = document.getElementById("passList");
  const shop = document.getElementById("passShop");
  const status = document.getElementById("passStatus");
  const keys = document.getElementById("passKeys");
  const tabObjectives = document.getElementById("passTabObjectives");
  const tabShop = document.getElementById("passTabShop");
  if (!list) return;
  let tab = "objectives";

  function setTab(next) {
    tab = next;
    try {
      tabObjectives?.classList.toggle("active", tab === "objectives");
      tabShop?.classList.toggle("active", tab === "shop");
      if (list) list.hidden = tab !== "objectives";
      if (shop) shop.hidden = tab !== "shop";
    } catch {}
    render();
  }

  function renderHead(user, st) {
    const ownedKeys = Math.max(0, Math.floor(Number(user?.inventory?.resources?.battlepass_key) || 0));
    if (keys) keys.textContent = `Clés : ${ownedKeys}`;
    const done = st.claimed.length;
    if (status) status.textContent = `${done}/${BATTLEPASS_OBJECTIVES.length} récompenses récupérées`;
  }

  function renderObjectives() {
    const user = getCurrentUserFull();
    const st = normalizeBattlepassState(user?.battlepass);
    renderHead(user, st);
    list.innerHTML = "";
    for (const def of BATTLEPASS_OBJECTIVES) {
      const progress = Math.max(0, Math.floor(Number(st.progress[def.id]) || 0));
      const complete = progress >= def.amount;
      const claimed = st.claimed.includes(def.id);
      const pct = Math.max(0, Math.min(100, Math.round(progress / def.amount * 100)));
      const row = document.createElement("div");
      row.className = "passRow" + (complete ? " isDone" : "");
      const info = document.createElement("div");
      info.className = "passInfo";
      info.innerHTML = `<b>${escapeHtml(def.label)}</b>`
        + `<span class="passCount">${progress}/${def.amount} · +${def.keys} clé${def.keys > 1 ? "s" : ""}</span>`
        + `<span class="passBar"><i style="width:${pct}%"></i></span>`;
      row.appendChild(info);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "passClaim";
      if (claimed) {
        btn.innerHTML = `<span class="passCheck" title="Possédé">✓</span>`;
      } else {
        btn.textContent = complete ? "Récupérer" : `${pct} %`;
      }
      btn.disabled = !complete || claimed;
      if (complete && !claimed) {
        btn.addEventListener("click", () => {
          try {
            const res = claimBattlepassObjective(def.id);
            if (!res?.ok && status && !res?.silent) status.textContent = res?.error || "Récupération impossible.";
          } catch {}
          render();
        });
      }
      row.appendChild(btn);
      list.appendChild(row);
    }
  }

  function rarityMeta(id) {
    const meta = ITEM_RARITIES[id] || ITEM_RARITIES.common;
    return { id: meta.id, name: meta.name, color: meta.color };
  }

  function renderShop() {
    const user = getCurrentUserFull();
    const st = normalizeBattlepassState(user?.battlepass);
    renderHead(user, st);
    if (!shop) return;
    shop.innerHTML = "";
    let active = true;
    try { active = isHalloweenEventActive(); } catch {}
    if (!active) {
      const empty = document.createElement("div");
      empty.className = "passShopEmpty";
      empty.textContent = "Event Halloween terminé.";
      shop.appendChild(empty);
      return;
    }
    const ownedKeys = Math.max(0, Math.floor(Number(user?.inventory?.resources?.battlepass_key) || 0));
    for (const offer of PASS_SHOP_OFFERS) {
      const cost = Math.max(0, Math.floor(Number(offer.cost) || 0));
      const row = document.createElement("div");
      row.className = "passShopRow";
      const info = document.createElement("div");
      info.className = "passShopInfo";
      let title = `<b>${escapeHtml(offer.label)}</b>`;
      if (offer.kind === "module") {
        const meta = rarityMeta(offer.rarity);
        title = `<b style="color:${meta.color};">Module ${escapeHtml(meta.name)}</b>`;
      }
      info.innerHTML = title
        + `<small>${cost} clé${cost > 1 ? "s" : ""}${offer.kind === "module" ? " · tirage instantané" : ""}</small>`;
      row.appendChild(info);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "passRoll";
      btn.textContent = offer.kind === "module" ? `Tirer (${cost})` : `Acheter (${cost})`;
      btn.disabled = ownedKeys < cost;
      btn.addEventListener("click", async () => {
        try {
          const res = await buyPassShopOfferOnline(offer.id);
          if (!res?.ok && status && !res?.silent) status.textContent = res?.error || "Achat impossible.";
        } catch {}
        // Inventaire jeu + historique boutique : refresh immédiat,
        // sans fermer/rouvrir.
        try { refreshTdmWindow(); } catch {}
        try {
          window.dispatchEvent(new CustomEvent("orbit:pass-module-rolled"));
        } catch {}
        render();
      });
      row.appendChild(btn);
      shop.appendChild(row);
    }
  }

  function render() {
    if (tab === "shop") renderShop();
    else renderObjectives();
  }
  // Sauvegardes du compte : rien à reconstruire tant que la fenêtre est
  // fermée (orbit:window-restoring la redessine à l'ouverture).
  const renderIfShown = () => { if (isWindowShown("passWindow")) render(); };

  tabObjectives?.addEventListener("click", () => setTab("objectives"));
  tabShop?.addEventListener("click", () => setTab("shop"));

  // Hors event : la fenêtre disparaît (bouton du dock + fenêtre réduite).
  function syncPassVisibility() {
    let active = true;
    try { active = isHalloweenEventActive(); } catch {}
    try {
      const btn = document.getElementById("btnPassHub");
      if (btn) btn.style.display = active ? "" : "none";
    } catch {}
    if (!active) {
      try {
        const card = document.getElementById("passWindow");
        if (card) {
          card.classList.add("gameWinMinimized");
          card.style.display = "none";
        }
      } catch {}
      try { window.GameWindowManager?.minimize?.("passWindow"); } catch {}
    }
  }

  try {
    window.addEventListener("orbit:user-updated", renderIfShown);
    window.addEventListener("orbit:battlepass-updated", renderIfShown);
    window.addEventListener("orbit:window-restoring", (e) => { if (e?.detail?.id === "passWindow") render(); });
    setInterval(syncPassVisibility, 10000);
    if (!countdownTimer) countdownTimer = setInterval(tickPassCountdown, 1000);
  } catch {}
  try { syncPassVisibility(); } catch {}
  try { tickPassCountdown(); } catch {}
  render();
}
