"use strict";

export function createGatePortalState() {
  return {
    active: false,
    x: 0,
    y: 0,
    switching: false,
    switchT: 0,
    open: false,
    holding: false,
    holdT: 0,
    closing: false,
    closeT: 0,
    closeFrom: 0,
    closeDur: 1,
    jumping: false,
    jumpT: 0,
    jumpDur: 2,
    jumpSwitching: false,
    jumpSwitchT: 0,
    jumpSwitchDur: 1,
    jumpBaseFade: 0,
    gateAction: null,
    buttonHovered: false,
    buttonPressed: false,
  };
}

export function resetGatePortalState(portal, { active = false, x = 0, y = 0, switchDuration = 1 } = {}) {
  if (!portal) return portal;
  Object.assign(portal, createGatePortalState(), {
    active: !!active,
    x: Number(x) || 0,
    y: Number(y) || 0,
    closeDur: Math.max(0.1, Number(switchDuration) || 1),
    jumpSwitchDur: Math.max(0.1, Number(switchDuration) || 1),
  });
  return portal;
}

export function positionGateChoicePortals(world, continuePortal, returnPortal, spacing = 840) {
  const centerX = Math.max(0, Number(world?.w) || 0) / 2;
  const centerY = Math.max(0, Number(world?.h) || 0) / 2;
  const halfSpacing = Math.max(100, Number(spacing) || 840) / 2;
  continuePortal.x = centerX - halfSpacing;
  continuePortal.y = centerY;
  returnPortal.x = centerX + halfSpacing;
  returnPortal.y = centerY;
  return { continuePortal, returnPortal };
}

export function getGateReturnMap(mapId, fallback = "1-1") {
  const id = String(mapId || "").toLowerCase();
  if (id === "alpha") return "1-1";
  if (id === "beta") return "2-1";
  if (id === "gamma") return "3-1";
  return String(fallback || "1-1");
}
