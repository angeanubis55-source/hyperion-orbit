"use strict";

// UI/UI_TARGET.js — Fenêtre "Cible" : nom du NPC sélectionné en haut (NPC
// uniquement, filtré par le moteur),
// puis Coque et Bouclier (valeur / max) comme nos propres barres.
// Mise à jour depuis la boucle HUD (ORBIT_ENGINE) quand la fenêtre est ouverte.

import { formatInteger } from "../SRC/CORE/NUMBER_FORMAT.js";

let els = null;
const last = new Map();

function getEls() {
  if (els?.root?.isConnected) return els;
  const root = document.getElementById("targetWindow");
  if (!root) return null;
  els = {
    root,
    name: document.getElementById("targetNameTxt"),
    hpTxt: document.getElementById("targetHpTxt"),
    shTxt: document.getElementById("targetShTxt"),
    hpBar: document.getElementById("targetHpBar"),
    shBar: document.getElementById("targetShBar"),
  };
  return els;
}

function setText(el, text) {
  if (!el || last.get(el) === text) return;
  last.set(el, text);
  el.textContent = text;
}

function setWidth(el, pct) {
  const w = `${Math.max(0, Math.min(100, pct))}%`;
  if (!el || last.get(el) === w) return;
  last.set(el, w);
  el.style.width = w;
}

// target : entité verrouillée (NPC ou joueur réseau) ou null.
// name : nom déjà résolu par le moteur.
export function updateTargetHud(target, name) {
  const e = getEls();
  if (!e) return;
  const alive = !!target && Number(target.hp) > 0;
  const hp = alive ? Math.max(0, Math.floor(Number(target.hp) || 0)) : 0;
  const hpMax = alive ? Math.max(0, Math.floor(Number(target.hpMax) || 0)) : 0;
  const sh = alive ? Math.max(0, Math.floor(Number(target.sh) || 0)) : 0;
  const shMax = alive ? Math.max(0, Math.floor(Number(target.shMax) || 0)) : 0;
  setText(e.name, alive ? String(name || "—") : "Aucune cible");
  e.root.classList.toggle("noTarget", !alive);
  setText(e.hpTxt, `${formatInteger(hp)} / ${formatInteger(hpMax)}`);
  setText(e.shTxt, `${formatInteger(sh)} / ${formatInteger(shMax)}`);
  setWidth(e.hpBar, hpMax ? hp / hpMax * 100 : 0);
  setWidth(e.shBar, shMax ? sh / shMax * 100 : 0);
}
