"use strict";

import { clamp } from "./collision.js";
import { formatInteger } from "./numberFormat.js";

const setText = (element, value) => {
  if (element) element.textContent = String(value);
};

export function updateResourceHud(ui, player) {
  const hp = Math.max(0, Math.floor(Number(player.hp) || 0));
  const shield = Math.max(0, Math.floor(Number(player.sh) || 0));
  const hpMax = Math.max(0, Number(player.hpMax) || 0);
  const shieldMax = Math.max(0, Number(player.shMax) || 0);
  setText(ui.hpTxt, `${formatInteger(hp)} / ${formatInteger(hpMax)}`);
  setText(ui.shTxt, `${formatInteger(shield)} / ${formatInteger(shieldMax)}`);
  if (ui.hpBar) ui.hpBar.style.width = `${clamp(hpMax ? player.hp / hpMax * 100 : 0, 0, 100)}%`;
  if (ui.shBar) ui.shBar.style.width = `${clamp(shieldMax ? player.sh / shieldMax * 100 : 0, 0, 100)}%`;
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
