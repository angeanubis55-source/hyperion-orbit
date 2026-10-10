// SCRIPTS/ANTICHEAT.js — Garde-fous serveur (multi) : mitigation silencieuse,
// horloge serveur, logs et audit avant examen par la modération. Le client
// est entièrement modifiable (Cheat Engine) : seule la validation serveur
// compte. Module pur (aucun effet de bord) : testable unitairement.
import { NETWORK_TIMING_GRACE_SEC } from "../SRC/CORE/NETWORK_TIMING.js";
import { COLLECTABLE_PICKUP_HOLD_SEC, PET_GEAR_PICK_DELAY } from "../SRC/CORE/COLLECTION_TIMING.js";

const SERVER_VMAX = 1500;
const FAR_JUMP_NO_HEAL = 4000;
const MOVE_BUCKET_CAP = 8000;
const MOVE_BUCKET_REFILL = 1500;
const MOVE_NETWORK_WINDOW_MS = 5000;
const AC_HIT_CAP = 240, AC_HIT_REFILL = 80;
const AC_DMG_CAP = 3e9, AC_DMG_REFILL = 250e6;
const AC_PVP_HIT_CAP = 240, AC_PVP_HIT_REFILL = 80;
const AC_PVP_DMG_CAP = 1e9, AC_PVP_DMG_REFILL = 150e6;
const HEAL_BUDGET_RATE = 0.5, HEAL_BUDGET_CAP = 0.5;
const REVIVE_REBASE_MAX = 0.25;
const PET_LEASH = 3000;

// (Export groupé ANTICHEAT en fin de fichier.)

// Seau à jetons générique sur l'état joueur (anti-rafale). Retourne true si
// le coût est accepté (jetons décrémentés), false sinon.
export function acBucket(state, key, nowMs, cap, refillPerSec, cost) {
  if (![nowMs, cap, refillPerSec, cost].every(Number.isFinite)
    || cap < 0 || refillPerSec < 0 || cost < 0) return false;
  const tk = `_ac${key}T`, nk = `_ac${key}N`;
  const dt = Math.max(0, (nowMs - Number(state[tk] || 0)) / 1000);
  let n = Number(state[nk]);
  if (!Number.isFinite(n)) n = cap;
  n = Math.min(cap, n + dt * refillPerSec);
  state[tk] = nowMs;
  if (n + 1e-9 < cost) { state[nk] = n; return false; }
  state[nk] = Math.max(0, n - cost);
  return true;
}

export function acStrike(state, counter, every = 20) {
  state[counter] = Number(state[counter] || 0) + 1;
  return state[counter] % every === 1;
}

// Remontée plafonnée au budget : preleve le gain sur le budget, retourne
// la nouvelle valeur (jamais au-delà du max).
export function acHealTake(state, cur, want, max, key) {
  const gain = Math.min(Math.max(0, want - cur), Number(state[key] || 0));
  state[key] = Math.max(0, Number(state[key] || 0) - gain);
  return Math.min(max, cur + gain);
}

function acLog(msg) {
  try { console.log(msg); } catch {}
}

// Historique court, attribue a la session authentifiee. Un rejet isole est
// visible, mais seules des anomalies repetant sur plusieurs secondes scorent.
export function acRecordViolation(state, kind, now, details = {}) {
  if (!["movement", "combat", "clock", "profile"].includes(kind) || !Number.isFinite(now)) return;
  const report = state._security || (state._security = { total: 0, counts: {}, history: [] });
  report.total++;
  report.counts[kind] = (report.counts[kind] || 0) + 1;
  const event = { ...details, kind, at: now };
  report.last = event;
  const last = report.history[report.history.length - 1];
  if (!last || now - last.at >= 500 || last.kind !== kind) {
    report.history.push(event);
    if (report.history.length > 24) report.history.shift();
  }
  const audit = state._audit;
  // L'acceleration d'horloge signalee par le client est informative. Elle
  // ne prouve rien seule et ne participe jamais au gel automatique.
  // Un impact hors enveloppe peut aussi venir d'une aptitude encore locale.
  // Il reste visible pour examen, sans sanction automatique sur cette base.
  if (audit && (kind === "movement" || kind === "combat")) {
    const count = `${kind}Rejected`, periods = `${kind}Seconds`;
    audit[count] = (audit[count] || 0) + 1;
    const seconds = audit[periods] || (audit[periods] = []);
    const second = Math.floor(now / 1000);
    if (seconds[seconds.length - 1] !== second) {
      seconds.push(second);
      if (seconds.length > 64) seconds.shift();
    }
  }
}

// --- Audit périodique (toutes les 10 s) : le farm sur place à vitesse
// fulgurante passe sous les seaux instantanés (calibrés large pour les
// rafales AoE légitimes). L'audit compare des compteurs strictement
// serveur (kills crédités, boxes acceptées, dégâts appliqués) à des
// plafonds par fenêtre : impossible à forger depuis le client.
// Score : +15 (dépassement simple), +50 (grossier), -10 par fenêtre
// propre. Sanction (kick + gel, JAMAIS de ban auto) à 100 : il faut
// ~2 fenêtres grossières ou ~7 fenêtres simples d'affilée.
const AUDIT_WIN_MS = 10000;
const AUDIT_KILLS_SOFT = 40, AUDIT_KILLS_HARD = 120;
// Un vaisseau peut recolter 5 fois/s, un PET environ 3,3 fois/s.
// 25 % de marge absorbent les frontieres de fenetre et les paquets retardes.
const AUDIT_BOXES_SOFT = Math.ceil(AUDIT_WIN_MS / 1000 / COLLECTABLE_PICKUP_HOLD_SEC * 1.25);
const AUDIT_BOXES_HARD = AUDIT_BOXES_SOFT * 2;
const AUDIT_DMG_SOFT = 2e9, AUDIT_DMG_HARD = 4.5e9;
const AUDIT_SOFT_SCORE = 15, AUDIT_HARD_SCORE = 50;
const AUDIT_DECAY = 10, AUDIT_PUNISH_SCORE = 100;

function collectionAuditLimit(profile) {
  // Le profil provient du compte serveur, jamais du paquet de collecte.
  const petCollectors = profile?.petOwned ? Math.min(3, Math.max(1, Math.floor(Number(profile.petCollectors) || 1))) : 0;
  return Math.ceil(AUDIT_WIN_MS / 1000 * (1 / COLLECTABLE_PICKUP_HOLD_SEC
    + petCollectors / Math.max(COLLECTABLE_PICKUP_HOLD_SEC, PET_GEAR_PICK_DELAY)) * 1.25);
}

export function acRecordCollection(audit, profile) {
  audit.boxes = (Number(audit.boxes) || 0) + 1;
  // Garder les collecteurs autorises pendant la fenetre, meme si le PET est
  // coupe ou si le hangar change avant le passage de l'audit.
  audit.boxLimit = Math.max(Number(audit.boxLimit) || 0, collectionAuditLimit(profile));
}

// rates = { kills, boxes, dmg } sur la fenêtre. Retourne
// { score, punish, triggers: [libellés pour la preuve] }.
export function acAuditScore(prevScore, rates) {
  let score = Math.max(0, Math.floor(Number(prevScore) || 0));
  const triggers = [];
  const check = (value, soft, hard, label, fmt) => {
    const v = Math.max(0, Number(value) || 0);
    if (v >= hard) { score += AUDIT_HARD_SCORE; triggers.push(`${label} ${fmt(v)} (seuil ${fmt(hard)})`); }
    else if (v >= soft) { score += AUDIT_SOFT_SCORE; triggers.push(`${label} ${fmt(v)} (seuil ${fmt(soft)})`); }
  };
  const fmtInt = (v) => String(Math.round(v));
  const fmtDmg = (v) => v >= 1e9 ? `${(v / 1e9).toFixed(1)} Md` : `${Math.round(v / 1e6)} M`;
  check(rates?.kills, AUDIT_KILLS_SOFT, AUDIT_KILLS_HARD, "kills/10s", fmtInt);
  const boxLimit = Math.max(AUDIT_BOXES_SOFT, Math.min(collectionAuditLimit({ petOwned: true, petCollectors: 3 }),
    Number(rates?.boxLimit) || AUDIT_BOXES_SOFT));
  check(rates?.boxes, boxLimit, boxLimit * 2, "boxes/10s", fmtInt);
  check(rates?.dmg, AUDIT_DMG_SOFT, AUDIT_DMG_HARD, "dégâts/10s", fmtDmg);
  for (const [kind, label] of [["movement", "mouvements refusés"], ["combat", "impacts refusés"]]) {
    const count = Number(rates?.[`${kind}Rejected`]) || 0;
    const seconds = Number(rates?.[`${kind}Seconds`]) || 0;
    if (count >= 6 && seconds >= 3) {
      score += count >= 20 && seconds >= 8 ? AUDIT_HARD_SCORE : AUDIT_SOFT_SCORE;
      triggers.push(`${label} : ${fmtInt(count)}/10s sur ${fmtInt(seconds)} secondes`);
    }
  }
  if (Number(rates?.teleports) > 0) {
    score += 10;
    triggers.push(`téléports rejetés x${fmtInt(rates.teleports)}`);
  }
  if (!triggers.length) score = Math.max(0, score - AUDIT_DECAY);
  return { score, punish: score >= AUDIT_PUNISH_SCORE, triggers };
}

// Le nombre de messages ne donne jamais droit à un saut. Le budget ne
// dépend que du temps serveur et de la vitesse validée côté serveur.
// Les portails et réparations sont validés séparément par l'appelant.
export function acMoveTake(state, nx, ny, nowMs, allowance = null) {
  const keep = { x: Number(state.x) || 0, y: Number(state.y) || 0 };
  try {
    if (![nx, ny, nowMs].every(Number.isFinite)) return { ...keep, accepted: false };
    const rate = Number(state.moveSpeed);
    const refill = Number.isFinite(rate) ? Math.max(0, Math.min(SERVER_VMAX * 5, rate)) : MOVE_BUCKET_REFILL;
    let buck = Number(state.moveBuck);
    if (!Number.isFinite(buck)) buck = 20;
    const cap = refill === 0 && !(allowance?.distance > 0) ? 0
      : Math.min(MOVE_BUCKET_CAP * 2, Math.max(20, buck, (allowance?.capacitySpeed ?? refill) * MOVE_NETWORK_WINDOW_MS / 1000 + 20));
    const realDt = Math.max(0, Math.min(5, (nowMs - Number(state.moveBuckT || 0)) / 1000));
    state.moveBuckT = nowMs;
    // Une fin de bonus ne supprime pas la distance deja autorisee pour les
    // positions encore en transit. Ce credit est consomme, jamais renouvele
    // a l'ancienne vitesse. Un gel reste prioritaire (cap = 0).
    buck = Math.min(cap, buck + (allowance?.distance ?? realDt * refill));
    const dx = nx - keep.x, dy = ny - keep.y;
    const jumpDist = Math.hypot(dx, dy);
    // Meme marge fixe que la simulation du moteur client.
    // Les vitesses viennent du serveur et la dette est remboursee : aucun
    // nouveau credit par paquet, ni par activation/coupure d'aptitude.
    if (cap > 0) state.moveTimingGrace = Math.max(Number(state.moveTimingGrace) || 0,
      (allowance?.capacitySpeed ?? refill) * NETWORK_TIMING_GRACE_SEC);
    const debtLimit = cap > 0 ? 2 + (Number(state.moveTimingGrace) || 0) : 0;
    // Deux unites supplementaires absorbent l'arrondi des positions. La dette est
    // remboursee sur le paquet suivant : le spam ne multiplie pas la marge.
    if (jumpDist <= buck + debtLimit) {
      state.moveBuck = buck - jumpDist;
      state._rejPos = null;
      return { x: nx, y: ny, accepted: true };
    }
    state.moveBuck = buck; // conserver la recharge, même après un rejet
    // Mort/gel imposes par le serveur : une position encore en transit
    // n'est pas une preuve de speed hack. La correction reste obligatoire.
    if (allowance?.blockedReason) return { ...keep, accepted: false };
    acRecordViolation(state, "movement", nowMs, { reason: "Distance superieure au budget serveur",
      x: keep.x, y: keep.y, requestedX: nx, requestedY: ny,
      distance: Math.round(jumpDist), allowedDistance: Math.round(Math.max(0, buck + debtLimit)),
      speed: refill, elapsedMs: Math.round(realDt * 1000),
      ability: state._moveEffect && nowMs < state._moveEffect.until ? state._moveEffect.key : null });
    const far = jumpDist > FAR_JUMP_NO_HEAL;
    state.teleWarn = Number(state.teleWarn || 0) + 1;
    if (far) {
      if (acStrike(state, "teleStrike", 5)) acLog(`[multi:anticheat] teleport bloque ${state.pseudo} (${Math.round(jumpDist)}u, ${state.teleStrike} rejets)`);
    } else if (state.teleWarn % 20 === 1) {
      acLog(`[multi:anticheat] teleport suspect ${state.pseudo} (${Math.round(jumpDist)}u en ${Math.round(realDt * 1000)}ms)`);
    }
    return { x: keep.x, y: keep.y, accepted: false };
  } catch {
    return { x: keep.x, y: keep.y, accepted: false };
  }
}

// Un changement de maximum ne soigne pas et ne ressuscite pas. La toute
// première initialisation reçoit ses valeurs du profil serveur.
export function acPoolResize(state, hpMax, shMax) {
  const hm = Math.max(1, Number(hpMax) || 1);
  const sm = Math.max(0, Number(shMax) || 0);
  if (!state._init) {
    state.hp = hm;
    state.sh = sm;
    state._init = true;
  } else {
    state.hp = Math.max(0, Math.min(hm, Number(state.hp) || 0));
    state.sh = Math.max(0, Math.min(sm, Number(state.sh) || 0));
    state.healBudHp = Math.min(hm * HEAL_BUDGET_CAP, Math.max(0, Number(state.healBudHp) || 0));
    state.healBudSh = Math.min(sm * HEAL_BUDGET_CAP, Math.max(0, Number(state.healBudSh) || 0));
  }
  state.hpMax = hm;
  state.shMax = sm;
}

// Aucun taux extrapolé depuis une fenêtre de quelques millisecondes.
export function acAuditWindow(audit, nowMs, teleStrike = 0) {
  const elapsed = nowMs - Number(audit.t);
  if (!Number.isFinite(elapsed) || elapsed < AUDIT_WIN_MS) return null;
  const f = AUDIT_WIN_MS / elapsed;
  const rates = {
    kills: Math.max(0, Number(audit.kills) || 0) * f,
    boxes: Math.max(0, Number(audit.boxes) || 0) * f,
    boxLimit: Math.max(AUDIT_BOXES_SOFT, Number(audit.boxLimit) || 0),
    dmg: Math.max(0, Number(audit.dmg) || 0) * f,
    teleports: Math.max(0, teleStrike - (Number(audit.teleAt) || 0)),
    movementRejected: Math.max(0, Number(audit.movementRejected) || 0) * f,
    movementSeconds: (audit.movementSeconds?.length || 0) * f,
    combatRejected: Math.max(0, Number(audit.combatRejected) || 0) * f,
    combatSeconds: (audit.combatSeconds?.length || 0) * f,
  };
  const result = acAuditScore(audit.score, rates);
  Object.assign(audit, { t: nowMs, kills: 0, boxes: 0, boxLimit: 0, dmg: 0, teleAt: teleStrike, score: result.score,
    movementRejected: 0, movementSeconds: [], combatRejected: 0, combatSeconds: [] });
  return { ...result, rates };
}

// Export groupé (fin de fichier : toutes les consts sont initialisées).
export const ANTICHEAT = {
  SERVER_VMAX, FAR_JUMP_NO_HEAL, MOVE_BUCKET_CAP, MOVE_BUCKET_REFILL, MOVE_NETWORK_WINDOW_MS,
  AC_HIT_CAP, AC_HIT_REFILL, AC_DMG_CAP, AC_DMG_REFILL,
  AC_PVP_HIT_CAP, AC_PVP_HIT_REFILL, AC_PVP_DMG_CAP, AC_PVP_DMG_REFILL,
  HEAL_BUDGET_RATE, HEAL_BUDGET_CAP, REVIVE_REBASE_MAX, PET_LEASH,
  AUDIT_WIN_MS, AUDIT_KILLS_SOFT, AUDIT_KILLS_HARD,
  AUDIT_BOXES_SOFT, AUDIT_BOXES_HARD,
  AUDIT_DMG_SOFT, AUDIT_DMG_HARD,
  AUDIT_SOFT_SCORE, AUDIT_HARD_SCORE, AUDIT_DECAY, AUDIT_PUNISH_SCORE,
};
