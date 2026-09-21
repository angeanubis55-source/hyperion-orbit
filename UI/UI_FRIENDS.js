"use strict";

// UI/UI_FRIENDS.js — Fenêtre Amis façon DarkOrbit.
// Demande d'ami -> l'autre est notifié (live + persisté) et accepte/refuse
// dans sa fenêtre Amis ; amitié mutuelle. Pastille en ligne temps réel,
// murmure (/w dans le tchat) et invitation dans l'escadrille.
// Cliquer sur un nom pré-remplit le champ d'ajout.

import {
  getNetFriendsOnline, sendGroupInvite,
  drainNetFriendRequestInbox, consumeFriendsDirty,
  sendFriendPing, sendFriendResponded,
} from "../SRC/CORE/NETPLAY.js";
import { escapeHtml } from "./UI_DOM.js";

let started = false;

function authHeaders() {
  try {
    const tok = String(localStorage.getItem("orbit_token") || "");
    return tok ? { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" } : null;
  } catch { return null; }
}

async function apiFriends(path, method, body) {
  const h = authHeaders();
  if (!h) throw new Error("Connecte-toi pour gérer tes amis.");
  const res = await fetch(path, {
    method,
    headers: h,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.ok) throw new Error(data?.error || "Erreur serveur.");
  return data;
}

export function initFriendsUI() {
  if (started) return;
  started = true;
  const status = document.getElementById("friendsStatus");
  const list = document.getElementById("friendsList");
  const reqList = document.getElementById("friendsRequests");
  const addInput = document.getElementById("friendAddInput");
  if (!list) return;

  let friends = []; // [{ id, pseudo }] (compte)
  let requests = []; // [{ fromId, pseudo, at }] (demandes reçues)
  let lastSig = "";

  async function load() {
    try {
      if (!authHeaders()) {
        friends = [];
        requests = [];
        if (status) status.textContent = "Connecte-toi pour gérer tes amis.";
        render();
        renderRequests();
        return;
      }
      const [f, r] = await Promise.all([
        apiFriends("/api/friends", "GET"),
        apiFriends("/api/friends/requests", "GET"),
      ]);
      friends = Array.isArray(f.friends) ? f.friends : [];
      requests = Array.isArray(r.requests) ? r.requests : [];
      if (status) {
        status.textContent = friends.length
          ? `${friends.length} ami${friends.length > 1 ? "s" : ""}`
          : "Aucun ami. Envoie des demandes par pseudo.";
      }
    } catch {
      if (status) status.textContent = "Hors ligne (serveur injoignable)";
    }
    render();
    renderRequests();
  }

  function onlineIds() {
    try { return new Set(getNetFriendsOnline().map((f) => String(f.id))); } catch { return new Set(); }
  }

  function render() {
    const online = onlineIds();
    let live = [];
    try { live = getNetFriendsOnline(); } catch {}
    const liveById = new Map(live.map((f) => [String(f.id), f.pseudo]));
    if (!friends.length) {
      list.innerHTML = `<div class="friendsEmpty">Aucun ami pour l'instant.</div>`;
      return;
    }
    list.innerHTML = friends.map((f) => {
      const fid = escapeHtml(String(f.id));
      const pseudo = escapeHtml(liveById.get(String(f.id)) || f.pseudo || "Pilote");
      const on = online.has(String(f.id));
      return `<div class="friendsRow" data-fid="${fid}" data-pseudo="${pseudo}">`
        + `<span class="friendsDot${on ? " on" : ""}" title="${on ? "En ligne" : "Hors ligne"}"></span>`
        + `<span class="friendsName" title="Cliquer pour pré-remplir">${pseudo}</span>`
        + `<span class="friendsBtns"><button type="button" data-act="whisper" title="Murmurer">MP</button>`
        + `<button type="button" data-act="invite" title="Inviter dans l'escadrille">+Grp</button>`
        + `<button type="button" data-act="remove" title="Retirer">✕</button></span></div>`;
    }).join("");
  }

  function renderRequests() {
    if (!reqList) return;
    if (!requests.length) {
      reqList.innerHTML = `<div class="friendsEmpty">Aucune demande.</div>`;
      return;
    }
    reqList.innerHTML = requests.map((r) => {
      const pseudo = escapeHtml(r.pseudo || "Pilote");
      return `<div class="friendsRow" data-req="${pseudo}">`
        + `<span class="friendsName">${pseudo}</span>`
        + `<span class="friendsBtns"><button type="button" data-act="accept" title="Accepter">✓</button>`
        + `<button type="button" data-act="decline" title="Refuser">✕</button></span></div>`;
    }).join("");
  }

  function prefill(pseudo) {
    if (addInput && pseudo) {
      addInput.value = String(pseudo);
      addInput.focus();
    }
  }

  function poll() {
    try {
      let inbox = [];
      try { inbox = drainNetFriendRequestInbox(); } catch {}
      // Les demandes live arrivent aussi par le poll HTTP : on recharge.
      if (inbox.length) { load(); return; }
      if (consumeFriendsDirty()) { load(); return; }
      const sig = (() => { try { return JSON.stringify(getNetFriendsOnline()); } catch { return "[]"; } })();
      if (sig !== lastSig) { lastSig = sig; render(); }
    } catch {}
  }

  document.getElementById("friendAddForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const v = addInput?.value.trim();
    if (!v) return;
    try {
      const data = await apiFriends("/api/friends", "POST", { pseudo: v });
      if (data.mutual) {
        if (status) status.textContent = `${data.to?.pseudo || v} et toi êtes maintenant amis !`;
      } else {
        if (status) status.textContent = `Demande envoyée à ${data.to?.pseudo || v}.`;
        try { sendFriendPing(data.to?.pseudo || v); } catch {}
      }
      if (addInput) addInput.value = "";
      await load();
    } catch (err) {
      if (status) status.textContent = String(err?.message || "Demande impossible.");
    }
  });
  list.addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-act]");
    const row = e.target.closest("[data-fid]");
    if (!row) return;
    const pseudo = row.dataset.pseudo || "";
    if (!btn) {
      // Clic sur la ligne : pré-remplit le champ d'ajout.
      prefill(pseudo);
      return;
    }
    if (btn.dataset.act === "remove") {
      try { await apiFriends("/api/friends", "DELETE", { pseudo }); } catch {}
      await load();
    } else if (btn.dataset.act === "invite") {
      try { sendGroupInvite(pseudo); } catch {}
    } else if (btn.dataset.act === "whisper") {
      // Murmure façon DO : commande /w pré-remplie dans le tchat.
      try {
        const input = document.getElementById("chatInput");
        if (input) { input.value = `/w ${pseudo} `; input.focus(); }
        window.GameWindowManager?.restore?.("chatWindow");
      } catch {}
    }
  });
  reqList?.addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-act]");
    const row = e.target.closest("[data-req]");
    if (!btn || !row) return;
    const pseudo = row.dataset.req || "";
    try {
      if (btn.dataset.act === "accept") {
        await apiFriends("/api/friends/accept", "POST", { pseudo });
        try { sendFriendResponded(pseudo); } catch {}
      } else {
        await apiFriends("/api/friends/decline", "POST", { pseudo });
        try { sendFriendResponded(pseudo); } catch {}
      }
    } catch {}
    await load();
  });

  load();
  setInterval(load, 30000);
  setInterval(poll, 1000);
  poll();
  try {
    window.addEventListener("orbit:window-restored", (e) => {
      if (e?.detail?.id === "friendsWindow") load();
    });
  } catch {}
}
