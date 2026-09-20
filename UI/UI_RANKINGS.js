"use strict";

import { netMyPseudo } from "../SRC/CORE/NETPLAY.js";
import { getRankInfo } from "../SRC/CORE/PROGRESSION.js";
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
        body.innerHTML = `<div class="rankingEmpty">Aucun kill PvP pour l'instant. Sois le premier !</div>`;
      }
      out.list.forEach((row, i) => {
        const rank = getRankInfo(Number(row.rankPoints) || 0, Number(row.honor) || 0);
        const div = document.createElement("div");
        div.className = "rankingRow" + (me && row.pseudo === me ? " rankingMe" : "");
        div.innerHTML =
          `<span class="rankingPos">${i + 1}</span>` +
          `<img class="rankingGrade" src="${escapeHtml(rank.imagePath)}" alt="${escapeHtml(rank.name)}" title="${escapeHtml(rank.name)}" draggable="false">` +
          `<span class="rankingName">${escapeHtml(row.pseudo)}</span>` +
          `<span class="rankingNum">${formatInteger(Number(row.kills) || 0)}</span>` +
          `<span class="rankingNum">${formatInteger(Number(row.xp) || 0)}</span>` +
          `<span class="rankingNum">${formatInteger(Number(row.honneur) || 0)}</span>` +
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
    window.addEventListener("orbit:window-restored", (e) => {
      if (e?.detail?.id === "rankingWindow") load();
    });
  } catch {}
}
