"use strict";

import { clamp } from "../SRC/CORE/COLLISION.js";
import { hpHueColor } from "../SRC/CORE/RENDERING.js";

export function drawToastMessage(context, toast, viewportWidth, viewportHeight) {
  if (!context || !toast) return;
  const progress = toast.dur === Infinity ? 0 : clamp(toast.t / toast.dur, 0, 1);
  let alpha = toast.fixed ? clamp(toast.alpha ?? 0, 0, 1) : 1 - progress;
  const y = viewportHeight * 0.35 + (1 - progress) * 8;
  const isSafe = toast.fixed && (toast.text === "Zone de Non-Agression" || toast.text === "Vous êtes en zone de radiations");
  if (toast.pulse) {
    const puls = 0.55 + 0.45 * Math.sin(performance.now() / 1000 * Math.PI * 2 * 0.6);
    alpha *= puls;
  }
  context.save();
  context.globalAlpha = alpha;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.font = isSafe ? "900 22px ui-sans-serif, system-ui" : "1000 44px ui-sans-serif, system-ui";
  context.lineWidth = 0;
  context.strokeStyle = "rgba(5,8,20,0.85)";
  context.strokeText(toast.text, viewportWidth / 2, y);
  context.fillStyle = "rgba(215,226,255,0.95)";
  context.fillText(toast.text, viewportWidth / 2, y);
  context.restore();
}

export function drawMoveTargetMarker(context, target, offsetX, offsetY) {
  if (!context || !target?.active) return;
  const x = target.x + offsetX;
  const y = target.y + offsetY;
  context.save();
  context.globalAlpha = 0.9;
  context.strokeStyle = "rgba(124,240,255,0.75)";
  context.lineWidth = 2;
  context.beginPath();
  context.arc(x, y, 16, 0, Math.PI * 2);
  context.stroke();
  context.globalAlpha = 0.7;
  context.beginPath();
  context.moveTo(x - 10, y);
  context.lineTo(x + 10, y);
  context.moveTo(x, y - 10);
  context.lineTo(x, y + 10);
  context.stroke();
  context.restore();
}

export function drawTargetLock(context, entity, image, sprite, offsetX, offsetY, time) {
  if (!context || !entity || entity.hp <= 0 || !image || !sprite) return;
  const x = entity.x + offsetX;
  const y = entity.y + offsetY + (sprite.yOff || 0);
  context.save();
  context.globalAlpha = 0.95;
  context.imageSmoothingEnabled = false;
  context.drawImage(image, x - sprite.w / 2, y - sprite.h / 2, sprite.w, sprite.h);
  context.restore();
}

export function drawPlayerStatus(context, player, playerName, x, y, rankImage = null, factionImage = null, droneIndicators = [], droneFormationImage = null, moduleIndicators = [], adminTag = false, showDetails = true, nameColor = "rgba(255,255,255,0.95)") {
  if (!context || !player || player.dead) return;
  const width = 120;
  const height = 4;
  const barX = x - width / 2;
  const barY = y - player.r - 72;
  const hpPercent = clamp(player.hp / player.hpMax, 0, 1);
  const shieldPercent = player.shMax > 0 ? clamp(player.sh / player.shMax, 0, 1) : 0;
  context.save();
  if (showDetails) {
  context.globalAlpha = 0.95;
  context.fillStyle = "rgba(0,0,0,0.45)";
  context.fillRect(barX, barY, width, height);
  context.fillStyle = hpHueColor(hpPercent, 0.98);
  context.fillRect(barX, barY, width * hpPercent, height);
  context.strokeStyle = "rgba(255,255,255,0.22)";
  context.lineWidth = 1.5;
  context.strokeRect(barX - 0.5, barY - 0.5, width + 1, height + 1);
  const indicatorSize = 4;
  const indicatorGap = 2;
  const indicatorY = barY - 5 - indicatorSize;
  if (droneFormationImage?.complete && droneFormationImage.naturalWidth > 0) {
      const formationWidth = 40;
      const formationHeight = 40;
      context.imageSmoothingEnabled = true;
      context.drawImage(
        droneFormationImage,
        barX - 10 - formationWidth,
        barY + height / 2 - formationHeight / 2 - 3,
        formationWidth,
        formationHeight,
      );
  }
  if (Array.isArray(droneIndicators) && droneIndicators.length) {
    droneIndicators.forEach((color, index) => {
      context.fillStyle = color;
      context.fillRect(barX + index * (indicatorSize + indicatorGap), indicatorY, indicatorSize, indicatorSize);
    });
  }
  if (Array.isArray(moduleIndicators) && moduleIndicators.length) {
    moduleIndicators.forEach((color, index) => {
      context.fillStyle = color;
      context.fillRect(barX + width - indicatorSize - index * (indicatorSize + indicatorGap), indicatorY, indicatorSize, indicatorSize);
    });
  }
  if (player.shMax > 0) {
    const shieldY = barY + height;
    context.fillStyle = "rgba(0,0,0,0.45)";
    context.fillRect(barX, shieldY, width, height);
    context.fillStyle = "rgba(124,240,255,0.90)";
    context.fillRect(barX, shieldY, width * shieldPercent, height);
    context.strokeStyle = "rgba(255,255,255,0.22)";
    context.strokeRect(barX - 0.5, shieldY - 0.5, width + 1, height + 1);
  }
  }
  context.font = "900 16px ui-sans-serif, system-ui";
  context.textAlign = "center";
  context.textBaseline = "top";
  const displayName = playerName || "Pilote";
  const nameY = y + player.r + 90;
  // Vaisseau Police : anonymat — ni pseudo ni firme. Tag [ADMIN] arc-en-ciel
  // (balayage animé de gauche à droite) + grade admin, centrés.
  if (adminTag === true) {
    const adminText = "[ADMIN]";
    context.font = "900 16px ui-sans-serif, system-ui";
    const tagW = context.measureText(adminText).width;
    const startX = x - tagW / 2;
    const sweep = (performance.now() / 1000 * 180) % 360;
    let ax = startX;
    const prevAlign = context.textAlign;
    context.textAlign = "left";
    for (let i = 0; i < adminText.length; i++) {
      context.fillStyle = `hsl(${(sweep + i * 38) % 360},100%,62%)`;
      context.fillText(adminText[i], ax, nameY);
      ax += context.measureText(adminText[i]).width;
    }
    context.textAlign = prevAlign;
    if (rankImage?.complete && rankImage.naturalWidth > 0) {
      context.drawImage(
        rankImage,
        startX - rankImage.naturalWidth - 5,
        nameY,
        rankImage.naturalWidth,
        rankImage.naturalHeight,
      );
    }
    context.restore();
    return;
  }
  const textWidth = context.measureText(displayName).width;
  context.fillStyle = nameColor;
  context.fillText(displayName, x, nameY);
  context.imageSmoothingEnabled = false;
  if (rankImage?.complete && rankImage.naturalWidth > 0) {
    context.drawImage(
      rankImage,
      x - textWidth / 2 - rankImage.naturalWidth - 5,
      nameY,
      rankImage.naturalWidth,
      rankImage.naturalHeight,
    );
  }
  if (factionImage?.complete && factionImage.naturalWidth > 0) {
    context.drawImage(
      factionImage,
      x + textWidth / 2 + 5,
      nameY,
      factionImage.naturalWidth,
      factionImage.naturalHeight,
    );
  }
  context.restore();
}

export function drawNpcStatus(context, npc, label, showBars) {
  if (!context || !npc || npc.hp <= 0) return;
  if (showBars) {
    const hpPercent = clamp(npc.hp / npc.hpMax, 0, 1);
    const width = npc.r * 2.6;
    const height = 4;
    const x = -width / 2;
    const y = -npc.r - 35 - height;
    if ((npc.shMax || 0) > 0) {
      const shieldPercent = clamp(npc.sh / npc.shMax, 0, 1);
      context.save();
      context.globalAlpha = 0.95;
      context.fillStyle = "rgba(0,0,0,0.45)";
      context.fillRect(x, y + height, width, height);
      context.fillStyle = "rgba(124,240,255,0.90)";
      context.fillRect(x, y + height, width * shieldPercent, height);
      context.strokeStyle = "rgba(255,255,255,0.22)";
      context.lineWidth = 1;
      context.strokeRect(x - 0.5, y + height - 0.5, width + 1, height + 1);
      context.restore();
    }
    context.save();
    context.globalAlpha = 0.95;
    context.fillStyle = "rgba(0,0,0,0.45)";
    context.fillRect(x, y, width, height);
    context.fillStyle = hpHueColor(hpPercent, 0.98);
    context.fillRect(x, y, width * hpPercent, height);
    context.strokeStyle = "rgba(255,255,255,0.22)";
    context.lineWidth = 1.5;
    context.strokeRect(x - 0.5, y - 0.5, width + 1, height + 1);
    context.restore();
  }
  context.save();
  context.globalAlpha = 0.98;
  context.font = "900 13px ui-sans-serif, system-ui";
  context.textAlign = "center";
  context.textBaseline = "top";
  context.fillStyle = "rgba(255,59,78,0.95)";
  context.fillText(label, 0, npc.r + 35);
  context.restore();
}
