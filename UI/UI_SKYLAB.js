"use strict";

// UI/UI_SKYLAB.js — Fenêtre Skylab (comme le vrai DarkOrbit) : production en
// continu, amélioration des modules jusqu'au niveau 20, robots des
// collecteurs et transport des ressources vers la soute du vaisseau.
// Logique métier pure dans SRC/DATA/SKYLAB.js, persistance via ACCOUNT.js.
// Ce module reçoit ses accès moteur par initSkylabUI() (pas de cycle).

import {
  SKYLAB_MAX_LEVEL,
  SKYLAB_MAX_ROBOTS,
  SKYLAB_MODULES,
  SKYLAB_RESOURCE_IDS,
  SKYLAB_ROBOT_CREDIT_COST,
  SKYLAB_INSTANT_TRANSPORT_COST,
  SKYLAB_PRODUCTION_MULT,
  SKYLAB_REFINERY_CYCLES_PER_SEC,
  canStartSkylabUpgrade,
  formatSkylabDuration,
  getSkylabModuleDef,
  isCollectorModule,
  normalizeSkylabState,
  skylabBasicBonusMult,
  skylabCollectorRatePerHour,
  skylabFirstRobotMsLeft,
  skylabSimulateHour,
  skylabEnergyStatus,
  skylabModuleEnergyRequired,
  skylabRobotBonusPct,
  skylabRobotCount,
  skylabStorageCap,
  skylabUpgradeCost,
  skylabXenoRatePerHour,
  tickSkylabState,
} from "../SRC/DATA/SKYLAB.js";
import { getResourceName, cargoFree, CARGO_CAPACITY } from "../SRC/DATA/RESOURCES.js";
import { formatInteger } from "../SRC/CORE/NUMBER_FORMAT.js";
import {
  buySkylabRobot,
  instantSkylabTransport,
  loadSkylabFromShip,
  setSkylabModuleEnabled,
  startSkylabUpgrade,
  transportSkylabToShip,
} from "../SRC/CORE/ACCOUNT.js";

let ctx = null;
let selectedModule = null;
// Sens du transporteur : "toShip" (Skylab → soute) ou "toSky" (soute → Skylab).
let transportDir = "toShip";
try {
  if (localStorage.getItem("orbit_skylab_dir") === "toSky") transportDir = "toSky";
} catch {}
let lastDynamicRefresh = 0;
let lastDirtyMark = 0;

const NODE_POS = Object.freeze({
  // Zone modules officielle 772x364 (internalSkylab.css : #modules).
  prometium_collector: { left: "8.4%", top: "6.1%" },
  endurium_collector: { left: "1%", top: "19.5%" },
  terbium_collector: { left: "1%", top: "36.3%" },
  transport: { left: "1%", top: "63.1%" },
  storage: { left: "12.4%", top: "74.3%" },
  solar: { left: "44%", top: "5%" },
  basic: { left: "51.8%", top: "74.3%" },
  prometid_refinery: { left: "65.4%", top: "6.1%" },
  duranium_refinery: { left: "74.6%", top: "19.5%" },
  promerium_refinery: { left: "75.1%", top: "37.4%" },
  xeno_module: { left: "75.9%", top: "48.6%" },
  seprom_refinery: { left: "75.1%", top: "74.3%" },
});

const RES_COLORS = Object.freeze({
  // Couleurs officielles des minerais (internalSkylab.css : .ore_*).
  prometium: "#e05252", endurium: "#59aae3", terbium: "#f4e53f",
  prometid: "#d58989", duranium: "#3dcd6c", xenomit: "#949ba9",
  promerium: "#dfa33b", seprom: "#c44ae0",
});

const LAYER_BOXES = Object.freeze({
  prometium_collector: { l: 207, t: 98, w: 112, h: 66, img: "ASSETS/SKYLAB/PROMETIUM.png" },
  endurium_collector: { l: 126, t: 149, w: 73, h: 87, img: "ASSETS/SKYLAB/ENDURIUM.png" },
  terbium_collector: { l: 54, t: 201, w: 73, h: 78, img: "ASSETS/SKYLAB/TERBIUM.png" },
  prometid_refinery: { l: 389, t: 138, w: 79, h: 62, img: "ASSETS/SKYLAB/PROMETID.png" },
  duranium_refinery: { l: 452, t: 152, w: 82, h: 64, img: "ASSETS/SKYLAB/DURANIUM.png" },
  promerium_refinery: { l: 387, t: 215, w: 75, h: 56, img: "ASSETS/SKYLAB/PROMERIUM.png" },
  seprom_refinery: { l: 387, t: 270, w: 74, h: 57, img: "ASSETS/SKYLAB/SEPROM.png" },
  xeno_module: { l: 450, t: 224, w: 64, h: 62, img: "ASSETS/SKYLAB/XENO.png" },
});

function layerBoxHtml(def, level) {
  const box = LAYER_BOXES[def.id];
  if (!box || level < 1) return "";
  const pct = (v, base) => `${(v / base * 100).toFixed(2)}%`;
  return `<img class="skylabLayer" src="${escapeHtml(box.img)}" alt="" loading="lazy" draggable="false"`
    + ` style="left:${pct(box.l, 772)};top:${pct(box.t, 364)};width:${pct(box.w, 772)};height:${pct(box.h, 364)}">`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

function els() {
  return {
    root: document.getElementById("skylabWindow"),
    topBar: document.getElementById("skylabTopBar"),
    map: document.getElementById("skylabMap"),
    popup: document.getElementById("skylabPopup"),
  };
}

// La carte réécrit son innerHTML : la popup est recréée/rattachée à chaque
// rebuild au lieu d'être perdue.
function ensurePopup(map) {
  let pop = map.querySelector(":scope > #skylabPopup");
  if (!pop) {
    pop = document.createElement("div");
    pop.id = "skylabPopup";
    pop.className = "skylabPopup";
    pop.hidden = true;
  }
  return pop;
}

function liveSkylab() {
  // Insensible au TDZ : registerHudWindows() tourne au chargement du module,
  // avant l'initialisation de `account` dans ORBIT_ENGINE.
  let user = null;
  try {
    user = ctx?.getUser?.();
  } catch {
    return null;
  }
  if (!user) return null;
  user.skylab = normalizeSkylabState(user.skylab);
  return user.skylab;
}

const MODULE_OUTPUT = Object.freeze({
  prometium_collector: "prometium", endurium_collector: "endurium", terbium_collector: "terbium",
  xeno_module: "xenomit", prometid_refinery: "prometid", duranium_refinery: "duranium",
  promerium_refinery: "promerium", seprom_refinery: "seprom",
});

// Débit affiché en /s réelles : simulé avec les stocks réels.
// Positif/vert quand ça gagne, négatif/rouge quand ça consomme plus.
function fmtRatePerSec(v) {
  const t = (Math.round(Math.abs(v) * 100) / 100).toFixed(2);
  return `${v < -0.0005 ? "-" : "+"}${t.replace(".", ",")}/s`;
}

function mapRateInfo(sky, moduleId, level) {
  const res = MODULE_OUTPUT[String(moduleId) || ""];
  if (!res || level < 1) return null;
  const m = sky?.modules?.[moduleId];
  if (!m || m.enabled === false || m.upgrading) return null;
  const sim = skyLabSimOf(sky);
  // Même efficacité que le tick : sans ça l'affichage part en sens inverse.
  const eff = skylabEnergyStatus(sky).efficiency;
  let v;
  if (isCollectorModule(moduleId) || moduleId === "xeno_module") {
    const basicMult = skylabBasicBonusMult(sky);
    let gross;
    if (isCollectorModule(moduleId)) {
      const robotMult = 1 + skylabRobotBonusPct(m, Date.now()) / 100;
      gross = skylabCollectorRatePerHour(level) * robotMult * basicMult * SKYLAB_PRODUCTION_MULT / 60;
    } else {
      gross = skylabXenoRatePerHour(level) * basicMult * SKYLAB_PRODUCTION_MULT / 60;
    }
    v = gross * eff - (Number(sim.consumed[res]) || 0) / 60;
  } else {
    v = (Number(sim.outputs[moduleId]) || 0) / 60 - (Number(sim.consumed[res]) || 0) / 60;
  }
  const neg = v < -0.0005;
  return { text: fmtRatePerSec(v), neg };
}

function skyLabSimOf(sky) {
  try {
    return skylabSimulateHour(sky) || { outputs: {}, consumed: {} };
  } catch {
    return { outputs: {}, consumed: {} };
  }
}

// --- Rendu ---
// Les nœuds et les champs de saisie ne sont jamais reconstruits en boucle :
// on ne touche au DOM que si la structure a changé, sinon on met à jour les
// textes en place (sinon les clics et la saisie seraient interrompus).
let mapSig = "";
let popupSig = "";
let popupOpen = false;

function modulesSig(sky) {
  const now = Date.now();
  return SKYLAB_MODULES.map((def) => {
    const m = sky.modules?.[def.id] || {};
    let robots = 0;
    try {
      robots = skylabRobotCount(m, now).total;
    } catch {
      robots = 0;
    }
    return `${def.id}:${Math.floor(Number(m.level) || 0)}:${m.enabled !== false ? 1 : 0}:${m.upgrading ? m.upgrading.to : 0}:${robots}`;
  }).join("|");
}

function renderStock(sky) {
  const { topBar } = els();
  if (!topBar) return;
  // Contenu texte uniquement (pas d'interactif) : reconstruction sans risque.
  topBar.innerHTML = SKYLAB_RESOURCE_IDS.map((id) => {
    const amount = Math.floor(Number(sky.stock?.[id]) || 0);
    const cap = skylabStorageCap(sky, id);
    const color = RES_COLORS[id] || "#eaffff";
    const full = cap > 0 && amount >= cap;
    return `<div class="topCell${full ? " is-full" : ""}" style="--res:${color}" title="${escapeHtml(getResourceName(id))}">`
      + `<span class="topCellName">${escapeHtml(getResourceName(id))}</span>`
      + `<span class="topCellVal">${formatInteger(amount)}</span></div>`;
  }).join("");
}

function nodeSubHtml(def, m, level, now, sky) {
  const energyReq = skylabModuleEnergyRequired(def.id, level);
  if (m.upgrading) {
    const left = Math.max(0, Math.ceil((Number(m.upgrading.finishesAt) - now) / 1000));
    return `<span class="nodeTimer" data-node-timer="${escapeHtml(def.id)}">niv ${m.upgrading.to}… ${formatSkylabDuration(left)}</span>`;
  }
  if (level <= 0) return `<span class="nodeBuilt">À construire</span>`;
  if (m.enabled === false) return `<span class="nodeOff">Éteint</span>`;
  const info = mapRateInfo(sky, def.id, level);
  return `<span class="nodeMeta"><span class="nodeLvl">Nv ${level}</span>`
    + (energyReq > 0 ? `<span class="nodeEnergy">⚡${formatInteger(energyReq)}</span>` : "")
    + (info ? `<span class="nodeRate${info.neg ? " neg" : ""}" data-node-rate="${escapeHtml(def.id)}">${escapeHtml(info.text)}</span>` : "")
    + `</span>`;
}

function energyLineHtml(energy) {
  return `⚡ ${formatInteger(energy.required)} / ${formatInteger(energy.produced)}${energy.efficiency < 1 ? ` (−${Math.round((1 - energy.efficiency) * 100)} % prod)` : ""}`;
}

function renderMap(sky, now, force = false) {
  const { map } = els();
  if (!map) return;
  const sig = `${modulesSig(sky)}#${selectedModule}`;
  if (!force && sig === mapSig) {
    refreshMapTimers(sky, now);
    return;
  }
  mapSig = sig;
  map.innerHTML = SKYLAB_MODULES.map((def) => {
    const m = sky.modules?.[def.id] || { level: 0 };
    return layerBoxHtml(def, Math.floor(Number(m.level) || 0));
  }).join("") + SKYLAB_MODULES.map((def) => {
    const m = sky.modules?.[def.id] || { level: 0 };
    const level = Math.floor(Number(m.level) || 0);
    const pos = NODE_POS[def.id] || { left: "50%", top: "50%" };
    const cls = ["skylabNode"];
    if (def.id === selectedModule) cls.push("selected");
    if (level <= 0) cls.push("is-inactive");
    else if (m.enabled === false) cls.push("is-off");
    if (m.upgrading) cls.push("is-upgrading");
    return `<div class="${cls.join(" ")}" style="left:${pos.left};top:${pos.top}" data-sky-action="select" data-module="${escapeHtml(def.id)}" role="button" tabindex="0" title="${escapeHtml(def.name)}">`
      + `<span class="nodeName">${escapeHtml(def.name)}</span>${nodeSubHtml(def, m, level, now, sky)}</div>`;
  }).join("")
    + `<span class="skylabEnergyLine" data-energy-line>${energyLineHtml(skyLabEnergyOf(sky))}</span>`;
  map.append(ensurePopup(map));
}

function skyLabEnergyOf(sky) {
  return skylabEnergyStatus(sky);
}

function refreshMapTimers(sky, now) {
  const { map } = els();
  if (!map) return;
  for (const el of map.querySelectorAll("[data-node-timer]")) {
    const m = sky.modules?.[el.dataset.nodeTimer];
    if (!m?.upgrading) continue;
    const left = Math.max(0, Math.ceil((Number(m.upgrading.finishesAt) - now) / 1000));
    const next = `niv ${m.upgrading.to}… ${formatSkylabDuration(left)}`;
    if (el.textContent !== next) el.textContent = next;
  }
  // Débits nets temps réel (verts / rouges) mis à jour en place.
  for (const el of map.querySelectorAll("[data-node-rate]")) {
    const modId = el.dataset.nodeRate;
    const m = sky.modules?.[modId];
    const info = mapRateInfo(sky, modId, Math.floor(Number(m?.level) || 0));
    if (!info) continue;
    if (el.textContent !== info.text) el.textContent = info.text;
    const neg = info.neg === true;
    if (el.classList.contains("neg") !== neg) el.classList.toggle("neg", neg);
  }
  const line = map.querySelector("[data-energy-line]");
  if (line) {
    const next = energyLineHtml(skyLabEnergyOf(sky));
    if (line.textContent !== next) line.textContent = next;
  }
}

function popupSigFor(sky, user, now) {
  const m = sky.modules?.[selectedModule] || {};
  const credits = Math.max(0, Math.floor(Number(user?.credits) || 0));
  const bucket = (id) => Math.floor(Math.floor(Number(sky.stock?.[id]) || 0) / 25);
  let robots = 0;
  try {
    robots = skylabRobotCount(m, Date.now()).total;
  } catch {
    robots = 0;
  }
  const transportActive = Number(sky.transportReadyAt) > Number(now) ? 1 : 0;
  return `${selectedModule}:${Math.floor(Number(m.level) || 0)}:${m.enabled !== false ? 1 : 0}:${m.upgrading ? m.upgrading.to : 0}:${robots}:${Math.floor(credits / 5000)}:${bucket("prometium")}:${bucket("endurium")}:${bucket("terbium")}:${transportDir}:${transportActive}`;
}

function renderPopup(sky, user, now, force = false) {
  const { popup } = els();
  if (!popup) return;
  if (!popupOpen) {
    popupSig = "";
    if (!popup.hidden) popup.hidden = true;
    return;
  }
  const sig = popupSigFor(sky, user, now);
  if (!force && sig === popupSig) {
    // Compte à rebours et statuts en place, sans reconstruire les boutons.
    const timer = popup.querySelector("[data-detail-timer]");
    const m = sky.modules?.[selectedModule];
    if (timer && m?.upgrading) {
      const left = Math.max(0, Math.ceil((Number(m.upgrading.finishesAt) - now) / 1000));
      const next = `Prêt dans ${formatSkylabDuration(left)}`;
      if (timer.textContent !== next) timer.textContent = next;
    }
    const rst = popup.querySelector("[data-robot-status]");
    if (rst && m) {
      const next = robotStatusText(m, now);
      if (rst.textContent !== next) rst.textContent = next;
    }
    refreshTransportDynamic(sky, now);
    return;
  }
  popupSig = sig;
  // Préserve la saisie du transporteur à travers les reconstructions.
  const savedInputs = {};
  for (const input of popup.querySelectorAll("input[data-sky-send]")) {
    savedInputs[input.dataset.skySend] = input.value;
  }
  const def = getSkylabModuleDef(selectedModule) || SKYLAB_MODULES[0];
  const body = def.id === "transport" ? transportBodyHtml(savedInputs) : detailBodyHtml(sky, user, def, now);
  popup.innerHTML = `<div class="skylabPopupHead"><b>${escapeHtml(def.name)}</b><button class="gameWinMinBtn" type="button" data-sky-action="close" title="Réduire">−</button></div>`
    + `<div class="skylabPopupBody">${body}</div>`;
  popup.hidden = false;
  // Popup à côté du module cliqué, toujours entièrement dans la carte.
  // Transporteur : bien centré au milieu.
  const { map: mapEl } = els();
  if (def.id === "transport" && mapEl) {
    popup.style.width = "min(430px,62%)";
    const mapR = mapEl.getBoundingClientRect();
    const popR = popup.getBoundingClientRect();
    popup.style.left = `${Math.max(4, (mapR.width - popR.width) / 2)}px`;
    popup.style.top = `${Math.max(4, (mapR.height - popR.height) / 2 - 10)}px`;
  } else {
    popup.style.width = "";
    const pos = NODE_POS[def.id];
    if (pos) {
      const lx = parseFloat(pos.left) || 50;
      // Collecteurs : popup bien à droite du nom.
      const gap = isCollectorModule(def.id) ? 24 : 11;
      popup.style.left = lx < 45 ? `calc(${pos.left} + ${gap}%)` : `calc(${pos.left} - 38%)`;
      // Alignée avec le nom du module (le recalage anti-dépassement suit).
      popup.style.top = `${parseFloat(pos.top) || 20}%`;
    }
  }
  if (mapEl) {
    const mapR = mapEl.getBoundingClientRect();
    const popR = popup.getBoundingClientRect();
    let dx = 0, dy = 0;
    if (popR.right > mapR.right - 4) dx = mapR.right - 4 - popR.right;
    if (popR.left < mapR.left + 4) dx = mapR.left + 4 - popR.left;
    if (popR.bottom > mapR.bottom - 4) dy = mapR.bottom - 4 - popR.bottom;
    if (popR.top < mapR.top + 4) dy = mapR.top + 4 - popR.top;
    if (dx) popup.style.left = `${popup.offsetLeft + dx}px`;
    if (dy) popup.style.top = `${popup.offsetTop + dy}px`;
  }
  refreshTransportDynamic(sky, now);
}

function robotStatusText(m, now) {
  const bonus = skylabRobotBonusPct(m, now);
  const left = skylabFirstRobotMsLeft(m, now);
  return `+${bonus} %${left > 0 ? ` - ${formatRobotCountdown(left)}` : ""}`;
}

function formatRobotCountdown(ms) {
  const s = Math.max(0, Math.ceil(Number(ms) / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const p = (n) => String(n).padStart(2, "0");
  return `${h}h ${p(m)}m ${p(sec)}s`;
}

function detailBodyHtml(sky, user, def, now) {
  const m = sky.modules?.[def.id] || { level: 0, enabled: true, robots: [] };
  const level = Math.floor(Number(m.level) || 0);
  const credits = Math.max(0, Math.floor(Number(user?.credits) || 0));
  let html = "";
  // Robot unique des collecteurs : +5 % (50 000 crédits, 12 h de vie).
  // On affiche le timer restant du premier acheté (premier à expirer).
  if (isCollectorModule(def.id) && level >= 1) {
    const count = skylabRobotCount(m, now);
    html += `<div class="detailRow"><span>Robots (${count.total}/${SKYLAB_MAX_ROBOTS})</span><b data-robot-status>${escapeHtml(robotStatusText(m, now))}</b></div>`;
    html += `<button type="button" data-sky-action="robot" data-module="${escapeHtml(def.id)}" ${count.total >= SKYLAB_MAX_ROBOTS ? "disabled" : ""}>Acheter un robot · ${formatInteger(SKYLAB_ROBOT_CREDIT_COST)}</button>`;
  }

  // Activer / pause.
  if (level >= 1 && !["basic", "solar", "storage", "transport"].includes(def.id)) {
    html += `<button type="button" class="warnBtn" data-sky-action="toggle" data-module="${escapeHtml(def.id)}">${m.enabled === false ? "Activer" : "Mettre en pause"}</button>`;
  }

  // Construction / amélioration.
  if (def.upgradeable) {
    if (m.upgrading) {
      const left = Math.max(0, Math.ceil((Number(m.upgrading.finishesAt) - now) / 1000));
      html += `<div class="detailProgress"><span>Amélioration vers le niveau ${m.upgrading.to}…</span><span data-detail-timer>Prêt dans ${formatSkylabDuration(left)}</span><span>(production du module en pause)</span></div>`;
    } else if (level >= SKYLAB_MAX_LEVEL) {
      html += `<div class="detailCost"><span>Niveau maximum atteint.</span></div>`;
    } else {
      const to = level + 1;
      const cost = skylabUpgradeCost(def.id, to);
      if (cost) {
        const check = canStartSkylabUpgrade(sky, def.id, credits, now);
        const label = level <= 0 ? `Construire (niv 1)` : `Améliorer vers niv ${to}`;
        const tip = `${label} · ${formatSkylabDuration(cost.timeSecGame)}\n${formatInteger(cost.credits)} crédits\n${formatInteger(cost.resEach.prometium)} Prometium + ${formatInteger(cost.resEach.endurium)} Endurium + ${formatInteger(cost.resEach.terbium)} Terbium`;
        html += `<button type="button" data-sky-action="upgrade" data-module="${escapeHtml(def.id)}" title="${escapeHtml(tip)}" ${check.ok ? "" : "disabled"}>${escapeHtml(label)}</button>`;
        if (!check.ok) html += `<span class="detailDesc">${escapeHtml(check.error || "")}</span>`;
      }
    }
  } else {
    html += `<span class="detailDesc">Niveau 1 fixe, comme sur le vrai DO.</span>`;
  }
  return html;
}

function transportBodyHtml(savedInputs = {}) {
  const rows = SKYLAB_RESOURCE_IDS.filter((id) => id !== "xenomit").map((id) => {
    return `<label class="skyTransRow"><span>${escapeHtml(getResourceName(id))}:</span>`
      + `<span class="skyTransBox"><input data-sky-send="${escapeHtml(id)}" type="number" min="0" step="1" inputmode="numeric" value="${escapeHtml(savedInputs[id] ?? "")}" placeholder="0" aria-label="${escapeHtml(getResourceName(id))}"></span></label>`;
  }).join("");
  return `<button class="skylabDirToggle" type="button" data-sky-action="dir" data-dir="${transportDir === "toSky" ? "toShip" : "toSky"}"></button>`
    + `<div class="skyTransTopRow"><span class="skylabTransportStatus" data-transport-status></span><span class="skylabCargoLine" data-cargo-line></span></div>`
    + `<div class="skyTransInputs">${rows}</div>`
    + `<div class="skyTransActions"><button type="button" data-sky-action="send-instant">Envoi immédiat<span>${formatInteger(SKYLAB_INSTANT_TRANSPORT_COST)} crédits</span></button>`
    + `<button type="button" data-sky-action="send">Envoyer</button></div>`;
}

function refreshTransportDynamic(sky, now) {
  // Mises à jour en place dans la popup (jamais de reconstruction ici).
  const { popup } = els();
  const transport = popup && !popup.hidden && popup.querySelector(".skyTransInputs") ? popup : null;
  if (!transport) return;
  const readyIn = Math.max(0, Math.ceil((Number(sky?.transportReadyAt) - now) / 1000));
  let shipRes = {};
  try {
    shipRes = ctx?.getUser?.()?.inventory?.resources || {};
  } catch {
    shipRes = {};
  }
  const free = cargoFree(shipRes, CARGO_CAPACITY);
  const used = Math.max(0, CARGO_CAPACITY - free);
  const toSky = transportDir === "toSky";
  const toggleBtn = transport.querySelector("[data-sky-action='dir']");
  if (toggleBtn) {
    const nextDir = toSky ? "toShip" : "toSky";
    if (toggleBtn.dataset.dir !== nextDir) toggleBtn.dataset.dir = nextDir;
    const nextHtml = toSky
      ? `Vaisseau <b>⮞</b> Skylab`
      : `Skylab <b>⮞</b> Vaisseau`;
    if (toggleBtn.dataset.html !== nextHtml) {
      toggleBtn.dataset.html = nextHtml;
      toggleBtn.innerHTML = nextHtml;
    }
  }
  const cargoEl = transport.querySelector("[data-cargo-line]");
  if (cargoEl) {
    const next = `Soute : ${formatInteger(used)} / ${formatInteger(CARGO_CAPACITY)} (${formatInteger(free)} libres)`;
    if (cargoEl.textContent !== next) cargoEl.textContent = next;
  }
  const statusEl = transport.querySelector("[data-transport-status]");
  if (statusEl) {
    const next = readyIn > 0 ? `En vol : ${formatSkylabDuration(readyIn)}` : "Prêt.";
    if (statusEl.textContent !== next) statusEl.textContent = next;
  }
  for (const input of transport.querySelectorAll("input[data-sky-send]")) {
    const id = input.dataset.skySend;
    const avail = toSky
      ? Math.max(0, Math.floor(Number(shipRes[id]) || 0))
      : Math.floor(Number(sky?.stock?.[id]) || 0);
    const maxAttr = String(avail);
    if (input.getAttribute("max") !== maxAttr) input.setAttribute("max", maxAttr);
    const placeholder = `0 / ${formatInteger(avail)}`;
    if (input.getAttribute("placeholder") !== placeholder) input.setAttribute("placeholder", placeholder);
  }
  const sendBtn = transport.querySelector("[data-sky-action='send']");
  if (sendBtn && sendBtn.disabled !== readyIn > 0) sendBtn.disabled = readyIn > 0;
}

export function renderSkylabWindow(force = false) {
  const { root } = els();
  if (!root) return;
  const sky = liveSkylab();
  if (!sky) return;
  let user = null;
  try {
    user = ctx?.getUser?.();
  } catch {
    user = null;
  }
  const now = Date.now();
  renderMap(sky, now, force);
  renderStock(sky);
  renderPopup(sky, user, now, force);
}

// Rafraîchit les chiffres sans jamais reconstruire les zones interactives
// (nœuds, boutons, champs de saisie).
function refreshSkylabDynamic() {
  const { root } = els();
  if (!root || root.style.display === "none" || root.classList.contains("gameWinMinimized")) return;
  const sky = liveSkylab();
  if (!sky) return;
  let user = null;
  try {
    user = ctx?.getUser?.();
  } catch {
    user = null;
  }
  const now = Date.now();
  try {
    renderMap(sky, now, false);
    renderStock(sky);
    renderPopup(sky, user, now, false);
  } catch {}
}

// --- Actions ---

function after(ok, error, successMsg) {
  if (!ok) {
    ctx?.toast?.(error || "Impossible.", 2);
    return;
  }
  ctx?.afterAction?.();
  renderSkylabWindow();
  if (successMsg) ctx?.toast?.(successMsg, 1.8);
}

function onSkylabClick(event) {
  const btn = event.target instanceof Element ? event.target.closest("[data-sky-action]") : null;
  if (!btn) return;
  const action = btn.dataset.skyAction;
  if (action === "select") {
    selectedModule = btn.dataset.module || selectedModule;
    popupOpen = true;
    renderSkylabWindow();
    return;
  }
  if (action === "close") {
    popupOpen = false;
    selectedModule = null;
    renderSkylabWindow();
    return;
  }
  if (action === "upgrade") {
    const res = startSkylabUpgrade(btn.dataset.module);
    if (!res?.ok) { ctx?.toast?.(res?.error || "Impossible.", 2.2); return; }
    after(true, "", `${getSkylabModuleDef(btn.dataset.module)?.name || "Module"} : amélioration lancée.`);
    return;
  }
  if (action === "toggle") {
    const sky = liveSkylab();
    const cur = sky?.modules?.[btn.dataset.module];
    const res = setSkylabModuleEnabled(btn.dataset.module, !(cur?.enabled !== false));
    if (!res?.ok) { ctx?.toast?.(res?.error || "Impossible.", 2); return; }
    after(true, "", null);
    renderSkylabWindow();
    return;
  }
  if (action === "robot") {
    const res = buySkylabRobot(btn.dataset.module);
    if (!res?.ok) { ctx?.toast?.(res?.error || "Impossible.", 2.2); return; }
    after(true, "", "Robot +5 % ajouté (12 h).");
    return;
  }
  if (action === "dir") {
    transportDir = btn.dataset.dir === "toSky" ? "toSky" : "toShip";
    try { localStorage.setItem("orbit_skylab_dir", transportDir); } catch {}
    const popup = els().popup;
    // Vide les champs (les montants d'un sens ne valent rien dans l'autre).
    for (const input of popup?.querySelectorAll("input[data-sky-send]") || []) input.value = "";
    renderSkylabWindow(true);
    return;
  }
  if (action === "send" || action === "send-instant") {
    const popup = els().popup;
    const amounts = {};
    for (const input of popup?.querySelectorAll("input[data-sky-send]") || []) {
      const v = Math.floor(Number(input.value) || 0);
      if (v > 0) amounts[input.dataset.skySend] = v;
    }
    // Champs vides : tout le stock possible dans le sens actif.
    if (!Object.keys(amounts).length) {
      if (transportDir === "toSky") {
        let user = null;
        try { user = ctx?.getUser?.(); } catch { user = null; }
        const shipRes = user?.inventory?.resources || {};
        for (const id of SKYLAB_RESOURCE_IDS) {
          if (id === "xenomit") continue;
          const inShip = Math.max(0, Math.floor(Number(shipRes[id]) || 0));
          if (inShip > 0) amounts[id] = inShip;
        }
      } else {
        const sky = liveSkylab();
        for (const id of SKYLAB_RESOURCE_IDS) {
          if (id === "xenomit") continue;
          const inSky = Math.floor(Number(sky?.stock?.[id]) || 0);
          if (inSky > 0) amounts[id] = inSky;
        }
      }
    }
    const toSky = transportDir === "toSky";
    if (action === "send-instant") {
      const res = instantSkylabTransport(amounts, toSky);
      if (!res?.ok) { ctx?.toast?.(res?.error || "Impossible.", 2.2); return; }
      after(true, "", `Envoi immédiat : +${formatInteger(res.totalMoved)} ressources.`);
      return;
    }
    const res = toSky ? loadSkylabFromShip(amounts) : transportSkylabToShip(amounts);
    if (!res?.ok) { ctx?.toast?.(res?.error || "Impossible.", 2.2); return; }
    after(true, "", toSky
      ? `Chargé vers le Skylab : +${formatInteger(res.totalMoved)} ressources.`
      : `Transporteur envoyé : +${formatInteger(res.totalMoved)} ressources en soute.`);
  }
}

function onSkylabKeydown(event) {
  if (event.key === "Enter" && event.target instanceof Element && event.target.matches("[data-sky-action='select']")) {
    selectedModule = event.target.dataset.module || selectedModule;
    popupOpen = true;
    renderSkylabWindow();
  }
}

// Chiffres uniquement dans les cases du transporteur (ni lettres, ni signes).
function onSkylabInput(event) {
  const input = event.target instanceof Element ? event.target.closest("input[data-sky-send]") : null;
  if (!input) return;
  const clean = String(input.value || "").replace(/[^0-9]/g, "");
  if (clean !== input.value) input.value = clean;
}

// --- Boucle de production (appelée par le moteur) ---

export function tickSkylabProduction(dtRealSec) {
  if (!ctx) return;
  let user = null;
  try {
    user = ctx.getUser?.();
  } catch {
    return;
  }
  if (!user) return;
  user.skylab = normalizeSkylabState(user.skylab);
  const now = Date.now();
  let res;
  try {
    res = tickSkylabState(user.skylab, now, Math.max(0, Number(dtRealSec) || 0));
  } catch { return; }
  if (res?.completed?.length) {
    for (const moduleId of res.completed) {
      const def = getSkylabModuleDef(moduleId);
      const level = user.skylab.modules?.[moduleId]?.level;
      ctx.notify?.(`Skylab : ${def?.name || moduleId} niveau ${level} terminé !`, 3, "reward");
    }
    ctx.markDirty?.();
    lastDirtyMark = now;
  } else if (now - lastDirtyMark > 60000) {
    // Production en continu : sauvegarde trickle toutes les 60 s max.
    ctx.markDirty?.();
    lastDirtyMark = now;
  }
  if (now - lastDynamicRefresh > 1000) {
    lastDynamicRefresh = now;
    try { refreshSkylabDynamic(); } catch {}
  }
}

export function initSkylabUI(context) {
  ctx = context;
  // Purge les largeurs écrasées sauvegardées avant le min-width : la fenêtre
  // rouvre en pleine largeur au lieu de rester coincée à 280 px.
  try {
    const raw = localStorage.getItem("orbit_hud_window_pos:skylabWindow");
    const saved = raw ? JSON.parse(raw) : null;
    if (saved && Number(saved.width) > 0 && (Number(saved.width) < 700 || Number(saved.width) > 880)) {
      localStorage.removeItem("orbit_hud_window_pos:skylabWindow");
      document.getElementById("skylabWindow")?.style.setProperty("width", "");
    }
  } catch {}
  const { root } = els();
  if (!root || root.__skylabWired) {
    // Rattrapage hors-ligne même si déjà câblé (refresh après des heures).
    catchUpOffline();
    return;
  }
  root.__skylabWired = true;
  root.addEventListener("click", onSkylabClick);
  root.addEventListener("keydown", onSkylabKeydown);
  root.addEventListener("input", onSkylabInput);
  // Clic ailleurs : la popup se réduit (et le nom perd son glow).
  if (!window.__skylabOutsideCloser) {
    window.__skylabOutsideCloser = true;
    document.addEventListener("pointerdown", (event) => {
      if (!popupOpen) return;
      const t = event.target instanceof Element ? event.target : null;
      if (!t) return;
      if (t.closest("#skylabPopup")) return;
      if (t.closest("[data-sky-action]")) return;
      popupOpen = false;
      selectedModule = null;
      try { renderSkylabWindow(); } catch {}
    }, { capture: true });
  }
  window.addEventListener("orbit:window-restored", (event) => {
    if (event.detail?.id === "skylabWindow") renderSkylabWindow();
  });
  catchUpOffline();
  try { renderSkylabWindow(); } catch {}
}

// Production pendant l'absence (plafonnée à 12 h réelles).
function catchUpOffline() {
  try {
    const user = ctx?.getUser?.();
    if (!user) return;
    user.skylab = normalizeSkylabState(user.skylab);
    const now = Date.now();
    const elapsed = Math.max(0, Math.min(12 * 3600, (now - Number(user.skylab.lastTickAt || now)) / 1000));
    if (elapsed < 1) return;
    const res = tickSkylabState(user.skylab, now, elapsed);
    ctx.markDirty?.();
    if (res?.completed?.length) {
      ctx.notify?.(`Skylab : ${res.completed.length} amélioration(s) terminée(s) pendant ton absence.`, 3, "reward");
    }
  } catch {}
}
