"use strict";

import { shouldRefreshWindow } from "../SRC/CORE/BACKGROUND_REFRESH.js";

import { formatInteger } from "../SRC/CORE/NUMBER_FORMAT.js";

const lastText = new Map();

const setText = (element, value) => {
  if (!element) return;
  const text = String(value);
  const previous = lastText.get(element);
  if (previous === text) return;
  lastText.set(element, text);
  element.textContent = text;
};

let el = null;

function els() {
  if (el) return el;
  const $ = (id) => document.getElementById(id);
  el = {
    live: $("dpsLiveTxt"),
    max: $("dpsMaxTxt"),
    total: $("dpsTotalTxt"),
    last: $("dpsLastTxt"),
    table: $("dpsCalcBody"),
    estNpc: $("dpsEstNpcTxt"),
    estPvp: $("dpsEstPvpTxt"),
  };
  return el;
}

let calcSignature = {};

function formatFactor(value) {
  return `×${Number(value).toFixed(2).replace(".", ",")}`;
}

function renderCalcRows(ui, breakdown) {
  if (!breakdown) return;
  renderCalcTable(ui.table, breakdown.rows);
}

function renderCalcTable(tbodyEl, rows) {
  if (!tbodyEl) return;
  const list = Array.isArray(rows) ? rows : [];
  const signature = JSON.stringify(list.map((row) => [row.label, row.npc, row.pvp]));
  if (signature === calcSignature.table) return;
  calcSignature.table = signature;
  tbodyEl.innerHTML = "";
  for (const row of list) {
    const cls = row.cls || "";
    const tr = document.createElement("tr");
    const tdLabel = document.createElement("td");
    tdLabel.className = `k ${cls}`;
    tdLabel.textContent = row.label;
    const tdNpc = document.createElement("td");
    tdNpc.className = `v ${cls}`;
    tdNpc.textContent = row.npc == null ? "—" : row.npc;
    if (row.npc == null) tdNpc.classList.add("dpsEmpty");
    const tdSep = document.createElement("td");
    tdSep.className = "dpsColSep";
    const tdPvp = document.createElement("td");
    tdPvp.className = `v ${cls}`;
    tdPvp.textContent = row.pvp == null ? "—" : row.pvp;
    if (row.pvp == null) tdPvp.classList.add("dpsEmpty");
    tr.append(tdLabel, tdNpc, tdSep, tdPvp);
    tbodyEl.appendChild(tr);
  }
}

export function updateDpsHud(snapshot, breakdown) {
  if (!shouldRefreshWindow("dpsWindow")) return;
  const ui = els();
  if (!ui.last && !ui.live) return;
  const snap = snapshot || { dps: 0, plusGros: 0, total: 0 };
  setText(ui.live, formatInteger(Math.round(Number(snap.dps) || 0)));
  setText(ui.max, formatInteger(Math.round(Number(snap.plusGros) || 0)));
  setText(ui.total, formatInteger(Math.round(Number(snap.total) || 0)));
  setText(ui.last, formatInteger(Math.round(Number(snap.last) || 0)));
  if (breakdown) {
    renderCalcRows(ui, breakdown);
    setText(ui.estNpc, formatInteger(Math.round(Number(breakdown.npc?.perVolley) || 0)));
    setText(ui.estPvp, formatInteger(Math.round(Number(breakdown.pvp?.perVolley) || 0)));
  }
}

export function resetDpsHudCache() {
  lastText.clear();
  calcSignature = {};
  if (el?.table) el.table.innerHTML = "";
}
