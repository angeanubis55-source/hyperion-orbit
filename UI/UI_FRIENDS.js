"use strict";
import { shouldRefreshWindow } from "../SRC/CORE/BACKGROUND_REFRESH.js";

// Fenêtre Amis compacte (même style que le Wiki / Aide et le Clan) :
// onglet Amis = un seul tableau (demandes reçues en haut, amis, demandes
// envoyées en bas), onglet Bloqués. Confidentialité : en ligne / hors ligne
// uniquement — ni map, ni vaisseau, ni groupe, ni Galaxy Gate.

import {
  getNetFriendsOnline, sendGroupInvite,
  drainNetFriendRequestInbox, consumeFriendsDirty,
  sendFriendPing, sendFriendResponded,
} from "../SRC/CORE/NETPLAY.js";
import { getRankInfo } from "../SRC/CORE/PROGRESSION.js";
import { getFaction } from "../SRC/CORE/FACTIONS.js";
import { formatInteger } from "../SRC/CORE/NUMBER_FORMAT.js";
import { escapeHtml } from "./UI_DOM.js";

let started = false;
let dialogPending = false;
const ICON_MESSAGE = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v11H9l-5 4V5Z"/><path d="M8 9h8M8 12h5"/></svg>`;
const ICON_GROUP = `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3"/><path d="M3.5 18c.5-3 2.3-4.5 5.5-4.5s5 1.5 5.5 4.5M18 7v6M15 10h6"/></svg>`;
const ICON_REMOVE = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17"/></svg>`;
const ICON_ACCEPT = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>`;
const ICON_BLOCK = `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="m6.5 6.5 11 11"/></svg>`;

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

function ago(at) {
  const ms = Date.now() - (Number(at) || 0);
  if (!(Number(at) > 0)) return "—";
  const min = Math.floor(ms / 60000);
  if (min < 2) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.floor(h / 24);
  return d < 60 ? `il y a ${d} j` : `il y a ${Math.floor(d / 30)} mois`;
}

function dateFr(at) {
  try { return Number(at) > 0 ? new Date(Number(at)).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" }) : "—"; } catch { return "—"; }
}

// Confirmation intégrée (même style que le clan), pas de confirm() natif.
async function confirmDialog(title, message, okLabel = "Confirmer") {
  if (dialogPending) return false;
  const win = document.getElementById("friendsWindow");
  if (!win) return false;
  dialogPending = true;
  const overlay = document.createElement("div");
  overlay.className = "tdmSellDialog";
  overlay.dataset.noDrag = "1";
  overlay.innerHTML = `<div class="tdmSellCard" role="dialog"><div class="tdmSellTitle"></div><div class="tdmSellItem"></div>
    <div class="tdmSellActions"><button type="button" data-dlg-cancel>Annuler</button><button type="button" data-dlg-confirm></button></div></div>`;
  overlay.querySelector(".tdmSellTitle").textContent = title;
  overlay.querySelector(".tdmSellItem").textContent = message;
  const ok = overlay.querySelector("[data-dlg-confirm]");
  ok.textContent = okLabel;
  const cancel = overlay.querySelector("[data-dlg-cancel]");
  win.appendChild(overlay);
  cancel.focus();
  return new Promise(resolve => {
    const finish = accepted => { overlay.remove(); dialogPending = false; resolve(accepted); };
    cancel.onclick = () => finish(false);
    ok.onclick = () => finish(true);
    overlay.onclick = event => { if (event.target === overlay) finish(false); };
    overlay.onkeydown = event => { event.stopPropagation(); if (event.key === "Escape") { event.preventDefault(); finish(false); } };
  });
}

// Tableau façon wiki : rows = [{ cells, attrs, cls }].
function table(headers, rows, { cls = "", empty = "Rien à afficher." } = {}) {
  if (!rows.length) return `<div class="clanEmpty">${escapeHtml(empty)}</div>`;
  const head = headers.map((h) => typeof h === "string" ? `<th>${h}</th>` : `<th class="${h.cls || ""}">${h.label}</th>`).join("");
  const body = rows.map((r) => `<tr${r.cls ? ` class="${r.cls}"` : ""}${r.attrs ? ` ${r.attrs}` : ""}>${r.cells.map((c, i) => {
    const h = headers[i];
    return `<td${h && typeof h !== "string" && h.cls ? ` class="${h.cls}"` : ""}>${c ?? ""}</td>`;
  }).join("")}</tr>`).join("");
  return `<div class="wikiTableWrap"><table class="wikiTable clanTable ${cls}"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}
const NUM = (label) => ({ label, cls: "num" });
const ACT = { label: "", cls: "act" };

export function initFriendsUI() {
  if (started) return;
  started = true;
  const $ = (id) => document.getElementById(id);
  const status = $("friendsStatus"), list = $("friendsList"), blockedList = $("friendsBlocked");
  const addInput = $("friendAddInput"), search = $("friendsSearch");
  const nav = document.querySelector("#friendsWindow .friendsTabs");
  if (!list || !nav) return;
  let friends = [], requests = [], sent = [], blocked = [], activeTab = "friends", query = "", lastSignature = "";
  let statusTimer = 0;

  function onlineIds() {
    try { return new Set(getNetFriendsOnline().map(friend => String(friend.id))); } catch { return new Set(); }
  }
  const isOnline = (live, friend) => live.has(String(friend.id)) || live.has(`u_${friend.id}`);

  function flash(message, tone = "ok") {
    if (!status) return;
    clearTimeout(statusTimer);
    status.textContent = message;
    status.dataset.tone = tone;
    status.hidden = !message;
    if (message) statusTimer = setTimeout(() => { status.hidden = true; }, 6000);
  }
  const fail = (error, fallback) => flash(String(error?.message || fallback), "error");

  function renderTop() {
    const badge = $("friendsRequestBadge");
    if (badge) badge.textContent = requests.length ? String(requests.length) : "";
    if (search) search.hidden = friends.length < 10;
  }

  function setTab(tab) {
    activeTab = tab === "blocked" ? "blocked" : "friends";
    for (const button of nav.querySelectorAll("[data-friends-tab]")) button.classList.toggle("active", button.dataset.friendsTab === activeTab);
    for (const pane of document.querySelectorAll("#friendsWindow [data-friends-pane]")) pane.classList.toggle("active", pane.dataset.friendsPane === activeTab);
  }

  const firmOf = (id) => { try { return id ? getFaction(id)?.shortName || "—" : "—"; } catch { return "—"; } };

  // Un seul tableau : demandes reçues, amis (en ligne d'abord), demandes envoyées.
  function renderFriends() {
    const live = onlineIds();
    const pseudoCell = (p) => `<b>${escapeHtml(p || "Pilote")}</b>`;
    const rows = [];
    for (const r of requests) {
      rows.push({
        cls: "friendsReq", attrs: `data-pseudo="${escapeHtml(r.pseudo || "Pilote")}"`,
        cells: [pseudoCell(r.pseudo), `<b class="wikiGold">Demande reçue</b>`, `<span class="wikiMuted">${escapeHtml(ago(r.at))}</span>`, escapeHtml(firmOf(r.faction)),
          `<span class="clanBtns"><button class="clanPrimary" type="button" data-act="accept" title="Accepter">${ICON_ACCEPT}</button>`
            + `<button class="danger" type="button" data-act="decline" title="Refuser">${ICON_REMOVE}</button>`
            + `<button class="danger" type="button" data-act="block" title="Refuser et bloquer">${ICON_BLOCK}</button></span>`],
      });
    }
    friends
      .filter((f) => !query || String(f.pseudo || "").toLowerCase().includes(query))
      .sort((a, b) => Number(isOnline(live, b)) - Number(isOnline(live, a)) || String(a.pseudo || "").localeCompare(String(b.pseudo || ""), "fr"))
      .forEach((friend) => {
        const online = isOnline(live, friend);
        rows.push({
          cls: online ? "isOnline" : "", attrs: `data-pseudo="${escapeHtml(friend.pseudo || "Pilote")}"`,
          cells: [
            pseudoCell(friend.pseudo),
            online ? `<b class="clanOnline">En ligne</b>` : `<span class="wikiMuted">Hors ligne</span>`,
            `<span title="${escapeHtml(ago(friend.since))}">${escapeHtml(dateFr(friend.since))}</span>`,
            escapeHtml(firmOf(friend.faction)),
            `<span class="clanBtns"><button type="button" data-act="whisper" title="Message privé" aria-label="Message privé">${ICON_MESSAGE}</button>`
              + `<button type="button" data-act="invite" title="${online ? "Inviter dans le groupe" : "Hors ligne"}" aria-label="Inviter dans le groupe"${online ? "" : " disabled"}>${ICON_GROUP}</button>`
              + `<button class="danger" type="button" data-act="block" title="Bloquer" aria-label="Bloquer">${ICON_BLOCK}</button>`
              + `<button class="danger" type="button" data-act="remove" title="Retirer des amis" aria-label="Retirer des amis">${ICON_REMOVE}</button></span>`,
          ],
        });
      });
    for (const r of sent) {
      rows.push({
        cls: "friendsSent", attrs: `data-pseudo="${escapeHtml(r.pseudo || "Pilote")}"`,
        cells: [pseudoCell(r.pseudo), `<span class="wikiGold">Demande envoyée</span>`, `<span class="wikiMuted">${escapeHtml(ago(r.at))}</span>`, escapeHtml(firmOf(r.faction)),
          `<span class="clanBtns"><button type="button" data-act="cancel" title="Annuler la demande">Annuler</button></span>`],
      });
    }
    list.innerHTML = table(["Pilote", "Statut", "Ami depuis", "Firme", ACT], rows,
      { cls: "friendsTable", empty: query ? "Aucun ami ne correspond à la recherche." : "Aucun ami pour l'instant — ajoute un pilote par son pseudo." });
  }

  function renderBlocked() {
    if (!blockedList) return;
    blockedList.innerHTML = table(["Pilote", "Bloqué le", ACT], blocked.map((r) => ({
      attrs: `data-pseudo="${escapeHtml(r.pseudo || "Pilote")}"`,
      cells: [
        `<b>${escapeHtml(r.pseudo || "Pilote")}</b>`,
        `<span class="wikiMuted">${escapeHtml(dateFr(r.at))}</span>`,
        `<span class="clanBtns"><button type="button" data-act="unblock" title="Débloquer">Débloquer</button></span>`,
      ],
    })), { empty: "Aucun pilote bloqué." });
  }

  function render() {
    if (!shouldRefreshWindow("friendsWindow")) return;
    renderTop(); renderFriends(); renderBlocked();
  }

  let loading = false;
  async function load(message = "") {
    if (!shouldRefreshWindow("friendsWindow") || loading) return;
    loading = true;
    try {
      if (!authHeaders()) { friends = []; requests = []; sent = []; blocked = []; flash("Connecte-toi pour gérer tes amis.", "error"); render(); return; }
      const [friendData, requestData, sentData, blockData] = await Promise.all([
        apiFriends("/api/friends", "GET"), apiFriends("/api/friends/requests", "GET"),
        apiFriends("/api/friends/sent", "GET").catch(() => ({ sent })),
        apiFriends("/api/friends/blocks", "GET").catch(() => ({ blocked })),
      ]);
      friends = Array.isArray(friendData.friends) ? friendData.friends : [];
      requests = Array.isArray(requestData.requests) ? requestData.requests : [];
      sent = Array.isArray(sentData.sent) ? sentData.sent : [];
      blocked = Array.isArray(blockData.blocked) ? blockData.blocked : [];
      if (message) flash(message);
    } catch { flash("Hors ligne — serveur injoignable", "error"); }
    finally { loading = false; }
    render();
  }

  function poll() {
    if (!shouldRefreshWindow("friendsWindow")) return;
    try {
      if (drainNetFriendRequestInbox().length || consumeFriendsDirty()) { load(); return; }
      const signature = JSON.stringify(getNetFriendsOnline());
      if (signature !== lastSignature) { lastSignature = signature; renderTop(); renderFriends(); }
    } catch {}
  }

  async function block(pseudo) {
    if (!pseudo) return;
    if (!await confirmDialog("Bloquer un pilote", `Bloquer ${pseudo} ? Il ne pourra plus t'envoyer de demande d'ami, de message privé ni d'invitation de groupe, et sera retiré de tes amis.`, "Bloquer")) return;
    try {
      const data = await apiFriends("/api/friends/blocks", "POST", { pseudo });
      try { if (data.wasFriend) sendFriendResponded(data.pseudo || pseudo); } catch {}
      await load(`${data.pseudo || pseudo} est bloqué.`);
    } catch (error) { fail(error, "Blocage impossible."); }
  }

  nav.addEventListener("click", event => { const button = event.target.closest("[data-friends-tab]"); if (button) setTab(button.dataset.friendsTab); });
  search?.addEventListener("input", () => { query = String(search.value || "").trim().toLowerCase(); renderFriends(); });
  $("friendAddForm")?.addEventListener("submit", async event => {
    event.preventDefault(); event.stopPropagation();
    const value = addInput?.value.trim();
    if (!value) return;
    try {
      const data = await apiFriends("/api/friends", "POST", { pseudo: value });
      if (!data.mutual) try { sendFriendPing(data.to?.pseudo || value); } catch {}
      if (addInput) addInput.value = "";
      await load(data.mutual ? `${data.to?.pseudo || value} est maintenant ton ami.` : `Demande envoyée à ${data.to?.pseudo || value}.`);
    } catch (error) { fail(error, "Demande impossible."); }
  });
  $("friendBlockForm")?.addEventListener("submit", async event => {
    event.preventDefault(); event.stopPropagation();
    const input = $("friendBlockInput");
    const value = input?.value.trim();
    if (!value) return;
    await block(value);
    if (input && blocked.some((b) => b.pseudo.toLowerCase() === value.toLowerCase())) input.value = "";
  });
  document.querySelector("#friendsWindow .clanPages")?.addEventListener("click", async event => {
    const button = event.target.closest("button[data-act]"), row = event.target.closest("[data-pseudo]");
    if (!button || !row || button.disabled) return;
    const pseudo = row.dataset.pseudo || "";
    const act = button.dataset.act;
    try {
      if (act === "remove") {
        if (!await confirmDialog("Retirer un ami", `Retirer ${pseudo} de tes amis ?`, "Retirer")) return;
        await apiFriends("/api/friends", "DELETE", { pseudo });
        await load(`${pseudo} a été retiré de tes amis.`);
      } else if (act === "invite") {
        sendGroupInvite(pseudo);
        flash(`Invitation de groupe envoyée à ${pseudo}.`);
      } else if (act === "whisper") {
        const chatInput = $("chatInput");
        if (chatInput) { chatInput.value = `/w ${pseudo} `; chatInput.focus(); }
        window.GameWindowManager?.restore?.("chatWindow");
      } else if (act === "block") {
        await block(pseudo);
      } else if (act === "accept" || act === "decline") {
        await apiFriends(act === "accept" ? "/api/friends/accept" : "/api/friends/decline", "POST", { pseudo });
        try { sendFriendResponded(pseudo); } catch {}
        await load(act === "accept" ? `${pseudo} est maintenant ton ami.` : `Demande de ${pseudo} refusée.`);
      } else if (act === "cancel") {
        await apiFriends("/api/friends/cancel", "POST", { pseudo });
        await load(`Demande à ${pseudo} annulée.`);
      } else if (act === "unblock") {
        await apiFriends("/api/friends/blocks", "DELETE", { pseudo });
        await load(`${pseudo} est débloqué.`);
      }
    } catch (error) { fail(error, "Action impossible."); }
  });

  setTab("friends"); load(); setInterval(load, 30000); setInterval(poll, 1000); poll();
  window.addEventListener("orbit:window-restoring", event => { if (event?.detail?.id === "friendsWindow") load(); });
}
