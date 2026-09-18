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
//   4. ajouter // ✅ en fin de ligne (marqueur des aptitudes branchées).

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
    status: "done", // ✅
  }),

  // ---- Aegis ----
  "ability_aegis_hp-repair": A(
    "ability_aegis_hp-repair", "aegis", "Aegis", "Réparation coque", "self",
    "+280k PV allié (140k soi) répartis sur 7 s (40k/20k par s), +X vert chaque seconde.",
    "", "", 90, 7, "done" // ✅
  ),
  "ability_aegis_shield-repair": A(
    "ability_aegis_shield-repair", "aegis", "Aegis", "Réparation bouclier", "self",
    "+125k bouclier allié (75k soi) répartis sur 5 s (25k/15k par s), +X bleu chaque seconde.",
    "", "", 30, 5, "done" // ✅
  ),
  "ability_aegis_repair-pod": A(
    "ability_aegis_repair-pod", "aegis", "Aegis", "Pod de réparation", "zone",
    "Pose le pod sous le vaisseau (position au clic) : 10 s, halo vert rayon 400, +18k PV/s aux vaisseaux dedans (180k max). Le pod de la coque est caché jusqu'à la fin de la recharge de 120 s.",
    "", "", 120, 10, "done" // ✅
  ),

  // ---- Basilisk ----
  "ability_basilisk_heightened-valour": A(
    "ability_basilisk_heightened-valour", "basilisk", "Basilisk", "Valeur exaltée", "self",
    "+0,5 % de dégâts par seconde pendant 30 s, plafonné +10 % (lasers). Sans visuel. Recharge 100 s.",
    "", "", 100, 30, "done" // ✅
  ),
  "ability_basilisk_noxious-nebula": A(
    "ability_basilisk_noxious-nebula", "basilisk", "Basilisk", "Nuage toxique", "zone",
    "Posée sous le vaisseau : 10 s, sprite 500x291 joué en boucle. 14000 dégâts/s à TOUT LE MONDE sur le sprite (collision au pixel, plus de rayon : NPC, escortes, nous via hurtPlayer, notre PET), +5 % exponentiel par seconde (stack par cible, retombe dehors). Fondu d'apparition/disparition. Recharge 180 s.",
    "", "", 180, 10, "done" // ✅
  ),

  // ---- Berserker ----
  "ability_berserker_bsk": A(
    "ability_berserker_bsk", "berserker", "Berserker", "Berserk", "self",
    "30 s : tremblement croissant + contour orange pulsé de plus en plus vite (style ubers) + sprite. +1 % dégâts par 1 % PV manquant (lasers). Recharge 60 s.",
    "", "", 60, 30, "done" // ✅
  ),
  "ability_berserker_rvg": A(
    "ability_berserker_rvg", "berserker", "Berserker", "Représailles", "enemy",
    "6 s : 100 % des dégâts renvoyés à chaque attaquant (pas de lock requis, rien subi ni affiché sur nous) + contour cyan évidé, vitesse -5 %. Recharge 180 s.",
    "", "", 180, 6, "done" // ✅
  ),
  "ability_berserker_shl": A(
    "ability_berserker_shl", "berserker", "Berserker", "Lien de bouclier", "enemy",
    "60 s : les dégâts infligés au bouclier de la cible verrouillée sont encaissés par vous. Cassé hors de portée, annulable à tout moment.",
    "", "", 10, 60, "done" // ✅
  ),

  // ---- Citadel ----
  "ability_citadel_draw-fire": A(
    "ability_citadel_draw-fire", "citadel", "Citadel", "Attraction", "self",
    "Force les ennemis proches à le prendre pour cible.",
    "", "", 60, 5, "done" // ✅
  ),
  "ability_citadel_fortify": A(
    "ability_citadel_fortify", "citadel", "Citadel", "Fortification", "self",
    "-80 % de dégâts subis, vitesse plafonnée à 200, pas de saut.",
    "", "", 360, 10, "done" // ✅
  ),
  "ability_citadel_protection": A(
    "ability_citadel_protection", "citadel", "Citadel", "Protection", "ally",
    "Encaisse à la place d'un allié une partie des dégâts qu'il subit.",
    "", "", 60, 10, "done" // ✅
  ),
  "ability_citadel_travel": A(
    "ability_citadel_travel", "citadel", "Citadel", "Voyage", "self",
    "Boost de vitesse temporaire pour se déplacer vite.",
    "", "", 60, 5, "done" // ✅
  ),

  // ---- Citadel Plus ----
  "ability_citadel-plus_prismatic-endurance": A(
    "ability_citadel-plus_prismatic-endurance", "citadel_plus", "Citadel Plus", "Endurance prismatique", "self",
    "Renforce durablement la résistance de la coque et du bouclier.",
    "Valeurs exactes à confirmer en jeu.", "", 200, 25, "done" // ✅
  ),
  "ability_citadel-plus_draw-fire": A(
    "ability_citadel-plus_draw-fire", "citadel_plus", "Citadel Plus", "Attraction", "self",
    "Force les ennemis proches à le prendre pour cible.",
    "Héritée du Citadel de base.", "ABILITY_CITADEL_DRAW-FIRE.PNG", 60, 5, "done" // ✅
  ),
  "ability_citadel-plus_fortify": A(
    "ability_citadel-plus_fortify", "citadel_plus", "Citadel Plus", "Fortification", "self",
    "-80 % de dégâts subis, vitesse plafonnée à 200, pas de saut.",
    "Héritée du Citadel de base.", "ABILITY_CITADEL_FORTIFY.PNG", 360, 10, "done" // ✅
  ),
  "ability_citadel-plus_protection": A(
    "ability_citadel-plus_protection", "citadel_plus", "Citadel Plus", "Protection", "ally",
    "Encaisse à la place d'un allié une partie des dégâts qu'il subit.",
    "Héritée du Citadel de base.", "ABILITY_CITADEL_PROTECTION.PNG", 60, 10, "done" // ✅
  ),
  "ability_citadel-plus_travel": A(
    "ability_citadel-plus_travel", "citadel_plus", "Citadel Plus", "Voyage", "self",
    "Boost de vitesse temporaire pour se déplacer vite.",
    "Héritée du Citadel de base.", "ABILITY_CITADEL_TRAVEL.PNG", 60, 5, "done" // ✅
  ),

  // ---- Cyborg ----
  // Singularité II : dégâts croissants directs en coque (6900 +300/hit, cap 13600,
  // ~315k sur 30 s). Sprite NPC_SINGULARITY_CYBORG sur la cible. EMP/JAMX plus tard.
  "ability_cyborg_singularity": A(
    "ability_cyborg_singularity", "cyborg", "Cyborg", "Singularité II", "enemy",
    "Dégâts croissants directs en coque sur la cible lockée : 6900 +300/hit (cap 13600) pendant 30 s.",
    "Icône Venom réutilisée (pas d'icône Cyborg).", "ABILITY_VENOM.PNG", 270, 30, "done" // ✅
  ),

  // ---- Diminisher ----
  "ability_diminisher": A(
    "ability_diminisher", "diminisher", "Diminisher", "Affaiblissement", "enemy",
    "La cible verrouillée : son bouclier prend +50 % de dégâts de nos lasers pendant 15 s. Contrecoup : -30 % de notre bouclier à la fin.",
    "", "", 90, 15, "done" // ✅
  ),

  // ---- Disruptor ----
  "ability_disruptor_ddol": A(
    "ability_disruptor_ddol", "disruptor", "Disruptor", "DDoL", "enemy",
    "Dérègle le cooldown des lasers de la cible verrouillée (3 à 5 s aléatoires) pendant 10 s.",
    "", "", 60, 10, "done"
  ), // ✅
  "ability_disruptor_redirect": A(
    "ability_disruptor_redirect", "disruptor", "Disruptor", "Redirection", "self",
    "Pendant 5 s, tous les dégâts subis partent sur la cible verrouillée (rien subi), ses lasers sont désactivés 4 s.",
    "", "", 40, 5, "done"
  ), // ✅
  "ability_disruptor_shield-disarray": A(
    "ability_disruptor_shield-disarray", "disruptor", "Disruptor", "Désordre bouclier", "enemy",
    "Bouclier max de la cible -50 % pendant 5 s (actuel écrêté), le retiré revient par-dessus à la fin.",
    "", "", 120, 5, "done"
  ), // ✅

  // ---- Goliath X ----
  "ability_goliath-x_frozen-claw": A(
    "ability_goliath-x_frozen-claw", "goliath_x", "Goliath X", "Griffe gelée", "enemy",
    "Envoie gratuitement une R-IC3 sur la cible verrouillée (gel 2 s). Passif : +2 % dégâts laser, +2 % XP.",
    "", "", 90, 2, "done"
  ), // ✅

  // ---- Hammerclaw (base, officiel : mêmes 3 soins que l'Aegis en plus fort) ----
  "ability_hammerclaw_hp-repair": A(
    "ability_hammerclaw_hp-repair", "hammerclaw", "Hammerclaw", "Réparation coque", "ally",
    "Soigne un allié jusqu'à 350k PV (175k pour soi) répartis sur 7 s.",
    "", "ABILITY_AEGIS_HP-REPAIR.PNG", 150, 7, "done"
  ), // ✅
  "ability_hammerclaw_shield-repair": A(
    "ability_hammerclaw_shield-repair", "hammerclaw", "Hammerclaw", "Réparation bouclier", "ally",
    "Répare le bouclier d'un allié jusqu'à 180k (120k pour soi) répartis sur 3 s.",
    "", "ABILITY_AEGIS_SHIELD-REPAIR.PNG", 60, 3, "done"
  ), // ✅
  "ability_hammerclaw_repair-pod": A(
    "ability_hammerclaw_repair-pod", "hammerclaw", "Hammerclaw", "Pod de réparation", "zone",
    "Pose le pod : 10 s, +175k PV max aux vaisseaux dedans.",
    "", "ABILITY_AEGIS_REPAIR-POD.PNG", 160, 10, "done"
  ), // ✅

  // ---- Hammerclaw Plus ----
  "ability_hammerclaw-plus_reallocate": A(
    "ability_hammerclaw-plus_reallocate", "hammerclaw_plus", "Hammerclaw Plus", "Réallocation", "self",
    "Pendant 10 s, 20 % des dégâts infligés partent en pot commun, distribué en PV à la fin (nous + escortes à 700).",
    "", "", 180, 10, "done"
  ), // ✅
  "ability_hammerclaw-plus_hp-repair": A(
    "ability_hammerclaw-plus_hp-repair", "hammerclaw_plus", "Hammerclaw Plus", "Réparation coque", "ally",
    "Soigne un allié jusqu'à 450k PV (225k pour soi) répartis sur 6 s.",
    "Héritée du Hammerclaw de base (montants/durée Plus).", "ABILITY_AEGIS_HP-REPAIR.PNG", 160, 6, "done"
  ), // ✅
  "ability_hammerclaw-plus_shield-repair": A(
    "ability_hammerclaw-plus_shield-repair", "hammerclaw_plus", "Hammerclaw Plus", "Réparation bouclier", "ally",
    "Répare le bouclier d'un allié jusqu'à 240k (150k pour soi) répartis sur 3 s.",
    "Héritée du Hammerclaw de base (montants Plus).", "ABILITY_AEGIS_SHIELD-REPAIR.PNG", 80, 3, "done"
  ), // ✅
  "ability_hammerclaw-plus_repair-pod": A(
    "ability_hammerclaw-plus_repair-pod", "hammerclaw_plus", "Hammerclaw Plus", "Pod de réparation", "zone",
    "Pose le pod : 8 s, rayon 600, +200k PV max aux vaisseaux dedans.",
    "Héritée du Hammerclaw de base (montant/durée/rayon Plus).", "ABILITY_AEGIS_REPAIR-POD.PNG", 60, 8, "done"
  ), // ✅

  // ---- Hecate ----
  "ability_hecate_particle-beam": A(
    "ability_hecate_particle-beam", "hecate", "Hecate", "Faisceau à particules", "enemy",
    "Canal sur la cible lockée : 8050 + 6000 dégâts/coque par hit pendant 5 s, vitesse -10 %.",
    "", "", 85, 5, "done"
  ), // ✅

  // ---- Hecate Plus ----
  "ability_hecate-plus_particle-beam-plus": A(
    "ability_hecate-plus_particle-beam-plus", "hecate_plus", "Hecate Plus", "Faisceau à particules Plus", "enemy",
    "Canal sur la cible lockée : 10000 + 6000 dégâts/coque par hit pendant 6 s, vitesse -10 %.",
    "", "", 120, 6, "done"
  ), // ✅
  "ability_hecate-plus_stockpile": A(
    "ability_hecate-plus_stockpile", "hecate_plus", "Hecate Plus", "Stockpile", "self",
    "Tuer un PNJ ajoute une charge à Stockpile (max 10). Tant que Stockpile n'est pas activé : portée +5 par charge. À l'activation : force du bouclier augmentée pendant 10 s (+0,2 % par charge, chaque charge donnant 0,2 % de plus que la précédente, soit 11 % à 10 charges) + sprite HECATE_PLUS_STOCKPILE sur le vaisseau. Portée réinitialisée à l'origine et charges remises à 0.",
    "", "", 0, 10, "done"
  ), // ✅

  // ---- Holo ----
  "ability_holo_enemy-reversal": A(
    "ability_holo_enemy-reversal", "holo", "Holo", "Inversion ennemie", "enemy",
    "Cible verrouillée : sprite Holo sur elle, -10 % vitesse et +10 % dégâts subis pendant 15 s. CD 15 s.",
    "", "", 15, 15, "done" // ✅
  ),
  "ability_holo_self-reversal": A(
    "ability_holo_self-reversal", "holo", "Holo", "Inversion (soi)", "self",
    "+10 % dégâts laser et +10 % vitesse pendant 15 s. Sprite Holo sur notre vaisseau. CD 15 s.",
    "", "", 15, 15, "done" // ✅
  ),

  // ---- Hyperion ----
  "ability_hyperion_ga": A(
    "ability_hyperion_ga", "hyperion", "Hyperion", "Ancre gravitationnelle", "enemy",
    "Tir SHOT 100% touché sur cible verrouillée, puis START + CONTINUED (dès frame 26) + FINISH : 10 s au total. Cible ralentie 80% (40% en battle).",
    "", "", 300, 10, "done" // ✅
  ),
  // QA : salve classique en munition X0 (gratuite) : dégâts x6 x2.5, toujours critique.
  "ability_hyperion_qa": A(
    "ability_hyperion_qa", "hyperion", "Hyperion", "QA", "enemy",
    "Salve classique en X0 (gratuite) : dégâts x6 x2.5, coup critique garanti.",
    "CD à confirmer.", "", 90, 0, "done" // ✅
  ),

  // ---- Keres ----
  "ability_keres_sle": A(
    "ability_keres_sle", "keres", "Keres", "Sleight", "enemy",
    "Lock suffit (aucune limite de distance) : dash x5 jusqu'à 200 de la cible. Réacteurs remplacés par le speed buff Citadel.",
    "CD à confirmer.", "", 120, 0, "done" // ✅
  ),
  "ability_keres_spr": A(
    "ability_keres_spr", "keres", "Keres", "Spread", "enemy",
    "Cible lockée ralentie 20% 10s, contour vert locator clignotant. Contagion à 300 : 10s reparties, max 10, pas de réinfection même cast.",
    "", "", 300, 10, "done" // ✅
  ),

  // ---- Liberator Plus ----
  "ability_liberator-plus_self-repair": A(
    "ability_liberator-plus_self-repair", "liberator_plus", "Liberator Plus", "Auto-réparation", "self",
    "Restaure 35.000 HP/s pendant 10 s (350.000 max). Sprite HEAL_EFFECT sur le vaisseau.",
    "", "", 100, 10, "done" // ✅
  ),

  // ---- Lightning (Vengeance) ----
  "ability_lightning": A(
    "ability_lightning", "lightning", "Lightning", "Postcombustion", "self",
    "Boost vitesse x2 pendant 10 s. Réacteurs remplacés par le speed buff (comme le Voyage Citadel).",
    "", "", 60, 10, "done" // ✅
  ),

  // ---- Mimesis ----
  "ability_mimesis_hologram": A(
    "ability_mimesis_hologram", "mimesis", "Mimesis", "Hologramme", "self",
    "Son puis fausse explosion par-dessus nous : 4 clones identiques qui restent près (formation drones live) et explosent à 3 s. Locks sur nous effacés.",
    "CD à confirmer.", "", 300, 3, "done" // ✅
  ),
  "ability_mimesis_phase-out": A(
    "ability_mimesis_phase-out", "mimesis", "Mimesis", "Sortie de phase", "self",
    "Téléportation 500u aléatoire (hors radiation). Interdit gates/LoW/UBA/pirates. Sans animation.",
    "", "", 300, 0, "done" // ✅
  ),
  "ability_mimesis_scramble": A(
    "ability_mimesis_scramble", "mimesis", "Mimesis", "Brouillage", "self",
    "+65% évasion, +25% dégâts laser, +25% vitesse, -5% shield max/s. Coupé à 0 shield ou change config. Vaisseau clignotant.",
    "", "", 300, 0, "done" // ✅
  ),

  // ---- Orcus ----
  "ability_orcus_assimilate": A(
    "ability_orcus_assimilate", "orcus", "Orcus", "Assimilation", "self",
    "80% de tous les dégâts reçus convertis en PV pendant 20 s. Sprite Orcus par-dessus le vaisseau.",
    "", "", 540, 20, "done" // ✅
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
    "", "", 240, 30, "done" // ✅
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
    "", "ABILITY_SPEARHEAD_ULTIMATE-CLOAK.PNG", 240, 30, "done" // ✅
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
