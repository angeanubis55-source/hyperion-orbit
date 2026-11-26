"use strict";
import { shouldRefreshWindow } from "../SRC/CORE/BACKGROUND_REFRESH.js";

import { netMyPseudo } from "../SRC/CORE/NETPLAY.js";
import { getRankInfo } from "../SRC/CORE/PROGRESSION.js";
import { getFaction } from "../SRC/CORE/FACTIONS.js";
import { formatInteger } from "../SRC/CORE/NUMBER_FORMAT.js";
import { escapeHtml } from "./UI_DOM.js";
import { WINTER_RANKING_REWARDS, winterRankingPeriod } from "../SRC/CORE/WINTER_CONVOY.js";
import { LEVIATHAN_RANKING_REWARDS, leviathanRankingPeriod } from "../SRC/CORE/LEVIATHAN_GATE.js";

let started = false;

export function initRankingsUI() {
  if (started) return;
  started = true;
  const boards = {
    board: { body: document.getElementById("rankingRows"), status: document.getElementById("rankingStatus") },
    exp: { body: document.getElementById("rankingRowsExp"), status: document.getElementById("rankingStatusExp") },
    honor: { body: document.getElementById("rankingRowsHonor"), status: document.getElementById("rankingStatusHonor") },
    eternal: { body: document.getElementById("rankingRowsEternal"), status: document.getElementById("rankingStatusEternal") },
    winter: { body: document.getElementById("rankingRowsWinter"), status: document.getElementById("rankingStatusWinter") },
    leviathan: { body: document.getElementById("rankingRowsLeviathan"), status: document.getElementById("rankingStatusLeviathan") },
  };
  if (!boards.board.body) return;

  // Classements d'événement (Winter : WINTER_CONVOY.js, Leviathan :
  // LEVIATHAN_GATE.js) : onglet masqué hors de leurs classements, sinon
  // compte à rebours jusqu'à la fin du classement en cours, et « ? » des
  // gains par place (panneau centré sur la fenêtre, survol ou clic).
  const eventTickers = [];
  function setupEventRanking({ tabKey, timerId, helpId, tipId, periodOf, rewards, title, columns }) {
    const timer = document.getElementById(timerId);
    const tab = document.querySelector(`#rankingWindow [data-ranking-tab="${tabKey}"]`);
    const tick = () => {
      const period = periodOf();
      if (tab && (tab.style.display === "none") !== !period) {
        tab.style.display = period ? "" : "none";
        if (!period && tab.classList.contains("active")) {
          document.querySelector('#rankingWindow [data-ranking-tab="board"]')?.click();
        }
      }
      if (!timer || !period) return;
      const left = Math.max(0, Math.floor((period.endAt - Date.now()) / 1000));
      const d = Math.floor(left / 86400), h = Math.floor(left % 86400 / 3600);
      const m = Math.floor(left % 3600 / 60), s = left % 60;
      timer.textContent = `Fin du classement hebdomadaire dans ${d} jour${d > 1 ? "s" : ""} ${h} h ${m} min ${s} s`;
    };
    eventTickers.push(tick);
    const trigger = document.getElementById(helpId);
    const tip = document.getElementById(tipId);
    const win = document.getElementById("rankingWindow");
    const topLayer = typeof tip?.showPopover === "function";
    if (!topLayer) tip?.removeAttribute("popover");
    const place = (n) => (n === 1 ? "1er" : `${n}e`);
    if (tip) {
      tip.innerHTML = `<strong>${escapeHtml(title)}</strong>` +
        `<div class="rankingRewardList">` +
        `<div class="rankingRewardTier rankingRewardHead"><b>Place</b>${columns.map(([, label]) => `<span>${escapeHtml(label)}</span>`).join("")}</div>` +
        // 10e -> dernier : même gain, une seule ligne.
        rewards.slice(0, 10).map((r) =>
          `<div class="rankingRewardTier"><b>${r.rank === 10 ? `${place(10)} → ${place(rewards.length)}` : place(r.rank)}</b>` +
          columns.map(([key]) => `<span>${formatInteger(r[key])}</span>`).join("") + `</div>`).join("") +
        `</div>`;
    }
    const show = () => {
      if (!tip || !win) return;
      const b = win.getBoundingClientRect();
      tip.style.left = `${b.left + b.width / 2}px`;
      tip.style.top = `${b.top + b.height / 2}px`;
      tip.classList.add("is-open");
      if (topLayer && !tip.matches(":popover-open")) tip.showPopover();
      trigger?.setAttribute("aria-expanded", "true");
    };
    const hide = () => {
      if (!tip) return;
      if (topLayer && tip.matches(":popover-open")) tip.hidePopover();
      tip.classList.remove("is-open");
      trigger?.setAttribute("aria-expanded", "false");
    };
    const leave = (event) => {
      if (trigger?.contains(event.relatedTarget) || tip?.contains(event.relatedTarget)) return;
      if (trigger?.matches(":hover") || tip?.matches(":hover")) return;
      hide();
    };
    trigger?.setAttribute("aria-controls", tipId);
    trigger?.setAttribute("aria-expanded", "false");
    trigger?.addEventListener("pointerenter", show);
    trigger?.addEventListener("pointerleave", leave);
    trigger?.addEventListener("click", show);
    tip?.addEventListener("pointerleave", leave);
    document.addEventListener("pointerdown", (event) => {
      if (!trigger?.contains(event.target) && !tip?.contains(event.target)) hide();
    });
    document.addEventListener("keydown", (event) => { if (event.key === "Escape") hide(); });
    window.addEventListener("orbit:window-minimized", (event) => {
      if (event.detail?.id === "rankingWindow") hide();
    });
    document.querySelectorAll("#rankingWindow [data-ranking-tab]").forEach((btn) => btn.addEventListener("click", hide));
  }
  setupEventRanking({
    tabKey: "winter", timerId: "rankingWinterTimer", helpId: "rankingWinterHelp", tipId: "rankingWinterRewards",
    periodOf: () => winterRankingPeriod(), rewards: WINTER_RANKING_REWARDS, title: "Gains du classement Winter",
    columns: [["credits", "Crédits"], ["exp", "XP"], ["honor", "Honneur"], ["ice", "ICE-100"]],
  });
  setupEventRanking({
    tabKey: "leviathan", timerId: "rankingLeviathanTimer", helpId: "rankingLeviathanHelp", tipId: "rankingLeviathanRewards",
    periodOf: () => leviathanRankingPeriod(), rewards: LEVIATHAN_RANKING_REWARDS, title: "Gains du classement Leviathan",
    columns: [["credits", "Crédits"], ["exp", "XP"], ["honor", "Honneur"]],
  });
  const tickEventTimers = () => { for (const tick of eventTickers) { try { tick(); } catch {} } };
  setInterval(tickEventTimers, 1000);

  function renderBoard(kind, list) {
    const target = boards[kind];
    if (!target || !target.body) return;
    const me = netMyPseudo();
    let sorted = [...list];
    let valueOf;
    if (kind === "exp") {
      valueOf = (row) => Number(row.exp) || 0;
      sorted.sort((a, b) => valueOf(b) - valueOf(a));
    } else if (kind === "honor") {
      valueOf = (row) => Number(row.honor) || 0;
      sorted.sort((a, b) => valueOf(b) - valueOf(a));
    } else if (kind === "eternal") {
      // ✅ vagues Eternal terminées (triées côté serveur, seules les >0 sont envoyées).
      valueOf = (row) => Number(row.eternalWaves) || 0;
      sorted = sorted.filter((row) => valueOf(row) > 0);
      sorted.sort((a, b) => valueOf(b) - valueOf(a));
    } else if (kind === "leviathan") {
      // ✅ points Leviathan (triés côté serveur, seuls les >0 sont envoyés).
      valueOf = (row) => Number(row.leviathanPoints) || 0;
      sorted = sorted.filter((row) => valueOf(row) > 0);
      sorted.sort((a, b) => valueOf(b) - valueOf(a));
    } else if (kind === "winter") {
      // ✅ points givrés de la GG d'hiver (triés côté serveur, seuls les >0 sont envoyés).
      valueOf = (row) => Number(row.frostPoints) || 0;
      sorted = sorted.filter((row) => valueOf(row) > 0);
      sorted.sort((a, b) => valueOf(b) - valueOf(a));
    } else {
      valueOf = (row) => Number(row.points) || 0;
      // Déjà trié côté serveur (points), on garde l'ordre reçu.
    }
    target.body.innerHTML = "";
    if (!sorted.length) {
      target.body.innerHTML = `<div class="rankingEmpty">Aucun pilote classé pour l'instant.</div>`;
    }
    sorted.forEach((row, i) => {
      const rank = getRankInfo(Number(row.rankPoints) || 0, Number(row.honor) || 0);
      const faction = getFaction(row.faction);
      const firmCell = faction
        ? `<img class="rankingFirm" src="${escapeHtml(faction.imagePath)}" alt="${escapeHtml(faction.shortName)}" title="${escapeHtml(`${faction.shortName} — ${faction.name}`)}" draggable="false">`
        : `<span class="rankingFirm rankingFirmNone">—</span>`;
      const div = document.createElement("div");
      div.className = "rankingRow" + (me && row.pseudo === me ? " rankingMe" : "");
      div.innerHTML =
        `<span class="rankingPos">${i + 1}</span>` +
        `<img class="rankingGrade" src="${escapeHtml(rank.imagePath)}" alt="${escapeHtml(rank.name)}" title="${escapeHtml(rank.name)}" draggable="false">` +
        firmCell +
        `<span class="rankingName">${escapeHtml(row.pseudo)}</span>` +
        `<span class="rankingPts">${formatInteger(valueOf(row))}</span>`;
      target.body.appendChild(div);
    });
    if (target.status) {
      const myIdx = sorted.findIndex((row) => me && row.pseudo === me);
      target.status.textContent = myIdx >= 0 ? `Tu es #${myIdx + 1}` : `${sorted.length} pilote${sorted.length > 1 ? "s" : ""} classé${sorted.length > 1 ? "s" : ""}`;
    }
  }

  async function load() {
    if (!shouldRefreshWindow("rankingWindow")) return;
    try {
      Object.values(boards).forEach((t) => { if (t.status) t.status.textContent = "Chargement…"; });
      const res = await fetch("/api/rankings", { cache: "no-store" });
      const out = await res.json().catch(() => ({}));
      if (!shouldRefreshWindow("rankingWindow")) return;
      if (!out || out.ok !== true || !Array.isArray(out.list)) {
        Object.values(boards).forEach((t) => { if (t.status) t.status.textContent = "Hors ligne (serveur injoignable)"; });
        return;
      }
      renderBoard("board", out.list);
      renderBoard("exp", out.list);
      renderBoard("honor", out.list);
      renderBoard("eternal", Array.isArray(out.eternal) ? out.eternal : []);
      renderBoard("winter", Array.isArray(out.winter) ? out.winter : []);
      renderBoard("leviathan", Array.isArray(out.leviathan) ? out.leviathan : []);
    } catch {
      if (!shouldRefreshWindow("rankingWindow")) return;
      Object.values(boards).forEach((t) => { if (t.status) t.status.textContent = "Hors ligne (serveur injoignable)"; });
    }
  }

  load();
  setInterval(load, 30000);
  try {
    window.addEventListener("orbit:window-restoring", (e) => {
      if (e?.detail?.id === "rankingWindow") {
        load();
        if (document.querySelector('#rankingWindow [data-ranking-pane="npcs"]')?.classList.contains("active")) {
          try { window.dispatchEvent(new CustomEvent("orbit:ranking-npcs-shown")); } catch {}
        }
      }
    });
  } catch {}

  try {
    document.querySelectorAll('#rankingWindow [data-npc-toggle]').forEach((btn) => {
      btn.addEventListener("click", () => {
        const section = btn.closest("[data-npc-collapse]");
        if (!section) return;
        const collapsed = section.classList.toggle("collapsed");
        btn.setAttribute("aria-expanded", collapsed ? "false" : "true");
      });
    });
  } catch {}

  try {
    document.querySelectorAll("#rankingWindow [data-ranking-tab]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const next = btn.dataset.rankingTab || "board";
        document.querySelectorAll("#rankingWindow [data-ranking-tab]").forEach((b) => {
          b.classList.toggle("active", b === btn);
        });
        document.querySelectorAll("#rankingWindow [data-ranking-pane]").forEach((pane) => {
          pane.classList.toggle("active", pane.dataset.rankingPane === next);
        });
        if (next === "board" || next === "exp" || next === "honor" || next === "eternal" || next === "winter" || next === "leviathan") load();
        else try { window.dispatchEvent(new CustomEvent("orbit:ranking-npcs-shown")); } catch {}
      });
    });
  } catch {}
  tickEventTimers();
}
