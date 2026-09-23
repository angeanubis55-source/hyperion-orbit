"use strict";

import {
  getNetFriendsOnline, sendGroupInvite,
  drainNetFriendRequestInbox, consumeFriendsDirty,
  sendFriendPing, sendFriendResponded,
} from "../SRC/CORE/NETPLAY.js";
import { getShipDesignBaseId, getShipPackById } from "../SHIP/SHIP_PACKS.js";
import { escapeHtml } from "./UI_DOM.js";

let started = false;
const ICON_MESSAGE = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v11H9l-5 4V5Z"/><path d="M8 9h8M8 12h5"/></svg>`;
const ICON_GROUP = `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3"/><path d="M3.5 18c.5-3 2.3-4.5 5.5-4.5s5 1.5 5.5 4.5M18 7v6M15 10h6"/></svg>`;
const ICON_REMOVE = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17"/></svg>`;
const ICON_ACCEPT = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>`;

function authHeaders() {
  try {
    const token = String(localStorage.getItem("orbit_token") || "");
    return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : null;
  } catch { return null; }
}

async function apiFriends(path, method, body) {
  const headers = authHeaders();
  if (!headers) throw new Error("Connecte-toi pour gérer tes amis.");
  const response = await fetch(path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.ok) throw new Error(data?.error || "Erreur serveur.");
  return data;
}

function shipTypeName(shipId) {
  const raw = String(shipId || "").toLowerCase();
  const base = getShipDesignBaseId(raw) || raw;
  return String(getShipPackById(base)?.name || base.replaceAll("_", " ") || "Vaisseau").replace(/^Vaisseau:\s*/i, "");
}

export function initFriendsUI() {
  if (started) return;
  started = true;
  const status = document.getElementById("friendsStatus"), list = document.getElementById("friendsList"), reqList = document.getElementById("friendsRequests"), addInput = document.getElementById("friendAddInput"), search = document.getElementById("friendsSearch"), badge = document.getElementById("friendsRequestBadge");
  if (!list) return;
  let friends = [], requests = [], activeTab = "friends", query = "", lastSignature = "";

  function liveMap() {
    try { return new Map(getNetFriendsOnline().map(friend => [String(friend.id), friend])); } catch { return new Map(); }
  }

  function updateHeader(message = "") {
    const online = liveMap().size;
    if (status) status.textContent = message || `${online}/${friends.length} ami${friends.length > 1 ? "s" : ""} en ligne`;
    if (badge) { badge.textContent = String(requests.length); badge.hidden = requests.length === 0; }
    if (search) search.hidden = friends.length < 10;
  }

  function setTab(tab) {
    activeTab = tab === "requests" ? "requests" : "friends";
    for (const button of document.querySelectorAll("#friendsWindow [data-friends-tab]")) button.classList.toggle("active", button.dataset.friendsTab === activeTab);
    for (const pane of document.querySelectorAll("#friendsWindow [data-friends-pane]")) pane.classList.toggle("active", pane.dataset.friendsPane === activeTab);
    document.getElementById("friendAddForm")?.classList.toggle("muted", activeTab !== "friends");
  }

  function renderFriends() {
    const live = liveMap();
    const filtered = friends
      .filter(friend => !query || String(friend.pseudo || "").toLowerCase().includes(query))
      .sort((a, b) => Number(live.has(String(b.id)) || live.has(`u_${b.id}`)) - Number(live.has(String(a.id)) || live.has(`u_${a.id}`)) || String(a.pseudo || "").localeCompare(String(b.pseudo || ""), "fr"));
    if (!filtered.length) {
      list.innerHTML = `<div class="friendsEmpty">${query ? "Aucun ami ne correspond à la recherche." : "Aucun ami pour l'instant."}</div>`;
      return;
    }
    list.innerHTML = filtered.map(friend => {
      const id = String(friend.id), current = live.get(id) || live.get(`u_${id}`), online = !!current;
      const pseudoRaw = String(current?.pseudo || friend.pseudo || "Pilote");
      const pseudo = escapeHtml(pseudoRaw), fid = escapeHtml(id);
      let state = "Hors ligne", detail = "Dernière activité indisponible";
      if (online) {
        state = current.instance ? "Galaxy Gate" : (current.inGroup ? "En groupe" : "En ligne");
        detail = `${current.instance ? "Galaxy Gate" : `Carte ${current.map || "?"}`} · ${shipTypeName(current.shipId)}`;
      }
      return `<article class="friendCard${online ? " online" : " offline"}" data-fid="${fid}" data-pseudo="${pseudo}">`
        + `<span class="friendsDot${online ? " on" : ""}" title="${state}"></span>`
        + `<span class="friendIdentity"><strong>${pseudo}</strong><small>${escapeHtml(detail)}</small></span>`
        + `<span class="friendState${current?.instance ? " gate" : ""}">${escapeHtml(state)}</span>`
        + `<span class="friendsBtns"><button type="button" data-act="whisper" title="Message privé" aria-label="Message privé">${ICON_MESSAGE}</button>`
        + `<button type="button" data-act="invite" title="Inviter dans le groupe" aria-label="Inviter dans le groupe"${online ? "" : " disabled"}>${ICON_GROUP}</button>`
        + `<button class="danger" type="button" data-act="remove" title="Retirer des amis" aria-label="Retirer des amis">${ICON_REMOVE}</button></span></article>`;
    }).join("");
  }

  function renderRequests() {
    if (!reqList) return;
    if (!requests.length) { reqList.innerHTML = `<div class="friendsEmpty">Aucune demande en attente.</div>`; return; }
    reqList.innerHTML = requests.map(request => {
      const pseudo = escapeHtml(request.pseudo || "Pilote");
      return `<article class="friendCard request" data-req="${pseudo}"><span class="friendRequestIcon">?</span><span class="friendIdentity"><strong>${pseudo}</strong><small>Souhaite devenir ton ami</small></span><span class="friendsBtns"><button class="accept" type="button" data-act="accept" title="Accepter" aria-label="Accepter">${ICON_ACCEPT}</button><button class="danger" type="button" data-act="decline" title="Refuser" aria-label="Refuser">${ICON_REMOVE}</button></span></article>`;
    }).join("");
  }

  async function load(message = "") {
    try {
      if (!authHeaders()) { friends = []; requests = []; updateHeader("Connecte-toi pour gérer tes amis."); renderFriends(); renderRequests(); return; }
      const [friendData, requestData] = await Promise.all([apiFriends("/api/friends", "GET"), apiFriends("/api/friends/requests", "GET")]);
      friends = Array.isArray(friendData.friends) ? friendData.friends : [];
      requests = Array.isArray(requestData.requests) ? requestData.requests : [];
      updateHeader(message);
    } catch { updateHeader("Hors ligne — serveur injoignable"); }
    renderFriends(); renderRequests();
  }

  function poll() {
    try {
      if (drainNetFriendRequestInbox().length || consumeFriendsDirty()) { load(); return; }
      const signature = JSON.stringify(getNetFriendsOnline());
      if (signature !== lastSignature) { lastSignature = signature; updateHeader(); renderFriends(); }
    } catch {}
  }

  document.querySelector("#friendsWindow .friendsTabs")?.addEventListener("click", event => { const button = event.target.closest("[data-friends-tab]"); if (button) setTab(button.dataset.friendsTab); });
  search?.addEventListener("input", () => { query = String(search.value || "").trim().toLowerCase(); renderFriends(); });
  document.getElementById("friendAddForm")?.addEventListener("submit", async event => {
    event.preventDefault(); event.stopPropagation();
    const value = addInput?.value.trim();
    if (!value) return;
    try {
      const data = await apiFriends("/api/friends", "POST", { pseudo: value });
      if (!data.mutual) try { sendFriendPing(data.to?.pseudo || value); } catch {}
      if (addInput) addInput.value = "";
      await load(data.mutual ? `${data.to?.pseudo || value} est maintenant ton ami.` : `Demande envoyée à ${data.to?.pseudo || value}.`);
    } catch (error) { updateHeader(String(error?.message || "Demande impossible.")); }
  });
  list.addEventListener("click", async event => {
    const button = event.target.closest("button[data-act]"), row = event.target.closest("[data-fid]");
    if (!button || !row) return;
    const pseudo = row.dataset.pseudo || "";
    if (button.dataset.act === "remove") {
      if (!window.confirm(`Retirer ${pseudo} de tes amis ?`)) return;
      try { await apiFriends("/api/friends", "DELETE", { pseudo }); } catch {}
      await load();
    } else if (button.dataset.act === "invite" && !button.disabled) {
      try { sendGroupInvite(pseudo); updateHeader(`Invitation de groupe envoyée à ${pseudo}.`); } catch {}
    } else if (button.dataset.act === "whisper") {
      const chatInput = document.getElementById("chatInput");
      if (chatInput) { chatInput.value = `/w ${pseudo} `; chatInput.focus(); }
      window.GameWindowManager?.restore?.("chatWindow");
    }
  });
  reqList?.addEventListener("click", async event => {
    const button = event.target.closest("button[data-act]"), row = event.target.closest("[data-req]");
    if (!button || !row) return;
    const pseudo = row.dataset.req || "";
    try {
      await apiFriends(button.dataset.act === "accept" ? "/api/friends/accept" : "/api/friends/decline", "POST", { pseudo });
      try { sendFriendResponded(pseudo); } catch {}
    } catch {}
    await load();
  });

  setTab("friends"); load(); setInterval(load, 30000); setInterval(poll, 1000); poll();
  window.addEventListener("orbit:window-restored", event => { if (event?.detail?.id === "friendsWindow") load(); });
}
