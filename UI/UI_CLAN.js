"use strict";
import { shouldRefreshWindow } from "../SRC/CORE/BACKGROUND_REFRESH.js";

// Panneau de clan à onglets :
// - Sans clan : Rejoindre (liste publique + candidatures) / Créer / Classement.
// - Avec clan : Infos (fiche, chiffres, annonce, description) / Membres
//   (stats, présence, tri, candidatures, rangs, exclusion) / Banque (dépôt,
//   distribution, historique) / Classement / Rangs (droits) / Diplomatie
//   (alliance, NAP, guerre) / Journal.
// Roster via HTTP (/api/clans/*) ; le WS transporte le tchat, les notifs et
// les annonces diplomatie (comme les Amis). La banque passe par le circuit
// autoritaire du compte (apiClanBank) : crédits jamais dupliqués.

import {
  consumeClanDirty, sendClanNotify, sendDiploNotify, setNetDiplo, netMyId,
} from "../SRC/CORE/NETPLAY.js";
import { apiClanBank } from "../SRC/CORE/ACCOUNT_NET.js";
import { getRankInfo } from "../SRC/CORE/PROGRESSION.js";
import { formatInteger } from "../SRC/CORE/NUMBER_FORMAT.js";
import { STATION_WEAPON_STATS, STATION_DEFLECT_COST } from "../SRC/DATA/BATTLESTATION.js";
import { getFaction } from "../SRC/CORE/FACTIONS.js";
import { escapeHtml } from "./UI_DOM.js";

let started = false;
let clanDialogPending = false;

// Confirmation intégrée au panneau (même style que la déclaration de
// guerre) : remplace les confirm() natifs du navigateur.
async function confirmClanDialog(title, message) {
  if (clanDialogPending) return false;
  const clanWindow = document.getElementById("clanWindow");
  if (!clanWindow) return false;
  clanDialogPending = true;
  const overlay = document.createElement("div");
  overlay.className = "tdmSellDialog";
  overlay.dataset.noDrag = "1";
  overlay.innerHTML = `<div class="tdmSellCard" role="dialog" aria-labelledby="clanDlgTitle">
    <div id="clanDlgTitle" class="tdmSellTitle"></div>
    <div class="tdmSellItem"></div>
    <div class="tdmSellActions"><button type="button" data-dlg-cancel>Annuler</button><button type="button" data-dlg-confirm>Confirmer</button></div>
  </div>`;
  const titleEl = overlay.querySelector(".tdmSellTitle");
  const messageEl = overlay.querySelector(".tdmSellItem");
  const cancel = overlay.querySelector("[data-dlg-cancel]");
  const ok = overlay.querySelector("[data-dlg-confirm]");
  titleEl.textContent = title;
  messageEl.textContent = message;
  const previousFocus = document.activeElement;
  clanWindow.appendChild(overlay);
  cancel.focus();
  return new Promise(resolve => {
    const finish = accepted => {
      overlay.remove();
      clanDialogPending = false;
      previousFocus?.focus();
      resolve(accepted);
    };
    cancel.onclick = () => finish(false);
    ok.onclick = () => finish(true);
    overlay.onclick = event => { if (event.target === overlay) finish(false); };
    overlay.onkeydown = event => {
      event.stopPropagation();
      if (event.key === "Escape") { event.preventDefault(); finish(false); }
    };
  });
}

async function confirmClanWar(tag) {
  return confirmClanDialog("Déclaration de guerre", `Déclarer la guerre à [${tag}] ? Effet immédiat, 100 jours maximum.`);
}
const ICON_REMOVE = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17"/></svg>`;
const ICON_ACCEPT = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>`;
const CROWN_SVG = `<svg class="clanLeaderCrown" viewBox="0 0 24 24" aria-hidden="true"><path d="m3 7 4.5 4L12 4l4.5 7L21 7l-2 11H5L3 7Z"/><path d="M5 18h14"/></svg>`;
const ICON_TRANSFER = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h13l-3.5-3.5M20 16H7l3.5 3.5"/></svg>`;
const ICON_TRASH = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V5h6v2M6.5 7l.8 13h9.4l.8-13M10 11v6M14 11v6"/></svg>`;
const ICON_EXIT = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h5v16h-5M10 8l-4 4 4 4M6 12h9"/></svg>`;

const RIGHT_LABELS = [[1, "Candidatures"], [2, "Exclusion"], [4, "Diplomatie"], [8, "Édition"], [16, "Banque"]];
const DIPLO_LABEL = { alliance: "Alliance", nap: "NAP", war: "Guerre" };
const MAX_MEMBERS = 30;
const MOTD_SEEN_KEY = "orbit_clan_motd_seen";
// Croix du bandeau : masque l'annonce pour soi seul (tous les membres,
// chef compris), jusqu'à la prochaine annonce. Le retrait pour tout le clan
// se fait depuis l'onglet Annonces.
const MOTD_HIDDEN_KEY = "orbit_clan_motd_hidden";
function motdHiddenFor(clanId) {
  try { return Number((JSON.parse(localStorage.getItem(MOTD_HIDDEN_KEY) || "{}") || {})[clanId]) || 0; } catch { return 0; }
}

// Bases de Combat : modules et bonus (mêmes valeurs que le moteur,
// stationClanBaseBonuses / stationClan*Mult).
const BASE_MODULES = {
  station_core: "Cœur de base",
  station_laser_1: "Laser Niv. 1", station_laser_2: "Laser Niv. 2", station_laser_3: "Laser Niv. 3",
  station_rocket_1: "Roquette Niv. 1", station_rocket_2: "Roquette Niv. 2",
  station_module_dmg: "Module DMG", station_module_hon: "Module HON",
  station_module_exp: "Module EXP", station_module_rep: "Module REP",
};
const BASE_BONUSES = [
  { key: "dmg", label: "Dégâts", per: 2, cap: 10, module: "station_module_dmg" },
  { key: "hon", label: "Honneur", per: 10, cap: 50, module: "station_module_hon" },
  { key: "exp", label: "Expérience", per: 10, cap: 50, module: "station_module_exp" },
  { key: "rep", label: "Réparation", per: 2, cap: 10, module: "station_module_rep" },
];
const MODULE_STATE = {
  active: ["Actif", "clanYes"], installing: ["Installation", "wikiGold"], replacing: ["Remplacement", "wikiGold"],
  destroyed: ["Détruit", "clanNo"], empty: ["Libre", "wikiMuted"],
};

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

function engineNotify(text, dur = 4, type = "info") {
  try { window.__ORBIT_ENGINE__?.showNotification?.(text, dur, type); } catch {}
}

// Montant saisi : "1 000 000", "1.5M", "250k", "2md" acceptés.
function parseAmount(raw) {
  const text = String(raw || "").trim().toLowerCase().replace(/\s|_/g, "").replace(",", ".");
  const m = /^(\d+(?:\.\d+)?)(k|m|md|b)?$/.exec(text);
  if (!m) return 0;
  const mult = m[2] === "k" ? 1e3 : m[2] === "m" ? 1e6 : (m[2] === "md" || m[2] === "b") ? 1e9 : 1;
  const value = Math.floor(Number(m[1]) * mult);
  return Number.isSafeInteger(value) && value > 0 ? value : 0;
}

function compact(n) {
  const v = Math.max(0, Number(n) || 0);
  if (v >= 1e9) return `${(v / 1e9).toFixed(v >= 1e10 ? 0 : 1).replace(".0", "")} Md`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(v >= 1e7 ? 0 : 1).replace(".0", "")} M`;
  if (v >= 1e4) return `${Math.round(v / 1e3)} k`;
  return formatInteger(v);
}

function ago(at) {
  const ms = Date.now() - (Number(at) || 0);
  if (!(Number(at) > 0)) return "jamais";
  const min = Math.floor(ms / 60000);
  if (min < 2) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.floor(h / 24);
  return d < 60 ? `il y a ${d} j` : `il y a ${Math.floor(d / 30)} mois`;
}

function dateFr(at) {
  try { return new Date(Number(at)).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" }); } catch { return "—"; }
}

function roleLabel(member) {
  const role = String(member?.role || "member");
  if (role === "leader") return "Chef";
  if (role === "officer") return "Officier";
  if (role === "member") return "Membre";
  return role;
}

export function initClanUI() {
  if (started) return;
  started = true;
  const $ = (id) => document.getElementById(id);
  const status = $("clanStatus");
  const createPane = $("clanCreatePane");
  const managePane = $("clanManagePane");
  const allList = $("clanAllList");
  const infoBox = $("clanInfoBox");
  const statTiles = $("clanStatTiles");
  const list = $("clanList");
  const appsBlock = $("clanAppsBlock");
  const appsList = $("clanAppsList");
  const ranksList = $("clanRanksList");
  const diploClans = $("clanDiploClans");
  const logList = $("clanLogList");
  const browseNav = document.querySelector("#clanWindow .clanBrowseTabs");
  const manageNav = document.querySelector("#clanWindow .clanManageTabs");
  if (!createPane || !managePane || !browseNav || !manageNav) return;
  let clan = null, clans = [], mine = [], ranking = [], rels = { active: [], incoming: [], outgoing: [] };
  let bases = null;
  let activeTab = "infos";
  let browseTab = "join";
  let rankingAt = 0;
  let statusTimer = 0;

  function appliedTags() {
    try { return new Set(mine.map((a) => String(a.tag || "").toUpperCase())); } catch { return new Set(); }
  }

  function myRights() {
    const r = clan?.rights || {};
    return { isLeader: r.isLeader === true, apps: r.apps === true, kick: r.kick === true, diplo: r.diplo === true, edit: r.edit === true, bank: r.bank === true };
  }

  function isLeader() {
    try { return String(clan?.role || "") === "leader"; } catch { return false; }
  }

  function myClanRanking() {
    if (!clan) return null;
    return ranking.find((row) => String(row.tag || "").toUpperCase() === String(clan.tag || "").toUpperCase()) || null;
  }

  // Message ponctuel (succès / erreur) sous l'en-tête, effacé après 6 s.
  function updateHeader(message = "", tone = "") {
    if (!status) return;
    clearTimeout(statusTimer);
    status.textContent = message;
    status.dataset.tone = tone;
    status.hidden = !message;
    if (message) statusTimer = setTimeout(() => { status.hidden = true; status.textContent = ""; }, 6000);
  }
  function fail(error, fallback) { updateHeader(String(error?.message || error || fallback), "error"); }

  // Tableau façon wiki : en-têtes collants, lignes zébrées.
  // rows = [{ cells: [html...], attrs: 'data-x="..."', cls: "" }]
  function table(headers, rows, { cls = "", empty = "Rien à afficher." } = {}) {
    if (!rows.length) return `<div class="clanEmpty">${escapeHtml(empty)}</div>`;
    const head = headers.map((h) => typeof h === "string" ? `<th>${h}</th>` : `<th class="${h.cls || ""}">${h.label}</th>`).join("");
    const body = rows.map((r) => `<tr${r.cls ? ` class="${r.cls}"` : ""}${r.attrs ? ` ${r.attrs}` : ""}>${r.cells.map((c, i) => {
      const h = headers[i];
      const tdCls = h && typeof h !== "string" && h.cls ? ` class="${h.cls}"` : "";
      return `<td${tdCls}>${c ?? ""}</td>`;
    }).join("")}</tr>`).join("");
    return `<div class="wikiTableWrap"><table class="wikiTable ${cls}"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
  }
  const NUM = (label) => ({ label, cls: "num" });
  const ACT = { label: "", cls: "act" };

  function renderTop() {
    const intro = $("clanIntro"), stats = $("clanTopStats");
    if (!intro || !stats) return;
    if (!clan) {
      intro.innerHTML = `<b>Clan</b> — tu n'as pas encore de clan. Postule dans un clan existant ou fonde le tien.`;
      stats.innerHTML = mine.length ? `<span class="wikiCount">${mine.length} candidature${mine.length > 1 ? "s" : ""} en attente</span>` : "";
      return;
    }
    const online = clan.members.filter((m) => m.online).length;
    const pos = myClanRanking()?.position;
    intro.innerHTML = `<b>[${escapeHtml(clan.tag)}] ${escapeHtml(clan.name)}</b> — ${escapeHtml(roleLabel({ role: clan.role }))} · ${clan.members.length}/${MAX_MEMBERS} membres · <span class="clanOnline">${online} en ligne</span>`;
    stats.innerHTML = `<span class="wikiCount">Classement <b class="wikiGold">${pos ? `#${pos}` : "—"}</b></span>`
      + `<span class="wikiCount">Banque <b class="wikiGold">${escapeHtml(compact(clan.bank))}</b></span>`;
  }

  function renderMotd() {
    const banner = $("clanMotdBanner"), text = $("clanMotdBannerText");
    const motd = clan?.motd || "";
    if (banner) banner.hidden = !motd || motdHiddenFor(clan.id) === Number(clan.motdAt);
    if (text) text.textContent = motd;

    const current = $("clanMotdCurrent");
    if (current) current.innerHTML = motd ? `${escapeHtml(motd)} <span class="wikiMuted">— ${escapeHtml(dateFr(clan.motdAt))}</span>` : `<span class="wikiMuted">Aucune annonce.</span>`;
  }

  // Nouvelle annonce depuis la dernière vue (connexion comprise) :
  // notification en jeu, même fenêtre clan fermée.
  function notifyNewMotd() {
    const motd = clan?.motd || "";
    if (motd && clan?.id && Number(clan.motdAt) > 0) {
      let seen = {};
      try { seen = JSON.parse(localStorage.getItem(MOTD_SEEN_KEY) || "{}") || {}; } catch { seen = {}; }
      if (Number(seen[clan.id]) !== Number(clan.motdAt)) {
        seen = { [clan.id]: Number(clan.motdAt) };
        try { localStorage.setItem(MOTD_SEEN_KEY, JSON.stringify(seen)); } catch {}
        engineNotify(`[${clan.tag}] Annonce : ${motd}`, 7, "info");
      }
    }
  }

  function setTab(tab) {
    activeTab = tab;
    for (const button of manageNav.querySelectorAll("[data-clan-tab]")) button.classList.toggle("active", button.dataset.clanTab === tab);
    for (const page of managePane.querySelectorAll("[data-clan-pane]")) page.classList.toggle("active", page.dataset.clanPane === tab);
    if (tab === "ranking") loadRanking();
    if (tab === "bases") loadBases(true);
  }

  function setBrowseTab(tab) {
    browseTab = tab;
    for (const b of browseNav.querySelectorAll("[data-browse-tab]")) b.classList.toggle("active", b.dataset.browseTab === tab);
    for (const page of createPane.querySelectorAll("[data-browse-pane]")) page.classList.toggle("active", page.dataset.browsePane === tab);
    if (tab === "ranking") loadRanking();
  }

  function render() {
    if (!shouldRefreshWindow("clanWindow")) return;
    const inClan = !!clan;
    createPane.hidden = inClan;
    managePane.hidden = !inClan;
    browseNav.hidden = inClan;
    manageNav.hidden = !inClan;
    renderTop();
    renderMotd();
    renderRanking();
    if (!inClan) { renderBrowse(); return; }
    const rights = myRights(), leader = isLeader();
    for (const el of managePane.querySelectorAll("[data-needs-right]")) {
      el.hidden = rights[el.dataset.needsRight] !== true;
    }
    // Onglet Rangs réservé au chef.
    const ranksTab = manageNav.querySelector('[data-clan-tab="ranks"]');
    if (ranksTab) ranksTab.hidden = !leader;
    if (!leader && activeTab === "ranks") setTab("infos");
    const rankForm = $("clanRankCreateForm")?.closest(".wikiCard");
    if (rankForm) rankForm.hidden = !leader;
    const descCurrent = $("clanDescCurrent");
    if (descCurrent) descCurrent.innerHTML = clan.description ? escapeHtml(clan.description) : `<span class="wikiMuted">Aucune description.</span>`;
    renderInfos(rights);
    renderMembers(rights, leader);
    renderBank(rights);
    renderNews();
    renderBases();
    renderRanks(leader);
    renderDiploClans(rights);
    renderLog();
  }

  function renderBrowse() {
    if (!allList) return;
    const applied = appliedTags();
    allList.innerHTML = table(
      ["Tag", "Clan", "Chef", NUM("Membres"), "Recrutement", NUM("Classement"), "Description", ACT],
      clans.map((c) => {
        const isApplied = applied.has(String(c.tag || "").toUpperCase());
        const full = Number(c.memberCount) >= MAX_MEMBERS;
        const closed = c.open === false;
        const pos = ranking.find((row) => String(row.tag || "").toUpperCase() === String(c.tag || "").toUpperCase())?.position;
        const button = isApplied
          ? `<button type="button" data-act="cancel" title="Retirer ma candidature">Retirer</button>`
          : `<button class="clanPrimary" type="button" data-act="apply"${(full || closed) ? " disabled" : ""}>${full ? "Plein" : (closed ? "Fermé" : "Postuler")}</button>`;
        return {
          attrs: `data-clan-tag="${escapeHtml(c.tag || "")}"`,
          cells: [
            `<b class="clanTag">[${escapeHtml(c.tag || "?")}]</b>`,
            `<b>${escapeHtml(c.name || "Clan")}</b>${isApplied ? ` <span class="clanPending">· candidature envoyée</span>` : ""}`,
            escapeHtml(c.leader || "?"),
            `${Number(c.memberCount) || 0}/${MAX_MEMBERS}`,
            closed ? `<span class="clanNo">Fermé</span>` : `<span class="clanYes">Ouvert</span>`,
            pos ? `<b class="wikiGold">#${pos}</b>` : "—",
            `<span class="clanDesc">${escapeHtml(c.description || "—")}</span>`,
            button,
          ],
        };
      }),
      { cls: "clanTable", empty: "Aucun clan pour l'instant — fonde le premier depuis « Créer un clan »." },
    );
  }

  // Tableau clé / valeur (fiche, chiffres).
  function keyValues(rows) {
    return `<div class="wikiTableWrap"><table class="wikiTable clanKv"><tbody>${rows.map(([k, v]) => `<tr><td>${escapeHtml(k)}</td><td>${v}</td></tr>`).join("")}</tbody></table></div>`;
  }

  function renderInfos(rights) {
    if (infoBox) {
      const chief = clan.members.find((m) => String(m.role) === "leader");
      infoBox.innerHTML = keyValues([
        ["Tag", `<b class="clanTag">[${escapeHtml(clan.tag)}]</b>`],
        ["Nom", `<b>${escapeHtml(clan.name)}</b>`],
        ["Chef", escapeHtml(chief?.pseudo || "?")],
        ["Membres", `${clan.members.length}/${MAX_MEMBERS}`],
        ["Fondé le", clan.createdAt ? escapeHtml(dateFr(clan.createdAt)) : "—"],
        ["Recrutement", `${clan.open === false ? `<span class="clanNo">Fermé</span>` : `<span class="clanYes">Ouvert</span>`}`
          + (rights.edit ? ` <button type="button" class="clanSmall" data-act="toggle-open">${clan.open === false ? "Ouvrir" : "Fermer"}</button>` : "")],
      ]);
    }
    if (statTiles) {
      const sum = (key) => clan.members.reduce((total, m) => total + Math.max(0, Number(m[key]) || 0), 0);
      const pos = myClanRanking();
      statTiles.innerHTML = keyValues([
        ["Classement", pos ? `<b class="wikiGold">#${pos.position}</b>` : "—"],
        ["Points de grade", `<b class="wikiGold">${escapeHtml(formatInteger(sum("rankPoints")))}</b>`],
        ["Honneur", escapeHtml(formatInteger(sum("honor")))],
        ["Kills NPC", escapeHtml(formatInteger(sum("npcKills")))],
        ["Kills PvP", escapeHtml(formatInteger(sum("pvpKills")))],
        ["En ligne", `<span class="clanOnline">${clan.members.filter((m) => m.online).length}</span> / ${clan.members.length}`],
      ]);
    }
  }

  function sortedMembers() {
    const mode = $("clanMemberSort")?.value || "rank";
    const roleOrder = (m) => m.role === "leader" ? 0 : m.role === "officer" ? 1 : m.role === "member" ? 3 : 2;
    const by = {
      rank: (a, b) => b.rankPoints - a.rankPoints,
      honor: (a, b) => b.honor - a.honor,
      npc: (a, b) => b.npcKills - a.npcKills,
      pvp: (a, b) => b.pvpKills - a.pvpKills,
      online: (a, b) => Number(b.online) - Number(a.online) || b.lastSeen - a.lastSeen,
      role: (a, b) => roleOrder(a) - roleOrder(b),
      joined: (a, b) => a.joinedAt - b.joinedAt,
    }[mode] || ((a, b) => b.rankPoints - a.rankPoints);
    return [...clan.members].sort((a, b) => by(a, b) || String(a.pseudo).localeCompare(String(b.pseudo), "fr"));
  }

  function renderMembers(rights, leader) {
    const apps = Array.isArray(clan.applications) ? clan.applications : [];
    const badge = $("clanAppsBadge");
    if (badge) badge.textContent = rights.apps && apps.length ? String(apps.length) : "";
    if (appsBlock && appsList) {
      appsBlock.hidden = !(rights.apps && apps.length);
      appsList.innerHTML = rights.apps ? table(["Pilote", "Postulé", ACT], apps.map((a) => ({
        attrs: `data-pseudo="${escapeHtml(a.pseudo || "Pilote")}"`,
        cells: [
          `<b>${escapeHtml(a.pseudo || "Pilote")}</b>`,
          escapeHtml(ago(a.at)),
          `<span class="clanBtns"><button class="clanPrimary" type="button" data-act="accept" title="Accepter">${ICON_ACCEPT}</button><button class="danger" type="button" data-act="decline" title="Refuser">${ICON_REMOVE}</button></span>`,
        ],
      })), { cls: "clanTable" }) : "";
    }
    const onlineCount = $("clanOnlineCount");
    if (onlineCount) onlineCount.innerHTML = `<span class="clanOnline">${clan.members.filter((m) => m.online).length} en ligne</span> sur ${clan.members.length}`;
    if (!list) return;
    const rankNames = (Array.isArray(clan.ranks) ? clan.ranks : []).map((x) => x.name).filter((n) => n && n.toLowerCase() !== "chef" && n.toLowerCase() !== "leader");
    let myId = "";
    try { myId = String(netMyId() || ""); } catch { myId = ""; }
    list.innerHTML = table(
      ["", "Pilote", "Rang", NUM("Points"), NUM("Honneur"), NUM("NPC"), NUM("PvP"), "Membre depuis", "Où / vu", ACT],
      sortedMembers().map((member) => {
        const pseudo = escapeHtml(member.pseudo || "Pilote");
        const role = roleLabel(member);
        const targetIsLeader = String(member.role) === "leader";
        const isMe = myId === `u_${String(member.id || "")}`;
        const kickable = rights.kick && !targetIsLeader && (rights.isLeader || String(member.role) === "member" || String(member.role).toLowerCase() === "membre");
        const actions = (kickable ? `<button class="danger" type="button" data-act="kick" title="Exclure du clan" aria-label="Exclure du clan">${ICON_REMOVE}</button>` : "")
          + (leader && !targetIsLeader ? `<button type="button" data-act="transfer" title="Transférer la chefferie" aria-label="Transférer la chefferie">${ICON_TRANSFER}</button>` : "")
          + (leader && targetIsLeader ? `<button class="danger" type="button" data-act="dissolve" title="Dissoudre le clan" aria-label="Dissoudre le clan">${ICON_TRASH}</button>` : "")
          + (isMe ? `<button type="button" data-act="leave" title="Quitter le clan" aria-label="Quitter le clan">${ICON_EXIT}</button>` : "");
        const grade = getRankInfo(Number(member.rankPoints) || 0, Number(member.honor) || 0);
        const roleCell = leader && !targetIsLeader && rankNames.length
          ? `<select data-assign="${pseudo}" title="Rang" aria-label="Rang de ${pseudo}">${rankNames.map((n) => `<option value="${escapeHtml(n)}"${String(n).toLowerCase() === String(member.role).toLowerCase() || String(n).toLowerCase() === role.toLowerCase() ? " selected" : ""}>${escapeHtml(n)}</option>`).join("")}</select>`
          : escapeHtml(role);
        return {
          cls: `${member.online ? "isOnline" : ""}${isMe ? " isMe" : ""}`,
          attrs: `data-pseudo="${pseudo}"`,
          cells: [
            `<img class="wikiIco wikiIcoRank" src="${escapeHtml(grade.imagePath)}" alt="" title="${escapeHtml(grade.name)}" draggable="false">`,
            `<b>${pseudo}</b>${targetIsLeader ? CROWN_SVG : ""}`,
            roleCell,
            `<span class="wikiGold">${escapeHtml(formatInteger(member.rankPoints))}</span>`,
            escapeHtml(formatInteger(member.honor)),
            escapeHtml(formatInteger(member.npcKills)),
            escapeHtml(formatInteger(member.pvpKills)),
            member.joinedAt ? `<span title="${escapeHtml(ago(member.joinedAt))}">${escapeHtml(dateFr(member.joinedAt))}</span>` : "—",
            member.online ? `<span class="clanOnline">${escapeHtml(String(member.map || "En ligne").toUpperCase())}</span>` : `<span class="wikiMuted">${escapeHtml(ago(member.lastSeen))}</span>`,
            actions ? `<span class="clanBtns">${actions}</span>` : "",
          ],
        };
      }),
      { cls: "clanTable clanMembersTable" },
    );
  }

  function renderBank(rights) {
    const balance = $("clanBankBalance");
    if (balance) balance.textContent = formatInteger(clan.bank || 0);
    const target = $("clanBankTarget");
    if (target && rights.bank) {
      const keep = target.value;
      const html = clan.members.map((m) => `<option value="${escapeHtml(m.pseudo)}">${escapeHtml(m.pseudo)} — max ${escapeHtml(compact(m.bankAllowance))}</option>`).join("");
      if (target.dataset.html !== html) {
        target.dataset.html = html;
        target.innerHTML = html;
        if (keep && clan.members.some((m) => m.pseudo === keep)) target.value = keep;
      }
    }
    const quota = $("clanBankQuota");
    if (quota && rights.bank) {
      quota.innerHTML = table(["Membre", "Dans le clan depuis", NUM("Déjà reçu"), NUM("Disponible"), "Prochain +50 M"], [...clan.members]
        .sort((a, b) => b.bankAllowance - a.bankAllowance)
        .map((m) => ({
          cells: [
            `<b>${escapeHtml(m.pseudo)}</b>`,
            m.joinedAt ? `${escapeHtml(dateFr(m.joinedAt))} <small class="wikiMuted">(${escapeHtml(ago(m.joinedAt).replace("il y a ", ""))})</small>` : "—",
            escapeHtml(formatInteger(m.bankReceived || 0)),
            `<b class="${m.bankAllowance > 0 ? "wikiGold" : "wikiMuted"}">${escapeHtml(formatInteger(m.bankAllowance || 0))}</b>`,
            m.bankNextAt ? `<span class="wikiMuted">dans ${escapeHtml(left(m.bankNextAt))}</span>` : "—",
          ],
        })), { cls: "clanTable" });
    }
    const log = $("clanBankLog");
    if (!log) return;
    const rows = Array.isArray(clan.bankLog) ? clan.bankLog : [];
    log.innerHTML = table(["Quand", "Opération", "Par", "Bénéficiaire", NUM("Montant")], rows.map((row) => {
      const out = row.kind === "withdraw";
      return {
        cells: [
          `<span class="wikiMuted">${escapeHtml(ago(row.at))}</span>`,
          out ? "Distribution" : "Dépôt",
          escapeHtml(row.pseudo),
          out ? escapeHtml(row.target || "?") : `<span class="wikiMuted">Banque</span>`,
          `<b class="${out ? "clanNo" : "clanYes"}">${out ? "−" : "+"}${escapeHtml(formatInteger(row.amount))}</b>`,
        ],
      };
    }), { cls: "clanTable", empty: "Aucun mouvement." });
  }

  // Classement : même tableau que le wiki (en-têtes collants, lignes zébrées).
  function renderRanking() {
    const mineTag = String(clan?.tag || "").toUpperCase();
    for (const box of document.querySelectorAll("#clanWindow [data-clan-ranking]")) {
      const body = !ranking.length
        ? `<div class="clanEmpty">${rankingAt ? "Aucun clan classé." : "Chargement…"}</div>`
        : table(["#", "Clan", NUM("Membres"), NUM("Points de grade"), NUM("Honneur"), NUM("Kills NPC"), NUM("Kills PvP")], ranking.map((row) => {
          const me = mineTag && String(row.tag || "").toUpperCase() === mineTag;
          return {
            cls: `${me ? "clanRankMine" : ""}${row.position <= 3 ? ` clanRankTop${row.position}` : ""}`,
            cells: [
              `<b class="clanRankPos">${row.position}</b>`,
              `<b class="clanTag">[${escapeHtml(row.tag)}]</b> ${escapeHtml(row.name)}`,
              String(row.members),
              `<span class="wikiGold">${escapeHtml(formatInteger(row.rankPoints))}</span>`,
              escapeHtml(formatInteger(row.honor)),
              escapeHtml(formatInteger(row.npcKills)),
              escapeHtml(formatInteger(row.pvpKills)),
            ],
          };
        }), { cls: "clanTable" });
      box.innerHTML = `<div class="wikiCardTitle">Classement des clans</div>${body}`
        + `<p class="wikiNote">Classé par points de grade cumulés des membres, puis par honneur. Mis à jour toutes les 30 s.</p>`;
    }
  }

  function renderNews() {
    const box = $("clanNewsList");
    if (!box) return;
    const rows = Array.isArray(clan?.announcements) ? clan.announcements : [];
    box.innerHTML = table(["Date", "Auteur", "Annonce"], rows.map((row, index) => ({
      cls: index === 0 && clan.motd && row.text === clan.motd ? "clanRankMine" : "",
      cells: [
        `<span class="wikiMuted">${escapeHtml(dateFr(row.at))}</span><br><small class="wikiMuted">${escapeHtml(ago(row.at))}</small>`,
        `<b>${escapeHtml(row.pseudo)}</b>`,
        `<span class="clanText">${escapeHtml(row.text)}</span>`,
      ],
    })), { cls: "clanTable clanNewsTable", empty: "Aucune annonce publiée." });
  }

  // --- Bases de Combat ---
  function pct(hp, max) {
    const value = max > 0 ? Math.max(0, Math.min(100, Math.round((Number(hp) || 0) / max * 100))) : 0;
    const cls = value >= 70 ? "clanYes" : value >= 30 ? "wikiGold" : "clanNo";
    return `<span class="clanBar"><i class="${cls}" style="width:${value}%"></i></span><b class="${cls}">${value} %</b>`;
  }
  function firmName(id) {
    try { return id ? getFaction(id)?.shortName || String(id).toUpperCase() : "—"; } catch { return "—"; }
  }
  function mapName(id) { return String(id || "").toUpperCase(); }
  function deflectText(d) {
    if (!d) return `<span class="wikiMuted">—</span>`;
    const now = Date.now();
    if (d.active && Number(d.until) > now) return `<b class="clanYes">Bouclier actif</b> <span class="wikiMuted">· ${escapeHtml(left(d.until))}</span>`;
    if (Number(d.disabledUntil) > now) return `<b class="clanNo">Coupé</b> <span class="wikiMuted">· ${escapeHtml(left(d.disabledUntil))}</span>`;
    const charge = Math.max(0, Math.min(100, Math.round((Number(d.bank) || 0) / STATION_DEFLECT_COST * 100)));
    return `Charge <b class="wikiGold">${charge} %</b>`;
  }
  function left(until) {
    const sec = Math.max(0, Math.round((Number(until) - Date.now()) / 1000));
    const m = Math.floor(sec / 60), h = Math.floor(m / 60);
    return h > 0 ? `${h} h ${m % 60} min` : m > 0 ? `${m} min` : `${sec} s`;
  }
  function moduleEffect(resourceId, dmgBoost) {
    const weapon = STATION_WEAPON_STATS[resourceId];
    if (weapon) {
      const dmg = Math.round(weapon.dmg * (dmgBoost ? 1.1 : 1));
      return `${escapeHtml(formatInteger(dmg))} dégâts / ${weapon.periodMs / 1000} s · portée ${weapon.range}`;
    }
    const bonus = BASE_BONUSES.find((b) => b.module === resourceId);
    if (bonus) return `+${bonus.per} % ${bonus.label.toLowerCase()} (clan)${bonus.key === "dmg" ? " · +10 % armes de la base" : ""}`;
    return "";
  }
  const check = (on) => on ? `<b class="clanYes">✓</b>` : `<span class="wikiMuted">—</span>`;

  function renderBases() {
    const bonusBox = $("clanBasesBonus"), mineBox = $("clanBasesMine"), detail = $("clanBasesDetail");
    const buildCard = $("clanBasesBuildingCard"), buildBox = $("clanBasesBuilding");
    if (!bonusBox || !mineBox || !detail) return;
    if (!bases) {
      for (const box of [bonusBox, mineBox]) box.innerHTML = `<div class="clanEmpty">Chargement…</div>`;
      detail.innerHTML = "";
      return;
    }
    const own = Array.isArray(bases.mine) ? bases.mine : [];
    bonusBox.innerHTML = table(
      ["Bonus", NUM("Par base"), NUM("Bases"), NUM("Cumul"), NUM("Plafond"), NUM("Appliqué")],
      BASE_BONUSES.map((b) => {
        const count = own.filter((base) => base.bonus?.[b.key]).length;
        const raw = count * b.per;
        const applied = Math.min(b.cap, raw);
        return {
          cells: [
            `<b>${b.label}</b>`, `+${b.per} %`, String(count), `+${raw} %`, `${b.cap} %`,
            `<b class="${applied > 0 ? "wikiGold" : "wikiMuted"}">+${applied} %</b>${raw > b.cap ? ` <small class="wikiMuted">(plafonné)</small>` : ""}`,
          ],
        };
      }),
      { cls: "clanTable" },
    );
    mineBox.innerHTML = table(
      ["Map", "Firme", "Cœur", "Déflecteur", NUM("Modules actifs"), { label: "DMG", cls: "chk" }, { label: "HON", cls: "chk" }, { label: "EXP", cls: "chk" }, { label: "REP", cls: "chk" }, "Tenue depuis"],
      own.map((base) => ({
        cells: [
          `<b class="clanTag">${escapeHtml(mapName(base.map))}</b>${base.repairing ? ` <small class="wikiGold">réparation</small>` : ""}`,
          escapeHtml(firmName(base.firm)),
          base.hub ? pct(base.hub.hp, base.hub.hpMax) : `<span class="wikiMuted">—</span>`,
          deflectText(base.deflect),
          `${base.modules.filter((m) => m.state === "active").length} / ${base.modules.length}`,
          check(base.bonus?.dmg), check(base.bonus?.hon), check(base.bonus?.exp), check(base.bonus?.rep),
          base.builtAt ? `<span class="wikiMuted">${escapeHtml(ago(base.builtAt).replace("il y a ", ""))}</span>` : "—",
        ],
      })),
      { cls: "clanTable", empty: "Le clan ne tient aucune base. Pose un Cœur de base sur une Base de Combat libre (achat en boutique)." },
    );
    detail.innerHTML = own.map((base) => {
      const dmgBoost = !!base.bonus?.dmg;
      const free = base.modules.filter((m) => !m.resourceId).length;
      return `<section class="wikiCard"><div class="wikiCardTitle">Base ${escapeHtml(mapName(base.map))} — modules</div>`
        + table(["#", "Module", "État", "Coque", "Effet"], base.modules.filter((m) => m.resourceId).map((m) => {
          const [label, cls] = MODULE_STATE[m.state] || MODULE_STATE.empty;
          const name = m.resourceId ? BASE_MODULES[m.resourceId] || m.resourceId : `<span class="wikiMuted">Emplacement vide</span>`;
          const until = m.until ? ` <small class="wikiMuted">${escapeHtml(left(m.until))}</small>` : "";
          const next = m.next ? ` <small class="wikiGold">→ ${escapeHtml(BASE_MODULES[m.next] || m.next)}</small>` : "";
          return {
            cells: [
              String(m.slot),
              `<b>${name}</b>${next}${m.by ? `<br><small class="wikiMuted">posé par ${escapeHtml(m.by)}</small>` : ""}`,
              `<span class="${cls}">${label}</span>${until}`,
              m.resourceId ? pct(m.hp, m.hpMax) : "",
              m.resourceId ? `<small>${moduleEffect(m.resourceId, dmgBoost)}</small>` : "",
            ],
          };
        }), { cls: "clanTable clanModulesTable", empty: "Aucun module posé autour du cœur." })
        + (free ? `<p class="wikiNote">${free} emplacement${free > 1 ? "s" : ""} libre${free > 1 ? "s" : ""} sur ${base.modules.length}.</p>` : "")
        + `</section>`;
    }).join("");
    const building = Array.isArray(bases.building) ? bases.building : [];
    if (buildCard) buildCard.hidden = !building.length;
    if (buildBox) {
      buildBox.innerHTML = table(["Map", "Progression", "Cœur posé", "Base tenue par"], building.map((b) => ({
        cells: [
          `<b class="clanTag">${escapeHtml(mapName(b.map))}</b>`,
          `${pct(b.completed, b.total)} <span class="wikiMuted">${b.completed}/${b.total} pièces</span>`,
          check(b.hub),
          b.contestedBy ? `<b class="clanNo">[${escapeHtml(b.contestedBy)}]</b>` : `<span class="wikiMuted">Libre</span>`,
        ],
      })), { cls: "clanTable" });
    }
  }

  let basesLoading = false, basesAt = 0;
  async function loadBases(force = false) {
    if (basesLoading || !clan || (!force && Date.now() - basesAt < 4000)) return;
    basesLoading = true;
    try {
      const data = await apiClan("/api/clans/bases", "GET");
      bases = { mine: data.mine || [], building: data.building || [] };
      basesAt = Date.now();
      renderBases();
    } catch (error) {
      if (!bases) fail(error, "Bases indisponibles.");
    } finally { basesLoading = false; }
  }

  function renderRanks(leader) {
    if (!ranksList) return;
    const ranks = Array.isArray(clan.ranks) ? clan.ranks : [];
    ranksList.innerHTML = table(["Rang", ...RIGHT_LABELS.map(([, label]) => ({ label, cls: "chk" })), ACT], ranks.map((rk) => {
      const bits = Number(rk.rights) || 0;
      const locked = rk.builtin === "leader" || !leader;
      return {
        attrs: `data-rank="${escapeHtml(rk.name)}"`,
        cells: [
          `<b>${escapeHtml(rk.name)}</b>${rk.builtin === "leader" ? CROWN_SVG : ""}`,
          ...RIGHT_LABELS.map(([bit, label]) => `<input type="checkbox" class="clanCheck" data-right="${bit}" aria-label="${label}"${(bits & bit) ? " checked" : ""}${locked ? " disabled" : ""} />`),
          leader && !rk.builtin ? `<span class="clanBtns"><button class="danger" type="button" data-act="rank-del" title="Supprimer" aria-label="Supprimer">${ICON_REMOVE}</button></span>` : "",
        ],
      };
    }), { cls: "clanTable clanRanksTable" });
  }

  function relsFor(tag) {
    const clean = String(tag || "").toUpperCase();
    const own = String(clan?.tag || "").toUpperCase();
    if (!clean || clean === own) return { active: null, incoming: null, outgoing: null };
    const find = (rows) => rows.find((x) => String(x.otherTag || "").toUpperCase() === clean) || null;
    return { active: find(rels.active), incoming: find(rels.incoming), outgoing: find(rels.outgoing) };
  }

  // Onglet Diplomatie : TOUS les clans du jeu. La guerre est immédiate
  // (pas de demande) ; NAP/Alliance = proposition à accepter.
  // Paix en guerre = DEMANDE (pending war) : la guerre ne se termine que
  // si l'autre clan accepte (jamais en 1 clic). La demande coexiste avec
  // la guerre active, donc on affiche les deux états ensemble.
  function renderDiploClans(rights) {
    if (!diploClans) return;
    const others = clans.filter((c) => String(c.tag || "").toUpperCase() !== String(clan?.tag || "").toUpperCase());
    diploClans.innerHTML = table(["Tag", "Clan", NUM("Membres"), "Relation", ACT], others.map((c) => {
      const tag = escapeHtml(c.tag || "?");
      const st = relsFor(c.tag);
      let state = `<span class="wikiMuted">Neutre</span>`;
      let buttons = "";
      if (st.active && st.active.kind === "war") {
        state = `<b class="clanNo">Guerre ${Number(st.active.killsMine) || 0}–${Number(st.active.killsTheirs) || 0}</b> <span class="wikiMuted">· ${st.active.daysLeft ?? "?"} j restants</span>`;
        const peaceIn = st.incoming && st.incoming.kind === "war" ? st.incoming : null;
        const peaceOut = st.outgoing && st.outgoing.kind === "war" ? st.outgoing : null;
        if (peaceIn) state += ` · <b class="wikiGold">paix proposée</b>`;
        else if (peaceOut) state += ` · <span class="wikiGold">paix demandée</span>`;
        if (peaceIn) {
          buttons = `<button class="clanPrimary" type="button" data-act="diplo-accept" data-rel="${escapeHtml(peaceIn.id)}" title="Accepter la paix (termine la guerre)">${ICON_ACCEPT}</button><button class="danger" type="button" data-act="diplo-decline" data-rel="${escapeHtml(peaceIn.id)}" title="Refuser la paix">${ICON_REMOVE}</button>`;
        } else if (peaceOut) {
          buttons = `<button type="button" data-act="diplo-end" data-rel="${escapeHtml(peaceOut.id)}" title="Retirer ma demande de paix">Retirer</button>`;
        } else if (rights.diplo) {
          buttons = `<button class="danger" type="button" data-act="diplo-end" data-rel="${escapeHtml(st.active.id)}" title="Demander la paix (l'autre clan doit accepter)">Paix</button>`;
        }
      } else if (st.active) {
        state = `<b class="${st.active.kind === "alliance" ? "clanYes" : "wikiGold"}">${DIPLO_LABEL[st.active.kind] || st.active.kind}</b>`;
        buttons = rights.diplo ? `<button class="danger" type="button" data-act="diplo-end" data-rel="${escapeHtml(st.active.id)}" title="Rompre">Rompre</button>` : "";
      } else if (st.incoming) {
        state = `<b class="wikiGold">${DIPLO_LABEL[st.incoming.kind] || st.incoming.kind} proposée</b>`;
        buttons = `<button class="clanPrimary" type="button" data-act="diplo-accept" data-rel="${escapeHtml(st.incoming.id)}" title="Accepter">${ICON_ACCEPT}</button><button class="danger" type="button" data-act="diplo-decline" data-rel="${escapeHtml(st.incoming.id)}" title="Refuser">${ICON_REMOVE}</button>`;
      } else if (st.outgoing) {
        state = `<span class="wikiGold">${DIPLO_LABEL[st.outgoing.kind] || st.outgoing.kind} envoyée — en attente</span>`;
        buttons = `<button type="button" data-act="diplo-end" data-rel="${escapeHtml(st.outgoing.id)}" title="Retirer">Retirer</button>`;
      } else if (rights.diplo) {
        buttons = `<button class="danger" type="button" data-act="war-now" data-tag="${tag}" title="Déclarer la guerre (immédiat)">Guerre</button>`
          + `<button type="button" data-act="diplo-propose" data-kind="nap" data-tag="${tag}" title="Proposer un NAP">NAP</button>`
          + `<button type="button" data-act="diplo-propose" data-kind="alliance" data-tag="${tag}" title="Proposer une alliance">Alliance</button>`;
      }
      return {
        cells: [
          `<b class="clanTag">[${tag}]</b>`,
          escapeHtml(c.name || "Clan"),
          String(Number(c.memberCount) || 0),
          state,
          buttons ? `<span class="clanBtns">${buttons}</span>` : "",
        ],
      };
    }), { cls: "clanTable", empty: "Aucun autre clan." });
  }

  function renderLog() {
    if (!logList) return;
    const entries = Array.isArray(clan?.log) ? clan.log : [];
    logList.innerHTML = table(["Quand", "Événement"], entries.map((e) => ({
      cells: [`<span class="wikiMuted">${escapeHtml(ago(e.at))}</span>`, escapeHtml(e.text)],
    })), { cls: "clanTable clanLogTable", empty: "Aucun événement." });
  }

  let rankingLoading = false;
  async function loadRanking(force = false) {
    if (rankingLoading || (!force && Date.now() - rankingAt < 30000)) return;
    rankingLoading = true;
    try {
      const data = await apiClan("/api/clans/ranking", "GET");
      ranking = Array.isArray(data.ranking) ? data.ranking : [];
      rankingAt = Date.now();
      renderTop();
      renderRanking();
      if (clan) renderInfos(myRights());
    } catch {} finally { rankingLoading = false; }
  }

  let loading = false;
  async function load(message = "", tone = "ok") {
    // Rafraîchi toutes les 5 s : garde anti-chevauchement (finally),
    // les champs de saisie ne sont jamais réécrits (seules les listes).
    if (loading) return;
    loading = true;
    try {
      if (!authHeaders()) {
        clan = null; clans = []; mine = []; rels = { active: [], incoming: [], outgoing: [] };
        updateHeader("Connecte-toi pour gérer ton clan.", "error");
      } else {
        try {
          const [meData, listData, mineData] = await Promise.all([
            apiClan("/api/clans/me", "GET"),
            shouldRefreshWindow("clanWindow") ? apiClan("/api/clans/list", "GET").catch(() => ({ clans })) : { clans },
            shouldRefreshWindow("clanWindow") ? apiClan("/api/clans/my-applications", "GET").catch(() => ({ applications: mine })) : { applications: mine },
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
          notifyNewMotd();
          if (clan && activeTab === "bases" && shouldRefreshWindow("clanWindow")) loadBases();
          if (message) updateHeader(message, tone);
          if (shouldRefreshWindow("clanWindow")) loadRanking();
        } catch { updateHeader("Hors ligne — serveur injoignable", "error"); }
      }
      render();
    } finally {
      loading = false;
    }
  }

  function poll() {
    try {
      if (consumeClanDirty()) { load(); return; }
    } catch {}
  }

  manageNav.addEventListener("click", (event) => {
    const button = event.target.closest("[data-clan-tab]");
    if (button) setTab(button.dataset.clanTab);
  });
  browseNav.addEventListener("click", (event) => {
    const button = event.target.closest("[data-browse-tab]");
    if (button) setBrowseTab(button.dataset.browseTab);
  });
  $("clanMemberSort")?.addEventListener("change", () => { if (clan) renderMembers(myRights(), isLeader()); });
  $("clanCreateForm")?.addEventListener("submit", async (event) => {
    event.preventDefault(); event.stopPropagation();
    const name = $("clanNameInput")?.value || "";
    const tag = $("clanTagInput")?.value || "";
    const description = $("clanDescCreateInput")?.value.trim() || "";
    if (!name.trim() || !tag.trim()) { updateHeader("Nom et tag obligatoires.", "error"); return; }
    try {
      const data = await apiClan("/api/clans", "POST", { name, tag, description });
      clan = data.clan || null;
      try { sendClanNotify(); } catch {}
      setTab("infos");
      await load(clan ? `Clan [${clan.tag}] ${clan.name} créé. Parle avec /c message.` : "");
    } catch (error) { fail(error, "Création impossible."); }
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
    } catch (error) { fail(error, "Candidature impossible."); render(); }
  });
  // Délégation globale du panneau (infos / membres / rangs / diplo).
  // Anti double-clic : un seul appel diplo à la fois (évite de devoir
  // cliquer plusieurs fois / les requêtes en double qui semblaient "buggées").
  let diploBusy = false;
  managePane.addEventListener("click", async (event) => {
    const quick = event.target.closest("button[data-quick]");
    if (quick) {
      const input = $(quick.closest("[data-quick-target]")?.dataset.quickTarget || "");
      if (input) { input.value = formatInteger(Number(quick.dataset.quick) || 0); input.focus(); }
      return;
    }
    const button = event.target.closest("button[data-act]");
    if (!button || !clan || button.disabled) return;
    const act = button.dataset.act;
    const row = button.closest("[data-pseudo]");
    const rankRow = button.closest("[data-rank]");
    const relId = button.dataset.rel || button.closest("[data-rel]")?.dataset.rel || "";
    if ((act === "diplo-accept" || act === "diplo-decline" || act === "diplo-end" || act === "war-now" || act === "diplo-propose") && diploBusy) return;
    try {
      if (act === "toggle-open") {
        await apiClan("/api/clans/open", "POST", { open: clan.open === false });
        try { sendClanNotify(); } catch {}
        await load();
      } else if (act === "leave") {
        if (!clan || !await confirmClanDialog("Quitter le clan", `Quitter le clan [${clan.tag}] ${clan.name} ?`)) return;
        try { sendClanNotify(); } catch {}
        try { await apiClan("/api/clans/leave", "POST", {}); } catch {}
        clan = null;
        try { const { sendClanRefresh } = await import("../SRC/CORE/NETPLAY.js"); sendClanRefresh(); } catch {}
        await load();
      } else if (act === "dissolve") {
        const bankNote = clan.bank > 0 ? ` Les ${formatInteger(clan.bank)} crédits de la banque te reviennent.` : "";
        if (!await confirmClanDialog("Dissoudre le clan", `Dissoudre le clan [${clan.tag}] ${clan.name} ? Tous les membres seront exclus.${bankNote}`)) return;
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
        if (!await confirmClanDialog("Exclure un membre", `Exclure ${pseudo} du clan ?`)) return;
        try { await apiClan("/api/clans/kick", "POST", { pseudo }); } catch {}
        try { sendClanNotify(pseudo); } catch {}
        await load();
      } else if (act === "transfer" && row) {
        const pseudo = row.dataset.pseudo || "";
        if (!await confirmClanDialog("Transférer la chefferie", `Transférer le chef à ${pseudo} ? Tu deviendras simple membre.`)) return;
        try { await apiClan("/api/clans/transfer", "POST", { pseudo }); } catch {}
        try { sendClanNotify(pseudo); } catch {}
        await load();
      } else if (act === "rank-del" && rankRow) {
        if (!await confirmClanDialog("Supprimer le rang", `Supprimer le rang ${rankRow.dataset.rank} ?`)) return;
        await apiClan("/api/clans/rank-manage", "POST", { action: "delete", name: rankRow.dataset.rank });
        try { sendClanNotify(); } catch {}
        await load();
      } else if (act === "diplo-accept" && relId) {
        diploBusy = true; button.disabled = true;
        try {
          const r = await apiClan("/api/clans/diplo/respond", "POST", { id: relId, accept: true });
          try { sendDiploNotify(null, ""); } catch {}
          await load(r?.ended ? "Paix acceptée — guerre terminée." : "Proposition acceptée.");
        } finally { diploBusy = false; }
      } else if (act === "diplo-decline" && relId) {
        diploBusy = true; button.disabled = true;
        try {
          await apiClan("/api/clans/diplo/respond", "POST", { id: relId, accept: false });
          try { sendDiploNotify(null, ""); } catch {}
          await load("Demande refusée.");
        } finally { diploBusy = false; }
      } else if (act === "diplo-end" && relId) {
        diploBusy = true; button.disabled = true;
        try {
          const r = await apiClan("/api/clans/diplo/end", "POST", { id: relId });
          try { sendDiploNotify(null, ""); } catch {}
          if (r?.requested) await load("Demande de paix envoyée — l'autre clan doit accepter.");
          else if (r?.retracted) await load("Demande de paix retirée.");
          else if (r?.ended) await load("Relation terminée.");
          else await load();
        } finally { diploBusy = false; }
      } else if (act === "war-now" && button.dataset.tag) {
        const tag = button.dataset.tag;
        if (!(await confirmClanWar(tag))) return;
        diploBusy = true; button.disabled = true;
        try {
          const data = await apiClan("/api/clans/diplo", "POST", { tag, kind: "war" });
          try { sendDiploNotify(data.rel?.otherTag || tag, `Guerre déclarée à [${data.rel?.otherTag || tag}] !`); } catch {}
          await load(`Guerre contre [${tag}] !`);
        } finally { diploBusy = false; }
      } else if (act === "diplo-propose" && button.dataset.tag) {
        const tag = button.dataset.tag, kind = button.dataset.kind === "alliance" ? "alliance" : "nap";
        const label = kind === "alliance" ? "Alliance" : "NAP";
        diploBusy = true; button.disabled = true;
        try {
          const data = await apiClan("/api/clans/diplo", "POST", { tag, kind });
          try { sendDiploNotify(data.rel?.otherTag || tag, `${label} proposée à [${data.rel?.otherTag || tag}].`); } catch {}
          await load(`${label} proposée à [${tag}].`);
        } finally { diploBusy = false; }
      }
    } catch (error) { fail(error, "Action impossible."); diploBusy = false; }
  });
  managePane.addEventListener("change", async (event) => {
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
    } catch (error) { fail(error, "Action impossible."); }
  });
  $("clanRankCreateForm")?.addEventListener("submit", async (event) => {
    event.preventDefault(); event.stopPropagation();
    const input = $("clanRankNameInput");
    const value = input?.value.trim();
    if (!value) return;
    try {
      await apiClan("/api/clans/rank-manage", "POST", { action: "create", name: value });
      if (input) input.value = "";
      try { sendClanNotify(); } catch {}
      await load(`Rang ${value} créé.`);
    } catch (error) { fail(error, "Création impossible."); }
  });
  $("clanDescForm")?.addEventListener("submit", async (event) => {
    event.preventDefault(); event.stopPropagation();
    const input = $("clanDescInput");
    try {
      await apiClan("/api/clans/description", "POST", { description: input?.value || "" });
      if (input) input.value = "";
      try { sendClanNotify(); } catch {}
      await load("Description mise à jour.");
    } catch (error) { fail(error, "Description impossible."); }
  });
  async function publishMotd(text) {
    try {
      await apiClan("/api/clans/motd", "POST", { text });
      const input = $("clanMotdInput");
      if (input) input.value = "";
      try { sendClanNotify(); } catch {}
      await load(text ? "Annonce publiée — les membres sont notifiés." : "Annonce retirée.");
    } catch (error) { fail(error, "Annonce impossible."); }
  }
  $("clanMotdForm")?.addEventListener("submit", (event) => {
    event.preventDefault(); event.stopPropagation();
    const text = $("clanMotdInput")?.value.trim() || "";
    if (text) publishMotd(text);
  });
  $("clanMotdClose")?.addEventListener("click", () => {
    if (!clan?.motd) return;
    try {
      const hidden = JSON.parse(localStorage.getItem(MOTD_HIDDEN_KEY) || "{}") || {};
      hidden[clan.id] = Number(clan.motdAt);
      localStorage.setItem(MOTD_HIDDEN_KEY, JSON.stringify(hidden));
    } catch {}
    renderMotd();
  });
  $("clanMotdClear")?.addEventListener("click", async () => {
    if (!clan?.motd) return;
    if (await confirmClanDialog("Retirer l'annonce", "Retirer l'annonce du clan ?")) publishMotd("");
  });

  let bankBusy = false;
  async function bankAction(action, body, done) {
    if (bankBusy) return;
    bankBusy = true;
    try {
      const out = await apiClanBank(action, body);
      if (!out?.ok) { if (!out?.ignored) fail(out?.error, "Opération impossible."); return; }
      try { sendClanNotify(action === "withdraw" ? out.target : undefined); } catch {}
      await load(done(out));
    } finally { bankBusy = false; }
  }
  $("clanBankDepositForm")?.addEventListener("submit", (event) => {
    event.preventDefault(); event.stopPropagation();
    const input = $("clanBankDepositInput");
    const amount = parseAmount(input?.value);
    if (!amount) { updateHeader("Montant invalide (ex. 250000, 1.5M, 2Md).", "error"); return; }
    bankAction("deposit", { amount }, (out) => {
      if (input) input.value = "";
      return `${formatInteger(out.amount)} crédits déposés dans la banque.`;
    });
  });
  $("clanBankWithdrawForm")?.addEventListener("submit", async (event) => {
    event.preventDefault(); event.stopPropagation();
    const input = $("clanBankWithdrawInput");
    const pseudo = $("clanBankTarget")?.value || "";
    const amount = parseAmount(input?.value);
    if (!pseudo || !amount) { updateHeader("Choisis un membre et un montant valide.", "error"); return; }
    const member = clan?.members?.find((m) => m.pseudo === pseudo);
    if (member && amount > Number(member.bankAllowance || 0)) {
      updateHeader(`Plafond atteint : ${pseudo} peut encore recevoir ${formatInteger(member.bankAllowance || 0)} crédits (+50 000 000 par jour passé dans le clan).`, "error");
      return;
    }
    if (!await confirmClanDialog("Distribuer", `Envoyer ${formatInteger(amount)} crédits de la banque à ${pseudo} ?`)) return;
    bankAction("withdraw", { pseudo, amount }, (out) => {
      if (input) input.value = "";
      return `${formatInteger(out.amount)} crédits envoyés à ${out.target}.`;
    });
  });

  $("clanDiploForm")?.addEventListener("submit", async (event) => {
    event.preventDefault(); event.stopPropagation();
    const tag = $("clanDiploTagInput")?.value || "";
    const kind = $("clanDiploKindSelect")?.value || "nap";
    if (!tag) return;
    const label = kind === "war" ? "guerre" : kind === "alliance" ? "alliance" : "NAP";
    if (kind === "war" && !(await confirmClanWar(tag))) return;
    try {
      const data = await apiClan("/api/clans/diplo", "POST", { tag, kind });
      const announce = kind === "war" ? `Guerre déclarée à [${data.rel?.otherTag || tag}] !` : `${label} proposée à [${data.rel?.otherTag || tag}].`;
      try { sendDiploNotify(data.rel?.otherTag || tag, announce); } catch {}
      $("clanDiploTagInput").value = "";
      await load(announce);
    } catch (error) { fail(error, "Diplomatie impossible."); }
  });
  setTab("infos"); setBrowseTab("join"); updateHeader(""); load();
  // Auto-refresh 5 s, mais jamais pendant que la souris est sur la fenêtre
  // (sinon la liste se re-rend sous les doigts : clics ratés, select qui
  // se referme). Les notifs live (poll) rechargent quand même.
  setInterval(() => { try { if (!document.querySelector("#clanWindow:hover")) load(); } catch { load(); } }, 5000);
  setInterval(poll, 1000); poll();
  window.addEventListener("orbit:window-restoring", (event) => { if (event?.detail?.id === "clanWindow") load(); });
}
