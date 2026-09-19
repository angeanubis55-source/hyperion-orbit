"use strict";

// UI/UI_PILOT_SKILLS.js — Arbre de pilotage façon DarkOrbit : 3 panneaux,
// 25 talents, points via disques de log, reset payant.
// Reçoit ses accès moteur par initPilotSkillsUI() (pas de cycle d'import).

import {
  LOGDISK_PACK,
  LOGDISK_PRICE,
  LOGDISK_ROWS,
  PILOT_MAX_POINTS,
  PILOT_SKILLS,
  canInvestPilotSkill,
  formatPilotEffect,
  getPilotSkill,
  normalizePilotSkills,
  pilotPointsAvailable,
  pilotPointsSpent,
  pilotResetCost,
} from "../SRC/DATA/PILOT_SKILLS.js";
import { formatInteger } from "../SRC/CORE/NUMBER_FORMAT.js";
import {
  buyLogDiskPack,
  exchangeLogDisksForPoint,
  investPilotSkill,
  resetPilotSkills,
} from "../SRC/CORE/ACCOUNT.js";

let ctx = null;
let selectedId = "shiphull01";

const PILOT_STRIP = "/ASSETS/SKILLTREE_TEXTURE.png";
// Ordre comme l'officiel : bleu en haut, violet au milieu, rouge en bas.
const PILOT_BRANCHES = ["Coque & systèmes", "Chasse", "Assaut"];

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

function els() {
  return {
    root: document.getElementById("pilotWindow"),
    points: document.getElementById("pilotPoints"),
    disks: document.getElementById("pilotDisks"),
    buyBtn: document.getElementById("pilotBuyDisks"),
    exchangeBtn: document.getElementById("pilotExchange"),
    resetBtn: document.getElementById("pilotReset"),
    panels: document.getElementById("pilotPanels"),
    detail: document.getElementById("pilotDetail"),
  };
}

function livePilot() {
  let user = null;
  try {
    user = ctx?.getUser?.();
  } catch {
    return null;
  }
  if (!user) return null;
  user.pilotSkills = normalizePilotSkills(user.pilotSkills);
  return user.pilotSkills;
}

function reqText(skill, state) {
  const parts = [];
  for (const r of skill.req || []) {
    if (r.type === "pp") {
      const need = getPilotSkill(r.skill);
      const lvl = Math.max(0, Math.floor(Number(state?.spent?.[r.skill]) || 0));
      const ok = lvl >= Math.max(0, Number(r.points) || 0);
      parts.push(`${escapeHtml(String(r.points))} PP en ${escapeHtml(need ? need.name : r.skill)}${ok ? "" : " (manquant)"}`);
    } else if (r.type === "anyPP") {
      let sum = 0;
      const names = [];
      for (const sid of r.skills || []) {
        sum += Math.max(0, Math.floor(Number(state?.spent?.[sid]) || 0));
        const need = getPilotSkill(sid);
        names.push(need ? need.name : sid);
      }
      const ok = sum >= Math.max(0, Number(r.points) || 0);
      parts.push(`${escapeHtml(String(r.points))} PP dans ${escapeHtml(names.join(" / "))}${ok ? "" : " (manquant)"}`);
    }
  }
  return parts;
}

export function renderPilotSkillsWindow() {
  const { root, points, disks, buyBtn, exchangeBtn, resetBtn, panels, detail } = els();
  const availEl = document.getElementById("pilotAvail");
  const leftEl = document.getElementById("pilotLeft");
  if (!root || !panels) return;
  let user = null;
  try {
    user = ctx?.getUser?.();
  } catch {
    user = null;
  }
  const state = livePilot();
  if (!state) return;
  if (!getPilotSkill(selectedId)) selectedId = "shiphull01";

  const spent = pilotPointsSpent(state);
  const availPts = pilotPointsAvailable(state);
  const total = Math.max(0, Math.floor(Number(state.points) || 0));
  const diskCount = Math.max(0, Math.floor(Number(state.disks) || 0));
  const nextNeed = total < PILOT_MAX_POINTS ? LOGDISK_ROWS[total] : null;
  const resetCost = pilotResetCost(state.resets);

  // En-tête : possédés/max · disponibles · emplacements restants · disques.
  const leftCount = Math.max(0, PILOT_MAX_POINTS - total);
  if (points) points.textContent = `${total} / ${PILOT_MAX_POINTS} points pilote`;
  if (availEl) {
    availEl.textContent = availPts <= 0
      ? "Aucun point disponible"
      : (availPts === 1 ? "1 point disponible" : `${availPts} points disponibles`);
  }
  if (leftEl) {
    leftEl.textContent = leftCount <= 0
      ? "Arbre complet"
      : (leftCount === 1 ? "1 emplacement restant" : `${leftCount} emplacements restants`);
  }
  if (disks) {
    disks.textContent = nextNeed == null
      ? `${formatInteger(diskCount)} Disques · max atteint`
      : `${formatInteger(diskCount)} / ${formatInteger(nextNeed)} Disques`;
  }
  if (buyBtn) buyBtn.title = `Acheter ${LOGDISK_PACK} disques de log (${formatInteger(LOGDISK_PRICE * LOGDISK_PACK)} crédits)`;
  if (exchangeBtn) exchangeBtn.title = nextNeed == null ? "Maximum atteint" : `Échanger ${formatInteger(nextNeed)} disques contre 1 point`;
  if (resetBtn) resetBtn.title = `Réinitialiser l'arbre (${formatInteger(resetCost)} crédits, ${spent} PP rendus)`;

  const nodeHtml = (s) => {
    const lvl = Math.max(0, Math.floor(Number(state.spent?.[s.id]) || 0));
    const chk = canInvestPilotSkill(state, s.id);
    const cls = lvl >= s.max ? "maxed" : (lvl > 0 ? "partial" : (chk.ok ? "avail" : "locked"));
    return `<button type="button" class="pilotNode ${cls}${selectedId === s.id ? " selected" : ""}" data-pilot-node="${escapeHtml(s.id)}" title="${escapeHtml(s.name)} ${lvl}/${s.max}">`
      + `<span class="pilotIcon"><img src="${PILOT_STRIP}" alt="" loading="lazy" draggable="false" style="--f:${Math.max(0, Math.floor(Number(s.frame) || 0))}"></span>`
      + `<span class="pilotLvl">${lvl}/${s.max}</span></button>`;
  };
  panels.innerHTML = [0, 1, 2].map((p) => {
    // Grille par panneau (cases vides = décor ; colonnes selon les données).
    const at = {};
    let cols = 3;
    for (const s of PILOT_SKILLS) {
      if (s.panel !== p) continue;
      at[`${s.row}:${s.col}`] = nodeHtml(s);
      cols = Math.max(cols, s.col + 1);
    }
    const grid = [];
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < cols; c++) grid.push(at[`${r}:${c}`] || `<span class="pilotEmpty"></span>`);
    }
    return `<section class="pilotBranch" data-branch="${p}"><h4>${escapeHtml(PILOT_BRANCHES[p] || "")}</h4><div class="pilotGrid">${grid.join("")}</div></section>`;
  }).join("");

  if (detail) {
    const skill = getPilotSkill(selectedId);
    if (!skill) {
      detail.innerHTML = "";
    } else {
      const lvl = Math.max(0, Math.floor(Number(state.spent?.[skill.id]) || 0));
      const chk = canInvestPilotSkill(state, skill.id);
      let html = `<b>${escapeHtml(skill.name)} — ${lvl}/${skill.max}</b>`
        + `<small>${escapeHtml(skill.desc)}</small>`;
      if (lvl > 0) html += `<small>Actuel : ${escapeHtml(formatPilotEffect(skill.levels[lvl - 1]?.effect || {}))}</small>`;
      if (lvl < skill.max) {
        const cost = skill.levels[lvl];
        html += `<small class="pilotCost">Niveau suivant : ${escapeHtml(formatPilotEffect(cost?.effect || {}))} — 1 PP</small>`;
        const reqs = reqText(skill, state);
        if (reqs.length) html += `<small>Requis : ${reqs.join(" · ")}</small>`;
        const reason = chk.ok ? "" : ` (${escapeHtml(chk.reason || "")})`;
        html += `<button type="button" data-pilot-invest="${escapeHtml(skill.id)}"${chk.ok ? "" : " disabled"}>Investir${reason}</button>`;
      } else {
        html += `<small>Niveau maximum atteint.</small>`;
      }
      detail.innerHTML = html;
    }
  }
}

function onPilotClick(event) {
  const el = event.target instanceof Element ? event.target : null;
  if (!el) return;
  const node = el.closest("[data-pilot-node]");
  if (node) {
    selectedId = node.dataset.pilotNode || selectedId;
    try { renderPilotSkillsWindow(); } catch {}
    return;
  }
  const invest = el.closest("[data-pilot-invest]");
  if (invest && !invest.disabled) {
    const res = investPilotSkill(invest.dataset.pilotInvest);
    if (!res?.ok) {
      ctx?.toast?.(res?.error || "Impossible.", 2.2);
      return;
    }
    ctx?.afterAction?.();
    try { renderPilotSkillsWindow(); } catch {}
    ctx?.toast?.(`${getPilotSkill(invest.dataset.pilotInvest)?.name || "Talent"} : niveau ${res.level}.`, 1.8);
    return;
  }
  if (el.closest("#pilotBuyDisks")) {
    const res = buyLogDiskPack();
    if (!res?.ok) {
      ctx?.toast?.(res?.error || "Impossible.", 2.2);
      return;
    }
    ctx?.afterAction?.();
    try { renderPilotSkillsWindow(); } catch {}
    ctx?.toast?.(`+${LOGDISK_PACK} disques de log.`, 1.8);
    return;
  }
  if (el.closest("#pilotExchange")) {
    const res = exchangeLogDisksForPoint();
    if (!res?.ok) {
      ctx?.toast?.(res?.error || "Impossible.", 2.2);
      return;
    }
    ctx?.afterAction?.();
    try { renderPilotSkillsWindow(); } catch {}
    ctx?.toast?.(`+1 point pilote (${res.points} / ${PILOT_MAX_POINTS}).`, 1.8);
    return;
  }
  if (el.closest("#pilotReset")) {
    const res = resetPilotSkills();
    if (!res?.ok) {
      ctx?.toast?.(res?.error || "Impossible.", 2.2);
      return;
    }
    ctx?.afterAction?.();
    try { renderPilotSkillsWindow(); } catch {}
    ctx?.toast?.("Arbre réinitialisé, points rendus.", 1.8);
  }
}

let lastPilotRefresh = 0;

// Boucle (appelée par le moteur) : rattrape un contenu jamais rendu
// (ex : refresh page alors que la fenêtre était ouverte, compte pas
// encore chargé à l'init). Ne re-rend que si les nœuds manquent.
export function tickPilotSkillsDisplay() {
  if (!ctx) return;
  const now = Date.now();
  if (now - lastPilotRefresh < 2000) return;
  lastPilotRefresh = now;
  let root = null;
  let panels = null;
  try {
    root = document.getElementById("pilotWindow");
    panels = document.getElementById("pilotPanels");
  } catch {
    return;
  }
  if (!root || !panels) return;
  if (root.style.display === "none" || root.classList.contains("gameWinMinimized")) return;
  try {
    if (!panels.querySelector("[data-pilot-node]")) renderPilotSkillsWindow();
  } catch {}
}

export function initPilotSkillsUI(context) {
  ctx = context;
  const { root } = els();
  if (!root || root.__pilotWired) return;
  root.__pilotWired = true;
  root.addEventListener("click", onPilotClick);
  window.addEventListener("orbit:window-restored", (event) => {
    if (event.detail?.id === "pilotWindow") {
      try { renderPilotSkillsWindow(); } catch {}
    }
  });
  try { renderPilotSkillsWindow(); } catch {}
}
