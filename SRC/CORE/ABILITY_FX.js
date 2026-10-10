"use strict";

// SRC/CORE/ABILITY_FX.js
// Registre partagé (client + serveur, pur, sans DOM) des effets d'aptitudes
// visibles par les AUTRES joueurs (Phase 2).
//
// Principe :
// - le lanceur exécute son gameplay en local (ORBIT_ENGINE) ;
// - il émet { t:"skillUse", skill:"ability_*" } via sendSkillUse ;
// - le serveur (MULTI_SERVER) valide (vaisseau propriétaire + cooldown +
//   vivant) puis expose l'aura dans le snapshot 20 Hz via le champ `afx` ;
// - les autres clients dessinent l'aura depuis `afx` (drawNetplayRemotes).
//
// Format snapshot `afx` : tableau de [code, secondesRestantes, x, y, target].
// - code : entier court (voir ABILITY_FX_CODES), jamais l'id complet.
// - x, y : position monde arrondie (utile pour les zones posées : pods,
//   nébuleuse). 0,0 = suit le lanceur.
// - target : id réseau de la cible (marqueurs/debuffs mono-cible), "" sinon.
// - max 8 entrées par joueur, expirées purgées côté serveur.
//
// Les camouflages (cloak) ne transitent JAMAIS ici : un joueur camouflé
// reste invisible (règle cloakCpu existante, dévoilement IEM inchangé).
// Les soins instantanés (Solace, Aegis HP/SH...) ne transitent pas non
// plus : les autres voient juste les barres HP/SH bouger.

// ---------------------------------------------------------------------------
// Coups d'aptitude à dégâts massifs (one-shots) : l'enveloppe standard du
// profil (maxDamage) et les plafonds par impact (1e7 PvP / 1e8 NPC) les
// rejetteraient à tort. Le client tague ces hits (opts.ability), le serveur
// vérifie un droit FRAIS (fenêtre d'exécution ou aura active) puis contourne
// l'enveloppe — jamais les seaux anticheat (rafales) ni les portées.
// ---------------------------------------------------------------------------

// Instantanés : Tir chargé / super-chargé (100 % de la vie). Pas d'aura :
// droit = fenêtre posée au cast (charge ~3 s + beam), consommée au premier
// hit (un seul beam par cast, CD 20/18 min de toute façon).
export const EXEC_WINDOW_ABILITIES = Object.freeze([
  "ability_retiarus_chs",
  "ability_retiarus-plus_chsp",
]);
export const EXEC_WINDOW_MS = 15000;

// Canaux à exécution : singularités + bursts finaux. Droit = aura active
// (ou terminée depuis ≤ 2 s : latence cast côté client).
export const EXEC_AURA_ABILITIES = Object.freeze([
  "ability_venom",
  "ability_cyborg_singularity",
  "ability_solaris_inc",
  "ability_solaris-plus_incinerate-plus",
]);
export const EXEC_AURA_GRACE_MS = 2000;

// Plafonds absolus des hits d'exécution vérifiés (au-delà : rejet).
// PvP : couvre tout vaisseau réaliste (hpMax clampé 1e9). NPC : Cubikon et
// boss à centaines de millions.
export const EXEC_HIT_CAP_PVP = 5e8;
export const EXEC_HIT_CAP_NPC = 2e9;

const EXEC_WINDOW_SET = new Set(EXEC_WINDOW_ABILITIES);
const EXEC_AURA_SET = new Set(EXEC_AURA_ABILITIES);

export function isExecutionAbility(abilityId) {
  const key = String(abilityId || "").toLowerCase();
  return EXEC_WINDOW_SET.has(key) || EXEC_AURA_SET.has(key);
}

// Droit d'exécution pour un hit tagué (pur, testable).
// - instantanés : fenêtre consommée (single-shot) ;
// - canaux : aura active ou grâce expirée.
// Retourne true si le contournement d'enveloppe est autorisé.
export function abilityHitBypass(state, abilityId, now) {
  const key = String(abilityId || "").toLowerCase();
  if (!key || !Number.isFinite(now)) return false;
  if (EXEC_WINDOW_SET.has(key)) {
    const win = state?._execWindow;
    if (!win || String(win.key || "").toLowerCase() !== key) return false;
    if (!(Number(win.until) > now)) return false;
    try { state._execWindow = null; } catch {}
    return true;
  }
  if (EXEC_AURA_SET.has(key)) {
    const fx = state?._abilityFx;
    const aura = fx && typeof fx === "object" ? fx[key] : null;
    if (!aura) return false;
    return Number(aura.until) + EXEC_AURA_GRACE_MS > now;
  }
  return false;
}
export const ABILITY_FX_CODES = Object.freeze({
  1: "ability_admin-ultimate-cloaking", // NOTE: jamais diffusé (cloak invisible)
  2: "ability_aegis_repair-pod",
  3: "ability_basilisk_heightened-valour",
  4: "ability_basilisk_noxious-nebula",
  5: "ability_berserker_bsk",
  6: "ability_berserker_rvg",
  7: "ability_berserker_shl",
  8: "ability_citadel_draw-fire",
  9: "ability_citadel-plus_draw-fire",
  10: "ability_citadel_fortify",
  11: "ability_citadel-plus_fortify",
  12: "ability_citadel_protection",
  13: "ability_citadel-plus_protection",
  14: "ability_citadel_travel",
  15: "ability_citadel-plus_travel",
  16: "ability_yamato_travel",
  17: "ability_citadel-plus_prismatic-endurance",
  18: "ability_spectrum",
  19: "ability_spectrum-plus_prismatic-reflecting",
  20: "ability_sentinel",
  21: "ability_orcus_assimilate",
  22: "ability_solaris_inc",
  23: "ability_solaris-plus_incinerate-plus",
  24: "ability_hammerclaw_repair-pod",
  25: "ability_hammerclaw-plus_repair-pod",
  26: "ability_hammerclaw-plus_reallocate",
  27: "ability_cyborg_singularity",
  28: "ability_venom",
  29: "ability_diminisher",
  30: "ability_disruptor_ddol",
  31: "ability_disruptor_redirect",
  32: "ability_disruptor_shield-disarray",
  33: "ability_holo_self-reversal",
  34: "ability_holo_enemy-reversal",
  35: "ability_hyperion_ga",
  36: "ability_hyperion_qa",
  37: "ability_hecate_particle-beam",
  38: "ability_hecate-plus_particle-beam-plus",
  39: "ability_hecate-plus_stockpile",
  40: "ability_lightning",
  41: "ability_mimesis_hologram",
  42: "ability_mimesis_scramble",
  43: "ability_retiarus_spc",
  44: "ability_retiarus-plus_spcp",
  45: "ability_retiarus_chs",
  46: "ability_retiarus-plus_chsp",
  47: "ability_paladin_ripper",
  48: "ability_paladin_last-stand",
  49: "ability_pusat-plus_speed-sap",
  50: "ability_tempest_volt-discharge",
  51: "ability_tempest_volt-backup",
  52: "ability_tempest_voltage-link",
  53: "ability_tartarus_rapid-fire",
  54: "ability_tartarus-plus_rapid-fire-plus",
  55: "ability_tartarus_speed-boost",
  56: "ability_tartarus-plus_speed-boost-plus",
  57: "ability_spearhead_jam-x",
  58: "ability_spearhead-plus_jamx-creed",
  59: "ability_spearhead_target-marker",
  60: "ability_spearhead-plus_target-marker",
  61: "ability_orcus-plus_target-marker",
  62: "ability_spearhead-plus_neutralizing-marker",
  63: "ability_spearhead_double-minimap",
  64: "ability_spearhead-plus_recon",
  65: "ability_spearhead_ultimate-cloak", // NOTE: jamais diffusé
  66: "ability_spearhead-plus_ultimate-cloak", // NOTE: jamais diffusé
  67: "ability_aegis_hp-repair",
  68: "ability_aegis_shield-repair",
  69: "ability_hammerclaw_hp-repair",
  70: "ability_hammerclaw-plus_hp-repair",
  71: "ability_hammerclaw_shield-repair",
  72: "ability_hammerclaw-plus_shield-repair",
  73: "ability_liberator-plus_self-repair",
  74: "ability_solace",
  75: "ability_solace-plus_nano-cluster-repairer-plus",
  76: "ability_zephyr_mmt",
  77: "ability_zephyr_tbr",
  78: "ability_keres_spr",
  79: "ability_keres_sle",
  80: "ability_goliath-x_frozen-claw",
  81: "ability_mimesis_phase-out",
  82: "ability_orcus-plus_assimilate",
});

// Ids qui ne doivent JAMAIS être diffusés (invisibilité gameplay).
const NEVER_BROADCAST = new Set([
  "ability_admin-ultimate-cloaking",
  "ability_spearhead_ultimate-cloak",
  "ability_spearhead-plus_ultimate-cloak",
]);

const CODE_BY_ID = new Map();
for (const [code, id] of Object.entries(ABILITY_FX_CODES)) {
  const key = String(id).toLowerCase();
  if (!CODE_BY_ID.has(key)) CODE_BY_ID.set(key, Number(code));
}

export function abilityFxCodeFor(abilityId) {
  return CODE_BY_ID.get(String(abilityId || "").toLowerCase()) || 0;
}

export function abilityIdForFxCode(code) {
  return ABILITY_FX_CODES[Number(code)] || null;
}

// true si l'aptitude doit être visible par les autres joueurs.
// - faux pour les camouflages (invisibles par design) ;
// - faux pour les soins instantanés sans visuel persistant (les autres
//   voient les barres HP/SH, pas l'aura) ;
// - vrai pour tout le reste (halos, contours, pods, zones, rayons, boosts).
const INSTANT_HEAL_NO_AURA = new Set([
  "ability_aegis_hp-repair",
  "ability_aegis_shield-repair",
  "ability_hammerclaw_hp-repair",
  "ability_hammerclaw-plus_hp-repair",
  "ability_hammerclaw_shield-repair",
  "ability_hammerclaw-plus_shield-repair",
  "ability_liberator-plus_self-repair",
  "ability_solace",
  "ability_solace-plus_nano-cluster-repairer-plus",
]);

export function isAbilityFxBroadcastable(abilityId) {
  const key = String(abilityId || "").toLowerCase();
  if (!key.startsWith("ability_")) return false;
  if (NEVER_BROADCAST.has(key)) return false;
  if (INSTANT_HEAL_NO_AURA.has(key)) return false;
  return CODE_BY_ID.has(key);
}

// Sanitise une entrée afx brute venue du réseau.
// Retourne [code, secLeft, x, y, target] ou null si invalide.
export function sanitizeAbilityFxEntry(entry) {
  if (!Array.isArray(entry) || entry.length < 2) return null;
  const code = Math.floor(Number(entry[0]) || 0);
  if (!(code > 0) || !ABILITY_FX_CODES[code]) return null;
  const id = ABILITY_FX_CODES[code];
  if (NEVER_BROADCAST.has(String(id).toLowerCase())) return null;
  const secLeft = Math.max(0, Math.min(3600, Number(entry[1]) || 0));
  if (!(secLeft > 0)) return null;
  const x = Number.isFinite(Number(entry[2])) ? Math.max(-50000, Math.min(50000, Math.round(Number(entry[2])))) : 0;
  const y = Number.isFinite(Number(entry[3])) ? Math.max(-50000, Math.min(50000, Math.round(Number(entry[3])))) : 0;
  const target = typeof entry[4] === "string" ? entry[4].slice(0, 64) : "";
  return [code, Math.round(secLeft * 10) / 10, x, y, target];
}

// Sanitise un tableau afx complet (max 8 entrées valides).
export function sanitizeAbilityFxList(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const entry of list.slice(0, 16)) {
    const clean = sanitizeAbilityFxEntry(entry);
    if (clean && out.length < 8) out.push(clean);
  }
  return out;
}

// Prune côté serveur : garde les auras non expirées.
export function pruneAbilityFxMap(fxMap, now) {
  if (!fxMap || typeof fxMap !== "object") return [];
  const out = [];
  for (const [key, fx] of Object.entries(fxMap)) {
    const until = Number(fx?.until) || 0;
    if (!(until > now)) continue;
    const code = abilityFxCodeFor(key);
    if (!code) continue;
    if (!isAbilityFxBroadcastable(key)) continue;
    out.push([code, Math.round(((until - now) / 1000) * 10) / 10,
      Math.round(Number(fx.x) || 0), Math.round(Number(fx.y) || 0),
      typeof fx.target === "string" ? fx.target.slice(0, 64) : ""]);
    if (out.length >= 8) break;
  }
  return out;
}
