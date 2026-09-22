"use strict";
import { getNetGroup, drainNetGroupInviteInbox, drainNetGroupNoticeInbox, sendGroupInvite, sendGroupAccept, sendGroupDecline, sendGroupLeave, sendGroupKick, sendGroupSync, sendGroupInviteLock, sendGroupRally, netMyId, netplayStatus } from "../SRC/CORE/NETPLAY.js";
import { escapeHtml } from "./UI_DOM.js";
import { getShipDesignBaseId, getShipPackById } from "../SHIP/SHIP_PACKS.js";

let started = false;
const LOCK_CLOSED_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>`;
const LOCK_OPEN_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M16 10V7a4 4 0 0 0-7.7-1.5"/></svg>`;
const CROWN_SVG = `<svg class="groupLeaderCrown" viewBox="0 0 24 24" aria-hidden="true"><path d="m3 7 4.5 4L12 4l4.5 7L21 7l-2 11H5L3 7Z"/><path d="M5 18h14"/></svg>`;
const amount = value => Math.max(0, Math.round(Number(value) || 0)).toLocaleString("fr-FR");

function shipTypeName(shipId) {
  const raw = String(shipId || "").toLowerCase();
  const base = getShipDesignBaseId(raw) || raw;
  return String(getShipPackById(base)?.name || base.replaceAll("_", " ") || "Vaisseau").replace(/^Vaisseau:\s*/i, "");
}

export function initGroupUI() {
  if (started) return;
  started = true;
  const status = document.getElementById("groupStatus"), members = document.getElementById("groupMembers"), invites = document.getElementById("groupInvites"), notices = document.getElementById("groupNotices"), input = document.getElementById("groupInviteInput");
  if (!members || !invites) return;
  let kickMode = false;
  const myId = () => { try { return String(netMyId() || ""); } catch { return ""; } };

  function renderGroup() {
    let group = null;
    try { group = getNetGroup(); } catch {}
    const leave = document.getElementById("groupLeaveBtn"), lock = document.getElementById("groupInviteLockBtn"), rally = document.getElementById("groupRallyBtn"), kickBtn = document.getElementById("groupKickModeBtn"), inviteBtn = document.getElementById("groupInviteBtn");
    if (!group) {
      kickMode = false;
      if (status) status.textContent = "Solo — invite un pilote pour former une escadrille.";
      members.innerHTML = `<div class="groupEmpty">Personne avec toi pour l'instant.</div>`;
      invites.style.display = "";
      if (input) { input.disabled = false; input.placeholder = "Pseudo à inviter…"; }
      if (inviteBtn) inviteBtn.disabled = false;
      for (const button of [leave, lock, rally, kickBtn]) if (button) button.style.display = "none";
      return;
    }
    const leader = String(group.leader), leaderMode = myId() === leader, chief = group.members.find(member => String(member.id) === leader);
    if (status) status.textContent = `Escadrille (${group.members.length}/10) — chef : ${chief?.pseudo || "?"}`;
    invites.style.display = "none";
    members.innerHTML = group.members.map(member => {
      const id = escapeHtml(String(member.id));
      const hp = Math.round(Math.max(0, Math.min(1, Number(member.hpPct ?? 1))) * 100), sh = Math.round(Math.max(0, Math.min(1, Number(member.shPct ?? 1))) * 100);
      const targetHp = Math.round(Math.max(0, Math.min(1, Number(member.targetHpPct || 0))) * 100), targetSh = Math.round(Math.max(0, Math.min(1, Number(member.targetShPct || 0))) * 100);
      const hpMax = Math.max(1, Number(member.hpMax) || 1), shMax = Math.max(0, Number(member.shMax) || 0), targetHpMax = Math.max(0, Number(member.targetHpMax) || 0), targetShMax = Math.max(0, Number(member.targetShMax) || 0);
      const hpTitle = `Coque : ${amount(hpMax * hp / 100)} / ${amount(hpMax)}`, shTitle = `Bouclier : ${amount(shMax * sh / 100)} / ${amount(shMax)}`;
      const targetHpTitle = `Coque : ${amount(targetHpMax * targetHp / 100)} / ${amount(targetHpMax)}`, targetShTitle = `Bouclier : ${amount(targetShMax * targetSh / 100)} / ${amount(targetShMax)}`;
      const kickTarget = leaderMode && String(member.id) !== leader ? ` data-kick-member="${id}"` : "";
      const targetBars = member.combat === "npc" ? `<div class="groupVitals groupNpcVitals"><span class="groupNpcName">${escapeHtml(member.targetName || "NPC")}</span><i title="${targetHpTitle}"><b class="hp" style="width:${targetHp}%"></b></i><i title="${targetShTitle}"><b class="sh" style="width:${targetSh}%"></b></i></div>` : `<div class="groupVitals groupNpcVitals empty"></div>`;
      return `<div class="groupRow groupMember${kickMode && kickTarget ? " kickSelectable" : ""}"${kickTarget}><div class="groupMemberHead"><span class="groupName">${escapeHtml(member.pseudo || "Pilote")}${String(member.id) === leader ? CROWN_SVG : ""}</span><span class="groupMap">${escapeHtml(member.map || "?")}</span></div><div class="groupCombatBars"><div class="groupVitals groupPlayerVitals"><span class="groupShipName">${escapeHtml(shipTypeName(member.shipId))}</span><i title="${hpTitle}"><b class="hp" style="width:${hp}%"></b></i><i title="${shTitle}"><b class="sh" style="width:${sh}%"></b></i></div>${targetBars}</div></div>`;
    }).join("");
    if (leave) leave.style.display = "";
    if (lock) { const label = group.invitesLocked ? "Déverrouiller les invitations" : "Verrouiller les invitations"; lock.style.display = leaderMode ? "" : "none"; lock.innerHTML = group.invitesLocked ? LOCK_CLOSED_SVG : LOCK_OPEN_SVG; lock.title = label; lock.setAttribute("aria-label", label); }
    if (rally) rally.style.display = leaderMode ? "" : "none";
    if (kickBtn) { kickBtn.style.display = leaderMode ? "" : "none"; kickBtn.classList.toggle("active", kickMode); kickBtn.textContent = kickMode ? "Clique un membre" : "Exclure"; }
    const invitesDisabled = !leaderMode && group.invitesLocked === true;
    if (input) { input.disabled = invitesDisabled; input.placeholder = invitesDisabled ? "Invitations verrouillées" : "Pseudo à inviter…"; }
    if (inviteBtn) inviteBtn.disabled = invitesDisabled;
  }

  function renderInvites() {
    let list = [];
    try { list = drainNetGroupInviteInbox(); } catch {}
    for (const invite of list) {
      if (invites.querySelector(`[data-inv-from="${CSS.escape(String(invite.from))}"]`)) continue;
      const row = document.createElement("div");
      row.className = "groupInvite"; row.dataset.invFrom = String(invite.from); row.dataset.expiresAt = String(Number(invite.expiresAt) || Date.now() + 15000);
      row.innerHTML = `<em class="groupInviteTimer">15s</em><span>Escadrille de <b>${escapeHtml(invite.fromPseudo || "Pilote")}</b></span><span><button data-accept="1">Rejoindre</button> <button data-decline="1">Refuser</button></span>`;
      invites.appendChild(row);
    }
    invites.querySelector(".groupEmpty")?.remove();
    for (const row of invites.querySelectorAll("[data-expires-at]")) { const left = Math.max(0, Math.ceil((Number(row.dataset.expiresAt) - Date.now()) / 1000)); const timer = row.querySelector(".groupInviteTimer"); if (timer) timer.textContent = `${left}s`; if (!left) row.remove(); }
    if (!invites.children.length) invites.innerHTML = `<div class="groupEmpty">Aucune invitation.</div>`;
  }

  function pollNotices() {
    try {
      for (const notice of drainNetGroupNoticeInbox()) { const row = document.createElement("div"); row.className = "groupNotice"; row.dataset.text = String(notice.text || ""); if (notice.expiresAt) row.dataset.expiresAt = String(notice.expiresAt); row.textContent = row.dataset.text; notices?.prepend(row); while (notices?.children.length > 5) notices.removeChild(notices.lastChild); }
      for (const row of notices?.querySelectorAll("[data-expires-at]") || []) { const left = Math.max(0, Math.ceil((Number(row.dataset.expiresAt) - Date.now()) / 1000)); row.textContent = `${row.dataset.text} (${left}s)`; if (!left) row.remove(); }
    } catch {}
  }

  let signature = "", syncAt = 0;
  function poll() { try { if (netplayStatus().connected && Date.now() - syncAt > 2000) { syncAt = Date.now(); sendGroupSync(); } renderInvites(); pollNotices(); const next = JSON.stringify(getNetGroup()); if (next !== signature) { signature = next; renderGroup(); } } catch {} }
  document.getElementById("groupLeaveBtn")?.addEventListener("click", () => { sendGroupLeave(); signature = ""; });
  document.getElementById("groupInviteBtn")?.addEventListener("click", () => { if (input?.disabled) return; const value = input?.value.trim(); if (value) sendGroupInvite(value); if (input) input.value = ""; });
  document.getElementById("groupInviteLockBtn")?.addEventListener("click", () => sendGroupInviteLock(!getNetGroup()?.invitesLocked));
  document.getElementById("groupRallyBtn")?.addEventListener("click", sendGroupRally);
  document.getElementById("groupKickModeBtn")?.addEventListener("click", () => { kickMode = !kickMode; renderGroup(); });
  invites.addEventListener("click", event => { const button = event.target.closest("button"); if (!button) return; if (button.dataset.accept) sendGroupAccept(); else if (button.dataset.decline) sendGroupDecline(); button.closest("[data-inv-from]")?.remove(); signature = ""; });
  members.addEventListener("click", event => { if (!kickMode) return; const card = event.target.closest("[data-kick-member]"); if (!card) return; sendGroupKick(card.dataset.kickMember); kickMode = false; renderGroup(); });
  renderGroup(); setInterval(poll, 500); poll();
}
