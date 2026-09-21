"use strict";

// UI/UI_GROUP.js — Fenêtre Groupe (escadrille) façon DarkOrbit.
// Membres + carte, invitation par pseudo, créer/quitter, invitations reçues
// (Rejoindre/Refuser), avis système.
// (Pas de champ d'envoi : on parle à l'escadrille depuis le tchat.)

import {
  getNetGroup,
  drainNetGroupInviteInbox, drainNetGroupNoticeInbox,
  sendGroupInvite, sendGroupAccept, sendGroupDecline,
  sendGroupLeave, sendGroupKick, sendGroupSync,
  netMyId, netplayStatus,
} from "../SRC/CORE/NETPLAY.js";
import { escapeHtml } from "./UI_DOM.js";

let started = false;

export function initGroupUI() {
  if (started) return;
  started = true;
  const status = document.getElementById("groupStatus");
  const members = document.getElementById("groupMembers");
  const invites = document.getElementById("groupInvites");
  const notices = document.getElementById("groupNotices");
  const inviteInput = document.getElementById("groupInviteInput");
  if (!members || !invites) return;

  function myId() {
    try { return String(netMyId() || ""); } catch { return ""; }
  }

  function renderGroup() {
    let g = null;
    try { g = getNetGroup(); } catch {}
    if (status) {
      if (!g) status.textContent = "Solo — invite un pilote par pseudo pour former une escadrille.";
      else {
        const chief = g.members.find((m) => String(m.id) === String(g.leader));
        status.textContent = `Escadrille (${g.members.length}/10) — chef : ${chief?.pseudo || "?"}`;
      }
    }
    if (!g) {
      members.innerHTML = `<div class="groupEmpty">Personne avec toi pour l'instant.</div>`;
    } else {
      const leader = String(g.leader);
      const iAmLeader = myId() !== "" && myId() === leader;
      members.innerHTML = g.members.map((m) => {
        const mid = escapeHtml(String(m.id));
        const mp = escapeHtml(String(m.pseudo || "Pilote"));
        const map = escapeHtml(String(m.map || "?"));
        const crown = String(m.id) === leader ? " 👑" : "";
        const kick = (iAmLeader && String(m.id) !== leader)
          ? `<button type="button" data-kick="${mid}" title="Exclure">✕</button>` : "";
        return `<div class="groupRow"><span class="groupName">${mp}${crown}</span>`
          + `<span class="groupMap">${map}</span>${kick}</div>`;
      }).join("");
    }
    const leaveBtn = document.getElementById("groupLeaveBtn");
    if (leaveBtn) leaveBtn.style.display = g ? "" : "none";
  }

  function renderInvites() {
    let list = [];
    try { list = drainNetGroupInviteInbox(); } catch {}
    for (const inv of list) {
      if (invites.querySelector(`[data-inv-from="${escapeHtml(String(inv.from))}"]`)) continue;
      const div = document.createElement("div");
      div.className = "groupInvite";
      div.dataset.invFrom = String(inv.from);
      div.innerHTML = `<span>Escadrille de <b>${escapeHtml(inv.fromPseudo || "Pilote")}</b></span>`
        + `<span><button type="button" data-accept="1">Rejoindre</button> `
        + `<button type="button" data-decline="1">Refuser</button></span>`;
      invites.appendChild(div);
    }
    const empty = invites.querySelector(".groupEmpty");
    if (invites.children.length > 1 && empty) empty.remove();
    if (!invites.children.length) invites.innerHTML = `<div class="groupEmpty">Aucune invitation.</div>`;
  }

  function pollNotices() {
    try {
      const inbox = drainNetGroupNoticeInbox();
      if (!inbox.length || !notices) return;
      for (const n of inbox) {
        const div = document.createElement("div");
        div.className = "groupNotice";
        div.textContent = String(n.text || "");
        notices.prepend(div);
        while (notices.children.length > 5) notices.removeChild(notices.lastChild);
      }
    } catch {}
  }

  let lastSig = "";
  let lastSync = 0;
  function poll() {
    try {
      const st = netplayStatus();
      if (st.connected) {
        const now = Date.now();
        if (now - lastSync > 10000) { lastSync = now; try { sendGroupSync(); } catch {} }
      }
      renderInvites();
      pollNotices();
      const sig = (() => { try { return JSON.stringify(getNetGroup()); } catch { return "null"; } })();
      if (sig !== lastSig) { lastSig = sig; renderGroup(); }
    } catch {}
  }

  document.getElementById("groupLeaveBtn")?.addEventListener("click", () => { try { sendGroupLeave(); } catch {} lastSig = ""; });
  document.getElementById("groupInviteBtn")?.addEventListener("click", () => {
    const v = inviteInput?.value.trim();
    if (!v) return;
    try { sendGroupInvite(v); } catch {}
    if (inviteInput) inviteInput.value = "";
  });
  invites.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    const row = e.target.closest("[data-inv-from]");
    try {
      if (btn.dataset.accept) sendGroupAccept();
      else sendGroupDecline();
    } catch {}
    row?.remove();
    if (!invites.children.length) invites.innerHTML = `<div class="groupEmpty">Aucune invitation.</div>`;
    lastSig = "";
  });
  members.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-kick]");
    if (btn) {
      try { sendGroupKick(btn.dataset.kick); } catch {}
      return;
    }
    // Clic sur le nom : pré-remplit l'ajout d'ami (fenêtre Amis).
    const name = e.target.closest(".groupName");
    if (!name) return;
    const pseudo = name.textContent.replace(" 👑", "").trim();
    if (!pseudo) return;
    try {
      const input = document.getElementById("friendAddInput");
      if (input) input.value = pseudo;
      window.GameWindowManager?.restore?.("friendsWindow");
    } catch {}
  });
  renderGroup();
  setInterval(poll, 500);
  poll();
}
