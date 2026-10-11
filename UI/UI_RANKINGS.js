"use strict";
import { shouldRefreshWindow } from "../SRC/CORE/BACKGROUND_REFRESH.js";

import { netMyPseudo } from "../SRC/CORE/NETPLAY.js";
import { getRankInfo } from "../SRC/CORE/PROGRESSION.js";
import { getFaction } from "../SRC/CORE/FACTIONS.js";
import { formatInteger } from "../SRC/CORE/NUMBER_FORMAT.js";
import { escapeHtml } from "./UI_DOM.js";

let started = false;

export function initRankingsUI() {
  if (started) return;
  started = true;
  const boards = {
    board: { body: document.getElementById("rankingRows"), status: document.getElementById("rankingStatus") },
    exp: { body: document.getElementById("rankingRowsExp"), status: document.getElementById("rankingStatusExp") },
    honor: { body: document.getElementById("rankingRowsHonor"), status: document.getElementById("rankingStatusHonor") },
  };
  if (!boards.board.body) return;

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
        if (next === "board" || next === "exp" || next === "honor") load();
        else try { window.dispatchEvent(new CustomEvent("orbit:ranking-npcs-shown")); } catch {}
      });
    });
  } catch {}
}
