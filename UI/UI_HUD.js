"use strict";

import { clamp } from "../SRC/CORE/COLLISION.js";
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

const lastWidth = new Map();
const lastDisplay = new Map();

const setWidth = (element, width) => {
  if (!element) return;
  if (lastWidth.get(element) === width) return;
  lastWidth.set(element, width);
  element.style.width = width;
};

const setDisplay = (element, display) => {
  if (!element) return;
  if (lastDisplay.get(element) === display) return;
  lastDisplay.set(element, display);
  element.style.display = display;
};

export function updateResourceHud(ui, player) {
  const hp = Math.floor(Number(player.hp) || 0);
  const shield = Math.floor(Number(player.sh) || 0);
  const hpMax = Math.floor(Number(player.hpMax) || 0);
  const shieldMax = Math.floor(Number(player.shMax) || 0);
  setText(ui.hpTxt, `${formatInteger(hp)} / ${formatInteger(hpMax)}`);
  setText(ui.shTxt, `${formatInteger(shield)} / ${formatInteger(shieldMax)}`);
  setWidth(ui.hpBar, `${clamp(player.hpMax ? player.hp / player.hpMax * 100 : 0, 0, 100)}%`);
  const shieldWidth = `${clamp(shieldMax ? player.sh / shieldMax * 100 : 0, 0, 100)}%`;
  setWidth(ui.shBar, shieldWidth);
  if (ui.shBar?.parentElement) setDisplay(ui.shBar.parentElement, shieldMax > 0 ? "" : "none");
}

export function updateProgressHud(ui, stats, levelInfo) {
  setText(ui.honorTxt, formatInteger(stats?.honor));
  setText(ui.xpTxt, formatInteger(stats?.exp));
  setText(ui.rankPtsTxt, formatInteger(stats?.rankPoints));
  setText(ui.lvlTxt, `${levelInfo.level} (${levelInfo.pct}%)`);
}

export function updateWaveHud(ui, { started, wave, remaining, alive }) {
  setText(ui.waveTxt, started ? formatInteger(wave) : "—");
  setText(ui.spawnLeftTxt, started ? formatInteger(remaining) : "—");
  setText(ui.aliveTxt, started ? formatInteger(alive) : "—");
}

export function shouldShowNpcBars(entity, selectedEntity) {
  return !!entity && (entity === selectedEntity || entity._healthRevealed === true);
}
