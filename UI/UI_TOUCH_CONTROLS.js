"use strict";

// UI_TOUCH_CONTROLS.js — Controles telephone uniquement (jamais sur PC).
// - body.phone-layout : tactile grossier + petit ecran (telephone, pas tablette).
// - Joystick gauche (origine dynamique) : deplacement via window.__TouchStick.
// - Cluster droit : TIR (toggle attaque), CIBLE (lock/cycle plus proche),
//   MUN (cycle munitions). La barre de munitions reste tappable.
// - Le module ne touche jamais au moteur : il passe par window.__TouchHooks
//   (ORBIT_ENGINE) quand dispo, sinon les boutons restent inertes.

function isPhoneLayout() {
  try {
    const coarse = window.matchMedia?.("(pointer: coarse)").matches === true
      || "ontouchstart" in window;
    if (!coarse) return false;
    const w = Math.min(window.innerWidth || 0, window.innerHeight || 0);
    return w > 0 && w < 600;
  } catch { return false; }
}

function refreshPhoneLayout() {
  try {
    document.body.classList.toggle("phone-layout", isPhoneLayout());
  } catch {}
}

refreshPhoneLayout();
try {
  window.addEventListener("resize", refreshPhoneLayout);
  window.addEventListener("orientationchange", refreshPhoneLayout);
  if (window.matchMedia) {
    window.matchMedia("(pointer: coarse)").addEventListener?.("change", refreshPhoneLayout);
  }
} catch {}

try { window.__TouchStick = { active: false, dx: 0, dy: 0 }; } catch {}

function hooks() {
  try { return window.__TouchHooks || null; } catch { return null; }
}

function buildTouchControls() {
  if (document.getElementById("touchControls")) return;
  const root = document.createElement("div");
  root.id = "touchControls";
  root.setAttribute("aria-hidden", "false");
  root.innerHTML = `
    <div id="touchStick" class="touchStick" aria-label="Joystick de déplacement">
      <div class="touchStickBase"><div class="touchStickKnob"></div></div>
    </div>
    <div id="touchCluster" class="touchCluster" aria-label="Contrôles de tir">
      <button id="touchAmmoBtn" class="touchBtn touchSmall" type="button" title="Munition suivante"><span class="touchAmmoLabel">MUN</span><small class="touchAmmoValue">X1</small></button>
      <button id="touchTargetBtn" class="touchBtn touchSmall" type="button" title="Verrouiller la cible la plus proche"><span>TGT</span></button>
      <button id="touchFireBtn" class="touchBtn touchFire" type="button" title="Activer / arrêter le tir"><span>TIR</span></button>
    </div>`;
  document.body.appendChild(root);

  // ---------- Joystick gauche : origine dynamique ----------
  const stick = root.querySelector("#touchStick");
  const base = root.querySelector(".touchStickBase");
  const knob = root.querySelector(".touchStickKnob");
  const STICK_RADIUS = 52;
  let stickPointerId = null;
  let originX = 0, originY = 0;

  function setKnob(dx, dy) {
    try {
      knob.style.transform = `translate(${Math.round(dx)}px, ${Math.round(dy)}px)`;
    } catch {}
  }
  function setBase(x, y) {
    try {
      base.style.left = `${Math.round(x)}px`;
      base.style.top = `${Math.round(y)}px`;
    } catch {}
  }
  function stickState() {
    try { return window.__TouchStick || null; } catch { return null; }
  }

  stick.addEventListener("pointerdown", (e) => {
    if (stickPointerId !== null) return;
    stickPointerId = e.pointerId;
    originX = e.clientX;
    originY = e.clientY;
    setBase(originX, originY);
    setKnob(0, 0);
    const st = stickState();
    if (st) { st.active = false; st.dx = 0; st.dy = 0; }
    try { stick.setPointerCapture(e.pointerId); } catch {}
    e.preventDefault();
    e.stopPropagation();
  }, { passive: false });

  stick.addEventListener("pointermove", (e) => {
    if (e.pointerId !== stickPointerId) return;
    let dx = e.clientX - originX;
    let dy = e.clientY - originY;
    const d = Math.hypot(dx, dy);
    if (d > STICK_RADIUS) {
      dx = (dx / d) * STICK_RADIUS;
      dy = (dy / d) * STICK_RADIUS;
    }
    setKnob(dx, dy);
    const st = stickState();
    if (st) {
      // Zone morte centrale, direction normalisee.
      if (d < 8) { st.active = false; st.dx = 0; st.dy = 0; }
      else { st.active = true; st.dx = dx / STICK_RADIUS; st.dy = dy / STICK_RADIUS; }
    }
    e.preventDefault();
  }, { passive: false });

  function stickEnd(e) {
    if (e.pointerId !== stickPointerId) return;
    stickPointerId = null;
    setKnob(0, 0);
    const st = stickState();
    if (st) { st.active = false; st.dx = 0; st.dy = 0; }
    try { hooks()?.stopStick(); } catch {}
  }
  stick.addEventListener("pointerup", stickEnd);
  stick.addEventListener("pointercancel", stickEnd);

  // ---------- Cluster droit ----------
  const fireBtn = root.querySelector("#touchFireBtn");
  const targetBtn = root.querySelector("#touchTargetBtn");
  const ammoBtn = root.querySelector("#touchAmmoBtn");
  const ammoValue = root.querySelector(".touchAmmoValue");

  function syncFireState() {
    try {
      const s = hooks()?.getState?.();
      fireBtn.classList.toggle("touchActive", s?.attackActive === true);
      if (ammoValue && s?.ammo) ammoValue.textContent = String(s.ammo).toUpperCase();
    } catch {}
  }

  fireBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    try { hooks()?.toggleFire(); } catch {}
    syncFireState();
  });
  targetBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    try {
      const t = hooks()?.cycleTarget?.();
      if (!t) {
        targetBtn.classList.add("touchMiss");
        setTimeout(() => targetBtn.classList.remove("touchMiss"), 350);
      }
    } catch {}
    syncFireState();
  });
  ammoBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    try {
      const next = hooks()?.cycleAmmo?.();
      if (ammoValue && next) ammoValue.textContent = String(next).toUpperCase();
    } catch {}
    syncFireState();
  });

  setInterval(syncFireState, 800);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      const st = stickState();
      if (st) { st.active = false; st.dx = 0; st.dy = 0; }
      stickPointerId = null;
      setKnob(0, 0);
    }
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", buildTouchControls, { once: true });
} else {
  buildTouchControls();
}
