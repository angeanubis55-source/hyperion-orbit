"use strict";
import { getNetGroup, drainNetGroupInviteInbox, drainNetGroupNoticeInbox, sendGroupInvite, sendGroupAccept, sendGroupDecline, sendGroupLeave, sendGroupKick, sendGroupSync, sendGroupInviteLock, sendGroupRally, netMyId, netplayStatus } from "../SRC/CORE/NETPLAY.js";
import { escapeHtml } from "./UI_DOM.js";
let started = false;
const LOCK_CLOSED_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>`;
const LOCK_OPEN_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M16 10V7a4 4 0 0 0-7.7-1.5"/></svg>`;
export function initGroupUI() {
  if (started) return; started = true;
  const status = document.getElementById("groupStatus"), members = document.getElementById("groupMembers"), invites = document.getElementById("groupInvites"), notices = document.getElementById("groupNotices"), input = document.getElementById("groupInviteInput");
  if (!members || !invites) return;
  let kickMode = false;
  const myId = () => { try { return String(netMyId() || ""); } catch { return ""; } };
  function renderGroup() {
    let g = null; try { g = getNetGroup(); } catch {}
    const leave = document.getElementById("groupLeaveBtn"), lock = document.getElementById("groupInviteLockBtn"), rally = document.getElementById("groupRallyBtn"), kickBtn = document.getElementById("groupKickModeBtn");
    if (!g) { kickMode = false; if (status) status.textContent = "Solo — invite un pilote pour former une escadrille."; members.innerHTML = `<div class="groupEmpty">Personne avec toi pour l'instant.</div>`; invites.style.display = ""; for (const b of [leave, lock, rally, kickBtn]) if (b) b.style.display = "none"; return; }
    const leader = String(g.leader), leaderMode = myId() === leader, chief = g.members.find(m => String(m.id) === leader);
    if (status) status.textContent = `Escadrille (${g.members.length}/10) — chef : ${chief?.pseudo || "?"}`;
    invites.style.display = "none";
    members.innerHTML = g.members.map(m => {
      const id = escapeHtml(String(m.id));
      const hp = Math.round(Math.max(0, Math.min(1, Number(m.hpPct ?? 1))) * 100), sh = Math.round(Math.max(0, Math.min(1, Number(m.shPct ?? 1))) * 100);
      const targetHp = Math.round(Math.max(0, Math.min(1, Number(m.targetHpPct || 0))) * 100), targetSh = Math.round(Math.max(0, Math.min(1, Number(m.targetShPct || 0))) * 100);
      const kickTarget = leaderMode && String(m.id) !== leader ? ` data-kick-member="${id}"` : "";
      const targetBars = m.combat === "npc" ? `<div class="groupVitals groupNpcVitals" title="Cible NPC"><span class="groupNpcName">${escapeHtml(m.targetName || "NPC")}</span><i><b class="hp" style="width:${targetHp}%"></b></i><i><b class="sh" style="width:${targetSh}%"></b></i></div>` : `<div class="groupVitals groupNpcVitals empty"></div>`;
      return `<div class="groupRow groupMember${kickMode && kickTarget ? " kickSelectable" : ""}"${kickTarget}><div class="groupMemberHead"><span class="groupName">${escapeHtml(m.pseudo || "Pilote")}${String(m.id) === leader ? " 👑" : ""}</span><span class="groupMap">${escapeHtml(m.map || "?")}</span></div><div class="groupCombatBars"><div class="groupVitals groupPlayerVitals"><i><b class="hp" style="width:${hp}%"></b></i><i><b class="sh" style="width:${sh}%"></b></i></div>${targetBars}</div></div>`;
    }).join("");
    if (leave) leave.style.display = "";
    if (lock) { const label = g.invitesLocked ? "Déverrouiller les invitations" : "Verrouiller les invitations"; lock.style.display = leaderMode ? "" : "none"; lock.innerHTML = g.invitesLocked ? LOCK_CLOSED_SVG : LOCK_OPEN_SVG; lock.title = label; lock.setAttribute("aria-label", label); }
    if (rally) rally.style.display = leaderMode ? "" : "none";
    if (kickBtn) { kickBtn.style.display = leaderMode ? "" : "none"; kickBtn.classList.toggle("active", kickMode); kickBtn.textContent = kickMode ? "Clique un membre" : "Exclure"; }
  }
  function renderInvites() {
    let list = []; try { list = drainNetGroupInviteInbox(); } catch {}
    for (const inv of list) { if (invites.querySelector(`[data-inv-from="${CSS.escape(String(inv.from))}"]`)) continue; const d = document.createElement("div"); d.className = "groupInvite"; d.dataset.invFrom = String(inv.from); d.dataset.expiresAt = String(Number(inv.expiresAt) || Date.now() + 15000); d.innerHTML = `<em class="groupInviteTimer">15s</em><span>Escadrille de <b>${escapeHtml(inv.fromPseudo || "Pilote")}</b></span><span><button data-accept="1">Rejoindre</button> <button data-decline="1">Refuser</button></span>`; invites.appendChild(d); }
    invites.querySelector(".groupEmpty")?.remove();
    for (const row of invites.querySelectorAll("[data-expires-at]")) { const left = Math.max(0, Math.ceil((Number(row.dataset.expiresAt) - Date.now()) / 1000)); const timer = row.querySelector(".groupInviteTimer"); if (timer) timer.textContent = `${left}s`; if (!left) row.remove(); }
    if (!invites.children.length) invites.innerHTML = `<div class="groupEmpty">Aucune invitation.</div>`;
  }
  function pollNotices() { try { for (const n of drainNetGroupNoticeInbox()) { const d = document.createElement("div"); d.className = "groupNotice"; d.dataset.text = String(n.text || ""); if (n.expiresAt) d.dataset.expiresAt = String(n.expiresAt); d.textContent = d.dataset.text; notices?.prepend(d); while (notices?.children.length > 5) notices.removeChild(notices.lastChild); } for (const d of notices?.querySelectorAll("[data-expires-at]") || []) { const left = Math.max(0, Math.ceil((Number(d.dataset.expiresAt) - Date.now()) / 1000)); d.textContent = `${d.dataset.text} (${left}s)`; if (!left) d.remove(); } } catch {} }
  let sig = "", syncAt = 0;
  function poll() { try { if (netplayStatus().connected && Date.now() - syncAt > 2000) { syncAt = Date.now(); sendGroupSync(); } renderInvites(); pollNotices(); const next = JSON.stringify(getNetGroup()); if (next !== sig) { sig = next; renderGroup(); } } catch {} }
  document.getElementById("groupLeaveBtn")?.addEventListener("click", () => { sendGroupLeave(); sig = ""; });
  document.getElementById("groupInviteBtn")?.addEventListener("click", () => { const v = input?.value.trim(); if (v) sendGroupInvite(v); if (input) input.value = ""; });
  document.getElementById("groupInviteLockBtn")?.addEventListener("click", () => sendGroupInviteLock(!getNetGroup()?.invitesLocked));
  document.getElementById("groupRallyBtn")?.addEventListener("click", sendGroupRally);
  document.getElementById("groupKickModeBtn")?.addEventListener("click", () => { kickMode = !kickMode; renderGroup(); });
  invites.addEventListener("click", e => { const b = e.target.closest("button"); if (!b) return; if (b.dataset.accept) sendGroupAccept(); else if (b.dataset.decline) sendGroupDecline(); b.closest("[data-inv-from]")?.remove(); sig = ""; });
  members.addEventListener("click", e => { if (!kickMode) return; const card = e.target.closest("[data-kick-member]"); if (!card) return; sendGroupKick(card.dataset.kickMember); kickMode = false; renderGroup(); });
  renderGroup(); setInterval(poll, 500); poll();
}
