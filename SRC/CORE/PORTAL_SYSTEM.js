"use strict";

import { clamp } from "./COLLISION.js";

export function getPortalOpenFade(portal, defaultDuration = 1) {
  if (!portal) return 0;
  if (portal.jumping && Number.isFinite(portal.jumpBaseFade)) return clamp(portal.jumpBaseFade, 0, 1);
  if (portal.closing) {
    const duration = Math.max(0.1, Number(portal.closeDur || defaultDuration));
    const from = Number.isFinite(portal.closeFrom) ? portal.closeFrom : 1;
    return from * (1 - clamp(portal.closeT / duration, 0, 1));
  }
  if (portal.switching) {
    const duration = Math.max(0.1, Number(portal.switchDur || defaultDuration));
    return clamp(portal.switchT / duration, 0, 1);
  }
  return portal.open ? 1 : 0;
}

export function getPortalJumpFade(portal, defaultDuration = 1) {
  if (!portal?.jumping) return 0;
  if (!portal.jumpSwitching) return 1;
  const duration = Math.max(0.1, Number(portal.jumpSwitchDur || defaultDuration));
  return clamp(portal.jumpSwitchT / duration, 0, 1);
}

export function startPortalClosing(portal, defaultDuration = 1) {
  if (!portal || portal.jumping) return;
  const from = getPortalOpenFade(portal, defaultDuration);
  portal.switching = false;
  portal.holding = false;
  portal.open = false;
  portal.switchT = 0;
  portal.holdT = 0;
  portal.closing = from > 0.001;
  portal.closeT = 0;
  portal.closeFrom = from;
  portal.closeDur = Math.max(0.1, Number(portal.closeDur || defaultDuration));
}

export function tickPortalVisualTransitions(portals, dt, defaultDuration = 1) {
  for (const portal of portals || []) {
    if (portal.closing) {
      portal.closeT += dt;
      if (portal.closeT >= Math.max(0.1, Number(portal.closeDur || defaultDuration))) {
        portal.closing = false;
        portal.closeT = 0;
        portal.closeFrom = 0;
        portal.open = false;
      }
    }
    if (portal.jumpSwitching) {
      portal.jumpSwitchT += dt;
      if (portal.jumpSwitchT >= Math.max(0.1, Number(portal.jumpSwitchDur || defaultDuration))) {
        portal.jumpSwitching = false;
        portal.jumpSwitchT = 0;
      }
    }
  }
}

export function updatePortalProximity(portals, dt, options = {}) {
  const isNear = options.isNear || (() => false);
  const switchDuration = Math.max(0.1, Number(options.switchDuration || 1));
  const holdDuration = Math.max(0.1, Number(options.holdDuration || 1.5));
  for (const portal of portals || []) {
    if (portal.jumping) continue;
    const near = !!isNear(portal);
    if (near && !portal.open && !portal.switching && !portal.holding && !portal.closing) {
      portal.switching = true;
      portal.switchT = 0;
    } else if (!near && (portal.open || portal.switching || portal.holding) && !portal.closing) {
      startPortalClosing(portal, switchDuration);
    }
    if (portal.switching) {
      portal.switchT += dt;
      if (portal.switchT >= switchDuration) {
        portal.switching = false;
        portal.open = true;
        portal.holding = true;
        portal.holdT = 0;
      }
    } else if (portal.holding) {
      portal.holdT += dt;
      if (portal.holdT >= holdDuration) portal.holding = false;
    }
  }
}

export function beginGatePortalJump(portal, action, defaultSwitchDuration = 1) {
  if (!portal || portal.jumping) return false;
  portal.gateAction = action;
  portal.jumpBaseFade = Math.max(0, getPortalOpenFade(portal, defaultSwitchDuration));
  portal.jumping = true;
  portal.jumpT = 0;
  portal.jumpDur = Math.max(0.1, Number(portal.jumpDur || 2));
  portal.jumpSwitching = true;
  portal.jumpSwitchT = 0;
  portal.jumpSwitchDur = Math.max(0.1, Number(portal.jumpSwitchDur || defaultSwitchDuration));
  portal.open = true;
  portal.switching = false;
  portal.holding = false;
  portal.closing = false;
  return true;
}

export function tickGatePortalJumps(portals, dt) {
  for (const portal of portals || []) {
    if (!portal.jumping) continue;
    portal.jumpT += dt;
    if (portal.jumpT < Math.max(0.1, Number(portal.jumpDur || 2))) continue;
    portal.jumping = false;
    return { portal, action: portal.gateAction };
  }
  return null;
}
