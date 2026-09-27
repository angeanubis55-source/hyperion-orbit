"use strict";

// Vrai panneau de clan façon DarkOrbit : onglets Infos / Membres /
// Rangs / Diplomatie (+ liste publique + création quand on est sans clan).
// - Infos : tag, nom, chef, effectif, recrutement Ouvert/Fermé, description,
//   journal de clan, transfert de chefferie, dissolution.
// - Membres : liste, attribution de rangs, exclusion, candidatures à traiter.
// - Rangs : création/renommage/suppression + droits (candidatures, kick,
//   diplomatie, édition).
// - Diplomatie : alliance / NAP / guerre (100 jours max, score), demandes.
// Roster via HTTP (/api/clans/*) ; le WS transporte le tchat, les notifs et
// les annonces diplomatie (comme les Amis).

import {
  consumeClanDirty, sendClanNotify, sendDiploNotify, setNetDiplo, sendGroupInvite,
} from "../SRC/CORE/NETPLAY.js";
import { escapeHtml } from "./UI_DOM.js";

let started = false;
const ICON_MESSAGE = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v11H9l-5 4V5Z"/><path d="M8 9h8M8 12h5"/></svg>`;
const ICON_GROUP = `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3"/><path d="M3.5 18c.5-3 2.3-4.5 5.5-4.5s5 1.5 5.5 4.5M18 7v6M15 10h6"/></svg>`;
const ICON_REMOVE = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17"/></svg>`;
const ICON_ACCEPT = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>`;
const CROWN_SVG = `<svg class="clanLeaderCrown" viewBox="0 0 24 24" aria-hidden="true"><path d="m3 7 4.5 4L12 4l4.5 7L21 7l-2 11H5L3 7Z"/><path d="M5 18h14"/></svg>`;

const RIGHT_LABELS = [["apps", "Candidatures"], ["kick", "Exclusion"], ["diplo", "Diplomatie"], ["edit", "Édition"]];
const DIPLO_LABEL = { alliance: "Alliance", nap: "NAP", war: "Guerre" };

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

function rankNameOf(clan, member) {
  return String(member?.role || "Membre");
}

export function initClanUI() {
  if (started) return;
  started = true;
  const status = document.getElementById("clanStatus");
  const createPane = document.getElementById("clanCreatePane");
  const managePane = document.getElementById("clanManagePane");
  const allList = document.getElementById("clanAllList");
  const infoBox = document.getElementById("clanInfoBox");
  const list = document.getElementById("clanList");
  const appsBlock = document.getElementById("clanAppsBlock");
  const appsList = document.getElementById("clanAppsList");
  const ranksList = document.getElementById("clanRanksList");
  const diploActive = document.getElementById("clanDiploActive");
  const diploIncoming = document.getElementById("clanDiploIncoming");
  const diploBlock = document.getElementById("clanDiploBlock");
  if (!createPane || !managePane) return;
  let clan = null, clans = [], mine = [], rels = { active: [], incoming: [], outgoing: [] };
  let activeTab = "infos";

  function appliedTags() {
    try { return new Set(mine.map((a) => String(a.tag || "").toUpperCase())); } catch { return new Set(); }
  }

  function myRights() {
    const role = String(clan?.role || "member");
    if (role === "leader") return { isLeader: true, apps: true, kick: true, diplo: true, edit: true };
    const ranks = Array.isArray(clan?.ranks) ? clan.ranks : [];
    const rank = ranks.find((x) => String(x.name).toLowerCase() === role.toLowerCase());
    const bits = rank ? Number(rank.rights) : (role === "officer" ? 3 : 0);
    return {
      isLeader: false,
      apps: (bits & 1) !== 0, kick: (bits & 2) !== 0, diplo: (bits & 4) !== 0, edit: (bits & 8) !== 0,
    };
  }

  function isLeader() {
    try { return String(clan?.role || "") === "leader"; } catch { return false; }
  }

  function updateHeader(message = "") {
    if (status) status.textContent = message || (clan ? `[${clan.tag}] ${clan.name} — ${clan.members.length}/30` : "Sans clan — crée le tien ou postule ci-dessous.");
  }

  function setTab(tab) {
    activeTab = tab;
    for (const button of document.querySelectorAll("#clanWindow [data-clan-tab]")) button.classList.toggle("active", button.dataset.clanTab === tab);
    for (const pane of document.querySelectorAll("#clanWindow [data-clan-pane]")) pane.classList.toggle("active", pane.dataset.clanPane === tab);
  }

  function render() {
    const inClan = !!clan;
    createPane.classList.toggle("active", !inClan);
    managePane.classList.toggle("active", inClan);
    if (!inClan) {
      if (allList) {
        const applied = appliedTags();
        allList.innerHTML = clans.length ? clans.map((c) => {
          const tag = escapeHtml(c.tag || "?"), name = escapeHtml(c.name || "Clan");
          const leader = escapeHtml(c.leader || "?"), desc = escapeHtml(c.description || "");
          const isApplied = applied.has(String(c.tag || "").toUpperCase());
          const full = Number(c.memberCount) >= 30;
          const closed = c.open === false;
          return `<article class="clanCard clanBrowse" data-clan-tag="${tag}">`
            + `<span class="clanTagBadge">[${tag}]</span>`
            + `<span class="clanIdentity"><strong>${name}</strong><small>Chef : ${leader} · ${Number(c.memberCount) || 0}/30 · ${closed ? "Fermé" : "Ouvert"}${desc ? ` · ${desc}` : ""}</small></span>`
            + `<span class="clanBtns">${isApplied
              ? `<button type="button" data-act="cancel" title="Retirer ma candidature" aria-label="Retirer ma candidature">Retirer</button>`
              : `<button class="accept" type="button" data-act="apply" title="Postuler" aria-label="Postuler"${(full || closed) ? " disabled" : ""}>${full ? "Plein" : (closed ? "Fermé" : "Postuler")}</button>`}</span></article>`;
        }).join("") : `<div class="clanEmpty">Aucun clan pour l'instant — crée le tien (300 000 crédits).</div>`;
      }
      return;
    }
    const rights = myRights(), leader = isLeader();
    const descForm = document.getElementById("clanDescForm");
    if (descForm) descForm.style.display = rights.edit ? "" : "none";
    const rankForm = document.getElementById("clanRankCreateForm");
    if (rankForm) rankForm.style.display = leader ? "" : "none";
    // --- Infos ---
    if (infoBox) {
      const chief = clan.members.find((m) => String(m.role) === "leader");
      infoBox.innerHTML = `<div class="clanInfoGrid">`
        + `<div><span>Tag</span><strong>[${escapeHtml(clan.tag)}]</strong></div>`
        + `<div><span>Nom</span><strong>${escapeHtml(clan.name)}</strong></div>`
        + `<div><span>Chef</span><strong>${escapeHtml(chief?.pseudo || "?")}</strong></div>`
        + `<div><span>Membres</span><strong>${clan.members.length}/30</strong></div>`
        + `<div><span>Recrutement</span><strong class="${clan.open === false ? "closed" : "open"}">${clan.open === false ? "Fermé" : "Ouvert"}</strong></div>`
        + `</div>`
        + (clan.description ? `<p class="clanDesc">${escapeHtml(clan.description)}</p>` : "")
        + (rights.edit ? `<div class="clanInfoActions"><button type="button" data-act="toggle-open">${clan.open === false ? "Ouvrir le recrutement" : "Fermer le recrutement"}</button></div>` : "")
        + `<div class="clanSubHead">Journal du clan</div>`
        + `<div class="clanLog">${(Array.isArray(clan.log) && clan.log.length ? clan.log.map((e) => `<div class="clanLogRow">${escapeHtml(e.text)}</div>`).join("") : `<div class="clanEmpty">Aucun événement.</div>`)}</div>`
        + (leader ? `<div class="clanDangerZone"><button type="button" data-act="transfer-open">Transférer la chefferie…</button><button type="button" data-act="dissolve" class="danger">Dissoudre le clan</button></div>
        <form id="clanTransferForm" class="clanForm" autocomplete="off" hidden><input id="clanTransferInput" type="text" placeholder="Pseudo du successeur…" maxlength="20" autocomplete="off" /><button type="submit">Transférer</button></form>` : "");
    }
    // --- Membres + candidatures ---
    if (appsBlock && appsList) {
      const apps = Array.isArray(clan.applications) ? clan.applications : [];
      appsBlock.hidden = !(rights.apps && apps.length);
      appsList.innerHTML = (rights.apps && apps.length) ? apps.map((a) => {
        const pseudo = escapeHtml(a.pseudo || "Pilote");
        return `<article class="clanCard request" data-pseudo="${pseudo}"><span class="clanIdentity"><strong>${pseudo}</strong><small>Veut rejoindre ton clan</small></span><span class="clanBtns"><button class="accept" type="button" data-act="accept" title="Accepter" aria-label="Accepter">${ICON_ACCEPT}</button><button class="danger" type="button" data-act="decline" title="Refuser" aria-label="Refuser">${ICON_REMOVE}</button></span></article>`;
      }).join("") : "";
    }
    if (list) {
      const rankNames = (Array.isArray(clan.ranks) ? clan.ranks : []).map((x) => x.name).filter((n) => n && n.toLowerCase() !== "chef" && n.toLowerCase() !== "leader");
      list.innerHTML = clan.members.map((member) => {
        const pseudo = escapeHtml(member.pseudo || "Pilote");
        const role = rankNameOf(clan, member);
        const targetIsLeader = String(member.role) === "leader";
        const kickable = rights.kick && !targetIsLeader && (rights.isLeader || String(member.role) === "member" || String(member.role).toLowerCase() === "membre");
        return `<article class="clanCard" data-pseudo="${pseudo}" data-role="${escapeHtml(role)}">`
          + `<span class="clanIdentity"><strong>${pseudo}${targetIsLeader ? CROWN_SVG : ""}</strong><small>${escapeHtml(role)}</small></span>`
          + `<span class="clanBtns"><button type="button" data-act="whisper" title="Message privé" aria-label="Message privé">${ICON_MESSAGE}</button>`
          + `<button type="button" data-act="invite" title="Inviter dans le groupe" aria-label="Inviter dans le groupe">${ICON_GROUP}</button>`
          + (leader && !targetIsLeader && rankNames.length ? `<select data-assign="${pseudo}" title="Rang" aria-label="Rang">${rankNames.map((n) => `<option value="${escapeHtml(n)}"${String(n).toLowerCase() === String(role).toLowerCase() ? " selected" : ""}>${escapeHtml(n)}</option>`).join("")}</select>` : "")
          + (kickable ? `<button class="danger" type="button" data-act="kick" title="Exclure du clan" aria-label="Exclure du clan">${ICON_REMOVE}</button>` : "")
          + `</span></article>`;
      }).join("");
    }
    // --- Rangs ---
    if (ranksList) {
      const ranks = Array.isArray(clan.ranks) ? clan.ranks : [];
      ranksList.innerHTML = ranks.map((rk) => {
        const bits = Number(rk.rights) || 0;
        const locked = rk.builtin === "leader" || !leader;
        return `<article class="clanCard clanRank" data-rank="${escapeHtml(rk.name)}">`
          + `<span class="clanIdentity"><strong>${escapeHtml(rk.name)}${rk.builtin === "leader" ? CROWN_SVG : ""}</strong><small>${rk.builtin ? "Rang de base" : "Rang personnalisé"}</small></span>`
          + `<span class="clanRankChecks">${RIGHT_LABELS.map(([key, label]) => {
            const bit = key === "apps" ? 1 : key === "kick" ? 2 : key === "diplo" ? 4 : 8;
            return `<label title="${label}"><input type="checkbox" data-right="${bit}"${(bits & bit) ? " checked" : ""}${locked || (rk.builtin !== "" && rk.builtin !== "officer" && rk.builtin !== "member") ? " disabled" : ""} />${label}</label>`;
          }).join("")}</span>`
          + (leader && !rk.builtin ? `<span class="clanBtns"><button type="button" data-act="rank-del" title="Supprimer" aria-label="Supprimer">${ICON_REMOVE}</button></span>` : "")
          + `</article>`;
      }).join("");
    }
    // --- Diplomatie ---
    renderDiplo(rights);
  }

  function diploRow(rel, incoming) {
    const label = DIPLO_LABEL[rel.kind] || rel.kind;
    const score = rel.kind === "war" ? ` · <b>${Number(rel.killsMine) || 0} – ${Number(rel.killsTheirs) || 0}</b>` : "";
    const days = rel.kind === "war" && rel.daysLeft != null ? ` · ${rel.daysLeft} j restants` : "";
    const status = rel.status === "pending" ? (incoming ? " · demande reçue" : rel.kind === "war" ? " · fin proposée" : " · en attente") : "";
    return `<article class="clanCard clanDiplo" data-rel="${escapeHtml(rel.id)}">`
      + `<span class="clanTagBadge diplo-${escapeHtml(rel.kind)}">[${escapeHtml(rel.otherTag)}]</span>`
      + `<span class="clanIdentity"><strong>${escapeHtml(rel.otherName)} — ${label}</strong><small>${Number(rel.otherMembers) || 0} membres${score}${days}${status}</small></span>`
      + `<span class="clanBtns">${incoming
        ? `<button class="accept" type="button" data-act="diplo-accept" title="Accepter" aria-label="Accepter">${ICON_ACCEPT}</button><button class="danger" type="button" data-act="diplo-decline" title="Refuser" aria-label="Refuser">${ICON_REMOVE}</button>`
        : `<button class="danger" type="button" data-act="diplo-end" title="${rel.kind === "war" ? "Proposer la fin de guerre" : "Rompre"}" aria-label="Rompre">${ICON_REMOVE}</button>`}</span></article>`;
  }

  function renderDiplo(rights) {
    if (!diploActive || !diploIncoming) return;
    diploActive.innerHTML = rels.active.length ? rels.active.map((rel) => diploRow(rel, false)).join("") : `<div class="clanEmpty">Aucune relation.</div>`;
    const pending = [...rels.incoming, ...rels.outgoing];
    if (diploBlock) diploBlock.hidden = !pending.length;
    diploIncoming.innerHTML = pending.map((rel) => {
      const incoming = rels.incoming.some((x) => x.id === rel.id);
      if (!incoming) {
        return `<article class="clanCard clanDiplo" data-rel="${escapeHtml(rel.id)}"><span class="clanTagBadge diplo-${escapeHtml(rel.kind)}">[${escapeHtml(rel.otherTag)}]</span><span class="clanIdentity"><strong>${escapeHtml(rel.otherName)} — ${DIPLO_LABEL[rel.kind] || rel.kind}</strong><small>Proposition envoyée · en attente</small></span><span class="clanBtns"><button class="danger" type="button" data-act="diplo-end" title="Retirer" aria-label="Retirer">${ICON_REMOVE}</button></span></article>`;
      }
      return diploRow(rel, true);
    }).join("");
    const form = document.getElementById("clanDiploForm");
    if (form) form.style.display = rights.diplo ? "" : "none";
  }

  async function load(message = "") {
    try {
      if (!authHeaders()) { clan = null; clans = []; mine = []; rels = { active: [], incoming: [], outgoing: [] }; updateHeader("Connecte-toi pour gérer ton clan."); render(); return; }
      const [meData, listData, mineData] = await Promise.all([
        apiClan("/api/clans/me", "GET"),
        apiClan("/api/clans/list", "GET").catch(() => ({ clans: [] })),
        apiClan("/api/clans/my-applications", "GET").catch(() => ({ applications: [] })),
      ]);
      clan = meData.clan && typeof meData.clan === "object" ? meData.clan : null;
      clans = Array.isArray(listData.clans) ? listData.clans : [];
      mine = Array.isArray(mineData.applications) ? mineData.applications : [];
      rels = { active: [], incoming: [], outgoing: [] };
      if (clan) {
        try {
          const relData = await apiClan("/api/clans/relations", "GET");
          rels = { active: relData.active || [], incoming: relData.incoming || [], outgoing: relData.outgoing || [] };
          try {
            setNetDiplo(
              rels.active.filter((x) => x.kind === "alliance").map((x) => x.otherTag),
              rels.active.filter((x) => x.kind === "nap").map((x) => x.otherTag),
              rels.active.filter((x) => x.kind === "war").map((x) => x.otherTag),
            );
          } catch {}
        } catch {}
      } else {
        try { setNetDiplo([], [], []); } catch {}
      }
      updateHeader(message);
    } catch { updateHeader("Hors ligne — serveur injoignable"); }
    render();
  }

  function poll() {
    try {
      if (consumeClanDirty()) { load(); return; }
    } catch {}
  }

  document.querySelector("#clanWindow .clanTabs")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-clan-tab]");
    if (button) setTab(button.dataset.clanTab);
  });
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
        await load(`Candidature envoyée à [${tag}] (1 500 crédits à l'acceptation).`);
      } else if (button.dataset.act === "cancel") {
        await apiClan("/api/clans/cancel", "POST", { tag });
        try { sendClanNotify(); } catch {}
        await load(`Candidature à [${tag}] retirée.`);
      }
    } catch (error) { updateHeader(String(error?.message || "Candidature impossible.")); render(); }
  });
  // Délégation globale du panneau (infos / membres / rangs / diplo).
  managePane?.addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-act]");
    const select = event.target.closest("select[data-assign]");
    if (select && event.type === "click") return;
    if (!button || !clan) return;
    const act = button.dataset.act;
    const row = button.closest("[data-pseudo]");
    const rankRow = button.closest("[data-rank]");
    const relRow = button.closest("[data-rel]");
    try {
      if (act === "toggle-open") {
        await apiClan("/api/clans/open", "POST", { open: clan.open === false });
        try { sendClanNotify(); } catch {}
        await load();
      } else if (act === "transfer-open") {
        const form = document.getElementById("clanTransferForm");
        if (form) form.hidden = !form.hidden;
      } else if (act === "dissolve") {
        if (!window.confirm(`Dissoudre le clan [${clan.tag}] ${clan.name} ? Tous les membres seront exclus.`)) return;
        try { sendClanNotify(); } catch {}
        try { await apiClan("/api/clans/dissolve", "POST", {}); } catch {}
        clan = null;
        try { const { sendClanRefresh } = await import("../SRC/CORE/NETPLAY.js"); sendClanRefresh(); } catch {}
        await load();
      } else if ((act === "accept" || act === "decline") && row) {
        const pseudo = row.dataset.pseudo || "";
        await apiClan(act === "accept" ? "/api/clans/accept" : "/api/clans/decline", "POST", { pseudo });
        try { sendClanNotify(pseudo); } catch {}
        try { const { sendClanRefresh } = await import("../SRC/CORE/NETPLAY.js"); if (act === "accept") sendClanRefresh(); } catch {}
        await load(act === "accept" ? `${pseudo} a rejoint le clan.` : `Candidature de ${pseudo} refusée.`);
      } else if (act === "kick" && row) {
        const pseudo = row.dataset.pseudo || "";
        if (!window.confirm(`Exclure ${pseudo} du clan ?`)) return;
        try { await apiClan("/api/clans/kick", "POST", { pseudo }); } catch {}
        try { sendClanNotify(pseudo); } catch {}
        await load();
      } else if (act === "whisper" && row) {
        const pseudo = row.dataset.pseudo || "";
        const chatInput = document.getElementById("chatInput");
        if (chatInput) { chatInput.value = `/w ${pseudo} `; chatInput.focus(); }
        window.GameWindowManager?.restore?.("chatWindow");
      } else if (act === "invite" && row) {
        try { sendGroupInvite(row.dataset.pseudo || ""); updateHeader(`Invitation de groupe envoyée à ${row.dataset.pseudo || ""}.`); } catch {}
      } else if (act === "rank-del" && rankRow) {
        if (!window.confirm(`Supprimer le rang ${rankRow.dataset.rank} ?`)) return;
        await apiClan("/api/clans/rank-manage", "POST", { action: "delete", name: rankRow.dataset.rank });
        try { sendClanNotify(); } catch {}
        await load();
      } else if (act === "diplo-accept" && relRow) {
        await apiClan("/api/clans/diplo/respond", "POST", { id: relRow.dataset.rel, accept: true });
        try { sendDiploNotify(null, ""); } catch {}
        await load();
      } else if (act === "diplo-decline" && relRow) {
        await apiClan("/api/clans/diplo/respond", "POST", { id: relRow.dataset.rel, accept: false });
        try { sendDiploNotify(null, ""); } catch {}
        await load();
      } else if (act === "diplo-end" && relRow) {
        await apiClan("/api/clans/diplo/end", "POST", { id: relRow.dataset.rel });
        try { sendDiploNotify(null, ""); } catch {}
        await load();
      }
    } catch (error) { updateHeader(String(error?.message || "Action impossible.")); }
  });
  managePane?.addEventListener("change", async (event) => {
    const checkbox = event.target.closest('input[type="checkbox"][data-right]');
    const select = event.target.closest("select[data-assign]");
    try {
      if (checkbox && clan) {
        const card = checkbox.closest("[data-rank]");
        const rank = card?.dataset.rank || "";
        const ranks = Array.isArray(clan.ranks) ? clan.ranks : [];
        const current = ranks.find((x) => String(x.name) === String(rank));
        let bits = Number(current?.rights) || 0;
        const bit = Number(checkbox.dataset.right) || 0;
        bits = checkbox.checked ? (bits | bit) : (bits & ~bit);
        await apiClan("/api/clans/rank-manage", "POST", { action: "rights", name: rank, rights: bits });
        try { sendClanNotify(); } catch {}
        await load();
      } else if (select && clan) {
        await apiClan("/api/clans/assign", "POST", { pseudo: select.dataset.assign, rank: select.value });
        try { sendClanNotify(select.dataset.assign); } catch {}
        await load();
      }
    } catch (error) { updateHeader(String(error?.message || "Action impossible.")); }
  });
  document.getElementById("clanRankCreateForm")?.addEventListener("submit", async (event) => {
    event.preventDefault(); event.stopPropagation();
    const input = document.getElementById("clanRankNameInput");
    const value = input?.value.trim();
    if (!value) return;
    try {
      await apiClan("/api/clans/rank-manage", "POST", { action: "create", name: value });
      if (input) input.value = "";
      try { sendClanNotify(); } catch {}
      await load(`Rang ${value} créé.`);
    } catch (error) { updateHeader(String(error?.message || "Création impossible.")); }
  });
  document.getElementById("clanDescForm")?.addEventListener("submit", async (event) => {
    event.preventDefault(); event.stopPropagation();
    const input = document.getElementById("clanDescInput");
    try {
      await apiClan("/api/clans/description", "POST", { description: input?.value || "" });
      try { sendClanNotify(); } catch {}
      await load("Description mise à jour.");
    } catch (error) { updateHeader(String(error?.message || "Description impossible.")); }
  });
  document.getElementById("clanTransferForm")?.addEventListener("submit", async (event) => {
    event.preventDefault(); event.stopPropagation();
    const input = document.getElementById("clanTransferInput");
    const value = input?.value.trim();
    if (!value) return;
    if (!window.confirm(`Transférer la chefferie à ${value} ? Tu deviendras simple membre.`)) return;
    try {
      await apiClan("/api/clans/transfer", "POST", { pseudo: value });
      try { sendClanNotify(value); } catch {}
      await load();
    } catch (error) { updateHeader(String(error?.message || "Transfert impossible.")); }
  });
  document.getElementById("clanDiploForm")?.addEventListener("submit", async (event) => {
    event.preventDefault(); event.stopPropagation();
    const tag = document.getElementById("clanDiploTagInput")?.value.trim() || "";
    const kind = document.getElementById("clanDiploKindSelect")?.value || "nap";
    if (!tag) return;
    const label = kind === "war" ? "guerre" : kind === "alliance" ? "alliance" : "NAP";
    if (kind === "war" && !window.confirm(`Déclarer la guerre à [${tag}] ? Effet immédiat, 100 jours max.`)) return;
    try {
      const data = await apiClan("/api/clans/diplo", "POST", { tag, kind });
      const announce = kind === "war" ? `Guerre déclarée à [${data.rel?.otherTag || tag}] !` : `${label} proposée à [${data.rel?.otherTag || tag}].`;
      try { sendDiploNotify(data.rel?.otherTag || tag, announce); } catch {}
      document.getElementById("clanDiploTagInput").value = "";
      await load(announce);
    } catch (error) { updateHeader(String(error?.message || "Diplomatie impossible.")); }
  });
  document.getElementById("clanLeaveBtn")?.addEventListener("click", async () => {
    if (!clan || !window.confirm(`Quitter le clan [${clan.tag}] ${clan.name} ?`)) return;
    try { sendClanNotify(); } catch {}
    try { await apiClan("/api/clans/leave", "POST", {}); } catch {}
    clan = null;
    try { const { sendClanRefresh } = await import("../SRC/CORE/NETPLAY.js"); sendClanRefresh(); } catch {}
    await load();
  });

  setTab("infos"); load(); setInterval(load, 30000); setInterval(poll, 1000); poll();
  window.addEventListener("orbit:window-restored", (event) => { if (event?.detail?.id === "clanWindow") load(); });
}
