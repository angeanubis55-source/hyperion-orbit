"use strict";

import { netMyPseudo } from "../SRC/CORE/NETPLAY.js";
import { getRankInfo } from "../SRC/CORE/PROGRESSION.js";
import { getFaction } from "../SRC/CORE/FACTIONS.js";
import { formatInteger } from "../SRC/CORE/NUMBER_FORMAT.js";
import { escapeHtml } from "./UI_DOM.js";

let started = false;

export function initRankingsUI() {
  if (started) return;
  started = true;
  const body = document.getElementById("rankingRows");
  const status = document.getElementById("rankingStatus");
  if (!body) return;

  async function load() {
    try {
      if (status) status.textContent = "Chargement…";
      const res = await fetch("/api/rankings", { cache: "no-store" });
      const out = await res.json().catch(() => ({}));
      if (!out || out.ok !== true || !Array.isArray(out.list)) {
        if (status) status.textContent = "Hors ligne (serveur injoignable)";
        return;
      }
      const me = netMyPseudo();
      body.innerHTML = "";
      if (!out.list.length) {
        body.innerHTML = `<div class="rankingEmpty">Aucun pilote classé pour l'instant.</div>`;
      }
      out.list.forEach((row, i) => {
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
          `<span class="rankingPts">${formatInteger(Number(row.points) || 0)}</span>`;
        body.appendChild(div);
      });
      if (status) {
        const myIdx = out.list.findIndex((row) => me && row.pseudo === me);
        status.textContent = myIdx >= 0 ? `Tu es #${myIdx + 1}` : `${out.list.length} pilote${out.list.length > 1 ? "s" : ""} classé${out.list.length > 1 ? "s" : ""}`;
      }
    } catch {
      if (status) status.textContent = "Hors ligne (serveur injoignable)";
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
        const next = btn.dataset.rankingTab === "npcs" ? "npcs" : "board";
        document.querySelectorAll("#rankingWindow [data-ranking-tab]").forEach((b) => {
          b.classList.toggle("active", b === btn);
        });
        document.querySelectorAll("#rankingWindow [data-ranking-pane]").forEach((pane) => {
          pane.classList.toggle("active", pane.dataset.rankingPane === next);
        });
        if (next === "board") load();
        else try { window.dispatchEvent(new CustomEvent("orbit:ranking-npcs-shown")); } catch {}
      });
    });
  } catch {}
}
