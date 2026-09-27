"use strict";

// Fenêtre Clan façon DarkOrbit : création [TAG], membres, rangs (chef /
// officier / membre), invitations persistantes, tchat via /c dans le chat.
// Roster via HTTP (/api/clans/*) ; le WS ne transporte que le tchat et les
// notifications de changement (comme les Amis).

import {
  consumeClanDirty, sendClanNotify, sendGroupInvite,
} from "../SRC/CORE/NETPLAY.js";
import { escapeHtml } from "./UI_DOM.js";

let started = false;
const ICON_MESSAGE = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v11H9l-5 4V5Z"/><path d="M8 9h8M8 12h5"/></svg>`;
const ICON_GROUP = `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3"/><path d="M3.5 18c.5-3 2.3-4.5 5.5-4.5s5 1.5 5.5 4.5M18 7v6M15 10h6"/></svg>`;
const ICON_REMOVE = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17"/></svg>`;
const ICON_ACCEPT = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>`;
const CROWN_SVG = `<svg class="clanLeaderCrown" viewBox="0 0 24 24" aria-hidden="true"><path d="m3 7 4.5 4L12 4l4.5 7L21 7l-2 11H5L3 7Z"/><path d="M5 18h14"/></svg>`;

function authHeaders() {
  try {
    const token = String(localStorage.getItem("orbit_token") || "");
    return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : null;
  } catch { return null; }
}

async function apiClan(path, method, body) {
  const headers = authHeaders();
  if (!headers) throw new Error("Connecte-toi pour gérer ton clan.");
  const response = await fetch(path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.ok) throw new Error(data?.error || "Erreur serveur.");
  return data;
}

const ROLE_LABEL = { leader: "Chef", officer: "Officier", member: "Membre" };

export function initClanUI() {
  if (started) return;
  started = true;
  const status = document.getElementById("clanStatus");
  const list = document.getElementById("clanList");
  const reqList = document.getElementById("clanRequests");
  const badge = document.getElementById("clanRequestBadge");
  const createPane = document.getElementById("clanCreatePane");
  const managePane = document.getElementById("clanManagePane");
  const descForm = document.getElementById("clanDescForm");
  const descInput = document.getElementById("clanDescInput");
  const outgoing = document.getElementById("clanOutgoing");
  if (!list || !createPane || !managePane) return;
  let clan = null, invites = [];

  function updateHeader(message = "") {
    if (status) status.textContent = message || (clan ? `[${clan.tag}] ${clan.name} — ${clan.members.length}/30` : "Sans clan — crée le tien ou accepte une invitation.");
    if (badge) { badge.textContent = String(invites.length); badge.hidden = invites.length === 0; }
  }

  function render() {
    const inClan = !!clan;
    createPane.classList.toggle("active", !inClan);
    managePane.classList.toggle("active", inClan);
    if (reqList) {
      reqList.innerHTML = invites.length ? invites.map((inv) => {
        const tag = escapeHtml(inv.tag || "?"), name = escapeHtml(inv.name || "Clan"), from = escapeHtml(inv.fromPseudo || "Pilote");
        return `<article class="clanCard request" data-clan-tag="${tag}"><span class="clanTagBadge">[${tag}]</span><span class="clanIdentity"><strong>${name}</strong><small>Invité par ${from}</small></span><span class="clanBtns"><button class="accept" type="button" data-act="accept" title="Rejoindre" aria-label="Rejoindre">${ICON_ACCEPT}</button><button class="danger" type="button" data-act="decline" title="Refuser" aria-label="Refuser">${ICON_REMOVE}</button></span></article>`;
      }).join("") : `<div class="clanEmpty">Aucune invitation.</div>`;
    }
    if (!inClan) {
      list.innerHTML = "";
      if (outgoing) outgoing.hidden = true;
      return;
    }
    const myRole = String(clan.role || "member");
    const canManage = myRole === "leader" || myRole === "officer";
    if (descForm) descForm.style.display = myRole === "leader" ? "" : "none";
    if (descInput && document.activeElement !== descInput) descInput.value = String(clan.description || "");
    if (outgoing) {
      const sent = Array.isArray(clan.invites) ? clan.invites : [];
      outgoing.hidden = !(canManage && sent.length);
      if (canManage && sent.length) outgoing.textContent = `Invitations envoyées : ${sent.map((i) => i.pseudo).join(", ")}`;
    }
    list.innerHTML = clan.members.map((member) => {
      const pseudo = escapeHtml(member.pseudo || "Pilote");
      const role = String(member.role || "member");
      const isMe = clan.leader === member.id || false;
      const kickable = canManage && member.pseudo && !isMe
        && (myRole === "leader" ? role !== "leader" : role === "member");
      const rankable = myRole === "leader" && !isMe && role !== "leader";
      return `<article class="clanCard" data-pseudo="${pseudo}" data-role="${escapeHtml(role)}">`
        + `<span class="clanIdentity"><strong>${pseudo}${role === "leader" ? CROWN_SVG : ""}</strong><small>${escapeHtml(ROLE_LABEL[role] || role)}</small></span>`
        + `<span class="clanBtns"><button type="button" data-act="whisper" title="Message privé" aria-label="Message privé">${ICON_MESSAGE}</button>`
        + `<button type="button" data-act="invite" title="Inviter dans le groupe" aria-label="Inviter dans le groupe">${ICON_GROUP}</button>`
        + (rankable ? `<button type="button" data-act="rank" title="${role === "officer" ? "Rétrograder membre" : "Promouvoir officier"}" aria-label="Changer le rang">${role === "officer" ? "−" : "+"}</button>` : "")
        + (kickable ? `<button class="danger" type="button" data-act="kick" title="Exclure du clan" aria-label="Exclure du clan">${ICON_REMOVE}</button>` : "")
        + `</span></article>`;
    }).join("");
  }

  async function load(message = "") {
    try {
      if (!authHeaders()) { clan = null; invites = []; updateHeader("Connecte-toi pour gérer ton clan."); render(); return; }
      const [meData, invData] = await Promise.all([
        apiClan("/api/clans/me", "GET"),
        apiClan("/api/clans/invites", "GET").catch(() => ({ invites: [] })),
      ]);
      clan = meData.clan && typeof meData.clan === "object" ? meData.clan : null;
      invites = Array.isArray(invData.invites) ? invData.invites : [];
      updateHeader(message);
    } catch { updateHeader("Hors ligne — serveur injoignable"); }
    render();
  }

  function poll() {
    try {
      if (consumeClanDirty()) { load(); return; }
    } catch {}
  }

  document.getElementById("clanCreateForm")?.addEventListener("submit", async (event) => {
    event.preventDefault(); event.stopPropagation();
    const name = document.getElementById("clanNameInput")?.value.trim() || "";
    const tag = document.getElementById("clanTagInput")?.value.trim() || "";
    if (!name || !tag) return;
    try {
      const data = await apiClan("/api/clans", "POST", { name, tag });
      clan = data.clan || null;
      try { sendClanNotify(); } catch {}
      await load(clan ? `Clan [${clan.tag}] ${clan.name} créé. Parle avec /c message.` : "");
    } catch (error) { updateHeader(String(error?.message || "Création impossible.")); }
  });
  document.getElementById("clanInviteForm")?.addEventListener("submit", async (event) => {
    event.preventDefault(); event.stopPropagation();
    const input = document.getElementById("clanInviteInput");
    const value = input?.value.trim();
    if (!value) return;
    try {
      const data = await apiClan("/api/clans/invite", "POST", { pseudo: value });
      try { sendClanNotify(data.to?.pseudo || value); } catch {}
      if (input) input.value = "";
      await load(`Invitation envoyée à ${data.to?.pseudo || value}.`);
    } catch (error) { updateHeader(String(error?.message || "Invitation impossible.")); }
  });
  document.getElementById("clanDescForm")?.addEventListener("submit", async (event) => {
    event.preventDefault(); event.stopPropagation();
    try {
      await apiClan("/api/clans/description", "POST", { description: descInput?.value || "" });
      try { sendClanNotify(); } catch {}
      await load("Description mise à jour.");
    } catch (error) { updateHeader(String(error?.message || "Description impossible.")); }
  });
  document.getElementById("clanLeaveBtn")?.addEventListener("click", async () => {
    if (!clan || !window.confirm(`Quitter le clan [${clan.tag}] ${clan.name} ?`)) return;
    try { sendClanNotify(); } catch {}
    try { await apiClan("/api/clans/leave", "POST", {}); } catch {}
    clan = null;
    try { const { sendClanRefresh } = await import("../SRC/CORE/NETPLAY.js"); sendClanRefresh(); } catch {}
    await load();
  });
  reqList?.addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-act]"), row = event.target.closest("[data-clan-tag]");
    if (!button || !row) return;
    const tag = row.dataset.clanTag || "";
    try {
      if (button.dataset.act === "accept") {
        const data = await apiClan("/api/clans/accept", "POST", { tag });
        clan = data.clan || null;
      } else {
        await apiClan("/api/clans/decline", "POST", { tag });
      }
      try { sendClanNotify(); } catch {}
      try { const { sendClanRefresh } = await import("../SRC/CORE/NETPLAY.js"); sendClanRefresh(); } catch {}
    } catch {}
    await load();
  });
  list.addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-act]"), row = event.target.closest("[data-pseudo]");
    if (!button || !row) return;
    const pseudo = row.dataset.pseudo || "";
    if (button.dataset.act === "whisper") {
      const chatInput = document.getElementById("chatInput");
      if (chatInput) { chatInput.value = `/w ${pseudo} `; chatInput.focus(); }
      window.GameWindowManager?.restore?.("chatWindow");
    } else if (button.dataset.act === "invite") {
      try { sendGroupInvite(pseudo); updateHeader(`Invitation de groupe envoyée à ${pseudo}.`); } catch {}
    } else if (button.dataset.act === "kick") {
      if (!window.confirm(`Exclure ${pseudo} du clan ?`)) return;
      try { await apiClan("/api/clans/kick", "POST", { pseudo }); } catch {}
      try { sendClanNotify(pseudo); } catch {}
      await load();
    } else if (button.dataset.act === "rank") {
      const toOfficer = String(row.dataset.role || "member") !== "officer";
      try { await apiClan("/api/clans/rank", "POST", { pseudo, officer: toOfficer }); } catch {}
      try { sendClanNotify(pseudo); } catch {}
      await load();
    }
  });

  load(); setInterval(load, 30000); setInterval(poll, 1000); poll();
  window.addEventListener("orbit:window-restored", (event) => { if (event?.detail?.id === "clanWindow") load(); });
}
