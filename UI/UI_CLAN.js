"use strict";

// Fenêtre Clan façon DarkOrbit : création [TAG], liste publique des clans
// avec candidatures (c'est le joueur qui postule), membres, rangs (chef /
// officier / membre), tchat via /c dans le chat.
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
  const allList = document.getElementById("clanAllList");
  const appsList = document.getElementById("clanAppsList");
  const appsBlock = document.getElementById("clanAppsBlock");
  const createPane = document.getElementById("clanCreatePane");
  const managePane = document.getElementById("clanManagePane");
  const descForm = document.getElementById("clanDescForm");
  const descInput = document.getElementById("clanDescInput");
  if (!list || !createPane || !managePane) return;
  let clan = null, clans = [], mine = [];

  function appliedTags() {
    try { return new Set(mine.map((a) => String(a.tag || "").toUpperCase())); } catch { return new Set(); }
  }

  function updateHeader(message = "") {
    if (status) status.textContent = message || (clan ? `[${clan.tag}] ${clan.name} — ${clan.members.length}/30` : "Sans clan — crée le tien ou postule ci-dessous.");
  }

  function render() {
    const inClan = !!clan;
    createPane.classList.toggle("active", !inClan);
    managePane.classList.toggle("active", inClan);
    if (!inClan) {
      list.innerHTML = "";
      if (allList) {
        const applied = appliedTags();
        allList.innerHTML = clans.length ? clans.map((c) => {
          const tag = escapeHtml(c.tag || "?"), name = escapeHtml(c.name || "Clan");
          const leader = escapeHtml(c.leader || "?"), desc = escapeHtml(c.description || "");
          const isApplied = applied.has(String(c.tag || "").toUpperCase());
          const full = Number(c.memberCount) >= 30;
          return `<article class="clanCard clanBrowse" data-clan-tag="${tag}">`
            + `<span class="clanTagBadge">[${tag}]</span>`
            + `<span class="clanIdentity"><strong>${name}</strong><small>Chef : ${leader} · ${Number(c.memberCount) || 0}/30${desc ? ` · ${desc}` : ""}</small></span>`
            + `<span class="clanBtns">${isApplied
              ? `<button type="button" data-act="cancel" title="Retirer ma candidature" aria-label="Retirer ma candidature">Retirer</button>`
              : `<button class="accept" type="button" data-act="apply" title="Postuler" aria-label="Postuler"${full ? " disabled" : ""}>${full ? "Plein" : "Postuler"}</button>`}</span></article>`;
        }).join("") : `<div class="clanEmpty">Aucun clan pour l'instant — crée le tien.</div>`;
      }
      return;
    }
    const myRole = String(clan.role || "member");
    const canManage = myRole === "leader" || myRole === "officer";
    if (descForm) descForm.style.display = myRole === "leader" ? "" : "none";
    if (descInput && document.activeElement !== descInput) descInput.value = String(clan.description || "");
    // Candidatures reçues (chef + officiers).
    if (appsBlock && appsList) {
      const apps = Array.isArray(clan.applications) ? clan.applications : [];
      appsBlock.hidden = !(canManage && apps.length);
      if (canManage && apps.length) {
        appsList.innerHTML = apps.map((a) => {
          const pseudo = escapeHtml(a.pseudo || "Pilote");
          return `<article class="clanCard request" data-pseudo="${pseudo}"><span class="clanIdentity"><strong>${pseudo}</strong><small>Veut rejoindre ton clan</small></span><span class="clanBtns"><button class="accept" type="button" data-act="accept" title="Accepter" aria-label="Accepter">${ICON_ACCEPT}</button><button class="danger" type="button" data-act="decline" title="Refuser" aria-label="Refuser">${ICON_REMOVE}</button></span></article>`;
        }).join("");
      } else appsList.innerHTML = "";
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
      if (!authHeaders()) { clan = null; clans = []; mine = []; updateHeader("Connecte-toi pour gérer ton clan."); render(); return; }
      const [meData, listData, mineData] = await Promise.all([
        apiClan("/api/clans/me", "GET"),
        apiClan("/api/clans/list", "GET").catch(() => ({ clans: [] })),
        apiClan("/api/clans/my-applications", "GET").catch(() => ({ applications: [] })),
      ]);
      clan = meData.clan && typeof meData.clan === "object" ? meData.clan : null;
      clans = Array.isArray(listData.clans) ? listData.clans : [];
      mine = Array.isArray(mineData.applications) ? mineData.applications : [];
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
  allList?.addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-act]"), row = event.target.closest("[data-clan-tag]");
    if (!button || !row || button.disabled) return;
    const tag = row.dataset.clanTag || "";
    try {
      if (button.dataset.act === "apply") {
        await apiClan("/api/clans/apply", "POST", { tag });
        try { sendClanNotify(); } catch {}
        await load(`Candidature envoyée à [${tag}].`);
      } else if (button.dataset.act === "cancel") {
        await apiClan("/api/clans/cancel", "POST", { tag });
        try { sendClanNotify(); } catch {}
        await load(`Candidature à [${tag}] retirée.`);
      }
    } catch (error) { updateHeader(String(error?.message || "Candidature impossible.")); render(); }
  });
  appsList?.addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-act]"), row = event.target.closest("[data-pseudo]");
    if (!button || !row) return;
    const pseudo = row.dataset.pseudo || "";
    try {
      if (button.dataset.act === "accept") {
        await apiClan("/api/clans/accept", "POST", { pseudo });
        try { sendClanNotify(pseudo); } catch {}
        await load(`${pseudo} a rejoint le clan.`);
      } else {
        await apiClan("/api/clans/decline", "POST", { pseudo });
        try { sendClanNotify(pseudo); } catch {}
        await load(`Candidature de ${pseudo} refusée.`);
      }
    } catch (error) { updateHeader(String(error?.message || "Action impossible.")); }
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
