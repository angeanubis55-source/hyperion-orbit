"use strict";

// Registre descriptif des aptitudes (boutique / palette).
// But : dire pour chaque aptitude CE QU'ELLE FAIT, avec les champs prêts
// pour le branchement gameplay un par un (voir "Branchement" plus bas).
//
// Convention :
// - id       : identifiant palette (minuscules, préfixe "ability_").
// - ship     : coque concernée (les designs héritent de leur base, ils
//              n'apportent jamais de compétence en plus).
// - icon     : ASSETS/APTITUDES/ICONS (noms MAJUSCULES, extension .PNG).
// - target   : "self" | "ally" | "enemy" | "zone" | "none".
// - cooldownSec / durationSec : null = valeur à confirmer en jeu.
// - status   : "todo" (pas branchée) | "done" (branchée).
//
// Branchement (plus tard, une par une) :
//   1. passer status à "done",
//   2. renseigner cooldownSec / durationSec,
//   3. implémenter l'effet dans ORBIT_ENGINE (clic palette) en lisant
//      getAbilityInfo(id).

export const ABILITY_ICON_DIR = "ASSETS/APTITUDES/ICONS";

export function abilityIconPath(abilityId) {
  return `${ABILITY_ICON_DIR}/${String(abilityId || "").toUpperCase()}.PNG`;
}

function A(id, ship, shipLabel, name, target, description, notes = "", iconFile = "", cooldownSec = null, durationSec = null, status = "todo") {
  return Object.freeze({
    id, ship, shipLabel, name, target,
    icon: `${ABILITY_ICON_DIR}/${iconFile || String(id).toUpperCase() + ".PNG"}`,
    description, notes,
    cooldownSec,
    durationSec,
    status,
  });
}

export const ABILITIES = Object.freeze({
  // ---- Police (vaisseau admin) ----
  "ability_admin-ultimate-cloaking": Object.freeze({
    id: "ability_admin-ultimate-cloaking",
    ship: "police",
    shipLabel: "Police",
    name: "Camouflage ultime",
    target: "self",
    icon: abilityIconPath("ability_admin-ultimate-cloaking"),
    description: "30 s invisible : les NPC perdent la cible (le joueur garde sa mini-carte et son rendu 50 %). Le slot se noircit dès l'activation, la recharge de 240 s ne descend qu'à la fin ou à la coupure (attaque, mort, refresh).",
    notes: "",
    cooldownSec: 240,
    durationSec: 30,
    status: "done",
  }),

  // ---- Aegis ----
  "ability_aegis_hp-repair": A(
    "ability_aegis_hp-repair", "aegis", "Aegis", "Réparation coque", "self",
    "Restaure progressivement la coque (PV) du vaisseau."
  ),
  "ability_aegis_shield-repair": A(
    "ability_aegis_shield-repair", "aegis", "Aegis", "Réparation bouclier", "self",
    "Restaure progressivement le bouclier du vaisseau."
  ),
  "ability_aegis_repair-pod": A(
    "ability_aegis_repair-pod", "aegis", "Aegis", "Pod de réparation", "zone",
    "Déploie un pod qui soigne la coque des alliés proches."
  ),

  // ---- Basilisk ----
  "ability_basilisk_heightened-valour": A(
    "ability_basilisk_heightened-valour", "basilisk", "Basilisk", "Valeur exaltée", "self",
    "Augmente temporairement les dégâts infligés.",
    "Bonus exact à confirmer en jeu."
  ),
  "ability_basilisk_noxious-nebula": A(
    "ability_basilisk_noxious-nebula", "basilisk", "Basilisk", "Nuage toxique", "zone",
    "Lâche un nuage qui endommage et ralentit les ennemis dedans."
  ),

  // ---- Berserker ----
  "ability_berserker_bsk": A(
    "ability_berserker_bsk", "berserker", "Berserker", "Berserk", "self",
    "Plus la coque est basse, plus les dégâts sont élevés."
  ),
  "ability_berserker_rvg": A(
    "ability_berserker_rvg", "berserker", "Berserker", "Représailles", "enemy",
    "Marque l'attaquant et lui renvoie une partie des dégâts subis."
  ),
  "ability_berserker_shl": A(
    "ability_berserker_shl", "berserker", "Berserker", "Lien de bouclier", "ally",
    "Lie son bouclier à un allié pour le protéger.",
    "Effet exact du lien à confirmer en jeu."
  ),

  // ---- Citadel ----
  "ability_citadel_draw-fire": A(
    "ability_citadel_draw-fire", "citadel", "Citadel", "Attraction", "self",
    "Force les ennemis proches à le prendre pour cible."
  ),
  "ability_citadel_fortify": A(
    "ability_citadel_fortify", "citadel", "Citadel", "Fortification", "self",
    "Gros bonus de bouclier mais vaisseau immobilisé pendant l'effet."
  ),
  "ability_citadel_protection": A(
    "ability_citadel_protection", "citadel", "Citadel", "Protection", "ally",
    "Encaisse à la place d'un allié une partie des dégâts qu'il subit."
  ),
  "ability_citadel_travel": A(
    "ability_citadel_travel", "citadel", "Citadel", "Voyage", "self",
    "Boost de vitesse temporaire pour se déplacer vite."
  ),

  // ---- Citadel Plus ----
  "ability_citadel-plus_prismatic-endurance": A(
    "ability_citadel-plus_prismatic-endurance", "citadel_plus", "Citadel Plus", "Endurance prismatique", "self",
    "Renforce durablement la résistance de la coque et du bouclier.",
    "Valeurs exactes à confirmer en jeu."
  ),

  // ---- Diminisher ----
  "ability_diminisher": A(
    "ability_diminisher", "diminisher", "Diminisher", "Affaiblissement", "enemy",
    "Réduit le bouclier de la cible ennemie."
  ),

  // ---- Disruptor ----
  "ability_disruptor_ddol": A(
    "ability_disruptor_ddol", "disruptor", "Disruptor", "DDoL", "enemy",
    "Surcharge les systèmes de la cible : dégâts + perturbation.",
    "Effet exact à confirmer en jeu."
  ),
  "ability_disruptor_redirect": A(
    "ability_disruptor_redirect", "disruptor", "Disruptor", "Redirection", "self",
    "Redirige une partie des dégâts subis.",
    "Cible/effet exact à confirmer en jeu."
  ),
  "ability_disruptor_shield-disarray": A(
    "ability_disruptor_shield-disarray", "disruptor", "Disruptor", "Désordre bouclier", "enemy",
    "Désorganise le bouclier ennemi : absorption réduite.",
    "Valeurs exactes à confirmer en jeu."
  ),

  // ---- Goliath X ----
  "ability_goliath-x_frozen-claw": A(
    "ability_goliath-x_frozen-claw", "goliath_x", "Goliath X", "Griffe gelée", "enemy",
    "Inflige des dégâts et ralentit fortement la cible."
  ),

  // ---- Hammerclaw Plus ----
  "ability_hammerclaw-plus_reallocate": A(
    "ability_hammerclaw-plus_reallocate", "hammerclaw_plus", "Hammerclaw Plus", "Réallocation", "self",
    "Réalloue les ressources du vaisseau (bouclier/coque).",
    "Sens exact de la réallocation à confirmer en jeu."
  ),

  // ---- Hecate ----
  "ability_hecate_particle-beam": A(
    "ability_hecate_particle-beam", "hecate", "Hecate", "Faisceau à particules", "enemy",
    "Rayon canalisé qui inflige des dégâts continus à la cible."
  ),

  // ---- Hecate Plus ----
  "ability_hecate-plus_particle-beam-plus": A(
    "ability_hecate-plus_particle-beam-plus", "hecate_plus", "Hecate Plus", "Faisceau à particules Plus", "enemy",
    "Version renforcée du faisceau à particules."
  ),
  "ability_hecate-plus_stockpile": A(
    "ability_hecate-plus_stockpile", "hecate_plus", "Hecate Plus", "Stock", "self",
    "Accumule des charges qui renforcent le faisceau.",
    "Nombre de charges et bonus à confirmer en jeu."
  ),

  // ---- Holo ----
  "ability_holo_enemy-reversal": A(
    "ability_holo_enemy-reversal", "holo", "Holo", "Inversion ennemie", "enemy",
    "Inverse la vitesse de l'ennemi ciblé.",
    "Effet exact à confirmer en jeu."
  ),
  "ability_holo_self-reversal": A(
    "ability_holo_self-reversal", "holo", "Holo", "Inversion (soi)", "self",
    "Inverse sa propre vitesse (demi-tour éclair).",
    "Effet exact à confirmer en jeu."
  ),

  // ---- Hyperion ----
  "ability_hyperion_ga": A(
    "ability_hyperion_ga", "hyperion", "Hyperion", "Ancre gravitationnelle", "enemy",
    "Ancre la cible : vitesse réduite / immobilisée.",
    "Effet exact à confirmer en jeu."
  ),
  "ability_hyperion_qa": A(
    "ability_hyperion_qa", "hyperion", "Hyperion", "QA", "enemy",
    "Seconde capacité offensive de l'Hyperion.",
    "Effet exact à documenter en jeu."
  ),

  // ---- Keres ----
  "ability_keres_sle": A(
    "ability_keres_sle", "keres", "Keres", "SLE", "self",
    "Capacité du Keres (type vitesse/esquive).",
    "Effet exact à documenter en jeu."
  ),
  "ability_keres_spr": A(
    "ability_keres_spr", "keres", "Keres", "SPR", "self",
    "Capacité du Keres (type vitesse/esquive).",
    "Effet exact à documenter en jeu."
  ),

  // ---- Liberator Plus ----
  "ability_liberator-plus_self-repair": A(
    "ability_liberator-plus_self-repair", "liberator_plus", "Liberator Plus", "Auto-réparation", "self",
    "Régénère progressivement la coque du vaisseau."
  ),

  // ---- Lightning (Vengeance) ----
  "ability_lightning": A(
    "ability_lightning", "lightning", "Lightning", "Postcombustion", "self",
    "Boost de vitesse bref (postcombustion)."
  ),

  // ---- Mimesis ----
  "ability_mimesis_hologram": A(
    "ability_mimesis_hologram", "mimesis", "Mimesis", "Hologramme", "self",
    "Crée un leurre holographique pour tromper l'ennemi."
  ),
  "ability_mimesis_phase-out": A(
    "ability_mimesis_phase-out", "mimesis", "Mimesis", "Sortie de phase", "self",
    "Sort de phase : insensible/invisible brièvement.",
    "Effet exact à confirmer en jeu."
  ),
  "ability_mimesis_scramble": A(
    "ability_mimesis_scramble", "mimesis", "Mimesis", "Brouillage", "enemy",
    "Brouille le verrouillage de l'ennemi ciblé."
  ),

  // ---- Orcus ----
  "ability_orcus_assimilate": A(
    "ability_orcus_assimilate", "orcus", "Orcus", "Assimilation", "enemy",
    "Assimile la cible : vole bouclier/vie pour se renforcer.",
    "Valeurs exactes à confirmer en jeu."
  ),

  // ---- Paladin ----
  "ability_paladin_last-stand": A(
    "ability_paladin_last-stand", "paladin", "Paladin", "Dernier rempart", "self",
    "Quand la coque est critique : gros buff défensif temporaire."
  ),
  "ability_paladin_ripper": A(
    "ability_paladin_ripper", "paladin", "Paladin", "Éventreur", "enemy",
    "Tirs renforcés qui déchirent la cible.",
    "Effet exact à confirmer en jeu."
  ),

  // ---- Pusat Plus ----
  "ability_pusat-plus_speed-sap": A(
    "ability_pusat-plus_speed-sap", "pusat_plus", "Pusat Plus", "Siphon vitesse", "enemy",
    "Vole la vitesse de la cible pour se booster."
  ),

  // ---- Retiarus ----
  "ability_retiarus_chs": A(
    "ability_retiarus_chs", "retiarus", "Retiarus", "Tir chargé", "enemy",
    "Tir chargé : gros dégât unique sur la cible."
  ),
  "ability_retiarus_spc": A(
    "ability_retiarus_spc", "retiarus", "Retiarus", "Supercharge", "self",
    "Surcharge les canons : dégâts augmentés temporairement."
  ),

  // ---- Retiarus Plus ----
  "ability_retiarus-plus_chsp": A(
    "ability_retiarus-plus_chsp", "retiarus_plus", "Retiarus Plus", "Tir super-chargé", "enemy",
    "Version renforcée du tir chargé."
  ),
  "ability_retiarus-plus_spcp": A(
    "ability_retiarus-plus_spcp", "retiarus_plus", "Retiarus Plus", "Supercharge Plus", "self",
    "Version renforcée de la supercharge."
  ),

  // ---- Sentinel ----
  "ability_sentinel": A(
    "ability_sentinel", "sentinel", "Sentinel", "Forteresse", "self",
    "Réduit fortement les dégâts subis pendant l'effet."
  ),

  // ---- Solace ----
  "ability_solace": A(
    "ability_solace", "solace", "Solace", "Nano-réparateur", "self",
    "Soigne progressivement la coque du vaisseau."
  ),

  // ---- Solace Plus ----
  "ability_solace-plus_nano-cluster-repairer-plus": A(
    "ability_solace-plus_nano-cluster-repairer-plus", "solace_plus", "Solace Plus", "Nano-réparateur Plus", "self",
    "Version renforcée du nano-réparateur : soin coque supérieur."
  ),

  // ---- Solaris ----
  "ability_solaris_inc": A(
    "ability_solaris_inc", "solaris", "Solaris", "Incinération", "zone",
    "Incendie la zone : dégâts continus aux ennemis dedans."
  ),

  // ---- Solaris Plus ----
  "ability_solaris-plus_incinerate-plus": A(
    "ability_solaris-plus_incinerate-plus", "solaris_plus", "Solaris Plus", "Incinération Plus", "zone",
    "Version renforcée de l'incinération."
  ),

  // ---- Spearhead ----
  "ability_spearhead_double-minimap": A(
    "ability_spearhead_double-minimap", "spearhead", "Spearhead", "Recon", "self",
    "Étend la portée du radar (double minimap) temporairement."
  ),
  "ability_spearhead_jam-x": A(
    "ability_spearhead_jam-x", "spearhead", "Spearhead", "JAMX", "enemy",
    "Brouille la cible : ses missiles/verrouillages échouent.",
    "Effet exact à confirmer en jeu."
  ),
  "ability_spearhead_target-marker": A(
    "ability_spearhead_target-marker", "spearhead", "Spearhead", "Marqueur", "enemy",
    "Marque la cible : elle subit plus de dégâts."
  ),
  "ability_spearhead_ultimate-cloak": A(
    "ability_spearhead_ultimate-cloak", "spearhead", "Spearhead", "Camouflage ultime", "self",
    "30 s invisible comme le Police (rendu 50 %, NPC aveugles). Recharge 240 s, cassée par attaque.",
    "", "", 240, 30, "done"
  ),

  // ---- Spearhead Plus ----
  "ability_spearhead-plus_jamx-creed": A(
    "ability_spearhead-plus_jamx-creed", "spearhead_plus", "Spearhead Plus", "JAMX Creed", "enemy",
    "Version renforcée du brouillage JAMX."
  ),
  "ability_spearhead-plus_neutralizing-marker": A(
    "ability_spearhead-plus_neutralizing-marker", "spearhead_plus", "Spearhead Plus", "Marqueur neutralisant", "enemy",
    "Marque la cible et neutralise une partie de ses bonus.",
    "Effet exact à confirmer en jeu."
  ),
  "ability_spearhead-plus_target-marker": A(
    "ability_spearhead-plus_target-marker", "spearhead_plus", "Spearhead Plus", "Marqueur", "enemy",
    "Marque la cible : elle subit plus de dégâts (même visuel que le Spearhead de base).",
    "", "ABILITY_SPEARHEAD_TARGET-MARKER.PNG"
  ),
  "ability_spearhead-plus_ultimate-cloak": A(
    "ability_spearhead-plus_ultimate-cloak", "spearhead_plus", "Spearhead Plus", "Camouflage ultime", "self",
    "30 s invisible comme le Police (rendu 50 %, NPC aveugles). Recharge 240 s, cassée par attaque.",
    "", "ABILITY_SPEARHEAD_ULTIMATE-CLOAK.PNG", 240, 30, "done"
  ),

  // ---- Spectrum ----
  "ability_spectrum": A(
    "ability_spectrum", "spectrum", "Spectrum", "Blindage prismatique", "self",
    "Absorbe une partie des dégâts subis (prisme)."
  ),

  // ---- Spectrum Plus ----
  "ability_spectrum-plus_prismatic-reflecting": A(
    "ability_spectrum-plus_prismatic-reflecting", "spectrum_plus", "Spectrum Plus", "Réflexion prismatique", "self",
    "Absorbe et renvoie une partie des dégâts subis.",
    "Part renvoyée à confirmer en jeu."
  ),

  // ---- Tartarus ----
  "ability_tartarus_rapid-fire": A(
    "ability_tartarus_rapid-fire", "tartarus", "Tartarus", "Tir rapide", "self",
    "Augmente fortement la cadence de tir temporairement."
  ),
  "ability_tartarus_speed-boost": A(
    "ability_tartarus_speed-boost", "tartarus", "Tartarus", "Boost vitesse", "self",
    "Boost de vitesse temporaire."
  ),

  // ---- Tartarus Plus ----
  "ability_tartarus-plus_rapid-fire-plus": A(
    "ability_tartarus-plus_rapid-fire-plus", "tartarus_plus", "Tartarus Plus", "Tir rapide Plus", "self",
    "Version renforcée du tir rapide."
  ),
  "ability_tartarus-plus_speed-boost-plus": A(
    "ability_tartarus-plus_speed-boost-plus", "tartarus_plus", "Tartarus Plus", "Boost vitesse Plus", "self",
    "Version renforcée du boost vitesse."
  ),

  // ---- Tempest ----
  "ability_tempest_volt-backup": A(
    "ability_tempest_volt-backup", "tempest", "Tempest", "Secours volt", "self",
    "Réserve d'énergie : restaure bouclier/énergie en urgence.",
    "Effet exact à confirmer en jeu."
  ),
  "ability_tempest_volt-discharge": A(
    "ability_tempest_volt-discharge", "tempest", "Tempest", "Décharge", "zone",
    "Décharge électrique : dégâts de zone autour du vaisseau."
  ),
  "ability_tempest_voltage-link": A(
    "ability_tempest_voltage-link", "tempest", "Tempest", "Lien volt", "enemy",
    "Lie la cible : dégâts partagés / drainés via le lien.",
    "Effet exact à confirmer en jeu."
  ),

  // ---- Venom ----
  "ability_venom": A(
    "ability_venom", "venom", "Venom", "Singularité", "zone",
    "Crée une singularité qui attire et endommage les ennemis."
  ),

  // ---- Zephyr ----
  "ability_zephyr_mmt": A(
    "ability_zephyr_mmt", "zephyr", "Zephyr", "Élan", "self",
    "Élan : accélération brève vers l'avant.",
    "Effet exact à confirmer en jeu."
  ),
  "ability_zephyr_tbr": A(
    "ability_zephyr_tbr", "zephyr", "Zephyr", "Triple barrage", "enemy",
    "Triple salve concentrée sur la cible.",
    "Effet exact à confirmer en jeu."
  ),
});

export const ABILITY_IDS = Object.freeze(Object.keys(ABILITIES));

export function getAbilityInfo(abilityId) {
  return ABILITIES[String(abilityId || "").toLowerCase()] || null;
}

export function getAbilitiesForShip(ship) {
  const want = String(ship || "").toLowerCase();
  return ABILITY_IDS.map((id) => ABILITIES[id]).filter((a) => a.ship === want);
}
