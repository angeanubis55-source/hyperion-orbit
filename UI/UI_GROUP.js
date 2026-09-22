"use strict";
import { getNetGroup, drainNetGroupInviteInbox, drainNetGroupNoticeInbox, sendGroupInvite, sendGroupAccept, sendGroupDecline, sendGroupLeave, sendGroupKick, sendGroupSync, sendGroupInviteLock, sendGroupRally, netMyId, netplayStatus } from "../SRC/CORE/NETPLAY.js";
import { escapeHtml } from "./UI_DOM.js";
let started = false;
export function initGroupUI() {
  if (started) return; started = true;
  const status = document.getElementById("groupStatus"), members = document.getElementById("groupMembers"), invites = document.getElementById("groupInvites"), notices = document.getElementById("groupNotices"), input = document.getElementById("groupInviteInput");
  if (!members || !invites) return;
  const myId = () => { try { return String(netMyId() || ""); } catch { return ""; } };
  function renderGroup() {
    let g = null; try { g = getNetGroup(); } catch {}
    const leave = document.getElementById("groupLeaveBtn"), lock = document.getElementById("groupInviteLockBtn"), rally = document.getElementById("groupRallyBtn");
    if (!g) { if (status) status.textContent = "Solo — invite un pilote pour former une escadrille."; members.innerHTML = `<div class="groupEmpty">Personne avec toi pour l'instant.</div>`; for (const b of [leave, lock, rally]) if (b) b.style.display = "none"; return; }
    const leader = String(g.leader), leaderMode = myId() === leader, self = g.members.find(m => String(m.id) === myId()), chief = g.members.find(m => String(m.id) === leader);
    if (status) status.textContent = `Escadrille (${g.members.length}/10) — chef : ${chief?.pseudo || "?"}`;
    members.innerHTML = g.members.map(m => {
      const id = escapeHtml(String(m.id)), sameMap = self && String(self.map) === String(m.map) && !m.instance;
      const distance = sameMap ? `${Math.round(Math.hypot(Number(m.x) - Number(self.x), Number(m.y) - Number(self.y)))} u` : "";
      const state = !m.online ? "Déconnecté" : m.instance ? "Galaxy Gate" : m.dead ? "Détruit" : "Vivant";
      const combat = m.combat === "player" ? "Combat joueur" : m.combat === "npc" ? "Combat NPC" : "Hors combat";
      const hp = Math.round(Math.max(0, Math.min(1, Number(m.hpPct ?? 1))) * 100), sh = Math.round(Math.max(0, Math.min(1, Number(m.shPct ?? 1))) * 100);
      const join = sameMap && String(m.id) !== myId() && !m.dead ? `<button type="button" data-join="${id}">Rejoindre</button>` : "";
      const kick = leaderMode && String(m.id) !== leader ? `<button type="button" data-kick="${id}" title="Exclure">×</button>` : "";
      return `<div class="groupRow groupMember"><div class="groupMemberHead"><span class="groupName">${escapeHtml(m.pseudo || "Pilote")}${String(m.id) === leader ? " 👑" : ""}</span><span class="groupMap">${escapeHtml(m.map || "?")}${distance ? ` · ${distance}` : ""}</span></div><div class="groupMeta">${state} · ${escapeHtml(m.shipId || "Vaisseau")} · PET ${m.petActive ? "actif" : "inactif"}</div><div class="groupBars"><span>Coque ${hp}%</span><i class="hp" style="width:${hp}%"></i><span>Bouclier ${sh}%</span><i class="sh" style="width:${sh}%"></i></div><div class="groupTarget ${escapeHtml(m.combat || "")}">${combat}${m.combat ? ` · cible ${Math.round(Number(m.targetHpPct || 0) * 100)}% / ${Math.round(Number(m.targetShPct || 0) * 100)}%` : ""}</div><div class="groupMemberActions">${join}${kick}</div></div>`;
    }).join("");
    if (leave) leave.style.display = "";
    if (lock) { lock.style.display = leaderMode ? "" : "none"; lock.textContent = g.invitesLocked ? "Déverrouiller invitations" : "Verrouiller invitations"; }
    if (rally) rally.style.display = leaderMode ? "" : "none";
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
  invites.addEventListener("click", e => { const b = e.target.closest("button"); if (!b) return; if (b.dataset.accept) sendGroupAccept(); else if (b.dataset.decline) sendGroupDecline(); b.closest("[data-inv-from]")?.remove(); sig = ""; });
  members.addEventListener("click", e => { const join = e.target.closest("button[data-join]"); if (join) { const m = getNetGroup()?.members?.find(x => String(x.id) === String(join.dataset.join)); if (m) window.dispatchEvent(new CustomEvent("orbit:group-join", { detail: m })); return; } const kick = e.target.closest("button[data-kick]"); if (kick) sendGroupKick(kick.dataset.kick); });
  renderGroup(); setInterval(poll, 500); poll();
}
