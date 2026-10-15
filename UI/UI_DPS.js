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
    rows: $("dpsCalcRows"),
    totalMult: $("dpsTotalMultTxt"),
    perVolley: $("dpsPerVolleyTxt"),
  };
  return el;
}

let calcSignature = "";

const FACTOR_CLASS = ["dpsFBase", "dpsF1", "dpsF2", "dpsF3", "dpsF4", "dpsF5"];

function formatFactor(value) {
  return `×${Number(value).toFixed(2).replace(".", ",")}`;
}

function renderCalcRows(ui, breakdown) {
  if (!ui.rows) return;
  const rows = breakdown.rows || [];
  const signature = JSON.stringify(rows.map((row) => [row.label, row.factor, row.detail]));
  if (signature === calcSignature) return;
  calcSignature = signature;
  ui.rows.innerHTML = "";
  rows.forEach((row, index) => {
    const cls = row.cls || FACTOR_CLASS[Math.min(index, FACTOR_CLASS.length - 1)];
    const line = document.createElement("div");
    line.className = "row";
    const key = document.createElement("span");
    key.className = `k ${cls}`;
    key.textContent = row.label;
    const value = document.createElement("span");
    value.className = `v ${cls}`;
    value.textContent = row.detail || (row.factor !== 1 ? formatFactor(row.factor) : "0");
    line.append(key, value);
    ui.rows.append(line);
  });
}

export function updateDpsHud(snapshot, breakdown) {
  if (!shouldRefreshWindow("dpsWindow")) return;
  const ui = els();
  if (!ui.live) return;
  const snap = snapshot || { dps: 0, plusGros: 0, total: 0 };
  setText(ui.live, formatInteger(Math.round(Number(snap.dps) || 0)));
  setText(ui.max, formatInteger(Math.round(Number(snap.plusGros) || 0)));
  setText(ui.total, formatInteger(Math.round(Number(snap.total) || 0)));
  setText(ui.last, formatInteger(Math.round(Number(snap.last) || 0)));
  if (breakdown) {
    renderCalcRows(ui, breakdown);
    setText(ui.totalMult, formatFactor(breakdown.totalMult || 1));
    setText(ui.perVolley, formatInteger(Math.round(Number(breakdown.perVolley) || 0)));
  }
}

export function resetDpsHudCache() {
  lastText.clear();
  calcSignature = "";
  if (el?.rows) el.rows.innerHTML = "";
}
